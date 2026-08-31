/**
 * Verweise zwischen Prozessen.
 *
 * Bis hierher konnte eine Kachel nur auf Modelle (BPMN-Dateien) und Regelwerke
 * zeigen. `unter` war ein Untertitel, kein Unterprozess – eine Prozesskette
 * ließ sich gar nicht aufschreiben.
 *
 * Ein Verweis ist deshalb bewusst schlicht: ein Ziel und eine Art.
 *
 *     k.verweise = [{ ziel: 'HOL:angebot', art: 'unterprozess' }, …]
 *
 * Ein Unterprozess ist damit eine ganz normale Kachel – sie behält Modelle,
 * Regelwerke, Geltungsbereich und ihren Verantwortlichen, statt dass es eine
 * zweite, ärmere Sorte Prozess gäbe. Und weil im Ziel das Werk steht, darf ein
 * Verweis die Gesellschaft wechseln; genau das braucht eine End-to-End-Kette.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Promise,
  esc: (s) => String(s ?? ''),
  document: { getElementById: () => null, querySelectorAll: () => [] },
  toast: () => {},
  openModal: () => {},
  closeModal: () => {},
  canWriteTab: () => true,
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* Zwei Werke, damit der werkübergreifende Fall echt ist. */
run(`
_lkDaten = { karten: {
  HOL: { kacheln: [
    { id: 'vertrieb',   band: 'kern', name: 'Vertrieb',
      verweise: [{ ziel: 'HOL:angebot', art: 'unterprozess' },
                 { ziel: 'HOL:auftrag', art: 'folgt' },
                 { ziel: 'SHB:giessen', art: 'nutzt' }] },
    { id: 'angebot',    band: 'kern', name: 'Angebot erstellen' },
    { id: 'auftrag',    band: 'kern', name: 'Auftrag abwickeln' },
    { id: 'verwaist',   band: 'kern', name: 'Verwaist',
      verweise: [{ ziel: 'HOL:gibtesnicht', art: 'folgt' }] },
  ] },
  SHB: { kacheln: [ { id: 'giessen', band: 'kern', name: 'Gießen' } ] },
} };
_lkWerk = 'HOL';
`);

/* ── 1) Ziel: Werk und Kachel ── */
ok(run(`lkZielSchluessel('SHB','giessen')`) === 'SHB:giessen', 'Ein Ziel trägt sein Werk');
const teile = run(`lkZielTeile('SHB:giessen')`);
ok(teile.werk === 'SHB' && teile.id === 'giessen', 'Und lässt sich wieder zerlegen');
ok(run(`lkZielTeile('angebot').werk`) === 'HOL',
  'Ohne Werk im Ziel gilt die eigene Karte – ältere Einträge bleiben lesbar');

/* ── 2) Auflösung über ALLE Werke ── */
ok(run(`lkKachelVonZiel('SHB:giessen').kachel.name`) === 'Gießen',
  'Ein Ziel wird über alle Werke aufgelöst, nicht nur über das offene');
ok(run(`lkKachelVonId('giessen')`) === null,
  'Der alte Sucher findet es nicht – er kennt nur das offene Werk (deshalb der neue)');
ok(run(`lkKachelVonZiel('HOL:gibtesnicht')`) === null, 'Ein totes Ziel bleibt null');

/* ── 3) Verweise einer Kachel ── */
const raus = run(`lkVerweiseVon(lkKachelVonId('vertrieb'))`);
ok(raus.length === 3, 'Alle drei Verweise des Vertriebs');
ok(raus.find(v => v.art === 'unterprozess').kachel.name === 'Angebot erstellen', 'Der Unterprozess');
ok(raus.find(v => v.art === 'folgt').kachel.name === 'Auftrag abwickeln', 'Der Nachfolger in der Kette');
const quer = raus.find(v => v.art === 'nutzt');
ok(quer.kachel.name === 'Gießen' && quer.werk === 'SHB',
  'Und der Querbezug – über die Gesellschaftsgrenze hinweg');

ok(run(`lkVerweiseVon(lkKachelVonId('verwaist')).length`) === 0,
  'Ein Verweis ins Nichts wird verschwiegen, nicht als Fehler gezeigt');
ok(run(`lkVerweiseVon(lkKachelVonId('angebot')).length`) === 0, 'Ohne Verweise eine leere Liste');
ok(run(`lkVerweiseVon(null).length`) === 0, 'Und ohne Kachel ebenfalls');

/* ── 4) Die Gegenrichtung wird gesucht, nicht gepflegt ── */
const rein = run(`lkVerweiseAuf('HOL','angebot')`);
ok(rein.length === 1 && rein[0].kachel.name === 'Vertrieb' && rein[0].art === 'unterprozess',
  'Wer auf „Angebot erstellen" zeigt, ist auffindbar – ohne dass es dort gespeichert wäre');
const reinQuer = run(`lkVerweiseAuf('SHB','giessen')`);
ok(reinQuer.length === 1 && reinQuer[0].werk === 'HOL',
  'Auch werkübergreifend: „Gießen" weiß, dass der Vertrieb der Holding es nutzt');
ok(run(`lkVerweiseAuf('HOL','auftrag')[0].art`) === 'folgt',
  'Die Art bleibt erhalten – daraus wird „Davor liegt"');

