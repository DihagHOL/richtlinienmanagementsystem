/**
 * Eigene Vorlagen sichern – und die eingebauten ausblenden.
 *
 * Neun eingebaute Vorlagen stehen zur Wahl, und die meisten davon braucht ein
 * Haus nie. Es fehlte der umgekehrte Weg: Wer eine Landkarte einmal
 * zurechtgelegt hat, will sie sichern und in den anderen Werken einsetzen.
 *
 * Zwei Entscheidungen, die hier festgehalten sind:
 *
 *   • Eine Vorlage ist **Form, nicht Inhalt**. Verantwortliche, Modelle und
 *     Regelwerke wandern nicht mit – eine Person gehört nicht in eine Vorlage,
 *     und ein Modell liegt im Ordner seines Werks.
 *   • Eingebaute Vorlagen werden **ausgeblendet, nicht gelöscht**. Sie stehen
 *     im Code; verschwände nur die Möglichkeit, sie zurückzuholen, wäre nichts
 *     gewonnen.
 *
 * Und die Falle, die still zuschlägt: `lkDatenLaden()` baut `_lkDaten` aus
 * {version, karten, historie} neu zusammen. Eine Vorlage, die dort nicht
 * ausdrücklich mitgenommen wird, ist beim nächsten Laden weg.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const felder = {};
const gemeldet = [];
const verlauf = [];
let gespeichert = null;
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise,
  esc: (s) => String(s ?? ''),
  document: {
    getElementById: (id) => (id in felder ? { value: felder[id], checked: felder[id] } : null),
    querySelector: () => null, querySelectorAll: () => [],
  },
  toast: (t) => gemeldet.push(t),
  openModal: (h) => { felder.__modal = h; }, closeModal: () => {},
  canWriteTab: () => true,
  uiConfirm: async () => true,
  State: { user: { name: 'Anna Muster', upn: 'anna@dihag.com' } },
  STANDORTE: ['HOL', 'SHB'],
  spLoadLandkarte: async () => ({ daten: gespeichert, geaendertAm: 'jetzt' }),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
run(`lkSpeichern = async (m, was) => { __verlauf.push(was); __ablage.wert = JSON.parse(JSON.stringify(_lkDaten)); };`);
run(`lkVorlageDialog = () => {};`);   // nach dem Entfernen wird er neu geöffnet – hier nicht nötig
ctx.__verlauf = verlauf;
ctx.__ablage = {};

run(`
_lkDaten = { version: 2, karten: { HOL: {
  baender: [{ key: 'fuehrung', titel: 'Führung' }, { key: 'kern', titel: 'Kern' }],
  kacheln: [
    { id: 'strategie', band: 'fuehrung', name: 'Strategie', unter: 'Leitbild',
      verantwortlich: 'chef@dihag.com', prozesse: [{ id: 'p-1' }], regelwerke: ['7'],
      geltung: ['HOL'], verweise: [{ ziel: 'HOL:vertrieb', art: 'unterprozess' },
                                   { ziel: 'SHB:giessen', art: 'nutzt' }] },
    { id: 'vertrieb', band: 'kern', name: 'Vertrieb', geltung: ['HOL'] },
  ],
}, SHB: { baender: [], kacheln: [{ id: 'giessen', band: 'kern', name: 'Gießen' }] } }, historie: [] };
_lkWerk = 'HOL';
`);

/* ── 1) Der Schnappschuss: Form, nicht Inhalt ── */
const schnapp = run(`_lkVorlageAusKarte('HOL')`);
ok(schnapp.kacheln.length === 2 && schnapp.baender.length === 2, 'Bänder und Prozesse wandern mit');
const str = schnapp.kacheln[0];
ok(str.name === 'Strategie' && str.unter === 'Leitbild', 'Name und Untertitel ebenso');
ok(!('verantwortlich' in str), 'Die verantwortliche Person NICHT – sie gehört nicht in eine Vorlage');
ok(!('prozesse' in str), 'Das BPMN-Modell nicht – es liegt im Ordner seines Werks');
ok(!('regelwerke' in str) && !('geltung' in str),
  'Regelwerke und Geltungsbereich auch nicht – die gehören zu dieser Karte, nicht zur Form');
ok(str.verweise.length === 1 && str.verweise[0].ziel === 'vertrieb',
  'Ein Verweis im eigenen Werk verliert das Werk – die Vorlage passt so in jedes');
ok(!str.verweise.some(v => String(v.ziel).includes('SHB')),
  'Ein Verweis auf ein fremdes Werk fällt weg: Aus einer Vorlage zeigte er auf eine fremde Karte');

/* ── 2) Sichern ── */
felder['lk-vorlage-name'] = 'Gießerei-Standard';
felder['lk-vorlage-zweck'] = 'Für alle produzierenden Werke.';
await run(`lkVorlageSpeichern()`);
ok(run(`lkEigeneVorlagen().length`) === 1, 'Die eigene Vorlage liegt im Datenbestand');
const eig = run(`lkEigeneVorlagen()[0]`);
ok(eig.key.startsWith('eigen:'), `Ihr Schlüssel trägt ein Präfix (${eig.key}) – nie eine Kollision mit einer eingebauten`);
ok(eig.titel === 'Gießerei-Standard' && eig.zweck === 'Für alle produzierenden Werke.', 'Name und Zweck stehen dran');
ok(eig.von === 'Anna Muster' && !!eig.angelegt, 'Und wer sie wann gesichert hat');
ok(run(`lkVorlagenAlle()[0].eigen`) === true && run(`lkVorlagenAlle()[0].key`) === eig.key,
  'In der Auswahl steht sie vorn – eigene vor eingebauten');
