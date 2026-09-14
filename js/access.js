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
  gruppenNamen: {},   // Objekt-ID → Anzeigename der Gruppe (nur zur Anzeige)
  // Gesellschaften der Gruppe: E-Mail-Domäne → { name, werke }. Der Name ist
  // Anzeige; die Werke sind die Brücke zum Geltungsbereich der Regelwerke.
  // Berechtigt wird über die Domäne selbst – die steht im Konto und kann nicht
  // vergessen werden. { "dihag.com": { name: "DIHAG Holding", werke: ["HOL"] } }
  gesellschaften: {},
  // Trennung der Inhalte: Sieht jemand nur die Regelwerke seiner Gesellschaft?
  // Aus = alles bleibt, wie es war.
  trennungInhalte: false,
  // Wer trotz Trennung alles sieht – die Konzern-Governance.
  konzernSicht: [],
  gruppenTypen: {},   // Objekt-ID → 'sicherheit' | 'verteiler' | 'm365' (nur zur Anzeige)
  govStrukturKoepfe: [],   // dürfen Zeilen/Spalten der Governance-Struktur ändern (Aufbau der Systematik)
  // Vertretungen: { "chef@dihag.com": { vertreter, von, bis } } – von/bis optional (leer = unbefristet)
  vertretungen: {},
  // Verteiler je Zielgruppe: { "ALLE": "alle@dihag.com", "Produktion": "produktion@dihag.com" }
  // Adressen von Verteiler- oder Sicherheitsgruppen – Exchange verteilt, die App
  // schickt eine Mail statt hunderter Einzelnachrichten.
  zielgruppenMails: {},
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
  erinnerungenAktiv:        true,
  // Erinnerungen an die Mitarbeitenden (offene Kenntnisnahme). Bewusst träger
  // getaktet als der Fach-Workflow: wöchentlich mahnen reicht, täglich nervt.
  kenntnisErinnerungAktiv:  true,
  kenntnisErsteNachTagen:   7,
  kenntnisDannAlleTage:     7,
  kenntnisEskalationAbTagen: 21,
  kenntnisEskalationMail:   '',   // leer = Eskalations-Mail des Workflows  // Erinnerungen senden ja/nein
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
        gruppenNamen: (cfg.gruppenNamen && typeof cfg.gruppenNamen === 'object' && !Array.isArray(cfg.gruppenNamen)) ? cfg.gruppenNamen : {},
        gruppenTypen: (cfg.gruppenTypen && typeof cfg.gruppenTypen === 'object' && !Array.isArray(cfg.gruppenTypen)) ? cfg.gruppenTypen : {},
        gesellschaften: (cfg.gesellschaften && typeof cfg.gesellschaften === 'object' && !Array.isArray(cfg.gesellschaften)) ? cfg.gesellschaften : {},
        trennungInhalte: cfg.trennungInhalte === true,
        konzernSicht: Array.isArray(cfg.konzernSicht) ? cfg.konzernSicht : [],
        probelaufUser: Array.isArray(cfg.probelaufUser) ? cfg.probelaufUser : [],
        govStrukturKoepfe: Array.isArray(cfg.govStrukturKoepfe) ? cfg.govStrukturKoepfe : [],
        vertretungen: (cfg.vertretungen && typeof cfg.vertretungen === 'object' && !Array.isArray(cfg.vertretungen)) ? cfg.vertretungen : {},
        zielgruppenMails: (cfg.zielgruppenMails && typeof cfg.zielgruppenMails === 'object' && !Array.isArray(cfg.zielgruppenMails)) ? cfg.zielgruppenMails : {},
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
        kenntnisErinnerungAktiv:   cfg.kenntnisErinnerungAktiv !== false,
        kenntnisErsteNachTagen:    _posInt(cfg.kenntnisErsteNachTagen, 7),
        kenntnisDannAlleTage:      _posInt(cfg.kenntnisDannAlleTage, 7),
        kenntnisEskalationAbTagen: _posInt(cfg.kenntnisEskalationAbTagen, 21),
        kenntnisEskalationMail:    typeof cfg.kenntnisEskalationMail === 'string' ? cfg.kenntnisEskalationMail : '',
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
    govStrukturKoepfe: [...(c.govStrukturKoepfe || [])],
    vertretungen: JSON.parse(JSON.stringify(c.vertretungen || {})),
    zielgruppenMails: JSON.parse(JSON.stringify(c.zielgruppenMails || {})),
    admins:     [...(c.admins || [])],
    genehmiger: [...(c.genehmiger || [])],
    roles:      [...getCompanyRoles()],
    userRoles:  JSON.parse(JSON.stringify(c.userRoles || {})),
    reiterRechte: JSON.parse(JSON.stringify(c.reiterRechte || {})),
    gruppenNamen: JSON.parse(JSON.stringify(c.gruppenNamen || {})),
    gruppenTypen: JSON.parse(JSON.stringify(c.gruppenTypen || {})),
    gesellschaften: JSON.parse(JSON.stringify(c.gesellschaften || {})),
    trennungInhalte: c.trennungInhalte === true,
    konzernSicht: [...(c.konzernSicht || [])],
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
    kenntnisErinnerungAktiv:   c.kenntnisErinnerungAktiv !== false,
    kenntnisErsteNachTagen:    _posInt(c.kenntnisErsteNachTagen, 7),
    kenntnisDannAlleTage:      _posInt(c.kenntnisDannAlleTage, 7),
    kenntnisEskalationAbTagen: _posInt(c.kenntnisEskalationAbTagen, 21),
    kenntnisEskalationMail:    c.kenntnisEskalationMail || '',
    erinnerungErsteNachTagen: _posInt(c.erinnerungErsteNachTagen, 7),
    erinnerungDannAlleTage:   _posInt(c.erinnerungDannAlleTage, 3),
    eskalationAbTagen:        _posInt(c.eskalationAbTagen, 14),
  };
}

