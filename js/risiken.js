'use strict';

/**
 * Reiter „Risiko-Register" (ISO 27001 Klausel 6.1.2/6.1.3, 8.2/8.3)
 * ==================================================================
 * Vollständiges Risikomanagement: Brutto-/Netto-Bewertung (5×5-Matrix
 * Eintrittswahrscheinlichkeit × Auswirkung), Behandlungsstrategie mit
 * Maßnahmenplan (Verantwortliche + Fristen), Verknüpfung zu ISO-/NIS2-Controls
 * und Richtlinien, Schutzziele (V/I/V), Wiedervorlage-Termin und lückenlose
 * Historie. Gespeichert in der SharePoint-Liste „Risiken" (wird bei Bedarf
 * automatisch angelegt). Rein deterministisch, ohne KI.
 * Der Erinnerungs-Cron mailt überfällige Maßnahmen/Reviews an die Admins.
 */

const RISK_BEHANDLUNG = ['mitigieren', 'vermeiden', 'übertragen', 'akzeptieren'];
const RISK_STATUS = ['offen', 'in Behandlung', 'geschlossen'];
const RISK_MSTATUS = ['offen', 'in Umsetzung', 'erledigt'];
const RISK_KATEGORIEN = ['Organisation', 'Personal', 'Technik / IT', 'Physisch / Umgebung', 'Lieferanten / Dienstleister', 'Recht / Compliance'];
const RISK_E_LABELS = ['', 'sehr selten', 'selten', 'möglich', 'wahrscheinlich', 'fast sicher'];
const RISK_A_LABELS = ['', 'gering', 'spürbar', 'erheblich', 'schwerwiegend', 'existenzbedrohend'];

let _risks = null;            // geladene Risiken (Cache)
let _risksLoading = false;
let _riskEditing = null;      // aktuell bearbeitetes Risiko (Kopie)
let _riskFilter = { q: '', status: '', behandlung: '', cell: null, basis: 'netto' };
let _riskMembers = null;      // Mitarbeiter für die Eigner-Auswahl

/* ── Scoring ── */

function riskScore(e, a) { const s = (Number(e) || 0) * (Number(a) || 0); return s > 0 ? s : 0; }
function riskStufe(score) {
  if (!score) return '';
  if (score >= 15) return 'hoch';
  if (score >= 8) return 'mittel';
  return 'niedrig';
}
function _riskStufeStyle(stufe) {
  if (stufe === 'hoch')    return 'background:#fee2e2;color:#991b1b;border-color:#fecaca';
  if (stufe === 'mittel')  return 'background:#fef9c3;color:#854d0e;border-color:#fde68a';
  if (stufe === 'niedrig') return 'background:#dcfce7;color:#166534;border-color:#bbf7d0';
  return 'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb';
}
function _riskScoreBadge(e, a) {
  const s = riskScore(e, a);
  const st = riskStufe(s);
  return `<span style="display:inline-block;border:1px solid;border-radius:6px;padding:1px 7px;font-size:.72rem;font-weight:700;${_riskStufeStyle(st)}" title="Eintritt ${e || '–'} × Auswirkung ${a || '–'}">${s || '–'}${st ? ' · ' + st : ''}</span>`;
}

/** Effektive (Netto-, sonst Brutto-)Bewertung eines Risikos. */
function _riskEff(r) { return (r.netto && r.netto.e && r.netto.a) ? r.netto : r.brutto; }

/* ── Fristen / Überfälligkeit ── */

