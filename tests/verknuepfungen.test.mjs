/**
 * Verknüpfungen (Mindmap): wer hängt woran – und was hängt an nichts.
 *
 * Der Aufbau folgt der „Beziehungsansicht" gängiger Prozessmanagement-Werkzeuge:
 * ein Objekt in der Mitte, seine Beziehungen nach Art gruppiert ringsum, Klick
 * rückt einen Nachbarn in die Mitte. Zwei Dinge sind dabei nicht Kosmetik:
 *
 *   • Das Bild muss lesbar bleiben. Neunzehn Kästen auf einem Kreis überlappten
 *     sich – gemessen, nicht vermutet. Deshalb zeigt der Graph höchstens zwölf
 *     Nachbarn, reihum aus jeder Beziehungsart, und darunter stehen ALLE als Chips.
 *   • Der Graph darf keine zweite Wahrheit anlegen. Er liest Landkarte, BPMN und
 *     Regelwerke – und speichert nichts.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const vk = lies('js/verknuepfungen.js');
const proz = lies('js/prozesse.js');
const css = lies('css/style.css');

const mount = { innerHTML: '' };
const policies = [
  { id: '1', title: 'Informationssicherheitsleitlinie', version: '1.0', status: 'Veröffentlicht', geltungsbereich: ['ALLE'], typ: 'Regelwerk' },
  { id: '2', title: 'Kartellrecht', version: '1.1', status: 'Veröffentlicht', geltungsbereich: ['HOL', 'SHB'], typ: 'Regelwerk' },
  { id: '3', title: 'Reisekosten', version: '2.0', status: 'Veröffentlicht', geltungsbereich: ['ALLE'], typ: 'Regelwerk' },
  { id: '4', title: 'Entwurf', version: '0.1', status: 'Entwurf', geltungsbereich: ['ALLE'], typ: 'Regelwerk' },
];
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Number, Map, Set, Promise,
  esc: (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  toast: () => {}, fmtDate: (d) => String(d || '').slice(0, 10), canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC', 'EIS'],
  State: { user: { name: 'T' }, policies },
  document: { getElementById: (id) => (id === 'prozesse-mount' ? mount : null), querySelectorAll: () => [] },
  openModal: () => {}, closeModal: () => {},
  geltungsbereichLabel: (a) => (!a || !a.length ? '' : a.includes('ALLE') ? 'Alle Standorte' : a.join(', ')),
  prozessModusLeiste: () => '',
  _processes: [
    { itemId: 'm1', title: 'Vertrieb', modified: 'x' },
    { itemId: 'm2', title: 'Produktion', modified: 'x' },
    { itemId: 'm3', title: 'Ohne Bezug', modified: 'x' },
  ],
  _procLinkCache: { 'm1|x': ['2'], 'm2|x': ['1'], 'm3|x': [] },
  spGetProcessXml: async () => { throw new Error('sollte aus dem Cache kommen'); },
  _parsePolicyIds: () => [],
  openProcessEditor: () => {}, focusPolicyCard: () => {}, setProzessModus: () => {},
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
vm.runInContext(vk, ctx);
const w = (a) => vm.runInContext(a, ctx);

w(`_lkDaten = lkStartbestand(); _lkDaten.historie = []; _lkGeladen = true;
   Object.assign(lkKachelVonId('vertrieb'),   { prozessId: 'm1', geltung: ['ALLE'] });
   Object.assign(lkKachelVonId('produktion'), { prozessId: 'm2', geltung: ['HOL','SHB'] });
   Object.assign(lkKachelVonId('qs'),         { geltung: [] });`);

const graph = await ctx.vkGraphBauen();
ctx.__g = graph; w('_vkGraph = __g;');

/* ── 1) Der Graph ── */
const arten = [...graph.knoten.values()].reduce((a, n) => (a[n.art] = (a[n.art] || 0) + 1, a), {});
ok(arten.wurzel === 1 && arten.band === 3 && arten.prozess === 17, 'Wurzel, drei Bänder, siebzehn Prozesse');
ok(arten.modell === 2, 'Nur verknüpfte Modelle sind Knoten – „Ohne Bezug" hängt an keiner Kachel');
ok(arten.regelwerk === 2, 'Und nur Regelwerke, die ein Modell umsetzt');
ok(arten.standort === 3, 'Standorte: ALLE, HOL, SHB – aus Kacheln und Regelwerken zusammen');
const typen = [...new Set(graph.kanten.map(k => k.typ))].sort();
ok(typen.join('|') === 'enthält|gilt für|gliedert|modelliert in|setzt um', `Fünf Beziehungsarten (${typen.join(', ')})`);
ok(graph.kanten.some(k => k.von === 'prozess:vertrieb' && k.nach === 'modell:m1' && k.typ === 'modelliert in'),
  'Kachel → Modell');
ok(graph.kanten.some(k => k.von === 'modell:m1' && k.nach === 'regelwerk:2' && k.typ === 'setzt um'),
  'Modell → Regelwerk, gelesen aus dem BPMN-Marker');
ok(graph.kanten.some(k => k.von === 'regelwerk:2' && k.nach === 'standort:HOL'),
  'Regelwerk → Standort, aus seinem eigenen Geltungsbereich');
ok(graph.kanten.some(k => k.von === 'prozess:qs' && k.nach === 'standort:ALLE'),
  'Ein Prozess ohne gepflegten Geltungsbereich zählt als konzernweit');

