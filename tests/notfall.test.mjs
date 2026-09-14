/**
 * Reiter „Notfall & Krisenstab" – die Ansicht und ihre Verdrahtung
 *
 * Das Modell prüft `notfallmodell.test.mjs`. Hier geht es darum, dass der
 * Reiter da ist, wo er hingehört, dass er in dieselbe Datei schreibt wie die
 * Landkarte – mit seinem eigenen Recht –, dass die Übung im Wirksamkeits-
 * Register als vierte Satzart ankommt, und dass Cockpit, Audit Report,
 * Dokumentation und Cron davon wissen.
 *
 * Die eine Verweigerung wird nachgestellt: Kritikalität „hoch" ohne RTO und
 * RPO wird nicht gespeichert (Reifegrad R093).
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Der Reiter ist verdrahtet ── */
const html = lies('index.html');
ok(/<a class="nav-item" data-view="notfall" id="nav-notfall"/.test(html), 'Navigation: der Reiter existiert');
ok(html.indexOf('id="nav-notfall"') > html.indexOf('id="nav-prozesse"') && html.indexOf('id="nav-notfall"') < html.indexOf('KI-Governance'),
  '… hinter „Prozesse", in der IMS-Gruppe');
ok(/<section id="view-notfall" class="view">[\s\S]*?<div id="notfall-mount">/.test(html), 'Ansicht mit Mount-Punkt');
ok(/onclick="refreshNotfall\(\)"/.test(html), 'Und einem Aktualisieren-Knopf');

const access = lies('js/access.js');
ok(/\{ view: 'notfall',\s*label: 'Notfall & Krisenstab'/.test(access), 'Reiter-Rechte: in GOVERNABLE_TABS – je Person freischaltbar');
ok(/show\('nav-notfall',\s*v\.notfall\)/.test(access), 'Sichtbarkeit folgt dem Leserecht');
ok(/v\.wirksamkeit \|\| v\.notfall\)/.test(access), 'Die Gruppen-Überschrift zählt ihn mit');

const app = lies('js/app.js');
ok(/if \(view === 'notfall'\s*&& typeof initNotfall === 'function'\)\s*initNotfall\(\);/.test(app), 'switchView öffnet ihn');
ok(/'wirksamkeit', 'notfall'\]\.includes\(ansicht\)/.test(app), 'Der Digest-Link ?ansicht=notfall landet dort');

ok(/'nav-wirksamkeit', 'nav-notfall'/.test(lies('js/probelauf.js')), 'Im Probelauf ausgeblendet wie die anderen Verwaltungsreiter');

/* ── 2) Module ── */
const kctx = { module: { exports: {} }, document: { querySelector: () => null }, Map, Promise };
kctx.window = kctx; kctx.globalThis = kctx;
vm.createContext(kctx);
vm.runInContext(lies('js/module.js'), kctx);
const { MODUL_ADMIN, MODUL_ANSICHTEN } = kctx.module.exports;
ok(MODUL_ADMIN.includes('notfallmodell') && !MODUL_ADMIN.includes('notfall'), 'Das Modell im Verwaltungsblock (Audit Report rechnet damit), die Ansicht nicht');
ok(MODUL_ANSICHTEN.notfall.includes('landkarte') && MODUL_ANSICHTEN.notfall.includes('notfall'), 'Die Notfall-Ansicht lädt die Landkarte – sie schreibt in deren Datei');
ok(MODUL_ANSICHTEN.prozesse.includes('notfall'), 'Die Prozesse laden die Ansicht mit – der Kachel-Dialog zeigt den Notfall-Stand');
ok(MODUL_ANSICHTEN.wirksamkeit.includes('notfallmodell'), 'Das Register kennt die Übungsarten');
ok(MODUL_ANSICHTEN.dokumentation.includes('notfallmodell'), 'Die Dokumentation baut ihre Tabellen aus dem Modell');

/* ── 3) Die Landkarte nimmt die Daten mit ── */
const lk = lies('js/landkarte.js');
ok(/notfall: \(d\.notfall && typeof d\.notfall === 'object'\) \? d\.notfall : \{\}/.test(lk),
  'Beim Laden bleibt der Notfall-Block erhalten – sonst wäre er beim nächsten Speichern weg');
