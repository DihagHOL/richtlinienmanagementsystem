/**
 * Wirksamkeit & Verbesserung – ISO 27001 9.2, 9.3, 10.2
 *
 * Drei Kapitel, die das System bisher nur benennen konnte. `js/normen.js` führt
 * sie im Katalog, und die IMS-Abdeckung ließ eine Richtlinie daran hängen –
 * eine Richtlinie beschreibt aber, wie etwas laufen *soll*. Dass ein Audit
 * stattgefunden hat und eine Maßnahme anschließend als wirksam bewertet wurde:
 * dafür gab es keinen Ort.
 *
 * Der Prüfstein ist deshalb nicht, ob sich etwas erfassen lässt, sondern ob
 * sich etwas **nicht abschließen** lässt. Vor allem der dritte Schritt aus
 * 10.2 – nachsehen, ob die Maßnahme geholfen hat – wird in der Praxis
 * übersprungen: Die Maßnahme gilt als „gemacht", und damit ist die Sache erledigt.
 * Hier ist sie es nicht.
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
let bestaetigt = true;
const geschrieben = [];
const geholt = [];

const ctx = {
  console, JSON, Date, Array, Object, String, Number, Math, Set, Map, Promise, parseInt, isNaN,
  setTimeout: () => {},
  esc: (s) => String(s ?? ''),
  fmtDate: (s) => String(s ?? '').slice(0, 10),
  fmtDateTime: (s) => String(s ?? ''),
  emptyState: (t) => `<empty>${t}</empty>`,
  toast: (t) => gemeldet.push(t),
  openModal: (h) => { ctx.__modal = h; },
  closeModal: () => { ctx.__modal = null; },
  uiConfirm: async () => bestaetigt,
  canWriteTab: () => true,
  canReadTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC', 'ZAI'],
  State: { user: { name: 'Anna Muster', upn: 'anna@dihag.com' } },
  geltungSichtbar: () => true,
  document: {
    getElementById: () => null,
    createElement: () => ({ click() { geholt.push(this.download); } }),
  },
  Blob: function (t) { this.t = t; },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  spGetWirk: async () => JSON.parse(JSON.stringify(ctx.__bestand || [])),
  spAddWirk: async (w) => { geschrieben.push(['add', w]); return '77'; },
  spUpdateWirk: async (id, w) => { geschrieben.push(['update', id, w]); },
  spDeleteWirk: async (id) => { geschrieben.push(['delete', id]); },
  spMissingWirkColumns: () => [],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/wirksamkeit.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

run(`wirkHeute = () => '2026-09-07';`);

const abw = (o) => Object.assign({
  id: '1', titel: 'Zugriffsrechte nicht entzogen', art: 'abweichung', beschreibung: 'nach Austritt',
  datum: '2026-08-01T00:00:00Z', verantwortlich: 'chef@dihag.com', beteiligte: [], werke: [],
  status: 'in Umsetzung', quelle: 'internes Audit', herkunftId: '', ursache: 'Offboarding ohne IT-Schritt',
  massnahmen: [{ titel: 'Checkliste ergänzen', verantwortlich: 'it@dihag.com', frist: '2026-09-30', status: 'erledigt' }],
  wirksamkeit: 'Stichprobe über 10 Austritte: alle entzogen', wirksamAm: '', umfang: '', eingaben: [],
  ergebnis: '', normbezug: '', historie: [],
}, o);

/* ── 1) 10.2 in drei Schritten – jeder einzeln erzwungen ── */
const fehlt = (o, teil) => {
  ctx.__w = abw(o);
  return run(`wirkAbschlussfehler(__w)`).some(m => m.includes(teil));
};
ctx.__w = abw({});
ok(run(`wirkAbschlussfehler(__w).length`) === 0, 'Vollständig behandelt lässt sich abschließen');
ok(fehlt({ ursache: '' }, 'Ursache'),
  'Ohne Ursache nicht – sonst behandelt die Maßnahme nur das Symptom');
