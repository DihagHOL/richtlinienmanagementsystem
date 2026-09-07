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
import vm from 'vm';

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

/* Die Modulkarte aus js/module.js lesen – sie ist die einzige Quelle dafür,
   welche Datei zu welcher Ansicht gehört. Ausgeführt statt geparst: Die Datei
   setzt die Gruppen mit concat() zusammen, ein Regex bekäme das nicht mit. */
function modulKarte() {
  if (!exists('js/module.js')) return null;
  const ctx = { module: { exports: {} }, document: { querySelector: () => null }, Map, Promise };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(rd('js/module.js'), ctx);
  const e = ctx.module.exports;
  return (e && e.MODUL_KERN) ? { kern: e.MODUL_KERN, ansichten: e.MODUL_ANSICHTEN } : null;
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

  // Das Cache-Busting ersetzt nur VORHANDENE ?v=…-Parameter (cache-bust.yml).
  // Ein Skript ohne Parameter bekommt daher nie eine neue Version – Browser
  // halten ewig die alte Datei fest. Genau das ist schon passiert.
  const ohneVersion = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)]
    .map(m => m[1]).filter(u => !/\?v=/.test(u));
  if (!ohneVersion.length) ok('alle eigenen Skripte/Stile tragen einen ?v=-Parameter');
  else ohneVersion.forEach(u => fail(`ohne ?v=-Parameter – das Cache-Busting greift hier nicht: ${u}`));

  head(`3. Inline-Handler → definierte Funktion – ${page.name}`);
  // Seit dem Nachladen stehen nicht mehr alle Skripte als Tag in der Seite.
  // Das Bundle ist deshalb: die Tags PLUS alles, was js/module.js je Ansicht
  // nachlädt. Fehlte eine Datei hier, fiele sie aus jeder Prüfung heraus.
  // Die Karte gilt nur fuer die RMS-Seite. Das KI-Dashboard hat ein eigenes
  // Bundle mit eigenem js/app.js – seine Dateien hier hineinzumischen erzeugte
  // Fehler, die es gar nicht gibt (und verdeckte echte).
  const karte = (page.html === 'index.html') ? modulKarte() : null;
  const nachgeladen = karte ? [...new Set(Object.values(karte.ansichten).flat())].map(n => `js/${n}.js`) : [];
  const bundle = [...new Set([...scripts.filter(s => s.endsWith('.js')), ...nachgeladen])].filter(exists);
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


  /* ── 3c. Nachladen: löst jeder Handler gegen die Module SEINER Ansicht auf? ──
     Die Prüfung oben fragt gegen alle Dateien zusammen – das war richtig,
     solange alle als Tag in der Seite standen. Beim Nachladen zählt eine
     schärfere Frage: Ist die Funktion da, wenn der Knopf sichtbar wird?
     Genau daran hing „Änderung vorschlagen" in der Detailansicht. */
  if (karte && page.html === 'index.html') {
    head(`3c. Nachladen – Handler je Ansicht – ${page.name}`);
    const kernDateien = karte.kern.map(n => `js/${n}.js`).filter(exists);
    const satzFuer = (view) => collectDefined(
      [...kernDateien, ...(karte.ansichten[view] || []).map(n => `js/${n}.js`)].filter(exists));

    // Jede Datei der Karte muss es geben. Als Tag stand sie frueher in der
    // Seite und wurde von Pruefung 2 mitgeprueft; jetzt steht ihr Name nur noch
    // in js/module.js, und ein Tippfehler dort faellt sonst erst im Browser auf.
    const fehlende = [...new Set(Object.values(karte.ansichten).flat())].filter(n => !exists(`js/${n}.js`));
    if (!fehlende.length) ok(`alle ${[...new Set(Object.values(karte.ansichten).flat())].length} nachladbaren Module vorhanden`);
    else fehlende.forEach(n => fail(`js/module.js nennt ein Modul, das es nicht gibt: js/${n}.js`));

    // Der Lader liest seine Version aus dem app.js-Tag. Traegt der keine, holt
    // er die Dateien ohne ?v= – und der Browser haelt ewig die alte Fassung.
    if (/js\/app\.js\?v=[A-Za-z0-9]+/.test(html)) ok('der Lader findet eine Version am app.js-Tag');
    else fail('js/app.js traegt kein ?v= – nachgeladene Module bekaemen keine Version');

    // Kein Modul darf zweimal in derselben Gruppe stehen.
    const doppelteGruppe = Object.entries(karte.ansichten)
      .filter(([, n]) => new Set(n).size !== n.length).map(([v]) => v);
    if (!doppelteGruppe.length) ok('keine Ansicht nennt ein Modul doppelt');
    else doppelteGruppe.forEach(v => fail(`Ansicht "${v}" nennt ein Modul mehrfach`));

    let fehler = 0;
    const pruefe = (view, quelle, src) => {
      const da = satzFuer(view);
      for (const h of handlersIn(src)) {
        for (const id of callsIn(h)) {
          if (IGNORE.has(id) || da.has(id)) continue;
          if (!defined.has(id)) continue;   // Tippfehler meldet schon Prüfung 3
          fail(`Ansicht „${view}": ${id}() ist beim Zeichnen noch nicht geladen (aus ${quelle})`);
          fehler++;
        }
      }
    };

    // a) Die Abschnitte der index.html – jeder gehört genau einer Ansicht.
    const teile = html.split(/<section id="view-/).slice(1);
    for (const t of teile) {
      const view = (t.match(/^([a-z]+)"/) || [])[1];
      if (!view || !(view in karte.ansichten)) continue;
      pruefe(view, `index.html §${view}`, t);
    }

    // b) Jede nachgeladene Datei gegen JEDE Ansicht, die sie lädt. Eine Datei,
    //    die in zwei Gruppen steht, muss in beiden vollständig bedienbar sein.
    for (const [view, namen] of Object.entries(karte.ansichten)) {
      for (const n of namen) {
        const f = `js/${n}.js`;
        if (exists(f)) pruefe(view, f, rd(f));
      }
    }
    if (!fehler) ok(`alle Handler je Ansicht auflösbar (${Object.keys(karte.ansichten).length} Ansichten geprüft)`);

    // c) Was die Seite anfangs lädt – die Zahl, um die es ging.
    const kernKb = Math.round(kernDateien.reduce((a, f) => a + fs.statSync(path.join(root, f)).size, 0) / 1024);
    const alleKb = Math.round([...new Set([...kernDateien, ...nachgeladen])].filter(exists)
      .reduce((a, f) => a + fs.statSync(path.join(root, f)).size, 0) / 1024);
    if (kernKb < alleKb / 2) ok(`Erstladung ${kernKb} KB statt ${alleKb} KB (${Math.round(100 - kernKb / alleKb * 100)} % weniger)`);
    else fail(`Erstladung ${kernKb} KB von ${alleKb} KB – das Nachladen bringt kaum noch etwas`);
  }

  /* Alle Skripte teilen einen globalen Scope. Ein Name, der zweimal per
     function/let/const deklariert wird, ist bei let/const ein SyntaxError und
     legt die GANZE App still – typischer Fehler beim Aufteilen von Dateien. */
  head(`3b. Keine doppelten Deklarationen – ${page.name}`);
  const wo = new Map();   // Name -> [Datei:Zeile, …]
  for (const f of bundle) {
    rd(f).split('\n').forEach((line, i) => {
      const m = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)
             || line.match(/^(?:const|let)\s+([A-Za-z_$][\w$]*)/);
      if (m) (wo.get(m[1]) || wo.set(m[1], []).get(m[1])).push(`${f}:${i + 1}`);
    });
  }
  const doppelt = [...wo].filter(([, orte]) => orte.length > 1);
  if (doppelt.length === 0) ok(`${wo.size} Top-Level-Namen, alle eindeutig`);
  else for (const [name, orte] of doppelt) fail(`"${name}" mehrfach deklariert: ${orte.join(' · ')}`);
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
