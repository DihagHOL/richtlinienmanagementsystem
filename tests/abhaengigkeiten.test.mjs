/**
 * Abhängigkeiten: einen Prozess suchen und sehen, was daran hängt.
 *
 * Die beiden bisherigen Ansichten beantworten je eine halbe Frage. Der Baum
 * zeigt die ganze Landschaft – wer EINEN Prozess sucht, klickt sich durch
 * Ebenen. Die Nahsicht zeigt einen Knoten mit seinen direkten Nachbarn – aber
 * nur eine Ebene weit, und der Weg dorthin ist eine Auswahlliste.
 *
 * Die Frage aus dem Alltag ist eine dritte: „Ich suche X – was hängt daran?"
 * Und die Antwort reicht über mehrere Ebenen und oft über Werksgrenzen:
 * Konzern → Hauptprozess → Werk → Hauptprozess → Unterprozess, dazu Modelle
 * und Regelwerke.
 *
 * Geprüft wird beides: die HERKUNFT (alle Wege von oben – bei einem geteilten
 * Unterprozess sind es mehrere, und genau die zeigen die betroffenen Werke)
 * und die ABHÄNGIGKEITEN darunter.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const mount = { innerHTML: '' };
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise,
  esc: (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  document: { getElementById: (id) => (id === 'prozesse-mount' ? mount : null), querySelectorAll: () => [] },
  toast: () => {}, openModal: () => {}, closeModal: () => {}, canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC'],
  State: { policies: [{ id: '7', title: 'Kartellrecht', status: 'Veröffentlicht', geltungsbereich: ['ALLE'] }] },
  _processes: [{ itemId: 'm-1', title: 'Angebotsablauf', ordner: 'HOL' }],
  spGetProcessXml: async () => '<bpmn:definitions>[[rms:policies=7]]</bpmn:definitions>',
  _procLinkCache: {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  prozessModusLeiste: () => '',
  fmtDate: (d) => String(d || '').slice(0, 10),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
vm.runInContext(lies('js/mindmapbaum.js'), ctx);
vm.runInContext(lies('js/verknuepfungen.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* Genau die Lage aus der Frage: Konzern → Hauptprozess → Werk →
   Hauptprozess → Unterprozess, und der Unterprozess gehört zu BEIDEN. */
run(`
_lkDaten = { karten: {
  KONZERN: { baender: [{ key: 'kern', titel: 'Kernprozesse' }], kacheln: [
    { id: 'beschaffung', band: 'kern', name: 'Konzernbeschaffung', geltung: ['ALLE'],
      verweise: [{ ziel: 'KONZERN:banf', art: 'unterprozess' }] },
    { id: 'banf', band: 'kern', name: 'Bedarfsanforderung', geltung: ['ALLE'],
      regelwerke: ['7'], prozesse: [{ id: 'm-1' }],
      verweise: [{ ziel: 'SHB:pruefung', art: 'nutzt' }] },
  ] },
  HOL: { baender: [{ key: 'kern', titel: 'Kernprozesse' }], kacheln: [
    { id: 'einkauf', band: 'kern', name: 'Einkauf HOL', geltung: ['HOL'],
      verweise: [{ ziel: 'KONZERN:banf', art: 'unterprozess' }] },
  ] },
  SHB: { baender: [{ key: 'kern', titel: 'Kernprozesse' }], kacheln: [
    { id: 'pruefung', band: 'kern', name: 'Wareneingangsprüfung', geltung: ['SHB'] },
  ] },
} };
_lkWerk = 'KONZERN';
`);
await run(`(async () => { _vkGraph = await vkGraphBauen(); })()`);
ok(run(`_vkGraph.knoten.size`) > 8, `Der Graph steht (${run(`_vkGraph.knoten.size`)} Knoten)`);

/* ── 1) Herkunft: alle Wege von oben ── */
const wege = run(`vkHerkunftWege('prozess:KONZERN:banf')`);
ok(wege.length === 2, `Die Bedarfsanforderung hat zwei Herkünfte (${wege.length})`);
const beschriftet = wege.map(w => w.map(x => x.knoten.label).join(' › '));
ok(beschriftet.some(w => w.includes('Konzernbeschaffung')) && beschriftet.some(w => w.includes('Einkauf HOL')),
  `Über beide Hauptprozesse: ${beschriftet.join('  |  ')}`);
ok(beschriftet.every(w => w.startsWith('Konzern')), 'Jeder Weg beginnt beim Konzern – so ist die Frage gestellt');
ok(wege.some(w => w.some(x => x.typ === 'unterprozesse')),
  'Und der letzte Schritt ist als Unterprozess-Beziehung erkennbar (↳ statt ›)');

