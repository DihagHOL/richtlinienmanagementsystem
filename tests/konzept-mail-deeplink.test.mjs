import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);} };
const kctx={ console, esc, fmtDate:()=> '', emptyState:()=> '', toast:()=>{}, State:{user:{}}, openModal:()=>{}, isCurrentUserGeschaeftsleitung:()=>false, canWriteTab:()=>true };
kctx.window=kctx; kctx.globalThis=kctx; vm.createContext(kctx);
vm.runInContext(fs.readFileSync(ROOT+'/js/konzepte.js','utf8'), kctx);
const run=(s)=>vm.runInContext(s,kctx);

run(`globalThis.__h = _konzeptMailHtml({ id:'42', title:'KI', kategorie:'IT-Sicherheit', konzept:{ prioritaet:'hoch', motivation:'M' } }, false, false);`);
const h = kctx.__h;
ok(h.includes('konzept=42&amp;aktion=annehmen'), 'Mail: Deep-Link Annehmen');
ok(h.includes('konzept=42&amp;aktion=zurueckstellen'), 'Mail: Deep-Link Zurückstellen');
ok(h.includes('konzept=42&amp;aktion=ablehnen'), 'Mail: Deep-Link Ablehnen');
ok(h.includes('✓ Annehmen → Regelwerk') && h.includes('⏸ Zurückstellen') && h.includes('✗ Ablehnen'), 'Mail: drei Entscheidungs-Buttons');
ok(h.includes('Direkt entscheiden') && h.includes('nur ansehen'), 'Mail: „Direkt entscheiden“ + „nur ansehen“-Link');
ok(!h.includes('Regelwerk-Dashboard öffnen →'), 'Mail: kein reiner Dashboard-Link mehr (bei vorhandener id)');

// Ohne id → Fallback-Link
run(`globalThis.__h2 = _konzeptMailHtml({ title:'X', konzept:{prioritaet:'mittel'} }, false, false);`);
ok(kctx.__h2.includes('Regelwerk-Dashboard öffnen →'), 'Mail: Fallback-Link ohne id');

// Mapping-Handler existiert und mappt Aktion → Entscheidung (statischer Check)
const kjs = fs.readFileSync(ROOT+'/js/konzepte.js','utf8');
ok(/annehmen: 'angenommen'/.test(kjs) && /ablehnen: 'abgelehnt'/.test(kjs) && /zurueckstellen: 'zurueckgestellt'/.test(kjs), 'handleKonzeptMailAction mappt alle drei Aktionen');
ok(/id="konzept-\$\{esc\(k\.id\)\}"/.test(kjs), 'Konzept-Karte hat id="konzept-<id>"');

const appjs = fs.readFileSync(ROOT+'/js/app.js','utf8');
ok(/\(richtlinie\|ansicht\|konzept\)/.test(appjs), 'Deeplink-Sniff erkennt konzept-Param');
ok(/params\.get\('konzept'\)/.test(appjs) && /handleKonzeptMailAction\(konzeptId, aktion\)/.test(appjs), 'applyDeepLinkOrDefault behandelt konzept-Deeplink');

console.log(`\n${fail?'✗':'✓'} ${pass} grün, ${fail} rot`); process.exit(fail?1:0);