/* ── 5) Setzen und Lösen ── */
ok(run(`lkVerweisSetzen('angebot','HOL:auftrag','folgt')`) === true, 'Ein Verweis lässt sich setzen');
ok(run(`lkVerweiseVon(lkKachelVonId('angebot')).length`) === 1, 'Und ist danach da');
run(`lkVerweisSetzen('angebot','HOL:auftrag','nutzt')`);
const nachher = run(`lkVerweiseVon(lkKachelVonId('angebot'))`);
ok(nachher.length === 1 && nachher[0].art === 'nutzt',
  'Dasselbe Ziel zweimal gibt es nicht – die Art wird ersetzt');
run(`lkVerweisSetzen('angebot','HOL:auftrag','')`);
ok(run(`lkVerweiseVon(lkKachelVonId('angebot')).length`) === 0, 'Ohne Art wird der Verweis gelöst');

/* ── 6) Die drei Arten und ihre Gegenrichtung ── */
ok(run(`LK_VERWEIS_ARTEN.length`) === 3, 'Drei Arten: Hierarchie, Kette, Querbezug');
ok(run(`LK_VERWEIS_ARTEN.every(a => a.art && a.label && a.zeichen && a.umkehr)`),
  'Jede trägt Beschriftung, Zeichen und ihre Gegenrichtung');
ok(run(`lkVerweisArt('unterprozess').umkehr`) === 'Teil von', 'Der Unterprozess ist „Teil von"');
ok(run(`lkVerweisArt('quatsch').art`) === 'nutzt', 'Eine unbekannte Art fällt auf den Querbezug zurück');

/* ── 7) Anklickbar, nicht nur lesbar ── */
const lk = lies('js/landkarte.js');
const html = run(`_lkVerweiseHtml('HOL', lkKachelVonId('vertrieb'))`);
ok(/lkSpringeZu\('HOL','angebot'\)/.test(html), 'Jede Zeile springt auf ihr Ziel');
ok(/lkSpringeZu\('SHB','giessen'\)/.test(html), 'Auch über die Gesellschaftsgrenze');
ok(html.includes('Prozesslandschaft'), 'Der Abschnitt ist benannt');
ok(html.includes('Unterprozesse') && html.includes('Danach folgt') && html.includes('Nutzt'),
  'Nach Art gruppiert, nicht als eine lange Liste');
ok(/_lkVerweiseHtml\(_lkWerk, k\)/.test(lk), 'Und er hängt im Kachel-Dialog');

const htmlZiel = run(`_lkVerweiseHtml('HOL', lkKachelVonId('angebot'))`);
ok(htmlZiel.includes('Zeigt hierher') && htmlZiel.includes('Teil von'),
  'Beim Ziel steht die Gegenrichtung');

/* ── 8) Und sie werden zu Kanten in der Mindmap ──
   Der Graph kannte bisher nur Beziehungen nach unten (Werk gliedert Band,
   Band enthält Prozess, Prozess modelliert in Modell). Verweise sind die
   ersten Kanten ZWISCHEN Prozessen – erst dadurch wird aus einer Sammlung
   von Kacheln eine Landschaft. */
const gctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Promise, Map,
  esc: (s) => String(s ?? ''),
  document: { getElementById: () => null, querySelectorAll: () => [] },
  toast: () => {}, openModal: () => {}, closeModal: () => {}, canWriteTab: () => true,
  State: { policies: [] },
  spGetProcessXml: async () => '',
  _procLinkCache: {},
};
gctx.window = gctx; gctx.globalThis = gctx;
vm.createContext(gctx);
vm.runInContext(lies('js/util.js'), gctx);
vm.runInContext(lies('js/landkarte.js'), gctx);
vm.runInContext(lies('js/verknuepfungen.js'), gctx);
vm.runInContext(`
_lkDaten = { karten: {
  HOL: { kacheln: [
    { id: 'vertrieb', band: 'kern', name: 'Vertrieb',
      verweise: [{ ziel: 'HOL:angebot', art: 'unterprozess' },
                 { ziel: 'SHB:giessen', art: 'folgt' }] },
    { id: 'angebot',  band: 'kern', name: 'Angebot erstellen' },
  ] },
  SHB: { kacheln: [ { id: 'giessen', band: 'kern', name: 'Gießen' } ] },
} };
_lkWerk = 'HOL';
`, gctx);

const graph = await vm.runInContext('vkGraphBauen()', gctx);
const kante = (von, nach) => graph.kanten.find(k => k.von === von && k.nach === nach);

ok(!!kante('prozess:HOL:vertrieb', 'prozess:HOL:angebot'),
  'Der Unterprozess ist eine Kante im Graphen');
const querKante = kante('prozess:HOL:vertrieb', 'prozess:SHB:giessen');
ok(!!querKante, 'Und die Kette läuft über die Gesellschaftsgrenze – beide Enden sind Knoten');
ok(/danach folgt/i.test(querKante.typ || ''), `Die Kante trägt ihre Art: „${querKante && querKante.typ}"`);
ok(graph.knoten.has('prozess:SHB:giessen'),
  'Weil der Graph ohnehin über alle Werke läuft, existiert das Ziel bereits');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
