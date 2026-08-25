/**
 * Admin- & Genehmiger-Sicht
 * =========================
 * - Verwaltung:  Richtlinien-CRUD, Dokumentwähler (ISMS-Bibliothek), Quiz-Editor
 * - Freigaben:   InReview → Veröffentlicht (Genehmiger)
 * - Compliance:  Soll/Ist je Richtlinie (Mitarbeiter aus Graph), CSV-Export
 * - Einstellungen: access-config.json (Admins/Genehmiger)
 */

const AdminState = { members: null, allAcks: null, lastComplianceRows: null };
let _editing = null;          // aktuell bearbeitetes Regelwerk
// Auf-/Zugeklappt-Zustand der Workflow-Abschnitte im Editor (bleibt über Re-Render erhalten)
let _edSecOpen = { pruef: false, frei: false, mit: false, hist: false };
let _adminMode = 'regelwerke'; // 'regelwerke' | 'konzepte' – Umschalter im Regelwerk-Dashboard

// Dokumentart eines Regelwerks – nur als Rückfall. Gepflegt wird sie als Spalte
// der Governance-Struktur (js/govstruktur.js → regelwerkArten()).
const REGELWERK_TYPEN = ['Handbuch', 'Policy', 'Konzernrichtlinie', 'Konzernfachregelung', 'Arbeits-/Prozessanweisung', 'Leitfaden', 'Weitere'];

/** Die Dokumentenarten, wie sie im Editor und im Filter gelten. */
function regelwerkTypen(aktuell) {
  return (typeof regelwerkArten === 'function') ? regelwerkArten(aktuell) : REGELWERK_TYPEN;
}

// Nur als Rückfall, falls die Governance-Struktur (js/govstruktur.js) nicht geladen ist.
const KATEGORIEN_FALLBACK = ['Allgemein', 'Compliance', 'Security / Cyber Security'];

// Standorte für den Geltungsbereich (zentral – auch von den Konzepten genutzt); 'ALLE' = alle Standorte
const STANDORTE = ['HOL', 'SHB', 'WGC', 'SCH', 'EIS', 'DSO', 'ZAI', 'LEG', 'MEG', 'EWA'];

/** Geltungsbereich-Auswahl (Standorte). arr = aktuelles Array; prefix = Handler-Präfix (gb | kgb). */
function renderGeltungsbereichSection(arr, prefix) {
  const list = Array.isArray(arr) ? arr : [];
  const alle = list.includes('ALLE');
  return `
    <div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--c-border)">
      <div style="font-weight:700;font-size:.9rem;margin-bottom:8px">Geltungsbereich (Standorte) <span class="req">*</span></div>
      <label class="ack-check" style="font-weight:600;margin-bottom:6px">
        <input type="checkbox" ${alle ? 'checked' : ''} onchange="gbSectionSetAlle('${prefix}', this.checked)">
        <span>Alle Standorte (konzernweit)</span>
      </label>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:2px 12px${alle ? ';opacity:.45' : ''}">
        ${STANDORTE.map(code => `<label class="ack-check" style="font-weight:500">
          <input type="checkbox" ${(!alle && list.includes(code)) ? 'checked' : ''} ${alle ? 'disabled' : ''}
            onchange="gbSectionToggle('${prefix}','${code}', this.checked)">
          <span>${esc(code)}</span></label>`).join('')}
      </div>
      <span class="field-hint">${alle
        ? 'Einzelne Werke wählbar, sobald „Alle Standorte" abgewählt ist.'
        : 'Pflichtangabe: Für welche Standorte gilt das? „Alle Standorte" schließt alle ein.'}</span>
    </div>`;
}

/** Ziel-Objekt + Re-Render für den Geltungsbereich, je nach Editor
 *  (gb = Regelwerk, kgb = Konzept, lgb = Kachel der Prozesslandkarte).
 *  Eine Auswahl für alle drei – der Geltungsbereich soll überall dasselbe heißen. */
function _gbScope(scope) {
  if (scope === 'kgb') return {
    obj: (typeof _kEditing !== 'undefined' ? _kEditing : null),
    render: (typeof renderKonzeptEditor === 'function' ? renderKonzeptEditor : null),
  };
  if (scope === 'lgb') return {
    obj: (typeof _lkEditing !== 'undefined' ? _lkEditing : null),
    render: (typeof renderLkEditor === 'function' ? renderLkEditor : null),
  };
  return { obj: (typeof _editing !== 'undefined' ? _editing : null), render: renderPolicyEditor };
}
function gbSectionSetAlle(scope, on) {
  const s = _gbScope(scope); if (!s.obj) return;
  s.obj.geltungsbereich = on ? ['ALLE'] : [];
  if (scope === 'lgb') s.obj.geltung = s.obj.geltungsbereich;
  if (s.render) s.render();
}
function gbSectionToggle(scope, code, on) {
  const s = _gbScope(scope); if (!s.obj) return;
  if (!Array.isArray(s.obj.geltungsbereich)) s.obj.geltungsbereich = [];
  s.obj.geltungsbereich = s.obj.geltungsbereich.filter(x => x !== code && x !== 'ALLE');
  if (on) s.obj.geltungsbereich.push(code);
  if (scope === 'lgb') s.obj.geltung = s.obj.geltungsbereich;   // Kachel führt das Feld „geltung"
}

/** Anzeige-Text eines Geltungsbereichs für Tags/Listen. */
function geltungsbereichLabel(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.includes('ALLE') ? 'Alle Standorte' : arr.join(', ');
}

/** Felder, deren Änderung protokolliert wird (Feld → Anzeigename). */
const HISTORIE_FELDER = {
  title: 'Titel', beschreibung: 'Beschreibung', kategorie: 'Kategorie',
  regelwerkTyp: 'Dokumentenart', version: 'Version', status: 'Status', pflicht: 'Pflichtlektüre',
  dokumentName: 'Dokument', naechsteReview: 'Nächste Überprüfung',
  wiederholungMonate: 'Wiederholung (Monate)', quizErforderlich: 'Wissenstest',
  geltungsbereich: 'Geltungsbereich', zielgruppen: 'Zielgruppe',
  kbrBetroffen: 'KBR betroffen', mitbestimmungWerke: 'Betroffene Betriebsräte',
  freigabeReihenfolge: 'Reihenfolge Freigabe/Mitbestimmung',
};

/** Wert für die Historie lesbar machen (Arrays, Ja/Nein, Datum, leer). */
function _histWert(feld, v) {
  if (v === undefined || v === null || v === '') return '–';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '–';
  if (feld === 'naechsteReview') return (typeof fmtDate === 'function') ? fmtDate(v) : String(v);
  if (feld === 'freigabeReihenfolge') return v === 'mb_gl' ? 'Mitbestimmung → Freigabe' : 'Freigabe → Mitbestimmung';
  return String(v);
}

/** Geänderte Felder zwischen zwei Ständen ermitteln. @returns ['Titel: „A" → „B"', …] */
function policyDiff(alt, neu) {
  const out = [];
  if (!alt || !neu) return out;
  for (const [feld, label] of Object.entries(HISTORIE_FELDER)) {
    const a = _histWert(feld, alt[feld]), b = _histWert(feld, neu[feld]);
    if (a !== b) out.push(`${label}: „${a}" → „${b}"`);
  }
  return out;
}

/** Historien-Eintrag anhängen (mutiert p.historie). */
function historieAdd(p, aktion, text) {
  if (!p) return;
  if (!Array.isArray(p.historie)) p.historie = [];
  const u = (typeof State !== 'undefined' && State.user) ? State.user : {};
  p.historie.push({
    datum: new Date().toISOString(),
    upn: u.upn || '', name: u.name || u.upn || '',
    aktion: aktion || 'Änderung',
    text: text || '',
  });
  return p.historie[p.historie.length - 1];
}

/** Historie im Editor – ausklappbarer, schreibgeschützter Abschnitt (neueste zuerst). */
/** Historie eines Regelwerks – inklusive der Freigaben, die in Outlook erteilt wurden.
 *  Der Power-Automate-Flow schreibt nur „FreigegebenVon" und den Status in die Liste;
 *  ohne diese Ergänzung fehlte ausgerechnet der letzte Schritt in der Historie.
 *  Rein anzeigend: In die Liste geschrieben wird dabei nichts. */
function historieMitOutlookFreigabe(p) {
  const h = Array.isArray(p && p.historie) ? p.historie.slice() : [];
  if (!p || !p.freigegebenVon) return h;
  if ((p.freigaben || []).length) return h;                       // in der App freigegeben
  if (h.some(e => /freigabe/i.test(e.aktion || ''))) return h;    // schon protokolliert
  h.push({
    datum: p.veroeffentlichtAm || '',
    name: p.freigegebenVon, upn: '',
    aktion: 'Freigabe erteilt (Outlook / Power Automate)',
    text: 'Per Genehmigungs-Mail in Outlook freigegeben. In der Liste steht dazu „Freigegeben von" '
      + 'und der Veröffentlichungszeitpunkt; im Audit Report erscheint dasselbe Ereignis.',
  });
  return h;
}

function renderHistorieSection(p) {
  const h = historieMitOutlookFreigabe(p);
  const badge = _edBadge(h.length ? `${h.length} Einträge` : 'noch keine', h.length ? 'custom' : 'off');
  const inner = !h.length
    ? '<div class="field-hint">Noch keine Änderungen protokolliert. Ab jetzt wird jede Änderung mit Zeitpunkt und Person festgehalten.</div>'
    : `<div style="max-height:280px;overflow:auto">${h.slice().reverse().map(e => `
        <div style="padding:7px 0;border-bottom:1px solid var(--c-border-2)">
          <div style="font-size:.83rem"><b>${esc(e.aktion || 'Änderung')}</b>
            <span style="color:var(--c-muted)"> · ${esc(e.name || e.upn || 'unbekannt')} · ${typeof fmtDateTime === 'function' ? fmtDateTime(e.datum) : esc(e.datum || '')}</span></div>
          ${e.text ? `<div style="font-size:.8rem;color:var(--c-muted);line-height:1.5;margin-top:2px;white-space:pre-wrap">${esc(e.text)}</div>` : ''}
        </div>`).join('')}</div>
      <div class="field-hint" style="margin-top:8px">Älteste Einträge werden nach ${typeof HISTORIE_MAX !== 'undefined' ? HISTORIE_MAX : 200} Einträgen automatisch verdrängt.</div>`;
  return _edCollapsible('hist', 'Änderungshistorie', badge, inner, '');
}

// Muster-Vorlage für komplett neue Regelwerke (Legal, „Erstellung von Konzernregelungen")
// Muster-Vorlage: Der Ordner, nicht die einzelne Datei – der alte
// Direktlink auf die Datei war nicht mehr erreichbar, der Ordner überlebt
// auch die nächste Fassung.
const MUSTER_VORLAGE_URL = 'https://dihag.sharepoint.com/:f:/r/sites/ArbeitsplatzLegal/Freigegebene%20Dokumente/010_Corporate%20Governance-Board/01_Konzernregelwerk/00_Allgemein/03_Muster_Erstellung%20von%20Konzernregelungen?d=we72ba6ec15c54f088689ffa73ea9261c&csf=1&web=1&e=sCYaiX';

/** Einstieg „+ Neues Regelwerk": komplett neue Regelwerke sollen zuerst als Konzept an die GF.
 *  Bietet Konzept erstellen (empfohlen) · Direkt anlegen (Migration/Bestand) · Abbrechen. */
function newRegelwerkGate() {
  if (typeof canWriteTab === 'function' && !canWriteTab('verwaltung')) { toast('Nur Lesezugriff auf „Regelwerk Dashboard".', 'error'); return; }
  openModal(`
    <div class="modal-header"><h3>Neues Regelwerk</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p style="line-height:1.55;margin:0 0 10px">Komplett <b>neue</b> Regelwerke müssen zuerst als <b>Konzept</b> an die Geschäftsleitung (Beantragung &amp; Prüfung). Erst nach Annahme entsteht daraus ein Regelwerk-Entwurf.</p>
      <p style="margin:0 0 10px"><a href="${esc(MUSTER_VORLAGE_URL)}" target="_blank" rel="noopener" style="color:var(--c-primary);font-weight:600;text-decoration:none">📁 Muster-Vorlage „Erstellung von Konzernregelungen" öffnen →</a></p>
      <p class="field-hint" style="margin:0">„Direkt anlegen" nur für <b>bestehende</b> Dokumente / Migration verwenden.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-ghost" onclick="closeModal();openPolicyEditor()">Direkt anlegen</button>
      <button class="btn btn-primary" onclick="closeModal();_adminMode='konzepte';if(typeof openKonzeptEditor==='function')openKonzeptEditor()">💡 Konzept erstellen</button>
    </div>`, false);
}
let _dpDrives = null;         // ISMS-Bibliotheken (Cache)
let _dpState = null;          // Dokumentwähler-Navigation

function setAdminMode(mode) {
  _adminMode = (mode === 'konzepte') ? 'konzepte' : 'regelwerke';
  renderAdminList();
}

/** Segmentierter Umschalter Regelwerke ↔ Konzepte (mit Zählern). */
function _adminModeBar() {
  const seg = (m, label, count) => {
    const on = _adminMode === m;
    return `<button type="button" onclick="setAdminMode('${m}')" style="border:0;padding:8px 18px;font:inherit;font-weight:600;font-size:.85rem;cursor:pointer;background:${on ? 'var(--c-primary)' : 'transparent'};color:${on ? '#fff' : 'var(--c-text)'}">${label} <span style="opacity:.85;font-weight:500">${count}</span></button>`;
  };
  const nKon = (State.konzepte || []).length;
  return `<div style="display:inline-flex;border:1px solid var(--c-border);border-radius:9px;overflow:hidden;margin-bottom:14px">
    ${seg('regelwerke', 'Regelwerke', (State.policies || []).length)}${seg('konzepte', '💡 Konzepte', nKon)}</div>`;
}

/** Typ-/Standort-Filter befüllen (nur real vorkommende Werte); Auswahl bleibt erhalten. */
function _fillAdminFilters() {
  const typEl = document.getElementById('filter-admin-typ');
  const stdEl = document.getElementById('filter-admin-standort');
  const alle = [...(State.policies || []), ...(State.konzepte || [])];
  if (typEl) {
    const prev = typEl.value;
    const bekannt = regelwerkTypen();
    const vorhanden = [...new Set(alle.map(p => p.regelwerkTyp).filter(Boolean))];
    const typen = bekannt.filter(t => vorhanden.includes(t))
      .concat(vorhanden.filter(t => !bekannt.includes(t)));   // Altbestand hinten anhängen
    typEl.innerHTML = '<option value="">Alle Typen</option>' +
      typen.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    if (prev && typen.includes(prev)) typEl.value = prev;
    typEl.style.display = typen.length ? '' : 'none';
  }
  if (stdEl) {
    const prev = stdEl.value;
    const codes = (typeof STANDORTE !== 'undefined' ? STANDORTE : [])
      .filter(c => (State.policies || []).some(p => Array.isArray(p.geltungsbereich) && p.geltungsbereich.includes(c)));
    stdEl.innerHTML = '<option value="">Alle Standorte</option>' +
      codes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (prev && codes.includes(prev)) stdEl.value = prev;
    stdEl.dataset.leer = codes.length ? '' : '1';
  }
}

/** Volltextsuche über ein Regelwerk: Titel, Beschreibung, Kategorie, Typ, Standorte,
 *  Version, Dokumentname, Zielgruppen und Normbezug. */
function policyMatchesQuery(p, q) {
  if (!q) return true;
  const teile = [
    p.title, p.beschreibung, p.kategorie, p.regelwerkTyp, p.version, p.dokumentName,
    Array.isArray(p.geltungsbereich) ? geltungsbereichLabel(p.geltungsbereich) : '',
    Array.isArray(p.zielgruppen) ? p.zielgruppen.join(' ') : '',
    Array.isArray(p.normbezug) ? p.normbezug.join(' ') : '',
  ];
  return teile.join(' ').toLowerCase().includes(q);
}

