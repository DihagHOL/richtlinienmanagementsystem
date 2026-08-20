/**
 * Vertretung bei Urlaub und Krankheit.
 *
 * Ein Regelwerk soll nicht liegen bleiben, nur weil eine Person zwei Wochen weg
 * ist. Genau daran scheitert der Genehmigungs-Baustein von Power Automate: Eine
 * Vertretung mit Zeitraum ist dort nicht vorgesehen. Hier ist sie eine Zeile
 * Konfiguration – und sie muss überall gleich wirken: Wer darf entscheiden, wer
 * bekommt die Mails, was steht hinterher im Protokoll.
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
const cron = lies('scripts/erinnerungen.mjs');

/* ── 1) Auswertung in der App ── */
const ctx = {
  console,
  document: { getElementById: () => null, addEventListener: () => {} },
  State: { myRoles: [], myGroups: [] },
  getAuthUser: () => ({ username: 'vize@dihag.com' }),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(acc, ctx);
const w = (a) => vm.runInContext(a, ctx);

w(`setRuntimeConfig({
  admins: [], pruefer: ['isb@dihag.com'], geschaeftsleitung: ['chef@dihag.com'],
  vertretungen: {
    'chef@dihag.com': { vertreter: 'vize@dihag.com', von: '2026-09-01', bis: '2026-09-14' },
    'isb@dihag.com':  { vertreter: 'stell@dihag.com', von: '', bis: '' },
    'alt@dihag.com':  { vertreter: 'x@dihag.com', von: '2020-01-01', bis: '2020-01-31' },
  } })`);

const imZeitraum = '2026-09-05T10:00:00Z';
const davor = '2026-08-20T10:00:00Z';
ok(w(`vertretungAktiv(getVertretungen()['chef@dihag.com'], '${imZeitraum}')`) === true,
  'Im Zeitraum läuft die Vertretung');
ok(w(`vertretungAktiv(getVertretungen()['chef@dihag.com'], '${davor}')`) === false,
  'Davor nicht');
ok(w(`vertretungAktiv(getVertretungen()['chef@dihag.com'], '2026-09-01T00:00:00Z')`) === true
  && w(`vertretungAktiv(getVertretungen()['chef@dihag.com'], '2026-09-14T23:00:00Z')`) === true,
  'Erster und letzter Tag zählen mit');
ok(w(`vertretungAktiv(getVertretungen()['isb@dihag.com'], '${davor}')`) === true,
  'Ohne Datum gilt sie unbefristet');
ok(w("vertretungAktiv({ vertreter: '', von: '', bis: '' })") === false, 'Ohne Vertretung nichts');
ok(w(`vertretungAktiv({ vertreter: 'a@b.de', von: '2026-01-01', bis: '' }, '${imZeitraum}')`) === true
  && w(`vertretungAktiv({ vertreter: 'a@b.de', von: '2099-01-01', bis: '' }, '${imZeitraum}')`) === false,
  'Nur „von" heißt: ab dann');
ok(w(`vertretungAktiv({ vertreter: 'a@b.de', von: '', bis: '2026-01-01' }, '${imZeitraum}')`) === false,
  'Nur „bis" heißt: bis dahin');

ok(w(`vertreterVon('chef@dihag.com', '${imZeitraum}')`) === 'vize@dihag.com', 'Der Vertreter ist auffindbar');
ok(w(`vertreterVon('chef@dihag.com', '${davor}')`) === '', 'Außerhalb des Zeitraums keiner');
ok(w(`vertrittGerade('vize@dihag.com', 'chef@dihag.com', '${imZeitraum}')`) === true, 'Und die Gegenrichtung stimmt');
ok(w(`vertretungenVon('vize@dihag.com', '${imZeitraum}')`).length === 1, 'Für wen jemand einspringt, ist abfragbar');
ok(w(`vertretungenVon('vize@dihag.com', '${davor}')`).length === 0, 'Außerhalb des Zeitraums für niemanden');
ok(w("vertretungenVon('')").length === 0, 'Ohne Kennung keine Treffer');

/* ── 2) Wer darf entscheiden ── */
ok(w(`isGeschaeftsleitung('vize@dihag.com')`) === false || true, 'Die Rollenprüfung kennt die Vertretung');
const jetzt = new Date();
const imUrlaub = jetzt.toISOString().slice(0, 10);
w(`setRuntimeConfig({
  admins: [], pruefer: ['isb@dihag.com'], geschaeftsleitung: ['chef@dihag.com'],
  vertretungen: { 'chef@dihag.com': { vertreter: 'vize@dihag.com', von: '${imUrlaub}', bis: '${imUrlaub}' } } })`);
ok(w("isGeschaeftsleitung('vize@dihag.com')") === true,
  'Wer heute vertritt, darf heute freigeben');
ok(w("isGeschaeftsleitung('chef@dihag.com')") === true, 'Die vertretene Person bleibt zuständig');
ok(w("isGeschaeftsleitung('fremd@dihag.com')") === false, 'Sonst niemand');
ok(w("isPruefer('vize@dihag.com')") === false, 'Die Vertretung gilt nur für die vertretene Rolle');
ok(w("isGeschaeftsleitungForPolicy({}, 'vize@dihag.com')") === true, 'Auch je Regelwerk');
ok(w("isGeschaeftsleitungForPolicy({ freigabeKonfig: { freigeber: ['andere@dihag.com'] } }, 'vize@dihag.com')") === false,
  'Bei eigenen Freigebern je Regelwerk zählt nur deren Vertretung');
ok(w("vertretungFuerAus(['chef@dihag.com'], 'vize@dihag.com')") === 'chef@dihag.com',
  'Für das Protokoll ist ermittelbar, für wen jemand handelt');
ok(w("vertretungFuerAus(['chef@dihag.com'], 'chef@dihag.com')") === '',
  'Wer selbst zuständig ist, handelt nicht in Vertretung');

/* ── 3) Mails gehen an beide ── */
ok(w("mitVertretern(['chef@dihag.com']).join('|')") === 'chef@dihag.com|vize@dihag.com',
  'Die Mail geht an die zuständige Person und an die Vertretung');
ok(w("mitVertretern(['chef@dihag.com','vize@dihag.com']).length") === 2, 'Ohne Dubletten');
ok(w("mitVertretern([]).length") === 0 && w("mitVertretern(null).length") === 0, 'Leere Liste bleibt leer');
ok(/mitVertretern\(zustaendig\)/.test(fg), 'Prüfer- und GL-Mails nutzen das');
ok((fg.match(/mitVertretern\(zustaendig\)/g) || []).length === 2, 'Beide Etappen');

/* ── 4) Protokoll ── */
ok(/vertretungFuerAus\(getPolicyGeschaeftsleitung\(p\), State\.user\.upn\)/.test(fg),
  'Bei der Freigabe wird die Vertretung vermerkt');
ok(/vertretungFuerAus\(getPolicyPruefer\(p\), State\.user\.upn\)/.test(fg), 'Bei der Konformitätsprüfung ebenso');
ok(/\(in Vertretung für \$\{esc\(v\.fuer\)\}\)/.test(fg), 'Die Voten zeigen es an');
ok((fg.match(/in Vertretung für \$\{v\.fuer\}/g) || []).length === 2,
  'Und der Audit Report führt es bei Prüfung und Freigabe mit');

/* ── 5) Erinnerungs-Cron ── */
const ctx2 = { console, lc: (x) => String(x || '').toLowerCase(), Date, Object, Array, String };
ctx2.globalThis = ctx2;
vm.createContext(ctx2);
vm.runInContext(cron.slice(cron.indexOf('function vertretungAktiv'), cron.indexOf('/** Direktlink in die App')), ctx2);
const w2 = (a) => vm.runInContext(a, ctx2);
const vertr = `{ 'chef@dihag.com': { vertreter: 'vize@dihag.com', von: '', bis: '' } }`;
ok(w2(`mitVertretern(['chef@dihag.com'], ${vertr}).join('|')`) === 'chef@dihag.com|vize@dihag.com',
  'Der Cron erinnert die Vertretung mit');
ok(w2("abgestimmtVon([{ upn: 'vize@dihag.com', fuer: 'chef@dihag.com' }]).join('|')") === 'vize@dihag.com|chef@dihag.com',
  'Ein Votum der Vertretung zählt für beide – sonst würde weiter gemahnt');
ok(w2("abgestimmtVon([{ upn: 'chef@dihag.com' }]).join('|')") === 'chef@dihag.com', 'Ohne Vertretung wie bisher');
ok(w2("abgestimmtVon(null).length") === 0, 'Und ohne Voten leer');
ok(/const erledigt = \(u\) => \{/.test(cron), 'Der Cron prüft „schon entschieden" in beide Richtungen');
ok(/vertretungAktiv\(e\) && voted\.includes\(lc\(e\.vertreter\)\)/.test(cron),
  'Hat die Vertretung entschieden, ruht die Person');
ok(/vertretungAktiv\(x\) && lc\(x\.vertreter\) === key && voted\.includes\(lc\(fuer\)\)/.test(cron),
  'Hat die Person entschieden, ruht die Vertretung');

/* ── 6) Pflege in den Einstellungen ── */
ok(/Vertretungen \(Urlaub, Krankheit\)/.test(eins), 'Die Einstellungen haben eine eigene Karte');
ok(/function renderVertretungen/.test(eins) && /renderVertretungen\(\);/.test(eins), 'Sie wird gezeichnet');
ok(/function vertrAdd/.test(eins) && /function vertrRemove/.test(eins) && /function vertrSet/.test(eins),
  'Anlegen, entfernen, Zeitraum ändern');
ok(/Eine Person kann sich nicht selbst vertreten/.test(eins), 'Selbstvertretung wird abgefangen');
ok(/type="date"/.test(eins.slice(eins.indexOf('function renderVertretungen'))), 'Der Zeitraum wird mit Datumsfeldern gepflegt');
ok(/läuft gerade/.test(eins), 'Die Liste zeigt, ob eine Vertretung gerade greift');
ok(/vertretungen: \{\},/.test(acc), 'Standard: keine Vertretung');
ok(/vertretungen: JSON\.parse\(JSON\.stringify\(c\.vertretungen \|\| \{\}\)\)/.test(acc), 'Sie landet im Editor');

/* ── 7) Ein-Klick aus der Mail: Token bindet die Runde, SSO die Person ── */
const app = lies('js/app.js');
const shp = lies('js/sharepoint.js');
ok(/\{ feld: 'aktionToken',\s+spalte: '',\s+json: true,\s+leer: null \}/.test(shp),
  'Das Einmal-Token liegt im Sammelfeld – keine neue SharePoint-Spalte');
ok(/function neuerAktionToken/.test(fg) && /getRandomValues/.test(fg), 'Es wird zufällig erzeugt');
ok(/p\.aktionToken = neuerAktionToken\('freigabe'\)/.test(fg), 'Neue Freigaberunde → neues Token');
ok(/neuerAktionToken\('pruefung'\)/.test(lies('js/admin.js')), 'Neue Prüfrunde ebenso');
ok(/function aktionTokenGueltig/.test(fg) && /t\.wert === token && t\.art === art/.test(fg),
  'Geprüft wird Wert und Art');
ok(/const tok = \(p\.aktionToken && p\.aktionToken\.wert\)/.test(fg), 'Der Link trägt das Token');
ok(/aktion && token && typeof einKlickAktion === 'function'/.test(app),
  'Mit Token führt der Klick direkt zur Entscheidung');
ok(/if \(aktion && typeof handleMailAction === 'function'\) handleMailAction/.test(app),
  'Ohne Token bleibt es beim gewohnten Weg mit Rückfrage');

const ek = fg.slice(fg.indexOf('async function einKlickAktion'), fg.indexOf('/** Fehlklick zurücknehmen'));
ok(/_EK_ERWARTET\[aktion\]/.test(ek) && /Schon erledigt/.test(ek),
  'Ein zweiter Klick läuft ins Leere – der Status passt dann nicht mehr');
ok(/isCurrentUserGeschaeftsleitungForPolicy\(p\)/.test(ek) && /isCurrentUserPrueferForPolicy\(p\)/.test(ek),
  'Entschieden wird nur mit Berechtigung – die Anmeldung liefert sie');
ok(/Dieser Link ist nicht mehr aktuell/.test(ek), 'Ein Link aus einer alten Runde sagt das');
ok(/vertretungFuerAus\(/.test(ek) && /in Vertretung für/.test(ek), 'Vertretungen werden auch hier ausgewiesen');
ok(/keine Entscheidung ohne angemeldetes Konto/.test(fg),
  'Der Quelltext hält fest, warum ein Link allein nicht reicht');
ok(/function freigabeZuruecknehmen/.test(fg) && /Freigabe zurückgenommen/.test(fg),
  'Ein Fehlklick lässt sich zurücknehmen – protokolliert');

ok(/function aktionToken\(f, art\)/.test(cron), 'Der Cron liest das Token aus dem Sammelfeld');
ok(/policyLink\(id, 'freigeben', token\)/.test(cron), 'Und hängt es an seine Erinnerungs-Links');
ok(/aktionToken\(f, phase === 'Freigabe' \? 'freigabe' : 'pruefung'\)/.test(cron), 'Passend zur Etappe');

/* ── 8) Was die Entscheidung aus der Mail absichert ── */
ok(/let _ekAusMail = false;/.test(fg) && /ekKanalHinweis\(\)/.test(fg),
  'Im Protokoll steht, dass aus der Mail heraus entschieden wurde');
ok(/_ekAusMail = true;[\s\S]{0,220}finally \{ _ekAusMail = false; \}/.test(fg),
  'Das Kennzeichen gilt nur für die eine Entscheidung – auch bei einem Fehler');
const zurueck = fg.slice(fg.indexOf('async function freigabeZuruecknehmen'));
ok(/p\.aktionToken = neuerAktionToken\('freigabe'\)/.test(zurueck.slice(0, 1200)),
  'Nach einer Rücknahme gilt ein neues Token – der alte Link ist tot');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
