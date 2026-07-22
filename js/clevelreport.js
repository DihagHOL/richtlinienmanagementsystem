'use strict';

/**
 * C-Level-/Management-Bericht (im Reiter „Audit Report")
 * =====================================================
 * Fasst den ISMS-Status auf Führungsebene zusammen: die wesentlichen Kennzahlen
 * (Richtlinien, Kenntnisnahme-Quote, ISMS-Abdeckung ISO/NIS2, SoA, Risiken,
 * Reifegrad IT/OT, Fälligkeiten) plus eine deterministische Normkonformitäts-
 * Prüfung (ISO/IEC 27001 & NIS2). Der Bericht lässt sich ansehen, drucken/als
 * PDF speichern und per Mausklick an die in den Einstellungen hinterlegte
 * Empfängeradresse (getClevelMail) senden. Rein deterministisch, ohne KI.
 */

let _clevelData = null;   // zuletzt berechnete Kennzahlen (für Senden/Drucken)

/* ── Datenerhebung ── */

/** Reifegrad-Ampeln zählen – funktioniert auch, wenn der Reifegrad-Reiter nie geöffnet wurde. */
function _clevelCountReifegrad(cfg) {
  if (!cfg || !cfg.ratings || typeof REIFEGRAD_KATALOG === 'undefined') return null;
  const werke = (typeof REIFEGRAD_WERKE !== 'undefined') ? REIFEGRAD_WERKE : ['DIHAG', 'EIS', 'DSO'];
  const ratings = cfg.ratings || {};
  const removed = new Set(cfg.removed || []);
  const cp = cfg.customPunkte || {};
  const mids = [];
  REIFEGRAD_KATALOG.forEach(t => {
    t.punkte.forEach(p => { if (!removed.has(p.id)) mids.push(p.id); });
    (cp[t.id] || []).forEach(p => { if (!removed.has(p.id)) mids.push(p.id); });
  });
  (cfg.customTopics || []).forEach(t => (t.punkte || []).forEach(p => { if (!removed.has(p.id)) mids.push(p.id); }));
  const d = { rot: 0, gelb: 0, gruen: 0, weiss: 0, bewertet: 0, total: 0 };
  mids.forEach(mid => werke.forEach(w => {
    const s = (ratings[mid] && ratings[mid][w]) || 'weiss';
    if (d[s] === undefined) d[s] = 0;
    d[s]++; d.total++; if (s !== 'weiss') d.bewertet++;
  }));
  return d;
}

