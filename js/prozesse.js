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
let _procDirty = false;         // seit dem letzten Speichern (oder Öffnen) am Diagramm geändert?
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

/** Nachschlagen im Cache; die Form macht procLinkEintrag() (js/util.js). */
function procLinksVon(key) { return procLinkEintrag(_procLinkCache[key]); }

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
  _procAnsicht = false;
  _procPfad = [];      // der Weg durch die Unterprozesse endet mit der Liste
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
    <div class="item-card" style="cursor:pointer" onclick="openProcessAnsicht('${esc(p.itemId)}')" title="Ansehen: Diagramm, Schritte und Befunde">
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
    const e = procLinksVon(key);
    // Nur ein vollständiger Eintrag darf den erneuten Griff zur Datei sparen.
    // Ältere Stände kannten weder Anlagen noch Unterprozesse – die werden einmal
    // nachgelesen, sonst bliebe die Warnung bei genau den Modellen aus, die
    // gerade im Cache liegen.
    if (e && !e.alt) _renderCardLink(p.itemId, e);
  });
  // Was fehlt, wird gelesen – fünf Dateien nebeneinander, nicht alle auf einmal:
  // Bei vierzig Modellen drosselt SharePoint sonst, und die ersten Karten
  // sollen nicht auf die letzte warten. Jede Karte zieht nach, sobald ihr
  // Eintrag da ist.
  procEintraegeLaden(rows, (p, e) => {
    if (e) _renderCardLink(p.itemId, e);
    else { const el = document.getElementById('proc-link-' + p.itemId); if (el) el.textContent = ''; }
  }).catch(() => {});
}

/** Prozesse nach Werk gruppieren: erst die Werke in ihrer üblichen Reihenfolge,
 *  unbekannte Ordner danach, ganz zuletzt die Dateien ohne Werk. */
function _procGruppen(rows) {
  const werke = (typeof lkWerkeSichtbar === 'function') ? lkWerkeSichtbar()
    : ((typeof LK_WERKE !== 'undefined') ? LK_WERKE : []);
  // Bei aktiver Trennung nach Gesellschaft bleiben die Modelle fremder Werke
  // draußen. „Ohne Zuordnung" bleibt sichtbar: Diese Dateien gehören noch
  // niemandem, und wer sie versteckt, sorgt dafür, dass sie nie einsortiert werden.
  if (typeof trennungGreift === 'function' && trennungGreift()) {
    rows = rows.filter(p => !p.ordner || werke.includes(p.ordner));
  }
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

/** Die Zeile unter einer Karte: Richtlinien, Anlagen, Unterprozesse – aus dem Cache-Eintrag. */
function _renderCardLink(itemId, e) {
  const el = document.getElementById('proc-link-' + itemId);
  if (!el) return;
  const ids = e.p, docs = e.d, kaputt = e.k;
  const anlagen = docs ? `<span class="ic-tag" title="hinterlegte Dokumente">📎 ${docs}</span>` : '';
  // ⊞ n: bindet n Modelle ein · ↰ n: ist in n Modellen eingebunden – wer das
  // Modell ändert, ändert es dort mit.
  const unter = (e.u || []).length
    ? `<span class="ic-tag" style="background:#e6eef8;color:#1A2644" title="bindet ${e.u.length} Unterprozess${e.u.length > 1 ? 'e' : ''} ein">⊞ ${e.u.length}</span>` : '';
  const oben = procEingebundenIn(itemId);
  const drin = oben.length
    ? `<span class="ic-tag" style="background:#e6eef8;color:#1A2644" title="eingebunden in: ${esc(oben.map(p => p.title).join(', '))}">↰ ${oben.length}</span>` : '';
  const extra = [anlagen, unter, drin].filter(Boolean).join(' ');
  if (kaputt) {
    el.innerHTML = `<span class="ic-tag" style="background:#fef3c7;color:#92400e"
      title="Die Datei enthält kein Diagramm. Öffnen und speichern repariert sie – die Verknüpfungen bleiben.">⚠ kein Diagramm – öffnen und speichern</span> ${extra}`;
    return;
  }
  if (!ids || !ids.length) {
    el.innerHTML = `<span style="color:var(--c-faint)">keine Richtlinie verknüpft</span> ${extra}`;
    return;
  }
  el.innerHTML = '🔗 ' + ids.map(id => {
    const pol = policyZuId(id);
    return `<span class="ic-tag" style="background:#eef2ff;color:#3730a3">${esc(pol ? pol.title : 'Richtlinie ' + id)}</span>`;
  }).join(' ') + (extra ? ' ' + extra : '');
}

function _parsePolicyIds(xml) {
  const m = String(xml || '').match(PROC_POLICY_MARKER);
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}

/**
 * Der Cache-Eintrag eines Modells aus seinem XML – die eine Stelle, die die
 * Form bestimmt (Prozessliste, Mindmap und Editor lesen alle hierüber).
 * @returns {{p:string[], d:number, k:boolean, i:string, u:string[]}}
 */
function procEintragAusXml(xml) {
  const s = String(xml || '');
  return {
    p: _parsePolicyIds(s),
    d: _parseProcessDocs(s).length,
    k: !/<(bpmn:)?definitions[\s>]/i.test(s),
    i: procKennungAusXml(s),
    u: procUnterAusXml(s),
  };
}

/* ═══════════════════════════════════════════════════
   Übergänge auf Element-Ebene
   ═══════════════════════════════════════════════════
   Ein Verweis an der Landkarten-Kachel sagt „nach dem Vertrieb kommt die
   Fertigung". Er sagt nicht, an welcher Stelle. Genau das steht im Modell: an
   der Aufgabe, mit der der Ablauf das Haus verlässt.

   Der Marker liegt deshalb in der Dokumentation des Elements – wie die
   Richtlinien in der des Prozesses. Er wandert mit der Datei, übersteht Export
   und Umzug in ein anderes Werk und braucht keine zusätzliche Liste.
   Format: [[rms:prozess=WERK:KACHEL]] */
const PROC_KACHEL_MARKER = /\[\[rms:prozess=([^\]]*)\]\]/;
const PROC_SPRUNG_TYP = 'rms-sprung';       // Overlay-Kennung im Modeler
const PROC_SPRUNG_TEXTZEILE = 'Weiter im Prozess: ';

/** Dokumentationstext eines Elements (BPMN erlaubt mehrere – wir führen eine). */
function _elemDokuText(el) {
  const d = el && el.businessObject && el.businessObject.documentation;
  return (Array.isArray(d) && d.length && d[0].text) ? String(d[0].text) : '';
}

/** Das Sprungziel eines Elements ('' = keins). */
function procElementZiel(el) {
  const m = String(_elemDokuText(el)).match(PROC_KACHEL_MARKER);
  return m ? m[1].trim() : '';
}

/** Ein Element, das der Nutzer meint: bei einem Textfeld das beschriftete Element. */
function _procGemeint(el) { return (el && el.labelTarget) ? el.labelTarget : el; }

/**
 * Ziel setzen oder lösen. Die übrige Dokumentation bleibt stehen – dort steht
 * womöglich der Text, der die Aufgabe erklärt.
 */
function procElementZielSetzen(el, ziel) {
  if (!_bpmnModeler || !el || !el.businessObject) return false;
  const behalten = _elemDokuText(el).split('\n')
    .filter(z => !PROC_KACHEL_MARKER.test(z) && z.indexOf(PROC_SPRUNG_TEXTZEILE) !== 0);
  if (ziel) {
    const treffer = (typeof lkKachelVonZiel === 'function') ? lkKachelVonZiel(ziel) : null;
    behalten.push(PROC_SPRUNG_TEXTZEILE + (treffer ? treffer.kachel.name : ziel));
    behalten.push('[[rms:prozess=' + ziel + ']]');
  }
  const text = behalten.join('\n').trim();
  const moddle = _bpmnModeler.get('moddle');
  // Über den commandStack, damit Rückgängig funktioniert und das Modell als
  // geändert gilt – eine direkte Zuweisung ginge beim Speichern zwar mit, wäre
  // aber nicht widerrufbar.
  _bpmnModeler.get('modeling').updateProperties(el, {
    documentation: text ? [moddle.create('bpmn:Documentation', { text })] : undefined,
  });
  return true;
}

/** Alle Elemente des offenen Modells, die ein Sprungziel tragen. */
function procSprungElemente() {
  if (!_bpmnModeler) return [];
  try {
    return _bpmnModeler.get('elementRegistry')
      .filter(el => !el.labelTarget && el.type !== 'label' && !!procElementZiel(el));
  } catch (e) { return []; }
}

/**
 * Das sichtbare Zeichen: ein ↦ am Element. Ohne das wüsste niemand, dass dort
 * etwas anklickbar ist – ein Verweis, den man nicht sieht, ist keiner.
 */
function procSprungMarker() {
  if (!_bpmnModeler) return;
  let overlays;
  try { overlays = _bpmnModeler.get('overlays'); } catch (e) { return; }
  try { overlays.remove({ type: PROC_SPRUNG_TYP }); } catch (e) { /* noch keine */ }
  procSprungElemente().forEach(el => {
    const ziel = procElementZiel(el);
    const treffer = (typeof lkKachelVonZiel === 'function') ? lkKachelVonZiel(ziel) : null;
    const name = treffer ? treffer.kachel.name : ziel;
    const werk = treffer ? treffer.werk : '';
    const titel = treffer
      ? ('Weiter zu „' + name + '"' + (werk ? ' (' + ((typeof lkWerkLabel === 'function') ? lkWerkLabel(werk) : werk) + ')' : ''))
      : ('Ziel „' + ziel + '" gibt es nicht mehr');
    try {
      overlays.add(el.id, PROC_SPRUNG_TYP, {
        position: { top: -10, right: 10 },
        html: `<div onclick="procSprungOeffnen('${esc(ziel)}')" title="${esc(titel)}"
                 style="cursor:pointer;background:${treffer ? '#17509E' : '#b45309'};color:#fff;border-radius:11px;
                        padding:1px 7px;font:600 12px/1.5 system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.3);
                        white-space:nowrap">↦ ${esc(name)}</div>`,
      });
    } catch (e) { /* Element ohne Darstellung – dann eben ohne Zeichen */ }
  });
}

/**
 * Dem Sprung folgen. Vorher fragen, wenn im Editor etwas ungespeichert ist:
 * Die Landkarte ersetzt die Ansicht, das Diagramm wäre weg.
 */
async function procSprungOeffnen(ziel) {
  const teile = (typeof lkZielTeile === 'function') ? lkZielTeile(ziel) : null;
  if (!teile) return;
  if (typeof lkKachelVonZiel === 'function' && !lkKachelVonZiel(ziel)) {
    toast('Dieser Prozess steht nicht mehr in der Landkarte – vielleicht wurde er gelöscht.', 'error');
    return;
  }
  if (_procUngespeichert() && typeof uiConfirm === 'function') {
    const weiter = await uiConfirm(
      'Im Diagramm gibt es ungespeicherte Änderungen. Der Sprung in die Landkarte verwirft sie.',
      { title: 'Weiterspringen?', okLabel: 'Trotzdem springen' });
    if (!weiter) return;
  }
  if (typeof lkDeepLink === 'function') await lkDeepLink(teile.werk, teile.id);
}

/** Auswahlliste aller Kacheln – über alle Werke, ein Übergang darf die Gesellschaft wechseln. */
function _procZielOptionen(aktuell) {
  const alle = (typeof lkAlleKacheln === 'function') ? lkAlleKacheln() : [];
  return alle
    .map(x => ({ ziel: lkZielSchluessel(x.werk, x.kachel.id), werk: x.werk, name: x.kachel.name }))
    .sort((a, b) => (a.werk + a.name).localeCompare(b.werk + b.name, 'de'))
    .map(x => `<option value="${esc(x.ziel)}"${x.ziel === aktuell ? ' selected' : ''}>${
      esc(x.name)}${x.werk ? ' · ' + esc((typeof lkWerkLabel === 'function') ? lkWerkLabel(x.werk) : x.werk) : ''}</option>`)
    .join('');
}

/** Der Kasten in der Seitenspalte – er folgt der Auswahl im Diagramm. */
function _renderElementSprung(canWrite) {
  const host = document.getElementById('proc-elem-link');
  if (!host) return;
  let auswahl = [];
  try { auswahl = _bpmnModeler ? _bpmnModeler.get('selection').get() : []; } catch (e) { /* kein Modeler */ }
  const el = _procGemeint(auswahl.length === 1 ? auswahl[0] : null);

  if (!el) {
    const wieviele = procSprungElemente().length;
    host.innerHTML = `<span class="field-hint">${auswahl.length > 1
      ? 'Mehrere Elemente ausgewählt – bitte genau eines anklicken.'
      : 'Ein Element im Diagramm anklicken.'}${
      wieviele ? ` Aktuell ${wieviele} Übergang${wieviele > 1 ? 'e' : ''} im Modell.` : ''}</span>`;
    return;
  }
  const ziel = procElementZiel(el);
  const name = (el.businessObject && el.businessObject.name) || el.id;
  host.innerHTML = `
    <div style="font-weight:600;font-size:.82rem;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div>
    <select id="proc-elem-ziel" onchange="procElementSprungWaehlen(this.value)" ${canWrite ? '' : 'disabled'}>
      <option value="">— kein Übergang —</option>
      ${_procZielOptionen(ziel)}
    </select>
    ${ziel ? `<button class="btn btn-outline btn-sm" style="margin-top:6px"
        onclick="procSprungOeffnen('${esc(ziel)}')">↦ Dorthin springen</button>` : ''}`;
}

