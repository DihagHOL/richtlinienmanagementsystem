/**
 * Rollen, Zielgruppen & Zugriffskonfiguration
 * ===========================================
 * Berechtigungs-Rollen (App-intern):
 *   - admin       → Richtlinien verwalten, Compliance, Einstellungen
 *   - genehmiger  → Richtlinien freigeben (InReview → Veröffentlicht)
 *   - mitarbeiter → lesen, bestätigen, Quiz (jede:r angemeldete Nutzer:in)
 *
 * Unternehmens-Rollen (Zielgruppen für Richtlinien):
 *   Frei definierbare Rollen/Abteilungen. Die effektive Rolle eines Mitarbeiters
 *   ergibt sich aus seiner Azure-AD-Abteilung (`department`) PLUS manuell in den
 *   Einstellungen zugeordneten Rollen ("beides kombiniert").
 *
 * Laufende Konfiguration: access-config.json in SharePoint, gepflegt über Einstellungen.
 */

const ACCESS_CONFIG_DEFAULT = {
  admins:     ['pruefer@dihag.com', 'pruefer@dihag.com'],
  genehmiger: ['pruefer@dihag.com', 'pruefer@dihag.com'],
  roles:      null,   // null → COMPANY_ROLES_DEFAULT
  userRoles:  {},     // { "user@dihag.com": ["IT", "Qualitätsmanagement"] }
  // Reiter-Berechtigungen (zusätzlich zu den Standard-Rollenrechten, rein additiv):
  //   { "<view>": { lesen: ["upn"|"Rolle", …], schreiben: […] } }
  reiterRechte: {},
  // ── Mitbestimmung (Betriebsverfassung) ──
  kbrMail:          '',        // Konzernbetriebsrat – Empfänger für die Mitbestimmungsprüfung
  brMails:          {},        // { Werk-Code → BR-Mail }, z. B. { SHB: 'br@…' }
  // ── C-Level-Audit-Bericht ──
  clevelMail:       '',        // Empfänger des C-Level-/Management-Berichts (Komma-/Semikolon-Liste möglich)
  // ── Genehmigungsverfahren ──
  pruefer:          [],        // Konformitätsprüfer (UPNs)
  geschaeftsleitung: [],       // Freigeber / Geschäftsleitung (UPNs)
  konformSchwelle:  'alle',    // 'alle' | 'einer'  – wann gilt eine Richtlinie als konform
  freigabeSchwelle: 'einer',   // 'alle' | 'einer'  – wie viele GL müssen freigeben
  eskalationMail:   '',        // Ersatz-Empfänger bei keiner Antwort
  // Power-Automate-Genehmigung: welche Etappen laufen über PA (App schickt dort KEINE Mail)
  //   'aus'  → alles aus der App · 'gl' → nur Freigabe (GL) über PA · 'alle' → Prüfung + Freigabe über PA
  genehmigungPAScope: 'aus',
  genehmigungPA:    false,     // Legacy-Spiegel (true == PA aktiv); aus genehmigungPAScope abgeleitet
  // ── Erinnerungen (vom GitHub-Actions-Cron gelesen) ──
  erinnerungenAktiv:        true,  // Erinnerungen senden ja/nein
  mailSender:               '',    // Absender-Postfach (sonst GitHub-Secret MAIL_SENDER)
  erinnerungErsteNachTagen: 7,     // erste Erinnerung nach X Tagen
  erinnerungDannAlleTage:   3,     // danach alle Y Tage
  eskalationAbTagen:        14,    // ab Z Tagen zusätzlich an eskalationMail
};

/* Gängige Unternehmensrollen/Abteilungen (Default, in Einstellungen anpassbar). */
const COMPANY_ROLES_DEFAULT = [
  'Geschäftsführung', 'IT', 'Personal', 'Finanzen & Buchhaltung',
  'Einkauf', 'Vertrieb', 'Produktion', 'Qualitätsmanagement',
  'Logistik & Lager', 'Instandhaltung', 'Arbeitssicherheit', 'Verwaltung',
];

const ZIELGRUPPE_ALLE = 'ALLE';

