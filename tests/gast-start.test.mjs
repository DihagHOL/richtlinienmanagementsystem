/**
 * Gäste starten ohne SharePoint (js/gast.js)
 *
 * Anlass (20.11.2026): Graph weist Gäste der Gienanth-Schulung bei SharePoint mit 401 ab. Für sie
 * startet das RMS ohne SharePoint; Kurs und eigene Bestätigungen kommen über den Gast-Dienst.
 * Geprüft: wer als Gast gilt, dass die Datenfunktionen von „Wissen“ an den Dienst gehen und dass
 * Name und Adresse nicht aus dem Browser kommen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

function seite(speicher) {
  const gerufen = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Date, Array, Object, String, Promise, Error,
    localStorage: { getItem: k => (speicher || {})[k] || null },
    _AUTH: { tenantId: 'FDB70646-0000-0000-0000-000000000000' },
    State: { user: { upn: 'gast@gast.example', name: 'Gast' } },
    document: { body: { classList: { add() {} } } },
    acquireToken: async scopes => 'tok:' + scopes.join(' '),
    initRoleNav: () => gerufen.push('nav'),
    applyDeepLinkOrDefault: async () => gerufen.push('deeplink'),
    fetch: async (url, opt) => {
      gerufen.push({ url, opt });
      const antwort = (status, body) => ({ ok: status < 300, status, json: async () => body });
      if (url.endsWith('/bestaetigungen')) return antwort(200, [{ id: '7', richtlinieId: 'wissen:start-phishing-kurs' }]);
      if (url.endsWith('/kurs')) return antwort(200, { daten: { version: 1, themen: [], beitraege: [{ id: 'start-phishing-kurs' }] }, geaendertAm: 'x' });
      if (url.endsWith('/bestaetigung')) return antwort(200, { id: '8' });
      return antwort(403, { fehler: 'Nur für Gäste der freigegebenen Gesellschaften.' });
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/gast.js'), 'utf8'), ctx);
  // Die Erkennung steht im Kern (js/app.js): nur diese Funktion übernehmen
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').split(String.fromCharCode(13)).join('');
  const start = app.indexOf('function istGastKonto(');
  vm.runInContext(app.slice(start, app.indexOf(String.fromCharCode(10) + '}', start) + 2), ctx);
  return { ctx, gerufen };
}

const { ctx, gerufen } = seite();
const modus = c => vm.runInContext(`istGastKonto(${JSON.stringify({ idTokenClaims: c })})`, ctx);
ok(modus({}) === false, 'Mitarbeitende (kein idp): kein Gast');
ok(modus({ idp: 'https://sts.windows.net/5a56a536-0000-0000-0000-000000000000/' }) === true, 'Anmeldung über anderen Mandanten: Gast');
ok(modus({ idp: 'https://sts.windows.net/fdb70646-0000-0000-0000-000000000000/' }) === false, 'eigener Mandant als idp: kein Gast');
ok(vm.runInContext('istGastKonto({ idTokenClaims: {} })', seite({ rms_gast_test: '1' }).ctx) === true, 'Test-Schalter im Speicher');

await vm.runInContext('gastStart()', ctx);
ok(vm.runInContext('spLoadWissen === gastKursLaden && spGetAcknowledgements === gastBestaetigungen && spSaveAcknowledgement === gastBestaetigungSpeichern', ctx),
  'Wissen liest und schreibt über den Gast-Dienst');
ok(vm.runInContext('State.gast && State.loaded && State.acks.length === 1', ctx), 'eigene Bestätigungen beim Start geladen');
ok(gerufen.includes('nav') && gerufen.includes('deeplink'), 'Navigation und Link wie gewohnt');
const k = await vm.runInContext('spLoadWissen()', ctx);
ok(k.daten.beitraege[0].id === 'start-phishing-kurs' && k.geaendertAm === 'x', 'Kurs aus dem Dienst');
await vm.runInContext(`spSaveAcknowledgement({ richtlinieId: 'wissen:start-phishing-kurs', version: '1', benutzerUpn: 'chef@dihag.example', benutzerName: 'Chef', quizScore: 80, fortschritt: 'm1' })`, ctx);
const post = gerufen.find(g => g.url && g.url.endsWith('/bestaetigung'));
const body = JSON.parse(post.opt.body);
ok(post.opt.method === 'POST' && /^Bearer tok:api:\/\/.+\/Gast\.Kurs$/.test(post.opt.headers.Authorization), 'POST mit Token für Gast.Kurs');
ok(!('benutzerUpn' in body) && !('benutzerName' in body) && body.fortschritt === 'm1', 'Name und Adresse gehen nicht mit, setzt der Dienst');
let fehler = '';
try { await vm.runInContext(`_gastAbruf('/anderes')`, ctx); } catch (e) { fehler = e.message; }
ok(fehler === 'Nur für Gäste der freigegebenen Gesellschaften.', 'Fehlertext des Dienstes kommt an');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`); process.exit(fail ? 1 : 0);
