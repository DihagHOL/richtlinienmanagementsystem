'use strict';

/**
 * Reiter „Prozesse" (BPMN 2.0)
 * ============================
 * Prozesse im Camunda-Stil selbst modellieren (bpmn-js, self-hosted unter
 * vendor/bpmn-js) und mit Richtlinien verknüpfen. Speicherung als .bpmn-Datei
 * im Ordner „Prozesse" der ISMS-Dokumentbibliothek. Die Verknüpfung zu
 * Richtlinien liegt im BPMN-XML selbst (Prozess-Dokumentation, Marker
 * [[rms:policies=…]]) – keine zusätzliche SharePoint-Liste/Spalte nötig.
 */

let _processes = null;          // geladene Prozessliste (Cache)
let _processesLoading = false;
let _bpmnModeler = null;        // aktive Modeler-Instanz (im Editor)
let _procEditing = null;        // { itemId, origName } des aktuell bearbeiteten Prozesses
let _bpmnLibLoading = null;     // Promise beim Nachladen der Bibliothek
let _procLinkCache = {};        // itemId|modified → [policyId,…] (spart Refetch beim Filtern)

const PROC_POLICY_MARKER = /\[\[rms:policies=([^\]]*)\]\]/;

// Leeres Start-Diagramm (ein Start-Ereignis) – Basis für „Neuer Prozess".
const DEFAULT_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="173" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/** bpmn-js (self-hosted) bei Bedarf nachladen (CSS + JS). Wird nur beim ersten
 *  Öffnen des Editors geholt – belastet den Start der App nicht. */
function _ensureBpmnLib() {
  if (window.BpmnJS) return Promise.resolve();
  if (_bpmnLibLoading) return _bpmnLibLoading;
  _bpmnLibLoading = new Promise((resolve, reject) => {
    ['vendor/bpmn-js/assets/diagram-js.css',
     'vendor/bpmn-js/assets/bpmn-js.css',
     'vendor/bpmn-js/assets/bpmn-font/bpmn-embedded.css'].forEach(href => {
      if (!document.querySelector(`link[data-bpmn="${href}"]`)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-bpmn', href);
        document.head.appendChild(l);
      }
    });
    const s = document.createElement('script');
    s.src = 'vendor/bpmn-js/bpmn-modeler.production.min.js';
    s.onload = () => resolve();
    s.onerror = () => { _bpmnLibLoading = null; reject(new Error('bpmn-js konnte nicht geladen werden (vendor/bpmn-js).')); };
    document.head.appendChild(s);
  });
  return _bpmnLibLoading;
}

function _destroyModeler() {
  if (_bpmnModeler) { try { _bpmnModeler.destroy(); } catch (e) { /* egal */ } _bpmnModeler = null; }
}

async function initProzesse() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  _destroyModeler();   // evtl. offenen Editor beenden → zurück zur Liste
  if (_processes) renderProzesseList();
  else mount.innerHTML = '<div class="doc-loading">Lade Prozesse …</div>';
  _processesLoading = true;
  try {
    _processes = await spListProcesses();
  } catch (e) {
    _processesLoading = false;
    if (_processes) { toast('Aktualisieren fehlgeschlagen: ' + e.message, 'error'); return; }
    mount.innerHTML = `<div class="col-warning" style="display:block">Prozesse konnten nicht geladen werden: ${esc(e.message)}
      <br><span class="field-hint">Prozesse liegen als .bpmn-Dateien im Ordner „Prozesse" der ISMS-Bibliothek (wird beim ersten Speichern automatisch angelegt). „↻ Aktualisieren" versuchen.</span></div>`;
    return;
  }
  _processesLoading = false;
  renderProzesseList();
}

async function refreshProzesse() { _processes = null; _procLinkCache = {}; await initProzesse(); }

