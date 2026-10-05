/**
 * Der Modeler auf Deutsch
 *
 * Eine Übersetzung veraltet beim nächsten Update von bpmn-js: Ein neuer Text
 * kommt dazu und steht englisch zwischen deutschen. Diese Suite liest die
 * Texte deshalb aus dem Paket selbst und verlangt für jeden einen Eintrag.
 * Dazu prüft sie, dass der Modeler die Bausteine so nennt wie das Hausschema
 * und dass beide Modeler im RMS die Übersetzung bekommen.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const { BPMN_DEUTSCH, bpmnUebersetzen, BPMN_DEUTSCH_MODUL } = require(ROOT + '/js/bpmndeutsch.js');
const { PROZESS_BAUSTEINE } = require(ROOT + '/js/prozessschema.js');

/* ── 1) Jeder Text, den bpmn-js übersetzen lässt, steht in der Tabelle ── */
const paket = lies('vendor/bpmn-js/bpmn-modeler.production.min.js');
const texte = new Set();
// Bezeichnungen im Menü „Art ändern"
for (const m of paket.matchAll(/label:"([^"]{2,80})"/g)) texte.add(m[1]);
// Aufrufe des Dienstes „translate", im verkleinerten Code unter kurzem Namen
for (const m of paket.matchAll(/\b[a-zA-Z_$]{1,2}\("([A-Z][^"]{2,90})"(,\{[^}]*\})?\)/g)) texte.add(m[1]);
for (const m of paket.matchAll(/_translate\("([^"]+)"/g)) texte.add(m[1]);
// „Align elements " + Richtung
const richtungen = (paket.match(/"Align elements "\+\w/) && paket.match(/=\["left","center","right","top","middle","bottom"\]/)) ? ['left', 'center', 'right', 'top', 'middle', 'bottom'] : [];
ok(richtungen.length === 6, 'Die sechs Richtungen von „Align elements …" stehen im Paket, wie erwartet');
richtungen.forEach(r => texte.add('Align elements ' + r));
// Der Name des leeren Pools wird zusammengesetzt, bevor er übersetzt wird.
if (/"Empty pool\/participant"/.test(paket) && /" \(removes content\)"/.test(paket)) texte.add('Empty pool/participant (removes content)');
// Keine Oberfläche: eine Fehlermeldung des Abhängigkeits-Containers.
texte.delete('Cannot resolve circular dependency!');

ok(texte.size > 120, `Aus dem Paket gelesen: ${texte.size} Texte (Plausibilität der Suche)`);
const fehlend = [...texte].filter(t => !Object.prototype.hasOwnProperty.call(BPMN_DEUTSCH, t));
ok(fehlend.length === 0, 'Jeder Text hat eine Übersetzung' + (fehlend.length ? ' (fehlt: ' + fehlend.join(' | ') + ')' : ''));
const verwaist = Object.keys(BPMN_DEUTSCH).filter(k => !texte.has(k) && !paket.includes('"' + k + '"'));
ok(verwaist.length === 0, 'Und die Tabelle führt nichts, was es im Paket nicht gibt' + (verwaist.length ? ' (' + verwaist.join(' | ') + ')' : ''));

const gleich = Object.entries(BPMN_DEUTSCH).filter(([en, de]) => !de || (de === en && en !== 'Ad-hoc'));
ok(gleich.length === 0, 'Kein Eintrag ist leer oder englisch geblieben' + (gleich.length ? ' (' + gleich.map(g => g[0]).join(', ') + ')' : ''));

/* ── 2) Der Modeler nennt die Bausteine wie das Hausschema ── */
const zuordnung = { 'User task': 'userTask', 'Service task': 'serviceTask', 'Manual task': 'manualTask',
  'Call activity': 'callActivity', 'Exclusive gateway': 'exclusiveGateway', 'Parallel gateway': 'parallelGateway' };
for (const [en, typ] of Object.entries(zuordnung)) {
  const b = PROZESS_BAUSTEINE.find(x => x.bpmn === typ);
  ok(b && BPMN_DEUTSCH[en] === b.titel, `„${en}" heißt im Modeler „${b && b.titel}", wie im Hausschema`);
}
ok(/^Auslöser/.test(BPMN_DEUTSCH['Start event']) && /^Ergebnis/.test(BPMN_DEUTSCH['End event']),
  'Start- und Endereignis heißen Auslöser und Ergebnis');

/* ── 3) Die Übersetzung selbst ── */
ok(bpmnUebersetzen('Open {element}', { element: 'Auftragserfassung' }) === 'Auftragserfassung öffnen',
  'Platzhalter werden gefüllt: „Open {element}" wird „Auftragserfassung öffnen"');
ok(bpmnUebersetzen('Unbekannter Text {x}') === 'Unbekannter Text {x}',
  'Was die Tabelle nicht kennt, bleibt stehen, samt Platzhalter ohne Wert');
ok(bpmnUebersetzen('constructor') === 'constructor' && bpmnUebersetzen('toString') === 'toString',
  'Namen aus dem Objekt-Prototyp sind keine Übersetzungen');
ok(Array.isArray(BPMN_DEUTSCH_MODUL.translate) && BPMN_DEUTSCH_MODUL.translate[0] === 'value'
  && BPMN_DEUTSCH_MODUL.translate[1] === bpmnUebersetzen,
  'Das Modul ersetzt den Dienst „translate", so wie bpmn-js es vorsieht');

/* ── 4) Beide Modeler im RMS sprechen Deutsch ── */
const proz = lies('js/prozesse.js');
const erzeugt = [...proz.matchAll(/new BpmnJS\((\{.*?\})\);/g)].map(m => m[1]);
ok(erzeugt.length === 2 && erzeugt.every(a => /additionalModules:\s*_procSprachmodule\(\)/.test(a)),
  'Editor und Ansicht bekommen die Übersetzung');
ok(/function _procSprachmodule\(\)\s*\{\s*return typeof BPMN_DEUTSCH_MODUL !== 'undefined' \? \[BPMN_DEUTSCH_MODUL\] : \[\];/.test(proz),
  'Fehlt die Tabelle, startet der Modeler englisch statt gar nicht');
const modul = lies('js/module.js');
for (const gruppe of ['prozesse', 'notfall', 'dokumentation']) {
  const zeile = (modul.match(new RegExp(`^\\s*${gruppe}:.*$`, 'm')) || [''])[0];
  ok(/'bpmndeutsch'/.test(zeile), `Die Ansicht „${gruppe}" lädt die Übersetzung`);
}

/* ── 5) Schreibweise ── */
const striche = Object.values(BPMN_DEUTSCH).filter(t => /\s[–—]\s/.test(t));
ok(striche.length === 0, 'Keine Gedankenstriche in den Texten' + (striche.length ? ' (' + striche.join(' | ') + ')' : ''));
ok(!/\b(du|dein|dich|dir)\b/i.test(Object.values(BPMN_DEUTSCH).join(' ')), 'Keine Du-Form');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
