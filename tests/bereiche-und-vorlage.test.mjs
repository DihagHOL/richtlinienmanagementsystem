/**
 * Bereiche bearbeiten – und eine Vorlage einsetzen, ohne alles zu verlieren.
 *
 * Zwei Dinge, die zusammengehören:
 *
 *   1. Jede Kachel liess sich anlegen, umbenennen und verschieben. Die Bereiche
 *      kamen aus der Vorlage und blieben, wie sie waren.
 *   2. „Vorlage einsetzen" hiess bisher immer „ersetzen". Wer die Teilprozesse
 *      einer Vorlage wollte, musste alles wegwerfen, was an der Landkarte
 *      gepflegt war – Verantwortliche, Modelle, Regelwerke, Geltungsbereiche.
 *
 * Geprüft wird vor allem das, was dabei still kaputtgehen kann: der Schlüssel
 * eines Bereichs (an ihm hängt jede Kachel), die Prozesse eines gelöschten
 * Bereichs (sie werden verschoben, nicht gelöscht) und das Ergänzen, das
 * nichts überschreiben darf.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const felder = {};          // was der Dialog gerade anzeigt/enthält
const gemeldet = [];
const verlauf = [];
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise,
  esc: (s) => String(s ?? ''),
  document: {
    getElementById: (id) => (id in felder ? { value: felder[id], focus() {} } : null),
    querySelector: (sel) => (sel in felder ? { value: felder[sel] } : null),
    querySelectorAll: () => [],
  },
  toast: (t) => gemeldet.push(t),
  openModal: (h) => { felder.__modal = h; }, closeModal: () => {}, canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC'],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
/* lkSpeichern schreibt sonst nach SharePoint – hier reicht der Vermerk. */
run(`lkSpeichern = async (meldung, was) => { __verlauf.push(was); };`);
ctx.__verlauf = verlauf;

run(`
_lkDaten = { karten: { HOL: {
  baender: [
    { key: 'fuehrung', titel: 'Führung' },
    { key: 'kern', titel: 'Kernprozesse' },
    { key: 'unterstuetzung', titel: 'Unterstützung' },
  ],
  kacheln: [
    { id: 'strategie', band: 'fuehrung', name: 'Strategie', verantwortlich: 'chef@dihag.com' },
    { id: 'vertrieb',  band: 'kern', name: 'Vertrieb' },
    { id: 'it',        band: 'unterstuetzung', name: 'IT' },
  ],
} } };
_lkWerk = 'HOL';
`);

/* ── 1) Die Form hängt am Bereich, nicht am Schlüssel ──
   „kern" war Zufall, kein Entwurf: Ein selbst angelegter Bereich konnte keine
   Pfeile bekommen. */
ok(run(`lkBandPfeile({ key: 'kern', titel: 'K' })`) === true, 'Der alte Schlüssel „kern" trägt weiter Pfeile');
ok(run(`lkBandPfeile({ key: 'eigener', titel: 'E', form: 'pfeile' })`) === true,
  'Und jeder Bereich kann sie bekommen – die Form ist eine Eigenschaft');
ok(run(`lkBandPfeile({ key: 'kern', titel: 'K', form: 'kacheln' })`) === false,
  'Auch andersherum: „kern" darf Kacheln zeigen');
ok(run(`lkBandPfeile(null)`) === false, 'Ohne Bereich keine Pfeile');

/* ── 2) Umbenennen ändert NIE den Schlüssel ──
   An ihm hängt jede Kachel. Ein neuer Schlüssel liesse sie alle aus der Karte
   fallen – sie stünden in einem Band, das es nicht mehr gibt. */
felder['lk-band-titel'] = 'Führungsprozesse';
felder['lk-band-form'] = 'kacheln';
await run(`lkBandSpeichern('fuehrung')`);
ok(run(`lkBaender()[0].titel`) === 'Führungsprozesse', 'Der Bereich heißt jetzt anders …');
ok(run(`lkBaender()[0].key`) === 'fuehrung', '… und trägt denselben Schlüssel wie vorher');
ok(run(`lkKachelVonId('strategie').band`) === 'fuehrung', 'Die Kachel hängt weiter daran');
ok(/heißt jetzt/.test(verlauf.join(' ')), 'Der Verlauf hält die Umbenennung fest');

felder['lk-band-titel'] = '';
gemeldet.length = 0;
await run(`lkBandSpeichern('fuehrung')`);
ok(/Namen angeben/.test(gemeldet.join(' ')) && run(`lkBaender()[0].titel`) === 'Führungsprozesse',
  'Ein leerer Name wird abgelehnt, nicht gespeichert');