/** Alle Kennzahlen zusammentragen (lädt fehlende Daten bei Bedarf nach). */
async function _clevelGather() {
  const m = { stamp: new Date(), fehler: [] };

  // Richtlinien (aus dem State – immer vorhanden)
  const pols = State.policies || [];
  const by = s => pols.filter(p => p.status === s).length;
  const workflow = pols.filter(p => ['Konformitätsprüfung', 'InReview', 'Mitbestimmung', 'Freigabe'].includes(p.status)).length;
  m.policies = {
    aktiv: pols.filter(p => p.status !== 'Archiviert').length,
    veroeffentlicht: by('Veröffentlicht'),
    entwuerfe: by('Entwurf'),
    imWorkflow: workflow,
    pflicht: pols.filter(p => p.status === 'Veröffentlicht' && p.pflicht).length,
  };

  // Kenntnisnahme-Quote (Pflicht-Richtlinien)
  try {
    if (!AdminState.members) AdminState.members = await spGetMembers();
    if (!AdminState.allAcks) AdminState.allAcks = await spGetAcknowledgements();
    const pubs = pols.filter(p => p.status === 'Veröffentlicht' && p.pflicht);
    let soll = 0, done = 0;
    for (const p of pubs) {
      const rows = (typeof _complianceRowsFor === 'function') ? _complianceRowsFor(p) : [];
      soll += rows.length;
      done += rows.filter(r => r.st === 'abgeschlossen').length;
    }
    m.compliance = { soll, done, quote: soll ? Math.round(done / soll * 100) : 100 };
  } catch (e) { m.compliance = null; m.fehler.push('Kenntnisnahme-Quote: ' + e.message); }

  // ISMS-Abdeckung (Annex-A / NIS2)
  try {
    if (typeof _abdeckungData === 'function' && typeof NORMEN !== 'undefined') {
      const data = _abdeckungData();
      const ids = grp => NORMEN.filter(g => grp.test(g.group)).flatMap(g => g.items.map(i => i.id));
      const saved = list => list.filter(id => data[id] && data[id].saved.length).length;
      const annex = ids(/Annex/), nis2 = ids(/NIS2/);
      m.abdeckung = {
        annexSaved: saved(annex), annexTotal: annex.length, annexPct: annex.length ? Math.round(saved(annex) / annex.length * 100) : 0,
        nis2Saved: saved(nis2), nis2Total: nis2.length, nis2Pct: nis2.length ? Math.round(saved(nis2) / nis2.length * 100) : 0,
      };
    }
  } catch (e) { m.fehler.push('Abdeckung: ' + e.message); }

  // SoA
  try {
    if (!_soaData && typeof spLoadSoa === 'function') {
      const loaded = await spLoadSoa();
      _soaData = (loaded && typeof loaded === 'object') ? loaded : { controls: {}, meta: {} };
    }
    if (typeof _soaKpis === 'function') {
      const k = _soaKpis();
      m.soa = { gepflegt: k.gepflegt, total: k.total, umgesetzt: k.umgesetzt, anwendbar: k.anwendbar, ausgeschlossen: k.ausgeschlossen, begrFehlt: k.begrFehlt };
    }
  } catch (e) { m.fehler.push('SoA: ' + e.message); }

  // Risiken
  try {
    if (!_risks && typeof spGetRisks === 'function') _risks = await spGetRisks();
    const all = _risks || [];
    const open = all.filter(r => r.status !== 'geschlossen');
    m.risiken = {
      gesamt: all.length,
      offen: open.length,
      hoch: open.filter(r => riskStufe(riskScore(_riskEff(r).e, _riskEff(r).a)) === 'hoch').length,
      mUeber: all.reduce((s, r) => s + _riskOverdueMassnahmen(r).length, 0),
      revUeber: all.filter(_riskReviewOverdue).length,
    };
  } catch (e) { m.risiken = null; m.fehler.push('Risiken: ' + e.message + ' (Liste evtl. noch nicht angelegt)'); }

  // Reifegrad IT/OT
  try {
    let cfg = (_reifegrad && _reifegrad.ratings) ? _reifegrad : null;
    if (!cfg && typeof spLoadReifegrad === 'function') cfg = await spLoadReifegrad();
    const d = _clevelCountReifegrad(cfg);
    m.reifegrad = d ? Object.assign(d, { pct: d.total ? Math.round(d.bewertet / d.total * 100) : 0 }) : null;
  } catch (e) { m.reifegrad = null; m.fehler.push('Reifegrad: ' + e.message); }

  // Fälligkeiten
  try {
    if (typeof _faelligBuckets === 'function') {
      const b = _faelligBuckets();
      m.faellig = { overdue: b.overdue.length, soon: b.soon.length };
    }
  } catch (e) { m.fehler.push('Fälligkeiten: ' + e.message); }

  return m;
}

/* ── Normkonformitäts-Prüfung (deterministisch) ── */

