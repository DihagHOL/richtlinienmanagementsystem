/**
 * SharePoint / Microsoft Graph Datenschicht
 * =========================================
 * App-Daten (Listen + access-config) auf der App-Site (Default: sites/IT).
 * Richtliniendokumente bleiben in der ISMS-Bibliothek (sites/ISMS) und werden
 * nur gelesen/eingebettet.
 *
 * Graph-Helper & availableFields-Muster übernommen aus e-rechnung/js/sharepoint.js.
 */

const SP = {
  graphBase: 'https://graph.microsoft.com/v1.0',

  // ── App-Site: hier liegen die App-Listen + access-config.json ──
  appSiteHost:  'dihag.sharepoint.com:/sites/IT',
  policyList:   'Richtlinien',
  ackList:      'Bestaetigungen',
  courseList:   'Kurse',            // optional (Beta)
  proposalList: 'Aenderungsvorschlaege',   // Änderungsvorschläge (wird bei Bedarf angelegt)
  riskList:     'Risiken',                 // Risiko-Register (wird bei Bedarf angelegt)
  configFolder: 'Richtlinienmanagement',   // Unterordner in der Dokumentbibliothek

  // ── ISMS-Quelle: Richtliniendokumente (nur Lesezugriff) ──
  ismsSiteHost: 'dihag.sharepoint.com:/sites/ISMS',
  assetsList:   'Assets',                  // Asset-/Werte-Inventar auf der ISMS-Site (nur lesen)

  scopes: [
    'https://graph.microsoft.com/Sites.ReadWrite.All',
    'https://graph.microsoft.com/Files.ReadWrite.All',
    'https://graph.microsoft.com/User.Read.All',
  ],
};

/** Browser-URL der App-Site (dort liegen die meisten App-Listen), z. B.
 *  https://dihag.sharepoint.com/sites/IT – für Hinweise/Links beim manuellen Anlegen. */
function spAppSiteUrl() { return 'https://' + SP.appSiteHost.replace(':/', '/'); }
/** Browser-URL der ISMS-Site (dort liegt bewusst die Risiken-Liste), z. B.
 *  https://dihag.sharepoint.com/sites/ISMS. */
function spIsmsSiteUrl() { return 'https://' + SP.ismsSiteHost.replace(':/', '/'); }
/** Browser-URL der ISMS-Liste „Assets" (Asset-Inventar). */
function spAssetsListUrl() { return spIsmsSiteUrl() + '/Lists/' + encodeURIComponent(SP.assetsList) + '/AllItems.aspx'; }

const _sp = {
  appSiteId: null, policyListId: null, ackListId: null, appDriveId: null,
  courseListId: null, proposalListId: null, riskListId: null,
  ismsSiteId: null,
  ismsDriveId: null, ismsDriveName: null, ismsDriveWebUrl: null, ismsListId: null, ismsColMeta: null,   // ISMS-Dokumentbibliothek (lazy)
  policyFields: new Set(['Title']),
  policyColumns: [],   // [{name, displayName}] – für Auflösung interner Namen (SharePoint benennt interne Namen bei Umbenennung NICHT um)
  ackFields: new Set(['Title']),
  courseFields: new Set(['Title']),
  ready: false,
};

/* Erwartete Spalten der Liste „Richtlinien" (für die Fehlende-Spalten-Warnung). */
const POLICY_COLUMNS = [
  { name: 'Beschreibung',        typ: 'Mehrere Zeilen Text' },
  { name: 'Kategorie',           typ: 'Einzelne Textzeile oder Auswahl' },
  { name: 'DokumentName',        typ: 'Einzelne Textzeile' },
  { name: 'DokumentDriveId',     typ: 'Einzelne Textzeile' },
  { name: 'DokumentItemId',      typ: 'Einzelne Textzeile' },
  { name: 'DokumentUrl',         typ: 'Mehrere Zeilen Text' },
  { name: 'Version1',            typ: 'Einzelne Textzeile' },
  { name: 'Status',              typ: 'Auswahl (Entwurf/InReview/Veröffentlicht/Archiviert)' },
  { name: 'Pflicht',             typ: 'Ja/Nein' },
  { name: 'QuizErforderlich',    typ: 'Ja/Nein' },
  { name: 'QuizBestehenProzent', typ: 'Zahl' },
  { name: 'QuizJson',            typ: 'Mehrere Zeilen Text' },
  { name: 'Zielgruppen',         typ: 'Mehrere Zeilen Text' },
  { name: 'WiederholungMonate',  typ: 'Zahl (0 = keine Wiederholung)' },
  { name: 'NaechsteReview',      typ: 'Datum und Uhrzeit' },
  { name: 'VeroeffentlichtAm',   typ: 'Datum und Uhrzeit' },
  { name: 'FreigegebenVon',      typ: 'Einzelne Textzeile' },
  { name: 'KonformitaetJson',    typ: 'Mehrere Zeilen Text' },
  { name: 'FreigabeJson',        typ: 'Mehrere Zeilen Text' },
  { name: 'PruefungSeit',        typ: 'Datum und Uhrzeit' },
  { name: 'NormbezugJson',       typ: 'Mehrere Zeilen Text' },
  { name: 'PruefKonfigJson',     typ: 'Mehrere Zeilen Text' },
  { name: 'FreigabeKonfigJson',  typ: 'Mehrere Zeilen Text' },
  { name: 'MitbestimmungJson',   typ: 'Mehrere Zeilen Text' },
  { name: 'Typ2',                typ: 'Auswahl (Regelwerk/Konzept)' },
  { name: 'KonzeptJson',         typ: 'Mehrere Zeilen Text' },
];

/** Eine Spalte gilt als vorhanden, wenn ihr interner Name ODER ihr Anzeigename passt
 *  (SharePoint ändert den internen Namen bei Umbenennung nicht – Anzeigename „Typ2"
 *  kann also einen abweichenden internen Namen haben). Vergleich case-insensitiv. */
function _policyHasColumn(expected) {
  const want = String(expected).toLowerCase();
  return (_sp.policyColumns || []).some(c =>
    String(c.name).toLowerCase() === want || String(c.displayName || '').toLowerCase() === want);
}

/** Liefert den tatsächlichen internen Feldnamen zu einem erwarteten Namen
 *  (per internem Namen oder Anzeigenamen). Fallback: der erwartete Name selbst. */
function _policyFieldName(expected) {
  const want = String(expected).toLowerCase();
  const hit = (_sp.policyColumns || []).find(c =>
    String(c.name).toLowerCase() === want || String(c.displayName || '').toLowerCase() === want);
  return hit ? hit.name : expected;
}

/** Welche erwarteten Spalten fehlen in der Liste „Richtlinien"? (nach spInit) */
function spMissingPolicyColumns() {
  return POLICY_COLUMNS.filter(c => !_policyHasColumn(c.name));
}

/* Erwartete Spalten der Liste „Bestaetigungen". */
const ACK_COLUMNS = [
  { name: 'RichtlinieId',       typ: 'Einzelne Textzeile' },
  { name: 'RichtlinienVersion', typ: 'Einzelne Textzeile' },
  { name: 'BenutzerUPN',        typ: 'Einzelne Textzeile' },
  { name: 'BenutzerName',       typ: 'Einzelne Textzeile' },
  { name: 'GelesenAm',          typ: 'Datum und Uhrzeit' },
  { name: 'QuizBestanden',      typ: 'Ja/Nein' },
  { name: 'QuizScore',          typ: 'Zahl' },
  { name: 'QuizVersuche',       typ: 'Zahl' },
  { name: 'AbgeschlossenAm',    typ: 'Datum und Uhrzeit' },
];

/** Welche erwarteten Spalten fehlen in der Liste „Bestaetigungen"? */
function spMissingAckColumns() {
  return ACK_COLUMNS.filter(c => !_sp.ackFields.has(c.name));
}

/* ═══════════════════════════════════════════════════
   Initialisierung
═══════════════════════════════════════════════════ */

async function spInit() {
  if (_sp.ready) return;
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Kein Token – Anmeldung erforderlich.');

  // App-Site
  const site = await _get(`${SP.graphBase}/sites/${SP.appSiteHost}`, token);
  _sp.appSiteId = site.id;

  // Listen
  _sp.policyListId = await _findListId(token, SP.policyList);
  _sp.ackListId    = await _findListId(token, SP.ackList);
  try { _sp.courseListId = await _findListId(token, SP.courseList); } catch (e) { _sp.courseListId = null; }

  // Dokumentbibliothek (für access-config.json)
  const drives = await _get(`${SP.graphBase}/sites/${_sp.appSiteId}/drives`, token);
  const docDrive = (drives.value || []).find(d =>
    ['Dokumente', 'Documents', 'Freigegebene Dokumente', 'Shared Documents'].includes(d.name)
  ) || drives.value?.[0];
  if (docDrive) _sp.appDriveId = docDrive.id;

  // Spalten beider Listen (nur vorhandene Felder schreiben → keine 400er)
  try {
    const cols = await _get(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.policyListId}/columns`, token);
    _sp.policyColumns = (cols.value || []).map(c => ({ name: c.name, displayName: c.displayName || c.name }));
    (cols.value || []).forEach(c => _sp.policyFields.add(c.name));
  } catch (e) {
    console.warn('[sp] Spalten der Richtlinien-Liste nicht lesbar:', e.message);
  }
  try {
    const cols = await _get(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.ackListId}/columns`, token);
    (cols.value || []).forEach(c => _sp.ackFields.add(c.name));
  } catch (e) {
    console.warn('[sp] Spalten der Bestaetigungen-Liste nicht lesbar:', e.message);
  }
  if (_sp.courseListId) {
    try {
      const cols = await _get(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.courseListId}/columns`, token);
      (cols.value || []).forEach(c => _sp.courseFields.add(c.name));
    } catch (e) { /* optional */ }
  }

  _sp.ready = true;
}

async function _findListId(token, displayName) {
  const lists = await _get(
    `${SP.graphBase}/sites/${_sp.appSiteId}/lists?$filter=displayName eq '${encodeURIComponent(displayName)}'`,
    token
  );
  if (!lists.value?.length) {
    throw new Error(`SharePoint-Liste "${displayName}" nicht gefunden (Site ${SP.appSiteHost}).`);
  }
  return lists.value[0].id;
}

/* ═══════════════════════════════════════════════════
   Änderungsvorschläge (eigene SharePoint-Liste, bei Bedarf angelegt)
═══════════════════════════════════════════════════ */

const PROPOSAL_STATUS = ['Offen', 'In Bearbeitung', 'Erledigt', 'Abgelehnt'];
let _proposalCols = null;   // Set vorhandener interner Spaltennamen (Spalten-Toleranz beim Schreiben)

/** Normalisierung für Listen-Namensvergleich (Umlaut-/Schreibweise-tolerant). */
function _normName(s) {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}

/** Vorhandene Spalten der Vorschlags-Liste laden (für spaltentolerantes Schreiben). */
async function _loadProposalCols(token) {
  try {
    const cols = await _get(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.proposalListId}/columns?$select=name`, token);
    _proposalCols = new Set((cols.value || []).map(c => c.name));
  } catch (e) { _proposalCols = null; }
}

