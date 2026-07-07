'use strict';

/**
 * Reiter „ISMS-Abdeckung" (Admin)
 * ===============================
 * Zeigt über alle Richtlinien hinweg, welche ISO-27001-/NIS2-Controls durch
 * mindestens eine Richtlinie abgedeckt sind. Zwei Quellen:
 *   • GESPEICHERT: das Feld `normbezug` der Richtlinie (grün).
 *   • VORLÄUFIG:   Seed aus der Review-Zuordnung (normbezugSeedFor), solange
 *                  noch nichts gespeichert ist (gelb) – damit die Review sofort
 *                  sichtbar ist, ohne dass schon irgendwo etwas geklickt wurde.
 * Rein deterministisch, keine externen Dienste.
 */

let _abdeckungPublishedOnly = false;

/** Relevante (nicht archivierte) Richtlinien, optional nur veröffentlichte. */
function _abdeckungPolicies() {
  return (State.policies || []).filter(p =>
    p.status !== 'Archiviert' && (!_abdeckungPublishedOnly || p.status === 'Veröffentlicht'));
}

/**
 * Deckung je Control-ID:
 *   { saved: [Titel…], prov: [Titel…] }
 * saved = Richtlinien mit gespeichertem Normbezug für die ID.
 * prov  = Richtlinien, die die ID laut Review-Seed abdecken, aber (noch) NICHT
 *         gespeichert haben (nur wenn nicht schon in saved dieser Richtlinie).
 */
function _abdeckungData() {
  const pols = _abdeckungPolicies();
  const map = {};
  const get = id => (map[id] = map[id] || { saved: [], prov: [] });
  for (const p of pols) {
    const saved = new Set(p.normbezug || []);
    for (const id of saved) get(id).saved.push(p.title);
    // Seed nur ergänzen, wo die Richtlinie diese ID noch nicht gespeichert hat
    const seed = (typeof normbezugSeedFor === 'function') ? (normbezugSeedFor(p.title) || []) : [];
    for (const id of seed) if (!saved.has(id)) get(id).prov.push(p.title);
  }
  return map;
}

/** Richtlinien, deren Review-Zuordnung noch nicht (vollständig) gespeichert ist. */
function _abdeckungUnsaved() {
  return _abdeckungPolicies().filter(p => {
    const seed = (typeof normbezugSeedFor === 'function') ? normbezugSeedFor(p.title) : null;
    if (!seed) return false;
    const saved = new Set(p.normbezug || []);
    return seed.some(id => !saved.has(id));
  });
}

function _abColor(kind, n) {
  if (kind === 'saved') return n > 1
    ? 'background:#86efac;color:#14532d;border-color:#4ade80'      // mehrfach gespeichert
    : 'background:#dcfce7;color:#166534;border-color:#bbf7d0';     // gespeichert
  if (kind === 'prov')  return 'background:#fef9c3;color:#854d0e;border-color:#fde68a'; // vorläufig (Review)
  return 'background:#fee2e2;color:#991b1b;border-color:#fecaca';  // Lücke
}

