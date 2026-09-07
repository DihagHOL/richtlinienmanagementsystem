'use strict';

/**
 * Reiter „Wirksamkeit & Verbesserung" (ISO 27001 9.2, 9.3, 10.2)
 * ==============================================================
 * Drei Kapitel, die das RMS bisher nur **benennen** konnte. `js/normen.js`
 * führt sie im Katalog, und die IMS-Abdeckung ließ eine Richtlinie daran
 * hängen – eine Richtlinie beschreibt aber, wie etwas laufen *soll*. Dass ein
 * Audit stattgefunden hat, dass eine Abweichung behandelt und die Maßnahme
 * anschließend als wirksam bewertet wurde: dafür gab es keinen Ort.
 *
 *   9.2  Internes Audit         findet Abweichungen
 *   10.2 Nichtkonformität und   behandelt sie – Ursache, Maßnahme, und danach
 *        Korrekturmaßnahmen     die Prüfung, ob es geholfen hat
 *   9.3  Managementbewertung    sieht auf beide und entscheidet
 *
 * **Ein Register, drei Satzarten** – nicht drei Register mit derselben
 * Mechanik. Eine Auditfeststellung ist keine Kopie einer Abweichung, sie ist
 * eine; sie trägt nur ein Feld mehr, das sagt, woher sie stammt. Wer den
 * Zusammenhang in drei Listen zerlegt, muss ihn danach von Hand wieder
 * herstellen.
 *
 * Was hier **verweigert** wird, ist der eigentliche Inhalt:
 *
 *   • Eine Abweichung lässt sich nicht abschließen ohne **Ursache**, ohne eine
 *     **erledigte Maßnahme** und ohne **Wirksamkeitsbewertung**. Genau diese
 *     drei Schritte verlangt 10.2, und genau sie werden übersprungen – die
 *     Maßnahme gilt als „gemacht" und niemand sieht nach, ob sie geholfen hat.
 *   • Eine Managementbewertung lässt sich nicht abschließen, solange
 *     Pflichteingaben fehlen. Die Norm zählt sie auf; hier stehen sie als
 *     Haken, und die fehlenden werden beim Namen genannt.
 *
 * Gespeichert in der SharePoint-Liste „Wirksamkeit" auf der ISMS-Site.
 */

const WIRK_ARTEN = {
  abweichung: { label: 'Abweichung / Korrekturmaßnahme', icon: '⚠️', norm: 'ISO 27001 10.2' },
  audit:      { label: 'Internes Audit',                 icon: '🔍', norm: 'ISO 27001 9.2'  },
  bewertung:  { label: 'Managementbewertung',            icon: '⚖️', norm: 'ISO 27001 9.3'  },
};

const WIRK_STATUS = ['offen', 'in Umsetzung', 'abgeschlossen', 'verworfen'];
const WIRK_MSTATUS = ['offen', 'in Umsetzung', 'erledigt'];

/** Woher eine Abweichung kommt. „Wo ist das aufgefallen?" ist die erste Frage im Audit. */
const WIRK_QUELLEN = ['internes Audit', 'externes Audit', 'Sicherheitsvorfall', 'Hinweis',
  'abgelaufene Ausnahme', 'Kennzahl / Messung', 'Beobachtung im Betrieb'];

/**
 * Die Pflichteingaben der Managementbewertung.
 *
 * ISO 27001 9.3.2 zählt sie auf. Sie stehen hier als Haken, weil eine
 * Bewertung ohne sie zwar stattgefunden haben mag, aber nicht nachweisbar ist –
 * und weil die Aufzählung sonst niemand zur Hand hat, wenn sie gebraucht wird.
 */
const WIRK_EINGABEN = [
  { id: 'vorherige',   text: 'Stand der Maßnahmen aus der letzten Bewertung' },
  { id: 'umfeld',      text: 'Änderungen im Umfeld: Anforderungen, Organisation, Technik' },
  { id: 'leistung',    text: 'Leistung der Informationssicherheit: Kennzahlen, Messungen, Ziele' },
  { id: 'abweichungen', text: 'Nichtkonformitäten und Korrekturmaßnahmen' },
  { id: 'audits',      text: 'Ergebnisse der internen Audits' },
  { id: 'rueckmeldungen', text: 'Rückmeldungen interessierter Parteien' },
  { id: 'risiken',     text: 'Ergebnisse der Risikobeurteilung und Stand der Risikobehandlung' },
  { id: 'verbesserung', text: 'Möglichkeiten zur fortlaufenden Verbesserung' },
];

let _wirk = null;
let _wirkLoading = false;
let _wirkEditing = null;
let _wirkFilter = { q: '', art: '', status: '', werk: '' };
let _wirkMembers = null;