/** Vorschlags-Liste robust finden (Schreibweise/Umlaut-tolerant) – oder anlegen. */
async function spEnsureProposalList(create = true) {
  if (_sp.proposalListId) return _sp.proposalListId;
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  // 1) Alle Listen durchsuchen (zuverlässiger als $filter) – normalisierter Name oder „…vorschläge"-Muster
  const target = _normName(SP.proposalList);   // 'aenderungsvorschlaege'
  let url = `${SP.graphBase}/sites/${_sp.appSiteId}/lists?$select=id,displayName,name&$top=200`;
  try {
    while (url) {
      const r = await _get(url, token);
      const hit = (r.value || []).find(l => {
        const dn = _normName(l.displayName), nm = _normName(l.name);
        return dn === target || nm === target || /vorschl/.test(dn) || /vorschl/.test(nm);
      });
      if (hit) { _sp.proposalListId = hit.id; await _loadProposalCols(token); return _sp.proposalListId; }
      url = r['@odata.nextLink'] || null;
    }
  } catch (e) { /* weiter → ggf. anlegen */ }
  if (!create) return null;
  const body = {
    displayName: SP.proposalList,
    list: { template: 'genericList' },
    columns: [
      { name: 'Betreff', text: {} },
      { name: 'Vorschlag', text: { allowMultipleLines: true } },
      { name: 'Begruendung', text: { allowMultipleLines: true } },
      { name: 'DokumentLink', text: {} },
      { name: 'Eingereicht', text: {} },
      { name: 'Empfaenger', text: {} },
      { name: 'Quelle', text: {} },
      { name: 'Status', choice: { choices: PROPOSAL_STATUS } },
      { name: 'Bearbeiterkommentar', text: { allowMultipleLines: true } },
    ],
  };
  const created = await _post(`${SP.graphBase}/sites/${_sp.appSiteId}/lists`, token, body);
  _sp.proposalListId = created.id;
  await _loadProposalCols(token);
  return _sp.proposalListId;
}

/** Einen Änderungsvorschlag in der Liste ablegen (best effort – wirft bei Fehler).
 *  Sendet nur Felder, deren Spalten existieren → keine 400er bei Teil-Listen. */
async function spAddProposal(p) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const listId = await spEnsureProposalList(true);
  const all = {
    Title: String(p.titel || 'Änderungsvorschlag').slice(0, 255),
    Betreff: String(p.betreff || '').slice(0, 255),
    Vorschlag: p.vorschlag || '',
    Begruendung: p.begruendung || '',
    DokumentLink: String(p.link || '').slice(0, 255),
    Eingereicht: String(p.eingereicht || '').slice(0, 255),
    Empfaenger: String(p.empfaenger || '').slice(0, 255),
    Quelle: String(p.quelle || '').slice(0, 60),
    Status: 'Offen',
  };
  const fields = {};
  for (const [k, v] of Object.entries(all)) {
    if (k === 'Title' || !_proposalCols || _proposalCols.has(k)) fields[k] = v;   // nur vorhandene Spalten
  }
  return _post(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${listId}/items`, token, { fields });
}

/** Alle Vorschläge laden (neueste zuerst). */
async function spGetProposals() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  const listId = await spEnsureProposalList(true);
  const out = [];
  let url = `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${listId}/items?$expand=fields&$top=200`;
  while (url) {
    const resp = await _get(url, token);
    for (const it of (resp.value || [])) {
      const f = it.fields || {};
      out.push({
        id: it.id, titel: f.Title || '', betreff: f.Betreff || '', vorschlag: f.Vorschlag || '',
        begruendung: f.Begruendung || '', link: f.DokumentLink || '', eingereicht: f.Eingereicht || '',
        empfaenger: f.Empfaenger || '', quelle: f.Quelle || '', status: f.Status || 'Offen', kommentar: f.Bearbeiterkommentar || '',
        created: it.createdDateTime || f.Created || '',
      });
    }
    url = resp['@odata.nextLink'] || null;
  }
  out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return out;
}

/** Status/Kommentar eines Vorschlags aktualisieren. */
async function spUpdateProposal(id, fields) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const listId = await spEnsureProposalList(false);
  if (!listId) throw new Error('Vorschlags-Liste nicht verfügbar.');
  const send = {};
  for (const [k, v] of Object.entries(fields)) { if (!_proposalCols || _proposalCols.has(k)) send[k] = v; }
  if (!Object.keys(send).length) throw new Error('Spalten Status/Bearbeiterkommentar fehlen in der Liste.');
  return _patch(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${listId}/items/${id}/fields`, token, send);
}

/* ═══════════════════════════════════════════════════
   Richtlinien
═══════════════════════════════════════════════════ */

async function spGetPolicies() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  await spInit();
  const items = await _getAll(
    `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.policyListId}/items` +
    `?$expand=fields&$top=500`, token
  );
  return items.map(_mapPolicy)
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
}

function _mapPolicy(item) {
  const f = item.fields || {};
  let quiz = [];
  try { quiz = f.QuizJson ? JSON.parse(f.QuizJson) : []; } catch { quiz = []; }
  let zielgruppen = [];
  try { zielgruppen = f.Zielgruppen ? JSON.parse(f.Zielgruppen) : []; } catch { zielgruppen = []; }
  let konformitaet = [];
  try { konformitaet = f.KonformitaetJson ? JSON.parse(f.KonformitaetJson) : []; } catch { konformitaet = []; }
  let freigaben = [];
  try { freigaben = f.FreigabeJson ? JSON.parse(f.FreigabeJson) : []; } catch { freigaben = []; }
  let normbezug = [];
  try { normbezug = f.NormbezugJson ? JSON.parse(f.NormbezugJson) : []; } catch { normbezug = []; }
  let pruefKonfig = { pruefer: [], schwelle: '' };
  try {
    if (f.PruefKonfigJson) {
      const pk = JSON.parse(f.PruefKonfigJson);
      pruefKonfig = { pruefer: Array.isArray(pk.pruefer) ? pk.pruefer : [], schwelle: (pk.schwelle === 'alle' || pk.schwelle === 'einer') ? pk.schwelle : '' };
    }
  } catch { pruefKonfig = { pruefer: [], schwelle: '' }; }
  let freigabeKonfig = { freigeber: [], schwelle: '' };
  try {
    if (f.FreigabeKonfigJson) {
      const fk = JSON.parse(f.FreigabeKonfigJson);
      freigabeKonfig = { freigeber: Array.isArray(fk.freigeber) ? fk.freigeber : [], schwelle: (fk.schwelle === 'alle' || fk.schwelle === 'einer') ? fk.schwelle : '' };
    }
  } catch { freigabeKonfig = { freigeber: [], schwelle: '' }; }
  let kbrBetroffen = false, mitbestimmungWerke = [], mitbestimmung = null, freigabeReihenfolge = 'gl_mb';
  try {
    if (f.MitbestimmungJson) {
      const mb = JSON.parse(f.MitbestimmungJson);
      kbrBetroffen = mb.kbrBetroffen === true;
      mitbestimmungWerke = Array.isArray(mb.werke) ? mb.werke : [];
      mitbestimmung = (mb.bestaetigung && typeof mb.bestaetigung === 'object') ? mb.bestaetigung : null;
      freigabeReihenfolge = (mb.reihenfolge === 'mb_gl') ? 'mb_gl' : 'gl_mb';
    }
  } catch { kbrBetroffen = false; mitbestimmungWerke = []; mitbestimmung = null; freigabeReihenfolge = 'gl_mb'; }
  const typVal = f[_policyFieldName('Typ2')];
  const typ = (typVal === 'Konzept') ? 'Konzept' : 'Regelwerk';
  let konzept = null;
  const konzeptRaw = f[_policyFieldName('KonzeptJson')];
  try { if (konzeptRaw) konzept = JSON.parse(konzeptRaw); } catch { konzept = null; }
  return {
    typ,
    konzept: (konzept && typeof konzept === 'object') ? konzept : null,
    id:                  item.id,
    title:               f.Title || '',
    beschreibung:        f.Beschreibung || '',
    kategorie:           f.Kategorie || '',
    dokumentUrl:         _linkVal(f.DokumentUrl),
    dokumentName:        f.DokumentName || '',
    dokumentDriveId:     f.DokumentDriveId || '',
    dokumentItemId:      f.DokumentItemId || '',
    version:             f.Version1 || '1.0',
    status:              f.Status || 'Entwurf',
    pflicht:             f.Pflicht !== false,            // Default: Pflicht
    quizErforderlich:    !!f.QuizErforderlich && quiz.length > 0,
    quizBestehenProzent: Number(f.QuizBestehenProzent || 80),
    quiz,
    zielgruppen,
    wiederholungMonate:  Number(f.WiederholungMonate || 0),
    naechsteReview:      f.NaechsteReview || '',
    veroeffentlichtAm:   f.VeroeffentlichtAm || '',
    freigegebenVon:      f.FreigegebenVon || '',
    konformitaet,
    freigaben,
    normbezug:           Array.isArray(normbezug) ? normbezug : [],
    pruefKonfig,
    freigabeKonfig,
    kbrBetroffen,
    mitbestimmungWerke,
    mitbestimmung,
    freigabeReihenfolge,
    pruefungSeit:        f.PruefungSeit || '',
    modifiedAt:          item.lastModifiedDateTime || '',
  };
}

/** Hyperlink-Felder kommen als {Url,Description}, Textfelder als String. */
function _linkVal(v) { return (v && typeof v === 'object') ? (v.Url || '') : (v || ''); }

/**
 * Richtlinie anlegen (ohne id) oder aktualisieren (mit id).
 * @returns das gespeicherte Item
 */
