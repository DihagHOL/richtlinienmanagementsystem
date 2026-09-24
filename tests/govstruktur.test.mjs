/**
 * Reiter „Governance-Struktur".
 *
 * Das Konzernregelwerk stand bisher nur in einer Excel-Mappe und zwei Folien:
 * die Pyramide der Verbindlichkeitsebenen, das Fundament mit den Kategorien,
 * die Zuständigkeiten in der Mappe. Hier laufen die drei zusammen – und zwar
 * als Arbeitsfläche: Die Matrix ist vollständig bearbeitbar, gespeichert wird
 * in einer eigenen JSON-Datei neben der access-config. Die Konstanten in
 * js/govstruktur.js sind nur noch der Startbestand aus dem Import der Mappe.
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

const quelle = lies('js/govstruktur.js');

/* Eine Umgebung, die nur so viel Browser nachstellt, wie die Ansicht braucht. */
function umgebung(opt = {}) {
  const felder = {};
  const zustand = {
    modal: '', toasts: [], gespeichert: [], meta: opt.meta || null,
    geladen: opt.geladen || null, bestaetigen: opt.bestaetigen !== false,
  };
  const el = (id) => (felder[id] = felder[id] || {
    id, innerHTML: '', value: '', options: [], style: {},
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
  });
  const ctx = {
    console, JSON, Object, Array, Date, Set, Math, String, Number, Boolean,
    State: { policies: [{ id: '42', title: 'Informationssicherheit' }], user: { upn: 'a@dihag.com' } },
    document: { getElementById: el },
    esc: (s) => String(s ?? ''),
    emptyState: (t) => `<div class="empty">${t}</div>`,
    toast: (m) => zustand.toasts.push(m),
    confirm: () => zustand.bestaetigen,
    canWriteTab: () => opt.schreiben !== false,
    darfGovStrukturKoepfe: () => opt.struktur !== false,
    openModal: (html) => { zustand.modal = html; },
    closeModal: () => { zustand.modal = ''; },
    openDetail: () => {},
    spLoadGovStruktur: async () => zustand.geladen,
    spGovStrukturMeta: async () => zustand.meta,
    spSaveGovStruktur: async (d) => {
      zustand.gespeichert.push(JSON.parse(JSON.stringify(d)));
      zustand.meta = 'zeit-' + zustand.gespeichert.length;
      return zustand.meta;
    },
  };
  ctx.globalThis = ctx;
  ctx.jsArg ??= jsArg; vm.createContext(ctx);
  vm.runInContext(quelle, ctx);
  return { ctx, felder, zustand, w: (a) => vm.runInContext(a, ctx), el };
}

const { ctx, felder, zustand, w, el } = umgebung();
/** Ein Dialogfeld befüllen (die Elemente entstehen erst beim Zugriff). */
const setz = (id, wert) => { el(id).value = wert; };

/* ── 1) Die Daten aus der Mappe (Startbestand) ── */
const seed = w('GOV_EINTRAEGE');
const kategorien = w('GOV_KATEGORIEN');
const arten = w('GOV_ARTEN').map(a => a.key);
ok(seed.length === 70, `Alle Regelungen der Mappe sind übernommen (${seed.length})`);
ok(kategorien.length === 7, 'Sieben Kategorien wie im Konzernregelwerk-Fundament');
ok(seed.every(e => kategorien.includes(e.kategorie)), 'Jede Regelung hängt an einer bekannten Kategorie');
ok(seed.every(e => arten.includes(e.art)), 'Und an einer Dokumentenart der Pyramide');
ok(seed.every(e => e.titel && e.titel.trim()), 'Keine namenlose Regelung');
ok(seed.every(e => ['gueltig', 'arbeit', 'offen'].includes(e.status)), 'Der Stand ist auf drei Werte normiert');
ok(/const GOV_STAND = "\d\d\.\d\d\.\d{4}"/.test(quelle), 'Der Stand der Mappe ist festgehalten');

