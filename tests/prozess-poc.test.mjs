/**
 * Der POC gehört zum SOLL.
 *
 * Ein POC erprobt ein SOLL-Modell. Er ist kein zweites Modell, sondern steht am
 * SOLL selbst: Pilotwerk(e), Zeitraum, Verantwortlich, Erfolgskriterien mit
 * Bewertung und Ergebnis. Bewertet wird am Review-Termin des Modells.
 *
 * Worauf es ankommt:
 *   • Der POC steht als Marker in der Dokumentation des Prozesses und übersteht
 *     jeden Rundlauf; ältere Dateien ohne POC lesen sich unverändert.
 *   • Wer Status, Regelwerke oder Angaben neu schreibt, lässt den POC stehen,
 *     auch der Modeler, der ihn nicht bearbeitet.
 *   • Die Kette IST → SOLL → POC ist auf jeder Karte zu sehen; Unterprozesse
 *     zeigen den POC ihres Hauptprozesses.
 *   • Einem laufenden POC ohne Pilotwerk oder Erfolgskriterien fehlt etwas,
 *     ebenso einem, dessen Ende ohne Ergebnis überschritten ist.
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

/* ══ 1) Der POC als Daten ══ */
console.log('POC am SOLL');
const poc = { werke: 'wgc, SHB  wgc', start: '2026-10-01', ende: '2026-11-30', verantwortlich: 'pruefer@dihag.com', ergebnis: '',
  kriterien: [{ text: '95 % der Rechnungen automatisch erkannt', bewertung: 'erfuellt' }, { text: 'Durchlaufzeit unter 3 Tagen' }, { text: '  ' }] };
const n = M.pzPocNormal(poc);
ok(n.werke.join() === 'WGC,SHB', 'Werke als Kürzel, groß, ohne Doppel');
ok(n.kriterien.length === 2 && n.kriterien[1].bewertung === '', 'Leere Kriterien fallen weg, ohne Bewertung gilt „offen"');
ok(M.pzPocNormal({ start: 'bald', ergebnis: 'super', kriterien: [{ text: 'x', bewertung: 'naja' }] }).start === ''
  && M.pzPocNormal({ ergebnis: 'super' }).ergebnis === '' && M.pzPocNormal({ kriterien: [{ text: 'x', bewertung: 'naja' }] }).kriterien[0].bewertung === '',
  'Ungültiges Datum, Ergebnis und Bewertung gelten als nicht gesetzt');
ok(M.pzPocLeer({}) && M.pzPocLeer(null) && !M.pzPocLeer({ werke: 'WGC' }), 'Leer ist nur ein POC ohne jede Angabe');
ok(M.pzPocNormal({ werke: 'WGC, alle' }).werke.join() === 'ALLE' && M.pzPocWerkeText(['ALLE']) === 'alle Werke'
  && M.pzPocKurz({ werke: 'ALLE', ende: '2026-12-31' }) === 'alle Werke · bis 31.12.2026 · läuft', '„ALLE" steht für alle Werke');
ok(M.pzPocZeilen({ werke: 'ALLE' }).includes('[[rms:poc=ALLE||||]]') && M.pzPocZeilen({ werke: 'ALLE' })[0] === 'POC: Pilot alle Werke · Ergebnis läuft',
  'Im Marker als ALLE, im Klartext als „alle Werke"');
const st = M.pzPocStand(n);
ok(st.gesamt === 2 && st.erfuellt === 1 && st.offen === 1 && st.verfehlt === 0, 'Stand der Kriterien');
ok(M.pzPocKurz(n) === 'WGC, SHB · 01.10.2026 bis 30.11.2026 · 1 von 2 Kriterien erfüllt · läuft', 'Der POC in einer Zeile');
ok(M.pzPocErgebnisInfo('bestanden').label === 'bestanden' && M.pzPocErgebnisInfo('').label === 'läuft', 'Ergebnis: leer heißt „läuft"');

/* Marker und Rundlauf */
const pm = { status: 'poc', prozesseigner: 'pruefer@dihag.com', naechsteUeberpruefung: '2026-12-01', poc };
const zeilen = M.pzPmZeilen(pm);
ok(zeilen.includes('[[rms:poc=WGC,SHB|2026-10-01|2026-11-30|pruefer@dihag.com|]]'), 'Ein Marker für den POC');
ok(zeilen.includes('[[rms:pockrit=95 % der Rechnungen automatisch erkannt|erfuellt]]') && zeilen.includes('[[rms:pockrit=Durchlaufzeit unter 3 Tagen|]]'),
  'Je Erfolgskriterium ein Marker');
