/**
 * Reiter „Governance-Struktur".
 *
 * Das Konzernregelwerk stand bisher nur in einer Excel-Mappe und zwei Folien:
 * die Pyramide der Verbindlichkeitsebenen, das Fundament mit den Kategorien,
 * die Zuständigkeiten in der Mappe. Hier laufen die drei zusammen – Kategorie ×
 * Dokumentenart, mit Verantwortung und Stand.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const quelle = lies('js/govstruktur.js');
const speicher = {};
const el = (id) => (speicher[id] = speicher[id] || {
  id, innerHTML: '', value: '', options: [], style: {},
  classList: { toggle: () => {}, add: () => {}, remove: () => {} },
});
const ctx = {
  console,
  State: { policies: [{ id: '42', title: 'Informationssicherheit' }] },
  document: { getElementById: el },
  esc: (s) => String(s ?? ''),
  emptyState: (t) => `<div class="empty">${t}</div>`,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(quelle, ctx);
const w = (a) => vm.runInContext(a, ctx);

/* ── 1) Die Daten aus der Mappe ── */
const eintraege = w('GOV_EINTRAEGE');
const kategorien = w('GOV_KATEGORIEN');
const arten = w('GOV_ARTEN').map(a => a.key);
ok(eintraege.length === 70, `Alle Regelungen der Mappe sind übernommen (${eintraege.length})`);
ok(kategorien.length === 7, 'Sieben Kategorien wie im Konzernregelwerk-Fundament');
ok(eintraege.every(e => kategorien.includes(e.kategorie)), 'Jede Regelung hängt an einer bekannten Kategorie');
ok(eintraege.every(e => arten.includes(e.art)), 'Und an einer Dokumentenart der Pyramide');
ok(eintraege.every(e => e.titel && e.titel.trim()), 'Keine namenlose Regelung');
ok(eintraege.every(e => ['gueltig', 'arbeit', 'offen'].includes(e.status)), 'Der Stand ist auf drei Werte normiert');
ok(/const GOV_STAND = "\d\d\.\d\d\.\d{4}"/.test(quelle), 'Der Stand der Mappe ist festgehalten');
ok(/Momentaufnahme der Planung, kein Live-Bestand/.test(quelle),
  'Und es steht dabei, dass es eine Momentaufnahme ist – kein Live-Bestand');

/* ── 2) Stichproben gegen die Mappe ── */
const finde = (t) => eintraege.find(e => e.titel.startsWith(t));
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

/* ── 3) Verantwortung ── */
ok(w('gsOwnerListe("Muster/Muster/Muster").length') === 3, 'Mehrfach-Verantwortung wird aufgeteilt (Schrägstrich)');
ok(w('gsOwnerListe("Muster, Muster, Muster").length') === 3, 'Ebenso mit Komma');
ok(w('gsOwnerListe("Muster /Muster")').join('|') === 'Muster|Muster', 'Leerzeichen werden abgeschnitten');
ok(w('gsOwnerListe("")').length === 0, 'Ohne Angabe bleibt die Liste leer');
const owner = w('gsAlleOwner()');
ok(owner.length >= 18 && owner.includes('Muster') && owner.includes('Muster'), `Alle Verantwortlichen einzeln (${owner.length})`);

/* ── 4) Filter ── */
ok(w('gsGefiltert().length') === 70, 'Ohne Filter alles');
w("gsStatusFilter('gueltig')");
ok(w('gsGefiltert().every(e => e.status === "gueltig")') === true, 'Der Stand-Filter greift');
ok(w('gsGefiltert().length') === 7, 'Sieben Regelungen sind final abgelegt');
w("gsStatusFilter('')");
w("gsOwnerFilter('Muster')");
ok(w('gsGefiltert().length') === 7, 'Der Verantwortungs-Filter greift');
ok(w('gsGefiltert().every(e => e.owner.includes("Muster"))') === true, 'Und zeigt nur dessen Regelungen');
w("gsOwnerFilter('')");
w("gsSuche('kartell')");
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
w('initGovStruktur();');
const matrix = speicher['govstruktur-mount'].innerHTML;
ok(/<table class="gs-tabelle">/.test(matrix), 'Die Matrix ist eine Tabelle');
ok((matrix.match(/gs-kachel/g) || []).length === 70, 'Jede Regelung bekommt eine Kachel');
ok((matrix.match(/<th class="gs-kat"/g) || []).length === 7, 'Eine Zeile je Kategorie');
ok(!/Arbeits-\/Prozessanweisung<\/th>|>Arbeits-\/Prozessanweisung\s/.test(matrix),
  'Eine Ebene ohne einen einzigen Eintrag bekommt keine leere Spalte');
