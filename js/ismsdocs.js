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
let _ismsLoading = false; // wird gerade (im Hintergrund) nachgeladen?

async function initIsmsDocs() {
  const mount = document.getElementById('isms-mount');
  if (!mount) return;
  if (_ismsDocs) { renderIsmsDocs(); return; }   // Cache-Treffer
  mount.innerHTML = '<div class="doc-loading">Lade ISO-27001-Dokumente …</div>';
  try {
    // Spalten (Feld-Auflösung) + Bibliotheken (Diagnose) zuerst, dann Dokumente progressiv
    const [cols, drives] = await Promise.all([
      spGetIsmsColumns(),
      (typeof spListIsmsDrives === 'function' ? spListIsmsDrives().catch(() => []) : Promise.resolve([])),
    ]);
    _ismsCols = cols;
    _ismsDrives = drives;
    _ismsDocs = [];
    _ismsLoading = true;
    const final = await spGetIsmsDocs(null, (partial) => {   // nach jeder Seite rendern
      _ismsDocs = partial.slice();
      fillIsmsFolderFilter();
      renderIsmsDocs();
    });
    _ismsDocs = final;
    _ismsLoading = false;
    fillIsmsFolderFilter();
    renderIsmsDocs();
  } catch (e) {
    _ismsLoading = false;
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
  // Es wird serverseitig nur der ISO-27001-Ordner geladen; das Dropdown bietet
  // dessen Unterordner zur Eingrenzung (oder ist leer, wenn alles flach liegt).
  const folders = [...new Set((_ismsDocs || []).map(d => d.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const wrap = sel.closest('.search-box') ? sel : sel;   // (sel selbst)
  sel.style.display = folders.length > 1 ? '' : 'none';   // bei nur einem Ordner ausblenden
  sel.innerHTML = '<option value="">Alle (ISO 27001)</option>' +
    folders.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
}

/* ── Anzeige-/Bearbeitungsfelder (gewünscht): per Anzeige-Label auf die echten
      SharePoint-Spaltennamen aufgelöst (interne Namen sind unbekannt). ── */
const ISMS_FIELDS = [
  { key: 'stand',          label: 'Bearbeitungsstand',    re: /bearbeitungs(stand|status)|status/i },
  { key: 'vertraulich',    label: 'Vertraulichkeit',      re: /vertraulich|geheimhaltung|einstufung|classification/i },
  { key: 'unterschrieben', label: 'Unterschrieben von',   re: /unterschrieben|unterzeichnet|signed|freigegeben.*von|genehmigt.*von/i },
  { key: 'angefasst',      label: 'Zuletzt angefasst am', re: /zuletzt.*(angefasst|geändert|bearbeitet)|angefasst|geändert|geaendert|modified/i, date: true, fallbackModified: true },
];

function _ismsColFor(re) {
  const cols = (typeof spGetIsmsAllColumns === 'function') ? spGetIsmsAllColumns() : [];
  return cols.find(c => re.test(c.label || '') || re.test(c.name || '')) || null;
}
function _ismsScalar(v) {
  if (v == null) return '';
  if (typeof v === 'object') return v.LookupValue || v.Title || v.DisplayName || v.Email || '';
  return String(v);
}
/** Roh-Wert eines gewünschten Feldes (für Sortierung). */
function _ismsFieldRaw(d, f) {
  const c = _ismsColFor(f.re);
  let v = (c && d.fields) ? d.fields[c.name] : undefined;
  if ((v == null || v === '') && f.fallbackModified) v = d.modified;
  return v;
}
/** Anzeige-Wert eines gewünschten Feldes. */
function _ismsFieldDisplay(d, f) {
  const v = _ismsFieldRaw(d, f);
  if (v == null || v === '') return '–';
  if (Array.isArray(v)) return v.map(_ismsScalar).filter(Boolean).join(', ') || '–';
  const s = _ismsScalar(v);
  if (f.date || /^\d{4}-\d{2}-\d{2}T/.test(s)) return fmtDate(s);
  return s || '–';
}

/** Die „Bearbeitungsstand"-Spalte, wenn sie eine Auswahl-Spalte mit vorhandenen
 *  Optionen ist (dann inline auswählbar; es werden NUR die SP-Optionen genutzt). */
function _ismsStatusCol() {
  const re = (ISMS_FIELDS.find(f => f.key === 'stand') || {}).re;
  if (!re) return null;
  return (_ismsCols || []).find(c =>
    c.type === 'choice' && (c.choices || []).length && (re.test(c.label || '') || re.test(c.name || ''))) || null;
}

/** Bearbeitungsstand direkt aus der Liste setzen (PATCH, ohne Editor zu öffnen). */
async function ismsSetStatus(itemId, value, sel) {
  const d = (_ismsDocs || []).find(x => String(x.itemId) === String(itemId));
  const sc = _ismsStatusCol();
  if (!d || !sc) return;
  if (sel) sel.disabled = true;
  try {
    await spSaveIsmsItemFields(itemId, { [sc.name]: value });
    d.fields[sc.name] = value;
    toast('Bearbeitungsstand gespeichert ✓', 'success');
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message + ' (Schreibrechte auf sites/ISMS?)', 'error');
    renderIsmsDocs();   // Auswahl auf gespeicherten Stand zurücksetzen
  } finally {
    if (sel) sel.disabled = false;
  }
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

  // Während des (Hintergrund-)Ladens noch keine Diagnose zeigen
  if (!all.length && _ismsLoading) {
    mount.innerHTML = '<div class="doc-loading">Lade ISO-27001-Dokumente …</div>';
    return;
  }
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
  // Präfix-Match: gewählter Ordner inkl. aller Unterordner (z.B. ISO27001/Anhänge)
  if (folder) rows = rows.filter(d => d.folder === folder || (d.folder || '').startsWith(folder + '/'));
  if (q) rows = rows.filter(d => (d.name + ' ' + d.folder + ' ' + (d.fields?.Title || '')).toLowerCase().includes(q));

  // Sortierung (Name oder eines der gewünschten Felder)
  const sk = _ismsSort.key, dir = _ismsSort.dir;
  const fByKey = ISMS_FIELDS.find(f => f.key === sk);
  rows.sort((a, b) => {
    let va, vb;
    if (fByKey) { va = String(_ismsFieldRaw(a, fByKey) ?? '').toLowerCase(); vb = String(_ismsFieldRaw(b, fByKey) ?? '').toLowerCase(); }
    else { va = (a.fields?.Title || a.name).toLowerCase(); vb = (b.fields?.Title || b.name).toLowerCase(); }
    return va < vb ? -dir : va > vb ? dir : 0;
  });

  const linked = all.filter(d => _ismsLinkedPolicy(d)).length;
  const sub = `<div class="view-desc" style="margin:0 0 12px">
    <b>${rows.length}</b> Dokument(e) aus <b>ISO 27001</b>${linked ? ` · ${linked} mit Richtlinie verknüpft` : ''}
    ${_ismsLoading ? ' · <span style="color:var(--c-primary)">lädt weiter …</span>' : ''} · Zeile anklicken zum Bearbeiten.</div>`;

  if (!rows.length) { mount.innerHTML = sub + emptyState('Keine Treffer für die aktuelle Suche/Filterung.', '🔍'); return; }

  const arrow = (key) => sk === key ? (dir > 0 ? ' ▲' : ' ▼') : '';
  const th = (key, label, cls) => `<th class="${cls || ''}" style="cursor:pointer;user-select:none" onclick="sortIsmsDocs('${key}')">${label}${arrow(key)}</th>`;
  const statusCol = _ismsStatusCol();   // Bearbeitungsstand inline auswählbar, falls Auswahl-Spalte

  mount.innerHTML = sub + `<div class="table-wrap"><table class="tbl">
    <thead><tr>
      <th style="width:30px"></th>
      ${th('name', 'Dokument')}
      ${ISMS_FIELDS.map(f => th(f.key, f.label)).join('')}
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
        ${ISMS_FIELDS.map(f => {
          if (f.key === 'stand' && statusCol) {
            const cur = (d.fields && d.fields[statusCol.name] != null) ? String(d.fields[statusCol.name]) : '';
            const choices = statusCol.choices.slice();
            if (cur && !choices.includes(cur)) choices.unshift(cur);   // bestehenden Wert sichtbar halten
            const opts = ['<option value="">– wählen –</option>']
              .concat(choices.map(c => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(c)}</option>`));
            return `<td onclick="event.stopPropagation()">
              <select class="sort-select" style="font-size:.8rem;padding:4px 6px;max-width:170px"
                onchange="ismsSetStatus('${esc(d.itemId)}', this.value, this)">${opts.join('')}</select></td>`;
          }
          return `<td style="color:var(--c-muted)">${esc(_ismsFieldDisplay(d, f))}</td>`;
        }).join('')}
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
        <b>Version:</b> ${esc(d.fields?._UIVersionString || '–')}
        &nbsp;·&nbsp; <b>Zuletzt angefasst:</b> ${fmtDateTime(d.modified)}${d.modifiedBy ? ' von ' + esc(d.modifiedBy) : ''}
      </div>

      <div style="display:flex;gap:7px;flex-wrap:wrap;margin:4px 0 16px">
        <button class="btn btn-primary btn-sm" onclick="ismsEditOffice('${esc(d.driveItemId)}')">✏️ Dokument bearbeiten</button>
        <button class="btn btn-outline btn-sm" onclick="ismsNewVersion('${esc(d.driveItemId)}','${esc(d.name)}')">⬆ Neue Version hochladen</button>
        <button class="btn btn-outline btn-sm" onclick="ismsShowVersions('${esc(d.driveItemId)}','${esc(d.name)}')">🕘 Versionsverlauf</button>
        <button class="btn btn-outline btn-sm" onclick="ismsPreview('${esc(d.driveItemId)}')">👁 Vorschau</button>
        ${d.webUrl ? `<a class="btn btn-outline btn-sm" href="${esc(d.webUrl)}" target="_blank" rel="noopener">↗ SharePoint</a>` : ''}
      </div>

      <h4 style="font-size:.82rem;font-weight:700;color:#374151;margin:0 0 8px">Metadaten</h4>
      <div class="form-grid">${metaRows}</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="proposeIsmsChange('${esc(d.driveItemId)}')">✏️ Änderung vorschlagen</button>
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