ok(fehlt({ massnahmen: [] }, 'Keine Korrekturmaßnahme'), 'Ohne Maßnahme nicht');
ok(fehlt({ massnahmen: [{ titel: 'x', status: 'offen' }] }, 'Keine der Maßnahmen ist erledigt'),
  'Mit nur offenen Maßnahmen nicht');
ok(fehlt({ wirksamkeit: '   ' }, 'Wirksamkeit'),
  'Und ohne Wirksamkeitsbewertung nicht – „erledigt" heißt nicht „hat geholfen"');
ok(fehlt({ titel: '' }, 'Bezeichnung') && fehlt({ datum: '' }, 'Datum'),
  'Bezeichnung und Datum gelten für jede Satzart');

/* ── 2) 9.2 Internes Audit ── */
const audit = (o) => Object.assign({
  id: '2', titel: 'Audit Zutritt WGC', art: 'audit', datum: '2026-06-01T00:00:00Z',
  beteiligte: ['aud@dihag.com'], umfang: 'Zutrittskontrolle Werk WGC gegen A.7',
  ergebnis: '2 Feststellungen', werke: ['WGC'], status: 'offen', massnahmen: [], eingaben: [], historie: [],
}, o);
ctx.__w = audit({});
ok(run(`wirkAbschlussfehler(__w).length`) === 0, 'Ein vollständiges Audit lässt sich abschließen');
ctx.__w = audit({ umfang: '' });
ok(run(`wirkAbschlussfehler(__w)`).some(m => m.includes('Auditumfang')), 'Ohne Umfang nicht – was wurde geprüft?');
ctx.__w = audit({ beteiligte: [] });
ok(run(`wirkAbschlussfehler(__w)`).some(m => m.includes('Auditor')), 'Ohne Auditor nicht');
ctx.__w = audit({ ergebnis: '' });
ok(run(`wirkAbschlussfehler(__w)`).some(m => m.includes('Ergebnis')), 'Ohne Ergebnis nicht');
ctx.__w = audit({});
ok(!run(`wirkAbschlussfehler(__w)`).some(m => m.includes('Ursache')),
  'Ein Audit braucht keine Ursache – die Bedingungen gelten je Satzart, nicht pauschal');

/* ── 3) 9.3 Managementbewertung: die acht Pflichteingaben ── */
ok(run(`WIRK_EINGABEN.length`) === 8, 'ISO 9.3.2 zählt acht Eingaben auf – alle acht stehen im Register');
const alleIds = run(`WIRK_EINGABEN.map(e => e.id)`);
const bew = (o) => Object.assign({
  id: '3', titel: 'Managementbewertung 2026', art: 'bewertung', datum: '2026-03-01T00:00:00Z',
  beteiligte: ['gl@dihag.com'], ergebnis: 'Budget freigegeben', eingaben: alleIds.slice(),
  werke: [], status: 'offen', massnahmen: [], historie: [],
}, o);
ctx.__w = bew({});
ok(run(`wirkAbschlussfehler(__w).length`) === 0, 'Mit allen acht Haken lässt sie sich abschließen');
ctx.__w = bew({ eingaben: alleIds.slice(0, 6) });
const luecke = run(`wirkAbschlussfehler(__w)`);
ok(luecke.some(m => m.includes('2 Pflichteingabe')), 'Fehlen zwei, sagt es das …');
ok(luecke.some(m => /Risikobeurteilung|Verbesserung/.test(m)), '… und nennt sie beim Namen, nicht nur die Zahl');
ctx.__w = bew({ beteiligte: [] });
ok(run(`wirkAbschlussfehler(__w)`).some(m => m.includes('Teilnehmenden')), 'Ohne Teilnehmende nicht');
ctx.__w = bew({ ergebnis: '' });
ok(run(`wirkAbschlussfehler(__w)`).some(m => m.includes('Entscheidungen')), 'Ohne Entscheidungen nicht');

