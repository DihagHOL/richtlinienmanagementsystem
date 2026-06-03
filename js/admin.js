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
  const _colBanner = (liste, miss) => miss.length ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ In der SharePoint-Liste „${liste}" fehlen ${miss.length} Spalte(n).</b> Werte dieser Felder werden beim Speichern <b>verworfen</b> (bei „Richtlinien" bleibt z. B. die Dokumentzuordnung nicht erhalten; bei „Bestaetigungen" scheitert die Kenntnisnahme/Quiz).<br>
      Bitte in SharePoint anlegen: ${miss.map(c => `<b>${esc(c.name)}</b> <span style="opacity:.75">(${esc(c.typ)})</span>`).join(' · ')}
    </div>` : '';
  const warn =
    _colBanner('Richtlinien', (typeof spMissingPolicyColumns === 'function') ? spMissingPolicyColumns() : []) +
    _colBanner('Bestaetigungen', (typeof spMissingAckColumns === 'function') ? spMissingAckColumns() : []);
  const q = (document.getElementById('search-admin')?.value || '').toLowerCase().trim();
  const f = document.getElementById('filter-admin')?.value || 'all';
  let rows = State.policies.slice();
  if (f !== 'all') rows = rows.filter(p => p.status === f);
  if (q) rows = rows.filter(p => (p.title + ' ' + p.kategorie).toLowerCase().includes(q));
  rows.sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));

  if (!rows.length) { list.innerHTML = warn + emptyState('Keine Richtlinien. Lege oben eine neue an.', '📄'); return; }

  list.innerHTML = warn + rows.map(p => `
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
        ${p.wiederholungMonate ? `<span class="ic-tag">↻ ${p.wiederholungMonate == 12 ? 'jährlich' : 'alle ' + p.wiederholungMonate + ' Mon.'}</span>` : ''}
        ${p.naechsteReview ? `<span class="ic-tag" style="${new Date(p.naechsteReview) < new Date() ? 'background:#fef2f2;color:#b91c1c' : ''}">🔎 Review ${fmtDate(p.naechsteReview)}</span>` : ''}
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

/* ── Import: Word/PDF (einzeln & mehrere) → Entwurfs-Richtlinien ── */
function openImportDialog() {
  openModal(`
    <div class="modal-header"><h3>Richtlinien importieren</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">Word-/PDF-Dateien (auch mehrere) hierher ziehen oder auswählen. Pro Datei wird eine <b>Entwurfs</b>-Richtlinie angelegt (Titel aus dem Dateinamen). Danach im Editor ergänzen und „Zur Konformitätsprüfung" schicken.</div>
      <div id="import-drop" style="border:2px dashed var(--c-border);border-radius:10px;padding:30px 16px;text-align:center;cursor:pointer;color:var(--c-muted)">
        📥 <b>Dateien hierher ziehen</b><br><span style="font-size:.8rem">oder klicken zum Auswählen</span>
      </div>
      <input type="file" id="import-input" multiple accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx" style="display:none">
      <div id="import-log" style="margin-top:12px;font-size:.85rem;max-height:200px;overflow:auto"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Schließen</button></div>`);
  const drop = document.getElementById('import-drop');
  const input = document.getElementById('import-input');
  drop.onclick = () => input.click();
  input.onchange = () => importPolicyFiles(input.files);
  drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--c-primary)'; drop.style.background = 'var(--c-primary-l)'; };
  drop.ondragleave = () => { drop.style.borderColor = 'var(--c-border)'; drop.style.background = ''; };
  drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--c-border)'; drop.style.background = ''; importPolicyFiles(e.dataTransfer.files); };
}

async function importPolicyFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const log = document.getElementById('import-log');
  let ok = 0;
  for (const f of files) {
    const row = document.createElement('div');
    if (log) { row.textContent = '⏳ ' + f.name + ' …'; log.appendChild(row); }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await spUploadPolicyDoc(f.name, bytes, f.type);
      const p = newPolicy();
      p.title = f.name.replace(/\.[^.]+$/, '');
      p.dokumentUrl = doc.url; p.dokumentName = doc.name; p.dokumentDriveId = doc.driveId; p.dokumentItemId = doc.itemId;
      await spSavePolicy(p);
      ok++;
      if (row) { row.style.color = '#15803d'; row.textContent = '✓ ' + f.name + ' → Entwurf angelegt'; }
    } catch (e) {
      if (row) { row.style.color = '#b91c1c'; row.textContent = '✗ ' + f.name + ': ' + e.message; }
    }
  }
  if (ok) {
    await reloadData();
    renderAdminList();
    toast(`${ok} Richtlinie(n) als Entwurf importiert ✓`, 'success');
  }
}

/** Upload aus dem Editor: bestehendes Dokument → neue Version; sonst Zielordner wählen. */
async function uploadPolicyDocFromEditor(file) {
  if (!file || !_editing) return;
  if (!(_editing.dokumentDriveId && _editing.dokumentItemId)) {
    openFolderPickerForUpload(file);   // neues Dokument → Zielordner wählen
    return;
  }
  // bestehendes Dokument → neue Version am selben Speicherort (SharePoint versioniert)
  const disp = document.getElementById('ed-doc-display');
  if (disp) { disp.style.color = ''; disp.textContent = '⬆ Lädt hoch …'; }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await spReplaceDocContent(_editing.dokumentDriveId, _editing.dokumentItemId, bytes, file.type);
    _editing.dokumentName = res.name || _editing.dokumentName;
    _editing.dokumentUrl = res.webUrl || _editing.dokumentUrl;
    if (disp) { disp.innerHTML = '📄 ' + esc(_editing.dokumentName); disp.style.color = ''; }
    toast('Neue Dokumentversion hochgeladen ✓ (in SharePoint versioniert)', 'success');
  } catch (e) {
    toast('Hochladen fehlgeschlagen: ' + e.message, 'error');
    if (disp) disp.innerHTML = _editing.dokumentName ? '📄 ' + esc(_editing.dokumentName) : '⚠ noch kein Dokument zugeordnet';
  }
}