/** Positive Ganzzahl mit Fallback. */
function _posInt(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : def; }

/* ── Verteiler je Zielgruppe ──
   Ein veröffentlichtes Regelwerk soll die Betroffenen erreichen. Statt die
   Zielgruppe in hunderte Einzeladressen aufzulösen, geht eine Mail an den
   Verteiler der Gruppe – Exchange kennt die Mitglieder ohnehin, hält sie aktuell
   und verteilt zuverlässiger als jede Empfängerschleife. */

function getZielgruppenMails() {
  const m = _cfg().zielgruppenMails;
  return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
}

/** Adresse des Verteilers einer Zielgruppe ('' = nicht hinterlegt). */
function zielgruppenMail(rolle) {
  const m = getZielgruppenMails();
  const key = String(rolle || '').trim();
  const treffer = m[key] || m[key.toLowerCase()]
    || Object.entries(m).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
  return String(treffer || '').trim().toLowerCase();
}

/**
 * Verteiler für die Zielgruppen eines Regelwerks.
 * @returns {{adressen: string[], fehlend: string[]}} fehlend = Zielgruppen ohne Verteiler
 */
function mailsFuerZielgruppen(zielgruppen) {
  const zg = (Array.isArray(zielgruppen) && zielgruppen.length) ? zielgruppen.filter(Boolean) : [ZIELGRUPPE_ALLE];
  // „Alle" schlägt alles andere: Wer alle meint, braucht keine Einzelverteiler.
  const gemeint = zg.some(z => String(z).toUpperCase() === ZIELGRUPPE_ALLE) ? [ZIELGRUPPE_ALLE] : zg;
  const adressen = [], fehlend = [];
  for (const rolle of gemeint) {
    const a = zielgruppenMail(rolle);
    if (a) { if (!adressen.includes(a)) adressen.push(a); }
    else fehlend.push(rolle);
  }
  return { adressen, fehlend };
}

/** Domains der hinterlegten Verteiler – admin-gepflegt, deshalb auch außerhalb der eigenen erlaubt. */
function zielgruppenDomains() {
  return [...new Set(Object.values(getZielgruppenMails())
    .map(a => String(a || '').split('@').pop().trim().toLowerCase()).filter(Boolean))];
}

