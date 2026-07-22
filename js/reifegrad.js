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
let _reifegradSeeded = false;   // true → Startbelegung aus Dokument, noch nicht gespeichert
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
    // Eigene Maßnahmen/Themen + ausgeblendete Katalog-Maßnahmen
    customPunkte: (cfg && cfg.customPunkte && typeof cfg.customPunkte === 'object') ? cfg.customPunkte : {},
    customTopics: (cfg && Array.isArray(cfg.customTopics)) ? cfg.customTopics : [],
    removed:      (cfg && Array.isArray(cfg.removed)) ? cfg.removed : [],
  };
  _reifegradLoading = false;
  _reifegradDirty = false;
  _reifegradSeeded = false;
  // Erststart ohne gespeicherte Bewertung → Ampeln aus dem Dokument vorbelegen.
  if (!Object.keys(_reifegrad.ratings).length && typeof REIFEGRAD_SEED === 'object' && REIFEGRAD_SEED) {
    _rgApplySeed();
  }
  renderReifegrad();
}

/** Übernimmt die Ampeln aus REIFEGRAD_SEED (Dokument) als Startbelegung. */
function _rgApplySeed() {
  const seed = (typeof REIFEGRAD_SEED === 'object' && REIFEGRAD_SEED && REIFEGRAD_SEED.ratings) || null;
  if (!seed) return;
  const r = {};
  for (const mid in seed) r[mid] = Object.assign({}, seed[mid]);
  _reifegrad.ratings = r;
  _reifegrad.meta = Object.assign({ quelle: (REIFEGRAD_SEED.meta && REIFEGRAD_SEED.meta.quelle) || '' }, _reifegrad.meta);
  _reifegradSeeded = true;
  _reifegradDirty = true;
}

/* ── Effektiver Katalog (Basis + eigene Themen/Maßnahmen − ausgeblendete) ── */

/** Katalog inkl. eigener Maßnahmen/Themen, ohne ausgeblendete Katalog-Maßnahmen.
 *  Maßnahmen tragen `custom:true`, wenn sie selbst hinzugefügt wurden. */
function _rgKatalog() {
  const removed = new Set(_reifegrad.removed || []);
  const cp = _reifegrad.customPunkte || {};
  const base = REIFEGRAD_KATALOG.map(t => ({
    id: t.id, titel: t.titel, custom: false,
    punkte: t.punkte.filter(p => !removed.has(p.id)).map(p => ({ id: p.id, text: p.text, custom: false }))
      .concat((cp[t.id] || []).filter(p => !removed.has(p.id)).map(p => ({ id: p.id, text: p.text, custom: true }))),
  }));
  const custom = (_reifegrad.customTopics || []).map(t => ({
    id: t.id, titel: t.titel, custom: true,
    punkte: (t.punkte || []).filter(p => !removed.has(p.id)).map(p => ({ id: p.id, text: p.text, custom: true })),
  }));
  return base.concat(custom);
}

/** Anzahl ausgeblendeter (entfernter) Katalog-Maßnahmen. */
function _rgHiddenCount() { return (_reifegrad.removed || []).length; }

/* ── Aggregation ── */

