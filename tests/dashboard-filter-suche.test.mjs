import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  OK ',m);}else{fail++;console.log('  XX ',m);} };

// ---- DOM-Stub ----
const els = {};
const mk = (id) => (els[id] = { id, value:'', style:{}, innerHTML:'', dataset:{} });
['list-admin','search-admin','filter-admin','filter-admin-typ','filter-admin-standort','btn-health','btn-new-policy','btn-new-konzept'].forEach(mk);

const ctx = {
  console, esc,
  fmtDate: () => '01.01.2026',
  emptyState: (t, i) => `<empty icon="${i}">${t}</empty>`,
  workflowBadge: () => '<badge/>',
  toast: () => {},
  isReadOnlyTab: () => false,
  canWriteTab: () => true,
  openModal: () => {}, closeModal: () => {},
  document: { getElementById: (id) => els[id] || null },
  State: { policies: [], konzepte: [], user:{upn:'a@x',name:'A'} },
  spMissingPolicyColumns: () => [], spMissingAckColumns: () => [],
  renderKonzeptCards: (q, t) => `<konzepte q="${q}" typ="${t||''}"/>`,
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT+'/js/admin.js','utf8'), ctx);
const run = (s) => vm.runInContext(s, ctx);

const P = (o) => Object.assign({ id:'x', title:'', beschreibung:'', kategorie:'', regelwerkTyp:'', geltungsbereich:[],
  version:'1.0', status:'Entwurf', pflicht:true, quiz:[], quizErforderlich:false, zielgruppen:[], normbezug:[],
  dokumentName:'', modifiedAt:'2026-01-01' }, o);

ctx.State.policies = [
  P({ id:'1', title:'IT-Sicherheitsrichtlinie', regelwerkTyp:'Konzernrichtlinie', geltungsbereich:['HOL','SHB'], kategorie:'IT-Sicherheit', status:'Veröffentlicht' }),
  P({ id:'2', title:'Reisekosten', regelwerkTyp:'Leitfaden', geltungsbereich:['ALLE'], kategorie:'Allgemein', status:'Entwurf' }),
  P({ id:'3', title:'Gießerei-Handbuch', regelwerkTyp:'Handbuch', geltungsbereich:['EIS'], kategorie:'Arbeitssicherheit', status:'Entwurf',
      beschreibung:'Schmelzbetrieb Ofen', zielgruppen:['Produktion'], normbezug:['A.5.1'], dokumentName:'giesserei.docx' }),
];
ctx.State.konzepte = [ P({ id:'9', title:'KI-Konzept', regelwerkTyp:'Richtlinie' }) ];

// ---- Filter befuellen ----
run('_fillAdminFilters();');
const typOpts = els['filter-admin-typ'].innerHTML;
ok(typOpts.includes('Konzernrichtlinie') && typOpts.includes('Leitfaden') && typOpts.includes('Handbuch'), 'Typ-Filter listet vorkommende Typen');
ok(typOpts.includes('Richtlinie'), 'Typ-Filter beruecksichtigt auch Konzepte');
ok(!typOpts.includes('Konzernfachregelung'), 'Typ-Filter ohne unbenutzte Typen');
const stdOpts = els['filter-admin-standort'].innerHTML;
ok(stdOpts.includes('HOL') && stdOpts.includes('SHB') && stdOpts.includes('EIS'), 'Standort-Filter listet vorkommende Standorte');
ok(!stdOpts.includes('>WGC<'), 'Standort-Filter ohne unbenutzte Standorte');

// ---- Filter anwenden ----
const render = () => { run('renderAdminList();'); return els['list-admin'].innerHTML; };
let html = render();
ok(html.includes('IT-Sicherheitsrichtlinie') && html.includes('Reisekosten') && html.includes('Gießerei-Handbuch'), 'Ohne Filter: alle Regelwerke');

els['filter-admin-typ'].value = 'Handbuch';
html = render();
ok(html.includes('Gießerei-Handbuch') && !html.includes('Reisekosten'), 'Typ-Filter grenzt korrekt ein');
els['filter-admin-typ'].value = '';

els['filter-admin-standort'].value = 'HOL';
html = render();
ok(html.includes('IT-Sicherheitsrichtlinie'), 'Standort-Filter: direkter Treffer');
ok(html.includes('Reisekosten'), 'Standort-Filter: ALLE zaehlt konzernweit mit');
ok(!html.includes('Gießerei-Handbuch'), 'Standort-Filter: anderer Standort ausgeblendet');
els['filter-admin-standort'].value = '';

els['filter-admin'].value = 'Entwurf';
html = render();
ok(!html.includes('IT-Sicherheitsrichtlinie') && html.includes('Reisekosten'), 'Status-Filter weiter funktionsfaehig');
els['filter-admin'].value = 'all';

// Kombination ohne Treffer -> Filter-Leerzustand
els['filter-admin-typ'].value = 'Handbuch';
els['filter-admin-standort'].value = 'HOL';
html = render();
ok(html.includes('Keine Treffer') && html.includes('icon="🔍"'), 'Leerzustand: Filter-Hinweis statt Anlegen-Hinweis');
els['filter-admin-typ'].value = ''; els['filter-admin-standort'].value = '';