/** @returns [{ id, titel, status:'ok'|'warn'|'gap', text }] */
function _clevelIsoRows(m) {
  const rows = [];
  const add = (id, titel, status, text) => rows.push({ id, titel, status, text });

  // Führung & Leitlinien (ISO 27001 Kap. 5)
  if (m.policies.veroeffentlicht > 0)
    add('ISO 5', 'Führung & Leitlinien', 'ok', `${m.policies.veroeffentlicht} veröffentlichte Richtlinie(n); ${m.policies.imWorkflow} im Genehmigungs-Workflow.`);
  else
    add('ISO 5', 'Führung & Leitlinien', 'gap', 'Keine veröffentlichte Richtlinie – Leitlinien/Grundsätze fehlen.');

  // Risikomanagement (Kap. 6.1.2 / 8.2 / 8.3, NIS2 Art. 21(2a))
  if (m.risiken) {
    if (!m.risiken.gesamt) add('ISO 6.1.2', 'Risikomanagement', 'gap', 'Keine Risiken erfasst – Risikobeurteilung nicht nachweisbar.');
    else if (m.risiken.hoch > 0 || m.risiken.mUeber > 0)
      add('ISO 6.1.2', 'Risikomanagement', 'warn', `${m.risiken.offen} offen, davon ${m.risiken.hoch} hoch; ${m.risiken.mUeber} Maßnahme(n) überfällig.`);
    else add('ISO 6.1.2', 'Risikomanagement', 'ok', `${m.risiken.gesamt} Risiken erfasst, ${m.risiken.offen} offen, keine überfälligen Maßnahmen.`);
  } else add('ISO 6.1.2', 'Risikomanagement', 'warn', 'Risiko-Register nicht auswertbar.');

  // SoA (Kap. 6.1.3)
  if (m.soa) {
    if (m.soa.gepflegt < m.soa.total)
      add('ISO 6.1.3', 'Erklärung zur Anwendbarkeit (SoA)', 'warn', `${m.soa.gepflegt}/${m.soa.total} Controls entschieden; ${m.soa.begrFehlt || 0} Begründung(en) fehlen.`);
    else if (m.soa.begrFehlt)
      add('ISO 6.1.3', 'Erklärung zur Anwendbarkeit (SoA)', 'warn', `Vollständig entschieden, aber ${m.soa.begrFehlt} Begründung(en) fehlen.`);
    else add('ISO 6.1.3', 'Erklärung zur Anwendbarkeit (SoA)', 'ok', `SoA vollständig (${m.soa.gepflegt}/${m.soa.total}); ${m.soa.umgesetzt}/${m.soa.anwendbar} umgesetzt.`);
  }

  // Awareness / Kenntnisnahmen (Kap. 7.2 / 7.3, NIS2 Art. 21(2g))
  if (m.compliance) {
    const q = m.compliance.quote;
    add('ISO 7.3', 'Bewusstsein & Schulung', q >= 90 ? 'ok' : q >= 60 ? 'warn' : 'gap',
      `Kenntnisnahme-Quote ${q}% (${m.compliance.done}/${m.compliance.soll}) über Pflicht-Richtlinien.`);
  }

  // Betrieb / Reifegrad (Kap. 8)
  if (m.reifegrad) {
    const r = m.reifegrad;
    add('ISO 8', 'Betrieb (Reifegrad IT/OT)', r.rot === 0 ? 'ok' : r.rot <= 12 ? 'warn' : 'gap',
      `IT/OT-Betrieb: 🔴 ${r.rot} · 🟡 ${r.gelb} · 🟢 ${r.gruen} (bewertet ${r.pct}%).`);
  } else {
    add('ISO 8', 'Betrieb (Reifegrad IT/OT)', 'warn', 'Keine Reifegrad-Bewertung hinterlegt.');
  }

  // Überwachung / Reviews (Kap. 9)
  const revOver = (m.faellig ? m.faellig.overdue : 0) + (m.risiken ? m.risiken.revUeber : 0);
  add('ISO 9', 'Überwachung & Bewertung', revOver === 0 ? 'ok' : revOver <= 5 ? 'warn' : 'gap',
    revOver === 0 ? 'Keine überfälligen Reviews.' : `${revOver} überfällige(r) Review(s) (Richtlinien/Risiken).`);

  // Annex-A-Abdeckung
  if (m.abdeckung) {
    const p = m.abdeckung.annexPct;
    add('ISO Annex A', 'Control-Abdeckung (A.5–A.8)', p >= 90 ? 'ok' : p >= 60 ? 'warn' : 'gap',
      `${p}% der Annex-A-Controls belegt (${m.abdeckung.annexSaved}/${m.abdeckung.annexTotal}).`);
    // NIS2
    const n = m.abdeckung.nis2Pct;
    add('NIS2 Art. 21', 'NIS2-Maßnahmen', n >= 90 ? 'ok' : n >= 60 ? 'warn' : 'gap',
      `${n}% der NIS2-Anforderungen belegt (${m.abdeckung.nis2Saved}/${m.abdeckung.nis2Total}).`);
  }

  return rows;
}

