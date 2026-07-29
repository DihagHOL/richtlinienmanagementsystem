/**
 * Änderungshistorie (Audit-Trail) – Diff-Erkennung, Einträge, Anzeige, Persistenz.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

/* ── admin.js laden ── */
const ctx = {
  console, esc,
  fmtDate: (i) => i ? '01.03.2026' : '–',
  fmtDateTime: () => '01.03.2026 10:00',
  toast: () => {}, canWriteTab: () => true, isReadOnlyTab: () => false,
  emptyState: (t) => `<empty>${t}</empty>`, workflowBadge: () => '', openModal: () => {}, closeModal: () => {},
  document: { getElementById: () => null, querySelector: () => null },
  State: { policies: [], konzepte: [], user: { upn: 'anna@dihag.com', name: 'Anna Admin' } },
  HISTORIE_MAX: 200,
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/admin.js', 'utf8'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* ── 1) Diff erkennt fachliche Änderungen ── */
run(`(() => {
  const alt = newPolicy(); alt.id='1'; alt.title='Alt'; alt.version='1.0'; alt.geltungsbereich=['HOL']; alt.pflicht=true;
  const neu = JSON.parse(JSON.stringify(alt)); neu.title='Neu'; neu.version='2.0'; neu.geltungsbereich=['ALLE']; neu.pflicht=false;
  globalThis.__d = policyDiff(alt, neu);
})()`);
const d = ctx.__d;
ok(d.some(x => x.startsWith('Titel:') && x.includes('Alt') && x.includes('Neu')), 'Diff: Titeländerung mit alt/neu');
ok(d.some(x => x.startsWith('Version:')), 'Diff: Versionsänderung');
ok(d.some(x => x.startsWith('Geltungsbereich:') && x.includes('HOL') && x.includes('ALLE')), 'Diff: Geltungsbereich lesbar');
ok(d.some(x => x.startsWith('Pflichtlektüre:') && x.includes('ja') && x.includes('nein')), 'Diff: Ja/Nein statt true/false');
ok(d.length === 4, `Diff: genau die 4 geänderten Felder (ist ${d.length})`);

run(`const g = newPolicy(); g.id='1'; globalThis.__d0 = policyDiff(g, JSON.parse(JSON.stringify(g)));`);
ok(ctx.__d0.length === 0, 'Diff: keine Einträge ohne Änderung');

/* ── 2) historieAdd schreibt Wer/Wann/Was ── */
run(`(() => {
  const p = newPolicy(); p.id='2';
  historieAdd(p, 'Bearbeitet', 'Titel geändert');
  globalThis.__h = p.historie;
})()`);
const h = ctx.__h;
ok(h.length === 1, 'historieAdd: Eintrag angelegt');
ok(h[0].name === 'Anna Admin' && h[0].upn === 'anna@dihag.com', 'historieAdd: Person erfasst');
ok(!!Date.parse(h[0].datum), 'historieAdd: gültiger Zeitstempel');
ok(h[0].aktion === 'Bearbeitet' && h[0].text === 'Titel geändert', 'historieAdd: Aktion + Text');

run(`const p2 = newPolicy(); p2.id='3'; delete p2.historie; historieAdd(p2, 'X', ''); globalThis.__h2 = p2.historie;`);
ok(Array.isArray(ctx.__h2) && ctx.__h2.length === 1, 'historieAdd: legt fehlendes Array an');

/* ── 3) Anzeige im Editor ── */
run(`(() => {
  _edSecOpen = { pruef:false, frei:false, mit:false, hist:true };
  const p = newPolicy(); p.id='4';
  historieAdd(p, 'Angelegt', 'Erstanlage');
  historieAdd(p, 'Freigegeben & veröffentlicht', 'Version 1.0 veröffentlicht.');
  globalThis.__html = renderHistorieSection(p);
  globalThis.__htmlLeer = renderHistorieSection(newPolicy());
})()`);
ok(ctx.__html.includes('Änderungshistorie'), 'Anzeige: Abschnittstitel');
ok(ctx.__html.includes('2 Einträge'), 'Anzeige: Anzahl als Badge');
ok(ctx.__html.includes('Anna Admin') && ctx.__html.includes('01.03.2026'), 'Anzeige: Person + Zeitpunkt');
ok(ctx.__html.indexOf('Freigegeben') < ctx.__html.indexOf('Angelegt'), 'Anzeige: neueste zuerst');
ok(ctx.__htmlLeer.includes('Noch keine Änderungen'), 'Anzeige: Hinweis bei leerer Historie');

run(`_edSecOpen.hist = false; globalThis.__zu = renderHistorieSection((()=>{const p=newPolicy();p.id='5';historieAdd(p,'A','B');return p;})());`);
ok(!ctx.__zu.includes('Anna Admin'), 'Anzeige: eingeklappt zeigt keine Einträge');

/* ── 4) Editor bindet die Historie ein (nur bei gespeichertem Regelwerk) ── */
const adm = fs.readFileSync(ROOT + '/js/admin.js', 'utf8');
ok(/\$\{p\.id \? renderHistorieSection\(p\) : ''\}/.test(adm), 'Editor: Historie nur bei vorhandener id');

/* ── 5) Alle Mutationspfade protokollieren ── */
for (const [fn, marker] of [
  ['savePolicy', /historieAdd\(p, 'Angelegt'/],
  ['savePolicy-edit', /historieAdd\(p, 'Bearbeitet', aenderungen\.join/],
  ['savePolicy-einreichen', /historieAdd\(p, 'Zur Konformitätsprüfung eingereicht'/],
  ['markKonform', /historieAdd\(p, konform \? 'Konformitätsprüfung: konform'/],
  ['markMitbestimmung', /historieAdd\(p, konform \? 'Mitbestimmung: konform'/],
  ['markFreigabe', /historieAdd\(p, published \?/],
  ['setStatus', /historieAdd\(p, 'Status geändert', historienText/],
  ['archivieren (mit Grund)', /setStatus\(id, 'Archiviert', .*Archiviert/s],
  ['reaktivieren', /setStatus\(id, 'Entwurf', '„Archiviert" → „Entwurf" \(reaktiviert\)'\)/],
]) ok(marker.test(adm), `Protokolliert: ${fn}`);

/* ── 6) Persistenz in SharePoint ── */
const sctx = { console, JSON, fetch: () => {}, location: { origin: '', pathname: '' } };
sctx.window = sctx; sctx.globalThis = sctx;
vm.createContext(sctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/sharepoint.js', 'utf8'), sctx);
vm.runInContext(`
  _sp.policyColumns = [{ name:'HistorieJson', displayName:'HistorieJson' }, { name:'Title', displayName:'Titel' }];
  _sp.policyFields = new Set(['HistorieJson','Title']);
  globalThis.__m  = _mapPolicy({ id:'1', fields:{ Title:'T', HistorieJson: JSON.stringify([{aktion:'Angelegt',name:'A'}]) } });
  globalThis.__m0 = _mapPolicy({ id:'2', fields:{ Title:'X' } });
  globalThis.__mBad = _mapPolicy({ id:'3', fields:{ Title:'Y', HistorieJson:'{kaputt' } });
  globalThis.__MAX = HISTORIE_MAX;
`, sctx);
ok(Array.isArray(sctx.__m.historie) && sctx.__m.historie[0].aktion === 'Angelegt', '_mapPolicy liest HistorieJson');
ok(Array.isArray(sctx.__m0.historie) && sctx.__m0.historie.length === 0, '_mapPolicy: fehlend → leeres Array');
ok(Array.isArray(sctx.__mBad.historie) && sctx.__mBad.historie.length === 0, '_mapPolicy: kaputtes JSON bricht nicht');

const shp = fs.readFileSync(ROOT + '/js/sharepoint.js', 'utf8');
ok(shp.includes("{ name: 'HistorieJson',"), 'POLICY_COLUMNS enthält HistorieJson');
ok(/_histKurz\(p\)/.test(shp) && /slice\(-HISTORIE_MAX\)/.test(shp), 'spSavePolicy kappt auf die jüngsten Einträge');
vm.runInContext(`
  const lang = { historie: Array.from({length: 250}, (_, i) => ({ aktion: 'A' + i })) };
  globalThis.__kurz = _histKurz(lang);
`, sctx);
ok(sctx.__kurz.length === 200 && sctx.__kurz[0].aktion === 'A50', 'Kürzung behält die jüngsten 200 Einträge');
ok(sctx.__MAX === 200, 'HISTORIE_MAX = 200');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
