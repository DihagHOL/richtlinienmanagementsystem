'use strict';

/**
 * Reiter „Ausnahmeregister" (Abweichungen von Richtlinien)
 * =======================================================
 * Der Reifegrad-Katalog dieses Systems fragt in **R130** ab:
 *
 *   „Ausnahmen: Mit Risikobewertung, befristet, Entscheidung dokumentiert,
 *    ISB einbeziehen"
 *
 * Bis hierher konnte das RMS diese Frage nicht beantworten. Eine Abweichung
 * wurde per Mail genehmigt, und beim Audit lag eine Excel-Tabelle auf dem
 * Tisch – oder gar nichts. Jedes der vier Worte aus R130 ist deshalb hier
 * keine Empfehlung, sondern eine Bedingung, die das Speichern verweigert:
 *
 *   • **Risikobewertung** – Eintritt × Auswirkung auf derselben 1–5-Skala wie
 *     im Risiko-Register. Ohne sie keine Genehmigung.
 *   • **Befristet** – ein Enddatum ist Pflicht. Eine unbefristete Ausnahme ist
 *     keine Ausnahme, sondern eine stille Änderung der Richtlinie.
 *   • **Entscheidung dokumentiert** – wer, wann, mit welcher Begründung. Und
 *     nach dem Vier-Augen-Prinzip: Wer beantragt, genehmigt nicht selbst.
 *   • **ISB einbeziehen** – vor der Genehmigung festgehalten, mit Datum.
 *
 * „Abgelaufen" ist bewusst **kein gespeicherter Status**, sondern wird aus dem
 * Enddatum errechnet. Ein Status, den jemand von Hand setzen müsste, wäre am
 * Tag nach dem Ablauf falsch – und niemand merkt es.
 *
 * Gespeichert in der SharePoint-Liste „Ausnahmen" auf der ISMS-Site (wird bei
 * Bedarf automatisch angelegt), Spalten in EXC_COLUMNS.
 */

/* Status, die tatsächlich gespeichert werden. „abgelaufen" fehlt hier mit
   Absicht – siehe excEffektiverStatus(). */
const EXC_STATUS = ['beantragt', 'genehmigt', 'abgelehnt', 'zurückgezogen'];

/* Höchstlaufzeit einer Ausnahme in Monaten. Darüber hinaus ist sie nicht
   verboten, aber sie muss ausdrücklich bestätigt werden: Wer eine Abweichung
   auf drei Jahre genehmigt, sollte das gewollt haben. */
const EXC_MAX_MONATE = 12;

/* Ab diesem Netto-Risikowert (Eintritt × Auswirkung) verlangt das Register
   kompensierende Maßnahmen. Gleiche Schwelle wie „hoch" im Risiko-Register –
   zwei verschiedene Grenzen für dieselbe Skala wären nicht erklärbar. */
const EXC_KOMPENSATION_AB = 15;

/* Wie lange vor dem Ablauf gewarnt wird. */
const EXC_WARNUNG_TAGE = 30;

let _excs = null;             // geladene Ausnahmen (Cache)
let _excsLoading = false;
let _excEditing = null;       // aktuell bearbeitete Ausnahme (Kopie)
let _excFilter = { q: '', status: '', werk: '', nurAktive: false };
let _excMembers = null;       // Mitarbeiter für die Personen-Auswahl

/* ── Ableitungen: Fristen und effektiver Status ── */

/** Heute als ISO-Datum (YYYY-MM-DD) – eine Stelle, damit Tests es setzen können. */
function excHeute() { return new Date().toISOString().slice(0, 10); }

/** Tage bis zum Ablauf; negativ = überfällig, null = kein Enddatum. */
function excTageBisAblauf(a) {
  if (!a || !a.befristetBis) return null;
  const ende = new Date(a.befristetBis.slice(0, 10) + 'T00:00:00Z').getTime();
  const heute = new Date(excHeute() + 'T00:00:00Z').getTime();
  return Math.round((ende - heute) / 86400000);
}

/**
 * Der Status, wie er dem Betrachter gezeigt wird.
 *
 * Gespeichert ist „genehmigt". Ob die Genehmigung heute noch trägt, hängt am
 * Enddatum – und das ändert sich ohne Zutun. Deshalb wird es gerechnet und
 * nicht abgelegt: Ein von Hand gepflegter Ablauf-Status ist genau einen Tag
 * nach dem Stichtag falsch, und das fällt niemandem auf.
 */
function excEffektiverStatus(a) {
  if (!a) return '';
  if (a.status !== 'genehmigt') return a.status;
  const tage = excTageBisAblauf(a);
  return (tage !== null && tage < 0) ? 'abgelaufen' : 'genehmigt';
}

/** Trägt die Ausnahme heute? Nur dann darf sich jemand auf sie berufen. */
function excIstAktiv(a) { return excEffektiverStatus(a) === 'genehmigt'; }

/** Läuft demnächst ab – noch gültig, aber es ist Zeit, sich zu kümmern. */
function excLaeuftAus(a) {
  if (!excIstAktiv(a)) return false;
  const tage = excTageBisAblauf(a);
  return tage !== null && tage <= EXC_WARNUNG_TAGE;
}

