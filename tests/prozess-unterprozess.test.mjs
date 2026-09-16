/**
 * Unterprozesse in BPMN-Modellen: einbinden statt abschreiben – und jedes
 * Modell mit einer Kennung, die es im Haus nur einmal gibt.
 *
 * „Auftragserfassung" läuft in Lead to Cash und in Design to Operate. Wer den
 * Ablauf in beide Modelle hineinzeichnet, hat ihn zweimal – und nach der
 * ersten Änderung zwei verschiedene. BPMN hat dafür die Aufrufaktivität
 * (Call Activity, ⊞): ein Kasten, der auf ein eigenes Modell zeigt. Das Modell
 * gibt es einmal; eingebunden wird es so oft wie nötig.
 *
 * Der Verweis liegt in der Dokumentation des Elements und damit in der Datei:
 *   [[rms:modell=<Kennung der Datei>]]  +  calledElement="<Prozess-Kennung>"
 * Die Datei-Kennung ist die Wahrheit (sie überlebt Umbenennen und Umzug), die
 * Prozess-Kennung wird beim Speichern nachgezogen. Und weil eine ⊞ auf genau
 * ein Modell zeigen muss, heißt kein Modell mehr „Process_1".
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── Ein Modeler, wie bpmn-js ihn stellt – so weit, wie er hier gebraucht wird ── */
const geschrieben = [];   // modeling.updateProperties
const overlays = [];      // gesetzte Zeichen
const ersetzt = [];       // bpmnReplace.replaceElement

