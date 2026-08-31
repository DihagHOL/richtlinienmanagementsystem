'use strict';

/**
 * Prozesslandkarte – Ansicht „🗺 Landkarte" im Reiter Prozesse
 * ============================================================
 * Die Prozesslandschaft des Konzerns als anklickbare Karte: Führungs-,
 * Kern- und Unterstützungsprozesse in der gewohnten Darstellung. Jede Kachel
 * kennt ihren <b>Geltungsbereich</b> (Standorte) und – wo vorhanden – ihr
 * <b>BPMN-Modell</b>. Ein Klick führt von der Übersicht ins Modell und von dort
 * weiter zu den Regelwerken, die daran hängen.
 *
 * Drei Entscheidungen, die den Aufwand klein halten:
 *
 *  1. Die Karte liegt als `prozesslandkarte.json` im Konfig-Ordner – dieselbe
 *     Mechanik wie die Governance-Struktur. Keine neue SharePoint-Liste, keine
 *     neue Spalte, kein Administrationsaufwand.
 *  2. Die Verknüpfung Prozess → Regelwerk wird NICHT hier gespeichert. Sie
 *     steht längst im BPMN-XML (Marker `[[rms:policies=…]]`). Die Kachel merkt
 *     sich nur, welches Modell zu ihr gehört – eine Wahrheit, nicht zwei.
 *  3. Der Geltungsbereich nutzt dieselbe Auswahl wie Regelwerke
 *     (`renderGeltungsbereichSection`) und dasselbe Vokabular (STANDORTE,
 *     'ALLE'). Damit lässt sich fragen: „Welche Prozesse gelten in SHB?" –
 *     und die Antwort passt zu der, die die Regelwerke geben.
 */

/* Jedes Werk führt seine eigene Landkarte; dazu die Konzern-Ebene für das,
   was die Holding steuert. Die Reihenfolge bestimmt die Auswahl oben. */
const LK_WERKE = ['KONZERN'].concat(typeof STANDORTE !== 'undefined' ? STANDORTE : []);
function lkWerkLabel(w) { return w === 'KONZERN' ? 'Konzern / Holding' : w; }

/**
 * Die Werke, deren Landkarte sichtbar ist.
 *
 * „KONZERN" bleibt immer dabei: Was konzernweit gilt, gilt auch für die eigene
 * Gesellschaft – genauso wie ein Regelwerk mit Geltungsbereich „ALLE".
 */
function lkWerkeSichtbar() {
  if (typeof trennungGreift !== 'function' || !trennungGreift()) return LK_WERKE.slice();
  const meine = meineWerke();
  return LK_WERKE.filter(w => w === 'KONZERN' || meine.includes(w));
}

/**
 * Auf eine Karte stellen, die auch sichtbar ist.
 *
 * Offen ist zunächst HOL. Gehört jemand gar nicht zur Holding, wäre das der
 * Einstieg in eine fremde Gesellschaft – und zwar auch dann, wenn gerade nichts
 * gezeichnet wird: Suche, Sprünge und „+ Prozess" lesen dieselbe Variable.
 */
function lkWerkAbsichern() {
  const sichtbar = lkWerkeSichtbar();
  if (!sichtbar.includes(_lkWerk)) _lkWerk = sichtbar[0] || 'KONZERN';
  return _lkWerk;
}

/* Bandfarben aus dem DIHAG-Corporate-Design. Ein Band, eine Farbe – die Kachel
   trägt sie als Kante, damit die Zugehörigkeit ohne Legende lesbar bleibt. */
const LK_FARBEN = ['#17509E', '#F08300', '#1A2644', '#5B8CB8', '#7A6417', '#424241'];

/* ── Verweise zwischen Prozessen ──────────────────────────────────────────
   Drei Arten reichen für das, was auf einer Prozesslandkarte vorkommt:
   Hierarchie („besteht aus"), Kette („danach folgt") und Querbezug („nutzt").
   Jede Art trägt ihre Gegenrichtung mit – wer eine Kachel öffnet, will auch
   sehen, wer auf sie zeigt, nicht nur wohin sie selbst zeigt. */
const LK_VERWEIS_ARTEN = [
  { art: 'unterprozess', label: 'Unterprozesse',  zeichen: '↳', umkehr: 'Teil von' },
  { art: 'folgt',        label: 'Danach folgt',   zeichen: '→', umkehr: 'Davor liegt' },
  { art: 'nutzt',        label: 'Nutzt',          zeichen: '⇢', umkehr: 'Wird genutzt von' },
];

function lkVerweisArt(art) {
  return LK_VERWEIS_ARTEN.find(a => a.art === art) || LK_VERWEIS_ARTEN[2];
}

/* ── Startbestand: die abgestimmte Landschaft – sie gehört zu HOL ── */
const LK_START_WERK = 'HOL';
const LK_START = {
  baender: [
    { key: 'fuehrung',       titel: 'Führungsprozesse' },
    { key: 'kern',           titel: 'Kernprozesse' },
    { key: 'unterstuetzung', titel: 'Unterstützungsprozesse' },
  ],
  kacheln: [
    { id: 'strategie',     band: 'fuehrung', name: 'Strategie', unter: '' },
    { id: 'projekte',      band: 'fuehrung', name: 'Programm- und Projektmanagement', unter: 'Changemanagement' },
    { id: 'steuern',       band: 'fuehrung', name: 'Unternehmen steuern', unter: '' },
    { id: 'governance',    band: 'fuehrung', name: 'Corporate Governance', unter: 'Prozessmanagement' },
    { id: 'orgentwicklung',band: 'fuehrung', name: 'Organisations- und Mitarbeiterentwicklung', unter: '' },

    { id: 'vertrieb',      band: 'kern', name: 'Vertrieb', unter: 'Gießdienstleistungen vermarkten · CRM' },
    { id: 'produktion',    band: 'kern', name: 'Produktion', unter: 'Produkte herstellen' },
    { id: 'auftraege',     band: 'kern', name: 'Aufträge abwickeln', unter: 'Versand / Faktura' },

    { id: 'compliance',    band: 'unterstuetzung', name: 'Compliance', unter: 'Datenschutz · Legal' },
    { id: 'buchhaltung',   band: 'unterstuetzung', name: 'Buchhaltung', unter: '' },
    { id: 'controlling',   band: 'unterstuetzung', name: 'Controlling', unter: '' },
    { id: 'personal',      band: 'unterstuetzung', name: 'Personal', unter: '' },
    { id: 'beschaffung',   band: 'unterstuetzung', name: 'Beschaffung', unter: '' },
    { id: 'it',            band: 'unterstuetzung', name: 'IT', unter: '' },
    { id: 'instandhaltung',band: 'unterstuetzung', name: 'Instandhaltung', unter: '' },
    { id: 'avor',          band: 'unterstuetzung', name: 'Arbeitsvorbereitung', unter: '' },
    { id: 'qs',            band: 'unterstuetzung', name: 'Qualitätssicherung', unter: '' },
  ],
};

let _lkDaten = null;         // { version, karten: { WERK: {…} }, historie }
let _lkGeaendertAm = '';     // Zeitstempel der geladenen Datei (Gleichzeitigkeit)
let _lkGeladen = false;
let _lkWerk = LK_START_WERK; // welche Landkarte gerade offen ist
let _lkFilter = '';          // Standort-Filter innerhalb der Karte ('' = alle)
let _lkEditing = null;       // Kachel im Bearbeiten-Dialog
let _lkZiehIndex = -1;       // laufendes Ziehen
let _lkSuche = '';           // Suche über ALLE Landkarten
let _lkMembers = null;       // Mitarbeiter für die Auswahl der Verantwortlichen

/** Mitarbeiterliste einmal holen und die Auswahllisten nachfüllen. */
function lkMitgliederLaden() {
  if (_lkMembers || typeof spGetMembers !== 'function') return;
  spGetMembers().then(m => {
    _lkMembers = m || [];
    document.querySelectorAll('datalist#lk-people').forEach(dl => { dl.innerHTML = _lkPeopleOptions(); });
  }).catch(() => { _lkMembers = []; });
}

function _lkPeopleOptions() {
  return (_lkMembers || []).map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('');
}

/** Anzeigename zu einer Mailadresse – solange die Liste fehlt, die Adresse selbst. */
function lkPersonName(upn) {
  const u = String(upn || '').trim();
  if (!u) return '';
  const t = (_lkMembers || []).find(m => String(m.upn || '').toLowerCase() === u.toLowerCase());
  return (t && t.name) || u;
}

/** Verantwortliche(r) einer Kachel – '' wenn nicht gepflegt. */
function lkVerantwortlich(k) { return String((k && k.verantwortlich) || '').trim(); }

/** Dauerhafter Link auf einen Prozess – für Mails, Regelwerke, Schulungen. */
function lkLinkFuer(werk, id) {
  const basis = (typeof location !== 'undefined') ? (location.origin + location.pathname) : '';
  return `${basis}?ansicht=prozesse&prozess=${encodeURIComponent(werk)}:${encodeURIComponent(id)}`;
}

async function lkLinkKopieren(werk, id) {
  const url = lkLinkFuer(werk, id);
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopiert ✓', 'success');
  } catch (e) {
    // Ohne Zwischenablage-Recht bleibt der Link wenigstens sichtbar.
    if (typeof uiConfirm === 'function') uiConfirm(`<div style="word-break:break-all">${esc(url)}</div>`, { title: 'Link zum Prozess', okLabel: 'Schließen' });
  }
}

/** Tiefe Kopie des Startbestands – nie die Konstante verändern. */
/**
 * Vorlage für die Konzernebene: sechs Prozessbereiche einer Führungsholding.
 * Nicht die Landschaft eines Werks in klein, sondern das, was eine Holding
 * tatsächlich tut – Steuern, Finanzieren, Absichern, Bündeln, Kommunizieren,
 * Verändern. Die Aufgaben je Bereich sind die Kacheln.
 */
const LK_KONZERN = {
  baender: [
    { key: 'strategie',      titel: 'Strategie' },
    { key: 'finanzen',       titel: 'Finanzen' },
    { key: 'risiko',         titel: 'Risiko & Compliance' },
    { key: 'synergien',      titel: 'Synergien' },
    { key: 'kommunikation',  titel: 'Kommunikation' },
    { key: 'transformation', titel: 'Transformation' },
  ],
  kacheln: [
    { id: 'vision',        band: 'strategie', name: 'Vision', unter: 'Leitbild und strategische Ziele' },
    { id: 'portfolio',     band: 'strategie', name: 'Portfolio-Steuerung', unter: 'Beteiligungen, Zukäufe, Desinvestitionen' },
    { id: 'marktanalyse',  band: 'strategie', name: 'Marktanalyse', unter: 'Märkte, Wettbewerb, Trends' },

    { id: 'kapital',       band: 'finanzen', name: 'Kapitalallokation', unter: 'Mittel verteilen, Investitionen entscheiden' },
    { id: 'treasury',      band: 'finanzen', name: 'Treasury', unter: 'Liquidität, Finanzierung, Währungen' },
    { id: 'steuern',       band: 'finanzen', name: 'Steueroptimierung', unter: 'Steuerplanung im Konzernverbund' },

    { id: 'risikomgmt',    band: 'risiko', name: 'Risikomanagement', unter: 'Risiken erfassen, bewerten, steuern' },
    { id: 'compliance',    band: 'risiko', name: 'Compliance', unter: 'Regelwerke, Kartellrecht, Datenschutz' },
    { id: 'revision',      band: 'risiko', name: 'Interne Revision', unter: 'Prüfungen und Nachverfolgung' },

    { id: 'sharedservices', band: 'synergien', name: 'Shared Services', unter: 'Gebündelte Leistungen für die Gesellschaften' },
    { id: 'wissen',         band: 'synergien', name: 'Wissensmanagement', unter: 'Wissen sichern und weitergeben' },
    { id: 'innovation',     band: 'synergien', name: 'Innovationen', unter: 'Ideen aufnehmen und in den Konzern tragen' },

    { id: 'reporting',     band: 'kommunikation', name: 'Reporting', unter: 'Konzernberichterstattung' },
    { id: 'stakeholder',   band: 'kommunikation', name: 'Stakeholder-Management', unter: 'Gesellschafter, Banken, Behörden' },
    { id: 'investoren',    band: 'kommunikation', name: 'Investor Relations', unter: 'Kapitalgeber informieren' },

    { id: 'change',        band: 'transformation', name: 'Change Management', unter: 'Veränderungen begleiten' },
    { id: 'projekte',      band: 'transformation', name: 'Projektsteuerung', unter: 'Programme und Projekte im Konzern' },
    { id: 'talente',       band: 'transformation', name: 'Talententwicklung', unter: 'Führungskräfte und Nachfolge' },
  ],
};

/**
 * Aufbau einer Holdinggesellschaft – nach der Skizze der Geschäftsführung.
 * Nicht Führungs-/Kern-/Unterstützungsprozesse, sondern die Funktionen einer
 * Holding: was sie steuert, finanziert, überwacht – und was die Töchter tun.
 * Jeder Kasten der Skizze ist ein Band, seine Punkte sind die Kacheln.
 */
