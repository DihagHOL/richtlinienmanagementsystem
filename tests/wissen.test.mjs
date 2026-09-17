/**
 * Wissen – die Bibliothek neben den Regelwerken.
 *
 * Freiwillig, für alle: Themen, Videos, Artikel, Links, Wissenstests. Nichts
 * hier ist Pflicht, nichts erinnert – und trotzdem zählt, was gelesen und
 * bestanden wurde: als Nachweis in der Bestätigungen-Liste, mit der Kennung
 * „wissen:<Beitrag>". Gepflegt wird im Reiter selbst, gespeichert in
 * wissen.json; die Auswertungen je Regelwerk sehen diese Einträge nicht.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Das Modell – rein, ohne Browser ── */
const M = require(path.join(ROOT, 'js/wissenmodell.js'));

ok(M.WI_ARTEN.map(a => a.key).join() === 'video,artikel,link,test', 'Vier Arten: Video, Artikel, Link, Wissenstest');
ok(M.wiAckId('b1') === 'wissen:b1' && M.wiIstWissenAck({ richtlinieId: 'wissen:b1' }) && !M.wiIstWissenAck({ richtlinieId: '7' }) && M.wiBeitragIdVon({ richtlinieId: 'wissen:b1' }) === 'b1',
  'Der Nachweis trägt die Kennung „wissen:…" – Auswertungen je Regelwerk sehen ihn nicht');
ok(M.wiSlug('Phishing & E-Mail') === 'phishing-e-mail' && M.wiSlug('Passwörter') === 'passwoerter', 'Ein Thema bekommt ein lesbares Kürzel');

const html = M.wiTextHtml('Erster Absatz mit **fett** und <b>Tags</b>.\n\n# Überschrift\n\n- eins\n- zwei\n\nZeile A\nZeile B');
ok(/<p>Erster Absatz mit <b>fett<\/b> und &lt;b&gt;Tags&lt;\/b&gt;\.<\/p>/.test(html), 'Artikel: Absatz, **fett** – HTML im Text bleibt Text');
ok(/<h4>Überschrift<\/h4>/.test(html) && /<ul><li>eins<\/li><li>zwei<\/li><\/ul>/.test(html) && /<p>Zeile A<br>Zeile B<\/p>/.test(html), '… Zwischenüberschrift, Aufzählung, Zeilenumbruch');
ok(M.wiTextHtml('# Kopf\n- a\n- b\nSatz') === '<h4>Kopf</h4><ul><li>a</li><li>b</li></ul><p>Satz</p>', 'Überschrift direkt über der Liste, Text direkt darunter – ohne Leerzeilen, wie man es schreibt');
ok(M.WI_STARTBESTAND.beitraege.filter(b => b.art === 'artikel').every(b => /<h4>/.test(M.wiTextHtml(b.text)) && /<li>/.test(M.wiTextHtml(b.text))),
  'Jeder Artikel des Startbestands hat Zwischenüberschriften und Aufzählungen');

const roh = { themen: [{ id: 'ph', titel: 'Phishing' }, { titel: '' }], beitraege: [
  { id: 'v1', art: 'video', thema: 'ph', titel: 'Clip', url: 'https://youtu.be/abc12345' },
  { id: 't1', art: 'test', thema: 'ph', titel: 'Test', fragen: [{ frage: 'F?', optionen: ['a', 'b'], richtig: 1 }], bestehen: 200 },
  { art: 'unsinn', titel: 'Ohne Kennung', geltung: [] },
] };
const d = M.wiNormalisieren(roh);
ok(d.themen.length === 1 && d.themen[0].symbol === '📚', 'Normalisieren: Themen ohne Titel fallen weg, Symbol bekommt einen Standard');
ok(d.beitraege.length === 3 && d.beitraege[2].id && d.beitraege[2].art === 'artikel' && d.beitraege[2].geltung.join() === 'ALLE' && d.beitraege[2].aktiv === true,
  'Beiträge ohne Kennung bekommen eine, unbekannte Art wird Artikel, leere Geltung heißt ALLE');
ok(d.beitraege[1].bestehen === 100 && d.beitraege[0].bestehen === M.WI_BESTEHEN && d.beitraege[1].stand === '1', 'Bestehensgrenze zwischen 1 und 100, Standard 80, Stand 1');

