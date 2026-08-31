/**
 * Ineinandergreifende Prozesse: einmal gepflegt, für mehrere Hauptprozesse.
 *
 * „Bedarfsanforderung" gehört zu Source-to-Pay und zu Plan-to-Fulfill. Sie
 * zweimal zu pflegen wäre der Anfang vom Auseinanderlaufen: Die eine Fassung
 * wird geändert, die andere vergessen, und ab da gibt es zwei Wahrheiten.
 *
 * Deshalb gibt es sie genau einmal. Mehrere Hauptprozesse zeigen mit
 * „Unterprozess" auf dieselbe Kachel – die Beziehung liegt bei den Eltern, der
 * Prozess selbst weiß nichts davon und muss nichts wissen.
 *
 * Geprüft wird vor allem, was daran schiefgehen kann:
 *   • dass man der Kachel ansieht, dass sie geteilt ist (sonst ändert jemand
 *     etwas und ahnt nicht, dass drei Hauptprozesse daran hängen),
 *   • dass sich die Gliederung aufklappen lässt, rekursiv,
 *   • und dass ein Kreis weder beim Pflegen entsteht noch beim Aufklappen
 *     einfriert.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const gemeldet = [];
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Promise,
  esc: (s) => String(s ?? ''),
  document: { getElementById: () => null, querySelectorAll: () => [] },
  toast: (t) => gemeldet.push(t),
  openModal: () => {}, closeModal: () => {}, canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC'],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* Zwei Hauptprozesse teilen sich denselben Unterprozess – und der hat selbst
   noch einen. Genau die Form, um die es geht. */
run(`
_lkDaten = { karten: {
  HOL: { kacheln: [
    { id: 's2p',    band: 'kern', name: 'Source to Pay',
      verweise: [{ ziel: 'HOL:banf', art: 'unterprozess' }] },
    { id: 'p2f',    band: 'kern', name: 'Plan to Fulfill',
      verweise: [{ ziel: 'HOL:banf', art: 'unterprozess' },
                 { ziel: 'HOL:fertigung', art: 'unterprozess' }] },
    { id: 'banf',   band: 'unterstuetzung', name: 'Bedarfsanforderung',
      verweise: [{ ziel: 'HOL:freigabe', art: 'unterprozess' },
                 { ziel: 'SHB:einkauf', art: 'nutzt' }] },
    { id: 'freigabe', band: 'unterstuetzung', name: 'Freigabe' },
    { id: 'fertigung', band: 'kern', name: 'Fertigung' },
  ] },
  SHB: { kacheln: [{ id: 'einkauf', band: 'kern', name: 'Einkauf' }] },
} };
_lkWerk = 'HOL';
`);

/* ── 1) Ein Prozess, mehrere Hauptprozesse ── */
ok(run(`lkUnterprozesse(lkKachelVonId('p2f')).length`) === 2, 'Ein Hauptprozess kennt seine Unterprozesse');
ok(run(`lkUnterprozesse(lkKachelVonId('banf')).map(v => v.kachel.name).join('|')`) === 'Freigabe',
  'Nur „Unterprozess" gliedert – „Nutzt" ist ein Querbezug, keine Gliederung');

const eltern = run(`lkHauptprozesseVon('HOL','banf').map(v => v.kachel.name)`);
ok(eltern.length === 2 && eltern.includes('Source to Pay') && eltern.includes('Plan to Fulfill'),
  'Die Bedarfsanforderung gehört zu beiden Hauptprozessen – als EIN Datensatz');
ok(run(`lkMehrfachVerwendet('HOL','banf')`) === true, 'Und ist damit als geteilt erkennbar');
ok(run(`lkMehrfachVerwendet('HOL','fertigung')`) === false, 'Ein Prozess mit einem Elternteil ist es nicht');
ok(run(`lkKacheln().filter(k => k.name === 'Bedarfsanforderung').length`) === 1,
  'Sie steht genau einmal in der Karte – nicht je Hauptprozess einmal');

/* Ein dritter Hauptprozess kommt dazu: nur bei IHM wird etwas eingetragen. */
run(`lkVerweisSetzen('fertigung','HOL:banf','unterprozess')`);
ok(run(`lkHauptprozesseVon('HOL','banf').length`) === 3, 'Ein weiterer Hauptprozess trägt sie bei sich ein …');
ok(run(`JSON.stringify(lkKachelVonId('banf').verweise)`) === JSON.stringify(
  [{ ziel: 'HOL:freigabe', art: 'unterprozess' }, { ziel: 'SHB:einkauf', art: 'nutzt' }]),
  '… und am Unterprozess selbst ändert sich dabei nichts');

/* ── 2) Aufklappen ── */
ok(run(`_lkAufgeklappt.size`) === 0, 'Zunächst ist alles zugeklappt');
ok(run(`_lkUnterbaumHtml('HOL', lkKachelVonId('p2f'), [])`) === '',
  'Zugeklappt zeigt die Kachel keine Gliederung');

run(`lkAufklappen('HOL','p2f')`);
const baum = run(`_lkUnterbaumHtml('HOL', lkKachelVonId('p2f'), [])`);
ok(baum.includes('Bedarfsanforderung') && baum.includes('Fertigung'), 'Aufgeklappt stehen die Unterprozesse da');
ok(/lkSpringeZu\('HOL','banf'\)/.test(baum), 'Jede Zeile springt auf ihren Prozess');
ok(/⇄ 3/.test(baum), 'Und der geteilte Prozess trägt sein Zeichen samt Zahl');
ok(!baum.includes('Freigabe'), 'Die zweite Ebene bleibt zu, bis man sie aufklappt');

