/**
 * Wächter für die Anrede.
 *
 * Die Oberfläche siezt. Das war lange uneinheitlich – Texte aus verschiedenen
 * Ausbaustufen duzten, andere siezten. Dieser Test findet Du-Formen in allen
 * Dateien mit Anwendertexten, damit sich das nicht wieder einschleicht.
 *
 * Ausgenommen sind Code-Bezeichner, in denen „dir" für „direction" steht.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const DATEIEN = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
  .concat(['index.html']);

/* „dir" ist auch eine Sortierrichtung – solche Stellen sind kein Duzen. */
const CODE = /(\.dir\b|\bdir\s*[:=<>*)\],;]|[-(]dir\b|dir\s*\?)/;
const DU = /\b(Du|du|Dir|dir|Dich|dich|Dein|dein|Deine|deine|Deiner|deiner|Deinen|deinen|Deinem|deinem|Deines|deines)\b/;

let treffer = 0;
for (const datei of DATEIEN) {
  const zeilen = fs.readFileSync(path.join(ROOT, datei), 'utf8').split('\n');
  zeilen.forEach((zeile, i) => {
    if (!DU.test(zeile)) return;
    if (CODE.test(zeile)) return;                       // Sortierrichtung, kein Anwendertext
    treffer++;
    console.log(`  ✗ ${datei}:${i + 1} – ${zeile.trim().slice(0, 110)}`);
  });
}
ok(treffer === 0, `Kein Duzen in der Oberfläche (${treffer} Fundstellen)`);

/* Stichproben: die wichtigsten Stellen sollen wirklich siezen. */
const proben = [
  ['js/tour.js', /wartet auf Sie/, 'Die Führung wartet „auf Sie"'],
  ['js/tour.js', /bis Sie ihn wirklich ausgeführt haben/, 'Und siezt in der Begrüßung'],
  ['js/freigaben.js', /Sie sind weder als Prüfer/, 'Der Hinweis in den Freigaben siezt'],
  ['js/anleitung.js', /Suchen Sie sich den Abschnitt/, 'Die Anleitung siezt'],
  ['js/app.js', /Nachweis per Mail an Sie gesendet/, 'Die Meldungen siezen'],
  ['js/admin.js', /wer: 'Sie'/, 'Die Zuständigkeiten im Dashboard stehen auf „Sie"'],
];
for (const [datei, muster, text] of proben)
  ok(muster.test(fs.readFileSync(path.join(ROOT, datei), 'utf8')), text);

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