/* ═══════════════════════════════════════════════════
   Vertretung (Urlaub, Krankheit)
   ═══════════════════════════════════════════════════
   Ein Regelwerk soll nicht liegen bleiben, nur weil eine Person zwei Wochen weg
   ist. Je Person lässt sich eine Vertretung mit Zeitraum hinterlegen: Solange er
   läuft, bekommt die Vertretung die Mails mit, darf entscheiden – und im
   Protokoll steht ausdrücklich „in Vertretung für", damit später niemand rätselt,
   warum jemand freigegeben hat, der sonst nicht freigeben darf.

   Ohne Zeitraum gilt die Vertretung dauerhaft; ein Datum allein grenzt nur nach
   einer Seite ab (nur „von" = ab dann, nur „bis" = bis dahin). */

function getVertretungen() {
  const v = _cfg().vertretungen;
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

/** Läuft dieser Vertretungseintrag gerade? (Zeitraum inklusive beider Tage) */
function vertretungAktiv(eintrag, jetzt) {
  if (!eintrag || !eintrag.vertreter) return false;
  const t = jetzt ? new Date(jetzt) : new Date();
  if (isNaN(t)) return false;
  const tag = t.toISOString().slice(0, 10);
  const von = (eintrag.von || '').slice(0, 10);
  const bis = (eintrag.bis || '').slice(0, 10);
  if (von && tag < von) return false;
  if (bis && tag > bis) return false;
  return true;
}

/** Wer vertritt diese Person gerade? ('' = niemand) */
function vertreterVon(upn, jetzt) {
  const e = getVertretungen()[String(upn || '').toLowerCase()];
  return vertretungAktiv(e, jetzt) ? String(e.vertreter || '').toLowerCase() : '';
}

/** Vertritt `vertreter` gerade die Person `fuer`? */
function vertrittGerade(vertreter, fuer, jetzt) {
  const v = vertreterVon(fuer, jetzt);
  return !!v && v === String(vertreter || '').toLowerCase().trim();
}

/** Empfängerliste um die gerade aktiven Vertretungen erweitern (ohne Dubletten). */
function mitVertretern(liste, jetzt) {
  const out = [];
  for (const u of (liste || []).filter(Boolean)) {
    const lc = String(u).toLowerCase();
    if (!out.includes(lc)) out.push(lc);
    const v = vertreterVon(lc, jetzt);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Steht die Person in der Liste – selbst oder als aktive Vertretung? */
function _hasOderVertritt(liste, upn) {
  if (_has(liste, upn)) return true;
  return (liste || []).some(x => vertrittGerade(upn, x));
}

/** Für wen aus dieser Liste handelt die Person gerade als Vertretung? ('' = für sich selbst) */
function vertretungFuerAus(liste, upn) {
  if (_has(liste, upn)) return '';
  const treffer = (liste || []).find(x => vertrittGerade(upn, x));
  return treffer ? String(treffer).toLowerCase() : '';
}

/* ── Genehmigungsverfahren: Rollen & Schwellen ── */
function isPruefer(upn)           { return _hasOderVertritt(_cfg().pruefer, upn); }
function isGeschaeftsleitung(upn) { return _hasOderVertritt(_cfg().geschaeftsleitung, upn); }
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
/** Adressen, an die die Mitbestimmungs-Mail für dieses Regelwerk geht:
 *  Konzernbetriebsrat und die Betriebsräte der betroffenen Werke. */
function mitbestimmungMails(p) {
  const werke = (p && Array.isArray(p.mitbestimmungWerke)) ? p.mitbestimmungWerke : [];
  return [p && p.kbrBetroffen ? getKbrMail() : '', ...werke.map(w => getBrMail(w))]
    .map(m => String(m || '').trim().toLowerCase()).filter(Boolean);
}

/**
 * Darf die angemeldete Person die Mitbestimmung für dieses Regelwerk entscheiden?
 *
 * Ja, wenn sie den Ablauf führt (Prüfer oder Geschäftsleitung – sie dokumentieren
 * das Votum bisher im Portal). Und ja, wenn sie zu dem Betriebsrat gehört, an den
 * die Mail ging: entweder ist es ihre eigene Adresse oder sie ist Mitglied der
 * hinterlegten Verteiler-/Sicherheitsgruppe. Dafür muss niemand eine zusätzliche
 * Liste pflegen – die BR-Adressen stehen ohnehin in den Einstellungen.
 */
function darfMitbestimmung(p) {
  const u = String(_currentUpn() || '').toLowerCase();   // dieselbe Quelle wie überall hier
  if (typeof isCurrentUserPrueferForPolicy === 'function' && isCurrentUserPrueferForPolicy(p)) return true;
  if (typeof isCurrentUserGeschaeftsleitungForPolicy === 'function' && isCurrentUserGeschaeftsleitungForPolicy(p)) return true;
  if (typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin()) return true;
  const ziele = mitbestimmungMails(p);
  if (!ziele.length || !u) return false;
  if (ziele.includes(u)) return true;
  const meine = (typeof State !== 'undefined' && Array.isArray(State.myGroups)) ? State.myGroups : [];
  return meine.some(g => g && g.mail && ziele.includes(String(g.mail).toLowerCase()));
}

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
function isPrueferForPolicy(p, upn)      { return _hasOderVertritt(getPolicyPruefer(p), upn); }
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
function isGeschaeftsleitungForPolicy(p, upn)      { return _hasOderVertritt(getPolicyGeschaeftsleitung(p), upn); }
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

/* Der Aufbau der Governance-Struktur – welche Zeilen und Spalten es gibt – ist
   ein eigenes Recht: Regelungen pflegen dürfen mehrere, den Rahmen der Systematik
   ändern soll nur, wer ihn verantwortet. Eine umbenannte Ebene betrifft schließlich
   alles, was daran hängt. Admins dürfen es immer. */
function darfGovStrukturKoepfe(upn) {
  const u = upn || _currentUpn();
  return isAdmin(u) || _has(_cfg().govStrukturKoepfe, u);
}

/* ═══════════════════════════════════════════════════
   Gesellschaften: Berechtigungen nach E-Mail-Domäne trennen
   ═══════════════════════════════════════════════════
   Die DIHAG-Gruppe sind mehrere Gesellschaften mit eigenen Mail-Domänen. Bisher
   kannte die Rechtevergabe nur Personen, Rollen und Gruppen: Wer eine ganze
   Gesellschaft berechtigen wollte, musste jede Person einzeln eintragen – und
   bei jedem Eintritt daran denken.

   Zwei Bausteine, nach dem Vorbild von „Rund um den Job":

     1. Die Domäne als Träger eines Rechts: „domaene:gienanth.de" steht in
        `lesen`/`schreiben` wie eine Gruppe. Additiv – sie gibt etwas dazu.

     2. Die Domänen-Sperre je Reiter (`reiterRechte[view].domaenen`). Ist sie
        gesetzt, sieht den Reiter nur, wer aus einer dieser Gesellschaften
        kommt – unabhängig davon, was ihm sonst freigegeben wurde. Das ist der
        Teil, der wirklich trennt: Er nimmt weg statt zu geben.

   Admins bleiben von der Sperre ausgenommen. Sonst spielte man sich mit einem
   Klick aus der Verwaltung: „Einstellungen" ist admin-only, und wer dort nicht
   mehr hineinkommt, kann eine falsch gesetzte Sperre nicht zurücknehmen.

   Maßgeblich ist die Domäne des Kontos, nicht ein gepflegtes Feld – sie steht
   im Anmeldenamen und in der Mailadresse und lässt sich nicht vergessen. */

const RECHT_DOMAENE = 'domaene:';

/** Ist der Eintrag eine Gesellschaft (Domäne)? */
function istDomaenenEintrag(x) { return String(x || '').toLowerCase().startsWith(RECHT_DOMAENE); }
/** Domäne aus einem Eintrag „domaene:dihag.com". */
function domaeneIdVon(x) { return String(x || '').toLowerCase().slice(RECHT_DOMAENE.length).trim(); }
/** Eintrag aus einer Domäne bauen (auch „@dihag.com" oder eine ganze Adresse gehen). */
function domaenenEintrag(d) { return RECHT_DOMAENE + domaeneNormal(d); }

/** Die Domäne einer Adresse – oder die Eingabe selbst, wenn schon eine dasteht. */
function domaeneVon(adresse) {
  const s = String(adresse || '').toLowerCase().trim();
  const i = s.lastIndexOf('@');
  return i < 0 ? '' : s.slice(i + 1).trim();
}
/** „@Gienanth.DE" / „a@gienanth.de" / „gienanth.de" → „gienanth.de". */
function domaeneNormal(eingabe) {
  const s = String(eingabe || '').toLowerCase().trim().replace(/^@/, '');
  return s.includes('@') ? domaeneVon(s) : s;
}

/** Gepflegte Gesellschaften: { "dihag.com": "DIHAG Holding" } – nur zur Anzeige. */
function getGesellschaften() {
  const g = _cfg().gesellschaften;
  return (g && typeof g === 'object' && !Array.isArray(g)) ? g : {};
}
/**
 * Eine Gesellschaft als Datensatz: Name und ihre Werke.
 *
 * Zwei Formen werden gelesen. Anfangs stand dort nur der Anzeigename als Text;
 * seit die Inhalte getrennt werden, gehören die Werke dazu. Der Altbestand
 * bleibt lesbar, statt beim ersten Speichern still zu verschwinden.
 */
function gesellschaftDaten(domaene) {
  const d = domaeneNormal(domaene);
  const roh = getGesellschaften()[d];
  if (typeof roh === 'string') return { name: roh || d, werke: [] };
  if (roh && typeof roh === 'object' && !Array.isArray(roh)) {
    return {
      name: String(roh.name || d),
      werke: Array.isArray(roh.werke) ? roh.werke.map(String).filter(Boolean) : [],
    };
  }
  return { name: d, werke: [] };
}

/** Name der Gesellschaft zu einer Domäne (ohne Eintrag: die Domäne selbst). */
function gesellschaftLabel(domaene) { return gesellschaftDaten(domaene).name; }

/** Die Werke einer Gesellschaft – die Brücke zum Geltungsbereich der Regelwerke. */
function gesellschaftWerke(domaene) { return gesellschaftDaten(domaene).werke; }

/**
 * Die Domänen des angemeldeten Kontos: Anmeldename und, wenn bekannt, die
 * Mailadresse. Beide, weil sie in manchen Mandanten auseinanderfallen – der
 * Anmeldename endet auf `.onmicrosoft.com`, die Mail auf der Firmendomäne.
 * Wer nur eine von beiden prüft, sperrt irgendwann die Falschen aus.
 */
function meineDomaenen(upn) {
  const u = upn || _currentUpn();
  const mail = (typeof spMeineMail === 'function') ? spMeineMail() : '';
  return [...new Set([domaeneVon(u), domaeneVon(mail)].filter(Boolean))];
}
/** Die Domäne, unter der jemand hier auftritt (für die Anzeige). */
function meineDomaene(upn) { return meineDomaenen(upn)[0] || ''; }

/** Domänen-Sperre eines Reiters ([] = keine, der Reiter steht allen offen). */
function reiterDomaenen(view) {
  const r = _reiterRechte()[view] || {};
  return Array.isArray(r.domaenen)
    ? r.domaenen.map(d => domaeneNormal(d)).filter(Boolean) : [];
}

/** Kommt das Konto aus einer Gesellschaft, für die dieser Reiter offen ist? */
function reiterDomaeneErlaubt(view, upn) {
  const erlaubt = reiterDomaenen(view);
  if (!erlaubt.length) return true;                   // keine Sperre gesetzt
  const meine = meineDomaenen(upn);
  if (!meine.length) return false;                    // keine Domäne feststellbar → nicht durchlassen
  return meine.some(d => erlaubt.includes(d));
}

/** Sperrt die Trennung nach Gesellschaft diesen Reiter? (Admins nie.) */
function _domaeneGesperrt(view) {
  if (isCurrentUserAdmin()) return false;
  return !reiterDomaeneErlaubt(view, _currentUpn());
}

/* ── Trennung der Inhalte ──
   Die Reiter-Sperre oben sagt, WELCHE ANSICHT jemand öffnen darf. Sie sagt
   nichts darüber, was er dort sieht – wer das Dashboard öffnen durfte, sah die
   Regelwerke aller Gesellschaften. Eine Tür ohne Wand.

   Die Brücke zwischen Gesellschaft und Inhalt ist der **Geltungsbereich**: Den
   trägt jedes Regelwerk ohnehin (Werke oder „ALLE"). Eine Gesellschaft bekommt
   deshalb ihre Werke zugeordnet und sieht dann genau, was dort gilt – plus
   alles Konzernweite, denn das gilt auch für sie.

   Ehrlich dazugesagt: Das trennt die **Sicht**, nicht den Zugriff. Alle
   Regelwerke liegen in EINER SharePoint-Liste; wer deren Leserecht hat, kommt
   über Graph an alles heran. Eine technische Trennung brauchte getrennte Listen
   oder Sites – eine andere Größenordnung. Hier geht es darum, dass niemand
   Regelwerke sieht, die ihn nichts angehen. */

/** Ist die Trennung der Inhalte überhaupt eingeschaltet? */
function istTrennungInhalte() { return _cfg().trennungInhalte === true; }

/** Wer sieht alles – über alle Gesellschaften hinweg (Konzern-Governance). */
function getKonzernSicht() { return [...(_cfg().konzernSicht || [])]; }
function hatKonzernsicht(upn) { return _has(getKonzernSicht(), upn || _currentUpn()); }

/**
 * Die Werke, deren Inhalte jemand sehen darf – `['*']` heißt „alles".
 *
 * Auf `['*']` fällt es bewusst in drei Fällen zurück: Trennung aus,
 * Konzernsicht, oder der Gesellschaft sind gar keine Werke zugeordnet. Der
 * letzte Fall ist der wichtige: Sonst sähe jemand, dessen Gesellschaft nur zur
 * Anzeige gepflegt ist, von einem Tag auf den anderen nichts mehr.
 */
function meineWerke(upn) {
  if (!istTrennungInhalte()) return ['*'];
  if (hatKonzernsicht(upn)) return ['*'];
  const werke = [...new Set(meineDomaenen(upn).flatMap(d => gesellschaftWerke(d)))];
  return werke.length ? werke : ['*'];
}

/** Greift die Trennung für diese Person gerade? */
function trennungGreift(upn) { return !meineWerke(upn).includes('*'); }

/**
 * Darf dieser Geltungsbereich gesehen werden?
 *
 * Ungepflegt zählt wie konzernweit. Andernfalls verschwände beim Einschalten
 * schlagartig jeder Altbestand ohne Geltungsbereich – das sähe aus wie
 * Datenverlust und wäre das Gegenteil von Vertrauen.
 */
function geltungSichtbar(geltung, upn) {
  const w = meineWerke(upn);
  if (w.includes('*')) return true;
  if (!Array.isArray(geltung) || !geltung.length) return true;
  if (geltung.includes('ALLE')) return true;          // konzernweit gilt auch hier
  return geltung.some(x => w.includes(String(x)));
}

/** Dasselbe für ein Regelwerk oder Konzept. */
function regelwerkSichtbar(p, upn) { return geltungSichtbar(p && p.geltungsbereich, upn); }

/** Eine Liste auf das reduzieren, was die eigene Gesellschaft angeht. */
function filterNachGesellschaft(liste, upn) {
  const arr = Array.isArray(liste) ? liste : [];
  return trennungGreift(upn) ? arr.filter(p => regelwerkSichtbar(p, upn)) : arr.slice();
}

/** Die eigene Gesellschaft – für die Anzeige („Sie sehen …"). */
function meineGesellschaft(upn) {
  const d = meineDomaenen(upn).find(x => getGesellschaften()[x]) || meineDomaene(upn);
  return { domaene: d, name: gesellschaftLabel(d), werke: gesellschaftWerke(d) };
}

/**
 * Der Hinweis über gefilterten Listen. Still zu filtern wäre das Schlimmste:
 * Wer sein Regelwerk nicht findet, sucht zuerst den Fehler bei sich.
 */
function trennungHinweisHtml() {
  if (!trennungGreift()) return '';
  const g = meineGesellschaft();
  const w = meineWerke();
  return `<div class="field-hint" style="margin-bottom:10px">🏭 Sie sehen die Regelwerke von
    <b>${esc(g.name)}</b> (${esc(w.join(', '))}) und alles, was konzernweit gilt.
    Regelwerke anderer Gesellschaften sind ausgeblendet.</div>`;
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
  { view: 'cockpit',     label: 'Cockpit' , kurz: 'Cockpit' },
  { view: 'verwaltung',  label: 'Regelwerk Dashboard', kurz: 'Dashboard' },
  { view: 'ismsdocs',    label: 'IMS-Dokumente', kurz: 'IMS-Dok.' },
  { view: 'governance',  label: 'Governance-Board' , kurz: 'Governance' },
  { view: 'govstruktur', label: 'Governance-Struktur', kurz: 'Gov-Struktur' },
  { view: 'prozesse',    label: 'Prozesse & Landkarte' , kurz: 'Prozesse' },
  { view: 'abdeckung',   label: 'IMS-Abdeckung (inkl. SoA)' , kurz: 'Abdeckung' },
  { view: 'faelligkeit', label: 'Fälligkeiten' , kurz: 'Fälligkeit' },
  { view: 'risiken',     label: 'Risiko-Register' , kurz: 'Risiken' },
  { view: 'vorschlaege', label: 'Vorschläge' , kurz: 'Vorschläge' },
  { view: 'freigaben',   label: 'Freigaben' , kurz: 'Freigaben' },
  { view: 'ausnahmen',   label: 'Ausnahmeregister' , kurz: 'Ausnahmen' },
  { view: 'wirksamkeit', label: 'Wirksamkeit & Verbesserung' , kurz: 'Wirksamkeit' },
  { view: 'notfall',     label: 'Notfall & Krisenstab' , kurz: 'Notfall' },
  { view: 'compliance',  label: 'Audit Report' , kurz: 'Audit' },
];

function _reiterRechte() { return _cfg().reiterRechte || {}; }

/** Normalisierte Rechte eines Reiters: { lesen:[…], schreiben:[…] }. */
function getReiterRechte(view) {
  const r = _reiterRechte()[view] || {};
  return {
    lesen:     Array.isArray(r.lesen)     ? r.lesen.filter(Boolean)     : [],
    schreiben: Array.isArray(r.schreiben) ? r.schreiben.filter(Boolean) : [],
    domaenen:  reiterDomaenen(view),
  };
}

/* Ein Eintrag in einer Reiter-Liste ist entweder eine E-Mail, ein Rollenname
   oder – mit diesem Präfix – die Objekt-ID einer Gruppe (Sicherheits-, Verteiler-
   oder Microsoft-365-Gruppe; für die Auswertung sind sie gleichwertig). Die ID
   statt des Namens, weil eine umbenannte Gruppe sonst still ihre Rechte verlöre. */
const RECHT_GRUPPE = 'gruppe:';

/** Ist der Eintrag eine Gruppe? */
function istGruppenEintrag(x) { return String(x || '').toLowerCase().startsWith(RECHT_GRUPPE); }
/** Objekt-ID aus einem Gruppen-Eintrag. */
function gruppenIdVon(x) { return String(x || '').toLowerCase().slice(RECHT_GRUPPE.length); }
/** Beschriftung der Gruppenart. */
const GRUPPEN_ARTEN = {
  sicherheit: 'Sicherheitsgruppe',
  verteiler:  'Verteilergruppe',
  m365:       'Microsoft-365-Gruppe',
};
function gruppenArtLabel(art) { return GRUPPEN_ARTEN[art] || 'Gruppe'; }

/** Gruppen-IDs des angemeldeten Kontos (in bootApp gesetzt). */
function _currentGroupIds() {
  const gs = (typeof State !== 'undefined' && Array.isArray(State.myGroups)) ? State.myGroups : [];
  return new Set(gs.map(g => String(g && g.id || g).toLowerCase()));
}

/** Liste (E-Mails, Rollennamen ODER Gruppen) gegen den aktuellen Nutzer matchen. */
function _matchesUserOrRole(list, upn, roles) {
  if (!Array.isArray(list) || !list.length) return false;
  const u = (upn || '').toLowerCase().trim();
  const rset = new Set((roles || []).map(r => String(r).toLowerCase().trim()));
  let gset = null;   // Gruppen erst auflösen, wenn wirklich eine in der Liste steht
  let dset = null;   // Domänen ebenso: erst holen, wenn eine in der Liste steht
  return list.some(x => {
    const s = String(x).toLowerCase().trim();
    if (s.startsWith(RECHT_GRUPPE)) {
      if (!gset) gset = _currentGroupIds();
      return gset.has(s.slice(RECHT_GRUPPE.length));
    }
    if (s.startsWith(RECHT_DOMAENE)) {
      if (!dset) dset = new Set(meineDomaenen(upn));
      return dset.has(s.slice(RECHT_DOMAENE.length).trim());
    }
    return s === u || rset.has(s);
  });
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
  // Die Trennung nach Gesellschaft steht vor allem anderen: Sie nimmt weg, was
  // eine Freigabe gegeben hätte – sonst wäre sie keine Trennung.
  if (_domaeneGesperrt(view)) return false;
  if (_defaultTabRead(view)) return true;
  const r = getReiterRechte(view);
  const upn = _currentUpn(), roles = _currentRolesSync();
  return _matchesUserOrRole(r.lesen, upn, roles) || _matchesUserOrRole(r.schreiben, upn, roles);
}

/** Darf im Reiter geschrieben/bearbeitet werden? (Standard-Schreiber ODER schreiben-Freigabe). */
function canWriteTab(view) {
  if (_domaeneGesperrt(view)) return false;
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
  ['cockpit', 'verwaltung', 'ismsdocs', 'governance', 'govstruktur', 'prozesse', 'abdeckung',
   'faelligkeit', 'risiken', 'vorschlaege', 'freigaben', 'compliance', 'ausnahmen',
   'wirksamkeit', 'notfall'].forEach(t => { v[t] = canReadTab(t); });

  // Einzelne Reiter
  show('nav-cockpit',       v.cockpit);
  show('nav-verwaltung',    v.verwaltung);
  show('nav-ismsdocs',      v.ismsdocs);
  show('nav-governance',    v.governance);
  show('nav-govstruktur',     v.govstruktur);
  show('nav-prozesse',      v.prozesse);
  show('nav-abdeckung',     v.abdeckung);
  show('nav-ausnahmen',     v.ausnahmen);
  show('nav-faelligkeit',   v.faelligkeit);
  show('nav-risiken',       v.risiken);
  show('nav-wirksamkeit',   v.wirksamkeit);
  show('nav-notfall',       v.notfall);
  show('nav-vorschlaege',   v.vorschlaege);
  show('nav-freigaben',     v.freigaben);
  show('nav-compliance',    v.compliance);
  show('nav-einstellungen', admin);

  // Gruppen-Überschriften: nur zeigen, wenn mindestens ein Reiter der Gruppe sichtbar ist
  show('nav-grp-richtlinien', v.verwaltung || v.freigaben || v.faelligkeit || v.vorschlaege || v.ausnahmen);
  // Corporate Governance steht als eigene Ebene über den Managementsystemen:
  // Dort entstehen die Konzernregelungen, das IMS setzt sie um und weist sie nach.
  show('nav-grp-governance',  v.governance || v.govstruktur);
  // Das Cockpit ist das ISMS-Cockpit – es steht deshalb in dieser Gruppe.
  show('nav-grp-isms',        v.cockpit || v.ismsdocs || v.abdeckung || v.risiken || v.prozesse || v.wirksamkeit || v.notfall);
  show('nav-grp-verwaltung',  v.compliance || admin);

  // Zuletzt: Läuft gerade ein Probelauf, bleibt die Leiste auf das Nötige
  // beschränkt – sonst zeigt das Lernvideo Reiter, die niemand im Publikum hat.
  if (typeof probelaufNavFiltern === 'function') probelaufNavFiltern();
}
