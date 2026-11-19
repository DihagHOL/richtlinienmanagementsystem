/**
 * Gäste in „Wissen": Leserecht nur auf wissen.json
 *
 * Anlass (19.11.2026): Die Gienanth-Gäste der Phishing-Schulung sollen die
 * Bibliothek lesen, aber nicht die Bibliothek „Dokumente" der Site IT. Wer
 * nur einzelne Dateien darf, sieht die Bibliothek nicht in der Liste der
 * Laufwerke, oder Graph weist die Abfrage ab. Der Start darf daran nicht
 * scheitern, und wissen.json kommt dann über das Standardlaufwerk der Site.
 * Für alle anderen bleibt der Weg über die Kennung der Bibliothek.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

function seite(drivesStatus) {
  const gerufen = [];
  const antwort = (status, body) => ({
    ok: status >= 200 && status < 300, status,
    headers: { get: () => null },
    json: async () => body, text: async () => JSON.stringify(body),
  });
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, JSON, Date, Array, Object, String, Math, Set, Map, Promise, RegExp, Number,
    encodeURIComponent, setTimeout, TextEncoder,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
    window: {},
    acquireToken: async () => 'tok',
    fetch: async (url) => {
      const u = decodeURIComponent(String(url));
      gerufen.push(u);
      if (/\/sites\/dihag\.sharepoint\.com:\/sites\/IT$/.test(u)) return antwort(200, { id: 'S1' });
      if (/\/sites\/S1\/lists\?\$filter=displayName eq 'Richtlinien'/.test(u)) return antwort(200, { value: [{ id: 'L1' }] });
      if (/\/sites\/S1\/lists\?\$filter=displayName eq 'Bestaetigungen'/.test(u)) return antwort(200, { value: [{ id: 'L2' }] });
      if (/\/sites\/S1\/drives$/.test(u)) return drivesStatus === 200 ? antwort(200, { value: [{ id: 'D1', name: 'Dokumente' }] }) : antwort(drivesStatus, { error: { code: 'accessDenied' } });
      if (/\/columns/.test(u)) return antwort(200, { value: [] });
      if (/root:\/Richtlinienmanagement\/wissen\.json\?\$select=lastModifiedDateTime$/.test(u)) return antwort(200, { lastModifiedDateTime: '2026-11-19T10:00:00Z' });
      if (/root:\/Richtlinienmanagement\/wissen\.json:\/content$/.test(u)) return antwort(200, { version: 1, themen: [], beitraege: [{ id: 'start-phishing-kurs', art: 'kurs' }] });
      return antwort(404, { error: { code: 'itemNotFound' } });
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(lies('js/sharepoint.js'), ctx);
  return { ctx, gerufen };
}

/* Gast: Die Laufwerke sind ihm verwehrt. */
for (const status of [403, 401]) {
  const { ctx, gerufen } = seite(status);
  let fehler = '';
  try { await vm.runInContext('spInit()', ctx); } catch (e) { fehler = e.message; }
  ok(!fehler && vm.runInContext('_sp.ready && !_sp.appDriveId && _sp.appSiteId === "S1"', ctx),
    `Laufwerke mit ${status} abgewiesen: Der Start geht weiter, ohne Bibliothek`);
  const w = await vm.runInContext('spLoadWissen()', ctx);
  ok(w.daten.beitraege.length === 1 && w.geaendertAm === '2026-11-19T10:00:00Z',
    'wissen.json kommt trotzdem, mit Inhalt und Änderungsstempel');
  ok(gerufen.some(u => u.includes('/sites/S1/drive/root:/Richtlinienmanagement/wissen.json:/content')),
    'gelesen über das Standardlaufwerk der Site');
}

/* Mitarbeitende: alles wie bisher, über die Kennung der Bibliothek. */
{
  const { ctx, gerufen } = seite(200);
  await vm.runInContext('spInit()', ctx);
  ok(vm.runInContext('_sp.appDriveId', ctx) === 'D1', 'Mit Zugriff auf die Bibliothek steht ihre Kennung fest');
  await vm.runInContext('spLoadWissen()', ctx);
  ok(gerufen.some(u => u.includes('/drives/D1/root:/Richtlinienmanagement/wissen.json:/content'))
    && !gerufen.some(u => u.includes('/sites/S1/drive/root:')), 'und wissen.json kommt wie bisher über sie');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`); process.exit(fail ? 1 : 0);
