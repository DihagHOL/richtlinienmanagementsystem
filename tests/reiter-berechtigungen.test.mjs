/**
 * Reiter-Berechtigungen: eigener Bereich, Überblick – und Sicherheitsgruppen.
 *
 * Bisher war die Rechtematrix eine Karte unter zwölf anderen, jede berechtigte
 * Person mit voll ausgeklappter Tabelle: ab einer Handvoll Leuten unübersichtlich,
 * ohne Suche, und Freigaben gingen nur an einzelne Personen.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const acc = lies('js/access.js');
const eins = lies('js/einstellungen.js');
const sp = lies('js/sharepoint.js');
const app = lies('js/app.js');

/* ══ 1) Auswertung: Person, Rolle, Sicherheitsgruppe ══ */
const ctx = {
  console,
  document: { getElementById: () => null, addEventListener: () => {} },
  State: { myRoles: ['Produktion'], myGroups: [{ id: 'AAA-111', name: 'IT-Sicherheit' }] },
  getAuthUser: () => ({ username: 'max@dihag.com' }),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(acc, ctx);
const wert = (a) => vm.runInContext(a, ctx);

wert(`setRuntimeConfig({
  admins: [], reiterRechte: {
    cockpit:     { lesen: ['max@dihag.com'] },
    risiken:     { lesen: ['gruppe:aaa-111'] },
    faelligkeit: { schreiben: ['gruppe:aaa-111'] },
    abdeckung:   { lesen: ['gruppe:bbb-222'] },
    prozesse:    { lesen: ['Produktion'] },
  }, gruppenNamen: { 'aaa-111': 'IT-Sicherheit' } })`);

ok(wert('canReadTab("cockpit")') === true, 'Eine Person mit E-Mail-Freigabe darf lesen');
ok(wert('canReadTab("prozesse")') === true, 'Eine Rollen-Freigabe wirkt weiter wie bisher');
ok(wert('canReadTab("risiken")') === true, 'Eine Gruppen-Freigabe wirkt – das Konto ist Mitglied');
ok(wert('canWriteTab("risiken")') === false, 'Nur Lesen bleibt nur Lesen');
ok(wert('canWriteTab("faelligkeit")') === true, 'Gruppen dürfen auch schreiben');
ok(wert('canReadTab("faelligkeit")') === true, 'Schreiben schließt Lesen ein');
ok(wert('canReadTab("abdeckung")') === false, 'Eine Gruppe, in der das Konto nicht ist, gibt nichts');
ok(wert('isReadOnlyTab("risiken")') === true, 'Der Reiter ist damit nur lesend offen');

wert('State.myGroups = [{ id: "aaa-111" }]');
ok(wert('canReadTab("risiken")') === true, 'Groß-/Kleinschreibung der Objekt-ID ist egal');
wert('State.myGroups = []');
ok(wert('canReadTab("risiken")') === false, 'Ohne Mitgliedschaft ist der Reiter wieder zu');
wert('State.myGroups = [{ id: "aaa-111" }]');

ok(wert('istGruppenEintrag("gruppe:aaa-111")') === true && wert('istGruppenEintrag("max@dihag.com")') === false,
  'Gruppen-Einträge sind an ihrem Präfix erkennbar');
ok(wert('gruppenIdVon("gruppe:AAA-111")') === 'aaa-111', 'Die Objekt-ID lässt sich herauslösen');
ok(wert('gruppenName("aaa-111")') === 'IT-Sicherheit', 'Der Anzeigename kommt aus der Konfiguration');
ok(wert('gruppenName("ccc-333")') === 'ccc-333', 'Ohne gepflegten Namen bleibt die ID stehen');
ok(/Die ID statt\n\s+des Namens/.test(acc), 'Gespeichert wird die ID, nicht der Name (Umbenennen bricht nichts)');

/* ══ 2) Datenschicht: eigene Gruppen, Suche ══ */
ok(/async function spGetMyGroups/.test(sp), 'Die eigenen Gruppen werden geladen');
ok(/transitiveMemberOf\/microsoft\.graph\.group/.test(sp), 'Verschachtelte Mitgliedschaften zählen mit');
ok(/me\/memberOf\/microsoft\.graph\.group/.test(sp), 'Mit Rückfall auf die direkten Mitgliedschaften');
ok(/_gruppenLesbar = false;/.test(sp), 'Scheitert beides, merkt sich die App das');
ok(/function spGruppenLesbar/.test(sp), 'Und kann es der Oberfläche sagen');
ok(/_GRUPPEN_SCOPES = SP\.scopes\.concat\(\['https:\/\/graph\.microsoft\.com\/User\.Read'\]\)/.test(sp),
  'Es werden nur bereits erteilte Berechtigungen genutzt – keine neue Zustimmungsabfrage');
ok(/catch \(e\) \{ return await acquireToken\(SP\.scopes\); \}/.test(sp),
  'Und notfalls dieselben wie bei jedem anderen Aufruf');
ok(!/GroupMember\.Read\.All|Directory\.Read\.All/.test(lies('js/auth.js')), 'Die Anmeldung bleibt unverändert');
ok(/async function spSearchGroups/.test(sp), 'Für die Auswahl gibt es eine Verzeichnissuche');
ok(/State\.myGroups = await gruppen;/.test(app) && app.indexOf('State.myGroups = await gruppen;') < app.indexOf('initRoleNav();'),
  'Beim Start stehen die Gruppen, bevor die Reiter berechnet werden');
ok(/const gruppen = \(typeof spGetMyGroups === 'function'\) \? spGetMyGroups\(\)\.catch/.test(app),
  'Und sie laden parallel – der Start wird dadurch nicht länger');

/* ══ 3) Einstellungen: zwei Bereiche ══ */
ok(/let _cfgBereich = 'rollen';/.test(eins), 'Die Einstellungen haben jetzt Unterbereiche');
ok(/function cfgBereich\(name\)/.test(eins) && !/_cfgEdit = getAccessConfig\(\);[\s\S]{0,80}_cfgRenderBereich/.test(eins.slice(eins.indexOf('function cfgBereich'))),
  'Ein Bereichswechsel wirft den Entwurf nicht weg');
ok(/🔑 Reiter-Berechtigungen/.test(eins), 'Der zweite Bereich ist benannt');
ok(/max-width:\$\{reiter \? '1100px' : '680px'\}/.test(eins), 'Für die Matrix wird die Seite breiter');
ok(/onclick="saveCfg\(\)"/.test(eins) && (eins.match(/onclick="saveCfg\(\)"/g) || []).length === 1
  && eins.indexOf('onclick="saveCfg()"') > eins.indexOf('_cfgRenderBereich'),
  'Der Speichern-Knopf steht in beiden Bereichen (einmal, außerhalb)');
ok(!/function reiterRechteCard/.test(eins), 'Die alte Karte in der langen Liste ist weg');

/* ══ 4) Überblick, Suche, Ausklappen (rechnende Teile) ══ */
const teil = eins.slice(eins.indexOf('let _rrExtra = []'), eins.indexOf('/* Positionen im KI-Gremium'));
const ctx2 = {
  console,
  document: { getElementById: () => null },
  State: { myGroups: [{ id: 'aaa-111', name: 'IT-Sicherheit' }] },
  esc: (s) => String(s ?? ''),
  toast: () => {},
  GOVERNABLE_TABS: wert('GOVERNABLE_TABS'),
  RECHT_GRUPPE: 'gruppe:',
  istGruppenEintrag: (x) => String(x || '').toLowerCase().startsWith('gruppe:'),
  gruppenIdVon: (x) => String(x || '').toLowerCase().slice(7),
};
ctx2.globalThis = ctx2;
vm.createContext(ctx2);
vm.runInContext(`var _cfgEdit = { reiterRechte: {
    risiken: { lesen: ['anna@dihag.com', 'gruppe:aaa-111'], schreiben: ['gruppe:aaa-111'] },
    cockpit: { lesen: ['bernd@dihag.com'] } },
  gruppenNamen: { 'aaa-111': 'IT-Sicherheit' } };`, ctx2);
vm.runInContext(teil, ctx2);
const w2 = (a) => vm.runInContext(a, ctx2);

const eintraege = w2('_rrEintraege()');
ok(eintraege.length === 3, `Alle Träger stehen in der Liste (${eintraege.length})`);
ok(eintraege[0].art === 'gruppe' && eintraege[0].name === 'IT-Sicherheit',
  'Gruppen stehen oben und mit Namen – sie betreffen mehrere Personen');
ok(w2('_rrStufe("risiken","gruppe:aaa-111")') === 'S', 'Schreibrecht wird als S angezeigt');
ok(w2('_rrStufe("risiken","anna@dihag.com")') === 'L', 'Leserecht als L');
ok(w2('_rrStufe("cockpit","anna@dihag.com")') === '-', 'Und kein Recht als Strich');

ok(w2('_rrGefiltert(_rrEintraege(), "anna", "").length') === 1, 'Die Suche findet eine Person');
ok(w2('_rrGefiltert(_rrEintraege(), "sicherheit", "").length') === 1, 'Und eine Gruppe über ihren Namen');
ok(w2('_rrGefiltert(_rrEintraege(), "", "cockpit").length') === 1, 'Der Reiter-Filter zeigt, wer dort hineindarf');
ok(w2('_rrGefiltert(_rrEintraege(), "", "risiken").length') === 2, 'Bei einem anderen Reiter sind es zwei');
ok(w2('_rrGefiltert(_rrEintraege(), "xyz", "").length') === 0, 'Ein Treffer ohne Ergebnis bleibt leer');

w2('rrCycle("cockpit","anna@dihag.com")');
ok(w2('_rrStufe("cockpit","anna@dihag.com")') === 'L', 'Ein Klick auf die Zelle gibt Lesen');
w2('rrCycle("cockpit","anna@dihag.com")');
ok(w2('_rrStufe("cockpit","anna@dihag.com")') === 'S', 'Der nächste Schreiben');
ok(w2('_cfgEdit.reiterRechte.cockpit.lesen.includes("anna@dihag.com")') === true,
  'Schreiben trägt auch Lesen ein – sonst wäre der Reiter unsichtbar');
w2('rrCycle("cockpit","anna@dihag.com")');
ok(w2('_rrStufe("cockpit","anna@dihag.com")') === '-', 'Und der dritte nimmt beides zurück');
ok(w2('_rrEintraege().some(e => e.key === "anna@dihag.com")') === true,
  'Der Eintrag bleibt trotzdem sichtbar – sonst wäre die Zeile weg, ehe man sie neu setzt');

w2('rrToggle("cockpit","schreiben","anna@dihag.com",true)');
ok(w2('_rrStufe("cockpit","anna@dihag.com")') === 'S', 'Das Häkchen in der Detailansicht setzt dasselbe');
w2('rrToggle("cockpit","schreiben","anna@dihag.com",false)');
ok(w2('_rrStufe("cockpit","anna@dihag.com")') === 'L', 'Schreiben abwählen lässt Lesen stehen');
w2('rrToggle("cockpit","lesen","anna@dihag.com",false)');
ok(w2('_rrStufe("cockpit","anna@dihag.com")') === '-', 'Lesen abwählen nimmt alles');

w2('rrToggleOffen("anna@dihag.com")');
ok(w2('_rrOffen.has("anna@dihag.com")') === true, 'Eine Zeile lässt sich ausklappen');
w2('rrToggleOffen("anna@dihag.com")');
ok(w2('_rrOffen.has("anna@dihag.com")') === false, 'Und wieder zu');

/* ══ 5) Sicherheitsgruppen hinzufügen und aufräumen ══ */
w2('rrAddGruppe("ccc-333","Werkleitung")');
ok(w2('_cfgEdit.gruppenNamen["ccc-333"]') === 'Werkleitung', 'Der Name wird zur Anzeige gemerkt');
ok(w2('_rrEintraege().some(e => e.key === "gruppe:ccc-333")') === true, 'Die Gruppe steht in der Liste');
ok(w2('_rrOffen.has("gruppe:ccc-333")') === true, 'Frisch hinzugefügt wird gleich aufgeklappt');
w2('_rrGruppenNamenAufraeumen(_cfgEdit)');
ok(w2('_cfgEdit.gruppenNamen["ccc-333"]') === undefined,
  'Beim Speichern fliegen Namen von Gruppen ohne Recht wieder raus');
ok(w2('_cfgEdit.gruppenNamen["aaa-111"]') === 'IT-Sicherheit', 'Berechtigte Gruppen behalten ihren Namen');
ok(/_rrGruppenNamenAufraeumen\(_cfgEdit\);\n    await spSaveAccessConfig/.test(eins), 'Das passiert beim Speichern');

w2('rrRemove("gruppe:aaa-111")');
ok(w2('_rrStufe("risiken","gruppe:aaa-111")') === '-'
  && w2('_rrEintraege().some(e => e.key === "gruppe:aaa-111")') === false,
  'Entfernen löscht alle Rechte des Eintrags und nimmt ihn aus der Liste');
ok(w2('_cfgEdit.gruppenNamen["aaa-111"]') === undefined, 'Und den gemerkten Gruppennamen gleich mit');

/* ══ 6) Oberfläche: was da sein muss ══ */
ok(/id="rr-suche"/.test(eins) && /oninput="rrSuche\(this\.value\)"/.test(eins), 'Es gibt ein Suchfeld');
ok(/onchange="rrReiterFilter\(this\.value\)"/.test(eins), 'Und einen Filter nach Reiter');
ok(/aria-expanded="\$\{offen\}"/.test(eins), 'Die Ausklapp-Schalter sind ausgezeichnet');
ok(/onclick="rrPicker\(\)"/.test(eins) && /👥 \+ Sicherheitsgruppe/.test(eins), 'Eine Gruppe lässt sich hinzufügen');
ok(/onclick="rrGruppenSuche\(\)"/.test(eins), 'Gruppen werden gesucht, nicht abgetippt');
ok(/eigenen Gruppen/.test(eins), 'Darf das Konto das Verzeichnis nicht durchsuchen, kommen die eigenen Gruppen');
ok(/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/.test(eins), 'Und notfalls die Objekt-ID – auf Format geprüft');
ok(/Gruppen-Mitgliedschaften Ihres Kontos konnten nicht gelesen werden/.test(eins),
  'Wenn Gruppen gar nicht ausgewertet werden können, steht das in den Einstellungen');
ok(/L<\/b> = Lesen, <b>S<\/b> = Schreiben/.test(eins), 'Die Kürzel der Matrix sind erklärt');

const tabs = wert('GOVERNABLE_TABS');
ok(tabs.every(t => t.kurz), 'Jeder Reiter hat ein Kürzel für die Spaltenköpfe');
ok(tabs.find(t => t.view === 'ismsdocs').label === 'IMS-Dokumente', 'Der IMS-Reiter heißt hier wie in der Navigation');
ok(tabs.find(t => t.view === 'verwaltung').label === 'Regelwerk Dashboard', 'Ebenso das Regelwerk Dashboard');
ok(!/_rrAllUsers/.test(lies('js/admin.js')) && !/_rrExtraUsers/.test(eins), 'Keine Reste der alten Umsetzung');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
