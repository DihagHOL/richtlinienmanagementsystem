/**
 * Prozess-Backlog, Prozessmanagement an der Kachel und Prozesse unter
 * „Fälligkeiten".
 *
 * Worauf es ankommt:
 *   • Das Backlog zeigt eine Spalte je Status. Die IST-Spalte zeigt nur, was
 *     priorisiert ist – der Rest steht als Zahl darunter und lässt sich zuschalten.
 *   • Der Status wird an der Karte gesetzt und über die Landkarte gespeichert:
 *     mit Verlaufseintrag für das Werk der Karte, ohne die offene Landkarte
 *     umzustellen. Schlägt das Speichern fehl, steht der alte Stand wieder da.
 *   • Der Kachel-Editor kennt die fünf neuen Felder und schreibt jede Änderung
 *     in den Versionsverlauf.
 *   • „Fälligkeiten" nennt überfällige und freigegebene Prozesse ohne Termin.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire as _requireFuerHelfer } from 'module';
const { jsArg } = _requireFuerHelfer(import.meta.url)('../js/util.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DATEN = {
  version: 2, historie: [],
  karten: {
    KONZERN: { baender: [{ key: 'unterstuetzung', titel: 'Unterstützung' }], kacheln: [
      { id: 'k-einkauf', nr: 1, band: 'unterstuetzung', name: 'Beschaffung', geltung: ['ALLE'], verantwortlich: 'cfo@dihag.com', standardisierung: 'einheitlich' },
    ] },
    HOL: { baender: [{ key: 'unterstuetzung', titel: 'Unterstützung' }], kacheln: [
      { id: 'h-einkauf', nr: 2, band: 'unterstuetzung', name: 'Beschaffung', geltung: ['HOL'], status: 'poc', prioritaet: 'hoch' },
      { id: 'h-it', nr: 3, band: 'unterstuetzung', name: 'IT', geltung: ['HOL'], prioritaet: 'mittel' },
      { id: 'h-lohn', nr: 4, band: 'unterstuetzung', name: 'Lohn', geltung: ['HOL'] },
      { id: 'h-alt', nr: 5, band: 'unterstuetzung', name: 'Archiv', geltung: ['HOL'], status: 'ausgerollt', naechsteUeberpruefung: '2020-01-01' },
    ] },
  },
};

const mount = { innerHTML: '' };
let modal = '';
const gespeichert = [];
let speichernGeht = true;
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent,
  setTimeout: (f) => f(), clearTimeout: () => {},
  esc, toast: () => {}, fmtDate: (d) => String(d || '').slice(0, 10),
  canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB'],
  State: { user: { name: 'Anna Muster', upn: 'anna@dihag.com' }, policies: [] },
  emptyState: (t) => `<div class="empty">${t}</div>`,
  prozessModusLeiste: (a) => `<div class="modus">${a}</div>`,
  openModal: (h) => { modal = h; }, closeModal: () => {},
  geltungsbereichLabel: (a) => (!a || !a.length ? '' : a.join(', ')),
  renderGeltungsbereichSection: () => '<div class="gb"></div>',
  spLoadLandkarte: async () => ({ daten: JSON.parse(JSON.stringify(DATEN)), geaendertAm: 'T1' }),
  spLandkarteMeta: async () => 'T1',
  spSaveLandkarte: async (d) => { if (!speichernGeht) throw new Error('weg'); gespeichert.push(JSON.parse(JSON.stringify(d))); return 'T1'; },
  document: {
    getElementById: (id) => (id === 'prozesse-mount' ? mount : null),
    querySelectorAll: () => [], querySelector: () => null,
  },
};
ctx.window = ctx; ctx.globalThis = ctx;
ctx.jsArg = jsArg;
vm.createContext(ctx);
vm.runInContext(lies('js/prozessmodell.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
vm.runInContext(lies('js/prozessbacklog.js'), ctx);
const w = (code) => vm.runInContext(code, ctx);

await w('initProzessBacklog()');

console.log('Backlog');
const html = mount.innerHTML;
ok(/<div class="modus">backlog<\/div>/.test(html), 'Die Umschaltleiste steht mit „backlog" aktiv');
for (const s of ['IST erfasst', 'SOLL in Arbeit', 'POC läuft', 'Freigegeben', 'Ausgerollt']) {
  ok(html.includes(`<span>${s}</span>`), `Spalte „${s}"`);
}
ok(html.includes('>IT</a>') && !html.includes('>Lohn</a>'), 'IST zeigt nur Priorisiertes (IT ja, Lohn nein)');
ok(/\+ 2 ohne Priorität/.test(html), 'Die nicht priorisierten IST-Prozesse stehen als Zahl darunter (Lohn, Konzern-Beschaffung)');
ok(html.includes('Prio hoch'), 'Die Priorität steht an der Karte');
ok(/cfo@dihag\.com[^<]*<span class="field-hint" title="Prozesseigner der Konzern-Landkarte">↑/.test(html), 'Der geerbte Prozesseigner ist als geerbt markiert');
ok(/einheitlich ↑/.test(html), 'Der geerbte Standardisierungsgrad ist als geerbt markiert');
ok(/⏰ seit \d+ Tagen fällig/.test(html), 'Eine überfällige Überprüfung steht an der Karte');
ok(html.includes('pbStatusSetzen(&quot;HOL&quot;,&quot;h-it&quot;,this.value)'), 'Der Status lässt sich an der Karte umstellen');

w('pbIstAlleZeigen(true)');
ok(mount.innerHTML.includes('>Lohn</a>'), 'Zugeschaltet zeigt IST auch den Rest');
w('pbSetPrio("hoch")');
ok(mount.innerHTML.includes('>Beschaffung</a>') && !mount.innerHTML.includes('>IT</a>'), 'Filter Priorität hoch');
w('pbSetPrio(""); pbSetStandard("offen")');
ok(!mount.innerHTML.includes('>Beschaffung</a>') && mount.innerHTML.includes('>IT</a>'), 'Filter „noch nicht entschieden" lässt geerbte Entscheidungen weg');
w('pbSetStandard(""); pbIstAlleZeigen(false)');

console.log('Status an der Karte setzen');
w('_lkWerk = "KONZERN"');
await w('pbStatusSetzen("HOL", "h-it", "freigegeben")');
const letzte = gespeichert[gespeichert.length - 1];
const it = letzte.karten.HOL.kacheln.find(k => k.id === 'h-it');
ok(it.status === 'freigegeben' && /^\d{4}-\d{2}-\d{2}$/.test(it.naechsteUeberpruefung), 'Gespeichert: Status freigegeben, Überprüfung gesetzt');
const v = letzte.historie[letzte.historie.length - 1];
ok(v.werk === 'HOL' && /IT.*IST erfasst → Freigegeben/.test(v.was), 'Der Verlauf nennt Werk und Wechsel');
ok(w('_lkWerk') === 'KONZERN', 'Die offene Landkarte bleibt, wo sie war');
speichernGeht = false;
await w('pbStatusSetzen("HOL", "h-lohn", "soll")');
ok(w('_lkDaten.karten.HOL.kacheln.find(k => k.id === "h-lohn").status') === undefined, 'Scheitert das Speichern, steht der alte Stand wieder da');
speichernGeht = true;

console.log('Kachel: Ansicht und Editor');
w('_lkWerk = "HOL"; lkKachelOeffnen("h-einkauf")');
ok(modal.includes('Prozessmanagement') && modal.includes('POC läuft'), 'Die Kachel zeigt den Block Prozessmanagement mit Status');
ok(/cfo@dihag\.com<\/a><span class="field-hint"[^>]*> · von der Konzern-Landkarte/.test(modal), 'Geerbter Eigner mit Herkunft');
w('lkKachelBearbeiten("h-einkauf")');
ok(modal.includes('Prozesseigner (E-Mail)') && modal.includes('Standardisierungsgrad') && modal.includes('Nächste Überprüfung'), 'Der Editor hat die neuen Felder');
ok(modal.includes('wie Konzern-Landkarte: gruppeneinheitlich'), 'Die leere Standardisierung nennt das Erbe');
w('_lkEditing.prozesseigner = "einkauf@dihag.com"; _lkEditing.prioritaet = "niedrig"; _lkEditing.standardisierung = "rahmen"; lkPzStatusWahl("ausgerollt")');
await w('lkEditorSpeichern()');
const nach = gespeichert[gespeichert.length - 1];
const be = nach.karten.HOL.kacheln.find(k => k.id === 'h-einkauf');
ok(be.prozesseigner === 'einkauf@dihag.com' && be.prioritaet === 'niedrig' && be.standardisierung === 'rahmen' && be.status === 'ausgerollt', 'Alle Felder sind gespeichert');
ok(/^\d{4}-\d{2}-\d{2}$/.test(be.naechsteUeberpruefung), 'Ausrollen im Editor setzt die Überprüfung');
const v2 = nach.historie[nach.historie.length - 1].was;
ok(/Status: POC läuft → Ausgerollt/.test(v2) && /Prozesseigner: \(niemand\) → einkauf@dihag\.com/.test(v2)
  && /Standardisierung: offen → einheitlicher Rahmen/.test(v2) && /Priorität: hoch → niedrig/.test(v2), 'Der Verlauf nennt jede Änderung');

w('_lkWerk = "HOL"; lkKachelNeu()');
w('_lkEditing.name = "Reisekosten"; _lkEditing.geltungsbereich = ["HOL"]; _lkEditing.prioritaet = "mittel"');
await w('lkEditorSpeichern()');
const neu = gespeichert[gespeichert.length - 1].karten.HOL.kacheln.find(k => k.name === 'Reisekosten');
ok(neu && neu.status === 'ist' && neu.prioritaet === 'mittel', 'Ein neuer Prozess startet als „IST erfasst" mit seiner Priorität');

console.log('Fälligkeiten');
const fctx = { console, JSON, Date, Array, Object, String, Math, Number, esc, jsArg, State: { policies: [] }, document: { getElementById: () => null } };
fctx.window = fctx; fctx.globalThis = fctx;
vm.createContext(fctx);
vm.runInContext(lies('js/prozessmodell.js'), fctx);
vm.runInContext(lies('js/faelligkeit.js'), fctx);
fctx.D = JSON.parse(JSON.stringify(DATEN));
fctx.D.karten.HOL.kacheln.push({ id: 'h-frei', name: 'Freigegeben ohne Termin', status: 'freigegeben' });
const fh = vm.runInContext('_faelligProzesseHtml(pzFaellige(D, null))', fctx);
ok(/Überfällig \(1\)/.test(fh) && fh.includes('Archiv'), 'Überfällige Prozesse stehen oben');
ok(/Ohne Review-Termin \(\d\)/.test(fh) && fh.includes('Freigegeben ohne Termin'), 'Prozesse ohne Review-Termin sind eine eigene Gruppe');
ok(fh.includes('faelligProzessOeffnen(&quot;HOL&quot;,&quot;h-alt&quot;)'), 'Ein Klick führt zur Kachel');

console.log('Modelle im Backlog');
const mount2 = { innerHTML: '' };
const dateien = {};      // itemId → XML
const gesichert = [];
const mctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent,
  setTimeout: (f) => f(), clearTimeout: () => {}, esc, toast: () => {}, fmtDate: (d) => String(d || '').slice(0, 10),
  canWriteTab: () => true, STANDORTE: ['HOL', 'SHB'], localStorage: { getItem: () => null, setItem: () => {} },
  State: { user: { name: 'Anna Muster', upn: 'anna@dihag.com' }, policies: [{ id: '7', title: 'Einkauf' }] },
  emptyState: (t) => `<div class="empty">${t}</div>`, prozessModusLeiste: (a) => `<div class="modus">${a}</div>`,
  openModal: () => {}, closeModal: () => {},
  spLoadLandkarte: async () => ({ daten: JSON.parse(JSON.stringify(DATEN)), geaendertAm: 'T1' }),
  spLandkarteMeta: async () => 'T1', spSaveLandkarte: async () => 'T1',
  spGetProcessXml: async (id) => dateien[id],
  spSaveProcess: async (name, xml, werk) => { gesichert.push({ name, xml, werk }); dateien[name === 'Bestellung' ? 'M1' : 'M2'] = xml; return { id: name === 'Bestellung' ? 'M1' : 'M2' }; },
  spListProcesses: async () => [{ itemId: 'M1', title: 'Bestellung', name: 'Bestellung.bpmn', ordner: 'HOL', modified: 'T2' },
                                { itemId: 'M2', title: 'Reisekosten', name: 'Reisekosten.bpmn', ordner: '', modified: 'T2' }],
  document: { getElementById: (id) => (id === 'prozesse-mount' ? mount2 : null), querySelectorAll: () => [], querySelector: () => null },
};
mctx.window = mctx; mctx.globalThis = mctx;
vm.createContext(mctx);
vm.runInContext(lies('js/util.js'), mctx);
vm.runInContext(lies('js/prozessmodell.js'), mctx);
vm.runInContext(lies('js/landkarte.js'), mctx);
vm.runInContext(lies('js/prozesse.js'), mctx);
vm.runInContext(lies('js/prozessbacklog.js'), mctx);
const m = (code) => vm.runInContext(code, mctx);
dateien.M1 = m('procLeeresBpmn()');
dateien.M2 = m(`procXmlDokuNeu(procLeeresBpmn(), { ids: [], docs: [], pm: { status: 'soll', prioritaet: 'hoch' } })`);
// Die Beschaffung in HOL bekommt das Modell M1
await m('lkDatenLaden()');
m(`_lkDaten.karten.HOL.kacheln.find(k => k.id === 'h-einkauf').prozesse = [{ id: 'M1', name: 'Bestellung' }]`);
m(`_processes = [{ itemId: 'M1', title: 'Bestellung', name: 'Bestellung.bpmn', ordner: 'HOL', modified: 'T1' },
                 { itemId: 'M2', title: 'Reisekosten', name: 'Reisekosten.bpmn', ordner: '', modified: 'T1' }]`);
await m('procEintraegeLaden(_processes)');
m('_prozModus = "backlog"; _pbIstAlle = true; renderProzessBacklog()');
const bh = mount2.innerHTML;
ok(bh.includes('🔀 Bestellung') && bh.includes('🔀 Reisekosten'), 'Beide Modelle stehen als eigene Prozesse da');
ok(!bh.includes('pbOeffnen(&quot;HOL&quot;,&quot;h-einkauf&quot;)'), 'Die Kachel mit Modell steht nicht noch einmal da');
ok(/🔀 Bestellung[\s\S]*?🗺 P-002/.test(bh), 'Das Modell nennt seine Kachel');
ok(/🔀 Reisekosten[\s\S]*?ohne Ablage[\s\S]*?ohne Landkarte/.test(bh), 'Ein Modell ohne Ablage und ohne Kachel ist als solches erkennbar');
const poc = bh.split('<span>POC läuft</span>')[1].split('pb-spalte-kopf')[0];
ok(poc.includes('🔀 Bestellung'), 'Ohne eigenen Status übernimmt das Modell den der Kachel (POC)');
const soll = bh.split('<span>SOLL in Arbeit</span>')[1].split('pb-spalte-kopf')[0];
ok(soll.includes('🔀 Reisekosten') && soll.includes('Prio hoch'), 'Der Status aus der Datei zählt');
ok(bh.includes('pbModellStatusSetzen(&quot;M1&quot;,this.value)'), 'Der Status eines Modells wird am Modell gesetzt');
ok(bh.includes('+ Prozess anlegen'), '„+ Prozess anlegen" steht im Backlog');
m('pbSetArt("frei")');
ok(mount2.innerHTML.includes('🔀 Reisekosten') && !mount2.innerHTML.includes('🔀 Bestellung'), 'Filter „Modelle ohne Landkarte"');
m('pbSetArt("")');

await m('pbModellStatusSetzen("M1", "freigegeben")');
const letzteDatei = gesichert[gesichert.length - 1];
ok(letzteDatei && letzteDatei.name === 'Bestellung' && letzteDatei.werk === 'HOL', 'Gespeichert wird die Datei des Modells in ihrer Ablage');
ok(/\[\[rms:pm=freigegeben\|/.test(letzteDatei.xml), 'Der Status steht im BPMN');
ok(/\[\[rms:pm=freigegeben\|\|\|\|\d{4}-\d{2}-\d{2}\]\]/.test(letzteDatei.xml), 'Weder Modell noch Kachel hatten einen Termin – die Freigabe setzt ihn am Modell');
ok(m('_lkDaten.karten.HOL.kacheln.find(k => k.id === "h-einkauf").status') === 'poc', 'Die Kachel bleibt unberührt');

console.log(`\n${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
