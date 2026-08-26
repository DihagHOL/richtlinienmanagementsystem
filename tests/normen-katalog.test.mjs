/**
 * Normen-Katalog und die Erklärung zur Anwendbarkeit.
 *
 * Der Katalog begann als ISMS-Katalog (ISO 27001 + NIS2). Das Konzernregelwerk
 * umfasst aber sieben Kategorien – Datenschutz, KI, Lieferkette, Arbeitsschutz,
 * Umwelt, Recht, IKS hatten nichts, worauf sie hätten zeigen können. Zwei
 * Dinge dürfen dabei nicht verrutschen:
 *
 *   • Die ISO-Quoten müssen ISO-Quoten bleiben. Wer nach dem Gruppennamen
 *     filtert, zählt seit der Erweiterung „NIS2-Umsetzung Deutschland" beim
 *     Filter /NIS2/ mit – und die Kachel zeigt still eine andere Zahl.
 *   • Die SoA entscheidet über die 93 Annex-A-Controls. Eine Klausel, ein
 *     Gesetz oder eine Verordnung ist nicht „nicht anwendbar" – sie gilt.
 *     Vorher rechnete die Kennzahl über alle Einträge.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const N = require(ROOT + '/js/normen.js');
const { NORMEN, NORMEN_IDS, NORM_ISMS_ARTEN, normArtVon, normIdsMitArt, normEntscheidbar,
        normGroupOf, normLabel, NORMBEZUG_SEED } = N;

/* ══════════════════════════════════════════════════════════════════
   Teil 1 – der Katalog
   ══════════════════════════════════════════════════════════════════ */

