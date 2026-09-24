/**
 * Text aus SharePoint bleibt Text – die Funde der innerHTML-Durchsicht.
 *
 * Geprüft wurden alle Template-Strings mit HTML (TypeScript-Parser, Werte bis
 * zu ihrer Belegung und über Funktionsparameter bis zu den Aufrufern verfolgt).
 * Drei Stellen setzten Daten roh ein, dazu kam eine ganze Klasse:
 *   - ki/app.js fmtDate() gab bei einem ungültigen Datum den Rohtext zurück,
 *   - ki/app.js zeigte „Auto-Renewal" ungeprüft,
 *   - js/assets.js setzte das Symbol eigener Asset-Kategorien roh ein,
 *   - Links: esc() schützt das Attribut, aber nicht vor „javascript:…".
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { sichereUrl } = require(ROOT + '/js/util.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── 1) sichereUrl ── */
ok(sichereUrl('https://dihag.sharepoint.com/sites/ISMS/x.docx') === 'https://dihag.sharepoint.com/sites/ISMS/x.docx', 'https bleibt');
ok(sichereUrl('http://intranet/x') === 'http://intranet/x', 'http bleibt');
ok(sichereUrl('mailto:isms@dihag.com') === 'mailto:isms@dihag.com', 'mailto bleibt');
ok(sichereUrl('ms-word:ofe|u|https://dihag.sharepoint.com/x.docx').startsWith('ms-word:'), 'Office-Protokolle bleiben');
ok(sichereUrl('?ansicht=risiken&risiko=4') === '?ansicht=risiken&risiko=4' && sichereUrl('#') === '#', 'Relative Adressen bleiben');
ok(sichereUrl('javascript:alert(document.domain)') === '#', 'javascript: wird zu #');
ok(sichereUrl('  JavaScript:alert(1)') === '#', '… auch mit Großbuchstaben und Leerraum davor');
ok(sichereUrl('java\tscript:alert(1)') === '#' && sichereUrl('java\nscript:alert(1)') === '#', '… auch mit Tab oder Zeilenumbruch mitten im Schema (der Browser überspringt sie)');
ok(sichereUrl('data:text/html,<script>alert(1)</script>') === '#', 'data: wird zu #');
ok(sichereUrl('vbscript:msgbox(1)') === '#', 'vbscript: wird zu #');
ok(sichereUrl(null) === '' && sichereUrl(undefined) === '', 'nichts bleibt nichts');

/* ── 2) KI-Dashboard: fmtDate escapt, was kein Datum ist ── */
const ki = lies('ki/app.js');
const kctx = { Date, String, isNaN };
kctx.globalThis = kctx;
vm.createContext(kctx);
vm.runInContext(ki.slice(ki.indexOf('function esc(s)'), ki.indexOf('/**', ki.indexOf('function esc(s)'))), kctx);
vm.runInContext(ki.slice(ki.indexOf('function fmtDate(s)'), ki.indexOf('function fmtEuro')), kctx);
const boese = '<img src=x onerror=alert(1)>';
ok(vm.runInContext(`fmtDate(${JSON.stringify(boese)})`, kctx) === '&lt;img src=x onerror=alert(1)&gt;',
  'fmtDate: Text statt Datum kommt escapt zurück, nicht roh');
ok(vm.runInContext("fmtDate('2026-03-05T10:00:00Z')", kctx) === '05.03.2026', 'Ein echtes Datum wie gehabt');
ok(/\$\{esc\(f\[COL\.autoRenewal\] \|\| '–'\)\}/.test(ki), '„Auto-Renewal" wird escapt');
ok(/function sichereUrl\(u\)/.test(ki) && /href="\$\{esc\(sichereUrl\(att\.url \|\| '#'\)\)\}"/.test(ki),
  'Anhänge im KI-Dashboard: Link über sichereUrl()');

/* ── 3) Assetregister: das Symbol eigener Kategorien ── */
const assets = lies('js/assets.js');
ok(!/\$\{k\.symbol\}/.test(assets) && (assets.match(/\$\{esc\(k\.symbol\)\}/g) || []).length === 3,
  'Das Symbol einer Kategorie aus den Einstellungen wird an allen drei Stellen escapt');

/* ── 4) Links im RMS: DokumentUrl ist ein freies Textfeld ── */
const app = lies('js/app.js');
ok(/href="\$\{esc\(sichereUrl\(p\.dokumentUrl\)\)\}"/.test(app), 'Der Dokument-Link eines Regelwerks läuft über sichereUrl()');
ok(/href="\$\{esc\(sichereUrl\(t\.url\)\)\}"/.test(lies('js/vorfaelle.js')), 'Ebenso der Link eines Tickets');
ok(/href="\$\{esc\(sichereUrl\(b\.url\)\)\}"/.test(lies('js/wissen.js')), 'Und der eines Wissen-Beitrags');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