/* ═══════════════════════════════════════════════════
   Wie führt man ein Regelwerk ein?
   ═══════════════════════════════════════════════════
   Die Reihenfolge steht in der Dokumentation – nur liest die niemand, während
   er gerade vor dem Dashboard sitzt. Deshalb hier eine Kurzfassung direkt über
   der Liste: eingeklappt eine Zeile, aufgeklappt sechs Schritte mit dem, was
   jeweils zu tun ist und wer entscheidet. Die Wahl merkt sich der Browser. */

/* Die Stationen als Objekte: Zwei Eigenheiten des Ablaufs lassen sich sonst
   nicht abbilden – die Mitbestimmung findet nur statt, wenn der Betriebsrat
   wirklich zu beteiligen ist, und ihre Reihenfolge zur Freigabe ist je
   Regelwerk umstellbar. Beides stand bisher nur im Fließtext. */
const RW_SCHRITTE = [
  {
    kurz: 'Konzept', was: 'Idee einreichen', wer: 'Sie',
    text: 'Neue Regelwerke starten als Konzept: Arbeitstitel, Dokumentart, Geltungsbereich und die Frage <i>Warum?</i>, dazu optional eine Skizze als Anhang. Einreichen geht an die Geschäftsleitung.',
  },
  {
    kurz: 'Konzept-Entscheidung', was: 'Annehmen oder nicht', wer: 'GL',
    text: 'Die Geschäftsleitung entscheidet über Priorität und Umsetzung – <b>Annehmen</b>, <b>Zurückstellen</b> oder <b>Ablehnen</b> (mit Begründung), direkt aus der E-Mail. Bei Annahme entsteht automatisch ein Regelwerk-Entwurf; die einreichende Person wird informiert und entscheidet, wie es weitergeht.',
  },
  {
    kurz: 'Entwurf', was: 'Ausarbeiten', wer: 'Sie',
    text: 'Dokument anhängen, Zielgruppe, Pflichtlektüre, Wissenstest, Wiedervorlage und – falls betroffen – den zuständigen Betriebsrat festlegen. Wer schon alles beisammen hat, überspringt das und gibt den Entwurf direkt weiter.',
  },
  {
    kurz: 'Prüfung', was: 'Konformität', wer: 'Prüfer',
    text: 'Mit „Zur Konformitätsprüfung" geht das Regelwerk an die hinterlegten Prüfer. Sie entscheiden aus der E-Mail heraus; „nicht konform" verlangt eine Begründung.',
  },
  {
    kurz: 'Mitbestimmung', was: 'Betriebsrat', wer: 'KBR / BR',
    bedingt: true, tauschbar: true,
    text: 'Diese Station gibt es <b>nur, wenn die Mitbestimmung betroffen ist</b>. Ob das so ist, legen Sie im Editor des Regelwerks fest: Konzernbetriebsrat und/oder Betriebsräte einzelner Werke ankreuzen. Ist nichts angekreuzt, entfällt der Schritt und es geht direkt zur Freigabe.',
  },
  {
    kurz: 'Freigabe', was: 'Geschäftsleitung', wer: 'GL',
    tauschbar: true,
    text: 'Zum Schluss gibt die Geschäftsleitung frei. In der E-Mail steht, wer vorher bereits zugestimmt hat.',
  },
  {
    kurz: 'Veröffentlicht', was: 'Kenntnisnahme', wer: 'Zielgruppe',
    text: 'Das Regelwerk erscheint <b>nur bei den ausgewählten Mitarbeitenden</b> – bestimmt durch Zielgruppe (Rollen/Abteilungen) und Geltungsbereich (Standorte). Erinnerungen laufen automatisch; die Quote und die Änderungshistorie – vom Konzept an – sind der Nachweis fürs Audit.',
  },
];

function rwSchritteOffen() {
  try { return localStorage.getItem('rms_rw_schritte') === 'auf'; } catch (e) { return false; }
}

function rwSchritteToggle() {
  try { localStorage.setItem('rms_rw_schritte', rwSchritteOffen() ? 'zu' : 'auf'); } catch (e) { /* egal */ }
  renderRwSchritte();
}

function renderRwSchritte() {
  const host = document.getElementById('rw-schritte');
  if (!host) return;
  const auf = rwSchritteOffen();

  // Kette: bedingte Station gestrichelt, tauschbare Nachbarn mit ⇄ statt →
  const kette = RW_SCHRITTE.map((s, i) => {
    const trenner = i === 0 ? '' : (RW_SCHRITTE[i - 1].tauschbar && s.tauschbar
      ? '<span class="rw-pfeil" title="Reihenfolge je Regelwerk umstellbar">⇄</span>'
      : '<span class="rw-pfeil">→</span>');
    return trenner + `<span class="rw-chip${s.bedingt ? ' rw-chip-bedingt' : ''}"
      title="${s.bedingt ? 'Nur wenn die Mitbestimmung betroffen ist' : esc(s.was)}"><b>${i + 1}</b> ${esc(s.kurz)}</span>`;
  }).join('');

  const marke = (text, art) =>
    `<span class="rw-marke rw-marke-${art}">${text}</span>`;

  host.innerHTML = `
    <div class="rw-schritte${auf ? ' auf' : ''}">
      <button class="rw-kopf" onclick="rwSchritteToggle()" aria-expanded="${auf}">
        <span class="rw-caret">${auf ? '▾' : '▸'}</span>
        <b>So wird ein Regelwerk eingeführt</b>
        <span class="rw-kette">${kette}</span>
      </button>
      ${auf ? `<ol class="rw-liste">
        ${RW_SCHRITTE.map(s => `
          <li>
            <div class="rw-zeile"><b>${esc(s.kurz)} – ${esc(s.was)}</b>
              ${s.bedingt ? marke('nur wenn betroffen', 'bedingt') : ''}
              ${s.tauschbar ? marke('⇄ Reihenfolge umstellbar', 'tausch') : ''}
              <span class="rw-wer">${esc(s.wer)}</span></div>
            <div class="rw-text">${s.text}</div>
          </li>`).join('')}
      </ol>
      <div class="rw-fuss">
        <b>⇄</b> Mitbestimmung und Freigabe lassen sich je Regelwerk tauschen – im Editor unter
        „Freigabe/Mitbestimmung". <b>Gestrichelt</b> = Station findet nur statt, wenn ein Betriebsrat
        zu beteiligen ist. Ausführlich im Reiter <b>Dokumentation</b>.</div>` : ''}
    </div>`;
}

/* Die Spaltenliste kommt beim Start nebenher (sharepoint.js). Trifft sie erst
   ein, wenn das Dashboard schon offen ist, wird einmal neu gezeichnet – sonst
   fehlte die Warnung über fehlende SharePoint-Spalten. */
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('rms-spalten-geladen', () => {
    if (document.getElementById('view-verwaltung')?.classList.contains('active')) renderAdminList();
  });
}

function renderAdminList() {
  renderRwSchritte();
  const list = document.getElementById('list-admin');
  if (!list) return;
  // Nur-Lese-Zugriff (Reiter-Berechtigung): Anlegen ausblenden, Hinweis zeigen.
  const readOnly = typeof isReadOnlyTab === 'function' && isReadOnlyTab('verwaltung');
  const newBtn = document.getElementById('btn-new-policy');
  const konzeptBtn = document.getElementById('btn-new-konzept');
  const importBtn = document.getElementById('btn-import-policy');
  const filterEl = document.getElementById('filter-admin');
  const typEl = document.getElementById('filter-admin-typ');
  const stdEl = document.getElementById('filter-admin-standort');
  const healthBtn = document.getElementById('btn-health');
  if (newBtn) newBtn.style.display = readOnly ? 'none' : '';
  if (konzeptBtn) konzeptBtn.style.display = readOnly ? 'none' : '';
  // Import nur im Regelwerk-Modus (Konzepte werden nicht aus Dateien importiert)
  if (importBtn) importBtn.style.display = (readOnly || _adminMode === 'konzepte') ? 'none' : '';
  const roBanner = readOnly ? `<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf „Regelwerk Dashboard" – Anlegen und Bearbeiten sind gesperrt.</div>` : '';
  const _colBanner = (liste, miss) => miss.length ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ In der SharePoint-Liste „${liste}" fehlen ${miss.length} Spalte(n).</b> Werte dieser Felder werden beim Speichern <b>verworfen</b> (bei „Richtlinien" bleibt z. B. die Dokumentzuordnung nicht erhalten; bei „Bestaetigungen" scheitert die Kenntnisnahme/Quiz).<br>
      Bitte in SharePoint anlegen: ${miss.map(c => `<b>${esc(c.name)}</b> <span style="opacity:.75">(${esc(c.typ)})</span>`).join(' · ')}
    </div>` : '';
  // Ein abgeschnittenes Sammelfeld sieht man den Regelwerken nicht an: Alles wirkt
  // normal, nur Lernvideos und Ein-Klick-Links fehlen. Deshalb ausdrücklich melden.
  const djKaputt = (typeof spDatenJsonDefekt === 'function') ? spDatenJsonDefekt() : 0;
  const djBanner = djKaputt ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ Das Sammelfeld „DatenJson" ist bei ${djKaputt} Regelwerk(en) nicht lesbar.</b>
      Der Inhalt ist vermutlich abgeschnitten – das passiert, wenn die Spalte als
      <b>„Einzelne Textzeile"</b> angelegt wurde. Betroffen sind Felder ohne eigene Spalte:
      <b>Lernvideos</b>, der <b>Ein-Klick-Link</b> aus den Freigabe-Mails und der Vermerk der
      <b>Bekanntgabe</b>.<br>
      Bitte die Spalte in SharePoint auf <b>„Mehrere Zeilen Text"</b> umstellen (Nur-Text, ohne
      Versionierung) und die betroffenen Regelwerke einmal speichern.
    </div>` : '';
  const warn = roBanner + djBanner +
    _colBanner('Richtlinien', (typeof spMissingPolicyColumns === 'function') ? spMissingPolicyColumns() : []) +
    _colBanner('Bestaetigungen', (typeof spMissingAckColumns === 'function') ? spMissingAckColumns() : []);
  const q = (document.getElementById('search-admin')?.value || '').toLowerCase().trim();
  const modeBar = _adminModeBar();

  _fillAdminFilters();

  // Konzept-Modus: Status-Filter/Dokumentprüfung ausblenden, an konzepte.js delegieren.
  if (_adminMode === 'konzepte') {
    if (filterEl) filterEl.style.display = 'none';
    if (healthBtn) healthBtn.style.display = 'none';
    if (stdEl) stdEl.style.display = 'none';
    const inner = (typeof renderKonzeptCards === 'function') ? renderKonzeptCards(q, typEl?.value || '') : '';
    list.innerHTML = warn + modeBar + inner;
    return;
  }
  if (filterEl) filterEl.style.display = '';
  if (healthBtn) healthBtn.style.display = '';
  if (stdEl) stdEl.style.display = '';

  const f = filterEl?.value || 'all';
  const fTyp = typEl?.value || '';
  const fStd = stdEl?.value || '';
  let rows = State.policies.slice();
  if (f !== 'all') rows = rows.filter(p => p.status === f);
  if (fTyp) rows = rows.filter(p => (p.regelwerkTyp || '') === fTyp);
  // „Alle Standorte" (ALLE) gilt konzernweit ⇒ zählt bei jedem Standortfilter mit
  if (fStd) rows = rows.filter(p => Array.isArray(p.geltungsbereich) && (p.geltungsbereich.includes(fStd) || p.geltungsbereich.includes('ALLE')));
  if (q) rows = rows.filter(p => policyMatchesQuery(p, q));
  rows.sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));

  const aktiveFilter = (f !== 'all' || fTyp || fStd || q);
  if (!rows.length) {
    list.innerHTML = warn + modeBar + emptyState(
      aktiveFilter ? 'Keine Treffer für die aktuellen Filter.' : 'Keine Regelwerke. Lege oben eines neu an.',
      aktiveFilter ? '🔍' : '📄');
    return;
  }

  list.innerHTML = warn + modeBar + rows.map(p => `
    <div class="item-card" onclick="openPolicyEditor('${p.id}')">
      <div class="ic-top">
        <div class="ic-title">${esc(p.title)}</div>
        <div class="ic-topright">${typeof healthBadge === 'function' ? healthBadge(p) : ''}${workflowBadge(p.status)}</div>
      </div>
      <div class="ic-tags">
        ${p.regelwerkTyp ? `<span class="ic-tag" style="background:#eef2ff;color:#3730a3">${esc(p.regelwerkTyp)}</span>` : ''}
        ${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}
        ${(p.geltungsbereich && p.geltungsbereich.length) ? `<span class="ic-tag">📍 ${esc(geltungsbereichLabel(p.geltungsbereich))}</span>` : ''}
        <span class="ic-tag">v${esc(p.version)}</span>
        ${p.pflicht ? '<span class="ic-tag">Pflicht</span>' : '<span class="ic-tag">optional</span>'}
        ${p.quizErforderlich ? `<span class="ic-tag">📝 ${p.quiz.length} Fragen</span>` : ''}
        <span class="ic-tag">👥 ${(p.zielgruppen && p.zielgruppen.length && !p.zielgruppen.includes('ALLE')) ? esc(p.zielgruppen.join(', ')) : 'Alle'}</span>
        ${p.wiederholungMonate ? `<span class="ic-tag">↻ ${p.wiederholungMonate == 12 ? 'jährlich' : 'alle ' + p.wiederholungMonate + ' Mon.'}</span>` : ''}
        ${p.naechsteReview ? `<span class="ic-tag" style="${new Date(p.naechsteReview) < new Date() ? 'background:#fef2f2;color:#b91c1c' : ''}">🔎 Review ${fmtDate(p.naechsteReview)}</span>` : ''}
        ${(p.normbezug && p.normbezug.length) ? `<span class="ic-tag" title="${esc(p.normbezug.map(id => typeof normLabel === 'function' ? normLabel(id) : id).join(' · '))}">🔖 ${p.normbezug.length} Controls</span>` : ''}
        ${(typeof policyHasPrueferOverride === 'function' && policyHasPrueferOverride(p)) ? `<span class="ic-tag" title="Eigene Konformitätsprüfer: ${esc((p.pruefKonfig.pruefer || []).join(', '))}">👤 eigene Prüfer</span>` : ''}
        ${(typeof policyHasFreigabeOverride === 'function' && policyHasFreigabeOverride(p)) ? `<span class="ic-tag" title="Eigene Freigeber: ${esc((p.freigabeKonfig.freigeber || []).join(', '))}">👤 eigene Freigeber</span>` : ''}
      </div>
      <div class="ic-footer">
        <span class="grow">${p.dokumentName ? ('📄 ' + esc(p.dokumentName)) : '<span style="color:#b45309">⚠ kein Dokument</span>'}</span>
        <span>geändert ${fmtDate(p.modifiedAt)}</span>
      </div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════════
   Verwaltung: Editor
═══════════════════════════════════════════════════ */

/* ── Import: Word/PDF (einzeln & mehrere) → Entwurfs-Richtlinien ── */
function openImportDialog() {
  openModal(`
    <div class="modal-header"><h3>Richtlinien importieren</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">Word-/PDF-Dateien (auch mehrere) hierher ziehen oder auswählen. Pro Datei wird eine <b>Entwurfs</b>-Richtlinie angelegt (Titel aus dem Dateinamen). Danach im Editor ergänzen und „Zur Konformitätsprüfung" schicken.</div>
      <div id="import-drop" style="border:2px dashed var(--c-border);border-radius:10px;padding:30px 16px;text-align:center;cursor:pointer;color:var(--c-muted)">
        📥 <b>Dateien hierher ziehen</b><br><span style="font-size:.8rem">oder klicken zum Auswählen</span>
      </div>
      <input type="file" id="import-input" multiple accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx" style="display:none">
      <div id="import-log" style="margin-top:12px;font-size:.85rem;max-height:200px;overflow:auto"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Schließen</button></div>`);
  const drop = document.getElementById('import-drop');
  const input = document.getElementById('import-input');
  drop.onclick = () => input.click();
  input.onchange = () => importPolicyFiles(input.files);
  drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--c-primary)'; drop.style.background = 'var(--c-primary-l)'; };
  drop.ondragleave = () => { drop.style.borderColor = 'var(--c-border)'; drop.style.background = ''; };
  drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--c-border)'; drop.style.background = ''; importPolicyFiles(e.dataTransfer.files); };
}

async function importPolicyFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const log = document.getElementById('import-log');
  let ok = 0;
  for (const f of files) {
    const row = document.createElement('div');
    if (log) { row.textContent = '⏳ ' + f.name + ' …'; log.appendChild(row); }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await spUploadPolicyDoc(f.name, bytes, f.type);
      const p = newPolicy();
      p.title = f.name.replace(/\.[^.]+$/, '');
      p.dokumentUrl = doc.url; p.dokumentName = doc.name; p.dokumentDriveId = doc.driveId; p.dokumentItemId = doc.itemId;
      await spSavePolicy(p);
      ok++;
      if (row) { row.style.color = '#15803d'; row.textContent = '✓ ' + f.name + ' → Entwurf angelegt'; }
    } catch (e) {
      if (row) { row.style.color = '#b91c1c'; row.textContent = '✗ ' + f.name + ': ' + e.message; }
    }
  }
  if (ok) {
    await reloadData();
    renderAdminList();
    toast(`${ok} Richtlinie(n) als Entwurf importiert ✓`, 'success');
  }
}

/** Upload aus dem Editor: öffnet IMMER den Zielordner-Wähler (mit Versions-Shortcut). */
async function uploadPolicyDocFromEditor(file) {
  if (!file || !_editing) return;
  openFolderPickerForUpload(file);
}

/* ── Zielordner-Wähler für den Upload ── */
let _fpState = null, _fpFile = null, _fpDrives = null;

async function openFolderPickerForUpload(file) {
  _fpFile = file;
  _fpState = { driveId: null, driveName: '', path: [], items: [] };
  pickerMount(fpShell('<div class="doc-loading">Bibliotheken werden geladen …</div>'));
  try {
    if (!_fpDrives) {
      const isms = await spListIsmsDrives().catch(() => []);
      const app = await spListAppDrives().catch(() => []);
      _fpDrives = [
        ...isms.map(d => ({ id: d.id, name: 'ISMS · ' + d.name })),
        ...app.map(d => ({ id: d.id, name: 'Intern · ' + d.name })),
      ];
    }
    renderFolderPicker();
  } catch (e) {
    const b = document.getElementById('fp-body');
    if (b) b.innerHTML = `<div class="col-warning" style="display:block">Bibliotheken nicht ladbar: ${esc(e.message)}</div>`;
  }
}

function fpShell(inner) {
  return `
    <div class="modal-header"><h3>Zielordner wählen${_fpFile ? ' – „' + esc(_fpFile.name) + '"' : ''}</h3><button class="modal-close" onclick="pickerClose()">×</button></div>
    <div class="modal-body" id="fp-body">${inner}</div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="pickerClose()">Abbrechen</button></div>`;
}

async function renderFolderPicker() {
  const body = document.getElementById('fp-body');
  if (!body) return;
  let items;
  try {
    if (!_fpState.driveId) items = (_fpDrives || []).map(d => ({ id: d.id, name: d.name, isFolder: true, isDrive: true }));
    else { body.innerHTML = '<div class="doc-loading">Lädt …</div>'; const last = _fpState.path[_fpState.path.length - 1]; items = await spBrowseAnyDrive(_fpState.driveId, last ? last.id : null); }
  } catch (e) { body.innerHTML = `<div class="col-warning" style="display:block">Ordner nicht ladbar: ${esc(e.message)}</div>`; return; }
  _fpState.items = items;
  let crumbs = `<a data-fp="-1">Bibliotheken</a>`;
  if (_fpState.driveId) { crumbs += ` › <a data-fp="-2">${esc(_fpState.driveName)}</a>`; _fpState.path.forEach((f, i) => crumbs += ` › <a data-fp="${i}">${esc(f.name)}</a>`); }
  const rows = items.length ? items.map((it, idx) => it.isFolder
    ? `<div class="dp-row folder" data-fpopen="${idx}"><span class="ic">📁</span><span class="nm">${esc(it.name)}</span><span class="field-hint">${it.isDrive ? 'Bibliothek' : 'öffnen'}</span></div>`
    : `<div class="dp-row" style="opacity:.45;cursor:default"><span class="ic">📄</span><span class="nm">${esc(it.name)}</span></div>`
  ).join('') : '<div class="doc-loading">Dieser Ordner ist leer.</div>';
  const uploadBtn = _fpState.driveId
    ? `<button class="btn btn-primary btn-sm" onclick="doFolderUpload()">📥 Hierher hochladen</button>`
    : `<span class="field-hint">Bitte zuerst eine Bibliothek öffnen.</span>`;
  const versionShortcut = (_editing && _editing.dokumentDriveId && _editing.dokumentItemId)
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 10px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
         <span class="field-hint" style="flex:1">Es ist bereits ein Dokument zugeordnet (<b>${esc(_editing.dokumentName || '')}</b>). Sie können die Datei als <b>neue Version</b> am bisherigen Speicherort ablegen — dann bleibt der Versionsverlauf erhalten.</span>
         <button class="btn btn-success btn-sm" onclick="doUploadAsVersion()">↻ Als neue Version</button></div>`
    : '';
  body.innerHTML = `${versionShortcut}<div class="dp-crumbs">${crumbs}</div>
    <div style="display:flex;align-items:center;gap:8px;margin:6px 0 10px">
      <span class="field-hint" style="flex:1">Neuer Speicherort: <b>${esc(_fpState.path.map(p => p.name).join(' / ') || _fpState.driveName || '–')}</b></span>${uploadBtn}</div>
    <div class="dp-list">${rows}</div>`;
  body.querySelector('.dp-list')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const r = e.target.closest('[data-fpopen]'); if (r) fpOpen(+r.dataset.fpopen); });
  body.querySelector('.dp-crumbs')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const a = e.target.closest('[data-fp]'); if (a) fpCrumb(+a.dataset.fp); });
}