/** Auswahl im Kasten übernehmen: Marker schreiben, Zeichen neu setzen. */
function procElementSprungWaehlen(ziel) {
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  let auswahl = [];
  try { auswahl = _bpmnModeler ? _bpmnModeler.get('selection').get() : []; } catch (e) { /* kein Modeler */ }
  const el = _procGemeint(auswahl.length === 1 ? auswahl[0] : null);
  if (!el) return;
  procElementZielSetzen(el, ziel || '');
  procSprungMarker();
  _renderElementSprung(true);
}

/* ═══════════════════════════════════════════════════
   Unterprozesse einbinden – ein Modell im Modell
   ═══════════════════════════════════════════════════
   „Auftragserfassung" läuft in Lead to Cash und in Design to Operate. Wer den
   Ablauf in beide Modelle hineinzeichnet, hat ihn zweimal – und nach der
   ersten Änderung zwei verschiedene. BPMN hat dafür die Aufrufaktivität
   (Call Activity, ⊞): ein Kasten, der sagt „hier läuft dieser Prozess", und
   der auf ein eigenes Modell zeigt. Das Modell gibt es einmal; eingebunden
   wird es so oft wie nötig.

   Der Verweis liegt – wie der Übergang – in der Dokumentation des Elements und
   damit in der Datei:  [[rms:modell=<Kennung der Datei>]]
   Dazu `calledElement` mit der Prozess-Kennung des Ziels, damit ein fremdes
   Werkzeug den Aufruf als das liest, was er ist. Die Datei-Kennung ist die
   Wahrheit: Sie überlebt Umbenennen und Umzug; die Prozess-Kennung wird beim
   Speichern nachgezogen.

   Und weil eine ⊞ auf genau ein Modell zeigen muss, braucht jedes Modell eine
   einmalige Prozess-Kennung. Bis hierher hieß jedes „Process_1" – beim
   Speichern bekommt es eine eigene, die es behält. */
const PROC_MODELL_MARKER = /\[\[rms:modell=([^\]]*)\]\]/;
const PROC_MODELL_MARKER_ALLE = /\[\[rms:modell=([^\]]*)\]\]/g;
const PROC_UNTER_TYP = 'rms-unter';          // Overlay-Kennung im Modeler
const PROC_UNTER_TEXTZEILE = 'Unterprozess: ';
const PROC_KENNUNG_RE = /<(?:\w+:)?process\b[^>]*\bid="([^"]+)"/;
let _procPfad = [];    // Datei-Kennungen der Modelle, aus denen man in einen Unterprozess gewechselt ist

function procNeueKennung() {
  return (typeof prozessKennungNeu === 'function') ? prozessKennungNeu()
    : 'Process_' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
}
function procKennungGueltig(k) {
  return (typeof prozessKennungGueltig === 'function') ? prozessKennungGueltig(k)
    : (!!k && !/^Process_\d*$/.test(String(k)));
}
/** Ein leeres Diagramm mit eigener Kennung – „Process_1" trüge sonst jedes neue Modell. */
function procLeeresBpmn() {
  return DEFAULT_BPMN.split('Process_1').join(procNeueKennung());
}
/** Die Prozess-Kennung aus dem XML einer Datei ('' wenn keine). */
function procKennungAusXml(xml) {
  const m = String(xml || '').match(PROC_KENNUNG_RE);
  return m ? m[1] : '';
}
/** Die Datei-Kennungen aller eingebundenen Modelle (ohne Doppel). */
function procUnterAusXml(xml) {
  const out = [];
  String(xml || '').replace(PROC_MODELL_MARKER_ALLE, (_, id) => {
    id = String(id).trim();
    if (id && !out.includes(id)) out.push(id);
    return '';
  });
  return out;
}

/** Der Cache-Eintrag eines Modells der Liste (null, solange die Datei ungelesen ist). */
function procEintragVon(p) {
  return p ? procLinksVon(p.itemId + '|' + p.modified) : null;
}
/** Das Modell der Liste zu einer Datei-Kennung. */
function procModellVon(itemId) {
  return (_processes || []).find(p => String(p.itemId) === String(itemId)) || null;
}
function _procWerkLabel(p) {
  return (p && p.ordner) ? ((typeof lkWerkLabel === 'function') ? lkWerkLabel(p.ordner) : p.ordner) : '';
}
/** Die Prozess-Kennung eines Modells, sofern bekannt und nicht generisch. */
function procKennungVon(itemId) {
  const e = procEintragVon(procModellVon(itemId));
  return (e && procKennungGueltig(e.i)) ? e.i : '';
}
/** Welche Modelle ein Modell einbindet (Datei-Kennungen; leer, solange unbekannt). */
function procBindetEin(itemId) {
  const e = procEintragVon(procModellVon(itemId));
  return e ? e.u : [];
}
/** In welchen Modellen ein Modell eingebunden ist. */
function procEingebundenIn(itemId) {
  return (_processes || []).filter(p => String(p.itemId) !== String(itemId)
    && procBindetEin(p.itemId).includes(String(itemId)));
}
/** Steckt `ziel` – über beliebig viele Stufen – in `start`? Die Kreisprüfung. */
function procBindetTransitiv(start, ziel, gesehen) {
  const g = gesehen || new Set();
  for (const u of procBindetEin(start)) {
    if (String(u) === String(ziel)) return true;
    if (g.has(u)) continue;
    g.add(u);
    if (procBindetTransitiv(u, ziel, g)) return true;
  }
  return false;
}
/** Der Name in der Form, in der er als Datei liegt – so vergleicht man Namen. */
function _procNameNorm(name) {
  const s = String(name || '').replace(/\.bpmn$/i, '');
  return ((typeof spProzessDateiname === 'function') ? spProzessDateiname(s) : s).trim().toLowerCase();
}
/** Gibt es ein Modell dieses Namens schon – in irgendeinem Werk? */
function procNamensDoppel(name, ausserId) {
  if (!String(name || '').trim()) return [];
  const n = _procNameNorm(name);
  return (_processes || []).filter(p => String(p.itemId) !== String(ausserId || '')
    && _procNameNorm(p.title) === n);
}

/**
 * Den Eintrag eines Modells sicherstellen: aus dem Cache, sonst einmal aus der
 * Datei. Läuft das Lesen derselben Datei schon (Liste und Editor fragen
 * womöglich gleichzeitig), wird darauf gewartet statt doppelt angefragt.
 * @returns {Promise<object|null>} der Eintrag, null wenn die Datei nicht lesbar war
 */
const _procLesend = new Map();   // itemId → laufendes Lesen
async function procEintragLaden(p) {
  const e = procEintragVon(p);
  if (e && !e.alt) return e;
  if (_procLesend.has(p.itemId)) return _procLesend.get(p.itemId);
  const lauf = (async () => {
    try {
      // Die Datei wird ohnehin gelesen – dann sagt sie auch gleich, ob sie
      // überhaupt ein Diagramm enthält. Sonst merkt man es erst beim Öffnen.
      const eintrag = procEintragAusXml(await spGetProcessXml(p.itemId));
      procLinksMerken(p.itemId + '|' + p.modified, eintrag);
      return procLinkEintrag(eintrag);
    } catch (err) { return e || null; }          // ein alter Eintrag ist besser als keiner
    finally { _procLesend.delete(p.itemId); }
  })();
  _procLesend.set(p.itemId, lauf);
  return lauf;
}

/**
 * Die Einträge vieler Modelle sicherstellen – für Karten, Kreisprüfung und
 * „eingebunden in". Fünf nebeneinander: bei fünfzig Modellen Sekunden, nicht
 * Minuten – und keine Drosselung durch SharePoint, die alle auf einmal
 * auslösten. `fertig(p, eintrag)` wird je Modell gerufen, sobald es da ist.
 * @returns {Promise<number>} wie viele Dateien gelesen werden mussten
 */
async function procEintraegeLaden(liste, fertig) {
  const offen = (liste || _processes || []).filter(p => { const e = procEintragVon(p); return !e || e.alt; });
  for (let i = 0; i < offen.length; i += 5) {
    await Promise.all(offen.slice(i, i + 5).map(async p => {
      const e = await procEintragLaden(p);
      if (typeof fertig === 'function') fertig(p, e);
    }));
  }
  return offen.length;
}
let _procLadeLauf = null;   // das Hintergrund-Lesen des Editors – das Speichern wartet darauf

/** Die Datei-Kennung des eingebundenen Modells eines Elements ('' = keins). */
function procElementModell(el) {
  const m = String(_elemDokuText(el)).match(PROC_MODELL_MARKER);
  return m ? m[1].trim() : '';
}
/** Nur eine Aktivität kann ein Modell einbinden – kein Ereignis, kein Gateway, keine Bahn. */
function procKannEinbinden(el) {
  return /^bpmn:(Task|UserTask|ServiceTask|ManualTask|ScriptTask|SendTask|ReceiveTask|BusinessRuleTask|CallActivity)$/
    .test(String((el && el.type) || ''));
}
/** Die Bahn (Rolle), in der ein Element liegt – '' wenn keine. */
function _procBahnVon(el) {
  try {
    const bo = el && el.businessObject;
    const bahn = _bpmnModeler.get('elementRegistry').filter(e => e.type === 'bpmn:Lane'
      && Array.isArray(e.businessObject.flowNodeRef) && e.businessObject.flowNodeRef.includes(bo))[0];
    return bahn ? String(bahn.businessObject.name || '').trim() : '';
  } catch (e) { return ''; }
}

/** Alle Elemente des offenen Modells, die ein Modell einbinden. */
function procUnterElemente() {
  if (!_bpmnModeler) return [];
  try {
    return _bpmnModeler.get('elementRegistry')
      .filter(el => !el.labelTarget && el.type !== 'label' && !!procElementModell(el));
  } catch (e) { return []; }
}
/** Das eine ausgewählte Element (bei einer Beschriftung das Element dahinter). */
function _procAusgewaehlt() {
  let auswahl = [];
  try { auswahl = _bpmnModeler ? _bpmnModeler.get('selection').get() : []; } catch (e) { /* kein Modeler */ }
  return _procGemeint(auswahl.length === 1 ? auswahl[0] : null);
}

/**
 * Ein Modell an ein Element binden – oder lösen (itemId leer). Aus der
 * Aufgabe wird eine ⊞ Aufrufaktivität; Name, Bahn und Verbindungen bleiben,
 * ebenso der erklärende Text der Dokumentation. Über den commandStack, damit
 * Rückgängig funktioniert und das Modell als geändert gilt.
 * @returns das (womöglich ersetzte) Element oder null
 */
function procUnterprozessSetzen(el, itemId) {
  if (!_bpmnModeler || !el || !el.businessObject) return null;
  let ziel = el;
  if (itemId && el.type !== 'bpmn:CallActivity') {
    try { ziel = _bpmnModeler.get('bpmnReplace').replaceElement(el, { type: 'bpmn:CallActivity' }); }
    catch (e) { console.warn('Element nicht ersetzbar:', e.message); return null; }
  }
  const behalten = _elemDokuText(ziel).split('\n')
    .filter(z => !PROC_MODELL_MARKER.test(z) && z.indexOf(PROC_UNTER_TEXTZEILE) !== 0);
  const props = {};
  if (itemId) {
    const m = procModellVon(itemId);
    behalten.push(PROC_UNTER_TEXTZEILE + (m ? m.title : itemId));
    behalten.push('[[rms:modell=' + itemId + ']]');
    props.calledElement = procKennungVon(itemId) || undefined;
    if (m && !String(ziel.businessObject.name || '').trim()) props.name = m.title;
  } else {
    props.calledElement = undefined;
  }
  const text = behalten.join('\n').trim();
  const moddle = _bpmnModeler.get('moddle');
  props.documentation = text ? [moddle.create('bpmn:Documentation', { text })] : undefined;
  _bpmnModeler.get('modeling').updateProperties(ziel, props);
  return ziel;
}

/** Das sichtbare Zeichen: ⊞ mit dem Namen des Modells – anklicken öffnet es. */
function procUnterMarker() {
  if (!_bpmnModeler) return;
  let overlays;
  try { overlays = _bpmnModeler.get('overlays'); } catch (e) { return; }
  try { overlays.remove({ type: PROC_UNTER_TYP }); } catch (e) { /* noch keine */ }
  procUnterElemente().forEach(el => {
    const itemId = procElementModell(el);
    const m = procModellVon(itemId);
    const name = m ? m.title : 'Modell fehlt';
    const titel = m
      ? ('Unterprozess „' + m.title + '" öffnen' + (m.ordner ? ' (' + _procWerkLabel(m) + ')' : ''))
      : 'Das eingebundene Modell gibt es nicht mehr';
    try {
      // Oben links: Unten in der Mitte zeichnet bpmn-js selbst das ⊞ der
      // Aufrufaktivität, oben rechts sitzt der Übergang ↦.
      overlays.add(el.id, PROC_UNTER_TYP, {
        position: { top: -10, left: 10 },
        html: `<div onclick="procUnterprozessOeffnen('${esc(itemId)}')" title="${esc(titel)}"
                 style="cursor:pointer;background:${m ? '#1A2644' : '#b45309'};color:#fff;border-radius:11px;
                        padding:1px 7px;font:600 12px/1.5 system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.3);
                        white-space:nowrap">⊞ ${esc(name)}</div>`,
      });
    } catch (e) { /* Element ohne Darstellung – dann eben ohne Zeichen */ }
  });
}