async function spSavePolicy(p) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await spInit();

  const all = {
    Title:               (p.title || '').slice(0, 255),
    Beschreibung:        p.beschreibung || '',
    Kategorie:           p.kategorie || '',
    DokumentUrl:         p.dokumentUrl || '',
    DokumentName:        (p.dokumentName || '').slice(0, 255),
    DokumentDriveId:     p.dokumentDriveId || '',
    DokumentItemId:      p.dokumentItemId || '',
    Version1:            (p.version || '1.0').slice(0, 50),
    Status:              p.status || 'Entwurf',
    Pflicht:             p.pflicht !== false,
    QuizErforderlich:    !!p.quizErforderlich,
    QuizBestehenProzent: Number(p.quizBestehenProzent || 80),
    QuizJson:            JSON.stringify(p.quiz || []),
    Zielgruppen:         JSON.stringify(p.zielgruppen || []),
    WiederholungMonate:  Number(p.wiederholungMonate || 0),
    NaechsteReview:      p.naechsteReview || '',
    VeroeffentlichtAm:   p.veroeffentlichtAm || '',
    FreigegebenVon:      p.freigegebenVon || '',
    KonformitaetJson:    JSON.stringify(p.konformitaet || []),
    FreigabeJson:        JSON.stringify(p.freigaben || []),
    PruefungSeit:        p.pruefungSeit || '',
    NormbezugJson:       JSON.stringify(p.normbezug || []),
    PruefKonfigJson:     JSON.stringify(p.pruefKonfig || { pruefer: [], schwelle: '' }),
    FreigabeKonfigJson:  JSON.stringify(p.freigabeKonfig || { freigeber: [], schwelle: '' }),
    MitbestimmungJson:   JSON.stringify({ kbrBetroffen: !!p.kbrBetroffen, werke: Array.isArray(p.mitbestimmungWerke) ? p.mitbestimmungWerke : [], bestaetigung: p.mitbestimmung || null, reihenfolge: (p.freigabeReihenfolge === 'mb_gl') ? 'mb_gl' : 'gl_mb' }),
    // Nur Konzepte markieren; Regelwerke lassen Typ2 leer (= Regelwerk beim Einlesen).
    // So muss die Auswahl-Spalte nur den Wert „Konzept" kennen und normale Speichervorgänge
    // brechen nicht, falls „Regelwerk" dort nicht als Auswahl hinterlegt ist.
    Typ2:                (p.typ === 'Konzept') ? 'Konzept' : '',
    KonzeptJson:         p.konzept ? JSON.stringify(p.konzept) : '',
  };
  // Werte, die nicht gesendet werden dürfen, vorab aus `all` entfernen (leere DateTimes;
  // Regelwerke lassen Typ2 leer → gar nicht senden).
  if (!all.VeroeffentlichtAm) delete all.VeroeffentlichtAm;
  if (!all.NaechsteReview)    delete all.NaechsteReview;
  if (!all.PruefungSeit)      delete all.PruefungSeit;
  if (!all.Typ2)              delete all.Typ2;
  // Auf tatsächliche interne Feldnamen abbilden (z. B. Anzeigename „Typ2" → interner Name)
  // und nur vorhandene Felder senden → keine 400er.
  const fields = {};
  for (const [k, v] of Object.entries(all)) {
    const actual = _policyFieldName(k);
    if (_sp.policyFields.has(actual)) fields[actual] = v;
  }

  if (p.id) {
    return _patch(
      `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.policyListId}/items/${p.id}/fields`,
      token, fields
    );
  }
  return _post(
    `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.policyListId}/items`,
    token, { fields }
  );
}

async function spDeletePolicy(id) {
  const token = await acquireToken(SP.scopes);
  if (!token) return;
  await spInit();
  await _del(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.policyListId}/items/${id}`, token);
}

/** Nächsten Überprüfungstermin gezielt setzen (ISO-String) oder leeren (null/'').
 *  Eigene Funktion, weil spSavePolicy leere Datumsfelder auslässt (kann also nicht leeren). */
async function spSetPolicyReview(id, iso) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await spInit();
  return _patch(
    `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.policyListId}/items/${id}/fields`,
    token, { NaechsteReview: iso || null }   // null → Feld in SharePoint leeren
  );
}

/* ═══════════════════════════════════════════════════
   Kurse (Beta) – optionale Liste „Kurse"
═══════════════════════════════════════════════════ */

const COURSE_COLUMNS = [
  { name: 'Beschreibung',   typ: 'Mehrere Zeilen Text' },
  { name: 'RichtlinienIds', typ: 'Mehrere Zeilen Text' },
  { name: 'Status',         typ: 'Auswahl (Entwurf/Veröffentlicht)' },
];
function spCoursesAvailable() { return !!_sp.courseListId; }
function spMissingCourseColumns() {
  return _sp.courseListId ? COURSE_COLUMNS.filter(c => !_sp.courseFields.has(c.name)) : [];
}

async function spGetCourses() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  await spInit();
  if (!_sp.courseListId) return [];
  const items = await _getAll(
    `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.courseListId}/items?$expand=fields&$top=200`, token);
  return items.map(item => {
    const f = item.fields || {};
    let richtlinienIds = [];
    try { richtlinienIds = f.RichtlinienIds ? JSON.parse(f.RichtlinienIds) : []; } catch { richtlinienIds = []; }
    return {
      id: item.id,
      title: f.Title || '',
      beschreibung: f.Beschreibung || '',
      richtlinienIds: richtlinienIds.map(String),
      status: f.Status || 'Entwurf',
    };
  }).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
}

async function spSaveCourse(c) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await spInit();
  if (!_sp.courseListId) throw new Error('Liste „Kurse" nicht gefunden.');
  const all = {
    Title:          (c.title || '').slice(0, 255),
    Beschreibung:   c.beschreibung || '',
    RichtlinienIds: JSON.stringify(c.richtlinienIds || []),
    Status:         c.status || 'Entwurf',
  };
  const fields = Object.fromEntries(Object.entries(all).filter(([k]) => _sp.courseFields.has(k)));
  if (c.id) return _patch(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.courseListId}/items/${c.id}/fields`, token, fields);
  return _post(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.courseListId}/items`, token, { fields });
}

async function spDeleteCourse(id) {
  const token = await acquireToken(SP.scopes);
  if (!token) return;
  await spInit();
  if (!_sp.courseListId) return;
  await _del(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.courseListId}/items/${id}`, token);
}

/* ═══════════════════════════════════════════════════
   Richtlinien-Import: Dokument hochladen (App-Bibliothek)
═══════════════════════════════════════════════════ */

