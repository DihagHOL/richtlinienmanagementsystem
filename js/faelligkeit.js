'use strict';

/**
 * Reiter „Fälligkeiten / Wiedervorlage" (Admin)
 * =============================================
 * Zeigt Richtlinien nach dem Termin der nächsten internen Überprüfung
 * (`naechsteReview`) gruppiert: überfällig · fällig in ≤ 30 Tagen · später ·
 * ohne Termin. ISO 27001 A.5.1 verlangt die regelmäßige Überprüfung von
 * Richtlinien – hier wird das operativ sichtbar und mit einem Klick pflegbar.
 * Rein deterministisch aus dem State, keine externen Dienste, keine KI.
 * Der GitHub-Erinnerungs-Cron verschickt zusätzlich einen Fälligkeits-Digest.
 */

const FAELLIG_SOON_DAYS = 30;   // „fällig bald"-Fenster

/** Tage bis zum Review-Termin (negativ = überfällig) oder null, wenn kein Termin. */
function _faelligDays(p) {
  if (!p.naechsteReview) return null;
  const d = new Date(p.naechsteReview);
  if (isNaN(d)) return null;
  const day = 86400000;
  return Math.floor((d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / day);
}

/** Alle relevanten Richtlinien in Kategorien einsortieren. */
function _faelligBuckets() {
  const b = { overdue: [], soon: [], later: [], none: [] };
  for (const p of (State.policies || [])) {
    if (p.status === 'Archiviert') continue;
    const d = _faelligDays(p);
    if (d === null) b.none.push({ p, d });
    else if (d < 0) b.overdue.push({ p, d });
    else if (d <= FAELLIG_SOON_DAYS) b.soon.push({ p, d });
    else b.later.push({ p, d });
  }
  const byDate = (a, c) => a.d - c.d;
  b.overdue.sort(byDate); b.soon.sort(byDate); b.later.sort(byDate);
  b.none.sort((a, c) => (a.p.title || '').localeCompare(c.p.title || '', 'de'));
  return b;
}

function _faelligDueLabel(d) {
  if (d === null) return '– kein Termin –';
  if (d < 0)  return `überfällig seit ${-d} Tag${-d === 1 ? '' : 'en'}`;
  if (d === 0) return 'heute fällig';
  return `fällig in ${d} Tag${d === 1 ? '' : 'en'}`;
}

function _faelligCard(entry, accent) {
  const { p, d } = entry;
  const dateTxt = p.naechsteReview ? fmtDate(p.naechsteReview) : '—';
  return `<div class="item-card" style="cursor:default;border-left:4px solid ${accent}">
    <div class="ic-top"><div class="ic-title">${esc(p.title)}</div>
      <div class="ic-topright">${typeof workflowBadge === 'function' ? workflowBadge(p.status) : ''}</div></div>
    <div class="ic-tags">
      ${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}
      <span class="ic-tag">v${esc(p.version)}</span>
      <span class="ic-tag" style="${d !== null && d < 0 ? 'background:#fef2f2;color:#b91c1c' : (d !== null && d <= FAELLIG_SOON_DAYS ? 'background:#fffbeb;color:#b45309' : '')}">🔎 ${esc(dateTxt)} · ${esc(_faelligDueLabel(d))}</span>
      ${p.wiederholungMonate ? `<span class="ic-tag">↻ ${p.wiederholungMonate == 12 ? 'jährlich' : 'alle ' + p.wiederholungMonate + ' Mon.'}</span>` : ''}
    </div>
    <div style="display:flex;gap:7px;margin-top:12px;align-items:center;flex-wrap:wrap">
      <span style="flex:1;min-width:0;font-size:.8rem;color:var(--c-muted)">${p.dokumentName ? '📄 ' + esc(p.dokumentName) : '⚠ kein Dokument'}</span>
      <button class="btn btn-outline btn-sm" onclick="openPolicyEditor('${esc(p.id)}')">✏ Bearbeiten</button>
      ${(typeof canWriteTab !== 'function' || canWriteTab('faelligkeit'))
        ? `<button class="btn btn-success btn-sm" onclick="faelligSetReview('${esc(p.id)}',12)" title="Nächste Überprüfung auf heute + 12 Monate setzen">🔁 +12 Monate</button>` : ''}
    </div>
  </div>`;
}

function renderFaelligkeit() {
  const mount = document.getElementById('faelligkeit-mount');
  if (!mount) return;
  const b = _faelligBuckets();
  const kpi = (n, label, col) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:12px 14px">
    <div style="font-size:1.6rem;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:.8rem;color:var(--c-muted)">${label}</div></div>`;

  const section = (title, list, accent, emptyTxt) => `
    <div style="font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;margin:20px 2px 8px">${esc(title)} (${list.length})</div>
    ${list.length ? list.map(e => _faelligCard(e, accent)).join('') : (typeof emptyState === 'function' ? emptyState(emptyTxt, '✓') : `<div class="field-hint">${esc(emptyTxt)}</div>`)}`;

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 14px">
      Interne Überprüfung (Wiedervorlage) der Richtlinien – Grundlage: Feld „Nächste Überprüfung".
      <b>ISO 27001 A.5.1</b> verlangt die regelmäßige Überprüfung. „+12 Monate" setzt den nächsten Termin sofort.
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px">
      ${kpi(b.overdue.length, 'überfällig', '#b91c1c')}
      ${kpi(b.soon.length, `fällig in ≤ ${FAELLIG_SOON_DAYS} Tagen`, '#b45309')}
      ${kpi(b.later.length, 'später terminiert', '#15803d')}
      ${kpi(b.none.length, 'ohne Termin', '#6b7280')}
    </div>
    ${section('Überfällig', b.overdue, '#ef4444', 'Nichts überfällig.')}
    ${section(`Fällig in ≤ ${FAELLIG_SOON_DAYS} Tagen`, b.soon, '#f59e0b', 'Nichts in den nächsten Wochen fällig.')}
    ${b.none.length ? section('Ohne Überprüfungstermin', b.none, '#9ca3af', '') : ''}
    ${b.later.length ? section('Später terminiert', b.later, '#22c55e', '') : ''}`;
}

/** Nächste Überprüfung auf heute + N Monate setzen und speichern. */
async function faelligSetReview(id, months) {
  if (typeof canWriteTab === 'function' && !canWriteTab('faelligkeit')) {
    if (typeof toast === 'function') toast('Nur Lesezugriff auf „Fälligkeiten".', 'error'); return;
  }
  const src = State.policies.find(x => x.id === id);
  if (!src) return;
  const d = new Date(); d.setMonth(d.getMonth() + (months || 12));
  const p = JSON.parse(JSON.stringify(src));
  p.naechsteReview = d.toISOString();
  try {
    await spSavePolicy(p);
    if (typeof reloadData === 'function') await reloadData();
    else src.naechsteReview = p.naechsteReview;
    renderFaelligkeit();
    if (typeof renderAdminList === 'function') renderAdminList();
    if (typeof toast === 'function') toast(`Nächste Überprüfung: ${fmtDate(p.naechsteReview)} ✓`, 'success');
  } catch (e) {
    if (typeof toast === 'function') toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

/* Node-Export nur für Tests (im Browser wirkungslos). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _faelligDays, _faelligBuckets, _faelligDueLabel };
}
