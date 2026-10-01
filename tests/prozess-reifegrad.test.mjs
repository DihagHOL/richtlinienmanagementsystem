/**
 * Reifegrad (ISO/IEC 33020) und Kennzahlen (ISO 9001, 4.4) je Prozess.
 *
 * Worauf es ankommt:
 *   • Kennzahlen haben Ziel, Richtung und Ist. „mindestens" ist erfüllt ab dem
 *     Ziel, „höchstens" bis zum Ziel. Ohne Ziel oder Ist ist nichts bewertet.
 *     Zahlen dürfen deutsch geschrieben sein (95,5 · 1.250).
 *   • Die Konzernkachel gibt Kennzahlen vor, gemessen wird im Werk: geerbt wird
 *     das Ziel, nie der Messwert. Ein werksspezifischer Prozess erbt nichts.
 *   • Der Reifegrad wird je Werk bewertet und nicht vom Konzern geerbt. Ein
 *     Modell erbt ihn von seiner Kachel, denn beide sind derselbe Prozess.
 *   • Im BPMN steht der Reifegrad als sechstes Feld des pm-Markers, nur wenn er
 *     gesetzt ist. Ältere Marker mit fünf Feldern lesen sich unverändert. Jede
 *     Kennzahl hat einen eigenen Marker. Neu schreiben verdoppelt nichts.
 *   • Ab der Freigabe sind fehlende Kennzahlen und ein fehlender Reifegrad eine
 *     Lücke, ausgerollt und gruppeneinheitlich auch ein Reifegrad unter 3.
 *   • Kachel-Editor und Modell-Editor teilen dieselbe Kennzahl-Tabelle; leere
 *     Zeilen fallen beim Speichern weg, der Verlauf nennt die Änderung.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { jsArg } = require('../js/util.js');
const M = require('../js/prozessmodell.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split(String.fromCharCode(13)).join('');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NL = String.fromCharCode(10);
const HEUTE = new Date(2026, 9, 1);

console.log('Reifegrad');
ok(M.PZ_REIFEGRAD.map(r => r.key).join('') === '012345', 'Sechs Stufen von 0 bis 5');
ok(M.pzReifegradInfo('3').label === '3 etabliert' && M.pzReifegradInfo(3).label === '3 etabliert', 'Stufe als Text oder Zahl');
ok(M.pzReifegradInfo('6') === null && M.pzReifegradInfo('') === null, 'Unbekannte Stufe: keine');
ok(M.pzReifegrad({ reifegrad: '0' }).key === '0', 'Stufe 0 ist eine Bewertung, kein leerer Wert');

console.log('Zahlen');
ok(M.pzZahl('95') === 95 && M.pzZahl('95,5') === 95.5 && M.pzZahl('95 %') === 95, 'Ganz, mit Komma, mit Prozentzeichen');
ok(M.pzZahl('1.250') === 1250 && M.pzZahl('1.250,5') === 1250.5 && M.pzZahl('1.5') === 1.5, 'Tausenderpunkte deutsch, Dezimalpunkt bleibt');
ok(M.pzZahl('') === null && M.pzZahl('viel') === null, 'Keine Zahl: null');

console.log('Kennzahlen');
const lt = { name: 'Liefertreue', einheit: '%', richtung: 'hoch', ziel: '95', ist: '93', stand: '2026-09-30' };
const dlz = { name: 'Durchlaufzeit', einheit: 'Tage', richtung: 'niedrig', ziel: '5', ist: '4,5', stand: '' };
ok(M.pzKpiBewertung(lt) === 'verfehlt' && M.pzKpiBewertung(Object.assign({}, lt, { ist: '95' })) === 'erfuellt', '„mindestens": ab dem Ziel erfüllt');
ok(M.pzKpiBewertung(dlz) === 'erfuellt' && M.pzKpiBewertung(Object.assign({}, dlz, { ist: '6' })) === 'verfehlt', '„höchstens": bis zum Ziel erfüllt');
ok(M.pzKpiBewertung(Object.assign({}, lt, { ist: '' })) === 'offen', 'Ohne Messwert: offen');
const st = M.pzKpiStand([lt, dlz, Object.assign({}, lt, { ist: '' })]);
ok(st.gesamt === 3 && st.erfuellt === 1 && st.verfehlt === 1 && st.offen === 1, 'Zusammenfassung zählt alle drei Zustände');
ok(M.pzKpiText(lt) === 'Liefertreue ≥ 95 %, Ist 93 % (Stand 30.09.2026)', 'Klartext mit Richtung, Einheit und Stand');
const norm = M.pzKpiNormal([{ name: '' }, { name: 'X', richtung: 'quer', stand: 'gestern' }]);
ok(norm.length === 1 && norm[0].richtung === 'hoch' && norm[0].stand === '', 'Ohne Namen keine Kennzahl, Ungültiges fällt raus');

console.log('Marker im BPMN');
const pm5 = { status: 'soll', prozesseigner: 'cfo@dihag.com', standardisierung: 'einheitlich', prioritaet: 'hoch', naechsteUeberpruefung: '2027-03-01' };
ok(M.pzPmMarker(pm5) === '[[rms:pm=soll|cfo@dihag.com|einheitlich|hoch|2027-03-01]]', 'Ohne Reifegrad: das alte Format mit fünf Feldern');
ok(M.pzPmMarker(Object.assign({}, pm5, { reifegrad: '2' })) === '[[rms:pm=soll|cfo@dihag.com|einheitlich|hoch|2027-03-01|2]]', 'Mit Reifegrad: sechstes Feld');
ok(M.pzPmAusText('[[rms:pm=soll|cfo@dihag.com|einheitlich|hoch|2027-03-01]]').reifegrad === '', 'Ein alter Marker liest sich ohne Reifegrad');
const pmVoll = Object.assign({}, pm5, { reifegrad: '3', kennzahlen: [lt, dlz] });
const zeilen = M.pzPmZeilen(pmVoll);
ok(zeilen[0].startsWith('Prozessmanagement: ') && /Reifegrad 3 etabliert/.test(zeilen[0]), 'Klartext nennt den Reifegrad');
ok(zeilen[2] === 'Kennzahlen: Liefertreue ≥ 95 %, Ist 93 % (Stand 30.09.2026); Durchlaufzeit ≤ 5 Tage, Ist 4,5 Tage', 'Eine Klartextzeile für alle Kennzahlen');
ok(zeilen[3] === '[[rms:kpi=Liefertreue|%|hoch|95|93|2026-09-30]]' && zeilen.length === 5, 'Je Kennzahl ein Marker');
ok(JSON.stringify(M.pzPmAusText(zeilen.join(NL))) === JSON.stringify(M.pzPmNormal(pmVoll)), 'Rundlauf: gelesen kommt dasselbe heraus');
const nurKpi = M.pzPmZeilen({ kennzahlen: [dlz] });
ok(nurKpi.length === 2 && !nurKpi.some(z => z.includes('rms:pm=')), 'Nur Kennzahlen: keine leere pm-Zeile');
const gelesen = M.pzPmAusText(nurKpi.join(NL));
ok(gelesen && gelesen.kennzahlen.length === 1 && gelesen.status === '', 'Auch ohne pm-Marker werden die Kennzahlen gelesen');
ok(M.pzKpiMarker({ name: 'A|B]]C', einheit: '', richtung: 'hoch', ziel: '', ist: '', stand: '' }) === '[[rms:kpi=A B  C||hoch|||]]',
  'Trenner und Klammern können den Marker nicht sprengen');
ok(!M.pzPmLeer({ kennzahlen: [dlz] }) && M.pzPmLeer({ kennzahlen: [{ name: '' }] }), 'Kennzahlen zählen als Angabe, leere Zeilen nicht');

console.log('Erbe');
const daten = { karten: {
  KONZERN: { kacheln: [
    { id: 'k1', name: 'Beschaffung', standardisierung: 'einheitlich', reifegrad: '4', kennzahlen: [lt] },
    { id: 'k2', name: 'Instandhaltung', standardisierung: 'lokal', kennzahlen: [dlz] },
  ] },
  HOL: { kacheln: [
    { id: 'h1', name: 'Beschaffung', status: 'ausgerollt', prozesse: [{ id: 'M1', name: 'Bestellung' }] },
    { id: 'h2', name: 'Instandhaltung', status: 'freigegeben' },
    { id: 'h3', name: 'Lohn', reifegrad: '2', kennzahlen: [dlz] },
  ] },
} };
const kachel = (w, id) => daten.karten[w].kacheln.find(k => k.id === id);
const e1 = M.pzKennzahlenVon(daten, 'HOL', kachel('HOL', 'h1'));
ok(e1.geerbt && e1.liste.length === 1 && e1.liste[0].ziel === '95', 'Die Werkkachel erbt die Kennzahl der Konzernkachel als Vorgabe');
ok(e1.liste[0].ist === '' && e1.liste[0].stand === '', 'Geerbt wird das Ziel, nicht der Messwert des Konzerns');
ok(kachel('KONZERN', 'k1').kennzahlen[0].ist === '93', 'Die Konzernkachel selbst bleibt unberührt');
ok(M.pzKennzahlenVon(daten, 'HOL', kachel('HOL', 'h2')).liste.length === 0, 'Werksspezifisch: keine Vorgabe vom Konzern');
const e3 = M.pzKennzahlenVon(daten, 'HOL', kachel('HOL', 'h3'));
ok(!e3.geerbt && e3.liste[0].ist === '4,5', 'Eigene Kennzahlen mit Messwert');
ok(M.pzReifegrad(kachel('HOL', 'h1')).key === '', 'Der Reifegrad des Konzerns gilt nicht für das Werk');

const host = { werk: 'HOL', kachel: Object.assign({}, kachel('HOL', 'h3')) };
const [m1] = M.pzModellEintraege(daten, [{ itemId: 'M3', title: 'Lohnabrechnung', ordner: 'HOL', pm: null, kacheln: [host] }], HEUTE);
ok(m1.reifegrad.key === '2' && m1.reifegrad.geerbt, 'Das Modell erbt den Reifegrad seiner Kachel');
ok(m1.kennzahlen.geerbt && m1.kennzahlen.liste[0].ist === '4,5', 'und deren Kennzahlen samt Messwert, denn es ist derselbe Prozess');
const [m2] = M.pzModellEintraege(daten, [{ itemId: 'M3', title: 'Lohnabrechnung', ordner: 'HOL', pm: { reifegrad: '3', kennzahlen: [lt] }, kacheln: [host] }], HEUTE);
ok(m2.reifegrad.key === '3' && !m2.reifegrad.geerbt && !m2.kennzahlen.geerbt && m2.kennzahlen.liste[0].name === 'Liefertreue', 'Eigene Angaben am Modell haben Vorrang');
const [m3] = M.pzModellEintraege(daten, [{ itemId: 'M9', title: 'Beschaffung', ordner: 'SHB', pm: null, kacheln: [] }], HEUTE);
ok(m3.kennzahlen.geerbt && m3.kennzahlen.liste[0].ist === '' && m3.reifegrad.key === '', 'Ohne Kachel: Vorgabe der Konzernkachel ohne Messwert, kein Reifegrad');

console.log('Lücken ab der Freigabe');
const eintr = M.pzEintraege(daten, ['HOL'], HEUTE);
const von = (id) => eintr.find(e => e.kachel.id === id);
ok(M.pzLuecken(von('h3')).length === 0, 'Vor der Freigabe ist nichts eine Lücke');
ok(M.pzLuecken(von('h2')).join() === 'keine Kennzahl,Reifegrad nicht bewertet', 'Freigegeben ohne Kennzahl und Reifegrad: zwei Lücken');
ok(M.pzLuecken(Object.assign({}, von('h1'), { reifegrad: { key: '2', geerbt: false } })).join() === 'Reifegrad unter 3', 'Ausgerollt und gruppeneinheitlich: unter Stufe 3 ist zu wenig');
ok(M.pzLuecken(Object.assign({}, von('h1'), { reifegrad: { key: '2', geerbt: false }, standard: { key: 'rahmen', geerbt: false } })).length === 0, 'Beim einheitlichen Rahmen genügt eine Bewertung');
const kz = M.pzKennzahlen(eintr);
ok(kz.mitKennzahl === 2 && kz.reifegradBewertet === 1 && kz.kennzahlVerfehlt === 0, 'Kopfzahlen: mit Kennzahlen, bewertet, verfehlt');

/* ── Kachel: Ansicht, Editor, Verlauf, Backlog ── */
const DATEN = {
  version: 2, historie: [],
  karten: {
    KONZERN: { baender: [{ key: 'kern', titel: 'Kern' }], kacheln: [
      { id: 'k-einkauf', nr: 1, band: 'kern', name: 'Beschaffung', geltung: ['ALLE'], verantwortlich: 'cfo@dihag.com', standardisierung: 'einheitlich',
        kennzahlen: [{ name: 'Liefertreue', einheit: '%', richtung: 'hoch', ziel: '95', ist: '97', stand: '2026-09-01' }] },
    ] },
    HOL: { baender: [{ key: 'kern', titel: 'Kern' }], kacheln: [
      { id: 'h-einkauf', nr: 2, band: 'kern', name: 'Beschaffung', geltung: ['HOL'], status: 'poc', prioritaet: 'hoch' },
    ] },
  },
};
const mount = { innerHTML: '' };
let modal = '';
const gespeichert = [];
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent,
  setTimeout: (f) => f(), clearTimeout: () => {},
  esc, jsArg, toast: () => {}, fmtDate: (d) => String(d || '').slice(0, 10),
  canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB'],
  State: { user: { name: 'Anna Muster', upn: 'anna@dihag.com' }, policies: [] },
  emptyState: (t) => `<div class="empty">${t}</div>`,
  prozessModusLeiste: (a) => `<div class="modus">${a}</div>`,
  openModal: (h) => { modal = h; }, closeModal: () => {},
  geltungsbereichLabel: (a) => (!a || !a.length ? '' : a.join(', ')),
  renderGeltungsbereichSection: () => '<div class="gb"></div>',
  spLoadLandkarte: async () => ({ daten: JSON.parse(JSON.stringify(DATEN)), geaendertAm: 'T1' }),
  spLandkarteMeta: async () => 'T1',
  spSaveLandkarte: async (d) => { gespeichert.push(JSON.parse(JSON.stringify(d))); return 'T1'; },
  document: { getElementById: (id) => (id === 'prozesse-mount' ? mount : null), querySelectorAll: () => [], querySelector: () => null },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/prozessmodell.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
