/**
 * Trennung der Inhalte nach Gesellschaft.
 *
 * Die Reiter-Sperre sagt, WELCHE ANSICHT jemand öffnen darf. Sie sagt nichts
 * darüber, was er dort sieht – wer das Dashboard öffnen durfte, sah die
 * Regelwerke aller Gesellschaften. Eine Tür ohne Wand.
 *
 * Die Brücke zwischen Gesellschaft und Inhalt ist der **Geltungsbereich**: Den
 * trägt jedes Regelwerk ohnehin. Eine Gesellschaft bekommt ihre Werke
 * zugeordnet und sieht dann, was dort gilt – plus alles Konzernweite.
 *
 * Zwei Dinge sind hier wichtiger als die Filterlogik selbst:
 *   • Der Filter greift an EINER Stelle (reloadData). Filterte jede Ansicht für
 *     sich, wäre die nächste neue die undichte.
 *   • Nichts verschwindet stillschweigend: Altbestand ohne Geltungsbereich
 *     bleibt sichtbar, über der Liste steht ein Hinweis, und ein Link auf ein
 *     fremdes Regelwerk sagt „andere Gesellschaft" statt „gelöscht".
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
const app = lies('js/app.js');
const eins = lies('js/einstellungen.js');
const lk = lies('js/landkarte.js');
const prz = lies('js/prozesse.js');

const ctx = {
  console, Set, Map, JSON, Date, Object, Array, String, Math,
  document: { getElementById: () => null, addEventListener: () => {}, querySelectorAll: () => [] },
  esc: (s) => String(s ?? ''),
  State: { myRoles: [], myGroups: [] },
  getAuthUser: () => ({ username: ctx.__upn }),
  spMeineMail: () => '',
  STANDORTE: ['HOL', 'SHB', 'WGC', 'SCH', 'EIS', 'DSO', 'ZAI', 'LEG', 'MEG', 'EWA'],
  __upn: 'max@gienanth.de',
};
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(acc, ctx);
vm.runInContext(lk, ctx);
const wert = (a) => vm.runInContext(a, ctx);

const GES = `{ 'gienanth.de': { name: 'Gienanth GmbH', werke: ['EIS','DSO'] },
               'dihag.com':   { name: 'DIHAG Holding', werke: ['HOL'] },
               'ohne.de':     'Nur ein Name' }`;

/* ── 1) Aus bleibt aus ──
   Ein Schalter, der schon vor dem Umlegen wirkt, ist ein Fehler. */
wert(`setRuntimeConfig({ admins: [], gesellschaften: ${GES}, reiterRechte: {} })`);
ok(wert(`istTrennungInhalte()`) === false, 'Die Trennung ist von Haus aus aus');
ok(wert(`meineWerke().join('|')`) === '*', 'Ohne sie sieht jeder alles');
ok(wert(`trennungGreift()`) === false, 'Und sie greift nirgends');
ok(wert(`geltungSichtbar(['HOL'])`) === true, 'Auch ein fremdes Werk bleibt sichtbar');
ok(wert(`trennungHinweisHtml()`) === '', 'Der Hinweis über der Liste bleibt weg – es gibt nichts zu sagen');

/* ── 2) Die Gesellschaft kennt ihre Werke (zwei Formen) ── */
ok(wert(`gesellschaftWerke('gienanth.de').join('|')`) === 'EIS|DSO', 'Eine Gesellschaft trägt ihre Werke');
ok(wert(`gesellschaftLabel('gienanth.de')`) === 'Gienanth GmbH', 'Und ihren Namen');
ok(wert(`gesellschaftLabel('ohne.de')`) === 'Nur ein Name' && wert(`gesellschaftWerke('ohne.de').length`) === 0,
  'Die alte Form (nur Text) bleibt lesbar – sie verschwindet nicht beim ersten Speichern');
ok(wert(`gesellschaftLabel('fremd.de')`) === 'fremd.de', 'Unbekannt: die Domäne selbst, nie leer');

/* ── 3) Eingeschaltet ── */
wert(`setRuntimeConfig({ admins: [], trennungInhalte: true, konzernSicht: [], gesellschaften: ${GES}, reiterRechte: {} })`);
ok(wert(`meineWerke().join('|')`) === 'EIS|DSO', 'Jetzt sieht Gienanth genau seine Werke');
ok(wert(`trennungGreift()`) === true, 'Die Trennung greift');

