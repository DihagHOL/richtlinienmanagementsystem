/**
 * Reiter „ISMS-Dokumente" (Admin)
 * ===============================
 * Listet alle Dateien der ISMS-Dokumentbibliothek (sites/ISMS) mit den
 * nützlichen Infos und macht sie bearbeitbar:
 *   • Metadaten/Bibliotheks-Spalten pflegen (Graph-PATCH)
 *   • Datei verwalten: in SharePoint öffnen, neue Version hochladen, Versionsverlauf
 *   • „Als Richtlinie übernehmen": Dokument in den Richtlinien-Workflow einbinden
 * Schreiben setzt SharePoint-Schreibrechte des Kontos auf sites/ISMS voraus.
 */

let _ismsDocs = null;     // geladene Dokumente (Cache)
let _ismsCols = null;     // bearbeitbare Spalten der Bibliothek
let _ismsDrives = null;   // verfügbare ISMS-Bibliotheken (für Diagnose/Wechsel)

async function initIsmsDocs() {
  const mount = document.getElementById('isms-mount');
  if (!mount) return;
  if (_ismsDocs) { renderIsmsDocs(); return; }   // Cache-Treffer
  mount.innerHTML = '<div class="doc-loading">Lade ISMS-Dokumente …</div>';
  try {
    const [cols, docs, drives] = await Promise.all([
      spGetIsmsColumns(),
      spGetIsmsDocs(),
      (typeof spListIsmsDrives === 'function' ? spListIsmsDrives().catch(() => []) : Promise.resolve([])),
    ]);
    _ismsCols = cols;
    _ismsDocs = docs;
    _ismsDrives = drives;
    fillIsmsFolderFilter();
    renderIsmsDocs();
  } catch (e) {
    mount.innerHTML = `<div class="col-warning" style="display:block">
      ISMS-Dokumente konnten nicht geladen werden: ${esc(e.message)}<br>
      Bitte prüfen, ob die ISMS-Site <code>sites/ISMS</code> erreichbar ist
      und dein Konto darauf Zugriff hat.</div>`;
  }
}

async function refreshIsmsDocs() {
  _ismsDocs = null; _ismsCols = null; _ismsDrives = null;
  await initIsmsDocs();
  toast('ISMS-Dokumente aktualisiert', 'success');
}

/** Manuell auf eine andere ISMS-Bibliothek umstellen (Diagnose-Leerzustand). */
async function selectIsmsLibrary(driveId) {
  const mount = document.getElementById('isms-mount');
  if (mount) mount.innerHTML = '<div class="doc-loading">Wechsle Bibliothek …</div>';
  try {
    await spSetIsmsLibrary(driveId);
    _ismsDocs = null; _ismsCols = null;
    await initIsmsDocs();
    toast('Bibliothek gewechselt.', 'success');
  } catch (e) {
    toast('Wechsel fehlgeschlagen: ' + e.message, 'error');
  }
}