const typName = (t) => String(t).replace('bpmn:', '').replace(/^./, c => c.toLowerCase());
const xmlVon = (root, elemente) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="${root.businessObject.id}">${
  elemente.filter(e => e.type !== 'label').map(e => `<bpmn:${typName(e.type)} id="${e.id}"${
    e.businessObject.name ? ` name="${e.businessObject.name}"` : ''}${
    e.businessObject.calledElement ? ` calledElement="${e.businessObject.calledElement}"` : ''}>${
    e.businessObject.documentation ? `<bpmn:documentation>${e.businessObject.documentation[0].text}</bpmn:documentation>` : ''
  }</bpmn:${typName(e.type)}>`).join('')}</bpmn:process></bpmn:definitions>`;

function macheModeler(elemente, auswahl, root) {
  const state = { auswahl: auswahl.slice() };
  return {
    get(dienst) {
      if (dienst === 'moddle') return { create: (typ, attrs) => ({ $type: typ, ...attrs }), ids: { claim() {}, unclaim() {} } };
      if (dienst === 'modeling') return {
        updateProperties: (el, props) => {
          geschrieben.push({ el, props });
          Object.keys(props).forEach(k => { if (props[k] === undefined) delete el.businessObject[k]; else el.businessObject[k] = props[k]; });
          if ('id' in props) el.id = props.id;
        },
      };
      if (dienst === 'elementRegistry') return { filter: (fn) => elemente.filter(fn) };
      if (dienst === 'selection') return { get: () => state.auswahl, select: (el) => { state.auswahl = [el]; } };
      if (dienst === 'overlays') return {
        add: (id, typ, opt) => overlays.push({ id, typ, html: opt.html }),
        remove: (f) => { for (let i = overlays.length - 1; i >= 0; i--) if (!f || overlays[i].typ === f.type) overlays.splice(i, 1); },
      };
      if (dienst === 'eventBus') return { on: () => {} };
      if (dienst === 'commandStack') return { canUndo: () => false };
      if (dienst === 'bpmnReplace') return {
        replaceElement: (el, ziel) => {
          const neu = { id: el.id, type: ziel.type, businessObject: { ...el.businessObject, $type: ziel.type } };
          const i = elemente.indexOf(el); if (i >= 0) elemente[i] = neu;
          ersetzt.push({ von: el.type, nach: ziel.type });
          return neu;
        },
      };
      if (dienst === 'canvas') return { getRootElement: () => root };
      throw new Error('unbekannter Dienst: ' + dienst);
    },
    saveXML: async () => ({ xml: xmlVon(root, elemente) }),
  };
}
const elem = (id, name, doku, typ) => ({
  id, type: typ || 'bpmn:UserTask',
  businessObject: { $type: typ || 'bpmn:UserTask', name, documentation: doku ? [{ text: doku }] : undefined },
});
const wurzel = (id) => ({ id, type: 'bpmn:Process', businessObject: { $type: 'bpmn:Process', id } });

/* ── Die Umgebung ── */
const felder = {};       // DOM-Attrappen nach id
const gemeldet = [];     // toast
const gespeichert = [];  // spSaveProcess
const feld = (id) => (felder[id] = felder[id] || { id, value: '', innerHTML: '', textContent: '', disabled: false, focus() {} });
const ctx = {
  console, URLSearchParams, setTimeout, clearTimeout, Array, Object, String, JSON, Set, Map, Promise, Math, Date, Number, RegExp, Error,
  document: {
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, activeElement: null,
    getElementById: (id) => (id in felder || /^proc-/.test(id) ? feld(id) : null),
  },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { search: '' },
  esc: (s) => String(s ?? ''),
  toast: (t) => gemeldet.push(String(t)),
  uiConfirm: async () => true,
  openModal: () => {}, closeModal: () => {}, canWriteTab: () => true,
  policyZuId: () => null,
  State: { policies: [], konzepte: [] },
  spGetProcessXml: async (id) => ctx.__xml[id] || '',
  spListProcesses: async () => ctx.__liste.slice(),
  spSaveProcess: async (name, xml, werk) => { gespeichert.push({ name, xml, werk }); return { id: 'NEU', lastModifiedDateTime: 'm9' }; },
  spMoveProcess: async () => ({}),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/prozessschema.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
vm.runInContext(lies('js/prozesse.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* Vier Modelle in zwei Werken. D bindet A ein, A bindet B ein, C trägt noch „Process_1". */
ctx.__liste = [
  { itemId: 'A', name: 'Lead to Cash.bpmn', title: 'Lead to Cash', ordner: 'HOL', modified: 'm1' },
  { itemId: 'B', name: 'Auftragserfassung.bpmn', title: 'Auftragserfassung', ordner: 'HOL', modified: 'm2' },
  { itemId: 'C', name: 'Design to Operate.bpmn', title: 'Design to Operate', ordner: 'HOL', modified: 'm3' },
  { itemId: 'D', name: 'Gießen.bpmn', title: 'Gießen', ordner: 'SHB', modified: 'm4' },
];
ctx.__xml = {
  C: '<bpmn:definitions><bpmn:process id="Process_1"><bpmn:userTask id="T1" name="Auftrag erfassen"><bpmn:documentation>Unterprozess: Auftragserfassung\n[[rms:modell=B]]</bpmn:documentation></bpmn:userTask></bpmn:process></bpmn:definitions>',
};
run(`
_processes = __liste.slice();
_procLinkCache = {
  'A|m1': { p: ['7'], d: 0, k: false, i: 'Process_a1', u: ['B'] },
  'B|m2': { p: [], d: 1, k: false, i: 'Process_b2', u: [] },
  'D|m4': { p: [], d: 0, k: false, i: 'Process_d4', u: ['A'] },
};
_lkDaten = { karten: { HOL: { kacheln: [] }, SHB: { kacheln: [] } } };
_lkWerk = 'HOL';
`);

/* ── 1) Lesen: Kennung und Unterprozesse aus der Datei ── */
ok(run(`procKennungAusXml('<bpmn:definitions><bpmn:collaboration id="C"><bpmn:participant id="P" processRef="Process_x9" /></bpmn:collaboration><bpmn:process id="Process_x9" isExecutable="false" /></bpmn:definitions>')`) === 'Process_x9',
  'Die Prozess-Kennung ist das id des <bpmn:process> – nicht das des Teilnehmers');
ok(run(`procKennungAusXml('kein bpmn')`) === '', 'Ohne Prozess keine Kennung');
ok(run(`procUnterAusXml('a [[rms:modell=B]] b [[rms:modell=C]] c [[rms:modell=B]]').join()`) === 'B,C',
  'Die eingebundenen Modelle – jedes einmal, in der Reihenfolge des Auftretens');
const e = run(`procEintragAusXml(__xml.C)`);
ok(e.i === 'Process_1' && e.u.join() === 'B' && e.k === false && e.p.length === 0,
  'Der Cache-Eintrag trägt Kennung und Unterprozesse neben Richtlinien, Anlagen und Diagramm-Frage');
const eintrag = run(`procLinkEintrag(procEintragAusXml(__xml.C))`);
ok(eintrag.alt === false, 'Und gilt als vollständig – ein alter Eintrag ohne u wird nachgelesen');

/* ── 2) Jedes neue Modell bekommt seine eigene Kennung ── */
const leer1 = run(`procLeeresBpmn()`), leer2 = run(`procLeeresBpmn()`);
const k1 = run(`procKennungAusXml(${JSON.stringify(leer1)})`), k2 = run(`procKennungAusXml(${JSON.stringify(leer2)})`);
ok(k1 && k2 && k1 !== k2 && !/^Process_\d*$/.test(k1), `Zwei leere Diagramme, zwei Kennungen (${k1} / ${k2}) – nicht „Process_1"`);
ok(!leer1.includes('Process_1') && (leer1.match(new RegExp(k1, 'g')) || []).length === 2,
  'Die Kennung steht im Prozess und in der Zeichenebene – nirgends bleibt „Process_1" stehen');
