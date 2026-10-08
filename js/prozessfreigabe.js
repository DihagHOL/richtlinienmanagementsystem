'use strict';

/**
 * Freigabe von Prozessen – über ein Regelwerk je Hauptprozess
 * ===========================================================
 * Ein Prozessmodell sagt, wer was in welcher Reihenfolge tut: Es ist eine
 * Arbeitsanweisung. Also wird es freigegeben wie eine, mit demselben Workflow
 * wie jede Richtlinie: Konformitätsprüfung, bei Bedarf Mitbestimmung, Freigabe
 * durch die Geschäftsleitung, Version, Bekanntgabe, Kenntnisnahme, Wiedervorlage.
 * Einen zweiten, kleineren Workflow daneben gibt es nicht.
 *
 * Was zählt, ist der Hauptprozess: ein Modell, das unter keinem anderen steht.
 * Zu ihm gehört ein Regelwerk der Art „Arbeits-/Prozessanweisung". Seine Unter-
 * und Nebenprozesse sind darin enthalten und werden nicht einzeln freigegeben;
 * in der Liste steht bei ihnen „Freigabe über …".
 *
 * Das Dokument des Regelwerks erzeugt das RMS: eine Word-Datei mit dem
 * Hauptprozess und jedem Unter- und Nebenprozess als Diagramm und Schrittliste
 * (dieselbe Werkstatt wie die Word-Anleitung, js/bpmnanleitung.js). So lesen
 * Prüfer, Geschäftsleitung und Mitarbeitende den Prozess ohne Zugang zum Reiter
 * Prozesse, und die Workflow-Mails hängen ihn an wie jedes Regelwerkdokument.
 *
 * Am Regelwerk steht im Sammelfeld (DatenJson, keine neue Spalte) `prozess`:
 *   { hauptId, titel, werk, standAm, standVon,
 *     stand: [{ id, titel, art: 'haupt'|'unter'|'neben', ebene, unter, h }] }
 * `stand` ist der Umfang, aus dem das Dokument erzeugt wurde, `h` der
 * Fingerabdruck des Ablaufs (procInhaltHash in js/prozesse.js). Weicht der
 * Prozess davon ab, steht das an der Zeile, und „Beschreibung aktualisieren"
 * erzeugt das Dokument neu; SharePoint führt die Versionen.
 */

const PF_REGELWERK_TYP = 'Arbeits-/Prozessanweisung';
const PF_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PF_ARTEN = { haupt: 'Hauptprozess', unter: 'Unterprozess', neben: 'Nebenprozess' };
let _pfLaeuft = false;

/* ═══════════════════════════════════════════════════
   Reine Funktionen – ohne DOM und SharePoint (tests/prozess-freigabe)
   ═══════════════════════════════════════════════════ */

/** Das Regelwerk, das diesen Hauptprozess freigibt. Ein archiviertes zählt nicht mehr. */
function pfRegelwerkVon(hauptId, policies) {
  const alle = policies || ((typeof State !== 'undefined' && State.policies) || []);
  return alle.find(p => p && p.typ !== 'Konzept' && p.status !== 'Archiviert'
    && p.prozess && String(p.prozess.hauptId) === String(hauptId)) || null;
}

/**
 * Der Umfang einer Freigabe: der Hauptprozess und alles darunter, in der
 * Reihenfolge der Gliederung, jedes Modell einmal (auch wenn es an zwei
 * Stellen hängt, und ohne Kreis).
 * @param {(id:string) => {id:string, art:string}[]} kinderVon
 * @param {(id:string) => object|null} modellVon   das Modell der Liste
 * @param {(id:string) => string} hashVon           Fingerabdruck, '' wenn unbekannt
 */
function pfUmfang(hauptId, kinderVon, modellVon, hashVon) {
  const out = [], gesehen = new Set();
  const lauf = (id, art, ebene, oben) => {
    id = String(id);
    if (gesehen.has(id)) return;
    const m = modellVon(id);
    if (!m) return;
    gesehen.add(id);
    out.push({ id, titel: String(m.title || ''), werk: String(m.ordner || ''), art, ebene, unter: oben, h: String(hashVon(id) || '') });
    kinderVon(id).forEach(k => lauf(k.id, k.art, ebene + 1, id));
  };
  lauf(hauptId, 'haupt', 0, '');
  return out;
}

