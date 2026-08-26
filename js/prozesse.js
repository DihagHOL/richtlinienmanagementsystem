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
const PROC_LINK_SPEICHER = 'rms_proc_links';   // derselbe Cache, aber über die Sitzung hinaus
const PROC_LINK_MAX = 400;                     // mehr Modelle wird es auf Jahre nicht geben

/**
 * Verknüpfungen aus dem lokalen Speicher übernehmen. Sie stecken im BPMN-XML,
 * das dafür Datei für Datei gelesen werden muss – ohne diesen Cache zahlt jede
 * Sitzung den Preis erneut. Schlüssel ist die Kennung samt Änderungsstempel:
 * eine geänderte Datei fällt damit automatisch aus dem Cache.
 */
function procLinksLaden() {
  try {
    const roh = localStorage.getItem(PROC_LINK_SPEICHER);
    if (roh) Object.assign(_procLinkCache, JSON.parse(roh) || {});
  } catch (e) { /* gesperrt oder defekt – dann eben ohne */ }
}

function procLinksMerken(key, ids) {
  _procLinkCache[key] = ids;
  try {
    const keys = Object.keys(_procLinkCache);
    const knapp = {};
    keys.slice(-PROC_LINK_MAX).forEach(k => { knapp[k] = _procLinkCache[k]; });
    localStorage.setItem(PROC_LINK_SPEICHER, JSON.stringify(knapp));
  } catch (e) { /* Speicher voll oder gesperrt – der Cache lebt dann nur im Tab */ }
}

const PROC_POLICY_MARKER = /\[\[rms:policies=([^\]]*)\]\]/;

/* ── Hinterlegte Dokumente ──
   Ein Modell zeigt den Ablauf, aber nicht das Beiwerk: Merkblatt, Formular,
   Kundeninformation. Diese Verweise stehen – wie die Richtlinien – im BPMN
   selbst. Wer die Datei exportiert oder in ein anderes Werk verschiebt, nimmt
   sie mit; eine zusätzliche SharePoint-Liste braucht es dafür nicht.
   Format je Dokument: [[rms:doc=Name|Adresse|Bibliothek|Kennung]] */
const PROC_DOC_MARKER = /\[\[rms:doc=([^\]]*)\]\]/g;
let _procDocs = [];             // Anlagen des gerade offenen Modells

/** Ein Feld für den Marker tauglich machen: Trenner und Klammern raus. */
function _docFeld(s) { return String(s == null ? '' : s).replace(/[|\[\]\r\n]/g, ' ').trim(); }

/** Gegenstück zu _xmlEsc – im gespeicherten XML stehen die Entitäten. */
function _xmlUnesc(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');   // zuletzt, sonst entstehen aus &amp;lt; spitze Klammern
}

/** Die Anlagen eines Modells aus seinem BPMN-XML lesen. */
function _parseProcessDocs(xml) {
  const re = new RegExp(PROC_DOC_MARKER.source, 'g');
  const out = [];
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const t = _xmlUnesc(m[1]).split('|').map(x => (x || '').trim());
    if (t[0] || t[1]) out.push({ name: t[0] || 'Dokument', url: t[1] || '', driveId: t[2] || '', itemId: t[3] || '' });
  }
  return out;
}

function _procDocMarker(d) {
  return `[[rms:doc=${_docFeld(d.name)}|${_docFeld(d.url)}|${_docFeld(d.driveId)}|${_docFeld(d.itemId)}]]`;
}

/**
 * Der Text, der Verknüpfungen und Anlagen im Modell festhält: erst im Klartext
 * (damit auch ein fremder Modeler sie zeigt), dann als Marker.
 */
function _procDokuText(ids, docs) {
  ids = (ids || []).map(String);
  docs = (docs || []).filter(d => d && (d.name || d.url));
  const zeilen = [];
  if (ids.length) {
    const pols = (typeof State !== 'undefined' && State.policies) || [];
    const namen = ids.map(id => {
      const pol = pols.find(x => String(x.id) === String(id));
      return pol ? pol.title : ('Richtlinie ' + id);
    });
    zeilen.push(`Im Einklang mit den Richtlinien: ${namen.join('; ')}`);
    zeilen.push(`[[rms:policies=${ids.join(',')}]]`);
  }
  if (docs.length) {
    zeilen.push(`Hinterlegte Dokumente: ${docs.map(d => _docFeld(d.name)).join('; ')}`);
    docs.forEach(d => zeilen.push(_procDocMarker(d)));
  }
  return zeilen.join('\n');
}

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

