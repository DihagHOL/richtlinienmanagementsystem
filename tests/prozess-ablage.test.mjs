/**
 * Ablage der Prozessmodelle: „Prozesse/<Werk>/<Name>.bpmn".
 *
 * Jedes Werk führt seine eigene Landkarte – seine Modelle gehören deshalb auch
 * in einen eigenen Ordner. Zwei Dinge hängen daran:
 *   • „Vertrieb" in HOL und „Vertrieb" in SHB sind zwei Dateien. Ohne Ordner
 *     wäre es dieselbe, und das zweite Werk überschriebe das erste.
 *   • Ein Umzug darf keine Verknüpfung reißen: verschoben wird die Datei
 *     (PATCH), nicht neu angelegt – die Kennung bleibt, Landkarte und Mindmap
 *     finden das Modell weiterhin.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ══════════════════════════════════════════════════════════════════
   Teil 1 – die Speicherschicht (js/sharepoint.js)
   ══════════════════════════════════════════════════════════════════ */

const gets = [];      // { url }
const rufe = [];      // { url, method, body }
let getAntwort = () => ({ value: [] });
let rufAntwort = () => ({ ok: true, status: 200, json: async () => ({ id: 'neu' }), text: async () => '' });

const sctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Promise, encodeURIComponent,
  TextEncoder: class { encode(s) { return s; } },
  fetch: () => {}, location: { origin: '', pathname: '' },
  acquireToken: async () => 'tok',
};
sctx.window = sctx; sctx.globalThis = sctx;
vm.createContext(sctx);
vm.runInContext(lies('js/sharepoint.js'), sctx);
sctx.__get = async (url) => { gets.push(url); return getAntwort(url); };
sctx.__ruf = async (url, opt) => { rufe.push({ url, method: (opt || {}).method || 'GET', body: (opt || {}).body || '' }); return rufAntwort(url, opt); };
vm.runInContext(`
  _ismsLib = async () => {};
  _sp.ismsDriveId = 'drv';
  _get = (url) => __get(url);
  _fetchRetry = (url, opt) => __ruf(url, opt);
`, sctx);
const s = (code) => vm.runInContext(code, sctx);

/* ── 1) Ordnername: was in einen Pfad darf ── */
ok(s("_prozessOrdnerName('HOL')") === 'HOL', 'Ein Werk-Kürzel bleibt, wie es ist');
ok(s("_prozessOrdnerName('')") === '' && s("_prozessOrdnerName(null)") === '', 'Ohne Werk bleibt der Ordner leer');
ok(s("_prozessOrdnerName('../../geheim')") === 'geheim',
  'Punkte und Schrägstriche fallen weg – ein Ordnername kann nicht aus dem Ordner ausbrechen');
ok(s("_prozessOrdnerName('HOL SHB')") === 'HOLSHB', 'Leerzeichen ebenfalls');

/* ── 2) Pfad ── */
ok(s("_prozessPfad('HOL','Vertrieb.bpmn')") === 'Prozesse/HOL/Vertrieb.bpmn', 'Mit Werk: ein Unterordner');
ok(s("_prozessPfad('','Vertrieb.bpmn')") === 'Prozesse/Vertrieb.bpmn',
  'Ohne Werk: direkt im Prozesse-Ordner – der Altbestand bleibt erreichbar');
ok(s("_prozessPfad('HOL','Gießerei.bpmn')").includes('Gie%C3%9Ferei'), 'Umlaute werden kodiert');