/* ── 2) Stichproben gegen die Mappe ── */
const finde = (t) => seed.find(e => e.titel.startsWith(t));
const pruef = (titel, art, kat, status, owner) => {
  const e = finde(titel);
  ok(!!e && e.art === art && e.kategorie.startsWith(kat) && e.status === status && e.owner.includes(owner),
    `${titel} → ${art}, ${kat}, ${status}, ${owner}`);
};
pruef('Corporate Governance Kodex', 'Handbuch', 'Allgemein', 'gueltig', 'Muster');
pruef('Verhaltenskodex für Geschäftspartner', 'Handbuch', 'Compliance', 'arbeit', 'Muster');
pruef('Kartellrecht', 'Konzernrichtlinie', 'Recht', 'arbeit', 'Muster');
pruef('Informationssicherheit', 'Konzernrichtlinie', 'Recht', 'gueltig', 'Muster');
pruef('Mindeststandards für IT', 'Konzernfachregelung', 'Security', 'offen', 'Muster');
pruef('Hinweisgebersystem', 'Policy', 'Compliance', 'arbeit', 'Muster');
pruef('SAP Berechtigungskonzept', 'Konzernfachregelung', 'HR', 'gueltig', 'Muster');
pruef('Dienstwagenberechtigungsstufen', 'Leitfaden', 'HR', 'arbeit', 'Muster');

/* Zwei Fälle, in denen die Überschrift der Mappe in die Irre führt: Unter
   „…_Konzernrichtlinien und Policy" bzw. „…Konzernrichtlinie und Fachregelung"
   stehen beide Arten gemischt – es zählt der Titel, nicht die Überschrift. */
ok(finde('Kreislaufwirtschaft intern').art === 'Konzernrichtlinie',
  'Kreislaufwirtschaft intern ist eine Konzernrichtlinie, keine Policy');
ok(finde('Kreislaufwirtschaft extern').art === 'Policy', 'Die externe dagegen ist eine Policy');
ok(finde('Sicherheit und Gesundheit am Arbeitsplatz').art === 'Konzernrichtlinie',
  'SGA ist eine Konzernrichtlinie, keine Fachregelung');
ok(finde('Arbeitsmedizinische Vorsorge').art === 'Konzernfachregelung', 'Die Vorsorge dagegen schon');

/* ── 3) Laden: gespeicherte Fassung schlägt den Startbestand ── */
await ctx.initGovStruktur();
ok(w('gsEintraege().length') === 70, 'Ohne gespeicherte Datei gilt der Startbestand');
ok(zustand.gespeichert.length === 0, 'Reines Anschauen speichert nichts');

const b = umgebung({ geladen: { daten: { eintraege: [{ kategorie: 'Compliance', art: 'Policy', titel: 'Nur eine', owner: 'X', status: 'offen' }], weitere: [], stand: '01.01.2027' }, geaendertAm: 'zeit-0' } });
await b.ctx.initGovStruktur();
ok(b.w('gsEintraege().length') === 1, 'Ist eine Fassung gespeichert, gilt sie – nicht der Startbestand');
ok(b.w('_gsGeaendertAm') === 'zeit-0', 'Ihr Zeitstempel wird gemerkt');
ok(/Stand 01\.01\.2027/.test(b.felder['govstruktur-mount'].innerHTML), 'Und ihr Stand steht über der Tabelle');

/* ── 4) Verantwortung und Filter ── */
ok(w('gsOwnerListe("Muster/Muster/Muster").length') === 3, 'Mehrfach-Verantwortung wird aufgeteilt (Schrägstrich)');
ok(w('gsOwnerListe("Muster, Muster, Muster").length') === 3, 'Ebenso mit Komma');
ok(w('gsOwnerListe("Muster /Muster")').join('|') === 'Muster|Muster', 'Leerzeichen werden abgeschnitten');
const owner = w('gsAlleOwner()');
ok(owner.length >= 18 && owner.includes('Muster') && owner.includes('Muster'), `Alle Verantwortlichen einzeln (${owner.length})`);
ok(w('gsGefiltert().length') === 70, 'Ohne Filter alles');
w("gsStatusFilter('gueltig')");
ok(w('gsGefiltert().length') === 7 && w('gsGefiltert().every(e => e.status === "gueltig")') === true,
  'Der Stand-Filter greift (7 final abgelegt)');
w("gsStatusFilter('')"); w("gsOwnerFilter('Muster')");
ok(w('gsGefiltert().length') === 7, 'Der Verantwortungs-Filter greift');
w("gsOwnerFilter('')"); w("gsSuche('kartell')");
ok(w('gsGefiltert().length') === 1, 'Die Suche findet über den Titel');
w("gsSuche('Muster')");
ok(w('gsGefiltert().length') === 2, 'Und über die Verantwortung');
w("gsSuche('')");

/* ── 5) Verbindung ins RMS ── */
ok(w('gsPolicyTreffer("Informationssicherheit")')?.id === '42',
  'Liegt eine Regelung schon als Regelwerk im RMS, wird sie erkannt');
ok(w('gsPolicyTreffer("Kartellrecht")') === null, 'Was fehlt, wird nicht erfunden');
ok(w('gsPolicyTreffer("KI")') === null, 'Zu kurze Titel werden nicht blind verglichen');

