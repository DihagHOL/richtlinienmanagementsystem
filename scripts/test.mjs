#!/usr/bin/env node
/**
 * Test-Runner für das Regelwerk-Management
 * ========================================
 * Führt den Smoketest (Bundle-Integrität + Inline-Handler) und anschließend
 * alle Tests aus `tests/*.test.mjs` aus. Jeder Test läuft in einem eigenen
 * Node-Prozess (Isolation) und meldet über den Exit-Code grün/rot.
 *
 *   node scripts/test.mjs            alle Tests
 *   node scripts/test.mjs konzept    nur Tests, deren Name „konzept" enthält
 *   node scripts/test.mjs -v         Ausgabe der Einzelprüfungen anzeigen
 *
 * Läuft ohne Abhängigkeiten (nur Node ≥ 18) – auch in der GitHub Action.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = path.join(ROOT, 'tests');

const argv = process.argv.slice(2);
const verbose = argv.includes('-v') || argv.includes('--verbose');
const filter = argv.filter(a => !a.startsWith('-'))[0] || '';

const C = process.env.NO_COLOR ? {} : {
  g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', d: '\x1b[2m', x: '\x1b[0m',
};
const c = (k, s) => (C[k] || '') + s + (C.x || '');

/** Zahl der grünen/roten Prüfungen aus der Zusammenfassungszeile lesen. */
function parseCounts(out) {
  const m = out.match(/(\d+)\s*(?:grün|gruen)[^\d]*(\d+)\s*rot/i);
  return m ? { ok: +m[1], bad: +m[2] } : null;
}

function run(label, file, args = []) {
  const res = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', cwd: ROOT });
  const out = (res.stdout || '') + (res.stderr || '');
  const counts = parseCounts(out);
  const passed = res.status === 0;
  const detail = counts ? `${counts.ok} Prüfungen` : (passed ? 'bestanden' : 'fehlgeschlagen');
  console.log(`  ${passed ? c('g', '✓') : c('r', '✗')} ${label.padEnd(34)} ${c('d', detail)}`);
  if (verbose || !passed) {
    const lines = out.trimEnd().split('\n');
    // Bei Fehlern reicht der relevante Ausschnitt; mit -v alles.
    const show = verbose ? lines : lines.filter(l => /✗|XX |Error|error:/i.test(l)).slice(0, 25);
    show.forEach(l => console.log('      ' + c('d', l)));
  }
  return { passed, ok: counts ? counts.ok : (passed ? 1 : 0), bad: counts ? counts.bad : (passed ? 0 : 1) };
}

console.log(c('b', '\n▶ Regelwerk-Management – Testlauf') + (filter ? c('d', `  (Filter: ${filter})`) : ''));

const results = [];

// 1) Smoketest (Bundle + Inline-Handler) – nur ohne Filter bzw. bei passendem Filter
if (!filter || 'smoketest'.includes(filter.toLowerCase())) {
  console.log(c('b', '\nSmoketest'));
  results.push(run('Bundle & Inline-Handler', path.join(ROOT, 'scripts', 'smoketest.mjs')));
}

// 2) Unit-/Integrationstests aus tests/
let files = [];
try {
  files = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.test.mjs')).sort();
} catch {
  console.log(c('y', '\n  (kein tests/-Verzeichnis gefunden)'));
}
if (filter) files = files.filter(f => f.toLowerCase().includes(filter.toLowerCase()));

if (files.length) {
  console.log(c('b', '\nTests'));
  for (const f of files) {
    results.push(run(f.replace(/\.test\.mjs$/, ''), path.join(TESTS_DIR, f)));
  }
}

const totalOk = results.reduce((a, r) => a + r.ok, 0);
const totalBad = results.reduce((a, r) => a + r.bad, 0);
const failed = results.filter(r => !r.passed).length;

console.log('\n' + '─'.repeat(54));
if (failed === 0 && results.length) {
  console.log(c('g', c('b', `✓ Alles grün`)) + c('d', ` – ${results.length} Suiten, ${totalOk} Prüfungen`));
  process.exit(0);
} else if (!results.length) {
  console.log(c('y', '⚠ Keine Tests ausgeführt (Filter zu eng?)'));
  process.exit(1);
} else {
  console.log(c('r', c('b', `✗ ${failed} Suite(n) fehlgeschlagen`)) + c('d', ` – ${totalOk} grün, ${totalBad} rot`));
  process.exit(1);
}