/* Werke der DIHAG-Gruppe – je Werk kann in den Einstellungen eine
   Betriebsrats-Mailadresse hinterlegt werden (Mitbestimmung je Richtlinie). */
const MITBESTIMMUNG_WERKE = ['SHB', 'WGC', 'SCH', 'EIS', 'DSO', 'ZAI', 'LEG', 'MEG', 'EWA'];

let _runtimeConfig = null;
let _myRolesCache = null;

function _cfg() { return _runtimeConfig || ACCESS_CONFIG_DEFAULT; }

/** Laufzeit-Config aus SharePoint laden (einmalig nach Login; Fehler → Default). */
async function loadRuntimeAccessConfig() {
  if (_runtimeConfig) return;
  try {
    const cfg = await spLoadAccessConfig();
    if (cfg && typeof cfg === 'object') {
      _runtimeConfig = {
        ...cfg,   // unbekannte Felder (z.B. ki* vom KI-Dashboard) durchschleifen – Speichern darf sie nicht löschen
        admins:     Array.isArray(cfg.admins) ? cfg.admins : [],
        genehmiger: Array.isArray(cfg.genehmiger) ? cfg.genehmiger : [],
        roles:      Array.isArray(cfg.roles) && cfg.roles.length ? cfg.roles : null,
        userRoles:  (cfg.userRoles && typeof cfg.userRoles === 'object') ? cfg.userRoles : {},
        reiterRechte: (cfg.reiterRechte && typeof cfg.reiterRechte === 'object') ? cfg.reiterRechte : {},
        probelaufUser: Array.isArray(cfg.probelaufUser) ? cfg.probelaufUser : [],
        kbrMail:           typeof cfg.kbrMail === 'string' ? cfg.kbrMail : '',
        brMails:           (cfg.brMails && typeof cfg.brMails === 'object' && !Array.isArray(cfg.brMails)) ? cfg.brMails : {},
        clevelMail:        typeof cfg.clevelMail === 'string' ? cfg.clevelMail : '',
        pruefer:           Array.isArray(cfg.pruefer) ? cfg.pruefer : [],
        geschaeftsleitung: Array.isArray(cfg.geschaeftsleitung) ? cfg.geschaeftsleitung : [],
        konformSchwelle:   cfg.konformSchwelle === 'einer' ? 'einer' : 'alle',
        freigabeSchwelle:  cfg.freigabeSchwelle === 'alle' ? 'alle' : 'einer',
        eskalationMail:    typeof cfg.eskalationMail === 'string' ? cfg.eskalationMail : '',
        // Neuer 3-stufiger Schalter; Migration vom alten Boolean (true == beide Etappen)
        genehmigungPAScope: (cfg.genehmigungPAScope === 'gl' || cfg.genehmigungPAScope === 'alle')
          ? cfg.genehmigungPAScope : (cfg.genehmigungPA === true ? 'alle' : 'aus'),
        genehmigungPA:     cfg.genehmigungPA === true || cfg.genehmigungPAScope === 'gl' || cfg.genehmigungPAScope === 'alle',
        erinnerungenAktiv:        cfg.erinnerungenAktiv !== false,
        mailSender:               typeof cfg.mailSender === 'string' ? cfg.mailSender : '',
        erinnerungErsteNachTagen: _posInt(cfg.erinnerungErsteNachTagen, 7),
        erinnerungDannAlleTage:   _posInt(cfg.erinnerungDannAlleTage, 3),
        eskalationAbTagen:        _posInt(cfg.eskalationAbTagen, 14),
      };
    }
  } catch (e) {
    console.info('[access] Keine SP-Config gefunden, nutze Default.');
  }
}

