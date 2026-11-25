/**
 * Die Ordnung des RMS: vier Phasen in der Seitenleiste, im Cockpit und auf der Karte
 *
 * Die Gesamtkarte im Reiter Prozesse ordnet die 13 Themen in Planen, Umsetzen,
 * Prüfen und verbessern und Anlassbezogen. Die Seitenleiste war nach
 * Werkzeugarten gegliedert (Regelwerk, Corporate Governance, IMS und Prozesse)
 * und ihre größte Gruppe hatte 13 Einträge ohne erkennbare Reihenfolge. Jetzt
 * sagen Leiste, Cockpit und Karte dasselbe: dieselben Gruppen, dieselben Fragen,
 * und die Reiter stehen in der Reihenfolge der Kette des Gesamtprozesses.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const html = lies('index.html');
const cockpit = lies('js/cockpit.js');
const access = lies('js/access.js');
const R = require(ROOT + '/js/rmsprozesse.js');
const GK = require(ROOT + '/js/gesamtkarte.js');

/* ── 1) Die Leiste: Gruppen und ihre Reiter ── */
// Reihenfolge der Überschriften und Einträge, wie sie in index.html stehen.
const nav = html.slice(html.indexOf('<nav class="sidebar-nav"'), html.indexOf('</nav>'));
const gruppen = [];
const re = /<div class="nav-sep" id="nav-grp-(\w+)"[^>]*>([^<]*)(?:<span class="nav-frage">([^<]*)<\/span>)?<\/div>|<a class="nav-item[^"]*"[^>]*data-view="(\w+)"/g;
let m, aktuell = { key: '_start', titel: '', frage: '', reiter: [] };
gruppen.push(aktuell);
while ((m = re.exec(nav))) {
  if (m[1]) { aktuell = { key: m[1], titel: m[2], frage: m[3] || '', reiter: [] }; gruppen.push(aktuell); }
  else aktuell.reiter.push(m[4]);
}
const G = (k) => gruppen.find(g => g.key === k);

ok(gruppen.map(g => g.key).join() === '_start,planen,umsetzen,pruefen,anlass,ki,apps,verwaltung',
  'Die Gruppen stehen in dieser Reihenfolge: Planen, Umsetzen, Prüfen und verbessern, Anlass, danach KI, Apps, Verwaltung');
ok(G('_start').reiter.join() === 'meine,wissen,anleitung,dokumentation', 'Oben bleiben Meine Regelwerke, Wissen, Anleitung und Dokumentation');
ok(G('planen').reiter.join() === 'governance,govstruktur,prozesse,assets,risiken,abdeckung,ziele,massnahmen,kennzahlen', 'Planen: von der Governance über Prozesse, Assets und Risiken bis zu Zielen und Kennzahlen');
ok(G('umsetzen').reiter.join() === 'verwaltung,freigaben,ausnahmen,faelligkeit,vorschlaege,ismsdocs,notfall', 'Umsetzen: die Regelwerke, ihre Pflege, die IMS-Dokumente und die Notfallvorsorge');
ok(G('pruefen').reiter.join() === 'wirksamkeit,cockpit,compliance,handbuch', 'Prüfen und verbessern: Wirksamkeit, Cockpit, Audit Report, Managementhandbuch');
ok(G('anlass').reiter.join() === 'vorfaelle', 'Wenn etwas passiert: die Vorfälle');
ok(G('verwaltung').reiter.join() === 'einstellungen', 'Die Verwaltung hält nur noch die Einstellungen');

// Jeder Reiter genau einmal.
const alle = gruppen.flatMap(g => g.reiter);
ok(new Set(alle).size === alle.length, 'Kein Reiter steht zweimal in der Leiste');
const regeln = ['governance', 'govstruktur', 'prozesse', 'assets', 'risiken', 'abdeckung', 'ziele', 'massnahmen', 'kennzahlen', 'verwaltung', 'freigaben', 'ausnahmen', 'faelligkeit',
  'vorschlaege', 'ismsdocs', 'notfall', 'wirksamkeit', 'cockpit', 'compliance', 'handbuch', 'vorfaelle', 'einstellungen', 'meine', 'wissen', 'anleitung', 'dokumentation'];
ok(regeln.every(v => alle.includes(v)), 'Kein Reiter ist beim Umbau verloren gegangen');

// Die alten Gruppen sind weg.
ok(!/nav-grp-(richtlinien|governance|isms)\b/.test(html + access) && !/>Corporate Governance</.test(nav) && !/>IMS und Prozesse</.test(nav),
  'Die alten Gruppen (Regelwerk, Corporate Governance, IMS und Prozesse) gibt es nicht mehr');

// Jede Gruppe sagt mit einer Frage, wozu sie da ist.
ok(['planen', 'umsetzen', 'pruefen', 'anlass'].every(k => G(k).frage.length > 8 && /\?$/.test(G(k).frage)), 'Jede Phase stellt die Frage, die sie beantwortet');

