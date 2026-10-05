/**
 * BPMN einfach erklärt
 *
 * Eine Anleitung veraltet leise. Diese Suite hält sie am Werkzeug fest:
 *
 *   • Die Beispiele gehen durch den echten Generator und die echte Prüfung.
 *     Das Einstiegsbeispiel muss ohne Befund durchgehen, sonst lernt jemand
 *     aus dem ersten Beispiel einen Fehler.
 *   • Jeder Knopf, den die Anleitung nennt, steht wirklich so in der
 *     Oberfläche. Wird einer umbenannt, wird dieser Test rot statt die Anleitung
 *     falsch.
 *   • Die Tastenkürzel, die sie verspricht, gibt es im Editor wirklich: Die
 *     Tastatur ist an den Modeler gebunden, und zwar nur dort, wo sie nicht
 *     stört.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* Im Browser kommt esc aus dem Kern. */
globalThis.esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const S = require(ROOT + '/js/prozessschema.js');
const H = require(ROOT + '/js/bpmnhilfe.js');

const pruefe = (text) => S.prozessSchemaPruefen(
  S.prozessXmlBauen({ name: 'Beispiel', schritte: S.prozessTextLesen(text) }).xml, { policyIds: ['42'] });

/* ── 1) Die Beispiele bestehen, was sie versprechen ── */
const einstieg = pruefe(H.BPMN_BEISPIEL_EINSTIEG);
const befunde = einstieg.fehler.concat(einstieg.hinweise).map(f => f.regel);
ok(befunde.length === 0,
  'Das Einstiegsbeispiel geht ohne einen einzigen Befund durch' + (befunde.length ? ' (gefunden: ' + befunde.join(', ') + ')' : ''));
ok(einstieg.zahlen.bahnen === 3 && einstieg.zahlen.mensch === 3,
  'und hat, wie beschrieben, drei Bahnen mit drei 👤-Aufgaben');

const tiefe = pruefe(H.BPMN_BEISPIEL_VERTIEFUNG);
ok(tiefe.fehler.length === 1 && tiefe.fehler[0].regel === 'R10' && tiefe.hinweise.length === 0,
  'Das Vertiefungsbeispiel meldet genau R10, wie die Anleitung sagt');
ok(tiefe.zahlen.automatik >= 1 && tiefe.zahlen.handgriff >= 1 && tiefe.zahlen.unterprozesse === 1,
  'und zeigt ⚙, ✋ und ⊞');

/* ── 2) Die Anleitung nennt jede Regel, die die Prüfung kennt ── */
const tiefeHtml = H.bpmnVertiefungHtml();
const fehlendeRegeln = S.PROZESS_REGELN.map(r => r.id).filter(id => !tiefeHtml.includes(`>${id}<`));
ok(fehlendeRegeln.length === 0,
  'Die Tabelle „Wenn die Prüfung etwas meldet" deckt alle Regeln ab' + (fehlendeRegeln.length ? ' (fehlt: ' + fehlendeRegeln.join(', ') + ')' : ''));

/* ── 3) Jeder genannte Knopf steht so in der Oberfläche ── */
const ui = ['js/prozesse.js', 'js/landkarte.js'].map(lies).join('\n');
const einstiegHtml = H.bpmnEinstiegHtml();
const knoepfe = [
  '📋 Modelle', '✨ Aus Richtlinie', 'Text auslesen →', 'BPMN-Entwurf erzeugen →', '💾 Speichern',
  '🔍 Schema', 'Unterprozess – ein Modell einbinden', 'Übergang zu einem anderen Prozess',
  'Dokumente an diesem Schritt', 'Verknüpfte Richtlinien', 'als neues Modell anlegen', 'Hausschema',
];
for (const k of knoepfe) {
  const genannt = einstiegHtml.includes(k) || tiefeHtml.includes(k);
  ok(genannt && ui.includes(k), `„${k}" steht in der Anleitung und in der Oberfläche`);
}
ok(ui.includes('onclick="prozessHilfeOeffnen()"') && ui.includes('❓ Hilfe'),
  'Der Modeler trägt den Knopf „❓ Hilfe", der die Anleitung öffnet');