ok(run(`lkVorlagenAlle().length`) === run(`LK_VORLAGEN.length`) + 1, 'Die eingebauten bleiben daneben stehen');

felder['lk-vorlage-name'] = 'Gießerei-Standard';
await run(`lkVorlageSpeichern()`);
ok(run(`lkEigeneVorlagen()[1].key`) !== eig.key, 'Zweimal derselbe Name gibt nie denselben Schlüssel');
run(`_lkDaten.vorlagen.pop();`);

gemeldet.length = 0;
felder['lk-vorlage-name'] = '   ';
await run(`lkVorlageSpeichern()`);
ok(/Namen angeben/.test(gemeldet.join(' ')) && run(`lkEigeneVorlagen().length`) === 1,
  'Ohne Namen wird nichts gesichert');

/* ── 3) Einsetzen: eine eigene Vorlage ist eine wie jede andere ── */
run(`_lkWerk = 'SHB'; document.querySelector = (sel) => ({ value: sel.includes('modus') ? 'ersetzen' : __key });`);
ctx.__key = eig.key;
await run(`lkVorlageAnwenden()`);
ok(run(`lkKarte('SHB').kacheln.length`) === 2, 'Sie lässt sich in einem anderen Werk einsetzen');
ok(run(`lkKarte('SHB').kacheln[0].geltung.join('|')`) === 'SHB',
  'Und der Geltungsbereich wird dabei auf das neue Werk gesetzt');
ok(run(`lkKarte('SHB').kacheln[0].verweise[0].ziel`) === 'SHB:vertrieb',
  'Die Verweise bekommen das neue Werk – die Gliederung bleibt erhalten');
run(`_lkWerk = 'HOL';`);

/* ── 4) Entfernen: löschen oder ausblenden ── */
verlauf.length = 0;
await run(`lkVorlageEntfernen('konzern')`);
ok(run(`lkVorlagenAus().has('konzern')`) === true, 'Eine eingebaute Vorlage wird ausgeblendet …');
ok(run(`LK_VORLAGEN.some(v => v.key === 'konzern')`) === true, '… nicht gelöscht – sie steht im Code');
ok(!run(`lkVorlagenAlle().some(v => v.key === 'konzern')`), 'Aus der Auswahl ist sie damit weg');
ok(/ausgeblendet/.test(verlauf.join(' ')), 'Der Verlauf nennt es beim Namen');

await run(`lkVorlageZeigen('konzern')`);
ok(run(`lkVorlagenAlle().some(v => v.key === 'konzern')`), 'Und lässt sich zurückholen');

verlauf.length = 0;
await run(`lkVorlageEntfernen(${JSON.stringify(eig.key)})`);
ok(run(`lkEigeneVorlagen().length`) === 0, 'Eine eigene Vorlage wird dagegen wirklich gelöscht');
ok(run(`lkKarte('SHB').kacheln.length`) === 2,
  'Die damit angelegte Landkarte bleibt unberührt – eine Vorlage ist eine Kopiervorlage, keine Verbindung');
ok(/gelöscht/.test(verlauf.join(' ')), 'Auch das steht im Verlauf');

/* ── 5) Die Falle: überlebt eine Vorlage das Neuladen? ──
   lkDatenLaden() baut _lkDaten aus {version, karten, historie} neu zusammen.
   Was dort nicht ausdrücklich mitgenommen wird, ist still verschwunden. */
felder['lk-vorlage-name'] = 'Bleibt hoffentlich';
await run(`lkVorlageSpeichern()`);
await run(`lkVorlageEntfernen('sap')`);
gespeichert = ctx.__ablage.wert;
ok(gespeichert.vorlagen.length === 1 && gespeichert.vorlagenAus.includes('sap'),
  'Beides steht in der gespeicherten Datei');

run(`_lkGeladen = false; _lkDaten = null;`);
await run(`lkDatenLaden()`);
ok(run(`lkEigeneVorlagen().length`) === 1 && run(`lkEigeneVorlagen()[0].titel`) === 'Bleibt hoffentlich',
  'Nach dem Neuladen ist die eigene Vorlage noch da');
ok(run(`lkVorlagenAus().has('sap')`) === true, 'Und die ausgeblendete bleibt ausgeblendet');

/* ── 6) Die Oberfläche ── */
const lk = lies('js/landkarte.js');
ok(/onclick="lkVorlageSpeichernDialog\(\)"/.test(lk), 'Der Dialog bietet „als Vorlage sichern" an');
ok(/onclick="lkVorlageEntfernen\('\$\{esc\(v\.key\)\}'\)"/.test(lk), 'Und je Zeile ein ✕');
ok(/lkVorlagenAlle\(\)\.map/.test(lk), 'Gezeichnet wird aus eigenen und eingebauten zusammen');
ok(/const vorlage = lkVorlageVonKey\(/.test(lk), 'Einsetzen findet beide Sorten');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
