/**
 * Ein Klick aus der Mail – und zwar wirklich einer.
 *
 * Der Ein-Klick-Link funktionierte, aber davor stand die Anmeldung: Outlook öffnet
 * einen neuen Tab, und mit `sessionStorage` war dort kein Konto bekannt. Also erst
 * die Microsoft-Seite, womöglich mit Kontoauswahl – von „ein Klick" keine Rede.
 *
 * Drei Dinge zusammen lösen das: ein über Tabs geteilter Konto-Cache, der Adressat
 * als Anmelde-Hinweis im Link (`?u=`) und Entscheidungs-Mails im Einzelversand,
 * damit jeder seinen eigenen Link bekommt. Der Hinweis ist zugleich die Sicherung:
 * Liegen mehrere Konten im Browser, darf die Freigabe nicht unter einem fremden
 * Namen landen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const auth = lies('js/auth.js');
const fg = lies('js/freigaben.js');
const cron = lies('scripts/erinnerungen.mjs');

/* ── 1) Konto-Cache über Tabs hinweg ── */
ok(/cacheLocation:\s*'localStorage'/.test(auth), 'Der Konto-Cache gilt für den ganzen Browser, nicht für einen Tab');
ok(!/cacheLocation:\s*'sessionStorage'/.test(auth), 'sessionStorage ist raus – dort war jeder Mail-Klick ein Fremder');
ok(/Ein Klick aus Outlook öffnet einen NEUEN/.test(auth), 'Mit Begründung im Quelltext');
ok(/Preis: Die Anmeldung überlebt das Schließen des Browsers/.test(auth),
  'Und mit dem Preis dafür – an einem geteilten Rechner bleibt das Konto angemeldet');

/* ── 2) Der Anmelde-Hinweis aus dem Link ── */
const konten = [];
let aktiv = null;
const spur = {};
const el = () => ({ style: {}, textContent: '' });
const ctx = {
  console, URLSearchParams,
  location: { origin: 'https://rms.dihag.de', pathname: '/', search: '', href: '', replace: (u) => { spur.replace = u; } },
  document: { getElementById: () => el() },
  msal: {
    PublicClientApplication: function (cfg) {
      spur.cfg = cfg;
      return {
        handleRedirectPromise: async () => null,
        getAllAccounts: () => konten,
        getActiveAccount: () => aktiv,
        setActiveAccount: (a) => { spur.aktiv = a; },
        ssoSilent: async (o) => { spur.sso = o; throw new Error('kein stiller Weg'); },
        loginRedirect: async (o) => { spur.login = o; },
      };
    },
    InteractionRequiredAuthError: class {},
  },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(auth, ctx);
const w = (a) => vm.runInContext(a, ctx);
const setSuche = (s) => { ctx.location.search = s; };

setSuche('?richtlinie=7&aktion=freigeben&t=abc&u=Chef%40dihag.com');
ok(w('getLoginHint()') === 'chef@dihag.com', 'Die Adresse aus dem Link, klein geschrieben');
setSuche('?richtlinie=7&aktion=freigeben');
ok(w('getLoginHint()') === '', 'Ohne Hinweis leer');
setSuche('?u=kein-konto');
ok(w('getLoginHint()') === '', 'Was keine Adresse ist, zählt nicht');
setSuche('?u=%3Cscript%3E@x.de');
ok(w('getLoginHint()') === '', 'Winkelklammern nicht – der Wert landet in einem onclick-Attribut');
setSuche("?u=a'%2Balert(1)%2B'@x.de");
ok(w('getLoginHint()') === '', 'Ein Anführungszeichen bräche aus genau diesem Attribut aus');
setSuche('?u=max.mustermann%2Btest@dihag-guss.de');
ok(w('getLoginHint()') === 'max.mustermann+test@dihag-guss.de', 'Übliche Adressen bleiben erlaubt');

/* ── 3) Anmeldung: erst stumm, dann mit Hinweis ── */
setSuche('?richtlinie=7&aktion=freigeben&t=abc&u=chef@dihag.com');
await ctx.authInit();
ok(spur.sso && spur.sso.loginHint === 'chef@dihag.com', 'Ohne Konto wird erst der stille Weg versucht');
ok(spur.login && spur.login.loginHint === 'chef@dihag.com',
  'Klappt der nicht, kennt die Anmeldeseite wenigstens das Konto – keine Auswahl');
ok(!spur.login.prompt, 'Und fragt nicht zusätzlich nach („select_account")');

/* Mehrere Konten im Browser: der Adressat des Links gewinnt. */
konten.push({ username: 'Assistenz@dihag.com' }, { username: 'chef@dihag.com' });
aktiv = konten[0];
w('_account = null;');
await ctx.authInit();
ok(ctx.getAuthUser().username === 'chef@dihag.com',
  'Bei mehreren Konten entscheidet der Adressat, nicht das zuletzt benutzte');

setSuche('?ansicht=freigaben');
w('_account = null;');
await ctx.authInit();
ok(ctx.getAuthUser().username === 'Assistenz@dihag.com', 'Ohne Hinweis bleibt es beim aktiven Konto');

/* Kontowechsel von Hand */
w("_msal = { loginRedirect: (o) => { globalThis.__lr = o; } };");
w("authAnmeldenAls('chef@dihag.com')");
ok(ctx.__lr.loginHint === 'chef@dihag.com' && !ctx.__lr.prompt, 'Bewusster Wechsel: direkt auf das genannte Konto');
w("authAnmeldenAls('')");
ok(ctx.__lr.prompt === 'select_account', 'Ohne Angabe die Kontoauswahl');

/* ── 4) Die Mail trägt den Adressaten ── */
ok(/function _wfMailHtml\(headline, p, text, attachmentName, phase, empfaenger\)/.test(fg),
  'Die Workflow-Mail kennt ihren Empfänger');
ok(/`&u=\$\{encodeURIComponent\(String\(empfaenger\)\.trim\(\)\)\}`/.test(fg), 'Und hängt ihn an die Aktions-Links');
ok(/const act = \(a\) => `\$\{url\}&aktion=\$\{a\}\$\{tok\}\$\{hint\}`/.test(fg), 'Token und Hinweis stehen zusammen im Link');
const np = fg.slice(fg.indexOf('async function notifyPruefer'), fg.indexOf('async function notifyGL'));
ok(/for \(const empf of pruefer\)/.test(np) && /spSendMail\(\[empf\]/.test(np),
  'Prüfer bekommen Einzelmails – sonst gäbe es keinen persönlichen Link');
ok(/'pruefung', empf\)/.test(np), 'Mit dem Empfänger in der Vorlage');
ok(/if \(!sent\) throw new Error/.test(np), 'Erreicht keine einzige Mail jemanden, ist das ein Fehler');
const ng = fg.slice(fg.indexOf('async function notifyGL'), fg.indexOf('/* ── Mitbestimmung'));
ok(/for \(const empf of gl\)/.test(ng) && /'freigabe', empf\)/.test(ng), 'Die Geschäftsleitung ebenso');