function getAccessConfig() {
  const c = _cfg();
  return {
    ...JSON.parse(JSON.stringify(c)),   // alle Felder mitnehmen (inkl. ki* vom KI-Dashboard)
    probelaufUser: [...(c.probelaufUser || [])],
    admins:     [...(c.admins || [])],
    genehmiger: [...(c.genehmiger || [])],
    roles:      [...getCompanyRoles()],
    userRoles:  JSON.parse(JSON.stringify(c.userRoles || {})),
    reiterRechte: JSON.parse(JSON.stringify(c.reiterRechte || {})),
    kbrMail:           c.kbrMail || '',
    brMails:           (c.brMails && typeof c.brMails === 'object') ? JSON.parse(JSON.stringify(c.brMails)) : {},
    clevelMail:        c.clevelMail || '',
    pruefer:           [...(c.pruefer || [])],
    geschaeftsleitung: [...(c.geschaeftsleitung || [])],
    konformSchwelle:   c.konformSchwelle || 'alle',
    freigabeSchwelle:  c.freigabeSchwelle || 'einer',
    eskalationMail:    c.eskalationMail || '',
    genehmigungPAScope: c.genehmigungPAScope || (c.genehmigungPA ? 'alle' : 'aus'),
    genehmigungPA:     c.genehmigungPA === true || c.genehmigungPAScope === 'gl' || c.genehmigungPAScope === 'alle',
    erinnerungenAktiv:        c.erinnerungenAktiv !== false,
    mailSender:               c.mailSender || '',
    erinnerungErsteNachTagen: _posInt(c.erinnerungErsteNachTagen, 7),
    erinnerungDannAlleTage:   _posInt(c.erinnerungDannAlleTage, 3),
    eskalationAbTagen:        _posInt(c.eskalationAbTagen, 14),
  };
}

/** Positive Ganzzahl mit Fallback. */
function _posInt(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : def; }

/* ── Genehmigungsverfahren: Rollen & Schwellen ── */
function isPruefer(upn)           { return _has(_cfg().pruefer, upn); }
function isGeschaeftsleitung(upn) { return _has(_cfg().geschaeftsleitung, upn); }
function isCurrentUserPruefer()           { return isPruefer(_currentUpn()); }
function isCurrentUserGeschaeftsleitung() { return isGeschaeftsleitung(_currentUpn()); }
function getPruefer()           { return [...(_cfg().pruefer || [])]; }
function getGeschaeftsleitung() { return [...(_cfg().geschaeftsleitung || [])]; }
function getIsmsVerantwortlich(){ return [...(_cfg().ismsVerantwortlich || [])]; }   // Empfänger für Änderungsvorschläge
function getVorschlagEmpfaenger(){ return [...(_cfg().vorschlagEmpfaenger || [])]; }  // zusätzliche, eigene Empfänger für Vorschläge
function getKonformSchwelle()   { return _cfg().konformSchwelle || 'alle'; }
function getFreigabeSchwelle()  { return _cfg().freigabeSchwelle || 'einer'; }
/* ── Mitbestimmung: KBR- und je-Werk-BR-Mailadressen ── */
function getKbrMail()           { return _cfg().kbrMail || ''; }
function getBrMails()           { const m = _cfg().brMails; return (m && typeof m === 'object') ? { ...m } : {}; }
function getBrMail(werk)        { return getBrMails()[werk] || ''; }
/* ── C-Level-Audit-Bericht: Empfänger ── */
function getClevelMail()        { return _cfg().clevelMail || ''; }
/* ── Power-Automate-Genehmigung: Umfang je Etappe ── */
function getGenehmigungPAScope() {
  const s = _cfg().genehmigungPAScope;
  if (s === 'gl' || s === 'alle') return s;
  return _cfg().genehmigungPA === true ? 'alle' : 'aus';
}
/** Freigabe (Geschäftsleitung) läuft über Power Automate? (gl oder alle) */
function isPAFreigabe()  { const s = getGenehmigungPAScope(); return s === 'gl' || s === 'alle'; }
/** Konformitätsprüfung läuft über Power Automate? (nur bei „alle") */
function isPAPruefung()  { return getGenehmigungPAScope() === 'alle'; }
/* Hinweis: Die Einstellungen zu Erinnerungen/Eskalation (erinnerungenAktiv,
   mailSender, erinnerungErsteNachTagen, erinnerungDannAlleTage, eskalationAbTagen,
   eskalationMail) werden hier gepflegt, aber ausschließlich vom nächtlichen
   GitHub-Actions-Job gelesen (scripts/erinnerungen.mjs liest die Config direkt).
   Deshalb gibt es dafür bewusst keine Getter in der App. */

