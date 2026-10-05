'use strict';

/**
 * BPMN einfach erklärt
 * ====================
 * Die Anleitung in zwei Stufen: der Einstieg für alle, die zum ersten Mal einen
 * Ablauf aufschreiben, die Vertiefung für alle, die selbst zeichnen.
 *
 * Der Einstieg steht an zwei Stellen: in der Dokumentation und hinter
 * „❓ Hilfe" im Modeler, wo die Frage entsteht. Er wohnt deshalb hier und nicht
 * in der Dokumentation, denn die lädt der Reiter „Prozesse" nicht.
 *
 * Die Beispiele sind Eingaben für den Generator, keine Prosa. Der Test
 * tests/bpmnhilfe baut aus ihnen ein Modell und prüft es gegen das Hausschema.
 * Ändert sich das Schema, fällt ein veraltetes Beispiel dort auf und nicht erst
 * bei jemandem, der es abschreibt.
 *
 * Die Tabellen tragen ihre Stile selbst: Im Modeler-Dialog gibt es die Klassen
 * der Dokumentation nicht.
 */

/* Besteht die Hausschema-Prüfung ohne einen einzigen Befund. */
const BPMN_BEISPIEL_EINSTIEG = `Start: Urlaubsantrag gestellt
Mitarbeitende: Antrag im Portal erfassen
Führungskraft: Urlaub genehmigen? | nein: Ablehnung mitteilen
Personal: Urlaub im Zeitkonto eintragen
Ende: Urlaub genehmigt`;

/* Zeigt jeden Baustein, den ein Text zeigen kann. Die Prüfung meldet genau R10,
   bis im Modeler das eingebundene Modell gewählt ist. Das ist gewollt. */
const BPMN_BEISPIEL_VERTIEFUNG = `Start: Reklamation geht ein
Vertrieb: Reklamation erfassen
System: Eingang bestätigen (automatisch)
Qualität: Muster prüfen (manuell)
Qualität: Mangel berechtigt? | nein: Kunden informieren
Qualität: Ursache analysieren (Unterprozess)
Warten: Stellungnahme des Lieferanten
Vertrieb: Gutschrift erstellen
Ende: Reklamation erledigt`;

/* Am Modeler geprüft (bpmn-js 17). Sie wirken, solange kein Eingabefeld den
   Cursor hat und kein Dialog offen ist. */
const BPMN_KUERZEL = [
  ['Strg+Z', 'Rückgängig'],
  ['Strg+Y', 'Wiederherstellen'],
  ['Entf', 'Markiertes löschen'],
  ['E', 'Beschriftung des markierten Elements ändern'],
  ['R', 'Art ändern, etwa einen Kasten zu 👤, ⚙ oder ✋ machen'],
  ['Strg+C, Strg+V', 'Kopieren und einfügen'],
  ['Strg+A', 'Alles markieren'],
  ['Strg+F', 'Ein Element im Diagramm suchen'],
  ['H, L, S, C', 'Werkzeuge: Hand (Fläche schieben), Lasso (mehrere markieren), Platz schaffen, Verbinden'],
  ['Mausrad', 'Fläche schieben, mit gedrückter Strg-Taste zoomen'],
];

/* Die Word-Fassung für alle ohne RMS (js/bpmnanleitung.js). Ihr Knopf steht im
   Modeler-Dialog und in der Dokumentation, mit demselben Wortlaut. */
const BPMN_ANLEITUNG_KNOPF = '📄 Word-Anleitung zum Weitergeben';
const BPMN_ANLEITUNG_KNOPF_TITEL = 'Beide Stufen als Word-Datei, ohne die Schritte im RMS. Für Kolleginnen und Kollegen, die einen Ablauf beschreiben sollen, aber nicht im RMS arbeiten.';

/* Die sechs Zeichen des Einstiegs. `art` ist der Schlüssel aus PROZESS_ARTEN;
   danach zeichnet die Word-Fassung (js/bpmnanleitung.js) ihr Bild. */
