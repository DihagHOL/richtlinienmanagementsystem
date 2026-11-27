/**
 * Suchfelder behalten beim Tippen den Fokus.
 *
 * Viele Reiter zeichnen bei jedem Zeichen die ganze Ansicht neu, das Suchfeld
 * eingeschlossen. Ohne mitFokus endete die Eingabe nach dem ersten Buchstaben
 * (gemeldet für Assetregister und Risiko-Register, betroffen waren zehn Reiter).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

/* ── 1) Der Helfer ── */
let aktiv = null;
const feld = (id, wert) => ({ id, value: wert, selectionStart: 0, selectionEnd: 0,
  focus() { aktiv = this; }, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } });
let dom = { 'x-suche': feld('x-suche', 'S') };
globalThis.document = { getElementById: (id) => dom[id] || null, get activeElement() { return aktiv; } };
const { mitFokus } = require(ROOT + '/js/util.js');

aktiv = dom['x-suche']; aktiv.selectionStart = aktiv.selectionEnd = 1;
let gezeichnet = 0;
mitFokus('x-suche', () => { gezeichnet++; dom = { 'x-suche': feld('x-suche', 'S') }; });
ok(gezeichnet === 1 && aktiv === dom['x-suche'] && aktiv.selectionStart === 1 && aktiv.selectionEnd === 1, 'Nach dem Neuzeichnen hat das neue Suchfeld den Fokus, die Schreibmarke steht hinter dem Buchstaben');
aktiv = null;
mitFokus('x-suche', () => { dom = { 'x-suche': feld('x-suche', '') }; });
ok(aktiv === null, 'Hatte das Feld keinen Fokus, holt der Helfer ihn auch nicht');
aktiv = dom['x-suche'];
mitFokus('x-suche', () => { dom = {}; });
ok(true, 'Verschwindet das Feld beim Neuzeichnen, passiert nichts');

/* ── 2) Kein Suchfeld zeichnet seine Ansicht mehr ohne den Helfer neu ── */
// Diese beiden zeichnen nur ihre Liste neu, nicht das Feld.
const NUR_LISTE = ['renderFreigabeAudit', '_renderProcCards'];
const funde = [];
for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js'))) {
  const s = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  for (const m of s.matchAll(/oninput="[^"]*?\b(render[A-Z]\w*|_render\w+)\(\)"/g)) if (!NUR_LISTE.includes(m[1])) funde.push(`${f}: ${m[1]}`);
}
ok(funde.length === 0, 'Jedes Suchfeld, das die ganze Ansicht neu zeichnet, läuft über mitFokus' + (funde.length ? ': ' + funde.join(', ') : ''));
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
ok(/id="am-suche" oninput="_amFilter\.q=this\.value;mitFokus\('am-suche',renderAssets\)"/.test(lies('js/assets.js'))
  && /id="risk-suche" oninput="_riskFilter\.q=this\.value;mitFokus\('risk-suche',renderRisiken\)"/.test(lies('js/risiken.js')), 'Assetregister und Risiko-Register, wo es auffiel');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
