'use strict';

// ═══════════════════════════════════════════════════════════════════
// CONFIG — bei Bedarf anpassen
// Auth läuft über ../js/auth.js (RMS-App-Registrierung, SSO mit dem
// Richtlinienmanagement) – daher hier keine eigene Client-ID mehr.
// ═══════════════════════════════════════════════════════════════════
const SP_HOST      = 'dihag.sharepoint.com';
const SP_SITE_PATH = '/sites/IT';
const LIST_ANTRAEGE  = 'KI_Antraege';
const LIST_LIZENZEN  = 'KI_Lizenzen';
const LIST_REGISTER  = 'KI_Register';

// Bekannte GUIDs als Fallback (aus Browser-Netzwerklog ermittelt)
const KNOWN_SITE_ID        = 'dihag.sharepoint.com,1618712f-787b-4584-ad54-2bf68c110f15,b93e94cf-030f-4296-9756-15492a5409d9';
const KNOWN_ANTRAEGE_GUID  = '28d7d466-6239-4575-be27-4c3873634707';

// KI-Register Spaltennamen (kiSystem + nutzer werden in boot() dynamisch aufgelöst)
const COL_REG = {
  status:        'Status',
  risiko:        'Risikokategorie',
  verantw:       'VerantwortlicheStelle',
  hersteller:    'Hersteller',
  nutzungsart:   'InterneExterneNutzung',
  freigabeDatum: 'FreigabeDatum',
  anbieter:      'Anbieter',
  notizen:       'Notizen',
  kiSystem:      null,   // z.B. 'KI_x002d_System' – wird in boot() aufgelöst
  nutzer:        null,   // Person-Feld "User/Nutzer" (Lizenznehmer) – wird in boot() aufgelöst
  ansprechperson: null,  // Person-Feld "Ansprechperson" = Antragsteller – wird in boot() aufgelöst
};

// SP-interne Spaltennamen (sofern abweichend von Anzeigenamme anpassen)
const COL = {
  status:           'Status',
  risiko:           'Risikokategorie',
  verantw:          'VerantwortlicheStelle',
  komponenten:      'KIKomponenten',
  hersteller:       'Hersteller',
  zweckHersteller:  'VerwendungszweckHersteller',
  zweckUnternehmen: 'AnwendungsbereichUnternehmen',
  nutzungsart:      'InterneExterneNutzung',
  projektplanung:   'Projektplanung',
  keyUser:          'KompetenzmassnahmeKeyUser',
  gremiumKommentar: 'GremiumKommentar',
  auflagen:         'Auflagen',
  freigabeDatum:    'FreigabeDatum',
  // Lizenzen
  kiSystem:         'System',
  lizenztyp:        'Lizenztyp',
  anbieter:         'Anbieter',
  kosten:           'Kosten',
  rhythmus:         'Abrechnungsrhythmus',
  lizenzGesamt:     'LizenzenGesamt',
  lizenzBelegt:     'LizenzenBelegt',
  vertragsBeginn:   'VertragsBeginn',
  vertragsEnde:     'VertragsEnde',
  kuendigungsfrist: 'Kuendigungsfrist',
  autoRenewal:      'AutoRenewal',
  verantwIT:        'VerantwortlicherIT',
  notizen:          'Notizen',
  nutzer:           'KIUser',
  zugewieseneNutzer: null,
  genehmiger:       null,   // Person-Mehrfachauswahl "Genehmiger" in KI_Antraege – wird in boot() aufgelöst
};

const STATUS_OPTS = ['Eingereicht', 'In Prüfung', 'Genehmigt', 'Abgelehnt', 'Rückfrage'];

// Werke der DIHAG-Gruppe – je Werk kann in den Einstellungen eine Betriebsrats-
// Mailadresse hinterlegt werden. Wird im Antrag als „betroffene BR" ausgewählt.
const MITBESTIMMUNG_WERKE = ['SHB', 'WGC', 'SCH', 'EIS', 'DSO', 'ZAI', 'LEG', 'MEG', 'EWA'];

