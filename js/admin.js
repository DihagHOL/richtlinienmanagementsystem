/**
 * Admin- & Genehmiger-Sicht
 * =========================
 * - Verwaltung:  Richtlinien-CRUD, Dokumentwähler (ISMS-Bibliothek), Quiz-Editor
 * - Freigaben:   InReview → Veröffentlicht (Genehmiger)
 * - Compliance:  Soll/Ist je Richtlinie (Mitarbeiter aus Graph), CSV-Export
 * - Einstellungen: access-config.json (Admins/Genehmiger)
 */

const AdminState = { members: null, allAcks: null, lastComplianceRows: null };
let _editing = null;          // aktuell bearbeitete Richtlinie
let _dpDrives = null;         // ISMS-Bibliotheken (Cache)
let _dpState = null;          // Dokumentwähler-Navigation
let _cfgEdit = null;          // Einstellungen-Entwurf

/* ═══════════════════════════════════════════════════
   Verwaltung: Liste
═══════════════════════════════════════════════════ */

function renderAdminList() {
  const list = document.getElementById('list-admin');
  if (!list) return;
  const q = (document.getElementById('search-admin')?.value || '').toLowerCase().trim();
  const f = document.getElementById('filter-admin')?.value || 'all';
  let rows = State.policies.slice();
  if (f !== 'all') rows = rows.filter(p => p.status === f);
  if (q) rows = rows.filter(p => (p.title + ' ' + p.kategorie).toLowerCase().includes(q));
  rows.sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));

  if (!rows.length) { list.innerHTML = emptyState('Keine Richtlinien. Lege oben eine neue an.', '📄'); return; }

  list.innerHTML = rows.map(p => `
    <div class="item-card" onclick="openPolicyEditor('${p.id}')">
      <div class="ic-top">
        <div class="ic-title">${esc(p.title)}</div>
        <div class="ic-topright">${workflowBadge(p.status)}</div>
      </div>
      <div class="ic-tags">
        ${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}
        <span class="ic-tag">v${esc(p.version)}</span>
        ${p.pflicht ? '<span class="ic-tag">Pflicht</span>' : '<span class="ic-tag">optional</span>'}
        ${p.quizErforderlich ? `<span class="ic-tag">📝 ${p.quiz.length} Fragen</span>` : ''}
        <span class="ic-tag">👥 ${(p.zielgruppen && p.zielgruppen.length && !p.zielgruppen.includes('ALLE')) ? esc(p.zielgruppen.join(', ')) : 'Alle'}</span>
      </div>
      <div class="ic-footer">
        <span class="grow">${p.dokumentName ? ('📄 ' + esc(p.dokumentName)) : '<span style="color:#b45309">⚠ kein Dokument</span>'}</span>
        <span>geändert ${fmtDate(p.modifiedAt)}</span>
      </div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════════
   Verwaltung: Editor
═══════════════════════════════════════════════════ */

function newPolicy() {
  return {
    id: null, title: '', beschreibung: '', kategorie: 'ISO 27001',
    dokumentUrl: '', dokumentName: '', dokumentDriveId: '', dokumentItemId: '',
    version: '1.0', status: 'Entwurf', pflicht: true,
    quizErforderlich: false, quizBestehenProzent: 80, quiz: [],
    zielgruppen: [], veroeffentlichtAm: '', freigegebenVon: '',
  };
}

function openPolicyEditor(policyId) {
  if (policyId) {
    const src = State.policies.find(x => x.id === policyId);
    _editing = JSON.parse(JSON.stringify(src));
  } else {
    _editing = newPolicy();
  }
  renderPolicyEditor();
}

function renderPolicyEditor() {
  const p = _editing;
  const cats = ['ISO 27001', 'ISMS allgemein', 'Datenschutz', 'IT-Sicherheit', 'Arbeitssicherheit', 'Allgemein'];
  const body = `
    <div class="modal-header">
      <h3>${p.id ? 'Richtlinie bearbeiten' : 'Neue Richtlinie'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full">
          <label>Titel <span class="req">*</span></label>
          <input type="text" value="${esc(p.title)}" oninput="_editing.title=this.value" placeholder="z. B. Informationssicherheitsleitlinie">
        </div>
        <div class="form-group full">
          <label>Beschreibung</label>
          <textarea oninput="_editing.beschreibung=this.value" placeholder="Kurzbeschreibung / Geltungsbereich">${esc(p.beschreibung)}</textarea>
        </div>
        <div class="form-group">
          <label>Kategorie</label>
          <select onchange="_editing.kategorie=this.value">
            ${cats.map(c => `<option ${c === p.kategorie ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Version <span class="req">*</span></label>
          <input type="text" value="${esc(p.version)}" oninput="_editing.version=this.value" placeholder="1.0">
          <span class="field-hint">Neue Version ⇒ alle müssen erneut bestätigen.</span>
        </div>
        <div class="form-group full">
          <label>Richtliniendokument (ISMS-Bibliothek) <span class="req">*</span></label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span id="ed-doc-display" style="flex:1;min-width:0;font-size:.85rem;${p.dokumentName ? '' : 'color:#b45309'}">
              ${p.dokumentName ? '📄 ' + esc(p.dokumentName) : '⚠ noch kein Dokument zugeordnet'}
            </span>
            <button class="btn btn-outline btn-sm" onclick="openDocPicker()">Dokument wählen …</button>
          </div>
        </div>
        <div class="form-group">
          <label class="ack-check" style="font-weight:600"><input type="checkbox" ${p.pflicht ? 'checked' : ''} onchange="_editing.pflicht=this.checked"> Pflichtlektüre</label>
        </div>
        <div class="form-group">
          <label class="ack-check" style="font-weight:600"><input type="checkbox" ${p.quizErforderlich ? 'checked' : ''} onchange="_editing.quizErforderlich=this.checked;renderPolicyEditor()"> Wissenstest erforderlich</label>
        </div>
      </div>
      ${renderZielgruppenSection()}
      ${p.quizErforderlich ? renderQuizEditorSection() : ''}
    </div>
    <div class="modal-footer">
      ${p.id ? `<button class="btn btn-danger btn-sm" onclick="deletePolicyConfirm('${p.id}')" style="margin-right:auto">Löschen</button>` : ''}
      ${p.status === 'InReview'
        ? `<button class="btn btn-ghost" onclick="_editing.status='Entwurf';savePolicy()">Zurück zu Entwurf & speichern</button>`
        : ''}
      <button class="btn btn-outline" onclick="savePolicy()">Speichern</button>
      ${p.status === 'Entwurf'
        ? `<button class="btn btn-primary" onclick="savePolicy('InReview')">Speichern & zur Prüfung</button>`
        : ''}
    </div>`;
  openModal(body, true);
}

function renderQuizEditorSection() {
  return `
    <div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--c-border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:700;font-size:.9rem">Wissenstest</div>
        <div class="form-group" style="flex-direction:row;align-items:center;gap:6px">
          <label style="margin:0">Bestehen ab</label>
          <input type="number" min="1" max="100" value="${_editing.quizBestehenProzent}" style="width:72px"
            oninput="_editing.quizBestehenProzent=Math.max(1,Math.min(100,+this.value||80))"> %
        </div>
      </div>
      <div id="qe-list">${renderQuizItems()}</div>
      <button class="btn btn-ghost btn-sm" onclick="qeAddQuestion()">+ Frage hinzufügen</button>
    </div>`;
}

function renderQuizItems() {
  if (!_editing.quiz.length) return '<div class="field-hint" style="margin-bottom:10px">Noch keine Fragen.</div>';
  return _editing.quiz.map((q, i) => `
    <div class="qe-item">
      <div class="qe-head">
        <span class="t">Frage ${i + 1}</span>
        <button class="btn btn-ghost btn-sm" onclick="qeRemoveQuestion(${i})">Entfernen</button>
      </div>
      <div class="form-group full" style="margin-bottom:10px">
        <input type="text" value="${esc(q.frage)}" oninput="_editing.quiz[${i}].frage=this.value" placeholder="Fragetext">
      </div>
      <div class="field-hint" style="margin-bottom:6px">Richtige Antwort markieren:</div>
      ${q.optionen.map((opt, oi) => `
        <div class="qe-opt-row">
          <input type="radio" name="qe-correct-${i}" ${q.richtig === oi ? 'checked' : ''} onchange="_editing.quiz[${i}].richtig=${oi}">
          <input type="text" value="${esc(opt)}" oninput="_editing.quiz[${i}].optionen[${oi}]=this.value" placeholder="Antwortoption ${oi + 1}">
          ${q.optionen.length > 2 ? `<button class="btn btn-ghost btn-sm" onclick="qeRemoveOption(${i},${oi})">✕</button>` : ''}
        </div>`).join('')}
      <button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="qeAddOption(${i})">+ Antwortoption</button>
    </div>`).join('');
}

function qeRefresh() { const el = document.getElementById('qe-list'); if (el) el.innerHTML = renderQuizItems(); }
function qeAddQuestion() { _editing.quiz.push({ frage: '', optionen: ['', '', ''], richtig: 0 }); qeRefresh(); }
function qeRemoveQuestion(i) { _editing.quiz.splice(i, 1); qeRefresh(); }
function qeAddOption(i) { _editing.quiz[i].optionen.push(''); qeRefresh(); }
function qeRemoveOption(i, oi) {
  _editing.quiz[i].optionen.splice(oi, 1);
  if (_editing.quiz[i].richtig >= _editing.quiz[i].optionen.length) _editing.quiz[i].richtig = 0;
  qeRefresh();
}

/* ── Zielgruppen-Auswahl im Editor ── */

function renderZielgruppenSection() {
  const zg = _editing.zielgruppen || [];
  const specific = _editing._zgSpecific || (zg.length && !zg.includes('ALLE'));
  const roles = getCompanyRoles();
  return `
    <div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--c-border)">
      <div style="font-weight:700;font-size:.9rem;margin-bottom:10px">Zielgruppe</div>
      <label class="ack-check" style="font-weight:500;margin-bottom:6px">
        <input type="radio" name="zg-mode" ${specific ? '' : 'checked'} onchange="zgSetAlle(true)">
        <span>Für <b>alle Mitarbeiter</b></span>
      </label>
      <label class="ack-check" style="font-weight:500">
        <input type="radio" name="zg-mode" ${specific ? 'checked' : ''} onchange="zgSetAlle(false)">
        <span>Nur für <b>bestimmte Rollen / Abteilungen</b></span>
      </label>
      ${specific ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:8px;padding-left:24px">
        ${roles.map((r, ri) => `<label class="ack-check" style="font-weight:500">
          <input type="checkbox" ${zg.includes(r) ? 'checked' : ''} onchange="zgToggleRole(${ri}, this.checked)">
          <span>${esc(r)}</span></label>`).join('')}
      </div>
      <div class="field-hint" style="padding-left:24px;margin-top:6px">Mitarbeiter sehen die Richtlinie, wenn ihre Abteilung/Rolle hier ausgewählt ist.</div>
      ` : ''}
    </div>`;
}

function zgSetAlle(alle) {
  if (alle) { _editing.zielgruppen = []; _editing._zgSpecific = false; }
  else { _editing._zgSpecific = true; _editing.zielgruppen = (_editing.zielgruppen || []).filter(x => x !== 'ALLE'); }
  renderPolicyEditor();
}

function zgToggleRole(ri, checked) {
  const r = getCompanyRoles()[ri];
  if (!Array.isArray(_editing.zielgruppen)) _editing.zielgruppen = [];
  _editing.zielgruppen = _editing.zielgruppen.filter(x => x !== 'ALLE' && x !== r);
  if (checked) _editing.zielgruppen.push(r);
}

async function savePolicy(newStatus) {
  const p = _editing;
  if (!p.title.trim()) { toast('Bitte einen Titel angeben.', 'error'); return; }
  if (!p.dokumentItemId && !p.dokumentUrl) { toast('Bitte ein Dokument zuordnen.', 'error'); return; }
  if (p._zgSpecific && (!p.zielgruppen || !p.zielgruppen.length)) {
    toast('Bitte mindestens eine Rolle wählen oder „Für alle Mitarbeiter" auswählen.', 'error'); return;
  }
  if (p.quizErforderlich) {
    if (!p.quiz.length) { toast('Wissenstest aktiv, aber keine Fragen angelegt.', 'error'); return; }
    for (let i = 0; i < p.quiz.length; i++) {
      const q = p.quiz[i];
      if (!q.frage.trim()) { toast(`Frage ${i + 1}: Text fehlt.`, 'error'); return; }
      if (q.optionen.filter(o => o.trim()).length < 2) { toast(`Frage ${i + 1}: mindestens 2 Antwortoptionen.`, 'error'); return; }
    }
  }
  if (newStatus) p.status = newStatus;
  try {
    await spSavePolicy(p);
    await reloadData();
    closeModal();
    renderAdminList();
    toast(newStatus === 'InReview' ? 'Gespeichert & zur Prüfung eingereicht ✓' : 'Gespeichert ✓', 'success');
  } catch (e) {
    toast('Fehler beim Speichern: ' + e.message, 'error');
  }
}

function deletePolicyConfirm(id) {
  const p = State.policies.find(x => x.id === id);
  openModal(`
    <div class="modal-header"><h3>Richtlinie löschen</h3><button class="modal-close" onclick="renderPolicyEditor()">×</button></div>
    <div class="modal-body"><p style="font-size:.9rem;line-height:1.5">„${esc(p?.title || '')}" wirklich löschen? Bereits erfasste Bestätigungen bleiben in der Liste erhalten.</p></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="renderPolicyEditor()">Abbrechen</button>
      <button class="btn btn-danger" onclick="doDeletePolicy('${id}')">Endgültig löschen</button>
    </div>`);
}

async function doDeletePolicy(id) {
  try {
    await spDeletePolicy(id);
    await reloadData();
    closeModal();
    renderAdminList();
    toast('Richtlinie gelöscht.', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/* ═══════════════════════════════════════════════════
   Dokumentwähler (ISMS-Bibliothek)
═══════════════════════════════════════════════════ */

async function openDocPicker() {
  _dpState = { driveId: null, driveName: '', path: [], items: [] };
  pickerMount(dpShell('<div class="doc-loading">Bibliotheken werden geladen …</div>'));
  try {
    if (!_dpDrives) _dpDrives = await spListIsmsDrives();
    if (_dpDrives.length === 1) { _dpState.driveId = _dpDrives[0].id; _dpState.driveName = _dpDrives[0].name; }
    await renderDocPicker();
  } catch (e) {
    const b = document.getElementById('dp-body');
    if (b) b.innerHTML = `<div class="col-warning" style="display:block">ISMS-Bibliothek nicht erreichbar: ${esc(e.message)}</div>`;
  }
}

/* Eigenes Overlay ÜBER dem Editor – der Editor-State bleibt erhalten. */
function pickerMount(html) {
  let m = document.getElementById('picker-mount');
  if (!m) { m = document.createElement('div'); m.id = 'picker-mount'; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal-overlay" style="z-index:300" onclick="if(event.target===this)pickerClose()"><div class="modal wide">${html}</div></div>`;
}
function pickerClose() {
  const m = document.getElementById('picker-mount');
  if (m) m.innerHTML = '';
}

function dpShell(inner) {
  return `
    <div class="modal-header"><h3>Dokument wählen</h3><button class="modal-close" onclick="pickerClose()">×</button></div>
    <div class="modal-body" id="dp-body">${inner}</div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="pickerClose()">Abbrechen</button></div>`;
}

async function renderDocPicker() {
  const body = document.getElementById('dp-body');
  if (!body) return;
  let items;
  try {
    if (!_dpState.driveId) {
      items = (_dpDrives || []).map(d => ({ id: d.id, name: d.name, isFolder: true, isDrive: true }));
    } else {
      body.innerHTML = '<div class="doc-loading">Lädt …</div>';
      const last = _dpState.path[_dpState.path.length - 1];
      items = await spBrowseDrive(_dpState.driveId, last ? last.id : null);
    }
  } catch (e) {
    body.innerHTML = `<div class="col-warning" style="display:block">Ordner konnte nicht geladen werden: ${esc(e.message)}</div>`;
    return;
  }
  _dpState.items = items;
  dbg('Ordner geladen (' + items.length + ' Einträge): ' + JSON.stringify(items.map(i => i.name + (i.isFolder ? ' [Ordner]' : ' [Datei]'))));

  // Breadcrumbs
  let crumbs = `<a data-crumb="-1">Bibliotheken</a>`;
  if (_dpState.driveId) {
    crumbs += ` › <a data-crumb="-2">${esc(_dpState.driveName)}</a>`;
    _dpState.path.forEach((f, i) => crumbs += ` › <a data-crumb="${i}">${esc(f.name)}</a>`);
  }

  const rowsHtml = items.length ? items.map((it, idx) => it.isFolder
    ? `<div class="dp-row folder" data-idx="${idx}" data-act="open"><span class="ic">📁</span><span class="nm">${esc(it.name)}</span><span class="field-hint">${it.isDrive ? 'Bibliothek' : (it.childCount + ' Element(e)')}</span></div>`
    : `<div class="dp-row" data-idx="${idx}" data-act="pick"><span class="ic">📄</span><span class="nm">${esc(it.name)}</span><span class="btn btn-primary btn-sm">Wählen</span></div>`
  ).join('') : '<div class="doc-loading">Dieser Ordner ist leer.</div>';

  body.innerHTML = `<div class="dp-crumbs">${crumbs}</div><div class="dp-list">${rowsHtml}</div>`;

  // Event-Delegation (robuster als inline-onclick im dynamisch ersetzten Modal)
  body.querySelector('.dp-list')?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const row = e.target.closest('.dp-row');
    if (!row) { dbg('Klick ohne .dp-row (target=' + (e.target && e.target.tagName) + ')'); return; }
    dbg('Klick: act=' + row.dataset.act + ' idx=' + row.dataset.idx);
    if (row.dataset.act === 'open') dpOpenFolder(+row.dataset.idx); else dpSelect(+row.dataset.idx);
  });
  body.querySelector('.dp-crumbs')?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const a = e.target.closest('[data-crumb]');
    if (a) dpCrumb(+a.dataset.crumb);
  });
}

