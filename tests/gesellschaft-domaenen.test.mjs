/**
 * Berechtigungen nach Gesellschaft trennen (Vorbild „Rund um den Job").
 *
 * Die DIHAG-Gruppe sind mehrere Gesellschaften mit eigenen Mail-Domänen. Die
 * Rechtevergabe kannte bisher nur Personen, Rollen und Gruppen: Wer eine ganze
 * Gesellschaft berechtigen wollte, musste jede Person einzeln eintragen – und
 * bei jedem Eintritt daran denken.
 *
 * Zwei Bausteine, und sie tun Verschiedenes:
 *
 *   „domaene:gienanth.de" in lesen/schreiben   GIBT etwas dazu (additiv)
 *   reiterRechte[view].domaenen                NIMMT weg (die eigentliche Trennung)
 *
 * Der zweite ist der schärfere: Er schlägt jede Freigabe. Sonst wäre er keine
 * Trennung, sondern nur eine weitere Meinung.
 *
 * Admins bleiben ausgenommen – „Einstellungen" ist admin-only, und wer dort
 * nicht mehr hineinkommt, kann eine falsch gesetzte Trennung nicht zurücknehmen.
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
const eins = lies('js/einstellungen.js');
const sp = lies('js/sharepoint.js');

const ctx = {
  console,
  document: { getElementById: () => null, addEventListener: () => {} },
  State: { myRoles: [], myGroups: [] },
  getAuthUser: () => ({ username: ctx.__upn }),
  spMeineMail: () => ctx.__mail,
  __upn: 'max@gienanth.de',
  __mail: '',
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(acc, ctx);
const wert = (a) => vm.runInContext(a, ctx);

/* ── 1) Die Domäne eines Kontos ── */
ok(wert(`domaeneVon('Max.Muster@Gienanth.DE')`) === 'gienanth.de', 'Die Domäne kommt aus der Adresse');
ok(wert(`domaeneVon('kaputt')`) === '', 'Ohne @ keine Domäne – und keine Ausrede');
ok(wert(`domaeneNormal('@DIHAG.com')`) === 'dihag.com'
  && wert(`domaeneNormal('a@dihag.com')`) === 'dihag.com'
  && wert(`domaeneNormal(' dihag.com ')`) === 'dihag.com',
  'Eingetippt wird „dihag.com", „@dihag.com" oder gleich eine Adresse – alles dasselbe');
ok(wert(`domaenenEintrag('@gienanth.de')`) === 'domaene:gienanth.de', 'Daraus wird der Eintrag für die Rechteliste');
ok(wert(`istDomaenenEintrag('domaene:x.de')`) === true && wert(`istDomaenenEintrag('a@x.de')`) === false,
  'Eine Domäne ist als Eintrag erkennbar – wie eine Gruppe an ihrem Präfix');

/* Anmeldename und Mailadresse fallen in manchen Mandanten auseinander. */
ctx.__upn = 'max@dihag.onmicrosoft.com'; ctx.__mail = 'max@gienanth.de';
ok(wert(`meineDomaenen().join('|')`) === 'dihag.onmicrosoft.com|gienanth.de',
  'Beide Domänen zählen – sonst sperrte man die Falschen aus');
ctx.__upn = 'max@gienanth.de'; ctx.__mail = '';
ok(wert(`meineDomaenen().join('|')`) === 'gienanth.de', 'Ohne bekannte Mailadresse gilt der Anmeldename');

/* ── 2) Die Domäne als Träger eines Rechts (additiv) ── */
wert(`setRuntimeConfig({
  admins: [], reiterRechte: {
    prozesse:  { lesen: ['domaene:gienanth.de'] },
    risiken:   { schreiben: ['domaene:gienanth.de'] },
    abdeckung: { lesen: ['domaene:dihag.com'] },
  },
  gesellschaften: { 'gienanth.de': 'Gienanth GmbH', 'dihag.com': 'DIHAG Holding' } })`);

ok(wert(`canReadTab('prozesse')`) === true, 'Eine ganze Gesellschaft lässt sich mit einem Eintrag berechtigen');
ok(wert(`canWriteTab('prozesse')`) === false, 'Nur Lesen bleibt nur Lesen');
ok(wert(`canWriteTab('risiken')`) === true && wert(`canReadTab('risiken')`) === true, 'Und Schreiben schließt Lesen ein');
ok(wert(`canReadTab('abdeckung')`) === false, 'Die Gesellschaft der anderen gibt nichts');
ok(wert(`gesellschaftLabel('gienanth.de')`) === 'Gienanth GmbH', 'Angezeigt wird der Name, nicht die Domäne');
ok(wert(`gesellschaftLabel('fremd.de')`) === 'fremd.de', 'Ohne gepflegten Namen die Domäne selbst – nie leer');

/* ── 3) Die Sperre: sie nimmt weg, was eine Freigabe gegeben hätte ── */
wert(`setRuntimeConfig({
  admins: [], reiterRechte: {
    cockpit:  { lesen: ['max@gienanth.de'], domaenen: ['dihag.com'] },
    prozesse: { schreiben: ['max@gienanth.de'], domaenen: ['gienanth.de', 'dihag.com'] },
    risiken:  { lesen: ['max@gienanth.de'] },
  } })`);