ok(zeilen.some(z => z.startsWith('POC: Pilot WGC, SHB · 01.10.2026 bis 30.11.2026 · verantwortlich pruefer@dihag.com · Ergebnis läuft'))
  && zeilen.some(z => z === 'POC-Kriterien: 95 % der Rechnungen automatisch erkannt (erfüllt); Durchlaufzeit unter 3 Tagen (offen)'),
  'Und im Klartext, damit auch ein fremder Modeler ihn zeigt');
const zurueck = M.pzPmAusText(zeilen.join(NL));
ok(JSON.stringify(zurueck.poc) === JSON.stringify(n) && zurueck.status === 'poc', 'Rundlauf: gelesen kommt derselbe POC heraus');
ok(M.pzPmAusText('[[rms:poc=WGC||||]]').poc.werke.join() === 'WGC', 'Ein POC allein reicht, damit Angaben gelesen werden');
ok(M.pzPocLeer(M.pzPmAusText('[[rms:pm=soll|a@dihag.com|||]]').poc), 'Ältere Dateien ohne POC lesen sich unverändert');
ok(!M.pzPmLeer({ poc: { werke: 'WGC' } }) && M.pzPmMarker({ poc: { werke: 'WGC' } }) === '', 'Ein POC zählt als Angabe, ohne eine leere pm-Zeile zu erzeugen');
const kritZeile = M.pzPocZeilen({ kriterien: [{ text: 'a|b [x]', bewertung: 'verfehlt' }] }).find(z => z.startsWith('[[rms:pockrit='));
const innen = kritZeile.slice('[[rms:pockrit='.length, -2);
ok(innen.split('|').length === 2 && !/[\[\]]/.test(innen) && M.pzPocAusText(kritZeile).kriterien[0].bewertung === 'verfehlt',
  'Trenner und Klammern im Text zerbrechen den Marker nicht');

/* Lücken */
ok(M.pzPocLuecken('poc', {}, HEUTE).join() === 'kein Pilotwerk,keine Erfolgskriterien', 'Ein POC ohne Pilotwerk und Kriterien hat Lücken');
ok(M.pzPocLuecken('poc', n, HEUTE).length === 0, 'Ein vollständiger laufender POC hat keine');
ok(M.pzPocLuecken('poc', n, new Date(2026, 11, 5)).join() === 'POC-Ende überschritten, Ergebnis offen', 'Ende überschritten ohne Ergebnis');
ok(M.pzPocLuecken('poc', Object.assign({}, n, { ergebnis: 'bestanden' }), new Date(2026, 11, 5)).length === 0, 'Mit Ergebnis nicht mehr');
ok(M.pzPocLuecken('soll', {}, HEUTE).length === 0 && M.pzPocLuecken('freigegeben', {}, HEUTE).length === 0, 'Nur ein laufender POC wird geprüft');

/* Einträge */
const modelle = [
  { itemId: 'IST1', title: 'E-Rechnung Rechnungseingang (IST)', ordner: 'KONZERN', pm: { status: 'eol', nachfolger: 'SOLL1' }, kacheln: [] },
  { itemId: 'SOLL1', title: 'E-Rechnung Rechnungseingang', ordner: 'KONZERN', pm: { status: 'poc', poc }, kacheln: [] },
  { itemId: 'UNTER1', title: 'E-Rechnung Eingangsprüfung', ordner: 'KONZERN', pm: { status: 'poc' }, kacheln: [] },
  { itemId: 'SOLL2', title: 'E-Rechnung Rechnungsausgang', ordner: 'KONZERN', pm: { status: 'poc' }, kacheln: [] },
];
const eintraege = M.pzModellEintraege({ karten: {} }, modelle, HEUTE);
ok(eintraege[1].poc.werke.join() === 'WGC,SHB' && M.pzPocLeer(eintraege[0].poc), 'Die Einträge tragen den POC');

