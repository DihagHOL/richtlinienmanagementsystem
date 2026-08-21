/**
 * Bekanntgabe: Wer erfährt von einem neuen Regelwerk?
 *
 * Bisher niemand aktiv – die Zielgruppe sah es nur beim Öffnen der App, und die
 * erste Mail war die Erinnerung nach sieben Tagen. Genau die falsche Reihenfolge:
 * gemahnt wird, wer nie informiert wurde. Die Bekanntgabe läuft jetzt über die
 * Verteiler der Zielgruppen – eine Mail an die Gruppe statt hunderte an Personen.
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
const fg = lies('js/freigaben.js');
const eins = lies('js/einstellungen.js');
const adm = lies('js/admin.js');

/* ── 1) Zielgruppe → Verteiler ── */
const ctx = {
  console,
  document: { getElementById: () => null, addEventListener: () => {} },
  State: { myRoles: [], myGroups: [] },
  getAuthUser: () => ({ username: 'admin@dihag.com' }),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(acc, ctx);
const w = (a) => vm.runInContext(a, ctx);

w(`setRuntimeConfig({ admins: [], roles: ['Produktion', 'IT', 'Einkauf'], zielgruppenMails: {
  ALLE: 'alle@dihag.com', Produktion: 'produktion@dihag.com', IT: 'it@ewa-guss.de' } })`);

ok(w("zielgruppenMail('Produktion')") === 'produktion@dihag.com', 'Zu einer Rolle gehört ein Verteiler');
ok(w("zielgruppenMail('produktion')") === 'produktion@dihag.com', 'Groß-/Kleinschreibung ist egal');
ok(w("zielgruppenMail('Einkauf')") === '', 'Ohne Eintrag bleibt es leer');

const einzeln = w("mailsFuerZielgruppen(['Produktion'])");
ok(einzeln.adressen.length === 1 && einzeln.adressen[0] === 'produktion@dihag.com', 'Eine Zielgruppe → ein Verteiler');
const zwei = w("mailsFuerZielgruppen(['Produktion','IT'])");
ok(zwei.adressen.length === 2, 'Zwei Zielgruppen → zwei Verteiler');
const gemischt = w("mailsFuerZielgruppen(['Produktion','Einkauf'])");
ok(gemischt.adressen.length === 1 && gemischt.fehlend[0] === 'Einkauf',
  'Fehlt ein Verteiler, wird er gemeldet statt still übergangen');
const alle = w("mailsFuerZielgruppen(['ALLE','Produktion'])");
ok(alle.adressen.length === 1 && alle.adressen[0] === 'alle@dihag.com',
  '„Alle" schlägt alles andere – niemand bekommt die Mail doppelt');
ok(w("mailsFuerZielgruppen([]).adressen[0]") === 'alle@dihag.com', 'Leere Zielgruppe heißt „alle"');
ok(w("mailsFuerZielgruppen(null).adressen.length") === 1, 'Und kippt nicht bei fehlender Angabe');
w(`setRuntimeConfig({ admins: [], zielgruppenMails: { ALLE: 'alle@dihag.com', A: 'alle@dihag.com' } })`);
ok(w("mailsFuerZielgruppen(['A','ALLE']).adressen.length") === 1, 'Dieselbe Adresse zählt einmal');

w(`setRuntimeConfig({ admins: [], zielgruppenMails: {
  ALLE: 'alle@dihag.com', IT: 'it@ewa-guss.de' } })`);
const domains = w('zielgruppenDomains()');
ok(domains.includes('dihag.com') && domains.includes('ewa-guss.de'),
  'Die Domains der Verteiler sind bekannt – Gruppengesellschaften eingeschlossen');
ok(/admin-gepflegt, deshalb auch außerhalb der eigenen erlaubt/.test(acc),
  'Und es steht dabei, warum das vertretbar ist');

/* ── 2) Versand ── */
ok(/async function notifyZielgruppe/.test(fg), 'Es gibt einen Versandweg für die Bekanntgabe');
ok(/spSendMail\(adressen, `Neues Regelwerk: \$\{p\.title\}`/.test(fg), 'Er schickt an die Verteiler');
ok(/zielgruppenDomains\(\) : \[\]\)/.test(fg), 'Mit den erlaubten Domains');
ok(/spGetDocAttachment\(p\.dokumentDriveId/.test(fg.slice(fg.indexOf('async function notifyZielgruppe'), fg.indexOf('/** Bekanntgabe im Regelwerk'))),
  'Das Dokument hängt mit dran');
const html = fg.slice(fg.indexOf('function _zielgruppeMailHtml'), fg.indexOf('async function notifyZielgruppe'));
ok(/ab sofort gilt ein neues Regelwerk/.test(html), 'Die Mail sagt, worum es geht');
ok(/quizErforderlich/.test(html) && /Wissenstest bestehen/.test(html), 'Und was zu tun ist – inklusive Wissenstest');
ok(/richtlinie=\$\{encodeURIComponent\(p\.id\)\}/.test(html), 'Mit Direktlink auf das Regelwerk');
ok(/weil dieses Regelwerk für Ihren Bereich gilt/.test(html), 'Sie erklärt, warum man sie bekommt');

/* ── 3) Beim Veröffentlichen ── */
const beim = fg.slice(fg.indexOf('if (published) {'), fg.indexOf('async function notifyPruefer'));
ok(/zielgruppeBekanntgabeDialog\(p, ziel/.test(beim), 'Beim Veröffentlichen wird gefragt, nicht einfach verschickt');
ok(/dokumentName: att \? att\.name : ''/.test(beim), 'Der Dialog weiß, ob das Dokument anhängt');

/* Der Dialog selbst: Empfänger, Anhang, Vorschau, Ausstieg */
const dlg = fg.slice(fg.indexOf('function zielgruppeBekanntgabeDialog'),
  fg.indexOf('async function notifyZielgruppe'));
ok(/Geht an/.test(dlg) && /ziel\.adressen\.map\(a => chip/.test(dlg), 'Er zeigt die Verteiler als Empfänger');
ok(/Zielgruppe/.test(dlg) && /Alle Mitarbeitenden/.test(dlg), 'Und die Zielgruppen im Klartext');
ok(/kein Verteiler/.test(dlg) && /col-warning/.test(dlg), 'Fehlende Verteiler stehen als Warnung darin');
ok(/So sieht die Nachricht aus/.test(dlg) && /_zielgruppeMailHtml\(p\)/.test(dlg),
  'Die fertige Mail lässt sich vorher ansehen');
ok(/Betreff: <b>Neues Regelwerk/.test(dlg), 'Samt Betreff');
ok(/Kenntnisnahme <b>und<\/b> Wissenstest/.test(dlg), 'Er sagt, was die Empfänger erledigen müssen');
ok(/Bereits bekanntgegeben am/.test(dlg), 'Beim zweiten Mal steht dabei, wann sie schon lief');
ok(/bgEntscheiden\(false\)/.test(dlg) && /bgEntscheiden\(true\)/.test(dlg), 'Zwei klare Ausgänge');
ok(/o\.nachtraeglich \? 'Abbrechen' : 'Später'/.test(dlg), 'Und lässt sich vertagen');
ok(/function bgEntscheiden/.test(fg) && /_bgAntwort = null;/.test(fg),
  'Die Antwort läuft über eine Zusage, die genau einmal eingelöst wird');
ok(/Für die Bekanntgabe fehlt ein Verteiler/.test(beim), 'Fehlt ein Verteiler, wird darauf hingewiesen');
ok(/Eine reine Korrekturversion muss nicht/.test(beim), 'Der Quelltext sagt, warum nicht automatisch verschickt wird');

/* ── 4) Nachträglich und wiederholbar ── */
ok(/async function zielgruppeInformieren\(id\)/.test(fg), 'Die Bekanntgabe lässt sich nachholen');
ok(/nachtraeglich: true/.test(fg), 'Die nachträgliche Bekanntgabe nutzt denselben Dialog');
ok(/zielgruppeInformierenAktuell\(\)/.test(adm) && /📣 Zielgruppe informieren/.test(adm),
  'Im Dashboard gibt es dafür einen Knopf');
ok(/historieAdd\(p, 'Zielgruppe informiert'/.test(fg), 'Die Bekanntgabe steht in der Historie');
ok(/Bekanntgabe der Veröffentlichung an: \$\{adressen\.join\(', '\)\}/.test(fg), 'Samt Empfängern');
ok(/\{ feld: 'bekanntgabeAm',/.test(lies('js/sharepoint.js')), 'Der Zeitpunkt wird mitgeführt');

/* ── 5) Pflege ── */
ok(/Verteiler je Zielgruppe \(Bekanntgabe\)/.test(eins), 'Die Einstellungen haben eine eigene Karte');
ok(/function renderZielgruppenMails/.test(eins) && /renderZielgruppenMails\(\);/.test(eins), 'Sie wird gezeichnet');
ok(/function zgMailSet/.test(eins), 'Adressen lassen sich eintragen');
ok(/Alle Mitarbeitenden/.test(eins), '„Alle" steht als eigene Zeile oben');
ok(/list="cfg-eigene-gruppen"/.test(eins) && /State\.myGroups\) \|\| \[\]\)\.filter\(g => g\.mail\)/.test(eins),
  'Die eigenen Gruppen werden als Vorschlag angeboten – spart Tippfehler');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