/* ── 3) Auflisten: Wurzel UND die Werk-Ordner darunter ── */
getAntwort = (url) => {
  if (/root:\/Prozesse:\/children/.test(url)) {
    return { value: [
      { id: 'a', name: 'Altbestand.bpmn', lastModifiedDateTime: '2026-01-01' },
      { id: 'x', name: 'Notizen.txt' },
      { id: 'f1', name: 'HOL', folder: { childCount: 2 } },
      { id: 'f2', name: 'SHB', folder: { childCount: 1 } },
    ] };
  }
  if (/items\/f1\/children/.test(url)) return { value: [{ id: 'h1', name: 'Vertrieb.bpmn' }, { id: 'h2', name: 'Einkauf.bpmn' }] };
  if (/items\/f2\/children/.test(url)) return { value: [{ id: 's1', name: 'Vertrieb.bpmn' }] };
  return { value: [] };
};
const liste = await s('spListProcesses()');
ok(liste.length === 4, `Vier Modelle – aus der Wurzel und aus beiden Werk-Ordnern (${liste.length})`);
ok(!liste.some(p => /\.txt$/i.test(p.name)), 'Was keine .bpmn-Datei ist, bleibt draußen');
const nachId = Object.fromEntries(liste.map(p => [p.itemId, p]));
ok(nachId.h1.ordner === 'HOL' && nachId.s1.ordner === 'SHB', 'Der Ordner ist das Werk');
ok(nachId.a.ordner === '', 'Was direkt im Prozesse-Ordner liegt, hat kein Werk');
ok(nachId.h1.title === 'Vertrieb' && nachId.s1.title === 'Vertrieb',
  'Gleicher Name in zwei Werken – zwei Dateien, kein Konflikt');

/* Ein Ordner, der nicht lesbar ist, darf nicht die ganze Liste kosten. */
getAntwort = (url) => {
  if (/root:\/Prozesse:\/children/.test(url)) return { value: [
    { id: 'a', name: 'Altbestand.bpmn' }, { id: 'f1', name: 'HOL', folder: {} }] };
  throw Object.assign(new Error('403'), { status: 403 });
};
const teil = await s('spListProcesses()');
ok(teil.length === 1 && teil[0].itemId === 'a', 'Ein gesperrter Werk-Ordner kostet nur seinen Inhalt, nicht die Liste');

/* Fehlt der Prozesse-Ordner noch, ist die Liste leer – kein Fehler. */
getAntwort = () => { throw Object.assign(new Error('itemNotFound'), { status: 404 }); };
ok((await s('spListProcesses()')).length === 0, 'Ohne Prozesse-Ordner: leere Liste statt Fehlermeldung');

/* ── 4) Speichern: Ordner anlegen, dann in den Ordner schreiben ── */
rufe.length = 0;
rufAntwort = (url, opt) => (opt && opt.method === 'POST')
  ? { ok: false, status: 409, text: async () => 'nameAlreadyExists' }      // Ordner gibt es schon
  : { ok: true, status: 200, json: async () => ({ id: 'gespeichert' }) };
await s("spSaveProcess('Vertrieb', '<xml/>', 'HOL')");
const posts = rufe.filter(r => r.method === 'POST');
ok(posts.length === 2, 'Zwei Ordner werden abgesichert: „Prozesse" und das Werk');
ok(/"name":"Prozesse"/.test(posts[0].body) && /"name":"HOL"/.test(posts[1].body), '… in dieser Reihenfolge');
ok(posts.every(p => /"@microsoft.graph.conflictBehavior":"fail"/.test(p.body)),
  'Anlegen mit „fail" – 409 heißt: gibt es schon, und das ist der Normalfall');
const put = rufe.find(r => r.method === 'PUT');
ok(put && /Prozesse\/HOL\/Vertrieb\.bpmn:\/content/.test(put.url), 'Die Datei landet im Ordner des Werks');

rufe.length = 0;
await s("spSaveProcess('Altbestand', '<xml/>')");
const put2 = rufe.find(r => r.method === 'PUT');
ok(put2 && /Prozesse\/Altbestand\.bpmn:\/content/.test(put2.url) && !/Prozesse\/[A-Z]+\//.test(put2.url),
  'Ohne Werk bleibt alles wie bisher – bestehende Dateien werden nicht umgehängt');
ok(rufe.filter(r => r.method === 'POST').length === 1, 'Und es wird kein leerer Werk-Ordner angelegt');

