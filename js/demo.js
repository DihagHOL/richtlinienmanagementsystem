/**
 * Vorführ- und Testmodus
 * ======================
 * Die vollständige Anwendung mit allen echten Bedienelementen – aber auf einer
 * erfundenen Datenbasis im Arbeitsspeicher. Jeder Klick löst wirklich das aus,
 * was er im Betrieb auslöst: Konzept einreichen, Prüfung, Mitbestimmung,
 * Freigabe, Kenntnisnahme, Historie.
 *
 * Zwei bewusste Abweichungen vom Normalbetrieb:
 *
 *   1. Daten: Lesen und Schreiben gehen in DemoDaten (Arbeitsspeicher).
 *      Nichts erreicht die SharePoint-Listen – die Vorführung kann den
 *      Echtbestand also nicht verunreinigen.
 *
 *   2. E-Mails: werden WIRKLICH über Microsoft Graph versendet – aber
 *      ausschließlich an das Postfach der vorführenden Person. Betreff und
 *      Kopfzeile weisen den Testcharakter aus, die ursprünglichen Empfänger
 *      stehen im Hinweis. Angesehen werden die Nachrichten im normalen
 *      Postfach (Outlook/OWA) – die Anwendung baut dafür bewusst keine eigene
 *      Ansicht nach. Abschaltbar über den Schalter im Streifen.
 *
 * Der Anhang ist echt: Die Vorführung erzeugt ein PDF zum Regelwerk und hängt
 * es an, zusätzlich verweist die Mail auf die Fundstelle in SharePoint. So ist
 * erkennbar, was Prüfer und Geschäftsleitung im Betrieb wirklich vorfinden.
 *
 * Damit die Entscheidungs-Schaltflächen aus dem Postfach funktionieren,
 * überleben die Vorführdaten den Seitenwechsel (localStorage, 12 Stunden).
 *
 * Zugang: nur für freigeschaltete Personen – Administratoren sowie die in den
 * Einstellungen unter „Vorführmodus" hinterlegten Benutzer (siehe darfDemo()).
 *
 * Start: ?demo=1 in der Adresse oder der Knopf in der Anleitung.
 * Die Anmeldung läuft normal – es gibt keinen Weg an ihr vorbei.
 */

/** Erfundene Beteiligte – bewusst keine echten Personen. */
const DEMO_TEAM = [
  { name: 'Demo Prüfer (IT-Sicherheit)', upn: 'demo.pruefer@dihag.com', department: 'IT' },
  { name: 'Demo Geschäftsleitung',       upn: 'demo.gf@dihag.com',      department: 'Geschäftsführung' },
  { name: 'Demo Konzernbetriebsrat',     upn: 'demo.kbr@dihag.com',     department: 'Verwaltung' },
  { name: 'Demo Qualitätsmanagement',    upn: 'demo.qm@dihag.com',      department: 'Qualitätsmanagement' },
  { name: 'Demo Personalabteilung',      upn: 'demo.hr@dihag.com',      department: 'Personal' },
];

/** Der komplette Datenbestand der Vorführung – nur im Arbeitsspeicher. */
const DemoDaten = { policies: [], acks: [], mails: [], naechsteId: 500 };

let _demoAn = false;
let _demoMailEcht = true;      // Mails wirklich versenden (an das eigene Postfach)
let _demoEchtSendMail = null;  // Originalfunktion, bevor sie ersetzt wird

/** Läuft die Anwendung gerade als Vorführung? */
function demoAktiv() { return _demoAn; }

/** Soll nach der Anmeldung in den Vorführmodus gewechselt werden? */
function demoGewuenscht() { return /[?&]demo=1(&|$)/.test(location.search); }

/** Vorführung starten (lädt die Seite mit ?demo=1 neu – Anmeldung bleibt bestehen). */
function demoStart() {
  if (typeof darfDemo === 'function' && !darfDemo()) { demoKeinZugriff(); return; }
  location.href = location.pathname + '?demo=1';
}

/** Vorführung beenden und normal weiterarbeiten. */
function demoBeenden() {
  if (!confirm('Vorführung beenden? Alle Demo-Daten werden verworfen.')) return;
  _demoVergessen();
  location.href = location.pathname;
}

function demoKeinZugriff() {
  openModal(`
    <div class="modal-header">
      <h3>Vorführmodus nicht freigeschaltet</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <p style="margin:0 0 12px;line-height:1.6">Der Vorführ- und Testmodus ist nur für freigeschaltete
      Personen nutzbar. Er legt zwar keine echten Daten an, versendet aber echte E-Mails und zeigt den
      vollständigen Funktionsumfang – deshalb ist er nicht allgemein zugänglich.</p>
      <p style="margin:0;line-height:1.6">Freischaltung über <b>Einstellungen → Vorführmodus</b>
      (durch eine Administratorin oder einen Administrator).</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal()">Verstanden</button>
    </div>`);
}