function renderProzesseList() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('prozesse');
  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Prozesse (BPMN 2.0) im Camunda-Stil selbst modellieren und mit Richtlinien verknüpfen –
      „<b>im Einklang mit den Richtlinien</b>". Gespeichert als <b>.bpmn</b> im Ordner „Prozesse" der ISMS-Bibliothek.
    </div>
    <div class="view-toolbar">
      <div class="search-box">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input type="text" id="search-proc" placeholder="Prozess suchen …" oninput="_renderProcCards()">
      </div>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-sm btn-ghost" onclick="refreshProzesse()" title="Aktualisieren">↻ Aktualisieren</button>
      ${canWrite ? `<button class="btn btn-outline btn-sm" onclick="openProcessDraftPicker()" title="Starter-Prozess (Entwurf) aus einer Richtlinie erzeugen">✨ Aus Richtlinie</button>` : ''}
      ${canWrite ? `<button class="btn btn-outline btn-sm" onclick="document.getElementById('proc-import-input').click()" title="BPMN-Datei (.bpmn/.xml) importieren">⬆ Importieren</button>` : ''}
      ${canWrite ? `<button class="btn btn-primary btn-sm" onclick="openProcessEditor(null)">+ Neuer Prozess</button>` : ''}
      <input type="file" id="proc-import-input" accept=".bpmn,.xml" style="display:none" onchange="importBpmnFile(this)">
    </div>
    <div id="proc-cards"></div>`;
  _renderProcCards();
}

/** Nur die Kartenliste (neu) rendern – Toolbar/Suchfeld bleiben erhalten (kein Fokusverlust). */
function _renderProcCards() {
  const host = document.getElementById('proc-cards');
  if (!host) return;
  const all = _processes || [];
  const q = (document.getElementById('search-proc')?.value || '').toLowerCase().trim();
  const rows = q ? all.filter(p => (p.title || '').toLowerCase().includes(q)) : all;
  if (!rows.length) {
    host.innerHTML = typeof emptyState === 'function'
      ? emptyState(all.length ? 'Keine Treffer.' : 'Noch keine Prozesse – oben „+ Neuer Prozess".', all.length ? '🔍' : '🔀')
      : '<div class="field-hint">Keine Prozesse.</div>';
    return;
  }
  host.innerHTML = `<div class="item-cards">${rows.map(p => `
    <div class="item-card" style="cursor:pointer" onclick="openProcessEditor('${esc(p.itemId)}')">
      <div class="ic-top"><div class="ic-title">🔀 ${esc(p.title)}</div></div>
      <div class="ic-tags"><span class="ic-tag">.bpmn</span>${p.modifiedBy ? `<span class="ic-tag">${esc(p.modifiedBy)}</span>` : ''}${p.modified ? `<span class="ic-tag">${esc(fmtDate(p.modified))}</span>` : ''}</div>
      <div id="proc-link-${esc(p.itemId)}" style="margin-top:8px;font-size:.8rem;color:var(--c-muted)">…</div>
    </div>`).join('')}</div>`;
  // Verknüpfte Richtlinien pro Karte (aus dem BPMN-XML) – progressiv, mit Cache.
  rows.forEach(p => {
    const key = p.itemId + '|' + p.modified;
    if (_procLinkCache[key]) _renderCardLink(p.itemId, _procLinkCache[key]);
    else _enrichProcessCard(p, key);
  });
}

async function _enrichProcessCard(p, key) {
  try {
    const xml = await spGetProcessXml(p.itemId);
    const ids = _parsePolicyIds(xml);
    _procLinkCache[key] = ids;
    _renderCardLink(p.itemId, ids);
  } catch (e) {
    const el = document.getElementById('proc-link-' + p.itemId);
    if (el) el.textContent = '';
  }
}

function _renderCardLink(itemId, ids) {
  const el = document.getElementById('proc-link-' + itemId);
  if (!el) return;
  if (!ids || !ids.length) { el.innerHTML = '<span style="color:var(--c-faint)">keine Richtlinie verknüpft</span>'; return; }
  el.innerHTML = '🔗 ' + ids.map(id => {
    const pol = (State.policies || []).find(x => String(x.id) === String(id));
    return `<span class="ic-tag" style="background:#eef2ff;color:#3730a3">${esc(pol ? pol.title : 'Richtlinie ' + id)}</span>`;
  }).join(' ');
}

function _parsePolicyIds(xml) {
  const m = String(xml || '').match(PROC_POLICY_MARKER);
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}

/* ── Editor (bpmn-js Modeler) ── */

async function openProcessEditor(itemId, seed) {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const proc = itemId ? (_processes || []).find(p => String(p.itemId) === String(itemId)) : null;
  _procEditing = { itemId: itemId || null, origName: proc ? proc.name : '' };
  const startName = proc ? proc.title : (seed && seed.name ? seed.name : '');
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('prozesse');

  mount.innerHTML = `
    <div class="view-toolbar">
      <button class="btn btn-sm btn-ghost" onclick="initProzesse()">← Zurück zur Liste</button>
      <div style="font-weight:700">${proc ? 'Prozess bearbeiten' : 'Neuer Prozess'}</div>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-outline btn-sm" onclick="downloadProcessXml()" title="BPMN-Datei herunterladen">⬇ .bpmn</button>
      ${itemId && canWrite ? `<button class="btn btn-outline btn-sm" style="color:#b91c1c" onclick="deleteProcess()">Löschen</button>` : ''}
      ${canWrite ? `<button class="btn btn-primary btn-sm" id="proc-save-btn" onclick="saveProcess()">💾 Speichern</button>` : ''}
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div style="flex:1;min-width:320px">
        <div id="bpmn-canvas" style="height:70vh;min-height:460px;border:1px solid var(--c-border);border-radius:10px;background:#fff"></div>
      </div>
      <div style="width:280px;max-width:100%">
        <div class="form-group full"><label>Prozessname <span class="req">*</span></label>
          <input type="text" id="proc-name" value="${esc(startName)}" placeholder="z. B. Freigabe von Lieferanten" ${canWrite ? '' : 'disabled'}></div>
        <div class="form-group full"><label>Verknüpfte Richtlinien</label>
          <div id="proc-policy-list" style="max-height:230px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:8px"></div>
          <span class="field-hint">Welche Richtlinien dieser Prozess umsetzt. Wird in der BPMN-Datei gespeichert und im Prozess dokumentiert.</span></div>
        <div id="proc-status" class="field-hint" style="margin-top:8px">Modeler wird geladen …</div>
      </div>
    </div>`;
  _renderPolicyPicker([], canWrite);

  try {
    await _ensureBpmnLib();
  } catch (e) {
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = `<span style="color:#b91c1c">${esc(e.message)}</span>`;
    return;
  }
  _destroyModeler();
  _bpmnModeler = new BpmnJS({ container: '#bpmn-canvas' });

  let xml = DEFAULT_BPMN, ids = [];
  if (itemId) {
    try { xml = await spGetProcessXml(itemId); ids = _parsePolicyIds(xml); }
    catch (e) { toast('Prozess laden fehlgeschlagen: ' + e.message, 'error'); }
  } else if (seed && seed.xml) {
    xml = seed.xml;
    ids = (seed.policyIds && seed.policyIds.length) ? seed.policyIds : _parsePolicyIds(xml);
  }
  try {
    await _bpmnModeler.importXML(xml);
    _bpmnModeler.get('canvas').zoom('fit-viewport');
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = (proc || (seed && seed.xml)) ? '' : 'Neues Diagramm – ziehe Elemente aus der Palette links.';
  } catch (e) {
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = `<span style="color:#b91c1c">Diagramm konnte nicht geladen werden: ${esc(e.message)}</span>`;
  }
  _renderPolicyPicker(ids, canWrite);
}

function _renderPolicyPicker(selectedIds, canWrite) {
  const host = document.getElementById('proc-policy-list');
  if (!host) return;
  const sel = new Set((selectedIds || []).map(String));
  const pols = (State.policies || []).filter(p => p.status !== 'Archiviert')
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  if (!pols.length) { host.innerHTML = '<span class="field-hint">Keine Richtlinien vorhanden.</span>'; return; }
  host.innerHTML = pols.map(p => `
    <label class="ack-check" style="font-weight:500;align-items:flex-start;margin-bottom:2px">
      <input type="checkbox" value="${esc(p.id)}" ${sel.has(String(p.id)) ? 'checked' : ''} ${canWrite ? '' : 'disabled'}>
      <span>${esc(p.title)}${p.version ? ` <span style="color:var(--c-faint)">v${esc(p.version)}</span>` : ''}</span>
    </label>`).join('');
}

function _selectedPolicyIds() {
  return [...document.querySelectorAll('#proc-policy-list input[type=checkbox]:checked')].map(c => c.value);
}

/** Richtlinien-Verknüpfung in die Prozess-Dokumentation schreiben (Marker + Klartext). */
function _setProcessPolicies(ids) {
  if (!_bpmnModeler) return;
  try {
    const root = _bpmnModeler.get('canvas').getRootElement();
    const bo = root && root.businessObject;
    if (!bo) return;
    const moddle = _bpmnModeler.get('moddle');
    if (!ids || !ids.length) { bo.documentation = undefined; return; }
    const names = ids.map(id => {
      const p = (State.policies || []).find(x => String(x.id) === String(id));
      return p ? p.title : ('Richtlinie ' + id);
    });
    const text = `Im Einklang mit den Richtlinien: ${names.join('; ')}\n[[rms:policies=${ids.join(',')}]]`;
    bo.documentation = [moddle.create('bpmn:Documentation', { text })];
  } catch (e) { console.warn('Richtlinien-Verknüpfung nicht gesetzt:', e.message); }
}

async function saveProcess() {
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const name = (document.getElementById('proc-name')?.value || '').trim();
  if (!name) { toast('Bitte einen Prozessnamen angeben.', 'error'); document.getElementById('proc-name')?.focus(); return; }
  if (!_bpmnModeler) return;
  const btn = document.getElementById('proc-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '💾 Speichern …'; }
  try {
    _setProcessPolicies(_selectedPolicyIds());
    const { xml } = await _bpmnModeler.saveXML({ format: true });
    const saved = await spSaveProcess(name, xml);
    // Umbenennung: neuer Dateiname ⇒ neue Datei → alte Datei entfernen (kein Duplikat).
    const newFname = /\.bpmn$/i.test(name) ? name : name + '.bpmn';
    const oldName = _procEditing && _procEditing.origName;
    if (_procEditing && _procEditing.itemId && oldName && oldName !== newFname) {
      try { await spDeleteProcess(_procEditing.itemId); } catch (e) { console.warn('Alte Prozessdatei nicht gelöscht:', e.message); }
    }
    _processes = null; _procLinkCache = {};   // Liste neu laden, wenn man zurückgeht
    _procEditing = { itemId: saved && saved.id, origName: newFname };
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = `<span style="color:#15803d">Gespeichert: ${esc(newFname)} ✓</span>`;
    toast('Prozess gespeichert ✓', 'success');
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Speichern'; }
  }
}

async function downloadProcessXml() {
  if (!_bpmnModeler) return;
  try {
    _setProcessPolicies(_selectedPolicyIds());
    const { xml } = await _bpmnModeler.saveXML({ format: true });
    const name = (document.getElementById('proc-name')?.value || 'prozess').trim() || 'prozess';
    const fname = /\.bpmn$/i.test(name) ? name : name + '.bpmn';
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { toast('Download fehlgeschlagen: ' + e.message, 'error'); }
}

async function deleteProcess() {
  if (!_procEditing || !_procEditing.itemId) return;
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const nm = (document.getElementById('proc-name')?.value || 'diesen Prozess').trim();
  if (!confirm(`Prozess „${nm}" wirklich löschen?`)) return;
  try {
    await spDeleteProcess(_procEditing.itemId);
    _processes = null; _procLinkCache = {};
    toast('Prozess gelöscht.', 'success');
    initProzesse();
  } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 'error'); }
}

