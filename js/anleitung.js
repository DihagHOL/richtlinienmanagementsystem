/* ═══════════════════════════════════════════════════
   Anleitung – kurze Benutzer-Schulung (für alle sichtbar)
   Rein statische Inhalte; rendert in #anleitung-mount.
   Quelle/Langfassung: docs/BENUTZERHANDBUCH.md
═══════════════════════════════════════════════════ */

let _anleitungRendered = false;

function initAnleitung() {
  if (_anleitungRendered) return;           // statisch – einmal rendern reicht
  const mount = document.getElementById('anleitung-mount');
  if (!mount) return;
  mount.innerHTML = anleitungHtml();
  _anleitungRendered = true;
}

/* Badge „für wen ist dieser Abschnitt" */
function _aBadge(text, color) {
  const map = {
    all:   ['#eff3ff', '#1a56db'],
    gov:   ['#fef9c3', '#a16207'],
    admin: ['#f3e8ff', '#7e22ce'],
  };
  const [bg, fg] = map[color] || map.all;
  return `<span style="display:inline-block;font-size:.66rem;font-weight:700;letter-spacing:.02em;
    background:${bg};color:${fg};border-radius:999px;padding:2px 10px;vertical-align:middle">${text}</span>`;
}

function _aCard(inner) {
  return `<div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:14px;
    padding:20px 22px;margin:0 0 16px">${inner}</div>`;
}

