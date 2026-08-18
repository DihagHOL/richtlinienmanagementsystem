/**
 * Reiter „Governance-Board" (Admin)
 * =================================
 * Listet die Entwürfe aus dem Legal-SharePoint (sites/ArbeitsplatzLegal,
 * Ordner „Entwurf_010_Corporate Govenance-Board") – gleicher Zugriffsmechanismus
 * wie bei den ISMS-Dokumenten (Office/Browser bearbeiten, Versionen, Vorschau),
 * aber ohne die ISMS-eigenen Metadaten-/Workflow-Spalten.
 *
 * Ablauf: Entwürfe liegen hier, solange sie in Bearbeitung sind. Sobald ein
 * Entwurf die RMS-interne Konformitätsprüfung + Freigabe durchlaufen hat, wird
 * das Dokument von Legal an dieser Stelle überschrieben/neu erstellt und
 * veröffentlicht – „＋ Als Richtlinie übernehmen" startet genau diesen Prozess.
 */

let _govDocs = null;      // geladene Dokumente (Cache)
let _govLoading = false;  // wird gerade (im Hintergrund) nachgeladen?

async function initGovernance() {
  const mount = document.getElementById('governance-mount');
  if (!mount) return;
  if (_govDocs) { renderGovernanceDocs(); return; }   // Cache-Treffer
  mount.innerHTML = '<div class="doc-loading">Lade Governance-Board …</div>';
  try {
    _govDocs = [];
    _govLoading = true;
    const final = await spGetGovDocs((partial) => { _govDocs = partial.slice(); renderGovernanceDocs(); });
    _govDocs = final;
    _govLoading = false;
    renderGovernanceDocs();
  } catch (e) {
    _govLoading = false;
    mount.innerHTML = `<div class="col-warning" style="display:block">
      Governance-Board konnte nicht geladen werden: ${esc(e.message)}<br>
      Bitte prüfen, ob <code>sites/ArbeitsplatzLegal</code> erreichbar ist, der Ordner
      „${esc(GOV.folderPath)}" existiert und Ihr Konto darauf Zugriff hat.</div>`;
  }
}

async function refreshGovernanceDocs() {
  _govDocs = null;
  await initGovernance();
  toast('Governance-Board aktualisiert', 'success');
}

/* Dateigröße, Datei-Icon und Office-Schema kommen aus js/util.js
   (fmtFileSize, fileIcon, officeScheme) – vorher je Ansicht eine eigene Kopie. */

/* ── Ordner-Baum (Navigation links neben der Dokumentliste) ── */
let _govFolder = '';         // aktuell gewählter Ordner ('' = alle)
let _govExpanded = null;      // Set aufgeklappter Ordnerpfade (null = noch nicht initialisiert)

/** Baum aus den Ordnerpfaden der Entwürfe bauen; count je Knoten inkl. Unterordner. */
function _govBuildTree(docs) {
  const root = { name: 'Governance-Board', path: '', children: {}, count: 0 };
  const ensure = (path) => {
    let node = root, cur = '';
    for (const part of String(path || '').split('/').filter(Boolean)) {
      cur = cur ? cur + '/' + part : part;
      node = (node.children[part] = node.children[part] || { name: part, path: cur, children: {}, count: 0 });
    }
    return node;
  };
  for (const d of docs) {
    ensure(d.folder || '');                     // Ordnerknoten anlegen (auch leere Zwischenordner)
    root.count++;                               // Gesamtzahl am Wurzelknoten
    let cur = '';
    for (const part of String(d.folder || '').split('/').filter(Boolean)) {
      cur = cur ? cur + '/' + part : part;
      ensure(cur).count++;                      // jeder Vorfahr zählt das Dokument mit
    }
  }
  return root;
}

/** Einen Baumknoten (rekursiv) als HTML rendern. */
function _govTreeNodeHtml(node, depth) {
  const kids = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const hasKids = kids.length > 0;
  const expanded = _govExpanded.has(node.path);
  const sel = _govFolder === node.path;
  const caret = hasKids ? (expanded ? '▾' : '▸') : '';
  const html = `<div class="gov-tree-node${sel ? ' sel' : ''}" style="padding-left:${6 + depth * 15}px"
    role="treeitem" tabindex="0" aria-level="${depth + 1}" aria-selected="${sel ? 'true' : 'false'}"${hasKids ? ` aria-expanded="${expanded ? 'true' : 'false'}"` : ''}
    onclick="govSelectFolder('${esc(node.path)}')"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();govSelectFolder('${esc(node.path)}')}${hasKids ? `else if(event.key==='ArrowRight'&&'${expanded}'==='false'){event.preventDefault();govToggleFolder('${esc(node.path)}')}else if(event.key==='ArrowLeft'&&'${expanded}'==='true'){event.preventDefault();govToggleFolder('${esc(node.path)}')}` : ''}">
    <span class="gov-tree-caret"${hasKids ? ` onclick="event.stopPropagation();govToggleFolder('${esc(node.path)}')"` : ''}>${caret}</span>
    <span>${node.path === '' ? '🗂' : (expanded && hasKids ? '📂' : '📁')}</span>
    <span class="gov-tree-label" title="${esc(node.name)}">${esc(node.name)}</span>
    <span class="gov-tree-count">${node.count}</span>
  </div>`;
  return html + ((hasKids && expanded) ? kids.map(k => _govTreeNodeHtml(k, depth + 1)).join('') : '');
}

