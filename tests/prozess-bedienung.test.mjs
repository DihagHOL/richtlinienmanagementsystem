/**
 * Prozesse einfach bearbeiten: der nächste Schritt zum Anklicken, die
 * Erklärung im Brett und der Kurs im Wissen.
 *
 * Wer einen Prozess bearbeitet, soll nicht wissen müssen, in welchem Dialog
 * ein Feld steht. Worauf es ankommt:
 *   • Jeder fehlende Punkt an der Karte (pzKriterien → schritte) nennt sein
 *     Ziel: ein Feld in ✎ Angaben, im Prozess-Editor oder an der Kachel, die
 *     Freigabe oder den Vergleich. Jedes Ziel hat ein Feld, das es gibt.
 *   • Der Link öffnet genau diese Stelle und hebt das Feld hervor. Bei einem
 *     IST, das noch läuft, öffnen sich die Angaben des IST, nicht des SOLL.
 *   • Im SOLL-Design gehört der Vergleich mit dem IST zu den Kriterien, sobald
 *     ein IST abgelöst wird.
 *   • Jede Spalte sagt in einem Satz, was zu tun ist; oben steht eine
 *     Anleitung in fünf Schritten, im Vergleich eine in drei.
 *   • Der Kurs „Prozesse im RMS bearbeiten" besteht die Prüfung des Wissens,
 *     das Backlog verlinkt ihn, und seine Begriffe sind die der Oberfläche.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { jsArg } = require('../js/util.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split(String.fromCharCode(13)).join('');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STRICH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');

const M = require('../js/prozessmodell.js');
const W = require('../js/wissenmodell.js');
const HEUTE = new Date(2026, 9, 20);

/* ══ 1) Die Kriterien nennen ihr Ziel ══ */
console.log('Kriterien mit Ziel');
const ziele = (k, extra) => M.pzKriterien(k, extra, HEUTE).schritte.map(s => s.ziel + (s.id ? '@' + s.id : '')).join(',');
const leer = { eigner: {}, pruefung: {} };
ok(ziele(Object.assign({ status: 'identifiziert', art: 'kachel' }, leer)) === 'eigner,prio', 'Identifiziert: Prozesseigner und Priorität');
ok(ziele(Object.assign({ status: 'aufnahme', art: 'kachel' }, leer)) === 'modell', 'IST-Aufnahme ohne Modell: das Modell an der Kachel');
ok(ziele(Object.assign({ status: 'analyse', art: 'modell' }, leer)) === 'analyse', 'Analyse: das Datum des Abschlusses');
const sollMitIst = Object.assign({ status: 'soll', art: 'modell', istModelle: [{ kachel: { id: 'IST1' }, status: 'eol' }], vergleich: [] }, leer);
ok(ziele(sollMitIst, {}) === 'regelwerk,freigeber,vergleich', 'SOLL-Design: Richtlinie, Freigeber und, weil ein IST abgelöst wird, der Vergleich');
ok(ziele(Object.assign({}, sollMitIst, { vergleich: [{ art: 'bleibt', ist: ['IST1:a'], soll: ['S:a'] }] }), { regelwerke: 1, freigabe: 'Entwurf' }) === '',
  'Mit Vergleich, Richtlinie und Regelwerk der Freigabe ist das SOLL-Design fertig');
ok(!/vergleich/.test(ziele(Object.assign({ status: 'soll', art: 'modell', istModelle: [] }, leer), {})), 'Ohne IST kein Vergleich als Kriterium');
const poc = M.pzKriterien(Object.assign({ status: 'poc', art: 'modell', poc: { werke: [], kriterien: [] } }, { eigner: {}, pruefung: { datum: '' } }), {}, HEUTE);
ok(poc.schritte.map(s => s.ziel).join() === 'pocWerke,pocKriterien,termin,pocErgebnis' && poc.fehlt.join('|') === poc.schritte.map(s => s.text).join('|'),
  'POC: Pilotwerk, Kriterien, Termin, Ergebnis; „fehlt" bleibt die Liste der Texte');