/* ── Zielordner-Wähler für den Upload ── */
let _fpState = null, _fpFile = null, _fpDrives = null;

async function openFolderPickerForUpload(file) {
  _fpFile = file;
  _fpState = { driveId: null, driveName: '', path: [], items: [] };
  pickerMount(fpShell('<div class="doc-loading">Bibliotheken werden geladen …</div>'));
  try {
    if (!_fpDrives) {
      const isms = await spListIsmsDrives().catch(() => []);
      const app = await spListAppDrives().catch(() => []);
      _fpDrives = [
        ...isms.map(d => ({ id: d.id, name: 'ISMS · ' + d.name })),
        ...app.map(d => ({ id: d.id, name: 'Intern · ' + d.name })),
      ];
    }
    renderFolderPicker();
  } catch (e) {
    const b = document.getElementById('fp-body');
    if (b) b.innerHTML = `<div class="col-warning" style="display:block">Bibliotheken nicht ladbar: ${esc(e.message)}</div>`;
  }
}

function fpShell(inner) {
  return `
    <div class="modal-header"><h3>Zielordner wählen${_fpFile ? ' – „' + esc(_fpFile.name) + '"' : ''}</h3><button class="modal-close" onclick="pickerClose()">×</button></div>
    <div class="modal-body" id="fp-body">${inner}</div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="pickerClose()">Abbrechen</button></div>`;
}

async function renderFolderPicker() {
  const body = document.getElementById('fp-body');
  if (!body) return;
  let items;
  try {
    if (!_fpState.driveId) items = (_fpDrives || []).map(d => ({ id: d.id, name: d.name, isFolder: true, isDrive: true }));
    else { body.innerHTML = '<div class="doc-loading">Lädt …</div>'; const last = _fpState.path[_fpState.path.length - 1]; items = await spBrowseAnyDrive(_fpState.driveId, last ? last.id : null); }
  } catch (e) { body.innerHTML = `<div class="col-warning" style="display:block">Ordner nicht ladbar: ${esc(e.message)}</div>`; return; }
  _fpState.items = items;
  let crumbs = `<a data-fp="-1">Bibliotheken</a>`;
  if (_fpState.driveId) { crumbs += ` › <a data-fp="-2">${esc(_fpState.driveName)}</a>`; _fpState.path.forEach((f, i) => crumbs += ` › <a data-fp="${i}">${esc(f.name)}</a>`); }
  const rows = items.length ? items.map((it, idx) => it.isFolder
    ? `<div class="dp-row folder" data-fpopen="${idx}"><span class="ic">📁</span><span class="nm">${esc(it.name)}</span><span class="field-hint">${it.isDrive ? 'Bibliothek' : 'öffnen'}</span></div>`
    : `<div class="dp-row" style="opacity:.45;cursor:default"><span class="ic">📄</span><span class="nm">${esc(it.name)}</span></div>`
  ).join('') : '<div class="doc-loading">Dieser Ordner ist leer.</div>';
  const uploadBtn = _fpState.driveId
    ? `<button class="btn btn-primary btn-sm" onclick="doFolderUpload()">📥 Hierher hochladen</button>`
    : `<span class="field-hint">Bitte zuerst eine Bibliothek öffnen.</span>`;
  body.innerHTML = `<div class="dp-crumbs">${crumbs}</div>
    <div style="display:flex;align-items:center;gap:8px;margin:6px 0 10px">
      <span class="field-hint" style="flex:1">Ziel: <b>${esc(_fpState.path.map(p => p.name).join(' / ') || _fpState.driveName || '–')}</b></span>${uploadBtn}</div>
    <div class="dp-list">${rows}</div>`;
  body.querySelector('.dp-list')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const r = e.target.closest('[data-fpopen]'); if (r) fpOpen(+r.dataset.fpopen); });
  body.querySelector('.dp-crumbs')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const a = e.target.closest('[data-fp]'); if (a) fpCrumb(+a.dataset.fp); });
}

function fpOpen(idx) {
  const it = _fpState.items[idx];
  if (!it) return;
  if (it.isDrive) { _fpState.driveId = it.id; _fpState.driveName = it.name; _fpState.path = []; }
  else { _fpState.path.push({ id: it.id, name: it.name }); }
  renderFolderPicker();
}
function fpCrumb(i) {
  if (i === -1) { _fpState.driveId = null; _fpState.driveName = ''; _fpState.path = []; }
  else if (i === -2) { _fpState.path = []; }
  else { _fpState.path = _fpState.path.slice(0, i + 1); }
  renderFolderPicker();
}