/* ── BPMN importieren ── */

/** Eine .bpmn/.xml-Datei einlesen und als neuen (ungespeicherten) Prozess öffnen. */
async function importBpmnFile(input) {
  const file = input && input.files && input.files[0];
  if (input) input.value = '';
  if (!file) return;
  if (!/\.(bpmn|xml)$/i.test(file.name)) { toast('Bitte eine .bpmn- oder .xml-Datei wählen.', 'error'); return; }
  try {
    const xml = await file.text();
    if (!/<(bpmn:)?definitions[\s>]/i.test(xml)) { toast('Die Datei enthält kein BPMN 2.0 (kein <definitions>).', 'error'); return; }
    const name = file.name.replace(/\.(bpmn|xml)$/i, '');
    await openProcessEditor(null, { name, xml });
    toast('BPMN importiert – prüfen, ggf. Richtlinien verknüpfen und speichern.', 'success');
  } catch (e) { toast('Import fehlgeschlagen: ' + e.message, 'error'); }
}

/* ── Prozess-Entwurf aus einer Richtlinie ── */

function openProcessDraftPicker() {
  const pols = (State.policies || []).filter(p => p.status !== 'Archiviert')
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  if (!pols.length) { toast('Keine Richtlinien vorhanden, aus denen ein Entwurf erzeugt werden kann.', 'error'); return; }
  openModal(`
    <div class="modal-header"><h3>✨ Prozess-Entwurf aus Richtlinie</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:12px">Erzeugt einen BPMN-Starter-Prozess passend zur gewählten Richtlinie
        (Auslöser → <b>Richtlinie anwenden</b> → Gateway <b>„Konform?"</b> → Umsetzen/Dokumentieren bzw. Abweichung behandeln).
        Der Prozess ist automatisch benannt und mit der Richtlinie verknüpft – danach frei anpassbar.</div>
      <div class="form-group full"><label>Richtlinie</label>
        <select id="proc-draft-policy" class="form-control">
          ${pols.map(p => `<option value="${esc(p.id)}">${esc(p.title)}${p.version ? ' (v' + esc(p.version) + ')' : ''}</option>`).join('')}
        </select></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="createProcessDraft()">Entwurf erstellen →</button>
    </div>`);
}

