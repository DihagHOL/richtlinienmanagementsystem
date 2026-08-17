/**
 * Geführter Rundgang („Tutorial")
 * ================================
 * Erklärt den kompletten Weg eines Regelwerks an EINEM durchgehenden Beispiel –
 * vom Konzept bis zur Kenntnisnahme und zum Audit-Nachweis. Gedacht für die
 * Vorstellung vor der Geschäftsführung und als Einstieg für neue Anwender.
 *
 * Bewusst eigenständig: Der Rundgang arbeitet mit einem erfundenen Beispiel und
 * greift NICHT auf SharePoint zu. Er funktioniert damit auch in einer leeren
 * Umgebung, in einer Präsentation und ohne Schreibrechte – und kann nichts
 * kaputt machen.
 */

/** Beispiel, das sich durch alle Schritte zieht. */
const TUT_BEISPIEL = {
  titel: 'Regelwerk zur Nutzung von KI',
  typ: 'Konzernrichtlinie',
  geltung: 'Alle Standorte',
  version: '1.0',
};

let _tutSchritt = 0;

/* ── Kleine Bausteine für die Illustrationen ─────────────────────── */

const _tutFarben = {
  entwurf: ['#eef2f7', '#475569'],
  pruef:   ['#fef3c7', '#b45309'],
  mit:     ['#e0e7ff', '#3730a3'],
  frei:    ['#dbeafe', '#1e40af'],
  veroef:  ['#dcfce7', '#15803d'],
};

function _tutBadge(text, art) {
  const [bg, fg] = _tutFarben[art] || _tutFarben.entwurf;
  return `<span style="display:inline-block;font-size:.72rem;font-weight:700;background:${bg};color:${fg};border-radius:999px;padding:3px 11px;white-space:nowrap">${esc(text)}</span>`;
}

