/**
 * IMS-Reiter: alle Normen, Ordner-Baum – und die Einordnung von Corporate Governance.
 *
 * Der Reiter lud lange nur den ISO-27001-Ordner, obwohl das Managementsystem
 * auch 9001, 14001, 45001 und 50001 umfasst; die übrigen Normen waren
 * unsichtbar. Ein Dropdown zwang außerdem dazu, die Ordnerstruktur zu kennen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const isms = lies('js/ismsdocs.js');
const sp = lies('js/sharepoint.js');
const html = lies('index.html');

/* ── 1) Es werden alle Normen geladen, nicht nur eine ── */
const fn = sp.slice(sp.indexOf('Dokumente des Managementsystems laden'), sp.indexOf('async function spGetIsmsItemFields'));
ok(!/iso\[\\s_-\]\*27001/i.test(fn) && !/wantRe/.test(fn), 'Kein fester ISO-27001-Filter mehr');
ok(/ordner = \(root\.value \|\| \[\]\)\.filter\(it => it\.folder/.test(fn), 'Alle Ordner der obersten Ebene');
ok(/_parallel\(ordner\.map\(f => \(\) => _ismsCollectFolder/.test(fn), 'Jeder davon wird eingesammelt – gleichzeitig');
ok(/localeCompare\(b\.name \|\| '', 'de'\)/.test(fn), 'In verständlicher Reihenfolge');
ok(/@param \{string\} \[folderName\]/.test(fn), 'Eine Einschränkung auf einen Ordner bleibt möglich');

/* ── 2) Der Baum ── */
const teil = isms.slice(isms.indexOf('let _ismsOrdnerOffen'), isms.indexOf('/* ── Anzeige-/Bearbeitungsfelder'));
const ctx = { console, esc: (s) => String(s ?? ''), renderIsmsDocs: () => {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(teil, ctx);

const docs = [
  { folder: 'ISO 9001', name: 'a' }, { folder: 'ISO 9001/Anhänge', name: 'b' },
  { folder: 'ISO 14001', name: 'c' }, { folder: 'ISO 27001', name: 'd' },
  { folder: 'ISO 45001', name: 'e' }, { folder: 'ISO 50001', name: 'f' },
];
vm.runInContext('globalThis.__t = _ismsBuildTree(' + JSON.stringify(docs) + ');', ctx);
const baum = ctx.__t;
ok(baum.count === 6, `Die Wurzel zählt alles (${baum.count})`);
ok(Object.keys(baum.children).length === 5, 'Fünf Normen als Zweige');
ok(baum.children['ISO 9001'].count === 2, 'Ein Zweig zählt seine Unterordner mit');
ok(!!baum.children['ISO 9001'].children['Anhänge'], 'Unterordner hängen darunter');

vm.runInContext('globalThis.__h = _ismsTreeNodeHtml(globalThis.__t, 0);', ctx);
ok((ctx.__h.match(/gov-tree-node/g) || []).length === 6,
  'Zugeklappt sind Wurzel und Normen sichtbar, Unterordner nicht');
vm.runInContext("ismsSelectFolder('ISO 9001'); globalThis.__h2 = _ismsTreeNodeHtml(globalThis.__t, 0);", ctx);
ok((ctx.__h2.match(/gov-tree-node sel/g) || []).length === 1, 'Der gewählte Ordner ist markiert');
ok((ctx.__h2.match(/gov-tree-node/g) || []).length === 7, 'Und sein Zweig ist aufgeklappt');
vm.runInContext("ismsSelectFolder('ISO 9001'); globalThis.__h3 = _ismsTreeNodeHtml(globalThis.__t, 0);", ctx);
ok(vm.runInContext('_ismsOrdnerSel', ctx) === '', 'Nochmal klicken hebt die Auswahl auf');
ok(ctx.__h3.indexOf('gov-tree-node sel') === ctx.__h3.indexOf('gov-tree-node'),
  'Dann ist wieder „Alle Normen" markiert – der Baum zeigt immer, was gerade gilt');

ok(/role="treeitem"/.test(isms) && /aria-selected=/.test(isms), 'Der Baum ist für Screenreader ausgezeichnet');
ok(/event\.key==='Enter'\|\|event\.key===' '/.test(isms), 'Und mit der Tastatur bedienbar');
ok(!/filter-isms-folder/.test(isms) && !/filter-isms-folder/.test(html), 'Das Ordner-Dropdown ist raus');
ok(/const folder = _ismsOrdnerSel;/.test(isms), 'Gefiltert wird über die Baum-Auswahl');

/* ── 3) Governance findet seinen Ordner auch bei anderer Schreibweise ── */
ok(/folderKandidaten:/.test(sp), 'Mehrere Schreibweisen sind hinterlegt');
ok(/'Entwurf_010_Corporate Governance-Board'/.test(sp), 'Die richtige Schreibweise');
ok(/'Entwurf_010_Corporate Govenance-Board'/.test(sp), 'Und die alte mit Tippfehler');
ok(/function _govNorm/.test(sp), 'Zur Not wird der Name normalisiert verglichen');
ok(/governanceboard/.test(sp), 'Als letzte Chance reicht ein ähnlicher Name');
ok(/_gov\.folderName \|\| GOV\.folderPath/.test(sp),
  'Die tatsächlich gefundene Schreibweise landet auch in den Datei-URLs');

/* ── 4) Einordnung in der Navigation ── */
const pos = (t) => html.indexOf(t);
ok(pos('nav-grp-governance') > 0, 'Corporate Governance ist eine eigene Gruppe');
ok(pos('nav-grp-governance') < pos('nav-grp-isms'), 'Sie steht über dem IMS');
ok(pos('nav-governance') > pos('nav-grp-governance') && pos('nav-governance') < pos('nav-grp-isms'),
  'Das Governance-Board liegt darin');
ok(/IMS-Dokumente/.test(html) && !/ISMS-Dokumente/.test(html),
  'Der Reiter heißt IMS-Dokumente – er trägt alle Normen, nicht nur die Informationssicherheit');
ok(/ismsdocs: 'IMS-Dokumente'/.test(lies('js/app.js')), 'Ebenso der Seitentitel');
const acc = lies('js/access.js');
ok(/show\('nav-grp-governance',\s+v\.governance\)/.test(acc), 'Die Gruppe erscheint mit dem Board');
ok(!/v\.governance \|\| v\.prozesse|v\.governance \|\|/.test(acc.slice(acc.indexOf("show('nav-grp-isms'"), acc.indexOf("show('nav-grp-isms'") + 160)),
  'Und ist aus der IMS-Gruppe herausgelöst');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
