/**
 * Konzernkarte in der Gesamtkarte (js/gesamtkarte.js)
 *
 * Worauf es ankommt:
 *   • Oben steht die Konzernkarte aus den Daten der Landkarte: Bereiche,
 *     Ketten und ihre Prozesse. Abgelöste Karten, archivierte und leere
 *     Bereiche fehlen, gezählt wird wie in der Landkarte.
 *   • Ein Prozess, an dem ein Modell aus dem Katalog des RMS hängt, führt in
 *     dessen Thema; das Thema nennt umgekehrt seinen Prozess der Konzernkarte.
 *   • Nichts liegt auf etwas anderem, der Teil des RMS rückt darunter.
 *   • Seitenspalte, Suche und Schilder kennen die Konzernkarte; gedruckt
 *     werden Namen, nie Mailadressen.
 *   • Ohne geladene Landkarte steht die Gesamtkarte wie bisher, die
 *     Konzernkarte kommt nach, ohne dass die Sicht springt.
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

/* ── Erfundene Konzernkarte ── */
const lk = () => ({ karten: { KONZERN: {
  baender: [
    { key: 'fuehrung', titel: 'Führungsprozesse' },
    { key: 'kern', titel: 'Kernprozesse Beispiel' },
    { key: 'unterstuetzung', titel: 'Unterstützungsprozesse' },
    { key: 'alt', titel: 'Abgelöst', archiv: true },
    { key: 'leer', titel: 'Leerer Bereich' },
  ],
  kacheln: [
    { id: 'k-grc', nr: 10, band: 'fuehrung', art: 'kette', name: 'Governance & Compliance', verantwortlich: 'erika.muster@beispiel.de',
      offen: ['geltung'], geltung: ['HOL'],
      verweise: [{ ziel: 'KONZERN:p-regel', art: 'unterprozess' }, { ziel: 'KONZERN:p-risiko', art: 'unterprozess' }] },
    { id: 'p-regel', nr: 11, band: 'fuehrung', name: 'Regelwerke', geltung: ['ALLE'],
      prozesse: [{ id: 'm1', name: 'Regelwerk einführen und pflegen (RMS)' }, { id: 'm2', name: 'Konzernregelwerk lenken (RMS)' }],
      verweise: [{ ziel: 'KONZERN:p-risiko', art: 'folgt' }] },
    { id: 'p-risiko', nr: 12, band: 'fuehrung', name: 'Risiken', prozesse: [{ id: 'm3', name: 'Informationssicherheitsrisiken behandeln (RMS)' }],
      verweise: [{ ziel: 'KONZERN:p-teil', art: 'unterprozess' }] },
    { id: 'p-teil', nr: 13, band: 'fuehrung', name: 'Risikobewertung' },
    { id: 'k-leer', nr: 14, band: 'kern', art: 'kette', name: 'Platzhalterkette', unter: 'Platzhalter: Prozesse folgen' },
    { id: 'k-verkauf', nr: 15, band: 'kern', art: 'kette', name: 'Verkauf', prozesseigner: 'max.muster@beispiel.de', verantwortlich: 'erika.muster@beispiel.de',
      verweise: [{ ziel: 'KONZERN:p-angebot', art: 'unterprozess' }, { ziel: 'AAA:fremd', art: 'unterprozess' }] },
    { id: 'p-angebot', nr: 16, band: 'kern', name: 'Angebot', prozesse: [{ id: 'm9', name: 'Angebot erstellen' }],
      verweise: [{ ziel: 'KONZERN:p-regel', art: 'nutzt' }, { ziel: 'KONZERN:gibt-es-nicht', art: 'nutzt' }] },
    { id: 'p-frei', nr: 17, band: 'unterstuetzung', name: 'Einzelprozess', verantwortlich: 'gast.person@extern.example' },
    { id: 'alt', nr: 18, band: 'alt', name: 'Alter Prozess', abgeloest: { durch: ['KONZERN:p-regel'] } },
    { id: 'alt2', nr: 19, band: 'kern', name: 'Abgelöst im Band', abgeloest: { durch: ['KONZERN:p-angebot'] } },
  ],
} } });
const namen = { 'erika.muster@beispiel.de': 'Erika Muster', 'max.muster@beispiel.de': 'Max Muster' };

