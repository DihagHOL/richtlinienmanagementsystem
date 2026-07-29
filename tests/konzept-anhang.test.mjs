import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const kctx = {
  console, esc,
  fmtDate: () => '24.07.2026',
  emptyState: (t) => `<empty>${t}</empty>`,
  toast: () => {},
  State: { user: { upn:'a@dihag.com', name:'Max' }, konzepte: [], policies: [] },
  isCurrentUserGeschaeftsleitung: () => false,
  canWriteTab: () => true,
  openModal: (html) => { kctx.__modal = html; },
};
kctx.window = kctx; kctx.globalThis = kctx;
vm.createContext(kctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/konzepte.js','utf8'), kctx);
const run = (src) => vm.runInContext(src, kctx);

// 1) newKonzept hat Dokumentfelder
run(`globalThis.__nk = newKonzept();`);
ok(['dokumentUrl','dokumentName','dokumentDriveId','dokumentItemId'].every(f => f in kctx.__nk), 'newKonzept hat alle Dokumentfelder');

// 2) Editor ohne Anhang
run(`openKonzeptEditor();`);
ok(kctx.__modal.includes('kein Anhang'), 'Editor: „kein Anhang“ ohne Datei');
ok(kctx.__modal.includes('Datei anhängen'), 'Editor: Button „Datei anhängen“');
ok(!kctx.__modal.includes('✕ Entfernen'), 'Editor: kein „Entfernen“ ohne Datei');

// 3) Editor mit Anhang
run(`_kEditing.dokumentName='Entwurf.docx'; _kEditing.dokumentUrl='https://x/Entwurf.docx'; _kEditing.dokumentDriveId='d'; _kEditing.dokumentItemId='i'; renderKonzeptEditor();`);
ok(kctx.__modal.includes('📎 Entwurf.docx'), 'Editor: Anhangname angezeigt');
ok(kctx.__modal.includes('Ersetzen'), 'Editor: „Ersetzen“ bei vorhandener Datei');
ok(kctx.__modal.includes('✕ Entfernen'), 'Editor: „Entfernen“ bei vorhandener Datei');
ok(kctx.__modal.includes('In Office') && kctx.__modal.includes('Im Browser'), 'Editor: Öffnen-Buttons (Office/Browser)');

// 4) Karte zeigt 📎-Tag
kctx.State.konzepte = [{ id:'1', title:'X', kategorie:'', modifiedAt:'', dokumentName:'Draft.pdf', konzept:{ prioritaet:'mittel', entscheidung:{} } }];
run(`globalThis.__cards = renderKonzeptCards('');`);
ok(kctx.__cards.includes('📎 Anhang'), 'Karte zeigt 📎-Anhang-Tag');
kctx.State.konzepte = [{ id:'2', title:'Y', kategorie:'', modifiedAt:'', dokumentName:'', konzept:{ prioritaet:'mittel', entscheidung:{} } }];
run(`globalThis.__cards2 = renderKonzeptCards('');`);
ok(!kctx.__cards2.includes('📎 Anhang'), 'Karte ohne Datei: kein 📎-Tag');

// 5) Statisch: Übernahme bei Annahme + Mail-Anhang
const kjs = fs.readFileSync(ROOT + '/js/konzepte.js','utf8');
ok(/rw\.dokumentItemId = k\.dokumentItemId/.test(kjs), 'Annahme übernimmt Anhang als Startdokument des Regelwerks');
ok(/spGetDocAttachment\(k\.dokumentDriveId/.test(kjs), 'GF-Mail hängt den Anhang an');
ok(/spUploadPolicyDoc\(file\.name/.test(kjs), 'Upload-Handler nutzt spUploadPolicyDoc');

console.log(`\n${fail? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
