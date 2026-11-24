/**
 * Sammelfeld `DatenJson`: bündelt alle Erweiterungsfelder in EINER SharePoint-Spalte.
 * Geprüft werden Lesen (mit Vorrang vor Altspalten), Schreiben, Rückwärtskompatibilität
 * mit vorhandenen Einzelspalten und die Fehlende-Spalten-Meldung.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const ctx = { console, JSON, fetch: () => {}, location: { origin: '', pathname: '' } };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/sharepoint.js', 'utf8'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/** Spaltenlage der Liste setzen (welche Spalten es gibt). */
const setColumns = (namen) => run(
  `_sp.policyColumns = ${JSON.stringify(namen.map(n => ({ name: n, displayName: n })))};` +
  `_sp.policyFields = new Set(${JSON.stringify(namen)});`);

const map = (fields) => { run(`globalThis.__m = _mapPolicy(${JSON.stringify({ id: '1', fields })});`); return ctx.__m; };

/* ── 1) Neuer Zustand: nur DatenJson vorhanden ── */
setColumns(['Title', 'DatenJson']);
let m = map({
  Title: 'Test',
  DatenJson: JSON.stringify({
    typ: 'Konzept', regelwerkTyp: 'Handbuch', geltungsbereich: ['HOL', 'SHB'],
    historie: [{ aktion: 'Angelegt', name: 'Anna' }], konzept: { prioritaet: 'hoch' },
  }),
});
ok(m.typ === 'Konzept', 'DatenJson: Typ gelesen');
ok(m.regelwerkTyp === 'Handbuch', 'DatenJson: Dokumentart gelesen');
ok(JSON.stringify(m.geltungsbereich) === JSON.stringify(['HOL', 'SHB']), 'DatenJson: Geltungsbereich gelesen');
ok(m.historie.length === 1 && m.historie[0].name === 'Anna', 'DatenJson: Historie gelesen');
ok(m.konzept && m.konzept.prioritaet === 'hoch', 'DatenJson: Konzept gelesen');

/* ── 2) Altbestand: nur Einzelspalten (noch kein DatenJson geschrieben) ── */
setColumns(['Title', 'Typ2', 'RegelwerkTyp', 'GeltungsbereichJson', 'HistorieJson', 'KonzeptJson']);
m = map({
  Title: 'Alt', Typ2: 'Konzept', RegelwerkTyp: 'Leitfaden',
  GeltungsbereichJson: JSON.stringify(['EIS']),
  HistorieJson: JSON.stringify([{ aktion: 'Bearbeitet' }]),
  KonzeptJson: JSON.stringify({ prioritaet: 'mittel' }),
});
ok(m.typ === 'Konzept' && m.regelwerkTyp === 'Leitfaden', 'Altbestand: Typ + Dokumentart aus Einzelspalten');
ok(JSON.stringify(m.geltungsbereich) === JSON.stringify(['EIS']), 'Altbestand: Geltungsbereich aus Einzelspalte');
ok(m.historie.length === 1 && m.konzept.prioritaet === 'mittel', 'Altbestand: Historie + Konzept aus Einzelspalten');

/* ── 3) Beides vorhanden → DatenJson gewinnt (aktueller Stand) ── */
setColumns(['Title', 'DatenJson', 'RegelwerkTyp', 'GeltungsbereichJson']);
m = map({
  Title: 'Misch', RegelwerkTyp: 'Handbuch', GeltungsbereichJson: JSON.stringify(['HOL']),
  DatenJson: JSON.stringify({ regelwerkTyp: 'Konzernrichtlinie', geltungsbereich: ['ALLE'] }),
});
ok(m.regelwerkTyp === 'Konzernrichtlinie', 'Vorrang: DatenJson schlägt Einzelspalte');
ok(JSON.stringify(m.geltungsbereich) === JSON.stringify(['ALLE']), 'Vorrang: auch bei Arrays');

/* ── 4) Robust gegen kaputte/fehlende Daten ── */
setColumns(['Title', 'DatenJson']);
m = map({ Title: 'X', DatenJson: '{kaputt' });
ok(m.typ === 'Regelwerk' && m.regelwerkTyp === '' && m.geltungsbereich.length === 0 && m.historie.length === 0 && m.konzept === null,
  'Kaputtes DatenJson → saubere Standardwerte');
