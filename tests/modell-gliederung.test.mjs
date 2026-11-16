/**
 * Gliederung der Modelle: Gesamtprozess → Unter- und Nebenprozesse, beliebig tief.
 *
 * Die Modell-Liste im Reiter Prozesse zeigt je Werk oben die Gesamtprozesse,
 * darunter ⊞ im Ablauf eingebundene und ↳ zugeordnete Unterprozesse sowie
 * ⇢ Nebenprozesse. Die Zuordnung steht beim übergeordneten Modell in der
 * Dokumentation des Prozesses:
 *   Unterprozesse: …            Nebenprozesse: …
 *   [[rms:unter=<Kennung>,…]]   [[rms:neben=<Kennung>,…]]
 *
 * Geprüft wird:
 *   • Lesen und Schreiben der Marker, auch durch die anderen Schreiber der
 *     Dokumentation hindurch (Status, Regelwerke, Editor): Keiner darf die
 *     Gliederung löschen.
 *   • Wer oben steht: ein Modell ohne übergeordnetes im selben Werk. Kreise
 *     lassen kein Modell verschwinden.
 *   • Zuordnen und Lösen schreiben nur die Datei des übergeordneten Modells;
 *     ein Kreis wird gar nicht erst gespeichert.
 *   • Die Liste zeichnet den Baum mit den richtigen Zeichen und Knöpfen.
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
const felder = {};
const gemeldet = [];
const gespeichert = [];
const ctx = {
  console, URLSearchParams, setTimeout, clearTimeout, Array, Object, String, JSON, Set, Map, Promise, Math, Date, Number, RegExp, Error,
  document: {
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, activeElement: null,
    getElementById: (id) => (id === 'proc-cards' || id === 'prozesse-mount' ? mount : (felder[id] || null)),
  },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { search: '' },
  esc: (s) => String(s ?? ''),
  fmtDate: (d) => String(d || '').slice(0, 10),
  toast: (t) => gemeldet.push(String(t)),
  uiConfirm: async () => true,
  openModal: () => {}, closeModal: () => {}, canWriteTab: () => true,
  policyZuId: () => null,
  State: { policies: [], konzepte: [] },
  spGetProcessXml: async (id) => ctx.__xml[id] || '',
  spListProcesses: async () => ctx.__liste.slice(),
  spSaveProcess: async (name, xml, werk) => {
    gespeichert.push({ name, xml, werk });
    const p = ctx.__liste.find(x => x.title === name && (x.ordner || '') === (werk || ''));
    if (p) { p.modified = 'm' + (Number(String(p.modified).slice(1)) + 10); ctx.__xml[p.itemId] = xml; }
    return { id: p ? p.itemId : 'NEU', lastModifiedDateTime: 'm99' };
  },
  spMoveProcess: async () => ({}),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/prozessschema.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
vm.runInContext(lies('js/prozesse.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

const leer = (id, doku) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1">
  <bpmn:process id="Process_${id}" isExecutable="false">${doku ? `
    <bpmn:documentation>${doku}</bpmn:documentation>` : ''}
    <bpmn:startEvent id="S1" name="Start" />
  </bpmn:process>
</bpmn:definitions>`;

/* ══ 1) Lesen ══ */
const gl = run(`procGliederungAusText('x\\n[[rms:unter=B, C,B]]\\n[[rms:neben=D,C]]')`);
ok(gl.u.join(',') === 'B,C', 'Unterprozesse aus dem Marker, ohne Doppel und Leerzeichen');
ok(gl.n.join(',') === 'D', 'Nebenprozesse ohne die, die schon Unterprozess sind');
const nix = run(`procGliederungAusText('nur Beschreibung')`);
ok(nix.u.length === 0 && nix.n.length === 0, 'Ohne Marker: keine Kinder');

/* ══ 2) Schreiben: Klartext und Marker, und kein anderer Schreiber löscht sie ══ */
ctx.__liste = [
  { itemId: 'A', title: 'Auftragsabwicklung', ordner: 'HOL', modified: 'm1' },
  { itemId: 'B', title: 'Angebot', ordner: 'HOL', modified: 'm2' },
  { itemId: 'C', title: 'Reklamation', ordner: 'HOL', modified: 'm3' },
  { itemId: 'D', title: 'Versand', ordner: 'HOL', modified: 'm4' },
  { itemId: 'E', title: 'Lead to Cash', ordner: 'HOL', modified: 'm5' },
  { itemId: 'F', title: 'Gießen', ordner: 'SHB', modified: 'm6' },
  { itemId: 'G', title: 'Allein', ordner: 'HOL', modified: 'm7' },
];
run(`_processes = __liste.slice();`);

