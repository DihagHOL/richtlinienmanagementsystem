'use strict';

/**
 * Reiter „ISMS-Abdeckung" (Admin)
 * ===============================
 * Zeigt über alle Richtlinien hinweg, welche ISO-27001-/NIS2-Controls durch
 * mindestens eine Richtlinie abgedeckt sind (aus dem Feld `normbezug`) – als
 * Heatmap + Lückenliste. Rein deterministisch, keine externen Dienste.
 * Quelle des lebenden „Statement of Applicability" light.
 */

let _abdeckungPublishedOnly = false;

/** Deckungs-Map: Control-ID → [Richtlinien-Titel], über die relevanten Richtlinien. */
function _abdeckungMap() {
  const pols = (State.policies || []).filter(p =>
    p.status !== 'Archiviert' && (!_abdeckungPublishedOnly || p.status === 'Veröffentlicht'));
  const map = {};
  for (const p of pols) {
    for (const id of (p.normbezug || [])) (map[id] = map[id] || []).push(p.title);
  }
  return map;
}

function _abColor(n) {
  if (!n)      return 'background:#fee2e2;color:#991b1b;border-color:#fecaca';       // Lücke
  if (n === 1) return 'background:#dcfce7;color:#166534;border-color:#bbf7d0';       // abgedeckt
  return 'background:#86efac;color:#14532d;border-color:#4ade80';                    // mehrfach
}

function renderAbdeckung() {
  const mount = document.getElementById('abdeckung-mount');
  if (!mount) return;
  if (typeof NORMEN === 'undefined') { mount.innerHTML = '<div class="col-warning" style="display:block">Normen-Katalog nicht geladen.</div>'; return; }
  const map = _abdeckungMap();
  const covered = id => (map[id] || []).length;

  // Kennzahlen je „Sektion" (Klauseln, A.5–A.8, NIS2)
  const annexIds = NORMEN.filter(g => /Annex/.test(g.group)).flatMap(g => g.items.map(i => i.id));
  const annexDone = annexIds.filter(covered).length;
  const pct = annexIds.length ? Math.round(annexDone / annexIds.length * 100) : 0;

  const luecken = NORMEN.filter(g => !/NIS2/.test(g.group))
    .flatMap(g => g.items).filter(it => !covered(it.id));

  const grid = NORMEN.map(g => {
    const done = g.items.filter(it => covered(it.id)).length;
    const cells = g.items.map(it => {
      const n = covered(it.id);
      const who = n ? 'Abgedeckt durch: ' + map[it.id].join(', ') : 'Lücke – von keiner Richtlinie abgedeckt';
      return `<div class="ab-cell" title="${esc(it.id + ' — ' + it.label + '\n' + who)}"
        onclick="abdeckungShowControl('${esc(it.id)}')"
        style="${_abColor(n)};border:1px solid;border-radius:6px;padding:5px 7px;font-size:.72rem;cursor:pointer;min-width:0">
        <b>${esc(it.id)}</b>${n > 1 ? ` <span style="opacity:.75">×${n}</span>` : ''}</div>`;
    }).join('');
    return `<div style="margin-bottom:14px">
      <div style="font-size:.8rem;font-weight:700;margin:0 2px 6px">${esc(g.group)}
        <span style="color:var(--c-muted);font-weight:500">— ${done}/${g.items.length} abgedeckt</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:5px">${cells}</div>
    </div>`;
  }).join('');

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Abdeckung der ISO-27001-/NIS2-Controls durch die Richtlinien (Feld „Normbezug").
      <b>Annex-A abgedeckt: ${annexDone}/${annexIds.length} (${pct}%)</b>.
      <label class="ack-check" style="display:inline-flex;font-weight:500;margin-left:12px">
        <input type="checkbox" ${_abdeckungPublishedOnly ? 'checked' : ''} onchange="abdeckungTogglePublished(this.checked)">
        <span>nur veröffentlichte</span></label>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:.75rem;margin-bottom:14px">
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;${_abColor(0)};border:1px solid;vertical-align:-1px"></span> Lücke</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;${_abColor(1)};border:1px solid;vertical-align:-1px"></span> abgedeckt</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;${_abColor(2)};border:1px solid;vertical-align:-1px"></span> mehrfach (Zahl = Anzahl Richtlinien)</span>
      <span style="color:var(--c-muted)">Zelle anklicken → abdeckende Richtlinien</span>
    </div>
    ${luecken.length ? `<div class="col-warning" style="display:block;margin-bottom:14px">
      <b>${luecken.length} Control(s) ohne Abdeckung</b> (ohne NIS2): ${luecken.slice(0, 40).map(it => `<span class="ic-tag" title="${esc(it.label)}">${esc(it.id)}</span>`).join(' ')}${luecken.length > 40 ? ' …' : ''}
    </div>` : `<div style="color:#166534;font-weight:600;margin-bottom:14px">✓ Alle Annex-A-Controls sind durch mindestens eine Richtlinie abgedeckt.</div>`}
    ${grid}`;
}

function abdeckungTogglePublished(on) { _abdeckungPublishedOnly = !!on; renderAbdeckung(); }

/** Klick auf eine Control-Zelle → welche Richtlinien decken sie ab. */
function abdeckungShowControl(id) {
  const map = _abdeckungMap();
  const who = map[id] || [];
  const label = (typeof normLabel === 'function') ? normLabel(id) : id;
  if (typeof toast === 'function') {
    toast(who.length ? `${label} — abgedeckt durch: ${who.join(', ')}` : `${label} — Lücke: von keiner Richtlinie abgedeckt.`,
      who.length ? 'success' : 'error', 6000);
  }
}

/* Node-Export nur für Tests (im Browser wirkungslos). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _abdeckungMap };
}