function _riskOverdueMassnahmen(r) {
  const today = new Date().toISOString().slice(0, 10);
  return (r.massnahmen || []).filter(m => m.status !== 'erledigt' && m.frist && m.frist.slice(0, 10) < today);
}
function _riskReviewOverdue(r) {
  if (r.status === 'geschlossen' || !r.naechsteReview) return false;
  return r.naechsteReview.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

/* ── Laden / Rendern ── */

async function initRisiken() {
  const mount = document.getElementById('risiken-mount');
  if (!mount) return;
  if (_risks) { renderRisiken(); return; }
  mount.innerHTML = '<div class="doc-loading">Lade Risiko-Register …</div>';
  _risksLoading = true;
  try {
    _risks = await spGetRisks();
  } catch (e) {
    _risks = null;
    _risksLoading = false;
    const ismsUrl  = (typeof spIsmsSiteUrl === 'function') ? spIsmsSiteUrl() : 'https://dihag.sharepoint.com/sites/ISMS';
    const contents = ismsUrl + '/_layouts/15/viewlsts.aspx';
    const riskCols = (typeof RISK_COLUMNS !== 'undefined') ? RISK_COLUMNS : [];
    const colList  = riskCols.map(c => `<code>${esc(c.name)}</code> <span style="color:var(--c-muted)">(${esc(c.typ)})</span>`).join(' · ');
    mount.innerHTML = `<div class="col-warning" style="display:block">
      <b>Risiko-Register nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:10px">Die Liste „Risiken" liegt bewusst auf der <b>ISMS-Site</b>
        <a href="${esc(ismsUrl)}" target="_blank" rel="noopener">${esc(ismsUrl)}</a>. Die App legt sie beim
        ersten Zugriff automatisch an – dafür braucht dein Konto dort das Recht, Listen zu erstellen.</div>
      <div style="margin-top:10px"><b>Manuell anlegen:</b>
        <a href="${esc(contents)}" target="_blank" rel="noopener">Websiteinhalte der ISMS-Site öffnen ↗</a>
        → „+ Neu" → „Liste" → Name <code>Risiken</code>, dann diese Spalten hinzufügen und „↻ Aktualisieren":</div>
      <div style="margin-top:8px;line-height:1.9">${colList}</div>
      <div style="margin-top:8px;font-size:.8rem;color:var(--c-muted)">
        Interne Namen exakt übernehmen (Groß-/Kleinschreibung, keine Umlaute). „Mehrere Zeilen Text" = einfacher Text.
        Alternativ: ein Admin gibt deinem Konto auf der ISMS-Site das Recht „Listen erstellen" – dann legt die App die Liste selbst an.</div>
    </div>`;
    return;
  }
  _risksLoading = false;
  renderRisiken();
}

async function refreshRisiken() {
  _risks = null;
  await initRisiken();
  if (typeof toast === 'function') toast('Risiko-Register aktualisiert', 'success');
}

function _riskFiltered() {
  let rows = (_risks || []).slice();
  const f = _riskFilter;
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter(r => (r.titel + ' ' + r.kategorie + ' ' + r.eigner + ' ' + r.beschreibung).toLowerCase().includes(q));
  }
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.behandlung) rows = rows.filter(r => r.behandlung === f.behandlung);
  if (f.cell) {
    rows = rows.filter(r => {
      const b = f.basis === 'brutto' ? r.brutto : _riskEff(r);
      return b.e === f.cell.e && b.a === f.cell.a;
    });
  }
  // Standard: nach effektivem Score absteigend, geschlossene ans Ende
  rows.sort((x, y) => {
    if ((x.status === 'geschlossen') !== (y.status === 'geschlossen')) return x.status === 'geschlossen' ? 1 : -1;
    return riskScore(_riskEff(y).e, _riskEff(y).a) - riskScore(_riskEff(x).e, _riskEff(x).a);
  });
  return rows;
}

/** 5×5-Matrix (Auswirkung ↑, Eintritt →) mit Anzahl je Zelle; Klick filtert. */
function _riskMatrixHtml() {
  const basis = _riskFilter.basis;
  const open = (_risks || []).filter(r => r.status !== 'geschlossen');
  const count = {};
  for (const r of open) {
    const b = basis === 'brutto' ? r.brutto : _riskEff(r);
    if (b.e >= 1 && b.a >= 1) count[b.e + '/' + b.a] = (count[b.e + '/' + b.a] || 0) + 1;
  }
  let rows = '';
  for (let a = 5; a >= 1; a--) {
    let cells = `<td style="font-size:.66rem;color:var(--c-muted);text-align:right;padding:2px 6px;white-space:nowrap">${a} · ${esc(RISK_A_LABELS[a])}</td>`;
    for (let e = 1; e <= 5; e++) {
      const n = count[e + '/' + a] || 0;
      const st = riskStufe(riskScore(e, a));
      const sel = _riskFilter.cell && _riskFilter.cell.e === e && _riskFilter.cell.a === a;
      cells += `<td onclick="riskCellFilter(${e},${a})" title="Eintritt ${e} (${esc(RISK_E_LABELS[e])}) × Auswirkung ${a} (${esc(RISK_A_LABELS[a])}) = ${riskScore(e, a)} · ${n} offene(s) Risiko(en)"
        style="${_riskStufeStyle(st)};border:2px solid ${sel ? '#1a56db' : 'transparent'};outline:1px solid rgba(0,0,0,.06);border-radius:6px;width:52px;height:38px;text-align:center;cursor:pointer;font-weight:800;font-size:.9rem">${n || ''}</td>`;
    }
    rows += `<tr>${cells}</tr>`;
  }
  let footer = '<td></td>';
  for (let e = 1; e <= 5; e++) footer += `<td style="font-size:.66rem;color:var(--c-muted);text-align:center;padding:2px">${e} · ${esc(RISK_E_LABELS[e])}</td>`;
  return `<div style="background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:12px;padding:14px 16px;margin-bottom:14px;overflow-x:auto">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
      <b style="font-size:.85rem">Risikomatrix (offene Risiken, ${basis === 'brutto' ? 'Brutto' : 'Netto/effektiv'})</b>
      <button class="btn btn-outline btn-sm" onclick="_riskFilter.basis='${basis === 'brutto' ? 'netto' : 'brutto'}';renderRisiken()">↔ ${basis === 'brutto' ? 'Netto' : 'Brutto'} zeigen</button>
      ${_riskFilter.cell ? `<button class="btn btn-ghost btn-sm" onclick="_riskFilter.cell=null;renderRisiken()">✕ Zellen-Filter aufheben</button>` : ''}
      <span style="font-size:.7rem;color:var(--c-muted)">Zelle anklicken = Liste filtern · Schwellen: ≥15 hoch · ≥8 mittel</span>
    </div>
    <table style="border-collapse:separate;border-spacing:3px"><tbody>${rows}<tr>${footer}</tr></tbody></table>
    <div style="font-size:.66rem;color:var(--c-muted);margin-top:4px">↑ Auswirkung · → Eintrittswahrscheinlichkeit</div>
  </div>`;
}

