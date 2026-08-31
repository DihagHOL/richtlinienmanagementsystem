/**
 * Die SAP-Landkarte: End-to-End-Prozesse als Vorlage.
 *
 * Die anderen Vorlagen beschreiben den Aufbau – wer wofür zuständig ist. Diese
 * beschreibt den Ablauf: „Lead to Cash" beginnt beim Interessenten und endet
 * beim Zahlungseingang, unterwegs liegen Vertrieb, Planung, Gießerei, Versand
 * und Buchhaltung. Eine Kette ist deshalb erst seit den Verweisen überhaupt
 * aufschreibbar – und diese Vorlage ist die erste, die schon verknüpft ist.
 *
 * Geprüft wird vor allem, was still kaputtgehen kann: ein Verweis ins Nichts
 * (lkVerweiseVon() verschweigt tote Ziele – ein Tippfehler in der Vorlage fiele
 * sonst niemandem auf) und das fehlende Werk im Ziel beim Einsetzen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Promise,
  esc: (s) => String(s ?? ''),
  document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  toast: () => {}, openModal: () => {}, closeModal: () => {}, canWriteTab: () => true,
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* ── 1) Die Vorlage steht zur Auswahl ── */
const eintrag = run(`LK_VORLAGEN.find(v => v.key === 'sap')`);
ok(!!eintrag, 'Die SAP-Landkarte steht im Vorlagen-Dialog zur Wahl');
ok(run(`LK_VORLAGEN.find(v => v.key === 'sap').karte === LK_SAP`), 'Sie zeigt auf LK_SAP');
ok(run(`LK_SAP.baender.length`) >= 8,
  `Alle SAP-Ketten sind ein eigenes Band (${run(`LK_SAP.baender.length`)})`);

/* ── 2) Keine doppelten Kennungen ──
   Zwei Kacheln mit derselben id wären für jeden Verweis dieselbe Kachel. */
const ids = run(`LK_SAP.kacheln.map(k => k.id)`);
ok(new Set(ids).size === ids.length, `${ids.length} Prozesse, jede Kennung nur einmal`);
ok(run(`LK_SAP.kacheln.every(k => LK_SAP.baender.some(b => b.key === k.band))`),
  'Jede Kachel liegt in einem Band, das es gibt');

/* ── 3) Kein Verweis ins Nichts ──
   lkVerweiseVon() filtert tote Ziele stillschweigend heraus. In einer Vorlage
   wäre ein Tippfehler damit unsichtbar – hier fällt er auf. */
const alle = run(`LK_SAP.kacheln.flatMap(k => (k.verweise||[]).map(v => ({ von: k.id, ...v })))`);
const bekannt = new Set(ids);
const tot = alle.filter(v => !bekannt.has(v.ziel));
ok(tot.length === 0, tot.length
  ? `Tote Verweisziele: ${tot.map(v => v.von + ' → ' + v.ziel).join(', ')}`
  : `Alle ${alle.length} Verweise treffen eine Kachel dieser Vorlage`);
ok(alle.every(v => !String(v.ziel).includes(':')),
  'Die Ziele stehen ohne Werk – welches es ist, entscheidet erst das Einsetzen');
const arten = new Set(alle.map(v => v.art));
ok(['unterprozess', 'folgt', 'nutzt'].every(a => arten.has(a)),
  'Die Vorlage nutzt alle drei Arten: Klammer, Kette, Querbezug');

/* ── 4) Die vier SAP-Klammern ── */
const klammern = run(`LK_SAP.kacheln.filter(k => k.band === 'klammer')`);
ok(klammern.length === 4, 'Vier Kern-End-to-End-Prozesse als Klammer: '
  + klammern.map(k => k.name).join(', '));
ok(klammern.every(k => (k.verweise || []).some(v => v.art === 'unterprozess')),
  'Jede Klammer hängt als Unterprozess am Anfang ihrer Kette');
const d2o = klammern.find(k => k.id === 'sap-e2e-d2o');
ok(d2o && d2o.verweise.filter(v => v.art === 'unterprozess').length === 3,
  '„Design to Operate" spannt sich über drei Ketten – so führt SAP es auch');

