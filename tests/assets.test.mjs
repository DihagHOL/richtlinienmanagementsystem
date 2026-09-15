/**
 * Reiter „Assetregister" – die Ansicht und ihre Verdrahtung
 *
 * Das Modell prüft `assetmodell.test.mjs`. Hier: die eigene Liste mit ihren
 * Spalten, der Reiter, der Editor mit Zusatzfeldern aus den Einstellungen,
 * Anlegen/Ändern/Löschen, der Import aus der alten Liste, und dass Cockpit,
 * Audit Report, Risiken, Notfall, Dokumentation und Cron das Register kennen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Verdrahtung ── */
const html = lies('index.html');
ok(/<a class="nav-item" data-view="assets" id="nav-assets"/.test(html) && html.indexOf('id="nav-assets"') > html.indexOf('id="nav-risiken"'), 'Navigation: hinter dem Risiko-Register');
ok(/<section id="view-assets" class="view">[\s\S]*?<div id="assets-mount">/.test(html) && /onclick="refreshAssets\(\)"/.test(html), 'Ansicht mit Mount und Aktualisieren');
const access = lies('js/access.js');
ok(/\{ view: 'assets',\s*label: 'Assetregister'/.test(access) && /show\('nav-assets',\s*v\.assets\)/.test(access), 'Reiter-Rechte und Sichtbarkeit');
ok(/if \(view === 'assets'\s*&& typeof initAssets === 'function'\)\s*initAssets\(\);/.test(lies('js/app.js')) && /'notfall', 'vorfaelle', 'assets'\]\.includes\(ansicht\)/.test(lies('js/app.js')), 'switchView und Digest-Link');
ok(/'nav-risiken', 'nav-assets'/.test(lies('js/probelauf.js')), 'Im Probelauf ausgeblendet');

const kctx = { module: { exports: {} }, document: { querySelector: () => null }, Map, Promise };
kctx.window = kctx; kctx.globalThis = kctx;
vm.createContext(kctx);
vm.runInContext(lies('js/module.js'), kctx);
const { MODUL_ADMIN, MODUL_ANSICHTEN } = kctx.module.exports;
ok(MODUL_ADMIN.includes('assetmodell') && !MODUL_ADMIN.includes('assets') && MODUL_ANSICHTEN.assets.includes('assets'), 'Modell im Verwaltungsblock, Ansicht in ihrer Gruppe');
ok(MODUL_ANSICHTEN.dokumentation.includes('assetmodell'), 'Die Dokumentation baut aus dem Modell');

