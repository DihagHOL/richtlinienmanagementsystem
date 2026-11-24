/**
 * Gast-Dienst (gast-api/src/kern.js): Token prüfen, Kurs filtern, Bestätigungen prüfen
 *
 * Anlass (20.11.2026): Gäste der Gienanth-Schulung bekommen über Graph keinen verlässlichen
 * Zugriff auf SharePoint. Der Gast-Dienst liest und schreibt für sie, nur das Nötigste. Hier wird
 * geprüft, dass er nur echte Token des RMS von Gästen der freigegebenen Mandanten annimmt, nur
 * freigegebene Beiträge ausliefert und nur eigene Bestätigungen schreibt.
 */
import { createRequire } from 'module';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const kern = require('../gast-api/src/kern.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const TENANT = '11111111-1111-1111-1111-111111111111';
const HEIMAT = '22222222-2222-2222-2222-222222222222';
const CLIENT = '33333333-3333-3333-3333-333333333333';
const e = kern.einstellungen({ GAST_TENANT: TENANT, GAST_CLIENT_ID: CLIENT, GAST_HEIMAT: HEIMAT, GAST_TEST_OIDS: 'aaaa-test',
  GAST_BEITRAEGE: 'start-phishing-kurs' });

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const fremd = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jetzt = Math.floor(Date.now() / 1000);
function token(claims, opt = {}) {
  const kopf = { alg: 'RS256', typ: 'JWT', kid: opt.kid || 'k1' };
  const c = Object.assign({ tid: TENANT, iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, aud: CLIENT, scp: 'Gast.Kurs',
    exp: jetzt + 3600, nbf: jetzt - 10, oid: 'b0b0', idp: `https://sts.windows.net/${HEIMAT}/`,
    preferred_username: 'Gast.Muster@gast.example', name: 'Muster, Gast' }, claims);
  const daten = b64(kopf) + '.' + b64(c);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(daten), opt.schluessel || privateKey).toString('base64url');
  return daten + '.' + sig;
}
const finde = async kid => (kid === 'k1' ? jwk : null);
const pruefe = async (t) => { try { return { nutzer: await kern.tokenPruefen(t, e, finde) }; } catch (x) { return { status: x.status, text: x.message }; } };

// 1) Token
let r = await pruefe(token({}));
ok(r.nutzer && r.nutzer.upn === 'gast.muster@gast.example' && r.nutzer.name === 'Muster, Gast', 'Gast der freigegebenen Gesellschaft angenommen, Adresse klein');
ok((await pruefe(token({ aud: `api://${CLIENT}` }))).nutzer, 'Zielgruppe api://<Client> geht auch');
ok((await pruefe(token({ iss: `https://sts.windows.net/${TENANT}/` }))).nutzer, 'Aussteller der v1-Token geht auch');
ok((await pruefe(token({}, { schluessel: fremd }))).status === 401, 'falsche Signatur: 401');
ok((await pruefe(token({}, { kid: 'k9' }))).status === 401, 'unbekannter Schlüssel: 401');
ok((await pruefe(token({ exp: jetzt - 600 }))).status === 401, 'abgelaufen: 401');
ok((await pruefe(token({ aud: 'https://graph.microsoft.com' }))).status === 401, 'Graph-Token: 401');
ok((await pruefe(token({ tid: HEIMAT }))).status === 401, 'anderer Mandant: 401');
ok((await pruefe(token({ iss: 'https://login.microsoftonline.com/common/v2.0' }))).status === 401, 'anderer Aussteller: 401');
ok((await pruefe(token({ scp: 'User.Read' }))).status === 403, 'ohne Gast.Kurs: 403');
ok((await pruefe(token({ idp: undefined }))).status === 403, 'Mitarbeitende (ohne idp): 403');
ok((await pruefe(token({ idp: 'https://sts.windows.net/44444444-4444-4444-4444-444444444444/' }))).status === 403, 'Gast eines anderen Mandanten: 403');
ok((await pruefe(token({ idp: undefined, oid: 'AAAA-TEST' }))).nutzer, 'freigegebene Test-Kennung geht ohne Gast-Status');
ok((await pruefe(token({ preferred_username: undefined }))).status === 403, 'ohne Adresse: 403');
ok((await pruefe('kein.token')).status === 401, 'unlesbar: 401');
ok((await pruefe(token({ alg: 'none' }).replace(/^[^.]+/, b64({ alg: 'none', kid: 'k1' })))).status === 401, 'alg none: 401');

