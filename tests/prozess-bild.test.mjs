/**
 * Prozesse als Bild: PNG und SVG, in Modellansicht und Modeler.
 *
 * Ein .bpmn kann außerhalb des Modelers niemand öffnen. Für E-Mail, Teams und
 * Folien braucht es ein Bild: PNG, doppelt aufgelöst, auf weißem Grund und in
 * den Farben der Ansicht. Sehr große Diagramme werden so weit verkleinert,
 * dass der Browser sie noch zeichnet (sonst bleibt das Bild leer).
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { jsArg } = require('../js/util.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split(String.fromCharCode(13)).join('');

/* ══ 1) Auflösung ══ */
console.log('Auflösung');
const ctx = { console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent, jsArg,
  esc: (s) => String(s ?? ''), document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null }, localStorage: { getItem: () => null, setItem() {} } };
ctx.window = ctx; ctx.globalThis = ctx; ctx.module = undefined;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/prozesse.js'), ctx);
const skala = vm.runInContext('procPngSkala', ctx);
ok(skala(1200, 600) === 2 && skala(1200, 600, 3) === 3, 'Normale Diagramme: doppelt (oder wie gewünscht) aufgelöst');
ok(Math.round(skala(9000, 800) * 9000) === 12000, 'Sehr breit: höchstens 12.000 Punkte je Seite');
const s = skala(8000, 7000);
ok(8000 * s * 7000 * s <= 80e6 + 1 && s < 2, 'Sehr groß: höchstens 80 Millionen Punkte insgesamt');

/* ══ 2) SVG → PNG ══ */
console.log('SVG als PNG');
let leinwand = null, gemalt = null;
ctx.DOMParser = class { parseFromString(t) { const attr = (n) => { const m = String(t).match(new RegExp(n + '="([^"]*)"')); return m ? m[1] : null; };
  return { documentElement: { getAttribute: attr } }; } };
ctx.Image = class { decode() { return Promise.resolve(); } };
ctx.document.createElement = (tag) => {
  leinwand = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage: (b, x, y, w, h) => { gemalt = { w, h, src: b.src }; } }),
    toBlob: (fn, typ) => fn({ typ, groesse: leinwand.width * leinwand.height }) };
  return leinwand;
};
const png = await vm.runInContext(`procSvgAlsPng('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300" viewBox="0 0 640 300"><rect/></svg>')`, ctx);
ok(png.typ === 'image/png' && leinwand.width === 1280 && leinwand.height === 600 && gemalt.w === 1280, 'Doppelte Auflösung, als PNG');
ok(/^data:image\/svg\+xml;charset=utf-8,/.test(gemalt.src), 'Gezeichnet wird das SVG selbst');
await vm.runInContext(`procSvgAlsPng('<svg viewBox="0 0 500 200"></svg>')`, ctx);
ok(leinwand.width === 1000 && leinwand.height === 400, 'Ohne width/height zählt die viewBox');
let fehler = '';
try { await vm.runInContext(`procSvgAlsPng('<svg></svg>')`, ctx); } catch (e) { fehler = e.message; }
ok(/keine Größe/.test(fehler), 'Ohne Größe eine klare Meldung statt eines leeren Bildes');

/* ══ 3) Knöpfe und Doku ══ */
console.log('Knöpfe');
const P = lies('js/prozesse.js');
ok(/onclick="procAnsichtAktion\('png'\)"[^>]*>🖼 PNG<\/button>/.test(P) && /onclick="procAnsichtAktion\('svg'\)"[^>]*>SVG<\/button>/.test(P), 'Modellansicht: „🖼 PNG" und „SVG"');
ok(/else if \(act === 'png'\) _procAnsichtBild\('png'\);/.test(P), 'Die Ansicht kennt die Aktion');
ok(/onclick="downloadProcessPng\(\)"[^>]*>⬇ PNG<\/button>/.test(P) && /onclick="downloadProcessSvg\(\)"[^>]*>⬇ SVG<\/button>/.test(P), 'Modeler: „⬇ PNG" und „⬇ SVG"');
ok(/procSvgAlsPng\(_procSvgFaerben\(svg\)\)/.test(P) && /procSvgAlsPng\(farbig\)/.test(P), 'Beide PNG in den Farben der Ansicht');
ok(/„🖼 PNG"/.test(lies('js/dokumentation.js')) && /„⬇ PNG"/.test(lies('js/dokumentation.js')), 'Die Dokumentation nennt beide');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