/* ── Ableitungen ── */

function wirkHeute() { return new Date().toISOString().slice(0, 10); }

/** Offene Maßnahmen eines Satzes. */
function wirkOffeneMassnahmen(w) {
  return (w && Array.isArray(w.massnahmen) ? w.massnahmen : []).filter(m => m.status !== 'erledigt');
}

/** Überfällige Maßnahmen – Frist vorbei und nicht erledigt. */
function wirkUeberfaellig(w) {
  const heute = wirkHeute();
  return wirkOffeneMassnahmen(w).filter(m => m.frist && String(m.frist).slice(0, 10) < heute);
}

/**
 * Was einem Abschluss im Weg steht.
 *
 * Der Kern des Ganzen. Ein Eintrag darf unvollständig entstehen – ein Audit
 * beginnt mit einem Termin und sonst nichts. Abgeschlossen wird er erst, wenn
 * das da ist, was die Norm für den Nachweis verlangt.
 */
function wirkAbschlussfehler(w) {
  const f = [];
  if (!String(w.titel || '').trim()) f.push('Bezeichnung fehlt.');
  if (!w.datum) f.push('Datum fehlt.');

  if (w.art === 'abweichung') {
    // 10.2 in drei Schritten: Ursache ermitteln, handeln, nachsehen ob es half.
    if (!String(w.ursache || '').trim()) {
      f.push('Ursache ist nicht ermittelt – ohne sie behandelt die Maßnahme nur das Symptom.');
    }
    const m = Array.isArray(w.massnahmen) ? w.massnahmen : [];
    if (!m.length) f.push('Keine Korrekturmaßnahme erfasst.');
    else if (!m.some(x => x.status === 'erledigt')) f.push('Keine der Maßnahmen ist erledigt.');
    if (!String(w.wirksamkeit || '').trim()) {
      f.push('Die Wirksamkeit ist nicht bewertet – „erledigt" heißt nicht „hat geholfen".');
    }
  }

  if (w.art === 'audit') {
    if (!String(w.umfang || '').trim()) f.push('Der Auditumfang fehlt – was wurde geprüft?');
    if (!(w.beteiligte || []).length) f.push('Niemand als Auditor eingetragen.');
    if (!String(w.ergebnis || '').trim()) f.push('Kein Ergebnis festgehalten.');
  }

  if (w.art === 'bewertung') {
    const haben = new Set(Array.isArray(w.eingaben) ? w.eingaben : []);
    const fehlend = WIRK_EINGABEN.filter(e => !haben.has(e.id));
    if (fehlend.length) {
      f.push(`${fehlend.length} Pflichteingabe(n) fehlen: ${fehlend.map(e => e.text).join('; ')}`);
    }
    if (!(w.beteiligte || []).length) f.push('Keine Teilnehmenden eingetragen.');
    if (!String(w.ergebnis || '').trim()) f.push('Keine Entscheidungen festgehalten.');
  }
  return f;
}

/** Ist der Eintrag vollständig genug, um als Nachweis zu taugen? */
function wirkNachweisfaehig(w) { return wirkAbschlussfehler(w).length === 0; }

/* ── Sichtbarkeit ── */

function wirkSichtbare(liste) {
  const alle = Array.isArray(liste) ? liste : (_wirk || []);
  if (typeof geltungSichtbar !== 'function') return alle;
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return alle.filter(w => geltungSichtbar(w.werke, upn));
}

/** Abweichungen, die aus einem bestimmten Eintrag hervorgegangen sind. */
function wirkFolgen(id) {
  const s = String(id || '');
  if (!s) return [];
  return wirkSichtbare().filter(w => w.art === 'abweichung' && String(w.herkunftId) === s);
}

/* ── Laden / Rendern ── */

