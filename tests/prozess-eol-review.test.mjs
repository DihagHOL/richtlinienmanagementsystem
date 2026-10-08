/**
 * IST und SOLL im Backlog: EOL, Nachfolger, Freigeber, Review in den Fälligkeiten.
 *
 * Ein IST-Prozess, den ein SOLL ablöst, läuft aus (EOL). Er bleibt als Nachweis
 * stehen, nennt seinen Nachfolger und wird nicht mehr überprüft. Ab dem POC
 * braucht ein Prozess einen Review-Termin und die Angabe, wer ihn freigibt.
 * Die Fälligkeiten haben dafür eine eigene Rubrik „Prozesse".
 *
 * Dazu zwei Dinge, die der Import der IST-Modelle braucht:
 *   • Aufrufaktivitäten aus einer Datei nennen ihr Ziel nur über calledElement;
 *     gibt es genau ein Modell mit dieser Prozess-Kennung, wird es eingebunden.
 *   • Elemente mit eigener Farbe (die Bewertung einer IST-Aufnahme) behalten sie
 *     in Ansicht, Bild und Word-Beschreibung.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const M = require(ROOT + '/js/prozessmodell.js');
const HEUTE = new Date(2026, 9, 8);

/* ══ 1) Lebenszyklus und Angaben am Modell ══ */
const eol = M.pzStatusInfo('eol');
ok(eol.key === 'eol' && /EOL/.test(eol.label) && /abgelöst/.test(eol.text) && M.PZ_STATUS[M.PZ_STATUS.length - 1].key === 'eol',
  'EOL ist die letzte Stufe: der Ablauf läuft aus und wird abgelöst');
ok(M.PZ_REVIEW_PFLICHT.join() === 'poc,freigegeben,ausgerollt', 'Ab dem POC braucht ein Prozess einen Review-Termin');

const pm = { status: 'eol', prozesseigner: 'cfo@dihag.com', freigeber: 'gf@dihag.com', nachfolger: '01SOLL' };
const marker = M.pzPmMarker(pm);
ok(marker === '[[rms:pm=eol|cfo@dihag.com|||||gf@dihag.com|01SOLL]]', 'Freigeber und Nachfolger stehen hinten im Marker');
const zurueck = M.pzPmAusText('x ' + marker);
ok(zurueck.status === 'eol' && zurueck.freigeber === 'gf@dihag.com' && zurueck.nachfolger === '01SOLL' && zurueck.prozesseigner === 'cfo@dihag.com',
  'Und kommen beim Lesen wieder heraus');
ok(M.pzPmMarker({ status: 'soll', prozesseigner: 'a@dihag.com' }) === '[[rms:pm=soll|a@dihag.com|||]]', 'Ohne sie bleibt es beim alten Format mit fünf Feldern');
ok(M.pzPmAusText('[[rms:pm=freigegeben|a@dihag.com|einheitlich|hoch|2027-01-01|3]]').freigeber === '', 'Ältere Marker lesen sich unverändert, ohne Freigeber');
ok(/Freigabe durch gf@dihag\.com/.test(M.pzPmKlartext(pm)) && /abgelöst durch 01SOLL/.test(M.pzPmKlartext(pm)), 'Der Klartext nennt beides');

/* ══ 2) Review ══ */
ok(M.pzUeberpruefung({ status: 'poc' }, HEUTE).stufe === 'fehlt', 'POC ohne Termin: Lücke');
ok(M.pzUeberpruefung({ status: 'poc', naechsteUeberpruefung: '2026-10-20' }, HEUTE).stufe === 'bald', 'POC mit Termin in zwölf Tagen: bald');
ok(M.pzUeberpruefung({ status: 'eol', naechsteUeberpruefung: '2026-01-01' }, HEUTE).stufe === '', 'EOL: kein Review mehr, auch ein alter Termin wird nicht überfällig');
ok(M.pzUeberpruefung({ status: 'soll' }, HEUTE).stufe === '', 'SOLL in Arbeit: noch keine Pflicht');

