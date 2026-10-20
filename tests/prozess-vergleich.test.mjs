/**
 * Vergleich IST → SOLL.
 *
 * Festgehalten wird, was aus jedem Schritt des bisherigen Ablaufs wird
 * (bleibt, geändert, automatisiert, zusammengelegt, entfällt) und was im SOLL
 * neu ist, mit Grund. In beiden Diagrammen trägt jede Zuordnung dieselbe
 * Nummer und Farbe, damit klar ist, was zu wem gehört.
 *
 * Worauf es ankommt:
 *   • Die Gegenüberstellung steht als Marker am SOLL-Modell, übersteht jeden
 *     Rundlauf und jedes Neuschreiben der Dokumentation (Modeler, Backlog).
 *   • Die Art folgt den Seiten: ohne SOLL entfällt ein Schritt, ohne IST ist er neu.
 *   • Vorschläge über gleiche oder ähnliche Namen, jeder Schritt nur einmal.
 *   • Die Freigabe nimmt die Gegenüberstellung in die Word-Beschreibung auf.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { jsArg } = require('../js/util.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split(String.fromCharCode(13)).join('');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NL = String.fromCharCode(10);

const M = require('../js/prozessmodell.js');
const V = require('../js/prozessvergleich.js');

/* ══ 1) Daten am SOLL ══ */
console.log('Daten');
const zeilen = [
  { art: 'automatisiert', ist: 'IST1:T1', soll: 'SOLL1:A1', grund: 'G3 [manuell] | doppelt' },
  { art: 'bleibt', ist: ['IST1:T2'], soll: ['SOLL1:A2'] },
  { art: 'bleibt', ist: 'IST2:T9', soll: '' },
  { art: 'entfaellt', ist: '', soll: 'U1:A9' },
  { art: 'neu', ist: 'IST1:T3', soll: 'SOLL1:A3' },
  { art: 'quatsch', ist: 'kaputt', soll: 'auch kaputt' },
];
const n = M.pzVglNormal(zeilen);
ok(n.length === 5, 'Ohne gültigen Schritt fällt eine Zeile weg');
ok(n[2].art === 'entfaellt' && n[3].art === 'neu' && n[4].art === 'geaendert', 'Die Art folgt den Seiten: ohne SOLL entfällt, ohne IST neu, mit beiden nicht „neu"');
ok(!/[|[\]]/.test(n[0].grund), 'Trenner und Klammern im Grund zerbrechen den Marker nicht');
const pmZeilen = M.pzPmZeilen({ status: 'poc', vergleich: zeilen });
ok(pmZeilen.some(z => z.startsWith('Vergleich mit dem IST: 5 Zuordnungen:')) && pmZeilen.filter(z => z.startsWith('[[rms:vgl=')).length === 5, 'Klartext und je Zuordnung ein Marker');
ok(JSON.stringify(M.pzPmAusText(pmZeilen.join(NL)).vergleich) === JSON.stringify(n), 'Rundlauf: gelesen kommt dasselbe heraus');
ok(!M.pzPmLeer({ vergleich: [{ ist: 'A:b' }] }) && M.pzPmMarker({ vergleich: [{ ist: 'A:b' }] }) === '', 'Ein Vergleich zählt als Angabe, ohne leere pm-Zeile');
ok(M.pzVglKurz([{ art: 'bleibt', ist: 'a:1', soll: 'b:1' }, { art: 'entfaellt', ist: 'a:2' }]) === '2 Zuordnungen: 1 bleibt, 1 entfällt', 'Kurzfassung in Worten');

