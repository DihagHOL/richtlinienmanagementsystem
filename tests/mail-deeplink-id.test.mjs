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
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const panel = { html: '' };
const mount = { set innerHTML(v) { panel.html = v; }, get innerHTML() { return panel.html; } };

const ctx = {
  console, esc, URLSearchParams,
  setTimeout, clearTimeout,
  toast: () => {},
  closeModal: () => {},
  switchView: async () => {},
  setAdminMode: () => {},
  focusKonzeptCard: () => {},
  focusPolicyCard: () => {},
  getLoginHint: () => '',
  darfMitbestimmung: () => true,
  isCurrentUserPrueferForPolicy: () => true,
  isCurrentUserGeschaeftsleitungForPolicy: () => true,
  document: { getElementById: (id) => (id === 'modal-mount' ? mount : null) },
  State: { user: { upn: 'chef@dihag.com' }, policies: [], konzepte: [], loaded: false },
  reloadData: async () => {},
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/freigaben.js', 'utf8'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* ── 1) Typ: Zahl im Speicher, Text im Link ── */
ctx.State.policies = [{ id: 7, title: 'KI-Regelwerk', status: 'Freigabe' }];
ctx.State.konzepte = [{ id: '9', title: 'Konzept KI' }];
ok(run(`policyZuId('7')`)?.title === 'KI-Regelwerk', 'Kennung „7" aus dem Link findet die gespeicherte Zahl 7');
ok(run(`policyZuId(7)`)?.title === 'KI-Regelwerk', 'Und umgekehrt genauso');
ok(run(`policyZuId('8')`) === null, 'Was es nicht gibt, bleibt null');
ok(run(`konzeptZuId(9)`)?.title === 'Konzept KI', 'Für Konzepte gilt dasselbe');

/* ── 2) Leere Liste heißt nicht „gelöscht" ── */
ctx.State.policies = [];
let nachgeladen = 0;
ctx.reloadData = async () => { nachgeladen++; ctx.State.policies = [{ id: 7, title: 'KI-Regelwerk', status: 'Entwurf' }]; };
panel.html = '';
await run(`einKlickAktion('7','freigeben','tok','chef@dihag.com')`);
ok(nachgeladen === 1, 'Bei leerer Liste wird einmal nachgeladen');
ok(!/nicht gefunden/.test(panel.html), 'Danach steht dort nicht mehr „nicht gefunden"');
ok(/Schon erledigt/.test(panel.html), 'Sondern die Auskunft zum tatsächlichen Status');

/* ── 3) Laden schlägt fehl → sagen, dass nichts gespeichert wurde ── */
ctx.State.policies = [];
ctx.reloadData = async () => { throw new Error('Netzwerk weg'); };
panel.html = '';
await run(`einKlickAktion('7','freigeben','tok','chef@dihag.com')`);
ok(/konnten nicht geladen werden/.test(panel.html), 'Ladefehler wird als Ladefehler benannt');
ok(/Netzwerk weg/.test(panel.html), 'Mit dem Grund');
ok(/nicht<\/b> gespeichert/.test(panel.html), 'Und mit der Zusage, dass nichts entschieden wurde');
ok(!/gelöscht oder archiviert/.test(panel.html), 'Kein Wort von gelöscht');

/* ── 4) Konzept-Link führt zum Konzept, nicht ins Leere ── */
ctx.State.policies = [{ id: 7, title: 'KI-Regelwerk', status: 'Freigabe' }];
ctx.reloadData = async () => {};
panel.html = '';
await run(`einKlickAktion('9','freigeben','tok','chef@dihag.com')`);
ok(/noch ein Konzept/.test(panel.html), 'Ein Konzept wird als Konzept erkannt');
ok(/Konzept öffnen/.test(panel.html), 'Und lässt sich von dort öffnen');
ok(!/gelöscht oder archiviert/.test(panel.html), 'Auch hier kein „gelöscht"');

/* ── 5) Wirklich weg: alte Meldung, aber mit Kennung ── */
panel.html = '';
await run(`einKlickAktion('4711','freigeben','tok','chef@dihag.com')`);
ok(/Regelwerk nicht gefunden/.test(panel.html), 'Was es wirklich nicht gibt, heißt weiter so');
ok(/Kennung aus dem Link:\s*<b>4711<\/b>/.test(panel.html), 'Die Kennung steht dabei – sonst ist der Bericht nicht nachvollziehbar');

/* ── 6) Derselbe Vergleich auch im Deep-Link ── */
const appjs = fs.readFileSync(ROOT + '/js/app.js', 'utf8');
ok(/String\(x\.id\) === String\(deepId\)/.test(appjs), 'app.js: Mitbestimmungs-Prüfung vergleicht als Text');
ok(/String\(p\.id\) === String\(deepId\)/.test(appjs), 'app.js: Sichtbarkeitsprüfung vergleicht als Text');
ok(!/State\.policies\.find\(x => x\.id === deepId\)/.test(appjs), 'Der strikte Vergleich ist raus');

const fg = fs.readFileSync(ROOT + '/js/freigaben.js', 'utf8');
ok(/function policyZuId/.test(fg) && /function konzeptZuId/.test(fg), 'Beide Helfer stehen an einer Stelle');
ok(/const p = policyZuId\(id\);/.test(fg), 'handleMailAction nutzt ihn ebenfalls');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
