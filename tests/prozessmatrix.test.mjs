/**
 * Zuständigkeits- und Abdeckungsmatrix.
 *
 * Die Frage, die in jedem Audit zuerst kommt, war bis hierhin unbeantwortet:
 * **wer verantwortet welchen Prozess – und in welchem Werk?** Die Matrix stellt
 * Prozesse als Zeilen und Werke als Spalten gegenüber.
 *
 * Worauf es dabei ankommt:
 *   • Zwei Werke, die denselben Prozess führen, gehören in EINE Zeile – auch
 *     wenn ihre Kacheln unterschiedliche Kennungen haben.
 *   • „niemand zuständig" und „führt diesen Prozess gar nicht" sind zwei
 *     verschiedene Aussagen und dürfen nicht gleich aussehen.
 *   • Die Matrix speichert nichts – sie liest nur die Landkarten.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const mount = { innerHTML: '' };
const gemeldet = [];
const dateien = [];        // heruntergeladene Dateien: { name, inhalt }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let letzterBlob = '';
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, encodeURIComponent, setTimeout,
  esc, toast: (t) => gemeldet.push(String(t)), fmtDate: (d) => String(d || '').slice(0, 10),
  canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC', 'EIS'],
  State: { user: { name: 'Anna Muster' }, policies: [{ id: '1', title: 'Kartellrecht' }] },
  emptyState: (t) => `<div class="empty">${t}</div>`,
  prozessModusLeiste: (a) => `<div class="modus">${a}</div>`,
  openModal: () => {}, closeModal: () => {},
  geltungsbereichLabel: (a) => (!a || !a.length ? '' : a.join(', ')),
  spLoadLandkarte: async () => null, spLandkarteMeta: async () => '',
  Blob: class { constructor(teile) { letzterBlob = teile.join(''); } },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  document: {
    getElementById: (id) => (id === 'prozesse-mount' ? mount : null),
    querySelectorAll: () => [],
    createElement: () => ({ set href(v) {}, set download(v) { this._n = v; }, click() { dateien.push({ name: this._n, inhalt: letzterBlob }); }, remove() {} }),
    body: { appendChild: () => {} },
  },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
vm.runInContext(lies('js/prozessmatrix.js'), ctx);
const w = (code) => vm.runInContext(code, ctx);

/* Zwei Werke: HOL mit dem Startbestand, SHB mit einem Teil davon plus einem
   eigenen Prozess. Ein Prozessname kommt in beiden vor. */
w(`_lkDaten = lkStartbestand(); _lkDaten.historie = []; _lkGeladen = true;
   Object.assign(lkKachelVonId('vertrieb'),   { verantwortlich: 'a.mueller@dihag.com', prozesse: [{ id: 'm1' }] });
   Object.assign(lkKachelVonId('produktion'), { verantwortlich: 'b.schmitz@dihag.com', regelwerke: ['1'] });
   _lkDaten.karten.SHB = { baender: lkKarte('HOL').baender, ergebnisse: [], kacheln: [
     { id: 'vertrieb-shb', band: 'kern', name: 'Vertrieb', geltung: ['SHB'], verantwortlich: 'c.klein@dihag.com', prozesse: [] },
     { id: 'giesserei',    band: 'kern', name: 'Gießerei',  geltung: ['SHB'], prozesse: [] },
   ] };
   _processes = [{ itemId: 'm1', title: 'Vertrieb', ordner: 'HOL' }];
   _lkMembers = [{ upn: 'a.mueller@dihag.com', name: 'Anna Müller' }];`);

/* ── 1) Zeilen: ein Prozess, eine Zeile – über alle Werke ── */
const zeilen = w('pmZeilen()');
ok(w('pmWerke().join("|")') === 'HOL|SHB', 'Spalten sind die Werke mit eigener Landkarte');
const vertrieb = zeilen.find(z => z.name === 'Vertrieb');
ok(!!vertrieb && Object.keys(vertrieb.werke).sort().join('|') === 'HOL|SHB',
  'Derselbe Prozessname in zwei Werken ergibt EINE Zeile – trotz verschiedener Kennungen');
ok(zeilen.filter(z => z.name === 'Vertrieb').length === 1, 'Und nicht zwei');
ok(zeilen.some(z => z.name === 'Gießerei' && !z.werke.HOL),
  'Ein Prozess, den nur ein Werk führt, steht trotzdem in der Matrix');
ok(w("_pmSchluessel('  Vertrieb  ') === _pmSchluessel('vertrieb')"),
  'Verglichen wird ohne Groß-/Kleinschreibung und ohne Randabstände');
const baender = zeilen.map(z => z.band);
ok(baender.indexOf('fuehrung') < baender.indexOf('kern') && baender.indexOf('kern') < baender.indexOf('unterstuetzung'),
  'Die Zeilen folgen der Bandreihenfolge der Landkarte, nicht dem Alphabet');

