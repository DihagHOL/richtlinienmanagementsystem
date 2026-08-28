/**
 * „Verknüpfungen konnten nicht gelesen werden: ids.forEach is not a function"
 *
 * Der Verknüpfungs-Cache (`_procLinkCache`, `itemId|modified → …`) hatte zwei
 * Schreiber mit verschiedenen Formen:
 *
 *   prozesse.js        procLinksMerken(key, { p: ids, d: docs, k: kaputt })
 *   verknuepfungen.js  procLinksMerken(key, ids)
 *
 * Die Prozessliste fing beim Lesen beide Formen ab, die Mindmap gab den
 * Eintrag ungeprüft zurück – und `ids.forEach` traf auf ein Objekt. Weil der
 * Cache in `localStorage` liegt, überlebte die falsche Form das Neuladen.
 *
 * Jetzt entscheidet genau eine Stelle, wie ein Eintrag aussieht:
 * `procLinkEintrag()` in `js/util.js` – eine reine Funktion über den Eintrag,
 * ohne globalen Zustand, damit auch Dateien sie erreichen, die einzeln
 * geladen werden. Die Ablage selbst bleibt bei ihrem Eigentümer.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const ctx = {
  console, URLSearchParams, setTimeout, clearTimeout,
  document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { search: '' },
  esc: (s) => String(s ?? ''),
  State: { policies: [], konzepte: [] },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);       // procLinkEintrag
vm.runInContext(lies('js/prozesse.js'), ctx);
vm.runInContext(lies('js/verknuepfungen.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* ── 1) Ein Leser, der beide Formen versteht ── */
run(`_procLinkCache = {
  neu:  { p: ['7', '9'], d: 2, k: false },
  alt:  ['7', '9'],
  leer: { p: [], d: 0, k: true },
};`);

ok(run(`procLinksVon('fehlt')`) === null, 'Was nicht im Cache liegt, ergibt null');

const neu = run(`procLinksVon('neu')`);
ok(Array.isArray(neu.p) && neu.p.length === 2 && neu.d === 2 && neu.k === false,
  'Die heutige Form kommt unverändert zurück');
ok(neu.alt === false, 'Und gilt als vollständig');

const alt = run(`procLinksVon('alt')`);
ok(Array.isArray(alt.p) && alt.p.length === 2, 'Ein alter Eintrag (nur die Liste) wird zur heutigen Form');
ok(alt.alt === true, 'Ist aber als unvollständig gekennzeichnet – die Datei wird noch einmal gelesen');
ok(alt.d === 0 && alt.k === false, 'Anlagen und „kein Diagramm" sind dort schlicht unbekannt');

/* ── 2) Der Absturz selbst: Objekt im Cache, Liste erwartet ── */
run(`_procLinkCache = { '42|2026-08-28': { p: ['7'], d: 1, k: false } };`);
const ids = await run(`_vkModellLinks({ itemId: '42', modified: '2026-08-28' })`);
ok(Array.isArray(ids), '_vkModellLinks liefert eine Liste, auch wenn im Cache ein Objekt liegt');
ok(typeof ids.forEach === 'function' && ids.length === 1 && ids[0] === '7',
  'Und darin stehen die Kennungen – genau hier ist „ids.forEach is not a function" entstanden');

/* ── 3) Beide Schreiber legen dieselbe Form ab ── */
const vk = lies('js/verknuepfungen.js');
ok(/procLinksMerken\(key, eintrag\)/.test(vk),
  'verknuepfungen.js schreibt die vollständige Form, nicht nur die Liste');
ok(/d: \(typeof _parseProcessDocs === 'function'\)/.test(vk) && /k: !\/<\(bpmn:\)\?definitions/.test(vk),
  'Also samt Anlagen-Zahl und der Frage, ob ein Diagramm drinsteht');
ok(!/return _procLinkCache\[key\]/.test(vk), 'Und packt den Cache nicht mehr selbst aus');

/* ── 4) Die Form entscheidet genau eine Stelle ──
   Nicht „wer darf lesen" ist die Frage – beide Dateien dürfen –, sondern
   „wer legt fest, wie ein Eintrag aussieht". Genau daran hing der Fehler. */
const jsDateien = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
ok(/function procLinkEintrag\(e\)/.test(lies('js/util.js')),
  'procLinkEintrag() steht in util.js – der Datei ohne Abhängigkeiten, die jede andere laden kann');

const auspacker = jsDateien.filter(f => /_procLinkCache\[key\]/.test(lies('js/' + f)));
const ohneHelfer = auspacker.filter(f => !/procLinkEintrag\(/.test(lies('js/' + f)));
ok(ohneHelfer.length === 0,
  'Wer den Cache ausliest, geht durch procLinkEintrag()' + (ohneHelfer.length ? ' – nicht: ' + ohneHelfer.join(', ') : ''));
ok(auspacker.length === 2, `Und das tun genau zwei Dateien: ${auspacker.join(', ')}`);

// Niemand baut die Formunterscheidung ein zweites Mal nach.
const eigenbau = jsDateien.filter(f => f !== 'util.js' && /Array\.isArray\(e\)\s*\?\s*\{ p:/.test(lies('js/' + f)));
ok(eigenbau.length === 0,
  'Und niemand entscheidet die Form selbst' + (eigenbau.length ? ' – doch in: ' + eigenbau.join(', ') : ''));

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