ok(wert(`canReadTab('cockpit')`) === false,
  'Trotz persönlicher Freigabe zu: der Reiter gehört einer anderen Gesellschaft');
ok(wert(`canWriteTab('cockpit')`) === false, 'Und schreiben erst recht nicht');
ok(wert(`canReadTab('prozesse')`) === true && wert(`canWriteTab('prozesse')`) === true,
  'Steht die eigene Gesellschaft dabei, gilt die Freigabe wie immer');
ok(wert(`canReadTab('risiken')`) === true, 'Ohne Sperre bleibt alles, wie es war');
ok(wert(`reiterDomaenen('prozesse').length`) === 2 && wert(`reiterDomaenen('risiken').length`) === 0,
  'Die Sperre steht beim Reiter, nicht bei der Person');
ok(wert(`getReiterRechte('prozesse').domaenen.join('|')`) === 'gienanth.de|dihag.com',
  'Und wird mit den Rechten des Reiters zusammen gelesen');

/* Kein Konto, keine Domäne: dann greift die Sperre. Lieber zu wenig zeigen. */
ctx.__upn = ''; ctx.__mail = '';
ok(wert(`canReadTab('prozesse')`) === false, 'Ohne feststellbare Domäne bleibt ein gesperrter Reiter zu');
ctx.__upn = 'max@gienanth.de';

/* ── 4) Admins bleiben ausgenommen ──
   Sonst spielte man sich mit einem Klick aus der Verwaltung: „Einstellungen"
   ist admin-only, und wer dort nicht mehr hineinkommt, kann die Sperre nicht
   zurücknehmen. */
wert(`setRuntimeConfig({
  admins: ['max@gienanth.de'], reiterRechte: { cockpit: { domaenen: ['dihag.com'] } } })`);
ok(wert(`canReadTab('cockpit')`) === true, 'Ein Admin kommt auch in einen gesperrten Reiter');
ok(wert(`canWriteTab('cockpit')`) === true, 'Und darf dort arbeiten – sonst wäre die Sperre nicht rücknehmbar');
ok(/isCurrentUserAdmin\(\)\) return false;/.test(acc.split('_domaeneGesperrt')[1] || ''),
  'Die Ausnahme steht an genau einer Stelle');

/* ── 5) Die Sperre wirkt vor allem anderen ──
   Ein Prüfer sieht „Freigaben" von Haus aus (_defaultTabRead). Auch das muss
   die Trennung schlagen, sonst wäre sie löchrig. */
wert(`setRuntimeConfig({
  admins: [], pruefer: ['max@gienanth.de'],
  reiterRechte: { freigaben: { domaenen: ['dihag.com'] } } })`);
ok(wert(`isCurrentUserPruefer()`) === true, 'Die Person ist Konformitätsprüferin');
ok(wert(`canReadTab('freigaben')`) === false, 'Und sieht den Reiter trotzdem nicht – die Trennung geht vor');

/* ── 6) Speicherung und Oberfläche ── */
ok(/gesellschaften: \{\}/.test(acc), 'Die Gesellschaften stehen in der Voreinstellung');
ok(/gesellschaften: JSON\.parse\(JSON\.stringify\(c\.gesellschaften/.test(acc),
  'getAccessConfig() gibt sie in den Entwurf – sonst wären sie beim Speichern weg');
wert(`setRuntimeConfig({ admins: [], gesellschaften: { 'a.de': 'A' }, reiterRechte: {} })`);
ok(wert(`getAccessConfig().gesellschaften['a.de']`) === 'A', 'Und kommen wieder heraus');

ok(/rrSperreToggle/.test(eins) && /rrRenderDomaenen/.test(eins),
  'Die Einstellungen haben eine Tabelle „Reiter × Gesellschaft"');
ok(/rrAddDomaene/.test(eins), 'Und einen Weg, eine Gesellschaft aufzunehmen');
ok(/art: 'gesellschaft'/.test(eins), 'Die Rechtematrix kennt die Gesellschaft als dritte Trägerart');
ok(/rang\[a\.art\] - rang\[b\.art\]/.test(eins),
  'Sortiert nach Reichweite: Gesellschaften vor Gruppen vor Personen');
ok(/rrDomaenenScan/.test(eins) && /spGetMembers/.test(eins),
  'Die Domänen des Mandanten lassen sich aus der Mitarbeiterliste finden – ohne neue Berechtigung');

/* ── 7) Die Mailadresse kommt aus dem Aufruf, der ohnehin läuft ── */
ok(/\$select=department,jobTitle,mail/.test(sp),
  'spGetMyDepartment() liest die Mailadresse gleich mit – kein zusätzlicher Graph-Aufruf');
ok(/function spMeineMail\(\)/.test(sp), 'Und stellt sie synchron bereit (die Rechteprüfung darf nicht warten)');
ok(/mail: String\(u\.mail \|\| ''\)\.toLowerCase\(\),/.test(sp),
  'Die Mitarbeiterliste führt die Mailadresse mit – daraus kommen die Domänen des Mandanten');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
