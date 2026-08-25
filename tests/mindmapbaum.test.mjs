/**
 * Mindmap als Baum – Wurzel links, Äste nach rechts.
 *
 * Worauf es ankommt:
 *   • Ein Baum ist kein Netz: Nur hierarchische Beziehungen dürfen hinein,
 *     „gilt für" verbindet quer und bliebe sonst als Schleife stehen.
 *   • Ein Regelwerk hängt oft an mehreren Prozessen – es darf mehrfach im Baum
 *     stehen, aber niemals unter sich selbst.
 *   • Kein Knoten darf einen anderen überdecken; die Position ist gerechnet,
 *     nicht geraten.
 *   • Das „+" muss dort und nur dort erscheinen, wo sich wirklich etwas
 *     anlegen lässt – und niemals bei Lesezugriff.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const mount = { innerHTML: '' };
const gemeldet = [];
const gerufen = [];        // welche Dialoge geöffnet wurden
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, parseInt, isNaN, encodeURIComponent,
  esc, toast: (t) => gemeldet.push(String(t)), fmtDate: (d) => String(d || '').slice(0, 10),
  canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC'],
  State: { user: { name: 'Test' }, policies: [
    { id: '1', title: 'Kartellrecht', status: 'Veröffentlicht', geltungsbereich: ['ALLE'] },
    { id: '2', title: 'KI-Regelwerk', status: 'Veröffentlicht', geltungsbereich: ['HOL'] },
    { id: '3', title: 'Datenschutz', status: 'Veröffentlicht', geltungsbereich: ['ALLE'] }] },
  emptyState: (t) => `<div>${t}</div>`,
  prozessModusLeiste: () => '',
  openModal: (h) => { gerufen.push('modal:' + (String(h).match(/<h3>([^<]*)/) || [])[1]); },
  closeModal: () => {},
  geltungsbereichLabel: (a) => (a || []).join(', '),
  spLoadLandkarte: async () => null, spLandkarteMeta: async () => '',
  spGetProcessXml: async (id) => `<x><documentation>[[rms:policies=${id === 'm1' ? '2' : '1'}]]</documentation></x>`,
  _parsePolicyIds: (xml) => { const m = String(xml).match(/\[\[rms:policies=([^\]]*)\]\]/); return m ? m[1].split(',').filter(Boolean) : []; },
  document: { getElementById: (id) => (id === 'prozesse-mount' ? mount : null), querySelectorAll: () => [] },
  vkRegelwerkeDialog: (id) => gerufen.push('vkRegelwerkeDialog:' + id),
  lkProzessAnlegen: (id) => gerufen.push('lkProzessAnlegen:' + id),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
vm.runInContext(lies('js/mindmapbaum.js'), ctx);
vm.runInContext(lies('js/verknuepfungen.js'), ctx);
const w = (code) => vm.runInContext(code, ctx);

w(`_lkDaten = lkStartbestand(); _lkDaten.historie = []; _lkGeladen = true;
   _processes = [
     { itemId: 'm1', title: 'Vertrieb – Angebot', modified: 'x', ordner: 'HOL' },
     { itemId: 'm2', title: 'Produktion', modified: 'x', ordner: 'HOL' }];
   Object.assign(lkKachelVonId('vertrieb'), { prozesse: [{ id: 'm1' }] });
   Object.assign(lkKachelVonId('produktion'), { prozesse: [{ id: 'm2' }] });
   Object.assign(lkKachelVonId('personal'), { regelwerke: ['3'] });
   _lkDaten.karten.SHB = { baender: lkKarte('HOL').baender, ergebnisse: [],
     kacheln: [{ id: 'giess', band: 'kern', name: 'Gießerei', geltung: ['SHB'], prozesse: [] }] };`);
// _vkGraph ist ein let in verknuepfungen.js – als Kontext-Eigenschaft wäre es unsichtbar.
ctx.__graph = await w('vkGraphBauen()');
w("_vkGraph = __graph; _lkWerk = 'HOL';");

/* ── 1) Ein Baum, kein Netz ── */
ok(!w("VB_TYPEN.includes('gilt für')"),
  '„gilt für" bleibt draußen – es verbindet quer und machte aus dem Baum wieder ein Netz');
