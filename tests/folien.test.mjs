/**
 * Folien: der gemeinsame Rahmen (js/folien.js) und die Schulung als Präsentation
 *
 * Die Vorstellung im Notfall-Reiter und die Präsentation einer Schulung in der
 * Bibliothek zeigen ihre Folien im selben Rahmen. Eine Schulung wird zu einer
 * Titelfolie, einer Folie je Modul und dem Hinweis auf den Wissenstest.
 * Schaubilder stehen mit [[schaubild:…]] mitten im Text, auch auf Folien.
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

globalThis.jsArg = require(ROOT + '/js/util.js').jsArg;
const W = require(ROOT + '/js/wissenmodell.js');
const S = require(ROOT + '/js/schaubild.js');

/* ── 1) Schaubilder im Text ── */
const t = W.wiTextHtml('Vorher\n[[schaubild:risikokurve]]\nNachher');
ok(/<p>Vorher<\/p><div class="sb-bild" data-schaubild="risikokurve"><\/div><p>Nachher<\/p>/.test(t), 'Eine Zeile [[schaubild:…]] wird ein Platzhalter mitten im Text');
ok(!/data-schaubild/.test(W.wiTextHtml('[[schaubild:<b>x</b>]]')) && !/data-schaubild/.test(W.wiTextHtml('Text [[schaubild:bereiche]] im Satz')), 'Nur eine eigene Zeile mit einem einfachen Namen, sonst bleibt es Text');

/* ── 2) Die Schulung als Folien ── */
const kurs = W.wiNormalisieren({ beitraege: [{ id: 'k', art: 'kurs', titel: 'ISMS <und> Organisation', kurz: 'Wer wofür sorgt.', dauer: 20, quelle: 'Vorlesung',
  module: [{ id: 'm1', titel: 'Was wir schützen', text: '- **Vertraulichkeit:** nur wer es braucht' }, { id: 'm2', titel: 'Wie viel Risiko', text: '[[schaubild:risikokurve]]' }],
  fragen: [{ frage: 'F?', optionen: ['a', 'b'], richtig: 0 }] }] }).beitraege[0];
const f = W.wiFolienHtml(kurs);
ok((f.match(/<section class="vs-folie/g) || []).length === 4, 'Titel, je Modul eine Folie, der Wissenstest: vier Folien');
ok(/<h1>ISMS &lt;und&gt; Organisation<\/h1>/.test(f) && /2 Module · ca\. 20 Minuten · Quelle: Vorlesung/.test(f), 'Die Titelfolie nennt Module, Dauer und Quelle, alles entschärft');
ok(/vs-modulnr">01 \/ 02</.test(f) && /<h2>Was wir schützen<\/h2><div class="vs-inhalt"><ul><li><b>Vertraulichkeit:<\/b>/.test(f), 'Je Modul: Nummer, Titel, der Text in .vs-inhalt');
ok(/data-schaubild="risikokurve"/.test(f) && /1 Fragen zu „ISMS &lt;und&gt; Organisation“/.test(f), 'Das Schaubild steht auf der Folie, zum Schluss der Hinweis auf den Test');
ok((W.wiFolienHtml(Object.assign({}, kurs, { fragen: [] })).match(/vs-folie/g) || []).length === 3, 'Ohne Test keine Testfolie');

/* ── 3) Platzhalter füllen ── */
const feld = { a: 'bereiche', innerHTML: '', isConnected: true, getAttribute() { return this.a; } };
await S.sbEinbetten({ querySelectorAll: () => [feld] }, { klick: false });
ok(/^<svg class="sb-svg"/.test(feld.innerHTML) && /Mit Zugriff auf das Assetregister/.test(feld.innerHTML), 'Ohne Leserecht steht das Bild ohne Zahlen im Platzhalter');
await S.sbEinbetten(null);
ok(true, 'Ohne Bereich passiert nichts');

/* ── 4) Der Rahmen ── */
const fl = lies('js/folien.js');
ok(/function folienOeffnen\(folienHtml, opt\)/.test(fl) && /\['ArrowRight', 'PageDown', ' '\]/.test(fl) && /e\.key === 'Escape'\) folienSchliessen\(\)/.test(fl), 'Blättern mit Pfeil und Leertaste, Escape schließt');
ok(/document\.querySelector\('#modal-mount \.modal'\)\) return;/.test(fl), 'Liegt ein Dialog darüber, blättert die Tastatur nicht');
ok(/Math\.max\(0\.6, platz \/ hoehe\)/.test(fl) && /forEach\(f => folienEinpassen\(f\)\)/.test(fl), 'Zu viel Inhalt wird kleiner, höchstens auf 60 %, im Druck jede Folie');
const vs = lies('js/vorstellung.js');
ok(/folienOeffnen\(vsFolien\(vsDaten\(\)\)/.test(vs) && /label: 'Vorstellung', nr,/.test(vs) && !/addEventListener\('keydown'/.test(vs), 'Die Vorstellung nutzt denselben Rahmen und bleibt nach dem Speichern auf ihrer Folie');
ok(/onclick="vsAngabenBearbeiten\(\)">Angaben ergänzen/.test(vs), 'Ihr Knopf „Angaben ergänzen“ steht weiter in der Leiste');

/* ── 5) In der Bibliothek ── */
const wi = lies('js/wissen.js');
ok(/typeof folienOeffnen === 'function' && b\.module\.length \? `<button[^`]*wiPraesentieren/.test(wi) && /▶ Präsentieren<\/button>/.test(wi), 'Jede Schulung mit Modulen hat „Präsentieren“');
ok(/folienOeffnen\(wiFolienHtml\(b\), \{ label: 'Präsentation', nr \}\)/.test(wi) && /sbEinbetten\(buehne, \{ klick: false \}\)/.test(wi), 'Die Präsentation beginnt beim offenen Modul, Schaubilder ohne Sprung ins Register');
ok(/if \(typeof sbEinbetten === 'function'\) sbEinbetten\(mount\);/.test(wi), 'Auch Artikel und Module zeigen eingebettete Schaubilder');
ok(/placeholder="falls die Schulung auf einer Vorlage beruht"/.test(wi) && /Quelle: \$\{esc\(b\.quelle\)\}/.test(wi), 'Eine Schulung hat eine Quelle, die Übersicht zeigt sie');
const mod = lies('js/module.js');
ok(/'folien', 'vorstellung', 'mindmapbaum'/.test(mod) && /notfall:\s+MODUL_ADMIN\.concat\(\['folien', /.test(mod) && /wissen:\s+\['wissenmodell', 'schaubild', 'folien', 'wissen'\]/.test(mod), 'Der Rahmen lädt vor der Vorstellung und mit der Bibliothek');
const css = lies('css/style.css');
ok(/\.vs-inhalt \.wi-box\b/.test(css) && /\.vs-inhalt \.sb-svg \{ max-height: 560px; \}/.test(css) && /\.vs-titel \.vs-fuss\b/.test(css), 'Modultext und Schaubild haben Folienschrift und -größe');
ok(/<b>▶ Präsentieren:<\/b>/.test(lies('js/dokumentation.js')) && /\[\[schaubild:bereiche\]\]/.test(lies('js/dokumentation.js')), 'Die Dokumentation erklärt Präsentieren und eingebettete Schaubilder');
ok(!/localStorage|sessionStorage/.test(fl) && !/Fedorov|Lissitsa|DIHAG|Dihag/.test(fl), 'Nichts im Browserspeicher, keine Namen im Code');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
