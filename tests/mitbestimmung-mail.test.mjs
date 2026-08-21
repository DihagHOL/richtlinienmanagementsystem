/**
 * Der Betriebsrat entscheidet aus der Mail.
 *
 * Prüfer und Geschäftsleitung konnten längst per Klick aus Outlook entscheiden –
 * der Betriebsrat bekam nur eine Mitteilung. Sein Votum trug jemand aus dem
 * Workflow-Kreis nach, nachdem die Rückmeldung auf anderem Weg eingetroffen war.
 *
 * Jetzt stehen dieselben zwei Knöpfe in seiner Mail. Zwei Dinge sind dabei anders
 * als bei Prüfung und Freigabe:
 *   • Empfänger ist ein Betriebsrats-Postfach, kein persönliches Konto. Der Link
 *     trägt deshalb keinen Anmelde-Hinweis; erkannt wird die Zugehörigkeit an der
 *     Adresse selbst oder an der Mitgliedschaft in der hinterlegten Gruppe.
 *   • „Nicht konform" ohne Begründung wäre für den weiteren Ablauf wertlos –
 *     die Seite fragt danach, bevor sie speichert.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const acc = lies('js/access.js');
const adm = lies('js/admin.js');
const fg = lies('js/freigaben.js');
const app = lies('js/app.js');
const cron = lies('scripts/erinnerungen.mjs');

/* ── 1) Wer darf die Mitbestimmung entscheiden? ── */
const ctx = {
  console,
  document: { getElementById: () => null, addEventListener: () => {} },
  State: { user: { upn: 'br.shb@dihag.com' }, myRoles: [], myGroups: [] },
  getAuthUser: () => ({ username: ctx.State.user.upn }),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(acc, ctx);
const w = (a) => vm.runInContext(a, ctx);

w(`setRuntimeConfig({
  admins: ['admin@dihag.com'], pruefer: ['isb@dihag.com'], geschaeftsleitung: ['chef@dihag.com'],
  kbrMail: 'kbr@dihag.com', brMails: { SHB: 'br.shb@dihag.com', HOL: 'br.hol@dihag.com' } })`);

const rw = { id: '7', kbrBetroffen: true, mitbestimmungWerke: ['SHB'] };
const darf = (upn, gruppen) => {
  ctx.State.user = { upn };
  ctx.State.myGroups = gruppen || [];
  return vm.runInContext(`darfMitbestimmung(${JSON.stringify(rw)})`, ctx);
};

const ziele = vm.runInContext(`mitbestimmungMails(${JSON.stringify(rw)})`, ctx);
ok(ziele.length === 2 && ziele.includes('kbr@dihag.com') && ziele.includes('br.shb@dihag.com'),
  'Die Adressaten sind KBR und die Betriebsräte der betroffenen Werke');
ok(!vm.runInContext(`mitbestimmungMails({ kbrBetroffen: false, mitbestimmungWerke: [] })`, ctx).length,
  'Ist niemand betroffen, gibt es auch keinen Adressaten');
ok(!vm.runInContext(`mitbestimmungMails({ kbrBetroffen: false, mitbestimmungWerke: ['EIS'] })`, ctx).length,
  'Ein Werk ohne hinterlegte Adresse zählt nicht mit');

ok(darf('br.shb@dihag.com') === true, 'Der Betriebsrat des betroffenen Werks darf – es ist seine Adresse');
ok(darf('kbr@dihag.com') === true, 'Der Konzernbetriebsrat ebenso');
ok(darf('br.hol@dihag.com') === false, 'Ein Betriebsrat, der nicht betroffen ist, nicht');
ok(darf('mitglied@dihag.com', [{ id: 'g1', mail: 'br.shb@dihag.com' }]) === true,
  'Auch, wer Mitglied der hinterlegten BR-Gruppe ist – dafür muss niemand eine zweite Liste pflegen');
ok(darf('mitglied@dihag.com', [{ id: 'g2', mail: 'einkauf@dihag.com' }]) === false,
  'Eine beliebige andere Gruppe reicht nicht');
ok(darf('mitglied@dihag.com', [{ id: 'g3' }]) === false, 'Eine Gruppe ohne Adresse auch nicht');
ok(darf('isb@dihag.com') === true, 'Der Prüfer darf weiterhin – er dokumentiert das Votum, wenn es anders eintrifft');
ok(darf('chef@dihag.com') === true, 'Die Geschäftsleitung ebenso');
ok(darf('admin@dihag.com') === true, 'Ein Administrator ebenso');
ok(darf('niemand@dihag.com') === false, 'Sonst niemand');
ok(vm.runInContext(`darfMitbestimmung({ kbrBetroffen: false, mitbestimmungWerke: [] })`, ctx) === false,
  'Ohne Adressaten kann auch niemand über die Zugehörigkeit hineinkommen');

/* ── 2) Die Mail selbst ── */
const mailStart = adm.indexOf('function _mitMailHtml');
const mail = adm.slice(mailStart, adm.indexOf('\n}\n', adm.indexOf('Automatische Nachricht', mailStart)));
ok(/mb_konform/.test(mail) && /mb_nicht_konform/.test(mail), 'Die Mail trägt beide Entscheidungen');
ok(/✓ Konform/.test(mail) && /✗ Nicht konform/.test(mail), 'Und nur diese beiden – kein interner Knopf');
ok(!/Erneut an BR senden/.test(mail), '„Erneut an BR senden" bleibt im Portal, wo es hingehört');
ok(/p\.aktionToken\.art === 'mitbestimmung'/.test(mail),
  'Das Token gilt nur, wenn es zur Mitbestimmungs-Runde gehört');
const mailCode = mail.split(/\r?\n/).filter(z => !z.trim().startsWith('//')).join(' ');
ok(!/&u=/.test(mailCode), 'Kein Anmelde-Hinweis – Empfänger ist ein Postfach, kein Konto');
ok(/Bewusst OHNE/.test(mail), 'Mit Begründung im Quelltext, damit das niemand „nachrüstet"');
ok(/_wfApprovalsHtml\(p\)/.test(mail), 'Wer bereits zugestimmt hat, steht in der Mail');
ok(/fragt die Seite nach der Begründung/.test(mail), 'Und der Hinweis, dass „nicht konform" begründet werden muss');
ok(/ansicht=freigaben/.test(mail), 'Der Link führt in den Freigabe-Ablauf');

/* ── 3) Eigene Runde, eigenes Token ── */
ok(/p\.status = 'Mitbestimmung'; toBR = true;[\s\S]{0,200}neuerAktionToken\('mitbestimmung'\)/.test(fg),
  'Beim Übergang zum Betriebsrat beginnt eine neue Runde');
ok(/mb_konform:\s+\['Mitbestimmung'\]/.test(fg) && /mb_nicht_konform:\s+\['Mitbestimmung'\]/.test(fg),
  'Entschieden werden kann nur, solange der Vorgang dort liegt');
ok(/String\(aktion\)\.startsWith\('mb_'\) \? 'mitbestimmung'/.test(fg), 'Die Landung erkennt die Runde');
ok(/aktion === 'mb_konform'\) await markMitbestimmung\(id, true\)/.test(fg), 'Konform wird gespeichert');
ok(/aktion === 'mb_nicht_konform'\) await markMitbestimmung\(id, false\)/.test(fg), 'Nicht konform ebenso');
const mm = fg.slice(fg.indexOf('async function markMitbestimmung'), fg.indexOf('/** Mitbestimmungs-Mail (KBR/BR)'));
ok(/uiPrompt\('Warum lehnt die Mitbestimmung ab\? \(Pflicht\)'/.test(mm),
  'Ohne Eingabefeld fragt die Rückfrage nach der Begründung');
ok(/if \(!anmerkung\) \{ toast\('Ohne Begründung nicht möglich\.'/.test(mm),
  'Und ohne Begründung wird nichts gespeichert');
const ek = fg.slice(fg.indexOf('async function einKlickAktion'), fg.indexOf('/** Fehlklick zurücknehmen'));
ok(/typeof darfMitbestimmung === 'function' && darfMitbestimmung\(p\)/.test(ek), 'Die Landung prüft die Berechtigung');
ok(/der Betriebsrat \(und der Kreis der Prüfer bzw\. die Geschäftsleitung\)/.test(ek),
  'Und sagt bei fehlender Berechtigung, wer gemeint ist');
ok(/art === 'mitbestimmung' \|\| typeof vertretungFuerAus !== 'function'/.test(ek),
  'Eine Vertretung gibt es hier nicht – der Betriebsrat steht in keiner Vertreterliste');

/* ── 4) Der Betriebsrat kommt überhaupt bis zur Entscheidung ── */
ok(/const mbDarf = \(aktion === 'mb_konform' \|\| aktion === 'mb_nicht_konform'\)/.test(app),
  'Der Deeplink lässt die Mitbestimmung durch');
ok(/if \(!canReview && !mbDarf\)/.test(app),
  'Ohne sie bliebe der Betriebsrat an der Freigabe-Schranke hängen – er ist weder Prüfer noch GL');
ok(/switchView\(canReview \? 'freigaben' : 'meine'\)/.test(app),
  'Hinter dem Fenster steht für ihn eine Ansicht, die er sehen darf');
ok(/const darfMb = \(p\) =>/.test(fg) && /mitbestimmungCardHtml\(p, darfMb\(p\)\)/.test(fg),
  'Im Portal gilt dieselbe Berechtigung, je Vorgang');

/* ── 5) Auch die Erinnerung aus dem Cron ── */
ok(/phase === 'Mitbestimmung'\s*\n?\s*\? _btn\(policyLink\(id, 'mb_konform', token\)/.test(cron),
  'Die Erinnerung an den Betriebsrat nutzt seine Aktionen, nicht die der Prüfer');
ok(/'mb_nicht_konform', token\)/.test(cron), 'Beide Knöpfe');
ok(!/policyLink\(id, 'mb_konform', token, empf\)/.test(cron), 'Ohne Empfänger im Link – wie in der ersten Mail');
ok(/phase === 'Mitbestimmung' \? 'mitbestimmung' : 'pruefung'/.test(cron), 'Mit dem Token der Mitbestimmungs-Runde');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
