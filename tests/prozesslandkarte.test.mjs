/**
 * Prozesslandkarte: die Prozesslandschaft als anklickbare Ansicht.
 *
 * Geprüft wird vor allem, was die Karte mit dem Rest verbindet – denn genau
 * daran entscheidet sich, ob sie mehr ist als ein Bild:
 *   • Geltungsbereich: dasselbe Vokabular wie bei Regelwerken (STANDORTE/ALLE),
 *     damit „Welche Prozesse gelten in SHB?" dieselbe Antwort ergibt.
 *   • BPMN: die Kachel merkt sich nur, welches Modell zu ihr gehört. Die
 *     Verknüpfung Prozess → Regelwerk bleibt im BPMN-XML – eine Wahrheit.
 *   • Speicherung: eine Datei im Konfig-Ordner, keine neue Liste, keine Spalte.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const lk = lies('js/landkarte.js');
const shp = lies('js/sharepoint.js');
const adm = lies('js/admin.js');
const proz = lies('js/prozesse.js');
const css = lies('css/style.css');

/* ── Sandkasten ── */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mount = { innerHTML: '' };
const gemeldet = [];
const gespeichert = [];
const ctx = {
  console, JSON, Date, Array, Object, String, Math,
  esc, toast: (t) => gemeldet.push(t), fmtDate: (d) => String(d || '').slice(0, 10),
  canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC', 'EIS'],
  State: { user: { name: 'Anna Muster' }, policies: [] },
  document: { getElementById: (id) => (id === 'prozesse-mount' ? mount : null), querySelectorAll: () => [] },
  openModal: () => {}, closeModal: () => {},
  geltungsbereichLabel: (a) => (!a || !a.length ? '' : a.includes('ALLE') ? 'Alle Standorte' : a.join(', ')),
  prozessModusLeiste: () => '',
  _processes: [
    { itemId: 'p-1', title: 'Vertrieb', ordner: 'HOL' },
    { itemId: 'p-2', title: 'Produktion', ordner: 'HOL' },
  ],
  spLandkarteMeta: async () => ctx.__meta,
  spSaveLandkarte: async (d) => { gespeichert.push(JSON.parse(JSON.stringify(d))); ctx.__meta = 'neu-' + gespeichert.length; return ctx.__meta; },
  __meta: '',
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lk, ctx);
const w = (a) => vm.runInContext(a, ctx);
w('_lkDaten = lkStartbestand(); _lkDaten.historie = []; _lkGeladen = true;');

/* ── 1) Startbestand: die abgestimmte Landschaft ── */
ok(w('lkKacheln().length') === 17, 'Siebzehn Prozesse im Startbestand');
const jeBand = w("lkBaender().map(b => lkKacheln().filter(k => k.band === b.key).length)");
ok(jeBand.join('|') === '5|3|9', `Fünf Führungs-, drei Kern-, neun Unterstützungsprozesse (${jeBand.join('/')})`);
ok(w("lkKacheln().filter(k => k.band === 'kern').map(k => k.name).join('|')") === 'Vertrieb|Produktion|Aufträge abwickeln',
  'Die Kernprozesse in der Reihenfolge der Vorlage');
ok(!/function lkErgebnisse/.test(lk), 'Die Ergebnisspalte ist raus – auch die Funktion dahinter');
ok(w("lkKacheln().filter(k => k.id).length") === 17 && new Set(w('lkKacheln().map(k => k.id)')).size === 17,
  'Jede Kachel hat eine eigene, stabile Kennung');
w("lkKacheln()[0].name = 'verbogen';");
ok(w('lkStartbestand().karten.HOL.kacheln[0].name') === 'Strategie', 'Der Startbestand selbst bleibt unangetastet');
w("_lkDaten = lkStartbestand(); _lkDaten.historie = [];");

/* ── 1b) Jedes Werk führt seine eigene Landkarte ──
   Die abgestimmte Landschaft ist die von HOL – nicht die des Konzerns. */
ok(w("LK_START_WERK") === 'HOL', 'Der Startbestand gehört zu HOL');
ok(w("LK_WERKE[0]") === 'KONZERN' && w("LK_WERKE.includes('SHB')"),
  'Zur Auswahl stehen die Konzern-Ebene und alle Werke');
ok(w("lkWerkLabel('KONZERN')") === 'Konzern / Holding' && w("lkWerkLabel('SHB')") === 'SHB',
  'Die Konzern-Ebene heißt auch so');
