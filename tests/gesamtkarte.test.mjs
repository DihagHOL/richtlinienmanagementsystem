/**
 * Gesamtkarte der RMS-Prozesse (js/gesamtkarte.js)
 *
 * Worauf es ankommt:
 *   • Jeder Prozess des Katalogs steht genau einmal auf der Karte, in seinem
 *     Thema, und nichts liegt auf etwas anderem.
 *   • Der Baum eines Themas zeigt jeden Prozess unter dem kürzesten Weg vom
 *     Hauptprozess; alles andere sind Querbezüge, keiner geht verloren.
 *   • Die Kette des Gesamtprozesses steht oben vollständig: Start, die zehn
 *     Hauptprozesse in seiner Reihenfolge, Entscheidung, Ende.
 *   • Was die Karte anbietet, ist erlaubt: Reiter nur mit Leserecht,
 *     „Modell öffnen" nur, wenn das Modell im RMS liegt.
 *   • Kopfzeile, Link und Umschalter führen dorthin, und die Zuordnung der
 *     Reiter zu Themen ist in app.js dieselbe wie im Katalog.
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

/* ── Eine kleine Seite: genug DOM, damit die Ansicht sich aufbaut ── */
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
const gelesen = [];
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, RegExp, Number, parseFloat, encodeURIComponent,
  esc: (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  jsArg,
  document: { getElementById: element, querySelectorAll: () => [], querySelector: () => null },
  window: {}, localStorage: { getItem: () => null, setItem: () => {} },
  canReadTab: (v) => v !== 'einstellungen',
  PAGE_TITLES: { kennzahlen: 'Kennzahlen', risiken: 'Risiko-Register' },
  prozessModusLeiste: (a) => `<leiste aktiv="${a}"></leiste>`,
  State: { policies: [{ id: '7', title: 'Richtlinie Informationssicherheit', status: 'Veröffentlicht' }] },
  procEintragLaden: async (p) => { gelesen.push(p.itemId); return { p: ['7'] }; },
  spProzessDateiname: (n) => String(n || 'Prozess').replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '_').trim() || 'Prozess',
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/prozessschema.js', 'js/rmsprozesse.js', 'js/gesamtkarte.js'].forEach(f => vm.runInContext(lies(f), ctx));
const w = (code) => vm.runInContext(code, ctx);

/* ── 1) Daten ── */
const D = w('gkDaten()');
const katalog = w('RMS_PROZESSE');
ok(D.knoten.size === katalog.length && D.knoten.size === 62, 'Jeder Prozess des Katalogs ist ein Knoten (62)');
ok(D.gesamt === 'Managementsystem im Jahreszyklus steuern (RMS)' && D.kette.length === 10 && D.neben.length === 3,
  'Der Gesamtprozess mit seiner Kette aus zehn Hauptprozessen und drei Nebenprozessen');
ok(D.themen.length === 13 && D.themen.reduce((n, t) => n + t.mitglieder.length, 0) === 61,
  'Dreizehn Themen, zusammen alle 61 Prozesse unter dem Gesamtprozess');
ok(D.themen.slice(0, 10).map(t => t.haupt).join('|') === D.kette.join('|'),
  'Die Themen stehen in der Reihenfolge der Kette, die anlassbezogenen dahinter');
const erwartet = katalog.reduce((n, p) => { const k = w('rmsKinder')(p); return n + k.aufrufe.length + k.unter.length + k.neben.length; }, 0)
  + w('RMS_BEZUEGE').length;
ok(D.kanten.length === erwartet, `Jeder Aufruf, jede Zuordnung und jeder Datenbezug ist eine Kante (${D.kanten.length})`);
ok(D.kanten.filter(k => k.art === 'nutzt').every(k => k.text), 'Jeder Datenbezug sagt, worum es geht');
const massnahme = D.knoten.get('Maßnahme umsetzen (RMS)');
ok(massnahme.thema === 'ziele' && massnahme.ein.filter(k => k.quer).length >= 4,
  'Maßnahme umsetzen steht bei den Zielen und hat Querbezüge aus den anderen Themen');
const mitbestimmung = D.knoten.get('Mitbestimmung einholen (RMS)');
ok(mitbestimmung.rollen.some(r => r.name === 'Betriebsrat' && !r.auto) && mitbestimmung.rollen.some(r => r.name === 'System' && r.auto),
  'Rollen kommen aus den Bahnen des Ablaufs, System gilt als Automatik');