function fillIsmsFolderFilter() {
  const sel = document.getElementById('filter-isms-folder');
  if (!sel) return;
  const folders = [...new Set((_ismsDocs || []).map(d => d.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  sel.innerHTML = '<option value="">Alle Ordner</option>' +
    folders.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
}

function _ismsFmtSize(bytes) {
  if (!bytes) return '–';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/** Emoji-Icon je Dateiendung. */
function _ismsIcon(name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return '📗';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return '📙';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'].includes(ext)) return '🖼️';
  if (['zip', '7z', 'rar', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['txt', 'md', 'log'].includes(ext)) return '📃';
  return '📄';
}

/** Verknüpfte Richtlinie zu einem Dokument (falls State.policies geladen ist). */
function _ismsLinkedPolicy(d) {
  const pols = (typeof State !== 'undefined' && State.policies) ? State.policies : [];
  return pols.find(p => p.dokumentItemId && p.dokumentItemId === d.driveItemId) || null;
}

let _ismsSort = { key: 'name', dir: 1 };
function sortIsmsDocs(key) {
  if (_ismsSort.key === key) _ismsSort.dir *= -1;
  else _ismsSort = { key, dir: 1 };
  renderIsmsDocs();
}

function renderIsmsDocs() {
  const mount = document.getElementById('isms-mount');
  if (!mount) return;
  const q = (document.getElementById('search-isms')?.value || '').toLowerCase().trim();
  const folder = document.getElementById('filter-isms-folder')?.value || '';
  const all = _ismsDocs || [];
  const lib = (typeof spIsmsCurrentLibrary === 'function') ? spIsmsCurrentLibrary() : '';

  // Leerzustand mit Diagnose: genutzte Bibliothek + manueller Wechsel.
  if (!all.length) {
    const drivesHtml = (_ismsDrives || []).map(d =>
      `<button class="btn btn-outline btn-sm" onclick="selectIsmsLibrary('${esc(d.id)}')">${esc(d.name)}${d.name === lib ? ' ✓' : ''}</button>`
    ).join(' ');
    mount.innerHTML = `<div class="col-warning" style="display:block">
      In der erkannten Bibliothek <b>„${esc(lib || '?')}"</b> wurden <b>keine Dateien</b> gefunden.
      Falls das nicht die richtige ISMS-Bibliothek ist, hier die passende wählen:
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${drivesHtml || '<span class="field-hint">Keine Bibliotheken lesbar – Zugriff auf sites/ISMS prüfen.</span>'}</div>
    </div>`;
    return;
  }

  let rows = all.slice();
  if (folder) rows = rows.filter(d => d.folder === folder);
  if (q) rows = rows.filter(d => (d.name + ' ' + d.folder + ' ' + (d.fields?.Title || '')).toLowerCase().includes(q));

  // Sortierung
  const sk = _ismsSort.key, dir = _ismsSort.dir;
  rows.sort((a, b) => {
    let va, vb;
    if (sk === 'size') { va = a.size; vb = b.size; }
    else if (sk === 'modified') { va = a.modified || ''; vb = b.modified || ''; }
    else if (sk === 'folder') { va = (a.folder || '').toLowerCase(); vb = (b.folder || '').toLowerCase(); }
    else { va = (a.fields?.Title || a.name).toLowerCase(); vb = (b.fields?.Title || b.name).toLowerCase(); }
    return va < vb ? -dir : va > vb ? dir : 0;
  });

  // Stats
  const folderCount = new Set(all.map(d => d.folder).filter(Boolean)).size;
  const totalSize = all.reduce((s, d) => s + (d.size || 0), 0);
  const linked = all.filter(d => _ismsLinkedPolicy(d)).length;
  const stats = `<div class="stats-grid" style="margin-bottom:16px">
    ${statCard('blue', '📄', all.length, 'Dokumente')}
    ${statCard('orange', '📁', folderCount, 'Ordner')}
    ${statCard('purple', '💾', _ismsFmtSize(totalSize), 'Gesamtgröße')}
    ${statCard('green', '🔗', linked, 'mit Richtlinie')}
  </div>`;

  const arrow = (key) => sk === key ? (dir > 0 ? ' ▲' : ' ▼') : '';
  const th = (key, label, cls) => `<th class="${cls || ''}" style="cursor:pointer;user-select:none" onclick="sortIsmsDocs('${key}')">${label}${arrow(key)}</th>`;
  const sub = `<div class="view-desc" style="margin:0 0 10px">${rows.length} von ${all.length} Dokument(en) aus Bibliothek <b>„${esc(lib || '?')}"</b> · Zeile anklicken zum Bearbeiten.</div>`;

  if (!rows.length) { mount.innerHTML = stats + sub + emptyState('Keine Treffer für die aktuelle Suche/Filterung.', '🔍'); return; }

  mount.innerHTML = stats + sub + `<div class="table-wrap"><table class="tbl">
    <thead><tr>
      <th style="width:30px"></th>
      ${th('name', 'Dokument')}
      ${th('folder', 'Ordner')}
      <th>Version</th>
      ${th('size', 'Größe', 'num')}
      ${th('modified', 'Geändert')}
      <th>Von</th>
    </tr></thead>
    <tbody>${rows.map(d => {
      const lp = _ismsLinkedPolicy(d);
      const title = d.fields?.Title || d.name;
      return `<tr onclick="openIsmsDoc('${esc(d.itemId)}')" style="cursor:pointer">
        <td style="font-size:1.1rem;text-align:center">${_ismsIcon(d.name)}</td>
        <td>
          <b>${esc(title)}</b>
          ${lp ? `<span class="ic-tag" style="margin-left:6px;background:#ecfdf5;color:#047857;font-size:.66rem">🔗 ${esc(lp.status || 'Richtlinie')}</span>` : ''}
          ${title !== d.name ? `<div style="font-size:.74rem;color:var(--c-faint)">${esc(d.name)}</div>` : ''}
        </td>
        <td style="color:var(--c-muted)">${esc(d.folder || '–')}</td>
        <td>${esc(d.fields?._UIVersionString || '–')}</td>
        <td class="num">${_ismsFmtSize(d.size)}</td>
        <td title="${esc(fmtDateTime(d.modified))}">${fmtDate(d.modified)}</td>
        <td style="color:var(--c-muted)">${esc(d.modifiedBy || '–')}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

/* ── Editor (Metadaten + Datei-Aktionen) ── */

function _ismsInput(col, val) {
  const id = `isms-f-${col.name}`;
  const v = (val == null) ? '' : val;
  if (col.type === 'readonly')
    return `<div style="font-size:.85rem;color:var(--c-muted);padding:6px 0">${esc(_ismsPersonText(v))} <span class="field-hint">(nicht bearbeitbar)</span></div>`;
  if (col.type === 'note')
    return `<textarea id="${id}">${esc(v)}</textarea>`;
  if (col.type === 'choice') {
    const opts = ['<option value="">– keine –</option>']
      .concat((col.choices || []).map(c => `<option value="${esc(c)}" ${c === v ? 'selected' : ''}>${esc(c)}</option>`));
    return `<select id="${id}">${opts.join('')}</select>`;
  }
  if (col.type === 'boolean')
    return `<select id="${id}">
      <option value="" ${v === '' ? 'selected' : ''}>– keine –</option>
      <option value="Ja" ${v === true ? 'selected' : ''}>Ja</option>
      <option value="Nein" ${v === false ? 'selected' : ''}>Nein</option></select>`;
  if (col.type === 'date')
    return `<input type="date" id="${id}" value="${esc(String(v).slice(0, 10))}">`;
  if (col.type === 'number')
    return `<input type="number" id="${id}" value="${esc(v)}">`;
  return `<input type="text" id="${id}" value="${esc(v)}">`;
}

function _ismsPersonText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(_ismsPersonText).filter(Boolean).join(', ');
  if (typeof v === 'object') return v.LookupValue || v.Title || v.DisplayName || v.Email || JSON.stringify(v);
  return String(v);
}

async function openIsmsDoc(itemId) {
  const d = (_ismsDocs || []).find(x => String(x.itemId) === String(itemId));
  if (!d) return;
  // Vollständige Metadaten lazy nachladen (die Liste hält nur Title/Version)
  if (!d.fieldsFull) {
    try {
      const full = await spGetIsmsItemFields(itemId);
      d.fields = Object.assign({}, d.fields, full);
      d.fieldsFull = true;
    } catch (e) { /* mit Teil-Feldern weitermachen */ }
  }
  const metaRows = (_ismsCols || []).length
    ? _ismsCols.map(col => `
        <div class="form-group${col.type === 'note' ? ' full' : ''}">
          <label>${esc(col.label)}</label>
          ${_ismsInput(col, d.fields?.[col.name])}
        </div>`).join('')
    : '<div class="field-hint">Keine bearbeitbaren Bibliotheks-Spalten gefunden.</div>';

  openModal(`
    <div class="modal-header">
      <h3>📄 ${esc(d.name)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="col-warning" style="display:block;background:#f9fafb;border-color:var(--c-border);color:var(--c-muted)">
        <b>Ordner:</b> ${esc(d.folder || '–')} &nbsp;·&nbsp; <b>Größe:</b> ${_ismsFmtSize(d.size)}
        &nbsp;·&nbsp; <b>Version:</b> ${esc(d.fields?._UIVersionString || '–')}
        &nbsp;·&nbsp; <b>Geändert:</b> ${fmtDateTime(d.modified)}${d.modifiedBy ? ' von ' + esc(d.modifiedBy) : ''}
      </div>

      <div style="display:flex;gap:7px;flex-wrap:wrap;margin:4px 0 16px">
        ${d.webUrl ? `<a class="btn btn-outline btn-sm" href="${esc(d.webUrl)}" target="_blank" rel="noopener">↗ In SharePoint öffnen</a>` : ''}
        <button class="btn btn-outline btn-sm" onclick="ismsPreview('${esc(d.driveItemId)}')">👁 Vorschau</button>
        <button class="btn btn-outline btn-sm" onclick="ismsShowVersions('${esc(d.driveItemId)}','${esc(d.name)}')">🕘 Versionsverlauf</button>
        <label class="btn btn-outline btn-sm" style="cursor:pointer">⬆ Neue Version
          <input type="file" style="display:none" onchange="ismsUploadVersion('${esc(d.driveItemId)}', this)">
        </label>
      </div>

      <h4 style="font-size:.82rem;font-weight:700;color:#374151;margin:0 0 8px">Metadaten</h4>
      <div class="form-grid">${metaRows}</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="ismsToRichtlinie('${esc(d.driveItemId)}')">＋ Als Richtlinie übernehmen</button>
      <div style="flex:1"></div>
      <button class="btn btn-outline" onclick="closeModal()">Schließen</button>
      ${(_ismsCols || []).length ? `<button class="btn btn-primary" id="isms-save-btn" onclick="saveIsmsDocMeta('${esc(d.itemId)}')">Metadaten speichern</button>` : ''}
    </div>`, true);
}

async function saveIsmsDocMeta(itemId) {
  const d = (_ismsDocs || []).find(x => String(x.itemId) === String(itemId));
  if (!d) return;
  const btn = document.getElementById('isms-save-btn');
  const fields = {};
  for (const col of (_ismsCols || [])) {
    if (col.type === 'readonly') continue;
    const el = document.getElementById(`isms-f-${col.name}`);
    if (!el) continue;
    let v = el.value;
    if (col.type === 'number') { if (v === '') continue; v = parseFloat(v); }
    else if (col.type === 'boolean') { if (v === '') continue; v = (v === 'Ja'); }
    else if (col.type === 'date') { if (!v) continue; v = new Date(v + 'T00:00:00Z').toISOString(); }
    fields[col.name] = v;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Speichern …'; }
  try {
    await spSaveIsmsItemFields(itemId, fields);
    Object.assign(d.fields, fields);     // Cache aktualisieren
    toast('Metadaten gespeichert ✓', 'success');
    closeModal();
    renderIsmsDocs();
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message + ' (Schreibrechte auf sites/ISMS?)', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Metadaten speichern'; }
  }
}

async function ismsPreview(driveItemId) {
  const d = (_ismsDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) return;
  try {
    const url = await spGetPreviewUrl(d.driveId, driveItemId);
    if (url) window.open(url, '_blank', 'noopener');
    else toast('Keine Vorschau verfügbar.', 'error');
  } catch (e) { toast('Vorschau-Fehler: ' + e.message, 'error'); }
}

async function ismsUploadVersion(driveItemId, input) {
  const file = input?.files?.[0];
  if (!file) return;
  toast('Lade neue Version hoch …');
  try {
    const buf = await file.arrayBuffer();
    await spIsmsUploadVersion(driveItemId, buf, file.type);
    toast('Neue Version gespeichert ✓', 'success');
    await refreshIsmsDocs();
    closeModal();
  } catch (e) {
    toast('Upload fehlgeschlagen: ' + e.message + ' (Schreibrechte auf sites/ISMS?)', 'error');
  }
}

async function ismsShowVersions(driveItemId, name) {
  const d = (_ismsDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) return;
  openModal(`<div class="modal-header"><h3>🕘 Versionen – ${esc(name)}</h3>
    <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body" id="isms-vers-body"><div class="doc-loading">Lade Versionen …</div></div>`);
  try {
    const vers = await spGetDocVersions(d.driveId, driveItemId);
    const body = document.getElementById('isms-vers-body');
    if (!body) return;
    body.innerHTML = vers.length
      ? `<table class="tbl"><thead><tr><th>Version</th><th>Geändert</th><th>Von</th><th class="num">Größe</th><th></th></tr></thead>
         <tbody>${vers.map(v => `<tr>
           <td>${esc(v.id)}</td><td>${fmtDateTime(v.modified)}</td><td>${esc(v.by || '–')}</td>
           <td class="num">${_ismsFmtSize(v.size)}</td>
           <td>${v.url ? `<a class="btn btn-outline btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">↓</a>` : ''}</td>
         </tr>`).join('')}</tbody></table>`
      : '<div class="field-hint">Kein Versionsverlauf verfügbar (Bibliotheksversionierung aktiv?).</div>';
  } catch (e) {
    const body = document.getElementById('isms-vers-body');
    if (body) body.innerHTML = `<div class="col-warning" style="display:block">Fehler: ${esc(e.message)}</div>`;
  }
}

/** ISMS-Dokument in den Richtlinien-Workflow übernehmen (Editor mit vorbefülltem Dokument). */
function ismsToRichtlinie(driveItemId) {
  const d = (_ismsDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) return;
  if (typeof newPolicy !== 'function' || typeof renderPolicyEditor !== 'function') {
    toast('Richtlinien-Editor nicht verfügbar.', 'error'); return;
  }
  _editing = newPolicy();
  _editing.title = d.fields?.Title || d.name.replace(/\.[^.]+$/, '');
  _editing.dokumentName = d.name;
  _editing.dokumentDriveId = d.driveId;
  _editing.dokumentItemId = d.driveItemId;
  _editing.dokumentUrl = d.webUrl || '';
  if (d.fields?.Kategorie) _editing.kategorie = d.fields.Kategorie;
  closeModal();
  switchView('verwaltung');     // wechselt in die Richtlinien-Verwaltung
  renderPolicyEditor();         // öffnet den Editor mit vorbefülltem Dokument
  toast('Dokument übernommen – bitte Richtlinie vervollständigen und speichern.');
}