function fpOpen(idx) {
  const it = _fpState.items[idx];
  if (!it) return;
  if (it.isDrive) { _fpState.driveId = it.id; _fpState.driveName = it.name; _fpState.path = []; }
  else { _fpState.path.push({ id: it.id, name: it.name }); }
  renderFolderPicker();
}
function fpCrumb(i) {
  if (i === -1) { _fpState.driveId = null; _fpState.driveName = ''; _fpState.path = []; }
  else if (i === -2) { _fpState.path = []; }
  else { _fpState.path = _fpState.path.slice(0, i + 1); }
  renderFolderPicker();
}

async function doFolderUpload() {
  if (!_fpFile || !_editing || !_fpState.driveId) { pickerClose(); return; }
  const last = _fpState.path[_fpState.path.length - 1];
  const body = document.getElementById('fp-body');
  if (body) body.innerHTML = '<div class="doc-loading">Lädt hoch …</div>';
  try {
    const bytes = new Uint8Array(await _fpFile.arrayBuffer());
    const doc = await spUploadToFolder(_fpState.driveId, last ? last.id : null, _fpFile.name, bytes, _fpFile.type);
    _editing.dokumentDriveId = _fpState.driveId;
    _editing.dokumentItemId = doc.id;
    _editing.dokumentName = doc.name;
    _editing.dokumentUrl = doc.webUrl || '';
    pickerClose();
    const disp = document.getElementById('ed-doc-display');
    if (disp) { disp.innerHTML = '📄 ' + esc(doc.name); disp.classList.remove('doc-chip-empty'); }
    toast('Hochgeladen ✓', 'success');
  } catch (e) { toast('Upload fehlgeschlagen: ' + e.message, 'error'); pickerClose(); }
}

/** Datei als neue Version des bereits zugeordneten Dokuments hochladen (gleicher Ort). */
async function doUploadAsVersion() {
  if (!_fpFile || !_editing || !_editing.dokumentDriveId || !_editing.dokumentItemId) { pickerClose(); return; }
  const body = document.getElementById('fp-body');
  if (body) body.innerHTML = '<div class="doc-loading">Neue Version wird hochgeladen …</div>';
  try {
    const bytes = new Uint8Array(await _fpFile.arrayBuffer());
    const res = await spReplaceDocContent(_editing.dokumentDriveId, _editing.dokumentItemId, bytes, _fpFile.type);
    _editing.dokumentName = res.name || _editing.dokumentName;
    _editing.dokumentUrl = res.webUrl || _editing.dokumentUrl;
    pickerClose();
    const disp = document.getElementById('ed-doc-display');
    if (disp) { disp.innerHTML = '📄 ' + esc(_editing.dokumentName); disp.classList.remove('doc-chip-empty'); }
    toast('Neue Version hochgeladen ✓ (in SharePoint versioniert)', 'success');
  } catch (e) { toast('Upload fehlgeschlagen: ' + e.message, 'error'); pickerClose(); }
}