run(`lkAufklappen('HOL','banf')`);
const tiefer = run(`_lkUnterbaumHtml('HOL', lkKachelVonId('p2f'), [])`);
ok(tiefer.includes('Freigabe'), 'Aufgeklappt reicht die Gliederung so tief, wie sie geht');
ok((tiefer.match(/lk-unterbaum/g) || []).length === 2, 'Und zwar verschachtelt, nicht flach');

run(`lkAufklappen('HOL','p2f')`);
ok(run(`_lkUnterbaumHtml('HOL', lkKachelVonId('p2f'), [])`) === '', 'Zuklappen klappt zu');
run(`lkAlleAufklappen(true)`);
ok(run(`_lkAufgeklappt.size`) === 4,
  'Alles auf: jeder Prozess mit Unterprozessen (s2p, p2f, banf und die eben ergänzte Fertigung)');
run(`lkAlleAufklappen(false)`);
ok(run(`_lkAufgeklappt.size`) === 0, 'Und alles wieder zu');

/* ── 3) Das Zeichen an der Kachel ──
   Ohne es sähe man einer Kachel nicht an, dass drei Hauptprozesse daran hängen. */
const zeichen = run(`_lkGliederungZeichen('HOL', lkKachelVonId('banf'))`);
ok(/⇄ 3/.test(zeichen), 'Die Kachel sagt, zu wie vielen Hauptprozessen sie gehört');
ok(/lk-geteilt-mehr/.test(zeichen), 'Mehrfach verwendet wird hervorgehoben');
ok(/lkAufklappen\('HOL','banf'/.test(zeichen), 'Und sie lässt sich von dort aufklappen');
ok(!/⇄/.test(run(`_lkGliederungZeichen('HOL', lkKachelVonId('s2p'))`)),
  'Ein Hauptprozess ohne Eltern trägt kein Zeichen');
const lk = lies('js/landkarte.js');
ok(/\$\{_lkUnterbaumHtml\(_lkWerk, k, \[\]\)\}/.test(lk), 'Der Baum hängt an der Kachel …');
ok((lk.match(/_lkUnterbaumHtml\(_lkWerk, k, \[\]\)/g) || []).length === 2,
  '… und ebenso am Kernprozess-Pfeil');

/* ── 4) Kreise: weder eintragbar noch einfrierend ──
   „A enthält B enthält A" hängt jedes Aufklappen auf. */
gemeldet.length = 0;
ok(run(`lkVerweisSetzen('banf','HOL:banf','unterprozess')`) === false,
  'Ein Prozess kann nicht sein eigener Unterprozess sein');
ok(/eigener Unterprozess/.test(gemeldet.join(' ')), 'Und bekommt das gesagt');

gemeldet.length = 0;
ok(run(`lkIstNachfahre('HOL:p2f','HOL:freigabe')`) === true,
  'Die Freigabe hängt über zwei Ecken unter Plan to Fulfill');
ok(run(`lkVerweisSetzen('freigabe','HOL:p2f','unterprozess')`) === false,
  'Sie darf Plan to Fulfill deshalb nicht als Unterprozess bekommen – das wäre ein Kreis');
ok(/Kreis/.test(gemeldet.join(' ')), 'Auch das wird gesagt, statt still zu scheitern');
ok(run(`lkVerweisSetzen('freigabe','HOL:p2f','nutzt')`) === true,
  'Als Querbezug ist derselbe Verweis in Ordnung – nur die Gliederung darf keine Kreise haben');

/* Ein Kreis aus dem Altbestand darf die Anzeige nicht aufhängen. */
run(`
_lkDaten.karten.HOL.kacheln.push({ id: 'a', band: 'kern', name: 'A', verweise: [{ ziel: 'HOL:b', art: 'unterprozess' }] });
_lkDaten.karten.HOL.kacheln.push({ id: 'b', band: 'kern', name: 'B', verweise: [{ ziel: 'HOL:a', art: 'unterprozess' }] });
lkAufklappen('HOL','a'); lkAufklappen('HOL','b');
`);
const kreis = run(`_lkUnterbaumHtml('HOL', lkKachelVonId('a'), [])`);
ok(kreis.includes('lk-kreis'), 'Ein vorhandener Kreis wird als solcher gezeigt …');
ok((kreis.match(/lk-unterzeile/g) || []).length <= 4, '… und die Rekursion bricht dort ab, statt endlos zu laufen');
ok(run(`lkIstNachfahre('HOL:a','HOL:gibtesnicht')`) === false,
  'Und die Prüfung selbst läuft sich an einem Kreis nicht fest');

/* ── 5) Im Dialog steht der Satz, um den es geht ── */
const html = run(`_lkVerweiseHtml('HOL', lkKachelVonId('banf'))`);
ok(/Wird von 3\s*\n?\s*Hauptprozessen verwendet/.test(html.replace(/\s+/g, ' ')),
  'Der Dialog sagt, von wie vielen Hauptprozessen der Prozess verwendet wird');
ok(/nur einmal gepflegt/.test(html), 'Und dass er deshalb nur einmal gepflegt wird');
ok(/Eine Änderung hier wirkt in allen/.test(html), 'Samt der Folge – sonst ändert jemand ahnungslos für drei');
ok(!/Wird von/.test(run(`_lkVerweiseHtml('HOL', lkKachelVonId('s2p'))`)),
  'Bei einem Prozess ohne mehrere Eltern steht der Hinweis nicht');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
