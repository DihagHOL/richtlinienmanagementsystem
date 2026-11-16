/**
 * Die Schulung „Abläufe beschreiben mit BPMN" im Reiter Wissen.
 *
 * Sie ist die vorhandene Anleitung als Schulung: „BPMN einfach erklärt"
 * (js/bpmnhilfe.js, Stufe 1 und 2) und die Word-Anleitung. Freiwillig, sechs
 * Module, ein Wissenstest, Teilnahmebescheinigung wie jede Schulung.
 *
 * Geprüft wird vor allem, dass sie nicht auseinanderläuft: Die Beispiele
 * stehen in der Schulung als Kopie, weil der Reiter Wissen js/bpmnhilfe.js
 * nicht lädt. Sie müssen Zeichen für Zeichen den Beispielen dort gleichen,
 * die tests/bpmnhilfe gegen das Hausschema prüft. Ebenso die Zeichen, die
 * Regeln R1 bis R10 und die Knöpfe, die die Schulung nennt.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

globalThis.esc = (s) => String(s ?? '');
const M = require(ROOT + '/js/wissenmodell.js');
const H = require(ROOT + '/js/bpmnhilfe.js');

/* ── 1) Die Schulung als Beitrag ── */
const K = M.wiNormalisieren({ beitraege: [M.WI_KURS_BPMN] }).beitraege[0];
ok(K.art === 'kurs' && K.thema === 'prozesse' && K.titel === 'Abläufe beschreiben mit BPMN', 'Eine Schulung im Thema „Prozesse & BPMN", benannt wie die Word-Anleitung');
ok(K.pflicht === false && K.wiederholung === 0, 'Freiwillig und ohne Auffrischung – erst einmal');
ok(K.module.length === 6 && K.fragen.length === 10 && K.ziele.length === 5 && K.dauer === 30 && K.bestehen === 80,
  'Sechs Module, zehn Fragen, fünf Lernziele, 30 Minuten, bestanden ab 80 %');
ok(M.wiBeitragFehler(K).length === 0, 'Sie besteht die Prüfung, die jede Schulung beim Speichern besteht');
ok(K.module.map(m => m.titel).join('|') === 'Worum es geht|Ein Diagramm lesen|Einen Ablauf aufschreiben|Vom Text zum Modell im RMS|Größere Abläufe|Wenn die Prüfung etwas meldet',
  'Die Module in der Reihenfolge der Anleitung: lesen, schreiben, ins RMS, vertiefen, prüfen');
ok(new Set(K.module.map(m => m.id)).size === 6, 'Jedes Modul hat seine eigene Kennung – daran hängt der Fortschritt');

/* ── 2) Im Startbestand, gleich hinter der Phishing-Schulung ── */
const ids = M.WI_STARTBESTAND.beitraege.map(b => b.id);
ok(ids[0] === 'start-phishing-kurs' && ids[1] === 'start-bpmn-kurs', 'Beide Schulungen stehen vorn im Startbestand');
const thema = M.WI_STARTBESTAND.themen.find(t => t.id === 'prozesse');
ok(thema && thema.titel === 'Prozesse & BPMN' && thema.bereich === 'Qualität & Umwelt' && M.WI_BEREICHE.includes(thema.bereich),
  'Ein eigenes Thema im Bereich „Qualität & Umwelt"');
const vorhanden = M.wiNormalisieren({ themen: [{ id: 'phishing', titel: 'Phishing' }], beitraege: M.WI_STARTBESTAND.beitraege.filter(b => b.id !== 'start-bpmn-kurs') });
ok(M.wiStartbestandErgaenzen(vorhanden, 'Max Muster', '2026-10-07T12:00:00Z') === 1 && M.wiBeitrag(vorhanden, 'start-bpmn-kurs'),
  'Wer den Startbestand schon hat, bekommt mit „📋 Startbestand" genau die neue Schulung dazu');