/* ── 3) Anlegen ── */
ok(run(`lkBandSchluessel('Überwachung & Recht')`) === 'ueberwachung-recht',
  'Der Schlüssel entsteht aus dem Namen – Umlaute und Zeichen aufgelöst');
ok(run(`lkBandSchluessel('Kernprozesse')`) !== 'kern', 'Und ist frei, nicht geraten');
felder['lk-band-titel'] = 'Überwachung';
felder['lk-band-form'] = 'kacheln';
await run(`lkBandSpeichern('')`);
ok(run(`lkBaender().length`) === 4, 'Ein neuer Bereich kommt dazu');
ok(run(`lkBaender()[3].key`) === 'ueberwachung' && run(`lkBaender()[3].titel`) === 'Überwachung',
  'Mit eigenem Schlüssel und dem gewählten Namen');
felder['lk-band-titel'] = 'Überwachung';
await run(`lkBandSpeichern('')`);
ok(run(`lkBaender()[4].key`) === 'ueberwachung-2',
  'Zweimal derselbe Name gibt zwei Bereiche – aber nie denselben Schlüssel');
run(`lkKarte('HOL').baender.pop();`);

/* ── 4) Reihenfolge ── */
await run(`lkBandVerschieben('unterstuetzung', -1)`);
ok(run(`lkBaender().map(b => b.key).join('|')`) === 'fuehrung|unterstuetzung|kern|ueberwachung',
  'Ein Bereich lässt sich nach oben schieben');
await run(`lkBandVerschieben('fuehrung', -1)`);
ok(run(`lkBaender()[0].key`) === 'fuehrung', 'Über den Rand hinaus passiert nichts');
await run(`lkBandVerschieben('unterstuetzung', 1)`);
ok(run(`lkBaender().map(b => b.key).join('|')`) === 'fuehrung|kern|unterstuetzung|ueberwachung',
  'Und wieder zurück');

/* ── 5) Löschen verschiebt, es löscht keine Prozesse ──
   Was mit ihnen geschieht, entscheidet nicht das Programm. */
ok(run(`lkBandBelegung('kern')`) === 1, 'Im Kernband liegt ein Prozess');
felder['lk-band-ziel'] = 'unterstuetzung';
await run(`lkBandLoeschen('kern')`);
ok(run(`lkBaender().map(b => b.key).join('|')`) === 'fuehrung|unterstuetzung|ueberwachung',
  'Der Bereich ist weg …');
ok(run(`lkKachelVonId('vertrieb')`) !== null, '… der Prozess darin aber nicht');
ok(run(`lkKachelVonId('vertrieb').band`) === 'unterstuetzung', 'Er steht jetzt im gewählten Bereich');
ok(/verschoben/.test(verlauf[verlauf.length - 1]) && /1 Prozess/.test(verlauf[verlauf.length - 1]),
  `Und der Verlauf sagt, wohin: „${verlauf[verlauf.length - 1]}"`);

run(`lkKarte('HOL').baender = [{ key: 'nur-einer', titel: 'Alles' }];
     lkKacheln().forEach(k => { k.band = 'nur-einer'; });`);
await run(`lkBandLoeschen('nur-einer')`);
ok(run(`lkBaender().length`) === 1,
  'Der letzte Bereich lässt sich nicht entfernen – sonst hätte kein Prozess mehr Platz');

/* ── 6) Der Balken ist die Schaltfläche ── */
const lk = lies('js/landkarte.js');
ok(/lkBandDialog\('\$\{esc\(band\.key\)\}'\)/.test(lk), 'Ein Klick auf den Bereichsbalken öffnet ihn');
ok(/onclick="lkBandDialog\(''\)"/.test(lk), 'Und „+ Bereich" legt einen neuen an');
ok(/if \(lkBandPfeile\(band\)\)/.test(lk), 'Gezeichnet wird nach der Form des Bereichs, nicht nach seinem Namen');

/* ══ Vorlage ergänzen statt ersetzen ══ */
run(`
_lkDaten = { karten: { KONZERN: {
  baender: [{ key: 'strategie', titel: 'Strategie' }],
  kacheln: [
    { id: 'hd-vision', band: 'strategie', name: 'Vision & Leitbild',
      verantwortlich: 'chef@dihag.com', prozesse: [{ id: 'p-1' }], regelwerke: ['7'],
      geltung: ['ALLE'], verweise: [] },
  ],
} } };
_lkWerk = 'KONZERN';
`);
verlauf.length = 0;
await run(`_lkVorlageErgaenzen(
  LK_VORLAGEN.find(v => v.key === 'holding'),
  JSON.parse(JSON.stringify(LK_HOLDING)),
  lkKarte('KONZERN'))`);

const vision = run(`lkKachelVonId('hd-vision')`);
ok(vision.verantwortlich === 'chef@dihag.com' && vision.prozesse.length === 1 && vision.regelwerke.length === 1,
  'Die vorhandene Kachel behält Verantwortlichen, Modell und Regelwerk');