/* ── 6) Anzeige ── */
w('renderGovStruktur();');
const matrix = felder['govstruktur-mount'].innerHTML;
ok(/<table class="gs-tabelle">/.test(matrix), 'Die Matrix ist eine Tabelle');
ok((matrix.match(/gs-kachel/g) || []).length === 70, 'Jede Regelung bekommt eine Kachel');
ok((matrix.match(/<th class="gs-kat"/g) || []).length === 8,
  'Eine Zeile je Kategorie, dazu die Fußzeile zum Anlegen');
ok(/gs-tabelle-wrap/.test(matrix), 'Die Tabelle scrollt in ihrem eigenen Rahmen');
ok(/gs-balken/.test(matrix), 'Oben stehen Kennzahlen mit Fortschrittsbalken');
ok(/→ im RMS/.test(matrix), 'Bereits vorhandene Regelwerke sind verlinkt');
ok(/In sich abgeschlossenes Themengebiet/.test(matrix) && /Handlungsempfehlungen/.test(matrix),
  'Die Legende erklärt die Verbindlichkeitsebenen');
ok(/Weitere Regelungsebenen/.test(matrix) && /KBV/.test(matrix),
  'Leitbild, Unternehmenspolitik und die KBV stehen separat – sie gehören nicht in die Pyramide');
ok(!/gsModus|gs-modus|Nach Verantwortung/.test(quelle),
  'Die Sicht „nach Verantwortung" ist raus – sie zeigte dieselben Daten ein zweites Mal');
