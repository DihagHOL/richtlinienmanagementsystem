/**
 * C-Level-Bericht der Landkarte (js/landkartebericht.js)
 *
 * Ein Knopf in der Landkarte erzeugt aus den Daten eine kompakte Druckfassung
 * für die Geschäftsführung. Geprüft wird, dass richtig gezählt wird (Ketten
 * und Abgelöste sind keine Prozesse, der Eigner einer Kette ist der
 * Prozesseigner oder die verantwortliche Person), dass die offenen
 * Entscheidungen aus den Daten kommen und dass die Druckfassung Kopf, Namen
 * statt Adressen und keine erfundenen Punkte enthält. Alle Namen sind erfunden.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { lkBerichtDaten, lkBerichtHtml } = require('../js/landkartebericht.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const daten = { karten: { KONZERN: {
  baender: [{ key: 'fuehrung', titel: 'Führungsprozesse' }, { key: 'kern', titel: 'Kernprozesse' },
            { key: 'abgeloest', titel: 'Abgelöst', archiv: true }],
  kacheln: [
    { id: 'k-strat', nr: 1, band: 'fuehrung', art: 'kette', name: 'Strategie', verantwortlich: 'erika.muster@beispiel.de', offen: ['geltung'] },
    { id: 'k-verkauf', nr: 2, band: 'kern', art: 'kette', name: 'Verkauf bis Zahlung', prozesseigner: 'max.muster@beispiel.de',
      verantwortlich: 'erika.muster@beispiel.de', standardisierung: 'gruppe',
      verweise: [{ ziel: 'KONZERN:p-angebot', art: 'unterprozess' }, { ziel: 'KONZERN:p-rechnung', art: 'unterprozess' }] },
    { id: 'k-leer', nr: 3, band: 'kern', art: 'kette', name: 'Platzhalterkette' },
    { id: 'p-angebot', nr: 4, band: 'kern', name: 'Angebot', prozesse: [{ id: 'm1' }],
      bcm: { kritikalitaet: 'hoch', rto: 24 } },
    { id: 'p-rechnung', nr: 5, band: 'kern', name: 'Rechnung', offen: ['geltung'], bcm: { kritikalitaet: 'mittel', rto: 48 },
      kette: { werke: ['AAA', 'BBB'], rollen: ['Buchhaltung', 'Genehmiger'] } },
    { id: 'p-frei', nr: 6, band: 'kern', name: 'Einzelprozess' },
    { id: 'alt', nr: 7, band: 'abgeloest', name: 'Alter Verkauf', abgeloest: { durch: ['KONZERN:k-verkauf'] }, offen: ['geltung'] },
  ],
} } };
const namen = { 'erika.muster@beispiel.de': 'Erika Muster', 'max.muster@beispiel.de': 'Max Muster' };
const m = lkBerichtDaten(daten, 'KONZERN', { personName: (u) => namen[u] || u, stand: '23.11.2026', werkLabel: 'Konzern / Holding' });

/* ── 1) Zählen wie die Landkarte ── */
ok(m.zahlen.ketten === 3 && m.zahlen.prozesse === 3, `Drei Ketten, drei Prozesse – Ketten und Abgelöste zählen nicht (${m.zahlen.ketten}, ${m.zahlen.prozesse})`);
ok(m.zahlen.bereiche === 2, 'Zwei Bereiche; der archivierte Bereich „Abgelöst“ zählt nicht');
ok(m.zahlen.modelliert === 1, 'Ein Prozess modelliert');
ok(!('mitBia' in m.zahlen) && !('abgeloest' in m.zahlen) && !('kritisch' in m), 'BIA und abgelöste Karten gehören vorerst nicht zum Bericht');

/* ── 2) Eigner je Kette ── */
const k = (n) => m.bereiche.flatMap(b => b.ketten).find(x => x.name === n);
ok(k('Strategie').eigner === 'Erika Muster', 'Ohne Prozesseigner ist es die verantwortliche Person, mit Namen statt Adresse');
ok(k('Verkauf bis Zahlung').eigner === 'Max Muster', 'Ein gesetzter Prozesseigner geht vor');
ok(k('Platzhalterkette').eigner === '' && k('Platzhalterkette').prozesse === 0, 'Die leere Kette hat weder Eigner noch Prozesse');
const gast = lkBerichtDaten({ karten: { X: { baender: [{ key: 'a', titel: 'A' }], kacheln: [
  { id: 'k1', band: 'a', art: 'kette', name: 'Eins', verantwortlich: 'A.von.Beispiel@extern.example' },
  { id: 'k2', band: 'a', art: 'kette', name: 'Zwei', verantwortlich: 'muster@beispiel.de' }] } } }, 'X', { personName: (u) => u });