// ---- Volltextsuche ----
run('globalThis.__q = (t,q) => policyMatchesQuery(t,q);');
const p3 = ctx.State.policies[2];
ok(ctx.__q(p3,'schmelzbetrieb'), 'Suche findet Beschreibung');
ok(ctx.__q(p3,'handbuch'), 'Suche findet Typ');
ok(ctx.__q(p3,'eis'), 'Suche findet Standort');
ok(ctx.__q(p3,'produktion'), 'Suche findet Zielgruppe');
ok(ctx.__q(p3,'a.5.1'), 'Suche findet Normbezug');
ok(ctx.__q(p3,'giesserei.docx'), 'Suche findet Dokumentname');
ok(ctx.__q(ctx.State.policies[1],'alle standorte'), 'Suche findet „Alle Standorte“');
ok(!ctx.__q(p3,'zzz'), 'Suche: kein Falschtreffer');

els['search-admin'].value = 'schmelzbetrieb';
html = render();
ok(html.includes('Gießerei-Handbuch') && !html.includes('Reisekosten'), 'Suche filtert die Liste');
els['search-admin'].value = '';

// Konzept-Modus bekommt Typ-Filter durchgereicht
els['filter-admin-typ'].value = 'Richtlinie';
run("_adminMode='konzepte';");
html = render();
ok(html.includes('typ="Richtlinie"'), 'Konzept-Modus erhaelt Typ-Filter');
ok(els['filter-admin-standort'].style.display === 'none', 'Konzept-Modus blendet Standort-Filter aus');
run("_adminMode='regelwerke';");

// ---- Konzept-Suche ----
const kctx = { console, esc, emptyState:(t,i)=>`<empty icon="${i}">${t}</empty>`, toast:()=>{}, canWriteTab:()=>true,
  fmtDate:()=> '', openModal:()=>{}, isCurrentUserGeschaeftsleitung:()=>false,
  geltungsbereichLabel: ctx.geltungsbereichLabel, State:{ konzepte:[], user:{} } };
kctx.window=kctx; kctx.globalThis=kctx; vm.createContext(kctx);
vm.runInContext(fs.readFileSync(ROOT+'/js/konzepte.js','utf8'), kctx);
kctx.State.konzepte = [
  { id:'1', title:'KI-Regelwerk', kategorie:'IT-Sicherheit', regelwerkTyp:'Richtlinie', geltungsbereich:['SHB'], modifiedAt:'',
    konzept:{ prioritaet:'hoch', motivation:'Datenabfluss verhindern', skizze:'Geltungsbereich alle', antragstellerName:'Max Muster', entscheidung:{} } },
  { id:'2', title:'Zweites', kategorie:'Allgemein', regelwerkTyp:'Leitfaden', geltungsbereich:[], modifiedAt:'',
    konzept:{ prioritaet:'mittel', motivation:'x', entscheidung:{} } },
];
vm.runInContext('globalThis.__km = (k,q) => konzeptMatchesQuery(k,q);', kctx);
const k1 = kctx.State.konzepte[0];
ok(kctx.__km(k1,'datenabfluss'), 'Konzept-Suche findet Motivation');
ok(kctx.__km(k1,'max muster'), 'Konzept-Suche findet Antragsteller');
ok(kctx.__km(k1,'shb'), 'Konzept-Suche findet Standort');
ok(kctx.__km(k1,'richtlinie'), 'Konzept-Suche findet Typ');
vm.runInContext("globalThis.__c1 = renderKonzeptCards('', 'Leitfaden');", kctx);
ok(kctx.__c1.includes('Zweites') && !kctx.__c1.includes('KI-Regelwerk'), 'Konzept-Karten: Typ-Filter wirkt');
vm.runInContext("globalThis.__c2 = renderKonzeptCards('zzz', '');", kctx);
ok(kctx.__c2.includes('Keine Treffer') && kctx.__c2.includes('icon="🔍"'), 'Konzept-Karten: Filter-Leerzustand');

// ---- Keine Browser-Popups mehr ----
const files = ['admin','konzepte','kurse','prozesse','reifegrad','risiken','soa','app','ismsdocs','governance','proposals'];
let popups = [];
for (const f of files) {
  const src = fs.readFileSync(`${ROOT}/js/${f}.js`,'utf8');
  const m = src.match(/(?<![.\w$])(confirm|prompt|alert)\s*\(/g);
  if (m) popups.push(f + ': ' + m.join(','));
}
ok(popups.length === 0, 'Keine Browser-confirm/prompt/alert mehr: ' + (popups.join(' | ') || 'sauber'));

// awaits korrekt gesetzt
const chk = [['admin','uiPrompt'],['kurse','uiConfirm'],['prozesse','uiConfirm'],['reifegrad','uiConfirm'],['risiken','uiConfirm'],['soa','uiConfirm']];
for (const [f, fn] of chk) {
  const src = fs.readFileSync(`${ROOT}/js/${f}.js`,'utf8');
  const calls = [...src.matchAll(new RegExp('(await\\s+)?' + fn + '\\s*\\(', 'g'))];
  ok(calls.length > 0 && calls.every(c => c[1]), `${f}.js: alle ${fn}-Aufrufe mit await`);
}
// Funktionen, die jetzt awaiten, muessen async sein
const rg = fs.readFileSync(`${ROOT}/js/reifegrad.js`,'utf8');
ok(/async function reifegradRemoveMeasure/.test(rg) && /async function reifegradRemoveTopic/.test(rg), 'reifegrad: betroffene Funktionen sind async');

console.log('\n' + (fail ? 'XX' : 'OK') + ' ' + pass + ' gruen, ' + fail + ' rot');
process.exit(fail ? 1 : 0);
