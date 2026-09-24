/**
 * Mail-Links entscheiden nur mit dem Token der Runde ohne Rückfrage.
 *
 * Die Kennungen zählen hoch; einen Link wie
 *   ?richtlinie=42&ansicht=freigaben&aktion=freigeben
 *   ?konzept=17&aktion=annehmen
 * kann jede:r bauen und der Geschäftsführung schicken. Früher genügte ein
 * Klick darauf, und die Freigabe stand unter deren Namen im Protokoll – das
 * Einmal-Token der Runde umging man, indem man es einfach wegließ.
 *
 * Jetzt: Mit gültigem Token ist der Klick die Entscheidung (wie gewohnt).
 * Ohne Token – oder mit einem falschen – fragt die App nach und nennt den
 * Vorgang beim Namen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire as _requireFuerHelfer } from 'module';
const { jsArg, sichereUrl } = _requireFuerHelfer(import.meta.url)('../js/util.js');   // echte Helfer für Handler und Links
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const warte = () => new Promise(r => setTimeout(r, 0));

const fg = lies('js/freigaben.js');
const nurFunktion = (src, name, bis) => src.slice(src.indexOf(name), src.indexOf(bis));

/* ── 1) Konzepte: Token in der Mail, Ein-Klick nur damit ── */
const konzepte = [];
const gespeichert = [];
const kctx = {
  console, esc, JSON, Date, Promise,
  fmtDate: () => '', emptyState: () => '', toast: () => {}, openModal: () => {},
  State: { user: { upn: 'gf@dihag.com', name: 'GF' } },
  isCurrentUserGeschaeftsleitung: () => true, canWriteTab: () => true,
  konzeptZuId: (id) => konzepte.find(k => String(k.id) === String(id)) || null,
  document: { getElementById: () => null },
  setTimeout: (f) => f(),
  spSavePolicy: async (k) => { gespeichert.push(JSON.parse(JSON.stringify(k))); return { id: k.id }; },
  reloadData: async () => {}, renderAdminList: () => {}, notifyKonzeptErsteller: () => {},
  window: { crypto: { getRandomValues: (b) => { for (let i = 0; i < b.length; i++) b[i] = (i * 37 + 11) % 256; return b; } } },
};
kctx.globalThis = kctx;
kctx.jsArg ??= jsArg; kctx.sichereUrl ??= sichereUrl; vm.createContext(kctx);
vm.runInContext(lies('js/mailbau.js'), kctx);
vm.runInContext(lies('js/konzepte.js'), kctx);
// Token-Erzeugung und -Prüfung leben in freigaben.js – genau diese beiden Funktionen.
vm.runInContext(nurFunktion(fg, '/** Neues Einmal-Token für eine Runde. */', '/** In welchem Status'), kctx);
const run = (s) => vm.runInContext(s, kctx);

const tok = run("neuerAktionToken('konzept')");
ok(tok.art === 'konzept' && /^[a-z0-9]{12,}$/.test(tok.wert), 'Ein Konzept bekommt ein eigenes Token (Art „konzept")');

kctx.__k = { id: '17', title: 'KI-Richtlinie', konzept: { prioritaet: 'hoch' }, aktionToken: tok };
const mail = run('_konzeptMailHtml(__k, false, false)');
ok(mail.includes(`konzept=17&amp;aktion=annehmen&amp;t=${tok.wert}`), 'Die Mail trägt das Token an „Annehmen"');
ok(mail.includes(`aktion=zurueckstellen&amp;t=${tok.wert}`) && mail.includes(`aktion=ablehnen&amp;t=${tok.wert}`), '… und an den beiden anderen Knöpfen');
kctx.__k2 = { id: '18', title: 'Alt', konzept: {}, aktionToken: { wert: 'x', art: 'freigabe' } };
ok(!run('_konzeptMailHtml(__k2, false, false)').includes('&amp;t='), 'Ein Token einer anderen Art gehört nicht in die Konzept-Mail');

// handleKonzeptMailAction: Welche Entscheidung mit welchen Optionen?
const echtesDecide = run('konzeptDecide');
let aufruf = null;
run('konzeptDecide = (id, d, o) => { globalThis.__aufruf = { id, d, o }; }');
konzepte.push({ id: '17', title: 'KI-Richtlinie', konzept: {}, aktionToken: tok });
const klick = (aktion, t) => { kctx.__aufruf = null; run(`handleKonzeptMailAction('17', ${JSON.stringify(aktion)}, ${JSON.stringify(t)})`); return kctx.__aufruf; };

