/**
 * Ebenen der Konzern-Landkarte (js/landkarte.js und die Zähler daneben)
 *
 * Ebene 0 ist das Band, Ebene 1 die Kette (Kachel mit art „kette“), Ebene 2
 * der Prozess, Ebene 3 sein Modell. Abgelöste Kacheln bleiben stehen und
 * verweisen auf ihr Ziel. Geprüft wird:
 *   • die Prüfung der Ebenen findet Waisen, doppelte Ketten, fehlende Bänder,
 *     doppelte Namen und Ablösungen ohne Ziel;
 *   • Ketten und Abgelöste zählen nirgends als Prozess (Notfall, Backlog,
 *     Kennzahlen, Matrix), Prozesse weiter wie bisher;
 *   • die Karte zeigt Kette, Ablösung und Archiv, der Dialog die Ebene;
 *   • die Mindmap hängt den Prozess unter seine Kette statt ans Band;
 *   • die Verantwortung findet die Kette über einem Prozess.
 * Alle Namen sind erfunden.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { jsArg } = require('../js/util.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* Eine kleine Konzernkarte: zwei Bereiche, zwei Ketten, drei Prozesse, eine abgelöste Kachel. */
function karte() {
  return {
    version: 2, historie: [], naechsteNr: 20,
    karten: {
      KONZERN: {
        baender: [
          { key: 'kern-a', titel: 'Kernprozesse Bereich A' },
          { key: 'unterstuetzung', titel: 'Unterstützungsprozesse' },
          { key: 'abgeloest', titel: 'Abgelöst', archiv: true },
        ],
        kacheln: [
          { id: 'k-verkauf', nr: 1, band: 'kern-a', name: 'Verkauf bis Zahlung', art: 'kette', geltung: ['ALLE'],
            verweise: [{ ziel: 'KONZERN:p-angebot', art: 'unterprozess' }, { ziel: 'KONZERN:p-rechnung', art: 'unterprozess' }] },
          { id: 'p-angebot', nr: 2, band: 'kern-a', name: 'Angebot', geltung: ['ALLE'], verweise: [{ ziel: 'KONZERN:p-rechnung', art: 'folgt' }] },
          { id: 'p-rechnung', nr: 3, band: 'kern-a', name: 'Rechnung', geltung: ['ALLE'], prozesse: [{ id: 'm1' }],
            kette: { ziel: '', werke: ['AAA'], werk: {}, rollen: ['Buchhaltung'], extra: [] } },
          { id: 'k-leer', nr: 4, band: 'unterstuetzung', name: 'Platzhalterkette', art: 'kette', geltung: ['ALLE'] },
          { id: 'p-einzeln', nr: 5, band: 'unterstuetzung', name: 'Einzelprozess', geltung: ['ALLE'], offen: ['geltung'] },
          { id: 'alt-verkauf', nr: 6, band: 'abgeloest', name: 'Alter Verkauf', geltung: ['AAA'],
            abgeloest: { durch: ['KONZERN:k-verkauf'], am: '2026-11-23' } },
        ],
      },
    },
  };
}

/* ── Sandkasten mit Landkarte, Notfall- und Prozessmodell ── */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mount = { innerHTML: '' };
let modal = '';
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Number, RegExp, Promise,
  esc, jsArg, toast: () => {}, fmtDate: (d) => String(d || '').slice(0, 10),
  canWriteTab: () => true, canReadTab: () => true,
  STANDORTE: ['AAA', 'BBB'],
  State: { user: { name: 'Anna Muster' }, policies: [] },
  document: { getElementById: (id) => (id === 'prozesse-mount' ? mount : null), querySelectorAll: () => [] },
  openModal: (h) => { modal = h; }, closeModal: () => {},
  geltungsbereichLabel: (a) => (!a || !a.length ? '' : a.includes('ALLE') ? 'Alle Standorte' : a.join(', ')),
  prozessModusLeiste: () => '',
  _processes: [{ itemId: 'm1', title: 'Rechnung schreiben', ordner: 'KONZERN' }],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
