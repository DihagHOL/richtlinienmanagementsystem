import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);} };

const els = {}; const mk=(x={})=>({value:'',style:{},innerHTML:'',...x});
els['governance-mount']=mk(); els['search-governance']=mk({value:''});
const ctx = { console, esc, emptyState:(t)=>`<empty>${t}</empty>`, fmtDateTime:()=> 'x', toast:()=>{},
  GOV:{folderPath:'Entwurf_010'}, document:{ getElementById:id=>els[id]||null } };
ctx.window=ctx; ctx.globalThis=ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT+'/js/governance.js','utf8'), ctx);
const run=(s)=>vm.runInContext(s,ctx);

run(`_govLoading=false; _govDocs=[
  { name:'Root.docx', folder:'', driveItemId:'1', modified:'', modifiedBy:'', size:10 },
  { name:'A1.docx', folder:'Anhänge', driveItemId:'2', modified:'', modifiedBy:'', size:20 },
  { name:'A2.docx', folder:'Anhänge/2024', driveItemId:'3', modified:'', modifiedBy:'', size:30 },
  { name:'V1.docx', folder:'Verträge', driveItemId:'4', modified:'', modifiedBy:'', size:40 },
];`);

// Baum bauen: counts inkl. Unterordner
run(`globalThis.__t = _govBuildTree(_govDocs);`);
const t = ctx.__t;
ok(t.count === 4, 'Wurzel-Count = 4 (alle)');
ok(t.children['Anhänge'].count === 2, 'Anhänge-Count = 2 (inkl. Unterordner)');
ok(t.children['Anhänge'].children['2024'].count === 1, 'Anhänge/2024-Count = 1');
ok(t.children['Verträge'].count === 1, 'Verträge-Count = 1');

// Render (Wurzel initial aufgeklappt)
run(`_govExpanded = null; _govFolder=''; renderGovernanceDocs();`);
let html = els['governance-mount'].innerHTML;
ok(html.includes('gov-layout') && html.includes('gov-tree'), 'Zwei-Spalten-Layout mit Baum gerendert');
ok(html.includes('🗂') && html.includes('Governance-Board'), 'Wurzelknoten sichtbar');
ok(html.includes('>Anhänge<') && html.includes('>Verträge<'), 'Top-Level-Ordner sichtbar (Wurzel aufgeklappt)');
ok(!html.includes('>2024<'), 'Tiefe Unterordner erst nach Aufklappen sichtbar');
// alle 4 Dokumente in der Liste
ok(html.includes('Root.docx') && html.includes('A1.docx') && html.includes('A2.docx') && html.includes('V1.docx'), 'Liste zeigt alle Entwürfe bei Auswahl „alle“');

// Ordner „Anhänge" wählen → nur Anhänge + Unterordner
run(`govSelectFolder('Anhänge');`);
html = els['governance-mount'].innerHTML;
ok(html.includes('A1.docx') && html.includes('A2.docx'), 'Auswahl „Anhänge“ zeigt Ordner + Unterordner');
ok(!html.includes('Root.docx') && !html.includes('V1.docx'), 'Auswahl „Anhänge“ blendet andere aus');
ok(ctx.__t && els['governance-mount'].innerHTML.includes('gov-tree-node sel'), 'Ausgewählter Knoten markiert');

// „Anhänge" aufklappen → 2024 sichtbar
run(`govToggleFolder('Anhänge'); renderGovernanceDocs();`);
html = els['governance-mount'].innerHTML;
ok(html.includes('>2024<'), 'Nach Aufklappen: Unterordner „2024“ sichtbar');

// Suche wirkt zusätzlich
run(`_govFolder=''; els=null;`);  // reset folder
run(`_govFolder='';`);
els['search-governance'].value='v1';
run(`renderGovernanceDocs();`);
html = els['governance-mount'].innerHTML;
ok(html.includes('V1.docx') && !html.includes('A1.docx'), 'Suche filtert die Liste zusätzlich');

// Statische Wiring-Checks
const gjs = fs.readFileSync(ROOT+'/js/governance.js','utf8');
ok(/onclick="govSelectFolder/.test(gjs) && /onclick="event.stopPropagation\(\);govToggleFolder/.test(gjs), 'Klick-Handler Auswahl + Aufklappen');
const css = fs.readFileSync(ROOT+'/css/style.css','utf8');
ok(/\.gov-tree\b/.test(css) && /\.gov-tree-node\b/.test(css) && /max-width: 820px/.test(css), 'CSS für Baum inkl. Responsive vorhanden');
const idx = fs.readFileSync(ROOT+'/index.html','utf8');
ok(!idx.includes('filter-governance-folder'), 'Dropdown aus Toolbar entfernt');

console.log(`\n${fail?'✗':'✓'} ${pass} grün, ${fail} rot`); process.exit(fail?1:0);