/* ══ 3) Modelle im Backlog ══ */
const modelle = [
  { itemId: 'IST1', title: 'E-Rechnung Rechnungseingang (IST)', ordner: 'KONZERN', pm: { status: 'eol', nachfolger: 'SOLL1' }, kacheln: [] },
  { itemId: 'SOLL1', title: 'E-Rechnung Rechnungseingang', ordner: 'KONZERN', pm: { status: 'poc', freigeber: 'gf@dihag.com' }, kacheln: [] },
  { itemId: 'SOLL2', title: 'E-Rechnung Rechnungsausgang', ordner: 'KONZERN', pm: { status: 'poc' }, kacheln: [] },
];
const eintraege = M.pzModellEintraege({ karten: {} }, modelle, HEUTE);
ok(eintraege[0].status === 'eol' && eintraege[0].nachfolger === 'SOLL1' && eintraege[1].freigeber === 'gf@dihag.com', 'Einträge tragen Nachfolger und Freigeber');
const kz = M.pzKennzahlen(eintraege);
ok(kz.eol === 1 && kz.modelle === 2 && kz.mitFreigeber === 1, 'Kennzahlen: EOL zählt nicht als Modell in Arbeit; einer von zwei hat einen Freigeber');
ok(kz.ohneTermin === 2, 'Beide POC ohne Review-Termin sind Lücken');
const spalten = M.pzSpalten(eintraege);
ok(spalten.eol.length === 1 && spalten.poc.length === 2, 'Das Backlog hat eine Spalte EOL');
const faellig = M.pzFaellige({ karten: {} }, null, HEUTE, modelle);
ok(faellig.fehlt.length === 2 && !faellig.fehlt.some(e => e.status === 'eol'), 'In den Fälligkeiten: die beiden POC ohne Termin, der EOL-Prozess nicht');

/* Karten im Backlog */
const bctx = { console, Map, Set, Array, Object, String, JSON, Math, Date, Number, RegExp,
  esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  workflowBadge: (s) => `<span class="status-badge">${s}</span>`,
  document: { getElementById: () => null, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem() {} },
};
bctx.window = bctx; bctx.globalThis = bctx;
vm.createContext(bctx);
vm.runInContext(lies('js/util.js'), bctx);
vm.runInContext(lies('js/prozessmodell.js'), bctx);
vm.runInContext(lies('js/prozessbacklog.js'), bctx);
bctx._processes = modelle.map(m => ({ itemId: m.itemId, title: m.title, ordner: m.ordner, modified: 'm' }));
bctx.procModellVon = (id) => bctx._processes.find(p => p.itemId === id) || null;
bctx.procEintragVon = (p) => { const m = modelle.find(x => x.itemId === p.itemId); return { m: m ? m.pm : null }; };
bctx.procKachelnVon = () => [];
bctx.pfIstHauptprozess = () => true;
bctx.pfRegelwerkVon = (id) => (id === 'SOLL2' ? { id: '88', status: 'Freigabe', freigabeKonfig: { freigeber: ['cfo@dihag.com'] } } : null);
bctx.getPolicyGeschaeftsleitung = (p) => p.freigabeKonfig.freigeber;
const E = vm.runInContext(`pzModellEintraege({ karten: {} }, pbModelle(), new Date(2026, 9, 8))`, bctx);
const karte = (id) => E.find(e => e.kachel.id === id);
ok(/↪ abgelöst durch <a [^>]*pbModellOeffnen\(&quot;SOLL1&quot;\)[^>]*>E-Rechnung Rechnungseingang<\/a>/.test(vm.runInContext('_pbAbloesungHtml', bctx)(karte('IST1'))),
  'Die EOL-Karte nennt ihren Nachfolger, anklickbar');
ok(/↩ löst ab: <a [^>]*>E-Rechnung Rechnungseingang \(IST\)<\/a>/.test(vm.runInContext('_pbAbloesungHtml', bctx)(karte('SOLL1'))),
  'Die SOLL-Karte sagt, welchen IST-Prozess sie ablöst');
ok(vm.runInContext('_pbFreigabeHtml', bctx)(karte('IST1')) === '', 'Ein auslaufender Prozess braucht keinen Freigeber');
ok(/✅ Freigabe durch gf@dihag\.com/.test(vm.runInContext('_pbFreigabeHtml', bctx)(karte('SOLL1'))), 'Eingetragener Freigeber');
ok(/<span class="status-badge">Freigabe<\/span><\/a>\s+Freigabe: cfo@dihag\.com/.test(vm.runInContext('_pbFreigabeHtml', bctx)(karte('SOLL2'))),
  'Gibt es das Regelwerk der Freigabe, stehen sein Status und seine Freigeber da');
bctx.pfRegelwerkVon = () => null;
ok(/wer gibt frei\? offen/.test(vm.runInContext('_pbFreigabeHtml', bctx)(karte('SOLL2'))), 'Sonst steht die Frage offen da');