function govSelectFolder(path) { _govFolder = path || ''; renderGovernanceDocs(); }
function govToggleFolder(path) {
  if (_govExpanded.has(path)) _govExpanded.delete(path); else _govExpanded.add(path);
  renderGovernanceDocs();
}

let _govSort = { key: 'modified', dir: -1 };
function sortGovDocs(key) {
  if (_govSort.key === key) _govSort.dir *= -1;
  else _govSort = { key, dir: key === 'modified' ? -1 : 1 };
  renderGovernanceDocs();
}

function renderGovernanceDocs() {
  const mount = document.getElementById('governance-mount');
  if (!mount) return;
  const q = (document.getElementById('search-governance')?.value || '').toLowerCase().trim();
  const all = _govDocs || [];

  if (!all.length && _govLoading) {
    mount.innerHTML = '<div class="doc-loading">Lade Governance-Board …</div>';
    return;
  }
  if (!all.length) {
    mount.innerHTML = emptyState(`Keine Entwürfe im Ordner „${GOV.folderPath}" gefunden.`, '📄');
    return;
  }

  // Ordner-Baum aus ALLEN Entwürfen bauen (unabhängig von Suche/Auswahl)
  const tree = _govBuildTree(all);
  if (_govExpanded === null) _govExpanded = new Set(['']);   // Wurzel initial aufgeklappt
  // Falls der gewählte Ordner nicht mehr existiert → zurück auf „alle"
  if (_govFolder) {
    const exists = all.some(d => d.folder === _govFolder || (d.folder || '').startsWith(_govFolder + '/'));
    if (!exists) _govFolder = '';
  }
  const treeHtml = `<aside class="gov-tree" role="tree" aria-label="Ordnerstruktur des Governance-Boards">${_govTreeNodeHtml(tree, 0)}</aside>`;

  let rows = all.slice();
  // Präfix-Match: gewählter Ordner inkl. aller Unterordner (z. B. „Anhänge/2024")
  if (_govFolder) rows = rows.filter(d => d.folder === _govFolder || (d.folder || '').startsWith(_govFolder + '/'));
  if (q) rows = rows.filter(d => (d.name + ' ' + d.folder).toLowerCase().includes(q));

  const sk = _govSort.key, dir = _govSort.dir;
  rows.sort((a, b) => {
    let va = a[sk], vb = b[sk];
    if (sk === 'size') return (va - vb) * dir;
    va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase();
    return va < vb ? -dir : va > vb ? dir : 0;
  });

  const ort = _govFolder ? ` · Ordner: <b>${esc(_govFolder)}</b>` : '';
  const sub = `<div class="view-desc" style="margin:0 0 12px">
    <b>${rows.length}</b> Entwurf/Entwürfe aus dem <b>Governance-Board</b> (Legal)${ort}
    ${_govLoading ? ' · <span style="color:var(--c-primary)">lädt weiter …</span>' : ''} · Zeile anklicken zum Öffnen.</div>`;

  const arrow = (key) => sk === key ? (dir > 0 ? ' ▲' : ' ▼') : '';
  const th = (key, label, cls) => `<th class="${cls || ''}" style="cursor:pointer;user-select:none" onclick="sortGovDocs('${key}')">${label}${arrow(key)}</th>`;

  const docsHtml = !rows.length
    ? sub + emptyState('Keine Treffer in diesem Ordner / für die aktuelle Suche.', '🔍')
    : sub + `<div class="table-wrap"><table class="tbl">
      <thead><tr>
        <th style="width:30px"></th>
        ${th('name', 'Dokument')}
        ${th('folder', 'Ordner')}
        ${th('modified', 'Zuletzt geändert')}
        <th>Von</th>
        ${th('size', 'Größe', 'num')}
      </tr></thead>
      <tbody>${rows.map(d => `
        <tr onclick="openGovernanceDoc('${esc(d.driveItemId)}')" style="cursor:pointer">
          <td style="font-size:1.1rem;text-align:center">${fileIcon(d.name)}</td>
          <td><b>${esc(d.name)}</b></td>
          <td style="color:var(--c-muted)">${esc(d.folder || '–')}</td>
          <td style="color:var(--c-muted)">${d.modified ? fmtDateTime(d.modified) : '–'}</td>
          <td style="color:var(--c-muted)">${esc(d.modifiedBy || '–')}</td>
          <td class="num" style="color:var(--c-muted)">${fmtFileSize(d.size)}</td>
        </tr>`).join('')}</tbody></table></div>`;

  mount.innerHTML = `<div class="gov-layout">${treeHtml}<div class="gov-docs">${docsHtml}</div></div>`;
}

