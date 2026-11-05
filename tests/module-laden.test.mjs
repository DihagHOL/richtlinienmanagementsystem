/**
 * Module bei Bedarf nachladen – sind die Gruppen vollständig?
 *
 * Anlass war eine Messung: 1.421 KB JavaScript bei jedem Seitenaufruf, davon
 * 240 KB Kern. Der Rest gehörte zu Reitern, die für die meisten Konten gar
 * nicht freigeschaltet sind.
 *
 * Die Gruppen in `js/module.js` sind von Hand gepflegt – aber sie dürfen nicht
 * geraten sein. Dieser Test rechnet die **harte Abhängigkeitshülle** je Ansicht
 * aus und besteht nur, wenn jede Gruppe darunter abgeschlossen ist.
 *
 * „Hart" heißt: ein Name aus einer anderen Datei, der **nicht** durch
 * `typeof x === 'function'` abgesichert ist. Der Unterschied ist der ganze
 * Punkt – ein abgesicherter Aufruf fällt sauber aus, wenn das Modul fehlt; ein
 * ungesicherter ist ein ReferenceError, der die Ansicht stilllegt.
 *
 * Namen in Kommentaren zählen nicht. Genau daran hing der Umbau: `util.js`
 * schien von `prozesse.js` abzuhängen, weil dort `_procLinkCache` im Fließtext
 * einer Erklärung stand.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── Die Karte aus js/module.js holen (ausführen, nicht raten) ── */
const kctx = { module: { exports: {} }, document: { querySelector: () => null }, Map, Promise };
kctx.window = kctx; kctx.globalThis = kctx;
vm.createContext(kctx);
vm.runInContext(lies('js/module.js'), kctx);
const { MODUL_KERN, MODUL_ANSICHTEN } = kctx.module.exports;

const alleModule = [...new Set(Object.values(MODUL_ANSICHTEN).flat())];
const dateien = [...MODUL_KERN, 'module', ...alleModule];

/* ── Harte Abhängigkeiten messen ── */
const ohneKommentar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const defs = new Map(), quelle = new Map();
for (const f of dateien) {
  const s = lies(`js/${f}.js`);
  quelle.set(f, s);
  const namen = new Set();
  for (const l of s.split('\n')) {
    const m = l.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/) || l.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
    if (m) namen.add(m[1]);
  }
  defs.set(f, namen);
}
const wohnt = new Map();
for (const [f, namen] of defs) for (const n of namen) wohnt.set(n, f);

