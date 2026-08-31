/**
 * Übergänge auf Element-Ebene.
 *
 * Ein Verweis an der Landkarten-Kachel sagt „nach dem Vertrieb kommt die
 * Fertigung". Er sagt nicht, AN WELCHER STELLE der Ablauf hinübergeht – und
 * genau das ist die Frage, wenn jemand vor dem Diagramm steht.
 *
 * Der Marker liegt deshalb in der Dokumentation des Elements, wie die
 * Richtlinien in der des Prozesses:  [[rms:prozess=WERK:KACHEL]]
 * Damit wandert er mit der .bpmn-Datei – über Export, Umbenennung und den
 * Umzug in ein anderes Werk hinweg. Eine zweite Ablage, die man vergessen
 * kann, gibt es nicht.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* Ein Modeler, wie bpmn-js ihn stellt – nur so weit, wie er hier gebraucht wird. */
const geschrieben = [];      // Aufrufe von modeling.updateProperties
const overlays = [];         // gesetzte Zeichen

function macheModeler(elemente, auswahl) {
  return {
    get(dienst) {
      if (dienst === 'moddle') return { create: (typ, attrs) => ({ $type: typ, ...attrs }) };
      if (dienst === 'modeling') return {
        updateProperties: (el, props) => {
          geschrieben.push({ el, props });
          Object.assign(el.businessObject, props);
        },
      };
      if (dienst === 'elementRegistry') return { filter: (fn) => elemente.filter(fn) };
      if (dienst === 'selection') return { get: () => auswahl };
      if (dienst === 'overlays') return {
        add: (id, typ, opt) => overlays.push({ id, typ, html: opt.html }),
        remove: () => { overlays.length = 0; },
      };
      if (dienst === 'eventBus') return { on: () => {} };
      if (dienst === 'commandStack') return { canUndo: () => false };
      throw new Error('unbekannter Dienst: ' + dienst);
    },
  };
}

const elem = (id, name, doku) => ({
  id, type: 'bpmn:Task',
  businessObject: { name, documentation: doku ? [{ text: doku }] : undefined },
});

let ausgabe = '';
const ctx = {
  console, URLSearchParams, setTimeout, clearTimeout, Array, Object, String, JSON, Set, Promise, Math, Date,
  document: {
    addEventListener() {}, querySelectorAll: () => [],
    getElementById: (id) => (id === 'proc-elem-link'
      ? { set innerHTML(v) { ausgabe = v; }, get innerHTML() { return ausgabe; } } : null),
  },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { search: '' },
  esc: (s) => String(s ?? ''),
  toast: () => {},
  openModal: () => {}, closeModal: () => {}, canWriteTab: () => true,
  State: { policies: [], konzepte: [] },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);     // Ziele kommen aus der Landkarte
