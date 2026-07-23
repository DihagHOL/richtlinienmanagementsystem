/* ═══════════════════════════════════════════════════
   Dokumentation – vollständiges Benutzerhandbuch (für alle sichtbar)
   Rein statische Inhalte; rendert in #doku-mount. Ergänzt die kurze
   „Anleitung" um alle Funktionen inkl. Health-Check, ISMS-Abdeckung,
   Fälligkeiten, pro-Richtlinie-Prüfer/Freigeber und Export.
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
  ['lesen',         'Richtlinien lesen & bestätigen'],
  ['vorschlag',     'Änderung vorschlagen'],
  ['kurse',         'Kurse'],
  ['ki',            'KI-Systeme beantragen'],
  ['cockpit',       'Cockpit (Admin-Startseite)'],
  ['verwalten',     'Richtlinien anlegen & verwalten'],
  ['freigabe',      'Konformitätsprüfung & Freigabe'],
  ['health',        'Dokument-Health-Check'],
  ['abdeckung',     'ISMS-Abdeckung & SoA'],
  ['faelligkeit',   'Fälligkeiten / Wiedervorlage'],
  ['risiken',       'Risiko-Register'],
  ['ismsdocs',      'ISMS-Dokumente (ISO 27001)'],
  ['governance',    'Governance-Board (Legal-Entwürfe)'],
  ['prozesse',      'Prozesse (BPMN 2.0)'],
  ['vorschlaege',   'Vorschläge bearbeiten'],
  ['compliance',    'Audit Report'],
  ['einstellungen', 'Einstellungen'],
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
        <li style="${li}"><b>Aufruf:</b> <a href="https://richtlinienmanagement.dihag-extern.com/" style="color:var(--c-primary);font-weight:600">richtlinienmanagement.dihag-extern.com</a> im Browser.</li>
        <li style="${li}"><b>Anmeldung:</b> mit dem gewohnten DIHAG-Microsoft-Konto (Single Sign-On). Einmal anmelden genügt – das KI-Dashboard nutzt dieselbe Anmeldung.</li>
        <li style="${li}"><b>Navigation:</b> linke Leiste. Am Handy über das Menü-Symbol (☰) oben links ein-/ausblenden.</li>
        <li style="${li}"><b>Was du siehst, hängt von deiner Rolle ab:</b> Alle sehen „Meine Richtlinien", „Kurse", „Anleitung/Dokumentation" und das KI-Dashboard. Verwaltungs-, Freigabe- und Auswertungs-Reiter erscheinen nur für berechtigte Personen.</li>
        <li style="${li}"><b>„↻ Aktualisieren"</b> (oben rechts) lädt frische Daten, falls etwas nicht aktuell wirkt.</li>
      </ul>
      <div style="${hint}">💡 Diese Dokumentation ist die Langfassung. Für den 3-Minuten-Schnellstart gibt es den Reiter <b>„Anleitung"</b>.</div>`),

    sec('rollen', 'Rollen im System', 'all', `
      <p style="margin:0 0 8px;line-height:1.55">Was jemand sieht und darf, ergibt sich aus seiner Rolle. Rollen werden von der Administration unter <b>„Einstellungen"</b> gepflegt (E-Mail-Adressen je Rolle).</p>
      ${tbl([
        ['Mitarbeitende', 'Richtlinien lesen &amp; bestätigen, Wissenstest, Änderungen vorschlagen, KI-Systeme beantragen. Jede angemeldete Person.'],
        ['Konformitätsprüfer', 'Prüfen Richtlinien fachlich auf Konformität (ISO 27001 / NIS2) und markieren „konform / nicht konform". Global oder pro Richtlinie hinterlegbar.'],
        ['Geschäftsleitung', 'Gibt die geprüften Richtlinien frei → Veröffentlichung. Global oder pro Richtlinie hinterlegbar.'],
        ['Genehmiger', 'App-interne Freigabeberechtigung (wie GL); sieht den Reiter „Freigaben".'],
        ['Administration', 'Richtlinien &amp; ISMS-Dokumente verwalten, Health-Check, ISMS-Abdeckung, Fälligkeiten, Compliance-Auswertung, Einstellungen.'],
        ['ISMS-Verantwortliche / Vorschlags-Empfänger', 'Erhalten und bearbeiten die Änderungsvorschläge (Reiter „Vorschläge").'],
        ['KI-Gremium', 'Entscheidet über KI-Anträge im KI-Dashboard (leer = Genehmiger-Liste gilt).'],
      ])}`,
      'ISO 27001 Klausel 5.3 (Rollen, Verantwortlichkeiten &amp; Befugnisse), A.5.2 (Informationssicherheitsrollen); NIS2 Art. 20 (Verantwortung der Leitungsorgane).'),

    sec('lesen', 'Richtlinien lesen & bestätigen', 'all', `
      <ol style="${ol}">
        <li style="${li}">Reiter <b>„Meine Richtlinien"</b> öffnen – oben die Quote (zugewiesen / offen / abgeschlossen).</li>
        <li style="${li}">Eine Richtlinie anklicken → das Dokument wird angezeigt.</li>
        <li style="${li}"><b>Kenntnisnahme:</b> lesen, „Ich habe gelesen und verstanden" ankreuzen, <b>„Kenntnisnahme bestätigen"</b>. Das Häkchen wird erst nach kurzer Lesezeit bzw. nach „In SharePoint öffnen" aktiv.</li>
        <li style="${li}"><b>Wissenstest</b> (falls erforderlich): „Wissenstest starten" → Fragen beantworten. Nicht bestanden? Einfach erneut versuchen.</li>
        <li style="${li}"><b>Teilnahmenachweis</b> kann per Mail an dich selbst gesendet werden.</li>
      </ol>
      <div style="${hint}">ℹ️ Manche Richtlinien müssen <b>regelmäßig</b> erneut bestätigt werden (z. B. jährlich) und erscheinen dann automatisch wieder als „offen". Auch eine <b>neue Version</b> setzt die Bestätigung zurück.</div>`,
      'ISO 27001 Klausel 7.3 (Bewusstsein), A.6.3 (Informationssicherheitsbewusstsein &amp; -schulung), A.5.1 (Richtlinien); NIS2 Art. 21(2g) (Cyberhygiene &amp; Schulung).'),

    sec('vorschlag', 'Änderung vorschlagen', 'all', `
      <p style="margin:0;line-height:1.55">Fehler oder Verbesserung entdeckt? In der geöffneten Richtlinie oben rechts auf <b>„✏️ Änderung vorschlagen"</b>, kurz <b>was</b> und <b>warum</b> beschreiben, absenden.</p>
      <ul style="${ol}">
        <li style="${li}">Der Vorschlag enthält einen <b>Direktlink zum Dokument</b> und geht per Mail an die Verantwortlichen; du erhältst eine <b>Kopie</b>.</li>
        <li style="${li}">Unter <b>„Weitere Empfänger"</b> lassen sich zusätzliche interne Adressen ergänzen.</li>
        <li style="${li}">Alle Vorschläge landen im Reiter <b>„Vorschläge"</b> zur Nachverfolgung.</li>
      </ul>`),

    sec('kurse', 'Kurse', 'all', `
      <p style="margin:0;line-height:1.55">Unter <b>„Kurse"</b> (Beta) sind mehrere Richtlinien zu Lernpaketen gebündelt – nacheinander lesen und bestätigen. Optional.</p>`),

    sec('ki', 'KI-Systeme beantragen (KI-Dashboard)', 'all', `
      <p style="margin:0 0 8px;line-height:1.55">Über <b>„KI-Dashboard"</b> (linke Leiste) in den KI-Governance-Bereich. Jede:r kann einen Antrag stellen, wenn ein neues KI-System eingesetzt werden soll.</p>
      <ol style="${ol}">
        <li style="${li}"><b>„Neuer Antrag"</b> → Formular gemäß KI-Richtlinie (CO-10-01) ausfüllen (Richtlinie & Verhaltenskodex sind oben verlinkt).</li>
        <li style="${li}">Absenden → das KI-Koordinierungsgremium wird automatisch informiert.</li>
        <li style="${li}">Status jederzeit unter <b>„Anträge"</b>; auf Rückfragen des Gremiums direkt antworten.</li>
      </ol>`,
      'ISO 27001 Klausel 5.3 (Rollen &amp; Befugnisse); NIS2 Art. 20 (Governance). Intern: KI-Richtlinie CO-10-01.'),

    sec('cockpit', 'Cockpit (Admin-Startseite)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Der Reiter <b>„Cockpit"</b> ist die Startseite für Berechtigte: alle ISMS-Kennzahlen auf einen Blick, jede Kachel führt per Klick in den passenden Reiter.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Richtlinien</b> (aktiv/veröffentlicht/Entwürfe/im Workflow) · <b>Prüfung &amp; Freigabe</b> (inkl. Alter des ältesten Vorgangs) · <b>Fälligkeiten</b> (überfällig / ≤ 30 Tage).</li>
        <li style="${li}"><b>ISMS-Abdeckung</b> (Annex-A-/NIS2-Quote) · <b>SoA</b> (entschieden, ausgeschlossen, umgesetzt, fehlende Begründungen) · <b>Risiko-Register</b> (offen, hoch, überfällige Maßnahmen).</li>
        <li style="${li}"><b>Audit Report</b> (Erfüllungsquote, offene Kenntnisnahmen) · <b>Vorschläge</b> (offen / in Bearbeitung).</li>
      </ul>
      <div style="${hint}">💡 Schnelle Kennzahlen erscheinen sofort; aufwendigere (Compliance-Quote, SoA, Risiken) laden im Hintergrund nach und füllen ihre Kachel, sobald sie da sind.</div>`,
      'ISO 27001 Klausel 9.1 (Überwachung, Messung, Analyse &amp; Bewertung), 9.3 (Managementbewertung – Eingaben).'),

    sec('verwalten', 'Richtlinien anlegen & verwalten', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Richtlinien Dashboard"</b> → <b>„+ Neue Richtlinie"</b> oder bestehende anklicken. Mehrere Word-/PDF-Dateien lassen sich per <b>Import</b> gleichzeitig als Entwürfe anlegen.</p>
      <div style="${h3}">Der Editor im Überblick</div>
      <ul style="${ol}">
        <li style="${li}"><b>Titel, Beschreibung, Kategorie, Version</b> – neue Version ⇒ alle müssen erneut bestätigen.</li>
        <li style="${li}"><b>Dokument</b> aus der Bibliothek wählen oder hochladen (mit Zielordner-Wähler; Versionsverlauf bleibt erhalten). Ist bereits ein Dokument zugeordnet, stehen <b>„✏️ In Office bearbeiten"</b> (On-Premise Office) und <b>„🌐 Im Browser bearbeiten"</b> zur Verfügung – wie bei den ISMS-Dokumenten legt SharePoint beim Speichern automatisch eine neue Version an.</li>
        <li style="${li}"><b>Zielgruppe</b> – wer die Richtlinie sehen/bestätigen muss (Rollen/Abteilungen oder „für alle").</li>
        <li style="${li}"><b>Pflichtlektüre</b>, <b>Wissenstest</b> (Fragen + Bestehensquote), <b>Wiederholungspflicht</b>.</li>
        <li style="${li}"><b>Nächste Überprüfung (Review)</b> – interner Wiedervorlage-Termin (siehe „Fälligkeiten / Wiedervorlage").</li>
        <li style="${li}"><b>Normbezug</b> – erscheint nur bei Kategorie <b>„ISO 27001"</b> oder <b>„NIS2"</b>: welche Controls/Artikel die Richtlinie abdeckt; „↩ Aus Review übernehmen" befüllt bekannte Zuordnungen (siehe „ISMS-Abdeckung").</li>
        <li style="${li}"><b>Konformitätsprüfung – nur für diese Richtlinie</b> (optional): eigene Prüfer/Schwelle. Leer = globale Einstellung.</li>
        <li style="${li}"><b>Freigabe (Geschäftsleitung) – nur für diese Richtlinie</b> (optional): eigene Freigeber/Schwelle. Leer = globale Einstellung.</li>
      </ul>
      <div style="${hint}">🔒 <b>Pro-Richtlinie-Prüfer/-Freigeber ersetzen</b> die globalen für genau diese Richtlinie (nicht additiv). Karten-Tags „👤 eigene Prüfer" / „👤 eigene Freigeber" zeigen an, wo das gesetzt ist.</div>
      <div style="margin-top:10px;line-height:1.55"><b>„Zur Konformitätsprüfung"</b> startet den Freigabe-Workflow (siehe „Konformitätsprüfung &amp; Freigabe").</div>`,
      'ISO 27001 Klausel 7.5 (Dokumentierte Information), 5.2 (Politik), A.5.1 (Informationssicherheitsrichtlinien).'),

    sec('freigabe', 'Konformitätsprüfung & Freigabe', 'review', `
      <p style="margin:0 0 8px;line-height:1.5">Ablauf: <b>Entwurf → Konformitätsprüfung → Mitbestimmung (bei Betroffenheit) → Freigabe → Veröffentlicht.</b> Alles im Reiter <b>„Freigaben"</b>.</p>
      <p style="margin:0 0 8px;line-height:1.5">Oben umschaltbar: <b>👤 Mir zugewiesen</b> (nur Vorgänge, für die du zuständiger Prüfer/Freigeber bist – deine To-dos) oder <b>🗂 Alle Vorgänge</b> (Gesamtübersicht aller laufenden Freigaben). Standard ist „Mir zugewiesen", sobald es etwas für dich gibt.</p>
      <div style="${h3}">Die Status einer Richtlinie</div>
      ${tbl([
        ['Entwurf', 'In Bearbeitung durch die Administration; noch nicht im Prüf-/Freigabeprozess.'],
        ['Konformitätsprüfung', 'Bei den Prüfern zur fachlichen Konformitätsprüfung.'],
        ['Mitbestimmung (BR)', 'Konform – wird beim betroffenen Konzern-/Betriebsrat mitbestimmt (nur wenn im Editor als betroffen markiert). Nach Dokumentation geht es zur Freigabe.'],
        ['Freigabe', 'Konform – wartet auf die Freigabe der Geschäftsleitung.'],
        ['Veröffentlicht', 'Freigegeben und für die Zielgruppe sichtbar/zu bestätigen.'],
        ['Archiviert', 'Außer Kraft gesetzt; nicht mehr aktiv (nicht in Auswertungen).'],
      ])}
      <div style="${h3}">1 · Konformitätsprüfung (Prüfer)</div>
      <ul style="${ol}">
        <li style="${li}">Richtlinie öffnen, Dokument ansehen, dann <b>„Konform"</b> oder <b>„Nicht konform"</b>.</li>
        <li style="${li}">Bei <b>„nicht konform" ist eine Begründung Pflicht</b>. Die Richtlinie bleibt dann in Prüfung.</li>
        <li style="${li}"><b>„Konform", wenn …</b> alle Prüfer zustimmen <i>oder</i> eine Person reicht – je nach (globaler oder pro-Richtlinie-)Schwelle. Ist die Schwelle erreicht, geht es automatisch zur Freigabe.</li>
      </ul>
      <div style="${h3}">2 · Freigabe (Geschäftsleitung)</div>
      <ul style="${ol}">
        <li style="${li}"><b>„Freigeben"</b> (optional mit Kommentar) → die Richtlinie wird veröffentlicht.</li>
        <li style="${li}">Kommentare/Voten erscheinen im Verlauf der Karte.</li>
      </ul>
      <div style="${h3}">Direkt aus der E-Mail entscheiden</div>
      <ul style="${ol}">
        <li style="${li}"><b>App-Mails (Standard):</b> Prüf- und Freigabe-Mails enthalten Buttons <b>„✓ Konform / ✗ Nicht konform"</b> bzw. <b>„✓ Freigeben / ✗ Zurück"</b>. Ein Klick öffnet die Richtlinie in der App und führt die Entscheidung nach kurzer Rückfrage aus.</li>
        <li style="${li}"><b>Power Automate (ohne Portal):</b> Alternativ läuft die Genehmigung als <b>actionable Outlook-Mail</b> – Genehmigen/Ablehnen wird <b>direkt in der Mail</b> geklickt, ganz ohne die App zu öffnen. In den Einstellungen je Etappe wählbar: <b>aus</b> · <b>nur Freigabe (Geschäftsleitung)</b> · <b>Prüfung + Freigabe</b>. Für die per Power Automate gesteuerte Etappe verschickt die App keine eigene Mail. In Outlook getroffene Freigaben erscheinen im <b>Audit Report</b> als eigenes Ereignis.</li>
      </ul>
      <div style="${h3}">Beispiel – eine neue Richtlinie von A bis Z</div>
      <div style="background:var(--c-bg,#f8fafc);border:1px solid var(--c-border,#e5e7eb);border-radius:10px;padding:12px 14px;line-height:1.6">
        <b>„Passwortrichtlinie v2.0"</b>, betrifft alle Werke, Mitbestimmung durch KBR + Werk SHB.
        <ol style="${ol}">
          <li style="${li}"><b>Anlegen:</b> Admin importiert die Word-Datei, setzt Zielgruppe „alle", Pflichtlektüre + Wissenstest, markiert im Editor <b>Konzernbetriebsrat</b> und Werk <b>SHB</b> als betroffen und klickt „Zur Konformitätsprüfung". → Status <b>Konformitätsprüfung</b>, der Prüfer (z. B. ISB) bekommt eine Mail.</li>
          <li style="${li}"><b>Prüfung:</b> Der ISB klickt in der Mail „✓ Konform". Schwelle erreicht → weil Mitbestimmung betroffen ist, geht es <b>nicht</b> direkt zur Freigabe, sondern zu Status <b>Mitbestimmung (BR)</b>; KBR und BR-SHB erhalten automatisch das Dokument zur Mitbestimmung.</li>
          <li style="${li}"><b>Mitbestimmung:</b> Nach Rückmeldung dokumentiert der Admin/ISB „✓ Mitbestimmung dokumentiert → Freigabe". → Status <b>Freigabe</b>, die Geschäftsleitung wird informiert.</li>
          <li style="${li}"><b>Freigabe:</b> Ist Power Automate „nur Freigabe (GL)" aktiv, bekommt die GL eine <b>Outlook-Mail mit Genehmigen/Ablehnen</b> und klickt „Genehmigen" – <b>ohne Portalbesuch</b>. → Status <b>Veröffentlicht</b>, Zeitpunkt + Freigebende:r werden vermerkt.</li>
          <li style="${li}"><b>Wirkung:</b> Alle Mitarbeitenden sehen die Richtlinie ab jetzt unter „Meine Richtlinien" als „offen" und müssen Kenntnisnahme + Wissenstest erledigen; die Erfüllungsquote läuft im <b>Audit Report</b> mit.</li>
        </ol>
      </div>
      <div style="${hint}">⏰ <b>Erinnerungen & Eskalation</b> laufen automatisch (GitHub-Cron): erst nach X Tagen, dann alle Y Tage, ab Z Tagen zusätzlich an den Ersatz-Empfänger. Die richtige Person je Richtlinie wird erinnert (pro-Richtlinie-Prüfer/-Freigeber bevorzugt).</div>`,
      'ISO 27001 A.5.1 (Genehmigung &amp; Überprüfung der Richtlinien), Klausel 7.5.2 (Erstellen/Freigeben), 5.3 (Rollen); NIS2 Art. 20 (Verantwortung der Leitung).'),

    sec('health', 'Dokument-Health-Check', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter „Richtlinien Dashboard" → Button <b>„🩺 Dokumente prüfen"</b>. Prüft die angehängten Word-Dokumente <b>direkt im Browser, deterministisch und ohne KI</b>. Geprüft wird auf:</p>
      <ul style="${ol}">
        <li style="${li}"><b>Inhalts-Dubletten</b> – zwei Richtlinien mit identischem Dokumentinhalt (z. B. versehentlich falsche Datei angehängt).</li>
        <li style="${li}"><b>Titel-Abgleich</b> – passt der Dokumenttitel zur Richtlinie?</li>
        <li style="${li}"><b>Platzhalter</b> – offene Datums-Platzhalter (XX.XX.…), „tbd", unausgefüllte Freigabetabellen.</li>
        <li style="${li}"><b>Leere Pflichtkapitel</b> – Überschrift ohne Inhalt.</li>
        <li style="${li}"><b>Veraltete Begriffe (Terminologie)</b> – ein pflegbares Wörterbuch meldet z. B. alte Rollen-/Namensbezeichnungen mit Trefferzahl.</li>
        <li style="${li}"><b>Versions-/Metadaten-Abgleich</b> – weicht die im Dokument genannte Version von der App-Version ab?</li>
      </ul>
      <div style="${h3}">Ergebnis nutzen</div>
      <ul style="${ol}">
        <li style="${li}">Je Richtlinie erscheint ein Ampel-Badge (🟢 ohne Befund · 🟡 Hinweise · 🔴 kritisch · ⚪ nicht prüfbar).</li>
        <li style="${li}">Im Ergebnisbericht macht <b>„✏️ Als Vorschlag"</b> aus den Befunden einen vorausgefüllten Änderungsvorschlag an die Verantwortlichen.</li>
      </ul>`,
      'ISO 27001 Klausel 7.5.2/7.5.3 (Angemessenheit &amp; Lenkung dokumentierter Information), A.5.1 (Konsistenz der Richtlinien).'),

    sec('abdeckung', 'ISMS-Abdeckung & SoA', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„ISMS-Abdeckung"</b> zeigt als Heatmap, welche ISO-27001-/NIS2-Controls durch mindestens eine Richtlinie abgedeckt sind.</p>
      <ul style="${ol}">
        <li style="${li}"><b>Grün = gespeichert</b> (im Normbezug einer Richtlinie hinterlegt), <b>Gelb ◔ = vorläufig</b> aus der Review-Zuordnung (noch nicht gespeichert), <b>Rot = Lücke</b>.</li>
        <li style="${li}">Oben die Kennzahlen <b>Annex-A</b> und <b>NIS2</b> (gespeichert bzw. inkl. Review), darunter die <b>Lückenliste</b>.</li>
        <li style="${li}"><b>„✔ Review-Zuordnungen jetzt speichern"</b> überträgt die vorläufigen (gelben) Zuordnungen dauerhaft in den Normbezug der Richtlinien.</li>
        <li style="${li}">Eine Zelle anklicken zeigt, welche Richtlinien das Control abdecken.</li>
      </ul>
      <div style="${h3}">Export (Auditnachweis)</div>
      <ul style="${ol}">
        <li style="${li}"><b>🖨 Report</b> – öffnet einen druck-/PDF-fähigen Nachweis: Kennzahlen, Richtlinien mit Konformitäts-/Freigabestatus und Normbezug sowie die vollständige Control-Abdeckung.</li>
        <li style="${li}"><b>⬇ CSV</b> – lädt die Abdeckungsmatrix als CSV-Datei (öffnet in Excel).</li>
      </ul>
      <div style="${h3}">SoA – Erklärung zur Anwendbarkeit (zweiter Modus im Reiter)</div>
      <ul style="${ol}">
        <li style="${li}">Je Control: <b>anwendbar / ausgeschlossen</b>, <b>Umsetzungsstatus</b> (umgesetzt / teilweise / geplant / nicht umgesetzt) und <b>Begründung</b> – für <b>ausgeschlossene Controls ist die Begründung Pflicht</b>.</li>
        <li style="${li}">Die Richtlinien-Abdeckung wird je Control automatisch eingeblendet; <b>„⚡ Aus Abdeckung vorbelegen"</b> setzt alle noch offenen Controls auf anwendbar und leitet den Status aus der Abdeckung ab (gespeichert → umgesetzt, Review → geplant) – bereits Gepflegtes bleibt unangetastet.</li>
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
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Fälligkeiten"</b> bündelt die interne Überprüfung der Richtlinien anhand des Termins <b>„Nächste Überprüfung"</b> – <b>ISO 27001 A.5.1</b> verlangt die regelmäßige Überprüfung.</p>
      <ul style="${ol}">
        <li style="${li}">Gruppen: <b>überfällig</b> · <b>fällig in ≤ 30 Tagen</b> · <b>später terminiert</b> · <b>ohne Termin</b>, mit Kennzahl-Kacheln.</li>
        <li style="${li}"><b>„🔁 +12 Monate"</b> setzt den nächsten Überprüfungstermin sofort auf heute + 12 Monate.</li>
        <li style="${li}"><b>„✏ Bearbeiten"</b> öffnet die Richtlinie im Editor (z. B. um den Termin frei zu wählen).</li>
      </ul>
      <div style="${hint}">📧 Der Erinnerungs-Cron schickt zusätzlich einen <b>Fälligkeits-Digest</b> an die Admins: alle überfälligen und in den nächsten Tagen fälligen Überprüfungen, mit Direktlink in diesen Reiter.</div>`,
      'ISO 27001 A.5.1 (regelmäßige Überprüfung der Richtlinien), Klausel 9.3/10.1 (Bewertung &amp; fortlaufende Verbesserung).'),

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
        <li style="${li}"><b>Verknüpfungen</b> zu ISO-/NIS2-Controls (Normbezug-Katalog), zu Richtlinien und zu betroffenen <b>Assets</b> aus der ISMS-Liste „Assets" (Auswahl mit Suche im Editor).</li>
        <li style="${li}"><b>Wiedervorlage-Termin</b> je Risiko + automatische <b>Historie</b> (wer hat wann angelegt/geändert).</li>
      </ul>
      <div style="${hint}">📧 Der Erinnerungs-Cron mailt <b>überfällige Maßnahmen und Risiko-Reviews</b> automatisch an die Admins (mit Direktlink). Exporte: <b>🖨 Risikobericht</b> (Druck/PDF) und <b>⬇ CSV</b>. Tipp: Statt Löschen besser „Status: geschlossen" – so bleibt der Audit-Trail erhalten.</div>`,
      'ISO 27001 Klausel 6.1.2 (Risikobeurteilung), 6.1.3 (Risikobehandlung), 8.2/8.3 (Durchführung), A.5.2 (Verantwortlichkeiten); NIS2 Art. 21(1) (Risikomanagementmaßnahmen).'),

    sec('ismsdocs', 'ISMS-Dokumente (ISO 27001)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„ISMS-Dokumente"</b> verwaltet die ISO-27001-Dokumente direkt auf der ISMS-Site.</p>
      <ul style="${ol}">
        <li style="${li}">Spalten <b>Bearbeitungsstand</b>, <b>Vertraulichkeit</b> (in der Liste umstellbar), <b>Auf Konformität geprüft von</b>, <b>Freigabe Geschäftsleitung</b>, <b>Zuletzt angefasst</b>.</li>
        <li style="${li}"><b>Status & Freigabe sind nur Anzeige</b> – sie werden über den Freigabeprozess gesetzt: Dokument per <b>„＋ Als Richtlinie übernehmen"</b> einbinden und im Reiter „Freigaben" prüfen/freigeben (Rückschreibung erfolgt automatisch).</li>
        <li style="${li}"><b>„👁 Vorschau"</b> öffnet das Dokument in der App; Versionsverlauf einsehbar.</li>
        <li style="${li}"><b>„✏️ In Office bearbeiten"</b> (Desktop) oder <b>„🌐 Im Browser bearbeiten"</b> – beim Speichern entsteht automatisch eine neue Version. Alternativ <b>„⬆ Neue Version"</b> mit Pflicht-Änderungsnotiz.</li>
      </ul>`,
      'ISO 27001 Klausel 7.5 (Dokumentierte Information – Lenkung &amp; Versionierung), A.5.37 (Dokumentierte Betriebsabläufe), A.5.12/A.5.13 (Klassifizierung/Kennzeichnung).'),

    sec('governance', 'Governance-Board (Legal-Entwürfe)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Governance-Board"</b> zeigt die Entwürfe aus dem Legal-SharePoint (Corporate Governance-Board) – gleicher Zugriffsmechanismus wie bei den ISMS-Dokumenten.</p>
      <ul style="${ol}">
        <li style="${li}">Im Governance-Board liegen <b>alle Entwürfe</b> der Konzernregelungen. Sobald ein Entwurf die interne <b>Konformitätsprüfung + Freigabe</b> hier im RMS durchlaufen hat, wird das Dokument dort von Legal überschrieben/neu erstellt und veröffentlicht.</li>
        <li style="${li}"><b>„👁 Vorschau"</b>, <b>„✏️ In Office bearbeiten"</b> / <b>„🌐 Im Browser bearbeiten"</b> und <b>„🕘 Versionsverlauf"</b> wie bei ISMS-Dokumenten; <b>„↗ SharePoint"</b> öffnet den Ordner direkt.</li>
        <li style="${li}"><b>„＋ Als Richtlinie übernehmen"</b> holt einen Entwurf in den Richtlinien-Workflow (Editor mit vorbefülltem Dokument) – der Start der Konformitätsprüfung/Freigabe.</li>
      </ul>`,
      'ISO 27001 Klausel 7.5 (Dokumentierte Information), 5.2 (Politik) – gemeinsam mit der Konformitätsprüfung/Freigabe im RMS.'),

    sec('prozesse', 'Prozesse (BPMN 2.0)', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Prozesse"</b>: Abläufe als <b>BPMN 2.0</b> im Camunda-Stil selbst modellieren und <b>mit Richtlinien verknüpfen</b> („im Einklang mit den Richtlinien"). Gespeichert als <b>.bpmn</b>-Datei im Ordner „Prozesse" der ISMS-Bibliothek.</p>
      <ul style="${ol}">
        <li style="${li}"><b>+ Neuer Prozess</b> – leeres Diagramm im Modeler (Elemente aus der Palette ziehen).</li>
        <li style="${li}"><b>⬆ Importieren</b> – eine vorhandene <b>.bpmn/.xml</b>-Datei einlesen und weiterbearbeiten.</li>
        <li style="${li}"><b>✨ Aus Richtlinie</b> – erzeugt einen echten Prozessentwurf per <b>Texterkennung</b> aus dem verknüpften Word-Dokument der Richtlinie.</li>
        <li style="${li}">Je Prozess wählbar, welche <b>Richtlinien</b> er umsetzt; die Verknüpfung wird in der BPMN-Datei mitgespeichert und auf den Karten angezeigt.</li>
      </ul>
      <div style="${h3}">„Aus Richtlinie" – so entsteht der Entwurf</div>
      <ul style="${ol}">
        <li style="${li}">Richtlinie wählen → die App liest den <b>Text des Word-Dokuments</b> aus (direkt im Browser, ohne Server/KI) und zeigt ihn <b>editierbar</b> an.</li>
        <li style="${li}"><b>Nummerierte/aufgezählte Schritte</b> werden zu <b>Aufgaben</b>, Pfeile (→) trennen Schritte, <b>Entscheidungen</b> („…konform?", „…genehmigt?", Fragen) werden zu <b>Gateways</b> mit ja/nein-Zweig – inklusive fertigem Layout. Danach im Modeler frei anpassen und speichern.</li>
      </ul>
      <div style="${h3}">Beispiel</div>
      <div style="background:var(--c-bg,#f8fafc);border:1px solid var(--c-border,#e5e7eb);border-radius:10px;padding:12px 14px;line-height:1.6">
        Eine Beschaffungsrichtlinie enthält im Word-Dokument:
        <div style="font-family:monospace;font-size:.82rem;margin:6px 0;color:var(--c-muted)">1. Antrag im System erfassen<br>2. Vorgesetzter: Antrag prüfen<br>3. Freigegeben?<br>4. Bestellung auslösen<br>5. Wareneingang dokumentieren</div>
        „✨ Aus Richtlinie" erzeugt daraus: <b>Start → Aufgabe „Antrag erfassen" → Aufgabe „Vorgesetzter: Antrag prüfen" → Gateway „Freigegeben?"</b> (ja → „Bestellung auslösen" → „Wareneingang dokumentieren" → Ende; nein → „Abweichung behandeln" → Ende „Nachbessern"). Der Prozess ist automatisch mit der Richtlinie verknüpft.
      </div>
      <div style="${hint}">💡 Kein Word-Dokument verknüpft? Dann einfach den Prozesstext in das Feld einfügen – der Entwurf wird genauso erzeugt.</div>`,
      'ISO 27001 A.5.37 (Dokumentierte Betriebsabläufe), Klausel 8.1 (Betriebliche Planung &amp; Steuerung); NIS2 Art. 21(2) (Verfahren &amp; Maßnahmen).'),

    sec('vorschlaege', 'Vorschläge bearbeiten', 'admin', `
      <p style="margin:0;line-height:1.55">Reiter <b>„Vorschläge"</b> sammelt alle Änderungsvorschläge (auch die aus dem Health-Check, erkennbar am 🩺-Merkmal). Eine Zeile öffnet ein Seitenpanel: Vorschlag samt Dokument-Link lesen, <b>Status</b> setzen (Offen / In Bearbeitung / Erledigt / Abgelehnt) und einen <b>Bearbeiter-Kommentar</b> hinterlegen. Sichtbar für Admins, ISMS-Verantwortliche und Vorschlags-Empfänger.</p>`),

    sec('compliance', 'Audit Report', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Audit Report"</b> hat drei Ansichten:</p>
      <ul style="${ol}">
        <li style="${li}"><b>Gesamtübersicht</b> – wer welche Pflicht-Richtlinie erledigt hat (Soll/Ist je Richtlinie und Abteilung).</li>
        <li style="${li}"><b>Einzelne Richtlinie</b> – Detailliste je Mitarbeiter (Status, Datum, Quiz-Score).</li>
        <li style="${li}"><b>Freigabe-Audit</b> – lückenloser Nachweis <b>wer wann was</b> geprüft und freigegeben hat: jede Konformitätsprüfung (konform/nicht konform, mit Anmerkung), jede Freigabe und jede Veröffentlichung, über alle Richtlinien hinweg (auch archivierte), neueste zuerst. In Outlook (Power Automate) erteilte Freigaben erscheinen als eigenes Ereignis.</li>
      </ul>
      <div class="field-hint">Alle drei Ansichten mit <b>CSV-Export</b>.</div>
      <div style="${h3}">C-Level-Bericht (Management)</div>
      <ul style="${ol}">
        <li style="${li}">Button <b>„📧 C-Level-Bericht"</b> erstellt einen kompakten Management-Bericht: Gesamteinschätzung (🟢/🟡/🔴), die wesentlichen Kennzahlen (Richtlinien, Kenntnisnahme-Quote, Annex-A-/NIS2-Abdeckung, hohe Risiken, IT/OT-Reifegrad) und eine <b>Normkonformitäts-Prüfung nach ISO 27001 / NIS2</b> je Kapitel.</li>
        <li style="${li}"><b>Vorschau</b> mit editierbarer Empfängerzeile, <b>🖨 Drucken/PDF</b> und <b>Senden</b>. Der Standard-Empfänger wird in den <b>Einstellungen → C-Level-Bericht</b> hinterlegt.</li>
      </ul>`,
      'ISO 27001 Klausel 7.3 (Bewusstsein), 9.1 (Überwachung &amp; Messung), A.6.3 (Schulung), A.5.36 (Einhaltung von Richtlinien); Freigabe-Audit zusätzlich A.5.1 (Genehmigung &amp; Überprüfung), Klausel 9.2 (internes Audit).'),

    sec('einstellungen', 'Einstellungen', 'admin', `
      <p style="margin:0 0 8px;line-height:1.55">Reiter <b>„Einstellungen"</b> (Admin) pflegt zentrale Rollen und Automatiken:</p>
      <ul style="${ol}">
        <li style="${li}"><b>Rollen:</b> Admins, Genehmiger, Prüfer, Geschäftsleitung, KI-Gremium, ISMS-Verantwortliche und Vorschlags-Empfänger.</li>
        <li style="${li}"><b>Genehmigungs-Schwellen:</b> „konform/freigegeben, wenn alle zustimmen" oder „einer reicht" (global; je Richtlinie überschreibbar).</li>
        <li style="${li}"><b>Erinnerungen:</b> aktiv/aus, Absender-Postfach, Taktung, Eskalation, Ersatz-Empfänger.</li>
        <li style="${li}"><b>Mitbestimmung (KBR/BR):</b> Mailadresse des Konzernbetriebsrats und je Werk (SHB, WGC, SCH, EIS, DSO, ZAI, LEG, MEG, EWA) für die Mitbestimmungsprüfung.</li>
        <li style="${li}"><b>Power Automate (Genehmigung ohne Portal):</b> je Etappe wählbar – <b>aus</b> (App verschickt die Mails) · <b>nur Freigabe (Geschäftsleitung)</b> · <b>Prüfung + Freigabe</b>. Für die per Power Automate gesteuerte Etappe verschickt die App keine eigene Mail (Details in <code>docs/GENEHMIGUNG-POWER-AUTOMATE.md</code>).</li>
        <li style="${li}"><b>C-Level-Bericht:</b> Empfängeradresse(n) für den Management-Bericht aus dem Audit Report.</li>
        <li style="${li}"><b>Reiter-Berechtigungen (Lesen/Schreiben):</b> Benutzer per E-Mail hinzufügen, dann je Reiter (z. B. Richtlinien Dashboard, Audit Report, Fälligkeiten) <b>Lesen/Schreiben per Häkchen</b> vergeben – <b>additiv</b> zu den Standardrechten, Admins haben immer Zugriff. „Nur Lesen" = Reiter sichtbar, aber Anlegen/Bearbeiten gesperrt; „Schreiben" schließt Lesen ein. „Einstellungen" bleibt Admins vorbehalten.</li>
      </ul>`,
      'ISO 27001 Klausel 5.3 (Rollen, Verantwortlichkeiten &amp; Befugnisse), 7.4 (Kommunikation), A.5.2 (Rollen).'),

    sec('glossar', 'Begriffe & Normbezug', 'all', `
      <ul style="${ol}">
        <li style="${li}"><b>Kenntnisnahme:</b> Bestätigung, dass eine Richtlinie gelesen und verstanden wurde.</li>
        <li style="${li}"><b>Konformitätsprüfung:</b> fachliche Prüfung, ob eine Richtlinie den Vorgaben (ISO 27001 / NIS2) entspricht.</li>
        <li style="${li}"><b>Freigabe:</b> Genehmigung durch die Geschäftsleitung → Veröffentlichung.</li>
        <li style="${li}"><b>Normbezug:</b> Zuordnung einer Richtlinie zu ISO-27001-/NIS2-Controls (Grundlage der Abdeckungs-Heatmap).</li>
        <li style="${li}"><b>ISO/IEC 27001:2022:</b> Norm für Informationssicherheits-Managementsysteme (Klauseln 4–10 + Annex A mit 93 Controls in A.5–A.8).</li>
        <li style="${li}"><b>NIS2 (EU 2022/2555):</b> EU-Richtlinie zur Cybersicherheit – u. a. Governance (Art. 20), Risikomaßnahmen (Art. 21), Meldepflichten (Art. 23).</li>
        <li style="${li}"><b>Wiedervorlage / Review:</b> Termin der nächsten internen Überprüfung einer Richtlinie (A.5.1).</li>
      </ul>`),

    sec('faq', 'Häufige Fragen & Hilfe', 'all', `
      <ul style="${ol}">
        <li style="${li}"><b>Etwas wirkt nicht aktuell?</b> „↻ Aktualisieren" oben rechts.</li>
        <li style="${li}"><b>Eine Richtlinie ist nicht sichtbar?</b> Sie ist evtl. noch nicht veröffentlicht oder deiner Rolle/Zielgruppe nicht zugeordnet.</li>
        <li style="${li}"><b>„Fehlende Spalten"-Warnung (Admin)?</b> In der SharePoint-Liste „Richtlinien" fehlt eine Spalte (z. B. NormbezugJson, PruefKonfigJson, FreigabeKonfigJson). Anlegen als „Mehrere Zeilen Text", danach „↻ Aktualisieren".</li>
        <li style="${li}"><b>Bearbeiten schlägt fehl?</b> Das Bearbeiten von ISMS-Dokumenten setzt SharePoint-Schreibrechte auf der ISMS-Site voraus (Anzeige geht trotzdem).</li>
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
      <p class="view-desc">Vollständige Anleitung zum Richtlinienmanagement – von der Kenntnisnahme bis zu Konformitätsprüfung, Freigabe, ISMS-Abdeckung und Fälligkeiten. Welche Abschnitte für dich relevant sind, zeigen die farbigen Rollen-Marker. Kurzfassung: Reiter <a href="#" onclick="event.preventDefault();switchView('anleitung')" style="color:var(--c-primary);font-weight:600">„Anleitung"</a>.</p>
    </div>
    <div class="doku-grid">
      <nav class="doku-toc">
        <div class="doku-toc-title">Inhalt</div>
        ${toc}
      </nav>
      <div class="doku-body">
        ${_dokuSections()}
        <div style="text-align:center;color:var(--c-faint);font-size:.8rem;margin:6px 0 8px">Stand: 2026 · DIHAG Richtlinienmanagement</div>
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
    <title>Benutzerhandbuch – DIHAG Richtlinienmanagement</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:28px;font-size:13px;line-height:1.5;max-width:820px}
      h1{font-size:20px;margin:0 0 4px} .doku-h2{font-size:15px;font-weight:800;margin:0 0 6px;border-bottom:2px solid #111827;padding-bottom:3px}
      .doku-sec{border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin:0 0 14px;page-break-inside:avoid}
      .doku-norm{margin-top:10px;font-size:11.5px;color:#6b7280;border-top:1px dashed #d1d5db;padding-top:7px}
      .doku-tbl{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
      .doku-tbl td{border:1px solid #d1d5db;padding:5px 9px;vertical-align:top}
      .doku-tbl tr td:first-child{width:210px;font-weight:600}
      a{color:#17509e} ul,ol{margin:8px 0 0} :root{--c-muted:#6b7280;--c-primary:#17509e;--c-text:#111827;--c-bg:#f8fafc;--c-surface:#fff;--c-border:#e5e7eb;--c-faint:#9ca3af}
      .noprint{margin-bottom:14px}@media print{.noprint{display:none}}
    </style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    <h1>Benutzerhandbuch – DIHAG Richtlinienmanagement</h1>
    <p style="color:#6b7280;margin:0 0 16px">Stand 2026 · vollständige Bedienungsanleitung</p>
    ${sections}
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Pop-up-Blocker? Bitte Pop-ups erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