/* ── 5) Fremder Link: nicht unter falschem Namen entscheiden ── */
const ek = fg.slice(fg.indexOf('async function einKlickAktion'), fg.indexOf('/** Fehlklick zurücknehmen'));
ok(/async function einKlickAktion\(id, aktion, token, adressatAusLink\)/.test(fg),
  'Die Landung bekommt den Adressaten übergeben');
ok(/String\(adressatAusLink \|\| ''\)\.trim\(\)\.toLowerCase\(\)/.test(ek) && /getLoginHint\(\) : ''/.test(ek),
  'Aus demselben Parametersatz wie der Rest – mit der URL als Rückfall');
ok(/einKlickAktion\(deepId, aktion, token, params\.get\('u'\) \|\| ''\)/.test(lies('js/app.js')),
  'Denn nach einem Login-Redirect steht die Ursprungs-URL nur noch dort');
ok(/sessionStorage\.getItem\('rms_deeplink'\)/.test(auth),
  'Auch die Anmeldung greift auf den gesicherten Deeplink zurück');
ok(/if \(adressat && ich && adressat !== ich\)/.test(ek), 'Und vergleicht ihn mit dem angemeldeten Konto');
ok(/Dieser Link war an jemand anderen adressiert/.test(ek), 'Passt es nicht, wird nichts gespeichert');
ok(/authAnmeldenAls\('\$\{esc\(adressat\)\}'\)/.test(ek), 'Sondern der Wechsel angeboten');
ok(/Vertretung/.test(ek), 'Mit dem Hinweis auf die Vertretung – dafür gibt es den richtigen Weg');
ok(ek.indexOf('const adressat') < ek.indexOf('await markFreigabe'), 'Die Prüfung steht vor der Entscheidung');

/* ── 6) Auch die Erinnerungen aus dem Cron ── */
const ctx2 = { console, encodeURIComponent };
ctx2.globalThis = ctx2;
vm.createContext(ctx2);
vm.runInContext("var APP_URL = 'https://rms.dihag.de/';", ctx2);
vm.runInContext(cron.slice(cron.indexOf('function policyLink'), cron.indexOf('/** Geltungsbereich als Text')), ctx2);
const link = (a, t, e) => vm.runInContext(`policyLink('7', ${JSON.stringify(a)}, ${JSON.stringify(t)}, ${JSON.stringify(e)})`, ctx2);
ok(link('freigeben', 'tok', 'chef@dihag.com').includes('&u=chef%40dihag.com'), 'Der Erinnerungs-Link nennt den Adressaten');
ok(!link('', '', '').includes('&u='), 'Der reine Öffnen-Link nicht – dort gibt es nichts zu entscheiden');
ok(!link('freigeben', 'tok', '').includes('&u='), 'Ohne Empfänger bleibt er weg');
ok(/for \(const empf of pending\)/.test(cron) && /sendMail\(\[empf\]/.test(cron),
  'Der Cron schreibt jeden Ausstehenden einzeln an');
ok(/if \(eskaliert && await sendMail\(\[eskalationMail\]/.test(cron) && /bau\(''\)/.test(cron),
  'Die Eskalation geht weiterhin raus – ohne persönlichen Link, sie entscheidet ja nicht');
ok(!/const to = eskaliert \? \[\.\.\.pending, eskalationMail\] : pending/.test(cron),
  'Die Sammelmail an alle ist raus');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
