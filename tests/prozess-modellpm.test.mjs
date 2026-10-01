/**
 * Modelle sind Prozesse – Prozessmanagement am BPMN-Modell und Dokumente am Schritt.
 *
 * Worauf es ankommt:
 *   • Die Angaben stehen als Marker in der Dokumentation des Prozesses und
 *     überstehen jeden Rundlauf. Ungültiges fällt raus, statt mitzureisen.
 *   • Wer die Dokumentation neu schreibt (Status setzen, Regelwerk zuordnen),
 *     lässt stehen, was er nicht ändert: Regelwerke, Anlagen, Beschreibung, Status.
 *   • Leere Angaben am Modell gelten von der Kachel, an der es hängt, und von dort
 *     von der gleichnamigen Konzernkachel. Ohne Kachel zählt die Konzernkachel direkt.
 *   • Im Backlog ist ein Modell ein eigener Prozess; die Kachel, an der es hängt,
 *     steht dann nicht noch einmal da.
 *   • Dokumente am Schritt haben einen eigenen Marker – die Anlagen des Prozesses
 *     sammeln sie nicht ein, und andere Angaben am Element bleiben stehen.
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
const HEUTE = new Date(2026, 9, 1);

console.log('Marker');
const pm = { status: 'soll', prozesseigner: 'cfo@dihag.com', standardisierung: 'einheitlich', prioritaet: 'hoch', naechsteUeberpruefung: '2027-03-01' };
const marker = M.pzPmMarker(pm);
ok(marker === '[[rms:pm=soll|cfo@dihag.com|einheitlich|hoch|2027-03-01]]', 'Der Marker trägt alle fünf Angaben');
ok(JSON.stringify(M.pzPmAusText('Text ' + marker + ' mehr')) === JSON.stringify(Object.assign({}, pm, { reifegrad: '', kennzahlen: [] })),
  'Rundlauf: gelesen kommt dasselbe heraus');
ok(M.pzPmAusText('kein Marker') === null, 'Ohne Marker: null');
const kaputt = M.pzPmAusText('[[rms:pm=quatsch|a@b.de|irgendwas|dringend|morgen]]');
ok(kaputt.status === '' && kaputt.standardisierung === '' && kaputt.prioritaet === '' && kaputt.naechsteUeberpruefung === '' && kaputt.prozesseigner === 'a@b.de',
  'Ungültige Werte fallen raus, gültige bleiben');
ok(M.pzPmMarker({}) === '' && M.pzPmKlartext({ status: '' }) === '', 'Nichts gesetzt: kein Marker, keine Zeile');
ok(/^Prozessmanagement: Status SOLL in Arbeit · Prozesseigner cfo@dihag\.com/.test(M.pzPmKlartext(pm)), 'Klartextzeile für fremde Modeler');
ok(M.pzPmMarker({ prozesseigner: 'x|y]]z' }) === '[[rms:pm=|x y  z|||]]', 'Trenner und Klammern können den Marker nicht sprengen');

console.log('Erbe am Modell');
const daten = { karten: {
  KONZERN: { kacheln: [{ id: 'k1', name: 'Beschaffung', verantwortlich: 'cfo@dihag.com', standardisierung: 'einheitlich' }] },
  HOL: { kacheln: [
    { id: 'h1', name: 'Beschaffung', status: 'poc', prioritaet: 'mittel', naechsteUeberpruefung: '2026-12-01', prozesse: [{ id: 'M1', name: 'Bestellung' }] },
    { id: 'h2', name: 'Lohn', prioritaet: 'hoch' },
  ] },
} };
const kachel = (w, id) => ({ werk: w, kachel: daten.karten[w].kacheln.find(k => k.id === id) });
const [m1] = M.pzModellEintraege(daten, [{ itemId: 'M1', title: 'Bestellung', ordner: 'HOL', pm: null, kacheln: [kachel('HOL', 'h1')] }], HEUTE);
ok(m1.art === 'modell' && m1.status === 'poc', 'Ohne eigenen Status gilt der der Kachel');
ok(m1.eigner.upn === 'cfo@dihag.com' && m1.eigner.geerbt, 'Eigner: über die Kachel von der Konzernkachel geerbt');
ok(m1.standard.key === 'einheitlich' && m1.standard.geerbt, 'Standardisierung ebenso');
ok(m1.prio === 'mittel' && m1.pruefung.datum === '2026-12-01', 'Priorität und Termin von der Kachel');
const [m2] = M.pzModellEintraege(daten, [{ itemId: 'M1', title: 'Bestellung', ordner: 'HOL', pm: { status: 'freigegeben', prozesseigner: 'einkauf@dihag.com', prioritaet: 'niedrig' }, kacheln: [kachel('HOL', 'h1')] }], HEUTE);
ok(m2.status === 'freigegeben' && m2.eigner.upn === 'einkauf@dihag.com' && !m2.eigner.geerbt && m2.prio === 'niedrig', 'Eigene Angaben am Modell haben Vorrang');
const [m3] = M.pzModellEintraege(daten, [{ itemId: 'M3', title: 'Beschaffung', ordner: 'SHB', pm: null, kacheln: [] }], HEUTE);
ok(m3.status === 'ist' && m3.eigner.upn === 'cfo@dihag.com' && m3.eigner.geerbt, 'Ohne Kachel: IST, Eigner von der gleichnamigen Konzernkachel');
const [m4] = M.pzModellEintraege(daten, [{ itemId: 'M4', title: 'Freies Modell', ordner: '', pm: { status: 'ausgerollt' }, kacheln: [] }], HEUTE);
ok(m4.werk === '' && m4.pruefung.stufe === 'fehlt', 'Ausgerollt ohne Termin ist eine Lücke – auch am Modell ohne Ablage');

console.log('Backlog mit Modellen');
const modelle = [{ itemId: 'M1', title: 'Bestellung', ordner: 'HOL', pm: null, kacheln: [kachel('HOL', 'h1')] },
                 { itemId: 'M5', title: 'Fremd', ordner: 'SHB', pm: null, kacheln: [] },
                 { itemId: 'M6', title: 'Ohne Ablage', ordner: '', pm: null, kacheln: [] }];
const alle = M.pzEintraege(daten, ['KONZERN', 'HOL'], HEUTE, modelle);
ok(!alle.some(e => e.art === 'kachel' && e.kachel.id === 'h1'), 'Die Kachel mit Modell steht nicht noch einmal da');
ok(alle.some(e => e.art === 'kachel' && e.kachel.id === 'h2'), 'Eine Kachel ohne Modell bleibt');
ok(alle.some(e => e.art === 'modell' && e.kachel.id === 'M1'), 'Das Modell steht als eigener Prozess');
ok(!alle.some(e => e.kachel.id === 'M5'), 'Modelle fremder Werke bleiben draußen');
ok(alle.some(e => e.kachel.id === 'M6'), 'Modelle ohne Ablage bleiben sichtbar – damit sie einsortiert werden');
const f = M.pzFaellige(daten, null, HEUTE, [{ itemId: 'M7', title: 'Fällig', ordner: 'HOL', pm: { status: 'ausgerollt', naechsteUeberpruefung: '2026-09-01' }, kacheln: [] }]);
ok(f.ueberfaellig.some(e => e.kachel.id === 'M7'), '„Fälligkeiten" kennt Modelle');

/* ── prozesse.js: Dokumentation schreiben, Dokumente am Schritt ── */
const ctx = { console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent, esc, jsArg,
  State: { policies: [{ id: '7', title: 'Einkaufsrichtlinie' }] }, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  toast: () => {}, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx; ctx.globalThis = ctx; ctx.module = undefined;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/prozessmodell.js'), ctx);
vm.runInContext(lies('js/prozesse.js'), ctx);
vm.runInContext(lies('js/verknuepfungen.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

console.log('Dokumentation des Prozesses');
const basis = run('procLeeresBpmn()');
ctx.__x = basis;
const mitAllem = run(`procXmlDokuNeu(__x, { ids: ['7'], docs: [{ name: 'Formular A', url: 'https://x/a.docx', driveId: '', itemId: '' }], pm: { status: 'soll', prozesseigner: 'cfo@dihag.com' } })`);
ok(/\[\[rms:policies=7\]\]/.test(mitAllem) && /\[\[rms:doc=Formular A\|/.test(mitAllem) && /\[\[rms:pm=soll\|cfo@dihag\.com\|/.test(mitAllem), 'Regelwerke, Anlagen und Prozessmanagement in einer Dokumentation');
ctx.__x = mitAllem;
const nurStatus = run(`procXmlDokuNeu(__x, { pm: { status: 'poc', prozesseigner: 'cfo@dihag.com' } })`);
ok(/\[\[rms:policies=7\]\]/.test(nurStatus) && /\[\[rms:doc=Formular A\|/.test(nurStatus) && /\[\[rms:pm=poc\|/.test(nurStatus) && !/\[\[rms:pm=soll/.test(nurStatus),
  'Status setzen lässt Regelwerke und Anlagen stehen');
ctx.__x = nurStatus;
const regel = run(`vkXmlMitRegelwerken(__x, ['7', '9'])`);
ok(/\[\[rms:policies=7,9\]\]/.test(regel) && /\[\[rms:pm=poc\|/.test(regel) && /\[\[rms:doc=Formular A/.test(regel), '„Regelwerk zuordnen" löscht weder Status noch Anlagen');
ctx.__x = basis.replace('<bpmn:startEvent', '<bpmn:documentation>Bestellungen bis 5.000 Euro.</bpmn:documentation>' + NL + '    <bpmn:startEvent');
const frei = run(`procXmlDokuNeu(__x, { pm: { status: 'ist', prioritaet: 'hoch' } })`);
ok(/Bestellungen bis 5\.000 Euro\./.test(frei) && /\[\[rms:pm=ist\|\|\|hoch\|\]\]/.test(frei), 'Die Beschreibung bleibt stehen');
ok((frei.match(/<bpmn:documentation>/g) || []).length === 1, 'Es bleibt bei einer Dokumentation');
const eintrag = run(`procLinkEintrag(procEintragAusXml(${JSON.stringify(nurStatus)}))`);
ok(eintrag.m && eintrag.m.status === 'poc' && eintrag.alt === false, 'Der Cache-Eintrag trägt die Angaben und gilt als vollständig');
ok(run(`procLinkEintrag({ p: [], d: 0, k: false, i: '', u: [] }).alt`) === true, 'Ein Eintrag von vor den Angaben wird nachgelesen');
ok(/Prozessmanagement\|Kennzahlen\|Dokument\)/.test(lies('js/prozesse.js')), 'Die Ansicht zeigt die Klartextzeilen nicht als Beschreibung');

console.log('Dokumente am Schritt');
const text = run(`procSchrittDokuText('Hier wird bestellt.' + String.fromCharCode(10) + 'Weiter im Prozess: Versand' + String.fromCharCode(10) + '[[rms:prozess=HOL:versand]]', [{ name: 'Bestellformular', url: 'https://x/b.pdf', driveId: 'd', itemId: 'i1' }])`);
ok(/Hier wird bestellt\./.test(text) && /\[\[rms:prozess=HOL:versand\]\]/.test(text), 'Beschreibung und Übergang am Element bleiben stehen');
ok(/Dokument: Bestellformular/.test(text) && /\[\[rms:schrittdok=Bestellformular\|https:\/\/x\/b\.pdf\|d\|i1\]\]/.test(text), 'Das Dokument steht mit Klartextzeile und Marker');
ctx.__t = text;
const docs = run('procSchrittDocsAusText(__t)');
ok(docs.length === 1 && docs[0].name === 'Bestellformular' && docs[0].itemId === 'i1', 'Rundlauf: gelesen kommt dasselbe heraus');
const ohne = run('procSchrittDokuText(__t, [])');
ok(!/schrittdok/.test(ohne) && !/Dokument: /.test(ohne) && /\[\[rms:prozess=HOL:versand\]\]/.test(ohne), 'Entfernen nimmt nur das Dokument heraus');
ctx.__xml = basis.replace('<bpmn:startEvent id="StartEvent_1" name="Start" />',
  '<bpmn:startEvent id="StartEvent_1" name="Start"><bpmn:documentation>[[rms:schrittdok=Nur am Schritt|https://x/s.pdf||]]</bpmn:documentation></bpmn:startEvent>');
ok(run('_parseProcessDocs(__xml).length') === 0, 'Die Anlagen des Prozesses sammeln die Dokumente der Schritte nicht ein');

console.log(NL + `${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
