/**
 * Mitarbeiterliste: serverseitiger Vorfilter, Cache (Speicher + Session),
 * gemeinsame Abfrage bei parallelen Aufrufern, Rückfall ohne Filter.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

/** Frischer Kontext mit steuerbarem Graph-Stub. */
function neuerKontext(opts = {}) {
  const store = {};
  const calls = [];
  const ctx = {
    console: { log() {}, warn() {}, info() {}, error() {} },
    JSON, Date, Array, Object, String, Number, encodeURIComponent, setTimeout,
    location: { origin: '', pathname: '' },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { if (opts.sessionKaputt) throw new Error('voll'); store[k] = v; },
      removeItem: (k) => { delete store[k]; },
    },
    acquireToken: async () => 'token',
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    __calls: calls, __store: store,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + '/js/sharepoint.js', 'utf8'), ctx);
  // _get durch Stub ersetzen (nach dem Laden, damit die echte Definition überschrieben wird)
  vm.runInContext(`
    _get = async (url) => {
      __calls.push(url);
      if (${opts.filterFehler ? 'true' : 'false'} && url.includes('$filter=')) throw new Error('Filter nicht erlaubt');
      return { value: [
        { displayName: 'Anna Admin', mail: 'anna@dihag.com', userPrincipalName: 'anna@dihag.com', accountEnabled: true, userType: 'Member', department: 'IT' },
        { displayName: 'Gast Extern', mail: 'gast@extern.de', userPrincipalName: 'gast@extern.de', accountEnabled: true, userType: 'Guest', department: '' },
        { displayName: 'Bernd Gesperrt', mail: 'bernd@dihag.com', userPrincipalName: 'bernd@dihag.com', accountEnabled: false, userType: 'Member', department: '' },
        { displayName: 'Carla Ohne Postfach', mail: null, userPrincipalName: 'carla@dihag.com', accountEnabled: true, userType: 'Member', department: '' },
      ] };
    };
  `, ctx);
  return ctx;
}

/* ── 1) Serverseitiger Vorfilter ── */
let ctx = neuerKontext();
let list = await vm.runInContext('spGetMembers()', ctx);
ok(ctx.__calls.length === 1, `Eine Abfrage für den ersten Aufruf (ist ${ctx.__calls.length})`);
ok(/\$filter=/.test(ctx.__calls[0]), 'Abfrage filtert serverseitig vor');
ok(/accountEnabled/.test(decodeURIComponent(ctx.__calls[0])) && /userType/.test(decodeURIComponent(ctx.__calls[0])),
  'Vorfilter schließt gesperrte Konten und Gäste aus');
ok(/\$top=999/.test(ctx.__calls[0]), 'Größte Seitengröße wird genutzt');

/* ── 2) Clientseitige Absicherung ── */
ok(list.length === 1 && list[0].upn === 'anna@dihag.com',
  `Nur aktive Mitglieder mit Postfach (ist ${list.map(u => u.upn).join(', ') || 'leer'})`);
ok(list[0].department === 'IT', 'Abteilung wird übernommen');

/* ── 3) Speicher-Cache ── */
await vm.runInContext('spGetMembers()', ctx);
await vm.runInContext('spGetMembers()', ctx);
ok(ctx.__calls.length === 1, `Weitere Aufrufe nutzen den Cache (Abfragen: ${ctx.__calls.length})`);

/* ── 4) Session-Cache übersteht einen „Reload" ── */
const gespeichert = ctx.__store['rms_members_v1'];
ok(!!gespeichert && JSON.parse(gespeichert).list.length === 1, 'Liste liegt in sessionStorage');

const ctx2 = neuerKontext();
ctx2.__store['rms_members_v1'] = gespeichert;              // wie nach einem Reload
const list2 = await vm.runInContext('spGetMembers()', ctx2);
ok(ctx2.__calls.length === 0, 'Nach Reload keine Abfrage nötig (Session-Cache)');
ok(list2.length === 1 && list2[0].upn === 'anna@dihag.com', 'Session-Cache liefert dieselbe Liste');

/* ── 5) Abgelaufener Session-Cache wird ignoriert ── */
const ctx3 = neuerKontext();
const alt = JSON.parse(gespeichert); alt.at = Date.now() - (31 * 60 * 1000);
ctx3.__store['rms_members_v1'] = JSON.stringify(alt);
await vm.runInContext('spGetMembers()', ctx3);
ok(ctx3.__calls.length === 1, 'Abgelaufener Cache (31 Min.) wird neu geladen');

/* ── 6) Parallele Aufrufer teilen EINE Abfrage ── */
const ctx4 = neuerKontext();
const [a, b, c] = await vm.runInContext('Promise.all([spGetMembers(), spGetMembers(), spGetMembers()])', ctx4);
ok(ctx4.__calls.length === 1, `Drei gleichzeitige Aufrufe = eine Abfrage (ist ${ctx4.__calls.length})`);
ok(a.length === 1 && b.length === 1 && c.length === 1, 'Alle Aufrufer erhalten die Liste');

/* ── 7) Cache verwerfen ── */
await vm.runInContext('spInvalidateMembers()', ctx4);
ok(!ctx4.__store['rms_members_v1'], 'spInvalidateMembers räumt auch die Session');
await vm.runInContext('spGetMembers()', ctx4);
ok(ctx4.__calls.length === 2, 'Nach dem Verwerfen wird neu geladen');

/* ── 8) Rückfall, wenn der Mandant den Filter ablehnt ── */
const ctx5 = neuerKontext({ filterFehler: true });
const list5 = await vm.runInContext('spGetMembers()', ctx5);
ok(ctx5.__calls.length === 2, 'Erst mit Filter, dann ohne (Rückfall)');
ok(!/\$filter=/.test(ctx5.__calls[1]), 'Zweiter Versuch läuft ohne Filter');
ok(list5.length === 1 && list5[0].upn === 'anna@dihag.com', 'Ungefiltert wird clientseitig korrekt gefiltert');

/* ── 9) Gesperrter sessionStorage darf nicht stören ── */
const ctx6 = neuerKontext({ sessionKaputt: true });
const list6 = await vm.runInContext('spGetMembers()', ctx6);
ok(list6.length === 1, 'Liste kommt auch ohne nutzbaren sessionStorage');

/* ── 10) Verdrahtung ── */
const appjs = fs.readFileSync(ROOT + '/js/app.js', 'utf8');
ok(/spInvalidateMembers\(\)/.test(appjs) && /AdminState\.members = null/.test(appjs),
  '„Aktualisieren" verwirft die Mitarbeiterliste');
const shp = fs.readFileSync(ROOT + '/js/sharepoint.js', 'utf8');
ok(/const MEMBERS_TTL = 30 \* 60 \* 1000/.test(shp), 'Cache läuft nach 30 Minuten ab');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
