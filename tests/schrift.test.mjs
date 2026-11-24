/**
 * Schrift: Kommt Exo aus dem eigenen Repo, und geht kein Abruf mehr an Google?
 *
 * Anlass: Bis zum 16.11.2026 lud jede Seite die Schrift von Google Fonts. Jeder
 * Aufruf übertrug damit die IP-Adresse der Person an Google, und der Start
 * brauchte zwei fremde Verbindungen. Die Schrift ist frei (SIL Open Font
 * License), sie darf mit der Anwendung ausgeliefert werden, wenn die Lizenz
 * beiliegt.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const css = lies('css/style.css');
const bloecke = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]);
ok(bloecke.length === 2 && bloecke.every(b => /font-family:\s*'Exo'/.test(b)), 'Zwei Schnitte von Exo sind im Stylesheet erklärt: Latein und erweitertes Latein');
ok(bloecke.every(b => /font-weight:\s*100 900/.test(b)), 'Eine Datei je Zeichensatz deckt alle Strichstärken ab');
ok(bloecke.every(b => /font-display:\s*swap/.test(b)), 'Text steht sofort da und wechselt die Schrift, sobald sie geladen ist');
ok(bloecke.every(b => /unicode-range:/.test(b)), 'Jeder Schnitt nennt seine Zeichen: Geladen wird nur, was die Seite braucht');
const dateien = bloecke.map(b => (b.match(/url\('([^']+)'\)/) || [])[1]);
ok(dateien.every(d => d && !/^https?:/.test(d)), 'Die Dateien liegen im eigenen Repo');
for (const d of dateien) {
  const pfad = path.join(ROOT, 'css', d || '');
  const da = fs.existsSync(pfad);
  ok(da && fs.readFileSync(pfad).subarray(0, 4).toString('latin1') === 'wOF2', `${path.basename(d || '?')} ist da und eine WOFF2-Datei`);
}
ok(/SIL Open Font License/.test(lies('assets/fonts/OFL.txt')) && /Exo Project Authors/.test(lies('assets/fonts/OFL.txt')), 'Die Lizenz liegt bei den Dateien, wie sie es verlangt');
ok(/font-family:\s*'Exo', system-ui, sans-serif/.test(css), 'Fehlt die Schrift doch einmal, greift die Systemschrift');

for (const seite of ['index.html', 'ki/index.html']) {
  const html = lies(seite);
  ok(!/fonts\.googleapis|fonts\.gstatic/.test(html), `${seite}: kein Verweis mehr auf Google Fonts, auch nicht in der Sicherheitsrichtlinie`);
  const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  const direktive = (name) => ((csp.split(';').map(x => x.trim()).find(x => x.startsWith(name + ' ')) || '').split(/\s+/).slice(1));
  ok(direktive('font-src').join(' ') === "'self' data:" && !direktive('style-src').some(q => /^https?:/.test(q)),
    `${seite}: Schriften und Stylesheets nur noch aus der eigenen Domain`);
  const hinweis = (html.match(/<link rel="preload" as="font"[^>]*>/) || [])[0] || '';
  ok(/type="font\/woff2"/.test(hinweis) && /\bcrossorigin\b/.test(hinweis), `${seite}: die Schrift wird vorgeladen, mit crossorigin (sonst lädt der Browser sie doppelt)`);
  const ziel = (hinweis.match(/href="([^"]+)"/) || [])[1] || '';
  ok(ziel && fs.existsSync(path.join(ROOT, path.dirname(seite), ziel)), `${seite}: der Hinweis zeigt auf eine Datei, die es gibt`);
}

for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['ki/app.js', 'ki/style.css'])) {
  if (/fonts\.googleapis|fonts\.gstatic/.test(lies(f))) ok(false, `${f}: lädt noch von Google Fonts`);
}
ok(true, 'Kein Skript und kein Stylesheet lädt von Google Fonts');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
