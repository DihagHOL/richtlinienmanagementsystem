'use strict';

/**
 * SoA – Erklärung zur Anwendbarkeit (Statement of Applicability)
 * ===============================================================
 * ISO 27001 Klausel 6.1.3 d): je Control Anwendbarkeit (ja/nein), Begründung
 * und Umsetzungsstatus. Zweiter Modus im Reiter „ISMS-Abdeckung" – die
 * Abdeckung durch Richtlinien wird automatisch eingeblendet und kann die
 * SoA vorbelegen. Gespeichert in soa-config.json (Dokumentbibliothek,
 * neben access-config.json). Rein deterministisch, ohne KI.
 */

const SOA_STATUS = ['umgesetzt', 'teilweise umgesetzt', 'geplant', 'nicht umgesetzt'];

let _soaData = null;      // { controls: { id: {anwendbar, begruendung, status} }, meta: {...} }
let _soaLoading = false;
let _soaDirty = false;    // ungespeicherte Änderungen?
let _soaFilter = { q: '', nur: '' };   // nur: '' | 'offen' | 'ausgeschlossen'

function _soaCtl(id) {
  if (!_soaData) _soaData = { controls: {}, meta: {} };
  if (!_soaData.controls) _soaData.controls = {};
  return (_soaData.controls[id] = _soaData.controls[id] || { anwendbar: null, begruendung: '', status: '' });
}

/** Ein Control gilt als „gepflegt", wenn die Anwendbarkeit entschieden ist. */
function _soaGepflegt(c) { return c && (c.anwendbar === true || c.anwendbar === false); }

/** Ausschluss ohne Begründung? (ISO verlangt die Begründung für Ausschlüsse.) */
function _soaBegruendungFehlt(c) { return c && c.anwendbar === false && !(c.begruendung || '').trim(); }

/** Kennzahlen über den ganzen Katalog. */
function _soaKpis() {
  const ids = NORMEN.flatMap(g => g.items.map(i => i.id));
  const cs = (_soaData && _soaData.controls) || {};
  let gepflegt = 0, anwendbar = 0, ausgeschlossen = 0, umgesetzt = 0, begrFehlt = 0;
  for (const id of ids) {
    const c = cs[id];
    if (_soaGepflegt(c)) gepflegt++;
    if (c && c.anwendbar === true) { anwendbar++; if (c.status === 'umgesetzt') umgesetzt++; }
    if (c && c.anwendbar === false) { ausgeschlossen++; if (_soaBegruendungFehlt(c)) begrFehlt++; }
  }
  return { total: ids.length, gepflegt, anwendbar, ausgeschlossen, umgesetzt, begrFehlt };
}

async function initSoa() {
  if (_soaData || _soaLoading) { renderSoa(); return; }
  _soaLoading = true;
  renderSoa();   // Spinner
  try {
    const loaded = await spLoadSoa();
    _soaData = (loaded && typeof loaded === 'object') ? loaded : { controls: {}, meta: {} };
  } catch (e) {
    _soaData = { controls: {}, meta: {} };
    if (typeof toast === 'function') toast('SoA konnte nicht geladen werden: ' + e.message, 'error');
  }
  _soaLoading = false;
  _soaDirty = false;
  renderSoa();
}