['js/landkarte.js', 'js/notfallmodell.js', 'js/prozessmodell.js'].forEach(f => vm.runInContext(lies(f), ctx));
const w = (a) => vm.runInContext(a, ctx);
ctx.__daten = karte();
w(`_lkDaten = __daten; _lkGeladen = true; _lkWerk = 'KONZERN';`);

/* ── 1) Erkennung und Prüfung ── */
ok(w(`lkIstKette(lkKachelVonId('k-verkauf')) && !lkIstProzess(lkKachelVonId('k-verkauf'))`), 'Eine Kachel mit art „kette“ ist eine Kette, kein Prozess');
ok(w(`lkIstAbgeloest(lkKachelVonId('alt-verkauf')) && !lkIstProzess(lkKachelVonId('alt-verkauf'))`), 'Eine abgelöste Kachel zählt nicht als Prozess');
ok(w(`lkIstOffen(lkKachelVonId('p-einzeln'), 'geltung') && !lkIstOffen(lkKachelVonId('p-angebot'), 'geltung')`), 'Offene Angaben stehen in „offen“');
let p = w(`lkEbenenPruefen(_lkDaten, 'KONZERN')`);
ok(p.ketten === 2 && p.prozesse === 3, 'Zwei Ketten, drei Prozesse');
ok(p.ohneKette.join('|') === 'P-005 Einzelprozess', 'Ein Prozess ohne Kette fällt auf');
ok(!p.mehrfach.length && !p.ohneBand.length && !p.doppelt.length && !p.abgeloestOhneZiel.length, 'Sonst keine Befunde');
ok(p.leereKetten.join('|') === 'P-004 Platzhalterkette', 'Leere Ketten werden genannt (Platzhalter sind erlaubt)');
w(`lkKachelVonId('k-leer').verweise = [{ ziel: 'KONZERN:p-einzeln', art: 'unterprozess' }, { ziel: 'KONZERN:p-rechnung', art: 'unterprozess' }];`);
p = w(`lkEbenenPruefen(_lkDaten, 'KONZERN')`);
ok(!p.ohneKette.length && p.mehrfach.join('|') === 'P-003 Rechnung', 'Ein Prozess unter zwei Ketten fällt auf');
w(`lkKachelVonId('k-leer').verweise = [{ ziel: 'KONZERN:p-einzeln', art: 'unterprozess' }];
   lkKachelVonId('alt-verkauf').abgeloest.durch = ['KONZERN:gibt-es-nicht'];
   lkKacheln().push({ id: 'p-doppelt', nr: 7, band: 'nirgends', name: 'Angebot' });`);
p = w(`lkEbenenPruefen(_lkDaten, 'KONZERN')`);
ok(p.abgeloestOhneZiel.join('|') === 'P-006 Alter Verkauf' && p.ohneBand.includes('P-007 Angebot') && p.doppelt.length === 2,
  'Ablösung ohne Ziel, Kachel ohne Band und doppelte Namen fallen auf');
ctx.__daten = karte();
w(`_lkDaten = __daten; _lkDaten.karten.KONZERN.kacheln.find(k => k.id === 'k-leer').verweise = [{ ziel: 'KONZERN:p-einzeln', art: 'unterprozess' }];`);
ok(w(`lkKetteVon('KONZERN', lkKachelVonId('p-rechnung')).id`) === 'k-verkauf' && w(`lkKetteVon('KONZERN', lkKachelVonId('k-verkauf'))`) === null,
  'Die Kette über einem Prozess, über einer Kette keine');

/* ── 2) Zählungen: nur Prozesse ── */
const nf = w(`nfAlleKacheln(_lkDaten).map(x => x.kachel.id).sort().join('|')`);
ok(nf === 'p-angebot|p-einzeln|p-rechnung', `Notfall zählt nur Prozesse (${nf})`);
ok(w(`nfKennzahlen(_lkDaten, [], null, []).prozesse`) === 3, 'Die Notfall-Kennzahl kennt drei Prozesse, nicht sechs');
ok(w(`['k-verkauf', 'alt-verkauf', 'p-angebot'].map(id => pzIstAblauf(lkKachelVonId(id))).join()`) === 'false,false,true',
  'Backlog und Kennzahlen: Kette und Abgelöste sind kein Ablauf');