const bl = lies('js/prozessbacklog.js');
ok(/pbAngabenDialog\(\$\{jsArg\(k\.id\)\}\)/.test(bl) && /Freigabe durch/.test(bl) && /Abgelöst durch/.test(bl) && /Review \(nächste Überprüfung\)/.test(bl),
  '„✎ Angaben" an jeder Modellkarte: Eigner, Freigeber, Review, Nachfolger');
ok(/procPmAusXml\(xml\) \|\| pzPmNormal\(\{\}\)/.test(bl) && /procXmlDokuNeu\(xml, \{ pm: pzPmNormal\(pm\) \}\)/.test(bl), 'Gespeichert wird in die Datei, ausgehend von ihrem Stand');
ok(/repeat\(6, minmax/.test(lies('css/style.css')), 'Sechs Spalten im Brett');
ok(/proc-pm-freigeber/.test(lies('js/prozesse.js')) && /proc-pm-nachfolger/.test(lies('js/prozesse.js')), 'Beides auch im Modeler');
ok(/pmHaupt && pmHaupt\.freigeber\) p\.freigabeKonfig = \{ freigeber: \[pmHaupt\.freigeber\]/.test(lies('js/prozessfreigabe.js')),
  'Bei „📋 Zur Freigabe" wird der Freigeber des Modells Freigeber des Regelwerks');

/* ══ 4) Fälligkeiten: Rubriken ══ */
const mount = { innerHTML: '' };
const fctx = { console, Map, Set, Array, Object, String, JSON, Math, Date, Number, RegExp, URLSearchParams,
  esc: bctx.esc, jsArg: (v) => JSON.stringify(String(v)).replace(/"/g, '&quot;'), fmtDate: (d) => String(d || ''),
  workflowBadge: (s) => s, emptyState: (t) => t, canWriteTab: () => true,
  document: { getElementById: (id) => (id === 'faelligkeit-mount' ? mount : null) },
  location: { search: '?ansicht=faelligkeit&rubrik=prozesse' },
  localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } },
  State: { policies: [{ id: '1', title: 'Leitlinie', status: 'Veröffentlicht', version: '1.0', naechsteReview: '2020-01-01' }] },
};
fctx.window = fctx; fctx.globalThis = fctx;
vm.createContext(fctx);
vm.runInContext(lies('js/faelligkeit.js'), fctx);
vm.runInContext('_faelligRegisterZeigen = () => {}; _faelligFunktionZeigen = () => {}; _faelligProzesseZeigen = () => {};', fctx);
vm.runInContext('renderFaelligkeit()', fctx);
ok(/fael-rubriken/.test(mount.innerHTML) && /🔀 Prozesse/.test(mount.innerHTML) && /📘 Regelwerke <span class="fael-zahl">1<\/span>/.test(mount.innerHTML),
  'Rubriken oben, mit der Zahl überfälliger Regelwerke');
ok(/id="fael-prozesse"/.test(mount.innerHTML) && !/id="fael-register"/.test(mount.innerHTML) && !/Leitlinie/.test(mount.innerHTML),
  '?rubrik=prozesse zeigt nur die Prozesse');
vm.runInContext("faelligRubrikSetzen('')", fctx);
ok(/id="fael-prozesse"/.test(mount.innerHTML) && /id="fael-register"/.test(mount.innerHTML) && /Leitlinie/.test(mount.innerHTML) && fctx.localStorage._s.rms_faellig_rubrik === '',
  '„Alles" zeigt alles wie bisher, die Wahl bleibt im Browser');
vm.runInContext("faelligRubrikSetzen('regelwerke')", fctx);
ok(/Leitlinie/.test(mount.innerHTML) && !/id="fael-prozesse"/.test(mount.innerHTML), 'Die Rubrik Regelwerke zeigt nur die Regelwerke');
const fh = vm.runInContext("_faelligProzesseHtml(pzFaellige ? { ueberfaellig: [], bald: [], spaeter: [], fehlt: [] } : null)", Object.assign(fctx, { pzFaellige: true, PZ_UEBERPRUEFUNG_MONATE: 12, pzNrText: () => '', pzStatusInfo: () => ({ label: '' }) }));
ok(/Ein <b>POC<\/b> braucht den Termin seiner Bewertung/.test(fh) && /\(<b>EOL<\/b>\) wird nicht mehr überprüft/.test(fh), 'Die Rubrik erklärt POC und EOL');