ok(M.wiBeitrag(vorhanden, 'start-bpmn-kurs').pflicht === false && M.wiBeitrag(vorhanden, 'start-bpmn-kurs').erstelltVon === 'Max Muster', '… freiwillig, mit dem Namen dessen, der sie angelegt hat');

/* Eine Bibliothek, aus der Beiträge des Startbestands bewusst gelöscht wurden:
   Angelegt wird nur, was angekreuzt ist, samt dem Thema, das es braucht. */
const ausgeduennt = M.wiNormalisieren({ themen: [{ id: 'phishing', titel: 'Phishing' }], beitraege: [M.WI_KURS_PHISHING] });
const fehlend = M.wiStartbestandFehlend(ausgeduennt).map(b => b.id);
ok(fehlend.length === M.WI_STARTBESTAND.beitraege.length - 1 && fehlend.includes('start-bpmn-kurs') && !fehlend.includes('start-phishing-kurs'),
  'Fehlend ist, was es nach Kennung nicht gibt');
ok(M.wiStartbestandErgaenzen(ausgeduennt, 'Max Muster', '2026-10-07T12:00:00Z', ['start-bpmn-kurs']) === 1
  && ausgeduennt.beitraege.length === 2 && ausgeduennt.themen.map(t => t.id).sort().join() === 'phishing,prozesse',
  'Nur die angekreuzte Schulung kommt dazu, mit ihrem Thema; Gelöschtes und fremde Themen bleiben draußen');

/* ── 3) Gleich mit der Doku: Beispiele, Zeichen, Regeln ── */
const code = (txt) => [...txt.matchAll(/:::code\n([\s\S]*?)\n:::/g)].map(m => m[1]);
ok(code(K.module[2].text)[0] === H.BPMN_BEISPIEL_EINSTIEG, 'Das Beispiel „Urlaubsantrag" gleicht dem geprüften aus „BPMN einfach erklärt"');
ok(code(K.module[4].text)[0] === H.BPMN_BEISPIEL_VERTIEFUNG, 'Das Beispiel „Reklamation" ebenso');
const zeichenFehlen = H.BPMN_ZEICHEN.filter(z => !K.module[1].text.includes('**' + z.zeichen + ':**') || !K.module[1].text.includes(z.bedeutung));
ok(!zeichenFehlen.length, 'Die sechs Zeichen mit derselben Bedeutung wie in der Anleitung' + (zeichenFehlen.length ? ': ' + zeichenFehlen.map(z => z.zeichen).join(', ') : ''));
const mehrFehlen = H.BPMN_ZEICHEN_MEHR.filter(z => !K.module[4].text.includes('**' + z.zeichen + ':**') || !K.module[4].text.includes(z.wofuer));
ok(!mehrFehlen.length, 'Die vier weiteren Bausteine ebenso' + (mehrFehlen.length ? ': ' + mehrFehlen.map(z => z.zeichen).join(', ') : ''));
const vertiefung = H.bpmnVertiefungHtml();
const regeln = Array.from({ length: 10 }, (_, i) => 'R' + (i + 1));
ok(regeln.every(r => new RegExp('^!! ' + r + ' ', 'm').test(K.module[5].text) && vertiefung.includes('>' + r + '<')),
  'R1 bis R10: jede Regel der Prüfung hat ihre Karte in Modul 6');

/* Was die Schulung als Knopf oder Feld nennt, gibt es so im RMS. */
const prozesse = lies('js/prozesse.js');
const genannt = ['✨ Aus Richtlinie', 'Text auslesen →', 'BPMN-Entwurf erzeugen →', '🔍 Schema', '❓ Hilfe', 'Verknüpfte Richtlinien', 'Unterprozess: ein Modell einbinden', '📋 Modelle'];
const fehlt = genannt.filter(g => !prozesse.includes(g));
ok(!fehlt.length, 'Jeder genannte Knopf steht wörtlich im Reiter Prozesse' + (fehlt.length ? ': ' + fehlt.join(', ') : ''));
ok(K.module.every(m => !/Unterprozess [–—-] ein Modell einbinden/.test(m.text)) && K.module.some(m => m.text.includes('„Unterprozess: ein Modell einbinden"')),
  'Den Kasten im Modeler nennt sie mit seinem echten Namen');