function renderAbdeckung() {
  const mount = document.getElementById('abdeckung-mount');
  if (!mount) return;
  if (typeof NORMEN === 'undefined') { mount.innerHTML = '<div class="col-warning" style="display:block">Normen-Katalog nicht geladen.</div>'; return; }
  const data = _abdeckungData();
  const savedN = id => (data[id] ? data[id].saved.length : 0);
  const provN  = id => (data[id] ? data[id].prov.length  : 0);
  const anyN   = id => savedN(id) + provN(id);

  const annexIds = NORMEN.filter(g => /Annex/.test(g.group)).flatMap(g => g.items.map(i => i.id));
  const annexSaved = annexIds.filter(id => savedN(id) > 0).length;
  const annexAny   = annexIds.filter(id => anyN(id)  > 0).length;
  const pctSaved = annexIds.length ? Math.round(annexSaved / annexIds.length * 100) : 0;
  const pctAny   = annexIds.length ? Math.round(annexAny   / annexIds.length * 100) : 0;

  const luecken = NORMEN.filter(g => !/NIS2/.test(g.group))
    .flatMap(g => g.items).filter(it => anyN(it.id) === 0);
  const unsaved = _abdeckungUnsaved();
  const missingCol = (typeof spMissingPolicyColumns === 'function')
    ? spMissingPolicyColumns().some(c => c.name === 'NormbezugJson') : false;

  const grid = NORMEN.map(g => {
    const done = g.items.filter(it => anyN(it.id) > 0).length;
    const cells = g.items.map(it => {
      const s = savedN(it.id), pr = provN(it.id);
      const kind = s > 0 ? 'saved' : (pr > 0 ? 'prov' : 'luecke');
      const d = data[it.id] || { saved: [], prov: [] };
      const tip = it.id + ' — ' + it.label + '\n'
        + (d.saved.length ? 'Gespeichert: ' + d.saved.join(', ') + '\n' : '')
        + (d.prov.length  ? 'Vorläufig (Review): ' + d.prov.join(', ') : '')
        + (!d.saved.length && !d.prov.length ? 'Lücke – von keiner Richtlinie abgedeckt' : '');
      const badge = s > 1 ? ` <span style="opacity:.75">×${s}</span>` : (kind === 'prov' ? ' <span style="opacity:.75">◔</span>' : '');
      return `<div class="ab-cell" title="${esc(tip)}" onclick="abdeckungShowControl('${esc(it.id)}')"
        style="${_abColor(kind, s)};border:1px solid;border-radius:6px;padding:5px 7px;font-size:.72rem;cursor:pointer;min-width:0">
        <b>${esc(it.id)}</b>${badge}</div>`;
    }).join('');
    return `<div style="margin-bottom:14px">
      <div style="font-size:.8rem;font-weight:700;margin:0 2px 6px">${esc(g.group)}
        <span style="color:var(--c-muted);font-weight:500">— ${done}/${g.items.length} abgedeckt</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:5px">${cells}</div>
    </div>`;
  }).join('');

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Abdeckung der ISO-27001-/NIS2-Controls durch die Richtlinien.
      <b>Annex-A: ${annexSaved}/${annexIds.length} gespeichert (${pctSaved}%)${annexAny > annexSaved ? ` · ${annexAny}/${annexIds.length} inkl. Review (${pctAny}%)` : ''}</b>.
      <label class="ack-check" style="display:inline-flex;font-weight:500;margin-left:12px">
        <input type="checkbox" ${_abdeckungPublishedOnly ? 'checked' : ''} onchange="abdeckungTogglePublished(this.checked)">
        <span>nur veröffentlichte</span></label>
    </div>
    ${missingCol ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ Spalte „NormbezugJson" fehlt in der SharePoint-Liste „Richtlinien".</b> Ohne sie wird der Normbezug beim Speichern verworfen.
      Bitte einmalig anlegen (Typ „Mehrere Zeilen Text"), danach hier „↻ Aktualisieren".</div>` : ''}
    ${unsaved.length ? `<div style="display:block;margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#fefce8;border:1px solid #fde68a">
      <b>${unsaved.length} Richtlinie(n) haben eine Review-Zuordnung, die noch nicht gespeichert ist</b> (gelb dargestellt):
      ${unsaved.map(p => `<span class="ic-tag" title="${esc((normbezugSeedFor(p.title) || []).map(id => typeof normLabel === 'function' ? normLabel(id) : id).join(' · '))}">${esc(p.title)}</span>`).join(' ')}
      <div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="ab-apply-btn" onclick="abdeckungApplySeeds()"${missingCol ? ' disabled title="Erst die Spalte NormbezugJson anlegen"' : ''}>✔ Review-Zuordnungen jetzt speichern</button></div>
    </div>` : ''}
    <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:.75rem;margin-bottom:14px">
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;${_abColor('saved', 1)};border:1px solid;vertical-align:-1px"></span> gespeichert</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;${_abColor('saved', 2)};border:1px solid;vertical-align:-1px"></span> mehrfach (×N)</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;${_abColor('prov')};border:1px solid;vertical-align:-1px"></span> vorläufig aus Review (◔, nicht gespeichert)</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;${_abColor('luecke')};border:1px solid;vertical-align:-1px"></span> Lücke</span>
    </div>
    ${luecken.length ? `<div class="col-warning" style="display:block;margin-bottom:14px">
      <b>${luecken.length} Control(s) ohne Abdeckung</b> (ohne NIS2): ${luecken.slice(0, 40).map(it => `<span class="ic-tag" title="${esc(it.label)}">${esc(it.id)}</span>`).join(' ')}${luecken.length > 40 ? ' …' : ''}
    </div>` : `<div style="color:#166534;font-weight:600;margin-bottom:14px">✓ Alle Annex-A-Controls sind (inkl. Review) durch mindestens eine Richtlinie abgedeckt.</div>`}
    ${grid}`;
}

function abdeckungTogglePublished(on) { _abdeckungPublishedOnly = !!on; renderAbdeckung(); }

/** Klick auf eine Control-Zelle → welche Richtlinien decken sie ab. */
function abdeckungShowControl(id) {
  const d = _abdeckungData()[id] || { saved: [], prov: [] };
  const label = (typeof normLabel === 'function') ? normLabel(id) : id;
  const parts = [];
  if (d.saved.length) parts.push('gespeichert: ' + d.saved.join(', '));
  if (d.prov.length)  parts.push('vorläufig (Review): ' + d.prov.join(', '));
  if (typeof toast === 'function') {
    toast(parts.length ? `${label} — ${parts.join(' · ')}` : `${label} — Lücke: von keiner Richtlinie abgedeckt.`,
      d.saved.length ? 'success' : (d.prov.length ? 'info' : 'error'), 6000);
  }
}

/** Review-Seeds auf alle passenden Richtlinien anwenden und speichern. */
async function abdeckungApplySeeds() {
  const targets = _abdeckungUnsaved();
  if (!targets.length) return;
  const btn = document.getElementById('ab-apply-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  let ok = 0, fail = 0;
  for (const p of targets) {
    const src = State.policies.find(x => x.id === p.id);
    if (!src) continue;
    const seed = normbezugSeedFor(src.title) || [];
    src.normbezug = [...new Set([...(src.normbezug || []), ...seed])];
    try { await spSavePolicy(src); ok++; }
    catch (e) { fail++; console.warn('[abdeckung] speichern fehlgeschlagen:', src.title, e.message); }
    if (btn) btn.textContent = `Speichere ${ok + fail}/${targets.length} …`;
  }
  try { if (typeof reloadData === 'function') await reloadData(); } catch (e) { /* Anzeige nutzt State */ }
  renderAbdeckung();
  if (typeof toast === 'function') {
    toast(fail ? `${ok} gespeichert, ${fail} fehlgeschlagen (Spalte „NormbezugJson" vorhanden?)`
               : `${ok} Richtlinie(n) mit Normbezug gespeichert ✓`, fail ? 'error' : 'success');
  }
}

/* Node-Export nur für Tests (im Browser wirkungslos). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _abdeckungData, _abdeckungUnsaved };
}
