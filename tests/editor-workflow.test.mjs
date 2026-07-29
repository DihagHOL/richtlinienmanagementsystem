import fs from 'fs';
import vm from 'vm';

import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const admin = fs.readFileSync(ROOT + '/js/admin.js', 'utf8');

const sandbox = {
  console,
  esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  toast: () => {},
  document: { getElementById: () => null },
  MITBESTIMMUNG_WERKE: ['SHB','WGC','SCH','EIS','DSO','ZAI','LEG','MEG','EWA'],
  getPruefer: () => ['pruefer@dihag.com'],
  getKonformSchwelle: () => 'einer',
  getGeschaeftsleitung: () => ['pruefer@dihag.com'],
  getFreigabeSchwelle: () => 'einer',
  getKbrMail: () => 'kbr@dihag.com',
  getBrMails: () => ({}),
  State: { policies: [] },
  __renderCount: 0,
  __results: [],
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(admin, sandbox);

// Alle Assertions im selben Kontext ausführen (teilen die let-Bindings _editing/_edSecOpen)
const test = `
  renderPolicyEditor = () => { __renderCount++; };
  const ok = (c, m) => __results.push([!!c, m]);

  _editing = newPolicy();
  let html = renderWorkflowSections();
  ok(_editing.freigabeReihenfolge === 'gl_mb', 'Default-Reihenfolge = gl_mb');
  const iPruef = html.indexOf('Konformitätsprüfung');
  const iFrei = html.indexOf('Freigabe (Geschäftsleitung)');
  const iMit = html.indexOf('Mitbestimmung (Betriebsverfassung)');
  ok(iPruef >= 0 && iFrei >= 0 && iMit >= 0, 'Alle drei Abschnitte vorhanden');
  ok(iPruef < iFrei && iFrei < iMit, 'Standard: Pruefung < Freigabe < Mitbestimmung');

  edSwapWorkflowOrder();
  ok(_editing.freigabeReihenfolge === 'mb_gl', 'Nach Tausch = mb_gl');
  ok(__renderCount === 1, 'Tausch loest genau ein Re-Render aus');
  html = renderWorkflowSections();
  ok(html.indexOf('Konformitätsprüfung') < html.indexOf('Mitbestimmung (Betriebsverfassung)') &&
     html.indexOf('Mitbestimmung (Betriebsverfassung)') < html.indexOf('Freigabe (Geschäftsleitung)'),
     'Getauscht: Pruefung < Mitbestimmung < Freigabe');

  _editing = newPolicy();
  _edSecOpen = { pruef:false, frei:false, mit:false };
  html = renderWorkflowSections();
  ok(!html.includes('Prüfer (E-Mails'), 'Eingeklappt: Pruefer-Feld nicht gerendert');
  edToggleSection('pruef');
  ok(_edSecOpen.pruef === true, 'Toggle setzt pruef=open');
  html = renderWorkflowSections();
  ok(html.includes('Prüfer (E-Mails'), 'Ausgeklappt: Pruefer-Feld gerendert');

  _editing = newPolicy();
  html = renderWorkflowSections();
  ok(html.includes('>global<'), 'Badge global bei leerer Pruefer-Konfig');
  ok(html.includes('nicht betroffen'), 'Badge nicht betroffen bei Mitbestimmung leer');
  _editing.pruefKonfig.pruefer = ['a@dihag.com','b@dihag.com'];
  _editing.kbrBetroffen = true;
  _editing.mitbestimmungWerke = ['SHB','EIS'];
  html = renderWorkflowSections();
  ok(html.includes('2 eigene Prüfer'), 'Badge zaehlt eigene Pruefer');
  ok(html.includes('KBR · 2 Werke'), 'Badge zeigt KBR und 2 Werke');
`;
vm.runInContext(test, sandbox);

let pass = 0, fail = 0;
for (const [c, m] of sandbox.__results) { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } }
// Statische Titel-Checks
const t1 = admin.includes("'Regelwerk bearbeiten'") && admin.includes("'Neues Regelwerk'");
const t2 = !/Richtlinie bearbeiten|Neue Richtlinie/.test(admin);
if (t1) { pass++; console.log('  ✓ Editor-Titel = Regelwerk'); } else { fail++; console.log('  ✗ Editor-Titel = Regelwerk'); }
if (t2) { pass++; console.log('  ✓ Keine alten Titel mehr'); } else { fail++; console.log('  ✗ Keine alten Titel mehr'); }

console.log(`\n${fail? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