const ANLAGE_ROLLEN  = ['Legal', 'Datenschutz', 'Compliance', 'IT', 'User', 'Sonstiges'];
// Interner Konfigurationseintrag in KI_Antraege (wird in allen Listenansichten ausgeblendet)
const SP_CONFIG_TITLE = '__KI_CFG__';
const ROLLE_COLORS = {
  'Legal':      { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  'Datenschutz':{ bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
  'Compliance': { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  'IT':         { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'User':       { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
  'Sonstiges':  { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' },
};

const ANTRAG_FIELDS = [
  { section: 'Grunddaten' },
  { key: 'Title',                        label: 'Bezeichnung des KI-Systems',        type: 'text',    req: true,
    hint: 'Interne Bezeichnung des KI-Use-Case oder der Software' },
  { key: COL.verantw,                    label: 'Verantwortliche Stelle',            type: 'text',    req: true,
    hint: 'Wer verantwortet die Lösung im Betrieb?' },
  { key: COL.hersteller,                 label: 'Hersteller / Entwickler',           type: 'text',    req: true,
    hint: 'Bezugsquelle, Dienstleister oder Lieferant' },
  { section: 'KI-Beschreibung' },
  { key: COL.komponenten,                label: 'KI-Komponente(n)',                  type: 'textarea', req: true,
    hint: 'Beschreibung der Funktionen, integrierten KI-Modelle und Verfahren' },
  { key: COL.zweckHersteller,            label: 'Verwendungszweck laut Hersteller',  type: 'textarea', req: true,
    hint: 'Wie definiert der Hersteller den Zweck? (Nutzungsbedingungen, Doku)' },
  { key: COL.zweckUnternehmen,           label: 'Anwendungsbereich im Unternehmen', type: 'textarea', req: true,
    hint: 'Zu welchem Zweck soll das System eingesetzt werden? Abweichung vom Herstellerzweck?' },
  { section: 'Klassifizierung' },
  { key: COL.risiko,                     label: 'Risikokategorie',                   type: 'choice',  req: true,
    choices: ['', 'Geringes Risiko', 'Normales Risiko', 'Hohes Risiko', 'Verboten'],
    hint: 'Eigene Einschätzung gemäß EU AI Act. „Verboten" = Systeme nach Art. 5 EU AI Act (z.B. Social Scoring, manipulative KI, biometrische Massenüberwachung in der Öffentlichkeit).' },
  { key: COL.nutzungsart,                label: 'Nutzungsart',                       type: 'choice',  req: true,
    choices: ['', 'Intern', 'Extern', 'Intern & Extern'],
    hint: 'Nur intern oder auch als Angebot für Dritte/Vermarktung?' },
  { section: 'Umsetzung' },
  { key: COL.projektplanung,             label: 'Geplanter Einsatz ab',             type: 'date',    req: false },
  { key: COL.keyUser,                    label: 'Key User / Schulungsmaßnahme',     type: 'text',    req: false,
    hint: 'Wer ist Key User? Welche Schulungsmaßnahmen sind geplant?' },
];

const LIZENZ_FIELDS = [
  { key: COL.kiSystem,       label: 'KI-System',             type: 'text',     req: true },
  { key: COL.lizenztyp,      label: 'Lizenztyp',             type: 'combo',    req: false,
    choices: ['Enterprise', 'Team', 'Pro', 'Free', 'API', 'Sonstiges'] },
  { key: COL.anbieter,       label: 'Anbieter',              type: 'text',     req: false },
  { key: COL.kosten,         label: 'Kosten (€/Periode)',    type: 'number',   req: false },
  { key: COL.rhythmus,       label: 'Abrechnungsrhythmus',   type: 'choice',   req: false,
    choices: ['', 'Monatlich', 'Jährlich', 'Einmalig'] },
  { key: COL.lizenzGesamt,   label: 'Lizenzen gesamt',       type: 'number',   req: false },
  { key: COL.vertragsBeginn, label: 'Vertragsbeginn',        type: 'date',     req: false },
  { key: COL.vertragsEnde,   label: 'Vertragsende',          type: 'date',     req: false },
  { key: COL.kuendigungsfrist,label:'Kündigungsfrist (Tage)',type: 'number',   req: false },
  { key: COL.autoRenewal,    label: 'Auto-Renewal',          type: 'yesno',    req: false,
    choices: ['', 'Ja', 'Nein'] },
  { key: COL.verantwIT,      label: 'Verantwortlich IT',     type: 'text',     req: false },
  { key: COL.notizen,        label: 'Notizen',               type: 'textarea', req: false },
];

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════
let account;                  // wird in onAuthReady aus auth.js (getAuthUser) übernommen
let siteId, listAntragId, listLizenzId, listRegisterId;
let isGremium       = false;
let _cfgFallback    = '';     // gesetzt, wenn access-config.json nicht lesbar war → Hinweis + eingeschränkte Rechte
let isAdmin         = false;  // aus RMS access-config.json (admins) → Einstellungen-Tab
let _rmsAdmins      = [];     // Admin-UPNs aus der RMS-Config (für Anzeige in Einstellungen)
let allAntraege = [], allLizenzen = [], allRegister = [];
// Genehmiger-Liste: aus RMS access-config.json (genehmiger) – zentral im
// Richtlinienmanagement gepflegt, Namen werden via Graph aufgelöst
let _genehmigerLive = null;   // [{email, name}] – wird in boot() befüllt
function getGenehmiger() { return _genehmigerLive || []; }

/** Lizenzen- und KI-Register-Reiter ein-/ausblenden: nur für Gremium UND wenn
 *  in den Einstellungen aktiviert (Register zusätzlich nur, wenn die Liste existiert). */
function applyKiTabVisibility() {
  const liz = document.querySelector('[data-view="lizenzen"]');
  const reg = document.querySelector('[data-view="register"]');
  if (liz) liz.style.display = (isGremium && _kiCfg.kiZeigeLizenzen) ? '' : 'none';
  if (reg) reg.style.display = (isGremium && _kiCfg.kiZeigeRegister && !!listRegisterId) ? '' : 'none';
}
let currentView = 'antraege';
let currentPanelItemId = null;   // aktuell geöffnetes Antrag-Panel
let editLizenzId = null;
// lizenzUsers: [{name: string, email: string, spId: number|null}]
let lizenzUsers = [];
let spUserMap    = {};   // email.toLowerCase()/name → SP-LookupId (Integer)
let spIdToEmail  = {};   // SP-LookupId (Integer) → email.toLowerCase() (Reverse-Map)
// Gültige schreibbare Spaltennamen der Listen (wird in boot() befüllt)
let antragCols   = null;
let registerCols = null;
let lizenzCols  = null;  // analog für KI_Lizenzen
let _cacheTs = { antraege: 0, lizenzen: 0, register: 0 };
const CACHE_TTL = 5 * 60 * 1000;  // 5 Minuten

// ── Demo-/Test-Flag ──────────────────────────────────────────────
// Aktiviert Demo-Features (KI-Vorschläge-Sidebar) auf der alten Test-URL
// ODER überall per ?demo in der URL (z.B. …/ki/?demo=1 für Vorführungen).
const IS_TEST_ENV = location.pathname.startsWith('/ki-dashboard-test')
  || new URLSearchParams(location.search).has('demo');

// ── KI-Vorschläge (Testumgebung) – vorbefüllte Beispieldatensätze ──
// Feldschlüssel entsprechen den SP-internen Namen (COL.*).
// Hinweis: COL.* sind zu diesem Zeitpunkt bereits als Strings definiert.
const KI_VORSCHLAEGE = [
  {
    icon: '🤖', name: 'ChatGPT (OpenAI)',
    kategorie: 'Normales Risiko',
    felder: {
      Title: 'ChatGPT – KI-Assistent für Textgenerierung',
      VerantwortlicheStelle: 'IT-Abteilung',
      Hersteller: 'OpenAI / Microsoft Azure',
      KIKomponenten: 'Großes Sprachmodell (GPT-4o), konversationsbasierte Schnittstelle; Funktionen: Texterstellung, Zusammenfassung, Übersetzung, Code-Unterstützung.',
      VerwendungszweckHersteller: 'Allgemeiner KI-Assistent zur Unterstützung bei Schreib- und Analyseaufgaben (laut OpenAI-Nutzungsbedingungen, Stand 2025).',
      AnwendungsbereichUnternehmen: 'Interne Nutzung für Textentwürfe, E-Mail-Formulierungen und Recherche. Kein Einsatz mit personenbezogenen Daten oder Geschäftsgeheimnissen ohne Enterprise-Datenschutzoption.',
      Risikokategorie: 'Normales Risiko',
      InterneExterneNutzung: 'Intern',
      KompetenzmassnahmeKeyUser: 'Je Abteilung ein Key User; Schulung über internes E-Learning-Modul (ca. 2 h).',
    }
  },
  {
    icon: '💼', name: 'Microsoft 365 Copilot',
    kategorie: 'Normales Risiko',
    felder: {
      Title: 'Microsoft 365 Copilot – KI-Integration Office',
      VerantwortlicheStelle: 'IT-Abteilung',
      Hersteller: 'Microsoft Corporation',
      KIKomponenten: 'GPT-4o-basiertes Modell; integriert in Word, Excel, Outlook, Teams. Verarbeitung von Unternehmensdaten im DIHAG-Microsoft-365-Tenant.',
      VerwendungszweckHersteller: 'KI-gestützte Produktivitätserweiterung für Microsoft-365-Anwendungen (laut Microsoft-Produktdokumentation).',
      AnwendungsbereichUnternehmen: 'Dokumenterstellung, Datenzusammenfassung in Excel, E-Mail-Entwürfe und Meeting-Protokolle in Teams. Daten verbleiben im DIHAG-Tenant (EU-Region).',
      Risikokategorie: 'Normales Risiko',
      InterneExterneNutzung: 'Intern',
      KompetenzmassnahmeKeyUser: 'IT-Multiplikator je Standort; Microsoft-Schulungspaket + interne Kurzschulung (1 h).',
    }
  },
  {
    icon: '💻', name: 'GitHub Copilot',
    kategorie: 'Geringes Risiko',
    felder: {
      Title: 'GitHub Copilot – KI-Codierungsassistent',
      VerantwortlicheStelle: 'IT-Abteilung / Softwareentwicklung',
      Hersteller: 'GitHub (Microsoft)',
      KIKomponenten: 'Codex/GPT-4-basiertes Modell; IDE-Integration (VS Code, JetBrains). Funktionen: Code-Autocomplete, Vorschläge, Kommentare.',
      VerwendungszweckHersteller: 'KI-gestützte Code-Vorschläge und automatische Vervollständigung in Entwicklungsumgebungen (laut GitHub-Dokumentation).',
      AnwendungsbereichUnternehmen: 'Beschleunigung der internen Softwareentwicklung. Kein Upload von Code mit Geschäftsgeheimnissen ohne Enterprise-Datenschutzoption (Telemetrie deaktiviert).',
      Risikokategorie: 'Geringes Risiko',
      InterneExterneNutzung: 'Intern',
      KompetenzmassnahmeKeyUser: 'Entwickler-Team; Onboarding über GitHub-Dokumentation (selbstgesteuert).',
    }
  },
  {
    icon: '📊', name: 'Salesforce Einstein AI',
    kategorie: 'Hohes Risiko',
    felder: {
      Title: 'Salesforce Einstein AI – CRM-Analyse & Prognosen',
      VerantwortlicheStelle: 'Vertrieb / IT-Abteilung',
      Hersteller: 'Salesforce Inc.',
      KIKomponenten: 'ML-basierte Prognosemodelle; Opportunity Scoring, Lead-Priorisierung, NLP für CRM-Kundendaten.',
      VerwendungszweckHersteller: 'KI-gestützte Analyse von Kundendaten für Verkaufsprognosen und Empfehlungen (laut Salesforce-Produktdokumentation).',
      AnwendungsbereichUnternehmen: 'Automatische Priorisierung von Vertriebschancen. Verarbeitung von Kundendaten erfordert DSGVO-Prüfung und Auftragsverarbeitungsvertrag mit Salesforce. Menschliche Prüfung vor jeder Entscheidung.',
      Risikokategorie: 'Hohes Risiko',
      InterneExterneNutzung: 'Intern',
      KompetenzmassnahmeKeyUser: 'Vertriebsleiter als Key User; Salesforce-Schulungsprogramm (Trailhead) + interne Einführung.',
    }
  },
  {
    icon: '🎨', name: 'Adobe Firefly',
    kategorie: 'Geringes Risiko',
    felder: {
      Title: 'Adobe Firefly – KI-Bildgenerierung',
      VerantwortlicheStelle: 'Marketing / Unternehmenskommunikation',
      Hersteller: 'Adobe Inc.',
      KIKomponenten: 'Diffusionsmodell zur Bildgenerierung; trainiert auf lizenzierten Adobe-Stock-Daten. Integriert in Creative Cloud (Photoshop, Illustrator).',
      VerwendungszweckHersteller: 'Generierung von Bildern, Grafiken und Design-Varianten für kreative Workflows (laut Adobe).',
      AnwendungsbereichUnternehmen: 'Erstellung von Marketing-Bildmaterial und Präsentationsgrafiken. Outputs als KI-generiert kennzeichnen. Kein Einsatz mit Personenbildern ohne Einwilligung.',
      Risikokategorie: 'Geringes Risiko',
      InterneExterneNutzung: 'Intern',
      KompetenzmassnahmeKeyUser: 'Grafikdesigner als Key User; Adobe-Schulungsmaterial (selbstgesteuert).',
    }
  },
  {
    icon: '🏭', name: 'SAP AI Core – Predictive Maintenance',
    kategorie: 'Hohes Risiko',
    felder: {
      Title: 'SAP AI Core – Predictive Maintenance Gießerei',
      VerantwortlicheStelle: 'Produktion / IT-Abteilung',
      Hersteller: 'SAP SE',
      KIKomponenten: 'ML-Modelle für vorausschauende Wartung; Integration mit SAP S/4HANA, Sensordatenanalyse, Anomalie-Erkennung an Gießereimaschinen.',
      VerwendungszweckHersteller: 'KI-gestützte Vorhersage von Maschinenwartungsbedarfen auf Basis von Sensordaten (laut SAP-Produktdokumentation).',
      AnwendungsbereichUnternehmen: 'Früherkennung von Maschinenausfällen in der Produktion. Modell beeinflusst Wartungsplanung – menschliche Prüfung durch Instandhaltungsmeister vor jeder Entscheidung zwingend erforderlich.',
      Risikokategorie: 'Hohes Risiko',
      InterneExterneNutzung: 'Intern',
      KompetenzmassnahmeKeyUser: 'Produktionsleiter und Instandhaltungsmeister als Key User; SAP-Schulungsprogramm (2 Tage vor Ort).',
    }
  },
];

// ═══════════════════════════════════════════════════════════════════
// AUTH — gemeinsame Anmeldung über ../js/auth.js (RMS-App-Registrierung).
// Kein eigener MSAL-Client mehr: SSO mit dem Richtlinienmanagement,
// gleiche Session (sessionStorage), gleiche Azure-Redirect-URIs.
// ═══════════════════════════════════════════════════════════════════
// Scopes, die auf der RMS-App-Registrierung bereits konsentiert sind
// (Sites/Files/User.Read.All nutzt auch das RMS, Mail.Send der Nachweis-Versand).
const SCOPES = [
  'https://graph.microsoft.com/Sites.ReadWrite.All',
  'https://graph.microsoft.com/Files.ReadWrite.All',
  'https://graph.microsoft.com/User.Read.All',   // Personensuche /users?$filter=…
  'https://graph.microsoft.com/Mail.Send',       // E-Mails direkt über Graph senden
];

// Optionaler SharePoint-REST-Token – versucht mehrere Scopes (wie im Ticketsystem)
// _spTokenAvailable: null=unbekannt, true=funktioniert, false=nicht verfügbar (kein Retry)
let _spTokenAvailable = null;
async function tryGetSpToken() {
  if (_spTokenAvailable === false) return null;   // bereits bekannt: SP-Scope nicht registriert
  for (const scope of [
    `https://${SP_HOST}/AllSites.FullControl`,
    `https://${SP_HOST}/Sites.ReadWrite.All`,
    `https://${SP_HOST}/AllSites.Write`,
  ]) {
    try {
      // bewusst direkt silent (ohne Redirect-Fallback): SP-REST ist optional,
      // bei fehlendem Consent degradieren Anhänge/Lizenz-UPNs sauber auf Graph
      const tok = (await _msal.acquireTokenSilent({ scopes: [scope], account: getAuthUser() })).accessToken;
      _spTokenAvailable = true;
      return tok;
    } catch(e) { /* nächsten Scope versuchen */ }
  }
  // Alle Scopes fehlgeschlagen → SP-REST nicht verfügbar, kein weiterer Versuch nötig
  _spTokenAvailable = false;
  return null;
}

// Alle SP-Site-User einmalig laden → spIdToEmail + spUserMap vollständig befüllen
let _spIdMapBuilt = false;
async function buildSpIdEmailMap() {
  if (_spIdMapBuilt) return;
  const token = await tryGetSpToken();
  if (!token) return;
  try {
    const res = await fetch(
      `https://${SP_HOST}${SP_SITE_PATH}/_api/web/siteusers?$select=Id,Title,Email&$top=500`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json;odata=verbose' } }
    );
    if (!res.ok) return;
    const data = await res.json();
    for (const u of (data?.d?.results || [])) {
      if (u.Id && u.Email) {
        const id = parseInt(u.Id);
        const em = u.Email.toLowerCase().trim();
        spIdToEmail[id] = em;
        spUserMap[em]   = id;
      }
    }
    _spIdMapBuilt = true;
  } catch(e) {
    console.warn('buildSpIdEmailMap fehlgeschlagen:', e.message);
  }
}

// SP-User via ensureUser (SharePoint REST) auflösen → LookupId
// Wichtig: logonName (Kleinbuchstabe n) + odata=verbose wie im SP-REST-Standard
async function ensureSpUserViaRest(email) {
  const token = await tryGetSpToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `https://${SP_HOST}${SP_SITE_PATH}/_api/web/ensureUser`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;odata=verbose',
          'Content-Type': 'application/json;odata=verbose',
          'X-RequestDigest': 'noreply',   // verhindert CSRF-Fehler in manchen SP-Konfigurationen
        },
        body: JSON.stringify({ logonName: `i:0#.f|membership|${email}` })
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => res.status);
      console.warn('ensureUser HTTP-Fehler:', res.status, errText);
      return null;
    }
    const d = await res.json();
    // odata=verbose: Antwort liegt in d.d
    const u = d.d ?? d;
    const id = u.Id ?? u.id ?? null;
    if (id) { seedSpUser(id, email, '', u.Title || ''); return id; }
  } catch(e) { console.warn('ensureUser fehlgeschlagen:', email, e.message); }
  return null;
}

// Graph-Token über den gemeinsamen auth.js-Client (Redirect bei fehlendem Consent)
async function getToken() {
  const tok = await acquireToken(SCOPES);
  if (!tok) throw new Error('Token-Anforderung läuft (Redirect)…');
  return tok;
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(async (acc) => {
    account = acc;          // KI-Code nutzt `account` durchgängig
    await boot();
  });
  authInit();               // zeigt Boot-Screen, übernimmt Login + User-Anzeige (Sidebar)
});

// ═══════════════════════════════════════════════════════════════════
// GRAPH API
// ═══════════════════════════════════════════════════════════════════
async function gFetch(url, opts = {}, _attempt = 0) {
  const token  = await getToken();
  const full   = url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`;
  const method = (opts.method || 'GET').toUpperCase();
  // Prefer-Header nur bei GET-Abfragen (verhindert Probleme bei POST/PATCH)
  const preferHdr = method === 'GET'
    ? { 'Prefer': 'HonorNonIndexedQueriesWarningMayFailRandomly' }
    : {};
  const res = await fetch(full, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...preferHdr,
      ...(opts.headers || {})
    }
  });
  // Transientes Throttling/Unavailable (429/503/504) → kurzer Backoff-Retry (max. 3×)
  if ((res.status === 429 || res.status === 503 || res.status === 504) && _attempt < 3) {
    const retryAfter = parseFloat(res.headers.get('Retry-After')) || 0;   // Sekunden, falls vom Server gesetzt
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** _attempt);
    console.warn(`Graph ${res.status} – Retry ${_attempt + 1}/3 in ${waitMs} ms (${method} ${full})`);
    await new Promise(r => setTimeout(r, waitMs));
    return gFetch(url, opts, _attempt + 1);
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const detail  = errBody?.error?.message || errBody?.error?.code || res.statusText || res.status;
    console.error('Graph API error', method, res.status, JSON.stringify(errBody));
    throw Object.assign(new Error(`${res.status}: ${detail}`), { status: res.status, graphError: errBody });
  }
  return (res.status === 204 || res.status === 202) ? null : res.json();
}
const gGet   = url        => gFetch(url);
const gPost  = (url, b)   => gFetch(url, { method: 'POST',   body: JSON.stringify(b) });
const gPatch = (url, b)   => gFetch(url, { method: 'PATCH',  body: JSON.stringify(b) });
const gDel   = url        => gFetch(url, { method: 'DELETE' });

// Holt ALLE Seiten einer Graph-Collection (folgt @odata.nextLink statt bei $top=999 abzuschneiden).
// cap = hartes Sicherheitslimit gegen Endlosschleifen / Riesenlisten.
async function gGetAll(url, cap = 5000) {
  let out = [], next = url;
  while (next) {
    const page = await gFetch(next);
    out = out.concat(page?.value || []);
    next = page?.['@odata.nextLink'] || null;
    if (out.length >= cap) { console.warn(`gGetAll: cap ${cap} erreicht, Paging abgebrochen`); break; }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════
async function boot() {
  $id('boot-sub').textContent = 'Daten werden geladen…';
  try {
    // Site-ID: zuerst dynamisch auflösen, sonst bekannte GUID als Fallback
    try {
      const site = await gGet(`/sites/${SP_HOST}:${SP_SITE_PATH}`);
      siteId = site.id;
    } catch(e) {
      console.warn('Site-Lookup fehlgeschlagen, nutze Fallback-ID:', e.message);
      siteId = KNOWN_SITE_ID;
    }

    // Alle Listen der Site abrufen; matcht intern (name) UND Anzeigenamen (displayName)
    let allLists = [];
    try {
      let nextUrl = `/sites/${siteId}/lists?$select=id,displayName,name&$top=200`;
      while (nextUrl) {
        const page = await gGet(nextUrl);
        allLists = allLists.concat(page.value || []);
        nextUrl = page['@odata.nextLink'] || null;
      }
    } catch(e) {
      console.warn('Listen-Übersicht fehlgeschlagen:', e.message);
    }

    const findList = key => allLists.find(
      l => l.name?.toLowerCase()        === key.toLowerCase() ||
           l.displayName?.toLowerCase() === key.toLowerCase()
    );

    const lA  = findList(LIST_ANTRAEGE);
    const lL  = findList(LIST_LIZENZEN);
    const lR  = findList(LIST_REGISTER);

    // Set IDs upfront before parallel tasks
    listAntragId  = lA?.id || KNOWN_ANTRAEGE_GUID;
    if (lA) console.log('✓ KI_Antraege:', lA.displayName, listAntragId);
    else    console.log('⚠ KI_Antraege nicht via Listen-API gefunden → Fallback-GUID:', listAntragId);
    if (lL) listLizenzId   = lL.id;
    if (lR) listRegisterId = lR.id;

    // Parallel: Spalten-Discovery für alle drei Listen
    await Promise.all([
      // ── Antraege-Spalten ──────────────────────────────────────────
      (async () => {
        try {
          const colData = await gGet(`/sites/${siteId}/lists/${listAntragId}/columns?$select=name,displayName,readOnly,hidden&$top=200`);
          const antragColArr = colData.value || [];
          antragCols = new Set(
            antragColArr.filter(c => !c.readOnly && !c.hidden).map(c => c.name)
          );
          for (const col of antragColArr) {
            const dn = (col.displayName || '').toLowerCase().trim();
            if (dn === 'genehmiger' || dn === 'approver' || dn === 'approvers') {
              COL.genehmiger = col.name;
            }
          }
        } catch(e) {
          console.warn('Spaltenabruf fehlgeschlagen (kein Filter aktiv):', e.message);
        }
      })(),

      // ── Lizenzen: Zugriff prüfen + Spalten-Discovery ──────────────
      (async () => {
        if (!lL) {
          console.warn('⚠ KI_Lizenzen nicht gefunden. Verfügbare Listen:',
            allLists.map(l => `${l.name}/${l.displayName}`).join(' | '));
          return;
        }
        console.log('✓ KI_Lizenzen:', lL.displayName, listLizenzId);
        try {
          await gGet(`/sites/${siteId}/lists/${listLizenzId}/items?$top=1`);
          console.log('✓ KI_Lizenzen lesbar');

          try {
            const lizColData = await gGet(`/sites/${siteId}/lists/${listLizenzId}/columns?$select=name,displayName,readOnly,hidden&$top=200`);
            lizenzCols = new Set(
              (lizColData.value || []).filter(c => !c.readOnly && !c.hidden).map(c => c.name)
            );

            for (const col of (lizColData.value || [])) {
              const dn = (col.displayName || '').toLowerCase().trim();
              if (dn === 'system' || dn === 'ki-system' || dn === 'kisystem') {
                const oldKey = COL.kiSystem;
                COL.kiSystem = col.name;
                const lf = LIZENZ_FIELDS.find(f => f.key === oldKey);
                if (lf) lf.key = col.name;
              }
              if (dn === 'ki-user' || dn === 'ki user' || dn === 'kiuser' || dn === 'ki_user') {
                COL.nutzer = col.name;
              }
              if (dn === 'notizen' || dn === 'notes' || dn === 'bemerkungen') {
                const oldNot = COL.notizen;
                COL.notizen = col.name;
                const lf = LIZENZ_FIELDS.find(f => f.key === oldNot);
                if (lf) lf.key = col.name;
              }
              if (dn === 'zugewiesene nutzer' || dn === 'zugewiesene_nutzer' || dn === 'zugewiesenenutzer') {
                COL.zugewieseneNutzer = col.name;
              }
            }
          } catch(eCols) {
            console.warn('Lizenzen Spalten-Lookup fehlgeschlagen:', eCols.message);
          }
        } catch(e) {
          if (e.status !== 403) console.warn('Lizenzen Lesezugriff:', e.message);
          else console.log('ℹ Kein Gremium-Zugriff auf Lizenzen (403)');
        }
      })(),

      // ── Register-Spalten-Discovery ────────────────────────────────
      (async () => {
        if (!lR) {
          console.warn('⚠ KI_Register nicht gefunden');
          return;
        }
        console.log('✓ KI_Register:', lR.displayName, listRegisterId);
        try {
          const regColData = await gGet(`/sites/${siteId}/lists/${listRegisterId}/columns?$select=name,displayName,readOnly,hidden&$top=200`);
          registerCols = new Set((regColData.value || []).filter(c => !c.readOnly && !c.hidden).map(c => c.name));
          for (const col of (regColData.value || [])) {
            const dn = (col.displayName || '').toLowerCase().trim();
            if (dn === 'ki-system' || dn === 'ki system' || dn === 'kisystem' || dn === 'system') {
              COL_REG.kiSystem = col.name;
            }
            if (dn === 'nutzer' || dn === 'benutzer' || dn === 'person' || dn === 'mitarbeiter' ||
                dn === 'ki-user' || dn === 'ki user' || dn === 'kiuser' || dn === 'user' || dn === 'users') {
              COL_REG.nutzer = col.name;
            }
            if (dn === 'ansprechperson' || dn === 'ansprechpartner' || dn === 'kontakt' ||
                dn === 'contact' || dn === 'antragsteller') {
              COL_REG.ansprechperson = col.name;
            }
          }
        } catch(e) { console.warn('Register-Spalten fehlgeschlagen:', e.message); }
      })(),
    ]);

    // ── Berechtigungen aus dem Richtlinienmanagement übernehmen ──────
    // Quelle: access-config.json (gleiche Datei wie das RMS, gepflegt unter
    // Richtlinienmanagement → Einstellungen). admins → Admin, genehmiger → Gremium.
    const _myUpn = (account?.username || '').toLowerCase();
    try {
      const rmsCfg = await loadRmsAccessConfig();
      _rmsAdmins = rmsCfg.admins;
      isAdmin    = rmsCfg.admins.some(a => String(a).toLowerCase().trim() === _myUpn);
      isGremium  = isAdmin || rmsCfg.genehmiger.some(g => String(g).toLowerCase().trim() === _myUpn);
      _genehmigerLive = await resolveGenehmigerNamen(rmsCfg.genehmiger);
      console.log('✓ Berechtigungen aus RMS access-config:',
        `admin=${isAdmin}, gremium=${isGremium}, genehmiger=${rmsCfg.genehmiger.join(', ')}`);
    } catch(eCfg) {
      // Config nicht lesbar → FAIL-CLOSED: nur die Notfall-Admins bekommen Rechte.
      // Bewusst NICHT aus der Lizenz-Leseberechtigung ableiten – sonst würde jeder,
      // der die Lizenzliste lesen darf, zum Gremium (sähe alle Anträge + Entscheid-Buttons).
      console.warn('RMS access-config nicht lesbar, nutze Defaults:', eCfg.message);
      const defAdmins = ['pruefer@dihag.com', 'pruefer@dihag.com'];
      _rmsAdmins = defAdmins;
      isAdmin    = defAdmins.some(a => a.toLowerCase().trim() === _myUpn);
      isGremium  = isAdmin;
      _genehmigerLive = await resolveGenehmigerNamen(defAdmins);
      _cfgFallback = eCfg.message || 'unbekannter Fehler';
    }

    // Tab-Sichtbarkeit: Gremium sieht die Verwaltungs-Reiter, normale User nur Antrag + eigene Anträge
    if (isGremium) {
      $id('gremium-badge').classList.remove('hidden');
    } else {
      // Filter-Toolbar auf Anträge-View ausblenden (sehen nur eigene → kein Filter nötig)
      const toolbar = document.querySelector('#view-antraege .toolbar');
      if (toolbar) toolbar.style.display = 'none';
    }
    // Einstellungen nur für Admin
    if (isAdmin) {
      $id('tab-einstellungen').style.display = '';
    }
    // Lizenzen & KI-Register: standardmäßig aus, nur wenn per Einstellung aktiviert (+ Gremium)
    applyKiTabVisibility();

    // Config nicht lesbar → Rechte sind eingeschränkt. Sichtbar machen statt still zu bleiben.
    if (_cfgFallback) {
      showToast('Berechtigungs-Konfiguration (access-config.json) nicht lesbar – es gelten eingeschränkte Rechte. Bitte IT prüfen.', 'error');
      console.warn('[ki] Fail-closed aktiv, Grund:', _cfgFallback);
    }

    renderAntragForm();

    // Standardansicht: Gremium → Anträge, normale User → Neuer Antrag
    const deepId = new URLSearchParams(location.search).get('antrag');
    if (deepId) {
      await switchView('antraege');   // Deep-Link immer auf Anträge
    } else if (isGremium) {
      await switchView('antraege');
    } else {
      await switchView('antrag');
    }

    // SP-User-Map: Stufe 2 – aus Author/Editor vorhandener Items befüllen
    // (funktioniert auch wenn UserInfo-Liste nicht erreichbar war)
    try {
      const seedData = await gGet(
        `/sites/${siteId}/lists/${listAntragId}/items` +
        `?$select=id&$expand=fields($select=Author0LookupId,Author0EMail,Author0LookupValue,` +
        `Editor0LookupId,Editor0EMail,Editor0LookupValue)&$top=100`
      );
      for (const item of (seedData.value || [])) {
        const f = item.fields || {};
        if (f.Author0LookupId) seedSpUser(f.Author0LookupId, f.Author0EMail || '', '', f.Author0LookupValue || '');
        if (f.Editor0LookupId) seedSpUser(f.Editor0LookupId, f.Editor0EMail || '', '', f.Editor0LookupValue || '');
      }
    } catch(e) { console.warn('SP-User-Map Seeding fehlgeschlagen:', e.message); }

  } catch(e) {
    // App ist zu diesem Zeitpunkt bereits sichtbar (auth.js) → Fehler als Toast
    console.error('Boot fehlgeschlagen:', e);
    showToast('Fehler beim Start: ' + esc(e.message), 'error', 8000);
  }
}

// ═══════════════════════════════════════════════════════════════════
// RMS-BERECHTIGUNGEN + KI-EINSTELLUNGEN (access-config.json)
// ═══════════════════════════════════════════════════════════════════
// Zentrale Config-Datei des Richtlinienmanagements: Dokumentbibliothek der
// App-Site (sites/IT) → Ordner "Richtlinienmanagement" → access-config.json.
// Enthält neben den Rollen (admins/genehmiger) auch die KI-Einstellungen
// (kiGenehmigungsmodus, kiMailBeiEinreichung, kiMailBeiEntscheidung,
// kiMailDomains) – gilt damit zentral für alle Admins/Geräte statt localStorage.
let _appDriveId = null;   // Drive der Dokumentbibliothek (auch für Anhänge genutzt)
const KI_CFG_DEFAULTS = {
  kiGenehmigungsmodus:   'einstimmig',
  kiMailBeiEinreichung:  true,
  kiMailBeiEntscheidung: true,
  kiMailDomains:         ['dihag.com'],
  kiZeigeLizenzen:       false,   // Lizenzen-Reiter standardmäßig ausgeblendet
  kiZeigeRegister:       false,   // KI-Register-Reiter standardmäßig ausgeblendet
  kiKbrMail:             '',      // Mail des Konzernbetriebsrats (Mitbestimmung)
  kiBrMails:             {},      // { Werk-Code → BR-Mail }, z.B. { SHB: 'br@…' }
};
let _kiCfg = { ...KI_CFG_DEFAULTS };

async function getAppDriveId() {
  if (_appDriveId) return _appDriveId;
  const drives = await gGet(`/sites/${siteId}/drives`);
  const docDrive = (drives.value || []).find(d =>
    ['Dokumente', 'Documents', 'Freigegebene Dokumente', 'Shared Documents'].includes(d.name)
  ) || drives.value?.[0];
  if (!docDrive) throw new Error('Dokumentbibliothek nicht gefunden');
  _appDriveId = docDrive.id;
  return _appDriveId;
}

async function loadRmsAccessConfig() {
  const driveId = await getAppDriveId();
  const cfg = await gGet(`/drives/${driveId}/root:/Richtlinienmanagement/access-config.json:/content`);
  _kiCfg = {
    kiGenehmigungsmodus:   cfg?.kiGenehmigungsmodus === 'einer' ? 'einer' : 'einstimmig',
    kiMailBeiEinreichung:  cfg?.kiMailBeiEinreichung  !== false,
    kiMailBeiEntscheidung: cfg?.kiMailBeiEntscheidung !== false,
    kiMailDomains:         (Array.isArray(cfg?.kiMailDomains) && cfg.kiMailDomains.length)
                             ? cfg.kiMailDomains : [...KI_CFG_DEFAULTS.kiMailDomains],
    kiZeigeLizenzen:       cfg?.kiZeigeLizenzen === true,
    kiZeigeRegister:       cfg?.kiZeigeRegister === true,
    kiKbrMail:             typeof cfg?.kiKbrMail === 'string' ? cfg.kiKbrMail : '',
    kiBrMails:             (cfg?.kiBrMails && typeof cfg.kiBrMails === 'object' && !Array.isArray(cfg.kiBrMails))
                             ? cfg.kiBrMails : {},
  };
  // KI-Gremium: eigenes Feld kiGenehmiger hat Vorrang – fällt es leer aus,
  // gilt die allgemeine Genehmiger-Liste des RMS (gleiche Personenkreise)
  const kiGremium = (Array.isArray(cfg?.kiGenehmiger) && cfg.kiGenehmiger.length)
    ? cfg.kiGenehmiger
    : (Array.isArray(cfg?.genehmiger) ? cfg.genehmiger : []);
  // Positionen (Legal/Datenschutz/Compliance/IT) – im RMS je Mitglied gepflegt
  _kiGenRollen = (cfg?.kiGenehmigerRollen && typeof cfg.kiGenehmigerRollen === 'object')
    ? cfg.kiGenehmigerRollen : {};
  return {
    admins:     Array.isArray(cfg?.admins) ? cfg.admins : [],
    genehmiger: kiGremium,
  };
}
let _kiGenRollen = {};   // UPN (lowercase) → Position, aus kiGenehmigerRollen

// KI-Einstellungen zentral speichern: read-modify-write, damit die
// RMS-Felder (admins, genehmiger, pruefer, …) unangetastet bleiben.
async function saveKiConfig(kiFields) {
  const driveId = await getAppDriveId();
  let cfg = {};
  try {
    cfg = await gGet(`/drives/${driveId}/root:/Richtlinienmanagement/access-config.json:/content`) || {};
  } catch(e) { console.warn('access-config nicht lesbar, lege neu an:', e.message); }
  const merged = { ...cfg, ...kiFields };
  await gFetch(`/drives/${driveId}/root:/Richtlinienmanagement/access-config.json:/content`, {
    method: 'PUT',
    body: JSON.stringify(merged, null, 2),
  });
  _kiCfg = { ..._kiCfg, ...kiFields };
}

// UPN-Liste → [{email, name, rolle}] für Mails/Anzeige
// (Namen via Graph, Fallback: UPN-Präfix; Position aus kiGenehmigerRollen)
async function resolveGenehmigerNamen(upns) {
  // Rollen-Lookup case-insensitiv aufbauen
  const rollen = {};
  for (const [k, v] of Object.entries(_kiGenRollen || {})) {
    rollen[String(k).toLowerCase().trim()] = v;
  }
  return Promise.all((upns || []).map(async upn => {
    const email = String(upn).trim();
    const rolle = rollen[email.toLowerCase()] || '';
    try {
      const u = await gGet(`/users/${encodeURIComponent(email)}?$select=displayName`);
      return { email, name: u?.displayName || email.split('@')[0], rolle };
    } catch {
      return { email, name: email.split('@')[0], rolle };
    }
  }));
}

// ═══════════════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════════════
const PAGE_TITLES = {
  antrag: 'KI-Antrag einreichen', antraege: 'KI-Anträge',
  lizenzen: 'Lizenzmanagement', register: 'KI-Register', einstellungen: 'Einstellungen',
};

async function switchView(view) {
  // Zugriffsschutz: Nicht-Gremium darf nur antrag + antraege
  if (!isGremium && !['antrag', 'antraege'].includes(view)) return;
  // Einstellungen nur für Admin
  if (view === 'einstellungen' && !isAdmin) return;

  currentView = view;
  // hidden-Klasse entfernen/setzen — .hidden hat display:none !important
  // und würde .view.active überschreiben wenn nicht explizit entfernt
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  document.querySelectorAll('.nav-item[data-view]').forEach(t => t.classList.remove('active'));
  const activeView = $id(`view-${view}`);
  if (activeView) { activeView.classList.remove('hidden'); activeView.classList.add('active'); }
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
  const titleEl = $id('page-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[view] || 'KI-Dashboard';
  $id('sidebar')?.classList.remove('open');   // Mobile: Sidebar nach Auswahl schließen
  window.scrollTo(0, 0);

  if (view === 'antraege') await loadAntraege();
  if (view === 'lizenzen') await loadLizenzen();
  if (view === 'register') await loadRegister();
  if (view === 'einstellungen') renderEinstellungen();

  if (view === 'antrag') renderKiVorschlaege();
  else hideKiVorschlaege();
}

// ── KI-Vorschläge Sidebar (nur Testumgebung) ────────────────────────
function renderKiVorschlaege() {
  if (!IS_TEST_ENV) return;
  let sidebar = $id('ki-vorschlaege-sidebar');
  if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.id = 'ki-vorschlaege-sidebar';
    $id('view-antrag').appendChild(sidebar);
  }
  $id('view-antrag')?.classList.add('ki-vorschlaege-active');
  sidebar.innerHTML = `
    <div class="ki-test-badge">🧪 Testumgebung</div>
    <div class="ki-sidebar-title" style="font-size:.8rem;font-weight:700;color:#1e2939;margin:8px 0 2px;">💡 KI-Vorschläge</div>
    <div class="ki-sidebar-sub" style="font-size:.69rem;color:#6b7280;margin-bottom:10px;line-height:1.4;">Klicken zum Ausfüllen der Grunddaten</div>
    ${KI_VORSCHLAEGE.map((v, i) => `
      <div class="ki-vorschlag-card" role="button" tabindex="0" onclick="applyKiVorschlag(${i})"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
        <div class="ki-vorschlag-top">
          <span class="ki-vorschlag-icon">${v.icon}</span>
          <span class="ki-vorschlag-name">${esc(v.name)}</span>
        </div>
        ${riskBadge(v.kategorie)}
        <div class="ki-vorschlag-hint">Felder vorausfüllen →</div>
      </div>
    `).join('')}`;
}

function hideKiVorschlaege() {
  $id('ki-vorschlaege-sidebar')?.remove();
  $id('view-antrag')?.classList.remove('ki-vorschlaege-active');
}

function applyKiVorschlag(idx) {
  const v = KI_VORSCHLAEGE[idx];
  if (!v) return;
  for (const [key, value] of Object.entries(v.felder)) {
    const el = $id(`f-${key}`);
    if (!el) continue;
    el.value = value;
    el.classList.remove('invalid');
    if (el.tagName === 'TEXTAREA') {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }
  document.querySelectorAll('.ki-vorschlag-card').forEach(c => c.classList.remove('ki-vorschlag-selected'));
  document.querySelectorAll('.ki-vorschlag-card')[idx]?.classList.add('ki-vorschlag-selected');
  $id('antrag-main-col')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(`✓ Grunddaten für „${esc(v.name)}" übernommen`);
}

async function refreshCurrentView() {
  const btn = $id('btn-refresh');
  if (btn) { btn.disabled = true; btn.classList.add('refreshing'); }
  _cacheTs[currentView] = 0;
  try {
    if      (currentView === 'antraege') await loadAntraege();
    else if (currentView === 'lizenzen') await loadLizenzen();
    else if (currentView === 'register') await loadRegister();
    showToast('Daten aktualisiert');
  } catch(e) {
    showToast('Fehler beim Aktualisieren: ' + esc(e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('refreshing'); }
  }
}

// ═══════════════════════════════════════════════════════════════════
// ANTRAG FORM
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// KI-RICHTLINIE MODAL (CO-10-01 – Version 1.0, Inkrafttreten 01.06.2026)
// ═══════════════════════════════════════════════════════════════════
function openRichtlinieModal() {
  $id('modal-title').textContent = 'KI-Richtlinie CO-10-01 – Richtlinie zur Nutzung von KI-Anwendungen';
  $id('modal-card').classList.add('modal-wide');
  $id('modal-body').innerHTML = '';
  $id('modal-overlay').classList.remove('hidden');
}

function closeModal(e) {
  if (e && e.target !== $id('modal-overlay')) return;
  $id('modal-overlay').classList.add('hidden');
  $id('modal-card').classList.remove('modal-wide');
}

// VERHALTENSKODEX MODAL (CO-01-01 – Version 1.2, Inkrafttreten 01.06.2026)
// ═══════════════════════════════════════════════════════════════════
function openVerhaltenskodexModal() {
  $id('modal-title').textContent = 'Verhaltenskodex CO-01-01 – DIHAG Holding GmbH';
  $id('modal-card').classList.add('modal-wide');
  $id('modal-body').innerHTML = '';
  $id('modal-overlay').classList.remove('hidden');
}

function renderAntragForm() {
  let html = '';
  let inSection = false;
  let inRow = false;

  const closeRow = () => { if (inRow) { html += '</div>'; inRow = false; } };
  const closeSection = () => { closeRow(); if (inSection) { html += '</div>'; inSection = false; } };

  for (const f of ANTRAG_FIELDS) {
    if (f.section) {
      closeSection();
      html += `<div class="form-section"><div class="form-section-title">${esc(f.section)}</div><div class="form-row">`;
      inSection = true; inRow = true;
      continue;
    }
    const isWide = f.type === 'textarea';
    const cls = isWide ? 'form-group full' : 'form-group';
    html += `<div class="${cls}">
      <label class="form-label" for="f-${f.key}">${esc(f.label)}${f.req ? '<span class="req">*</span>' : ''}</label>`;

    if (f.type === 'textarea') {
      html += `<textarea id="f-${f.key}" name="${f.key}" class="form-control" rows="3"${f.req ? ' required' : ''}></textarea>`;
    } else if (f.type === 'choice') {
      html += `<select id="f-${f.key}" name="${f.key}" class="form-control"${f.req ? ' required' : ''}>`;
      for (const c of f.choices) html += `<option value="${esc(c)}">${esc(c) || '– bitte wählen –'}</option>`;
      html += '</select>';
    } else {
      html += `<input id="f-${f.key}" name="${f.key}" type="${f.type}" class="form-control"${f.req ? ' required' : ''}/>`;
    }

    if (f.hint) html += `<div class="form-hint">${esc(f.hint)}</div>`;
    html += '</div>';
  }

  closeSection();

  // ── Mitbestimmung (KBR / Betriebsräte) ────────────────────────────
  // Kein SP-Pflichtfeld: wird gesondert erfasst und steuert den Mailversand
  // an Konzernbetriebsrat bzw. die Betriebsräte der betroffenen Werke.
  html += `
    <div class="form-section">
      <div class="form-section-title">Mitbestimmung</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="f-KBRBetroffen">Konzernbetriebsrat (KBR) betroffen?</label>
          <select id="f-KBRBetroffen" name="KBRBetroffen" class="form-control">
            <option value="Nein">Nein</option>
            <option value="Ja">Ja</option>
          </select>
          <div class="form-hint">Bei „Ja" wird der Antrag zusätzlich zur Prüfung an den Konzernbetriebsrat gesendet.</div>
        </div>
        <div class="form-group full">
          <label class="form-label">Betroffene Betriebsräte (Werke)</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:4px">
            ${MITBESTIMMUNG_WERKE.map(code => `
              <label class="settings-check" style="margin:0;font-size:.85rem;white-space:nowrap">
                <input type="checkbox" class="werk-check" value="${code}" id="werk-${code}">
                <span>${code}</span>
              </label>`).join('')}
          </div>
          <div class="form-hint">Werke auswählen, deren Betriebsrat zu beteiligen ist – der Antrag geht an den jeweils in den Einstellungen hinterlegten Betriebsrat.</div>
        </div>
      </div>
    </div>`;

  $id('form-antrag-fields').innerHTML = html;
}

async function submitAntrag(e) {
  e.preventDefault();
  const btn = $id('btn-submit');

  // Pflichtfelder prüfen
  let valid = true;
  let firstInvalid = null;
  document.querySelectorAll('#form-antrag-fields [required]').forEach(el => {
    el.classList.remove('invalid');
    if (!el.value.trim()) {
      el.classList.add('invalid');
      if (!firstInvalid) firstInvalid = el;
      valid = false;
    }
  });
  if (!valid) {
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => firstInvalid.focus(), 300);
    }
    return;
  }

  btn.disabled = true; btn.textContent = 'Wird eingereicht …';
  removeAntragError();

  // Spalten-Check-Funktion
  const colOk = name => !antragCols || antragCols.has(name);

  // Alle Formularwerte sammeln (ohne Status)
  const detailFields = {};
  for (const f of ANTRAG_FIELDS) {
    if (f.section) continue;
    const el = $id(`f-${f.key}`);
    if (!el || f.key === 'Title') continue;
    const v = el.value.trim();
    if (!v) continue;
    if (colOk(f.key)) detailFields[f.key] = spValue(f.type, v);
    else console.warn('Spalte nicht in SP-Liste gefunden, übersprungen:', f.key);
  }

  const titleEl = $id(`f-Title`);
  const titleVal = titleEl?.value.trim() || '–';

  // Mitbestimmung erfassen (vor form.reset() – Werte werden für Mailversand gebraucht)
  const kbrBetroffen    = $id('f-KBRBetroffen')?.value === 'Ja';
  const betroffeneWerke = [...document.querySelectorAll('.werk-check:checked')].map(c => c.value);

  try {
    // ── Schritt 1: Item mit nur Title erstellen ──────────────────────
    // Minimal-POST vermeidet 500 durch ungültige Feldnamen
    const newItem = await gPost(`/sites/${siteId}/lists/${listAntragId}/items`,
      { fields: { Title: titleVal } });

    if (!newItem?.id) throw new Error('Kein Item-ID in der Antwort');

    // ── Schritt 2: Details + Status per PATCH setzen ─────────────────
    const patchPayload = { ...detailFields };
    if (colOk(COL.status)) patchPayload[COL.status] = 'Eingereicht';

    // Genehmiger-Feld aus Einstellungen befüllen (Person-Mehrfachauswahl)
    if (COL.genehmiger && colOk(COL.genehmiger)) {
      try {
        const _genList = getGenehmiger();
        const genIds = [];
        for (const g of _genList) {
          const id = await resolveSpUserId(g.email, g.name);
          if (id) genIds.push(id);
        }
        if (genIds.length) {
          patchPayload[COL.genehmiger + 'LookupId@odata.type'] = 'Collection(Edm.Int32)';
          patchPayload[COL.genehmiger + 'LookupId'] = genIds;
        }
      } catch(eGen) { console.warn('Genehmiger-LookupId fehlgeschlagen:', eGen.message); }
    }

    try {
      await gPatch(`/sites/${siteId}/lists/${listAntragId}/items/${newItem.id}/fields`,
        patchPayload);
    } catch(ePatch) {
      // PATCH fehlgeschlagen — Item existiert, aber Details fehlen
      console.warn('Detail-PATCH fehlgeschlagen:', ePatch.message,
        '\nPayload:', JSON.stringify(patchPayload));
      // Zumindest Status versuchen
      if (colOk(COL.status)) {
        try {
          await gPatch(`/sites/${siteId}/lists/${listAntragId}/items/${newItem.id}/fields`,
            { [COL.status]: 'Eingereicht' });
        } catch(e2) { console.warn('Status-only-PATCH auch fehlgeschlagen:', e2.message); }
      }
      showAntragError('Antrag erstellt, aber Details konnten nicht gespeichert werden: ' + ePatch.message);
    }

    // ── Mitbestimmung best-effort in SP schreiben (isoliert – darf den
    //    Antrag nicht gefährden; Spalten optional, sonst still verworfen) ──
    const mitPayload = {};
    if (colOk('KBRBetroffen'))            mitPayload['KBRBetroffen'] = kbrBetroffen ? 'Ja' : 'Nein';
    if (colOk('BetroffeneBetriebsraete')) mitPayload['BetroffeneBetriebsraete'] = betroffeneWerke.join(', ');
    if (Object.keys(mitPayload).length) {
      try {
        await gPatch(`/sites/${siteId}/lists/${listAntragId}/items/${newItem.id}/fields`, mitPayload);
      } catch(eMit) {
        console.warn('Mitbestimmungs-Felder nicht gespeichert (Spalten fehlen/falscher Typ):', eMit.message);
      }
    }

    $id('form-antrag').reset();
    const s = $id('antrag-success');
    s.innerHTML = `✓ Ihr Antrag <strong>${esc(titleVal)}</strong> wurde eingereicht. Das KI-Koordinierungsgremium wird ihn prüfen.`;

    // Genehmiger automatisch per Graph-Mail benachrichtigen (wenn konfiguriert)
    // Antragsteller aus der Empfängerliste ausschließen – kein Self-Notify
    const _st = loadSettings();
    const _gen = getGenehmiger();
    const _myEmail = (account?.username || '').toLowerCase();
    const _genToNotify = _gen.filter(g => g.email.toLowerCase() !== _myEmail);
    if (_st.benachrichtigung?.beiEinreichung !== false && _genToNotify.length) {
      const sender  = account?.name || account?.username || 'Antragsteller';
      const deepUrl = `${location.origin}${location.pathname}?antrag=${newItem.id}`;
      sendMail(
        _genToNotify.map(g => ({ address: g.email, name: g.name })),
        `[KI-Antrag] #${newItem.id} ${titleVal} – Prüfung erforderlich`,
        mailTemplate(
          'Neuer KI-Antrag zur Prüfung eingegangen',
          [
            ['Bezeichnung',    titleVal],
            ['Antragsteller',  sender],
            ['Eingereicht am', new Date().toLocaleDateString('de-DE')],
          ],
          '🔍 Antrag direkt öffnen',
          deepUrl
        )
      ).then(() => showToast('📧 Genehmiger wurden automatisch benachrichtigt.'))
       .catch(e => {
         console.warn('Mail an Genehmiger fehlgeschlagen:', e.message);
         showToast('Antrag eingereicht – E-Mail-Benachrichtigung fehlgeschlagen (' + esc(e.message) + ')', 'error', 7000);
       });
    }

    // ── Mitbestimmung: KBR und betroffene Betriebsräte benachrichtigen ──
    // Empfänger stammen aus der zentralen Config (admin-gepflegt, vertrauenswürdig),
    // daher wird die jeweilige Domain für diesen Versand freigeschaltet.
    // Einzelversand: Betriebsräte sollen sich nicht gegenseitig als Empfänger sehen.
    (async () => {
      const recipients = [];
      if (kbrBetroffen) {
        const kbr = String(_kiCfg.kiKbrMail || '').trim();
        if (kbr) recipients.push({ address: kbr, name: 'Konzernbetriebsrat' });
        else showToast('Hinweis: KBR ist betroffen, aber es ist keine KBR-Mail hinterlegt (Einstellungen → Mitbestimmung).', 'error', 8000);
      }
      const fehlendeBr = [];
      for (const code of betroffeneWerke) {
        const m = String(_kiCfg.kiBrMails?.[code] || '').trim();
        if (m) recipients.push({ address: m, name: `Betriebsrat ${code}` });
        else fehlendeBr.push(code);
      }
      if (fehlendeBr.length) {
        showToast('Hinweis: Für diese Werke ist keine BR-Mail hinterlegt: ' + esc(fehlendeBr.join(', ')) + ' (Einstellungen → Mitbestimmung).', 'error', 8000);
      }
      if (!recipients.length) return;

      const senderC  = account?.name || account?.username || 'Antragsteller';
      const deepUrlC = `${location.origin}${location.pathname}?antrag=${newItem.id}`;
      const bodyC = mailTemplate(
        'KI-Antrag – Prüfung durch Mitbestimmung erforderlich',
        [
          ['Bezeichnung',    titleVal],
          ['Antragsteller',  senderC],
          ['Eingereicht am', new Date().toLocaleDateString('de-DE')],
        ],
        '🔍 Antrag ansehen',
        deepUrlC
      );
      let sentC = 0;
      for (const r of recipients) {
        const dom = r.address.includes('@') ? r.address.split('@').pop() : '';
        try {
          await sendMail([{ address: r.address, name: r.name }],
            `[KI-Antrag] #${newItem.id} ${titleVal} – Mitbestimmungsprüfung`,
            bodyC, dom ? [dom] : []);
          sentC++;
        } catch(eC) { console.warn('Mitbestimmungs-Mail fehlgeschlagen an', r.address, eC.message); }
      }
      if (sentC) showToast(`📧 Mitbestimmung: ${sentC} Empfänger (KBR/Betriebsrat) benachrichtigt.`);
    })();

    s.classList.remove('hidden');
    allAntraege = [];
    updateOpenBadge();

  } catch(err) {
    console.error('Antrag-Submit fehlgeschlagen:', err.message);
    showAntragError('Fehler beim Erstellen: ' + err.message);
  }

  btn.disabled = false; btn.textContent = 'Antrag einreichen';
}