ok(w('_lkWerk') === 'HOL' && w('lkKacheln().length') === 17, 'Geöffnet ist zunächst HOL');
w("lkSetWerk('SHB')");
ok(w('lkKacheln().length') === 0, 'SHB hat noch keine Karte – und leiht sich keine');
ok(w("lkBaender().length") === 3, 'Die drei Bänder gibt es trotzdem – sonst ließe sich nichts einsortieren');
ok(w('lkWerkeMitKarte().join("|")') === 'HOL', 'Belegt ist bisher nur HOL');
w("lkKarte('SHB').kacheln.push({ id: 'giesserei', band: 'kern', name: 'Gießerei', geltung: ['SHB'] });");
ok(w('lkAlleKacheln().length') === 18 && w("lkAlleKacheln().filter(x => x.werk === 'SHB').length") === 1,
  'lkAlleKacheln() sieht über die Werke hinweg – das braucht die Mindmap');
ok(w("lkAlleKacheln()[0].werk") === 'HOL', 'Und jede Kachel weiß, zu welchem Werk sie gehört');
w("lkSetWerk('HOL')");

/* Neue Kachel: Geltungsbereich auf das Werk vorbelegt */
w("lkSetWerk('SHB'); lkKachelNeu();");
ok(w('_lkEditing.geltung.join("|")') === 'SHB', 'Ein neuer Prozess in einer Werk-Karte gilt zunächst dort');
w("lkSetWerk('KONZERN'); lkKachelNeu();");
ok(w('_lkEditing.geltung.join("|")') === 'ALLE', 'Auf Konzern-Ebene konzernweit');
w("_lkEditing = null; lkSetWerk('HOL');");

