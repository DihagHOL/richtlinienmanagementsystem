/**
 * Wächter für den Deployment-Smoke.
 *
 * Hintergrund: Der Deploy-Smoke prüft die LIVE-Seite auf Textmarker. Nach der
 * Umbenennung „Richtlinienmanagement" → „Regelwerk-Management" suchte er einen
 * Text, den es nicht mehr gab – und schlug nach jedem Deployment fehl, obwohl
 * die Seite in Ordnung war. Dieser Test vergleicht die Marker mit der
 * ausgelieferten index.html, sodass so etwas lokal auffällt.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const smoke = fs.readFileSync(ROOT + '/scripts/deploy-smoke.mjs', 'utf8');
const rms = fs.readFileSync(ROOT + '/index.html', 'utf8');
const ki = fs.readFileSync(ROOT + '/ki/index.html', 'utf8');

/** Die Marker-Listen aus den checkPage-Aufrufen lesen. */
function marker(label) {
  const re = new RegExp(`checkPage\\('${label}[^']*',[^,]+,\\s*\\[([^\\]]+)\\]`, 's');
  const m = smoke.match(re);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

const rmsMarker = marker('1\\.');
const kiMarker = marker('2\\.');

ok(Array.isArray(rmsMarker) && rmsMarker.length > 0, `Marker der Startseite gefunden (${rmsMarker ? rmsMarker.length : 0})`);
ok(Array.isArray(kiMarker) && kiMarker.length > 0, `Marker des KI-Dashboards gefunden (${kiMarker ? kiMarker.length : 0})`);

for (const m of rmsMarker || [])
  ok(rms.includes(m), `index.html enthält den Marker „${m}"`);
for (const m of kiMarker || [])
  ok(ki.includes(m), `ki/index.html enthält den Marker „${m}"`);

/* Weder der alte Name noch die alte Domain dürfen zurückkehren. */
const alteMarker = (rmsMarker || []).filter(m => /Richtlinienmanagement/.test(m));
ok(alteMarker.length === 0, 'Kein Marker mit dem alten Namen „Richtlinienmanagement"');
ok(/rms\.dihag\.de/.test(smoke), 'Deploy-Smoke prüft die aktuelle Domain rms.dihag.de');

/* Die Domain steckt auch in den Deep-Links der Workflow-Mails und im
   Erinnerungs-Job. Bleibt dort die alte stehen, führen Mail-Buttons ins Leere. */
const domainDateien = ['js/freigaben.js', 'js/konzepte.js', 'js/admin.js', 'js/anleitung.js',
                       'js/dokumentation.js', 'scripts/erinnerungen.mjs', 'playwright.config.js'];
const alteDomain = domainDateien.filter(f => /richtlinienmanagement\.dihag-extern\.com/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
ok(alteDomain.length === 0, 'Keine alte Domain mehr im Code' + (alteDomain.length ? ': ' + alteDomain.join(', ') : ''));

/* CNAME (GitHub Pages) muss zur geprüften Domain passen. */
const cname = fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').trim();
ok(cname === 'rms.dihag.de', `CNAME zeigt auf die aktuelle Domain (ist „${cname}")`);
ok(smoke.includes(cname), 'Deploy-Smoke und CNAME nennen dieselbe Domain');

/* Umzugsseite: der geprüfte Text muss dort auch stehen. */
const umzug = ROOT + '/../ki-dashboard/index.html';
if (fs.existsSync(umzug)) {
  const s = fs.readFileSync(umzug, 'utf8');
  ok(/umgezogen/i.test(s), 'Umzugsseite enthält „umgezogen"');
} else {
  ok(true, 'Umzugsseite liegt in einem anderen Repo – nicht prüfbar (übersprungen)');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