function showAntragError(msg) {
  removeAntragError();
  const el = document.createElement('div');
  el.id = 'antrag-err';
  el.style.cssText = 'color:#dc2626;background:#fef2f2;border:1px solid #fca5a5;padding:10px 14px;border-radius:6px;margin-top:12px;font-size:.85rem';
  el.textContent = '✕ ' + msg;
  $id('btn-submit').after(el);
}
function removeAntragError() {
  $id('antrag-err')?.remove();
  $id('antrag-success')?.classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════════
// ANTRÄGE LIST
// ═══════════════════════════════════════════════════════════════════
async function loadAntraege() {
  if (!listAntragId) {
    $id('antraege-loading').textContent = 'Liste "' + LIST_ANTRAEGE + '" nicht gefunden.';
    return;
  }
  // Cache: noch frisch (< CACHE_TTL) und Daten vorhanden → direkt aus dem Speicher rendern, kein Fetch.
  // Der ↻-Button setzt _cacheTs[currentView]=0 und erzwingt so einen Neuabruf.
  if (allAntraege.length && Date.now() - _cacheTs.antraege < CACHE_TTL) {
    $id('antraege-loading').classList.add('hidden');
    renderAntraege();
    updateOpenBadge();
    return;
  }
  $id('antraege-loading').classList.remove('hidden');
  $id('antraege-list').innerHTML = '';

  try {
    // Alle Items laden – client-seitig filtern (SP Graph-Filter mit encodeURIComponent('@') bricht den OData-Filter)
    const apiUrl = `/sites/${siteId}/lists/${listAntragId}/items?$expand=fields($select=*)&$top=999`;
    let rawItems;
    try {
      rawItems = await gGetAll(apiUrl);   // folgt @odata.nextLink → keine stille Begrenzung bei >999
    } catch(loadErr) {
      console.warn('Items-Abruf fehlgeschlagen:', loadErr.message);
      throw loadErr;
    }
    // Client-seitig sortieren — vermeidet 400 bei nicht-indizierten Feldern
    allAntraege = rawItems.sort((a, b) => {
      const da = new Date(a.fields?.Created || a.createdDateTime || 0);
      const db = new Date(b.fields?.Created || b.createdDateTime || 0);
      return db - da;
    });
    _cacheTs.antraege = Date.now();
    renderAntraege();
    updateOpenBadge();

    // Deep-Link: ?antrag=ID → Antrag-Panel direkt öffnen
    const deepId = new URLSearchParams(location.search).get('antrag');
    if (deepId) {
      const target = allAntraege.find(i => String(i.id) === String(deepId));
      if (target) {
        openAntragPanel(target.id);
        // URL sauber halten – ID aus der Adresszeile entfernen
        history.replaceState({}, '', location.pathname);
      }
    }
  } catch(e) {
    $id('antraege-loading').textContent = 'Fehler beim Laden: ' + e.message;
    console.error('loadAntraege:', e);
  }
}

function filterAntraege() { renderAntraege(); }

function renderAntraege() {
  const statusF = $id('filter-status')?.value || '';
  const riskF   = $id('filter-risk')?.value   || '';
  const searchQ = ($id('search-antraege')?.value || '').toLowerCase().trim();

  // Non-Gremium: nur eigene Anträge anzeigen
  const myEmail = (account?.username || account?.idTokenClaims?.preferred_username || '').toLowerCase();

  let items = allAntraege.filter(i => {
    const f = i.fields;
    if (f?.Title === SP_CONFIG_TITLE) return false;  // Internen Config-Eintrag ausblenden
    if (statusF && f[COL.status] !== statusF) return false;
    if (riskF   && f[COL.risiko] !== riskF)  return false;
    const itemAuthor = (i.createdBy?.user?.email || f.Author0EMail || '').toLowerCase();
    if (!isGremium && myEmail && itemAuthor !== myEmail) return false;
    if (searchQ) {
      const hay = [f.Title, f[COL.hersteller], f[COL.verantw], f[COL.komponenten]].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(searchQ)) return false;
    }
    return true;
  });

  $id('antraege-loading').classList.add('hidden');
  $id('antraege-sub').textContent = isGremium
    ? `${items.length} Antrag/Anträge angezeigt`
    : 'Meine eingereichten Anträge';

  if (!items.length) {
    $id('antraege-list').innerHTML = '<div class="empty-state">Keine Anträge gefunden.</div>';
    return;
  }

  $id('antraege-list').innerHTML = items.map(i => {
    const f  = i.fields;
    const dt = fmtDate(f.Created || i.createdDateTime);
    const by = f.Author0LookupValue || f['Author/Title'] || '';
    return `<div class="item-card" role="button" tabindex="0" onclick="openAntragPanel(${i.id})"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
      <div class="card-top">
        <div class="card-title">${esc(f.Title || '–')} <span style="font-size:.72rem;font-weight:500;color:#9ca3af;margin-left:4px">#${i.id}</span></div>
        ${statusBadge(f[COL.status])}
      </div>
      <div class="card-tags">
        ${riskBadge(f[COL.risiko])}
        ${f[COL.nutzungsart] ? `<span class="badge-type">${esc(f[COL.nutzungsart])}</span>` : ''}
      </div>
      <div class="card-meta">
        <span>${esc(f[COL.hersteller] || '')}</span>
        <span>📅 ${dt}</span>
        ${by ? `<span>👤 ${esc(by)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function updateOpenBadge() {
  // Badge deaktiviert
}

// ═══════════════════════════════════════════════════════════════════
// ANTRAG PANEL
// ═══════════════════════════════════════════════════════════════════
function openAntragPanel(itemId) {
  const item = allAntraege.find(i => i.id == itemId);
  if (!item) return;
  currentPanelItemId = itemId;
  if (item.fields?.Title === SP_CONFIG_TITLE) return;  // Config-Item nicht öffnen
  const f = item.fields;

  $id('panel-title').innerHTML = `${statusBadge(f[COL.status])} <span style="margin-left:8px">${esc(f.Title || '–')}</span> <span style="font-size:.72rem;font-weight:500;color:#9ca3af;margin-left:6px">#${item.id}</span>`;

  const row = (label, value, pre = false) =>
    `<div class="panel-field">
      <div class="panel-field-label">${esc(label)}</div>
      <div class="panel-field-value${pre ? ' pre' : ''}">${value || '<span style="color:#9ca3af">–</span>'}</div>
    </div>`;

  // Genehmiger aus aktuellen Einstellungen lesen (nicht aus SP-Item – dort stehen ggf. veraltete Namen)
  const genehmigerNames = getGenehmiger().map(g => g.name || g.email).filter(Boolean).join(', ');

  const rows1 = `
    <div class="panel-section">
      <div class="panel-section-title">Grunddaten</div>
      ${row('Bezeichnung',         esc(f.Title))}
      ${row('Verantwortl. Stelle', esc(f[COL.verantw]))}
      ${row('Hersteller',          esc(f[COL.hersteller]))}
      ${row('Nutzungsart',         esc(f[COL.nutzungsart]))}
      ${row('Risikokategorie',     riskBadge(f[COL.risiko]))}
      ${row('Geplanter Einsatz',   fmtDate(f[COL.projektplanung]))}
      ${row('Key User / Schulung', esc(f[COL.keyUser]))}
      ${genehmigerNames ? row('Genehmiger', esc(genehmigerNames)) : ''}
    </div>
    <div class="panel-section">
      <div class="panel-section-title">KI-Beschreibung</div>
      ${row('KI-Komponenten',             esc(f[COL.komponenten]), true)}
      ${row('Zweck laut Hersteller',      esc(f[COL.zweckHersteller]), true)}
      ${row('Anwendungsbereich intern',   esc(f[COL.zweckUnternehmen]), true)}
    </div>`;

  // ── Mitbestimmung (nur anzeigen, wenn Werte vorhanden) ────────────
  const _kbrRaw   = f.KBRBetroffen;
  const _kbrDisp  = (_kbrRaw === true || _kbrRaw === 'Ja')  ? 'Ja'
                  : (_kbrRaw === false || _kbrRaw === 'Nein') ? 'Nein' : '';
  const _werkeDisp = f.BetroffeneBetriebsraete || '';
  const mitbestimmungSection = (_kbrDisp || _werkeDisp) ? `
    <div class="panel-section">
      <div class="panel-section-title">Mitbestimmung</div>
      ${row('Konzernbetriebsrat (KBR)', _kbrDisp ? esc(_kbrDisp) : '')}
      ${row('Betroffene Betriebsräte',  _werkeDisp ? esc(_werkeDisp) : '')}
    </div>` : '';

  // APPROVALS-Token aus Kommentar für die Anzeige entfernen
  const kommentarClean = (f[COL.gremiumKommentar] || '').replace(/\[APPROVALS:[^\]]*\]\n?/g, '').trim();

  const isDecided      = ['Genehmigt', 'Abgelehnt'].includes(f[COL.status]);

  // Einstimmig-Modus: Abstimmungsstand aus GremiumKommentar lesen
  const _stPanel       = loadSettings();
  const einstimmig     = (_stPanel.benachrichtigung?.genehmigungsmodus || 'einstimmig') === 'einstimmig';
  const _genPanel      = getGenehmiger();
  const panelApprovals = parseApprovals(f[COL.gremiumKommentar]);
  const myEmailPanel   = (account?.username || '').toLowerCase();

  // Self-Approval-Guard
  const antragAuthorEmail  = (item.createdBy?.user?.email || f.Author0EMail || '').toLowerCase();
  const isOwnAntrag        = myEmailPanel && antragAuthorEmail && myEmailPanel === antragAuthorEmail;
  const effectiveGenehmiger  = _genPanel.filter(g => g.email.toLowerCase() !== antragAuthorEmail);
  const myApprovedAlready    = panelApprovals.includes(myEmailPanel);
  const showApprovalTracker  = einstimmig && effectiveGenehmiger.length >= 1;

  // ── Gemeinsamer Zustimmungsstand-Block (alle User sehen ihn) ──────
  const approvalTrackerHTML = (showApprovalTracker && !isDecided) ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:.82rem">
      <div style="font-weight:600;color:#15803d;margin-bottom:8px">⚖️ Einstimmig – Zustimmungsstand</div>
      ${effectiveGenehmiger.map(g => {
        const approved = panelApprovals.includes(g.email.toLowerCase());
        const rc2 = ROLLE_COLORS[g.rolle] || null;
        const rolleBadge2 = g.rolle && rc2
          ? `<span style="font-size:.65rem;font-weight:600;padding:1px 7px;border-radius:20px;background:${rc2.bg};color:${rc2.color};border:1px solid ${rc2.border}">${esc(g.rolle)}</span>`
          : '';
        return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0">
          <span style="color:${approved ? '#15803d' : '#9ca3af'};font-size:1rem">${approved ? '✓' : '○'}</span>
          <span style="${approved ? 'color:#15803d;font-weight:500' : 'color:#6b7280'}">${esc(g.name || g.email)}</span>
          ${rolleBadge2}
        </div>`;
      }).join('')}
    </div>` : '';

  // ── Gemeinsamer Kommentar-Verlauf (alle User) ─────────────────────
  const verlaufHTML = kommentarClean ? `
    <div style="margin-bottom:14px">
      <div style="font-size:.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">💬 Kommentar-Verlauf</div>
      <div style="max-height:220px;overflow-y:auto;border:1px solid #e5e9ef;border-radius:8px;padding:0 12px;background:#fafafa">
        ${renderKommentarLog(kommentarClean)}
      </div>
    </div>` : '';

  // ── Auflagen (alle User, nur wenn vorhanden) ──────────────────────
  const auflagenHTML = f[COL.auflagen] ? `
    <div style="margin-bottom:14px">
      <div class="panel-field-label">Auflagen / Bedingungen</div>
      <div class="panel-field-value pre" style="background:#fffbeb;padding:8px 10px;border-radius:7px;border:1px solid #fde68a">${esc(f[COL.auflagen])}</div>
    </div>` : '';

  // ── Status-Info (Freigabedatum) ───────────────────────────────────
  const statusInfoHTML = isDecided ? `
    <div style="margin-bottom:12px">
      ${statusBadge(f[COL.status])}
      ${f[COL.freigabeDatum] ? `<span style="font-size:.8rem;color:#6b7280;margin-left:8px">📅 ${fmtDate(f[COL.freigabeDatum])}</span>` : ''}
    </div>` : '';

  // ── Kommentarfeld für ALLE User (Rückfrage-Antwort oder normaler Kommentar) ──
  const isRueckfrage = f[COL.status] === 'Rückfrage';
  const userKommentarSection = !isDecided ? `
    <div style="margin-top:4px">
      <div class="form-group">
        <label class="form-label">${isRueckfrage ? '💬 Antwort auf Rückfrage' : 'Kommentar'} <span style="color:#9ca3af;font-weight:400">${isGremium && !isRueckfrage ? '(Pflicht bei Ablehnung)' : '(optional)'}</span></label>
        <textarea id="pg-kommentar" class="form-control" rows="2" maxlength="1000"
          style="resize:none;overflow:hidden;min-height:60px"
          oninput="this.classList.remove('invalid');this.style.height='auto';this.style.height=Math.max(60,this.scrollHeight)+'px';$id('pg-kom-count').textContent=this.value.length+'/1000';const _rb=$id('btn-rueckfrage');if(_rb)_rb.disabled=!this.value.trim();"
          placeholder="${isRueckfrage ? 'Bitte beantworten Sie die Rückfrage hier…' : 'Neuen Kommentar eingeben…'}"></textarea>
        <div style="text-align:right;font-size:.71rem;color:#9ca3af;margin-top:3px"><span id="pg-kom-count">0/1000</span></div>
      </div>
      ${!isGremium ? `<button class="btn btn-primary btn-sm" onclick="saveUserKommentar(${item.id})">💬 Kommentar senden</button>` : ''}
    </div>` : '';

  // ── Für alle User: Status-Sektion (read-only Felder) ─────────────
  const statusSection = !isGremium ? `
    <div class="panel-section">
      <div class="panel-section-title">Status</div>
      ${row('Aktueller Status', statusBadge(f[COL.status]))}
      ${f[COL.freigabeDatum] ? row('Freigabedatum', fmtDate(f[COL.freigabeDatum])) : ''}
    </div>` : '';

  // ── Für alle User: Verlauf + Zustimmungsstand + Kommentarfeld ─────
  const verlaufSection = `
    <div class="panel-gremium">
      <div class="panel-gremium-title">⚖️ Gremium-Entscheidung</div>
      ${statusInfoHTML}
      ${approvalTrackerHTML}
      ${verlaufHTML}
      ${auflagenHTML}
      ${userKommentarSection}
    </div>`;

  // ── Nur Gremium: Aktionsbuttons ───────────────────────────────────
  const gremiumSection = isGremium ? `
    <div style="margin-top:4px">
      ${isOwnAntrag ? `
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;margin-bottom:12px;font-size:.82rem;color:#92400e">
          ℹ️ <strong>Eigener Antrag</strong> – du bist der Antragsteller und kannst diesen Antrag nicht selbst genehmigen.
        </div>
      ` : isDecided ? `
        <div style="margin-top:4px;padding-top:12px;border-top:1px solid #e5e9ef">
          <button class="btn btn-neutral btn-sm" style="font-size:.75rem;opacity:.7"
            onclick="if(confirm('Entscheidung wirklich zurücksetzen und Antrag auf „Eingereicht" setzen?')) saveGremiumDecision(${item.id},'Eingereicht')"
            title="Entscheidung zurücksetzen">↩ Zurücksetzen</button>
        </div>
      ` : `
        <div class="form-group">
          <label class="form-label">Auflagen / Bedingungen <span style="color:#9ca3af;font-weight:400;font-size:.75rem">(bei Genehmigung)</span></label>
          <textarea id="pg-auflagen" class="form-control" rows="2" placeholder="Ggf. Auflagen oder Bedingungen…">${esc(f[COL.auflagen] || '')}</textarea>
        </div>
        <div class="panel-actions">
          <button class="btn btn-success btn-sm" ${myApprovedAlready ? 'disabled' : ''} onclick="saveGremiumDecision(${item.id},'Genehmigt')">${showApprovalTracker && !myApprovedAlready ? '✓ Zustimmen' : showApprovalTracker && myApprovedAlready ? '✓ Bereits zugestimmt' : '✓ Genehmigen'}</button>
          <button class="btn btn-danger btn-sm" onclick="saveGremiumDecision(${item.id},'Abgelehnt')">✕ Ablehnen</button>
          <button id="btn-rueckfrage" class="btn btn-neutral btn-sm" disabled title="Bitte zuerst einen Kommentar eingeben" onclick="saveGremiumDecision(${item.id},'Rückfrage')">? Rückfrage</button>
          <button class="btn btn-neutral btn-sm" onclick="saveGremiumDecision(${item.id},${JSON.stringify(STATUS_OPTS.includes(f[COL.status]) ? f[COL.status] : 'In Prüfung')})">💾 Kommentar speichern</button>
        </div>
        ${einstimmig ? '<div style="font-size:.75rem;color:#6b7280;margin-top:6px">ℹ️ Eine Ablehnung ist sofort final – unabhängig vom Einstimmig-Modus.</div>' : ''}
      `}
    </div>` : '';

  // Rückfrage-Section nicht mehr separat nötig (in verlaufSection enthalten)
  const rueckfrageSection = '';

  // Anhänge-Platzhalter (wird async befüllt)
  const attachSection = `
    <div class="panel-section" id="panel-attachments">
      <div class="panel-section-title">📎 Anhänge</div>
      <div id="att-list" class="att-list"><span style="color:#9ca3af;font-size:.8rem">Lade Anhänge…</span></div>
      ${isGremium ? `
        <div id="att-drop" class="att-drop" ondragover="attDragOver(event)" ondragleave="attDragLeave(event)" ondrop="attDrop(event,${item.id})">
          <span class="att-drop-icon">📁</span>
          <span>Datei hierher ziehen oder</span>
          <label class="att-drop-btn">
            Datei auswählen
            <input type="file" id="att-file-input" multiple style="display:none" onchange="attFileSelect(event,${item.id})">
          </label>
        </div>
      ` : ''}
    </div>`;

  $id('panel-body').innerHTML = rows1 + mitbestimmungSection + statusSection + verlaufSection + gremiumSection + attachSection;
  openPanel();

  // Anhänge asynchron nachladen (ohne await – kein Blockieren)
  renderAttachments(item.id);
}

async function saveGremiumDecision(itemId, forceStatus) {
  const status    = forceStatus || 'In Prüfung';
  const kommentar = $id('pg-kommentar')?.value?.trim() || '';
  const auflagen  = $id('pg-auflagen')?.value?.trim()  || '';

  // ── B: Einmal .find() – überall wiederverwenden ───────────────
  const prevItem      = allAntraege.find(i => i.id == itemId);
  const antragAuthorG = (prevItem?.createdBy?.user?.email || prevItem?.fields?.Author0EMail || '').toLowerCase();
  const myEmail       = (account?.username || '').toLowerCase();
  let finalApprovalsList = []; // wird im einstimmig-Block befüllt, für Mail genutzt

  // ── Validierung VOR dem Sperren der Buttons ───────────────────
  // (sonst bleiben die Buttons bei einem Abbruch dauerhaft deaktiviert)
  // Self-Approval-Guard
  if (myEmail && antragAuthorG && myEmail === antragAuthorG &&
      (status === 'Genehmigt' || status === 'Abgelehnt' || status === 'Rückfrage')) {
    showToast('Eigene Anträge können nicht selbst genehmigt werden.', 'error');
    return;
  }

  // Ablehnung UND Rückfrage erfordern zwingend eine Begründung
  if ((status === 'Abgelehnt' || status === 'Rückfrage') && !kommentar) {
    const was = status === 'Abgelehnt' ? 'Ablehnung' : 'Rückfrage';
    showToast(`Bitte einen Kommentar eingeben – eine ${was} muss begründet werden.`, 'error');
    const _k = $id('pg-kommentar');
    if (_k) { _k.classList.add('invalid'); _k.focus(); }
    return;
  }

  // ── Ab hier: Buttons sperren + Settings einmalig laden ────────
  const actionBtns = document.querySelectorAll('.panel-actions .btn');
  actionBtns.forEach(b => { b.disabled = true; });
  const st = { ...loadSettings(), genehmiger: getGenehmiger() };  // Genehmiger immer frisch aus SP-Cache

  try {
    const prevKomRaw    = prevItem?.fields?.[COL.gremiumKommentar] || '';
    const now           = new Date().toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'})
                        + ' ' + new Date().toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});
    const displayName   = (account?.name || account?.username || '').trim();
    const nowAuthor     = displayName ? `${now} | ${displayName}` : now;

    // Immer Aktion + optionaler Kommentar darunter – Aktion nie weglassen
    const actionLabels = { 'Genehmigt':   '✓ Antrag genehmigt.',
                           'Abgelehnt':   '✕ Antrag abgelehnt.',
                           'Rückfrage':   '❓ Rückfrage gestellt.',
                           'In Prüfung':  '🔍 In Prüfung gesetzt.',
                           'Eingereicht': '📝 Status zurückgesetzt.' };
    const cleanBase    = prevKomRaw.replace(/\[APPROVALS:[^\]]*\]\n?/g, '').trim();
    const actionLine   = actionLabels[status] || status;
    const entryText    = kommentar ? `${actionLine}\n${kommentar}` : actionLine;
    const newKommentar = cleanBase
      ? `[${nowAuthor}] ${entryText}\n──\n${cleanBase}`
      : `[${nowAuthor}] ${entryText}`;

    // ── Einstimmig-Modus: Teilzustimmung verfolgen ───────────────
    if (status === 'Genehmigt') {
      const modus  = st.benachrichtigung?.genehmigungsmodus || 'einstimmig';
      if (modus === 'einstimmig') {
        const genAll = st.genehmiger || [];
        const genD   = genAll.filter(g => g.email.toLowerCase() !== antragAuthorG);
        if (genD.length >= 1) {
          // ── Race-Condition-Schutz: frischen SP-Stand lesen bevor APPROVALS gemergt werden ──
          let liveKomRaw = prevKomRaw;
          try {
            const freshData = await gGet(
              `/sites/${siteId}/lists/${listAntragId}/items/${itemId}?$expand=fields($select=${COL.gremiumKommentar})`
            );
            liveKomRaw = freshData?.fields?.[COL.gremiumKommentar] || prevKomRaw;
          } catch(_) { /* Fallback auf prevKomRaw */ }

          const approvals = parseApprovals(liveKomRaw);
          if (!approvals.includes(myEmail)) approvals.push(myEmail);
          const allApproved = genD.every(g => approvals.includes(g.email.toLowerCase()));

          if (!allApproved) {
            // Noch nicht alle zugestimmt → Zwischenspeichern mit Verlaufseintrag
            const liveClean   = liveKomRaw.replace(/\[APPROVALS:[^\]]*\]\n?/g, '').trim();
            const partialText = kommentar ? `✓ Zugestimmt.\n${kommentar}` : '✓ Zugestimmt.';
            const partialBody = liveClean
              ? `[${nowAuthor}] ${partialText}\n──\n${liveClean}`
              : `[${nowAuthor}] ${partialText}`;
            const appToken   = `[APPROVALS:${approvals.join('|')}]`;
            const partialKom = `${appToken}\n${partialBody}`;

            // ── A: Mail NUR nach erfolgreichem PATCH senden ──────
            await gPatch(
              `/sites/${siteId}/lists/${listAntragId}/items/${itemId}/fields`,
              { [COL.status]: 'In Prüfung', [COL.gremiumKommentar]: partialKom }
            );
            const idx2 = allAntraege.findIndex(i => i.id == itemId);
            if (idx2 >= 0) Object.assign(allAntraege[idx2].fields,
              { [COL.status]: 'In Prüfung', [COL.gremiumKommentar]: partialKom });

            const remaining     = genD.filter(g => !approvals.includes(g.email.toLowerCase()));
            const remainingNames = remaining.map(g => g.name || g.email);
            showToast(`✓ Zustimmung gespeichert. Noch ausstehend: ${remainingNames.join(', ')}`);

            if (remaining.length && st.benachrichtigung?.beiEinreichung !== false) {
              // Alle bisher Zugestimmten für die Mail zusammenstellen
              const approvedNames = approvals.map(email => {
                const g = genAll.find(x => x.email.toLowerCase() === email.toLowerCase());
                return g?.name || email;
              });
              sendMail(
                remaining.map(g => ({ address: g.email, name: g.name })),
                `[KI-Antrag] #${itemId} ${prevItem?.fields?.Title || ''} – Zustimmung ausstehend`,
                mailTemplate(
                  'Zustimmung zu einem KI-Antrag ausstehend',
                  [
                    ['KI-System',    prevItem?.fields?.Title || ''],
                    ['Bereits zugestimmt', approvedNames.join(', ')],
                    ['Noch ausstehend',    remainingNames.join(', ')],
                    ['Datum',        new Date().toLocaleDateString('de-DE')],
                  ],
                  '✓ Jetzt zustimmen',
                  `${location.origin}${location.pathname}?antrag=${itemId}`
                )
              ).catch(e => console.warn('Genehmiger-Reminder fehlgeschlagen:', e.message));
            }

            renderAntraege();
            updateOpenBadge();
            closePanel();
            return;
          }
          // Alle zugestimmt → Token ist bereits aus newKommentar raus (cleanBase oben)
          finalApprovalsList = approvals; // für Mail-Versand merken
        }
      }
    }

    // ── Finale Entscheidung speichern ────────────────────────────
    const fields = { [COL.status]: status, [COL.gremiumKommentar]: newKommentar };
    if (auflagen) fields[COL.auflagen] = auflagen;
    if (status === 'Genehmigt') fields[COL.freigabeDatum] = new Date().toISOString().slice(0, 10);

    // Diagnose: prüfe ob alle Spalten im SP-Schema vorhanden sind
    if (antragCols) {
      Object.keys(fields).forEach(k => {
        if (!antragCols.has(k)) console.warn(`⚠️ saveGremiumDecision: Spalte "${k}" nicht in antragCols – wird SP ignorieren! Verfügbare Spalten: ${[...antragCols].sort().join(', ')}`);
      });
    }

    await gPatch(`/sites/${siteId}/lists/${listAntragId}/items/${itemId}/fields`, fields);
    const idx = allAntraege.findIndex(i => i.id == itemId);
    if (idx >= 0) Object.assign(allAntraege[idx].fields, fields);

    const antragAfter = allAntraege.find(i => i.id == itemId);
    const savedName   = antragAfter?.fields?.Title || '';
    showToast(`✓ Entscheidung „${status}" gespeichert${savedName ? ' für ' + savedName : ''}.`);

    // ── A: Antragsteller-Mail NUR nach erfolgreichem PATCH ────────
    if ((status === 'Genehmigt' || status === 'Abgelehnt' || status === 'Rückfrage') && antragAfter) {
      const authorEmail = antragAfter.createdBy?.user?.email || antragAfter.fields?.Author0EMail || '';
      const authorName  = antragAfter.fields?.Author0LookupValue || antragAfter.createdBy?.user?.displayName || authorEmail;
      const deepUrl     = `${location.origin}${location.pathname}?antrag=${antragAfter.id}`;

      if (st.benachrichtigung?.beiEntscheidung !== false && authorEmail) {
        const statusEmoji = status === 'Genehmigt' ? '✅' : status === 'Abgelehnt' ? '❌' : '❓';
        // Alle Genehmiger die zugestimmt haben (aus finalApprovalsList – APPROVALS-Token ist im finalen Kommentar nicht mehr vorhanden)
        const allGenehmigerCfg = st.genehmiger || [];
        const allApprovedNames = status === 'Genehmigt' && finalApprovalsList.length
          ? finalApprovalsList.map(e => {
              const g = allGenehmigerCfg.find(x => x.email.toLowerCase() === e.toLowerCase());
              return g?.name || e;
            })
          : [account?.name || myEmail];

        const infoRows = [
          ['KI-System',    savedName],
          ['Entscheidung', `${statusEmoji} ${status}`],
          ['Entscheider',  account?.name || myEmail],
          ['Datum',        new Date().toLocaleDateString('de-DE')],
        ];
        if (status === 'Genehmigt' && allApprovedNames.length > 1)
          infoRows.push(['Zugestimmt von', allApprovedNames.join(', ')]);
        if (kommentar) infoRows.push(['Begründung', kommentar]);
        if (auflagen)  infoRows.push(['Auflagen / Bedingungen', auflagen]);

        sendMail(
          [{ address: authorEmail, name: authorName }],
          `[KI-Antrag] #${itemId} ${savedName} – ${status}`,
          mailTemplate(
            `Ihr KI-Antrag wurde ${status === 'Genehmigt' ? 'genehmigt' : status === 'Abgelehnt' ? 'abgelehnt' : 'mit einer Rückfrage versehen'}`,
            infoRows,
            status === 'Rückfrage' ? '💬 Rückfrage beantworten' : '📋 Antrag im Dashboard anzeigen',
            deepUrl
          )
        ).then(() => showToast(`📧 ${authorName || authorEmail} automatisch benachrichtigt.`))
         .catch(e => {
           console.warn('Mail an Antragsteller fehlgeschlagen:', e.message);
           showToast('Entscheidung gespeichert – E-Mail fehlgeschlagen: ' + esc(e.message), 'error', 7000);
         });
      }

      // ── Abschluss-Mail an alle Genehmiger bei finaler Genehmigung ──
      if (status === 'Genehmigt' && st.benachrichtigung?.beiEntscheidung !== false) {
        const allGenehmigerCfg = st.genehmiger || [];
        const allApprovedNames = finalApprovalsList.length
          ? finalApprovalsList.map(e => {
              const g = allGenehmigerCfg.find(x => x.email.toLowerCase() === e.toLowerCase());
              return g?.name || e;
            })
          : [account?.name || myEmail];
        const genehmigerRecipients = allGenehmigerCfg.filter(g => g.email.toLowerCase() !== myEmail);
        if (genehmigerRecipients.length) {
          sendMail(
            genehmigerRecipients.map(g => ({ address: g.email, name: g.name })),
            `[KI-Antrag] #${itemId} ${savedName} – ✅ Einstimmig genehmigt`,
            mailTemplate(
              'KI-Antrag wurde einstimmig genehmigt',
              [
                ['KI-System',        savedName],
                ['Zugestimmt von',   allApprovedNames.join(', ')],
                ['Freigabedatum',    new Date().toLocaleDateString('de-DE')],
                ...(auflagen ? [['Auflagen', auflagen]] : []),
              ],
              '📋 Antrag anzeigen',
              deepUrl
            )
          ).catch(e => console.warn('Abschluss-Mail an Genehmiger fehlgeschlagen:', e.message));
        }
      }
    }

    // Bei Genehmigung: automatisch Draft-Lizenz erstellen
    if (status === 'Genehmigt' && listLizenzId) {
      const systemName = antragAfter?.fields?.Title;
      if (systemName) {
        try {
          let lizenzen = allLizenzen;
          if (!lizenzen.length) {
            const d = await gGet(`/sites/${siteId}/lists/${listLizenzId}/items?$expand=fields($select=Title,${COL.kiSystem})&$top=999`);
            lizenzen = d.value || [];
          }
          const exists = lizenzen.some(l =>
            (l.fields?.[COL.kiSystem] || l.fields?.Title || '').toLowerCase() === systemName.toLowerCase()
          );
          if (!exists) {
            const newLiz = await gPost(`/sites/${siteId}/lists/${listLizenzId}/items`,
              { fields: { Title: systemName } });
            if (newLiz?.id) {
              const draftNote = '⚠ Automatisch erstellt – bitte Lizenzdetails ergänzen';
              const patchUrl  = `/sites/${siteId}/lists/${listLizenzId}/items/${newLiz.id}/fields`;
              let notesSaved  = false;
              for (const nKey of [COL.notizen, 'Notizen', 'Notes', 'Bemerkungen']) {
                if (lizenzCols && !lizenzCols.has(nKey)) continue;
                try {
                  await gPatch(patchUrl, { [nKey]: draftNote });
                  COL.notizen = nKey;
                  notesSaved  = true;
                  break;
                } catch(e) { console.warn('Auto-Lizenz Notizen (', nKey, '):', e.message); }
              }
              if (!notesSaved) console.warn('Auto-Lizenz: Notizen-Spalte konnte nicht gesetzt werden');
            }
            allLizenzen = [];
            console.log('✓ Draft-Lizenz automatisch erstellt:', systemName);
          }
        } catch(eLiz) {
          console.warn('Auto-Lizenz Erstellung fehlgeschlagen:', eLiz.message);
        }
      }
    }

    closePanel();
    renderAntraege();
    updateOpenBadge();

  } catch(e) {
    showToast('Fehler beim Speichern: ' + esc(e.message), 'error');
  } finally {
    // ── D: Buttons freigeben – btn-rueckfrage nur wenn Kommentar vorhanden ──
    const hasKommentar = !!$id('pg-kommentar')?.value?.trim();
    actionBtns.forEach(b => {
      b.disabled = (b.id === 'btn-rueckfrage') ? !hasKommentar : false;
    });
  }
}

// Kommentar von einem normalen User speichern (kein Statuswechsel)
async function saveUserKommentar(itemId) {
  const btn = document.querySelector(`[onclick="saveUserKommentar(${itemId})"]`);
  const text = $id('pg-kommentar')?.value?.trim() || '';
  if (!text) {
    showToast('Bitte einen Kommentar eingeben.', 'error');
    $id('pg-kommentar')?.focus();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Senden…'; }

  try {
    const item       = allAntraege.find(i => i.id == itemId);
    const prevKomRaw = item?.fields?.[COL.gremiumKommentar] || '';
    const now        = new Date().toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'})
                     + ' ' + new Date().toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});
    const displayName = (account?.name || account?.username || '').trim();
    const nowAuthor   = displayName ? `${now} | ${displayName}` : now;

    // APPROVALS-Token erhalten; neuen Eintrag oben anhängen
    const appTokenMatch = prevKomRaw.match(/(\[APPROVALS:[^\]]*\])\n?/);
    const appToken      = appTokenMatch ? appTokenMatch[1] : '';
    const cleanBase     = prevKomRaw.replace(/\[APPROVALS:[^\]]*\]\n?/g, '').trim();
    const newEntry      = `[${nowAuthor}] 💬 ${text}`;
    const newBody       = cleanBase ? `${newEntry}\n──\n${cleanBase}` : newEntry;
    const newKommentar  = appToken ? `${appToken}\n${newBody}` : newBody;

    const isRueckfrageAntwort = item?.fields?.[COL.status] === 'Rückfrage';

    const fields = { [COL.gremiumKommentar]: newKommentar };
    // Rückfrage-Antwort setzt Status automatisch auf Eingereicht
    if (isRueckfrageAntwort) fields[COL.status] = 'Eingereicht';

    await gPatch(`/sites/${siteId}/lists/${listAntragId}/items/${itemId}/fields`, fields);

    const idx = allAntraege.findIndex(i => i.id == itemId);
    if (idx >= 0) Object.assign(allAntraege[idx].fields, fields);

    showToast(isRueckfrageAntwort ? '✓ Antwort auf Rückfrage eingereicht.' : '💬 Kommentar gespeichert.');

    // Bei Rückfrage-Antwort: Genehmiger per E-Mail benachrichtigen
    if (isRueckfrageAntwort) {
      const _st = loadSettings();
      if (_st.benachrichtigung?.beiEinreichung !== false) {
        const genehmiger = getGenehmiger();
        const senderName = displayName || (account?.username || '');
        const antragTitle = item?.fields?.Title || '';
        const deepUrl = `${location.origin}${location.pathname}?antrag=${itemId}`;
        sendMail(
          genehmiger.map(g => ({ address: g.email, name: g.name })),
          `[KI-Antrag] #${itemId} ${antragTitle} – Rückfrage beantwortet`,
          mailTemplate(
            'Rückfrage wurde beantwortet',
            [
              ['KI-System',   antragTitle],
              ['Beantwortet von', senderName],
              ['Kommentar',   text],
              ['Datum',       new Date().toLocaleDateString('de-DE')],
            ],
            '💬 Antwort im Dashboard ansehen',
            deepUrl
          )
        ).catch(e => console.warn('Mail an Genehmiger (Rückfrage-Antwort) fehlgeschlagen:', e.message));
      }
    }

    openAntragPanel(itemId);  // Panel neu rendern (frische Daten aus allAntraege)
  } catch(e) {
    showToast('Fehler beim Speichern: ' + esc(e.message), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💬 Kommentar senden'; }
  }
}