/* ── 4) Fristen ── */
ctx.__w = abw({ massnahmen: [
  { titel: 'a', frist: '2026-08-01', status: 'offen' },
  { titel: 'b', frist: '2026-12-01', status: 'offen' },
  { titel: 'c', frist: '2020-01-01', status: 'erledigt' },
] });
ok(run(`wirkOffeneMassnahmen(__w).length`) === 2, 'Erledigte Maßnahmen zählen nicht mehr als offen');
ok(run(`wirkUeberfaellig(__w).length`) === 1, 'Überfällig ist nur, was offen UND über der Frist ist');
ok(run(`wirkUeberfaellig(__w)[0].titel`) === 'a', 'Und zwar die richtige');
ctx.__w = abw({ massnahmen: [{ titel: 'ohne Frist', status: 'offen' }] });
ok(run(`wirkUeberfaellig(__w).length`) === 0, 'Ohne Frist kann nichts überfällig sein');

/* ── 5) Der Zusammenhang: Audit → Abweichung ── */
run(`_wirk = [
  { id:'10', art:'audit', titel:'Audit A', datum:'2026-06-01T00:00:00Z', werke:[], massnahmen:[], eingaben:[] },
  { id:'11', art:'abweichung', titel:'Fund 1', herkunftId:'10', werke:[], massnahmen:[], eingaben:[] },
  { id:'12', art:'abweichung', titel:'Fund 2', herkunftId:'10', werke:[], massnahmen:[], eingaben:[] },
  { id:'13', art:'abweichung', titel:'ohne Herkunft', herkunftId:'', werke:[], massnahmen:[], eingaben:[] },
];`);
ok(run(`wirkFolgen('10').length`) === 2, 'Ein Audit kennt die Abweichungen, die daraus entstanden sind');
ok(run(`wirkFolgen('99').length`) === 0 && run(`wirkFolgen('').length`) === 0, 'Ohne Treffer bleibt es leer');
run(`wirkAbweichungAus('10')`);
ok(run(`_wirkEditing.art`) === 'abweichung' && run(`_wirkEditing.herkunftId`) === '10'
   && run(`_wirkEditing.quelle`) === 'internes Audit',
  'Aus einem Audit heraus angelegt, trägt die Abweichung ihre Herkunft von selbst');

/* ── 6) Trennung nach Gesellschaft ── */
run(`geltungSichtbar = (g) => !Array.isArray(g) || !g.length || g.includes('WGC');
_wirk = [
  { id:'1', art:'abweichung', titel:'WGC', werke:['WGC'], massnahmen:[], eingaben:[] },
  { id:'2', art:'abweichung', titel:'ZAI', werke:['ZAI'], massnahmen:[], eingaben:[] },
  { id:'3', art:'abweichung', titel:'konzernweit', werke:[], massnahmen:[], eingaben:[] },
];`);
const sicht = run(`wirkSichtbare().map(w => w.titel)`);
ok(sicht.length === 2 && !sicht.includes('ZAI'), 'Fremde Gesellschaften bleiben verborgen, Konzernweites nicht');
run(`geltungSichtbar = () => true;`);

/* ── 7) Sortierung: was drängt, steht oben ── */
run(`_wirk = [
  { id:'1', art:'abweichung', titel:'ruhig',      status:'abgeschlossen', datum:'2026-01-01', werke:[], massnahmen:[], eingaben:[] },
  { id:'2', art:'abweichung', titel:'ueberfaellig', status:'offen', datum:'2026-02-01', werke:[], eingaben:[],
    massnahmen:[{ titel:'x', frist:'2026-01-01', status:'offen' }] },
  { id:'3', art:'audit', titel:'offen', status:'offen', datum:'2026-03-01', werke:[], massnahmen:[], eingaben:[] },
];
_wirkFilter = { q:'', art:'', status:'', werk:'' };`);
ok(run(`_wirkGefiltert().map(w => w.titel).join('|')`) === 'ueberfaellig|offen|ruhig',
  'Überfälliges zuerst, dann Offenes, dann der Rest');
run(`_wirkFilter.art = 'audit';`);
ok(run(`_wirkGefiltert().length`) === 1, 'Nach Satzart lässt sich filtern');
run(`_wirkFilter = { q:'', art:'', status:'', werk:'' };`);