/* ── 2) Stand einer Zelle ── */
const stand = (id, werk) => w(`pmStand(lkKarte('${werk}').kacheln.find(k => k.id === '${id}'), '${werk}')`);
ok(stand('vertrieb', 'HOL').modell === 1, 'Ein verknüpftes Modell wird gezählt');
ok(stand('produktion', 'HOL').regelwerk === 1, 'Ein direkt zugeordnetes Regelwerk auch');
ok(stand('vertrieb', 'HOL').verantwortlich === 'a.mueller@dihag.com', 'Und die verantwortliche Person');
ok(w("pmStand(null, 'HOL')") === null, 'Ohne Kachel gibt es keinen Stand – das ist etwas anderes als „leer"');

/* ── 3) Die Ansicht ── */
w('renderProzessMatrix();');
let html = mount.innerHTML;
ok(/<th>Konzern \/ Holding<\/th>|<th>HOL<\/th>/.test(html), 'Jedes Werk bekommt eine Spalte');
ok(/Anna Müller/.test(html), 'Ist eine Person gepflegt, steht ihr Name da – nicht die Mailadresse');
ok(/c\.klein@dihag\.com/.test(html), 'Wen die Mitarbeiterliste nicht kennt, steht mit Adresse da');
ok(/pm-fehlt[^>]*>—</.test(html), '„—" für: Prozess wird geführt, aber niemand ist zuständig');
ok(/pm-leer[^>]*>·</.test(html), '„·" für: dieses Werk führt den Prozess gar nicht');
ok(/role="button" tabindex="0"/.test(html), 'Die Zellen sind mit der Tastatur erreichbar');
ok(/pmOeffnen\('SHB','vertrieb-shb'\)/.test(html), 'Ein Klick führt in die Kachel des richtigen Werks');
ok(/class="pm-kpi"/.test(html) && /mit Verantwortlichem/.test(html), 'Oben stehen die Kennzahlen');
const fuss = html.slice(html.indexOf('<tfoot>'), html.indexOf('</tfoot>'));
ok(/2\/17/.test(fuss) && /1\/2/.test(fuss),
  `Je Spalte die Quote – wie viele Prozesse dieses Werks eine Person haben (${fuss.replace(/<[^>]+>/g, ' ').trim()})`);

/* ── 4) Abdeckung als zweites Blatt ── */
w("pmSetTab('abdeckung');");
html = mount.innerHTML;
ok(/pm-marke an" title="Verantwortlich: Anna Müller">V</.test(html), 'V steht für die verantwortliche Person …');
ok(/pm-marke an[^>]*>M</.test(html), '… M für das BPMN-Modell …');
ok(/pm-marke an[^>]*>R</.test(html), '… R für ein zugeordnetes Regelwerk');
ok(/pm-marke aus/.test(html), 'Was fehlt, bleibt blass – sichtbar, aber nicht laut');

/* ── 5) Filter ── */
w("pmSetTab('zustaendig'); pmSetBand('kern');");
ok(!/Buchhaltung/.test(mount.innerHTML) && /Vertrieb/.test(mount.innerHTML), 'Der Bandfilter blendet die anderen aus');
w("pmSetBand(''); pmToggleLuecken(true);");
html = mount.innerHTML;
ok(!/Nichts/.test(html) && /Vertrieb/.test(html),
  'Auch ein teilweise gepflegter Prozess bleibt bei „nur Lücken" stehen – SHB hat kein Modell');
w('pmToggleLuecken(false);');

/* ── 6) CSV: was in Excel ankommt ── */
w('pmCsv();');
const csv = dateien[dateien.length - 1];
ok(/^Prozess-Zustaendigkeiten-\d{4}-\d{2}-\d{2}\.csv$/.test(csv.name), 'Der Dateiname nennt Blatt und Datum');
ok(csv.inhalt.startsWith('﻿'), 'Mit BOM – sonst zerlegt Excel die Umlaute');
ok(csv.inhalt.split('\n')[0].includes('";"'), 'Semikolon als Trenner – dann fragt Excel nicht nach');
ok(/"Vertrieb";"a\.mueller@dihag\.com";"c\.klein@dihag\.com"/.test(csv.inhalt), 'Je Werk eine Spalte mit der Person');
ok(/"Gießerei";"";"offen"/.test(csv.inhalt),
  'Leer heißt „führt der Prozess nicht", „offen" heißt „niemand zuständig" – der Unterschied überlebt den Export');

/* ── 7) Die Matrix speichert nichts ── */
const quelle = lies('js/prozessmatrix.js');
ok(!/spSave|spUpload|_uploadFile/.test(quelle), 'Kein Schreibzugriff – die Matrix ist eine Sicht, keine zweite Wahrheit');
ok(/module.exports/.test(quelle), 'Für Tests exportiert');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
