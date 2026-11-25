/**
 * Managementhandbuch (js/managementhandbuch.js)
 *
 * Worauf es ankommt:
 *   • Das Handbuch folgt der gemeinsamen Normstruktur (Abschnitte 4 bis 10) und
 *     jeder Abschnitt trägt einen Status: hergeleitet, teils, offen.
 *   • Was das RMS nicht weiß (Kontext, Strategie, Politik, Zusagen der Leitung),
 *     wird nicht erfunden, sondern als offen genannt, auch wenn Quellen fehlen.
 *   • Quellen dürfen fehlen: Der Abschnitt zeigt dann seine Lücke, nichts bricht.
 *   • Gedruckt werden Namen, nie Mailadressen; Texte aus den Daten werden maskiert.
 *   • Der Entwurf wird nicht gespeichert, nur die ausdrücklich veröffentlichte
 *     Fassung; wer nur lesen darf, sieht nur sie.
 *   • Der Reiter ist verdrahtet: Navigation, Rechte, Titel, Modul, Ablage.
 * Alle Namen und Daten sind erfunden.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');
const { jsArg } = require('../js/util.js');

/* ── Eine kleine Seite ── */
const elemente = new Map();
const element = (id) => {
  if (!elemente.has(id)) elemente.set(id, { id, innerHTML: '', value: '', disabled: false, textContent: '' });
  return elemente.get(id);
};
const meldungen = [];
const kontext = (extra) => {
  const ctx = Object.assign({
    console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, RegExp, Number, parseFloat,
    jsArg, document: { getElementById: element }, window: {},
    toast: (t, art) => meldungen.push([art || 'info', t]),
    closeModal: () => meldungen.push(['modal', 'zu']),
    openModal: (html) => { element('modal').innerHTML = html; },
    druckKopf: () => '<div class="druck-kopf">KOPF</div>', rmsAssetUrl: (d) => 'https://example.org/' + d,
    switchView: () => {},
  }, extra || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['js/prozessschema.js', 'js/rmsprozesse.js', 'js/landkartebericht.js', 'js/managementhandbuch.js'].forEach(f => vm.runInContext(lies(f), ctx));
  return { w: (code) => vm.runInContext(code, ctx), ctx };
};
const { w } = kontext();

/* ── Erfundene Quellen ── */
const lk = { karten: { KONZERN: {
  baender: [{ key: 'fuehrung', titel: 'Führungsprozesse' }, { key: 'kern', titel: 'Kernprozesse' }],
  kacheln: [
    { id: 'k-eins', nr: 1, band: 'fuehrung', art: 'kette', name: 'Erste Kette', verantwortlich: 'erika.muster@beispiel.de', offen: ['geltung'],
      verweise: [{ ziel: 'KONZERN:p-a', art: 'unterprozess' }, { ziel: 'KONZERN:p-b', art: 'unterprozess' }] },
    { id: 'k-zwei', nr: 2, band: 'kern', art: 'kette', name: 'Zweite Kette', prozesseigner: 'max.muster@beispiel.de', verantwortlich: 'erika.muster@beispiel.de',
      verweise: [{ ziel: 'KONZERN:p-c', art: 'unterprozess' }] },
    { id: 'k-leer', nr: 3, band: 'kern', art: 'kette', name: 'Leere Kette <b>' },
    { id: 'p-a', nr: 4, band: 'fuehrung', name: 'Prozess A', geltung: ['ALLE'], prozesse: [{ id: 'm1' }] },
    { id: 'p-b', nr: 5, band: 'fuehrung', name: 'Prozess B', geltung: ['AAA', 'BBB'], offen: ['geltung'],
      kette: { werke: ['AAA', 'BBB'], rollen: ['Rolle Eins', 'Rolle Zwei'] } },
    { id: 'p-c', nr: 6, band: 'kern', name: 'Prozess C', geltung: ['ALLE'] },
  ],
}, SHB: { baender: [], kacheln: [{ id: 'x', nr: 7, band: 'a', name: 'Werksprozess' }] } } };
const gov = {
  arten: [{ key: 'Handbuch', erklaerung: 'Abgeschlossenes Themengebiet' }, { key: 'Policy', erklaerung: 'Strategischer Rahmen' }, { key: 'Leitfaden', erklaerung: 'Empfehlungen' }],
  kategorien: ['Allgemein', 'Compliance'],
  eintraege: [
    { kategorie: 'Allgemein', art: 'Handbuch', titel: 'Kodex Eins', status: 'gueltig', version: 'Version 2.0', datum: '01.01.2026' },
    { kategorie: 'Compliance', art: 'Handbuch', titel: 'Kodex Zwei', status: 'arbeit' },
    { kategorie: 'Compliance', art: 'Policy', titel: 'Grundsatzerklärung Beispiel', status: 'offen' },
    { kategorie: 'Compliance', art: 'Leitfaden', titel: 'Leitfaden <i>Drei</i>', status: 'gueltig' },
  ],
  weitere: [{ bereich: 'Unternehmenspolitik', titel: 'Unternehmenspolitik', status: 'arbeit', dokument: 'datei.pdf' }],
};
const namen = { 'erika.muster@beispiel.de': 'Erika Muster', 'max.muster@beispiel.de': 'Max Muster' };
const katalog = (n) => w(`rmsProzess(${JSON.stringify(n)})`);
const quellen = () => ({
  stand: '24.11.2026', katalog, lk, gov, personName: (u) => namen[u] || u,
  policies: [{ status: 'Veröffentlicht' }, { status: 'Veröffentlicht' }, { status: 'Entwurf' }, { status: 'Freigabe' }, { status: 'InReview' }],
  kurse: [{ titel: 'Schulung Eins', wiederholung: 12 }, { titel: 'Schulung Zwei', wiederholung: 0 }],
  normen: ['Norm Eins', 'Norm Zwei'], werke: ['AAA', 'BBB', 'CCC'], fehler: [],
});
const h = w(`mhBauen(${JSON.stringify(Object.assign(quellen(), { katalog: undefined, personName: undefined }))})`);   // nur zur Form; unten richtig
const bau = (q) => { const c = kontext(); c.ctx.__q = q; return c.w('mhBauen(__q)'); };
const voll = bau(Object.assign(quellen(), { katalog: undefined }));
// Die Funktionen des Katalogs leben im Kontext; für die Tests ein zweiter Kontext, der sie durchreicht.
const mitKatalog = (q) => { const c = kontext(); c.ctx.__q = Object.assign({}, q, { katalog: (n) => c.w(`rmsProzess(${JSON.stringify(n)})`) }); return c.w('mhBauen(__q)'); };
const d = mitKatalog(quellen());
const k = (nr) => d.kapitel.find(x => x.nr === nr);

/* ── 1) Gliederung ── */
ok(d.kapitel.map(x => x.nr).join(' ') === '4.1 4.2 4.3 4.4 5.1 5.2 5.3 6.1 6.2 7.1 7.2 7.3 7.4 7.5 8 9.1 9.2 9.3 10',
  'Die Gliederung folgt der gemeinsamen Normstruktur, Abschnitte 4 bis 10');
ok(d.kapitel.every(x => ['daten', 'teils', 'offen'].includes(x.status)) && d.zahlen.gesamt === 19
  && d.zahlen.daten + d.zahlen.teils + d.zahlen.offen === 19, 'Jeder Abschnitt trägt einen Status, die Zahlen gehen auf');
ok(d.status === 'Entwurf' && d.ausgabe === '' && d.freigabe === '' && d.geltung === 'Konzern' && /ISO 27001/.test(d.systeme), 'Das Handbuch beginnt als Entwurf, ohne Ausgabe und Freigabe');

/* ── 2) Was das RMS nicht weiß, wird nicht erfunden ── */
ok(k('4.1').status === 'offen' && /Unternehmensstrategie/.test(k('4.1').offen.join(' ')) && !k('4.1').absaetze.length && !k('4.1').verfahren.length,
  'Der Kontext (4.1) ist offen und sagt, dass die Strategie fehlt: kein erfundener Inhalt');
ok(k('7.4').status === 'offen' && k('7.4').offen.length === 1, 'Kommunikation (7.4) ist offen');
ok(k('4.2').status === 'teils' && /Norm Eins; Norm Zwei/.test(k('4.2').absaetze.join(' ')) && /interessierte Parteien/.test(k('4.2').offen.join(' ')),
  'Interessierte Parteien (4.2): die geführten Normen stehen da, der Rest bleibt offen');
ok(k('6.2').status === 'teils' && /Für alle 3 Ketten noch offen/.test(k('6.2').offen.join(' ')) && /strategischen Ziele/.test(k('6.2').offen.join(' ')),
  'Die Ziele (6.2) nennen, dass das Ziel aus der Strategie an allen Ketten fehlt');
ok(k('5.1').status === 'teils' && k('5.1').verfahren.length === 1, 'Führung (5.1): Die Freigabe durch die Geschäftsleitung ist beschrieben, die Zusagen fehlen');

/* ── 3) Aus dem Katalog des RMS ── */
const rms = w('RMS_PROZESSE');
ok(['9.1', '9.2', '9.3', '10', '7.3'].every(n => k(n).status === 'daten' && k(n).verfahren.length >= 1),
  'Bewertung, Verbesserung und Bewusstsein sind aus dem Katalog hergeleitet');
const v62 = k('6.2').verfahren[0];
ok(!/\(RMS\)/.test(v62.titel) && v62.text.length > 30 && k('6.2').normbezug.some(n => /ISO 27001/.test(n)),
  'Das Verfahren steht ohne „(RMS)“, mit dem Normbezug des Katalogs');
ok(k('9.3').normbezug.some(n => /9\.3/.test(n)), 'Der Normbezug nennt den Abschnitt (Managementbewertung 9.3)');
ok(/Informationssicherheit/.test(k('6.1').offen.join(' ')), 'Risiken und Chancen (6.1): Die Grenze auf die Informationssicherheit wird genannt');

/* ── 4) Landkarte: Prozesslandschaft und Verantwortung ── */
ok(/3 Ketten und 3 Prozesse/.test(k('4.4').absaetze[0]) && /Stand 24\.11\.2026/.test(k('4.4').absaetze[0]) && /1 Prozess/.test(k('4.4').absaetze[0]),
  'Prozesslandschaft (4.4): Bereiche, Ketten und Prozesse mit Stand');
const t44 = k('4.4').tabellen[0];
ok(t44.zeilen.filter(z => !Array.isArray(z)).map(z => z.gruppe).join('|') === 'Führungsprozesse|Kernprozesse'
  && t44.zeilen.find(z => Array.isArray(z) && z[0] === 'P-001')[2] === 'Erika Muster' && t44.zeilen.find(z => Array.isArray(z) && z[0] === 'P-002')[2] === 'Max Muster'
  && t44.zeilen.find(z => Array.isArray(z) && z[0] === 'P-003')[2] === 'offen',
  'Ketten nach Bereich, mit Prozesseigner (sonst die verantwortliche Person) und „offen“');
ok(/Leere Kette/.test(k('4.4').offen.join(' ')) && k('4.4').status === 'teils', 'Ketten ohne Prozesse stehen als Lücke');
ok(k('5.3').tabellen.length === 2 && k('5.3').tabellen[1].zeilen[0][2] === 'AAA, BBB' && k('5.3').tabellen[1].zeilen[0][3] === 'Rolle Eins, Rolle Zwei'
  && /Prozesseigner/.test(k('5.3').offen.join(' ')), 'Rollen (5.3): Prozesseigner und Verantwortungsketten mit Rollen, fehlende Eigner als Lücke');
ok(/AAA, BBB, CCC/.test(k('4.3').absaetze[0]) && /Konzern, SHB/.test(k('4.3').absaetze[1]) && /Bei 2 Kacheln/.test(k('4.3').offen.join(' ')),
  'Anwendungsbereich (4.3): Standorte, vorhandene Landkarten, offene Geltungsbereiche');
const json = JSON.stringify(d);
ok(!/@/.test(json) && !/beispiel\.de/.test(json), 'Im Handbuch steht keine Mailadresse');
const gast = mitKatalog(Object.assign(quellen(), { personName: (u) => u, lk: { karten: { KONZERN: { baender: [{ key: 'a', titel: 'A' }],
  kacheln: [{ id: 'k', nr: 1, band: 'a', art: 'kette', name: 'K', verantwortlich: 'a.von.beispiel@extern.example' }] } } } }));
ok(gast.kapitel.find(x => x.nr === '5.3').tabellen[0].zeilen[0][2] === 'A. von Beispiel' && !/@/.test(JSON.stringify(gast)),
  'Kennt die Mitgliederliste jemanden nicht, wird der Name aus der Adresse gebildet');

/* ── 5) Politik aus dem Konzernregelwerk ── */
ok(k('5.2').status === 'teils' && /noch nicht gültig \(Status: in Arbeit\)/.test(k('5.2').offen[0])
  && /Grundsatzerklärung Beispiel/.test(k('5.2').offen.join(' ')) && k('5.2').tabellen[0].zeilen.length === 2,
  'Politik (5.2): Die Unternehmenspolitik ist „in Arbeit“, die Grundsatzerklärung noch offen');
const polGueltig = mitKatalog(Object.assign(quellen(), { gov: Object.assign({}, gov, { weitere: [{ bereich: 'Unternehmenspolitik', titel: 'Unternehmenspolitik', status: 'gueltig' }], eintraege: [] }) }));
ok(polGueltig.kapitel.find(x => x.nr === '5.2').status === 'daten', 'Ist die Unternehmenspolitik gültig, ist der Abschnitt hergeleitet');
const polFehlt = mitKatalog(Object.assign(quellen(), { gov: { arten: [], eintraege: [], weitere: [] } }));
ok(polFehlt.kapitel.find(x => x.nr === '5.2').status === 'offen' && /nicht geführt/.test(polFehlt.kapitel.find(x => x.nr === '5.2').offen[0]), 'Ohne Unternehmenspolitik: offen, mit dem Satz dazu');
const ohneGov = mitKatalog(Object.assign(quellen(), { gov: null }));
ok(ohneGov.kapitel.find(x => x.nr === '5.2').status === 'offen' && /nicht lesbar/.test(ohneGov.kapitel.find(x => x.nr === '5.2').offen[0]), 'Ohne lesbare Governance-Struktur steht das da, statt zu erfinden');

/* ── 6) Dokumentierte Information, Schulung, Anlagen ── */
ok(/2 Regelwerke sind veröffentlicht, 2 im Freigabeverfahren, 1 im Entwurf/.test(k('7.5').absaetze[0]), 'Dokumentierte Information (7.5): Regelwerke nach Status, mit Stand');
const art = k('7.5').tabellen[0].zeilen;
ok(art.length === 3 && art[0].join('|') === 'Handbuch|Abgeschlossenes Themengebiet|1|1|0' && art[1].join('|') === 'Policy|Strategischer Rahmen|0|0|1',
  'Das Konzernregelwerk nach Dokumentenart, gezählt nach Status');
ok(k('7.2').tabellen[0].zeilen.map(z => z.join(': ')).join('|') === 'Schulung Eins: alle 12 Monate|Schulung Zwei: einmalig', 'Pflichtschulungen mit ihrer Wiederholung (7.2)');
ok(d.anlagen.map(a => a.id).join('') === 'AB', 'Zwei Anlagen: Prozessverzeichnis und Konzernregelwerk');
const anlA = d.anlagen[0].tabellen[0].zeilen;
ok(anlA.some(z => !Array.isArray(z) && z.ebene === 2 && /P-001 Erste Kette/.test(z.gruppe)) && anlA.some(z => Array.isArray(z) && z[0] === 'P-004' && z[2] === 'ja')
  && anlA.some(z => Array.isArray(z) && z[0] === 'P-005' && z[3] === 'AAA, BBB (zu bestätigen)') && anlA.some(z => Array.isArray(z) && z[1] === 'noch keine Prozesse'),
  'Prozessverzeichnis: Kette, Prozess, Modell ja/nein, Geltung; leere Ketten und offene Geltung gekennzeichnet');
const anlB = d.anlagen[1].tabellen[0].zeilen;
ok(anlB.some(z => z.gruppe === 'Allgemein') && anlB.some(z => Array.isArray(z) && z[0] === 'Kodex Eins' && z[2] === 'gültig' && z[3] === 'Version 2.0, 01.01.2026')
  && anlB.some(z => z.gruppe === 'Weitere Regelungen'), 'Verzeichnis des Konzernregelwerks mit Status, Version und Stand');

/* ── 7) Quellen fehlen: nichts bricht, jede Lücke wird genannt ── */
const leer = bau({ stand: '24.11.2026', fehler: ['Prozesslandkarte: nicht lesbar'] });
ok(leer.kapitel.length === 19 && leer.anlagen.length === 0 && leer.fehler.length === 1, 'Ohne jede Quelle steht das Gerüst, ohne Anlagen');
ok(leer.kapitel.every(x => x.offen.length > 0) && leer.kapitel.find(x => x.nr === '4.4').offen[0] === 'Die Prozesslandkarte des Konzerns liegt nicht vor oder ist leer.',
  'Jeder Abschnitt ohne Quelle nennt seine Lücke');
const ohneKat = bau({ stand: 'x', lk, gov, policies: [], kurse: [], normen: [], werke: [], personName: (u) => u });
ok(ohneKat.kapitel.find(x => x.nr === '9.1').status === 'offen' && ohneKat.kapitel.find(x => x.nr === '9.1').offen[0] === 'Dazu liegt im RMS keine Beschreibung vor.'
  && ohneKat.kapitel.find(x => x.nr === '4.4').status === 'teils', 'Ohne Katalog der RMS-Prozesse: Verfahrensabschnitte offen, die Landkarte trägt trotzdem');
ok(w('mhBauen()').kapitel.length === 19 && w('mhBauen(null)').zahlen.gesamt === 19, 'Auch ohne Eingabe bricht nichts');

/* ── 8) Bildschirm ── */
const html = w(`mhAnsichtHtml(${JSON.stringify(d)}, { darf: (v) => v !== 'risiken' })`);
ok(/class="mh-dok"/.test(html) && (html.match(/class="mh-kap mh-st-/g) || []).length === 19 && (html.match(/class="mh-kap mh-anlage"/g) || []).length === 2, 'Neunzehn Abschnitte und zwei Anlagen');
ok(/id="mh-k-4-4"/.test(html) && /id="mh-k-10"/.test(html) && /href="#mh-k-5-3"/.test(html) && /href="#mh-anlage-A"/.test(html), 'Inhaltsverzeichnis mit Sprungmarken');
ok((html.match(/<td class="mh-nr">/g) || []).length > 0 && !/<td class="mh-nr">Kodex Eins/.test(w(`mhAnsichtHtml(${JSON.stringify(d)}, {})`)),
  'Nur Spalten mit „Nr.“ werden als Nummer gesetzt, Dokumenttitel dürfen umbrechen');
ok(/<td class="mh-kurz">in Arbeit<\/td>/.test(html), 'Kurze Werte wie „in Arbeit“ brechen nicht um');
ok(/Entwurf, aus den aktuellen Daten erzeugt/.test(html) && /mh-offen-tag">Entwurf</.test(html) && /<b>\d+ von 19<\/b>/.test(html), 'Entwurf, Stand der Herleitung und Ausgabe stehen oben');
ok(/mh-chip mh-chip-offen/.test(html) && /mh-chip mh-chip-teils/.test(html) && /mh-chip mh-chip-daten/.test(html), 'Alle drei Status erscheinen mit Symbol und Wort');
ok(/switchView\(&quot;prozesse&quot;\)|switchView\("prozesse"\)/.test(html) && !/switchView\([^)]*risiken/.test(html), 'Der Weg in den Reiter nur, wo man ihn lesen darf');
ok(/<h2>Managementhandbuch<\/h2><div class="mh-unter">Konzern · ISO 9001/.test(html), 'Titel, Geltung und Normen stehen im Kopf');
const boese = mitKatalog(Object.assign(quellen(), { gov: { arten: [], eintraege: [{ kategorie: 'K', art: 'A', titel: '<script>x</script>', status: 'gueltig' }], kategorien: ['K'], weitere: [] } }));
const hb = w(`mhAnsichtHtml(${JSON.stringify(boese)}, {})`);
ok(!/<script>x/.test(hb) && /&lt;script&gt;/.test(hb) && !/<i>Drei/.test(html) && /Leere Kette &lt;b&gt;/.test(html), 'Texte aus den Daten werden maskiert');
ok(!/undefined|NaN|\[object/.test(html), 'Weder undefined noch NaN im Bild');
const handler = [...html.matchAll(/on\w+="([a-zA-Z_]\w*)\(/g)].map(m => m[1]);
ok(handler.every(f => w(`typeof ${f}`) === 'function'), 'Jeder Inline-Handler zeigt auf eine Funktion');

/* ── 9) Druck ── */
const druck = w(`mhDruckHtml(${JSON.stringify(d)}, { kopf: druckKopf(), schrift: ['https://example.org/exo.woff2'] })`);
ok(/^<!doctype html>/.test(druck) && /<div class="druck-kopf">KOPF<\/div>/.test(druck) && /@page \{ size: A4/.test(druck) && /@media print/.test(druck), 'Druckfassung mit Kopf, A4 und Druckregeln');
ok(/🖨 Drucken \/ als PDF speichern/.test(druck) && /class="noprint"/.test(druck), 'Mit Druckknopf, der beim Drucken verschwindet');
ok(!/switchView|onclick="document/.test(druck.replace(/onclick="window\.print\(\)"/, '')), 'Im Druck keine Knöpfe und keine Sprünge');
ok(/Entwurf, nicht freigegeben/.test(druck) && /Anlage A/.test(druck) && /mh-seitenumbruch/.test(druck), 'Der Entwurf ist als solcher gekennzeichnet, die Anlagen beginnen auf neuer Seite');
ok(/@font-face \{ font-family: 'Exo'; src: url\('https:\/\/example\.org\/exo\.woff2'\)/.test(druck), 'Hausschrift Exo');

/* ── 10) Veröffentlichen ── */
const kopie = JSON.stringify(d);
const f1 = w(`mhVeroeffentlicht(${kopie}, { ausgabe: ' 0.1 ', freigabe: ' GL, 01.12.2026 ', von: 'Erika Muster', am: '2026-12-01T09:00:00.000Z' })`);
ok(f1.status === 'Veröffentlicht' && f1.ausgabe === '0.1' && f1.freigabe === 'GL, 01.12.2026' && f1.veroeffentlichtVon === 'Erika Muster'
  && f1.kapitel.length === 19 && f1.historie.length === 1 && f1.historie[0].ausgabe === '0.1' && f1.historie[0].offen === d.zahlen.offen && f1.fehler.length === 0,
  'Die Fassung hält Ausgabe, Freigabe und Herkunft fest und beginnt die Historie');
ok(JSON.stringify(d) === kopie && d.status === 'Entwurf', 'Der Entwurf bleibt unberührt');
const f2 = w(`mhVeroeffentlicht(${kopie}, { ausgabe: '0.2', am: '2026-12-02T09:00:00.000Z' }, ${JSON.stringify(f1)})`);
ok(f2.historie.map(x => x.ausgabe).join() === '0.1,0.2' && f2.freigabe === '', 'Die Historie wächst; ohne Angabe bleibt die Freigabe leer');
const viele = { historie: Array.from({ length: 25 }, (_, i) => ({ ausgabe: '0.' + i })) };
ok(w(`mhVeroeffentlicht(${kopie}, { ausgabe: '9' }, ${JSON.stringify(viele)})`).historie.length === 20, 'Die Historie behält die letzten zwanzig');
const na = (vorher, zahlen) => w(`mhNaechsteAusgabe(${JSON.stringify(vorher)}, { zahlen: ${JSON.stringify(zahlen)} })`);
ok(na(null, { offen: 2, teils: 1 }) === '0.1' && na(null, { offen: 0, teils: 0 }) === '1.0' && na({ ausgabe: '0.3' }, { offen: 1, teils: 0 }) === '0.4'
  && na({ ausgabe: '0.3' }, { offen: 0, teils: 0 }) === '1.0' && na({ ausgabe: '1.0' }, { offen: 0, teils: 0 }) === '1.1' && na({ ausgabe: 'Entwurf' }, { offen: 1, teils: 0 }) === '0.1',
  'Der Vorschlag für die Ausgabe: 0.1, 0.2, … solange etwas offen ist, danach 1.0');

/* ── 11) Bedienung: Entwurf, Lesen, Veröffentlichen ── */
const gespeichert = [];
const bedienung = (opt) => {
  elemente.clear();
  const c = kontext({
    canWriteTab: () => opt.schreiben, canReadTab: () => true,
    spLoadHandbuch: async () => ({ daten: opt.gelesen || null, geaendertAm: 'T1' }),
    spSaveHandbuch: async (daten, erwartet) => { if (opt.fehler) throw new Error(opt.fehler); gespeichert.push([daten, erwartet]); return { geaendertAm: 'T2' }; },
    spLoadLandkarte: async () => ({ daten: lk }), spLoadGovStruktur: async () => ({ daten: gov }), spLoadWissen: async () => ({ daten: {} }),
    spGetMembers: async () => [{ upn: 'erika.muster@beispiel.de', name: 'Erika Muster' }],
    State: { user: { name: 'Erika Muster', upn: 'erika.muster@beispiel.de' }, policies: [] },
    STANDORTE: ['AAA', 'BBB'],
    wiNormalisieren: (x) => ({ beitraege: [{ art: 'kurs', pflicht: true, aktiv: true, titel: 'Schulung Eins', wiederholung: 12 }] }),
  });
  return c;
};
{
  const c = bedienung({ schreiben: true });
  await c.w('initHandbuch()');
  const m = element('handbuch-mount').innerHTML;
  ok(c.w('_mh.ansicht') === 'entwurf' && /class="mh-dok"/.test(m) && /Stand veröffentlichen/.test(m) && /Entwurf \(aktuelle Daten\)/.test(m),
    'Wer pflegen darf, beginnt beim Entwurf, mit Umschalter und „Stand veröffentlichen“');
  ok(/Pflichtschulungen/.test(m) && /Schulung Eins/.test(m) && /Erika Muster/.test(m) && !/beispiel\.de/.test(m), 'Der Entwurf liest Landkarte, Governance und Wissen und zeigt Namen');
  c.w('mhVeroeffentlichenDialog()');
  const dlg = element('modal').innerHTML;
  ok(/value="0\.1"/.test(dlg) && /id="mh-freigabe"/.test(dlg) && /nur festgehalten/.test(dlg), 'Der Dialog schlägt die Ausgabe vor und sagt, dass die Freigabe nur festgehalten wird');
  element('mh-ausgabe').value = '0.1'; element('mh-freigabe').value = 'GL, 01.12.2026';
  await c.w('mhVeroeffentlichen()');
  ok(gespeichert.length === 1 && gespeichert[0][1] === 'T1' && gespeichert[0][0].ausgabe === '0.1' && gespeichert[0][0].status === 'Veröffentlicht',
    'Gespeichert wird die Fassung, auf dem gelesenen Stand der Datei (Schutz vor Überschreiben)');
  ok(c.w('_mh.geaendertAm') === 'T2' && c.w('_mh.gelesen.ausgabe') === '0.1' && /Veröffentlicht \(Ausgabe 0\.1\)/.test(element('handbuch-mount').innerHTML)
    && meldungen.some(x => /Ausgabe 0\.1 veröffentlicht/.test(x[1])), 'Danach steht die Ausgabe im Umschalter und der neue Stand der Datei gilt');
  await c.w(`mhAnsicht('veroeffentlicht')`);
  ok(/Veröffentlichte Fassung/.test(element('handbuch-mount').innerHTML) && !/Stand veröffentlichen/.test(element('handbuch-mount').innerHTML), 'Die veröffentlichte Fassung hat keinen Knopf zum Veröffentlichen');
}
{
  const c = bedienung({ schreiben: false, gelesen: Object.assign({}, f1) });
  await c.w('initHandbuch()');
  const m = element('handbuch-mount').innerHTML;
  ok(c.w('_mh.ansicht') === 'veroeffentlicht' && /Veröffentlichte Fassung/.test(m) && !/mh-umschalter/.test(m) && !/Stand veröffentlichen/.test(m) && !/Entwurf \(aktuelle/.test(m),
    'Wer nur lesen darf, sieht die veröffentlichte Fassung, ohne Umschalter und ohne Entwurf');
  c.w(`mhAnsicht('entwurf')`);
  ok(c.w('_mh.ansicht') === 'veroeffentlicht' && c.w('_mh.entwurf') === null, 'Auch über den Aufruf kommt man nicht an den Entwurf');
  await c.w('mhVeroeffentlichen()');
  ok(gespeichert.length === 1, 'Ohne Schreibrecht wird nichts gespeichert');
}
{
  const c = bedienung({ schreiben: false });
  await c.w('initHandbuch()');
  ok(/noch nicht veröffentlicht/.test(element('handbuch-mount').innerHTML) && !/mh-dok/.test(element('handbuch-mount').innerHTML), 'Ohne veröffentlichte Fassung sagt es das, statt etwas zu zeigen');
}
{
  const c = bedienung({ schreiben: true, fehler: 'Das Managementhandbuch wurde zwischenzeitlich geändert.' });
  await c.w('initHandbuch()');
  c.w('mhVeroeffentlichenDialog()');
  element('mh-ausgabe').value = '0.1';
  await c.w('mhVeroeffentlichen()');
  ok(c.w('_mh.gelesen') === null && meldungen.some(x => x[0] === 'error' && /zwischenzeitlich geändert/.test(x[1])), 'Hat jemand zwischenzeitlich gespeichert, wird nichts überschrieben und es steht eine Meldung da');
  element('mh-ausgabe').value = '  ';
  const vorher = meldungen.length;
  await c.w('mhVeroeffentlichen()');
  ok(meldungen.slice(vorher).some(x => /Ausgabe angeben/.test(x[1])), 'Ohne Ausgabe wird nicht veröffentlicht');
}
{
  const c = bedienung({ schreiben: true });
  c.ctx.spLoadWissen = async () => { throw new Error('Wissen nicht lesbar'); };
  await c.w('initHandbuch()');
  const m = element('handbuch-mount').innerHTML;
  ok(/Nicht alle Quellen waren lesbar/.test(m) && /Pflichtschulungen: Wissen nicht lesbar/.test(m), 'Scheitert eine Quelle, steht das im Entwurf, und der Entwurf entsteht trotzdem');
}

/* ── 12) Verdrahtung ── */
const index = lies('index.html');
ok(/<a class="nav-item" data-view="handbuch" id="nav-handbuch"[^>]*>[\s\S]*?Managementhandbuch/.test(index) && /<section id="view-handbuch" class="view">\s*<div id="handbuch-mount">/.test(index),
  'Navigation und Ansicht stehen in index.html');
ok(index.indexOf('id="nav-handbuch"') > index.indexOf('id="nav-grp-pruefen"') && index.indexOf('id="nav-handbuch"') < index.indexOf('id="nav-grp-anlass"'), 'Der Eintrag steht in der Gruppe „Prüfen und verbessern“');
const access = lies('js/access.js');
ok(/view: 'handbuch', +label: 'Managementhandbuch'/.test(access) && /'cockpit', 'handbuch', 'verwaltung'/.test(access) && /show\('nav-handbuch', +v\.handbuch\)/.test(access)
  && /show\('nav-grp-pruefen', +v\.wirksamkeit \|\| v\.cockpit \|\| v\.compliance \|\| v\.handbuch/.test(access), 'Rechte je Reiter, Sichtbarkeit und Gruppe: In den Einstellungen vergibt man „lesen“ und „schreiben“');
const app = lies('js/app.js');
ok(/handbuch: 'Managementhandbuch'/.test(app) && /view === 'handbuch' +&& typeof initHandbuch === 'function'\) +initHandbuch\(\)/.test(app), 'Titel und Aufruf beim Reiterwechsel stehen in app.js');
const modul = lies('js/module.js');
ok(/handbuch: +MODUL_ADMIN\.concat\(\[[^\]]*'rmsprozesse'[^\]]*'landkartebericht'[^\]]*'managementhandbuch'\]\)/.test(modul), 'Das Modul lädt mit dem Katalog der RMS-Prozesse und der Landkarte');
const sp = lies('js/sharepoint.js');
ok(/handbuchDatei: 'managementhandbuch\.json'/.test(sp) && /async function spLoadHandbuch\(\)/.test(sp) && /async function spSaveHandbuch\(daten, erwartetAm\)/.test(sp)
  && /zwischenzeitlich geändert/.test(sp.slice(sp.indexOf('async function spSaveHandbuch'))), 'Die Ablage ist eine Datei neben wissen.json, mit Schutz vor gleichzeitigem Speichern');
ok(!/createList|spCreateList|\/lists\//.test(sp.slice(sp.indexOf('function _handbuchPfad'), sp.indexOf('Graph-Helper'))), 'Keine neue Liste, keine neuen Spalten');
ok(/\.mh-dok\b/.test(lies('css/style.css')) && /\.mh-chip-offen\b/.test(lies('css/style.css')), 'Die Stile stehen in style.css');
const kern = lies('js/managementhandbuch.js');
ok(!/spCreate|createList|\/lists\//.test(kern), 'Das Modul legt nichts in SharePoint an, nur die eine Datei');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`); process.exit(fail ? 1 : 0);