function anleitungHtml() {
  const liStyle = 'margin:0 0 7px;line-height:1.55';
  const h3 = 'margin:18px 0 8px;font-size:1rem;font-weight:700;color:var(--c-text)';
  const h2 = 'margin:0 0 4px;font-size:1.15rem;font-weight:800;color:var(--c-text);display:flex;align-items:center;gap:10px;flex-wrap:wrap';

  return `
  <div style="max-width:860px">

    <div class="view-header" style="margin-bottom:18px">
      <h2>Anleitung &amp; Kurz-Schulung</h2>
      <p class="view-desc">In wenigen Minuten erklärt, wie das Richtlinienmanagement und das
        integrierte KI-Dashboard genutzt werden. Such dir den Abschnitt, der zu deiner Rolle passt –
        welche Bereiche du siehst, hängt von deinen Rechten ab.</p>
    </div>

    ${_aCard(`
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="font-size:1.6rem;line-height:1">🔑</div>
        <div>
          <div style="font-weight:700;margin-bottom:4px">Aufruf &amp; Anmeldung</div>
          <div style="color:var(--c-muted);line-height:1.55">
            Aufruf über <a href="https://richtlinienmanagement.dihag-extern.com/"
              style="color:var(--c-primary);font-weight:600">richtlinienmanagement.dihag-extern.com</a>.
            Anmeldung mit dem normalen DIHAG-Microsoft-Konto – einmal anmelden genügt, das KI-Dashboard
            nutzt dieselbe Anmeldung. Bei Problemen Seite neu laden oder „Erneut versuchen“ klicken.
          </div>
        </div>
      </div>`)}

    <!-- 1. Alle Mitarbeitenden -->
    ${_aCard(`
      <h2 style="${h2}">1. Richtlinien lesen &amp; bestätigen ${_aBadge('Für alle', 'all')}</h2>
      <ol style="padding-left:20px;margin:10px 0 0;color:var(--c-text)">
        <li style="${liStyle}">Reiter <b>„Meine Richtlinien“</b> öffnen – oben siehst du deine Quote
          (zugewiesen / offen / abgeschlossen).</li>
        <li style="${liStyle}">Eine Richtlinie anklicken → das Dokument wird angezeigt.</li>
        <li style="${liStyle}"><b>Kenntnisnahme:</b> kurz lesen, dann „Ich habe gelesen und verstanden“
          ankreuzen und <b>„Kenntnisnahme bestätigen“</b>. (Das Häkchen wird erst nach kurzer Lesezeit
          bzw. nach „In SharePoint öffnen“ aktiv.)</li>
        <li style="${liStyle}"><b>Wissenstest</b> (falls erforderlich): „Wissenstest starten“ →
          Fragen beantworten. Nicht bestanden? Einfach erneut versuchen.</li>
        <li style="${liStyle}">Zum Schluss kannst du dir einen <b>Teilnahmenachweis per Mail</b> an dich
          selbst senden.</li>
      </ol>
      <div style="margin-top:12px;font-size:.85rem;color:var(--c-muted)">
        ℹ️ Manche Richtlinien müssen <b>regelmäßig</b> erneut bestätigt werden – sie tauchen dann
        automatisch wieder als „offen“ auf.</div>

      <h3 style="${h3}">✏️ Eine Änderung vorschlagen</h3>
      <p style="margin:0;line-height:1.55;color:var(--c-text)">Fehler oder Verbesserung entdeckt?
        In der geöffneten Richtlinie oben rechts auf <b>„✏️ Änderung vorschlagen“</b> klicken,
        kurz <b>was</b> und <b>warum</b> beschreiben, absenden. Der Vorschlag enthält einen
        <b>Direktlink zum Dokument</b>, geht per Mail an die Verantwortlichen (du bekommst eine
        <b>Kopie</b>) und landet im Reiter <b>„Vorschläge“</b> zur Nachverfolgung. Im Dialog können
        unter <b>„Weitere Empfänger“</b> zusätzliche interne Adressen ergänzt werden.</p>

      <h3 style="${h3}">📚 Kurse <span style="font-size:.7rem;color:var(--c-warn);font-weight:700">BETA</span></h3>
      <p style="margin:0;line-height:1.55;color:var(--c-muted)">Unter „Kurse“ sind mehrere Richtlinien
        zu Lernpaketen gebündelt. Optional.</p>`)}

    <!-- 2. KI-Dashboard -->
    ${_aCard(`
      <h2 style="${h2}">2. KI-Systeme beantragen (KI-Dashboard) ${_aBadge('Für alle', 'all')}</h2>
      <p style="margin:8px 0 10px;line-height:1.55;color:var(--c-text)">Über <b>„KI-Dashboard“</b>
        (linke Leiste) kommst du in den KI-Governance-Bereich. Jeder kann einen Antrag stellen, wenn
        ein neues KI-System eingesetzt werden soll.</p>
      <ol style="padding-left:20px;margin:0;color:var(--c-text)">
        <li style="${liStyle}"><b>„Neuer Antrag“</b> → Formular gemäß KI-Richtlinie (CO-10-01) ausfüllen.
          KI-Richtlinie und Verhaltenskodex sind oben direkt verlinkt.</li>
        <li style="${liStyle}">Absenden → das KI-Koordinierungsgremium wird automatisch informiert.</li>
        <li style="${liStyle}">Status jederzeit unter <b>„Anträge“</b>. Bei einer Rückfrage des Gremiums
          kannst du dort direkt antworten.</li>
      </ol>`)}

    <!-- 3. Gremium / Genehmiger -->
    ${_aCard(`
      <h2 style="${h2}">3. Entscheiden &amp; freigeben ${_aBadge('Gremium / Genehmiger', 'gov')}</h2>
      <h3 style="${h3}">KI-Anträge entscheiden</h3>
      <ul style="padding-left:20px;margin:0;color:var(--c-text)">
        <li style="${liStyle}">Unter <b>„Anträge“</b> (KI-Dashboard) einen Antrag öffnen.</li>
        <li style="${liStyle}"><b>Genehmigen</b>, <b>Ablehnen</b> oder <b>Rückfrage</b> stellen.</li>
        <li style="${liStyle}"><b>Wichtig:</b> Bei <i>Ablehnung</i> und <i>Rückfrage</i> ist ein
          <b>Kommentar Pflicht</b> (Begründung). Der Antragsteller wird automatisch per Mail informiert.</li>
      </ul>
      <h3 style="${h3}">Richtlinien freigeben (Reiter „Freigaben“)</h3>
      <p style="margin:0 0 8px;line-height:1.5;color:var(--c-muted)">Ablauf:
        <b>Entwurf → Konformitätsprüfung → Mitbestimmung (bei Betroffenheit) → Freigabe → Veröffentlicht.</b></p>
      <ul style="padding-left:20px;margin:0;color:var(--c-text)">
        <li style="${liStyle}"><b>Prüfer:</b> „Konform“ oder „Nicht konform“ markieren – bei
          <i>„nicht konform“ ist eine Begründung Pflicht</i>.</li>
        <li style="${liStyle}"><b>Mitbestimmung:</b> Ist im Editor der Konzern-/Betriebsrat als betroffen
          markiert, geht die konforme Richtlinie (mit Dokument) automatisch an den zuständigen Betriebsrat.
          Nach dessen Beteiligung wird das im Reiter „Freigaben“ dokumentiert → dann zur Freigabe.</li>
        <li style="${liStyle}"><b>Geschäftsleitung:</b> „Freigeben“ (optional mit Kommentar) → die
          Richtlinie wird veröffentlicht. Kommentare erscheinen im Verlauf der Karte.</li>
      </ul>`)}

    <!-- 4. Administratoren -->
    ${_aCard(`
      <h2 style="${h2}">4. Verwaltung ${_aBadge('Administratoren', 'admin')}</h2>
      <h3 style="${h3}">Richtlinien Dashboard</h3>
      <ul style="padding-left:20px;margin:0;color:var(--c-text)">
        <li style="${liStyle}"><b>„Richtlinien Dashboard“</b> → „+ Neue Richtlinie“ oder bestehende
          anklicken.</li>
        <li style="${liStyle}">Titel, Beschreibung, Kategorie, Zielgruppe (wer sie sehen muss),
          Pflicht/optional, Wissenstest und das zugehörige <b>Dokument</b> festlegen.</li>
        <li style="${liStyle}">„Zur Konformitätsprüfung“ startet den Freigabe-Workflow (siehe Abschnitt 3).</li>
        <li style="${liStyle}"><b>Audit Report</b> (Compliance) zeigt, wer welche Pflicht-Richtlinie
          erledigt hat (inkl. CSV-Export).</li>
      </ul>
      <h3 style="${h3}">ISMS-Dokumente (ISO 27001)</h3>
      <ul style="padding-left:20px;margin:0;color:var(--c-text)">
        <li style="${liStyle}">Spalten <b>Bearbeitungsstand</b>, <b>Vertraulichkeit</b>,
          <b>Auf Konformität geprüft von</b>, <b>Freigabe Geschäftsleitung</b>, <b>Zuletzt angefasst</b>.
          <b>Vertraulichkeit</b> ist direkt in der Liste umstellbar; oben nach Stand filtern.</li>
        <li style="${liStyle}"><b>Status &amp; Freigabe</b> (Bearbeitungsstand, Auf Konformität geprüft von,
          Freigabe Geschäftsleitung) sind <b>nur Anzeige</b> – das Panel zeigt den aktuellen Stand und
          was noch offen ist. Gesetzt werden sie über den Freigabeprozess: Dokument unten per
          <b>„＋ Als Richtlinie übernehmen“</b> einbinden und im Reiter <b>„Freigaben“</b> prüfen/freigeben
          (die Felder werden dann automatisch zurückgeschrieben).</li>
        <li style="${liStyle}"><b>Zeile anklicken</b> öffnet die Detailansicht: oben der Status (Anzeige),
          darunter restliche Metadaten (inkl. <b>Owner</b>) bearbeiten. <b>„👁 Vorschau“</b> öffnet das
          Dokument <b>direkt in der App</b>, dazu Versionsverlauf.</li>
        <li style="${liStyle}"><b>„✏️ In Office bearbeiten“</b> (Desktop) oder <b>„🌐 Im Browser
          bearbeiten“</b> (ohne installiertes Office) – beim Speichern entsteht automatisch eine
          neue Version. Oder <b>„⬆ Neue Version“</b> → geänderte Datei hochladen mit
          Pflicht-<b>Änderungsnotiz</b>.</li>
        <li style="${liStyle}"><b>„＋ Als Richtlinie übernehmen“</b> macht aus einem ISMS-Dokument eine
          Richtlinie im Schulungs-/Freigabe-Workflow.</li>
      </ul>
      <h3 style="${h3}">Vorschläge bearbeiten</h3>
      <p style="margin:0;line-height:1.55;color:var(--c-text)">Reiter <b>„Vorschläge“</b> sammelt alle
        eingereichten Änderungsvorschläge. Eine Zeile anklicken öffnet ein <b>Seitenpanel</b> rechts:
        Vorschlag samt Dokument-Link lesen, <b>Status</b> setzen (Offen / In Bearbeitung / Erledigt /
        Abgelehnt) und einen <b>Bearbeiter-Kommentar</b> hinterlegen. Sichtbar für Admins,
        ISMS-Verantwortliche und Vorschlags-Empfänger.</p>
      <h3 style="${h3}">Einstellungen</h3>
      <p style="margin:0;line-height:1.55;color:var(--c-text)">Rollen pflegen: <b>Admins, Genehmiger,
        Prüfer, Geschäftsleitung, KI-Gremium</b>, <b>ISMS-Verantwortliche</b> und
        <b>Vorschlags-Empfänger</b> (beide erhalten die Änderungsvorschläge). Außerdem
        Genehmigungs-Schwellen und automatische <b>Review-Erinnerungen</b>.</p>`)}

    <!-- 5. Gut zu wissen -->
    ${_aCard(`
      <h2 style="${h2}">5. Gut zu wissen ${_aBadge('Für alle', 'all')}</h2>
      <ul style="padding-left:20px;margin:8px 0 0;color:var(--c-text)">
        <li style="${liStyle}"><b>„↻ Aktualisieren“</b> (oben rechts) lädt frische Daten, falls etwas
          nicht aktuell wirkt.</li>
        <li style="${liStyle}"><b>Mobil:</b> Über das Menü-Symbol oben links die Navigation ein-/ausblenden.</li>
        <li style="${liStyle}"><b>Schreibrechte:</b> Das Bearbeiten von ISMS-Dokumenten setzt
          SharePoint-Schreibrechte auf der ISMS-Site voraus – fehlen sie, erscheint eine klare Meldung
          (Anzeige geht trotzdem).</li>
        <li style="${liStyle}"><b>Hilfe:</b> Bei Fehlern Seite neu laden; bleibt es bestehen, an die
          IT/Compliance wenden.</li>
      </ul>`)}

    <div style="text-align:center;color:var(--c-faint);font-size:.8rem;margin:6px 0 8px">
      Stand: 2026 · DIHAG Richtlinienmanagement</div>

  </div>`;
}