vm.runInContext(lies('js/prozessbacklog.js'), ctx);
const w = (code) => vm.runInContext(code, ctx);
await w('initProzessBacklog()');

console.log('Kachel');
w('_lkWerk = "HOL"; lkKachelOeffnen("h-einkauf")');
ok(modal.includes('Reifegrad') && modal.includes('nicht bewertet'), 'Die Ansicht nennt den Reifegrad');
ok(modal.includes('Liefertreue ≥ 95 %') && !modal.includes('Ist 97') && modal.includes('Vorgabe der Konzern-Landkarte'), 'und die Vorgabe des Konzerns ohne dessen Messwert');
w('lkKachelBearbeiten("h-einkauf")');
ok(modal.includes('Reifegrad (ISO/IEC 33020)') && modal.includes('>3 etabliert<') && modal.includes('Kennzahlen (ISO 9001, 4.4)'), 'Der Editor hat Reifegrad und Kennzahlen');
ok(modal.includes('Übernehmen und messen') && modal.includes('lkKpiVorgabeUebernehmen(&quot;lk&quot;)'), 'Die Vorgabe lässt sich übernehmen');
w('lkKpiVorgabeUebernehmen("lk")');
ok(w('_lkEditing.kennzahlen.length') === 1 && w('_lkEditing.kennzahlen[0].ist') === '', 'Übernommen: die Kennzahl, ohne Messwert');
w('lkKpiFeld("lk", 0, "ist", "93")');
ok(/^\d{4}-\d{2}-\d{2}$/.test(w('_lkEditing.kennzahlen[0].stand')), 'Ein neuer Messwert bekommt das heutige Datum');
const editorHtml = w('lkKpiEditorHtml("lk", true)');
ok(editorHtml.includes('title="Ziel verfehlt"') && editorHtml.includes('lkKpiWeg(&quot;lk&quot;,0)'), 'Die Tabelle zeigt die Ampel und lässt entfernen');
w('lkKpiNeu("lk"); lkKpiNeu("lk"); lkKpiFeld("lk", 2, "name", "Reklamationen"); lkKpiWeg("lk", 2)');
ok(w('_lkEditing.kennzahlen.length') === 2, 'Neu und Entfernen');
w('_lkEditing.reifegrad = "2"; lkPzStatusWahl("ausgerollt")');
await w('lkEditorSpeichern()');
const nach = gespeichert[gespeichert.length - 1];
const be = nach.karten.HOL.kacheln.find(k => k.id === 'h-einkauf');
ok(be.reifegrad === '2' && be.kennzahlen.length === 1 && be.kennzahlen[0].ist === '93', 'Gespeichert: Reifegrad und Kennzahl, die leere Zeile fällt weg');
const was = nach.historie[nach.historie.length - 1].was;
ok(/Reifegrad: nicht bewertet → 2 gesteuert/.test(was) && /Kennzahlen: Liefertreue ≥ 95 %, Ist 93 %/.test(was), 'Der Verlauf nennt beide Änderungen');
ok(nach.karten.KONZERN.kacheln[0].kennzahlen[0].ist === '97', 'Die Vorgabe des Konzerns bleibt unberührt');