/* ── Eine kleine Seite ── */
const elemente = new Map();
const element = (id) => {
  if (!elemente.has(id)) {
    const klassen = new Set();
    elemente.set(id, {
      id, innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, clientWidth: 1200, clientHeight: 700, offsetWidth: 120, offsetHeight: 24,
      classList: { add: (c) => klassen.add(c), remove: (c) => klassen.delete(c), contains: (c) => klassen.has(c),
        toggle: (c, an) => { const soll = an === undefined ? !klassen.has(c) : !!an; if (soll) klassen.add(c); else klassen.delete(c); return soll; } },
      klassen, addEventListener: () => {}, querySelectorAll: () => [], setAttribute: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 180, height: 90 }),
    });
  }
  return elemente.get(id);
};
const aufrufe = [];
const kontext = (extra) => {
  const ctx = Object.assign({
    console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, RegExp, Number, parseFloat, encodeURIComponent, setTimeout,
    esc: (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    jsArg,
    document: { getElementById: element, querySelectorAll: () => [], querySelector: () => null },
    window: {}, localStorage: { getItem: () => null, setItem: () => {} },
    canReadTab: () => true,
    prozessModusLeiste: (a) => `<leiste aktiv="${a}"></leiste>`,
    State: { policies: [] },
    procEintragLaden: async () => ({ p: [] }),
    openProcessAnsicht: (id) => aufrufe.push(['modell', id]),
    lkPersonName: (u) => namen[u] || u,
    lkWerkSetzenStill: (w) => aufrufe.push(['werk', w]),
    setProzessModus: (m) => aufrufe.push(['modus', m]),
    lkKachelOeffnen: (id) => aufrufe.push(['kachel', id]),
  }, extra || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['js/prozessschema.js', 'js/rmsprozesse.js', 'js/landkartebericht.js', 'js/gesamtkarte.js'].forEach(f => vm.runInContext(lies(f), ctx));
  return (code) => vm.runInContext(code, ctx);
};
const w = kontext();
w(`var _lkDaten = null, _lkGeladen = false;`);
const setzeLk = (daten) => { w(`_lkDaten = ${JSON.stringify(daten)}; _lkGeladen = true;`); };

/* ── 1) Daten ── */
setzeLk(lk());
const D = w('gkDaten(_lkDaten)');
const kz = D.konzern;
ok(kz && kz.baender.map(b => b.key).join(',') === 'fuehrung,kern,unterstuetzung',
  'Drei Bereiche: der archivierte und der leere fehlen');
ok(kz.zahlen.ketten === 3 && kz.zahlen.prozesse === 5 && kz.zahlen.modelliert === 3,
  `Gezählt wie in der Landkarte: drei Ketten, fünf Prozesse, drei mit Modell (${JSON.stringify(kz.zahlen)})`);
ok(!kz.knoten.has('alt') && !kz.knoten.has('alt2'), 'Abgelöste Karten stehen nicht darauf');
ok(kz.knoten.get('k-grc').kinder.join(',') === 'p-regel,p-risiko,p-teil',
  'Ein Teilprozess steht in der Kette seines Prozesses, direkt dahinter');
ok(kz.knoten.get('k-verkauf').kinder.join(',') === 'p-angebot', 'Ein Verweis auf eine andere Karte zählt nicht als Prozess der Kette');
ok(kz.baender.find(b => b.key === 'unterstuetzung').ohne.join(',') === 'p-frei', 'Ein Prozess ohne Kette steht in seinem Bereich unter „Ohne Kette“');
ok(kz.knoten.get('p-regel').themen.join(',') === 'regelwerke,governance' && kz.knoten.get('p-risiko').themen.join(',') === 'risiken'
  && kz.knoten.get('p-angebot').themen.length === 0,
  'Die Themen im RMS kommen aus den Modellen: nur Modelle aus dem Katalog zählen');
ok(D.themen.find(t => t.key === 'regelwerke').konzern.join(',') === 'p-regel' && D.themen.find(t => t.key === 'risiken').konzern.join(',') === 'p-risiko'
  && D.themen.find(t => t.key === 'vorfaelle').konzern.length === 0,
  'Jedes Thema kennt den Prozess der Konzernkarte, den es ausführt');
const bez = kz.knoten.get('p-regel').bezuege;
ok(bez.some(b => b.art === 'folgt' && b.mit === 'p-risiko' && b.hin) && bez.some(b => b.art === 'nutzt' && b.mit === 'p-angebot' && !b.hin)
  && !kz.knoten.get('p-angebot').bezuege.some(b => b.mit === 'gibt-es-nicht'),
  'Querbezüge in beide Richtungen, tote Ziele fallen weg');
ok(kz.knoten.get('k-grc').eigner === 'Erika Muster' && kz.knoten.get('k-verkauf').eigner === 'Max Muster',
  'Eigner einer Kette: der Prozesseigner, sonst die verantwortliche Person, mit Namen');
ok(kz.knoten.get('p-frei').eigner === 'Gast Person', 'Kennt die Mitgliederliste jemanden nicht, entsteht der Name aus der Adresse');
ok(w('gkKonzern({ karten: {} })') === null && w('gkKonzern(null)') === null && w(`gkKonzern({ karten: { KONZERN: { baender: [], kacheln: [{ id: 'x', name: 'X', band: 'weg' }] } } })`) === null,
  'Ohne Konzernkarte oder ohne Bereich mit Inhalt: kein Block');

/* ── 2) Lage ── */
const L = w('gkLayout(gkDaten(_lkDaten))');
const B = L.konzern;
const ueber = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const drin = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
ok(B && B.y + B.h <= L.gesamt.y && B.x === L.gesamt.x && B.x + B.w === L.gesamt.x + L.gesamt.w,
  'Die Konzernkarte steht über dem Gesamtprozess, genauso breit');
const spalten = B.baender.flatMap(b => b.spalten.map(id => [id, B.rechtecke.get(id), b]));
ok(spalten.length === 4 && spalten.every(([, r, b]) => drin(r, b)), 'Jede Kette liegt in ihrem Bereich, „Ohne Kette“ zählt als Spalte');
let deckt = 0;
for (let i = 0; i < spalten.length; i++) for (let j = i + 1; j < spalten.length; j++) if (ueber(spalten[i][1], spalten[j][1])) deckt++;
ok(deckt === 0 && B.baender.every((b, i) => i === 0 || b.y >= B.baender[i - 1].y + B.baender[i - 1].h), 'Keine Kette liegt auf einer anderen, die Bereiche untereinander');
ok(['p-regel', 'p-risiko', 'p-teil'].every(id => drin(B.rechtecke.get(id), B.rechtecke.get('k-grc')))
  && drin(B.rechtecke.get('p-frei'), B.rechtecke.get('ohne:unterstuetzung')), 'Jeder Prozess liegt als Zeile in seiner Kette');
const K = w('GK_KZ');
ok(B.rechtecke.get('p-risiko').y - B.rechtecke.get('p-regel').y === K.zeile && B.rechtecke.get('p-regel').y - B.rechtecke.get('k-grc').y === K.kettenKopf,
  'Zeilen im Takt von GK_KZ, unter dem Kopf der Kette');
ok(L.karten.size === 62 && [...L.karten.values()].every(r => r.y >= B.y + B.h) && [...L.karten.values()].every(r => r.x + r.w <= L.w && r.y + r.h <= L.h),
  'Der Teil des RMS steht vollständig darunter, alles in der Welt');
ok(drin(B, { x: 0, y: 0, w: L.w, h: L.h }), 'Die Konzernkarte liegt in der Welt');
// Viele Ketten: Sie brechen in eine zweite Reihe um, statt über den Rand zu laufen.
const viele = lk();
for (let i = 0; i < 14; i++) viele.karten.KONZERN.kacheln.push({ id: 'k-x' + i, nr: 100 + i, band: 'kern', art: 'kette', name: 'Kette ' + i });
const LV = w(`gkLayout(gkDaten(${JSON.stringify(viele)}))`);
const BV = LV.konzern, kern = BV.baender.find(b => b.key === 'kern');
const rv = kern.spalten.map(id => BV.rechtecke.get(id));
let dv = 0;
for (let i = 0; i < rv.length; i++) for (let j = i + 1; j < rv.length; j++) if (ueber(rv[i], rv[j])) dv++;
ok(rv.length === 16 && new Set(rv.map(r => r.y)).size >= 2 && dv === 0 && rv.every(r => drin(r, kern)),
  'Viele Ketten brechen in eine zweite Reihe um, im Bereich und ohne Überlappung');

/* ── 3) Ansicht ── */
w(`_processes = [{ itemId: 'm1', title: 'Regelwerk einführen und pflegen (RMS)', ordner: 'KONZERN' }];`);
w('initGesamtkarte()');
const html = element('prozesse-mount').innerHTML;
ok(/class="gk-kz"/.test(html) && (html.match(/class="gk-kz-band"/g) || []).length === 3, 'Oben der Block mit drei Bereichen');
ok((html.match(/data-gk-kzrahmen="/g) || []).length === 4 && (html.match(/class="gk-kz-prozess gk-kz-el"/g) || []).length === 5,
  'Vier Spalten (drei Ketten, einmal ohne Kette), fünf Prozesszeilen');
ok((html.match(/class="gk-kz-rms" data-gk-thema="/g) || []).length === 3 && /data-gk-thema="governance"/.test(html),
  'Drei Themenzeichen: zwei an Regelwerke, eins an Risiken');
ok(/Platzhalter, Prozesse folgen/.test(html) && /Prozesseigner offen/.test(html) && /Geltung offen/.test(html),
  'Platzhalter, fehlender Eigner und offener Geltungsbereich stehen da');
ok(!/@beispiel\.de|@extern\.example/.test(html) && /Erika Muster/.test(html) && /Max Muster/.test(html), 'Namen statt Mailadressen');
ok(/Konzernkarte P-011/.test(html) && /Konzernkarte P-012/.test(html), 'Die Themen nennen ihren Prozess der Konzernkarte');
ok(/class="gk-linie gk-kz-linie" data-von="kz:p-regel" data-nach="Regelwerk einführen und pflegen \(RMS\)"/.test(html)
  && /gk-kz-bezug gk-kz-folgt" data-von="kz:p-regel" data-nach="kz:p-risiko"/.test(html)
  && /gk-kz-bezug gk-kz-nutzt" data-von="kz:p-angebot" data-nach="kz:p-regel"/.test(html),
  'Linien ins Thema und zwischen den Prozessen der Konzernkarte');
ok(/data-gk-ort="kz"/.test(html) && !/data-gk-ort="kz(band|kette):/.test(html),
  'Von weitem ein Schild für den Block; Bereiche und Ketten tragen ihren Namen in der eigenen Fläche');
const k0 = w('_gkT.k'), s0 = { w: 1200, h: 700 };
ok(Math.abs(k0 - Math.min((s0.w - 80) / B.w, (s0.h - 80) / B.h, 1)) < 1e-9 && w('_gkAuto') === true,
  'Beim ersten Öffnen steht die Konzernkarte im Bild, ⤢ zeigt die ganze Karte');
w('gkEinpassen(false)');
ok(w('_gkT.k') < k0, 'Die ganze Karte ist kleiner als die Konzernkarte allein');
ok(/🗺 Konzernkarte oben/.test(html) && /P-Nr\./.test(html), 'Legende und Suchfeld kennen die Konzernkarte');
const handler = [...html.matchAll(/on\w+="([a-zA-Z_]\w*)\(/g)].map(m => m[1]);
ok(handler.every(f => w(`typeof ${f}`) === 'function'), 'Jeder Inline-Handler zeigt auf eine Funktion');
ok(!/undefined|NaN/.test(html), 'Weder undefined noch NaN im Bild');

/* ── 4) Seitenspalte ── */
const panel = element('gk-panel');
w(`gkWaehlen('kz:p-regel', false)`);
let p = panel.innerHTML;
ok(panel.klassen.has('offen') && /Konzernkarte › Führungsprozesse › <a[^>]*>P-010 Governance &amp; Compliance<\/a>/.test(p),
  'Pfad: Konzernkarte, Bereich, Kette');
ok(/Danach folgt[\s\S]*P-012 Risiken/.test(p) && /Wird genutzt von[\s\S]*P-016 Angebot/.test(p), 'Querbezüge mit Richtung');
ok(/Im RMS ausgeführt/.test(p) && /gkThemaZeigen\(&quot;regelwerke&quot;\)|gkThemaZeigen\("regelwerke"\)/.test(p) && /Konzernregelwerk lenken/.test(p),
  'Die Themen im RMS mit ihren Prozessen');
ok(/openProcessAnsicht\((&quot;|")m1(&quot;|")\)/.test(p) && /gk-chip gk-chip-hell">Konzernregelwerk lenken \(RMS\)/.test(p),
  'Ein Modell, das im RMS liegt, lässt sich öffnen; das andere steht als Name');
ok(/gkLandkarteOeffnen\((&quot;|")p-regel(&quot;|")\)/.test(p), 'Von hier in die Landkarte');
w(`gkWaehlen('kz:k-grc', false)`);
p = panel.innerHTML;
ok(/Prozesseigner der Gruppe/.test(p) && /Erika Muster/.test(p) && /noch zu bestätigen/.test(p) && /Prozesse der Kette <small>3<\/small>/.test(p),
  'Die Kette: Eigner, offener Geltungsbereich, ihre drei Prozesse');
w(`gkWaehlen('kz:p-frei', false)`);
p = panel.innerHTML;
ok(/Konzernkarte › Unterstützungsprozesse<\/div>/.test(p) && /Gast Person/.test(p) && !/@extern/.test(p), 'Ohne Kette: Pfad bis zum Bereich, Name aus der Adresse');
w(`gkWaehlen('Regelwerk einführen und pflegen (RMS)', false)`);
p = panel.innerHTML;
ok(/🗺 <b>Konzernkarte:<\/b> <a[^>]*>P-011 Regelwerke<\/a> <span class="gk-verweis-text">in P-010 Governance &amp; Compliance/.test(p),
  'Ein Prozess des RMS nennt seinen Prozess der Konzernkarte und dessen Kette');
w(`gkWaehlen('kz:alt', false)`);
ok(w('_gkWahl') === 'Regelwerk einführen und pflegen (RMS)', 'Eine abgelöste Karte lässt sich nicht wählen');
w('gkAbwaehlen()');

/* ── 5) Suche ── */
w(`_gkSuche = 'P-012'`);
ok(w('gkTreffer()').join(',') === 'kz:p-risiko', 'Die Suche findet nach P-Nr.');
w(`_gkSuche = 'angebot'`);
ok(w('gkTreffer()')[0] === 'kz:p-angebot', 'Treffer der Konzernkarte kommen zuerst');
w(`_gkSuche = 'Erika'`);
ok(w('gkTreffer()').includes('kz:k-grc'), 'Auch nach dem Eigner');
w(`_gkSuche = ''`);

/* ── 6) In die Landkarte ── */
aufrufe.length = 0;
w(`gkLandkarteOeffnen('p-regel')`);
await new Promise(r => setTimeout(r, 5));
ok(JSON.stringify(aufrufe) === JSON.stringify([['werk', 'KONZERN'], ['modus', 'karte'], ['kachel', 'p-regel']]),
  'Konzernkarte wählen, Landkarte zeigen, Kachel öffnen');

/* ── 7) Nachladen: erst ohne, dann mit Konzernkarte ── */
let geladen = 0;
const w2 = kontext({ lkDatenLaden: async () => { geladen++; w2(`_lkDaten = ${JSON.stringify(lk())}; _lkGeladen = true;`); } });
w2(`var _lkDaten = null, _lkGeladen = false, _prozModus = 'gesamt';`);
elemente.delete('prozesse-mount'); elemente.delete('gk-flaeche');
w2('initGesamtkarte()');
const vorher = { k: w2('_gkT.k'), y: w2('_gkLage.gesamt.y') };
ok(!/class="gk-kz"/.test(element('prozesse-mount').innerHTML) && w2('_gkLkLaeuft') === true && /class="gk-thema"/.test(element('prozesse-mount').innerHTML),
  'Ohne Landkarte steht die Gesamtkarte sofort wie bisher, die Landkarte wird nachgeladen');
await new Promise(r => setTimeout(r, 10));
ok(/class="gk-kz"/.test(element('prozesse-mount').innerHTML) && geladen === 1, 'Danach kommt die Konzernkarte dazu, geladen wird einmal');
ok(w2('_gkT.k') !== vorher.k && w2('_gkAuto') === true
  && Math.abs(w2('_gkT.k') - Math.min(1120 / w2('_gkLage.konzern.w'), 620 / w2('_gkLage.konzern.h'), 1)) < 1e-9,
  'Hatte niemand die Sicht bewegt, steht danach die Konzernkarte im Bild');
// Wer gezoomt hat, behält seinen Ausschnitt: Die Sicht rückt mit dem Teil des RMS nach unten.
const w3 = kontext({ lkDatenLaden: async () => { w3(`_lkDaten = ${JSON.stringify(lk())}; _lkGeladen = true;`); } });
w3(`var _lkDaten = null, _lkGeladen = false, _prozModus = 'gesamt';`);
w3('initGesamtkarte()');
w3('gkZoomen(3, 100, 100)');
const t0 = { k: w3('_gkT.k'), x: w3('_gkT.x'), y: w3('_gkT.y'), g: w3('_gkLage.gesamt.y') };
await new Promise(r => setTimeout(r, 10));
const d = w3('_gkLage.gesamt.y') - t0.g;
ok(d > 0 && w3('_gkT.k') === t0.k && w3('_gkT.x') === t0.x && Math.abs(w3('_gkT.y') - (t0.y - d * t0.k)) < 1e-6,
  'Wer gezoomt hat, sieht danach dieselbe Stelle des RMS');
// Wer die Konzernkarte nicht sehen darf, bekommt sie nicht.
const w4 = kontext({ lkWerkeSichtbar: () => ['AAA'] });
w4(`var _lkDaten = ${JSON.stringify(lk())}, _lkGeladen = true;`);
ok(w4('_gkLandkarte()') === null, 'Ohne Sicht auf die Konzernkarte kein Block');

/* ── 8) Verdrahtung ── */
const css = lies('css/style.css');
ok(/\.gk-kz-kette-kopf \{[^}]*height: var\(--gk-kz-kopf\)/.test(css) && /\.gk-kz-prozess \{[^}]*height: var\(--gk-kz-zeile\)/.test(css),
  'Kopf und Zeilen nehmen ihre Höhe aus GK_KZ, sonst träfen die Linien nicht');
ok(/\.gk-fern \.gk-kz-kette\b/.test(css) && /\.gk-mittel \.gk-kz-pname/.test(css), 'Die Konzernkarte zeigt je nach Zoom mehr');
const mod = lies('js/module.js');
ok(mod.indexOf("'landkarte'") < mod.indexOf("'gesamtkarte'") && mod.indexOf("'landkartebericht'") < mod.indexOf("'gesamtkarte'"),
  'Landkarte und Bericht laden im Reiter vor der Gesamtkarte');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`); process.exit(fail ? 1 : 0);