/* ── 4) Die Kürzel gibt es wirklich ── */
const proz = lies('js/prozesse.js');
const erzeugt = [...proz.matchAll(/new BpmnJS\(([^)]*)\)/g)].map(m => m[1]);
ok(erzeugt.filter(a => /keyboard:\s*\{\s*bindTo:\s*document\s*\}/.test(a)).length === 1,
  'Der Editor bindet die Tastatur, sonst wirkte nicht einmal Strg+Z');
ok(erzeugt.length === 2 && erzeugt.filter(a => !/keyboard/.test(a)).length === 1,
  'Die Ansicht bleibt ohne Tastatur, sie ist zum Lesen da');
ok(/on\('keyboard\.keydown',\s*\d+,\s*\(\)\s*=>\s*\(_procTastaturAktiv\(\)/.test(proz),
  'Jedes Kürzel geht durch die Sperre');

/* Die Sperre selbst: nur im sichtbaren Editor, nie unter einem Dialog. */
const quelle = proz.slice(proz.indexOf('function _procTastaturAktiv'));
const fn = quelle.slice(0, quelle.indexOf('\n}\n') + 2);
const lage = { aktiv: true, editor: true, dialog: false };
const ctx = {
  document: {
    getElementById: (id) => id === 'view-prozesse' ? { classList: { contains: () => lage.aktiv } }
      : id === 'proc-editor' ? (lage.editor ? {} : null) : null,
    querySelector: (sel) => sel === '.modal-overlay' && lage.dialog ? {} : null,
  },
};
vm.createContext(ctx);
vm.runInContext(fn + '\nthis.f = _procTastaturAktiv;', ctx);
ok(ctx.f() === true, 'Im offenen Editor wirken die Kürzel');
lage.dialog = true;  ok(ctx.f() === false, 'Unter einem Dialog nicht, dort gehört Entf dem Dialog');
lage.dialog = false; lage.aktiv = false;
ok(ctx.f() === false, 'Und in einem anderen Reiter nicht, sonst löschte Entf unsichtbar im Diagramm');
lage.aktiv = true; lage.editor = false;
ok(ctx.f() === false, 'Auch nicht in Landkarte oder Liste desselben Reiters');

/* ── 5) Erreichbar ── */
const modul = lies('js/module.js');
for (const gruppe of ['prozesse', 'notfall', 'dokumentation']) {
  const zeile = (modul.match(new RegExp(`^\\s*${gruppe}:.*$`, 'm')) || [''])[0];
  ok(/'bpmnhilfe'/.test(zeile), `Die Ansicht „${gruppe}" lädt die Hilfe`);
}
const doku = lies('js/dokumentation.js');
ok(/\['bpmn',\s*'BPMN einfach erklärt'\]/.test(doku) && /^\s{4}sec\('bpmn'/m.test(doku),
  'Die Dokumentation führt den Abschnitt im Inhaltsverzeichnis');
ok(/ansicht === 'dokumentation'/.test(lies('js/app.js')) && /abschnitt=bpmn/.test(lies('js/bpmnhilfe.js')),
  'Der Link aus dem Modeler springt direkt in den Abschnitt');
ok(!/Aus Text erzeugen/.test(doku), 'Den Knopf „✨ Aus Text erzeugen" gibt es nicht, die Doku nennt ihn auch nicht mehr');

/* ── 6) Schreibweise: keine Gedankenstriche zwischen Sätzen ──
   Ausnahme ist ein Knopf, der selbst einen trägt; den zitiert die Anleitung wörtlich. */
const texte = lies('js/bpmnhilfe.js').split('„Unterprozess – ein Modell einbinden"').join('');
const striche = (texte.match(/\s[–—]\s/g) || []).length;
ok(striche === 0, `Keine Gedankenstriche in der Anleitung (${striche} gefunden)`);

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
