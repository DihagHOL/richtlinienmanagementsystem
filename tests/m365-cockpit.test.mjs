/**
 * Anbindung an das Compliance-Cockpit (compliance.dihag.de).
 *
 * Das RMS bleibt führend für SoA, Risiken und Maßnahmen; das Cockpit liefert
 * die M365-Nachweise je Annex-A-Control und springt per Direktlink hierher.
 * Geprüft wird beides:
 *
 *   1. spGetM365Nachweise(): je Control der JÜNGSTE Eintrag, fehlende Liste = {}
 *   2. _soaM365Zeile(): Zeile unter dem Control nur, wenn es einen Nachweis gibt,
 *      mit Link zurück ins Cockpit auf genau dieses Control
 *   3. _ansichtZielOeffnen(): risiko=, eintrag= und control= öffnen den Eintrag;
 *      ein veralteter Link endet mit Hinweis statt mit einem leeren Editor
 *   4. Navigation: eigener Link „nav-m365-cockpit", die bestehende ID
 *      „nav-compliance" (Reiter Compliance) bleibt unberührt
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire as _requireFuerHelfer } from 'module';
const { jsArg, sichereUrl } = _requireFuerHelfer(import.meta.url)('../js/util.js');   // echte Helfer für Handler und Links

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* Eine Funktion aus einer Datei herauslösen (bis zur schließenden Klammer auf Spalte 0). */
function funktion(datei, name) {
  const src = lies(datei);
  const start = src.search(new RegExp(`(async )?function ${name}\\(`));
  if (start < 0) throw new Error(`${name} fehlt in ${datei}`);
  const ende = src.indexOf('\n}\n', start);
  return src.slice(start, ende + 2);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── 1) spGetM365Nachweise ── */
{
  const seiten = [
    { value: [
      { fields: { Title: 'A.8.5', Wert: 'alt', Stand: '2026-08-01', Zeit: '2026-08-01T09:00:00Z' } },
      { fields: { Title: 'A.8.5', Wert: 'neu', Stand: '2026-09-24', Zeit: '2026-09-24T09:00:00Z' } },
      { fields: { Title: '', Wert: 'ohne Control' } },
    ], '@odata.nextLink': 'SEITE2' },
    { value: [
      { fields: { Title: 'A.8.12', Wert: '5 DLP-Warnungen', Stand: '2026-09-20', Zeit: '2026-09-20T08:00:00Z' } },
      { fields: { Title: 'A.8.5', Wert: 'zwischendurch', Stand: '2026-09-10', Zeit: '2026-09-10T08:00:00Z' } },
    ] },
  ];
  let abrufe = 0;
  const ctx = {
    SP: { graphBase: 'G', scopes: [], m365NachweisList: 'Compliance_M365Nachweise' },
    _sp: { appSiteId: 'site' },
    acquireToken: async () => 'token',
    spInit: async () => {},
    _findListId: async (_t, name) => { if (name !== 'Compliance_M365Nachweise') throw new Error('falsche Liste'); return 'liste'; },
    _get: async (url) => { abrufe++; return url === 'SEITE2' ? seiten[1] : seiten[0]; },
    String, Object, Array,
  };
  ctx.jsArg ??= jsArg; ctx.sichereUrl ??= sichereUrl; vm.createContext(ctx);
  vm.runInContext(funktion('js/sharepoint.js', 'spGetM365Nachweise'), ctx);
  const m = await vm.runInContext('spGetM365Nachweise()', ctx);
  ok(m['A.8.5'] && m['A.8.5'].wert === 'neu', 'je Control gewinnt der jüngste Nachweis (über Seiten hinweg)');
  ok(m['A.8.12'] && m['A.8.12'].stand === '2026-09-20', 'zweites Control von Seite 2 übernommen');
  ok(!('' in m), 'Einträge ohne Control-ID werden ignoriert');
  ok(abrufe === 2, 'nextLink wird bis zum Ende verfolgt');

  ctx._findListId = async () => { throw new Error('SharePoint-Liste nicht gefunden'); };
  const leer = await vm.runInContext('spGetM365Nachweise()', ctx);
  ok(leer && Object.keys(leer).length === 0, 'fehlt die Liste noch, gibt es {} statt eines Fehlers');
}