/* Zwei Sichten auf dieselben Prozesse: die Landkarte zeigt die Landschaft,
   die Liste die Modelle. Beide brauchen dieselbe Prozessliste – deshalb ein
   Reiter mit Umschalter statt zweier Reiter. */
let _prozModus = 'karte';   // 'karte' | 'netz' | 'matrix' | 'liste'

/** Umschalter, den beide Ansichten oben einblenden. */
function prozessModusLeiste(aktiv) {
  const knopf = (key, label, titel) => `<button class="btn btn-sm ${aktiv === key ? 'btn-primary' : 'btn-ghost'}"
      onclick="setProzessModus('${key}')" title="${titel}">${label}</button>`;
  return `<div style="display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap">
      ${knopf('karte', '🗺 Landkarte', 'Prozesslandschaft mit Geltungsbereich und Modell')}
      ${knopf('netz', '🕸 Verknüpfungen', 'Wer hängt woran – Prozesse, Modelle, Regelwerke, Standorte')}
      ${knopf('matrix', '👤 Matrix', 'Wer ist für welchen Prozess zuständig – und wo fehlt noch etwas')}
      ${knopf('liste', '📋 Modelle', 'Alle BPMN-Modelle als Liste')}
    </div>`;
}

function setProzessModus(m) {
  _prozModus = ['liste', 'netz', 'matrix', 'karte'].includes(m) ? m : 'karte';
  renderProzesseAktuell();
}

/** Die gerade gewählte Ansicht zeichnen. */
function renderProzesseAktuell() {
  if (_prozModus === 'karte' && typeof initLandkarte === 'function') { initLandkarte(); return; }
  if (_prozModus === 'netz' && typeof initVerknuepfungen === 'function') { initVerknuepfungen(); return; }
  if (_prozModus === 'matrix' && typeof initProzessMatrix === 'function') { initProzessMatrix(); return; }
  renderProzesseList();
}

async function initProzesse() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  _destroyModeler();   // evtl. offenen Editor beenden → zurück zur Liste
  if (_processes) renderProzesseAktuell();
  else mount.innerHTML = '<div class="doc-loading">Lade Prozesse …</div>';
  procLinksLaden();
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
  renderProzesseAktuell();
}

async function refreshProzesse() { _processes = null; _procLinkCache = {}; await initProzesse(); }