// ═══════════════════════════════════════════════════════════════════
// LIZENZEN
// ═══════════════════════════════════════════════════════════════════
async function loadLizenzen() {
  if (!listLizenzId) {
    $id('lizenzen-loading').textContent = 'Liste "' + LIST_LIZENZEN + '" nicht gefunden oder kein Zugriff.';
    return;
  }
  // Cache: noch frisch → direkt rendern, kein Fetch (↻ erzwingt Neuabruf via _cacheTs=0)
  if (allLizenzen.length && Date.now() - _cacheTs.lizenzen < CACHE_TTL) {
    $id('lizenzen-loading').classList.add('hidden');
    renderLizenzen();
    return;
  }
  $id('lizenzen-loading').classList.remove('hidden');
  $id('lizenzen-wrap').innerHTML = '';

  try {
    // SP REST mit Person-Feld-Expansion liefert EMail direkt aus der Liste —
    // kein separater Lookup nötig. Fallback auf Graph wenn kein SP-Token verfügbar.
    const spToken = await tryGetSpToken();
    if (spToken && COL.nutzer) {
      // SP REST: $expand=KIUser gibt {ID, Title, EMail} pro User zurück
      const nutzerField = COL.nutzer;
      let restUrl = `https://${SP_HOST}${SP_SITE_PATH}/_api/web/lists/getbytitle('${LIST_LIZENZEN}')/items` +
        `?$select=*,${nutzerField}/ID,${nutzerField}/Title,${nutzerField}/EMail` +
        `&$expand=${nutzerField}&$top=999`;
      // SP REST pagt über d.__next → alle Seiten einsammeln statt bei 999 abzuschneiden
      let restResults = [];
      while (restUrl) {
        const res = await fetch(restUrl, {
          headers: { 'Authorization': `Bearer ${spToken}`, 'Accept': 'application/json;odata=verbose' }
        });
        if (!res.ok) throw new Error(`SP REST ${res.status}`);
        const restData = await res.json();
        restResults = restResults.concat(restData?.d?.results || []);
        restUrl = restData?.d?.__next || null;
        if (restResults.length >= 5000) { console.warn('Lizenzen: cap 5000 erreicht'); break; }
      }
      // SP REST liefert Felder flach (nicht in fields{}); für Kompatibilität in fields{} einpacken
      allLizenzen = restResults.map(item => {
        // Personenfeld normalisieren: SP REST gibt Array oder einzelnes Objekt zurück
        const rawUsers = item[nutzerField]?.results || (item[nutzerField] ? [item[nutzerField]] : []);
        // Emails in spIdToEmail eintragen
        rawUsers.forEach(u => {
          if (u.ID && u.EMail) seedSpUser(u.ID, u.EMail, '', u.Title || '');
        });
        // Für parseLizenzUsersWithIds: KIUser als Array von {LookupId, LookupValue} + KIUserLookupId
        const lookupArr = rawUsers.map(u => ({ LookupId: u.ID, LookupValue: u.Title || '' }));
        const idArr     = rawUsers.map(u => u.ID);
        return {
          id:     item.ID,
          fields: { ...item, [nutzerField]: lookupArr, [nutzerField + 'LookupId']: idArr }
        };
      });
      console.log('✓ Lizenzen via SP REST geladen (mit UPNs):', allLizenzen.length);
    } else {
      // Fallback: Graph API (keine direkten EMail-Daten in Personenfeldern)
      allLizenzen = await gGetAll(`/sites/${siteId}/lists/${listLizenzId}/items?$expand=fields($select=*)&$top=999`);
      // spUserMap aus vorhandenen Namen befüllen (ohne E-Mail)
      for (const item of allLizenzen) {
        const f    = item.fields || {};
        const names = Array.isArray(f[COL.nutzer]) ? f[COL.nutzer] : (f[COL.nutzer] ? [f[COL.nutzer]] : []);
        const ids   = Array.isArray(f[COL.nutzer+'LookupId']) ? f[COL.nutzer+'LookupId'] : (f[COL.nutzer+'LookupId'] ? [f[COL.nutzer+'LookupId']] : []);
        names.forEach((n, idx) => {
          const name = typeof n === 'string' ? n : (n?.LookupValue || '');
          if (name && ids[idx]) seedSpUser(ids[idx], '', '', name);
        });
      }
      console.log('✓ Lizenzen via Graph geladen (UPNs ggf. nicht verfügbar):', allLizenzen.length);
    }
    _cacheTs.lizenzen = Date.now();
    renderLizenzen();
  } catch(e) {
    $id('lizenzen-loading').textContent = 'Fehler: ' + e.message;
    console.error('loadLizenzen:', e);
  }
}

