import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_DATEIEN = ['admin.js', 'freigaben.js', 'einstellungen.js'];   // admin.js wurde aufgeteilt
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  OK ',m);}else{fail++;console.log('  XX ',m);} };

// admin.js context
const actx = { console, esc, fmtDate:()=> '24.07.2026', toast:()=>{}, canWriteTab:()=>true,
  __modal:'', openModal:(h)=>{ actx.__modal=h; }, closeModal:()=>{}, renderPolicyEditor:()=>{},
  openPolicyEditor:()=>{}, openKonzeptEditor:()=>{} };
actx.window=actx; actx.globalThis=actx; vm.createContext(actx);
ADMIN_DATEIEN.forEach(f => vm.runInContext(fs.readFileSync(ROOT + '/js/' + f, 'utf8'), actx));
vm.runInContext('renderPolicyEditor = () => {};', actx);   // echte Render-Funktion für die Handler-Tests neutralisieren
const arun=(s)=>vm.runInContext(s,actx);
const adm = ADMIN_DATEIEN.map(f => fs.readFileSync(ROOT + '/js/' + f, 'utf8')).join('\n');

arun('globalThis.__a = _wfApprovalsHtml({ konformitaet:[{name:"Anna",entscheidung:"konform",datum:"2026-07-01"},{name:"Bob",entscheidung:"nicht konform"}], mitbestimmung:{konform:true,name:"KBR"}, freigaben:[{name:"Chef"}] });');
ok(actx.__a.includes('Anna') && actx.__a.includes('KBR') && actx.__a.includes('Chef'), 'Mail: bereits Freigegebene aufgelistet');
ok(!actx.__a.includes('Bob'), 'Mail: nicht-konform nicht als freigegeben');
arun('globalThis.__a0 = _wfApprovalsHtml({});');
ok(actx.__a0 === '', 'Mail: kein Block ohne Zustimmungen');
ok(/\$\{_wfApprovalsHtml\(p\)\}/.test(adm), '_wfMailHtml bindet Approvals-Block ein');

arun('globalThis.__S = STANDORTE; globalThis.__np = newPolicy();');
ok(JSON.stringify(actx.__S) === JSON.stringify(['HOL','SHB','WGC','SCH','EIS','DSO','ZAI','LEG','MEG','EWA']), 'STANDORTE = 10 Codes');
ok(Array.isArray(actx.__np.geltungsbereich) && actx.__np.geltungsbereich.length===0, 'newPolicy().geltungsbereich = []');
arun('globalThis.__g1 = renderGeltungsbereichSection([], "gb");');
ok(actx.__g1.includes('Alle Standorte') && actx.__g1.includes('gbSectionToggle') && actx.__g1.includes('>HOL<') && actx.__g1.includes('>EWA<'), 'Section: Alle Standorte + Codes + gbSectionToggle');
arun('globalThis.__g2 = renderGeltungsbereichSection(["ALLE"], "gb");');
// Die Werke waren bei „Alle Standorte" ausgeblendet – man sah ein einziges
// Kästchen und hielt die Auswahl für gesperrt. Jetzt sichtbar, aber deaktiviert.
ok(actx.__g2.includes('gbSectionToggle') && actx.__g2.includes('>HOL<'),
  'Section: die Werke sind auch bei „Alle Standorte" sichtbar – sonst wirkt die Auswahl gesperrt');
ok((actx.__g2.match(/disabled/g) || []).length === 10 && !/checked[^>]*onchange="gbSectionToggle/.test(actx.__g2),
  'Section: dann aber deaktiviert und ohne Haken');
ok(/Einzelne Werke wählbar, sobald/.test(actx.__g2), 'Section: mit dem Hinweis, wie man dorthin kommt');
arun('_editing = newPolicy(); gbSectionToggle("gb","HOL",true); gbSectionToggle("gb","SHB",true); globalThis.__e1 = _editing.geltungsbereich.slice(); gbSectionSetAlle("gb",true); globalThis.__e2 = _editing.geltungsbereich.slice(); gbSectionSetAlle("gb",false); globalThis.__e3 = _editing.geltungsbereich.slice();');
arun('_kEditing = { geltungsbereich: [] }; renderKonzeptEditor = () => {}; gbSectionToggle("kgb","EIS",true); globalThis.__k1a = _kEditing.geltungsbereich.slice(); gbSectionSetAlle("kgb",true); globalThis.__k2a = _kEditing.geltungsbereich.slice();');
ok(JSON.stringify(actx.__k1a)===JSON.stringify(['EIS']) && JSON.stringify(actx.__k2a)===JSON.stringify(['ALLE']), 'gbSection-Dispatch kgb (Konzept)');
ok(JSON.stringify(actx.__e1)===JSON.stringify(['HOL','SHB']), 'gbSectionToggle sammelt Standorte');
ok(JSON.stringify(actx.__e2)===JSON.stringify(['ALLE']), 'gbSetAlle(true) -> [ALLE]');
ok(JSON.stringify(actx.__e3)===JSON.stringify([]), 'gbSetAlle(false) -> []');
ok(actx.geltungsbereichLabel(['ALLE'])==='Alle Standorte' && actx.geltungsbereichLabel(['HOL','SHB'])==='HOL, SHB', 'geltungsbereichLabel korrekt');
ok(/renderGeltungsbereichSection\(p\.geltungsbereich, 'gb'\)/.test(adm), 'Regelwerk-Editor bindet Geltungsbereich ein');