/* ── Pro-Richtlinie-Überschreibung: Prüfer/Schwelle je Richtlinie, sonst global ──
   Eine Richtlinie kann eigene Konformitätsprüfer haben (p.pruefKonfig.pruefer).
   Ist dort nichts hinterlegt, gilt die globale Prüfer-/Schwellen-Konfiguration. */
function getPolicyPruefer(p) {
  const o = (p && p.pruefKonfig && Array.isArray(p.pruefKonfig.pruefer)) ? p.pruefKonfig.pruefer.filter(Boolean) : [];
  return o.length ? [...o] : getPruefer();
}
function getPolicyKonformSchwelle(p) {
  const s = p && p.pruefKonfig && p.pruefKonfig.schwelle;
  return (s === 'alle' || s === 'einer') ? s : getKonformSchwelle();
}
function policyHasPrueferOverride(p) {
  return !!(p && p.pruefKonfig && Array.isArray(p.pruefKonfig.pruefer) && p.pruefKonfig.pruefer.filter(Boolean).length);
}
function isPrueferForPolicy(p, upn)      { return _has(getPolicyPruefer(p), upn); }
function isCurrentUserPrueferForPolicy(p) { return isPrueferForPolicy(p, _currentUpn()); }

/* Analog für die Freigabe (Geschäftsleitung): eigene Freigeber je Richtlinie
   (p.freigabeKonfig.freigeber) haben Vorrang, sonst die globale GL-Konfiguration. */
function getPolicyGeschaeftsleitung(p) {
  const o = (p && p.freigabeKonfig && Array.isArray(p.freigabeKonfig.freigeber)) ? p.freigabeKonfig.freigeber.filter(Boolean) : [];
  return o.length ? [...o] : getGeschaeftsleitung();
}
function getPolicyFreigabeSchwelle(p) {
  const s = p && p.freigabeKonfig && p.freigabeKonfig.schwelle;
  return (s === 'alle' || s === 'einer') ? s : getFreigabeSchwelle();
}
function policyHasFreigabeOverride(p) {
  return !!(p && p.freigabeKonfig && Array.isArray(p.freigabeKonfig.freigeber) && p.freigabeKonfig.freigeber.filter(Boolean).length);
}
function isGeschaeftsleitungForPolicy(p, upn)      { return _has(getPolicyGeschaeftsleitung(p), upn); }
function isCurrentUserGeschaeftsleitungForPolicy(p) { return isGeschaeftsleitungForPolicy(p, _currentUpn()); }

/** Config im Speicher aktualisieren (nach dem Speichern in SP). */
function setRuntimeConfig(cfg) { _runtimeConfig = cfg; _myRolesCache = null; }

/** Verfügbare Unternehmensrollen (aus Config oder Default). */
function getCompanyRoles() {
  const r = _cfg().roles;
  return (Array.isArray(r) && r.length) ? r : [...COMPANY_ROLES_DEFAULT];
}

/* ── Berechtigungs-Checks ── */

function _has(list, upn) {
  const u = (upn || '').toLowerCase().trim();
  return (list || []).some(x => String(x).toLowerCase().trim() === u);
}

function isAdmin(upn)      { return _has(_cfg().admins, upn); }
function isGenehmiger(upn) { return _has(_cfg().genehmiger, upn) || isAdmin(upn); }

/* ── Probelauf ──
   Eng gefasst, weil ein Probelauf echte Einträge anlegt und echte E-Mails
   versendet. Admins sind immer freigeschaltet, weitere Personen über die
   Einstellungen. */
function getProbelaufUser()  { return [...(_cfg().probelaufUser || [])]; }
function darfProbelauf(upn)  { const u = upn || _currentUpn(); return isAdmin(u) || _has(_cfg().probelaufUser, u); }

