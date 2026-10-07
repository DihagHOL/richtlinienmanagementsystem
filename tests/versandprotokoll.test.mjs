/**
 * Versandprotokoll, Berichte ohne Probelauf, Funktionsprüfung nach dem Update.
 *
 * Vier kleine Lücken, die beim Selbsttest auffielen:
 *   • Die Mails nach Konformität und Mitbestimmung gingen raus, ohne dass
 *     jemand auf sie wartete. Scheiterte eine, sah man es nur an einer kurzen
 *     Meldung. Jetzt steht jede mit Empfängern und Ergebnis in der Historie.
 *     Geschrieben wird dabei NUR die Historie: Ein ganzer Speichervorgang aus
 *     einem älteren Stand könnte Status oder Ein-Klick-Token zurückdrehen.
 *   • Der Betriebsrat bekam beim direkten Einreichen eine Mail, deren Knöpfe nur
 *     „Schon erledigt" zeigten, und nach der Prüfung dieselbe noch einmal.
 *   • Berichte zählten Probelauf-Regelwerke mit.
 *   • Nach einem Update erinnert „Fälligkeiten" an die Funktionsprüfung.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Der Eintrag selbst ── */
const fg = lies('js/freigaben.js');
const ctx = {
  console, JSON, Date, Promise, Set, Map, Array, Object, String, Math,
  document: { getElementById: () => null },
  State: { user: { upn: 'isb@dihag.com', name: 'Iris Sicher' }, policies: [], konzepte: [], policiesAlle: [] },
  toasts: [], toast: (t, art) => ctx.toasts.push({ t, art }),
  esc: (s) => String(s == null ? '' : s),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fg, ctx);
const w = (a) => vm.runInContext(a, ctx);

const e1 = w(`wfMailEintrag('Prüfer (Konformitätsprüfung)', ['a@dihag.com', 'b@dihag.com'], [], State.user)`);
ok(e1.aktion === 'Mail versendet: Prüfer (Konformitätsprüfung)', 'Erfolg: „Mail versendet" mit der Art');
ok(e1.text === 'An: a@dihag.com, b@dihag.com', 'Mit allen Empfängern');
ok(e1.upn === 'isb@dihag.com' && e1.name === 'Iris Sicher' && /^\d{4}-\d\d-\d\dT/.test(e1.datum), 'Wer und wann, wie jeder Historien-Eintrag');
const e2 = w(`wfMailEintrag('Geschäftsleitung (Freigabe)', ['chef@dihag.com'], ['vize@dihag.com (Postfach voll)'], State.user)`);
ok(e2.aktion.startsWith('Mail versendet') && /Nicht erreicht: vize@dihag\.com \(Postfach voll\)/.test(e2.text), 'Teilweise zugestellt: wer nicht erreicht wurde und warum');
const e3 = w(`wfMailEintrag('Mitbestimmung (Betriebsrat)', [], ['Konzernbetriebsrat: keine Adresse hinterlegt'], State.user)`);
ok(e3.aktion === 'Mail nicht versendet: Mitbestimmung (Betriebsrat)' && /^Grund: /.test(e3.text), 'Nichts zugestellt: „Mail nicht versendet" mit Grund');
const viele = Array.from({ length: 40 }, (_, i) => `m${i}@dihag.com`);
const e4 = w(`wfMailEintrag('Erinnerung zur Kenntnisnahme', ${JSON.stringify(viele)}, [], State.user)`);
ok(/und 30 weitere$/.test(e4.text) && e4.text.length < 300, 'Lange Verteiler werden nicht vollständig ausgeschrieben');

/* ── 2) Die notify-Funktionen protokollieren ── */
const geschrieben = [];
ctx.spPolicyHistorieAnhaengen = async (id, eintraege) => { geschrieben.push({ id, e: eintraege[0] }); return { vorher: 'T1', nachher: 'T2' }; };
ctx.spGetDocAttachment = async () => null;
ctx.getPolicyPruefer = () => ['p1@dihag.com', 'p2@dihag.com'];
ctx.getPolicyGeschaeftsleitung = () => ['chef@dihag.com'];
ctx.mitVertretern = (l) => l;
ctx._wfMailHtml = () => '<p>x</p>';
ctx._mitMailHtml = () => '<p>x</p>';
ctx.getKbrMail = () => '';
ctx.getBrMail = (c) => (c === 'SHB' ? 'br.shb@dihag.com' : '');
const versand = [];
ctx.spSendMail = async (an, betreff) => {
  if (an[0] === 'p2@dihag.com') throw new Error('Postfach voll');
  versand.push({ an, betreff }); return true;
};
ctx.State.policies = [{ id: '7', title: 'Passwortrichtlinie', historie: [], modifiedAt: 'T1' }];
ctx.State.policiesAlle = ctx.State.policies.slice();