ok(vision.verweise.length === 3,
  `Ihr werden nur die fehlenden Verweise angehängt (${vision.verweise.length} Unterprozesse)`);
ok(vision.verweise.every(v => v.ziel.startsWith('KONZERN:')), 'Und die Ziele tragen ihr Werk');
ok(run(`lkKacheln().length`) === 83, `Der Rest der Vorlage kommt dazu (${run(`lkKacheln().length`)} Kacheln)`);
ok(run(`lkBaender().length`) === 8, 'Ebenso die fehlenden Bereiche');
ok(/ergänzt/.test(verlauf.join(' ')) && /Prozess/.test(verlauf.join(' ')),
  `Der Verlauf zählt auf, was dazukam: „${verlauf[0]}"`);

verlauf.length = 0; gemeldet.length = 0;
await run(`_lkVorlageErgaenzen(
  LK_VORLAGEN.find(v => v.key === 'holding'),
  JSON.parse(JSON.stringify(LK_HOLDING)),
  lkKarte('KONZERN'))`);
ok(run(`lkKacheln().length`) === 83 && verlauf.length === 0,
  'Ein zweiter Durchgang ändert nichts mehr – nichts sammelt sich an');
ok(/schon vollständig/.test(gemeldet.join(' ')), 'Und sagt das auch');

ok(/name="lk-vorlage-modus"/.test(lk) && /value="ergaenzen" checked/.test(lk),
  'Im Dialog ist „Ergänzen" die Vorgabe – Ersetzen wirft weg, was gepflegt wurde');

/* ══ Die Holding-Vorlage trägt jetzt die Teilprozesse ══ */
run(`_lkDaten = { karten: { KONZERN: JSON.parse(JSON.stringify(LK_HOLDING)) } }; _lkWerk = 'KONZERN';`);
ok(run(`LK_HOLDING.baender.map(b => b.key).join('|')`)
  === 'strategie|finanzierung|controlling|personal|beteiligungen|beratung|ueberwachung|toechter',
  'Die acht Bereiche der Holding-Skizze – die Struktur bleibt');
const ids = run(`LK_HOLDING.kacheln.map(k => k.id)`);
ok(new Set(ids).size === ids.length, `${ids.length} Kacheln, jede Kennung nur einmal`);
const alleV = run(`LK_HOLDING.kacheln.flatMap(k => (k.verweise||[]).map(v => ({ von: k.id, ...v })))`);
const tot = alleV.filter(v => !ids.includes(v.ziel));
ok(tot.length === 0, tot.length
  ? `Tote Ziele: ${tot.map(v => v.von + ' → ' + v.ziel).join(', ')}`
  : `Alle ${alleV.length} Verweise treffen eine Kachel`);

const geteilt = run(`lkKacheln().filter(k => lkMehrfachVerwendet('KONZERN', k.id)).map(k => k.name)`);
ok(geteilt.length === 5,
  `Fünf Teilprozesse gehören zu zwei Hauptprozessen und stehen trotzdem nur einmal da: ${geteilt.join(', ')}`);
ok(geteilt.includes('Forecast') && geteilt.includes('M&A') && geteilt.includes('Governance-System'),
  '… darunter Forecast, M&A und das Governance-System');

ok(run(`lkUnterprozesse(lkKachelVonId('hd-tagesgesch')).length`) === 7,
  'Die sieben Kernprozesse der Töchter hängen am operativen Tagesgeschäft');
/* Der Anfang der Kette ist der erste Unterprozess des Tagesgeschäfts – die
   Kennung selbst ist erzeugt und darf sich ändern, ohne den Test zu brechen. */
const kette = run(`
  (() => { const w = []; let k = lkUnterprozesse(lkKachelVonId('hd-tagesgesch'))[0].kachel;
    for (let i = 0; i < 10 && k; i++) { w.push(k.name);
      const n = (k.verweise || []).find(v => v.art === 'folgt');
      k = n ? lkKachelVonZiel(n.ziel).kachel : null; }
    return w; })()`);
ok(kette.length === 7 && kette[0].startsWith('Markt') && kette[6].startsWith('Versand'),
  `Und laufen als Kette: ${kette.map(n => n.split(' ')[0]).join(' → ')}`);

ok(run(`lkKachelVonId('hd-kommunikation')`) !== null,
  'Kommunikation & Stakeholder-Management ist dazugekommen – die Skizze hatte keinen Platz dafür');
ok(run(`lkKacheln().filter(k => !lkIstTeilprozess('KONZERN', k)).length`) === 35,
  'Die Karte zeigt 35 Hauptprozesse, der Rest ist darunter eingeordnet');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