aufruf = klick('annehmen', tok.wert);
ok(aufruf && aufruf.d === 'angenommen' && aufruf.o.ohneRueckfrage === true, 'Mit dem Token der Runde: der Klick ist die Entscheidung');
aufruf = klick('annehmen', '');
ok(aufruf && aufruf.o.ohneRueckfrage === false, 'Ohne Token: Rückfrage – den Link kann jede:r bauen');
aufruf = klick('annehmen', 'geraten');
ok(aufruf && aufruf.o.ohneRueckfrage === false, 'Mit falschem Token: ebenfalls Rückfrage');
konzepte[0].aktionToken = { wert: tok.wert, art: 'freigabe' };
aufruf = klick('zurueckstellen', tok.wert);
ok(aufruf && aufruf.o.ohneRueckfrage === false, 'Ein Token einer anderen Runde zählt nicht');
konzepte[0].aktionToken = tok;

// Die Entscheidung beendet die Runde: Das Token wird mit ihr gelöscht.
kctx.konzeptDecide = echtesDecide;
await run("konzeptDecide('17', 'zurueckgestellt', { ohneRueckfrage: true, ohneWeiche: true })");
await warte();
const zuletzt = gespeichert[gespeichert.length - 1];
ok(zuletzt && zuletzt.konzept.entscheidung.status === 'zurueckgestellt', 'Die Entscheidung wird gespeichert');
ok(zuletzt && zuletzt.aktionToken === null, 'Und mit ihr verfällt das Token – ein alter Link fragt ab jetzt nach');
ok(konzepte[0].aktionToken === tok, 'Der Bestand bleibt unberührt, bis gespeichert ist (Arbeitskopie)');

// Einreichen erzeugt das Token (beide Wege)
const kjs = lies('js/konzepte.js');
ok((kjs.match(/k\.aktionToken = neuerAktionToken\('konzept'\)/g) || []).length === 2,
  'Beide Wege zur GF (Editor und Karte) erzeugen ein neues Token');
ok(/handleKonzeptMailAction\(konzeptId, aktion, params\.get\('t'\) \|\| ''\)/.test(lies('js/app.js')),
  'Die Landung gibt das Token aus dem Link weiter');

/* ── 2) Regelwerke: Link ohne Token → Rückfrage vor jeder Zustimmung ── */
const spur = [];
let antwort = false;
const fctx = {
  console, esc, JSON, Date, Promise,
  toast: (t) => spur.push('toast:' + t),
  setTimeout: (f) => f(),
  policyZuId: (id) => (String(id) === '42' ? { id: '42', title: 'Passwortrichtlinie', status: 'Freigabe' } : null),
  isCurrentUserPrueferForPolicy: () => true,
  isCurrentUserGeschaeftsleitungForPolicy: () => true,
  uiConfirm: async (text, opts) => { spur.push('frage:' + text + '|' + opts.okLabel); return antwort; },
  markFreigabe: (id) => spur.push('freigabe:' + id),
  markKonform: (id, k) => spur.push('konform:' + id + ':' + k),
};
fctx.globalThis = fctx;
fctx.jsArg ??= jsArg; fctx.sichereUrl ??= sichereUrl; vm.createContext(fctx);
vm.runInContext(nurFunktion(fg, '/**\n * Aus einem Mail-Link OHNE gültiges Token', 'function _votesHtml'), fctx);
const mailKlick = async (aktion) => { spur.length = 0; vm.runInContext(`handleMailAction('42', '${aktion}')`, fctx); await warte(); return spur.slice(); };

antwort = false;
let s = await mailKlick('freigeben');
ok(s.some(x => x.startsWith('frage:„Passwortrichtlinie"') && x.endsWith('|Freigeben')), 'Freigabe ohne Token: erst die Rückfrage, mit dem Namen des Regelwerks');
ok(!s.includes('freigabe:42'), 'Abgelehnt – nichts freigegeben');
antwort = true;
s = await mailKlick('freigeben');
ok(s.includes('freigabe:42'), 'Bestätigt – dann wird freigegeben');

antwort = false;
s = await mailKlick('konform');
ok(s.some(x => x.startsWith('frage:') && x.endsWith('|Konform')) && !s.includes('konform:42:true'), 'Konform ohne Token: ebenfalls erst die Rückfrage');
antwort = true;
s = await mailKlick('konform');
ok(s.includes('konform:42:true'), 'Bestätigt – dann konform');

s = await mailKlick('nicht_konform');
ok(s.includes('konform:42:false') && !s.some(x => x.startsWith('frage:')), '„Nicht konform" fragt selbst nach der Begründung – keine doppelte Rückfrage');

/* ── 3) Mit Token bleibt es beim Ein-Klick ── */
const app = lies('js/app.js');
ok(/if \(aktion && token\) \{[\s\S]{0,400}einKlickAktion\(deepId, aktion, token/.test(app), 'Mit Token führt der Weg weiter über einKlickAktion');
ok(/if \(!aktionTokenGueltig\(p, art, token\)\)/.test(fg), 'Und dort wird das Token geprüft, bevor etwas geschieht');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