/** Versionsverlauf des zugeordneten Dokuments anzeigen. */
async function openDocVersions() {
  if (!_editing || !_editing.dokumentDriveId || !_editing.dokumentItemId) { toast('Diesem Eintrag ist noch kein Dokument zugeordnet.', 'error'); return; }
  pickerMount(`
    <div class="modal-header"><h3>🕘 Versionsverlauf – ${esc(_editing.dokumentName || 'Dokument')}</h3><button class="modal-close" onclick="pickerClose()">×</button></div>
    <div class="modal-body" id="ver-body"><div class="doc-loading">Versionen werden geladen …</div></div>
    <div class="modal-footer">
      ${_editing.dokumentUrl ? `<a class="btn btn-outline btn-sm" href="${esc(_editing.dokumentUrl)}" target="_blank" rel="noopener">In SharePoint öffnen</a>` : ''}
      <button class="btn btn-ghost" onclick="pickerClose()">Schließen</button>
    </div>`);
  try {
    const vers = await spGetDocVersions(_editing.dokumentDriveId, _editing.dokumentItemId);
    const body = document.getElementById('ver-body');
    if (!body) return;
    if (!vers.length) { body.innerHTML = emptyState('Keine Versionen gefunden. (Versionsverlauf ist evtl. in der Bibliothek deaktiviert.)'); return; }
    body.innerHTML = `
      <p class="field-hint" style="margin:0 0 10px">SharePoint führt bei jedem Hochladen am gleichen Speicherort automatisch eine neue Version. Neueste zuerst:</p>
      <table class="tbl">
        <thead><tr><th>Version</th><th>Geändert am</th><th>Geändert von</th><th class="num">Größe</th><th></th></tr></thead>
        <tbody>${vers.map((v, i) => `
          <tr>
            <td><b>${esc(v.id)}</b>${i === 0 ? ' <span style="font-size:.68rem;font-weight:700;background:#dcfce7;color:#15803d;border-radius:4px;padding:1px 6px;margin-left:4px">aktuell</span>' : ''}</td>
            <td>${fmtDateTime(v.modified)}</td>
            <td>${esc(v.by || '–')}</td>
            <td class="num">${v.size ? Math.max(1, Math.round(v.size / 1024)) + ' KB' : '–'}</td>
            <td class="num">${v.url ? `<a class="btn btn-ghost btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">Ansehen</a>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>`;
  } catch (e) {
    const body = document.getElementById('ver-body');
    if (body) body.innerHTML = `<div class="col-warning" style="display:block">Versionen nicht ladbar: ${esc(e.message)}</div>`;
  }
}

/* ── Richtliniendokument direkt bearbeiten (On-Premise Office / Browser), wie bei ISMS-Dokumenten ── */


/** Zugeordnetes Dokument im Desktop-Office öffnen (speichert automatisch eine neue Version). */
async function policyEditOffice() {
  if (!_editing || !_editing.dokumentDriveId || !_editing.dokumentItemId) { toast('Diesem Eintrag ist noch kein Dokument zugeordnet.', 'error'); return; }
  const scheme = officeScheme(_editing.dokumentName);
  if (!scheme) { policyEditWeb(); return; }
  toast('Datei-URL wird ermittelt …');
  let fileUrl = '';
  try { fileUrl = await spGetDirectFileUrl(_editing.dokumentDriveId, _editing.dokumentItemId); } catch (e) { fileUrl = ''; }
  if (fileUrl) {
    window.location.href = `${scheme}:ofe|u|${fileUrl}`;
    toast('Öffne in Office … Öffnet sich nichts? „🌐 Im Browser bearbeiten" nutzen.');
  } else {
    policyEditWeb();
  }
}

/** Zugeordnetes Dokument in Office für das Web öffnen (Bearbeitungsmodus, neuer Tab). */
function policyEditWeb() {
  if (!_editing || !_editing.dokumentUrl) { toast('Keine Datei-URL verfügbar.', 'error'); return; }
  let u = _editing.dokumentUrl;
  if (/Doc\.aspx/i.test(u)) {
    u = u.replace(/([?&])action=[^&]*/i, '$1action=edit');
    if (!/[?&]action=/i.test(u)) u += (u.includes('?') ? '&' : '?') + 'action=edit';
  }
  window.open(u, '_blank', 'noopener');
  toast('Öffne im Browser-Office … Beim Speichern entsteht automatisch eine neue Version.');
}

/* ── Richtliniendokument aus einer Karte öffnen (Prüfung/Freigabe) – per Policy-ID ── */
function _policyById(id) { return (State.policies || []).find(p => String(p.id) === String(id)); }

/** Dokument der Richtlinie im Desktop-Office öffnen (Karte). */
async function policyCardOpenOffice(id) {
  const p = _policyById(id);
  if (!p) return;
  const scheme = officeScheme(p.dokumentName || p.dokumentUrl);
  if (!scheme || !p.dokumentDriveId || !p.dokumentItemId) { policyCardOpenWeb(id); return; }
  toast('Datei-URL wird ermittelt …');
  let fileUrl = '';
  try { fileUrl = await spGetDirectFileUrl(p.dokumentDriveId, p.dokumentItemId); } catch (e) { fileUrl = ''; }
  if (fileUrl) {
    window.location.href = `${scheme}:ofe|u|${fileUrl}`;
    toast('Öffne in Office … Öffnet sich nichts? „🌐 Im Browser öffnen" nutzen.');
  } else { policyCardOpenWeb(id); }
}

/** Dokument der Richtlinie in SharePoint/Office-Web öffnen (Karte). */
function policyCardOpenWeb(id) {
  const p = _policyById(id);
  if (!p || !p.dokumentUrl) { toast('Diesem Eintrag ist kein Dokument zugeordnet.', 'error'); return; }
  let u = p.dokumentUrl;
  if (/Doc\.aspx/i.test(u)) {
    u = u.replace(/([?&])action=[^&]*/i, '$1action=edit');
    if (!/[?&]action=/i.test(u)) u += (u.includes('?') ? '&' : '?') + 'action=edit';
  }
  window.open(u, '_blank', 'noopener');
}

/** Buttons „In Office / Im Browser öffnen" für eine Richtlinie (nur wenn ein Dokument hinterlegt ist). */
function _policyOpenButtons(p) {
  if (!p || !p.dokumentUrl) return '';
  return `<button class="btn btn-outline btn-sm" onclick="policyCardOpenOffice('${esc(p.id)}')" title="Im Desktop-Office öffnen">✏️ In Office öffnen</button>
    <button class="btn btn-outline btn-sm" onclick="policyCardOpenWeb('${esc(p.id)}')" title="In SharePoint / Office für das Web öffnen">🌐 Im Browser öffnen</button>`;
}

function newPolicy() {
  return {
    id: null, typ: 'Regelwerk', title: '', beschreibung: '',
    kategorie: (typeof regelwerkKategorien === 'function') ? (regelwerkKategorien()[0] || '') : '',
    dokumentUrl: '', dokumentName: '', dokumentDriveId: '', dokumentItemId: '',
    regelwerkTyp: '', geltungsbereich: [], historie: [], videos: [],
    version: '1.0', status: 'Entwurf', pflicht: true,
    quizErforderlich: false, quizBestehenProzent: 80, quiz: [],
    zielgruppen: [], wiederholungMonate: 0, naechsteReview: '',
    veroeffentlichtAm: '', freigegebenVon: '', normbezug: [],
    pruefKonfig: { pruefer: [], schwelle: '' },
    freigabeKonfig: { freigeber: [], schwelle: '' },
    kbrBetroffen: false, mitbestimmungWerke: [],
    freigabeReihenfolge: 'gl_mb',   // 'gl_mb' = Freigabe vor Mitbestimmung (Standard), 'mb_gl' = Mitbestimmung vor Freigabe
  };
}

function openPolicyEditor(policyId) {
  if (policyId) {
    const src = State.policies.find(x => x.id === policyId);
    _editing = JSON.parse(JSON.stringify(src));
  } else {
    _editing = newPolicy();
  }
  renderPolicyEditor();
}

/** Kurze Erklärung zu einer Dokumentenart, wie sie in der Matrix steht. */
function _artHinweis(t) {
  return (typeof regelwerkArtHinweis === 'function') ? regelwerkArtHinweis(t) : '';
}

function renderPolicyEditor() {
  const p = _editing;
  // Kategorien aus der Governance-Struktur (dieselbe Systematik wie im Konzernregelwerk).
  // Sind sie noch nicht geladen, gilt der Startbestand – und sobald sie da sind,
  // zeichnet der Editor sich einmal neu.
  const cats = (typeof regelwerkKategorien === 'function') ? regelwerkKategorien(p.kategorie) : KATEGORIEN_FALLBACK;
  const arten = regelwerkTypen(p.regelwerkTyp);
  if (typeof gsDatenGeladen === 'function' && !gsDatenGeladen() && typeof gsDatenLaden === 'function') {
    gsDatenLaden().then(() => { if (_editing) renderPolicyEditor(); });
  }
  const body = `
    <div class="modal-header">
      <h3>${p.id ? 'Regelwerk bearbeiten' : 'Neues Regelwerk'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full">
          <label>Titel <span class="req">*</span></label>
          <input type="text" value="${esc(p.title)}" oninput="_editing.title=this.value" placeholder="z. B. Informationssicherheitsleitlinie">
        </div>
        <div class="form-group full">
          <label>Beschreibung</label>
          <textarea oninput="_editing.beschreibung=this.value" placeholder="Kurzbeschreibung / Geltungsbereich">${esc(p.beschreibung)}</textarea>
        </div>
        <div class="form-group">
          <label>Dokumentenart <span class="req">*</span></label>
          <select onchange="_editing.regelwerkTyp=this.value;renderPolicyEditor()">
            <option value="">– bitte wählen –</option>
            ${arten.map(t => `<option ${t === p.regelwerkTyp ? 'selected' : ''} title="${esc(_artHinweis(t))}">${esc(t)}</option>`).join('')}
          </select>
          <span class="field-hint">${p.regelwerkTyp && _artHinweis(p.regelwerkTyp)
            ? esc(_artHinweis(p.regelwerkTyp))
            : 'Ebene der Regelwerkspyramide – gepflegt in der <b>Governance-Struktur</b>.'}</span>
        </div>
        <div class="form-group">
          <label>Kategorie</label>
          <select onchange="_editing.kategorie=this.value;renderPolicyEditor()">
            <option value="">– keine –</option>
            ${cats.map(c => `<option ${c === p.kategorie ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
          <span class="field-hint">Themenfeld des Konzernregelwerks (Zeile der <b>Governance-Struktur</b>).</span>
        </div>
        <div class="form-group">
          <label>Version <span class="req">*</span></label>
          <input type="text" value="${esc(p.version)}" oninput="_editing.version=this.value" placeholder="1.0">
          <span class="field-hint">Neue Version ⇒ alle müssen erneut bestätigen.</span>
        </div>
        <div class="form-group full">
          <label>Richtliniendokument <span class="req">*</span></label>
          <div id="ed-doc-display" class="doc-chip ${p.dokumentName ? '' : 'doc-chip-empty'}">
            ${p.dokumentName ? '📄 ' + esc(p.dokumentName) : '⚠ noch kein Dokument zugeordnet'}
          </div>
          <div class="doc-actions">
            <div class="doc-actions-grp">
              <span class="doc-actions-lbl">Zuordnen</span>
              <button class="btn btn-outline btn-sm" onclick="openDocPicker()" title="Dokument aus der ISMS-Bibliothek wählen">📁 Aus Bibliothek</button>
              <button class="btn btn-outline btn-sm" onclick="document.getElementById('ed-upload-input').click()" title="Neue Datei hochladen (Zielordner wählbar; bei zugeordnetem Dokument als neue Version)">⬆ Hochladen</button>
            </div>
            ${p.dokumentDriveId && p.dokumentItemId ? `
            <div class="doc-actions-grp">
              <span class="doc-actions-lbl">Bearbeiten</span>
              ${officeScheme(p.dokumentName) ? `<button class="btn btn-primary btn-sm" onclick="policyEditOffice()" title="In der Desktop-Office-App öffnen – beim Speichern legt SharePoint automatisch eine neue Version an">✏️ In Office</button>` : ''}
              <button class="btn btn-outline btn-sm" onclick="policyEditWeb()" title="In Office für das Web öffnen – beim Speichern neue Version">🌐 Im Browser</button>
              <button class="btn btn-outline btn-sm" onclick="openDocVersions()" title="Versionsverlauf ansehen">🕘 Versionen</button>
            </div>` : ''}
            <input type="file" id="ed-upload-input" accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.odt" style="display:none" onchange="uploadPolicyDocFromEditor(this.files[0]); this.value='';">
          </div>
          <span class="field-hint">„In Office"/„Im Browser" öffnet die zugeordnete Datei direkt zum Bearbeiten – beim Speichern legt SharePoint automatisch eine neue Version an. „Hochladen" öffnet einen Zielordner-Wähler (bei zugeordnetem Dokument auch als neue Version am selben Ort). Versionsverlauf über „🕘 Versionen".</span>
        </div>
        <div class="form-group">
          <label class="ack-check" style="font-weight:600"><input type="checkbox" ${p.pflicht ? 'checked' : ''} onchange="_editing.pflicht=this.checked"> Pflichtlektüre</label>
        </div>
        <div class="form-group">
          <label class="ack-check" style="font-weight:600"><input type="checkbox" ${p.quizErforderlich ? 'checked' : ''} onchange="_editing.quizErforderlich=this.checked;renderPolicyEditor()"> Wissenstest erforderlich</label>
        </div>
        <div class="form-group">
          <label>Wiederholungspflicht</label>
          <select onchange="_editing.wiederholungMonate=+this.value">
            <option value="0" ${!p.wiederholungMonate ? 'selected' : ''}>keine</option>
            <option value="6" ${p.wiederholungMonate == 6 ? 'selected' : ''}>alle 6 Monate</option>
            <option value="12" ${p.wiederholungMonate == 12 ? 'selected' : ''}>jährlich</option>
            <option value="24" ${p.wiederholungMonate == 24 ? 'selected' : ''}>alle 2 Jahre</option>
            <option value="36" ${p.wiederholungMonate == 36 ? 'selected' : ''}>alle 3 Jahre</option>
          </select>
          <span class="field-hint">Nach Ablauf müssen Mitarbeiter erneut bestätigen (+ ggf. Quiz).</span>
        </div>
        <div class="form-group">
          <label>Nächste Überprüfung (Review)</label>
          <input type="date" value="${esc((p.naechsteReview || '').slice(0, 10))}"
            onchange="_editing.naechsteReview = this.value ? new Date(this.value).toISOString() : ''">
          <span class="field-hint">Interner Termin zur Überprüfung der Richtlinie.</span>
        </div>
      </div>
      ${renderGeltungsbereichSection(p.geltungsbereich, 'gb')}
      ${renderZielgruppenSection()}
      ${/* Der Normbezug hing an der Kategorie „ISO 27001"/„NIS2". Seit die Kategorien
             aus der Governance-Struktur kommen, wäre er nie wieder erschienen – und
             inhaltlich stimmte die Kopplung ohnehin nicht: Auch ein Regelwerk der
             Kategorie „Compliance" kann ISO-Bezug haben. Der Abschnitt ist eingeklappt. */
        (typeof renderNormbezugSection === 'function') ? renderNormbezugSection() : ''}
      ${renderWorkflowSections()}
      ${renderVideoEditorSection()}
      ${p.id ? renderHistorieSection(p) : ''}
      ${p.quizErforderlich ? renderQuizEditorSection() : ''}
    </div>
    <div class="modal-footer">
      ${(typeof canWriteTab === 'function' && !canWriteTab('verwaltung'))
        ? `<span class="field-hint" style="margin-right:auto">👁 Nur Lesezugriff – Änderungen können nicht gespeichert werden.</span>
           <button class="btn btn-outline" onclick="closeModal()">Schließen</button>`
        : `${p.id ? (darfGeloeschtWerden(p)
             ? `<button class="btn btn-danger btn-sm" onclick="deletePolicyConfirm('${p.id}')" style="margin-right:auto">Löschen</button>`
             : `<span class="field-hint" style="margin-right:auto" title="Ein Regelwerk mit Prüfung, Freigabe oder Kenntnisnahme wird archiviert, nicht gelöscht">🔒 Nur archivierbar</span>`) : ''}
           ${p.id && p.status === 'Archiviert'
             ? `<button class="btn btn-outline btn-sm" onclick="reaktivierePolicy('${p.id}')" title="Zurück in den Entwurfsstatus holen">↩ Reaktivieren</button>`
             : (p.id && p.status === 'Veröffentlicht'
               ? `<button class="btn btn-outline btn-sm" onclick="archivierePolicy('${p.id}')" title="Außer Kraft setzen: nicht mehr in „Meine Regelwerke", bleibt für Audits erhalten">📦 Archivieren</button>`
               : '')}
           <button class="btn btn-outline" onclick="savePolicy()">Speichern (Entwurf)</button>
           ${(!p.id || p.status === 'Entwurf' || p.status === 'Konformitätsprüfung' || p.status === 'InReview')
             ? `<button class="btn btn-primary" onclick="savePolicy('Konformitätsprüfung')">${p.status === 'Konformitätsprüfung' ? '↻ Erneut zur Prüfung' : 'Zur Konformitätsprüfung →'}</button>`
             : ''}`}
    </div>`;
  // Re-Render ohne Scroll-Sprung (Ein-/Ausklappen, BR-Auswahl …)
  (typeof reopenModalKeepScroll === 'function' ? reopenModalKeepScroll : openModal)(body, true);
}

/* ── Lernvideos: Erklärvideo statt nur Dokument ──
   Ein Video vor dem Wissenstest bringt mehr hängen als zwölf Seiten Fließtext.
   Eingegeben wird der Einbetten-Code aus Stream/SharePoint oder eine Adresse;
   videoEinbettung() (util.js) entscheidet, ob gespielt oder verlinkt wird. */

function renderVideoEditorSection() {
  return `
    <div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--c-border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-weight:700;font-size:.9rem">🎬 Lernvideos <span style="font-weight:400;color:var(--c-muted)">(optional)</span></div>
        <button class="btn btn-ghost btn-sm" onclick="vidAdd()">+ Video</button>
      </div>
      <div class="field-hint" style="margin-bottom:10px">
        Videos erscheinen bei den Mitarbeitenden direkt unter dem Dokument – vor dem Wissenstest.
        Am einfachsten in Stream/SharePoint auf <b>Teilen → Einbetten</b> klicken und den Code hier
        einfügen; die App holt sich die Adresse heraus. Eine normale Video-Adresse geht auch
        (YouTube und Vimeo werden ebenfalls direkt abgespielt), sonst öffnet ein Knopf das Video
        in einem neuen Tab. Rechte am Video vergibt SharePoint – wer es nicht sehen darf, sieht es
        auch hier nicht.
      </div>
      <div id="vid-list">${renderVideoItems()}</div>
    </div>`;
}

function renderVideoItems() {
  const vids = _editing.videos || [];
  if (!vids.length) return '<div class="field-hint" style="margin-bottom:10px">Noch kein Video hinterlegt.</div>';
  return vids.map((v, i) => {
    const e = (typeof videoEinbettung === 'function') ? videoEinbettung(v.url) : null;
    const status = !String(v.url || '').trim()
      ? '<span class="field-hint">Adresse oder Einbetten-Code einfügen</span>'
      : e && e.art === 'einbetten'
        ? '<span class="field-hint" style="color:var(--c-success,#16a34a)">▶ wird direkt in der Seite abgespielt</span>'
        : e
          ? '<span class="field-hint">↗ öffnet in einem neuen Tab (nicht einbettbar)</span>'
          : '<span class="field-hint" style="color:#b45309">⚠ keine gültige Adresse erkannt</span>';
    return `
      <div class="qe-item">
        <div class="qe-head">
          <span class="t">Video ${i + 1}</span>
          <button class="btn btn-ghost btn-sm" onclick="vidRemove(${i})">Entfernen</button>
        </div>
        <div class="form-group full" style="margin-bottom:8px">
          <input type="text" value="${esc(v.titel || '')}" placeholder="Titel, z. B. Phishing in 3 Minuten"
            oninput="vidSet(${i},'titel',this.value)">
        </div>
        <div class="form-group full" style="margin-bottom:6px">
          <input type="text" value="${esc(v.url || '')}" placeholder="Adresse oder Einbetten-Code aus Stream/SharePoint"
            oninput="vidSet(${i},'url',this.value)" onchange="vidRefresh()">
        </div>
        ${status}
      </div>`;
  }).join('');
}

function vidRefresh() { const el = document.getElementById('vid-list'); if (el) el.innerHTML = renderVideoItems(); }
function vidAdd() { if (!Array.isArray(_editing.videos)) _editing.videos = []; _editing.videos.push({ titel: '', url: '' }); vidRefresh(); }
function vidRemove(i) { (_editing.videos || []).splice(i, 1); vidRefresh(); }
function vidSet(i, feld, wert) {
  if (!Array.isArray(_editing.videos) || !_editing.videos[i]) return;
  _editing.videos[i][feld] = wert;
}

function renderQuizEditorSection() {
  return `
    <div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--c-border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:700;font-size:.9rem">Wissenstest</div>
        <div class="form-group" style="flex-direction:row;align-items:center;gap:6px">
          <label style="margin:0">Bestehen ab</label>
          <input type="number" min="1" max="100" value="${_editing.quizBestehenProzent}" style="width:72px"
            oninput="_editing.quizBestehenProzent=Math.max(1,Math.min(100,+this.value||80))"> %
        </div>
      </div>
      <div id="qe-list">${renderQuizItems()}</div>
      <button class="btn btn-ghost btn-sm" onclick="qeAddQuestion()">+ Frage hinzufügen</button>
    </div>`;
}

function renderQuizItems() {
  if (!_editing.quiz.length) return '<div class="field-hint" style="margin-bottom:10px">Noch keine Fragen.</div>';
  return _editing.quiz.map((q, i) => `
    <div class="qe-item">
      <div class="qe-head">
        <span class="t">Frage ${i + 1}</span>
        <button class="btn btn-ghost btn-sm" onclick="qeRemoveQuestion(${i})">Entfernen</button>
      </div>
      <div class="form-group full" style="margin-bottom:10px">
        <input type="text" value="${esc(q.frage)}" oninput="_editing.quiz[${i}].frage=this.value" placeholder="Fragetext">
      </div>
      <div class="field-hint" style="margin-bottom:6px">Richtige Antwort markieren:</div>
      ${q.optionen.map((opt, oi) => `
        <div class="qe-opt-row">
          <input type="radio" name="qe-correct-${i}" ${q.richtig === oi ? 'checked' : ''} onchange="_editing.quiz[${i}].richtig=${oi}">
          <input type="text" value="${esc(opt)}" oninput="_editing.quiz[${i}].optionen[${oi}]=this.value" placeholder="Antwortoption ${oi + 1}">
          ${q.optionen.length > 2 ? `<button class="btn btn-ghost btn-sm" onclick="qeRemoveOption(${i},${oi})">✕</button>` : ''}
        </div>`).join('')}
      <button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="qeAddOption(${i})">+ Antwortoption</button>
    </div>`).join('');
}

function qeRefresh() { const el = document.getElementById('qe-list'); if (el) el.innerHTML = renderQuizItems(); }
function qeAddQuestion() { _editing.quiz.push({ frage: '', optionen: ['', '', ''], richtig: 0 }); qeRefresh(); }
function qeRemoveQuestion(i) { _editing.quiz.splice(i, 1); qeRefresh(); }
function qeAddOption(i) { _editing.quiz[i].optionen.push(''); qeRefresh(); }
function qeRemoveOption(i, oi) {
  _editing.quiz[i].optionen.splice(oi, 1);
  if (_editing.quiz[i].richtig >= _editing.quiz[i].optionen.length) _editing.quiz[i].richtig = 0;
  qeRefresh();
}

/* ── Zielgruppen-Auswahl im Editor ── */

function renderZielgruppenSection() {
  const zg = _editing.zielgruppen || [];
  const specific = _editing._zgSpecific || (zg.length && !zg.includes('ALLE'));
  const roles = getCompanyRoles();
  return `
    <div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--c-border)">
      <div style="font-weight:700;font-size:.9rem;margin-bottom:10px">Zielgruppe</div>
      <label class="ack-check" style="font-weight:500;margin-bottom:6px">
        <input type="radio" name="zg-mode" ${specific ? '' : 'checked'} onchange="zgSetAlle(true)">
        <span>Für <b>alle Mitarbeiter</b></span>
      </label>
      <label class="ack-check" style="font-weight:500">
        <input type="radio" name="zg-mode" ${specific ? 'checked' : ''} onchange="zgSetAlle(false)">
        <span>Nur für <b>bestimmte Rollen / Abteilungen</b></span>
      </label>
      ${specific ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:8px;padding-left:24px">
        ${roles.map((r, ri) => `<label class="ack-check" style="font-weight:500">
          <input type="checkbox" ${zg.includes(r) ? 'checked' : ''} onchange="zgToggleRole(${ri}, this.checked)">
          <span>${esc(r)}</span></label>`).join('')}
      </div>
      <div class="field-hint" style="padding-left:24px;margin-top:6px">Mitarbeiter sehen die Richtlinie, wenn ihre Abteilung/Rolle hier ausgewählt ist.</div>
      ` : ''}
    </div>`;
}

function zgSetAlle(alle) {
  if (alle) { _editing.zielgruppen = []; _editing._zgSpecific = false; }
  else { _editing._zgSpecific = true; _editing.zielgruppen = (_editing.zielgruppen || []).filter(x => x !== 'ALLE'); }
  renderPolicyEditor();
}

function zgToggleRole(ri, checked) {
  const r = getCompanyRoles()[ri];
  if (!Array.isArray(_editing.zielgruppen)) _editing.zielgruppen = [];
  _editing.zielgruppen = _editing.zielgruppen.filter(x => x !== 'ALLE' && x !== r);
  if (checked) _editing.zielgruppen.push(r);
}

/* ── Normbezug (ISO 27001 / NIS2) im Editor ── */

function renderNormbezugSection() {
  if (typeof NORMEN === 'undefined') return '';
  if (!Array.isArray(_editing.normbezug)) _editing.normbezug = [];
  const seed = (typeof normbezugSeedFor === 'function') ? normbezugSeedFor(_editing.title) : null;
  const seedNeu = seed ? seed.filter(id => !_editing.normbezug.includes(id)).length : 0;
  // Standardmäßig eingeklappt (klappbar) – der Zähler bleibt im Kopf sichtbar.
  const open = _editing._nbOpen === true;
  return `
    <div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--c-border)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div onclick="nbToggleOpen()" style="font-weight:700;font-size:.9rem;cursor:pointer;user-select:none">
          <span id="nb-caret" style="display:inline-block;width:1em;color:var(--c-muted)">${open ? '▾' : '▸'}</span>
          Normbezug (ISO 27001 / NIS2) <span id="nb-count" style="color:var(--c-muted);font-weight:500">(${_editing.normbezug.length} ausgewählt)</span></div>
        <div style="flex:1"></div>
        ${seed ? `<button class="btn btn-outline btn-sm" onclick="nbApplySeed()" title="Vorschlag aus der Review-Zuordnung übernehmen">↩ Aus Review übernehmen${seedNeu ? ' (+' + seedNeu + ')' : ''}</button>` : ''}
        ${_editing.normbezug.length ? `<button class="btn btn-ghost btn-sm" onclick="nbClear()">Leeren</button>` : ''}
      </div>
      <div id="nb-body" style="${open ? '' : 'display:none'}">
        <div class="field-hint" style="margin-bottom:8px">Welche ISO-27001-Klauseln/Annex-A-Controls (und optional NIS2-Artikel) diese Richtlinie abdeckt. Grundlage für die ISMS-Abdeckungs-Heatmap.</div>
        <input type="text" id="nb-filter" placeholder="Filtern (z. B. „A.8", „Audit", „Krypto") …" oninput="nbRenderList()"
          style="width:100%;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.85rem;font-family:inherit;margin-bottom:8px">
        <div id="nb-list" style="max-height:320px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:8px">${nbListHtml('')}</div>
      </div>
    </div>`;
}

/** Normbezug-Sektion ein-/ausklappen (ohne Editor-Neuaufbau → kein Scroll-Sprung). */
function nbToggleOpen() {
  _editing._nbOpen = !_editing._nbOpen;
  const body = document.getElementById('nb-body');
  const caret = document.getElementById('nb-caret');
  if (body) body.style.display = _editing._nbOpen ? '' : 'none';
  if (caret) caret.textContent = _editing._nbOpen ? '▾' : '▸';
}

function nbListHtml(filter) {
  const sel = new Set(_editing.normbezug || []);
  const f = String(filter || '').toLowerCase().trim();
  const match = it => !f || it.id.toLowerCase().includes(f) || it.label.toLowerCase().includes(f);
  let html = '';
  for (const g of NORMEN) {
    const items = g.items.filter(match);
    if (!items.length) continue;
    html += `<div style="font-size:.72rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.03em;margin:8px 2px 4px">${esc(g.group)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px">
      ${items.map(it => `<label class="ack-check" style="font-weight:500;align-items:flex-start">
        <input type="checkbox" ${sel.has(it.id) ? 'checked' : ''} onchange="nbToggle('${esc(it.id)}', this.checked)">
        <span><b>${esc(it.id)}</b> ${esc(it.label)}</span></label>`).join('')}
      </div>`;
  }
  return html || '<div class="field-hint">Keine Treffer.</div>';
}

function nbRenderList() {
  const el = document.getElementById('nb-list');
  if (el) el.innerHTML = nbListHtml(document.getElementById('nb-filter')?.value || '');
}

function nbToggle(id, checked) {
  if (!Array.isArray(_editing.normbezug)) _editing.normbezug = [];
  _editing.normbezug = _editing.normbezug.filter(x => x !== id);
  if (checked) _editing.normbezug.push(id);
  nbUpdateCount();
}

function nbUpdateCount() {
  const c = document.getElementById('nb-count');
  if (c) c.textContent = `(${_editing.normbezug.length} ausgewählt)`;
}

function nbApplySeed() {
  const seed = (typeof normbezugSeedFor === 'function') ? normbezugSeedFor(_editing.title) : null;
  if (!seed) return;
  const set = new Set(_editing.normbezug || []);
  seed.forEach(id => set.add(id));
  _editing.normbezug = [...set];
  renderPolicyEditor();   // Seed-Button-Zähler & Häkchen neu
}

function nbClear() { _editing.normbezug = []; renderPolicyEditor(); }

/* ── Konformitätsprüfer pro Richtlinie (optional, Fallback: global) ── */

/* ═══════════════════════════════════════════════════
   Workflow-Abschnitte im Editor (ausklappbar):
   Konformitätsprüfung · Freigabe (GL) · Mitbestimmung (BR).
   Die Reihenfolge von Freigabe ↔ Mitbestimmung ist pro Regelwerk
   umschaltbar (_editing.freigabeReihenfolge: 'gl_mb' | 'mb_gl').
═══════════════════════════════════════════════════ */

function renderWorkflowSections() {
  const p = _editing;
  const order = (p.freigabeReihenfolge === 'mb_gl') ? ['mit', 'frei'] : ['frei', 'mit'];
  const moveCtrls = (key) => {
    const idx = order.indexOf(key);
    const up = idx > 0, down = idx < order.length - 1;
    return `<span onclick="event.stopPropagation()" style="display:inline-flex;gap:2px">
      <button type="button" class="btn btn-ghost btn-sm" title="nach oben" ${up ? '' : 'disabled'}
        onclick="event.stopPropagation();edSwapWorkflowOrder()" style="padding:1px 8px;line-height:1.2">▲</button>
      <button type="button" class="btn btn-ghost btn-sm" title="nach unten" ${down ? '' : 'disabled'}
        onclick="event.stopPropagation();edSwapWorkflowOrder()" style="padding:1px 8px;line-height:1.2">▼</button>
    </span>`;
  };
  const blocks = {
    frei: _edCollapsible('frei', 'Freigabe (Geschäftsleitung)', _edFreiBadge(), renderFreigabeKonfigInner(), moveCtrls('frei')),
    mit:  _edCollapsible('mit', 'Mitbestimmung (Betriebsverfassung)', _edMitBadge(), renderMitbestimmungInner(), moveCtrls('mit')),
  };
  return `
    <div style="margin-top:16px">
      <div style="font-weight:700;font-size:.78rem;color:var(--c-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Freigabe-Workflow</div>
      <div class="field-hint" style="margin-bottom:4px">Abschnitte per Klick auf die Kopfzeile aus-/einklappen. Reihenfolge von <b>Freigabe</b> und <b>Mitbestimmung</b> mit ▲▼ tauschen – gilt nur für dieses Regelwerk.</div>
      ${_edCollapsible('pruef', 'Konformitätsprüfung', _edPruefBadge(), renderPruefKonfigInner(), '')}
      ${order.map(k => blocks[k]).join('')}
    </div>`;
}

function _edCollapsible(key, title, badge, bodyInner, moveCtrls) {
  const open = !!_edSecOpen[key];
  return `
    <div style="border:1px solid var(--c-border);border-radius:10px;overflow:hidden;margin-top:8px">
      <div onclick="edToggleSection('${key}')" role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();edToggleSection('${key}')}"
        style="display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;background:${open ? 'var(--c-primary-l)' : 'var(--c-bg)'};user-select:none">
        <span style="width:12px;color:var(--c-primary);font-size:.8rem">${open ? '▾' : '▸'}</span>
        <span style="font-weight:700;font-size:.9rem;color:var(--c-text)">${title}</span>
        ${badge}
        <span style="flex:1"></span>
        ${moveCtrls || ''}
      </div>
      ${open ? `<div style="padding:14px 14px 4px">${bodyInner}</div>` : ''}
    </div>`;
}

function _edBadge(text, kind) {
  const map = {
    global: ['var(--c-bg)', 'var(--c-muted)'],
    custom: ['var(--c-primary-l)', 'var(--c-primary)'],
    off:    ['var(--c-bg)', 'var(--c-muted)'],
  };
  const [bg, fg] = map[kind] || map.global;
  return `<span style="font-size:.7rem;font-weight:600;padding:2px 9px;border-radius:999px;background:${bg};color:${fg};white-space:nowrap">${esc(text)}</span>`;
}

function _edPruefBadge() {
  const n = ((_editing.pruefKonfig && _editing.pruefKonfig.pruefer) || []).length;
  return n ? _edBadge(`${n} eigene Prüfer`, 'custom') : _edBadge('global', 'global');
}
function _edFreiBadge() {
  const n = ((_editing.freigabeKonfig && _editing.freigabeKonfig.freigeber) || []).length;
  return n ? _edBadge(`${n} eigene Freigeber`, 'custom') : _edBadge('global', 'global');
}
function _edMitBadge() {
  const p = _editing;
  const w = Array.isArray(p.mitbestimmungWerke) ? p.mitbestimmungWerke.length : 0;
  if (!p.kbrBetroffen && !w) return _edBadge('nicht betroffen', 'off');
  const parts = [];
  if (p.kbrBetroffen) parts.push('KBR');
  if (w) parts.push(`${w} Werk${w > 1 ? 'e' : ''}`);
  return _edBadge(parts.join(' · '), 'custom');
}

function edToggleSection(key) {
  _edSecOpen[key] = !_edSecOpen[key];
  renderPolicyEditor();
}

function edSwapWorkflowOrder() {
  _editing.freigabeReihenfolge = (_editing.freigabeReihenfolge === 'mb_gl') ? 'gl_mb' : 'mb_gl';
  renderPolicyEditor();
}

function renderPruefKonfigInner() {
  const pk = _editing.pruefKonfig || (_editing.pruefKonfig = { pruefer: [], schwelle: '' });
  const global = (typeof getPruefer === 'function') ? getPruefer() : [];
  const gSchwelle = (typeof getKonformSchwelle === 'function') ? getKonformSchwelle() : 'alle';
  return `
    <div class="field-hint" style="margin-bottom:8px">Leer lassen = die <b>globalen</b> Prüfer/Schwelle aus den Einstellungen gelten. Tragen Sie hier Prüfer ein, gelten für dieses Regelwerk <b>ausschließlich diese</b>.</div>
    <div class="form-grid">
      <div class="form-group full">
        <label>Prüfer (E-Mails, kommagetrennt)</label>
        <input type="text" id="pk-pruefer" value="${esc((pk.pruefer || []).join(', '))}"
          placeholder="z. B. it-sibe@dihag.com, ${esc(global[0] || 'name@dihag.com')}" oninput="pkSetPruefer(this.value)">
        <span class="field-hint">Global hinterlegt: ${global.length ? esc(global.join(', ')) : '– keine –'}</span>
      </div>
      <div class="form-group">
        <label>„Konform", wenn …</label>
        <select onchange="pkSetSchwelle(this.value)">
          <option value="" ${!pk.schwelle ? 'selected' : ''}>Global (${gSchwelle === 'alle' ? 'alle zustimmen' : 'einer reicht'})</option>
          <option value="alle" ${pk.schwelle === 'alle' ? 'selected' : ''}>alle Prüfer zustimmen</option>
          <option value="einer" ${pk.schwelle === 'einer' ? 'selected' : ''}>ein Prüfer reicht</option>
        </select>
      </div>
    </div>`;
}

function pkSetPruefer(str) {
  if (!_editing.pruefKonfig) _editing.pruefKonfig = { pruefer: [], schwelle: '' };
  const list = String(str || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase())
    .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  _editing.pruefKonfig.pruefer = [...new Set(list)];
}

function pkSetSchwelle(v) {
  if (!_editing.pruefKonfig) _editing.pruefKonfig = { pruefer: [], schwelle: '' };
  _editing.pruefKonfig.schwelle = (v === 'alle' || v === 'einer') ? v : '';
}

/* ── Freigabe (Geschäftsleitung) pro Regelwerk (optional, Fallback: global) ── */

function renderFreigabeKonfigInner() {
  const fk = _editing.freigabeKonfig || (_editing.freigabeKonfig = { freigeber: [], schwelle: '' });
  const global = (typeof getGeschaeftsleitung === 'function') ? getGeschaeftsleitung() : [];
  const gSchwelle = (typeof getFreigabeSchwelle === 'function') ? getFreigabeSchwelle() : 'einer';
  return `
    <div class="field-hint" style="margin-bottom:8px">Leer lassen = die <b>globale</b> Geschäftsleitung/Schwelle aus den Einstellungen gilt. Tragen Sie hier Freigeber ein, gelten für dieses Regelwerk <b>ausschließlich diese</b>.</div>
    <div class="form-grid">
      <div class="form-group full">
        <label>Freigeber (E-Mails, kommagetrennt)</label>
        <input type="text" id="fk-freigeber" value="${esc((fk.freigeber || []).join(', '))}"
          placeholder="z. B. gf@dihag.com, ${esc(global[0] || 'name@dihag.com')}" oninput="fkSetFreigeber(this.value)">
        <span class="field-hint">Global hinterlegt: ${global.length ? esc(global.join(', ')) : '– keine –'}</span>
      </div>
      <div class="form-group">
        <label>„Freigegeben", wenn …</label>
        <select onchange="fkSetSchwelle(this.value)">
          <option value="" ${!fk.schwelle ? 'selected' : ''}>Global (${gSchwelle === 'alle' ? 'alle zustimmen' : 'einer reicht'})</option>
          <option value="alle" ${fk.schwelle === 'alle' ? 'selected' : ''}>alle Freigeber zustimmen</option>
          <option value="einer" ${fk.schwelle === 'einer' ? 'selected' : ''}>ein Freigeber reicht</option>
        </select>
      </div>
    </div>`;
}

function fkSetFreigeber(str) {
  if (!_editing.freigabeKonfig) _editing.freigabeKonfig = { freigeber: [], schwelle: '' };
  const list = String(str || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase())
    .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  _editing.freigabeKonfig.freigeber = [...new Set(list)];
}

function fkSetSchwelle(v) {
  if (!_editing.freigabeKonfig) _editing.freigabeKonfig = { freigeber: [], schwelle: '' };
  _editing.freigabeKonfig.schwelle = (v === 'alle' || v === 'einer') ? v : '';
}

/* ── Mitbestimmung (Betriebsverfassung): KBR + Betriebsräte je Werk ──
   Ist der KBR bzw. ein Werks-BR betroffen, geht das Regelwerk beim
   Einreichen zur Konformitätsprüfung zusätzlich zur Mitbestimmungsprüfung
   an die in den Einstellungen hinterlegten Mailadressen. */
function renderMitbestimmungInner() {
  const p = _editing;
  const werke = Array.isArray(p.mitbestimmungWerke) ? p.mitbestimmungWerke : [];
  const werkeList = (typeof MITBESTIMMUNG_WERKE !== 'undefined') ? MITBESTIMMUNG_WERKE : [];
  const kbrHinterlegt = (typeof getKbrMail === 'function') && getKbrMail();
  const brMails = (typeof getBrMails === 'function') ? getBrMails() : {};
  return `
    <div class="field-hint" style="margin-bottom:10px">Ist die Mitbestimmung betroffen, wird das Regelwerk beim Einreichen zur Konformitätsprüfung zusätzlich zur Prüfung an den Konzernbetriebsrat bzw. die Betriebsräte der gewählten Werke gesendet (Mailadressen unter <b>Einstellungen → Mitbestimmung</b>).</div>
    <label class="ack-check" style="font-weight:600;margin-bottom:8px">
      <input type="checkbox" ${p.kbrBetroffen ? 'checked' : ''} onchange="_editing.kbrBetroffen=this.checked;renderPolicyEditor()">
      <span>Konzernbetriebsrat (KBR) betroffen${!kbrHinterlegt ? ' <span style="color:#b45309;font-weight:600">– keine KBR-Mail hinterlegt</span>' : ''}</span>
    </label>
    <div style="font-weight:500;font-size:.82rem;margin:8px 0 6px">Betroffene Betriebsräte (Werke)</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:2px 12px">
      ${werkeList.map(code => {
        const sel = werke.includes(code);
        const fehlt = sel && !((brMails[code] || '').trim());
        return `<label class="ack-check" style="font-weight:500">
          <input type="checkbox" ${sel ? 'checked' : ''} onchange="mitEditorToggleWerk('${code}', this.checked)">
          <span>${esc(code)}${fehlt ? ' <span style="color:#b45309">⚠</span>' : ''}</span></label>`;
      }).join('')}
    </div>`;
}

function mitEditorToggleWerk(code, on) {
  if (!Array.isArray(_editing.mitbestimmungWerke)) _editing.mitbestimmungWerke = [];
  _editing.mitbestimmungWerke = _editing.mitbestimmungWerke.filter(x => x !== code);
  if (on) _editing.mitbestimmungWerke.push(code);
  renderPolicyEditor();   // Badge „x Werke" aktualisieren
}

async function savePolicy(newStatus) {
  if (typeof canWriteTab === 'function' && !canWriteTab('verwaltung')) {
    toast('Nur Lesezugriff auf „Richtlinien Dashboard" – Speichern nicht möglich.', 'error'); return;
  }
  const p = _editing;
  if (!p.title.trim()) { toast('Bitte einen Titel angeben.', 'error'); return; }
  // Die Dokumentenart steuert Nummernkreis, Ablage und Auswertung – ohne sie
  // landet ein Regelwerk in keiner Systematik. Deshalb Pflicht.
  if (!(p.regelwerkTyp || '').trim()) { toast('Bitte die Dokumentenart wählen (z. B. Policy, Konzernrichtlinie).', 'error'); return; }
  if (!p.dokumentItemId && !p.dokumentUrl) { toast('Bitte ein Dokument zuordnen.', 'error'); return; }
  if (!Array.isArray(p.geltungsbereich) || !p.geltungsbereich.length) {
    toast('Bitte den Geltungsbereich festlegen: „Alle Standorte" oder einzelne Werke.', 'error'); return;
  }
  if (p._zgSpecific && (!p.zielgruppen || !p.zielgruppen.length)) {
    toast('Bitte mindestens eine Rolle wählen oder „Für alle Mitarbeiter" auswählen.', 'error'); return;
  }
  if (p.quizErforderlich) {
    if (!p.quiz.length) { toast('Wissenstest aktiv, aber keine Fragen angelegt.', 'error'); return; }
    for (let i = 0; i < p.quiz.length; i++) {
      const q = p.quiz[i];
      if (!q.frage.trim()) { toast(`Frage ${i + 1}: Text fehlt.`, 'error'); return; }
      if (q.optionen.filter(o => o.trim()).length < 2) { toast(`Frage ${i + 1}: mindestens 2 Antwortoptionen.`, 'error'); return; }
    }
  }
  // Hat jemand anderes zwischenzeitlich gespeichert? (sonst gingen dessen Änderungen still verloren)
  if (!await pruefeFremdaenderung(p, newStatus ? 'einreichst' : 'speicherst')) return;

  // Änderungen gegen den zuletzt geladenen Stand protokollieren (vor Statuswechsel diffen)
  const alt = p.id ? State.policies.find(x => x.id === p.id) : null;
  const aenderungen = alt ? policyDiff(alt, p) : [];

  if (newStatus) p.status = newStatus;
  if (newStatus === 'Konformitätsprüfung') {
    p.pruefungSeit = new Date().toISOString();
    p.konformitaet = [];                    // neue Prüfrunde startet ohne Votes
    p.mitbestimmung = null;                 // Betriebsrat muss im neuen Zyklus erneut beteiligt werden
    // Neue Runde, neues Einmal-Token: Links aus der alten Mail laufen ins Leere.
    if (typeof neuerAktionToken === 'function') p.aktionToken = neuerAktionToken('pruefung');
  }

  if (!p.id) historieAdd(p, 'Angelegt', `„${p.title}" als Entwurf angelegt.`);
  else if (aenderungen.length) historieAdd(p, 'Bearbeitet', aenderungen.join('\n'));
  if (newStatus === 'Konformitätsprüfung') {
    historieAdd(p, 'Zur Konformitätsprüfung eingereicht',
      alt && alt.status === 'Konformitätsprüfung' ? 'Erneut eingereicht – bisherige Prüfvoten zurückgesetzt.' : '');
  }

  try {
    await spSavePolicy(p);
    await reloadData();
    closeModal();
    renderAdminList();
    if (newStatus === 'Konformitätsprüfung') {
      toast('Gespeichert & zur Konformitätsprüfung eingereicht ✓', 'success');
      if (typeof notifyPruefer === 'function') notifyPruefer(p);   // Mail an Prüfer (Etappe B)
    } else {
      toast('Als Entwurf gespeichert ✓', 'success');
    }
  } catch (e) {
    toast('Fehler beim Speichern: ' + e.message, 'error');
  }
}