ok(w("VB_TYPEN.includes('enthält') && VB_TYPEN.includes('modelliert in') && VB_TYPEN.includes('geregelt durch')"),
  'Die hierarchischen Beziehungen sind alle dabei');

/* ── 2) Wurzel und erste Ansicht ── */
ok(w('vbWurzelId()') === 'werk:HOL', 'Standard ist das Werk, dessen Landkarte offen ist');
let baum = w('vbBaum()');
ok(baum.tiefe === 0 && baum.kinder.length === 3, 'Unter der Wurzel liegen die drei Bänder');
ok(baum.kinder.every(k => k.kinder.length > 0), 'Die erste Ebene ist offen – man sieht die Gliederung sofort');
ok(baum.kinder[0].kinder.every(k => !k.kinder.length && k.offen === false),
  'Die Prozesse selbst bleiben zu – sonst erschlägt einen der Baum');
ok(baum.kinder.map(k => k.farbe).join(',') === w('VB_PALETTE.slice(0,3).join(",")'),
  'Jeder Ast bekommt eine eigene Farbe aus dem Corporate Design');
ok(baum.kinder[0].kinder.every(k => k.farbe === baum.kinder[0].farbe),
  'Und vererbt sie nach unten – so sieht man die Zugehörigkeit ohne Linien zu verfolgen');

/* ── 3) Auf- und zuklappen ── */
const pfadVertrieb = baum.kinder.find(k => /Kern/.test(k.label)).kinder.find(k => k.label === 'Vertrieb').pfad;
ok(/\|/.test(pfadVertrieb) && pfadVertrieb.endsWith('prozess:HOL:vertrieb'),
  'Der Zustand hängt am Pfad, nicht an der Kennung – derselbe Knoten kann an zwei Stellen stehen');
w(`vbKlick(${JSON.stringify(pfadVertrieb)})`);
baum = w('vbBaum()');
const vertrieb = baum.kinder.find(k => /Kern/.test(k.label)).kinder.find(k => k.label === 'Vertrieb');
ok(vertrieb.offen && vertrieb.kinder.length === 1 && vertrieb.kinder[0].label === 'Vertrieb – Angebot',
  'Ein Klick klappt den Zweig auf');
w(`vbKlick(${JSON.stringify(pfadVertrieb)})`);
ok(!w('vbBaum()').kinder.find(k => /Kern/.test(k.label)).kinder.find(k => k.label === 'Vertrieb').offen,
  'Der zweite Klick klappt ihn wieder zu');

/* ── 4) Layout: nichts überdeckt etwas ── */
w('vbAlleAuf()');
const plan = w('vbLayout(vbBaum())');
ok(plan.flach.length > 20, `Alles aufgeklappt sind es ${plan.flach.length} Knoten`);
const proSpalte = new Map();
plan.flach.forEach(n => { if (!proSpalte.has(n.x)) proSpalte.set(n.x, []); proSpalte.get(n.x).push(n); });
let kollisionen = 0;
proSpalte.forEach(liste => {
  liste.sort((a, b) => a.y - b.y);
  for (let i = 1; i < liste.length; i++) if (liste[i].y < liste[i - 1].y + liste[i - 1].hoehe) kollisionen++;
});
ok(kollisionen === 0, 'Kein Knoten überdeckt einen anderen – die Position ist gerechnet, nicht geraten');
ok([...proSpalte.keys()].length >= 4, 'Je Ebene eine Spalte');
const eltern = plan.flach.filter(n => n.kinder.length);
ok(eltern.every(n => Math.abs(n.mitte - (n.kinder[0].mitte + n.kinder[n.kinder.length - 1].mitte) / 2) < 0.01),
  'Ein Elternknoten sitzt mittig zu seinen Kindern');
