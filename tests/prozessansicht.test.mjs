/**
 * Prozessansicht: Modelle lesen wie auf der Prozessseite der E-Rechnung.
 *
 * Bisher öffnete ein Klick auf ein Modell sofort den Modeler mit Palette, und
 * rechts stand unter „Hausschema" eine rote Textliste ohne Bezug zum Bild.
 * Jetzt gibt es eine Ansicht: farbiges Diagramm (Farbe = wer oder was
 * handelt), darunter links die Schritte, rechts was auffällt. Jeder Befund
 * kennt sein Element, ein Klick zeigt die Stelle, und im Diagramm trägt die
 * Stelle einen Rahmen und eine Plakette.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createRequire as _requireFuerHelfer } from 'module';
const { jsArg } = _requireFuerHelfer(import.meta.url)('../js/util.js');   // echter Helfer für Inline-Handler
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');
const STRICH = ' ' + String.fromCharCode(0x2013) + ' ';

const S = require(ROOT + '/js/prozessschema.js');

/* ── 1) Farbe je Baustein ── */
ok(S.prozessArt('userTask') === 'mensch' && S.prozessArt('serviceTask') === 'automatik' && S.prozessArt('manualTask') === 'handgriff',
  'Aufgaben: 👤 Mensch, ⚙ Automatik, ✋ Handgriff');
ok(S.prozessArt('bpmn:callActivity') === 'unter' && S.prozessArt('exclusiveGateway') === 'frage' && S.prozessArt('parallelGateway') === 'parallel',
  'Unterprozess, Entscheidung, Aufteilung (auch mit Präfix bpmn:)');
ok(S.prozessArt('endEvent', 'Antrag abgelehnt') === 'abbruch' && S.prozessArt('endEvent', 'Freigabe nicht erteilt') === 'abbruch'
  && S.prozessArt('endEvent', 'Bedarf gedeckt') === 'ende',
  'Ein Ergebnis, das niemand will, wird rot; ein gutes grün');
ok(S.prozessArt('endEvent', 'Fehler Nachbearbeitung') === 'abbruch' && S.prozessArt('endEvent', 'Fehlerfrei gebucht') === 'ende',
  '„Fehler" als eigenes Wort macht ein Ende rot, „Fehlerfrei" nicht');
