#!/usr/bin/env node
/**
 * Statische Smoketests für RMS + KI-Dashboard
 * ===========================================
 * Läuft ohne Browser/Login (Node 20, keine Dependencies) und prüft die
 * Fehlerklassen, die bei dieser statischen MSAL/Graph-SPA am häufigsten
 * auftreten:
 *
 *   1. SYNTAX     – node --check über alle JS/MJS-Dateien
 *   2. BUNDLES    – alle in index.html referenzierten Skripte/CSS existieren
 *   3. HANDLERS   – jeder Inline-Handler (onclick/oninput/…) ruft eine real
 *                   definierte Funktion auf (fängt tote Referenzen nach
 *                   Umbenennen/Entfernen – der Klassiker bei Inline-Handlern)
 *   4. CONFIG     – Felder, die das KI-Dashboard aus access-config liest,
 *                   werden im RMS-Admin auch gepflegt (Cross-File-Konsistenz)
 *
 * NICHT abgedeckt (braucht echten Login + SharePoint): Auth/SSO, Graph-Reads,
 * Speichern, Mailversand. Dafür gibt es die manuelle Checkliste in
 * docs/SMOKETESTS.md.
 *
 * Aufruf:  node scripts/smoketest.mjs        (Exit 0 = grün, 1 = Fehler)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let passed = 0;
const ok   = (m) => { passed++; console.log('   \x1b[32m✓\x1b[0m ' + m); };
const fail = (m) => { failures.push(m); console.log('   \x1b[31m✗ ' + m + '\x1b[0m'); };
const head = (m) => console.log('\n\x1b[1m' + m + '\x1b[0m');
const rd   = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

// JS-/Handler-Identifier, die keine App-Funktionen sind (Keywords + Built-ins)
const IGNORE = new Set([
  'if','for','while','switch','catch','return','typeof','void','new','do','else',
  'function','await','delete','in','instanceof','yield','throw','case',
  'confirm','alert','prompt','parseInt','parseFloat','isNaN','isFinite',
  'Number','String','Boolean','Array','Object','Date','Math','JSON','RegExp',
  'Map','Set','Promise','setTimeout','setInterval','clearTimeout','clearInterval',
  'encodeURIComponent','decodeURIComponent','fetch','btoa','atob','structuredClone',
  'requestAnimationFrame','URLSearchParams','URL','Error',
]);

function listFiles(dir, ext) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter(f => f.endsWith(ext)).map(f => `${dir}/${f}`);
}

/* ── 1. Syntax ──────────────────────────────────────────────────── */
head('1. Syntax (node --check)');
const allJs = [...listFiles('js', '.js'), ...listFiles('ki', '.js'), ...listFiles('scripts', '.mjs')];
for (const f of allJs) {
  try { execSync(`node --check "${path.join(root, f)}"`, { stdio: 'pipe' }); ok(f); }
  catch (e) { fail(`Syntax-Fehler in ${f}: ${(e.stderr || e.stdout || '').toString().split('\n').find(Boolean)}`); }
}

