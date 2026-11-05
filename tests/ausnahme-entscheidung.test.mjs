/**
 * Ausnahmeregister: wer entschieden hat, und das Risiko dazu.
 *
 * Eine Freigabe kommt oft per Mail, eingetragen wird sie vom ISB. Bis hierher
 * stand dann der ISB als Entscheider im Register, und die Person, die das
 * Restrisiko tatsächlich akzeptiert hat, fehlte. Worauf es ankommt:
 *   • „Entschieden von" und „Entschieden am" lassen sich setzen; ohne Angabe
 *     gilt die angemeldete Person und der heutige Tag.
 *   • Der Verlauf nennt beide: wer entschieden und wer es erfasst hat.
 *   • Das Vier-Augen-Prinzip prüft gegen die Person, die entschieden hat, nicht
 *     gegen die, die erfasst.
 *   • Das verknüpfte Risiko steht im Editor auch dann, wenn das Risiko-Register
 *     im Browser noch nicht geladen war; es wird nachgeholt.
 *   • Das Risiko zeigt die Ausnahmen, die auf es verweisen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { jsArg } = require('../js/util.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split(String.fromCharCode(13)).join('');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const gemeldet = [], gefragt = [], geschrieben = [];
const felder = {};
const ctx = {
  console, JSON, Date, Array, Object, String, Number, Math, Set, Map, Promise, isNaN, parseInt,
  setTimeout: () => {}, esc, jsArg,
  fmtDate: (s) => String(s ?? '').slice(0, 10), fmtDateTime: (s) => String(s ?? ''),
  emptyState: (t) => t, toast: (t) => gemeldet.push(t),
  openModal: (h) => { ctx.__modal = h; }, closeModal: () => {},
  uiConfirm: async (text) => { gefragt.push(text); return true; },
  canWriteTab: () => true, canReadTab: () => true,
  STANDORTE: ['HOL', 'SHB'], geltungSichtbar: () => true,
  State: { user: { name: 'Max Muster', upn: 'max.muster@dihag.com' }, policies: [{ id: '112', titel: 'ISMS-Richtlinie für Mitarbeiter', status: 'Entwurf' }] },
  RISK_E_LABELS: ['', '1', '2', '3', '4', '5'], RISK_A_LABELS: ['', '1', '2', '3', '4', '5'],
  _riskScoreBadge: (e, a) => `<b>${e * a}</b>`,
  document: { getElementById: (id) => felder[id] || null },
  spGetExceptions: async () => [], spMissingExceptionColumns: () => [],
  spUpdateException: async (id, a) => { geschrieben.push(JSON.parse(JSON.stringify(a))); },
  spAddException: async () => '1',
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/ausnahmen.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
run(`excHeute = () => '2026-10-21'; _excs = [];`);

const bau = (o) => Object.assign({
  id: '6', titel: 'Smartphone ohne MDM', beschreibung: 'weicht ab', richtlinieId: '112', richtlinieTitel: 'ISMS-Richtlinie für Mitarbeiter',
  abschnitt: '', begruendung: 'Zukunftsgeschäft', antragsteller: 'max.muster@dihag.com', werke: ['HOL'], risiko: { e: 3, a: 4 }, risikoId: '13',
  kompensation: 'Konten entfernen', status: 'beantragt', befristetBis: '2027-04-30T00:00:00Z', entscheider: '', entschiedenAm: '',
  entscheidungKommentar: '', isb: 'max.muster@dihag.com', isbAm: '2026-10-20T00:00:00Z', historie: [],
}, o);

/* ══ 1) Wer entschieden hat ══ */
console.log('Entschieden von');
run(`_excEditing = ${JSON.stringify(bau({}))}; renderAusnahmeEditor();`);
ok(/<label>Entschieden von \(E-Mail\)<\/label>/.test(ctx.__modal) && /id="exc-entschieden-am" value="2026-10-21" max="2026-10-21"/.test(ctx.__modal),
  'Der Editor fragt, wer entschieden hat und wann (heute vorbelegt, nicht in der Zukunft)');
