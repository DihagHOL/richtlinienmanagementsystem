/**
 * Ausnahmeregister – befristete Abweichungen von Richtlinien
 *
 * Der Reifegrad-Katalog fragt in R130 vier Dinge ab: Risikobewertung,
 * Befristung, dokumentierte Entscheidung, ISB einbezogen. Ein Register, das
 * diese vier Dinge nur als Textfelder anbietet, beantwortet die Frage nicht –
 * es verschiebt sie bloß in eine Liste. Geprüft wird hier deshalb vor allem,
 * dass die vier Punkte **verweigern** können.
 *
 * Die Entscheidung, die den meisten Ärger spart, steckt in
 * excEffektiverStatus(): „abgelaufen" wird gerechnet, nicht gespeichert. Ein
 * Status, den jemand von Hand pflegen müsste, ist am Tag nach dem Stichtag
 * falsch, und niemand merkt es – deshalb gibt es ihn hier gar nicht erst.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const gemeldet = [];
let bestaetigt = true;          // Antwort von uiConfirm
const gefragt = [];
const geschrieben = [];         // was an SharePoint ginge
const heruntergeladen = [];

const ctx = {
  console, JSON, Date, Array, Object, String, Number, Math, Set, Map, Promise, isNaN, parseInt,
  setTimeout: () => {},
  esc: (s) => String(s ?? ''),
  fmtDate: (s) => String(s ?? '').slice(0, 10),
  fmtDateTime: (s) => String(s ?? ''),
  emptyState: (t) => `<empty>${t}</empty>`,
  toast: (t) => gemeldet.push(t),
  openModal: (h) => { ctx.__modal = h; },
  closeModal: () => { ctx.__modal = null; },
  uiConfirm: async (text, opt) => { gefragt.push(text); return bestaetigt; },
  canWriteTab: () => true,
  canReadTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC', 'ZAI'],
  State: { user: { name: 'Anna Muster', upn: 'anna@dihag.com' }, policies: [
    { id: '7', titel: 'Passwortrichtlinie', status: 'Freigegeben' },
    { id: '9', titel: 'Clean Desk', status: 'Freigegeben' },
  ] },
  // Sichtbarkeit: Standard „alles sehen"; einzelne Prüfungen setzen das um.
  geltungSichtbar: () => true,
  riskStufe: (s) => (s >= 15 ? 'hoch' : s >= 8 ? 'mittel' : s ? 'niedrig' : ''),
  _riskScoreBadge: (e, a) => `<b>${(e || 0) * (a || 0)}</b>`,
  RISK_E_LABELS: ['', 'sehr selten', 'selten', 'möglich', 'wahrscheinlich', 'fast sicher'],
  RISK_A_LABELS: ['', 'gering', 'spürbar', 'erheblich', 'schwerwiegend', 'existenzbedrohend'],
  document: {
    getElementById: () => null,
    createElement: () => ({ click() { heruntergeladen.push(this.download); } }),
  },
  Blob: function (teile) { this.teile = teile; },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  spGetExceptions: async () => JSON.parse(JSON.stringify(ctx.__bestand)),
  spAddException: async (a) => { geschrieben.push(['add', a]); return '99'; },
  spUpdateException: async (id, a) => { geschrieben.push(['update', id, a]); },
  spDeleteException: async (id) => { geschrieben.push(['delete', id]); },
  spMissingExceptionColumns: () => [],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/ausnahmen.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* Heute festnageln – sonst wechselt das Ergebnis mit dem Kalender. */
run(`excHeute = () => '2026-09-07';`);

const bau = (o) => Object.assign({
  id: '1', titel: 'Ausnahme', beschreibung: 'weicht ab', richtlinieId: '7',
  richtlinieTitel: 'Passwortrichtlinie', abschnitt: '', begruendung: 'weil',
  antragsteller: 'bob@dihag.com', werke: [], risiko: { e: 3, a: 3 }, risikoId: '',
  kompensation: '', status: 'beantragt', befristetBis: '2026-12-31T00:00:00Z',
  entscheider: '', entschiedenAm: '', entscheidungKommentar: '', isb: 'isb@dihag.com',
  isbAm: '2026-09-01T00:00:00Z', historie: [],
}, o);