const rollout = M.pzKriterien({ status: 'freigegeben', art: 'modell', eigner: {}, pruefung: {}, kennzahlen: { liste: [] }, reifegrad: {},
  istModelle: [{ kachel: { id: 'IST-A' }, status: 'eol', abgeloestAm: '2026-09-01' }, { kachel: { id: 'IST-B' }, status: 'eol' }] }, {}, HEUTE);
ok(rollout.schritte.map(s => s.ziel + (s.id ? '@' + s.id : '')).join() === 'freigabe,kennzahl,reifegrad,abgeloest@IST-B',
  'Rollout: Freigabe, Kennzahl, Reifegrad und das IST, das noch läuft (nicht das schon abgelöste)');
ok(rollout.schritte[3].text === '1 IST noch in Benutzung', '… mit der Zahl der IST in Benutzung');
const betrieb = M.pzKriterien({ status: 'ausgerollt', art: 'modell', eigner: {}, standard: { key: 'einheitlich' }, kennzahlen: { liste: [{ name: 'x' }] },
  reifegrad: { key: '2' }, pruefung: { stufe: 'ueberfaellig' } }, {}, HEUTE);
ok(betrieb.schritte.map(s => s.ziel).join() === 'reifegrad,termin' && betrieb.naechste === '', 'Betrieb: Reifegrad unter 3 und überfälliger Review');

const alleZiele = Object.keys(M.PZ_SCHRITT_ZIELE);
const genutzt = new Set(['eigner', 'prio', 'modell', 'analyse', 'regelwerk', 'freigeber', 'vergleich', 'pocWerke', 'pocKriterien', 'termin', 'pocErgebnis', 'freigabe', 'kennzahl', 'reifegrad', 'abgeloest', 'nachfolger']);
ok(alleZiele.length === genutzt.size && alleZiele.every(z => genutzt.has(z)), 'Jedes Ziel, das die Kriterien nennen, ist beschrieben');
ok(alleZiele.every(z => ['angaben', 'editor', 'kachel', 'freigabe', 'vergleich'].includes(M.PZ_SCHRITT_ZIELE[z].wo) && M.PZ_SCHRITT_ZIELE[z].feld),
  '… mit Ort und Feldname für den Tooltip');

/* ══ 2) Jedes Ziel hat ein Feld, das es gibt ══ */
console.log('Felder');
const bl = lies('js/prozessbacklog.js'), pz = lies('js/prozesse.js'), lk = lies('js/landkarte.js');
const bctx = { console, Map, Set, Array, Object, String, JSON, Math, Date, Number, RegExp, esc, jsArg,
  setTimeout: (f) => f(), document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem() {} } };
bctx.window = bctx; bctx.globalThis = bctx;
vm.createContext(bctx);
vm.runInContext(lies('js/prozessmodell.js'), bctx);
vm.runInContext(bl, bctx);
const FELD = vm.runInContext('PB_SCHRITT_FELD', bctx), KFELD = vm.runInContext('PB_SCHRITT_KACHELFELD', bctx);
const mitFeld = alleZiele.filter(z => ['angaben', 'editor'].includes(M.PZ_SCHRITT_ZIELE[z].wo));
ok(mitFeld.every(z => FELD[z]), 'Jedes Ziel in ✎ Angaben und im Editor hat eine Feld-Kennung');
ok(mitFeld.filter(z => M.PZ_SCHRITT_ZIELE[z].wo === 'angaben').every(z => bl.includes(`id="${FELD[z]}"`)), '… die es im Dialog ✎ Angaben gibt');
ok(mitFeld.filter(z => M.PZ_SCHRITT_ZIELE[z].wo === 'editor').every(z => pz.includes(`id="${FELD[z]}"`)), '… und im Prozess-Editor');
ok(Object.values(KFELD).every(id => lk.includes(`id="${id}"`)), 'Die Felder an der Kachel gibt es im Kachel-Editor');