/** Lädt eine Datei in die App-Dokumentbibliothek (Ordner „Richtlinien-Import") hoch. */
async function spUploadPolicyDoc(filename, bytes, contentType) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await spInit();
  if (!_sp.appDriveId) throw new Error('Keine Dokumentbibliothek gefunden.');
  const safe = String(filename || 'dokument').replace(/[<>:"/\\|?*]/g, '_');
  const res = await _uploadFile(token, `Richtlinien-Import/${safe}`, bytes, contentType || 'application/octet-stream');
  return { driveId: _sp.appDriveId, itemId: res.id, name: res.name, url: res.webUrl || '' };
}

/**
 * Ersetzt den Inhalt eines bestehenden Dokuments am selben Speicherort.
 * SharePoint legt dabei automatisch eine neue Version an (Versionsverlauf der Bibliothek).
 */
async function spReplaceDocContent(driveId, itemId, bytes, contentType) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const resp = await fetch(`${SP.graphBase}/drives/${driveId}/items/${itemId}/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType || 'application/octet-stream' },
    body: bytes,
  });
  if (!resp.ok) throw new Error(`Upload ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return resp.json();
}

/** Lädt eine Datei in einen bestimmten Ordner (folderItemId; null = Wurzel der Bibliothek). */
async function spUploadToFolder(driveId, folderItemId, filename, bytes, contentType) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const safe = String(filename || 'dokument').replace(/[<>:"/\\|?*]/g, '_');
  const url = folderItemId
    ? `${SP.graphBase}/drives/${driveId}/items/${folderItemId}:/${encodeURIComponent(safe)}:/content`
    : `${SP.graphBase}/drives/${driveId}/root:/${encodeURIComponent(safe)}:/content`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType || 'application/octet-stream' },
    body: bytes,
  });
  if (!resp.ok) throw new Error(`Upload ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return resp.json();
}

/** Bibliotheken (Drives) der App-Site (für den Zielordner-Wähler). */
async function spListAppDrives() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  await spInit();
  const drives = await _get(`${SP.graphBase}/sites/${_sp.appSiteId}/drives`, token);
  return (drives.value || []).map(d => ({ id: d.id, name: d.name }));
}

/** Ordnerinhalt eines beliebigen Drives auflisten (für den Zielordner-Wähler). */
async function spBrowseAnyDrive(driveId, itemId) {
  return spBrowseDrive(driveId, itemId);
}

/** Versionsverlauf eines Dokuments (SharePoint-Dateiversionen). */
async function spGetDocVersions(driveId, itemId) {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  const r = await _get(`${SP.graphBase}/drives/${driveId}/items/${itemId}/versions`, token);
  return (r.value || []).map(v => ({
    id: v.id,
    modified: v.lastModifiedDateTime || '',
    by: (v.lastModifiedBy && v.lastModifiedBy.user && v.lastModifiedBy.user.displayName) || '',
    size: v.size || 0,
    url: v['@microsoft.graph.downloadUrl'] || '',
  }));
}

/* ═══════════════════════════════════════════════════
   Bestätigungen / Abschlüsse
═══════════════════════════════════════════════════ */

async function spGetAcknowledgements(filterUpn) {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  await spInit();
  let url = `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.ackListId}/items?$expand=fields&$top=500`;
  const out = [];
  while (url) {
    const resp = await _get(url, token);
    (resp.value || []).forEach(item => {
      const a = _mapAck(item);
      if (!filterUpn || a.benutzerUpn.toLowerCase() === filterUpn.toLowerCase()) out.push(a);
    });
    url = resp['@odata.nextLink'] || null;
  }
  return out;
}

function _mapAck(item) {
  const f = item.fields || {};
  return {
    id:               item.id,
    richtlinieId:     f.RichtlinieId || '',
    version:          f.RichtlinienVersion || '',
    benutzerUpn:      f.BenutzerUPN || '',
    benutzerName:     f.BenutzerName || '',
    gelesenAm:        f.GelesenAm || '',
    quizBestanden:    !!f.QuizBestanden,
    quizScore:        Number(f.QuizScore || 0),
    quizVersuche:     Number(f.QuizVersuche || 0),
    abgeschlossenAm:  f.AbgeschlossenAm || '',
  };
}

/**
 * Bestätigung anlegen oder aktualisieren (Schlüssel: UPN|RichtlinieId|Version).
 */
async function spSaveAcknowledgement(a) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await spInit();

  const all = {
    Title:              `${a.benutzerUpn}|${a.richtlinieId}|${a.version}`.slice(0, 255),
    RichtlinieId:       String(a.richtlinieId),
    RichtlinienVersion: String(a.version || ''),
    BenutzerUPN:        a.benutzerUpn || '',
    BenutzerName:       a.benutzerName || '',
    GelesenAm:          a.gelesenAm || new Date().toISOString(),
    QuizBestanden:      !!a.quizBestanden,
    QuizScore:          Number(a.quizScore || 0),
    QuizVersuche:       Number(a.quizVersuche || 0),
    AbgeschlossenAm:    a.abgeschlossenAm || '',
  };
  // Leere DateTime-Werte nicht senden (SharePoint lehnt "" für Datumsfelder ab)
  if (!all.AbgeschlossenAm) delete all.AbgeschlossenAm;
  if (!all.GelesenAm)       delete all.GelesenAm;
  // Nur Spalten senden, die in der Liste existieren (verhindert 400 bei fehlenden Spalten)
  const fields = Object.fromEntries(
    Object.entries(all).filter(([k]) => _sp.ackFields.has(k))
  );

  if (a.id) {
    return _patch(
      `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.ackListId}/items/${a.id}/fields`,
      token, fields
    );
  }
  return _post(
    `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.ackListId}/items`,
    token, { fields }
  );
}

/* ═══════════════════════════════════════════════════
   ISMS-Dokumente (Quelle, nur lesen)
═══════════════════════════════════════════════════ */

async function _ismsSiteId(token) {
  if (_sp.ismsSiteId) return _sp.ismsSiteId;
  const site = await _get(`${SP.graphBase}/sites/${SP.ismsSiteHost}`, token);
  _sp.ismsSiteId = site.id;
  return _sp.ismsSiteId;
}

/** Dokumentbibliotheken der ISMS-Site auflisten. */
async function spListIsmsDrives() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  const siteId = await _ismsSiteId(token);
  const drives = await _get(`${SP.graphBase}/sites/${siteId}/drives`, token);
  return (drives.value || []).map(d => ({ id: d.id, name: d.name }));
}

/**
 * Inhalt eines Ordners auflisten. itemId weglassen für Wurzel.
 * @returns [{ id, name, isFolder, url, childCount }]
 */
async function spBrowseDrive(driveId, itemId) {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  const path = itemId
    ? `${SP.graphBase}/drives/${driveId}/items/${itemId}/children`
    : `${SP.graphBase}/drives/${driveId}/root/children`;
  const resp = await _get(`${path}?$top=400`, token);
  return (resp.value || []).map(it => ({
    id:         it.id,
    name:       it.name,
    isFolder:   !!it.folder,
    childCount: it.folder ? it.folder.childCount : 0,
    url:        it.webUrl || '',
  })).sort((a, b) => (b.isFolder - a.isFolder) || a.name.localeCompare(b.name, 'de'));
}

/**
 * Kurzlebige Einbett-URL für die Dokumentvorschau (Word/PDF/Excel).
 * Graph: POST /drives/{id}/items/{id}/preview
 */
async function spGetPreviewUrl(driveId, itemId) {
  const token = await acquireToken(SP.scopes);
  if (!token) return null;
  const r = await _post(`${SP.graphBase}/drives/${driveId}/items/${itemId}/preview`, token, {});
  return r && r.getUrl ? r.getUrl : null;
}

/* Bibliothekswurzel-URL je Drive (für die direkte Datei-URL), pro Drive gecacht. */
const _driveWebUrlCache = new Map();
async function _driveRootWebUrl(token, driveId) {
  if (_driveWebUrlCache.has(driveId)) return _driveWebUrlCache.get(driveId);
  const d = await _get(`${SP.graphBase}/drives/${driveId}?$select=webUrl`, token);
  const u = d.webUrl || '';
  _driveWebUrlCache.set(driveId, u);
  return u;
}

/** Direkte Datei-URL eines beliebigen DriveItems (Bibliothekswurzel + Ordner + Dateiname) –
 *  nötig für das Office-URI-Schema (ms-word/excel/powerpoint:ofe|u|<DIREKTE-Datei-URL>);
 *  die normale webUrl ist oft nur eine Doc.aspx-Viewer-URL, die Desktop-Office nicht zuverlässig
 *  öffnet (siehe ISMS-Dokumente). Für beliebige Richtlinien-Dokumente (nicht nur ISMS). */
async function spGetDirectFileUrl(driveId, itemId) {
  const token = await acquireToken(SP.scopes);
  if (!token || !driveId || !itemId) return '';
  try {
    const [it, base] = await Promise.all([
      _get(`${SP.graphBase}/drives/${driveId}/items/${itemId}?$select=name,parentReference,webUrl`, token),
      _driveRootWebUrl(token, driveId),
    ]);
    const ref = it.parentReference || {};
    const m = (ref.path || '').match(/root:?(.*)$/);
    const folder = (m ? decodeURIComponent(m[1] || '') : '').replace(/^\/+/, '');
    const folderEnc = folder.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const b = (base || '').replace(/\/+$/, '');
    if (!b || !it.name) return it.webUrl || '';
    return b + (folderEnc ? '/' + folderEnc : '') + '/' + encodeURIComponent(it.name);
  } catch (e) { return ''; }
}

/* ═══════════════════════════════════════════════════
   ISMS-Dokumentbibliothek (Reiter „ISMS-Dokumente")
   Anzeigen + Metadaten/Datei bearbeiten. Schreiben setzt SharePoint-
   Schreibrechte des angemeldeten Kontos auf sites/ISMS voraus.
═══════════════════════════════════════════════════ */

/** Bibliothek „ISMS Dokumente" + zugehörige Liste lazy ermitteln. */
async function _ismsLib(token) {
  if (_sp.ismsDriveId && _sp.ismsListId) return;
  const siteId = await _ismsSiteId(token);
  const drives = await _get(`${SP.graphBase}/sites/${siteId}/drives`, token);
  const list = drives.value || [];
  // Priorität: exakt „ISMS Dokumente" → Name enthält „ISMS" → Standard-Doku-Bib → erste
  const pick = list.find(d => /^ISMS[\s_-]*Dokumente$/i.test(d.name || ''))
            || list.find(d => /ISMS/i.test(d.name || ''))
            || list.find(d => /^(Dokumente|Documents|Freigegebene Dokumente|Shared Documents)$/i.test(d.name || ''))
            || list[0];
  if (!pick) throw new Error('ISMS-Dokumentbibliothek nicht gefunden.');
  await _ismsSetDrive(token, pick);
}

/** Eine bestimmte Bibliothek als aktiv setzen (Auto-Wahl oder manuelle Korrektur). */
async function _ismsSetDrive(token, drive) {
  _sp.ismsDriveId = drive.id;
  _sp.ismsDriveName = drive.name;
  _sp.ismsDriveWebUrl = drive.webUrl || '';   // Bibliothekswurzel-URL (für direkte Datei-URLs)
  _sp.ismsColMeta = null;   // Spalten gehören zur Bibliothek → neu laden
  const list = await _get(`${SP.graphBase}/drives/${drive.id}/list?$select=id`, token);
  _sp.ismsListId = list.id;
}

/** Name der aktuell genutzten ISMS-Bibliothek (für Diagnose im Leerzustand). */
function spIsmsCurrentLibrary() { return _sp.ismsDriveName || ''; }

/** Manuell eine andere ISMS-Bibliothek wählen (falls die Auto-Erkennung daneben liegt). */
async function spSetIsmsLibrary(driveId) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const siteId = await _ismsSiteId(token);
  const drives = await _get(`${SP.graphBase}/sites/${siteId}/drives`, token);
  const drive = (drives.value || []).find(d => d.id === driveId);
  if (!drive) throw new Error('Bibliothek nicht gefunden');
  await _ismsSetDrive(token, drive);
}

/** Bearbeitbare Spalten der ISMS-Bibliothek (dynamisch; System-/ReadOnly-Spalten raus). */
async function spGetIsmsColumns() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  await _ismsLib(token);
  if (_sp.ismsColMeta) return _sp.ismsColMeta;
  const SKIP = new Set(['ContentType', 'Attachments', 'Edit', 'DocIcon', 'LinkFilename',
    'LinkFilenameNoMenu', 'FileLeafRef', 'FileSizeDisplay', 'ItemChildCount', 'FolderChildCount',
    'LinkTitle', 'LinkTitleNoMenu', '_CommentCount', '_LikeCount', 'CheckoutUser']);
  let cols = { value: [] };
  try { cols = await _get(`${SP.graphBase}/drives/${_sp.ismsDriveId}/list/columns`, token); }
  catch (e) { console.warn('[isms] Spalten nicht lesbar:', e.message); }
  // ALLE Spalten (auch readOnly/Person) für die Label→Name-Auflösung der Anzeigefelder
  _sp.ismsColAll = (cols.value || []).map(c => ({ name: c.name, label: c.displayName || c.name }));
  _sp.ismsColMeta = (cols.value || [])
    .filter(c => c.readOnly !== true && c.hidden !== true && !c.name.startsWith('_') && !SKIP.has(c.name))
    .map(c => ({
      name:    c.name,
      label:   c.displayName || c.name,
      type:    c.text ? (c.text.allowMultipleLines ? 'note' : 'text')
             : c.choice ? 'choice'
             : c.dateTime ? 'date'
             : c.number ? 'number'
             : c.boolean ? 'boolean'
             : c.personOrGroup ? 'person'
             : c.lookup ? 'readonly'
             : 'text',
      choices: c.choice ? (c.choice.choices || []) : null,
      multi:   !!(c.personOrGroup && c.personOrGroup.allowMultipleSelection),
    }));
  return _sp.ismsColMeta;
}

/** Alle Bibliotheks-Spalten (name+label) – für die Label-Auflösung der Anzeigefelder. */
function spGetIsmsAllColumns() { return _sp.ismsColAll || []; }

/** Pfad eines DriveItems relativ zur Bibliothekswurzel (für die Ordner-Spalte). */
function _ismsFolderPath(di) {
  const ref = di && di.parentReference;
  if (!ref || !ref.path) return '';
  const m = ref.path.match(/root:?(.*)$/);
  return (m ? decodeURIComponent(m[1] || '') : '').replace(/^\/+/, '');
}

/** Direkte Datei-URL (Bibliothekswurzel + Ordner + Dateiname) – nötig für das
 *  Office-URI-Schema (ms-word/excel/powerpoint:ofe|u|<DIREKTE-Datei-URL>).
 *  di.webUrl liefert je nach Tenant nur die Doc.aspx-Viewer-URL, die Office nicht öffnen kann. */
function _ismsFileUrl(folderPath, name) {
  const base = (_sp.ismsDriveWebUrl || '').replace(/\/+$/, '');
  if (!base || !name) return '';
  const folder = String(folderPath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return base + (folder ? '/' + folder : '') + '/' + encodeURIComponent(name);
}

/** Ein DriveItem (mit expand listItem.fields) → vereinheitlichtes Dokument-Objekt. */
function _ismsMapDriveItem(di, folderPath) {
  const li = di.listItem || {};
  return {
    itemId:      li.id || '',                              // List-Item-ID (Metadaten-PATCH)
    driveItemId: di.id || '',                              // DriveItem-ID (Versionen/Upload/Preview)
    driveId:     _sp.ismsDriveId,
    name:        di.name || '(ohne Name)',
    folder:      folderPath || '',
    size:        di.size || 0,
    webUrl:      di.webUrl || '',
    fileUrl:     _ismsFileUrl(folderPath, di.name),        // direkte Datei-URL für Office-Bearbeitung
    modified:    di.lastModifiedDateTime || '',
    modifiedBy:  (di.lastModifiedBy && di.lastModifiedBy.user && di.lastModifiedBy.user.displayName) || '',
    fields:      li.fields || {},                          // volle Metadaten (listItem expand)
    fieldsFull:  true,
  };
}

/** Inhalt eines Ordners rekursiv einsammeln (nur Dateien, mit Metadaten).
 *  onProgress(out) wird nach jeder geladenen Seite aufgerufen → progressives Rendern. */
async function _ismsCollectFolder(token, folderId, folderPath, out, onProgress, cap = 2000) {
  let url = `${SP.graphBase}/drives/${_sp.ismsDriveId}/items/${folderId}/children`
          + `?$expand=listItem($expand=fields)`
          + `&$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,file,folder&$top=200`;
  const subfolders = [];
  while (url) {
    const resp = await _get(url, token);
    for (const di of (resp.value || [])) {
      if (di.folder) { subfolders.push({ id: di.id, path: (folderPath ? folderPath + '/' : '') + di.name }); continue; }
      out.push(_ismsMapDriveItem(di, folderPath));
      if (out.length >= cap) { if (onProgress) onProgress(out); return; }
    }
    if (onProgress) onProgress(out);      // Seite fertig → Zwischenstand anzeigen
    url = resp['@odata.nextLink'] || null;
  }
  // Unterordner erst nach den Dateien der aktuellen Ebene (Dateien erscheinen früher)
  for (const sf of subfolders) {
    await _ismsCollectFolder(token, sf.id, sf.path, out, onProgress, cap);
    if (out.length >= cap) return;
  }
}

/** Dateien der ISMS-Bibliothek. Standard: NUR der ISO-27001-Ordner (mit vollen
 *  Metadaten). onProgress(partialList) → progressives Rendern. Wird der Ordner
 *  nicht gefunden, ganze Bibliothek als Fallback. */
async function spGetIsmsDocs(folderName, onProgress) {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  await _ismsLib(token);
  const wantRe = /iso[\s_-]*27001/i;
  let isoFolder = null;
  try {
    const root = await _get(`${SP.graphBase}/drives/${_sp.ismsDriveId}/root/children?$select=id,name,folder&$top=400`, token);
    isoFolder = (root.value || []).find(it => it.folder && (folderName ? it.name === folderName : wantRe.test(it.name || '')));
  } catch (e) { console.warn('[isms] Wurzel nicht lesbar:', e.message); }

  const out = [];
  if (isoFolder) {
    await _ismsCollectFolder(token, isoFolder.id, isoFolder.name, out, onProgress);
  } else {
    // Fallback: ganze Bibliothek (volle Felder), falls kein ISO-Ordner existiert
    let url = `${SP.graphBase}/drives/${_sp.ismsDriveId}/list/items?expand=fields,driveItem&$top=200`;
    while (url) {
      const resp = await _get(url, token);
      for (const it of (resp.value || [])) {
        const di = it.driveItem || {};
        if (di.folder) continue;
        di.listItem = { id: it.id, fields: it.fields || {} };
        out.push(_ismsMapDriveItem(di, _ismsFolderPath(di)));
      }
      if (onProgress) onProgress(out);
      url = resp['@odata.nextLink'] || null;
    }
  }
  return out;
}

/** Vollständige Metadaten EINES Dokuments (lazy beim Öffnen des Editors). */
async function spGetIsmsItemFields(itemId) {
  const token = await acquireToken(SP.scopes);
  if (!token) return {};
  await _ismsLib(token);
  const it = await _get(`${SP.graphBase}/drives/${_sp.ismsDriveId}/list/items/${itemId}?expand=fields`, token);
  return it.fields || {};
}

/** SharePoint-LookupId einer Person (für Person-Felder) über die Benutzer­informations­liste
 *  der ISMS-Site auflösen. Gibt null, wenn die Person dort (noch) nicht existiert. */
let _ismsUserListId = null;
const _ismsUserLookup = {};   // email(lowercase) → LookupId

/** Benutzerinformationsliste der ISMS-Site finden. Sie ist eine versteckte
 *  Systemliste – mehrstufig suchen: Template/Name/Anzeigename (sprachunabhängig,
 *  mit Paging), sonst Direktzugriff über bekannte (lokalisierte) Namen. */
async function _ismsUserInfoListId(siteId, token) {
  if (_ismsUserListId) return _ismsUserListId;
  let url = `${SP.graphBase}/sites/${siteId}/lists?$select=id,displayName,name,list&$top=200`;
  try {
    while (url) {
      const r = await _get(url, token);
      const hit = (r.value || []).find(l =>
        (l.list && l.list.template === 'userInformationList') ||
        /user information|benutzerinfo/i.test(l.displayName || '') ||
        /^users$/i.test(l.name || ''));
      if (hit) { _ismsUserListId = hit.id; return _ismsUserListId; }
      url = r['@odata.nextLink'] || null;
    }
  } catch (e) { /* weiter mit Direktzugriff */ }
  for (const nm of ['User Information List', 'Benutzerinformationsliste', 'Users']) {
    try {
      const l = await _get(`${SP.graphBase}/sites/${siteId}/lists/${encodeURIComponent(nm)}?$select=id`, token);
      if (l && l.id) { _ismsUserListId = l.id; return _ismsUserListId; }
    } catch (e) { /* nächster Name */ }
  }
  return null;
}

async function spEnsureIsmsUserLookupId(email) {
  const key = String(email || '').toLowerCase().trim();
  if (!key) return null;
  if (_ismsUserLookup[key]) return _ismsUserLookup[key];
  const token = await acquireToken(SP.scopes);
  if (!token) return null;
  const siteId = await _ismsSiteId(token);
  const listId = await _ismsUserInfoListId(siteId, token);
  if (!listId) throw new Error('Benutzerinformationsliste der ISMS-Site nicht gefunden – Person ggf. direkt in SharePoint setzen.');
  let url = `${SP.graphBase}/sites/${siteId}/lists/${listId}/items?$expand=fields($select=id,EMail,UserName,Title)&$top=500`;
  while (url) {
    const resp = await _get(url, token);
    for (const it of (resp.value || [])) {
      const f = it.fields || {};
      const id = parseInt(it.id, 10) || it.id;
      const em = (f.EMail || '').toLowerCase();
      if (em) _ismsUserLookup[em] = id;
      const un = (f.UserName || '').toLowerCase();   // Fallback: Login-Name ist oft die UPN/E-Mail
      if (un && /@/.test(un) && !_ismsUserLookup[un]) _ismsUserLookup[un] = id;
    }
    if (_ismsUserLookup[key]) break;
    url = resp['@odata.nextLink'] || null;
  }
  return _ismsUserLookup[key] || null;
}

/** Metadaten eines ISMS-Dokuments speichern (nur vorhandene/bearbeitbare Spalten). */
async function spSaveIsmsItemFields(itemId, fields) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await _ismsLib(token);
  return _patch(`${SP.graphBase}/drives/${_sp.ismsDriveId}/list/items/${itemId}/fields`, token, fields);
}

/* Spaltenerkennung für die Status-Rückkopplung aus dem Freigabe-Workflow. */
const _ISMS_WB_RE = {
  stand:          /bearbeitungs(stand|status)|status/i,
  konform:        /konformit.*(gepr|pr(ü|ue)f)|gepr(ü|ue)ft\s*von|auf\s*konformit/i,
  unterschrieben: /unterschrieben|unterzeichnet|signed/i,
  freigabe:       /freigabe.*(gesch|leitung|management|\bgl\b)|gesch(ä|ae)ftsleitung.*(freigabe|genehm)/i,
};

/**
 * Status am Ursprungs-ISMS-Dokument zurückschreiben, wenn die zugehörige Richtlinie
 * im Freigabe-Workflow geprüft/freigegeben wurde. Läuft nur, wenn das Dokument in der
 * ISMS-Bibliothek liegt (sonst still übersprungen). Best effort.
 * @param kind   'konform' (Konformität erreicht) | 'freigabe' (veröffentlicht)
 * @param person { upn, name } – handelnde Person (Prüfer bzw. Geschäftsleitung)
 * @returns true bei erfolgreichem Zurückschreiben, sonst false
 */
async function spIsmsWritebackStatus(driveId, driveItemId, kind, person) {
  if (!driveId || !driveItemId) return false;
  const token = await acquireToken(SP.scopes);
  if (!token) return false;
  await _ismsLib(token);
  if (String(driveId) !== String(_sp.ismsDriveId)) return false;   // Dokument nicht aus der ISMS-Bibliothek
  let listItemId;
  try {
    const li = await _get(`${SP.graphBase}/drives/${_sp.ismsDriveId}/items/${driveItemId}/listItem?$select=id`, token);
    listItemId = li && li.id;
  } catch (e) { return false; }
  if (!listItemId) return false;

  const cols = await spGetIsmsColumns();
  const find = re => (cols || []).find(c => re.test(c.label || '') || re.test(c.name || '')) || null;
  const standCol = find(_ISMS_WB_RE.stand), konformCol = find(_ISMS_WB_RE.konform),
        freigabeCol = find(_ISMS_WB_RE.freigabe);
  const patch = {};
  const setChoice = (col, pats) => {
    if (!col || col.type !== 'choice') return;
    for (const re of pats) { const o = (col.choices || []).find(c => re.test(c)); if (o) { patch[col.name] = o; return; } }
  };
  const setPerson = async (col) => {
    if (!col || !person) return;
    if (col.type === 'person') {
      const lid = await spEnsureIsmsUserLookupId(person.upn);
      if (lid) patch[col.name + 'LookupId'] = lid;
    } else if (person.name || person.upn) {
      patch[col.name] = person.name || person.upn;
    }
  };

  if (kind === 'konform') {
    await setPerson(konformCol);
    setChoice(standCol, [/gepr(ü|ue)ft/i, /konform/i, /in pr(ü|ue)fung/i, /review/i]);
  } else if (kind === 'freigabe') {
    setChoice(freigabeCol, [/freigegeben/i, /^frei$/i, /^ja$/i, /genehm/i, /erteilt/i, /approv/i]);
    setChoice(standCol, [/freigegeben/i, /ver(ö|oe)ffentlicht/i, /g(ü|ue)ltig/i, /in kraft/i, /final/i, /abgeschloss/i]);
  }
  if (!Object.keys(patch).length) return false;
  await _patch(`${SP.graphBase}/drives/${_sp.ismsDriveId}/list/items/${listItemId}/fields`, token, patch);
  return true;
}

/** Datei-Inhalt eines ISMS-Dokuments ersetzen = neue SharePoint-Version.
 *  Mit Änderungsnotiz: über Check-out → Upload → Check-in(comment), damit die
 *  Notiz als echter SharePoint-Versionskommentar erscheint. Das Wieder-Einchecken
 *  ist über finally abgesichert (keine hängende Auscheckung). Bibliotheken ohne
 *  Check-out fallen automatisch auf einen einfachen Upload zurück. */
async function spIsmsUploadVersion(driveItemId, bytes, contentType, comment) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await _ismsLib(token);
  const item = `${SP.graphBase}/drives/${_sp.ismsDriveId}/items/${driveItemId}`;
  let checkedOut = false;
  if (comment) {
    try { await _post(`${item}/checkout`, token, {}); checkedOut = true; }
    catch (e) { /* Bibliothek ohne Check-out → einfacher Upload */ }
  }
  try {
    const resp = await fetch(`${item}/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType || 'application/octet-stream' },
      body: bytes,
    });
    if (!resp.ok) throw new Error(`Upload ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const out = await resp.json();
    if (checkedOut) { await _post(`${item}/checkin`, token, { comment: comment, checkInAs: 'published' }); checkedOut = false; }
    return out;
  } finally {
    if (checkedOut) { try { await _post(`${item}/checkin`, token, { comment: comment || '' }); } catch (e) { console.warn('[isms] checkin-Fallback fehlgeschlagen:', e.message); } }
  }
}

/* ═══════════════════════════════════════════════════
   Governance-Board (Legal, sites/ArbeitsplatzLegal)
   ==================================================
   Hier liegen die Entwürfe der Konzernregelungen (Corporate Governance-Board).
   Zugriff analog zu den ISMS-Dokumenten (Site + Bibliothek + Ordner auflisten,
   Office/Browser-Bearbeitung, Versionen), aber ohne die ISMS-eigenen Metadaten-/
   Workflow-Spalten – die gehören nur zur ISO-27001-Bibliothek. Sobald ein Entwurf
   die RMS-interne Konformitätsprüfung + Freigabe durchlaufen hat, wird das
   Dokument hier von Legal überschrieben/neu erstellt und veröffentlicht.
═══════════════════════════════════════════════════ */

const GOV = {
  siteHost:   'dihag.sharepoint.com:/sites/ArbeitsplatzLegal',
  folderPath: 'Entwurf_010_Corporate Govenance-Board',   // exakter Ordnername (Original-Schreibweise)
};
const _gov = { siteId: null, driveId: null, driveName: null, driveWebUrl: null, folderId: null };

async function _govSiteId(token) {
  if (_gov.siteId) return _gov.siteId;
  const site = await _get(`${SP.graphBase}/sites/${GOV.siteHost}`, token);
  _gov.siteId = site.id;
  return _gov.siteId;
}

/** Bibliothek + Zielordner der Legal-Site einmalig auflösen (gecacht). */
async function _govResolve(token) {
  if (_gov.driveId && _gov.folderId) return;
  const siteId = await _govSiteId(token);
  const drives = await _get(`${SP.graphBase}/sites/${siteId}/drives`, token);
  const list = drives.value || [];
  const drive = list.find(d => /^(Freigegebene Dokumente|Shared Documents|Dokumente|Documents)$/i.test(d.name || '')) || list[0];
  if (!drive) throw new Error('Keine Dokumentbibliothek auf sites/ArbeitsplatzLegal gefunden.');
  _gov.driveId = drive.id; _gov.driveName = drive.name; _gov.driveWebUrl = drive.webUrl || '';
  const enc = GOV.folderPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  let folder;
  try {
    folder = await _get(`${SP.graphBase}/drives/${drive.id}/root:/${enc}?$select=id,name`, token);
  } catch (e) {
    throw new Error(`Ordner „${GOV.folderPath}" nicht gefunden (Bibliothek „${drive.name}").`);
  }
  _gov.folderId = folder.id;
}

/** Name der genutzten Bibliothek (für Diagnose). */
function spGovCurrentLibrary() { return _gov.driveName || ''; }

/** Direkte Datei-URL (Bibliothekswurzel + Ordner + Dateiname) für das Office-URI-Schema. */
function _govFileUrl(subPath, name) {
  const base = (_gov.driveWebUrl || '').replace(/\/+$/, '');
  if (!base || !name) return '';
  const full = (GOV.folderPath + (subPath ? '/' + subPath : '')).split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return base + '/' + full + '/' + encodeURIComponent(name);
}

function _govMapDriveItem(di, subPath) {
  return {
    driveItemId: di.id || '',
    driveId:     _gov.driveId,
    name:        di.name || '(ohne Name)',
    folder:      subPath || '',
    size:        di.size || 0,
    webUrl:      di.webUrl || '',
    fileUrl:     _govFileUrl(subPath, di.name),
    modified:    di.lastModifiedDateTime || '',
    modifiedBy:  (di.lastModifiedBy && di.lastModifiedBy.user && di.lastModifiedBy.user.displayName) || '',
  };
}

/** Ordnerinhalt rekursiv einsammeln (nur Dateien). onProgress(out) nach jeder Seite. */
async function _govCollectFolder(token, folderId, subPath, out, onProgress, cap = 2000) {
  let url = `${SP.graphBase}/drives/${_gov.driveId}/items/${folderId}/children`
          + `?$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,file,folder&$top=200`;
  const subfolders = [];
  while (url) {
    const resp = await _get(url, token);
    for (const di of (resp.value || [])) {
      if (di.folder) { subfolders.push({ id: di.id, path: (subPath ? subPath + '/' : '') + di.name }); continue; }
      out.push(_govMapDriveItem(di, subPath));
      if (out.length >= cap) { if (onProgress) onProgress(out); return; }
    }
    if (onProgress) onProgress(out);
    url = resp['@odata.nextLink'] || null;
  }
  for (const sf of subfolders) {
    await _govCollectFolder(token, sf.id, sf.path, out, onProgress, cap);
    if (out.length >= cap) return;
  }
}

/** Alle Entwurfsdateien im Governance-Board-Ordner (rekursiv). onProgress(partialList). */
async function spGetGovDocs(onProgress) {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  await _govResolve(token);
  const out = [];
  await _govCollectFolder(token, _gov.folderId, '', out, onProgress);
  return out;
}

/* ═══════════════════════════════════════════════════
   Mitarbeiterliste (Soll für Compliance)
═══════════════════════════════════════════════════ */

/** Aktive Mitarbeiter (Postfach vorhanden, kein Gast) inkl. AD-Abteilung. */
async function spGetMembers() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  let url = `${SP.graphBase}/users?$select=displayName,mail,userPrincipalName,accountEnabled,userType,department&$top=999`;
  const out = [];
  while (url) {
    const resp = await _get(url, token);
    (resp.value || []).forEach(u => {
      if (u.accountEnabled !== false && u.mail && (u.userType || 'Member') === 'Member') {
        out.push({
          name: u.displayName || u.mail,
          upn: (u.userPrincipalName || u.mail),
          department: u.department || '',
        });
      }
    });
    url = resp['@odata.nextLink'] || null;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Azure-AD-Abteilung des angemeldeten Users (für die automatische Rollen-Zuordnung). */
async function spGetMyDepartment() {
  const token = await acquireToken(SP.scopes);
  if (!token) return '';
  const me = await _get(`${SP.graphBase}/me?$select=department,jobTitle`, token);
  return me.department || '';
}

/* ═══════════════════════════════════════════════════
   Mail-Versand (Graph /me/sendMail, Scope Mail.Send)
═══════════════════════════════════════════════════ */

/** Firmendomain des angemeldeten Users (Sicherheits-Grenze für Empfänger). */
function _myMailDomain() {
  const u = (typeof getAuthUser === 'function' && getAuthUser()?.username) || '';
  const at = u.lastIndexOf('@');
  return at >= 0 ? u.slice(at + 1).toLowerCase() : '';
}

/**
 * Mail im Namen des angemeldeten Users senden.
 * Sicherheit: Empfänger müssen gültige Adressen der EIGENEN Firmendomain sein
 * (kein Versand an Externe). Scope Mail.Send wird separat angefordert.
 * @returns true bei Versand, false bei Redirect (Consent erforderlich)
 */
async function spSendMail(toUpns, subject, htmlBody, attachments, ccUpns, extraDomains) {
  const domain = _myMailDomain();
  // Erlaubte Domains: eigene Firmendomain + optional admin-gepflegte Ausnahmen
  // (z. B. Betriebsrats-Mails auf Gruppengesellschafts-Domains wie ewa-guss.de).
  const allowed = new Set([domain, ...(Array.isArray(extraDomains) ? extraDomains : [])]
    .map(d => String(d || '').trim().toLowerCase()).filter(Boolean));
  const clean = list => [...new Set((Array.isArray(list) ? list : [list])
    .map(u => String(u || '').trim().toLowerCase())
    .filter(u => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u) && (!allowed.size || allowed.has(u.split('@').pop()))))];
  const unique = clean(toUpns);
  if (!unique.length) throw new Error('Keine gültigen internen Empfänger (nur @' + (domain || 'Firmendomain') + ').');
  const cc = clean(ccUpns).filter(a => !unique.includes(a));   // keine Doppel-Empfänger

  const token = await acquireToken(['https://graph.microsoft.com/Mail.Send']);
  if (!token) return false;   // Redirect zum Consent läuft

  const message = {
    subject: String(subject || '').slice(0, 255),
    body: { contentType: 'HTML', content: htmlBody || '' },
    toRecipients: unique.map(a => ({ emailAddress: { address: a } })),
  };
  if (cc.length) message.ccRecipients = cc.map(a => ({ emailAddress: { address: a } }));
  if (attachments && attachments.length) message.attachments = attachments;

  await _post(`${SP.graphBase}/me/sendMail`, token, { message, saveToSentItems: true });
  return true;
}

/** Richtliniendokument als E-Mail-Anhang (fileAttachment, base64) – oder null (zu groß/fehlt). */
async function spGetDocAttachment(driveId, itemId, fallbackName) {
  if (!driveId || !itemId) return null;
  const token = await acquireToken(SP.scopes);
  if (!token) return null;
  try {
    const meta = await _get(`${SP.graphBase}/drives/${driveId}/items/${itemId}?$select=name,size,file,@microsoft.graph.downloadUrl`, token);
    if ((meta.size || 0) > 2.5 * 1024 * 1024) return null;   // > 2,5 MB → nur Link
    const url = meta['@microsoft.graph.downloadUrl'];
    if (!url) return null;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: meta.name || fallbackName || 'Richtlinie',
      contentType: (meta.file && meta.file.mimeType) || 'application/octet-stream',
      contentBytes: btoa(bin),
    };
  } catch (e) { console.warn('Anhang nicht ladbar:', e.message); return null; }
}

/* ═══════════════════════════════════════════════════
   Dokument-Texterkennung (.docx) – für BPMN-Entwürfe aus Richtlinien
   Liest word/document.xml direkt im Browser aus (ZIP + deflate-raw),
   ohne Server/Fremdbibliothek. Rein clientseitig.
═══════════════════════════════════════════════════ */

/** DEFLATE-raw entpacken via DecompressionStream (modernes Edge/Chrome). */
async function _inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined')
    throw new Error('Dieser Browser kann .docx nicht automatisch entpacken. Bitte den Prozesstext manuell einfügen.');
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Rohbytes einer Datei aus einem ZIP (Uint8Array) holen. @returns Uint8Array | null */
async function _zipEntryBytes(buf, entryName) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const LE = true;
  // End Of Central Directory (Signatur 0x06054b50) von hinten suchen
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65557; i--) {
    if (dv.getUint32(i, LE) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Ungültige .docx (kein ZIP-Verzeichnis).');
  let cd = dv.getUint32(eocd + 16, LE);          // Offset Central Directory
  const total = dv.getUint16(eocd + 10, LE);     // Anzahl Einträge
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(cd, LE) !== 0x02014b50) break;
    const method = dv.getUint16(cd + 10, LE);
    const compSize = dv.getUint32(cd + 20, LE);
    const nameLen = dv.getUint16(cd + 28, LE);
    const extraLen = dv.getUint16(cd + 32, LE);
    const commentLen = dv.getUint16(cd + 34, LE);
    const lho = dv.getUint32(cd + 42, LE);         // Local Header Offset
    const name = new TextDecoder('utf-8').decode(buf.subarray(cd + 46, cd + 46 + nameLen));
    if (name === entryName) {
      if (dv.getUint32(lho, LE) !== 0x04034b50) throw new Error('ZIP-Eintrag beschädigt.');
      const lNameLen = dv.getUint16(lho + 26, LE);
      const lExtraLen = dv.getUint16(lho + 28, LE);
      const dataStart = lho + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return data;               // gespeichert
      if (method === 8) return await _inflateRaw(data);  // deflate
      throw new Error('Nicht unterstützte ZIP-Kompression (' + method + ').');
    }
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Häufige XML-Entities dekodieren. */
function _decodeXmlEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** word/document.xml → Klartext (Absätze zeilenweise). */
function _docxXmlToText(xml) {
  let t = String(xml || '')
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
  t = _decodeXmlEntities(t);
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Klartext eines verknüpften .docx-Richtliniendokuments (Texterkennung für BPMN). */
async function spGetPolicyDocText(driveId, itemId) {
  if (!driveId || !itemId) return '';
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const meta = await _get(`${SP.graphBase}/drives/${driveId}/items/${itemId}?$select=name,size`, token);
  const name = (meta.name || '').toLowerCase();
  if (!/\.docx$/.test(name))
    throw new Error('Automatische Texterkennung nur für .docx möglich (Dokument: ' + (meta.name || '?') + '). Text bitte manuell einfügen.');
  if ((meta.size || 0) > 8 * 1024 * 1024) throw new Error('Dokument zu groß für die Texterkennung (> 8 MB).');
  // Inhalt direkt über /content laden (robust, unabhängig von der downloadUrl-Annotation).
  const resp = await fetch(`${SP.graphBase}/drives/${driveId}/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error('Dokument-Download fehlgeschlagen (' + resp.status + ').');
  const buf = new Uint8Array(await resp.arrayBuffer());
  const xmlBytes = await _zipEntryBytes(buf, 'word/document.xml');
  if (!xmlBytes) throw new Error('word/document.xml nicht gefunden – ist das eine gültige .docx?');
  return _docxXmlToText(new TextDecoder('utf-8').decode(xmlBytes));
}

