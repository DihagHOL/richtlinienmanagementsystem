/**
 * Den Untertitel gliedern: aus grauem Text werden Unterprozesse.
 *
 * Unter dem Namen einer Kachel steht oft eine Aufzählung – „Marktanalyse ·
 * Zielmärkte · Kundenentwicklung" oder „Mittel verteilen, Investitionen
 * entscheiden". Als grauer Text ist das Beschriftung, keine Struktur: nicht
 * anklickbar, nicht mit einem Modell verknüpfbar, nicht zweimal verwendbar,
 * nicht aufklappbar.
 *
 * Zerlegt wird deshalb auf Wunsch, mit Vorschlag und Bestätigung. Automatisch
 * wäre falsch: „Mittel verteilen, Investitionen entscheiden" sind zwei
 * Prozesse, „Lean, Operational Excellence, KVP" ist einer – das sieht ein
 * Mensch, ein Trennzeichen nicht.
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
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise,
  esc: (s) => String(s ?? ''),
  document: {
    getElementById: (id) => (id in felder ? { value: felder[id], checked: felder[id] } : null),
    querySelector: () => null, querySelectorAll: () => [],
  },
  toast: (t) => gemeldet.push(t),
  openModal: (h) => { felder.__modal = h; }, closeModal: () => {}, canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB'],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
run(`lkSpeichern = async (m, was) => { __verlauf.push(was); };`);
run(`lkKachelOeffnen = () => {};`);
ctx.__verlauf = verlauf;

run(`
_lkDaten = { karten: { KONZERN: { baender: [{ key: 'finanzen', titel: 'Finanzen' }], kacheln: [
  { id: 'kapital', band: 'finanzen', name: 'Kapitalallokation',
    unter: 'Mittel verteilen, Investitionen entscheiden', geltung: ['ALLE'] },
  { id: 'markt', band: 'finanzen', name: 'Markt- u. Geschäftsentwicklung',
    unter: 'Marktanalyse · Zielmärkte · Kundenentwicklung · Business Development', geltung: ['ALLE'] },
  { id: 'lean', band: 'finanzen', name: 'Lean, Operational Excellence, KVP', unter: 'TRIPLE-FIVE', geltung: ['ALLE'] },
  { id: 'zielmaerkte', band: 'finanzen', name: 'Zielmärkte', geltung: ['ALLE'] },
] } } };
_lkWerk = 'KONZERN';
`);

/* ── 1) Der Vorschlag ── */
ok(run(`lkUnterTeile('Marktanalyse · Zielmärkte · Kundenentwicklung').join('|')`)
  === 'Marktanalyse|Zielmärkte|Kundenentwicklung',
  'Ein „·" ist das deutliche Zeichen – daran wird getrennt');
ok(run(`lkUnterTeile('Lean, Operational Excellence, KVP · TRIPLE-FIVE').length`) === 2,
  'Steht ein „·" darin, wird NICHT zusätzlich am Komma getrennt – sonst zerfiele „Lean, Operational Excellence, KVP"');
ok(run(`lkUnterTeile('Mittel verteilen, Investitionen entscheiden').join('|')`)
  === 'Mittel verteilen|Investitionen entscheiden',
  'Ohne „·" auch am Komma – der unsicherste Fall, deshalb mit Rückfrage');
ok(run(`lkUnterTeile('Prüfung; Freigabe').join('|')`) === 'Prüfung|Freigabe', 'Semikolon zählt ebenso');
ok(run(`lkUnterTeile('  Nur ein Satz.  ').join('|')`) === 'Nur ein Satz',
  'Ein einzelner Satz bleibt einer – und verliert nur den Punkt am Ende');
ok(run(`lkUnterTeile('')`).length === 0 && run(`lkUnterTeile(null)`).length === 0, 'Ohne Untertitel nichts');

ok(run(`lkUnterGliederbar(lkKachelVonId('kapital'))`) === true, 'Die Kapitalallokation lässt sich gliedern');
ok(run(`lkUnterGliederbar(lkKachelVonId('lean'))`) === false,
  '„TRIPLE-FIVE" nicht – ein einzelner Zusatz ist keine Aufzählung');