/* ── 2) Lage ── */
const L = w('gkLayout(gkDaten())');
ok(L.karten.size === 62, 'Jeder Prozess hat genau eine Karte');
const karten = [...L.karten.entries()];
const ueber = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const drin = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
let deckt = 0;
for (let i = 0; i < karten.length; i++) for (let j = i + 1; j < karten.length; j++) if (ueber(karten[i][1], karten[j][1])) deckt++;
ok(deckt === 0, 'Keine Karte liegt auf einer anderen');
ok(karten.filter(([n]) => n !== D.gesamt).every(([, r]) => drin(r, L.themen[r.thema])), 'Jede Karte liegt in ihrem Thema');
const themen = Object.entries(L.themen);
let themenDeckt = 0;
for (let i = 0; i < themen.length; i++) for (let j = i + 1; j < themen.length; j++) if (ueber(themen[i][1], themen[j][1])) themenDeckt++;
ok(themenDeckt === 0, 'Kein Thema liegt auf einem anderen');
ok(D.themen.every(t => drin(L.themen[t.key], L.baender.find(b => b.key === t.phase))), 'Jedes Thema liegt in der Spalte seiner Phase');
ok(L.baender.map(b => b.key).join(',') === 'planen,umsetzen,pruefen,anlass' && L.baender.every((b, i) => i === 0 || b.x >= L.baender[i - 1].x + L.baender[i - 1].w),
  'Die Phasen stehen nebeneinander: Planen, Umsetzen, Prüfen und verbessern, Anlassbezogen');
ok(L.baender.every(b => b.y >= L.gesamt.y + L.gesamt.h) && drin(L.karten.get(D.gesamt), L.gesamt),
  'Der Gesamtprozess steht darüber, mit seiner Karte im Banner');
const glieder = L.gesamt.glieder;
ok(glieder.length === 13 && glieder[0].art === 'start' && glieder[11].art === 'frage' && glieder[12].art === 'ende'
  && glieder.filter(g => g.art === 'thema').map(g => g.name).join('|') === D.kette.join('|'),
  'Die Kette: Start, die zehn Hauptprozesse in Reihenfolge, Entscheidung, Ende');
let gliedDeckt = 0;
glieder.concat(L.gesamt.neben).forEach((a, i, alle) => alle.slice(i + 1).forEach(b => { if (ueber(a, b)) gliedDeckt++; }));
ok(gliedDeckt === 0 && glieder.every(g => !ueber(g, L.karten.get(D.gesamt))), 'Glieder der Kette und Nebenprozesse überdecken sich nicht');
ok(L.w > 0 && L.h > 0 && [...L.karten.values()].every(r => r.x + r.w <= L.w && r.y + r.h <= L.h), 'Alles liegt innerhalb der Welt');

/* Der Baum: jeder Prozess außer dem Hauptprozess hat genau einen Elternteil in seinem Thema, auf kürzestem Weg. */
ok(D.themen.every(t => t.mitglieder.filter(n => n !== t.haupt).every(n => L.baum.filter(k => k.nach === n).length === 1)),
  'Jeder Prozess hängt im Baum genau einmal');
ok(L.baum.every(k => D.knoten.get(k.von).thema === D.knoten.get(k.nach).thema), 'Der Baum bleibt im Thema, Querbezüge sind Linien');
ok(L.baum.find(k => k.nach === 'Regelwerk freigeben lassen (RMS)').von === 'Regelwerk einführen und pflegen (RMS)',
  'Kürzester Weg: Die Freigabe hängt direkt am Regelwerk, nicht unter dem Governance-Entwurf');
ok(Math.max(...karten.filter(([, r]) => r.thema === 'regelwerke').map(([, r]) => r.ebene)) === 3, 'Regelwerke: vier Ebenen tief');

/* ── 3) Suche ── */
const treffer = (q) => [...D.knoten.values()].filter(n => w('gkTrifft')(n, q)).map(n => n.kurz);
ok(treffer('Betriebsrat').includes('Mitbestimmung einholen') && treffer('A.5.24').includes('Sicherheitsvorfälle behandeln'),
  'Die Suche findet nach Rolle und nach Normbezug');
ok(treffer('regelwerk freigeben').includes('Regelwerk freigeben lassen') && treffer('').length === 0, 'Mehrere Wörter müssen alle passen, leer findet nichts');

/* ── 4) Ansicht ── */
w(`_processes = RMS_PROZESSE.filter(p => !p.gesamt).map((p, i) => ({ itemId: 'm' + i, title: p.name, ordner: 'KONZERN', modified: '' }))
   .concat([{ itemId: 'x1', title: 'Managementsystem im Jahreszyklus steuern (RMS)', ordner: 'SHB', modified: '' }]);`);
w('initGesamtkarte()');
const html = element('prozesse-mount').innerHTML;
ok(/<leiste aktiv="gesamt">/.test(html), 'Oben der Umschalter des Reiters, „Gesamtkarte" aktiv');
ok((html.match(/class="gk-karte[^"]*"\s+data-gk="/g) || []).length === 62, 'Alle 62 Prozesse als Karte');
ok((html.match(/class="gk-thema"/g) || []).length === 13 && (html.match(/class="gk-band"/g) || []).length === 4, 'Dreizehn Themen in vier Spalten');
ok((html.match(/class="gk-stand gk-stand-da"/g) || []).length === 61 && (html.match(/○ kein Modell/g) || []).length === 1,
  'Am Prozess steht, ob sein Modell im RMS liegt; ein gleichnamiges Modell in einer anderen Ablage zählt nicht');
