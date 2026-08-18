/**
 * Wächter gegen veraltete Dokumentation.
 *
 * Hintergrund: Nach mehreren Ausbaustufen beschrieb die In-App-Doku Funktionen
 * nicht mehr, die es längst gab (Konzepte, Geltungsbereich, Historie …).
 * Dieser Test verknüpft jedes Feature mit einem Beleg im Code UND einem Beleg
 * in der Doku: Wer ein Feature einbaut, ohne es zu dokumentieren, bekommt hier
 * einen roten Test.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_DATEIEN = ['admin.js', 'freigaben.js', 'einstellungen.js'];   // admin.js wurde aufgeteilt

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const doku = read('js/dokumentation.js');
const anleitung = read('js/anleitung.js');
const admin = ADMIN_DATEIEN.map(f => read('js/' + f)).join('\n');
const konzepte = read('js/konzepte.js');
const governance = read('js/governance.js');
const prozesse = read('js/prozesse.js');
const indexHtml = read('index.html');

/**
 * Ein Feature gilt als dokumentiert, wenn es im Code existiert (codeBeleg)
 * und in der Doku vorkommt (dokuBegriffe – alle müssen auftauchen).
 */
const FEATURES = [
  { name: 'Regelwerk-Konzepte',      code: () => /function openKonzeptEditor/.test(konzepte),        begriffe: ['Regelwerk-Konzept', 'GF-Prüfung', 'Annehmen'] },
  { name: 'Konzept-Anhang',          code: () => /function konzeptUploadAttachment/.test(konzepte),  begriffe: ['Anhang'] },
  { name: 'Konzept-Rückmeldung',     code: () => /function notifyKonzeptErsteller/.test(konzepte),   begriffe: ['Rückmeldung an die einreichende Person'] },
  { name: 'Weiche nach der Annahme', code: () => /function konzeptWeiche/.test(konzepte),            begriffe: ['Wie soll es weitergehen?', 'direkt zur Konformitätsprüfung'] },
  { name: 'Konzept als Word-Datei',  code: () => /function _plDocxBauen/.test(read('js/probelauf.js')), begriffe: ['Word-Datei'] },
  { name: 'Typ (Dokumentart)',       code: () => /const REGELWERK_TYPEN/.test(admin),                begriffe: ['Dokumentart', 'Konzernfachregelung', 'Leitfaden'] },
  { name: 'Geltungsbereich',         code: () => /const STANDORTE/.test(admin),                      begriffe: ['Geltungsbereich', 'HOL', 'EWA'] },
  { name: 'Änderungshistorie',       code: () => /function renderHistorieSection/.test(admin),       begriffe: ['Änderungshistorie'] },
  { name: 'Archivieren/Reaktivieren',code: () => /function archivierePolicy/.test(admin),            begriffe: ['Archivieren', 'Reaktivieren'] },
  { name: 'Massen-Import',           code: () => /function openImportDialog/.test(admin),            begriffe: ['Importieren'] },
  { name: 'Dashboard-Filter',        code: () => /filter-admin-standort/.test(indexHtml),            begriffe: ['Filter'] },
  { name: 'Volltextsuche',           code: () => /function policyMatchesQuery/.test(admin),          begriffe: ['Suche'] },
  { name: 'Gleichzeitigkeits-Schutz',code: () => /function pruefeFremdaenderung/.test(admin),        begriffe: ['zwischenzeitlich geändert'] },
  { name: 'Muster-Vorlage',          code: () => /MUSTER_VORLAGE_URL/.test(admin),                   begriffe: ['Muster-Vorlage'] },
  { name: 'Governance-Ordnerbaum',   code: () => /function _govBuildTree/.test(governance),          begriffe: ['Ordner-Baum'] },
  { name: 'Standard-Prozesse',       code: () => /function seedStandardProcesses/.test(prozesse),    begriffe: ['Standard-Prozesse'] },
  { name: 'Reihenfolge Freigabe/MB', code: () => /function edSwapWorkflowOrder/.test(admin),         begriffe: ['Reihenfolge'] },
  { name: 'Einführungs-Schritte',    code: () => /const RW_SCHRITTE/.test(admin),                     begriffe: ['So wird ein Regelwerk eingeführt'] },
  { name: 'Probelauf',               code: () => /function probelaufAktivieren/.test(read('js/probelauf.js')), begriffe: ['Probelauf', 'echten Vorgang', 'Aufräumen', 'Selbsttest'] },
  { name: 'Geführte Vorführung',     code: () => /function tourSchritte/.test(read('js/tour.js')),      begriffe: ['Geführte Vorführung', 'Vormachen'] },
];

for (const f of FEATURES) {
  ok(f.code(), `Feature vorhanden: ${f.name}`);
  const fehlend = f.begriffe.filter(b => !doku.includes(b));
  ok(fehlend.length === 0, `Dokumentiert: ${f.name}${fehlend.length ? ' – fehlt: ' + fehlend.join(', ') : ''}`);
}

/* Inhaltsverzeichnis und Abschnitte müssen zusammenpassen. */
const tocIds = [...doku.matchAll(/^\s{2}\['([a-z]+)',/gm)].map(m => m[1]);
const secIds = [...doku.matchAll(/^\s{4}sec\('([a-z]+)'/gm)].map(m => m[1]);
ok(tocIds.length > 0 && tocIds.length === secIds.length,
  `Inhaltsverzeichnis und Abschnitte gleich lang (${tocIds.length} / ${secIds.length})`);
const fehltImToc = secIds.filter(id => !tocIds.includes(id));
const fehltAlsSec = tocIds.filter(id => !secIds.includes(id));
ok(fehltImToc.length === 0, `Jeder Abschnitt steht im Inhaltsverzeichnis${fehltImToc.length ? ' – fehlt: ' + fehltImToc.join(', ') : ''}`);
ok(fehltAlsSec.length === 0, `Jeder Eintrag hat einen Abschnitt${fehltAlsSec.length ? ' – fehlt: ' + fehltAlsSec.join(', ') : ''}`);

/* Die Mitarbeiter-Anleitung soll die wichtigsten Neuerungen zumindest streifen. */
for (const b of ['Konzept', 'Geltungsbereich', 'Änderungshistorie'])
  ok(anleitung.includes(b), `Anleitung erwähnt: ${b}`);

/* Umbenennungs-Altlasten: falsche Grammatik aus „Richtlinie" → „Regelwerk". */
const grammatik = [/\bdie Regelwerk\b/, /\bNeue Regelwerk\b/, /\bden Regelwerke\b/, /\bmit Regelwerke\b/, /\bder Regelwerk\b/];
for (const re of grammatik) {
  const treffer = [];
  if (re.test(doku)) treffer.push('dokumentation.js');
  if (re.test(anleitung)) treffer.push('anleitung.js');
  ok(treffer.length === 0, `Keine Grammatik-Altlast ${re.source}${treffer.length ? ' in ' + treffer.join(', ') : ''}`);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