ok(!/gs-modus|gsModus\(/.test(lies('index.html')), 'Auch der Umschalter in der Werkzeugleiste');
ok(!/gs-modus|gs-owner-karte/.test(lies('css/style.css')), 'Und die zugehörigen Stile');

/* ── 7) Bearbeiten: anlegen, ändern, löschen ── */
ok((matrix.match(/gs-plus/g) || []).length === 7 * w('gsArten().length') + 2,
  'Beim Bearbeiten hat jede Zelle einen Plus-Knopf – auch in noch leeren Ebenen – plus je einer für Zeile und Spalte');
ok(/gsBearbeiten\(/.test(matrix) && /klickbar/.test(matrix), 'Und jede Kachel lässt sich anklicken');

w("gsNeu('Compliance','Policy');");
ok(/Neue Regelung/.test(zustand.modal), 'Der Plus-Knopf öffnet einen leeren Dialog');
ok(/value="Compliance"/.test(zustand.modal) && /value="Policy" selected/.test(zustand.modal),
  'Kategorie und Ebene sind aus der Zelle vorbelegt');
setz('gs-f-titel', 'Umgang mit Geschenken');
setz('gs-f-kategorie', 'Compliance');
setz('gs-f-art', 'Policy');
setz('gs-f-owner', 'Muster/Muster');
setz('gs-f-status', 'arbeit');
setz('gs-f-dokument', '');
setz('gs-f-version', '');
setz('gs-f-datum', '');
await ctx.gsUebernehmen();
ok(w('gsEintraege().length') === 71, 'Die neue Regelung steht in der Matrix');
ok(zustand.gespeichert.length === 1 && zustand.gespeichert[0].eintraege.length === 71,
  'Und wurde sofort gespeichert – kein extra Speichern-Knopf');
ok(zustand.gespeichert[0].gespeichertVon === 'a@dihag.com' && !!zustand.gespeichert[0].gespeichertAm,
  'Mit Zeitpunkt und Urheber in der Datei');
ok(w('GOV_EINTRAEGE.length') === 70, 'Der Startbestand im Code bleibt unberührt');
ok(w('gsAlleOwner()').includes('Muster'), 'Neue Verantwortliche tauchen im Filter auf');

const neuIdx = w('gsEintraege().findIndex(e => e.titel === "Umgang mit Geschenken")');
w(`gsBearbeiten(${neuIdx});`);
ok(/Regelung bearbeiten/.test(zustand.modal) && /value="Umgang mit Geschenken"/.test(zustand.modal),
  'Ein Klick auf die Kachel öffnet sie mit ihren Werten');
setz('gs-f-status', 'gueltig');
setz('gs-f-version', 'V1.0');
await ctx.gsUebernehmen();
ok(w(`gsEintraege()[${neuIdx}].status`) === 'gueltig' && w(`gsEintraege()[${neuIdx}].version`) === 'V1.0',
  'Änderungen greifen');
ok(zustand.gespeichert.length === 2, 'Und werden gespeichert');

const vorher = w('gsEintraege().length');
await ctx.gsLoeschen(neuIdx);
ok(w('gsEintraege().length') === vorher - 1, 'Löschen entfernt die Regelung');
ok(zustand.gespeichert.length === 3, 'Auch das wird gespeichert');

setz('gs-f-titel', '');
w("gsNeu('Compliance','Policy');");
await ctx.gsUebernehmen();
ok(zustand.toasts.some(t => /Titel/.test(t)) && w('gsEintraege().length') === 70,
  'Ohne Titel wird nichts angelegt');

/* Kategorie darf wachsen – das Fundament ist nicht in Stein gemeißelt */
setz('gs-f-titel', 'Konzernrichtlinie Fuhrpark');
setz('gs-f-kategorie', 'Fuhrpark');
setz('gs-f-art', 'Konzernrichtlinie');
setz('gs-f-owner', 'Muster');
setz('gs-f-status', 'offen');
await ctx.gsUebernehmen();
ok(w('gsKategorien()').includes('Fuhrpark'), 'Eine neue Kategorie bekommt eine eigene Zeile');
ok(/Fuhrpark/.test(felder['govstruktur-mount'].innerHTML), 'Und erscheint sofort in der Matrix');

/* ── 8) Einträge außerhalb der Pyramide ── */
w('gsWeitereNeu();');
setz('gs-w-titel', 'KBV_Homeoffice');
setz('gs-w-bereich', 'Kollektivrechtliche Regelungen');
setz('gs-w-owner', 'Muster');
setz('gs-w-status', 'arbeit');
await ctx.gsWeitereUebernehmen();
ok(w('gsWeitere().length') === 10, 'Auch Leitbild, Unternehmenspolitik und KBV sind bearbeitbar');
await ctx.gsWeitereLoeschen(9);
ok(w('gsWeitere().length') === 9, 'Und wieder entfernbar');

/* ── 8b) Zeilen und Spalten: benennen, ergänzen, verschieben, entfernen ── */
const k = umgebung();
await k.ctx.initGovStruktur();
const kw = k.w, kel = k.el, kz = k.zustand;
const setzK = (id, wert) => { kel(id).value = wert; };

ok(kw('gsArten().length') === 7 && kw('gsKategorien().length') === 7,
  'Zeilen und Spalten kommen aus dem Startbestand');

kw('gsEbeneBearbeiten(2);');
ok(/Ebene bearbeiten/.test(kz.modal) && /value="Konzernrichtlinie"/.test(kz.modal),
  'Ein Klick auf den Spaltenkopf öffnet ihn');
ok(/45 Regelung\(en\) stehen in dieser Spalte/.test(kz.modal), 'Und sagt, wie viel daran hängt');
setzK('gs-e-key', 'Konzernvorgabe');
setzK('gs-e-erklaerung', 'Operativer Rahmen: Wie handeln wir?');
await k.ctx.gsEbeneUebernehmen();
ok(kw('gsArten()[2].key') === 'Konzernvorgabe', 'Die Spalte heißt jetzt anders');
ok(kw('gsEintraege().filter(e => e.art === "Konzernvorgabe").length') === 45,
  'Und alle 45 Regelungen sind mitgezogen – keine hängt in einer Spalte, die es nicht mehr gibt');
ok(kw('gsEintraege().some(e => e.art === "Konzernrichtlinie")') === false, 'Die alte Bezeichnung ist weg');
ok(kz.gespeichert.at(-1).arten.length === 7, 'Die Spalten stehen mit in der gespeicherten Datei');

kw('gsKategorieBearbeiten(1);');
setzK('gs-k-name', 'Recht & Steuern');
await k.ctx.gsKategorieUebernehmen();
ok(kw('gsKategorien()[1]') === 'Recht & Steuern', 'Auch Zeilen lassen sich umbenennen');
ok(kw('gsEintraege().filter(e => e.kategorie === "Recht & Steuern").length') === 17, 'Mit allen Regelungen daran');

kw('gsEbeneNeu();');
setzK('gs-e-key', 'Merkblatt');
setzK('gs-e-erklaerung', 'Kurzinfo für den Aushang');
await k.ctx.gsEbeneUebernehmen();
ok(kw('gsArten().length') === 8 && kw('gsArten().at(-1).key') === 'Merkblatt', 'Eine neue Spalte kommt hinten dazu');
kw('gsKategorieNeu();');
setzK('gs-k-name', 'Fuhrpark');
await k.ctx.gsKategorieUebernehmen();
ok(kw('gsKategorien().length') === 8, 'Eine neue Zeile ebenso');
ok(/Fuhrpark/.test(k.felder['govstruktur-mount'].innerHTML) && /Merkblatt/.test(k.felder['govstruktur-mount'].innerHTML),
  'Beide erscheinen sofort in der Matrix');

kw('gsEbeneNeu();');
setzK('gs-e-key', 'merkblatt');
await k.ctx.gsEbeneUebernehmen();
ok(kw('gsArten().length') === 8 && kz.toasts.at(-1).includes('gibt es schon'),
  'Zweimal dieselbe Spalte geht nicht (auch nicht anders geschrieben)');
kw('gsKategorieNeu();');
setzK('gs-k-name', '');
await k.ctx.gsKategorieUebernehmen();
ok(kw('gsKategorien().length') === 8 && kz.toasts.at(-1).includes('Bezeichnung'), 'Ohne Bezeichnung ebenfalls nicht');

await k.ctx.gsEbeneVerschieben(7, -1);
ok(kw('gsArten()[6].key') === 'Merkblatt', 'Spalten lassen sich verschieben');
await k.ctx.gsKategorieVerschieben(7, -1);
ok(kw('gsKategorien()[6]') === 'Fuhrpark', 'Zeilen auch');
await k.ctx.gsEbeneVerschieben(0, -1);
ok(kw('gsArten()[0].key') === 'Handbuch', 'Über den Rand hinaus passiert nichts');

const vorherArten = kw('gsArten().length');
await k.ctx.gsEbeneLoeschen(kw('gsArten().findIndex(a => a.key === "Merkblatt")'));
ok(kw('gsArten().length') === vorherArten - 1, 'Eine leere Spalte lässt sich entfernen');
await k.ctx.gsKategorieLoeschen(kw('gsKategorien().indexOf("Fuhrpark")'));
ok(kw('gsKategorien().length') === 7, 'Eine leere Zeile ebenso');

/* Volle Spalte: Regelungen müssen ein neues Zuhause bekommen, nicht verschwinden */
const idxVoll = kw('gsArten().findIndex(a => a.key === "Konzernvorgabe")');
await k.ctx.gsEbeneLoeschen(idxVoll);
ok(/Verschieben und entfernen/.test(kz.modal) && /45 Regelung/.test(kz.modal),
  'Eine belegte Spalte wird nicht einfach gelöscht – die Regelungen brauchen ein Ziel');
ok(kw('gsArten().length') === 7, 'Bis dahin bleibt alles stehen');
setzK('gs-umzug-ziel', 'Konzernfachregelung');
await k.ctx.gsEbeneUmziehenUndLoeschen(idxVoll);
ok(kw('gsArten().length') === 6, 'Nach dem Umzug ist die Spalte weg');
ok(kw('gsEintraege().filter(e => e.art === "Konzernfachregelung").length') === 59,
  'Und alle Regelungen stehen in der Zielspalte (45 + 14)');
ok(kw('gsEintraege().length') === 70, 'Keine einzige ist dabei verloren gegangen');

const einzeln = umgebung();
await einzeln.ctx.initGovStruktur();
einzeln.w('_gsDaten.arten = [{ key: "Nur eine", erklaerung: "" }]; _gsDaten.kategorien = ["Nur eine"];');
await einzeln.ctx.gsEbeneLoeschen(0);
await einzeln.ctx.gsKategorieLoeschen(0);
ok(einzeln.w('_gsDaten.arten.length') === 1 && einzeln.w('_gsDaten.kategorien.length') === 1,
  'Die letzte Zeile und die letzte Spalte lassen sich nicht entfernen');

/* ── 8c) Der Aufbau ist ein eigenes Recht ── */
const nurEintraege = umgebung({ struktur: false });
await nurEintraege.ctx.initGovStruktur();
const ohneStruktur = nurEintraege.felder['govstruktur-mount'].innerHTML;
ok(nurEintraege.w('gsDarfSchreiben()') === true && nurEintraege.w('gsDarfStruktur()') === false,
  'Regelungen pflegen und den Aufbau ändern sind zwei verschiedene Rechte');
ok(/gsBearbeiten\(/.test(ohneStruktur) && /gs-plus/.test(ohneStruktur), 'Regelungen bleiben pflegbar');
ok(!/gsEbeneBearbeiten|gsKategorieBearbeiten|gsEbeneNeu|gsKategorieNeu|gs-pfeil/.test(ohneStruktur),
  'Aber die Köpfe tragen keine Bedienelemente');
ok(/eigens freigeschaltet/.test(ohneStruktur), 'Und es steht dabei, woran das liegt');
nurEintraege.w('gsEbeneBearbeiten(0); gsKategorieBearbeiten(0);');
ok(nurEintraege.zustand.modal === '', 'Über die Tastatur öffnet sich auch nichts');
await nurEintraege.ctx.gsEbeneUebernehmen();
await nurEintraege.ctx.gsKategorieVerschieben(0, 1);
ok(nurEintraege.zustand.gespeichert.length === 0, 'Und gespeichert wird nichts');
ok(nurEintraege.zustand.toasts.some(t => /freigeschaltet/.test(t)), 'Der Grund steht in der Meldung');

const acc2 = lies('js/access.js');
ok(/function darfGovStrukturKoepfe/.test(acc2), 'Das Recht hat eine eigene Prüfung');
ok(/isAdmin\(u\) \|\| _has\(_cfg\(\)\.govStrukturKoepfe, u\)/.test(acc2), 'Admins dürfen immer, sonst die gepflegte Liste');
ok(/govStrukturKoepfe: \[\],/.test(acc2), 'Standard: niemand zusätzlich');
ok(/roleCard\('govStrukturKoepfe'/.test(lies('js/einstellungen.js')), 'Gepflegt wird sie in den Einstellungen');
ok(/'govStrukturKoepfe'/.test(lies('js/admin.js')), 'Und dort auch angezeigt');

/* Ältere gespeicherte Fassungen kennen die Köpfe noch nicht */
const alt2 = umgebung({ geladen: { daten: { eintraege: [{ kategorie: 'Compliance', art: 'Policy', titel: 'Alt', owner: '', status: 'offen' }] }, geaendertAm: 'z' } });
await alt2.ctx.initGovStruktur();
ok(alt2.w('gsArten().length') === 7 && alt2.w('gsKategorien().length') === 7,
  'Eine Fassung ohne gepflegte Köpfe fällt auf den Startbestand zurück');

/* ── 9) Gleichzeitigkeit ── */
const c = umgebung({ meta: 'fremd' });
await c.ctx.initGovStruktur();
c.w("_gsGeaendertAm = 'meins';");
c.zustand.bestaetigen = false;
await c.ctx.gsSpeichern();
ok(c.zustand.gespeichert.length === 0,
  'Hat jemand anderes zwischenzeitlich gespeichert, wird nach Rückfrage abgebrochen');
c.zustand.bestaetigen = true;
await c.ctx.gsSpeichern();
ok(c.zustand.gespeichert.length === 1, 'Wer ausdrücklich will, überschreibt');

/* ── 10) Nur-Lese-Zugriff ── */
const r = umgebung({ schreiben: false });
await r.ctx.initGovStruktur();
const nurLesen = r.felder['govstruktur-mount'].innerHTML;
ok(r.w('gsDarfSchreiben()') === false, 'Ohne Schreibrecht darf nichts geändert werden');
ok(!/gs-plus/.test(nurLesen) && !/gsBearbeiten\(/.test(nurLesen), 'Dann gibt es keine Bedienelemente zum Ändern');
ok(/Nur-Lese-Zugriff/.test(nurLesen), 'Und es steht dabei, warum');
const kopfzeile = nurLesen.slice(nurLesen.indexOf('<thead>'), nurLesen.indexOf('</thead>'));
ok(!/Arbeits-\/Prozessanweisung/.test(kopfzeile) && /Konzernrichtlinie/.test(kopfzeile),
  'Leere Ebenen bekommen beim Lesen keine Spalte (in der Legende stehen sie weiter)');
r.w("gsBearbeiten(0);");
ok(r.zustand.modal === '', 'Auch über die Tastatur öffnet sich kein Dialog');
await r.ctx.gsSpeichern();
ok(r.zustand.gespeichert.length === 0, 'Und gespeichert wird nichts');

/* ── 11) Ziehen: Kachel in eine andere Zelle ── */
const d = umgebung();
await d.ctx.initGovStruktur();
const dw = d.w;
const idxKartell = dw('gsEintraege().findIndex(e => e.titel === "Kartellrecht")');
const zielKat = dw('gsKategorien().indexOf("Compliance")');
const zielArt = dw('gsArten().findIndex(a => a.key === "Policy")');
const zieh = { dataTransfer: { effectAllowed: '', setData() {}, getData: () => String(idxKartell) },
  preventDefault() {}, target: { classList: { add() {}, remove() {} } } };
d.ctx.gsZiehStart(zieh, idxKartell);
ok(dw('_gsZieht') === idxKartell, 'Beim Ziehen merkt sich die Matrix, welche Kachel unterwegs ist');
await d.ctx.gsZiehAblegen(zieh, null, zielKat, zielArt);
ok(dw(`gsEintraege()[${idxKartell}].kategorie`) === 'Compliance'
  && dw(`gsEintraege()[${idxKartell}].art`) === 'Policy',
  'Ablegen setzt Kategorie und Ebene auf die Zielzelle');
ok(d.zustand.gespeichert.length === 1, 'Und speichert sofort');
ok(dw('_gsZieht') === -1, 'Danach ist nichts mehr unterwegs');
ok(dw('gsEintraege().length') === 70, 'Verschieben legt nichts an und löscht nichts');

const vorherSpeicher = d.zustand.gespeichert.length;
d.ctx.gsZiehStart(zieh, idxKartell);
await d.ctx.gsZiehAblegen(zieh, null, zielKat, zielArt);
ok(d.zustand.gespeichert.length === vorherSpeicher, 'In derselben Zelle abgelegt passiert nichts');

const nurLesen2 = umgebung({ schreiben: false });
await nurLesen2.ctx.initGovStruktur();
ok(!/draggable="true"/.test(nurLesen2.felder['govstruktur-mount'].innerHTML),
  'Ohne Schreibrecht ist keine Kachel greifbar');
nurLesen2.ctx.gsZiehStart(zieh, 0);
await nurLesen2.ctx.gsZiehAblegen(zieh, null, 0, 0);
ok(nurLesen2.zustand.gespeichert.length === 0, 'Und Ablegen bewirkt nichts');
ok(/draggable="true"/.test(d.felder['govstruktur-mount'].innerHTML)
  && /ondrop="gsZiehAblegen\(event,this,\d+,\d+\)"/.test(d.felder['govstruktur-mount'].innerHTML),
  'Mit Schreibrecht sind Kacheln greifbar und Zellen Ablageziele');

/* ── 11b) Versionsverlauf: wer, wann, was ── */
const h = dw('gsHistorie()');
ok(h.length === 1 && /Kartellrecht/.test(h[0].was) && /Compliance \/ Policy/.test(h[0].was),
  'Jede Änderung landet im Verlauf – mit dem, was passiert ist');
ok(h[0].name === 'a@dihag.com' && !!h[0].am, 'Samt Urheber und Zeitpunkt');
ok(/🕘 Zuletzt geändert/.test(d.felder['govstruktur-mount'].innerHTML), 'Oben steht die letzte Änderung');
ok(/Versionsverlauf \(1\)/.test(d.felder['govstruktur-mount'].innerHTML), 'Mit Zugang zum ganzen Verlauf');
d.ctx.gsVerlaufZeigen();
ok(/Versionsverlauf/.test(d.zustand.modal) && /Kartellrecht/.test(d.zustand.modal),
  'Der Verlauf listet die Änderungen auf');
ok(/a@dihag\.com/.test(d.zustand.modal), 'Mit Namen');

d.el('gs-f-titel').value = 'Neu erfunden';
d.el('gs-f-kategorie').value = 'Compliance';
d.el('gs-f-art').value = 'Policy';
d.el('gs-f-owner').value = '';
d.el('gs-f-status').value = 'offen';
d.el('gs-f-dokument').value = ''; d.el('gs-f-version').value = ''; d.el('gs-f-datum').value = '';
d.w('gsNeu(0,0);');
await d.ctx.gsUebernehmen();
ok(dw('gsHistorie()').length === 2 && /angelegt/.test(dw('gsHistorie()[0].was')),
  'Auch Anlegen steht im Verlauf – neueste Änderung oben');
d.w('gsEbeneBearbeiten(0);');
d.el('gs-e-key').value = 'Kompendium';
d.el('gs-e-erklaerung').value = '';
await d.ctx.gsEbeneUebernehmen();
ok(/umbenannt/.test(dw('gsHistorie()[0].was')), 'Umbenennen ebenso');
ok(dw('gsHistorie().length') === 3 && dw('GS_VERLAUF_MAX') === 100,
  'Der Verlauf wächst und ist auf 100 Einträge begrenzt');
ok(d.zustand.gespeichert.at(-1).historie.length === 3, 'Er wird mitgespeichert');

const laden = umgebung({ geladen: { daten: { eintraege: [], weitere: [],
  historie: [{ am: '2026-08-20T08:00:00Z', upn: 'x@dihag.com', name: 'Frau Muster', was: 'Alles umgebaut' }] }, geaendertAm: 'z' } });
await laden.ctx.initGovStruktur();
ok(/Frau Muster/.test(laden.felder['govstruktur-mount'].innerHTML)
  && /Alles umgebaut/.test(laden.felder['govstruktur-mount'].innerHTML),
  'Ein gespeicherter Verlauf wird wieder angezeigt');
ok(/20\.08\.2026/.test(laden.felder['govstruktur-mount'].innerHTML), 'Mit lesbarem Datum');

/* ── 11c) Der Startbestand ist keine Schaltfläche mehr ── */
ok(!/gsZuruecksetzen/.test(quelle), 'Das Wiederherstellen des Startbestands ist entfernt');
ok(!/gsZuruecksetzen|↺ Startbestand/.test(lies('index.html')), 'Auch aus der Werkzeugleiste');

/* ── 11d) Einordnung der weiteren Regelungsebenen ── */
ok(/sind Bestandteile der Corporate Governance/.test(quelle)
  && /nicht dem\s+Konzernwerk|nicht dem\s+Konzernregelwerk zuzuordnen/.test(quelle),
  'Die weiteren Regelungsebenen sind als Bestandteil der Corporate Governance beschrieben');
ok(!/gehören aber nicht in die Pyramide/.test(quelle), 'Die alte Formulierung ist weg');

/* ── 12) Speicherort ── */
const shp = lies('js/sharepoint.js');
ok(/const GOV_STRUKTUR_DATEI = 'governance-struktur\.json'/.test(shp),
  'Gespeichert wird in einer eigenen JSON-Datei');
ok(/\$\{SP\.configFolder\}\/\$\{GOV_STRUKTUR_DATEI\}/.test(shp), 'Neben der access-config – keine neue Liste');
ok(/async function spLoadGovStruktur/.test(shp) && /async function spSaveGovStruktur/.test(shp), 'Laden und Speichern');
ok(/async function spGovStrukturMeta/.test(shp), 'Dazu der Zeitstempel für den Gleichzeitigkeits-Schutz');
ok(/return null;\s+\/\/ 404 = noch nie gespeichert/.test(shp), 'Fehlt die Datei, gilt der Startbestand');

/* ── 13) Eingehängt ── */
const html = lies('index.html');
ok(/id="view-govstruktur"/.test(html), 'Die Ansicht existiert');
ok(/data-view="govstruktur" id="nav-govstruktur"/.test(html), 'Der Reiter auch');
ok(html.indexOf('id="nav-govstruktur"') > html.indexOf('id="nav-governance"'), 'Er steht unter dem Governance-Board');
ok(html.indexOf('id="nav-govstruktur"') < html.indexOf('nav-grp-isms'), 'Und noch in der Gruppe Corporate Governance');
ok(/govstruktur:\s*\['govstruktur'\]/.test(lies('js/module.js')),
  'Das Modul steht in der Nachlade-Karte – und kommt ohne den Verwaltungsblock aus');
const app = lies('js/app.js');
ok(/govstruktur: 'Governance-Struktur'/.test(app), 'Der Seitentitel stimmt');
ok(/view === 'govstruktur'\s+&& typeof initGovStruktur === 'function'\)\s+initGovStruktur\(\)/.test(app),
  'Beim Öffnen wird geladen und gezeichnet');
const acc = lies('js/access.js');
ok(/\{ view: 'govstruktur', label: 'Governance-Struktur'/.test(acc), 'Der Reiter lässt sich einzeln freigeben');
ok(/'governance', 'govstruktur'/.test(acc), 'Die Sichtbarkeit wird berechnet');
ok(/show\('nav-govstruktur',\s+v\.govstruktur\)/.test(acc), 'Und gesetzt');

/* ── 14) Nachvollziehbar und wiederholbar ── */
ok(fs.existsSync(path.join(ROOT, 'scripts/govstruktur-import.py')),
  'Es gibt ein Skript, das den Startbestand aus der Mappe neu einliest');
const imp = lies('scripts/govstruktur-import.py');
ok(/Der Titel schlägt die Überschrift/.test(imp), 'Es hält fest, warum der Titel die Überschrift schlägt');
ok(/ohne Verantwortung: Zwischenüberschrift/.test(imp), 'Und wie Zwischenüberschriften erkannt werden');
ok(/marke = /.test(imp) && /ansicht = alt\[alt\.index\(marke\):\]/.test(imp),
  'Es ersetzt nur die Daten, nicht die Ansicht');
const doku = lies('js/dokumentation.js');
ok(/sec\('govstruktur', 'Governance-Struktur \(Matrix\)'/.test(doku), 'Die Dokumentation hat einen Abschnitt');
ok(/\['govstruktur',\s+'Governance-Struktur \(Matrix\)'\]/.test(doku), 'Er steht im Inhaltsverzeichnis');
ok(/Governance-Struktur \(Matrix\)/.test(lies('docs/BENUTZERHANDBUCH.md')), 'Das Handbuch ebenfalls');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