ok(!/data-gk-reiter="einstellungen"/.test(html) && /data-gk-reiter="risiken"/.test(html), 'Reiter-Knöpfe nur für Reiter mit Leserecht');
ok(/class="gk-kettenlinie"/.test(html) && /marker-end="url\(#gk-pfeil-daten\)"/.test(html), 'Die Kette hat Pfeile, Datenbezüge ihre eigene Farbe');
const handler = [...html.matchAll(/on\w+="([a-zA-Z_]\w*)\(/g)].map(m => m[1]);
ok(handler.every(f => typeof w(`typeof ${f}`) === 'string' && w(`typeof ${f}`) === 'function'), 'Jeder Inline-Handler zeigt auf eine Funktion');
ok(!/undefined|NaN/.test(html), 'Weder undefined noch NaN im Bild');
ok(w('_gkT') && w('_gkT.k') > 0 && w('_gkT.k') < 0.5, 'Beim ersten Öffnen passt die ganze Karte hinein');

/* Ein Prozess gewählt: Seitenspalte mit allem, was dazugehört. */
w(`gkWaehlen('Kennzahl messen (RMS)', false)`);
await new Promise(r => setTimeout(r, 10));
const panel = element('gk-panel');
ok(panel.klassen.has('offen') && /Kennzahl messen/.test(panel.innerHTML), 'Ein Klick öffnet die Seitenspalte zum Prozess');
ok(/Nutzt Daten von/.test(panel.innerHTML) && /misst offene hohe Risiken/.test(panel.innerHTML) && /Bindet ein/.test(panel.innerHTML),
  'Sie nennt, was der Prozess einbindet und welche Daten er nutzt, mit dem Grund');
ok(/Modell öffnen/.test(panel.innerHTML) && /→ Kennzahlen/.test(panel.innerHTML), 'Modell öffnen und der Reiter, in dem der Prozess läuft');
ok(gelesen.length === 1 && /Richtlinie Informationssicherheit/.test(element('gk-regelwerke').innerHTML),
  'Die Regelwerke am Modell werden erst jetzt gelesen, einmal');
w(`gkWaehlen('Managementsystem im Jahreszyklus steuern (RMS)', false)`);
ok(/Noch kein Modell im RMS/.test(panel.innerHTML) && /<details class="gk-ablauf" open>/.test(panel.innerHTML),
  'Der Gesamtprozess ohne Modell: Hinweis auf „Standard-Prozesse", der Ablauf steht offen');
w('gkAbwaehlen()');
ok(!panel.klassen.has('offen') && panel.innerHTML === '', 'Esc oder ✕ schließt die Spalte');

/* Wunsch von außen: Thema oder Prozess, auch mit Prozess-Kennung. */
w(`var _prozModus = 'karte'; gkWunschSetzen({ thema: '', prozess: 'Process_RMS_vorfall' }); initGesamtkarte();`);
ok(w('_prozModus') === 'gesamt' && w('_gkWahl') === 'Sicherheitsvorfälle behandeln (RMS)', 'Ein Link mit Prozess-Kennung wählt den Prozess');
ok(w('_gkWunsch') === null, 'Der Wunsch gilt einmal');

/* ── 5) Verdrahtung ── */
const app = lies('js/app.js');
const zuordnung = vm.runInNewContext('(' + app.match(/const GK_REITER_THEMA = (\{[\s\S]*?\});/)[1] + ')');
const ausKatalog = {};
w('RMS_THEMEN').forEach(t => t.reiter.forEach(v => { if (!['meine', 'anleitung', 'ki', 'prozesse'].includes(v)) ausKatalog[v] = t.key; }));
ok(JSON.stringify(Object.keys(zuordnung).sort().map(k => [k, zuordnung[k]])) === JSON.stringify(Object.keys(ausKatalog).sort().map(k => [k, ausKatalog[k]])),
  'Die Kopfzeile ordnet die Reiter denselben Themen zu wie der Katalog');
ok(/_gkKopfLink\(view\);/.test(app) && /canReadTab\('prozesse'\)/.test(app.match(/function _gkKopfLink[\s\S]*?\n}/)[0]),
  'Bei jedem Reiterwechsel steht der Knopf, nur mit Leserecht auf „Prozesse"');
ok(/params\.get\('karte'\) === 'gesamt'/.test(app) && /async function gesamtkarteOeffnen/.test(app), 'Der Link ?ansicht=prozesse&karte=gesamt öffnet die Karte');
const pjs = lies('js/prozesse.js');
ok(/knopf\('gesamt', '🧭 Gesamtkarte'/.test(pjs) && /_prozModus === 'gesamt' && typeof initGesamtkarte === 'function'/.test(pjs),
  'Der Umschalter im Reiter hat die Gesamtkarte');
ok(/'verknuepfungen', 'gesamtkarte', 'notfall'\]/.test(lies('js/module.js')), 'Die Karte lädt mit dem Reiter „Prozesse"');
ok(/\.gk-flaeche\b/.test(lies('css/style.css')) && /\.gk-fern\b/.test(lies('css/style.css')), 'Die Stile stehen in style.css');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`); process.exit(fail ? 1 : 0);
