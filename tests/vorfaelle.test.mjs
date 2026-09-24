/**
 * Reiter „Vorfälle & Ereignisse" – die Ansicht und ihre Verdrahtung
 *
 * Das Modell prüft `vorfallmodell.test.mjs`. Hier: die Anbindung an das
 * Ticketsystem (Liste „Tickets" auf der Site „ticket", nur lesen), die
 * Bewertung in vorfaelle.json, der Reiter mit seinen drei Abschnitten, der
 * Dialog mit Fristen, die Maßnahme im Wirksamkeits-Register – und dass
 * Cockpit, Audit Report, Einstellungen, Dokumentation und Cron es kennen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire as _requireFuerHelfer } from 'module';
const { jsArg } = _requireFuerHelfer(import.meta.url)('../js/util.js');   // echter Helfer für Inline-Handler
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Verdrahtung ── */
const html = lies('index.html');
ok(/<a class="nav-item" data-view="vorfaelle" id="nav-vorfaelle"/.test(html) && html.indexOf('id="nav-vorfaelle"') > html.indexOf('id="nav-notfall"'), 'Navigation: hinter Notfall & Krisenstab');
ok(/<section id="view-vorfaelle" class="view">[\s\S]*?<div id="vorfaelle-mount">/.test(html) && /onclick="refreshVorfaelle\(\)"/.test(html) && /NIS2 Art\. 23/.test(html), 'Ansicht mit Mount, Aktualisieren und Normbezug');
const access = lies('js/access.js');
ok(/\{ view: 'vorfaelle',\s*label: 'Vorfälle & Ereignisse'/.test(access) && /show\('nav-vorfaelle',\s*v\.vorfaelle\)/.test(access) && /v\.notfall \|\| v\.vorfaelle \|\| v\.assets/.test(access), 'Reiter-Rechte, Sichtbarkeit, Gruppen-Überschrift');
ok(/if \(view === 'vorfaelle'\s*&& typeof initVorfaelle === 'function'\)\s*initVorfaelle\(\);/.test(lies('js/app.js')) && /'notfall', 'vorfaelle', 'assets'\]\.includes\(ansicht\)/.test(lies('js/app.js')), 'switchView und Digest-Link ?ansicht=vorfaelle');
ok(/'nav-notfall', 'nav-vorfaelle'/.test(lies('js/probelauf.js')), 'Im Probelauf ausgeblendet');

const kctx = { module: { exports: {} }, document: { querySelector: () => null }, Map, Promise };
kctx.window = kctx; kctx.globalThis = kctx;
kctx.jsArg ??= jsArg; vm.createContext(kctx);
vm.runInContext(lies('js/module.js'), kctx);
const { MODUL_ADMIN, MODUL_ANSICHTEN } = kctx.module.exports;
ok(MODUL_ADMIN.includes('vorfallmodell') && !MODUL_ADMIN.includes('vorfaelle') && MODUL_ANSICHTEN.vorfaelle.includes('vorfaelle') && MODUL_ANSICHTEN.vorfaelle.includes('wirksamkeit'), 'Modell im Verwaltungsblock, Ansicht in ihrer Gruppe – mit dem Wirksamkeits-Register für die Maßnahme');
ok(MODUL_ANSICHTEN.dokumentation.includes('vorfallmodell'), 'Die Dokumentation baut aus dem Modell');

/* ── 2) Die Anbindung ── */
const sp = lies('js/sharepoint.js');
ok(/ticketSiteHost: 'dihag\.sharepoint\.com:\/sites\/ticket'/.test(sp) && /ticketList:\s*'Tickets'/.test(sp) && /vorfaelleDatei: 'vorfaelle\.json'/.test(sp), 'Quelle: Site „ticket", Liste „Tickets"; Bewertung in vorfaelle.json');
ok(/async function spGetTickets\(opt\)/.test(sp) && /async function spGetTicketsLeise/.test(sp) && /function spTicketUrl\(id\)/.test(sp) && /function spTicketListUrl\(\)/.test(sp), 'Lesen, leise lesen, Links');
ok(!/spAddTicket|spUpdateTicket|spDeleteTicket/.test(sp), 'Die App schreibt nie ins Ticketsystem');
ok(/amSelectVon\(_tk\.cols, _tkFeld, VF_ALIASE\)/.test(sp) && /\$filter=fields\/Created ge '\$\{seit\}'/.test(sp) && /HonorNonIndexedQueriesWarningMayFailRandomly/.test(sp) && /catch \(e2\) \{ items = await lade\(false, false\); \}/.test(sp),
  'Feldauswahl (Nachschlagewerte!), Zeitfilter mit Prefer-Header – und zweifacher Rückfall, wenn Graph ablehnt');