/* Dokumentation: bleibt bei jedem Neuschreiben */
const ctx = { console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent, esc, jsArg,
  State: { policies: [] }, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  toast: () => {}, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx; ctx.globalThis = ctx; ctx.module = undefined;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/prozessmodell.js'), ctx);
vm.runInContext(lies('js/prozesse.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
ctx.__x = run('procLeeresBpmn()').replace('<bpmn:startEvent', '<bpmn:documentation>Der Ablauf.</bpmn:documentation>' + NL + '    <bpmn:startEvent');
ctx.__pm = { status: 'poc', vergleich: zeilen };
const mit = run(`procXmlDokuNeu(__x, { pm: __pm })`);
ctx.__y = mit;
const status = run(`procXmlDokuNeu(__y, { pm: Object.assign(procPmAusXml(__y), { status: 'freigegeben' }) })`);
ok((status.match(/\[\[rms:vgl=/g) || []).length === 5 && /\[\[rms:pm=freigegeben/.test(status) && (status.match(/Der Ablauf\./g) || []).length === 1,
  'Status setzen lässt den Vergleich stehen, ohne ihn zu verdoppeln');
ok(run(`_procIstDokuZeile('[[rms:vgl=bleibt|a:1|b:1|]]')`) && run(`_procIstDokuZeile('Vergleich mit dem IST: 1 Zuordnung')`), 'Marker und Klartext gelten als Angaben, nicht als Beschreibung');
ok(/vergleich: \(_procPm && _procPm\.vergleich\) \|\| \[\],/.test(lies('js/prozesse.js')), 'Der Modeler behält den Vergleich beim Speichern');

/* ══ 2) Rechnen ══ */
console.log('Zuordnen');
const ablauf = { schritte: [
  { nr: 1, id: 'S', art: 'start', name: 'Rechnung kommt' },
  { nr: 2, id: 'T1', art: 'mensch', name: 'Rechnung per Post erfassen', bahn: 'Buchhaltung' },
  { nr: 3, id: 'G', art: 'frage', name: 'Konform?' },
  { nr: 4, id: 'T2', art: 'automatik', name: 'In SAP buchen', bahn: 'SAP' },
  { nr: 5, id: 'T3', art: 'handgriff', name: 'Papier ablegen' },
] };
const ist = V.pvSchritte('IST1', ablauf);
ok(ist.map(s => s.ref).join() === 'IST1:T1,IST1:T2,IST1:T3' && ist[0].bahn === 'Buchhaltung', 'Verglichen werden die Tätigkeiten, nicht Auslöser und Rauten');
const soll = V.pvSchritte('SOLL1', { schritte: [
  { nr: 1, id: 'A1', art: 'automatik', name: 'Rechnung erfassen (automatisch)' },
  { nr: 2, id: 'A2', art: 'automatik', name: 'In SAP buchen' },
  { nr: 3, id: 'A3', art: 'mensch', name: '800k-Einschätzung' }] });
ok(V.pvAehnlich('In SAP buchen', 'in SAP buchen') === 1 && V.pvAehnlich('Rechnung per Post erfassen', 'Rechnung erfassen (automatisch)') >= 0.5
  && V.pvAehnlich('Papier ablegen', '800k-Einschätzung') === 0, 'Ähnlichkeit über gemeinsame Wörter, ohne Füllwörter');
const vor = V.pvVorschlaege(ist, soll, []);
ok(vor.length === 2 && vor[0].art === 'bleibt' && vor[0].ist[0] === 'IST1:T2' && vor[0].soll[0] === 'SOLL1:A2'
  && vor[1].art === 'geaendert' && vor[1].ist[0] === 'IST1:T1', 'Vorschläge: gleicher Name bleibt, ähnlicher ist geändert, die besten zuerst');
ok(V.pvVorschlaege(ist, soll, [{ ist: ['IST1:T2'], soll: [] }]).every(z => z.ist[0] !== 'IST1:T2'), 'Was schon zugeordnet ist, wird nicht noch einmal vorgeschlagen');
const ab = V.pvAbdeckung(ist, soll, vor);
ok(ab.istZu === 2 && ab.istGesamt === 3 && ab.offenIst.map(s => s.id).join() === 'T3' && ab.offenSoll.map(s => s.id).join() === 'A3', 'Abdeckung: was noch offen ist, je Seite');

console.log('Farben und Marken');
const z2 = [{ art: 'bleibt', ist: ['IST1:T2'], soll: ['SOLL1:A2'] }, { art: 'entfaellt', ist: ['IST1:T3'], soll: [] },
  { art: 'neu', ist: [], soll: ['SOLL1:A3'] }, { art: 'zusammengelegt', ist: ['IST1:T1'], soll: ['SOLL1:A2'] }];
const mIst = V.pvMarken(z2, 'ist', 'IST1'), mSoll = V.pvMarken(z2, 'soll', 'SOLL1');
ok(mIst.get('T2')[0].nr === 1 && mIst.get('T2')[0].farbe === V.pvFarbe(1) && mIst.get('T3')[0].farbe === V.PV_ROT, 'IST: Nummer und Farbe der Zuordnung, Entfallenes rot');
ok(mSoll.get('A3')[0].farbe === V.PV_BLAU && mSoll.get('A2').map(x => x.nr).join() === '1,4', 'SOLL: Neues blau; ein Schritt aus zwei IST-Schritten trägt beide Nummern');
ok(V.pvMarken(z2, 'ist', 'IST2').size === 0, 'Jedes Diagramm zeigt nur seine Schritte');
const xml = `<bpmndi:BPMNShape id="T2_di" bpmnElement="T2"><dc:Bounds x="100" y="80" width="140" height="80" /></bpmndi:BPMNShape>
  <bpmndi:BPMNShape id="P_di" bpmnElement="P" isHorizontal="true"><dc:Bounds x="0" y="0" width="900" height="300" /><bpmndi:BPMNLabel /></bpmndi:BPMNShape>`;
const b = V.pvBoundsAusXml(xml);
ok(b.T2.x === 100 && b.T2.w === 140 && b.P.h === 300, 'Lage und Größe aus dem BPMN-XML');
const svg = V.pvSvgMitMarken('<svg width="900" height="300" viewBox="0 0 900 300"><g/></svg>', b, new Map([['T2', [{ nr: 1, farbe: '#17509E' }, { nr: 4, farbe: '#7c3aed' }]]]));
ok(/viewBox="-24 -24 948 348"/.test(svg) && /<g class="pv-marken"><rect x="94" y="74" width="152" height="92" rx="12" fill="none" stroke="#17509E"/.test(svg)
  && (svg.match(/<circle /g) || []).length === 2 && />4<\/text>/.test(svg), 'Rahmen in der Farbe, je Zuordnung eine Nummer, Platz am Rand');
ok(V.pvSvgMitMarken('<svg width="1" height="1" viewBox="0 0 1 1"></svg>', b, new Map()) === '<svg width="1" height="1" viewBox="0 0 1 1"></svg>', 'Ohne Marken bleibt das Bild unverändert');
const zwei = V.pvSvgUntereinander([{ titel: 'IST: A & B', svg: '<svg width="400" height="100" viewBox="0 0 400 100"><g/></svg>' },
  { titel: 'SOLL', svg: '<?xml version="1.0"?><svg width="600" height="200" viewBox="10 10 600 200"><rect/></svg>' }]);
ok(/^<svg [^>]*width="600" height="436"/.test(zwei) && /IST: A &amp; B/.test(zwei) && /<svg x="0" y="208" width="600" height="200" viewBox="10 10 600 200"><rect\/><\/svg>/.test(zwei),
  'Für das PNG: beide Bilder untereinander, je mit Überschrift');

console.log('Word');
// Im Browser liegen beide Dateien im selben Bereich; hier wie dort.
globalThis.pzVglNormal = M.pzVglNormal; globalThis.pzVglArtInfo = M.pzVglArtInfo;
const wort = V.pvZeilenFuerWord(z2, { 'IST1:T2': 'IST · 4. In SAP buchen', 'SOLL1:A2': 'SOLL · 2. In SAP buchen' });
ok(wort[0].join('|') === '1|IST · 4. In SAP buchen|SOLL · 2. In SAP buchen|bleibt|' && wort[1][2] === '–' && wort[1][3] === 'entfällt', 'Zeilen für die Tabelle der Beschreibung');
const F = require('../js/prozessfreigabe.js');
const bl = F.pfBeschreibungBloecke({ titel: 'E-Rechnung', modelle: [{ id: 'S', titel: 'E-Rechnung', art: 'haupt', ebene: 0 }],
  vergleich: { kurz: '2 Zuordnungen: 1 bleibt, 1 entfällt', zeilen: wort.slice(0, 2) } });
const i = bl.findIndex(x => x.text === 'Vergleich mit dem IST');
ok(i > 0 && bl[i + 2].art === 'tabelle' && bl[i + 2].kopf.join() === 'Nr.,IST,SOLL,Änderung,Grund' && /1 bleibt, 1 entfällt\./.test(bl[i + 1].text),
  'Die Beschreibung der Freigabe hat das Kapitel „Vergleich mit dem IST"');
ok(F.pfBeschreibungBloecke({ titel: 'X', modelle: [{ id: 'S', titel: 'X', art: 'haupt' }] }).every(x => x.text !== 'Vergleich mit dem IST'), 'Ohne Vergleich kein Kapitel');

/* ══ 3) Ansicht ══ */
console.log('Ansicht');
const mount = { innerHTML: '' };
const vctx = { console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent, esc, jsArg,
  toast: () => {}, canWriteTab: () => true, document: { getElementById: (id) => (id === 'prozesse-mount' ? mount : null) } };
vctx.window = vctx; vctx.globalThis = vctx;
vm.createContext(vctx);
vm.runInContext(lies('js/prozessmodell.js'), vctx);
vm.runInContext(lies('js/prozessvergleich.js'), vctx);
vm.runInContext(`_pv = { sollId: 'SOLL1', titel: 'E-Rechnung Rechnungseingang', von: 'backlog', geaendert: false, tab: { ist: 0, soll: 0 }, gross: { ist: false, soll: false },
  ist: [{ id: 'IST1', titel: 'Eingang (IST)', xml: '', svg: '', schritte: ${JSON.stringify(ist)} }],
  soll: [{ id: 'SOLL1', titel: 'E-Rechnung Rechnungseingang', xml: '', svg: '', schritte: ${JSON.stringify(soll)} }],
  zeilen: [{ art: 'entfaellt', ist: ['IST1:T3'], soll: [], grund: 'G7 Doppelablage' }] }; _pvRender();`, vctx);
const h = mount.innerHTML;
ok(/⇄ Vergleich IST → SOLL: E-Rechnung Rechnungseingang/.test(h) && /<b>1<span>\/3<\/span><\/b>IST-Schritte zugeordnet/.test(h), 'Kopf und Abdeckung');
ok(/<span class="pv-nr" style="background:#b91c1c">1<\/span>/.test(h) && /value="G7 Doppelablage"/.test(h), 'Die Zuordnung mit Nummer in ihrer Farbe und Grund');
ok(/💡 2 Vorschläge übernehmen/.test(h) && /IST, noch nicht zugeordnet \(2\)/.test(h) && /pvZeileNeu\(&quot;IST1:T1&quot;, &quot;&quot;\)/.test(h), 'Vorschläge und offene Schritte zum Anklicken');
vm.runInContext(`pvVorschlaegeUebernehmen()`, vctx);
ok(vm.runInContext('_pv.zeilen.length', vctx) === 3 && vm.runInContext('_pv.geaendert', vctx) === true && /id="pv-speichern" onclick="pvSpeichern\(\)" >/.test(mount.innerHTML),
  'Übernommene Vorschläge sind ungespeichert, „Speichern" wird aktiv');
vm.runInContext(`pvZeileSetzen(0, 'soll', 'SOLL1:A3')`, vctx);
ok(vm.runInContext('_pv.zeilen[0].art', vctx) === 'geaendert', 'Bekommt ein entfallener Schritt ein SOLL, ist er „geändert"');
vm.runInContext(`pvZeileSetzen(0, 'ist', '')`, vctx);
ok(vm.runInContext('_pv.zeilen[0].art', vctx) === 'neu', 'Ohne IST ist er neu');
vm.runInContext(`pvZeileNeu('', '')`, vctx);
ok(vm.runInContext('_pv.zeilen.length', vctx) === 4, '„+ Zuordnung" legt eine leere Zeile an, die bis zum Speichern stehen bleibt');
vctx.canWriteTab = () => false;
vm.runInContext('_pvRender()', vctx);
ok(!/<select/.test(mount.innerHTML) && !/pvSpeichern/.test(mount.innerHTML), 'Nur mit Lesezugriff: keine Auswahl und kein Speichern');

/* ══ 4) Einstiege, Modul, Doku ══ */
console.log('Einstiege');
const P = lies('js/prozesse.js'), B = lies('js/prozessbacklog.js');
ok(/typeof pvMoeglich === 'function' && pvMoeglich\(itemId\)\) \? `<button type="button" onclick="pvOeffnen\(\$\{jsArg\(itemId\)\}, \$\{jsArg\(itemId\)\}\)"/.test(P), 'Modellansicht: „⇄ Vergleich IST/SOLL", wenn es IST-Modelle gibt');
ok(/\(e\.istModelle \|\| \[\]\)\.length && typeof pvOeffnen === 'function' \? `<button type="button" class="pb-angaben pb-vergleich" onclick="pvOeffnen\(\$\{jsArg\(k\.id\)\}, 'backlog'\)"/.test(B), 'Backlog: an jeder Karte mit IST-Modellen');
const MO = lies('js/module.js');
ok(/'prozessfreigabe', 'prozessvergleich', 'landkarte', 'prozessmatrix'/.test(MO) && /'prozessfreigabe', 'prozessvergleich', 'landkarte', 'notfall'/.test(MO), 'Das Modul lädt mit den Prozessen (auch in der Notfall-Ansicht)');
const D = lies('js/dokumentation.js');
ok(/⇄ Vergleich IST\/SOLL/.test(D) && /Gegenüberstellung/.test(D) && /Vergleich mit dem IST/.test(D), 'Die Dokumentation beschreibt den Vergleich');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