ok(S.prozessArt('task') === 'ohne' && S.prozessArt('irgendwas') === '', 'Nackte Aufgabe hat eine eigene Art, Unbekanntes keine');
const A = S.PROZESS_ARTEN;
ok(Object.values(A).every(a => /^#[0-9A-F]{6}$/i.test(a.fill) && /^#[0-9A-F]{6}$/i.test(a.stroke) && a.titel && a.symbol),
  'Jede Art trägt Füllung, Rand, Titel und Symbol');
ok(A.mensch.stroke === '#C2410C' && A.automatik.stroke === '#17509E' && A.unter.stroke === '#5B3FA8' && A.abbruch.stroke === '#B42318',
  'Dieselben Farben wie auf der Prozessseite der E-Rechnung');

/* ── 2) Der Ablauf als Schrittliste ── */
const vorlage = S.prozessVorlageXml('Bestellung');
const xml = vorlage.xml || vorlage;
const a = S.prozessAblauf(xml);
ok(a.schritte[0].art === 'start' && a.schritte[0].nr === 1, 'Die Liste beginnt beim Auslöser');
const frage = a.schritte.find(s => s.art === 'frage');
ok(frage && frage.aus.length === 2 && frage.aus[0].label === 'ja' && frage.aus[1].label === 'nein', 'Entscheidung: erst ja, dann nein');
ok(frage.aus[0].nachNr === frage.nr + 1, 'Der Ja-Weg geht direkt mit dem nächsten Schritt weiter');
const erstesEnde = a.schritte.find(s => s.art === 'ende');
ok(frage.aus[1].nachNr > erstesEnde.nr, 'Der Nein-Zweig steht hinter dem Hauptweg: oben der Regelfall');
ok(a.uebergaben.length === a.zahlen.uebergaben && a.uebergaben.length > 0 && a.uebergaben.every(u => u.vonBahn !== u.nachBahn),
  'Eine Übergabe ist jeder Fluss, der die Bahn wechselt');
ok(a.schritte.some(s => s.uebergabeVon === 'Fachbereich'), 'Der Schritt nach der Übergabe weiß, wer abgegeben hat');
const z = a.zahlen;
ok(z.automatikQuote === Math.round(100 * z.automatik / (z.mensch + z.automatik + z.handgriff)), 'Die Automatikquote rechnet über 👤, ⚙ und ✋');
ok(a.schritte.every(s => !s.unerreichbar) && z.unerreichbar === 0, 'In der Vorlage ist jeder Schritt erreichbar');

const lose = `<bpmn:process id="P"><bpmn:laneSet><bpmn:lane id="L" name="Einkauf &amp; Logistik">
  <bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>X</bpmn:flowNodeRef><bpmn:flowNodeRef>E</bpmn:flowNodeRef>
  </bpmn:lane></bpmn:laneSet>
  <bpmn:startEvent id="S" name="Los"/><bpmn:userTask id="A" name="Ware &quot;prüfen&quot;"/>
  <bpmn:userTask id="X" name="Vergessen"/><bpmn:endEvent id="E" name="Fertig"/>
  <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A"/><bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="E"/></bpmn:process>`;
const b = S.prozessAblauf(lose);
ok(b.schritte.map(s => s.id).join() === 'S,A,E,X', 'Was vom Auslöser aus nicht erreichbar ist, hängt hinten an');
ok(b.schritte[3].unerreichbar && !b.schritte[1].unerreichbar && b.zahlen.unerreichbar === 1, '… und ist markiert');
ok(b.schritte[1].name === 'Ware "prüfen"' && b.schritte[1].bahn === 'Einkauf & Logistik', 'Entitäten werden wieder zu Zeichen');
ok(S.prozessAblauf('').schritte.length === 0, 'Ein leeres Modell ergibt eine leere Liste, keinen Absturz');

const schleife = `<bpmn:process id="P"><bpmn:startEvent id="S"/><bpmn:userTask id="A" name="Prüfen"/>
  <bpmn:exclusiveGateway id="G" name="In Ordnung?"/><bpmn:endEvent id="E" name="Fertig"/>
  <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A"/><bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="G"/>
  <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="A" name="nein"/><bpmn:sequenceFlow id="F4" sourceRef="G" targetRef="E" name="ja"/></bpmn:process>`;
const c = S.prozessAblauf(schleife);
ok(c.schritte.map(s => s.id).join() === 'S,A,G,E', 'Eine Schleife zurück hängt nicht, und der Ja-Weg kommt zuerst');
ok(c.schritte[2].aus[1].label === 'nein' && c.schritte[2].aus[1].nachNr === 2, 'Der Rücksprung zeigt auf seine Nummer');

/* ── 3) Jeder Befund kennt sein Element ── */
const schlecht = `<bpmn:process id="P"><bpmn:laneSet><bpmn:lane id="L1" name="Anna Muster"><bpmn:flowNodeRef>T</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
  <bpmn:startEvent id="S"/><bpmn:startEvent id="S2"/><bpmn:task id="T" name="Rechnungspruefung"/>
  <bpmn:scriptTask id="Sc" name="Daten laden"/><bpmn:callActivity id="C" name="Prüfung"/><bpmn:subProcess id="U" name="Nacharbeit"/>
  <bpmn:exclusiveGateway id="G" name="ok"/><bpmn:endEvent id="E"/>
  <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="G"/>
  <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="E"/></bpmn:process>`;
const r = S.prozessSchemaPruefen(schlecht, { policyIds: [] });
ok(r.fehler.length > 5 && r.fehler.every(f => f.id), 'Jeder Verstoß nennt das Element, an dem er hängt');
ok(r.fehler.some(f => f.regel === 'R6' && f.id === 'F3'), 'Ein unbeschrifteter Ausgang zeigt auf den Fluss selbst, nicht auf die Raute');
ok(r.fehler.some(f => f.regel === 'R10' && f.id === 'C'), 'Eine ⊞ ohne Modell zeigt auf die Aufrufaktivität');
ok(r.hinweise.some(f => f.regel === 'R5' && f.id === 'L1'), 'Ein Personenname zeigt auf die Bahn');
ok(r.hinweise.find(f => f.regel === 'R9').id === '', 'Die fehlende Richtlinie hängt an keinem Element');
const texte = r.fehler.concat(r.hinweise).map(f => f.text)
  .concat(S.PROZESS_REGELN.flatMap(x => [x.text, x.warum]), S.PROZESS_BAUSTEINE.flatMap(x => [x.zweck, x.benennung, x.titel]));
ok(texte.every(t => !String(t).includes(STRICH)), 'Befunde, Regeln und Bausteine lesen sich ohne Gedankenstrich');
ok(r.fehler.some(f => f.regel === 'R6' && /hat nur einen Ausgang\. Sie braucht mindestens zwei\./.test(f.text)),
  'Kein „Ausgang/Ausgänge" mehr, sondern ein ganzer Satz');

/* ── 3b) Weniger Fehlalarme, lesbare Namen ── */
const fein = `<bpmn:process id="P"><bpmn:laneSet>
  <bpmn:lane id="L1" name="Power Automate"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane>
  <bpmn:lane id="L2" name="Anna Muster"><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
  <bpmn:startEvent id="S"/><bpmn:userTask id="A" name="Rechnung in ER_&#60;Werk&#62; &#38; Archiv ablegen (manuell)"/>
  <bpmn:userTask id="B" name="Pruefung"/><bpmn:endEvent id="E" name="Fertig"/>
  <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A"/><bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="B"/>
  <bpmn:sequenceFlow id="F3" sourceRef="B" targetRef="E"/></bpmn:process>`;
const rf = S.prozessSchemaPruefen(fein, { policyIds: ['1'] });
ok(!rf.hinweise.some(f => f.regel === 'R5' && f.id === 'L1') && rf.hinweise.some(f => f.regel === 'R5' && f.id === 'L2'),
  'R5: „Power Automate" ist ein System, „Anna Muster" bleibt ein Hinweis');
ok(!rf.hinweise.some(f => f.regel === 'R8' && f.id === 'A') && rf.hinweise.some(f => f.regel === 'R8' && f.id === 'B'),
  'R8: Ein Klammerzusatz am Ende zählt nicht, „Pruefung" bleibt ein Hinweis');
ok(S.prozessAblauf(fein).schritte[1].name === 'Rechnung in ER_<Werk> & Archiv ablegen (manuell)',
  'Zahlen-Entitäten, wie bpmn-js sie schreibt (&#38; &#60; &#62;), werden zu Zeichen');
ok(rf.hinweise.find(f => f.id === 'B').name === 'Pruefung' && rf.hinweise.find(f => f.id === 'L2').name === 'Anna Muster',
  'Jeder Befund trägt den Namen seiner Stelle');
const ohneLabel = S.prozessSchemaPruefen(schlecht, { policyIds: [] }).fehler.find(f => f.id === 'F3');
ok(ohneLabel && ohneLabel.name === 'Ausgang von „ok"', 'Ein unbeschrifteter Fluss heißt nach seiner Quelle');

/* ── 4) Die Teile der Seite, gerendert ── */
const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Number, Map, Set, Promise, RegExp,
  esc, toast: () => {}, fmtDate: () => '', canWriteTab: () => true, openDetail: () => {},
  State: { user: { name: 'T' }, policies: [{ id: '7', title: 'Beschaffungsrichtlinie' }] },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem: () => {} },
};
ctx.window = ctx; ctx.globalThis = ctx;
ctx.jsArg ??= jsArg; vm.createContext(ctx);
vm.runInContext(lies('js/prozessschema.js'), ctx);
vm.runInContext(lies('js/prozesse.js'), ctx);
const run = (code, extra) => vm.runInContext(code, Object.assign(ctx, extra || {}));

