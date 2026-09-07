#!/usr/bin/env node
/**
 * Typprüfung ohne Typen, ohne Build
 * =================================
 * `tsc --checkJs` liest gewöhnliches JavaScript und meldet, was ein Prüfer
 * sehen kann, ohne dass eine Zeile umgeschrieben wird: falsche Argumentzahl,
 * Tippfehler in Namen, Zugriffe auf Eigenschaften, die es nicht gibt.
 *
 * **Warum verkettet statt Datei für Datei:** Sechzehn Dateien tragen am Ende
 * ein `module.exports` – für die Tests. TypeScript hält sie deshalb für
 * CommonJS-Module mit eigenem Gültigkeitsbereich, und schon kennt
 * `verknuepfungen.js` die Namen aus `prozesse.js` nicht mehr. Das ergab 369
 * Meldungen „Cannot find name", die alle nichts bedeuteten.
 *
 * Im Browser teilen sich alle Skripte **einen** globalen Bereich. Eine
 * Verkettung in Ladereihenfolge ist deshalb nicht ein Trick, sondern das
 * genauere Modell. Die Zeilennummern werden anschließend zurückgerechnet.
 *
 * Ausführen:
 *   node scripts/typpruefung.mjs              nur die harten Befunde (CI)
 *   node scripts/typpruefung.mjs --alle       alles, auch das Rauschen
 *   node scripts/typpruefung.mjs --liste      welche Fehlerarten es gibt
 *
 * Ohne installiertes TypeScript endet der Lauf mit einem Hinweis und Rückgabe
 * 0 – die Prüfung ist eine Zugabe und darf keinen Build blockieren, nur weil
 * ein Werkzeug fehlt.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const alle = argv.includes('--alle');
const nurListe = argv.includes('--liste');

const C = process.env.NO_COLOR ? {} : { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', d: '\x1b[2m', x: '\x1b[0m' };
const c = (k, s) => (C[k] || '') + s + (C.x || '');

/**
 * Fehlerarten, die hier zählen.
 *
 * Bewusst eine kurze Liste: Sie enthält, was in ungetyptem JavaScript
 * verlässlich ein echter Fehler ist – nicht, was ein strenger Prüfer alles
 * bemängeln könnte. TS2554 steht zuerst, weil genau das der Fehler war, der
 * diese Prüfung angestoßen hat: `lkVerweiseVon(k)` gegen `lkVerweiseVon(k, werk)`.
 */
const HART = {
  TS2554: 'falsche Argumentzahl',
  TS2551: 'Name existiert nicht – Vorschlag vorhanden',
  TS2552: 'Name existiert nicht – Vorschlag vorhanden',
  TS2362: 'Rechnen mit etwas, das keine Zahl ist',
  TS2363: 'Rechnen mit etwas, das keine Zahl ist',
  TS2365: 'Operator passt nicht zu den Seiten',
  TS2488: 'kein iterierbarer Wert (for…of / Spread)',
  TS2493: 'Zugriff hinter das Ende eines Tupels',
  TS1005: 'Syntax',
  TS1064: 'Syntax',
  TS1128: 'Syntax',
};

/* ── Ladereihenfolge aus index.html + js/module.js ── */
function dateienInLadereihenfolge() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const kern = [...html.matchAll(/src="js\/([a-z-]+)\.js/g)].map(m => m[1]);
  let nach = [];
  const mp = path.join(ROOT, 'js/module.js');
  if (fs.existsSync(mp)) {
    const ctx = { module: { exports: {} }, document: { querySelector: () => null }, Map, Promise };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(mp, 'utf8'), ctx);
    const e = ctx.module.exports || {};
    nach = [...new Set(Object.values(e.MODUL_ANSICHTEN || {}).flat())];
  }
  return [...new Set([...kern, ...nach])].filter(n => fs.existsSync(path.join(ROOT, `js/${n}.js`)));
}