/* ── 2) Geltungsbereich – dieselbe Frage wie bei Regelwerken ── */
const gilt = (g, s) => vm.runInContext(`lkGiltDort(${JSON.stringify({ geltung: g })}, ${JSON.stringify(s)})`, ctx);
ok(gilt(['HOL', 'SHB'], 'SHB') === true, 'Ein Prozess mit SHB gilt in SHB');
ok(gilt(['HOL'], 'SHB') === false, 'Einer ohne SHB nicht');
ok(gilt(['ALLE'], 'SHB') === true, '„Alle Standorte" gilt überall');
ok(gilt([], 'SHB') === true, 'Ungepflegt zählt als konzernweit – lieber zu viel zeigen als zu wenig');
ok(gilt(['HOL'], '') === true, 'Ohne Filter gilt alles');
ok(/renderGeltungsbereichSection\(k\.geltung, 'lgb'\)/.test(lk), 'Der Editor nutzt die Auswahl der Regelwerke');
ok(/if \(scope === 'lgb'\) return \{/.test(adm) && /_lkEditing/.test(adm), 'admin.js kennt den Bereich „lgb"');
ok(/if \(scope === 'lgb'\) s\.obj\.geltung = s\.obj\.geltungsbereich;/.test(adm),
  'Und spiegelt die Auswahl in das Feld der Kachel zurück');

/* ── 3) Verknüpfung zu den Modellen ──
   Ein Prozess besteht oft aus mehreren Abläufen: Angebot, Auftrag, Reklamation
   gehören alle zum Vertrieb. Die Kachel trägt deshalb eine Liste. */
const proc = (k) => vm.runInContext(`(lkProzessVon(${JSON.stringify(k)}) || {}).title || ''`, ctx);
const procs = (k) => vm.runInContext(`lkProzesseVon(${JSON.stringify(k)}).map(p => p.title)`, ctx);
ok(proc({ prozesse: [{ id: 'p-1' }] }) === 'Vertrieb', 'Das Modell wird über die Kennung gefunden');
ok(proc({ prozesse: [{ name: 'produktion' }] }) === 'Produktion', 'Sonst über den Namen, Groß-/Kleinschreibung egal');
ok(proc({ prozesse: [{ id: 'weg', name: 'Vertrieb' }] }) === 'Vertrieb',
  'Wurde die Datei neu angelegt, greift der Name – der Link bricht nicht');
ok(proc({}) === '', 'Ohne Angabe kein Modell');
ok(procs({ prozesse: [{ id: 'p-1' }, { id: 'p-2' }] }).join('|') === 'Vertrieb|Produktion',
  'Mehrere Modelle an einer Kachel');
ok(procs({ prozesse: [{ id: 'p-1' }, { id: 'gibt-es-nicht' }] }).join('|') === 'Vertrieb',
  'Ein Verweis ins Leere fällt weg, der Rest bleibt');
ok(proc({ prozessId: 'p-1' }) === 'Vertrieb', 'Der Altbestand mit EINEM Modell wird weiter gelesen');
ok(procs({ prozessName: 'Produktion' }).join('|') === 'Produktion', 'Auch über den alten Namen');

/* Direkt an der Kachel hängende Regelwerke – für Prozesse ohne Modell */
const rw = (k) => vm.runInContext(`lkRegelwerkeVon(${JSON.stringify(k)}).map(p => p.title)`, ctx);
ctx.State.policies = [{ id: '7', title: 'Kartellrecht' }, { id: '9', title: 'Datenschutz' }];
ok(rw({ regelwerke: ['7', '9'] }).join('|') === 'Kartellrecht|Datenschutz', 'Regelwerke direkt an der Kachel');
ok(rw({ regelwerke: ['7', 'weg'] }).join('|') === 'Kartellrecht', 'Gelöschte Regelwerke fallen weg');
ok(rw({}).length === 0, 'Ohne Zuordnung nichts');

/* Der Name allein ist nicht mehr eindeutig: „Vertrieb" gibt es in HOL und in SHB. */
ctx._processes.push({ itemId: 'p-shb', title: 'Vertrieb', ordner: 'SHB' });
const zu = (n, w) => vm.runInContext(`(lkModellZu({ name: ${JSON.stringify(n)} }, ${JSON.stringify(w)}) || {}).itemId`, ctx);
ok(zu('Vertrieb', 'SHB') === 'p-shb', 'Bei gleichem Namen zählt der Ordner des eigenen Werks');
ok(zu('Vertrieb', 'HOL') === 'p-1', 'Und in HOL das dortige Modell');
ok(zu('Vertrieb', 'WGC') === 'p-1', 'Kennt das Werk keins, greift der erste Treffer – besser als gar nichts');
ok(vm.runInContext("(lkModellZu({ id: 'p-shb', name: 'Vertrieb' }, 'HOL') || {}).itemId", ctx) === 'p-shb',
  'Die Kennung schlägt den Ordner – sie ist die genauere Angabe');
ctx._processes.pop();
const lkCode = lk.split(/\r?\n/).filter(z => !/^\s*(\*|\/\*|\/\/)/.test(z)).join(' ');
ok(!/policies=/.test(lkCode), 'Die Regelwerks-Verknüpfung wird hier NICHT gespeichert – sie steht im BPMN');
ok(/_parsePolicyIds\(xml\)/.test(lk), 'Gelesen wird sie aus dem BPMN-XML');

/* „Modell anlegen" schrieb das Ergebnis-OBJEKT von _bpmnFromText in die Datei.
   fetch macht daraus „[object Object]" – die .bpmn war unbrauchbar, und der
   Editor scheiterte beim Öffnen mit „missing start tag". */
ok(/const erzeugt = \(typeof _bpmnFromText === 'function'\)/.test(lk)
   && /\(erzeugt && erzeugt\.xml\)/.test(lk),
  'Aus der Landkarte wird das XML gespeichert, nicht das Ergebnis-Objekt');
ok(!/spSaveProcess\(name, _bpmnFromText/.test(lk), 'Und nirgends das Objekt direkt');
ok(/erst beim Öffnen, nicht für die ganze Karte/.test(lk),
  'Und zwar erst beim Öffnen einer Kachel – 17 Dateien beim Zeichnen wären Unsinn');

/* ── 4) Die Ansicht ── */
w("lkKachelVonId('vertrieb').prozessName = 'Vertrieb'; lkKachelVonId('produktion').prozessId = 'p-2';");
w("_lkFilter = ''; renderLandkarte();");
let html = mount.innerHTML;
ok(/Führungsprozesse/.test(html) && /Unterstützungsprozesse/.test(html),
  'Führungs- und Unterstützungsband werden gezeichnet');
ok(/lk-zeile lk-zeile-kern/.test(html) && (html.match(/class="lk-pfeil["\s]/g) || []).length === 3,
  'Die Kernprozesse behalten ihre Pfeilform');
ok((html.match(/class="lk-zeile-titel[" ]/g) || []).length === 3,
  'Je Band eine Zeile mit Titelspalte – nicht mehr drei fest verdrahtete Bänder');
/* Der Balken ist eine Schaltflaeche, sobald man schreiben darf: Ein Bereich soll
   sich dort aendern lassen, wo er steht, nicht in einem fernen Menue. */
ok((html.match(/lk-zeile-titel-klick/g) || []).length === 3
  && /onclick="lkBandDialog\('fuehrung'\)"/.test(html),
  'Mit Schreibrecht ist jeder Bereichsbalken anklickbar');
ok(!/lk-ergebnis-zeile/.test(html), 'Ohne Ergebnisspalte – die Kernprozesse stehen für sich');
ok(/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/.test(html)
  && !/grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/.test(html),
  'Höchstens fünf Kacheln nebeneinander – neun in einer Zeile wären Streifen');
