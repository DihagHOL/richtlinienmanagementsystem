'use strict';

/**
 * Der Modeler auf Deutsch
 * =======================
 * bpmn-js bringt seine Erklärtexte nur englisch mit. Jeder Text, den es zeigt,
 * läuft aber durch einen Dienst „translate", und den darf man ersetzen. Diese
 * Tabelle ist der Ersatz.
 *
 * Wo das Hausschema einen Namen hat, trägt der Modeler denselben: Ein User
 * task heißt hier „Aufgabe (Mensch)", wie in der Legende, der Prüfung und der
 * Anleitung. Wer im Menü „Art ändern" nach „Mensch" sucht, findet ihn. Was das
 * Hausschema nicht kennt, heißt wie in deutschen BPMN-Lehrbüchern.
 *
 * Die Schlüssel sind die Texte aus bpmn-js 17.11 (vendor/bpmn-js), wörtlich.
 * tests/bpmndeutsch prüft, dass jeder Text, den das Paket übersetzen lässt,
 * hier steht. Nach einem Update fällt ein neuer englischer Text dort auf.
 */

const BPMN_DEUTSCH = {
  /* ── Werkzeuge oben in der Palette ── */
  'Activate hand tool': 'Hand: die Fläche verschieben',
  'Activate lasso tool': 'Lasso: mehrere Elemente markieren',
  'Activate create/remove space tool': 'Platz schaffen oder entfernen',
  'Activate global connect tool': 'Verbinden: einen Pfeil zwischen zwei Elementen ziehen',

  /* ── Palette: neu setzen ── */
  'Create start event': 'Auslöser setzen',
  'Create intermediate/boundary event': 'Zwischenereignis setzen, etwa Warten',
  'Create end event': 'Ergebnis setzen',
  'Create gateway': 'Entscheidung setzen',
  'Create task': 'Aufgabe setzen',
  'Create expanded sub-process': 'Aufgeklappten Teilprozess setzen',
  'Create data object reference': 'Datenobjekt setzen',
  'Create data store reference': 'Datenspeicher setzen',
  'Create pool/participant': 'Pool setzen, den Rahmen für die Bahnen',
  'Create group': 'Gruppe setzen',

  /* ── Kontextmenü am Element ── */
  'Append end event': 'Ergebnis anhängen',
  'Append gateway': 'Entscheidung anhängen',
  'Append task': 'Aufgabe anhängen',
  'Append intermediate/boundary event': 'Zwischenereignis anhängen',
  'Append receive task': 'Empfangsaufgabe anhängen',
  'Append message intermediate catch event': 'Nachricht abwarten anhängen',
  'Append timer intermediate catch event': 'Frist abwarten anhängen',
  'Append conditional intermediate catch event': 'Bedingung abwarten anhängen',
  'Append signal intermediate catch event': 'Signal abwarten anhängen',
  'Append compensation activity': 'Kompensation anhängen',
  'Add text annotation': 'Notiz anfügen',
  'Change element': 'Art ändern',
  'Delete': 'Löschen',
  'Connect to other element': 'Mit einem anderen Element verbinden',
  'Connect using association': 'Mit einer Notiz verbinden',
  'Connect using data input association': 'Als Dateneingang verbinden',

  /* ── Pool und Bahnen ── */
  'Add lane above': 'Bahn darüber einfügen',
  'Add lane below': 'Bahn darunter einfügen',
  'Divide into two lanes': 'In zwei Bahnen teilen',
  'Divide into three lanes': 'In drei Bahnen teilen',

  /* ── Mehrere Elemente markiert ── */
  'Align elements': 'Ausrichten',
  'Align elements left': 'Links ausrichten',
  'Align elements center': 'Senkrecht mittig ausrichten',
  'Align elements right': 'Rechts ausrichten',
  'Align elements top': 'Oben ausrichten',
  'Align elements middle': 'Waagerecht mittig ausrichten',
  'Align elements bottom': 'Unten ausrichten',
  'Distribute elements horizontally': 'Waagerecht gleichmäßig verteilen',
  'Distribute elements vertically': 'Senkrecht gleichmäßig verteilen',

  /* ── Suche und Teilprozesse ── */
  'Search in diagram': 'Im Diagramm suchen',
  'Open {element}': '{element} öffnen',

  /* ── Menü „Art ändern": Schalter in der Kopfzeile ── */
  'Loop': 'Schleife',
  'Parallel multi-instance': 'Mehrfach, gleichzeitig',
  'Sequential multi-instance': 'Mehrfach, nacheinander',
  'Ad-hoc': 'Ad-hoc',
  'Collection': 'Sammlung',
  'Toggle non-interrupting': 'Unterbrechend oder nicht unterbrechend',
  'Participant multiplicity': 'Mehrere Teilnehmer',

  /* ── Menü „Art ändern": Aufgaben ── */
  'Task': 'Aufgabe ohne Typ',
  'User task': 'Aufgabe (Mensch)',
  'Service task': 'Automatik (System)',
  'Manual task': 'Handgriff (ohne System)',
  'Send task': 'Sendeaufgabe',
  'Receive task': 'Empfangsaufgabe',
  'Script task': 'Skriptaufgabe',
  'Business rule task': 'Geschäftsregelaufgabe',
  'Call activity': 'Unterprozess (eingebundenes Modell)',
  'Sub-process': 'Teilprozess',
  'Sub-process (collapsed)': 'Teilprozess (zugeklappt)',
  'Sub-process (expanded)': 'Teilprozess (aufgeklappt)',
  'Event sub-process': 'Ereignis-Teilprozess',
  'Transaction': 'Transaktion',

  /* ── Menü „Art ändern": Entscheidungen ── */
  'Exclusive gateway': 'Entscheidung (entweder/oder)',
  'Parallel gateway': 'Aufteilung (beides)',
  'Inclusive gateway': 'Verzweigung (eines oder mehrere)',
  'Complex gateway': 'Komplexe Verzweigung',
  'Event-based gateway': 'Ereignisbasierte Verzweigung',

  /* ── Menü „Art ändern": Auslöser ── */
  'Start event': 'Auslöser (Startereignis)',
  'Message start event': 'Auslöser Nachricht',
  'Timer start event': 'Auslöser Zeitpunkt',
  'Conditional start event': 'Auslöser Bedingung',
  'Signal start event': 'Auslöser Signal',
  'Error start event': 'Auslöser Fehler',
  'Escalation start event': 'Auslöser Eskalation',
  'Compensation start event': 'Auslöser Kompensation',
  'Message start event (non-interrupting)': 'Auslöser Nachricht (nicht unterbrechend)',
  'Timer start event (non-interrupting)': 'Auslöser Zeitpunkt (nicht unterbrechend)',
  'Conditional start event (non-interrupting)': 'Auslöser Bedingung (nicht unterbrechend)',
  'Signal start event (non-interrupting)': 'Auslöser Signal (nicht unterbrechend)',
  'Escalation start event (non-interrupting)': 'Auslöser Eskalation (nicht unterbrechend)',

  /* ── Menü „Art ändern": Zwischenereignisse ── */
  'Intermediate throw event': 'Zwischenereignis',
  'Message intermediate catch event': 'Nachricht abwarten',
  'Timer intermediate catch event': 'Frist abwarten',
  'Conditional intermediate catch event': 'Bedingung abwarten',
  'Signal intermediate catch event': 'Signal abwarten',
  'Link intermediate catch event': 'Sprungziel',
  'Message intermediate throw event': 'Nachricht senden',
  'Signal intermediate throw event': 'Signal senden',
  'Escalation intermediate throw event': 'Eskalation auslösen',
  'Compensation intermediate throw event': 'Kompensation auslösen',
  'Link intermediate throw event': 'Sprung',

  /* ── Menü „Art ändern": Ereignisse am Rand einer Aufgabe ── */
  'Message boundary event': 'Randereignis Nachricht',
  'Timer boundary event': 'Randereignis Frist',
  'Escalation boundary event': 'Randereignis Eskalation',
  'Conditional boundary event': 'Randereignis Bedingung',
  'Error boundary event': 'Randereignis Fehler',
  'Cancel boundary event': 'Randereignis Abbruch',
  'Signal boundary event': 'Randereignis Signal',
  'Compensation boundary event': 'Randereignis Kompensation',
  'Message boundary event (non-interrupting)': 'Randereignis Nachricht (nicht unterbrechend)',
  'Timer boundary event (non-interrupting)': 'Randereignis Frist (nicht unterbrechend)',
  'Escalation boundary event (non-interrupting)': 'Randereignis Eskalation (nicht unterbrechend)',
  'Conditional boundary event (non-interrupting)': 'Randereignis Bedingung (nicht unterbrechend)',
  'Signal boundary event (non-interrupting)': 'Randereignis Signal (nicht unterbrechend)',

  /* ── Menü „Art ändern": Ergebnisse ── */
  'End event': 'Ergebnis (Endereignis)',
  'Message end event': 'Ergebnis mit Nachricht',
  'Escalation end event': 'Ergebnis mit Eskalation',
  'Error end event': 'Ergebnis mit Fehler',
  'Compensation end event': 'Ergebnis mit Kompensation',
  'Signal end event': 'Ergebnis mit Signal',
  'Terminate end event': 'Ergebnis, das alles beendet',
  'Cancel end event': 'Ergebnis mit Abbruch',

  /* ── Menü „Art ändern": Pfeile, Daten, Pools ── */
  'Sequence flow': 'Pfeil',
  'Default flow': 'Pfeil für alle anderen Fälle',
  'Conditional flow': 'Pfeil mit Bedingung',
  'Data object reference': 'Datenobjekt',
  'Data store reference': 'Datenspeicher',
  'Expanded pool/participant': 'Pool (aufgeklappt)',
  'Empty pool/participant': 'Pool (leer)',
  'Empty pool/participant (removes content)': 'Pool (leer, der Inhalt wird entfernt)',
};

/**
 * Der Ersatz für den Dienst „translate" von bpmn-js: Text nachschlagen,
 * Platzhalter wie {element} füllen. Was die Tabelle nicht kennt, bleibt, wie es
 * ist. Ein englisches Wort ist besser als ein leeres Feld.
 */
function bpmnUebersetzen(vorlage, ersetzungen) {
  const e = ersetzungen || {};
  const text = Object.prototype.hasOwnProperty.call(BPMN_DEUTSCH, vorlage) ? BPMN_DEUTSCH[vorlage] : vorlage;
  return String(text).replace(/{([^}]+)}/g, (_, k) => (Object.prototype.hasOwnProperty.call(e, k) ? e[k] : '{' + k + '}'));
}

/* So nimmt bpmn-js den Ersatz an: new BpmnJS({ additionalModules: [BPMN_DEUTSCH_MODUL] }). */
const BPMN_DEUTSCH_MODUL = { translate: ['value', bpmnUebersetzen] };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BPMN_DEUTSCH, bpmnUebersetzen, BPMN_DEUTSCH_MODUL };
}