/**
 * Was sich seit dem Stand der Beschreibung geändert hat. Ein Modell, dessen
 * Fingerabdruck gerade nicht bekannt ist (Datei noch ungelesen), gilt als
 * unverändert: lieber einen Augenblick später warnen als grundlos.
 */
function pfAbweichung(stand, jetzt) {
  const alt = new Map((stand || []).map(s => [String(s.id), s]));
  const neu = new Map((jetzt || []).map(s => [String(s.id), s]));
  const geaendert = [], dazu = [], weg = [];
  neu.forEach((s, id) => {
    const a = alt.get(id);
    if (!a) dazu.push(s);
    else if (s.h && a.h && s.h !== a.h) geaendert.push(s);
  });
  alt.forEach((s, id) => { if (!neu.has(id)) weg.push(s); });
  return { geaendert, dazu, weg, irgendwas: !!(geaendert.length || dazu.length || weg.length) };
}

/** Die Abweichung in einem Satz – für Rückfrage, Historie und Tooltip. */
function pfAbweichungText(ab) {
  const namen = (l) => l.map(s => '„' + s.titel + '"').join(', ');
  const teile = [];
  if (ab.geaendert.length) teile.push('Geändert: ' + namen(ab.geaendert));
  if (ab.dazu.length) teile.push('Neu dabei: ' + namen(ab.dazu));
  if (ab.weg.length) teile.push('Nicht mehr dabei: ' + namen(ab.weg));
  return teile.length ? teile.join('. ') + '.' : 'Keine Änderung am Ablauf.';
}

/** Der Geltungsbereich aus dem Werk des Modells; Konzern und „ohne Werk" gelten überall. */
function pfGeltung(werk) {
  const w = String(werk || '').trim();
  return (!w || w === 'KONZERN') ? ['ALLE'] : [w];
}

/** Ein freier Dateiname: Titel und Werk, bei Gleichstand mit Zähler. */
function pfDateiname(titel, werk, belegt) {
  const basis = 'Prozessbeschreibung ' + String(titel || 'Prozess').replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim()
    + (werk ? ' (' + werk + ')' : '');
  const schon = new Set((belegt || []).map(n => String(n).toLowerCase()));
  let name = basis + '.docx';
  for (let i = 2; schon.has(name.toLowerCase()); i++) name = basis + ' ' + i + '.docx';
  return name;
}

/** Ein Schritt als Tabellenzeile; eine Entscheidung nennt, wohin ihre Ausgänge führen. */
function pfSchrittZeile(s, artTitel) {
  const ausgaenge = s.art === 'frage' && (s.aus || []).length
    ? ' (' + s.aus.map(a => (a.label || 'weiter') + ' → ' + (a.nachNr ? 'Nr. ' + a.nachNr : (a.nachName || '?'))).join(', ') + ')' : '';
  return [String(s.nr), (s.name || '–') + ausgaenge, s.bahn || '', artTitel || ''];
}

/**
 * Die Blöcke der Prozessbeschreibung für bpmnAnleitungDocx.
 * @param {{titel:string, art?:string, werk?:string, datum?:string, wer?:string,
 *   modelle:{id:string, titel:string, art:string, ebene:number, oberTitel?:string, werk?:string,
 *            lead?:string, schritte?:object[], anlagen?:string[], bild?:string, quer?:boolean}[],
 *   artTitel?:(art:string)=>string}} o
 */