const befunde = run('_procBefundeHtml(__r, {})', { __r: r });
ok(/<span class="pa-chip t-err">\d+ Verstöße<\/span>/.test(befunde) && /<span class="pa-chip t-warn">\d+ Hinweise?<\/span>/.test(befunde),
  'Kopf rechts: Zahl der Verstöße und Hinweise als farbige Chips');
ok(/<tr class="pa-klick" data-befund="F3" onclick="procStelleZeigen\(&quot;F3&quot;\)"/.test(befunde), 'Jede Zeile mit Element springt beim Klick dorthin');
ok(/<span class="pa-chip t-err">Verstoß<\/span>/.test(befunde) && /<span class="pa-chip t-warn">Hinweis<\/span>/.test(befunde),
  'Links in der Zeile die Einstufung, wie in der Regeltabelle der E-Rechnung');
ok(/class="pa-warum"/.test(befunde) && /Verstöße nicht/.test(befunde), 'Mit der Begründung der Regel und dem Satz, was übergangen werden darf');
ok(!befunde.includes(STRICH), 'Ohne Gedankenstrich');
ok(!/pa-warum/.test(run('_procBefundeHtml(__r, { kompakt: true })')), 'Im Editor kompakt, ohne Begründungen');
const viele = { fehler: [], hinweise: ['T1', 'T2', 'T3', 'T4'].map(id => ({ regel: 'R8', id, name: 'Aufgabe ' + id, text: 'x' }))
  .concat([{ regel: 'R5', id: 'L9', name: 'Anna Muster', text: 'y' }]) };