run(`_excEditing = ${JSON.stringify(bau({ status: 'abgelehnt' }))}; renderAusnahmeEditor();`);
ok(!/Entschieden von \(E-Mail\)/.test(ctx.__modal), 'Ist schon entschieden und nichts mehr zu tun, fehlen die Felder');

run(`_excEditing = ${JSON.stringify(bau({ entscheidungKommentar: 'Freigabe per Mail' }))}; _excEditing._entscheiderNeu = ' pruefer2@dihag.com '; _excEditing._entschiedenAmNeu = '2026-10-21';`);
await run(`entscheideAusnahme('genehmigt')`);
const g = geschrieben.pop();
ok(g && g.status === 'genehmigt' && g.entscheider === 'pruefer2@dihag.com' && g.entschiedenAm === '2026-10-21T12:00:00.000Z',
  'Genehmigt mit der Person, die entschieden hat, und ihrem Datum');
const v = g && g.historie[g.historie.length - 1];
ok(v && v.wer === 'Max Muster' && v.aktion === 'genehmigt (entschieden von pruefer2@dihag.com am 21.10.2026): Freigabe per Mail',
  'Der Verlauf nennt, wer entschieden und wer erfasst hat');
ok(!('_entscheiderNeu' in g) && !('_entschiedenAmNeu' in g), 'Die Eingabefelder selbst werden nicht gespeichert');
ok(/Entschieden von pruefer2@dihag.com am 21\.10\.2026, erfasst unter Ihrem Namen\./.test(gefragt.pop()), 'Die Rückfrage sagt es vorher');

run(`_excEditing = ${JSON.stringify(bau({ antragsteller: 'bob@dihag.com' }))};`);
await run(`entscheideAusnahme('genehmigt')`);
const s = geschrieben.pop();
ok(s && s.entscheider === 'max.muster@dihag.com' && s.historie[s.historie.length - 1].aktion === 'genehmigt',
  'Ohne Angabe gilt wie bisher die angemeldete Person (Vier-Augen: hier ist sie nicht die Antragstellerin)');

console.log('Prüfungen');
geschrieben.length = 0; gemeldet.length = 0;
run(`_excEditing = ${JSON.stringify(bau({ antragsteller: 'pruefer2@dihag.com' }))}; _excEditing._entscheiderNeu = 'pruefer2@dihag.com';`);
await run(`entscheideAusnahme('genehmigt')`);
ok(!geschrieben.length && /Vier-Augen/.test(gemeldet.join(' ')), 'Vier Augen zählen gegen die Person, die entschieden hat, nicht gegen die, die erfasst');
gemeldet.length = 0;
run(`_excEditing = ${JSON.stringify(bau({}))}; _excEditing._entscheiderNeu = 'Dirk';`);
await run(`entscheideAusnahme('genehmigt')`);
ok(!geschrieben.length && /E-Mail-Adresse/.test(gemeldet.join(' ')), 'Ein Name ohne Adresse reicht nicht');
gemeldet.length = 0;
run(`_excEditing = ${JSON.stringify(bau({}))}; _excEditing._entscheiderNeu = 'pruefer2@dihag.com'; _excEditing._entschiedenAmNeu = '2026-10-30';`);
await run(`entscheideAusnahme('genehmigt')`);
ok(!geschrieben.length && /Zukunft/.test(gemeldet.join(' ')), 'Eine Entscheidung von morgen gibt es nicht');

/* ══ 2) Das verknüpfte Risiko ══ */
console.log('Verknüpftes Risiko');
const O = (a, l) => run('_excRisikoOptionen')(a, l);
ok(/<option value="13" selected>Risiko Nr\. 13<\/option>/.test(O({ risikoId: '13' }, [])), 'Nicht geladen: Das Risiko steht mit seiner Nummer da, nicht als „keins"');
ok(/<option value="13" selected>Nr\. 13 · Datenabfluss<\/option>/.test(O({ risikoId: '13' }, [{ id: '13', titel: 'Datenabfluss' }])), 'Geladen: mit Nummer und Titel, ausgewählt');
ok(/Risiko Nr\. 13 \(nicht gefunden\)/.test(O({ risikoId: '13' }, [{ id: '2', titel: 'X' }])), 'Gelöscht: Die Nummer bleibt sichtbar, mit Hinweis');
ok(/<option value="" selected>– keins –<\/option>/.test(O({ risikoId: '' }, [{ id: '2', titel: 'X' }])), 'Ohne Verknüpfung: keins');