/* ═══════════════════════════════════════════════════
   Prozesse (BPMN 2.0) – .bpmn-Dateien im Ordner „Prozesse"
   der ISMS-Dokumentbibliothek (sites/ISMS). Verknüpfung zu Richtlinien
   liegt im BPMN-XML selbst (Prozess-Dokumentation), keine Extra-Liste nötig.
═══════════════════════════════════════════════════ */
const PROCESS_FOLDER = 'Prozesse';

/** Alle .bpmn-Dateien im Prozesse-Ordner auflisten (leer, wenn Ordner fehlt). */
async function spListProcesses() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  await _ismsLib(token);
  try {
    const data = await _get(
      `${SP.graphBase}/drives/${_sp.ismsDriveId}/root:/${encodeURIComponent(PROCESS_FOLDER)}:/children` +
      `?$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy&$top=200`, token);
    return (data.value || [])
      .filter(f => /\.bpmn$/i.test(f.name || ''))
      .map(f => ({
        itemId:     f.id,
        name:       f.name,
        title:      f.name.replace(/\.bpmn$/i, ''),
        webUrl:     f.webUrl || '',
        size:       f.size || 0,
        modified:   f.lastModifiedDateTime || '',
        modifiedBy: (f.lastModifiedBy && f.lastModifiedBy.user && f.lastModifiedBy.user.displayName) || '',
      }))
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  } catch (e) {
    if (e.status === 404 || /itemNotFound|404/i.test(e.message || '')) return [];   // Ordner existiert noch nicht
    throw e;
  }
}

