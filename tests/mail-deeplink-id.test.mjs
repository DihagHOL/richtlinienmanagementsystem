/**
 * „Regelwerk nicht gefunden" nach einem Klick in der Mail.
 *
 * Die Meldung behauptete, das Regelwerk sei gelöscht oder archiviert. Wissen
 * konnte sie das nicht – sie stand immer dann da, wenn das Nachschlagen leer
 * blieb. Drei Wege führen dorthin, und keiner heißt „gelöscht":
 *
 *   1. Typ.   Aus der URL kommt die Kennung als Text, gespeicherte Verweise
 *             sind Zahlen. 7 === "7" ist falsch.
 *   2. Laden. bootApp() verschluckt einen Fehler beim ersten Laden bewusst.
 *             Klappt auch der zweite Versuch nicht, ist die Liste leer.
 *   3. Konzept. Konzepte liegen seit der Trennung in State.konzepte und waren
 *             in State.policies nie zu finden.
 *
 * Geladen werden app.js (dort stehen State und die Helfer) und freigaben.js
 * (dort die Entscheidung). Die Stellvertreter werden erst danach gesetzt –
 * Funktionsdeklarationen aus den Dateien würden sie sonst überschreiben.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const panel = { html: '' };
const mount = { set innerHTML(v) { panel.html = v; }, get innerHTML() { return panel.html; } };

const ctx = {
  console, URLSearchParams, setTimeout, clearTimeout,
  document: {
    addEventListener() {},
    getElementById: (id) => (id === 'modal-mount' ? mount : null),
    querySelectorAll: () => [],
  },
  sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
  location: { search: '' },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/app.js'), ctx);          // State, policyZuId, konzeptZuId, esc
vm.runInContext(lies('js/freigaben.js'), ctx);    // einKlickAktion, _ekRegelwerkHolen
const run = (s) => vm.runInContext(s, ctx);

// Stellvertreter NACH dem Laden setzen: Funktionsdeklarationen legen
// Eigenschaften am globalen Objekt an und würden vorher Gesetztes verdrängen.
Object.assign(ctx, {
  toast: () => {},
  closeModal: () => {},
  switchView: async () => {},
  konzeptOeffnen: async () => {},
  focusPolicyCard: () => {},
  getLoginHint: () => '',
  darfMitbestimmung: () => true,
  isCurrentUserPrueferForPolicy: () => true,
  isCurrentUserGeschaeftsleitungForPolicy: () => true,
  reloadData: async () => {},
});
run(`State.user = { upn: 'chef@dihag.com' }; State.konzepte = [];`);

/* ── 1) Typ: Zahl im Speicher, Text im Link ── */
run(`State.policies = [{ id: 7, title: 'KI-Regelwerk', status: 'Freigabe' }];
     State.konzepte = [{ id: '9', title: 'Konzept KI' }];`);
ok(run(`policyZuId('7')`)?.title === 'KI-Regelwerk', 'Kennung „7" aus dem Link findet die gespeicherte Zahl 7');
ok(run(`policyZuId(7)`)?.title === 'KI-Regelwerk', 'Und umgekehrt genauso');
ok(run(`policyZuId('8')`) === null, 'Was es nicht gibt, bleibt null');
ok(run(`konzeptZuId(9)`)?.title === 'Konzept KI', 'Für Konzepte gilt dasselbe');

/* ── 2) Leere Liste heißt nicht „gelöscht" ── */
run(`State.policies = [];`);
let nachgeladen = 0;
ctx.reloadData = async () => {
  nachgeladen++;
  run(`State.policies = [{ id: 7, title: 'KI-Regelwerk', status: 'Entwurf' }];`);
};
panel.html = '';
await run(`einKlickAktion('7','freigeben','tok','chef@dihag.com')`);
ok(nachgeladen === 1, 'Bei leerer Liste wird einmal nachgeladen');
ok(!/nicht gefunden/.test(panel.html), 'Danach steht dort nicht mehr „nicht gefunden"');
ok(/Schon erledigt/.test(panel.html), 'Sondern die Auskunft zum tatsächlichen Status');