ok(/modulLaden\('vorfallmodell'\)/.test(sp) && /modulLaden\('assetmodell'\)/.test(sp), 'Die Modelle werden nachgeladen, wo sie fehlen');
ok(/async function spLoadVorfaelle\(\)/.test(sp) && /async function spSaveVorfallBewertung\(ticketId, bewertung\)/.test(sp) && /const akt = await spLoadVorfaelle\(\);/.test(sp), 'Speichern lädt erst frisch und setzt nur den einen Eintrag – zwei Beurteiler überschreiben sich nicht');

// Das Lesen im Sandkasten: Spalten wie im Ticketsystem, Filter und Auswahl in der URL, Fallback
const sctx = { console, JSON, STANDORTE: ['HOL', 'WGC', 'SHB'], module: { exports: {} }, Date, TextEncoder, Object, Array, Number, String, Math, Set, Map, Promise, encodeURIComponent };
sctx.window = sctx; sctx.globalThis = sctx; sctx.location = { origin: '', pathname: '' };
sctx.getAccessConfig = () => ({ vorfallArtZuordnung: { 'Service Request': 'change' } });
const urls = [];
sctx.fetch = async (url, opt) => {
  urls.push({ url, prefer: opt && opt.headers && opt.headers.Prefer });
  const j = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => null } });
  if (/\/sites\/dihag\.sharepoint\.com:\/sites\/ticket$/.test(url)) return j({ id: 'tsite' });
  if (/\/sites\/tsite\/lists\?/.test(url)) return j({ value: [{ id: 'tl', displayName: 'Tickets', name: 'Tickets', webUrl: 'https://dihag.sharepoint.com/sites/ticket/Lists/Tickets' }] });
  if (/\/lists\/tl\/columns/.test(url)) return j({ value: [
    { name: 'Title', displayName: 'Titel' }, { name: 'Status', displayName: 'Status', choice: { choices: ['Offen', 'In Bearbeitung', 'Erledigt'] } },
    { name: 'Priorit_x00e4_t', displayName: 'Priorität', choice: { choices: ['Niedrig', 'Mittel', 'Hoch', 'Kritisch'] } },
    { name: 'Kategorie', displayName: 'Kategorie', choice: { choices: ['Hardware', 'IT-Sicherheit', 'Datenschutz', 'Drucker'] } },
    { name: 'Art', displayName: 'Art', choice: { choices: ['Incident', 'Change', 'Doku', 'Service Request'] } },
    { name: 'Werk', displayName: 'Werk', choice: { choices: ['HOL', 'WGC', 'SHB'] } }, { name: 'Zugewiesen', displayName: 'Zugewiesen an', personOrGroup: {} },
  ] });
  if (/\/lists\/tl\/items/.test(url)) {
    if (/\$filter=/.test(url) && sctx.__filterKaputt) return { ok: false, status: 400, text: async () => 'nicht indiziert', json: async () => ({}), headers: { get: () => null } };
    return j({ value: [
      { id: 1, createdDateTime: '2026-09-10T08:00:00Z', lastModifiedDateTime: '2026-09-10T09:00:00Z', fields: { id: '1', Title: 'Phishing an Buchhaltung', Status: 'Offen', 'Priorit_x00e4_t': 'Hoch', Kategorie: 'IT-Sicherheit', Art: 'Incident', Werk: 'WGC', Zugewiesen: { LookupValue: 'IT', Email: 'it@x' } } },
      { id: 2, createdDateTime: '2026-09-01T08:00:00Z', fields: { id: '2', Title: 'Toner leer', Status: 'Erledigt', Kategorie: 'Drucker', Art: 'Incident', Werk: 'HOL' } },
      { id: 3, createdDateTime: '2026-08-20T08:00:00Z', fields: { id: '3', Title: 'Firewall-Regel', Status: 'Offen', Kategorie: 'IT-Sicherheit', Art: 'Service Request', Werk: 'HOL' } },
      { id: 4, createdDateTime: '2020-01-01T08:00:00Z', fields: { id: '4', Title: 'Uralt', Status: 'Erledigt', Kategorie: 'IT-Sicherheit', Art: 'Incident' } },
    ] });
  }
  return { ok: false, status: 404, text: async () => 'nix', json: async () => ({}), headers: { get: () => null } };
};
sctx.jsArg ??= jsArg; vm.createContext(sctx);
vm.runInContext(lies('js/assetmodell.js'), sctx);
vm.runInContext(lies('js/vorfallmodell.js'), sctx);
vm.runInContext(lies('js/sharepoint.js'), sctx);
vm.runInContext('acquireToken = async () => "tok";', sctx);
const r1 = await vm.runInContext('spGetTickets()', sctx);
ok(r1.tickets.length === 3 && !r1.tickets.some(t => t.id === '4'), 'Drei Tickets im Zeitraum – das von 2020 nicht');
ok(r1.tickets[0].id === '1' && r1.tickets[0].prio === 'Hoch' && r1.tickets[0].zugewiesen === 'it@x' && r1.tickets[0].werke.join() === 'WGC' && r1.tickets[0].url === 'https://dihag.sharepoint.com/sites/ticket/Lists/Tickets/DispForm.aspx?ID=1',
  'Neueste zuerst; Priorität (kodierte Spalte), Person, Werk, Link ins Ticketsystem');
