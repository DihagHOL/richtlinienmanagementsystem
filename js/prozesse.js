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
      <div class="field-hint" style="margin-bottom:12px">Liest den <b>Text der Richtlinie</b> (verknüpftes Word-Dokument) aus und
        erzeugt daraus einen echten Prozessentwurf: nummerierte/aufgezählte Schritte werden zu Aufgaben,
        Entscheidungen (z. B. „…konform?", „…genehmigt?") zu Gateways. Danach im Modeler frei anpassbar.</div>
      <div class="form-group full"><label>Richtlinie</label>
        <select id="proc-draft-policy" class="form-control">
          ${pols.map(p => `<option value="${esc(p.id)}">${esc(p.title)}${p.version ? ' (v' + esc(p.version) + ')' : ''}</option>`).join('')}
        </select></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="createProcessDraft()">Text auslesen →</button>
    </div>`);
}

async function createProcessDraft() {
  const id = document.getElementById('proc-draft-policy')?.value;
  const p = (State.policies || []).find(x => String(x.id) === String(id));
  if (!p) { toast('Richtlinie nicht gefunden.', 'error'); return; }
  const body = document.querySelector('.modal-body');
  if (body) body.innerHTML = '<div class="doc-loading">Richtlinien-Dokument wird ausgelesen …</div>';
  let text = '', err = '';
  if (p.dokumentDriveId && p.dokumentItemId && typeof spGetPolicyDocText === 'function') {
    try { text = await spGetPolicyDocText(p.dokumentDriveId, p.dokumentItemId); }
    catch (e) { err = e.message; }
  } else {
    err = 'Mit dieser Richtlinie ist kein Word-Dokument verknüpft – Prozesstext bitte manuell einfügen.';
  }
  _procDraftShowText(p, text, err);
}

/** Schritt 2: extrahierten Text zeigen/bearbeiten, dann BPMN erzeugen. */
function _procDraftShowText(p, text, err) {
  const body = document.querySelector('.modal-body');
  const footer = document.querySelector('.modal-footer');
  if (body) body.innerHTML = `
    <div class="field-hint" style="margin-bottom:8px">
      ${err ? `<span style="color:#b45309">${esc(err)}</span><br>` : 'Text aus dem Richtlinien-Dokument ausgelesen. '}
      Prüfen/kürzen: Am besten <b>nummerierte oder aufgezählte Schritte</b> (eine Aktion je Zeile); Entscheidungen mit „?" oder z. B. „konform?".</div>
    <textarea id="proc-draft-text" style="width:100%;height:300px;border:1px solid var(--c-border);border-radius:8px;padding:10px;font-family:inherit;font-size:.85rem;line-height:1.5"
      placeholder="1. Antrag prüfen&#10;2. Freigegeben?&#10;3. Umsetzen und dokumentieren">${esc(text || '')}</textarea>`;
  if (footer) footer.innerHTML = `
    <button class="btn btn-outline" onclick="openProcessDraftPicker()">← Zurück</button>
    <div style="flex:1"></div>
    <button class="btn btn-primary" onclick="procGenerateFromText('${esc(String(p.id))}')">BPMN-Entwurf erzeugen →</button>`;
}

function procGenerateFromText(pid) {
  const p = (State.policies || []).find(x => String(x.id) === String(pid));
  if (!p) { toast('Richtlinie nicht gefunden.', 'error'); return; }
  const text = document.getElementById('proc-draft-text')?.value || '';
  const title = String(p.title || 'Richtlinie').replace(/\.docx?$/i, '');
  const seed = _bpmnFromText(text, title + ' – Prozess', [String(p.id)]);
  closeModal();
  openProcessEditor(null, seed);
  toast('Prozessentwurf aus dem Richtlinientext erzeugt – anpassen und speichern.', 'success');
}

/** XML-Attribut-/Text-Escaping (für generiertes BPMN). */
function _xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Prozess-Entwurf aus Freitext (Texterkennung) ── */

/** Label säubern/kürzen. */
function _clipLabel(s, fallback) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!s) return fallback || '';
  return s.length > 58 ? s.slice(0, 56) + '…' : s;
}

/**
 * Freitext → Prozessschritte. Bevorzugt nummerierte/aufgezählte Zeilen; sonst
 * Absätze. Pfeile (→, ->, ⇒) trennen mehrere Schritte einer Zeile. Erkennt
 * Entscheidungen (Frage/„konform?"/„genehmigt?" …) und Rollen-Präfixe („IT: …").
 * @returns [{ kind:'task'|'decision', label, role }]
 */
function _parseSteps(text) {
  const raw = String(text || '').replace(/\r/g, '');
  const lines = [];
  raw.split(/\n+/).forEach(line => {
    line = line.trim();
    if (!line) return;
    line.split(/\s*(?:→|->|⇒|=>|➔|▶)\s*/).forEach(part => { part = part.trim(); if (part) lines.push(part); });
  });
  const bulletRe = /^(\d+[.)]|[-–•*‣◦])\s+/;
  const hasBullets = lines.some(l => bulletRe.test(l));
  let cand = hasBullets ? lines.filter(l => bulletRe.test(l)) : lines;
  cand = cand.map(l => l.replace(bulletRe, '').trim()).filter(l => l.length >= 3);

  const decWord = /\b(konform|genehmigt|freigegeben|geprüft|zulässig|erforderlich|notwendig|möglich|vorhanden|erfüllt|bestanden|ok)\b/i;
  const steps = [];
  for (let l of cand) {
    if (steps.length >= 16) break;
    let role = '';
    const m = l.match(/^([A-Za-zÄÖÜäöüß./&-]{2,28}?):\s+(.+)$/);
    if (m && m[2] && m[2].length >= 2 && !/\d/.test(m[1])) { role = m[1].trim(); l = m[2].trim(); }
    const isDecision = (/\?\s*$/.test(l) || (decWord.test(l) && l.length < 70));
    steps.push({ kind: isDecision ? 'decision' : 'task', label: l, role });
  }
  return steps;
}

/**
 * Standards-konformes BPMN 2.0 aus Freitext bauen (Aufgaben + Entscheidungs-
 * Gateways mit ja/nein-Zweig, inkl. DI-Layout). @returns { name, xml, policyIds }
 */
function _bpmnFromText(text, name, policyIds) {
  let steps = _parseSteps(text);
  if (!steps.length) steps = [
    { kind: 'task', label: 'Richtlinie anwenden/prüfen', role: '' },
    { kind: 'decision', label: 'Konform?', role: '' },
  ];
  policyIds = (policyIds || []).map(String);

  const shapes = [];          // { id, type, name, x, y, w, h }
  const flows = [];           // { id, src, tgt, name }
  const inc = {}, out = {};
  let fc = 0;
  const addFlow = (src, tgt, nm) => {
    const id = 'F_' + (++fc);
    flows.push({ id, src, tgt, name: nm || '' });
    (out[src] = out[src] || []).push(id);
    (inc[tgt] = inc[tgt] || []).push(id);
  };

  const MY = 200;             // Haupt-Mittellinie (y)
  let x = 150;
  shapes.push({ id: 'Start', type: 'startEvent', name: 'Auslöser', x: x, y: MY - 18, w: 36, h: 36 });
  let prev = 'Start', prevGw = false;
  x += 36 + 60;

  steps.forEach((s, i) => {
    if (s.kind === 'decision') {
      const gid = 'Gw' + i;
      shapes.push({ id: gid, type: 'exclusiveGateway', name: _clipLabel(s.label, 'Entscheidung?'), x: x, y: MY - 25, w: 50, h: 50 });
      addFlow(prev, gid, prevGw ? 'ja' : '');
      // Nein-Zweig nach unten
      const cxGw = x + 25;
      const rid = 'Rej' + i, reid = 'RejEnd' + i, by = MY + 130;
      shapes.push({ id: rid, type: 'task', name: 'Abweichung behandeln', x: cxGw - 60, y: by, w: 120, h: 80 });
      shapes.push({ id: reid, type: 'endEvent', name: 'Nachbessern', x: cxGw - 60 + 120 + 40, y: by + 22, w: 36, h: 36 });
      addFlow(gid, rid, 'nein');
      addFlow(rid, reid, '');
      prev = gid; prevGw = true;
      x += 50 + 120;
    } else {
      const tid = 'T' + i;
      const label = _clipLabel(s.role ? (s.role + ': ' + s.label) : s.label, 'Schritt');
      shapes.push({ id: tid, type: 'task', name: label, x: x, y: MY - 40, w: 150, h: 80 });
      addFlow(prev, tid, prevGw ? 'ja' : '');
      prev = tid; prevGw = false;
      x += 150 + 60;
    }
  });
  shapes.push({ id: 'End', type: 'endEvent', name: 'Abgeschlossen', x: x, y: MY - 18, w: 36, h: 36 });
  addFlow(prev, 'End', prevGw ? 'ja' : '');

  // Prozess-Dokumentation mit Richtlinien-Marker
  const names = policyIds.map(id => {
    const p = (State.policies || []).find(x2 => String(x2.id) === id);
    return p ? p.title : ('Richtlinie ' + id);
  });
  const docText = (names.length ? ('Im Einklang mit den Richtlinien: ' + names.join('; ') + '\n') : '')
    + (policyIds.length ? `[[rms:policies=${policyIds.join(',')}]]` : '');

  // Prozess-Kinder serialisieren (mit incoming/outgoing – für bpmn-js nötig)
  const byId = {}; shapes.forEach(sh => byId[sh.id] = sh);
  const children = [];
  if (docText) children.push(`    <bpmn:documentation>${_xmlEsc(docText)}</bpmn:documentation>`);
  shapes.forEach(sh => {
    const incs = (inc[sh.id] || []).map(f => `<bpmn:incoming>${f}</bpmn:incoming>`).join('');
    const outs = (out[sh.id] || []).map(f => `<bpmn:outgoing>${f}</bpmn:outgoing>`).join('');
    children.push(`    <bpmn:${sh.type} id="${sh.id}" name="${_xmlEsc(sh.name)}">${incs}${outs}</bpmn:${sh.type}>`);
  });
  flows.forEach(f => children.push(
    `    <bpmn:sequenceFlow id="${f.id}"${f.name ? ` name="${_xmlEsc(f.name)}"` : ''} sourceRef="${f.src}" targetRef="${f.tgt}" />`));

  // DI (Shapes + Edges)
  const cy = sh => sh.y + sh.h / 2, cx = sh => sh.x + sh.w / 2;
  const di = [];
  shapes.forEach(sh => {
    const marker = sh.type === 'exclusiveGateway' ? ' isMarkerVisible="true"' : '';
    const label = sh.type !== 'task'
      ? `<bpmndi:BPMNLabel><dc:Bounds x="${sh.x - 12}" y="${sh.y + sh.h + 3}" width="${sh.w + 60}" height="14" /></bpmndi:BPMNLabel>` : '';
    di.push(`      <bpmndi:BPMNShape id="${sh.id}_di" bpmnElement="${sh.id}"${marker}><dc:Bounds x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}" />${label}</bpmndi:BPMNShape>`);
  });
  flows.forEach(f => {
    const s = byId[f.src], t = byId[f.tgt];
    let wps;
    if (s.type === 'exclusiveGateway' && t.y > s.y + 60) {
      // Nein-Zweig: Gateway-Unterkante senkrecht in die Aufgaben-Oberkante (mittig)
      wps = [[cx(s), s.y + s.h], [cx(s), t.y]];
    } else {
      wps = [[s.x + s.w, cy(s)], [t.x, cy(t)]];
    }
    di.push(`      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">${wps.map(w => `<di:waypoint x="${Math.round(w[0])}" y="${Math.round(w[1])}" />`).join('')}</bpmndi:BPMNEdge>`);
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
${children.join('\n')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dia_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
${di.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
  return { name: name || 'Prozess', xml, policyIds };
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _parseSteps, _bpmnFromText, _clipLabel };
}