ok(wert(`geltungSichtbar(['EIS'])`) === true, 'Was in EIS gilt, sieht Gienanth');
ok(wert(`geltungSichtbar(['DSO','HOL'])`) === true, 'Ein Regelwerk für mehrere Werke reicht mit einem Treffer');
ok(wert(`geltungSichtbar(['HOL'])`) === false, 'Was nur für die Holding gilt, nicht');
ok(wert(`geltungSichtbar(['ALLE'])`) === true, 'Konzernweites gilt auch für die eigene Gesellschaft');
ok(wert(`geltungSichtbar([])`) === true,
  'Ungepflegt zählt wie konzernweit – sonst verschwände beim Einschalten schlagartig der ganze Altbestand');
ok(wert(`geltungSichtbar(null)`) === true, 'Und ein fehlendes Feld ebenso');

/* ── 4) Die Liste ── */
wert(`__liste = [
  { id: '1', title: 'Nur Holding',  geltungsbereich: ['HOL'] },
  { id: '2', title: 'Gienanth',     geltungsbereich: ['EIS'] },
  { id: '3', title: 'Konzernweit',  geltungsbereich: ['ALLE'] },
  { id: '4', title: 'Ungepflegt',   geltungsbereich: [] },
]`);
ok(wert(`filterNachGesellschaft(__liste).map(p => p.id).join('')`) === '234',
  'Aus vier Regelwerken bleiben drei – das der Holding fällt weg');
ok(wert(`filterNachGesellschaft(__liste) !== __liste`), 'Die Ursprungsliste bleibt unangetastet');

/* ── 5) Konzernsicht ──
   Wer über alle Gesellschaften hinweg arbeitet, muss auch alle sehen. */
wert(`setRuntimeConfig({ admins: [], trennungInhalte: true, konzernSicht: ['max@gienanth.de'],
  gesellschaften: ${GES}, reiterRechte: {} })`);
ok(wert(`hatKonzernsicht()`) === true, 'Die Konzernsicht ist eine eigene Liste');
ok(wert(`meineWerke().join('|')`) === '*' && wert(`filterNachGesellschaft(__liste).length`) === 4,
  'Damit sieht diese Person wieder alles');

/* Ein Admin ist NICHT automatisch dabei: Bei den Reitern wäre das ein
   Aussperren, hier ist es schlicht die Frage, wen es angeht. */
wert(`setRuntimeConfig({ admins: ['max@gienanth.de'], trennungInhalte: true, konzernSicht: [],
  gesellschaften: ${GES}, reiterRechte: {} })`);
ok(wert(`filterNachGesellschaft(__liste).length`) === 3,
  'Ein Admin allein bekommt keine Konzernsicht – die wird ausdrücklich vergeben');
ok(wert(`canReadTab('einstellungen') || isCurrentUserAdmin()`) === true,
  'An die Einstellungen kommt er weiter – sonst könnte er es nicht zurücknehmen');

/* ── 6) Ohne zugeordnete Werke ändert sich nichts ──
   Sonst sähe jemand, dessen Gesellschaft nur zur Anzeige gepflegt ist, von
   einem Tag auf den anderen nichts mehr. */
ctx.__upn = 'gast@ohne.de';
wert(`setRuntimeConfig({ admins: [], trennungInhalte: true, konzernSicht: [], gesellschaften: ${GES}, reiterRechte: {} })`);
ok(wert(`meineWerke().join('|')`) === '*', 'Eine Gesellschaft ohne Werke bleibt unbeschränkt');
ctx.__upn = 'niemand@fremd.de';
ok(wert(`meineWerke().join('|')`) === '*', 'Und eine gar nicht gepflegte Domäne ebenso');
ctx.__upn = 'max@gienanth.de';

/* ── 7) Der Hinweis über der Liste ──
   Still zu filtern wäre das Schlimmste: Wer sein Regelwerk nicht findet, sucht
   den Fehler zuerst bei sich. */
wert(`setRuntimeConfig({ admins: [], trennungInhalte: true, konzernSicht: [], gesellschaften: ${GES}, reiterRechte: {} })`);
const hinweis = wert(`trennungHinweisHtml()`);
ok(hinweis.includes('Gienanth GmbH') && hinweis.includes('EIS'), 'Der Hinweis nennt Gesellschaft und Werke');
ok(/konzernweit/i.test(hinweis), 'Und sagt, dass Konzernweites dabei ist');
ok(/\$\{trHinweis\}|trHinweis \+/.test(app), 'Er steht in „Meine Regelwerke" über der Liste');
ok(/trHinweis \+ emptyState/.test(app),
  'Auch über der LEEREN Liste – gerade dann sieht es sonst nach einem Fehler aus');
