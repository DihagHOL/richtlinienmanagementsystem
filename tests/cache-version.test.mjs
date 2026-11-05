/**
 * Version je Datei: Holt der Browser nach einem Push nur, was sich geändert hat?
 *
 * Anlass: Jeder Push gab allen Dateien den neuen Commit-SHA als `?v=`. Der
 * Browser lud damit nach jedem Deploy auch alles Unveränderte neu.
 *
 * Der Test baut einen kleinen Baum im Temp-Ordner und lässt das Skript darauf
 * laufen. Der Baum im Repo bleibt unberührt, die Tabelle dort schreibt der Bot.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { versionenSetzen, pruefsumme } from '../scripts/cache-version.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-version-'));
const legen = (p, s) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), s); };
const lies = (p) => fs.readFileSync(path.join(tmp, p), 'utf8');
const version = (seite, ziel) => (lies(seite).match(new RegExp(`"${ziel.replace(/[.]/g, '[.]')}\\?v=([A-Za-z0-9]+)"`)) || [])[1];
const tabelle = () => JSON.parse(lies('js/module.js').match(/const MODUL_VERSIONEN = (\{[^}]*\});/)[1]);

legen('js/app.js', 'const APP = 1;\n');
legen('js/module.js', "const MODUL_KERN = ['app'];\nconst MODUL_VERSIONEN = {};\n");
legen('js/risiken.js', 'function risiken() {}\n');
legen('js/notfall.js', 'function notfall() {}\n');
legen('css/style.css', 'body {}\n');
legen('ki/style.css', 'main {}\n');
legen('ki/app.js', 'const KI = 1;\n');
legen('index.html', [
  '<link rel="stylesheet" href="css/style.css?v=alt"/>',
  '<script src="vendor/msal.min.js"></script>',
  '<script src="js/module.js?v=alt"></script>',
  '<script src="js/app.js?v=alt"></script>',
  '<a href="https://example.com/x.js?v=fremd">x</a>',
].join('\n'));
legen('ki/index.html', [
  '<link rel="stylesheet" href="../css/style.css?v=alt"/>',
  '<link rel="stylesheet" href="style.css?v=alt"/>',
  '<script src="app.js?v=alt"></script>',
].join('\n'));

const erste = versionenSetzen(tmp);

ok(Object.keys(erste).join() === 'notfall,risiken', 'Die Tabelle nennt genau die Dateien ohne Tag in der Seite');
ok(erste.risiken === pruefsumme(path.join(tmp, 'js/risiken.js')) && erste.risiken !== erste.notfall,
  'Jede Datei trägt die Prüfsumme ihres eigenen Inhalts');
ok(tabelle().risiken === erste.risiken, 'Die Tabelle steht in js/module.js');
ok(version('index.html', 'js/app.js') === pruefsumme(path.join(tmp, 'js/app.js')), 'Die Tags in der Seite tragen dieselbe Prüfsumme');
ok(version('index.html', 'js/module.js') === pruefsumme(path.join(tmp, 'js/module.js')),
  'js/module.js wird erst nach dem Eintragen der Tabelle gezählt');
ok(version('ki/index.html', '../css/style.css') === version('index.html', 'css/style.css'),
  'Relative Pfade im KI-Dashboard führen zur selben Datei');
ok(version('ki/index.html', 'app.js') === pruefsumme(path.join(tmp, 'ki/app.js')), 'ki/app.js ist nicht js/app.js');
ok(!/vendor\/msal\.min\.js\?v=/.test(lies('index.html')), 'Wer keinen Parameter trägt, bekommt auch keinen');
ok(/x\.js\?v=fremd/.test(lies('index.html')), 'Fremde Adressen bleiben unberührt');

const vorher = { html: lies('index.html'), ki: lies('ki/index.html'), lader: lies('js/module.js') };
versionenSetzen(tmp);
ok(lies('index.html') === vorher.html && lies('js/module.js') === vorher.lader, 'Ein zweiter Lauf ändert nichts');

/* Die eigentliche Zusicherung */
legen('js/risiken.js', 'function risiken() { return 2; }\n');
versionenSetzen(tmp);
ok(tabelle().risiken !== erste.risiken, 'Ändert sich eine Datei, ändert sich ihre Adresse');
ok(tabelle().notfall === erste.notfall, 'Die Nachbardatei behält ihre');
ok(version('index.html', 'js/app.js') === pruefsumme(path.join(tmp, 'js/app.js')) && lies('ki/index.html') === vorher.ki,
  'Kern und KI-Dashboard bleiben unverändert');
ok(lies('js/module.js') !== vorher.lader && version('index.html', 'js/module.js') !== (vorher.html.match(/js\/module\.js\?v=(\w+)/) || [])[1],
  'Nur der Lader bekommt mit der neuen Tabelle eine neue Adresse');

legen('js/lf.js', 'a\nb\n');
legen('js/crlf.js', 'a\r\nb\r\n');
ok(pruefsumme(path.join(tmp, 'js/lf.js')) === pruefsumme(path.join(tmp, 'js/crlf.js')),
  'Zeilenenden zählen nicht: Windows und die Action rechnen gleich');

legen('js/module.js', 'const MODUL_KERN = [];\n');
let gemerkt = false;
try { versionenSetzen(tmp); } catch (e) { gemerkt = /MODUL_VERSIONEN/.test(e.message); }
ok(gemerkt, 'Fehlt die Tabelle im Lader, bricht das Skript ab statt still nichts zu schreiben');

fs.rmSync(tmp, { recursive: true, force: true });

/* Die Verdrahtung im Repo */
const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/cache-bust.yml'), 'utf8');
ok(wf.indexOf('const APP_VERSION') < wf.indexOf('node scripts/cache-version.mjs') && wf.includes('node scripts/cache-version.mjs'),
  'Die Action setzt erst die Build-Nummer: Sonst stimmte die Prüfsumme von js/app.js nicht');
ok(/git add [^\n]*js\/module\.js/.test(wf), 'und committet die Tabelle mit');
ok(!/sed[^\n]*\?v=/.test(wf), 'Der alte Ersatz durch den Commit-SHA ist weg');
ok(/const MODUL_VERSIONEN = \{[^}]*\};/.test(fs.readFileSync(path.join(ROOT, 'js/module.js'), 'utf8')),
  'Die Tabelle steht im echten Lader so, wie das Skript sie sucht');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
