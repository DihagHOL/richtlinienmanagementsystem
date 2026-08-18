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
  // Winziges Schein-DOM: genug, damit die Führung wirklich läuft (nicht nur gelesen wird)
  document: (() => {
    const reg = new Map();
    const mk = () => ({ id: '', className: '', innerHTML: '', style: { cssText: '' },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      setAttribute() {}, offsetHeight: 200, offsetWidth: 360,
      getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 30, right: 110, bottom: 40 }),
      scrollIntoView() {}, remove() {} });
    return {
      _reg: reg,
      getElementById: (id) => reg.get(id) || null,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => { const e = mk(); const set = e; 
        return new Proxy(set, { set(t, k, v) { t[k] = v; if (k === 'id') reg.set(v, t); return true; } }); },
      body: { appendChild() {}, classList: { add() {}, remove() {} } },
    };
  })(),
  location: { search: '', pathname: '/', href: 'https://rms.dihag.de/' },
  URL, URLSearchParams, setTimeout, clearInterval, setInterval,
  addEventListener: () => {},
  State: { user: { upn: 'chef@dihag.com', name: 'Test Chef' }, policies: [], konzepte: [], acks: [] },
  ZIELGRUPPE_ALLE: 'ALLE',
  TUT_BEISPIEL: { titel: 'Regelwerk zur Nutzung von KI', typ: 'Konzernrichtlinie' },
  getAccessConfig: () => ({ admins: ['chef@dihag.com'] }),
  MUSTER_VORLAGE_URL: 'https://dihag.sharepoint.com/muster.docx',
  geltungsbereichLabel: (a) => (a || []).join(', ') || 'Alle Standorte',
  btoa: (bin) => Buffer.from(bin, 'latin1').toString('base64'),
  localStorage: (() => { const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })(),
  // Die „echte" Mailfunktion, die demo.js umlenken soll
  spSendMail: async (to, betreff, html) => { gesendet.push({ to, betreff, html }); return true; },
  spGetMembers: async () => [{ name: 'Echte Kollegin', upn: 'kollegin@dihag.com', department: 'IT' }],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/demo.js'), ctx);
