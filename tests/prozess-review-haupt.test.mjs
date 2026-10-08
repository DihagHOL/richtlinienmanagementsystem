/**
 * Review über den Hauptprozess.
 *
 * Unter- und Nebenprozesse gehen bei Freigabe und POC über ihren Hauptprozess.
 * Beim Review ebenso: Ohne eigenen Termin übernehmen sie den des
 * Hauptprozesses, zählen nicht extra und stehen in den Fälligkeiten nicht noch
 * einmal. Ein eigener Termin gilt weiter für sich.
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
const HEUTE = new Date(2026, 9, 8);

/* ══ 1) Wer steht unter wem ══ */
console.log('Gliederung');
const text = '<bpmn:documentation>[[rms:modell=U1]]</bpmn:documentation>' + NL + '[[rms:unter=U3,U4]]' + NL + '[[rms:neben=N]]' + NL + '[[rms:modell=U1]]';
ok(M.pzKinderAusText(text).join() === 'U1,U3,U4,N', 'Kinder aus ⊞-Markern und zugeordneten Unter- und Nebenprozessen, ohne Doppel');
const haupt = M.pzHauptprozesse([
  { itemId: 'H', kinder: ['U1', 'N'] }, { itemId: 'U1', kinder: ['U2'] }, { itemId: 'U2' }, { itemId: 'N' },
  { itemId: 'A', kinder: ['B'] }, { itemId: 'B', kinder: ['A'] }, { itemId: 'S', kinder: ['S'] },
]);
ok(haupt.get('U2').join() === 'H' && haupt.get('U1').join() === 'H' && haupt.get('N').join() === 'H' && !haupt.get('H').length,
  'Hauptprozess über mehrere Stufen, auch für Nebenprozesse; der Hauptprozess selbst hat keinen');
ok(!haupt.get('A').length && !haupt.get('B').length && !haupt.get('S').length, 'Ein Kreis oder ein Verweis auf sich selbst hängt nicht');

/* ══ 2) Der Termin ══ */
console.log('Review-Termin');
const modelle = [
  { itemId: 'H', title: 'E-Rechnung Rechnungseingang', ordner: 'KONZERN', pm: { status: 'poc', naechsteUeberpruefung: '2026-12-31' }, kacheln: [], kinder: ['U1', 'U2'] },
  { itemId: 'U1', title: 'E-Rechnung Eingangsprüfung', ordner: 'HOL', pm: { status: 'poc' }, kacheln: [], kinder: [] },
  { itemId: 'U2', title: 'E-Rechnung Nebendateien ablegen', ordner: 'KONZERN', pm: { status: 'poc', naechsteUeberpruefung: '2026-11-15' }, kacheln: [] },
  { itemId: 'H2', title: 'Zahlungsausgang', ordner: 'KONZERN', pm: { status: 'poc' }, kacheln: [], kinder: ['U3'] },
  { itemId: 'U3', title: 'Zahldatei-Preflight', ordner: 'KONZERN', pm: { status: 'poc' }, kacheln: [] },
  { itemId: 'F', title: 'Für sich', ordner: 'KONZERN', pm: { status: 'poc' }, kacheln: [] },
];
const E = M.pzModellEintraege({ karten: {} }, modelle, HEUTE);
const von = (id) => E.find(e => e.kachel.id === id);
ok(von('U1').pruefung.datum === '2026-12-31' && von('U1').pruefung.ueber.name === 'E-Rechnung Rechnungseingang' && !von('U1').pruefung.eigen,
  'Ein Unterprozess ohne Termin übernimmt den seines Hauptprozesses');