const LK_HOLDING = {
  baender: [
    { key: 'strategie',     titel: 'Strategie' },
    { key: 'finanzierung',  titel: 'Finanzierung' },
    { key: 'controlling',   titel: 'Konzern-Controlling' },
    { key: 'personal',      titel: 'Personalwesen und Organisation' },
    { key: 'beteiligungen', titel: 'Beteiligungsverwaltung' },
    { key: 'beratung',      titel: 'Beratung' },
    { key: 'ueberwachung',  titel: 'Überwachung' },
    { key: 'toechter',      titel: 'Tochterunternehmen (operatives Geschäft)' },
  ],
  kacheln: [
    { id: 'hd-vision',      band: 'strategie', name: 'Vision & Leitbild', unter: '' },
    { id: 'hd-regelwerke',  band: 'strategie', name: 'Regelwerke', unter: 'Konzernregelungen erstellen und in Kraft setzen' },
    { id: 'hd-portfolio',   band: 'strategie', name: 'Portfolio', unter: '' },
    { id: 'hd-orgmass',     band: 'strategie', name: 'Organisatorische Maßnahmen', unter: '' },

    { id: 'hd-budget',      band: 'finanzierung', name: 'Budgetplanung', unter: '' },
    { id: 'hd-liquiditaet', band: 'finanzierung', name: 'Liquiditätsplanung', unter: '' },
    { id: 'hd-treasury',    band: 'finanzierung', name: 'Treasury', unter: '' },
    { id: 'hd-kapital',     band: 'finanzierung', name: 'Kapitalstruktur', unter: '' },
    { id: 'hd-aussenfin',   band: 'finanzierung', name: 'Außenfinanzierung', unter: '' },

    { id: 'hd-planung',     band: 'controlling', name: 'Planungssysteme', unter: '' },
    { id: 'hd-kontrolle',   band: 'controlling', name: 'Kontrollsysteme', unter: '' },
    { id: 'hd-bericht',     band: 'controlling', name: 'Berichtswesen', unter: '' },
    { id: 'hd-risiko',      band: 'controlling', name: 'Risikomanagement', unter: '' },

    { id: 'hd-perstrat',    band: 'personal', name: 'Konzernweite Personalstrategie', unter: '' },
    { id: 'hd-persentw',    band: 'personal', name: 'Personalentwicklung', unter: '' },
    { id: 'hd-fuehrkraft',  band: 'personal', name: 'Führungskräfteentwicklung', unter: '' },
    { id: 'hd-persentsch',  band: 'personal', name: 'Konzernweite Personalentscheidungen', unter: '' },

    { id: 'hd-erwerb',      band: 'beteiligungen', name: 'Erwerb von Beteiligungen', unter: '' },
    { id: 'hd-verwaltung',  band: 'beteiligungen', name: 'Verwaltung von Beteiligungen', unter: '' },
    { id: 'hd-portanp',     band: 'beteiligungen', name: 'Portfolioanpassung', unter: '' },
    { id: 'hd-ressourcen',  band: 'beteiligungen', name: 'Konzerninterne Ressourcenallokation', unter: '' },

    { id: 'hd-recht',       band: 'beratung', name: 'Rechtsberatung', unter: '' },
    { id: 'hd-vertrag',     band: 'beratung', name: 'Vertragsmanagement', unter: '' },
    { id: 'hd-ma',          band: 'beratung', name: 'M&A-Unterstützung', unter: '' },
    { id: 'hd-govern',      band: 'beratung', name: 'Corporate Governance', unter: '' },
    { id: 'hd-regulierung', band: 'beratung', name: 'Regulierungsmanagement', unter: '' },

    { id: 'hd-compliance',  band: 'ueberwachung', name: 'Compliance-Management', unter: '' },
    { id: 'hd-datenschutz', band: 'ueberwachung', name: 'Datenschutz', unter: '' },
    { id: 'hd-export',      band: 'ueberwachung', name: 'Exportkontrolle', unter: '' },
    { id: 'hd-revision',    band: 'ueberwachung', name: 'Interne Revision', unter: '' },
    { id: 'hd-frueh',       band: 'ueberwachung', name: 'Risikofrüherkennung', unter: '' },

    { id: 'hd-tagesgesch',  band: 'toechter', name: 'Operative Tagesgeschäftsführung', unter: '' },
    { id: 'hd-ergebnis',    band: 'toechter', name: 'Ergebnisverantwortung', unter: '' },
    { id: 'hd-umsetzung',   band: 'toechter', name: 'Umsetzung der Konzernstrategie', unter: '' },
  ],
};

/**
 * Die abgestimmte Konzern-Prozesslandkarte – Führung, Kernprozesse,
 * Unterstützungsprozesse mit den Teilprozessen je Kachel. Das ist der ganze
 * Konzern inklusive Gießerei, nicht nur die Holding.
 */
const LK_KONZERNKARTE = {
  baender: [
    { key: 'fuehrung',       titel: 'Führung' },
    { key: 'kern',           titel: 'Kernprozesse' },
    { key: 'unterstuetzung', titel: 'Unterstützungsprozesse' },
  ],
  kacheln: [
    { id: 'kk-strategie', band: 'fuehrung', name: 'Strategie- und Konzernentwicklung',
      unter: 'Strategieentwicklung · Markt- und Wettbewerbsanalyse · Portfolio & Standortstrategie · Technologie- & Innovationsstrategie · Investitionsstrategie' },
    { id: 'kk-transform', band: 'fuehrung', name: 'Strategieumsetzung & Transformation',
      unter: 'Strategische Projekte · Projektportfolio · Lean, Operational Excellence, KVP (TRIPLE-FIVE) · Change Management · Best-Practice-Transfer' },
    { id: 'kk-finanzen', band: 'fuehrung', name: 'Finanzielle Unternehmenssteuerung',
      unter: 'Konzernplanung & Budget · Forecast · KPI, Performance Management, Management Reporting · Liquiditätsmanagement · Investitionscontrolling · Banken-/Finanzierungsmanagement' },
    { id: 'kk-governance', band: 'fuehrung', name: 'Corporate Governance, Risk & Compliance',
      unter: 'Governance-System · Konzernrichtlinien · Risikomanagement · Compliance · Datenschutz-Governance · Internes Kontrollsystem · Krisenmanagement' },
    { id: 'kk-recht', band: 'fuehrung', name: 'Recht- & Vertragsmanagement',
      unter: 'Gesellschaftsrecht · Vertragsmanagement · Legal Claims · M&A · Restrukturierung · regulatorische Anforderungen' },
    { id: 'kk-organisation', band: 'fuehrung', name: 'Organisation, Führung & Personalstrategie',
      unter: 'Organisationsentwicklung · Führungsmodell · Personalstrategie · Führungskräfte- und Mitarbeiterentwicklung · Nachfolgeplanung · Kompetenzentwicklung · Unternehmenskultur, Leitbild' },
    { id: 'kk-kommunikation', band: 'fuehrung', name: 'Kommunikation & Stakeholder Management',
      unter: 'Kommunikationsstrategie · Interne Kommunikation · Externe Kommunikation, Corporate Identity · Krisenkommunikation · Stakeholdermanagement' },

    { id: 'kk-markt', band: 'kern', name: 'Markt- u. Geschäftsentwicklung',
      unter: 'Marktanalyse · Zielmärkte · Kundenentwicklung · Business Development' },
    { id: 'kk-engineering', band: 'kern', name: 'Engineering & Produktentwicklung',
      unter: 'Kundenanforderungen · Konstruktion (perspektivisch) · Gießsimulation + Prozessentwicklung · Kalkulation' },
    { id: 'kk-vertrieb', band: 'kern', name: 'Vertrieb & Angebotsmanagement',
      unter: 'Anfrage · Angebot · Verhandlung · Auftrag' },
    { id: 'kk-auftrag', band: 'kern', name: 'Auftragsabwicklung & Produktionsplanung',
      unter: 'Produktionsplanung · Kapazitätsplanung · Materialplanung · Terminplanung' },
    { id: 'kk-produktion', band: 'kern', name: 'Produktion & Wertschöpfung',
      unter: 'Modellbereitstellung · Kerne fertigen · Formen · Schmelzen & Gießen · Putzen · Wärmebehandlung · Bearbeitung' },
    { id: 'kk-qs', band: 'kern', name: 'Qualitätssicherung',
      unter: 'Prüfung · Qualitätsplanung · Reklamationsmanagement · 8D · Kundenfreigaben' },
    { id: 'kk-versand', band: 'kern', name: 'Versand & Logistik', unter: '' },

    { id: 'kk-personal', band: 'unterstuetzung', name: 'Personalmanagement',
      unter: 'Recruiting · Personaladministration · Payroll · Ausbildung · Weiterbildung' },
    { id: 'kk-it', band: 'unterstuetzung', name: 'IT & Digitalisierung',
      unter: 'IT-Infrastruktur · ERP – SAP S/4HANA · Power BI / Reporting-Applikationen · Digital Workplace · KI und Automatisierung' },
    { id: 'kk-einkauf', band: 'unterstuetzung', name: 'Einkauf & Supply Management',
      unter: 'Strategischer Einkauf · Energiebeschaffung · Operativer Einkauf · Lead-Buyer-Konzept / Warengruppenmanagement · Lieferantenmanagement · Lieferantenentwicklung' },
    { id: 'kk-rewe', band: 'unterstuetzung', name: 'Rechnungswesen & Administration',
      unter: 'Kreditoren · Debitoren · Hauptbuch · Anlagenbuchhaltung · internes Rechnungswesen · Zahlungsverkehr · Konzernabschluss · Steuerwesen' },
    { id: 'kk-qm', band: 'unterstuetzung', name: 'Qualitätsmanagement & Systeme',
      unter: 'QM-System · Zertifizierungen · Audits · Standards · KVP' },
    { id: 'kk-wissen', band: 'unterstuetzung', name: 'Wissensmanagement',
      unter: 'Best Practices · Lessons Learned · Know-how-Transfer · Dokumentenmanagement / SharePoint' },
    { id: 'kk-technik', band: 'unterstuetzung', name: 'Technische Services, Instandhaltung & Umwelt',
      unter: 'Instandhaltungsmanagement · Gebäudemanagement · Energiemanagement · Umweltmanagement · Arbeitssicherheit & Gesundheitsschutz · Technische Investitionen · Genehmigungen & technische Compliance' },
  ],
};

/**
 * Gesamtbild einer Führungsholding – aus den drei Vorlagen zusammengeführt.
 * Die Form der Prozesslandkarte (Bänder statt Kästen), gefüllt mit dem, was
 * eine Holding tatsächlich tut, und mit der Schnittstelle zu den Töchtern als
 * eigenem Band: Ohne sie endet jede Konzernlandkarte dort, wo die Arbeit
 * anfängt. Die Kernprozesse einer Holding sind nicht Gießen, sondern
 * Beteiligungen führen und Kapital verteilen.
 */
const LK_KONZERN_GESAMT = {
  baender: [
    { key: 'steuern',     titel: 'Steuern & Ausrichten' },
    { key: 'kapital',     titel: 'Kapital & Beteiligungen (Kernprozesse der Holding)' },
    { key: 'ueberwachen', titel: 'Überwachen & Absichern' },
    { key: 'services',    titel: 'Konzernservices' },
    { key: 'umsetzen',    titel: 'Umsetzung in den Gesellschaften' },
  ],
  kacheln: [
    { id: 'kg-strategie',  band: 'steuern', name: 'Strategie & Portfolio', unter: 'Vision, Leitbild, Zielmärkte, Standortstrategie' },
    { id: 'kg-regelwerk',  band: 'steuern', name: 'Konzernregelwerk', unter: 'Regelungen erstellen, freigeben, überwachen (RMS)' },
    { id: 'kg-planung',    band: 'steuern', name: 'Konzernplanung & Budget', unter: 'Planung, Forecast, Investitionsentscheidungen' },
    { id: 'kg-controlling',band: 'steuern', name: 'Konzern-Controlling', unter: 'Planungs- und Kontrollsysteme, Berichtswesen, KPI' },
    { id: 'kg-transform',  band: 'steuern', name: 'Transformation', unter: 'Programme, Change, Best-Practice-Transfer' },

    { id: 'kg-finanzierung', band: 'kapital', name: 'Finanzierung & Treasury', unter: 'Kapitalstruktur, Liquidität, Banken, Außenfinanzierung' },
    { id: 'kg-beteiligung',  band: 'kapital', name: 'Beteiligungsverwaltung', unter: 'Erwerb, Verwaltung, Portfolioanpassung' },
    { id: 'kg-ma',           band: 'kapital', name: 'M&A und Restrukturierung', unter: 'Transaktionen, Integration, Legal Claims' },
    { id: 'kg-ressourcen',   band: 'kapital', name: 'Ressourcenallokation', unter: 'Mittel und Kapazitäten zwischen den Gesellschaften' },

    { id: 'kg-compliance', band: 'ueberwachen', name: 'Compliance-Management', unter: 'Verhaltenskodex, Kartellrecht, Antikorruption' },
    { id: 'kg-iks',        band: 'ueberwachen', name: 'Risikofrüherkennung & IKS', unter: 'Risiken, Kontrollen, Krisenmanagement' },
    { id: 'kg-sicherheit', band: 'ueberwachen', name: 'Datenschutz & Informationssicherheit', unter: 'DSGVO, ISO 27001, NIS2' },
    { id: 'kg-export',     band: 'ueberwachen', name: 'Exportkontrolle', unter: 'Außenwirtschaft, Dual-Use, Sanktionslisten' },
    { id: 'kg-revision',   band: 'ueberwachen', name: 'Interne Revision', unter: 'Prüfungen und Nachverfolgung' },
    { id: 'kg-nachhalt',   band: 'ueberwachen', name: 'Nachhaltigkeit & Lieferkette', unter: 'LkSG, CSRD, Menschenrechte' },

    { id: 'kg-recht',    band: 'services', name: 'Recht & Vertragsmanagement', unter: 'Gesellschaftsrecht, Verträge, Governance' },
    { id: 'kg-personal', band: 'services', name: 'Personal & Führung', unter: 'Personalstrategie, Führungskräfte, Nachfolge' },
    { id: 'kg-it',       band: 'services', name: 'IT & Digitalisierung', unter: 'Infrastruktur, ERP, Reporting, KI' },
    { id: 'kg-einkauf',  band: 'services', name: 'Einkauf & Supply Management', unter: 'Lead Buyer, Energie, Lieferanten' },
    { id: 'kg-rewe',     band: 'services', name: 'Rechnungswesen & Steuern', unter: 'Konzernabschluss, Zahlungsverkehr, Steuerwesen' },
    { id: 'kg-wissen',   band: 'services', name: 'Wissen & Kommunikation', unter: 'Best Practices, interne und externe Kommunikation' },

    { id: 'kg-tagesgesch', band: 'umsetzen', name: 'Operative Geschäftsführung', unter: 'Tagesgeschäft der Gesellschaften' },
    { id: 'kg-ergebnis',   band: 'umsetzen', name: 'Ergebnisverantwortung', unter: 'Ergebnis- und Zielerreichung je Gesellschaft' },
    { id: 'kg-strategieum',band: 'umsetzen', name: 'Umsetzung der Konzernstrategie', unter: 'Vorgaben in den Werken wirksam machen' },
    { id: 'kg-bericht',    band: 'umsetzen', name: 'Berichtslinie an die Holding', unter: 'Kennzahlen, Abweichungen, Eskalation' },
  ],
};