/* ═══════════════════════════════════════════════════
   Start (nach der Anmeldung, aus bootApp heraus)
═══════════════════════════════════════════════════ */

/**
 * Vorführmodus einschalten: Zugriff prüfen, Beispieldaten anlegen, Datenschicht
 * umlenken, Hinweisstreifen zeigen und die Ansichten neu aufbauen.
 * @returns true, wenn der Modus wirklich aktiv ist
 */
async function demoAktivieren() {
  if (_demoAn) return true;
  if (typeof darfDemo === 'function' && !darfDemo()) { demoKeinZugriff(); return false; }

  _demoAn = true;
  // Kommt der Aufruf aus einer Testmail, muss der alte Stand wieder da sein –
  // sonst kennt die Anwendung den Vorgang aus der Mail nicht mehr.
  if (!_demoWiederherstellen()) _demoSeed();
  _demoStubs();
  _demoBanner();

  // Rollen und Rechte der Vorführung greifen erst nach einem Neuaufbau
  if (typeof _resetAccessCache === 'function') _resetAccessCache();
  await loadRuntimeAccessConfig();
  State.myRoles = await getCurrentUserRoles();
  initRoleNav();
  State.loadedAt = 0;
  await reloadData();
  // Entscheidungs-Link aus einer Testmail? Dann dorthin. Sonst normal starten –
  // die geführte Vorführung soll den Weg ins Dashboard selbst zeigen.
  if (/[?&](konzept|richtlinie)=/.test(location.search)) await applyDeepLinkOrDefault();
  else await switchView('meine');

  if (/[?&]tour=1(&|$)/.test(location.search) && typeof tourStart === 'function') {
    setTimeout(() => tourStart(), 500);
  }
  return true;
}

/* ═══════════════════════════════════════════════════
   Beispieldaten
═══════════════════════════════════════════════════ */

function _demoIso(tageZurueck) {
  return new Date(Date.now() - tageZurueck * 86400000).toISOString();
}

function _demoIch() {
  return State.user ? State.user.upn : '';
}

function _demoPolicy(o) {
  return {
    id: String(DemoDaten.naechsteId++),
    typ: 'Regelwerk', konzept: null, regelwerkTyp: '', geltungsbereich: [], historie: [],
    title: '', beschreibung: '', kategorie: '',
    dokumentUrl: '', dokumentName: '', dokumentDriveId: '', dokumentItemId: '',
    version: '1.0', status: 'Entwurf', pflicht: true,
    quizErforderlich: false, quizBestehenProzent: 80, quiz: [],
    zielgruppen: [ZIELGRUPPE_ALLE], wiederholungMonate: 0, naechsteReview: '',
    veroeffentlichtAm: '', freigegebenVon: '',
    konformitaet: [], freigaben: [], normbezug: [],
    pruefKonfig: { pruefer: [], schwelle: '' }, freigabeKonfig: { freigeber: [], schwelle: '' },
    kbrBetroffen: false, mitbestimmungWerke: [], mitbestimmung: null, freigabeReihenfolge: 'gl_mb',
    pruefungSeit: '', modifiedAt: new Date().toISOString(),
    ...o,
  };
}

