/**
 * Von sich aus sieht jede:r nur „Wissen".
 *
 * Bisher standen „Meine Regelwerke", Anleitung, Dokumentation und die Links zu
 * KI-Dashboard und ZAPP für alle in der Leiste. Jetzt gibt die Administration
 * jeden Reiter frei – je Person, Gruppe oder mit einem Eintrag für eine ganze
 * Gesellschaft. Admins sehen weiterhin alles. Wer ohne Freigabe auf einen
 * gesperrten Reiter zielt (Link, Rückfall im Code), landet in seiner
 * Startansicht statt vor einer leeren Seite.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const acc = lies('js/access.js');
const sichtbar = {};   // id → display
const ctx = {
  console,
  document: { getElementById: (id) => ({ get style() { return { set display(v) { sichtbar[id] = v; } }; } }), addEventListener: () => {} },
  State: { myRoles: [], myGroups: [] },
  getAuthUser: () => ({ username: 'max@dihag.com' }),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(acc, ctx);
const w = (a) => vm.runInContext(a, ctx);

/* ── 1) Ohne jede Freigabe ── */
w('setRuntimeConfig({ admins: [], reiterRechte: {} })');
ok(w("canReadTab('wissen')") === true, '„Wissen" sieht jede:r');
ok(w("canWriteTab('wissen')") === false, '… aber pflegen darf ohne Freigabe niemand');
ok(['meine', 'anleitung', 'dokumentation', 'ki', 'zapp'].every(v => w(`canReadTab('${v}')`) === false),
  '„Meine Regelwerke", Anleitung, Dokumentation, KI-Dashboard, ZAPP: nicht von sich aus');
ok(w("startAnsicht()") === 'wissen', 'Die Startansicht ist dann „Wissen"');
w('initRoleNav()');
ok(sichtbar['nav-wissen'] === '' && sichtbar['nav-meine'] === 'none' && sichtbar['nav-anleitung'] === 'none' && sichtbar['nav-dokumentation'] === 'none',
  'In der Leiste steht nur „Wissen"');
ok(sichtbar['nav-ki'] === 'none' && sichtbar['nav-grp-ki'] === 'none' && sichtbar['nav-zapp'] === 'none' && sichtbar['nav-grp-apps'] === 'none',
  'Auch die Links zu den anderen Apps samt ihren Überschriften sind weg');
ok(sichtbar['nav-cockpit'] === 'none' && sichtbar['nav-verwaltung'] === 'none', 'Und die Verwaltung ohnehin');

/* ── 2) Freigabe für eine ganze Gesellschaft – ein Eintrag ── */
w("setRuntimeConfig({ admins: [], reiterRechte: { meine: { lesen: ['domaene:dihag.com'] }, anleitung: { lesen: ['domaene:dihag.com'] } } })");
ok(w("canReadTab('meine')") === true && w("canReadTab('anleitung')") === true && w("canReadTab('dokumentation')") === false,
  'Mit dem Eintrag für dihag.com sieht die Gesellschaft „Meine Regelwerke" und die Anleitung – die Dokumentation nicht');
ok(w("startAnsicht()") === 'meine', 'Die Startansicht ist dann wieder „Meine Regelwerke"');
w('initRoleNav()');
ok(sichtbar['nav-meine'] === '' && sichtbar['nav-anleitung'] === '' && sichtbar['nav-dokumentation'] === 'none', 'Die Leiste zieht nach');

/* ── 3) Nur andere Reiter freigegeben: der erste davon ist der Einstieg ── */
w("setRuntimeConfig({ admins: [], reiterRechte: { risiken: { lesen: ['max@dihag.com'] }, wissen: { domaenen: ['gienanth.de'] } } })");
ok(w("canReadTab('wissen')") === false, 'Die Trennung nach Gesellschaft kann sogar „Wissen" wegnehmen');
ok(w("startAnsicht()") === 'risiken', 'Dann ist der erste freigegebene Reiter der Einstieg');

/* ── 4) Admins sehen alles ── */
w("setRuntimeConfig({ admins: ['max@dihag.com'], reiterRechte: {} })");
ok(['meine', 'wissen', 'anleitung', 'dokumentation', 'ki', 'zapp', 'cockpit'].every(v => w(`canReadTab('${v}')`) === true), 'Admins: alles');
ok(w("canWriteTab('wissen')") === true && w("startAnsicht()") === 'meine', '… samt Pflege und dem gewohnten Einstieg');

