/**
 * Vorführ- und Testmodus: Datenschicht, Mailumleitung, Zugriffsschutz
 * und die Schrittfolge der geführten Vorführung.
 *
 * Wichtig sind hier zwei Zusicherungen, die im Betrieb weh täten, wenn sie
 * brechen: Es darf nichts in SharePoint geschrieben werden, und es darf keine
 * Testmail an echte Empfänger gehen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── Umgebung: nur so viel Anwendung, wie demo.js und tour.js brauchen ── */
const gesendet = [];               // was die ECHTE Mailfunktion zu sehen bekäme
const ctx = {
  console,
  esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  toast: () => {}, openModal: () => {}, closeModal: () => {},
  document: { getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, setAttribute() {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } } },
  location: { search: '', pathname: '/', href: 'https://rms.dihag.de/' },
  URL, URLSearchParams, setTimeout, clearInterval, setInterval,
  addEventListener: () => {},
  State: { user: { upn: 'chef@dihag.com', name: 'Test Chef' }, policies: [], konzepte: [], acks: [] },
  ZIELGRUPPE_ALLE: 'ALLE',
  TUT_BEISPIEL: { titel: 'Regelwerk zur Nutzung von KI', typ: 'Konzernrichtlinie' },
  getAccessConfig: () => ({ admins: ['chef@dihag.com'] }),
  // Die „echte" Mailfunktion, die demo.js umlenken soll
  spSendMail: async (to, betreff, html) => { gesendet.push({ to, betreff, html }); return true; },
  spGetMembers: async () => [{ name: 'Echte Kollegin', upn: 'kollegin@dihag.com', department: 'IT' }],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/demo.js'), ctx);
