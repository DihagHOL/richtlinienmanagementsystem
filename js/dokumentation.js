/* ═══════════════════════════════════════════════════
   Dokumentation – vollständiges Benutzerhandbuch (für alle sichtbar)
   Rein statische Inhalte; rendert in #doku-mount. Ergänzt die kurze
   „Anleitung" um alle Funktionen inkl. Health-Check, IMS-Abdeckung,
   Fälligkeiten, pro-Regelwerk-Prüfer/Freigeber und Export.
   Druckansicht über dokuPrint() (eigenständiges Fenster).
═══════════════════════════════════════════════════ */

let _dokuRendered = false;

function initDokumentation() {
  if (_dokuRendered) return;            // statisch – einmal rendern reicht
  const mount = document.getElementById('doku-mount');
  if (!mount) return;
  mount.innerHTML = dokumentationHtml();
  _dokuRendered = true;
}

/* Zielgruppen-Badge je Abschnitt. */
function _dBadge(role) {
  const map = {
    all:    ['Für alle',            '#eff3ff', '#17509e'],
    review: ['Prüfer & Geschäftsleitung', '#dcfce7', '#166534'],
    admin:  ['Administration',      '#f3e8ff', '#7e22ce'],
  };
  const [t, bg, fg] = map[role] || map.all;
  return `<span style="display:inline-block;font-size:.66rem;font-weight:700;letter-spacing:.02em;
    background:${bg};color:${fg};border-radius:999px;padding:2px 10px;vertical-align:middle">${t}</span>`;
}

/* Inhaltsverzeichnis – Reihenfolge & Titel zentral. */
const _DOKU_TOC = [
  ['start',         'Erste Schritte'],
  ['rollen',        'Rollen im System'],
  ['lesen',         'Regelwerke lesen & bestätigen'],
  ['wissenstest',   'Wissenstest & Lernvideos'],
  ['wissen',        'Wissen – die Bibliothek'],
  ['erinnerungen',  'Erinnerungen & Eskalation'],
  ['vorschlag',     'Änderung vorschlagen'],
  ['ki',            'KI-Systeme beantragen'],
  ['cockpit',       'Cockpit (Admin-Startseite)'],
  ['verwalten',     'Regelwerke anlegen & verwalten'],
  ['konzepte',      'Regelwerk-Konzepte'],
  ['freigabe',      'Konformitätsprüfung & Freigabe'],
  ['health',        'Dokument-Health-Check'],
  ['abdeckung',     'IMS-Abdeckung & SoA'],
  ['faelligkeit',   'Fälligkeiten / Wiedervorlage'],
  ['risiken',       'Risiko-Register'],
  ['assets',        'Assetregister (Inventar)'],
  ['ziele',         'Ziele'],
  ['massnahmen',    'Maßnahmen (Gesamtliste)'],
  ['kennzahlen',    'Kennzahlen'],
  ['ausnahmen',     'Ausnahmeregister (Abweichungen)'],
  ['wirksamkeit',   'Wirksamkeit & Verbesserung'],
  ['notfall',       'Notfall & Krisenstab (BCM)'],
  ['vorfaelle',     'Vorfälle & Ereignisse (Ticketsystem)'],
  ['ismsdocs',      'IMS-Dokumente (alle Normen)'],
  ['governance',    'Governance-Board (Legal-Entwürfe)'],
  ['govstruktur',   'Governance-Struktur (Matrix)'],
  ['bpmn',          'BPMN einfach erklärt'],
  ['prozesse',      'Prozesse (BPMN 2.0)'],
  ['prozessschema', 'Prozesse niederschreiben (Hausschema)'],
  ['vorschlaege',   'Vorschläge bearbeiten'],
  ['compliance',    'Audit Report'],
  ['einstellungen', 'Einstellungen'],
  ['probelauf',     'Probelauf (Vorführung & Test)'],
  ['glossar',       'Begriffe & Normbezug'],
  ['faq',           'Häufige Fragen & Hilfe'],
];

