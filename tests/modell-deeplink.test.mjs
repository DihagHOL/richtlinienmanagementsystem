/**
 * Deep-Link auf ein Modell: ?modell=<Datei-Kennung>.
 *
 * Die Prozessseite der E-Rechnung liest ihre Modelle aus dem RMS und verlinkt
 * zurück („im RMS öffnen"). Der Link muss die Anmeldung überstehen (sonst
 * landet er auf der Startseite), in den Reiter Prozesse führen und dort das
 * Modell öffnen. Und zwar erst, wenn die Liste geladen ist, damit sie sich
 * nicht über die Ansicht zeichnet.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) app.js: Sicherung vor der Anmeldung und Verzweigung ── */
const app = lies('js/app.js');
const sniff = app.match(/if \(\/\[\?&\]\(([^)]*)\)=\/\.test\(location\.search\)\)/);
ok(!!sniff && sniff[1].split('|').includes('modell') && sniff[1].split('|').includes('prozess'),
  'Modell- und Prozess-Link werden vor dem Login-Redirect gesichert');
ok(/params\.get\('modell'\)/.test(app) && /procDeepLink\(modellZiel\)/.test(app), 'applyDeepLinkOrDefault öffnet ?modell= über procDeepLink');
const block = app.slice(app.indexOf("params.get('modell')"));
ok(/canReadTab\('prozesse'\)/.test(block.slice(0, 600)), 'Ohne Leserecht auf „Prozesse" führt der Link nicht ins Leere');

/* ── 2) procDeepLink wartet auf die Liste ── */
const ctx = { console, setTimeout, Date, Promise, String, toast: () => {} };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/prozesse.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
ok(typeof ctx.procDeepLink === 'function', 'procDeepLink ist im globalen Bereich (für app.js)');

run(`globalThis.__geoeffnet = []; openProcessAnsicht = async (id) => { __geoeffnet.push({ id, liste: !!_processes, laedt: _processesLoading }); };`);
run(`_processes = null; _processesLoading = true; _prozModus = 'karte';`);
const warten = run(`procDeepLink('ITEM42')`);
await new Promise(r => setTimeout(r, 200));
ok(ctx.__geoeffnet.length === 0, 'Solange die Liste lädt, wird nichts geöffnet');
run(`_processes = [{ itemId: 'ITEM42' }]; _processesLoading = false;`);
await warten;
ok(ctx.__geoeffnet.length === 1 && ctx.__geoeffnet[0].id === 'ITEM42', 'Danach öffnet er genau das Modell aus dem Link');
ok(ctx.__geoeffnet[0].liste && !ctx.__geoeffnet[0].laedt, 'Zum Zeitpunkt des Öffnens ist die Liste fertig');
ok(run(`_prozModus`) === 'liste', 'Zurück führt in die Modell-Liste, nicht auf die Landkarte');

run(`__geoeffnet = []; _processes = null; _processesLoading = false;`);
await run(`procDeepLink('X', 300)`);
ok(ctx.__geoeffnet.length === 1, 'Lädt die Liste nie, versucht er es nach der Wartezeit trotzdem (Meldung kommt aus der Ansicht)');
await run(`procDeepLink('')`);
ok(ctx.__geoeffnet.length === 1, 'Ohne Kennung passiert nichts');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
