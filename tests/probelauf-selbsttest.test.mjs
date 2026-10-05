/**
 * Probelauf: Schutz der Belegschaft, Selbsttest mit Mails, Aufräumen und Nachweis.
 *
 * Worauf es ankommt:
 *   • Ein Probelauf arbeitet auf den echten Listen. Die Belegschaft bekommt
 *     davon trotzdem nichts mit: „Meine Regelwerke" zeigt Probelauf-Einträge
 *     nur Freigeschalteten, die Bekanntgabe geht nur an die ausführende Person,
 *     der tägliche Erinnerungslauf lässt sie aus und mahnt stattdessen das
 *     Aufräumen an.
 *   • Der Selbsttest prüft nicht nur, ob Empfänger hinterlegt sind, sondern ob
 *     die Mails wirklich rausgingen – auch die, die ein Schritt verschickt,
 *     ohne darauf zu warten.
 *   • Steht die Freigabe-Schwelle auf „alle", kann der Test nicht
 *     veröffentlichen. Das ist ein Hinweis, kein Fehler.
 *   • „Danach aufräumen" löscht genau den Vorgang des Tests, nicht den der
 *     Vorführung. Was nicht ging, bleibt in der Spur.
 *   • Der große Selbsttest geht auch die Ablehnungswege – ohne Dialog, aber
 *     nicht ohne Begründung.
 *   • Der Bericht lässt sich als Funktionsprüfung im Register ablegen, ohne
 *     „[Probelauf]" im Titel – er soll bleiben.
 *
 * Der Selbsttest läuft hier wirklich, gegen eine nachgebaute Liste: dieselben
 * Funktionsnamen, dieselben Betreffs, dieselben Statuswechsel.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split(String.fromCharCode(13)).join('');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kopie = (o) => JSON.parse(JSON.stringify(o));
/** Eine Funktion samt Rumpf aus einer Quelldatei schneiden (für Dateien, die man nicht ganz laden kann). */
const funktion = (src, name) => {
  const i = src.search(new RegExp('(async )?function ' + name + '\\('));
  if (i < 0) return '';
  let tiefe = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') tiefe++; else if (src[j] === '}' && --tiefe === 0) break; }
  return src.slice(i, j + 1);
};

/* ═══ 1) Die Belegschaft sieht nichts ═══ */
console.log('Meine Regelwerke');
{
  const app = lies('js/app.js');
  const c = { State: { policies: [
      { id: '1', title: 'Echtes Regelwerk', status: 'Veröffentlicht' },
      { id: '2', title: '[Probelauf] Selbsttest', status: 'Veröffentlicht' },
    ], myRoles: [] }, policyMatchesRoles: () => true, darf: false };
  c.darfProbelauf = () => c.darf;
  vm.createContext(c);
  vm.runInContext(funktion(app, 'publishedPolicies') + '\n' + funktion(app, 'istProbelaufEintrag'), c);
  ok(vm.runInContext('publishedPolicies().map(p => p.id).join()', c) === '1', 'Mitarbeitende sehen den Probelauf nicht');
  c.darf = true;
  ok(vm.runInContext('publishedPolicies().map(p => p.id).join()', c) === '1,2', 'Freigeschaltete sehen ihn – sie führen ihn ja vor');
  ok(vm.runInContext('istProbelaufEintrag({ title: "Probelauf-Konzept" })', c) === false, 'Erkannt wird nur die Kennzeichnung am Anfang');
}