/**
 * Die SAP-Landkarte: der Konzern als End-to-End-Prozesse.
 *
 * Die anderen Vorlagen beschreiben den Aufbau – wer wofür zuständig ist. SAP
 * beschreibt den Ablauf: eine Kette läuft quer durch die Abteilungen, vom
 * Auslöser bis zum Ergebnis. „Lead to Cash" beginnt beim Interessenten und
 * endet beim Zahlungseingang; unterwegs liegen Vertrieb, Planung, Gießerei,
 * Versand und Buchhaltung. Wer nur Bänder hat, sieht diese Kette nicht.
 *
 * Deshalb ist das hier die erste Vorlage mit Verweisen. Sie nutzt alle drei
 * Arten und zeigt damit, wofür sie da sind:
 *   ↳ Unterprozess – die vier SAP-Klammern über ihre Ketten
 *   → Danach folgt – die Kette selbst, Schritt für Schritt
 *   ⇢ Nutzt        – der Querbezug zwischen zwei Ketten (die Auftragserfassung
 *                    fragt die Produktionsplanung, die Rechnungsprüfung bucht
 *                    ins Hauptbuch)
 *
 * SAP als Leitfaden, nicht als Vorschrift: Die Kettennamen sind SAPs, die
 * Schritte sind die einer Gießereigruppe. Verweisziele stehen bewusst ohne
 * Werk – welches es ist, entscheidet erst lkVorlageAnwenden().
 */
const LK_SAP = {
  baender: [
    { key: 'klammer', titel: 'SAP-Klammer: die vier Kern-End-to-End-Prozesse' },
    { key: 'l2c',     titel: 'Lead to Cash – vom Interessenten zum Zahlungseingang' },
    { key: 's2p',     titel: 'Source to Pay – vom Bedarf zur bezahlten Rechnung' },
    { key: 'i2m',     titel: 'Idea to Market – von der Idee zum Serienteil' },
    { key: 'p2f',     titel: 'Plan to Fulfill – von der Planung zur Lieferung' },
    { key: 'a2d',     titel: 'Acquire to Decommission – von der Investition zur Stilllegung' },
    { key: 'hire',    titel: 'Recruit to Retire – von der Einstellung zum Austritt' },
    { key: 'fin',     titel: 'Record to Report – von der Buchung zum Abschluss' },
    { key: 'grc',     titel: 'Governance, Risk & Compliance – quer über allem' },
  ],
  kacheln: [
    /* ── Die Klammern. Jede zeigt als Unterprozess auf den Anfang ihrer Kette;
       von dort führt „Danach folgt" weiter bis zum Ende. ── */
    { id: 'sap-e2e-l2c', band: 'klammer', name: 'Lead to Cash',
      unter: 'Die Vertriebskette: Lead, Anfrage, Angebot, Auftrag, Lieferung, Faktura, Geldeingang',
      verweise: [{ ziel: 'sap-l2c-markt', art: 'unterprozess' }] },
    { id: 'sap-e2e-s2p', band: 'klammer', name: 'Source to Pay',
      unter: 'Die Beschaffungskette: Bedarf, Lieferant, Bestellung, Wareneingang, Rechnung, Zahlung',
      verweise: [{ ziel: 'sap-s2p-bedarf', art: 'unterprozess' }] },
    { id: 'sap-e2e-d2o', band: 'klammer', name: 'Design to Operate',
      unter: 'SAPs Klammer über Produktentstehung, Fertigung und Anlagen – drei Ketten unter einem Dach',
      verweise: [{ ziel: 'sap-i2m-idee', art: 'unterprozess' },
                 { ziel: 'sap-p2f-absatz', art: 'unterprozess' },
                 { ziel: 'sap-a2d-invest', art: 'unterprozess' }] },
    { id: 'sap-e2e-r2r', band: 'klammer', name: 'Recruit to Retire',
      unter: 'Die Personalkette: Bedarf, Einstellung, Verwaltung, Entwicklung, Entgelt, Austritt',
      verweise: [{ ziel: 'sap-hire-bedarf', art: 'unterprozess' }] },

    /* ── Lead to Cash ── */
    { id: 'sap-l2c-markt', band: 'l2c', name: 'Markt & Lead',
      unter: 'Marktbearbeitung, Zielkunden, Kundenentwicklung',
      verweise: [{ ziel: 'sap-l2c-anfrage', art: 'folgt' }] },
    { id: 'sap-l2c-anfrage', band: 'l2c', name: 'Anfrage & Machbarkeit',
      unter: 'Kundenanfrage aufnehmen, technische und kaufmännische Machbarkeit klären',
      verweise: [{ ziel: 'sap-l2c-angebot', art: 'folgt' }] },
    { id: 'sap-l2c-angebot', band: 'l2c', name: 'Angebot & Kalkulation',
      unter: 'Kalkulation, Angebot, Verhandlung',
      verweise: [{ ziel: 'sap-l2c-auftrag', art: 'folgt' },
                 { ziel: 'sap-i2m-entwicklung', art: 'nutzt' }] },
    { id: 'sap-l2c-auftrag', band: 'l2c', name: 'Auftragserfassung',
      unter: 'Kundenauftrag anlegen, Verfügbarkeit und Termin zusagen',
      verweise: [{ ziel: 'sap-l2c-lieferung', art: 'folgt' },
                 { ziel: 'sap-p2f-planung', art: 'nutzt' }] },
    { id: 'sap-l2c-lieferung', band: 'l2c', name: 'Lieferung',
      unter: 'Lieferschein, Kommissionierung, Warenausgang',
      verweise: [{ ziel: 'sap-l2c-faktura', art: 'folgt' },
                 { ziel: 'sap-p2f-versand', art: 'nutzt' }] },
    { id: 'sap-l2c-faktura', band: 'l2c', name: 'Faktura',
      unter: 'Rechnungsstellung, Gutschriften, Preisfindung',
      verweise: [{ ziel: 'sap-l2c-zahlung', art: 'folgt' }] },
    { id: 'sap-l2c-zahlung', band: 'l2c', name: 'Zahlungseingang & Forderungen',
      unter: 'Debitoren, Mahnwesen, Kreditlimit',
      verweise: [{ ziel: 'sap-fin-hauptbuch', art: 'nutzt' }] },

    /* ── Source to Pay ── */
    { id: 'sap-s2p-bedarf', band: 's2p', name: 'Bedarfsanforderung',
      unter: 'Bedarf melden und genehmigen (BANF)',
      verweise: [{ ziel: 'sap-s2p-quelle', art: 'folgt' }] },
    { id: 'sap-s2p-quelle', band: 's2p', name: 'Lieferantenauswahl',
      unter: 'Anfrage, Angebotsvergleich, Rahmenvertrag, Lead-Buyer',
      verweise: [{ ziel: 'sap-s2p-bestellung', art: 'folgt' },
                 { ziel: 'sap-grc-lieferkette', art: 'nutzt' }] },
    { id: 'sap-s2p-bestellung', band: 's2p', name: 'Bestellung',
      unter: 'Bestellung anlegen, freigeben, überwachen',
      verweise: [{ ziel: 'sap-s2p-wareneingang', art: 'folgt' },
                 { ziel: 'sap-grc-berechtigung', art: 'nutzt' }] },
    { id: 'sap-s2p-wareneingang', band: 's2p', name: 'Wareneingang & Prüfung',
      unter: 'Ware annehmen, Qualität prüfen, einlagern',
      verweise: [{ ziel: 'sap-s2p-rechnung', art: 'folgt' },
                 { ziel: 'sap-p2f-lager', art: 'nutzt' }] },
    { id: 'sap-s2p-rechnung', band: 's2p', name: 'Rechnungsprüfung',
      unter: 'Eingangsrechnung prüfen, dreiseitiger Abgleich, E-Rechnung',
      verweise: [{ ziel: 'sap-s2p-zahlung', art: 'folgt' }] },
    { id: 'sap-s2p-zahlung', band: 's2p', name: 'Zahlungslauf',
      unter: 'Kreditoren, Zahlungsvorschlag, Skonto',
      verweise: [{ ziel: 'sap-fin-hauptbuch', art: 'nutzt' }] },

    /* ── Idea to Market ── */
    { id: 'sap-i2m-idee', band: 'i2m', name: 'Idee & Anforderung',
      unter: 'Kundenanforderung, Markttrend, Machbarkeitsbewertung',
      verweise: [{ ziel: 'sap-i2m-entwicklung', art: 'folgt' }] },
    { id: 'sap-i2m-entwicklung', band: 'i2m', name: 'Produktentwicklung',
      unter: 'Konstruktion, Werkstoffauswahl, Gießsimulation, Prozessentwicklung',
      verweise: [{ ziel: 'sap-i2m-muster', art: 'folgt' }] },
    { id: 'sap-i2m-muster', band: 'i2m', name: 'Bemusterung & Freigabe',
      unter: 'Erstmuster, EMPB/PPAP, Kundenfreigabe',
      verweise: [{ ziel: 'sap-i2m-serie', art: 'folgt' }] },
    { id: 'sap-i2m-serie', band: 'i2m', name: 'Serienüberleitung',
      unter: 'Stückliste, Arbeitsplan, Stammdaten im ERP anlegen',
      verweise: [{ ziel: 'sap-p2f-planung', art: 'folgt' }] },

    /* ── Plan to Fulfill ── */
    { id: 'sap-p2f-absatz', band: 'p2f', name: 'Absatz- & Grobplanung',
      unter: 'Absatzplan, Kapazitätsabgleich, S&OP',
      verweise: [{ ziel: 'sap-p2f-planung', art: 'folgt' }] },
    { id: 'sap-p2f-planung', band: 'p2f', name: 'Produktionsplanung',
      unter: 'Termin-, Kapazitäts- und Feinplanung',
      verweise: [{ ziel: 'sap-p2f-material', art: 'folgt' }] },
    { id: 'sap-p2f-material', band: 'p2f', name: 'Materialdisposition',
      unter: 'Bedarfsermittlung, Losgrößen, Sicherheitsbestand',
      verweise: [{ ziel: 'sap-p2f-fertigung', art: 'folgt' },
                 { ziel: 'sap-s2p-bedarf', art: 'nutzt' }] },
    { id: 'sap-p2f-fertigung', band: 'p2f', name: 'Fertigung',
      unter: 'Modell, Kerne, Formen, Schmelzen & Gießen, Putzen, Wärmebehandlung, Bearbeitung',
      verweise: [{ ziel: 'sap-p2f-qs', art: 'folgt' },
                 { ziel: 'sap-a2d-instand', art: 'nutzt' }] },
    { id: 'sap-p2f-qs', band: 'p2f', name: 'Qualitätsprüfung',
      unter: 'Prüfplan, Prüflos, Sperrbestand, Reklamation und 8D',
      verweise: [{ ziel: 'sap-p2f-lager', art: 'folgt' },
                 { ziel: 'sap-i2m-muster', art: 'nutzt' }] },
    { id: 'sap-p2f-lager', band: 'p2f', name: 'Bestandsführung',
      unter: 'Lager, Chargen, Inventur',
      verweise: [{ ziel: 'sap-p2f-versand', art: 'folgt' }] },
    { id: 'sap-p2f-versand', band: 'p2f', name: 'Versand & Transport',
      unter: 'Transportdisposition, Verpackung, Ausfuhr',
      verweise: [{ ziel: 'sap-fin-kosten', art: 'nutzt' }] },

    /* ── Acquire to Decommission ── */
    { id: 'sap-a2d-invest', band: 'a2d', name: 'Investitionsantrag',
      unter: 'Bedarf, Wirtschaftlichkeit, Genehmigung',
      verweise: [{ ziel: 'sap-a2d-beschaffung', art: 'folgt' },
                 { ziel: 'sap-fin-planung', art: 'nutzt' }] },
    { id: 'sap-a2d-beschaffung', band: 'a2d', name: 'Anlagenbeschaffung & Projekt',
      unter: 'Vergabe, Projektabwicklung, Montage',
      verweise: [{ ziel: 'sap-a2d-inbetrieb', art: 'folgt' },
                 { ziel: 'sap-s2p-bestellung', art: 'nutzt' }] },
    { id: 'sap-a2d-inbetrieb', band: 'a2d', name: 'Inbetriebnahme',
      unter: 'Abnahme, Anlagenstammdaten, Aktivierung',
      verweise: [{ ziel: 'sap-a2d-instand', art: 'folgt' },
                 { ziel: 'sap-fin-anlagen', art: 'nutzt' }] },
    { id: 'sap-a2d-instand', band: 'a2d', name: 'Instandhaltung',
      unter: 'Wartungsplan, Störung, Ersatzteile, Instandhaltungsauftrag',
      verweise: [{ ziel: 'sap-a2d-still', art: 'folgt' }] },
    { id: 'sap-a2d-still', band: 'a2d', name: 'Stilllegung & Verwertung',
      unter: 'Außerbetriebnahme, Verkauf, Verschrottung, Abgang',
      verweise: [{ ziel: 'sap-fin-anlagen', art: 'nutzt' }] },

    /* ── Recruit to Retire ── */
    { id: 'sap-hire-bedarf', band: 'hire', name: 'Personalbedarf & Recruiting',
      unter: 'Bedarf, Ausschreibung, Auswahl',
      verweise: [{ ziel: 'sap-hire-eintritt', art: 'folgt' }] },
    { id: 'sap-hire-eintritt', band: 'hire', name: 'Einstellung & Onboarding',
      unter: 'Vertrag, Ersteinweisung, Arbeitsmittel, Zugänge',
      verweise: [{ ziel: 'sap-hire-verwaltung', art: 'folgt' },
                 { ziel: 'sap-grc-schulung', art: 'nutzt' }] },
    { id: 'sap-hire-verwaltung', band: 'hire', name: 'Personaladministration & Zeitwirtschaft',
      unter: 'Stammdaten, Zeiterfassung, Schichtmodelle, Abwesenheiten',
      verweise: [{ ziel: 'sap-hire-entwicklung', art: 'folgt' }] },
    { id: 'sap-hire-entwicklung', band: 'hire', name: 'Qualifizierung & Entwicklung',
      unter: 'Ausbildung, Weiterbildung, Qualifikationsmatrix, Nachfolge',
      verweise: [{ ziel: 'sap-hire-entgelt', art: 'folgt' }] },
    { id: 'sap-hire-entgelt', band: 'hire', name: 'Entgeltabrechnung',
      unter: 'Payroll, Zuschläge, Meldungen',
      verweise: [{ ziel: 'sap-hire-austritt', art: 'folgt' },
                 { ziel: 'sap-fin-hauptbuch', art: 'nutzt' }] },
    { id: 'sap-hire-austritt', band: 'hire', name: 'Austritt & Offboarding',
      unter: 'Kündigung, Zeugnis, Rückgabe, Zugänge sperren',
      verweise: [{ ziel: 'sap-grc-berechtigung', art: 'nutzt' }] },

    /* ── Record to Report ── */
    { id: 'sap-fin-hauptbuch', band: 'fin', name: 'Hauptbuch & Nebenbücher',
      unter: 'Belege, Kreditoren, Debitoren, Bank',
      verweise: [{ ziel: 'sap-fin-kosten', art: 'folgt' }] },
    { id: 'sap-fin-anlagen', band: 'fin', name: 'Anlagenbuchhaltung',
      unter: 'Aktivierung, Abschreibung, Abgang',
      verweise: [{ ziel: 'sap-fin-hauptbuch', art: 'folgt' }] },
    { id: 'sap-fin-kosten', band: 'fin', name: 'Kosten- & Ergebnisrechnung',
      unter: 'Kostenstellen, Kalkulation, Deckungsbeitrag je Guss',
      verweise: [{ ziel: 'sap-fin-abschluss', art: 'folgt' }] },
    { id: 'sap-fin-abschluss', band: 'fin', name: 'Abschluss',
      unter: 'Monats-, Jahres- und Konzernabschluss, Konsolidierung',
      verweise: [{ ziel: 'sap-fin-reporting', art: 'folgt' },
                 { ziel: 'sap-fin-steuern', art: 'folgt' }] },
    { id: 'sap-fin-steuern', band: 'fin', name: 'Steuern',
      unter: 'Umsatzsteuer, Ertragsteuern, Verrechnungspreise',
      verweise: [] },
    { id: 'sap-fin-reporting', band: 'fin', name: 'Reporting & Kennzahlen',
      unter: 'Management-Reporting, KPI, Power BI',
      verweise: [{ ziel: 'sap-fin-planung', art: 'folgt' }] },
    { id: 'sap-fin-planung', band: 'fin', name: 'Planung & Forecast',
      unter: 'Budget, Forecast, Investitionscontrolling',
      verweise: [] },

    /* ── Governance, Risk & Compliance – quer über allem ── */
    { id: 'sap-grc-regelwerk', band: 'grc', name: 'Regelwerke & Richtlinien',
      unter: 'Konzernregelungen erstellen, prüfen, freigeben (RMS)',
      verweise: [{ ziel: 'sap-grc-schulung', art: 'folgt' }] },
    { id: 'sap-grc-schulung', band: 'grc', name: 'Unterweisung & Kenntnisnahme',
      unter: 'Bekanntgabe, Kenntnisnahme, Wissenstest',
      verweise: [] },
    { id: 'sap-grc-risiko', band: 'grc', name: 'Risikomanagement & IKS',
      unter: 'Risiken erfassen, bewerten, Kontrollen wirksam halten',
      verweise: [{ ziel: 'sap-grc-audit', art: 'folgt' }] },
    { id: 'sap-grc-audit', band: 'grc', name: 'Audits & Zertifizierung',
      unter: 'IATF 16949, ISO 9001/14001/50001, ISO 27001, Kundenaudits',
      verweise: [] },
    { id: 'sap-grc-berechtigung', band: 'grc', name: 'Berechtigungen & Zugriffe',
      unter: 'Rollen, Freigabegrenzen, Funktionstrennung (SoD)',
      verweise: [{ ziel: 'sap-grc-risiko', art: 'nutzt' }] },
    { id: 'sap-grc-lieferkette', band: 'grc', name: 'Lieferkette & Nachhaltigkeit',
      unter: 'LkSG, CSRD, Konfliktmineralien, CO₂-Bilanz',
      verweise: [{ ziel: 'sap-grc-risiko', art: 'nutzt' }] },
  ],
};