vm.runInContext(lies('js/tour.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
const wert = (s) => vm.runInContext(s, ctx);   // const/let aus dem Skript sind keine ctx-Eigenschaften

/* ── 1) Beispieldaten ── */
run('_demoSeed();');
ok(wert('DemoDaten').policies.length === 4, `Vier Beispiel-Regelwerke (ist ${wert('DemoDaten').policies.length})`);
ok(wert('DemoDaten').policies.every(p => /\(Demo\)$/.test(p.title)),
  'Jeder Beispieltitel ist als „(Demo)" gekennzeichnet');
const status = wert('DemoDaten').policies.map(p => p.status);
for (const s of ['Veröffentlicht', 'Konformitätsprüfung', 'Entwurf'])
  ok(status.includes(s), `Beispiel im Status ${s} vorhanden`);
ok(wert('DemoDaten').acks.length === 1, 'Eine bereits erledigte Kenntnisnahme');
ok(wert('DemoDaten').policies.some(p => (p.historie || []).length >= 2), 'Beispiele bringen eine Historie mit');
ok(wert('DemoDaten').policies.some(p => p.quizErforderlich && p.quiz.length), 'Ein Beispiel hat einen Wissenstest');

/* ── 2) Datenschicht schreibt nur in den Arbeitsspeicher ── */
run('_demoStubs();');
run(`globalThis.__neu = null;
     spSavePolicy({ title: 'Frisch', status: 'Entwurf' }).then(r => { globalThis.__neu = r; });`);
await new Promise(r => setTimeout(r, 10));
ok(ctx.__neu && ctx.__neu.id, 'spSavePolicy liefert eine Id');
ok(wert('DemoDaten').policies.length === 5, 'Der neue Eintrag liegt in DemoDaten');

const quelle = lies('js/demo.js');
for (const verboten of ['SP.graphBase', '_post(', '_patch(', '_del('])
  ok(!quelle.includes(verboten), `demo.js schreibt nicht selbst nach Graph (${verboten})`);
ok(/g\.spSavePolicy\s*=/.test(quelle) && /g\.spGetPolicies\s*=/.test(quelle),
  'Lesen und Schreiben der Regelwerke sind umgeleitet');
ok(/g\.spSaveAccessConfig\s*=/.test(quelle), 'Auch die Einstellungen werden nicht gespeichert');

/* ── 3) Mailversand: echt, aber nur an die vorführende Person ── */
gesendet.length = 0;
run(`spSendMail(['gf@dihag.com', 'kbr@dihag.com'], 'Freigabe nötig', '<p>Inhalt</p>', [], ['cc@dihag.com']);`);
await new Promise(r => setTimeout(r, 10));
ok(gesendet.length === 1, 'Es wurde wirklich versendet (eine Nachricht)');
const m = gesendet[0];
ok(Array.isArray(m.to) && m.to.length === 1 && m.to[0] === 'chef@dihag.com',
  'Einziger Empfänger ist die vorführende Person');
ok(!JSON.stringify(m.to).includes('gf@dihag.com'), 'Die echten Empfänger bekommen nichts');
ok(/^\[RMS-Vorführung\]/.test(m.betreff), 'Der Betreff weist die Vorführung aus');
ok(/Testnachricht aus dem Vorf/.test(m.html), 'Die Mail trägt einen Testhinweis');
ok(/kein echter Vorgang/.test(m.html), 'Der Hinweis sagt, dass nichts zu veranlassen ist');
ok(m.html.includes('gf@dihag.com') && m.html.includes('kbr@dihag.com'),
  'Die ursprünglichen Empfänger stehen im Hinweis');
ok(m.html.includes('<p>Inhalt</p>'), 'Der eigentliche Inhalt bleibt erhalten');
ok(wert('DemoDaten').mails.length === 1, 'Die Nachricht liegt zusätzlich im Postausgang');
ok(wert('DemoDaten').mails[0].versendetAn === 'chef@dihag.com', 'Der Postausgang vermerkt den Versand');
ok(wert('DemoDaten').mails[0].betreff === 'Freigabe nötig', 'Im Postausgang steht der Original-Betreff');

/* Abschalten muss den Versand wirklich unterbinden. */
gesendet.length = 0;
run(`demoMailSchalter(false); spSendMail(['gf@dihag.com'], 'Zweite', '<p>x</p>');`);
await new Promise(r => setTimeout(r, 10));
ok(gesendet.length === 0, 'Mit ausgeschaltetem Versand geht nichts raus');
ok(wert('DemoDaten').mails.length === 2, 'Die Nachricht steht trotzdem im Postausgang');
ok(wert('DemoDaten').mails[0].versendetAn === '', 'Sie ist als „nicht versendet" vermerkt');

/* ── 4) Zugriffsschutz ── */
const acc = lies('js/access.js');
ok(/function darfDemo\(/.test(acc), 'access.js kennt darfDemo()');
ok(/isAdmin\(u\)\s*\|\|\s*_has\(_cfg\(\)\.demoUser, u\)/.test(acc),
  'Freigeschaltet sind Admins und die Liste demoUser');
ok(/demoUser:\s*Array\.isArray\(cfg\.demoUser\)/.test(acc), 'demoUser wird aus der Konfiguration gelesen');
ok(/darfDemo\(\)/.test(quelle), 'demo.js prüft die Freischaltung');
ok(/function demoKeinZugriff/.test(quelle), 'Es gibt einen Hinweis für Nicht-Freigeschaltete');
ok(/nur für freigeschaltete/i.test(quelle), 'Der Hinweis nennt den Grund');

const app = lies('js/app.js');
ok(/demoGewuenscht\(\)[\s\S]{0,120}demoAktivieren\(\)/.test(app),
  'Der Modus startet erst nach der Anmeldung aus bootApp heraus');
ok(!/authInit|loginRedirect/.test(quelle), 'demo.js umgeht die Anmeldung nicht');

const anl = lies('js/anleitung.js');
ok(/darfDemo\(\)\)\s*\?/.test(anl), 'Die Anleitung zeigt den Knopf nur Freigeschalteten');
ok(/demoStart\(\)/.test(anl), 'Die Anleitung hat den Startknopf');

const eins = lies('js/einstellungen.js');
ok(/cfg-demoUser/.test(eins), 'Einstellungen pflegen die Freischaltliste');
ok(/Vorführmodus/.test(eins), 'Der Abschnitt heißt „Vorführmodus"');
ok(/'demoUser'/.test(lies('js/admin.js')), 'renderCfgLists zeigt die Liste an');

/* ── 5) Deep-Links aus den Testmails ── */
ok(/function demoMailLink/.test(quelle), 'Links aus der Mail werden abgefangen');
ok(/handleKonzeptMailAction/.test(quelle) && /handleMailAction/.test(quelle),
  'Beide Entscheidungswege (Konzept und Regelwerk) sind angebunden');

/* ── 6) Selbsttest ── */
ok(/async function demoSelbsttest/.test(quelle), 'Es gibt einen Selbsttest');
for (const stufe of ['Konzept anlegen', 'Konzept eingereicht', 'Status Konformitätsprüfung',
  'Konformität bestätigt', 'Freigegeben und veröffentlicht', 'Kenntnisnahme gespeichert',
  'Änderungshistorie geschrieben'])
  ok(quelle.includes(stufe), `Selbsttest prüft: ${stufe}`);
ok(/Mailversand über Microsoft Graph/.test(quelle), 'Selbsttest prüft auch die Mailstrecke');

/* ── 7) Schritte der geführten Vorführung ── */
run('globalThis.__s = tourSchritte();');
const schritte = ctx.__s;
ok(schritte.length >= 12, `Mindestens zwölf Schritte (ist ${schritte.length})`);
ok(schritte.every(s => s.titel && s.text), 'Jeder Schritt hat Titel und Text');
const titel = schritte.map(s => s.titel).join(' | ');
for (const wort of ['Dashboard', 'Konzept', 'Mail', 'Entwurf', 'Konformitätsprüfung',
  'Mitbestimmung', 'Freigabe', 'Kenntnisnahme', 'Audit'])
  ok(titel.includes(wort), `Die Vorführung deckt ab: ${wort}`);

const mit = schritte.filter(s => typeof s.erfuellt === 'function');
ok(mit.length >= 9, `Die meisten Schritte warten auf eine echte Aktion (${mit.length})`);
ok(schritte.filter(s => typeof s.vormachen === 'function').length >= 9,
  'Fast jeder Schritt lässt sich auch vormachen');
ok(typeof schritte[0].erfuellt !== 'function', 'Der Begrüßungsschritt wartet auf nichts');
ok(typeof schritte[schritte.length - 1].erfuellt !== 'function', 'Der Schlussschritt wartet auf nichts');

/* Die Bedingungen dürfen nie werfen, auch wenn noch gar nichts da ist. */
let geworfen = 0;
for (const s of mit) { try { s.erfuellt(0); } catch (e) { geworfen++; } }
ok(geworfen === 0, 'Keine Bedingung wirft bei leerem Zustand');

const tour = lies('js/tour.js');
ok(/tour-mask/.test(tour) && /_tourPositioniere/.test(tour),
  'Die Hervorhebung lässt das Ziel als Ausschnitt frei (anklickbar)');
ok(/TOUR_MINDEST/.test(tour), 'Ein Schritt bleibt eine Mindestzeit stehen');
ok(/demoAktiv\(\)/.test(tour), 'Die Vorführung läuft nur im Demo-Modus');

/* ── 8) Einbindung ── */
const html = lies('index.html');
const reihen = [...html.matchAll(/<script src="js\/([a-z-]+)\.js/g)].map(x => x[1]);
for (const f of ['demo', 'tour']) ok(reihen.includes(f), `${f}.js ist eingebunden`);
ok(reihen.indexOf('tutorial') < reihen.indexOf('tour'), 'tour.js lädt nach tutorial.js (nutzt TUT_BEISPIEL)');
ok(reihen.indexOf('demo') < reihen.indexOf('anleitung'), 'demo.js lädt vor anleitung.js');
ok(/\.demo-banner\b/.test(lies('css/style.css')) && /\.tour-tip\b/.test(lies('css/style.css')),
  'Die Formatierung für Streifen und Sprechblase ist vorhanden');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