const erzeugt = run(`_bpmnFromText('Einkauf: Bedarf prüfen\\nEinkauf: Lieferanten auswählen (Unterprozess)\\nEnde: Bestellt', 'Source to Pay', [])`);
ok(erzeugt.kennung && erzeugt.xml.includes(`<bpmn:process id="${erzeugt.kennung}"`) && erzeugt.xml.includes(`processRef="${erzeugt.kennung}"`),
  'Ein erzeugtes Modell trägt seine Kennung im Prozess und im Pool');
ok(/<bpmn:callActivity\b[^>]*name="Lieferanten auswählen"/.test(erzeugt.xml),
  '„(Unterprozess)" im Text wird zur ⊞ Aufrufaktivität');
ok(run(`prozessKennungGueltig('Process_1')`) === false && run(`prozessKennungGueltig('Process_m1x')`) === true && run(`prozessKennungGueltig('')`) === false,
  '„Process_1" gilt nicht als Kennung – die trug bis hierher jedes Modell');

/* ── 3) Das Hausschema kennt die ⊞ – und verlangt, dass sie auf ein Modell zeigt ── */
ok(run(`PROZESS_BAUSTEINE.some(b => b.bpmn === 'callActivity' && b.symbol === '⊞')`), 'Der zehnte Baustein: Unterprozess ⊞');
ok(run(`PROZESS_REGELN.some(r => r.id === 'R10')`), 'Die zehnte Regel: eingebunden, nicht abgeschrieben');
const pr1 = run(`prozessSchemaPruefen(${JSON.stringify(erzeugt.xml)}, { policyIds: ['7'] })`);
ok(pr1.fehler.some(f => f.regel === 'R10' && /Lieferanten auswählen/.test(f.text)), 'Eine ⊞ ohne Modell ist ein Fehler – welcher Prozess läuft hier?');
ok(pr1.zahlen.unterprozesse === 1, 'Die Zählung nennt die Unterprozesse');
const mitModell = erzeugt.xml.replace(/(<bpmn:callActivity\b[^>]*)>/, '$1><bpmn:documentation>Unterprozess: Lieferantenauswahl\n[[rms:modell=B]]</bpmn:documentation>');
const pr2 = run(`prozessSchemaPruefen(${JSON.stringify(mitModell)}, { policyIds: ['7'] })`);
ok(!pr2.fehler.some(f => f.regel === 'R10'), 'Mit Marker ist die ⊞ in Ordnung');
ok(!pr2.hinweise.some(h => h.regel === 'R8' && /Lieferanten/.test(h.text)), 'Eine ⊞ heißt wie ihr Prozess – die Verb-Regel gilt für sie nicht');
const pr3 = run(`prozessSchemaPruefen('<bpmn:process id="P"><bpmn:startEvent id="S"/><bpmn:subProcess id="U" name="Prüfung"/><bpmn:endEvent id="E" name="Fertig"/></bpmn:process>')`);
ok(pr3.hinweise.some(h => h.regel === 'R10' && /ausgeschriebener Unterprozess/.test(h.text)),
  'Ein ausgeschriebener Unterprozess ist ein Hinweis: als eigenes Modell anlegen und einbinden');

/* ── 4) Element-Ebene: einbinden, lesen, lösen ── */
ctx.__t1 = elem('T1', 'Auftrag erfassen', 'Hier entsteht der Auftrag.');
ctx.__t2 = elem('T2', 'Liefern', '');
ctx.__ev = elem('E1', 'Bestellt', '', 'bpmn:EndEvent');
ctx.__root = wurzel('Process_a1');
ctx.__elemente = [ctx.__t1, ctx.__t2, ctx.__ev];
ctx.__modeler = macheModeler(ctx.__elemente, [ctx.__t1], ctx.__root);
run(`_bpmnModeler = __modeler; _procEditing = { itemId: 'A', origName: 'Lead to Cash.bpmn', origWerk: 'HOL' };`);

ok(run(`procKannEinbinden(__t1)`) && run(`procKannEinbinden({ type: 'bpmn:CallActivity' })`) && !run(`procKannEinbinden(__ev)`) && !run(`procKannEinbinden({ type: 'bpmn:ExclusiveGateway' })`),
  'Nur eine Aufgabe kann ein Modell einbinden – kein Ereignis, kein Gateway');
ok(run(`procElementModell(__t1)`) === '', 'Ohne Marker kein Modell');

const neu1 = run(`procUnterprozessSetzen(__t1, 'B')`);
ok(neu1 && neu1.type === 'bpmn:CallActivity' && ersetzt.length === 1 && ersetzt[0].von === 'bpmn:UserTask',
  'Aus der Aufgabe wird eine ⊞ Aufrufaktivität – über bpmnReplace, Name und Verbindungen bleiben');
