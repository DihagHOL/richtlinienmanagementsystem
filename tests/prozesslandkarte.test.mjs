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
  _processes: [{ itemId: 'p-1', title: 'Vertrieb' }, { itemId: 'p-2', title: 'Produktion' }],
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
ok(w('lkErgebnisse().join("|")') === 'Aufträge|Produkte|Einnahmen', 'Und die drei Ergebnisse rechts');
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
ok(w('lkWerk()') === 'HOL' && w('lkKacheln().length') === 17, 'Geöffnet ist zunächst HOL');
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

/* ── 3) Verknüpfung zum Modell ── */
const proc = (k) => vm.runInContext(`(lkProzessVon(${JSON.stringify(k)}) || {}).title || ''`, ctx);
ok(proc({ prozessId: 'p-1' }) === 'Vertrieb', 'Das Modell wird über die Kennung gefunden');
ok(proc({ prozessName: 'produktion' }) === 'Produktion', 'Sonst über den Namen, Groß-/Kleinschreibung egal');
ok(proc({ prozessId: 'weg', prozessName: 'Vertrieb' }) === 'Vertrieb',
  'Wurde die Datei neu angelegt, greift der Name – der Link bricht nicht');
ok(proc({}) === '', 'Ohne Angabe kein Modell');
const lkCode = lk.split(/\r?\n/).filter(z => !/^\s*(\*|\/\*|\/\/)/.test(z)).join(' ');
ok(!/policies=/.test(lkCode), 'Die Regelwerks-Verknüpfung wird hier NICHT gespeichert – sie steht im BPMN');
ok(/_parsePolicyIds\(xml\)/.test(lk), 'Gelesen wird sie aus dem BPMN-XML');
ok(/erst beim Öffnen, nicht für die ganze Karte/.test(lk),
  'Und zwar erst beim Öffnen einer Kachel – 17 Dateien beim Zeichnen wären Unsinn');

/* ── 4) Die Ansicht ── */
w("lkKachelVonId('vertrieb').prozessName = 'Vertrieb'; lkKachelVonId('produktion').prozessId = 'p-2';");
w("_lkFilter = ''; renderLandkarte();");
let html = mount.innerHTML;
ok(/class="lk-band lk-band-fuehrung"/.test(html) && /class="lk-band lk-band-unterstuetzung"/.test(html),
  'Führungs- und Unterstützungsband werden gezeichnet');
ok(/lk-kern-klammer/.test(html) && (html.match(/class="lk-pfeil["\s]/g) || []).length === 3, 'Die Kernprozesse als drei Pfeile');
ok((html.match(/lk-ergebnis-zeile/g) || []).length === 3, 'Rechts die drei Ergebnisse');
ok(/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/.test(html)
  && /grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/.test(html),
  'Jedes Band bekommt so viele Spalten wie Kacheln – eine Zeile, gleiche Breiten');
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
ok(/@media \(max-width: 780px\)[\s\S]{0,400}\.lk-kachel \{ clip-path: none/.test(css),
  'Auf schmalen Geräten fallen die Formen weg – Lesbarkeit gewinnt');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