async function createProcessDraft() {
  const id = document.getElementById('proc-draft-policy')?.value;
  const p = (State.policies || []).find(x => String(x.id) === String(id));
  if (!p) { toast('Richtlinie nicht gefunden.', 'error'); return; }
  closeModal();
  await openProcessEditor(null, _bpmnDraftFromPolicy(p));
  toast('Entwurf erstellt – anpassen und speichern.', 'success');
}

/** XML-Attribut-/Text-Escaping (für generiertes BPMN). */
function _xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Starter-BPMN aus einer Richtlinie erzeugen: { name, xml, policyIds }. */
function _bpmnDraftFromPolicy(p) {
  const title = String(p.title || 'Richtlinie').replace(/\.docx?$/i, '');
  const short = title.length > 34 ? title.slice(0, 32) + '…' : title;
  const name  = title + ' – Prozess';
  const t1    = _xmlEsc(short + ' anwenden/prüfen');
  const doc   = _xmlEsc(`Prozess zur Umsetzung der Richtlinie „${title}". Im Einklang mit den Richtlinien: ${title}\n[[rms:policies=${p.id}]]`);
  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:documentation>${doc}</bpmn:documentation>
    <bpmn:startEvent id="Start_1" name="Auslöser"><bpmn:outgoing>F_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1" name="${t1}"><bpmn:incoming>F_1</bpmn:incoming><bpmn:outgoing>F_2</bpmn:outgoing></bpmn:task>
    <bpmn:exclusiveGateway id="Gw_1" name="Konform?"><bpmn:incoming>F_2</bpmn:incoming><bpmn:outgoing>F_3</bpmn:outgoing><bpmn:outgoing>F_5</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:task id="Task_2" name="Umsetzen &amp; dokumentieren"><bpmn:incoming>F_3</bpmn:incoming><bpmn:outgoing>F_4</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End_1" name="Abgeschlossen"><bpmn:incoming>F_4</bpmn:incoming></bpmn:endEvent>
    <bpmn:task id="Task_3" name="Abweichung behandeln"><bpmn:incoming>F_5</bpmn:incoming><bpmn:outgoing>F_6</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End_2" name="Nachbessern"><bpmn:incoming>F_6</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="F_2" sourceRef="Task_1" targetRef="Gw_1" />
    <bpmn:sequenceFlow id="F_3" name="ja" sourceRef="Gw_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="F_4" sourceRef="Task_2" targetRef="End_1" />
    <bpmn:sequenceFlow id="F_5" name="nein" sourceRef="Gw_1" targetRef="Task_3" />
    <bpmn:sequenceFlow id="F_6" sourceRef="Task_3" targetRef="End_2" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dia_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="152" y="192" width="36" height="36" /><bpmndi:BPMNLabel><dc:Bounds x="150" y="235" width="44" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="240" y="170" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gw_1_di" bpmnElement="Gw_1" isMarkerVisible="true"><dc:Bounds x="415" y="185" width="50" height="50" /><bpmndi:BPMNLabel><dc:Bounds x="408" y="158" width="64" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2"><dc:Bounds x="520" y="90" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1"><dc:Bounds x="700" y="112" width="36" height="36" /><bpmndi:BPMNLabel><dc:Bounds x="686" y="155" width="66" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_3_di" bpmnElement="Task_3"><dc:Bounds x="520" y="270" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_2_di" bpmnElement="End_2"><dc:Bounds x="700" y="292" width="36" height="36" /><bpmndi:BPMNLabel><dc:Bounds x="688" y="335" width="62" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="F_1_di" bpmnElement="F_1"><di:waypoint x="188" y="210" /><di:waypoint x="240" y="210" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_2_di" bpmnElement="F_2"><di:waypoint x="360" y="210" /><di:waypoint x="415" y="210" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_3_di" bpmnElement="F_3"><di:waypoint x="440" y="185" /><di:waypoint x="440" y="130" /><di:waypoint x="520" y="130" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_4_di" bpmnElement="F_4"><di:waypoint x="640" y="130" /><di:waypoint x="700" y="130" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_5_di" bpmnElement="F_5"><di:waypoint x="440" y="235" /><di:waypoint x="440" y="310" /><di:waypoint x="520" y="310" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_6_di" bpmnElement="F_6"><di:waypoint x="640" y="310" /><di:waypoint x="700" y="310" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
  return { name, xml, policyIds: [String(p.id)] };
}