/* ══ 3) Der Link führt dorthin ══ */
console.log('Nächster Schritt anklicken');
const aufrufe = [];
Object.assign(bctx, {
  pbAngabenDialog: (id, st) => aufrufe.push(`angaben:${id}${st ? ':' + st : ''}`),
  openProcessEditor: (id) => aufrufe.push(`editor:${id}`),
  pfFreigabeStarten: (id) => aufrufe.push(`freigabe:${id}`),
  pvOeffnen: (id, von) => aufrufe.push(`vergleich:${id}:${von}`),
  lkKachelBearbeiten: (id) => aufrufe.push(`kachel-editor:${id}`),
  setProzessModus: () => {}, lkSpringeZu: (w, id) => aufrufe.push(`landkarte:${w}:${id}`),
  openProcessAnsicht: (id) => aufrufe.push(`ansicht:${id}`),
});
const gezeigt = [];
vm.runInContext('pbFeldZeigen = (id) => __gezeigt.push(id); pbKriteriumNeu = () => __gezeigt.push("+krit")', Object.assign(bctx, { __gezeigt: gezeigt }));
const klick = (...a) => { aufrufe.length = 0; gezeigt.length = 0; vm.runInContext('pbSchrittOeffnen', bctx)(...a); return aufrufe.join(' ') + ' | ' + gezeigt.join(' '); };
ok(klick('modell', 'HOL', 'SOLL1', 'freigeber', '') === 'angaben:SOLL1 | pb-a-freigeber', 'Freigeber: ✎ Angaben des Prozesses, Feld „Freigabe durch"');
ok(klick('modell', 'HOL', 'SOLL1', 'pocKriterien', '') === 'angaben:SOLL1 | +krit pb-a-poc-krit', 'Erfolgskriterien: Angaben, gleich mit einer leeren Zeile');
ok(klick('modell', 'HOL', 'SOLL1', 'abgeloest', 'IST-B') === 'angaben:IST-B | pb-a-abgeloest', 'IST in Benutzung: die Angaben des IST, Feld „Außer Betrieb seit"');
ok(klick('modell', 'HOL', 'IST9', 'nachfolger', '') === 'angaben:IST9:eol | pb-a-nachfolger', 'Loses IST: Angaben als EOL, Feld „Abgelöst durch"');
ok(klick('modell', 'HOL', 'SOLL1', 'reifegrad', '') === 'editor:SOLL1 | proc-pm-rg', 'Reifegrad: Prozess-Editor, Feld Reifegrad');
ok(klick('modell', 'HOL', 'SOLL1', 'regelwerk', '') === 'editor:SOLL1 | proc-policy-list', 'Richtlinie: Prozess-Editor, „Verknüpfte Richtlinien"');
ok(klick('modell', 'HOL', 'SOLL1', 'freigabe', '') === 'freigabe:SOLL1 | ', 'Regelwerk der Freigabe: die Freigabe');
ok(klick('modell', 'HOL', 'SOLL1', 'vergleich', '') === 'vergleich:SOLL1:backlog | ', 'Vergleich: der Vergleich IST/SOLL, zurück ins Backlog');
ok(klick('kachel', 'HOL', 'h-it', 'eigner', '') === 'landkarte:HOL:h-it kachel-editor:h-it | lk-pz-eigner', 'Kachel: Landkarte, Kachel-Editor, Feld Prozesseigner');
ok(klick('kachel', 'HOL', 'h-it', 'modell', '') === 'landkarte:HOL:h-it | ', 'Kachel ohne Modell: nur die Kachel in der Landkarte');
ok(/const zeigen = \(feld\) => setTimeout\(\(\) => pbFeldZeigen\(feld\), 80\);/.test(bl) && /setTimeout\(\(\) => \{\s+const f = _modalFocusables\(\)[\s\S]{0,120}\}, 30\);/.test(lies('js/app.js')),
  'Das Feld wird erst gezeigt, nachdem der Dialog seinen eigenen Fokus gesetzt hat (30 ms), sonst springt er nach oben');

