/**
 * Modelle mit Pools: die Angaben stehen an einer Stelle, am Prozess.
 *
 * Bei einem Modell mit Pools ist das Wurzelelement im Editor die Kollaboration.
 * Ältere Fassungen des Editors schrieben die Angaben (Status, Regelwerke,
 * Kennzahlen, POC) dorthin, Backlog, Status und Freigabe aber an den Prozess.
 * Gelesen wurde die erste Kopie im XML, die der Kollaboration: Änderungen aus
 * dem Backlog gingen still verloren.
 *
 * Worauf es ankommt:
 *   • Gelesen werden beide Stellen, feldweise zusammengeführt; was am Prozess
 *     steht (später im XML), gewinnt. Doppelte Regelwerke, Anlagen, Kennzahlen
 *     zählen einmal.
 *   • Geschrieben wird nur an den Prozess, vom Backlog wie vom Modeler. Die Kopie
 *     an der Kollaboration verschwindet, ein freier Text von dort wandert mit.
 *   • Der Fingerabdruck des Ablaufs hängt an keiner der beiden Dokumentationen.
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

/* ══ 1) Mehrere Marker zusammenführen ══ */
console.log('Lesen');
const zwei = '[[rms:pm=poc|x@dihag.com|||]]' + NL + '[[rms:pm=freigegeben|||hoch|2027-01-31]]';
const pm2 = M.pzPmAusText(zwei);
ok(pm2.status === 'freigegeben' && pm2.prozesseigner === 'x@dihag.com' && pm2.prioritaet === 'hoch' && pm2.naechsteUeberpruefung === '2027-01-31',
  'Zwei pm-Zeilen: feldweise zusammen, die spätere gewinnt');
const kpis = M.pzPmAusText('[[rms:kpi=Durchlaufzeit|Tage|niedrig|3|4|2026-09]]' + NL + '[[rms:kpi=Durchlaufzeit|Tage|niedrig|3|2|2026-10]]').kennzahlen;
ok(kpis.length === 1 && kpis[0].ist === '2', 'Dieselbe Kennzahl zweimal zählt einmal, mit dem späteren Stand');
const poc2 = M.pzPocAusText('[[rms:poc=WGC||||]]' + NL + '[[rms:pockrit=A|]]' + NL + '[[rms:poc=|2026-10-01|2026-12-31||]]' + NL + '[[rms:pockrit=A|erfuellt]]');
ok(poc2.werke.join() === 'WGC' && poc2.ende === '2026-12-31' && poc2.kriterien.length === 1 && poc2.kriterien[0].bewertung === 'erfuellt',
  'Auch der POC: zusammengeführt, Kriterien einmal');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1" targetNamespace="x">
  <bpmn:collaboration id="C1">
    <bpmn:documentation>[[rms:pm=eol|||||||SOLL1]]