ok(gast.bereiche[0].ketten.map(x => x.eigner).join('|') === 'A. von Beispiel|Muster',
  'Kennt die Mitgliederliste jemanden nicht (Gastkonto), wird der Name aus der Adresse gebildet, nie die Adresse gedruckt');
ok(k('Verkauf bis Zahlung').prozesse === 2 && k('Verkauf bis Zahlung').modelliert === 1, 'Zwei Prozesse, einer modelliert');
ok(m.bereiche.map(b => b.titel).join('|') === 'Führungsprozesse|Kernprozesse', 'Gruppiert nach Bereich, in der Reihenfolge der Karte');

/* ── 3) Offene Entscheidungen aus den Daten ── */
const offen = (t) => (m.offen.find(x => x.titel === t) || {}).text || '';
ok(/1 von 3 Ketten/.test(offen('Prozesseigner benennen')) && /P-003 Platzhalterkette/.test(offen('Prozesseigner benennen')), 'Ketten ohne Eigner werden genannt');
ok(/alle 3 Ketten/.test(offen('Ziel aus der Unternehmensstrategie')), 'Das Ziel aus der Strategie ist für alle offen');
ok(/2 von 3 Ketten/.test(offen('Standardisierungsgrad')), 'Der Standardisierungsgrad fehlt bei zwei');
ok(/Bei 2 Kacheln/.test(offen('Geltungsbereich')), 'Offene Geltungsbereiche ohne die abgelöste Karte');
ok(/P-003 Platzhalterkette/.test(offen('Ketten ohne Prozesse')), 'Ketten ohne Prozesse');
ok(/P-006 Einzelprozess/.test(offen('Prozesse ohne Kette')), 'Ein Prozess ohne Kette fällt auf');
ok(/^1 von 3 Ketten hat /.test(offen('Prozesseigner benennen')) && /^1 Prozess hängt /.test(offen('Prozesse ohne Kette'))
  && /^2 Ketten haben /.test(offen('Ketten ohne Prozesse')), 'Einzahl, wo es eins ist, sonst Mehrzahl');

/* ── 4) Verantwortung ── */
ok(m.verantwortung.length === 1 && m.verantwortung[0].werke.join() === 'AAA,BBB' && m.verantwortung[0].rollen.length === 2,
  'Verantwortungskette mit Gesellschaften und Rollen');

/* ── 5) Die Druckfassung ── */
const html = lkBerichtHtml(m, { kopf: '<div class="druck-kopf">KOPF</div>', schrift: ['https://example.org/exo.woff2'] });
ok(/^<!doctype html>/.test(html) && /<div class="druck-kopf">KOPF<\/div>/.test(html), 'Mit dem Druckkopf');
ok(/🖨 Drucken \/ als PDF speichern/.test(html) && /@media print/.test(html), 'Mit Druckknopf, der beim Drucken verschwindet');
ok(/Prozesslandkarte Konzern \/ Holding/.test(html) && /Stand 23\.11\.2026/.test(html) && /Intern/.test(html), 'Titel, Stand und Einstufung');
ok(/Max Muster/.test(html) && !/@beispiel\.de/.test(html), 'Namen statt Mailadressen');
ok(/<span class="offen">offen<\/span>/.test(html), 'Fehlende Eigner stehen als „offen“');
ok(!/Kritikalität|BIA|RTO|24 h/.test(html), 'Keine BIA im Bericht');
ok(!/[Aa]bgelöst|Alter Verkauf/.test(html), 'Keine abgelösten Karten im Bericht, auch nicht als Hinweis');
ok(/@font-face \{ font-family: 'Exo'; src: url\('https:\/\/example\.org\/exo\.woff2'\)/.test(html), 'Hausschrift Exo');
ok(!/Einzelprozess<\/td>/.test(html), 'Kompakt: keine vollständige Prozessliste');
const boese = lkBerichtHtml(lkBerichtDaten({ karten: { X: { baender: [{ key: 'a', titel: '<b>' }],
  kacheln: [{ id: 'k', band: 'a', art: 'kette', name: '<script>x</script>' }] } } }, 'X', {}), {});
ok(!/<script>x/.test(boese) && /&lt;script&gt;/.test(boese), 'Namen werden maskiert');

/* ── 6) Der Knopf ── */
const lk = lies('js/landkarte.js');
ok(/kacheln\.some\(lkIstKette\) && typeof lkBerichtOeffnen === 'function'/.test(lk) && /📊 C-Level-Bericht/.test(lk),
  'Der Knopf steht in der Leiste, sobald die Karte Ketten hat');
ok(/'landkarte', 'landkartebericht'/.test(lies('js/module.js')), 'Das Modul lädt mit der Landkarte');
const b = lies('js/landkartebericht.js');
ok(/const w = window\.open\('', '_blank'\);[\s\S]*await spGetMembers\(\)/.test(b),
  'Erst das Fenster, dann die Namen laden – sonst hält der Pop-up-Blocker es auf');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
