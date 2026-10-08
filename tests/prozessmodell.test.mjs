/**
 * Prozessmanagement – das Modell (js/prozessmodell.js).
 *
 * Worauf es ankommt:
 *   • Was in einer Landkarte steht, ist erfasst – ohne Status gilt „IST".
 *   • Prozesseigner und Standardisierungsgrad gehören zum Konzernprozess:
 *     Leer an der Werkkachel heißt „wie die gleichnamige Konzernkachel".
 *     Ein eigener Eintrag schlägt das Erbe.
 *   • Wer freigibt oder ausrollt, legt die Überprüfung fest – fehlt ein
 *     Termin, wird er gesetzt; ein vorhandener bleibt.
 *   • Ohne Termin ist es erst nach der Freigabe eine Lücke.
 *   • Kategorie-Kacheln sind kein Ablauf und tauchen im Backlog nicht auf.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const M = require('../js/prozessmodell.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const HEUTE = new Date(2026, 9, 1);   // 1. Oktober 2026

const daten = {
  karten: {
    KONZERN: { kacheln: [
      { id: 'k-einkauf', name: 'Beschaffung', verantwortlich: 'cfo@dihag.com', standardisierung: 'einheitlich' },
      { id: 'k-personal', name: 'Personal', prozesseigner: 'hr@dihag.com', verantwortlich: 'andere@dihag.com' },
      { id: 'k-kat', name: 'Finanzen', typ: 'kategorie' },
    ] },
    HOL: { kacheln: [
      { id: 'h-einkauf', name: 'beschaffung ', status: 'poc', prioritaet: 'hoch' },
      { id: 'h-personal', name: 'Personal', prozesseigner: 'eigen@dihag.com', standardisierung: 'lokal', status: 'ausgerollt', naechsteUeberpruefung: '2026-09-20' },
      { id: 'h-it', name: 'IT', status: 'freigegeben' },
      { id: 'h-bau', name: 'Bauunterhalt', status: 'unsinn', prioritaet: 'mittel', naechsteUeberpruefung: '2026-10-15' },
    ] },
    SHB: { kacheln: [{ id: 's-einkauf', name: 'Beschaffung', prioritaet: 'niedrig', naechsteUeberpruefung: '2027-08-01' }] },
  },
};
const kachel = (w, id) => daten.karten[w].kacheln.find(k => k.id === id);

console.log('Status');
ok(M.pzStatus({}) === 'ist', 'Ohne Status gilt „IST erfasst"');
ok(M.pzStatus({ status: 'unsinn' }) === 'ist', 'Ein unbekannter Status gilt als „IST erfasst"');
ok(M.pzStatus({ status: 'poc' }) === 'poc', 'Ein bekannter Status bleibt');
ok(M.PZ_STATUS.map(s => s.key).join(',') === 'ist,soll,poc,freigegeben,ausgerollt,eol', 'Lebenszyklus in der Reihenfolge des Durchlaufs, am Ende EOL');

console.log('Erbe von der Konzern-Landkarte');
const e1 = M.pzEigner(daten, 'HOL', kachel('HOL', 'h-einkauf'));
ok(e1.upn === 'cfo@dihag.com' && e1.geerbt, 'Werkkachel ohne Eigner erbt die Verantwortliche der gleichnamigen Konzernkachel (Name ohne Groß/Klein, Leerzeichen)');
const e2 = M.pzEigner(daten, 'HOL', kachel('HOL', 'h-personal'));
ok(e2.upn === 'eigen@dihag.com' && !e2.geerbt, 'Eigener Eintrag schlägt das Erbe');
const e3 = M.pzEigner(daten, 'KONZERN', kachel('KONZERN', 'k-personal'));
ok(e3.upn === 'hr@dihag.com', 'Auf der Konzernkarte zählt der Prozesseigner vor der Verantwortlichen');
const e4 = M.pzEigner(daten, 'KONZERN', kachel('KONZERN', 'k-einkauf'));
ok(e4.upn === 'cfo@dihag.com' && !e4.geerbt, 'Auf der Konzernkarte ist ohne Eintrag die Verantwortliche der Eigner');
const e5 = M.pzEigner(daten, 'HOL', kachel('HOL', 'h-it'));
ok(e5.upn === '' && !e5.geerbt, 'Ohne Konzernkachel kein Eigner');
const s1 = M.pzStandard(daten, 'SHB', kachel('SHB', 's-einkauf'));
ok(s1.key === 'einheitlich' && s1.geerbt, 'Standardisierungsgrad wird geerbt');
const s2 = M.pzStandard(daten, 'HOL', kachel('HOL', 'h-personal'));
ok(s2.key === 'lokal' && !s2.geerbt, 'Eigener Standardisierungsgrad schlägt das Erbe');
ok(M.pzKonzernKachel(daten, 'KONZERN', kachel('KONZERN', 'k-einkauf')) === null, 'Die Konzernkarte erbt nicht von sich selbst');

console.log('Überprüfung');
ok(M.pzTageBis('2026-10-11', HEUTE) === 10, 'Tage bis zum Termin');
ok(M.pzTageBis('2026-09-30', HEUTE) === -1, 'Gestern ist einen Tag überfällig');
ok(M.pzTageBis('', HEUTE) === null && M.pzTageBis('kein Datum', HEUTE) === null, 'Ohne gültiges Datum kein Wert');
ok(M.pzUeberpruefung(kachel('HOL', 'h-personal'), HEUTE).stufe === 'ueberfaellig', 'Vergangener Termin: überfällig');
ok(M.pzUeberpruefung(kachel('HOL', 'h-bau'), HEUTE).stufe === 'bald', 'Termin in 14 Tagen: bald');
ok(M.pzUeberpruefung(kachel('SHB', 's-einkauf'), HEUTE).stufe === 'spaeter', 'Termin im nächsten Jahr: später');
ok(M.pzUeberpruefung(kachel('HOL', 'h-it'), HEUTE).stufe === 'fehlt', 'Freigegeben ohne Termin: Lücke');
ok(M.pzUeberpruefung(kachel('HOL', 'h-einkauf'), HEUTE).stufe === 'fehlt', 'Im POC ohne Termin: Lücke, der Pilot braucht den Termin seiner Bewertung');
ok(M.pzUeberpruefung({ status: 'eol' }, HEUTE).stufe === '' && M.pzUeberpruefung({ status: 'eol', naechsteUeberpruefung: '2020-01-01' }, HEUTE).stufe === '', 'EOL: keine Überprüfung mehr, auch nicht mit altem Termin');
ok(M.pzUeberpruefung({ status: 'soll' }, HEUTE).stufe === '', 'SOLL in Arbeit ohne Termin: noch keine Lücke');
ok(M.pzTerminVorschlag(HEUTE) === '2027-10-01', 'Vorschlag: heute + 12 Monate');

console.log('Status setzen');
const k1 = { name: 'X', status: 'poc' };
const t1 = M.pzStatusSetzen(k1, 'freigegeben', HEUTE);
ok(k1.status === 'freigegeben' && k1.naechsteUeberpruefung === '2027-10-01', 'Freigabe ohne Termin setzt den Termin');
ok(/POC läuft → Freigegeben/.test(t1) && /2027-10-01/.test(t1), 'Der Verlaufstext nennt Wechsel und Termin');
const k2 = { name: 'Y', status: 'freigegeben', naechsteUeberpruefung: '2027-03-01' };
M.pzStatusSetzen(k2, 'ausgerollt', HEUTE);
ok(k2.naechsteUeberpruefung === '2027-03-01', 'Ein vorhandener Termin bleibt');
ok(M.pzStatusSetzen(k2, 'ausgerollt', HEUTE) === '', 'Gleicher Status: keine Änderung');
ok(M.pzStatusSetzen(k2, 'quatsch', HEUTE) === '' && k2.status === 'ausgerollt', 'Unbekannter Status wird abgewiesen');
const k3 = { name: 'Z' };
ok(M.pzStatusSetzen(k3, 'ist', HEUTE) !== '' && k3.status === 'ist', 'Ein ungepflegter Status wird beim ersten Setzen festgeschrieben');

console.log('Backlog');
const alle = M.pzEintraege(daten, null, HEUTE);
ok(alle.length === 7, 'Alle Abläufe aller Karten, ohne Kategorie-Kachel');
ok(!alle.some(e => e.kachel.id === 'k-kat'), 'Kategorie-Kacheln fehlen');
const nurHol = M.pzEintraege(daten, ['HOL'], HEUTE);
ok(nurHol.length === 4 && nurHol.every(e => e.werk === 'HOL'), 'Begrenzung auf sichtbare Karten');
const sp = M.pzSpalten(alle);
ok(sp.ist.length === 4 && sp.poc.length === 1 && sp.freigegeben.length === 1 && sp.ausgerollt.length === 1, 'Eine Spalte je Status');
ok(sp.ist[0].kachel.id === 'h-bau' && sp.ist[1].kachel.id === 's-einkauf', 'Sortiert nach Priorität (mittel vor niedrig vor keiner)');
const kz = M.pzKennzahlen(alle);
ok(kz.gesamt === 7 && kz.priorisiert === 3, 'Kennzahlen: gesamt und priorisiert');
ok(kz.mitEigner === 5, 'Kennzahlen: mit Prozesseigner (eigen oder geerbt)');
ok(kz.standardEntschieden === 4, 'Kennzahlen: Standardisierung entschieden (eigen oder geerbt)');
ok(kz.ueberfaellig === 1 && kz.ohneTermin === 2, 'Kennzahlen: überfällig und ohne Review-Termin (freigegeben und POC)');
ok(kz.inArbeit === 2 && kz.ausgerollt === 1, 'Kennzahlen: in Arbeit und ausgerollt');

console.log('Fälligkeiten');
const f = M.pzFaellige(daten, null, HEUTE);
ok(f.ueberfaellig.length === 1 && f.ueberfaellig[0].kachel.id === 'h-personal', 'Überfällig');
ok(f.fehlt.length === 2 && f.fehlt.map(e => e.kachel.id).sort().join() === 'h-einkauf,h-it', 'Ohne Review-Termin: freigegeben und im POC');
ok(f.bald.length === 1 && f.spaeter.length === 1, 'Bald und später');
ok(M.pzNrText({ nr: 7 }) === 'P-007' && M.pzNrText({}) === '', 'Prozessnummer wie in der Landkarte');

console.log(`\n${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