function renderLizenzen() {
  $id('lizenzen-loading').classList.add('hidden');

  const today = new Date();
  // Stats always use all items
  const totalKosten = allLizenzen.reduce((s, i) => s + (parseFloat(i.fields?.[COL.kosten]) || 0), 0);
  const expireSoon  = allLizenzen.filter(i => {
    const d = i.fields?.[COL.vertragsEnde];
    if (!d) return false;
    const diff = (new Date(d) - today) / 86400000;
    return diff >= 0 && diff <= 60;
  }).length;

  const stats = `<div class="stats-row">
    <div class="stat-card accent"><div class="stat-value">${allLizenzen.length}</div><div class="stat-label">Lizenzen gesamt</div></div>
    <div class="stat-card green"><div class="stat-value">${fmtEuro(totalKosten)}</div><div class="stat-label">Kosten p.a. (geschätzt)</div></div>
    <div class="stat-card ${expireSoon ? 'red' : 'orange'}"><div class="stat-value">${expireSoon}</div><div class="stat-label">Ablauf in &lt; 60 Tagen</div></div>
  </div>`;

  if (!allLizenzen.length) {
    $id('lizenzen-wrap').innerHTML = stats + '<div class="empty-state">Noch keine Lizenzen erfasst.</div>';
    return;
  }

  // Build filtered items list
  const searchQ = ($id('search-lizenzen')?.value || '').toLowerCase().trim();
  const typF    = $id('filter-lizenztyp')?.value || '';
  const ablaufF = $id('filter-ablauf')?.value    || '';

  let items = allLizenzen.filter(i => {
    const f = i.fields;
    if (searchQ) {
      const hay = [f[COL.kiSystem], f.Title, f[COL.anbieter], f[COL.lizenztyp]].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(searchQ)) return false;
    }
    if (typF && f[COL.lizenztyp] !== typF) return false;
    if (ablaufF) {
      const ende = f[COL.vertragsEnde];
      const diff = ende ? (new Date(ende) - today) / 86400000 : null;
      if (ablaufF === 'expired') {
        if (diff === null || diff >= 0) return false;
      } else {
        const days = parseInt(ablaufF);
        if (diff === null || diff < 0 || diff > days) return false;
      }
    }
    return true;
  });

  const rows = items.map(i => {
    const f      = i.fields;
    const ende   = f[COL.vertragsEnde];
    const diff   = ende ? (new Date(ende) - today) / 86400000 : null;
    const endeCls = diff === null ? 'expiry-ok' : diff < 0 ? 'expiry-alert' : diff < 30 ? 'expiry-alert' : diff < 60 ? 'expiry-warn' : 'expiry-ok';
    const endeLabel = ende ? fmtDate(ende) : '–';

    const gesamt  = parseInt(f[COL.lizenzGesamt]) || 0;
    const users   = parseLizenzUsersWithIds(f);
    const belegt  = users.length || parseInt(f[COL.lizenzBelegt]) || 0;
    const pct     = gesamt > 0 ? Math.min(100, Math.round(belegt / gesamt * 100)) : null;
    const barCls  = pct === null ? '' : pct >= 90 ? 'util-full' : pct >= 70 ? 'util-warn' : 'util-ok';
    const util    = pct !== null ? `<div style="display:flex;align-items:center;gap:6px">
      <div class="util-bar-wrap"><div class="util-bar ${barCls}" style="width:${pct}%"></div></div>
      <span style="font-size:11px;color:#6b7280">${belegt}/${gesamt}</span>
    </div>` : (belegt ? `<span style="font-size:12px;color:#6b7280">${belegt} User</span>` : '–');

    const isDraft = (f[COL.notizen] || '').startsWith('⚠ Automatisch erstellt');
    const rowStyle = isDraft ? ' style="opacity:.55"' : '';
    const draftBadge = isDraft ? ' <span style="font-size:10px;color:#9ca3af;font-weight:400">(Entwurf)</span>' : '';

    // UPN-Chips für zugewiesene Nutzer
    const SHOW_MAX = 3;
    const upnCell = (() => {
      if (!users.length) return '<span style="color:#9ca3af;font-size:11px">–</span>';
      const chips = users.slice(0, SHOW_MAX).map(u => {
        const upn   = u.email || '';
        const label = upn || u.name || '?';
        const title = upn && u.name && upn !== u.name ? `${u.name} · ${upn}` : label;
        return `<span class="upn-chip" title="${esc(title)}">${esc(label)}</span>`;
      }).join('');
      const more = users.length > SHOW_MAX
        ? `<span class="upn-chip upn-chip-more">+${users.length - SHOW_MAX}</span>` : '';
      return `<div class="upn-cell">${chips}${more}</div>`;
    })();

    return `<tr onclick="openLizenzModal(${i.id})"${rowStyle}>
      <td><strong>${esc(f[COL.kiSystem] || f.Title || '–')}</strong>${draftBadge}</td>
      <td>${f[COL.lizenztyp] ? `<span class="badge-type">${esc(f[COL.lizenztyp])}</span>` : '–'}</td>
      <td>${esc(f[COL.anbieter] || '–')}</td>
      <td>${f[COL.kosten] ? fmtEuro(parseFloat(f[COL.kosten])) : '–'}</td>
      <td>${util}</td>
      <td>${upnCell}</td>
      <td class="${endeCls}">${endeLabel}${diff !== null && diff < 60 && diff >= 0 ? ` <small>(${Math.round(diff)}d)</small>` : ''}</td>
      <td><span style="font-size:11px">${f[COL.autoRenewal] || '–'}</span></td>
    </tr>`;
  }).join('');

  $id('lizenzen-wrap').innerHTML = stats + `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>KI-System</th><th>Typ</th><th>Anbieter</th>
          <th>Kosten</th><th>Auslastung</th><th>Nutzer (UPN)</th><th>Vertragsende</th><th>Auto-Renewal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ─── Lizenz Modal ────────────────────────────────────────────────

// SP-Personenfeld (Graph) → [{name, email, spId}]
function parseLizenzUsers(val) {
  if (!val) return [];
  // Array: SP gibt Personenfelder als Array zurück
  if (Array.isArray(val)) {
    return val.map(u => {
      if (typeof u === 'object' && u !== null)
        return { name: u.LookupValue || u.Title || u.displayName || '', email: u.EMail || u.email || '', spId: u.LookupId || null };
      const s = String(u).trim();
      return { name: s, email: s.includes('@') ? s : '', spId: null };
    }).filter(u => u.name || u.email);
  }
  // Fallback: alter Semikolon-Text (Migrationspfad)
  if (typeof val === 'string') {
    return val.split(';').map(s => s.trim()).filter(Boolean).map(s => ({
      name: s, email: s.includes('@') ? s : '', spId: null
    }));
  }
  return [];
}

// LookupIds-Array-Variante aus fields (Graph gibt KIUserLookupId separat zurück)
function parseLizenzUsersWithIds(fields) {
  const nameVal = fields[COL.nutzer];
  const idVal   = fields[COL.nutzer + 'LookupId'];
  const names   = Array.isArray(nameVal) ? nameVal : (nameVal ? [nameVal] : []);
  const ids     = Array.isArray(idVal)   ? idVal   : (idVal   ? [idVal]   : []);
  if (!names.length && !ids.length) return [];
  return names.map((n, i) => {
    const spId = ids[i] != null ? parseInt(ids[i]) : null;
    const email = (spId ? spIdToEmail[spId] : '') || '';
    return {
      name:  typeof n === 'string' ? n : (n?.LookupValue || String(n)),
      email,
      spId,
    };
  });
}

// Einen User in die Map eintragen (Email + claims-Login + Anzeigename)
function seedSpUser(id, email, loginName, displayName) {
  if (!id) return;
  const n = parseInt(id);
  if (email) {
    const e = email.toLowerCase().trim();
    spUserMap[e]   = n;
    spIdToEmail[n] = e;   // Reverse-Map für UPN-Anzeige
  }
  if (loginName && loginName.includes('|'))
                   spUserMap[loginName.split('|').pop().toLowerCase().trim()] = n;
  if (displayName) spUserMap['__name__' + displayName.toLowerCase().trim()]   = n;
}

// E-Mail oder Anzeigename → SP-LookupId
// Stufe 1: spUserMap (befüllt aus Lizenzen-/Antrags-Items beim Laden)
// Stufe 2: SharePoint REST ensureUser (braucht SP-Scope in App-Registration)
async function resolveSpUserId(email, name) {
  if (email) {
    const byEmail = spUserMap[email.toLowerCase().trim()];
    if (byEmail) return byEmail;
  }
  if (name) {
    const byName = spUserMap['__name__' + name.toLowerCase().trim()];
    if (byName) return byName;
  }
  // Stufe 2: SharePoint REST ensureUser (funktioniert wenn SP-Scope in App-Registration)
  if (email) {
    const id = await ensureSpUserViaRest(email);
    if (id) return id;
  }
  console.warn('Kein SP-LookupId für:', name || email, '| Map-Größe:', Object.keys(spUserMap).length);
  return null;
}

// [{name,email,spId}] → [N, N2, …] – einfache Integer-Array für Graph Collection(Edm.Int32)
// (SP-REST erwartet {LookupId: N}, Graph erwartet plain integers + @odata.type-Annotation)
async function buildLookupIds(users) {
  const result = [];
  for (const u of users) {
    const id = u.spId || await resolveSpUserId(u.email, u.name);
    if (id) result.push(parseInt(id));
  }
  return result;
}

function renderLizenzUserEditor() {
  const listEl  = $id('lz-user-list');
  const countEl = $id('lz-user-count');
  if (!listEl) return;
  const gesamt     = parseInt($id(`lf-${COL.lizenzGesamt}`)?.value) || 0;
  const verfuegbar = gesamt > 0 ? Math.max(0, gesamt - lizenzUsers.length) : null;
  listEl.innerHTML = lizenzUsers.length === 0
    ? '<div style="color:#9ca3af;font-size:13px;padding:6px 0">Noch keine User zugewiesen</div>'
    : lizenzUsers.map((u, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:#f9fafb;border-radius:6px;margin-bottom:4px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px">👤 ${esc(u.name || u.email || '?')}</div>
            ${u.email && u.email !== u.name ? `<div style="font-size:11px;color:#9ca3af;margin-top:1px">${esc(u.email)}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm" style="padding:2px 8px;color:#ef4444;flex-shrink:0" onclick="removeLizenzUser(${i})">×</button>
        </div>`).join('');
  if (countEl) {
    countEl.textContent = lizenzUsers.length
      ? `${lizenzUsers.length} User zugewiesen${verfuegbar !== null ? ` · ${verfuegbar} von ${gesamt} verfügbar` : ''}`
      : '';
  }
}

function addLizenzUser() {
  const inp = $id('lz-user-input');
  const val = inp?.value.trim();
  if (!val) return;
  const isEmail = val.includes('@');
  const user = { name: val, email: isEmail ? val : '', spId: null };
  const dup  = lizenzUsers.some(u => (u.email && u.email === user.email) || u.name === user.name);
  if (!dup) lizenzUsers.push(user);
  inp.value = '';
  hidePeopleDrop();
  renderLizenzUserEditor();
}

function removeLizenzUser(index) {
  lizenzUsers.splice(index, 1);
  renderLizenzUserEditor();
}

// ─── People-Autocomplete ─────────────────────────────────────────
let _peopleTimer = null;

function debounceUserSearch(q) {
  clearTimeout(_peopleTimer);
  if (!q || q.length < 2) { hidePeopleDrop(); return; }
  _peopleTimer = setTimeout(() => searchPeople(q), 300);
}

async function searchPeople(q) {
  const enc = encodeURIComponent(q);
  try {
    // Graph /users: liefert displayName + mail → SP-freundlichste Option
    const data = await gGet(
      `/users?$filter=startswith(displayName,'${enc}') or startswith(mail,'${enc}')` +
      `&$select=id,displayName,mail,userPrincipalName&$top=8`
    );
    const people = (data.value || []).filter(p => p.displayName);
    if (people.length) { showPeopleDrop(people); return; }
  } catch(e) {
    console.warn('Benutzersuche (/users) fehlgeschlagen:', e.message);
  }
  // Fallback: /me/people (weniger Token-Anforderungen, aber keine Mail-Garantie)
  try {
    const data2 = await gGet(
      `/me/people?$search=${enc}&$top=8&$select=displayName,scoredEmailAddresses`
    );
    const people2 = (data2.value || [])
      .filter(p => p.displayName)
      .map(p => ({
        displayName:       p.displayName,
        mail:              p.scoredEmailAddresses?.[0]?.address || '',
        userPrincipalName: p.scoredEmailAddresses?.[0]?.address || '',
      }));
    showPeopleDrop(people2);
  } catch(e2) {
    console.warn('People-Suche fehlgeschlagen:', e2.message);
    hidePeopleDrop();
  }
}

function showPeopleDrop(people) {
  const drop = $id('lz-people-drop');
  if (!drop) return;
  if (!people.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = people.map(p => {
    const mail  = p.mail || p.userPrincipalName || p.scoredEmailAddresses?.[0]?.address || '';
    const label = mail
      ? `${esc(p.displayName)} <span style="color:#9ca3af;font-size:11px">${esc(mail)}</span>`
      : esc(p.displayName);
    // data-Attribute statt Inline-String-Escaping – vermeidet SyntaxErrors
    return `<div class="people-item"
      data-name="${esc(p.displayName)}" data-mail="${esc(mail)}"
      onmousedown="selectPersonFromDrop(this)"
      onmouseover="this.classList.add('people-item-hover')"
      onmouseout="this.classList.remove('people-item-hover')"
    >👤 ${label}</div>`;
  }).join('');
  drop.style.display = 'block';
}

function hidePeopleDrop() {
  const drop = $id('lz-people-drop');
  if (drop) drop.style.display = 'none';
}

// Tickets-Muster: SP-LookupId sofort beim Auswählen aus dem Dropdown auflösen
async function selectPersonFromDrop(el) {
  const name  = el.dataset.name || '';
  const email = el.dataset.mail || '';
  hidePeopleDrop();
  const inp = $id('lz-user-input');
  if (inp) inp.value = '';

  const user = { name: name || email, email: email || '', spId: null };
  const dup  = lizenzUsers.some(u => (u.email && u.email === user.email) || u.name === user.name);
  if (dup) return;

  lizenzUsers.push(user);
  renderLizenzUserEditor();

  // SP-LookupId jetzt direkt auflösen (nicht erst beim Speichern)
  if (email) {
    try {
      const spId = await ensureSpUserViaRest(email);
      if (spId) {
        user.spId = spId;
      } else {
        console.warn('⚠ SP-User-ID nicht aufgelöst:', name, email, '– wird ggf. beim Speichern nochmals versucht');
      }
    } catch(e) {
      console.warn('ensureUser Fehler:', email, e.message);
    }
  }
}

// Fallback für addLizenzUser (manuelle Eingabe ohne Dropdown)
function selectPerson(name, email) {
  hidePeopleDrop();
  const user = { name: name || email, email: email || '', spId: null };
  const dup  = lizenzUsers.some(u => (u.email && u.email === user.email) || u.name === user.name);
  if (!dup) { lizenzUsers.push(user); renderLizenzUserEditor(); }
  const inp = $id('lz-user-input');
  if (inp) inp.value = '';
}

function openLizenzModal(itemId) {
  editLizenzId = itemId || null;
  const item = itemId ? allLizenzen.find(i => i.id == itemId) : null;
  const f = item?.fields || {};

  // Personenfeld lesen: Graph gibt Namen-Array + LookupId-Array separat zurück
  lizenzUsers = parseLizenzUsersWithIds(f);
  // Fallback: älteres Textformat (Semikolon-getrennt)
  if (!lizenzUsers.length && f[COL.nutzer]) lizenzUsers = parseLizenzUsers(f[COL.nutzer]);

  // Neue Lizenz: Verantwortlich IT = aktuell angemeldeter User
  if (!itemId && !f[COL.verantwIT]) {
    f[COL.verantwIT] = account?.name || account?.username || '';
  }

  $id('modal-title').textContent = itemId ? 'Lizenz bearbeiten' : 'Neue Lizenz erfassen';

  // War dieses Item ein Entwurf? → Notizen-Feld leer zeigen
  const isDraftItem = itemId && (f[COL.notizen] || '').startsWith('⚠ Automatisch erstellt');

  const USER_SECTION = `
    <div style="grid-column:1/-1;margin-top:4px;border-top:1px solid #e5e9ef;padding-top:14px">
      <div style="font-weight:600;font-size:.875rem;color:#374151;margin-bottom:10px">👥 KI-User (Lizenznehmer)</div>
      <div id="lz-user-list"></div>
      <div style="display:flex;gap:8px;margin-top:10px;align-items:flex-start">
        <div style="position:relative;flex:1">
          <input id="lz-user-input" type="text" class="form-control" autocomplete="off"
            placeholder="Name oder E-Mail eingeben…" style="width:100%"
            oninput="debounceUserSearch(this.value)"
            onblur="setTimeout(hidePeopleDrop,200)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();addLizenzUser();}if(event.key==='Escape'){hidePeopleDrop();}">
          <div id="lz-people-drop" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:9999;max-height:220px;overflow-y:auto;margin-top:3px"></div>
        </div>
        <button class="btn btn-primary btn-sm" style="white-space:nowrap" onclick="addLizenzUser()">+ Hinzufügen</button>
      </div>
      <div id="lz-user-count" style="font-size:12px;color:#6b7280;margin-top:6px"></div>
    </div>`;

  let html = '<div class="form-row" style="grid-template-columns:1fr 1fr">';
  for (const field of LIZENZ_FIELDS) {
    // Verantwortlich IT: wird beim Speichern automatisch gesetzt – nicht anzeigen
    if (field.key === COL.verantwIT) continue;

    // KI-System: Title als sicherer Fallback (wird immer korrekt gesetzt)
    // Entwurfs-Notiz: nicht vorausfüllen (leeres Feld zeigen)
    const rawVal = field.key === COL.kiSystem
      ? (f[COL.kiSystem] || f.Title || '')
      : (isDraftItem && field.key === COL.notizen)
        ? ''
        : (f[field.key] ?? '');
    // yesno-Felder: SP liefert Boolean → 'Ja'/'Nein'
    let v = spDisplayValue(field.type, rawVal);
    // date-Felder: SP liefert ISO-Datetime (z.B. "2025-06-01T00:00:00Z"),
    // <input type="date"> braucht "yyyy-MM-dd"
    if (field.type === 'date' && v) v = String(v).slice(0, 10);

    const cls = field.type === 'textarea' ? 'form-group full' : 'form-group';
    html += `<div class="${cls}">
      <label class="form-label" for="lf-${field.key}">${esc(field.label)}${field.req ? '<span class="req">*</span>' : ''}</label>`;

    if (field.type === 'textarea') {
      html += `<textarea id="lf-${field.key}" class="form-control" rows="2">${esc(v)}</textarea>`;
    } else if (field.type === 'choice' || field.type === 'yesno') {
      html += `<select id="lf-${field.key}" class="form-control">`;
      for (const c of field.choices) html += `<option value="${esc(c)}"${String(v) === String(c) ? ' selected' : ''}>${esc(c) || '– wählen –'}</option>`;
      html += '</select>';
    } else if (field.type === 'combo') {
      const dlId = `dl-lf-${field.key}`;
      html += `<input id="lf-${field.key}" type="text" list="${dlId}" class="form-control" value="${esc(v)}" placeholder="Auswählen oder eingeben…">
        <datalist id="${dlId}">${field.choices.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;
    } else {
      // KI-System beim Bearbeiten readonly (eindeutiger Schlüssel, darf nicht geändert werden)
      const isLocked = itemId && field.key === COL.kiSystem;
      html += `<input id="lf-${field.key}" type="${field.type === 'yesno' ? 'text' : field.type}" class="form-control" value="${esc(v)}"
        ${field.key === COL.lizenzGesamt ? ' oninput="renderLizenzUserEditor()"' : ''}
        ${isLocked ? ' readonly style="background:#f3f4f6;cursor:not-allowed" title="KI-System kann nach dem Anlegen nicht mehr geändert werden"' : ''}/>`;
    }
    html += '</div>';

    // KI-User direkt nach "Lizenzen gesamt" einblenden
    if (field.key === COL.lizenzGesamt) html += USER_SECTION;
  }
  html += '</div>';

  html += `<div class="modal-footer">
    ${itemId ? `<button class="btn btn-danger btn-sm" onclick="deleteLizenz(${itemId})">Löschen</button><span style="flex:1"></span>` : ''}
    <button class="btn btn-neutral btn-sm" onclick="closeModal()">Abbrechen</button>
    <button class="btn btn-primary btn-sm" id="lizenz-save-btn" onclick="saveLizenz()">Speichern</button>
  </div>`;

  $id('modal-body').innerHTML = html;
  renderLizenzUserEditor();
  $id('modal-overlay').classList.remove('hidden');
}

