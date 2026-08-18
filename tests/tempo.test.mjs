/**
 * Tempo: Wie schnell die Daten da sind.
 *
 * Der Start kostete elf Anfragen nacheinander – und die Ermittlung von Site-,
 * Listen- und Spalten-IDs lief doppelt, weil Regelwerke und Bestätigungen
 * gleichzeitig geladen werden und beide spInit() aufriefen, bevor es fertig war.
 * Dokumentordner wurden einer nach dem anderen geholt, und jede geladene Seite
 * zeichnete die ganze Tabelle neu.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const sp = lies('js/sharepoint.js');
const app = lies('js/app.js');

/* ── 1) Ein Lauf für alle ── */
ok(/let _spInitLaeuft = null;/.test(sp), 'Es gibt einen gemeinsamen Init-Lauf');
ok(/if \(!_spInitLaeuft\) _spInitLaeuft = _spInitDurchfuehren\(\)/.test(sp),
  'Parallele Aufrufer teilen ihn sich, statt alles doppelt zu ermitteln');
ok(/\.finally\(\(\) => \{ _spInitLaeuft = null; \}\)/.test(sp), 'Nach einem Fehler darf neu versucht werden');

/* ── 2) Unabhängige Abfragen laufen gleichzeitig ── */
const init = sp.slice(sp.indexOf('async function _spInitDurchfuehren'), sp.indexOf('function _spSpaltenLaden'));
ok(/await Promise\.all\(\[\s*\n\s*_findListId\(token, SP\.policyList\),\s*\n\s*_findListId\(token, SP\.ackList\),/.test(init),
  'Beide Listen und die Bibliothek werden zusammen geholt');
ok(!/await _findListId\(token, SP\.policyList\);/.test(init), 'Nicht mehr eine nach der anderen');
ok(/_spSpaltenLaden\(token\);\n\}/.test(init) && !/await _spSpaltenLaden/.test(init),
  'Die Spaltenabfrage hält den Start nicht auf');
ok(/await Promise\.all\(\[\s*\n\s*holen\(_sp\.policyListId/.test(sp), 'Die beiden Spaltenabfragen laufen gemeinsam');
ok(/async function _spSpalten\(\)/.test(sp) && /await _spSpalten\(\);\s+\/\/ gesendet wird nur/.test(sp),
  'Wer schreibt, wartet vorher darauf – sonst gäbe es 400er');

/* ── 3) IDs überdauern, heilen sich aber ── */
const teil = sp.slice(sp.indexOf('const SP_ID_CACHE ='), sp.indexOf('let _spInitLaeuft'));
const speicher = {};
const ctx = {
  console,
  SP: { appSiteHost: 'dihag.sharepoint.com:/sites/RMS' },
  _sp: { appSiteId: 'S1', policyListId: 'L1', ackListId: 'L2', appDriveId: 'D1' },
  localStorage: {
    getItem: (k) => (k in speicher ? speicher[k] : null),
    setItem: (k, v) => { speicher[k] = String(v); },
    removeItem: (k) => { delete speicher[k]; },
  },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(teil, ctx);
const wert = (ausdruck) => vm.runInContext(ausdruck, ctx);

wert('_spCacheSchreiben()');
ok(wert('_spCacheLesen()').policyListId === 'L1', 'Die IDs überleben im Browser – der nächste Start spart sich die Suche');
wert("SP.appSiteHost = 'dihag.sharepoint.com:/sites/Andere'");
ok(wert('_spCacheLesen()') === null, 'Eine andere Site nutzt die alten IDs nicht');
wert("SP.appSiteHost = 'dihag.sharepoint.com:/sites/RMS'");
ok(wert('_spCacheLesen()') !== null, 'Für die eigene Site gelten sie weiter');
wert('const c = JSON.parse(localStorage.getItem(SP_ID_CACHE)); c.zeit = Date.now() - SP_ID_CACHE_TTL - 1; localStorage.setItem(SP_ID_CACHE, JSON.stringify(c));');
ok(wert('_spCacheLesen()') === null, 'Nach einer Woche werden sie neu ermittelt');
wert('_spCacheSchreiben(); spInvalidateInit()');
ok(wert('_spCacheLesen()') === null && wert('_sp.ready') === false, 'Und lassen sich verwerfen');

ok(/_spNeuErmitteln\(e, \(\) => spGetPolicies\(true\)\)/.test(sp),
  'Passen die gespeicherten IDs nicht mehr, wird einmal neu ermittelt (Regelwerke)');
ok(/_spNeuErmitteln\(e, \(\) => spGetAcknowledgements\(filterUpn, true\)\)/.test(sp), 'Ebenso bei den Bestätigungen');
ok(/if \(_zweiterVersuch\) throw e;/.test(sp), 'Aber nur einmal – keine Endlosschleife');

/* ── 4) Ordner gleichzeitig einsammeln ── */
const helfer = sp.slice(sp.indexOf('async function _parallel'), sp.indexOf('/** Alle Seiten einer Graph-Collection'));
const ctx2 = { console, setTimeout, Promise, Array, Math };
ctx2.globalThis = ctx2;
vm.createContext(ctx2);
vm.runInContext(helfer, ctx2);
vm.runInContext(`
  globalThis.__lauf = (async () => {
    let offen = 0, hoechstens = 0; const fertig = [];
    const aufgaben = Array.from({ length: 9 }, (_, i) => async () => {
      offen++; hoechstens = Math.max(hoechstens, offen);
      await new Promise(r => setTimeout(r, 5));
      fertig.push(i); offen--;
    });
    await _parallel(aufgaben, 4);
    return { hoechstens, anzahl: fertig.length };
  })();
`, ctx2);
const erg = await ctx2.__lauf;
ok(erg.anzahl === 9, 'Alle Ordner werden abgearbeitet');
ok(erg.hoechstens === 4, `Höchstens vier gleichzeitig (waren ${erg.hoechstens}) – mehr quittiert Graph mit 429`);

const fn = sp.slice(sp.indexOf('Dokumente des Managementsystems laden'), sp.indexOf('async function spGetIsmsItemFields'));
ok(/_parallel\(ordner\.map/.test(fn), 'Die Normen-Ordner laufen gleichzeitig');
ok(/out\.sort\(\(a, b\) => \(a\.folder/.test(fn), 'Das Ergebnis bekommt trotzdem eine feste Reihenfolge');
ok(/_parallel\(subfolders\.map/.test(sp), 'Unterordner ebenso');
ok((sp.match(/_parallel\(subfolders\.map/g) || []).length === 2, 'In beiden Bibliotheken (IMS und Governance)');

/* ── 5) Zwischenstände gebündelt zeichnen ── */
for (const [datei, fnName] of [['js/ismsdocs.js', 'renderIsmsDocs'], ['js/governance.js', 'renderGovernanceDocs']]) {
  const q = lies(datei);
  ok(/zeichnenGeplant = setTimeout\(/.test(q) && new RegExp(`zeichnenGeplant = 0; ${fnName}\\(\\)`).test(q),
    `${datei}: nicht jede geladene Seite zeichnet die ganze Tabelle neu`);
  ok(/if \(zeichnenGeplant\) clearTimeout\(zeichnenGeplant\);/.test(q), `${datei}: am Ende zählt der volle Stand`);
}

/* ── 6) Beim Start läuft das Laden neben der Konfiguration ── */
ok(/const daten = reloadData\(\{ rendern: false \}\)\.catch/.test(app),
  'Die Daten laufen los, während Konfiguration und Rollen ermittelt werden');
const boot = app.slice(app.indexOf('async function bootApp'), app.indexOf('/** Startansicht'));
ok(boot.indexOf('const daten = reloadData') < boot.indexOf('await loadRuntimeAccessConfig'),
  'Und zwar vorher, nicht danach');
ok(boot.indexOf('await daten;') > boot.indexOf('initRoleNav()'), 'Vor dem Rendern wird gewartet');
ok(/if \(rendern\) renderMeine\(\);/.test(app), 'Vorab-Laden zeichnet noch nichts (die Rollen fehlen da noch)');
ok(/let _meineAbteilung = null;/.test(sp), 'Die eigene Abteilung wird nur einmal je Sitzung geholt');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