/* ── 3) Laden schlägt fehl → sagen, dass nichts gespeichert wurde ── */
run(`State.policies = [];`);
ctx.reloadData = async () => { throw new Error('Netzwerk weg'); };
panel.html = '';
await run(`einKlickAktion('7','freigeben','tok','chef@dihag.com')`);
ok(/konnten nicht geladen werden/.test(panel.html), 'Ladefehler wird als Ladefehler benannt');
ok(/Netzwerk weg/.test(panel.html), 'Mit dem Grund');
ok(/nicht<\/b> gespeichert/.test(panel.html), 'Und mit der Zusage, dass nichts entschieden wurde');
ok(!/gelöscht oder archiviert/.test(panel.html), 'Kein Wort von gelöscht');

/* ── 4) Konzept-Link führt zum Konzept, nicht ins Leere ── */
run(`State.policies = [{ id: 7, title: 'KI-Regelwerk', status: 'Freigabe' }];`);
ctx.reloadData = async () => {};
panel.html = '';
await run(`einKlickAktion('9','freigeben','tok','chef@dihag.com')`);
ok(/noch ein Konzept/.test(panel.html), 'Ein Konzept wird als Konzept erkannt');
ok(/konzeptOeffnen\('9'\)/.test(panel.html), 'Und lässt sich mit einem benannten Aufruf öffnen');
ok(!/typeof/.test(panel.html), 'Kein Programm im onclick-Attribut');
ok(!/gelöscht oder archiviert/.test(panel.html), 'Auch hier kein „gelöscht"');

/* ── 5) Wirklich weg: alte Meldung, aber mit Kennung ── */
panel.html = '';
await run(`einKlickAktion('4711','freigeben','tok','chef@dihag.com')`);
ok(/Regelwerk nicht gefunden/.test(panel.html), 'Was es wirklich nicht gibt, heißt weiter so');
ok(/Kennung aus dem Link:\s*<b>4711<\/b>/.test(panel.html), 'Die Kennung steht dabei – sonst ist der Bericht nicht nachvollziehbar');

/* ── 6) Die Helfer stehen beim State, nicht in der Freigabe-Ansicht ── */
const appjs = lies('js/app.js');
const fg = lies('js/freigaben.js');
ok(/function policyZuId/.test(appjs) && /function konzeptZuId/.test(appjs),
  'Beide Helfer stehen in app.js, wo auch State liegt');
ok(!/function policyZuId/.test(fg), 'Und nicht mehr in freigaben.js');
ok(/darfMitbestimmung\(policyZuId\(deepId\) \|\| \{\}\)/.test(appjs),
  'app.js: Mitbestimmungs-Prüfung geht über den Helfer');
ok(/if \(policyZuId\(deepId\)\) openDetail\(deepId\)/.test(appjs),
  'app.js: Sichtbarkeitsprüfung geht über den Helfer');

/* ── 7) Nur noch EIN Weg, ein Regelwerk zu finden ──
   Vorgefunden wurden vier: strikter Vergleich (35x), händisches String()
   (19x), _policyById() und _plPolicy(). Der strikte ist der gefährliche –
   kommt die Kennung aus einer URL oder aus DatenJson, stimmt der Typ nicht. */