function _currentUpn() {
  const acc = typeof getAuthUser === 'function' ? getAuthUser() : null;
  return acc ? acc.username : '';
}
function isCurrentUserAdmin()      { return isAdmin(_currentUpn()); }
function isCurrentUserGenehmiger() { return isGenehmiger(_currentUpn()); }
/** Darf Änderungsvorschläge bearbeiten: Admins + ISMS-Verantwortliche + Vorschlags-Empfänger. */
function isCurrentUserProposalManager() {
  const u = _currentUpn();
  return isAdmin(u) || _has(_cfg().ismsVerantwortlich, u) || _has(_cfg().vorschlagEmpfaenger, u);
}

/* ── Unternehmens-Rollen / Zielgruppen ── */

/** Manuell zugeordnete Rollen für einen UPN (case-insensitive). */
function manualRolesFor(upn) {
  const map = _cfg().userRoles || {};
  const u = (upn || '').toLowerCase().trim();
  for (const k of Object.keys(map)) {
    if (k.toLowerCase().trim() === u) return Array.isArray(map[k]) ? map[k] : [];
  }
  return [];
}

/** Effektive Rollen = manuelle Zuordnung ∪ AD-Abteilung. */
function effectiveRoles(upn, department) {
  const set = new Set(manualRolesFor(upn));
  if (department && String(department).trim()) set.add(String(department).trim());
  return [...set];
}

/** Effektive Rollen des aktuell angemeldeten Users (mit AD-Abteilung via Graph). */
async function getCurrentUserRoles() {
  if (_myRolesCache) return _myRolesCache;
  let dep = '';
  try { dep = await spGetMyDepartment(); } catch (e) { /* department optional */ }
  _myRolesCache = effectiveRoles(_currentUpn(), dep);
  return _myRolesCache;
}

/**
 * Prüft, ob eine Richtlinie für eine Rollenmenge sichtbar ist.
 * Leere Zielgruppe oder "ALLE" → für alle sichtbar.
 */
function policyMatchesRoles(zielgruppen, roles) {
  if (!Array.isArray(zielgruppen) || !zielgruppen.length || zielgruppen.includes(ZIELGRUPPE_ALLE)) return true;
  const set = new Set((roles || []).map(r => String(r).toLowerCase().trim()));
  return zielgruppen.some(z => set.has(String(z).toLowerCase().trim()));
}

/* ═══════════════════════════════════════════════════
   Reiter-Berechtigungen (pro Reiter: Lesen/Schreiben)
   ===================================================
   Zusätzlich (additiv) zu den Standard-Rollenrechten. Gepflegt in den Einstellungen
   als Checkbox-Matrix je Benutzer (E-Mail); die Engine erkennt zur Sicherheit auch
   Rollennamen in den Listen (Altbestand). „Schreiben" schließt „Lesen" ein. Admins
   haben immer Zugriff; „Einstellungen" bleibt bewusst admin-only
   (Berechtigungsvergabe = kein Privilege-Escalation). Gepflegt in access-config.json. */
const GOVERNABLE_TABS = [
  { view: 'cockpit',     label: 'Cockpit' },
  { view: 'verwaltung',  label: 'Richtlinien Dashboard' },
  { view: 'ismsdocs',    label: 'ISMS-Dokumente' },
  { view: 'governance',  label: 'Governance-Board' },
  { view: 'prozesse',    label: 'Prozesse (BPMN)' },
  { view: 'abdeckung',   label: 'ISMS-Abdeckung (inkl. SoA)' },
  { view: 'faelligkeit', label: 'Fälligkeiten' },
  { view: 'risiken',     label: 'Risiko-Register' },
  { view: 'vorschlaege', label: 'Vorschläge' },
  { view: 'freigaben',   label: 'Freigaben' },
  { view: 'compliance',  label: 'Audit Report' },
];

function _reiterRechte() { return _cfg().reiterRechte || {}; }

/** Normalisierte Rechte eines Reiters: { lesen:[…], schreiben:[…] }. */
function getReiterRechte(view) {
  const r = _reiterRechte()[view] || {};
  return {
    lesen:     Array.isArray(r.lesen)     ? r.lesen.filter(Boolean)     : [],
    schreiben: Array.isArray(r.schreiben) ? r.schreiben.filter(Boolean) : [],
  };
}