felder['exc-risiko'] = { innerHTML: '' };
felder['exc-risiko-hinweis'] = { textContent: 'Risiko-Register wird geladen …', style: { display: '' } };
ctx._risks = null;
let geladen = 0;
ctx.spGetRisks = async () => { geladen++; return [{ id: '13', titel: 'Datenabfluss' }, { id: '25', titel: 'Smartphone ohne MDM' }]; };
run(`_excs = [${JSON.stringify(bau({}))}]; _excMembers = [];`);
await run(`openAusnahmeEditor('6')`);
await new Promise(r => setImmediate(r));
ok(geladen === 1 && /value="13" selected>Nr\. 13 · Datenabfluss/.test(felder['exc-risiko'].innerHTML) && felder['exc-risiko-hinweis'].style.display === 'none',
  'Beim Öffnen wird das Risiko-Register nachgeladen und die Auswahl gefüllt, ohne den Editor neu zu zeichnen');
ok(/id="exc-risiko"/.test(ctx.__modal) && /Risiko-Register wird geladen/.test(ctx.__modal), 'Bis dahin steht da, dass geladen wird');
await run(`openAusnahmeEditor('6')`);
ok(geladen === 1, 'Ein zweites Öffnen liest nicht noch einmal');

/* ══ 3) Das Risiko zeigt seine Ausnahmen ══ */
console.log('Am Risiko');
const rctx = { console, JSON, Date, Array, Object, String, Number, Math, Set, Map, Promise, esc, jsArg,
  fmtDate: (s) => String(s ?? '').slice(0, 10), canReadTab: () => true, State: { user: { upn: 'max.muster@dihag.com' } },
  document: { getElementById: () => null } };
rctx.window = rctx; rctx.globalThis = rctx;
vm.createContext(rctx);
vm.runInContext(lies('js/risiken.js'), rctx);
vm.runInContext(`_rkAusnahmen = ${JSON.stringify([bau({ risikoId: '25', status: 'genehmigt', entscheider: 'pruefer2@dihag.com' }), bau({ id: '4', risikoId: '13', titel: 'Anderes' })])};`, rctx);
const h = vm.runInContext(`_rkAusnahmenHtml('25')`, rctx);
ok(/⚖️ Ausnahmen zu diesem Risiko/.test(h) && /Nr\. 6 · <b>Smartphone ohne MDM<\/b> · genehmigt, befristet bis 2027-04-30, entschieden von pruefer2@dihag.com/.test(h) && !/Anderes/.test(h),
  'Das Risiko nennt seine Ausnahme mit Status, Frist und Entscheider, nur die eigene');
ok(vm.runInContext(`_rkAusnahmenHtml('99')`, rctx) === '' && vm.runInContext(`_rkAusnahmenHtml('')`, rctx) === '', 'Ohne Ausnahme oder bei einem neuen Risiko: nichts');
rctx.canReadTab = (t) => t !== 'ausnahmen';
ok(vm.runInContext(`_rkAusnahmenHtml('25')`, rctx) === '', 'Ohne Leserecht auf das Ausnahmeregister steht dort nichts');
const rk = lies('js/risiken.js');
ok(/<div id="rk-ausnahmen">\$\{_rkAusnahmenHtml\(r\.id\)\}<\/div>/.test(rk) && /spGetExceptionsLeise\(\)\.then/.test(rk), 'Der Risiko-Editor zeigt den Block und liest die Ausnahmen bei Bedarf nach');

const doku = lies('js/dokumentation.js');
ok(/„Entschieden von"/.test(doku) && /Ausnahmen, die auf es verweisen/.test(doku), 'Die Dokumentation erklärt beides');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
