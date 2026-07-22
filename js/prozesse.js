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
      ${canWrite ? `<button class="btn btn-primary btn-sm" onclick="openProcessEditor(null)">+ Neuer Prozess</button>` : ''}
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

async function openProcessEditor(itemId) {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const proc = itemId ? (_processes || []).find(p => String(p.itemId) === String(itemId)) : null;
  _procEditing = { itemId: itemId || null, origName: proc ? proc.name : '' };
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
          <input type="text" id="proc-name" value="${esc(proc ? proc.title : '')}" placeholder="z. B. Freigabe von Lieferanten" ${canWrite ? '' : 'disabled'}></div>
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
  }
  try {
    await _bpmnModeler.importXML(xml);
    _bpmnModeler.get('canvas').zoom('fit-viewport');
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = proc ? '' : 'Neues Diagramm – ziehe Elemente aus der Palette links.';
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
