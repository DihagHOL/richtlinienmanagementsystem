/**
 * Abrufe teilen: Fragt die Anwendung SharePoint nur einmal, wenn mehrere
 * Ansichten gleichzeitig dasselbe brauchen?
 *
 * Anlass (gemessen am 16.11.2026 auf rms.dihag.de): Das Cockpit schlug die
 * ISMS-Site aus acht Kacheln gleichzeitig nach, acht gleiche Abrufe statt einem.
 * Fälligkeiten und Kennzahlen luden jeweils alle Prozessmodelle herunter, gut
 * hundert Dateien und rund zehn Sekunden je Ansicht, jedes Mal neu.
 *
 * Geteilt wird nur, was sich teilen lässt: ein laufender Abruf derselben
 * Auskunft, und ein Modell, dessen Stand sich laut Liste nicht geändert hat.
 * Der Editor liest weiter frisch.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const ctx = { console, JSON, Date, TextEncoder, Object, Array, Number, String, Math, Set, Map, Promise, encodeURIComponent, setTimeout, module: { exports: {} } };
ctx.window = ctx; ctx.globalThis = ctx; ctx.location = { origin: '', pathname: '' };
const urls = [];
let inhalt = '<xml>eins</xml>', kaputt = false;
const warte = (ms) => new Promise(r => setTimeout(r, ms));
ctx.fetch = async (url, opt) => {
  urls.push({ url, methode: (opt && opt.method) || 'GET' });
  await warte(5);   // wie im Netz: Die Antwort kommt nicht sofort, gleichzeitige Aufrufer überholen sie
  const j = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => null } });
  if (/\/sites\/dihag\.sharepoint\.com:\/sites\/ISMS$/.test(url)) return j({ id: 'isms' });
  if (/\/sites\/isms\/drives$/.test(url)) return j({ value: [{ id: 'd1', name: 'ISMS Dokumente', webUrl: 'https://x/isms' }] });
  if (/\/drives\/d1\/list\?/.test(url)) return j({ id: 'l1' });
  if (/\/drives\/d1\/items\/[^/]+\/content$/.test(url)) {
    if (kaputt) return { ok: false, status: 503, text: async () => 'nix', json: async () => ({}), headers: { get: () => '0.001' } };
    return { ok: true, status: 200, text: async () => inhalt, json: async () => ({}), headers: { get: () => null } };
  }
  if (/\/drives\/d1\/root:\/Prozesse/.test(url)) return j({ id: 'neu', name: 'x.bpmn' });
  return { ok: false, status: 404, text: async () => 'nix', json: async () => ({}), headers: { get: () => null } };
};
vm.createContext(ctx);
vm.runInContext(lies('js/sharepoint.js'), ctx);
vm.runInContext('acquireToken = async () => "tok";', ctx);
const lauf = (code) => vm.runInContext(code, ctx);
const zahl = (re) => urls.filter(u => re.test(u.url)).length;

/* ── 1) Die Site: acht Kacheln, ein Abruf ── */
const ids = await lauf('Promise.all(Array.from({ length: 8 }, () => _ismsSiteId("tok")))');
ok(ids.length === 8 && ids.every(i => i === 'isms'), 'Acht gleichzeitige Aufrufer bekommen alle die Site');
ok(zahl(/\/sites\/dihag\.sharepoint\.com:\/sites\/ISMS$/) === 1, 'und dafür ging genau ein Abruf hinaus');
await lauf('_ismsSiteId("tok")');
ok(zahl(/\/sites\/dihag\.sharepoint\.com:\/sites\/ISMS$/) === 1, 'Danach ist die Kennung gemerkt');

/* ── 2) Die Bibliothek ── */
await lauf('Promise.all([_ismsLib("tok"), _ismsLib("tok"), _ismsLib("tok")])');
ok(zahl(/\/sites\/isms\/drives$/) === 1 && zahl(/\/drives\/d1\/list\?/) === 1, 'Drei gleichzeitige Aufrufer suchen die Bibliothek gemeinsam, einmal');

/* ── 3) Modelle: unveränderte Datei aus dem Speicher der Sitzung ── */
const inhalte = () => zahl(/\/items\/[^/]+\/content$/);
const p = { itemId: 'm1', modified: '2026-11-16T08:00:00Z', size: 1200 };
ctx.p = p;
ok(lauf('spProzessStand(p)') === '2026-11-16T08:00:00Z|1200' && lauf('spProzessStand({})') === '' && lauf('spProzessStand(null)') === '',
  'Der Stand kommt aus Änderungszeit und Größe; ohne Angabe ist er leer');
const a = await lauf('spGetProcessXml("m1", spProzessStand(p))');
const b = await lauf('spGetProcessXml("m1", spProzessStand(p))');
ok(a === '<xml>eins</xml>' && b === a && inhalte() === 1, 'Gleicher Stand: die zweite Ansicht lädt die Datei nicht noch einmal');
const [c, d] = await lauf('Promise.all([spGetProcessXml("m2", "s"), spGetProcessXml("m2", "s")])');
ok(c === d && inhalte() === 2, 'Zwei Ansichten gleichzeitig teilen den laufenden Download');
inhalt = '<xml>zwei</xml>';
ctx.p2 = { itemId: 'm1', modified: '2026-11-16T09:30:00Z', size: 1200 };
ok(await lauf('spGetProcessXml("m1", spProzessStand(p2))') === '<xml>zwei</xml>' && inhalte() === 3, 'Neuer Stand in der Liste: Die Datei wird neu gelesen');
ok(await lauf('spGetProcessXml("m1", spProzessStand(p))') === '<xml>zwei</xml>' && inhalte() === 4, 'Gemerkt ist nur der jüngste Stand je Datei');
inhalt = '<xml>drei</xml>';
ok(await lauf('spGetProcessXml("m1")') === '<xml>drei</xml>' && await lauf('spGetProcessXml("m1")') === '<xml>drei</xml>' && inhalte() === 6,
  'Ohne Stand wird immer frisch gelesen: Der Editor bekommt die Datei, wie sie jetzt ist');

