/**
 * Das DIHAG-Logo statt des „R".
 *
 * Bisher stand ein blaues Kästchen mit „R" an drei Stellen: in der Anmeldung,
 * in der Seitenleiste und auf der Bescheinigung. Jetzt zeigt die App das
 * DIHAG-Zeichen (Tiegel im Ring), und alles, was das Haus verlässt oder
 * ausgedruckt wird – Bescheinigungen, Berichte, Druckfassungen – trägt das
 * vollständige Logo „DIHAG Integrated Foundry Group" im Kopf.
 *
 * Die Druckfassungen entstehen per window.open('') + document.write, also
 * ohne eigene Adresse. Das Logo muss dort absolut adressiert sein – sonst
 * bliebe an seiner Stelle ein leeres Kästchen.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const _require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const istPng = (p) => { const b = fs.readFileSync(path.join(ROOT, p)); return b.length > 1000 && b.subarray(0, 8).equals(PNG); };
const U = _require('../js/util.js');

/* ── 1) Die beiden Dateien ── */
ok(istPng('assets/dihag-zeichen.png'), 'Das Zeichen (Tiegel im Ring) liegt als PNG in assets/');
ok(istPng('assets/dihag-logo.png'), 'Das vollständige Logo ebenso');

/* ── 2) Die App: Zeichen in Anmeldung, Seitenleiste, Favicon ── */
const html = lies('index.html');
ok(/<link rel="icon" type="image\/png" href="assets\/dihag-zeichen\.png"\/>/.test(html), 'Das Favicon ist das Zeichen – nicht mehr das Schild-Emoji');
ok(/<img class="boot-logo" src="assets\/dihag-zeichen\.png" alt="DIHAG" width="56" height="62">/.test(html), 'Die Anmeldung zeigt das Zeichen');
ok(/<div class="sidebar-logo">\s*<img src="assets\/dihag-zeichen\.png" alt="DIHAG" width="28" height="31">\s*<span>Regelwerk<\/span>/.test(html), 'Die Seitenleiste auch – neben „Regelwerk"');
ok(!/font-family="Exo">R<\/text>/.test(html), 'Das „R"-Kästchen ist weg');
ok(/\.sidebar-logo img \{ display: block; flex-shrink: 0; \}/.test(lies('css/style.css')), 'Das Bild in der Leiste schrumpft nicht mit');

/* ── 3) Adresse und Kopf der Druckfassungen ── */
ok(U.rmsAssetUrl('dihag-logo.png') === 'https://rms.dihag.de/assets/dihag-logo.png', 'Ohne Browser gilt die Live-Adresse – absolut, für Druckfenster ohne eigene Adresse');
const kopf = U.druckKopf();
ok(/^<div class="druck-kopf" style="display:flex;/.test(kopf) && /<img src="https:\/\/rms\.dihag\.de\/assets\/dihag-logo\.png" alt="DIHAG Integrated Foundry Group" style="height:42px;width:auto">/.test(kopf),
  'Der Druckkopf: das vollständige Logo, absolut adressiert, in Inline-Stil');
ok(/Regelwerk-Management<\/span>/.test(kopf), '… rechts „Regelwerk-Management"');
ok(/ISMS-Bericht<\/span>/.test(U.druckKopf('ISMS-Bericht')) && !/<span/.test(U.druckKopf('')), 'Die Zeile rechts lässt sich ersetzen oder weglassen');

/* ── 4) Jede Druckfassung trägt den Kopf ── */
const knopf = '🖨 Drucken / als PDF speichern</button></div>';
const direkt = ['js/abdeckung.js', 'js/prozessmatrix.js', 'js/risiken.js', 'js/soa.js', 'js/dokumentation.js', 'js/clevelreport.js'];
for (const f of direkt) {
  const s = lies(f), i = s.indexOf(knopf);
  ok(i > 0 && s.slice(i, i + 80).includes('${druckKopf()}'), `${f}: Druckkopf direkt nach dem Druckknopf`);
}
const modelle = [['js/assetmodell.js', '<h1>Assetinventar', 'Assetinventar'], ['js/vorfallmodell.js', '<h1>Vorfallakte', 'Vorfallakte'],
  ['js/notfallmodell.js', '<div class="deck">', 'Deckblatt des Notfallhandbuchs'], ['js/notfallmodell.js', '<h1>🚨 Alarmkarte', 'Alarmkarte']];
for (const [f, danach, was] of modelle) {
  const s = lies(f), i = s.indexOf(danach);
  ok(i > 0 && s.slice(i - 40, i).includes("${o.kopf || ''}"), `${f}: das reine Modell nimmt den Kopf entgegen (o.kopf) – über „${was}"`);
}
ok(/kopf: druckKopf\(\)/.test(lies('js/assets.js')) && /kopf: druckKopf\(\)/.test(lies('js/vorfaelle.js')) && /kopf: druckKopf\(\)/.test(lies('js/notfall.js')),
  'Assetinventar, Vorfallakte, Notfallhandbuch und Alarmkarte reichen ihn herein');
ok(!/<img/.test(lies('js/clevelreport.js').split('function printClevelReport')[0]), 'Der C-Level-Bericht als Mail bleibt ohne Bild – Mailprogramme blocken fremde Bilder');

/* ── 5) Die Bescheinigung ── */
const M = _require('../js/wissenmodell.js');
const kurs = { id: 'k1', titel: 'Phishing erkennen', module: [{ titel: 'A' }], fragen: [{}], pflicht: true, wiederholung: 12 };
const stand = { erledigt: true, am: '2026-09-18', score: 100, ack: { id: '42' } };
const mit = M.wiZertifikatHtml({ kurs, stand, name: 'Anna Muster', logo: 'https://rms.dihag.de/assets/dihag-logo.png' });
ok(/<div class="marke"><img src="https:\/\/rms\.dihag\.de\/assets\/dihag-logo\.png" alt="DIHAG Integrated Foundry Group"><\/div>/.test(mit), 'Die Bescheinigung trägt das vollständige Logo im Kopf');
ok(/\.marke img \{ display: block; height: 60px; width: auto; \}/.test(mit) && !/<i>R<\/i>/.test(mit), '… als Bild, nicht mehr als „R"-Kästchen');
const ohne = M.wiZertifikatHtml({ kurs, stand, name: 'Anna Muster' });
ok(/<div class="marke">DIHAG · Regelwerk-Management<\/div>/.test(ohne) && !/<img/.test(ohne), 'Ohne Adresse steht der Name in Schrift – nie ein leeres Bild');
ok(/<img src="a&quot;b"/.test(M.wiZertifikatHtml({ kurs, stand, logo: 'a"b' })), 'Die Adresse wird maskiert');
ok(/logo: rmsAssetUrl\('dihag-logo\.png'\)/.test(lies('js/wissen.js')), 'Der Reiter reicht die Adresse herein');

/* ── 6) Deploy-Smoke fragt Bilder und Favicon mit an ── */
const smoke = lies('scripts/deploy-smoke.mjs');
ok(/rel="\(stylesheet\|icon\)"/.test(smoke) && /<img\\s\+\[\^>\]\*src="\(\[\^"\]\+\)"/.test(smoke) && /new Set\(out\)/.test(smoke),
  'Der Deploy-Smoke holt auch Favicon und Bilder – ein 404 beim Logo fällt so auf');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