function _clevelVerdict(rows) {
  const gaps = rows.filter(r => r.status === 'gap').length;
  const warns = rows.filter(r => r.status === 'warn').length;
  if (gaps) return { status: 'gap', label: `Handlungsbedarf – ${gaps} Lücke(n), ${warns} Hinweis(e)` };
  if (warns) return { status: 'warn', label: `Weitgehend konform – ${warns} Hinweis(e)` };
  return { status: 'ok', label: 'Konform – keine offenen Punkte' };
}

/* ── Rendering ── */

const _CL_COLORS = { ok: '#15803d', warn: '#b45309', gap: '#b91c1c' };
const _CL_ICON = { ok: '🟢', warn: '🟡', gap: '🔴' };

/** Kachel/Zahl. */
function _clTile(n, label, col) {
  return `<td style="padding:0 14px 0 0;vertical-align:top">
    <div style="font-size:22px;font-weight:800;color:${col || '#1a2644'}">${n}</div>
    <div style="font-size:11px;color:#6b7280">${label}</div></td>`;
}

/** Vollständiger Bericht als (E-Mail-taugliches) HTML. */
function _clevelReportHtml(m) {
  const rows = _clevelIsoRows(m);
  const verdict = _clevelVerdict(rows);
  const stamp = m.stamp.toLocaleString('de-DE');
  const kpiRow = `
    <table style="border-collapse:collapse;margin:6px 0 4px"><tr>
      ${_clTile(m.policies.aktiv, 'Richtlinien aktiv', '#17509e')}
      ${_clTile(m.policies.veroeffentlicht, 'veröffentlicht', '#15803d')}
      ${_clTile(m.policies.imWorkflow, 'im Workflow', m.policies.imWorkflow ? '#b45309' : '#15803d')}
      ${m.compliance ? _clTile(m.compliance.quote + '%', 'Kenntnisnahme', m.compliance.quote >= 90 ? '#15803d' : '#b45309') : ''}
      ${m.abdeckung ? _clTile(m.abdeckung.annexPct + '%', 'Annex-A', m.abdeckung.annexPct >= 90 ? '#15803d' : '#b45309') : ''}
      ${m.abdeckung ? _clTile(m.abdeckung.nis2Pct + '%', 'NIS2', m.abdeckung.nis2Pct >= 90 ? '#15803d' : '#b45309') : ''}
      ${m.risiken ? _clTile(m.risiken.hoch, 'hohe Risiken', m.risiken.hoch ? '#b91c1c' : '#15803d') : ''}
      ${m.reifegrad ? _clTile(m.reifegrad.rot, 'IT/OT nicht gelebt', m.reifegrad.rot ? '#b91c1c' : '#15803d') : ''}
    </tr></table>`;

  const isoRows = rows.map(r => `
    <tr>
      <td style="border:1px solid #e5e7eb;padding:5px 8px;white-space:nowrap;font-weight:600">${esc(r.id)}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 8px">${esc(r.titel)}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 8px;white-space:nowrap;color:${_CL_COLORS[r.status]};font-weight:700">${_CL_ICON[r.status]} ${r.status === 'ok' ? 'konform' : r.status === 'warn' ? 'Hinweis' : 'Lücke'}</td>
      <td style="border:1px solid #e5e7eb;padding:5px 8px;color:#374151">${esc(r.text)}</td>
    </tr>`).join('');

  const details = [];
  if (m.soa) details.push(`<b>SoA:</b> ${m.soa.gepflegt}/${m.soa.total} entschieden, ${m.soa.umgesetzt}/${m.soa.anwendbar} umgesetzt, ${m.soa.ausgeschlossen} ausgeschlossen`);
  if (m.risiken) details.push(`<b>Risiken:</b> ${m.risiken.gesamt} gesamt, ${m.risiken.offen} offen, ${m.risiken.hoch} hoch, ${m.risiken.mUeber} Maßnahmen überfällig`);
  if (m.reifegrad) details.push(`<b>Reifegrad IT/OT:</b> 🔴 ${m.reifegrad.rot} · 🟡 ${m.reifegrad.gelb} · 🟢 ${m.reifegrad.gruen} · ⚪ ${m.reifegrad.weiss} (bewertet ${m.reifegrad.pct}%)`);
  if (m.faellig) details.push(`<b>Fälligkeiten:</b> ${m.faellig.overdue} überfällig, ${m.faellig.soon} in ≤ 30 Tagen`);

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a2644;font-size:13px;line-height:1.45;max-width:760px">
    <div style="border-bottom:3px solid #17509e;padding-bottom:8px;margin-bottom:10px">
      <div style="font-size:19px;font-weight:800">ISMS-Management-Bericht (C-Level)</div>
      <div style="color:#6b7280;font-size:12px">DIHAG Foundry Group · ISO/IEC 27001:2022 &amp; NIS2 (EU) 2022/2555 · Stand ${esc(stamp)}</div>
    </div>
    <div style="background:${verdict.status === 'ok' ? '#f0fdf4' : verdict.status === 'warn' ? '#fffbeb' : '#fef2f2'};border:1px solid ${_CL_COLORS[verdict.status]}55;border-radius:8px;padding:9px 12px;margin-bottom:12px">
      <b style="color:${_CL_COLORS[verdict.status]}">${_CL_ICON[verdict.status]} Gesamteinschätzung: ${esc(verdict.label)}</b>
    </div>
    <div style="font-weight:700;font-size:14px;margin:4px 0">Wesentliche Kennzahlen</div>
    ${kpiRow}
    <div style="color:#374151;font-size:12px;margin:6px 0 14px">${details.join(' &nbsp;·&nbsp; ')}</div>
    <div style="font-weight:700;font-size:14px;margin:4px 0 6px">Normkonformitäts-Prüfung (ISO 27001 / NIS2)</div>
    <table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead><tr style="background:#1a2644;color:#fff">
        <th style="padding:5px 8px;text-align:left">Bezug</th><th style="padding:5px 8px;text-align:left">Bereich</th>
        <th style="padding:5px 8px;text-align:left">Status</th><th style="padding:5px 8px;text-align:left">Befund</th>
      </tr></thead>
      <tbody>${isoRows}</tbody>
    </table>
    <p style="color:#6b7280;font-size:11px;margin-top:14px">
      Automatisch erzeugt aus dem DIHAG-Richtlinienmanagement (deterministisch, ohne KI). Bewertung anhand
      fester Schwellen: „konform" 🟢, „Hinweis" 🟡, „Lücke" 🔴.
      ${m.fehler.length ? '<br>Hinweis: ' + esc(m.fehler.join(' · ')) : ''}
    </p>
  </div>`;
}

/* ── Öffnen / Vorschau ── */

async function openClevelReport() {
  if (typeof openModal !== 'function') return;
  openModal(`
    <div class="modal-header"><h3>📧 C-Level-Bericht</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="doc-loading">Kennzahlen &amp; Normprüfung werden zusammengetragen …</div></div>
    <div class="modal-footer"></div>`, true);
  let m;
  try { m = await _clevelGather(); }
  catch (e) { const b = document.querySelector('.modal-body'); if (b) b.innerHTML = `<div class="col-warning" style="display:block">Bericht konnte nicht erstellt werden: ${esc(e.message)}</div>`; return; }
  _clevelData = m;
  _clevelRenderPreview();
}

function _clevelRenderPreview() {
  const m = _clevelData;
  if (!m) return;
  const to = (typeof getClevelMail === 'function' ? getClevelMail() : '') || '';
  const canSend = typeof spSendMail === 'function';
  const body = document.querySelector('.modal-body');
  const footer = document.querySelector('.modal-footer');
  const header = document.querySelector('.modal-header h3');
  if (header) header.textContent = '📧 C-Level-Bericht';
  if (!body) return;
  body.innerHTML = `
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
      <div class="form-group" style="flex:1;min-width:240px;margin:0">
        <label>Empfänger <span style="font-weight:400;color:var(--c-muted)">(Komma/Semikolon trennt mehrere)</span></label>
        <input type="text" id="clevel-to" value="${esc(to)}" placeholder="geschaeftsfuehrung@dihag.com">
      </div>
      ${to ? '' : '<div class="field-hint" style="padding-bottom:8px">Kein Standard-Empfänger hinterlegt – unter <b>Einstellungen → C-Level-Bericht</b> setzbar.</div>'}
    </div>
    <div style="border:1px solid var(--c-border);border-radius:10px;padding:14px;background:#fff;max-height:52vh;overflow:auto">
      ${_clevelReportHtml(m)}
    </div>`;
  const footerHtml = `
    <button class="btn btn-outline" onclick="printClevelReport()">🖨 Drucken / PDF</button>
    <div style="flex:1"></div>
    <button class="btn btn-outline" onclick="closeModal()">Schließen</button>
    ${canSend ? `<button class="btn btn-primary" id="clevel-send-btn" onclick="sendClevelReport()">📧 Senden</button>` : ''}`;
  if (footer) footer.innerHTML = footerHtml;
  else body.insertAdjacentHTML('beforeend', `<div class="modal-footer" style="margin-top:12px">${footerHtml}</div>`);
}

function _clevelRecipients() {
  return String(document.getElementById('clevel-to')?.value || '')
    .split(/[;,]/).map(s => s.trim()).filter(Boolean);
}

async function sendClevelReport() {
  if (!_clevelData) return;
  const to = _clevelRecipients();
  if (!to.length) { toast('Bitte mindestens einen Empfänger angeben.', 'error'); return; }
  const btn = document.getElementById('clevel-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = '📧 Senden …'; }
  try {
    const subject = `ISMS-Management-Bericht (C-Level) – DIHAG – ${_clevelData.stamp.toLocaleDateString('de-DE')}`;
    const ok = await spSendMail(to, subject, _clevelReportHtml(_clevelData));
    if (ok) { toast('C-Level-Bericht gesendet ✓', 'success'); closeModal(); }
    else { toast('Anmeldung für den Mailversand nötig – bitte erneut versuchen.', 'error'); if (btn) { btn.disabled = false; btn.textContent = '📧 Senden'; } }
  } catch (e) {
    toast('Senden fehlgeschlagen: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '📧 Senden'; }
  }
}

function printClevelReport() {
  if (!_clevelData) return;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>ISMS-Management-Bericht (C-Level) – DIHAG</title>
    <style>@media print{.noprint{display:none}} body{margin:24px}</style></head><body>
    <div class="noprint" style="margin-bottom:14px"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    ${_clevelReportHtml(_clevelData)}
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up-Blocker? Bitte Pop-ups erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _clevelIsoRows, _clevelVerdict, _clevelCountReifegrad, _clevelReportHtml };
}