function _rgStats() {
  const werke = REIFEGRAD_WERKE;
  const empty = () => ({ rot: 0, gelb: 0, gruen: 0, weiss: 0, bewertet: 0, total: 0 });
  const overall = empty(), byWerk = {}, perTopic = {};
  werke.forEach(w => byWerk[w] = empty());
  for (const t of _rgKatalog()) {
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
      Ampel: 🟢 funktioniert · 🟡 teilweise · 🔴 nicht gelebt · ⚪ keine Einschätzung. Zelle anklicken zum Ändern;
      eigene Maßnahmen/Themen ergänzen (+) oder entfernen (✕).
      ${meta.aktualisiertAm ? `<span style="color:var(--c-faint)"> · zuletzt: ${esc(fmtDate(meta.aktualisiertAm))}${meta.aktualisiertVon ? ' von ' + esc(meta.aktualisiertVon) : ''}</span>` : ''}
    </div>
    ${_reifegradSeeded ? `<div class="banner banner-info" style="display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:9px 13px;border:1px solid #99b7cd;background:#eef4f9;border-radius:9px;font-size:.83rem">
      <span style="font-size:1.1rem">📥</span>
      <span style="flex:1">Ampeln wurden aus dem Dokument <b>„IT und OT Betrieb"</b> vorbelegt (gilt zunächst gleich für DIHAG/EIS/DSO). Prüfen, ggf. je Werk anpassen und <b>speichern</b>, damit die Bewertung erhalten bleibt.</span>
      ${canWrite ? `<button class="btn btn-primary btn-sm" onclick="saveReifegrad()">💾 Jetzt speichern</button>` : ''}
    </div>` : ''}
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
      ${(canWrite && _rgHiddenCount()) ? `<button class="btn btn-ghost btn-sm" onclick="reifegradRestoreHidden()" title="Ausgeblendete Katalog-Maßnahmen wieder einblenden">↩ ${_rgHiddenCount()} ausgeblendet</button>` : ''}
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
  const filterActive = !!(_rgFilter.q || _rgFilter.stufe);
  const cols = 2 + werke.length;   // Maßnahme + Werke + Kommentar
  let html = '', shown = 0;
  for (const t of _rgKatalog()) {
    const pts = t.punkte.filter(p => _rgMatch(t, p));
    // Leere Themen weiter zeigen, wenn kein Filter aktiv ist (z. B. neu angelegtes eigenes Thema)
    if (!pts.length && filterActive) continue;
    shown += pts.length || (!filterActive ? 1 : 0);
    const open = _rgOpen[t.id] !== false;
    const rows = pts.map(p => `
      <tr>
        <td style="padding:6px 8px;font-size:.83rem;line-height:1.4;border-top:1px solid var(--c-border)">
          <div style="display:flex;align-items:center;gap:6px">
            ${p.custom
              ? `<input type="text" value="${esc(p.text)}" ${canWrite ? '' : 'disabled'} onchange="reifegradSetMeasureText('${t.id}','${p.id}',this.value)"
                   placeholder="Eigene Maßnahme …" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:4px 7px;font-size:.82rem;font-family:inherit">`
              : `<span style="flex:1">${esc(p.text)}</span>`}
            ${canWrite ? `<button class="btn btn-ghost btn-sm" title="${p.custom ? 'Eigene Maßnahme löschen' : 'Katalog-Maßnahme ausblenden'}"
                onclick="reifegradRemoveMeasure('${t.id}','${p.id}',${p.custom})" style="padding:0 6px;color:#b91c1c">✕</button>` : ''}
          </div>
        </td>
        ${werke.map(w => `<td style="padding:4px;text-align:center;border-top:1px solid var(--c-border)">${_rgCell(t.id, p.id, w, canWrite)}</td>`).join('')}
        <td style="padding:4px 6px;border-top:1px solid var(--c-border)">
          <input type="text" value="${esc((_reifegrad.kommentare || {})[p.id] || '')}" ${canWrite ? '' : 'disabled'}
            onchange="reifegradSetComment('${p.id}', this.value)" placeholder="Notiz …"
            style="width:100%;min-width:130px;border:1px solid #d1d5db;border-radius:6px;padding:4px 7px;font-size:.78rem;font-family:inherit"></td>
      </tr>`).join('');
    const addRow = canWrite ? `<tr><td colspan="${cols}" style="padding:6px 8px;border-top:1px solid var(--c-border)">
      <button class="btn btn-ghost btn-sm" onclick="reifegradAddMeasure('${t.id}')">+ Maßnahme</button></td></tr>` : '';
    const titleHtml = t.custom
      ? `<input type="text" value="${esc(t.titel)}" ${canWrite ? '' : 'disabled'} onclick="event.stopPropagation()"
           onchange="reifegradSetTopicTitle('${t.id}',this.value)" placeholder="Eigenes Thema …"
           style="font-weight:700;font-size:.88rem;border:1px solid #d1d5db;border-radius:6px;padding:3px 8px;font-family:inherit;min-width:220px">
         ${canWrite ? `<button class="btn btn-ghost btn-sm" title="Eigenes Thema löschen" onclick="event.stopPropagation();reifegradRemoveTopic('${t.id}')" style="color:#b91c1c">🗑</button>` : ''}`
      : `<b style="font-size:.88rem">${esc(t.titel)}</b>`;
    html += `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer" onclick="reifegradToggleTopic('${t.id}')">
          <span style="width:1em;color:var(--c-muted)">${open ? '▾' : '▸'}</span>
          ${titleHtml}${t.custom ? '<span class="ic-tag" style="background:#eef2ff;color:#3730a3">eigenes</span>' : ''}
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
            <tbody>${rows || `<tr><td colspan="${cols}" style="padding:8px;color:var(--c-faint);font-size:.8rem;border-top:1px solid var(--c-border)">Noch keine Maßnahmen.</td></tr>`}${addRow}</tbody>
          </table>
        </div>
      </div>`;
  }
  const addTopic = (canWrite && !filterActive) ? `<button class="btn btn-outline btn-sm" onclick="reifegradAddTopic()">+ Eigenes Thema</button>` : '';
  host.innerHTML = (shown ? html
    : (typeof emptyState === 'function' ? emptyState('Keine Maßnahme für den aktuellen Filter.', '🔍') : '<div class="field-hint">Keine Treffer.</div>'))
    + (addTopic ? `<div style="margin:4px 0 8px">${addTopic}</div>` : '');
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
  const kat = _rgKatalog();
  const anyOpen = kat.some(t => _rgOpen[t.id] !== false);
  kat.forEach(t => _rgOpen[t.id] = !anyOpen);
  _rgRenderBody();
}

/* ── Bearbeiten: eigene Maßnahmen/Themen hinzufügen/entfernen ── */

function _rgNextId(prefix) {
  let id;
  do { id = prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  while (_reifegrad.ratings[id] || (_reifegrad.customPunkte && Object.values(_reifegrad.customPunkte).flat().some(p => p.id === id)));
  return id;
}

/** Liefert (und legt bei Bedarf an) das Array, das die eigenen Maßnahmen von tid hält. */
function _rgCustomMeasureArr(tid) {
  if (REIFEGRAD_KATALOG.some(t => t.id === tid)) {
    if (!_reifegrad.customPunkte) _reifegrad.customPunkte = {};
    if (!_reifegrad.customPunkte[tid]) _reifegrad.customPunkte[tid] = [];
    return _reifegrad.customPunkte[tid];
  }
  const t = (_reifegrad.customTopics || []).find(x => x.id === tid);
  if (t) { if (!t.punkte) t.punkte = []; return t.punkte; }
  return null;
}

/** Body neu rendern + Kennzahlen aktualisieren (nach struktureller Änderung). */
function _rgAfterStructEdit() {
  _reifegradDirty = true;
  _rgRenderBody();
  const kp = document.getElementById('rg-kpis'); if (kp) kp.innerHTML = _rgKpisHtml();
}

function reifegradAddMeasure(tid) {
  if (!_rgCanWrite()) return;
  const arr = _rgCustomMeasureArr(tid);
  if (!arr) { toast('Thema nicht gefunden.', 'error'); return; }
  arr.push({ id: _rgNextId('M'), text: '' });
  _rgOpen[tid] = true;
  _rgAfterStructEdit();
}

function reifegradSetMeasureText(tid, mid, val) {
  if (!_rgCanWrite()) return;
  const arr = _rgCustomMeasureArr(tid);
  const p = arr && arr.find(x => x.id === mid);
  if (p) { p.text = (val || '').trim(); _reifegradDirty = true; }
}

function reifegradRemoveMeasure(tid, mid, isCustom) {
  if (!_rgCanWrite()) return;
  if (isCustom === true || isCustom === 'true') {
    const arr = _rgCustomMeasureArr(tid);
    const i = arr ? arr.findIndex(x => x.id === mid) : -1;
    if (i >= 0) arr.splice(i, 1);
  } else {
    if (!confirm('Diese Katalog-Maßnahme ausblenden? Sie zählt dann nicht mehr in die Bewertung (über „ausgeblendete wiederherstellen" reversibel).')) return;
    if (!_reifegrad.removed) _reifegrad.removed = [];
    if (!_reifegrad.removed.includes(mid)) _reifegrad.removed.push(mid);
  }
  if (_reifegrad.ratings[mid]) delete _reifegrad.ratings[mid];
  if (_reifegrad.kommentare && _reifegrad.kommentare[mid]) delete _reifegrad.kommentare[mid];
  _rgAfterStructEdit();
  renderReifegrad();   // Toolbar (ausgeblendet-Zähler) aktualisieren
}

function reifegradAddTopic() {
  if (!_rgCanWrite()) return;
  if (!_reifegrad.customTopics) _reifegrad.customTopics = [];
  const id = _rgNextId('T');
  _reifegrad.customTopics.push({ id, titel: '', punkte: [] });
  _rgOpen[id] = true;
  _rgAfterStructEdit();
}

function reifegradSetTopicTitle(tid, val) {
  if (!_rgCanWrite()) return;
  const t = (_reifegrad.customTopics || []).find(x => x.id === tid);
  if (t) { t.titel = (val || '').trim(); _reifegradDirty = true; }
}

function reifegradRemoveTopic(tid) {
  if (!_rgCanWrite()) return;
  const t = (_reifegrad.customTopics || []).find(x => x.id === tid);
  if (!t) return;
  if (!confirm(`Eigenes Thema „${t.titel || '(ohne Titel)'}" mit ${((t.punkte || []).length)} Maßnahme(n) löschen?`)) return;
  (t.punkte || []).forEach(p => { delete _reifegrad.ratings[p.id]; if (_reifegrad.kommentare) delete _reifegrad.kommentare[p.id]; });
  _reifegrad.customTopics = _reifegrad.customTopics.filter(x => x.id !== tid);
  _rgAfterStructEdit();
}

/** Alle ausgeblendeten Katalog-Maßnahmen wiederherstellen. */
function reifegradRestoreHidden() {
  if (!_rgCanWrite()) return;
  _reifegrad.removed = [];
  _reifegradDirty = true;
  renderReifegrad();
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
    _reifegradSeeded = false;
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
  for (const t of _rgKatalog()) {
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
