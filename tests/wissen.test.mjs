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
import { createRequire as _requireFuerHelfer } from 'module';
const { jsArg } = _requireFuerHelfer(import.meta.url)('../js/util.js');   // echter Helfer für Inline-Handler
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Das Modell – rein, ohne Browser ── */
const M = require(path.join(ROOT, 'js/wissenmodell.js'));

ok(M.WI_ARTEN.map(a => a.key).join() === 'kurs,video,artikel,link,test', 'Fünf Arten: Schulung, Video, Artikel, Link, Wissenstest');
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
ok(n === 19 && leer.themen.length === 9 && leer.beitraege.every(b => M.wiBeitragFehler(b).length === 0),
  'Der Startbestand: neun Themen, neunzehn Beiträge (drei Schulungen, Artikel und Tests) – und jeder besteht die eigene Prüfung');
ok(new Set(leer.themen.map(t => t.bereich)).size === 5 && leer.themen.some(t => t.bereich === 'Compliance & Verhalten') && leer.themen.some(t => t.bereich === 'Arbeitssicherheit') && leer.themen.some(t => t.bereich === 'Qualität & Umwelt'),
  'Fünf Bereiche – Informationssicherheit, Datenschutz, Compliance & Verhalten, Arbeitssicherheit, Qualität & Umwelt: nicht nur IT');
