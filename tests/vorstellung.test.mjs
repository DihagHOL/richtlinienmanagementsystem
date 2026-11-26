/**
 * Vorstellung: Folien aus den Daten des RMS (js/vorstellung.js)
 *
 * Die Folien sind für Geschäftsführung und IT-Leitung. Sie dürfen nichts
 * behaupten, was nicht in den Daten steht: Fehlt eine Angabe, steht „offen"
 * da. Namen und Texte kommen aus SharePoint, nie aus dem Code (das Repo ist
 * öffentlich).
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

const V = require(ROOT + '/js/vorstellung.js');

/* ── 1) Angaben und Schritte ── */
const leer = V.vsAngaben(null);
ok(V.VS_FELDER.every(f => leer[f.key] === '') && leer.prozess === '' && leer.asset === '', 'Ohne Angaben ist jedes Feld leer');
ok(V.vsAngaben({ ansprechpartner: '  Frau Beispiel  ' }).ansprechpartner === 'Frau Beispiel', 'Leerzeichen am Rand fallen weg');
ok(V.vsSchritte('1. Menschen sichern\n2) Alarmieren\n\n3. Lage klären').join('|') === 'Menschen sichern|Alarmieren|Lage klären', 'Nummerierte Sofortmaßnahmen werden zu Schritten ohne Nummer');

/* ── 2) Folien ohne Daten: nichts erfinden ── */
const nichts = V.vsFolien({ werkLabel: 'Konzern / Holding', datum: '26.11.2026', angaben: leer, kennzahlen: {}, stab: null, prozess: null, ausfall: null, phasen: [], luecken: [] });
ok(nichts.map(f => f.key).join() === 'titel,zustaendig,stand,krisenstab,stunden,ausfall,phasen,weiter', 'Acht Folien in fester Reihenfolge');
const html = (liste, k) => liste.find(f => f.key === k).html;
ok((html(nichts, 'zustaendig').match(/vs-offen/g) || []).length === 5, 'Fehlen die Angaben, stehen fünf Zeilen als offen da');
ok(/noch kein Krisenstab/.test(html(nichts, 'krisenstab')) && /vs-offen/.test(html(nichts, 'krisenstab')), 'Kein Krisenstab wird als offen gesagt');
ok(/vs-offen/.test(html(nichts, 'stunden')) && /vs-offen/.test(html(nichts, 'ausfall')), 'Ohne Plan und Asset keine erfundenen Schritte');
ok(/<b>Entwurf bis:<\/b> <span class="vs-offen">offen/.test(html(nichts, 'weiter')), 'Ohne Termin steht offen');

/* ── 3) Folien mit Daten ── */
const daten = {
  werkLabel: 'WGC', datum: '26.11.2026',
  angaben: V.vsAngaben({ ansprechpartner: 'Person A', meldeweg: 'Anruf <bei> der IT & Ticket', termin: '30.11.2026', schritte: 'Erstens\nZweitens' }),
  kennzahlen: { kritisch: 16, mitPlan: 16, geuebt: 0, stabOk: 0, werke: 10, stabFehlt: 6 },
  stab: { mitglieder: [{ rolle: 'Leitung Krisenstab', name: '', vertretung: '' }, { rolle: 'IT / OT', name: 'Person B', vertretung: '' }],
    stufen: [{ nr: 2, label: 'Notfall', erklaert: 'Leitung', alarmiert: 'Kern' }, { nr: 3, label: 'Krise', erklaert: 'Leitung', alarmiert: 'alle' }] },
  prozess: { name: 'Fertigung', standAm: '21.09.2026', schritte: ['eins', 'zwei', 'drei', 'vier', 'fuenf'] },
  ausfall: { asset: 'ERP', stufe: 'Krise', erklaert: 'Leitung', kritisch: ['Versand', 'Auftrag'] },
  phasen: [{ titel: 'Planen', frage: 'Was?', reiter: ['a', 'b'] }],
  luecken: ['Leitung Krisenstab ist nicht benannt.'],
};
const voll = V.vsFolien(daten);
ok(/Person A/.test(html(voll, 'zustaendig')) && /&lt;bei&gt; der IT &amp; Ticket/.test(html(voll, 'zustaendig')), 'Eingaben werden entschärft angezeigt');
ok((html(voll, 'zustaendig').match(/vs-offen/g) || []).length === 3, 'Nur die drei fehlenden Angaben sind offen');
ok(/vs-zahl">16</.test(html(voll, 'stand')) && /vs-zahl">0\/10</.test(html(voll, 'stand')) && /6 Standorte haben noch keinen Krisenstab/.test(html(voll, 'stand')), 'Die Kennzahlen stehen auf der Standfolie');
ok(/Person B/.test(html(voll, 'krisenstab')) && /Ausruf durch Leitung/.test(html(voll, 'krisenstab')) && (html(voll, 'krisenstab').match(/vs-offen/g) || []).length === 3, 'Der Krisenstab zeigt Namen und offene Rollen, dazu wer ausruft');
ok((html(voll, 'stunden').match(/<div class="vs-karte">/g) || []).length === 4 && !/fuenf/.test(html(voll, 'stunden')), 'Höchstens vier Schritte passen auf die Folie');
ok(/vs-zahl">2</.test(html(voll, 'ausfall')) && /Das RMS stuft den Ausfall als Krise ein/.test(html(voll, 'ausfall')), 'Der Beispielausfall nennt Zahl und Stufe');
ok(/<b>Entwurf bis:<\/b> 30\.11\.2026/.test(html(voll, 'weiter')) && /<li>Zweitens<\/li>/.test(html(voll, 'weiter')) && /nicht benannt/.test(html(voll, 'weiter')), 'Termin, Schritte und Lücken auf der letzten Folie');
ok(V.vsFolien(Object.assign({}, daten, { kennzahlen: { stabFehlt: 1, werke: 1 } }))[2].html.includes('1 Standort hat noch keinen Krisenstab'), 'Einzahl bei einem Standort');

/* ── 4) Eingehängt ── */
const modul = lies('js/module.js');
const notfall = lies('js/notfall.js');
const eigen = lies('js/vorstellung.js');
ok(/'notfall', 'vorstellung'\]\),\n  vorfaelle:/.test(modul), 'Das Modul lädt mit dem Notfall-Reiter');
ok(/typeof vsOeffnen === 'function'/.test(notfall) && /Vorstellen<\/button>/.test(notfall), 'Der Knopf steht im Notfall-Reiter und nur, wenn das Modul da ist');
ok(/nfDaten\(\)\.vorstellung = neu/.test(eigen) && /lkSpeichern\('Angaben zur Vorstellung gespeichert/.test(eigen), 'Gespeichert wird in der Landkarte auf SharePoint, mit Verlauf');
ok(!/localStorage|sessionStorage/.test(eigen), 'Nichts landet im Browserspeicher');
ok(/nfDarfSchreiben\(\)/.test(eigen), 'Ändern darf nur, wer den Reiter schreiben darf');
ok(!/@[a-z0-9-]+\.(com|de)\b/i.test(eigen) && !/Fedorov|Lissitsa|Friedland|Dihag|DIHAG/i.test(eigen), 'Im Code stehen keine Namen und keine Firmenangaben');
const css = lies('css/style.css');
ok(/\.vs-folie\b/.test(css) && /body\.vs-drucken \.vs-folie/.test(css), 'Folien und Druck sind gestaltet');
ok(/<b>🖥 Vorstellen:<\/b>/.test(lies('js/dokumentation.js')), 'Die Dokumentation erklärt die Funktion');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