async function doFolderUpload() {
  if (!_fpFile || !_editing || !_fpState.driveId) { pickerClose(); return; }
  const last = _fpState.path[_fpState.path.length - 1];
  const body = document.getElementById('fp-body');
  if (body) body.innerHTML = '<div class="doc-loading">Lädt hoch …</div>';
  try {
    const bytes = new Uint8Array(await _fpFile.arrayBuffer());
    const doc = await spUploadToFolder(_fpState.driveId, last ? last.id : null, _fpFile.name, bytes, _fpFile.type);
    _editing.dokumentDriveId = _fpState.driveId;
    _editing.dokumentItemId = doc.id;
    _editing.dokumentName = doc.name;
    _editing.dokumentUrl = doc.webUrl || '';
    pickerClose();
    const disp = document.getElementById('ed-doc-display');
    if (disp) { disp.innerHTML = '📄 ' + esc(doc.name); disp.style.color = ''; }
    toast('Hochgeladen ✓', 'success');
  } catch (e) { toast('Upload fehlgeschlagen: ' + e.message, 'error'); pickerClose(); }
}

function newPolicy() {
  return {
    id: null, title: '', beschreibung: '', kategorie: 'ISO 27001',
    dokumentUrl: '', dokumentName: '', dokumentDriveId: '', dokumentItemId: '',
    version: '1.0', status: 'Entwurf', pflicht: true,
    quizErforderlich: false, quizBestehenProzent: 80, quiz: [],
    zielgruppen: [], wiederholungMonate: 0, naechsteReview: '',
    veroeffentlichtAm: '', freigegebenVon: '',
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
          <label>Richtliniendokument <span class="req">*</span></label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span id="ed-doc-display" style="flex:1;min-width:0;font-size:.85rem;${p.dokumentName ? '' : 'color:#b45309'}">
              ${p.dokumentName ? '📄 ' + esc(p.dokumentName) : '⚠ noch kein Dokument zugeordnet'}
            </span>
            <button class="btn btn-outline btn-sm" onclick="openDocPicker()">Aus Bibliothek …</button>
            <button class="btn btn-outline btn-sm" onclick="document.getElementById('ed-upload-input').click()">⬆ Hochladen</button>
            <input type="file" id="ed-upload-input" accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.odt" style="display:none" onchange="uploadPolicyDocFromEditor(this.files[0])">
          </div>
          <span class="field-hint">Bei einem bereits zugeordneten Dokument legt ein erneuter Upload in SharePoint automatisch eine <b>neue Version</b> an (Versionsverlauf bleibt erhalten).</span>
        </div>
        <div class="form-group">
          <label class="ack-check" style="font-weight:600"><input type="checkbox" ${p.pflicht ? 'checked' : ''} onchange="_editing.pflicht=this.checked"> Pflichtlektüre</label>
        </div>
        <div class="form-group">
          <label class="ack-check" style="font-weight:600"><input type="checkbox" ${p.quizErforderlich ? 'checked' : ''} onchange="_editing.quizErforderlich=this.checked;renderPolicyEditor()"> Wissenstest erforderlich</label>
        </div>
        <div class="form-group">
          <label>Wiederholungspflicht</label>
          <select onchange="_editing.wiederholungMonate=+this.value">
            <option value="0" ${!p.wiederholungMonate ? 'selected' : ''}>keine</option>
            <option value="6" ${p.wiederholungMonate == 6 ? 'selected' : ''}>alle 6 Monate</option>
            <option value="12" ${p.wiederholungMonate == 12 ? 'selected' : ''}>jährlich</option>
            <option value="24" ${p.wiederholungMonate == 24 ? 'selected' : ''}>alle 2 Jahre</option>
            <option value="36" ${p.wiederholungMonate == 36 ? 'selected' : ''}>alle 3 Jahre</option>
          </select>
          <span class="field-hint">Nach Ablauf müssen Mitarbeiter erneut bestätigen (+ ggf. Quiz).</span>
        </div>
        <div class="form-group">
          <label>Nächste Überprüfung (Review)</label>
          <input type="date" value="${esc((p.naechsteReview || '').slice(0, 10))}"
            onchange="_editing.naechsteReview = this.value ? new Date(this.value).toISOString() : ''">
          <span class="field-hint">Interner Termin zur Überprüfung der Richtlinie.</span>
        </div>
      </div>
      ${renderZielgruppenSection()}
      ${p.quizErforderlich ? renderQuizEditorSection() : ''}
    </div>
    <div class="modal-footer">
      ${p.id ? `<button class="btn btn-danger btn-sm" onclick="deletePolicyConfirm('${p.id}')" style="margin-right:auto">Löschen</button>` : ''}
      <button class="btn btn-outline" onclick="savePolicy()">Speichern (Entwurf)</button>
      ${(!p.id || p.status === 'Entwurf' || p.status === 'Konformitätsprüfung' || p.status === 'InReview')
        ? `<button class="btn btn-primary" onclick="savePolicy('Konformitätsprüfung')">${p.status === 'Konformitätsprüfung' ? '↻ Erneut zur Prüfung' : 'Zur Konformitätsprüfung →'}</button>`
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
  if (newStatus === 'Konformitätsprüfung') {
    p.pruefungSeit = new Date().toISOString();
    p.konformitaet = [];                    // neue Prüfrunde startet ohne Votes
  }
  try {
    await spSavePolicy(p);
    await reloadData();
    closeModal();
    renderAdminList();
    if (newStatus === 'Konformitätsprüfung') {
      toast('Gespeichert & zur Konformitätsprüfung eingereicht ✓', 'success');
      if (typeof notifyPruefer === 'function') notifyPruefer(p);   // Mail an Prüfer (Etappe B)
    } else {
      toast('Als Entwurf gespeichert ✓', 'success');
    }
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
  const admin = isCurrentUserAdmin();
  const istPruefer = (typeof isCurrentUserPruefer === 'function' && isCurrentUserPruefer()) || admin;
  const istGL = (typeof isCurrentUserGeschaeftsleitung === 'function' && isCurrentUserGeschaeftsleitung()) || admin;

  const prozess = `<div class="card" style="margin-bottom:14px"><div class="card-body" style="font-size:.85rem;line-height:1.6;color:#374151">
    <b>So läuft die Freigabe:</b> Entwurf → <b>1. Konformitätsprüfung</b> durch ${esc(getPruefer().join(', ') || '– keine Prüfer hinterlegt –')}
    (konform, wenn ${getKonformSchwelle() === 'alle' ? '<b>alle</b> zustimmen' : '<b>eine Person</b> zustimmt'}) → <b>2. Freigabe</b> durch die Geschäftsleitung
    ${esc(getGeschaeftsleitung().join(', ') || '– keine GL hinterlegt –')} (${getFreigabeSchwelle() === 'alle' ? '<b>alle</b>' : '<b>eine Person</b>'}) → <b>Veröffentlicht</b>.
    Bei „nicht konform" bleibt die Richtlinie in Prüfung. Erinnerungen &amp; Eskalation laufen automatisch (Power Automate).
  </div></div>`;

  const inPruefung = State.policies.filter(p => p.status === 'Konformitätsprüfung' || p.status === 'InReview');
  const inFreigabe = State.policies.filter(p => p.status === 'Freigabe');
  const sub = (t, n) => `<div style="font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;margin:18px 2px 8px">${t} (${n})</div>`;

  let html = prozess;
  if (istPruefer) {
    html += sub('1 · Konformitätsprüfung', inPruefung.length);
    html += inPruefung.length ? inPruefung.map(p => pruefCardHtml(p)).join('') : emptyState('Aktuell nichts zu prüfen.', '✓');
  }
  if (istGL) {
    html += sub('2 · Freigabe zur Veröffentlichung', inFreigabe.length);
    html += inFreigabe.length ? inFreigabe.map(p => freigabeCardHtml(p)).join('') : emptyState('Aktuell nichts freizugeben.', '✓');
  }
  if (!istPruefer && !istGL) html += `<div class="col-warning" style="display:block">Du bist weder als Prüfer noch als Geschäftsleitung hinterlegt (Einstellungen).</div>`;
  list.innerHTML = html;
}

function _votesHtml(p) {
  const votes = p.konformitaet || [];
  if (!votes.length) return '';
  return `<div style="margin-top:8px;font-size:.8rem;border-top:1px solid var(--c-border-2);padding-top:8px">${votes.map(v =>
    `<div style="padding:2px 0"><b>${esc(v.name || v.upn)}:</b> ${v.entscheidung === 'konform'
      ? '<span style="color:#15803d">konform ✓</span>'
      : '<span style="color:#b91c1c">nicht konform</span>' + (v.anmerkung ? ' – ' + esc(v.anmerkung) : '')}</div>`).join('')}</div>`;
}

function pruefCardHtml(p) {
  const mein = (p.konformitaet || []).find(v => (v.upn || '').toLowerCase() === State.user.upn.toLowerCase());
  const kannPruefen = typeof isCurrentUserPruefer === 'function' && isCurrentUserPruefer();
  return `<div class="item-card" style="cursor:default">
    <div class="ic-top"><div class="ic-title">${esc(p.title)}</div><div class="ic-topright">${workflowBadge(p.status)}</div></div>
    ${p.beschreibung ? `<div class="ic-desc">${esc(p.beschreibung)}</div>` : ''}
    <div class="ic-tags">${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}<span class="ic-tag">v${esc(p.version)}</span></div>
    ${_votesHtml(p)}
    <div style="display:flex;gap:7px;margin-top:12px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="previewPolicyDoc('${p.id}')">📄 Dokument ansehen</button>
      <div style="flex:1"></div>
      ${kannPruefen ? `
        <button class="btn btn-ghost btn-sm" onclick="markKonform('${p.id}',false)">Nicht konform</button>
        <button class="btn btn-success btn-sm" onclick="markKonform('${p.id}',true)">${mein && mein.entscheidung === 'konform' ? '✓ konform (du)' : 'Konform'}</button>` : ''}
    </div>
  </div>`;
}

function freigabeCardHtml(p) {
  const mein = (p.freigaben || []).find(v => (v.upn || '').toLowerCase() === State.user.upn.toLowerCase());
  const kannFreigeben = typeof isCurrentUserGeschaeftsleitung === 'function' && isCurrentUserGeschaeftsleitung();
  return `<div class="item-card" style="cursor:default">
    <div class="ic-top"><div class="ic-title">${esc(p.title)}</div><div class="ic-topright">${workflowBadge(p.status)}</div></div>
    ${p.beschreibung ? `<div class="ic-desc">${esc(p.beschreibung)}</div>` : ''}
    <div class="ic-tags">${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}<span class="ic-tag">v${esc(p.version)}</span></div>
    ${_votesHtml(p)}
    <div style="display:flex;gap:7px;margin-top:12px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="previewPolicyDoc('${p.id}')">📄 Dokument ansehen</button>
      <div style="flex:1"></div>
      <button class="btn btn-ghost btn-sm" onclick="markKonform('${p.id}',false)">Zurück (nicht konform)</button>
      ${kannFreigeben ? `<button class="btn btn-success btn-sm" onclick="markFreigabe('${p.id}')">${mein ? '✓ freigegeben (du)' : '✓ Freigeben'}</button>` : ''}
    </div>
  </div>`;
}

function konformErreicht(p) {
  const pruefer = getPruefer();
  if (!pruefer.length) return false;
  const ja = (p.konformitaet || []).filter(v => v.entscheidung === 'konform').map(v => (v.upn || '').toLowerCase());
  return getKonformSchwelle() === 'einer' ? ja.length >= 1 : pruefer.every(u => ja.includes(u.toLowerCase()));
}
function freigabeErreicht(p) {
  const gl = getGeschaeftsleitung();
  if (!gl.length) return false;
  const ja = (p.freigaben || []).map(v => (v.upn || '').toLowerCase());
  return getFreigabeSchwelle() === 'alle' ? gl.every(u => ja.includes(u.toLowerCase())) : ja.length >= 1;
}

async function markKonform(policyId, konform) {
  const p = JSON.parse(JSON.stringify(State.policies.find(x => x.id === policyId)));
  if (!p) return;
  let anmerkung = '';
  if (!konform) { anmerkung = prompt('Anmerkung (warum nicht konform)?'); if (anmerkung === null) return; }
  p.konformitaet = (p.konformitaet || []).filter(v => (v.upn || '').toLowerCase() !== State.user.upn.toLowerCase());
  p.konformitaet.push({ upn: State.user.upn, name: State.user.name, entscheidung: konform ? 'konform' : 'nicht_konform', anmerkung: anmerkung || '', datum: new Date().toISOString() });
  let toGL = false;
  if (!konform) p.status = 'Konformitätsprüfung';
  else if (konformErreicht(p)) { p.status = 'Freigabe'; toGL = true; }
  try {
    await spSavePolicy(p);
    await reloadData();
    renderFreigaben();
    toast(konform ? (toGL ? 'Konform – geht jetzt zur Freigabe ✓' : 'Als konform markiert ✓') : 'Als „nicht konform" vermerkt.', 'success');
    if (toGL) notifyGL(p);
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

async function markFreigabe(policyId) {
  const p = JSON.parse(JSON.stringify(State.policies.find(x => x.id === policyId)));
  if (!p) return;
  p.freigaben = (p.freigaben || []).filter(v => (v.upn || '').toLowerCase() !== State.user.upn.toLowerCase());
  p.freigaben.push({ upn: State.user.upn, name: State.user.name, datum: new Date().toISOString() });
  let published = false;
  if (freigabeErreicht(p)) {
    p.status = 'Veröffentlicht';
    p.veroeffentlichtAm = new Date().toISOString();
    p.freigegebenVon = (p.freigaben || []).map(v => v.name || v.upn).join(', ');
    published = true;
  }
  try {
    await spSavePolicy(p);
    await reloadData();
    renderFreigaben();
    toast(published ? 'Freigegeben & veröffentlicht ✓' : 'Freigabe vermerkt (weitere GL nötig).', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

async function notifyPruefer(p) {
  const pruefer = getPruefer();
  if (!pruefer.length) { toast('Keine Prüfer hinterlegt – bitte in den Einstellungen ergänzen.', 'error'); return; }
  try {
    await spSendMail(pruefer, `Neue Richtlinie zur Sichtung: ${p.title}`,
      _wfMailHtml('Neue Richtlinie – bitte um Sichtung und ggf. Anmerkung', p,
        'Bitte prüfe die Richtlinie auf Konformität und markiere im Tool „konform" oder „nicht konform" (mit Anmerkung).'));
    toast('Prüfer benachrichtigt ✓', 'success');
  } catch (e) { console.warn('Prüfer-Mail:', e.message); toast('Mail an Prüfer fehlgeschlagen (Mail.Send nötig): ' + e.message, 'error'); }
}
async function notifyGL(p) {
  const gl = getGeschaeftsleitung();
  if (!gl.length) return;
  try {
    await spSendMail(gl, `Richtlinie zur Freigabe: ${p.title}`,
      _wfMailHtml('Richtlinie ist konform – bitte um Freigabe', p,
        'Die Konformitätsprüfung ist abgeschlossen. Bitte gib die Richtlinie zur Veröffentlichung frei.'));
  } catch (e) { console.warn('GL-Mail:', e.message); }
}
function _wfMailHtml(headline, p, text) {
  const url = 'https://dfedorov12.github.io/richtlinienmanagementsystem/';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;font-size:15px;line-height:1.6;color:#1e2939">
    <p><b>${esc(headline)}</b></p>
    <p>Richtlinie: <b>${esc(p.title)}</b> (Version ${esc(p.version)}${p.kategorie ? ', ' + esc(p.kategorie) : ''})</p>
    <p>${esc(text)}</p>
    <p><a href="${url}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:10px 20px;border-radius:7px;font-weight:600">Zum Richtlinienmanagement →</a></p>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Automatische Nachricht vom DIHAG Richtlinienmanagementsystem.</p>
  </div>`;
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
  const mount = document.getElementById('compliance-mount');
  if (!mount) return;
  mount.innerHTML = '<div class="doc-loading">Lade Mitarbeiter & Bestätigungen …</div>';
  try {
    if (!AdminState.members) AdminState.members = await spGetMembers();
    AdminState.allAcks = await spGetAcknowledgements();   // alle Nutzer
    renderCompliance();
  } catch (e) {
    mount.innerHTML = `<div class="col-warning" style="display:block">Fehler beim Laden: ${esc(e.message)}<br>
      Für die Mitarbeiterliste wird die Graph-Berechtigung <b>User.Read.All</b> (Admin-Consent) benötigt.</div>`;
  }
}

function setComplianceMode(m) { AdminState.complianceMode = m; renderCompliance(); }

/** Rendert Modus-Umschalter + passenden Inhalt in #compliance-mount. */
function renderCompliance() {
  const mount = document.getElementById('compliance-mount');
  if (!mount) return;
  const mode = AdminState.complianceMode || 'overview';
  mount.innerHTML = `
    <div class="view-toolbar">
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm ${mode === 'overview' ? 'btn-primary' : 'btn-outline'}" onclick="setComplianceMode('overview')">Gesamtübersicht</button>
        <button class="btn btn-sm ${mode === 'single' ? 'btn-primary' : 'btn-outline'}" onclick="setComplianceMode('single')">Einzelne Richtlinie</button>
      </div>
      <div class="toolbar-spacer"></div>
      ${mode === 'overview'
        ? `<button class="btn btn-outline btn-sm" onclick="exportOverviewCsv()">CSV-Export (gesamt)</button>`
        : `<select id="compliance-policy" class="sort-select" onchange="renderComplianceDetail()"></select>
           <button class="btn btn-outline btn-sm" onclick="exportComplianceCsv()">CSV-Export</button>`}
    </div>
    <div id="compliance-body"></div>`;
  if (mode === 'overview') {
    renderComplianceOverview();
  } else {
    fillPolicySelect();
    const sel = document.getElementById('compliance-policy');
    if (sel && AdminState._jumpToPolicy) { sel.value = AdminState._jumpToPolicy; AdminState._jumpToPolicy = null; }
    renderComplianceDetail();
  }
}

function fillPolicySelect() {
  const sel = document.getElementById('compliance-policy');
  if (!sel) return;
  const pubs = State.policies.filter(p => p.status === 'Veröffentlicht' && p.pflicht);
  sel.innerHTML = pubs.length
    ? pubs.map(p => `<option value="${p.id}">${esc(p.title)} (v${esc(p.version)})</option>`).join('')
    : '<option value="">— keine —</option>';
}

/** Soll/Ist-Zeilen einer Richtlinie (Zielgruppe = passende Rollen; Ablauf zählt als offen). */
function _complianceRowsFor(p) {
  const members = (AdminState.members || []).filter(m =>
    policyMatchesRoles(p.zielgruppen, effectiveRoles(m.upn, m.department)));
  const byUpn = {};
  (AdminState.allAcks || [])
    .filter(a => a.richtlinieId === p.id && a.version === p.version)
    .forEach(a => { byUpn[(a.benutzerUpn || '').toLowerCase()] = a; });
  return members.map(m => {
    const a = byUpn[m.upn.toLowerCase()];
    let st = 'offen', date = '', score = null;
    if (a && !(typeof isExpired === 'function' && isExpired(p, a))) {
      score = a.quizScore;
      const fertig = p.quizErforderlich ? a.quizBestanden : !!a.gelesenAm;
      if (fertig) { st = 'abgeschlossen'; date = a.abgeschlossenAm || a.gelesenAm; }
      else if (a.gelesenAm) { st = 'gelesen'; date = a.gelesenAm; }
    }
    return { name: m.name, upn: m.upn, department: m.department || '', st, date, score };
  });
}

function renderComplianceOverview() {
  const body = document.getElementById('compliance-body');
  if (!body) return;
  const pubs = State.policies.filter(p => p.status === 'Veröffentlicht' && p.pflicht);
  if (!pubs.length) { body.innerHTML = emptyState('Keine veröffentlichten Pflicht-Richtlinien.'); return; }

  const perPolicy = pubs.map(p => {
    const rows = _complianceRowsFor(p);
    const done = rows.filter(r => r.st === 'abgeschlossen').length;
    return { p, soll: rows.length, done, offen: rows.length - done, quote: rows.length ? Math.round(done / rows.length * 100) : 100 };
  });

  // Aggregation pro Abteilung (Person × Pflicht-Richtlinie)
  const deptAgg = {};
  pubs.forEach(p => _complianceRowsFor(p).forEach(r => {
    const d = r.department || '(ohne Abteilung)';
    const e = deptAgg[d] = deptAgg[d] || { soll: 0, done: 0 };
    e.soll++; if (r.st === 'abgeschlossen') e.done++;
  }));

  const totalSoll = perPolicy.reduce((s, x) => s + x.soll, 0);
  const totalDone = perPolicy.reduce((s, x) => s + x.done, 0);
  const totalQuote = totalSoll ? Math.round(totalDone / totalSoll * 100) : 100;
  const qc = q => q >= 90 ? 'quote-hi' : q >= 60 ? 'quote-mid' : 'quote-lo';

  body.innerHTML = `
    <div class="stats-grid">
      ${statCard('blue', '📋', pubs.length, 'Pflicht-Richtlinien')}
      ${statCard('green', '✓', totalDone, 'Abschlüsse gesamt')}
      ${statCard('orange', '⏳', totalSoll - totalDone, 'Ausstehend gesamt')}
      ${statCard('purple', '📊', totalQuote + '%', 'Gesamt-Erfüllung')}
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-header"><h2>Pro Richtlinie</h2></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Richtlinie</th><th>Zielgruppe</th><th class="num">Soll</th><th class="num">Erledigt</th><th class="num">Offen</th><th>Quote</th></tr></thead>
        <tbody>${perPolicy.map(x => `<tr style="cursor:pointer" onclick="openComplianceFor('${x.p.id}')">
          <td>${esc(x.p.title)} <span style="color:var(--c-faint)">v${esc(x.p.version)}</span></td>
          <td style="color:var(--c-muted)">${esc(zielgruppenLabel(x.p))}</td>
          <td class="num">${x.soll}</td><td class="num">${x.done}</td><td class="num">${x.offen}</td>
          <td><span class="quote-pill ${qc(x.quote)}">${x.quote}%</span></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-header"><h2>Pro Abteilung</h2></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Abteilung</th><th class="num">Pflichten (Soll)</th><th class="num">Erledigt</th><th>Quote</th></tr></thead>
        <tbody>${Object.keys(deptAgg).sort((a, b) => a.localeCompare(b, 'de')).map(d => {
          const e = deptAgg[d]; const q = e.soll ? Math.round(e.done / e.soll * 100) : 100;
          return `<tr><td>${esc(d)}</td><td class="num">${e.soll}</td><td class="num">${e.done}</td><td><span class="quote-pill ${qc(q)}">${q}%</span></td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
}

function openComplianceFor(id) {
  AdminState.complianceMode = 'single';
  AdminState._jumpToPolicy = id;
  renderCompliance();
}

function renderComplianceDetail() {
  const sel = document.getElementById('compliance-policy');
  const body = document.getElementById('compliance-body');
  if (!body) return;
  const p = State.policies.find(x => x.id === (sel ? sel.value : null));
  if (!p) { body.innerHTML = emptyState('Keine veröffentlichte Pflicht-Richtlinie.'); return; }

  const rows = _complianceRowsFor(p);
  rows.sort((a, b) => (a.st === b.st ? a.name.localeCompare(b.name, 'de') : a.st.localeCompare(b.st)));
  AdminState.lastComplianceRows = rows;
  AdminState.lastCompliancePolicy = p;

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
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="remindOpenForCurrent()">⏰ Offene erinnern</button>
          <span class="quote-pill ${qCls}">${quote}% erfüllt</span>
        </div>
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

/* ── #4 Erinnerung an offene Mitarbeiter der aktuell gewählten Richtlinie ── */
async function remindOpenForCurrent() {
  const p = AdminState.lastCompliancePolicy;
  const rows = AdminState.lastComplianceRows || [];
  if (!p) { toast('Keine Richtlinie gewählt.', 'error'); return; }
  const offene = [...new Set(rows.filter(r => r.st !== 'abgeschlossen').map(r => r.upn))];
  if (!offene.length) { toast('Keine offenen Mitarbeiter – nichts zu erinnern.', 'success'); return; }
  if (!confirm(`Erinnerungs-Mail an ${offene.length} Mitarbeiter zu „${p.title}" senden?`)) return;
  try {
    const ok = await spSendMail(offene, `Erinnerung: Pflicht-Richtlinie „${p.title}"`, reminderHtml(p));
    if (ok) toast(`Erinnerung an ${offene.length} Mitarbeiter gesendet ✓`, 'success');
  } catch (e) {
    toast('Mail-Versand fehlgeschlagen: ' + e.message, 'error');
  }
}

function reminderHtml(p) {
  const url = 'https://dfedorov12.github.io/richtlinienmanagementsystem/';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;font-size:15px;line-height:1.6;color:#1e2939">
    <p>Hallo,</p>
    <p>für die Pflicht-Richtlinie <b>„${esc(p.title)}"</b> (Version ${esc(p.version)}) liegt von Ihnen noch keine ${p.quizErforderlich ? 'abgeschlossene Bearbeitung (Kenntnisnahme + Wissenstest)' : 'Kenntnisnahme'} vor.</p>
    <p>Bitte holen Sie das zeitnah nach:</p>
    <p><a href="${url}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:10px 20px;border-radius:7px;font-weight:600">Zum Richtlinienmanagement →</a></p>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Automatische Erinnerung vom DIHAG Richtlinienmanagementsystem.</p>
  </div>`;
}

function exportComplianceCsv() {
  const rows = AdminState.lastComplianceRows;
  const p = AdminState.lastCompliancePolicy;
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

function exportOverviewCsv() {
  const pubs = State.policies.filter(p => p.status === 'Veröffentlicht' && p.pflicht);
  if (!pubs.length) { toast('Nichts zu exportieren.', 'error'); return; }
  const lines = ['Richtlinie;Version;Zielgruppe;Soll;Erledigt;Offen;Quote'];
  pubs.forEach(p => {
    const rows = _complianceRowsFor(p);
    const done = rows.filter(r => r.st === 'abgeschlossen').length;
    const q = rows.length ? Math.round(done / rows.length * 100) : 100;
    lines.push([_csv(p.title), _csv(p.version), _csv(zielgruppenLabel(p)), rows.length, done, rows.length - done, q + '%'].join(';'));
  });
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Compliance_Gesamtuebersicht.csv';
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
      ${roleCard('genehmiger', 'Genehmiger (einfache Freigabe, optional)')}
      ${roleCard('pruefer', 'Konformitätsprüfer')}
      ${roleCard('geschaeftsleitung', 'Geschäftsleitung (Freigabe zur Veröffentlichung)')}

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Genehmigungsverfahren – Schwellen</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">Ablauf: Entwurf → Konformitätsprüfung → Freigabe → Veröffentlicht. Erinnerungen &amp; Eskalation laufen zeitgesteuert über Power Automate (siehe Doku).</div>
          <div class="form-grid">
            <div class="form-group"><label>„Konform", wenn …</label>
              <select onchange="_cfgEdit.konformSchwelle=this.value">
                <option value="alle" ${_cfgEdit.konformSchwelle === 'alle' ? 'selected' : ''}>alle Prüfer zustimmen</option>
                <option value="einer" ${_cfgEdit.konformSchwelle === 'einer' ? 'selected' : ''}>ein Prüfer reicht</option>
              </select></div>
            <div class="form-group"><label>Freigabe, wenn …</label>
              <select onchange="_cfgEdit.freigabeSchwelle=this.value">
                <option value="einer" ${_cfgEdit.freigabeSchwelle === 'einer' ? 'selected' : ''}>eine GL-Person reicht</option>
                <option value="alle" ${_cfgEdit.freigabeSchwelle === 'alle' ? 'selected' : ''}>alle GL-Personen</option>
              </select></div>
            <div class="form-group full"><label>Eskalations-Mail (bei keiner Antwort)</label>
              <input type="email" value="${esc(_cfgEdit.eskalationMail || '')}" oninput="_cfgEdit.eskalationMail=this.value" placeholder="ersatz-pruefer@dihag.com"></div>
          </div>
        </div>
      </div>

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
        <div class="card-header"><h2>Azure-AD-Abteilungen (automatische Zuordnung)</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">Diese Abteilungen (<code>department</code>) stehen in den AD-Profilen eurer Mitarbeiter. Eine Person gilt <b>automatisch</b> für eine Rolle, wenn ihre Abteilung exakt dem Rollennamen entspricht. Übernimm die passende Abteilung als Rolle.</div>
          <div id="ad-departments"><div class="doc-loading">Lade Mitarbeiter aus Azure-AD …</div></div>
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
  loadAdDepartments();
}

/* ── Azure-AD-Abteilungen (Transparenz für automatische Rollenzuordnung) ── */
async function loadAdDepartments() {
  const host = document.getElementById('ad-departments');
  if (!host) return;
  host.innerHTML = '<div class="doc-loading">Lade Mitarbeiter aus Azure-AD …</div>';
  try {
    if (!AdminState.members) AdminState.members = await spGetMembers();
    const members = AdminState.members;
    const byDept = {};
    let ohne = 0;
    members.forEach(m => {
      const d = (m.department || '').trim();
      if (!d) { ohne++; return; }
      (byDept[d] = byDept[d] || []).push(m.name);
    });
    const depts = Object.keys(byDept).sort((a, b) => a.localeCompare(b, 'de'));
    AdminState.lastDepts = depts;
    if (!depts.length) {
      host.innerHTML = `<div class="col-warning" style="display:block;margin:0">Im Azure-AD ist bei allen ${members.length} Mitarbeitern das Feld „Abteilung" leer. Automatische Zuordnung greift daher nicht — pflege die Abteilung in den AD-Profilen oder nutze die manuelle Zuordnung unten.</div>`;
      return;
    }
    host.innerHTML = depts.map((d, i) => {
      const inRoles = (_cfgEdit.roles || []).some(r => r.toLowerCase() === d.toLowerCase());
      return `<div class="dp-row" style="cursor:default">
        <span class="ic">🏢</span>
        <span class="nm">${esc(d)} <span style="color:var(--c-faint)">· ${byDept[d].length} Mitarbeiter</span></span>
        ${inRoles
          ? '<span class="status-badge sb-done">ist Rolle ✓</span>'
          : `<button class="btn btn-outline btn-sm" onclick="cfgAddRoleNamed(${i})">Als Rolle übernehmen</button>`}
      </div>`;
    }).join('') + (ohne ? `<div class="field-hint" style="margin-top:8px">${ohne} Mitarbeiter ohne Abteilung im AD (greifen nur über manuelle Zuordnung).</div>` : '');
  } catch (e) {
    host.innerHTML = `<div class="col-warning" style="display:block;margin:0">Mitarbeiter konnten nicht geladen werden: ${esc(e.message)}<br>Benötigt die Graph-Berechtigung <b>User.Read.All</b> (Admin-Consent).</div>`;
  }
}

function cfgAddRoleNamed(i) {
  const name = (AdminState.lastDepts || [])[i];
  if (!name) return;
  if (!_cfgEdit.roles) _cfgEdit.roles = [];
  if (!_cfgEdit.roles.some(r => r.toLowerCase() === name.toLowerCase())) _cfgEdit.roles.push(name);
  renderRolesList();
  renderUserRolesList();
  loadAdDepartments();
  toast('Rolle „' + name + '" hinzugefügt – noch speichern.', 'success');
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
  ['admins', 'genehmiger', 'pruefer', 'geschaeftsleitung'].forEach(role => {
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