ok(/function lkDarfSchreiben\(reiter\)/.test(lk) && /canWriteTab\(reiter \|\| 'prozesse'\)/.test(lk), 'Schreibrecht je Reiter');
ok(/async function lkSpeichern\(meldung, was, reiter\)/.test(lk) && /lkDarfSchreiben\(reiter\)/.test(lk), 'lkSpeichern nimmt den Reiter entgegen');
ok(/typeof nfKachelZeile === 'function'\) \? nfKachelZeile\(k, _lkWerk\)/.test(lk), 'Der Kachel-Dialog fragt nach der Notfall-Zeile …');
ok(/typeof nfKachelMarker === 'function'\) \? nfKachelMarker\(k\)/.test(lk), '… und die Kachel nach ihrem Marker – beides abgesichert');

/* ── 4) SharePoint: zwei Spalten, und fehlende werden nachgezogen ── */
const sp = lies('js/sharepoint.js');
ok(/\{ name: 'Prozess',\s*typ: 'Einzelne Textzeile' \}/.test(sp) && /\{ name: 'Uebungsart',\s*typ: 'Einzelne Textzeile' \}/.test(sp),
  'Die Liste „Wirksamkeit" bekommt Prozess und Übungsart');
ok(/prozess:\s*f\.Prozess \|\| ''/.test(sp) && /Prozess:\s*String\(w\.prozess \|\| ''\)/.test(sp), 'Gelesen und geschrieben');
ok(/async function _ergaenzeWirkSpalten/.test(sp) && /if \(create\) await _ergaenzeWirkSpalten\(token, siteId\)/.test(sp),
  'Eine schon angelegte Liste bekommt die neuen Spalten – sonst verschluckte _wirkFields sie still');

/* ── 5) Das Register: die vierte Satzart ── */
const W = require(path.join(ROOT, 'js', 'wirksamkeit.js'));
ok(W.WIRK_ARTEN.uebung && W.WIRK_ARTEN.uebung.icon === '🚨' && /A\.5\.30/.test(W.WIRK_ARTEN.uebung.norm), 'WIRK_ARTEN kennt die Notfallübung');
ok(W.WIRK_QUELLEN.includes('Notfallübung'), 'Und die Übung als Quelle einer Abweichung');
let f = W.wirkAbschlussfehler({ titel: 'x', datum: '2026-01-01', art: 'uebung' });
ok(f.length === 5, `Eine leere Übung hat fünf Lücken (${f.length})`);
ok(f.some(x => /welcher Notfallplan/.test(x)) && f.some(x => /Übungsart/.test(x)) && f.some(x => /Szenario/.test(x))
  && f.some(x => /Teilnehmenden/.test(x)) && f.some(x => /Ergebnis/.test(x)), 'Prozess, Übungsart, Szenario, Teilnehmende, Ergebnis');
f = W.wirkAbschlussfehler({ titel: 'x', datum: '2026-01-01', art: 'uebung', prozess: 'HOL:it', uebungsart: 'stabsuebung', umfang: 's', beteiligte: ['a'], ergebnis: 'e' });
ok(f.length === 0, 'Vollständig → abschließbar');
const wsrc = lies('js/wirksamkeit.js');
ok(/openWirkEditor\(null,'uebung'\)/.test(wsrc), 'Knopf „+ Übung"');
ok(/function wirkUebungFuer\(ziel, name, werk, danach\)/.test(wsrc), 'Aus dem Notfall-Reiter heraus anlegbar');
ok(/const danach = _wirkDanach; _wirkDanach = null;/.test(wsrc), 'Nach dem Speichern zurück in den Reiter, aus dem man kam');
ok(/_wirkEditing\.quelle = \(q && q\.art === 'uebung'\) \? 'Notfallübung' : 'internes Audit'/.test(wsrc), 'Eine Abweichung aus einer Übung weiß, woher sie stammt');
ok(/NF_UEBUNGSARTEN/.test(wsrc) && /typeof NF_UEBUNGSARTEN !== 'undefined'/.test(wsrc), 'Die Übungsarten kommen aus dem Modell – abgesichert');
ok(/'Geübter Prozess', 'Übungsart'/.test(wsrc), 'Der CSV-Export führt beide Spalten');