/* ── 2) Dieselbe Ordnung wie die Karte ── */
const reiterThema = {};
R.RMS_THEMEN.forEach((t, i) => t.reiter.forEach(r => { reiterThema[r] = t; }));
const gesamt = R.RMS_PROZESSE.find(p => p.gesamt);
const kette = R.rmsKinder(gesamt).aufrufe;                        // Themen in der Reihenfolge des Jahreszyklus
const rang = (view) => kette.indexOf(reiterThema[view].haupt);
const planen = G('planen').reiter;
ok(planen.every((v, i) => i === 0 || rang(v) >= rang(planen[i - 1])), 'Die Reiter von Planen stehen in der Reihenfolge der Kette des Gesamtprozesses');
ok(['planen', 'umsetzen', 'pruefen'].slice(0, 3).every((k, i) => GK.GK_PHASEN[i].key === k && GK.GK_PHASEN[i].titel === G(k).titel),
  'Die ersten drei Gruppen heißen wie die Phasen der Karte');
ok(['governance', 'prozesse', 'assets', 'risiken', 'ziele'].every(v => reiterThema[v].phase === 'planen')
  && ['verwaltung', 'freigaben', 'notfall'].every(v => reiterThema[v].phase === 'umsetzen')
  && reiterThema.wirksamkeit.phase === 'pruefen' && reiterThema.vorfaelle.phase === 'anlass',
  'Wo ein Thema der Karte einer Gruppe zugeordnet ist, steht sein Reiter in derselben Phase');

/* ── 3) Das Cockpit ordnet genauso ── */
const ck = {};
const spec = /\{ key: '(\w+)',\s+titel: '([^']+)',\s+frage: '([^']+)',\s*\n\s*kacheln: \[([^\]]*)\] \}/g;
while ((m = spec.exec(cockpit))) ck[m[1]] = { titel: m[2], frage: m[3], kacheln: m[4].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean) };
ok(Object.keys(ck).join() === 'planen,umsetzen,pruefen,anlass', 'Das Cockpit kennt dieselben vier Phasen');
ok(Object.keys(ck).every(k => ck[k].titel === G(k).titel && ck[k].frage === G(k).frage), 'Mit denselben Namen und denselben Fragen wie die Leiste');

const kachel = {};
const tileRe = /^\s+(\w+):\s+\(\) => tile\('(\w+)',\s*'[^']*',\s*'[^']*',\s*'(\w+)'/gm;
while ((m = tileRe.exec(cockpit))) kachel[m[1]] = m[3];
const inPhasen = Object.values(ck).flatMap(p => p.kacheln);
ok(Object.keys(kachel).length === 17 && new Set(inPhasen).size === 17 && inPhasen.length === 17 && inPhasen.every(k => k in kachel), 'Jede der 17 Kacheln steht in genau einer Phase');
const phaseVonReiter = (v) => (gruppen.find(g => ['planen', 'umsetzen', 'pruefen', 'anlass'].includes(g.key) && g.reiter.includes(v)) || {}).key;
const abweichend = Object.entries(ck).flatMap(([ph, p]) => p.kacheln.filter(k => phaseVonReiter(kachel[k]) && phaseVonReiter(kachel[k]) !== ph));
ok(abweichend.length === 0, `Jede Kachel steht in der Phase ihres Reiters in der Leiste${abweichend.length ? ' (abweichend: ' + abweichend.join(', ') + ')' : ''}`);
ok(/CK_PHASEN\.map\(phase\)/.test(cockpit) && /\$\{nr \+ 1\} · \$\{ph\.titel\}/.test(cockpit), 'Das Cockpit zeigt die Phasen nummeriert, mit ihrer Frage');

/* ── 4) Wer was sieht ── */
ok(/show\('nav-grp-planen',\s+v\.governance \|\| v\.govstruktur \|\| v\.prozesse \|\| v\.assets \|\| v\.risiken \|\| v\.abdeckung \|\| v\.ziele \|\| v\.massnahmen \|\| v\.kennzahlen\)/.test(access),
  'Planen erscheint, sobald einer seiner Reiter sichtbar ist');
ok(/show\('nav-grp-umsetzen',\s+v\.verwaltung \|\| v\.freigaben \|\| v\.ausnahmen \|\| v\.faelligkeit \|\| v\.vorschlaege \|\| v\.ismsdocs \|\| v\.notfall\)/.test(access), 'Umsetzen ebenso');
ok(/show\('nav-grp-pruefen',\s+v\.wirksamkeit \|\| v\.cockpit \|\| v\.compliance \|\| v\.handbuch\)/.test(access), 'Prüfen und verbessern ebenso');
ok(/show\('nav-grp-anlass',\s+v\.vorfaelle\)/.test(access) && /show\('nav-grp-verwaltung',\s+admin\)/.test(access), 'Anlass mit den Vorfällen, Verwaltung nur für die Administration');
ok(/\.nav-frage\s*\{[^}]*display:\s*block/.test(lies('css/style.css')), 'Die Frage steht in gewöhnlicher Schrift unter dem Gruppennamen');

/* ── 5) Die Dokumentation sagt es ── */
const doku = lies('js/dokumentation.js');
ok(/Planen<\/b> \(was schützen wir, was kann schiefgehen\)/.test(doku) && /Gruppe „Prüfen und verbessern“\) leitet/.test(doku) && !/IMS und Prozesse/.test(doku),
  'Die Dokumentation beschreibt die vier Gruppen und nennt keine alte mehr');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