vm.runInContext(lies('js/tour.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
const wert = (s) => vm.runInContext(s, ctx);
const quelleRoh = () => lies('js/demo.js');
const tourRoh = () => lies('js/tour.js');   // const/let aus dem Skript sind keine ctx-Eigenschaften

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
ok(wert('DemoDaten').mails.length === 1, 'Der Versand wird protokolliert');
ok(wert('DemoDaten').mails[0].versendetAn === 'chef@dihag.com', 'Das Protokoll vermerkt den Empfänger');
ok(wert('DemoDaten').mails[0].betreff === 'Freigabe nötig', 'Im Protokoll steht der Original-Betreff');
ok(!quelleRoh().includes('function demoPostausgang'), 'Es gibt keine nachgebaute Postfach-Ansicht mehr');

/* Abschalten muss den Versand wirklich unterbinden. */
gesendet.length = 0;
run(`demoMailSchalter(false); spSendMail(['gf@dihag.com'], 'Zweite', '<p>x</p>');`);
await new Promise(r => setTimeout(r, 10));
ok(gesendet.length === 0, 'Mit ausgeschaltetem Versand geht nichts raus');
ok(wert('DemoDaten').mails.length === 2, 'Sie steht trotzdem im Protokoll');
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

/* ── 5) Aus dem Postfach zurück in die Vorführung ── */
run(`globalThis.__lnk = _demoLinksUmbiegen('<a href="https://rms.dihag.de/?konzept=7&aktion=annehmen">x</a>');`);
ok(ctx.__lnk.includes('?demo=1&konzept=7'), 'Links aus der Mail führen zurück in die Vorführung');
ok(/function _demoWiederherstellen/.test(quelle), 'Der Stand überlebt den Seitenwechsel');
ok(/localStorage/.test(quelle), 'Dafür wird localStorage genutzt (nicht sessionStorage – Outlook öffnet einen neuen Tab)');
ok(/DEMO_HALTBAR/.test(quelle), 'Der gespeicherte Stand verfällt nach einer Frist');
ok(quelle.includes('_demoVergessen();'), 'Beenden räumt den Speicher auf');
ok(/applyDeepLinkOrDefault/.test(quelle), 'Ein Entscheidungs-Link wird beim Start ausgeführt');

/* ── 5b) Dokument: Anhang und Fundstelle in SharePoint ── */
run(`globalThis.__att = null; spGetDocAttachment('demo-drive', 'demo-item').then(a => { globalThis.__att = a; });`);
await new Promise(r => setTimeout(r, 20));
const att = ctx.__att;
ok(!!att, 'Die Vorführung erzeugt einen echten Anhang');
ok(att && att.contentType === 'application/pdf', 'Der Anhang ist ein PDF');
ok(att && att['@odata.type'] === '#microsoft.graph.fileAttachment', 'Er hat das Format, das Graph erwartet');
const pdf = att ? Buffer.from(att.contentBytes, 'base64').toString('latin1') : '';
ok(pdf.startsWith('%PDF-'), 'Das PDF hat einen gültigen Kopf');
ok(pdf.trimEnd().endsWith('%%EOF'), 'Das PDF ist sauber abgeschlossen');
ok(/startxref/.test(pdf) && /xref/.test(pdf), 'Die Querverweistabelle ist vorhanden');
const xrefOff = Number((pdf.slice(pdf.lastIndexOf('startxref') + 9).trim().split(/\s/)[0]));
ok(pdf.slice(xrefOff, xrefOff + 4) === 'xref', 'startxref zeigt auf die Tabelle');
ok(wert('DemoDaten').policies.filter(p => p.dokumentUrl).length >= 3,
  'Die Beispiele verweisen auf ein Dokument in SharePoint');
ok(/_wfDokumentHtml/.test(lies('js/freigaben.js')), 'Die Workflow-Mail hat eine Dokumentzeile');
ok(/Dokument in SharePoint öffnen/.test(lies('js/freigaben.js')),
  'Prüfer und Geschäftsleitung bekommen den SharePoint-Link');
ok(/Dokument in SharePoint öffnen/.test(lies('js/konzepte.js')), 'Auch die Konzept-Mail verlinkt das Dokument');

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
ok(schritte.every(s => s.symbol), 'Jeder Schritt hat ein Symbol');
ok(titel.includes('Postfach'), 'Ein Schritt führt ins Outlook-Postfach');
ok(!/Postausgang/.test(tourRoh()), 'Die Führung verweist nicht mehr auf eine App-interne Postfach-Ansicht');
ok(typeof schritte[schritte.length - 1].erfuellt !== 'function', 'Der Schlussschritt wartet auf nichts');

/* Die Bedingungen dürfen nie werfen, auch wenn noch gar nichts da ist. */
let geworfen = 0;
for (const s of mit) { try { s.erfuellt(0); } catch (e) { geworfen++; } }
ok(geworfen === 0, 'Keine Bedingung wirft bei leerem Zustand');

const tour = lies('js/tour.js');
ok(/tour-mask/.test(tour) && /_tourPositioniere/.test(tour),
  'Die Hervorhebung lässt das Ziel als Ausschnitt frei (anklickbar)');
ok(/TOUR_MINDEST/.test(tour), 'Ein Schritt bleibt eine Mindestzeit stehen');
ok(/_tourVorerf/.test(tour), 'Ein beim Betreten schon erfüllter Schritt wird nicht übersprungen');
ok(/if \(_tourVorerf\) return;/.test(tour), 'Die Prüfschleife respektiert das');
ok(/tour-fortschritt/.test(tour) && /tour-wartet/.test(tour), 'Fortschritt und Wartezustand sind sichtbar');
ok(/demoAktiv\(\)/.test(tour), 'Die Vorführung läuft nur im Demo-Modus');

/* ── 8) Einbindung ── */
const html = lies('index.html');
const reihen = [...html.matchAll(/<script src="js\/([a-z-]+)\.js/g)].map(x => x[1]);
for (const f of ['demo', 'tour']) ok(reihen.includes(f), `${f}.js ist eingebunden`);
ok(reihen.indexOf('tutorial') < reihen.indexOf('tour'), 'tour.js lädt nach tutorial.js (nutzt TUT_BEISPIEL)');
ok(reihen.indexOf('demo') < reihen.indexOf('anleitung'), 'demo.js lädt vor anleitung.js');
ok(/\.demo-banner\b/.test(lies('css/style.css')) && /\.tour-tip\b/.test(lies('css/style.css')),
  'Die Formatierung für Streifen und Sprechblase ist vorhanden');

/* ── 9) Der gemeldete Fehler: Schritt 1 lief von allein weiter ──
   Die Vorführung startete im Dashboard; damit war „Dashboard öffnen" bereits
   erfüllt und wurde sofort übersprungen. Jetzt muss der Schritt stehen bleiben. */
run(`_tourListe = tourSchritte();
     _tourAnsicht = () => true;              // Ansicht ist schon offen
     _tourGehe(1);
     globalThis.__vorerf = _tourVorerf;
     _tourSeit = 0;                          // Mindestverweildauer aushebeln
     _tourTakt(); _tourTakt();
     globalThis.__idxDanach = _tourIdx;`);
ok(ctx.__vorerf === true, 'Ein bereits erfüllter Schritt wird als erledigt erkannt');
ok(ctx.__idxDanach === 1, 'Er bleibt trotzdem stehen und springt nicht weiter');

run(`_tourAnsicht = () => false;             // noch nicht erledigt
     _tourGehe(1);
     globalThis.__wartet = _tourVorerf;
     _tourSeit = 0; _tourTakt();
     globalThis.__idxWartend = _tourIdx;
     _tourAnsicht = () => true;              // jetzt führt der Anwender den Schritt aus
     _tourSeit = 0; _tourTakt();
     globalThis.__nachKlick = _tourVorerf;`);
ok(ctx.__wartet === false, 'Ein offener Schritt wartet');
ok(ctx.__idxWartend === 1, 'Und bleibt stehen, solange nichts passiert');
ok(ctx.__nachKlick === true, 'Nach der echten Aktion wird er als erledigt erkannt');
run('tourEnde();');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