/** Die Ablaufkette mit hervorgehobener Station. */
function _tutKette(aktiv) {
  const stationen = [
    ['Konzept', 'entwurf'], ['Entwurf', 'entwurf'], ['Prüfung', 'pruef'],
    ['Mitbestimmung', 'mit'], ['Freigabe', 'frei'], ['Veröffentlicht', 'veroef'],
  ];
  return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 16px">
    ${stationen.map(([name, art], i) => {
      const an = i === aktiv;
      const [bg, fg] = _tutFarben[art];
      return `${i ? '<span style="color:var(--c-faint);font-size:.8rem">→</span>' : ''}
        <span style="font-size:.72rem;font-weight:${an ? '700' : '500'};padding:3px 10px;border-radius:999px;
          background:${an ? bg : 'transparent'};color:${an ? fg : 'var(--c-faint)'};
          border:1px solid ${an ? 'transparent' : 'var(--c-border)'}">${esc(name)}</span>`;
    }).join('')}
  </div>`;
}

/** Nachgebaute Regelwerk-Karte, wie sie im Dashboard erscheint. */
function _tutKarte(status, art, extra) {
  return `<div style="border:1px solid var(--c-border);border-radius:10px;padding:13px 15px;background:#fff">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
      <div style="font-weight:700;font-size:.92rem">${esc(TUT_BEISPIEL.titel)}</div>
      ${_tutBadge(status, art)}
    </div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;font-size:.7rem">
      <span style="background:#eef2ff;color:#3730a3;border-radius:5px;padding:2px 8px">${esc(TUT_BEISPIEL.typ)}</span>
      <span style="background:var(--c-bg);color:var(--c-muted);border-radius:5px;padding:2px 8px">IT-Sicherheit</span>
      <span style="background:var(--c-bg);color:var(--c-muted);border-radius:5px;padding:2px 8px">📍 ${esc(TUT_BEISPIEL.geltung)}</span>
      <span style="background:var(--c-bg);color:var(--c-muted);border-radius:5px;padding:2px 8px">v${esc(TUT_BEISPIEL.version)}</span>
    </div>
    ${extra || ''}
  </div>`;
}

/** Zeile mit Entscheidungs-Schaltflächen (nur Ansicht, nicht klickbar). */
function _tutAktionen(knoepfe) {
  return `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:11px">
    ${knoepfe.map(([text, farbe]) => `<span style="font-size:.75rem;font-weight:600;padding:5px 12px;border-radius:7px;
      background:${farbe};color:#fff;white-space:nowrap">${esc(text)}</span>`).join('')}
  </div>`;
}

function _tutMail(betreff, zeilen, knoepfe) {
  return `<div style="border:1px solid var(--c-border);border-radius:10px;overflow:hidden;background:#fff">
    <div style="background:var(--c-bg);padding:8px 13px;border-bottom:1px solid var(--c-border);font-size:.76rem;color:var(--c-muted)">
      ✉️ <b style="color:var(--c-text)">${esc(betreff)}</b></div>
    <div style="padding:12px 13px;font-size:.8rem;line-height:1.6">
      ${zeilen.map(z => `<div>${z}</div>`).join('')}
      ${knoepfe ? _tutAktionen(knoepfe) : ''}
    </div></div>`;
}

/* ── Die Schritte ────────────────────────────────────────────────── */

function _tutSchritte() {
  const p = 'margin:0 0 10px;line-height:1.6';
  const merke = (t) => `<div style="margin-top:14px;font-size:.82rem;color:var(--c-muted);background:var(--c-bg);
    border-left:3px solid var(--c-primary);padding:9px 13px;border-radius:0 8px 8px 0">${t}</div>`;

  return [
    {
      titel: 'Worum es geht',
      body: `
        <p style="${p}">Dieser Rundgang zeigt den Weg eines Regelwerks von der ersten Idee bis zum
        Nachweis im Audit – an einem durchgehenden Beispiel:</p>
        <div style="text-align:center;margin:18px 0">
          <div style="font-size:1.15rem;font-weight:800;color:var(--c-primary)">${esc(TUT_BEISPIEL.titel)}</div>
          <div style="font-size:.82rem;color:var(--c-muted);margin-top:4px">
            ${esc(TUT_BEISPIEL.typ)} · Geltungsbereich: ${esc(TUT_BEISPIEL.geltung)}</div>
        </div>
        ${_tutKette(-1)}
        <p style="${p}">Sechs Stationen, jede mit einer klaren Zuständigkeit. Wer dran ist, bekommt
        eine E-Mail und kann direkt daraus entscheiden.</p>
        ${merke('Der Rundgang ist ein <b>Beispiel</b>. Es werden keine Daten angelegt oder geändert.')}`,
    },
    {
      titel: '1 · Konzept – erst fragen, dann schreiben',
      body: `
        ${_tutKette(0)}
        <p style="${p}">Bevor jemand ein neues Regelwerk ausformuliert, entscheidet die
        <b>Geschäftsführung</b>, ob es überhaupt gebraucht wird. Dafür wird ein <b>Konzept</b>
        eingereicht: Arbeitstitel, Typ, Geltungsbereich, Priorität – und vor allem die Antwort auf
        die Frage <i>Warum?</i></p>
        ${_tutMail('Neues Regelwerk-Konzept zur Prüfung: ' + TUT_BEISPIEL.titel, [
          `Titel: <b>${esc(TUT_BEISPIEL.titel)}</b> (IT-Sicherheit)`,
          'Priorität (Vorschlag): <b>Hoch</b>',
          '<b>Warum?</b> KI-Werkzeuge werden bereits genutzt – ohne Regeln drohen Datenabfluss und Compliance-Risiken.',
          '📎 Entwurf im Anhang',
        ], [['✓ Annehmen', '#16a34a'], ['⏸ Zurückstellen', '#64748b'], ['✗ Ablehnen', '#dc2626']])}
        ${merke('Das spart Arbeit an Regelwerken, die am Ende niemand will. Bei <b>Ablehnung</b> ist eine Begründung Pflicht.')}`,
    },
    {
      titel: '2 · Entwurf – aus dem Konzept wird ein Regelwerk',
      body: `
        ${_tutKette(1)}
        <p style="${p}">Nimmt die Geschäftsführung das Konzept an, entsteht daraus automatisch ein
        <b>Regelwerk-Entwurf</b>. Titel, Typ, Geltungsbereich und die Begründung werden übernommen,
        ein Anhang wird zum Startdokument.</p>
        ${_tutKarte('Entwurf', 'entwurf', `
          <div style="margin-top:10px;font-size:.78rem;color:var(--c-muted)">
            📄 KI-Regelwerk-Entwurf.docx · 👥 Alle Mitarbeiter · 📝 Wissenstest aktiv</div>`)}
        <p style="${p};margin-top:14px">Im Editor kommen jetzt die Details dazu: Zielgruppe,
        Pflichtlektüre, Wissenstest, Wiedervorlage-Termin und – falls die Mitbestimmung betroffen
        ist – der zuständige Betriebsrat.</p>
        ${merke('Das Dokument selbst bleibt in SharePoint und lässt sich direkt in Word öffnen. Beim Speichern entsteht automatisch eine neue Version.')}`,
    },
    {
      titel: '3 · Konformitätsprüfung',
      body: `
        ${_tutKette(2)}
        <p style="${p}">Mit „Zur Konformitätsprüfung" geht das Regelwerk an die hinterlegten
        <b>Prüfer</b>. Sie erhalten eine E-Mail mit dem Dokument im Anhang und entscheiden direkt
        daraus.</p>
        ${_tutMail('Neues Regelwerk zur Sichtung: ' + TUT_BEISPIEL.titel, [
          'Bitte prüfe das Regelwerk auf Konformität.',
          '📎 Das Dokument ist dieser E-Mail angehängt.',
        ], [['✓ Konform', '#16a34a'], ['✗ Nicht konform', '#dc2626']])}
        ${merke('„Nicht konform" verlangt immer eine <b>Begründung</b> – so ist später nachvollziehbar, warum etwas zurückging.')}`,
    },
    {
      titel: '4 · Mitbestimmung',
      body: `
        ${_tutKette(3)}
        <p style="${p}">Ist die Mitbestimmung betroffen, geht das Regelwerk an den
        <b>Konzernbetriebsrat</b> bzw. die <b>Betriebsräte der gewählten Werke</b> – automatisch,
        an die in den Einstellungen hinterlegten Adressen.</p>
        ${_tutKarte('Mitbestimmung (BR)', 'mit', `
          <div style="margin-top:10px;font-size:.78rem;color:var(--c-muted)">
            Beteiligt: KBR · Betriebsräte SHB, EIS</div>`)}
        <p style="${p};margin-top:14px">Der Betriebsrat entscheidet mit <b>Konform</b> oder
        <b>Nicht konform</b> (mit Begründung). Die Reihenfolge von Mitbestimmung und Freigabe lässt
        sich je Regelwerk tauschen.</p>
        ${merke('Diese Stufe ist der Grund für den stufenweisen Rollout: Erst wenn die Betriebsvereinbarung steht, kommen weitere Werke dazu.')}`,
    },
    {
      titel: '5 · Freigabe durch die Geschäftsführung',
      body: `
        ${_tutKette(4)}
        <p style="${p}">Zum Schluss entscheidet die <b>Geschäftsführung</b>. In der E-Mail steht,
        wer vorher bereits zugestimmt hat – so ist der Stand ohne Rückfragen erkennbar.</p>
        ${_tutMail('Regelwerk zur Freigabe: ' + TUT_BEISPIEL.titel, [
          'Die Konformitätsprüfung ist abgeschlossen.',
          `<div style="margin:9px 0;padding:9px 12px;background:#f0fdf4;border-left:3px solid #16a34a;
            border-radius:0 7px 7px 0;font-size:.76rem;color:#14532d">
            <b>Bereits freigegeben:</b><br>
            ✓ Konformitätsprüfung: <b>IT-Sicherheitsbeauftragter</b> – 18.08.2026<br>
            ✓ Mitbestimmung: <b>Konzernbetriebsrat</b> – 20.08.2026</div>`,
        ], [['✓ Freigeben', '#16a34a'], ['✗ Zurück', '#dc2626']])}
        ${merke('Wahlweise entscheidet die Geschäftsführung in der App oder direkt aus Outlook – auch per Power Automate.')}`,
    },
    {
      titel: '6 · Veröffentlichung und Kenntnisnahme',
      body: `
        ${_tutKette(5)}
        <p style="${p}">Mit der Freigabe wird das Regelwerk <b>veröffentlicht</b> und erscheint bei
        allen Mitarbeitenden der Zielgruppe unter „Meine Regelwerke".</p>
        ${_tutKarte('Veröffentlicht', 'veroef', `
          <div style="margin-top:11px;padding:10px 12px;background:var(--c-bg);border-radius:8px;font-size:.78rem;line-height:1.7">
            <div>① Dokument lesen</div>
            <div>② „Ich habe gelesen und verstanden" bestätigen</div>
            <div>③ Wissenstest bestehen</div>
            <div style="color:var(--c-muted);margin-top:5px">Erinnerungen laufen automatisch – ohne dass jemand nachhalten muss.</div>
          </div>`)}
        ${merke('Wiederholungspflicht möglich: Nach Ablauf erscheint das Regelwerk automatisch wieder als offen.')}`,
    },
    {
      titel: '7 · Nachweis im Audit',
      body: `
        <p style="${p}">Das ist der eigentliche Zweck: Auf Knopfdruck ist belegbar, <b>wer wann was</b>
        entschieden und zur Kenntnis genommen hat.</p>
        <div style="border:1px solid var(--c-border);border-radius:10px;background:#fff;overflow:hidden">
          <div style="background:var(--c-bg);padding:8px 13px;border-bottom:1px solid var(--c-border);
            font-size:.78rem;font-weight:700">Änderungshistorie · ${esc(TUT_BEISPIEL.titel)}</div>
          <div style="padding:11px 13px;font-size:.77rem;line-height:1.85">
            <div><b>Freigegeben &amp; veröffentlicht</b> · Dr. A. Lissitsa · 21.08.2026</div>
            <div><b>Mitbestimmung: konform</b> · Konzernbetriebsrat · 20.08.2026</div>
            <div><b>Konformitätsprüfung: konform</b> · IT-Sicherheitsbeauftragter · 18.08.2026</div>
            <div><b>Bearbeitet</b> · Version: „0.9" → „1.0" · 17.08.2026</div>
            <div><b>Angelegt</b> · aus Konzept übernommen · 17.08.2026</div>
          </div>
        </div>
        <p style="${p};margin-top:14px">Dazu kommen die <b>Kenntnisnahme-Quote</b> je Regelwerk
        (mit CSV-Export), der <b>C-Level-Bericht</b> und die Zuordnung zu den Controls aus
        <b>ISO 27001</b> und <b>NIS2</b>.</p>
        ${merke('Genau diese Nachweisführung ist der Punkt, den Auditoren sehen wollen – und der bisher mühsam von Hand zusammengetragen wurde.')}`,
    },
    {
      titel: 'Geschafft',
      body: `
        <div style="text-align:center;padding:14px 0 4px">
          <div style="font-size:2.2rem">✅</div>
          <div style="font-weight:800;font-size:1.05rem;margin-top:6px">Das war der komplette Durchlauf</div>
        </div>
        ${_tutKette(5)}
        <p style="${p}">Von der Idee über Prüfung und Mitbestimmung bis zur Freigabe,
        Kenntnisnahme und zum Audit-Nachweis – nachvollziehbar an einer Stelle.</p>
        <p style="${p}">Ausführlicher steht alles im Reiter <b>Dokumentation</b>; dort lässt sich das
        Benutzerhandbuch auch drucken oder als PDF speichern.</p>
        ${merke('Der Rundgang lässt sich jederzeit über „▶ Rundgang starten" in der Anleitung erneut aufrufen.')}`,
    },
  ];
}