/** Risikowert einer Ausnahme (gleiche Rechnung wie im Risiko-Register). */
function excRisikoWert(a) {
  const e = Number(a && a.risiko && a.risiko.e) || 0;
  const w = Number(a && a.risiko && a.risiko.a) || 0;
  return e * w;
}

/* ── Sichtbarkeit ── */

/**
 * Ausnahmen der eigenen Gesellschaft.
 *
 * Eine Abweichung ohne Werksangabe gilt konzernweit und bleibt sichtbar – das
 * ist dieselbe Regel wie beim Geltungsbereich einer Richtlinie, und sie muss
 * dieselbe sein, sonst bedeutet ein leeres Feld an zwei Stellen Verschiedenes.
 */
function excSichtbare(liste) {
  const alle = Array.isArray(liste) ? liste : (_excs || []);
  if (typeof geltungSichtbar !== 'function') return alle;
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return alle.filter(a => geltungSichtbar(a.werke, upn));
}

/** Aktive Ausnahmen zu einer Richtlinie – für die Anzeige am Regelwerk. */
function excZuRichtlinie(richtlinieId) {
  const id = String(richtlinieId || '');
  if (!id) return [];
  return excSichtbare().filter(a => String(a.richtlinieId) === id && excIstAktiv(a));
}

/* ── Laden / Rendern ── */

async function initAusnahmen() {
  const mount = document.getElementById('ausnahmen-mount');
  if (!mount) return;
  if (_excs) { renderAusnahmen(); return; }
  mount.innerHTML = '<div class="doc-loading">Lade Ausnahmeregister …</div>';
  _excsLoading = true;
  try {
    _excs = await spGetExceptions();
  } catch (e) {
    _excs = null;
    _excsLoading = false;
    const ismsUrl  = (typeof spIsmsSiteUrl === 'function') ? spIsmsSiteUrl() : 'https://dihag.sharepoint.com/sites/ISMS';
    const contents = ismsUrl + '/_layouts/15/viewlsts.aspx';
    const cols = (typeof EXC_COLUMNS !== 'undefined') ? EXC_COLUMNS : [];
    const colList = cols.map(c => `<code>${esc(c.name)}</code> <span style="color:var(--c-muted)">(${esc(c.typ)})</span>`).join(' · ');
    mount.innerHTML = `<div class="col-warning" style="display:block">
      <b>Ausnahmeregister nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:10px">Die Liste „Ausnahmen" liegt wie die Risiken auf der <b>ISMS-Site</b>
        <a href="${esc(ismsUrl)}" target="_blank" rel="noopener">${esc(ismsUrl)}</a>. Die App legt sie beim
        ersten Zugriff automatisch an – dafür braucht Ihr Konto dort das Recht, Listen zu erstellen.</div>
      <div style="margin-top:10px"><b>Manuell anlegen:</b>
        <a href="${esc(contents)}" target="_blank" rel="noopener">Websiteinhalte der ISMS-Site öffnen ↗</a>
        → „+ Neu" → „Liste" → Name <code>Ausnahmen</code>, dann diese Spalten hinzufügen und „↻ Aktualisieren":</div>
      <div style="margin-top:8px;line-height:1.9">${colList}</div>
      <div style="margin-top:8px;font-size:.8rem;color:var(--c-muted)">
        Interne Namen exakt übernehmen (Groß-/Kleinschreibung, keine Umlaute). „Mehrere Zeilen Text" = einfacher Text.</div>
    </div>`;
    return;
  }
  _excsLoading = false;
  renderAusnahmen();
}

async function refreshAusnahmen() {
  _excs = null;
  await initAusnahmen();
  // Die Marker an den Regelwerkskarten hängen am selben Bestand. Wer hier eine
  // Ausnahme genehmigt und dann zurück auf „Meine Regelwerke" geht, sähe sonst
  // den Stand von vorhin – bis zum nächsten Neuladen der Seite.
  excMarkerAktualisieren();
  if (typeof toast === 'function') toast('Ausnahmeregister aktualisiert', 'success');
}

function _excGefiltert() {
  let rows = excSichtbare();
  const f = _excFilter;
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter(a => (a.titel + ' ' + a.richtlinieTitel + ' ' + a.abschnitt + ' ' + a.antragsteller
      + ' ' + a.begruendung + ' ' + a.beschreibung).toLowerCase().includes(q));
  }
  if (f.status) rows = rows.filter(a => excEffektiverStatus(a) === f.status);
  if (f.werk)   rows = rows.filter(a => (a.werke || []).includes(f.werk));
  if (f.nurAktive) rows = rows.filter(excIstAktiv);
  // Was Aufmerksamkeit braucht, steht oben: abgelaufen, dann auslaufend, dann
  // beantragt (wartet auf Entscheidung), dann der Rest nach Enddatum.
  const rang = (a) => {
    const s = excEffektiverStatus(a);
    if (s === 'abgelaufen') return 0;
    if (excLaeuftAus(a))    return 1;
    if (s === 'beantragt')  return 2;
    if (s === 'genehmigt')  return 3;
    return 4;
  };
  rows.sort((x, y) => (rang(x) - rang(y)) || String(x.befristetBis).localeCompare(String(y.befristetBis)));
  return rows;
}