/* ── 8) Speichern und Abschließen ── */
run(`_wirk = []; _wirkEditing = ${JSON.stringify(abw({ id: null, titel: '' }))};`);
gemeldet.length = 0; geschrieben.length = 0;
await run(`saveWirk()`);
ok(!geschrieben.length && /Bezeichnung/.test(gemeldet.join(' ')), 'Ohne Bezeichnung wird nicht gespeichert');

run(`_wirkEditing = ${JSON.stringify(abw({ id: null }))};`);
geschrieben.length = 0;
await run(`saveWirk()`);
ok(geschrieben.length === 1 && geschrieben[0][0] === 'add', 'Vollständiges wird angelegt');
ok(geschrieben[0][1].historie.length === 1 && /angelegt \(abweichung\)/.test(geschrieben[0][1].historie[0].aktion),
  'Der Verlauf hält die Satzart fest');

/* Abgeschlossen darf nur bleiben, was auch abschliessbar ist. */
run(`_wirkEditing = ${JSON.stringify(abw({ id: '5', status: 'abgeschlossen', wirksamkeit: '' }))};`);
gemeldet.length = 0; geschrieben.length = 0;
await run(`saveWirk()`);
ok(!geschrieben.length && /Wirksamkeit/.test(gemeldet.join(' ')),
  'Der Status „abgeschlossen" lässt sich nicht am Prüfschritt vorbei setzen');

run(`_wirkEditing = ${JSON.stringify(abw({ id: '5', status: 'in Umsetzung', wirksamkeit: '' }))};`);
gemeldet.length = 0; geschrieben.length = 0;
await run(`wirkAbschliessen()`);
ok(!geschrieben.length && /Wirksamkeit/.test(gemeldet.join(' ')), 'Und der Knopf „Abschließen" ebenso wenig');

run(`_wirkEditing = ${JSON.stringify(abw({ id: '5', status: 'in Umsetzung' }))};`);
geschrieben.length = 0;
await run(`wirkAbschliessen()`);
const g = geschrieben[0][2];
ok(g.status === 'abgeschlossen' && !!g.wirksamAm,
  'Vollständig behandelt wird abgeschlossen – das Datum der Wirksamkeitsprüfung setzt sich mit');
ok(g.historie.some(h => h.aktion === 'abgeschlossen'), 'Und steht im Verlauf');

run(`_wirkEditing = ${JSON.stringify(abw({ id: '5', status: 'in Umsetzung' }))};`);
ctx.spUpdateWirk = async () => { throw new Error('Netz weg'); };
gemeldet.length = 0;
await run(`wirkAbschliessen()`);
ok(run(`_wirkEditing.historie.length`) === 0 && /Netz weg/.test(gemeldet.join(' ')),
  'Scheitert das Speichern, bleibt kein Verlaufseintrag zurück, der nie stattfand');
ctx.spUpdateWirk = async (id, w) => { geschrieben.push(['update', id, w]); };

run(`canWriteTab = () => false; _wirkEditing = ${JSON.stringify(abw({ id: '5' }))};`);
geschrieben.length = 0; gemeldet.length = 0;
await run(`saveWirk()`);
await run(`wirkAbschliessen()`);
ok(!geschrieben.length, 'Ohne Schreibrecht geht weder speichern noch abschließen');
run(`canWriteTab = () => true;`);

/* ── 9) Export ── */
run(`_wirk = [ ${JSON.stringify(abw({ titel: 'Semikolon; und "Anführung"' }))} ];
_wirkFilter = { q:'', art:'', status:'', werk:'' };`);
geholt.length = 0;
run(`wirkExportCsv()`);
ok(geholt[0] === 'Wirksamkeit_2026-09-07.csv', 'Der Export trägt das Datum im Namen');