/* ── Löschen vs. Archivieren ──
   Ein veröffentlichtes Regelwerk trägt Kenntnisnahmen, Prüf- und Freigabe-
   entscheidungen. Löscht man es, bleiben die Bestätigungen als verwaiste
   Einträge zurück und im Audit klafft ein Loch – die Kette „wer hat was wann
   bestätigt" endet im Nichts. Deshalb ist Löschen nur erlaubt, solange nichts
   davon existiert; danach führt der Weg über „Archivieren". */

/** Darf dieses Regelwerk gelöscht werden – oder muss es archiviert werden? */
function darfGeloeschtWerden(p) {
  if (!p || !p.id) return true;                       // noch nicht gespeichert
  if (p.typ === 'Konzept') return true;               // Konzepte hängen an keinem Nachweis
  if (p.status !== 'Entwurf') return false;           // ab der Prüfung zählt der Vorgang
  if ((p.konformitaet || []).length || (p.freigaben || []).length) return false;
  if (p.veroeffentlichtAm) return false;
  const acks = (State.acks || []).some(a => String(a.richtlinieId) === String(p.id));
  return !acks;
}

function deletePolicyConfirm(id) {
  const p = State.policies.find(x => x.id === id);
  if (!darfGeloeschtWerden(p)) {
    const gruende = [];
    if (p.status !== 'Entwurf') gruende.push(`Status <b>${esc(p.status)}</b>`);
    if ((p.konformitaet || []).length) gruende.push(`${(p.konformitaet || []).length} Prüfentscheidung(en)`);
    if ((p.freigaben || []).length) gruende.push(`${(p.freigaben || []).length} Freigabe(n)`);
    const acks = (State.acks || []).filter(a => String(a.richtlinieId) === String(p.id)).length;
    if (acks) gruende.push(`${acks} Kenntnisnahme(n)`);
    openModal(`
      <div class="modal-header"><h3>Löschen nicht möglich</h3>
        <button class="modal-close" onclick="renderPolicyEditor()">×</button></div>
      <div class="modal-body">
        <div class="pl-warnung"><b>„${esc(p.title || '')}" trägt bereits einen Nachweis.</b>
          Würde es gelöscht, blieben Bestätigungen ohne zugehöriges Regelwerk zurück –
          im Audit eine Lücke, die sich nicht mehr schließen lässt.</div>
        ${gruende.length ? `<p style="margin:14px 0 0;font-size:.87rem;line-height:1.7">Vorhanden:
          ${gruende.join(' · ')}</p>` : ''}
        <p style="margin:14px 0 0;line-height:1.6"><b>Archivieren</b> ist der richtige Weg: Das Regelwerk
        verschwindet aus „Meine Regelwerke", bleibt aber mit seiner ganzen Historie erhalten und lässt
        sich jederzeit reaktivieren.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="renderPolicyEditor()">Zurück</button>
        ${p.status === 'Veröffentlicht'
          ? `<button class="btn btn-primary" onclick="archivierePolicy('${esc(id)}')">📦 Archivieren</button>`
          : ''}
      </div>`);
    return;
  }
  openModal(`
    <div class="modal-header"><h3>Regelwerk löschen</h3><button class="modal-close" onclick="renderPolicyEditor()">×</button></div>
    <div class="modal-body"><p style="font-size:.9rem;line-height:1.5">„${esc(p?.title || '')}" wirklich löschen?
      Es ist ein Entwurf ohne Prüfung, Freigabe oder Kenntnisnahme – es geht kein Nachweis verloren.</p></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="renderPolicyEditor()">Abbrechen</button>
      <button class="btn btn-danger" onclick="doDeletePolicy('${id}')">Endgültig löschen</button>
    </div>`);
}