/* ── 1) „abgelaufen" wird gerechnet, nicht gespeichert ── */
ok(run(`EXC_STATUS.includes('abgelaufen')`) === false,
  '„abgelaufen" ist kein speicherbarer Status – sonst wäre er am Tag nach dem Ablauf falsch');
ctx.__a = bau({ status: 'genehmigt', befristetBis: '2026-12-31T00:00:00Z' });
ok(run(`excEffektiverStatus(__a)`) === 'genehmigt', 'Eine laufende Genehmigung gilt');
ok(run(`excTageBisAblauf(__a)`) === 115, 'Die Restlaufzeit wird in Tagen ausgewiesen');
ctx.__a = bau({ status: 'genehmigt', befristetBis: '2026-09-06T00:00:00Z' });
ok(run(`excEffektiverStatus(__a)`) === 'abgelaufen', 'Einen Tag nach dem Enddatum ist sie abgelaufen – ohne Zutun');
ok(run(`excTageBisAblauf(__a)`) === -1, 'Und die Überfälligkeit ist negativ');
ok(run(`excIstAktiv(__a)`) === false, 'Auf eine abgelaufene Ausnahme kann sich niemand berufen');
ctx.__a = bau({ status: 'genehmigt', befristetBis: '2026-09-07T00:00:00Z' });
ok(run(`excEffektiverStatus(__a)`) === 'genehmigt', 'Am Enddatum selbst gilt sie noch – der Tag gehört dazu');
ctx.__a = bau({ status: 'abgelehnt', befristetBis: '2020-01-01T00:00:00Z' });
ok(run(`excEffektiverStatus(__a)`) === 'abgelehnt',
  'Ein abgelehnter Antrag läuft nicht ab – nur Genehmigungen haben eine Frist');
ctx.__a = bau({ status: 'genehmigt', befristetBis: '' });
ok(run(`excEffektiverStatus(__a)`) === 'genehmigt' && run(`excTageBisAblauf(__a)`) === null,
  'Ohne Enddatum gibt es keine Restlaufzeit (Altbestand bleibt lesbar)');

/* ── 2) Auslaufwarnung ── */
ctx.__a = bau({ status: 'genehmigt', befristetBis: '2026-10-01T00:00:00Z' });
ok(run(`excLaeuftAus(__a)`) === true, `Innerhalb von ${run(`EXC_WARNUNG_TAGE`)} Tagen wird gewarnt`);
ctx.__a = bau({ status: 'genehmigt', befristetBis: '2026-11-30T00:00:00Z' });
ok(run(`excLaeuftAus(__a)`) === false, 'Weiter entfernt noch nicht');
ctx.__a = bau({ status: 'genehmigt', befristetBis: '2026-01-01T00:00:00Z' });
ok(run(`excLaeuftAus(__a)`) === false, 'Und was schon abgelaufen ist, „läuft" nicht mehr aus');

/* ── 3) Die Pflichtfelder – jedes einzeln ── */
const fehlt = (o, teil) => {
  ctx.__a = bau(o);
  return run(`excPflichtfehler(__a)`).some(m => m.includes(teil));
};
ok(fehlt({ titel: '' }, 'Kurzbezeichnung'), 'Ohne Kurzbezeichnung geht nichts');
ok(fehlt({ richtlinieId: '' }, 'Richtlinie'), 'Ohne betroffene Richtlinie ebenso');
ok(fehlt({ beschreibung: '' }, 'abgewichen'), 'Ohne Angabe, wovon abgewichen wird');
ok(fehlt({ begruendung: '' }, 'Begründung'), 'Ohne Begründung');
ok(fehlt({ antragsteller: '  ' }, 'Antragsteller'), 'Ohne Antragsteller (Leerzeichen zählen nicht)');
ok(fehlt({ befristetBis: '' }, 'Befristung'), 'Und ohne Befristung – R130 verlangt sie ausdrücklich');
ctx.__a = bau({});
ok(run(`excPflichtfehler(__a).length`) === 0, 'Vollständig ausgefüllt bleibt nichts übrig');

