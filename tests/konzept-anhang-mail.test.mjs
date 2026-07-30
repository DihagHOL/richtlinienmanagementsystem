import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const kctx = { console, esc, fmtDate:()=> '', emptyState:()=> '', toast:()=>{}, State:{user:{}}, openModal:()=>{},
  isCurrentUserGeschaeftsleitung:()=>false, canWriteTab:()=>true };
kctx.window = kctx; kctx.globalThis = kctx;
vm.createContext(kctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/util.js', 'utf8'), kctx);   // gemeinsame Helfer
vm.runInContext(fs.readFileSync(ROOT + '/js/konzepte.js','utf8'), kctx);
const run = (s)=>vm.runInContext(s, kctx);

run(`globalThis.__k = { title:'KI', kategorie:'IT-Sicherheit', dokumentName:'Entwurf.docx', konzept:{ prioritaet:'hoch', motivation:'M', skizze:'S' } };`);
run(`globalThis.__mAtt = _konzeptMailHtml(__k, true, true);`);
run(`globalThis.__mBig = _konzeptMailHtml(__k, false, true);`);
run(`globalThis.__mNone = _konzeptMailHtml({title:'X',konzept:{prioritaet:'mittel'}}, false, false);`);
ok(kctx.__mAtt.includes('dieser E-Mail beigefügt') && kctx.__mAtt.includes('Entwurf.docx'), 'Mail: „beigefügt“ wenn Anhang mitgeht');
ok(kctx.__mBig.includes('im Konzept hinterlegt (zu groß'), 'Mail: Hinweis wenn Datei zu groß für Anhang');
ok(!kctx.__mNone.includes('📎'), 'Mail: kein 📎 wenn gar keine Datei');

const shp = fs.readFileSync(ROOT + '/js/sharepoint.js','utf8');
ok(/items\/\$\{itemId\}\/content`, \{ headers: \{ Authorization/.test(shp.replace(/\s+/g,' ')) || /\/content`, \{ headers/.test(shp), 'spGetDocAttachment: /content-Fallback mit Bearer');
ok(/> 3 \* 1024 \* 1024/.test(shp), 'spGetDocAttachment: Limit auf 3 MB angehoben');
const kjs = fs.readFileSync(ROOT + '/js/konzepte.js','utf8');
ok(/_konzeptMailHtml\(k, !!att, hasDoc\)/.test(kjs), 'notifyKonzeptGF übergibt hasAttachment + hasDoc');

console.log(`\n${fail? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
