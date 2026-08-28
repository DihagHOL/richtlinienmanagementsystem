/**
 * Die Mail-Bausteine stehen an einer Stelle.
 *
 * Rumpf, Knopf und Fußzeile lagen in vier Dateien in je zwei bis drei Kopien.
 * Der Knopf sogar dreimal wortgleich – derselbe 130 Zeichen lange Style-String,
 * zweimal „btn" genannt, einmal „mbBtn".
 *
 * Der Preis war nicht theoretisch: Als die Entscheidungs-Links gegen fehlende
 * Kennungen abgesichert werden mussten, war dieselbe Sicherung an drei Stellen
 * einzeln einzubauen. Genau das soll nicht wiederkommen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Die Bausteine tun, was sie sollen ── */
const ctx = { console, esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/mailbau.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

ok(run(`mailRumpf('X')`).startsWith('<div style="font-family:Arial'), 'mailRumpf() setzt den bekannten Rahmen');
ok(run(`mailRumpf('X')`).endsWith('X</div>'), 'Und schließt ihn auch wieder');

const knopf = run(`mailBtn('https://rms.dihag.de/?a=1&b=2', MAIL_FARBE.ja, '✓ Konform')`);
ok(knopf.includes('&amp;b=2'), 'mailBtn() maskiert das Ziel – dort steckt eine Kennung aus den Daten');
ok(knopf.includes('>✓ Konform</a>'), 'Die Beschriftung bleibt unverändert – sie kommt aus dem Quelltext');
ok(knopf.includes('background:#16a34a'), 'Die Farbe kommt aus MAIL_FARBE');
ok(run(`MAIL_FARBE.nein`) === '#dc2626' && run(`MAIL_FARBE.warten`) === '#64748b',
  'Zustimmen, Ablehnen und Zurückstellen haben feste Farben');
ok(run(`mailFuss('Hinweis')`).includes('color:#9ca3af'), 'mailFuss() setzt das Kleingedruckte');

/* ── 2) Und niemand baut sie mehr selbst ── */
const jsDateien = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'mailbau.js');
const eigenerRumpf = jsDateien.filter(f =>
  lies('js/' + f).includes('font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;font-size:15px'));
ok(eigenerRumpf.length === 0,
  'Kein eigener Mail-Rumpf mehr' + (eigenerRumpf.length ? ' – noch in: ' + eigenerRumpf.join(', ') : ''));

const eigenerKnopf = jsDateien.filter(f =>
  /display:inline-block;background:\$\{(bg|farbe)\};color:#fff/.test(lies('js/' + f)));
ok(eigenerKnopf.length === 0,
  'Kein eigener Mail-Knopf mehr' + (eigenerKnopf.length ? ' – noch in: ' + eigenerKnopf.join(', ') : ''));

/* ── 3) Die Datei ist eingehängt ── */
const html = lies('index.html');
ok(/<script src="js\/mailbau\.js\?v=/.test(html), 'mailbau.js ist in index.html eingehängt');
ok(html.indexOf('js/mailbau.js') < html.indexOf('js/freigaben.js'), 'Und wird vor den Mail-Bauern geladen');

/* ── 4) Die Mails selbst sind unverändert (Stichprobe) ── */
const mctx = {
  console, URLSearchParams,
  document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
  sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
  location: { search: '' },
};
mctx.window = mctx; mctx.globalThis = mctx;
vm.createContext(mctx);
for (const f of ['js/util.js', 'js/mailbau.js', 'js/app.js', 'js/freigaben.js']) vm.runInContext(lies(f), mctx);
Object.assign(mctx, { fmtDate: () => '', geltungsbereichLabel: () => '', zielgruppenLabel: () => '' });
vm.runInContext(`State.user = { upn: 'a@dihag.com' }; State.policies = []; State.acks = [];`, mctx);

const mail = vm.runInContext(`_wfMailHtml('Prüfung',
  { id:'42', title:'KI', version:'1.0', aktionToken:{wert:'tok',art:'pruefung'} },
  'Text', '', 'pruefung', 'x@dihag.com')`, mctx);
ok(mail.startsWith('<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;font-size:15px;line-height:1.6;color:#1e2939">'),
  'Die Prüfer-Mail beginnt wie eh und je');
ok(mail.includes('background:#16a34a') && mail.includes('background:#dc2626'), 'Beide Knöpfe in ihren Farben');
ok(mail.endsWith('</div>'), 'Und endet wie eh und je');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