ok(/roBanner \+ trBanner/.test(lies('js/admin.js')), 'Und im Dashboard bei den anderen Bannern');

/* ── 8) Der Filter greift an genau einer Stelle ── */
ok(/State\.policiesAlle = policies;/.test(app), 'Die ungefilterte Liste bleibt erhalten (für ehrliche Meldungen)');
ok(/State\.policies = filterNachGesellschaft\(/.test(app) && /State\.konzepte = filterNachGesellschaft\(/.test(app),
  'Regelwerke und Konzepte werden beim Laden gefiltert');
ok((app.match(/filterNachGesellschaft\(/g) || []).length === 2,
  'Und zwar nur dort – jede Ansicht danach ist automatisch gefiltert');
ok(/function regelwerkVerborgen/.test(app), 'Verborgen und gelöscht sind unterscheidbar');
ok(/Nicht Ihre Gesellschaft/.test(lies('js/freigaben.js')),
  'Ein Mail-Link auf ein fremdes Regelwerk sagt das auch – statt „wurde gelöscht"');

/* ── 9) Auch die Landkarten ──
   Regelwerke sind nicht der einzige Inhalt. */
wert(`_lkDaten = { karten: {
  KONZERN: { kacheln: [{ id: 'k1', band: 'kern', name: 'Konzernprozess' }] },
  HOL:     { kacheln: [{ id: 'h1', band: 'kern', name: 'Holding-Prozess' }] },
  EIS:     { kacheln: [{ id: 'e1', band: 'kern', name: 'Gießen' }] },
} }; _lkWerk = 'HOL';`);
ok(wert(`lkWerkeSichtbar().includes('EIS')`) === true, 'Gienanth sieht die Landkarte von EIS');
ok(wert(`lkWerkeSichtbar().includes('HOL')`) === false, 'Die der Holding nicht');
ok(wert(`lkWerkeSichtbar().includes('KONZERN')`) === true,
  'Die Konzernebene bleibt immer sichtbar – sie gilt für alle');
ok(wert(`lkAlleKacheln().map(x => x.werk).join('|')`) === 'KONZERN|EIS',
  'Mindmap, Suche und Verweise schöpfen aus derselben, gekürzten Quelle');
ok(wert(`lkKachelVonZiel('HOL:h1')`) === null,
  'Ein Verweis in ein fremdes Werk läuft ins Leere – wie ein gelöschtes Ziel');
wert(`renderLandkarte()`);
ok(wert(`_lkWerk`) === 'KONZERN',
  'Und die offene Karte wechselt: HOL wäre der Einstieg in eine fremde Gesellschaft');
ok(/rows = rows\.filter\(p => !p\.ordner \|\| werke\.includes\(p\.ordner\)\)/.test(prz),
  'Die Modell-Liste zeigt nur Werke, die man sehen darf');
ok(/„Ohne Zuordnung" bleibt sichtbar/.test(prz),
  'Modelle ohne Werk bleiben sichtbar – versteckt würden sie nie einsortiert');

/* Ausgeschaltet ist die Landkarte wieder vollständig. */
wert(`setRuntimeConfig({ admins: [], gesellschaften: ${GES}, reiterRechte: {} })`);
ok(wert(`lkAlleKacheln().length`) === 3, 'Ohne Trennung sind alle drei Karten wieder da');

/* ── 10) Die Oberfläche zum Einstellen ── */
ok(/rrTrennungSchalten/.test(eins) && /cfg-trennung/.test(eins), 'Ein Schalter in den Einstellungen');
ok(/rrWerkToggle/.test(eins), 'Werke lassen sich je Gesellschaft zuordnen');
ok(/roleCard\('konzernSicht'/.test(eins), 'Und die Konzernsicht wird wie jede andere Rollenliste gepflegt');
ok(/'konzernSicht'\]\.forEach/.test(lies('js/admin.js')), 'renderCfgLists() füllt sie auch');
ok(/Niemand hat Konzernsicht/.test(eins),
  'Beim Einschalten wird gewarnt, wenn niemand mehr über alle Gesellschaften schaut');
ok(/trennt die <b>Sicht<\/b>, nicht den Zugriff/.test(eins),
  'Und es steht dort, dass das eine Sicht-Trennung ist und keine technische');
ok(/trennungInhalte: c\.trennungInhalte === true/.test(acc) && /konzernSicht: \[\.\.\.\(c\.konzernSicht/.test(acc),
  'Beides landet im Entwurf und damit beim Speichern in der Config');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