function renderProzesseList() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('prozesse');
  mount.innerHTML = `
    ${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('liste') : ''}
    <div class="view-desc" style="margin:0 0 12px">
      Prozesse (BPMN 2.0) im Camunda-Stil selbst modellieren und mit Richtlinien verknüpfen –
      „<b>im Einklang mit den Richtlinien</b>". Gespeichert als <b>.bpmn</b> im Ordner „Prozesse" der ISMS-Bibliothek – je Werk ein Unterordner.
    </div>
    <div class="view-toolbar">
      <div class="search-box">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input type="text" id="search-proc" placeholder="Prozess suchen …" oninput="_renderProcCards()">
      </div>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-sm btn-ghost" onclick="refreshProzesse()" title="Aktualisieren">↻ Aktualisieren</button>
      ${canWrite && (_processes || []).some(p => !(p.ordner || '')) ? `<button class="btn btn-outline btn-sm" onclick="prozessAblageAufraeumen()" title="Modelle, die noch direkt im Prozesse-Ordner liegen, in den Ordner ihres Werks verschieben">🗂 Ablage aufräumen</button>` : ''}
      ${canWrite ? `<button class="btn btn-outline btn-sm" onclick="seedStandardProcesses()" title="Alle ${RMS_PROCESS_SEEDS.length} dokumentierten RMS-Abläufe (Regelwerk-Lebenszyklus & -Allgemein, Konzept, Kenntnisnahme, Änderungsvorschlag, Risiko, KI-Antrag, Health-Check, Abdeckung/SoA, Fälligkeit, Governance-Übernahme, Audit-Report, Archivierung) als BPMN-Entwürfe anlegen – überspringt bereits vorhandene">📋 Standard-Prozesse</button>` : ''}
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
  const karte = (p) => `
    <div class="item-card" style="cursor:pointer" onclick="openProcessEditor('${esc(p.itemId)}')">
      <div class="ic-top"><div class="ic-title">🔀 ${esc(p.title)}</div></div>
      <div class="ic-tags"><span class="ic-tag">.bpmn</span>${p.modifiedBy ? `<span class="ic-tag">${esc(p.modifiedBy)}</span>` : ''}${p.modified ? `<span class="ic-tag">${esc(fmtDate(p.modified))}</span>` : ''}</div>
      <div id="proc-link-${esc(p.itemId)}" style="margin-top:8px;font-size:.8rem;color:var(--c-muted)">…</div>
    </div>`;
  // Nach Werk gruppiert – ein Prozess gehört zu dem Werk, dessen Landkarte ihn führt.
  host.innerHTML = _procGruppen(rows).map(g => `
    <div style="margin-bottom:18px">
      <div style="font-weight:700;font-size:.9rem;color:var(--c-navy,#1A2644);margin:0 0 8px;display:flex;align-items:center;gap:8px">
        <span>${g.key ? '🏭' : '📄'} ${esc(g.titel)}</span>
        <span class="field-hint" style="font-weight:500">${g.rows.length} Modell${g.rows.length === 1 ? '' : 'e'}</span>
      </div>
      <div class="item-cards">${g.rows.map(karte).join('')}</div>
    </div>`).join('');
  // Verknüpfte Richtlinien pro Karte (aus dem BPMN-XML) – progressiv, mit Cache.
  rows.forEach(p => {
    const key = p.itemId + '|' + p.modified;
    const e = _procLinkCache[key];
    // Alte Cache-Einträge waren eine reine Id-Liste – die dürfen nicht
    // durchfallen, sonst liest die App beim ersten Start alles neu.
    if (e) _renderCardLink(p.itemId, Array.isArray(e) ? e : e.p, Array.isArray(e) ? 0 : e.d);
    else _enrichProcessCard(p, key);
  });
}

/** Prozesse nach Werk gruppieren: erst die Werke in ihrer üblichen Reihenfolge,
 *  unbekannte Ordner danach, ganz zuletzt die Dateien ohne Werk. */
function _procGruppen(rows) {
  const werke = (typeof LK_WERKE !== 'undefined') ? LK_WERKE : [];
  const rang = (k) => { if (!k) return 9999; const i = werke.indexOf(k); return i < 0 ? 500 : i; };
  const label = (k) => k ? ((typeof lkWerkLabel === 'function') ? lkWerkLabel(k) : k) : 'Ohne Zuordnung';
  return [...new Set(rows.map(p => p.ordner || ''))]
    .sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, 'de'))
    .map(k => ({ key: k, titel: label(k), rows: rows.filter(p => (p.ordner || '') === k) }));
}

/**
 * Modelle, die noch direkt im Prozesse-Ordner liegen, in den Ordner ihres Werks
 * verschieben. Welches Werk gemeint ist, sagt die Landkarte: das Werk, dessen
 * Kachel auf das Modell zeigt. Zeigen Kacheln aus zwei Werken darauf, bleibt es
 * liegen – diese Entscheidung kann die App nicht treffen.
 */
async function prozessAblageAufraeumen() {
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  if (typeof lkDatenLaden === 'function') { try { await lkDatenLaden(); } catch (e) { /* Startbestand reicht */ } }
  const kacheln = (typeof lkAlleKacheln === 'function') ? lkAlleKacheln() : [];
  const offen = (_processes || []).filter(p => !(p.ordner || ''));
  const plan = [], mehrdeutig = [];
  offen.forEach(p => {
    const passt = (v) => v.id === p.itemId
      || (!!v.name && String(v.name).trim().toLowerCase() === String(p.title).trim().toLowerCase());
    const werke = [...new Set(kacheln
      .filter(x => ((typeof lkModellVerweise === 'function') ? lkModellVerweise(x.kachel) : []).some(passt))
      .map(x => x.werk))];
    if (werke.length === 1) plan.push({ p, werk: werke[0] });
    else if (werke.length > 1) mehrdeutig.push(p);
  });
  const rest = offen.length - plan.length;
  if (!plan.length) {
    toast(offen.length ? 'Kein Modell lässt sich eindeutig einem Werk zuordnen – bitte im Modell selbst wählen.' : 'Alle Modelle liegen bereits im Ordner ihres Werks.',
      plan.length ? 'success' : 'error');
    return;
  }
  const ok = await uiConfirm(
    `${plan.length} Modell(e) in den Ordner ihres Werks verschieben?<br><span class="field-hint">Die Kennung der Dateien bleibt erhalten – Landkarte, Mindmap und Regelwerks-Verknüpfungen überstehen den Umzug.${
      rest ? ` ${rest} weitere(s) bleibt liegen${mehrdeutig.length ? `, davon ${mehrdeutig.length} von mehreren Werken verknüpft` : ''}.` : ''}</span>`,
    { title: 'Ablage aufräumen', okLabel: `${plan.length} verschieben` });
  if (!ok) return;
  let done = 0, fail = 0;
  for (const e of plan) {
    try { await spMoveProcess(e.p.itemId, e.werk); done++; }
    catch (err) { console.warn('Umzug fehlgeschlagen:', e.p.title, err.message); fail++; }
  }
  await refreshProzesse();
  toast(`${done} Modell(e) einsortiert${fail ? `, ${fail} fehlgeschlagen` : ''} ✓`, fail ? 'error' : 'success');
}

async function _enrichProcessCard(p, key) {
  try {
    const xml = await spGetProcessXml(p.itemId);
    const ids = _parsePolicyIds(xml);
    const docs = _parseProcessDocs(xml).length;
    procLinksMerken(key, { p: ids, d: docs });
    _renderCardLink(p.itemId, ids, docs);
  } catch (e) {
    const el = document.getElementById('proc-link-' + p.itemId);
    if (el) el.textContent = '';
  }
}

function _renderCardLink(itemId, ids, docs) {
  const el = document.getElementById('proc-link-' + itemId);
  if (!el) return;
  const anlagen = docs ? `<span class="ic-tag" title="hinterlegte Dokumente">📎 ${docs}</span>` : '';
  if (!ids || !ids.length) {
    el.innerHTML = `<span style="color:var(--c-faint)">keine Richtlinie verknüpft</span> ${anlagen}`;
    return;
  }
  el.innerHTML = '🔗 ' + ids.map(id => {
    const pol = (State.policies || []).find(x => String(x.id) === String(id));
    return `<span class="ic-tag" style="background:#eef2ff;color:#3730a3">${esc(pol ? pol.title : 'Richtlinie ' + id)}</span>`;
  }).join(' ') + (anlagen ? ' ' + anlagen : '');
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
  _procEditing = { itemId: itemId || null, origName: proc ? proc.name : '',
    origWerk: proc ? (proc.ordner || '') : '' };
  const startName = proc ? proc.title : (seed && seed.name ? seed.name : '');
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('prozesse');

  mount.innerHTML = `
    <div class="view-toolbar">
      <button class="btn btn-sm btn-ghost" onclick="initProzesse()">← Zurück zur Liste</button>
      <div style="font-weight:700">${proc ? 'Prozess bearbeiten' : 'Neuer Prozess'}</div>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-outline btn-sm" onclick="downloadProcessXml()" title="BPMN-Datei herunterladen">⬇ .bpmn</button>
      <button class="btn btn-outline btn-sm" onclick="downloadProcessSvg()" title="Diagramm als Bild – lässt sich in Word, PowerPoint und Regelwerke einfügen">⬇ Bild</button>
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
        <div class="form-group full"><label>Ablage (Konzern / Gesellschaft)</label>
          <select id="proc-werk" ${canWrite ? '' : 'disabled'}>
            <option value=""${proc && proc.ordner ? '' : ' selected'}>— ohne Werk —</option>
            ${((typeof LK_WERKE !== 'undefined') ? LK_WERKE : []).map(w =>
              `<option value="${esc(w)}"${proc && proc.ordner === w ? ' selected' : ''}>${
                esc((typeof lkWerkLabel === 'function') ? lkWerkLabel(w) : w)}</option>`).join('')}
          </select>
          <span class="field-hint">Konzern und Gesellschaften führen je eine eigene Landkarte – die Modelle
            liegen im Ordner „Prozesse/&lt;Kürzel&gt;". Beim Wechsel wird die Datei verschoben, ihre Kennung bleibt.</span></div>
        <div class="form-group full"><label>Verknüpfte Richtlinien</label>
          <div id="proc-policy-list" style="max-height:230px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:8px"></div>
          <span class="field-hint">Welche Richtlinien dieser Prozess umsetzt. Wird in der BPMN-Datei gespeichert und im Prozess dokumentiert.</span></div>
        <div class="form-group full"><label>Hinterlegte Dokumente</label>
          <div id="proc-doc-list" style="border:1px solid var(--c-border);border-radius:8px;padding:8px"></div>
          ${canWrite ? `<div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn-outline btn-sm" onclick="document.getElementById('proc-doc-input').click()"
              title="Datei hochladen und an diesem Prozess hinterlegen">📎 Datei</button>
            <button class="btn btn-outline btn-sm" onclick="prozessDokLink()"
              title="Dokument verlinken, das bereits abgelegt ist">🔗 Link</button>
            <input type="file" id="proc-doc-input" style="display:none" onchange="prozessDokHochladen(this)">
          </div>` : ''}
          <span class="field-hint">Merkblatt, Formular, Kundeninformation – was zum Ablauf gehört, aber nicht ins Diagramm passt.
            Hochgeladene Dateien liegen in „Prozesse/&lt;Kürzel&gt;/Anlagen"; verknüpft wird ihre Kennung, nicht der Pfad.</span></div>
        <div id="proc-status" class="field-hint" style="margin-top:8px">Modeler wird geladen …</div>
      </div>
    </div>`;
  _procDocs = (seed && Array.isArray(seed.docs)) ? seed.docs.slice() : [];
  _renderPolicyPicker([], canWrite);
  _renderProcDocs(canWrite);

  try {
    await _ensureBpmnLib();
  } catch (e) {
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = `<span style="color:#b91c1c">${esc(e.message)}</span>`;
    return;
  }
  _destroyModeler();
  _bpmnModeler = new BpmnJS({ container: '#bpmn-canvas' });

  let xml = DEFAULT_BPMN, ids = [], unbrauchbar = false;
  if (itemId) {
    try { xml = await spGetProcessXml(itemId); ids = _parsePolicyIds(xml); _procDocs = _parseProcessDocs(xml); }
    catch (e) { toast('Prozess laden fehlgeschlagen: ' + e.message, 'error'); }
  } else if (seed && seed.xml) {
    xml = seed.xml;
    ids = (seed.policyIds && seed.policyIds.length) ? seed.policyIds : _parsePolicyIds(xml);
    if (!_procDocs.length) _procDocs = _parseProcessDocs(xml);
  }
  // Enthält die Datei kein BPMN, darf das keine Sackgasse sein: leeres Diagramm
  // laden, damit ein Speichern sie repariert. Die Kennung bleibt dabei – alle
  // Verweise aus Landkarte und Mindmap überstehen die Reparatur.
  if (!/<(bpmn:)?definitions[\s>]/i.test(String(xml || ''))) {
    unbrauchbar = true; xml = DEFAULT_BPMN; ids = []; _procDocs = [];
  }
  try {
    await _bpmnModeler.importXML(xml);
    _bpmnModeler.get('canvas').zoom('fit-viewport');
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = unbrauchbar
      ? `<span style="color:#b45309">Die Datei enthielt kein BPMN – ein leeres Diagramm wurde geladen.
         <b>Speichern</b> repariert sie; Kennung und Verknüpfungen bleiben erhalten.</span>`
      : ((proc || (seed && seed.xml)) ? '' : 'Neues Diagramm – ziehe Elemente aus der Palette links.');
  } catch (e) {
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = `<span style="color:#b91c1c">Diagramm konnte nicht geladen werden: ${esc(e.message)}</span>`;
  }
  _renderPolicyPicker(ids, canWrite);
  _renderProcDocs(canWrite);
}

/* ── Anlagen im Editor ── */

function _renderProcDocs(canWrite) {
  const host = document.getElementById('proc-doc-list');
  if (!host) return;
  if (!_procDocs.length) { host.innerHTML = '<span class="field-hint">Noch kein Dokument hinterlegt.</span>'; return; }
  host.innerHTML = _procDocs.map((d, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:.82rem">
      <span>📎</span>
      ${d.url
        ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</a>`
        : `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</span>`}
      ${canWrite ? `<button class="btn btn-ghost btn-sm" style="padding:0 6px"
        title="Verknüpfung entfernen – die Datei selbst bleibt in der Bibliothek"
        onclick="prozessDokEntfernen(${i})">×</button>` : ''}
    </div>`).join('');
}

/**
 * Eine Datei hochladen und am Prozess hinterlegen. Ist das Modell schon
 * gespeichert, wird die Verknüpfung gleich mitgeschrieben – sonst läge die
 * Datei zwar in der Bibliothek, aber niemand fände sie.
 */
async function prozessDokHochladen(input) {
  const file = input && input.files && input.files[0];
  if (input) input.value = '';
  if (!file) return;
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  if (file.size > 4 * 1024 * 1024) {
    toast('Die Datei ist größer als 4 MB – bitte in der Bibliothek ablegen und hier als „🔗 Link" hinterlegen.', 'error');
    return;
  }
  const st = document.getElementById('proc-status');
  if (st) st.textContent = `„${file.name}" wird hochgeladen …`;
  try {
    const werk = (document.getElementById('proc-werk') || {}).value || '';
    const bytes = await file.arrayBuffer();
    const d = await spUploadProcessDoc(werk, file.name, bytes, file.type || 'application/octet-stream');
    // Dieselbe Datei ein zweites Mal hochgeladen: ersetzen statt verdoppeln.
    _procDocs = _procDocs.filter(x => !x.itemId || String(x.itemId) !== String(d.itemId));
    _procDocs.push({ name: d.name, url: d.url, driveId: d.driveId, itemId: d.itemId });
    _renderProcDocs(true);
    if (st) st.textContent = '';
    if (_procEditing && _procEditing.itemId) await saveProcess();
    else toast('Dokument hinterlegt – es wird beim Speichern des Prozesses verknüpft.', 'success');
  } catch (e) {
    if (st) st.textContent = '';
    toast('Hochladen fehlgeschlagen: ' + e.message, 'error');
  }
}