ok(M.wiBeitragFehler({ art: 'video', titel: 'x', url: 'nix' }).some(f => /Video-Adresse/.test(f)), 'Ein Video braucht eine Adresse');
ok(M.wiBeitragFehler({ art: 'video', titel: 'x', url: '<iframe src="https://dihag.sharepoint.com/_layouts/15/embed.aspx?x"></iframe>' }).length === 0, 'Der Einbetten-Code reicht');
ok(M.wiBeitragFehler({ art: 'artikel', titel: 'x', text: '' }).some(f => /Text/.test(f)), 'Ein Artikel braucht Text');
ok(M.wiBeitragFehler({ art: 'test', titel: 'x', fragen: [] }).some(f => /mindestens eine Frage/.test(f)), 'Ein Test braucht Fragen');
ok(M.wiBeitragFehler({ art: 'test', titel: 'x', fragen: [{ frage: 'F', optionen: ['a', ''], richtig: 5 }] }).length === 3, 'Leere Antwort, zu wenige Antworten, „richtig" außerhalb – jede Lücke wird genannt');
ok(M.wiBeitragFehler({ art: 'test', titel: 'x', fragen: [{ frage: 'F', optionen: ['a', 'b', 'c'], richtig: 2 }] }).length === 0, 'Eine vollständige Frage ist in Ordnung');

ok(M.wiSichtbar({ aktiv: true, geltung: ['SHB'] }, { geltungSichtbar: (g) => g.includes('SHB') }) && !M.wiSichtbar({ aktiv: false }) && !M.wiSichtbar({ aktiv: true, geltung: ['SHB'] }, { geltungSichtbar: () => false }),
  'Sichtbar heißt: aktiv und im Geltungsbereich');

const acks = [
  { richtlinieId: 'wissen:v1', version: '1', benutzerUpn: 'anna@dihag.com', gelesenAm: '2026-09-10T10:00:00Z', abgeschlossenAm: '2026-09-10T10:00:00Z' },
  { richtlinieId: 'wissen:t1', version: '1', benutzerUpn: 'anna@dihag.com', gelesenAm: '2026-09-11T10:00:00Z', quizBestanden: true, quizScore: 100, quizVersuche: 2, abgeschlossenAm: '2026-09-11T10:00:00Z' },
  { richtlinieId: 'wissen:t1', version: '1', benutzerUpn: 'ben@dihag.com', gelesenAm: '2026-07-01T10:00:00Z', quizBestanden: false, quizScore: 50, quizVersuche: 1 },
  { richtlinieId: 'wissen:t1', version: '2', benutzerUpn: 'anna@dihag.com', gelesenAm: '2026-09-12T10:00:00Z', quizBestanden: false, quizScore: 60, quizVersuche: 1 },
  { richtlinieId: '7', version: '1.0', benutzerUpn: 'anna@dihag.com', gelesenAm: '2026-09-01T10:00:00Z' },
];
const s1 = M.wiStand(d.beitraege[0], acks);
ok(s1.gesehen && s1.am === '2026-09-10T10:00:00Z' && !s1.bestanden, 'Der Stand eines Videos: angesehen, wann');
const s2 = M.wiStand(d.beitraege[1], acks.filter(a => a.benutzerUpn === 'anna@dihag.com'));
ok(s2.bestanden && s2.score === 100 && s2.versuche === 2, 'Der Stand eines Tests: bestanden, Ergebnis, Versuche – nur der eigene Stand des Tests (Stand 1)');
ok(!M.wiStand(Object.assign({}, d.beitraege[1], { stand: '2' }), acks.filter(a => a.benutzerUpn === 'anna@dihag.com')).bestanden,
  'Geänderte Fragen sind ein neuer Stand – der alte Nachweis zählt dafür nicht');