const BPMN_ZEICHEN = [
  { art: 'start',     zeichen: '○ Auslöser',     bedeutung: 'Womit es losgeht. Ein Ereignis, kein Tun. Dünner Kreis.', beispiel: 'Antrag geht ein' },
  { art: 'mensch',    zeichen: '👤 Aufgabe',     bedeutung: 'Ein Mensch tut etwas.', beispiel: 'Antrag prüfen' },
  { art: 'automatik', zeichen: '⚙ Automatik',    bedeutung: 'Das System tut etwas von selbst: Mail, Workflow, Schnittstelle.', beispiel: 'Bestätigung versenden' },
  { art: 'frage',     zeichen: '◇ Entscheidung', bedeutung: 'Eine Frage. Genau ein Weg geht weiter. Raute.', beispiel: 'Betrag über 5.000 €?' },
  { art: 'ende',      zeichen: '◎ Ergebnis',     bedeutung: 'Wie die Sache ausgeht. Mehrere Ergebnisse sind normal. Dicker Kreis.', beispiel: 'Antrag genehmigt' },
  { art: 'bahn',      zeichen: '▭ Bahn',         bedeutung: 'Wer zuständig ist. Immer eine Rolle, nie ein Name.', beispiel: 'Einkauf' },
];

/* Die vier Bausteine der Vertiefung. `text` ist die Schreibweise im Text,
   leer, wo es keine gibt. */
const BPMN_ZEICHEN_MEHR = [
  { art: 'handgriff', zeichen: '✋ Handgriff',    wofuer: 'Arbeit außerhalb jeder Anwendung: Werkstatt, Papier, Telefon.', text: '… (manuell)' },
  { art: 'warten',    zeichen: '⏱ Warten',       wofuer: 'Der Prozess ruht, bis eine Frist abläuft oder eine Nachricht kommt.', text: 'Warten: …' },
  { art: 'parallel',  zeichen: '✛ Aufteilung',   wofuer: 'Zwei Wege laufen gleichzeitig und treffen sich wieder.', text: '' },
  { art: 'unter',     zeichen: '⊞ Unterprozess', wofuer: 'Ein eigener Prozess, der hier im Ganzen läuft. Einmal modelliert, überall eingebunden.', text: '… (Unterprozess)' },
];

/* Ein Text des Modelers, so wie er ihn zeigt. Er kommt aus derselben Tabelle
   wie die Oberfläche (js/bpmndeutsch.js), die Anleitung kann ihn also nicht
   anders nennen als der Modeler. */
const _bpmnUi = (englisch) =>
  '„' + esc(typeof bpmnUebersetzen === 'function' ? bpmnUebersetzen(englisch) : englisch) + '"';

function _bpmnStil() {
  return {
    p:    'margin:0 0 8px;line-height:1.55',
    li:   'margin:0 0 7px;line-height:1.55',
    ol:   'padding-left:20px;margin:6px 0 10px',
    h3:   'margin:20px 0 6px;font-size:1rem;font-weight:800',
    h4:   'margin:14px 0 6px;font-size:.92rem;font-weight:700',
    hint: 'margin:10px 0;font-size:.85rem;color:var(--c-muted,#6b7280);background:var(--c-bg,#f8fafc);border-left:3px solid var(--c-primary,#17509e);padding:8px 12px;border-radius:0 8px 8px 0;line-height:1.5',
    pre:  'background:var(--c-bg,#f8fafc);border:1px solid var(--c-border,#e5e7eb);border-radius:8px;padding:10px 12px;overflow:auto;font-size:.84rem;line-height:1.6;margin:6px 0 10px;white-space:pre',
  };
}

/** Tabelle mit Kopfzeile; die erste Spalte ist der Begriff. Zellen sind fertiges HTML.
 *  Auf dem Handy wird die Tabelle in ihrem Rahmen gescrollt, die Seite bleibt stehen. */