ok(r1.tickets.find(t => t.id === '3').art === 'change', 'Die Zuordnung aus den Einstellungen: Service Request → Änderung');
ok(r1.kategorien.join() === 'Datenschutz,Drucker,Hardware,IT-Sicherheit' && r1.arten.includes('Service Request'), 'Kategorien und Arten: aus der Auswahl der Spalte und aus den Tickets');
const itemsUrl = urls.find(u => /\/lists\/tl\/items/.test(u.url));
ok(/\$expand=fields\(\$select=id,Title,Status,Priorit_x00e4_t,Kategorie,Art,Werk,Zugewiesen,ZugewiesenLookupId,Created,Modified\)/.test(itemsUrl.url) && /\$filter=fields\/Created ge '20/.test(itemsUrl.url) && itemsUrl.prefer === 'HonorNonIndexedQueriesWarningMayFailRandomly',
  'Die Abfrage: nur die Felder, die es gibt (Person samt LookupId), Zeitfilter, Prefer-Header');
sctx.__filterKaputt = true; urls.length = 0;
const r2 = await vm.runInContext('spGetTickets()', sctx);
ok(r2.tickets.length === 3 && urls.filter(u => /\/lists\/tl\/items/.test(u.url)).length === 2 && !/\$filter/.test(urls[urls.length - 1].url), 'Lehnt Graph den Filter ab (nicht indiziert): ohne Filter weiter, Zeitraum wird dann hier gefiltert');
ok(vm.runInContext('spTicketListUrl()', sctx) === 'https://dihag.sharepoint.com/sites/ticket/Lists/Tickets/AllItems.aspx', 'Die Liste im Browser');