/** Ein bereits abgelegtes Dokument nur verlinken (auch für Dateien über 4 MB). */
async function prozessDokLink() {
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const url = await uiPrompt('Adresse (URL) des Dokuments:', {
    title: 'Dokument verlinken', okLabel: 'Weiter', multiline: false,
    placeholder: 'https://dihag.sharepoint.com/…' });
  if (!url || !url.trim()) return;
  const vorschlag = decodeURIComponent(String(url).split(/[?#]/)[0].split('/').pop() || '').trim();
  const name = await uiPrompt('Anzeigename:', {
    title: 'Dokument verlinken', okLabel: 'Hinterlegen', multiline: false, value: vorschlag });
  if (name === null) return;
  _procDocs.push({ name: (name || vorschlag || 'Dokument').trim(), url: url.trim(), driveId: '', itemId: '' });
  _renderProcDocs(true);
  if (_procEditing && _procEditing.itemId) await saveProcess();
  else toast('Link hinterlegt – er wird beim Speichern des Prozesses verknüpft.', 'success');
}

/** Nur die Verknüpfung lösen. Die Datei zu löschen ist eine andere
 *  Entscheidung – sie kann anderswo gebraucht werden. */
async function prozessDokEntfernen(i) {
  const d = _procDocs[i];
  if (!d) return;
  if (!await uiConfirm(`„${esc(d.name)}" vom Prozess lösen?<br><span class="field-hint">Die Datei selbst bleibt in der Bibliothek liegen.</span>`,
    { title: 'Dokument lösen', okLabel: 'Lösen' })) return;
  _procDocs.splice(i, 1);
  _renderProcDocs(true);
  if (_procEditing && _procEditing.itemId) await saveProcess();
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

/** Richtlinien und Anlagen in die Prozess-Dokumentation schreiben (Klartext + Marker). */
function _setProcessDoku(ids, docs) {
  if (!_bpmnModeler) return;
  try {
    const root = _bpmnModeler.get('canvas').getRootElement();
    const bo = root && root.businessObject;
    if (!bo) return;
    const moddle = _bpmnModeler.get('moddle');
    const text = _procDokuText(ids, docs);
    if (!text) { bo.documentation = undefined; return; }
    bo.documentation = [moddle.create('bpmn:Documentation', { text })];
  } catch (e) { console.warn('Prozess-Dokumentation nicht gesetzt:', e.message); }
}

async function saveProcess() {
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const name = (document.getElementById('proc-name')?.value || '').trim();
  if (!name) { toast('Bitte einen Prozessnamen angeben.', 'error'); document.getElementById('proc-name')?.focus(); return; }
  if (!_bpmnModeler) return;
  const btn = document.getElementById('proc-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '💾 Speichern …'; }
  try {
    _setProcessDoku(_selectedPolicyIds(), _procDocs);
    const { xml } = await _bpmnModeler.saveXML({ format: true });
    const werk = (document.getElementById('proc-werk') || {}).value || '';
    const newFname = /\.bpmn$/i.test(name) ? name : name + '.bpmn';
    const alt = _procEditing || {};
    // Umbenennen oder in ein anderes Werk umziehen: erst die Datei selbst
    // verschieben – so behält sie ihre Kennung und alle Verknüpfungen aus
    // Landkarte und Mindmap überleben. (Ein Speichern unter neuem Namen würde
    // eine zweite Datei anlegen und die Verweise ins Leere laufen lassen.)
    if (alt.itemId && ((alt.origName && alt.origName !== newFname) || (alt.origWerk || '') !== werk)) {
      await spMoveProcess(alt.itemId, werk, newFname);
    }
    const saved = await spSaveProcess(name, xml, werk);
    _processes = null; _procLinkCache = {};   // Liste neu laden, wenn man zurückgeht
    _procEditing = { itemId: (saved && saved.id) || alt.itemId, origName: newFname, origWerk: werk };
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
    _setProcessDoku(_selectedPolicyIds(), _procDocs);
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

/**
 * Das Diagramm als Bild (SVG) herunterladen. Wer den Ablauf in ein Regelwerk,
 * eine Schulung oder eine Folie packen will, braucht ein Bild – mit einer
 * .bpmn-Datei kann außerhalb des Modelers niemand etwas anfangen. SVG bleibt
 * dabei scharf und lässt sich in Word und PowerPoint direkt einfügen.
 */
async function downloadProcessSvg() {
  if (!_bpmnModeler) return;
  try {
    const { svg } = await _bpmnModeler.saveSVG();
    const name = (document.getElementById('proc-name')?.value || 'prozess').trim() || 'prozess';
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name.replace(/\.bpmn$/i, '') + '.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Bild gespeichert ✓', 'success');
  } catch (e) { toast('Bild-Export fehlgeschlagen: ' + e.message, 'error'); }
}

async function deleteProcess() {
  if (!_procEditing || !_procEditing.itemId) return;
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const nm = (document.getElementById('proc-name')?.value || 'diesen Prozess').trim();
  if (!await uiConfirm(`Prozess „${nm}" wirklich löschen?`, { title: 'Prozess löschen', okLabel: 'Löschen', danger: true })) return;
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
    // „…? | nein: Text" benennt den Nein-Zweig. Ohne die Angabe endet jede
    // Entscheidung in „Abweichung behandeln" – bei einer Frage wie „Kann der
    // Kunde betroffen sein?" ist das schlicht falsch.
    let nein = '';
    const nm2 = l.match(/\|\s*nein\s*:\s*(.+)$/i);
    if (nm2) { nein = nm2[1].trim(); l = l.slice(0, nm2.index).trim(); }
    const isDecision = (/\?\s*$/.test(l) || (decWord.test(l) && l.length < 70));
    steps.push({ kind: isDecision ? 'decision' : 'task', label: l, role, nein });
  }
  return steps;
}

/**
 * Standards-konformes BPMN 2.0 aus Freitext bauen (Aufgaben + Entscheidungs-
 * Gateways mit ja/nein-Zweig, inkl. DI-Layout). @returns { name, xml, policyIds }
 */
function _bpmnFromText(text, name, policyIds, docs) {
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
      shapes.push({ id: rid, type: 'task', name: _clipLabel(s.nein, '') || 'Abweichung behandeln', x: cxGw - 60, y: by, w: 120, h: 80 });
      shapes.push({ id: reid, type: 'endEvent', name: s.nein ? 'Beendet' : 'Nachbessern', x: cxGw - 60 + 120 + 40, y: by + 22, w: 36, h: 36 });
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

  // Prozess-Dokumentation mit Richtlinien- und Anlagen-Markern
  const docText = _procDokuText(policyIds, docs);

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
  return { name: name || 'Prozess', xml, policyIds, docs: (docs || []) };
}

/* ── Standard-Prozesse aus den dokumentierten RMS-Abläufen ──
   Jeder Seed ist ein nummerierter Ablauf; „…?"/Schlüsselwörter werden zu
   Entscheidungs-Gateways. Wird per Button als BPMN-Entwurf angelegt und ist
   danach im Modeler frei anpassbar. */
const RMS_PROCESS_SEEDS = [
  { name: 'Regelwerk-Lebenszyklus (RMS)', steps: `
1. Regelwerk-Entwurf erstellen
2. Dokument zuordnen
3. Zur Konformitätsprüfung einreichen
4. Konform?
5. Mitbestimmung (Betriebsverfassung) einholen
6. Freigabe durch die Geschäftsleitung
7. Freigegeben?
8. Regelwerk veröffentlichen
9. Wiedervorlage/Review terminieren` },
  { name: 'Regelwerk-Konzept (RMS)', steps: `
1. Konzept (Idee/Skizze) erfassen
2. Optionalen Entwurf als Anhang hinterlegen
3. Zur Prüfung an die Geschäftsleitung einreichen
4. Vom GF angenommen?
5. Regelwerk-Entwurf aus dem Konzept erstellen
6. In den Regelwerk-Lebenszyklus überführen` },
  { name: 'Kenntnisnahme & Wissenstest (RMS)', steps: `
1. Mitarbeiter: Veröffentlichtes Regelwerk lesen
2. Kenntnisnahme bestätigen
3. Wissenstest erforderlich?
4. Wissenstest absolvieren
5. Bestanden?
6. Nachweis dokumentiert
7. Wiederholung fällig?` },
  { name: 'Änderungsvorschlag ISMS-Dokument (RMS)', steps: `
1. Mitarbeiter: Änderungsvorschlag erfassen
2. Mail an die ISMS-Verantwortlichen
3. ISMS-Team: Vorschlag prüfen
4. Umsetzen?
5. Dokument aktualisieren (neue Version)
6. Rückmeldung an den Einreicher` },
  { name: 'Risiko-Management (RMS)', steps: `
1. Risiko erfassen
2. Schutzziele (CIA) und Assets zuordnen
3. Eintritt und Auswirkung bewerten
4. Maßnahmen erforderlich?
5. Maßnahmen festlegen und umsetzen
6. Restrisiko bewerten
7. Zur Wiedervorlage terminieren` },
  { name: 'KI-System beantragen (RMS)', steps: `
1. Mitarbeiter: KI-System-Antrag erfassen
2. Risikoklasse einschätzen
3. Antrag einreichen
4. KI-Gremium: Antrag prüfen
5. Genehmigt?
6. KI-System freigeben und dokumentieren` },
  { name: 'Dokument-Health-Check (RMS)', steps: `
1. Dokumente-Prüfung starten
2. Befunde sichten (Dubletten, Platzhalter, leere Kapitel)
3. Handlungsbedarf?
4. Dokument korrigieren (neue Version)
5. Prüfung wiederholen
6. Dokumente in Ordnung` },
  { name: 'ISMS-Abdeckung & SoA (RMS)', steps: `
1. ISO-27001-Controls sichten
2. Abdeckung je Control bewerten
3. Lücke vorhanden?
4. Regelwerk/Maßnahme zuordnen
5. Statement of Applicability (SoA) aktualisieren
6. Abdeckung dokumentiert` },
  { name: 'Fälligkeit / Wiedervorlage (RMS)', steps: `
1. Wiedervorlage-Termine überwachen
2. Review fällig?
3. Regelwerk inhaltlich prüfen
4. Aktualisierung nötig?
5. Regelwerk aktualisieren (neue Version)
6. Nächsten Review-Termin setzen` },
  { name: 'Governance-Übernahme (RMS)', steps: `
1. Legal: Entwurf im Governance-Board bearbeiten
2. Entwurf finalisiert?
3. Als Regelwerk übernehmen
4. Zur Prüfung einreichen
5. In den Regelwerk-Lebenszyklus überführen` },
  { name: 'Audit-Report / C-Level (RMS)', steps: `
1. Kennzahlen und Reifegrad zusammenstellen
2. ISO-27001-Abgleich durchführen
3. C-Level-Bericht erstellen
4. Freigeben und versenden?
5. Bericht per Mail an die Geschäftsleitung senden
6. Bericht archiviert` },
  { name: 'Regelwerk – Allgemein (RMS)', steps: `
1. Bedarf für ein Regelwerk feststellen
2. Verantwortlichen (Owner) benennen
3. Regelwerk erstellen
4. Fachlich prüfen
5. Prüfung bestanden?
6. Freigeben
7. Veröffentlichen und kommunizieren
8. Regelmäßig überprüfen` },
  { name: 'Regelwerk außer Kraft setzen / Archivierung (RMS)', steps: `
1. Ablösung oder Wegfall feststellen
2. Nachfolge-Regelwerk vorhanden?
3. Nachfolge-Regelwerk verlinken
4. Außerkraftsetzung freigeben lassen
5. Regelwerk archivieren
6. Betroffene informieren` },
];

/** Die dokumentierten RMS-Abläufe als BPMN-Entwürfe anlegen (überspringt bereits vorhandene). */
async function seedStandardProcesses() {
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const norm = (s) => String(s || '').toLowerCase().replace(/\.bpmn$/, '').trim();
  const existing = new Set((_processes || []).map(p => norm(p.title)));
  const todo = RMS_PROCESS_SEEDS.filter(s => !existing.has(norm(s.name)));
  const skip = RMS_PROCESS_SEEDS.length - todo.length;
  if (!todo.length) { toast('Alle Standard-Prozesse sind bereits angelegt.', 'success'); return; }
  const ok = await uiConfirm(
    `${todo.length} Standard-Prozess(e) aus den dokumentierten RMS-Abläufen als BPMN-Entwurf anlegen${skip ? ` (${skip} bereits vorhanden, werden übersprungen)` : ''}? Danach im Modeler frei anpassbar.`,
    { title: 'Standard-Prozesse anlegen', okLabel: `${todo.length} anlegen` });
  if (!ok) return;
  let done = 0, fail = 0;
  for (const s of todo) {
    try {
      const { xml } = _bpmnFromText(s.steps, s.name, []);
      await spSaveProcess(s.name, xml);
      done++;
    } catch (e) { console.warn('Standard-Prozess fehlgeschlagen:', s.name, e.message); fail++; }
  }
  _processes = null; _procLinkCache = {};
  await initProzesse();
  toast(`${done} Standard-Prozess(e) angelegt${fail ? `, ${fail} fehlgeschlagen` : ''} ✓`, fail ? 'error' : 'success');
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _parseSteps, _bpmnFromText, _clipLabel, RMS_PROCESS_SEEDS,
    _parseProcessDocs, _procDokuText, _procDocMarker, _docFeld, _xmlUnesc };
}