function dpOpenFolder(idx) {
  const it = _dpState.items[idx];
  if (!it) return;
  if (it.isDrive) { _dpState.driveId = it.id; _dpState.driveName = it.name; _dpState.path = []; }
  else { _dpState.path.push({ id: it.id, name: it.name }); }
  renderDocPicker();
}

function dpCrumb(i) {
  if (i === -1) { _dpState.driveId = null; _dpState.driveName = ''; _dpState.path = []; }
  else if (i === -2) { _dpState.path = []; }
  else { _dpState.path = _dpState.path.slice(0, i + 1); }
  renderDocPicker();
}

function dpSelect(idx) {
  const it = _dpState.items && _dpState.items[idx];
  dbg('dpSelect: idx=' + idx + ' datei=' + (it ? it.name : 'NULL') + ' editorAktiv=' + !!_editing);
  if (!it) { toast('Auswahl fehlgeschlagen (Dokument nicht gefunden).', 'error'); return; }
  if (!_editing) { toast('Editor nicht aktiv – bitte Richtlinie erneut öffnen.', 'error'); return; }
  _editing.dokumentDriveId = _dpState.driveId;
  _editing.dokumentItemId  = it.id;
  _editing.dokumentName    = it.name;
  _editing.dokumentUrl     = it.url || '';
  pickerClose();
  // Editor bleibt erhalten – nur die Dokumentzeile direkt aktualisieren (kein Neuaufbau)
  const disp = document.getElementById('ed-doc-display');
  dbg('dpSelect gesetzt: editing.dokumentName="' + _editing.dokumentName + '" | ed-doc-display gefunden=' + !!disp);
  if (disp) { disp.innerHTML = '📄 ' + esc(it.name); disp.style.color = ''; }
  toast('Dokument zugeordnet: ' + it.name, 'success');
}

