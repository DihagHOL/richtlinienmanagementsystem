/**
 * Probelauf: echter Vorgang, Buchführung, Aufräumen, Zugriffsschutz –
 * und die Schrittfolge der geführten Vorführung.
 *
 * Der Probelauf arbeitet bewusst auf den echten Listen. Zwei Dinge müssen
 * deshalb verlässlich stimmen: Er darf die Datenschicht nicht heimlich
 * ersetzen (sonst prüft er nichts Echtes), und er muss genau das wieder
 * löschen können, was er selbst angelegt hat – nicht mehr.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── Umgebung: nur so viel Anwendung, wie probelauf.js und tour.js brauchen ── */
const echt = { gespeichert: [], acks: [], geloescht: [], ackGeloescht: [], hochgeladen: [], dateiGeloescht: [] };
let naechsteId = 100;

const ctx = {
  console,
  esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  toast: () => {}, openModal: () => {}, closeModal: () => {}, showSync: () => {},
  confirm: () => true,
  // Winziges Schein-DOM: genug, damit die Führung wirklich läuft
  document: (() => {
    const reg = new Map();
    const mk = () => ({ id: '', className: '', innerHTML: '', style: { cssText: '' },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      setAttribute() {}, offsetHeight: 200, offsetWidth: 360, textContent: '',
      getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 30, right: 110, bottom: 40 }),
      scrollIntoView() {}, remove() {} });
    return {
      getElementById: (id) => reg.get(id) || null,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => new Proxy(mk(), { set(t, k, v) { t[k] = v; if (k === 'id') reg.set(v, t); return true; } }),
      body: { appendChild() {}, classList: { add() {}, remove() {} } },
    };
  })(),
  location: { search: '', pathname: '/', href: 'https://rms.dihag.de/' },
  URL, URLSearchParams, setTimeout, clearInterval, setInterval,
  addEventListener: () => {},
  localStorage: (() => { const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })(),
  State: { user: { upn: 'chef@dihag.com', name: 'Test Chef' }, policies: [], konzepte: [], acks: [] },
  TUT_BEISPIEL: { titel: 'Regelwerk zur Nutzung von KI', typ: 'Konzernrichtlinie' },
  getPruefer: () => ['pruefer@dihag.com'],
  getGeschaeftsleitung: () => ['gf@dihag.com'],
  getKbrMail: () => 'kbr@dihag.com',
  // Die ECHTEN Datenfunktionen – der Probelauf muss sie wirklich aufrufen
  spSavePolicy: async (p) => { const id = p.id || String(naechsteId++); echt.gespeichert.push({ id, neu: !p.id }); return { id }; },
  spSaveAcknowledgement: async (a) => { const id = a.id || 'a' + naechsteId++; echt.acks.push({ id, neu: !a.id }); return { id }; },
  spDeletePolicy: async (id) => { echt.geloescht.push(String(id)); },
  spDeleteAcknowledgement: async (id) => { echt.ackGeloescht.push(String(id)); },
  spDeleteDriveItem: async (driveId, itemId) => { echt.dateiGeloescht.push(String(itemId)); },
  spUploadPolicyDoc: async (name, bytes, typ) => {
    echt.hochgeladen.push({ name, typ, bytes });
    return { driveId: 'd1', itemId: 'f1', name, url: 'https://sp/' + name };
  },
  geltungsbereichLabel: (a) => (a || []).join(', '),
  Uint8Array,
  reloadData: async () => {}, reloadAcks: async () => {},
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/probelauf.js'), ctx);
vm.runInContext(lies('js/tour.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);
const quelle = lies('js/probelauf.js');
const tour = lies('js/tour.js');

/* ── 1) Kein Sandkasten: die echte Datenschicht bleibt stehen ── */
for (const verboten of ['g.spGetPolicies', 'g.spSavePolicy', 'spGetPolicies =', 'spLoadAccessConfig =',
  'spGetMembers =', 'spGetDocAttachment =', 'DemoDaten'])
  ok(!quelle.includes(verboten), `Die Datenschicht wird nicht ersetzt (${verboten})`);
ok(!fs.existsSync(path.join(ROOT, 'js/demo.js')), 'Der alte Sandkasten-Modus ist entfernt');
ok(/echten SharePoint-Listen/.test(quelle), 'Der Kopfkommentar sagt, dass echte Listen bespielt werden');

/* ── 2) Kennzeichnung im Titel ── */
run(`globalThis.__t1 = probelaufTitel('Regelwerk zur Nutzung von KI');
     globalThis.__t2 = probelaufTitel(globalThis.__t1);`);
ok(ctx.__t1 === '[Probelauf] Regelwerk zur Nutzung von KI', 'Der Titel wird gekennzeichnet');
ok(ctx.__t2 === ctx.__t1, 'Zweimal Kennzeichnen ändert nichts');
ok(/probelaufTitel\(/.test(tour), 'Auch die Führung kennzeichnet ihren Vorgang');

/* ── 3) Buchführung: die echten Funktionen werden wirklich aufgerufen ── */
run('_plBuchfuehrung();');
run(`globalThis.__r = [];
     spSavePolicy({ title: 'Neu 1' }).then(r => globalThis.__r.push(r));
     spSavePolicy({ id: '77', title: 'Bestehend' }).then(r => globalThis.__r.push(r));
     spSaveAcknowledgement({ richtlinieId: '1' }).then(r => globalThis.__r.push(r));`);
await new Promise(r => setTimeout(r, 20));
ok(echt.gespeichert.length === 2, 'Die echte Speicherfunktion wurde durchgereicht');
ok(echt.acks.length === 1, 'Auch Kenntnisnahmen laufen durch die echte Funktion');
run('globalThis.__anz = probelaufAnzahl();');
ok(ctx.__anz === 2, `Nur die NEUEN Einträge werden mitgeschrieben (ist ${ctx.__anz})`);

/* ── 4) Aufräumen löscht genau diese Einträge ── */
run('probelaufLoeschen();');
await new Promise(r => setTimeout(r, 30));
ok(echt.geloescht.length === 1, 'Ein angelegtes Regelwerk wird gelöscht');
ok(!echt.geloescht.includes('77'), 'Der vorhandene Eintrag „77" wird NICHT angefasst');
ok(echt.ackGeloescht.length === 1, 'Die angelegte Kenntnisnahme wird gelöscht');
run('globalThis.__nach = probelaufAnzahl();');
ok(ctx.__nach === 0, 'Danach ist die Spur leer');

ok(/function spDeleteAcknowledgement/.test(lies('js/sharepoint.js')),
  'Die Datenschicht kann Kenntnisnahmen löschen');

/* ── 4b) Das Dokument zum Regelwerk ──
   Ohne Datei geht die Mail ohne Anhang raus – genau das war in der Erprobung das Problem. */
run(`globalThis.__rw = { title: '[Probelauf] Regelwerk zur Nutzung von KI', regelwerkTyp: 'Konzernrichtlinie',
       geltungsbereich: ['ALLE'], version: '1.0' };
     globalThis.__dok = null;
     probelaufDokument(globalThis.__rw).then(r => { globalThis.__dok = r; });`);
await new Promise(r => setTimeout(r, 20));
ok(ctx.__dok === true, 'Das Beispieldokument wird abgelegt');
ok(echt.hochgeladen.length === 1, 'Es geht wirklich durch den Upload der Datenschicht');
const datei = echt.hochgeladen[0];
ok(datei.typ === 'application/pdf', 'Als PDF');
ok(/\.pdf$/.test(datei.name), `Mit Dateiendung (${datei.name})`);
const pdfText = Buffer.from(datei.bytes).toString('latin1');
ok(pdfText.startsWith('%PDF-'), 'Gültiger PDF-Kopf');
ok(pdfText.trimEnd().endsWith('%%EOF'), 'Sauber abgeschlossen');
const xrefOff = Number(pdfText.slice(pdfText.lastIndexOf('startxref') + 9).trim().split(/\s/)[0]);
ok(pdfText.slice(xrefOff, xrefOff + 4) === 'xref', 'Die Querverweistabelle stimmt');
ok(pdfText.includes('Konzernrichtlinie'), 'Der Inhalt nennt die Dokumentart');
ok(ctx.__rw.dokumentItemId === 'f1' && ctx.__rw.dokumentDriveId === 'd1',
  'Die Datei ist am Regelwerk hinterlegt');
ok(!!ctx.__rw.dokumentUrl, 'Und über SharePoint erreichbar');
run('globalThis.__anz2 = probelaufAnzahl();');
ok(ctx.__anz2 === 1, `Die Datei zählt zum Aufräumen dazu (ist ${ctx.__anz2})`);

run('probelaufLoeschen();');
await new Promise(r => setTimeout(r, 30));
ok(echt.dateiGeloescht.includes('f1'), 'Aufräumen löscht die Datei wieder');
ok(/function spDeleteDriveItem/.test(lies('js/sharepoint.js')), 'Die Datenschicht kann Dateien löschen');
ok(/probelaufDokument/.test(tour), 'Auch die Führung legt beim Vormachen ein Dokument ab');
ok(/Dokument in der Bibliothek abgelegt/.test(quelle), 'Der Selbsttest prüft das Dokument');

/* ── 5) Vor dem Start wird gesagt, was passiert ── */
ok(/Das wird ein echter Vorgang/.test(quelle), 'Der Startdialog warnt deutlich');
ok(/getPruefer/.test(quelle) && /getGeschaeftsleitung/.test(quelle) && /getKbrMail/.test(quelle),
  'Er nennt die tatsächlichen Empfänger der E-Mails');
ok(/nicht zurückholen/.test(quelle), 'Und sagt, dass versendete Mails bleiben');
ok(/function probelaufAufraeumen/.test(quelle), 'Es gibt eine Aufräumfunktion');
ok(/Endgültig löschen/.test(quelle), 'Gelöscht wird erst nach Rückfrage');

/* ── 6) Zugriffsschutz ── */
const acc = lies('js/access.js');
ok(/function darfProbelauf\(/.test(acc), 'access.js kennt darfProbelauf()');
ok(/isAdmin\(u\)\s*\|\|\s*_has\(_cfg\(\)\.probelaufUser, u\)/.test(acc),
  'Freigeschaltet sind Admins und die Liste probelaufUser');
ok(/probelaufUser: Array\.isArray\(cfg\.probelaufUser\)/.test(acc), 'Die Liste kommt aus der Konfiguration');
ok(!/darfDemo|demoUser/.test(acc), 'Keine Reste der alten Benennung');
ok(/darfProbelauf\(\)/.test(quelle), 'probelauf.js prüft die Freischaltung');
ok(/function probelaufKeinZugriff/.test(quelle), 'Es gibt einen Hinweis für Nicht-Freigeschaltete');

const app = lies('js/app.js');
ok(/probelaufGewuenscht\(\)[\s\S]{0,160}probelaufAktivieren\(\)/.test(app),
  'Der Probelauf startet erst nach der Anmeldung');
ok(!/authInit|loginRedirect/.test(quelle), 'probelauf.js umgeht die Anmeldung nicht');

const anl = lies('js/anleitung.js');
ok(/darfProbelauf\(\)\)\s*\?/.test(anl), 'Die Anleitung zeigt den Knopf nur Freigeschalteten');
ok(/probelaufStart\(\)/.test(anl), 'Die Anleitung hat den Startknopf');
ok(/echter Vorgang/.test(anl), 'Sie sagt, dass es ein echter Vorgang ist');

const eins = lies('js/einstellungen.js');
ok(/cfg-probelaufUser/.test(eins), 'Einstellungen pflegen die Freischaltliste');
ok(/'probelaufUser'/.test(lies('js/admin.js')), 'renderCfgLists zeigt die Liste an');

/* ── 7) Dokument: Anhang und Fundstelle in SharePoint ── */
const fg = lies('js/freigaben.js');
ok(/function _wfDokumentHtml/.test(fg), 'Die Workflow-Mail hat eine Dokumentzeile');
ok(/Dokument in SharePoint öffnen/.test(fg), 'Prüfer und Geschäftsleitung bekommen den SharePoint-Link');
ok(/Versionsverlauf/.test(fg), 'Mit dem Hinweis, warum der Link nützlich ist');
ok(/Dokument in SharePoint öffnen/.test(lies('js/konzepte.js')), 'Auch die Konzept-Mail verlinkt das Dokument');

/* ── 8) Selbsttest ── */
ok(/async function probelaufSelbsttest/.test(quelle), 'Es gibt einen Selbsttest');
for (const stufe of ['Konzept anlegen', 'Konzept eingereicht', 'Status Konformitätsprüfung',
  'Konformität bestätigt', 'Freigegeben und veröffentlicht', 'Kenntnisnahme gespeichert',
  'Änderungshistorie geschrieben', 'Als Probelauf erkennbar'])
  ok(quelle.includes(stufe), `Selbsttest prüft: ${stufe}`);
ok(/legt einen echten Vorgang an und versendet echte/.test(quelle), 'Der Selbsttest fragt vorher nach');

/* ── 9) Schritte der geführten Vorführung ── */
run('globalThis.__s = tourSchritte();');
const schritte = ctx.__s;
ok(schritte.length >= 12, `Mindestens zwölf Schritte (ist ${schritte.length})`);
ok(schritte.every(s => s.titel && s.text && s.symbol), 'Jeder Schritt hat Titel, Text und Symbol');
const titel = schritte.map(s => s.titel).join(' | ');
for (const wort of ['Dashboard', 'Konzept', 'Postfach', 'Entwurf', 'Konformitätsprüfung',
  'Mitbestimmung', 'Freigabe', 'Kenntnisnahme', 'Audit'])
  ok(titel.includes(wort), `Die Vorführung deckt ab: ${wort}`);
const alle = schritte.map(s => s.text + ' ' + (s.hinweis || '')).join(' ');
ok(/echter Vorgang/.test(alle), 'Sie sagt gleich zu Beginn, dass es echt ist');
ok(/Aufräumen/.test(alle), 'Und weist auf das Aufräumen hin');
ok(/Dokument/.test(alle), 'Das Dokument kommt vor');

const mit = schritte.filter(s => typeof s.erfuellt === 'function');
ok(mit.length >= 9, `Die meisten Schritte warten auf eine echte Aktion (${mit.length})`);
let geworfen = 0;
for (const s of mit) { try { s.erfuellt(0); } catch (e) { geworfen++; } }
ok(geworfen === 0, 'Keine Bedingung wirft bei leerem Zustand');

ok(/tour-mask/.test(tour) && /_tourPositioniere/.test(tour),
  'Die Hervorhebung lässt das Ziel als Ausschnitt frei (anklickbar)');
ok(/probelaufAktiv\(\)/.test(tour), 'Die Führung läuft nur im Probelauf');
ok(/tour-fortschritt/.test(tour) && /tour-wartet/.test(tour), 'Fortschritt und Wartezustand sind sichtbar');

/* ── 10) Der gemeldete Fehler: Schritt 1 lief von allein weiter ── */
run(`_plAn = true;
     _tourListe = tourSchritte();
     _tourAnsicht = () => true;              // Ansicht ist schon offen
     _tourGehe(1);
     globalThis.__vorerf = _tourVorerf;
     _tourSeit = 0;                          // Mindestverweildauer aushebeln
     _tourTakt(); _tourTakt();
     globalThis.__idxDanach = _tourIdx;`);
ok(ctx.__vorerf === true, 'Ein bereits erfüllter Schritt wird als erledigt erkannt');
ok(ctx.__idxDanach === 1, 'Er bleibt trotzdem stehen und springt nicht weiter');

run(`_tourAnsicht = () => false;
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

/* ── 10b) Angehaltene Führung: dort weitermachen, wo man aufgehört hat ──
   In einer Vorführung will man zwischendurch etwas anderes zeigen. Das Schließen
   der Sprechblase darf den Fortschritt deshalb nicht wegwerfen. */
run(`_plAn = true; tourStandVergessen();
     tourStart(0); _tourGehe(4); tourEnde();
     globalThis.__stand = tourStand();
     globalThis.__label = tourKnopfText();`);
ok(ctx.__stand === 4, `Der Schritt bleibt gemerkt (ist ${ctx.__stand})`);
ok(ctx.__label === '▶ Weiter bei Schritt 5', `Der Knopf bietet ihn an: „${ctx.__label}"`);

run(`tourStart(); globalThis.__wieder = _tourIdx; tourEnde();`);
ok(ctx.__wieder === 4, 'Ein Start ohne Angabe macht genau dort weiter');

run(`tourStart(0); globalThis.__vonVorn = _tourIdx; tourEnde();`);
ok(ctx.__vonVorn === 0, 'Mit ausdrücklicher Schrittnummer geht es trotzdem von vorn');

run(`tourNeu(); globalThis.__neu = _tourIdx; tourEnde();`);
ok(ctx.__neu === 0, '„Von vorn" beginnt wieder bei Schritt 1');

run(`tourStart(0); _tourGehe(tourSchritte().length - 1); tourWeiter();
     globalThis.__nachFertig = tourStand();`);
ok(ctx.__nachFertig === 0, 'Nach „Fertig" ist der Stand verworfen');

run(`tourStart(0); _tourGehe(3); tourEnde(); probelaufLoeschen();`);
await new Promise(r => setTimeout(r, 30));
run('globalThis.__nachAufraeumen = tourStand();');
ok(ctx.__nachAufraeumen === 0, 'Aufräumen verwirft den Stand mit (der Vorgang ist ja weg)');
ok(/function probelaufBannerAktualisieren/.test(quelle), 'Der Streifen wird beim Schließen nachgeführt');
ok(/pl-tour-neu/.test(quelle), 'Es gibt einen Knopf, um von vorn zu beginnen');

/* ── 11) Einbindung ── */
const html = lies('index.html');
const reihen = [...html.matchAll(/<script src="js\/([a-z-]+)\.js/g)].map(x => x[1]);
for (const f of ['probelauf', 'tour']) ok(reihen.includes(f), `${f}.js ist eingebunden`);
ok(!reihen.includes('demo'), 'demo.js ist nicht mehr eingebunden');
ok(reihen.indexOf('tutorial') < reihen.indexOf('tour'), 'tour.js lädt nach tutorial.js (nutzt TUT_BEISPIEL)');
ok(reihen.indexOf('probelauf') < reihen.indexOf('anleitung'), 'probelauf.js lädt vor anleitung.js');
const css = lies('css/style.css');
ok(/\.pl-warnung\b/.test(css) && /\.tour-tip\b/.test(css), 'Die Formatierung ist vorhanden');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