console.log('Bekanntgabe und Erinnerung');
{
  const fg = lies('js/freigaben.js');
  const c = { State: { user: { upn: 'chef@dihag.com' } }, mailsFuerZielgruppen: () => ({ adressen: ['alle@dihag.com'], fehlend: [] }) };
  c.istProbelaufEintrag = (p) => String(p.title || '').startsWith('[Probelauf]');
  vm.createContext(c);
  vm.runInContext(funktion(fg, 'bekanntgabeZiel'), c);
  const pz = vm.runInContext('bekanntgabeZiel({ title: "[Probelauf] X", zielgruppen: ["ALLE"] })', c);
  ok(pz.probelauf && pz.adressen.join() === 'chef@dihag.com', 'Probelauf: Die Bekanntgabe geht nur an die ausführende Person');
  const echt = vm.runInContext('bekanntgabeZiel({ title: "Echt", zielgruppen: ["ALLE"] })', c);
  ok(!echt.probelauf && echt.adressen.join() === 'alle@dihag.com', 'Ein echtes Regelwerk geht wie gehabt an den Verteiler');
  ok(/const \{ adressen, fehlend, probelauf \} = bekanntgabeZiel\(p\);/.test(funktion(fg, 'notifyZielgruppe')), 'notifyZielgruppe fragt bekanntgabeZiel');
  ok(/bekanntgabeZiel\(p\)/.test(funktion(fg, 'zielgruppeInformieren')), 'Auch die Bekanntgabe von Hand');
  ok(/if \(ziel\.probelauf\) \{/.test(funktion(fg, 'markFreigabe')), 'Bei der Freigabe ohne Rückfrage – es gibt nichts zu entscheiden');
  const adm = funktion(lies('js/admin.js'), 'remindOpenForCurrent');
  ok(/const offene = probelauf \? \[State\.user\.upn\]/.test(adm), 'Die Pflicht-Erinnerung eines Probelaufs geht nur an die ausführende Person');
}

console.log('Täglicher Erinnerungslauf');
{
  const cron = lies('scripts/erinnerungen.mjs');
  ok(/const items = alleEintraege\.filter\(\(it\) => !istProbelauf\(it\.fields \|\| \{\}\)\);/.test(cron), 'Probelauf-Einträge werden vor allen Abschnitten herausgenommen');
  ok((cron.match(/await loadPolicies\(/g) || []).length === 1, 'Und nirgends sonst nachgeladen');
  ok(/const PROBELAUF_KENNUNG = '\[Probelauf\]';/.test(cron), 'Dieselbe Kennzeichnung wie in der App');
  ok(/isDue\(x\.tage, 7, 7\)/.test(cron), 'Der Hinweis aufzuräumen kommt einmal die Woche');
  const c = { lc: (s) => String(s || '').toLowerCase(), daysSince: (iso) => Math.floor((Date.parse('2026-10-15T08:00:00Z') - Date.parse(iso)) / 86400000) };
  vm.createContext(c);
  vm.runInContext(funktion(cron, 'probelaufNachPerson'), c);
  c.__e = [
    { createdBy: { user: { email: 'Chef@dihag.com', displayName: 'Chef' } }, createdDateTime: '2026-10-08T07:00:00Z', fields: { Title: '[Probelauf] A' } },
    { createdBy: { user: { email: 'chef@dihag.com' } }, createdDateTime: '2026-10-01T07:00:00Z', fields: { Title: '[Probelauf] B' } },
    { createdBy: { user: {} }, createdDateTime: '2026-10-01T07:00:00Z', fields: { Title: '[Probelauf] C' } },
  ];
  const je = vm.runInContext('probelaufNachPerson(__e)', c);
  ok(je.length === 1 && je[0].upn === 'chef@dihag.com' && je[0].titel.length === 2, 'Je Person, die die Einträge angelegt hat');
  ok(je[0].tage === 14, 'Gezählt wird ab dem ältesten Eintrag');
}

/* ═══ 2) Der Selbsttest gegen eine nachgebaute Liste ═══ */
function umgebung(opt) {
  const liste = new Map();
  const acks = new Map();
  let nid = 500;
  const mails = [];
  const geloescht = [];
  let modal = '';
  const gl = opt.gl || ['chef@dihag.com'];
  const ctx = {
    console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, Error,
    Uint8Array, Uint32Array, TextEncoder, setTimeout, clearTimeout,
    esc, toast: () => {}, showSync: () => {}, closeModal: () => {},
    location: { search: '', pathname: '/' },
    localStorage: (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })(),
    State: { user: { upn: 'chef@dihag.com', name: 'Chef' }, policies: [], konzepte: [], acks: [] },
    getGeschaeftsleitung: () => gl, getPolicyGeschaeftsleitung: () => gl,
    getPruefer: () => ['pruefer@dihag.com'], getKbrMail: () => 'kbr@dihag.com',
    getFreigabeSchwelle: () => opt.schwelle || 'eine', getPolicyFreigabeSchwelle: () => opt.schwelle || 'eine',
    isCurrentUserGeschaeftsleitung: () => true,
    document: { getElementById: (id) => (id === 'pl-st-aufraeumen' ? { checked: !!opt.aufraeumen }
      : id === 'pl-st-gross' ? { checked: !!opt.gross } : null), querySelectorAll: () => [] },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.openModal = (h) => { modal = h; if (h.includes('id="pl-st-gross"')) setTimeout(() => vm.runInContext('_plFrageEnde(true)', ctx), 0); };

  // Die Datenschicht
  ctx.spSavePolicy = async (p) => { const id = p.id || String(nid++); liste.set(id, Object.assign(kopie(p), { id })); return { id }; };
  ctx.spSaveAcknowledgement = async (a) => { const id = 'a' + nid++; acks.set(id, Object.assign(kopie(a), { id })); return { id }; };
  ctx.spDeletePolicy = async (id) => { if (opt.loeschFehler === String(id)) throw new Error('gesperrt'); liste.delete(String(id)); geloescht.push('p' + id); };
  ctx.spDeleteAcknowledgement = async (id) => { acks.delete(id); geloescht.push(id); };
  ctx.spDeleteDriveItem = async (d, i) => { geloescht.push(i); };
  ctx.spUploadPolicyDoc = async (name) => ({ driveId: 'd', itemId: 'f' + nid++, name, url: 'https://sp/' + name });
  ctx.spSendMail = async (an, betreff) => {
    mails.push({ an, betreff });
    if (opt.mailFehler && betreff.startsWith(opt.mailFehler)) throw new Error('Postfach nicht erreichbar');
    return true;
  };
  ctx.reloadData = async () => {
    const alle = [...liste.values()].map(kopie);
    ctx.State.policiesAlle = alle;
    ctx.State.policies = alle.filter(p => p.typ !== 'Konzept');
    ctx.State.konzepte = alle.filter(p => p.typ === 'Konzept');
    ctx.State.acks = [...acks.values()].map(kopie);
  };
  ctx.policyZuId = (id) => ctx.State.policies.find(p => String(p.id) === String(id)) || null;
  ctx.konzeptZuId = (id) => ctx.State.konzepte.find(p => String(p.id) === String(id)) || null;
  ctx.konzeptStatus = (k) => ({ abgelehnt: 'Abgelehnt', angenommen: 'Angenommen' }[((k.konzept || {}).entscheidung || {}).status] || 'GF-Prüfung');
  ctx.mitbestimmungPflicht = (p) => !!(p && p.kbrBetroffen);
  ctx.mitbestimmungBestaetigt = (p) => !!(p && p.mitbestimmung && p.mitbestimmung.bestaetigt);
  const titelVon = (id) => liste.get(String(id)).title;
  const send = (an, b) => ctx.spSendMail(an, b).catch(() => {});   // wie die notify…-Funktionen: Fehler nur gemeldet

  // Der Ablauf – Betreffs und Statuswechsel wie in konzepte.js und freigaben.js
  ctx.newKonzept = () => ({ typ: 'Konzept', title: '', konzept: {} });
  ctx.konzeptSubmitGF = async (id) => {
    const k = liste.get(String(id)); k.konzept.eingereichtAm = new Date().toISOString();
    await ctx.reloadData(); await send(gl, 'Neues Regelwerk-Konzept zur Prüfung: ' + k.title);
  };
  ctx.konzeptDecide = async (id, entscheidung, o) => {
    const k = liste.get(String(id));
    if (entscheidung === 'abgelehnt') {
      if (!o || !o.grund) return;   // die echte Funktion würde fragen
      k.konzept.entscheidung = { status: 'abgelehnt', kommentar: o.grund };
      await ctx.reloadData(); await send(['chef@dihag.com'], 'Konzept abgelehnt: ' + k.title);
      return;
    }
    const rw = await ctx.spSavePolicy({ typ: 'Regelwerk', title: k.title, regelwerkTyp: k.regelwerkTyp, geltungsbereich: k.geltungsbereich.slice(),
      status: 'Entwurf', historie: [{ aktion: 'Konzept freigegeben' }, { aktion: 'Angelegt' }] });
    k.konzept.entscheidung = { status: 'angenommen' }; k.konzept.regelwerkId = rw.id;
    await ctx.reloadData(); await send(['chef@dihag.com'], 'Konzept angenommen: ' + k.title);
    return rw.id;
  };
  ctx.konzeptDirektZurPruefung = async (id) => {
    const p = liste.get(String(id)); p.status = 'Konformitätsprüfung'; p.historie.push({ aktion: 'Status geändert' });
    await ctx.reloadData();
    await send(['pruefer@dihag.com'], 'Neues Regelwerk zur Sichtung: ' + p.title);
    if (p.kbrBetroffen) await send(['kbr@dihag.com'], 'Mitbestimmung – Richtlinie zur Prüfung: ' + p.title);
  };
  ctx.markKonform = async (id, konform, o) => {
    const p = liste.get(String(id));
    if (!konform && !(o && o.grund)) return;
    p.konformitaet = (p.konformitaet || []).filter(v => v.upn !== 'chef@dihag.com');
    p.konformitaet.push({ upn: 'chef@dihag.com', entscheidung: konform ? 'konform' : 'nicht_konform', anmerkung: (o && o.grund) || '' });
    if (konform) {
      p.status = (p.kbrBetroffen && !(p.mitbestimmung && p.mitbestimmung.bestaetigt)) ? 'Mitbestimmung' : 'Freigabe';
      // wie notifyMitbestimmung: ohne darauf zu warten
      if (p.status === 'Mitbestimmung') setTimeout(() => send(['kbr@dihag.com'], 'Mitbestimmung – Richtlinie zur Prüfung: ' + p.title), 5);
    }
    p.historie.push({ aktion: konform ? 'Konformitätsprüfung: konform' : 'Konformitätsprüfung: nicht konform' });
    await ctx.reloadData();
  };
  ctx.markMitbestimmung = async (id, konform, o) => {
    const p = liste.get(String(id));
    if (!konform && !(o && o.grund)) return;
    p.mitbestimmung = { bestaetigt: !!konform, konform: !!konform, anmerkung: (o && o.grund) || '' };
    p.status = konform ? 'Freigabe' : 'Konformitätsprüfung';
    p.historie.push({ aktion: konform ? 'Mitbestimmung: konform' : 'Mitbestimmung: nicht konform' });
    await ctx.reloadData();
    // wie notifyGL: nach dem Herunterladen des Anhangs, ohne darauf zu warten
    if (konform) setTimeout(() => send(gl, 'Regelwerk zur Freigabe: ' + p.title), 40);
  };
  ctx.markFreigabe = async (id) => {
    const p = liste.get(String(id));
    p.freigaben = [{ upn: 'chef@dihag.com' }];
    const genug = !((opt.schwelle || 'eine') === 'alle' && gl.length > 1);
    if (genug) p.status = 'Veröffentlicht';
    p.historie.push({ aktion: 'Freigabe' });
    await ctx.reloadData();
    if (genug) await send(['chef@dihag.com'], 'Neues Regelwerk: ' + p.title);
  };
  ctx.confirmRead = async (id) => { await ctx.spSaveAcknowledgement({ richtlinieId: id }); await ctx.reloadData(); };

  vm.createContext(ctx);
  vm.runInContext(lies('js/probelauf.js'), ctx);
  vm.runInContext('_plAn = true; _plMailRuheMs = 60; _plBuchfuehrung();', ctx);
  return { ctx, liste, mails, geloescht, modal: () => modal, titelVon };
}
const pruef = (ctx) => vm.runInContext('_plBerichtDaten.pruefungen', ctx);
const finde = (ctx, name) => pruef(ctx).find(p => p.name === name) || null;

console.log('Selbsttest: Normalfall, groß, mit Aufräumen');
{
  const u = umgebung({ aufraeumen: true, gross: true });
  // Ein Vorgang aus der Vorführung steht schon in der Spur – er muss stehen bleiben.
  await vm.runInContext('spSavePolicy({ typ: "Konzept", title: "[Probelauf] Vorführung", konzept: {} })', u.ctx);
  const vorfuehrung = [...u.liste.keys()][0];
  await vm.runInContext('probelaufSelbsttest()', u.ctx);
  const p = pruef(u.ctx);
  const rot = p.filter(x => !x.ok);
  ok(p.length > 30 && !rot.length, `Alle Prüfungen grün (${p.length}${rot.length ? ', rot: ' + rot.map(x => x.name + ' ' + x.detail).join(' | ') : ''})`);
  for (const name of ['Mail zur Konzeptprüfung an die Geschäftsleitung', 'Mail an die einreichende Person', 'Mail an die Prüfer',
    'Mail an den Betriebsrat', 'Mail zur Freigabe an die Geschäftsleitung', 'Bekanntgabe (im Probelauf nur an Sie)', 'Alle Mails zugestellt'])
    ok(finde(u.ctx, name) && finde(u.ctx, name).ok && !finde(u.ctx, name).hinweis, `Geprüft: ${name}`);
  ok(/an chef@dihag\.com/.test(finde(u.ctx, 'Mail zur Freigabe an die Geschäftsleitung').detail),
    'Auch die Mail, auf die niemand wartet, ist erfasst (notifyGL nach der Mitbestimmung)');
  ok(/2 Mails/.test(finde(u.ctx, 'Mail an den Betriebsrat').detail), 'Der Betriebsrat bekommt zwei Mails – der Bericht zeigt es');
  for (const name of ['Ablehnung: Konzept abgelehnt', 'Ablehnung: Begründung festgehalten', 'Ablehnung: Mail an die einreichende Person',
    'Rückwege: „Nicht konform" hält den Entwurf in der Prüfung', 'Rückwege: Die Begründung steht im Prüfvotum',
    'Rückwege: Danach konform: weiter zur Mitbestimmung', 'Rückwege: Mitbestimmung „nicht konform": zurück in die Prüfung',
    'Rückwege: Der Rückweg steht in der Historie'])
    ok(finde(u.ctx, name) && finde(u.ctx, name).ok, `Großer Selbsttest: ${name}`);
  ok(u.liste.size === 1 && u.liste.has(vorfuehrung), 'Aufgeräumt: nur der Vorgang des Tests, die Vorführung bleibt');
  ok(vm.runInContext('_plSpur.policies.join()', u.ctx) === vorfuehrung, 'Die Spur hat danach wieder genau die Vorführung');
  const d = vm.runInContext('_plBerichtDaten', u.ctx);
  ok(d.aufgeraeumt && d.aufgeraeumt.weg > 5 && !d.aufgeraeumt.fehler, `Der Bericht nennt, was gelöscht wurde (${d.aufgeraeumt && d.aufgeraeumt.weg})`);
  ok(u.modal().includes('Prüfungen bestanden') && u.modal().includes('Versendete Mails'), 'Der Bericht zeigt Ergebnis und Mails');
  ok(u.modal().includes('Als Nachweis ablegen') === false, 'Ohne Register (spAddWirk) kein Knopf für den Nachweis');

  // Nachweis
  const nw = vm.runInContext('probelaufNachweis(_plBerichtDaten, { upn: "chef@dihag.com", name: "Chef" })', u.ctx);
  ok(nw.art === 'pruefung' && nw.status === 'abgeschlossen', 'Nachweis: Funktionsprüfung, abgeschlossen');
  ok(!nw.titel.includes('[Probelauf]') && /^Funktionsprüfung RMS/.test(nw.titel), 'Ohne Probelauf-Kennzeichnung – der Nachweis soll bleiben');
  ok(/Ablehnung eines Konzepts/.test(nw.umfang) && /✓ Alle Mails zugestellt/.test(nw.ergebnis) && /Prüfvorgang wurde danach gelöscht/.test(nw.ergebnis),
    'Umfang und Ergebnis sind vollständig');
  const W = require(path.join(ROOT, 'js', 'wirksamkeit.js'));
  ok(W.WIRK_ARTEN.pruefung && /A\.8\.29/.test(W.WIRK_ARTEN.pruefung.norm), 'Das Register kennt die Funktionsprüfung');
  ok(W.wirkAbschlussfehler(nw).length === 0, 'Der Nachweis ist vollständig genug zum Abschließen');
  ok(W.wirkAbschlussfehler(Object.assign({}, nw, { umfang: '' })).length === 1, 'Ohne Umfang nicht');
  ok(W.WIRK_QUELLEN.includes('Funktionsprüfung'), 'Eine Abweichung kann aus einer Funktionsprüfung stammen');

  let abgelegt = null;
  u.ctx.spAddWirk = async (w) => { abgelegt = w; return '77'; };
  await vm.runInContext('probelaufNachweisAblegen()', u.ctx);
  ok(abgelegt && abgelegt.art === 'pruefung' && vm.runInContext('_plBerichtDaten.nachweisId', u.ctx) === '77', 'Ablegen schreibt ins Register');
  ok(u.modal().includes('Als Nachweis im Register') && !u.modal().includes('probelaufNachweisAblegen()'), 'Danach steht es im Bericht, der Knopf ist weg');
}

console.log('Selbsttest: Schwelle „alle", eine Mail scheitert, ohne Aufräumen');
{
  const u = umgebung({ aufraeumen: false, gross: false, schwelle: 'alle', gl: ['chef@dihag.com', 'cfo@dihag.com', 'coo@dihag.com'],
    mailFehler: 'Neues Regelwerk zur Sichtung' });
  await vm.runInContext('probelaufSelbsttest()', u.ctx);
  const h = finde(u.ctx, 'Freigabe erteilt, Veröffentlichung steht aus');
  ok(h && h.hinweis && /1 von 3/.test(h.detail), 'Schwelle „alle": Hinweis statt Fehler, mit „1 von 3"');
  ok(!finde(u.ctx, 'Freigegeben und veröffentlicht'), 'Kein roter Punkt für die Veröffentlichung');
  ok(finde(u.ctx, 'Kenntnisnahme entfällt') && finde(u.ctx, 'Kenntnisnahme entfällt').hinweis, 'Die Kenntnisnahme entfällt mit Hinweis');
  ok(!finde(u.ctx, 'Bekanntgabe (im Probelauf nur an Sie)'), 'Ohne Veröffentlichung keine Bekanntgabe zu prüfen');
  const pm = finde(u.ctx, 'Mail an die Prüfer');
  ok(pm && !pm.ok && /Postfach nicht erreichbar/.test(pm.detail), 'Die gescheiterte Mail ist rot, mit Grund');
  ok(!finde(u.ctx, 'Alle Mails zugestellt').ok, 'Und die Summe auch');
  ok(u.liste.size === 2, 'Ohne Häkchen bleibt der Vorgang stehen (Konzept und Regelwerk)');
  ok(u.modal().includes('Aufräumen') && u.modal().includes('fehlgeschlagen'), 'Der Bericht bietet das Aufräumen an');
}

console.log('Aufräumen: was nicht geht, bleibt in der Spur');
{
  const u = umgebung({ aufraeumen: true, gross: false, loeschFehler: '501' });
  await vm.runInContext('probelaufSelbsttest()', u.ctx);
  ok(vm.runInContext('_plSpur.policies.join()', u.ctx) === '501', 'Der nicht löschbare Eintrag bleibt in der Spur');
  ok(vm.runInContext('_plBerichtDaten.aufgeraeumt.fehler', u.ctx) === 1, 'Und der Bericht sagt es');
}

console.log('Beenden');
{
  const pl = lies('js/probelauf.js');
  ok(/onclick="probelaufAufraeumenUndBeenden\(\)"/.test(pl) && /Nur beenden/.test(pl), 'Beenden bietet „Aufräumen und beenden" an');
  ok(/if \(probelaufAnzahl\(\)\) \{ toast\(/.test(funktion(pl, 'probelaufAufraeumenUndBeenden')), 'Bleibt etwas übrig, bleibt der Probelauf offen');
  const ch = lies('js/konzepte.js');
  ok(/\(opts && opts\.grund\) \? String\(opts\.grund\)/.test(ch), 'Die Ablehnung nimmt die Begründung mit, statt zu fragen');
  const fg = lies('js/freigaben.js');
  ok(/async function markKonform\(policyId, konform, opts\)/.test(fg) && /async function markMitbestimmung\(policyId, konform, opts\)/.test(fg),
    '„Nicht konform" in Prüfung und Mitbestimmung ebenso');
}

console.log(`\n${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