/* ═══════════════════════════════════════════════════
   Freigaben (Genehmiger)
═══════════════════════════════════════════════════ */

function renderFreigaben() {
  const list = document.getElementById('list-freigaben');
  if (!list) return;
  const rows = State.policies.filter(p => p.status === 'InReview');
  if (!rows.length) { list.innerHTML = emptyState('Keine Richtlinien zur Freigabe.', '✓'); return; }
  list.innerHTML = rows.map(p => `
    <div class="item-card" style="cursor:default">
      <div class="ic-top"><div class="ic-title">${esc(p.title)}</div><div class="ic-topright">${workflowBadge(p.status)}</div></div>
      ${p.beschreibung ? `<div class="ic-desc">${esc(p.beschreibung)}</div>` : ''}
      <div class="ic-tags">
        ${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}
        <span class="ic-tag">v${esc(p.version)}</span>
        ${p.quizErforderlich ? `<span class="ic-tag">📝 ${p.quiz.length} Fragen</span>` : ''}
      </div>
      <div style="display:flex;gap:7px;margin-top:12px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="previewPolicyDoc('${p.id}')">📄 Dokument ansehen</button>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" onclick="setStatus('${p.id}','Entwurf')">Zurück zu Entwurf</button>
        <button class="btn btn-success btn-sm" onclick="publishPolicy('${p.id}')">✓ Freigeben & veröffentlichen</button>
      </div>
    </div>`).join('');
}