/* ── 5) Verschieben: die Kennung muss den Umzug überleben ── */
getAntwort = (url) => ({ id: /HOL/.test(url) ? 'ordner-HOL' : /SHB/.test(url) ? 'ordner-SHB' : 'ordner-wurzel' });
rufe.length = 0;
rufAntwort = () => ({ ok: true, status: 200, json: async () => ({ id: 'p-1' }) });
const bewegt = await s("spMoveProcess('p-1', 'SHB')");
const patch = rufe.find(r => r.method === 'PATCH');
ok(patch && /items\/p-1$/.test(patch.url), 'Verschoben wird über die Kennung der Datei …');
ok(patch && /"parentReference":\{"id":"ordner-SHB"\}/.test(patch.body), '… in den Zielordner');
ok(!/"name"/.test(patch.body), 'Ohne neuen Namen bleibt der Name unangetastet');
ok(bewegt && bewegt.id === 'p-1', 'Die Kennung bleibt dieselbe – Verknüpfungen laufen nicht ins Leere');

rufe.length = 0;
await s("spMoveProcess('p-1', 'HOL', 'Neuer Name')");
ok(/"name":"Neuer Name\.bpmn"/.test(rufe.find(r => r.method === 'PATCH').body),
  'Umbenennen im selben Zug – auch dabei bleibt die Kennung erhalten');

rufe.length = 0;
await s("spMoveProcess('p-1', '')");
ok(/"id":"ordner-wurzel"/.test(rufe.find(r => r.method === 'PATCH').body),
  'Zurück in den Prozesse-Ordner geht auch – „ohne Werk" ist ein gültiges Ziel');

rufAntwort = () => ({ ok: false, status: 409, text: async () => '{"error":{"code":"nameAlreadyExists"}}' });
let meldung = '';
try { await s("spMoveProcess('p-1', 'HOL', 'Vertrieb')"); } catch (e) { meldung = e.message; }
ok(/bereits ein Modell mit diesem Namen/.test(meldung),
  'Ein Namenskonflikt wird im Klartext gemeldet, nicht als „409"');

/* ══════════════════════════════════════════════════════════════════
   Teil 2 – Liste und Aufräumen (js/prozesse.js + js/landkarte.js)
   ══════════════════════════════════════════════════════════════════ */

const mount = { innerHTML: '' };
const gemeldet = [];
const verschoben = [];
const pctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Promise,
  esc: (x) => String(x ?? ''), toast: (t) => gemeldet.push(String(t)),
  fmtDate: (d) => String(d || '').slice(0, 10),
  canWriteTab: () => true,
  uiConfirm: async () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC', 'EIS'],
  State: { user: { name: 'Anna Muster' }, policies: [] },
  document: { getElementById: (id) => (id === 'prozesse-mount' || id === 'proc-cards' ? mount : null), querySelectorAll: () => [] },
  openModal: () => {}, closeModal: () => {},
  spLoadLandkarte: async () => null, spLandkarteMeta: async () => '',
  spMoveProcess: async (id, werk) => { verschoben.push(id + '→' + werk); },
  spListProcesses: async () => [],
};
pctx.window = pctx; pctx.globalThis = pctx;
vm.createContext(pctx);
vm.runInContext(lies('js/landkarte.js'), pctx);
vm.runInContext(lies('js/prozesse.js'), pctx);
const p = (code) => vm.runInContext(code, pctx);
p('refreshProzesse = async () => {};');

/* ── 6) Gruppierung: erst die Werke, ohne Werk zuletzt ── */
p(`_processes = [
  { itemId: '1', title: 'B', ordner: 'SHB' },
  { itemId: '2', title: 'A', ordner: '' },
  { itemId: '3', title: 'C', ordner: 'KONZERN' },
  { itemId: '4', title: 'D', ordner: 'HOL' },
  { itemId: '5', title: 'E', ordner: 'Sonstiges' },
];`);
const gruppen = p('_procGruppen(_processes).map(g => g.key)');
ok(gruppen.join('|') === 'KONZERN|HOL|SHB|Sonstiges|',
  `Konzern, dann die Werke in ihrer Reihenfolge, Unbekanntes danach, „ohne Werk" zuletzt (${gruppen.join(', ')})`);
