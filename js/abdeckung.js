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
let _abdeckungMode = 'heatmap';   // 'heatmap' | 'soa' (Erklärung zur Anwendbarkeit)

/** Umschalter Heatmap ↔ SoA (beide Renderer setzen ihn an den Anfang des Mounts). */
function _abModeSwitcher(active) {
  const b = (mode, label) => `<button class="btn btn-sm ${active === mode ? 'btn-primary' : 'btn-outline'}"
    onclick="abdeckungSetMode('${mode}')">${label}</button>`;
  return `<div style="display:flex;gap:6px;margin-bottom:14px">${b('heatmap', 'Heatmap & Lücken')}${b('soa', 'SoA – Erklärung zur Anwendbarkeit')}</div>`;
}

function abdeckungSetMode(mode) {
  _abdeckungMode = mode === 'soa' ? 'soa' : 'heatmap';
  if (_abdeckungMode === 'soa' && typeof initSoa === 'function') initSoa();
  else renderAbdeckung();
}

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
  if (_abdeckungMode === 'soa' && typeof renderSoa === 'function') { renderSoa(); return; }
  const data = _abdeckungData();
  const savedN = id => (data[id] ? data[id].saved.length : 0);
  const provN  = id => (data[id] ? data[id].prov.length  : 0);
  const anyN   = id => savedN(id) + provN(id);

  const annexIds = NORMEN.filter(g => /Annex/.test(g.group)).flatMap(g => g.items.map(i => i.id));
  const annexSaved = annexIds.filter(id => savedN(id) > 0).length;
  const annexAny   = annexIds.filter(id => anyN(id)  > 0).length;
  const pctSaved = annexIds.length ? Math.round(annexSaved / annexIds.length * 100) : 0;
  const pctAny   = annexIds.length ? Math.round(annexAny   / annexIds.length * 100) : 0;

  const nis2Ids   = NORMEN.filter(g => /NIS2/.test(g.group)).flatMap(g => g.items.map(i => i.id));
  const nis2Saved = nis2Ids.filter(id => savedN(id) > 0).length;
  const nis2Any   = nis2Ids.filter(id => anyN(id)  > 0).length;
  const nis2Pct   = nis2Ids.length ? Math.round(nis2Saved / nis2Ids.length * 100) : 0;
  const nis2PctAny= nis2Ids.length ? Math.round(nis2Any   / nis2Ids.length * 100) : 0;

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

  mount.innerHTML = _abModeSwitcher('heatmap') + `
    <div class="view-desc" style="margin:0 0 12px">
      Abdeckung der ISO-27001-/NIS2-Controls durch die Richtlinien.
      <b>Annex-A: ${annexSaved}/${annexIds.length} gespeichert (${pctSaved}%)${annexAny > annexSaved ? ` · ${annexAny}/${annexIds.length} inkl. Review (${pctAny}%)` : ''}</b>
      · <b>NIS2: ${nis2Saved}/${nis2Ids.length} gespeichert (${nis2Pct}%)${nis2Any > nis2Saved ? ` · ${nis2Any}/${nis2Ids.length} inkl. Review (${nis2PctAny}%)` : ''}</b>.
      <label class="ack-check" style="display:inline-flex;font-weight:500;margin-left:12px">
        <input type="checkbox" ${_abdeckungPublishedOnly ? 'checked' : ''} onchange="abdeckungTogglePublished(this.checked)">
        <span>nur veröffentlichte</span></label>
      <button class="btn btn-outline btn-sm" style="margin-left:10px" onclick="abdeckungExportReport()" title="Druckfähigen Auditnachweis (Abdeckung + Konformitätsstatus) öffnen">🖨 Report</button>
      <button class="btn btn-outline btn-sm" onclick="abdeckungExportCsv()" title="Abdeckungsmatrix als CSV (Excel) herunterladen">⬇ CSV</button>
    </div>
    ${missingCol ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ Spalte „NormbezugJson" fehlt in der SharePoint-Liste „Richtlinien".</b> Ohne sie wird der Normbezug beim Speichern verworfen.
      Bitte einmalig anlegen (Typ „Mehrere Zeilen Text"), danach hier „↻ Aktualisieren".</div>` : ''}
    ${unsaved.length ? `<div style="display:block;margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#fefce8;border:1px solid #fde68a">
      <b>${unsaved.length} Richtlinie(n) haben eine Review-Zuordnung, die noch nicht gespeichert ist</b> (gelb dargestellt):
      ${unsaved.map(p => `<span class="ic-tag" title="${esc((normbezugSeedFor(p.title) || []).map(id => typeof normLabel === 'function' ? normLabel(id) : id).join(' · '))}">${esc(p.title)}</span>`).join(' ')}
      ${(typeof canWriteTab !== 'function' || canWriteTab('abdeckung')) ? `<div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="ab-apply-btn" onclick="abdeckungApplySeeds()"${missingCol ? ' disabled title="Erst die Spalte NormbezugJson anlegen"' : ''}>✔ Review-Zuordnungen jetzt speichern</button></div>` : ''}
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
  if (typeof canWriteTab === 'function' && !canWriteTab('abdeckung')) {
    if (typeof toast === 'function') toast('Nur Lesezugriff auf „ISMS-Abdeckung".', 'error'); return;
  }
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

/* ═══════════════════════════════════════════════════
   Export: Auditnachweis (Druckansicht) + CSV (Excel)
   Rein deterministisch aus dem aktuellen State – keine externen Dienste.
═══════════════════════════════════════════════════ */

/** Status-Wort je Control für Report/CSV. */
function _abStatusWord(d) {
  if (d && d.saved.length) return 'gespeichert';
  if (d && d.prov.length)  return 'vorläufig (Review)';
  return 'Lücke';
}

/** Konformitäts-Kurzstatus einer Richtlinie (nutzt konformErreicht, falls geladen). */
function _abKonformStatus(p) {
  if (p.status === 'Veröffentlicht') return 'veröffentlicht';
  if (p.status === 'Freigabe')       return 'konform – in Freigabe';
  if (typeof konformErreicht === 'function' && konformErreicht(p)) return 'konform';
  if (p.status === 'Konformitätsprüfung' || p.status === 'InReview') return 'in Konformitätsprüfung';
  return p.status || '–';
}

/** Druckfähigen Auditnachweis in neuem Fenster öffnen (Abdeckung + Konformitätsstatus). */
function abdeckungExportReport() {
  if (typeof NORMEN === 'undefined') { if (typeof toast === 'function') toast('Normen-Katalog nicht geladen.', 'error'); return; }
  const data = _abdeckungData();
  const pols = _abdeckungPolicies().slice().sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  const stamp = new Date().toLocaleString('de-DE');

  const annexIds = NORMEN.filter(g => /Annex/.test(g.group)).flatMap(g => g.items.map(i => i.id));
  const nis2Ids  = NORMEN.filter(g => /NIS2/.test(g.group)).flatMap(g => g.items.map(i => i.id));
  const cov = ids => ids.filter(id => data[id] && (data[id].saved.length || data[id].prov.length)).length;
  const covSaved = ids => ids.filter(id => data[id] && data[id].saved.length).length;

  const controlRows = NORMEN.map(g => {
    const rows = g.items.map(it => {
      const d = data[it.id] || { saved: [], prov: [] };
      const st = _abStatusWord(d);
      const col = d.saved.length ? '#166534' : (d.prov.length ? '#854d0e' : '#991b1b');
      const who = [...d.saved.map(t => t), ...d.prov.map(t => t + ' (Review)')].join(', ') || '—';
      return `<tr>
        <td style="white-space:nowrap"><b>${esc(it.id)}</b></td>
        <td>${esc(it.label)}</td>
        <td style="color:${col};font-weight:600;white-space:nowrap">${esc(st)}</td>
        <td>${esc(who)}</td></tr>`;
    }).join('');
    return `<tr><td colspan="4" style="background:#f3f4f6;font-weight:700;padding:6px 8px">${esc(g.group)}</td></tr>${rows}`;
  }).join('');

  const policyRows = pols.map(p => {
    const votes = (p.konformitaet || []).map(v => `${v.name || v.upn}: ${v.entscheidung === 'konform' ? 'konform' : 'nicht konform'}`).join('; ');
    const frei  = (p.freigaben || []).map(v => v.name || v.upn).join('; ');
    const nb = (p.normbezug || []).map(id => (typeof normLabel === 'function' ? normLabel(id) : id)).join(' · ') || '—';
    return `<tr>
      <td><b>${esc(p.title)}</b><div style="color:#6b7280;font-size:11px">v${esc(p.version)}${p.kategorie ? ' · ' + esc(p.kategorie) : ''}</div></td>
      <td style="white-space:nowrap">${esc(_abKonformStatus(p))}</td>
      <td>${esc(votes || '—')}${frei ? '<br><span style="color:#6b7280">Freigabe: ' + esc(frei) + '</span>' : ''}</td>
      <td style="font-size:11px">${esc(nb)}</td></tr>`;
  }).join('');

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>ISMS-Abdeckung & Konformität – DIHAG (${esc(stamp)})</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:28px;font-size:12px;line-height:1.45}
      h1{font-size:18px;margin:0 0 2px} h2{font-size:14px;margin:22px 0 8px;border-bottom:2px solid #111827;padding-bottom:3px}
      .muted{color:#6b7280} table{border-collapse:collapse;width:100%;margin-top:6px}
      th,td{border:1px solid #d1d5db;padding:4px 8px;text-align:left;vertical-align:top}
      th{background:#111827;color:#fff;font-size:11px} .kpi{display:flex;gap:22px;margin:10px 0}
      .kpi b{font-size:20px;display:block} .noprint{margin:16px 0}
      @media print{.noprint{display:none}}
    </style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    <h1>ISMS-Abdeckung &amp; Konformitätsstatus</h1>
    <div class="muted">DIHAG · Richtlinienmanagement · Stand ${esc(stamp)} · ${pols.length} Richtlinien${_abdeckungPublishedOnly ? ' (nur veröffentlichte)' : ''}</div>
    <div class="kpi">
      <div><b>${covSaved(annexIds)}/${annexIds.length}</b><span class="muted">Annex-A gespeichert</span></div>
      <div><b>${cov(annexIds)}/${annexIds.length}</b><span class="muted">Annex-A inkl. Review</span></div>
      <div><b>${covSaved(nis2Ids)}/${nis2Ids.length}</b><span class="muted">NIS2 gespeichert</span></div>
      <div><b>${cov(nis2Ids)}/${nis2Ids.length}</b><span class="muted">NIS2 inkl. Review</span></div>
    </div>
    <h2>1 · Richtlinien – Konformität &amp; Normbezug</h2>
    <table><thead><tr><th>Richtlinie</th><th>Status</th><th>Konformitätsprüfung / Freigabe</th><th>Normbezug</th></tr></thead>
      <tbody>${policyRows || '<tr><td colspan="4">Keine Richtlinien.</td></tr>'}</tbody></table>
    <h2>2 · Control-Abdeckung (ISO 27001 / NIS2)</h2>
    <table><thead><tr><th>Control</th><th>Bezeichnung</th><th>Status</th><th>Abgedeckt durch</th></tr></thead>
      <tbody>${controlRows}</tbody></table>
    <p class="muted" style="margin-top:18px">Erstellt aus dem DIHAG-Richtlinienmanagement – deterministisch, ohne KI. „gespeichert" = im Normbezug der Richtlinie hinterlegt; „vorläufig (Review)" = aus der ISB-Review-Zuordnung, noch nicht gespeichert.</p>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Pop-up-Blocker? Bitte Pop-ups für diese Seite erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/** Abdeckungsmatrix als CSV (Excel, ; getrennt, UTF-8 mit BOM) herunterladen. */
function abdeckungExportCsv() {
  if (typeof NORMEN === 'undefined') { if (typeof toast === 'function') toast('Normen-Katalog nicht geladen.', 'error'); return; }
  const data = _abdeckungData();
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const rows = [['Control', 'Bezeichnung', 'Gruppe', 'Status', 'Anzahl', 'Abgedeckt durch (gespeichert)', 'Vorläufig (Review)']];
  for (const g of NORMEN) for (const it of g.items) {
    const d = data[it.id] || { saved: [], prov: [] };
    rows.push([it.id, it.label, g.group, _abStatusWord(d), d.saved.length + d.prov.length, d.saved.join(', '), d.prov.join(', ')]);
  }
  const csv = '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ISMS-Abdeckung_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  if (typeof toast === 'function') toast('CSV heruntergeladen ✓', 'success');
}

/* Node-Export nur für Tests (im Browser wirkungslos). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _abdeckungData, _abdeckungUnsaved, _abStatusWord, _abKonformStatus };
}
