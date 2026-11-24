/**
 * Die Landkarten der Werke als Vorlage.
 *
 * Vorlagen mit den Inhalten einer Gesellschaft (aus ihrem Managementhandbuch,
 * mit Dokumentnummern) gehören nicht in den öffentlichen Code. Sie liegen als
 * eigene Vorlagen in den Daten der Landkarte auf SharePoint und tragen ihr Werk.
 * Geprüft wird mit einer erfundenen Werkslandschaft:
 *
 *   • Im Code stehen nur allgemeine Vorlagen, keine Namen von Werken.
 *   • Die eigene Vorlage eines Werks ist beim Öffnen seiner Karte vorgewählt.
 *   • Eine große Landschaft bleibt lesbar: Die Karte zeigt die Hauptprozesse
 *     und ordnet den Rest darunter ein, drei Ebenen tief, mit Kette.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

let modal = '';
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise,
  esc: (s) => String(s ?? ''),
  document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  toast: () => {}, openModal: (h) => { modal = h; }, closeModal: () => {}, canWriteTab: () => true,
  STANDORTE: ['AAA', 'BBB'],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
const lk = lies('js/landkarte.js');

/* ── 1) Im Code nur Allgemeines ── */
ok(run(`LK_VORLAGEN.map(v => v.key).join('|')`) === 'konzern|gesellschaft|sap|sap-typen',
  'Im Code stehen nur die allgemeinen Vorlagen');
ok(!/Coswig|Zaigler|Schmiedeberg|IMS-4\.4|F_01_005|Skizze der Geschäftsführung|TRIPLE-FIVE/.test(lk),
  'Kein Werk, kein Managementhandbuch und keine Dokumentnummer im Code der Landkarte');

/* Eine erfundene Werkslandschaft: drei Bänder, sechs Hauptprozesse, darunter
   Gruppen und Teilprozesse, die Fertigung als Kette. */
const T = {
  baender: [{ key: 'fuehrung', titel: 'Führung' }, { key: 'kern', titel: 'Kern' }, { key: 'unterstuetzung', titel: 'Unterstützung' }],
  kacheln: [
    { id: 'f1', band: 'fuehrung', name: '1 Managementsystem', verweise: [{ ziel: 'f1a', art: 'unterprozess' }, { ziel: 'f1b', art: 'unterprozess' }] },
    { id: 'f1a', band: 'fuehrung', name: 'Qualität', unter: 'HB-1.1', verweise: [{ ziel: 'f1a1', art: 'unterprozess' }, { ziel: 'f1a2', art: 'unterprozess' }] },
    { id: 'f1a1', band: 'fuehrung', name: 'Audits planen', unter: 'HB-1.1.1' },
    { id: 'f1a2', band: 'fuehrung', name: 'Fehler lenken', unter: 'HB-1.1.2' },
    { id: 'f1b', band: 'fuehrung', name: 'Umwelt', unter: 'HB-1.2' },
    { id: 'k1', band: 'kern', name: '2 Verkauf', verweise: [{ ziel: 'k2', art: 'folgt' }] },
    { id: 'k2', band: 'kern', name: '3 Fertigung', verweise: [{ ziel: 'k3', art: 'folgt' },
      { ziel: 'k2a', art: 'unterprozess' }, { ziel: 'k2b', art: 'unterprozess' }, { ziel: 'k2c', art: 'unterprozess' }] },
    { id: 'k2a', band: 'kern', name: 'Formen', verweise: [{ ziel: 'k2b', art: 'folgt' }] },
    { id: 'k2b', band: 'kern', name: 'Gießen', verweise: [{ ziel: 'k2c', art: 'folgt' }] },
    { id: 'k2c', band: 'kern', name: 'Putzen' },
    { id: 'k3', band: 'kern', name: '4 Versand' },
    { id: 'u1', band: 'unterstuetzung', name: '5 Personal', verweise: [{ ziel: 'u1a', art: 'unterprozess' }, { ziel: 'u1b', art: 'unterprozess' }] },
    { id: 'u1a', band: 'unterstuetzung', name: 'Einstellung' },
    { id: 'u1b', band: 'unterstuetzung', name: 'Schulung' },
    { id: 'u2', band: 'unterstuetzung', name: '6 Einkauf' },
  ],
};
ctx.__t = T;

/* ── 2) Die eigene Vorlage des Werks ist vorgewählt ── */
run(`_lkDaten = { karten: { AAA: { baender: [], kacheln: [] } }, historie: [],
  vorlagen: [{ key: 'eigen:aaa', titel: 'Werk AAA: Prozesslandschaft', zweck: 'erfunden', werk: 'AAA',
    karte: JSON.parse(JSON.stringify(__t)), angelegt: '2026-11-23', von: 'Test' }] };
  _lkWerk = 'AAA';`);