/* ══ 5) Aufrufe aus importierten Dateien, eigene Farben ══ */
const P = lies('js/prozesse.js');
ok(/function procAufrufeAufloesen\(\)/.test(P) && /procKennungVon\(p\.itemId\) === ziel/.test(P) && /treffer\.length !== 1/.test(P) && /procBindetTransitiv\(treffer\[0\]\.itemId, eigen\)/.test(P),
  'Eine ⊞ mit calledElement findet ihr Modell über die Prozess-Kennung, nur bei genau einem Treffer und ohne Kreis');
ok(/const aufgeloest = canWrite \? procAufrufeAufloesen\(\) : 0;/.test(P) && /procAufrufeAufloesen\(\);\s+procUnterprozesseAbgleichen\(\);/.test(P),
  'Beim Öffnen (sobald alle Kennungen da sind) und beim Speichern');

const pctx = { console, Map, Set, Array, Object, String, JSON, Math, Date, Number, RegExp, esc: bctx.esc,
  document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, location: { search: '' } };
pctx.window = pctx; pctx.globalThis = pctx;
vm.createContext(pctx);
vm.runInContext(lies('js/util.js'), pctx);
vm.runInContext(lies('js/prozessschema.js'), pctx);
vm.runInContext(lies('js/prozesse.js'), pctx);
const farbig = vm.runInContext('procEigeneFarbe', pctx);
ok(farbig({ di: { get: (k) => (k === 'bioc:fill' ? '#FBE4E4' : undefined), $attrs: {} } }) === true, 'bpmn-js-Farbe erkannt');
ok(farbig({ di: { $attrs: { 'color:background-color': '#E3F2E6' } } }) === true, 'BPMN-Farbangabe erkannt, auch ohne registrierte Erweiterung');
ok(farbig({ di: { get: () => undefined, $attrs: {} } }) === false && farbig({}) === false, 'Ohne Farbe: die Art färbt');
ok(/if \(procEigeneFarbe\(el\)\) return;/.test(P) && /procEigeneFarbe\(el\)\) return;/.test(lies('js/bpmnanleitung.js')),
  'Ansicht und Word-Bilder lassen eigene Farben stehen');

/* Aufrufaktivität mit calledElement: im Modeler eingebunden */
vm.runInContext(`
  _processes = [{ itemId: 'VA', title: 'Variante A', ordner: 'KONZERN', modified: 'm1' }, { itemId: 'GES', title: 'Gesamt', ordner: 'KONZERN', modified: 'm2' }];
  _procLinkCache = { 'VA|m1': { p: [], d: 0, k: false, i: 'Process_ErEingangIstA', u: [], m: null, g: { u: [], n: [] }, h: '' },
                     'GES|m2': { p: [], d: 0, k: false, i: 'Process_ErEingangIst', u: [], m: null, g: { u: [], n: [] }, h: '' } };
  _procEditing = { itemId: 'GES' };
  var __el = { id: 'CA', type: 'bpmn:CallActivity', businessObject: { calledElement: 'Process_ErEingangIstA', name: 'Variante A', documentation: [{ text: 'Unterprozess: Variante A' }] } };
  var __gesetzt = [];
  _bpmnModeler = { get: (d) => d === 'elementRegistry' ? { filter: (fn) => [__el].filter(fn) }
    : d === 'moddle' ? { create: (t, a) => ({ $type: t, ...a }) }
    : d === 'modeling' ? { updateProperties: (el, props) => { __gesetzt.push(props); Object.assign(el.businessObject, props); } } : null };
`, pctx);
ok(vm.runInContext('procAufrufeAufloesen()', pctx) === 1, 'Die ⊞ der importierten Datei wird eingebunden');
const doku = vm.runInContext('__el.businessObject.documentation[0].text', pctx);
ok(/\[\[rms:modell=VA\]\]/.test(doku) && /^Unterprozess: Variante A$/m.test(doku) && (doku.match(/Unterprozess:/g) || []).length === 1, 'Mit Marker und Klartextzeile, ohne doppelte Zeile');
ok(vm.runInContext('procAufrufeAufloesen()', pctx) === 0, 'Ein zweites Mal ändert nichts');

/* ══ 6) Doku ══ */
const doku2 = lies('js/dokumentation.js');
ok(/EOL/.test(doku2) && /Freigabe durch/.test(doku2) && /Rubrik/.test(doku2) && /calledElement/.test(doku2), 'Die Dokumentation beschreibt EOL, Freigeber, Rubriken und den Import mit calledElement');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