/* ══ 2) Dokumentation schreiben: der POC bleibt ══ */
console.log('Dokumentation');
const ctx = { console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent, esc, jsArg,
  State: { policies: [{ id: '7', title: 'Eingangsrechnungen' }] }, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  toast: () => {}, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx; ctx.globalThis = ctx; ctx.module = undefined;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/prozessmodell.js'), ctx);
vm.runInContext(lies('js/prozesse.js'), ctx);
vm.runInContext(lies('js/verknuepfungen.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
ctx.__x = run('procLeeresBpmn()').replace('<bpmn:startEvent', '<bpmn:documentation>Eingangsrechnungen als XRechnung.</bpmn:documentation>' + NL + '    <bpmn:startEvent');
ctx.__pm = pm;
const mitPoc = run(`procXmlDokuNeu(__x, { ids: ['7'], pm: __pm })`);
ok(/\[\[rms:poc=WGC,SHB\|/.test(mitPoc) && /\[\[rms:pockrit=Durchlaufzeit unter 3 Tagen\|\]\]/.test(mitPoc) && /Eingangsrechnungen als XRechnung\./.test(mitPoc),
  'POC, Regelwerk und Beschreibung in einer Dokumentation');
ctx.__x = mitPoc;
const nurStatus = run(`procXmlDokuNeu(__x, { pm: Object.assign(procPmAusXml(__x), { status: 'freigegeben' }) })`);
ok(/\[\[rms:pm=freigegeben\|/.test(nurStatus) && /\[\[rms:poc=WGC,SHB\|/.test(nurStatus) && (nurStatus.match(/rms:pockrit=/g) || []).length === 2,
  'Status setzen (wie an der Karte) lässt den POC stehen, ohne ihn zu verdoppeln');
ok((nurStatus.match(/POC-Kriterien:/g) || []).length === 1 && (nurStatus.match(/Eingangsrechnungen als XRechnung\./g) || []).length === 1,
  'Die Klartextzeilen gelten als Angaben, nicht als Beschreibung');
const regel = run(`vkXmlMitRegelwerken(__x, ['7', '9'])`);
ok(/\[\[rms:policies=7,9\]\]/.test(regel) && /\[\[rms:poc=WGC,SHB\|/.test(regel), '„Regelwerk zuordnen" löscht den POC nicht');
ok(run(`_procIstDokuZeile('[[rms:pockrit=x|]]')`) && run(`_procIstDokuZeile('POC: Pilot WGC')`) && !run(`_procIstDokuZeile('Der POC läuft in Gießen.')`),
  'Marker und Klartextzeilen erkannt, freier Text bleibt Beschreibung');
const P = lies('js/prozesse.js');
ok(/poc: \(_procPm && _procPm\.poc\) \|\| null,/.test(P), 'Der Modeler bearbeitet den POC nicht, behält ihn aber beim Speichern');
ok(/Prozessmanagement\|Kennzahlen\|POC\|POC-Kriterien\|Vergleich mit dem IST\|Anmerkungen zum Vergleich\|Dokument\)/.test(P), 'Die Ansicht zeigt die POC-Zeilen nicht als Beschreibung');
ok(/🧪 POC\$\{poc\.ueber \? ' über ' \+ esc\(poc\.ueber\) : ''\}/.test(P) && /pzPocLuecken\(e\.status, e\.poc\)/.test(P), 'In der Modellansicht als Chip, mit Lücken');
ok(/Bearbeiten im Backlog unter ✎ Angaben/.test(P), 'Im Modeler lesend, mit Hinweis, wo er gepflegt wird');

/* ══ 3) Backlog: Karten und Dialog ══ */
console.log('Backlog');
const bctx = { console, Map, Set, Array, Object, String, JSON, Math, Date, Number, RegExp, esc, jsArg,
  workflowBadge: (s) => s, document: { getElementById: () => null, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem() {} } };
bctx.window = bctx; bctx.globalThis = bctx;
vm.createContext(bctx);
vm.runInContext(lies('js/prozessmodell.js'), bctx);
vm.runInContext(lies('js/prozessbacklog.js'), bctx);
bctx._processes = modelle.map(m => ({ itemId: m.itemId, title: m.title, ordner: m.ordner, modified: 'm' }));
bctx.procModellVon = (id) => bctx._processes.find(p => p.itemId === id) || null;
bctx.procEintragVon = (p) => { const m = modelle.find(x => x.itemId === p.itemId); return { m: m ? m.pm : null }; };
bctx.procKachelnVon = () => [];
bctx.pfIstHauptprozess = (id) => id !== 'UNTER1';
bctx.pfHauptprozesseVon = (id) => (id === 'UNTER1' ? ['SOLL1'] : []);
bctx.procGliederungKinder = (id) => (id === 'SOLL1' ? [{ id: 'UNTER1', art: 'unter' }] : []);
const E = vm.runInContext(`pzModellEintraege({ karten: {} }, pbModelle(), new Date(2026, 9, 8))`, bctx);
const karte = (id) => E.find(e => e.kachel.id === id);
const pocHtml = vm.runInContext('_pbPocHtml', bctx);
const h1 = pocHtml(karte('SOLL1'), true);
ok(/🧪 POC: WGC, SHB · 01\.10\.2026 bis 30\.11\.2026 · 1 von 2 Kriterien erfüllt <span class="pb-tag"[^>]*>läuft<\/span>/.test(h1), 'Die SOLL-Karte zeigt ihren POC mit Stand und Ergebnis');
ok(/title="✓ 95 % der Rechnungen automatisch erkannt\n○ Durchlaufzeit unter 3 Tagen"/.test(h1), 'Die Kriterien stehen im Tooltip');
ok(/🧪 POC über <a [^>]*pbModellOeffnen\(&quot;SOLL1&quot;\)[^>]*>E-Rechnung Rechnungseingang<\/a>: WGC, SHB/.test(pocHtml(karte('UNTER1'), true)) && !/kein Pilotwerk/.test(pocHtml(karte('UNTER1'), true)),
  'Ein Unterprozess zeigt den POC seines Hauptprozesses, ohne eigene Lücken');
ok(/→ für „Freigegeben, Rollout" fehlt: kein Pilotwerk, keine Erfolgskriterien[^<]* · <a [^>]*pbAngabenDialog\(&quot;SOLL2&quot;\)[^>]*>eintragen<\/a>/.test(vm.runInContext('_pbSchrittHtml', bctx)(karte('SOLL2'), true))
  && pocHtml(karte('SOLL2')) === '', 'Einem POC ohne Angaben fehlt etwas: steht in den Kriterien der Phase, mit „eintragen"');
ok(pocHtml(karte('IST1'), true) === '', 'An der IST-Karte steht kein eigener POC');
const kSoll = vm.runInContext('pbEintraege()', bctx).find(k => k.kachel.id === 'SOLL1');
ok(kSoll && kSoll.istModelle.map(x => x.kachel.id).join() === 'IST1' && kSoll.teile.map(x => x.kachel.id).join() === 'UNTER1'
  && /🧪 POC: WGC, SHB/.test(pocHtml(kSoll)) && /📄 1 IST, 1 in Benutzung · ↳ 1 Teilprozess/.test(vm.runInContext('_pbAnhangHtml', bctx)(kSoll)),
  'Die Kette auf einer Karte: SOLL mit POC, daran das IST und der Teilprozess');

const bl = lies('js/prozessbacklog.js');
ok(/<legend>🧪 POC für dieses SOLL<\/legend>/.test(bl) && /id="pb-a-poc-werke"/.test(bl) && /id="pb-a-poc-ende"/.test(bl) && /id="pb-a-poc-ergebnis"/.test(bl) && /onclick="pbKriteriumNeu\(\)"/.test(bl),
  '„✎ Angaben" hat einen POC-Teil: Werke, Zeitraum, Verantwortlich, Ergebnis, Kriterien');
ok(/Der POC wird am Hauptprozess geführt/.test(bl), 'An einem Unterprozess verweist er auf den Hauptprozess');
ok(/const poc = _pbPocFormular\(\);\s+if \(poc\) pm\.poc = poc;/.test(bl) && /Das Ende des POC liegt vor seinem Beginn/.test(bl), 'Gespeichert wird der POC aus dem Dialog, geprüft wird der Zeitraum');
ok(/'POC mit Erfolgskriterien'/.test(bl), 'Kennzahl oben: POC mit Erfolgskriterien');
ok(/\.pb-poc-feld \{/.test(lies('css/style.css')) && /\.pb-krit \{/.test(lies('css/style.css')), 'Gestaltung für POC-Teil und Kriterienzeilen');

/* Dialog: Formular lesen */
const felder = { 'pb-a-poc-werke': 'WGC', 'pb-a-poc-start': '2026-10-01', 'pb-a-poc-ende': '2026-11-30', 'pb-a-poc-verantwortlich': 'a@dihag.com', 'pb-a-poc-ergebnis': 'verlaengert' };
bctx.document = { getElementById: (id) => (id in felder ? { value: felder[id] } : null), querySelectorAll: () => [] };
vm.runInContext(`_pbKriterien = [{ text: 'Fehlerquote unter 2 %', bewertung: 'verfehlt' }, { text: '', bewertung: '' }]`, bctx);
const ausForm = vm.runInContext('_pbPocFormular()', bctx);
ok(ausForm.werke.join() === 'WGC' && ausForm.ergebnis === 'verlaengert' && ausForm.kriterien.length === 1 && ausForm.kriterien[0].bewertung === 'verfehlt',
  'Der Dialog liefert den POC, leere Kriterien fallen weg');
vm.runInContext(`pbKriteriumWeg(0)`, bctx);
ok(vm.runInContext('_pbKriterien.length', bctx) === 1 && vm.runInContext('_pbKriterien[0].text', bctx) === '', 'Ein Kriterium lässt sich entfernen');
bctx.document = { getElementById: () => null, querySelectorAll: () => [] };
ok(vm.runInContext('_pbPocFormular()', bctx) === null, 'Ohne POC-Felder (Unterprozess) bleibt der POC aus der Datei');
ok(vm.runInContext(`_pbPocSichtbar('soll', {}) && _pbPocSichtbar('poc', {}) && !_pbPocSichtbar('ist', {}) && _pbPocSichtbar('ist', { werke: ['WGC'] })`, bctx),
  'Der POC-Teil steht ab dem SOLL da, oder wenn schon etwas eingetragen ist');

/* ══ 4) Doku ══ */
const doku = lies('js/dokumentation.js');
ok(/🧪 POC am SOLL:/.test(doku) && /Erfolgskriterien/.test(doku) && /POC über/.test(doku), 'Die Dokumentation beschreibt den POC am SOLL');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