m = map({ Title: 'Y' });
ok(m.typ === 'Regelwerk' && Array.isArray(m.geltungsbereich) && Array.isArray(m.historie), 'Ohne Daten → leere Standardwerte');
m = map({ Title: 'Z', DatenJson: JSON.stringify({ geltungsbereich: 'kaputt', historie: 42, konzept: [1, 2], regelwerkTyp: 7 }) });
ok(Array.isArray(m.geltungsbereich) && Array.isArray(m.historie) && m.konzept === null && m.regelwerkTyp === '',
  'Falsche Datentypen werden normalisiert');

/* ── 5) Schreiben: Sammelfeld wird aufgebaut ── */
run(`globalThis.__d = _buildDatenJson({
  typ: 'Konzept', regelwerkTyp: 'Handbuch', geltungsbereich: ['SHB'],
  historie: [{ aktion: 'A' }], konzept: { prioritaet: 'hoch' } });`);
const d = ctx.__d;
ok(d.typ === 'Konzept' && d.regelwerkTyp === 'Handbuch', 'Schreiben: Typ + Dokumentart im Sammelfeld');
ok(JSON.stringify(d.geltungsbereich) === JSON.stringify(['SHB']) && d.historie.length === 1 && d.konzept.prioritaet === 'hoch',
  'Schreiben: Arrays/Objekte im Sammelfeld');
run(`globalThis.__d2 = _buildDatenJson({});`);
ok(ctx.__d2.typ === 'Regelwerk' && ctx.__d2.regelwerkTyp === '' && Array.isArray(ctx.__d2.geltungsbereich) && ctx.__d2.konzept === null,
  'Schreiben: Standardwerte bei leerem Regelwerk');
run(`globalThis.__d3 = _buildDatenJson({ historie: Array.from({length:250},(_,i)=>({i})) });`);
ok(ctx.__d3.historie.length === 200, 'Schreiben: Historie im Sammelfeld ebenfalls gekappt');

/* ── 6) Rundlauf: schreiben → lesen ergibt dasselbe ── */
run(`
  const orig = { typ:'Konzept', regelwerkTyp:'Arbeits-/Prozessanweisung', geltungsbereich:['LEG','MEG'],
                 historie:[{aktion:'Angelegt',name:'Anna'}], konzept:{ prioritaet:'niedrig', motivation:'M' } };
  globalThis.__rt = _readExtFields({ DatenJson: JSON.stringify(_buildDatenJson(orig)) });
`);
const rt = ctx.__rt;
ok(rt.typ === 'Konzept' && rt.regelwerkTyp === 'Arbeits-/Prozessanweisung'
  && JSON.stringify(rt.geltungsbereich) === JSON.stringify(['LEG', 'MEG'])
  && rt.historie[0].name === 'Anna' && rt.konzept.motivation === 'M', 'Rundlauf schreiben→lesen verlustfrei');

/* ── 7) Fehlende-Spalten-Meldung ── */
setColumns(['Title', 'DatenJson']);
run('globalThis.__miss1 = spMissingPolicyColumns().map(c => c.name);');
ok(!ctx.__miss1.some(n => ['Typ2', 'RegelwerkTyp', 'GeltungsbereichJson', 'HistorieJson', 'KonzeptJson'].includes(n)),
  'Mit DatenJson werden die Altspalten nicht mehr angemahnt');
ok(!ctx.__miss1.includes('DatenJson'), 'DatenJson selbst gilt als vorhanden');

setColumns(['Title']);
run('globalThis.__miss2 = spMissingPolicyColumns().map(c => c.name);');
ok(ctx.__miss2.includes('DatenJson'), 'Ohne DatenJson wird es angemahnt');
ok(ctx.__miss2.includes('RegelwerkTyp') && ctx.__miss2.includes('HistorieJson'),
  'Ohne DatenJson werden die Einzelspalten weiterhin angemahnt');