function openGovernanceDoc(driveItemId) {
  const d = (_govDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) return;
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('governance');
  openModal(`
    <div class="modal-header">
      <h3>📄 ${esc(d.name)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="col-warning" style="display:block;background:#f9fafb;border-color:var(--c-border);color:var(--c-muted)">
        <b>Ordner:</b> ${esc(d.folder || GOV.folderPath)}
        &nbsp;·&nbsp; <b>Zuletzt geändert:</b> ${fmtDateTime(d.modified)}${d.modifiedBy ? ' von ' + esc(d.modifiedBy) : ''}
        &nbsp;·&nbsp; <b>Größe:</b> ${fmtFileSize(d.size)}
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin:4px 0 4px">
        ${officeScheme(d.name) ? `<button class="btn btn-primary btn-sm" onclick="govEditOffice('${esc(d.driveItemId)}')">✏️ In Office bearbeiten</button>` : ''}
        ${d.webUrl ? `<button class="btn btn-outline btn-sm" onclick="govEditWeb('${esc(d.driveItemId)}')">🌐 Im Browser bearbeiten</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="govPreview('${esc(d.driveItemId)}')">👁 Vorschau</button>
        <button class="btn btn-outline btn-sm" onclick="govShowVersions('${esc(d.driveItemId)}','${esc(d.name)}')">🕘 Versionsverlauf</button>
        ${d.webUrl ? `<a class="btn btn-outline btn-sm" href="${esc(d.webUrl)}" target="_blank" rel="noopener">↗ SharePoint</a>` : ''}
      </div>
      ${!canWrite ? `<div class="field-hint" style="margin-top:6px">👁 Nur Lesezugriff auf „Governance-Board" – Übernahme als Richtlinie ist gesperrt.</div>` : ''}
    </div>
    <div class="modal-footer">
      ${canWrite ? `<button class="btn btn-ghost" onclick="govToRichtlinie('${esc(d.driveItemId)}')">＋ Als Regelwerk übernehmen</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-outline" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

function govEditOffice(driveItemId) {
  const d = (_govDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) { toast('Keine Datei-URL verfügbar.', 'error'); return; }
  const scheme = officeScheme(d.name);
  const fileUrl = d.fileUrl || d.webUrl;
  if (scheme && fileUrl) {
    window.location.href = `${scheme}:ofe|u|${fileUrl}`;
    toast('Öffne in Office … Öffnet sich nichts? „🌐 Im Browser bearbeiten" nutzen.');
  } else if (d.webUrl) {
    govEditWeb(driveItemId);
  } else {
    toast('Keine Datei-URL verfügbar.', 'error');
  }
}

function _govWebEditUrl(d) {
  let u = d.webUrl || '';
  if (/Doc\.aspx/i.test(u)) {
    u = u.replace(/([?&])action=[^&]*/i, '$1action=edit');
    if (!/[?&]action=/i.test(u)) u += (u.includes('?') ? '&' : '?') + 'action=edit';
    return u;
  }
  if (d.fileUrl) return d.fileUrl + (d.fileUrl.includes('?') ? '&' : '?') + 'web=1';
  return u;
}

function govEditWeb(driveItemId) {
  const d = (_govDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) { toast('Keine Datei-URL verfügbar.', 'error'); return; }
  const url = _govWebEditUrl(d);
  if (!url) { toast('Keine Datei-URL verfügbar.', 'error'); return; }
  window.open(url, '_blank', 'noopener');
  toast('Öffne im Browser-Office … Beim Speichern entsteht automatisch eine neue Version.');
}

let _govPrevSeq = 0;
let _govPrevLoaded = false;

function govPrevOnload(seq) {
  if (seq !== _govPrevSeq) return;
  _govPrevLoaded = true;
  const ld = document.getElementById('gov-prev-loading'); if (ld) ld.style.display = 'none';
  const fb = document.getElementById('gov-prev-fallback'); if (fb) fb.style.display = 'none';
  const fr = document.getElementById('gov-prev-frame'); if (fr) fr.style.display = 'block';
}

async function govPreview(driveItemId) {
  const d = (_govDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) return;
  toast('Vorschau wird geladen …');
  let url;
  try { url = await spGetPreviewUrl(d.driveId, driveItemId); }
  catch (e) { toast('Vorschau-Fehler: ' + e.message, 'error'); return; }
  if (!url) {
    if (d.webUrl) window.open(d.webUrl, '_blank', 'noopener');
    else toast('Keine Vorschau verfügbar.', 'error');
    return;
  }
  const spBtn = d.webUrl ? `<a class="btn btn-primary btn-sm" href="${esc(d.webUrl)}" target="_blank" rel="noopener">↗ In SharePoint öffnen</a>` : '';
  const seq = ++_govPrevSeq;
  _govPrevLoaded = false;
  openModal(`
    <div class="modal-header"><h3>👁 ${esc(d.name)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body" style="padding:0;position:relative;min-height:62vh">
      <div id="gov-prev-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--c-muted)">
        <span class="sync-spinner"></span> Vorschau wird geladen …</div>
      <div id="gov-prev-fallback" style="display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px;text-align:center;min-height:62vh">
        <div style="font-size:2rem">📄</div>
        <div style="font-weight:600">Die Vorschau lässt sich hier nicht einbetten.</div>
        <div class="field-hint">Das Dokument direkt in SharePoint öffnen.</div>
        ${spBtn}
      </div>
      <iframe id="gov-prev-frame" src="${esc(url)}" title="Dokumentvorschau" onload="govPrevOnload(${seq})"
        style="width:100%;height:74vh;border:0;display:block" allowfullscreen></iframe>
    </div>
    <div class="modal-footer">
      ${spBtn}
      <div style="flex:1"></div>
      <button class="btn btn-outline" onclick="closeModal()">Schließen</button>
    </div>`, true);

  setTimeout(() => {
    if (seq !== _govPrevSeq || _govPrevLoaded) return;
    const fb = document.getElementById('gov-prev-fallback');
    const fr = document.getElementById('gov-prev-frame');
    if (!fb || !fr) return;
    const ld = document.getElementById('gov-prev-loading'); if (ld) ld.style.display = 'none';
    fr.style.display = 'none';
    fb.style.display = 'flex';
  }, 7000);
}

async function govShowVersions(driveItemId, name) {
  const d = (_govDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) return;
  const spLink = d.webUrl
    ? `<div class="field-hint" style="margin-bottom:10px">Kommentare je Version sind im
        <a href="${esc(d.webUrl)}" target="_blank" rel="noopener">SharePoint-Versionsverlauf</a> sichtbar
        (über die Graph-API nicht abrufbar).</div>` : '';
  openModal(`<div class="modal-header"><h3>🕘 Versionen – ${esc(name)}</h3>
    <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body" id="gov-vers-body">${spLink}<div class="doc-loading">Lade Versionen …</div></div>`);
  try {
    const vers = await spGetDocVersions(d.driveId, driveItemId);
    const body = document.getElementById('gov-vers-body');
    if (!body) return;
    body.innerHTML = spLink + (vers.length
      ? `<table class="tbl"><thead><tr><th>Version</th><th>Geändert</th><th>Von</th><th class="num">Größe</th><th></th></tr></thead>
         <tbody>${vers.map(v => `<tr>
           <td>${esc(v.id)}</td><td>${fmtDateTime(v.modified)}</td><td>${esc(v.by || '–')}</td>
           <td class="num">${fmtFileSize(v.size)}</td>
           <td>${v.url ? `<a class="btn btn-outline btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">↓</a>` : ''}</td>
         </tr>`).join('')}</tbody></table>`
      : '<div class="field-hint">Kein Versionsverlauf verfügbar (Bibliotheksversionierung aktiv?).</div>');
  } catch (e) {
    const body = document.getElementById('gov-vers-body');
    if (body) body.innerHTML = `<div class="col-warning" style="display:block">Fehler: ${esc(e.message)}</div>`;
  }
}

/** Entwurf aus dem Governance-Board in den Richtlinien-Workflow übernehmen. */
function govToRichtlinie(driveItemId) {
  if (typeof canWriteTab === 'function' && !canWriteTab('governance')) {
    toast('Nur Lesezugriff auf „Governance-Board".', 'error'); return;
  }
  const d = (_govDocs || []).find(x => x.driveItemId === driveItemId);
  if (!d) return;
  if (typeof newPolicy !== 'function' || typeof renderPolicyEditor !== 'function') {
    toast('Richtlinien-Editor nicht verfügbar.', 'error'); return;
  }
  _editing = newPolicy();
  _editing.title = d.name.replace(/\.[^.]+$/, '');
  _editing.dokumentName = d.name;
  _editing.dokumentDriveId = d.driveId;
  _editing.dokumentItemId = d.driveItemId;
  _editing.dokumentUrl = d.webUrl || '';
  closeModal();
  switchView('verwaltung');
  renderPolicyEditor();
  toast('Entwurf aus dem Governance-Board übernommen – bitte Richtlinie vervollständigen und speichern.');
}