// Das erste Muster forderte `.id ===` unmittelbar benachbart und alles in
// einer Zeile. Damit blieb `String(p.id) === id` unsichtbar – und genau so
// ist probelauf.js durchgerutscht. Jetzt mehrzeilig und beidseitig.
//
// Zwei Klassen, und die zweite ist Absicht:
//   * Dateien, die app.js voraussetzen → policyZuId()/konzeptZuId().
//   * landkarte.js, prozesse.js und verknuepfungen.js werden in Tests einzeln
//     geladen, ohne app.js. Sie kommen an den Helfer nicht heran und schlagen
//     selbst nach – kenntlich am Vorbehalt `typeof State !== 'undefined'`.
// Die zweite Klasse weist sich also selbst aus, statt in einer Liste zu stehen.
// Fällt der Vorbehalt weg, greift die Wache wieder.
const jsDateien = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
const NACHBAU = /State\.(?:policies|konzepte)[\s\S]{0,300}?\.find\([\s\S]{0,160}?\.id\b[\s\S]{0,24}?===[\s\S]{0,20}/g;
const nachbau = [];
for (const f of jsDateien) {
  const quelle = lies('js/' + f);
  for (const t of quelle.matchAll(NACHBAU)) {
    if (/===\s*gesucht/.test(t[0])) continue;                       // die Helfer selbst
    const davor = quelle.slice(Math.max(0, t.index - 200), t.index);
    if (/typeof State !== 'undefined'/.test(davor)) continue;      // bewusst eigenständig
    nachbau.push(f);
  }
}
ok(nachbau.length === 0,
  'Kein selbstgebautes id-Nachschlagen mehr, wo der Helfer erreichbar ist'
  + (nachbau.length ? ' – noch in: ' + [...new Set(nachbau)].join(', ') : ''));

// Gegenprobe: Das Muster muss überhaupt etwas finden können, sonst bewacht es
// nichts. Die drei eigenständigen Dateien sind der Beleg dafür.
const eigenstaendig = jsDateien.filter(f => {
  const quelle = lies('js/' + f);
  return [...quelle.matchAll(NACHBAU)].some(t =>
    /typeof State !== 'undefined'/.test(quelle.slice(Math.max(0, t.index - 200), t.index)));
});
ok(eigenstaendig.length >= 3,
  `Das Muster greift überhaupt – ${eigenstaendig.length} eigenständige Fundstellen: ${eigenstaendig.join(', ')}`);
ok(!/function _policyById/.test(lies('js/admin.js')),
  '_policyById() ist weg – zwei Namen für dieselbe Sache waren das Problem');
ok(/function _plPolicy\(id\) \{ return policyZuId\(id\) \|\| \{\}; \}/.test(lies('js/probelauf.js')),
  '_plPolicy() leitet weiter und behält nur seine eigene Rückgabe-Regel');

/* ── 8) einKlickAktion ist wieder auf Entscheidung reduziert ── */
// Erst nachweisen, dass gemessen wurde. Ohne das ergibt ein Fehltreffer die
// Laenge 1, und `1 < 90` ist gruen, ohne dass je etwas gezaehlt wurde.
const ekTreffer = fg.match(/async function einKlickAktion[\s\S]*?\n}\n/);
ok(!!ekTreffer, 'einKlickAktion ist im Quelltext auffindbar');
const ekLaenge = ekTreffer ? ekTreffer[0].split('\n').length : Infinity;
// Die Eigenschaft, um die es geht – die Länge war dafür nur ein Stellvertreter.
ok(/async function _ekRegelwerkHolen\(id\)/.test(fg), '_ekRegelwerkHolen() trägt die drei Erklärungen');
ok(/const p = await _ekRegelwerkHolen\(id\);/.test(fg),
  'Und einKlickAktion überlässt ihr das Nachschlagen');
// Die Länge bleibt als Abdrift-Melder stehen, mit rundem Wert: Sie soll auffallen,
// wenn die Funktion wieder alles an sich zieht, nicht bei jeder Zeile mahnen.
ok(ekLaenge < 110, `einKlickAktion ist ${ekLaenge} Zeilen lang`);

/* ── 9) konzeptOeffnen() gibt es wirklich ── */
ok(/async function konzeptOeffnen\(id\)/.test(lies('js/konzepte.js')),
  'konzeptOeffnen() steht bei den Konzepten');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