vm.runInContext(lies('js/prozesse.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* Zwei Werke – ein Übergang darf die Gesellschaft wechseln. */
run(`
_lkDaten = { karten: {
  HOL: { kacheln: [{ id: 'vertrieb', band: 'kern', name: 'Vertrieb' }] },
  SHB: { kacheln: [{ id: 'giessen',  band: 'kern', name: 'Gießen' }] },
} };
_lkWerk = 'HOL';
`);

/* ── 1) Lesen ── */
ctx.__el = elem('Task_1', 'Auftrag freigeben', 'Der Auftrag geht in die Fertigung.\n[[rms:prozess=SHB:giessen]]');
ok(run(`procElementZiel(__el)`) === 'SHB:giessen', 'Das Sprungziel steht in der Dokumentation des Elements');
ctx.__leer = elem('Task_2', 'Prüfen', 'Nur ein erklärender Text.');
ok(run(`procElementZiel(__leer)`) === '', 'Ein Element ohne Marker hat kein Ziel');
ok(run(`procElementZiel({})`) === '', 'Und ein Element ohne Dokumentation ebenfalls');
ok(run(`procElementZiel({ labelTarget: __el })`) === '',
  'Ein Beschriftungselement trägt selbst nichts – gemeint ist das Element dahinter');

/* ── 2) Schreiben – ohne den erklärenden Text zu verlieren ── */
ctx.__modeler = macheModeler([], []);
run(`_bpmnModeler = __modeler;`);
ctx.__neu = elem('Task_3', 'Ware annehmen', 'Wareneingang prüfen und einlagern.');
run(`procElementZielSetzen(__neu, 'HOL:vertrieb')`);
const text1 = ctx.__neu.businessObject.documentation[0].text;
ok(/\[\[rms:prozess=HOL:vertrieb\]\]/.test(text1), 'Der Marker wird geschrieben');
ok(text1.startsWith('Wareneingang prüfen und einlagern.'), 'Der vorhandene Text bleibt stehen');
ok(text1.includes('Weiter im Prozess: Vertrieb'),
  'Und darüber der Klartext – auch ein fremder Modeler zeigt dann, wohin es geht');

run(`procElementZielSetzen(__neu, 'SHB:giessen')`);
const text2 = ctx.__neu.businessObject.documentation[0].text;
ok((text2.match(/\[\[rms:prozess=/g) || []).length === 1, 'Ein zweites Ziel ersetzt das erste, es sammelt sich nichts an');
ok(text2.includes('SHB:giessen') && !text2.includes('HOL:vertrieb'), 'Und zwar das neue');

run(`procElementZielSetzen(__neu, '')`);
ok(ctx.__neu.businessObject.documentation[0].text === 'Wareneingang prüfen und einlagern.',
  'Gelöst bleibt genau der Text übrig, der vorher da war');

ctx.__ohne = elem('Task_4', 'Schritt', '');
run(`procElementZielSetzen(__ohne, 'HOL:vertrieb')`);
run(`procElementZielSetzen(__ohne, '')`);
ok(ctx.__ohne.businessObject.documentation === undefined,
  'Ohne Text bleibt keine leere Dokumentation zurück');
ok(geschrieben.length === 5 && geschrieben.every(g => 'documentation' in g.props),
  'Jede Änderung lief über modeling.updateProperties – damit ist sie widerrufbar');

/* ── 3) Das sichtbare Zeichen ──
   Ein Verweis, den man nicht sieht, ist keiner. */
ctx.__mit = elem('Task_5', 'Übergabe', '[[rms:prozess=SHB:giessen]]');
ctx.__label = { id: 'Task_5_label', type: 'label', labelTarget: ctx.__mit, businessObject: ctx.__mit.businessObject };
ctx.__modeler2 = macheModeler([ctx.__mit, ctx.__label, ctx.__leer], []);
run(`_bpmnModeler = __modeler2;`);
ok(run(`procSprungElemente().length`) === 1,
  'Nur Elemente mit Ziel bekommen ein Zeichen – die Beschriftung nicht doppelt');
run(`procSprungMarker()`);
ok(overlays.length === 1 && overlays[0].id === 'Task_5', 'Das Zeichen hängt am richtigen Element');
ok(/procSprungOeffnen\('SHB:giessen'\)/.test(overlays[0].html), 'Und es ist anklickbar');
ok(overlays[0].html.includes('Gießen'), 'Es nennt das Ziel beim Namen, nicht nur die Kennung');

ctx.__tot = elem('Task_6', 'Alt', '[[rms:prozess=HOL:gibtesnicht]]');
ctx.__modeler3 = macheModeler([ctx.__tot], []);
run(`_bpmnModeler = __modeler3; procSprungMarker();`);
ok(overlays.length === 1 && /b45309/.test(overlays[0].html),
  'Ein Ziel, das es nicht mehr gibt, wird als Warnung gezeigt statt still verschluckt');

/* ── 4) Der Kasten in der Seitenspalte folgt der Auswahl ── */
ctx.__modeler4 = macheModeler([ctx.__mit], [ctx.__mit]);
run(`_bpmnModeler = __modeler4; _renderElementSprung(true);`);
ok(ausgabe.includes('Übergabe'), 'Der Kasten zeigt das ausgewählte Element');
ok(/<option value="SHB:giessen" selected>/.test(ausgabe) || /value="SHB:giessen" selected/.test(ausgabe),
  'Sein Ziel steht in der Liste vorausgewählt');
ok(ausgabe.includes('Vertrieb') && ausgabe.includes('Gießen'),
  'Zur Wahl stehen die Kacheln aller Werke – ein Übergang darf die Gesellschaft wechseln');

ctx.__modeler5 = macheModeler([ctx.__mit], []);
run(`_bpmnModeler = __modeler5; _renderElementSprung(true);`);
ok(/anklicken/.test(ausgabe), 'Ohne Auswahl steht dort, was zu tun ist');
ok(/1 Übergang/.test(ausgabe), 'Und wie viele Übergänge das Modell schon hat');

/* ── 5) Der Marker überlebt das Speichern ──
   Er steht in der BPMN-Datei, nicht in einer zweiten Ablage. */
const quelle = lies('js/prozesse.js');
ok(/bpmn:Documentation/.test(quelle.split('procElementZielSetzen')[1].slice(0, 900)),
  'Geschrieben wird echte BPMN-Dokumentation – kein eigenes Attribut, das ein fremdes Werkzeug verwürfe');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