function _excStatusBadge(a) {
  const s = excEffektiverStatus(a);
  const stil = {
    'genehmigt':     'background:#dcfce7;color:#166534;border-color:#bbf7d0',
    'beantragt':     'background:#fef9c3;color:#854d0e;border-color:#fde68a',
    'abgelaufen':    'background:#fee2e2;color:#991b1b;border-color:#fecaca',
    'abgelehnt':     'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb',
    'zurückgezogen': 'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb',
  }[s] || 'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb';
  const tage = excTageBisAblauf(a);
  let zusatz = '';
  if (s === 'genehmigt' && tage !== null && tage <= EXC_WARNUNG_TAGE) zusatz = ` · noch ${tage} T`;
  if (s === 'abgelaufen' && tage !== null) zusatz = ` · seit ${Math.abs(tage)} T`;
  return `<span style="display:inline-block;border:1px solid;border-radius:6px;padding:1px 7px;font-size:.72rem;font-weight:700;${stil}">${esc(s)}${zusatz}</span>`;
}

function renderAusnahmen() {
  const mount = document.getElementById('ausnahmen-mount');
  if (!mount) return;
  if (!_excs) { if (!_excsLoading) initAusnahmen(); return; }
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('ausnahmen');
  const alle = excSichtbare();
  const aktiv = alle.filter(excIstAktiv);
  const offen = alle.filter(a => a.status === 'beantragt');
  const abgelaufen = alle.filter(a => excEffektiverStatus(a) === 'abgelaufen');
  const auslaufend = alle.filter(excLaeuftAus);
  const missing = (typeof spMissingExceptionColumns === 'function') ? spMissingExceptionColumns() : [];
  const werke = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];

  const kpi = (n, label, col) => `<div style="flex:1;min-width:118px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  const rows = _excGefiltert();
  const table = rows.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Ausnahme</th><th>Richtlinie</th><th>Geltung</th><th>Risiko</th><th>Befristet bis</th><th>Entscheidung</th><th>ISB</th><th>Status</th></tr></thead>
    <tbody>${rows.map(a => {
      const wert = excRisikoWert(a);
      const stufe = (typeof riskStufe === 'function') ? riskStufe(wert) : '';
      return `<tr onclick="openAusnahmeEditor('${esc(a.id)}')" style="cursor:pointer${excIstAktiv(a) || a.status === 'beantragt' ? '' : ';opacity:.55'}">
        <td><b>${esc(a.titel)}</b>
          ${a.abschnitt ? `<div style="font-size:.68rem;color:var(--c-faint)">§ ${esc(a.abschnitt)}</div>` : ''}
          <div style="font-size:.68rem;color:var(--c-faint)">beantragt von ${esc(a.antragsteller || '–')}</div></td>
        <td style="color:var(--c-muted)">${esc(a.richtlinieTitel || '–')}</td>
        <td style="color:var(--c-muted)">${(a.werke || []).length ? esc(a.werke.join(', ')) : '<span title="ohne Werksangabe = konzernweit">konzernweit</span>'}</td>
        <td>${wert ? ((typeof _riskScoreBadge === 'function') ? _riskScoreBadge(a.risiko.e, a.risiko.a) : wert + (stufe ? ' · ' + stufe : '')) : '<span style="color:var(--c-faint)">–</span>'}</td>
        <td style="white-space:nowrap">${a.befristetBis ? fmtDate(a.befristetBis) : '<span style="color:#b91c1c;font-weight:600">unbefristet ⚠</span>'}</td>
        <td style="color:var(--c-muted)">${a.entscheider ? esc(a.entscheider) + (a.entschiedenAm ? `<div style="font-size:.68rem;color:var(--c-faint)">${fmtDate(a.entschiedenAm)}</div>` : '') : '–'}</td>
        <td style="color:var(--c-muted)">${a.isb ? '✓ ' + esc(a.isb) : '<span style="color:var(--c-faint)">–</span>'}</td>
        <td>${_excStatusBadge(a)}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`
    : emptyState(alle.length ? 'Keine Treffer für die aktuelle Filterung.' : 'Noch keine Ausnahme erfasst – oben „+ Neue Ausnahme".', alle.length ? '🔍' : '⚖️');

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Dokumentierte, <b>befristete</b> Abweichungen von Richtlinien – nach
      <b>Reifegrad R130</b> („Mit Risikobewertung, befristet, Entscheidung dokumentiert, ISB einbeziehen")
      sowie ISO 27001 5.36 (Einhaltung von Richtlinien). Ohne Enddatum, Risikobewertung, ISB-Vermerk und
      Vier-Augen-Entscheidung lässt sich eine Ausnahme hier nicht genehmigen.
    </div>
    ${missing.length ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ In der Liste „Ausnahmen" fehlen ${missing.length} Spalte(n):</b> ${missing.map(esc).join(' · ')} – Werte dieser Felder gehen beim Speichern verloren.</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kpi(aktiv.length, 'aktiv gültig', aktiv.length ? '#b45309' : '#15803d')}
      ${kpi(offen.length, 'wartet auf Entscheidung', offen.length ? '#b45309' : '#15803d')}
      ${kpi(auslaufend.length, `laufen in ${EXC_WARNUNG_TAGE} Tagen aus`, auslaufend.length ? '#b45309' : '#15803d')}
      ${kpi(abgelaufen.length, 'abgelaufen', abgelaufen.length ? '#b91c1c' : '#15803d')}
      ${kpi(alle.length, 'Einträge gesamt', '#17509e')}
    </div>
    ${abgelaufen.length ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ ${abgelaufen.length} Ausnahme(n) sind abgelaufen.</b> Die Richtlinie gilt dort seit dem Enddatum
      wieder uneingeschränkt. Entweder ist die Abweichung beendet – dann bitte auf „zurückgezogen" setzen –
      oder sie braucht eine neue Entscheidung.</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen (Titel, Richtlinie, Antragsteller) …" value="${esc(_excFilter.q)}"
        oninput="_excFilter.q=this.value;renderAusnahmen()" style="width:250px">
      <select class="sort-select" onchange="_excFilter.status=this.value;renderAusnahmen()">
        <option value=""${!_excFilter.status ? ' selected' : ''}>alle Status</option>
        ${EXC_STATUS.concat(['abgelaufen']).map(s => `<option value="${esc(s)}"${_excFilter.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <select class="sort-select" onchange="_excFilter.werk=this.value;renderAusnahmen()">
        <option value=""${!_excFilter.werk ? ' selected' : ''}>alle Werke</option>
        ${werke.map(w => `<option value="${esc(w)}"${_excFilter.werk === w ? ' selected' : ''}>${esc(w)}</option>`).join('')}
      </select>
      <label class="ack-check" style="font-weight:500"><input type="checkbox" ${_excFilter.nurAktive ? 'checked' : ''}
        onchange="_excFilter.nurAktive=this.checked;renderAusnahmen()"> nur aktuell gültige</label>
      <div style="flex:1"></div>
      <button class="btn btn-outline btn-sm" onclick="ausnahmenExportCsv()">⬇ CSV</button>
      ${canWrite ? `<button class="btn btn-primary btn-sm" onclick="openAusnahmeEditor()">+ Neue Ausnahme</button>` : ''}
    </div>
    ${canWrite ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf das Ausnahmeregister.</div>'}
    ${table}`;
}

/* ── Editor ── */

function _excNeu() {
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return {
    id: null, titel: '', beschreibung: '', richtlinieId: '', richtlinieTitel: '', abschnitt: '',
    begruendung: '', antragsteller: upn, werke: [], risiko: { e: 0, a: 0 }, risikoId: '',
    kompensation: '', status: 'beantragt', befristetBis: '', entscheider: '', entschiedenAm: '',
    entscheidungKommentar: '', isb: '', isbAm: '', historie: [],
  };
}

async function openAusnahmeEditor(id) {
  const src = id ? (_excs || []).find(a => String(a.id) === String(id)) : null;
  _excEditing = src ? JSON.parse(JSON.stringify(src)) : _excNeu();
  if (!_excMembers && typeof spGetMembers === 'function') {
    spGetMembers().then(m => {
      _excMembers = m;
      const dl = document.getElementById('exc-people');
      if (dl) dl.innerHTML = m.map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('');
    }).catch(() => { _excMembers = []; });
  }
  renderAusnahmeEditor();
}

function _excScale(key) {   // key: 'e' | 'a'
  const labels = key === 'e'
    ? (typeof RISK_E_LABELS !== 'undefined' ? RISK_E_LABELS : ['', '1', '2', '3', '4', '5'])
    : (typeof RISK_A_LABELS !== 'undefined' ? RISK_A_LABELS : ['', '1', '2', '3', '4', '5']);
  const val = _excEditing.risiko[key] || 0;
  return `<select onchange="excSetScale('${key}',this.value)">
    <option value="0"${!val ? ' selected' : ''}>–</option>
    ${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${val === n ? ' selected' : ''}>${n} · ${esc(labels[n] || n)}</option>`).join('')}
  </select>`;
}

function excSetScale(key, v) {
  _excEditing.risiko[key] = parseInt(v, 10) || 0;
  const b = document.getElementById('exc-score');
  if (b && typeof _riskScoreBadge === 'function') b.innerHTML = _riskScoreBadge(_excEditing.risiko.e, _excEditing.risiko.a);
}

function excToggleWerk(code, an) {
  const w = _excEditing.werke || (_excEditing.werke = []);
  const i = w.indexOf(code);
  if (an && i < 0) w.push(code);
  if (!an && i >= 0) w.splice(i, 1);
}

/** Richtlinie zuordnen – Titel wird mitgeschrieben, damit die SharePoint-Liste
 *  auch ohne die App lesbar bleibt (ein Auditor öffnet sie direkt). */
function excSetRichtlinie(id) {
  _excEditing.richtlinieId = id;
  const p = ((typeof State !== 'undefined' && State.policies) || []).find(x => String(x.id) === String(id));
  _excEditing.richtlinieTitel = p ? (p.titel || p.title || '') : '';
}

function renderAusnahmeEditor() {
  const a = _excEditing;
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('ausnahmen');
  const pols = ((typeof State !== 'undefined' && State.policies) || []).filter(p => p.status !== 'Archiviert');
  const werke = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];
  const risiken = (typeof _risks !== 'undefined' && Array.isArray(_risks)) ? _risks : [];
  const eff = excEffektiverStatus(a);
  const histRows = (a.historie || []).slice().reverse().slice(0, 20).map(h =>
    `<div style="font-size:.75rem;color:var(--c-muted);padding:2px 0">${fmtDateTime(h.datum)} · <b>${esc(h.wer || '')}</b> · ${esc(h.aktion || '')}</div>`).join('');

  const body = `
    <div class="modal-header">
      <h3>${a.id ? '⚖️ Ausnahme bearbeiten' : '⚖️ Neue Ausnahme'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      ${a.id ? `<div style="margin-bottom:12px">${_excStatusBadge(a)}</div>` : ''}
      <div class="form-grid">
        <div class="form-group full"><label>Kurzbezeichnung <span class="req">*</span></label>
          <input type="text" value="${esc(a.titel)}" oninput="_excEditing.titel=this.value"
            placeholder="z. B. Keine Bildschirmsperre an den Maschinenterminals Halle 3"></div>
        <div class="form-group"><label>Betroffene Richtlinie <span class="req">*</span></label>
          <select onchange="excSetRichtlinie(this.value)">
            <option value="">– bitte wählen –</option>
            ${pols.map(p => `<option value="${esc(p.id)}"${String(a.richtlinieId) === String(p.id) ? ' selected' : ''}>${esc(p.titel || p.title || p.id)}</option>`).join('')}
          </select>
          ${a.richtlinieId && !pols.some(p => String(p.id) === String(a.richtlinieId))
            ? `<div class="field-hint" style="color:#b45309">Zugeordnet: ${esc(a.richtlinieTitel || a.richtlinieId)} (nicht in der aktuellen Auswahl – archiviert oder andere Gesellschaft)</div>` : ''}</div>
        <div class="form-group"><label>Abschnitt / Kapitel</label>
          <input type="text" value="${esc(a.abschnitt)}" oninput="_excEditing.abschnitt=this.value" placeholder="z. B. 4.2 Bildschirmsperre"></div>
        <div class="form-group full"><label>Wovon genau wird abgewichen? <span class="req">*</span></label>
          <textarea oninput="_excEditing.beschreibung=this.value" placeholder="Was die Richtlinie fordert – und was stattdessen geschieht.">${esc(a.beschreibung)}</textarea></div>
        <div class="form-group full"><label>Begründung <span class="req">*</span></label>
          <textarea oninput="_excEditing.begruendung=this.value" placeholder="Warum die Abweichung nötig ist und warum die Vorgabe hier nicht erfüllbar ist.">${esc(a.begruendung)}</textarea></div>
        <div class="form-group"><label>Antragsteller (E-Mail) <span class="req">*</span></label>
          <input type="text" list="exc-people" value="${esc(a.antragsteller)}" oninput="_excEditing.antragsteller=this.value" placeholder="name@dihag.com">
          <datalist id="exc-people">${(_excMembers || []).map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('')}</datalist></div>
        <div class="form-group"><label>Befristet bis <span class="req">*</span></label>
          <input type="date" value="${esc((a.befristetBis || '').slice(0, 10))}"
            onchange="_excEditing.befristetBis=this.value?new Date(this.value+'T00:00:00Z').toISOString():''">
          <div class="field-hint">Pflicht. Eine unbefristete Ausnahme ist keine Ausnahme, sondern eine stille Änderung der Richtlinie.</div></div>
        <div class="form-group full"><label>Geltung (Werke)</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:6px">
            ${werke.map(w => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${(a.werke || []).includes(w) ? 'checked' : ''}
              onchange="excToggleWerk('${esc(w)}',this.checked)"> ${esc(w)}</label>`).join('')}
          </div>
          <div class="field-hint">Kein Haken = konzernweit.</div></div>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:8px">Risikobewertung <span class="req">*</span>
          <span style="font-weight:400;color:var(--c-muted);font-size:.78rem">– dieselbe 1–5-Skala wie im Risiko-Register</span></div>
        <div class="form-grid">
          <div class="form-group"><label>Eintrittswahrscheinlichkeit</label>${_excScale('e')}</div>
          <div class="form-group"><label>Auswirkung</label>${_excScale('a')}
            <div style="margin-top:6px">Risiko der Abweichung: <span id="exc-score">${
              (typeof _riskScoreBadge === 'function') ? _riskScoreBadge(a.risiko.e, a.risiko.a) : esc(String(excRisikoWert(a) || '–'))}</span></div></div>
          <div class="form-group"><label>Verknüpftes Risiko (optional)</label>
            <select onchange="_excEditing.risikoId=this.value">
              <option value="">– keins –</option>
              ${risiken.map(r => `<option value="${esc(r.id)}"${String(a.risikoId) === String(r.id) ? ' selected' : ''}>${esc(r.titel)}</option>`).join('')}
            </select>
            ${!risiken.length ? '<div class="field-hint">Risiko-Register in diesem Browser noch nicht geladen – Reiter „Risiko-Register" einmal öffnen.</div>' : ''}</div>
        </div>
        <div class="form-group full"><label>Kompensierende Maßnahmen${excRisikoWert(a) >= EXC_KOMPENSATION_AB ? ' <span class="req">*</span>' : ''}</label>
          <textarea oninput="_excEditing.kompensation=this.value" placeholder="Was das Risiko stattdessen begrenzt.">${esc(a.kompensation)}</textarea>
          <div class="field-hint">Ab Risikowert ${EXC_KOMPENSATION_AB} („hoch") verlangt.</div></div>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:8px">Entscheidung</div>
        <div class="form-grid">
          <div class="form-group"><label>ISB einbezogen (E-Mail)</label>
            <input type="text" list="exc-people" value="${esc(a.isb)}" oninput="_excEditing.isb=this.value" placeholder="isb@dihag.com">
            <div class="field-hint">Vor der Genehmigung erforderlich (R130).</div></div>
          <div class="form-group"><label>ISB einbezogen am</label>
            <input type="date" value="${esc((a.isbAm || '').slice(0, 10))}"
              onchange="_excEditing.isbAm=this.value?new Date(this.value+'T00:00:00Z').toISOString():''"></div>
          <div class="form-group full"><label>Kommentar zur Entscheidung</label>
            <textarea oninput="_excEditing.entscheidungKommentar=this.value" placeholder="Auflagen, Bedingungen, Vorbehalte.">${esc(a.entscheidungKommentar)}</textarea></div>
        </div>
        ${a.entscheider ? `<div class="field-hint">Entschieden von <b>${esc(a.entscheider)}</b>${a.entschiedenAm ? ' am ' + fmtDate(a.entschiedenAm) : ''} · Status: ${esc(a.status)}</div>` : ''}
      </div>

      ${histRows ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Verlauf</div>${histRows}</div>` : ''}
    </div>
    <div class="modal-footer">
      ${a.id && canWrite ? `<button class="btn btn-ghost btn-sm" onclick="deleteAusnahme('${esc(a.id)}')" style="color:#b91c1c">Löschen</button>` : ''}
      <div style="flex:1"></div>
      ${canWrite && a.status === 'beantragt' ? `
        <button class="btn btn-outline" onclick="entscheideAusnahme('abgelehnt')">Ablehnen</button>
        <button class="btn btn-primary" onclick="entscheideAusnahme('genehmigt')">Genehmigen</button>` : ''}
      ${canWrite && eff === 'genehmigt' ? `<button class="btn btn-outline" onclick="entscheideAusnahme('zurückgezogen')">Zurückziehen</button>` : ''}
      ${canWrite ? `<button class="btn btn-primary" id="exc-save-btn" onclick="saveAusnahme()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`;
  openModal(body);
}

/* ── Prüfungen ── */

/**
 * Was einem Speichern im Weg steht. Gibt Meldungen zurück, keine Wahrheitswerte –
 * eine Bedingung, die nicht sagen kann, warum sie nicht erfüllt ist, hilft
 * niemandem beim Ausfüllen.
 */
function excPflichtfehler(a) {
  const f = [];
  if (!String(a.titel || '').trim())        f.push('Kurzbezeichnung fehlt.');
  if (!String(a.richtlinieId || '').trim()) f.push('Betroffene Richtlinie fehlt.');
  if (!String(a.beschreibung || '').trim()) f.push('Es fehlt, wovon abgewichen wird.');
  if (!String(a.begruendung || '').trim())  f.push('Begründung fehlt.');
  if (!String(a.antragsteller || '').trim()) f.push('Antragsteller fehlt.');
  if (!a.befristetBis)                      f.push('Befristung fehlt – eine Ausnahme ohne Enddatum ist keine.');
  return f;
}

/** Zusätzliche Bedingungen, die erst für die Genehmigung gelten (R130). */
function excGenehmigungsfehler(a, entscheiderUpn) {
  const f = excPflichtfehler(a);
  if (!excRisikoWert(a)) f.push('Risikobewertung fehlt (Eintritt und Auswirkung).');
  if (!String(a.isb || '').trim()) f.push('ISB ist nicht einbezogen.');
  if (excRisikoWert(a) >= EXC_KOMPENSATION_AB && !String(a.kompensation || '').trim()) {
    f.push(`Ab Risikowert ${EXC_KOMPENSATION_AB} sind kompensierende Maßnahmen zu benennen.`);
  }
  // Vier-Augen-Prinzip: Wer beantragt, genehmigt nicht selbst. Das ist der
  // Unterschied zwischen einer Entscheidung und einer Selbstermächtigung.
  const anti = String(a.antragsteller || '').trim().toLowerCase();
  const ent  = String(entscheiderUpn || '').trim().toLowerCase();
  if (anti && ent && anti === ent) f.push('Vier-Augen-Prinzip: Wer die Ausnahme beantragt hat, kann sie nicht selbst genehmigen.');
  return f;
}

/** Monate zwischen heute und dem Enddatum – für die Höchstlaufzeit-Warnung. */
function excLaufzeitMonate(a) {
  const tage = excTageBisAblauf(a);
  return tage === null ? null : tage / 30.44;
}

/* ── Speichern / Entscheiden / Löschen ── */

function _excVermerk(a, aktion) {
  const wer = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '';
  (a.historie = a.historie || []).push({ datum: new Date().toISOString(), wer, aktion });
}

async function saveAusnahme() {
  if (typeof canWriteTab === 'function' && !canWriteTab('ausnahmen')) {
    if (typeof toast === 'function') toast('Nur Lesezugriff auf das Ausnahmeregister.', 'error'); return;
  }
  const a = _excEditing;
  const fehler = excPflichtfehler(a);
  if (fehler.length) { if (typeof toast === 'function') toast(fehler[0], 'error'); return; }
  const monate = excLaufzeitMonate(a);
  if (monate !== null && monate > EXC_MAX_MONATE && typeof uiConfirm === 'function'
      && !await uiConfirm(`Die Ausnahme liefe ${Math.round(monate)} Monate – länger als die vorgesehenen ${EXC_MAX_MONATE}. Eine so lange Abweichung gehört meist in die Richtlinie selbst.`,
          { title: 'Lange Laufzeit', okLabel: 'Trotzdem so speichern' })) return;
  _excVermerk(a, a.id ? `geändert (Status ${a.status})` : 'beantragt');
  await _excSchreiben(a, 'Ausnahme gespeichert ✓');
}

/**
 * Entscheiden: genehmigen, ablehnen oder zurückziehen.
 *
 * Die Genehmigung ist der Punkt, an dem R130 greift – hier wird geprüft, nicht
 * beim bloßen Erfassen. Ein Antrag darf unvollständig entstehen; eine
 * Genehmigung darf es nicht.
 */
async function entscheideAusnahme(neuerStatus) {
  if (typeof canWriteTab === 'function' && !canWriteTab('ausnahmen')) {
    if (typeof toast === 'function') toast('Nur Lesezugriff auf das Ausnahmeregister.', 'error'); return;
  }
  const a = _excEditing;
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  if (neuerStatus === 'genehmigt') {
    const fehler = excGenehmigungsfehler(a, upn);
    if (fehler.length) {
      if (typeof toast === 'function') toast('Genehmigung nicht möglich: ' + fehler[0], 'error');
      return;
    }
    const monate = excLaufzeitMonate(a);
    if (monate !== null && monate > EXC_MAX_MONATE && typeof uiConfirm === 'function'
        && !await uiConfirm(`Die Ausnahme liefe ${Math.round(monate)} Monate – länger als die vorgesehenen ${EXC_MAX_MONATE}.`,
            { title: 'Lange Laufzeit', okLabel: 'Trotzdem genehmigen' })) return;
  } else {
    const fehler = excPflichtfehler(a);
    if (fehler.length) { if (typeof toast === 'function') toast(fehler[0], 'error'); return; }
  }
  if (typeof uiConfirm === 'function' && !await uiConfirm(
      `Ausnahme „${a.titel}" auf „${neuerStatus}" setzen?`,
      { title: 'Entscheidung festhalten', okLabel: 'Ja, festhalten' })) return;
  a.status = neuerStatus;
  a.entscheider = upn;
  a.entschiedenAm = new Date().toISOString();
  _excVermerk(a, `${neuerStatus}${a.entscheidungKommentar ? ' – ' + a.entscheidungKommentar : ''}`);
  await _excSchreiben(a, `Ausnahme ${neuerStatus} ✓`);
}

async function _excSchreiben(a, meldung) {
  const btn = document.getElementById('exc-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    if (a.id) await spUpdateException(a.id, a);
    else await spAddException(a);
    if (typeof closeModal === 'function') closeModal();
    await refreshAusnahmen();
    if (typeof toast === 'function') toast(meldung, 'success');
  } catch (e) {
    a.historie.pop();   // Vermerk zurücknehmen – nicht gespeichert
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    if (typeof toast === 'function') toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

async function deleteAusnahme(id) {
  if (typeof canWriteTab === 'function' && !canWriteTab('ausnahmen')) return;
  const a = (_excs || []).find(x => String(x.id) === String(id));
  if (!a) return;
  if (typeof uiConfirm === 'function' && !await uiConfirm(
      `Ausnahme „${a.titel}" endgültig löschen? Für den Nachweis ist „zurückgezogen" meist die bessere Wahl – eine gelöschte Entscheidung lässt sich im Audit nicht mehr zeigen.`,
      { title: 'Ausnahme löschen', okLabel: 'Endgültig löschen', danger: true })) return;
  try {
    await spDeleteException(id);
    if (typeof closeModal === 'function') closeModal();
    await refreshAusnahmen();
  } catch (e) {
    if (typeof toast === 'function') toast('Löschen fehlgeschlagen: ' + e.message, 'error');
  }
}


/* ═══════════════════════════════════════════════════
   Der Hinweis an der Richtlinie
   ===================================================
   Wer eine Regel befolgen soll, muss wissen, ob sie für ihn ausgesetzt ist.
   Deshalb steht DASS eine Ausnahme gilt und bis wann an der Richtlinie selbst –
   für alle, die die Richtlinie sehen. Die Akte dazu (Begründung,
   Risikobewertung, ISB, Entscheidungskommentar) bleibt hinter dem Reiterrecht.
   Die Trennung nach Gesellschaft greift an beiden Stellen: excZuRichtlinie()
   liefert nur, was für die eigene Gesellschaft überhaupt gilt.

   Gezeichnet wird zweistufig – erst ein leerer Platzhalter, später gefüllt.
   Das Laden darf die Hauptansicht nicht aufhalten, und ein zweiter
   Zeichendurchlauf der ganzen Liste wäre dafür ein zu grobes Werkzeug.
═══════════════════════════════════════════════════ */

let _excLeiseVersucht = false;

/**
 * Den Bestand im Hintergrund holen – einmal je Sitzung, ohne etwas aufzuhalten.
 *
 * Legt bewusst keine Liste an: Das tut der Reiter, wenn ihn jemand öffnet.
 * Schlägt das Lesen fehl (kein Recht auf der ISMS-Site, Liste noch nicht da),
 * bleibt es still – dann fehlt der Hinweis, und das ist besser als eine
 * Fehlermeldung auf der Startseite, mit der niemand etwas anfangen kann.
 */
async function excHintergrundLaden() {
  if (_excs || _excsLoading || _excLeiseVersucht) return;
  if (typeof spGetExceptionsLeise !== 'function') return;
  _excLeiseVersucht = true;
  try {
    const liste = await spGetExceptionsLeise();
    if (!Array.isArray(liste)) return;   // Liste gibt es (noch) nicht
    _excs = liste;
    excMarkerAktualisieren();
  } catch (e) { /* still – der Hinweis ist eine Zugabe, kein Muss */ }
}

/** Platzhalter für den kleinen Marker an einer Regelwerkskarte. */
function excMarkerHtml(richtlinieId) {
  const id = String(richtlinieId || '');
  return `<span data-exc-fuer="${esc(id)}">${_excMarkerInhalt(id)}</span>`;
}

function _excMarkerInhalt(id) {
  if (!_excs) return '';
  const treffer = excZuRichtlinie(id);
  if (!treffer.length) return '';
  const liste = treffer.map(a => a.titel + (a.befristetBis ? ` (bis ${a.befristetBis.slice(0, 10)})` : '')).join(' · ');
  return `<span class="ic-tag" style="background:#fef3c7;color:#92400e;border-color:#fde68a"
    title="${esc(liste)}">⚖️ ${treffer.length} Ausnahme${treffer.length > 1 ? 'n' : ''}</span>`;
}

/** Platzhalter für den ausführlichen Hinweis in der Detailansicht. */
function excHinweisHtml(richtlinieId) {
  const id = String(richtlinieId || '');
  return `<div data-exc-hinweis="${esc(id)}">${_excHinweisInhalt(id)}</div>`;
}

function _excHinweisInhalt(id) {
  if (!_excs) return '';
  const treffer = excZuRichtlinie(id);
  if (!treffer.length) return '';
  const darfRegister = typeof canReadTab !== 'function' || canReadTab('ausnahmen');
  const zeilen = treffer.map(a => {
    const tage = excTageBisAblauf(a);
    const bald = tage !== null && tage <= EXC_WARNUNG_TAGE;
    return `<li style="margin:3px 0"><b>${esc(a.titel)}</b>
      – befristet bis <span style="${bald ? 'color:#b45309;font-weight:600' : ''}">${a.befristetBis ? fmtDate(a.befristetBis) : 'ohne Enddatum'}</span>${
        bald && tage >= 0 ? ` (noch ${tage} Tage)` : ''}
      · ${(a.werke || []).length ? esc(a.werke.join(', ')) : 'konzernweit'}</li>`;
  }).join('');
  return `<div class="col-warning" style="display:block;margin:12px 0">
    <b>⚖️ ${treffer.length === 1 ? 'Eine genehmigte Ausnahme' : treffer.length + ' genehmigte Ausnahmen'} von dieser Richtlinie</b>
    <ul style="margin:6px 0 0 18px;padding:0">${zeilen}</ul>
    <div style="margin-top:8px;font-size:.82rem">Im Übrigen gilt die Richtlinie unverändert.${
      darfRegister ? ` <a href="#" onclick="switchView('ausnahmen');return false">Ausnahmeregister öffnen →</a>` : ''}</div>
  </div>`;
}

/** Alle Platzhalter füllen, die gerade im Dokument stehen. */
function excMarkerAktualisieren() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  document.querySelectorAll('[data-exc-fuer]').forEach(el => {
    el.innerHTML = _excMarkerInhalt(el.getAttribute('data-exc-fuer'));
  });
  document.querySelectorAll('[data-exc-hinweis]').forEach(el => {
    el.innerHTML = _excHinweisInhalt(el.getAttribute('data-exc-hinweis'));
  });
}

/* ── Export ── */

function ausnahmenExportCsv() {
  const rows = _excGefiltert();
  const kopf = ['Titel', 'Richtlinie', 'Abschnitt', 'Beschreibung', 'Begründung', 'Antragsteller', 'Werke',
    'Risiko', 'Kompensation', 'Status', 'Befristet bis', 'Entscheider', 'Entschieden am', 'ISB', 'ISB am'];
  const zelle = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const zeilen = rows.map(a => [
    a.titel, a.richtlinieTitel, a.abschnitt, a.beschreibung, a.begruendung, a.antragsteller,
    (a.werke || []).join(' '), excRisikoWert(a) || '', a.kompensation, excEffektiverStatus(a),
    (a.befristetBis || '').slice(0, 10), a.entscheider, (a.entschiedenAm || '').slice(0, 10),
    a.isb, (a.isbAm || '').slice(0, 10),
  ].map(zelle).join(';'));
  const csv = '﻿' + [kopf.map(zelle).join(';')].concat(zeilen).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Ausnahmeregister_${excHeute()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXC_STATUS, EXC_MAX_MONATE, EXC_KOMPENSATION_AB, EXC_WARNUNG_TAGE };
}