/** Welche anderen Dateien braucht `f` ungesichert – und welche Namen genau? */
function hartVon(f) {
  const s = ohneKommentar(quelle.get(f));
  const sicher = new Set([...s.matchAll(/typeof\s+([A-Za-z_$][\w$]*)\s*[!=]==?\s*['"]/g)].map(m => m[1]));
  const eigene = defs.get(f);
  const out = new Map();
  for (const id of new Set([...s.matchAll(/[A-Za-z_$][\w$]*/g)].map(x => x[0]))) {
    if (eigene.has(id) || sicher.has(id)) continue;
    const b = wohnt.get(id);
    if (!b || b === f) continue;
    if (!out.has(b)) out.set(b, new Set());
    out.get(b).add(id);
  }
  return out;
}

/* ── 1) Der Kern trägt sich selbst ──
   Er ist das, was ohne Nachladen dasteht. Bräuchte eine Kern-Datei etwas aus
   einem nachzuladenden Modul, wäre die Seite von Anfang an kaputt. */
for (const f of MODUL_KERN.concat(['module'])) {
  const fremd = [...hartVon(f).keys()].filter(b => !MODUL_KERN.includes(b) && b !== 'module');
  ok(fremd.length === 0,
    fremd.length ? `js/${f}.js braucht ungesichert: ${fremd.join(', ')} – das gehört in den Kern oder hinter einen Wächter`
                 : `js/${f}.js kommt mit dem Kern aus`);
}

/* ── 2) Jede Gruppe ist abgeschlossen ──
   Die eigentliche Zusicherung: Was eine Ansicht lädt, genügt sich selbst. */
for (const [view, gruppe] of Object.entries(MODUL_ANSICHTEN)) {
  const da = new Set([...MODUL_KERN, 'module', ...gruppe]);
  const fehlt = new Map();
  for (const f of gruppe) {
    for (const [b, namen] of hartVon(f)) {
      if (da.has(b)) continue;
      if (!fehlt.has(b)) fehlt.set(b, new Set());
      for (const n of namen) fehlt.get(b).add(n);
    }
  }
  const text = [...fehlt].map(([b, n]) => `${b} (${[...n].slice(0, 3).join(', ')})`).join(' · ');
  ok(fehlt.size === 0,
    fehlt.size ? `Ansicht „${view}" fehlt: ${text}` : `Ansicht „${view}" ist vollständig (${gruppe.length} Module)`);
}

/* ── 3) Keine verwaisten Dateien ──
   Eine Datei, die in keiner Gruppe steht, wird nie geladen – sie ist dann
   entweder tot oder ein vergessener Eintrag. Beides will man wissen. */
// Zwei Dateien stehen bewusst außerhalb der Gruppen: der Clickjacking-Schutz läuft vor
// allem anderen im <head>, redirect.js nur auf der Rückkehrseite der Anmeldung.
const EIGENSTAENDIG = ['rahmenschutz', 'redirect'];
const imBundle = new Set([...MODUL_KERN, 'module', ...alleModule, ...EIGENSTAENDIG]);
const aufPlatte = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));
const verwaist = aufPlatte.filter(f => !imBundle.has(f));
ok(verwaist.length === 0, verwaist.length ? `nie geladen: ${verwaist.join(', ')}` : `alle ${aufPlatte.length} Dateien in js/ werden geladen`);

/* ── 4) Was die Seite anfangs lädt ── */
const kb = (f) => fs.statSync(path.join(ROOT, `js/${f}.js`)).size / 1024;
const kern = Math.round(MODUL_KERN.concat(['module']).reduce((a, f) => a + kb(f), 0));
const gesamt = Math.round(aufPlatte.reduce((a, f) => a + kb(f), 0));
ok(kern < gesamt * 0.25, `Erstladung ${kern} KB von ${gesamt} KB (${Math.round(100 - kern / gesamt * 100)} % weniger)`);

const html = lies('index.html');
const alleTags = [...html.matchAll(/src="js\/([a-z-]+)\.js/g)].map(m => m[1]);
ok(alleTags[0] === 'rahmenschutz', 'Der Clickjacking-Schutz ist das erste Skript der Seite');
ok(!alleTags.includes('redirect') && /src="js\/redirect\.js"/.test(lies('redirect.html')), 'redirect.js steht nur auf der Rückkehrseite');
const tags = alleTags.filter(t => t !== 'rahmenschutz');
ok(tags.length === MODUL_KERN.length + 1, `die Seite trägt nur noch ${tags.length} Skript-Tags (Kern + Lader)`);
ok(tags.every(t => MODUL_KERN.includes(t) || t === 'module'), 'und keines davon gehört in eine Nachlade-Gruppe');
ok(tags.indexOf('module') > tags.indexOf('util') && tags.indexOf('module') < tags.indexOf('app'),
  'der Lader steht vor app.js – switchView() ruft ihn schon beim ersten Wechsel');

/* ── 5) Der Lader selbst ── */
const geholt = [];
const lctx = {
  module: { exports: {} }, Map, Promise, Set, Object, Array, String, console,
  document: {
    querySelector: () => ({ getAttribute: () => 'js/app.js?v=abc123' }),
    head: { appendChild: (el) => { geholt.push(el.src); setTimeout(() => el.onload(), 0); } },
    createElement: () => ({ set src(v) { this._s = v; }, get src() { return this._s; } }),
  },
  setTimeout,
};
lctx.window = lctx; lctx.globalThis = lctx;
vm.createContext(lctx);
vm.runInContext(lies('js/module.js'), lctx);
const lauf = (s) => vm.runInContext(s, lctx);

/* Die Tabelle schreibt der Bot nach jedem Push. Der Test setzt sie selbst, damit
   er vor und nach dem Bot-Commit dasselbe prüft. */
lauf(`for (const n in MODUL_VERSIONEN) delete MODUL_VERSIONEN[n]; MODUL_VERSIONEN.notfall = 'eigen123';`);

await lauf(`modulLaden('notfall')`);
ok(geholt.length === 1 && geholt[0] === 'js/notfall.js?v=eigen123',
  'Ein Modul wird mit seiner eigenen Prüfsumme geholt, unveränderte Dateien behalten so ihre Adresse');

geholt.length = 0;
await lauf(`modulLaden('risiken')`);
ok(geholt.length === 1 && geholt[0] === 'js/risiken.js?v=abc123',
  'Fehlt es in der Tabelle, gilt die Version des Kerns: Ohne Parameter hielte der Browser die alte Fassung fest');

await lauf(`modulLaden('risiken')`);
await lauf(`modulLaden('risiken')`);
ok(geholt.length === 1, 'Ein zweites Mal wird es nicht geholt');

await lauf(`modulLaden('app')`);
ok(geholt.length === 1, 'Und ein Kern-Modul gar nicht – es steht schon in der Seite');

geholt.length = 0;
await lauf(`modulFuerAnsicht('vorschlaege')`);
ok(geholt.length === 1 && /proposals/.test(geholt[0]), 'Eine Ansicht holt genau ihre Module');

geholt.length = 0;
await lauf(`modulFuerAnsicht('meine')`);
ok(geholt.length === 0, '„Meine Regelwerke" holt nichts nach – das ist der Sinn der Sache');

geholt.length = 0;
await lauf(`modulFuerAnsicht('abdeckung')`);
ok(geholt.join('|').indexOf('reifegrad-katalog') < geholt.join('|').indexOf('reifegrad.js'),
  'Die Reihenfolge der bisherigen Skript-Tags bleibt erhalten');

/* Gleichzeitig holen: Alle Tags müssen im selben Zug entstehen. Nur dann hält
   `async = false` die Reihenfolge ein, und nur dann wartet keine Datei auf die
   vorige. Der Lauf ist hier bewusst noch nicht abgewartet. */
geholt.length = 0;
const imSelbenZug = lauf(`modulFuerAnsicht('dokumentation')`);
const gruppeDok = MODUL_ANSICHTEN.dokumentation.length;
ok(geholt.length === gruppeDok, `Alle ${gruppeDok} Module einer Ansicht werden im selben Zug eingehängt`);
await imSelbenZug;

/* Eine Datei fällt aus: Die Ansicht meldet sie, die übrigen sind da, und der
   nächste Versuch holt nur die eine. */
let bruch = true;
lctx.document.head.appendChild = (el) => {
  geholt.push(el.src);
  setTimeout(() => (bruch && /normen/.test(el.src) ? el.onerror() : el.onload()), 0);
};
lauf(`_modulGeladen.clear()`);   // normen und risiken stehen von oben schon da
geholt.length = 0;
let gemeldet = false;
try { await lauf(`modulFuerAnsicht('risiken')`); } catch (e) { gemeldet = /normen/.test(e.message); }
ok(gemeldet && geholt.length === 2, 'Fällt eine Datei aus, meldet die Ansicht sie mit Namen');
await new Promise(r => setTimeout(r, 5));
bruch = false;
geholt.length = 0;
await lauf(`modulFuerAnsicht('risiken')`);
ok(geholt.length === 1 && /normen/.test(geholt[0]), 'Der nächste Versuch holt nur die gescheiterte Datei');

/* Darauf ruht das gleichzeitige Holen: Fällt eine Datei aus, laufen die übrigen
   ohne sie durch. Das geht nur, solange keine Datei schon beim Ausführen eine
   andere braucht. Jede läuft deshalb allein auf dem Kern, in einem eigenen
   Kontext mit nachgebautem Browser. */
const nichts = () => new Proxy(function () {}, {
  get: (_, p) => (p === Symbol.toPrimitive ? () => '' : nichts()), apply: () => nichts(), set: () => true,
});
const browser = ['document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'addEventListener',
  'removeEventListener', 'matchMedia', 'CustomEvent', 'Event', 'MutationObserver', 'requestAnimationFrame'];
const kernSkripte = MODUL_KERN.map(f => new vm.Script(quelle.get(f)));
const brauchtAndere = [];
for (const f of alleModule) {
  const c = { console, setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {}, URL, URLSearchParams, Intl };
  for (const n of browser) c[n] = nichts();
  c.window = c; c.globalThis = c; c.self = c;
  vm.createContext(c);
  for (const s of kernSkripte) { try { s.runInContext(c); } catch (e) { /* Der Kern braucht mehr Browser als hier nachgebaut */ } }
  try { vm.runInContext(quelle.get(f), c); } catch (e) { brauchtAndere.push(`${f} (${e.message})`); }
}
ok(brauchtAndere.length === 0, brauchtAndere.length
  ? `braucht beim Ausführen schon eine andere Datei: ${brauchtAndere.join(' · ')}`
  : `Keines der ${alleModule.length} Module braucht beim Ausführen ein anderes`);

lctx.document.head.appendChild = (el) => { geholt.push(el.src); setTimeout(() => el.onload(), 0); };

/* Fehlschlag: der Merker muss zurück, sonst bliebe ein gescheitertes Modul
   für immer „geladen" und der zweite Versuch käme nie. */
lctx.document.head.appendChild = (el) => { geholt.push(el.src); setTimeout(() => el.onerror(), 0); };
let geflogen = false;
try { await lauf(`modulLaden('governance')`); } catch (e) { geflogen = /governance/.test(e.message); }
ok(geflogen, 'Ein nicht ladbares Modul meldet sich mit Namen');
lctx.document.head.appendChild = (el) => { geholt.push(el.src); setTimeout(() => el.onload(), 0); };
geholt.length = 0;
await lauf(`modulLaden('governance')`);
ok(geholt.length === 1, 'Und ein zweiter Versuch wird wirklich unternommen');

/* ── 6) switchView wartet ── */
const app = lies('js/app.js');
ok(/await modulFuerAnsicht\(view\)/.test(app), 'switchView() wartet auf die Module der Ansicht');
ok(app.indexOf('await modulFuerAnsicht(view)') < app.indexOf(`document.getElementById('view-' + view)`),
  'und zwar bevor der Abschnitt sichtbar wird – sonst stünden dort tote Knöpfe');
ok(/await switchView\('detail'\)/.test(app),
  'openDetail() wartet ebenfalls – ohne await fehlte „Änderung vorschlagen" lautlos');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
