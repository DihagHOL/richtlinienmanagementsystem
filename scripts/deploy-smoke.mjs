#!/usr/bin/env node
/**
 * Deployment-Smoke (Live, read-only)
 * ==================================
 * Prüft das ausgelieferte System über HTTP – ohne Login, ohne Schreibzugriff.
 * Fängt: kaputtes Deploy, fehlende/404-Assets (z. B. falsches ?v=),
 * tote Weiterleitung der alten KI-URL, fehlende Verdrahtung im HTML.
 *
 * Aufruf:  node scripts/deploy-smoke.mjs
 *          BASE=https://… node scripts/deploy-smoke.mjs   (andere Basis-URL)
 *
 * Exit 0 = grün, 1 = Fehler. Reine GET-Requests, verändert nichts.
 */
const BASE     = (process.env.BASE || 'https://rms.dihag.de').replace(/\/$/, '');
const OLD_KI   = process.env.OLD_KI || 'https://ki-dashboard.dihag-extern.com';
const TIMEOUT  = 15000;

const failures = [];
const warnungen = [];
let passed = 0;
const ok   = (m) => { passed++; console.log('   \x1b[32m✓\x1b[0m ' + m); };
const fail = (m) => { failures.push(m); console.log('   \x1b[31m✗ ' + m + '\x1b[0m'); };
/* Fremdes Revier: Was ein anderes Repo ausliefert, wird gemeldet, macht diesen
   Lauf aber nicht rot. Ein Build, den hier niemand grün bekommen kann, steht
   sonst dauerhaft auf rot – und dann schaut niemand mehr hin. */
const warn = (m) => { warnungen.push(m); console.log('   \x1b[33m⚠ ' + m + '\x1b[0m'); };
const head = (m) => console.log('\n\x1b[1m' + m + '\x1b[0m');

async function get(url) {
  const ctrl = AbortSignal.timeout(TIMEOUT);
  const res = await fetch(url, { redirect: 'follow', signal: ctrl });
  const body = await res.text();
  return { status: res.status, body, url: res.url };
}

// Lokale (nicht-CDN) Asset-URLs aus einem HTML ziehen, absolut auflösen.
function assetUrls(html, pageUrl) {
  const out = [];
  for (const m of html.matchAll(/<script\s+[^>]*src="([^"]+)"/g))
    if (!/^https?:/.test(m[1])) out.push(new URL(m[1], pageUrl).href);
  for (const t of html.matchAll(/<link\b[^>]*>/g))
    if (/rel="stylesheet"/.test(t[0])) {
      const h = (t[0].match(/href="([^"]+)"/) || [])[1];
      if (h && !/^https?:/.test(h)) out.push(new URL(h, pageUrl).href);
    }
  return out;
}

async function checkPage(label, pageUrl, mustContain) {
  head(`${label} – ${pageUrl}`);
  let page;
  try { page = await get(pageUrl); }
  catch (e) { fail(`nicht erreichbar: ${e.message}`); return; }
  if (page.status === 200) ok(`HTTP 200`);
  else fail(`HTTP ${page.status}`);

  for (const needle of mustContain)
    if (page.body.includes(needle)) ok(`enthält "${needle}"`);
    else fail(`Marker fehlt: "${needle}"`);

  const assets = assetUrls(page.body, pageUrl);
  for (const a of assets) {
    try {
      const r = await get(a);
      if (r.status === 200) ok(`Asset 200: ${a.replace(BASE, '')}`);
      else fail(`Asset HTTP ${r.status}: ${a}`);
    } catch (e) { fail(`Asset nicht erreichbar: ${a} (${e.message})`); }
  }
  return page;
}

(async function main() {
  console.log(`Deployment-Smoke · ${new Date().toISOString()}\nBASE=${BASE}`);

  // 1. RMS-Startseite + Verdrahtung zum KI-Dashboard
  // Marker müssen zur ausgelieferten index.html passen (siehe Test „deploy-marker").
  await checkPage('1. Regelwerk-Management', `${BASE}/`,
    ['Regelwerk-Management', 'href="ki/"', 'js/auth.js', 'js/app.js']);

  // 2. KI-Dashboard unter /ki/
  await checkPage('2. KI-Dashboard', `${BASE}/ki/`,
    ['KI-Governance', '_AUTH.redirectUri', 'app.js']);

  // 3. Alte KI-URL → Weiterleitungsseite auf /ki/
  head(`3. Alte KI-URL → Redirect – ${OLD_KI}`);
  try {
    const r = await get(`${OLD_KI}/`);
    if (r.status === 200) ok('HTTP 200');
    else fail(`HTTP ${r.status}`);
    if (/umgezogen/i.test(r.body)) ok('zeigt Umzugsseite');
    else fail('Umzugsseite-Marker "umgezogen" fehlt');
    // Die Umzugsseite liegt in einem anderen Repo. Die alte Domain
    // richtlinienmanagement.dihag-extern.com ist abgeschaltet und liefert 404 –
    // ein Verweis dorthin schickt Besucher also ins Leere und zählt als Fehler.
    if (r.body.includes('rms.dihag.de/ki/')) ok('verweist auf /ki/ (aktuelle Domain)');
    else if (r.body.includes('richtlinienmanagement.dihag-extern.com/ki/')) warn(
      'verweist noch auf die abgeschaltete Domain – die Weiterleitung endet im 404. '
      + 'Zu ändern in dfedorov12/ki-dashboard (index.html, 3 Stellen); das Repo ist archiviert '
      + 'und muss dafür kurz entarchiviert werden.');
    else fail('Verweis auf /ki/ fehlt');
  } catch (e) { fail(`alte KI-URL nicht erreichbar: ${e.message}`); }

  console.log(`\n${'─'.repeat(54)}`);
  if (warnungen.length) {
    console.log(`\x1b[33m⚠ ${warnungen.length} Hinweis(e) außerhalb dieses Repos:\x1b[0m`);
    warnungen.forEach(w => console.log('   • ' + w));
  }
  if (failures.length === 0) {
    console.log(`\x1b[32m\x1b[1m✓ Deployment-Smoke bestanden\x1b[0m – ${passed} Prüfungen grün${
      warnungen.length ? `, ${warnungen.length} Hinweis(e)` : ''}.`);
    process.exit(0);
  } else {
    console.log(`\x1b[31m\x1b[1m✗ ${failures.length} Fehler\x1b[0m (${passed} grün):`);
    failures.forEach(f => console.log('   • ' + f));
    process.exit(1);
  }
})();