ok(w(`pzEintraege(_lkDaten, ['KONZERN']).length`) === 3, 'Der Backlog führt drei Einträge');

/* ── 3) Darstellung ── */
w('renderLandkarte();');
let html = mount.innerHTML;
ok(/class="lk-kachel[^"]*lk-kette/.test(html) && />Kette</.test(html), 'Die Kette steht als Kette im Band');
ok(/2 Ketten|1 Kette/.test(html), 'Der Bandkopf zählt Ketten');
ok(/1 abgelöste Karte zeigen/.test(html) && !/Alter Verkauf/.test(html), 'Das Archiv steht zugeklappt');
ok(/von <b>3<\/b> Prozessen sind modelliert/.test(html), 'Modelliert wird je Prozess gezählt, nicht je Kachel');
w(`lkArchivUmschalten('abgeloest');`);
html = mount.innerHTML;
ok(/lk-abgeloest/.test(html) && /Alter Verkauf/.test(html) && /Abgelöste verbergen/.test(html), 'Aufgeklappt zeigt es die abgelöste Karte, grau');
ok(/Bei <b>1<\/b> Kacheln ist der Geltungsbereich noch offen/.test(html), 'Offene Geltungsbereiche stehen oben als Zahl');
w(`_lkDaten.karten.KONZERN.baender[0].form = 'pfeile'; renderLandkarte();`);
ok(/class="lk-pfeil[^"]*lk-kette/.test(mount.innerHTML) && /lk-pfeil-ebene/.test(mount.innerHTML), 'Als Pfeil gezeichnet bleibt sie als Kette erkennbar');
w(`lkKachelOeffnen('alt-verkauf');`);
ok(/Abgelöst am 23\.11\.2026/.test(modal) && /lkSpringeZu\(.*k-verkauf/.test(modal), 'Die abgelöste Karte verweist auf ihr Ziel');
w(`lkKachelOeffnen('k-verkauf');`);
ok(/Kette \(Ebene 1\)/.test(modal) && /Ziel aus der Unternehmensstrategie/.test(modal) && !/Modell anlegen/.test(modal)
  && !/Kein Prozessverantwortlicher/.test(modal), 'Die Kette zeigt ihre Ebene, das offene Ziel und keine Modellknöpfe');
ok(/Prozesseigner der Gruppe: <span style="color:#b45309">offen/.test(modal), 'Ohne Eigner und ohne Verantwortliche steht der Eigner der Kette als offen');
w(`_lkDaten.karten.KONZERN.kacheln[0].verantwortlich = 'erika.muster@beispiel.de'; lkKachelOeffnen('k-verkauf');`);
ok(/Prozesseigner der Gruppe: erika\.muster@beispiel\.de/.test(modal), 'Ist der Eigner leer, ist es die verantwortliche Person der Kette');
w(`_lkDaten.karten.KONZERN.kacheln[0].prozesseigner = 'max.muster@beispiel.de'; lkKachelOeffnen('k-verkauf');`);
ok(/Prozesseigner der Gruppe: max\.muster@beispiel\.de/.test(modal), 'Ein eigens gesetzter Eigner geht vor');
w(`delete _lkDaten.karten.KONZERN.kacheln[0].prozesseigner; delete _lkDaten.karten.KONZERN.kacheln[0].verantwortlich;`);
w(`lkKachelOeffnen('p-rechnung');`);
ok(/Teil der Kette/.test(modal) && /Verkauf bis Zahlung/.test(modal), 'Ein Prozess nennt seine Kette');
w(`lkKachelOeffnen('p-einzeln');`);
ok(/Geltungsbereich ist noch offen/.test(modal), 'Der Dialog bittet um den offenen Geltungsbereich');

/* ── 4) Mindmap und Verantwortung (Quelltext) ── */
const vk = lies('js/verknuepfungen.js');
ok(/if \(!elternVon\.has\(pid\)\) link\(bid, pid, 'enthält'\)/.test(vk) && /elternVon\.forEach\(\(eltern, kind\) => link\(eltern, kind, 'enthält'\)\)/.test(vk),
  'Mindmap: ein Teilprozess hängt unter seiner Kette, nicht noch einmal am Band');
const vm2 = vm.createContext({ console, JSON, Array, Object, String, Math, Set, Map, Number, RegExp });
vm.runInContext(lies('js/verantwortungmodell.js'), vm2);
vm2.__daten = karte();
const e = vm.runInContext(`vwEbeneKette(__daten, 'p-rechnung')`, vm2);
ok(e && e.kette.id === 'k-verkauf' && e.band.titel === 'Kernprozesse Bereich A', 'Verantwortung: Kette und Bereich über einem Prozess');
ok(vm.runInContext(`vwKetten(__daten).map(k => k.id).join()`, vm2) === 'p-rechnung', 'Verantwortung zählt weiter nur Prozesse mit Kette');
ok(/_vwGruppiertHtml\(d, ketten, darf\)/.test(lies('js/verantwortung.js')), 'Verantwortung gruppiert nach Kette');
ok(/const eigner = _vwText\(kt\.prozesseigner\) \|\| _vwText\(kt\.verantwortlich\);/.test(lies('js/verantwortung.js')),
  'Die Kopfzeile der Kette nimmt die verantwortliche Person, solange kein Eigner gesetzt ist');

/* ── 5) Die Holding hat keine eigene Karte mehr ── */
const hctx = vm.createContext({ console, JSON, Array, Object, String, Math, Set, Map, Number, RegExp, Date, Promise,
  STANDORTE: ['HOL', 'AAA', 'BBB'] });
hctx.window = hctx;
vm.runInContext(lies('js/landkarte.js'), hctx);
hctx.__d = karte();
vm.runInContext(`_lkDaten = __d;`, hctx);
ok(vm.runInContext(`lkWerkeAuswahl().join()`, hctx) === 'KONZERN,AAA,BBB', 'Ohne eigene Kacheln steht HOL nicht in der Auswahl der Karten, die Gesellschaften schon');
ok(vm.runInContext(`lkWerkeSichtbar().includes('HOL') && LK_WERKE.includes('HOL')`, hctx),
  'Als Standort bleibt HOL sichtbar (Krisenstab im Notfall, Zugriff)');
vm.runInContext(`_lkDaten.karten.HOL = { baender: [], kacheln: [{ id: 'x', band: 'fuehrung', name: 'Rest' }] };`, hctx);
ok(vm.runInContext(`lkWerkeAuswahl().includes('HOL')`, hctx), 'Liegen dort noch Kacheln, bleibt HOL in der Auswahl (nichts verschwindet unbemerkt)');
const lkQ = lies('js/landkarte.js');
ok(/const auswahl = lkWerkeAuswahl\(\);\s*\n\s*if \(!auswahl\.includes\(_lkWerk\)\) _lkWerk = auswahl\.includes\('KONZERN'\)/.test(lkQ)
  && /\$\{auswahl\.map\(w => `<option/.test(lkQ), 'Die Landkarte zeigt nur die Auswahl und springt von HOL auf die Konzernkarte');
const pzQ = lies('js/prozesse.js');
ok(/\$\{_procAblageWerke\(proc\)\.map\(w =>/.test(pzQ) && /lkWerkeAuswahl\(\)/.test(pzQ), 'Neue Modelle bieten die leere Holding nicht mehr als Ablage an');
ok(/const werke = \(typeof lkWerkeSichtbar === 'function'\) \? lkWerkeSichtbar\(\)/.test(lies('js/notfall.js')), 'Der Notfall bietet weiter jeden Standort an');
ok(vm.runInContext(`lkWerkLabel('KONZERN')`, hctx) === 'Konzern / Holding', 'Die Konzernkarte heißt weiter „Konzern / Holding“');
ok(/kachel\.art === 'kette' \|\| kachel\.abgeloest/.test(lies('js/prozessmatrix.js')), 'Matrix: keine Zeile für Ketten und Abgelöste');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`); process.exit(fail ? 1 : 0);