console.log('Feld hervorheben');
const klassen = new Set(); let fokus = 0, gescrollt = 0;
const feld = { tagName: 'INPUT', focus: () => { fokus++; }, closest: () => gruppe };
const gruppe = { querySelectorAll: () => [feld], scrollIntoView: () => { gescrollt++; }, classList: { add: (c) => klassen.add(c), remove: (c) => klassen.delete(c) } };
const fctx = { console, setTimeout: () => {}, document: { getElementById: (id) => (id === 'pb-a-eigner' ? feld : null) } };
vm.createContext(fctx);
vm.runInContext(bl.slice(bl.indexOf('function pbFeldZeigen'), bl.indexOf('/* ── Angaben am Modell')), fctx);
vm.runInContext('pbFeldZeigen("pb-a-eigner")', fctx);
ok(klassen.has('pb-hervor') && fokus === 1 && gescrollt === 1, 'Das Feld steht im Blick, ist hervorgehoben und hat den Fokus (mit seiner Beschriftung)');
let versuche = 0;
fctx.setTimeout = () => { versuche++; };
vm.runInContext('pbFeldZeigen("proc-pm-rg")', fctx);
ok(versuche === 1, 'Gibt es das Feld noch nicht (der Editor lädt), wird es erneut versucht');

console.log('Darstellung an der Karte');
const karte = { art: 'modell', werk: 'HOL', status: 'soll', kachel: { id: 'SOLL1', name: 'E-Rechnung' }, eigner: {}, pruefung: {},
  istModelle: [{ kachel: { id: 'IST1' }, status: 'eol' }], vergleich: [], regelwerke: 0 };
const schritt = vm.runInContext('_pbSchrittHtml', bctx);
const mitRecht = schritt(karte, true), ohneRecht = schritt(karte, false);
ok((mitRecht.match(/class="pb-schritt-link"/g) || []).length === 3 && /title="Öffnet den Vergleich IST\/SOLL"/.test(mitRecht)
  && /title="Öffnet den Prozess-Editor beim Feld „Verknüpfte Richtlinien&quot;"/.test(mitRecht), 'Mit Schreibrecht: jeder Punkt ein Link mit Tooltip, wohin er führt');
ok(!/<a /.test(ohneRecht) && /fehlt: Regelwerk, Freigeber, Vergleich mit dem IST<\/div>/.test(ohneRecht), 'Nur lesen: die Punkte als Text');
const fertig = schritt(Object.assign({}, karte, { status: 'analyse', analyseAm: '2026-10-01' }), true);
ok(/✓ bereit für „SOLL-Design": Phase unten umstellen/.test(fertig), 'Fertig: „bereit", mit dem Hinweis, wo die Phase umgestellt wird');

/* ══ 4) Erklärung im Brett ══ */
console.log('Erklärung im Brett');
ok(M.PZ_STATUS.every(s => s.tun && s.tun.length < 120 && !STRICH.test(s.tun)) && M.PZ_SPALTEN.every(s => s.tun),
  'Jede Phase und jede Spalte sagt in einem kurzen Satz, was zu tun ist (ohne Gedankenstrich)');
const spalte = vm.runInContext('_pbSpalteHtml', bctx)(M.PZ_SPALTEN.find(s => s.key === 'umsetzung'), [], false, 0);
ok(spalte.includes('<div class="pb-spalte-tun">Im POC erproben, dann freigeben und in die Werke ausrollen.</div>'), 'Der Satz steht unter dem Spaltenkopf');
const hilfe = vm.runInContext('_pbHilfeHtml()', bctx);
const kursId = vm.runInContext('PB_KURS_ID', bctx);
ok(/<details class="pb-hilfe" open ontoggle="pbHilfeMerken\(this\.open\)">/.test(hilfe) && (hilfe.match(/<li>/g) || []).length === 5,
  '„So arbeiten Sie mit dem Backlog": fünf Schritte, beim ersten Besuch aufgeklappt');
ok(hilfe.includes(`href="?ansicht=wissen&amp;beitrag=${kursId}" target="_blank"`) && /Hintergrund und Begriffe/.test(hilfe) && /Dumas/.test(hilfe),
  'Mit Link auf den Kurs und dem fachlichen Hintergrund zum Aufklappen');
bctx.localStorage = { getItem: (k) => (k === 'rms.pbHilfeZu' ? '1' : null), setItem() {} };
ok(/<details class="pb-hilfe" ontoggle/.test(vm.runInContext('_pbHilfeHtml()', bctx)), 'Wer sie zugeklappt hat, sieht sie zugeklappt');
bctx.localStorage = { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); } };
ok(/ open /.test(vm.runInContext('_pbHilfeHtml()', bctx)) && (vm.runInContext('pbHilfeMerken(false)', bctx), true), 'Ohne Browser-Speicher: aufgeklappt, und Merken wirft nicht');
ok(!STRICH.test(hilfe.replace(/<details class="pb-hilfe-hintergrund">[\s\S]*$/, '')), 'Die Anleitung kommt ohne Gedankenstrich aus');