ok(von('U2').pruefung.datum === '2026-11-15' && von('U2').pruefung.eigen && !von('U2').pruefung.ueber, 'Ein eigener Termin gilt weiter für sich');
ok(von('H').pruefung.eigen && !von('H').pruefung.ueber, 'Der Hauptprozess prüft sich selbst');
ok(von('U3').pruefung.stufe === 'fehlt' && von('U3').pruefung.ueber.name === 'Zahlungsausgang', 'Fehlt dem Hauptprozess der Termin, fehlt er über ihn');
ok(von('F').pruefung.stufe === 'fehlt' && !von('F').pruefung.ueber, 'Ein Prozess ohne Hauptprozess fehlt für sich');
const kz = M.pzKennzahlen(E);
ok(kz.ohneTermin === 2, 'Ohne Termin zählen nur die, die sich selbst prüfen (Zahlungsausgang, Für sich), nicht der Unterprozess');
const f = M.pzFaellige({ karten: {} }, null, HEUTE, modelle);
ok(f.fehlt.map(e => e.kachel.id).sort().join() === 'F,H2' && f.spaeter.map(e => e.kachel.id).join() === 'U2,H',
  'In den Fälligkeiten: Hauptprozesse und eigene Termine, Unterprozesse ohne eigenen nicht noch einmal');
const nurHol = M.pzEintraege({ karten: {} }, ['HOL'], HEUTE, modelle);
ok(nurHol.length === 1 && nurHol[0].kachel.id === 'U1' && nurHol[0].pruefung.ueber && nurHol[0].pruefung.datum === '2026-12-31',
  'Auch wenn der Hauptprozess in einer anderen Ablage liegt (Filter auf HOL)');
ok(M.pzModellEintraege({ karten: {} }, [{ itemId: 'X', title: 'X', ordner: '', pm: { status: 'poc' }, kacheln: [] }], HEUTE)[0].pruefung.stufe === 'fehlt',
  'Ohne Angaben zur Gliederung wie bisher');

/* ══ 3) Backlog und Ansicht ══ */
console.log('Anzeige');
const bctx = { console, Map, Set, Array, Object, String, JSON, Math, Date, Number, RegExp, esc, jsArg,
  workflowBadge: (s) => s, document: { getElementById: () => null, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem() {} } };
bctx.window = bctx; bctx.globalThis = bctx;
vm.createContext(bctx);
vm.runInContext(lies('js/prozessmodell.js'), bctx);
vm.runInContext(lies('js/prozessbacklog.js'), bctx);
const karte = vm.runInContext('_pbKarteHtml', bctx)(von('U1'), false);
ok(/🔎 31\.12\.2026 über E-Rechnung Rechnungseingang/.test(karte), 'Die Karte zeigt den Termin mit dem Hauptprozess, über den er gilt');
ok(/⏰ Überprüfung fehlt über Zahlungsausgang/.test(vm.runInContext('_pbKarteHtml', bctx)(von('U3'), false)), 'Und wenn er dort fehlt, auch das');

const bl = lies('js/prozessbacklog.js');
ok(/kinder: \(typeof procGliederungKinder === 'function'\) \? procGliederungKinder\(p\.itemId\)\.map\(k => k\.id\) : \[\]/.test(bl), 'Das Backlog gibt die Gliederung mit');
ok(/undefined, pbModelle\(\)\)\.filter\(e => \{\s+if \(_pbWerk && e\.art === 'modell' && e\.werk !== _pbWerk\) return false;/.test(bl), 'und alle Modelle, gefiltert wird danach');
const P = lies('js/prozesse.js');
ok(/kinder: procGliederungKinder\(p\.itemId\)\.map\(k => k\.id\)/.test(P) && /_procModellListe\(\{ \[id\]: _procPm \}\)/.test(P), 'Die Modellansicht rechnet über alle Modelle, mit den offenen Angaben');
ok(/kinder = \(typeof pzKinderAusText === 'function'\) \? pzKinderAusText\(xml\) : \[\];/.test(lies('js/faelligkeit.js')), 'Die Fälligkeiten lesen die Gliederung aus den Dateien');
ok(/übernehmen den Review-Termin ihres Hauptprozesses/.test(lies('js/dokumentation.js')), 'Die Dokumentation sagt es');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