console.log('Backlog');
w('renderProzessBacklog()');
const bh = mount.innerHTML;
ok(bh.includes('📊 0/1 im Ziel') && bh.includes('RG 2'), 'Die Karte zeigt Reifegrad und Kennzahlen');
ok(bh.includes('⚠ Reifegrad unter 3'), 'Ausgerollt, gruppeneinheitlich und unter Stufe 3: Lücke');
ok(bh.includes('Kennzahl verfehlt') && bh.includes('Reifegrad bewertet') && bh.includes('mit Kennzahlen'), 'Der Kopf zählt Kennzahlen und Reifegrad');

/* ── Modell-Editor und Dokumentation ── */
const els = {};
const el = (id, wert) => { els[id] = { id, value: wert, disabled: false, innerHTML: '' }; return els[id]; };
el('proc-pm', ''); el('proc-pm-status', 'freigegeben'); el('proc-pm-eigner', ''); el('proc-pm-std', ''); el('proc-pm-prio', '');
el('proc-pm-termin', '2027-10-01'); el('proc-pm-rg', '4'); el('proc-pm-kpi', '');
const pctx = { console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, Number, RegExp, encodeURIComponent, esc, jsArg,
  State: { policies: [] }, toast: () => {}, localStorage: { getItem: () => null, setItem: () => {} }, STANDORTE: ['HOL'],
  document: { getElementById: (id) => els[id] || null, querySelectorAll: () => [], querySelector: () => null } };