/* ── 2) Die Liste ── */
const sp = lies('js/sharepoint.js');
ok(/assetRegList: 'Assets'/.test(sp) && /const ASSET_COLUMNS = \[/.test(sp), 'Das Register IST die Liste „Assets" – keine zweite; die erwarteten Spalten stehen in ASSET_COLUMNS');
for (const c of ['Kategorie', 'Werke', 'Verantwortlich', 'Vertraulichkeit', 'Integritaet', 'Verfuegbarkeit', 'Klassifizierung', 'Wiederherstellung', 'Rpo', 'AbhaengigJson', 'EOL', 'Vertragsende', 'ZusatzJson']) {
  ok(new RegExp(`\\{ name: '${c}',`).test(sp), `Spalte ${c}`);
}
ok(!/QuelleId/.test(sp.slice(sp.indexOf('const ASSET_COLUMNS'), sp.indexOf('let _assetCols'))), 'Keine Quell-Id mehr – es ist dieselbe Liste, die Ids stimmen');
ok(/async function spErgaenzeAssetSpalten/.test(sp) && !/if \(create\) await _ergaenzeAssetSpalten/.test(sp), 'Fehlende Spalten nur auf Knopfdruck – nie still: die Liste gehört dem Haus');
ok(/function spAssetSpalteDa\(name\)/.test(sp), 'Ob eine Spalte da ist, lässt sich fragen (Notfall braucht das für die Wiederherstellzeit)');
ok(/assetRegListId: null/.test(sp), 'Die Listen-Id hat ihren Platz');
const am = lies('js/assetmodell.js');
ok(/const AM_ALIASE = \{/.test(am) && /Art:\s*\['Asset-Typ'/.test(am) && /Verantwortlich:\s*\['Owner', 'Asset-Owner'/.test(am) && /Werke:\s*\['Standort', 'Standorte'/.test(am) && /AbhaengigJson:\s*\['Informationsträger'/.test(am) && /Link:\s*\['Link zu den Informationen'/.test(am) && /Beschreibung:\s*\[[^\]]*'weitere Infos'/.test(am),
  'Gewachsene Spaltennamen stehen im Modell – Reiter und Cron lesen dieselbe Liste gleich: Asset-Typ, Asset-Owner, Standorte, Informationsträger, Link, weitere Infos');
ok(!/const ASSET_ALIASE = \{/.test(sp) && /return amSpalteFinden\(_assetColMeta, erwartet\)/.test(sp) && /return amAusFeldern\(it, \{/.test(sp), 'sharepoint.js liest über das Modell – keine zweite Zuordnung');
ok(/function amSpaltenNorm\(s\)/.test(am) && /_x\(\[0-9a-fA-F\]\{4\}\)_/.test(am), 'Anzeigenamen mit Umlaut und kodierte interne Namen sind dasselbe');
for (const c of JSON.parse('[' + [...sp.slice(sp.indexOf('const ASSET_COLUMNS'), sp.indexOf('let _assetCols')).matchAll(/name: '([A-Za-z]+)'/g)].map(m => `"${m[1]}"`).join(',') + ']')) {
  ok(new RegExp(`\\n  ${c}:\\s*\\[`).test(am), `Jede erwartete Spalte hat ihren Platz im Modell (${c})`);
}
ok(/\{ name: 'Art',/.test(sp) && /\{ name: 'Link',/.test(sp), 'Neue Spalten: Art (primär / unterstützend) und Link');
ok(/modulLaden\('assetmodell'\)/.test(sp) && /\$expand=fields\$\{mitAuswahl \? `\(\$select=\$\{select\}\)` : ''\}/.test(sp) && /amTraegerAufloesen\(out\)/.test(sp),
  'Beim Laden: Modell nachladen, Felder ausdrücklich auswählen (Nachschlagewerte!), Informationsträger auflösen');

// _mapAsset / _assetFields: hin und zurück
const sctx = { console, JSON, STANDORTE: ['HOL', 'WGC', 'SHB', 'ZAI'], module: { exports: {} } };
sctx.window = sctx; sctx.globalThis = sctx; sctx.fetch = () => {}; sctx.location = { origin: '', pathname: '' };
vm.createContext(sctx);
vm.runInContext(lies('js/assetmodell.js'), sctx);
vm.runInContext(lies('js/sharepoint.js'), sctx);
const gemappt = vm.runInContext(`_mapAsset(${JSON.stringify({ id: 12, webUrl: 'u', fields: { Title: 'SAP', Kategorie: 'anwendung', Werke: 'hol, WGC', Verfuegbarkeit: 'sehr hoch', Wiederherstellung: 12, Rpo: null, AbhaengigJson: '["3"]', ZusatzJson: '{"inventarnummer":"4711"}', Personenbezogen: 'ja', EOL: '2027-03-01T00:00:00Z', AStatus: 'aktiv' } })})`, sctx);
ok(gemappt.id === '12' && gemappt.titel === 'SAP' && gemappt.title === 'SAP' && gemappt.werke.join() === 'HOL,WGC', 'Gelesen: Id, Titel (beide Schreibweisen), Werke');
ok(gemappt.wiederherstellung === 12 && gemappt.rpo === '' && gemappt.abhaengigVon.join() === '3' && gemappt.zusatz.inventarnummer === '4711' && gemappt.personenbezogen === true && gemappt.eol === '2027-03-01', 'Zahlen, JSON, Datum, Ja/Nein');
ok(/sehr hoch/.test(gemappt.sub) && /HOL, WGC/.test(gemappt.sub), 'Die Kurzzeile für Risiken und Notfall');
// Was die Liste heute schon hat – Typ, Owner (Person), ein Schutzbedarf, RTO, Standort mit Kürzel
const alt = vm.runInContext(`_mapAsset(${JSON.stringify({ id: 5, fields: { Title: 'Leitstand', Typ: 'OT', Standort: 'Wittenberge (WGC)', Owner: { LookupValue: 'Ben', Email: 'ben@x' }, Schutzbedarf: 'Hoch', RTO: 8, Klassifizierung: 'Intern' } })})`, sctx);
ok(alt.kategorie === 'OT' && alt.werke.join() === 'WGC' && alt.standort === '' && alt.verantwortlich === 'ben@x', 'Typ, Standort → Werk (und nicht zugleich Aufstellort), Person-Feld → E-Mail');
ok(alt.vertraulichkeit === 'hoch' && alt.integritaet === 'hoch' && alt.verfuegbarkeit === 'hoch' && alt.wiederherstellung === 8 && alt.klassifizierung === 'intern', 'Ein Schutzbedarf für alle drei, RTO als Wiederherstellzeit');
// Die Liste des Hauses, nachgestellt: Anzeigenamen mit Umlaut, kodierte interne Namen, Standort = Werke
// (Mehrfachauswahl), Skala „1 – 3", Owner als Personenfeld, Wiederherstellzeit als field_9.
vm.runInContext(`_assetColMeta = [
  { name: 'Title', displayName: 'Titel', typ: 'text', choices: [] },
  { name: 'Typ', displayName: 'Typ', typ: 'choice', choices: ['Server', 'Anwendung', 'Netzwerk'] },
  { name: 'Standort', displayName: 'Standort', typ: 'choice', choices: ['HOL', 'SHB', 'WGC', 'ZAI'] },
  { name: 'Owner', displayName: 'Verantwortlich', typ: 'person', choices: [] },
  { name: 'Vertraulichkeit', displayName: 'Vertraulichkeit', typ: 'choice', choices: ['1 - niedrig', '2 - hoch', '3 - sehr hoch'] },
  { name: 'Integrit_x00e4_t', displayName: 'Integrität', typ: 'choice', choices: ['1 - niedrig', '2 - hoch', '3 - sehr hoch'] },
  { name: 'Verf_x00fc_gbarkeit', displayName: 'Verfügbarkeit', typ: 'choice', choices: ['1 - niedrig', '2 - hoch', '3 - sehr hoch'] },
  { name: 'Status', displayName: 'Status', typ: 'choice', choices: ['in Betrieb', 'ausgemustert'] },
  { name: 'field_9', displayName: 'Wiederherstellzeit', typ: 'number', choices: [] },
]; _assetCols = new Set(_assetColMeta.map(c => c.name)); _assetMulti.add('Standort');`, sctx);
const haus = vm.runInContext(`_mapAsset(${JSON.stringify({ id: 7, fields: { Title: 'SAP', Typ: 'Anwendung', Standort: ['HOL', 'WGC'], Owner: { Email: 'anna@x' }, Vertraulichkeit: '2 - hoch', 'Integrit_x00e4_t': '3 - sehr hoch', 'Verf_x00fc_gbarkeit': '3 - sehr hoch', Status: 'in Betrieb', field_9: 12 } })})`, sctx);
ok(haus.kategorie === 'Anwendung' && haus.werke.join() === 'HOL,WGC' && haus.standort === '' && haus.verantwortlich === 'anna@x', 'Typ, Standort (Mehrfachauswahl) als Werke – und nicht zugleich als Aufstellort –, Person als E-Mail');
ok(haus.vertraulichkeit === '2 - hoch' && haus.integritaet === '3 - sehr hoch' && haus.verfuegbarkeit === '3 - sehr hoch' && haus.wiederherstellung === 12, 'Integrität über den Anzeigenamen (intern kodiert), die Skala bleibt wie sie ist, Wiederherstellzeit aus field_9');
const zurueck = vm.runInContext(`_assetFields(${JSON.stringify(Object.assign({}, haus, { verfuegbarkeit: 'sehr hoch', status: 'außer Betrieb', werke: ['HOL', 'ZAI'], kategorie: 'anwendung', wiederherstellung: 8 }))})`, sctx);
ok(zurueck['Verf_x00fc_gbarkeit'] === '3 - sehr hoch' && zurueck.Status === 'ausgemustert' && JSON.stringify(zurueck.Standort) === '["HOL","ZAI"]' && zurueck.Typ === 'Anwendung' && zurueck.field_9 === 8,
  'Geschrieben in die Worte der Spalte: „sehr hoch" → „3 - sehr hoch", „außer Betrieb" → „ausgemustert", Werke → Standort als Array, Kategorie in die Auswahl von Typ');
ok(!('Owner' in zurueck) && !('Werke' in zurueck) && !('Integritaet' in zurueck), 'Personenfelder schreibt die App nicht; keine zweite Spalte für dieselbe Sache');
const fehlt = vm.runInContext('spMissingAssetColumns()', sctx);
ok(!fehlt.includes('Integritaet') && !fehlt.includes('Werke') && !fehlt.includes('Wiederherstellung') && !fehlt.includes('AStatus') && fehlt.includes('Rpo') && fehlt.includes('EOL'),
  'Fehlend ist nur, was es unter keinem Namen gibt');
const bericht = vm.runInContext('spAssetSpaltenBericht()', sctx);
ok(bericht.find(b => b.erwartet === 'Integritaet').gefunden === 'Integrit_x00e4_t' && bericht.find(b => b.erwartet === 'Integritaet').choices.length === 3 && bericht.find(b => b.erwartet === 'Rpo').gefunden === null,
  'Der Bericht sagt, was wo gefunden wurde – mit der Auswahl der Spalte');
// Die Liste des Hauses, wie sie heute aussieht (Bild): Asset-Typ „Primär", Standorte als Nachschlagen auf eine andere
// Liste („Alle DIHAG-Standorte"), Asset-Owner als Nachschlagen (Fachbereich), Informationsträger als Nachschlagen auf die
// Liste SELBST, „Link zu den Informationen" als Hyperlink, „weitere Infos" als Text.
vm.runInContext(`_sp.assetRegListId = '{AAAA-1}'; _assetColMeta = [
  { name: 'Title', displayName: 'Asset', typ: 'text', choices: [] },
  { name: 'Asset_x002d_Typ', displayName: 'Asset-Typ', typ: 'text', choices: [] },
  { name: 'Standorte', displayName: 'Standorte', typ: 'lookup', choices: [], lookupListId: 'bbbb-2', lookupMulti: true },
  { name: 'Asset_x002d_Owner', displayName: 'Asset-Owner', typ: 'lookup', choices: [], lookupListId: 'cccc-3', lookupMulti: false },
  { name: 'Vertraulichkeit', displayName: 'Vertraulichkeit', typ: 'choice', choices: ['intern', 'vertraulich', 'streng vertraulich'] },
  { name: 'Integrit_x00e4_t', displayName: 'Integrität', typ: 'choice', choices: ['normal', 'hoch', 'sehr hoch'] },
  { name: 'Verf_x00fc_gbarkeit', displayName: 'Verfügbarkeit', typ: 'choice', choices: ['normal', 'hoch', 'sehr hoch'] },
  { name: 'LinkzudenInformationen', displayName: 'Link zu den Informationen', typ: 'link', choices: [] },
  { name: 'Informationstr_x00e4_ger', displayName: 'Informationsträger', typ: 'lookup', choices: [], lookupListId: 'aaaa-1', lookupMulti: true },
  { name: 'weitereInfos', displayName: 'weitere Infos', typ: 'text', choices: [] },
]; _assetCols = new Set(_assetColMeta.map(c => c.name)); _assetMulti = new Set();`, sctx);
const bild = vm.runInContext('spAssetSpaltenBericht()', sctx);
const gef = (e) => bild.find(b => b.erwartet === e);
ok(gef('Art').gefunden === 'Asset_x002d_Typ' && gef('Kategorie').gefunden === null, 'Asset-Typ ist die Art (primär / unterstützend) – keine Kategorie');
ok(gef('Werke').gefunden === 'Standorte' && gef('Werke').nurLesen && gef('Verantwortlich').gefunden === 'Asset_x002d_Owner' && gef('Verantwortlich').nurLesen, 'Standorte und Asset-Owner: gefunden, Nachschlagen in andere Listen → nur lesen');
ok(gef('AbhaengigJson').gefunden === 'Informationstr_x00e4_ger' && gef('AbhaengigJson').selbst && !gef('AbhaengigJson').nurLesen, 'Informationsträger zeigt auf die Liste selbst – das sind die Abhängigkeiten, und die App darf sie schreiben');
ok(gef('Link').gefunden === 'LinkzudenInformationen' && gef('Beschreibung').gefunden === 'weitereInfos', 'Link zu den Informationen und weitere Infos');
ok(/^id,Title,/.test(vm.runInContext('amSelectVon(_assetColMeta, _assetFeld)', sctx)) && /Asset_x002d_OwnerLookupId/.test(vm.runInContext('amSelectVon(_assetColMeta, _assetFeld)', sctx)) && /Informationstr_x00e4_gerLookupId/.test(vm.runInContext('amSelectVon(_assetColMeta, _assetFeld)', sctx)),
  'Die Feldauswahl fordert die Nachschlagewerte samt LookupId an');
const pd = vm.runInContext(`_mapAsset(${JSON.stringify({ id: 2, fields: { Title: 'Personaldaten', 'Asset_x002d_Typ': 'Primär', Standorte: [{ LookupId: 9, LookupValue: 'Alle DIHAG-Standorte' }], 'Asset_x002d_Owner': 'Personal', 'Asset_x002d_OwnerLookupId': '4',
  Vertraulichkeit: 'vertraulich', 'Integrit_x00e4_t': 'hoch', 'Verf_x00fc_gbarkeit': 'sehr hoch', LinkzudenInformationen: { Url: 'https://x/asset', Description: 'Asset-Management' },
  'Informationstr_x00e4_ger': [{ LookupId: 11, LookupValue: 'Sharepoint' }], 'Informationstr_x00e4_gerLookupId': [11], weitereInfos: 'Papierform alle außer SHB/WGC' } })})`, sctx);
ok(pd.art === 'primär' && pd.kategorie === '' && pd.werke.join() === 'ALLE' && pd.verantwortlich === 'Personal', 'Gelesen: Primär → Art, „Alle DIHAG-Standorte" → konzernweit, Asset-Owner → Verantwortlich');
ok(pd.abhaengigVon.join() === '11' && pd.traeger.length === 0 && pd.link.url === 'https://x/asset' && pd.link.text === 'Asset-Management' && pd.beschreibung === 'Papierform alle außer SHB/WGC', 'Informationsträger → hängt ab von Asset 11; Hyperlink → Link; weitere Infos → Beschreibung');
ok(pd.vertraulichkeit === 'vertraulich' && amVonNorm(pd).klassifizierung === 'vertraulich', 'Die Einstufung bleibt und ist die Klassifizierung');
const pdFelder = vm.runInContext(`_assetFields(${JSON.stringify(Object.assign({}, pd, { abhaengigVon: ['11', '12'], link: { url: 'https://x/neu', text: 'Neu' }, art: 'unterstützend' }))})`, sctx);
ok(pdFelder['Informationstr_x00e4_gerLookupId'].join() === '11,12' && pdFelder['Informationstr_x00e4_gerLookupId@odata.type'] === 'Collection(Edm.Int32)', 'Geschrieben: die Abhängigkeiten als LookupIds in „Informationsträger"');
ok(!('Standorte' in pdFelder) && !('StandorteLookupId' in pdFelder) && !('Asset_x002d_Owner' in pdFelder) && !('Asset_x002d_OwnerLookupId' in pdFelder), 'Nachschlagen in andere Listen schreibt die App nicht');
ok(pdFelder.LinkzudenInformationen.Url === 'https://x/neu' && pdFelder.LinkzudenInformationen.Description === 'Neu' && pdFelder['Asset_x002d_Typ'] === 'Unterstützend' && pdFelder.weitereInfos === 'Papierform alle außer SHB/WGC' && !('Kategorie' in pdFelder),
  'Hyperlink als {Url, Description}, die Art in Worten, die Beschreibung in „weitere Infos", keine erfundene Spalte');
vm.runInContext('_sp.assetRegListId = null; _assetColMeta = []; _assetCols = null; _assetMulti = new Set();', sctx);
const felder = vm.runInContext(`_assetFields(${JSON.stringify(gemappt)})`, sctx);
ok(felder.Title === 'SAP' && felder.Werke === 'HOL,WGC' && felder.Wiederherstellung === 12 && felder.Rpo === null && felder.AbhaengigJson === '["3"]' && felder.Personenbezogen === 'ja' && felder.EOL === '2027-03-01T00:00:00.000Z',
  'Geschrieben: dieselben Werte, Leeres als null, Datum als ISO');
function amVonNorm(a) { return vm.runInContext(`amVon(${JSON.stringify(a)})`, sctx); }

/* ── 3) Risiken, Notfall, Cockpit, Report, Doku, Cron ── */
ok(/const lader = \(typeof spGetAssetsVereint === 'function'\) \? spGetAssetsVereint : spGetAssets;/.test(lies('js/risiken.js')), 'Das Risiko-Register wählt Assets über denselben Leser');
ok(/spAssetSpalteDa\('Wiederherstellung'\)/.test(lies('js/notfall.js')), 'Notfall nimmt die Wiederherstellzeit erst dann aus der Liste, wenn die Spalte da ist – sonst ginge sie verloren');
const nf = lies('js/notfall.js');
ok(/function _nfKanon\(id\)/.test(nf) && /function _nfAssetRtoMap\(\)/.test(nf) && /function _nfMitAusfall\(id\)/.test(nf), 'Notfall: kanonische Ids, Wiederherstellzeit vom Asset, mitgerissene Assets');
ok(/await spUpdateAsset\(a\.id, Object\.assign\(\{\}, a, \{ wiederherstellung: h \}\)\)/.test(nf), 'Die Wiederherstellzeit wird ins Register geschrieben – eine Wahrheit');
ok(/assetInfo: _nfAssetInfo\(\)/.test(nf) && /Vererbung/.test(lies('js/notfallmodell.js')), 'Die Vererbung erreicht die Prozess-Prüfung');
ok(/tile\('assets',\s*'🗂', 'Assetregister',\s*'assets'\)/.test(lies('js/cockpit.js')) && /async function _ckLoadAssets/.test(lies('js/cockpit.js')), 'Cockpit-Kachel');
const cl = lies('js/clevelreport.js');
ok(/add\('ISO A\.5\.9', 'Inventar der Werte', 'gap'/.test(cl) && /add\('ISO A\.5\.12', 'Klassifizierung von Informationen'/.test(cl), 'Audit Report: A.5.9 und A.5.12');
const cron = lies('scripts/erinnerungen.mjs');
ok(/Asset-Digest/.test(cron) && /ismsListe\('Assets'\)/.test(cron) && /_require\('\.\.\/js\/assetmodell\.js'\)/.test(cron) && /\?ansicht=assets/.test(cron), 'Der Cron mahnt aus derselben Liste – mit demselben Modell');
ok(/async function ismsSpalten\(listId\)/.test(cron) && /AM\.amSpalteFinden\(spalten, erwartet\)/.test(cron) && /AM\.amAusFeldern\(f, \{ feld, lookup, standorte: standorteDerApp\(\) \}\)/.test(cron) && /ismsItems\(liste\.id, AM\.amSelectVon\(spalten, feld\)\)/.test(cron),
  'Der Cron liest die Spalten des Hauses über dieselbe Zuordnung – Asset-Owner ist ein Verantwortlicher, nicht „keiner"');
const eins = lies('js/einstellungen.js');
ok(/seg\('assets', '🗂 Assetregister'\)/.test(eins) && /function _assetsBereichHtml/.test(eins) && /cfgAssetFeldHinzu/.test(eins) && /cfgAssetKatStandard/.test(eins), 'Einstellungen: dritter Bereich mit Zusatzfeldern und Kategorien');

const dctx = { console, esc: (s) => String(s ?? ''), module: { exports: {} } };
dctx.window = dctx; dctx.globalThis = dctx;
vm.createContext(dctx);
vm.runInContext(lies('js/notfallmodell.js'), dctx);
vm.runInContext(lies('js/assetmodell.js'), dctx);
vm.runInContext(lies('js/dokumentation.js'), dctx);
const doku = vm.runInContext('_dokuSections()', dctx);
const abschnitt = doku.slice(doku.indexOf('id="doku-assets"'), doku.indexOf('id="doku-ausnahmen"'));
ok(abschnitt.length > 3000 && !/\$\{/.test(abschnitt) && /Schutzbedarfs-Vererbung/.test(abschnitt) && /90 Tage vor EOL/.test(abschnitt), 'Der Doku-Abschnitt rendert, ohne Platzhalter, mit Zahl aus dem Modell');

/* ── 4) Die Ansicht im Sandkasten ── */
const gemeldet = [], geschrieben = [];
let modal = null, bestaetigt = true;
const bestand = [
  { id: '1', titel: 'SAP S/4', title: 'SAP S/4', kategorie: 'anwendung', werke: ['ALLE'], verantwortlich: 'anna@dihag.com', vertraulichkeit: 'hoch', integritaet: 'hoch', verfuegbarkeit: 'sehr hoch', klassifizierung: 'intern', wiederherstellung: 12, rpo: 4, abhaengigVon: ['2'], status: 'aktiv', zusatz: { inventarnummer: '4711' }, historie: [], tags: [] },
  { id: '2', titel: 'Netzwerk Werk', title: 'Netzwerk Werk', kategorie: 'netz', werke: ['HOL'], verfuegbarkeit: 'hoch', status: 'aktiv', abhaengigVon: [], zusatz: {}, historie: [], tags: [] },
  { id: '3', titel: 'Alter Drucker', title: 'Alter Drucker', kategorie: 'endgeraet', werke: ['HOL'], status: 'außer Betrieb', abhaengigVon: [], zusatz: {}, historie: [], tags: [] },
];
const mounts = { 'assets-mount': { innerHTML: '' } };
const ctx = {
  console, JSON, Date, Array, Object, String, Number, Math, Set, Map, Promise, Infinity, parseInt, isNaN,
  setTimeout: (fn) => fn(),
  esc: (s) => String(s ?? ''), fmtDate: (s) => String(s ?? '').slice(0, 10), fmtDateTime: (s) => String(s ?? ''), emptyState: (t) => `<empty>${t}</empty>`,
  toast: (t, art) => gemeldet.push([t, art]),
  openModal: (h) => { modal = h; }, closeModal: () => { modal = null; },
  uiConfirm: async () => bestaetigt,
  canWriteTab: () => true, trennungGreift: () => false, meineWerke: () => ['*'],
  STANDORTE: ['HOL', 'WGC'],
  State: { user: { name: 'Anna Muster', upn: 'anna@dihag.com' } },
  getAccessConfig: () => ({ assetZusatzfelder: [{ label: 'Inventarnummer', typ: 'text', pflicht: true }, { label: 'Raum', typ: 'auswahl', optionen: 'EG; OG' }] }),
  document: { getElementById: (id) => mounts[id] || null, createElement: () => ({ click() {} }) },
  window: { open: () => ({ document: { open() {}, write() {}, close() {} } }) },
  Blob: function () {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  spGetAssetRegister: async () => JSON.parse(JSON.stringify(ctx.__bestand)),
  spAddAsset: async (a) => { geschrieben.push(['add', a]); ctx.__bestand.push(Object.assign({}, a, { id: String(100 + geschrieben.length) })); return '100'; },
  spUpdateAsset: async (id, a) => { geschrieben.push(['update', id, a]); const i = ctx.__bestand.findIndex(x => String(x.id) === String(id)); if (i >= 0) ctx.__bestand[i] = Object.assign({}, a, { id: String(id) }); },
  spDeleteAsset: async (id) => { geschrieben.push(['delete', id]); ctx.__bestand = ctx.__bestand.filter(x => String(x.id) !== String(id)); },
  spErgaenzeAssetSpalten: async () => { ctx.__spalten = true; return { angelegt: ['Wiederherstellung', 'Rpo'], fehler: [] }; },
  spAssetsListUrl: () => 'https://dihag.sharepoint.com/sites/ISMS/Lists/Assets/AllItems.aspx',
  spGetMembers: async () => [{ upn: 'anna@dihag.com', name: 'Anna Muster' }],
  spLoadLandkarte: async () => ({ daten: { karten: { HOL: { kacheln: [{ id: 'auftraege', name: 'Aufträge abwickeln', bcm: { kritikalitaet: 'hoch', rto: 8, assets: [{ id: '1' }, { id: '2' }] } }] } } } }),
  spGetRisks: async () => [{ id: 'r1', titel: 'SAP-Ausfall', status: 'offen', assets: [{ id: '1' }] }],
  spMissingAssetColumns: () => ctx.__fehlend || [],
  spIsmsSiteUrl: () => 'https://x', ASSET_COLUMNS: [{ name: 'Kategorie', typ: 'Einzelne Textzeile' }, { name: 'Wiederherstellung', typ: 'Zahl' }, { name: 'Rpo', typ: 'Zahl' }],
  module: { exports: {} },
};
ctx.__bestand = JSON.parse(JSON.stringify(bestand));
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/notfallmodell.js'), ctx);
vm.runInContext(lies('js/assetmodell.js'), ctx);
vm.runInContext(lies('js/assets.js'), ctx);

await vm.runInContext('initAssets()', ctx);
await new Promise(r => setTimeout(r, 10));
let out = mounts['assets-mount'].innerHTML;
ok(/Assets aktiv/.test(out) && /<div[^>]*>2<\/div>[\s\S]*?Assets aktiv/.test(out), 'Die Ansicht zeichnet: zwei aktive Assets (der Drucker ist außer Betrieb)');
ok(/ohne Verantwortlichen/.test(out) && /<div[^>]*color:#b91c1c">1<\/div>[\s\S]*?ohne Verantwortlichen/.test(out), 'Netz hat keinen Verantwortlichen');
ok(/1 Asset\(s\) mit zu niedrigem Schutzbedarf/.test(out), 'Netz: kritischer Prozess verlangt „sehr hoch", eingetragen „hoch" – Vererbung oben genannt');
const zeilen = [...out.matchAll(/openAssetEditor\('(\d+)'\)/g)].map(m => m[1]);
ok(zeilen.join() === '2,1', `Lückenhaftes zuerst: Netz vor SAP (${zeilen.join()})`);
ok(!/Alter Drucker/.test(out), 'Außer Betrieb ist ausgeblendet …');
vm.runInContext("_amFilter.status = 'außer Betrieb'; renderAssets()", ctx);
ok(/Alter Drucker/.test(mounts['assets-mount'].innerHTML), '… und mit Filter wieder da');
vm.runInContext("_amFilter.status = ''; renderAssets()", ctx);
ok(/↗ SharePoint/.test(out) && /🖨 Inventar/.test(out) && /⬇ CSV/.test(out) && /\+ Asset/.test(out) && !/Aus ISMS-Liste/.test(out), 'SharePoint-Link, Inventar, CSV, Anlegen – kein Import mehr, es ist dieselbe Liste');
ok(!/fehlen .* erwarteten Spalten/.test(out), 'Sind alle Spalten da, steht keine Warnung');
ctx.__fehlend = ['Wiederherstellung', 'Rpo'];
vm.runInContext('renderAssets()', ctx);
out = mounts['assets-mount'].innerHTML;
ok(/fehlen 2 von \d+ erwarteten Spalten/.test(out) && /<code>Wiederherstellung<\/code> <span[^>]*>\(Zahl\)/.test(out) && /Fehlende Spalten jetzt anlegen/.test(out) && /Lists\/Assets\/AllItems\.aspx/.test(out),
  'Fehlen Spalten: genannt mit Typ, Link in die Liste, Knopf zum Anlegen – nichts geschieht still');
await vm.runInContext('assetsSpaltenAnlegen()', ctx);
await new Promise(r => setTimeout(r, 10));
ok(ctx.__spalten === true && gemeldet.some(([t]) => /2 Spalte\(n\) angelegt/.test(t)), 'Auf Knopfdruck (nach Bestätigung) werden sie angelegt');
ctx.__fehlend = [];
ok(/title="Aufträge abwickeln">1 <span[^>]*>🚨/.test(out), 'Die Spalte Prozesse zählt – und markiert kritische');

// Editor
vm.runInContext("openAssetEditor('1')", ctx);
ok(modal && /🗂 SAP S\/4/.test(modal) && /Stammdaten/.test(modal) && /Schutzbedarf/.test(modal) && /Liegt auf \/ hängt ab von/.test(modal) && /Zusatzfelder/.test(modal) && /Verwendung/.test(modal) && /Link zu den Informationen/.test(modal) && /<label>Art /.test(modal), 'Der Editor mit allen Abschnitten – auch Art und Link');
ok(/Inventarnummer <span class="req">\*<\/span>/.test(modal) && /value="4711"/.test(modal) && /<option value="EG">/.test(modal), 'Zusatzfelder aus den Einstellungen: Pflicht-Text mit Wert, Auswahl mit Optionen');
ok(/<b>Prozesse:<\/b> Aufträge abwickeln/.test(modal) && /<b>Risiken:<\/b> SAP-Ausfall/.test(modal), 'Verwendung: Prozess und Risiko');
ok(/Netzwerk Werk/.test(modal) && /amAbhToggle\('2',this\.checked\)/.test(modal) && /checked onchange="amAbhToggle\('2'/.test(modal), 'Die Abhängigkeit auf Netz ist angehakt');
ok(!/amAbhToggle\('1'/.test(modal) && !/amAbhToggle\('3'/.test(modal), 'Sich selbst und Ausgemustertes stehen nicht zur Wahl');

// Die eine Verweigerung: Pflicht-Zusatzfeld
vm.runInContext("openAssetEditor(null); amSet('titel', 'Neuer Server'); amSet('kategorie', 'server'); amWerkToggle('HOL', true)", ctx);
await vm.runInContext('saveAsset()', ctx);
ok(geschrieben.length === 0 && gemeldet.some(([t, a]) => a === 'error' && /Pflichtfeld fehlt: Inventarnummer/.test(t)), 'Ohne Pflicht-Zusatzfeld: nicht gespeichert, beim Namen genannt');
vm.runInContext("amZusatzSetzen('inventarnummer', '0815'); amSet('verantwortlich', 'anna@dihag.com'); amSet('verfuegbarkeit', 'sehr hoch')", ctx);
await vm.runInContext('saveAsset()', ctx);
await new Promise(r => setTimeout(r, 10));
ok(geschrieben.length === 1 && geschrieben[0][0] === 'add' && geschrieben[0][1].titel === 'Neuer Server' && geschrieben[0][1].zusatz.inventarnummer === '0815' && geschrieben[0][1].werke.join() === 'HOL',
  'Mit Pflichtfeld: angelegt, Zusatzwert und Werk dabei');
ok(geschrieben[0][1].historie.length === 1 && /angelegt/.test(geschrieben[0][1].historie[0].aktion), 'Mit Verlaufsvermerk');
ok(gemeldet.some(([t]) => /3 Lücke\(n\) bleiben/.test(t)), '„sehr hoch" ohne Zeiten und ohne V/I: gespeichert, aber die Lücken genannt (R093 ×2, Schutzbedarf unvollständig)');

// Kreis abweisen
vm.runInContext("openAssetEditor('2'); amAbhToggle('1', true)", ctx);
ok(gemeldet.some(([t, a]) => a === 'error' && /Kreis/.test(t)) && vm.runInContext('_amEditing.abhaengigVon.length', ctx) === 0, 'Netz von SAP abhängig zu machen wäre ein Kreis – abgewiesen');

// Löschen mit Warnung
vm.runInContext("openAssetEditor('2')", ctx);
await vm.runInContext("deleteAsset('2')", ctx);
await new Promise(r => setTimeout(r, 10));
ok(geschrieben.some(g => g[0] === 'delete' && g[1] === '2'), 'Gelöscht (nach Bestätigung)');

// Nur-Lese
ctx.canWriteTab = () => false;
vm.runInContext("renderAssets(); openAssetEditor('1')", ctx);
ok(/Nur-Lese-Zugriff/.test(mounts['assets-mount'].innerHTML) && !/am-save-btn/.test(modal) && /disabled/.test(modal), 'Ohne Schreibrecht: gesagt, Editor gesperrt');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