[[rms:policies=7]]
[[rms:doc=Formular A|https://x/a.docx||]]
[[rms:unter=U1]]
[[rms:kpi=Durchlaufzeit|Tage|niedrig|3|4|2026-09]]</bpmn:documentation>
    <bpmn:participant id="P0" name="Lieferant" />
    <bpmn:participant id="P1" name="Werk" processRef="Process_A" />
  </bpmn:collaboration>
  <bpmn:process id="Process_A" isExecutable="false">
    <bpmn:documentation>Beschreibung des Ablaufs.
Prozessmanagement: Status IST
[[rms:pm=eol|a@dihag.com|||2026-12-31]]
[[rms:policies=9,7]]
[[rms:doc=Formular A|https://x/a.docx||]]
[[rms:kpi=Durchlaufzeit|Tage|niedrig|3|2|2026-10]]</bpmn:documentation>
    <bpmn:startEvent id="S1" name="Start" />
  </bpmn:process>
</bpmn:definitions>`;

const ctx = { console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent, esc, jsArg,
  State: { policies: [{ id: '7', title: 'A' }, { id: '9', title: 'B' }] }, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  toast: () => {}, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx; ctx.globalThis = ctx; ctx.module = undefined;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/prozessmodell.js'), ctx);
vm.runInContext(lies('js/prozesse.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
ctx.__x = XML;

const e = run('procEintragAusXml(__x)');
ok(e.p.join() === '7,9' && e.d === 1, 'Regelwerke aus beiden Stellen, ohne Doppel; dieselbe Anlage einmal');
ok(e.m.status === 'eol' && e.m.nachfolger === 'SOLL1' && e.m.prozesseigner === 'a@dihag.com' && e.m.naechsteUeberpruefung === '2026-12-31',
  'Prozessmanagement aus beiden Stellen: der Nachfolger von der Kollaboration, der Rest vom Prozess');
ok(e.m.kennzahlen.length === 1 && e.m.kennzahlen[0].ist === '2', 'Die Kennzahl gilt mit dem Stand am Prozess');
ok(e.g.u.join() === 'U1', 'Die Gliederung auch von der Kollaboration');

/* ══ 2) Schreiben: nur an den Prozess ══ */
console.log('Schreiben (Backlog, Status, Regelwerk)');
const neu = run(`procXmlDokuNeu(__x, { pm: Object.assign(procPmAusXml(__x), { status: 'eol', freigeber: 'gf@dihag.com' }) })`);
ok(!/<bpmn:collaboration id="C1">\s*<bpmn:documentation>/.test(neu) && /<bpmn:participant id="P1"/.test(neu), 'Die Kollaboration verliert ihre Kopie, nicht ihre Teilnehmer');
ok((neu.match(/\[\[rms:pm=/g) || []).length === 1 && /\[\[rms:pm=eol\|a@dihag\.com\|\|\|2026-12-31\|\|gf@dihag\.com\|SOLL1\]\]/.test(neu),
  'Eine pm-Zeile, am Prozess, mit allem zusammen');
ok(/\[\[rms:policies=7,9\]\]/.test(neu) && (neu.match(/\[\[rms:doc=/g) || []).length === 1 && /\[\[rms:unter=U1\]\]/.test(neu), 'Regelwerke, Anlage und Gliederung wandern mit');
ok((neu.match(/Beschreibung des Ablaufs\./g) || []).length === 1, 'Die Beschreibung bleibt, einmal');
ctx.__y = neu;
ok(run('procPmAusXml(__y)').freigeber === 'gf@dihag.com', 'Was das Backlog schreibt, wird auch gelesen (der Fehler von vorher)');
const mitText = XML.replace('<bpmn:documentation>[[rms:pm=eol|||||||SOLL1]]', '<bpmn:documentation>Hinweis an der Kollaboration' + NL + '[[rms:pm=eol|||||||SOLL1]]');
ctx.__z = mitText;
const neu2 = run(`procXmlDokuNeu(__z, {})`);
ok(/Beschreibung des Ablaufs\.\nHinweis an der Kollaboration/.test(neu2.split(String.fromCharCode(13)).join('')) && !/<bpmn:collaboration id="C1">\s*<bpmn:documentation>/.test(neu2),
  'Freier Text von der Kollaboration wandert an den Prozess');
ok(run(`procInhaltHash(__x)`) === run(`procInhaltHash(__y)`), 'Der Fingerabdruck des Ablaufs hängt an keiner Dokumentation');

/* ══ 3) Modeler: an den Prozess, nicht an die Wurzel ══ */
console.log('Schreiben (Modeler)');
run(`
  var __proc = { $type: 'bpmn:Process', documentation: [{ text: 'Beschreibung.' + String.fromCharCode(10) + '[[rms:pm=ist||||]]' }] };
  var __kollab = { $type: 'bpmn:Collaboration', participants: [{ name: 'Lieferant' }, { processRef: __proc }],
    documentation: [{ text: '[[rms:pm=soll||||]]' + String.fromCharCode(10) + '[[rms:unter=U2]]' + String.fromCharCode(10) + 'Alter Hinweis' }] };
  _bpmnModeler = { get: (n) => n === 'canvas' ? { getRootElement: () => ({ businessObject: __kollab }) }
    : n === 'moddle' ? { create: (t, a) => Object.assign({ $type: t }, a) } : null };
  _setProcessDoku(['7'], [], { status: 'poc' });
`);
const t = run('__proc.documentation[0].text');
ok(/^Beschreibung\.\nAlter Hinweis\n/.test(t) && /\[\[rms:pm=poc\|/.test(t) && /\[\[rms:policies=7\]\]/.test(t) && /\[\[rms:unter=U2\]\]/.test(t),
  'Der Modeler schreibt an den Prozess: Beschreibung, Hinweis von der Kollaboration, Angaben, Gliederung');
ok(run('__kollab.documentation') === undefined, 'Die Kollaboration trägt danach nichts mehr');
run(`var __nurProz = { $type: 'bpmn:Process', documentation: [{ text: 'Nur Prozess.' }] };
  _bpmnModeler = { get: (n) => n === 'canvas' ? { getRootElement: () => ({ businessObject: __nurProz }) }
    : n === 'moddle' ? { create: (t, a) => Object.assign({ $type: t }, a) } : null };
  _setProcessDoku([], [], { status: 'soll' });`);
ok(/^Nur Prozess\.\n/.test(run('__nurProz.documentation[0].text')) && /\[\[rms:pm=soll\|/.test(run('__nurProz.documentation[0].text')),
  'Ohne Pools wie bisher: an den Prozess, der die Wurzel ist');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