const text = run(`_procDokuText(['7'], [], null, { u: ['B'], n: ['C'] })`);
ok(/^Unterprozesse: Angebot$/m.test(text) && /^\[\[rms:unter=B\]\]$/m.test(text), 'Unterprozesse im Klartext und als Marker');
ok(/^Nebenprozesse: Reklamation$/m.test(text) && /^\[\[rms:neben=C\]\]$/m.test(text), 'Nebenprozesse ebenso');
ok(text.indexOf('[[rms:policies=7]]') < text.indexOf('Unterprozesse:'), 'Die Gliederung steht hinter Regelwerken und Anlagen');
ok(run(`_procIstDokuZeile('Unterprozesse: x') && _procIstDokuZeile('[[rms:neben=C]]') && !_procIstDokuZeile('Unterprozess: Angebot')`),
  'Die neuen Zeilen gelten als Marker; die Zeile am Element („Unterprozess:") bleibt davon unberührt');

ctx.__x = leer('a1', 'Wir wickeln Aufträge ab.');
const mitGl = run(`procXmlDokuNeu(__x, { gl: { u: ['B'], n: ['C'] } })`);
ok(/Wir wickeln Aufträge ab\./.test(mitGl) && /\[\[rms:unter=B\]\]/.test(mitGl) && /\[\[rms:neben=C\]\]/.test(mitGl),
  'Zuordnen schreibt die Marker, die Beschreibung bleibt');
ctx.__x = mitGl;
const nachStatus = run(`procXmlDokuNeu(__x, { pm: { status: 'ist' } })`);
ok(/\[\[rms:unter=B\]\]/.test(nachStatus) && /\[\[rms:neben=C\]\]/.test(nachStatus),
  'Wer den Status setzt, lässt die Gliederung stehen');
ctx.__x = nachStatus;
const nachRegelwerk = run(`procXmlDokuNeu(__x, { ids: ['9'] })`);
ok(/\[\[rms:unter=B\]\]/.test(nachRegelwerk) && /\[\[rms:policies=9\]\]/.test(nachRegelwerk), 'Wer ein Regelwerk zuordnet, auch');
ok((nachRegelwerk.match(/Unterprozesse:/g) || []).length === 1 && (nachRegelwerk.match(/<bpmn:documentation>/g) || []).length === 1,
  'Nach drei Schreibvorgängen steht alles genau einmal da');
