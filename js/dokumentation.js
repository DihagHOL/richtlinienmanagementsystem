/* ═══════════════════════════════════════════════════
   Dokumentation – vollständiges Benutzerhandbuch (für alle sichtbar)
   Rein statische Inhalte; rendert in #doku-mount. Ergänzt die kurze
   „Anleitung" um alle Funktionen inkl. Health-Check, ISMS-Abdeckung,
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
  ['erinnerungen',  'Erinnerungen & Eskalation'],
  ['vorschlag',     'Änderung vorschlagen'],
  ['ki',            'KI-Systeme beantragen'],
  ['cockpit',       'Cockpit (Admin-Startseite)'],
  ['verwalten',     'Regelwerke anlegen & verwalten'],
  ['konzepte',      'Regelwerk-Konzepte'],
  ['freigabe',      'Konformitätsprüfung & Freigabe'],
  ['health',        'Dokument-Health-Check'],
  ['abdeckung',     'ISMS-Abdeckung & SoA'],
  ['faelligkeit',   'Fälligkeiten / Wiedervorlage'],
  ['risiken',       'Risiko-Register'],
  ['ismsdocs',      'IMS-Dokumente (alle Normen)'],
  ['governance',    'Governance-Board (Legal-Entwürfe)'],
  ['govstruktur',   'Governance-Struktur (Matrix)'],
  ['prozesse',      'Prozesse (BPMN 2.0)'],
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
        <li style="${li}"><b>Was sichtbar ist, hängt von der Rolle ab:</b> Alle sehen „Meine Regelwerke", „Anleitung/Dokumentation" und das KI-Dashboard. Verwaltungs-, Freigabe- und Auswertungs-Reiter erscheinen nur für berechtigte Personen.</li>
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
        ['Administration', 'Regelwerke &amp; IMS-Dokumente verwalten, Health-Check, ISMS-Abdeckung, Fälligkeiten, Compliance-Auswertung, Einstellungen.'],
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
      <div style="${hint}">🎬 <b>Für die Administration:</b> Im Regelwerk-Editor unter <b>„🎬 Lernvideos"</b> Titel und Adresse eintragen. Am einfachsten in Stream/SharePoint auf <b>Teilen → Einbetten</b> klicken und den Code einfügen – die App holt sich die Adresse heraus und zeigt sofort an, ob abgespielt oder verlinkt wird. Fragen und Bestehensgrenze stehen im selben Editor unter <b>„Wissenstest"</b> (mindestens zwei Antwortoptionen je Frage, genau eine richtige).</div>`,
      'ISO 27001 Klausel 7.2 (Kompetenz), 7.3 (Bewusstsein), A.6.3 (Schulung &amp; Sensibilisierung); NIS2 Art. 21(2g).'),

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
        <li style="${li}"><b>ISMS-Abdeckung</b> (Annex-A-/NIS2-Quote) · <b>SoA</b> (entschieden, ausgeschlossen, umgesetzt, fehlende Begründungen) · <b>Risiko-Register</b> (offen, hoch, überfällige Maßnahmen).</li>
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
        <li style="${li}"><b>Normbezug</b> (eingeklappt, für jedes Regelwerk verfügbar): welche Controls/Artikel aus ISO 27001 bzw. NIS2 das Regelwerk abdeckt; „↩ Aus Review übernehmen" befüllt bekannte Zuordnungen (siehe „ISMS-Abdeckung").</li>
        <li style="${li}"><b>Freigabe-Workflow</b> (ausklappbare Abschnitte): eigene <b>Prüfer</b> bzw. <b>Freigeber</b> nur für dieses Regelwerk (leer = globale Einstellung) und die <b>Mitbestimmung</b> (KBR / Betriebsräte je Werk). Die Reihenfolge von <b>Freigabe</b> und <b>Mitbestimmung</b> lässt sich mit ▲▼ pro Regelwerk tauschen.</li>
        <li style="${li}"><b>Änderungshistorie</b> – ausklappbar, schreibgeschützt: wer wann was geändert oder entschieden hat (siehe unten).</li>
      </ul>
      <div style="${hint}">🔒 <b>Pro-Regelwerk-Prüfer/-Freigeber ersetzen</b> die globalen für genau dieses Regelwerk (nicht additiv). Karten-Tags „👤 eigene Prüfer" / „👤 eigene Freigeber" zeigen an, wo das gesetzt ist.</div>
      <div style="${h3}">Änderungshistorie (Nachweis)</div>
      <p style="margin:0 0 8px;line-height:1.55">Jede Änderung wird automatisch mit <b>Zeitpunkt, Person und Inhalt</b> festgehalten – inhaltliche Bearbeitungen im Klartext (z. B. <i>Version: „1.0" → „2.0"</i>), dazu Einreichen, Prüf- und Mitbestimmungsentscheidungen samt Begründung, Freigaben, Veröffentlichung und Archivierung. Die jüngsten 200 Einträge bleiben erhalten.</p>
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

    sec('abdeckung', 'ISMS-Abdeckung & SoA', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„ISMS-Abdeckung"</b> zeigt als Heatmap, welche ISO-27001-/NIS2-Controls durch mindestens eine Regelwerk abgedeckt sind.</p>
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
        <li style="${li}">Gruppen: <b>überfällig</b> · <b>fällig in ≤ 30 Tagen</b> · <b>später terminiert</b> · <b>ohne Termin</b>, mit Kennzahl-Kacheln.</li>
        <li style="${li}"><b>„🔁 +12 Monate"</b> setzt den nächsten Überprüfungstermin sofort auf heute + 12 Monate.</li>
        <li style="${li}"><b>„✏ Bearbeiten"</b> öffnet das Regelwerk im Editor (z. B. um den Termin frei zu wählen).</li>
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

    sec('prozesse', 'Prozesse (BPMN 2.0)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Prozesse"</b>: Abläufe als <b>BPMN 2.0</b> im Camunda-Stil selbst modellieren und <b>mit Regelwerken verknüpfen</b> („im Einklang mit den Regelwerken"). Gespeichert als <b>.bpmn</b>-Datei im Ordner „Prozesse" der ISMS-Bibliothek.</p>
      <p style="margin:0 0 8px;line-height:1.55">Der Reiter hat drei Ansichten: <b>🗺 Landkarte</b> (der Einstieg), <b>🕸 Verknüpfungen</b> (wer hängt woran) und <b>📋 Modelle</b> (alle BPMN-Dateien als Liste).</p>
      <div style="${h3}">🗺 Prozesslandkarte</div>
      <p style="margin:0 0 8px;line-height:1.55">Die Prozesslandschaft als Zeilen: je Bereich eine Zeile mit farbiger Titelspalte, <b>Kernprozesse</b> als Pfeile. Jede Kachel ist anklickbar.</p>
      <p style="margin:0 0 8px;line-height:1.55"><b>Jedes Werk führt seine eigene Landkarte</b>, dazu gibt es die Ebene <b>Konzern / Holding</b>. Oben links wird gewählt, welche Karte offen ist. Ein Werk ohne Karte kann bei null anfangen oder <b>die Struktur eines anderen Werks übernehmen</b> und dort anpassen, wo es abweicht – der Geltungsbereich wird dabei auf das eigene Werk gesetzt, die Quelle bleibt unverändert.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Ein Klick auf eine Kachel</b> zeigt den Geltungsbereich, das hinterlegte <b>BPMN-Modell</b> und die Regelwerke, die daran hängen. Von dort geht es direkt in den Modeler oder in das Regelwerk.</li>
        <li style="${li}"><b>Mehrere Modelle je Prozess:</b> Ein Prozess besteht oft aus mehreren Abläufen – Angebot, Auftrag und Reklamation gehören alle zum Vertrieb. „+ Modell anlegen" und „+ Vorhandenes verknüpfen" hängen beliebig viele an dieselbe Kachel; ein <b>grüner Punkt</b> zeigt, dass eines hinterlegt ist, die <b>Zahl daneben</b> wie viele. Ein neu angelegtes Modell bekommt automatisch einen freien Dateinamen („Vertrieb 2"), sonst überschriebe es das erste.</li>
        <li style="${li}"><b>Regelwerke auch ohne Modell:</b> Über <b>„Regelwerke zuordnen"</b> hängen Regelwerke direkt an der Kachel – für die vielen Prozesse, die (noch) kein BPMN-Diagramm haben. Was über ein Modell verknüpft ist, steht weiterhin dort und wird zusätzlich angezeigt, mit Angabe des Modells.</li>
        <li style="${li}"><b>Die geführte Vorführung ist zugleich das Lernvideo:</b> Jeder Schritt nennt in <b>einem Satz</b>, worum es geht – von der Begrüßung über Konzept, Prüfung, Mitbestimmung und Freigabe bis zu „Was das für Sie heißt". Erklärt wird gesprochen, nicht gelesen: Die Sprechblase bleibt kurz genug, dass niemand mitliest statt zuzuhören. Was zu klicken ist, steht klein darunter im <b>Hinweis</b>.</li>
        <li style="${li}"><b>Vorlagen für eine neue Landkarte:</b> <b>„📋 Vorlage"</b> setzt eine fertige Prozesslandschaft ein – für die <b>Konzernebene</b> die sechs Bereiche einer Führungsholding (Strategie, Finanzen, Risiko &amp; Compliance, Synergien, Kommunikation, Transformation mit je drei Hauptaufgaben), für eine <b>Gesellschaft</b> die Führungs-, Kern- und Unterstützungsprozesse. Der Geltungsbereich wird passend gesetzt, Modelle und Regelwerke bleiben leer – die Vorlage bringt Struktur, keine erfundenen Verknüpfungen.</li>
        <li style="${li}"><b>Beliebig viele Bereiche:</b> Die Landkarte zeichnet jedes Band als eigene Zeile mit farbiger Titelspalte – drei wie im Werk oder sechs wie im Konzern. Kernprozesse behalten ihre Pfeilform.</li>
        <li style="${li}"><b>🌳 Übersicht (Baum):</b> Die Mindmap zeigt die Landschaft als Baum – Wurzel links, Äste nach rechts: <b>Werk → Band → Prozess → Modell → Regelwerk</b>. Ein Klick klappt einen Zweig auf oder zu, die Zahl am Knoten sagt, wie viel zugeklappt darunter liegt. Über <b>Wurzel</b> lässt sich zwischen einem Werk und dem Konzern (dann sind die Werke die erste Ebene) wechseln; <b>⤢ Alles</b>, <b>⤡ Zu</b> und der Zoom helfen bei großen Bäumen.</li>
        <li style="${li}"><b>Direkt im Baum anlegen:</b> Das <b>+</b> am Knoten legt an, was an dieser Stelle passt – am Band oder Werk einen <b>Prozess</b> (Band schon vorbelegt), am Prozess ein <b>Modell</b> oder eine <b>Regelwerks-Zuordnung</b>, am Modell die <b>Regelwerke</b>. Bei Lesezugriff erscheint es gar nicht erst.</li>
        <li style="${li}"><b>🎯 Nahsicht:</b> Die bisherige Ansicht bleibt als zweiter Schalter – nur sie zeigt auch die querlaufenden Bezüge („gilt für"), die in einem Baum keinen Platz haben.</li>
        <li style="${li}"><b>Prozessverantwortliche:</b> Jede Kachel trägt eine <b>verantwortliche Person</b> (und optional eine Vertretung) – die Frage, die in jedem Audit zuerst kommt. Sie steht beim Öffnen der Kachel, in der Mindmap als eigene Lücke („Prozesse ohne Verantwortlichen") und vollständig in der Matrix.</li>
        <li style="${li}"><b>👤 Matrix – wer ist wofür zuständig:</b> Prozesse als Zeilen, Werke als Spalten. Das Blatt <b>Zuständigkeiten</b> zeigt je Werk die verantwortliche Person („—" = niemand gepflegt, „·" = dieses Werk führt den Prozess nicht), das Blatt <b>Abdeckung</b> mit <b>V</b>/<b>M</b>/<b>R</b>, ob Verantwortliche(r), BPMN-Modell und Regelwerk vorhanden sind. Filter nach Band und „nur Lücken"; Ausgabe als <b>CSV</b> für Excel oder als <b>Druckfassung</b>.</li>
        <li style="${li}"><b>Diagramm als Bild:</b> Im Modeler liefert <b>„⬇ Bild"</b> das Diagramm als SVG – direkt in Word, PowerPoint oder ein Regelwerk einfügbar. Mit einer .bpmn-Datei kann außerhalb des Modelers niemand etwas anfangen.</li>
        <li style="${li}"><b>Link auf einen Prozess:</b> <b>„🔗 Link"</b> in der Kachel kopiert einen dauerhaften Link (<code>?prozess=WERK:KACHEL</code>) – für Mails, Regelwerke und Schulungen. Er öffnet die richtige Landkarte und die richtige Kachel.</li>
        <li style="${li}"><b>Abgleich Kachel ↔ Modell:</b> Ein Regelwerk kann an der Kachel hängen und zusätzlich im BPMN-Marker stehen. Laufen beide auseinander, zeigt die Mindmap das im Kasten „An der Kachel, aber nicht im Modell" – mit einem Knopf, der die fehlende Zuordnung ins Modell schreibt.</li>
        <li style="${li}"><b>Jedes Werk hat seinen eigenen Ordner:</b> Ein Modell wird unter <b>Prozesse/&lt;Werk&gt;</b> in der ISMS-Bibliothek abgelegt – „Vertrieb" in HOL und „Vertrieb" in SHB sind damit zwei Dateien und nicht eine. In der Modell-Liste steht jedes Werk als eigener Block; im Modell selbst lässt sich die <b>Ablage</b> wechseln, die Datei zieht dann um. Modelle aus früheren Ständen liegen noch direkt im Ordner „Prozesse" – <b>„🗂 Ablage aufräumen"</b> sortiert alle ein, die eindeutig zu einem Werk gehören. Dabei bleibt die Kennung der Datei erhalten, es reißt also keine Verknüpfung.</li>
        <li style="${li}"><b>Suche über alle Werke:</b> Das Suchfeld oben findet einen Prozess in <b>jeder</b> Landkarte, nicht nur in der offenen. Ein Klick auf den Treffer wechselt die Karte und öffnet die Kachel.</li>
        <li style="${li}"><b>Geltungsbereich je Prozess</b> – dieselben Standorte wie bei den Regelwerken. Über die Auswahl <b>Standort</b> oben lässt sich fragen: „Welche Prozesse gelten in SHB?" Was dort nicht gilt, wird <b>ausgegraut</b> statt ausgeblendet – so bleibt die Landschaft vergleichbar.</li>
        <li style="${li}"><b>Bearbeiten:</b> „+ Prozess" legt eine Kachel an, ein Klick auf „Bearbeiten" ändert Name, Untertitel, Band und Geltungsbereich. Kacheln lassen sich <b>zwischen den Bändern ziehen</b>. Jede Änderung steht mit Person und Zeitpunkt im <b>Versionsverlauf</b> (Knopf oben).</li>
        <li style="${li}">Die Karte liegt als <b>prozesslandkarte.json</b> im Konfigurations-Ordner – wie die Governance-Struktur. Keine zusätzliche SharePoint-Liste, keine neue Spalte.</li>
      </ul>
      <ul style="${ol}">
        <li style="${li}"><b>+ Neuer Prozess</b> – leeres Diagramm im Modeler (Elemente aus der Palette ziehen).</li>
        <li style="${li}"><b>📋 Standard-Prozesse</b> – legt die <b>im RMS gelebten Abläufe</b> auf einen Schlag als BPMN-Entwürfe an (siehe unten).</li>
        <li style="${li}"><b>⬆ Importieren</b> – eine vorhandene <b>.bpmn/.xml</b>-Datei einlesen und weiterbearbeiten.</li>
        <li style="${li}"><b>✨ Aus Regelwerk</b> – erzeugt einen echten Prozessentwurf per <b>Texterkennung</b> aus dem verknüpften Word-Dokument des Regelwerks.</li>
        <li style="${li}">Je Prozess wählbar, welche <b>Regelwerke</b> er umsetzt; die Verknüpfung wird in der BPMN-Datei mitgespeichert und auf den Karten angezeigt.</li>
      </ul>
      <div style="${h3}">🕸 Verknüpfungen</div>
      <p style="margin:0 0 8px;line-height:1.55">Wer hängt woran? <b>Prozess ↔ Modell ↔ Regelwerk ↔ Standort</b> als Mindmap: In der Mitte steht ein Objekt, ringsum stehen seine Beziehungen – nach Art beschriftet („modelliert in", „setzt um", „gilt für"). Ein <b>Klick auf einen Nachbarn</b> rückt diesen in die Mitte, <b>← Zurück</b> führt den Weg zurück. Über die Auswahl <b>„In die Mitte"</b> springt man direkt zu einem beliebigen Objekt.</p>
      <ul style="${ol}">
        <li style="${li}">Zeigt das Bild höchstens <b>zwölf</b> Nachbarn – mehr wären auf einem Kreis nicht mehr lesbar. <b>Vollständig</b> stehen alle darunter als anklickbare Chips, nach Beziehungsart gruppiert.</li>
        <li style="${li}"><b>Die Lücken</b> darunter sind der eigentliche Nutzen: <b>Prozesse ohne Modell</b>, <b>Modelle ohne Regelwerk</b>, <b>veröffentlichte Regelwerke ohne Prozess</b> und <b>Prozesse ohne Geltungsbereich</b>. Jeder Eintrag führt mit einem Klick dorthin, wo sich die Lücke schließen lässt.</li>
        <li style="${li}"><b>Über alle Werke hinweg:</b> Unter dem Konzern hängen die Werke mit eigener Landkarte, darunter deren Bänder und Prozesse. Werk und Standort sind derselbe Knoten – ein Werk zeigt also sowohl seine Landkarte als auch alles, was dort gilt.</li>
        <li style="${li}"><b>Verknüpfen direkt hier:</b> Steht ein <b>Prozess</b> in der Mitte, führt ein Knopf zum Modell (oder in die Landkarte, um eines anzulegen). Bei einem <b>Modell</b> lassen sich mit <b>„Regelwerke zuordnen"</b> die umgesetzten Regelwerke ankreuzen – ohne den Modeler zu öffnen. Bei einem <b>Regelwerk</b> geht es umgekehrt: <b>„Mit einem Modell verknüpfen"</b>.</li>
        <li style="${li}">Die Ansicht liest beim Öffnen alle Modelle einmal ein (dafür der kurze Ladehinweis) und legt <b>keine eigenen Daten</b> an. Zuordnungen schreibt sie dorthin, wo sie hingehören: in die <b>BPMN-Datei</b> – dieselbe Stelle, die auch der Prozess-Editor beschreibt.</li>
      </ul>
      <div style="${h3}">📋 Standard-Prozesse</div>
      <p style="margin:0 0 8px;line-height:1.55">Ein Klick legt die <b>13 dokumentierten RMS-Abläufe</b> als BPMN-Entwürfe an: Regelwerk-Lebenszyklus und -Allgemein, Regelwerk-Konzept, Kenntnisnahme &amp; Wissenstest, Änderungsvorschlag, Risiko-Management, KI-Antrag, Dokument-Health-Check, ISMS-Abdeckung &amp; SoA, Fälligkeit/Wiedervorlage, Governance-Übernahme, Audit-Report sowie Außerkraftsetzung/Archivierung.</p>
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
        <li style="${li}"><b>Reiter-Berechtigungen (Lesen/Schreiben):</b> eigener Bereich in den Einstellungen (Umschalter oben). Eine Zeile je <b>Person</b> oder <b>Gruppe</b>, eine Spalte je Reiter: <b>–</b> kein Zugriff, <b>L</b> Lesen, <b>S</b> Schreiben. Zelle anklicken schaltet weiter, Zeile aufklappen zeigt alle Reiter mit Beschriftung. Suche und Reiter-Filter für den Überblick. <b>Additiv</b> zu den Standardrechten, Admins haben immer Zugriff; „Nur Lesen" = Reiter sichtbar, aber Anlegen/Bearbeiten gesperrt; „Schreiben" schließt Lesen ein. „Einstellungen" bleibt Admins vorbehalten.</li>
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
          Streifen löscht genau diese wieder – nichts anderes. Versendete E-Mails bleiben naturgemäß.</li>
        <li style="${li}"><b>Geführte Vorführung:</b> hebt Schritt für Schritt das nächste Bedienelement
          hervor und wartet, bis der Schritt <i>wirklich</i> ausgeführt wurde. „Vormachen" erledigt einen
          Schritt automatisch – praktisch, wenn es in einer Präsentation schnell gehen muss.</li>
        <li style="${li}"><b>Selbsttest:</b> spielt Konzept → Entwurf → Konformitätsprüfung → Mitbestimmung →
          Freigabe → Kenntnisnahme → Historie in einem Zug durch und zeigt einen Bericht mit allen
          Prüfpunkten. Sinnvoll nach jeder Aktualisierung.</li>
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
    `<a href="#doku-${id}" class="doku-toc-link" onclick="event.preventDefault();dokuGoto('${id}')">${i + 1} · ${t}</a>`).join('');

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
      <p class="view-desc">Vollständige Anleitung zum Regelwerk-Management – von der Kenntnisnahme bis zu Konformitätsprüfung, Freigabe, ISMS-Abdeckung und Fälligkeiten. Welche Abschnitte für Sie relevant sind, zeigen die farbigen Rollen-Marker. Kurzfassung: Reiter <a href="#" onclick="event.preventDefault();switchView('anleitung')" style="color:var(--c-primary);font-weight:600">„Anleitung"</a>.</p>
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
    <h1>Benutzerhandbuch – DIHAG Regelwerk-Management</h1>
    <p style="color:#6b7280;margin:0 0 16px">Stand 2026 · vollständige Bedienungsanleitung</p>
    ${sections}
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Pop-up-Blocker? Bitte Pop-ups erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
