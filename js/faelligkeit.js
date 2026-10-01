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
      <button class="btn btn-outline btn-sm" onclick="openPolicyEditor(${jsArg(p.id)})">✏ Bearbeiten</button>
      ${(typeof canWriteTab !== 'function' || canWriteTab('faelligkeit')) ? `
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:.8rem;color:var(--c-muted)">heute +
          <input type="number" id="fael-m-${esc(p.id)}" min="1" max="120" value="${p.wiederholungMonate || 12}"
            style="width:58px;border:1px solid #d1d5db;border-radius:6px;padding:4px 6px;font-size:.82rem;font-family:inherit" title="Monate bis zur nächsten Überprüfung"> Mon.</span>
        <button class="btn btn-success btn-sm" onclick="faelligSetReviewMonths(${jsArg(p.id)})" title="Nächste Überprüfung auf heute + eingetragene Monate setzen">🔁 Setzen</button>
        ${p.naechsteReview ? `<button class="btn btn-ghost btn-sm" onclick="faelligClearReview(${jsArg(p.id)})" title="Überprüfungstermin entfernen">✕ Termin entfernen</button>` : ''}` : ''}
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
    ${b.later.length ? section('Später terminiert', b.later, '#22c55e', '') : ''}
    <div id="fael-prozesse" style="margin-top:28px"></div>`;
  _faelligProzesseZeigen();
}

/* ── Prozesse: die Überprüfung aus der Konzernfachregelung Prozessmanagement ──
   Die Termine stehen an den Kacheln der Landkarten (prozesslandkarte.json).
   Gelesen wird die Datei direkt – die Landkarte selbst wird dafür nicht
   geladen. Gerechnet wird mit js/prozessmodell.js. */

let _faelligPzDaten = null;   // gelesene Landkarten (Cache bis „Aktualisieren")
let _faelligPzModelle = null; // Modelle mit ihren Angaben aus den .bpmn-Dateien (Cache)

/**
 * Die Modelle samt Angaben. Ein Modell ist ein Prozess, auch ohne Kachel –
 * seine Überprüfung steht in der Datei. Gelesen wird direkt (fünf Dateien
 * nebeneinander), die Prozess-Ansicht wird dafür nicht geladen.
 */
async function _faelligPzModelleLesen(daten) {
  if (typeof spListProcesses !== 'function' || typeof spGetProcessXml !== 'function' || typeof pzPmAusText !== 'function') return [];
  const liste = await spListProcesses();
  const karten = (daten && daten.karten) || {};
  const kachelnVon = (itemId) => {
    const out = [];
    Object.keys(karten).forEach(werk => (karten[werk].kacheln || []).forEach(k => {
      if ((Array.isArray(k.prozesse) ? k.prozesse : []).some(v => v && String(v.id) === String(itemId))) out.push({ werk, kachel: k });
    }));
    return out;
  };
  const modelle = [];
  for (let i = 0; i < liste.length; i += 5) {
    await Promise.all(liste.slice(i, i + 5).map(async p => {
      let pm = null;
      try { pm = pzPmAusText(String(await spGetProcessXml(p.itemId)).split('&amp;').join('&')); } catch (e) { /* ohne Angaben */ }
      modelle.push({ itemId: p.itemId, title: p.title, ordner: p.ordner || '', pm, kacheln: kachelnVon(p.itemId) });
    }));
  }
  return modelle;
}

/** Karten, die man sehen darf – dieselbe Trennung wie in der Landkarte. */
function _faelligPzWerke(daten) {
  const alle = Object.keys((daten && daten.karten) || {});
  if (typeof trennungGreift !== 'function' || !trennungGreift() || typeof meineWerke !== 'function') return alle;
  const meine = meineWerke();
  return alle.filter(w => w === 'KONZERN' || meine.includes(w));
}

async function _faelligProzesseZeigen(neu) {
  const host = document.getElementById('fael-prozesse');
  if (!host || typeof pzFaellige !== 'function') return;
  if (!_faelligPzDaten || neu) {
    host.innerHTML = '<div class="doc-loading">Prozess-Überprüfungen werden gelesen …</div>';
    try {
      const g = (typeof spLoadLandkarte === 'function') ? await spLoadLandkarte() : null;
      _faelligPzDaten = (g && g.daten && g.daten.karten) ? g.daten : { karten: {} };
      try { _faelligPzModelle = await _faelligPzModelleLesen(_faelligPzDaten); } catch (e) { _faelligPzModelle = []; }
    } catch (e) {
      host.innerHTML = `<div class="field-hint">Prozesse konnten nicht gelesen werden: ${esc(e.message)}</div>`;
      return;
    }
  }
  const ziel = document.getElementById('fael-prozesse');
  if (!ziel) return;
  ziel.innerHTML = _faelligProzesseHtml(pzFaellige(_faelligPzDaten, _faelligPzWerke(_faelligPzDaten), undefined, _faelligPzModelle || []));
}

function _faelligProzesseHtml(b) {
  const label = (w) => (w === 'KONZERN' ? 'Konzern / Holding' : w);
  const karte = (e, accent) => {
    const p = e.pruefung;
    const wann = p.stufe === 'fehlt' ? 'freigegeben, aber ohne Termin' : `${p.datum.split('-').reverse().join('.')} · ${_faelligDueLabel(p.tage)}`;
    const eigner = e.eigner.upn ? esc(e.eigner.upn) : '<span style="color:#b45309">kein Prozesseigner</span>';
    return `<div class="item-card" style="cursor:default;border-left:4px solid ${accent}">
      <div class="ic-top"><div class="ic-title">${e.art === 'modell' ? '🔀 ' : ''}${esc(e.kachel.name)}${pzNrText(e.kachel) ? ` <span class="field-hint">${esc(pzNrText(e.kachel))}</span>` : ''}</div>
        <div class="ic-topright"><span class="ic-tag">${esc(pzStatusInfo(e.status).label)}</span></div></div>
      <div class="ic-tags">
        <span class="ic-tag cat">${esc(e.werk ? label(e.werk) : 'ohne Ablage')}</span>
        <span class="ic-tag" style="${p.stufe === 'ueberfaellig' || p.stufe === 'fehlt' ? 'background:#fef2f2;color:#b91c1c' : (p.stufe === 'bald' ? 'background:#fffbeb;color:#b45309' : '')}">🔎 ${esc(wann)}</span>
        <span class="ic-tag">👤 ${eigner}</span>
      </div>
      <div style="display:flex;gap:7px;margin-top:10px;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="${e.art === 'modell' ? `faelligModellOeffnen(${jsArg(e.kachel.id)})` : `faelligProzessOeffnen(${jsArg(e.werk)},${jsArg(e.kachel.id)})`}">Prozess öffnen</button>
      </div>
    </div>`;
  };
  const liste = (titel, l, accent) => l.length ? `
    <div style="font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;margin:16px 2px 8px">${esc(titel)} (${l.length})</div>
    ${l.map(e => karte(e, accent)).join('')}` : '';
  const summe = b.ueberfaellig.length + b.bald.length + b.spaeter.length + b.fehlt.length;
  return `
    <h3 style="margin:0 0 6px;font-size:1.05rem">Prozesse</h3>
    <div class="view-desc" style="margin:0 0 10px">
      Überprüfung der Prozesse aus den Landkarten. Freigegebene Prozesse werden spätestens alle
      ${typeof PZ_UEBERPRUEFUNG_MONATE !== 'undefined' ? PZ_UEBERPRUEFUNG_MONATE : 12} Monate durch den Prozesseigner überprüft.
      Der Termin steht am Modell (Prozess-Editor) oder an der Kachel (Landkarte, „Bearbeiten").
      <button class="btn btn-ghost btn-sm" onclick="_faelligProzesseZeigen(true)" title="Landkarten neu lesen">↻ Aktualisieren</button>
    </div>
    ${summe ? '' : '<div class="field-hint">Noch kein Prozess mit Überprüfungstermin. Er entsteht, sobald ein Prozess freigegeben wird.</div>'}
    ${liste('Überfällig', b.ueberfaellig, '#ef4444')}
    ${liste('Freigegeben ohne Termin', b.fehlt, '#ef4444')}
    ${liste(`Fällig in ≤ ${FAELLIG_SOON_DAYS} Tagen`, b.bald, '#f59e0b')}
    ${liste('Später terminiert', b.spaeter, '#22c55e')}`;
}

/** Aus den Fälligkeiten ins Modell. */
async function faelligModellOeffnen(itemId) {
  if (typeof switchView === 'function') await switchView('prozesse');
  if (typeof openProcessAnsicht === 'function') await openProcessAnsicht(itemId);
}

/** Aus den Fälligkeiten in die Landkarte, Kachel geöffnet. */
async function faelligProzessOeffnen(werk, id) {
  if (typeof switchView === 'function') await switchView('prozesse');
  if (typeof lkDeepLink === 'function') await lkDeepLink(werk, id);
}

/** Nächste Überprüfung auf heute + N Monate setzen (N aus dem Karten-Eingabefeld). */
async function faelligSetReviewMonths(id) {
  const inp = document.getElementById('fael-m-' + id);
  const months = Math.max(1, Math.min(120, parseInt(inp?.value, 10) || 12));
  const d = new Date(); d.setMonth(d.getMonth() + months);
  await _faelligApplyReview(id, d.toISOString(), `Nächste Überprüfung: ${fmtDate(d.toISOString())} ✓`);
}

/** Überprüfungstermin entfernen (Feld leeren – dokumentiert bewusst „kein Termin"). */
async function faelligClearReview(id) {
  await _faelligApplyReview(id, '', 'Überprüfungstermin entfernt ✓');
}

/** Termin (ISO oder '') gezielt speichern + Ansichten aktualisieren. */
async function _faelligApplyReview(id, iso, okMsg) {
  if (typeof canWriteTab === 'function' && !canWriteTab('faelligkeit')) {
    if (typeof toast === 'function') toast('Nur Lesezugriff auf „Fälligkeiten".', 'error'); return;
  }
  const src = policyZuId(id);
  if (!src) return;
  try {
    await spSetPolicyReview(id, iso);   // eigener PATCH: kann auch leeren
    if (typeof reloadData === 'function') await reloadData();
    else src.naechsteReview = iso;
    renderFaelligkeit();
    if (typeof renderAdminList === 'function') renderAdminList();
    if (typeof toast === 'function') toast(okMsg, 'success');
  } catch (e) {
    if (typeof toast === 'function') toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

/* Node-Export nur für Tests (im Browser wirkungslos). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _faelligDays, _faelligBuckets, _faelligDueLabel, _faelligProzesseHtml };
}