/* ── 2) Nachbarn und Gegenrichtung ── */
const nb = (id) => vm.runInContext(`vkNachbarn(${JSON.stringify(id)}).map(g => g.typ + ':' + g.liste.length).sort()`, ctx);
ok(nb('modell:m1').join('|') === 'modelliert:1|setzt um:1',
  'Beim Modell heißt die Gegenrichtung „modelliert", nicht „modelliert in"');
ok(nb('regelwerk:2').join('|') === 'gilt für:2|umgesetzt in:1', 'Beim Regelwerk „umgesetzt in"');
ok(nb('wurzel').join('|') === 'gliedert:3', 'Die Wurzel gliedert die drei Bänder');

/* ── 3) Das Bild bleibt lesbar ── */
w("_vkFokus = 'standort:ALLE'; renderVerknuepfungen();");
let html = mount.innerHTML;
const knotenImBild = (html.match(/class="vk-knoten/g) || []).length;
ok(knotenImBild === 13, `Höchstens zwölf Nachbarn plus Mitte im Graph (${knotenImBild})`);
ok(/const MAX = 12/.test(vk), 'Die Grenze steht als Konstante da');
ok(/reihum aus jeder Beziehungsart/.test(vk), 'Ausgewählt wird reihum, damit keine Beziehungsart wegfällt');
const chips = (html.match(/class="vk-chip"/g) || []).length;
ok(chips >= 16, `Darunter stehen alle Nachbarn als Chips (${chips})`);
ok(/Math\.min\(Math\.max\(cx \+ Math\.cos\(w\) \* rx, b \/ 2 \+ 8\), B - b \/ 2 - 8\)/.test(vk),
  'Breite Kästen werden in der Fläche gehalten – einer ragte sonst heraus');

w("_vkFokus = 'prozess:vertrieb'; renderVerknuepfungen();");
html = mount.innerHTML;
ok(/vkFokus\('modell:m1'\)/.test(html), 'Ein Klick auf den Nachbarn rückt ihn in die Mitte');
const svgTeil = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
ok(!/Kartellrecht/.test(svgTeil), 'Das Regelwerk hängt am Modell, nicht direkt am Prozess – zwei Klicks');
ok(/<optgroup label="Prozess">/.test(html) && /<optgroup label="Regelwerk">/.test(html),
  'Die Direktauswahl listet alle Objekte nach Art – niemand muss sich durchklicken');

/* ── 4) Verlauf ── */
w("_vkFokus = ''; _vkPfad = []; vkFokus('band:kern'); vkFokus('prozess:vertrieb');");
ok(w('_vkPfad.join("|")') === 'band:kern', 'Der Weg wird gemerkt');
w('vkZurueck()');
ok(w('_vkFokus') === 'band:kern', 'Zurück führt einen Schritt zurück');
w('vkGesamt()');
ok(w('_vkFokus') === '' && w('_vkPfad.length') === 0, '„Ganze Landschaft" setzt zurück');
w("vkFokus('gibt-es-nicht')");
ok(w('_vkFokus') === '', 'Ein unbekannter Knoten ändert nichts');

/* ── 5) Die Lücken – der eigentliche Nutzen ── */
const l = ctx.vkLuecken();
ok(l.ohneModell.length === 15, `Prozesse ohne Modell (${l.ohneModell.length} von 17)`);
ok(l.modelleOhneRw.length === 1 && l.modelleOhneRw[0].title === 'Ohne Bezug', 'Modelle ohne Regelwerk');
ok(l.rwOhneProzess.length === 1 && l.rwOhneProzess[0].title === 'Reisekosten',
  'Veröffentlichte Regelwerke ohne Prozess – Entwürfe zählen nicht mit');
ok(!l.rwOhneProzess.some(p => p.status === 'Entwurf'), 'Ein Entwurf ist keine Lücke, er ist in Arbeit');
ok(l.ohneGeltung.length === 15, 'Und Prozesse ohne gepflegten Geltungsbereich');
w("_vkFokus = ''; renderVerknuepfungen();");
html = mount.innerHTML;
ok((html.match(/class="vk-luecke"/g) || []).length === 4, 'Alle vier Lücken-Kästen werden gezeigt');
ok(/Nichts offen ✓/.test(html) === false, 'Bei offenen Punkten steht kein „alles gut"');

/* ── 6) Keine zweite Wahrheit, kein Mehraufwand ── */
ok(!/spSave|spUpload/.test(vk), 'Die Ansicht speichert nichts');
ok(/_procLinkCache/.test(vk), 'Die BPMN-Verknüpfungen kommen aus dem vorhandenen Cache');
ok(/knopf\('netz', '🕸 Verknüpfungen'/.test(proz), 'Der Reiter hat den dritten Umschalter');
ok(/_prozModus === 'netz'/.test(proz), 'Und zeichnet die Ansicht');
ok(/function lkZuVerknuepfungen/.test(lies('js/landkarte.js')),
  'Aus der Landkarte führt ein Knopf direkt in die Mindmap');
ok(/<script src="js\/verknuepfungen\.js/.test(lies('index.html')), 'Das Modul ist eingebunden');
ok(/\.vk-svg \{ width: 100%/.test(css) && /\.vk-chip \{/.test(css), 'Stil für Graph und Chips vorhanden');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