function pfBeschreibungBloecke(o) {
  const m = o.modelle || [];
  const haupt = m[0] || {};
  const artTitel = o.artTitel || (() => '');
  const bloecke = [
    { art: 'titel', text: o.titel || haupt.titel || 'Prozess' },
    { art: 'untertitel', text: 'Prozessbeschreibung · ' + (o.art || PF_REGELWERK_TYP) },
    { art: 'klein', text: [o.werk ? 'Werk: ' + o.werk : '', o.datum ? 'Stand ' + o.datum : '', o.wer ? 'erzeugt von ' + o.wer : '']
      .filter(Boolean).join(' · ') },
  ];
  if (haupt.lead) bloecke.push({ art: 'p', text: haupt.lead });
  bloecke.push({ art: 'h2', text: 'Umfang dieser Freigabe' });
  bloecke.push({ art: 'p', text: m.length > 1
    ? `Freigegeben wird der Hauptprozess „${haupt.titel}". Seine ${m.length - 1} Unter- und Nebenprozesse gehören dazu und werden nicht einzeln freigegeben.`
    : `Freigegeben wird der Prozess „${haupt.titel}". Er hat keine Unter- oder Nebenprozesse.` });
  bloecke.push({ art: 'tabelle', kopf: ['Prozess', 'Art', 'Teil von'], breiten: [8.0, 3.4, 5.2],
    zeilen: m.map(x => ['   '.repeat(Math.max(0, x.ebene || 0)) + x.titel, PF_ARTEN[x.art] || x.art, x.oberTitel || '']) });
  m.forEach((x, i) => {
    bloecke.push({ art: 'h1', text: x.titel, neueSeite: true });
    bloecke.push({ art: 'p', text: (i === 0 ? 'Hauptprozess' : `${PF_ARTEN[x.art] || 'Teil'} von „${x.oberTitel}"`)
      + (x.werk && x.werk !== o.werk ? ' · Werk ' + x.werk : '') });
    if (i > 0 && x.lead) bloecke.push({ art: 'p', text: x.lead });
    if (x.bild) bloecke.push({ art: 'bild', bild: x.bild, quer: !!x.quer, unterschrift: 'Ablauf: ' + x.titel });
    const schritte = (x.schritte || []).filter(s => s && (s.name || s.art !== 'parallel'));
    if (schritte.length) {
      bloecke.push({ art: 'h2', text: 'Schritt für Schritt' });
      bloecke.push({ art: 'tabelle', kopf: ['Nr.', 'Schritt', 'Zuständig', 'Art'], breiten: [1.2, 8.6, 3.6, 3.2],
        zeilen: schritte.map(s => pfSchrittZeile(s, artTitel(s.art))) });
    }
    if ((x.anlagen || []).length) {
      bloecke.push({ art: 'h2', text: 'Hinterlegte Dokumente' });
      bloecke.push({ art: 'liste', punkte: x.anlagen });
    }
  });
  return bloecke;
}

/* ═══════════════════════════════════════════════════
   Im Reiter Prozesse
   ═══════════════════════════════════════════════════ */

/** Schreibrecht auf beide Seiten: das Modell und das Regelwerk. */
function _pfDarf() {
  return typeof canWriteTab !== 'function' || (canWriteTab('prozesse') && canWriteTab('verwaltung'));
}

/** Ein Hauptprozess steht unter keinem anderen Modell, in keinem Werk. */
function pfIstHauptprozess(id) {
  return !(typeof procGliederungEltern === 'function' && procGliederungEltern(id).length);
}

/** Die Hauptprozesse, unter denen ein Modell (über beliebig viele Stufen) steht. */
function pfHauptprozesseVon(id) {
  const out = [], gesehen = new Set([String(id)]);
  const hoch = (x) => {
    const eltern = (typeof procGliederungEltern === 'function') ? procGliederungEltern(x) : [];
    if (!eltern.length) { if (String(x) !== String(id) && !out.includes(String(x))) out.push(String(x)); return; }
    eltern.forEach(e => { const k = String(e.modell.itemId); if (!gesehen.has(k)) { gesehen.add(k); hoch(k); } });
  };
  hoch(String(id));
  return out;
}

function pfUmfangVon(hauptId) {
  return pfUmfang(hauptId,
    (id) => (typeof procGliederungKinder === 'function') ? procGliederungKinder(id) : [],
    (id) => (typeof procModellVon === 'function') ? procModellVon(id) : null,
    (id) => { const e = (typeof procEintragVon === 'function') ? procEintragVon(procModellVon(id)) : null; return (e && !e.alt) ? e.h : ''; });
}