await w(`notifyPruefer({ id: '7', title: 'Passwortrichtlinie' })`);
await w('_wfMailKette');
let g = geschrieben.pop();
ok(g && g.id === '7' && g.e.aktion === 'Mail versendet: Prüfer (Konformitätsprüfung)', 'Prüfer-Mail: steht in der Historie');
ok(g && /An: p1@dihag\.com/.test(g.e.text) && /Nicht erreicht: p2@dihag\.com \(Postfach voll\)/.test(g.e.text), 'Mit dem Prüfer, der nicht erreicht wurde');
const lokal = ctx.State.policies[0];
ok(lokal.historie.length === 1 && lokal.modifiedAt === 'T2', 'Der geladene Stand rückt nach: Eintrag und Änderungsstand (kein Fehlalarm beim nächsten Klick)');

ctx.spSendMail = async () => { throw new Error('Mail.Send fehlt'); };
await w(`notifyGL({ id: '7', title: 'Passwortrichtlinie' })`);
await w('_wfMailKette');
g = geschrieben.pop();
ok(g && g.e.aktion === 'Mail nicht versendet: Geschäftsleitung (Freigabe)' && /Mail\.Send fehlt/.test(g.e.text),
  'Die GL-Mail, auf die niemand wartet: Fehlschlag steht in der Historie');
ok(ctx.toasts.some(x => x.art === 'error' && /Geschäftsleitung nicht vollständig zugestellt/.test(x.t)), 'Und es gibt eine Meldung, die auf die Historie verweist');

ctx.spSendMail = async (an, betreff) => { versand.push({ an, betreff }); return true; };
await w(`notifyMitbestimmung({ id: '7', title: 'Passwortrichtlinie', kbrBetroffen: true, mitbestimmungWerke: ['SHB'] })`);
await w('_wfMailKette');
g = geschrieben.pop();
ok(g && g.e.aktion === 'Mail versendet: Mitbestimmung (Betriebsrat)' && /br\.shb@dihag\.com/.test(g.e.text)
  && /Konzernbetriebsrat: keine Adresse hinterlegt/.test(g.e.text), 'Mitbestimmung: zugestellt an den BR, und dass für den KBR keine Adresse da war');

ctx.getPolicyGeschaeftsleitung = () => [];
await w(`notifyGL({ id: '7', title: 'Passwortrichtlinie' })`);
await w('_wfMailKette');
g = geschrieben.pop();
ok(g && /Keine Geschäftsleitung hinterlegt/.test(g.e.text), 'Auch „niemand hinterlegt" wird protokolliert');

