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
  // ── Genehmigungsverfahren ──
  pruefer:          [],        // Konformitätsprüfer (UPNs)
  geschaeftsleitung: [],       // Freigeber / Geschäftsleitung (UPNs)
  konformSchwelle:  'alle',    // 'alle' | 'einer'  – wann gilt eine Richtlinie als konform
  freigabeSchwelle: 'einer',   // 'alle' | 'einer'  – wie viele GL müssen freigeben
  eskalationMail:   '',        // Ersatz-Empfänger bei keiner Antwort
  genehmigungPA:    false,     // true → Genehmigung läuft über Power Automate, App schickt KEINE Prüf-/Freigabe-Mails
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
        pruefer:           Array.isArray(cfg.pruefer) ? cfg.pruefer : [],
        geschaeftsleitung: Array.isArray(cfg.geschaeftsleitung) ? cfg.geschaeftsleitung : [],
        konformSchwelle:   cfg.konformSchwelle === 'einer' ? 'einer' : 'alle',
        freigabeSchwelle:  cfg.freigabeSchwelle === 'alle' ? 'alle' : 'einer',
        eskalationMail:    typeof cfg.eskalationMail === 'string' ? cfg.eskalationMail : '',
        genehmigungPA:     cfg.genehmigungPA === true,
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
    admins:     [...(c.admins || [])],
    genehmiger: [...(c.genehmiger || [])],
    roles:      [...getCompanyRoles()],
    userRoles:  JSON.parse(JSON.stringify(c.userRoles || {})),
    pruefer:           [...(c.pruefer || [])],
    geschaeftsleitung: [...(c.geschaeftsleitung || [])],
    konformSchwelle:   c.konformSchwelle || 'alle',
    freigabeSchwelle:  c.freigabeSchwelle || 'einer',
    eskalationMail:    c.eskalationMail || '',
    genehmigungPA:     c.genehmigungPA === true,
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
function getEskalationMail()    { return _cfg().eskalationMail || ''; }
function getGenehmigungPA()     { return _cfg().genehmigungPA === true; }
function getErinnerungenAktiv()        { return _cfg().erinnerungenAktiv !== false; }
function getMailSender()               { return _cfg().mailSender || ''; }
function getErinnerungErsteNachTagen() { return _posInt(_cfg().erinnerungErsteNachTagen, 7); }
function getErinnerungDannAlleTage()   { return _posInt(_cfg().erinnerungDannAlleTage, 3); }
function getEskalationAbTagen()        { return _posInt(_cfg().eskalationAbTagen, 14); }

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

function _currentUpn() {
  const acc = typeof getAuthUser === 'function' ? getAuthUser() : null;
  return acc ? acc.username : '';
}
function isCurrentUserAdmin()      { return isAdmin(_currentUpn()); }
function isCurrentUserGenehmiger() { return isGenehmiger(_currentUpn()); }

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

/**
 * Navigations-Einträge je nach Berechtigungs-Rolle ein-/ausblenden.
 */
function initRoleNav() {
  const admin = isCurrentUserAdmin();
  const geneh = isCurrentUserGenehmiger();
  const kannFreigaben = admin || geneh || isCurrentUserPruefer() || isCurrentUserGeschaeftsleitung();
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  show('nav-sep-admin',     admin || kannFreigaben);
  show('nav-verwaltung',    admin);
  show('nav-ismsdocs',      admin);
  show('nav-freigaben',     kannFreigaben);
  show('nav-compliance',    admin);
  show('nav-einstellungen', admin);
}