/** Status und Knöpfe an einem Hauptprozess: zur Freigabe, Regelwerk öffnen, Beschreibung aktualisieren. */
function pfStatusHtml(hauptId) {
  const p = pfRegelwerkVon(hauptId);
  if (!p) {
    return _pfDarf() ? `<button type="button" class="pg-knopf" onclick="pfFreigabeStarten(${jsArg(hauptId)})"
      title="Als Arbeits-/Prozessanweisung freigeben, wie eine Richtlinie: mit allen Unter- und Nebenprozessen">📋 Zur Freigabe</button>` : '';
  }
  const ab = pfAbweichung((p.prozess || {}).stand, pfUmfangVon(hauptId));
  return `<button type="button" class="pf-status" onclick="pfRegelwerkOeffnen(${jsArg(p.id)})"
      title="Regelwerk öffnen: ${esc(p.title)}">📋 ${workflowBadge(p.status)} <span>v${esc(p.version || '1.0')}</span></button>${ab.irgendwas
    ? `<button type="button" class="pg-knopf pf-warn" onclick="pfBeschreibungAktualisieren(${jsArg(hauptId)})"
        title="${esc(pfAbweichungText(ab))} Die Beschreibung im Regelwerk zeigt noch den Stand vom ${esc(_pfTag((p.prozess || {}).standAm))}.">⚠ Geändert: Beschreibung aktualisieren</button>` : ''}`;
}

/** An einem Unter- oder Nebenprozess: freigegeben wird über den Hauptprozess.
 *  `nurHaupt`: nur dieser (in der Gliederung der Weg, auf dem die Zeile steht). */
function pfUeberHtml(id, nurHaupt) {
  return (nurHaupt ? [String(nurHaupt)] : pfHauptprozesseVon(id)).map(h => {
    const m = (typeof procModellVon === 'function') ? procModellVon(h) : null;
    if (!m) return '';
    const p = pfRegelwerkVon(h);
    const stand = p ? workflowBadge(p.status) : '<span class="field-hint">noch nicht eingereicht</span>';
    return `<span class="pf-ueber" title="Freigegeben wird der Hauptprozess, mit allen Unter- und Nebenprozessen">📋 Freigabe über ${esc(m.title)}: ${stand}</span>`;
  }).join(' ');
}

