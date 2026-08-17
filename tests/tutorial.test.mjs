/**
 * Geführter Rundgang: Schrittfolge, Navigation, durchgehendes Beispiel
 * und die Zusicherung, dass nichts an echten Daten passiert.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const ctx = { console, esc, __modal: '', openModal: (h) => { ctx.__modal = h; }, closeModal: () => {} };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/tutorial.js', 'utf8'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* ── 1) Schrittfolge ── */
run('globalThis.__s = _tutSchritte();');
const schritte = ctx.__s;
ok(schritte.length === 9, `Neun Schritte (ist ${schritte.length})`);
ok(schritte.every(s => s.titel && s.body), 'Jeder Schritt hat Titel und Inhalt');

const titel = schritte.map(s => s.titel).join(' | ');
for (const [nr, wort] of [[1, 'Konzept'], [2, 'Entwurf'], [3, 'Konformitätsprüfung'], [4, 'Mitbestimmung'], [5, 'Freigabe'], [6, 'Veröffentlichung'], [7, 'Nachweis']])
  ok(new RegExp(`${nr} · [^|]*${wort}`).test(titel), `Schritt ${nr} behandelt ${wort}`);

/* ── 2) Reihenfolge entspricht dem echten Workflow ── */
const pos = (w) => titel.indexOf(w);
ok(pos('Konzept') < pos('Entwurf'), 'Konzept kommt vor dem Entwurf');
ok(pos('Konformitätsprüfung') < pos('Mitbestimmung'), 'Prüfung vor Mitbestimmung');
ok(pos('Mitbestimmung') < pos('Freigabe'), 'Mitbestimmung vor Freigabe');
ok(pos('Freigabe') < pos('Veröffentlichung'), 'Freigabe vor Veröffentlichung');

/* ── 3) Durchgehendes Beispiel ── */
const alle = schritte.map(s => s.body).join('\n');
const beispiel = vm.runInContext('TUT_BEISPIEL', ctx);
const treffer = schritte.filter(s => s.body.includes(beispiel.titel)).length;
ok(treffer >= 5, `Das Beispiel „${beispiel.titel}" zieht sich durch (${treffer} Schritte)`);
ok(alle.includes(beispiel.typ) && alle.includes(beispiel.geltung), 'Typ und Geltungsbereich des Beispiels kommen vor');

/* ── 4) Fachlich korrekte Aussagen ── */
ok(/Begründung/.test(alle), 'Begründungspflicht wird erwähnt');
ok(/Betriebsrat|Betriebsräte|Konzernbetriebsrat/.test(alle), 'Betriebsrat wird erwähnt');
ok(/Betriebsvereinbarung/.test(alle), 'Betriebsvereinbarung wird erwähnt (Grund für den stufenweisen Rollout)');
ok(/ISO 27001/.test(alle) && /NIS2/.test(alle), 'ISO 27001 und NIS2 werden genannt');
ok(/Wissenstest/.test(alle) && /Wiederholung/.test(alle), 'Wissenstest und Wiederholungspflicht kommen vor');
ok(/Änderungshistorie/.test(alle), 'Die Änderungshistorie wird gezeigt');

/* ── 5) Navigation ── */
run('startTutorial(0);');
ok(ctx.__modal.includes('1 / 9'), 'Start zeigt Schritt 1 von 9');
ok(!ctx.__modal.includes('← Zurück'), 'Im ersten Schritt kein „Zurück"');
ok(ctx.__modal.includes('Weiter →'), 'Im ersten Schritt „Weiter"');

run('tutorialNext(); tutorialNext();');
ok(ctx.__modal.includes('3 / 9'), 'Zweimal Weiter führt zu Schritt 3');
ok(ctx.__modal.includes('← Zurück') && ctx.__modal.includes('Weiter →'), 'In der Mitte beide Schaltflächen');

run('tutorialPrev();');
ok(ctx.__modal.includes('2 / 9'), 'Zurück führt zu Schritt 2');

run('startTutorial(8);');
ok(ctx.__modal.includes('9 / 9') && ctx.__modal.includes('Fertig'), 'Letzter Schritt endet mit „Fertig"');
ok(!ctx.__modal.includes('Weiter →'), 'Im letzten Schritt kein „Weiter"');

/* Grenzen abfangen */
run('tutorialNext(); globalThis.__ende = _tutSchritt;');
ok(ctx.__ende === 8, 'Weiter am Ende bleibt beim letzten Schritt');
run('startTutorial(0); tutorialPrev(); globalThis.__anf = _tutSchritt;');
ok(ctx.__anf === 0, 'Zurück am Anfang bleibt beim ersten Schritt');
run('startTutorial(99); globalThis.__max = _tutSchritt; startTutorial(-5); globalThis.__min = _tutSchritt;');
ok(ctx.__max === 8 && ctx.__min === 0, 'Ungültige Schrittnummern werden begrenzt');

/* Sprungpunkte */
run('startTutorial(0);');
ok((ctx.__modal.match(/onclick="startTutorial\(\d\)"/g) || []).length === 9, 'Neun Sprungpunkte zum direkten Anspringen');

/* ── 6) Der Rundgang fasst keine echten Daten an ── */
const src = fs.readFileSync(ROOT + '/js/tutorial.js', 'utf8');
for (const verboten of ['spSavePolicy', 'spDeletePolicy', 'spSendMail', 'reloadData', 'State.policies', 'State.konzepte'])
  ok(!src.includes(verboten), `Kein Zugriff auf ${verboten}`);
ok(/keine Daten angelegt oder geändert/.test(alle), 'Der Rundgang sagt selbst, dass nichts verändert wird');

/* ── 7) Einstieg in der Anleitung ── */
const anl = fs.readFileSync(ROOT + '/js/anleitung.js', 'utf8');
ok(/onclick="startTutorial\(0\)"/.test(anl), 'Anleitung hat den Startknopf');
ok(/Rundgang starten/.test(anl), 'Der Knopf heißt „Rundgang starten"');
const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
const reihen = [...html.matchAll(/<script src="js\/([a-z-]+)\.js/g)].map(m => m[1]);
ok(reihen.includes('tutorial'), 'tutorial.js ist eingebunden');
ok(reihen.indexOf('tutorial') < reihen.indexOf('anleitung'), 'tutorial.js lädt vor anleitung.js');

/* ── 8) Eigenständige Seite rundgang.html ──
   Notfall-Ebene für Vorführungen: läuft ohne Anmeldung, ohne SharePoint und offline. */
const rg = fs.readFileSync(ROOT + '/rundgang.html', 'utf8');
ok(/<script src="js\/tutorial\.js"/.test(rg), 'rundgang.html bindet js/tutorial.js ein');
ok(/href="css\/style\.css"/.test(rg), 'rundgang.html nutzt dasselbe Stylesheet');
ok(/onclick="startTutorial\(0\)"/.test(rg), 'rundgang.html hat den Startknopf');
ok(/id="modal-mount"/.test(rg), 'rundgang.html hat den Einhängepunkt für den Dialog');
for (const shim of ['function esc(', 'function openModal(', 'function closeModal('])
  ok(rg.includes(shim), `rundgang.html bringt ${shim.replace('function ', '').replace('(', '()')} selbst mit`);
ok(rg.indexOf('function openModal(') < rg.indexOf('src="js/tutorial.js"'),
  'Die Ersatzteile stehen vor tutorial.js');
for (const abhaengig of ['msal', 'graph.microsoft.com', 'js/sharepoint.js', 'js/app.js'])
  ok(!rg.includes(abhaengig), `rundgang.html braucht kein ${abhaengig}`);

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