/* ── 6) Cockpit, Audit Report, Dokumentation, Cron ── */
ok(/tile\('notfall',\s*'🚨', 'Notfall & Krisenstab',\s*'notfall'\)/.test(lies('js/cockpit.js')) && /async function _ckLoadNotfall/.test(lies('js/cockpit.js')),
  'Cockpit-Kachel mit eigenem Lader');
const cl = lies('js/clevelreport.js');
ok(/add\('ISO A\.5\.30', 'IKT-Bereitschaft für Business Continuity', 'gap'/.test(cl), 'Audit Report: A.5.30 kann Lücke sein');
ok(/add\('ISO A\.5\.29', 'Informationssicherheit bei Störungen \(Krisenstab\)', 'gap'/.test(cl), 'Und A.5.29 für den Krisenstab');
ok(/nfKennzahlen\(g\.daten, Array\.isArray\(_wirk\) \? _wirk : \[\], nfSichtbareWerke\(\)\)/.test(cl), 'Rechnet mit dem Modell auf der rohen Landkarte – mit Trennung');
ok(/'krit\. Prozesse mit Plan'/.test(cl), 'Und eine Kachel im Bericht');

// Die Dokumentation rendert – ohne dass ein Platzhalter als Text stehen bleibt
const dctx = { console, esc: (s) => String(s ?? ''), module: { exports: {} } };
dctx.window = dctx; dctx.globalThis = dctx;
vm.createContext(dctx);
vm.runInContext(lies('js/notfallmodell.js'), dctx);
vm.runInContext(lies('js/dokumentation.js'), dctx);
const doku = vm.runInContext('_dokuSections()', dctx);
const abschnitt = doku.slice(doku.indexOf('id="doku-notfall"'), doku.indexOf('id="doku-ismsdocs"'));
ok(abschnitt.length > 5000, 'Der Doku-Abschnitt ist da');
ok(!/\$\{/.test(abschnitt), 'Kein Platzhalter blieb als Text stehen');
ok(/Leitung Krisenstab/.test(abschnitt) && /Sofortmaßnahmen/.test(abschnitt) && /Planbesprechung/.test(abschnitt) && /Vollübung/.test(abschnitt),
  'Rollen, Planteile und Übungsarten stehen drin – aus dem Modell');
ok(/nicht schneller wieder da sein als das Langsamste/.test(abschnitt), 'Und der Satz, um den es geht');
ok(/\['notfall',\s*'Notfall & Krisenstab \(BCM\)'\]/.test(lies('js/dokumentation.js')), 'Im Inhaltsverzeichnis');

const cron = lies('scripts/erinnerungen.mjs');
ok(/Notfall-Digest/.test(cron), 'Der Cron kennt den Notfall-Digest');
ok(/_require\('\.\.\/js\/notfallmodell\.js'\)/.test(cron), 'Und rechnet mit demselben Modell wie die App – eine Regel, zwei Stellen');
ok(/loadKonfigJson\(siteId, 'prozesslandkarte\.json'\)/.test(cron), 'Er liest die Landkarte aus dem Konfig-Ordner');
ok(/kritischer Prozess ohne Notfallplan/.test(cron) && /Notfallplan nie geübt/.test(cron) && /Krisenstab \$\{werk\}/.test(cron),
  'Pläne, Übungen, Krisenstab');
ok(/\?ansicht=notfall/.test(cron), 'Mit Link in den Reiter');

/* ── 7) Die Ansicht im Sandkasten ── */
const gemeldet = [], gespeichert = [], fenster = [];
let modal = null;
const daten = { karten: { HOL: { baender: [], kacheln: [
  { id: 'auftraege', name: 'Aufträge abwickeln', unter: 'Versand', verantwortlich: 'a@dihag.com',
    bcm: { kritikalitaet: 'hoch', rto: 4, rpo: 1, mtpd: 24, assets: [{ id: '1', title: 'SAP' }], plan: { sofort: 'a', notbetrieb: 'b', wiederanlauf: 'c', kontakte: [{ rolle: 'IT', name: 'x', telefon: '1' }] } } },
  { id: 'it', name: 'IT', bcm: { kritikalitaet: 'hoch', rto: 2, rpo: 1, assets: [{ id: '1', title: 'SAP' }] } },
  { id: 'personal', name: 'Personal' },
] } }, notfall: { assetRto: { '1': { rto: 8 } } }, historie: [] };
const mounts = { 'notfall-mount': { innerHTML: '' } };
const ctx = {
  console, JSON, Date, Array, Object, String, Number, Math, Set, Map, Promise, Infinity, parseInt, isNaN,
  setTimeout: (fn) => fn(),
  esc: (s) => String(s ?? ''), fmtDate: (s) => String(s ?? '').slice(0, 10), emptyState: (t) => `<empty>${t}</empty>`,
  toast: (t, art) => gemeldet.push([t, art]),
  openModal: (h) => { modal = h; }, closeModal: () => { modal = null; },
  canWriteTab: () => true, canReadTab: () => true, trennungGreift: () => false, meineWerke: () => ['*'],
  STANDORTE: ['HOL', 'WGC'],
  document: { getElementById: (id) => mounts[id] || null, querySelectorAll: () => [] },
  window: { open: () => { const w = { document: { open() {}, write(h) { fenster.push(h); }, close() {} } }; return w; } },
  // Landkarte
  _lkDaten: daten, _lkWerk: 'HOL', _lkGeladen: true,
  lkDatenLaden: async () => daten, lkWerkAbsichern: () => {}, lkWerkSetzenStill: (w) => { ctx._lkWerk = w; },
  lkKarte: (w) => daten.karten[w || ctx._lkWerk], lkKacheln: () => daten.karten[ctx._lkWerk].kacheln,
  lkKachelVonId: (id) => daten.karten[ctx._lkWerk].kacheln.find(k => k.id === id) || null,
  lkWerkeMitKarte: () => ['HOL'], lkWerkLabel: (w) => w, lkPersonName: (u) => u, lkMitgliederLaden: () => {}, _lkPeopleOptions: () => '',
  lkSpeichern: async (m, was, reiter) => { gespeichert.push([m, was, reiter]); return true; },
  // Register / SharePoint
  spGetWirkLeise: async () => [{ id: '9', art: 'uebung', prozess: 'HOL:auftraege', datum: '2026-08-01', status: 'abgeschlossen', uebungsart: 'stabsuebung', titel: 'Übung SAP' }],
  spGetAssets: async () => [{ id: '1', title: 'SAP', sub: 'ERP' }, { id: '2', title: 'Netz', sub: '' }],
  wirkUebungFuer: (ziel, name, werk, danach) => { ctx.__uebung = { ziel, name, werk, danach }; },
  openWirkEditor: () => {}, wirkAbschlussfehler: () => [],
  module: { exports: {} },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/notfallmodell.js'), ctx);
vm.runInContext(lies('js/notfall.js'), ctx);

await vm.runInContext('initNotfall()', ctx);
let out = mounts['notfall-mount'].innerHTML;
ok(/kritische Prozesse/.test(out) && /Der Plan hängt am Prozess, nicht am Asset/.test(out), 'Die Ansicht zeichnet – mit dem Satz, um den es geht');
ok(/1\/2<\/div>[\s\S]*?davon mit Notfallplan/.test(out), 'Zwei kritische, einer mit Plan');
ok(/1\/1<\/div>[\s\S]*?in 12 Monaten geübt/.test(out), 'Der eine Plan ist geübt (Übung aus dem Register)');
ok(/RTO nicht haltbar/.test(out) && /<div[^>]*color:#b91c1c">2<\/div>/.test(out), 'Beide kritischen: RTO nicht haltbar (SAP braucht 8 h)');
ok(/0\/1<\/div>[\s\S]*?Werke mit vollständigem Krisenstab/.test(out), 'HOL ohne Krisenstab');
ok(/1 Prozess\(e\) ohne Business-Impact-Analyse/.test(out), 'Personal ist unbewertet – und das steht oben');
const zeilen = [...out.matchAll(/nfKachelOeffnen\('([a-z]+)'\)/g)].map(m => m[1]);
ok(zeilen.join(',') === 'it,auftraege,personal', `Sortiert: kritische nach RTO (IT 2 h vor Aufträgen 4 h), dann unbewertet (${zeilen.join(',')})`);
ok(/🖨 Notfallhandbuch/.test(out) && /🖨 Alarmkarte/.test(out), 'Beide Druckknöpfe');

// Ausfall-Sicht
vm.runInContext("_nfAssetWahl='1'; nfSetModus('ausfall')", ctx);
out = mounts['notfall-mount'].innerHTML;
ok(/„SAP" fällt aus/.test(out), 'Ausfall-Sicht: SAP fällt aus');
const reihe = [...out.matchAll(/<li[^>]*><b>([^<]+)<\/b>/g)].map(m => m[1]);
ok(reihe.join(',') === 'IT,Aufträge abwickeln', `Betroffen in Wiederherstell-Reihenfolge: IT (2 h) vor Aufträgen (4 h) (${reihe.join(',')})`);
ok((out.match(/⚠ nicht haltbar/g) || []).length === 2, 'Beide als nicht haltbar markiert – SAP braucht 8 h');
ok(/⚠ 2 kritische/.test(out), 'Die Trägertabelle nennt den Single Point of Failure');
ok(/Netz.*\(ohne Prozess\)/.test(out), 'Ein Asset ohne Prozess steht in der Auswahl – markiert');

// Krisenstab
vm.runInContext("nfSetModus('krisenstab')", ctx);
out = mounts['notfall-mount'].innerHTML;
ok(/noch kein Krisenstab angelegt/.test(out) && /nfStabAnlegen\(\)/.test(out), 'Ohne Stab: anlegen');
vm.runInContext('nfStabAnlegen()', ctx);
ok(modal && /Krisenstab HOL/.test(modal) && (modal.match(/nfStabZeile\('mitglieder'/g) || []).length >= 8 * 6, 'Der Editor bringt die acht Rollen mit');
ok(/Leitung Krisenstab ist nicht benannt/.test(modal), 'Und sagt, was fehlt');
vm.runInContext("_nfStabEditing.mitglieder[0].name='Anna'; _nfStabEditing.mitglieder[0].telefon='1'; _nfStabEditing.mitglieder[1].name='Ben'; _nfStabEditing.mitglieder[1].mobil='2'; _nfStabEditing.treffpunkt='Raum 1'; _nfStabEditing.kanal='Teams'; _nfStabEditing.kanalErsatz='Mobil'", ctx);
await vm.runInContext('nfStabSpeichern()', ctx);
ok(gespeichert.length === 1 && gespeichert[0][2] === 'notfall' && /Krisenstab HOL angelegt/.test(gespeichert[0][1]),
  'Gespeichert – über die Landkarte, mit dem Recht des Notfall-Reiters');
ok(daten.karten.HOL.krisenstab && daten.karten.HOL.krisenstab.standAm && daten.karten.HOL.krisenstab.mitglieder[0].name === 'Anna',
  'Der Stab hängt an der Karte des Werks, mit Stand von heute');
out = mounts['notfall-mount'].innerHTML;
ok(/✓ Krisenstab vollständig/.test(out), 'Und ist vollständig');

// Der Editor und die eine Verweigerung
vm.runInContext("nfKachelOeffnen('personal')", ctx);
ok(modal && /🚨 Personal/.test(modal) && /Business-Impact-Analyse/.test(modal) && /Notfallplan/.test(modal) && /Übungen/.test(modal),
  'Der Editor: BIA, Assets, Plan, Übungen in einem');
ok(/Kritikalität nicht bewertet/.test(modal), 'Die Lücke steht oben');
ok(/Netz/.test(modal) && /SAP/.test(modal), 'Die Assets aus der ISMS-Liste stehen zur Wahl');
vm.runInContext("nfKritSetzen('hoch')", ctx);
await vm.runInContext('nfKachelSpeichern()', ctx);
ok(gespeichert.length === 1 && gemeldet.some(([t, a]) => a === 'error' && /R093/.test(t)), 'Kritikalität „hoch" ohne RTO/RPO: nicht gespeichert, R093 genannt');
ok(!daten.karten.HOL.kacheln[2].bcm, 'Die Kachel blieb unberührt');
vm.runInContext("_nfEditing.bcm.rto = 8; _nfEditing.bcm.rpo = 4; nfAssetUmschalten('2', true)", ctx);
await vm.runInContext('nfKachelSpeichern()', ctx);
ok(gespeichert.length === 2 && gespeichert[1][2] === 'notfall' && /Kritikalität – → hoch/.test(gespeichert[1][1]), 'Mit RTO und RPO: gespeichert, mit Vermerk');
const k3 = daten.karten.HOL.kacheln[2];
ok(k3.bcm && k3.bcm.kritikalitaet === 'hoch' && k3.bcm.rto === 8 && k3.bcm.assets[0].id === '2' && k3.bcm.standAm, 'Die BIA hängt an der Kachel, mit Stand');
ok(!k3.bcm.plan.standAm, 'Der Plan blieb leer – und bekam deshalb keinen Stand');
ok(/1 Lücke\(n\) bleiben|Lücke\(n\) bleiben/.test(gespeichert[1][0]), 'Die Meldung sagt, dass Lücken bleiben');

// Übung aus dem Reiter heraus
vm.runInContext("nfKachelOeffnen('auftraege')", ctx);
ok(/Übung SAP/.test(modal) && /Stabsübung/.test(modal), 'Die Übungen des Prozesses stehen im Editor');
vm.runInContext('nfUebungErfassen()', ctx);
ok(ctx.__uebung && ctx.__uebung.ziel === 'HOL:auftraege' && ctx.__uebung.werk === 'HOL' && typeof ctx.__uebung.danach === 'function',
  '„+ Übung erfassen" übergibt Prozess und Werk ans Register – und einen Rückweg');

// Druck
vm.runInContext('nfHandbuchDrucken()', ctx);
ok(fenster.length === 1 && /Notfallhandbuch/.test(fenster[0]) && /Anna/.test(fenster[0]) && /Aufträge abwickeln/.test(fenster[0]), 'Das Handbuch öffnet sich – mit Stab und Plänen');
vm.runInContext("nfPlanDrucken('auftraege')", ctx);
ok(fenster.length === 2 && /Notfallplan „Aufträge abwickeln/.test(fenster[1]), 'Ein einzelner Plan aus dem Editor');
vm.runInContext('nfAlarmkarteDrucken()', ctx);
ok(fenster.length === 3 && /Alarmkarte/.test(fenster[2]), 'Die Alarmkarte');

// Haken für die Landkarte
const zeile = vm.runInContext("nfKachelZeile(lkKachelVonId('it'), 'HOL')", ctx);
ok(/🚨/.test(zeile) && /hoch/.test(zeile) && /RTO <b>2 h<\/b>/.test(zeile) && /Plan <span[^>]*>fehlt/.test(zeile) && /nfKachelOeffnen\('it'\)/.test(zeile),
  'Die Zeile im Kachel-Dialog: Kritikalität, RTO, Plan fehlt, Knopf');
ok(vm.runInContext("nfKachelMarker(lkKachelVonId('it'))", ctx).includes('🚨') && vm.runInContext("nfKachelMarker({bcm:{kritikalitaet:'mittel'}})", ctx) === '',
  'Der Marker nur an kritischen Kacheln');

/* ── 8) Nur-Lese ── */
ctx.canWriteTab = () => false;
vm.runInContext("nfSetModus('bia')", ctx);
ok(/Nur-Lese-Zugriff/.test(mounts['notfall-mount'].innerHTML), 'Ohne Schreibrecht: gesagt');
vm.runInContext("nfKachelOeffnen('it')", ctx);
ok(!/nf-save-btn/.test(modal) && /disabled/.test(modal), 'Der Editor ohne Speichern-Knopf, Felder gesperrt');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