function _pfTag(iso) {
  return iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

/** Nach einer Änderung die Sicht auffrischen, aus der sie kam. */
function _pfNachher() {
  if (typeof _procGliederungNachher === 'function') _procGliederungNachher();
}

function pfRegelwerkOeffnen(policyId) {
  if (typeof openPolicyEditor === 'function' && typeof canWriteTab === 'function' && canWriteTab('verwaltung')) openPolicyEditor(policyId);
  else if (typeof openDetail === 'function') openDetail(policyId);
}

/** Einstieg: „📋 Zur Freigabe" an einem Hauptprozess. */
async function pfFreigabeStarten(hauptId) {
  const id = String(hauptId || '');
  const m = (typeof procModellVon === 'function') ? procModellVon(id) : null;
  if (!m) { toast('Dieses Modell gibt es nicht mehr, bitte neu laden.', 'error'); return; }
  const da = pfRegelwerkVon(id);
  if (da) { pfRegelwerkOeffnen(da.id); return; }
  if (!_pfDarf()) { toast('Für die Freigabe braucht es Schreibrecht auf „Prozesse" und auf „Richtlinien Dashboard".', 'error'); return; }
  if (!pfIstHauptprozess(id)) {
    const h = pfHauptprozesseVon(id).map(x => procModellVon(x)).filter(Boolean)[0];
    toast(`„${m.title}" ist Teil von „${h ? h.title : 'einem anderen Prozess'}". Freigegeben wird der Hauptprozess.`, 'error');
    return;
  }
  openModal(`<div class="modal-header"><h3>📋 Freigabe vorbereiten</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button></div>
    <div class="modal-body"><div class="doc-loading">Die Gliederung wird gelesen …</div></div>`);
  try { if (typeof procEintraegeLaden === 'function') await procEintraegeLaden(); } catch (e) { /* dann mit dem, was da ist */ }
  const umfang = pfUmfangVon(id);
  const zeile = (u) => `<div style="padding:3px 0 3px ${u.ebene * 20}px">${u.ebene ? (u.art === 'neben' ? '⇢ ' : '↳ ') : '🔀 '}<b>${esc(u.titel)}</b>
    <span class="field-hint">${esc(PF_ARTEN[u.art] || '')}${u.werk && u.werk !== (m.ordner || '') ? ' · ' + esc(u.werk) : ''}</span></div>`;
  openModal(`<div class="modal-header"><h3>📋 Freigabe vorbereiten: ${esc(m.title)}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button></div>
    <div class="modal-body">
      <p style="margin:0 0 10px;line-height:1.55">Freigegeben wird der <b>Hauptprozess mit allen Unter- und Nebenprozessen</b>. Dafür legt das RMS ein Regelwerk der Art <b>„${esc(PF_REGELWERK_TYP)}"</b> an. Es läuft durch dieselbe Freigabe wie jede Richtlinie: Konformitätsprüfung, bei Bedarf Mitbestimmung, Freigabe durch die Geschäftsleitung, danach Bekanntgabe und Kenntnisnahme.</p>
      <div class="form-group full"><label for="pf-titel">Titel des Regelwerks</label>
        <input type="text" id="pf-titel" class="form-control" value="${esc(m.title)}"></div>
      <div class="form-group full"><label>Umfang (${umfang.length} ${umfang.length === 1 ? 'Modell' : 'Modelle'})</label>
        <div style="max-height:220px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:8px 12px">${umfang.map(zeile).join('')}</div></div>
      <div class="field-hint" style="line-height:1.55">So geht es weiter:<br>
        1. Das RMS erzeugt die <b>Prozessbeschreibung als Word-Datei</b>: je Modell das Diagramm und die Schritte.<br>
        2. Das Regelwerk entsteht als <b>Entwurf</b>, mit dieser Datei als Dokument, und wird mit dem Modell verknüpft.<br>
        3. Der Editor des Regelwerks öffnet sich: Prüfer, Geschäftsleitung, Zielgruppe und Geltungsbereich prüfen, dann <b>„Zur Konformitätsprüfung →"</b>.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="pf-anlegen" onclick="pfAnlegen(${jsArg(id)})">Beschreibung erzeugen und Regelwerk anlegen</button>
    </div>`);
}

/**
 * Die Word-Datei erzeugen. Ein Bild, das sich nicht zeichnen lässt, fehlt dann,
 * die Schritte stehen trotzdem da: lieber eine Beschreibung ohne ein Diagramm
 * als gar keine.
 * @returns {Promise<{bytes:Uint8Array, ohneBild:string[]}>}
 */
async function _pfBeschreibungErzeugen(titel, umfang) {
  if (typeof bpmnAnleitungDocx !== 'function') throw new Error('Die Word-Werkstatt ist nicht geladen.');
  let zeichnen = typeof _baZeichnen === 'function' && typeof _baPng === 'function';
  if (zeichnen && typeof _baBpmnLaden === 'function') { try { await _baBpmnLaden(); } catch (e) { zeichnen = false; } }
  const bilder = {}, modelle = [], ohneBild = [];
  const titelVon = (id) => { const x = umfang.find(u => u.id === id); return x ? x.titel : ''; };
  for (let i = 0; i < umfang.length; i++) {
    const u = umfang[i];
    let xml = await spGetProcessXml(u.id);
    if (typeof _procPfeileRichten === 'function') xml = _procPfeileRichten(xml).xml;
    const ablauf = (typeof prozessAblauf === 'function') ? prozessAblauf(xml) : { schritte: [] };
    const modell = procModellVon(u.id);
    const eintrag = { ...u, oberTitel: titelVon(u.unter), werk: modell ? _procWerkLabel(modell) : '',
      lead: (typeof _procLead === 'function') ? _procLead(xml, ablauf) : '',
      schritte: ablauf.schritte, anlagen: (typeof _parseProcessDocs === 'function') ? _parseProcessDocs(xml).map(d => d.name) : [] };
    if (zeichnen && /<(\w+:)?definitions[\s>]/.test(xml)) {
      try {
        const png = await _baPng(await _baZeichnen(xml), 2, 'Ablauf ' + u.titel);
        bilder['m' + i] = png;
        eintrag.bild = 'm' + i;
        eintrag.quer = png.breite > 700;
      } catch (e) { ohneBild.push(u.titel); }
    } else ohneBild.push(u.titel);
    modelle.push(eintrag);
  }
  const haupt = procModellVon(umfang[0].id);
  const wer = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn || '') : '';
  const jetzt = new Date();
  const bloecke = pfBeschreibungBloecke({
    titel, werk: haupt ? _procWerkLabel(haupt) : '', wer,
    datum: jetzt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    modelle, artTitel: (art) => (typeof PROZESS_ARTEN !== 'undefined' && PROZESS_ARTEN[art]) ? PROZESS_ARTEN[art].titel : '',
  });
  const bytes = bpmnAnleitungDocx(bloecke, bilder, { titel: 'Prozessbeschreibung ' + titel, autor: wer, zeit: jetzt.toISOString().slice(0, 19) + 'Z' });
  return { bytes, ohneBild };
}