/* ── Steuerung ───────────────────────────────────────────────────── */

function startTutorial(schritt) {
  _tutSchritt = Math.max(0, Math.min(_tutSchritte().length - 1, Number(schritt) || 0));
  renderTutorial();
}

function tutorialNext() { startTutorial(_tutSchritt + 1); }
function tutorialPrev() { startTutorial(_tutSchritt - 1); }

function renderTutorial() {
  const schritte = _tutSchritte();
  const s = schritte[_tutSchritt];
  const letzter = _tutSchritt === schritte.length - 1;
  const punkte = schritte.map((_, i) =>
    `<span title="Schritt ${i + 1}" onclick="startTutorial(${i})" style="width:8px;height:8px;border-radius:50%;cursor:pointer;
      background:${i === _tutSchritt ? 'var(--c-primary)' : 'var(--c-border)'}"></span>`).join('');

  openModal(`
    <div class="modal-header">
      <h3>${esc(s.titel)}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Rundgang schließen">×</button>
    </div>
    <div class="modal-body">${s.body}</div>
    <div class="modal-footer">
      <div style="display:flex;align-items:center;gap:6px;margin-right:auto">${punkte}</div>
      <span class="field-hint" style="margin-right:8px">${_tutSchritt + 1} / ${schritte.length}</span>
      ${_tutSchritt > 0 ? '<button class="btn btn-outline" onclick="tutorialPrev()">← Zurück</button>' : ''}
      ${letzter
        ? '<button class="btn btn-primary" onclick="closeModal()">Fertig</button>'
        : '<button class="btn btn-primary" onclick="tutorialNext()">Weiter →</button>'}
    </div>`, true);
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TUT_BEISPIEL };
}
