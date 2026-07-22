'use strict';

/**
 * Reifegrad / Gap-Analyse „IT und OT Betrieb" (im Reiter ISMS-Abdeckung)
 * =====================================================================
 * Bewertet jede Maßnahme des ISMS-Betriebs-Katalogs (REIFEGRAD_KATALOG) je
 * Werk (DIHAG/EIS/DSO) mit einer Ampel (🔴 nicht gelebt · 🟡 teilweise ·
 * 🟢 funktioniert · ⚪ keine Einschätzung – laut Legende des Dokuments).
 * Aggregiert zu Kennzahlen je Werk/Thema, listet Handlungsbedarf (🔴/🟡).
 * Speicherung als reifegrad-config.json (App-Site), wie die SoA.
 */

let _reifegrad = null;          // { ratings:{mid:{werk:stufe}}, kommentare:{mid:text}, meta:{} }
let _reifegradLoading = false;
let _reifegradDirty = false;
let _rgFilter = { q: '', stufe: '', werk: '' };   // werk='' → alle Werke
const RG_CYCLE = ['weiss', 'gruen', 'gelb', 'rot'];   // Klick-Reihenfolge einer Zelle
let _rgOpen = {};               // { topicId: false } → eingeklappt (Standard: offen)

function _rgCanWrite() { return typeof canWriteTab !== 'function' || canWriteTab('abdeckung'); }
function _rgRating(mid, werk) { return (_reifegrad.ratings[mid] && _reifegrad.ratings[mid][werk]) || 'weiss'; }

async function initReifegrad() {
  const mount = document.getElementById('abdeckung-mount');
  if (!mount) return;
  if (_reifegrad) { renderReifegrad(); return; }
  mount.innerHTML = (typeof _abModeSwitcher === 'function' ? _abModeSwitcher('reifegrad') : '')
    + '<div class="doc-loading">Lade Reifegrad-Bewertung …</div>';
  _reifegradLoading = true;
  let cfg = null;
  try { cfg = (typeof spLoadReifegrad === 'function') ? await spLoadReifegrad() : null; }
  catch (e) { console.warn('Reifegrad laden:', e.message); }
  _reifegrad = {
    ratings:    (cfg && cfg.ratings && typeof cfg.ratings === 'object') ? cfg.ratings : {},
    kommentare: (cfg && cfg.kommentare && typeof cfg.kommentare === 'object') ? cfg.kommentare : {},
    meta:       (cfg && cfg.meta && typeof cfg.meta === 'object') ? cfg.meta : {},
  };
  _reifegradLoading = false;
  _reifegradDirty = false;
  renderReifegrad();
}

/* ── Aggregation ── */

function _rgStats() {
  const werke = REIFEGRAD_WERKE;
  const empty = () => ({ rot: 0, gelb: 0, gruen: 0, weiss: 0, bewertet: 0, total: 0 });
  const overall = empty(), byWerk = {}, perTopic = {};
  werke.forEach(w => byWerk[w] = empty());
  for (const t of REIFEGRAD_KATALOG) {
    const pt = perTopic[t.id] = empty();
    for (const p of t.punkte) {
      for (const w of werke) {
        const s = _rgRating(p.id, w);
        overall[s]++; overall.total++;
        byWerk[w][s]++; byWerk[w].total++;
        pt[s]++; pt.total++;
        if (s !== 'weiss') { overall.bewertet++; byWerk[w].bewertet++; pt.bewertet++; }
      }
    }
  }
  return { overall, byWerk, perTopic };
}

/** Kompakter Ampel-Stapelbalken für eine Verteilung. */
function _rgBar(d, w) {
  const width = w || 120;
  const seg = (k) => d[k] ? `<span title="${REIFEGRAD_STUFEN[k].label}: ${d[k]}" style="display:inline-block;height:9px;width:${(d[k] / d.total * width)}px;background:${REIFEGRAD_STUFEN[k].color}"></span>` : '';
  return `<span style="display:inline-flex;border-radius:5px;overflow:hidden;vertical-align:middle;background:#eef1f5;width:${width}px;height:9px">
    ${seg('gruen')}${seg('gelb')}${seg('rot')}${seg('weiss')}</span>`;
}