ok(/lk-punkt-modell/.test(html) && /lk-punkt-offen/.test(html), 'Ein Punkt zeigt, ob ein Modell hinterlegt ist');
ok(/2<\/b> von <b>17/.test(html), 'Und oben steht, wie viele Prozesse modelliert sind');

w("_lkFilter = 'SHB'; lkKachelVonId('instandhaltung').geltung = ['HOL']; renderLandkarte();");
html = mount.innerHTML;
ok((html.match(/lk-aus/g) || []).length === 1, 'Mit Standortfilter wird ausgegraut, was dort nicht gilt');
ok(/nicht gelten, sind ausgegraut/.test(html), 'Ausgegraut statt ausgeblendet – die Landschaft bleibt vergleichbar');
w("_lkFilter = '';");

/* ── 5) Verschieben zwischen den Bändern ── */
const bandVon = (id) => vm.runInContext(`lkKachelVonId(${JSON.stringify(id)}).band`, ctx);
const indexVon = (id) => vm.runInContext(`lkKacheln().findIndex(k => k.id === ${JSON.stringify(id)})`, ctx);
w(`_lkZiehIndex = ${indexVon('qs')};`);
await ctx.lkZiehAblegen({ preventDefault() {}, stopPropagation() {} }, 'fuehrung', -1);
ok(bandVon('qs') === 'fuehrung', 'Eine Kachel in ein anderes Band gezogen wechselt das Band');
ok(w('lkKacheln().length') === 17, 'Und geht dabei nicht verloren');
const letzterEintrag = () => w('_lkDaten.historie[_lkDaten.historie.length - 1].was');
ok(/nach Führungsprozesse verschoben/.test(letzterEintrag()), 'Der Verlauf hält fest, was passiert ist');

w(`_lkZiehIndex = ${indexVon('vertrieb')};`);
await ctx.lkZiehAblegen({ preventDefault() {}, stopPropagation() {} }, '', indexVon('auftraege'));
ok(bandVon('vertrieb') === 'kern', 'Innerhalb eines Bandes bleibt das Band erhalten');
ok(/Reihenfolge in Kernprozesse geändert/.test(letzterEintrag()), 'Und der Verlauf unterscheidet die beiden Fälle');

/* ── 6) Gleichzeitigkeit ── */
gemeldet.length = 0;
ctx.__meta = 'fremd';
w("_lkGeaendertAm = 'meins';");
const erfolg = await ctx.lkSpeichern('gespeichert', 'Versuch');
ok(erfolg === false && /zwischenzeitlich/.test(gemeldet.join(' ')),
  'Hat jemand anders gespeichert, wird nichts überschrieben');
const vorher = gespeichert.length;
ctx.__meta = 'meins';
await ctx.lkSpeichern('', 'Zweiter Versuch');
ok(gespeichert.length === vorher + 1, 'Passt der Stand, wird gespeichert');

/* ── 7) Neue Kennungen ── */
const neueId = (n) => vm.runInContext(`_lkNeueId(${JSON.stringify(n)})`, ctx);
const id1 = neueId('Qualitätssicherung & Prüfung');
ok(/^[a-z0-9]+$/.test(id1) && id1.length <= 20 && id1.startsWith('qualitaetssicherung'),
  'Umlaute werden umschrieben, Sonderzeichen fallen weg, die Kennung bleibt kurz');
ok(neueId('IT') === 'it2', 'Eine belegte Kennung wird durchnummeriert');
ok(neueId('###') === 'prozess', 'Und wenn nichts übrig bleibt, gibt es einen Namen');

/* ── 7b) Übernahme: niemand baut zehn Karten von Hand ── */
w("lkSetWerk('WGC');");
ok(w('lkKacheln().length') === 0, 'WGC startet leer');
ctx.__wahl = { value: 'HOL' };
ctx.document.getElementById = (id) => (id === 'lk-quelle' ? ctx.__wahl : (id === 'prozesse-mount' ? mount : null));
await ctx.lkUebernehmen();
ok(w('lkKacheln().length') === 17, 'Die Struktur von HOL lässt sich übernehmen');
ok(w("lkKacheln().every(k => k.geltung.join() === 'WGC')"),
  'Dabei gilt sie danach für WGC – nicht weiter für HOL');
ok(w("lkKarte('HOL').kacheln.length") === 17, 'Die Quelle bleibt unverändert');
ok(/aus HOL übernommen/.test(w('_lkDaten.historie[_lkDaten.historie.length - 1].was')),
  'Und der Verlauf hält es fest');