/* ── Bausteine der einzelnen Abschnitte (auch für den Druck genutzt) ── */
function _dokuSections() {
  const li = 'margin:0 0 7px;line-height:1.55';
  const ol = 'padding-left:20px;margin:10px 0 0';
  const h3 = 'margin:16px 0 6px;font-size:.98rem;font-weight:700';
  const hint = 'margin-top:12px;font-size:.85rem;color:var(--c-muted);background:var(--c-bg,#f8fafc);border-left:3px solid var(--c-primary,#17509e);padding:8px 12px;border-radius:0 8px 8px 0';
  const norm = t => `<div class="doku-norm">📐 <b>Normbezug:</b> ${t}</div>`;
  const sec = (id, title, badge, body, n) => `
    <section id="doku-${id}" class="doku-sec">
      <h2 class="doku-h2">${title} ${_dBadge(badge)}</h2>
      ${body}
      ${n ? norm(n) : ''}
    </section>`;
  const tbl = (rows) => `<table class="doku-tbl"><tbody>${rows.map(r =>
    `<tr><td style="font-weight:600;white-space:nowrap">${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;

  return [
    sec('start', 'Erste Schritte', 'all', `
      <ul style="${ol}">
        <li style="${li}"><b>Aufruf:</b> <a href="https://rms.dihag.de/" style="color:var(--c-primary);font-weight:600">rms.dihag.de</a> im Browser.</li>
        <li style="${li}"><b>Anmeldung:</b> mit dem gewohnten DIHAG-Microsoft-Konto (Single Sign-On). Einmal anmelden genügt – das KI-Dashboard nutzt dieselbe Anmeldung.</li>
        <li style="${li}"><b>Navigation:</b> linke Leiste. Am Handy über das Menü-Symbol (☰) oben links ein-/ausblenden.</li>
        <li style="${li}"><b>Was sichtbar ist, wird freigegeben:</b> Von sich aus sieht jede:r nur den Reiter <b>„Wissen"</b>. „Meine Regelwerke", „Anleitung", „Dokumentation", das KI-Dashboard, „Freigaben", „Vorschläge" und alle Verwaltungs- und Auswertungs-Reiter erscheinen, sobald die Administration sie freigibt – je Person, Gruppe oder für eine ganze Gesellschaft (Einstellungen → Reiter-Berechtigungen).</li>
        <li style="${li}"><b>„↻ Aktualisieren"</b> (oben rechts) lädt frische Daten, falls etwas nicht aktuell wirkt.</li>
      </ul>
      <div style="${hint}">💡 Diese Dokumentation ist die Langfassung. Für den 3-Minuten-Schnellstart gibt es den Reiter <b>„Anleitung"</b>.</div>`),

    sec('rollen', 'Rollen im System', 'all', `
      <p style="margin:0 0 8px;line-height:1.55">Was jemand sieht und darf, ergibt sich aus seiner Rolle. Rollen werden von der Administration unter <b>„Einstellungen"</b> gepflegt (E-Mail-Adressen je Rolle).</p>
      ${tbl([
        ['Mitarbeitende', 'Regelwerke lesen &amp; bestätigen, Wissenstest, Änderungen vorschlagen, KI-Systeme beantragen. Jede angemeldete Person.'],
        ['Konformitätsprüfer', 'Prüfen Regelwerke fachlich auf Konformität (ISO 27001 / NIS2) und markieren „konform / nicht konform". Global oder pro Regelwerk hinterlegbar.'],
        ['Geschäftsleitung', 'Gibt die geprüften Regelwerke frei → Veröffentlichung. Global oder pro Regelwerk hinterlegbar.'],
        ['Genehmiger', 'App-interne Freigabeberechtigung (wie GL); sieht den Reiter „Freigaben".'],
        ['Administration', 'Regelwerke &amp; IMS-Dokumente verwalten, Health-Check, IMS-Abdeckung, Fälligkeiten, Compliance-Auswertung, Einstellungen.'],
        ['ISMS-Verantwortliche / Vorschlags-Empfänger', 'Erhalten und bearbeiten die Änderungsvorschläge (Reiter „Vorschläge").'],
        ['KI-Gremium', 'Entscheidet über KI-Anträge im KI-Dashboard (leer = Genehmiger-Liste gilt).'],
      ])}`,
      'ISO 27001 Klausel 5.3 (Rollen, Verantwortlichkeiten &amp; Befugnisse), A.5.2 (Informationssicherheitsrollen); NIS2 Art. 20 (Verantwortung der Leitungsorgane).'),

    sec('lesen', 'Regelwerke lesen & bestätigen', 'all', `
      <ol style="${ol}">
        <li style="${li}">Reiter <b>„Meine Regelwerke"</b> öffnen – oben die Quote (zugewiesen / offen / abgeschlossen).</li>
        <li style="${li}">Eine Regelwerk anklicken → das Dokument wird angezeigt.</li>
        <li style="${li}"><b>Kenntnisnahme:</b> lesen, „Ich habe gelesen und verstanden" ankreuzen, <b>„Kenntnisnahme bestätigen"</b>. Das Häkchen wird erst nach kurzer Lesezeit bzw. nach „In SharePoint öffnen" aktiv.</li>
        <li style="${li}"><b>Wissenstest</b> (falls erforderlich): „Wissenstest starten" → Fragen beantworten. Nicht bestanden? Einfach erneut versuchen.</li>
        <li style="${li}"><b>Teilnahmenachweis</b> kann per Mail an die eigene Adresse gesendet werden.</li>
      </ol>
      <div style="${hint}">ℹ️ Manche Regelwerke müssen <b>regelmäßig</b> erneut bestätigt werden (z. B. jährlich) und erscheinen dann automatisch wieder als „offen". Auch eine <b>neue Version</b> setzt die Bestätigung zurück.</div>`,
      'ISO 27001 Klausel 7.3 (Bewusstsein), A.6.3 (Informationssicherheitsbewusstsein &amp; -schulung), A.5.1 (Regelwerke); NIS2 Art. 21(2g) (Cyberhygiene &amp; Schulung).'),

    sec('wissenstest', 'Wissenstest & Lernvideos', 'all', `
      <p style="margin:0 0 8px;line-height:1.55">Der Wissenstest weist nach, dass ein Regelwerk nicht nur geöffnet, sondern verstanden wurde. Er ist optional – die Administration entscheidet je Regelwerk.</p>
      <h3 style="${h3}">So läuft er ab</h3>
      <ol style="${ol}">
        <li style="${li}"><b>Erst lesen, dann testen:</b> Der Test lässt sich erst starten, wenn die Kenntnisnahme bestätigt ist.</li>
        <li style="${li}"><b>Fragen und Antworten werden bei jedem Versuch neu gemischt</b> – Auswendiglernen der Reihenfolge bringt nichts.</li>
        <li style="${li}"><b>Alle Fragen beantworten</b>, dann absenden. Es zählt genau eine richtige Antwort je Frage.</li>
        <li style="${li}"><b>Sofortige Auswertung:</b> Die richtige Antwort erscheint grün, eine falsch gewählte rot – der Test ist damit auch Lernmittel.</li>
        <li style="${li}"><b>Bestehensgrenze</b> legt die Administration je Regelwerk fest (Standard 80&nbsp;% richtig).</li>
        <li style="${li}"><b>Nicht bestanden?</b> Beliebig oft wiederholbar, ohne Sperrfrist. Ziel ist Verständnis, nicht Selektion.</li>
      </ol>
      <h3 style="${h3}">Was gespeichert wird</h3>
      ${tbl([
        ['Ergebnis', 'Das <b>beste</b> erreichte Ergebnis in Prozent (ein schlechterer Versuch verschlechtert es nicht).'],
        ['Bestanden', 'Einmal bestanden bleibt bestanden – bis zur nächsten Version oder zur nächsten Wiederholung.'],
        ['Versuche', 'Anzahl der Anläufe. Zweck ist die Nachweisführung, nicht die Bewertung von Personen.'],
        ['Abschluss', 'Erst mit bestandenem Test gilt das Regelwerk als erledigt – vorher steht es als „gelesen, Test offen".'],
      ])}
      <h3 style="${h3}">Lernvideos</h3>
      <ul style="${ol}">
        <li style="${li}">Zu jedem Regelwerk können <b>Videos</b> hinterlegt werden – sie erscheinen direkt unter dem Dokument, vor dem Wissenstest.</li>
        <li style="${li}">Videos aus <b>Stream/SharePoint</b> sowie YouTube und Vimeo werden <b>in der Seite abgespielt</b>; alles andere bekommt einen Knopf, der in einem neuen Tab öffnet.</li>
        <li style="${li}">Die <b>Rechte am Video</b> vergibt SharePoint. Wer das Video dort nicht sehen darf, sieht es auch hier nicht.</li>
      </ul>
      <div style="${hint}">📌 <b>Quelle bei fremdem Material:</b> Stammt ein Video nicht aus dem eigenen Haus (YouTube, Vimeo, andere externe Anbieter), steht die Quellenangabe unter dem Video – z. B. <i>Quelle: Bundesamt für Sicherheit in der Informationstechnik (BSI)</i>. Bei externen Videos ist das Feld Pflicht; ohne Quelle lässt sich das Regelwerk nicht speichern. Eigenes Material aus Stream/SharePoint braucht keine.</div>
      <div style="${hint}">🎬 <b>Für die Administration:</b> Im Regelwerk-Editor unter <b>„🎬 Lernvideos"</b> Titel und Adresse eintragen. Am einfachsten in Stream/SharePoint auf <b>Teilen → Einbetten</b> klicken und den Code einfügen – die App holt sich die Adresse heraus und zeigt sofort an, ob abgespielt oder verlinkt wird. Fragen und Bestehensgrenze stehen im selben Editor unter <b>„Wissenstest"</b> (mindestens zwei Antwortoptionen je Frage, genau eine richtige).</div>`,
      'ISO 27001 Klausel 7.2 (Kompetenz), 7.3 (Bewusstsein), A.6.3 (Schulung &amp; Sensibilisierung); NIS2 Art. 21(2g).'),

    sec('wissen', 'Wissen – die Bibliothek', 'all', `
      <p style="margin:0 0 8px;line-height:1.55">Der Reiter <b>„Wissen"</b> ist der einzige, den jede:r von sich aus sieht – alle anderen gibt die Administration frei. Er steht neben den Regelwerken und ist das Gegenstück zur Pflicht: eine <b>Bibliothek</b> mit Themen, kurzen <b>Videos</b>, <b>Artikeln</b>, <b>Links</b> und <b>Wissenstests</b> rund um Sicherheit, Datenschutz und die Regeln im Haus. <b>Freiwillig, jederzeit, ohne Nachweispflicht</b> – niemand wird erinnert, nichts wird fällig. Wer eine Frage hat, schlägt nach; wer fünf Minuten hat, liest.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Stöbern:</b> Oben die <b>Themen</b> (Phishing, Passwörter, Arbeitsplatz, Datenschutz, Vorfall melden, KI …) und die <b>Arten</b> (🎬 Video, 📄 Artikel, 🔗 Link, ❓ Wissenstest) als Filter, dazu die Suche. Jede Karte nennt die Dauer.</li>
        <li style="${li}"><b>Angesehen:</b> Unter einem Video, Artikel oder Link steht <b>„✓ Ich habe das angesehen"</b>. Ein Klick, freiwillig – er hält fest, dass Sie den Beitrag kennen. Die Karte zeigt es danach mit Datum.</li>
        <li style="${li}"><b>Wissenstest:</b> Fragen mit genau einer richtigen Antwort, Reihenfolge jedes Mal gemischt, sofortige Auswertung mit der richtigen Lösung – der Test ist zugleich das Lernmittel. Beliebig oft wiederholbar; es zählt das beste Ergebnis. Anders als beim Wissenstest eines Regelwerks ist <b>kein</b> Test hier Voraussetzung für irgendetwas.</li>
        <li style="${li}"><b>🎓 Schulung:</b> Ein Kurs aus mehreren <b>Modulen</b> (je eine Seite) mit einem Wissenstest zum Schluss – die Übersicht nennt Dauer, Zielgruppe, ob Pflicht, Wiederholung und was man danach kann; die Module sind nacheinander durchzugehen („Weiter →"), gelesene sind abgehakt, „Fortsetzen" springt zum ersten offenen. Abgeschlossen ist die Schulung mit bestandenem Test (ohne Test: mit dem letzten Modul). Eine <b>Pflichtschulung</b> steht bei allen oben im Reiter, bis sie abgeschlossen ist – und wieder, wenn die <b>Wiederholung</b> (z. B. jährlich) fällig ist; der Abschluss trägt dann sein Ablaufdatum. Der Startbestand bringt die Pflichtschulung <b>„Phishing erkennen"</b> mit (fünf Module, fünf Fragen, jährlich).</li>
        <li style="${li}"><b>Link auf einen Beitrag:</b> <b>„🔗 Link"</b> kopiert eine dauerhafte Adresse (<code>?ansicht=wissen&amp;beitrag=…</code>) – für Mails, Aushänge, Schulungen.</li>
        <li style="${li}"><b>Was gespeichert wird:</b> Angesehen, bestanden, Ergebnis und Versuche – in derselben Bestätigungen-Liste wie die Kenntnisnahmen, mit der Kennung <code>wissen:…</code>. Auswertungen je Regelwerk sehen diese Einträge nicht; die Bibliothek hat ihre eigene Auswertung.</li>
      </ul>
      <div style="${hint}">✎ <b>Für die Pflege (Administration oder Schreibrecht auf den Reiter):</b> <b>„✎ Pflegen"</b> oben rechts schaltet um. <b>„+ Thema"</b> legt ein Thema an (Symbol, Titel, eine Zeile dazu), <b>„+ Beitrag"</b> einen Beitrag: Art wählen, Titel, eine Zeile dazu, Dauer – bei Videos die Adresse oder der <b>Einbetten-Code</b> aus Stream/SharePoint (die App zeigt sofort, ob abgespielt oder verlinkt wird; fremdes Material braucht eine Quelle), bei Artikeln der Text (Leerzeile = Absatz, „- " = Aufzählung, **fett**, „# " = Zwischenüberschrift), bei Wissenstests die Fragen mit der markierten richtigen Antwort und die Bestehensgrenze; bei <b>Schulungen</b> Einstieg, Zielgruppe, Wiederholung, Pflicht, Lernziele, die Module (Titel + Text, ↑↓ sortieren) und der Test. In Modulen gehen zusätzlich <code>1. Schritt</code> (nummerierte Schritte), <code>&gt; </code>/<code>&gt;! </code>/<code>&gt;✓ </code> (Hinweis-, Warn-, Erfolgskasten), <code>!! Titel: Text</code> (Warnsignal-Karte) und <code>:::mail … :::</code> (nachgebaute E-Mail mit Von:/An:/Betreff:/Hinweis:, <code>---</code>, Text, <code>[→ Knopf]</code>), <code>:::code … :::</code> (Zeilen zum Abtippen in Schreibmaschinenschrift) und <code>&#96;Schreibweise&#96;</code> mitten im Satz. Die <b>Auswertung</b> zeigt je Pflichtschulung die Quote der Mitarbeitenden mit gültigem Abschluss; der Audit Report führt sie als eigene Zeile. <b>„Gilt für"</b> grenzt auf Werke ein, <b>„Sichtbar"</b> nimmt einen Beitrag aus der Sicht, ohne ihn zu löschen. Die Pfeile ↑↓ ordnen Themen und Beiträge. <b>„📋 Startbestand"</b> legt Themen mit je einem Artikel und einem Wissenstest an, dazu zwei Schulungen: <b>„Phishing erkennen"</b> (Pflicht, jährlich) und <b>„Abläufe beschreiben mit BPMN"</b> (freiwillig, sechs Module aus „BPMN einfach erklärt" und zehn Testfragen). Der Knopf zeigt, was davon in der Bibliothek fehlt, und legt nur an, was angekreuzt ist. Bewusst Gelöschtes kommt so nicht ungefragt zurück. Ein Vorschlag zum Anpassen, keine Hausregel. <b>„📊 Auswertung"</b> zählt je Beitrag Personen, Tests, Bestandene und den Durchschnitt (CSV). Werden die Fragen eines Tests geändert, gilt er als neuer Stand – bestanden ist dann wieder offen. Gespeichert wird in <code>wissen.json</code> im Konfigurationsordner; wer auf einem veralteten Stand speichert, wird abgewiesen. Die Rechte vergibt <b>Einstellungen → Reiter-Berechtigungen</b>: Lesen haben alle, „S" macht zur pflegenden Person.</div>`,
      'ISO 27001 Klausel 7.3 (Bewusstsein), A.6.3 (Sensibilisierung &amp; Schulung); NIS2 Art. 21(2g) (Cyberhygiene &amp; Schulungen), Art. 20(2) (Schulung der Leitung).'),

    sec('erinnerungen', 'Erinnerungen & Eskalation', 'all', `
      <p style="margin:0 0 8px;line-height:1.55">Nichts im Ablauf hängt davon ab, dass jemand die App zufällig öffnet: Ein zeitgesteuerter Lauf (werktäglich, ohne offenen Browser) fasst offene Punkte automatisch nach.</p>
      <h3 style="${h3}">Was erinnert wird</h3>
      ${tbl([
        ['Offene Kenntnisnahme', 'An die <b>Mitarbeitenden</b>: Ein veröffentlichtes Pflicht-Regelwerk ist noch zu lesen und zu bestätigen (samt Wissenstest, falls gefordert). Jede Person erhält <b>eine</b> Mail über <b>alle</b> ihre offenen Regelwerke – nicht eine Mail je Regelwerk.'],
        ['Konzeptprüfung', 'An die Geschäftsleitung: ein eingereichtes Konzept wartet auf Entscheidung.'],
        ['Konformitätsprüfung', 'An die Prüfer, die noch nicht votiert haben (regelwerkseigene Prüfer haben Vorrang).'],
        ['Mitbestimmung', 'An KBR und die Betriebsräte der betroffenen Werke – mit denselben Entscheidungsknöpfen wie die erste Mail.'],
        ['Freigabe', 'An die Geschäftsleitung bzw. die je Regelwerk hinterlegten Freigebenden.'],
        ['Wiedervorlage', 'Sammelmail an die Administration: welche Regelwerke zur Überprüfung anstehen.'],
        ['Risiken', 'Sammelmail an die Administration: überfällige Maßnahmen und Risiko-Reviews.'],
      ])}
      <h3 style="${h3}">Taktung und Eskalation</h3>
      <ul style="${ol}">
        <li style="${li}"><b>Workflow-Schritte:</b> erste Erinnerung nach 7 Tagen, danach alle 3 Tage; ab 14 Tagen zusätzlich an den <b>Ersatz-Empfänger</b>.</li>
        <li style="${li}"><b>Kenntnisnahmen:</b> bewusst träger – erste Erinnerung nach 7 Tagen, danach wöchentlich; ab 21 Tagen geht eine <b>Sammelmeldung</b> an die hinterlegte Stelle: welches Regelwerk wie lange offen ist und wer noch fehlt.</li>
        <li style="${li}">Alle Werte sind in den <b>Einstellungen</b> änderbar, jede Erinnerungsart lässt sich einzeln <b>pausieren</b>.</li>
        <li style="${li}">Erinnert wird nur, was <b>tatsächlich offen</b> ist – wer bestätigt hat, fällt sofort aus der Liste.</li>
      </ul>
      <div style="${hint}">🔐 <b>Zweckbindung:</b> Die Auswertung dient dem Nachweis der Unterweisung (ISO 27001 A.6.3), nicht der Leistungs- oder Verhaltenskontrolle. Die Eskalation geht an eine benannte Stelle – nicht automatisch an Vorgesetzte.</div>`,
      'ISO 27001 Klausel 7.4 (Kommunikation), 9.1 (Überwachung), A.5.1, A.6.3; NIS2 Art. 21(2g).'),

    sec('vorschlag', 'Änderung vorschlagen', 'all', `
      <p style="margin:0;line-height:1.55">Fehler oder Verbesserung entdeckt? In der geöffneten Regelwerk oben rechts auf <b>„✏️ Änderung vorschlagen"</b>, kurz <b>was</b> und <b>warum</b> beschreiben, absenden.</p>
      <ul style="${ol}">
        <li style="${li}">Der Vorschlag enthält einen <b>Direktlink zum Dokument</b> und geht per Mail an die Verantwortlichen; Sie erhalten eine <b>Kopie</b>.</li>
        <li style="${li}">Unter <b>„Weitere Empfänger"</b> lassen sich zusätzliche interne Adressen ergänzen.</li>
        <li style="${li}">Alle Vorschläge landen im Reiter <b>„Vorschläge"</b> zur Nachverfolgung.</li>
      </ul>`),

    sec('ki', 'KI-Systeme beantragen (KI-Dashboard)', 'all', `
      <p style="margin:0 0 8px;line-height:1.55">Über <b>„KI-Dashboard"</b> (linke Leiste) in den KI-Governance-Bereich. Jede:r kann einen Antrag stellen, wenn ein neues KI-System eingesetzt werden soll.</p>
      <ol style="${ol}">
        <li style="${li}"><b>„Neuer Antrag"</b> → Formular gemäß KI-Regelwerk (CO-10-01) ausfüllen (Regelwerk & Verhaltenskodex sind oben verlinkt).</li>
        <li style="${li}">Absenden → das KI-Koordinierungsgremium wird automatisch informiert.</li>
        <li style="${li}">Status jederzeit unter <b>„Anträge"</b>; auf Rückfragen des Gremiums direkt antworten.</li>
      </ol>`,
      'ISO 27001 Klausel 5.3 (Rollen &amp; Befugnisse); NIS2 Art. 20 (Governance). Intern: KI-Regelwerk CO-10-01.'),

    sec('cockpit', 'Cockpit (Admin-Startseite)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Der Reiter <b>„Cockpit"</b> ist die Startseite für Berechtigte: alle ISMS-Kennzahlen auf einen Blick, jede Kachel führt per Klick in den passenden Reiter.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Regelwerke</b> (aktiv/veröffentlicht/Entwürfe/im Workflow) · <b>Prüfung &amp; Freigabe</b> (inkl. Alter des ältesten Vorgangs) · <b>Fälligkeiten</b> (überfällig / ≤ 30 Tage).</li>
        <li style="${li}"><b>IMS-Abdeckung</b> (Annex-A-/NIS2-Quote) · <b>SoA</b> (entschieden, ausgeschlossen, umgesetzt, fehlende Begründungen) · <b>Risiko-Register</b> (offen, hoch, überfällige Maßnahmen) · <b>Ausnahmen</b> (gültig, abgelaufen, unentschieden) · <b>Wirksamkeit</b> (offene Abweichungen, überfällige Maßnahmen, letzte Bewertung).</li>
        <li style="${li}"><b>Audit Report</b> (Erfüllungsquote, offene Kenntnisnahmen) · <b>Vorschläge</b> (offen / in Bearbeitung).</li>
      </ul>
      <div style="${hint}">💡 Schnelle Kennzahlen erscheinen sofort; aufwendigere (Compliance-Quote, SoA, Risiken) laden im Hintergrund nach und füllen ihre Kachel, sobald sie da sind.</div>`,
      'ISO 27001 Klausel 9.1 (Überwachung, Messung, Analyse &amp; Bewertung), 9.3 (Managementbewertung – Eingaben).'),

    sec('verwalten', 'Regelwerke anlegen & verwalten', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Im Reiter <b>Regelwerk Dashboard</b> steht über der Liste
      der Abschnitt <b>„So wird ein Regelwerk eingeführt"</b>: eingeklappt die sieben Stationen als Kette
      (Konzept → Konzept-Entscheidung → Entwurf → Prüfung → Mitbestimmung → Freigabe → Veröffentlicht),
      aufgeklappt je Station kurz beschrieben, was zu tun ist und wer entscheidet. Zwei Besonderheiten
      sind dort markiert: Die <b>Mitbestimmung</b> ist gestrichelt dargestellt, weil sie nur stattfindet,
      wenn im Editor ein Betriebsrat als betroffen angekreuzt ist; das Zeichen <b>⇄</b> zwischen
      Mitbestimmung und Freigabe steht dafür, dass sich deren Reihenfolge je Regelwerk umstellen lässt.</p>
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Regelwerk Dashboard"</b>. Oben stehen drei Wege, ein Regelwerk anzulegen:</p>
      <ul style="${ol}">
        <li style="${li}"><b>„+ Neues Regelwerk"</b> – fragt zuerst, ob es sich um ein <b>komplett neues</b> Regelwerk handelt. Wenn ja, muss zuerst ein <b>Konzept an die Geschäftsleitung</b> (siehe „Regelwerk-Konzepte"). „Direkt anlegen" ist nur für <b>bestehende</b> Dokumente / die Migration gedacht. Im selben Dialog liegt der Link zur <b>Muster-Vorlage „Erstellung von Konzernregelungen"</b>.</li>
        <li style="${li}"><b>„💡 Regelwerk-Konzept"</b> – schlägt ein neues Regelwerk vor, ohne es schon zu schreiben.</li>
        <li style="${li}"><b>„⬆ Importieren"</b> – mehrere Word-/PDF-Dateien per Drag &amp; Drop auf einmal als Entwürfe anlegen (Titel aus dem Dateinamen).</li>
              <li style="${li}"><b>Löschen nur ohne Nachweis:</b> Ein Regelwerk lässt sich nur löschen, solange es Entwurf ist und weder Prüfentscheidung noch Freigabe noch Kenntnisnahme trägt. Danach bietet die App <b>Archivieren</b> an – sonst blieben Bestätigungen ohne zugehöriges Regelwerk zurück.</li>
</ul>
      <div style="${h3}">Finden: Suche und Filter</div>
      <p style="margin:0 0 8px;line-height:1.55">Die <b>Suche</b> durchsucht nicht nur den Titel, sondern auch Beschreibung, Kategorie, Typ, Standorte, Version, Dokumentname, Zielgruppen und Normbezug. Daneben filtern drei Auswahlfelder nach <b>Status</b>, <b>Typ</b> (Dokumentart) und <b>Standort</b>. Ein Regelwerk mit Geltungsbereich „Alle Standorte" erscheint dabei bei jedem Standort.</p>
      <div style="${h3}">Der Editor im Überblick</div>
      <ul style="${ol}">
        <li style="${li}"><b>Titel, Beschreibung, Kategorie, Version</b> – neue Version ⇒ alle müssen erneut bestätigen.</li>
        <li style="${li}"><b>Dokumentenart</b> – die Verbindlichkeitsebene der Regelwerkspyramide: Handbuch, Policy, Konzernrichtlinie, Konzernfachregelung, Arbeits-/Prozessanweisung, Leitfaden, Weitere.</li>
        <li style="${li}"><b>Geltungsbereich (Standorte)</b> <b style="color:var(--c-primary)">– Pflichtangabe</b>: „Alle Standorte" (konzernweit) oder einzelne Werke: HOL, SHB, WGC, SCH, EIS, DSO, ZAI, LEG, MEG, EWA. Ohne Angabe lässt sich nicht speichern.</li>
        <li style="${li}"><b>Dokument</b> aus der Bibliothek wählen oder hochladen (mit Zielordner-Wähler; Versionsverlauf bleibt erhalten). Ist bereits ein Dokument zugeordnet, stehen <b>„✏️ In Office bearbeiten"</b> (On-Premise Office) und <b>„🌐 Im Browser bearbeiten"</b> zur Verfügung – wie bei den IMS-Dokumenten legt SharePoint beim Speichern automatisch eine neue Version an.</li>
        <li style="${li}"><b>Zielgruppe</b> – wer das Regelwerk sehen/bestätigen muss (Rollen/Abteilungen oder „für alle").</li>
        <li style="${li}"><b>Pflichtlektüre</b>, <b>Wissenstest</b> (Fragen + Bestehensquote), <b>Lernvideos</b>, <b>Wiederholungspflicht</b>.</li>
        <li style="${li}"><b>Dokumentenart und Kategorie</b> kommen beide aus der <b>Governance-Struktur</b> – dieselbe Systematik, in der das Konzernregelwerk geführt wird. Die <b>Dokumentenart</b> (Pflichtangabe) sind die <b>Spalten</b> der Matrix, also die Ebenen der Pyramide: Handbuch, Policy, Konzernrichtlinie … Unter dem Feld steht die Erklärung der gewählten Ebene. Die <b>Kategorie</b> sind die <b>Zeilen</b>, also das Themenfeld: Allgemein, Compliance, Security/Cyber Security … Wer dort umbenennt oder ergänzt, ändert damit die Auswahl im Editor. Ein bisheriger Wert bleibt wählbar, bis er ersetzt wird.</li>
        <li style="${li}"><b>Nächste Überprüfung (Review)</b> – interner Wiedervorlage-Termin (siehe „Fälligkeiten / Wiedervorlage").</li>
        <li style="${li}"><b>Normbezug</b> (eingeklappt, für jedes Regelwerk verfügbar): welche Anforderungen aus Normen und Recht das Regelwerk abdeckt; „↩ Aus Review übernehmen" befüllt bekannte Zuordnungen (siehe „IMS-Abdeckung").</li>
        <li style="${li}"><b>Freigabe-Workflow</b> (ausklappbare Abschnitte): eigene <b>Prüfer</b> bzw. <b>Freigeber</b> nur für dieses Regelwerk (leer = globale Einstellung) und die <b>Mitbestimmung</b> (KBR / Betriebsräte je Werk). Die Reihenfolge von <b>Freigabe</b> und <b>Mitbestimmung</b> lässt sich mit ▲▼ pro Regelwerk tauschen.</li>
        <li style="${li}"><b>Änderungshistorie</b> – direkt unter der Version, ausklappbar und schreibgeschützt: wer wann was geändert oder entschieden hat (siehe unten).</li>
      </ul>
      <div style="${hint}">🔒 <b>Pro-Regelwerk-Prüfer/-Freigeber ersetzen</b> die globalen für genau dieses Regelwerk (nicht additiv). Karten-Tags „👤 eigene Prüfer" / „👤 eigene Freigeber" zeigen an, wo das gesetzt ist.</div>
      <div style="${h3}">Änderungshistorie (Nachweis)</div>
      <p style="margin:0 0 8px;line-height:1.55">Jede Änderung wird automatisch mit <b>Zeitpunkt, Person und Inhalt</b> festgehalten – inhaltliche Bearbeitungen im Klartext (z. B. <i>Version: „1.0" → „2.0"</i>), dazu Einreichen, Prüf- und Mitbestimmungsentscheidungen samt Begründung, Freigaben, Veröffentlichung und Archivierung. Die jüngsten 200 Einträge bleiben erhalten.</p>
      <p style="margin:0 0 8px;line-height:1.55"><b>Versandprotokoll:</b> Auch jede Workflow-Mail steht in der Historie, mit Empfängern und Ergebnis: an die Prüfer, an den Betriebsrat, zur Freigabe an die Geschäftsleitung, die Bekanntgabe, die Erinnerung zur Kenntnisnahme und bei Konzepten die Mails an Geschäftsleitung und einreichende Person. <b>„Mail nicht versendet"</b> steht rot da, mit Grund, etwa wenn keine Adresse hinterlegt ist. Das ist zugleich der Beleg im Audit, dass die Beteiligten informiert wurden. Geschrieben wird dabei nur die Historie, damit eine Mail, die im Hintergrund rausgeht, keine gleichzeitige Entscheidung überschreibt.</p>
      <div style="${h3}">Außer Kraft setzen</div>
      <p style="margin:0 0 8px;line-height:1.55">Bei einem veröffentlichten Regelwerk gibt es im Editor <b>„📦 Archivieren"</b> (optional mit Grund, z. B. „abgelöst durch …"). Es verschwindet dann aus „Meine Regelwerke", bleibt aber mit allen Bestätigungen und der Historie für Audits erhalten. <b>„↩ Reaktivieren"</b> holt es zurück in den Entwurf – der Freigabeprozess läuft dann erneut.</p>
      <div style="${hint}">👥 Bearbeiten zwei Personen dasselbe Regelwerk, warnt die App beim Speichern („zwischenzeitlich geändert von …") und bietet an, abzubrechen und die aktuelle Fassung zu laden.</div>
      <div style="margin-top:10px;line-height:1.55"><b>„Zur Konformitätsprüfung"</b> startet den Freigabe-Workflow (siehe „Konformitätsprüfung &amp; Freigabe").</div>`,
      'ISO 27001 Klausel 7.5 (Dokumentierte Information), 5.2 (Politik), A.5.1 (Informationssicherheitsrichtlinien).'),

    sec('konzepte', 'Regelwerk-Konzepte', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Ein <b>Konzept</b> ist ein Vorschlag für ein mögliches neues Regelwerk – die Idee, wie es aussehen könnte bzw. <i>ob</i> es überhaupt erstellt werden soll. Damit wird nicht erst geschrieben und dann gefragt, sondern die <b>Geschäftsleitung entscheidet vorab</b> über Priorität und Umsetzung.</p>
      <p style="margin:0 0 8px;line-height:1.55">Zu finden im <b>Regelwerk Dashboard</b> über den Umschalter <b>„Regelwerke | 💡 Konzepte"</b>.</p>
      <div style="${h3}">Ablauf</div>
      <ol style="${ol}">
        <li style="${li}"><b>Konzept anlegen</b> (Button „💡 Regelwerk-Konzept"): Arbeitstitel, <b>Typ</b> und <b>Geltungsbereich</b> sind <b style="color:var(--c-primary)">Pflicht</b>, dazu Kategorie, Priorität, <b>Warum?</b> (Motivation) und optional <b>Wie könnte es aussehen?</b> (Skizze). Ein <b>Anhang</b> (Word/PDF, z. B. ein erster Entwurf) kann beigelegt werden – die Muster-Vorlage ist verlinkt.</li>
        <li style="${li}"><b>Zur GF-Prüfung einreichen</b> – die Geschäftsleitung erhält eine Mail mit allen Angaben, dem Anhang und drei Entscheidungs-Buttons. Anschließend bestätigt ein Hinweis, <b>an wen</b> die Nachricht gegangen ist und was als Nächstes passiert.</li>
        <li style="${li}"><b>Entscheidung</b> – direkt aus der Mail oder in der App: <b>✓ Annehmen</b>, <b>⏸ Zurückstellen</b> (mit Notiz) oder <b>✗ Ablehnen</b> (Begründung ist Pflicht).</li>
        <li style="${li}"><b>Bei Annahme</b> entsteht automatisch ein <b>Regelwerk-Entwurf</b>: Titel, Typ, Kategorie, Geltungsbereich und Motivation/Skizze werden übernommen, ein Anhang wird zum Startdokument. Die Geschäftsleitung bekommt nur die Bestätigung, dass der Entwurf angelegt ist – sie muss nichts weiter veranlassen.</li>
        <li style="${li}"><b>In der Änderungshistorie</b> des entstandenen Regelwerks steht die Annahme des
          Konzepts als erster Eintrag – mit entscheidender und einreichender Person. Der Weg ist damit
          lückenlos vom Vorschlag bis zur Veröffentlichung belegt.</li>
        <li style="${li}"><b>Rückmeldung an die einreichende Person:</b> Bei jeder Entscheidung – angenommen, zurückgestellt oder abgelehnt – geht automatisch eine Info-Mail an den Antragsteller, mit Entscheider, Datum und Begründung. Bei Annahme enthält sie die Frage <b>„Wie soll es weitergehen?"</b> mit zwei Schaltflächen: <b>Entwurf bearbeiten</b> (Dokument, Zielgruppe, Wissenstest, Mitbestimmung ergänzen) oder <b>direkt zur Konformitätsprüfung</b>. Diese Entscheidung liegt bewusst bei der Person, die das Konzept geschrieben hat.</li>
      </ol>
      <div style="${hint}">📬 Empfänger der Prüf-Mail ist die <b>Geschäftsleitung</b> aus <b>Einstellungen → „Geschäftsleitung"</b>. Nur diese Personen können über Konzepte entscheiden.</div>`,
      'ISO 27001 Klausel 6.2 (Ziele und Planung), 7.5.1 (Erstellung dokumentierter Information).'),

    sec('freigabe', 'Konformitätsprüfung & Freigabe', 'review', `
      <p style="margin:0 0 8px;line-height:1.5">Ablauf: <b>Entwurf → Konformitätsprüfung → Mitbestimmung (bei Betroffenheit) → Freigabe → Veröffentlicht.</b> Alles im Reiter <b>„Freigaben"</b>.</p>
      <p style="margin:0 0 8px;line-height:1.5">Jede Workflow-Mail enthält den Block
      <b>„Bereits freigegeben (zur Info)"</b>: Er listet alle bisherigen Zustimmungen –
      beginnend mit der <b>Konzeptfreigabe (GL)</b>, dann Konformitätsprüfung, Mitbestimmung und
      zuletzt die <b>Freigabe des Regelwerks (GL)</b>. Wer als Nächstes entscheidet, sieht damit ohne
      Rückfrage, wer den Vorgang schon mitgetragen hat.</p>
      <p style="margin:0 0 8px;line-height:1.5">Oben umschaltbar: <b>👤 Mir zugewiesen</b> (nur Vorgänge, für die Sie zuständiger Prüfer/Freigeber sind – Ihre To-dos) oder <b>🗂 Alle Vorgänge</b> (Gesamtübersicht aller laufenden Freigaben). Standard ist „Mir zugewiesen", sobald es etwas für Sie gibt. Die Abschnitte (Konformitätsprüfung · Mitbestimmung · Freigabe) lassen sich per Klick auf die Überschrift <b>ein-/ausklappen</b>.</p>
      <div style="${h3}">Die Status einer Regelwerk</div>
      ${tbl([
        ['Entwurf', 'In Bearbeitung durch die Administration; noch nicht im Prüf-/Freigabeprozess.'],
        ['Konformitätsprüfung', 'Bei den Prüfern zur fachlichen Konformitätsprüfung.'],
        ['Mitbestimmung (Betriebsverfassung)', 'Konform – zur Mitbestimmung beim betroffenen Konzern-/Betriebsrat (nur wenn im Editor als betroffen markiert). Entscheidung wie bei der Prüfung: <b>Konform</b> (→ Freigabe) oder <b>Nicht konform</b> (mit Pflicht-Begründung, zurück in die Prüfung).'],
        ['Freigabe', 'Konform – wartet auf die Freigabe der Geschäftsleitung.'],
        ['Veröffentlicht', 'Freigegeben und für die Zielgruppe sichtbar/zu bestätigen.'],
        ['Archiviert', 'Außer Kraft gesetzt; nicht mehr aktiv (nicht in Auswertungen).'],
      ])}
      <div style="${h3}">1 · Konformitätsprüfung (Prüfer)</div>
      <ul style="${ol}">
        <li style="${li}">Regelwerk öffnen (bei Bedarf <b>„✏️ In Office öffnen"</b> / <b>„🌐 Im Browser öffnen"</b>), dann <b>„Konform"</b> oder <b>„Nicht konform"</b>.</li>
        <li style="${li}">Bei <b>„nicht konform" ist eine Begründung Pflicht</b>. Die Regelwerk bleibt dann in Prüfung.</li>
        <li style="${li}"><b>„Konform", wenn …</b> alle Prüfer zustimmen <i>oder</i> eine Person reicht – je nach (globaler oder pro-Regelwerk-)Schwelle. Ist die Schwelle erreicht, geht es automatisch zur Freigabe.</li>
      </ul>
      <div style="${h3}">2 · Freigabe (Geschäftsleitung)</div>
      <ul style="${ol}">
        <li style="${li}"><b>„Freigeben"</b> (optional mit Kommentar) → das Regelwerk wird veröffentlicht.</li>
        <li style="${li}">Kommentare/Voten erscheinen im Verlauf der Karte.</li>
      </ul>
      <div style="${h3}">Direkt aus der E-Mail entscheiden</div>
      <ul style="${ol}">
        <li style="${li}"><b>App-Mails (Standard):</b> Prüf- und Freigabe-Mails enthalten Buttons <b>„✓ Konform / ✗ Nicht konform"</b> bzw. <b>„✓ Freigeben / ✗ Zurück"</b>. Ein Klick öffnet das Regelwerk in der App und führt die Entscheidung nach kurzer Rückfrage aus.</li>
        <li style="${li}"><b>Ein Klick aus der Mail:</b> Die Knöpfe <b>✓ Freigeben</b> / <b>✗ Zurück</b> (bzw. <b>Konform</b> / <b>Nicht konform</b>) führen auf eine Seite, die Sie <b>still anmeldet</b> und die Entscheidung <b>sofort ausführt</b> – kein Suchen, keine Rückfrage. Der Link enthält ein <b>Einmal-Token</b> der laufenden Runde: Ein Knopf aus einer älteren Mail führt nur noch zum Vorgang, entscheidet aber nichts. Ein Fehlklick lässt sich auf derselben Seite <b>zurücknehmen</b> (wird protokolliert).</li>
        <li style="${li}"><b>Wirklich ein Klick:</b> Der Klick in der Mail <b>ist</b> die Entscheidung – es kommt keine zweite Nachfrage. Auch die Frage „Wie soll es weitergehen?" entfällt auf diesem Weg – das entscheidet man später im Entwurf. Geprüft wird die Rolle (nur Prüfer, Geschäftsleitung bzw. Betriebsrat dürfen entscheiden), und was Pflicht ist – die Begründung bei „nicht konform" oder bei einer Ablehnung – wird weiterhin abgefragt. Die Anmeldung läuft im Hintergrund. Waren Sie in diesem Browser schon einmal angemeldet, sehen Sie direkt die Ergebnisseite; beim ersten Mal blitzt die Microsoft-Seite kurz auf – <b>ohne Kontoauswahl</b>, denn Ihre Mail nennt der Anmeldung bereits Ihr Konto. Dafür gehen die Entscheidungs-Mails <b>einzeln</b> raus statt als Sammelmail: Nur so gehört der Knopf wirklich Ihnen.</li>
        <li style="${li}"><b>Weitergeleitete Mail:</b> Klickt jemand anderes auf Ihren Knopf, bricht die App ab – der Link war an Sie adressiert, angemeldet ist jemand anderes. Gespeichert wird nichts; angeboten wird der Kontowechsel. Wer einspringen soll, wird als <b>Vertretung</b> eingetragen.</li>
        <li style="${li}"><b>Betriebsrat:</b> Die Mitbestimmungs-Mail trägt dieselben Knöpfe <b>✓ Konform</b> / <b>✗ Nicht konform</b> und zeigt, wer bereits zugestimmt hat. Sie geht an ein <b>Postfach</b>, nicht an eine Person – der Link trägt deshalb keinen Anmelde-Hinweis. Wer klickt, meldet sich mit dem eigenen Konto an; erkannt wird die Zugehörigkeit an der BR-Adresse aus den Einstellungen oder an der Mitgliedschaft in der hinterlegten Gruppe. Das Votum steht danach <b>namentlich</b> im Protokoll.</li>
        <li style="${li}"><b>„Nicht konform" wird begründet:</b> Bei Prüfung und Mitbestimmung fragt die Seite nach dem Grund, bevor sie speichert. Ohne Begründung passiert nichts.</li>
        <li style="${li}"><b>Warum trotzdem eine Anmeldung?</b> Ein Link allein belegt nur, dass jemand Zugriff auf das Postfach hatte – bei Weiterleitung oder Postfachvertretung sagt er nichts über die Person. Erst die Anmeldung macht aus dem Klick einen Nachweis, <b>wer</b> freigegeben hat. Dank Single Sign-On merkt man davon in aller Regel nichts.</li>
        <li style="${li}"><b>Geltungsbereich in den Mails:</b> Jede Workflow-Mail nennt jetzt, <b>für welche Standorte</b> ein Regelwerk gilt – Prüfung, Freigabe, Mitbestimmung (dort zusätzlich die betroffenen Werke), Bekanntgabe, Erinnerungen und Konzept-Mails. Wer entscheidet, muss dafür nicht erst die App öffnen.</li>
        <li style="${li}"><b>Bekanntgabe an die Zielgruppe:</b> Beim Veröffentlichen fragt die App, ob die Zielgruppe informiert werden soll, und schickt die Mitteilung an den <b>Verteiler</b> der Zielgruppe (Verteiler- oder Sicherheitsgruppe) – eine Mail statt hunderter Einzelnachrichten, Mitglieder pflegt Exchange. Die Mail nennt Titel, Version, was zu tun ist, und verlinkt direkt auf das Regelwerk; das Dokument hängt an. Nachholen oder wiederholen geht jederzeit über <b>„📣 Zielgruppe informieren"</b> im Audit Report. Zeitpunkt und Empfänger stehen anschließend in der Historie.</li>
        <li style="${li}"><b>Vertretung (Urlaub, Krankheit):</b> In den Einstellungen lässt sich je Person eine <b>Vertretung mit Zeitraum</b> hinterlegen. Solange er läuft, bekommt die Vertretung alle Mails mit und darf entscheiden; im Protokoll steht dann <b>„in Vertretung für …"</b>. Die vertretene Person bleibt zuständig und wird weiter angeschrieben.</li>
        <li style="${li}"><b>Power Automate (ohne Portal):</b> Alternativ läuft die Genehmigung als <b>actionable Outlook-Mail</b> – Genehmigen/Ablehnen wird <b>direkt in der Mail</b> geklickt, ganz ohne die App zu öffnen. In den Einstellungen je Etappe wählbar: <b>aus</b> · <b>nur Freigabe (Geschäftsleitung)</b> · <b>Prüfung + Freigabe</b>. Für die per Power Automate gesteuerte Etappe verschickt die App keine eigene Mail. In Outlook getroffene Freigaben erscheinen im <b>Audit Report</b> als eigenes Ereignis.</li>
      </ul>
      <div style="${h3}">Beispiel – eine neue Regelwerk von A bis Z</div>
      <div style="background:var(--c-bg,#f8fafc);border:1px solid var(--c-border,#e5e7eb);border-radius:10px;padding:12px 14px;line-height:1.6">
        <b>„Passwortrichtlinie v2.0"</b>, betrifft alle Werke, Mitbestimmung durch KBR + Werk SHB.
        <ol style="${ol}">
          <li style="${li}"><b>Anlegen:</b> Admin importiert die Word-Datei, setzt Zielgruppe „alle", Pflichtlektüre + Wissenstest, markiert im Editor <b>Konzernbetriebsrat</b> und Werk <b>SHB</b> als betroffen und klickt „Zur Konformitätsprüfung". → Status <b>Konformitätsprüfung</b>, der Prüfer (z. B. ISB) bekommt eine Mail.</li>
          <li style="${li}"><b>Prüfung:</b> Der ISB klickt in der Mail „✓ Konform". Schwelle erreicht → weil Mitbestimmung betroffen ist, geht es <b>nicht</b> direkt zur Freigabe, sondern zu Status <b>Mitbestimmung (Betriebsverfassung)</b>; KBR und BR-SHB erhalten automatisch das Dokument zur Mitbestimmung.</li>
          <li style="${li}"><b>Mitbestimmung:</b> Nach Rückmeldung klickt der/die Zuständige <b>„Konform"</b> (bei Ablehnung „Nicht konform" mit Begründung → zurück in die Prüfung). → Status <b>Freigabe</b>, die Geschäftsleitung wird informiert.</li>
          <li style="${li}"><b>Freigabe:</b> Ist Power Automate „nur Freigabe (GL)" aktiv, bekommt die GL eine <b>Outlook-Mail mit Genehmigen/Ablehnen</b> und klickt „Genehmigen" – <b>ohne Portalbesuch</b>. → Status <b>Veröffentlicht</b>, Zeitpunkt + Freigebende:r werden vermerkt.</li>
          <li style="${li}"><b>Wirkung:</b> Alle Mitarbeitenden sehen das Regelwerk ab jetzt unter „Meine Regelwerke" als „offen" und müssen Kenntnisnahme + Wissenstest erledigen; die Erfüllungsquote läuft im <b>Audit Report</b> mit.</li>
        </ol>
      </div>
      <div style="${hint}">⏰ <b>Erinnerungen & Eskalation</b> laufen automatisch (GitHub-Cron): erst nach X Tagen, dann alle Y Tage, ab Z Tagen zusätzlich an den Ersatz-Empfänger. Die richtige Person je Regelwerk wird erinnert (pro-Regelwerk-Prüfer/-Freigeber bevorzugt).</div>`,
      'ISO 27001 A.5.1 (Genehmigung &amp; Überprüfung der Regelwerke), Klausel 7.5.2 (Erstellen/Freigeben), 5.3 (Rollen); NIS2 Art. 20 (Verantwortung der Leitung).'),

    sec('health', 'Dokument-Health-Check', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter „Regelwerk Dashboard" → Button <b>„🩺 Dokumente prüfen"</b>. Prüft die angehängten Word-Dokumente <b>direkt im Browser, deterministisch und ohne KI</b>. Geprüft wird auf:</p>
      <ul style="${ol}">
        <li style="${li}"><b>Inhalts-Dubletten</b> – zwei Regelwerke mit identischem Dokumentinhalt (z. B. versehentlich falsche Datei angehängt).</li>
        <li style="${li}"><b>Titel-Abgleich</b> – passt der Dokumenttitel zur Regelwerk?</li>
        <li style="${li}"><b>Platzhalter</b> – offene Datums-Platzhalter (XX.XX.…), „tbd", unausgefüllte Freigabetabellen.</li>
        <li style="${li}"><b>Leere Pflichtkapitel</b> – Überschrift ohne Inhalt.</li>
        <li style="${li}"><b>Veraltete Begriffe (Terminologie)</b> – ein pflegbares Wörterbuch meldet z. B. alte Rollen-/Namensbezeichnungen mit Trefferzahl.</li>
        <li style="${li}"><b>Versions-/Metadaten-Abgleich</b> – weicht die im Dokument genannte Version von der App-Version ab?</li>
      </ul>
      <div style="${h3}">Ergebnis nutzen</div>
      <ul style="${ol}">
        <li style="${li}">Je Regelwerk erscheint ein Ampel-Badge (🟢 ohne Befund · 🟡 Hinweise · 🔴 kritisch · ⚪ nicht prüfbar).</li>
        <li style="${li}">Im Ergebnisbericht macht <b>„✏️ Als Vorschlag"</b> aus den Befunden einen vorausgefüllten Änderungsvorschlag an die Verantwortlichen.</li>
      </ul>`,
      'ISO 27001 Klausel 7.5.2/7.5.3 (Angemessenheit &amp; Lenkung dokumentierter Information), A.5.1 (Konsistenz der Regelwerke).'),

    sec('abdeckung', 'IMS-Abdeckung & SoA', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„IMS-Abdeckung"</b> zeigt als Heatmap, welche der 215 Anforderungen aus Normen und Recht durch mindestens ein Regelwerk abgedeckt sind – ISO 27001 und NIS2, dazu Datenschutz, KI-Verordnung, Lieferkette, Hinweisgeberschutz, Arbeits- und Umweltschutz, Recht und IKS.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Grün = gespeichert</b> (im Normbezug einer Regelwerk hinterlegt), <b>Gelb ◔ = vorläufig</b> aus der Review-Zuordnung (noch nicht gespeichert), <b>Rot = Lücke</b>.</li>
        <li style="${li}">Oben die Kennzahlen <b>Annex-A</b> und <b>NIS2</b> (gespeichert bzw. inkl. Review), darunter die <b>Lückenliste</b>.</li>
        <li style="${li}"><b>„✔ Review-Zuordnungen jetzt speichern"</b> überträgt die vorläufigen (gelben) Zuordnungen dauerhaft in den Normbezug der Regelwerke.</li>
        <li style="${li}">Eine Zelle anklicken zeigt, welche Regelwerke das Control abdecken.</li>
      </ul>
      <div style="${h3}">Export (Auditnachweis)</div>
      <ul style="${ol}">
        <li style="${li}"><b>🖨 Report</b> – öffnet einen druck-/PDF-fähigen Nachweis: Kennzahlen, Regelwerke mit Konformitäts-/Freigabestatus und Normbezug sowie die vollständige Control-Abdeckung.</li>
        <li style="${li}"><b>⬇ CSV</b> – lädt die Abdeckungsmatrix als CSV-Datei (öffnet in Excel).</li>
      </ul>
      <div style="${h3}">SoA – Erklärung zur Anwendbarkeit (zweiter Modus im Reiter)</div>
      <ul style="${ol}">
        <li style="${li}">Je Control: <b>anwendbar / ausgeschlossen</b>, <b>Umsetzungsstatus</b> (umgesetzt / teilweise / geplant / nicht umgesetzt) und <b>Begründung</b> – für <b>ausgeschlossene Controls ist die Begründung Pflicht</b>.</li>
        <li style="${li}">Die Regelwerk-Abdeckung wird je Control automatisch eingeblendet; <b>„⚡ Aus Abdeckung vorbelegen"</b> setzt alle noch offenen Controls auf anwendbar und leitet den Status aus der Abdeckung ab (gespeichert → umgesetzt, Review → geplant) – bereits Gepflegtes bleibt unangetastet.</li>
        <li style="${li}">Gespeichert wird versioniert (SoA-Version, wer, wann) in <code>soa-config.json</code>; Exporte: <b>🖨 SoA-Report</b> (das klassische Audit-Dokument) und <b>⬇ CSV</b>.</li>
      </ul>
      <div style="${h3}">Reifegrad IT/OT-Betrieb (dritter Modus im Reiter)</div>
      <ul style="${ol}">
        <li style="${li}">Gap-/Reifegrad-Bewertung des Betriebs-Katalogs <b>„IT und OT Betrieb"</b> je Maßnahme und Werk (DIHAG/EIS/DSO). Ampel: <b>🟢 funktioniert · 🟡 teilweise · 🔴 nicht gelebt · ⚪ keine Einschätzung</b> – Zelle anklicken zum Ändern.</li>
        <li style="${li}">Beim ersten Öffnen sind die Ampeln aus dem Dokument <b>vorbelegt</b> (gilt zunächst gleich für alle Werke); prüfen, je Werk verfeinern und <b>💾 speichern</b>.</li>
        <li style="${li}"><b>Selbst pflegbar:</b> eigene Maßnahmen je Thema <b>hinzufügen (+)</b> / <b>entfernen (✕)</b>, eigene <b>Themen</b> anlegen, Katalog-Maßnahmen ausblenden (reversibel über „↩ ausgeblendet").</li>
        <li style="${li}">Kennzahlen (Handlungsbedarf 🔴/🟡, bewertet-Quote, Ampel je Werk/Thema), Filter nach Werk/Ampel/Suche und <b>⬇ CSV</b>-Export. Speicherung in <code>reifegrad-config.json</code>.</li>
      </ul>`,
      'ISO 27001 Klausel 6.1.3 d) (Erklärung zur Anwendbarkeit – Pflichtdokument), 4.3 (Anwendungsbereich), Annex A (Controls); Reifegrad zusätzlich Klausel 8.1 (betriebliche Planung &amp; Steuerung), 9.1 (Bewertung); NIS2 Art. 21(2) (Maßnahmenkatalog).'),

    sec('faelligkeit', 'Fälligkeiten / Wiedervorlage', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Fälligkeiten"</b> bündelt die interne Überprüfung der Regelwerke anhand des Termins <b>„Nächste Überprüfung"</b> – <b>ISO 27001 A.5.1</b> verlangt die regelmäßige Überprüfung.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Rubriken</b> oben: <b>📘 Regelwerke</b> (mit der Zahl überfälliger), <b>📋 Maßnahmen, Ziele, Kennzahlen</b>, <b>🧪 Funktionsprüfung</b> und <b>🔀 Prozesse</b>; <b>„Alles"</b> zeigt sie wie bisher untereinander. Der Browser merkt sich die Wahl, ein Link mit <code>?rubrik=prozesse</code> springt direkt in eine Rubrik.</li>
        <li style="${li}">Gruppen: <b>überfällig</b> · <b>fällig in ≤ 30 Tagen</b> · <b>später terminiert</b> · <b>ohne Termin</b>, mit Kennzahl-Kacheln.</li>
        <li style="${li}"><b>„🔁 +12 Monate"</b> setzt den nächsten Überprüfungstermin sofort auf heute + 12 Monate.</li>
        <li style="${li}"><b>„✏ Bearbeiten"</b> öffnet das Regelwerk im Editor (z. B. um den Termin frei zu wählen).</li>
        <li style="${li}"><b>Funktionsprüfung des RMS:</b> Nach Änderungen am System ein Nachweis, dass es noch tut, was es soll (<b>ISO 27001 A.8.29, A.8.32</b>). Der Selbsttest im Probelauf legt ihn im Register „Wirksamkeit" ab, mit der geprüften Version. Ist die laufende Version noch nicht geprüft, wird die nächste Prüfung spätestens 30 Tage nach der letzten fällig. Hat die letzte Prüfung Fehler gefunden, steht das hier, bis sie abgeschlossen ist.</li>
        <li style="${li}"><b>Prozesse:</b> In ihrer Rubrik stehen die Prozesse aus Landkarten und Modellen mit ihrem <b>Review-Termin</b>: überfällig, ohne Review-Termin (ein POC ohne Termin für seine Bewertung oder ein freigegebener Prozess ohne Überprüfung), bald fällig, später. Ein Prozess in EOL fehlt hier, er wird nicht mehr überprüft. „Prozess öffnen" führt zur Kachel, der Termin wird dort unter „Bearbeiten" gepflegt.</li>
      </ul>
      <div style="${hint}">📧 Der Erinnerungs-Cron schickt zusätzlich einen <b>Fälligkeits-Digest</b> an die Admins: alle überfälligen und in den nächsten Tagen fälligen Überprüfungen, mit Direktlink in diesen Reiter.</div>`,
      'ISO 27001 A.5.1 (regelmäßige Überprüfung der Regelwerke), Klausel 9.3/10.1 (Bewertung &amp; fortlaufende Verbesserung).'),

    sec('risiken', 'Risiko-Register', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Risiko-Register"</b>: vollständiges Informationssicherheits-Risikomanagement nach <b>ISO 27001</b> und <b>NIS2</b> (Art. 21(2a)). Die SharePoint-Liste „Risiken" liegt auf der ISMS-Site und wird beim ersten Öffnen automatisch angelegt.</p>
      <div style="${h3}">Bewertung</div>
      <ul style="${ol}">
        <li style="${li}"><b>Brutto</b> (vor Maßnahmen) und <b>Netto/Restrisiko</b> (nach Maßnahmen), je <b>Eintrittswahrscheinlichkeit × Auswirkung (1–5)</b>. Stufen: Score <b>≥ 15 hoch</b>, <b>≥ 8 mittel</b>, sonst niedrig.</li>
        <li style="${li}"><b>5×5-Risikomatrix</b> (umschaltbar Brutto/Netto) zeigt die offenen Risiken je Zelle; Zellen-Klick filtert die Liste.</li>
        <li style="${li}"><b>Schutzziele (CIA)</b> je Risiko markierbar – <b>C</b>onfidentiality / <b>I</b>ntegrity / <b>A</b>vailability (englisch).</li>
      </ul>
      <div style="${h3}">Behandlung &amp; Maßnahmen</div>
      <ul style="${ol}">
        <li style="${li}">Strategie <b>mitigieren / vermeiden / übertragen / akzeptieren</b> – bei <b>„akzeptieren" ist die Begründung Pflicht</b> (Risikoakzeptanz, 6.1.3 f).</li>
        <li style="${li}"><b>Maßnahmenplan</b> je Risiko: Maßnahme, Verantwortlicher, Frist, Status (offen / in Umsetzung / erledigt). Überfällige Fristen werden rot markiert.</li>
        <li style="${li}"><b>Verknüpfungen</b> zu ISO-/NIS2-Controls (Normbezug-Katalog), zu Regelwerke und zu betroffenen <b>Assets</b> aus der ISMS-Liste „Assets" (Auswahl mit Suche im Editor).</li>
        <li style="${li}"><b>Wiedervorlage-Termin</b> je Risiko + automatische <b>Historie</b> (wer hat wann angelegt/geändert).</li>
      </ul>
      <div style="${hint}">📧 Der Erinnerungs-Cron mailt <b>überfällige Maßnahmen und Risiko-Reviews</b> automatisch an die Admins (mit Direktlink). Exporte: <b>🖨 Risikobericht</b> (Druck/PDF) und <b>⬇ CSV</b>. Tipp: Statt Löschen besser „Status: geschlossen" – so bleibt der Audit-Trail erhalten.</div>`,
      'ISO 27001 Klausel 6.1.2 (Risikobeurteilung), 6.1.3 (Risikobehandlung), 8.2/8.3 (Durchführung), A.5.2 (Verantwortlichkeiten); NIS2 Art. 21(1) (Risikomanagementmaßnahmen).'),


    sec('assets', 'Assetregister (Inventar)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Assetregister"</b> ist das Inventar nach <b>ISO 27001 A.5.9</b> – die Liste <b>„Assets"</b> auf der ISMS-Site, dieselbe wie bisher, jetzt geführt statt nur gelesen: Anlegen, Bearbeiten, Löschen. Was die Liste schon hat, wird tolerant gelesen – mit den Spalten des Hauses: <b>Asset-Typ</b> ist die Art (primär / unterstützend nach ISO 27005), <b>Standorte</b> sind die Werke („Alle DIHAG-Standorte" = konzernweit), <b>Asset-Owner</b> der Verantwortliche, <b>Informationsträger</b> die Abhängigkeit (worauf eine Information liegt – darüber vererbt sich der Schutzbedarf), <b>Link zu den Informationen</b> der Link, <b>weitere Infos</b> die Beschreibung; Vertraulichkeit, Integrität und Verfügbarkeit in der Skala der Liste, die Einstufung bei der Vertraulichkeit zugleich als Klassifizierung. Nachschlagefelder zeigt die App, pflegen tut man sie in SharePoint. Welche Spalten die App erwartet, nennt der Reiter mit Typ – anlegen kann man sie in SharePoint selbst oder mit <b>„Fehlende Spalten jetzt anlegen"</b>; still legt die App nichts an, die Liste gehört dem Haus. Was in keiner Spalte steht, kann sie nicht speichern.</p>
      <p style="margin:0 0 8px;line-height:1.55">Je Asset das, was ein Auditor fragt und was das Notfallmanagement rechnen muss:</p>
      ${tbl([
        ['Verantwortlich', 'A.5.9 – ein Asset ohne Eigentümer pflegt niemand. Plus Vertretung und Betreiber.'],
        ['Schutzbedarf V / I / A', 'Vertraulichkeit, Integrität, Verfügbarkeit nach BSI 200-2: normal, hoch, sehr hoch. <b>„sehr hoch" verlangt Wiederherstellzeit und RPO</b> (Reifegrad R093).'],
        ['Klassifizierung', 'öffentlich · intern · vertraulich · streng vertraulich (A.5.12). Pflicht bei Informationen und bei Vertraulichkeit „hoch"; Haken „personenbezogen" für die DSGVO.'],
        ['Werke', 'Kürzel oder konzernweit – die Trennung nach Gesellschaft und die Notfall-Sichten hängen daran.'],
        ['Wiederherstellzeit, RPO, Datensicherung', 'Die Zahl, an der jede Prozess-RTO hängt: Ein Prozess kann nicht schneller wieder da sein als das Langsamste, wovon er abhängt. Der Notfall-Reiter liest sie von hier.'],
        ['Hängt ab von', 'Asset → Asset. Fällt das Netz, fällt SAP mit – die Ausfall-Sicht rechnet die Kette durch („reißt mit"). Kreise werden abgewiesen.'],
        ['Lebenszyklus', 'Inbetriebnahme, Support-Ende (EOL), Status. ' + (typeof AM_VORLAUF_TAGE !== "undefined" ? AM_VORLAUF_TAGE : 90) + ' Tage vor EOL oder Vertragsende mahnt das System; abgelaufener Support ist eine Lücke.'],
        ['Hersteller, Lieferant, Support-Kontakt, Vertragsende', 'A.5.19–5.22 – und die Nummer, die man nachts braucht.'],
        ['Zusatzfelder', 'Aus <b>Einstellungen → Assetregister</b>: Inventarnummer, Kostenstelle, Wartungsfenster, Raum – Text, Zahl, Datum, Auswahl oder Ja/Nein, wahlweise Pflicht. Kein SharePoint-Umbau nötig; die Werte liegen als JSON am Asset. Auch die Kategorien sind dort änderbar.'],
      ])}
      <div style="${h3}">Was das Register daraus macht</div>
      <ul style="${ol}">
        <li style="${li}"><b>Schutzbedarfs-Vererbung</b> (BSI-Maximumprinzip): Hängt ein kritischer Prozess an einem Asset, braucht es Verfügbarkeit „sehr hoch", bei „mittel" mindestens „hoch". Steht weniger im Register, sagt eine der beiden Zahlen falsch – Hinweis im Register <i>und</i> im Notfallplan.</li>
        <li style="${li}"><b>Verwendung</b>: je Asset die Prozesse (aus der Landkarte) und die offenen Risiken, die darauf verweisen. Beim Löschen wird gewarnt; „außer Betrieb" ist meist die bessere Wahl – das Inventar zeigt dann, was es gab.</li>
        <li style="${li}"><b>Cockpit</b> (Assets, ohne Verantwortlichen, „sehr hoch" ohne Wiederherstellzeit), <b>Audit Report</b> (A.5.9 und A.5.12 als eigene Zeilen), <b>Asset-Digest</b> im Cron (auslaufender Support, fehlende Verantwortliche, fehlende Zeiten).</li>
        <li style="${li}"><b>🖨 Inventar</b> als PDF – nach Kategorien, mit Schutzbedarf, Zeiten und Lieferant: der Nachweis zu A.5.9. <b>⬇ CSV</b> mit allen Feldern einschließlich Zusatzfeldern.</li>
      </ul>
      <div style="${hint}">Der Reiter ist standardmäßig nur für die Administration sichtbar – unter „Einstellungen" je Person freischaltbar. Die Wiederherstellzeit im Notfall-Editor schreibt ins Register und braucht dessen Schreibrecht; ohne es steht sie dort nur zum Lesen.</div>`,
      'ISO 27001 A.5.9 (Inventar der Informationen und anderen Werte), A.5.10 (zulässige Verwendung), A.5.12 (Klassifizierung), A.5.19–5.22 (Lieferanten); BSI-Standard 200-2 (Strukturanalyse, Schutzbedarfsfeststellung, Vererbung); NIS2 Art. 21 (2i); Reifegrad R093.'),

    sec('ziele', 'Ziele', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Ziele"</b>: die Liste <b>„ISMS Ziele"</b> der ISMS-Site, geprüft gegen <b>ISO 27001 6.2</b> und die Konzernrichtlinie <b>Zieleplanung und -erreichung</b>. Das RMS liest und schreibt die Einträge mit den Spalten der Liste, wie sie sind; es legt keine Liste an und ändert keine Spalte.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Je Ziel:</b> Ziel, Beschreibung, Umsetzung bis, Messung, Zieltyp, Status, Verantwortlich (Teams), Standort, Priorität, die verknüpften Maßnahmen und die Bewertung (Zielerreichung Ja oder Nein, Bemerkung).</li>
        <li style="${li}"><b>Was die Richtlinie verlangt</b>, steht beim Namen da, solange es fehlt: Verantwortung, Termin, Messung, mindestens eine Maßnahme, Ressourcen (in der Liste stehen sie an den Maßnahmen). Ist der Termin überschritten, gehört das Ergebnis ins Management Review, auch wenn das Ziel nicht erreicht ist.</li>
        <li style="${li}"><b>Status</b> wie in der Liste: Nicht begonnen, Wie geplant, Verzögert, Gefährdet, Verschoben, Abgeschlossen, Gestoppt. <b>„Abschließen"</b> verlangt die Angabe zur Zielerreichung, bei „Nein" eine Begründung in der Bemerkung.</li>
        <li style="${li}"><b>Maßnahmen zur Zielerreichung</b> werden am Ziel verknüpft (Suche mit Haken). <b>„+ Neue Maßnahme zu diesem Ziel"</b> legt eine in der Liste „Maßnahmen" an und verknüpft sie gleich. Der Balken zeigt, wie viele abgeschlossen sind.</li>
      </ul>
      <div style="${hint}">Im <b>Cockpit</b> (laufend, erreicht, Termin überschritten), in den <b>Fälligkeiten</b> (Ziele über dem Termin) und im <b>Audit Report</b> als Zeile <b>ISO 6.2</b>.</div>`,
      'ISO 27001 Klausel 6.2 (Informationssicherheitsziele und Planung zu deren Erreichung), 9.3 (Managementbewertung); Konzernrichtlinie Zieleplanung und -erreichung.'),

    sec('massnahmen', 'Maßnahmen (Gesamtliste)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Maßnahmen"</b>: die Liste <b>„Maßnahmen"</b> der ISMS-Site zusammen mit den Maßnahmen aus <b>Risiko-Register</b> und <b>Wirksamkeit</b> des RMS (Abweichungen, Managementbewertungen, Notfallübungen). Die der Liste werden hier gepflegt, mit ihren Spalten, wie sie sind; die aus den Registern dort, wo sie entstanden sind, ein Klick führt hin. Zwei Orte für dieselbe Maßnahme wären zwei Wahrheiten.</p>
      <div style="${h3}">Kategorisierung</div>
      ${tbl([
        ['Entspringt aus', 'Externes Audit, Internes Audit, Management Review, Risikobehandlung, Sicherheitsvorfall, Tests und Übungen, Zielemanagement; mehrere sind möglich. Maßnahmen aus den Registern des RMS bekommen die passende Angabe.'],
        ['Team', 'aus der Nachschlageliste „Teams".'],
        ['Thema (ISO 27002)', 'organisatorisch, personell, physisch, technologisch: abgeleitet aus dem verknüpften Control der ISO/IEC 27001:2022 (A.5 bis A.8).'],
        ['Status', 'Offen, In Bearbeitung, Zurückgestellt, Abgeschlossen.'],
        ['Durchführung', 'Einmalig oder Kontinuierlich.'],
        ['Register', 'Liste „Maßnahmen", Risiko-Register oder Wirksamkeit.'],
      ])}
      <ul style="${ol}">
        <li style="${li}"><b>„Kategorisieren nach"</b> wählt das Merkmal für die Übersicht (offen, in Bearbeitung, überfällig, zurückgestellt, abgeschlossen je Gruppe) und für die Gruppen der Liste. Filter je Merkmal und nach Ziel, dazu „nur offene", „nur überfällige" und „mit Archiv".</li>
        <li style="${li}"><b>Je Maßnahme der Liste:</b> Detailbeschreibung, Entspringt aus, Status, Durchführung, Team, Verantwortlich zur Umsetzung, geplante Umsetzung, Umsetzungsdatum, Controls der ISO/IEC 27001:2022 (mit Suche), Ressourcen, Quelle / Bericht, Auswirkung auf Eintrittswahrscheinlichkeit und Schadenshöhe, Archiv.</li>
        <li style="${li}"><b>Was fehlt</b>, steht je Zeile: Verantwortung (Person oder Team), geplanter Termin, woraus sie entspringt; eine abgeschlossene Maßnahme braucht ihr Umsetzungsdatum. <b>„Abschließen"</b> setzt es auf heute, wenn es leer ist.</li>
        <li style="${li}"><b>⬇ CSV</b> exportiert die gefilterte Gesamtliste mit allen Merkmalen.</li>
      </ul>
      <div style="${hint}">Im <b>Cockpit</b>, in den <b>Fälligkeiten</b> (überfällige Maßnahmen aus allen Registern) und im <b>Audit Report</b> als Zeile „Maßnahmen (alle Register)".</div>`,
      'ISO 27001 Klausel 6.1.3 (Risikobehandlung), 6.2 (Planung der Zielerreichung), 10.1 (fortlaufende Verbesserung), 10.2 (Korrekturmaßnahmen); ISO 27002:2022 Themen.'),

    sec('kennzahlen', 'Kennzahlen', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Kennzahlen"</b>: die Listen <b>„Kennzahlen"</b> und <b>„Kennzahlen Tracking"</b> der ISMS-Site nach <b>ISO 27001 9.1</b>: was gemessen wird, wie, wie oft, von wem, und was herauskam. Gepflegt mit den Spalten der Listen, wie sie sind.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Je Kennzahl:</b> Kennzahl-Typ, Turnus, Einheit, Verantwortlich (Team), Normalwert, Messung, Zweck, Umfang, Betroffener Bereich, Standort, Archiv. Die Messwerte stehen in „Kennzahlen Tracking"; <b>„+ Wert"</b> legt dort einen Eintrag an (IST-Wert, Datum der Erhebung, Erhoben durch, Bemerkung).</li>
        <li style="${li}"><b>Ampel aus dem Normalwert:</b> „&lt;= 5 offene Maßnahmen" ist eine Grenze, „Grün: &gt; 90%, Gelb: 70-90%, Rot: &lt; 70%" eine Ampel, „60%" bei Einheit Prozentsatz ein Mindestwert. Lässt sich keine Grenze lesen, bleibt die Ampel offen und das steht als Lücke da.</li>
        <li style="${li}"><b>Trend und Verlauf</b> aus den letzten Messwerten; die <b>nächste Messung</b> folgt aus dem Turnus und wird rot, wenn sie fällig ist.</li>
        <li style="${li}"><b>Vom RMS gemessen:</b> „Jetzt messen" liest die Register wie der Audit Report und zeigt Werte, die ohnehin entstehen: Kenntnisnahme-Quote, Anhang-A-Abdeckung, umgesetzte Controls, offene hohe Risiken, offene und überfällige Maßnahmen, offene Abweichungen, abgelaufene Ausnahmen, überfällige Überprüfungen, unbeurteilte Vorfälle, Ziele im Plan. Jeder Wert lässt sich als Messwert einer gewählten Kennzahl eintragen; der Browser merkt sich die Zuordnung.</li>
        <li style="${li}"><b>Prozesskennzahlen</b> aus Landkarte und Modellen stehen darunter, nur zur Ansicht; gepflegt werden sie am Prozess.</li>
      </ul>
      <div style="${hint}">Im <b>Cockpit</b> (grün, gelb oder rot, Messung fällig), in den <b>Fälligkeiten</b> (Messung fällig) und im <b>Audit Report</b> als Zeile <b>ISO 9.1</b>.</div>`,
      'ISO 27001 Klausel 9.1 (Überwachung, Messung, Analyse und Bewertung), ISO 9001 4.4 c (Prozesskennzahlen).'),

    sec('ausnahmen', 'Ausnahmeregister (Abweichungen)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Ausnahmen"</b>: dokumentierte, <b>befristete</b> Abweichungen von einer Richtlinie. Der Reifegrad-Katalog verlangt sie in <b>R130</b> – „Ausnahmen: Mit Risikobewertung, befristet, Entscheidung dokumentiert, ISB einbeziehen". Jedes dieser vier Worte ist hier eine Bedingung, keine Beschriftung: Fehlt eines, verweigert das Register die Genehmigung. Die SharePoint-Liste „Ausnahmen" liegt wie die Risiken auf der ISMS-Site und wird beim ersten Öffnen automatisch angelegt.</p>
      <div style="${h3}">Was eine Genehmigung verlangt</div>
      ${tbl([
        ['Risikobewertung', 'Eintritt × Auswirkung auf derselben 1–5-Skala wie im Risiko-Register. Optional mit einem Risiko dort verknüpfbar. Ab Wert <b>15 („hoch")</b> sind zusätzlich <b>kompensierende Maßnahmen</b> zu benennen.'],
        ['Befristung', 'Ein Enddatum ist <b>Pflicht</b> – ohne lässt sich nicht einmal speichern. Über <b>12 Monate</b> fragt das System nach: Eine so lange Abweichung gehört meist in die Richtlinie selbst.'],
        ['Entscheidung', 'Person und Zeitpunkt werden festgehalten, der Kommentar wandert in den Verlauf. <b>Vier-Augen-Prinzip:</b> Wer beantragt hat, kann nicht selbst genehmigen.'],
        ['ISB', 'Der Informationssicherheitsbeauftragte wird mit Namen und Datum vermerkt – vor der Genehmigung.'],
      ])}
      <div style="${h3}">Status</div>
      <ul style="${ol}">
        <li style="${li}"><b>beantragt</b> → <b>genehmigt</b> oder <b>abgelehnt</b>; eine laufende Ausnahme lässt sich <b>zurückziehen</b>.</li>
        <li style="${li}"><b>„abgelaufen" wird gerechnet, nicht gespeichert.</b> Sobald das Enddatum vorbei ist, zeigt das Register die Ausnahme als abgelaufen – ohne dass jemand etwas umstellen muss. Ein von Hand gepflegter Status wäre am Tag nach dem Stichtag falsch, und es fiele niemandem auf.</li>
        <li style="${li}">Ein <b>abgelehnter</b> Antrag läuft nicht ab – nur Genehmigungen haben eine Frist.</li>
      </ul>
      <div style="${h3}">Wo die Ausnahme auftaucht</div>
      <ul style="${ol}">
        <li style="${li}"><b>An der Richtlinie selbst</b> – als Markierung auf der Kachel und als Kasten in der Detailansicht: Titel, Frist, Geltung. Wer eine Regel befolgen soll, muss wissen, ob sie für ihn ausgesetzt ist.</li>
        <li style="${li}"><b>Nur das Faktum, nicht die Akte:</b> Begründung, Risikobewertung, ISB und Entscheidungskommentar bleiben im Register, das dem Reiterrecht unterliegt.</li>
        <li style="${li}">Im <b>Cockpit</b> (gültig / abgelaufen / unentschieden) und im <b>Audit Report</b> als Zeile <b>ISO A.5.36</b>.</li>
        <li style="${li}">Die <b>Trennung nach Gesellschaft</b> gilt: Ohne Werksangabe gilt eine Ausnahme konzernweit, sonst nur dort.</li>
      </ul>
      <div style="${hint}">📧 Der Erinnerungs-Cron meldet <b>abgelaufene</b>, in <b>30 Tagen auslaufende</b> und <b>unentschiedene</b> Ausnahmen an die Admins – ebenso genehmigte ohne Enddatum aus Altbeständen. Export: <b>⬇ CSV</b>. Tipp: Ist eine Abweichung beendet, „zurückziehen" statt löschen – eine gelöschte Entscheidung lässt sich im Audit nicht mehr zeigen.</div>`,
      'ISO 27001 A.5.36 (Einhaltung von Richtlinien, Regeln und Standards), Klausel 6.1.3 (Risikobehandlung/-akzeptanz); Reifegrad-Katalog R130 (T24 Verantwortung, Compliance, Ausnahmen, Sanktionen).'),

    sec('wirksamkeit', 'Wirksamkeit &amp; Verbesserung', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Wirksamkeit"</b> deckt drei Normkapitel ab, die das System bisher nur benennen konnte: <b>9.2</b> internes Audit, <b>9.3</b> Managementbewertung, <b>10.2</b> Nichtkonformität und Korrekturmaßnahmen. Eine Richtlinie beschreibt, wie etwas laufen <i>soll</i>; hier steht, <i>dass</i> es gelaufen ist.</p>
      <p style="margin:0 0 8px;line-height:1.55"><b>Ein Register, fünf Satzarten</b> (Abweichung, internes Audit, Managementbewertung, Notfallübung, Funktionsprüfung), nicht fünf Register mit derselben Mechanik. Eine Auditfeststellung ist keine Kopie einer Abweichung, sie ist eine; sie trägt nur ein Feld mehr, das sagt, woher sie stammt. Wer den Zusammenhang in drei Listen zerlegt, muss ihn danach von Hand wiederherstellen.</p>
      <div style="${h3}">Was zum Abschließen verlangt wird</div>
      ${tbl([
        ['⚠️ Abweichung<br><span style="font-weight:400;color:var(--c-muted)">ISO 10.2</span>',
         '<b>Ursache</b> (nicht das Symptom), mindestens eine <b>erledigte Maßnahme</b> und eine <b>Wirksamkeitsbewertung</b>. Der dritte Schritt ist der, der übersprungen wird: „Maßnahme erledigt" heißt nicht „Problem behoben". Solange er fehlt, lässt sich der Eintrag nicht abschließen.'],
        ['🔍 Internes Audit<br><span style="font-weight:400;color:var(--c-muted)">ISO 9.2</span>',
         '<b>Umfang und Kriterien</b>, <b>Auditoren</b> und ein <b>Ergebnis</b>. Gefundene Abweichungen werden als eigene Einträge angelegt und tragen das Audit als Herkunft – dann hängen sie sichtbar zusammen, in beide Richtungen.'],
        ['⚖️ Managementbewertung<br><span style="font-weight:400;color:var(--c-muted)">ISO 9.3</span>',
         'Alle <b>acht Pflichteingaben</b> aus 9.3.2 als Haken, <b>Teilnehmende</b> und die <b>Entscheidungen</b>. Fehlt ein Haken, nennt das Register ihn beim Namen – im Audit fehlt er sonst auch, nur später.'],
        ['🧪 Funktionsprüfung<br><span style="font-weight:400;color:var(--c-muted)">ISO A.8.29 · A.8.32</span>',
         '<b>Was geprüft wurde</b> (welcher Ablauf, nach welcher Änderung) und ein <b>Ergebnis</b>. Der Selbsttest im Probelauf legt sie auf Knopfdruck selbst an. Was nicht funktioniert hat, wird als Abweichung mit der Prüfung als Herkunft angelegt.'],
      ])}
      <div style="${h3}">Maßnahmen und Fristen</div>
      <ul style="${ol}">
        <li style="${li}">Je Eintrag ein <b>Maßnahmenplan</b>: was, wer, bis wann, Status. Überfällige Fristen färben den Status rot und ziehen den Eintrag nach oben.</li>
        <li style="${li}">Die Liste ist nach <b>Dringlichkeit</b> sortiert: erst Überfälliges, dann Offenes, dann der Rest nach Datum.</li>
        <li style="${li}">Die Spalte <b>Nachweis</b> sagt je Zeile, wie viele Angaben zum Abschluss noch fehlen – vor dem Audit, nicht während.</li>
      </ul>
      <div style="${h3}">Wo es sonst noch auftaucht</div>
      <ul style="${ol}">
        <li style="${li}">Im <b>Cockpit</b>: offene Abweichungen, überfällige Maßnahmen, Datum der letzten Bewertung.</li>
        <li style="${li}">Im <b>Audit Report</b> als drei eigene Zeilen (9.2, 9.3, 10.2). Eine abgeschlossene Abweichung ohne Wirksamkeitsbeleg zählt dort als <b>Lücke</b>, nicht als Hinweis.</li>
        <li style="${li}">Die <b>Trennung nach Gesellschaft</b> gilt: ohne Werksangabe konzernweit, sonst nur dort.</li>
      </ul>
      <div style="${hint}">Die SharePoint-Liste „Wirksamkeit" liegt wie Risiken und Ausnahmen auf der ISMS-Site und wird beim ersten Öffnen automatisch angelegt. Export: <b>⬇ CSV</b> – mit einer Spalte „Nachweis vollständig", die sich einem Auditor ohne Erklärung erschließt. Tipp: Statt Löschen „verworfen" – eine gelöschte Feststellung lässt sich nicht mehr zeigen.</div>`,
      'ISO 27001 Klausel 9.2 (Internes Audit), 9.3 (Managementbewertung, Eingaben nach 9.3.2), 10.2 (Nichtkonformität und Korrekturmaßnahmen); ISO 9001/14001/45001 kennen dieselben Kapitel.'),


    sec('notfall', 'Notfall &amp; Krisenstab (BCM)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Notfall &amp; Krisenstab"</b> beantwortet die Frage, die im Ernstfall gestellt wird: <i>„Der Server ist weg – was steht, was zuerst?"</i> Er folgt BSI-Standard 200-4 und ISO 22301; ISO 27001 verlangt es in <b>A.5.29</b> (Störungen) und <b>A.5.30</b> (IKT-Bereitschaft), NIS2 in Art. 21 (2c). Der Reifegrad-Katalog fragt es seit jeher ab (R093 RPO/RTO, R071 Systemverantwortliche) – jetzt kann die App antworten.</p>
      <p style="margin:0 0 8px;line-height:1.55"><b>Der Plan hängt am Prozess, nicht am Asset.</b> Ein Server, der ausfällt, ist kein Notfall – ein Notfall ist der Prozess, der deshalb steht. Deshalb trägt jede Kachel der <b>Prozesslandkarte</b> ihre Business-Impact-Analyse, ihre Assets und ihren Plan. Nichts davon ist eine neue Liste: Es steht in derselben Datei wie die Landkarte, und die Trennung nach Gesellschaft gilt von selbst mit.</p>
      <div style="${h3}">Drei Sichten</div>
      ${tbl([
        ['📊 BIA &amp; Pläne', 'Jeder Prozess des Werks mit Kritikalität, MTPD/RTO/RPO, Assets, Plan, letzter Übung und Lücken – sortiert: kritische zuerst, darin nach RTO. Klick öffnet BIA und Plan.'],
        ['⚡ Ausfall-Sicht', 'Asset wählen → betroffene Prozesse in der Reihenfolge, in der sie wiederherzustellen sind (kürzeste RTO zuerst) → deren Pläne. Darunter: welche Assets <b>mehrere kritische Prozesse</b> tragen – der Single Point of Failure, den bisher niemand so genannt hat.'],
        ['🧭 Krisenstab', 'Je Werk: Rollen, Namen, Nummern, Vertretungen, Alarmierungskette, Treffpunkt, Kommunikationskanal und Ersatzkanal, externe Stellen. Die Vorlage bringt die acht Rollen nach BSI 200-4 mit.'],
      ])}
      <div style="${h3}">Die Business-Impact-Analyse</div>
      <table class="doku-tbl"><tbody>${Object.entries(typeof NF_KRITIKALITAET !== 'undefined' ? NF_KRITIKALITAET : {}).map(([k, v]) => `<tr>
        <td style="font-weight:600;white-space:nowrap;color:${v.farbe}">${esc(v.label)}</td><td>${esc(v.text)}</td></tr>`).join('')}</tbody></table>
      ${tbl([
        ['MTPD', 'Maximal tolerierbare Ausfallzeit – ab wann der Schaden nicht mehr tragbar ist.'],
        ['RTO', 'Wiederanlaufzeit – bis wann der Prozess wieder laufen muss. Muss <b>unter</b> der MTPD liegen; liegt sie darüber, ist das eine Lücke.'],
        ['RPO', 'Tolerierbarer Datenverlust – wie alt der letzte gesicherte Stand sein darf.'],
        ['Assets', 'Aus dem <b>Assetregister</b> (Reiter „Assetregister"), je Asset eine <b>Wiederherstellzeit</b>, die für alle Prozesse gilt. Daraus die Zahl, die alle raten und niemand rechnet: <b>Ein Prozess kann nicht schneller wieder da sein als das Langsamste, wovon er abhängt.</b> Ist die RTO kürzer als die Wiederherstellzeit eines Assets, ist sie nicht haltbar – und das steht dann so da.'],
      ])}
      <div style="${h3}">Der Notfallplan</div>
      <p style="margin:0 0 8px;line-height:1.55">In der Reihenfolge, in der er gebraucht wird. Kurz, konkret, für jemanden, der den Prozess nicht kennt.</p>
      <table class="doku-tbl"><tbody>${(typeof NF_PLAN_TEILE !== 'undefined' ? NF_PLAN_TEILE : []).map(t => `<tr>
        <td style="font-weight:600;white-space:nowrap">${esc(t.titel)}${t.pflicht ? ' <span class="req">*</span>' : ''}</td><td>${esc(t.frage)}</td></tr>`).join('')}</tbody></table>
      <p style="margin:8px 0;line-height:1.55">Dazu <b>Kontakte als Rollen</b> (wen ruft man um drei Uhr nachts an?) und eine verantwortliche Person. Der Krisenstab-Reiter ist die Vorlage dafür, nicht der Ersatz.</p>
      <div style="${h3}">Was verweigert und was gemeldet wird</div>
      ${tbl([
        ['Kritikalität „hoch" ohne RTO und RPO', '<b>Wird nicht gespeichert</b> (Reifegrad R093). Wer „kritisch" sagt, muss sagen, was das heißt – oder vorerst „mittel" wählen.'],
        ['Kritischer Prozess ohne Plan, ohne Assets, ohne Kontakte', 'Lücke – im Reiter, im Cockpit und im <b>Audit Report</b> (A.5.30). Gespeichert wird trotzdem: Ein halber Plan ist im Ernstfall besser als keiner.'],
        ['RTO über MTPD, RTO kürzer als Asset-Wiederherstellung', 'Lücke – die Zahlen widersprechen sich.'],
        ['Plan ohne Übung seit 12 Monaten', 'Hinweis im Reiter, Zeile im Notfall-Digest (Cron). Ein Plan ohne Übung ist Papier.'],
        ['Krisenstab ohne Leitung, Vertretung, Nummern, Treffpunkt, Kanal, Ersatzkanal', 'Lücke – Audit Report A.5.29. Nach 12 Monaten ohne Aktualisierung mahnt der Cron: Telefonnummern veralten schneller als Pläne.'],
        ['Eskalationsstufe ohne Ausrufer', 'Lücke im Krisenstab – Störung, Notfall und Krise brauchen je jemanden, der sie ausruft.'],
      ])}
      <div style="${h3}">Übungen</div>
      <p style="margin:0 0 8px;line-height:1.55">Übungen sind die <b>vierte Satzart</b> im Wirksamkeits-Register: Eine Übung prüft einen Plan und findet Abweichungen – dieselbe Kette wie ein Audit. Gefundene Lücken werden dort zu Abweichungen mit Ursache, Frist und Wirksamkeitsprüfung. Abschließen lässt sich eine Übung erst mit Prozess, Übungsart, Szenario, Teilnehmenden und Ergebnis.</p>
      <table class="doku-tbl"><tbody>${Object.values(typeof NF_UEBUNGSARTEN !== 'undefined' ? NF_UEBUNGSARTEN : {}).map(a => `<tr>
        <td style="font-weight:600;white-space:nowrap">${esc(a.label)}</td><td>${esc(a.text)}</td></tr>`).join('')}</tbody></table>
      <div style="${h3}">Der Krisenstab</div>
      <table class="doku-tbl"><tbody>${(typeof NF_STAB_ROLLEN !== 'undefined' ? NF_STAB_ROLLEN : []).map(r => `<tr>
        <td style="font-weight:600;white-space:nowrap">${esc(r.rolle)}${r.pflicht ? ' <span class="req">*</span>' : ''}</td><td>${esc(r.aufgabe)}</td></tr>`).join('')}</tbody></table>
      <div style="${h3}">Die Eskalationsstufen</div>
      <p style="margin:0 0 8px;line-height:1.55">Störung → Notfall → Krise nach BSI 200-4. Die Stufen sind <b>fest</b>; je Werk wird im Krisenstab ausgefüllt, <b>wer sie ausruft</b> und <b>wen er alarmiert</b> – jede Stufe braucht einen Ausrufer, sonst wird aus einer Störung ein Notfall, ohne dass es jemand sagt. Der Rest wird <b>gerechnet</b>, nicht entschieden: Ein Prozess ist in Störung, bis seine RTO reißt, danach im Notfall; ab der MTPD ist es eine Krise. Die Ausfall-Sicht sagt deshalb zu jedem Asset, welche Stufe sein Ausfall wäre – „Ist das schon ein Notfall?" hat eine Antwort, bevor jemand aufgeregt ist.</p>
      <table class="doku-tbl"><tbody>${(typeof NF_STUFEN !== 'undefined' ? NF_STUFEN : []).map(v => `<tr>
        <td style="font-weight:700;white-space:nowrap;color:${v.farbe}">${v.nr} – ${esc(v.label)}</td>
        <td>${esc(v.kriterium)}<div style="color:var(--c-muted);font-size:.85em;margin-top:2px">Ausrufen: ${esc(v.erklaert)} · alarmiert: ${esc(v.alarmiert)} · Mittel: ${esc(v.mittel)}${v.meldepflicht ? ' · ' + esc(v.meldepflicht) : ''}</div></td></tr>`).join('')}</tbody></table>
      <div style="${h3}">Drucken – bewusst</div>
      <ul style="${ol}">
        <li style="${li}"><b>🖨 Notfallhandbuch:</b> Deckblatt, Krisenstab und Alarmierung, kritische Prozesse nach RTO, wovon sie abhängen, je Prozess der vollständige Plan. Als PDF in die Schublade – eine Web-App mit Anmeldung ist im Ernstfall vielleicht selbst das, was nicht geht.</li>
        <li style="${li}"><b>🖨 Alarmkarte:</b> eine Seite, wen man anruft. Zum Aushängen an Pforte, Leitstand, Serverraum.</li>
        <li style="${li}"><b>🖨 Plan drucken</b> im Editor: nur dieser Prozess – auch ungespeichert, mit dem Stand im Editor.</li>
      </ul>
    `),

    sec('vorfaelle', 'Vorfälle &amp; Ereignisse (Ticketsystem)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Vorfälle &amp; Ereignisse"</b> holt aus dem <b>Ticketsystem</b> (Site „ticket", Liste „Tickets"), was Informationssicherheit ist – über die <b>Kategorie</b> des Tickets. Dort landen Störungen, Änderungen und Dokumentationsaufträge, getrennt nach der <b>Art</b> des Tickets; der Reiter zeigt sie in drei Abschnitten: <b>Vorfälle &amp; Ereignisse</b> (ISO 27001 A.5.24–A.5.28, NIS2 Art. 23), <b>Änderungen</b> (A.8.32) und <b>Dokumentation</b> (A.5.37). Das Ticket bleibt, wo es ist – bearbeitet wird im Ticketsystem, die App schreibt nie hinein.</p>
      <p style="margin:0 0 8px;line-height:1.55"><b>Was die App darüberlegt</b> – je Ticket, gespeichert in <code>vorfaelle.json</code> im Konfig-Ordner:</p>
      ${tbl([
        ['Beurteilung (A.5.25)', 'Ereignis oder Sicherheitsvorfall? Nach ' + (typeof VF_BEURTEILUNG_TAGE !== 'undefined' ? VF_BEURTEILUNG_TAGE : 2) + ' Tagen ohne Beurteilung ist das eine Lücke – im Reiter, im Cockpit, im Audit Report, im Cron.'],
        ['Erheblich (NIS2 Art. 23)', 'Dann laufen die Fristen ab Kenntnis: <b>Frühwarnung 24 h</b>, <b>Meldung 72 h</b>, <b>Abschlussbericht ein Monat</b> nach der Meldung. Je Frist der Zeitstempel der Erledigung; überfällig ist rot, verspätet abgegeben bleibt sichtbar.'],
        ['Personendaten (DSGVO Art. 33)', 'Meldung an die Aufsichtsbehörde binnen 72 h – als vierte Frist.'],
        ['Eskalationsstufe', 'Störung, Notfall, Krise – dieselben Stufen wie im Notfall-Reiter. Ab Notfall ist der Krisenstab des Werks zuständig.'],
        ['Ursache, Reaktion, Lehren (A.5.26 · A.5.27)', 'Ein erledigtes Ticket ohne Ursache und Lehre ist eine Lücke: Das Ticketsystem schließt Tickets, das ISMS lernt daraus.'],
        ['Beweismittel (A.5.28)', 'Wo Logs, Screenshots, Forensik liegen. Bei erheblichen Vorfällen und Personendaten wird danach gefragt.'],
        ['Korrekturmaßnahme (10.2)', '„+ Korrekturmaßnahme anlegen" öffnet das Wirksamkeits-Register mit Quelle „Sicherheitsvorfall" und Herkunft des Tickets – der Vorfall findet seine Maßnahme wieder.'],
        ['🖨 Vorfallakte', 'Ticket, Beurteilung, Meldungen, Ursache, Lehren, Beweise auf einer Seite – als PDF der Nachweis, den ein Auditor sehen will.'],
      ])}
      <div style="${h3}">Einstellungen</div>
      <p style="margin:0 0 8px;line-height:1.55">Unter <b>Einstellungen → Vorfälle</b> stehen die Kategorien der Ticketliste mit Anzahl; angehakt wird, was Informationssicherheit ist. Bis dahin gilt ein Muster (Sicherheit, Phishing, Malware, Datenschutz …). Ebenso lässt sich jede Art des Tickets einer Gruppe zuordnen, wenn das Haus andere Worte nutzt als Incident, Change, Doku. Gelesen werden die letzten ${typeof VF_MONATE !== 'undefined' ? VF_MONATE : 24} Monate.</p>
      <div style="${h3}">Was daraus folgt</div>
      <ul style="${ol}">
        <li style="${li}"><b>Cockpit:</b> offene Vorfälle, nicht beurteilte, überfällige Meldefristen.</li>
        <li style="${li}"><b>Audit Report:</b> A.5.24–A.5.28 (Beurteilung, Lehren), NIS2 Art. 23 (Fristen), A.8.32 (Änderungen).</li>
        <li style="${li}"><b>Vorfall-Digest</b> im Cron: unbeurteilte Ereignisse, überfällige Fristen, erledigte Vorfälle ohne Lehre – an die Admins.</li>
      </ul>
      <div style="${h3}">Wo es sonst noch auftaucht</div>
      <ul style="${ol}">
        <li style="${li}">In der <b>Landkarte</b>: 🚨 an kritischen Kacheln; im Kachel-Dialog der Notfall-Stand mit Knopf zum Plan.</li>
        <li style="${li}">Im <b>Cockpit</b>: kritische Prozesse, davon mit Plan, Krisenstab je Werk.</li>
        <li style="${li}">Im <b>Audit Report</b> als Zeilen A.5.30 (Pläne, Übungen) und A.5.29 (Krisenstab).</li>
        <li style="${li}">Im <b>Notfall-Digest</b> (Cron): kritische Prozesse ohne Plan, fällige Übungen, veraltete Krisenstäbe.</li>
      </ul>
      <div style="${hint}">Der Reiter ist standardmäßig nur für die Administration sichtbar – unter „Einstellungen" lässt er sich je Person freigeben. Wer den Krisenstab lesen soll, braucht nicht das Schreibrecht auf die Landkarte: Der Reiter hat sein eigenes.</div>`,
      'ISO 27001 A.5.29 (Informationssicherheit bei Störungen), A.5.30 (IKT-Bereitschaft für Business Continuity); ISO 22301 (BCMS); BSI-Standard 200-4 (Business Continuity Management); NIS2 Art. 21 (2c) (Aufrechterhaltung des Betriebs, Backup, Wiederherstellung, Krisenmanagement); Reifegrad R071, R093.'),

    sec('ismsdocs', 'IMS-Dokumente (alle Normen)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Der Reiter <b>IMS-Dokumente</b> zeigt die Dokumente des
      integrierten Managementsystems aus der ISMS-Site – <b>alle Normen</b>, nicht nur die
      Informationssicherheit: ISO 9001, 14001, 45001, 50001 und 27001. Links steht ein
      <b>Ordner-Baum</b>: Norm anklicken grenzt die Liste darauf ein (Unterordner inbegriffen),
      nochmal klicken hebt die Eingrenzung auf. Die Zahl am Knoten ist die Anzahl der Dokumente.</p>
            <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„IMS-Dokumente"</b> verwaltet die ISO-27001-Dokumente direkt auf der ISMS-Site.</p>
      <ul style="${ol}">
        <li style="${li}">Spalten <b>Bearbeitungsstand</b>, <b>Vertraulichkeit</b> (in der Liste umstellbar), <b>Auf Konformität geprüft von</b>, <b>Freigabe Geschäftsleitung</b>, <b>Zuletzt angefasst</b>.</li>
        <li style="${li}"><b>Status & Freigabe sind nur Anzeige</b> – sie werden über den Freigabeprozess gesetzt: Dokument per <b>„＋ Als Regelwerk übernehmen"</b> einbinden und im Reiter „Freigaben" prüfen/freigeben (Rückschreibung erfolgt automatisch).</li>
        <li style="${li}"><b>„👁 Vorschau"</b> öffnet das Dokument in der App; Versionsverlauf einsehbar.</li>
        <li style="${li}"><b>„✏️ In Office bearbeiten"</b> (Desktop) oder <b>„🌐 Im Browser bearbeiten"</b> – beim Speichern entsteht automatisch eine neue Version. Alternativ <b>„⬆ Neue Version"</b> mit Pflicht-Änderungsnotiz.</li>
      </ul>`,
      'ISO 27001 Klausel 7.5 (Dokumentierte Information – Lenkung &amp; Versionierung), A.5.37 (Dokumentierte Betriebsabläufe), A.5.12/A.5.13 (Klassifizierung/Kennzeichnung).'),

    sec('governance', 'Governance-Board (Legal-Entwürfe)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Governance-Board"</b> zeigt die Entwürfe aus dem Legal-SharePoint (Corporate Governance-Board) – gleicher Zugriffsmechanismus wie bei den IMS-Dokumenten.</p>
      <ul style="${ol}">
        <li style="${li}">Im Governance-Board liegen <b>alle Entwürfe</b> der Konzernregelungen. Sobald ein Entwurf die interne <b>Konformitätsprüfung + Freigabe</b> hier im RMS durchlaufen hat, wird das Dokument dort von Legal überschrieben/neu erstellt und veröffentlicht.</li>
        <li style="${li}"><b>„👁 Vorschau"</b>, <b>„✏️ In Office bearbeiten"</b> / <b>„🌐 Im Browser bearbeiten"</b> und <b>„🕘 Versionsverlauf"</b> wie bei IMS-Dokumenten; <b>„↗ SharePoint"</b> öffnet den Ordner direkt.</li>
        <li style="${li}"><b>„＋ Als Regelwerk übernehmen"</b> holt einen Entwurf in den Regelwerk-Workflow (Editor mit vorbefülltem Dokument) – der Start der Konformitätsprüfung/Freigabe.</li>
      </ul>
      <div style="${h3}">Navigation über die Ordnerstruktur</div>
      <p style="margin:0 0 8px;line-height:1.55">Links steht der <b>Ordner-Baum</b> der Legal-Ablage: mit ▸/▾ auf- und zuklappen, je Ordner die Anzahl der Entwürfe (inklusive Unterordner). Ein Klick filtert die Liste rechts auf diesen Ordner <b>samt aller Unterordner</b>; die Suche wirkt zusätzlich.</p>`,
      'ISO 27001 Klausel 7.5 (Dokumentierte Information), 5.2 (Politik) – gemeinsam mit der Konformitätsprüfung/Freigabe im RMS.'),

    sec('govstruktur', 'Governance-Struktur (Matrix)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Der Bauplan des <b>Konzernregelwerks</b> auf einer Seite:
        Welche Regelung gibt es in welcher Kategorie, auf welcher Verbindlichkeitsebene, wer verantwortet sie –
        und wie weit ist sie?</p>
      <h3 style="${h3}">Die beiden Achsen</h3>
      <ul style="${ol}">
        <li style="${li}"><b>Zeilen = Kategorien</b> des Konzernregelwerk-Fundaments: Allgemein, Recht/Steuern/
          Datenschutz/Versicherungen, Compliance, Security/Cyber Security, Finanzen/ReWe/Controlling/Einkauf,
          Nachhaltigkeit/Arbeitssicherheit &amp; Gesundheitsschutz, HR/Corporate Transformation/IT.</li>
        <li style="${li}"><b>Spalten = Dokumentenart</b>, also die Verbindlichkeitsebene der Regelwerkspyramide.
          Von oben nach unten nimmt die Verbindlichkeit ab.</li>
      </ul>
      ${tbl([
        ['Handbuch', 'In sich abgeschlossenes Themengebiet (z. B. Code of Conduct).'],
        ['Policy', 'Strategischer Rahmen: Was ist das Ziel, der Grundsatz?'],
        ['Konzernrichtlinie', 'Operativer Rahmen: Wie handeln wir?'],
        ['Konzernfachregelung', 'Fachgerechte Ausführung.'],
        ['Arbeits-/Prozessanweisung', 'Handlungsanleitung, Schritt für Schritt.'],
        ['Leitfaden', 'Handlungsempfehlungen.'],
      ])}
      <h3 style="${h3}">Was die Matrix zeigt</h3>
      <ul style="${ol}">
        <li style="${li}">Jede Regelung als <b>Kachel</b> mit Verantwortung und Stand:
          <b>gültig</b> (grün, final abgelegt), <b>in Arbeit</b> (gelb, in Erarbeitung oder Prüfung),
          <b>offen</b> (grau, noch nicht begonnen).</li>
        <li style="${li}">Oben die <b>Kennzahlen</b> mit Fortschrittsbalken – ein Klick darauf filtert nach diesem Stand.</li>
        <li style="${li}"><b>Suche</b> über Titel, Verantwortung und Kategorie, dazu ein Filter nach Verantwortlichen.</li>
        <li style="${li}"><b>Regelungen bearbeiten:</b> Kachel anklicken öffnet die Regelung (Titel, Kategorie, Ebene, Verantwortung, Stand, Dokument/Version/Datum); das <b>+</b> in einer Zelle legt dort eine neue an, mit Kategorie und Ebene schon vorbelegt. Gespeichert wird sofort – es gibt keinen extra Speichern-Knopf.</li>
        <li style="${li}"><b>Verschieben:</b> Eine Kachel lässt sich mit der Maus in eine andere Zelle <b>ziehen</b> – sie wechselt damit Kategorie und/oder Verbindlichkeitsebene. Über den Dialog geht es weiterhin auch.</li>
        <li style="${li}"><b>Versionsverlauf:</b> Über der Matrix steht, <b>wer</b> zuletzt <b>was</b> geändert hat und <b>wann</b>. Ein Klick öffnet die Liste der letzten 100 Änderungen. Ältere Fassungen der Datei bewahrt SharePoint zusätzlich auf.</li>
        <li style="${li}"><b>Zeilen und Spalten bearbeiten:</b> Auch die Beschriftungen sind Daten. Ein Klick auf einen <b>Zeilen- oder Spaltenkopf</b> benennt ihn um (bei Ebenen zusätzlich die Erklärung), die Pfeile daneben verschieben ihn, <b>+ Ebene</b> und <b>+ Kategorie</b> legen neue an. Beim Umbenennen ziehen alle Regelungen mit, die daran hängen. Eine Zeile oder Spalte mit Inhalt wird nicht einfach gelöscht – die App fragt, wohin die Regelungen umziehen sollen.</li>
        <li style="${li}"><b>Eigenes Recht für den Aufbau:</b> Regelungen pflegen darf, wer Schreibrecht auf den Reiter hat. Zeilen und Spalten ändern darf nur, wer in den Einstellungen unter <b>„Governance-Struktur: Zeilen &amp; Spalten ändern"</b> steht (Admins immer). Eine umbenannte Ebene betrifft schließlich alles, was daran hängt.</li>
        <li style="${li}">Liegt eine Regelung bereits als Regelwerk im RMS, führt <b>„→ im RMS"</b> direkt hin.</li>
        <li style="${li}">Leere Ebenen bekommen keine Spalte: Was es nirgends gibt, verstopft die Ansicht nicht.</li>
      </ul>
      <div style="${hint}">📄 <b>Quelle:</b> die Zuständigkeiten-Mappe des Corporate-Governance-Boards
        (<code>CGB_Organisation_Zuständigkeiten_Nomenklatur.xlsx</code>). Die Matrix ist eine <b>Momentaufnahme
        der Planung</b>, kein Live-Bestand – der Stand steht über der Tabelle. Ändert sich die Mappe, wird der
        Datenstand neu eingelesen. Leitbild, Unternehmenspolitik und die kollektivrechtlichen Regelungen (KBV/BV)
        stehen aufklappbar darunter: Sie sind Bestandteile der Corporate Governance, aufgrund ihres
        eigenständigen Charakters sowie ihrer normativen bzw. hierarchischen Stellung aber nicht dem
        Konzernregelwerk zuzuordnen.</div>`,
      'ISO 27001 Klausel 5.1 (Führung), 5.3 (Rollen &amp; Verantwortlichkeiten), A.5.1 (Regelwerke); DCGK.'),

    sec('bpmn', 'BPMN einfach erklärt', 'all', `
      <div style="${hint};margin-top:0">Neu bei BPMN? <b>Stufe 1</b> reicht für den ersten eigenen Prozess. <b>Stufe 2</b> brauchen Sie erst, wenn Sie selbst zeichnen oder einen größeren Ablauf abbilden. Beide Stufen gibt es auch als <b>Schulung</b> im Reiter <b>Wissen</b>: <b>„Abläufe beschreiben mit BPMN"</b>, sechs Module mit Wissenstest und Teilnahmebescheinigung, freiwillig.</div>
      ${typeof bpmnAnleitungHerunterladen === 'function' && typeof BPMN_ANLEITUNG_KNOPF !== 'undefined' ? `<div style="${hint}">
        <b>Für Kolleginnen und Kollegen ohne RMS:</b> Beide Stufen gibt es als Word-Datei zum Weitergeben, ohne die Klickwege im RMS. Darin stehen Bilder der Zeichen, die Beispiele als Diagramm, ein Spickzettel und eine Vorlage zum Ausfüllen. Als Ansprechpartner steht Ihr Name darin, die ausgefüllte Datei kommt also zu Ihnen zurück.
        <div style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="bpmnAnleitungHerunterladen()" title="${esc(BPMN_ANLEITUNG_KNOPF_TITEL)}">${esc(BPMN_ANLEITUNG_KNOPF)}</button></div>
      </div>` : ''}
      ${typeof bpmnEinstiegHtml === 'function' ? bpmnEinstiegHtml() : ''}
      ${typeof bpmnVertiefungHtml === 'function' ? bpmnVertiefungHtml() : ''}
      <div style="${hint}">💡 Stufe 1 gibt es auch im Modeler: Knopf <b>„❓ Hilfe"</b> in der Leiste oben. Sie öffnet sich als Dialog, das Diagramm bleibt dahinter offen. Der Modeler spricht Deutsch: Palette, Symbole am Element und das Menü „Art ändern" nennen die Bausteine so wie das Hausschema, etwa „Aufgabe (Mensch)" oder „Handgriff (ohne System)".</div>`,
      'OMG BPMN 2.0 (ISO/IEC 19510); ISO 9001 Abschnitt 4.4 und ISO 27001 Klausel 4.4 verlangen, dass Prozesse und ihre Wechselwirkungen bestimmt und beschrieben sind.'),

    sec('prozesse', 'Prozesse (BPMN 2.0)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Prozesse"</b>: Abläufe als <b>BPMN 2.0</b> im Camunda-Stil selbst modellieren und <b>mit Regelwerken verknüpfen</b> („im Einklang mit den Regelwerken"). Gespeichert als <b>.bpmn</b>-Datei im Ordner „Prozesse" der ISMS-Bibliothek.</p>
      <p style="margin:0 0 8px;line-height:1.55">Der Reiter hat fünf Ansichten: <b>🗺 Landkarte</b> (der Einstieg), <b>🕸 Verknüpfungen</b> (wer hängt woran), <b>👤 Matrix</b> (wer ist zuständig), <b>📌 Backlog</b> (woran gearbeitet wird) und <b>📋 Modelle</b> (alle BPMN-Dateien, nach Gesamtprozess gegliedert).</p>
      <div style="${h3}">🗺 Prozesslandkarte</div>
      <p style="margin:0 0 8px;line-height:1.55">Die Prozesslandschaft als Zeilen: je Bereich eine Zeile mit farbiger Titelspalte, <b>Kernprozesse</b> als Pfeile. Jede Kachel ist anklickbar.</p>
      <p style="margin:0 0 8px;line-height:1.55"><b>Jedes Werk führt seine eigene Landkarte</b>, dazu gibt es die Ebene <b>Konzern / Holding</b>. Oben links wird gewählt, welche Karte offen ist. Ein Werk ohne Karte kann bei null anfangen oder <b>die Struktur eines anderen Werks übernehmen</b> und dort anpassen, wo es abweicht – der Geltungsbereich wird dabei auf das eigene Werk gesetzt, die Quelle bleibt unverändert.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Ein Klick auf eine Kachel</b> zeigt den Geltungsbereich, das hinterlegte <b>BPMN-Modell</b> und die Regelwerke, die daran hängen. Von dort geht es direkt in die Ansicht des Modells oder in das Regelwerk.</li>
        <li style="${li}"><b>Mehrere Modelle je Prozess:</b> Ein Prozess besteht oft aus mehreren Abläufen – Angebot, Auftrag und Reklamation gehören alle zum Vertrieb. „+ Modell anlegen" und „+ Vorhandenes verknüpfen" hängen beliebig viele an dieselbe Kachel; ein <b>grüner Punkt</b> zeigt, dass eines hinterlegt ist, die <b>Zahl daneben</b> wie viele. Ein neu angelegtes Modell bekommt automatisch einen freien Dateinamen („Vertrieb 2"), sonst überschriebe es das erste.</li>
        <li style="${li}"><b>Regelwerke auch ohne Modell:</b> Über <b>„Regelwerke zuordnen"</b> hängen Regelwerke direkt an der Kachel – für die vielen Prozesse, die (noch) kein BPMN-Diagramm haben. Was über ein Modell verknüpft ist, steht weiterhin dort und wird zusätzlich angezeigt, mit Angabe des Modells.</li>
        <li style="${li}"><b>Aufgeräumte Leiste im Probelauf:</b> Solange ein Probelauf läuft, zeigt die Navigation nur die Reiter, die ohnehin jede und jeder sieht – plus <b>Regelwerk Dashboard</b> und <b>Freigaben</b>. Im Lernvideo verwirrt sonst eine Leiste voller Reiter, die die Zuschauer nie zu sehen bekommen. Der Probelauf bleibt dabei aktiv, auch wenn sich das RMS in einem neuen Tab öffnet – bis er ausdrücklich beendet wird.</li>
        <li style="${li}"><b>Zwei Wege ins System:</b> Ein <b>neues</b> Thema startet als Konzept. Ein <b>bestehendes</b> Dokument braucht das nicht – „+ Neues Regelwerk" → <b>„Direkt anlegen"</b> nimmt es ohne Umweg als Entwurf auf. Genau dafür ist der Weg gedacht: Bestand und Migration.</li>
        <li style="${li}"><b>Die geführte Vorführung ist zugleich das Lernvideo:</b> Jeder Schritt nennt in <b>einem Satz</b>, worum es geht – von der Begrüßung über Konzept, Prüfung, Mitbestimmung und Freigabe bis zu „Was das für Sie heißt". Erklärt wird gesprochen, nicht gelesen: Die Sprechblase bleibt kurz genug, dass niemand mitliest statt zuzuhören. Was zu klicken ist, steht klein darunter im <b>Hinweis</b>.</li>
        <li style="${li}"><b>Vorlagen für eine neue Landkarte:</b> <b>„📋 Vorlage"</b> setzt eine fertige Prozesslandschaft ein – für die <b>Konzernebene</b> die sechs Bereiche einer Führungsholding (Strategie, Finanzen, Risiko &amp; Compliance, Synergien, Kommunikation, Transformation mit je drei Hauptaufgaben), für eine <b>Gesellschaft</b> die Führungs-, Kern- und Unterstützungsprozesse. Der Geltungsbereich wird passend gesetzt, Modelle und Regelwerke bleiben leer – die Vorlage bringt Struktur, keine erfundenen Verknüpfungen.</li>
        <li style="${li}"><b>Beliebig viele Bereiche:</b> Die Landkarte zeichnet jedes Band als eigene Zeile mit farbiger Titelspalte – drei wie im Werk oder sechs wie im Konzern. Kernprozesse behalten ihre Pfeilform.</li>
        <li style="${li}"><b>Verweise zwischen Prozessen:</b> Im Kachel-Dialog steht der Abschnitt <b>Prozesslandschaft</b>. Dort hängen drei Arten von Verweisen: <b>↳ Unterprozesse</b> (die Kachel gliedert sich weiter auf), <b>→ Danach folgt</b> (die Kette – so entsteht eine End-to-End-Sicht) und <b>⇢ Nutzt</b> (der Querbezug auf einen Prozess, den dieser braucht). Jede Zeile ist ein <b>Sprung</b>, kein Text: Anklicken öffnet die Zielkachel, bei Bedarf samt Werkwechsel – ein fremdes Werk steht sichtbar daneben. Darunter zeigt <b>Zeigt hierher</b> die Gegenrichtung; gepflegt wird sie nicht, sondern gesucht, denn gespeichert ist ein Verweis nur bei der Quelle. Ein <b>Unterprozess ist eine ganz normale Kachel</b> – mit Modellen, Regelwerken, Geltungsbereich und Verantwortlichem. In der Mindmap erscheinen die Verweise als Kanten <b>zwischen</b> Prozessen; alle anderen zeigen nach unten.</li>
        <li style="${li}"><b>Ineinandergreifende Prozesse – einmal gepflegt, für mehrere Hauptprozesse:</b> „Bedarfsanforderung" gehört zu Source-to-Pay <i>und</i> zu Plan-to-Fulfill. Sie steht trotzdem nur <b>einmal</b> in der Landkarte: Mehrere Hauptprozesse zeigen als <b>Unterprozess</b> auf dieselbe Kachel. Die Beziehung liegt beim Hauptprozess – ein weiterer trägt sie bei sich ein, am Unterprozess ändert sich nichts, und eine Änderung dort wirkt überall. Die Kachel trägt dafür das Zeichen <b>⇄ n</b>: zu wie vielen Hauptprozessen sie gehört; mehrfach verwendete sind hervorgehoben. Im Kachel-Dialog steht es ausgeschrieben, samt Folge: „Eine Änderung hier wirkt in allen."</li>
        <li style="${li}"><b>Ausklappbare Gliederung:</b> Ein Prozess mit Unterprozessen bekommt in der Karte ein <b>▸</b> mit ihrer Anzahl. Anklicken klappt sie auf – so tief, wie die Gliederung reicht; <b>⤢ Gliederung</b> in der Leiste öffnet alles auf einmal. Jede Zeile ist ein Sprung auf ihren Prozess, fremde Werke stehen sichtbar dabei. Ein Prozess, der über Umwege unter sich selbst hinge, ließe sich endlos aufklappen – solche <b>Kreise</b> lehnt das Pflegen deshalb mit Begründung ab, und ein vorhandener wird beim Aufklappen mit <b>↻</b> markiert statt weiterverfolgt.</li>
        <li style="${li}"><b>Teilprozesse sind einsortiert, nicht versteckt:</b> Die Coswiger Landschaft hat 16 Hauptprozesse und darunter über 80 Gruppen und Teilprozesse – alle nebeneinander im Band wären unbrauchbar. Die Karte zeigt deshalb die <b>Hauptprozesse</b>, die Bandzeile nennt die Zahl der eingeordneten, und <b>☰ Teilprozesse</b> holt sie bei Bedarf einzeln zurück. Gefunden werden sie ohnehin: über die Suche und über das Aufklappen.</li>
        <li style="${li}"><b>Die Landkarten der Werke als Vorlage:</b> <b>Coswig (WGC)</b> aus IMS-4.4 Rev. 7 – sechzehn Hauptprozesse mit den Gruppen und Teilprozessen der Tabelle, jeder mit seiner Dokumentennummer, und der Gießerei-Kette Formerei → Schmelzbetrieb → Gießen → … → mechanische Bearbeitung. <b>Zaigler (ZAI)</b> aus F_01_005 Rev. 5 – Führungs-, Kern- und Unterstützungsprozesse mit ihren Verfahrensanweisungen, die Kernprozesse als Kette von der Kundenanforderung bis zum Versand. <b>Schmiedeberg (SCH)</b> aus der Prozesslandkarte vom 14.07.2026 – acht Prozesse, bewusst grob. Öffnet man die Karte eines dieser Werke, ist seine Vorlage im Dialog <b>vorgewählt</b>.</li>
        <li style="${li}"><b>🔎 Abhängigkeiten – einen Prozess suchen, alles daran sehen:</b> Die dritte Ansicht im Reiter <b>Verknüpfungen</b> beantwortet die Frage aus dem Alltag: „Ich suche X – was hängt daran?" Oben ein <b>Suchfeld</b> über alle Werke, Modelle und Regelwerke. Der Treffer bringt zweierlei: <b>die Herkunft</b> – alle Wege von oben, <i>Konzern › Werk › Bereich › Hauptprozess ↳ Unterprozess</i> – und darunter <b>den Baum ab diesem Prozess</b>, diesmal <b>mit</b> den Verweisen: Unterprozesse, die Kette, Querbezüge, Modelle und <b>Regelwerke</b>. Ein <b>geteilter</b> Prozess hat mehrere Herkünfte; liegen sie in verschiedenen Werken, steht oben, wie viele Gesellschaften eine Änderung berührt. Aus der Landkarte führt der Knopf <b>„🔎 Abhängigkeiten"</b> im Kachel-Dialog direkt dorthin. In der <b>Übersicht</b> bleiben die Verweise bewusst draußen – dort stünde sonst jeder Unterprozess zweimal, einmal unter seinem Bereich und einmal unter seinem Hauptprozess.</li>
        <li style="${li}"><b>Eigene Vorlagen sichern und die Auswahl aufräumen:</b> Wer eine Landkarte einmal zurechtgelegt hat, sichert sie über <b>„💾 Diese Landkarte als Vorlage sichern"</b> im Vorlagen-Dialog und setzt sie in jedem anderen Werk ein. Gesichert wird die <b>Form</b>: Bereiche, Namen, Untertitel und die Gliederung. <b>Nicht</b> mitgenommen werden Verantwortliche, Modelle, Regelwerke und Geltungsbereich – eine Person gehört nicht in eine Vorlage, und ein Modell liegt im Ordner seines Werks. Verweise auf andere Werke fallen weg, Verweise im eigenen verlieren das Werkkürzel und passen so in jede Karte. Das <b>✕</b> je Zeile räumt die Auswahl auf: Eine <b>eigene</b> Vorlage wird gelöscht (die damit angelegten Landkarten bleiben unberührt – eine Vorlage ist eine Kopiervorlage, keine Verbindung), eine <b>eingebaute</b> nur <b>ausgeblendet</b> und lässt sich unten jederzeit zurückholen.</li>
        <li style="${li}"><b>Untertitel gliedern:</b> Unter dem Namen einer Kachel steht oft eine Aufzählung – „Marktanalyse · Zielmärkte · Kundenentwicklung" oder „Mittel verteilen, Investitionen entscheiden". Als grauer Text ist das <b>Beschriftung, keine Struktur</b>: nicht anklickbar, nicht mit einem Modell verknüpfbar, nicht zweimal verwendbar, nicht aufklappbar. <b>„↳ Untertitel gliedern"</b> im Kachel-Dialog macht daraus echte Unterprozesse. Der Vorschlag kommt von der Maschine, die Entscheidung von Ihnen: Der Dialog zeigt eine Zeile je Prozess zum Ändern, denn ein Trennzeichen weiß nicht, ob „Mittel verteilen, Investitionen entscheiden" zwei Prozesse sind oder einer. Gibt es einen Prozess des Namens schon, wird er <b>verwendet statt neu angelegt</b> – einmal gepflegt, mehrfach verwendet. Ein neuer Teilprozess erbt Band und Geltungsbereich seines Hauptprozesses.</li>
        <li style="${li}"><b>Bereiche bearbeiten und anlegen:</b> Ein Klick auf den farbigen <b>Balken</b> links öffnet den Bereich – Name ändern, Reihenfolge verschieben, Darstellung wählen (Kacheln nebeneinander oder Pfeile untereinander wie bei den Kernprozessen). <b>„+ Bereich"</b> legt einen neuen an. Der <b>Name</b> ist jederzeit änderbar, ohne dass die Zuordnung der Prozesse verlorengeht: Intern behält ein Bereich seinen Schlüssel, und daran hängt jede Kachel. Ein Bereich mit Inhalt lässt sich entfernen, seine Prozesse werden dabei aber <b>verschoben, nicht gelöscht</b> – wohin, entscheiden Sie im Dialog. Der letzte Bereich bleibt stehen: Sonst hätte kein Prozess mehr Platz.</li>
        <li style="${li}"><b>Vorlage ergänzen statt ersetzen:</b> Steht schon eine Landkarte, fragt <b>„📋 Vorlage"</b> jetzt, was mit ihr geschehen soll. <b>Ergänzen</b> (Vorgabe) legt nur an, was fehlt – vorhandene Prozesse behalten Verantwortliche, Modelle, Regelwerke und Geltungsbereich, ihnen werden lediglich die fehlenden Verweise angehängt. <b>Ersetzen</b> verwirft die Karte wie bisher. Ohne diesen Weg müsste man eine gepflegte Landkarte wegwerfen, bloß um die Unterprozesse einer Vorlage zu bekommen.</li>
        <li style="${li}"><b>Die Holding-Vorlage trägt jetzt die Teilprozesse:</b> Acht Bereiche wie in der Skizze der Geschäftsführung, 35 Hauptprozesse – und darunter 48 Teilprozesse aus der abgestimmten Konzernlandkarte, wo sie bisher nur als Text im Untertitel standen („Strategieentwicklung · Markt- und Wettbewerbsanalyse · …"). Ein Text lässt sich nicht anklicken, nicht mit einem Modell verknüpfen und nicht zweimal verwenden. <b>Fünf</b> davon gehören zu zwei Hauptprozessen und stehen trotzdem nur einmal in der Karte: Forecast (Budgetplanung und Planungssysteme), M&amp;A (Erwerb von Beteiligungen und M&amp;A-Unterstützung), Governance-System, Risikomanagement und Best-Practice-Transfer. Die sieben Kernprozesse der Töchter hängen als Kette am operativen Tagesgeschäft, vom Markt bis zum Versand.</li>
        <li style="${li}"><b>Vorlage „SAP End-to-End-Prozesse":</b> Der Konzern als <b>Ablauf</b> statt als Aufbau – <b>Lead to Cash</b>, <b>Source to Pay</b>, <b>Design to Operate</b> und <b>Recruit to Retire</b> als Klammern, darunter die Ketten quer durch Vertrieb, Planung, Gießerei, Einkauf und Buchhaltung (52 Prozesse in 9 Bändern). Die einzige Vorlage, die schon <b>verknüpft</b> ist: Klammern als Unterprozesse, die Kette als „Danach folgt", die Übergänge zwischen zwei Ketten als „Nutzt" – etwa Auftragserfassung ⇢ Produktionsplanung oder Materialdisposition ⇢ Bedarfsanforderung. SAP dient als Leitfaden, die Schritte sind die einer Gießereigruppe; alles bleibt danach frei änderbar.</li>
        <li style="${li}"><b>Übergänge im Diagramm:</b> Ein Verweis an der Kachel sagt, <i>dass</i> ein Prozess in einen anderen übergeht – nicht, <i>an welcher Stelle</i>. Deshalb trägt im Modeler auch ein <b>einzelnes Element</b> ein Ziel: Element anklicken, in der Seitenspalte unter <b>„Übergang zu einem anderen Prozess"</b> die Zielkachel wählen (alle Werke stehen zur Wahl). Am Element erscheint dann ein <b>↦ mit dem Namen des Ziels</b> – anklicken springt in die Landkarte; ungespeicherte Änderungen werden vorher abgefragt. Gespeichert wird der Übergang in der <b>Dokumentation des Elements</b> und damit in der .bpmn-Datei selbst: Er übersteht Export, Umbenennung und den Umzug in ein anderes Werk. Wurde die Zielkachel gelöscht, färbt sich das Zeichen orange, statt still zu verschwinden.</li>
        <li style="${li}"><b>⊞ Unterprozesse einbinden – ein Modell im Modell:</b> „Auftragserfassung" läuft in Lead to Cash <i>und</i> in Design to Operate. Wer den Ablauf in beide Modelle hineinzeichnet, hat ihn zweimal – und nach der ersten Änderung zwei verschiedene. Deshalb wird er <b>eingebunden</b>: Im Modeler eine Aufgabe anklicken, in der Seitenspalte unter <b>„Unterprozess – ein Modell einbinden"</b> das Modell suchen (Name, Werk oder Kennung, über alle Werke; die Eingabetaste bindet den einzigen Treffer ein) und <b>Einbinden</b>. Die Aufgabe wird zur <b>⊞ Aufrufaktivität</b> (BPMN Call Activity, dicker Rahmen mit ⊞); Name, Bahn und Verbindungen bleiben. Am Element steht <b>⊞ mit dem Namen des Modells</b> – anklicken öffnet es, <b>„↰ Zurück zu …"</b> in der Leiste führt wieder in den Hauptprozess. Gibt es den Prozess noch nirgends, legt <b>„+ … als neues Modell anlegen"</b> ihn an – im Ordner desselben Werks, nach Hausschema, sofort eingebunden. Gibt es den Namen schon (in irgendeinem Werk), wird eingebunden statt angelegt: <b>Ein Unterprozess wird einmal modelliert.</b> Was einen <b>Kreis</b> ergäbe, steht gar nicht zur Wahl. Ein neu angelegter Unterprozess beginnt in der <b>Bahn</b> seiner Aufgabe – wer hier zuständig ist, ist es meist auch dort. Zeigt eine ⊞ auf ein Modell, das es nicht mehr gibt, färbt sie sich orange, und die <b>Verknüpfungen</b> sammeln solche Fälle unter den Lücken. In der Modell-Liste zeigt <b>⊞ n</b>, wie viele Unterprozesse ein Modell einbindet, und <b>↰ n</b>, in wie vielen es selbst steckt – wer es ändert, ändert es dort mit. Gespeichert wird der Verweis in der <b>Dokumentation des Elements</b> (<code>[[rms:modell=…]]</code>) und als <code>calledElement</code> in der .bpmn-Datei: Er übersteht Export, Umbenennen und Umzug; ein fremdes Werkzeug liest die ⊞ als das, was sie ist. In der Mindmap hängt das eingebundene Modell unter dem einbindenden.</li>
        <li style="${li}"><b>📎 Dokumente am Schritt:</b> Formular, Arbeitsanweisung oder Merkblatt gehören an den Schritt, an dem sie gebraucht werden. Im Modeler den Schritt anklicken und rechts unter „Dokumente an diesem Schritt" eine Datei hochladen, einen Link hinterlegen oder eine Anlage des Prozesses wählen. Am Element erscheint ein 📎 mit der Anzahl, ein Klick öffnet das Dokument; in der Ansicht stehen die Dokumente zusätzlich in der Schrittliste. Gespeichert wird in der BPMN-Datei, in der Dokumentation des Elements – wie Übergang und Unterprozess. Die <b>Anlagen</b> des ganzen Prozesses bleiben davon getrennt.</li>
        <li style="${li}"><b>Kennung und Name – eindeutig, einmalig:</b> Jedes Modell trägt eine <b>Prozess-Kennung</b> (das <code>id</code> seines <code>&lt;bpmn:process&gt;</code>), die im Haus nur einmal vorkommt – auf sie zeigt jede ⊞. Bis hierher hieß jedes Modell „Process_1"; beim nächsten Speichern bekommt es eine eigene und behält sie. Eine importierte Kopie, die die Kennung eines vorhandenen Modells trägt, bekommt beim Speichern ebenfalls eine neue – das ältere behält seine. Und ein <b>Name</b> kommt je Werk nur einmal vor: Ein zweites Modell „Vertrieb" im selben Ordner überschriebe das erste – die App weist es ab und verweist auf das vorhandene. In einem anderen Werk darf der Name stehen: HOL/Vertrieb und SHB/Vertrieb sind zwei Prozesse.</li>
        <li style="${li}"><b>🌳 Übersicht (Baum):</b> Die Mindmap zeigt die Landschaft als Baum – Wurzel links, Äste nach rechts: <b>Werk → Band → Prozess → Modell → Regelwerk</b>. Ein Klick klappt einen Zweig auf oder zu, die Zahl am Knoten sagt, wie viel zugeklappt darunter liegt. Über <b>Wurzel</b> lässt sich zwischen einem Werk und dem Konzern (dann sind die Werke die erste Ebene) wechseln; <b>⤢ Alles</b>, <b>⤡ Zu</b> und der Zoom helfen bei großen Bäumen.</li>
        <li style="${li}"><b>Direkt im Baum anlegen:</b> Das <b>+</b> am Knoten legt an, was an dieser Stelle passt – am Band oder Werk einen <b>Prozess</b> (Band schon vorbelegt), am Prozess ein <b>Modell</b> oder eine <b>Regelwerks-Zuordnung</b>, am Modell die <b>Regelwerke</b>. Bei Lesezugriff erscheint es gar nicht erst.</li>
        <li style="${li}"><b>🎯 Nahsicht:</b> Die bisherige Ansicht bleibt als zweiter Schalter – nur sie zeigt auch die querlaufenden Bezüge („gilt für"), die in einem Baum keinen Platz haben.</li>
        <li style="${li}"><b>Prozessverantwortliche:</b> Jede Kachel trägt eine <b>verantwortliche Person</b> (und optional eine Vertretung) – die Frage, die in jedem Audit zuerst kommt. Sie steht beim Öffnen der Kachel, in der Mindmap als eigene Lücke („Prozesse ohne Verantwortlichen") und vollständig in der Matrix.</li>
        <li style="${li}"><b>👤 Matrix – wer ist wofür zuständig:</b> Prozesse als Zeilen, Werke als Spalten. Das Blatt <b>Zuständigkeiten</b> zeigt je Werk die verantwortliche Person („—" = niemand gepflegt, „·" = dieses Werk führt den Prozess nicht), das Blatt <b>Abdeckung</b> mit <b>V</b>/<b>M</b>/<b>R</b>, ob Verantwortliche(r), BPMN-Modell und Regelwerk vorhanden sind. Filter nach Band und „nur Lücken"; Ausgabe als <b>CSV</b> für Excel oder als <b>Druckfassung</b>.</li>
        <li style="${li}"><b>Prozessmanagement an der Kachel:</b> Neben der verantwortlichen Person im Werk trägt jede Kachel den <b>Prozesseigner</b> (verantwortet den Prozess konzernweit), den <b>Standardisierungsgrad</b> (gruppeneinheitlich · einheitlicher Rahmen · werksspezifisch), die <b>Priorität</b>, den <b>Status</b> im Lebenszyklus (IST erfasst → SOLL in Arbeit → POC → freigegeben → ausgerollt) und die <b>nächste Überprüfung</b>. Prozesseigner und Standardisierungsgrad werden an der Kachel der Konzern-Landkarte gepflegt und gelten für gleichnamige Kacheln der Werke mit, solange dort nichts Eigenes steht. Wer einen Prozess freigibt oder ausrollt, bekommt ohne Termin automatisch einen in 12 Monaten.</li>
        <li style="${li}"><b>📌 Backlog, woran gearbeitet wird:</b> Alle Prozesse aller Landkarten in einer Spalte je Status, sortiert nach Priorität und Fälligkeit. Die IST-Spalte zeigt nur Priorisiertes, der Rest lässt sich dazuschalten; was abgelöst wird (EOL), steht immer da. Filter nach Landkarte, Priorität und Standardisierungsgrad, Kennzahlen oben (mit Prozesseigner, Standardisierung entschieden, priorisiert, in Arbeit, ausgerollt, Überprüfung überfällig). Der Status lässt sich an der Karte umstellen. Gespeichert wird mit Versionsverlauf wie in der Landkarte. Grundlage ist die Konzernfachregelung Prozessmanagement.</li>
        <li style="${li}"><b>IST, SOLL und EOL:</b> EOL gehört zur IST-Erfassung. Wird ein bisheriger Ablauf durch einen SOLL-Prozess abgelöst, bekommt sein IST-Modell den Status <b>„IST, wird abgelöst (EOL)"</b> und bleibt in der Spalte <b>IST-Erfassung</b>, dort unter „↪ wird abgelöst". Es bleibt als Nachweis der IST-Aufnahme stehen, wird aber nicht weiterentwickelt und nicht mehr überprüft. Dafür muss es mit seinem SOLL-Modell verknüpft sein: Wer an der Karte EOL wählt, wird nach dem SOLL-Prozess gefragt, ohne ihn lässt sich EOL im Backlog nicht speichern. Die IST-Karte zeigt dann <b>„↪ abgelöst durch …"</b> mit dem Stand des SOLL (SOLL in Arbeit, POC läuft, freigegeben), die SOLL-Karte umgekehrt <b>„↩ löst ab: …"</b>. In der Modellansicht führen <b>„↪ SOLL"</b> und <b>„↩ IST"</b> oben in der Leiste hin und her. Fehlt die Verknüpfung, steht „kein SOLL-Prozess verknüpft" rot an der Karte, und die Kennzahl oben zählt die abgelösten IST mit SOLL. Ein importiertes IST kennt sein SOLL noch nicht: Es wird gespeichert, die Verknüpfung danach über „✎ Angaben" gesetzt.</li>
        <li style="${li}"><b>🧪 POC am SOLL:</b> Der POC erprobt das SOLL-Modell und steht deshalb an ihm, nicht in einem eigenen Modell: <b>Pilotwerk(e)</b> (Kürzel, oder „ALLE" für alle Werke), <b>Beginn</b> und <b>Ende</b>, <b>Verantwortlich</b>, die <b>Erfolgskriterien</b> mit ihrer Bewertung (offen, erfüllt, verfehlt) und das <b>Ergebnis</b> (läuft, bestanden, verlängert, nicht bestanden). Bewertet wird am Review-Termin des Modells. Eingetragen wird im Backlog unter „✎ Angaben", am Hauptprozess; Unter- und Nebenprozesse zeigen „🧪 POC über …". Die Karte des SOLL zeigt den POC in einer Zeile, die Karte des abgelösten IST ebenfalls, so ist die Kette IST → SOLL → POC auf einen Blick zu sehen. In der Modellansicht steht er als Chip, im Modeler rechts unter „Prozessmanagement". Fehlen einem laufenden POC Pilotwerk oder Erfolgskriterien oder ist sein Ende ohne Ergebnis überschritten, steht das orange an der Karte; die Kennzahl oben zählt die POC mit Erfolgskriterien.</li>
        <li style="${li}"><b>Wer gibt frei?</b> Jede Modellkarte nennt, wer den Prozess freigibt: Gibt es schon das Regelwerk der Freigabe (siehe „📋 Freigabe von Prozessen"), sein Status und seine Freigeber, sonst den am Modell eingetragenen <b>Freigeber</b>. Fehlt er ab dem SOLL, steht <b>„wer gibt frei? offen"</b> da; Unter- und Nebenprozesse gehen über ihren Hauptprozess. Die Kennzahl oben zählt die Modelle mit Freigeber. Wer am Modell als Freigeber steht, wird bei „📋 Zur Freigabe" Freigeber des Regelwerks.</li>
        <li style="${li}"><b>„✎ Angaben"</b> an jeder Modellkarte setzt Status, Priorität, <b>Prozesseigner</b>, <b>Freigabe durch</b>, den <b>Review-Termin</b> (nächste Überprüfung, im POC der Termin seiner Bewertung), bei EOL den SOLL-Prozess, der das IST ablöst, und ab dem SOLL den <b>POC</b>, ohne den Modeler zu öffnen. Geschrieben wird in die BPMN-Datei; Reifegrad, Kennzahlen, Regelwerke, Anlagen und Gliederung bleiben, wie sie sind. Im Modeler stehen dieselben Felder rechts unter „Prozessmanagement".</li>
        <li style="${li}"><b>Review ab dem POC:</b> Ein POC braucht den Termin, an dem er gegen seine Erfolgskriterien bewertet wird, ein freigegebener oder ausgerollter Prozess seine nächste Überprüfung. Fehlt der Termin, zählt das als Lücke im Backlog und in <b>Fälligkeiten → 🔀 Prozesse</b>. Ein Prozess in EOL wird nicht mehr überprüft. Unter- und Nebenprozesse ohne eigenen Termin gehen wie bei Freigabe und POC über ihren Hauptprozess: Sie übernehmen den Review-Termin ihres Hauptprozesses (die Karte zeigt „🔎 … über …"), zählen nicht extra und stehen in den Fälligkeiten nicht noch einmal. Ein eigener Termin am Unterprozess gilt für sich.</li>
        <li style="${li}"><b>Modelle sind Prozesse:</b> Ein BPMN-Modell steht im Backlog als eigener Prozess 🔀, auch wenn es an keiner Kachel hängt. Eine Kachel, an der ein Modell hängt, erscheint dafür nicht mehr einzeln. Status, Prozesseigner, Standardisierungsgrad, Priorität und Überprüfung stehen in der BPMN-Datei (im Modeler rechts unter „Prozessmanagement"); was dort leer bleibt, gilt von der Kachel und weiter von der gleichnamigen Kachel der Konzern-Landkarte. Der Filter „Herkunft" trennt Modelle, Modelle ohne Landkarte und Kacheln ohne Modell. <b>„+ Prozess anlegen"</b> legt direkt ein Modell an, wahlweise gleich mit Kachel auf der Landkarte der Ablage, und öffnet es auf Wunsch im Modeler. Freigegebene Modelle erscheinen mit ihrer Überprüfung unter „Fälligkeiten".</li>
        <li style="${li}"><b>📊 Reifegrad und Kennzahlen:</b> Jeder Prozess trägt einen <b>Reifegrad</b> nach ISO/IEC 33020 (0 unvollständig, 1 durchgeführt, 2 gesteuert, 3 etabliert, 4 vorhersagbar, 5 innovierend) und seine <b>Kennzahlen</b>, wie sie ISO 9001 in Abschnitt 4.4 verlangt: Name, Ziel mit Richtung („mindestens" oder „höchstens"), Einheit, zuletzt gemessener Wert und Stand. Die Ampel zeigt, ob das Ziel erreicht ist. Gepflegt wird an der Kachel („Bearbeiten") oder am Modell (Modeler rechts unter „Prozessmanagement"). Die Konzernkachel gibt Kennzahlen als <b>Vorgabe</b> vor, gemessen wird im Werk: Übernommen wird das Ziel, nie der Messwert des Konzerns, und ein werksspezifischer Prozess erbt nichts. Den Reifegrad bewertet jedes Werk selbst. Ab der Freigabe nennt das Backlog fehlende Kennzahlen und einen fehlenden Reifegrad als Lücke, bei ausgerollten gruppeneinheitlichen Prozessen auch einen Reifegrad unter 3. Im Kopf des Backlogs stehen dazu „mit Kennzahlen", „Kennzahl verfehlt" und „Reifegrad bewertet".</li>
        <li style="${li}"><b>Ganzer Bildschirm:</b> <b>„⛶ Vollbild"</b> legt den Modeler über Seitenleiste und Kopfzeile und bittet zusätzlich den Browser um echtes Vollbild – lehnt der ab, bleibt es bei der Überlagerung. Die Angaben rechts fahren dabei ein (<b>„▤ Angaben"</b> holt sie zurück): Gemessen bei 1440 × 900 wächst die Zeichenfläche von <b>909 × 630</b> auf <b>1412 × 838</b>, gut das Doppelte. <b>Esc</b> beendet, und der Editor merkt sich, wie zuletzt gearbeitet wurde.</li>
        <li style="${li}"><b>Ansicht statt Modeler:</b> Ein Klick auf ein Modell öffnet es zum Lesen, aufgebaut wie die Prozessseite der E-Rechnung. Das Diagramm ist farbig: orange tut ein Mensch, blau läuft automatisch, grau ist ein Handgriff ohne System, violett ein eingebundener Unterprozess, gold eine Entscheidung, grün sind Anfang und gutes Ende, rot ein Ende, das niemand will. Darunter stehen links die <b>Schritte</b> in der Reihenfolge des Ablaufs (der Regelfall zuerst, Übergaben zwischen Rollen markiert) und rechts <b>„Was auffällt"</b>: die Befunde des Hausschemas als Tabelle mit Einstufung (Verstoß oder Hinweis), die <b>Stellschrauben</b> (Übergaben, Anteil der Automatik, Entscheidungen) und der Stand in Landkarte und Notfall. Ein Klick auf einen Schritt oder Befund holt die Stelle ins Bild, ein Klick ins Bild markiert die passende Zeile. Im Diagramm trägt jede Stelle mit Befund einen roten (Verstoß) oder gestrichelten (Hinweis) Rahmen und eine Plakette mit der Regel. <b>„✎ Bearbeiten"</b> öffnet den Modeler, <b>„👁 Ansicht"</b> führt zurück. Das Bild aus der Ansicht behält die Farben, der BPMN-Download gibt die Datei unverändert heraus.</li>
        <li style="${li}"><b>Befunde im Modeler:</b> Nach jeder Änderung prüft der Modeler das Modell still gegen das Hausschema. Rechts unter „Hausschema" stehen die Befunde als Tabelle, ein Klick zeigt die Stelle, und im Diagramm tragen sie Rahmen und Plakette. „🔍 Schema" prüft weiterhin sofort und meldet das Ergebnis.</li>
        <li style="${li}"><b>Diagramm als Bild:</b> Im Modeler liefert <b>„⬇ Bild"</b> das Diagramm als SVG – direkt in Word, PowerPoint oder ein Regelwerk einfügbar. Mit einer .bpmn-Datei kann außerhalb des Modelers niemand etwas anfangen.</li>
        <li style="${li}"><b>Link auf einen Prozess:</b> <b>„🔗 Link"</b> in der Kachel kopiert einen dauerhaften Link (<code>?prozess=WERK:KACHEL</code>) – für Mails, Regelwerke und Schulungen. Er öffnet die richtige Landkarte und die richtige Kachel.</li>
        <li style="${li}"><b>Link auf ein Modell:</b> <code>?modell=&lt;Kennung der Datei&gt;</code> öffnet das Modell direkt in der Ansicht, auch nach der Anmeldung. Die Prozessseite der E-Rechnung nutzt ihn für „im RMS öffnen“ und liest ihre Modelle aus der Ablage KONZERN. Wer dort ein Modell ändert, ändert es auch auf der E-Rechnungs-Seite.</li>
        <li style="${li}"><b>Abgleich Kachel ↔ Modell:</b> Ein Regelwerk kann an der Kachel hängen und zusätzlich im BPMN-Marker stehen. Laufen beide auseinander, zeigt die Mindmap das im Kasten „An der Kachel, aber nicht im Modell" – mit einem Knopf, der die fehlende Zuordnung ins Modell schreibt.</li>
        <li style="${li}"><b>Jedes Werk hat seinen eigenen Ordner:</b> Ein Modell wird unter <b>Prozesse/&lt;Werk&gt;</b> in der ISMS-Bibliothek abgelegt – „Vertrieb" in HOL und „Vertrieb" in SHB sind damit zwei Dateien und nicht eine. In der Modell-Liste steht jedes Werk als eigener Block; im Modell selbst lässt sich die <b>Ablage</b> wechseln, die Datei zieht dann um. Modelle aus früheren Ständen liegen noch direkt im Ordner „Prozesse" – <b>„🗂 Ablage aufräumen"</b> sortiert alle ein, die eindeutig zu einem Werk gehören. Dabei bleibt die Kennung der Datei erhalten, es reißt also keine Verknüpfung.</li>
        <li style="${li}"><b>Pfeile aus älteren Modellen:</b> Bis Oktober 2026 zog „✨ Aus Richtlinie" zwei Arten von Pfeilen falsch. Ein Ja-Pfeil, dessen nächster Schritt eine Bahn tiefer lag, lief durch den Nein-Zweig ins Leere, und ein Pfeil in eine höhere Bahn lief durch den eigenen Kasten. Ansicht und Editor zeigen solche Pfeile schon richtig; im Editor übernimmt <b>Speichern</b> die Korrektur. <b>„↪ Pfeile prüfen"</b> in der Modell-Liste liest alle Modelle, nennt die betroffenen und korrigiert sie nach Rückfrage in der Datei. Neu gezogen werden nur Pfeile, die ins Leere oder durch den eigenen Kasten laufen. Was von Hand gezogen ist, bleibt. SharePoint legt je Modell eine neue Version an, die alte bleibt im Versionsverlauf.</li>
        <li style="${li}"><b>Suche über alle Werke:</b> Das Suchfeld oben findet einen Prozess in <b>jeder</b> Landkarte, nicht nur in der offenen. Ein Klick auf den Treffer wechselt die Karte und öffnet die Kachel.</li>
        <li style="${li}"><b>Geltungsbereich je Prozess</b> – dieselben Standorte wie bei den Regelwerken. Über die Auswahl <b>Standort</b> oben lässt sich fragen: „Welche Prozesse gelten in SHB?" Was dort nicht gilt, wird <b>ausgegraut</b> statt ausgeblendet – so bleibt die Landschaft vergleichbar.</li>
        <li style="${li}"><b>Prozesstypen – die Farben:</b> Jeder Prozess ist <b style="color:#17509E">Führungs-</b>, <b style="color:#F08300">Kern-</b> oder <b style="color:#5B8CB8">Unterstützungsprozess</b>; die Kachel trägt die Farbe, quer über alle Karten – auch dort, wo die Bänder anders heißen (Strategie, Finanzierung, Beratung). In den klassischen drei Bändern ergibt sich der Typ aus dem Band; im Editor lässt er sich je Kachel setzen (ein Kernprozess im Band „Beratung" – dann steht das Wort dabei). Was keinem Typ zugeordnet ist, ist eine <b>Kategorie</b>: Überschrift, Sammelbegriff, kein Ablauf – mit gestrichelter Kante und einer <b>festen Farbe nach ihrer Bedeutung</b>, auf jeder Karte dieselbe: <b style="color:#17509E">Strategie &amp; Führung</b>, <b style="color:#F08300">Wertschöpfung</b>, <b style="color:#7A6417">Finanzen &amp; Controlling</b>, <b style="color:#8B1E3F">Risiko, Recht &amp; Compliance</b>, <b style="color:#0F766E">Personal &amp; Organisation</b>, <b style="color:#5B21B6">IT &amp; Technik</b>, <b style="color:#0284C7">Kommunikation &amp; Markt</b>, <b style="color:#6D28D9">Transformation &amp; Projekte</b>, <b style="color:#92400E">Beteiligungen &amp; Konzern</b>, <b style="color:#5B8CB8">Unterstützung &amp; Services</b>; was zu keiner passt, ist <b style="color:#1A2644">dunkelblau</b>. Erkannt wird über den Namen des <b>Bereichs</b> – alle Kategorien eines Bereichs tragen eine Farbe, seine; ein Band, das nach Kacheln bunt würde, sähe nach Zufall aus. Die Bereiche einer Karte ohne Prozesstypen (Strategie, Finanzierung, Beratung …) tragen dieselben festen Farben. Und wer es anders will: Im <b>Bereichs-Dialog</b> (Klick auf den Balken) lässt sich die Farbe selbst wählen – Farbfeld oder eine der Hausfarben; „Standard" nimmt sie zurück. Die eigene Farbe gilt für alle Kacheln des Bereichs, außer für Prozesse mit selbst gesetztem Typ. Die Legende steht unter der Karte, die Mindmap nimmt dieselben Farben.</li>
        <li style="${li}"><b>Vorlage „SAP – nach Prozesstypen":</b> die SAP-Ketten in der Form jeder Prozesslandkarte – Führung (Governance), Kern (Lead to Cash, Design to Operate, Source to Pay), Unterstützung (Recruit to Retire, IT, Record to Report). Jede Kette ist ein Hauptprozess, ihre Schritte hängen als Unterprozesse darunter und laufen als „Danach folgt". Die Mindmap zeigt dann drei Ebenen: <b>Typ → Kette → Schritt</b>.</li>
        <li style="${li}"><b>Prozess-Nr. – eindeutig und einmalig:</b> Jede Kachel bekommt beim ersten Erscheinen eine Nummer (<code>P-042</code>) aus einem Zähler, der über alle Karten läuft und nie zurückgesetzt wird: gelöschte Nummern werden nicht neu vergeben, Umbenennen und Umsortieren ändern nichts. So lässt sich ein Prozess in Regelwerken, Tickets, Modellen und auf Papier benennen. Die Suche findet ihn auch über die Nummer. Ein Name darf in einer Karte nur einmal vorkommen – die App weist ein zweites Anlegen ab; gibt es ihn in einer anderen Karte, sagt sie es.</li>
        <li style="${li}"><b>+ Unterprozess:</b> Suchen, dann <b>einbinden</b> – aus dieser oder jeder anderen Karte; nur was es nirgends gibt, wird neu angelegt (im Band des Hauptprozesses, mit dessen Geltungsbereich, mit eigener Nummer). Ein Unterprozess bleibt <b>ein</b> Prozess: eine Nummer, eine Kachel, einmal gepflegt, auch wenn er in mehreren Hauptprozessen hängt (⇄ n). Kreise weist die App ab.</li>
        <li style="${li}"><b>Bearbeiten:</b> „+ Prozess" legt eine Kachel an, ein Klick auf „Bearbeiten" ändert Name, Untertitel, Band, Prozesstyp und Geltungsbereich. Kacheln lassen sich <b>zwischen den Bändern ziehen</b>. Jede Änderung steht mit Person und Zeitpunkt im <b>Versionsverlauf</b> (Knopf oben).</li>
        <li style="${li}">Die Karte liegt als <b>prozesslandkarte.json</b> im Konfigurations-Ordner – wie die Governance-Struktur. Keine zusätzliche SharePoint-Liste, keine neue Spalte.</li>
      </ul>
      <ul style="${ol}">
        <li style="${li}"><b>+ Neuer Prozess</b> – leeres Diagramm im Modeler (Elemente aus der Palette ziehen).</li>
        <li style="${li}"><b>📋 Standard-Prozesse</b> – legt die <b>im RMS gelebten Abläufe</b> auf einen Schlag als BPMN-Entwürfe an (siehe unten).</li>
        <li style="${li}"><b>⬆ Importieren</b> – eine vorhandene <b>.bpmn/.xml</b>-Datei einlesen und weiterbearbeiten. Status und Angaben zum Prozessmanagement, Regelwerke und Anlagen, die in der Datei stehen, kommen mit. Eine <b>Aufrufaktivität</b> (⊞), die ihr Ziel nur über <code>calledElement</code> nennt, wird eingebunden, sobald es im RMS genau ein Modell mit dieser Prozess-Kennung gibt: Zusammengehörige Modelle also erst die Unterprozesse importieren, dann das Modell, das sie aufruft. Elemente mit eigener Farbe in der Datei (etwa die Bewertung einer IST-Aufnahme: rot, gelb, grau, grün) behalten sie in Ansicht, Bild und Prozessbeschreibung.</li>
        <li style="${li}"><b>✨ Aus Regelwerk</b> – erzeugt einen echten Prozessentwurf per <b>Texterkennung</b> aus dem verknüpften Word-Dokument des Regelwerks.</li>
        <li style="${li}">Je Prozess wählbar, welche <b>Regelwerke</b> er umsetzt; die Verknüpfung wird in der BPMN-Datei mitgespeichert und auf den Karten angezeigt.</li>
      </ul>
      <div style="${h3}">📋 Modelle: Gliederung nach Gesamtprozess</div>
      <p style="margin:0 0 8px;line-height:1.55">Die Ansicht <b>„📋 Modelle"</b> zeigt die BPMN-Dateien je Werk als <b>Gliederung</b>. Oben stehen die <b>Gesamtprozesse</b>, darunter ihre <b>Unter- und Nebenprozesse</b>, und darunter wieder deren Unter- und Nebenprozesse, so tief, wie es nötig ist. Modelle, die noch für sich stehen, folgen unter „Weitere Modelle, noch ohne Unter- oder Nebenprozess". <b>„▦ Kacheln"</b> schaltet auf die Kartenansicht nach Werk um, <b>„🌳 Gliederung"</b> zurück; der Browser merkt sich die Wahl.</p>
      ${tbl([
        ['⊞ Unterprozess, im Ablauf eingebunden', 'Ein Schritt im Diagramm ruft das Modell auf (siehe „⊞ Unterprozesse einbinden" oben). Gelöst wird diese Verbindung im Modeler, nicht in der Liste.'],
        ['↳ Unterprozess, zugeordnet', 'Gehört zum übergeordneten Prozess, ohne dass ein bestimmter Schritt ihn aufruft.'],
        ['⇢ Nebenprozess', 'Läuft neben dem übergeordneten Prozess her, mit eigenem Ablauf, etwa die Reklamation neben der Auftragsabwicklung.'],
      ])}
      <ul style="${ol}">
        <li style="${li}"><b>Erweitern:</b> <b>„+ Unter-/Nebenprozess"</b> an jeder Zeile öffnet den Dialog. Erst die Art wählen, dann ein vorhandenes Modell suchen (Name oder Werk, das eigene Werk steht oben; die Eingabetaste ordnet den einzigen Treffer zu) oder unter „Oder neu anlegen" einen Namen eingeben. Ein neues Modell entsteht als Grundgerüst nach Hausschema im Ordner des übergeordneten Modells und ist gleich zugeordnet. Was einen <b>Kreis</b> ergäbe, steht nicht zur Wahl.</li>
        <li style="${li}"><b>Lösen:</b> <b>✕</b> an einer zugeordneten Zeile nimmt die Zuordnung nach Rückfrage zurück; das Modell selbst bleibt, wie es ist. Zeigt eine Zuordnung auf ein gelöschtes Modell, steht dort <b>„Modell fehlt"</b>, ebenfalls mit ✕.</li>
        <li style="${li}"><b>Lesen:</b> <b>▸</b> klappt eine Zeile auf, <b>▾</b> zu, „Alle aufklappen" und „Alle zuklappen" stehen oben. Die Zeile nennt, wie viele Unter- und Nebenprozesse darunter stehen, und darunter Regelwerke, Status und Anlagen wie die Karten. <b>⇄ n</b> heißt: Das Modell steht unter n Prozessen und wird trotzdem einmal gepflegt. <b>🏭</b> nennt das Werk, wenn ein Modell im Ordner eines anderen Werks liegt. Die <b>Suche</b> zeigt jeden Treffer mit seinem Weg von oben, aufgeklappt.</li>
        <li style="${li}"><b>Wer oben steht:</b> ein Modell, das in keinem anderen Modell desselben Werks steht. Steht es nur unter einem Modell eines anderen Werks, bleibt es in seinem eigenen Werk oben, sonst fände man es dort nicht mehr. Ein Kreis, der aus älteren Daten stammt, wird mit <b>↻</b> markiert statt endlos aufgeklappt. Greift die Trennung nach Gesellschaft, bleiben fremde Werke draußen.</li>
        <li style="${li}"><b>In der Ansicht eines Modells</b> stehen oben in der Leiste die übergeordneten Prozesse (↰) und die zugeordneten Unter- und Nebenprozesse (↳, ⇢), jeweils zum Hineinspringen, dazu „+ Unter-/Nebenprozess".</li>
        <li style="${li}"><b>Gespeichert</b> wird die Zuordnung beim <b>übergeordneten</b> Modell, in der Dokumentation des Prozesses: als Klartext („Unterprozesse: …", „Nebenprozesse: …") und als Marker <code>[[rms:unter=…]]</code> und <code>[[rms:neben=…]]</code> mit den Datei-Kennungen. Das untergeordnete Modell ändert sich nicht; so kann es unter mehreren Gesamtprozessen stehen. Speichern im Modeler, Status setzen oder ein Regelwerk zuordnen lassen die Zuordnung stehen, und sie übersteht Export, Umbenennen und Umzug in ein anderes Werk.</li>
      </ul>
      <div style="${hint}">Mindmap und Verknüpfungen zeigen bisher nur die ⊞-Einbindungen, noch nicht die zugeordneten Unter- und Nebenprozesse.</div>
      <div style="${h3}">📋 Freigabe von Prozessen</div>
      <p style="margin:0 0 8px;line-height:1.55">Ein Prozessmodell sagt, wer was in welcher Reihenfolge tut: Es ist eine Arbeitsanweisung. Freigegeben wird es deshalb <b>wie eine Richtlinie</b>, mit demselben Workflow: Konformitätsprüfung, bei Bedarf Mitbestimmung, Freigabe durch die Geschäftsleitung, Version, Bekanntgabe, Kenntnisnahme und Wiedervorlage. Was zählt, ist der <b>Hauptprozess</b>: ein Modell, das unter keinem anderen steht. Seine Unter- und Nebenprozesse sind in seiner Freigabe enthalten und werden nicht einzeln freigegeben.</p>
      <ul style="${ol}">
        <li style="${li}"><b>„📋 Zur Freigabe"</b> steht in der Gliederung am Hauptprozess und in der Leiste seiner Ansicht. Der Dialog zeigt den Umfang (Hauptprozess, Unter- und Nebenprozesse) und den Titel des Regelwerks. Dann erzeugt das RMS die <b>Prozessbeschreibung als Word-Datei</b>: je Modell eine Seite mit Diagramm in den Farben der Ansicht und der Tabelle „Schritt für Schritt" (Nr., Schritt, Zuständig, Art; Entscheidungen mit ihren Ausgängen), vorn der Umfang. Die Datei liegt im Ordner „Richtlinien-Import" der App-Bibliothek.</li>
        <li style="${li}">Daraus entsteht ein <b>Regelwerk der Art „Arbeits-/Prozessanweisung"</b> als Entwurf, mit dieser Datei als Dokument und dem Werk des Modells als Geltungsbereich (Konzern und ohne Werk: alle Standorte). Das Modell trägt das Regelwerk unter „Verknüpfte Richtlinien" ein. Danach öffnet sich der <b>Editor des Regelwerks</b>: Prüfer, Geschäftsleitung, Zielgruppe und Geltungsbereich prüfen, dann „Zur Konformitätsprüfung →". Ab hier ist es ein Regelwerk wie jedes andere.</li>
        <li style="${li}"><b>Status in der Liste:</b> Am Hauptprozess steht der Status des Regelwerks mit Version, ein Klick öffnet es. An den Unter- und Nebenprozessen steht <b>„📋 Freigabe über …"</b> mit dem Status des Hauptprozesses.</li>
        <li style="${li}"><b>Ändert sich der Prozess</b>, zeigt der Hauptprozess <b>„⚠ Geändert: Beschreibung aktualisieren"</b>, mit dem Hinweis, welche Modelle geändert, neu dazugekommen oder weggefallen sind. Verglichen wird der <b>Ablauf</b>: Schritte, Namen, Bahnen, Verbindungen und was an den Schritten hängt. Die Lage im Bild, Status, verknüpfte Regelwerke und Anlagen des Prozesses zählen nicht. „Beschreibung aktualisieren" erzeugt die Datei neu und ersetzt sie am selben Ort; SharePoint behält die vorige Fassung im Versionsverlauf, die Historie des Regelwerks hält fest, was sich geändert hat. Ist das Regelwerk schon veröffentlicht, öffnet sich danach der Editor: Versionsnummer erhöhen und erneut zur Konformitätsprüfung geben.</li>
        <li style="${li}"><b>Im Reiter Freigaben, in den Workflow-Mails und im Editor</b> steht bei einem solchen Regelwerk, welchen Prozess es freigibt, mit wie vielen Unter- und Nebenprozessen und von welchem Stand das Dokument ist. Prüfer, Geschäftsleitung und Mitarbeitende lesen den Prozess im Dokument und brauchen dafür keinen Zugang zum Reiter Prozesse.</li>
        <li style="${li}">Gespeichert wird der Bezug am Regelwerk im Sammelfeld (<code>prozess</code>: Hauptprozess und der Stand, aus dem das Dokument entstand), ohne neue SharePoint-Spalte. Anlegen und Aktualisieren brauchen Schreibrecht auf <b>Prozesse</b> und auf <b>Richtlinien Dashboard</b>.</li>
      </ul>
      <div style="${h3}">🕸 Verknüpfungen</div>
      <p style="margin:0 0 8px;line-height:1.55">Wer hängt woran? <b>Prozess ↔ Modell ↔ Regelwerk ↔ Standort</b> als Mindmap: In der Mitte steht ein Objekt, ringsum stehen seine Beziehungen – nach Art beschriftet („modelliert in", „setzt um", „gilt für"). Ein <b>Klick auf einen Nachbarn</b> rückt diesen in die Mitte, <b>← Zurück</b> führt den Weg zurück. Über die Auswahl <b>„In die Mitte"</b> springt man direkt zu einem beliebigen Objekt.</p>
      <ul style="${ol}">
        <li style="${li}">Zeigt das Bild höchstens <b>zwölf</b> Nachbarn – mehr wären auf einem Kreis nicht mehr lesbar. <b>Vollständig</b> stehen alle darunter als anklickbare Chips, nach Beziehungsart gruppiert.</li>
        <li style="${li}"><b>Die Lücken</b> darunter sind der eigentliche Nutzen: <b>Prozesse ohne Modell</b>, <b>Modelle ohne Regelwerk</b>, <b>veröffentlichte Regelwerke ohne Prozess</b> und <b>Prozesse ohne Geltungsbereich</b>. Jeder Eintrag führt mit einem Klick dorthin, wo sich die Lücke schließen lässt.</li>
        <li style="${li}"><b>Als Baum (Übersicht):</b> Werk → Band → Hauptprozess → Schritt. Die Bänder tragen die Farben ihrer Prozesstypen, Unterprozesse hängen unter ihrer Kette statt daneben – wie man eine Prozesslandschaft zeichnet. Ein Prozess mit eigenem Typ behält seine Farbe auch im Baum.</li>
        <li style="${li}"><b>Über alle Werke hinweg:</b> Unter dem Konzern hängen die Werke mit eigener Landkarte, darunter deren Bänder und Prozesse. Werk und Standort sind derselbe Knoten – ein Werk zeigt also sowohl seine Landkarte als auch alles, was dort gilt.</li>
        <li style="${li}"><b>Verknüpfen direkt hier:</b> Steht ein <b>Prozess</b> in der Mitte, führt ein Knopf zum Modell (oder in die Landkarte, um eines anzulegen). Bei einem <b>Modell</b> lassen sich mit <b>„Regelwerke zuordnen"</b> die umgesetzten Regelwerke ankreuzen – ohne den Modeler zu öffnen. Bei einem <b>Regelwerk</b> geht es umgekehrt: <b>„Mit einem Modell verknüpfen"</b>.</li>
        <li style="${li}">Die Ansicht liest beim Öffnen alle Modelle einmal ein (dafür der kurze Ladehinweis) und legt <b>keine eigenen Daten</b> an. Zuordnungen schreibt sie dorthin, wo sie hingehören: in die <b>BPMN-Datei</b> – dieselbe Stelle, die auch der Prozess-Editor beschreibt.</li>
      </ul>
      <div style="${h3}">📋 Standard-Prozesse</div>
      <p style="margin:0 0 8px;line-height:1.55">Ein Klick legt die <b>13 dokumentierten RMS-Abläufe</b> als BPMN-Entwürfe an: Regelwerk-Lebenszyklus und -Allgemein, Regelwerk-Konzept, Kenntnisnahme &amp; Wissenstest, Änderungsvorschlag, Risiko-Management, KI-Antrag, Dokument-Health-Check, IMS-Abdeckung &amp; SoA, Fälligkeit/Wiedervorlage, Governance-Übernahme, Audit-Report sowie Außerkraftsetzung/Archivierung.</p>
      <div style="${hint}">Der Vorgang ist <b>gefahrlos wiederholbar</b>: bereits vorhandene Prozesse werden übersprungen, angelegt wird erst nach Bestätigung. Die Diagramme sind saubere <b>Startvorlagen</b> mit Aufgaben und Entscheidungs-Gateways – danach frei anpassbar.</div>
      <div style="${h3}">„Aus Regelwerk" – so entsteht der Entwurf</div>
      <ul style="${ol}">
        <li style="${li}">Regelwerk wählen → die App liest den <b>Text des Word-Dokuments</b> aus (direkt im Browser, ohne Server/KI) und zeigt ihn <b>editierbar</b> an.</li>
        <li style="${li}"><b>Nummerierte/aufgezählte Schritte</b> werden zu <b>Aufgaben</b>, Pfeile (→) trennen Schritte, <b>Entscheidungen</b> („…konform?", „…genehmigt?", Fragen) werden zu <b>Gateways</b> mit ja/nein-Zweig – inklusive fertigem Layout. Danach im Modeler frei anpassen und speichern.</li>
      </ul>
      <div style="${h3}">Beispiel</div>
      <div style="background:var(--c-bg,#f8fafc);border:1px solid var(--c-border,#e5e7eb);border-radius:10px;padding:12px 14px;line-height:1.6">
        Eine Beschaffungsrichtlinie enthält im Word-Dokument:
        <div style="font-family:monospace;font-size:.82rem;margin:6px 0;color:var(--c-muted)">1. Antrag im System erfassen<br>2. Vorgesetzter: Antrag prüfen<br>3. Freigegeben?<br>4. Bestellung auslösen<br>5. Wareneingang dokumentieren</div>
        „✨ Aus Regelwerk" erzeugt daraus: <b>Start → Aufgabe „Antrag erfassen" → Aufgabe „Vorgesetzter: Antrag prüfen" → Gateway „Freigegeben?"</b> (ja → „Bestellung auslösen" → „Wareneingang dokumentieren" → Ende; nein → „Abweichung behandeln" → Ende „Nachbessern"). Der Prozess ist automatisch mit dem Regelwerk verknüpft.
      </div>
      <div style="${hint}">💡 Kein Word-Dokument verknüpft? Dann einfach den Prozesstext in das Feld einfügen – der Entwurf wird genauso erzeugt.</div>`,
      'ISO 27001 A.5.37 (Dokumentierte Betriebsabläufe), Klausel 8.1 (Betriebliche Planung &amp; Steuerung); NIS2 Art. 21(2) (Verfahren &amp; Maßnahmen).'),

    sec('prozessschema', 'Prozesse niederschreiben (Hausschema)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">BPMN kennt über hundert Symbole. Wer alle zulässt, bekommt Modelle, die niemand außer ihrem Verfasser liest – und die im Audit <i>erklärt</i> werden müssen, statt zu erklären. Das Hausschema lässt <b>zehn</b> zu und legt fest, wie sie benannt werden. Der Editor prüft dagegen: Knopf <b>„🔍 Schema"</b>.</p>
      <p style="margin:0 0 8px;line-height:1.55">Drei Entscheidungen tragen alles Weitere:</p>
      <ul style="${ol}">
        <li style="${li}"><b>Eine Aufgabe sagt am Symbol, wer sie ausführt</b> – 👤 Mensch, ⚙ System, ✋ Handgriff ohne Anwendung. Das nackte BPMN-Kästchen ist verboten: Es sieht aus wie eine Aussage und ist keine.</li>
        <li style="${li}"><b>Eine Bahn ist eine Rolle, keine Person.</b> Personen wechseln, Rollen bleiben; ein Modell mit Namen darin ist am nächsten Montag falsch. Jeder Knoten liegt in genau einer Bahn – <b>„wer ist zuständig"</b> hat damit immer eine Antwort, und ein Bahnwechsel ist im Bild eine <b>Übergabe</b>: genau dort gehen Prozesse kaputt.</li>
        <li style="${li}"><b>Benennung ist Teil des Schemas.</b> Aufgaben: Verb im Infinitiv + Objekt („Antrag prüfen", nicht „Antragsprüfung"). Entscheidungen: eine Frage mit Fragezeichen. Ereignisse: ein Zustand, kein Verb.</li>
      </ul>
      <div style="${h3}">Die zehn Bausteine</div>
      <table class="doku-tbl"><tbody>${(typeof PROZESS_BAUSTEINE !== 'undefined' ? PROZESS_BAUSTEINE : []).map(b => `<tr>
        <td style="font-weight:600;white-space:nowrap"><span style="font-size:1.05rem">${b.symbol}</span> ${esc(b.titel)}</td>
        <td>${esc(b.zweck)}<div style="color:var(--c-muted);font-size:.85em;margin-top:2px">Benennung: ${esc(b.benennung)}${b.beispiel ? ' · z. B. „' + esc(b.beispiel) + '"' : ''}</div></td>
      </tr>`).join('')}</tbody></table>
      <div style="${h3}">So wird ein Prozess aufgeschrieben</div>
      <p style="margin:0 0 8px;line-height:1.55">Vor dem Doppelpunkt steht die <b>Bahn</b>, dahinter der Schritt. Mehr braucht es nicht. Aus diesen Zeilen baut der Generator ein vollständiges Modell mit Pool, Bahnen und richtigen Symbolen: Reiter „Prozesse", Ansicht „📋 Modelle", <b>„✨ Aus Richtlinie"</b>. Den Weg Schritt für Schritt beschreibt „BPMN einfach erklärt".</p>
      <pre style="background:var(--c-bg,#f8fafc);border:1px solid var(--c-border);border-radius:8px;padding:10px;overflow:auto;font-size:.82rem;line-height:1.5">${esc(typeof PROZESS_VORLAGE_TEXT !== 'undefined' ? PROZESS_VORLAGE_TEXT : '')}</pre>
      ${tbl([
        ['<code>Rolle: Schritt</code>', 'Wird eine Aufgabe 👤 in der Bahn „Rolle".'],
        ['<code>System: Schritt</code>', 'Die Bahnen <b>System, Automatik, Workflow, Cron</b> gelten als ⚙ – wer das schreibt, meint kein Handanlegen.'],
        ['<code>… (automatisch)</code>', 'Macht ⚙ daraus, egal in welcher Bahn. Auch im Einkauf läuft manches von selbst.'],
        ['<code>… (manuell)</code>', 'Macht ✋ daraus: findet außerhalb jeder Anwendung statt.'],
        ['<code>… (Unterprozess)</code>', 'Macht ⊞ daraus: ein eigener Prozess, der an dieser Stelle im Ganzen läuft. Im Modeler wird dann das Modell gewählt, das eingebunden wird – bis dahin meldet die Prüfung R10.'],
        ['<code>Frage?</code>', 'Ein Fragezeichen macht eine Entscheidung ◇ daraus.'],
        ['<code>Frage? | nein: Text</code>', 'Benennt den Nein-Zweig. <b>Mit</b> Angabe endet er in „Beendet", <b>ohne</b> in „Nachbessern" – nicht jede Nein-Antwort ist ein Fehler.'],
        ['<code>Start: …</code> / <code>Ende: …</code>', 'Auslöser und Ergebnis. Fehlen sie, ergänzt der Generator sie.'],
        ['<code>Warten: …</code>', 'Der Prozess ruht ⏱, bis eine Frist abläuft oder eine Nachricht kommt.'],
        ['<code>A: eins → B: zwei</code>', 'Pfeile trennen mehrere Schritte einer Zeile.'],
      ])}
      <div style="${h3}">Woran die Prüfung scheitert</div>
      <table class="doku-tbl"><tbody>${(typeof PROZESS_REGELN !== 'undefined' ? PROZESS_REGELN : []).map(r => `<tr>
        <td style="font-weight:600;white-space:nowrap">${esc(r.id)}</td>
        <td>${esc(r.text)}<div style="color:var(--c-muted);font-size:.85em;margin-top:2px">${esc(r.warum)}</div></td>
      </tr>`).join('')}</tbody></table>
      <div style="${hint}">Die Prüfung unterscheidet <b>Fehler</b> (verletzt eine Regel) und <b>Hinweise</b> (Empfehlung, begründet übergehbar) – etwa, wenn eine Bahn wie ein Personenname aussieht: Sicher sagen lässt sich das nicht. Ein Modell, das die Prüfung besteht, beantwortet ohne Rückfrage: <b>wer ist zuständig</b>, <b>was läuft automatisch</b>, <b>wie geht die Sache aus</b>.</div>`,
      'ISO 27001 Klausel 4.4 (Managementsystem und seine Prozesse), 5.3 (Rollen und Verantwortlichkeiten), 7.5 (dokumentierte Information); ISO 9001 4.4 verlangt dasselbe für alle Prozesse. Notation: OMG BPMN 2.0.'),

    sec('vorschlaege', 'Vorschläge bearbeiten', 'admin', `
      <p style="margin:0;line-height:1.55">Reiter <b>„Vorschläge"</b> sammelt alle Änderungsvorschläge (auch die aus dem Health-Check, erkennbar am 🩺-Merkmal). Eine Zeile öffnet ein Seitenpanel: Vorschlag samt Dokument-Link lesen, <b>Status</b> setzen (Offen / In Bearbeitung / Erledigt / Abgelehnt) und einen <b>Bearbeiter-Kommentar</b> hinterlegen. Sichtbar für Admins, ISMS-Verantwortliche und Vorschlags-Empfänger.</p>`),

    sec('compliance', 'Audit Report', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Audit Report"</b> hat drei Ansichten:</p>
      <ul style="${ol}">
        <li style="${li}"><b>Gesamtübersicht</b> – wer welche Pflicht-Regelwerk erledigt hat (Soll/Ist je Regelwerk und Abteilung).</li>
        <li style="${li}"><b>Einzelne Regelwerk</b> – Detailliste je Mitarbeiter (Status, Datum, Quiz-Score).</li>
        <li style="${li}"><b>Freigabe-Audit</b> – lückenloser Nachweis <b>wer wann was</b> geprüft und freigegeben hat: jede Konformitätsprüfung (konform/nicht konform, mit Anmerkung), jede Freigabe und jede Veröffentlichung, über alle Regelwerke hinweg (auch archivierte), neueste zuerst. In Outlook (Power Automate) erteilte Freigaben erscheinen als eigenes Ereignis.</li>
      </ul>
      <div class="field-hint">Alle drei Ansichten mit <b>CSV-Export</b>.</div>
      <div style="${h3}">C-Level-Bericht (Management)</div>
      <ul style="${ol}">
        <li style="${li}">Button <b>„📧 C-Level-Bericht"</b> erstellt einen kompakten Management-Bericht: Gesamteinschätzung (🟢/🟡/🔴), die wesentlichen Kennzahlen (Regelwerke, Kenntnisnahme-Quote, Annex-A-/NIS2-Abdeckung, hohe Risiken, IT/OT-Reifegrad) und eine <b>Normkonformitäts-Prüfung nach ISO 27001 / NIS2</b> je Kapitel.</li>
        <li style="${li}"><b>Vorschau</b> mit editierbarer Empfängerzeile, <b>🖨 Drucken/PDF</b> und <b>Senden</b>. Der Standard-Empfänger wird in den <b>Einstellungen → C-Level-Bericht</b> hinterlegt.</li>
      </ul>`,
      'ISO 27001 Klausel 7.3 (Bewusstsein), 9.1 (Überwachung &amp; Messung), A.6.3 (Schulung), A.5.36 (Einhaltung von Regelwerke); Freigabe-Audit zusätzlich A.5.1 (Genehmigung &amp; Überprüfung), Klausel 9.2 (internes Audit).'),

    sec('einstellungen', 'Einstellungen', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Einstellungen"</b> (Admin) pflegt zentrale Rollen und Automatiken:</p>
      <ul style="${ol}">
        <li style="${li}"><b>Rollen:</b> Admins, Genehmiger, Prüfer, Geschäftsleitung, KI-Gremium, ISMS-Verantwortliche und Vorschlags-Empfänger.</li>
        <li style="${li}"><b>Genehmigungs-Schwellen:</b> „konform/freigegeben, wenn alle zustimmen" oder „einer reicht" (global; je Regelwerk überschreibbar).</li>
        <li style="${li}"><b>Erinnerungen:</b> aktiv/aus, Absender-Postfach, Taktung, Eskalation, Ersatz-Empfänger. Nachgefasst wird bei allen vier wartenden Etappen – <b>Konzeptprüfung</b> (Geschäftsleitung), <b>Konformitätsprüfung</b>, <b>Mitbestimmung</b> (KBR/Betriebsräte) und <b>Freigabe</b> – jeweils mit den Entscheidungs-Schaltflächen in der Mail.</li>
        <li style="${li}"><b>Mitbestimmung (KBR/BR):</b> Mailadresse des Konzernbetriebsrats und je Werk (SHB, WGC, SCH, EIS, DSO, ZAI, LEG, MEG, EWA) für die Mitbestimmungsprüfung.</li>
        <li style="${li}"><b>Power Automate (Genehmigung ohne Portal):</b> je Etappe wählbar – <b>aus</b> (App verschickt die Mails) · <b>nur Freigabe (Geschäftsleitung)</b> · <b>Prüfung + Freigabe</b>. Für die per Power Automate gesteuerte Etappe verschickt die App keine eigene Mail (Details in <code>docs/GENEHMIGUNG-POWER-AUTOMATE.md</code>).</li>
        <li style="${li}"><b>C-Level-Bericht:</b> Empfängeradresse(n) für den Management-Bericht aus dem Audit Report.</li>
        <li style="${li}"><b>Trennung nach Gesellschaft (E-Mail-Domäne):</b> Die DIHAG-Gruppe sind mehrere Gesellschaften mit eigenen Mail-Domänen. Eine ganze Gesellschaft lässt sich mit <b>einem</b> Eintrag berechtigen (🏭 in der Rechtematrix) – niemand muss mehr jede Person einzeln eintragen und bei jedem Eintritt daran denken. Darunter trennt die Tabelle <b>„Trennung nach Gesellschaft"</b>: Ist bei einem Reiter mindestens eine Gesellschaft angehakt, sehen ihn <b>nur noch</b> Konten aus diesen Domänen – auch dann, wenn ihnen der Reiter sonst freigegeben wurde. Ohne Haken bleibt er offen für alle. Maßgeblich ist die Domäne des Kontos (Anmeldename <i>und</i> Mailadresse, denn beide können auseinanderfallen), nicht ein gepflegtes Feld: Sie lässt sich nicht vergessen. <b>Administratoren sind ausgenommen</b> – sonst käme niemand mehr in die Einstellungen, um eine falsch gesetzte Trennung zurückzunehmen. Über <b>„🔍 Im Verzeichnis suchen"</b> schlägt die Seite die Domänen des Mandanten vor; das zählt nur die ohnehin geladene Mitarbeiterliste und braucht keine zusätzliche Berechtigung.</li>
        <li style="${li}"><b>Inhalte nach Gesellschaft trennen:</b> Die Reiter-Sperre sagt, welche <b>Ansicht</b> jemand öffnen darf – nicht, was er dort sieht. Mit dem Schalter <b>„Jede Gesellschaft sieht nur ihre eigenen Regelwerke und Prozesse"</b> sieht jede Gesellschaft nur noch, was für <b>ihre Werke</b> gilt, plus alles Konzernweite. Die Brücke ist der <b>Geltungsbereich</b>, den jedes Regelwerk ohnehin trägt: Deshalb bekommt jede Gesellschaft in der Tabelle ihre <b>Werke</b> zugeordnet. Ohne zugeordnete Werke ändert sich für sie nichts. Dieselbe Trennung greift für die <b>Prozesslandkarten</b> und die BPMN-Modelle; die Ebene <b>Konzern</b> bleibt immer sichtbar. Wer über alle Gesellschaften hinweg arbeitet, gehört in die Liste <b>Konzernsicht</b> – sonst sieht auch die Konzern-Governance nur noch ihre eigene Gesellschaft. Gefiltert wird nie stillschweigend: Über der Liste steht, wessen Regelwerke gezeigt werden, und ein Mail-Link auf ein fremdes Regelwerk sagt „andere Gesellschaft" statt „wurde gelöscht". <b>Wichtig:</b> Das trennt die <b>Sicht</b>, nicht den Zugriff – alle Regelwerke liegen in einer SharePoint-Liste, wer deren Leserecht hat, käme technisch an alles heran.</li>
        <li style="${li}"><b>Reiter-Berechtigungen (Lesen/Schreiben):</b> eigener Bereich in den Einstellungen (Umschalter oben). Eine Zeile je <b>Person</b>, <b>Gruppe</b> oder <b>Gesellschaft</b>, eine Spalte je Reiter: <b>–</b> kein Zugriff, <b>L</b> Lesen, <b>S</b> Schreiben. Zelle anklicken schaltet weiter, Zeile aufklappen zeigt alle Reiter mit Beschriftung. Suche und Reiter-Filter für den Überblick. <b>Von sich aus sieht jede:r nur „Wissen"</b> – auch „Meine Regelwerke", Anleitung, Dokumentation, <b>Freigaben</b> und <b>Vorschläge</b> sowie die Links zu KI-Dashboard und ZAPP werden hier freigegeben, am einfachsten je Gesellschaft (🏭). Die Rolle als Genehmiger, Prüfer, Geschäftsleitung oder Vorschlags-Empfänger entscheidet weiterhin, <i>was</i> jemand darf – den Reiter zeigt sie nicht mehr von allein. Ein Freigabe-Link aus einer Mail ohne freigegebenen Reiter sagt das; die Mitbestimmung des Betriebsrats braucht den Reiter nicht.</li> Wer keine Freigabe für „Meine Regelwerke" hat, landet beim Start und über Regelwerk-Links in „Wissen" und bekommt einen Hinweis. Admins haben immer Zugriff; „Nur Lesen" = Reiter sichtbar, aber Anlegen/Bearbeiten gesperrt; „Schreiben" schließt Lesen ein. „Einstellungen" bleibt Admins vorbehalten.</li>
        <li style="${li}"><b>Freigabe an Gruppen:</b> statt jede Person einzeln einzutragen, kann eine <b>Gruppe</b> berechtigt werden – <b>Sicherheitsgruppe</b>, <b>Verteilergruppe</b> oder <b>Microsoft-365-Gruppe</b>. Wer in der Gruppe ist, bekommt den Reiter automatisch; verschachtelte Gruppen zählen mit. Gesucht wird über den Namen <b>oder die Adresse</b> (Verteiler kennt man oft nur als <code>einkauf@…</code>). Gespeichert wird die Objekt-ID, ein Umbenennen ändert also nichts.</li>
        <li style="${li}"><b>Eine Ausnahme:</b> <b>dynamische</b> Verteilerlisten aus Exchange lassen sich nicht berechtigen – sie existieren nur in Exchange und nicht als Objekt im Verzeichnis. Eine gewöhnliche (statische) Verteilergruppe funktioniert.</li>
      </ul>`,
      'ISO 27001 Klausel 5.3 (Rollen, Verantwortlichkeiten &amp; Befugnisse), 7.4 (Kommunikation), A.5.2 (Rollen).'),

    sec('probelauf', 'Probelauf (Vorführung & Test)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Der <b>Probelauf</b> führt die komplette Kette an einem
      <b>echten Vorgang</b> vor – nichts ist nachgebaut, nichts umgeleitet.
      Start über <b>Anleitung → „Probelauf starten"</b>.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Echte Daten:</b> Es entstehen echte Einträge in den SharePoint-Listen und der
          normale Workflow läuft darüber. Sinnvoll, solange das System noch nicht ausgerollt ist.</li>
        <li style="${li}"><b>Echte E-Mails:</b> Die Nachrichten gehen über Microsoft Graph an die in den
          Einstellungen hinterlegten Prüfer, Betriebsräte und Geschäftsleitung – mit Dokument im Anhang
          und Link auf die Datei in SharePoint. Der Startdialog zeigt vorher, wer sie bekommt.</li>
        <li style="${li}"><b>Kennzeichnung:</b> Alles Angelegte trägt <code>[Probelauf]</code> im Titel.
          Weil das in den Daten steht, erscheint es automatisch im Betreff, im Mailtext und in jeder Ansicht.</li>
        <li style="${li}"><b>Dokument:</b> Zum Konzept und zum Regelwerk entsteht je eine <b>Word-Datei</b>
          in der Dokumentbibliothek – sie lässt sich in SharePoint direkt öffnen und weiterschreiben.
          Dadurch hängt sie an den Mails und ist über den SharePoint-Link erreichbar, wie im Betrieb.
          Beim Aufräumen wird die Datei mitgelöscht. Wer lieber eine eigene Datei zeigt, hängt sie im
          Editor ganz normal an.</li>
        <li style="${li}"><b>Aufräumen:</b> Jeder angelegte Eintrag wird mitgeschrieben; „🧹 Aufräumen" im
          Streifen löscht genau diese wieder – nichts anderes. Versendete E-Mails bleiben naturgemäß.
          Stehen noch Einträge mit <code>[Probelauf]</code> aus einem anderen Browser oder einem früheren
          Lauf in den Listen, nennt der Dialog sie gesondert; gelöscht werden sie nur mit Häkchen.
          „Beenden" bietet „Aufräumen und beenden" in einem Schritt an.</li>
        <li style="${li}"><b>Die Belegschaft bekommt nichts mit:</b> Unter „Meine Regelwerke" sehen
          Probelauf-Einträge nur Freigeschaltete. Bekanntgabe und Pflicht-Erinnerung eines Probelaufs gehen
          nur an die Person, die ihn ausführt, ohne Rückfrage. Der tägliche Erinnerungslauf lässt
          Probelauf-Einträge ganz aus und schreibt stattdessen einmal die Woche der Person, die sie angelegt
          hat, dass noch aufzuräumen ist. Prüfer, Betriebsrat und Geschäftsleitung bekommen ihre Mails
          weiter, denn sie entscheiden im Probelauf mit. Audit Report, Cockpit, Fälligkeiten, IMS-Abdeckung
          und Freigabe-Audit zählen Probelauf-Einträge nicht mit.</li>
        <li style="${li}"><b>Geführte Vorführung:</b> hebt Schritt für Schritt das nächste Bedienelement
          hervor und wartet, bis der Schritt <i>wirklich</i> ausgeführt wurde. „Vormachen" erledigt einen
          Schritt automatisch – praktisch, wenn es in einer Präsentation schnell gehen muss.</li>
        <li style="${li}"><b>Selbsttest:</b> spielt Konzept → Entwurf → Konformitätsprüfung → Mitbestimmung →
          Freigabe → Kenntnisnahme → Historie in einem Zug durch und zeigt einen Bericht mit allen
          Prüfpunkten und der Dauer. Während des Laufs steht unten, bei welchem Schritt er ist.
          Sinnvoll nach jeder Aktualisierung.
          <ul style="margin:4px 0 0;padding-left:18px">
            <li>Vor dem Start zeigt er die <b>Voraussetzungen</b>: ob Sie in der Geschäftsleitung stehen, ob Prüfer und
              Betriebsrat hinterlegt sind und ob eine Freigabe zur Veröffentlichung genügt.</li>
            <li>Er prüft die <b>Mails</b>, nicht nur die Empfängerlisten: jede Mail mit Betreff, Empfängern und ob
              Microsoft Graph sie angenommen hat, auch die, die ein Schritt verschickt, ohne darauf zu warten.
              Läuft eine Etappe über Power Automate, steht dort ein Hinweis.</li>
            <li>Steht die Freigabe-Schwelle auf <b>„alle"</b>, kann der Test nicht veröffentlichen. Das steht als
              <b>Hinweis</b> im Bericht („1 von 3 Freigaben"), nicht als Fehler.</li>
            <li><b>„Danach aufräumen"</b> (voreingestellt) löscht genau den Vorgang des Tests, nicht den der Vorführung.</li>
            <li><b>„Auch Ablehnungen prüfen"</b> geht zusätzlich die Wege, auf denen etwas abgelehnt wird: Konzept
              abgelehnt, „nicht konform" in der Prüfung und in der Mitbestimmung.</li>
            <li><b>„📋 Als Nachweis ablegen"</b> legt den Bericht als <b>Funktionsprüfung</b> im Register
              „Wirksamkeit &amp; Verbesserung" ab, ohne Probelauf-Kennzeichnung, denn er soll bleiben.</li>
          </ul></li>
        <li style="${li}"><b>Beim Start:</b> Der Probelauf lädt Führung und Selbsttest im Hintergrund nach,
          die Anwendung ist derweil schon bedienbar. Ein Klick auf „▶ Geführte Vorführung" oder „✓ Selbsttest"
          wartet, bis alles da ist.</li>
        <li style="${li}"><b>Nur für Freigeschaltete:</b> Administratoren immer, weitere Personen über
          <b>Einstellungen → Probelauf</b>. Grund: echte Einträge und echter Mailversand.</li>
      </ul>`,
      'ISO 27001 Klausel 7.2 (Kompetenz), 7.3 (Bewusstsein), 9.1 (Überwachung &amp; Messung).'),

    sec('glossar', 'Begriffe & Normbezug', 'all', `
      <ul style="${ol}">
        <li style="${li}"><b>Kenntnisnahme:</b> Bestätigung, dass eine Regelwerk gelesen und verstanden wurde.</li>
        <li style="${li}"><b>Konformitätsprüfung:</b> fachliche Prüfung, ob eine Regelwerk den Vorgaben (ISO 27001 / NIS2) entspricht.</li>
        <li style="${li}"><b>Freigabe:</b> Genehmigung durch die Geschäftsleitung → Veröffentlichung.</li>
        <li style="${li}"><b>Normbezug:</b> Zuordnung einer Regelwerk zu ISO-27001-/NIS2-Controls (Grundlage der Abdeckungs-Heatmap).</li>
        <li style="${li}"><b>ISO/IEC 27001:2022:</b> Norm für Informationssicherheits-Managementsysteme (Klauseln 4–10 + Annex A mit 93 Controls in A.5–A.8).</li>
        <li style="${li}"><b>NIS2 (EU 2022/2555):</b> EU-Regelwerk zur Cybersicherheit – u. a. Governance (Art. 20), Risikomaßnahmen (Art. 21), Meldepflichten (Art. 23).</li>
        <li style="${li}"><b>Wiedervorlage / Review:</b> Termin der nächsten internen Überprüfung einer Regelwerk (A.5.1).</li>
      </ul>`),

    sec('faq', 'Häufige Fragen & Hilfe', 'all', `
      <ul style="${ol}">
        <li style="${li}"><b>Etwas wirkt nicht aktuell?</b> „↻ Aktualisieren" oben rechts.</li>
        <li style="${li}"><b>Eine Regelwerk ist nicht sichtbar?</b> Es ist evtl. noch nicht veröffentlicht oder Ihrer Rolle/Zielgruppe nicht zugeordnet.</li>
        <li style="${li}"><b>„Fehlende Spalten"-Warnung (Admin)?</b> In der SharePoint-Liste „Richtlinien" (technischer Listenname) fehlt eine Spalte (z. B. NormbezugJson, PruefKonfigJson, FreigabeKonfigJson). Anlegen als „Mehrere Zeilen Text", danach „↻ Aktualisieren".</li>
        <li style="${li}"><b>Bearbeiten schlägt fehl?</b> Das Bearbeiten von IMS-Dokumenten setzt SharePoint-Schreibrechte auf der ISMS-Site voraus (Anzeige geht trotzdem).</li>
        <li style="${li}"><b>Fehler bleibt bestehen?</b> Seite neu laden; sonst an IT/Compliance wenden.</li>
      </ul>`),
  ].join('');
}

function dokumentationHtml() {
  const toc = _DOKU_TOC.map(([id, t], i) =>
    `<a href="#doku-${id}" class="doku-toc-link" onclick="event.preventDefault();dokuGoto(${jsArg(id)})">${i + 1} · ${t}</a>`).join('');

  return `
  <style>
    .doku-wrap{max-width:1040px}
    .doku-grid{display:grid;grid-template-columns:230px 1fr;gap:30px;align-items:start}
    .doku-toc{position:sticky;top:12px;border:1px solid var(--c-border);border-radius:14px;padding:14px;background:var(--c-surface);font-size:.82rem;max-height:calc(100vh - 40px);overflow:auto}
    .doku-toc-title{font-weight:800;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--c-muted);margin:0 0 8px}
    .doku-toc-link{display:block;padding:5px 8px;border-radius:7px;color:var(--c-text);text-decoration:none;line-height:1.35}
    .doku-toc-link:hover{background:var(--c-bg,#eef2ff);color:var(--c-primary)}
    .doku-sec{background:var(--c-surface);border:1px solid var(--c-border);border-radius:14px;padding:18px 22px;margin:0 0 16px;scroll-margin-top:16px}
    .doku-h2{margin:0 0 6px;font-size:1.12rem;font-weight:800;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .doku-norm{margin-top:12px;font-size:.8rem;color:var(--c-muted);border-top:1px dashed var(--c-border);padding-top:8px}
    .doku-tbl{width:100%;border-collapse:collapse;margin:8px 0 2px;font-size:.86rem}
    .doku-tbl td{border:1px solid var(--c-border);padding:6px 10px;vertical-align:top;line-height:1.5}
    .doku-tbl tr td:first-child{width:210px;color:var(--c-text)}
    @media (max-width:900px){ .doku-grid{grid-template-columns:1fr} .doku-toc{position:static;max-height:none;margin-bottom:8px} .doku-tbl tr td:first-child{width:auto} }
  </style>
  <div class="doku-wrap">
    <div class="view-header" style="margin-bottom:16px">
      <h2 style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">Dokumentation &amp; Benutzerhandbuch
        <button class="btn btn-outline btn-sm" onclick="dokuPrint()" title="Als PDF drucken">🖨 Drucken / PDF</button>
      </h2>
      <p class="view-desc">Vollständige Anleitung zum Regelwerk-Management – von der Kenntnisnahme bis zu Konformitätsprüfung, Freigabe, IMS-Abdeckung und Fälligkeiten. Welche Abschnitte für Sie relevant sind, zeigen die farbigen Rollen-Marker. Kurzfassung: Reiter <a href="#" onclick="event.preventDefault();switchView('anleitung')" style="color:var(--c-primary);font-weight:600">„Anleitung"</a>.</p>
    </div>
    <div class="doku-grid">
      <nav class="doku-toc">
        <div class="doku-toc-title">Inhalt</div>
        ${toc}
      </nav>
      <div class="doku-body">
        ${_dokuSections()}
        <div style="text-align:center;color:var(--c-faint);font-size:.8rem;margin:6px 0 8px">Stand: 2026 · DIHAG Regelwerk-Management</div>
      </div>
    </div>
  </div>`;
}

/** Zu einem Abschnitt scrollen (Fenster scrollt, nicht der Mount). */
function dokuGoto(id) {
  const el = document.getElementById('doku-' + id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Handbuch als eigenständige Druck-/PDF-Ansicht öffnen. */
function dokuPrint() {
  const sections = _dokuSections();
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>Benutzerhandbuch – DIHAG Regelwerk-Management</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:28px;font-size:13px;line-height:1.5;max-width:820px}
      h1{font-size:20px;margin:0 0 4px} .doku-h2{font-size:15px;font-weight:800;margin:0 0 6px;border-bottom:2px solid #111827;padding-bottom:3px}
      .doku-sec{border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin:0 0 14px;page-break-inside:avoid}
      .doku-norm{margin-top:10px;font-size:11.5px;color:#6b7280;border-top:1px dashed #d1d5db;padding-top:7px}
      .doku-tbl{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
      .doku-tbl td{border:1px solid #d1d5db;padding:5px 9px;vertical-align:top}
      .doku-tbl tr td:first-child{width:210px;font-weight:600}
      a{color:#17509e} ul,ol{margin:8px 0 0} :root{--c-muted:#6b7280;--c-primary:#17509e;--c-text:#111827;--c-bg:#f8fafc;--c-surface:#fff;--c-border:#e5e7eb;--c-faint:#9ca3af}
      .noprint{margin-bottom:14px}@media print{.noprint{display:none}thead{display:table-header-group}tr,h1,h2,h3{break-inside:avoid;page-break-inside:avoid}h1,h2,h3{break-after:avoid;page-break-after:avoid}}
    </style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    ${druckKopf()}
    <h1>Benutzerhandbuch – DIHAG Regelwerk-Management</h1>
    <p style="color:#6b7280;margin:0 0 16px">Stand 2026 · vollständige Bedienungsanleitung</p>
    ${sections}
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Pop-up-Blocker? Bitte Pop-ups erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