pctx.window = pctx; pctx.globalThis = pctx; pctx.module = undefined;
vm.createContext(pctx);
vm.runInContext(lies('js/util.js'), pctx);
vm.runInContext(lies('js/prozessmodell.js'), pctx);
vm.runInContext(lies('js/prozesse.js'), pctx);
vm.runInContext(lies('js/landkarte.js'), pctx);
const p = (code) => vm.runInContext(code, pctx);

console.log('Modell-Editor');
p(`_lkDaten = ${JSON.stringify(DATEN)}; _procEditing = { itemId: 'M1', origName: 'Bestellung.bpmn', origWerk: 'HOL' }; _procPm = null; _bpmnModeler = {}; _procDirty = false`);
p('_renderProcPm(true)');
const ph = els['proc-pm'].innerHTML;
ok(ph.includes('Reifegrad (ISO/IEC 33020)') && ph.includes('id="proc-pm-kpi"') && ph.includes('+ Kennzahl'), 'Der Seitenbereich hat Reifegrad und Kennzahlen');
p('lkKpiNeu("proc"); lkKpiFeld("proc", 0, "name", "Durchlaufzeit"); lkKpiFeld("proc", 0, "richtung", "niedrig"); lkKpiFeld("proc", 0, "ziel", "5"); lkKpiFeld("proc", 0, "einheit", "Tage"); lkKpiFeld("proc", 0, "ist", "4")');
ok(p('_procDirty') === true, 'Eine Kennzahl ändern ist eine ungespeicherte Änderung');
p('lkKpiNeu("proc")');
p('_procPmAusFormular()');
ok(p('_procPm.reifegrad') === '4' && p('_procPm.kennzahlen.length') === 1 && p('_procPm.status') === 'freigegeben', 'Aus dem Formular: Reifegrad und Kennzahl, die leere Zeile fällt weg');
ok(els['proc-pm-kpi'].innerHTML.includes('Durchlaufzeit') && !els['proc-pm-kpi'].innerHTML.includes('lkKpiWeg(&quot;proc&quot;,1)'), 'Die Tabelle passt danach wieder zur Liste');