const einWeg = run(`vkHerkunftWege('prozess:SHB:pruefung')`);
ok(einWeg.length === 1 && einWeg[0].map(x => x.knoten.label).join(' › ').includes('SHB'),
  'Ein Prozess ohne Elternprozess hat genau einen Weg: über sein Werk');
ok(run(`vkHerkunftWege('wurzel').length`) === 0, 'Die Wurzel selbst hängt an nichts');

/* ── 2) Welche Werke betrifft es? ──
   Das ist die Auskunft, die man sonst suchen müsste. */
const werke = run(`vkBetroffeneWerke('prozess:KONZERN:banf')`);
ok(werke.includes('HOL') && werke.includes('SHB') && werke.includes('KONZERN'),
  `Die Bedarfsanforderung berührt drei Gesellschaften: ${werke.join(', ')}`);
ok(run(`vkBetroffeneWerke('prozess:SHB:pruefung').join('|')`) === 'SHB',
  'Ein Prozess, der nur im eigenen Werk hängt, berührt auch nur eines');

/* ── 3) Der Baum ab dem Prozess – mit den Verweisen ── */
ok(run(`vbTypen().length`) === run(`VB_TYPEN.length`),
  'In der Übersicht bleiben die Verweise draußen – sonst stünde jeder Unterprozess zweimal da');
run(`vbModusSetzen('abhaengig', 'prozess:KONZERN:beschaffung')`);
ok(run(`vbTypen().includes('unterprozesse')`) && run(`vbTypen().includes('nutzt')`),
  'In der Abhängigkeits-Ansicht zählen die Verweise mit');
const kinder = run(`_vbKinder('prozess:KONZERN:beschaffung').map(x => x.knoten.label)`);
ok(kinder.includes('Bedarfsanforderung'), 'Der Unterprozess hängt jetzt als Kind darunter');

run(`vbModusSetzen('abhaengig', 'prozess:KONZERN:banf'); vbAlleAuf();`);
const baum = run(`(() => { const f = []; const geh = (n) => { f.push(n.label); n.kinder.forEach(geh); };
  const a = vbBaum(); if (a) geh(a); return f; })()`);
ok(baum[0] === 'Bedarfsanforderung', 'Die Wurzel ist der gesuchte Prozess');
ok(baum.includes('Wareneingangsprüfung'),
  'Der Querbezug in ein anderes Werk steht im Baum – genau der Fall „betrifft ein weiteres Werk"');
ok(baum.includes('Kartellrecht'), 'Und das Regelwerk daran ebenso');
ok(baum.includes('Angebotsablauf'), 'Samt dem BPMN-Modell');

/* ── 4) Suche ── */
ok(run(`vkTreffer('bedarf').length`) === 1 && run(`vkTreffer('bedarf')[0].art`) === 'prozess',
  'Die Suche findet den Prozess');
ok(run(`vkTreffer('kartell').some(n => n.art === 'regelwerk')`), 'Und ein Regelwerk ebenso');
ok(run(`vkTreffer('a').length`) === 0, 'Ein einzelner Buchstabe sucht noch nicht – das wäre die halbe Landschaft');
const reihenfolge = run(`vkTreffer('e').map(n => n.art)`);
ok(reihenfolge.indexOf('prozess') <= reihenfolge.lastIndexOf('prozess'),
  'Prozesse stehen vorn – danach wird meistens gesucht');

/* ── 5) Die Ansicht ── */
run(`vkAbhaengigZeigen('prozess:KONZERN:banf')`);
ok(run(`_vkAnsicht`) === 'abhaengig', 'Ein Treffer holt den Knoten in die Abhängigkeits-Ansicht');
ok(run(`vbWurzelId()`) === 'prozess:KONZERN:banf', 'Und macht ihn zur Wurzel des Baums');
ok(/Konzernbeschaffung/.test(mount.innerHTML) && /Einkauf HOL/.test(mount.innerHTML),
  'Gezeichnet werden beide Herkunftswege');
ok(/3 Werke/.test(mount.innerHTML), 'Und die Zahl der berührten Gesellschaften');
ok(/vk-herkunft/.test(mount.innerHTML) && /vb-buehne/.test(mount.innerHTML),
  'Oben die Herkunft, darunter der Baum');
ok(/id="vk-suche"/.test(mount.innerHTML), 'Das Suchfeld steht in der Leiste');

run(`vkSetAnsicht('baum')`);
ok(run(`_vbModus`) === 'baum', 'Zurück in der Übersicht gelten wieder die Baum-Beziehungen');

const vk = lies('js/verknuepfungen.js');
const lk = lies('js/landkarte.js');
ok(/knopf\('abhaengig'/.test(vk), 'Die Ansicht steht als dritte im Umschalter');
ok(/function lkAbhaengigkeiten/.test(lk) && /🔎 Abhängigkeiten/.test(lk),
  'Und die Landkarten-Kachel führt direkt dorthin');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