/** Der Stand, der am Regelwerk festgehalten wird. */
function _pfStand(hauptId, umfang) {
  const m = procModellVon(hauptId);
  return {
    hauptId: String(hauptId), titel: m ? m.title : '', werk: m ? (m.ordner || '') : '',
    standAm: new Date().toISOString(),
    standVon: (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn || '') : '',
    stand: umfang.map(u => ({ id: u.id, titel: u.titel, art: u.art, ebene: u.ebene, unter: u.unter, h: u.h })),
  };
}

/** Das Regelwerk im Modell eintragen: Es gilt dann als umgesetzt (R9), Landkarte und Verknüpfungen kennen es. */
async function _pfModellVerknuepfen(modellId, policyId) {
  const m = procModellVon(modellId);
  if (!m) return;
  const xml = await spGetProcessXml(m.itemId);
  const ids = _parsePolicyIds(xml);
  if (ids.includes(String(policyId))) return;
  const neu = procXmlDokuNeu(xml, { ids: ids.concat(String(policyId)) });
  await spSaveProcess(m.title, neu, m.ordner || '');
  try { _processes = await spListProcesses(); } catch (e) { /* dann mit der alten Liste */ }
  const q = procModellVon(modellId);
  if (q) procLinksMerken(q.itemId + '|' + q.modified, procEintragAusXml(neu));
}

/** „Beschreibung erzeugen und Regelwerk anlegen". */
async function pfAnlegen(hauptId) {
  if (_pfLaeuft) return;
  const id = String(hauptId);
  const m = procModellVon(id);
  if (!m || !_pfDarf()) return;
  if (pfRegelwerkVon(id)) { closeModal(); pfRegelwerkOeffnen(pfRegelwerkVon(id).id); return; }
  if (typeof newPolicy !== 'function' || typeof spSavePolicy !== 'function' || typeof spUploadPolicyDoc !== 'function') {
    toast('Die Regelwerk-Verwaltung ist nicht geladen, bitte neu laden.', 'error'); return;
  }
  const titel = String((document.getElementById('pf-titel') || {}).value || '').trim() || m.title;
  _pfLaeuft = true;
  const knopf = document.getElementById('pf-anlegen');
  if (knopf) { knopf.disabled = true; knopf.textContent = 'Die Beschreibung wird erzeugt …'; }
  try {
    const umfang = pfUmfangVon(id);
    const { bytes, ohneBild } = await _pfBeschreibungErzeugen(titel, umfang);
    const belegt = ((typeof State !== 'undefined' && State.policies) || []).map(p => p.dokumentName).filter(Boolean);
    const doc = await spUploadPolicyDoc(pfDateiname(titel, m.ordner, belegt), bytes, PF_DOCX);
    const p = newPolicy();
    Object.assign(p, {
      title: titel, regelwerkTyp: PF_REGELWERK_TYP, geltungsbereich: pfGeltung(m.ordner),
      beschreibung: umfang.length > 1
        ? `Prozess „${m.title}" mit ${umfang.length - 1} Unter- und Nebenprozessen. Diagramme und Schritte stehen im Dokument.`
        : `Prozess „${m.title}". Diagramm und Schritte stehen im Dokument.`,
      dokumentUrl: doc.url, dokumentName: doc.name, dokumentDriveId: doc.driveId, dokumentItemId: doc.itemId,
      prozess: _pfStand(id, umfang),
    });
    if (typeof historieAdd === 'function') {
      historieAdd(p, 'Angelegt', `Aus dem Prozess „${m.title}" angelegt${umfang.length > 1 ? `, mit ${umfang.length - 1} Unter- und Nebenprozessen` : ''}. Prozessbeschreibung erzeugt.`);
    }
    const gespeichert = await spSavePolicy(p);
    const pid = String((gespeichert && gespeichert.id) || '');
    if (pid) {
      try { await _pfModellVerknuepfen(id, pid); }
      catch (e) { toast('Regelwerk angelegt, aber nicht im Modell eingetragen: ' + e.message, 'error'); }
    }
    if (typeof reloadData === 'function') await reloadData();
    closeModal();
    toast(`Regelwerk „${titel}" als Entwurf angelegt ✓${ohneBild.length ? ` Ohne Diagramm: ${ohneBild.join(', ')}.` : ''}`, ohneBild.length ? 'error' : 'success');
    _pfNachher();
    if (pid) pfRegelwerkOeffnen(pid);
  } catch (e) {
    toast('Anlegen fehlgeschlagen: ' + e.message, 'error');
    if (knopf) { knopf.disabled = false; knopf.textContent = 'Beschreibung erzeugen und Regelwerk anlegen'; }
  } finally {
    _pfLaeuft = false;
  }
}