/**
 * Ungespeichert heißt: seit dem letzten Speichern (oder Öffnen) geändert.
 * „Gibt es einen Rückgängig-Schritt" wäre die falsche Frage – nach dem
 * Speichern lässt sich weiterhin rückgängig machen, verloren ginge aber nichts.
 */
function _procUngespeichert() { return !!(_bpmnModeler && _procDirty); }

/** In das eingebundene Modell wechseln – der Weg zurück steht dann oben in der Leiste. */
async function procUnterprozessOeffnen(itemId) {
  const m = procModellVon(itemId);
  if (!m) { toast('Dieses Modell gibt es nicht mehr – vielleicht wurde es gelöscht.', 'error'); return; }
  if (_procUngespeichert() && typeof uiConfirm === 'function') {
    const weiter = await uiConfirm(
      'Im Diagramm gibt es ungespeicherte Änderungen. Der Wechsel in den Unterprozess verwirft sie – vorher „💾 Speichern".',
      { title: 'Unterprozess öffnen?', okLabel: 'Trotzdem wechseln' });
    if (!weiter) return;
  }
  if (_procEditing && _procEditing.itemId) _procPfad.push(String(_procEditing.itemId));
  // Wer liest, liest im Unterprozess weiter; wer baut, baut weiter.
  await (_procAnsicht ? openProcessAnsicht(itemId) : openProcessEditor(itemId));
}

/** Zurück in das Modell, aus dem man in den Unterprozess kam. */
async function procZurueck() {
  const zu = _procPfad.pop();
  if (zu && procModellVon(zu)) await (_procAnsicht ? openProcessAnsicht(zu) : openProcessEditor(zu));
  else await initProzesse();
}

/** Modelle, die sich an dieses Element binden lassen: nicht das eigene, kein Kreis. */
function procEinbindbar(filter) {
  const eigen = String((_procEditing && _procEditing.itemId) || '');
  const f = String(filter || '').trim().toLowerCase();
  const werke = (typeof lkWerkeSichtbar === 'function') ? lkWerkeSichtbar() : [];
  const getrennt = typeof trennungGreift === 'function' && trennungGreift();
  const rang = (p) => { if (!p.ordner) return 9999; const i = werke.indexOf(p.ordner); return i < 0 ? 500 : i; };
  return (_processes || [])
    .filter(p => String(p.itemId) !== eigen)
    .filter(p => !getrennt || !p.ordner || werke.includes(p.ordner))
    .filter(p => !eigen || !procBindetTransitiv(p.itemId, eigen))
    // Gesucht wird nach Name, Werk („SHB", „Schmiedeberg") oder Prozess-Kennung.
    .filter(p => !f || String(p.title || '').toLowerCase().includes(f)
      || String(p.ordner || '').toLowerCase() === f || _procWerkLabel(p).toLowerCase().includes(f)
      || procKennungVon(p.itemId).toLowerCase().includes(f))
    .sort((a, b) => (rang(a) - rang(b)) || (a.title || '').localeCompare(b.title || '', 'de'));
}

/** Die Liste im Kasten: einbinden, was es gibt – anlegen nur, was es nirgends gibt. */
function _procUnterListeHtml(el, filter) {
  const kand = procEinbindbar(filter);
  const name = String((el && el.businessObject && el.businessObject.name) || '').trim();
  const zeilen = kand.slice(0, 12).map(p => `
    <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--c-border)">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">⊞ ${esc(p.title)}${
        p.ordner ? ` <span class="field-hint">· ${esc(_procWerkLabel(p))}</span>` : ''}${
        procBindetEin(p.itemId).length ? ` <span class="field-hint" title="bindet selbst Unterprozesse ein">⊞ ${procBindetEin(p.itemId).length}</span>` : ''}</span>
      <button class="btn btn-outline btn-sm" onclick="procUnterprozessEinbinden('${esc(p.itemId)}')">Einbinden</button>
    </div>`).join('');
  const mehr = kand.length > 12 ? `<div class="field-hint" style="margin-top:4px">… ${kand.length - 12} weitere – Suche eingrenzen.</div>` : '';
  const doppel = name ? procNamensDoppel(name, _procEditing && _procEditing.itemId) : [];
  let neu;
  if (name && !doppel.length) {
    neu = `<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="procUnterprozessAnlegen()"
      title="Ein eigenes Modell dieses Namens anlegen und hier einbinden">+ „${esc(name)}" als neues Modell anlegen</button>`;
  } else if (name) {
    neu = `<div class="field-hint" style="margin-top:6px">„${esc(name)}" gibt es schon${
      doppel[0].ordner ? ' in ' + esc(_procWerkLabel(doppel[0])) : ''} – oben einbinden statt ein zweites Mal anlegen.</div>`;
  } else {
    neu = '<div class="field-hint" style="margin-top:6px">Eine benannte Aufgabe lässt sich auch als neues Modell anlegen.</div>';
  }
  return (zeilen || `<div class="field-hint">${filter ? 'Kein Modell passt zur Suche.' : 'Noch kein anderes Modell vorhanden.'}</div>`) + mehr + neu;
}