const z = M.wiKennzahlen(d, acks, { jetzt: '2026-09-16T12:00:00Z' });
ok(z.beitraege === 3 && z.videos === 1 && z.artikel === 1 && z.tests === 1 && z.themen === 1, 'Kennzahlen zählen die Beiträge nach Art');
ok(z.personen === 2 && z.nachweise === 4 && z.zuletzt === 3, 'Personen, Nachweise, davon in den letzten 30 Tagen – das Regelwerk „7" zählt nicht mit');
ok(z.testTeilnahmen === 3 && z.testBestanden === 1 && z.quote === 33, 'Testteilnahmen, bestanden, Quote');
const aw = M.wiAuswertung(d, acks);
ok(aw[1].gesehen === 2 && aw[1].teilnahmen === 3 && aw[1].bestanden === 1 && aw[1].schnitt === 70, 'Je Beitrag: Personen, Teilnahmen, bestanden, Durchschnitt');

const leer = M.wiNormalisieren({});
const n = M.wiStartbestandErgaenzen(leer, 'Anna', '2026-09-16T12:00:00Z');
ok(n === 12 && leer.themen.length === 6 && leer.beitraege.every(b => M.wiBeitragFehler(b).length === 0),
  'Der Startbestand: sechs Themen, zwölf Beiträge – und jeder besteht die eigene Prüfung');
ok(leer.beitraege.filter(b => b.art === 'test').every(b => b.fragen.length >= 3 && b.fragen.every(q => q.optionen.length === 3)), 'Jeder Test hat mindestens drei Fragen mit je drei Antworten');
ok(M.wiStartbestandErgaenzen(leer, 'Anna') === 0 && leer.beitraege.length === 12, 'Ein zweites Mal ergänzt nichts – nichts wird doppelt angelegt');
ok(leer.beitraege.every(b => b.erstelltVon === 'Anna' && b.erstelltAm === '2026-09-16T12:00:00Z'), 'Wer angelegt hat, steht dran');
ok(!/Videos? (stehen|steht) (drin|bereit)/.test(JSON.stringify(M.WI_STARTBESTAND)) && !M.WI_STARTBESTAND.beitraege.some(b => b.art === 'video'),
  'Keine erfundenen Videos – die dreht das Haus selbst oder wählt sie aus');