/** BPMN-XML einer Prozessdatei laden. */
async function spGetProcessXml(itemId) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await _ismsLib(token);
  const res = await _fetchRetry(`${SP.graphBase}/drives/${_sp.ismsDriveId}/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Prozess laden fehlgeschlagen (${res.status})`);
  return res.text();
}

/** Prozess speichern (Upload .bpmn; legt den Ordner „Prozesse" bei Bedarf automatisch an).
 *  Gleicher Dateiname → neue Version derselben Datei. @returns das DriveItem. */
async function spSaveProcess(name, xml) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await _ismsLib(token);
  const safe = String(name || 'Prozess').replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '_').trim() || 'Prozess';
  const fname = /\.bpmn$/i.test(safe) ? safe : safe + '.bpmn';
  const path = `${encodeURIComponent(PROCESS_FOLDER)}/${encodeURIComponent(fname)}`;
  const res = await _fetchRetry(`${SP.graphBase}/drives/${_sp.ismsDriveId}/root:/${path}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/xml' },
    body: xml,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => res.status);
    throw new Error(`Speichern fehlgeschlagen (${res.status}): ${String(t).slice(0, 200)}`);
  }
  return res.json();
}

/** Prozessdatei löschen. */
async function spDeleteProcess(itemId) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await _ismsLib(token);
  const res = await fetch(`${SP.graphBase}/drives/${_sp.ismsDriveId}/items/${itemId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`Löschen fehlgeschlagen (${res.status})`);
}

