import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);} };

// ── A: sharepoint.js Datenschicht ──
const sctx = { console, JSON, fetch:()=>{}, location:{origin:'',pathname:''} };
sctx.window=sctx; sctx.globalThis=sctx; vm.createContext(sctx);
vm.runInContext(fs.readFileSync(ROOT+'/js/sharepoint.js','utf8'), sctx);
vm.runInContext(`
  _sp.policyColumns = [{ name:'RegelwerkTyp', displayName:'Regelwerk-Typ' }, { name:'Title', displayName:'Titel' }];
  _sp.policyFields = new Set(['RegelwerkTyp','Title']);
  globalThis.__m = _mapPolicy({ id:'1', fields:{ Title:'T', RegelwerkTyp:'Handbuch' } });
  globalThis.__m0 = _mapPolicy({ id:'2', fields:{ Title:'X' } });
  globalThis.__miss = spMissingPolicyColumns().map(c=>c.name);
`, sctx);
ok(sctx.__m.regelwerkTyp === 'Handbuch', '_mapPolicy liest RegelwerkTyp');
ok(sctx.__m0.regelwerkTyp === '', '_mapPolicy: fehlend → leer');
ok(!sctx.__miss.includes('RegelwerkTyp'), 'Banner: RegelwerkTyp erkannt (auch per Anzeigename)');
const shp = fs.readFileSync(ROOT+'/js/sharepoint.js','utf8');
ok(shp.includes("{ name: 'RegelwerkTyp',"), 'POLICY_COLUMNS enthält RegelwerkTyp');
ok(/RegelwerkTyp:\s*p\.regelwerkTyp/.test(shp), 'spSavePolicy schreibt RegelwerkTyp');
ok(/if \(!all\.RegelwerkTyp\)\s*delete all\.RegelwerkTyp/.test(shp), 'spSavePolicy lässt leeren Typ weg');
ok(/_policyFieldName\(def\.spalte\)/.test(shp), 'Lesen über internen Namen (Resolver)');

// ── B: admin.js Regelwerk-Editor ──
const actx = { console, esc };
actx.window=actx; actx.globalThis=actx; vm.createContext(actx);
vm.runInContext(fs.readFileSync(ROOT+'/js/admin.js','utf8'), actx);
vm.runInContext(`globalThis.__T = REGELWERK_TYPEN; globalThis.__np = newPolicy();`, actx);
// Die Liste ist nur noch der Rückfall – gepflegt wird sie als Spalten der
// Governance-Struktur. Sie muss deshalb deren Ebenen entsprechen.
const expected = ['Handbuch','Policy','Konzernrichtlinie','Konzernfachregelung','Arbeits-/Prozessanweisung','Leitfaden','Weitere'];
ok(JSON.stringify(actx.__T) === JSON.stringify(expected), 'REGELWERK_TYPEN (Rückfall) = Ebenen der Pyramide');
ok(!actx.__T.includes('Richtlinie'), '„Richtlinie“ ist raus – in der Matrix heißt die Ebene „Policy“');
ok(actx.__np.regelwerkTyp === '', 'newPolicy().regelwerkTyp = leer');
const adm = fs.readFileSync(ROOT+'/js/admin.js','utf8');
ok(/_editing\.regelwerkTyp=this\.value/.test(adm), 'Regelwerk-Editor: Typ-Dropdown gebunden');
ok(adm.includes('Dokumentenart <span class="req">*</span>'),
  'Regelwerk-Editor: „Dokumentenart" als Pflichtfeld gekennzeichnet');

// ── C: konzepte.js Konzept-Editor ──
const kctx = { console, esc, toast:()=>{}, canWriteTab:()=>true, REGELWERK_TYPEN: expected,
  State:{user:{}}, __modal:'', openModal:(h)=>{ kctx.__modal = h; },
  konzeptStatus:()=>'Idee', konzeptStatusBadge:()=>'', fmtDate:()=> '', emptyState:()=> '', isCurrentUserGeschaeftsleitung:()=>false };
kctx.window=kctx; kctx.globalThis=kctx; vm.createContext(kctx);
vm.runInContext(fs.readFileSync(ROOT+'/js/konzepte.js','utf8'), kctx);
vm.runInContext(`globalThis.__nk = newKonzept(); openKonzeptEditor();`, kctx);
ok(kctx.__nk.regelwerkTyp === '', 'newKonzept().regelwerkTyp = leer');
ok(kctx.__modal.includes('Dokumentenart'), 'Konzept-Editor: Label „Dokumentenart“ – wie beim Regelwerk');
ok(kctx.__modal.includes('Konzernfachregelung') && kctx.__modal.includes('Leitfaden'), 'Konzept-Editor: Typ-Optionen gerendert');
ok(kctx.__modal.includes('_kEditing.regelwerkTyp=this.value'), 'Konzept-Editor: Typ-Dropdown gebunden');
const kjs = fs.readFileSync(ROOT+'/js/konzepte.js','utf8');
ok(/rw\.regelwerkTyp = k\.regelwerkTyp/.test(kjs), 'Annahme übernimmt Typ ins Regelwerk');

console.log(`\n${fail?'✗':'✓'} ${pass} grün, ${fail} rot`); process.exit(fail?1:0);