function showLizenzError(msg) {
  let el = $id('lizenz-save-err');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lizenz-save-err';
    el.style.cssText = 'color:#dc2626;background:#fef2f2;border:1px solid #fca5a5;padding:9px 13px;border-radius:6px;margin:0 0 10px;font-size:.83rem';
    $id('modal-body')?.querySelector('.modal-footer')?.before(el);
  }
  el.textContent = '✕ ' + msg;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideLizenzError() { $id('lizenz-save-err')?.remove(); }

async function saveLizenz() {
  hideLizenzError();
  const saveBtn = $id('lizenz-save-btn');
  const setBusy = busy => {
    if (!saveBtn) return;
    saveBtn.disabled = busy;
    saveBtn.textContent = busy ? '⏳ Speichern…' : 'Speichern';
  };
  setBusy(true);

  const kiSysEl  = $id(`lf-${COL.kiSystem}`);
  const kiSysVal = kiSysEl?.value.trim();
  if (!kiSysVal) {
    showLizenzError('Bitte KI-System eingeben.');
    kiSysEl?.focus();
    setBusy(false);
    return;
  }

  // Eindeutigkeit prüfen – darf nur einmal existieren
  if (!editLizenzId) {
    const dup = allLizenzen.find(i =>
      (i.fields?.[COL.kiSystem] || i.fields?.Title || '').toLowerCase() === kiSysVal.toLowerCase()
    );
    if (dup) {
      showLizenzError(`Ein KI-System mit dem Namen „${kiSysVal}" existiert bereits.`);
      kiSysEl?.focus();
      setBusy(false);
      return;
    }
  }

  // Spalten-Check: wenn lizenzCols geladen → nur bestätigte Spalten; sonst alles versuchen
  // (safePatch fängt 400 feldweise ab)
  const colOk = name => !lizenzCols || lizenzCols.has(name);

  // War das Item ein Entwurf (automatisch erstellt)?
  const oldLizenzItem = editLizenzId ? allLizenzen.find(i => i.id == editLizenzId) : null;
  const wasDraft = !!(oldLizenzItem?.fields?.[COL.notizen] || '').startsWith('⚠ Automatisch erstellt');

  // Detail-Felder sammeln (ohne Title und VerantwortlicherIT – werden separat gesetzt)
  const detailFields = {};
  for (const f of LIZENZ_FIELDS) {
    const el = $id(`lf-${f.key}`);
    if (!el || f.key === COL.kiSystem || f.key === COL.verantwIT) continue;
    const v = el.value.trim();
    if (v === '') continue;
    if (!colOk(f.key)) { console.warn('Lizenz-Spalte nicht in SP-Schreibliste, übersprungen:', f.key); continue; }
    const converted = spValue(f.type === 'combo' ? 'text' : f.type, v);
    // yesno: null bedeutet kein gültiger Wert → überspringen
    if (converted === null) continue;
    detailFields[f.key] = converted;
  }
  // COL.kiSystem ('System_x0028_LookupaufKI_Registe') ist ein Lookup auf KI_Register
  // → kann nicht als Text geschrieben werden; wird von createRegisterEntries via LookupId gesetzt
  // Zur Anzeige reicht Title (= Systemname), das wird separat gesetzt

  // Verantwortlich IT: wird immer auf den aktuell eingeloggten User gesetzt
  if (colOk(COL.verantwIT)) detailFields[COL.verantwIT] = account?.name || account?.username || '';

  // ZugewieseneNutzer: Textfeld mit den Namen aller zugewiesenen User befüllen
  if (COL.zugewieseneNutzer !== null && colOk(COL.zugewieseneNutzer) && lizenzUsers.length > 0) {
    detailFields[COL.zugewieseneNutzer] = lizenzUsers.map(u => u.name || u.email).filter(Boolean).join('; ');
  }

  // Entwurfs-Notiz entfernen: war das Item ein Entwurf, forcieren wir den Notizen-Wert
  // (auch wenn der User nichts eingetippt hat → leeres '' löscht die Marker-Notiz)
  if (wasDraft && colOk(COL.notizen)) {
    detailFields[COL.notizen] = $id(`lf-${COL.notizen}`)?.value.trim() || '';
  }

  // Personenfeld: LookupIds auflösen.
  // Graph nutzt 'LookupId'-Suffix für READ *und* WRITE (nicht 'Id' wie SP-REST!):
  //   "KI_x002d_UserLookupId@odata.type": "Collection(Edm.Int32)"
  //   "KI_x002d_UserLookupId": [42, 43]
  // Das ist exakt das gleiche Muster wie im Ticketsystem (stripReadOnly).
  const nutzerLookupKey  = COL.nutzer + 'LookupId';
  const nutzerOdataKey   = nutzerLookupKey + '@odata.type';
  if (lizenzUsers.length > 0) {
    const lookupIds = await buildLookupIds(lizenzUsers);
    if (lookupIds.length > 0) {
      detailFields[nutzerOdataKey]  = 'Collection(Edm.Int32)';
      detailFields[nutzerLookupKey] = lookupIds;
    } else {
      console.warn('Keine SP-LookupIds aufgelöst – User-Feld wird nicht gesetzt');
    }
  } else {
    // Leere Auswahl: Feld leeren
    detailFields[nutzerOdataKey]  = 'Collection(Edm.Int32)';
    detailFields[nutzerLookupKey] = [];
  }
  if (colOk(COL.lizenzBelegt)) detailFields[COL.lizenzBelegt] = lizenzUsers.length;


  // Hilfsfunktion: PATCH-Versuch, bei Fehler feldweise retry
  // @odata.type-Annotationen werden immer zusammen mit dem Hauptfeld übertragen
  const safePatch = async (url, fields) => {
    if (!Object.keys(fields).length) return;
    try {
      await gPatch(url, fields);
    } catch(ePatch) {
      console.warn('Bulk-PATCH fehlgeschlagen, versuche feldweise:', ePatch.message);
      for (const [k, v] of Object.entries(fields)) {
        if (k.includes('@odata.type')) continue;  // kommt mit seinem Hauptfeld mit
        const odataKey   = k + '@odata.type';
        const fieldPatch = fields[odataKey] !== undefined
          ? { [odataKey]: fields[odataKey], [k]: v }
          : { [k]: v };
        try { await gPatch(url, fieldPatch); }
        catch(ef) { console.warn(`Feld "${k}" konnte nicht gespeichert werden:`, ef.message); }
      }
    }
  };

  try {
    if (editLizenzId) {
      // PATCH: Title immer + bestätigte Detail-Felder
      await safePatch(
        `/sites/${siteId}/lists/${listLizenzId}/items/${editLizenzId}/fields`,
        { Title: kiSysVal, ...detailFields }
      );
    } else {
      // Schritt 1: Item mit nur Title anlegen
      const newItem = await gPost(`/sites/${siteId}/lists/${listLizenzId}/items`,
        { fields: { Title: kiSysVal } });
      if (!newItem?.id) throw new Error('Kein Item-ID in der Antwort');
      // Schritt 2: Details per PATCH (mit feldweisem Fallback)
      await safePatch(
        `/sites/${siteId}/lists/${listLizenzId}/items/${newItem.id}/fields`,
        detailFields
      );
    }
    closeModal();
    allLizenzen = [];
    await loadLizenzen();

    // Wenn ein Entwurf vollständig ausgefüllt wurde → KI-Register-Eintrag anlegen + sofort laden
    if (wasDraft && listRegisterId) {
      const finalId = editLizenzId;  // editLizenzId noch gesetzt vor closeModal
      await createRegisterEntries(kiSysVal, lizenzUsers, finalId);
      allRegister = [];
      _cacheTs.register = 0;   // Cache erzwingen → nächstes Öffnen des Register-Tabs lädt neu
      if (currentView === 'register') {
        await loadRegister();   // Sofort aktualisieren wenn Register gerade geöffnet ist
        showToast('✓ KI-Register automatisch aktualisiert.');
      } else {
        showToast('✓ KI-Register wurde automatisch aktualisiert.');
      }
      console.log('✓ KI-Register nach Lizenzierung aktualisiert');
    }
  } catch(e) {
    showLizenzError('Speichern fehlgeschlagen: ' + e.message);
    console.error('saveLizenz:', e);
    setBusy(false);
  }
}

