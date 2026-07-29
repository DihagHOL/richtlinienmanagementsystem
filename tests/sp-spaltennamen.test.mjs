import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const sctx = { console, JSON };
sctx.window = sctx; sctx.globalThis = sctx;
sctx.fetch = () => {}; sctx.location = { origin:'', pathname:'' };
vm.createContext(sctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/sharepoint.js','utf8'), sctx);

// Szenario: Spalte hat Anzeigename "Typ2", aber internen Namen "OldTyp"
vm.runInContext(`
  _sp.policyColumns = [
    { name: 'OldTyp', displayName: 'Typ2' },
    { name: 'KonzeptJson', displayName: 'KonzeptJson' },
    { name: 'Title', displayName: 'Titel' },
  ];
  _sp.policyFields = new Set(['OldTyp','KonzeptJson','Title']);
  globalThis.__has = _policyHasColumn('Typ2');
  globalThis.__res = _policyFieldName('Typ2');
  globalThis.__resKJ = _policyFieldName('KonzeptJson');
  globalThis.__missing = spMissingPolicyColumns().map(c => c.name);
`, sctx);
ok(sctx.__has === true, '_policyHasColumn matcht Spalte per Anzeigename „Typ2“');
ok(sctx.__res === 'OldTyp', '_policyFieldName(„Typ2“) → interner Name „OldTyp“');
ok(sctx.__resKJ === 'KonzeptJson', '_policyFieldName(„KonzeptJson“) → „KonzeptJson“');
ok(!sctx.__missing.includes('Typ2'), 'spMissingPolicyColumns meldet Typ2 NICHT mehr (Banner weg)');
ok(!sctx.__missing.includes('KonzeptJson'), 'KonzeptJson ebenfalls nicht als fehlend');

// _mapPolicy liest über den internen Namen
vm.runInContext(`
  globalThis.__m = _mapPolicy({ id:'1', fields:{ Title:'T', OldTyp:'Konzept', KonzeptJson: JSON.stringify({prioritaet:'hoch'}) } });
  globalThis.__m2 = _mapPolicy({ id:'2', fields:{ Title:'R', OldTyp:'' } });
`, sctx);
ok(sctx.__m.typ === 'Konzept', '_mapPolicy: liest „Konzept“ über internen Namen OldTyp');
ok(sctx.__m.konzept && sctx.__m.konzept.prioritaet === 'hoch', '_mapPolicy: KonzeptJson korrekt geparst');
ok(sctx.__m2.typ === 'Regelwerk', '_mapPolicy: leeres Typ2 → Regelwerk');

// Fallback wenn keine policyColumns bekannt: erwarteter Name bleibt
vm.runInContext(`_sp.policyColumns = []; globalThis.__fb = _policyFieldName('Typ2');`, sctx);
ok(sctx.__fb === 'Typ2', 'Fallback: ohne Spalteninfo bleibt erwarteter Name „Typ2“');

// Statische Checks: Schreibpfad bildet auf interne Namen ab
const shp = fs.readFileSync(ROOT + '/js/sharepoint.js','utf8');
ok(/const actual = _policyFieldName\(k\);/.test(shp), 'spSavePolicy: Schreib-Keys → interne Namen aufgelöst');
ok(/if \(!all\.Typ2\)\s*delete all\.Typ2;/.test(shp), 'spSavePolicy: Typ2-Omit auf all-Ebene (Regelwerke)');
ok(/_sp\.policyColumns = \(cols\.value/.test(shp), 'spInit füllt _sp.policyColumns');

console.log(`\n${fail? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
