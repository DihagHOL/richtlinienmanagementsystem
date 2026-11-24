/**
 * Drucken: Regeln für die App selbst (Strg+P) und für die Berichts-Fenster.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const css = fs.readFileSync(ROOT + '/css/style.css', 'utf8');
/** Den @media-print-Block aus der App-CSS herausschneiden. */
const block = (() => {
  const i = css.indexOf('@media print');
  if (i < 0) return '';
  let tiefe = 0, j = css.indexOf('{', i);
  for (let k = j; k < css.length; k++) {
    if (css[k] === '{') tiefe++;
    else if (css[k] === '}') { tiefe--; if (tiefe === 0) return css.slice(i, k + 1); }
  }
  return css.slice(i);
})();

/* ── 1) App-Druck: Bedienelemente raus ── */
ok(block.length > 0, '@media print in der App-CSS vorhanden');
for (const sel of ['.sidebar', '.view-toolbar', '.skip-link', '#toast-c', '#modal-mount', '.btn', '.search-box', '.sort-select', '.gov-tree'])
  ok(block.includes(sel), `Wird beim Drucken ausgeblendet: ${sel}`);

/* ── 2) Inhalt über die volle Breite, nur die aktive Ansicht ── */
ok(/\.main[^{]*\{[^}]*max-width:\s*none/.test(block), 'Inhalt nutzt die ganze Seitenbreite');
ok(/\.view\s*\{\s*display:\s*none/.test(block) && /\.view\.active\s*\{\s*display:\s*block/.test(block),
  'Nur die aktive Ansicht wird gedruckt');
ok(/\.gov-layout\s*\{\s*display:\s*block/.test(block), 'Governance-Zweispalter wird zum Fließtext');

/* ── 3) Saubere Seitenumbrüche ── */
ok(/\.item-card[^{]*\{[^}]*break-inside:\s*avoid/.test(block), 'Karten werden nicht zerschnitten');
ok(/thead\s*\{\s*display:\s*table-header-group/.test(block), 'Tabellenkopf wiederholt sich je Seite');
ok(/break-after:\s*avoid/.test(block), 'Überschriften bleiben bei ihrem Absatz');
ok(/page-break-inside/.test(block), 'Ältere Browser werden mit page-break-* bedient');
ok(/\.table-wrap[^{]*\{[^}]*overflow:\s*visible/.test(block), 'Scroll-Container wird beim Drucken aufgelöst');
ok(/@page\s*\{[^}]*margin/.test(css), 'Seitenrand ist gesetzt');

/* ── 4) Berichts-Fenster (eigenes HTML) ── */
const berichte = {
  'abdeckung.js': 'IMS-Abdeckung',
  'clevelreport.js': 'C-Level-Bericht',
  'dokumentation.js': 'Benutzerhandbuch',
  'risiken.js': 'Risiko-Report',
  'soa.js': 'SoA',
};
for (const [datei, name] of Object.entries(berichte)) {
  const s = fs.readFileSync(`${ROOT}/js/${datei}`, 'utf8');
  ok(/@media print\{[^}]*\.noprint\{display:none\}/.test(s), `${name}: Bedienelemente raus`);
  ok(/thead\{display:table-header-group\}/.test(s), `${name}: Tabellenkopf je Seite`);
  ok(/break-inside:avoid/.test(s), `${name}: keine zerschnittenen Zeilen/Überschriften`);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