const alle = NORMEN.flatMap(g => g.items.map(i => i.id));
ok(alle.length === 215, `215 Anforderungen im Katalog (ist ${alle.length})`);
ok(NORMEN.length === 15, `15 Gruppen (ist ${NORMEN.length})`);
ok(NORMEN_IDS.size === alle.length, 'Alle Kennungen sind eindeutig – sonst überschriebe eine die andere');
ok(NORMEN.every(g => typeof g.art === 'string' && g.art), 'Jede Gruppe trägt eine art');
ok(NORMEN.every(g => g.items.every(i => i.id && i.label)), 'Jeder Eintrag hat Kennung und Bezeichnung');
ok(alle.every(id => !/[;"|\[\]]/.test(id)),
  'Keine Kennung enthält ; " | oder Klammern – sie landen in CSV und in BPMN-Markern');

/* Der unveränderte ISO-Bestand – die Erweiterung darf nichts weggenommen haben. */
ok(normIdsMitArt('klausel').length === 23, 'ISO 27001: 23 Klauseln');
ok(normIdsMitArt('annex').length === 93, 'ISO 27001: 93 Annex-A-Controls');
ok(normIdsMitArt('nis2').length === 12, 'NIS2-Richtlinie: 12 Anforderungen');
ok(normIdsMitArt(NORM_ISMS_ARTEN).length === 128, 'ISMS-Umfang unverändert 128');
['A.5.1', 'A.8.34', '4.1', '10.2', 'NIS2-23'].forEach(id =>
  ok(NORMEN_IDS.has(id), `Bestand: ${id} ist noch da`));

/* Die neun neuen Regelwerke */
const neu = {
  'nis2-de': 7, datenschutz: 19, ki: 10, lieferkette: 8, hinweisgeber: 6,
  arbeitsschutz: 11, umwelt: 11, recht: 9, iks: 6,
};
for (const [art, n] of Object.entries(neu)) {
  const ist = normIdsMitArt(art).length;
  ok(ist === n, `Neu: ${art} mit ${n} Anforderungen (ist ${ist})`);
}
ok(Object.values(neu).reduce((a, b) => a + b, 0) === 87, '87 neue Anforderungen insgesamt');

/* Stichproben an den Stellen, an denen sie gebraucht werden */
ok(NORMEN_IDS.has('DSGVO-32') && /Sicherheit der Verarbeitung/.test(normLabel('DSGVO-32')),
  'DSGVO Art. 32 – der Anker der Datenschutz-Konzernrichtlinie');
ok(NORMEN_IDS.has('DSGVO-33'), 'DSGVO Art. 33 – die 72-Stunden-Meldung');
ok(NORMEN_IDS.has('KIVO-4') && NORMEN_IDS.has('KIVO-50'),
  'KI-VO Art. 4 (KI-Kompetenz) und Art. 50 (Kennzeichnung) – die KI-Richtlinie hängt daran');
ok(NORMEN_IDS.has('KIVO-6'), 'KI-VO Art. 6 – die Risikoklasse, die das KI-Dashboard vergibt');
ok(NORMEN_IDS.has('BSIG-30') && NORMEN_IDS.has('BSIG-32') && NORMEN_IDS.has('BSIG-38'),
  'BSIG: Risikomanagement, Meldepflichten, Pflichten der Geschäftsleitung');
ok(NORMEN_IDS.has('LKSG-8'), 'LkSG § 8 – das Beschwerdeverfahren');
ok(NORMEN_IDS.has('HINSCHG-36'), 'HinSchG § 36 – Verbot von Repressalien');
ok(NORMEN_IDS.has('ARBSCHG-5'), 'ArbSchG § 5 – Gefährdungsbeurteilung');
ok(NORMEN_IDS.has('ISO50001-6.3'), 'ISO 50001 – eine Gießerei ist energieintensiv');
ok(NORMEN_IDS.has('AEUV-101') && NORMEN_IDS.has('DUALUSE-2021-821'),
  'Kartellrecht und Dual-Use – beides eigene Konzernregelungen');
ok(NORMEN_IDS.has('AKTG-91-2') && NORMEN_IDS.has('IDW-PS-980'), 'IKS: KonTraG und IDW PS 980');

/* art und Gruppenkürzel */
ok(normArtVon('A.5.1') === 'annex' && normArtVon('DSGVO-5') === 'datenschutz', 'art je Kennung');
ok(normArtVon('gibtesnicht') === 'sonstige', 'Unbekanntes fällt weich');
const falschEinsortiert = alle.filter(id => normArtVon(id) !== 'klausel' && normGroupOf(id) === 'Klausel');
ok(falschEinsortiert.length === 0,
  `normGroupOf kennt jedes Präfix (sonst landet alles unter „Klausel"): ${falschEinsortiert.slice(0, 6).join(', ')}`);

/* Der Seed aus der ISB-Review darf nicht ins Leere zeigen */
const seedIds = [...new Set(Object.values(NORMBEZUG_SEED).flat())];
ok(seedIds.every(id => NORMEN_IDS.has(id)), 'Jede Seed-Zuordnung zeigt auf eine vorhandene Anforderung');

/* ══════════════════════════════════════════════════════════════════
   Teil 2 – entschieden wird nur über Annex A
   ══════════════════════════════════════════════════════════════════ */

ok(alle.filter(normEntscheidbar).length === 93, 'Genau die 93 Annex-A-Controls stehen zur Wahl');
ok(!normEntscheidbar('9.2'), '„Internes Audit" ist keine Entscheidung – die Klausel gilt');
ok(!normEntscheidbar('DSGVO-32') && !normEntscheidbar('NIS2-23') && !normEntscheidbar('LKSG-3'),
  'Gesetze und Verordnungen ebenso wenig');
ok(normEntscheidbar('A.7.4'), 'Ein Annex-A-Control dagegen schon');

/* soa.js in einer Sandbox – dieselben Funktionen, die die App benutzt */
const ctx = {
  console, JSON, Date, Object, Array, String, Math, Number, Set, Promise,
  document: { getElementById: () => null },
  esc: (s) => String(s ?? ''), toast: () => {}, canWriteTab: () => true,
  fmtDateTime: () => '', State: { user: { name: 'T' } },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/normen.js'), ctx);
vm.runInContext(lies('js/soa.js'), ctx);
const w = (code) => vm.runInContext(code, ctx);

w('_soaData = { controls: {}, meta: {} };');
let k = w('_soaKpis()');
ok(k.total === 93, `Die Kennzahl zählt 93, nicht ${alle.length} – „x von 215 entschieden" wäre im Audit angreifbar`);
ok(k.immer === 122, `122 Anforderungen gelten ohne Entscheidung (ist ${k.immer})`);
ok(k.gepflegt === 0, 'Frisch: nichts entschieden');
ok(k.anwendbar === 122, 'Anwendbar ist trotzdem alles, was ohne Wahl gilt');
ok(k.ausgeschlossen === 0 && k.begrFehlt === 0, 'Und nichts ausgeschlossen');

w(`_soaData.controls['A.5.1'] = { anwendbar: true, status: 'umgesetzt', begruendung: '' };
   _soaData.controls['A.7.4'] = { anwendbar: false, status: '', begruendung: '' };
   _soaData.controls['DSGVO-32'] = { anwendbar: null, status: 'umgesetzt', begruendung: '' };`);
k = w('_soaKpis()');
ok(k.gepflegt === 2, 'Zwei Annex-A-Controls entschieden');
ok(k.ausgeschlossen === 1 && k.begrFehlt === 1, 'Ein Ausschluss ohne Begründung wird angemahnt');
ok(k.anwendbar === 123, 'Ein zusätzlich anwendbares Control');
ok(k.umgesetzt === 2, 'Umgesetzt zählt auch bei „gilt immer" mit (A.5.1 und DSGVO-32)');

/* Ein Ausschluss von etwas, das gilt, darf gar nicht erst entstehen */
w("soaSet('9.2', 'anwendbar', 'nein'); soaSet('DSGVO-32', 'anwendbar', 'nein');");
ok(w("!(_soaData.controls['9.2'] && _soaData.controls['9.2'].anwendbar === false)")
   && w("_soaData.controls['DSGVO-32'].anwendbar !== false"),
  'soaSet lehnt den Ausschluss einer Klausel oder Verordnung ab');

ok(w("_soaWord({ anwendbar: null }, '9.2')") === 'gilt immer', 'Im Report steht „gilt immer"');
ok(w("_soaWord({ anwendbar: null }, 'A.5.1')") === 'offen', 'Ein offenes Annex-Control bleibt „offen"');
ok(w("_soaWord({ anwendbar: false }, 'A.5.1')") === 'ausgeschlossen', 'Ein ausgeschlossenes bleibt „ausgeschlossen"');

/* Vorbelegen: Status ja, Scheinentscheidung nein */
w("_soaData = { controls: {}, meta: {} }; _abdeckungData = () => ({});");
w('soaPrefill()');
ok(w("_soaData.controls['A.5.1'].anwendbar === true"), 'Vorbelegen entscheidet die Annex-A-Controls');
ok(w("_soaData.controls['9.2'].anwendbar == null && _soaData.controls['DSGVO-32'].anwendbar == null"),
  'Aber schreibt keine Entscheidung dorthin, wo es nichts zu entscheiden gibt');
ok(w("_soaData.controls['DSGVO-32'].status === 'nicht umgesetzt'"),
  'Der Umsetzungsstatus wird trotzdem gesetzt – der interessiert bei einer Verordnung sehr wohl');

/* ══════════════════════════════════════════════════════════════════
   Teil 3 – die Auswertungen filtern nach art, nicht nach Namen
   ══════════════════════════════════════════════════════════════════ */

const ab = lies('js/abdeckung.js'), ck = lies('js/cockpit.js'), so = lies('js/soa.js');
ok(!/\/NIS2\/\.test\(g\.group\)/.test(ab) && !/\/Annex\/\.test\(g\.group\)/.test(ab),
  'Die Abdeckung filtert nicht mehr über den Gruppennamen');
ok(!/ids\(\/NIS2\/\)/.test(ck) && /normIdsMitArt/.test(ck), 'Das Cockpit ebenso wenig');
ok(/idsMitArt\('klausel', 'annex'\)/.test(ab),
  'Die Lückenliste bleibt die ISO-Lückenliste – Umwelt- und Steuerrecht verwässern keine ISO-Quote');
ok(/weitereIds/.test(ab), 'Die neuen Regelwerke werden getrennt ausgewiesen');
ok(/_soaEntscheidbar/.test(so) && /gilt immer/.test(so), 'Die SoA kennt den Unterschied');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