/* ── 2) Der Reiter – im Browser-Nachbau ── */
const felder = {};
const feld = (id) => (felder[id] = felder[id] || { id, value: '', innerHTML: '', textContent: '', disabled: false, focus() {}, scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [], appendChild(el) { this.innerHTML += el.innerHTML; }, remove() {} });
const gemeldet = [], gespeichert = [], acksGeschrieben = [];
let modal = '';
const ctx = {
  console, JSON, Date, Array, Object, String, Number, Math, Set, Map, Promise, RegExp, Error, encodeURIComponent, setTimeout,
  document: {
    getElementById: (id) => feld(id), querySelector: (s) => (s === '.modal-body' ? feld('modal-body') : null), querySelectorAll: () => [],
    createElement: () => ({ className: '', innerHTML: '', scrollIntoView() {}, click() {}, remove() {} }), body: { appendChild() {} },
  },
  window: { scrollTo() {} }, location: { origin: 'https://rms.dihag.de', pathname: '/' },
  navigator: { clipboard: { writeText: async () => {} } },
  URL: { createObjectURL: () => 'blob:x' }, Blob: function () {},
  esc: (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  toast: (t) => gemeldet.push(String(t)),
  uiConfirm: async () => true,
  openModal: (h) => { modal = h; }, closeModal: () => { modal = ''; }, reopenModalKeepScroll: (h) => { modal = h; },
  emptyState: (t) => `<div class="empty-state">${t}</div>`,
  canWriteTab: (v) => ctx.__schreiben, geltungSichtbar: (g) => !Array.isArray(g) || g.includes('ALLE') || g.includes('HOL'),
  State: { user: { upn: 'anna@dihag.com', name: 'Anna Muster' }, acks: [], loaded: true },
  spLoadWissen: async () => ({ daten: JSON.parse(JSON.stringify(ctx.__datei)), geaendertAm: 'm1' }),
  spSaveWissen: async (daten, erwartet) => { gespeichert.push({ daten: JSON.parse(JSON.stringify(daten)), erwartet }); ctx.__datei = JSON.parse(JSON.stringify(daten)); return { geaendertAm: 'm' + (gespeichert.length + 1) }; },
  spSaveAcknowledgement: async (a) => { acksGeschrieben.push(a); const i = ctx.State.acks.findIndex(x => x.richtlinieId === a.richtlinieId && x.version === a.version); const neu = Object.assign({ id: 'a' + acksGeschrieben.length }, a); if (i >= 0) ctx.State.acks[i] = neu; else ctx.State.acks.push(neu); },
  reloadAcks: async () => {},
  spGetAcknowledgements: async () => acks,
  videoEinbettung: (u) => (/youtu/.test(u) ? { art: 'einbetten', src: 'https://www.youtube-nocookie.com/embed/abc12345' } : /^https?:/.test(u) ? { art: 'link', src: u } : null),
  videoHerkunft: (u) => ({ extern: /youtu/.test(u), dienst: 'YouTube' }),
};
ctx.__schreiben = false;
ctx.__datei = { version: 1, themen: [{ id: 'ph', titel: 'Phishing & E-Mail', symbol: '🎣', kurz: 'Die häufigste Tür.' }], beitraege: [
  { id: 'v1', art: 'video', thema: 'ph', titel: 'Phishing in 3 Minuten', kurz: 'Ein Clip.', url: 'https://youtu.be/abc12345', quelle: 'BSI', dauer: 3 },
  { id: 'a1', art: 'artikel', thema: 'ph', titel: 'Fünf Merkmale', text: 'Text **fett**.', dauer: 2 },
  { id: 't1', art: 'test', thema: 'ph', titel: 'Wissenstest Phishing', fragen: [{ frage: 'F1?', optionen: ['a', 'b'], richtig: 1 }, { frage: 'F2?', optionen: ['c', 'd'], richtig: 0 }], bestehen: 80 },
  { id: 'x1', art: 'link', thema: '', titel: 'Nur SHB', url: 'https://www.bsi.bund.de/', geltung: ['SHB'] },
  { id: 'i1', art: 'artikel', thema: 'ph', titel: 'Noch nicht fertig', text: 'Entwurf', aktiv: false },
] };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/quiz.js'), ctx);        // die Engine: mischen, Fragen zeichnen, markieren
vm.runInContext(lies('js/wissenmodell.js'), ctx);
vm.runInContext(lies('js/wissen.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
const mount = feld('wissen-mount');

await run('initWissen()');
let h = mount.innerHTML;
ok(/Freiwillig, jederzeit, ohne Nachweispflicht/.test(h), 'Der Reiter sagt, was er ist: freiwillig');
ok(/🎣 Phishing &amp; E-Mail/.test(h) && /🎬 Video/.test(h) && /📄 Artikel/.test(h) && /❓ Wissenstest/.test(h), 'Themen und Arten als Filter');
ok(/Phishing in 3 Minuten/.test(h) && /Fünf Merkmale/.test(h) && /Wissenstest Phishing/.test(h), 'Die Beiträge stehen als Karten');
ok(!/Nur SHB/.test(h) && !/Noch nicht fertig/.test(h), 'Was nicht für dieses Werk gilt oder inaktiv ist, ist nicht zu sehen');
ok(!/Pflegen/.test(h) && !/\+ Beitrag/.test(h), 'Ohne Schreibrecht kein Pflegen');
ok(/○ noch nicht angesehen/.test(h) && /○ noch nicht gemacht/.test(h), 'Der eigene Stand: noch offen');
ok(/3 Beiträge/.test(h) && /2 Frage/.test(h) && /⏱ 3 min/.test(h), 'Zahl, Fragen, Dauer');

run("wiFilter('art','test')");
ok(/Wissenstest Phishing/.test(mount.innerHTML) && !/Fünf Merkmale/.test(mount.innerHTML), 'Der Filter nach Art greift');
run("wiFilter('art',''); wiSuche('merkmale')");
ok(/Fünf Merkmale/.test(felder['wi-liste'].innerHTML) && !/Phishing in 3 Minuten/.test(felder['wi-liste'].innerHTML), 'Die Suche findet im Titel');
run("wiSuche('')");

// Ein Video öffnen und ansehen
run("wiOeffnen('v1')");
h = mount.innerHTML;
ok(/<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/abc12345"/.test(h) && /Quelle: BSI/.test(h), 'Das Video wird eingebettet, die Quelle steht darunter');
ok(/wiGesehen\('v1'\)/.test(h) && /Ich habe das angesehen/.test(h) && /wiLinkKopieren\('v1'\)/.test(h), 'Darunter der freiwillige Knopf – und der Link');
await run("wiGesehen('v1')");
ok(acksGeschrieben.length === 1 && acksGeschrieben[0].richtlinieId === 'wissen:v1' && acksGeschrieben[0].version === '1' && acksGeschrieben[0].gelesenAm && acksGeschrieben[0].benutzerUpn === 'anna@dihag.com',
  'Angesehen wird als Nachweis „wissen:v1" in der Bestätigungen-Liste festgehalten');
ok(/✓ Angesehen am/.test(mount.innerHTML) && !/wiGesehen\('v1'\)/.test(mount.innerHTML), 'Danach steht das Datum, der Knopf ist weg');
ok(run("wiLink('v1')") === 'https://rms.dihag.de/?ansicht=wissen&beitrag=v1', 'Der Link führt auf den Beitrag');

// Ein Artikel
run("wiOeffnen('a1')");
ok(/<div class="wi-artikel"><p>Text <b>fett<\/b>\.<\/p><\/div>/.test(mount.innerHTML), 'Der Artikel wird aus dem Text gebaut');

// Der Wissenstest – ohne Regelwerk, ohne Vorbedingung
run("wiOeffnen('t1')");
ok(/wiTestStarten\('t1'\)/.test(mount.innerHTML) && /bestanden ab 80 %/.test(mount.innerHTML), 'Der Test lässt sich sofort starten – keine Kenntnisnahme nötig');
run("wiTestStarten('t1')");
ok(felder['wi-test'].innerHTML.includes('quiz-form') && run('_quiz.questions.length') === 2 && run('_quiz.policyId') === 'wissen:t1', 'Die Engine aus quiz.js zeichnet die Fragen – gemischt');
run('_quiz.answers = { 0: _quiz.questions[0].richtig, 1: _quiz.questions[1].richtig };');
await run("wiTestAuswerten('t1')");
const t = acksGeschrieben[acksGeschrieben.length - 1];
ok(t.richtlinieId === 'wissen:t1' && t.quizBestanden === true && t.quizScore === 100 && t.quizVersuche === 1 && t.abgeschlossenAm,
  'Bestanden: Nachweis mit Ergebnis, Versuch und Abschluss');
ok(/100%/.test(felder['wi-test'].innerHTML) && /bestanden ✓/.test(felder['wi-test'].innerHTML), 'Und die Auswertung steht da');
run("wiTestStarten('t1'); _quiz.answers = { 0: (_quiz.questions[0].richtig + 1) % 2, 1: (_quiz.questions[1].richtig + 1) % 2 };");
await run("wiTestAuswerten('t1')");
const t2 = acksGeschrieben[acksGeschrieben.length - 1];
ok(t2.quizBestanden === true && t2.quizScore === 100 && t2.quizVersuche === 2, 'Ein schlechterer zweiter Versuch nimmt weder Bestanden noch das beste Ergebnis – zählt aber als Versuch');
run('wiSchliessen()');
ok(/✓ bestanden · 100 %/.test(mount.innerHTML) && /✓ angesehen/.test(mount.innerHTML), 'Zurück in der Bibliothek: die Karten zeigen den Stand');

/* ── 3) Pflegen ── */
ctx.__schreiben = true;
run('renderWissen()');
ok(/✎ Pflegen/.test(mount.innerHTML), 'Mit Schreibrecht: der Pflege-Knopf');
run('wiPflegeUmschalten()');
h = mount.innerHTML;
ok(/\+ Beitrag/.test(h) && /\+ Thema/.test(h) && /📊 Auswertung/.test(h) && /📋 Startbestand/.test(h), 'Im Pflege-Modus: anlegen, auswerten, Startbestand');
ok(/Noch nicht fertig/.test(h) && /inaktiv/.test(h) && /Nur SHB/.test(h), 'Pflegende sehen alles – auch Inaktives und fremde Werke, gekennzeichnet');
ok(/wiBeitragVerschieben\('a1',-1\)/.test(h) && /wiBeitragDialog\('a1'\)/.test(h) && /wiThemaDialog\('ph'\)/.test(h), 'Sortieren und Bearbeiten an jeder Karte, am Thema');

// Beitrag anlegen: erst unvollständig, dann vollständig
run("wiBeitragDialog('', 'ph')");
ok(/Neuer Beitrag/.test(modal) && /<option value="ph" selected>/.test(modal) && /wi-b-url/.test(modal), 'Der Dialog: Art Video, Thema vorbelegt, Adresse');
run("wiEditSet('titel', 'Neues Video'); wiEditSet('url', 'https://youtu.be/neu12345')");
gemeldet.length = 0;
await run('wiBeitragSpeichern()');
ok(gemeldet.some(x => /Fremdes Material braucht eine Quellenangabe/.test(x)) && gespeichert.length === 0, 'Fremdes Material ohne Quelle wird nicht gespeichert');
run("wiEditSet('quelle', 'BSI'); wiEditSet('dauer', 4)");
await run('wiBeitragSpeichern()');
ok(gespeichert.length === 1 && gespeichert[0].erwartet === 'm1' && gespeichert[0].daten.beitraege.some(b => b.titel === 'Neues Video' && b.thema === 'ph' && b.erstelltVon === 'Anna Muster'),
  'Gespeichert – auf dem gelesenen Stand, mit Urheber');
ok(run('_wi.geaendertAm') === 'm2', 'Der neue Stand ist gemerkt');

// Ein Test bearbeiten: geänderte Fragen = neuer Stand
run("wiBeitragDialog('t1')");
ok(/Beitrag bearbeiten/.test(modal) && /Frage 1/.test(modal) && /Frage 2/.test(modal) && /wiFrageAdd\(\)/.test(modal), 'Der Fragen-Editor');
run('wiFrageAdd(); _wiEdit.fragen[2].frage = "F3?"; _wiEdit.fragen[2].optionen = ["x", "y", "z"]; _wiEdit.fragen[2].richtig = 2;');
await run('wiBeitragSpeichern()');
const t1neu = run("wiBeitrag(_wi.daten, 't1')");
ok(t1neu.fragen.length === 3 && t1neu.stand === '2', 'Geänderte Fragen: der Test ist Stand 2');
run('wiSchliessen()');
ok(/○ noch nicht gemacht/.test(mount.innerHTML.split('Wissenstest Phishing')[1].slice(0, 400)), 'Und das alte „bestanden" gilt dafür nicht mehr');
run("wiBeitragDialog('t1')");
run('_wiEdit.fragen[0].optionen[1] = "";');
gemeldet.length = 0;
await run('wiBeitragSpeichern()');
ok(gemeldet.some(x => /leere Antwort|mindestens zwei Antworten/.test(x)) && /Noch offen:/.test(modal) && /leere Antwort/.test(modal), 'Eine leere Antwort hält das Speichern auf – der Dialog nennt, was fehlt');
run('closeModal()');

// Thema anlegen, verschieben, löschen
run("wiThemaDialog('')");
feld('wi-t-titel').value = 'Datenschutz'; feld('wi-t-symbol').value = '🛡️'; feld('wi-t-kurz').value = 'Was personenbezogen ist.';
await run('wiThemaSpeichern()');
ok(run("wiThema(_wi.daten, 'datenschutz') !== null") && run('_wi.daten.themen.length') === 2, 'Ein neues Thema mit lesbarer Kennung');
await run("wiThemaVerschieben('datenschutz', -1)");
ok(run('_wi.daten.themen[0].id') === 'datenschutz', 'Verschoben');
await run("wiThemaLoeschen('ph')");
ok(run('_wi.daten.themen.length') === 1 && run("wiBeitrag(_wi.daten, 'a1').thema") === '', 'Thema gelöscht – seine Beiträge bleiben, unter „Weitere"');
ok(/📚 Weitere/.test(mount.innerHTML), 'Und so heißt die Gruppe dann');

// Geltung
run("wiBeitragDialog('x1')");
ok(/value="checkbox" checked/.test(modal) === false && /> SHB<\/label>/.test(modal), 'Der Geltungsbereich als Haken je Werk');
run("wiEditGeltung('HOL', true)");
ok(run('_wiEdit.geltung.join()') === 'SHB,HOL', 'Ein Werk dazu');
run("wiEditGeltung('ALLE', true)");
ok(run('_wiEdit.geltung.join()') === 'ALLE', '„Alle" ersetzt die Einzelwerke');
run('closeModal()');

// Startbestand, Auswertung
gespeichert.length = 0;
await run('wiStartbestand()');
// „Datenschutz" gibt es schon (gleiche Kennung) – das Thema bleibt, wie es ist; nur fünf Themen kommen dazu.
ok(run('_wi.daten.beitraege.length') === 6 + 12 && run('_wi.daten.themen.length') === 1 + 5 && run("wiThema(_wi.daten, 'datenschutz').kurz") === 'Was personenbezogen ist.' && gespeichert.length === 1, 'Der Startbestand kommt dazu – ohne Vorhandenes zu berühren');
await run('wiAuswertungOeffnen()');
const aus = felder['modal-body'].innerHTML;
ok(/Beitrag<\/th>/.test(aus) && /Phishing in 3 Minuten/.test(aus) && /Person/.test(aus), 'Die Auswertung je Beitrag – Personen, nicht Klicks');

// Gleichzeitig gepflegt: der alte Stand wird abgewiesen
ctx.spSaveWissen = async () => { throw new Error('Die Bibliothek wurde zwischenzeitlich geändert.'); };
gemeldet.length = 0;
await run("wiBeitragDialog('a1'); wiEditSet('titel', 'Umbenannt'); wiBeitragSpeichern()");
ok(gemeldet.some(x => /zwischenzeitlich geändert/.test(x)), 'Wer auf einem alten Stand speichert, erfährt es – und bekommt die Datei neu');

/* ── 4) Angeschlossen ── */
const idx = lies('index.html'), app = lies('js/app.js'), acc = lies('js/access.js'), mod = lies('js/module.js');
ok(/data-view="wissen" id="nav-wissen"/.test(idx) && idx.indexOf('data-view="wissen"') < idx.indexOf('data-view="anleitung"') && /id="view-wissen"/.test(idx),
  'Der Reiter steht direkt unter „Meine Regelwerke" – neben den Richtlinien');
ok(/if \(view === 'wissen'\) return true;/.test(acc) && /view: 'wissen'/.test(acc) && /show\('nav-wissen',\s+canReadTab\('wissen'\)\)/.test(acc),
  'Lesen dürfen alle; Pflegen vergibt die Reiter-Berechtigung („S")');
ok(/wissen:\s*\['wissenmodell', 'wissen'\]/.test(mod) && /'wissenmodell', 'clevelreport'/.test(mod), 'Der Reiter lädt nur Modell und Ansicht; das Modell steht im Verwaltungsblock für Cockpit und Report');
ok(/if \(view === 'wissen'\s+&& typeof initWissen === 'function'\)\s+initWissen\(\);/.test(app) && /ansicht === 'wissen'/.test(app) && /wissen: 'Wissen – Themen, Videos, Awareness'/.test(app),
  'Ansicht, Titel und Link ?ansicht=wissen&beitrag=… sind angeschlossen');
ok(/async function spLoadWissen/.test(lies('js/sharepoint.js')) && /zwischenzeitlich geändert/.test(lies('js/sharepoint.js')), 'wissen.json wird gelesen und mit Änderungsstempel geschrieben');
ok(/_ckLoadWissen/.test(lies('js/cockpit.js')) && /'Wissen & Awareness'/.test(lies('js/cockpit.js')), 'Das Cockpit hat eine Kachel');
ok(/ISO A\.6\.3/.test(lies('js/clevelreport.js')) && /m\.wissen = wiKennzahlen/.test(lies('js/clevelreport.js')), 'Der Audit Report hat eine Zeile (A.6.3)');
ok(/sec\('wissen', 'Wissen – die Bibliothek'/.test(lies('js/dokumentation.js')) && /Für die Pflege/.test(lies('js/dokumentation.js')), 'Die Dokumentation erklärt Lesen und Pflegen');
ok(/\.wi-karte\b/.test(lies('css/style.css')) && /\.wi-chip\.aktiv/.test(lies('css/style.css')) && /\.wi-artikel/.test(lies('css/style.css')), 'Stil für Karten, Filter und Artikel');
ok(!/nav-wissen/.test(lies('js/probelauf.js')), 'Im Probelauf bleibt der Reiter sichtbar – ihn sieht ohnehin jede:r');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