/* ── 4) Genehmigen verlangt mehr als Erfassen ──
   Ein Antrag darf unvollständig entstehen; eine Genehmigung darf es nicht. */
ctx.__a = bau({ risiko: { e: 0, a: 0 } });
ok(run(`excPflichtfehler(__a).length`) === 0 && run(`excGenehmigungsfehler(__a,'chef@dihag.com')`).some(m => m.includes('Risikobewertung')),
  'Ohne Risikobewertung lässt sich erfassen, aber nicht genehmigen');
ctx.__a = bau({ isb: '' });
ok(run(`excGenehmigungsfehler(__a,'chef@dihag.com')`).some(m => m.includes('ISB')),
  'Ohne einbezogenen ISB keine Genehmigung');
ctx.__a = bau({ risiko: { e: 5, a: 3 }, kompensation: '' });
ok(run(`excRisikoWert(__a)`) === 15 && run(`excGenehmigungsfehler(__a,'chef@dihag.com')`).some(m => m.includes('kompensierende')),
  'Bei hohem Risiko (≥15) sind kompensierende Maßnahmen zu benennen');
ctx.__a = bau({ risiko: { e: 4, a: 3 }, kompensation: '' });
ok(run(`excGenehmigungsfehler(__a,'chef@dihag.com').length`) === 0,
  'Darunter nicht – zwei Grenzen für dieselbe Skala wären nicht erklärbar');
ctx.__a = bau({ antragsteller: 'Bob@DIHAG.com' });
ok(run(`excGenehmigungsfehler(__a,'bob@dihag.com')`).some(m => m.includes('Vier-Augen')),
  'Wer beantragt hat, genehmigt nicht selbst – auch nicht mit anderer Groß-/Kleinschreibung');
ok(run(`excGenehmigungsfehler(__a,'chef@dihag.com').length`) === 0, 'Eine andere Person darf');

/* ── 5) Laufzeit ── */
ctx.__a = bau({ befristetBis: '2027-12-31T00:00:00Z' });
ok(Math.round(run(`excLaufzeitMonate(__a)`)) === 16, 'Die Laufzeit wird in Monaten ausgewiesen (480 Tage = 16 Monate)');
ok(run(`EXC_MAX_MONATE`) === 12, 'Vorgesehen sind zwölf – darüber wird nachgefragt, nicht verboten');

/* ── 6) Gesellschafts-Trennung ── */
run(`geltungSichtbar = (g) => !Array.isArray(g) || !g.length || g.includes('WGC');`);
ctx.__bestand = [
  bau({ id: '1', titel: 'nur WGC', werke: ['WGC'] }),
  bau({ id: '2', titel: 'nur ZAI', werke: ['ZAI'] }),
  bau({ id: '3', titel: 'konzernweit', werke: [] }),
];
run(`_excs = JSON.parse(JSON.stringify(__bestand));`);
const sicht = run(`excSichtbare().map(a => a.titel)`);
ok(sicht.length === 2 && sicht.includes('nur WGC') && sicht.includes('konzernweit'),
  'Fremde Gesellschaften bleiben verborgen, die eigene und Konzernweites nicht');
ok(!sicht.includes('nur ZAI'), 'Die Ausnahme eines anderen Werks taucht nicht auf');
run(`geltungSichtbar = () => true;`);

/* ── 7) Ausnahmen an einer Richtlinie – nur die, die heute tragen ── */
run(`_excs = [
  { id:'a', titel:'gilt',      richtlinieId:'7', status:'genehmigt', befristetBis:'2026-12-31T00:00:00Z', werke:[] },
  { id:'b', titel:'abgelaufen',richtlinieId:'7', status:'genehmigt', befristetBis:'2026-01-01T00:00:00Z', werke:[] },
  { id:'c', titel:'beantragt', richtlinieId:'7', status:'beantragt', befristetBis:'2026-12-31T00:00:00Z', werke:[] },
  { id:'d', titel:'andere',    richtlinieId:'9', status:'genehmigt', befristetBis:'2026-12-31T00:00:00Z', werke:[] },
];`);
const zu7 = run(`excZuRichtlinie('7').map(a => a.titel)`);
ok(zu7.length === 1 && zu7[0] === 'gilt',
  'Zu einer Richtlinie zählen nur wirksame Ausnahmen – kein Antrag, nichts Abgelaufenes');
