/**
 * Gemeinsame Helfer (js/util.js) und der Nachweis, dass es keine Kopien mehr gibt.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { fileExt, officeScheme, fmtFileSize, fileIcon } = require(ROOT + '/js/util.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

/* ── Dateiendung ── */
ok(fileExt('Bericht.DOCX') === 'docx', 'Endung wird klein geschrieben');
ok(fileExt('a.b.c.pdf') === 'pdf', 'Nur die letzte Endung zählt');
ok(fileExt('ohneEndung') === '', 'Ohne Punkt: leere Endung');
ok(fileExt(null) === '' && fileExt(undefined) === '', 'null/undefined stürzen nicht ab');

/* ── Office-Schema ── */
ok(officeScheme('Regelwerk.docx') === 'ms-word', 'docx → Word');
ok(officeScheme('Liste.xlsx') === 'ms-excel', 'xlsx → Excel');
ok(officeScheme('Folien.pptx') === 'ms-powerpoint', 'pptx → PowerPoint');
ok(officeScheme('Handbuch.pdf') === null, 'PDF hat kein Office-Schema');
ok(officeScheme(null) === null, 'null → kein Schema (vorher Absturzrisiko)');
ok(officeScheme('Alt.DOC') === 'ms-word' && officeScheme('Makro.xlsm') === 'ms-excel', 'Alt- und Makroformate erkannt');

/* ── Dateigröße ── */
ok(fmtFileSize(0) === '–' && fmtFileSize(undefined) === '–', 'Unbekannte Größe als „–"');
ok(fmtFileSize(512) === '512 B', 'Bytes');
ok(fmtFileSize(2048) === '2 KB', 'Kilobytes');
ok(fmtFileSize(3 * 1024 * 1024) === '3.0 MB', 'Megabytes mit einer Dezimalstelle');

/* ── Datei-Icon ── */
ok(fileIcon('x.pdf') === '📕' && fileIcon('x.docx') === '📘' && fileIcon('x.xlsx') === '📗' && fileIcon('x.pptx') === '📙',
  'Office- und PDF-Symbole');
ok(fileIcon('bild.png') === '🖼️' && fileIcon('archiv.zip') === '🗜️' && fileIcon('notiz.txt') === '📃',
  'Bild-, Archiv- und Textsymbole (vorher nur in einer der beiden Kopien)');
ok(fileIcon('unbekannt.xyz') === '📄', 'Rückfall auf ein neutrales Symbol');

/* ── Keine Kopien mehr in den Ansichten ── */
const dateien = ['admin', 'governance', 'ismsdocs', 'konzepte', 'proposals'];
const kopien = [];
for (const d of dateien) {
  const s = fs.readFileSync(`${ROOT}/js/${d}.js`, 'utf8');
  for (const alt of ['_policyOfficeScheme', '_govOfficeScheme', '_ismsOfficeScheme', '_govFmtSize', '_ismsFmtSize', '_govIcon', '_ismsIcon'])
    if (s.includes(alt)) kopien.push(`${d}.js: ${alt}`);
}
ok(kopien.length === 0, 'Keine dreifachen Kopien mehr' + (kopien.length ? ': ' + kopien.join(', ') : ''));

/* ── util.js wird zuerst geladen (sonst sind die Helfer beim Start nicht da) ── */
const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
const reihenfolge = [...html.matchAll(/<script src="js\/([a-z-]+)\.js/g)].map(m => m[1]);
ok(reihenfolge.includes('util'), 'util.js ist in index.html eingebunden');
ok(reihenfolge.indexOf('util') === 0, `util.js steht vor allen anderen (ist an Position ${reihenfolge.indexOf('util') + 1})`);
for (const d of dateien)
  ok(reihenfolge.indexOf('util') < reihenfolge.indexOf(d), `util.js lädt vor ${d}.js`);

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