/* ═══════════════════════════════════════════════════
   access-config.json (Rollen)
═══════════════════════════════════════════════════ */

async function spLoadAccessConfig() {
  const token = await acquireToken(SP.scopes);
  if (!token) return null;
  await spInit();
  if (!_sp.appDriveId) return null;
  const url = `${SP.graphBase}/drives/${_sp.appDriveId}/root:/${SP.configFolder}/access-config.json:/content`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!resp.ok) return null; // 404 = noch nicht angelegt
  return resp.json();
}

async function spSaveAccessConfig(config) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await spInit();
  if (!_sp.appDriveId) throw new Error('Keine Dokumentbibliothek gefunden.');
  const json = JSON.stringify(config, null, 2);
  await _uploadFile(token, `${SP.configFolder}/access-config.json`,
    new TextEncoder().encode(json), 'application/json');
}

/* ═══════════════════════════════════════════════════
   soa-config.json (Erklärung zur Anwendbarkeit, ISO 27001 6.1.3 d)
   Struktur: { controls: { "A.5.1": { anwendbar, begruendung, status } }, meta: {...} }
═══════════════════════════════════════════════════ */

async function spLoadSoa() {
  const token = await acquireToken(SP.scopes);
  if (!token) return null;
  await spInit();
  if (!_sp.appDriveId) return null;
  const url = `${SP.graphBase}/drives/${_sp.appDriveId}/root:/${SP.configFolder}/soa-config.json:/content`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!resp.ok) return null; // 404 = noch nicht angelegt
  return resp.json();
}

async function spSaveSoa(data) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await spInit();
  if (!_sp.appDriveId) throw new Error('Keine Dokumentbibliothek gefunden.');
  await _uploadFile(token, `${SP.configFolder}/soa-config.json`,
    new TextEncoder().encode(JSON.stringify(data, null, 2)), 'application/json');
}

/* ═══════════════════════════════════════════════════
   Reifegrad-Assessment „IT und OT Betrieb" (reifegrad-config.json)
═══════════════════════════════════════════════════ */

async function spLoadReifegrad() {
  const token = await acquireToken(SP.scopes);
  if (!token) return null;
  await spInit();
  if (!_sp.appDriveId) return null;
  const url = `${SP.graphBase}/drives/${_sp.appDriveId}/root:/${SP.configFolder}/reifegrad-config.json:/content`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!resp.ok) return null; // 404 = noch nicht angelegt
  return resp.json();
}

async function spSaveReifegrad(data) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  await spInit();
  if (!_sp.appDriveId) throw new Error('Keine Dokumentbibliothek gefunden.');
  await _uploadFile(token, `${SP.configFolder}/reifegrad-config.json`,
    new TextEncoder().encode(JSON.stringify(data, null, 2)), 'application/json');
}

/* ═══════════════════════════════════════════════════
   Risiko-Register (SharePoint-Liste „Risiken", wird bei Bedarf angelegt)
═══════════════════════════════════════════════════ */

/* Erwartete Spalten der Liste „Risiken" – EINE Quelle für: Auto-Anlage,
   Fehlende-Spalten-Warnung und die Anleitung beim manuellen Anlegen.
   Interne Namen exakt so (ASCII, keine Umlaute → kein kodierter interner Name). */
const RISK_COLUMNS = [
  { name: 'Beschreibung',          typ: 'Mehrere Zeilen Text' },
  { name: 'Kategorie',             typ: 'Einzelne Textzeile' },
  { name: 'Eigner',                typ: 'Einzelne Textzeile' },
  { name: 'Schutzziele',           typ: 'Einzelne Textzeile' },
  { name: 'BruttoEintritt',        typ: 'Zahl' },
  { name: 'BruttoAuswirkung',      typ: 'Zahl' },
  { name: 'NettoEintritt',         typ: 'Zahl' },
  { name: 'NettoAuswirkung',       typ: 'Zahl' },
  { name: 'Behandlung',            typ: 'Einzelne Textzeile' },
  { name: 'BehandlungBegruendung', typ: 'Mehrere Zeilen Text' },
  { name: 'MassnahmenJson',        typ: 'Mehrere Zeilen Text' },
  { name: 'ControlsJson',          typ: 'Mehrere Zeilen Text' },
  { name: 'RichtlinienJson',       typ: 'Mehrere Zeilen Text' },
  { name: 'AssetsJson',            typ: 'Mehrere Zeilen Text' },
  { name: 'RiskStatus',            typ: 'Einzelne Textzeile' },
  { name: 'NaechsteReview',        typ: 'Datum und Uhrzeit' },
  { name: 'HistorieJson',          typ: 'Mehrere Zeilen Text' },
];

/** Menschlicher Spaltentyp → Graph-Spaltendefinition (für die Auto-Anlage). */
function _riskColGraphDef(typ) {
  if (typ === 'Zahl')                return { number: {} };
  if (typ === 'Datum und Uhrzeit')   return { dateTime: {} };
  if (typ === 'Mehrere Zeilen Text') return { text: { allowMultipleLines: true } };
  return { text: {} };   // Einzelne Textzeile
}

let _riskCols = null;   // vorhandene Spalten (für spaltentolerantes Schreiben)

async function _loadRiskCols(token, siteId) {
  try {
    const cols = await _get(`${SP.graphBase}/sites/${siteId}/lists/${_sp.riskListId}/columns?$select=name`, token);
    _riskCols = new Set((cols.value || []).map(c => c.name));
  } catch (e) { _riskCols = null; }
}