ok(run(`excZuRichtlinie('').length`) === 0, 'Ohne Richtlinie keine Treffer');
ok(run(`excZuRichtlinie(7).length`) === 1, 'Die Kennung darf Zahl oder Text sein');

/* ── 8) Sortierung: was drängt, steht oben ── */
run(`_excs = [
  { id:'1', titel:'ruhig',      status:'genehmigt', befristetBis:'2027-06-01T00:00:00Z', werke:[], risiko:{e:1,a:1} },
  { id:'2', titel:'abgelaufen', status:'genehmigt', befristetBis:'2026-05-01T00:00:00Z', werke:[], risiko:{e:1,a:1} },
  { id:'3', titel:'wartet',     status:'beantragt', befristetBis:'2027-06-01T00:00:00Z', werke:[], risiko:{e:1,a:1} },
  { id:'4', titel:'laeuft aus', status:'genehmigt', befristetBis:'2026-09-20T00:00:00Z', werke:[], risiko:{e:1,a:1} },
];
_excFilter = { q:'', status:'', werk:'', nurAktive:false };`);
ok(run(`_excGefiltert().map(a => a.titel).join('|')`) === 'abgelaufen|laeuft aus|wartet|ruhig',
  'Abgelaufen zuerst, dann auslaufend, dann wartende Anträge, dann der Rest');
run(`_excFilter.nurAktive = true;`);
ok(run(`_excGefiltert().map(a => a.titel).join('|')`) === 'laeuft aus|ruhig',
  '„nur aktuell gültige" blendet Abgelaufenes und Anträge aus');
run(`_excFilter = { q:'', status:'abgelaufen', werk:'', nurAktive:false };`);
ok(run(`_excGefiltert().length`) === 1 && run(`_excGefiltert()[0].titel`) === 'abgelaufen',
  'Nach „abgelaufen" lässt sich filtern, obwohl der Status nirgends gespeichert ist');
run(`_excFilter = { q:'', status:'', werk:'', nurAktive:false };`);

/* ── 9) Speichern ── */
ctx.__bestand = [];
run(`_excs = []; _excEditing = ${JSON.stringify(bau({ id: null, titel: '' }))};`);
gemeldet.length = 0; geschrieben.length = 0;
await run(`saveAusnahme()`);
ok(geschrieben.length === 0 && /Kurzbezeichnung/.test(gemeldet.join(' ')),
  'Unvollständiges wird nicht gespeichert, und die Meldung sagt was fehlt');

run(`_excEditing = ${JSON.stringify(bau({ id: null }))};`);
gemeldet.length = 0; geschrieben.length = 0;
await run(`saveAusnahme()`);
ok(geschrieben.length === 1 && geschrieben[0][0] === 'add', 'Vollständiges wird angelegt');
ok(geschrieben[0][1].historie.length === 1 && geschrieben[0][1].historie[0].aktion === 'beantragt',
  'Und der Verlauf hält fest, dass es ein Antrag war');
ok(geschrieben[0][1].historie[0].wer === 'Anna Muster', 'Mit Namen der handelnden Person');

/* Zu lange Laufzeit: Nachfrage, keine Sperre. */
run(`_excEditing = ${JSON.stringify(bau({ id: null, befristetBis: '2029-01-01T00:00:00Z' }))};`);
gefragt.length = 0; geschrieben.length = 0; bestaetigt = false;
await run(`saveAusnahme()`);
ok(gefragt.length === 1 && /Monate/.test(gefragt[0]) && geschrieben.length === 0,
  'Über zwölf Monate wird nachgefragt – und ein „nein" hält an');
bestaetigt = true;
await run(`saveAusnahme()`);
ok(geschrieben.length === 1, 'Ein „ja" speichert trotzdem – die Entscheidung liegt bei der Person');