// Legt EINEN KI-Register-Eintrag pro System an (nicht pro Person).
// Die beteiligten Kollegen landen als Text in KeyUser.
// Nach der Erstellung wird das Lizenz-System-Lookup-Feld gesetzt.
async function createRegisterEntries(kiSystem, users, lizenzItemId) {
  if (!listRegisterId) return;
  const regColOk = k => k && (!registerCols || registerCols.has(k));

  // Duplikat-Prüfung: Register-Eintrag für dieses System schon vorhanden?
  const existing = allRegister.find(r =>
    (r.fields?.Title || '').toLowerCase() === kiSystem.toLowerCase()
  );
  if (existing) {
    console.log('Register-Eintrag bereits vorhanden:', kiSystem);
    // Trotzdem Lizenz-Lookup aktualisieren falls noch nicht gesetzt
    if (lizenzItemId) await updateLizenzSystemLookup(lizenzItemId, parseInt(existing.id));
    return;
  }

  // Verwandte Antrag-Daten (Hersteller, Beschreibung, Anwendungsbereiche, KeyUser, …)
  const antrag = allAntraege.find(i =>
    (i.fields?.Title || '').toLowerCase() === kiSystem.toLowerCase()
  );
  const af = antrag?.fields || {};

  try {
    // Schritt 1: Register-Item mit Title anlegen
    const regItem = await gPost(`/sites/${siteId}/lists/${listRegisterId}/items`,
      { fields: { Title: kiSystem } });
    if (!regItem?.id) return;

    // Schritt 2: Felder befüllen (nur bekannte, schreibbare Spalten)
    const pf = {};

    // Lookup auf den Antrag (AntragID-Feld)
    const antragLookupCol = 'AntragID_x0028_LookupaufKI_Antra';
    if (antrag?.id && regColOk(antragLookupCol)) {
      pf[antragLookupCol + 'LookupId'] = parseInt(antrag.id);
    }

    // Daten aus dem Antrag
    if (af[COL.hersteller]       && regColOk('Hersteller'))              pf['Hersteller']              = af[COL.hersteller];
    if (af[COL.komponenten]      && regColOk('Beschreibung'))             pf['Beschreibung']            = af[COL.komponenten];
    if (af[COL.zweckUnternehmen] && regColOk('Anwendungsbereiche'))       pf['Anwendungsbereiche']      = af[COL.zweckUnternehmen];
    if (af[COL.keyUser]          && regColOk('Schulungszielgruppe'))      pf['Schulungszielgruppe']     = af[COL.keyUser];
    if (af[COL.verantw]          && regColOk(COL_REG.verantw))           pf[COL_REG.verantw]           = af[COL.verantw];
    if (af[COL.risiko]           && regColOk(COL_REG.risiko))            pf[COL_REG.risiko]            = af[COL.risiko];
    if (af[COL.nutzungsart]      && regColOk(COL_REG.nutzungsart))       pf[COL_REG.nutzungsart]       = af[COL.nutzungsart];
    if (af[COL.freigabeDatum]    && regColOk(COL_REG.freigabeDatum))     pf[COL_REG.freigabeDatum]     = af[COL.freigabeDatum];
    // GueltigAb: Freigabedatum aus Antrag, sonst heute
    if (regColOk('GueltigAb'))   pf['GueltigAb'] = af[COL.freigabeDatum]
      ? String(af[COL.freigabeDatum]).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    if (regColOk('NaechstePruefung')) {
      const naechste = new Date();
      naechste.setFullYear(naechste.getFullYear() + 1);
      pf['NaechstePruefung'] = naechste.toISOString().slice(0, 10);
    }

    // Kollegen (KI-User) als Text in KeyUser (immer, als Fallback)
    if (users.length && regColOk('KeyUser')) {
      pf['KeyUser'] = users.map(u => u.name || u.email).filter(Boolean).join(', ');
    }

    // Nutzer als Person-Feld (Einzelauswahl) schreiben – erste Person aus der Lizenznehmerliste
    if (users.length && COL_REG.nutzer && regColOk(COL_REG.nutzer)) {
      try {
        const firstUser = users[0];
        const spId = firstUser.spId || await resolveSpUserId(firstUser.email, firstUser.name);
        if (spId) {
          pf[COL_REG.nutzer + 'LookupId'] = spId;   // Single-Value → plain integer (kein Collection)
        }
      } catch(eNU) { console.warn('Register Nutzer LookupId fehlgeschlagen:', eNU.message); }
    }

    // Antragsteller als Ansprechperson hinterlegen
    if (COL_REG.ansprechperson && regColOk(COL_REG.ansprechperson)) {
      try {
        const authorId = af.Author0LookupId
          ? parseInt(af.Author0LookupId)
          : await resolveSpUserId(af.Author0EMail || '', af.Author0LookupValue || '');
        if (authorId) {
          pf[COL_REG.ansprechperson + 'LookupId'] = authorId;
        }
      } catch(eAsp) { console.warn('Register Ansprechperson LookupId fehlgeschlagen:', eAsp.message); }
    }

    if (Object.keys(pf).length) {
      await gPatch(`/sites/${siteId}/lists/${listRegisterId}/items/${regItem.id}/fields`, pf)
        .catch(e => console.warn('Register-PATCH:', e.message));
    }

    // Schritt 3: Lizenz-System-Lookup auf den neuen Register-Eintrag setzen
    if (lizenzItemId) await updateLizenzSystemLookup(lizenzItemId, parseInt(regItem.id));

    console.log('✓ Register-Eintrag erstellt:', kiSystem, '(ID:', regItem.id, ')');
  } catch(e) {
    console.warn('Register-Eintrag fehlgeschlagen:', kiSystem, e.message);
  }
}

// Setzt das System-Lookup-Feld in der Lizenz auf einen KI_Register-Eintrag
async function updateLizenzSystemLookup(lizenzItemId, registerId) {
  if (!lizenzItemId || !registerId || !listLizenzId) return;
  // COL.kiSystem = 'System_x0028_LookupaufKI_Registe' (Lookup-Feld)
  // Schreiben: LookupId-Suffix + integer (kein Collection, da Single-Value-Lookup)
  const lookupKey = COL.kiSystem + 'LookupId';
  try {
    await gPatch(
      `/sites/${siteId}/lists/${listLizenzId}/items/${lizenzItemId}/fields`,
      { [lookupKey]: registerId }
    );
    console.log('✓ Lizenz System-Lookup gesetzt:', registerId);
  } catch(e) {
    console.warn('Lizenz System-Lookup PATCH fehlgeschlagen:', e.message);
  }
}

