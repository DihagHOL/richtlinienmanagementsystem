/**
 * Vorladen: Holt der Browser den Kern gleichzeitig statt nacheinander?
 *
 * Anlass (gemessen am 16.11.2026 auf rms.dihag.de): Die Sicherheitsrichtlinie
 * steht als <meta> in der Seite. Chrome schaltet dann sein vorausschauendes
 * Laden ab. Die acht Kern-Skripte kamen deshalb einzeln nacheinander, jedes
 * wartete auf das vorige, zusammen rund 1,4 Sekunden bei jedem Aufruf mit
 * kaltem oder abgelaufenem Cache.
 *
 * <link rel="preload"> im Kopf startet alle Abrufe sofort. Das wirkt nur, wenn
 * die Adresse des Hinweises der des Tags aufs Zeichen gleicht, samt `?v=`.
 * Weicht sie ab, lädt der Browser die Datei zweimal und warnt in der Konsole.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { versionenSetzen } from '../scripts/cache-version.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

/** Was eine Seite vorlädt und was sie einbindet. */
function lesen(html) {
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map(t => t[0]);
  const attr = (tag, name) => (tag.match(new RegExp(name + '="([^"]+)"')) || [])[1] || '';
  const vor = links.filter(t => /rel="preload"/.test(t)).map(t => ({ als: attr(t, 'as'), ziel: attr(t, 'href') }));
  const skripte = [...html.matchAll(/<script\s+[^>]*src="([^"]+)"/g)].map(m => m[1]);
  const stile = links.filter(t => /rel="stylesheet"/.test(t)).map(t => attr(t, 'href')).filter(h => !/^https?:/.test(h));
  return { vor, skripte, stile };
}

for (const seite of ['index.html', 'ki/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, seite), 'utf8');
  const { vor, skripte, stile } = lesen(html);
  const vorSkript = vor.filter(v => v.als === 'script').map(v => v.ziel);
  const vorStil = vor.filter(v => v.als === 'style').map(v => v.ziel);

  // Das erste Skript im Kopf (Rahmenschutz) erreicht der Parser ohnehin sofort.
  const erwartet = skripte.filter(s => !/rahmenschutz\.js/.test(s));
  ok(erwartet.length > 0 && erwartet.every(s => vorSkript.includes(s)),
    `${seite}: jedes Skript der Seite wird vorgeladen` + (erwartet.every(s => vorSkript.includes(s)) ? '' : ' – fehlt: ' + erwartet.filter(s => !vorSkript.includes(s)).join(', ')));
  ok(vorSkript.every(z => skripte.includes(z)),
    `${seite}: kein Hinweis ohne passendes Skript` + (vorSkript.every(z => skripte.includes(z)) ? '' : ' – verwaist: ' + vorSkript.filter(z => !skripte.includes(z)).join(', ')));
  ok(stile.every(s => vorStil.includes(s)) && vorStil.every(z => stile.includes(z)),
    `${seite}: die eigenen Stylesheets werden vorgeladen, Adresse gleich`);
  ok(vor.every(v => v.als), `${seite}: jeder Hinweis nennt seine Art (as=…), sonst verwirft ihn der Browser`);
  ok(vor.every(v => !/^https?:/.test(v.ziel)), `${seite}: vorgeladen wird nur Eigenes`);
  ok(html.indexOf('rel="preload"') > html.indexOf('Content-Security-Policy'),
    `${seite}: die Hinweise stehen hinter der Sicherheitsrichtlinie`);
  // Nach dem Tag mit src suchen: In den Kommentaren der Seite steht „<script>" als Wort.
  ok(html.indexOf('rel="preload"') < html.search(/<script\s+[^>]*src=/),
    `${seite}: und vor dem ersten Skript, das den Parser anhält`);
  for (const v of vor) {
    const datei = path.join(ROOT, path.dirname(seite), v.ziel.replace(/\?.*$/, ''));
    ok(fs.existsSync(datei), `${seite}: ${v.ziel.replace(/\?.*$/, '')} gibt es`);
  }
}

/* Das Cache-Busting schreibt Hinweis und Tag im selben Lauf um. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vorladen-'));
const legen = (p, s) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), s); };
legen('js/app.js', 'const APP = 1;\n');
legen('js/module.js', 'const MODUL_VERSIONEN = {};\n');
legen('css/style.css', 'body {}\n');
legen('index.html', [
  '<link rel="preload" as="style" href="css/style.css?v=alt"/>',
  '<link rel="preload" as="script" href="js/module.js?v=alt"/>',
  '<link rel="preload" as="script" href="js/app.js?v=alt"/>',
  '<link rel="stylesheet" href="css/style.css?v=alt"/>',
  '<script src="js/module.js?v=alt"></script>',
  '<script src="js/app.js?v=alt"></script>',
].join('\n'));
legen('ki/index.html', '<script src="../js/app.js?v=alt"></script>\n');
const tabelle = versionenSetzen(tmp);
const nachher = lesen(fs.readFileSync(path.join(tmp, 'index.html'), 'utf8'));
ok(nachher.skripte.every(s => nachher.vor.some(v => v.ziel === s)) && !/\?v=alt/.test(fs.readFileSync(path.join(tmp, 'index.html'), 'utf8')),
  'Nach dem Cache-Busting tragen Hinweis und Tag dieselbe neue Prüfsumme');
ok(Object.keys(tabelle).length === 0,
  'Ein Hinweis macht aus einer Kerndatei kein nachladbares Modul: Die Tabelle bleibt leer');
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