/* ── 10) Entscheiden ── */
run(`_excEditing = ${JSON.stringify(bau({ id: '5', antragsteller: 'anna@dihag.com' }))};`);
gemeldet.length = 0; geschrieben.length = 0;
await run(`entscheideAusnahme('genehmigt')`);
ok(geschrieben.length === 0 && /Vier-Augen/.test(gemeldet.join(' ')),
  'Die eigene Ausnahme lässt sich nicht selbst genehmigen');

run(`_excEditing = ${JSON.stringify(bau({ id: '5', isb: '' }))};`);
gemeldet.length = 0; geschrieben.length = 0;
await run(`entscheideAusnahme('genehmigt')`);
ok(geschrieben.length === 0 && /ISB/.test(gemeldet.join(' ')), 'Und nicht ohne ISB');

run(`_excEditing = ${JSON.stringify(bau({ id: '5', isb: '' }))};`);
geschrieben.length = 0;
await run(`entscheideAusnahme('abgelehnt')`);
ok(geschrieben.length === 1 && geschrieben[0][2].status === 'abgelehnt',
  'Ablehnen geht dagegen auch ohne ISB – geprüft wird, was genehmigt wird');

run(`_excEditing = ${JSON.stringify(bau({ id: '5', entscheidungKommentar: 'nur Halle 3' }))};`);
geschrieben.length = 0;
await run(`entscheideAusnahme('genehmigt')`);
const gesp = geschrieben[0][2];
ok(gesp.status === 'genehmigt' && gesp.entscheider === 'anna@dihag.com' && !!gesp.entschiedenAm,
  'Eine Genehmigung trägt Person und Zeitpunkt – „Entscheidung dokumentiert" (R130)');
ok(gesp.historie.some(h => h.aktion.includes('genehmigt') && h.aktion.includes('nur Halle 3')),
  'Der Kommentar steht im Verlauf, nicht nur im Feld');

/* Fehlschlag beim Schreiben nimmt den Vermerk zurück. */
run(`_excEditing = ${JSON.stringify(bau({ id: '5' }))};`);
ctx.spUpdateException = async () => { throw new Error('Netz weg'); };
gemeldet.length = 0;
await run(`entscheideAusnahme('genehmigt')`);
ok(run(`_excEditing.historie.length`) === 0 && /Netz weg/.test(gemeldet.join(' ')),
  'Scheitert das Speichern, bleibt kein Verlaufseintrag zurück, der nie stattfand');
ctx.spUpdateException = async (id, a) => { geschrieben.push(['update', id, a]); };

/* ── 11) Nur-Lese-Zugriff ── */
run(`canWriteTab = () => false; _excEditing = ${JSON.stringify(bau({ id: '5' }))};`);
geschrieben.length = 0; gemeldet.length = 0;
await run(`saveAusnahme()`);
await run(`entscheideAusnahme('genehmigt')`);
ok(geschrieben.length === 0 && /Nur Lesezugriff/.test(gemeldet.join(' ')),
  'Ohne Schreibrecht wird weder gespeichert noch entschieden');
run(`canWriteTab = () => true;`);

/* ── 12) CSV ── */
run(`_excs = [ ${JSON.stringify(bau({ titel: 'Semikolon; und "Anführung"', status: 'genehmigt' }))} ];
_excFilter = { q:'', status:'', werk:'', nurAktive:false };`);
heruntergeladen.length = 0;
run(`ausnahmenExportCsv()`);
ok(heruntergeladen[0] === 'Ausnahmeregister_2026-09-07.csv', 'Der Export trägt das Datum im Namen');