// 2) Kurs filtern
const wissen = { version: 1,
  themen: [{ id: 'phishing', titel: 'Phishing' }, { id: 'intern', titel: 'Intern' }],
  beitraege: [
    { id: 'start-phishing-kurs', art: 'kurs', thema: 'phishing', aktiv: true, erstelltVon: 'a@dihag.example', geaendertVon: 'b@dihag.example', module: [{ id: 'm1' }] },
    { id: 'intern-1', art: 'artikel', thema: 'intern', aktiv: true },
  ] };
const k = kern.kursFiltern(wissen, e);
ok(k.beitraege.length === 1 && k.beitraege[0].id === 'start-phishing-kurs', 'nur der freigegebene Beitrag');
ok(!('erstelltVon' in k.beitraege[0]) && !('geaendertVon' in k.beitraege[0]) && k.beitraege[0].module.length === 1, 'ohne Bearbeiter, Module bleiben');
ok(k.themen.length === 1 && k.themen[0].id === 'phishing', 'nur das Thema des Beitrags');
ok(kern.kursFiltern(Object.assign({}, wissen, { beitraege: [Object.assign({}, wissen.beitraege[0], { aktiv: false })] }), e).beitraege.length === 0, 'inaktiv: nichts');

// 3) Bestätigung prüfen
const nutzer = { upn: 'gast.muster@gast.example', name: 'Muster, Gast' };
const spalten = ['Title', 'RichtlinieId', 'RichtlinienVersion', 'BenutzerUPN', 'BenutzerName', 'GelesenAm', 'QuizBestanden', 'QuizScore', 'QuizVersuche', 'AbgeschlossenAm', 'Fortschritt'];
const a = { richtlinieId: 'wissen:start-phishing-kurs', version: '2', benutzerUpn: 'chef@dihag.example', benutzerName: 'Chef',
  gelesenAm: '2026-11-20T08:00:00.000Z', quizBestanden: true, quizScore: 80, quizVersuche: 1, abgeschlossenAm: '', fortschritt: 'm1,m2' };
const f = kern.ackFelder(a, nutzer, e, spalten).felder;
ok(f.BenutzerUPN === nutzer.upn && f.BenutzerName === nutzer.name, 'Benutzer aus dem Token, nicht aus der Anfrage');
ok(f.Title === 'gast.muster@gast.example|wissen:start-phishing-kurs|2' && f.QuizScore === 80 && f.Fortschritt === 'm1,m2', 'Felder wie im RMS');
ok(!('AbgeschlossenAm' in f), 'leeres Datum nicht senden');
ok(!('Fortschritt' in kern.ackFelder(a, nutzer, e, spalten.slice(0, -1)).felder), 'nur Spalten, die es gibt');
const fehler = x => { try { kern.ackFelder(Object.assign({}, a, x), nutzer, e, spalten); return 0; } catch (y) { return y.status; } };
ok(fehler({ richtlinieId: 'wissen:intern-1' }) === 400, 'anderer Beitrag: 400');
ok(fehler({ richtlinieId: '17' }) === 400, 'Regelwerk statt Beitrag: 400');
ok(fehler({ gelesenAm: 'gestern' }) === 400, 'kein Zeitpunkt: 400');
ok(fehler({ quizScore: 101 }) === 400, 'Ergebnis über 100: 400');
ok(kern.eintragGehoert({ fields: { BenutzerUPN: 'Gast.Muster@gast.example', RichtlinieId: 'wissen:start-phishing-kurs' } }, nutzer, 'wissen:start-phishing-kurs'), 'eigener Eintrag');
ok(!kern.eintragGehoert({ fields: { BenutzerUPN: 'jemand@gast.example', RichtlinieId: 'wissen:start-phishing-kurs' } }, nutzer, 'wissen:start-phishing-kurs'), 'fremder Eintrag');
ok(kern.odata("o'brien") === "o''brien", 'Hochkomma im Filter verdoppelt');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`); process.exit(fail ? 1 : 0);