async function initWirksamkeit() {
  const mount = document.getElementById('wirksamkeit-mount');
  if (!mount) return;
  if (_wirk) { renderWirksamkeit(); return; }
  mount.innerHTML = '<div class="doc-loading">Lade Wirksamkeit &amp; Verbesserung …</div>';
  _wirkLoading = true;
  try {
    _wirk = await spGetWirk();
  } catch (e) {
    _wirk = null;
    _wirkLoading = false;
    const ismsUrl  = (typeof spIsmsSiteUrl === 'function') ? spIsmsSiteUrl() : 'https://dihag.sharepoint.com/sites/ISMS';
    const contents = ismsUrl + '/_layouts/15/viewlsts.aspx';
    const cols = (typeof WIRK_COLUMNS !== 'undefined') ? WIRK_COLUMNS : [];
    mount.innerHTML = `<div class="col-warning" style="display:block">
      <b>Register nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:10px">Die Liste „Wirksamkeit" liegt wie Risiken und Ausnahmen auf der <b>ISMS-Site</b>
        <a href="${esc(ismsUrl)}" target="_blank" rel="noopener">${esc(ismsUrl)}</a>. Die App legt sie beim
        ersten Zugriff automatisch an – dafür braucht Ihr Konto dort das Recht, Listen zu erstellen.</div>
      <div style="margin-top:10px"><b>Manuell anlegen:</b>
        <a href="${esc(contents)}" target="_blank" rel="noopener">Websiteinhalte öffnen ↗</a>
        → „+ Neu" → „Liste" → Name <code>Wirksamkeit</code>, dann diese Spalten:</div>
      <div style="margin-top:8px;line-height:1.9">${cols.map(c =>
        `<code>${esc(c.name)}</code> <span style="color:var(--c-muted)">(${esc(c.typ)})</span>`).join(' · ')}</div>
    </div>`;
    return;
  }
  _wirkLoading = false;
  renderWirksamkeit();
}

async function refreshWirksamkeit() {
  _wirk = null;
  await initWirksamkeit();
  if (typeof toast === 'function') toast('Register aktualisiert', 'success');
}

function _wirkGefiltert() {
  let rows = wirkSichtbare();
  const f = _wirkFilter;
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter(w => (w.titel + ' ' + w.beschreibung + ' ' + w.ursache + ' ' + w.umfang
      + ' ' + w.ergebnis + ' ' + w.verantwortlich).toLowerCase().includes(q));
  }
  if (f.art) rows = rows.filter(w => w.art === f.art);
  if (f.status) rows = rows.filter(w => w.status === f.status);
  if (f.werk) rows = rows.filter(w => (w.werke || []).includes(f.werk));
  // Was drängt, steht oben: überfällige Maßnahmen, dann Offenes, dann nach Datum.
  const rang = (w) => {
    if (wirkUeberfaellig(w).length) return 0;
    if (w.status === 'offen' || w.status === 'in Umsetzung') return 1;
    return 2;
  };
  rows.sort((a, b) => (rang(a) - rang(b)) || String(b.datum).localeCompare(String(a.datum)));
  return rows;
}

function _wirkStatusBadge(w) {
  const ueber = wirkUeberfaellig(w).length;
  const stil = {
    'abgeschlossen': 'background:#dcfce7;color:#166534;border-color:#bbf7d0',
    'in Umsetzung':  'background:#fef9c3;color:#854d0e;border-color:#fde68a',
    'offen':         'background:#fef9c3;color:#854d0e;border-color:#fde68a',
    'verworfen':     'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb',
  }[w.status] || 'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb';
  return `<span style="display:inline-block;border:1px solid;border-radius:6px;padding:1px 7px;font-size:.72rem;font-weight:700;${
    ueber ? 'background:#fee2e2;color:#991b1b;border-color:#fecaca' : stil}">${esc(w.status)}${
    ueber ? ` · ${ueber} überfällig` : ''}</span>`;
}