function _demoSeed() {
  const ich = _demoIch();
  const meinName = State.user ? (State.user.name || ich) : 'Vorführung';

  DemoDaten.policies = [
    _demoPolicy({
      title: 'Informationssicherheitsleitlinie (Demo)',
      beschreibung: 'Grundsätze der Informationssicherheit in der DIHAG-Gruppe: Schutzziele, Verantwortlichkeiten und Verhalten im Alltag.',
      kategorie: 'IT-Sicherheit', regelwerkTyp: 'Konzernrichtlinie',
      geltungsbereich: ['ALLE'], version: '2.1', status: 'Veröffentlicht',
      ..._demoDokFelder(),
      veroeffentlichtAm: _demoIso(120), freigegebenVon: 'Demo Geschäftsleitung',
      wiederholungMonate: 12,
      naechsteReview: new Date(Date.now() + 90 * 86400000).toISOString(),
      normbezug: ['ISO27001:A.5.1'],
      quizErforderlich: true, quizBestehenProzent: 80,
      quiz: [
        { frage: 'Wem meldest du einen Verdacht auf einen Sicherheitsvorfall?', optionen: ['Der IT-Sicherheit', 'Niemandem', 'Erst dem Kunden'], richtig: 0 },
        { frage: 'Dürfen Firmendaten auf privaten USB-Sticks gespeichert werden?', optionen: ['Ja, immer', 'Nein', 'Nur freitags'], richtig: 1 },
      ],
      historie: [
        { datum: _demoIso(130), upn: ich, name: meinName, aktion: 'Angelegt', text: '' },
        { datum: _demoIso(120), upn: 'demo.gf@dihag.com', name: 'Demo Geschäftsleitung', aktion: 'Freigegeben & veröffentlicht', text: 'Version 2.1' },
      ],
    }),
    _demoPolicy({
      title: 'Reisekostenrichtlinie (Demo)',
      beschreibung: 'Erstattung von Reise-, Übernachtungs- und Bewirtungskosten.',
      kategorie: 'Finanzen', regelwerkTyp: 'Richtlinie',
      geltungsbereich: ['HOL', 'SHB'], version: '1.4', status: 'Veröffentlicht',
      veroeffentlichtAm: _demoIso(60), freigegebenVon: 'Demo Geschäftsleitung',
      historie: [{ datum: _demoIso(60), upn: 'demo.gf@dihag.com', name: 'Demo Geschäftsleitung', aktion: 'Freigegeben & veröffentlicht', text: '' }],
    }),
    _demoPolicy({
      title: 'Passwortrichtlinie (Demo)',
      beschreibung: 'Mindestlänge, Wechselintervalle und Umgang mit dem Passwort-Manager.',
      kategorie: 'IT-Sicherheit', regelwerkTyp: 'Konzernfachregelung',
      geltungsbereich: ['ALLE'], version: '1.0', status: 'Konformitätsprüfung',
      ..._demoDokFelder(),
      pruefungSeit: _demoIso(4),
      pruefKonfig: { pruefer: [ich], schwelle: 'einer' },
      normbezug: ['ISO27001:A.5.17'],
      historie: [
        { datum: _demoIso(9), upn: ich, name: meinName, aktion: 'Angelegt', text: '' },
        { datum: _demoIso(4), upn: ich, name: meinName, aktion: 'Zur Konformitätsprüfung', text: '' },
      ],
    }),
    _demoPolicy({
      title: 'Umgang mit Lieferantenaudits (Demo)',
      beschreibung: 'Ablauf, Zuständigkeiten und Dokumentation von Audits bei Lieferanten.',
      kategorie: 'Qualitätsmanagement', regelwerkTyp: 'Arbeits-/Prozessanweisung',
      geltungsbereich: ['SHB', 'EIS'], version: '0.3', status: 'Entwurf',
      ..._demoDokFelder(),
      zielgruppen: ['Qualitätsmanagement', 'Einkauf'],
      historie: [{ datum: _demoIso(2), upn: ich, name: meinName, aktion: 'Angelegt', text: '' }],
    }),
  ];

  // Eine bereits erledigte Kenntnisnahme, damit die Mitarbeitersicht nicht leer wirkt.
  const reise = DemoDaten.policies.find(p => p.title.startsWith('Reisekosten'));
  DemoDaten.acks = [{
    id: 'a1', richtlinieId: reise.id, version: reise.version,
    benutzerUpn: ich, benutzerName: meinName,
    gelesenAm: _demoIso(50), quizBestanden: false, quizScore: 0, quizVersuche: 0,
    abgeschlossenAm: _demoIso(50),
  }];
  DemoDaten.mails = [];
}

/**
 * Zugriffskonfiguration der Vorführung: Die vorführende Person hält alle Rollen –
 * nur so lässt sich die ganze Kette allein durchspielen. Die echte Konfiguration
 * bleibt unberührt (sie wird lediglich für diese Sitzung überlagert).
 */
function _demoConfig() {
  const ich = _demoIch();
  const echt = (typeof getAccessConfig === 'function') ? getAccessConfig() : {};
  return {
    ...echt,
    admins: [ich], genehmiger: [ich],
    roles: null,
    userRoles: { [ich]: ['IT', 'Geschäftsführung'] },
    reiterRechte: {},
    kbrMail: ich, brMails: { SHB: ich, EIS: ich },
    clevelMail: ich,
    pruefer: [ich], geschaeftsleitung: [ich],
    konformSchwelle: 'einer', freigabeSchwelle: 'einer',
    eskalationMail: '', genehmigungPAScope: 'aus', genehmigungPA: false,
    erinnerungenAktiv: false,
  };
}

