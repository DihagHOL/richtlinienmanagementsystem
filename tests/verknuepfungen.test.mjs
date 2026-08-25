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
    { itemId: 'm1', title: 'Vertrieb – Angebot', modified: 'x' },
    { itemId: 'm2', title: 'Produktion', modified: 'x' },
    { itemId: 'm3', title: 'Vertrieb – Reklamation', modified: 'x' },
    { itemId: 'm4', title: 'Ohne Bezug', modified: 'x' },
  ],
  _procLinkCache: { 'm1|x': ['2'], 'm2|x': ['1'], 'm3|x': [], 'm4|x': [] },
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
   Object.assign(lkKachelVonId('vertrieb'),   { prozesse: [{ id: 'm1' }, { id: 'm3' }], geltung: ['ALLE'] });
   Object.assign(lkKachelVonId('produktion'), { prozesse: [{ id: 'm2' }], geltung: ['HOL','SHB'] });
   Object.assign(lkKachelVonId('qs'),         { geltung: [] });
   // Ein Prozess ohne Modell, aber mit direkt zugeordnetem Regelwerk
   Object.assign(lkKachelVonId('personal'),   { regelwerke: ['3'], geltung: ['ALLE'] });
   // SHB führt eine eigene Landkarte – die Mindmap muss beide sehen.
   lkKarte('SHB').kacheln.push({ id: 'giesserei', band: 'kern', name: 'Gießerei', geltung: ['SHB'] });`);

const graph = await ctx.vkGraphBauen();
ctx.__g = graph; w('_vkGraph = __g;');

/* ── 1) Der Graph ── */
const arten = [...graph.knoten.values()].reduce((a, n) => (a[n.art] = (a[n.art] || 0) + 1, a), {});
ok(arten.wurzel === 1 && arten.prozess === 18,
  'Die Mindmap sieht die Prozesse ALLER Werke – 17 aus HOL und einen aus SHB');
ok(arten.band === 4, 'Bänder gehören zu ihrer Karte: drei für HOL, eines für SHB');
ok(arten.modell === 3, 'Nur verknüpfte Modelle sind Knoten – „Ohne Bezug" hängt an keiner Kachel');
ok(arten.regelwerk === 3, 'Regelwerke aus den Modellen UND die direkt zugeordneten');
ok(arten.werk === 3, 'Werk und Standort sind ein Knoten: HOL, SHB und „Alle Standorte"');
ok(graph.kanten.filter(k => k.typ === 'Landkarte von').length === 2,
  'Unter dem Konzern hängen die beiden Werke mit eigener Landkarte');
const typen = [...new Set(graph.kanten.map(k => k.typ))].sort();
ok(typen.join('|') === 'Landkarte von|enthält|geregelt durch|gilt für|gliedert|modelliert in|setzt um',
  `Sieben Beziehungsarten (${typen.join(', ')})`);
ok(graph.kanten.some(k => k.von === 'prozess:HOL:vertrieb' && k.nach === 'modell:m1' && k.typ === 'modelliert in'),
  'Kachel → Modell, die Kennung trägt das Werk');
ok(graph.kanten.filter(k => k.von === 'prozess:HOL:vertrieb' && k.typ === 'modelliert in').length === 2,
  'Mehrere Modelle an einem Prozess – Angebot und Auftrag gehören beide zum Vertrieb');
ok(graph.kanten.some(k => k.von === 'prozess:HOL:personal' && k.nach === 'regelwerk:3' && k.typ === 'geregelt durch'),
  'Ein Regelwerk hängt auch direkt an der Kachel – ohne Umweg über ein Modell');
ok(graph.knoten.has('prozess:SHB:giesserei'), 'Auch der Prozess aus SHB ist da');
ok(graph.kanten.some(k => k.von === 'modell:m1' && k.nach === 'regelwerk:2' && k.typ === 'setzt um'),
  'Modell → Regelwerk, gelesen aus dem BPMN-Marker');
ok(graph.kanten.some(k => k.von === 'regelwerk:2' && k.nach === 'werk:HOL'),
  'Regelwerk → Werk, aus seinem eigenen Geltungsbereich');
ok(graph.kanten.some(k => k.von === 'prozess:HOL:qs' && k.nach === 'werk:ALLE'),
  'Ein Prozess ohne gepflegten Geltungsbereich zählt als konzernweit');

/* ── 2) Nachbarn und Gegenrichtung ── */
const nb = (id) => vm.runInContext(`vkNachbarn(${JSON.stringify(id)}).map(g => g.typ + ':' + g.liste.length).sort()`, ctx);
ok(nb('modell:m1').join('|') === 'modelliert:1|setzt um:1',
  'Beim Modell heißt die Gegenrichtung „modelliert", nicht „modelliert in"');
ok(nb('regelwerk:2').join('|') === 'gilt für:2|umgesetzt in:1', 'Beim Regelwerk „umgesetzt in"');
ok(nb('wurzel').join('|') === 'Landkarte von:2', 'Unter dem Konzern stehen die Werke, nicht die Bänder');
ok(nb('werk:SHB').some(g => g.startsWith('gliedert')), 'Ein Werk gliedert seine eigenen Bänder');

/* ── 3) Das Bild bleibt lesbar ── */
w("_vkFokus = 'werk:ALLE'; renderVerknuepfungen();");
let html = mount.innerHTML;
const knotenImBild = (html.match(/class="vk-knoten/g) || []).length;
ok(knotenImBild === 13, `Höchstens zwölf Nachbarn plus Mitte im Graph (${knotenImBild})`);
ok(/const MAX = 12/.test(vk), 'Die Grenze steht als Konstante da');
ok(/reihum aus jeder Beziehungsart/.test(vk), 'Ausgewählt wird reihum, damit keine Beziehungsart wegfällt');
const chips = (html.match(/class="vk-chip"/g) || []).length;
ok(chips >= 16, `Darunter stehen alle Nachbarn als Chips (${chips})`);
ok(/Math\.min\(Math\.max\(cx \+ Math\.cos\(w\) \* rx, b \/ 2 \+ 8\), B - b \/ 2 - 8\)/.test(vk),
  'Breite Kästen werden in der Fläche gehalten – einer ragte sonst heraus');

w("_vkFokus = 'prozess:HOL:vertrieb'; renderVerknuepfungen();");
html = mount.innerHTML;
ok(/vkFokus\('modell:m1'\)/.test(html) && /vkFokus\('modell:m3'\)/.test(html),
  'Ein Klick auf den Nachbarn rückt ihn in die Mitte – beide Modelle stehen da');
ok(/2 Modelle – über die Kachel zu öffnen/.test(html),
  'Bei mehreren Abläufen wäre „das Modell" mehrdeutig – dann führt der Weg über die Kachel');
const svgTeil = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
ok(!/Kartellrecht/.test(svgTeil), 'Das Regelwerk hängt am Modell, nicht direkt am Prozess – zwei Klicks');
ok(/<optgroup label="Prozess">/.test(html) && /<optgroup label="Regelwerk">/.test(html),
  'Die Direktauswahl listet alle Objekte nach Art – niemand muss sich durchklicken');

/* ── 4) Verlauf ── */
w("_vkFokus = ''; _vkPfad = []; vkFokus('band:HOL:kern'); vkFokus('prozess:HOL:vertrieb');");
ok(w('_vkPfad.join("|")') === 'band:HOL:kern', 'Der Weg wird gemerkt');
w('vkZurueck()');
ok(w('_vkFokus') === 'band:HOL:kern', 'Zurück führt einen Schritt zurück');
w('vkGesamt()');
ok(w('_vkFokus') === '' && w('_vkPfad.length') === 0, '„Ganze Landschaft" setzt zurück');
w("vkFokus('gibt-es-nicht')");
ok(w('_vkFokus') === '', 'Ein unbekannter Knoten ändert nichts');

/* ── 5) Die Lücken – der eigentliche Nutzen ── */
const l = ctx.vkLuecken();
ok(l.ohneModell.length === 16 && !l.ohneModell.some(k => k.id === 'vertrieb'),
  `Prozesse ohne Modell über alle Werke (${l.ohneModell.length} von 18)`);
ok(l.ohneModell.some(k => k.werk === 'SHB'), 'Auch die aus anderen Werken – sonst bliebe deren Lücke blind');
ok(l.ohneModell.every(k => k.werk), 'Jeder Eintrag nennt sein Werk');
ok(l.modelleOhneRw.map(m => m.title).sort().join('|') === 'Ohne Bezug|Vertrieb – Reklamation',
  'Modelle ohne Regelwerk – auch das zweite Modell eines Prozesses zählt einzeln');
ok(l.rwOhneProzess.length === 1 && l.rwOhneProzess[0].title === 'Reisekosten',
  'Veröffentlichte Regelwerke ohne Prozess – Entwürfe zählen nicht mit');
ok(!l.rwOhneProzess.some(p => p.status === 'Entwurf'), 'Ein Entwurf ist keine Lücke, er ist in Arbeit');
ok(l.ohneGeltung.length === 14 && l.ohneGeltung.every(k => !(k.geltung || []).length),
  'Und Prozesse ohne gepflegten Geltungsbereich');
w("_vkFokus = ''; renderVerknuepfungen();");
html = mount.innerHTML;
ok((html.match(/class="vk-luecke"/g) || []).length === 6, 'Alle sechs Lücken-Kästen werden gezeigt');
ok(l.ohneVerantwortlich.length === 18,
  `Prozesse ohne Verantwortlichen werden aufgeführt – die erste Frage jedes Audits (${l.ohneVerantwortlich.length})`);
ok(l.ohneVerantwortlich.every(k => !k.verantwortlich), 'Und zwar genau die ohne gepflegte Person');
ok(!l.ohneBezug.some(k => k.id === 'personal'),
  'Ein Prozess mit direkt zugeordnetem Regelwerk gilt nicht als bezuglos – auch ohne Modell');
ok(l.ohneBezug.some(k => k.id === 'strategie'), 'Einer ganz ohne Bezug schon');
ok(l.ohneModell.some(k => k.id === 'personal'), 'Beim Modell fehlt er weiterhin');
ok(/Nichts offen ✓/.test(html) === false, 'Bei offenen Punkten steht kein „alles gut"');

/* ── Abgleich: Kachel sagt etwas anderes als das Modell ──
   Beide Orte sind gewollt – ohne Modell gäbe es sonst gar keinen. Aber wenn
   sie auseinanderlaufen, muss man es sehen. */
ok(Array.isArray(l.abweichungen) && !l.abweichungen.length,
  'Ohne Widerspruch meldet der Abgleich nichts');
w("lkKachelVonId('vertrieb').regelwerke = ['1'];");   // m1 setzt „2" um, „1" steht nur an der Kachel
const l2 = ctx.vkLuecken();
ok(l2.abweichungen.length === 1 && l2.abweichungen[0].kachel.id === 'vertrieb',
  'Ein Regelwerk, das nur an der Kachel hängt, taucht im Abgleich auf');
ok(l2.abweichungen[0].fehlend.join(',') === '1', 'Und zwar genau das fehlende');
ok(l2.abweichungen[0].modelle.length === 2, 'Mit allen Modellen, in die es geschrieben werden könnte');
ok(!l2.abweichungen.some(a => a.kachel.id === 'personal'),
  'Eine Kachel ohne Modell erzeugt keinen Widerspruch – da gibt es nichts abzugleichen');
w("_vkFokus = ''; renderVerknuepfungen();");
ok(/An der Kachel, aber nicht im Modell/.test(mount.innerHTML), 'Der Abgleich bekommt einen eigenen Kasten');
ok(/vkAbgleichUebernehmen\('HOL','vertrieb','m1'\)/.test(mount.innerHTML),
  'Mit einem Knopf je Modell, in das die Zuordnung geschrieben werden kann');
w("delete lkKachelVonId('vertrieb').regelwerke;");

/* ── 6) Keine zweite Wahrheit, kein Mehraufwand ── */
/* Die Ansicht legt keine eigenen Daten an – sie schreibt ausschließlich dorthin,
   wo die Verknüpfung ohnehin steht: in die BPMN-Datei. */
ok(!/spSaveLandkarte/.test(vk), 'Die Mindmap speichert keine eigene Kopie der Landkarte');
ok(/spSaveProcess\(/.test(vk), 'Zugeordnete Regelwerke landen in der BPMN-Datei – dort gehören sie hin');
ok(/_procLinkCache/.test(vk), 'Die BPMN-Verknüpfungen kommen aus dem vorhandenen Cache');
ok(/knopf\('netz', '🕸 Verknüpfungen'/.test(proz), 'Der Reiter hat den dritten Umschalter');
ok(/_prozModus === 'netz'/.test(proz), 'Und zeichnet die Ansicht');
ok(/function lkZuVerknuepfungen/.test(lies('js/landkarte.js')),
  'Aus der Landkarte führt ein Knopf direkt in die Mindmap');
ok(/<script src="js\/verknuepfungen\.js/.test(lies('index.html')), 'Das Modul ist eingebunden');
ok(/\.vk-svg \{ width: 100%/.test(css) && /\.vk-chip \{/.test(css), 'Stil für Graph und Chips vorhanden');

/* ── 7) Regelwerke einem Modell zuordnen, ohne den Modeler zu öffnen ──
   Der Marker steht in der Dokumentation des Prozesses – dieselbe Stelle, die
   der BPMN-Editor beschreibt. Hier wird sie im Text gesetzt, deshalb muss der
   Fall wirklich durchgespielt werden: mit und ohne vorhandene Dokumentation,
   mit unterschiedlichen Namensraum-Präfixen, und wieder auslesbar. */
ctx._xmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const marker = /\[\[rms:policies=([^\]]*)\]\]/;
const liesIds = (x) => { const m = String(x).match(marker); return m ? m[1].split(',').filter(Boolean) : []; };
const setz = (x, ids) => vm.runInContext(
  `vkXmlMitRegelwerken(${JSON.stringify(x)}, ${JSON.stringify(ids)})`, ctx);

const ohneDoku = '<?xml version="1.0"?><bpmn:definitions><bpmn:process id="P" isExecutable="false">'
  + '<bpmn:startEvent id="S"/></bpmn:process></bpmn:definitions>';
let x1 = setz(ohneDoku, ['1', '2']);
ok(liesIds(x1).join(',') === '1,2', 'Ohne Dokumentation wird eine angelegt');
ok(/<bpmn:documentation>[\s\S]*<\/bpmn:documentation>\s*<bpmn:startEvent/.test(x1),
  'Und zwar als erstes Kind des Prozesses – so verlangt es das Schema');
ok(/Informationssicherheitsleitlinie; Kartellrecht/.test(x1),
  'Mit den Titeln im Klartext, damit die Datei auch außerhalb des RMS lesbar ist');

let x2 = setz(x1, ['3']);
ok(liesIds(x2).join(',') === '3', 'Eine vorhandene Zuordnung wird ersetzt, nicht ergänzt');
ok((x2.match(/<bpmn:documentation>/g) || []).length === 1, 'Und es bleibt bei EINER Dokumentation');

let x3 = setz(x2, []);
ok(!marker.test(x3) && !/<bpmn:documentation>/.test(x3), 'Ohne Auswahl verschwindet sie wieder');
ok(/<bpmn:startEvent/.test(x3), 'Der Rest des Diagramms bleibt unangetastet');

const mitPraefix2 = '<bpmn2:definitions><bpmn2:process id="P"><bpmn2:task id="T"/></bpmn2:process></bpmn2:definitions>';
ok(/<bpmn2:documentation>/.test(setz(mitPraefix2, ['1'])), 'Auch mit dem Präfix bpmn2 (Camunda-Export)');
const ohnePraefix = '<definitions><process id="P"><task id="T"/></process></definitions>';
ok(/<documentation>/.test(setz(ohnePraefix, ['1'])), 'Und ganz ohne Präfix');

ok(setz('<kein-prozess/>', ['1']) === '<kein-prozess/>', 'Was kein Prozess ist, wird nicht angefasst');
const mitTaskDoku = '<bpmn:definitions><bpmn:process id="P"><bpmn:task id="T">'
  + '<bpmn:documentation>Hinweis zur Aufgabe</bpmn:documentation></bpmn:task></bpmn:process></bpmn:definitions>';
const x4 = setz(mitTaskDoku, ['1']);
ok(/Hinweis zur Aufgabe/.test(x4), 'Eine Dokumentation an einer Aufgabe bleibt erhalten');
ok((x4.match(/<bpmn:documentation>/g) || []).length === 2, 'Die des Prozesses kommt daneben');

ctx.State.policies.push({ id: '9', title: 'Regeln für <Test> & Co', version: '1', status: 'Veröffentlicht', geltungsbereich: ['ALLE'], typ: 'Regelwerk' });
const x5 = setz(ohneDoku, ['9']);
ok(/&lt;Test&gt; &amp; Co/.test(x5) && !/<Test>/.test(x5), 'Sonderzeichen im Titel werden maskiert – sonst bricht die Datei');
ok(liesIds(x5).join(',') === '9', 'Und der Marker bleibt trotzdem lesbar');

ok(/async function vkRegelwerkeSpeichern/.test(vk) && /spSaveProcess\(n\.modellName \|\| n\.label/.test(vk),
  'Gespeichert wird unter demselben Dateinamen – eine neue Version derselben Datei');
ok(/function vkRegelwerkAnModell\b/.test(vk), 'Auch vom Regelwerk aus lässt sich verknüpfen');
ok(/vorhanden\.includes\(String\(policyId\)\) \? vorhanden : vorhanden\.concat/.test(vk),
  'Dabei wird ergänzt, nicht überschrieben – am Modell hängen oft mehrere Regelwerke');
ok(/function _vkAktionenHtml/.test(vk) && /Regelwerke zuordnen/.test(vk),
  'Die Aktionen stehen unter dem Graphen, je nach Art des Knotens in der Mitte');
ok(/function vkZurKarte/.test(vk) && /lkSetWerk\(werk\)/.test(vk),
  'Und der Sprung in die Landkarte trifft das richtige Werk');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