async function deleteLizenz(itemId) {
  const item = allLizenzen.find(i => i.id == itemId);
  const name = item?.fields?.[COL.kiSystem] || item?.fields?.Title || 'diese Lizenz';
  if (!confirm(`Lizenz "${name}" wirklich löschen?`)) return;
  try {
    await gDel(`/sites/${siteId}/lists/${listLizenzId}/items/${itemId}`);
    closeModal();
    allLizenzen = [];
    await loadLizenzen();
  } catch(e) {
    showToast('Fehler: ' + esc(e.message), 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════
// KI-REGISTER
// ═══════════════════════════════════════════════════════════════════
async function loadRegister() {
  if (!listRegisterId) {
    $id('register-loading').textContent = 'Liste "' + LIST_REGISTER + '" nicht gefunden oder kein Zugriff.';
    return;
  }
  // Cache: noch frisch → direkt rendern, kein Fetch (↻ erzwingt Neuabruf via _cacheTs=0)
  if (allRegister.length && Date.now() - _cacheTs.register < CACHE_TTL) {
    $id('register-loading').classList.add('hidden');
    renderRegister();
    return;
  }
  $id('register-loading').classList.remove('hidden');
  $id('register-wrap').innerHTML = '';

  try {
    allRegister = await gGetAll(`/sites/${siteId}/lists/${listRegisterId}/items?$expand=fields($select=*)&$top=999`);
    _cacheTs.register = Date.now();
    renderRegister();
  } catch(e) {
    $id('register-loading').textContent = 'Fehler: ' + e.message;
  }
}

function filterRegister() { renderRegister(); }

function renderRegister() {
  const riskF   = $id('reg-filter-risk')?.value    || '';
  const nutzerF = $id('reg-filter-nutzer')?.value  || '';
  const searchF = ($id('search-register')?.value   || '').toLowerCase().trim();

  // Hilfsfunktion: Person-Feld → lesbarer String (generisch für Nutzer und Ansprechperson)
  const getPersonText = (f, colKey, fallbackKey) => {
    if (colKey && f[colKey] != null) {
      const pf = f[colKey];
      if (Array.isArray(pf)) return pf.map(p => p?.LookupValue || String(p)).filter(Boolean).join(', ');
      if (typeof pf === 'object') return pf?.LookupValue || '';
      return String(pf);
    }
    return fallbackKey ? (f[fallbackKey] || '') : '';
  };
  const getNutzerText      = f => getPersonText(f, COL_REG.nutzer, 'KeyUser');
  const getAnsprechperson  = f => getPersonText(f, COL_REG.ansprechperson, null);

  // Nutzer-Dropdown dynamisch befüllen (Person-Feld hat Vorrang vor KeyUser-Text)
  const nutzerDrop = $id('reg-filter-nutzer');
  if (nutzerDrop) {
    const allNutzer = new Set();
    allRegister.forEach(i => {
      const f = i.fields;
      if (COL_REG.nutzer && f[COL_REG.nutzer] != null) {
        const pf = f[COL_REG.nutzer];
        const arr = Array.isArray(pf) ? pf : [pf];
        arr.forEach(p => {
          const n = p?.LookupValue || (typeof p === 'string' ? p : '');
          if (n) allNutzer.add(n);
        });
      } else {
        (f['KeyUser'] || '').split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(n => allNutzer.add(n));
      }
    });
    const currentVal = nutzerDrop.value;
    nutzerDrop.innerHTML = '<option value="">Alle Nutzer</option>' +
      [...allNutzer].sort().map(n => `<option value="${esc(n)}"${n === currentVal ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }

  let items = allRegister.filter(i => {
    const f = i.fields;
    if (riskF && f[COL_REG.risiko] !== riskF) return false;
    if (nutzerF) {
      const nutzerText = getNutzerText(f);
      if (COL_REG.nutzer && f[COL_REG.nutzer] != null) {
        // Person-Feld: jeden Eintrag einzeln prüfen
        const pf = f[COL_REG.nutzer];
        const arr = Array.isArray(pf) ? pf : [pf];
        if (!arr.some(p => (p?.LookupValue || String(p)) === nutzerF)) return false;
      } else {
        const ku = nutzerText.split(/[,;]/).map(s => s.trim());
        if (!ku.includes(nutzerF)) return false;
      }
    }
    if (searchF) {
      const hay = [f.Title, f[COL_REG.verantw], f[COL_REG.hersteller], getNutzerText(f), getAnsprechperson(f)].join(' ').toLowerCase();
      if (!hay.includes(searchF)) return false;
    }
    return true;
  });

  $id('register-loading').classList.add('hidden');

  const mitFreigabe = allRegister.filter(i => !!i.fields?.GueltigAb).length;
  const stats = `<div class="stats-row">
    <div class="stat-card accent"><div class="stat-value">${allRegister.length}</div><div class="stat-label">Systeme gesamt</div></div>
    <div class="stat-card green"><div class="stat-value">${mitFreigabe}</div><div class="stat-label">Freigegeben</div></div>
    <div class="stat-card orange"><div class="stat-value">${allRegister.length - mitFreigabe}</div><div class="stat-label">In Vorbereitung</div></div>
  </div>`;

  if (!items.length) {
    $id('register-wrap').innerHTML = stats + '<div class="empty-state">Keine Einträge gefunden.</div>';
    return;
  }

  const rows = items.map(i => {
    const f = i.fields;
    const nutzerDisp     = getNutzerText(f);
    const ansprechDisp   = getAnsprechperson(f);
    return `<tr onclick="openRegisterPanel(${i.id})" style="cursor:pointer">
      <td>
        <strong>${esc(f.Title || '–')}</strong>
        ${nutzerDisp ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">👤 ${esc(nutzerDisp)}</div>` : ''}
        ${ansprechDisp ? `<div style="font-size:11px;color:#9ca3af;margin-top:1px">✉ ${esc(ansprechDisp)}</div>` : ''}
      </td>
      <td>${esc(f[COL_REG.verantw] || '–')}</td>
      <td>${esc(f[COL_REG.hersteller] || f[COL_REG.anbieter] || '–')}</td>
      <td>${riskBadge(f[COL_REG.risiko])}</td>
      <td>${f[COL_REG.nutzungsart] ? `<span class="badge-type">${esc(f[COL_REG.nutzungsart])}</span>` : '–'}</td>
      <td>${fmtDate(f['GueltigAb'])}</td>
    </tr>`;
  }).join('');

  $id('register-wrap').innerHTML = stats + `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>KI-System / Nutzer</th><th>Verantwortl. Stelle</th><th>Hersteller</th>
          <th>Risiko</th><th>Nutzungsart</th><th>Geplant ab</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function openRegisterPanel(itemId) {
  const item = allRegister.find(i => i.id == itemId);
  if (!item) return;
  const f = item.fields;

  $id('panel-title').innerHTML = `🤖 <span style="margin-left:4px">${esc(f.Title || '–')}</span>`;

  const row = (label, value, pre = false) =>
    `<div class="panel-field">
      <div class="panel-field-label">${esc(label)}</div>
      <div class="panel-field-value${pre ? ' pre' : ''}">${value || '<span style="color:#9ca3af">–</span>'}</div>
    </div>`;

  $id('panel-body').innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Stammdaten</div>
      ${row('Bezeichnung',           esc(f.Title))}
      ${row('Verantwortl. Stelle',   esc(f[COL_REG.verantw]))}
      ${row('Hersteller / Anbieter', esc(f[COL_REG.hersteller] || f[COL_REG.anbieter]))}
      ${row('Nutzungsart',           esc(f[COL_REG.nutzungsart]))}
      ${row('Risikokategorie',       riskBadge(f[COL_REG.risiko]))}
      ${(() => {
        if (COL_REG.nutzer && f[COL_REG.nutzer] != null) {
          const pf = f[COL_REG.nutzer];
          const name = Array.isArray(pf)
            ? pf.map(p => p?.LookupValue || String(p)).filter(Boolean).join(', ')
            : (typeof pf === 'object' ? (pf?.LookupValue || '') : String(pf));
          return name ? row('Nutzer (Lizenznehmer)', esc(name)) : '';
        }
        return f['KeyUser'] ? row('Nutzer / Key User', esc(f['KeyUser'])) : '';
      })()}
      ${(() => {
        if (COL_REG.ansprechperson && f[COL_REG.ansprechperson] != null) {
          const pf = f[COL_REG.ansprechperson];
          const name = Array.isArray(pf)
            ? pf.map(p => p?.LookupValue || String(p)).filter(Boolean).join(', ')
            : (typeof pf === 'object' ? (pf?.LookupValue || '') : String(pf));
          return name ? row('Ansprechperson', esc(name)) : '';
        }
        return '';
      })()}
      ${f['GueltigAb']          ? row('Gültig ab',        fmtDate(f['GueltigAb'])) : ''}
      ${f['NaechstePruefung']   ? row('Nächste Prüfung',  fmtDate(f['NaechstePruefung'])) : ''}
      ${f['Beschreibung']       ? row('Beschreibung',     esc(f['Beschreibung']), true) : ''}
    </div>
    ${f['Schulungszielgruppe'] || f['Anwendungsbereiche'] ? `<div class="panel-section">
      <div class="panel-section-title">Einsatz & Schulung</div>
      ${f['Anwendungsbereiche']   ? row('Anwendungsbereiche', esc(f['Anwendungsbereiche']), true) : ''}
      ${f['Schulungszielgruppe']  ? row('Schulungszielgruppe', esc(f['Schulungszielgruppe']), true) : ''}
    </div>` : ''}
    ${f[COL_REG.notizen] ? `<div class="panel-section">
      <div class="panel-section-title">Notizen</div>
      ${row('', esc(f[COL_REG.notizen]), true)}
    </div>` : ''}`;

  openPanel();
}

// ═══════════════════════════════════════════════════════════════════
// PANEL / MODAL HELPERS
// ═══════════════════════════════════════════════════════════════════
function openPanel() {
  $id('panel-overlay').classList.remove('hidden');
  $id('side-panel').classList.remove('hidden');
}
function closePanel() {
  $id('panel-overlay').classList.add('hidden');
  $id('side-panel').classList.add('hidden');
  currentPanelItemId = null;
}
async function refreshPanel() {
  if (!currentPanelItemId || !listAntragId) return;
  const btn = $id('btn-panel-refresh');
  if (btn) { btn.disabled = true; btn.classList.add('refreshing'); }
  try {
    const fresh = await gGet(
      `/sites/${siteId}/lists/${listAntragId}/items/${currentPanelItemId}?$select=id,createdBy,createdDateTime&$expand=fields($select=*)`
    );
    if (fresh?.fields) {
      const idx = allAntraege.findIndex(i => i.id == currentPanelItemId);
      if (idx >= 0) {
        // createdBy aus Original-Item übernehmen (Graph gibt es bei Einzel-Item-Abruf nicht immer mit)
        const originalCreatedBy = allAntraege[idx].createdBy;
        allAntraege[idx].fields = fresh.fields;
        if (originalCreatedBy && !fresh.createdBy) allAntraege[idx].createdBy = originalCreatedBy;
      } else {
        allAntraege.push({ id: currentPanelItemId, fields: fresh.fields, createdBy: fresh.createdBy });
      }
    }
    openAntragPanel(currentPanelItemId);
    showToast('Antrag aktualisiert');
  } catch(e) {
    showToast('Fehler beim Aktualisieren: ' + esc(e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('refreshing'); }
  }
}
// closeModal is defined above (next to openRichtlinieModal) to support modal-wide cleanup

// ═══════════════════════════════════════════════════════════════════
// E-MAIL VIA GRAPH (Mail.Send)
// ═══════════════════════════════════════════════════════════════════
// toList: [{address, name}] oder ['email@...'] oder 'email@...'
async function sendMail(toList, subject, bodyHtml, extraDomains = []) {
  // Erlaubte Empfänger-Domains aus der zentralen Config (kiMailDomains) –
  // verhindert dass eine manipulierte Genehmiger-Liste externe Adressen erreicht.
  // extraDomains: für admin-gepflegte Empfänger (KBR/BR-Mails aus der Config),
  // die bewusst auch auf anderen Domains zugestellt werden dürfen.
  const ALLOWED_MAIL_DOMAINS = new Set(
    (_kiCfg.kiMailDomains || ['dihag.com'])
      .concat(extraDomains || [])
      .map(d => String(d).toLowerCase().trim())
      .filter(Boolean)
  );
  const toArr = (Array.isArray(toList) ? toList : [toList]).map(r =>
    typeof r === 'string'
      ? { emailAddress: { address: r } }
      : { emailAddress: { address: r.address || r.email || '', name: r.name || '' } }
  ).filter(r => {
    const addr = (r.emailAddress.address || '').toLowerCase();
    const domain = addr.includes('@') ? addr.split('@').pop() : '';
    const ok = ALLOWED_MAIL_DOMAINS.has(domain);
    if (!ok) console.warn('sendMail: Empfänger-Domain nicht erlaubt, übersprungen:', addr);
    return ok;
  });

  if (!toArr.length) { console.warn('sendMail: keine Empfänger'); return; }

  // Betreff: Zeilenumbrüche entfernen (verhindert E-Mail-Header-Injection)
  const safeSubject = String(subject).replace(/[\r\n]+/g, ' ').trim();

  await gPost('/me/sendMail', {
    message: {
      subject: safeSubject,
      body: { contentType: 'HTML', content: bodyHtml },
      toRecipients: toArr,
    },
    saveToSentItems: true,
  });
  console.log('✓ E-Mail gesendet:', subject, '→', toArr.map(r => r.emailAddress.address).join(', '));
}

// HTML-Template für KI-Benachrichtigungs-Mails
// SICHERHEIT: Alle dynamischen Werte (title, k, v) werden per esc() escaped –
// verhindert HTML-Injection / Phishing durch manipulierte Antragstitel oder Kommentare.
function mailTemplate(title, lines, ctaLabel, ctaUrl) {
  // CTA-URL muss ein interner Deep-Link sein (beginnt mit unserem Origin)
  const safeOrigin = location.origin + location.pathname;
  const href = (ctaUrl && ctaUrl.startsWith(safeOrigin)) ? ctaUrl : safeOrigin;
  const cta = ctaLabel
    ? `<p style="margin:24px 0 0"><a href="${href}"
        style="background:#1a56db;color:#fff;padding:10px 22px;border-radius:7px;text-decoration:none;font-weight:600"
        >${esc(ctaLabel)}</a></p>`
    : '';
  const rows = lines.map(([k, v]) =>
    `<tr><td style="padding:5px 0;color:#6b7280;font-size:13px;width:160px">${esc(String(k))}</td>
         <td style="padding:5px 0;font-size:13px;font-weight:500;white-space:pre-wrap">${esc(String(v ?? ''))}</td></tr>`
  ).join('');
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e9ef">
    <div style="background:linear-gradient(135deg,#1648c5,#1a56db);padding:20px 28px">
      <div style="color:#fff;font-size:18px;font-weight:700">🤖 KI-Dashboard · DIHAG Gruppe</div>
    </div>
    <div style="padding:24px 28px">
      <h2 style="margin:0 0 18px;font-size:16px;color:#1e2939">${esc(title)}</h2>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
      ${cta}
    </div>
    <div style="background:#f9fafb;padding:12px 28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e9ef">
      Diese Nachricht wurde automatisch vom KI-Dashboard generiert.
    </div>
  </div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════
function showToast(msg, type = 'success', duration = 4000) {
  let container = $id('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  // Nur einfache Text-Toasts über textContent (sicher); HTML-Toasts explizit über innerHTML
  // Alle dynamischen Inhalte (e.message etc.) werden vor Aufruf per esc() bereinigt
  toast.innerHTML = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('toast-show')); });
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function $id(id) { return document.getElementById(id); }

// Debounce: verzögert die Ausführung bis `ms` nach dem letzten Aufruf — entlastet Suchfelder,
// die sonst bei jedem Tastendruck das komplette Card-Grid per innerHTML neu aufbauen würden.
function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
const _dSearchAntraege = debounce(filterAntraege, 150);
const _dSearchRegister = debounce(filterRegister, 150);
const _dSearchLizenzen = debounce(renderLizenzen, 150);
// Als Funktionsdeklaration exportiert, damit die inline-oninput-Attribute sie zuverlässig auflösen
function searchAntraege() { _dSearchAntraege(); }
function searchRegister() { _dSearchRegister(); }
function searchLizenzen() { _dSearchLizenzen(); }

// Konvertiert Formulareingabe in den von der Graph API erwarteten Typ
function spValue(type, v) {
  if (type === 'number') return parseFloat(v);
  if (type === 'date')   return v ? v : null;  // HTML-Datumseingabe liefert bereits 'YYYY-MM-DD' – kein Umweg über new Date() (erzeugt '+022222-...' für weit entfernte Jahre)
  // yesno: SP-Boolean-Spalten erwarten true/false, wir zeigen 'Ja'/'Nein'
  if (type === 'yesno')  return v === 'Ja' ? true : v === 'Nein' ? false : null;
  return v;
}

// Umgekehrt: SP-Wert → Anzeige-String für yesno-Felder
function spDisplayValue(type, v) {
  if (type === 'yesno') {
    if (v === true  || v === 1) return 'Ja';
    if (v === false || v === 0) return 'Nein';
  }
  return v ?? '';
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');  // Single-quote: verhindert Attributkontext-Ausbruch in onclick='...'
}

function fmtDate(s) {
  if (!s) return '–';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function fmtEuro(n) {
  if (n === null || n === undefined || isNaN(n)) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function statusBadge(s) {
  const label = s || 'Eingereicht';
  const map = {
    'eingereicht':  ['s-eingereicht',  '📩'],
    'in prüfung':   ['s-in-pruefung',  '🔍'],
    'genehmigt':    ['s-genehmigt',    '✓'],
    'abgelehnt':    ['s-abgelehnt',    '✕'],
    'rückfrage':    ['s-rueckfrage',   '?'],
  };
  const [cls, icon] = map[label.toLowerCase().trim()] || ['s-eingereicht', '•'];
  return `<span class="badge-status ${cls}">${icon} ${esc(label)}</span>`;
}

function riskBadge(r) {
  if (!r) return '';
  const map = {
    'geringes risiko': 'r-gering',
    'normales risiko': 'r-normal',
    'hohes risiko':    'r-hoch',
    'verboten':        'r-verboten',
  };
  const cls = map[r.toLowerCase().trim()] || 'r-normal';
  return `<span class="badge-risk ${cls}">${esc(r)}</span>`;
}

// ═══════════════════════════════════════════════════════════════════
// EINSTELLUNGEN (nur Gremium)
// ═══════════════════════════════════════════════════════════════════

// Parst die Zustimmungs-IDs aus dem [APPROVALS:email1|email2] Token im GremiumKommentar
function parseApprovals(kommentar) {
  const m = (kommentar || '').match(/\[APPROVALS:(.*?)\]/);
  return m ? m[1].split('|').filter(Boolean) : [];
}

// Rendert den Kommentar-Verlauf als formatiertes Log (read-only)
// Format je Eintrag: "[DD.MM.YYYY HH:MM | Autorenname] Text" oder legacy "[DD.MM.YYYY HH:MM] Text"
function renderKommentarLog(text) {
  if (!text) return '';
  const entries = text.split(/\n──\n/).map(e => e.trim()).filter(Boolean);
  if (!entries.length) return '';
  return entries.map(entry => {
    const m = entry.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    let date = '', author = '', body = entry;
    if (m) {
      const parts = m[1].split('|').map(s => s.trim());
      date   = parts[0] || '';
      author = parts[1] || '';
      body   = m[2].trim();
    }
    const words    = (author || '?').split(' ').filter(Boolean);
    const initials = words.length >= 2
      ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
      : (author || '?').slice(0, 2).toUpperCase();
    const isAntwort = body.startsWith('Antwort:');
    const avatarBg  = isAntwort ? '#fef3c7' : '#e0e7ff';
    const avatarCol = isAntwort ? '#92400e' : '#4338ca';
    return `
      <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9;last-child:border-bottom:none">
        <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:${avatarBg};color:${avatarCol};
                    font-size:.63rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px">
          ${esc(initials)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:3px;flex-wrap:wrap">
            ${author ? `<span style="font-size:.8rem;font-weight:600;color:#1e2939">${esc(author)}</span>` : '<span style="font-size:.8rem;font-weight:600;color:#6b7280">Gremium</span>'}
            ${date   ? `<span style="font-size:.71rem;color:#9ca3af">${esc(date)}</span>` : ''}
          </div>
          <div style="font-size:.82rem;color:#374151;white-space:pre-wrap;line-height:1.45;word-break:break-word">${esc(body)}</div>
        </div>
      </div>`;
  }).join('');
}

// Einstellungen kommen zentral aus der access-config.json (_kiCfg, in boot()
// geladen) – gleiche Signatur wie früher, damit alle Aufrufer unverändert bleiben.
// Vorher localStorage: damit galten Genehmigungsmodus/Mail-Schalter pro Browser!
function loadSettings() {
  return {
    benachrichtigung: {
      beiEinreichung:    _kiCfg.kiMailBeiEinreichung,
      beiEntscheidung:   _kiCfg.kiMailBeiEntscheidung,
      genehmigungsmodus: _kiCfg.kiGenehmigungsmodus,
    },
  };
}

function renderEinstellungen() {
  const settings = loadSettings();
  const genehmiger = getGenehmiger();   // aus RMS access-config (read-only hier)
  const ben = settings.benachrichtigung || {};

  const genList = genehmiger.length
    ? genehmiger.map(g => {
        const rc = ROLLE_COLORS[g.rolle] || ROLLE_COLORS['Sonstiges'];
        const rolleBadge = g.rolle
          ? `<span style="font-size:.7rem;font-weight:600;padding:2px 8px;border-radius:20px;background:${rc.bg};color:${rc.color};border:1px solid ${rc.border}">${esc(g.rolle)}</span>`
          : '';
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:#f9fafb;border-radius:8px;margin-bottom:6px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:.875rem;font-weight:600">${esc(g.name || g.email)}</span>
              ${rolleBadge}
            </div>
            <div style="font-size:.75rem;color:#9ca3af"><span style="font-size:.68rem;font-weight:600;color:#d1d5db;text-transform:uppercase;letter-spacing:.3px">UPN </span>${esc(g.email)}</div>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:16px 10px;font-size:.82rem">Noch keine Genehmiger hinterlegt.</div>`;

  const adminList = (_rmsAdmins || []).map(a =>
    `<span class="upn-chip" style="font-size:.75rem;max-width:none">${esc(a)}</span>`).join(' ');

  $id('einstellungen-body').innerHTML = `
    <div class="settings-grid">

      <div class="settings-card">
        <div class="settings-card-title">👤 Genehmiger (KI-Gremium)</div>
        <p style="font-size:.82rem;color:#6b7280;margin-bottom:14px;line-height:1.5">
          Personen, die KI-Anträge prüfen und entscheiden. Liste und Position
          (Legal/Datenschutz/Compliance/IT) werden zentral im
          <strong>Richtlinienmanagement</strong> gepflegt (Einstellungen → Karte
          „KI-Gremium"; ist sie leer, gilt die allgemeine Genehmiger-Liste).
        </p>
        <div id="gen-list">${genList}</div>
        <div style="margin-top:10px;font-size:.78rem;color:#6b7280;line-height:1.5">
          🛡️ Administratoren: ${adminList || '–'}
        </div>
        <a class="btn btn-neutral btn-sm" href="../" style="margin-top:12px">⚙️ Im Richtlinienmanagement verwalten →</a>
        <div style="margin-top:18px;padding-top:16px;border-top:1px solid #e5e9ef">
          <div style="font-size:.82rem;font-weight:600;color:#374151;margin-bottom:10px">⚖️ Genehmigungsmodus</div>
          <label class="settings-check">
            <input type="radio" name="genmodus" id="modus-einstimmig" value="einstimmig" ${(ben.genehmigungsmodus || 'einstimmig') === 'einstimmig' ? 'checked' : ''}>
            <span><strong>Einstimmig</strong> – alle Genehmiger müssen einzeln zustimmen</span>
          </label>
          <label class="settings-check" style="margin-top:6px">
            <input type="radio" name="genmodus" id="modus-einer" value="einer" ${ben.genehmigungsmodus === 'einer' ? 'checked' : ''}>
            <span><strong>Einer reicht</strong> – eine Zustimmung genügt zur Freigabe</span>
          </label>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">📧 E-Mail-Benachrichtigungen</div>
        <p style="font-size:.82rem;color:#6b7280;margin-bottom:14px;line-height:1.5">
          E-Mails werden <strong>vollautomatisch</strong> über Microsoft Graph (Ihr Konto) versendet –
          kein E-Mail-Programm nötig. Voraussetzung: App-Berechtigung <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">Mail.Send</code>
          in der Azure AD App-Registrierung.
        </p>
        <label class="settings-check">
          <input type="checkbox" id="notif-einreichung" ${ben.beiEinreichung !== false ? 'checked' : ''}>
          <span>Bei neuem Antrag → alle Genehmiger automatisch benachrichtigen</span>
        </label>
        <label class="settings-check">
          <input type="checkbox" id="notif-entscheidung" ${ben.beiEntscheidung !== false ? 'checked' : ''}>
          <span>Nach Gremium-Entscheidung → Antragsteller automatisch benachrichtigen</span>
        </label>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e9ef">
          <label class="form-label" for="mail-domains">Erlaubte Empfänger-Domains</label>
          <input id="mail-domains" type="text" class="form-control" placeholder="dihag.com, ewa-guss.de"
            value="${esc((_kiCfg.kiMailDomains || []).join(', '))}">
          <div class="form-hint">Kommagetrennt. Benachrichtigungen an andere Domains werden aus Sicherheitsgründen übersprungen
            (relevant für Genehmiger aus Gruppengesellschaften, z.&nbsp;B. ewa-guss.de, eurometall.com).</div>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">🧩 Reiter-Sichtbarkeit</div>
        <p style="font-size:.82rem;color:#6b7280;margin-bottom:14px;line-height:1.5">
          Die Reiter <strong>Lizenzen</strong> und <strong>KI-Register</strong> sind standardmäßig
          <strong>ausgeblendet</strong>. Hier lassen sie sich für das KI-Gremium wieder einblenden.
        </p>
        <label class="settings-check">
          <input type="checkbox" id="show-lizenzen" ${_kiCfg.kiZeigeLizenzen ? 'checked' : ''}>
          <span>Reiter <strong>Lizenzen</strong> anzeigen</span>
        </label>
        <label class="settings-check" style="margin-top:6px">
          <input type="checkbox" id="show-register" ${_kiCfg.kiZeigeRegister ? 'checked' : ''}>
          <span>Reiter <strong>KI-Register</strong> anzeigen</span>
        </label>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">🏛️ Mitbestimmung (KBR / Betriebsräte)</div>
        <p style="font-size:.82rem;color:#6b7280;margin-bottom:14px;line-height:1.5">
          E-Mail-Adressen für die Mitbestimmungsprüfung. Markiert der Antragsteller im Antrag
          den <strong>Konzernbetriebsrat</strong> oder den <strong>Betriebsrat eines Werks</strong> als
          betroffen, wird der Antrag automatisch an die hier hinterlegte Adresse gesendet.
        </p>
        <div class="form-group">
          <label class="form-label" for="kbr-mail">Konzernbetriebsrat (KBR)</label>
          <input id="kbr-mail" type="email" class="form-control" placeholder="kbr@dihag.com"
            value="${esc(_kiCfg.kiKbrMail || '')}">
        </div>
        <div style="margin-top:14px;font-size:.82rem;font-weight:600;color:#374151;margin-bottom:8px">
          Betriebsräte je Werk
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px 14px">
          ${MITBESTIMMUNG_WERKE.map(code => `
            <div class="form-group" style="margin:0">
              <label class="form-label" for="br-mail-${code}" style="font-size:.75rem">${code}</label>
              <input id="br-mail-${code}" type="email" class="form-control"
                placeholder="br-${code.toLowerCase()}@…" value="${esc((_kiCfg.kiBrMails || {})[code] || '')}">
            </div>`).join('')}
        </div>
        <div class="form-hint" style="margin-top:10px">
          Leer lassen, wenn (noch) kein Betriebsrat hinterlegt ist. Diese Adressen werden auch dann
          zugestellt, wenn sie auf einer anderen Domain liegen (z.&nbsp;B. ewa-guss.de).
        </div>
      </div>

    </div>
    <div style="margin-top:20px;display:flex;gap:10px;align-items:center">
      <button class="btn btn-primary" id="btn-save-settings" onclick="saveSettings()">💾 Einstellungen speichern</button>
      <span id="settings-saved" style="font-size:.82rem;color:#15803d;display:none">✓ Gespeichert</span>
    </div>
    <div style="margin-top:10px;font-size:.75rem;color:#9ca3af;line-height:1.5">
      ℹ️ Diese Einstellungen werden zentral in der access-config.json gespeichert und gelten
      für alle Administratoren und Geräte (vorher: pro Browser).
    </div>`;
}

async function saveSettings() {
  const btn   = $id('btn-save-settings');
  const modus = document.querySelector('input[name="genmodus"]:checked')?.value || 'einstimmig';
  const domains = ($id('mail-domains')?.value || '')
    .split(',').map(d => d.trim().toLowerCase()).filter(d => d.includes('.'));
  if (!domains.length) { showToast('Mindestens eine gültige Mail-Domain angeben.', 'error'); return; }

  // Mitbestimmung: KBR-Mail + BR-Mails je Werk einsammeln (nur nicht-leere)
  const isMail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
  const kbrMail = ($id('kbr-mail')?.value || '').trim();
  if (kbrMail && !isMail(kbrMail)) { showToast('KBR-Mail ist keine gültige E-Mail-Adresse.', 'error'); return; }
  const brMails = {};
  for (const code of MITBESTIMMUNG_WERKE) {
    const v = ($id('br-mail-' + code)?.value || '').trim();
    if (!v) continue;
    if (!isMail(v)) { showToast(`BR-Mail für ${code} ist keine gültige E-Mail-Adresse.`, 'error'); return; }
    brMails[code] = v;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Speichern…'; }
  try {
    await saveKiConfig({
      kiGenehmigungsmodus:   modus === 'einer' ? 'einer' : 'einstimmig',
      kiMailBeiEinreichung:  $id('notif-einreichung')?.checked  ?? true,
      kiMailBeiEntscheidung: $id('notif-entscheidung')?.checked ?? true,
      kiMailDomains:         domains,
      kiZeigeLizenzen:       $id('show-lizenzen')?.checked === true,
      kiZeigeRegister:       $id('show-register')?.checked === true,
      kiKbrMail:             kbrMail,
      kiBrMails:             brMails,
    });
    applyKiTabVisibility();   // Reiter sofort ein-/ausblenden (ohne Reload)
    showToast('Einstellungen zentral gespeichert.');
    const saved = $id('settings-saved');
    if (saved) { saved.style.display = ''; setTimeout(() => saved.style.display = 'none', 2500); }
  } catch(e) {
    showToast('Speichern fehlgeschlagen: ' + esc(e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Einstellungen speichern'; }
  }
}

// ═══════════════════════════════════════════════════════════════════
// ANHÄNGE — Graph-Dokumentbibliothek (Ordner KI-Antraege-Anhaenge/{itemId})
// Speicherung über Graph (Files.ReadWrite.All, bereits konsentiert) statt
// SP-REST-Listenanhängen → funktioniert ohne zusätzlichen SharePoint-Consent.
// Alt-Anhänge bestehender Anträge (SP-REST-Listenanhänge) werden lesend
// gemergt, solange ein SP-Token verfügbar ist.
// ═══════════════════════════════════════════════════════════════════
const ATT_FOLDER = 'KI-Antraege-Anhaenge';

async function spAttachFetch(url, options = {}) {
  const token = await tryGetSpToken();
  if (!token) throw new Error('SP-Token nicht verfügbar');
  const headers = {
    'Accept': 'application/json;odata=verbose',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`SP ${res.status}: ${err.slice(0, 200)}`);
  }
  if (res.status === 200) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return res.json();
    return res.arrayBuffer();
  }
  return null;
}

// Anhänge eines Antrags: Graph-Ordner + Legacy-SP-Listenanhänge (read-only)
async function listAttachments(itemId) {
  const driveId = await getAppDriveId();
  let files = [];
  try {
    const data = await gGet(`/drives/${driveId}/root:/${ATT_FOLDER}/${itemId}:/children?$select=id,name,webUrl,size`);
    files = (data.value || []).map(f => ({ name: f.name, url: f.webUrl, source: 'graph' }));
  } catch(e) {
    if (e.status !== 404) throw e;   // 404 = Ordner existiert noch nicht → keine Anhänge
  }
  // Legacy: alte SP-REST-Listenanhänge lesend mergen (nur wenn SP-Token vorhanden)
  try {
    if (await tryGetSpToken()) {
      const url = `https://${SP_HOST}${SP_SITE_PATH}/_api/web/lists/getbytitle('${LIST_ANTRAEGE}')/items(${itemId})/AttachmentFiles`;
      const data = await spAttachFetch(url);
      for (const att of (data?.d?.results || [])) {
        files.push({ name: att.FileName, url: `https://${SP_HOST}${att.ServerRelativeUrl}`, source: 'sp' });
      }
    }
  } catch(e) { /* Legacy-Anhänge optional – kein SP-Consent nötig */ }
  return files;
}

async function uploadAttachment(itemId, file) {
  const driveId  = await getAppDriveId();
  const safeName = file.name.replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '_');
  const itemPath = `/drives/${driveId}/root:/${ATT_FOLDER}/${itemId}/${encodeURIComponent(safeName)}:`;
  const buf = await file.arrayBuffer();

  if (buf.byteLength <= 4 * 1024 * 1024) {
    // Simple Upload (≤4 MB) – legt fehlende Ordner automatisch an
    const token = await getToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0${itemPath}/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream' },
      body: buf,
    });
    if (!res.ok) throw new Error(`Upload ${res.status}`);
    return;
  }

  // >4 MB: Upload-Session mit Chunks (Graph verlangt Vielfache von 320 KiB)
  const session = await gPost(`${itemPath}/createUploadSession`, {
    item: { '@microsoft.graph.conflictBehavior': 'replace' },
  });
  const CHUNK = 16 * 320 * 1024;   // 5 MiB, 320-KiB-aligned
  for (let start = 0; start < buf.byteLength; start += CHUNK) {
    const end = Math.min(start + CHUNK, buf.byteLength);
    // uploadUrl ist vor-authentifiziert – KEIN Authorization-Header mitsenden
    const res = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${start}-${end - 1}/${buf.byteLength}` },
      body: buf.slice(start, end),
    });
    if (!res.ok) throw new Error(`Upload-Chunk ${res.status}`);
  }
}

async function deleteAttachment(itemId, fileName, source = 'graph') {
  if (source === 'sp') {
    // Legacy-SP-Listenanhang löschen (nur möglich solange SP-Token verfügbar)
    const url = `https://${SP_HOST}${SP_SITE_PATH}/_api/web/lists/getbytitle('${LIST_ANTRAEGE}')/items(${itemId})/AttachmentFiles/getbyfilename('${encodeURIComponent(fileName)}')`;
    const token = await tryGetSpToken();
    if (!token) throw new Error('Alt-Anhang: SP-Token nicht verfügbar');
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json;odata=verbose',
        'IF-MATCH': '*',
        'X-HTTP-Method': 'DELETE',
      },
    });
    if (!res.ok && res.status !== 404) throw new Error(`SP ${res.status}`);
    return;
  }
  const driveId = await getAppDriveId();
  await gDel(`/drives/${driveId}/root:/${ATT_FOLDER}/${itemId}/${encodeURIComponent(fileName)}:`);
}

async function renderAttachments(itemId) {
  const listEl = $id('att-list');
  if (!listEl) return;
  try {
    const files = await listAttachments(itemId);
    if (!files.length) {
      listEl.innerHTML = `<span style="color:#9ca3af;font-size:.8rem">Keine Anhänge vorhanden.</span>`;
      return;
    }
    listEl.innerHTML = files.map(att => {
      const fname = att.name || 'Datei';
      return `<div class="att-item">
        <a class="att-name" href="${esc(att.url || '#')}" target="_blank" rel="noopener">📄 ${esc(fname)}</a>
        ${isGremium ? `<button class="att-del" data-item="${itemId}" data-fname="${esc(fname)}" data-source="${esc(att.source)}" onclick="attDelete(this.dataset.item, this.dataset.fname, this.dataset.source)">✕</button>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = `<span style="color:#ef4444;font-size:.8rem">Fehler beim Laden: ${esc(e.message)}</span>`;
    console.warn('Anhänge laden fehlgeschlagen:', e);
  }
}

async function attDelete(itemId, fileName, source) {
  if (!confirm(`Anhang „${fileName}" wirklich löschen?`)) return;
  try {
    await deleteAttachment(itemId, fileName, source);
    showToast(`✓ „${fileName}" gelöscht.`);
    await renderAttachments(itemId);
  } catch(e) {
    showToast(`Fehler beim Löschen: ${esc(e.message)}`, 'error');
  }
}

async function attUploadFiles(itemId, files) {
  if (!files || !files.length) return;
  const MAX_MB = 50;
  const dropEl = $id('att-drop');
  if (dropEl) dropEl.classList.add('att-uploading');
  let uploaded = 0, failed = 0;
  for (const file of files) {
    if (file.size > MAX_MB * 1024 * 1024) {
      showToast(`„${esc(file.name)}" ist zu groß (max. ${MAX_MB} MB).`, 'error'); failed++; continue;
    }
    try {
      await uploadAttachment(itemId, file);
      uploaded++;
    } catch(e) {
      showToast(`Fehler bei „${esc(file.name)}": ${esc(e.message)}`, 'error'); failed++;
    }
  }
  if (dropEl) dropEl.classList.remove('att-uploading');
  if (uploaded) showToast(`✓ ${uploaded} Datei${uploaded > 1 ? 'en' : ''} hochgeladen.`);
  await renderAttachments(itemId);
}

function attDragOver(e) {
  e.preventDefault();
  $id('att-drop')?.classList.add('drag-over');
}
function attDragLeave(e) {
  $id('att-drop')?.classList.remove('drag-over');
}
function attDrop(e, itemId) {
  e.preventDefault();
  $id('att-drop')?.classList.remove('drag-over');
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) attUploadFiles(itemId, files);
}
function attFileSelect(e, itemId) {
  const files = [...(e.target?.files || [])];
  if (files.length) attUploadFiles(itemId, files);
  if (e.target) e.target.value = '';
}