function renderWirksamkeit() {
  const mount = document.getElementById('wirksamkeit-mount');
  if (!mount) return;
  if (!_wirk) { if (!_wirkLoading) initWirksamkeit(); return; }
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('wirksamkeit');
  const alle = wirkSichtbare();
  const abw = alle.filter(w => w.art === 'abweichung');
  const offen = abw.filter(w => w.status === 'offen' || w.status === 'in Umsetzung').length;
  const ueber = alle.reduce((s, w) => s + wirkUeberfaellig(w).length, 0);
  const audits = alle.filter(w => w.art === 'audit');
  const bewertungen = alle.filter(w => w.art === 'bewertung').sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  const letzteBewertung = bewertungen[0];
  const missing = (typeof spMissingWirkColumns === 'function') ? spMissingWirkColumns() : [];
  const werke = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];

  // Abgeschlossen, aber ohne Wirksamkeitsbewertung: Altbestand oder von Hand in
  // SharePoint gesetzt. Beim Audit ist das die teure Feststellung.
  const ohneNachweis = abw.filter(w => w.status === 'abgeschlossen' && !String(w.wirksamkeit || '').trim()).length;

  const kpi = (n, label, col) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  const rows = _wirkGefiltert();
  const table = rows.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Eintrag</th><th>Art</th><th>Datum</th><th>Verantwortlich</th><th>Geltung</th><th>Maßnahmen</th><th>Status</th><th>Nachweis</th></tr></thead>
    <tbody>${rows.map(w => {
      const a = WIRK_ARTEN[w.art] || {};
      const m = w.massnahmen || [];
      const fertig = m.filter(x => x.status === 'erledigt').length;
      const folgen = w.art !== 'abweichung' ? wirkFolgen(w.id).length : 0;
      const luecken = wirkAbschlussfehler(w).length;
      return `<tr onclick="openWirkEditor('${esc(w.id)}')" style="cursor:pointer${w.status === 'verworfen' ? ';opacity:.55' : ''}">
        <td><b>${esc(w.titel)}</b>
          ${w.quelle ? `<div style="font-size:.68rem;color:var(--c-faint)">Quelle: ${esc(w.quelle)}</div>` : ''}
          ${folgen ? `<div style="font-size:.68rem;color:var(--c-faint)">↳ ${folgen} Abweichung(en) daraus</div>` : ''}</td>
        <td style="white-space:nowrap">${a.icon || ''} ${esc((a.label || w.art).split(' /')[0])}</td>
        <td style="white-space:nowrap">${w.datum ? fmtDate(w.datum) : '–'}</td>
        <td style="color:var(--c-muted)">${esc(w.verantwortlich || '–')}</td>
        <td style="color:var(--c-muted)">${(w.werke || []).length ? esc(w.werke.join(', ')) : 'konzernweit'}</td>
        <td>${m.length ? `${fertig}/${m.length}` : '–'}</td>
        <td>${_wirkStatusBadge(w)}</td>
        <td>${luecken
          ? `<span title="${esc(wirkAbschlussfehler(w).join(' · '))}" style="color:#b45309;font-weight:600">${luecken} offen</span>`
          : '<span style="color:#15803d;font-weight:600">✓</span>'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`
    : emptyState(alle.length ? 'Keine Treffer für die aktuelle Filterung.' : 'Noch nichts erfasst – oben einen Eintrag anlegen.', alle.length ? '🔍' : '📈');

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Nachweise zu <b>ISO 27001 9.2</b> (internes Audit), <b>9.3</b> (Managementbewertung) und
      <b>10.2</b> (Nichtkonformität und Korrekturmaßnahmen) – in einem Register, weil die drei
      zusammenhängen: Ein Audit findet Abweichungen, die Bewertung sieht auf beide.
      <b>Abgeschlossen</b> wird ein Eintrag erst, wenn das da ist, was die Norm zum Nachweis verlangt.
    </div>
    ${missing.length ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ In der Liste „Wirksamkeit" fehlen ${missing.length} Spalte(n):</b> ${missing.map(esc).join(' · ')}</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kpi(offen, 'Abweichungen offen', offen ? '#b45309' : '#15803d')}
      ${kpi(ueber, 'Maßnahmen überfällig', ueber ? '#b91c1c' : '#15803d')}
      ${kpi(audits.length, 'interne Audits', audits.length ? '#17509e' : '#b45309')}
      ${kpi(letzteBewertung ? fmtDate(letzteBewertung.datum) : '–', 'letzte Managementbewertung',
        letzteBewertung ? '#17509e' : '#b91c1c')}
      ${kpi(ohneNachweis, 'ohne Wirksamkeitsbeleg', ohneNachweis ? '#b91c1c' : '#15803d')}
    </div>
    ${!letzteBewertung ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>Keine Managementbewertung erfasst.</b> ISO 27001 9.3 verlangt sie in geplanten Abständen –
      ohne Aufzeichnung ist sie im Audit nicht vorhanden.</div>` : ''}
    ${ohneNachweis ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ ${ohneNachweis} abgeschlossene Abweichung(en) ohne Wirksamkeitsbewertung.</b>
      „Maßnahme erledigt" heißt nicht „Problem behoben" – 10.2 verlangt beides getrennt.</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen …" value="${esc(_wirkFilter.q)}"
        oninput="_wirkFilter.q=this.value;renderWirksamkeit()" style="width:220px">
      <select class="sort-select" onchange="_wirkFilter.art=this.value;renderWirksamkeit()">
        <option value=""${!_wirkFilter.art ? ' selected' : ''}>alle Arten</option>
        ${Object.entries(WIRK_ARTEN).map(([k, a]) => `<option value="${k}"${_wirkFilter.art === k ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}
      </select>
      <select class="sort-select" onchange="_wirkFilter.status=this.value;renderWirksamkeit()">
        <option value=""${!_wirkFilter.status ? ' selected' : ''}>alle Status</option>
        ${WIRK_STATUS.map(s => `<option value="${esc(s)}"${_wirkFilter.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <select class="sort-select" onchange="_wirkFilter.werk=this.value;renderWirksamkeit()">
        <option value=""${!_wirkFilter.werk ? ' selected' : ''}>alle Werke</option>
        ${werke.map(w => `<option value="${esc(w)}"${_wirkFilter.werk === w ? ' selected' : ''}>${esc(w)}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      <button class="btn btn-outline btn-sm" onclick="wirkExportCsv()">⬇ CSV</button>
      ${canWrite ? `<button class="btn btn-outline btn-sm" onclick="openWirkEditor(null,'audit')">+ Audit</button>
        <button class="btn btn-outline btn-sm" onclick="openWirkEditor(null,'bewertung')">+ Bewertung</button>
        <button class="btn btn-primary btn-sm" onclick="openWirkEditor(null,'abweichung')">+ Abweichung</button>` : ''}
    </div>
    ${canWrite ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf dieses Register.</div>'}
    ${table}`;
}

/* ── Editor ── */

function _wirkNeu(art) {
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return {
    id: null, titel: '', art: art || 'abweichung', beschreibung: '',
    datum: new Date().toISOString(), verantwortlich: upn, beteiligte: [], werke: [],
    status: 'offen', quelle: '', herkunftId: '', ursache: '', massnahmen: [],
    wirksamkeit: '', wirksamAm: '', umfang: '', eingaben: [], ergebnis: '',
    normbezug: (WIRK_ARTEN[art || 'abweichung'] || {}).norm || '', historie: [],
  };
}

async function openWirkEditor(id, art) {
  const src = id ? (_wirk || []).find(w => String(w.id) === String(id)) : null;
  _wirkEditing = src ? JSON.parse(JSON.stringify(src)) : _wirkNeu(art);
  if (!_wirkMembers && typeof spGetMembers === 'function') {
    spGetMembers().then(m => {
      _wirkMembers = m;
      const dl = document.getElementById('wirk-people');
      if (dl) dl.innerHTML = m.map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('');
    }).catch(() => { _wirkMembers = []; });
  }
  renderWirkEditor();
}

function wirkToggleWerk(code, an) {
  const w = _wirkEditing.werke || (_wirkEditing.werke = []);
  const i = w.indexOf(code);
  if (an && i < 0) w.push(code);
  if (!an && i >= 0) w.splice(i, 1);
}

function wirkToggleEingabe(id, an) {
  const e = _wirkEditing.eingaben || (_wirkEditing.eingaben = []);
  const i = e.indexOf(id);
  if (an && i < 0) e.push(id);
  if (!an && i >= 0) e.splice(i, 1);
}

function wirkBeteiligteSetzen(text) {
  _wirkEditing.beteiligte = String(text || '').split(',').map(s => s.trim()).filter(Boolean);
}

function wirkMassnahmeHinzu() {
  (_wirkEditing.massnahmen = _wirkEditing.massnahmen || []).push({ titel: '', verantwortlich: '', frist: '', status: 'offen' });
  renderWirkEditor();
}
function wirkMassnahmeWeg(i) {
  (_wirkEditing.massnahmen || []).splice(i, 1);
  renderWirkEditor();
}
function wirkMassnahmeSetzen(i, feld, wert) {
  const m = (_wirkEditing.massnahmen || [])[i];
  if (m) m[feld] = wert;
}

function _wirkMassnahmenHtml() {
  const m = _wirkEditing.massnahmen || [];
  const zeilen = m.map((x, i) => `<tr>
    <td><input type="text" value="${esc(x.titel)}" oninput="wirkMassnahmeSetzen(${i},'titel',this.value)" placeholder="Was wird getan?" style="width:100%"></td>
    <td><input type="text" list="wirk-people" value="${esc(x.verantwortlich)}" oninput="wirkMassnahmeSetzen(${i},'verantwortlich',this.value)" placeholder="wer" style="width:150px"></td>
    <td><input type="date" value="${esc(String(x.frist || '').slice(0, 10))}" onchange="wirkMassnahmeSetzen(${i},'frist',this.value)"></td>
    <td><select onchange="wirkMassnahmeSetzen(${i},'status',this.value)">
      ${WIRK_MSTATUS.map(s => `<option value="${esc(s)}"${x.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
    </select></td>
    <td><button class="btn btn-ghost btn-sm" onclick="wirkMassnahmeWeg(${i})" title="Entfernen">✕</button></td>
  </tr>`).join('');
  return `<table class="tbl" style="font-size:.8rem;width:100%">
      <thead><tr><th>Maßnahme</th><th>Verantwortlich</th><th>Frist</th><th>Status</th><th></th></tr></thead>
      <tbody>${zeilen || '<tr><td colspan="5" style="color:var(--c-muted)">Noch keine Maßnahme.</td></tr>'}</tbody>
    </table>
    <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="wirkMassnahmeHinzu()">+ Maßnahme</button>`;
}

function renderWirkEditor() {
  const w = _wirkEditing;
  const a = WIRK_ARTEN[w.art] || WIRK_ARTEN.abweichung;
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('wirksamkeit');
  const werke = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];
  const luecken = wirkAbschlussfehler(w);
  const quellen = (_wirk || []).filter(x => x.art === 'audit' || x.art === 'bewertung');
  const histRows = (w.historie || []).slice().reverse().slice(0, 20).map(h =>
    `<div style="font-size:.75rem;color:var(--c-muted);padding:2px 0">${fmtDateTime(h.datum)} · <b>${esc(h.wer || '')}</b> · ${esc(h.aktion || '')}</div>`).join('');

  const body = `
    <div class="modal-header">
      <h3>${a.icon} ${w.id ? esc(a.label) + ' bearbeiten' : 'Neu: ' + esc(a.label)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">${esc(a.norm)}</div>
      ${luecken.length ? `<div class="col-warning" style="display:block;margin-bottom:12px">
        <b>Zum Abschließen fehlt noch:</b><ul style="margin:6px 0 0 18px;padding:0">${
          luecken.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="form-grid">
        <div class="form-group full"><label>Bezeichnung <span class="req">*</span></label>
          <input type="text" value="${esc(w.titel)}" oninput="_wirkEditing.titel=this.value"
            placeholder="${w.art === 'audit' ? 'z. B. Internes Audit Zutrittskontrolle WGC'
              : w.art === 'bewertung' ? 'z. B. Managementbewertung 1. Halbjahr'
              : 'z. B. Zugriffsrechte nach Austritt nicht entzogen'}"></div>
        <div class="form-group"><label>Datum <span class="req">*</span></label>
          <input type="date" value="${esc((w.datum || '').slice(0, 10))}"
            onchange="_wirkEditing.datum=this.value?new Date(this.value+'T00:00:00Z').toISOString():''"></div>
        <div class="form-group"><label>Verantwortlich</label>
          <input type="text" list="wirk-people" value="${esc(w.verantwortlich)}" oninput="_wirkEditing.verantwortlich=this.value">
          <datalist id="wirk-people">${(_wirkMembers || []).map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('')}</datalist></div>
        <div class="form-group full"><label>${w.art === 'bewertung' ? 'Teilnehmende' : w.art === 'audit' ? 'Auditoren' : 'Beteiligte'}${
          w.art !== 'abweichung' ? ' <span class="req">*</span>' : ''}</label>
          <input type="text" value="${esc((w.beteiligte || []).join(', '))}" oninput="wirkBeteiligteSetzen(this.value)"
            placeholder="E-Mail-Adressen, durch Komma getrennt"></div>
        <div class="form-group full"><label>Beschreibung</label>
          <textarea oninput="_wirkEditing.beschreibung=this.value">${esc(w.beschreibung)}</textarea></div>
        <div class="form-group"><label>Status</label>
          <select onchange="_wirkEditing.status=this.value">
            ${WIRK_STATUS.map(s => `<option value="${esc(s)}"${w.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
          </select></div>
        <div class="form-group full"><label>Geltung (Werke)</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:6px">
            ${werke.map(x => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${(w.werke || []).includes(x) ? 'checked' : ''}
              onchange="wirkToggleWerk('${esc(x)}',this.checked)"> ${esc(x)}</label>`).join('')}
          </div><div class="field-hint">Kein Haken = konzernweit.</div></div>
      </div>

      ${w.art === 'abweichung' ? `
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:8px">Behandlung (ISO 10.2)</div>
        <div class="form-grid">
          <div class="form-group"><label>Wo ist es aufgefallen?</label>
            <input type="text" list="wirk-quellen" value="${esc(w.quelle)}" oninput="_wirkEditing.quelle=this.value">
            <datalist id="wirk-quellen">${WIRK_QUELLEN.map(q => `<option value="${esc(q)}">`).join('')}</datalist></div>
          <div class="form-group"><label>Aus welchem Audit / welcher Bewertung?</label>
            <select onchange="_wirkEditing.herkunftId=this.value">
              <option value="">– keins –</option>
              ${quellen.map(q => `<option value="${esc(q.id)}"${String(w.herkunftId) === String(q.id) ? ' selected' : ''}>${esc(q.titel)}</option>`).join('')}
            </select></div>
          <div class="form-group full"><label>Ursache <span class="req">*</span></label>
            <textarea oninput="_wirkEditing.ursache=this.value" placeholder="Warum konnte das passieren? Nicht das Symptom, sondern der Grund.">${esc(w.ursache)}</textarea>
            <div class="field-hint">Ohne Ursache behandelt die Maßnahme nur das Symptom – 10.2 verlangt sie ausdrücklich.</div></div>
        </div>
        <div style="font-weight:700;font-size:.85rem;margin:12px 0 6px">Korrekturmaßnahmen</div>
        ${_wirkMassnahmenHtml()}
        <div class="form-group full" style="margin-top:12px"><label>Wirksamkeit <span class="req">*</span></label>
          <textarea oninput="_wirkEditing.wirksamkeit=this.value" placeholder="Woran ist zu erkennen, dass es geholfen hat?">${esc(w.wirksamkeit)}</textarea>
          <div class="field-hint">„Erledigt" heißt nicht „hat geholfen". Das ist der Schritt, den 10.2 zusätzlich verlangt.</div></div>
        <div class="form-group"><label>Wirksamkeit bewertet am</label>
          <input type="date" value="${esc((w.wirksamAm || '').slice(0, 10))}"
            onchange="_wirkEditing.wirksamAm=this.value?new Date(this.value+'T00:00:00Z').toISOString():''"></div>
      </div>` : ''}

      ${w.art === 'audit' ? `
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:8px">Audit (ISO 9.2)</div>
        <div class="form-group full"><label>Umfang und Kriterien <span class="req">*</span></label>
          <textarea oninput="_wirkEditing.umfang=this.value" placeholder="Was wurde geprüft, gegen welche Anforderungen, in welchem Bereich?">${esc(w.umfang)}</textarea></div>
        <div class="form-group full"><label>Ergebnis <span class="req">*</span></label>
          <textarea oninput="_wirkEditing.ergebnis=this.value" placeholder="Feststellungen, Bewertung, Empfehlungen.">${esc(w.ergebnis)}</textarea></div>
        ${w.id ? `<div class="field-hint">Gefundene Abweichungen als eigene Einträge anlegen und hier als Herkunft wählen –
          dann hängen sie sichtbar zusammen. ${wirkFolgen(w.id).length ? `Bisher: <b>${wirkFolgen(w.id).length}</b>.` : ''}
          <button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="wirkAbweichungAus('${esc(w.id)}')">+ Abweichung daraus</button></div>` : ''}
      </div>` : ''}

      ${w.art === 'bewertung' ? `
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:4px">Pflichteingaben (ISO 9.3.2)</div>
        <div class="field-hint" style="margin-bottom:8px">Alle acht sind nachzuweisen. Was hier fehlt, fehlt auch im Audit.</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${WIRK_EINGABEN.map(e => `<label class="ack-check" style="font-weight:500">
            <input type="checkbox" ${(w.eingaben || []).includes(e.id) ? 'checked' : ''}
              onchange="wirkToggleEingabe('${e.id}',this.checked)"> ${esc(e.text)}</label>`).join('')}
        </div>
        <div class="form-group full" style="margin-top:12px"><label>Entscheidungen und Ergebnisse <span class="req">*</span></label>
          <textarea oninput="_wirkEditing.ergebnis=this.value" placeholder="Beschlüsse, Ressourcen, Änderungsbedarf am ISMS.">${esc(w.ergebnis)}</textarea></div>
        <div style="font-weight:700;font-size:.85rem;margin:12px 0 6px">Beschlossene Maßnahmen</div>
        ${_wirkMassnahmenHtml()}
      </div>` : ''}

      ${histRows ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Verlauf</div>${histRows}</div>` : ''}
    </div>
    <div class="modal-footer">
      ${w.id && canWrite ? `<button class="btn btn-ghost btn-sm" onclick="deleteWirk('${esc(w.id)}')" style="color:#b91c1c">Löschen</button>` : ''}
      <div style="flex:1"></div>
      ${canWrite && w.status !== 'abgeschlossen'
        ? `<button class="btn btn-outline" onclick="wirkAbschliessen()" ${luecken.length ? 'title="Es fehlt noch etwas – siehe oben"' : ''}>Abschließen</button>` : ''}
      ${canWrite ? `<button class="btn btn-primary" id="wirk-save-btn" onclick="saveWirk()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`;
  openModal(body);
}

/** Aus einem Audit heraus eine Abweichung anlegen – mit Herkunft. */
function wirkAbweichungAus(auditId) {
  const q = (_wirk || []).find(w => String(w.id) === String(auditId));
  _wirkEditing = _wirkNeu('abweichung');
  _wirkEditing.herkunftId = String(auditId || '');
  _wirkEditing.quelle = 'internes Audit';
  if (q) _wirkEditing.werke = (q.werke || []).slice();
  renderWirkEditor();
}

/* ── Speichern ── */

function _wirkVermerk(w, aktion) {
  const wer = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '';
  (w.historie = w.historie || []).push({ datum: new Date().toISOString(), wer, aktion });
}

async function saveWirk() {
  if (typeof canWriteTab === 'function' && !canWriteTab('wirksamkeit')) {
    if (typeof toast === 'function') toast('Nur Lesezugriff auf dieses Register.', 'error'); return;
  }
  const w = _wirkEditing;
  if (!String(w.titel || '').trim()) { if (typeof toast === 'function') toast('Bitte eine Bezeichnung angeben.', 'error'); return; }
  if (!w.datum) { if (typeof toast === 'function') toast('Bitte ein Datum angeben.', 'error'); return; }
  // Abgeschlossen darf nur bleiben, was auch abschließbar ist – sonst wäre die
  // Bedingung ein Vorschlag und kein Nachweis.
  if (w.status === 'abgeschlossen') {
    const f = wirkAbschlussfehler(w);
    if (f.length) { if (typeof toast === 'function') toast('Noch nicht abschließbar: ' + f[0], 'error'); return; }
  }
  _wirkVermerk(w, w.id ? `geändert (Status ${w.status})` : `angelegt (${w.art})`);
  await _wirkSchreiben(w, 'Gespeichert ✓');
}

async function wirkAbschliessen() {
  if (typeof canWriteTab === 'function' && !canWriteTab('wirksamkeit')) return;
  const w = _wirkEditing;
  const f = wirkAbschlussfehler(w);
  if (f.length) {
    if (typeof toast === 'function') toast('Noch nicht abschließbar: ' + f[0], 'error', 6000);
    return;
  }
  if (typeof uiConfirm === 'function' && !await uiConfirm(
      `„${w.titel}" abschließen? Damit gilt der Nachweis als vollständig.`,
      { title: 'Abschließen', okLabel: 'Ja, abschließen' })) return;
  w.status = 'abgeschlossen';
  if (w.art === 'abweichung' && !w.wirksamAm) w.wirksamAm = new Date().toISOString();
  _wirkVermerk(w, 'abgeschlossen');
  await _wirkSchreiben(w, 'Abgeschlossen ✓');
}

async function _wirkSchreiben(w, meldung) {
  const btn = document.getElementById('wirk-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    if (w.id) await spUpdateWirk(w.id, w);
    else await spAddWirk(w);
    if (typeof closeModal === 'function') closeModal();
    await refreshWirksamkeit();
    if (typeof toast === 'function') toast(meldung, 'success');
  } catch (e) {
    w.historie.pop();
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    if (typeof toast === 'function') toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

async function deleteWirk(id) {
  if (typeof canWriteTab === 'function' && !canWriteTab('wirksamkeit')) return;
  const w = (_wirk || []).find(x => String(x.id) === String(id));
  if (!w) return;
  const folgen = wirkFolgen(id).length;
  if (typeof uiConfirm === 'function' && !await uiConfirm(
      `„${w.titel}" endgültig löschen?${folgen ? ` ${folgen} Abweichung(en) verweisen darauf und verlieren ihre Herkunft.` : ''} Für den Nachweis ist „verworfen" meist die bessere Wahl.`,
      { title: 'Eintrag löschen', okLabel: 'Endgültig löschen', danger: true })) return;
  try {
    await spDeleteWirk(id);
    if (typeof closeModal === 'function') closeModal();
    await refreshWirksamkeit();
  } catch (e) {
    if (typeof toast === 'function') toast('Löschen fehlgeschlagen: ' + e.message, 'error');
  }
}

/* ── Export ── */

function wirkExportCsv() {
  const rows = _wirkGefiltert();
  const kopf = ['Art', 'Bezeichnung', 'Datum', 'Verantwortlich', 'Beteiligte', 'Werke', 'Status',
    'Quelle', 'Ursache', 'Maßnahmen', 'Wirksamkeit', 'Wirksam am', 'Umfang', 'Pflichteingaben', 'Ergebnis', 'Nachweis vollständig'];
  const zelle = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const zeilen = rows.map(w => [
    (WIRK_ARTEN[w.art] || {}).label || w.art, w.titel, (w.datum || '').slice(0, 10), w.verantwortlich,
    (w.beteiligte || []).join(' '), (w.werke || []).join(' '), w.status, w.quelle, w.ursache,
    (w.massnahmen || []).map(m => `${m.titel} (${m.status}${m.frist ? ', bis ' + String(m.frist).slice(0, 10) : ''})`).join(' | '),
    w.wirksamkeit, (w.wirksamAm || '').slice(0, 10), w.umfang,
    `${(w.eingaben || []).length}/${WIRK_EINGABEN.length}`, w.ergebnis,
    wirkNachweisfaehig(w) ? 'ja' : 'nein',
  ].map(zelle).join(';'));
  const csv = '﻿' + [kopf.map(zelle).join(';')].concat(zeilen).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Wirksamkeit_${wirkHeute()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WIRK_ARTEN, WIRK_STATUS, WIRK_EINGABEN, WIRK_QUELLEN };
}