/* ── 5) Die Kette läuft durch ──
   Von „Markt & Lead" bis zum Zahlungseingang, Schritt für Schritt. */
function kette(start) {
  const kachel = (id) => run(`LK_SAP.kacheln.find(k => k.id === ${JSON.stringify(id)})`);
  const weg = [start];
  let cur = start;
  for (let i = 0; i < 20; i++) {
    const k = kachel(cur);
    const next = ((k && k.verweise) || []).find(v => v.art === 'folgt');
    if (!next) break;
    cur = next.ziel; weg.push(cur);
  }
  return weg;
}
const l2c = kette('sap-l2c-markt');
ok(l2c[l2c.length - 1] === 'sap-l2c-zahlung',
  `Lead to Cash läuft in ${l2c.length} Schritten bis zum Zahlungseingang`);
const i2m = kette('sap-i2m-idee');
ok(i2m.includes('sap-p2f-planung'),
  'Idea to Market endet nicht an der Bandgrenze – die Serienüberleitung geht in die Produktionsplanung über');

/* ── 6) Die Querbezüge sind der eigentliche Punkt ──
   Ein Band allein ist eine Abteilung. Erst der Sprung in ein anderes Band
   zeigt, dass die Kette quer durch das Haus läuft. */
const bandVon = {};
run(`LK_SAP.kacheln.map(k => [k.id, k.band])`).forEach(([id, b]) => { bandVon[id] = b; });
const quer = alle.filter(v => bandVon[v.von] !== bandVon[v.ziel] && v.art !== 'unterprozess');
ok(quer.length >= 10, `${quer.length} Verweise überspringen die Bandgrenze`);
ok(alle.some(v => v.von === 'sap-l2c-auftrag' && v.ziel === 'sap-p2f-planung'),
  'Die Auftragserfassung fragt die Produktionsplanung');
ok(alle.some(v => v.von === 'sap-p2f-material' && v.ziel === 'sap-s2p-bedarf'),
  'Die Materialdisposition löst die Beschaffung aus');
ok(alle.some(v => v.ziel === 'sap-fin-hauptbuch' && v.von === 'sap-s2p-zahlung'),
  'Und am Ende bucht alles ins Hauptbuch');

/* ── 7) Einsetzen: erst dabei bekommt ein Ziel sein Werk ──
   Ohne Werk läse jede andere Landkarte dieselben Ziele als ihre eigenen
   (lkZielTeile fällt auf die offene Karte zurück) und die Gegenrichtung
   fände sie gar nicht (lkVerweiseAuf vergleicht den vollen Schlüssel). */
run(`
_lkDaten = { version: 2, karten: {} };
_lkWerk = 'KONZERN';
lkSpeichern = async () => {};
document.querySelector = () => ({ value: 'sap' });
`);
await run(`lkVorlageAnwenden()`);

const eingesetzt = run(`lkKarte('KONZERN').kacheln.length`);
ok(eingesetzt === ids.length, `Alle ${eingesetzt} Prozesse liegen in der Konzernkarte`);
ok(run(`lkKarte('KONZERN').kacheln.every(k => (k.verweise||[]).every(v => v.ziel.startsWith('KONZERN:')))`),
  'Jedes Verweisziel trägt jetzt sein Werk');

const auftrag = run(`lkVerweiseVon(lkKachelVonZiel('KONZERN:sap-l2c-auftrag').kachel)`);
ok(auftrag.length === 2 && auftrag.every(v => v.werk === 'KONZERN'),
  'Und lässt sich auflösen: die Auftragserfassung zeigt weiter und zur Seite');
ok(run(`lkVerweiseAuf('KONZERN','sap-p2f-planung').length`) >= 2,
  'Die Gegenrichtung findet die Planung – sie wird von mehreren Ketten gebraucht');

/* Die eigentliche Falle: eine andere Landkarte ist offen. */
run(`_lkWerk = 'HOL';`);
const fremd = run(`lkVerweiseVon(lkKachelVonZiel('KONZERN:sap-l2c-markt').kachel)`);
ok(fremd.length === 1 && fremd[0].werk === 'KONZERN',
  'Auch mit einer anderen offenen Karte zeigen die Verweise weiter auf den Konzern');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
