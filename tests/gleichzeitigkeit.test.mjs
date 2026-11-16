/**
 * Gleichzeitigkeits-Schutz (Lost Update): Erkennt, wenn ein Regelwerk
 * zwischenzeitlich von jemand anderem gespeichert wurde.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_DATEIEN = ['admin.js', 'freigaben.js', 'einstellungen.js'];   // admin.js wurde aufgeteilt

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

/* Steuerbare Stubs: was liefert SharePoint, was antwortet der Nutzer? */
const stub = { meta: null, antwort: true, confirmText: '', confirmOpts: null, reloaded: 0, toasts: [] };

const ctx = {
  console, esc,
  fmtDate: () => '01.03.2026', fmtDateTime: () => '02.03.2026 09:30',
  toast: (m) => stub.toasts.push(m),
  canWriteTab: () => true, isReadOnlyTab: () => false,
  emptyState: (t) => t, workflowBadge: () => '',
  openModal: () => {}, closeModal: () => {},
  document: { getElementById: () => null, querySelector: () => null },
  State: { policies: [], konzepte: [], user: { upn: 'anna@dihag.com', name: 'Anna' } },
  spGetPolicyMeta: async () => stub.meta,
  uiConfirm: async (text, opts) => { stub.confirmText = text; stub.confirmOpts = opts; return stub.antwort; },
  refreshAll: () => { stub.reloaded++; },
  renderAdminList: () => {},
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/util.js', 'utf8'), ctx);   // gemeinsame Helfer
ADMIN_DATEIEN.forEach(f => vm.runInContext(fs.readFileSync(ROOT + '/js/' + f, 'utf8'), ctx));

const P = (mod) => ({ id: '1', title: 'Test', modifiedAt: mod });
const check = (p, aktion) => vm.runInContext('pruefeFremdaenderung', ctx)(p, aktion);
const reset = () => { stub.confirmText = ''; stub.confirmOpts = null; stub.reloaded = 0; stub.toasts = []; };

/* ── 1) Unverändert → keine Rückfrage ── */
reset();
stub.meta = { modifiedAt: '2026-03-01T10:00:00Z', modifiedBy: 'Bernd' };
ok(await check(P('2026-03-01T10:00:00Z')) === true, 'Unverändert: darf speichern');
ok(stub.confirmText === '', 'Unverändert: keine Rückfrage');

/* ── 2) Fremdänderung → Rückfrage mit Person und Zeitpunkt ── */
reset();
stub.meta = { modifiedAt: '2026-03-02T09:30:00Z', modifiedBy: 'Bernd Beispiel' };
stub.antwort = true;
ok(await check(P('2026-03-01T10:00:00Z'), 'speicherst') === true, 'Fremdänderung + „Überschreiben" → darf speichern');
ok(stub.confirmText.includes('Bernd Beispiel'), 'Rückfrage nennt die Person');
ok(stub.confirmText.includes('02.03.2026 09:30'), 'Rückfrage nennt den Zeitpunkt');
ok(stub.confirmText.includes('speicherst'), 'Rückfrage nennt die Aktion');
ok(stub.confirmOpts && stub.confirmOpts.danger === true, 'Rückfrage ist als kritisch markiert');
ok(stub.reloaded === 0, 'Bei „Überschreiben" wird nicht neu geladen');

/* ── 3) Fremdänderung + Abbrechen → blockiert und lädt neu ── */
reset();
stub.antwort = false;
ok(await check(P('2026-03-01T10:00:00Z')) === false, 'Abbrechen: Speichern wird verhindert');
ok(stub.reloaded === 1, 'Abbrechen: aktuelle Fassung wird nachgeladen');
ok(stub.toasts.some(t => /Abgebrochen/i.test(t)), 'Abbrechen: Hinweis für den Nutzer');

/* ── 4) Randfälle blockieren nicht ── */
reset(); stub.antwort = false;
ok(await check({ id: null, modifiedAt: 'x' }) === true, 'Neues Regelwerk (ohne id): keine Prüfung');
stub.meta = null;
ok(await check(P('2026-03-01T10:00:00Z')) === true, 'Kein Meta abrufbar (offline/gelöscht): blockiert nicht');
stub.meta = { modifiedAt: '', modifiedBy: '' };
ok(await check(P('2026-03-01T10:00:00Z')) === true, 'Leerer Serverstand: blockiert nicht');
stub.meta = { modifiedAt: '2026-03-02T09:30:00Z', modifiedBy: '' };
ok(await check({ id: '1', modifiedAt: '' }) === true, 'Unbekannter lokaler Stand: blockiert nicht');
ok(stub.confirmText === '', 'Randfälle lösen keine Rückfrage aus');

/* ── 5) Verdrahtung in allen schreibenden Pfaden ── */
const adm = ADMIN_DATEIEN.map(f => fs.readFileSync(ROOT + '/js/' + f, 'utf8')).join('\n');
for (const [name, re] of [
  ['savePolicy', /if \(!await pruefeFremdaenderung\(p, newStatus \?/],
  ['markKonform', /pruefeFremdaenderung\(p, 'die Prüfung abschließt'\)/],
  ['markMitbestimmung', /pruefeFremdaenderung\(p, 'die Mitbestimmung abschließt'\)/],
  ['markFreigabe', /pruefeFremdaenderung\(p, 'freigibst'\)/],
]) ok(re.test(adm), `Geschützt: ${name}`);

/* ── 6) Datenschicht ── */
const shp = fs.readFileSync(ROOT + '/js/sharepoint.js', 'utf8');
ok(/async function spGetPolicyMeta\(id\)/.test(shp), 'spGetPolicyMeta vorhanden');
ok(/\$select=id,lastModifiedDateTime,lastModifiedBy/.test(shp), 'spGetPolicyMeta lädt nur die Metadaten');
ok(/catch \(e\) \{ console\.warn\('Änderungsstand nicht abrufbar/.test(shp), 'spGetPolicyMeta scheitert leise (null)');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