kaputt = true;
let gescheitert = false;
try { await lauf('spGetProcessXml("m3", "s")'); } catch (e) { gescheitert = /fehlgeschlagen/.test(e.message); }
kaputt = false;
const vorher = inhalte();
ok(gescheitert && await lauf('spGetProcessXml("m3", "s")') === '<xml>drei</xml>' && inhalte() === vorher + 1, 'Ein gescheiterter Download bleibt nicht gemerkt, der nächste Versuch liest neu');

await lauf('spGetProcessXml("m4", "s")');
const vorSpeichern = inhalte();
await lauf('spSaveProcess("Neu", "<xml/>", "")');
await lauf('spGetProcessXml("m4", "s")');
ok(inhalte() === vorSpeichern + 1, 'Nach dem Speichern eines Modells ist der Speicher leer');

/* ── 4) Die Aufrufer ── */
ok(/spGetProcessXml\(p\.itemId, stand\(p\)\)/.test(lies('js/faelligkeit.js')) && /spGetProcessXml\(p\.itemId, stand\(p\)\)/.test(lies('js/kennzahlen.js')),
  'Fälligkeiten und Kennzahlen geben den Stand aus der Liste mit');
ok(/spGetProcessXml\(p\.itemId, \(typeof spProzessStand === 'function'\) \? spProzessStand\(p\) : ''\)/.test(lies('js/verantwortung.js')), 'Die Verantwortung ebenso');
ok(!/spGetProcessXml\([^)]*,/.test(lies('js/prozesse.js')) && !/spGetProcessXml\([^)]*,/.test(lies('js/prozessfreigabe.js')),
  'Editor und Freigabe lesen ohne Stand, also immer frisch');
ok(/if \(typeof spGetTicketsLeise === 'function' && typeof vfKennzahlen === 'function'\) spGetTicketsLeise\(\);/.test(lies('js/clevelreport.js')),
  'Der Audit Report stößt die Tickets an, bevor er die Register der Reihe nach liest');

/* ── 5) Spalten suchen: einmal je Liste, nicht einmal je Feld und Eintrag ──
   Gemessen am 16.11.2026: 8.162 Tickets, 44 Spalten. Die Suche nach dem
   Spaltennamen lief für jedes Feld jedes Tickets neu, 27 Sekunden Rechenzeit. */
const actx = { console, JSON, Object, Array, String, Number, Math, Set, Map, WeakMap, Date, module: { exports: {} } };
actx.window = actx; actx.globalThis = actx;
vm.createContext(actx);
vm.runInContext(lies('js/assetmodell.js'), actx);
const { amSpalteFinden, amSpaltenNorm } = actx.module.exports;
let normAufrufe = 0;
const spalten = Array.from({ length: 44 }, (_, i) => ({ name: 'Spalte' + i, get displayName() { normAufrufe++; return 'Anzeige ' + i; } }));
spalten[40] = { name: 'Kategorie0', displayName: 'Kategorie' };
// Ein fester Satz Aliase, wie im Betrieb (VF_ALIASE, AM_ALIASE): Der Merkzettel hängt an Liste UND Satz.
const ohne = {};
ok(amSpalteFinden(spalten, 'Kategorie', ohne) === 'Kategorie0', 'Die Spalte wird über den Anzeigenamen gefunden');
const nachErstem = normAufrufe;
for (let i = 0; i < 5000; i++) amSpalteFinden(spalten, 'Kategorie', ohne);
ok(nachErstem > 0 && normAufrufe === nachErstem, 'Die zweite bis fünftausendste Frage nach derselben Spalte durchsucht die Liste nicht noch einmal');
const al = { Kategorie: ['Rubrik'] };
ok(amSpalteFinden([{ name: 'Rubrik', displayName: 'Rubrik' }], 'Kategorie', al) === 'Rubrik' && amSpalteFinden(spalten, 'Kategorie', al) === 'Kategorie0',
  'Jede Liste und jeder Satz Aliase hat seinen eigenen Merkzettel');
const neu = spalten.slice(0, 40);
ok(amSpalteFinden(neu, 'Kategorie', ohne) === null, 'Neu geladene Spalten sind eine neue Liste: Der alte Zettel gilt für sie nicht');
neu.push({ name: 'Kat', displayName: 'Kategorie' });
ok(amSpalteFinden(neu, 'Kategorie', ohne) === 'Kat', 'Wächst eine Liste am Stück, wird neu gesucht');
ok(amSpalteFinden(null, 'Kategorie', ohne) === null && amSpalteFinden(undefined, 'Titel') === null && typeof amSpaltenNorm === 'function', 'Ohne Liste gibt es nichts zu finden und nichts zu merken');
ok(/amSpalteFinden\(_tk\.cols, erwartet, VF_ALIASE\)/.test(lies('js/sharepoint.js')), 'Die Tickets fragen mit dem festen Satz VF_ALIASE');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