function _bpmnTabelle(kopf, zeilen) {
  const td = 'border:1px solid var(--c-border,#e5e7eb);padding:6px 10px;vertical-align:top;line-height:1.5';
  const th = td + ';background:var(--c-bg,#f8fafc);text-align:left;font-size:.8rem';
  const breit = kopf && kopf.length > 3 ? 'min-width:560px;' : '';
  return `<div style="overflow-x:auto;margin:6px 0 10px">
    <table style="${breit}width:100%;border-collapse:collapse;font-size:.86rem">
    ${kopf ? `<thead><tr>${kopf.map(k => `<th style="${th}">${k}</th>`).join('')}</tr></thead>` : ''}
    <tbody>${zeilen.map(z => `<tr>${z.map((c, i) =>
      `<td style="${td}${i === 0 ? ';font-weight:600;min-width:7em' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

const _bpmnCode = (s) => `<code style="background:var(--c-bg,#f8fafc);border:1px solid var(--c-border,#e5e7eb);border-radius:4px;padding:0 4px;white-space:nowrap">${esc(s)}</code>`;

/* ═══════════════════════════════════════════════════
   Stufe 1: der Einstieg
═══════════════════════════════════════════════════ */

function bpmnEinstiegHtml() {
  const s = _bpmnStil();
  return `
    <p style="${s.p}">BPMN ist eine Zeichensprache für Abläufe. Ein BPMN-Diagramm liest jede und jeder gleich: wo es losgeht, wer was tut, wo entschieden wird und wie die Sache ausgeht. Für den Anfang reichen sechs Zeichen und eine Schreibweise, die Sie aus jeder Notiz kennen.</p>

    <div style="${s.h3}">Stufe 1: In fünf Minuten zum ersten Prozess</div>

    <div style="${s.h4}">Die sechs Zeichen</div>
    ${_bpmnTabelle(['Zeichen', 'Bedeutung', 'Beispiel'],
      BPMN_ZEICHEN.map(z => [esc(z.zeichen), esc(z.bedeutung), '„' + esc(z.beispiel) + '"']))}
    <p style="${s.p}"><b>So liest man ein Diagramm:</b> Von links nach rechts läuft die Zeit, von oben nach unten stehen die Zuständigen. Die Pfeile geben die Reihenfolge vor. Wo ein Pfeil die Bahn wechselt, wird Arbeit übergeben, und an genau diesen Stellen bleibt im Alltag am meisten liegen. In der Ansicht eines Modells sind die Zeichen farbig: orange tut ein Mensch, blau läuft automatisch, gold ist eine Entscheidung, grün sind Anfang und gutes Ende.</p>

    <div style="${s.h4}">Schreiben statt zeichnen</div>
    <p style="${s.p}">Zeichnen müssen Sie nicht. Schreiben Sie den Ablauf Zeile für Zeile auf, das RMS baut daraus das Diagramm mit Bahnen und den richtigen Zeichen. Vier Regeln genügen:</p>
    <ol style="${s.ol}">
      <li style="${s.li}">Eine Zeile ist ein Schritt. Vorne steht die Rolle, dann ein Doppelpunkt, dann die Tätigkeit: ${_bpmnCode('Einkauf: Angebote einholen')}.</li>
      <li style="${s.li}">Die Tätigkeit endet auf einem Verb: „Antrag prüfen", nicht „Antragsprüfung".</li>
      <li style="${s.li}">Eine Entscheidung ist eine Frage mit Fragezeichen. Was im Nein-Fall zu tun ist, steht dahinter nach ${_bpmnCode('| nein:')}.</li>
      <li style="${s.li}">Die erste Zeile beginnt mit ${_bpmnCode('Start:')}, die letzte mit ${_bpmnCode('Ende:')}.</li>
    </ol>
    <pre style="${s.pre}">${esc(BPMN_BEISPIEL_EINSTIEG)}</pre>
    <p style="${s.p}">Daraus entsteht ein Diagramm mit drei Bahnen (Mitarbeitende, Führungskraft, Personal), einer Entscheidung und zwei Ergebnissen. Lautet die Antwort nein, wird die Ablehnung mitgeteilt und der Vorgang endet mit „Beendet". Die Prüfung gegen das Hausschema findet an diesem Beispiel nichts.</p>

    <div style="${s.h4}">So kommt der Text ins RMS</div>
    <ol style="${s.ol}">
      <li style="${s.li}">Reiter <b>„Prozesse"</b> öffnen und oben die Ansicht <b>„📋 Modelle"</b> wählen.</li>
      <li style="${s.li}"><b>„✨ Aus Richtlinie"</b> klicken, das Regelwerk wählen, das der Ablauf umsetzt, und <b>„Text auslesen →"</b>.</li>
      <li style="${s.li}">Im Textfeld steht nun der Text des Regelwerks (oder nichts, wenn kein Word-Dokument verknüpft ist). Ersetzen Sie ihn durch Ihre Zeilen.</li>
      <li style="${s.li}"><b>„BPMN-Entwurf erzeugen →"</b>. Der Modeler öffnet sich mit dem fertigen Diagramm, das Regelwerk ist schon verknüpft.</li>
      <li style="${s.li}">Rechts den <b>Prozessnamen</b> prüfen, unter <b>Ablage</b> das Werk wählen und oben <b>„💾 Speichern"</b>.</li>
    </ol>
    <div style="${s.hint}">💡 Das Regelwerk wählen Sie nicht aus Förmlichkeit. Ein Ablauf ohne Regelwerk ist Gewohnheit, keine Vorgabe (Regel R9), und auf diesem Weg ist die Verknüpfung gleich erledigt.</div>

    <div style="${s.h4}">Kleine Korrekturen im Modeler</div>
    <p style="${s.p}">Das erzeugte Diagramm ist ein Entwurf. Fünf Handgriffe reichen, um es anzupassen:</p>
    ${_bpmnTabelle(null, [
      ['Element anklicken', 'Daneben erscheinen kleine Symbole. Damit hängen Sie den nächsten Schritt direkt an oder verbinden zwei Elemente.'],
      ['Doppelklick oder E', 'Beschriftung ändern.'],
      ['🔧 oder R', `Die Art ändern. Aus einem leeren Kasten wird so 👤 ${_bpmnUi('User task')}, ⚙ ${_bpmnUi('Service task')} oder ✋ ${_bpmnUi('Manual task')}.`],
      ['🗑 oder Entf', 'Löschen.'],
      ['Strg+Z', 'Rückgängig. Strg+Y stellt wieder her.'],
    ])}
    <div style="${s.hint}">💡 Bleiben Sie mit der Maus kurz über einem Symbol stehen, dann sagt der Modeler, was es tut.</div>

    <div style="${s.h4}">Fertig ist ein Prozess, wenn</div>
    <ul style="${s.ol}">
      <li style="${s.li}">es genau einen Auslöser gibt,</li>
      <li style="${s.li}">jedes Ergebnis einen Namen hat,</li>
      <li style="${s.li}">jeder Kasten 👤, ⚙ oder ✋ trägt,</li>
      <li style="${s.li}">jeder Kasten in einer Bahn liegt und jede Bahn nach einer Rolle heißt,</li>
      <li style="${s.li}">jede Raute eine Frage ist und ihre Ausgänge beschriftet sind,</li>
      <li style="${s.li}">ein Regelwerk verknüpft ist.</li>
    </ul>
    <p style="${s.p}">Genau das prüft <b>„🔍 Schema"</b> oben im Modeler, und still nach jeder Änderung. Ein roter Rahmen ist ein Verstoß, ein gestrichelter ein Hinweis. Ein Klick auf den Befund rechts unter „Hausschema" zeigt die Stelle.</p>`;
}

/* ═══════════════════════════════════════════════════
   Stufe 2: die Vertiefung
═══════════════════════════════════════════════════ */

function bpmnVertiefungHtml() {
  const s = _bpmnStil();
  return `
    <div style="${s.h3}">Stufe 2: Selbst zeichnen und größere Abläufe</div>
    <p style="${s.p}">Wer selbst zeichnet oder einen größeren Ablauf abbildet, braucht vier weitere Bausteine, die Palette und ein paar Muster. Alle zehn Bausteine mit ihren Regeln stehen im Abschnitt „Prozesse niederschreiben (Hausschema)".</p>

    <div style="${s.h4}">Die vier weiteren Bausteine</div>
    ${_bpmnTabelle(['Baustein', 'Wofür', 'Im Text', 'Im Modeler'], BPMN_ZEICHEN_MEHR.map(z => [
      esc(z.zeichen), esc(z.wofuer), z.text ? _bpmnCode(z.text) : 'geht nur im Modeler', {
        handgriff: `🔧 und ${_bpmnUi('Manual task')}`,
        warten:    `Palette ${_bpmnUi('Create intermediate/boundary event')}, dann 🔧 und ${_bpmnUi('Timer intermediate catch event')} oder ${_bpmnUi('Message intermediate catch event')}`,
        parallel:  `Raute setzen, dann 🔧 und ${_bpmnUi('Parallel gateway')}`,
        unter:     'Aufgabe anklicken, rechts unter „Unterprozess – ein Modell einbinden" das Modell wählen',
      }[z.art]]))}
    <p style="${s.p}">Ein Text, der alles zeigt, was ein Text zeigen kann:</p>
    <pre style="${s.pre}">${esc(BPMN_BEISPIEL_VERTIEFUNG)}</pre>
    <p style="${s.p}">Bahnen namens <b>System</b>, <b>Automatik</b>, <b>Workflow</b> oder <b>Cron</b> gelten ohnehin als ⚙. Nach dem Erzeugen meldet die Prüfung genau einen Befund, <b>R10</b>: Die ⊞ „Ursache analysieren" weiß noch nicht, welches Modell sie einbindet. Das wählen Sie rechts unter „Unterprozess – ein Modell einbinden". Gibt es den Prozess noch nicht, legt der Knopf <b>„+ … als neues Modell anlegen"</b> ihn an.</p>

    <div style="${s.h4}">Die Palette links</div>
    ${_bpmnTabelle(['In der Palette', 'Im Hausschema'], [
      [_bpmnUi('Create start event'), '○ Auslöser'],
      [_bpmnUi('Create intermediate/boundary event'), `⏱ Warten, nach dem Setzen mit 🔧 als ${_bpmnUi('Timer intermediate catch event')} oder ${_bpmnUi('Message intermediate catch event')}`],
      [_bpmnUi('Create end event'), '◎ Ergebnis'],
      [_bpmnUi('Create gateway'), `◇ Entscheidung. Mit 🔧 und ${_bpmnUi('Parallel gateway')} wird daraus ✛.`],
      [_bpmnUi('Create task'), 'ein leerer Kasten. Gleich mit 🔧 zu 👤, ⚙ oder ✋ machen, sonst meldet die Prüfung R3.'],
      [_bpmnUi('Create pool/participant'), 'der Rahmen um den Prozess. Darin liegen die Bahnen.'],
      ['Hand, Lasso, Platz, Verbinden', 'die vier Werkzeuge ganz oben: Fläche schieben, mehrere Elemente markieren, Platz schaffen, Verbindungen ziehen'],
      [['Create expanded sub-process', 'Create data object reference', 'Create data store reference', 'Create group'].map(_bpmnUi).join(', '),
        'nicht verwenden, das Hausschema kennt sie nicht. Statt eines Teilprozesses im Bild wird ein Modell als ⊞ eingebunden, statt eines Datenobjekts hängt das Dokument per 📎 am Schritt.'],
    ])}
    <p style="${s.p}"><b>Bahnen anlegen:</b> Den Pool anklicken, dann ${_bpmnUi('Add lane above')}, ${_bpmnUi('Add lane below')} oder ${_bpmnUi('Divide into two lanes')}. Eine Bahn per Doppelklick mit der Rolle beschriften und die Elemente in die richtige Bahn ziehen. Jedes Element gehört in genau eine.</p>

    <div style="${s.h4}">Muster, die immer wieder vorkommen</div>
    ${_bpmnTabelle(['Muster', 'So geht es'], [
      ['Nachbessern', 'Der Nein-Zweig muss nicht enden. Ziehen Sie von seiner Aufgabe einen Pfeil zurück zu dem Schritt, der wiederholt wird, und löschen Sie das Ergebnis „Nachbessern". So wird aus „abgelehnt" eine Schleife.'],
      ['Mehrere Ergebnisse', 'Jedes Ende heißt nach seinem Zustand: „Antrag genehmigt", „Antrag abgelehnt". Ein Ende namens „Ende" sagt nicht, wie es ausging (R2).'],
      ['Gleichzeitig', 'Eine ✛ teilt, eine zweite ✛ führt wieder zusammen. Ohne die zweite endet der Prozess doppelt.'],
      ['Ausgänge beschriften', 'Jeder Pfeil aus einer Raute bekommt per Doppelklick seine Bedingung, meist „ja" und „nein" (R6).'],
      ['Übergabe', 'Jeder Bahnwechsel ist eine Übergabe. Die Ansicht zählt sie unter „Stellschrauben". Weniger Übergaben heißt weniger Liegezeit.'],
      ['Teil statt Kopie', 'Läuft derselbe Ablauf in zwei Prozessen, wird er einmal modelliert und in beiden als ⊞ eingebunden. Was zweimal abgeschrieben ist, ist bald zweimal verschieden (R10).'],
      ['Weiter in einem anderen Prozess', 'Geht der Ablauf an einer Stelle in einen anderen Prozess über, statt dort nur kurz etwas zu erledigen: das Element anklicken und rechts unter „Übergang zu einem anderen Prozess" das Ziel wählen. Am Element erscheint ↦. Der Unterschied zu ⊞: Nach einer ⊞ geht es hier weiter, nach ↦ dort.'],
      ['Formular am Schritt', 'Arbeitsanweisung, Formular oder Merkblatt gehören an den Schritt, an dem sie gebraucht werden: Schritt anklicken, rechts unter „Dokumente an diesem Schritt" hochladen oder verlinken. Am Element erscheint 📎.'],
    ])}

    <div style="${s.h4}">Wenn die Prüfung etwas meldet</div>
    ${_bpmnTabelle(['Regel', 'Was gemeint ist', 'So beheben'], [
      ['R1', 'Mehr als ein Auslöser. Das sind zwei Prozesse.', 'In zwei Modelle aufteilen und bei Bedarf per ⊞ verbinden.'],
      ['R2', 'Ein Ergebnis ohne Namen.', 'Den Zustand eintragen: „Antrag genehmigt".'],
      ['R3', 'Ein leerer Kasten.', `🔧 oder R, dann ${_bpmnUi('User task')}, ${_bpmnUi('Service task')} oder ${_bpmnUi('Manual task')}.`],
      ['R4', 'Ein Element liegt in keiner Bahn.', 'In die zuständige Bahn ziehen.'],
      ['R5', 'Eine Bahn heißt wie eine Person.', 'Die Rolle eintragen: „Einkauf" statt eines Namens. Personen wechseln, Rollen bleiben.'],
      ['R6', 'Ein Ausgang einer Raute ist nicht beschriftet.', 'Den Pfeil doppelklicken und die Bedingung eintragen.'],
      ['R7', 'Ein Element hängt lose.', 'Verbinden oder löschen.'],
      ['R8', 'Eine Aufgabe endet nicht auf einem Verb, oder eine Raute ist keine Frage.', '„Rechnung prüfen" statt „Rechnungsprüfung", „Freigegeben?" mit Fragezeichen.'],
      ['R9', 'Kein Regelwerk verknüpft.', 'Rechts unter „Verknüpfte Richtlinien" ankreuzen.'],
      ['R10', 'Eine ⊞ bindet nichts ein.', 'Rechts unter „Unterprozess – ein Modell einbinden" das Modell wählen.'],
    ])}

    <div style="${s.h4}">Tastenkürzel</div>
    ${_bpmnTabelle(null, BPMN_KUERZEL)}
    <div style="${s.hint}">Die Kürzel wirken im Modeler, solange kein Eingabefeld den Cursor hat und kein Dialog offen ist. Wer gerade den Prozessnamen tippt, löscht mit Entf also nur Buchstaben.</div>`;
}

/* ═══════════════════════════════════════════════════
   Hilfe im Modeler
═══════════════════════════════════════════════════ */

/** Der Einstieg als Dialog über dem Modeler; das Diagramm bleibt dahinter offen. */
function prozessHilfeOeffnen() {
  const doku = typeof canReadTab !== 'function' || canReadTab('dokumentation');
  openModal(`
    <div class="modal-header"><h3>❓ BPMN einfach erklärt</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button></div>
    <div class="modal-body">${bpmnEinstiegHtml()}</div>
    <div class="modal-footer">
      ${doku ? `<a class="btn btn-outline" href="?ansicht=dokumentation&amp;abschnitt=bpmn" target="_blank" rel="noopener"
        title="Öffnet in einem neuen Tab, das Diagramm hier bleibt offen">Stufe 2 in der Dokumentation ↗</a>` : ''}
      ${typeof bpmnAnleitungHerunterladen === 'function' ? `<button class="btn btn-outline" onclick="bpmnAnleitungHerunterladen()"
        title="${esc(BPMN_ANLEITUNG_KNOPF_TITEL)}">${esc(BPMN_ANLEITUNG_KNOPF)}</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-primary" onclick="closeModal()">Schließen</button>
    </div>`, true, { label: 'BPMN einfach erklärt' });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BPMN_BEISPIEL_EINSTIEG, BPMN_BEISPIEL_VERTIEFUNG, BPMN_KUERZEL, BPMN_ZEICHEN, BPMN_ZEICHEN_MEHR,
    BPMN_ANLEITUNG_KNOPF, bpmnEinstiegHtml, bpmnVertiefungHtml };
}