/* ═══════════════════════════════════════════════════
   Das Dokument zum Regelwerk
   ═══════════════════════════════════════════════════
   Ein Regelwerk ohne Datei erklärt die Lage nur halb: Prüfer und Geschäfts-
   leitung entscheiden anhand des Dokuments. Die Vorführung erzeugt deshalb ein
   echtes PDF als Mailanhang und verweist zusätzlich auf die Muster-Vorlage in
   SharePoint – dort sehen die Empfänger, wo die Datei im Betrieb liegt. */

const DEMO_DOK = {
  name: 'Regelwerk-Entwurf (Vorführung).pdf',
  driveId: 'demo-drive',
  itemId: 'demo-item',
};

/** SharePoint-Fundstelle, auf die die Vorführung verweist. */
function _demoDokUrl() {
  return (typeof MUSTER_VORLAGE_URL !== 'undefined') ? MUSTER_VORLAGE_URL : '';
}

/** Dokumentfelder für ein Vorführ-Regelwerk. */
function _demoDokFelder() {
  return {
    dokumentName: DEMO_DOK.name,
    dokumentUrl: _demoDokUrl(),
    dokumentDriveId: DEMO_DOK.driveId,
    dokumentItemId: DEMO_DOK.itemId,
  };
}

/** Typografie und Umlaute auf das PDF-Zeichenset (WinAnsi) herunterbrechen. */
function _demoLatin(t) {
  const karte = { '„': '"', '“': '"', '”': '"', '‘': "'", '’': "'",
                  '–': '-', '—': '-', '→': '->', ' ': ' ' };
  return String(t).split('').map(c => {
    if (karte[c]) return karte[c];
    return c.charCodeAt(0) < 256 ? c : '';
  }).join('');
}

/**
 * Erzeugt ein kleines, gültiges PDF – ohne Bibliothek, damit die Vorführung
 * überall läuft. Reicht für den Zweck: Es lässt sich öffnen, drucken und zeigt,
 * was im Betrieb an der Mail hängt.
 */