/* ── 4) Der Wissenstest ── */
const richtig = K.fragen.map(q => q.richtig);
ok(K.fragen.every(q => q.optionen.length === 3 && new Set(q.optionen).size === 3), 'Jede Frage hat drei verschiedene Antworten');
ok([0, 1, 2].every(i => richtig.filter(r => r === i).length >= 3), 'Die richtige Antwort steht mal oben, mal in der Mitte, mal unten');
ok(K.fragen.find(q => /Bahn richtig/.test(q.frage)).optionen[K.fragen.find(q => /Bahn richtig/.test(q.frage)).richtig] === 'Einkauf', 'Rollen statt Namen');
ok(K.fragen.find(q => /R9/.test(q.frage)).optionen[K.fragen.find(q => /R9/.test(q.frage)).richtig].includes('Regelwerk'), 'R9 heißt: kein Regelwerk verknüpft');
const entscheidung = K.fragen.find(q => /Entscheidung/.test(q.frage));
ok(entscheidung.optionen[entscheidung.richtig] === 'Führungskraft: Antrag freigeben? | nein: Antrag zurückgeben', 'Die Entscheidung in der Schreibweise des Spickzettels');

/* ── 5) Darstellung: Zeilen zum Abtippen ── */
const m3 = M.wiTextHtml(K.module[2].text);
ok(/<pre class="wi-code">Start: Urlaubsantrag gestellt\nMitarbeitende: Antrag im Portal erfassen\nFührungskraft: Urlaub genehmigen\? \| nein: Ablehnung mitteilen/.test(m3),
  'Das Beispiel steht Zeile für Zeile in Schreibmaschinenschrift, nichts wird formatiert');
ok(/<code class="wi-code-inline">\| nein:<\/code>/.test(m3) && /<code class="wi-code-inline">&lt;<\/code>/.test(m3), 'Schreibweisen mitten im Satz, entschärft');
ok(M.wiTextHtml(':::code\n<b>**x**</b>\n  eingerückt\n:::\nDanach') === '<pre class="wi-code">&lt;b&gt;**x**&lt;/b&gt;\n  eingerückt</pre><p>Danach</p>',
  'Im Codeblock bleibt alles, wie es ist: kein Fett, Einrückung erhalten, Tags entschärft');
ok(M.wiTextHtml(':::code\nohne Ende') === '<pre class="wi-code">ohne Ende</pre>', 'Ein vergessenes ::: verschluckt nichts');
ok(M.wiTextHtml('a `b` **c**') === '<p>a <code class="wi-code-inline">b</code> <b>c</b></p>', 'Schreibweise und Fett nebeneinander');
const m6 = M.wiTextHtml(K.module[5].text);
ok((m6.match(/<div class="wi-signal">/g) || []).length === 10 && /<b>R10 Eine ⊞ bindet nichts ein<\/b>/.test(m6), 'Zehn Regeln als Karten mit Titel');
const css = lies('css/style.css');
ok(/\.wi-code\s*\{[^}]*white-space:\s*pre/.test(css) && /\.wi-code-inline\s*\{/.test(css), 'Der Codeblock hat seinen Stil und bricht keine Zeile um');

/* ── 6) Doku ── */
const doku = lies('js/dokumentation.js');
ok(/Abläufe beschreiben mit BPMN/.test(doku) && /:::code … :::/.test(doku), 'Die Dokumentation nennt die Schulung und die neue Schreibweise');
ok(!/legt sechs Themen/.test(doku) && !/Sechs Themen mit je einem Artikel/.test(lies('js/wissen.js')), 'Keine veraltete Zahl beim Startbestand');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