/* ── 2) _soaM365Zeile ── */
{
  const src = lies('js/soa.js');
  const ctx = { esc, fmtDate: (d) => String(d || '').slice(0, 10), encodeURIComponent, Object };
  ctx.jsArg ??= jsArg; ctx.sichereUrl ??= sichereUrl; vm.createContext(ctx);
  const teil = src.slice(src.indexOf('let _soaM365 = null;'), src.indexOf('/** Kleine Zeile unter der Bezeichnung'));
  vm.runInContext(teil.split('let _soaM365').join('var _soaM365').split('const SOA_COCKPIT_URL').join('var SOA_COCKPIT_URL'), ctx);
  vm.runInContext(funktion('js/soa.js', '_soaM365Zeile'), ctx);
  ctx._soaM365 = { 'A.8.5': { wert: '2 aktive Richtlinien <b>', stand: '2026-09-24', zeit: 'x' } };
  const z = vm.runInContext("_soaM365Zeile('A.8.5')", ctx);
  ok(z.includes('2026-09-24') && z.includes('2 aktive Richtlinien'), 'Zeile zeigt Stand und Wert');
  ok(z.includes('&lt;b&gt;') && !z.includes('<b>'), 'Wert wird maskiert (kein HTML aus der Liste)');
  ok(z.includes('?ansicht=nachweise&amp;control=A.8.5') || z.includes('?ansicht=nachweise&control=A.8.5'),
    'Link führt ins Cockpit auf genau dieses Control');
  ok(vm.runInContext("_soaM365Zeile('A.5.1')", ctx) === '', 'ohne Nachweis keine Zeile');
  ctx._soaM365 = null;
  ok(vm.runInContext("_soaM365Zeile('A.8.5')", ctx) === '', 'solange nicht geladen keine Zeile');
  ok(/_soaM365Zeile\(it\.id\)/.test(src), 'die SoA-Tabelle ruft die Zeile je Control auf');
  ok(/typeof spGetM365Nachweise === 'function'/.test(src), 'Laden der Nachweise ist abgesichert (Modul-Grenze)');
}

/* ── 3) _ansichtZielOeffnen ── */
{
  const aufrufe = [];
  const ctx = {
    toast: (m) => aufrufe.push('toast:' + m),
    openRiskEditor: (id) => aufrufe.push('risiko:' + id),
    openWirkEditor: (id) => aufrufe.push('wirk:' + id),
    abdeckungSetMode: (m) => aufrufe.push('modus:' + m),
    _risks: [{ id: '12' }], _wirk: [{ id: '7' }], _soaFilter: { q: '', nur: '' },
    URLSearchParams, Date, Promise, setTimeout, String, Array,
  };
  ctx.jsArg ??= jsArg; ctx.sichereUrl ??= sichereUrl; vm.createContext(ctx);
  // _risks/_wirk/_soaFilter sind im RMS globale let-Variablen; hier Eigenschaften des Kontexts.
  vm.runInContext(funktion('js/app.js', '_ansichtZielOeffnen'), ctx);
  const lauf = (ansicht, q) => vm.runInContext(`_ansichtZielOeffnen(${JSON.stringify(ansicht)}, new URLSearchParams(${JSON.stringify(q)}))`, ctx);

  await lauf('risiken', 'ansicht=risiken&risiko=12');
  ok(aufrufe.includes('risiko:12'), '?risiko= öffnet das Risiko');
  await lauf('risiken', 'ansicht=risiken&risiko=99');
  ok(aufrufe.some(a => a.startsWith('toast:')) && !aufrufe.includes('risiko:99'), 'unbekanntes Risiko: Hinweis statt leerem Editor');
  await lauf('wirksamkeit', 'ansicht=wirksamkeit&eintrag=7');
  ok(aufrufe.includes('wirk:7'), '?eintrag= öffnet den Eintrag in „Wirksamkeit"');
  await lauf('abdeckung', 'ansicht=abdeckung&modus=soa&control=A.8.12');
  ok(aufrufe.includes('modus:soa') && ctx._soaFilter.q === 'A.8.12', '?control= öffnet die SoA, gefiltert auf das Control');
  aufrufe.length = 0;
  await lauf('risiken', 'ansicht=risiken');
  ok(aufrufe.length === 0, 'ohne Ziel bleibt es bei der Ansicht');
  ok(/await _ansichtZielOeffnen\(ansicht, params\)/.test(lies('js/app.js')), 'der Ansichts-Deeplink ruft die Zielöffnung auf');
}

/* ── 4) Navigation ── */
{
  const html = lies('index.html');
  const access = lies('js/access.js');
  ok((html.match(/id="nav-compliance"/g) || []).length === 1, 'bestehende ID nav-compliance gibt es genau einmal');
  ok((html.match(/id="nav-m365-cockpit"/g) || []).length === 1, 'Link zum Compliance-Cockpit hat eine eigene ID');
  ok(/href="https:\/\/compliance\.dihag\.de\/"[^>]*id="nav-m365-cockpit"/.test(html), 'Link zeigt auf das Cockpit');
  ok(/show\('nav-m365-cockpit'/.test(access) && /show\('nav-compliance',\s*v\.compliance\)/.test(access),
    'Sichtbarkeit getrennt: Cockpit-Link und Reiter Compliance');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