ok(/wfMailProtokoll\(p\.id, 'Bekanntgabe an die Zielgruppe', \[\], \[e\.message\]\)/.test(fg), 'Bekanntgabe: der Fehlschlag (der Erfolg stand schon in der Historie)');
const konz = lies('js/konzepte.js');
ok((konz.match(/wfMailProtokoll\(k\.id, 'Konzept an die Geschäftsleitung'/g) || []).length === 3, 'Konzept an die GL: Erfolg, Fehlschlag, niemand hinterlegt');
ok((konz.match(/wfMailProtokoll\(k\.id, 'Rückmeldung an die einreichende Person'/g) || []).length === 2, 'Rückmeldung an die einreichende Person ebenso');
ok(/wfMailProtokoll\(p\.id, 'Erinnerung zur Kenntnisnahme'/.test(lies('js/admin.js')), 'Und die Erinnerung zur Kenntnisnahme');
ok(/Mail nicht versendet/.test(lies('js/admin.js').slice(lies('js/admin.js').indexOf('function renderHistorieSection'))), 'Die Historie hebt nicht versendete Mails hervor');

/* ── 3) Nur die Historie wird geschrieben, frisch gelesen und mit If-Match ── */
const sp = lies('js/sharepoint.js');
const sctx = { console, JSON, Date, Promise, Set, Map, Array, Object, String, Math, location: { origin: '', pathname: '' } };
sctx.window = sctx; sctx.globalThis = sctx;
vm.createContext(sctx);
vm.runInContext(sp, sctx);
const anfragen = [];
let antworten412 = 1;
sctx.acquireToken = async () => 'tok';
sctx.spInit = async () => {};
sctx._spSpalten = async () => {};
vm.runInContext(`_sp.appSiteId = 'S'; _sp.policyListId = 'L'; _sp.policyColumns = [{ name: 'DatenJson' }, { name: 'HistorieJson' }, { name: 'Status' }];
  _sp.policyFields = new Set(['DatenJson', 'HistorieJson', 'Status']);`, sctx);
const daten = { typ: 'Regelwerk', historie: [{ aktion: 'Angelegt' }], aktionToken: { art: 'freigabe', wert: 'xyz' }, bekanntgabeAm: '' };
sctx.fetch = async (url, opt) => {
  anfragen.push({ url, opt });
  const json = (o, status) => ({ ok: (status || 200) < 300, status: status || 200, headers: { get: () => null }, json: async () => o, text: async () => JSON.stringify(o) });
  if (!opt || !opt.method || opt.method === 'GET') {
    if (/\$expand=fields/.test(url)) return json({ id: '7', lastModifiedDateTime: 'T1', fields: { '@odata.etag': '"e1,3"', DatenJson: JSON.stringify(daten), HistorieJson: JSON.stringify(daten.historie) } });
    return json({ id: '7', lastModifiedDateTime: 'T2', lastModifiedBy: { user: { displayName: 'Iris' } } });
  }
  if (opt.method === 'PATCH') {
    if (antworten412-- > 0) return json({ error: 'Precondition Failed' }, 412);
    return json({});
  }
  return json({});
};
const stand = await vm.runInContext(`spPolicyHistorieAnhaengen('7', [{ aktion: 'Mail versendet: Prüfer', text: 'An: p1' }])`, sctx);
const patches = anfragen.filter(a => a.opt && a.opt.method === 'PATCH');
ok(patches.length === 2, 'SharePoint meldet 412 (jemand hat dazwischen gespeichert): neu gelesen, zweiter Versuch');
const body = JSON.parse(patches[1].opt.body);
ok(Object.keys(body).sort().join(',') === 'DatenJson,HistorieJson', 'Geschrieben werden nur Sammelfeld und Historie, kein Status, keine Prüfvoten');
const neu = JSON.parse(body.DatenJson);
ok(neu.historie.length === 2 && neu.historie[1].aktion === 'Mail versendet: Prüfer', 'Der Eintrag hängt hinten an');
ok(neu.aktionToken && neu.aktionToken.wert === 'xyz' && neu.typ === 'Regelwerk', 'Der Rest des Sammelfelds bleibt, wie er auf dem Server stand (Ein-Klick-Token!)');
ok(patches[1].opt.headers['If-Match'] === '"e1,3"', 'Mit If-Match auf den gelesenen Stand');
ok(stand && stand.vorher === 'T1' && stand.nachher === 'T2', 'Rückgabe: Änderungsstand davor und danach');
ok(/\/items\/7\/fields$/.test(patches[1].url), 'Ziel ist das Feldset des Eintrags');

/* ── 4) Betriebsrat: eine Mail, erst nach der Prüfung ── */
const direkt = konz.slice(konz.indexOf('async function konzeptDirektZurPruefung'), konz.indexOf('async function notifyKonzeptErsteller'));
ok(direkt && !/notifyMitbestimmung\(/.test(direkt), 'Direkt zur Prüfung: keine Mail an den Betriebsrat');
ok(/if \(toBR && typeof notifyMitbestimmung === 'function'\) notifyMitbestimmung\(p\)/.test(fg), 'Die eine Mail kommt, wenn die Prüfung konform ist');

/* ── 5) Berichte ohne Probelauf ── */
const app = lies('js/app.js');
const actx = { State: { policies: [{ title: 'A' }, { title: '[Probelauf] B' }, { title: 'C [Probelauf]' }] } };
vm.createContext(actx);
vm.runInContext(app.slice(app.indexOf('function istProbelaufEintrag'), app.indexOf('function berichtsPolicies')) + app.slice(app.indexOf('function berichtsPolicies')).split('\n}\n')[0] + '\n}', actx);
ok(vm.runInContext('berichtsPolicies().map(p => p.title).join("|")', actx) === 'A|C [Probelauf]', 'berichtsPolicies: ohne Einträge, deren Titel mit [Probelauf] beginnt');
const G = /\(typeof berichtsPolicies === 'function' \? berichtsPolicies\(\) : \(State\.policies \|\| \[\]\)\)/;
for (const [datei, wo] of [['js/clevelreport.js', 'Audit Report'], ['js/cockpit.js', 'Cockpit'], ['js/faelligkeit.js', 'Fälligkeiten'],
  ['js/abdeckung.js', 'IMS-Abdeckung'], ['js/freigaben.js', 'Freigabe-Audit']]) ok(G.test(lies(datei)), `${wo} zählt ohne Probelauf`);
ok((lies('js/admin.js').match(new RegExp(G.source + "\\.filter\\(p => p\\.status === 'Veröffentlicht' && p\\.pflicht\\)", 'g')) || []).length === 3,
  'Kenntnisnahme-Übersicht, Auswahl und CSV im Audit Report ebenso');
ok((lies('js/cockpit.js').match(G) ? lies('js/cockpit.js').match(new RegExp(G.source, 'g')).length : 0) === 3, 'Im Cockpit alle drei Stellen');

/* ── 6) Funktionsprüfung nach dem Update ── */
const fae = lies('js/faelligkeit.js');
const fctx = { module: { exports: {} } };
vm.createContext(fctx);
vm.runInContext(fae, fctx);
const { faelligFunktionspruefung: fp, FP_FRIST_TAGE } = fctx.module.exports;
const heute = new Date('2026-10-20T10:00:00');
const pr = (datum, version, status, extra) => Object.assign({ id: String(Math.random()), art: 'pruefung', titel: 'Funktionsprüfung RMS: Selbsttest', datum,
  umfang: version ? `Selbsttest im Probelauf (Version ${version}): Konzept …` : 'Von Hand geprüft', status: status || 'abgeschlossen' }, extra || {});
ok(FP_FRIST_TAGE === 30, 'Frist: 30 Tage nach der letzten Prüfung');
ok(fp([], 'v-bbb', '2026-10-19', heute).stufe === 'nie', 'Keine Prüfung: „nie"');
ok(fp([pr('2026-10-10T08:00:00Z', 'v-bbb')], 'v-bbb', '2026-10-09', heute).stufe === 'aktuell', 'Die laufende Version ist geprüft: nichts zu tun');
let r = fp([pr('2026-10-10T08:00:00Z', 'v-aaa')], 'v-bbb', '2026-10-15', heute);
ok(r.stufe === 'faellig' && r.frist === '2026-11-09' && r.version === 'v-aaa' && r.tage === 20, 'Seitdem aktualisiert: fällig 30 Tage nach der Prüfung');
r = fp([pr('2026-09-01T08:00:00Z', 'v-aaa'), pr('2026-08-01T08:00:00Z', 'v-000')], 'v-bbb', '2026-10-15', heute);
ok(r.stufe === 'ueberfaellig' && r.frist === '2026-10-01', 'Länger her: überfällig, gemessen an der jüngsten Prüfung');
ok(fp([pr('2026-10-18T08:00:00Z', 'v-bbb', 'offen')], 'v-bbb', '2026-10-15', heute).stufe === 'fehler', 'Hat die letzte Prüfung Fehler gefunden, ist das die Nachricht');
ok(fp([pr('2026-10-16T08:00:00Z', '')], 'v-bbb', '2026-10-15', heute).stufe === 'aktuell', 'Von Hand erfasst, nach dem Build-Tag: zählt für die laufende Version');
ok(fp([pr('2026-10-14T08:00:00Z', '')], 'v-bbb', '2026-10-15', heute).stufe === 'faellig', 'Von Hand erfasst, vor dem Build-Tag: fällig');
ok(fp([pr('2026-10-18T08:00:00Z', 'v-bbb', 'abgeschlossen', { titel: 'Funktionsprüfung Zeiterfassung', umfang: 'Terminal' })], 'v-bbb', '', heute).stufe === 'nie',
  'Eine Funktionsprüfung eines anderen Systems zählt nicht');
ok(fp([pr('2026-10-18T08:00:00Z', 'v-bbb', 'verworfen')], 'v-bbb', '', heute).stufe === 'nie', 'Eine verworfene auch nicht');
ok(/<div id="fael-funktion"/.test(fae) && /_faelligFunktionZeigen\(\);/.test(fae), 'Fälligkeiten zeigt den Abschnitt');
ok(/spGetWirkLeise/.test(fae), 'Gelesen wird leise: Die Liste wird dafür nicht angelegt');
ok(/const APP_STAND = '\d{4}-\d\d-\d\d';/.test(app), 'Die App kennt den Tag ihres Builds');
ok(/const APP_STAND = '\$\(date -u \+%F\)';/.test(lies('.github/workflows/cache-bust.yml')), 'Und die Action setzt ihn bei jedem Deploy');

/* ── 7) Wen man fragen kann ── */
const pl = lies('js/probelauf.js');
const kz = pl.slice(pl.indexOf('function probelaufKeinZugriff'), pl.indexOf('function probelaufKeinZugriff') + 2000);
ok(/adminListe\(\)/.test(kz) && /mailto:/.test(kz), '„Probelauf nicht freigeschaltet" nennt die Administratoren mit Mail-Link');
ok(/spGetMembers\(\)\.then/.test(kz), 'Mit Namen, sobald die Mitarbeiterliste da ist');
const actx2 = { console, document: { getElementById: () => null }, State: { user: { upn: 'x@dihag.com' }, myRoles: [], myGroups: [] } };
actx2.globalThis = actx2;
vm.createContext(actx2);
vm.runInContext(lies('js/access.js'), actx2);
vm.runInContext(`setRuntimeConfig({ admins: [' admin@dihag.com ', '', 'zwei@dihag.com'] })`, actx2);
ok(vm.runInContext('adminListe().join("|")', actx2) === 'admin@dihag.com|zwei@dihag.com', 'adminListe: bereinigt, ohne leere Einträge');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