ok(/gs-tabelle-wrap/.test(matrix), 'Die Tabelle scrollt in ihrem eigenen Rahmen');
ok(/70/.test(matrix) && /gs-balken/.test(matrix), 'Oben stehen Kennzahlen mit Fortschrittsbalken');
ok(/Stand 12\.08\.2026/.test(matrix), 'Und der Stand der Quelle');
ok(/→ im RMS/.test(matrix), 'Bereits vorhandene Regelwerke sind verlinkt');
ok(/In sich abgeschlossenes Themengebiet/.test(matrix) && /Handlungsempfehlungen/.test(matrix),
  'Die Legende erklärt die Verbindlichkeitsebenen');
ok(/Weitere Regelungsebenen/.test(matrix) && /KBV/.test(matrix),
  'Leitbild, Unternehmenspolitik und die KBV stehen separat – sie gehören nicht in die Pyramide');

w("gsModus('owner');");
const nachOwner = speicher['govstruktur-mount'].innerHTML;
ok(/gs-owner-karte/.test(nachOwner), 'Die zweite Sicht gruppiert nach Verantwortung');
ok((nachOwner.match(/gs-owner-karte/g) || []).length === owner.length, 'Je Person eine Karte');
ok(/gs-pill/.test(nachOwner), 'Mit Verteilung nach Stand');
w("gsModus('matrix');");

/* ── 7) Eingehängt ── */
const html = lies('index.html');
ok(/id="view-govstruktur"/.test(html), 'Die Ansicht existiert');
ok(/data-view="govstruktur" id="nav-govstruktur"/.test(html), 'Der Reiter auch');
ok(html.indexOf('id="nav-govstruktur"') > html.indexOf('id="nav-governance"'), 'Er steht unter dem Governance-Board');
ok(html.indexOf('id="nav-govstruktur"') < html.indexOf('nav-grp-isms'), 'Und noch in der Gruppe Corporate Governance');
ok(/<script src="js\/govstruktur\.js\?v=/.test(html), 'Das Skript ist eingebunden');
const app = lies('js/app.js');
ok(/govstruktur: 'Governance-Struktur'/.test(app), 'Der Seitentitel stimmt');
ok(/view === 'govstruktur'\s+&& typeof initGovStruktur === 'function'\)\s+initGovStruktur\(\)/.test(app),
  'Beim Öffnen wird gezeichnet');
const acc = lies('js/access.js');
ok(/\{ view: 'govstruktur', label: 'Governance-Struktur'/.test(acc), 'Der Reiter lässt sich einzeln freigeben');
ok(/'governance', 'govstruktur'/.test(acc), 'Die Sichtbarkeit wird berechnet');
ok(/show\('nav-govstruktur',\s+v\.govstruktur\)/.test(acc), 'Und gesetzt');

/* ── 8) Nachvollziehbar und wiederholbar ── */
ok(fs.existsSync(path.join(ROOT, 'scripts/govstruktur-import.py')),
  'Es gibt ein Skript, das die Daten aus der Mappe neu einliest');
const imp = lies('scripts/govstruktur-import.py');
ok(/Der Titel schlägt die Überschrift/.test(imp), 'Es hält fest, warum der Titel die Überschrift schlägt');
ok(/ohne Verantwortung: Zwischenüberschrift/.test(imp), 'Und wie Zwischenüberschriften erkannt werden');
ok(/marke = /.test(imp) && /ansicht = alt\[alt\.index\(marke\):\]/.test(imp),
  'Es ersetzt nur die Daten, nicht die Ansicht');
const doku = lies('js/dokumentation.js');
ok(/sec\('govstruktur', 'Governance-Struktur \(Matrix\)'/.test(doku), 'Die Dokumentation hat einen Abschnitt');
ok(/\['govstruktur',\s+'Governance-Struktur \(Matrix\)'\]/.test(doku), 'Er steht im Inhaltsverzeichnis');
ok(/Momentaufnahme\s*\n?\s*der Planung/.test(doku.replace(/<\/?b>/g, '')), 'Und sagt, dass es kein Live-Bestand ist');
ok(/Governance-Struktur \(Matrix\)/.test(lies('docs/BENUTZERHANDBUCH.md')), 'Das Handbuch ebenfalls');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
