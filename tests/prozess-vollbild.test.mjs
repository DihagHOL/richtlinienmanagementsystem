/**
 * Vollbild für den Prozess-Editor
 *
 * Der Editor zeichnet in die Ansicht, also innerhalb von Seitenleiste und
 * Kopfzeile. Ein Ablauf läuft waagerecht – die Breite ist das Knappe. Gemessen
 * im Browser bei 1440 × 900: **909 × 630** in der Ansicht gegen **1412 × 838**
 * im Vollbild ohne die Angabenspalte. Gut das Doppelte an Fläche.
 *
 * Vollbild heißt hier zweierlei, und beides zusammen: Der Editor legt sich über
 * die Anwendung (das wirkt immer), und zusätzlich wird die echte
 * Vollbild-Schnittstelle des Browsers gefragt (die darf ablehnen). Wer nur
 * eines baut, hat entweder die Browser-Leisten noch im Bild oder gar nichts.
 *
 * **Die Falle, die hier festgehalten ist:** Die Maße des Editors standen als
 * Inline-Stile im Markup. Eine Angabe am Element schlägt jede Regel aus dem
 * Stylesheet, gleich wie spezifisch – `align-items:flex-start` blieb also
 * stehen, die Kinder streckten sich nicht, und die Höhe der Zeichenfläche fiel
 * im Vollbild auf **2 px** zusammen. Statt überall `!important` daneben-
 * zuschreiben, stehen die Maße jetzt im Stylesheet. Der Test unten hält fest,
 * dass sie dort bleiben.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const js = lies('js/prozesse.js');
const css = lies('css/style.css');

/* ── 1) Kein Inline-Stil an den Elementen, die das Vollbild umstellt ──
   Das ist der eigentliche Befund dieses Tests. */
for (const id of ['proc-arbeit', 'proc-buehne', 'bpmn-canvas', 'proc-seite']) {
  const m = new RegExp(`id="${id}"([^>]*)>`).exec(js);
  ok(m && !/style="/.test(m[1]),
    `#${id} trägt keinen Inline-Stil – der schlüge sonst jede Vollbild-Regel`);
}
for (const regel of ['#proc-arbeit', '#proc-buehne', '#bpmn-canvas', '#proc-seite']) {
  ok(new RegExp('\\' + regel + '\\s*\\{').test(css), `${regel} bekommt seine Maße aus dem Stylesheet`);
}

/* ── 2) Die Vollbild-Regeln ── */
ok(/\.proc-voll\s*\{[^}]*position:\s*fixed/.test(css), 'Die Überlagerung liegt fest über der Anwendung …');
ok(/\.proc-voll\s*\{[^}]*inset:\s*0/.test(css), '… und füllt sie ganz aus');
ok(/\.proc-voll\s*\{[^}]*z-index/.test(css), 'Über Seitenleiste und Kopfzeile, nicht darunter');
ok(/\.proc-voll #proc-arbeit\s*\{[^}]*min-height:\s*0/.test(css),
  '`min-height:0` an der Arbeitsfläche – ohne sie wächst ein Flex-Kind über seinen Behälter, statt zu schrumpfen');
ok(/\.proc-voll #proc-arbeit\s*\{[^}]*flex-wrap:\s*nowrap/.test(css),
  'Und kein Umbruch: Im Vollbild sollen Diagramm und Angaben nebeneinander bleiben');
ok(/\.proc-voll #bpmn-canvas\s*\{[^}]*height:\s*auto/.test(css),
  'Die feste Höhe von 70vh weicht der freien Fläche');
ok(/\.proc-voll #proc-seite\s*\{[^}]*overflow:\s*auto/.test(css),
  'Die Angabenspalte scrollt für sich – sonst schöbe sie die Seite auf');
ok(/@media print[^}]*\.proc-voll/.test(css) || /\.proc-voll\s*\{[^}]*\}[\s\S]*@media print/.test(css),
  'Beim Drucken ist die Überlagerung aufgehoben');

/* ── 3) Die Bedienung ── */
ok(/onclick="prozessVollbildUmschalten\(\)"/.test(js), 'Ein Knopf schaltet um');
ok(/onclick="prozessSeiteUmschalten\(\)"/.test(js), 'Und einer blendet die Angaben aus');
ok(/id="proc-voll-btn"/.test(js) && /id="proc-seite-btn"/.test(js),
  'Beide sind ansprechbar – ihre Beschriftung wechselt mit dem Zustand');
ok(/⤡ Vollbild beenden/.test(js), 'Im Vollbild sagt der Knopf, wie man wieder herauskommt');

/* ── 4) Die Zeichenfläche wird nachgeführt ──
   bpmn-js merkt eine Größenänderung seines Behälters nicht von selbst. */
ok(/canvas\.resized\(\)/.test(js),
  'Nach dem Umschalten wird bpmn-js über die neue Größe unterrichtet …');
ok(/if \(einpassen\) canvas\.zoom\('fit-viewport'\)/.test(js), '… und das Diagramm neu eingepasst');
ok(/requestAnimationFrame/.test(js),
  'Erst im nächsten Bildaufbau – vorher steht die neue Größe noch nicht fest');
ok((js.match(/_procBuehneNeu\(/g) || []).length >= 3,
  'Jeder Weg, der die Größe ändert, führt sie nach');

/* ── 5) Die echte Vollbild-Schnittstelle darf scheitern ── */
ok(/requestFullscreen/.test(js) && /exitFullscreen/.test(js), 'Der Browser wird um echtes Vollbild gebeten');
ok(/catch \(e\) \{ \/\* dann eben nur die Überlagerung \*\//.test(js),
  'Lehnt er ab, trägt die Überlagerung allein – kein Abbruch');
ok(/addEventListener\('fullscreenchange'/.test(js),
  'Beendet Esc das Vollbild des Browsers, folgt die Überlagerung nach …');
ok(/e\.key === 'Escape' && _procVoll && !document\.fullscreenElement/.test(js),
  '… und Esc wirkt auch dann, wenn es gar kein echtes Vollbild gab');

/* ── 6) Der Zustand überdauert ── */
ok(/localStorage\.setItem/.test(js) && /PROC_VOLL_SPEICHER/.test(js),
  'Wer im Vollbild arbeitet, fängt dort wieder an');
ok(/catch \(e\) \{ \/\* Privatmodus \*\/ \}/.test(js),
  'Im privaten Fenster wirft der Speicher – das darf den Editor nicht aufhalten');
ok(/prozessSeiteUmschalten\(ziel \? false : _procGemerkt/.test(js),
  'Im Vollbild fahren die Angaben ein; zurück in der Ansicht steht wieder, was zuletzt gewollt war');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