/* ── Verketten und die Zeilen merken ── */
function bauen(namen) {
  let text = '', zeile = 1;
  const karte = [];   // { ab, bis, datei }
  for (const n of namen) {
    // 'use strict' fliegt raus: mehrfach im selben Bereich ist es sinnlos, und
    // die Zeile bleibt als Leerzeile stehen, damit die Nummern stimmen.
    const s = fs.readFileSync(path.join(ROOT, `js/${n}.js`), 'utf8')
      .split('\r\n').join('\n')
      .replace(/^'use strict';$/m, '');
    const zeilen = s.split('\n').length;
    karte.push({ ab: zeile, bis: zeile + zeilen - 1, datei: `js/${n}.js` });
    text += s + '\n';
    zeile += zeilen;
  }
  return { text, karte };
}

const zuDatei = (karte, z) => {
  const t = karte.find(k => z >= k.ab && z <= k.bis);
  return t ? `${t.datei}:${z - t.ab + 1}` : `?:${z}`;
};

/* ── tsc finden ──
   Das JS-Startskript, nicht der .bin-Wrapper: Der braucht auf Windows eine
   Shell, und die stolpert dann ueber Schraegstriche im Pfad. */
function tscPfad() {
  const p = path.join(ROOT, 'node_modules/typescript/bin/tsc');
  return fs.existsSync(p) ? p : null;
}

const namen = dateienInLadereihenfolge();
const { text, karte } = bauen(namen);
const tmp = path.join(os.tmpdir(), `rms-typpruefung-${process.pid}.js`);
fs.writeFileSync(tmp, text, 'utf8');

const tsc = tscPfad();
if (!tsc) {
  console.log(c('y', '⚠ TypeScript ist nicht installiert – Typprüfung übersprungen.'));
  console.log(c('d', '   npm install --no-save typescript   und noch einmal starten.'));
  fs.unlinkSync(tmp);
  process.exit(0);
}

const res = spawnSync(process.execPath, [tsc, '--noEmit', '--allowJs', '--checkJs', '--target', 'es2022',
  // dom.iterable gehoert dazu: Ohne sie gilt eine NodeList als nicht
  // iterierbar, und `for (const el of document.querySelectorAll(...))` waere
  // vier Mal ein Fehler, den es im Browser nicht gibt.
  '--lib', 'es2022,dom,dom.iterable', '--noImplicitAny', 'false', '--strict', 'false',
  ...(fs.existsSync(path.join(ROOT, 'types/globale.d.ts')) ? [path.join(ROOT, 'types/globale.d.ts')] : []),
  tmp],
  { encoding: 'utf8' });

fs.unlinkSync(tmp);

// Das \r vor dem Umbruch muss weg: `$` träfe sonst nie das Zeilenende, und die
// Auswertung bliebe still leer – genau so ging der erste Versuch aus.
const zeilen = ((res.stdout || '') + (res.stderr || '')).split('\n').map(l => l.replace(/\r$/, ''))
  .map(l => l.match(/\((\d+),(\d+)\): error (TS\d+): (.*)$/))
  .filter(Boolean)
  .map(m => ({ zeile: +m[1], spalte: +m[2], code: m[3], text: m[4] }));

console.log(c('b', `\nTypprüfung – ${namen.length} Dateien, ${text.split('\n').length} Zeilen verkettet\n`));

if (nurListe) {
  const nach = new Map();
  for (const f of zeilen) nach.set(f.code, (nach.get(f.code) || 0) + 1);
  [...nach].sort((a, b) => b[1] - a[1]).forEach(([code, n]) =>
    console.log(`  ${String(n).padStart(4)}  ${code}${HART[code] ? c('r', '  ← zählt: ' + HART[code]) : c('d', '  (Rauschen)')}`));
  process.exit(0);
}

const gemeldet = alle ? zeilen : zeilen.filter(f => HART[f.code]);
for (const f of gemeldet) {
  console.log(`  ${c('r', '✗')} ${zuDatei(karte, f.zeile)}  ${c('d', f.code)}  ${f.text}`);
}

const rauschen = zeilen.length - zeilen.filter(f => HART[f.code]).length;
console.log('\n' + '─'.repeat(54));
if (!gemeldet.length) {
  console.log(c('g', c('b', '✓ Keine harten Befunde')) + c('d', ` – ${rauschen} weitere Hinweise (--alle zeigt sie)`));
  process.exit(0);
}
console.log(c('r', c('b', `✗ ${gemeldet.length} Befund(e)`)) + c('d', ` – ${rauschen} weitere Hinweise (--alle)`));
process.exit(alle ? 0 : 1);