run(`lkVorlageDialog()`);
ok(/value="eigen:aaa" checked/.test(modal), 'Beim Öffnen der Karte von AAA ist seine eigene Vorlage vorgewählt');
ok(/Werk AAA: Prozesslandschaft/.test(modal) && /eigene/.test(modal), 'Sie steht als eigene Vorlage im Dialog');
run(`_lkWerk = 'BBB';`);
run(`lkVorlageDialog()`);
ok(/value="gesellschaft" checked/.test(modal) && !/value="eigen:aaa" checked/.test(modal),
  'Ein Werk ohne eigene Vorlage bekommt die allgemeine einer produzierenden Gesellschaft');

/* ── 3) Die Vorlage ist in sich stimmig ── */
const ids = T.kacheln.map(k => k.id);
ok(new Set(ids).size === ids.length, `${ids.length} Kacheln, jede Kennung nur einmal`);
const tot = T.kacheln.flatMap(k => (k.verweise || []).map(v => ({ von: k.id, ...v }))).filter(v => !ids.includes(v.ziel));
ok(tot.length === 0, tot.length ? `Tote Ziele: ${tot.map(v => v.von + ' → ' + v.ziel).join(', ')}` : 'Alle Verweise treffen eine Kachel der Vorlage');

/* ── 4) Gliederung über drei Ebenen und die Kette ── */
run(`_lkDaten = { karten: { AAA: JSON.parse(JSON.stringify(__t)) }, historie: [] }; _lkWerk = 'AAA';`);
ok(run(`lkUnterprozesse(lkKachelVonId('f1')).map(v => v.kachel.name).join(', ')`) === 'Qualität, Umwelt',
  'Das Managementsystem gliedert sich in seine Säulen …');
ok(run(`lkUnterprozesse(lkKachelVonId('f1a')).length`) === 2, '… und darunter liegt die dritte Ebene');
function kette(startName) {
  const weg = [];
  let k = run(`lkKacheln().find(x => x.name === ${JSON.stringify(startName)})`);
  for (let i = 0; i < 20 && k; i++) {
    weg.push(k.name);
    const next = (k.verweise || []).find(v => v.art === 'folgt');
    k = next ? run(`lkKacheln().find(x => x.id === ${JSON.stringify(next.ziel)})`) : null;
  }
  return weg;
}
ok(kette('2 Verkauf').join(' → ') === '2 Verkauf → 3 Fertigung → 4 Versand', 'Die Kernprozesse laufen als Kette');
ok(kette('Formen').join(' → ') === 'Formen → Gießen → Putzen', 'Und die Fertigung in ihren Schritten');
ok(run(`lkKacheln().filter(k => lkIstTeilprozess('AAA', k)).length`) === 9, 'Neun Kacheln sind einem Hauptprozess zugeordnet');

/* ── 5) Und die Karte bleibt lesbar ── */
ok(run(`_lkNurHaupt`) === true, 'Die Karte zeigt zunächst nur die Hauptprozesse');
/* Der Kachel-Rumpf trägt genau eine Klasse „lk-kachel" – die inneren Teile
   heißen lk-kachel-kopf, -unter, -fuss. Deshalb auf das Ende der Klasse achten. */
const kacheln = (html) => (html.match(/class="lk-kachel[" ]/g) || []).length;
const zeile = run(`_lkZeileHtml({ key: 'unterstuetzung', titel: 'U' }, 0, false)`);
ok(kacheln(zeile) === 2, `Im Unterstützungsband stehen zwei Kacheln (${kacheln(zeile)})`);
ok(/2 Prozesse · 2 eingeordnet<\/i>/.test(zeile), 'Und die Bandzeile sagt, wie viele darunter einsortiert sind');
run(`lkTeilprozesseZeigen(true)`);
ok(kacheln(run(`_lkZeileHtml({ key: 'unterstuetzung', titel: 'U' }, 0, false)`)) === 4,
  'Eingeschaltet stehen sie einzeln da – versteckt ist nichts, es ist nur einsortiert');
run(`lkTeilprozesseZeigen(false)`);
ok(kacheln(run(`_lkZeileHtml({ key: 'fuehrung', titel: 'F' }, 0, false)`)) === 1, 'Das Führungsband zeigt seinen Hauptprozess');
ok(/lkTeilprozesseZeigen/.test(lk), 'Der Schalter dafür steht in der Leiste');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