/** Der Kasten in der Seitenspalte – er folgt der Auswahl im Diagramm. */
function _renderElementUnter(canWrite) {
  const host = document.getElementById('proc-unter');
  if (!host) return;
  let auswahl = [];
  try { auswahl = _bpmnModeler ? _bpmnModeler.get('selection').get() : []; } catch (e) { /* kein Modeler */ }
  const el = _procGemeint(auswahl.length === 1 ? auswahl[0] : null);
  const eigene = procUnterElemente();
  const eigen = String((_procEditing && _procEditing.itemId) || '');
  const oben = eigen ? procEingebundenIn(eigen) : [];
  const chip = (itemId) => {
    const m = procModellVon(itemId);
    return `<span class="ic-tag" style="cursor:pointer;background:#e6eef8;color:#1A2644"
      onclick="procUnterprozessOeffnen('${esc(itemId)}')" title="öffnen">⊞ ${esc(m ? m.title : 'Modell fehlt')}</span>`;
  };
  const fuss = (eigene.length
      ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">${eigene.map(x => chip(procElementModell(x))).join('')}</div>` : '')
    + (oben.length
      ? `<div class="field-hint" style="margin-top:6px">↰ Dieses Modell ist eingebunden in ${oben.map(p =>
          `<a href="#" onclick="procUnterprozessOeffnen('${esc(p.itemId)}');return false">${esc(p.title)}</a>`).join(', ')} – eine Änderung hier wirkt dort.</div>` : '');

  if (!el) {
    host.innerHTML = `<span class="field-hint">${auswahl.length > 1
      ? 'Mehrere Elemente ausgewählt – bitte genau eine Aufgabe anklicken.'
      : 'Eine Aufgabe im Diagramm anklicken.'}${
      eigene.length ? ` Aktuell ${eigene.length} Unterprozess${eigene.length > 1 ? 'e' : ''} eingebunden.` : ''}</span>${fuss}`;
    return;
  }
  const name = (el.businessObject && el.businessObject.name) || el.id;
  const kopf = `<div style="font-weight:600;font-size:.82rem;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div>`;
  if (!procKannEinbinden(el)) {
    host.innerHTML = kopf + `<span class="field-hint">${el.type === 'bpmn:SubProcess'
      ? 'Ein ausgeschriebener Unterprozess – besser als eigenes Modell anlegen und von einer Aufgabe aus einbinden: dann gibt es ihn einmal.'
      : 'Nur eine Aufgabe kann ein Modell einbinden.'}</span>${fuss}`;
    return;
  }
  const itemId = procElementModell(el);
  if (itemId) {
    const m = procModellVon(itemId);
    host.innerHTML = kopf + `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="flex:1;min-width:0">⊞ <b>${esc(m ? m.title : 'Modell fehlt')}</b>${
          m && m.ordner ? ` <span class="field-hint">· ${esc(_procWerkLabel(m))}</span>` : ''}${
          m ? '' : ' <span style="color:#b45309">– gibt es nicht mehr</span>'}</span>
        ${m ? `<button class="btn btn-outline btn-sm" onclick="procUnterprozessOeffnen('${esc(itemId)}')">Öffnen</button>` : ''}
        ${canWrite ? '<button class="btn btn-ghost btn-sm" onclick="procUnterprozessLoesen()">Lösen</button>' : ''}
      </div>${fuss}`;
    return;
  }
  if (!canWrite) { host.innerHTML = kopf + `<span class="field-hint">Kein Modell eingebunden.</span>${fuss}`; return; }
  host.innerHTML = kopf + `<input type="text" id="proc-unter-suche" placeholder="Modell suchen – Name, Werk, Kennung …"
      oninput="procUnterprozessSuche()" onkeydown="procUnterprozessSucheTaste(event)" style="width:100%;margin-bottom:6px">
    <div id="proc-unter-liste">${_procUnterListeHtml(el, '')}</div>${fuss}`;
}

/** Nur die Liste neu zeichnen – das Suchfeld behält den Fokus. */
function procUnterprozessSuche() {
  const liste = document.getElementById('proc-unter-liste');
  const el = _procAusgewaehlt();
  if (!liste || !el) return;
  liste.innerHTML = _procUnterListeHtml(el, (document.getElementById('proc-unter-suche') || {}).value || '');
}

/** Eingabetaste im Suchfeld: bleibt genau ein Modell übrig, wird es eingebunden. */
function procUnterprozessSucheTaste(ev) {
  if (!ev || ev.key !== 'Enter') return;
  ev.preventDefault();
  const kand = procEinbindbar((document.getElementById('proc-unter-suche') || {}).value || '');
  if (kand.length === 1) procUnterprozessEinbinden(kand[0].itemId);
  else if (typeof toast === 'function') toast(kand.length ? `${kand.length} Modelle passen – Suche eingrenzen.` : 'Kein Modell passt zur Suche.', 'error');
}

/** Auswahl im Kasten übernehmen: Element wird ⊞, Marker geschrieben, Zeichen gesetzt. */
async function procUnterprozessEinbinden(itemId) {
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const el = _procAusgewaehlt();
  if (!el || !procKannEinbinden(el)) { toast('Bitte eine Aufgabe im Diagramm auswählen.', 'error'); return; }
  const m = procModellVon(itemId);
  if (!m) { toast('Dieses Modell gibt es nicht (mehr).', 'error'); return; }
  const eigen = String((_procEditing && _procEditing.itemId) || '');
  if (eigen && String(itemId) === eigen) { toast('Ein Modell kann sich nicht selbst einbinden.', 'error'); return; }
  if (eigen && procBindetTransitiv(itemId, eigen)) {
    toast(`„${m.title}" bindet dieses Modell schon ein – das wäre ein Kreis.`, 'error'); return;
  }
  // Die Prozess-Kennung des Ziels: aus dem Cache, sonst einmal aus der Datei.
  if (!procEintragVon(m)) {
    try { procLinksMerken(m.itemId + '|' + m.modified, procEintragAusXml(await spGetProcessXml(m.itemId))); }
    catch (e) { /* dann ohne calledElement – das Speichern zieht es nach */ }
  }
  const neu = procUnterprozessSetzen(el, String(itemId));
  if (!neu) { toast('Einbinden fehlgeschlagen.', 'error'); return; }
  try { _bpmnModeler.get('selection').select(neu); } catch (e) { /* egal */ }
  procUnterMarker();
  _renderElementUnter(true);
  toast(`„${m.title}" eingebunden ✓ – Speichern nicht vergessen.`, 'success');
}

/** Das eingebundene Modell vom ausgewählten Element lösen. */
function procUnterprozessLoesen() {
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const el = _procAusgewaehlt();
  if (!el) return;
  procUnterprozessSetzen(el, '');
  procUnterMarker();
  _renderElementUnter(true);
  toast('Gelöst – das Modell selbst bleibt. Die ⊞ wird über das Schraubenschlüssel-Menü wieder zur Aufgabe.', 'success');
}

/**
 * Ein neues Modell mit dem Namen der Aufgabe anlegen und einbinden – nur,
 * wenn es den Namen nirgends gibt. Gibt es ihn, wird das vorhandene Modell
 * eingebunden: Ein Unterprozess wird einmal angelegt.
 */
async function procUnterprozessAnlegen() {
  if (typeof canWriteTab === 'function' && !canWriteTab('prozesse')) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const el = _procAusgewaehlt();
  if (!el || !procKannEinbinden(el)) { toast('Bitte eine Aufgabe im Diagramm auswählen.', 'error'); return; }
  const name = String((el.businessObject && el.businessObject.name) || '').trim();
  if (!name) { toast('Die Aufgabe braucht erst einen Namen – er wird der Name des Modells.', 'error'); return; }
  const doppel = procNamensDoppel(name, _procEditing && _procEditing.itemId);
  if (doppel.length) {
    toast(`„${name}" gibt es schon – eingebunden statt doppelt angelegt.`, 'success');
    await procUnterprozessEinbinden(doppel[0].itemId);
    return;
  }
  const werk = (document.getElementById('proc-werk') || {}).value || '';
  try {
    // Ein Grundgerüst nach Hausschema mit eigener Kennung – im Ordner dieses
    // Werks, und in der Bahn, in der die Aufgabe hier liegt: Wer hier zuständig
    // ist, ist es meist auch im Unterprozess.
    const bahn = _procBahnVon(el);
    const erzeugt = _bpmnFromText(bahn ? bahn + ': Schritt beschreiben' : '', name, []);
    const item = await spSaveProcess(name, erzeugt.xml, werk);
    if (!item || !item.id) throw new Error('keine Kennung erhalten');
    // Die Liste kennt das neue Modell noch nicht – einmal neu lesen, damit
    // Kasten, Zeichen und Kreisprüfung es finden.
    try { _processes = await spListProcesses(); } catch (e) { /* dann steht es unten drin */ }
    if (!procModellVon(item.id)) {
      (_processes = _processes || []).push({ itemId: item.id, name: name + '.bpmn', title: name, ordner: werk,
        modified: item.lastModifiedDateTime || '', modifiedBy: '' });
    }
    procLinksMerken(item.id + '|' + (procModellVon(item.id).modified || ''), procEintragAusXml(erzeugt.xml));
    const neu = procUnterprozessSetzen(el, String(item.id));
    if (!neu) throw new Error('Element nicht ersetzbar');
    try { _bpmnModeler.get('selection').select(neu); } catch (e) { /* egal */ }
    procUnterMarker();
    _renderElementUnter(true);
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = `<span style="color:#15803d">Unterprozess „${esc(name)}" angelegt und eingebunden ✓ – dieses Modell speichern, damit der Verweis bleibt.</span>`;
    toast(`Unterprozess „${name}" angelegt und eingebunden ✓`, 'success');
  } catch (e) {
    toast('Anlegen fehlgeschlagen: ' + e.message, 'error');
  }
}

/** Das <bpmn:process> des offenen Modells – bei einem Pool über den Teilnehmer. */
function _procProzessBo() {
  if (!_bpmnModeler) return null;
  try {
    const root = _bpmnModeler.get('canvas').getRootElement();
    const bo = root && root.businessObject;
    if (!bo) return null;
    if (bo.$type === 'bpmn:Process') return { bo, shape: root };
    const teilnehmer = (bo.participants || []).find(t => t.processRef);
    if (teilnehmer) return { bo: teilnehmer.processRef, shape: null };
    const defs = bo.$parent;
    const proz = defs && (defs.rootElements || []).find(r => r.$type === 'bpmn:Process');
    return proz ? { bo: proz, shape: null } : null;
  } catch (e) { return null; }
}

/**
 * Die Kennung des Modells festmachen: einmalig im Haus. „Process_1" (die
 * Kennung jedes Modells bis hierher) und eine Kennung, die ein anderes Modell
 * schon trägt (eine importierte Kopie), werden beim Speichern ersetzt – das
 * ältere Modell behält seine. Ohne das könnte keine ⊞ eindeutig zeigen.
 * @returns {{alt:string, neu:string}|null} – neu === alt, wenn nichts zu tun war
 */
function procKennungSichern() {
  const p = _procProzessBo();
  if (!p) return null;
  const alt = String(p.bo.id || '');
  const eigen = String((_procEditing && _procEditing.itemId) || '');
  const fremde = new Set((_processes || []).filter(x => String(x.itemId) !== eigen)
    .map(x => { const e = procEintragVon(x); return e ? e.i : ''; }).filter(Boolean));
  if (procKennungGueltig(alt) && !fremde.has(alt)) return { alt, neu: alt };
  let neu = procNeueKennung();
  while (fremde.has(neu)) neu = procNeueKennung();
  try {
    if (p.shape) {
      _bpmnModeler.get('modeling').updateProperties(p.shape, { id: neu });
    } else {
      // Der Prozess hinter einem Pool ist kein Element der Zeichenfläche –
      // direkt setzen, wie die Prozess-Dokumentation beim Speichern auch.
      const ids = _bpmnModeler.get('moddle').ids;
      if (ids && typeof ids.unclaim === 'function') { try { ids.unclaim(alt); } catch (e) { /* egal */ } }
      p.bo.id = neu;
      if (ids && typeof ids.claim === 'function') { try { ids.claim(neu, p.bo); } catch (e) { /* egal */ } }
    }
  } catch (e) { console.warn('Kennung nicht gesetzt:', e.message); return { alt, neu: alt }; }
  return { alt, neu };
}

/**
 * Vor dem Speichern: jede ⊞ trägt die aktuelle Prozess-Kennung ihres Modells
 * (`calledElement`) und dessen aktuellen Namen im Klartext. Beides kann sich
 * geändert haben, seit der Verweis gesetzt wurde – die Datei-Kennung im
 * Marker ist die Wahrheit, der Rest wird nachgezogen.
 * @returns Zahl der nachgezogenen Angaben
 */
function procUnterprozesseAbgleichen() {
  let n = 0;
  procUnterElemente().forEach(el => {
    const itemId = procElementModell(el);
    const m = procModellVon(itemId);
    const kennung = procKennungVon(itemId);
    const bo = el.businessObject;
    if (kennung && bo.calledElement !== kennung) { bo.calledElement = kennung; n++; }
    if (m && bo.documentation && bo.documentation[0]) {
      const zeilen = String(bo.documentation[0].text || '').split('\n');
      const i = zeilen.findIndex(z => z.indexOf(PROC_UNTER_TEXTZEILE) === 0);
      const soll = PROC_UNTER_TEXTZEILE + m.title;
      if (i >= 0 && zeilen[i] !== soll) { zeilen[i] = soll; bo.documentation[0].text = zeilen.join('\n'); n++; }
    }
  });
  return n;
}

/* ── Editor (bpmn-js Modeler) ── */

async function openProcessEditor(itemId, seed) {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  _procAnsicht = false;
  const proc = itemId ? (_processes || []).find(p => String(p.itemId) === String(itemId)) : null;
  _procEditing = { itemId: itemId || null, origName: proc ? proc.name : '',
    origWerk: proc ? (proc.ordner || '') : '' };
  const startName = proc ? proc.title : (seed && seed.name ? seed.name : '');
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('prozesse');
  // Wer aus einem Hauptprozess in den Unterprozess gewechselt ist, will auch
  // zurück – nicht nur in die Liste.
  const herkunft = _procPfad.length ? procModellVon(_procPfad[_procPfad.length - 1]) : null;

  mount.innerHTML = `
    <div id="proc-editor">
    <div class="view-toolbar">
      <button class="btn btn-sm btn-ghost" onclick="initProzesse()">← Zurück zur Liste</button>
      ${herkunft ? `<button class="btn btn-sm btn-ghost" onclick="procZurueck()"
        title="Zurück in das Modell, das diesen Unterprozess einbindet">↰ Zurück zu „${esc(herkunft.title)}"</button>` : ''}
      <div style="font-weight:700">${proc ? 'Prozess bearbeiten' : 'Neuer Prozess'}</div>
      <div class="toolbar-spacer"></div>
      ${itemId ? `<button class="btn btn-outline btn-sm" onclick="procZurAnsicht()"
        title="Zurück zur Ansicht mit Schritten und Befunden">👁 Ansicht</button>` : ''}
      <button class="btn btn-outline btn-sm" id="proc-seite-btn" onclick="prozessSeiteUmschalten()"
        title="Angaben rechts ein-/ausblenden – im Vollbild gehört die Breite dem Diagramm">▤ Angaben</button>
      <button class="btn btn-outline btn-sm" id="proc-voll-btn" onclick="prozessVollbildUmschalten()"
        title="Ganzer Bildschirm – Esc beendet">⛶ Vollbild</button>
      <button class="btn btn-outline btn-sm" onclick="prozessSchemaPruefung()" title="Gegen das Hausschema prüfen">🔍 Schema</button>
      <button class="btn btn-outline btn-sm" onclick="downloadProcessXml()" title="BPMN-Datei herunterladen">⬇ .bpmn</button>
      <button class="btn btn-outline btn-sm" onclick="downloadProcessSvg()" title="Diagramm als Bild – lässt sich in Word, PowerPoint und Regelwerke einfügen">⬇ Bild</button>
      ${itemId && canWrite ? `<button class="btn btn-outline btn-sm" style="color:#b91c1c" onclick="deleteProcess()">Löschen</button>` : ''}
      ${canWrite ? `<button class="btn btn-primary btn-sm" id="proc-save-btn" onclick="saveProcess()">💾 Speichern</button>` : ''}
    </div>
    <div id="proc-arbeit">
      <div id="proc-buehne">
        <div id="bpmn-canvas"></div>
      </div>
      <div id="proc-seite">
        <div class="form-group full"><label>Prozessname <span class="req">*</span></label>
          <input type="text" id="proc-name" value="${esc(startName)}" placeholder="z. B. Freigabe von Lieferanten" ${canWrite ? '' : 'disabled'}></div>
        <div class="form-group full"><label>Ablage (Konzern / Gesellschaft)</label>
          <select id="proc-werk" ${canWrite ? '' : 'disabled'}>
            <option value=""${proc && proc.ordner ? '' : ' selected'}>— ohne Werk —</option>
            ${((typeof lkWerkeSichtbar === 'function') ? lkWerkeSichtbar() : []).map(w =>
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
        <div class="form-group full"><label>Übergang zu einem anderen Prozess</label>
          <div id="proc-elem-link" style="border:1px solid var(--c-border);border-radius:8px;padding:8px;min-height:38px"></div>
          <span class="field-hint">Ein Element im Diagramm anklicken und hier den Prozess wählen, in den der Ablauf
            an dieser Stelle übergeht. Am Element erscheint dann ein ↦ zum Weiterklicken – so steht der Übergang
            dort, wo er passiert, und nicht nur an der Kachel.</span></div>
        <div class="form-group full"><label>Unterprozess – ein Modell einbinden</label>
          <div id="proc-unter" style="border:1px solid var(--c-border);border-radius:8px;padding:8px;min-height:38px"></div>
          <span class="field-hint">Eine Aufgabe anklicken und das Modell wählen, das an dieser Stelle im Ganzen läuft.
            Die Aufgabe wird zur <b>⊞ Aufrufaktivität</b> (BPMN Call Activity); das Modell bleibt eines – einmal gepflegt,
            überall eingebunden, ein Klick auf ⊞ öffnet es. Gibt es den Prozess noch nirgends, legt
            „+ als neues Modell anlegen" ihn an.</span></div>
        <div class="form-group full"><label>Hausschema</label>
          <div id="proc-schema" style="border:1px solid var(--c-border);border-radius:8px;padding:8px;min-height:38px"></div>
          <span class="field-hint">Zehn Bausteine, zehn Regeln – oben „🔍 Schema" prüft das Modell dagegen.
            Ein Modell, das die Prüfung besteht, beantwortet ohne Rückfrage: wer ist zuständig, was läuft
            automatisch, wie geht die Sache aus.</span></div>
        <div id="proc-status" class="field-hint" style="margin-top:8px">Modeler wird geladen …</div>
      </div>
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
  // Die Liste liefert Namen und Kennungen der anderen Modelle – ohne sie
  // wüsste der Kasten „Unterprozess" nicht, was es einzubinden gibt.
  if (!_processes) { try { _processes = await spListProcesses(); } catch (e) { /* dann ohne */ } }

  let xml = procLeeresBpmn(), ids = [], unbrauchbar = false;
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
    unbrauchbar = true; xml = procLeeresBpmn(); ids = []; _procDocs = [];
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

  // Die Landkarte liefert die Auswahlliste der Ziele. Sie ist gecacht; ohne sie
  // stünde im Kasten nur „keine Prozesse" – und niemand wüsste, warum.
  if (typeof lkDatenLaden === 'function') { try { await lkDatenLaden(); } catch (e) { /* dann eben ohne Ziele */ } }
  try {
    const bus = _bpmnModeler.get('eventBus');
    bus.on('selection.changed', (e) => { _renderElementSprung(canWrite); _renderElementUnter(canWrite); _procAuswahlSpiegeln(e && e.newSelection); });
    // Nach jeder Änderung neu zeichnen: ein verschobenes Element nimmt sein
    // Zeichen sonst nicht mit, ein gelöschtes ließe es zurück.
    bus.on('elements.changed', () => { procSprungMarker(); procUnterMarker(); _procFaerbenBald(); });
    // Nach jeder Änderung still nachprüfen: Die Befunde rechts und im Diagramm
    // folgen dem Modell, ohne dass jemand „🔍 Schema" drücken muss.
    bus.on('commandStack.changed', () => { _procDirty = true; _procNachpruefenBald(); });
  } catch (e) { console.warn('Sprung-Ereignisse nicht verbunden:', e.message); }
  _procDirty = false;
  _procFarbStil();
  _procFaerben();
  procSprungMarker();
  procUnterMarker();
  _renderElementSprung(canWrite);
  _renderElementUnter(canWrite);
  // Kreisprüfung und „eingebunden in" brauchen die Einträge aller Modelle –
  // im Hintergrund, der Kasten zieht nach, sobald sie da sind.
  _procLadeLauf = procEintraegeLaden().then(n => {
    if (!n || !_bpmnModeler) return;
    procUnterMarker();
    if (!(document.activeElement && document.activeElement.id === 'proc-unter-suche')) _renderElementUnter(canWrite);
  }).catch(() => {}).finally(() => { _procLadeLauf = null; });
  // Wer zuletzt im Vollbild gearbeitet hat, fängt dort wieder an.
  prozessSeiteUmschalten(_procGemerkt(PROC_SEITE_SPEICHER, true));
  if (_procGemerkt(PROC_VOLL_SPEICHER, false)) prozessVollbildUmschalten(true);
  prozessSchemaLegende();
  if (itemId || (seed && seed.xml)) prozessSchemaPruefung(true);
}

/* ── Die Ansicht: lesen statt bauen ────────────────────────────────────────
   Wer ein Modell öffnet, will es meistens lesen, nicht ändern. Die Ansicht
   folgt der Prozessseite der E-Rechnung: oben Kopf und Aktionen, dann das
   farbige Diagramm, darunter links die Schritte und rechts, was auffällt.
   Jede Zeile rechts und jeder Schritt links zeigt beim Klick die Stelle im
   Diagramm; umgekehrt markiert ein Klick ins Diagramm die passende Zeile.

   Gezeichnet wird mit demselben Modeler wie im Editor, nur gesperrt. So
   funktionieren die Marker für Unterprozesse ⊞ und Übergänge ↦ unverändert,
   und „✎ Bearbeiten" ist nur ein Wechsel, kein zweites Werkzeug. */

let _procAnsicht = false;     // Ist das offene Modell die Ansicht (lesen) statt der Editor?
let _procAnsichtXml = '';     // die Datei, wie sie geladen wurde: der Download gibt genau sie heraus
let _procAblauf = null;       // Schrittliste des offenen Modells (prozessAblauf)
let _procBefunde = null;      // letzte Hausschema-Prüfung des offenen Modells
let _procPruefTimer = null;   // Editor: nachprüfen, sobald eine Weile nichts geändert wurde
let _procFarbTimer = null;
const PROC_BEFUND_TYP = 'rms-befund';
const PROC_LEGENDE_SPEICHER = 'rms_proc_legende';

/** Das Modell zum Lesen öffnen. */
async function openProcessAnsicht(itemId) {
  const mount = document.getElementById('prozesse-mount');
  if (!mount || !itemId) return;
  if (!_processes) { try { _processes = await spListProcesses(); } catch (e) { /* unten gemeldet */ } }
  const proc = (_processes || []).find(p => String(p.itemId) === String(itemId));
  if (!proc) { toast('Dieses Modell gibt es nicht mehr, vielleicht wurde es gelöscht.', 'error'); return; }
  _destroyModeler();
  _procAnsicht = true;
  _procAnsichtXml = '';
  _procEditing = { itemId: String(itemId), origName: proc.name, origWerk: proc.ordner || '' };
  _procDirty = false;
  _procFarbStil();
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('prozesse');
  const herkunft = _procPfad.length ? procModellVon(_procPfad[_procPfad.length - 1]) : null;

  mount.innerHTML = `
    <div id="proc-ansicht">
      <div class="view-toolbar">
        <button class="btn btn-sm btn-ghost" onclick="initProzesse()">← Zurück zur Liste</button>
        ${herkunft ? `<button class="btn btn-sm btn-ghost" onclick="procZurueck()"
          title="Zurück in das Modell, das diesen Unterprozess einbindet">↰ Zurück zu „${esc(herkunft.title)}"</button>` : ''}
        <div class="toolbar-spacer"></div>
        ${canWrite ? `<button class="btn btn-primary btn-sm" onclick="openProcessEditor('${esc(itemId)}')"
          title="Im Modeler ändern">✎ Bearbeiten</button>` : ''}
      </div>
      <div class="pa-karte">
        <div class="pa-kopf">
          <div class="pa-kopf-text">
            <h2>🔀 ${esc(proc.title)}</h2>
            <p class="pa-lead" id="pa-lead">Modell wird geladen …</p>
            <div class="pa-chips" id="pa-chips"></div>
          </div>
          <div class="pa-aktionen">
            <button type="button" onclick="procAnsichtAktion('in')" title="Vergrößern">＋</button>
            <button type="button" onclick="procAnsichtAktion('out')" title="Verkleinern">－</button>
            <button type="button" onclick="procAnsichtAktion('fit')" title="Ganzes Diagramm zeigen">⤢ Einpassen</button>
            <button type="button" onclick="procAnsichtAktion('voll')" title="Vollbild, Esc beendet">⛶ Vollbild</button>
            <button type="button" onclick="procAnsichtAktion('svg')" title="Farbiges Bild für Word, PowerPoint und Regelwerke">🖼 Bild</button>
            <button type="button" class="dl" onclick="procAnsichtAktion('bpmn')" title="Die BPMN-Datei, unverändert">⬇ BPMN</button>
          </div>
        </div>
        <div class="pa-kennzahlen" id="pa-kennzahlen"></div>
        <div class="pa-ansichten" id="pa-ansichten"></div>
        <div class="pa-box" id="pa-box">
          <div id="bpmn-canvas"></div>
          <div class="pa-hint">Ziehen verschiebt · Strg + Mausrad zoomt · ⊞ öffnet den Unterprozess · Klick auf Schritt oder Befund zeigt die Stelle</div>
        </div>
        ${_procLegendeHtml()}
        <div class="pa-unten">
          <div>
            <h4 class="pa-titel">Schritt für Schritt</h4>
            <div id="pa-schritte"><div class="field-hint">Wird gelesen …</div></div>
          </div>
          <div class="pa-seite">
            <h4 class="pa-titel">Was auffällt</h4>
            <div id="pa-befunde"><div class="field-hint">Wird geprüft …</div></div>
            <div id="pa-stellschrauben"></div>
            <div id="pa-notfall"></div>
          </div>
        </div>
      </div>
    </div>`;

  const nochDa = () => _procAnsicht && !!document.getElementById('proc-ansicht')
    && _procEditing && String(_procEditing.itemId) === String(itemId);
  const lead = (html) => { const el = document.getElementById('pa-lead'); if (el) el.innerHTML = html; };
  try { await _ensureBpmnLib(); } catch (e) { lead(`<span style="color:#b91c1c">${esc(e.message)}</span>`); return; }
  let xml = '';
  try { xml = await spGetProcessXml(itemId); }
  catch (e) { lead(`<span style="color:#b91c1c">Modell nicht lesbar: ${esc(e.message)}</span>`); return; }
  // Wer inzwischen woanders hingeklickt hat, bekommt kein Diagramm untergeschoben.
  if (!nochDa()) return;
  if (!/<(bpmn:)?definitions[\s>]/i.test(String(xml || ''))) {
    lead('Die Datei enthält kein BPMN. „✎ Bearbeiten" lädt ein leeres Diagramm, Speichern repariert die Datei.');
    return;
  }
  _procAnsichtXml = xml;
  _bpmnModeler = new BpmnJS({ container: '#bpmn-canvas' });
  _procLesemodus(_bpmnModeler);
  try { await _bpmnModeler.importXML(xml); }
  catch (e) { lead(`<span style="color:#b91c1c">Diagramm konnte nicht geladen werden: ${esc(e.message)}</span>`); return; }
  _procFaerben();
  _procBoxHoehe();
  _procBuehneNeu(true);

  const ids = _parsePolicyIds(xml);
  _procDocs = _parseProcessDocs(xml);
  _procAblauf = prozessAblauf(xml);
  _procBefunde = prozessSchemaPruefen(xml, { policyIds: ids });
  lead(esc(_procLead(xml, _procAblauf)));
  const setze = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  setze('pa-chips', _procChipsHtml(proc, ids, _procDocs));
  setze('pa-kennzahlen', _procKennzahlenHtml(_procAblauf));
  setze('pa-schritte', _procSchritteHtml(_procAblauf, _procBefunde));
  setze('pa-befunde', _procBefundeHtml(_procBefunde, {}));
  setze('pa-stellschrauben', _procStellschraubenHtml(_procAblauf));
  _procBefundeMarkieren(_procBefunde);
  procSprungMarker();
  procUnterMarker();
  _procAnsichtenLeiste(itemId, herkunft);
  try { _bpmnModeler.get('eventBus').on('selection.changed', (e) => _procAuswahlSpiegeln(e && e.newSelection)); }
  catch (e) { /* dann ohne Rückmeldung in den Listen */ }

  // Die Landkarte weiß, an welcher Kachel das Modell hängt und wie es um BIA
  // und Notfallplan steht. Sie ist gecacht; beim ersten Mal kommt sie nach.
  const notfall = () => { if (nochDa()) { setze('pa-notfall', _procNotfallHtml(itemId)); procSprungMarker(); } };
  if (typeof lkDatenLaden === 'function') lkDatenLaden().then(notfall).catch(notfall);
  else notfall();
  // Die Namen der eingebundenen Modelle stehen in deren Dateien.
  procEintraegeLaden().then(() => { if (nochDa()) { procUnterMarker(); _procAnsichtenLeiste(itemId, herkunft); } }).catch(() => {});
}

/** Aus dem Editor zurück in die Ansicht. */
async function procZurAnsicht() {
  const id = _procEditing && _procEditing.itemId;
  if (!id) return;
  if (_procUngespeichert() && typeof uiConfirm === 'function') {
    const weiter = await uiConfirm(
      'Im Diagramm gibt es ungespeicherte Änderungen. Die Ansicht zeigt den gespeicherten Stand, vorher „💾 Speichern".',
      { title: 'Zur Ansicht wechseln?', okLabel: 'Trotzdem wechseln' });
    if (!weiter) return;
  }
  // Das Vollbild des Editors liegt über allem und bliebe sonst über der Ansicht stehen.
  if (_procVoll) await prozessVollbildUmschalten(false);
  await openProcessAnsicht(id);
}

/**
 * In der Ansicht wird gelesen, nicht gebaut: Verschieben, Verbinden,
 * Umbenennen und Größe ändern sind aus. Verschieben der Fläche und Zoomen
 * bleiben. Eine Rückgabe `false` bricht die jeweilige Geste ab.
 */
function _procLesemodus(modeler) {
  let bus;
  try { bus = modeler.get('eventBus'); } catch (e) { return; }
  ['shape.move.start', 'connection.move.start', 'connectionSegment.move.start', 'bendpoint.move.start',
   'resize.start', 'create.start', 'connect.start', 'global-connect.start', 'spaceTool.selection.start',
   'element.dblclick']
    .forEach(ev => bus.on(ev, 10000, () => false));
}

/* ── Farben ──
   Aus PROZESS_ARTEN (js/prozessschema.js) als Stilregeln gebaut: eine Tabelle,
   aus der Diagramm, Chips, Legende und Bild-Export ihre Farben nehmen. */
function _procFarbStil() {
  if (typeof document === 'undefined' || !document.head || document.getElementById('pa-farben')) return;
  if (typeof PROZESS_ARTEN === 'undefined') return;
  const regeln = [];
  for (const [k, a] of Object.entries(PROZESS_ARTEN)) {
    const sel = (t) => `.djs-element.pa-art-${k} > .djs-visual > ${t}`;
    regeln.push(`${sel('rect')}, ${sel('circle')}, ${sel('polygon')} { fill: ${a.fill} !important; stroke: ${a.stroke} !important; }`);
    regeln.push((k === 'frage' || k === 'parallel')
      ? `${sel('path')} { fill: ${a.stroke} !important; stroke: ${a.stroke} !important; }`
      : `${sel('path')} { stroke: ${a.stroke} !important; }`);
  }
  const st = document.createElement('style');
  st.id = 'pa-farben';
  st.textContent = regeln.join('\n');
  document.head.appendChild(st);
}

const _PROC_FARB_MARKER = () => Object.keys(typeof PROZESS_ARTEN !== 'undefined' ? PROZESS_ARTEN : {}).map(k => 'pa-art-' + k);

/** Jedes Element bekommt die Farbe seiner Art, jede zweite Bahn einen Hauch Grau. */
function _procFaerben() {
  if (!_bpmnModeler || typeof prozessArt !== 'function') return;
  let reg, canvas;
  try { reg = _bpmnModeler.get('elementRegistry'); canvas = _bpmnModeler.get('canvas'); } catch (e) { return; }
  const marker = _PROC_FARB_MARKER();
  let bahn = 0;
  reg.getAll().forEach(el => {
    if (!el.businessObject || el.type === 'label' || el.labelTarget) return;
    marker.concat(['pa-bahn-0', 'pa-bahn-1']).forEach(m => canvas.removeMarker(el.id, m));
    const t = String(el.type || '').replace(/^bpmn:/, '');
    if (t === 'Lane') { canvas.addMarker(el.id, 'pa-bahn-' + (bahn++ % 2)); return; }
    const art = prozessArt(t.charAt(0).toLowerCase() + t.slice(1), el.businessObject.name);
    if (art) canvas.addMarker(el.id, 'pa-art-' + art);
  });
}
function _procFaerbenBald() {
  clearTimeout(_procFarbTimer);
  _procFarbTimer = setTimeout(() => { if (_bpmnModeler) _procFaerben(); }, 250);
}
function _procNachpruefenBald() {
  if (_procAnsicht) return;
  clearTimeout(_procPruefTimer);
  _procPruefTimer = setTimeout(() => { if (_bpmnModeler && !_procAnsicht) prozessSchemaPruefung(true); }, 900);
}

/* ── Befunde: rechts als Tabelle, im Diagramm als Rahmen und Plakette ── */

/**
 * Die Befunde der Hausschema-Prüfung als Tabelle, gebaut wie „Worauf das Tool
 * achtet" auf der Prozessseite der E-Rechnung: links die Einstufung als
 * farbiger Chip, rechts der Satz. Eine Zeile mit Element springt beim Klick
 * dorthin. `kompakt` lässt die Begründungen weg (Editor, schmale Spalte).
 */
function _procBefundeHtml(r, opt) {
  const o = opt || {};
  const fehler = (r && r.fehler) || [], hinweise = (r && r.hinweise) || [];
  const zahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;
  const kopf = `<div class="pa-befund-kopf">${fehler.length
      ? `<span class="pa-chip t-err">${zahl(fehler.length, 'Verstoß', 'Verstöße')}</span>`
      : '<span class="pa-chip t-ok">✓ Hausschema erfüllt</span>'}${
      hinweise.length ? `<span class="pa-chip t-warn">${zahl(hinweise.length, 'Hinweis', 'Hinweise')}</span>` : ''}</div>`;
  if (!fehler.length && !hinweise.length) {
    return kopf + (o.kompakt ? '' : '<p class="pa-note">Das Modell beantwortet ohne Rückfrage, wer zuständig ist, was automatisch läuft und wie die Sache ausgeht.</p>');
  }
  const regeln = (typeof PROZESS_REGELN !== 'undefined') ? PROZESS_REGELN : [];
  const chip = (art) => `<span class="pa-chip ${art === 'f' ? 't-err' : 't-warn'}">${art === 'f' ? 'Verstoß' : 'Hinweis'}</span>`;
  const zeile = (art, f) => {
    const regel = regeln.find(x => x.id === f.regel);
    const klick = f.id
      ? ` class="pa-klick" data-befund="${esc(f.id)}" onclick="procStelleZeigen('${esc(f.id)}')" title="Stelle im Diagramm zeigen"` : '';
    return `<tr${klick}><td>${chip(art)}</td>
      <td><b>${esc(f.regel)}</b> ${esc(f.text)}${regel && !o.kompakt ? `<div class="pa-warum">${esc(regel.warum)}</div>` : ''}</td></tr>`;
  };
  // Ab drei Befunden derselben Regel eine Zeile: die Regel einmal, die Stellen
  // als Chips. Sieben Mal derselbe Satz liest niemand bis zum Ende.
  const buendel = (art, gruppe) => {
    const regel = regeln.find(x => x.id === gruppe[0].regel);
    return `<tr><td>${chip(art)}</td>
      <td><b>${esc(gruppe[0].regel)}</b> ${esc(regel ? regel.text : gruppe[0].text)} <b>${gruppe.length} Stellen:</b>
        <div class="pa-chips" style="margin-top:6px">${gruppe.map(f => f.id
          ? `<span class="pa-chip pa-rolle" data-befund="${esc(f.id)}" style="cursor:pointer" onclick="procStelleZeigen('${esc(f.id)}')" title="${esc(f.text)}">${esc(f.name || f.id)}</span>`
          : `<span class="pa-chip pa-rolle" title="${esc(f.text)}">${esc(f.name || '?')}</span>`).join('')}</div>
        ${regel && !o.kompakt ? `<div class="pa-warum">${esc(regel.warum)}</div>` : ''}</td></tr>`;
  };
  const zeilen = (art, liste) => {
    const nachRegel = new Map();
    liste.forEach(f => { if (!nachRegel.has(f.regel)) nachRegel.set(f.regel, []); nachRegel.get(f.regel).push(f); });
    return [...nachRegel.values()].map(g => g.length >= 3 ? buendel(art, g) : g.map(f => zeile(art, f)).join('')).join('');
  };
  return kopf + `<table class="pa-regeln">${zeilen('f', fehler)}${zeilen('h', hinweise)}</table>`
    + (hinweise.length && !o.kompakt ? '<p class="pa-note">Hinweise dürfen begründet übergangen werden, Verstöße nicht.</p>' : '');
}

/** Rahmen und Plakette an jedem Element mit Befund. */
function _procBefundeMarkieren(r) {
  if (!_bpmnModeler) return;
  let reg, canvas, overlays;
  try { reg = _bpmnModeler.get('elementRegistry'); canvas = _bpmnModeler.get('canvas'); overlays = _bpmnModeler.get('overlays'); }
  catch (e) { return; }
  try { overlays.remove({ type: PROC_BEFUND_TYP }); } catch (e) { /* noch keine */ }
  reg.getAll().forEach(el => { canvas.removeMarker(el.id, 'pa-fehler'); canvas.removeMarker(el.id, 'pa-hinweis'); });
  const je = {};
  const merke = (art) => (f) => { if (!f.id) return; (je[f.id] = je[f.id] || { f: [], h: [] })[art].push(f); };
  ((r && r.fehler) || []).forEach(merke('f'));
  ((r && r.hinweise) || []).forEach(merke('h'));
  Object.entries(je).forEach(([id, b]) => {
    if (!reg.get(id)) return;
    const alle = b.f.concat(b.h);
    canvas.addMarker(id, b.f.length ? 'pa-fehler' : 'pa-hinweis');
    try {
      overlays.add(id, PROC_BEFUND_TYP, {
        position: reg.get(id).waypoints ? { top: -10, left: -10 } : { bottom: 10, right: 12 },
        html: `<div class="pa-plakette ${b.f.length ? 'f' : 'h'}" onclick="procStelleZeigen('${esc(id)}')"
                 title="${esc(alle.map(x => x.regel + ' ' + x.text).join('\n'))}">⚠ ${esc([...new Set(alle.map(x => x.regel))].join(' '))}</div>`,
      });
    } catch (e) { /* Element ohne Darstellung */ }
  });
}

/** Die Stelle eines Elements zeigen: in die Mitte holen, auswählen, kurz aufleuchten lassen. */
function procStelleZeigen(id) {
  if (!_bpmnModeler || !id) return;
  let reg, canvas;
  try { reg = _bpmnModeler.get('elementRegistry'); canvas = _bpmnModeler.get('canvas'); } catch (e) { return; }
  const el = reg.get(id);
  if (!el) { toast('Diese Stelle gibt es im Diagramm nicht mehr. Bitte neu prüfen.', 'error'); return; }
  const box = document.getElementById(_procAnsicht ? 'pa-box' : 'bpmn-canvas');
  if (box && box.scrollIntoView && !document.fullscreenElement) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const xs = el.waypoints ? el.waypoints.map(p => p.x) : [el.x, el.x + (el.width || 0)];
  const ys = el.waypoints ? el.waypoints.map(p => p.y) : [el.y, el.y + (el.height || 0)];
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const vb = canvas.viewbox();
  const skala = Math.min(Math.max(vb.scale || 1, 0.85), 1.2);
  const w = vb.outer.width / skala, h = vb.outer.height / skala;
  canvas.viewbox({ x: cx - w / 2, y: cy - h / 2, width: w, height: h });
  try { _bpmnModeler.get('selection').select(el); } catch (e) { /* ohne Auswahl */ }
  canvas.addMarker(id, 'pa-blink');
  setTimeout(() => { try { canvas.removeMarker(id, 'pa-blink'); } catch (e) { /* Modeler fort */ } }, 2600);
}

/** Klick ins Diagramm: den passenden Schritt und Befund markieren. */
function _procAuswahlSpiegeln(auswahl) {
  const ids = new Set((auswahl || []).map(el => (el.labelTarget || el).id));
  document.querySelectorAll('[data-schritt],[data-befund]').forEach(n => {
    n.classList.toggle('pa-aktiv', ids.has(n.getAttribute('data-schritt') || n.getAttribute('data-befund')));
  });
}

/* ── Die Teile der Seite ── */

function _procArtChip(k) {
  const arten = (typeof PROZESS_ARTEN !== 'undefined') ? PROZESS_ARTEN : {};
  const a = arten[k] || arten.ohne || { fill: '#fff', stroke: '#8A8F98', symbol: '', titel: k };
  return `<span class="pa-chip" style="background:${a.fill};border-color:${a.stroke};color:${a.stroke}">${a.symbol} ${esc(a.titel)}</span>`;
}

/** Der Satz unter dem Titel: die Beschreibung aus dem Modell, sonst ein erzeugter. */
function _procLead(xml, a) {
  const m = String(xml || '').match(/<bpmn:process\b[^>]*>\s*<bpmn:documentation>([\s\S]*?)<\/bpmn:documentation>/);
  const roh = (m ? m[1] : '').replace(/&#(\d+);/g, (x, n) => String.fromCharCode(Number(n)));
  const text = _xmlUnesc(roh).split('\n').map(z => z.trim())
    .filter(z => z && !/^\[\[rms:/.test(z) && !/^(Im Einklang mit den Richtlinien|Hinterlegte Dokumente):/.test(z))
    .join(' ').trim();
  if (text) return text;
  const schritte = (a && a.schritte) || [];
  const start = schritte.find(s => s.art === 'start');
  const enden = schritte.filter(s => s.art === 'ende' || s.art === 'abbruch').map(s => s.name).filter(Boolean);
  const rollen = [...new Set(schritte.map(s => s.bahn).filter(Boolean))];
  if (!start) return 'Das Modell hat noch keinen Auslöser.';
  const zitat = (s) => '„' + s + '"';
  return `Beginnt mit ${zitat(start.name || 'Start')}${enden.length
      ? ` und endet ${enden.length === 1 ? 'mit ' + zitat(enden[0]) : 'in einem von ' + enden.length + ' Ergebnissen: ' + enden.map(zitat).join(', ')}` : ''}.${
    rollen.length ? ' Beteiligt: ' + rollen.join(', ') + '.' : ''}`;
}

function _procChipsHtml(proc, ids, docs) {
  const teile = [`<span class="pa-chip pa-rolle">${proc.ordner ? '🏭 ' + esc(_procWerkLabel(proc)) : '📄 ohne Werk'}</span>`];
  const pols = (typeof State !== 'undefined' && State.policies) || [];
  (ids || []).forEach(id => {
    const p = pols.find(x => String(x.id) === String(id));
    teile.push(`<span class="pa-chip pa-regelwerk"${typeof openDetail === 'function'
      ? ` onclick="openDetail('${esc(id)}')" style="cursor:pointer" title="Regelwerk öffnen"` : ''}>📘 ${esc(p ? p.title : 'Richtlinie ' + id)}</span>`);
  });
  if (!(ids || []).length) teile.push('<span class="pa-chip t-warn">keine Richtlinie verknüpft</span>');
  (docs || []).forEach(d => teile.push(d.url
    ? `<a class="pa-chip pa-regelwerk" href="${esc(d.url)}" target="_blank" rel="noopener">📎 ${esc(d.name)}</a>`
    : `<span class="pa-chip pa-regelwerk">📎 ${esc(d.name)}</span>`));
  return teile.join('');
}

function _procKennzahlenHtml(a) {
  const z = (a && a.zahlen) || {};
  const k = (wert, text, titel) => `<span class="pa-kz"${titel ? ` title="${esc(titel)}"` : ''}><b>${esc(String(wert))}</b> ${esc(text)}</span>`;
  const plural = (n, eins, viele) => (n === 1 ? eins : viele);
  return [
    k(z.schritte || 0, 'Schritte'),
    k(z.bahnen || 0, plural(z.bahnen, 'Rolle', 'Rollen')),
    k(z.mensch || 0, '👤 Mensch'),
    k(z.automatik || 0, '⚙ Automatik'),
    z.handgriff ? k(z.handgriff, '✋ Handgriff') : '',
    z.unter ? k(z.unter, '⊞ ' + plural(z.unter, 'Unterprozess', 'Unterprozesse')) : '',
    k(z.entscheidungen || 0, plural(z.entscheidungen, 'Entscheidung', 'Entscheidungen')),
    k(z.uebergaben || 0, plural(z.uebergaben, 'Übergabe', 'Übergaben'), 'Wechsel zwischen Rollen'),
    k((z.automatikQuote || 0) + ' %', 'automatisch', 'Anteil der Aufgaben, die ohne Zutun laufen'),
  ].join('');
}

/** Oben die Wege: zurück ins einbindende Modell, hinein in die eingebundenen. */
function _procAnsichtenLeiste(itemId, herkunft) {
  const host = document.getElementById('pa-ansichten');
  if (!host) return;
  let unter = [];
  try { unter = procUnterElemente().map(el => ({ el, id: String(procElementModell(el)) })); } catch (e) { /* ohne */ }
  const eindeutig = [...new Map(unter.map(x => [x.id, x])).values()];
  if (!herkunft && !eindeutig.length) { host.innerHTML = ''; return; }
  const eigen = procModellVon(itemId);
  host.innerHTML = `<span>Ansicht:</span>
    ${herkunft ? `<button type="button" onclick="procZurueck()" title="Zurück in das einbindende Modell">↰ ${esc(herkunft.title)}</button>` : ''}
    <button type="button" class="active">${esc(eigen ? eigen.title : 'Dieses Modell')}</button>
    ${eindeutig.map(x => {
      const m = procModellVon(x.id);
      const name = m ? m.title : ((x.el.businessObject && x.el.businessObject.name) || 'Unterprozess');
      return `<button type="button" onclick="procUnterprozessOeffnen('${esc(x.id)}')"
        title="${m ? 'Unterprozess öffnen' : 'Das eingebundene Modell gibt es nicht mehr'}">↳ ${esc(name)}</button>`;
    }).join('')}`;
}

function _procLegendeHtml() {
  const offen = _procGemerkt(PROC_LEGENDE_SPEICHER, false);
  return `<details class="pa-legende"${offen ? ' open' : ''} ontoggle="_procMerken('${PROC_LEGENDE_SPEICHER}', this.open)">
    <summary>🎨 So lesen Sie das Diagramm</summary>
    <div class="pa-legende-inhalt">
      <div><h5>Wer oder was handelt</h5><div class="pa-chips">${
        ['mensch', 'automatik', 'handgriff', 'unter', 'frage', 'parallel', 'warten'].map(_procArtChip).join('')}</div></div>
      <div><h5>Wie es beginnt und ausgeht</h5><div class="pa-chips">${['start', 'ende', 'abbruch'].map(_procArtChip).join('')}</div></div>
      <div><h5>Befunde und Wege</h5><div class="pa-chips">
        <span class="pa-chip t-err">Rahmen rot: Verstoß</span><span class="pa-chip t-warn">Rahmen gestrichelt: Hinweis</span>
        <span class="pa-chip pa-rolle">Bahn: eine Rolle</span>
        <span class="pa-chip" style="background:#1A2644;border-color:#1A2644;color:#fff">⊞ Unterprozess öffnen</span>
        <span class="pa-chip" style="background:#17509E;border-color:#17509E;color:#fff">↦ weiter in anderen Prozess</span></div></div>
    </div></details>`;
}

/** Links: der Ablauf als nummerierte Liste. */
function _procSchritteHtml(a, befunde) {
  const schritte = (a && a.schritte) || [];
  if (!schritte.length) return '<p class="pa-note">Das Modell ist leer.</p>';
  const arten = (typeof PROZESS_ARTEN !== 'undefined') ? PROZESS_ARTEN : {};
  const je = {};
  const merke = (art) => (f) => { if (f.id) (je[f.id] = je[f.id] || { f: [], h: [] })[art].push(f.regel); };
  ((befunde && befunde.fehler) || []).forEach(merke('f'));
  ((befunde && befunde.hinweise) || []).forEach(merke('h'));
  return `<ol class="pa-schritte">${schritte.map(s => {
    const a2 = arten[s.art] || arten.ohne || { stroke: '#8A8F98' };
    const b = je[s.id];
    const weiter = (s.aus.length > 1 || (s.aus.length === 1 && s.aus[0].nachNr !== s.nr + 1))
      ? `<div class="pa-weiter">${s.aus.map(o => `${o.label ? esc(o.label) + ': ' : ''}weiter mit ${o.nachNr}${
          o.nachNr !== s.nr + 1 && o.nachName ? ' (' + esc(o.nachName) + ')' : ''}`).join(' · ')}</div>` : '';
    return `<li data-schritt="${esc(s.id)}" onclick="procStelleZeigen('${esc(s.id)}')"${s.unerreichbar ? ' class="pa-lose"' : ''}>
      <span class="pa-nr" style="background:${a2.stroke}">${s.nr}</span>
      <div>
        <div class="pa-schritt-kopf">${_procArtChip(s.art)}${s.bahn ? `<span class="pa-chip pa-rolle">${esc(s.bahn)}</span>` : ''}${
          b ? `<span class="pa-chip ${b.f.length ? 't-err' : 't-warn'}" title="Befund im Hausschema">⚠ ${esc([...new Set(b.f.concat(b.h))].join(' '))}</span>` : ''}</div>
        <div class="pa-schritt-text">${esc(s.name || '(ohne Namen)')}</div>
        ${s.uebergabeVon ? `<div class="pa-uebergabe">↪ Übergabe von ${esc(s.uebergabeVon)}</div>` : ''}
        ${s.unerreichbar ? '<div class="pa-uebergabe">Vom Auslöser aus nicht erreichbar</div>' : ''}
        ${weiter}
      </div></li>`;
  }).join('')}</ol>`;
}

/** Rechts unter den Befunden: wo ein Prozess sich verbessern lässt. */
function _procStellschraubenHtml(a) {
  if (!a || !a.schritte || !a.schritte.length) return '';
  const z = a.zahlen, zeilen = [];
  if (a.uebergaben.length) {
    const paare = [...new Map(a.uebergaben.map(u => [u.vonBahn + ' → ' + u.nachBahn, u])).entries()];
    zeilen.push(`<tr><td><span class="pa-chip t-plan">${a.uebergaben.length} ${a.uebergaben.length === 1 ? 'Übergabe' : 'Übergaben'}</span></td>
      <td>An jeder Übergabe wartet der Vorgang auf eine andere Rolle. Hier geht er am ehesten verloren oder bleibt liegen.
        <div class="pa-chips" style="margin-top:6px">${paare.map(([text, u]) =>
          `<span class="pa-chip pa-rolle" data-befund="${esc(u.id)}" style="cursor:pointer" onclick="procStelleZeigen('${esc(u.id)}')" title="Im Diagramm zeigen">${esc(text)}</span>`).join('')}</div></td></tr>`);
  }
  const aufgaben = z.mensch + z.automatik + z.handgriff;
  if (aufgaben) {
    zeilen.push(`<tr><td><span class="pa-chip ${z.automatikQuote >= 50 ? 't-ok' : 't-plan'}">${z.automatikQuote} % automatisch</span></td>
      <td>${z.automatik} von ${aufgaben} Aufgaben laufen ohne Zutun.${z.handgriff
        ? ` ${z.handgriff} ${z.handgriff === 1 ? 'Handgriff läuft' : 'Handgriffe laufen'} ganz ohne System, dort entsteht kein Nachweis.` : ''}</td></tr>`);
  }
  if (z.entscheidungen) {
    zeilen.push(`<tr><td><span class="pa-chip t-gate">${z.entscheidungen} ${z.entscheidungen === 1 ? 'Entscheidung' : 'Entscheidungen'}</span></td>
      <td>${z.ergebnisse} ${z.ergebnisse === 1 ? 'mögliches Ergebnis' : 'mögliche Ergebnisse'}. Jede Entscheidung braucht eine Regel, wer sie trifft und wonach.</td></tr>`);
  }
  return zeilen.length ? `<h4 class="pa-titel" style="margin-top:16px">Stellschrauben</h4><table class="pa-regeln">${zeilen.join('')}</table>` : '';
}

/** Die Kacheln der Landkarte, an denen dieses Modell hängt. */
function _procKachelnMitModell(itemId) {
  const out = [];
  if (typeof _lkDaten === 'undefined' || !_lkDaten || !_lkDaten.karten || typeof lkProzesseVon !== 'function') return out;
  for (const [werk, karte] of Object.entries(_lkDaten.karten)) {
    for (const kachel of (karte.kacheln || [])) {
      let modelle = [];
      try { modelle = lkProzesseVon(kachel, werk); } catch (e) { continue; }
      if (modelle.some(m => String(m.itemId) === String(itemId))) out.push({ werk, kachel });
    }
  }
  return out;
}

/** Rechts ganz unten: Kachel, BIA und Notfallplan zu diesem Ablauf. */
function _procNotfallHtml(itemId) {
  const titel = '<h4 class="pa-titel" style="margin-top:16px">Landkarte und Notfall</h4>';
  const treffer = _procKachelnMitModell(itemId);
  if (!treffer.length) {
    return titel + '<p class="pa-note">Dieses Modell hängt an keiner Kachel der Landkarte. Ohne Kachel gibt es für den Ablauf keine Business-Impact-Analyse und keinen Notfallplan.</p>';
  }
  const zeilen = treffer.map(({ werk, kachel }) => {
    const b = (typeof nfBcmVon === 'function') ? nfBcmVon(kachel) : (kachel.bcm || {});
    const krit = b.kritikalitaet || '';
    const chip = krit === 'hoch' ? 't-err' : krit === 'mittel' ? 't-warn' : krit === 'niedrig' ? 't-ok' : 't-plan';
    let luecken = 0;
    try {
      if (krit && typeof nfPruefung === 'function' && typeof _nfKontext === 'function') luecken = (nfPruefung(kachel, _nfKontext(werk)).fehler || []).length;
    } catch (e) { /* dann ohne Zählung */ }
    const rto = (b.rto !== '' && b.rto != null && typeof nfDauerText === 'function') ? nfDauerText(b.rto) : '';
    const plan = b.plan && String(b.plan.sofort || '').trim();
    const teile = [];
    if (rto) teile.push('RTO ' + rto);
    if (krit) teile.push(plan ? 'Notfallplan vorhanden' : 'kein Notfallplan');
    if (luecken) teile.push(luecken + (luecken === 1 ? ' Lücke' : ' Lücken') + ' im Notfallplan');
    return `<tr class="pa-klick" onclick="switchView('notfall')" title="Im Reiter Notfall ansehen">
      <td><span class="pa-chip ${chip}">${krit ? 'Kritikalität ' + esc(krit) : 'ohne BIA'}</span></td>
      <td><b>${esc(typeof lkWerkLabel === 'function' ? lkWerkLabel(werk) : werk)}</b>: ${esc(kachel.name)}${
        teile.length ? `<div class="pa-warum">${esc(teile.join(' · '))}</div>` : ''}</td></tr>`;
  }).join('');
  return titel + `<table class="pa-regeln">${zeilen}</table>`;
}

/* ── Aktionen der Ansicht ── */

/**
 * Die Fläche so hoch wie das Modell: Ein flacher, breiter Ablauf bekommt
 * keine leere Wiese unter sich, ein hoher mit vielen Bahnen seinen Platz.
 * Grenzen: 320 px und 70 % des Fensters.
 */
function _procBoxHoehe() {
  const box = document.getElementById('pa-box');
  if (!box || !_bpmnModeler) return;
  let inner;
  try { inner = _bpmnModeler.get('canvas').viewbox().inner; } catch (e) { return; }
  if (!inner || !inner.width || !inner.height || !box.clientWidth) return;
  const hoch = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 900;
  const soll = Math.round(box.clientWidth * inner.height / inner.width) + 70;
  box.style.height = Math.max(320, Math.min(soll, Math.round(hoch * 0.7))) + 'px';
}

function procAnsichtAktion(act) {
  if (!_bpmnModeler) return;
  let canvas;
  try { canvas = _bpmnModeler.get('canvas'); } catch (e) { return; }
  if (act === 'in') canvas.zoom(canvas.zoom() * 1.25);
  else if (act === 'out') canvas.zoom(canvas.zoom() / 1.25);
  else if (act === 'fit') _procBuehneNeu(true);
  else if (act === 'voll') _procAnsichtVollbild();
  else if (act === 'svg') _procAnsichtBild();
  else if (act === 'bpmn') _procAnsichtDatei();
}

async function _procAnsichtVollbild(an) {
  const box = document.getElementById('pa-box');
  if (!box) return;
  const ziel = (an === undefined) ? !box.classList.contains('pa-voll') : !!an;
  box.classList.toggle('pa-voll', ziel);
  try {
    if (ziel && !document.fullscreenElement && box.requestFullscreen) await box.requestFullscreen();
    if (!ziel && document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch (e) { /* dann bleibt es bei der Überlagerung */ }
  _procBuehneNeu(true);
}

/** Der Dateiname aus dem Titel des Modells. */
function _procDateiName() {
  const m = _procEditing && procModellVon(_procEditing.itemId);
  return String((m && m.title) || (_procEditing && _procEditing.origName) || 'prozess').replace(/\.bpmn$/i, '').trim() || 'prozess';
}

/**
 * Die Datei, wie sie geladen wurde. Bewusst nicht über downloadProcessXml():
 * Das schreibt vorher die Richtlinien aus dem Auswahlfeld des Editors ins
 * Modell, und in der Ansicht gibt es dieses Feld nicht. Die Verknüpfungen
 * wären im Download dann leer.
 */
function _procAnsichtDatei() {
  if (!_procAnsichtXml) return;
  const blob = new Blob([_procAnsichtXml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = _procDateiName() + '.bpmn';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Die Farben ins Bild schreiben. Im Browser kommen sie aus Stilregeln, die
 * eine SVG-Datei nicht mitnimmt; Word und PowerPoint sähen sonst ein
 * schwarz-weißes Diagramm. Deshalb bekommt jede Form ihre Farbe direkt.
 */
function _procSvgFaerben(svg) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined' || typeof PROZESS_ARTEN === 'undefined') return svg;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  doc.querySelectorAll('g.djs-element').forEach(g => {
    const cls = g.getAttribute('class') || '';
    const visual = [...g.children].find(n => /\bdjs-visual\b/.test(n.getAttribute('class') || ''));
    if (!visual) return;
    if (/\bpa-bahn-1\b/.test(cls)) { const r = visual.querySelector('rect'); if (r) r.style.fill = '#F6F8FB'; }
    const m = cls.match(/\bpa-art-([a-z]+)\b/);
    const a = m && PROZESS_ARTEN[m[1]];
    if (!a) return;
    [...visual.children].forEach(n => {
      const tag = n.tagName.toLowerCase();
      if (tag === 'rect' || tag === 'circle' || tag === 'polygon') { n.style.fill = a.fill; n.style.stroke = a.stroke; }
      else if (tag === 'path') {
        n.style.stroke = a.stroke;
        if (m[1] === 'frage' || m[1] === 'parallel') n.style.fill = a.stroke;
      }
    });
  });
  return new XMLSerializer().serializeToString(doc);
}

async function _procAnsichtBild() {
  if (!_bpmnModeler) return;
  try {
    const { svg } = await _bpmnModeler.saveSVG();
    const blob = new Blob([_procSvgFaerben(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = _procDateiName() + '.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Bild gespeichert ✓', 'success');
  } catch (e) { toast('Bild-Export fehlgeschlagen: ' + e.message, 'error'); }
}

/* Esc beendet das Vollbild des Browsers, ohne dass die Ansicht davon erfährt.
   Das Ereignis nimmt die Überlagerung dann mit zurück. */
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('fullscreenchange', () => {
    const box = document.getElementById('pa-box');
    if (box && !document.fullscreenElement && box.classList.contains('pa-voll')) _procAnsichtVollbild(false);
  });
  document.addEventListener('keydown', (e) => {
    const box = document.getElementById('pa-box');
    if (e.key === 'Escape' && box && box.classList.contains('pa-voll') && !document.fullscreenElement) _procAnsichtVollbild(false);
  });
}

/* ── Hausschema im Editor ── */

/** Die Bausteine als Legende – die Vorlage dort, wo modelliert wird. */
function prozessSchemaLegende() {
  const host = document.getElementById('proc-schema');
  if (!host || typeof PROZESS_BAUSTEINE === 'undefined') return;
  host.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.78rem">
      ${PROZESS_BAUSTEINE.map(b => `<span title="${esc(b.zweck)} · ${esc(b.benennung)}">
        <b style="font-size:.95rem">${b.symbol}</b> ${esc(b.titel)}</span>`).join('')}
    </div>
    <div class="field-hint" style="margin-top:6px">Noch nicht geprüft – „🔍 Schema" oben.</div>`;
}

/**
 * Das offene Modell gegen das Hausschema prüfen.
 *
 * @param {boolean} still – beim Öffnen: keine Erfolgsmeldung, nur der Kasten.
 */
async function prozessSchemaPruefung(still) {
  const host = document.getElementById('proc-schema');
  if (!host) return;
  if (typeof prozessSchemaPruefen !== 'function' || !_bpmnModeler) return;
  let xml = '';
  try { xml = (await _bpmnModeler.saveXML({ format: false })).xml; }
  catch (e) { host.innerHTML = `<span style="color:#b91c1c">Modell nicht lesbar: ${esc(e.message)}</span>`; return; }

  const ids = (typeof _selectedPolicyIds === 'function') ? _selectedPolicyIds() : null;
  const r = prozessSchemaPruefen(xml, ids ? { policyIds: ids } : {});
  _procBefunde = r;
  const zahlen = r.zahlen;
  host.innerHTML = `
    <div style="font-size:.8rem;color:var(--c-muted);margin-bottom:8px">
      ${zahlen.bahnen} Bahn(en) · 👤 ${zahlen.mensch} · ⚙ ${zahlen.automatik} · ✋ ${zahlen.handgriff}${
        zahlen.unterprozesse ? ` · ⊞ ${zahlen.unterprozesse}` : ''} · ${zahlen.fluesse} Verbindungen</div>
    ${_procBefundeHtml(r, { kompakt: true })}
    <div class="pa-note">Ein Klick auf eine Zeile zeigt die Stelle im Diagramm.</div>`;
  _procBefundeMarkieren(r);

  if (!still && typeof toast === 'function') {
    toast(r.fehler.length ? `${r.fehler.length} ${r.fehler.length === 1 ? 'Verstoß' : 'Verstöße'}, siehe „Hausschema"`
                          : 'Modell entspricht dem Hausschema ✓',
      r.fehler.length ? 'error' : 'success');
  }
}


/* ── Vollbild ──────────────────────────────────────────────────────────────
   Der Editor sitzt in der Ansicht, also innerhalb von Seitenleiste und
   Kopfzeile. Ein Ablauf läuft waagerecht; die Breite ist das Knappe.

   Vollbild heißt hier zweierlei, und beides zusammen: Der Editor legt sich
   über die Anwendung (das wirkt immer), und zusätzlich wird die echte
   Vollbild-Schnittstelle des Browsers gefragt (die darf ablehnen – dann bleibt
   es beim ersten). Wer nur eines von beiden baut, hat entweder die Browser-
   Leisten noch im Bild oder gar nichts, wenn der Browser nein sagt. */

const PROC_VOLL_SPEICHER = 'rms_proc_vollbild';
const PROC_SEITE_SPEICHER = 'rms_proc_seite';
let _procVoll = false;
let _procSeiteAn = true;

function _procMerken(schluessel, wert) {
  try { localStorage.setItem(schluessel, wert ? '1' : '0'); } catch (e) { /* Privatmodus */ }
}
function _procGemerkt(schluessel, standard) {
  try {
    const v = localStorage.getItem(schluessel);
    return v === null ? standard : v === '1';
  } catch (e) { return standard; }
}

/**
 * Die Zeichenfläche an ihre neue Größe anpassen.
 *
 * bpmn-js merkt eine Größenänderung des Behälters nicht von selbst – ohne
 * `resized()` zeichnet es weiter in den alten Kasten, und das Diagramm sitzt
 * dann halb außerhalb. Der Bildaufbau kommt erst nach dem Umschalten, deshalb
 * im nächsten Rahmen.
 */
function _procBuehneNeu(einpassen) {
  if (!_bpmnModeler) return;
  const tun = () => {
    try {
      const canvas = _bpmnModeler.get('canvas');
      canvas.resized();
      if (einpassen) canvas.zoom('fit-viewport');
    } catch (e) { /* Modeler gerade fort */ }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(tun));
  else setTimeout(tun, 60);
}

/** Angaben rechts ein- oder ausblenden. */
function prozessSeiteUmschalten(an) {
  const seite = document.getElementById('proc-seite');
  const btn = document.getElementById('proc-seite-btn');
  if (!seite) return;
  _procSeiteAn = (an === undefined) ? !_procSeiteAn : !!an;
  seite.style.display = _procSeiteAn ? '' : 'none';
  if (btn) {
    btn.textContent = _procSeiteAn ? '▤ Angaben' : '▤ Angaben zeigen';
    btn.classList.toggle('btn-primary', !_procSeiteAn);
    btn.classList.toggle('btn-outline', _procSeiteAn);
  }
  if (an === undefined) _procMerken(PROC_SEITE_SPEICHER, _procSeiteAn);
  _procBuehneNeu(true);
}

/** Vollbild an/aus. Ohne Angabe: umschalten. */
async function prozessVollbildUmschalten(an) {
  const box = document.getElementById('proc-editor');
  if (!box) return;
  const ziel = (an === undefined) ? !_procVoll : !!an;
  _procVoll = ziel;
  box.classList.toggle('proc-voll', ziel);

  const btn = document.getElementById('proc-voll-btn');
  if (btn) {
    btn.textContent = ziel ? '⤡ Vollbild beenden' : '⛶ Vollbild';
    btn.title = ziel ? 'Zurück in die Ansicht – oder Esc' : 'Ganzer Bildschirm – Esc beendet';
  }

  // Die echte Vollbild-Schnittstelle obendrauf. Sie darf ablehnen (Richtlinie,
  // eingebettete Seite); dann trägt die Überlagerung allein.
  try {
    if (ziel && !document.fullscreenElement && box.requestFullscreen) await box.requestFullscreen();
    if (!ziel && document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch (e) { /* dann eben nur die Überlagerung */ }

  // Im Vollbild gehört die Breite dem Diagramm; zurück in der Ansicht steht
  // wieder, was die Person zuletzt wollte.
  prozessSeiteUmschalten(ziel ? false : _procGemerkt(PROC_SEITE_SPEICHER, true));
  if (an === undefined) _procMerken(PROC_VOLL_SPEICHER, ziel);
  _procBuehneNeu(true);
}

/* Esc beendet das Vollbild des Browsers, ohne dass unser Knopf davon erfährt –
   danach stünde die Überlagerung ohne Vollbild da. Das Ereignis richtet beides
   wieder aneinander aus. */
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && _procVoll) prozessVollbildUmschalten(false);
  });
  // Esc, wenn gar kein echtes Vollbild lief (der Browser hat abgelehnt).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _procVoll && !document.fullscreenElement) prozessVollbildUmschalten(false);
  });
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
  if (!await uiConfirm(`„${d.name}" vom Prozess lösen? Die Datei selbst bleibt in der Bibliothek liegen.`,
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
  // Ein Name je Ordner: Dieselbe Datei ein zweites Mal anzulegen, überschriebe
  // die erste – und ein Unterprozess wird ohnehin einmal modelliert und dann
  // eingebunden. In einem anderen Werk darf der Name vorkommen (HOL/Vertrieb
  // und SHB/Vertrieb sind zwei Dateien).
  const werk = (document.getElementById('proc-werk') || {}).value || '';
  const alt = _procEditing || {};
  if (!_processes) { try { _processes = await spListProcesses(); } catch (e) { /* dann ohne Doppelprüfung */ } }
  const hier = procNamensDoppel(name, alt.itemId).find(p => (p.ordner || '') === werk);
  if (hier) {
    toast(`Ein Modell „${hier.title}" gibt es ${werk ? 'in ' + _procWerkLabel(hier) : 'hier'} schon – dort weiterarbeiten oder es als Unterprozess einbinden, statt es ein zweites Mal anzulegen.`, 'error');
    document.getElementById('proc-name')?.focus();
    return;
  }
  const btn = document.getElementById('proc-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '💾 Speichern …'; }
  try {
    _setProcessDoku(_selectedPolicyIds(), _procDocs);
    // Die Kennung darf kein anderes Modell tragen – also erst zu Ende lesen,
    // was die anderen heißen, falls das Hintergrund-Lesen noch läuft.
    if (_procLadeLauf) { try { await _procLadeLauf; } catch (e) { /* dann mit dem, was da ist */ } }
    const kennung = procKennungSichern();
    procUnterprozesseAbgleichen();
    const { xml } = await _bpmnModeler.saveXML({ format: true });
    const newFname = /\.bpmn$/i.test(name) ? name : name + '.bpmn';
    // Umbenennen oder in ein anderes Werk umziehen: erst die Datei selbst
    // verschieben – so behält sie ihre Kennung und alle Verknüpfungen aus
    // Landkarte und Mindmap überleben. (Ein Speichern unter neuem Namen würde
    // eine zweite Datei anlegen und die Verweise ins Leere laufen lassen.)
    if (alt.itemId && ((alt.origName && alt.origName !== newFname) || (alt.origWerk || '') !== werk)) {
      await spMoveProcess(alt.itemId, werk, newFname);
    }
    const saved = await spSaveProcess(name, xml, werk);
    _procEditing = { itemId: (saved && saved.id) || alt.itemId, origName: newFname, origWerk: werk };
    // Die Liste frisch halten – der Editor bleibt offen, und sein Kasten
    // „Unterprozess" liest daraus. Der Eintrag des eigenen Modells kommt aus
    // dem XML, das gerade geschrieben wurde.
    try { _processes = await spListProcesses(); } catch (e) { _processes = null; }
    const eigenes = procModellVon(_procEditing.itemId);
    if (eigenes) procLinksMerken(eigenes.itemId + '|' + eigenes.modified, procEintragAusXml(xml));
    _procDirty = false;
    const st = document.getElementById('proc-status');
    if (st) st.innerHTML = `<span style="color:#15803d">Gespeichert: ${esc(newFname)} ✓${
      kennung && kennung.neu !== kennung.alt ? ` · Kennung <code>${esc(kennung.neu)}</code> vergeben` : ''}</span>`;
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
  const p = policyZuId(id);
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
  const p = policyZuId(pid);
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
 * Freitext → Prozessschritte (Weiterleitung auf das Hausschema).
 *
 * Die Zerlegung wohnt in js/prozessschema.js, weil sie dort neben der
 * Beschreibung steht, die sie umsetzt. `role` heißt dort `bahn` – es ist
 * dasselbe, nur beim richtigen Namen genannt.
 */
function _parseSteps(text) {
  return prozessTextLesen(text).map(s => ({
    kind: s.kind === 'frage' ? 'decision' : s.kind === 'ende' || s.kind === 'start' ? 'event' : 'task',
    label: s.label, role: s.bahn || '', nein: s.nein || '',
  }));
}

/**
 * Freitext → BPMN nach Hausschema.
 *
 * Der eigene Generator, der früher hier stand, konnte weder Bahnen noch
 * Aufgabentypen: Jede Aufgabe wurde ein nacktes `bpmn:task`, und die Rolle
 * landete als Präfix im Etikett („IT: Antrag prüfen"). Beides sind Angaben,
 * die BPMN im Symbol führt – und im Text verschwinden sie beim ersten
 * Umbenennen. Gebaut wird deshalb in js/prozessschema.js, gegen dieselbe
 * Beschreibung, gegen die auch geprüft wird.
 *
 * @returns {{name: string, xml: string, policyIds: string[], docs: Array}}
 */
function _bpmnFromText(text, name, policyIds, docs) {
  const ids = (policyIds || []).map(String);
  const anlagen = docs || [];
  return prozessXmlBauen({
    name, schritte: prozessTextLesen(text), policyIds: ids, docs: anlagen,
    // Richtlinien und Anlagen reisen als Marker in der Prozess-Dokumentation
    // mit. Ohne sie verlöre ein erzeugtes Modell genau die Verknüpfungen, für
    // die es angelegt wurde.
    doku: _procDokuText(ids, anlagen),
  });
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
  { name: 'IMS-Abdeckung & SoA (RMS)', steps: `
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
  // Im Browser teilen sich alle Skripte einen globalen Bereich, und
  // js/prozessschema.js steht vor dieser Datei – die Schema-Funktionen sind
  // dort einfach da. Unter Node hat jede Datei ihren eigenen Bereich; deshalb
  // werden sie hier nachgereicht, damit ein `require('./prozesse.js')`
  // dieselbe Umgebung vorfindet wie der Browser.
  if (typeof prozessXmlAusText === 'undefined') Object.assign(globalThis, require('./prozessschema.js'));
  module.exports = { _parseSteps, _bpmnFromText, _clipLabel, RMS_PROCESS_SEEDS,
    _parseProcessDocs, _procDokuText, _procDocMarker, _docFeld, _xmlUnesc,
    procEintragAusXml, procKennungAusXml, procUnterAusXml, procLeeresBpmn, procEintragLaden, procEintraegeLaden };
}