const lk = lies('js/landkarte.js');
ok(/lkUnterGliederbar\(k\) \? `<button/.test(lk),
  'Der Knopf erscheint nur, wo es etwas zu gliedern gibt');

/* ── 2) Gliedern legt Unterprozesse an ── */
felder['lk-gliedern-text'] = 'Mittel verteilen\nInvestitionen entscheiden';
felder['lk-gliedern-leeren'] = true;
await run(`lkGliedernUebernehmen('kapital')`);

const kap = run(`lkKachelVonId('kapital')`);
ok(kap.verweise.length === 2 && kap.verweise.every(v => v.art === 'unterprozess'),
  'Aus zwei Zeilen werden zwei Unterprozesse');
ok(kap.unter === '', 'Der Untertitel ist leer – die Punkte stehen jetzt darunter');
ok(run(`lkUnterprozesse(lkKachelVonId('kapital')).map(v => v.kachel.name).join(' · ')`)
  === 'Mittel verteilen · Investitionen entscheiden',
  'Und sie hängen als Gliederung an ihrem Hauptprozess');
const neu = run(`lkKachelVonName('Mittel verteilen')`);
ok(neu.band === 'finanzen', 'Ein neuer Teilprozess liegt im Band seines Hauptprozesses');
ok(neu.geltung.join('|') === 'ALLE', 'Und erbt dessen Geltungsbereich – alles andere wäre geraten');
ok(Array.isArray(neu.prozesse) && Array.isArray(neu.regelwerke),
  'Er ist eine vollwertige Kachel: Modelle und Regelwerke lassen sich anhängen');
ok(run(`lkIstTeilprozess('KONZERN', lkKachelVonName('Mittel verteilen'))`) === true,
  'Damit ist er einsortiert und steht nicht mehr frei im Band');
ok(/gegliedert: 2 Unterprozess/.test(verlauf.join(' ')), `Der Verlauf hält es fest: „${verlauf[0]}"`);
ok(run(`_lkAufgeklappt.has('KONZERN:kapital')`) === true,
  'Die Kachel ist danach aufgeklappt – man sieht sofort, was entstanden ist');

/* ── 3) Vorhandenes wird verwendet, nicht verdoppelt ──
   Das ist der Kern: ein Prozess wird einmal gepflegt. */
verlauf.length = 0;
felder['lk-gliedern-text'] = 'Marktanalyse\nZielmärkte\nKundenentwicklung';
await run(`lkGliedernUebernehmen('markt')`);
ok(run(`lkKacheln().filter(k => k.name === 'Zielmärkte').length`) === 1,
  '„Zielmärkte" gab es schon – es bleibt bei einer Kachel');
ok(run(`lkUnterprozesse(lkKachelVonId('markt')).some(v => v.kachel.id === 'zielmaerkte')`),
  'Verwendet wird die vorhandene, nicht eine neue mit gleichem Namen');
ok(/vorhandene verwendet/.test(verlauf.join(' ')), 'Und das steht im Verlauf');

/* Zweimal gegliedert ändert nichts mehr. */
const vorher = run(`lkKacheln().length`);
felder['lk-gliedern-text'] = 'Marktanalyse\nZielmärkte\nKundenentwicklung';
await run(`lkGliedernUebernehmen('markt')`);
ok(run(`lkKacheln().length`) === vorher, 'Ein zweiter Durchgang legt nichts doppelt an');
ok(run(`lkUnterprozesse(lkKachelVonId('markt')).length`) === 3, 'Und hängt keine Verweise doppelt an');

/* ── 4) Grenzfälle ── */
gemeldet.length = 0;
felder['lk-gliedern-text'] = '   \n  ';
await run(`lkGliedernUebernehmen('kapital')`);
ok(/mindestens einen Prozess/.test(gemeldet.join(' ')), 'Ohne Zeilen wird nichts angelegt');

felder['lk-gliedern-text'] = 'Kapitalallokation\nEigenkapital';
await run(`lkGliedernUebernehmen('kapital')`);
ok(!run(`lkUnterprozesse(lkKachelVonId('kapital')).some(v => v.kachel.id === 'kapital')`),
  'Ein Prozess wird nicht sein eigener Unterprozess – auch nicht über den Namen');
ok(run(`lkKachelVonName('Eigenkapital')`) !== null, 'Die übrigen Zeilen greifen trotzdem');

ok(run(`lkFreieKachelId('Mittel verteilen')`) !== 'mittel-verteilen',
  'Eine belegte Kennung wird nicht ein zweites Mal vergeben');
ok(run(`lkFreieKachelId('Ganz Neuer Prozess')`) === 'ganz-neuer-prozess',
  'Und eine freie entsteht lesbar aus dem Namen');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