w("lkSetWerk('HOL');");
ctx.document.getElementById = (id) => (id === 'prozesse-mount' ? mount : null);

/* ── 7c) Migration: die alte Fassung kannte nur eine Karte ── */
ctx.spLoadLandkarte = async () => ({
  daten: { baender: [{ key: 'kern', titel: 'Kernprozesse' }], kacheln: [{ id: 'a', band: 'kern', name: 'Alt' }], ergebnisse: ['X'] },
  geaendertAm: 'alt',
});
w('_lkGeladen = false; _lkDaten = null;');
await ctx.lkDatenLaden();
ok(w("lkKarte('HOL').kacheln.length") === 1 && w("lkKarte('HOL').kacheln[0].name") === 'Alt',
  'Eine Datei der alten Fassung landet als Landkarte von HOL – ohne Neuerfassung');
ok(w('_lkDaten.version') === 2, 'Und wird als Fassung 2 weitergeführt');

/* ── 7d) Zweites Modell: der Dateiname muss frei sein ──
   Gleiche Namen im selben Ordner wären dieselbe Datei – das zweite Modell
   überschriebe das erste. Über Werke hinweg stört der gleiche Name dagegen
   nicht: HOL/Vertrieb und SHB/Vertrieb sind zwei Dateien. */
const frei = (n, w) => vm.runInContext(`_lkFreierModellName(${JSON.stringify(n)}, ${JSON.stringify(w)})`, ctx);
ok(frei('Einkauf', 'HOL') === 'Einkauf', 'Ein freier Name bleibt, wie er ist');
ok(frei('Vertrieb', 'HOL') === 'Vertrieb 2', 'Im selben Werk belegt: eine Nummer dahinter');
ok(frei('Vertrieb', 'SHB') === 'Vertrieb',
  'In einem anderen Werk ist derselbe Name frei – eigener Ordner, eigene Datei');
ctx._processes.push({ itemId: 'p-3', title: 'Vertrieb 2', ordner: 'HOL' });
ok(frei('Vertrieb', 'HOL') === 'Vertrieb 3', 'Und zählt weiter');
ctx._processes.pop();

/* ── 7e) Tastatur: die Kacheln sind Schaltflächen ── */
w("_lkFilter = ''; lkSetWerk('HOL'); renderLandkarte();");
const kHtml = mount.innerHTML;
ok(/role="button" tabindex="0"/.test(kHtml), 'Kacheln sind per Tab erreichbar');
ok(/onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)/.test(kHtml),
  'Enter und Leertaste öffnen sie – wie eine Schaltfläche');
ok(/aria-label="[^"]+"/.test(kHtml) && /aria-label="Alt"/.test(kHtml), 'Und sie sind beschriftet');

/* ── 7f) Suche über alle Landkarten ──
   Bei zehn Karten ist „wo steckt die Beschaffung?" sonst eine Klickstrecke. */
w("lkKarte('SHB').kacheln.push({ id: 'giess', band: 'kern', name: 'Gießerei Schmelzbetrieb', geltung: ['SHB'] });");
const tr = (q) => vm.runInContext(`lkTreffer(${JSON.stringify(q)}).map(t => t.werk + ':' + t.kachel.name)`, ctx);
ok(tr('gieß').join('|') === 'SHB:Gießerei Schmelzbetrieb', 'Gefunden wird auch in einer Karte, die gerade nicht offen ist');
ok(tr('g').length === 0, 'Ein einzelner Buchstabe sucht noch nicht – das wäre nur Rauschen');
ok(tr('SCHMELZ').length === 1, 'Groß-/Kleinschreibung ist egal');
ok(tr('gibtesnicht').length === 0, 'Ohne Treffer nichts');
w("_lkSuche = 'gieß';");
ok(/lkSpringeZu\('SHB','giess'\)/.test(vm.runInContext('_lkTrefferHtml()', ctx)),
  'Ein Treffer führt zur richtigen Karte und öffnet die Kachel');
ok(/Kein Prozess mit/.test(vm.runInContext("_lkSuche = 'zzz'; _lkTrefferHtml()", ctx)),
  'Und sagt es, wenn es nichts gibt');
w("_lkSuche = ''; lkKarte('SHB').kacheln.pop();");

/* ── 8) Speicherung: eine Datei, keine Liste ── */
ok(/const LANDKARTE_DATEI = 'prozesslandkarte\.json'/.test(shp), 'Die Karte liegt als eine Datei im Konfig-Ordner');
ok(/function spLoadLandkarte/.test(shp) && /function spSaveLandkarte/.test(shp) && /function spLandkarteMeta/.test(shp),
  'Laden, Speichern und Zeitstempel – wie bei der Governance-Struktur');