/* ── 13) Angeschlossen? ── */
const html = lies('index.html');
const acc  = lies('js/access.js');
const app  = lies('js/app.js');
const sp   = lies('js/sharepoint.js');
ok(/<script src="js\/ausnahmen\.js\?v=/.test(html), 'Das Skript ist eingebunden – mit ?v= für das Cache-Busting');
ok(/id="view-ausnahmen"/.test(html) && /id="ausnahmen-mount"/.test(html), 'Ansicht und Ankerpunkt stehen im HTML');
ok(/id="nav-ausnahmen"/.test(html) && /data-view="ausnahmen"/.test(html), 'Und der Navigationseintrag');
ok(/view: 'ausnahmen'/.test(acc), 'Der Reiter ist einzeln berechtigbar (GOVERNABLE_TABS)');
ok(/show\('nav-ausnahmen'/.test(acc), 'Die Navigation blendet ihn nach Recht ein und aus');
ok(/v\.vorschlaege \|\| v\.ausnahmen/.test(acc), 'Die Gruppenüberschrift „Regelwerk" erscheint auch, wenn nur er sichtbar ist');
ok(/if \(view === 'ausnahmen'.*initAusnahmen/.test(app), 'Der Reiterwechsel ruft die Ansicht auf');
ok(/'prozesse', 'ausnahmen'\]\.includes\(view\)/.test(app),
  'Er zählt zu den Daten-Reitern – sonst wäre die Richtlinien-Auswahl im Editor leer');
ok(/ausnahmen: 'Ausnahmeregister'/.test(app), 'Und trägt einen Seitentitel');

/* ── 14) Datenschicht ── */
ok(/exceptionList: 'Ausnahmen'/.test(sp), 'Die Liste heißt „Ausnahmen"');
const spalten = (sp.match(/const EXC_COLUMNS = \[([\s\S]*?)\];/) || [])[1] || '';
for (const feld of ['BefristetBis', 'RisikoEintritt', 'IsbUPN', 'EntscheiderUPN', 'EntschiedenAm', 'HistorieJson']) {
  ok(spalten.includes(`'${feld}'`), `Spalte ${feld} ist vorgesehen`);
}
ok(/if \(a\.befristetBis\)\s+all\.BefristetBis/.test(sp),
  'Leere Datumsfelder werden weggelassen – Graph nimmt einen leeren Text nicht als Datum');
ok(/if \(k === 'Title' \|\| !_excCols \|\| _excCols\.has\(k\)\)/.test(sp),
  'Geschrieben wird nur, was die Liste an Spalten hat – fehlt eine, scheitert nicht der ganze Satz');
ok(/function spEnsureExceptionList/.test(sp) && /list: \{ template: 'genericList' \}/.test(sp),
  'Die Liste wird bei Bedarf selbst angelegt');

/* ── 15) Der Erinnerungs-Cron ──
   „Befristet" ist nur dann eine Eigenschaft, wenn jemand vom Ablauf erfährt.
   Ohne diese Mail wäre die Frist im Register bloß ein Datum in einer Spalte. */
const cron = lies('scripts/erinnerungen.mjs');
ok(/Ausnahmen-Digest/.test(cron), 'Der Cron meldet fällige Ausnahmen');
ok(/ismsListe\('Ausnahmen'\)/.test(cron), 'Und sucht die Liste auf der ISMS-Site, wo die App sie anlegt');
ok(/abgelaufen seit \$\{-tage\} Tag\(en\)/.test(cron), 'Abgelaufenes wird beim Namen genannt');
ok(/wartet auf Entscheidung/.test(cron), 'Liegengebliebene Anträge ebenso');
ok(/genehmigt, aber ohne Enddatum/.test(cron), 'Und Altbestand ohne Befristung fällt auf, statt durchzurutschen');
ok(/\?ansicht=ausnahmen/.test(cron), 'Die Mail verlinkt direkt in den Reiter');

/* Dabei gefunden: Der Risiko-Digest suchte seine Liste auf der App-Site,
   angelegt wird sie aber auf der ISMS-Site. Er hat nie etwas gefunden – und
   das Protokoll las sich dabei wie ein normaler Zustand. */
ok(/const riskList = await ismsListe\('Risiken'\)/.test(cron),
  'Auch der Risiko-Digest sucht jetzt auf der ISMS-Site – vorher fand er nie etwas');
ok(!/lists\?\$filter=displayName eq 'Risiken'/.test(cron),
  'Die alte Suche auf der App-Site ist weg, nicht bloß danebengestellt');

/* ── 16) Der Hinweis an der Richtlinie ──
   Wer eine Regel befolgen soll, muss wissen, ob sie für ihn ausgesetzt ist.
   Deshalb steht der Hinweis an der Richtlinie und nicht nur im Register. Er
   darf aber nichts aufhalten und nichts Falsches behaupten, solange die Daten
   noch unterwegs sind. */

// Ein winziges DOM: Platzhalter, die sich füllen lassen.
const knoten = [];
ctx.document.querySelectorAll = (sel) => {
  const attr = sel.replace(/[\[\]]/g, '');
  return { forEach: (fn) => knoten.filter(k => k.attr === attr).forEach(fn) };
};
const platzhalter = (attr, wert) => {
  const k = { attr, wert, innerHTML: '', getAttribute: () => wert };
  knoten.push(k); return k;
};

run(`_excs = null;`);
ok(run(`_excMarkerInhalt('7')`) === '',
  'Solange nichts geladen ist, behauptet der Marker nichts – kein „0 Ausnahmen", das gleich falsch wäre');
ok(/data-exc-fuer="7"/.test(run(`excMarkerHtml('7')`)),
  'Der Platzhalter steht trotzdem schon da – gefüllt wird er, wenn die Daten eintreffen');

run(`_excs = [
  { id:'a', titel:'Terminals Halle 3', richtlinieId:'7', status:'genehmigt', befristetBis:'2026-12-31T00:00:00Z', werke:['WGC'] },
  { id:'b', titel:'alt',               richtlinieId:'7', status:'genehmigt', befristetBis:'2026-01-01T00:00:00Z', werke:[] },
  { id:'c', titel:'Antrag',            richtlinieId:'7', status:'beantragt', befristetBis:'2026-12-31T00:00:00Z', werke:[] },
  { id:'d', titel:'Clean Desk SHB',    richtlinieId:'9', status:'genehmigt', befristetBis:'2026-11-01T00:00:00Z', werke:['SHB'] },
];`);
const marker7 = run(`_excMarkerInhalt('7')`);
ok(/1 Ausnahme</.test(marker7),
  'Gezählt wird nur, was heute trägt – nicht das Abgelaufene, nicht der Antrag');
ok(/Terminals Halle 3 \(bis 2026-12-31\)/.test(marker7), 'Der Kurztext nennt sie beim Namen und mit Frist');
ok(run(`_excMarkerInhalt('9')`).includes('1 Ausnahme'), 'Eine andere Richtlinie hat ihre eigene');
ok(run(`_excMarkerInhalt('999')`) === '', 'Wo keine gilt, steht nichts – kein leerer Kasten');
run(`_excs.push({ id:'e', titel:'zweite', richtlinieId:'7', status:'genehmigt', befristetBis:'2026-12-31T00:00:00Z', werke:[] });`);
ok(/2 Ausnahmen</.test(run(`_excMarkerInhalt('7')`)), 'Mehrzahl wird gebildet');

/* Trennung nach Gesellschaft: Was einem anderen Werk gehört, taucht auch hier nicht auf. */
run(`geltungSichtbar = (g) => !Array.isArray(g) || !g.length || g.includes('ZAI');`);
ok(run(`_excMarkerInhalt('9')`) === '', 'Die Ausnahme eines fremden Werks erscheint nicht an der Richtlinie');
ok(/1 Ausnahme</.test(run(`_excMarkerInhalt('7')`)), 'Konzernweites bleibt sichtbar');
run(`geltungSichtbar = () => true;`);

/* Der ausführliche Hinweis in der Detailansicht. */
const hinweis = run(`_excHinweisInhalt('7')`);
ok(/genehmigte Ausnahmen von dieser Richtlinie/.test(hinweis), 'In der Detailansicht steht ein ganzer Hinweis');
ok(/Im Übrigen gilt die Richtlinie unverändert/.test(hinweis),
  'Mit dem Satz, der die Fehldeutung verhindert – ausgesetzt ist der Punkt, nicht die Regel');
ok(/konzernweit/.test(hinweis) && /WGC/.test(hinweis), 'Und je Eintrag, für wen sie gilt');
ok(!/Begründung|Risiko|ISB/.test(hinweis),
  'Aber ohne Begründung, Risikobewertung und ISB – die Akte bleibt im Register');
ok(/Ausnahmeregister öffnen/.test(hinweis), 'Mit Recht auf den Reiter führt ein Weg dorthin');
run(`canReadTab = (v) => v !== 'ausnahmen';`);
ok(!/Ausnahmeregister öffnen/.test(run(`_excHinweisInhalt('7')`)) && /genehmigte Ausnahmen/.test(run(`_excHinweisInhalt('7')`)),
  'Ohne dieses Recht bleibt der Hinweis – nur der Weg ins Register fehlt');
run(`canReadTab = () => true;`);

/* Platzhalter füllen sich nachträglich, ohne dass die Liste neu gezeichnet wird. */
const m1 = platzhalter('data-exc-fuer', '7');
const m2 = platzhalter('data-exc-hinweis', '7');
const m3 = platzhalter('data-exc-fuer', '999');
run(`excMarkerAktualisieren()`);
ok(/2 Ausnahmen</.test(m1.innerHTML) && /genehmigte Ausnahmen/.test(m2.innerHTML),
  'Beide Platzhalter werden gefüllt, wenn die Daten da sind');
ok(m3.innerHTML === '', 'Und einer ohne Treffer bleibt leer');

/* Das Nachladen: einmal, still, und niemals eine Liste anlegen. */
let leiseAufrufe = 0;
ctx.spGetExceptionsLeise = async () => { leiseAufrufe++; return [
  { id:'x', titel:'nachgeladen', richtlinieId:'7', status:'genehmigt', befristetBis:'2026-12-31T00:00:00Z', werke:[] }]; };
run(`_excs = null; _excLeiseVersucht = false; _excsLoading = false;`);
await run(`excHintergrundLaden()`);
ok(leiseAufrufe === 1 && run(`_excs.length`) === 1, 'Der Hintergrundlauf holt den Bestand');
ok(/nachgeladen/.test(m1.innerHTML), 'Und füllt dabei die Platzhalter, die schon im Dokument stehen');
await run(`excHintergrundLaden()`);
await run(`excHintergrundLaden()`);
ok(leiseAufrufe === 1, 'Danach nicht noch einmal – einmal je Sitzung genügt');

run(`_excs = null; _excLeiseVersucht = false;`);
ctx.spGetExceptionsLeise = async () => { throw new Error('kein Zugriff'); };
gemeldet.length = 0;
await run(`excHintergrundLaden()`);
ok(run(`_excs`) === null && gemeldet.length === 0,
  'Scheitert es, bleibt es still – eine Fehlermeldung auf der Startseite hülfe niemandem');

run(`_excs = null; _excLeiseVersucht = false;`);
ctx.spGetExceptionsLeise = async () => null;
await run(`excHintergrundLaden()`);
ok(run(`_excs`) === null,
  'Gibt es die Liste noch nicht, bleibt der Bestand ungesetzt – der Reiter zeigt dann seine Anleitung');

/* Und die Datenschicht legt beim stillen Lesen nichts an. */
ok(/async function spGetExceptionsLeise\(\)[\s\S]{0,400}spEnsureExceptionList\(false\)/.test(sp),
  'Das stille Lesen legt keine Liste an – das täte sonst jede Anmeldung auf der Startseite');
ok(/if \(typeof excHintergrundLaden === 'function'\) excHintergrundLaden\(\);/.test(app),
  'Die Regelwerk-Ansicht stößt das Nachladen an');
ok(/\$\{typeof excMarkerHtml === 'function' \? excMarkerHtml\(p\.id\) : ''\}/.test(app),
  'Jede Regelwerkskarte trägt den Platzhalter');
ok(/\$\{typeof excHinweisHtml === 'function' \? excHinweisHtml\(p\.id\) : ''\}/.test(app),
  'Und die Detailansicht den ausführlichen Hinweis');
ok(!/await excHintergrundLaden/.test(app),
  'Ohne await – der Hinweis ist eine Zugabe und darf das Zeichnen nicht aufhalten');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