/* Fertige Landschaften zum Übernehmen. Niemand baut eine Landkarte gern von
   null – und zwei Ebenen brauchen ohnehin verschiedene Landschaften. */
const LK_VORLAGEN = [
  { key: 'konzern', titel: 'Konzern / Holding',
    zweck: 'Sechs Prozessbereiche einer Führungsholding: Strategie, Finanzen, Risiko & Compliance, Synergien, Kommunikation, Transformation – mit je drei Hauptaufgaben.',
    karte: LK_KONZERN },
  { key: 'gesellschaft', titel: 'Produzierende Gesellschaft',
    zweck: 'Führungs-, Kern- und Unterstützungsprozesse eines Werks – die abgestimmte Landschaft mit Vertrieb, Produktion und Auftragsabwicklung.',
    karte: LK_START },
  { key: 'konzernkarte', titel: 'Konzern-Prozesslandkarte (abgestimmt)',
    zweck: 'Die abgestimmte Landkarte des Konzerns: Führung, Kernprozesse und Unterstützungsprozesse mit allen Teilprozessen je Kachel – von der Strategie bis zum Schmelzen und Gießen.',
    karte: LK_KONZERNKARTE },
  { key: 'holding', titel: 'Holdinggesellschaft (Aufbau)',
    zweck: 'Der Aufbau einer Holding nach der Skizze der Geschäftsführung: Strategie, Finanzierung, Konzern-Controlling, Personal, Beteiligungsverwaltung, Beratung, Überwachung – und das operative Geschäft der Töchter.',
    karte: LK_HOLDING },
  { key: 'konzern-gesamt', titel: 'Führungsholding – Gesamtbild',
    zweck: 'Aus den drei Vorlagen zusammengeführt: die Form der Prozesslandkarte, gefüllt mit dem, was eine Holding tut – Steuern, Kapital & Beteiligungen als Kernprozesse, Überwachen, Konzernservices und die Umsetzung in den Gesellschaften.',
    karte: LK_KONZERN_GESAMT },
  { key: 'sap', titel: 'SAP End-to-End-Prozesse',
    zweck: 'Der Konzern als Ablauf statt als Aufbau: Lead to Cash, Source to Pay, Design to Operate und Recruit to Retire – mit den Ketten quer durch Vertrieb, Gießerei, Einkauf und Buchhaltung. Die einzige Vorlage, die schon verknüpft ist: Klammern als Unterprozesse, Ketten als „Danach folgt", Übergänge als „Nutzt".',
    karte: LK_SAP },
];

function lkStartbestand() {
  return { version: 2, karten: { [LK_START_WERK]: JSON.parse(JSON.stringify(LK_START)) }, historie: [] };
}

/** Leere Karte für ein Werk, das noch keine hat. */
function lkLeereKarte() {
  return { baender: JSON.parse(JSON.stringify(LK_START.baender)), kacheln: [] };
}

/** Karte eines Werks (legt sie im Arbeitsstand an, wenn sie fehlt). */
function lkKarte(werk) {
  const w = werk || _lkWerk;
  if (!_lkDaten) return lkLeereKarte();
  if (!_lkDaten.karten || typeof _lkDaten.karten !== 'object') _lkDaten.karten = {};
  if (!_lkDaten.karten[w]) _lkDaten.karten[w] = lkLeereKarte();
  return _lkDaten.karten[w];
}

/** Welche Werke haben schon eine Karte mit Inhalt? */
function lkWerkeMitKarte() {
  const k = (_lkDaten && _lkDaten.karten) || {};
  // Wie in lkAlleKacheln(): gekürzt wird nur, wenn die Trennung wirklich greift.
  // Sonst fiele eine Karte weg, deren Werk nicht mehr in STANDORTE steht.
  const sichtbar = (typeof trennungGreift === 'function' && trennungGreift()) ? lkWerkeSichtbar() : null;
  return Object.keys(k)
    .filter(w => !sichtbar || sichtbar.includes(w))
    .filter(w => Array.isArray(k[w].kacheln) && k[w].kacheln.length);
}

function lkBaender()    { const k = lkKarte(); return (Array.isArray(k.baender) && k.baender.length) ? k.baender : LK_START.baender; }
function lkKacheln()    { const k = lkKarte(); return Array.isArray(k.kacheln) ? k.kacheln : []; }
/** Alle Kacheln aller Werke – für die Mindmap, die über die Werke hinweg schaut. */
function lkAlleKacheln() {
  const karten = (_lkDaten && _lkDaten.karten) || {};
  // Hier greift die Trennung nach Gesellschaft – an der einen Stelle, aus der
  // Mindmap, Suche und die Auflösung von Verweisen schöpfen. Eine Kachel eines
  // fremden Werks ist damit überall unauffindbar, und ein Verweis darauf fällt
  // weg wie ein totes Ziel. Gespeichert bleibt sie trotzdem: _lkDaten ist
  // vollständig, nur die Sicht darauf nicht.
  // Nur wenn die Trennung wirklich greift, wird gekürzt. Sonst bliebe eine Karte
  // unsichtbar, deren Werk gar nicht mehr in STANDORTE steht – die gibt es, wenn
  // ein Kürzel wegfällt, und ihre Prozesse wären dann spurlos weg.
  const sichtbar = (typeof trennungGreift === 'function' && trennungGreift()) ? lkWerkeSichtbar() : null;
  const out = [];
  Object.keys(karten).filter(w => !sichtbar || sichtbar.includes(w)).forEach(w => {
    (Array.isArray(karten[w].kacheln) ? karten[w].kacheln : []).forEach(k => out.push({ werk: w, kachel: k }));
  });
  return out;
}

/** Bänder einer bestimmten Karte (die Mindmap braucht sie je Werk). */
function lkBaenderVon(werk) {
  const k = (_lkDaten && _lkDaten.karten && _lkDaten.karten[werk]) || null;
  return (k && Array.isArray(k.baender) && k.baender.length) ? k.baender : LK_START.baender;
}

/** Darf die Karte bearbeitet werden? Wer den Reiter schreiben darf, darf es. */
function lkDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('prozesse'); }

/** Gilt die Kachel am gewählten Standort? Ohne Filter gilt alles. */
function lkGiltDort(k, standort) {
  if (!standort) return true;
  const g = Array.isArray(k.geltung) ? k.geltung : [];
  if (!g.length || g.includes('ALLE')) return true;   // ungepflegt = konzernweit
  return g.includes(standort);
}

/**
 * Verweise einer Kachel auf ihre BPMN-Modelle. Ein Prozess besteht oft aus
 * mehreren Abläufen – Angebot, Auftrag, Reklamation gehören alle zum Vertrieb.
 * Frühere Fassungen kannten nur einen; deren Felder werden hier mitgelesen.
 */
function lkModellVerweise(k) {
  if (Array.isArray(k.prozesse)) return k.prozesse;
  if (k.prozessId || k.prozessName) return [{ id: k.prozessId || '', name: k.prozessName || '' }];
  return [];
}

/**
 * Ein Verweis → Modell aus der geladenen Prozessliste (Kennung zuerst, sonst Name).
 * Der Name allein ist nicht mehr eindeutig, seit jedes Werk seinen eigenen Ordner
 * hat: „Vertrieb" gibt es in HOL und in SHB. Deshalb zählt bei der Namenssuche
 * zuerst der Ordner des eigenen Werks.
 */
function lkModellZu(verweis, werk) {
  const alle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  if (verweis && verweis.id) {
    const t = alle.find(p => p.itemId === verweis.id);
    if (t) return t;
  }
  const n = String((verweis && verweis.name) || '').trim().toLowerCase();
  if (!n) return null;
  const passt = (p) => (p.title || '').trim().toLowerCase() === n;
  const w = String(werk || '').trim();
  return (w && alle.find(p => passt(p) && (p.ordner || '') === w)) || alle.find(passt) || null;
}

/** Alle aufgelösten Modelle einer Kachel (Verweise ins Leere fallen weg). */
function lkProzesseVon(k, werk) {
  const w = werk || _lkWerk;
  return lkModellVerweise(k).map(v => lkModellZu(v, w)).filter(Boolean);
}

/** Das erste Modell – für Anzeigen, die nur eines brauchen. */
function lkProzessVon(k, werk) { return lkProzesseVon(k, werk)[0] || null; }

/** Direkt an der Kachel hängende Regelwerke (ohne Umweg über ein Modell). */
function lkRegelwerkeVon(k) {
  const ids = Array.isArray(k.regelwerke) ? k.regelwerke.map(String) : [];
  if (!ids.length) return [];
  const alle = (typeof State !== 'undefined' && Array.isArray(State.policies)) ? State.policies : [];
  return ids.map(id => alle.find(p => String(p.id) === id)).filter(Boolean);
}

/* ── Laden und Speichern ─────────────────────────────────────────────── */

async function lkDatenLaden() {
  if (_lkGeladen) return _lkDaten;
  try {
    const gespeichert = (typeof spLoadLandkarte === 'function') ? await spLoadLandkarte() : null;
    if (gespeichert && gespeichert.daten) {
      const d = gespeichert.daten;
      if (d.karten && typeof d.karten === 'object') {
        _lkDaten = { version: 2, karten: d.karten, historie: Array.isArray(d.historie) ? d.historie : [] };
      } else {
        // Fassung 1 kannte nur EINE Landkarte. Die abgestimmte Landschaft gehört
        // zu HOL – dorthin wandert sie, ohne dass jemand etwas neu erfassen muss.
        _lkDaten = {
          version: 2,
          karten: { [LK_START_WERK]: {
            baender:    (Array.isArray(d.baender) && d.baender.length) ? d.baender : JSON.parse(JSON.stringify(LK_START.baender)),
            kacheln:    Array.isArray(d.kacheln) ? d.kacheln : JSON.parse(JSON.stringify(LK_START.kacheln)),
          } },
          historie: Array.isArray(d.historie) ? d.historie : [],
        };
      }
      _lkGeaendertAm = gespeichert.geaendertAm || '';
    } else {
      _lkDaten = lkStartbestand();
      _lkGeaendertAm = '';
    }
  } catch (e) {
    console.warn('[landkarte] Laden fehlgeschlagen, Startbestand gilt:', e.message);
    _lkDaten = lkStartbestand();
  }
  // Auf ein Werk stellen, das auch etwas zeigt – und das man sehen darf.
  lkWerkAbsichern();
  const belegt = lkWerkeMitKarte();
  if (belegt.length && !belegt.includes(_lkWerk)) _lkWerk = belegt[0];
  _lkGeladen = true;
  return _lkDaten;
}