arun('globalThis.__U = MUSTER_VORLAGE_URL;');
ok(/Muster_Erstellung%20von%20Konzernregelungen\.docx/.test(actx.__U), 'MUSTER_VORLAGE_URL zeigt auf das Muster');
ok(typeof actx.newRegelwerkGate === 'function', 'newRegelwerkGate definiert');
arun('newRegelwerkGate();');
ok(actx.__modal.includes('Konzept erstellen') && actx.__modal.includes('Direkt anlegen') && actx.__modal.includes('Muster-Vorlage'), 'Gate: 3 Optionen + Muster-Link');
ok(actx.__modal.includes('openKonzeptEditor()') && actx.__modal.includes('openPolicyEditor()'), 'Gate: Konzept- und Direkt-Weg');
const idx = fs.readFileSync(ROOT+'/index.html','utf8');
ok(idx.includes('onclick="newRegelwerkGate()"'), 'index.html: Neues Regelwerk ruft Gate');

// sharepoint.js
const sctx = { console, JSON, fetch:()=>{}, location:{origin:'',pathname:''} };
sctx.window=sctx; sctx.globalThis=sctx; vm.createContext(sctx);
vm.runInContext(fs.readFileSync(ROOT+'/js/sharepoint.js','utf8'), sctx);
vm.runInContext('_sp.policyColumns=[{name:"GeltungsbereichJson",displayName:"GeltungsbereichJson"},{name:"Title",displayName:"Titel"}]; _sp.policyFields=new Set(["GeltungsbereichJson","Title"]); globalThis.__m = _mapPolicy({id:"1",fields:{Title:"T",GeltungsbereichJson:"[\\"HOL\\",\\"SHB\\"]"}}); globalThis.__m0 = _mapPolicy({id:"2",fields:{Title:"X"}});', sctx);
ok(JSON.stringify(sctx.__m.geltungsbereich)===JSON.stringify(['HOL','SHB']), '_mapPolicy liest GeltungsbereichJson');
ok(Array.isArray(sctx.__m0.geltungsbereich) && sctx.__m0.geltungsbereich.length===0, '_mapPolicy: fehlend -> []');
const shp = fs.readFileSync(ROOT+'/js/sharepoint.js','utf8');
ok(shp.includes("{ name: 'GeltungsbereichJson',") && /GeltungsbereichJson:\s*JSON\.stringify\(p\.geltungsbereich/.test(shp), 'POLICY_COLUMNS + spSavePolicy GeltungsbereichJson');

// konzepte.js
const kctx = { console, esc, toast:()=>{}, canWriteTab:()=>true, REGELWERK_TYPEN:[], STANDORTE:actx.__S,
  geltungsbereichLabel:actx.geltungsbereichLabel, renderGeltungsbereichSection:()=>'<gb>', MUSTER_VORLAGE_URL:actx.__U,
  State:{user:{}}, openModal:()=>{}, konzeptStatus:()=>'Idee', konzeptStatusBadge:()=>'', fmtDate:()=> '', emptyState:()=> '', isCurrentUserGeschaeftsleitung:()=>false, renderKonzeptEditor:()=>{} };
kctx.window=kctx; kctx.globalThis=kctx; vm.createContext(kctx);
vm.runInContext(fs.readFileSync(ROOT+'/js/konzepte.js','utf8'), kctx);
vm.runInContext('renderKonzeptEditor = () => {};', kctx);
vm.runInContext('globalThis.__nk = newKonzept();', kctx);
ok(Array.isArray(kctx.__nk.geltungsbereich) && kctx.__nk.geltungsbereich.length===0, 'newKonzept().geltungsbereich = []');
const kjs = fs.readFileSync(ROOT+'/js/konzepte.js','utf8');
ok(/rw\.geltungsbereich = Array\.isArray\(k\.geltungsbereich\)/.test(kjs), 'Annahme uebernimmt Geltungsbereich');
ok(/renderGeltungsbereichSection\(k\.geltungsbereich, 'kgb'\)/.test(kjs), 'Konzept-Editor bindet Geltungsbereich ein');
ok(/Muster-Vorlage/.test(kjs), 'Konzept-Editor: Muster-Vorlage-Link');

console.log('\n' + (fail? 'XX' : 'OK') + ' ' + pass + ' gruen, ' + fail + ' rot');
process.exit(fail ? 1 : 0);