const gebuendelt = run('_procBefundeHtml(__v, {})', { __v: viele });
ok((gebuendelt.match(/<tr/g) || []).length === 2 && /<b>4 Stellen:<\/b>/.test(gebuendelt),
  'Ab drei Befunden einer Regel eine Zeile mit den Stellen, statt viermal derselbe Satz');
ok(/data-befund="T3"[^>]*onclick="procStelleZeigen\(&quot;T3&quot;\)"[^>]*>Aufgabe T3</.test(gebuendelt), 'Jede Stelle im Bündel ist ein Chip, der ins Diagramm springt');
ok(/<tr class="pa-klick" data-befund="L9"/.test(gebuendelt), 'Einzelne Befunde bleiben eigene Zeilen');
const r9 = run('_procBefundeHtml(__r9, {})', { __r9: { fehler: [], hinweise: S.prozessSchemaPruefen(xml, { policyIds: [] }).hinweise.filter(f => f.regel === 'R9') } });
ok((r9.match(/Gewohnheit, keine Vorgabe/g) || []).length === 1, 'Steht die Begründung schon im Befund, erscheint sie nicht ein zweites Mal');
ok(/✓ Hausschema erfüllt/.test(run('_procBefundeHtml({ fehler: [], hinweise: [] }, {})')), 'Ohne Befund: ein grüner Chip');

const schritte = run('_procSchritteHtml(__a, null)', { __a: a });
ok((schritte.match(/<li data-schritt=/g) || []).length === a.schritte.length, 'Links jeder Schritt eine Zeile');
ok(/weiter mit \d+ \(Direkt bei Rahmenvertrag bestellen\)/.test(schritte), 'Der Nein-Zweig nennt Nummer und Ziel');
ok(/↪ Übergabe von Fachbereich/.test(schritte), 'Die Übergabe steht am Schritt, der übernimmt');
ok(/<span class="pa-chip pa-rolle">Einkauf<\/span>/.test(schritte) && /background:#C2410C/.test(schritte),
  'Rolle als Chip, Nummernkreis in der Farbe der Art');
const mitBefund = run('_procSchritteHtml(__b, __r)', { __b: S.prozessAblauf(schlecht) });
ok(/<span class="pa-chip t-err" title="Befund im Hausschema">⚠ R3/.test(mitBefund), 'Ein Schritt mit Befund trägt ihn als Chip');

const schrauben = run('_procStellschraubenHtml(__a)');
ok(/\d+ Übergaben/.test(schrauben) && /% automatisch/.test(schrauben) && /Entscheidung/.test(schrauben),
  'Stellschrauben: Übergaben, Automatikquote, Entscheidungen');
ok(/onclick="procStelleZeigen\(&quot;Flow_\d+&quot;\)"/.test(schrauben), 'Jede Übergabe zeigt ihren Fluss im Diagramm');
ok(new RegExp(`<b>${z.schritte}</b> Schritte`).test(run('_procKennzahlenHtml(__a)')), 'Kennzahlen über dem Diagramm');

ok(/^Beginnt mit „Bedarf gemeldet"/.test(run('_procLead(__x, __a)', { __x: xml })) && /Beteiligt: /.test(run('_procLead(__x, __a)')),
  'Ohne Beschreibung im Modell schreibt die Ansicht den Satz selbst');
const mitDoku = xml.replace(/(<bpmn:process\b[^>]*>)/, '$1\n    <bpmn:documentation>Beschafft Material.\nIm Einklang mit den Richtlinien: X\n[[rms:policies=7]]</bpmn:documentation>');
ok(run('_procLead(__x, __a)', { __x: mitDoku }) === 'Beschafft Material.', 'Steht eine Beschreibung drin, gilt sie; Marker und Verweiszeilen fallen weg');

const chips = run("_procChipsHtml({ ordner: '' }, ['7'], [{ name: 'Merkblatt.pdf', url: 'https://sp/m' }])");
ok(/📘 Beschaffungsrichtlinie/.test(chips) && /openDetail\(&quot;7&quot;\)/.test(chips) && /href="https:\/\/sp\/m"/.test(chips),
  'Kopf: Richtlinie zum Anklicken, Anlage als Link');