/* ── HTML parsen: lokale Scripts + Stylesheets ──────────────────── */
function parseHtml(htmlRel) {
  const html = rd(htmlRel);
  const dir = path.dirname(htmlRel);
  const norm = (s) => path.normalize(path.join(dir, s.split('?')[0])).replace(/\\/g, '/');
  const scripts = [...html.matchAll(/<script\s+[^>]*src="([^"]+)"/g)]
    .map(m => m[1]).filter(s => !/^https?:/.test(s)).map(norm);
  const styles = [...html.matchAll(/<link\b[^>]*>/g)]
    .filter(t => /rel="stylesheet"/.test(t[0]))
    .map(t => (t[0].match(/href="([^"]+)"/) || [])[1])
    .filter(h => h && !/^https?:/.test(h)).map(norm);
  return { html, htmlRel, scripts, styles };
}

/* Definierte globale Namen (function / const|let|var / window.x=) aus Dateien. */
function collectDefined(files) {
  const names = new Set();
  for (const f of files) {
    const src = rd(f);
    for (const m of src.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
    for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  }
  return names;
}

/* Freistehende Funktionsaufrufe in einem Handler-Wert (ohne ${…}-Interpolation,
   ohne Methodenaufrufe wie .focus()). */
function callsIn(val) {
  const cleaned = val.replace(/\$\{[^{}]*\}/g, ' ');
  return [...cleaned.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
}

/* Alle Inline-Handler (doppelt-quotiert) aus einem Dateiinhalt. */
function handlersIn(src) {
  return [...src.matchAll(/\bon[a-z]+\s*=\s*"([^"]*)"/g)].map(m => m[1]);
}

/* ── 2.+3. Pro Seite: Bundle-Integrität + Handler-Referenzen ────── */
const PAGES = [
  { name: 'RMS (index.html)', html: 'index.html' },
  { name: 'KI-Dashboard (ki/index.html)', html: 'ki/index.html' },
];

for (const page of PAGES) {
  head(`2. Bundle-Integrität – ${page.name}`);
  if (!exists(page.html)) { fail(`HTML fehlt: ${page.html}`); continue; }
  const { html, scripts, styles } = parseHtml(page.html);

  for (const s of [...scripts, ...styles]) {
    if (exists(s)) ok(`referenziert & vorhanden: ${s}`);
    else fail(`${page.html} referenziert fehlende Datei: ${s}`);
  }

  head(`3. Inline-Handler → definierte Funktion – ${page.name}`);
  const bundle = scripts.filter(s => s.endsWith('.js') && exists(s));
  const defined = collectDefined(bundle);
  // Handler aus dem HTML + aus den Template-Strings der Bundle-JS
  const sources = [{ file: page.html, src: html },
                   ...bundle.map(f => ({ file: f, src: rd(f) }))];
  const unknown = new Map();   // ident -> Set(dateien)
  for (const { file, src } of sources) {
    for (const h of handlersIn(src)) {
      for (const id of callsIn(h)) {
        if (IGNORE.has(id) || defined.has(id)) continue;
        if (!unknown.has(id)) unknown.set(id, new Set());
        unknown.get(id).add(file);
      }
    }
  }
  if (unknown.size === 0) ok(`alle Handler-Aufrufe aufgelöst (${defined.size} Funktionen im Bundle)`);
  else for (const [id, files] of unknown) fail(`unbekannte Funktion "${id}()" referenziert in: ${[...files].join(', ')}`);
}

/* ── 4. access-config Cross-File-Konsistenz ─────────────────────── */
head('4. access-config – Felder konsistent RMS ↔ KI-Dashboard');
const adminSrc = exists('js/admin.js') ? rd('js/admin.js') : '';
const kiSrc    = exists('ki/app.js')   ? rd('ki/app.js')   : '';
// Felder, die das KI-Dashboard liest → müssen im RMS-Admin pflegbar/erwähnt sein
for (const key of ['kiGenehmiger', 'kiGenehmigerRollen']) {
  if (kiSrc.includes(key) && adminSrc.includes(key)) ok(`${key}: wird im KI-Dashboard gelesen und im RMS gepflegt`);
  else if (kiSrc.includes(key)) fail(`${key}: vom KI-Dashboard gelesen, aber im RMS-Admin nicht gepflegt`);
}
// Felder, die das KI-Dashboard selbst schreibt → müssen dort gelesen werden
for (const key of ['kiGenehmigungsmodus', 'kiMailBeiEinreichung', 'kiMailBeiEntscheidung', 'kiMailDomains']) {
  const writes = kiSrc.includes(key);
  if (writes) ok(`${key}: im KI-Dashboard vorhanden`);
  else fail(`${key}: erwartetes KI-Einstellungsfeld fehlt in ki/app.js`);
}

/* ── Ergebnis ───────────────────────────────────────────────────── */
console.log(`\n${'─'.repeat(54)}`);
if (failures.length === 0) {
  console.log(`\x1b[32m\x1b[1m✓ Smoketests bestanden\x1b[0m – ${passed} Prüfungen grün.`);
  process.exit(0);
} else {
  console.log(`\x1b[31m\x1b[1m✗ ${failures.length} Fehler\x1b[0m (${passed} grün):`);
  failures.forEach(f => console.log('   • ' + f));
  process.exit(1);
}