function renderSoa() {
  const mount = document.getElementById('abdeckung-mount');
  if (!mount) return;
  const switcher = (typeof _abModeSwitcher === 'function') ? _abModeSwitcher('soa') : '';
  if (_soaLoading || !_soaData) {
    mount.innerHTML = switcher + '<div class="doc-loading">Lade Erklärung zur Anwendbarkeit …</div>';
    return;
  }
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('abdeckung');
  const k = _soaKpis();
  const cov = (typeof _abdeckungData === 'function') ? _abdeckungData() : {};
  const meta = _soaData.meta || {};
  const kpi = (n, label, col) => `<div style="flex:1;min-width:118px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  const q = _soaFilter.q.toLowerCase();
  const groups = NORMEN.map(g => {
    const rows = g.items.filter(it => {
      if (q && !(it.id.toLowerCase().includes(q) || it.label.toLowerCase().includes(q))) return false;
      const c = _soaData.controls[it.id];
      if (_soaFilter.nur === 'offen' && _soaGepflegt(c)) return false;
      if (_soaFilter.nur === 'ausgeschlossen' && !(c && c.anwendbar === false)) return false;
      return true;
    }).map(it => {
      const c = _soaData.controls[it.id] || { anwendbar: null, begruendung: '', status: '' };
      const d = cov[it.id] || { saved: [], prov: [] };
      const covTxt = d.saved.length ? d.saved.join(', ')
                   : (d.prov.length ? d.prov.map(t => t + ' (Review)').join(', ') : '—');
      const begrWarn = _soaBegruendungFehlt(c);
      const dis = canWrite ? '' : ' disabled';
      return `<tr${c.anwendbar === false ? ' style="background:#fafafa"' : ''}>
        <td style="white-space:nowrap;vertical-align:top"><b>${esc(it.id)}</b></td>
        <td style="vertical-align:top">${esc(it.label)}
          <div style="font-size:.72rem;color:var(--c-faint)">${esc(covTxt)}</div></td>
        <td style="vertical-align:top"><select class="sort-select" style="font-size:.78rem;padding:3px 6px"${dis}
            onchange="soaSet('${esc(it.id)}','anwendbar',this.value)">
          <option value=""${c.anwendbar == null ? ' selected' : ''}>– offen –</option>
          <option value="ja"${c.anwendbar === true ? ' selected' : ''}>anwendbar</option>
          <option value="nein"${c.anwendbar === false ? ' selected' : ''}>ausgeschlossen</option>
        </select></td>
        <td style="vertical-align:top"><select class="sort-select" style="font-size:.78rem;padding:3px 6px"${c.anwendbar === false ? ' disabled' : dis}
            onchange="soaSet('${esc(it.id)}','status',this.value)">
          <option value=""${!c.status ? ' selected' : ''}>–</option>
          ${SOA_STATUS.map(s => `<option value="${esc(s)}"${c.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
        </select></td>
        <td style="vertical-align:top"><input type="text" value="${esc(c.begruendung || '')}"${dis}
          placeholder="${c.anwendbar === false ? 'Pflicht: warum ausgeschlossen?' : 'optional'}"
          oninput="soaSet('${esc(it.id)}','begruendung',this.value)"
          style="width:100%;border:1px solid ${begrWarn ? '#ef4444' : '#d1d5db'};border-radius:6px;padding:4px 8px;font-size:.78rem;font-family:inherit"></td>
      </tr>`;
    }).join('');
    if (!rows) return '';
    return `<tr><td colspan="5" style="background:var(--c-bg,#f3f4f6);font-weight:700;padding:6px 8px;font-size:.8rem">${esc(g.group)}</td></tr>${rows}`;
  }).join('');

  mount.innerHTML = switcher + `
    <div class="view-desc" style="margin:0 0 12px">
      <b>Erklärung zur Anwendbarkeit (SoA)</b> nach ISO 27001 Klausel 6.1.3 d): je Control Anwendbarkeit,
      Begründung und Umsetzungsstatus. Die Spalte „Abdeckung" (klein, grau) zeigt automatisch, welche Richtlinien
      das Control laut Normbezug abdecken. Für <b>ausgeschlossene</b> Controls ist die Begründung Pflicht.
      ${meta.updatedAt ? `<br><span style="color:var(--c-faint)">Zuletzt gespeichert: ${fmtDateTime(meta.updatedAt)}${meta.updatedBy ? ' von ' + esc(meta.updatedBy) : ''} · Version ${meta.version || 1}</span>` : ''}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kpi(`${k.gepflegt}/${k.total}`, 'Anwendbarkeit entschieden', k.gepflegt === k.total ? '#15803d' : '#b45309')}
      ${kpi(k.anwendbar, 'anwendbar', '#17509e')}
      ${kpi(k.ausgeschlossen, 'ausgeschlossen', '#6b7280')}
      ${kpi(`${k.umgesetzt}/${k.anwendbar}`, 'davon umgesetzt', k.anwendbar && k.umgesetzt === k.anwendbar ? '#15803d' : '#b45309')}
      ${kpi(k.begrFehlt, 'Begründung fehlt', k.begrFehlt ? '#b91c1c' : '#15803d')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Filtern (Control, Text) …" value="${esc(_soaFilter.q)}"
        oninput="_soaFilter.q=this.value;renderSoa()" style="width:210px">
      <select class="sort-select" onchange="_soaFilter.nur=this.value;renderSoa()">
        <option value=""${!_soaFilter.nur ? ' selected' : ''}>alle Controls</option>
        <option value="offen"${_soaFilter.nur === 'offen' ? ' selected' : ''}>nur offene (nicht entschieden)</option>
        <option value="ausgeschlossen"${_soaFilter.nur === 'ausgeschlossen' ? ' selected' : ''}>nur ausgeschlossene</option>
      </select>
      <div style="flex:1"></div>
      ${canWrite ? `<button class="btn btn-outline btn-sm" onclick="soaPrefill()" title="Alle offenen Controls: anwendbar=ja; Status aus der Richtlinien-Abdeckung (gespeichert→umgesetzt, Review→geplant, sonst nicht umgesetzt). Bereits gepflegte Einträge bleiben unangetastet.">⚡ Aus Abdeckung vorbelegen</button>` : ''}
      <button class="btn btn-outline btn-sm" onclick="soaExportReport()">🖨 SoA-Report</button>
      <button class="btn btn-outline btn-sm" onclick="soaExportCsv()">⬇ CSV</button>
      ${canWrite ? `<button class="btn btn-primary btn-sm" id="soa-save-btn" onclick="soaSave()">${_soaDirty ? '● ' : ''}Speichern</button>` : ''}
    </div>
    ${canWrite ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> – die SoA kann angesehen, aber nicht geändert werden.</div>'}
    <div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
      <thead><tr><th>Control</th><th>Bezeichnung / Abdeckung</th><th style="width:130px">Anwendbar</th><th style="width:160px">Umsetzung</th><th style="min-width:220px">Begründung</th></tr></thead>
      <tbody>${groups || '<tr><td colspan="5">Keine Treffer.</td></tr>'}</tbody>
    </table></div>`;
}