/** „⚠ Geändert: Beschreibung aktualisieren" – das Dokument neu erzeugen, am selben Ort. */
async function pfBeschreibungAktualisieren(hauptId) {
  if (_pfLaeuft) return;
  const id = String(hauptId);
  const p = pfRegelwerkVon(id);
  if (!p) return;
  if (!_pfDarf()) { toast('Für die Freigabe braucht es Schreibrecht auf „Prozesse" und auf „Richtlinien Dashboard".', 'error'); return; }
  if (!p.dokumentDriveId || !p.dokumentItemId) { toast('Das Regelwerk hat kein Dokument, das sich ersetzen ließe.', 'error'); return; }
  try { if (typeof procEintraegeLaden === 'function') await procEintraegeLaden(); } catch (e) { /* dann mit dem, was da ist */ }
  const umfang = pfUmfangVon(id);
  const ab = pfAbweichung((p.prozess || {}).stand, umfang);
  const folge = p.status === 'Veröffentlicht'
    ? 'Das Regelwerk ist veröffentlicht. Das Dokument wird ersetzt, SharePoint behält die freigegebene Fassung im Versionsverlauf. Danach im Regelwerk die Versionsnummer erhöhen und es erneut zur Konformitätsprüfung geben.'
    : p.status !== 'Entwurf'
      ? 'Das Regelwerk ist in der Freigabe. Geben Sie es danach erneut zur Prüfung, damit die Prüfenden die neue Fassung sehen.'
      : 'Das Regelwerk ist ein Entwurf; danach wie gewohnt zur Konformitätsprüfung.';
  const ok = await uiConfirm(`Die Prozessbeschreibung von „${esc(p.title)}" neu erzeugen?<br>
    <span class="field-hint">${esc(pfAbweichungText(ab))} ${esc(folge)}</span>`,
    { title: 'Beschreibung aktualisieren', okLabel: 'Neu erzeugen', html: true });
  if (!ok) return;
  _pfLaeuft = true;
  try {
    toast('Die Beschreibung wird erzeugt …');
    const { bytes, ohneBild } = await _pfBeschreibungErzeugen(p.title, umfang);
    const neu = JSON.parse(JSON.stringify(p));
    neu.prozess = _pfStand(id, umfang);
    if (typeof historieAdd === 'function') historieAdd(neu, 'Prozessbeschreibung aktualisiert', pfAbweichungText(ab));
    if (typeof pruefeFremdaenderung === 'function' && !await pruefeFremdaenderung(neu, 'aktualisierst')) return;
    await spReplaceDocContent(p.dokumentDriveId, p.dokumentItemId, bytes, PF_DOCX);
    await spSavePolicy(neu);
    if (typeof reloadData === 'function') await reloadData();
    toast(`Beschreibung aktualisiert ✓${ohneBild.length ? ` Ohne Diagramm: ${ohneBild.join(', ')}.` : ''}`, ohneBild.length ? 'error' : 'success');
    _pfNachher();
    if (p.status !== 'Entwurf') pfRegelwerkOeffnen(neu.id);
  } catch (e) {
    toast('Aktualisieren fehlgeschlagen: ' + e.message, 'error');
  } finally {
    _pfLaeuft = false;
  }
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PF_REGELWERK_TYP, PF_ARTEN, pfRegelwerkVon, pfUmfang, pfAbweichung, pfAbweichungText, pfGeltung,
    pfDateiname, pfSchrittZeile, pfBeschreibungBloecke };
}