/** Eintrag in den Versionsverlauf (wer, wann, was). */
function _lkVerlauf(was) {
  if (!_lkDaten) return;
  if (!Array.isArray(_lkDaten.historie)) _lkDaten.historie = [];
  const u = (typeof State !== 'undefined' && State.user) ? State.user : {};
  _lkDaten.historie.push({ datum: new Date().toISOString(), name: u.name || u.upn || '', werk: _lkWerk, was });
  if (_lkDaten.historie.length > 100) _lkDaten.historie = _lkDaten.historie.slice(-100);
}

/**
 * Speichern mit Gleichzeitigkeits-Prüfung: Hat jemand anders die Karte
 * inzwischen geändert, wird nichts überschrieben.
 */
async function lkSpeichern(meldung, was) {
  if (!lkDarfSchreiben()) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return false; }
  try {
    if (typeof spLandkarteMeta === 'function') {
      const jetzt = await spLandkarteMeta();
      if (jetzt && _lkGeaendertAm && jetzt !== _lkGeaendertAm) {
        toast('Die Landkarte wurde zwischenzeitlich von jemand anderem geändert – bitte neu laden.', 'error');
        return false;
      }
    }
    if (was) _lkVerlauf(was);
    _lkGeaendertAm = await spSaveLandkarte(_lkDaten);
    if (meldung) toast(meldung, 'success');
    _lkNachSpeichern();
    return true;
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
    return false;
  }
}

/**
 * Nach dem Speichern dorthin zurück, wo gearbeitet wurde. Gespeichert wird
 * inzwischen aus drei Ansichten – wer aus der Mindmap heraus einen Prozess
 * anlegt, will nicht plötzlich in der Landkarte stehen.
 */
function _lkNachSpeichern() {
  const modus = (typeof _prozModus !== 'undefined') ? _prozModus : 'karte';
  if (modus === 'netz' && typeof vkNachLandkarte === 'function') { vkNachLandkarte(); return; }
  if (modus === 'matrix' && typeof renderProzessMatrix === 'function') { renderProzessMatrix(); return; }
  renderLandkarte();
}

/* ── Ansicht ─────────────────────────────────────────────────────────── */

async function initLandkarte() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  if (!_lkGeladen) {
    mount.innerHTML = '<div class="doc-loading">Lade Prozesslandkarte …</div>';
    await lkDatenLaden();
  }
  renderLandkarte();
}