/** Ein Feld eines Controls setzen (ohne Neu-Rendern der ganzen Tabelle beim Tippen). */
function soaSet(id, field, value) {
  if (typeof canWriteTab === 'function' && !canWriteTab('abdeckung')) return;
  const c = _soaCtl(id);
  if (field === 'anwendbar') {
    c.anwendbar = value === 'ja' ? true : value === 'nein' ? false : null;
    if (c.anwendbar === false) c.status = '';   // ausgeschlossen ⇒ kein Umsetzungsstatus
    _soaDirty = true;
    renderSoa();   // Selects/Deaktivierung/Zähler nachziehen
    return;
  }
  c[field] = value;
  _soaDirty = true;
  const btn = document.getElementById('soa-save-btn');
  if (btn && !btn.textContent.startsWith('●')) btn.textContent = '● Speichern';
}

/** Offene Controls aus der Richtlinien-Abdeckung vorbelegen (überschreibt nichts Gepflegtes). */
function soaPrefill() {
  if (typeof canWriteTab === 'function' && !canWriteTab('abdeckung')) return;
  const cov = (typeof _abdeckungData === 'function') ? _abdeckungData() : {};
  let n = 0;
  for (const g of NORMEN) for (const it of g.items) {
    const c = _soaCtl(it.id);
    if (_soaGepflegt(c)) continue;   // manuell Gepflegtes nicht anfassen
    const d = cov[it.id] || { saved: [], prov: [] };
    c.anwendbar = true;
    if (!c.status) c.status = d.saved.length ? 'umgesetzt' : (d.prov.length ? 'geplant' : 'nicht umgesetzt');
    n++;
  }
  _soaDirty = true;
  renderSoa();
  if (typeof toast === 'function') toast(`${n} Control(s) vorbelegt – bitte prüfen und speichern.`, 'success');
}

