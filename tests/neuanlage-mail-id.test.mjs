/**
 * Die Mail an die Prüfer muss wissen, wofür sie wirbt.
 *
 * Legt man ein Regelwerk im Editor **neu** an und reicht es in einem Zug zur
 * Konformitätsprüfung ein, vergibt SharePoint die Kennung erst mit dem POST.
 * `spSavePolicy()` gibt den angelegten Eintrag zurück – der Rückgabewert wurde
 * aber weggeworfen. `p.id` blieb `undefined`, die Mail trug
 * `?richtlinie=undefined`, und der Klick darauf landete zwangsläufig bei
 * „Regelwerk nicht gefunden".
 *
 * Über das Konzept fiel das nie auf: Dort existiert das Regelwerk schon, es
 * wird nur noch eingereicht. Deshalb ging genau der eine Weg kaputt –
 * „direkt Entwurf erstellen".
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Die Kennung wird aus dem Rückgabewert übernommen ── */
const adm = lies('js/admin.js');
ok(/const gespeichert = await spSavePolicy\(p\);/.test(adm),
  'savePolicy() fängt den Rückgabewert von spSavePolicy() auf');
ok(/if \(!p\.id && gespeichert && gespeichert\.id\) p\.id = String\(gespeichert\.id\);/.test(adm),
  'Und übernimmt die frisch vergebene Kennung');
const reihenfolge = adm.indexOf('p.id = String(gespeichert.id)') < adm.indexOf('notifyPruefer(p)');
ok(reihenfolge, 'Das geschieht vor der Mail an die Prüfer – sonst nützt es nichts');

/* ── 2) Die Mail baut keinen Link ins Leere ── */
const fctx = {
  console, esc,
  State: { user: {} },
  _mailGeltungsbereich: () => '',
  _wfDokumentHtml: () => '',
  _wfApprovalsHtml: () => '',
};
fctx.window = fctx; fctx.globalThis = fctx;
vm.createContext(fctx);
vm.runInContext(lies('js/mailbau.js'), fctx);   // Rumpf und Knopf
vm.runInContext(lies('js/freigaben.js'), fctx);
const run = (s) => vm.runInContext(s, fctx);

const mitId = run(`_wfMailHtml('Prüfung', { id:'42', title:'KI', version:'1.0',
  aktionToken:{wert:'tok',art:'pruefung'} }, 'Text', '', 'pruefung', 'pruefer@dihag.com')`);
ok(mitId.includes('richtlinie=42'), 'Mit Kennung: der Link zeigt auf das Regelwerk');
ok(/aktion=konform/.test(mitId) && /aktion=nicht_konform/.test(mitId), 'Mit Kennung: beide Entscheidungs-Knöpfe');
ok(/Direkt entscheiden/.test(mitId), 'Mit Kennung: die Einladung zum Ein-Klick');

const ohneId = run(`_wfMailHtml('Prüfung', { title:'KI', version:'1.0',
  aktionToken:{wert:'tok',art:'pruefung'} }, 'Text', '', 'pruefung', 'pruefer@dihag.com')`);
ok(!/richtlinie=undefined/.test(ohneId), 'Ohne Kennung: kein „richtlinie=undefined" in der Mail');
ok(!/aktion=konform/.test(ohneId), 'Ohne Kennung: kein Ein-Klick-Knopf, der nur scheitern kann');
ok(/Richtlinie öffnen/.test(ohneId), 'Ohne Kennung: stattdessen der schlichte Portal-Link');
ok(/ansicht=freigaben/.test(ohneId), 'Und der führt wenigstens in den richtigen Reiter');

/* ── 3) Dieselbe Sicherung bei Bekanntgabe und Mitbestimmung ── */
const fg = lies('js/freigaben.js');
ok(/const url = p\.id\n\s*\? `https:\/\/rms\.dihag\.de\/\?richtlinie=/.test(fg),
  'Die Bekanntgabe-Mail sichert ihren Link ebenso ab');
ok(/'https:\/\/rms\.dihag\.de\/\?ansicht=meine'/.test(fg),
  'Und fällt sonst auf „Meine Regelwerke" zurück');
ok(/const url = p\.id\n\s*\? `\$\{base\}\?richtlinie=/.test(adm),
  'Die Mitbestimmungs-Mail ebenfalls');

/* ── 4) Der Rückgabewert von spSavePolicy trägt die Kennung überhaupt ── */
const sp = lies('js/sharepoint.js');
ok(/return _post\(\n\s*`\$\{SP\.graphBase\}\/sites\/\$\{_sp\.appSiteId\}\/lists\/\$\{_sp\.policyListId\}\/items`/.test(sp),
  'spSavePolicy() gibt bei einem neuen Eintrag die Antwort des POST zurück');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