ok(leer.beitraege.filter(b => b.art === 'test').every(b => b.fragen.length >= 3 && b.fragen.every(q => q.optionen.length === 3)), 'Jeder Test hat mindestens drei Fragen mit je drei Antworten');
ok(M.wiStartbestandErgaenzen(leer, 'Anna') === 0 && leer.beitraege.length === 19, 'Ein zweites Mal ergänzt nichts – nichts wird doppelt angelegt');
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
  localStorage: { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } },
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
  rmsAssetUrl: (d) => 'https://rms.dihag.de/assets/' + d,
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
ctx.jsArg ??= jsArg; vm.createContext(ctx);
vm.runInContext(lies('js/quiz.js'), ctx);        // die Engine: mischen, Fragen zeichnen, markieren
vm.runInContext(lies('js/wissenmodell.js'), ctx);
vm.runInContext(lies('js/wissen.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
const mount = feld('wissen-mount');

await run('initWissen()');
let h = mount.innerHTML;
ok(/Freiwillig, jederzeit, ohne Nachweispflicht/.test(h), 'Der Reiter sagt, was er ist: freiwillig');
ok(/🎣 Phishing &amp; E-Mail/.test(h) && /🎬 Video/.test(h) && /📄 Artikel/.test(h) && /❓ Wissenstest/.test(h), 'Themen und Arten als Filter');
ok(!/Alle Themen/.test(h) && !/>Alles</.test(h) && !/wi-chip-x/.test(h), 'Kein „Alle Themen"-Chip, kein „Alles" – und ohne Filter kein ✕');
ok(/Phishing in 3 Minuten/.test(h) && /Fünf Merkmale/.test(h) && /Wissenstest Phishing/.test(h), 'Die Beiträge stehen als Karten');
ok(!/Nur SHB/.test(h) && !/Noch nicht fertig/.test(h), 'Was nicht für dieses Werk gilt oder inaktiv ist, ist nicht zu sehen');
ok(!/Pflegen/.test(h) && !/\+ Beitrag/.test(h), 'Ohne Schreibrecht kein Pflegen');
ok(/○ noch nicht angesehen/.test(h) && /○ noch nicht gemacht/.test(h), 'Der eigene Stand: noch offen');
ok(/3 Beiträge/.test(h) && /2 Frage/.test(h) && /⏱ 3 min/.test(h), 'Zahl, Fragen, Dauer');

run("wiFilter('art','test')");
ok(/Wissenstest Phishing/.test(mount.innerHTML) && !/Fünf Merkmale/.test(mount.innerHTML), 'Der Filter nach Art greift');
ok(/wi-chip aktiv" onclick="wiFilter\('art',&quot;&quot;\)"/.test(mount.innerHTML) && /wi-chip-x/.test(mount.innerHTML), 'Der aktive Chip nimmt sich per Klick zurück, daneben steht ✕');
run("wiFilter('art',''); wiSuche('merkmale')");
ok(/Fünf Merkmale/.test(felder['wi-liste'].innerHTML) && !/Phishing in 3 Minuten/.test(felder['wi-liste'].innerHTML), 'Die Suche findet im Titel');
run("wiSuche('')");

// Ein Video öffnen und ansehen
run("wiOeffnen('v1')");
h = mount.innerHTML;
ok(/<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/abc12345"/.test(h) && /Quelle: BSI/.test(h), 'Das Video wird eingebettet, die Quelle steht darunter');
ok(/wiGesehen\(&quot;v1&quot;\)/.test(h) && /Ich habe das angesehen/.test(h) && /wiLinkKopieren\(&quot;v1&quot;\)/.test(h), 'Darunter der freiwillige Knopf – und der Link');
await run("wiGesehen('v1')");
ok(acksGeschrieben.length === 1 && acksGeschrieben[0].richtlinieId === 'wissen:v1' && acksGeschrieben[0].version === '1' && acksGeschrieben[0].gelesenAm && acksGeschrieben[0].benutzerUpn === 'anna@dihag.com',
  'Angesehen wird als Nachweis „wissen:v1" in der Bestätigungen-Liste festgehalten');
ok(/✓ Angesehen am/.test(mount.innerHTML) && !/wiGesehen\(&quot;v1&quot;\)/.test(mount.innerHTML), 'Danach steht das Datum, der Knopf ist weg');
ok(run("wiLink('v1')") === 'https://rms.dihag.de/?ansicht=wissen&beitrag=v1', 'Der Link führt auf den Beitrag');

// Ein Artikel
run("wiOeffnen('a1')");
ok(/<div class="wi-artikel"><p>Text <b>fett<\/b>\.<\/p><\/div>/.test(mount.innerHTML), 'Der Artikel wird aus dem Text gebaut');

// Der Wissenstest – ohne Regelwerk, ohne Vorbedingung
run("wiOeffnen('t1')");
ok(/wiTestStarten\(&quot;t1&quot;\)/.test(mount.innerHTML) && /bestanden ab 80 %/.test(mount.innerHTML), 'Der Test lässt sich sofort starten – keine Kenntnisnahme nötig');
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
ok(/wiBeitragVerschieben\(&quot;a1&quot;,-1\)/.test(h) && /wiBeitragDialog\(&quot;a1&quot;\)/.test(h) && /wiThemaDialog\(&quot;ph&quot;\)/.test(h), 'Sortieren und Bearbeiten an jeder Karte, am Thema');

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
run('wiStartbestand()');
ok(/Startbestand ergänzen/.test(modal) && (modal.match(/wiStartbestandWahl\(/g) || []).length === 19 && !/type="checkbox" checked/.test(modal),
  'Der Startbestand als Auswahl: alles, was fehlt, nichts vorab angekreuzt');
gemeldet.length = 0;
await run('wiStartbestandAnlegen()');
ok(gespeichert.length === 0 && gemeldet.some(x => /mindestens einen/.test(x)), 'Ohne Kreuz wird nichts angelegt');
run('wiStartbestandFehlend(_wi.daten).forEach(b => wiStartbestandWahl(b.id, true))');
await run('wiStartbestandAnlegen()');
// „Datenschutz" gibt es schon (gleiche Kennung) – das Thema bleibt, wie es ist; nur fünf Themen kommen dazu.
ok(run('_wi.daten.beitraege.length') === 6 + 19 && run('_wi.daten.themen.length') === 1 + 8 && run("wiThema(_wi.daten, 'datenschutz').kurz") === 'Was personenbezogen ist.' && gespeichert.length === 1, 'Der Startbestand kommt dazu – ohne Vorhandenes zu berühren');
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
ok(/wissen:\s*\['wissenmodell', 'wissen'\]/.test(mod) && /'wissenmodell',[^\]]*'clevelreport'\]/.test(mod),'Der Reiter lädt nur Modell und Ansicht; das Modell steht im Verwaltungsblock für Cockpit und Report');
ok(/if \(view === 'wissen'\s+&& typeof initWissen === 'function'\)\s+initWissen\(\);/.test(app) && /ansicht === 'wissen'/.test(app) && /wissen: 'Wissen – Themen, Videos, Awareness'/.test(app),
  'Ansicht, Titel und Link ?ansicht=wissen&beitrag=… sind angeschlossen');
ok(/async function spLoadWissen/.test(lies('js/sharepoint.js')) && /zwischenzeitlich geändert/.test(lies('js/sharepoint.js')), 'wissen.json wird gelesen und mit Änderungsstempel geschrieben');
ok(/_ckLoadWissen/.test(lies('js/cockpit.js')) && /'Wissen & Awareness'/.test(lies('js/cockpit.js')), 'Das Cockpit hat eine Kachel');
ok(/ISO A\.6\.3/.test(lies('js/clevelreport.js')) && /m\.wissen = wiKennzahlen/.test(lies('js/clevelreport.js')), 'Der Audit Report hat eine Zeile (A.6.3)');
ok(/sec\('wissen', 'Wissen – die Bibliothek'/.test(lies('js/dokumentation.js')) && /Für die Pflege/.test(lies('js/dokumentation.js')), 'Die Dokumentation erklärt Lesen und Pflegen');
ok(/\.wi-karte\b/.test(lies('css/style.css')) && /\.wi-chip\.aktiv/.test(lies('css/style.css')) && /\.wi-artikel/.test(lies('css/style.css')), 'Stil für Karten, Filter und Artikel');
ok(/PROBELAUF_NAV_BLEIBT = \[[^\]]*'wissen'/.test(lies('js/probelauf.js')), 'Im Probelauf bleibt der Reiter sichtbar – ihn sieht ohnehin jede:r');

/* ── 5) Schulungen: das Modell ── */
const K = M.wiNormalisieren({ beitraege: [M.WI_KURS_PHISHING] }).beitraege[0];
ok(K.art === 'kurs' && K.module.length === 5 && K.fragen.length === 5 && K.pflicht === true && K.wiederholung === 12 && K.ziele.length === 5 && K.dauer === 20,
  'Die Schulung „Phishing erkennen": fünf Module, fünf Fragen, Pflicht, jährlich, fünf Lernziele, 20 Minuten');
ok(M.wiBeitragFehler(K).length === 0, 'Und sie besteht die eigene Prüfung');
ok(M.wiBeitragFehler({ art: 'kurs', titel: 'x', module: [] }).some(f => /mindestens ein Modul/.test(f)) && M.wiBeitragFehler({ art: 'kurs', titel: 'x', module: [{ titel: '', text: 'a' }] }).some(f => /Modul 1 hat keinen Titel/.test(f)),
  'Eine Schulung braucht Module mit Titel und Inhalt');
ok(M.wiBeitragFehler({ art: 'kurs', titel: 'x', module: [{ titel: 'a', text: 'b' }], fragen: [{ frage: 'F', optionen: ['a', ''], richtig: 0 }] }).some(f => /leere Antwort/.test(f)),
  'Hat sie einen Test, wird der mitgeprüft');
ok(K.module.map(m => m.titel).join('|') === 'Was ist Phishing?|Arten von Phishing|Eine gefälschte E-Mail lesen|Die 7 wichtigsten Warnsignale|Richtig reagieren', 'Die Module in der Reihenfolge der Vorlage');
ok(K.fragen[0].optionen[K.fragen[0].richtig] === 'Gezielter Angriff auf eine bestimmte Person oder Abteilung' && K.fragen[4].optionen[K.fragen[4].richtig] === 'E-Mail ignorieren, IT-Security informieren und den Link nicht klicken',
  'Die richtigen Antworten sind die der Vorlage');
ok(/Spear-Phishing/.test(K.module[1].text) && /Smishing/.test(K.module[1].text), 'Das Modul „Arten" erklärt, wonach der Test fragt');
ok(/ticket@dihag\.com/.test(K.module[4].text) && /\[Telefonnummer IT-Security]/.test(K.module[4].text), 'Die Kontaktwege des Hauses stehen im Modul „Richtig reagieren"');

const m3 = M.wiTextHtml(K.module[2].text);
ok(/<div class="wi-mail"><div class="wi-mail-kopf"><div><span>Von:<\/span> IT-Support &lt;support@diihag\.com&gt;<\/div>/.test(m3), 'Die nachgebaute Mail: Kopfzeilen, entschärft');
ok(/<div class="wi-mail-warn">⚠ Absender nicht verifiziert/.test(m3) && /<span class="wi-mail-knopf">→ Jetzt Konto bestätigen<\/span>/.test(m3), '… Warnbanner und ein Knopf, der nirgends hinführt');
ok((m3.match(/<div class="wi-signal">/g) || []).length === 5 && /<b>Falsche Absender-Domain<\/b><span>„diihag\.com&quot; statt „dihag\.com&quot;/.test(m3), 'Fünf Signale als Karten mit Titel');
const m1 = M.wiTextHtml(K.module[0].text);
ok(/<ol class="wi-schritte"><li><div><b>Täuschende E-Mail wird versendet\.<\/b>/.test(m1) && (m1.match(/<li>/g) || []).length === 4 && /<div class="wi-box info">/.test(m1), 'Vier nummerierte Schritte und ein Hinweis-Kasten');
const m5 = M.wiTextHtml(K.module[4].text);
ok(/<div class="wi-box warn">🚨 Ruhig bleiben/.test(m5) && /<div class="wi-box ok">Gut zu wissen/.test(m5) && /<ol class="wi-schritte">/.test(m5), 'Warn- und Erfolgskasten, Schritte');
ok(M.wiTextHtml('> a\n> b\n\n>! c') === '<div class="wi-box info">a<br>b</div><div class="wi-box warn">c</div>', 'Kästen: Zeilen derselben Art werden eins, ein anderer Kasten trennt');
ok(M.wiTextHtml(':::mail\nVon: x\nHinweis: h\n---\nText <b>\n:::\nDanach') === '<div class="wi-mail"><div class="wi-mail-kopf"><div><span>Von:</span> x</div><div class="wi-mail-warn">h</div></div><div class="wi-mail-text">Text &lt;b&gt;</div></div><p>Danach</p>',
  'Die Mail endet mit :::, danach geht der Text normal weiter');
ok(M.wiMonateSpaeter('2026-01-31T10:00:00.000Z', 12) === '2027-01-31T10:00:00.000Z' && M.wiMonateSpaeter('', 12) === '' && M.wiMonateSpaeter('2026-01-01T00:00:00.000Z', 0) === '', 'Monate später – oder nichts');

const jetzt = '2026-09-18T12:00:00Z';
const alt = { richtlinieId: 'wissen:start-phishing-kurs', version: '1', benutzerUpn: 'anna@dihag.com', gelesenAm: '2025-06-01T09:00:00Z', quizBestanden: true, quizScore: 100, quizVersuche: 1, abgeschlossenAm: '2025-06-01T10:00:00Z' };
const frisch = Object.assign({}, alt, { benutzerUpn: 'ben@dihag.com', abgeschlossenAm: '2026-06-01T10:00:00Z' });
const begonnen = { richtlinieId: 'wissen:start-phishing-kurs', version: '1', benutzerUpn: 'cid@dihag.com', gelesenAm: '2026-09-10T10:00:00Z' };
const sAlt = M.wiStand(K, [alt], jetzt), sFrisch = M.wiStand(K, [frisch], jetzt);
ok(sAlt.erledigt && sAlt.abgelaufen && !sAlt.gueltig && sAlt.faelligAm.startsWith('2026-06-01'), 'Ein Abschluss von vor 15 Monaten ist bei jährlicher Wiederholung abgelaufen – fällig seit Juni');
ok(sFrisch.erledigt && sFrisch.gueltig && !sFrisch.abgelaufen && sFrisch.faelligAm.startsWith('2027-06-01'), 'Ein Abschluss von vor drei Monaten gilt bis nächsten Juni');
ok(M.wiKursStatus(K, [alt], jetzt).key === 'faellig' && M.wiKursStatus(K, [frisch], jetzt).key === 'erledigt' && M.wiKursStatus(K, [begonnen], jetzt).key === 'laeuft' && M.wiKursStatus(K, [], jetzt).key === 'offen' && /Pflicht, noch offen/.test(M.wiKursStatus(K, [], jetzt).text),
  'Vier Zustände: offen, begonnen, abgeschlossen, Auffrischung fällig');
ok(!M.wiStand(Object.assign({}, K, { fragen: [] }), [{ richtlinieId: 'wissen:start-phishing-kurs', version: '1', abgeschlossenAm: '2026-09-01T10:00:00Z', quizBestanden: false }], jetzt).erledigt === false,
  'Ohne Test zählt der Abschluss allein');
const q = M.wiPflichtQuote({ beitraege: [K] }, [alt, frisch, begonnen], [{ upn: 'anna@dihag.com' }, { upn: 'ben@dihag.com' }, { upn: 'cid@dihag.com' }, { upn: 'dora@dihag.com' }], jetzt)[0];
ok(q.soll === 4 && q.ist === 1 && q.quote === 25 && q.gueltig === 1, 'Die Pflicht-Quote: von vier Personen hat eine einen gültigen Abschluss – Annas ist abgelaufen, Cid hat nur begonnen');
ok(M.wiPflichtQuote({ beitraege: [K] }, [frisch], [], jetzt)[0].quote === null, 'Ohne Personenliste keine Quote, nur die Zahl');
const zk = M.wiKennzahlen({ beitraege: [K] }, [alt, frisch], { jetzt });
ok(zk.kurse === 1 && zk.pflichtKurse === 1 && zk.kursAbschluesse === 1, 'Kennzahlen: Schulungen, Pflichtschulungen, gültige Abschlüsse');

/* ── 6) Schulungen: der Reiter ── */
run(`_wi.daten.beitraege.push(wiNormalisieren({ beitraege: [WI_KURS_PHISHING] }).beitraege[0]); _wiPflege = false; __schreiben = false; State.acks = [];`);
ctx.__schreiben = false;
run('renderWissen()');
h = mount.innerHTML;
ok(/class="wi-pflicht"/.test(h) && /Pflichtschulung:<\/b> Phishing erkennen/.test(h) && /wiKursStarten\(&quot;start-phishing-kurs&quot;\)/.test(h) && />Starten</.test(h),
  'Eine offene Pflichtschulung steht oben im Reiter – mit Knopf');
ok(/🎓 Schulung/.test(h) && /📋 Pflicht/.test(h) && /5 Module · Wissenstest/.test(h) && /○ Pflicht, noch offen/.test(h), 'Die Karte: Schulung, Pflicht, Module, Stand');

run("wiOeffnen('start-phishing-kurs')");
h = mount.innerHTML;
ok(/Warum dieser Kurs\?/.test(h) && /<b>91 % aller Cyberangriffe/.test(h), 'Die Übersicht beginnt mit „Warum dieser Kurs?"');
ok(/Ca\. 20 Minuten · 5 Module · 1 Wissenstest/.test(h) && /Alle Mitarbeitenden: kein Vorwissen erforderlich/.test(h) && /Pflichttraining/.test(h) && /Jährliche Auffrischung/.test(h), 'Dauer, Zielgruppe, Pflicht, Wiederholung als Kacheln');
ok((h.match(/<ul class="wi-ziele">[\s\S]*?<\/ul>/)[0].match(/<li>/g) || []).length === 5, 'Fünf Lernziele mit Haken');
ok(/<span class="wi-modul-nr">01<\/span><span>Was ist Phishing\?<\/span>/.test(h) && /Wissenstest · 5 Fragen, bestanden ab 80 %/.test(h), 'Die Module als Liste, der Test am Ende');
ok(/Schulung starten →/.test(h), 'Und der Knopf');

acksGeschrieben.length = 0;
await run("wiKursStarten('start-phishing-kurs')");
ok(acksGeschrieben.length === 1 && acksGeschrieben[0].richtlinieId === 'wissen:start-phishing-kurs' && acksGeschrieben[0].gelesenAm && !acksGeschrieben[0].abgeschlossenAm,
  'Starten hält „begonnen" fest – einmal, still');
h = mount.innerHTML;
ok(/Modul 01 von 05/.test(h) && /<h2[^>]*>Was ist Phishing\?<\/h2>/.test(h) && /<ol class="wi-schritte">/.test(h) && /wiKursWeiter\(&quot;start-phishing-kurs&quot;, 1\)/.test(h), 'Das erste Modul – mit Schritten und „Weiter"');
acksGeschrieben.length = 0;
run("wiKursWeiter('start-phishing-kurs', 1)");
await new Promise(r => setTimeout(r, 10));
ok(/Modul 02 von 05/.test(mount.innerHTML) && run("_wiFortschritt(wiBeitrag(_wi.daten, 'start-phishing-kurs')).join()") === 'm1', '„Weiter" merkt sich das gelesene Modul und zeigt das nächste');
ok(acksGeschrieben.length === 1 && acksGeschrieben[0].fortschritt === '{"s":"1","m":["m1"]}' && !acksGeschrieben[0].abgeschlossenAm,
  'Der Fortschritt steht im Nachweis in SharePoint (Spalte „Fortschritt"), nicht im Browser');
run("wiKursWeiter('start-phishing-kurs', 2)"); await new Promise(r => setTimeout(r, 10));
run("wiKursWeiter('start-phishing-kurs', 3)"); await new Promise(r => setTimeout(r, 10));
h = mount.innerHTML;
ok(/Modul 04 von 05/.test(h) && /⚠ <b>Absender-Domain<\/b>/.test(h), 'Modul 4: die Checkliste');
run("wiKursWeiter('start-phishing-kurs', 4)"); await new Promise(r => setTimeout(r, 10));
ok(/Zum Wissenstest →/.test(mount.innerHTML), 'Das letzte Modul führt zum Test');
run("wiKursWeiter('start-phishing-kurs', 5)"); await new Promise(r => setTimeout(r, 10));
h = mount.innerHTML;
ok(/Wissenstest: Phishing erkennen/.test(h) && /wiTestStarten\(&quot;start-phishing-kurs&quot;\)/.test(h) && run("_wiFortschritt(wiBeitrag(_wi.daten, 'start-phishing-kurs')).length") === 5, 'Alle fünf gelesen – jetzt der Test');
run("wiKursZu('start-phishing-kurs', 0)");
ok((mount.innerHTML.match(/wi-modul-stand">✓/g) || []).length === 5 && /Fortsetzen →|Noch einmal durchgehen →|Schulung starten →/.test(mount.innerHTML), 'Die Übersicht hakt alle Module ab');
run("wiKursZu('start-phishing-kurs', 6); wiTestStarten('start-phishing-kurs');");
ok(run('_quiz.questions.length') === 5 && run('_quiz.policyId') === 'wissen:start-phishing-kurs', 'Der Test der Schulung läuft über dieselbe Engine');
run('_quiz.answers = Object.fromEntries(_quiz.questions.map((q, i) => [i, q.richtig]));');
acksGeschrieben.length = 0;
await run("wiTestAuswerten('start-phishing-kurs')");
const kAck = acksGeschrieben[acksGeschrieben.length - 1];
ok(kAck.quizBestanden === true && kAck.quizScore === 100 && kAck.abgeschlossenAm && /Schulung abgeschlossen, gültig bis/.test(felder['wi-test'].innerHTML) && /wiKursZu\(&quot;start-phishing-kurs&quot;, 0\)/.test(felder['wi-test'].innerHTML),
  'Bestanden: die Schulung ist abgeschlossen, mit Ablaufdatum, und der Weg zurück zur Übersicht steht da');
ok(/wiZertifikat\(&quot;start-phishing-kurs&quot;\)/.test(felder['wi-test'].innerHTML), 'Und die Bescheinigung ist einen Klick entfernt');
let fenster = '';
ctx.window.open = () => ({ document: { open() {}, write(h2) { fenster += h2; }, close() {} } });
run("wiZertifikat('start-phishing-kurs')");
ok(/<title>Teilnahmebescheinigung: Phishing erkennen/.test(fenster) && /Anna Muster/.test(fenster) && /Wissenstest bestanden mit <b>100 %<\/b>/.test(fenster) && /Gültig bis/.test(fenster) && /RMS-W-/.test(fenster) && /Pflichtschulung · alle 12 Monate/.test(fenster),
  'Die Bescheinigung: Name, Schulung, Ergebnis, Gültigkeit, Nummer – eine Seite zum Drucken oder als PDF');
ok((fenster.match(/<li>/g) || []).length === 5 && /window\.print\(\)/.test(fenster) && /@page \{ size: A4 landscape/.test(fenster), 'Mit den Modulen, einem Druckknopf und Querformat');
run("wiKursZu('start-phishing-kurs', 0)");
ok(/wiZertifikat\(&quot;start-phishing-kurs&quot;\)/.test(mount.innerHTML), 'Auch die Übersicht bietet sie an');
run("wiSchliessen()");
ok(!/class="wi-pflicht"/.test(mount.innerHTML) && /✓ abgeschlossen, gültig bis \d{2}\.\d{2}\.2027/.test(mount.innerHTML), 'Oben ist die Pflicht weg, die Karte zeigt „gültig bis"');
// Ein Jahr später: Auffrischung
run("State.acks[State.acks.length - 1].abgeschlossenAm = '2025-01-01T10:00:00Z'; renderWissen();");
ok(/class="wi-pflicht faellig"/.test(mount.innerHTML) && /Auffrischung fällig/.test(mount.innerHTML) && />Auffrischen</.test(mount.innerHTML), 'Nach Ablauf steht die Pflicht wieder oben – zur Auffrischung');
run("wiOeffnen('start-phishing-kurs'); wiKursZu('start-phishing-kurs', 6); wiTestStarten('start-phishing-kurs'); _quiz.answers = Object.fromEntries(_quiz.questions.map((q, i) => [i, q.richtig]));");
await run("wiTestAuswerten('start-phishing-kurs')");
ok(acksGeschrieben[acksGeschrieben.length - 1].abgeschlossenAm > '2026-01-01' && acksGeschrieben[acksGeschrieben.length - 1].quizVersuche === 2, 'Die Auffrischung setzt ein neues Abschlussdatum – die Frist beginnt von vorn');

// Pflege: der Editor kennt die Felder der Schulung
ctx.spSaveWissen = async (daten, erwartet) => { gespeichert.push({ daten: JSON.parse(JSON.stringify(daten)), erwartet }); return { geaendertAm: 'm' + (gespeichert.length + 10) }; };
ctx.__schreiben = true;
run("wiSchliessen(); wiBeitragDialog('start-phishing-kurs')");
ok(/Warum dieser Kurs\? \(Einstieg\)/.test(modal) && /Pflichttraining/.test(modal) && /<option value="12" selected>jährlich<\/option>/.test(modal) && /Modul 05/.test(modal) && /wiModulAdd\(\)/.test(modal) && /Frage 5/.test(modal),
  'Der Editor: Einstieg, Pflicht, Wiederholung, Module, Fragen');
run("wiModulAdd(); _wiEdit.module[5].titel = 'Bonus'; _wiEdit.module[5].text = 'Mehr.'; wiModulVerschieben(5, -1);");
ok(run('_wiEdit.module.map(m => m.titel).join("|")') === 'Was ist Phishing?|Arten von Phishing|Eine gefälschte E-Mail lesen|Die 7 wichtigsten Warnsignale|Bonus|Richtig reagieren', 'Module hinzufügen und verschieben');
gespeichert.length = 0;
await run('wiBeitragSpeichern()');
const kNeu = run("wiBeitrag(_wi.daten, 'start-phishing-kurs')");
ok(gespeichert.length === 1 && kNeu.module.length === 6 && kNeu.stand === '1', 'Gespeichert – ein neues Modul ändert den Stand nicht, Abschlüsse gelten weiter');
run("wiBeitragDialog('start-phishing-kurs'); _wiEdit.fragen[0].frage = 'Neu gefragt?';");
await run('wiBeitragSpeichern()');
ok(run("wiBeitrag(_wi.daten, 'start-phishing-kurs').stand") === '2', 'Geänderte Fragen: neuer Stand');
ctx.__schreiben = false;

ok(/m\.pflichtKurse = \(typeof wiPflichtQuote === 'function'\)/.test(lies('js/clevelreport.js')) && /Pflichtschulung „\$\{x\.kurs\.titel\}"/.test(lies('js/clevelreport.js')), 'Der Audit Report führt jede Pflichtschulung mit Quote');
ok(/📋 Pflichtschulungen/.test(lies('js/wissen.js')) && /wiPflichtQuote\(_wi\.daten, _wiAlleAcks, members \|\| \[\]\)/.test(lies('js/wissen.js')), 'Die Auswertung im Reiter auch');
ok(/🎓 Schulung:<\/b>/.test(lies('js/dokumentation.js')) && /Phishing erkennen/.test(lies('js/dokumentation.js')), 'Die Dokumentation erklärt Schulungen');

/* ── 7) Fortschritt in SharePoint, Erinnerungen aus dem Cron ── */
const sp = lies('js/sharepoint.js');
ok(/\{ name: 'Fortschritt',\s+typ: 'Mehrere Zeilen Text' \}/.test(sp) && /fortschritt:\s+f\.Fortschritt \|\| ''/.test(sp) && /if \(typeof a\.fortschritt === 'string'\) all\.Fortschritt = a\.fortschritt;/.test(sp),
  'Die Bestätigungen-Liste bekommt die Spalte „Fortschritt" – gelesen und geschrieben');
ok(/async function spEnsureAckColumns/.test(sp) && /spEnsureAckColumns\(\)\.catch/.test(lies('js/wissen.js')), 'Fehlende Spalten legt der erste Admin an – beim Öffnen des Reiters');
ok(!/localStorage/.test(lies('js/wissen.js')), 'Der Reiter legt nichts im Browser ab – alles in SharePoint');
ok(M.wiFortschrittVon({ stand: '2', module: [{ id: 'm1' }, { id: 'm2' }] }, { fortschritt: '{"s":"2","m":["m1","m9"]}' }).join() === 'm1', 'Gelesen zählt nur, was es im Stand gibt');
ok(M.wiFortschrittVon({ stand: '2', module: [{ id: 'm1' }] }, { fortschritt: '{"s":"1","m":["m1"]}' }).length === 0 && M.wiFortschrittVon({ stand: '1' }, { fortschritt: 'kaputt' }).length === 0, 'Ein alter Stand oder kaputter Inhalt zählt nicht');
const cron = lies('scripts/erinnerungen.mjs');
ok(/const WI = _require\('\.\.\/js\/wissenmodell\.js'\)/.test(cron) && /loadKonfigJson\(siteId, 'wissen\.json'\)/.test(cron), 'Der Cron liest wissen.json über dasselbe Modell');
ok(/cfg\.schulungErinnerungAktiv === false/.test(cron) && /schulungVorlaufTage/.test(cron) && /function schulungMailHtml/.test(cron) && /ansicht=wissen&beitrag=/.test(cron),
  'Er erinnert an Pflichtschulungen – offen, Auffrischung bald, abgelaufen – mit Link auf die Schulung');
ok(/bis === sVorlauf \|\| bis === 3 \|\| bis === 1/.test(cron), 'Die Auffrischung wird 14, 3 und 1 Tag vorher angekündigt');
ok(/function schulungGiltFuer/.test(cron) && /cfg\.gesellschaften\[dom\]/.test(cron), 'Der Geltungsbereich zählt – über die Gesellschaft der Person');
const acc2 = lies('js/access.js');
ok(/schulungErinnerungAktiv:\s+true/.test(acc2) && /schulungVorlaufTage:\s+14/.test(acc2) && /schulungErinnerungAktiv:\s+c\.schulungErinnerungAktiv !== false/.test(acc2), 'Die Einstellungen kennen die Schulungs-Erinnerung');
ok(/Pflichtschulungen \(Reiter „Wissen"\)/.test(lies('js/einstellungen.js')) && /_cfgEdit\.schulungVorlaufTage/.test(lies('js/einstellungen.js')), 'Und der Reiter Einstellungen zeigt sie');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