ctx.__x = nachRegelwerk;
ok(!/\[\[rms:(unter|neben)=/.test(run(`procXmlDokuNeu(__x, { gl: { u: [], n: [] } })`)), 'Leere Gliederung: die Marker fallen weg');
ok(!/Unterprozesse|Nebenprozesse|rms:/.test(run(`_procLead(__x, null)`)), 'Die Ansicht zeigt die Gliederung nicht als Beschreibung');

// Der Editor schreibt die Dokumentation beim Speichern neu und darf die Gliederung nicht verlieren.
const root = { businessObject: { documentation: [{ text: 'Beschreibung\nUnterprozesse: Angebot\n[[rms:unter=B]]\nNebenprozesse: Reklamation\n[[rms:neben=C]]' }] } };
run(`_bpmnModeler = { get: (d) => d === 'canvas' ? { getRootElement: () => __root } : { create: (t, a) => ({ $type: t, ...a }) } };`);
ctx.__root = root;
run(`_setProcessDoku(['7'], [], null)`);
const nachEditor = root.businessObject.documentation[0].text;
ok(/\[\[rms:unter=B\]\]/.test(nachEditor) && /\[\[rms:neben=C\]\]/.test(nachEditor) && /\[\[rms:policies=7\]\]/.test(nachEditor)
  && /^Beschreibung$/m.test(nachEditor), 'Speichern im Editor behält die Gliederung');
run(`_bpmnModeler = null;`);

/* ══ 3) Cache-Eintrag ══ */
const e = run(`procLinkEintrag(procEintragAusXml(${JSON.stringify(mitGl)}))`);
ok(e.g && e.g.u.join() === 'B' && e.g.n.join() === 'C' && e.alt === false, 'Der Cache-Eintrag trägt die Gliederung und gilt als vollständig');

const kinder = run(`procGliederungAusEintrag('A', { u: ['D', 'A'], g: { u: ['B', 'D'], n: ['C'] } })`);
ok(kinder.map(k => k.id + ':' + k.art + ':' + k.quelle).join(' ') === 'D:unter:ablauf B:unter:zuordnung C:neben:zuordnung',
  'Kinder: erst die im Ablauf eingebundenen, dann zugeordnet; jedes nur einmal, nie das Modell selbst');

/* ══ 4) Wer oben steht ══
   E (Lead to Cash) ⊞ A; A ↳ B, A ⇢ C; C ↳ D. F (SHB) ⇢ G (HOL). G steht trotzdem in HOL oben. */
const eintrag = (u, gu, gn) => ({ p: [], d: 0, k: false, i: '', u, m: null, g: { u: gu, n: gn } });
const setzeCache = (c) => { ctx.__c = c; run(`_procLinkCache = __c;`); };
setzeCache({
  'A|m1': eintrag([], ['B'], ['C']),
  'B|m2': eintrag([], [], []),
  'C|m3': eintrag([], ['D'], []),
  'D|m4': eintrag([], [], []),
  'E|m5': eintrag(['A'], [], []),
  'F|m6': eintrag([], [], ['G']),
  'G|m7': eintrag([], [], []),
});
const hol = ctx.__liste.filter(p => p.ordner === 'HOL');
ctx.__hol = hol;
ok(run(`procGliederungWurzeln(__hol, procGliederungKinder)`).join(',') === 'E,G',
  'Oben in HOL: Lead to Cash und das Modell, das nur unter einem Modell aus SHB steht');
ok(run(`procGliederungEltern('A')`).map(x => x.modell.itemId + ':' + x.quelle).join() === 'E:ablauf', 'A steht unter E, eingebunden im Ablauf');
ok(run(`procGliederungUnterhalb('E', 'D')`) === true && run(`procGliederungUnterhalb('D', 'E')`) === false,
  'Unterhalb über mehrere Stufen und Arten hinweg');

ctx.__kreis = [{ itemId: 'X' }, { itemId: 'Y' }];
ok(run(`procGliederungWurzeln(__kreis, (id) => [{ id: id === 'X' ? 'Y' : 'X' }])`).join(',') === 'X',
  'X in Y und Y in X: einer rückt nach oben, keiner verschwindet');

/* ══ 5) Wer sich zuordnen lässt ══ */
const kand = run(`procGlKandidaten('C', '')`).map(p => p.itemId);
ok(!kand.includes('C') && !kand.includes('D'), 'Nicht das eigene Modell und nicht, was schon darunter steht');
ok(!kand.includes('A') && !kand.includes('E'), 'Nichts, was darüber steht: das ergäbe einen Kreis');
ok(kand.includes('B') && kand.includes('G') && kand.includes('F'), 'Alles andere steht zur Wahl, auch aus anderen Werken');
ok(kand.indexOf('F') === kand.length - 1, 'Das eigene Werk zuerst');
ok(run(`procGlKandidaten('C', 'shb')`).map(p => p.itemId).join() === 'F', 'Die Suche findet auch über das Werk');

/* ══ 6) Zuordnen und Lösen ══ */
(async () => {
  ctx.__xml = { G: leer('g7', 'Allein für sich.'), C: leer('c3', 'Reklamationen.\nUnterprozesse: Versand\n[[rms:unter=D]]') };
  gespeichert.length = 0;
  ok(await run(`procGliederungSetzen('G', 'B', 'neben')`) === true, 'Zuordnen meldet Erfolg');
  ok(gespeichert.length === 1 && gespeichert[0].name === 'Allein' && gespeichert[0].werk === 'HOL', 'Gespeichert wird nur die Datei des übergeordneten Modells');
  ok(/\[\[rms:neben=B\]\]/.test(gespeichert[0].xml) && /Allein für sich\./.test(gespeichert[0].xml), 'Mit dem Marker, die Beschreibung bleibt');
  ok(run(`procGliederungKinder('G')`).map(k => k.id + ':' + k.art).join() === 'B:neben', 'Der Cache kennt die Zuordnung sofort');

  ok(await run(`procGliederungSetzen('G', 'B', 'unter')`) === true
    && /\[\[rms:unter=B\]\]/.test(ctx.__xml.G) && !/\[\[rms:neben=/.test(ctx.__xml.G), 'Die Art wechseln: aus dem Neben- wird ein Unterprozess, nicht beides');

  gespeichert.length = 0;
  ok(await run(`procGliederungSetzen('D', 'A', 'unter')`) === false && gespeichert.length === 0,
    'Ein Kreis (A steht über D) wird abgelehnt und nicht gespeichert');
  ok(/Kreis/.test(gemeldet[gemeldet.length - 1]), 'Und die Meldung sagt, warum');

  ok(await run(`procGliederungSetzen('C', 'D', '')`) === true && !/rms:unter/.test(ctx.__xml.C) && /Reklamationen\./.test(ctx.__xml.C),
    'Lösen entfernt den Marker und lässt den Rest stehen');

  /* ══ 7) Die Liste als Baum ══ */
  setzeCache({
    'A|m1': eintrag([], ['B'], ['C']),
    'B|m2': eintrag([], [], []),
    'C|m3': eintrag([], ['D'], []),
    'D|m4': eintrag([], [], []),
    'E|m5': eintrag(['A'], [], []),
    'F|m6': eintrag([], [], ['G']),
    'G|m7': eintrag([], [], []),
  });
  ctx.__liste.forEach((p, i) => { p.modified = 'm' + (i + 1); });
  run(`_processes = __liste.slice(); _procKacheln = false; _procBaumOffen = new Set(); _procBaumZeigen = new Set(); _prozModus = 'liste';`);
  run(`_renderProcCards()`);
  let h = mount.innerHTML;
  ok(/pg-gruppe/.test(h) && /Gesamtprozesse/.test(h), 'Je Werk ein Block mit den Gesamtprozessen');
  ok(/Lead to Cash/.test(h) && !/Auftragsabwicklung/.test(h), 'Zugeklappt: nur die Gesamtprozesse, die Unterprozesse noch nicht');
  ok(/Weitere Modelle, noch ohne Unter- oder Nebenprozess/.test(h) && /Allein/.test(h), 'Modelle ohne Gliederung stehen darunter für sich');
  ok(/1 Unterprozess/.test(h), 'Die Zeile sagt, wie viele Unter- und Nebenprozesse darunter stehen');

  run(`procBaumAlle(true)`);
  h = mount.innerHTML;
  ok(/Auftragsabwicklung/.test(h) && /Angebot/.test(h) && /Reklamation/.test(h) && /Versand/.test(h), 'Alle aufklappen zeigt jede Stufe');
  ok(/pg-art-unter[^>]*>⊞ Unterprozess/.test(h), 'Im Ablauf eingebunden: ⊞');
  ok(/pg-art-unter[^>]*>↳ Unterprozess/.test(h) && /pg-art-neben[^>]*>⇢ Nebenprozess/.test(h), 'Zugeordnet: ↳ Unterprozess und ⇢ Nebenprozess');
  ok((h.match(/procGliederungLoesen\(/g) || []).length === 4, 'Lösen nur bei Zuordnungen (B, C, D in HOL, G unter Gießen in SHB), nicht bei der Einbindung im Ablauf');
  ok(/--pg-tiefe:3/.test(h), 'Vier Stufen tief: Lead to Cash › Auftragsabwicklung › Reklamation › Versand');
  ok((h.match(/procGliederungDialog\(/g) || []).length >= 7, 'Jede Zeile lässt sich um Unter- oder Nebenprozesse erweitern');

  felder['search-proc'] = { value: 'versand' };
  run(`procBaumAlle(false)`);
  h = mount.innerHTML;
  ok(/Versand/.test(h) && /Lead to Cash/.test(h) && /Reklamation/.test(h) && !/Allein/.test(h),
    'Suche: der Treffer mit seinem Weg von oben, aufgeklappt; was nicht passt, fällt weg');
  delete felder['search-proc'];

  run(`canWriteTab = () => false; procBaumAlle(true);`);
  h = mount.innerHTML;
  ok(!/procGliederungDialog\(|procGliederungLoesen\(/.test(h), 'Wer nur lesen darf, sieht keine Knöpfe zum Zuordnen oder Lösen');
  run(`canWriteTab = () => true;`);

  // Zuordnung auf ein gelöschtes Modell: sichtbar und lösbar, statt still zu verschwinden.
  setzeCache({ 'E|m5': eintrag([], [], ['WEG']), 'G|m7': eintrag([], [], []) });
  ctx.__liste = ctx.__liste.filter(p => ['E', 'G'].includes(p.itemId));
  run(`_processes = __liste.slice(); procBaumAlle(true);`);
  h = mount.innerHTML;
  ok(/Modell fehlt/.test(h) && /procGliederungLoesen\("E", "WEG"\)|procGliederungLoesen\(&quot;E&quot;, &quot;WEG&quot;\)|procGliederungLoesen\('E', 'WEG'\)/.test(h),
    'Eine Zuordnung auf ein gelöschtes Modell steht als „Modell fehlt" da und lässt sich lösen');

  /* ══ 8) Quelltext ══ */
  const src = lies('js/prozesse.js');
  ok(!/onclick="[^"]*'\$\{/.test(src.slice(src.indexOf('Gliederung der Modelle'), src.indexOf('Modelle, die noch direkt im Prozesse-Ordner'))),
    'Werte in den neuen Handlern nur über jsArg()');
  ok(/\.pg-zeile\b/.test(lies('css/style.css')) && /\.pg-art-neben\b/.test(lies('css/style.css')), 'Die Gliederung hat ihr CSS');

  console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