function renderLandkarte() {
  lkWerkAbsichern();   // vor dem Mount-Check: gilt auch, wenn gerade nichts gezeichnet wird
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const schreiben = lkDarfSchreiben();
  const kacheln = lkKacheln();
  const mitModell = kacheln.filter(k => lkProzessVon(k)).length;
  const stand = (_lkDaten && Array.isArray(_lkDaten.historie) && _lkDaten.historie.length)
    ? _lkDaten.historie[_lkDaten.historie.length - 1] : null;

  const standorte = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];
  const belegt = lkWerkeMitKarte();
  mount.innerHTML = `
    ${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('karte') : ''}
    <div class="view-desc" style="margin:0 0 12px">
      Die Prozesslandschaft von <b>${esc(lkWerkLabel(_lkWerk))}</b> – Konzern und Gesellschaften führen je eine eigene.
      Ein Klick auf eine Kachel zeigt Geltungsbereich, das hinterlegte <b>BPMN-Modell</b> und die
      daran hängenden Regelwerke. <b>${mitModell}</b> von <b>${kacheln.length}</b> Prozessen sind modelliert.
    </div>
    <div class="view-toolbar">
      <label class="field-hint" style="margin:0 6px 0 0">Landkarte</label>
      <select id="lk-werk" onchange="lkSetWerk(this.value)" style="max-width:210px">
        ${lkWerkeSichtbar().map(w => `<option value="${esc(w)}"${_lkWerk === w ? ' selected' : ''}>${esc(lkWerkLabel(w))}${
          belegt.includes(w) ? '' : ' – leer'}</option>`).join('')}
      </select>
      <label class="field-hint" style="margin:0 6px 0 14px">gilt für</label>
      <select id="lk-filter" onchange="lkSetFilter(this.value)" style="max-width:160px">
        <option value="">alle</option>
        ${standorte.map(s => `<option value="${esc(s)}"${_lkFilter === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <div class="search-box" style="margin-left:14px;max-width:230px">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input type="text" id="lk-suche" value="${esc(_lkSuche)}" aria-label="Prozess in allen Landkarten suchen"
          placeholder="In allen Werken suchen …" oninput="lkSuchen(this.value)">
      </div>
      <div class="toolbar-spacer"></div>
      ${stand ? `<button class="btn btn-ghost btn-sm" onclick="lkVerlaufZeigen()" title="Versionsverlauf">
        🕘 ${esc(stand.name || '–')}${stand.datum && typeof fmtDate === 'function' ? ' · ' + esc(fmtDate(stand.datum)) : ''}</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="lkNeuLaden()" title="Aktualisieren">↻ Aktualisieren</button>
      ${schreiben ? `<button class="btn btn-outline btn-sm" onclick="lkVorlageDialog()" title="Fertige Prozesslandschaft einsetzen">📋 Vorlage</button>` : ''}
      ${schreiben ? `<button class="btn btn-outline btn-sm" onclick="lkKachelNeu()">+ Prozess</button>` : ''}
    </div>
    ${_lkTrefferHtml()}
    ${_lkFilter ? `<div class="field-hint" style="margin:0 0 10px">Prozesse, die am Standort <b>${esc(_lkFilter)}</b>
      nicht gelten, sind ausgegraut – die Landschaft bleibt dadurch vergleichbar.</div>` : ''}
    ${kacheln.length ? _lkKarteHtml(schreiben) : _lkLeerHtml(schreiben, belegt)}
    <div class="lk-legende">
      <span><i class="lk-punkt lk-punkt-modell"></i> Modell hinterlegt</span>
      <span><i class="lk-punkt lk-punkt-offen"></i> noch kein Modell</span>
      ${schreiben ? '<span>Kacheln lassen sich zwischen den Bändern ziehen.</span>' : ''}
    </div>`;
}

function _lkBandTitel(key) {
  const b = lkBaender().find(x => x.key === key);
  return b ? b.titel : key;
}

/** Führungs- bzw. Unterstützungsband: Balken + Reihe von Kacheln. */
/**
 * Die Karte: je Band eine Zeile mit Titelspalte links.
 *
 * Früher standen hier drei fest verdrahtete Bänder (Führung · Kern ·
 * Unterstützung). Die Konzernebene hat aber sechs Bereiche, ein anderes Werk
 * vielleicht vier – die Datei kannte die Bänder längst als Liste, nur die
 * Ansicht nicht.
 */
function _lkKarteHtml(schreiben) {
  return `<div class="lk-karte">
      ${lkBaender().map((b, i) => _lkZeileHtml(b, i, schreiben)).join('')}
    </div>`;
}

function _lkLeeresBand() {
  return '<div class="field-hint" style="padding:14px">Noch kein Prozess in diesem Bereich.</div>';
}

/** Eine Bandzeile. „Kern" behält seine Form: die Prozesse als Pfeile. */
function _lkZeileHtml(band, nr, schreiben) {
  const alle = lkKacheln();
  const idx = alle.map((k, i) => ({ k, i })).filter(x => x.k.band === band.key);
  const farbe = LK_FARBEN[nr % LK_FARBEN.length];
  const titel = `<div class="lk-zeile-titel"><span>${esc(band.titel)}</span><i>${idx.length} ${
    idx.length === 1 ? 'Prozess' : 'Prozesse'}</i></div>`;
  if (band.key === 'kern') {
    return `<div class="lk-zeile lk-zeile-kern" style="--lk-c:${farbe}">
        ${titel}
        <div class="lk-kern-pfeile" ondragover="lkZiehUeber(event)" ondrop="lkZiehAblegen(event,'kern',-1)">
          ${idx.length ? idx.map(x => _lkPfeilHtml(x.k, x.i, schreiben)).join('') : _lkLeeresBand()}
        </div>
      </div>`;
  }
  // Höchstens fünf Kacheln nebeneinander – neun in einer Zeile wären Streifen.
  const spalten = Math.min(Math.max(1, idx.length), 5);
  return `<div class="lk-zeile" style="--lk-c:${farbe}">
      ${titel}
      <div class="lk-reihe" style="grid-template-columns:repeat(${spalten},minmax(0,1fr))"
        ondragover="lkZiehUeber(event)" ondrop="lkZiehAblegen(event,'${esc(band.key)}',-1)">
        ${idx.length ? idx.map(x => _lkKachelHtml(x.k, x.i, band.key, schreiben)).join('') : _lkLeeresBand()}
      </div>
    </div>`;
}

function _lkStatusPunkt(k) {
  const n = lkProzesseVon(k).length;
  const r = (Array.isArray(k.regelwerke) ? k.regelwerke.length : 0);
  const titel = [n ? `${n} Modell${n > 1 ? 'e' : ''}` : 'noch kein Modell',
    r ? `${r} Regelwerk${r > 1 ? 'e' : ''}` : ''].filter(Boolean).join(' · ');
  return `<i class="lk-punkt ${n ? 'lk-punkt-modell' : 'lk-punkt-offen'}" title="${esc(titel)}"></i>${
    n > 1 ? `<span class="lk-zahl-punkt" title="${esc(titel)}">${n}</span>` : ''}`;
}

function _lkGeltungKurz(k) {
  const g = Array.isArray(k.geltung) ? k.geltung : [];
  if (!g.length || g.includes('ALLE')) return '';
  return g.join(', ');
}

function _lkZiehAttr(i, schreiben) {
  return schreiben
    ? ` draggable="true" ondragstart="lkZiehStart(event,${i})" ondragend="lkZiehEnde()" ondragover="lkZiehUeber(event)" ondrop="lkZiehAblegen(event,'',${i})"`
    : '';
}

/** Mit Enter und Leertaste bedienbar – die Kacheln sind Schaltflächen, keine Bilder. */
function _lkTastatur(id) {
  return ` role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();lkKachelOeffnen('${esc(id)}')}"`;
}

function _lkKachelHtml(k, i, band, schreiben) {
  const aus = !lkGiltDort(k, _lkFilter);
  const g = _lkGeltungKurz(k);
  const person = (typeof lkVerantwortlich === 'function') ? lkVerantwortlich(k) : '';
  return `<div class="lk-kachel${aus ? ' lk-aus' : ''}"${_lkZiehAttr(i, schreiben)}${_lkTastatur(k.id)}
      onclick="lkKachelOeffnen('${esc(k.id)}')" aria-label="${esc(k.name + (k.unter ? ' – ' + k.unter : ''))}" title="${esc(k.name)}">
      <div class="lk-kachel-inhalt">
        <div class="lk-kachel-kopf"><span>${esc(k.name)}</span>${_lkStatusPunkt(k)}</div>
        ${k.unter ? `<div class="lk-kachel-unter">${esc(k.unter)}</div>` : ''}
        <div class="lk-kachel-fuss">
          ${person ? `<span class="lk-kachel-person" title="${esc(person)}">👤 ${esc(
            (typeof lkPersonName === 'function' ? lkPersonName(person) : person).split(' ')[0])}</span>` : ''}
          ${g ? `<span class="lk-kachel-geltung">${esc(g)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function _lkPfeilHtml(k, i, schreiben) {
  const aus = !lkGiltDort(k, _lkFilter);
  const g = _lkGeltungKurz(k);
  return `<div class="lk-pfeil${aus ? ' lk-aus' : ''}"${_lkZiehAttr(i, schreiben)}${_lkTastatur(k.id)}
      onclick="lkKachelOeffnen('${esc(k.id)}')" aria-label="${esc(k.name + (k.unter ? ' – ' + k.unter : ''))}" title="${esc(k.name)}">
      ${_lkStatusPunkt(k)}<b>${esc(k.name)}</b>
      ${k.unter ? `<span class="lk-pfeil-unter">${esc(k.unter)}</span>` : ''}
      ${g ? `<span class="lk-pfeil-geltung">${esc(g)}</span>` : ''}
    </div>`;
}

/** Für ein Werk gibt es noch keine Karte: anlegen oder von einem anderen übernehmen. */
function _lkLeerHtml(schreiben, belegt) {
  const quellen = belegt.filter(w => w !== _lkWerk);
  return `<div class="lk-karte" style="text-align:center;padding:44px 20px">
      <div style="font-size:2rem;margin-bottom:8px">🗺</div>
      <div style="font-weight:700;margin-bottom:6px">Für ${esc(lkWerkLabel(_lkWerk))} gibt es noch keine Landkarte.</div>
      <div class="field-hint" style="max-width:560px;margin:0 auto 16px">
        Konzern und Gesellschaften führen je eine eigene Landschaft. Am schnellsten geht es mit einer
        <b>Vorlage</b> – für die Konzernebene die sechs Bereiche einer Führungsholding, für eine
        Gesellschaft die Führungs-, Kern- und Unterstützungsprozesse. Alles bleibt danach änderbar.
      </div>
      ${schreiben ? `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="lkVorlageDialog()">📋 Vorlage verwenden</button>
        <button class="btn btn-outline btn-sm" onclick="lkKachelNeu()">+ Erster Prozess</button>
        ${quellen.length ? `<button class="btn btn-ghost btn-sm" onclick="lkUebernehmenDialog()">Von einer anderen Ebene übernehmen</button>` : ''}
      </div>` : '<div class="field-hint">Für das Anlegen fehlt Ihnen das Schreibrecht auf „Prozesse".</div>'}
    </div>`;
}

/** Landkarte wechseln. */
function lkSetWerk(w) {
  lkWerkSetzenStill(w);
  renderLandkarte();
}

/** Werk wechseln, ohne die Ansicht zu wechseln – etwa aus der Mindmap heraus. */
function lkWerkSetzenStill(w) {
  _lkWerk = lkWerkeSichtbar().includes(w) ? w : _lkWerk;
}

/**
 * Eine fertige Landschaft übernehmen. Niemand baut eine Landkarte gern von
 * null, und die Ebenen brauchen verschiedene: Der Konzern steuert, die
 * Gesellschaft produziert.
 */
function lkVorlageDialog() {
  if (!lkDarfSchreiben()) return;
  const vorhanden = lkKacheln().length;
  const vorgabe = (_lkWerk === 'KONZERN' || _lkWerk === 'HOL') ? 'konzern' : 'gesellschaft';
  openModal(`
    <div class="modal-header"><h3>Vorlage verwenden</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 12px">Für <b>${esc(lkWerkLabel(_lkWerk))}</b> eine fertige
        Prozesslandschaft einsetzen. Alles bleibt danach frei änderbar.</p>
      <div class="form-group full">
        ${LK_VORLAGEN.map(v => `<label class="ack-check" style="font-weight:500;align-items:flex-start;margin-bottom:10px">
            <input type="radio" name="lk-vorlage" value="${esc(v.key)}"${v.key === vorgabe ? ' checked' : ''}>
            <span><b>${esc(v.titel)}</b> <span class="field-hint">· ${v.karte.kacheln.length} Prozesse in ${
              v.karte.baender.length} Bereichen</span><br><span class="field-hint">${esc(v.zweck)}</span></span>
          </label>`).join('')}
      </div>
      ${vorhanden ? `<div class="col-warning" style="display:block">Achtung: Die vorhandene Landkarte von
        ${esc(lkWerkLabel(_lkWerk))} mit ${vorhanden} Prozess(en) wird dabei <b>ersetzt</b>. Der Schritt steht
        anschließend im Verlauf.</div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="lkVorlageAnwenden()">Einsetzen</button>
    </div>`);
}

async function lkVorlageAnwenden() {
  if (!lkDarfSchreiben()) return;
  const wahl = document.querySelector('input[name="lk-vorlage"]:checked');
  const vorlage = LK_VORLAGEN.find(v => v.key === (wahl && wahl.value));
  if (!vorlage) return;
  const ziel = lkKarte(_lkWerk);
  const kopie = JSON.parse(JSON.stringify(vorlage.karte));
  ziel.baender = kopie.baender;
  // Der Geltungsbereich richtet sich nach der Ebene: Konzernprozesse gelten
  // konzernweit, die einer Gesellschaft zunächst dort.
  ziel.kacheln = kopie.kacheln.map(k => Object.assign(k, {
    geltung: _lkWerk === 'KONZERN' ? ['ALLE'] : [_lkWerk], prozesse: [], regelwerke: [],
    // Eine Vorlage kennt ihr Werk nicht – ihre Verweisziele stehen deshalb ohne.
    // Erst hier ist bekannt, wohin sie eingesetzt wird. Ohne das Werk läse später
    // jede andere Landkarte diese Ziele als ihre eigenen (lkZielTeile fällt auf
    // die offene Karte zurück), und die Gegenrichtung fände sie gar nicht.
    verweise: (Array.isArray(k.verweise) ? k.verweise : []).map(v => ({
      art: v.art,
      ziel: String(v.ziel).includes(':') ? v.ziel : lkZielSchluessel(_lkWerk, v.ziel),
    })),
  }));
  closeModal();
  await lkSpeichern(`Vorlage „${vorlage.titel}" eingesetzt ✓`,
    `Vorlage „${vorlage.titel}" für ${lkWerkLabel(_lkWerk)} eingesetzt (${ziel.kacheln.length} Prozesse)`);
}

function lkUebernehmenDialog() {
  const quellen = lkWerkeMitKarte().filter(w => w !== _lkWerk);
  if (!quellen.length) return;
  openModal(`
    <div class="modal-header"><h3>Landkarte übernehmen</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Die Struktur wird nach
        <b>${esc(lkWerkLabel(_lkWerk))}</b> kopiert – Bereiche und Prozesse.
        Der Geltungsbereich wird auf ${esc(lkWerkLabel(_lkWerk))} gesetzt; alles Weitere lässt sich
        danach anpassen. Die Quelle bleibt unverändert.</p>
      <div class="form-group full">
        <select id="lk-quelle">${quellen.map(w =>
          `<option value="${esc(w)}">${esc(lkWerkLabel(w))} – ${lkKarte(w).kacheln.length} Prozesse</option>`).join('')}</select>
      </div>
      <label class="ack-check" style="font-weight:500">
        <input type="checkbox" id="lk-uebernahme-modelle">
        <span>Auch die Verknüpfungen zu den BPMN-Modellen mitnehmen</span>
      </label>
      <span class="field-hint">Ohne Haken bekommt ${esc(lkWerkLabel(_lkWerk))} eine leere Struktur und
        modelliert seine Abläufe selbst – die Modelle des anderen Werks bleiben dort, wo sie hingehören.</span>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="lkUebernehmen()">Übernehmen</button>
    </div>`);
}

async function lkUebernehmen() {
  const wahl = document.getElementById('lk-quelle');
  if (!wahl || !lkDarfSchreiben()) return;
  const quelle = lkKarte(wahl.value);
  const ziel = lkKarte(_lkWerk);
  ziel.baender = JSON.parse(JSON.stringify(quelle.baender || []));
  const mitModellen = !!(document.getElementById('lk-uebernahme-modelle') || {}).checked;
  ziel.kacheln = JSON.parse(JSON.stringify(quelle.kacheln || []))
    .map(k => Object.assign(k, { geltung: _lkWerk === 'KONZERN' ? ['ALLE'] : [_lkWerk] }));
  ziel.kacheln.forEach(_lkVerweise);   // Altbestand-Felder gleich mit umstellen
  // Die Modelle des Quellwerks liegen in dessen Ordner. Sie mitzuschleppen
  // hieße, dass zwei Werke auf dieselbe Datei zeigen – deshalb nur auf Wunsch.
  if (!mitModellen) ziel.kacheln.forEach(k => { k.prozesse = []; });
  closeModal();
  await lkSpeichern(`Landkarte von ${lkWerkLabel(wahl.value)} übernommen ✓`,
    `Landkarte für ${lkWerkLabel(_lkWerk)} aus ${lkWerkLabel(wahl.value)} übernommen (${ziel.kacheln.length} Prozesse)`);
}

/**
 * Suche über alle Werke. Bei zehn Landkarten ist „wo steckt die Beschaffung?"
 * sonst eine Klickstrecke – hier ist es ein Treffer mit Werk daneben.
 */
function lkSuchen(q) {
  _lkSuche = String(q || '');
  const host = document.getElementById('lk-treffer');
  if (host) { host.outerHTML = _lkTrefferHtml(); return; }
  renderLandkarte();
}

function lkTreffer(q) {
  const s = String(q || '').trim().toLowerCase();
  if (s.length < 2) return [];
  return ((typeof lkAlleKacheln === 'function') ? lkAlleKacheln() : [])
    .filter(x => [x.kachel.name, x.kachel.unter].filter(Boolean).join(' ').toLowerCase().includes(s))
    .slice(0, 12);
}

function _lkTrefferHtml() {
  const q = _lkSuche.trim();
  if (q.length < 2) return '<div id="lk-treffer"></div>';
  const treffer = lkTreffer(q);
  return `<div id="lk-treffer" class="lk-treffer">
      ${treffer.length ? treffer.map(t => `<button class="lk-treffer-knopf"
          onclick="lkSpringeZu('${esc(t.werk)}','${esc(t.kachel.id)}')">
          ${esc(t.kachel.name)} <span>${esc(lkWerkLabel(t.werk))}</span></button>`).join('')
        : `<span class="field-hint">Kein Prozess mit „${esc(q)}" – in keiner Landkarte.</span>`}
    </div>`;
}

/** Zum Treffer springen: richtige Karte öffnen, Kachel zeigen. */
/** Aus einem Deep-Link: Werk setzen und die Kachel öffnen (sobald geladen). */
async function lkDeepLink(werk, id) {
  if (typeof lkDatenLaden === 'function') { try { await lkDatenLaden(); } catch (e) { /* Startbestand */ } }
  if (lkWerkeSichtbar().includes(werk)) _lkWerk = werk;
  if (typeof setProzessModus === 'function') setProzessModus('karte');
  else renderLandkarte();
  if (lkKachelVonId(id)) lkKachelOeffnen(id);
  else toast('Dieser Prozess wurde nicht gefunden – vielleicht wurde er umbenannt oder gelöscht.', 'error');
}

function lkSpringeZu(werk, id) {
  _lkWerk = lkWerkeSichtbar().includes(werk) ? werk : _lkWerk;
  renderLandkarte();
  lkKachelOeffnen(id);
}

function lkSetFilter(v) { _lkFilter = v || ''; renderLandkarte(); }

async function lkNeuLaden() {
  _lkGeladen = false; _lkDaten = null;
  if (typeof refreshProzesse === 'function') await refreshProzesse();
  else await initLandkarte();
}

/* ── Kachel öffnen: Geltungsbereich, Modell, Regelwerke ──────────────── */

function lkKachelVonId(id) { return lkKacheln().find(k => k.id === id) || null; }

/* Ein Verweisziel heißt „WERK:KACHEL". Das Werk gehört dazu, weil ein Verweis
   über Gesellschaftsgrenzen zeigen darf – ohne das ließe sich eine
   End-to-End-Kette quer durch den Konzern gar nicht aufschreiben. */
function lkZielSchluessel(werk, id) { return String(werk) + ':' + String(id); }

function lkZielTeile(ziel) {
  const s = String(ziel || '');
  const i = s.indexOf(':');
  // Ohne Werk im Ziel: die eigene Karte. So bleiben ältere Einträge lesbar.
  return i < 0 ? { werk: _lkWerk, id: s } : { werk: s.slice(0, i), id: s.slice(i + 1) };
}

/** Kachel zu einem Verweisziel – über ALLE Werke, nicht nur das offene. */
function lkKachelVonZiel(ziel) {
  const { werk, id } = lkZielTeile(ziel);
  return lkAlleKacheln().find(x => x.werk === werk && x.kachel.id === id) || null;
}

/**
 * Verweise einer Kachel, aufgelöst und um tote Ziele bereinigt.
 * Eine gelöschte Kachel soll keinen Verweis ins Nichts hinterlassen.
 */
function lkVerweiseVon(k) {
  return (Array.isArray(k && k.verweise) ? k.verweise : [])
    .map(v => {
      const treffer = lkKachelVonZiel(v.ziel);
      return treffer ? { art: v.art || 'nutzt', ziel: v.ziel, werk: treffer.werk, kachel: treffer.kachel } : null;
    })
    .filter(Boolean);
}

/**
 * Die Gegenrichtung: Wer zeigt auf diese Kachel?
 *
 * Gespeichert wird ein Verweis nur einmal, bei der Quelle. Die Rückrichtung
 * wird deshalb gesucht statt gepflegt – sonst müssten beide Seiten gleichzeitig
 * geändert werden, und genau da laufen solche Beziehungen auseinander.
 */
function lkVerweiseAuf(werk, id) {
  const ziel = lkZielSchluessel(werk, id);
  const out = [];
  lkAlleKacheln().forEach(({ werk: w, kachel }) => {
    (Array.isArray(kachel.verweise) ? kachel.verweise : []).forEach(v => {
      if (v.ziel === ziel) out.push({ art: v.art || 'nutzt', werk: w, kachel });
    });
  });
  return out;
}

/** Ein Verweis setzen oder lösen (dieselbe Art zweimal gibt es nicht). */
function lkVerweisSetzen(kachelId, ziel, art) {
  const k = lkKachelVonId(kachelId);
  if (!k || !lkDarfSchreiben()) return false;
  if (!Array.isArray(k.verweise)) k.verweise = [];
  const schon = k.verweise.findIndex(v => v.ziel === ziel);
  if (schon >= 0) k.verweise.splice(schon, 1);
  if (art) k.verweise.push({ ziel, art });
  return true;
}

function lkKachelOeffnen(id) {
  const k = lkKachelVonId(id);
  if (!k) return;
  const modelle = lkProzesseVon(k);
  const eigene = lkRegelwerkeVon(k);
  const schreiben = lkDarfSchreiben();
  const gb = (typeof geltungsbereichLabel === 'function') ? geltungsbereichLabel(k.geltung) : '';
  openModal(`
    <div class="modal-header">
      <h3>${esc(k.name)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      ${k.unter ? `<p class="ic-desc" style="margin:0 0 12px">${esc(k.unter)}</p>` : ''}
      <div class="ic-tags" style="margin-bottom:14px">
        <span class="ic-tag">${esc(_lkBandTitel(k.band))}</span>
        <span class="ic-tag cat">${esc(gb || 'Geltungsbereich nicht gepflegt')}</span>
      </div>
      <div style="margin:0 0 14px;font-size:.86rem">
        ${lkVerantwortlich(k)
          ? `👤 Verantwortlich: <a href="mailto:${esc(lkVerantwortlich(k))}">${esc(lkPersonName(lkVerantwortlich(k)))}</a>${
              k.vertretung ? ` <span class="field-hint">· Vertretung: ${esc(lkPersonName(k.vertretung))}</span>` : ''}`
          : `<span style="color:#b45309">👤 Kein Prozessverantwortlicher gepflegt</span>`}
      </div>

      <div style="border-top:1px solid var(--c-border);padding-top:12px">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">
          BPMN-Modelle${modelle.length > 1 ? ` <span class="field-hint">(${modelle.length})</span>` : ''}</div>
        ${modelle.length ? modelle.map(m => `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:4px 0">
              <span style="flex:1;min-width:140px">🔀 <b>${esc(m.title)}</b>${
                (m.ordner || '') === _lkWerk ? '' :
                ` <span class="ic-tag" title="Die Datei liegt nicht im Ordner dieses Werks">${
                  esc(m.ordner ? lkWerkLabel(m.ordner) : 'ohne Werk')}</span>`}</span>
              <button class="btn btn-outline btn-sm" onclick="closeModal();openProcessEditor('${esc(m.itemId)}')">Öffnen</button>
              ${schreiben ? `<button class="btn btn-ghost btn-sm" onclick="lkModellLoesen('${esc(k.id)}','${esc(m.itemId)}')">Lösen</button>` : ''}
            </div>`).join('')
          : `<div class="field-hint" style="margin-bottom:8px">Für diesen Prozess ist noch kein Modell hinterlegt.</div>`}
        ${schreiben ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
               <button class="btn ${modelle.length ? 'btn-outline' : 'btn-primary'} btn-sm" onclick="lkProzessAnlegen('${esc(k.id)}')">+ Modell anlegen</button>
               <button class="btn btn-outline btn-sm" onclick="lkVerknuepfenDialog('${esc(k.id)}')">+ Vorhandenes verknüpfen</button>
             </div>` : ''}
        ${modelle.length > 1 ? `<div class="field-hint" style="margin-top:6px">Ein Prozess besteht oft aus mehreren Abläufen – alle hängen an dieser Kachel.</div>` : ''}
      </div>

      ${_lkVerweiseHtml(_lkWerk, k)}

      <div style="border-top:1px solid var(--c-border);margin-top:14px;padding-top:12px">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Regelwerke zu diesem Prozess</div>
        ${eigene.length ? `<div style="margin-bottom:8px">${eigene.map(r => `<div style="padding:4px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <a href="#" onclick="closeModal();focusPolicyCard('${esc(r.id)}');return false"
               style="color:var(--c-primary);font-weight:600;text-decoration:none;flex:1;min-width:140px">${esc(r.title)}</a>
            <span class="field-hint">direkt verknüpft</span>
          </div>`).join('')}</div>` : ''}
        ${schreiben ? `<button class="btn btn-outline btn-sm" onclick="lkRegelwerkeDialog('${esc(k.id)}')" style="margin-bottom:10px">Regelwerke zuordnen</button>` : ''}
        <div id="lk-regelwerke" class="field-hint">${modelle.length ? 'Aus den Modellen wird geladen …'
          : (eigene.length ? '' : 'Noch keine Regelwerke – direkt zuordnen oder über ein Modell verknüpfen.')}</div>
      </div>
    </div>
    <div class="modal-footer">
      ${schreiben ? `<button class="btn btn-ghost" onclick="lkKachelLoeschen('${esc(k.id)}')">Löschen</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-ghost btn-sm" onclick="lkLinkKopieren('${esc(_lkWerk)}','${esc(k.id)}')"
        title="Dauerhafter Link auf diesen Prozess – für Mails, Regelwerke, Schulungen">🔗 Link</button>
      <button class="btn btn-outline" onclick="lkZuVerknuepfungen('${esc(k.id)}')"
        title="Diesen Prozess in der Mindmap in die Mitte stellen">🕸 Verknüpfungen</button>
      ${schreiben ? `<button class="btn btn-outline" onclick="lkKachelBearbeiten('${esc(k.id)}')">Bearbeiten</button>` : ''}
      <button class="btn btn-primary" onclick="closeModal()">Schließen</button>
    </div>`);
  if (modelle.length) _lkRegelwerkeLaden(modelle, k);
}

/** Regelwerke aus den BPMN-Dateien holen – erst beim Öffnen, nicht für die ganze Karte.
 *  Bei mehreren Modellen wird je Regelwerk gezeigt, aus welchem es stammt. */
async function _lkRegelwerkeLaden(modelle, kachel) {
  const host = document.getElementById('lk-regelwerke');
  if (!host) return;
  const eigeneIds = new Set((Array.isArray(kachel && kachel.regelwerke) ? kachel.regelwerke : []).map(String));
  try {
    const treffer = new Map();   // policyId → { policy, quellen: [] }
    for (const m of modelle) {
      const xml = await spGetProcessXml(m.itemId);
      const ids = (typeof _parsePolicyIds === 'function') ? _parsePolicyIds(xml) : [];
      ids.forEach(id => {
        const pol = policyZuId(id);
        if (!pol) return;
        if (!treffer.has(String(id))) treffer.set(String(id), { pol, quellen: [] });
        treffer.get(String(id)).quellen.push(m.title);
      });
    }
    const rows = [...treffer.values()].filter(t => !eigeneIds.has(String(t.pol.id)));
    if (!rows.length) {
      host.innerHTML = 'In den Modellen ist kein weiteres Regelwerk verknüpft.';
      return;
    }
    host.className = '';
    host.innerHTML = rows.map(t => `<div style="padding:5px 0">
        <a href="#" onclick="closeModal();focusPolicyCard('${esc(t.pol.id)}');return false"
           style="color:var(--c-primary);font-weight:600;text-decoration:none">${esc(t.pol.title)}</a>
        <span class="field-hint"> · Version ${esc(t.pol.version)}${t.pol.status ? ' · ' + esc(t.pol.status) : ''}
          · über ${esc(t.quellen.join(', '))}</span>
      </div>`).join('');
  } catch (e) {
    host.innerHTML = 'Regelwerke konnten nicht gelesen werden: ' + esc(e.message);
  }
}

/** Regelwerke direkt an der Kachel zuordnen – für Prozesse, die (noch) kein Modell haben. */
/**
 * Der Abschnitt „Prozesslandschaft" im Kachel-Dialog.
 *
 * Jede Zeile ist ein Sprung, kein Text: Anklicken wechselt – wenn nötig samt
 * Werk – auf die Zielkachel. Ein fremdes Werk steht sichtbar dabei, sonst
 * merkt man nicht, dass der Sprung die Gesellschaft verlässt.
 */
function _lkVerweiseHtml(werk, k) {
  const raus = lkVerweiseVon(k);
  const rein = lkVerweiseAuf(werk, k.id);
  const schreiben = lkDarfSchreiben();
  if (!raus.length && !rein.length && !schreiben) return '';

  const sprung = (w, ziel, name, zeichen, fremd) =>
    `<div style="padding:3px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
       <a href="#" onclick="closeModal();lkSpringeZu('${esc(w)}','${esc(ziel.id)}');return false"
          style="color:var(--c-primary);font-weight:600;text-decoration:none;flex:1;min-width:150px">
          ${zeichen} ${esc(name)}</a>
       ${fremd ? `<span class="ic-tag" title="Dieser Prozess gehört zu einer anderen Gesellschaft">${esc(lkWerkLabel(w))}</span>` : ''}
       ${schreiben ? `<button class="btn btn-ghost btn-sm" onclick="lkVerweisLoesen('${esc(k.id)}','${esc(lkZielSchluessel(w, ziel.id))}')">Lösen</button>` : ''}
     </div>`;

  const gruppen = LK_VERWEIS_ARTEN.map(a => {
    const zeilen = raus.filter(v => v.art === a.art);
    if (!zeilen.length) return '';
    return `<div style="margin-bottom:8px">
      <div class="field-hint" style="font-weight:600">${esc(a.label)}</div>
      ${zeilen.map(v => sprung(v.werk, v.kachel, v.kachel.name, a.zeichen, v.werk !== werk)).join('')}</div>`;
  }).join('');

  // Gegenrichtung: gesammelt, ohne Löschen – gepflegt wird sie bei der Quelle.
  const zurueck = rein.length
    ? `<div style="margin-top:4px">
         <div class="field-hint" style="font-weight:600">Zeigt hierher</div>
         ${rein.map(v => `<div style="padding:3px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
             <a href="#" onclick="closeModal();lkSpringeZu('${esc(v.werk)}','${esc(v.kachel.id)}');return false"
                style="color:var(--c-primary);font-weight:600;text-decoration:none;flex:1;min-width:150px">
                ${esc(lkVerweisArt(v.art).umkehr)}: ${esc(v.kachel.name)}</a>
             ${v.werk !== werk ? `<span class="ic-tag">${esc(lkWerkLabel(v.werk))}</span>` : ''}
           </div>`).join('')}</div>`
    : '';

  return `<div style="border-top:1px solid var(--c-border);margin-top:14px;padding-top:12px">
      <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Prozesslandschaft</div>
      ${gruppen || (rein.length ? '' : '<div class="field-hint" style="margin-bottom:8px">Noch keine Verweise – Unterprozesse, Nachfolger und Querbezüge lassen sich hier eintragen.</div>')}
      ${zurueck}
      ${schreiben ? `<button class="btn btn-outline btn-sm" onclick="lkVerweiseDialog('${esc(k.id)}')" style="margin-top:8px">Verweise pflegen</button>` : ''}
    </div>`;
}

/** Einen Verweis lösen und die Kachel gleich wieder zeigen. */
async function lkVerweisLoesen(kachelId, ziel) {
  if (!lkVerweisSetzen(kachelId, ziel, '')) return;
  await lkSpeichern('Verweis gelöst', 'verweise');
  lkKachelOeffnen(kachelId);
}

/**
 * Verweise pflegen: alle Kacheln aller Werke, je Zeile eine Art.
 * Bewusst alle Werke – ein Verweis darf die Gesellschaft wechseln, und
 * genau das ist bei einer End-to-End-Kette der Normalfall.
 */
function lkVerweiseDialog(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  const selbst = lkZielSchluessel(_lkWerk, k.id);
  const schon = {};
  (Array.isArray(k.verweise) ? k.verweise : []).forEach(v => { schon[v.ziel] = v.art; });

  const zeilen = lkAlleKacheln()
    .map(x => ({ ziel: lkZielSchluessel(x.werk, x.kachel.id), werk: x.werk, kachel: x.kachel }))
    .filter(x => x.ziel !== selbst)
    .sort((a, b) => (a.werk + a.kachel.name).localeCompare(b.werk + b.kachel.name, 'de'));

  openModal(`
    <div class="modal-header">
      <h3>Verweise: ${esc(k.name)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Ein Unterprozess ist eine ganz normale Kachel – sie behält
      Modelle, Regelwerke und ihren Verantwortlichen. „Danach folgt" ergibt die Kette für eine
      End-to-End-Sicht, „Nutzt" den Querbezug. Verweise dürfen die Gesellschaft wechseln.</p>
      <div style="max-height:52vh;overflow:auto">
        ${zeilen.map(x => `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--c-border)">
            <span style="flex:1;min-width:150px">${esc(x.kachel.name)}
              ${x.werk !== _lkWerk ? `<span class="ic-tag">${esc(lkWerkLabel(x.werk))}</span>` : ''}</span>
            <select class="form-control" style="width:auto;min-width:150px"
                    onchange="lkVerweisWaehlen('${esc(k.id)}','${esc(x.ziel)}',this.value)">
              <option value=""${schon[x.ziel] ? '' : ' selected'}>—</option>
              ${LK_VERWEIS_ARTEN.map(a => `<option value="${a.art}"${schon[x.ziel] === a.art ? ' selected' : ''}>${esc(a.zeichen)} ${esc(a.label)}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="lkVerweiseFertig('${esc(k.id)}')">Fertig</button>
    </div>`);
}

function lkVerweisWaehlen(kachelId, ziel, art) { lkVerweisSetzen(kachelId, ziel, art); }

async function lkVerweiseFertig(kachelId) {
  await lkSpeichern('Verweise gespeichert', 'verweise');
  lkKachelOeffnen(kachelId);
}

function lkRegelwerkeDialog(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  const schon = (Array.isArray(k.regelwerke) ? k.regelwerke : []).map(String);
  const policies = ((typeof State !== 'undefined' && State.policies) || [])
    .filter(p => p.typ !== 'Konzept')
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  openModal(`
    <div class="modal-header"><h3>Regelwerke zuordnen</h3>
      <button class="modal-close" onclick="lkKachelOeffnen('${esc(k.id)}')">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Welche Regelwerke regeln <b>${esc(k.name)}</b>?
        Diese Zuordnung hängt an der Kachel – unabhängig davon, ob es ein Modell gibt. Was über ein
        BPMN-Modell verknüpft ist, steht weiterhin dort und muss hier nicht wiederholt werden.</p>
      <div style="max-height:340px;overflow:auto;border:1px solid var(--c-border);border-radius:9px;padding:10px">
        ${policies.length ? policies.map(p => `<label class="ack-check" style="font-weight:500">
          <input type="checkbox" value="${esc(p.id)}" ${schon.includes(String(p.id)) ? 'checked' : ''}>
          <span>${esc(p.title)} <span class="field-hint">· ${esc(p.status || '')}</span></span></label>`).join('')
          : '<div class="field-hint">Es gibt noch keine Regelwerke.</div>'}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="lkKachelOeffnen('${esc(k.id)}')">Zurück</button>
      <button class="btn btn-primary" onclick="lkRegelwerkeSpeichern('${esc(k.id)}')">Speichern</button>
    </div>`);
}

async function lkRegelwerkeSpeichern(id) {
  const k = lkKachelVonId(id);
  if (!k) return;
  const host = document.querySelector('.modal-body');
  const ids = host ? [...host.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value) : [];
  const vorher = (Array.isArray(k.regelwerke) ? k.regelwerke : []).length;
  k.regelwerke = ids;
  closeModal();
  await lkSpeichern(ids.length ? `${ids.length} Regelwerk(e) zugeordnet ✓` : 'Zuordnung entfernt ✓',
    `Regelwerke von „${k.name}" geändert (${vorher} → ${ids.length})`);
}

/* ── Modell anlegen / verknüpfen ─────────────────────────────────────── */

/** Aus einer Kachel ein BPMN-Grundgerüst erzeugen und verknüpfen. */
/** Verweise einer Kachel als Feld sicherstellen (und Altbestand mitnehmen). */
function _lkVerweise(k) {
  if (!Array.isArray(k.prozesse)) {
    k.prozesse = (k.prozessId || k.prozessName) ? [{ id: k.prozessId || '', name: k.prozessName || '' }] : [];
    delete k.prozessId; delete k.prozessName;
  }
  return k.prozesse;
}

/** Dateiname für ein weiteres Modell: „Vertrieb", dann „Vertrieb 2" … –
 *  gleiche Namen im selben Ordner wären dieselbe Datei, das zweite Modell
 *  überschriebe das erste. Über Werke hinweg stört der gleiche Name dagegen
 *  nicht: HOL/Vertrieb und SHB/Vertrieb sind zwei Dateien. */
function _lkFreierModellName(basis, werk) {
  const w = String(werk === undefined ? _lkWerk : (werk || ''));
  const alle = ((typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [])
    .filter(p => (p.ordner || '') === w);
  const belegt = (n) => alle.some(p => (p.title || '').trim().toLowerCase() === n.trim().toLowerCase());
  if (!belegt(basis)) return basis;
  for (let i = 2; i < 50; i++) if (!belegt(`${basis} ${i}`)) return `${basis} ${i}`;
  return `${basis} ${Date.now()}`;
}

async function lkProzessAnlegen(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  try {
    const name = _lkFreierModellName(k.name, _lkWerk);
    const text = [name, k.unter].filter(Boolean).join('\n');
    // _bpmnFromText liefert { name, xml, … } – ohne das „.xml" landete das
    // Objekt im Rumpf der Anfrage und die Datei enthielt „[object Object]".
    const erzeugt = (typeof _bpmnFromText === 'function') ? _bpmnFromText(text, name, []) : null;
    const xml = (erzeugt && erzeugt.xml) || (typeof DEFAULT_BPMN !== 'undefined' ? DEFAULT_BPMN : '');
    // Das Modell gehört zum Werk dieser Landkarte – es landet in dessen Ordner.
    const item = await spSaveProcess(name, xml, _lkWerk);
    _lkVerweise(k).push({ id: (item && item.id) || '', name });
    if (typeof refreshProzesse === 'function') await refreshProzesse();
    await lkSpeichern(`Modell „${name}" angelegt ✓`, `Modell „${name}" für „${k.name}" angelegt`);
    closeModal();
    if (item && item.id && typeof openProcessEditor === 'function') openProcessEditor(item.id);
  } catch (e) {
    toast('Anlegen fehlgeschlagen: ' + e.message, 'error');
  }
}

function lkVerknuepfenDialog(id) {
  const k = lkKachelVonId(id);
  if (!k) return;
  const schon = new Set(lkModellVerweise(k).map(v => v.id).filter(Boolean));
  const alle = ((typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [])
    .filter(p => !schon.has(p.itemId))   // was schon hängt, nicht noch einmal anbieten
    // Modelle des eigenen Werks zuerst – die sind in aller Regel gemeint.
    .sort((a, b) => ((b.ordner || '') === _lkWerk) - ((a.ordner || '') === _lkWerk)
      || (a.title || '').localeCompare(b.title || '', 'de'));
  if (!alle.length) { toast('Es gibt kein weiteres Modell zum Verknüpfen.', 'error'); return; }
  openModal(`
    <div class="modal-header"><h3>Modell verknüpfen</h3>
      <button class="modal-close" onclick="lkKachelOeffnen('${esc(k.id)}')">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Welches vorhandene BPMN-Modell gehört zu „${esc(k.name)}"?</p>
      <div class="form-group full">
        <select id="lk-proc-wahl">
          ${alle.map(p => `<option value="${esc(p.itemId)}">${esc(p.title)} · ${
            esc(p.ordner ? lkWerkLabel(p.ordner) : 'ohne Werk')}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="lkKachelOeffnen('${esc(k.id)}')">Zurück</button>
      <button class="btn btn-primary" onclick="lkVerknuepfen('${esc(k.id)}')">Verknüpfen</button>
    </div>`);
}

async function lkVerknuepfen(id) {
  const k = lkKachelVonId(id);
  const wahl = document.getElementById('lk-proc-wahl');
  if (!k || !wahl) return;
  const alle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  const p = alle.find(x => x.itemId === wahl.value);
  if (!p) return;
  const verweise = _lkVerweise(k);
  if (verweise.some(v => v.id === p.itemId)) { toast('Dieses Modell hängt bereits an der Kachel.', 'error'); return; }
  verweise.push({ id: p.itemId, name: p.title });
  closeModal();
  await lkSpeichern(`„${k.name}" mit „${p.title}" verknüpft ✓`, `„${k.name}" mit Modell „${p.title}" verknüpft`);
}

/** Ein einzelnes Modell von der Kachel lösen (die Datei bleibt bestehen). */
async function lkModellLoesen(id, itemId) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  const verweise = _lkVerweise(k);
  const i = verweise.findIndex(v => v.id === itemId);
  if (i < 0) return;
  const name = verweise[i].name || '';
  verweise.splice(i, 1);
  closeModal();
  await lkSpeichern('Verknüpfung gelöst ✓',
    `Modell${name ? ' „' + name + '"' : ''} von „${k.name}" gelöst – die Datei bleibt bestehen`);
}

/* ── Kacheln bearbeiten ──────────────────────────────────────────────── */

function lkKachelNeu(band) {
  if (!lkDarfSchreiben()) return;
  // In einer Werk-Karte gilt ein neuer Prozess zunächst für dieses Werk;
  // auf Konzern-Ebene konzernweit. Beides bleibt änderbar.
  const vorgabe = (_lkWerk === 'KONZERN') ? ['ALLE'] : [_lkWerk];
  // Aus dem Baum heraus ist das Band schon bekannt – dann nicht wieder fragen.
  const baender = lkBaender();
  const start = (band && baender.some(b => b.key === band)) ? band
    : (baender.some(b => b.key === 'unterstuetzung') ? 'unterstuetzung' : (baender[0] || {}).key || 'unterstuetzung');
  _lkEditing = { id: '', band: start, name: '', unter: '', geltung: vorgabe, prozesse: [], regelwerke: [], neu: true };
  renderLkEditor();
}

function lkKachelBearbeiten(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  _lkEditing = JSON.parse(JSON.stringify(k));
  _lkEditing.neu = false;
  if (!Array.isArray(_lkEditing.geltung)) _lkEditing.geltung = ['ALLE'];
  renderLkEditor();
}

function renderLkEditor() {
  const k = _lkEditing;
  if (!k) return;
  // Für die Geltungsbereich-Auswahl gilt dieselbe Oberfläche wie bei Regelwerken;
  // _gbScope('lgb') zeigt auf _lkEditing.geltungsbereich – deshalb hier spiegeln.
  k.geltungsbereich = k.geltung;
  lkMitgliederLaden();
  openModal(`
    <div class="modal-header">
      <h3>${k.neu ? 'Prozess anlegen' : 'Prozess bearbeiten'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full">
          <label>Name <span class="req">*</span></label>
          <input type="text" value="${esc(k.name)}" oninput="_lkEditing.name=this.value" placeholder="z. B. Beschaffung">
        </div>
        <div class="form-group full">
          <label>Untertitel</label>
          <input type="text" value="${esc(k.unter || '')}" oninput="_lkEditing.unter=this.value" placeholder="z. B. Versand / Faktura">
          <span class="field-hint">Kurz – er steht klein unter dem Namen.</span>
        </div>
        <div class="form-group full">
          <label>Band</label>
          <select onchange="_lkEditing.band=this.value">
            ${lkBaender().map(b => `<option value="${esc(b.key)}"${b.key === k.band ? ' selected' : ''}>${esc(b.titel)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Prozessverantwortlich (E-Mail)</label>
          <input type="text" list="lk-people" value="${esc(k.verantwortlich || '')}"
            oninput="_lkEditing.verantwortlich=this.value" placeholder="name@dihag.com">
          <span class="field-hint">Wer den Ablauf verantwortet – die Frage jedes Audits.</span>
        </div>
        <div class="form-group">
          <label>Vertretung (E-Mail)</label>
          <input type="text" list="lk-people" value="${esc(k.vertretung || '')}"
            oninput="_lkEditing.vertretung=this.value" placeholder="optional">
        </div>
        <datalist id="lk-people">${_lkPeopleOptions()}</datalist>
      </div>
      ${(typeof renderGeltungsbereichSection === 'function') ? renderGeltungsbereichSection(k.geltung, 'lgb') : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="lkEditorSpeichern()">Speichern</button>
    </div>`);
}

async function lkEditorSpeichern() {
  const k = _lkEditing;
  if (!k) return;
  const name = String(k.name || '').trim();
  if (!name) { toast('Bitte einen Namen angeben.', 'error'); return; }
  const geltung = Array.isArray(k.geltungsbereich) ? k.geltungsbereich : (k.geltung || []);
  if (!geltung.length) { toast('Bitte den Geltungsbereich festlegen: „Alle Standorte" oder einzelne Werke.', 'error'); return; }

  if (k.neu) {
    const id = _lkNeueId(name);
    lkKacheln().push({ id, band: k.band, name, unter: String(k.unter || '').trim(), geltung,
      verantwortlich: String(k.verantwortlich || '').trim(), vertretung: String(k.vertretung || '').trim(),
      prozesse: [], regelwerke: [] });
    closeModal();
    _lkEditing = null;
    await lkSpeichern(`„${name}" angelegt ✓`, `Prozess „${name}" angelegt`);
    return;
  }
  const ziel = lkKachelVonId(k.id);
  if (!ziel) return;
  const alt = { name: ziel.name, band: ziel.band, unter: ziel.unter || '', geltung: (ziel.geltung || []).join(','),
    verantwortlich: ziel.verantwortlich || '' };
  ziel.name = name;
  ziel.unter = String(k.unter || '').trim();
  ziel.band = k.band;
  ziel.geltung = geltung;
  ziel.verantwortlich = String(k.verantwortlich || '').trim();
  ziel.vertretung = String(k.vertretung || '').trim();
  const teile = [];
  if (alt.name !== name) teile.push(`Name: „${alt.name}" → „${name}"`);
  if (alt.band !== ziel.band) teile.push(`Band: ${_lkBandTitel(alt.band)} → ${_lkBandTitel(ziel.band)}`);
  if (alt.unter !== ziel.unter) teile.push('Untertitel geändert');
  if (alt.geltung !== geltung.join(',')) teile.push(`Geltungsbereich: ${geltungsbereichLabel(geltung)}`);
  if (alt.verantwortlich !== ziel.verantwortlich) {
    teile.push(`Verantwortlich: ${alt.verantwortlich || '(niemand)'} → ${ziel.verantwortlich || '(niemand)'}`);
  }
  closeModal();
  _lkEditing = null;
  await lkSpeichern('Gespeichert ✓', `„${name}" geändert${teile.length ? ' – ' + teile.join('; ') : ''}`);
}

function _lkNeueId(name) {
  const basis = String(name).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'prozess';
  let id = basis, n = 2;
  while (lkKachelVonId(id)) id = basis + n++;
  return id;
}

async function lkKachelLoeschen(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  const p = lkProzessVon(k);
  const ok = (typeof uiConfirm === 'function')
    ? await uiConfirm(`„${k.name}" aus der Landkarte entfernen?${p ? '\n\nDas BPMN-Modell bleibt erhalten – nur die Kachel verschwindet.' : ''}`,
        { title: 'Prozess entfernen', okLabel: 'Entfernen', danger: true })
    : confirm(`„${k.name}" entfernen?`);
  if (!ok) return;
  const liste = lkKacheln();
  const i = liste.findIndex(x => x.id === id);
  if (i < 0) return;
  liste.splice(i, 1);
  closeModal();
  await lkSpeichern('Entfernt ✓', `Prozess „${k.name}" aus der Landkarte entfernt`);
}

/* ── Ziehen und Ablegen: Reihenfolge und Band ────────────────────────── */

function lkZiehStart(ev, i) {
  _lkZiehIndex = i;
  if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', String(i)); } catch (e) { /* egal */ } }
  if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.add('lk-zieht');
}
function lkZiehEnde() {
  _lkZiehIndex = -1;
  document.querySelectorAll('.lk-zieht').forEach(el => el.classList.remove('lk-zieht'));
}
function lkZiehUeber(ev) { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'; }

/**
 * Ablegen: auf eine Kachel (zielIndex ≥ 0) verschiebt davor, auf ein leeres
 * Band (zielIndex = -1) hängt ans Ende. Das Band der Zielkachel gewinnt –
 * so wechselt ein Prozess das Band, indem man ihn dorthin zieht.
 */
async function lkZiehAblegen(ev, bandKey, zielIndex) {
  ev.preventDefault(); ev.stopPropagation();
  const liste = lkKacheln();
  const von = _lkZiehIndex;
  lkZiehEnde();
  if (von < 0 || von >= liste.length) return;
  const kachel = liste[von];
  const altesBand = kachel.band;
  let neuesBand = bandKey;
  if (zielIndex >= 0 && liste[zielIndex]) neuesBand = liste[zielIndex].band;
  if (zielIndex === von) return;

  liste.splice(von, 1);
  let ziel = zielIndex;
  if (ziel < 0) ziel = liste.length;
  else if (von < zielIndex) ziel = zielIndex - 1;
  kachel.band = neuesBand || altesBand;
  liste.splice(ziel, 0, kachel);

  const was = (altesBand !== kachel.band)
    ? `„${kachel.name}" nach ${_lkBandTitel(kachel.band)} verschoben`
    : `Reihenfolge in ${_lkBandTitel(kachel.band)} geändert („${kachel.name}")`;
  await lkSpeichern('', was);
}

/* ── Versionsverlauf ─────────────────────────────────────────────────── */

function lkVerlaufZeigen() {
  const h = (_lkDaten && Array.isArray(_lkDaten.historie)) ? _lkDaten.historie.slice().reverse() : [];
  openModal(`
    <div class="modal-header"><h3>Versionsverlauf der Landkarte</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${h.length ? `<div style="font-size:.87rem;line-height:1.7">${h.map(e => `
        <div style="padding:7px 0;border-bottom:1px solid var(--c-border-2)">
          <b>${esc(e.name || '–')}</b>
          <span class="field-hint"> · ${typeof fmtDate === 'function' ? esc(fmtDate(e.datum)) : esc(e.datum)}</span>
          <div>${esc(e.was || '')}</div>
        </div>`).join('')}</div>`
        : '<p class="field-hint">Noch keine Änderung verzeichnet.</p>'}
      <p class="field-hint" style="margin-top:12px">Ältere Fassungen der Datei bewahrt SharePoint zusätzlich auf.</p>
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Schließen</button></div>`);
}

/** Von der Kachel in die Mindmap – dieser Prozess kommt in die Mitte. */
async function lkZuVerknuepfungen(id) {
  closeModal();
  if (typeof setProzessModus !== 'function') return;
  setProzessModus('netz');
  // Der Graph wird beim Umschalten aufgebaut; danach den Fokus setzen.
  if (typeof initVerknuepfungen === 'function') await initVerknuepfungen();
  if (typeof vkFokus === 'function') vkFokus('prozess:' + _lkWerk + ':' + id);
}
