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
  ismsSiteId: null,
  policyFields: new Set(['Title']),
  ready: false,
};

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

  // Dokumentbibliothek (für access-config.json)
  const drives = await _get(`${SP.graphBase}/sites/${_sp.appSiteId}/drives`, token);
  const docDrive = (drives.value || []).find(d =>
    ['Dokumente', 'Documents', 'Freigegebene Dokumente', 'Shared Documents'].includes(d.name)
  ) || drives.value?.[0];
  if (docDrive) _sp.appDriveId = docDrive.id;

  // Spalten der Richtlinien-Liste (nur vorhandene Felder schreiben → keine 400er)
  try {
    const cols = await _get(`${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.policyListId}/columns`, token);
    (cols.value || []).forEach(c => _sp.policyFields.add(c.name));
  } catch (e) {
    console.warn('[sp] Spalten der Richtlinien-Liste nicht lesbar:', e.message);
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
  const resp = await _get(
    `${SP.graphBase}/sites/${_sp.appSiteId}/lists/${_sp.policyListId}/items` +
    `?$expand=fields&$top=500`, token
  );
  return (resp.value || []).map(_mapPolicy)
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
}

function _mapPolicy(item) {
  const f = item.fields || {};
  let quiz = [];
  try { quiz = f.QuizJson ? JSON.parse(f.QuizJson) : []; } catch { quiz = []; }
  let zielgruppen = [];
  try { zielgruppen = f.Zielgruppen ? JSON.parse(f.Zielgruppen) : []; } catch { zielgruppen = []; }
  return {
    id:                  item.id,
    title:               f.Title || '',
    beschreibung:        f.Beschreibung || '',
    kategorie:           f.Kategorie || '',
    dokumentUrl:         _linkVal(f.DokumentUrl),
    dokumentName:        f.DokumentName || '',
    dokumentDriveId:     f.DokumentDriveId || '',
    dokumentItemId:      f.DokumentItemId || '',
    version:             f.Version || '1.0',
    status:              f.Status || 'Entwurf',
    pflicht:             f.Pflicht !== false,            // Default: Pflicht
    quizErforderlich:    !!f.QuizErforderlich && quiz.length > 0,
    quizBestehenProzent: Number(f.QuizBestehenProzent || 80),
    quiz,
    zielgruppen,
    veroeffentlichtAm:   f.VeroeffentlichtAm || '',
    freigegebenVon:      f.FreigegebenVon || '',
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
    Version:             (p.version || '1.0').slice(0, 50),
    Status:              p.status || 'Entwurf',
    Pflicht:             p.pflicht !== false,
    QuizErforderlich:    !!p.quizErforderlich,
    QuizBestehenProzent: Number(p.quizBestehenProzent || 80),
    QuizJson:            JSON.stringify(p.quiz || []),
    Zielgruppen:         JSON.stringify(p.zielgruppen || []),
    VeroeffentlichtAm:   p.veroeffentlichtAm || '',
    FreigegebenVon:      p.freigegebenVon || '',
  };
  const fields = Object.fromEntries(
    Object.entries(all).filter(([k]) => _sp.policyFields.has(k))
  );
  // Leere DateTime-Werte nicht senden (SharePoint lehnt "" für Datumsfelder ab)
  if (!fields.VeroeffentlichtAm) delete fields.VeroeffentlichtAm;

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

  const fields = {
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
  if (!fields.AbgeschlossenAm) delete fields.AbgeschlossenAm;
  if (!fields.GelesenAm)       delete fields.GelesenAm;

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

async function _uploadFile(token, path, bytes, contentType) {
  const url = `${SP.graphBase}/drives/${_sp.appDriveId}/root:/${path}:/content`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: bytes,
  });
  if (!resp.ok) throw new Error(`Upload ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return resp.json();
}

async function _get(url, token) {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Graph GET (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

async function _post(url, token, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Graph POST (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

async function _patch(url, token, fields) {
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!resp.ok) throw new Error(`Graph PATCH (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

async function _del(url, token) {
  const resp = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok && resp.status !== 204) throw new Error(`Graph DELETE (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
}