ok(p("_procGruppen(_processes).find(g => g.key === '').titel") === 'Ohne Zuordnung',
  'Die letzte Gruppe heißt „Ohne Zuordnung" – nicht leer und nicht kryptisch');
ok(p('_procGruppen(_processes).reduce((n, g) => n + g.rows.length, 0)') === 5, 'Kein Modell geht beim Gruppieren verloren');
p('_renderProcCards();');
ok(/Ohne Zuordnung/.test(mount.innerHTML) && (mount.innerHTML.match(/item-cards/g) || []).length === 5,
  'Die Liste zeigt je Werk einen Block');

/* ── 7) Aufräumen: das Werk sagt die Landkarte ── */
p(`_lkDaten = lkStartbestand(); _lkGeladen = true;
   _lkDaten.karten.SHB = { baender: lkKarte('HOL').baender, ergebnisse: [], kacheln: [
     { id: 'giess', band: 'kern', name: 'Gießerei', geltung: ['SHB'], prozesse: [{ id: '', name: 'Gießerei' }] },
     { id: 'audit', band: 'fuehrung', name: 'Audit', geltung: ['SHB'], prozesse: [{ id: 'gemein' }] },
   ] };
   Object.assign(lkKachelVonId('vertrieb'), { prozesse: [{ id: 'm-vertrieb' }] });
   Object.assign(lkKachelVonId('compliance'),   { prozesse: [{ id: 'gemein' }] });
   _processes = [
     { itemId: 'm-vertrieb', title: 'Vertrieb', ordner: '' },
     { itemId: 'm-giess',    title: 'Gießerei', ordner: '' },
     { itemId: 'gemein',     title: 'Gemeinsam', ordner: '' },
     { itemId: 'm-frei',     title: 'Ohne Kachel', ordner: '' },
     { itemId: 'm-fertig',   title: 'Schon einsortiert', ordner: 'HOL' },
   ];`);
await p('prozessAblageAufraeumen()');
ok(verschoben.includes('m-vertrieb→HOL'), 'Ein über die Kennung verknüpftes Modell zieht in den Ordner seines Werks');
ok(verschoben.includes('m-giess→SHB'), 'Auch ein nur über den Namen verknüpftes – so hängt der Altbestand daran');
ok(!verschoben.some(x => x.startsWith('gemein')),
  'Zeigen Kacheln aus zwei Werken darauf, bleibt es liegen – diese Entscheidung kann die App nicht treffen');
ok(!verschoben.some(x => x.startsWith('m-frei')), 'Was keine Kachel führt, wird nicht geraten');
ok(!verschoben.some(x => x.startsWith('m-fertig')), 'Und was schon einsortiert ist, wird nicht angefasst');
ok(/2 Modell/.test(gemeldet[gemeldet.length - 1] || ''), 'Gemeldet wird, wie viele einsortiert wurden');

verschoben.length = 0; gemeldet.length = 0;
p("_processes = [{ itemId: 'm-fertig', title: 'X', ordner: 'HOL' }];");
await p('prozessAblageAufraeumen()');
ok(!verschoben.length && /bereits/.test(gemeldet.join(' ')), 'Ist nichts zu tun, sagt die App das auch');

/* ── 8) Kein Umweg über Löschen mehr ── */
const quelle = lies('js/prozesse.js');
const saveBlock = quelle.slice(quelle.indexOf('async function saveProcess'), quelle.indexOf('async function downloadProcessXml'));
ok(!/spDeleteProcess/.test(saveBlock),
  'Umbenennen löscht die alte Datei nicht mehr – das hätte die Kennung und damit jede Verknüpfung zerrissen');
ok(/spMoveProcess/.test(saveBlock) && /spSaveProcess\(name, xml, werk\)/.test(saveBlock),
  'Stattdessen: verschieben/umbenennen, dann den Inhalt in denselben Pfad schreiben');

console.log(`\n  ${fail ? '✗' : '✓'} ${pass} grün${fail ? `, ${fail} rot` : ''}`);
process.exit(fail ? 1 : 0);