/* ── 3) Cockpit, Report, Einstellungen, Doku, Cron, Wirksamkeit ── */
ok(/tile\('vorfaelle', '🎫', 'Vorfälle & Ereignisse',\s*'vorfaelle'\)/.test(lies('js/cockpit.js')) && /async function _ckLoadVorfaelle/.test(lies('js/cockpit.js')), 'Cockpit-Kachel');
const cl = lies('js/clevelreport.js');
ok(/m\.vorfaelle = vfKennzahlen\(/.test(cl) && /add\('ISO A\.5\.24–A\.5\.28', 'Handhabung von Informationssicherheitsvorfällen'/.test(cl) && /add\('NIS2 Art\. 23', 'Meldung erheblicher Sicherheitsvorfälle'/.test(cl) && /add\('ISO A\.8\.32', 'Änderungsmanagement/.test(cl),
  'Audit Report: A.5.24–A.5.28, NIS2 Art. 23, A.8.32');
const eins = lies('js/einstellungen.js');
ok(/seg\('vorfaelle', '🎫 Vorfälle'\)/.test(eins) && /function _vorfaelleBereichHtml/.test(eins) && /cfgVorfallKat\(/.test(eins) && /cfgVorfallArt\(/.test(eins) && /vorfallKategorien/.test(eins) && /vorfallArtZuordnung/.test(eins),
  'Einstellungen: vierter Bereich – Kategorien mit Anzahl, Art-Zuordnung');
ok(/function wirkAbweichungFuer\(herkunftId, titel, werk, beschreibung, danach\)/.test(lies('js/wirksamkeit.js')) && /quelle = 'Sicherheitsvorfall'/.test(lies('js/wirksamkeit.js')), 'Das Wirksamkeits-Register nimmt eine Maßnahme aus einem Vorfall an – Quelle Sicherheitsvorfall, Herkunft das Ticket');
const cron = lies('scripts/erinnerungen.mjs');
ok(/Vorfall-Digest/.test(cron) && /TICKET_SITE_HOST/.test(cron) && /_require\('\.\.\/js\/vorfallmodell\.js'\)/.test(cron) && /VF\.vfLuecken\(t, bewertungen\[t\.id\], \{ massnahmen \}\)/.test(cron) && /\?ansicht=vorfaelle/.test(cron) && /loadKonfigJson\(siteId, 'vorfaelle\.json'\)/.test(cron),
  'Der Cron mahnt aus demselben Ticketsystem mit demselben Modell und derselben Bewertung');

const dctx = { console, esc: (s) => String(s ?? ''), module: { exports: {} } };
dctx.window = dctx; dctx.globalThis = dctx;
dctx.jsArg ??= jsArg; vm.createContext(dctx);
vm.runInContext(lies('js/notfallmodell.js'), dctx);
vm.runInContext(lies('js/assetmodell.js'), dctx);
vm.runInContext(lies('js/vorfallmodell.js'), dctx);
vm.runInContext(lies('js/dokumentation.js'), dctx);
const doku = vm.runInContext('_dokuSections()', dctx);
const abschnitt = doku.slice(doku.indexOf('id="doku-vorfaelle"'), doku.indexOf('id="doku-ismsdocs"'));
ok(abschnitt.length > 2500 && !/\$\{/.test(abschnitt) && /Frühwarnung 24 h/.test(abschnitt) && /Nach 2 Tagen ohne Beurteilung/.test(abschnitt) && /24 Monate/.test(abschnitt), 'Der Doku-Abschnitt rendert, ohne Platzhalter, mit Zahlen aus dem Modell');

/* ── 4) Die Ansicht im Sandkasten ── */
const gemeldet = [], gespeichert = [];
let modal = null, wirkAufruf = null;
const jetzt = Date.now();
const vor = (h) => new Date(jetzt - h * 3600000).toISOString();
const tickets = [
  { id: '1', titel: 'Phishing an Buchhaltung', status: 'In Bearbeitung', prio: 'Hoch', kategorie: 'IT-Sicherheit', artRoh: 'Incident', art: 'incident', werke: ['WGC'], werkText: 'WGC', beschreibung: 'Zwei haben geklickt.', zugewiesen: 'it@x', melder: 'Max', erstellt: vor(30), geaendert: vor(1), abgeschlossen: '', url: 'https://t/1', offen: true },
  { id: '2', titel: 'Unbekannter USB-Stick', status: 'Offen', prio: 'Mittel', kategorie: 'IT-Sicherheit', artRoh: 'Incident', art: 'incident', werke: ['HOL'], werkText: 'HOL', beschreibung: '', zugewiesen: '', melder: '', erstellt: vor(24 * 5), geaendert: '', abgeschlossen: '', url: 'https://t/2', offen: true },
  { id: '3', titel: 'Firewall-Regel', status: 'Offen', prio: '', kategorie: 'IT-Sicherheit', artRoh: 'Change', art: 'change', werke: [], werkText: '', beschreibung: '', zugewiesen: '', melder: '', erstellt: vor(48), geaendert: '', abgeschlossen: '', url: 'https://t/3', offen: true },
  { id: '4', titel: 'Backup-Konzept', status: 'Offen', prio: '', kategorie: 'Datenschutz', artRoh: 'Doku', art: 'doku', werke: ['ALLE'], werkText: '', beschreibung: '', zugewiesen: '', melder: '', erstellt: vor(70), geaendert: '', abgeschlossen: '', url: 'https://t/4', offen: true },
  { id: '5', titel: 'Toner leer', status: 'Offen', prio: '', kategorie: 'Drucker', artRoh: 'Incident', art: 'incident', werke: ['HOL'], werkText: '', beschreibung: '', zugewiesen: '', melder: '', erstellt: vor(3), geaendert: '', abgeschlossen: '', url: 'https://t/5', offen: true },
];
const mounts = { 'vorfaelle-mount': { innerHTML: '' } };
const ctx = {
  console, JSON, Date, Array, Object, String, Number, Math, Set, Map, Promise, Infinity, parseInt, isNaN,
  setTimeout: (fn) => fn(),
  esc: (s) => String(s ?? ''), fmtDate: (s) => String(s ?? '').slice(0, 10), fmtDateTime: (s) => String(s ?? ''), emptyState: (t) => `<empty>${t}</empty>`,
  toast: (t, art) => gemeldet.push([t, art]),
  openModal: (h) => { modal = h; }, closeModal: () => { modal = null; },
  canWriteTab: () => true, trennungGreift: () => false, meineWerke: () => ['*'],
  STANDORTE: ['HOL', 'WGC'],
  State: { user: { name: 'Anna Muster', upn: 'anna@dihag.com' } },
  getAccessConfig: () => ({ vorfallKategorien: ctx.__kats || [] }),
  document: { getElementById: (id) => mounts[id] || null },
  window: { open: () => ({ document: { open() {}, write() {}, close() {} } }) },
  SP: { ticketList: 'Tickets' },
  spGetTickets: async () => ({ tickets: JSON.parse(JSON.stringify(tickets)), kategorien: ['IT-Sicherheit', 'Datenschutz', 'Drucker'], arten: ['Incident', 'Change', 'Doku'] }),
  spLoadVorfaelle: async () => ({ daten: { version: 1, bewertungen: JSON.parse(JSON.stringify(ctx.__bew || {})) }, geaendertAm: '' }),
  spSaveVorfallBewertung: async (id, b) => { gespeichert.push([id, b]); ctx.__bew = Object.assign({}, ctx.__bew || {}, { [id]: b }); return { daten: { version: 1, bewertungen: ctx.__bew }, geaendertAm: 'x' }; },
  spGetWirkLeise: async () => [{ id: 'w1', herkunftId: 'ticket:1', titel: 'Makros sperren', status: 'offen', verantwortlich: 'anna@dihag.com' }],
  spTicketListUrl: () => 'https://dihag.sharepoint.com/sites/ticket/Lists/Tickets/AllItems.aspx',
  wirkAbweichungFuer: (herkunftId, titel, werk, beschreibung, danach) => { wirkAufruf = { herkunftId, titel, werk, beschreibung }; },
  module: { exports: {} },
};
ctx.globalThis = ctx;
ctx.jsArg ??= jsArg; vm.createContext(ctx);
vm.runInContext(lies('js/notfallmodell.js'), ctx);
vm.runInContext(lies('js/assetmodell.js'), ctx);
vm.runInContext(lies('js/vorfallmodell.js'), ctx);
vm.runInContext(lies('js/vorfaelle.js'), ctx);

await vm.runInContext('initVorfaelle()', ctx);
await new Promise(r => setTimeout(r, 10));
let out = mounts['vorfaelle-mount'].innerHTML;
ok(/Vorfälle \/ Ereignisse offen/.test(out) && /<div[^>]*>2<\/div>[\s\S]*?Vorfälle \/ Ereignisse offen/.test(out), 'Die Ansicht zeichnet: zwei offene Vorfälle/Ereignisse mit Sicherheitsbezug (der Toner zählt nicht)');
ok(!/Toner leer/.test(out) && /Phishing an Buchhaltung/.test(out) && /Firewall-Regel/.test(out) && /Backup-Konzept/.test(out), 'Muster-Kategorien: IT-Sicherheit und Datenschutz ja, Drucker nein – in drei Abschnitten');
ok(/Vorfälle &amp; Ereignisse<\/div>/.test(out) && /Änderungen mit Sicherheitsbezug/.test(out) && /Dokumentation<\/div>/.test(out) && /A\.8\.32/.test(out) && /A\.5\.37/.test(out), 'Die drei Abschnitte mit Normbezug');
ok(/nicht beurteilt<\/span>/.test(out) && /<div[^>]*color:#b91c1c">2<\/div>[\s\S]*?nicht beurteilt \(A\.5\.25\)/.test(out), 'Beide Vorfälle nicht beurteilt – Kennzahl und Badge');
const reihen = [...out.matchAll(/openVorfall\(&quot;(\d+)&quot;\)/g)].map(m => m[1]);
ok(reihen[0] === '2', `Was drängt, steht oben: der USB-Stick ist seit 5 Tagen unbeurteilt (${reihen.join()})`);
ok(/↗ Ticketsystem/.test(out) && /4 von 5 Tickets der letzten 24 Monate/.test(out), 'Link ins Ticketsystem, Zählung');
ctx.__kats = ['Drucker'];
vm.runInContext('renderVorfaelle()', ctx);
out = mounts['vorfaelle-mount'].innerHTML;
ok(/Toner leer/.test(out) && !/Phishing/.test(out) && /<b>Drucker<\/b>/.test(out), 'Mit Kategorien aus den Einstellungen: genau die – und sie stehen oben');
ctx.__kats = [];

// Der Dialog
vm.runInContext("openVorfall('1')", ctx);
ok(modal && /#1 Phishing an Buchhaltung/.test(modal) && /Im Ticketsystem öffnen/.test(modal) && /https:\/\/t\/1/.test(modal) && /Zwei haben geklickt/.test(modal), 'Der Dialog: Ticket mit Link und Beschreibung');
ok(/Beurteilung <span/.test(modal) && /vfSet\('einstufung'/.test(modal) && /vfSetStufe/.test(modal) && /vfSetErheblich/.test(modal) && /Fristen laufen erst/.test(modal) && /Makros sperren/.test(modal) && /\+ Korrekturmaßnahme anlegen/.test(modal) && /🖨 Vorfallakte/.test(modal),
  'Beurteilung, Stufe, Erheblichkeit, noch keine Fristen, die vorhandene Maßnahme, Anlegen, Akte');
vm.runInContext("vfSet('einstufung','vorfall'); vfSetErheblich('ja'); vfSetStufe('2')", ctx);
const fristen = vm.runInContext('_vfFristenBlock()', ctx);
ok(/Frühwarnung \(NIS2\)/.test(fristen) && /seit 6 h überfällig/.test(fristen) && /Meldung \(NIS2\)/.test(fristen) && /noch 42 h/.test(fristen) && /vfSetMeldung\(&quot;fruehwarnung&quot;/.test(fristen) && /Behörde \/ Referenz/.test(fristen),
  'Als erheblicher Vorfall: die Fristen ab Kenntnis (vor 30 h) – Frühwarnung überfällig, Meldung läuft, Erledigung eintragbar');
vm.runInContext("vfSetMeldung('fruehwarnung', '2026-01-01T10:00')", ctx);
ok(/erledigt/.test(vm.runInContext('_vfEditing.bewertung.meldungen.fruehwarnung', ctx)) || vm.runInContext('_vfEditing.bewertung.meldungen.fruehwarnung', ctx).startsWith('2026-01-01'), 'Die Erledigung wird als Zeitpunkt gespeichert');
await vm.runInContext('saveVorfall()', ctx);
await new Promise(r => setTimeout(r, 10));
ok(gespeichert.length === 1 && gespeichert[0][0] === '1' && gespeichert[0][1].einstufung === 'vorfall' && gespeichert[0][1].erheblich === true && gespeichert[0][1].stufe === 2 && gespeichert[0][1].bewertetVon === 'Anna Muster' && gespeichert[0][1].historie.length === 1,
  'Gespeichert: Einstufung, erheblich, Stufe, wer, Verlauf');
ok(gemeldet.some(([t]) => /Beurteilung gespeichert/.test(t)), 'Frühwarnung eingetragen, Ticket noch offen: keine Lücke – gespeichert');
out = mounts['vorfaelle-mount'].innerHTML;
ok(/Vorfall · erheblich/.test(out) && /Notfall<\/span>/.test(out) && /72 h noch 42 h/.test(out), 'In der Tabelle: erheblich, Eskalationsstufe Notfall, die laufende 72-h-Frist');
ok(/<div[^>]*color:#b91c1c">1<\/div>[\s\S]*?nicht beurteilt/.test(out), 'Ein Vorfall bleibt unbeurteilt');

// Maßnahme anlegen
vm.runInContext("openVorfall('1'); vfMassnahmeAnlegen()", ctx);
ok(wirkAufruf && wirkAufruf.herkunftId === 'ticket:1' && /Maßnahme zu #1 Phishing/.test(wirkAufruf.titel) && wirkAufruf.werk === 'WGC', 'Die Korrekturmaßnahme geht mit Herkunft und Werk ins Wirksamkeits-Register');

// Nur-Lese
ctx.canWriteTab = () => false;
vm.runInContext("renderVorfaelle(); openVorfall('2')", ctx);
ok(/Nur-Lese-Zugriff/.test(mounts['vorfaelle-mount'].innerHTML) && !/vf-save-btn/.test(modal) && /disabled/.test(modal), 'Ohne Schreibrecht: gesagt, Dialog gesperrt');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