function _demoPdfBauen(titel, zeilen) {
  const BS = String.fromCharCode(92);   // Backslash und Zeilenumbruch ohne
  const NL = String.fromCharCode(10);   // Escape-Sequenzen im Quelltext
  const t = (s) => _demoLatin(s).split(BS).join(BS + BS)
    .split('(').join(BS + '(').split(')').join(BS + ')');

  let y = 780;
  const text = [`BT /F1 17 Tf 56 ${y} Td (${t(titel)}) Tj ET`];
  y -= 34;
  for (const z of zeilen) {
    const fett = z.startsWith('#');
    const zeile = fett ? z.slice(1) : z;
    if (!zeile) { y -= 10; continue; }
    text.push(`BT /${fett ? 'F1' : 'F2'} ${fett ? 12 : 11} Tf 56 ${y} Td (${t(zeile)}) Tj ET`);
    y -= fett ? 22 : 17;
  }
  const inhalt = text.join(NL);

  const objekte = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>',
    `<</Length ${inhalt.length}>>stream${NL}${inhalt}${NL}endstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
  ];
  let pdf = '%PDF-1.4' + NL;
  const stellen = [];
  objekte.forEach((o, i) => { stellen.push(pdf.length); pdf += `${i + 1} 0 obj${o}endobj${NL}`; });
  const xref = pdf.length;
  pdf += `xref${NL}0 ${objekte.length + 1}${NL}0000000000 65535 f ${NL}`;
  stellen.forEach(off => { pdf += String(off).padStart(10, '0') + ' 00000 n ' + NL; });
  pdf += `trailer<</Size ${objekte.length + 1}/Root 1 0 R>>${NL}startxref${NL}${xref}${NL}%%EOF`;
  return pdf;
}

/** Mailanhang (Graph-fileAttachment) mit dem erzeugten PDF. */
function _demoAnhang(p) {
  const zeilen = [
    '#1. Zweck und Geltungsbereich',
    'Dieses Dokument ist Teil einer Vorfuehrung des Regelwerk-Managements.',
    'Es liegt kein echter Vorgang zugrunde.',
    '',
    `Titel: ${p && p.title ? p.title : '-'}`,
    `Dokumentart: ${p && p.regelwerkTyp ? p.regelwerkTyp : '-'}`,
    `Geltungsbereich: ${(p && typeof geltungsbereichLabel === 'function') ? geltungsbereichLabel(p.geltungsbereich) : '-'}`,
    `Version: ${p && p.version ? p.version : '-'}`,
    '',
    '#2. Warum ein Anhang?',
    'Im Betrieb entscheiden Pruefer und Geschaeftsleitung anhand der Datei.',
    'Sie haengt an der Mail und liegt zugleich in SharePoint - dort mit',
    'Versionsverlauf und Kommentaren, immer im aktuellen Stand.',
    '',
    '#3. Naechster Schritt',
    'Ueber die Schaltflaechen in der Mail wird direkt entschieden.',
  ];
  const pdf = _demoPdfBauen(_demoLatin((p && p.title) || 'Regelwerk') + ' (Vorfuehrung)', zeilen);
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: DEMO_DOK.name,
    contentType: 'application/pdf',
    contentBytes: btoa(pdf),
  };
}

/* ═══════════════════════════════════════════════════
   Persistenz: Vorführdaten überleben den Seitenwechsel
   ═══════════════════════════════════════════════════
   Sonst liefen die Entscheidungs-Schaltflächen aus dem Postfach ins Leere:
   Outlook öffnet einen neuen Tab, und der kennt den Arbeitsspeicher der
   Vorführung nicht. */

const DEMO_SPEICHER = 'rms_demo_daten';
const DEMO_HALTBAR = 12 * 60 * 60 * 1000;   // 12 Stunden

function _demoSpeichern() {
  try {
    localStorage.setItem(DEMO_SPEICHER, JSON.stringify({ am: Date.now(), daten: DemoDaten }));
  } catch (e) { /* Speicher voll oder gesperrt – die Vorführung läuft trotzdem */ }
}

/** @returns true, wenn ein brauchbarer Stand wiederhergestellt wurde */
function _demoWiederherstellen() {
  try {
    const roh = localStorage.getItem(DEMO_SPEICHER);
    if (!roh) return false;
    const o = JSON.parse(roh);
    if (!o || !o.daten || (Date.now() - (o.am || 0)) > DEMO_HALTBAR) { _demoVergessen(); return false; }
    Object.assign(DemoDaten, o.daten);
    return Array.isArray(DemoDaten.policies) && DemoDaten.policies.length > 0;
  } catch (e) { return false; }
}

function _demoVergessen() {
  try { localStorage.removeItem(DEMO_SPEICHER); } catch (e) { /* egal */ }
}

/* ═══════════════════════════════════════════════════
   Ersatz für die SharePoint-Schicht
═══════════════════════════════════════════════════ */

function _demoKlon(o) { return JSON.parse(JSON.stringify(o)); }

function _demoStubs() {
  const g = window;

  g.spMissingPolicyColumns = () => [];
  g.spMissingAckColumns    = () => [];

  g.spLoadAccessConfig = async () => _demoConfig();
  g.spSaveAccessConfig = async () => { toast('Vorführung: Einstellungen werden nicht gespeichert.'); };

  g.spGetPolicies = async () => DemoDaten.policies.map(_demoKlon);

  g.spSavePolicy = async (p) => {
    const rein = _demoKlon(p);
    rein.modifiedAt = new Date().toISOString();
    const i = DemoDaten.policies.findIndex(x => String(x.id) === String(rein.id));
    if (rein.id && i >= 0) {
      DemoDaten.policies[i] = { ...DemoDaten.policies[i], ...rein };
      _demoSpeichern();
      return { id: rein.id };
    }
    rein.id = String(DemoDaten.naechsteId++);
    // Neue Regelwerke bekommen das Vorführdokument, damit die Mails an Prüfer und
    // Geschäftsleitung wie im Betrieb einen Anhang und eine Fundstelle tragen.
    if (rein.typ !== 'Konzept' && !rein.dokumentItemId) Object.assign(rein, _demoDokFelder());
    DemoDaten.policies.push(rein);
    _demoSpeichern();
    return { id: rein.id };
  };

  g.spGetPolicyMeta = async (id) => {
    const p = DemoDaten.policies.find(x => String(x.id) === String(id));
    return p ? { modifiedAt: p.modifiedAt, modifiedBy: (State.user && State.user.name) || '' } : null;
  };

  g.spDeletePolicy = async (id) => {
    DemoDaten.policies = DemoDaten.policies.filter(x => String(x.id) !== String(id));
  };

  g.spSetPolicyReview = async (id, iso) => {
    const p = DemoDaten.policies.find(x => String(x.id) === String(id));
    if (p) p.naechsteReview = iso || '';
  };

  g.spGetAcknowledgements = async (upn) => DemoDaten.acks
    .filter(a => !upn || a.benutzerUpn.toLowerCase() === String(upn).toLowerCase())
    .map(_demoKlon);

  g.spSaveAcknowledgement = async (a) => {
    const rein = _demoKlon(a);
    const i = DemoDaten.acks.findIndex(x => String(x.id) === String(rein.id));
    if (rein.id && i >= 0) { DemoDaten.acks[i] = { ...DemoDaten.acks[i], ...rein }; return { id: rein.id }; }
    rein.id = 'a' + DemoDaten.naechsteId++;
    DemoDaten.acks.push(rein);
    _demoSpeichern();
    return { id: rein.id };
  };

  // Mitarbeiterliste: echte Kolleg:innen plus die erfundenen Demo-Rollen
  const echteMitglieder = g.spGetMembers;
  g.spGetMembers = async () => {
    let echte = [];
    try { echte = await echteMitglieder(); } catch (e) { echte = []; }
    return [..._demoKlon(DEMO_TEAM), ...echte];
  };

  // Dokumentablage gibt es in der Vorführung nicht – freundlich abfangen.
  g.spUploadPolicyDoc = async () => { toast('Vorführung: Es wird keine Datei hochgeladen.'); return null; };
  // Echter Anhang: Prüfer und Geschäftsleitung sollen die Datei vor sich haben.
  g.spGetDocAttachment = async (driveId, itemId) => {
    if (driveId !== DEMO_DOK.driveId && itemId !== DEMO_DOK.itemId) return null;
    const p = DemoDaten.policies.find(x => x.dokumentItemId === DEMO_DOK.itemId
      && x.status !== 'Veröffentlicht') || DemoDaten.policies[0] || null;
    try { return _demoAnhang(p); } catch (e) { console.warn('[demo] PDF-Anhang:', e.message); return null; }
  };

  // Mailversand umlenken (siehe _demoSendMail)
  if (!_demoEchtSendMail) _demoEchtSendMail = g.spSendMail;
  g.spSendMail = _demoSendMail;
}

/* ═══════════════════════════════════════════════════
   Mailversand: echt, aber ausschließlich an das eigene Postfach
═══════════════════════════════════════════════════ */

function _demoMailHinweis(anUrspruenglich, ccUrspruenglich) {
  const liste = (a) => (Array.isArray(a) ? a : [a]).filter(Boolean).join(', ');
  return `
  <div style="border:2px solid #f08300;background:#fff7ed;border-radius:8px;padding:11px 14px;margin:0 0 16px;
    font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.6;color:#7c2d12">
    <b>Testnachricht aus dem Vorführmodus des Regelwerk-Managements.</b><br>
    Diese Mail wurde erzeugt, um die Mailstrecke zu prüfen. Es liegt <b>kein echter Vorgang</b> zugrunde –
    bitte nichts veranlassen.<br>
    Im Echtbetrieb ginge sie an: <b>${esc(liste(anUrspruenglich)) || '–'}</b>${ccUrspruenglich && liste(ccUrspruenglich) ? ` (Cc: ${esc(liste(ccUrspruenglich))})` : ''}.
  </div>`;
}

/**
 * Ersatz für spSendMail im Vorführmodus.
 * Versendet wirklich – aber nur an die vorführende Person – und legt die Nachricht
 * zusätzlich im Postausgang ab, damit die Schaltflächen darin bedienbar bleiben.
 */
async function _demoSendMail(toUpns, subject, htmlBody, attachments, ccUpns, extraDomains) {
  const ich = _demoIch();
  const betreff = '[RMS-Vorführung] ' + String(subject || '');
  // Die Schaltflächen in der Mail müssen zurück in die Vorführung führen, nicht
  // in den Echtbetrieb – dort gäbe es die Vorgangsnummer gar nicht.
  const html = _demoMailHinweis(toUpns, ccUpns) + _demoLinksUmbiegen(htmlBody || '');

  let versendet = false, fehler = '';
  if (_demoMailEcht && ich) {
    try {
      versendet = await _demoEchtSendMail([ich], betreff, html, attachments, [], extraDomains);
    } catch (e) {
      fehler = e.message || String(e);
      console.warn('[demo] Mailversand fehlgeschlagen:', fehler);
    }
  }

  DemoDaten.mails.unshift({
    an: Array.isArray(toUpns) ? toUpns : [toUpns],
    betreff: String(subject || ''),
    anhaenge: (attachments || []).map(a => a && a.name).filter(Boolean),
    am: new Date().toISOString(),
    versendetAn: versendet ? ich : '',
    fehler,
  });
  if (DemoDaten.mails.length > 30) DemoDaten.mails.length = 30;
  _demoSpeichern();
  _demoBannerAktualisieren();

  if (fehler) toast('Vorführung: Mail konnte nicht versendet werden – ' + fehler, 'error');
  else if (versendet) toast('Testmail an dich versendet ✓ – im Outlook ansehen'
    + ((attachments || []).length ? ' (mit Anhang)' : ''), 'success');
  return true;
}

/** Deep-Links in der Mail um ?demo=1 ergänzen, damit sie in der Vorführung landen. */
function _demoLinksUmbiegen(html) {
  return String(html).replace(/(https:\/\/rms\.dihag\.de\/)\?/g, '$1?demo=1&');
}

/** Echten Versand an-/abschalten. */
function demoMailSchalter(an) {
  _demoMailEcht = !!an;
  toast(_demoMailEcht ? 'Testmails werden an dich versendet.' : 'Mailversand aus – Nachrichten nur im Postausgang.');
  _demoBannerAktualisieren();
}

/* ═══════════════════════════════════════════════════
   Hinweisstreifen + Postausgang
═══════════════════════════════════════════════════ */

function _demoBanner() {
  if (document.getElementById('demo-banner')) return;
  const b = document.createElement('div');
  b.id = 'demo-banner';
  b.className = 'demo-banner';
  b.innerHTML = `
    <span class="demo-dot" aria-hidden="true"></span>
    <b>Vorführ- und Testmodus</b>
    <span class="demo-banner-text">Erfundene Daten – nichts wird in SharePoint gespeichert.
      Test-E-Mails gehen an dein Postfach: <b id="demo-mailzahl">0</b> bisher – ansehen in Outlook.</span>
    <label class="demo-switch" title="Testmails wirklich versenden">
      <input type="checkbox" id="demo-mail-an" checked onchange="demoMailSchalter(this.checked)"> Mailversand
    </label>
    <button class="demo-banner-btn" onclick="tourStart()">▶ Geführte Vorführung</button>
    <button class="demo-banner-btn" onclick="demoSelbsttest()">✓ Selbsttest</button>
    <button class="demo-banner-btn" onclick="demoBeenden()">Beenden</button>`;
  document.body.appendChild(b);
  document.body.classList.add('demo-mode');
  _demoBannerAktualisieren();
}

function _demoBannerAktualisieren() {
  const el = document.getElementById('demo-mailzahl');
  if (el) el.textContent = String(DemoDaten.mails.length);
}

/* ═══════════════════════════════════════════════════
   Selbsttest: die Kette einmal automatisch durchspielen
═══════════════════════════════════════════════════ */

const _demoPruef = [];

function _demoOk(name, bedingung, detail) {
  _demoPruef.push({ name, ok: !!bedingung, detail: detail || '' });
  return !!bedingung;
}

/**
 * Spielt Konzept → Entwurf → Prüfung → Mitbestimmung → Freigabe → Kenntnisnahme
 * ohne Zutun durch und prüft nach jedem Schritt den Zustand. Ergebnis als Bericht.
 * Nützlich nach jedem Deployment: zeigt in einem Durchlauf, ob Workflow,
 * Historie und Mailstrecke tragen.
 */
async function demoSelbsttest() {
  if (!_demoAn) { toast('Der Selbsttest läuft nur im Vorführmodus.', 'error'); return; }
  _demoPruef.length = 0;
  const titel = 'Selbsttest ' + new Date().toLocaleTimeString('de-DE');
  const mailsVorher = DemoDaten.mails.length;

  toast('Selbsttest läuft …');
  try {
    // 1) Konzept anlegen und einreichen
    const k = newKonzept();
    k.title = titel;
    k.regelwerkTyp = 'Konzernrichtlinie';
    k.kategorie = 'IT-Sicherheit';
    k.geltungsbereich = ['ALLE'];
    k.konzept.motivation = 'Automatischer Selbsttest der Prozesskette.';
    k.konzept.prioritaet = 'hoch';
    const gespeichert = await spSavePolicy(k);
    _demoOk('Konzept anlegen', !!(gespeichert && gespeichert.id));
    await reloadData();

    const kAngelegt = (State.konzepte || []).find(x => x.title === titel);
    _demoOk('Konzept in der Liste', !!kAngelegt);
    if (!kAngelegt) return _demoBericht(titel);

    await konzeptSubmitGF(kAngelegt.id);
    const kEing = (State.konzepte || []).find(x => x.title === titel);
    _demoOk('Konzept eingereicht', !!(kEing && kEing.konzept && kEing.konzept.eingereichtAm));
    _demoOk('Mail an die Geschäftsleitung erzeugt', DemoDaten.mails.length > mailsVorher,
      DemoDaten.mails[0] ? DemoDaten.mails[0].betreff : '');
    const ersteMail = DemoDaten.mails[0];
    if (_demoMailEcht) {
      _demoOk('Mailversand über Microsoft Graph', !!(ersteMail && ersteMail.versendetAn),
        ersteMail && ersteMail.fehler ? ersteMail.fehler : 'an ' + (ersteMail ? ersteMail.versendetAn : ''));
    }

    // 2) Annahme (ohne Rückfrage – wir bauen den Entwurf direkt)
    const rw = newPolicy();
    rw.title = titel;
    rw.kategorie = kEing.kategorie;
    rw.regelwerkTyp = kEing.regelwerkTyp;
    rw.geltungsbereich = kEing.geltungsbereich.slice();
    rw.status = 'Entwurf';
    rw.kbrBetroffen = true;
    rw.pruefKonfig = { pruefer: [_demoIch()], schwelle: 'einer' };
    const rwSaved = await spSavePolicy(rw);
    _demoOk('Regelwerk-Entwurf aus dem Konzept', !!(rwSaved && rwSaved.id));
    await reloadData();
    const rwId = rwSaved.id;

    // 3) Konformitätsprüfung
    await setStatus(rwId, 'Konformitätsprüfung', 'Selbsttest');
    await reloadData();
    _demoOk('Status Konformitätsprüfung', _demoStatus(rwId) === 'Konformitätsprüfung');

    await markKonform(rwId, true);
    await reloadData();
    _demoOk('Konformität bestätigt', (_demoPolicy2(rwId).konformitaet || []).length > 0);

    // 4) Mitbestimmung
    const nachKonform = _demoPolicy2(rwId);
    if (mitbestimmungPflicht(nachKonform)) {
      await markMitbestimmung(rwId, true);
      await reloadData();
      _demoOk('Mitbestimmung bestätigt', mitbestimmungBestaetigt(_demoPolicy2(rwId)));
    }

    // 5) Freigabe
    await markFreigabe(rwId);
    await reloadData();
    _demoOk('Freigegeben und veröffentlicht', _demoStatus(rwId) === 'Veröffentlicht');

    // 6) Kenntnisnahme
    await confirmRead(rwId);
    await reloadAcks();
    _demoOk('Kenntnisnahme gespeichert',
      (State.acks || []).some(a => String(a.richtlinieId) === String(rwId)));

    // 7) Nachweis
    const fertig = _demoPolicy2(rwId);
    _demoOk('Änderungshistorie geschrieben', (fertig.historie || []).length >= 3,
      (fertig.historie || []).length + ' Einträge');
    _demoOk('Geltungsbereich erhalten', (fertig.geltungsbereich || []).length > 0);
    _demoOk('Dokumentart erhalten', !!fertig.regelwerkTyp);
  } catch (e) {
    _demoOk('Durchlauf ohne Fehler', false, e.message || String(e));
  }
  _demoBericht(titel);
}

function _demoPolicy2(id) {
  return (State.policies || []).find(p => String(p.id) === String(id)) || {};
}
function _demoStatus(id) { return _demoPolicy2(id).status || ''; }

function _demoBericht(titel) {
  const rot = _demoPruef.filter(p => !p.ok).length;
  const zeilen = _demoPruef.map(p => `
    <div style="display:flex;gap:9px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--c-border-2)">
      <span style="color:${p.ok ? 'var(--c-success)' : 'var(--c-danger)'};font-weight:700">${p.ok ? '✓' : '✗'}</span>
      <div>
        <div style="font-size:.86rem">${esc(p.name)}</div>
        ${p.detail ? `<div class="field-hint">${esc(p.detail)}</div>` : ''}
      </div>
    </div>`).join('');

  openModal(`
    <div class="modal-header">
      <h3>Selbsttest – ${rot ? rot + ' von ' + _demoPruef.length + ' fehlgeschlagen' : _demoPruef.length + ' Prüfungen bestanden'}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div style="padding:10px 13px;border-radius:8px;margin-bottom:14px;
        background:${rot ? '#fef2f2' : '#f0fdf4'};border-left:3px solid ${rot ? 'var(--c-danger)' : 'var(--c-success)'}">
        <b>${rot ? 'Es gibt Abweichungen.' : 'Die Prozesskette trägt.'}</b>
        <div class="field-hint" style="margin-top:3px">Durchlauf „${esc(titel)}" – Konzept, Prüfung,
        Mitbestimmung, Freigabe, Kenntnisnahme und Nachweis in einem Zug.</div>
      </div>
      ${zeilen}
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEMO_TEAM };
}