async function doDeletePolicy(id) {
  const p = State.policies.find(x => String(x.id) === String(id));
  if (!darfGeloeschtWerden(p)) {   // zweite Schranke: auch ein direkter Aufruf greift nicht durch
    toast('Dieses Regelwerk trägt einen Nachweis und kann nur archiviert werden.', 'error');
    return;
  }
  try {
    await spDeletePolicy(id);
    await reloadData();
    closeModal();
    renderAdminList();
    toast('Richtlinie gelöscht.', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/* ═══════════════════════════════════════════════════
   Dokumentwähler (ISMS-Bibliothek)
═══════════════════════════════════════════════════ */

async function openDocPicker() {
  _dpState = { driveId: null, driveName: '', path: [], items: [] };
  pickerMount(dpShell('<div class="doc-loading">Bibliotheken werden geladen …</div>'));
  try {
    if (!_dpDrives) _dpDrives = await spListIsmsDrives();
    if (_dpDrives.length === 1) { _dpState.driveId = _dpDrives[0].id; _dpState.driveName = _dpDrives[0].name; }
    await renderDocPicker();
  } catch (e) {
    const b = document.getElementById('dp-body');
    if (b) b.innerHTML = `<div class="col-warning" style="display:block">ISMS-Bibliothek nicht erreichbar: ${esc(e.message)}</div>`;
  }
}

/* Eigenes Overlay ÜBER dem Editor – der Editor-State bleibt erhalten. */
function pickerMount(html) {
  let m = document.getElementById('picker-mount');
  if (!m) { m = document.createElement('div'); m.id = 'picker-mount'; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal-overlay" style="z-index:300" onclick="if(event.target===this)pickerClose()"><div class="modal wide">${html}</div></div>`;
}
function pickerClose() {
  const m = document.getElementById('picker-mount');
  if (m) m.innerHTML = '';
}

function dpShell(inner) {
  return `
    <div class="modal-header"><h3>Dokument wählen</h3><button class="modal-close" onclick="pickerClose()">×</button></div>
    <div class="modal-body" id="dp-body">${inner}</div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="pickerClose()">Abbrechen</button></div>`;
}

async function renderDocPicker() {
  const body = document.getElementById('dp-body');
  if (!body) return;
  let items;
  try {
    if (!_dpState.driveId) {
      items = (_dpDrives || []).map(d => ({ id: d.id, name: d.name, isFolder: true, isDrive: true }));
    } else {
      body.innerHTML = '<div class="doc-loading">Lädt …</div>';
      const last = _dpState.path[_dpState.path.length - 1];
      items = await spBrowseDrive(_dpState.driveId, last ? last.id : null);
    }
  } catch (e) {
    body.innerHTML = `<div class="col-warning" style="display:block">Ordner konnte nicht geladen werden: ${esc(e.message)}</div>`;
    return;
  }
  _dpState.items = items;
  dbg('Ordner geladen (' + items.length + ' Einträge): ' + JSON.stringify(items.map(i => i.name + (i.isFolder ? ' [Ordner]' : ' [Datei]'))));

  // Breadcrumbs
  let crumbs = `<a data-crumb="-1">Bibliotheken</a>`;
  if (_dpState.driveId) {
    crumbs += ` › <a data-crumb="-2">${esc(_dpState.driveName)}</a>`;
    _dpState.path.forEach((f, i) => crumbs += ` › <a data-crumb="${i}">${esc(f.name)}</a>`);
  }

  const rowsHtml = items.length ? items.map((it, idx) => it.isFolder
    ? `<div class="dp-row folder" data-idx="${idx}" data-act="open"><span class="ic">📁</span><span class="nm">${esc(it.name)}</span><span class="field-hint">${it.isDrive ? 'Bibliothek' : (it.childCount + ' Element(e)')}</span></div>`
    : `<div class="dp-row" data-idx="${idx}" data-act="pick"><span class="ic">📄</span><span class="nm">${esc(it.name)}</span><span class="btn btn-primary btn-sm">Wählen</span></div>`
  ).join('') : '<div class="doc-loading">Dieser Ordner ist leer.</div>';

  body.innerHTML = `<div class="dp-crumbs">${crumbs}</div><div class="dp-list">${rowsHtml}</div>`;

  // Event-Delegation (robuster als inline-onclick im dynamisch ersetzten Modal)
  body.querySelector('.dp-list')?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const row = e.target.closest('.dp-row');
    if (!row) { dbg('Klick ohne .dp-row (target=' + (e.target && e.target.tagName) + ')'); return; }
    dbg('Klick: act=' + row.dataset.act + ' idx=' + row.dataset.idx);
    if (row.dataset.act === 'open') dpOpenFolder(+row.dataset.idx); else dpSelect(+row.dataset.idx);
  });
  body.querySelector('.dp-crumbs')?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const a = e.target.closest('[data-crumb]');
    if (a) dpCrumb(+a.dataset.crumb);
  });
}