ok(/keine Richtlinie verknüpft/.test(run("_procChipsHtml({ ordner: '' }, [], [])")), 'Ohne Richtlinie: gelber Chip');

ok(/hängt an keiner Kachel/.test(run("_procNotfallHtml('m1')")), 'Ohne Landkarte: der Hinweis, dass BIA und Notfallplan fehlen');
run(`var _lkDaten = { karten: { SHB: { kacheln: [{ name: 'Einkauf', __m: [{ itemId: 'm1' }],
       bcm: { kritikalitaet: 'hoch', rto: 8, plan: { sofort: 'Anrufen' } } }] } } };
     function lkProzesseVon(k) { return k.__m || []; } function nfBcmVon(k) { return k.bcm; }
     function nfDauerText(h) { return h + ' h'; } function lkWerkLabel(w) { return w; }`);
const nf = run("_procNotfallHtml('m1')");
ok(/Kritikalität hoch/.test(nf) && /RTO 8 h/.test(nf) && /Notfallplan vorhanden/.test(nf) && /switchView\('notfall'\)/.test(nf),
  'Mit Kachel: Kritikalität, RTO und Plan, ein Klick führt in den Reiter Notfall');

/* ── 5) Verdrahtung ── */
const pjs = lies('js/prozesse.js');
ok(/onclick="openProcessAnsicht\(\$\{jsArg\(p\.itemId\)\}\)"/.test(pjs), 'Ein Klick auf die Karte öffnet die Ansicht, nicht mehr den Editor');
ok(/onclick="openProcessEditor\(\$\{jsArg\(itemId\)\}\)"[\s\S]{0,60}✎ Bearbeiten/.test(pjs), 'In der Ansicht führt „✎ Bearbeiten" in den Editor');
ok(/onclick="procZurAnsicht\(\)"/.test(pjs), '… und „👁 Ansicht" wieder zurück');
ok(/'element\.dblclick'\]\s*\.forEach\(ev => bus\.on\(ev, 10000, \(\) => false\)\)/.test(pjs) && /'shape\.move\.start'/.test(pjs),
  'Die Ansicht ist gesperrt: nichts verschieben, verbinden oder umbenennen');
const datei = pjs.slice(pjs.indexOf('function _procAnsichtDatei'), pjs.indexOf('function _procSvgFaerben'));
ok(datei.includes('_procAnsichtXml') && !datei.includes('_setProcessDoku'),
  'Der BPMN-Download der Ansicht gibt die Datei unverändert heraus und löscht keine Verknüpfungen');
ok(/_procSvgFaerben\(svg\)/.test(pjs), 'Das Bild der Ansicht trägt die Farben in sich (für Word und PowerPoint)');
ok(/await \(_procAnsicht \? openProcessAnsicht\(itemId\) : openProcessEditor\(itemId\)\)/.test(pjs), 'Im Unterprozess liest weiter, wer liest');
ok(/_procNachpruefenBald\(\); \}\);/.test(pjs) && /_procBefundeMarkieren\(r\);/.test(pjs), 'Im Editor: Befunde live nachgeprüft und im Diagramm markiert');
ok(/openProcessAnsicht\(\$\{jsArg\(m\.itemId\)\}\)">Öffnen/.test(lies('js/landkarte.js')), 'Landkarte: „Öffnen" zeigt die Ansicht');
const vjs = lies('js/verknuepfungen.js');
ok((vjs.match(/openProcessAnsicht\(/g) || []).length === 3 && !/openProcessEditor/.test(vjs), 'Verknüpfungen: jeder Link auf ein Modell zeigt die Ansicht');
ok(!/\bdu\b|\bdein/i.test(pjs.slice(pjs.indexOf('/* ── Die Ansicht: lesen statt bauen'), pjs.indexOf('/* ── Hausschema im Editor'))),
  'Die Ansicht siezt wie der Rest der App');

const css = lies('css/style.css');
ok(/#proc-ansicht \.djs-palette, #proc-ansicht \.djs-context-pad/.test(css), 'In der Ansicht keine Palette und kein Kontextmenü');
ok(/\.pa-unten \{ display: grid; grid-template-columns: 1\.35fr 1fr;/.test(css), 'Unten zwei Spalten: Schritte links, was auffällt rechts');
ok(/\.djs-element\.pa-fehler > \.djs-visual > :first-child \{ stroke: #B42318 !important/.test(css), 'Ein Verstoß bekommt im Diagramm einen roten Rahmen');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