ok(plan.flach.every(n => n.x >= 0 && n.y >= 0) && plan.breite > 0 && plan.hoehe > 0, 'Die Bühne umfasst alle Knoten');

/* ── 5) Ein Regelwerk an zwei Prozessen – aber kein Kreis ── */
const rw = plan.flach.filter(n => n.art === 'regelwerk');
ok(rw.length >= 2, 'Regelwerke stehen im Baum');
const doppelt = plan.flach.filter(n => n.id === rw[0].id);
ok(doppelt.every(n => !n.pfad.slice(0, n.pfad.lastIndexOf('|')).includes(n.id)),
  'Kein Knoten taucht unterhalb seiner selbst auf');

/* ── 6) Beschriftung ── */
ok(plan.flach.some(n => n.art === 'band' && w(`_vbLabel(${JSON.stringify({ art: 'band', label: n.label, daten: { werk: 'HOL' } })})`) === n.label.replace(' · HOL', '')),
  'Im Baum eines Werks fällt das „· HOL" am Band weg – es steht schon an der Wurzel');
w("vbSetWurzel('wurzel')");
ok(w('vbBaum()').kinder.map(k => k.label).sort().join('|') === 'HOL|SHB',
  'Mit dem Konzern als Wurzel sind die Werke die erste Ebene');
w("vbSetWurzel('werk:HOL')");

/* ── 7) Das „+" ── */
w('vbAlleAuf(); _vbWahl = ""; renderVerknuepfungen();');
let html = mount.innerHTML;
ok(/class="vb-knoten/.test(html) && /<path /.test(html), 'Gezeichnet werden Knoten und geschwungene Linien');
ok(/vb-plus/.test(html), 'Und das „+" zum Hinzufügen');
const plusArten = w(`vbLayout(vbBaum()).flach.filter(n => _vbPlusHtml(n)).map(n => n.art)`);
ok([...new Set(plusArten)].sort().join('|') === 'band|modell|prozess|werk',
  `Nur dort, wo sich etwas anlegen lässt (${[...new Set(plusArten)].join(', ')})`);
ok(!plusArten.includes('regelwerk'), 'An einem Regelwerk hängt im Baum nichts Neues');
w('lkDarfSchreiben = () => false;');
ok(!/vb-plus/.test(w('vbRenderHtml()')), 'Bei Lesezugriff verschwindet das „+" ganz');
w('lkDarfSchreiben = () => true;');

/* ── 8) Was das „+" öffnet ── */
const pfadVon = (pruef) => w(`vbLayout(vbBaum()).flach.filter(n => ${pruef})[0].pfad`);
gerufen.length = 0;
w(`vbPlus(${JSON.stringify(pfadVon("n.art === 'band' && /Kern/.test(n.label)"))})`);
ok(w('_lkEditing && _lkEditing.band') === 'kern',
  'Am Band öffnet es den Prozess-Dialog mit vorbelegtem Band – nicht noch einmal fragen');
gerufen.length = 0;
w(`vbPlus(${JSON.stringify(pfadVon("n.art === 'modell'"))})`);
ok(gerufen.some(x => /^modal:.*Regelwerk/i.test(x)),
  `Am Modell die Regelwerks-Zuordnung (${gerufen.join(', ')})`);
w(`vbPlus(${JSON.stringify(pfadVon("n.art === 'prozess' && n.label === 'Vertrieb'"))})`);
ok(gerufen.some(x => /modal:Zu „Vertrieb"/.test(x)), 'Am Prozess die Auswahl Modell/Regelwerk');

/* ── 9) Zurück zur Nahsicht ── */
w("vkSetAnsicht('fokus')");
ok(/vk-flaeche/.test(mount.innerHTML), 'Die radiale Nahsicht bleibt erhalten – sie zeigt auch die Querbezüge');
w("vkSetAnsicht('baum')");
ok(/vb-buehne/.test(mount.innerHTML), 'Und zurück');
ok(w("_vkAnsicht") === 'baum', 'Der Baum ist die Standardansicht');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