async function soaSave() {
  if (typeof canWriteTab === 'function' && !canWriteTab('abdeckung')) {
    if (typeof toast === 'function') toast('Nur Lesezugriff.', 'error'); return;
  }
  const k = _soaKpis();
  if (k.begrFehlt && !confirm(`${k.begrFehlt} ausgeschlossene(s) Control(s) haben noch KEINE Begründung (rot markiert) – ISO 27001 verlangt sie.\n\nTrotzdem speichern?`)) return;
  const btn = document.getElementById('soa-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  _soaData.meta = {
    version: ((_soaData.meta && _soaData.meta.version) || 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '',
  };
  try {
    await spSaveSoa(_soaData);
    _soaDirty = false;
    renderSoa();
    if (typeof toast === 'function') toast('SoA gespeichert ✓ (Version ' + _soaData.meta.version + ')', 'success');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '● Speichern'; }
    if (typeof toast === 'function') toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

/* ── Exporte ── */

function _soaWord(c) {
  if (!c || c.anwendbar == null) return 'offen';
  return c.anwendbar ? 'anwendbar' : 'ausgeschlossen';
}

/** SoA als druck-/PDF-fähigen Report öffnen (das klassische Audit-Dokument). */
function soaExportReport() {
  if (typeof NORMEN === 'undefined' || !_soaData) { if (typeof toast === 'function') toast('SoA noch nicht geladen.', 'error'); return; }
  const cov = (typeof _abdeckungData === 'function') ? _abdeckungData() : {};
  const k = _soaKpis();
  const meta = _soaData.meta || {};
  const stamp = new Date().toLocaleString('de-DE');
  const rows = NORMEN.map(g => {
    const body = g.items.map(it => {
      const c = _soaData.controls[it.id] || {};
      const d = cov[it.id] || { saved: [], prov: [] };
      const um = [...d.saved, ...d.prov.map(t => t + ' (Review)')].join(', ') || '—';
      const w = _soaWord(c);
      const col = w === 'anwendbar' ? '#166534' : w === 'ausgeschlossen' ? '#6b7280' : '#b45309';
      return `<tr>
        <td style="white-space:nowrap"><b>${esc(it.id)}</b></td><td>${esc(it.label)}</td>
        <td style="color:${col};font-weight:600;white-space:nowrap">${esc(w)}</td>
        <td style="white-space:nowrap">${esc(c.anwendbar === false ? '—' : (c.status || '–'))}</td>
        <td>${esc(c.begruendung || '')}</td><td style="font-size:10px">${esc(um)}</td></tr>`;
    }).join('');
    return `<tr><td colspan="6" style="background:#f3f4f6;font-weight:700;padding:6px 8px">${esc(g.group)}</td></tr>${body}`;
  }).join('');

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>Erklärung zur Anwendbarkeit (SoA) – DIHAG (${esc(stamp)})</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:28px;font-size:11px;line-height:1.45}
      h1{font-size:18px;margin:0 0 2px} .muted{color:#6b7280}
      table{border-collapse:collapse;width:100%;margin-top:10px}
      th,td{border:1px solid #d1d5db;padding:4px 7px;text-align:left;vertical-align:top}
      th{background:#111827;color:#fff;font-size:10px}
      .kpi{display:flex;gap:22px;margin:10px 0} .kpi b{font-size:19px;display:block}
      .noprint{margin:16px 0} @media print{.noprint{display:none}}
    </style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    <h1>Erklärung zur Anwendbarkeit (Statement of Applicability)</h1>
    <div class="muted">DIHAG · ISO/IEC 27001:2022, Klausel 6.1.3 d) · Stand ${esc(stamp)}
      ${meta.version ? ` · SoA-Version ${meta.version}` : ''}${meta.updatedBy ? ` · gepflegt von ${esc(meta.updatedBy)}` : ''}</div>
    <div class="kpi">
      <div><b>${k.anwendbar}</b><span class="muted">anwendbar</span></div>
      <div><b>${k.ausgeschlossen}</b><span class="muted">ausgeschlossen</span></div>
      <div><b>${k.umgesetzt}/${k.anwendbar}</b><span class="muted">umgesetzt</span></div>
      <div><b>${k.gepflegt}/${k.total}</b><span class="muted">entschieden</span></div>
    </div>
    <table><thead><tr><th>Control</th><th>Bezeichnung</th><th>Anwendbarkeit</th><th>Umsetzung</th><th>Begründung</th><th>Umsetzung durch (Richtlinien)</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p class="muted" style="margin-top:16px">Erstellt aus dem DIHAG-Richtlinienmanagement – deterministisch, ohne KI. „(Review)" = Zuordnung aus der ISB-Review, noch nicht im Normbezug gespeichert.</p>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Pop-up-Blocker? Bitte Pop-ups erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/** SoA als CSV (Excel) herunterladen. */
function soaExportCsv() {
  if (typeof NORMEN === 'undefined' || !_soaData) { if (typeof toast === 'function') toast('SoA noch nicht geladen.', 'error'); return; }
  const cov = (typeof _abdeckungData === 'function') ? _abdeckungData() : {};
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const rows = [['Control', 'Bezeichnung', 'Gruppe', 'Anwendbarkeit', 'Umsetzungsstatus', 'Begründung', 'Umsetzung durch (Richtlinien)']];
  for (const g of NORMEN) for (const it of g.items) {
    const c = _soaData.controls[it.id] || {};
    const d = cov[it.id] || { saved: [], prov: [] };
    rows.push([it.id, it.label, g.group, _soaWord(c), c.anwendbar === false ? '' : (c.status || ''),
      c.begruendung || '', [...d.saved, ...d.prov.map(t => t + ' (Review)')].join(', ')]);
  }
  const csv = '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SoA_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  if (typeof toast === 'function') toast('CSV heruntergeladen ✓', 'success');
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _soaGepflegt, _soaBegruendungFehlt, _soaWord };
}