function riskCellFilter(e, a) {
  const c = _riskFilter.cell;
  _riskFilter.cell = (c && c.e === e && c.a === a) ? null : { e, a };
  renderRisiken();
}

function renderRisiken() {
  const mount = document.getElementById('risiken-mount');
  if (!mount) return;
  if (!_risks) { if (!_risksLoading) initRisiken(); return; }
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('risiken');
  const all = _risks;
  const open = all.filter(r => r.status !== 'geschlossen');
  const hoch = open.filter(r => riskStufe(riskScore(_riskEff(r).e, _riskEff(r).a)) === 'hoch').length;
  const massnahmenOffen = all.reduce((s, r) => s + (r.massnahmen || []).filter(m => m.status !== 'erledigt').length, 0);
  const massnahmenUeberf = all.reduce((s, r) => s + _riskOverdueMassnahmen(r).length, 0);
  const reviewsUeberf = all.filter(_riskReviewOverdue).length;
  const missing = (typeof spMissingRiskColumns === 'function') ? spMissingRiskColumns() : [];

  const kpi = (n, label, col) => `<div style="flex:1;min-width:118px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  const rows = _riskFiltered();
  const table = rows.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Risiko</th><th>Kategorie</th><th>Eigner</th><th>Brutto</th><th>Netto</th><th>Behandlung</th><th>Maßnahmen</th><th>Status</th><th>Review</th></tr></thead>
    <tbody>${rows.map(r => {
      const mDone = (r.massnahmen || []).filter(m => m.status === 'erledigt').length;
      const mAll = (r.massnahmen || []).length;
      const mOver = _riskOverdueMassnahmen(r).length;
      const revOver = _riskReviewOverdue(r);
      return `<tr onclick="openRiskEditor('${esc(r.id)}')" style="cursor:pointer${r.status === 'geschlossen' ? ';opacity:.55' : ''}">
        <td><b>${esc(r.titel)}</b>${r.schutzziele && r.schutzziele.length ? `<span style="margin-left:6px;font-size:.66rem;color:var(--c-muted)">${esc(r.schutzziele.join('·'))}</span>` : ''}
          ${r.controls && r.controls.length ? `<div style="font-size:.68rem;color:var(--c-faint)">🔖 ${esc(r.controls.slice(0, 6).join(', '))}${r.controls.length > 6 ? ' …' : ''}</div>` : ''}</td>
        <td style="color:var(--c-muted)">${esc(r.kategorie || '–')}</td>
        <td style="color:var(--c-muted)">${esc(r.eigner || '–')}</td>
        <td>${_riskScoreBadge(r.brutto.e, r.brutto.a)}</td>
        <td>${(r.netto.e && r.netto.a) ? _riskScoreBadge(r.netto.e, r.netto.a) : '<span style="color:var(--c-faint)">–</span>'}</td>
        <td>${esc(r.behandlung || '–')}</td>
        <td>${mAll ? `${mDone}/${mAll}${mOver ? ` <span style="color:#b91c1c;font-weight:700" title="${mOver} Maßnahme(n) überfällig">⚠${mOver}</span>` : ''}` : '–'}</td>
        <td>${esc(r.status)}</td>
        <td style="white-space:nowrap${revOver ? ';color:#b91c1c;font-weight:600' : ''}">${r.naechsteReview ? fmtDate(r.naechsteReview) : '–'}${revOver ? ' ⚠' : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`
    : emptyState(all.length ? 'Keine Treffer für die aktuelle Filterung.' : 'Noch keine Risiken erfasst – oben „+ Neues Risiko".', all.length ? '🔍' : '🛡️');

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Risikoregister nach <b>ISO 27001 Klausel 6.1.2/6.1.3 und 8.2/8.3</b>: Bewertung
      (Eintritt × Auswirkung, 1–5), Behandlung mit Maßnahmenplan, Restrisiko und Wiedervorlage.
      Verknüpfbar mit Controls (Normbezug) und Richtlinien.
    </div>
    ${missing.length ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ In der Liste „Risiken" fehlen ${missing.length} Spalte(n):</b> ${missing.map(esc).join(' · ')} – Werte dieser Felder gehen beim Speichern verloren. Typ: Zahl bzw. „Mehrere Zeilen Text"/Text/Datum.</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kpi(all.length, 'Risiken gesamt', '#1a56db')}
      ${kpi(hoch, 'hoch (offen, effektiv)', hoch ? '#b91c1c' : '#15803d')}
      ${kpi(massnahmenOffen, 'Maßnahmen offen', massnahmenOffen ? '#b45309' : '#15803d')}
      ${kpi(massnahmenUeberf, 'Maßnahmen überfällig', massnahmenUeberf ? '#b91c1c' : '#15803d')}
      ${kpi(reviewsUeberf, 'Reviews überfällig', reviewsUeberf ? '#b91c1c' : '#15803d')}
    </div>
    ${_riskMatrixHtml()}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen (Titel, Eigner, Kategorie) …" value="${esc(_riskFilter.q)}"
        oninput="_riskFilter.q=this.value;renderRisiken()" style="width:230px">
      <select class="sort-select" onchange="_riskFilter.status=this.value;renderRisiken()">
        <option value=""${!_riskFilter.status ? ' selected' : ''}>alle Status</option>
        ${RISK_STATUS.map(s => `<option value="${esc(s)}"${_riskFilter.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <select class="sort-select" onchange="_riskFilter.behandlung=this.value;renderRisiken()">
        <option value=""${!_riskFilter.behandlung ? ' selected' : ''}>alle Behandlungen</option>
        ${RISK_BEHANDLUNG.map(s => `<option value="${esc(s)}"${_riskFilter.behandlung === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      <button class="btn btn-outline btn-sm" onclick="risikenExportReport()">🖨 Risikobericht</button>
      <button class="btn btn-outline btn-sm" onclick="risikenExportCsv()">⬇ CSV</button>
      ${canWrite ? `<button class="btn btn-primary btn-sm" onclick="openRiskEditor()">+ Neues Risiko</button>` : ''}
    </div>
    ${canWrite ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf das Risiko-Register.</div>'}
    ${table}`;
}

/* ── Editor ── */

function _riskNew() {
  return {
    id: null, titel: '', beschreibung: '', kategorie: '', eigner: '',
    schutzziele: [], brutto: { e: 0, a: 0 }, netto: { e: 0, a: 0 },
    behandlung: '', behandlungBegruendung: '', massnahmen: [],
    controls: [], richtlinien: [], status: 'offen', naechsteReview: '', historie: [],
  };
}

async function openRiskEditor(id) {
  const src = id ? (_risks || []).find(r => String(r.id) === String(id)) : null;
  _riskEditing = src ? JSON.parse(JSON.stringify(src)) : _riskNew();
  if (!_riskMembers && typeof spGetMembers === 'function') {
    spGetMembers().then(m => { _riskMembers = m; const dl = document.getElementById('rk-people'); if (dl) dl.innerHTML = m.map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join(''); }).catch(() => { _riskMembers = []; });
  }
  renderRiskEditor();
}

function _rkSel(name, val, opts, onchange, allowEmpty) {
  return `<select onchange="${onchange}">${allowEmpty ? `<option value=""${!val ? ' selected' : ''}>–</option>` : ''}
    ${opts.map(o => `<option value="${esc(o)}"${val === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
}

function _rkScale(which, key) {   // which: 'brutto'|'netto', key: 'e'|'a'
  const labels = key === 'e' ? RISK_E_LABELS : RISK_A_LABELS;
  const val = _riskEditing[which][key] || 0;
  return `<select onchange="rkSetScale('${which}','${key}',this.value)">
    <option value="0"${!val ? ' selected' : ''}>–</option>
    ${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${val === n ? ' selected' : ''}>${n} · ${esc(labels[n])}</option>`).join('')}
  </select>`;
}

function rkSetScale(which, key, v) {
  _riskEditing[which][key] = parseInt(v, 10) || 0;
  const b = document.getElementById('rk-score-' + which);
  if (b) b.innerHTML = _riskScoreBadge(_riskEditing[which].e, _riskEditing[which].a);
}

function renderRiskEditor() {
  const r = _riskEditing;
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('risiken');
  const pols = (State.policies || []).filter(p => p.status !== 'Archiviert');
  const histRows = (r.historie || []).slice().reverse().slice(0, 20).map(h =>
    `<div style="font-size:.75rem;color:var(--c-muted);padding:2px 0">${fmtDateTime(h.datum)} · <b>${esc(h.wer || '')}</b> · ${esc(h.aktion || '')}</div>`).join('');

  const body = `
    <div class="modal-header">
      <h3>${r.id ? '🛡️ Risiko bearbeiten' : '🛡️ Neues Risiko'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Risiko / Titel <span class="req">*</span></label>
          <input type="text" value="${esc(r.titel)}" oninput="_riskEditing.titel=this.value" placeholder="z. B. Ransomware-Befall der Produktions-IT"></div>
        <div class="form-group full"><label>Beschreibung / Szenario</label>
          <textarea oninput="_riskEditing.beschreibung=this.value" placeholder="Ursache → Ereignis → Auswirkung">${esc(r.beschreibung)}</textarea></div>
        <div class="form-group"><label>Kategorie</label>
          <input type="text" list="rk-kats" value="${esc(r.kategorie)}" oninput="_riskEditing.kategorie=this.value">
          <datalist id="rk-kats">${RISK_KATEGORIEN.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>
        <div class="form-group"><label>Risiko-Eigner (E-Mail)</label>
          <input type="text" list="rk-people" value="${esc(r.eigner)}" oninput="_riskEditing.eigner=this.value" placeholder="name@dihag.com">
          <datalist id="rk-people">${(_riskMembers || []).map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('')}</datalist></div>
        <div class="form-group"><label>Schutzziele</label>
          <div style="display:flex;gap:12px;padding-top:6px">
            ${[['V', 'Vertraulichkeit'], ['I', 'Integrität'], ['A', 'Verfügbarkeit']].map(([k, l]) =>
              `<label class="ack-check" style="font-weight:500" title="${l}"><input type="checkbox" ${r.schutzziele.includes(k) ? 'checked' : ''}
                onchange="rkToggleZiel('${k}',this.checked)"> ${k}</label>`).join('')}
          </div></div>
        <div class="form-group"><label>Status</label>
          ${_rkSel('status', r.status, RISK_STATUS, "_riskEditing.status=this.value", false)}</div>
        <div class="form-group"><label>Nächste Überprüfung (Review)</label>
          <input type="date" value="${esc((r.naechsteReview || '').slice(0, 10))}"
            onchange="_riskEditing.naechsteReview=this.value?new Date(this.value+'T00:00:00Z').toISOString():''"></div>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:8px">Bewertung (1–5)</div>
        <div class="form-grid">
          <div class="form-group"><label>Brutto: Eintrittswahrscheinlichkeit</label>${_rkScale('brutto', 'e')}</div>
          <div class="form-group"><label>Brutto: Auswirkung</label>${_rkScale('brutto', 'a')}
            <div style="margin-top:6px">Brutto-Risiko: <span id="rk-score-brutto">${_riskScoreBadge(r.brutto.e, r.brutto.a)}</span></div></div>
          <div class="form-group"><label>Netto (nach Maßnahmen): Eintritt</label>${_rkScale('netto', 'e')}</div>
          <div class="form-group"><label>Netto: Auswirkung</label>${_rkScale('netto', 'a')}
            <div style="margin-top:6px">Restrisiko: <span id="rk-score-netto">${_riskScoreBadge(r.netto.e, r.netto.a)}</span></div></div>
        </div>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:8px">Behandlung</div>
        <div class="form-grid">
          <div class="form-group"><label>Strategie</label>
            ${_rkSel('behandlung', r.behandlung, RISK_BEHANDLUNG, "_riskEditing.behandlung=this.value", true)}</div>
          <div class="form-group full"><label>Begründung <span style="font-weight:400;color:var(--c-muted)">(Pflicht bei „akzeptieren" – Risikoakzeptanz durch den Eigner)</span></label>
            <textarea oninput="_riskEditing.behandlungBegruendung=this.value">${esc(r.behandlungBegruendung)}</textarea></div>
        </div>
        <div style="font-weight:600;font-size:.85rem;margin:10px 0 6px">Maßnahmenplan</div>
        <div id="rk-massnahmen">${_rkMassnahmenHtml()}</div>
        <button class="btn btn-ghost btn-sm" onclick="rkAddMassnahme()">+ Maßnahme</button>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Verknüpfungen
          <span style="font-weight:500;color:var(--c-muted)">(Controls: ${r.controls.length} · Richtlinien: ${r.richtlinien.length})</span></div>
        <input type="text" id="rk-ctl-filter" placeholder="Controls filtern (z. B. „A.8", „NIS2") …" oninput="rkRenderControls()"
          style="width:100%;border:1px solid #d1d5db;border-radius:7px;padding:7px 10px;font-size:.85rem;font-family:inherit;margin-bottom:6px">
        <div id="rk-controls" style="max-height:180px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:8px">${_rkControlsHtml('')}</div>
        <div style="font-weight:600;font-size:.85rem;margin:10px 0 4px">Betroffene / mitigierende Richtlinien</div>
        <div style="max-height:150px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:8px">
          ${pols.length ? pols.map(p => `<label class="ack-check" style="font-weight:500">
            <input type="checkbox" ${r.richtlinien.includes(p.id) ? 'checked' : ''} onchange="rkTogglePolicy('${esc(p.id)}',this.checked)">
            <span>${esc(p.title)} <span style="color:var(--c-faint)">(${esc(p.status)})</span></span></label>`).join('')
          : '<div class="field-hint">Keine Richtlinien geladen.</div>'}
        </div>
      </div>

      ${histRows ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:4px">Historie</div>${histRows}</div>` : ''}
    </div>
    <div class="modal-footer">
      ${canWrite
        ? `${r.id ? `<button class="btn btn-danger btn-sm" onclick="deleteRiskConfirm('${esc(r.id)}')" style="margin-right:auto">Löschen</button>` : ''}
           <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
           <button class="btn btn-primary" id="rk-save-btn" onclick="saveRisk()">Speichern</button>`
        : `<span class="field-hint" style="margin-right:auto">👁 Nur Lesezugriff.</span>
           <button class="btn btn-outline" onclick="closeModal()">Schließen</button>`}
    </div>`;
  openModal(body, true);
}

function rkToggleZiel(z, on) {
  _riskEditing.schutzziele = (_riskEditing.schutzziele || []).filter(x => x !== z);
  if (on) _riskEditing.schutzziele.push(z);
}

function rkTogglePolicy(pid, on) {
  _riskEditing.richtlinien = (_riskEditing.richtlinien || []).filter(x => x !== pid);
  if (on) _riskEditing.richtlinien.push(pid);
}

/* Controls-Auswahl (aus dem Normen-Katalog, gefiltert) */
function _rkControlsHtml(filter) {
  if (typeof NORMEN === 'undefined') return '<div class="field-hint">Normen-Katalog nicht geladen.</div>';
  const sel = new Set(_riskEditing.controls || []);
  const f = String(filter || '').toLowerCase().trim();
  let html = '';
  for (const g of NORMEN) {
    const items = g.items.filter(it => !f || it.id.toLowerCase().includes(f) || it.label.toLowerCase().includes(f));
    if (!items.length) continue;
    html += `<div style="font-size:.7rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;margin:6px 2px 3px">${esc(g.group)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px 12px">
      ${items.map(it => `<label class="ack-check" style="font-weight:500;align-items:flex-start">
        <input type="checkbox" ${sel.has(it.id) ? 'checked' : ''} onchange="rkToggleControl('${esc(it.id)}',this.checked)">
        <span><b>${esc(it.id)}</b> ${esc(it.label)}</span></label>`).join('')}
      </div>`;
  }
  return html || '<div class="field-hint">Keine Treffer.</div>';
}
function rkRenderControls() {
  const el = document.getElementById('rk-controls');
  if (el) el.innerHTML = _rkControlsHtml(document.getElementById('rk-ctl-filter')?.value || '');
}
function rkToggleControl(id, on) {
  _riskEditing.controls = (_riskEditing.controls || []).filter(x => x !== id);
  if (on) _riskEditing.controls.push(id);
}

/* Maßnahmen-Zeilen */
function _rkMassnahmenHtml() {
  const ms = _riskEditing.massnahmen || [];
  if (!ms.length) return '<div class="field-hint" style="margin-bottom:6px">Noch keine Maßnahmen.</div>';
  const today = new Date().toISOString().slice(0, 10);
  return ms.map((m, i) => {
    const over = m.status !== 'erledigt' && m.frist && m.frist.slice(0, 10) < today;
    return `<div style="display:grid;grid-template-columns:2fr 1.2fr 130px 130px 32px;gap:6px;margin-bottom:6px;align-items:center">
      <input type="text" value="${esc(m.titel || '')}" placeholder="Maßnahme" oninput="_riskEditing.massnahmen[${i}].titel=this.value"
        style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:.82rem;font-family:inherit">
      <input type="text" list="rk-people" value="${esc(m.verantwortlich || '')}" placeholder="verantwortlich@dihag.com"
        oninput="_riskEditing.massnahmen[${i}].verantwortlich=this.value"
        style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:.82rem;font-family:inherit">
      <input type="date" value="${esc((m.frist || '').slice(0, 10))}" onchange="_riskEditing.massnahmen[${i}].frist=this.value"
        style="border:1px solid ${over ? '#ef4444' : '#d1d5db'};border-radius:6px;padding:5px 6px;font-size:.8rem;font-family:inherit" title="${over ? 'überfällig' : 'Frist'}">
      <select onchange="_riskEditing.massnahmen[${i}].status=this.value;rkRefreshMassnahmen()" style="font-size:.8rem;padding:5px 6px">
        ${RISK_MSTATUS.map(s => `<option value="${esc(s)}"${(m.status || 'offen') === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" onclick="rkRemoveMassnahme(${i})" title="Maßnahme entfernen">✕</button>
    </div>`;
  }).join('');
}
function rkRefreshMassnahmen() {
  const el = document.getElementById('rk-massnahmen');
  if (el) el.innerHTML = _rkMassnahmenHtml();
}
function rkAddMassnahme() {
  (_riskEditing.massnahmen = _riskEditing.massnahmen || []).push({ titel: '', verantwortlich: '', frist: '', status: 'offen' });
  rkRefreshMassnahmen();
}
function rkRemoveMassnahme(i) {
  _riskEditing.massnahmen.splice(i, 1);
  rkRefreshMassnahmen();
}

/* ── Speichern / Löschen ── */

async function saveRisk() {
  if (typeof canWriteTab === 'function' && !canWriteTab('risiken')) {
    if (typeof toast === 'function') toast('Nur Lesezugriff auf das Risiko-Register.', 'error'); return;
  }
  const r = _riskEditing;
  if (!r.titel.trim()) { toast('Bitte einen Titel angeben.', 'error'); return; }
  if (!r.brutto.e || !r.brutto.a) { toast('Bitte die Brutto-Bewertung (Eintritt × Auswirkung) setzen.', 'error'); return; }
  if (r.behandlung === 'akzeptieren' && !r.behandlungBegruendung.trim()) {
    toast('Risikoakzeptanz muss begründet werden (ISO 27001 6.1.3 f).', 'error'); return;
  }
  const nettoScore = riskScore(r.netto.e, r.netto.a), bruttoScore = riskScore(r.brutto.e, r.brutto.a);
  if (nettoScore > bruttoScore && !confirm('Das Netto-Risiko ist HÖHER als das Brutto-Risiko – ist das beabsichtigt?')) return;
  const wer = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '';
  (r.historie = r.historie || []).push({
    datum: new Date().toISOString(), wer,
    aktion: r.id ? `geändert (Status ${r.status}, Brutto ${bruttoScore}${nettoScore ? ', Netto ' + nettoScore : ''})`
                 : `angelegt (Brutto ${bruttoScore})`,
  });
  const btn = document.getElementById('rk-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    if (r.id) await spUpdateRisk(r.id, r);
    else await spAddRisk(r);
    closeModal();
    await refreshRisiken();
    if (typeof toast === 'function') toast('Risiko gespeichert ✓', 'success');
  } catch (e) {
    r.historie.pop();   // Eintrag zurücknehmen – nicht gespeichert
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    if (typeof toast === 'function') toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

async function deleteRiskConfirm(id) {
  if (typeof canWriteTab === 'function' && !canWriteTab('risiken')) return;
  const r = (_risks || []).find(x => String(x.id) === String(id));
  if (!r || !confirm(`Risiko „${r.titel}" endgültig löschen?\n\nHinweis: Für den Audit-Trail ist meist „Status: geschlossen" die bessere Wahl.`)) return;
  try {
    await spDeleteRisk(id);
    closeModal();
    await refreshRisiken();
    if (typeof toast === 'function') toast('Risiko gelöscht.', 'success');
  } catch (e) {
    if (typeof toast === 'function') toast('Löschen fehlgeschlagen: ' + e.message, 'error');
  }
}

/* ── Exporte ── */

function risikenExportReport() {
  const all = (_risks || []).slice().sort((x, y) => riskScore(_riskEff(y).e, _riskEff(y).a) - riskScore(_riskEff(x).e, _riskEff(x).a));
  if (!all.length) { if (typeof toast === 'function') toast('Keine Risiken zu exportieren.', 'error'); return; }
  const stamp = new Date().toLocaleString('de-DE');
  const open = all.filter(r => r.status !== 'geschlossen');
  const hoch = open.filter(r => riskStufe(riskScore(_riskEff(r).e, _riskEff(r).a)) === 'hoch').length;
  const rows = all.map(r => {
    const ms = (r.massnahmen || []).map(m =>
      `${m.titel}${m.verantwortlich ? ' (' + m.verantwortlich + (m.frist ? ', bis ' + m.frist.slice(0, 10) : '') + ')' : ''} – ${m.status || 'offen'}`).join('<br>');
    const bs = riskScore(r.brutto.e, r.brutto.a), ns = riskScore(r.netto.e, r.netto.a);
    return `<tr>
      <td><b>${esc(r.titel)}</b>${r.beschreibung ? `<div style="color:#6b7280;font-size:10px">${esc(r.beschreibung)}</div>` : ''}</td>
      <td>${esc(r.kategorie || '–')}</td><td>${esc(r.eigner || '–')}</td>
      <td style="white-space:nowrap">${r.brutto.e}×${r.brutto.a} = <b>${bs}</b> (${riskStufe(bs) || '–'})</td>
      <td style="white-space:nowrap">${ns ? `${r.netto.e}×${r.netto.a} = <b>${ns}</b> (${riskStufe(ns)})` : '–'}</td>
      <td>${esc(r.behandlung || '–')}${r.behandlungBegruendung ? `<div style="color:#6b7280;font-size:10px">${esc(r.behandlungBegruendung)}</div>` : ''}</td>
      <td style="font-size:10px">${ms || '–'}</td>
      <td>${esc(r.status)}</td>
      <td style="white-space:nowrap">${r.naechsteReview ? r.naechsteReview.slice(0, 10) : '–'}</td>
      <td style="font-size:10px">${esc((r.controls || []).join(', ') || '–')}</td>
    </tr>`;
  }).join('');
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>Risikobericht – DIHAG (${esc(stamp)})</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:24px;font-size:11px;line-height:1.4}
      h1{font-size:18px;margin:0 0 2px} .muted{color:#6b7280}
      table{border-collapse:collapse;width:100%;margin-top:10px}
      th,td{border:1px solid #d1d5db;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#111827;color:#fff;font-size:10px}
      .kpi{display:flex;gap:22px;margin:10px 0} .kpi b{font-size:19px;display:block}
      .noprint{margin:14px 0} @media print{.noprint{display:none} body{margin:12px}}
    </style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    <h1>Risikobericht (Risiko-Register)</h1>
    <div class="muted">DIHAG · ISO/IEC 27001:2022 Klausel 6.1.2/6.1.3, 8.2/8.3 · Stand ${esc(stamp)} · Schwellen: Score ≥15 hoch, ≥8 mittel</div>
    <div class="kpi">
      <div><b>${all.length}</b><span class="muted">Risiken gesamt</span></div>
      <div><b>${open.length}</b><span class="muted">offen</span></div>
      <div><b>${hoch}</b><span class="muted">hoch (effektiv)</span></div>
      <div><b>${all.reduce((s, r) => s + _riskOverdueMassnahmen(r).length, 0)}</b><span class="muted">Maßnahmen überfällig</span></div>
    </div>
    <table><thead><tr><th>Risiko</th><th>Kategorie</th><th>Eigner</th><th>Brutto</th><th>Netto</th><th>Behandlung</th><th>Maßnahmen</th><th>Status</th><th>Review</th><th>Controls</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="muted" style="margin-top:14px">Erstellt aus dem DIHAG-Richtlinienmanagement – deterministisch, ohne KI.</p>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Pop-up-Blocker? Bitte Pop-ups erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function risikenExportCsv() {
  const all = _risks || [];
  if (!all.length) { if (typeof toast === 'function') toast('Keine Risiken zu exportieren.', 'error'); return; }
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const rows = [['Risiko', 'Beschreibung', 'Kategorie', 'Eigner', 'Schutzziele', 'Brutto E', 'Brutto A', 'Brutto Score', 'Netto E', 'Netto A', 'Netto Score', 'Stufe (effektiv)', 'Behandlung', 'Begründung', 'Maßnahmen (offen/gesamt)', 'Status', 'Nächste Überprüfung', 'Controls', 'Richtlinien']];
  const polTitle = id => { const p = (State.policies || []).find(x => x.id === id); return p ? p.title : id; };
  for (const r of all) {
    const eff = _riskEff(r);
    rows.push([r.titel, r.beschreibung, r.kategorie, r.eigner, (r.schutzziele || []).join('/'),
      r.brutto.e, r.brutto.a, riskScore(r.brutto.e, r.brutto.a),
      r.netto.e || '', r.netto.a || '', riskScore(r.netto.e, r.netto.a) || '',
      riskStufe(riskScore(eff.e, eff.a)),
      r.behandlung, r.behandlungBegruendung,
      `${(r.massnahmen || []).filter(m => m.status !== 'erledigt').length}/${(r.massnahmen || []).length}`,
      r.status, r.naechsteReview ? r.naechsteReview.slice(0, 10) : '',
      (r.controls || []).join(', '), (r.richtlinien || []).map(polTitle).join(', ')]);
  }
  const csv = '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Risikoregister_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  if (typeof toast === 'function') toast('CSV heruntergeladen ✓', 'success');
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { riskScore, riskStufe, _riskEff, _riskOverdueMassnahmen, _riskReviewOverdue };
}