/** Risiken-Liste robust finden – oder anlegen. Liegt BEWUSST auf der ISMS-Site
 *  (sites/ISMS), nicht auf der App-Site – so gewünscht. */
async function spEnsureRiskList(create = true) {
  if (_sp.riskListId) return _sp.riskListId;
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const siteId = await _ismsSiteId(token);
  const target = _normName(SP.riskList);   // 'risiken'
  let url = `${SP.graphBase}/sites/${siteId}/lists?$select=id,displayName,name&$top=200`;
  try {
    while (url) {
      const r = await _get(url, token);
      const hit = (r.value || []).find(l => _normName(l.displayName) === target || _normName(l.name) === target);
      if (hit) { _sp.riskListId = hit.id; await _loadRiskCols(token, siteId); return _sp.riskListId; }
      url = r['@odata.nextLink'] || null;
    }
  } catch (e) { /* weiter → ggf. anlegen */ }
  if (!create) return null;
  const body = {
    displayName: SP.riskList,
    list: { template: 'genericList' },
    columns: RISK_COLUMNS.map(c => ({ name: c.name, ..._riskColGraphDef(c.typ) })),
  };
  const created = await _post(`${SP.graphBase}/sites/${siteId}/lists`, token, body);
  _sp.riskListId = created.id;
  await _loadRiskCols(token, siteId);
  return _sp.riskListId;
}

function _riskParseJson(s, fallback) {
  try { const v = JSON.parse(s || ''); return v == null ? fallback : v; } catch (e) { return fallback; }
}

/** SP-Item → Risiko-Objekt (App-Modell). */
function _mapRisk(it) {
  const f = it.fields || {};
  return {
    id: it.id,
    titel:        f.Title || '',
    beschreibung: f.Beschreibung || '',
    kategorie:    f.Kategorie || '',
    eigner:       f.Eigner || '',
    // CIA-Schutzziele (englisch). Altbestand „V" (Vertraulichkeit) → „C" (Confidentiality).
    schutzziele:  String(f.Schutzziele || '').split(',').map(s => s.trim()).filter(Boolean).map(z => z === 'V' ? 'C' : z),
    brutto:       { e: Number(f.BruttoEintritt) || 0, a: Number(f.BruttoAuswirkung) || 0 },
    netto:        { e: Number(f.NettoEintritt) || 0, a: Number(f.NettoAuswirkung) || 0 },
    behandlung:   f.Behandlung || '',
    behandlungBegruendung: f.BehandlungBegruendung || '',
    massnahmen:   _riskParseJson(f.MassnahmenJson, []),
    controls:     _riskParseJson(f.ControlsJson, []),
    richtlinien:  _riskParseJson(f.RichtlinienJson, []),
    assets:       _riskParseJson(f.AssetsJson, []),
    status:       f.RiskStatus || 'offen',
    naechsteReview: f.NaechsteReview || '',
    historie:     _riskParseJson(f.HistorieJson, []),
    created:      it.createdDateTime || '',
    modified:     it.lastModifiedDateTime || '',
  };
}

/** Risiko-Objekt → SP-Felder (nur vorhandene Spalten). */
function _riskFields(r) {
  const all = {
    Title:                 String(r.titel || '(ohne Titel)').slice(0, 255),
    Beschreibung:          r.beschreibung || '',
    Kategorie:             String(r.kategorie || '').slice(0, 255),
    Eigner:                String(r.eigner || '').slice(0, 255),
    Schutzziele:           (r.schutzziele || []).join(','),
    BruttoEintritt:        Number(r.brutto?.e) || 0,
    BruttoAuswirkung:      Number(r.brutto?.a) || 0,
    NettoEintritt:         Number(r.netto?.e) || 0,
    NettoAuswirkung:       Number(r.netto?.a) || 0,
    Behandlung:            String(r.behandlung || '').slice(0, 60),
    BehandlungBegruendung: r.behandlungBegruendung || '',
    MassnahmenJson:        JSON.stringify(r.massnahmen || []),
    ControlsJson:          JSON.stringify(r.controls || []),
    RichtlinienJson:       JSON.stringify(r.richtlinien || []),
    AssetsJson:            JSON.stringify(r.assets || []),
    RiskStatus:            String(r.status || 'offen').slice(0, 60),
    HistorieJson:          JSON.stringify(r.historie || []),
  };
  if (r.naechsteReview) all.NaechsteReview = r.naechsteReview;
  const fields = {};
  for (const [k, v] of Object.entries(all)) {
    if (k === 'Title' || !_riskCols || _riskCols.has(k)) fields[k] = v;
  }
  return fields;
}

/** Fehlende Spalten der Risiken-Liste (nach spEnsureRiskList). */
function spMissingRiskColumns() {
  if (!_riskCols) return [];
  return RISK_COLUMNS.map(c => c.name).filter(n => !_riskCols.has(n));
}

async function spGetRisks() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  const listId = await spEnsureRiskList(true);
  const siteId = await _ismsSiteId(token);
  const out = [];
  let url = `${SP.graphBase}/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`;
  while (url) {
    const resp = await _get(url, token);
    for (const it of (resp.value || [])) out.push(_mapRisk(it));
    url = resp['@odata.nextLink'] || null;
  }
  return out;
}

async function spAddRisk(r) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const listId = await spEnsureRiskList(true);
  const siteId = await _ismsSiteId(token);
  const created = await _post(`${SP.graphBase}/sites/${siteId}/lists/${listId}/items`, token, { fields: _riskFields(r) });
  return created && created.id;
}

async function spUpdateRisk(id, r) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const listId = await spEnsureRiskList(false);
  if (!listId) throw new Error('Risiken-Liste nicht verfügbar.');
  const siteId = await _ismsSiteId(token);
  return _patch(`${SP.graphBase}/sites/${siteId}/lists/${listId}/items/${id}/fields`, token, _riskFields(r));
}

async function spDeleteRisk(id) {
  const token = await acquireToken(SP.scopes);
  if (!token) throw new Error('Nicht angemeldet');
  const listId = await spEnsureRiskList(false);
  if (!listId) throw new Error('Risiken-Liste nicht verfügbar.');
  const siteId = await _ismsSiteId(token);
  const resp = await fetch(`${SP.graphBase}/sites/${siteId}/lists/${listId}/items/${id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok && resp.status !== 404) throw new Error(`Löschen fehlgeschlagen (${resp.status})`);
}

/* ═══════════════════════════════════════════════════
   Assets / Werte (ISMS-Liste „Assets", nur lesen) – zum Verknüpfen mit Risiken
═══════════════════════════════════════════════════ */

/** Kurz-Beschreibung eines Assets aus gängigen Zusatzspalten (best effort). */
function _assetSub(f) {
  const keys = ['Kategorie', 'Category', 'Typ', 'Type', 'AssetTyp', 'AssetType', 'Klassifizierung',
    'Schutzbedarf', 'Standort', 'Location', 'Verantwortlich', 'Owner', 'Eigentuemer', 'Eigner'];
  const parts = [];
  for (const k of keys) {
    const v = f[k];
    if (v && typeof v === 'string' && !parts.includes(v)) parts.push(v);
    if (parts.length >= 2) break;
  }
  return parts.join(' · ');
}

/** Assets aus der ISMS-Liste „Assets" laden (nur lesen). Wirft, wenn die Liste
 *  fehlt/kein Zugriff – die UI fängt das ab und zeigt einen Hinweis. */
async function spGetAssets() {
  const token = await acquireToken(SP.scopes);
  if (!token) return [];
  const siteId = await _ismsSiteId(token);
  const target = _normName(SP.assetsList);
  let listId = null;
  let lurl = `${SP.graphBase}/sites/${siteId}/lists?$select=id,displayName,name&$top=200`;
  while (lurl && !listId) {
    const r = await _get(lurl, token);
    const hit = (r.value || []).find(l => _normName(l.displayName) === target || _normName(l.name) === target);
    if (hit) listId = hit.id;
    lurl = r['@odata.nextLink'] || null;
  }
  if (!listId) throw new Error(`ISMS-Liste „${SP.assetsList}" nicht gefunden (Site ${SP.ismsSiteHost}).`);
  const out = [];
  let url = `${SP.graphBase}/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=500`;
  while (url) {
    const resp = await _get(url, token);
    for (const it of (resp.value || [])) {
      const f = it.fields || {};
      out.push({ id: String(it.id), title: f.Title || f.LinkTitle || ('#' + it.id), sub: _assetSub(f), url: it.webUrl || '' });
    }
    url = resp['@odata.nextLink'] || null;
  }
  out.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  return out;
}

/* ═══════════════════════════════════════════════════
   Graph-Helper
═══════════════════════════════════════════════════ */

/** fetch mit Backoff-Retry bei transientem Throttling (429/503/504, max. 3×). */
async function _fetchRetry(url, options, _attempt = 0) {
  const resp = await fetch(url, options);
  if ((resp.status === 429 || resp.status === 503 || resp.status === 504) && _attempt < 3) {
    const retryAfter = parseFloat(resp.headers.get('Retry-After')) || 0;   // Sekunden, falls gesetzt
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** _attempt);
    console.warn(`[sp] Graph ${resp.status} – Retry ${_attempt + 1}/3 in ${waitMs} ms`);
    await new Promise(r => setTimeout(r, waitMs));
    return _fetchRetry(url, options, _attempt + 1);
  }
  return resp;
}

async function _uploadFile(token, path, bytes, contentType) {
  const url = `${SP.graphBase}/drives/${_sp.appDriveId}/root:/${path}:/content`;
  const resp = await _fetchRetry(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: bytes,
  });
  if (!resp.ok) throw new Error(`Upload ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return resp.json();
}

async function _get(url, token) {
  const resp = await _fetchRetry(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Graph GET (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

/** Alle Seiten einer Graph-Collection laden (folgt @odata.nextLink, cap gegen Endlosschleifen). */
async function _getAll(url, token, cap = 5000) {
  let out = [], next = url;
  while (next) {
    const page = await _get(next, token);
    out = out.concat(page.value || []);
    next = page['@odata.nextLink'] || null;
    if (out.length >= cap) { console.warn(`[sp] _getAll: cap ${cap} erreicht`); break; }
  }
  return out;
}

/** Antwort als JSON lesen – tolerant gegenüber leeren Bodies (z. B. 202/204 bei /sendMail). */
async function _jsonOrNull(resp) {
  if (resp.status === 204 || resp.status === 202) return null;
  const txt = await resp.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (e) { return null; }
}

async function _post(url, token, body) {
  const resp = await _fetchRetry(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Graph POST (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return _jsonOrNull(resp);
}

async function _patch(url, token, fields) {
  const resp = await _fetchRetry(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!resp.ok) throw new Error(`Graph PATCH (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return _jsonOrNull(resp);
}

async function _del(url, token) {
  const resp = await _fetchRetry(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok && resp.status !== 204) throw new Error(`Graph DELETE (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
}
