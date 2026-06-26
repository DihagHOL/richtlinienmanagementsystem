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
  configFolder: 'Richtlinienmanagement',   // Unterordner in der Dokumentbibliothek

  // ── ISMS-Quelle: Richtliniendokumente (nur Lesezugriff) ──
  ismsSiteHost: 'dihag.sharepoint.com:/sites/ISMS',

  scopes: [
    'https://graph.microsoft.com/Sites.ReadWrite.All',
    'https://graph.microsoft.com/Files.ReadWrite.All',
    'https://graph.microsoft.com/User.Read.All',
  ],
};

const _sp = {
  appSiteId: null, policyListId: null, ackListId: null, appDriveId: null,
  courseListId: null,
  ismsSiteId: null,
  ismsDriveId: null, ismsDriveName: null, ismsDriveWebUrl: null, ismsListId: null, ismsColMeta: null,   // ISMS-Dokumentbibliothek (lazy)
  policyFields: new Set(['Title']),
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
];

/** Welche erwarteten Spalten fehlen in der Liste „Richtlinien"? (nach spInit) */
function spMissingPolicyColumns() {
  return POLICY_COLUMNS.filter(c => !_sp.policyFields.has(c.name));
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
  return {
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
  };
  const fields = Object.fromEntries(
    Object.entries(all).filter(([k]) => _sp.policyFields.has(k))
  );
  // Leere DateTime-Werte nicht senden (SharePoint lehnt "" für Datumsfelder ab)
  if (!fields.VeroeffentlichtAm) delete fields.VeroeffentlichtAm;
  if (!fields.NaechsteReview)    delete fields.NaechsteReview;
  if (!fields.PruefungSeit)      delete fields.PruefungSeit;

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
async function spSendMail(toUpns, subject, htmlBody, attachments, ccUpns) {
  const domain = _myMailDomain();
  const clean = list => [...new Set((Array.isArray(list) ? list : [list])
    .map(u => String(u || '').trim().toLowerCase())
    .filter(u => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u) && (!domain || u.endsWith('@' + domain))))];
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

async function _post(url, token, body) {
  const resp = await _fetchRetry(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Graph POST (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

async function _patch(url, token, fields) {
  const resp = await _fetchRetry(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!resp.ok) throw new Error(`Graph PATCH (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

async function _del(url, token) {
  const resp = await _fetchRetry(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok && resp.status !== 204) throw new Error(`Graph DELETE (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
}