/** Office-Protokoll je Dateityp (öffnet die Datei zum Bearbeiten im Desktop-Office). */
function _ismsOfficeScheme(name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf'].includes(ext)) return 'ms-word';
  if (['xls', 'xlsx', 'xlsm', 'xlsb', 'csv'].includes(ext)) return 'ms-excel';
  if (['ppt', 'pptx', 'pps', 'ppsx'].includes(ext)) return 'ms-powerpoint';
  return null;
}

/** Dokument direkt bearbeiten: Office-Datei → Desktop-Office (speichert automatisch
 *  eine neue SharePoint-Version); andere → in SharePoint öffnen (dort Web-Edit). */
function ismsEditOffice(driveItemId) {
  const d = (_ismsDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d || !d.webUrl) { toast('Keine Datei-URL verfügbar.', 'error'); return; }
  const scheme = _ismsOfficeScheme(d.name);
  if (scheme) {
    window.location.href = `${scheme}:ofe|u|${d.webUrl}`;   // Office-URI-Schema
    toast('Öffne in Office … Beim Speichern entsteht automatisch eine neue Version.');
  } else {
    window.open(d.webUrl, '_blank', 'noopener');
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

function ismsNewVersion(driveItemId, name) {
  const canOffice = !!_ismsOfficeScheme(name);
  openModal(`
    <div class="modal-header"><h3>Neue Version – ${esc(name)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div style="border:1px solid var(--c-border);border-radius:9px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:600;font-size:.88rem;margin-bottom:4px">Variante A · Direkt bearbeiten</div>
        <div class="field-hint" style="margin-bottom:8px">${canOffice
          ? 'Öffnet das Dokument in Office. Beim Speichern legt SharePoint automatisch eine neue Version an.'
          : 'Öffnet das Dokument in SharePoint – dort bearbeiten und speichern (automatische Versionierung).'}</div>
        <button class="btn btn-primary btn-sm" onclick="closeModal();ismsEditOffice('${esc(driveItemId)}')">✏️ Dokument bearbeiten</button>
      </div>
      <div style="border:1px solid var(--c-border);border-radius:9px;padding:12px 14px">
        <div style="font-weight:600;font-size:.88rem;margin-bottom:8px">Variante B · Geänderte Datei hochladen</div>
        <div class="form-grid">
          <div class="form-group full">
            <label>Datei <span class="req">*</span></label>
            <input type="file" id="isms-ver-file">
          </div>
          <div class="form-group full">
            <label>Änderungsnotiz <span class="req">*</span></label>
            <textarea id="isms-ver-note" placeholder="Was wurde geändert? Wird als Versionskommentar gespeichert."></textarea>
          </div>
        </div>
        <div class="field-hint">Die Notiz wird – sofern die Bibliothek Versionierung nutzt – als
          SharePoint-Versionskommentar abgelegt.</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="isms-ver-btn" onclick="ismsDoUploadVersion('${esc(driveItemId)}')">Hochladen</button>
    </div>`);
}

async function ismsDoUploadVersion(driveItemId) {
  const file = document.getElementById('isms-ver-file')?.files?.[0];
  const note = (document.getElementById('isms-ver-note')?.value || '').trim();
  if (!file) { toast('Bitte eine Datei wählen.', 'error'); return; }
  if (!note) { toast('Bitte eine Änderungsnotiz eingeben.', 'error'); document.getElementById('isms-ver-note')?.focus(); return; }
  const btn = document.getElementById('isms-ver-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Lädt …'; }
  try {
    const buf = await file.arrayBuffer();
    await spIsmsUploadVersion(driveItemId, buf, file.type, note);
    toast('Neue Version gespeichert ✓', 'success');
    closeModal();
    await refreshIsmsDocs();
  } catch (e) {
    toast('Upload fehlgeschlagen: ' + e.message + ' (Schreibrechte auf sites/ISMS?)', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Hochladen'; }
  }
}

async function ismsShowVersions(driveItemId, name) {
  const d = (_ismsDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) return;
  const spLink = d.webUrl
    ? `<div class="field-hint" style="margin-bottom:10px">Kommentare je Version sind im
        <a href="${esc(d.webUrl)}" target="_blank" rel="noopener">SharePoint-Versionsverlauf</a> sichtbar
        (über die Graph-API nicht abrufbar).</div>` : '';
  openModal(`<div class="modal-header"><h3>🕘 Versionen – ${esc(name)}</h3>
    <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body" id="isms-vers-body">${spLink}<div class="doc-loading">Lade Versionen …</div></div>`);
  try {
    const vers = await spGetDocVersions(d.driveId, driveItemId);
    const body = document.getElementById('isms-vers-body');
    if (!body) return;
    body.innerHTML = spLink + (vers.length
      ? `<table class="tbl"><thead><tr><th>Version</th><th>Geändert</th><th>Von</th><th class="num">Größe</th><th></th></tr></thead>
         <tbody>${vers.map(v => `<tr>
           <td>${esc(v.id)}</td><td>${fmtDateTime(v.modified)}</td><td>${esc(v.by || '–')}</td>
           <td class="num">${_ismsFmtSize(v.size)}</td>
           <td>${v.url ? `<a class="btn btn-outline btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">↓</a>` : ''}</td>
         </tr>`).join('')}</tbody></table>`
      : '<div class="field-hint">Kein Versionsverlauf verfügbar (Bibliotheksversionierung aktiv?).</div>');
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

/* ═══════════════════════════════════════════════════
   Änderungsvorschläge per Mail (jeder Mitarbeiter)
   Empfänger: Dokument-Verantwortlich (Metadaten) + ISMS-Verantwortliche
   (Einstellungen) + Admin-Fallback.
═══════════════════════════════════════════════════ */

let _proposalCtx = null;

/** Aus ISMS-Reiter (Admin): Vorschlag zu einem Dokument. */
function proposeIsmsChange(driveItemId) {
  const d = (_ismsDocs || []).find(x => x.driveItemId === driveItemId);
  openProposalModal(d ? (d.fields?.Title || d.name) : 'Dokument', { doc: d || null });
}

/** Aus dem Detail-Reader (jeder Mitarbeiter): Vorschlag zu einer Richtlinie. */
function proposePolicyChange(policyId) {
  const p = (typeof State !== 'undefined' && State.policies) ? State.policies.find(x => x.id === policyId) : null;
  openProposalModal(p ? p.title : 'Richtlinie', {});
}

function openProposalModal(titel, ctx) {
  _proposalCtx = Object.assign({ titel }, ctx || {});
  openModal(`
    <div class="modal-header"><h3>✏️ Änderung vorschlagen</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">Vorschlag zu <b>${esc(titel)}</b> – geht per E-Mail an die Verantwortlichen.</div>
      <div class="form-grid">
        <div class="form-group full"><label>Abschnitt / Betreff</label>
          <input type="text" id="prop-betreff" placeholder="z. B. Kapitel 4.2 Zugriffskontrolle"></div>
        <div class="form-group full"><label>Vorgeschlagene Änderung <span class="req">*</span></label>
          <textarea id="prop-text" placeholder="Was soll geändert werden?"></textarea></div>
        <div class="form-group full"><label>Begründung</label>
          <textarea id="prop-grund" placeholder="Warum ist die Änderung sinnvoll?"></textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="prop-btn" onclick="sendProposal()">Vorschlag senden</button>
    </div>`);
}

function _extractEmails(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(_extractEmails);
  if (typeof v === 'object') return [v.Email || v.email || ''].filter(Boolean);
  const s = String(v);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim()) ? [s.trim()] : [];
}

function _proposalRecipients(ctx) {
  const out = [];
  const d = ctx && ctx.doc;
  if (d && d.fields) {
    for (const [k, v] of Object.entries(d.fields)) {
      if (/verantwort|owner|ansprech/i.test(k)) out.push(..._extractEmails(v));
    }
  }
  if (typeof getIsmsVerantwortlich === 'function') out.push(...getIsmsVerantwortlich());
  if (!out.length && typeof getAccessConfig === 'function') out.push(...((getAccessConfig().admins) || []));
  return [...new Set(out.map(e => String(e).trim().toLowerCase()).filter(Boolean))];
}

async function sendProposal() {
  const ctx = _proposalCtx || {};
  const text = (document.getElementById('prop-text')?.value || '').trim();
  if (!text) { toast('Bitte die vorgeschlagene Änderung eingeben.', 'error'); document.getElementById('prop-text')?.focus(); return; }
  const recipients = _proposalRecipients(ctx);
  if (!recipients.length) { toast('Keine Empfänger – bitte in den Einstellungen ISMS-Verantwortliche hinterlegen.', 'error'); return; }
  const betreff = (document.getElementById('prop-betreff')?.value || '').trim();
  const grund = (document.getElementById('prop-grund')?.value || '').trim();
  const btn = document.getElementById('prop-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sende …'; }
  try {
    const who = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : 'Mitarbeiter';
    const br = s => esc(s).replace(/\n/g, '<br>');
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937">
      <p><b>Änderungsvorschlag</b> zu: <b>${esc(ctx.titel || '')}</b></p>
      ${betreff ? `<p><b>Abschnitt/Betreff:</b> ${esc(betreff)}</p>` : ''}
      <p><b>Vorschlag:</b><br>${br(text)}</p>
      ${grund ? `<p><b>Begründung:</b><br>${br(grund)}</p>` : ''}
      <p style="color:#6b7280;font-size:12px;margin-top:16px">Eingereicht von ${esc(who)} · ${new Date().toLocaleString('de-DE')}<br>
      Automatisch aus dem DIHAG Richtlinienmanagement.</p></div>`;
    await spSendMail(recipients, `Änderungsvorschlag: ${ctx.titel || ''}`.slice(0, 200), html);
    toast('Vorschlag gesendet ✓', 'success');
    closeModal();
  } catch (e) {
    toast('Senden fehlgeschlagen: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Vorschlag senden'; }
  }
}