ok(!/Landkarte/.test(shp.slice(shp.indexOf('const POLICY_COLUMNS'), shp.indexOf('const POLICY_EXT_FIELDS'))),
  'Keine neue SharePoint-Spalte');

/* ── 9) Einbau in den Reiter ── */
ok(/function prozessModusLeiste/.test(proz) && /setProzessModus/.test(proz), 'Der Prozesse-Reiter hat einen Umschalter');
ok(/🗺 Landkarte/.test(proz) && /📋 Modelle/.test(proz), 'Landkarte und Modell-Liste');
ok(/_prozModus = 'karte'/.test(proz), 'Die Landkarte ist die Startansicht – sie ist der Einstieg, nicht die Dateiliste');
ok(/renderProzesseAktuell\(\)/.test(proz), 'Nach dem Laden wird die gewählte Ansicht gezeichnet');
ok(/<script src="js\/landkarte\.js/.test(lies('index.html')), 'Das Modul ist eingebunden');
ok(/\.lk-reihe \{ display: grid/.test(css), 'Die Bänder sind ein Raster – Flexbox blies die letzte Zeile auf');
ok(/hyphens: auto/.test(css), 'Lange Komposita werden getrennt statt überzulaufen');
ok(/@media \(max-width: 780px\)[\s\S]{0,400}\.lk-pfeil \{ clip-path: none/.test(css),
  'Auf schmalen Geräten fallen die Formen weg – Lesbarkeit gewinnt');

/* ── 7d2) Übernahme einer fremden Landkarte ──
   Die Modelle des Quellwerks liegen in dessen Ordner. Sie mitzunehmen hieße,
   dass zwei Werke auf dieselbe Datei zeigen – deshalb nur auf ausdrücklichen
   Wunsch. */
w("_lkDaten = lkStartbestand(); _lkDaten.historie = []; _lkGeladen = true;");
w("lkSetWerk('WGC'); _lkDaten.karten.WGC = { baender: [], ergebnisse: [], kacheln: [] };");
ctx.__hakenAn = false;
ctx.document.getElementById = (id) => (id === 'lk-quelle' ? { value: 'HOL' }
  : id === 'lk-uebernahme-modelle' ? { checked: ctx.__hakenAn }
  : id === 'prozesse-mount' ? mount : null);
await vm.runInContext('lkUebernehmen()', ctx);
ok(w("lkKarte('WGC').kacheln.length") === 17, 'Die Struktur wird übernommen');
ok(w("lkKarte('WGC').kacheln.every(k => !k.prozesse.length)"),
  'Ohne Haken kommen die Modelle NICHT mit – jedes Werk modelliert seine Abläufe selbst');
ok(w("lkKarte('HOL').kacheln.length") === 17, 'Die Quelle bleibt unberührt');
ctx.__hakenAn = true;
w("lkKarte('HOL').kacheln.find(k => k.id === 'vertrieb').prozesse = [{ id: 'p-1', name: 'Vertrieb' }];");
await vm.runInContext('lkUebernehmen()', ctx);
ok(w("lkKarte('WGC').kacheln.find(k => k.id === 'vertrieb').prozesse.length") === 1,
  'Mit Haken kommen sie mit – für Werke, die wirklich dasselbe Modell nutzen');
ctx.document.getElementById = (id) => (id === 'prozesse-mount' ? mount : null);
w("lkSetWerk('HOL');");

/* Der Reiter trägt vier Ansichten – Landkarte, Verknüpfungen, Matrix, Modelle.
   „Prozesse (BPMN)" nannte davon eine. */
ok(/label: 'Prozesse & Landkarte'/.test(fs.readFileSync(path.join(ROOT, 'js/access.js'), 'utf8')),
  'Der Reiter heißt „Prozesse & Landkarte"');
ok(/prozesse: 'Prozesse & Landkarte'/.test(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8')),
  'Der Seitentitel ebenso');

/* ── 10) Vorlagen: der Konzern ist kein Werk in klein ──
   Eine Führungsholding steuert, finanziert, sichert ab, bündelt, kommuniziert
   und verändert – sie produziert nicht. Deshalb eine eigene Landschaft. */
ok(w('LK_VORLAGEN.length') === 9, 'Neun Vorlagen zur Auswahl');
ok(w("LK_VORLAGEN.map(v => v.key).join('|')") === 'konzern|gesellschaft|konzernkarte|holding|konzern-gesamt|sap|wgc|zai|sch',
  'Neue Vorlagen kommen hinten dazu – wer die Reihenfolge kennt, findet die alten wieder');
ok(w('LK_VORLAGEN.every(v => v.key && v.titel && v.zweck && v.karte)'),
  'Jede Vorlage nennt Kennung, Titel, Zweck und Karte');
ok(w("LK_VORLAGEN.every(v => v.karte.baender.length && v.karte.kacheln.length)"),
  'Und keine ist leer');
ok(w("LK_VORLAGEN.every(v => v.karte.kacheln.every(k => v.karte.baender.some(b => b.key === k.band)))"),
  'Jede Kachel hängt an einem Band, das es gibt – sonst fiele sie aus der Karte');
ok(w("LK_VORLAGEN.every(v => new Set(v.karte.kacheln.map(k => k.id)).size === v.karte.kacheln.length)"),
  'Kennungen sind je Karte eindeutig');
ok(w("LK_VORLAGEN.every(v => v.karte.baender.every(b => v.karte.kacheln.some(k => k.band === b.key)))"),
  'Kein Band ohne Kacheln – eine leere Zeile erklärt nichts');

/* Die Holding-Skizze der Geschäftsführung: acht Kästen, jeder wird ein Band */
ok(w('LK_HOLDING.baender.length') === 8, 'Holding: acht Bereiche wie in der Skizze');
ok(w("LK_HOLDING.baender.map(b => b.titel).join('|').includes('Tochterunternehmen')"),
  'Das operative Geschäft der Töchter steht mit drin – dort endet die Holding nicht, dort wirkt sie');
ok(w("LK_HOLDING.kacheln.some(k => k.name === 'Exportkontrolle') && LK_HOLDING.kacheln.some(k => k.name === 'Treasury')"),
  'Die Punkte der Skizze sind die Kacheln');

/* Die abgestimmte Konzern-Prozesslandkarte */
ok(w('LK_KONZERNKARTE.baender.length') === 3, 'Konzernkarte: Führung, Kern, Unterstützung');
ok(w('LK_KONZERNKARTE.kacheln.length') === 21, 'Einundzwanzig Prozessgruppen');
ok(w("LK_KONZERNKARTE.baender.every(b => LK_KONZERNKARTE.kacheln.filter(k => k.band === b.key).length === 7)"),
  'Sieben je Band – genau wie in der Vorlage');
ok(w("LK_KONZERNKARTE.kacheln.some(k => k.unter.includes('Schmelzen & Gießen'))"),
  'Die Teilprozesse hängen an der Kachel, nicht in einer zweiten Ebene');
ok(w("LK_KONZERNKARTE.kacheln.some(k => k.name === 'Corporate Governance, Risk & Compliance')"),
  'Auch die Führungsprozesse stehen so drin, wie sie abgestimmt wurden');

/* Das Gesamtbild aus allen dreien */
ok(w('LK_KONZERN_GESAMT.baender.length') === 5, 'Gesamtbild: fünf Bänder');
ok(w("LK_KONZERN_GESAMT.baender.map(b => b.key).includes('umsetzen')"),
  'Mit der Schnittstelle zu den Gesellschaften als eigenem Band');
ok(w("LK_KONZERN_GESAMT.baender.find(b => b.key === 'kapital').titel.includes('Kernprozesse')"),
  'Die Kernprozesse einer Holding sind Kapital und Beteiligungen, nicht Gießen');
ok(w("LK_KONZERN_GESAMT.kacheln.every(k => k.unter && k.unter.length > 8)"),
  'Jede Kachel erklärt sich – die Vorlage soll ohne Rückfrage verständlich sein');
ok(w("LK_KONZERN_GESAMT.kacheln.some(k => k.name === 'Konzernregelwerk')"),
  'Das Regelwerk selbst ist ein Konzernprozess – dafür gibt es dieses System');
ok(w("LK_KONZERN.baender.length") === 6, 'Die Konzernebene hat sechs Prozessbereiche');
ok(w("LK_KONZERN.baender.map(b => b.titel).join('|')") === 'Strategie|Finanzen|Risiko & Compliance|Synergien|Kommunikation|Transformation',
  'Genau die sechs aus der Prioritätenliste');
ok(w('LK_KONZERN.kacheln.length') === 18, 'Achtzehn Hauptaufgaben');
ok(w("LK_KONZERN.baender.every(b => LK_KONZERN.kacheln.filter(k => k.band === b.key).length === 3)"),
  'Je Bereich drei – keine leere Zeile, keine Sammelzeile');
ok(w("new Set(LK_KONZERN.kacheln.map(k => k.id)).size") === 18, 'Jede Kachel hat eine eigene Kennung');
ok(w("LK_KONZERN.kacheln.every(k => k.unter && k.unter.length > 8)"),
  'Und einen erklärenden Untertitel – „Treasury" allein sagt nicht jedem etwas');
ok(w("LK_KONZERN.kacheln.some(k => k.name === 'Kapitalallokation') && LK_KONZERN.kacheln.some(k => k.name === 'Investor Relations')"),
  'Die Aufgaben stehen so drin, wie sie abgestimmt wurden');

/* Einsetzen: ersetzt die Landschaft, setzt den Geltungsbereich, lässt nichts hängen */
w("_lkDaten = lkStartbestand(); _lkDaten.historie = []; lkSetWerk('KONZERN');");
ctx.document.getElementById = (id) => (id === 'prozesse-mount' ? mount : null);
ctx.document.querySelector = (sel) => (sel === 'input[name=\"lk-vorlage\"]:checked' ? { value: 'konzern' } : null);
await vm.runInContext('lkVorlageAnwenden()', ctx);
ok(w("lkKarte('KONZERN').kacheln.length") === 18, 'Die Vorlage landet in der Karte der gewählten Ebene');
ok(w("lkBaenderVon('KONZERN').length") === 6, 'Samt ihrer sechs Bereiche');
ok(w("lkKarte('KONZERN').kacheln.every(k => k.geltung.join(',') === 'ALLE')"),
  'Konzernprozesse gelten konzernweit – nicht nur an einem Standort');
ok(w("lkKarte('KONZERN').kacheln.every(k => !k.prozesse.length && !k.regelwerke.length)"),
  'Ohne Modelle und Regelwerke – eine Vorlage bringt Struktur, keine erfundenen Verknüpfungen');
ok(w("lkKarte('HOL').kacheln.length") === 17, 'Die Landkarte der anderen Ebene bleibt unberührt');
ok(w("LK_KONZERN.kacheln[0].geltung") === undefined || w("!LK_KONZERN.kacheln[0].prozesse"),
  'Die Vorlage selbst wird nicht verbogen – sie wird kopiert');
ctx.document.querySelector = () => null;

/* ── 11) Beliebig viele Bänder in der Ansicht ──
   Vorher standen drei Bänder fest im Renderer; die Konzernebene hat sechs. */
w("renderLandkarte();");
const kHtml6 = mount.innerHTML;
ok((kHtml6.match(/class="lk-zeile-titel[" ]/g) || []).length === 6,
  'Sechs Bereiche werden gezeichnet – nicht mehr drei feste Bänder');
ok(/Risiko & Compliance|Risiko &amp; Compliance/.test(kHtml6), 'Auch Bänder, die es im Startbestand nie gab');
ok(!/Ergebnisse/.test(kHtml6), 'Und keine Ergebniszeile mehr');
ok(!/lk-zeile-kern/.test(kHtml6), 'Ohne Kernprozesse keine Pfeilzeile');
ok(w("LK_FARBEN.length") >= 6 && w("LK_FARBEN[0]") === '#17509E',
  'Jeder Bereich bekommt seine Farbe nach seiner Position');
w("lkSetWerk('HOL'); _lkDaten = lkStartbestand(); _lkDaten.historie = [];");

/* ── Jede Vorlage muss sich auch zeichnen lassen ──
   Eine Vorlage, die nur als Datenstruktur stimmt, hilft niemandem: Sie wird
   eingesetzt und im selben Moment gezeichnet. Acht Bänder und lange
   Teilprozess-Listen sind der Belastungstest dafür. */
for (const v of w('LK_VORLAGEN')) {
  let fehler = '';
  try {
    w(`lkKarte('HOL').baender = JSON.parse(JSON.stringify(LK_VORLAGEN.find(x => x.key === '${v.key}').karte.baender));
       lkKarte('HOL').kacheln = JSON.parse(JSON.stringify(LK_VORLAGEN.find(x => x.key === '${v.key}').karte.kacheln));
       _lkFilter = ''; renderLandkarte();`);
  } catch (e) { fehler = e.message; }
  const bild = mount.innerHTML;
  ok(!fehler, `[${v.key}] zeichnet ohne Fehler${fehler ? ': ' + fehler : ''}`);
  // Im Bild steht HTML: aus "&" wird "&amp;".
  const wieImBild = (t) => String(t).split('&').join('&amp;');
  const fehlend = v.karte.baender.filter(b => !bild.includes(wieImBild(b.titel.split(' (')[0])));
  ok(fehlend.length === 0, `[${v.key}] jedes Band steht im Bild${fehlend.length ? ' – fehlt: ' + fehlend.map(b => b.titel).join(', ') : ''}`);
  ok(bild.includes(wieImBild(v.karte.kacheln[0].name)), `[${v.key}] und die Kacheln ebenso`);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