/* ── 8) Statische Absicherung ── */
const shp = fs.readFileSync(ROOT + '/js/sharepoint.js', 'utf8');
ok(/DatenJson:\s*JSON\.stringify\(_buildDatenJson\(p\)\)/.test(shp), 'spSavePolicy schreibt das Sammelfeld');
ok(shp.includes("{ name: 'DatenJson',"), 'DatenJson ist Pflichtspalte');
ok(/const POLICY_EXT_FIELDS = \[/.test(shp), 'Erweiterungsfelder zentral definiert');

/* ── 9) Kein Erweiterungsfeld darf beim Abbilden verloren gehen ──
   Genau das war passiert: `_mapPolicy` zählte fünf Felder namentlich auf, während
   `_readExtFields` alle sieben lieferte. videos, aktionToken und bekanntgabeAm
   wurden gelesen und im selben Atemzug weggeworfen – ohne Fehler, ohne Spur.
   Sichtbar wurde es als „kein Lernvideo" und „dieser Link ist nicht mehr aktuell".
   Deshalb hier datengetrieben: Ein neues Erweiterungsfeld ist automatisch mitgeprüft. */
run('globalThis.__felder = POLICY_EXT_FIELDS.map(d => d.feld);');
const beispiel = {
  regelwerkTyp: 'Policy', geltungsbereich: ['HOL'], historie: [{ aktion: 'A' }],
  konzept: { prioritaet: 'hoch' }, videos: [{ titel: 'V', url: 'https://x.de/v' }],
  aktionToken: { wert: 'abc', art: 'freigabe', erstelltAm: '2026-08-21T09:00:00.000Z' },
  bekanntgabeAm: '2026-08-21T10:00:00.000Z',
};
setColumns(['Title', 'DatenJson']);
run(`globalThis.__voll = _mapPolicy({ id: '1', fields: { Title: 'V',
  DatenJson: JSON.stringify(_buildDatenJson(${JSON.stringify(beispiel)})) } });`);
const voll = ctx.__voll;
const fehlend = ctx.__felder.filter(f => voll[f] === undefined);
ok(!fehlend.length, `Alle ${ctx.__felder.length} Erweiterungsfelder kommen beim Laden an`
  + (fehlend.length ? ' – fehlt: ' + fehlend.join(', ') : ''));
ok(voll.videos.length === 1 && voll.videos[0].url === 'https://x.de/v',
  'Lernvideos überstehen den Rundlauf – sonst zeigt die Detailseite nie ein Video');
ok(voll.aktionToken && voll.aktionToken.wert === 'abc' && voll.aktionToken.art === 'freigabe',
  'Das Einmal-Token ebenso – sonst ist jeder Ein-Klick-Link „nicht mehr aktuell"');
ok(voll.bekanntgabeAm === '2026-08-21T10:00:00.000Z', 'Und der Vermerk der Bekanntgabe');
ok(/\.\.\.ext,/.test(shp), '_mapPolicy übernimmt sie als Ganzes statt namentlich');

/* ── 10) Ein unlesbares Sammelfeld meldet sich ──
   Wird die Spalte als „Einzelne Textzeile" angelegt, schneidet SharePoint bei 255
   Zeichen ab. Alles wirkt normal, nur die Felder ohne eigene Spalte fehlen. */
run('_datenJsonDefekt = 0;');
map({ Title: 'A', DatenJson: '{"videos":[{"titel":"lang' });
ok(run('spDatenJsonDefekt()') === 1, 'Abgeschnittenes Sammelfeld wird gezählt');
map({ Title: 'B' });
map({ Title: 'C', DatenJson: '' });
ok(run('spDatenJsonDefekt()') === 1, 'Ein leeres Feld ist kein Defekt – da stand nie etwas');
map({ Title: 'D', DatenJson: '{"videos":[]}' });
ok(run('spDatenJsonDefekt()') === 1, 'Lesbares Feld zählt nicht mit');
const adm = fs.readFileSync(ROOT + '/js/admin.js', 'utf8');
ok(/spDatenJsonDefekt\(\)/.test(adm) && /Einzelne Textzeile/.test(adm),
  'Das Dashboard sagt es dem Administrator, statt still Felder zu verlieren');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