function _rgKpisHtml() {
  const s = _rgStats();
  const o = s.overall;
  const werkLine = REIFEGRAD_WERKE.map(w => {
    const d = s.byWerk[w];
    return `<div style="display:flex;align-items:center;gap:8px;font-size:.8rem;margin-bottom:3px">
      <b style="width:52px">${esc(w)}</b>${_rgBar(d, 150)}
      <span style="color:var(--c-muted)">🟢${d.gruen} 🟡${d.gelb} 🔴${d.rot} ⚪${d.weiss} · bewertet ${d.bewertet}/${d.total}</span></div>`;
  }).join('');
  const kpi = (n, label, col) => `<div style="flex:1;min-width:118px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.4rem;font-weight:800;color:${col}">${n}</div><div style="font-size:.76rem;color:var(--c-muted)">${label}</div></div>`;
  const pctBew = o.total ? Math.round(o.bewertet / o.total * 100) : 0;
  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
      ${kpi(o.rot, '🔴 Handlungsbedarf (nicht gelebt)', o.rot ? '#b91c1c' : '#15803d')}
      ${kpi(o.gelb, '🟡 teilweise gelebt', o.gelb ? '#b45309' : '#15803d')}
      ${kpi(o.gruen, '🟢 funktioniert', '#15803d')}
      ${kpi(pctBew + '%', 'bewertet (' + o.bewertet + '/' + o.total + ')', pctBew >= 80 ? '#15803d' : '#6b7280')}
    </div>
    <div style="background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px;margin-bottom:12px">
      <div style="font-size:.75rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px">Ampel je Werk</div>
      ${werkLine}
    </div>`;
}

function _rgTopicSummaryHtml(tid) {
  const d = _rgStats().perTopic[tid];
  return `${_rgBar(d, 90)} <span style="color:var(--c-muted);font-weight:500;font-size:.74rem">🔴${d.rot} 🟡${d.gelb} 🟢${d.gruen} · ${d.bewertet}/${d.total}</span>`;
}

/* ── Rendern ── */

function renderReifegrad() {
  const mount = document.getElementById('abdeckung-mount');
  if (!mount) return;
  const meta = _reifegrad.meta || {};
  const canWrite = _rgCanWrite();
  mount.innerHTML = (typeof _abModeSwitcher === 'function' ? _abModeSwitcher('reifegrad') : '') + `
    <div class="view-desc" style="margin:0 0 12px">
      Reifegrad-/Gap-Bewertung des Katalogs <b>„IT und OT Betrieb"</b> je Maßnahme und Werk (DIHAG/EIS/DSO).
      Ampel: 🟢 funktioniert · 🟡 teilweise · 🔴 nicht gelebt · ⚪ keine Einschätzung. Zelle anklicken zum Ändern.
      ${meta.aktualisiertAm ? `<span style="color:var(--c-faint)"> · zuletzt: ${esc(fmtDate(meta.aktualisiertAm))}${meta.aktualisiertVon ? ' von ' + esc(meta.aktualisiertVon) : ''}</span>` : ''}
    </div>
    <div id="rg-kpis">${_rgKpisHtml()}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Maßnahme/Thema suchen …" value="${esc(_rgFilter.q)}"
        oninput="_rgFilter.q=this.value;_rgRenderBody()" style="width:230px">
      <select class="sort-select" onchange="_rgFilter.werk=this.value;_rgRenderBody()">
        <option value="">alle Werke</option>
        ${REIFEGRAD_WERKE.map(w => `<option value="${esc(w)}" ${_rgFilter.werk === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}
      </select>
      <select class="sort-select" onchange="_rgFilter.stufe=this.value;_rgRenderBody()">
        <option value="">alle Ampeln</option>
        <option value="rot"   ${_rgFilter.stufe === 'rot' ? 'selected' : ''}>🔴 nur nicht gelebt</option>
        <option value="gelb"  ${_rgFilter.stufe === 'gelb' ? 'selected' : ''}>🟡 nur teilweise</option>
        <option value="gruen" ${_rgFilter.stufe === 'gruen' ? 'selected' : ''}>🟢 nur funktioniert</option>
        <option value="weiss" ${_rgFilter.stufe === 'weiss' ? 'selected' : ''}>⚪ nur unbewertet</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="reifegradToggleAll()">Alle ein-/ausklappen</button>
      <div style="flex:1"></div>
      <button class="btn btn-outline btn-sm" onclick="reifegradExportCsv()" title="Bewertung als CSV (Excel)">⬇ CSV</button>
      ${canWrite ? `<button class="btn btn-primary btn-sm" id="rg-save-btn" onclick="saveReifegrad()">💾 Bewertung speichern</button>` : '<span class="field-hint">👁 Nur-Lese-Zugriff</span>'}
    </div>
    <div id="rg-body"></div>`;
  _rgRenderBody();
}

/** Prüft, ob eine Maßnahme unter den aktuellen Filter fällt. */
function _rgMatch(topic, punkt) {
  const f = _rgFilter;
  if (f.q) {
    const hay = (topic.titel + ' ' + punkt.text).toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  if (f.stufe) {
    const werke = f.werk ? [f.werk] : REIFEGRAD_WERKE;
    if (!werke.some(w => _rgRating(punkt.id, w) === f.stufe)) return false;
  }
  return true;
}

function _rgRenderBody() {
  const host = document.getElementById('rg-body');
  if (!host) return;
  const werke = _rgFilter.werk ? [_rgFilter.werk] : REIFEGRAD_WERKE;
  const canWrite = _rgCanWrite();
  let html = '', shown = 0;
  for (const t of REIFEGRAD_KATALOG) {
    const pts = t.punkte.filter(p => _rgMatch(t, p));
    if (!pts.length) continue;
    shown += pts.length;
    const open = _rgOpen[t.id] !== false;
    const rows = pts.map(p => `
      <tr>
        <td style="padding:6px 8px;font-size:.83rem;line-height:1.4;border-top:1px solid var(--c-border)">${esc(p.text)}</td>
        ${werke.map(w => `<td style="padding:4px;text-align:center;border-top:1px solid var(--c-border)">${_rgCell(t.id, p.id, w, canWrite)}</td>`).join('')}
        <td style="padding:4px 6px;border-top:1px solid var(--c-border)">
          <input type="text" value="${esc((_reifegrad.kommentare || {})[p.id] || '')}" ${canWrite ? '' : 'disabled'}
            onchange="reifegradSetComment('${p.id}', this.value)" placeholder="Notiz …"
            style="width:100%;min-width:130px;border:1px solid #d1d5db;border-radius:6px;padding:4px 7px;font-size:.78rem;font-family:inherit"></td>
      </tr>`).join('');
    html += `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer" onclick="reifegradToggleTopic('${t.id}')">
          <span style="width:1em;color:var(--c-muted)">${open ? '▾' : '▸'}</span>
          <b style="font-size:.88rem">${esc(t.titel)}</b>
          <div style="flex:1"></div>
          <span id="rg-thdr-${t.id}">${_rgTopicSummaryHtml(t.id)}</span>
        </div>
        <div id="rg-topic-${t.id}" style="${open ? '' : 'display:none'};overflow-x:auto">
          <table class="tbl" style="width:100%;border-collapse:collapse">
            <thead><tr style="font-size:.72rem;color:var(--c-muted)">
              <th style="text-align:left;padding:4px 8px">Maßnahme</th>
              ${werke.map(w => `<th style="padding:4px;width:64px">${esc(w)}</th>`).join('')}
              <th style="text-align:left;padding:4px 6px">Kommentar</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }
  host.innerHTML = shown ? html
    : (typeof emptyState === 'function' ? emptyState('Keine Maßnahme für den aktuellen Filter.', '🔍') : '<div class="field-hint">Keine Treffer.</div>');
}

function _rgCell(tid, mid, werk, canWrite) {
  const val = _rgRating(mid, werk);
  const s = REIFEGRAD_STUFEN[val];
  return `<button class="rg-cell" ${canWrite ? '' : 'disabled'} title="${esc(werk + ': ' + s.label)}${canWrite ? ' – klicken zum Ändern' : ''}"
    onclick="reifegradCycle('${tid}','${mid}','${werk}',this)"
    style="background:${s.bg};border:1px solid ${s.color}55;border-radius:6px;padding:3px 9px;font-size:1rem;cursor:${canWrite ? 'pointer' : 'default'};line-height:1">${s.icon}</button>`;
}

/* ── Interaktion ── */

function reifegradCycle(tid, mid, werk, btn) {
  if (!_rgCanWrite()) return;
  const cur = _rgRating(mid, werk);
  const next = RG_CYCLE[(RG_CYCLE.indexOf(cur) + 1) % RG_CYCLE.length];
  if (!_reifegrad.ratings[mid]) _reifegrad.ratings[mid] = {};
  if (next === 'weiss') delete _reifegrad.ratings[mid][werk];
  else _reifegrad.ratings[mid][werk] = next;
  if (!Object.keys(_reifegrad.ratings[mid]).length) delete _reifegrad.ratings[mid];
  _reifegradDirty = true;
  // Nur betroffene Zelle + Kennzahlen aktualisieren (kein Scroll-Sprung)
  const s = REIFEGRAD_STUFEN[next];
  if (btn) { btn.textContent = s.icon; btn.style.background = s.bg; btn.style.borderColor = s.color + '55';
    btn.title = werk + ': ' + s.label + ' – klicken zum Ändern'; }
  const kp = document.getElementById('rg-kpis'); if (kp) kp.innerHTML = _rgKpisHtml();
  const th = document.getElementById('rg-thdr-' + tid); if (th) th.innerHTML = _rgTopicSummaryHtml(tid);
}

function reifegradSetComment(mid, val) {
  if (!_rgCanWrite()) return;
  const v = (val || '').trim();
  if (!_reifegrad.kommentare) _reifegrad.kommentare = {};
  if (v) _reifegrad.kommentare[mid] = v; else delete _reifegrad.kommentare[mid];
  _reifegradDirty = true;
}

function reifegradToggleTopic(tid) {
  _rgOpen[tid] = _rgOpen[tid] === false ? true : false;
  const body = document.getElementById('rg-topic-' + tid);
  if (body) body.style.display = _rgOpen[tid] ? '' : 'none';
  // Caret aktualisieren (erstes Span im Kopf)
  const hdr = body && body.previousElementSibling;
  const caret = hdr && hdr.querySelector('span');
  if (caret) caret.textContent = _rgOpen[tid] ? '▾' : '▸';
}

function reifegradToggleAll() {
  const anyOpen = REIFEGRAD_KATALOG.some(t => _rgOpen[t.id] !== false);
  REIFEGRAD_KATALOG.forEach(t => _rgOpen[t.id] = !anyOpen);
  _rgRenderBody();
}

async function saveReifegrad() {
  if (!_rgCanWrite()) { toast('Nur Lesezugriff auf „ISMS-Abdeckung".', 'error'); return; }
  const btn = document.getElementById('rg-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '💾 Speichern …'; }
  try {
    _reifegrad.meta = Object.assign({}, _reifegrad.meta, {
      aktualisiertAm: new Date().toISOString(),
      aktualisiertVon: (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '',
    });
    await spSaveReifegrad(_reifegrad);
    _reifegradDirty = false;
    toast('Reifegrad-Bewertung gespeichert ✓', 'success');
    renderReifegrad();
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Bewertung speichern'; }
  }
}

function reifegradExportCsv() {
  const sep = ';';
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['Thema', 'Maßnahme', ...REIFEGRAD_WERKE, 'Kommentar'];
  const lines = [head.map(q).join(sep)];
  for (const t of REIFEGRAD_KATALOG) {
    for (const p of t.punkte) {
      const row = [t.titel, p.text,
        ...REIFEGRAD_WERKE.map(w => REIFEGRAD_STUFEN[_rgRating(p.id, w)].label),
        (_reifegrad.kommentare || {})[p.id] || ''];
      lines.push(row.map(q).join(sep));
    }
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'Reifegrad_IT-OT-Betrieb.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