const pv = lies('js/prozessvergleich.js');
const anleitung = pv.slice(pv.indexOf('function _pvAnleitungHtml'), pv.indexOf('function _pvOptionen'));
ok((anleitung.match(/<li>/g) || []).length === 3 && /\$\{darf \? _pvAnleitungHtml\(\) : ''\}/.test(pv) && !STRICH.test(anleitung),
  'Im Vergleich: Anleitung in drei Schritten für alle, die zuordnen dürfen');
ok(/💡 Vorschläge übernehmen/.test(anleitung) && /\+ Zuordnung/.test(pv) && /Vorschläge übernehmen<\/button>/.test(pv), '… mit den Namen der Knöpfe, wie sie dort stehen');

/* ══ 5) Der Kurs ══ */
console.log('Kurs im Wissen');
const K = W.wiNormalisieren({ beitraege: [W.WI_KURS_PROZESSE_RMS] }).beitraege[0];
ok(K && K.id === kursId && W.wiBeitragFehler(K).length === 0, 'Der Kurs besteht die Prüfung des Wissens, das Backlog verlinkt seine Kennung');
ok(K.art === 'kurs' && K.thema === 'prozesse' && K.dauer === 10 && K.pflicht === false && K.module.length === 6, 'Freiwillig, etwa zehn Minuten, sechs Module');
ok(K.fragen.length === 8 && K.fragen.every(f => f.optionen.length === 3 && f.richtig >= 0 && f.richtig < 3)
  && new Set(K.fragen.map(f => f.richtig)).size === 3, 'Acht Fragen mit je drei Antworten, die richtige nicht immer an derselben Stelle');
ok(W.WI_STARTBESTAND.beitraege.map(b => b.id).slice(0, 3).join() === 'start-phishing-kurs,start-bpmn-kurs,start-prozesse-rms-kurs', 'Er steht nach den beiden anderen Schulungen im Startbestand');
const kurs = [K.kurz, K.intro, ...K.ziele, ...K.module.map(m => m.titel + ' ' + m.text), ...K.fragen.map(f => f.frage + ' ' + f.optionen.join(' '))].join('\n');
ok(!STRICH.test(kurs), 'Kein Gedankenstrich im Kurs');
const oberflaeche = [bl, pz, lk, pv, lies('js/prozessmodell.js')].join('\n');
const begriffe = ['📌 Backlog', '✎ Angaben', '✓ bereit für', '⇄ Vergleich IST/SOLL', '💡', 'Vorschläge übernehmen', '+ Zuordnung', '🖼 PNG', '📋 Zur Freigabe',
  'Verknüpfte Richtlinien', 'Außer Betrieb seit', 'Abgelöst durch', 'Analyse abgeschlossen am', 'Pilotwerk', 'Erfolgskriterien',
  'IST-Modell eines anderen Prozesses (EOL)', 'So arbeiten Sie mit dem Backlog'];
const fehlen = begriffe.filter(b => !kurs.includes(b) && !kurs.includes(b.replace(/^\S+ /, '')) || !oberflaeche.includes(b));
ok(fehlen.length === 0, 'Die Begriffe des Kurses sind die der Oberfläche' + (fehlen.length ? ' (fehlt: ' + fehlen.join(' | ') + ')' : ''));
ok(M.PZ_SPALTEN.every(s => kurs.includes(s.label)),
  'Der Kurs nennt alle sechs Spalten');
ok(['Prozesseigner und Priorität', 'IST-Modell', 'Analyse abgeschlossen am', 'Vergleich mit dem IST', 'Pilotwerk und Erfolgskriterien', 'Termin der Bewertung',
  'Regelwerk der Freigabe ist veröffentlicht', 'Reifegrad 3', 'Review-Termin'].every(t => kurs.includes(t)),
  'Er nennt die Kriterien je Phase so, wie das Backlog sie prüft');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