console.log('Dokumentation des Prozesses');
pctx.__x = p('procLeeresBpmn()').replace('<bpmn:startEvent', '<bpmn:documentation>Bestellungen bis 5.000 Euro.</bpmn:documentation>' + NL + '    <bpmn:startEvent');
const xml1 = p('procXmlDokuNeu(__x, { ids: [], docs: [], pm: _procPm })');
ok(/\[\[rms:pm=freigegeben\|\|\|\|2027-10-01\|4\]\]/.test(xml1) && /\[\[rms:kpi=Durchlaufzeit\|Tage\|niedrig\|5\|4\|\d{4}-\d{2}-\d{2}\]\]/.test(xml1), 'Reifegrad und Kennzahl stehen im BPMN');
pctx.__x = xml1;
const xml2 = p(`procXmlDokuNeu(procXmlDokuNeu(__x, { ids: ['7'] }), { ids: ['7'] })`);
ok((xml2.match(/Kennzahlen: /g) || []).length === 1 && (xml2.match(/rms:kpi=/g) || []).length === 1, 'Zweimal neu schreiben verdoppelt nichts');
ok(/\[\[rms:policies=7\]\]/.test(xml2) && /\[\[rms:pm=freigegeben\|/.test(xml2) && /Bestellungen bis 5\.000 Euro\./.test(xml2), 'Regelwerk zuordnen lässt Angaben und Beschreibung stehen');
ok(p(`procPmAusXml(${JSON.stringify(xml2)}).kennzahlen[0].name`) === 'Durchlaufzeit', 'Aus dem XML gelesen: die Kennzahl');
ok(p(`procLinkEintrag(procEintragAusXml(${JSON.stringify(xml2)})).m.reifegrad`) === '4', 'Der Cache-Eintrag trägt den Reifegrad');
ok(p('_procIstDokuZeile("Kennzahlen: x") && _procIstDokuZeile("[[rms:kpi=a|||||]]") && !_procIstDokuZeile("Kennzahlen sind wichtig")'), 'Nur die geschriebenen Zeilen gelten als Marker, nicht die Beschreibung');
const chips = p(`_procPmChips({ itemId: 'M1', title: 'Bestellung', ordner: 'HOL' }).join(' ')`);
ok(chips.includes('Reifegrad 4 vorhersagbar') && chips.includes('📊 1 von 1 im Ziel'), 'Die Ansicht zeigt Reifegrad und Kennzahlen');

console.log(NL + `${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