/* ── 5) Die Reiter stehen in der Matrix ── */
const tabs = w('GOVERNABLE_TABS');
ok(tabs.slice(0, 4).map(t => t.view).join() === 'meine,wissen,anleitung,dokumentation', 'Die früher offenen Reiter stehen vorn in der Matrix – in der Reihenfolge der Leiste');
ok(tabs.slice(-2).map(t => t.view).join() === 'ki,zapp' && tabs.every(t => t.kurz), 'Die beiden App-Links hinten, mit Kürzel');
ok(w('REITER_OHNE_STANDARD').join() === 'meine,anleitung,dokumentation,ki,zapp,freigaben,vorschlaege', 'Und die Liste dessen, was früher offen war und jetzt freizugeben ist');

/* ── 5b) Freigaben und Vorschläge folgen nicht mehr der Rolle ── */
w("setRuntimeConfig({ admins: [], genehmiger: ['max@dihag.com'], pruefer: ['max@dihag.com'], geschaeftsleitung: ['max@dihag.com'], ismsVerantwortlich: ['max@dihag.com'], vorschlagEmpfaenger: ['max@dihag.com'], reiterRechte: {} })");
ok(w("isCurrentUserGenehmiger()") === true && w("isCurrentUserProposalManager()") === true, 'Die Person hat jede Rolle, die früher den Reiter zeigte');
ok(w("canReadTab('freigaben')") === false && w("canReadTab('vorschlaege')") === false, '… und sieht Freigaben und Vorschläge trotzdem nicht');
w('initRoleNav()');
ok(sichtbar['nav-freigaben'] === 'none' && sichtbar['nav-vorschlaege'] === 'none' && sichtbar['nav-grp-richtlinien'] === 'none', 'Auch in der Leiste nicht – samt Gruppenkopf');
w("setRuntimeConfig({ admins: [], genehmiger: ['max@dihag.com'], reiterRechte: { freigaben: { lesen: ['max@dihag.com'] } } })");
ok(w("canReadTab('freigaben')") === true, 'Mit Freigabe in der Matrix ist der Reiter da – die Rolle entscheidet, was sie dort darf');

/* ── 6) Die Schranke in switchView und der Regelwerk-Link ── */
const app = lies('js/app.js');
ok(/const rechtFuer = \{ detail: 'meine', quiz: 'meine' \}\[view\] \|\| view;/.test(app), 'Detail und Wissenstest gehören zu „Meine Regelwerke"');
ok(/GOVERNABLE_TABS\.some\(t => t\.view === rechtFuer\)[\s\S]{0,120}!canReadTab\(rechtFuer\)\) \{\s*view = startAnsicht\(\);/.test(app),
  'Jeder gesperrte Reiter der Matrix wird still auf die Startansicht umgelenkt – über die Leiste kommt ohnehin niemand hin');
ok(/const reiterOffen = typeof canReadTab !== 'function' \|\| canReadTab\('freigaben'\);/.test(app) && /Der Reiter „Freigaben" ist für Sie nicht freigegeben/.test(app),
  'Ein Freigabe-Link aus der Mail ohne freigegebenen Reiter sagt, woran es liegt');
ok(/switchView\(\(typeof startAnsicht === 'function'\) \? startAnsicht\(\) : 'meine'\); return;/.test(app), 'Der Start nimmt die Startansicht');
ok(/!canReadTab\('meine'\)\) \{\s*await switchView\(startAnsicht\(\)\);\s*toast\('Der Reiter „Meine Regelwerke" ist für Sie nicht freigegeben/.test(app),
  'Ein Regelwerk-Link ohne Freigabe sagt, woran es liegt');

/* ── 7) Leiste, Einstellungen, Doku ── */
const idx = lies('index.html');
ok(/data-view="meine" id="nav-meine"/.test(idx) && /id="nav-anleitung"/.test(idx) && /id="nav-dokumentation"/.test(idx) && /id="nav-ki"/.test(idx) && /id="nav-zapp"/.test(idx) && /id="nav-grp-ki"/.test(idx) && /id="nav-grp-apps"/.test(idx),
  'Jeder Eintrag der Leiste hat eine Kennung, damit er sich ausblenden lässt');
ok(/Von sich aus sieht jede:r nur „Wissen"/.test(lies('js/einstellungen.js')), 'Die Matrix sagt es über sich selbst');
ok(/Von sich aus sieht jede:r nur den Reiter <b>„Wissen"<\/b>/.test(lies('js/dokumentation.js')) && /landet beim Start und über Regelwerk-Links in „Wissen"/.test(lies('js/dokumentation.js')),
  'Die Dokumentation auch');
ok(!/Alle sehen „Meine Regelwerke"/.test(lies('js/dokumentation.js')), 'Die alte Aussage ist weg');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