function dpOpenFolder(idx) {
  const it = _dpState.items[idx];
  if (!it) return;
  if (it.isDrive) { _dpState.driveId = it.id; _dpState.driveName = it.name; _dpState.path = []; }
  else { _dpState.path.push({ id: it.id, name: it.name }); }
  renderDocPicker();
}

function dpCrumb(i) {
  if (i === -1) { _dpState.driveId = null; _dpState.driveName = ''; _dpState.path = []; }
  else if (i === -2) { _dpState.path = []; }
  else { _dpState.path = _dpState.path.slice(0, i + 1); }
  renderDocPicker();
}

function dpSelect(idx) {
  const it = _dpState.items && _dpState.items[idx];
  dbg('dpSelect: idx=' + idx + ' datei=' + (it ? it.name : 'NULL') + ' editorAktiv=' + !!_editing);
  if (!it) { toast('Auswahl fehlgeschlagen (Dokument nicht gefunden).', 'error'); return; }
  if (!_editing) { toast('Editor nicht aktiv – bitte Richtlinie erneut öffnen.', 'error'); return; }
  _editing.dokumentDriveId = _dpState.driveId;
  _editing.dokumentItemId  = it.id;
  _editing.dokumentName    = it.name;
  _editing.dokumentUrl     = it.url || '';
  pickerClose();
  // Editor bleibt erhalten – nur die Dokumentzeile direkt aktualisieren (kein Neuaufbau)
  const disp = document.getElementById('ed-doc-display');
  dbg('dpSelect gesetzt: editing.dokumentName="' + _editing.dokumentName + '" | ed-doc-display gefunden=' + !!disp);
  if (disp) { disp.innerHTML = '📄 ' + esc(it.name); disp.classList.remove('doc-chip-empty'); }
  toast('Dokument zugeordnet: ' + it.name, 'success');
}

/* ═══════════════════════════════════════════════════
   Freigaben (Genehmiger)
═══════════════════════════════════════════════════ */

function _mitMailHtml(p, label, attachmentName) {
  const base = 'https://rms.dihag.de/';
  const url = `${base}?richtlinie=${encodeURIComponent(p.id)}&ansicht=freigaben`;
  // Entscheiden aus der Mail – wie bei Prüfung und Freigabe. Bewusst OHNE
  // Anmelde-Hinweis (&u=): Empfänger ist ein Betriebsrats-Postfach, angemeldet
  // wird sich mit dem persönlichen Konto. Wer dahinter steht, erkennt die App an
  // der Adresse bzw. der Gruppenmitgliedschaft.
  const tok = (p.aktionToken && p.aktionToken.wert && p.aktionToken.art === 'mitbestimmung')
    ? `&t=${encodeURIComponent(p.aktionToken.wert)}` : '';
  const mbBtn = (a, bg, label2) => `<a href="${esc(url + '&aktion=' + a + tok)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:10px 18px;border-radius:7px;font-weight:600;margin:0 8px 8px 0">${label2}</a>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;font-size:15px;line-height:1.6;color:#1e2939">
    <p><b>Mitbestimmung – Prüfung einer Richtlinie</b></p>
    <p>Empfänger: <b>${esc(label)}</b></p>
    <p>Die folgende Richtlinie wird im Rahmen der betrieblichen Mitbestimmung zur Prüfung übermittelt:</p>
    <p style="font-size:16px"><a href="${esc(url)}" style="color:#17509e;font-weight:700;text-decoration:none">${esc(p.title)}</a> (Version ${esc(p.version)}${p.kategorie ? ', ' + esc(p.kategorie) : ''})</p>
    ${geltungsbereichLabel(p.geltungsbereich)
      ? `<p><b>Geltungsbereich:</b> ${esc(geltungsbereichLabel(p.geltungsbereich))}${p.mitbestimmung && Array.isArray(p.mitbestimmung.werke) && p.mitbestimmung.werke.length
          ? ` · <b>betroffene Werke:</b> ${esc(p.mitbestimmung.werke.join(', '))}` : ''}</p>` : ''}
    ${p.beschreibung ? `<p style="color:#374151">${esc(p.beschreibung)}</p>` : ''}
    ${attachmentName
      ? `<p>📎 Das Richtliniendokument ist dieser E-Mail angehängt: <b>${esc(attachmentName)}</b>.</p>`
      : `<p style="color:#b45309">Hinweis: Das Dokument konnte nicht automatisch angehängt werden (zu groß oder nicht verfügbar) – bitte bei der ISMS-Stelle anfordern.</p>`}
    ${(typeof _wfApprovalsHtml === 'function') ? _wfApprovalsHtml(p) : ''}
    <p style="margin-top:18px"><b>Rückmeldung – ein Klick genügt:</b></p>
    <p>${mbBtn('mb_konform', '#16a34a', '✓ Konform')}${mbBtn('mb_nicht_konform', '#dc2626', '✗ Nicht konform')}</p>
    <p style="color:#6b7280;font-size:13px">Bei <b>„Nicht konform"</b> fragt die Seite nach der Begründung – ohne sie
    wird nichts gespeichert. Die Entscheidung wird unter Ihrem Namen protokolliert; angemeldet werden Sie
    dabei mit Ihrem DIHAG-Konto.</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Automatische Nachricht vom DIHAG Richtlinienmanagementsystem.</p>
  </div>`;
}

async function initCompliance() {
  const mount = document.getElementById('compliance-mount');
  if (!mount) return;
  mount.innerHTML = '<div class="doc-loading">Lade Mitarbeiter & Bestätigungen …</div>';
  try {
    if (!AdminState.members) AdminState.members = await spGetMembers();
    AdminState.allAcks = await spGetAcknowledgements();   // alle Nutzer
    renderCompliance();
  } catch (e) {
    mount.innerHTML = `<div class="col-warning" style="display:block">Fehler beim Laden: ${esc(e.message)}<br>
      Für die Mitarbeiterliste wird die Graph-Berechtigung <b>User.Read.All</b> (Admin-Consent) benötigt.</div>`;
  }
}

function setComplianceMode(m) { AdminState.complianceMode = m; renderCompliance(); }

/** Rendert Modus-Umschalter + passenden Inhalt in #compliance-mount. */
function renderCompliance() {
  const mount = document.getElementById('compliance-mount');
  if (!mount) return;
  const mode = AdminState.complianceMode || 'overview';
  mount.innerHTML = `
    <div class="view-toolbar">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm ${mode === 'overview' ? 'btn-primary' : 'btn-outline'}" onclick="setComplianceMode('overview')">Gesamtübersicht</button>
        <button class="btn btn-sm ${mode === 'single' ? 'btn-primary' : 'btn-outline'}" onclick="setComplianceMode('single')">Einzelne Richtlinie</button>
        <button class="btn btn-sm ${mode === 'freigabeaudit' ? 'btn-primary' : 'btn-outline'}" onclick="setComplianceMode('freigabeaudit')">Freigabe-Audit</button>
      </div>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-primary btn-sm" onclick="openClevelReport()" title="Management-/C-Level-Bericht (ISO 27001 / NIS2) ansehen, drucken und per Mail senden">📧 C-Level-Bericht</button>
      ${mode === 'overview'
        ? `<button class="btn btn-outline btn-sm" onclick="exportOverviewCsv()">CSV-Export (gesamt)</button>`
        : mode === 'freigabeaudit'
        ? `<input type="text" id="search-freigabeaudit" class="sort-select" placeholder="Suchen (Richtlinie, Person) …" oninput="renderFreigabeAudit()" style="width:220px">
           <button class="btn btn-outline btn-sm" onclick="exportFreigabeAuditCsv()">CSV-Export</button>`
        : `<select id="compliance-policy" class="sort-select" onchange="renderComplianceDetail()"></select>
           <button class="btn btn-outline btn-sm" onclick="exportComplianceCsv()">CSV-Export</button>`}
    </div>
    <div id="compliance-body"></div>`;
  if (mode === 'overview') {
    renderComplianceOverview();
  } else if (mode === 'freigabeaudit') {
    renderFreigabeAudit();
  } else {
    fillPolicySelect();
    const sel = document.getElementById('compliance-policy');
    if (sel && AdminState._jumpToPolicy) { sel.value = AdminState._jumpToPolicy; AdminState._jumpToPolicy = null; }
    renderComplianceDetail();
  }
}

/* ═══════════════════════════════════════════════════
   Freigabe-Audit: Wer hat wann was geprüft/freigegeben (Audit Report)
═══════════════════════════════════════════════════ */