/* ── 10) Angeschlossen? ── */
const html = lies('index.html'), acc = lies('js/access.js'), app = lies('js/app.js');
const sp = lies('js/sharepoint.js'), ck = lies('js/cockpit.js'), cl = lies('js/clevelreport.js');
const karte = lies('js/module.js');
ok(/id="view-wirksamkeit"/.test(html) && /id="wirksamkeit-mount"/.test(html), 'Ansicht und Ankerpunkt stehen im HTML');
ok(/id="nav-wirksamkeit"/.test(html), 'Der Navigationseintrag ebenso');
ok(/view: 'wirksamkeit'/.test(acc), 'Der Reiter ist einzeln berechtigbar');
ok(/if \(view === 'wirksamkeit'.*initWirksamkeit/.test(app), 'Der Reiterwechsel ruft die Ansicht auf');
ok(/'wirksamkeit'/.test(karte), 'Das Modul steht in der Nachlade-Karte');
ok(/wirkList:\s*'Wirksamkeit'/.test(sp), 'Die Liste heißt „Wirksamkeit"');
ok(/spGetWirkLeise/.test(sp) && /spEnsureWirkList\(false\)/.test(sp),
  'Es gibt einen stillen Leseweg, der keine Liste anlegt – für Kachel und Bericht');
ok(/_ckLoadWirksamkeit/.test(ck), 'Das Cockpit hat eine Kachel');
ok(/'ISO 9\.2', 'Internes Audit'/.test(cl) && /'ISO 9\.3', 'Managementbewertung'/.test(cl)
   && /'ISO 10\.2', 'Nichtkonformität und Korrekturmaßnahmen'/.test(cl),
  'Der Audit Report führt alle drei Kapitel als eigene Zeilen');
ok(/ohneWirksamkeit\)\s*\n?\s*add\('ISO 10\.2'[\s\S]{0,120}'gap'/.test(cl),
  'Eine abgeschlossene Abweichung ohne Wirksamkeitsbeleg zählt als Lücke, nicht als Hinweis');

/* Der Dokumentationsabschnitt – gezeichnet, nicht nur vorhanden. */
const dctx = { console, JSON, Date, Array, Object, String, Math, esc: (x) => String(x ?? ''),
  State: { user: {} }, document: { getElementById: () => null } };
dctx.window = dctx; dctx.globalThis = dctx;
vm.createContext(dctx);
vm.runInContext(lies('js/dokumentation.js'), dctx);
const secs = vm.runInContext('_dokuSections()', dctx);
const teil = secs.slice(secs.indexOf('id="doku-wirksamkeit"'));
const doku = teil.slice(0, teil.indexOf('id="doku-ismsdocs"'));
ok(doku.length > 500, 'Der Dokumentationsabschnitt wird gezeichnet');
ok(!/\$\{/.test(doku), 'Ohne sichtbaren Platzhalter');
ok(/9\.2/.test(doku) && /9\.3/.test(doku) && /10\.2/.test(doku), 'Er nennt alle drei Kapitel');
ok(/heißt nicht/.test(doku),
  'Und erklärt den Schritt, der sonst übersprungen wird: erledigt ist nicht behoben');

/* ── 11) Der Erinnerungs-Cron ──
   Eine Frist, von der niemand erfährt, ist ein Datum in einer Spalte. */
const cron = lies('scripts/erinnerungen.mjs');
ok(/Wirksamkeits-Digest/.test(cron), 'Der Cron meldet offene Punkte aus dem Register');
ok(/ismsListe\('Wirksamkeit'\)/.test(cron), 'Und sucht die Liste auf der ISMS-Site');
ok(/ohne Wirksamkeitsbewertung \(ISO 10\.2\)/.test(cron),
  'Er nennt abgeschlossene Abweichungen ohne Wirksamkeitsbeleg ausdrücklich');
ok(/nie aufgezeichnet \(ISO 9\.3\)/.test(cron) && /Monate her/.test(cron),
  'Und eine überfällige Managementbewertung – 9.3 verlangt sie in geplanten Abständen');
ok(/\?ansicht=wirksamkeit/.test(cron), 'Die Mail verlinkt direkt in den Reiter');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