/** Liste (E-Mails ODER Rollennamen) gegen den aktuellen Nutzer/seine Rollen matchen. */
function _matchesUserOrRole(list, upn, roles) {
  if (!Array.isArray(list) || !list.length) return false;
  const u = (upn || '').toLowerCase().trim();
  const rset = new Set((roles || []).map(r => String(r).toLowerCase().trim()));
  return list.some(x => { const s = String(x).toLowerCase().trim(); return s === u || rset.has(s); });
}

/** Effektive Rollen des aktuellen Nutzers (synchron; aus State, in bootApp gesetzt). */
function _currentRolesSync() {
  return (typeof State !== 'undefined' && Array.isArray(State.myRoles)) ? State.myRoles : [];
}

/** Standard-Lesbarkeit eines Reiters ohne Sonderberechtigung (bisheriges Verhalten). */
function _defaultTabRead(view) {
  if (isCurrentUserAdmin()) return true;
  if (view === 'vorschlaege') return isCurrentUserProposalManager();
  if (view === 'freigaben')   return isCurrentUserGenehmiger() || isCurrentUserPruefer() || isCurrentUserGeschaeftsleitung();
  return false;   // verwaltung, ismsdocs, governance, abdeckung, faelligkeit, compliance → sonst admin-only
}

/** Darf der Reiter gesehen/geöffnet werden? (Standard ODER additive Freigabe). */
function canReadTab(view) {
  if (_defaultTabRead(view)) return true;
  const r = getReiterRechte(view);
  const upn = _currentUpn(), roles = _currentRolesSync();
  return _matchesUserOrRole(r.lesen, upn, roles) || _matchesUserOrRole(r.schreiben, upn, roles);
}

/** Darf im Reiter geschrieben/bearbeitet werden? (Standard-Schreiber ODER schreiben-Freigabe). */
function canWriteTab(view) {
  if (_defaultTabRead(view)) return true;   // Standard-Zugriffsberechtigte (v. a. Admins) schreiben wie bisher
  return _matchesUserOrRole(getReiterRechte(view).schreiben, _currentUpn(), _currentRolesSync());
}

/** Nur-Lese-Zugriff: sichtbar, aber ohne Schreibrecht. */
function isReadOnlyTab(view) { return canReadTab(view) && !canWriteTab(view); }

/**
 * Navigations-Einträge je nach Berechtigung ein-/ausblenden.
 * Sichtbarkeit über canReadTab (Standardrollen + additive Reiter-Freigaben).
 */
function initRoleNav() {
  const admin = isCurrentUserAdmin();
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  // Sichtbarkeit je Reiter einmal berechnen (auch für die Gruppen-Überschriften)
  const v = {};
  ['cockpit', 'verwaltung', 'ismsdocs', 'governance', 'prozesse', 'abdeckung',
   'faelligkeit', 'risiken', 'vorschlaege', 'freigaben', 'compliance'].forEach(t => { v[t] = canReadTab(t); });

  // Einzelne Reiter
  show('nav-cockpit',       v.cockpit);
  show('nav-verwaltung',    v.verwaltung);
  show('nav-ismsdocs',      v.ismsdocs);
  show('nav-governance',    v.governance);
  show('nav-prozesse',      v.prozesse);
  show('nav-abdeckung',     v.abdeckung);
  show('nav-faelligkeit',   v.faelligkeit);
  show('nav-risiken',       v.risiken);
  show('nav-vorschlaege',   v.vorschlaege);
  show('nav-freigaben',     v.freigaben);
  show('nav-compliance',    v.compliance);
  show('nav-einstellungen', admin);

  // Gruppen-Überschriften: nur zeigen, wenn mindestens ein Reiter der Gruppe sichtbar ist
  show('nav-grp-richtlinien', v.verwaltung || v.freigaben || v.faelligkeit || v.vorschlaege);
  // Das Cockpit ist das ISMS-Cockpit – es steht deshalb in dieser Gruppe.
  show('nav-grp-isms',        v.cockpit || v.ismsdocs || v.abdeckung || v.risiken || v.governance || v.prozesse);
  show('nav-grp-verwaltung',  v.compliance || admin);
}