const doku1 = neu1.businessObject.documentation[0].text;
ok(/\[\[rms:modell=B\]\]/.test(doku1) && doku1.startsWith('Hier entsteht der Auftrag.') && /Unterprozess: Auftragserfassung/.test(doku1),
  'Marker und Klartext in der Dokumentation – der erklärende Text bleibt stehen');
ok(neu1.businessObject.calledElement === 'Process_b2', 'calledElement zeigt auf die Prozess-Kennung des Modells – für fremde Werkzeuge');
ok(run(`procElementModell(__elemente[0])`) === 'B', 'Und das Element weiß, welches Modell es einbindet');
ok(geschrieben.every(g => 'documentation' in g.props), 'Alles lief über modeling.updateProperties – widerrufbar');

ctx.__leer = elem('T9', '', '');
const neu2 = run(`procUnterprozessSetzen(__leer, 'B')`);
ok(neu2.businessObject.name === 'Auftragserfassung', 'Eine namenlose Aufgabe bekommt den Namen des Modells');

run(`procUnterprozessSetzen(__elemente[0], '')`);
ok(ctx.__elemente[0].businessObject.documentation[0].text === 'Hier entsteht der Auftrag.' && !('calledElement' in ctx.__elemente[0].businessObject),
  'Gelöst bleibt genau der Text, der vorher da war – calledElement ist weg');
run(`procUnterprozessSetzen(__elemente[0], 'B')`);

/* ── 5) Das Zeichen ⊞ am Element ── */
run(`procUnterMarker()`);
ok(overlays.length === 1 && overlays[0].id === 'T1' && overlays[0].typ === 'rms-unter', 'Ein Zeichen je einbindendem Element');
ok(/⊞ Auftragserfassung/.test(overlays[0].html) && /procUnterprozessOeffnen\('B'\)/.test(overlays[0].html), 'Es nennt das Modell beim Namen und öffnet es');
ctx.__tot = elem('T7', 'Alt', '[[rms:modell=GIBTESNICHT]]');
ctx.__modelerTot = macheModeler([ctx.__tot], [], wurzel('Process_x'));
run(`_bpmnModeler = __modelerTot; procUnterMarker();`);
ok(overlays.length === 1 && /b45309/.test(overlays[0].html) && /Modell fehlt/.test(overlays[0].html),
  'Ein Modell, das es nicht mehr gibt, wird als Warnung gezeigt statt still verschluckt');
run(`_bpmnModeler = __modeler;`);

/* ── 6) Wer bindet wen ein – und was wäre ein Kreis ── */
ok(run(`procBindetEin('A').join()`) === 'B' && run(`procBindetEin('B').length`) === 0, 'Der Cache sagt, was ein Modell einbindet');
ok(run(`procEingebundenIn('B').map(p => p.itemId).join()`) === 'A' && run(`procEingebundenIn('A').map(p => p.itemId).join()`) === 'D',
  'Und umgekehrt, in welchen Modellen eines steckt – gesucht, nicht gepflegt');
ok(run(`procBindetTransitiv('D', 'B')`) === true && run(`procBindetTransitiv('B', 'D')`) === false,
  'Über Stufen: D → A → B');
const kand = run(`procEinbindbar('').map(p => p.itemId).join()`);
ok(kand === 'B,C', `Für A stehen B und C zur Wahl – nicht A selbst, nicht D (das A einbindet: ein Kreis) – ${kand}`);
ok(run(`procEinbindbar('design').map(p => p.itemId).join()`) === 'C', 'Die Suche grenzt ein');
run(`_procEditing = { itemId: 'B' };`);
ok(run(`procEinbindbar('').map(p => p.itemId).join()`) === 'C', 'Für B bleibt nur C: A bindet B ein, D über A – beides wären Kreise');
run(`_procEditing = { itemId: 'A', origName: 'Lead to Cash.bpmn', origWerk: 'HOL' };`);

/* ── 7) Der Kasten in der Seitenspalte ── */
ctx.__modeler2 = macheModeler(ctx.__elemente, [], ctx.__root);
run(`_bpmnModeler = __modeler2; _renderElementUnter(true);`);
let box = felder['proc-unter'].innerHTML;
ok(/anklicken/.test(box) && /1 Unterprozess eingebunden/.test(box) && /⊞ Auftragserfassung/.test(box),
  'Ohne Auswahl: was zu tun ist – und welche Unterprozesse das Modell schon einbindet');
ok(/eingebunden in .*Gießen/.test(box) && /eine Änderung hier wirkt dort/i.test(box), 'Und in welchen Modellen dieses selbst steckt');

ctx.__modeler3 = macheModeler(ctx.__elemente, [ctx.__t2], ctx.__root);
run(`_bpmnModeler = __modeler3; _renderElementUnter(true);`);
box = felder['proc-unter'].innerHTML;
ok(/id="proc-unter-suche"/.test(box) && /procUnterprozessEinbinden\('B'\)/.test(box) && /procUnterprozessEinbinden\('C'\)/.test(box) && !/procUnterprozessEinbinden\('D'\)/.test(box) && !/procUnterprozessEinbinden\('A'\)/.test(box),
  'Eine Aufgabe ohne Modell: Suche und Einbinden-Knöpfe für alles, was kein Kreis wäre');