function renderFreigabeAudit() {
  const body = document.getElementById('compliance-body');
  if (!body) return;
  const q = (document.getElementById('search-freigabeaudit')?.value || '').toLowerCase().trim();
  let rows = _freigabeAuditRows();
  if (q) rows = rows.filter(r => (r.policy + ' ' + r.wer + ' ' + r.aktion).toLowerCase().includes(q));
  AdminState.lastFreigabeAuditRows = rows;

  if (!rows.length) { body.innerHTML = emptyState('Noch keine Konformitätsprüfungen oder Freigaben protokolliert.'); return; }

  const aktionBadge = (a) => {
    if (a === 'Veröffentlicht') return `<span class="status-badge sb-done">✓ ${esc(a)}</span>`;
    if (a === 'Freigabe erteilt') return `<span class="status-badge sb-done">✓ ${esc(a)}</span>`;
    if (/nicht konform/.test(a)) return `<span class="status-badge sb-open">✗ ${esc(a)}</span>`;
    return `<span class="status-badge sb-read">${esc(a)}</span>`;
  };

  body.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Lückenloser Nachweis <b>wer wann was</b> geprüft und freigegeben hat – über alle Richtlinien (auch archivierte), neueste zuerst.
      <b>${rows.length}</b> Ereignis(se).
    </div>
    <div class="card">
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Datum</th><th>Richtlinie</th><th>Version</th><th>Aktion</th><th>Wer</th><th>Anmerkung</th></tr></thead>
          <tbody>${rows.map(r => `<tr>
            <td style="white-space:nowrap">${r.datum ? fmtDateTime(r.datum) : '–'}</td>
            <td>${esc(r.policy)}</td>
            <td>${esc(r.version)}</td>
            <td>${aktionBadge(r.aktion)}</td>
            <td>${esc(r.wer || '–')}</td>
            <td style="color:var(--c-muted)">${esc(r.anmerkung || '–')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

function exportFreigabeAuditCsv() {
  const rows = AdminState.lastFreigabeAuditRows;
  if (!rows || !rows.length) { toast('Nichts zu exportieren.', 'error'); return; }
  const lines = ['Datum;Richtlinie;Version;Aktion;Wer;Anmerkung'];
  rows.forEach(r => lines.push([
    _csv(r.datum ? fmtDateTime(r.datum) : ''), _csv(r.policy), _csv(r.version),
    _csv(r.aktion), _csv(r.wer), _csv(r.anmerkung),
  ].join(';')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Freigabe-Audit_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function fillPolicySelect() {
  const sel = document.getElementById('compliance-policy');
  if (!sel) return;
  const pubs = State.policies.filter(p => p.status === 'Veröffentlicht' && p.pflicht);
  sel.innerHTML = pubs.length
    ? pubs.map(p => `<option value="${p.id}">${esc(p.title)} (v${esc(p.version)})</option>`).join('')
    : '<option value="">— keine —</option>';
}

/** Soll/Ist-Zeilen einer Richtlinie (Zielgruppe = passende Rollen; Ablauf zählt als offen). */
function _complianceRowsFor(p) {
  const members = (AdminState.members || []).filter(m =>
    policyMatchesRoles(p.zielgruppen, effectiveRoles(m.upn, m.department)));
  const byUpn = {};
  (AdminState.allAcks || [])
    .filter(a => a.richtlinieId === p.id && a.version === p.version)
    .forEach(a => { byUpn[(a.benutzerUpn || '').toLowerCase()] = a; });
  return members.map(m => {
    const a = byUpn[m.upn.toLowerCase()];
    let st = 'offen', date = '', score = null;
    if (a && !(typeof isExpired === 'function' && isExpired(p, a))) {
      score = a.quizScore;
      const fertig = p.quizErforderlich ? a.quizBestanden : !!a.gelesenAm;
      if (fertig) { st = 'abgeschlossen'; date = a.abgeschlossenAm || a.gelesenAm; }
      else if (a.gelesenAm) { st = 'gelesen'; date = a.gelesenAm; }
    }
    return { name: m.name, upn: m.upn, department: m.department || '', st, date, score };
  });
}

function renderComplianceOverview() {
  const body = document.getElementById('compliance-body');
  if (!body) return;
  const pubs = State.policies.filter(p => p.status === 'Veröffentlicht' && p.pflicht);
  if (!pubs.length) { body.innerHTML = emptyState('Keine veröffentlichten Pflicht-Richtlinien.'); return; }

  const perPolicy = pubs.map(p => {
    const rows = _complianceRowsFor(p);
    const done = rows.filter(r => r.st === 'abgeschlossen').length;
    return { p, soll: rows.length, done, offen: rows.length - done, quote: rows.length ? Math.round(done / rows.length * 100) : 100 };
  });

  // Aggregation pro Abteilung (Person × Pflicht-Richtlinie)
  const deptAgg = {};
  pubs.forEach(p => _complianceRowsFor(p).forEach(r => {
    const d = r.department || '(ohne Abteilung)';
    const e = deptAgg[d] = deptAgg[d] || { soll: 0, done: 0 };
    e.soll++; if (r.st === 'abgeschlossen') e.done++;
  }));

  const totalSoll = perPolicy.reduce((s, x) => s + x.soll, 0);
  const totalDone = perPolicy.reduce((s, x) => s + x.done, 0);
  const totalQuote = totalSoll ? Math.round(totalDone / totalSoll * 100) : 100;
  const qc = q => q >= 90 ? 'quote-hi' : q >= 60 ? 'quote-mid' : 'quote-lo';

  body.innerHTML = `
    <div class="stats-grid">
      ${statCard('blue', '📋', pubs.length, 'Pflicht-Richtlinien')}
      ${statCard('green', '✓', totalDone, 'Abschlüsse gesamt')}
      ${statCard('orange', '⏳', totalSoll - totalDone, 'Ausstehend gesamt')}
      ${statCard('purple', '📊', totalQuote + '%', 'Gesamt-Erfüllung')}
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-header"><h2>Pro Richtlinie</h2></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Richtlinie</th><th>Zielgruppe</th><th class="num">Soll</th><th class="num">Erledigt</th><th class="num">Offen</th><th>Quote</th></tr></thead>
        <tbody>${perPolicy.map(x => `<tr style="cursor:pointer" onclick="openComplianceFor('${x.p.id}')">
          <td>${esc(x.p.title)} <span style="color:var(--c-faint)">v${esc(x.p.version)}</span></td>
          <td style="color:var(--c-muted)">${esc(zielgruppenLabel(x.p))}</td>
          <td class="num">${x.soll}</td><td class="num">${x.done}</td><td class="num">${x.offen}</td>
          <td><span class="quote-pill ${qc(x.quote)}">${x.quote}%</span></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-header"><h2>Pro Abteilung</h2></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Abteilung</th><th class="num">Pflichten (Soll)</th><th class="num">Erledigt</th><th>Quote</th></tr></thead>
        <tbody>${Object.keys(deptAgg).sort((a, b) => a.localeCompare(b, 'de')).map(d => {
          const e = deptAgg[d]; const q = e.soll ? Math.round(e.done / e.soll * 100) : 100;
          return `<tr><td>${esc(d)}</td><td class="num">${e.soll}</td><td class="num">${e.done}</td><td><span class="quote-pill ${qc(q)}">${q}%</span></td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
}

function openComplianceFor(id) {
  AdminState.complianceMode = 'single';
  AdminState._jumpToPolicy = id;
  renderCompliance();
}

function renderComplianceDetail() {
  const sel = document.getElementById('compliance-policy');
  const body = document.getElementById('compliance-body');
  if (!body) return;
  const p = State.policies.find(x => x.id === (sel ? sel.value : null));
  if (!p) { body.innerHTML = emptyState('Keine veröffentlichte Pflicht-Richtlinie.'); return; }

  const rows = _complianceRowsFor(p);
  rows.sort((a, b) => (a.st === b.st ? a.name.localeCompare(b.name, 'de') : a.st.localeCompare(b.st)));
  AdminState.lastComplianceRows = rows;
  AdminState.lastCompliancePolicy = p;

  const done = rows.filter(r => r.st === 'abgeschlossen').length;
  const gelesen = rows.filter(r => r.st === 'gelesen').length;
  const offen = rows.length - done - gelesen;
  const quote = rows.length ? Math.round(done / rows.length * 100) : 0;
  const qCls = quote >= 90 ? 'quote-hi' : quote >= 60 ? 'quote-mid' : 'quote-lo';

  body.innerHTML = `
    <div class="stats-grid">
      ${statCard('blue', '👥', rows.length, 'Mitarbeiter (Soll)')}
      ${statCard('green', '✓', done, 'Abgeschlossen')}
      ${statCard('orange', '⏳', offen + gelesen, 'Ausstehend')}
      ${statCard('purple', '📊', quote + '%', 'Erfüllungsquote')}
    </div>
    <div class="card">
      <div class="card-header">
        <h2>${esc(p.title)} <span style="font-weight:400;color:var(--c-muted)">· v${esc(p.version)} · 👥 ${esc(zielgruppenLabel(p))}</span></h2>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="remindOpenForCurrent()">⏰ Offene erinnern</button>
          <button class="btn btn-outline btn-sm" onclick="zielgruppeInformierenAktuell()"
            title="Bekanntgabe an den Verteiler der Zielgruppe – auch nachträglich oder erneut">📣 Zielgruppe informieren</button>
          <span class="quote-pill ${qCls}">${quote}% erfüllt</span>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Mitarbeiter</th><th>E-Mail</th><th>Status</th><th>Datum</th>${p.quizErforderlich ? '<th class="num">Test</th>' : ''}</tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td>${esc(r.name)}</td>
              <td style="color:var(--c-muted)">${esc(r.upn)}</td>
              <td>${complianceBadge(r.st)}</td>
              <td>${r.date ? fmtDate(r.date) : '–'}</td>
              ${p.quizErforderlich ? `<td class="num">${r.score != null && r.st !== 'offen' ? r.score + '%' : '–'}</td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function complianceBadge(st) {
  if (st === 'abgeschlossen') return '<span class="status-badge sb-done">✓ Abgeschlossen</span>';
  if (st === 'gelesen') return '<span class="status-badge sb-read">Gelesen</span>';
  return '<span class="status-badge sb-open">Offen</span>';
}

/** Bekanntgabe an die Zielgruppe des gerade betrachteten Regelwerks. */
function zielgruppeInformierenAktuell() {
  const p = AdminState.lastCompliancePolicy;
  if (!p) { toast('Kein Regelwerk gewählt.', 'error'); return; }
  if (typeof zielgruppeInformieren === 'function') zielgruppeInformieren(p.id);
}

/* ── #4 Erinnerung an offene Mitarbeiter der aktuell gewählten Richtlinie ── */
async function remindOpenForCurrent() {
  const p = AdminState.lastCompliancePolicy;
  const rows = AdminState.lastComplianceRows || [];
  if (!p) { toast('Keine Richtlinie gewählt.', 'error'); return; }
  const offene = [...new Set(rows.filter(r => r.st !== 'abgeschlossen').map(r => r.upn))];
  if (!offene.length) { toast('Keine offenen Mitarbeiter – nichts zu erinnern.', 'success'); return; }
  if (!await uiConfirm(`Erinnerungs-Mail an ${offene.length} Mitarbeiter zu „${p.title}" senden?`, { title: 'Erinnerung senden', okLabel: 'Senden' })) return;
  try {
    const ok = await spSendMail(offene, `Erinnerung: Pflicht-Richtlinie „${p.title}"`, reminderHtml(p));
    if (ok) toast(`Erinnerung an ${offene.length} Mitarbeiter gesendet ✓`, 'success');
  } catch (e) {
    toast('Mail-Versand fehlgeschlagen: ' + e.message, 'error');
  }
}

function reminderHtml(p) {
  const url = 'https://rms.dihag.de/';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;font-size:15px;line-height:1.6;color:#1e2939">
    <p>Hallo,</p>
    <p>für die Pflicht-Richtlinie <b>„${esc(p.title)}"</b> (Version ${esc(p.version)}) liegt von Ihnen noch keine ${p.quizErforderlich ? 'abgeschlossene Bearbeitung (Kenntnisnahme + Wissenstest)' : 'Kenntnisnahme'} vor.</p>
    ${geltungsbereichLabel(p.geltungsbereich) ? `<p style="color:#6b7280;font-size:14px">Gilt für: ${esc(geltungsbereichLabel(p.geltungsbereich))}</p>` : ''}
    <p>Bitte holen Sie das zeitnah nach:</p>
    <p><a href="${url}" style="display:inline-block;background:#17509e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:7px;font-weight:600">Zum Richtlinienmanagement →</a></p>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Automatische Erinnerung vom DIHAG Richtlinienmanagementsystem.</p>
  </div>`;
}

function exportComplianceCsv() {
  const rows = AdminState.lastComplianceRows;
  const p = AdminState.lastCompliancePolicy;
  if (!rows || !rows.length || !p) { toast('Nichts zu exportieren.', 'error'); return; }
  const head = ['Mitarbeiter', 'E-Mail', 'Status', 'Datum', 'Quiz-Score'];
  const lines = [head.join(';')];
  rows.forEach(r => lines.push([
    _csv(r.name), _csv(r.upn), _csv(r.st),
    _csv(r.date ? fmtDateTime(r.date) : ''),
    r.score != null && r.st !== 'offen' ? r.score + '%' : '',
  ].join(';')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Compliance_${p.title}_v${p.version}.csv`.replace(/[^a-z0-9_.-]/gi, '_');
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportOverviewCsv() {
  const pubs = State.policies.filter(p => p.status === 'Veröffentlicht' && p.pflicht);
  if (!pubs.length) { toast('Nichts zu exportieren.', 'error'); return; }
  const lines = ['Richtlinie;Version;Zielgruppe;Soll;Erledigt;Offen;Quote'];
  pubs.forEach(p => {
    const rows = _complianceRowsFor(p);
    const done = rows.filter(r => r.st === 'abgeschlossen').length;
    const q = rows.length ? Math.round(done / rows.length * 100) : 100;
    lines.push([_csv(p.title), _csv(p.version), _csv(zielgruppenLabel(p)), rows.length, done, rows.length - done, q + '%'].join(';'));
  });
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Compliance_Gesamtuebersicht.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function _csv(s) { s = String(s ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

/* ═══════════════════════════════════════════════════
   Einstellungen (access-config)
═══════════════════════════════════════════════════ */

/* ── Azure-AD-Abteilungen (Transparenz für automatische Rollenzuordnung) ── */
async function loadAdDepartments() {
  const host = document.getElementById('ad-departments');
  if (!host) return;
  host.innerHTML = '<div class="doc-loading">Lade Mitarbeiter aus Azure-AD …</div>';
  try {
    if (!AdminState.members) AdminState.members = await spGetMembers();
    const members = AdminState.members;
    const byDept = {};
    let ohne = 0;
    members.forEach(m => {
      const d = (m.department || '').trim();
      if (!d) { ohne++; return; }
      (byDept[d] = byDept[d] || []).push(m.name);
    });
    const depts = Object.keys(byDept).sort((a, b) => a.localeCompare(b, 'de'));
    AdminState.lastDepts = depts;
    if (!depts.length) {
      host.innerHTML = `<div class="col-warning" style="display:block;margin:0">Im Azure-AD ist bei allen ${members.length} Mitarbeitern das Feld „Abteilung" leer. Automatische Zuordnung greift daher nicht — pflege die Abteilung in den AD-Profilen oder nutze die manuelle Zuordnung unten.</div>`;
      return;
    }
    host.innerHTML = depts.map((d, i) => {
      const inRoles = (_cfgEdit.roles || []).some(r => r.toLowerCase() === d.toLowerCase());
      return `<div class="dp-row" style="cursor:default">
        <span class="ic">🏢</span>
        <span class="nm">${esc(d)} <span style="color:var(--c-faint)">· ${byDept[d].length} Mitarbeiter</span></span>
        ${inRoles
          ? '<span class="status-badge sb-done">ist Rolle ✓</span>'
          : `<button class="btn btn-outline btn-sm" onclick="cfgAddRoleNamed(${i})">Als Rolle übernehmen</button>`}
      </div>`;
    }).join('') + (ohne ? `<div class="field-hint" style="margin-top:8px">${ohne} Mitarbeiter ohne Abteilung im AD (greifen nur über manuelle Zuordnung).</div>` : '');
  } catch (e) {
    host.innerHTML = `<div class="col-warning" style="display:block;margin:0">Mitarbeiter konnten nicht geladen werden: ${esc(e.message)}<br>Benötigt die Graph-Berechtigung <b>User.Read.All</b> (Admin-Consent).</div>`;
  }
}

function renderCfgLists() {
  ['admins', 'genehmiger', 'pruefer', 'geschaeftsleitung', 'kiGenehmiger', 'ismsVerantwortlich', 'vorschlagEmpfaenger', 'probelaufUser', 'govStrukturKoepfe'].forEach(role => {
    const host = document.getElementById('cfg-' + role);
    if (!host) return;
    const arr = _cfgEdit[role] || [];
    host.innerHTML = arr.length ? arr.map((u, i) => `
      <div class="dp-row" style="cursor:default">
        <span class="ic">👤</span>
        <span class="nm">${esc(u)}</span>
        ${role === 'kiGenehmiger' ? kiRolleSelect(u) : ''}
        <button class="btn btn-ghost btn-sm" onclick="cfgRemove('${role}',${i})">✕</button>
      </div>`).join('') : '<div class="field-hint">Noch niemand zugewiesen.</div>';
  });
}

/* Dropdown „Position" je KI-Gremiumsmitglied (Legal/Datenschutz/Compliance/IT). */
function kiRolleSelect(upn) {
  const cur = (_cfgEdit.kiGenehmigerRollen || {})[upn] || '';
  const opts = KI_GREMIUM_ROLLEN.map(r =>
    `<option value="${r}" ${cur === r ? 'selected' : ''}>${r}</option>`).join('');
  return `<select class="sort-select" style="font-size:.78rem;padding:4px 8px"
    onchange="kiRolleSet('${esc(upn)}', this.value)">
    <option value="">Position…</option>${opts}
  </select>`;
}

function kiRolleSet(upn, rolle) {
  if (!_cfgEdit.kiGenehmigerRollen) _cfgEdit.kiGenehmigerRollen = {};
  if (rolle) _cfgEdit.kiGenehmigerRollen[upn] = rolle;
  else delete _cfgEdit.kiGenehmigerRollen[upn];
}

/* ── Verfügbare Rollen ── */
function renderRolesList() {
  const host = document.getElementById('cfg-roles');
  if (!host) return;
  const arr = _cfgEdit.roles || [];
  host.innerHTML = arr.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${arr.map((r, i) =>
        `<span class="ur-chip on" style="cursor:default">${esc(r)}<button onclick="cfgRemoveRole(${i})" title="Entfernen" style="background:none;border:none;cursor:pointer;color:inherit;font-size:.95rem;line-height:1;padding:0">✕</button></span>`).join('')}</div>`
    : '<div class="field-hint">Keine Rollen definiert.</div>';
}

/* ── Mitarbeiter-Rollen (manuell) ── */
function renderUserRolesList() {
  const host = document.getElementById('cfg-userroles');
  if (!host) return;
  const roles = _cfgEdit.roles || [];
  const upns = Object.keys(_cfgEdit.userRoles || {});
  host.innerHTML = upns.length ? upns.map((upn, ui) => `
    <div style="border:1px solid var(--c-border);border-radius:9px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="flex:1;font-weight:600;font-size:.85rem">👤 ${esc(upn)}</span>
        <button class="btn btn-ghost btn-sm" onclick="urRemoveUser(${ui})">Entfernen</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${roles.length ? roles.map((r, ri) => {
          const on = (_cfgEdit.userRoles[upn] || []).includes(r);
          return `<label class="ur-chip ${on ? 'on' : ''}"><input type="checkbox" ${on ? 'checked' : ''} onchange="urToggle(${ui},${ri},this.checked)" style="position:absolute;opacity:0;width:0;height:0">${esc(r)}</label>`;
        }).join('') : '<span class="field-hint">Erst Rollen oben definieren.</span>'}
      </div>
    </div>`).join('') : '<div class="field-hint">Noch keine manuellen Zuordnungen. (Ohne Eintrag greift die AD-Abteilung.)</div>';
}
function urAddUser() {
  const inp = document.getElementById('cfg-input-ur');
  const val = (inp.value || '').trim().toLowerCase();
  if (!val || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { toast('Bitte gültige E-Mail eingeben.', 'error'); return; }
  if (!_cfgEdit.userRoles) _cfgEdit.userRoles = {};
  if (Object.keys(_cfgEdit.userRoles).some(k => k.toLowerCase() === val)) { toast('Mitarbeiter bereits in der Liste.', 'error'); return; }
  _cfgEdit.userRoles[val] = [];
  inp.value = '';
  renderUserRolesList();
}
function urRemoveUser(ui) {
  const upn = Object.keys(_cfgEdit.userRoles)[ui];
  if (upn) delete _cfgEdit.userRoles[upn];
  renderUserRolesList();
}
function urToggle(ui, ri, checked) {
  const upn = Object.keys(_cfgEdit.userRoles)[ui];
  const role = (_cfgEdit.roles || [])[ri];
  if (!upn || !role) return;
  const arr = _cfgEdit.userRoles[upn] || (_cfgEdit.userRoles[upn] = []);
  const idx = arr.indexOf(role);
  if (checked && idx < 0) arr.push(role);
  else if (!checked && idx >= 0) arr.splice(idx, 1);
  renderUserRolesList();
}