async function previewPolicyDoc(id) {
  const p = State.policies.find(x => x.id === id);
  if (!p) return;
  if (p.dokumentUrl) { window.open(p.dokumentUrl, '_blank', 'noopener'); return; }
  if (p.dokumentDriveId && p.dokumentItemId) {
    try {
      const u = await spGetPreviewUrl(p.dokumentDriveId, p.dokumentItemId);
      if (u) window.open(u, '_blank', 'noopener'); else toast('Keine Vorschau verfügbar.', 'error');
    } catch (e) { toast('Vorschau-Fehler: ' + e.message, 'error'); }
  } else toast('Kein Dokument hinterlegt.', 'error');
}

async function publishPolicy(id) {
  const p = JSON.parse(JSON.stringify(State.policies.find(x => x.id === id)));
  p.status = 'Veröffentlicht';
  p.veroeffentlichtAm = new Date().toISOString();
  p.freigegebenVon = State.user.upn;
  try {
    await spSavePolicy(p);
    await reloadData();
    renderFreigaben();
    toast('Freigegeben & veröffentlicht ✓', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

async function setStatus(id, status) {
  const p = JSON.parse(JSON.stringify(State.policies.find(x => x.id === id)));
  p.status = status;
  try {
    await spSavePolicy(p);
    await reloadData();
    renderFreigaben();
    renderAdminList();
    toast('Status geändert: ' + status, 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/* ═══════════════════════════════════════════════════
   Compliance-Dashboard
═══════════════════════════════════════════════════ */

async function initCompliance() {
  const sel = document.getElementById('compliance-policy');
  const body = document.getElementById('compliance-body');
  const pubs = State.policies.filter(p => p.status === 'Veröffentlicht' && p.pflicht);
  sel.innerHTML = pubs.map(p => `<option value="${p.id}">${esc(p.title)} (v${esc(p.version)})</option>`).join('');
  if (!pubs.length) { body.innerHTML = emptyState('Keine veröffentlichten Pflicht-Richtlinien.'); return; }

  body.innerHTML = '<div class="doc-loading">Lade Mitarbeiter & Bestätigungen …</div>';
  try {
    if (!AdminState.members) AdminState.members = await spGetMembers();
    AdminState.allAcks = await spGetAcknowledgements();   // alle Nutzer
    renderComplianceDetail();
  } catch (e) {
    body.innerHTML = `<div class="col-warning" style="display:block">Fehler beim Laden: ${esc(e.message)}<br>
      Für die Mitarbeiterliste wird die Graph-Berechtigung <b>User.Read.All</b> (Admin-Consent) benötigt.</div>`;
  }
}

function renderComplianceDetail() {
  const id = document.getElementById('compliance-policy').value;
  const p = State.policies.find(x => x.id === id);
  const body = document.getElementById('compliance-body');
  if (!p) { body.innerHTML = ''; return; }

  // Soll-Gruppe = nur Mitarbeiter, für deren Rolle/Abteilung die Richtlinie gilt
  const members = (AdminState.members || []).filter(m =>
    policyMatchesRoles(p.zielgruppen, effectiveRoles(m.upn, m.department)));
  const acks = (AdminState.allAcks || []).filter(a => a.richtlinieId === p.id && a.version === p.version);
  const byUpn = {};
  acks.forEach(a => { byUpn[(a.benutzerUpn || '').toLowerCase()] = a; });

  const rows = members.map(m => {
    const a = byUpn[m.upn.toLowerCase()];
    let st = 'offen', date = '', score = null;
    if (a) {
      score = a.quizScore;
      const fertig = p.quizErforderlich ? a.quizBestanden : !!a.gelesenAm;
      if (fertig) { st = 'abgeschlossen'; date = a.abgeschlossenAm || a.gelesenAm; }
      else if (a.gelesenAm) { st = 'gelesen'; date = a.gelesenAm; }
    }
    return { name: m.name, upn: m.upn, st, date, score };
  });
  rows.sort((a, b) => (a.st === b.st ? a.name.localeCompare(b.name, 'de') : a.st.localeCompare(b.st)));
  AdminState.lastComplianceRows = rows;

  const done = rows.filter(r => r.st === 'abgeschlossen').length;
  const gelesen = rows.filter(r => r.st === 'gelesen').length;
  const offen = rows.length - done - gelesen;
  const quote = rows.length ? Math.round(done / rows.length * 100) : 0;
  const qCls = quote >= 90 ? 'quote-hi' : quote >= 60 ? 'quote-mid' : 'quote-lo';

  body.innerHTML = `
    <div class="stats-grid">
      ${statCard('blue', '👥', rows.length, 'Mitarbeiter (Soll)')}
      ${statCard('green', '✓', done, 'Abgeschlossen')}
      ${statCard('orange', '⏳', offen + gelesen, 'Ausstehend')}
      ${statCard('purple', '📊', quote + '%', 'Erfüllungsquote')}
    </div>
    <div class="card">
      <div class="card-header">
        <h2>${esc(p.title)} <span style="font-weight:400;color:var(--c-muted)">· v${esc(p.version)} · 👥 ${esc(zielgruppenLabel(p))}</span></h2>
        <span class="quote-pill ${qCls}">${quote}% erfüllt</span>
      </div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Mitarbeiter</th><th>E-Mail</th><th>Status</th><th>Datum</th>${p.quizErforderlich ? '<th class="num">Test</th>' : ''}</tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td>${esc(r.name)}</td>
              <td style="color:var(--c-muted)">${esc(r.upn)}</td>
              <td>${complianceBadge(r.st)}</td>
              <td>${r.date ? fmtDate(r.date) : '–'}</td>
              ${p.quizErforderlich ? `<td class="num">${r.score != null && r.st !== 'offen' ? r.score + '%' : '–'}</td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function complianceBadge(st) {
  if (st === 'abgeschlossen') return '<span class="status-badge sb-done">✓ Abgeschlossen</span>';
  if (st === 'gelesen') return '<span class="status-badge sb-read">Gelesen</span>';
  return '<span class="status-badge sb-open">Offen</span>';
}

function exportComplianceCsv() {
  const rows = AdminState.lastComplianceRows;
  const id = document.getElementById('compliance-policy')?.value;
  const p = State.policies.find(x => x.id === id);
  if (!rows || !rows.length || !p) { toast('Nichts zu exportieren.', 'error'); return; }
  const head = ['Mitarbeiter', 'E-Mail', 'Status', 'Datum', 'Quiz-Score'];
  const lines = [head.join(';')];
  rows.forEach(r => lines.push([
    _csv(r.name), _csv(r.upn), _csv(r.st),
    _csv(r.date ? fmtDateTime(r.date) : ''),
    r.score != null && r.st !== 'offen' ? r.score + '%' : '',
  ].join(';')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Compliance_${p.title}_v${p.version}.csv`.replace(/[^a-z0-9_.-]/gi, '_');
  a.click();
  URL.revokeObjectURL(a.href);
}

function _csv(s) { s = String(s ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

/* ═══════════════════════════════════════════════════
   Einstellungen (access-config)
═══════════════════════════════════════════════════ */

function renderEinstellungen() {
  _cfgEdit = getAccessConfig();
  const v = document.getElementById('view-einstellungen');
  v.innerHTML = `
    <div style="max-width:680px">
      <div class="col-warning" style="display:block">
        Einstellungen liegen in <code>access-config.json</code> in der Dokumentbibliothek.
        <b>Admins</b> verwalten Richtlinien & sehen Compliance, <b>Genehmiger</b> geben frei.
        <b>Rollen/Abteilungen</b> steuern, wer welche zielgruppenspezifische Richtlinie sieht.
      </div>
      ${roleCard('admins', 'Administratoren')}
      ${roleCard('genehmiger', 'Genehmiger')}

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Verfügbare Rollen / Abteilungen</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">Stehen als Zielgruppe für Richtlinien und für die Mitarbeiter-Zuordnung zur Verfügung. Am besten identisch zu den Azure-AD-Abteilungen benennen.</div>
          <div id="cfg-roles"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <input type="text" id="cfg-input-roles" placeholder="z. B. Produktion"
              style="flex:1;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit"
              onkeydown="if(event.key==='Enter')cfgAddRole()">
            <button class="btn btn-outline btn-sm" onclick="cfgAddRole()">+ Rolle</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Mitarbeiter-Rollen (manuell)</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">Optional. Die Abteilung aus dem Azure-AD-Profil greift automatisch — hier kannst du einzelnen Personen zusätzliche Rollen zuweisen (z. B. wenn die AD-Abteilung abweicht oder fehlt).</div>
          <div id="cfg-userroles"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <input type="email" id="cfg-input-ur" placeholder="name@dihag.com"
              style="flex:1;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit"
              onkeydown="if(event.key==='Enter')urAddUser()">
            <button class="btn btn-outline btn-sm" onclick="urAddUser()">+ Mitarbeiter</button>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-primary" onclick="saveCfg()">Einstellungen speichern</button>
      </div>
    </div>`;
  renderCfgLists();
  renderRolesList();
  renderUserRolesList();
}

function roleCard(role, title) {
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-header"><h2>${title}</h2></div>
    <div class="card-body">
      <div id="cfg-${role}"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input type="email" id="cfg-input-${role}" placeholder="name@dihag.com"
          style="flex:1;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit"
          onkeydown="if(event.key==='Enter')cfgAdd('${role}')">
        <button class="btn btn-outline btn-sm" onclick="cfgAdd('${role}')">+ Hinzufügen</button>
      </div>
    </div>
  </div>`;
}

function renderCfgLists() {
  ['admins', 'genehmiger'].forEach(role => {
    const host = document.getElementById('cfg-' + role);
    if (!host) return;
    const arr = _cfgEdit[role] || [];
    host.innerHTML = arr.length ? arr.map((u, i) => `
      <div class="dp-row" style="cursor:default">
        <span class="ic">👤</span>
        <span class="nm">${esc(u)}</span>
        <button class="btn btn-ghost btn-sm" onclick="cfgRemove('${role}',${i})">✕</button>
      </div>`).join('') : '<div class="field-hint">Noch niemand zugewiesen.</div>';
  });
}

function cfgAdd(role) {
  const inp = document.getElementById('cfg-input-' + role);
  const val = (inp.value || '').trim().toLowerCase();
  if (!val || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { toast('Bitte gültige E-Mail eingeben.', 'error'); return; }
  if (!_cfgEdit[role]) _cfgEdit[role] = [];
  if (_cfgEdit[role].some(x => x.toLowerCase() === val)) { toast('Bereits vorhanden.', 'error'); return; }
  _cfgEdit[role].push(val);
  inp.value = '';
  renderCfgLists();
}

function cfgRemove(role, i) { _cfgEdit[role].splice(i, 1); renderCfgLists(); }

/* ── Verfügbare Rollen ── */
function renderRolesList() {
  const host = document.getElementById('cfg-roles');
  if (!host) return;
  const arr = _cfgEdit.roles || [];
  host.innerHTML = arr.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${arr.map((r, i) =>
        `<span class="ur-chip on" style="cursor:default">${esc(r)}<button onclick="cfgRemoveRole(${i})" title="Entfernen" style="background:none;border:none;cursor:pointer;color:inherit;font-size:.95rem;line-height:1;padding:0">✕</button></span>`).join('')}</div>`
    : '<div class="field-hint">Keine Rollen definiert.</div>';
}
function cfgAddRole() {
  const inp = document.getElementById('cfg-input-roles');
  const val = (inp.value || '').trim();
  if (!val) return;
  if (!_cfgEdit.roles) _cfgEdit.roles = [];
  if (_cfgEdit.roles.some(x => x.toLowerCase() === val.toLowerCase())) { toast('Rolle existiert bereits.', 'error'); return; }
  _cfgEdit.roles.push(val);
  inp.value = '';
  renderRolesList();
  renderUserRolesList();
}
function cfgRemoveRole(i) {
  const removed = _cfgEdit.roles.splice(i, 1)[0];
  // aus allen Mitarbeiter-Zuordnungen entfernen
  Object.keys(_cfgEdit.userRoles || {}).forEach(upn => {
    _cfgEdit.userRoles[upn] = (_cfgEdit.userRoles[upn] || []).filter(r => r !== removed);
  });
  renderRolesList();
  renderUserRolesList();
}

/* ── Mitarbeiter-Rollen (manuell) ── */
function renderUserRolesList() {
  const host = document.getElementById('cfg-userroles');
  if (!host) return;
  const roles = _cfgEdit.roles || [];
  const upns = Object.keys(_cfgEdit.userRoles || {});
  host.innerHTML = upns.length ? upns.map((upn, ui) => `
    <div style="border:1px solid var(--c-border);border-radius:9px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="flex:1;font-weight:600;font-size:.85rem">👤 ${esc(upn)}</span>
        <button class="btn btn-ghost btn-sm" onclick="urRemoveUser(${ui})">Entfernen</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${roles.length ? roles.map((r, ri) => {
          const on = (_cfgEdit.userRoles[upn] || []).includes(r);
          return `<label class="ur-chip ${on ? 'on' : ''}"><input type="checkbox" ${on ? 'checked' : ''} onchange="urToggle(${ui},${ri},this.checked)" style="position:absolute;opacity:0;width:0;height:0">${esc(r)}</label>`;
        }).join('') : '<span class="field-hint">Erst Rollen oben definieren.</span>'}
      </div>
    </div>`).join('') : '<div class="field-hint">Noch keine manuellen Zuordnungen. (Ohne Eintrag greift die AD-Abteilung.)</div>';
}
function urAddUser() {
  const inp = document.getElementById('cfg-input-ur');
  const val = (inp.value || '').trim().toLowerCase();
  if (!val || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { toast('Bitte gültige E-Mail eingeben.', 'error'); return; }
  if (!_cfgEdit.userRoles) _cfgEdit.userRoles = {};
  if (Object.keys(_cfgEdit.userRoles).some(k => k.toLowerCase() === val)) { toast('Mitarbeiter bereits in der Liste.', 'error'); return; }
  _cfgEdit.userRoles[val] = [];
  inp.value = '';
  renderUserRolesList();
}
function urRemoveUser(ui) {
  const upn = Object.keys(_cfgEdit.userRoles)[ui];
  if (upn) delete _cfgEdit.userRoles[upn];
  renderUserRolesList();
}
function urToggle(ui, ri, checked) {
  const upn = Object.keys(_cfgEdit.userRoles)[ui];
  const role = (_cfgEdit.roles || [])[ri];
  if (!upn || !role) return;
  const arr = _cfgEdit.userRoles[upn] || (_cfgEdit.userRoles[upn] = []);
  const idx = arr.indexOf(role);
  if (checked && idx < 0) arr.push(role);
  else if (!checked && idx >= 0) arr.splice(idx, 1);
  renderUserRolesList();
}

async function saveCfg() {
  try {
    await spSaveAccessConfig(_cfgEdit);
    setRuntimeConfig(JSON.parse(JSON.stringify(_cfgEdit)));
    initRoleNav();
    toast('Rollen gespeichert ✓', 'success');
  } catch (e) { toast('Fehler beim Speichern: ' + e.message, 'error'); }
}