ok(/als neues Modell anlegen/.test(box) && /„Liefern"/.test(box), '„Liefern" gibt es nirgends – also darf man es anlegen');
ctx.__t3 = elem('T3', 'Gießen', '');
ctx.__modeler4 = macheModeler([ctx.__t3], [ctx.__t3], ctx.__root);
run(`_bpmnModeler = __modeler4; _renderElementUnter(true);`);
box = felder['proc-unter'].innerHTML;
ok(!/als neues Modell anlegen/.test(box) && /gibt es schon in .*SHB/.test(box) && /oben einbinden/.test(box),
  '„Gießen" gibt es schon (in SHB) – kein zweites Anlegen, sondern einbinden');
ctx.__modeler5 = macheModeler(ctx.__elemente, [ctx.__elemente[0]], ctx.__root);
run(`_bpmnModeler = __modeler5; _renderElementUnter(true);`);
box = felder['proc-unter'].innerHTML;
ok(/⊞ <b>Auftragserfassung<\/b>/.test(box) && /procUnterprozessOeffnen\('B'\)/.test(box) && /procUnterprozessLoesen\(\)/.test(box),
  'Ein Element mit Modell: Öffnen und Lösen');
ctx.__modeler6 = macheModeler([ctx.__ev], [ctx.__ev], ctx.__root);
run(`_bpmnModeler = __modeler6; _renderElementUnter(true);`);
ok(/Nur eine Aufgabe/.test(felder['proc-unter'].innerHTML), 'Ein Ereignis kann nichts einbinden – der Kasten sagt es');

/* ── 8) Einbinden über den Kasten – mit Kreisprüfung ── */
ctx.__modeler7 = macheModeler(ctx.__elemente, [ctx.__t2], ctx.__root);
run(`_bpmnModeler = __modeler7;`);
gemeldet.length = 0;
await run(`procUnterprozessEinbinden('D')`);
ok(gemeldet.some(t => /Kreis/.test(t)) && ctx.__elemente[1].type === 'bpmn:UserTask', 'D einzubinden wäre ein Kreis – abgewiesen, das Element bleibt wie es war');
gemeldet.length = 0;
await run(`procUnterprozessEinbinden('A')`);
ok(gemeldet.some(t => /selbst/.test(t)), 'Sich selbst einbinden geht nicht');
gemeldet.length = 0;
await run(`procUnterprozessEinbinden('C')`);
ok(ctx.__elemente[1].type === 'bpmn:CallActivity' && run(`procElementModell(__elemente[1])`) === 'C' && gemeldet.some(t => /eingebunden ✓/.test(t)),
  'C einbinden: die Aufgabe wird zur ⊞ mit Marker');
ok(run(`procLinksVon('C|m3')`) && run(`procLinksVon('C|m3').i`) === 'Process_1', 'Der fehlende Eintrag von C wurde dafür aus der Datei gelesen');
ok(!('calledElement' in ctx.__elemente[1].businessObject) || !ctx.__elemente[1].businessObject.calledElement,
  'C heißt noch „Process_1" – das ist keine Kennung, also kein calledElement (kommt beim Speichern von C)');

/* ── 9) Anlegen, was es nirgends gibt – einbinden, was es gibt ── */
ctx.__t4 = elem('T4', 'Faktura erstellen', '');
ctx.__elemente.push(ctx.__t4);
ctx.__modeler8 = macheModeler(ctx.__elemente, [ctx.__t4], ctx.__root);
run(`_bpmnModeler = __modeler8;`);
feld('proc-werk').value = 'HOL';
gespeichert.length = 0; gemeldet.length = 0;
await run(`procUnterprozessAnlegen()`);
ok(gespeichert.length === 1 && gespeichert[0].name === 'Faktura erstellen' && gespeichert[0].werk === 'HOL',
  'Ein neues Modell mit dem Namen der Aufgabe – im Ordner desselben Werks');
ok(/<bpmn:collaboration/.test(gespeichert[0].xml) && !gespeichert[0].xml.includes('Process_1'),
  'Nach Hausschema, mit eigener Kennung');
const idx4 = ctx.__elemente.findIndex(x => x.id === 'T4');
ok(ctx.__elemente[idx4].type === 'bpmn:CallActivity' && run(`procElementModell(__elemente[${idx4}])`) === 'NEU',
  'Und sofort eingebunden');
ok(ctx.__elemente[idx4].businessObject.calledElement && ctx.__elemente[idx4].businessObject.calledElement === run(`procKennungAusXml(${JSON.stringify(gespeichert[0].xml)})`),
  'calledElement zeigt auf die Kennung des neuen Modells – die kennt der Editor, er hat sie gerade geschrieben');
ok(run(`procModellVon('NEU')`) && /speichern/i.test(felder['proc-status'].innerHTML), 'Die Liste kennt das neue Modell; der Status erinnert ans Speichern');

ctx.__t5 = elem('T5', 'Auftragserfassung', '');
ctx.__elemente.push(ctx.__t5);
ctx.__modeler9 = macheModeler(ctx.__elemente, [ctx.__t5], ctx.__root);
run(`_bpmnModeler = __modeler9;`);
gespeichert.length = 0; gemeldet.length = 0;
await run(`procUnterprozessAnlegen()`);
ok(gespeichert.length === 0 && run(`procElementModell(__elemente[__elemente.length - 1])`) === 'B' && gemeldet.some(t => /eingebunden statt doppelt angelegt/.test(t)),
  '„Auftragserfassung" gibt es schon – eingebunden statt ein zweites Mal angelegt');

/* ── 10) Speichern: eine Kennung je Modell, ein Name je Ordner ── */
ok(run(`procKennungSichern()`).neu === 'Process_a1', 'Eine gültige, einmalige Kennung bleibt');
ctx.__rootAlt = wurzel('Process_1');
ctx.__modeler10 = macheModeler(ctx.__elemente, [], ctx.__rootAlt);
run(`_bpmnModeler = __modeler10;`);
const ks = run(`procKennungSichern()`);
ok(ks.alt === 'Process_1' && ks.neu !== 'Process_1' && ctx.__rootAlt.businessObject.id === ks.neu && ctx.__rootAlt.id === ks.neu,
  '„Process_1" wird beim Speichern zur eigenen Kennung – über modeling, damit die Zeichenfläche mitgeht');
ctx.__rootDoppel = wurzel('Process_b2');
ctx.__modeler11 = macheModeler(ctx.__elemente, [], ctx.__rootDoppel);
run(`_bpmnModeler = __modeler11;`);
const kd = run(`procKennungSichern()`);
ok(kd.alt === 'Process_b2' && kd.neu !== 'Process_b2', 'Eine Kennung, die ein anderes Modell schon trägt (importierte Kopie), wird ersetzt – das ältere behält seine');

// Der Abgleich zieht calledElement nach, sobald das Ziel eine Kennung hat.
run(`_procLinkCache['C|m3'] = { p: [], d: 0, k: false, i: 'Process_c3', u: ['B'] };`);
ctx.__modeler12 = macheModeler(ctx.__elemente, [], ctx.__root);
run(`_bpmnModeler = __modeler12;`);
const n = run(`procUnterprozesseAbgleichen()`);
ok(n >= 1 && ctx.__elemente[1].businessObject.calledElement === 'Process_c3',
  'Vor dem Speichern bekommt jede ⊞ die aktuelle Kennung ihres Modells – die Datei-Kennung im Marker ist die Wahrheit');

// Namensdoppel im selben Werk: nicht speichern – das überschriebe die andere Datei.
feld('proc-name').value = 'Gießen';
feld('proc-werk').value = 'SHB';
run(`_procEditing = { itemId: null, origName: '', origWerk: '' };`);
gespeichert.length = 0; gemeldet.length = 0;
await run(`saveProcess()`);
ok(gespeichert.length === 0 && gemeldet.some(t => /„Gießen" gibt es in .*SHB.* schon/.test(t)),
  'Ein zweites „Gießen" in SHB wird abgewiesen – es überschriebe das erste');
feld('proc-werk').value = 'HOL';
gespeichert.length = 0; gemeldet.length = 0;
await run(`saveProcess()`);
ok(gespeichert.length === 1 && gespeichert[0].werk === 'HOL' && gemeldet.some(t => /gespeichert ✓/.test(t)),
  'In HOL darf „Gießen" heißen – HOL/Gießen und SHB/Gießen sind zwei Prozesse');
// Das neue Modell trug noch die Kennung von A (Process_a1) – beim Speichern bekommt es eine eigene.
ok(!gespeichert[0].xml.includes('Process_a1') && /<bpmn:process id="Process_[a-z0-9]{6,}"/.test(gespeichert[0].xml)
  && /Gespeichert: Gießen.bpmn ✓ · Kennung <code>Process_/.test(felder['proc-status'].innerHTML),
  'Ein neues Modell mit der Kennung eines vorhandenen bekommt beim Speichern eine eigene – der Status nennt sie');

/* ── 11) Der Weg zurück ── */
run(`_procPfad = ['A'];`);
ok(run(`_procPfad.length`) === 1 && /procZurueck\(\)/.test(lies('js/prozesse.js')) && /↰ Zurück zu/.test(lies('js/prozesse.js')),
  'Wer in den Unterprozess wechselt, kommt über „↰ Zurück zu …" in den Hauptprozess');
ok(/_procPfad = \[\];\s*\/\/ der Weg/.test(lies('js/prozesse.js')), 'Zurück zur Liste beendet den Weg');

/* ── 12) Angeschlossen: Liste, Mindmap, Doku ── */
const pjs = lies('js/prozesse.js');
ok(/⊞ \$\{e\.u\.length\}/.test(pjs) && /↰ \$\{oben\.length\}/.test(pjs), 'Die Karte zeigt ⊞ n (bindet ein) und ↰ n (ist eingebunden)');
ok(/bus\.on\('selection\.changed', \(\) => \{ _renderElementSprung\(canWrite\); _renderElementUnter\(canWrite\); \}\)/.test(pjs),
  'Der Kasten folgt der Auswahl im Diagramm');
ok(/'bindet ein'/.test(lies('js/verknuepfungen.js')) && /'bindet ein': 'eingebunden in'/.test(lies('js/verknuepfungen.js')),
  'Die Verknüpfungen kennen die Kante „bindet ein"');
ok(/'bindet ein'/.test(lies('js/mindmapbaum.js')), 'Im Baum hängt das eingebundene Modell unter dem einbindenden');
ok(/Unterprozesse einbinden – ein Modell im Modell/.test(lies('js/dokumentation.js')) && /Kennung und Name – eindeutig, einmalig/.test(lies('js/dokumentation.js')),
  'Die Dokumentation erklärt Einbinden und Kennung');
ok(/\(Unterprozess\)/.test(lies('js/dokumentation.js')), 'Und die Schreibweise „(Unterprozess)"');

/* ── 13) Lesen: gedrosselt, ohne Doppelanfragen, Karte für Karte ── */
let gleichzeitig = 0, hoechst = 0, anfragen = 0;
ctx.spGetProcessXml = async (id) => {
  anfragen++; gleichzeitig++; hoechst = Math.max(hoechst, gleichzeitig);
  await new Promise(r => setTimeout(r, 5));
  gleichzeitig--;
  return '<bpmn:definitions><bpmn:process id="Process_' + id + '"/></bpmn:definitions>';
};
ctx.__viele = Array.from({ length: 12 }, (_, i) => ({ itemId: 'V' + i, title: 'Modell ' + i, ordner: 'HOL', modified: 'v' }));
run(`_processes = __viele.slice();`);
const zwei = await Promise.all([run(`procEintragLaden(__viele[0])`), run(`procEintragLaden(__viele[0])`)]);
ok(anfragen === 1 && zwei[0].i === 'Process_V0' && zwei[1].i === 'Process_V0',
  'Zwei gleichzeitige Leser derselben Datei – eine Anfrage, beide bekommen den Eintrag');
ok(run(`procEintragVon(__viele[0]).i`) === 'Process_V0', 'Und der Eintrag liegt im Cache');
anfragen = 0; hoechst = 0;
const fertig = [];
ctx.__fertig = (p, e) => fertig.push(p.itemId + ':' + (e ? e.i : '-'));
const n13 = await run(`procEintraegeLaden(__viele, __fertig)`);
ok(n13 === 11 && anfragen === 11, 'Elf fehlten, elf wurden gelesen – die gecachte nicht noch einmal');
ok(hoechst <= 5, `Höchstens fünf nebeneinander (${hoechst}) – SharePoint drosselt sonst`);
ok(fertig.length === 11 && fertig.includes('V7:Process_V7'), 'Je Modell ein Rückruf, sobald es da ist – die Karte zieht nach, ohne auf die letzte zu warten');
ok(await run(`procEintraegeLaden(__viele)`) === 0 && anfragen === 11, 'Ein zweiter Lauf liest nichts mehr');
ctx.spGetProcessXml = async (id) => ctx.__xml[id] || '';
run(`_processes = __liste.slice();`);
ok(/procEintraegeLaden\(rows, \(p, e\) =>/.test(lies('js/prozesse.js')) && !/function _enrichProcessCard/.test(lies('js/prozesse.js')),
  'Die Modell-Liste liest über denselben gedrosselten Leser – kein zweiter Weg zur Datei');
ok(/if \(_procLadeLauf\) \{ try \{ await _procLadeLauf; \}/.test(lies('js/prozesse.js')),
  'Das Speichern wartet auf das Hintergrund-Lesen – erst wissen, was die anderen heißen, dann die Kennung prüfen');
ok(/procEintragLaden\(p\)/.test(lies('js/verknuepfungen.js')) && /vorab\.slice\(i, i \+ 5\)/.test(lies('js/verknuepfungen.js')),
  'Die Mindmap liest über denselben Leser und ebenfalls fünf nebeneinander');

/* ── 14) Suche nach Werk oder Kennung, Eingabetaste bindet ein ── */
run(`_procEditing = { itemId: 'C', origName: 'Design to Operate.bpmn', origWerk: 'HOL' };`);
ok(run(`procEinbindbar('shb').map(p => p.itemId).join()`) === 'D', 'Suche „shb" findet das Modell des Werks');
ok(run(`procEinbindbar('Process_b2').map(p => p.itemId).join()`) === 'B', 'Suche nach der Prozess-Kennung findet das Modell');
ctx.__t6 = elem('T6', 'Gießen vorbereiten', '');
ctx.__modeler14 = macheModeler([ctx.__t6], [ctx.__t6], wurzel('Process_c3'));
run(`_bpmnModeler = __modeler14;`);
feld('proc-unter-suche').value = 'shb';
gemeldet.length = 0;
await run(`procUnterprozessSucheTaste({ key: 'Enter', preventDefault() { globalThis.__pd = true; } })`);
await new Promise(r => setTimeout(r, 10));
ok(run(`procElementModell(__t6) || ''`) === '' && ctx.__modeler14.get('elementRegistry').filter(() => true)[0].type === 'bpmn:CallActivity'
  && run(`procElementModell(_bpmnModeler.get('elementRegistry').filter(() => true)[0])`) === 'D',
  'Eingabetaste bei genau einem Treffer: eingebunden');
feld('proc-unter-suche').value = '';
gemeldet.length = 0;
ctx.__t7 = elem('T7', 'Noch eins', '');
ctx.__modeler15 = macheModeler([ctx.__t7], [ctx.__t7], wurzel('Process_c3'));
run(`_bpmnModeler = __modeler15;`);
await run(`procUnterprozessSucheTaste({ key: 'Enter', preventDefault() {} })`);
ok(gemeldet.some(t => /Modelle passen – Suche eingrenzen/.test(t)) && ctx.__t7.type === 'bpmn:UserTask',
  'Bei mehreren Treffern passiert nichts – außer dem Hinweis');
ok(/position: \{ top: -10, left: 10 \}/.test(lies('js/prozesse.js').split('function procUnterMarker')[1].slice(0, 900)),
  'Das ⊞-Zeichen sitzt oben links – unten in der Mitte zeichnet bpmn-js das eigene ⊞ der Aufrufaktivität');

/* ── 15) Ein neuer Unterprozess fängt in der Bahn seiner Aufgabe an ── */
ctx.__t8 = elem('T8', 'Schmelze freigeben', '');
ctx.__bahn = { id: 'Lane_9', type: 'bpmn:Lane', businessObject: { $type: 'bpmn:Lane', name: 'Schmelzbetrieb', flowNodeRef: [ctx.__t8.businessObject] } };
ctx.__modeler16 = macheModeler([ctx.__bahn, ctx.__t8], [ctx.__t8], wurzel('Process_c3'));
run(`_bpmnModeler = __modeler16;`);
ok(run(`_procBahnVon(__t8)`) === 'Schmelzbetrieb' && run(`_procBahnVon(__t7)`) === '', 'Die Bahn eines Elements ist bekannt – oder eben nicht');
feld('proc-werk').value = 'SHB';
gespeichert.length = 0;
await run(`procUnterprozessAnlegen()`);
ok(gespeichert.length === 1 && /<bpmn:lane\b[^>]*name="Schmelzbetrieb"/.test(gespeichert[0].xml),
  'Das neue Modell beginnt in der Bahn „Schmelzbetrieb" – wer hier zuständig ist, ist es meist auch dort');

/* ── 16) Namen vergleichen in der Form, in der sie als Datei liegen ── */
ctx.spProzessDateiname = (name) => String(name || 'Prozess').replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '_').trim() || 'Prozess';
run(`_processes.push({ itemId: 'E', name: 'Ein_Auslagern.bpmn', title: 'Ein_Auslagern', ordner: 'HOL', modified: 'm5' });`);
ok(run(`procNamensDoppel('Ein/Auslagern').map(p => p.itemId).join()`) === 'E',
  '„Ein/Auslagern" wäre als Datei „Ein_Auslagern" – also derselbe Prozess, kein zweiter');
ok(run(`procNamensDoppel('Ein_Auslagern.bpmn').map(p => p.itemId).join()`) === 'E', 'Mit oder ohne Endung – derselbe Name');
delete ctx.spProzessDateiname;
ok(/function spProzessDateiname\(name\)/.test(lies('js/sharepoint.js')) && /const safe = spProzessDateiname\(name\);/.test(lies('js/sharepoint.js')),
  'Den Dateinamen bildet eine Stelle in sharepoint.js – Speichern und Vergleich nutzen dieselbe');
ok(/typeof procLeeresBpmn === 'function' \? procLeeresBpmn\(\)/.test(lies('js/landkarte.js')),
  'Auch ein aus der Landkarte angelegtes Modell bekommt eine Kennung statt „Process_1"');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
