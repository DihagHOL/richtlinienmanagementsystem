'use strict';

/**
 * Reiter „Ziele" (ISO 27001 6.2 · Konzernrichtlinie Zieleplanung)
 * ===============================================================
 * Die Ziele der Managementsysteme mit allem, was die Richtlinie dazu verlangt:
 * Verantwortung, Termin, Messung, Ressourcen, Maßnahmen und die Bewertung im
 * Management Review. Gespeichert in der Liste „Ziele" auf der ISMS-Site; die
 * Maßnahmen stehen in der Maßnahmenliste (Feld „Zum Ziel"), die Kennzahlen im
 * Kennzahlen-Register. Gerechnet wird in js/zielmodell.js.
 */

let _zl = null;            // Ziele
let _zlMass = null;        // eigene Maßnahmen (für Fortschritt und Liste am Ziel)
let _zlKpi = null;         // Kennzahlen (Auswahl und Stand)
let _zlWirk = null;        // Managementbewertungen (Bezug der Bewertung)
let _zlLaedt = false;
let _zlFilter = { q: '', bereich: '', status: '', jahr: '', werk: '' };
let _zlEdit = null;
let _zlMembers = null;

function _zlDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('ziele'); }
function _zlWerke() { return (typeof STANDORTE !== 'undefined') ? STANDORTE : []; }
function _zlBereiche() { return (typeof MN_BEREICHE !== 'undefined') ? MN_BEREICHE : [{ key: 'isms', label: 'Informationssicherheit' }]; }
function _zlBereichLabel(k) { return (_zlBereiche().find(b => b.key === k) || {}).label || k || ''; }

function _zlSichtbar(liste) {
  if (typeof geltungSichtbar !== 'function') return liste;
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return liste.filter(z => geltungSichtbar(z.werke, upn));
}

/* ── Laden ── */

async function initZiele() {
  const mount = document.getElementById('ziele-mount');
  if (!mount) return;
  if (_zl) { renderZiele(); return; }
  if (_zlLaedt) return;
  _zlLaedt = true;
  mount.innerHTML = '<div class="doc-loading">Lade Ziele …</div>';
  try {
    const [ziele, mass, kpi, wirk] = await Promise.all([
      spGetZiele(),
      (typeof spGetMassnahmenLeise === 'function') ? spGetMassnahmenLeise().catch(() => []) : [],
      (typeof spGetKennzahlenLeise === 'function') ? spGetKennzahlenLeise().catch(() => []) : [],
      (typeof spGetWirkLeise === 'function') ? spGetWirkLeise().catch(() => []) : [],
    ]);
    _zl = (ziele || []).map(zlNormal); _zlMass = mass || []; _zlKpi = kpi || []; _zlWirk = wirk || [];
  } catch (e) {
    _zlLaedt = false;
    const isms = (typeof spIsmsSiteUrl === 'function') ? spIsmsSiteUrl() : 'https://dihag.sharepoint.com/sites/ISMS';
    mount.innerHTML = `<div class="col-warning" style="display:block"><b>Ziele nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:10px">Die Liste „Ziele" liegt auf der <b>ISMS-Site</b>
      <a href="${esc(sichereUrl(isms))}" target="_blank" rel="noopener">${esc(isms)}</a> und wird beim ersten Zugriff angelegt;
      dafür braucht Ihr Konto dort das Recht, Listen zu erstellen.</div></div>`;
    return;
  }
  _zlLaedt = false;
  renderZiele();
}

async function refreshZiele() {
  _zl = null; _zlMass = null; _zlKpi = null; _zlWirk = null;
  await initZiele();
  toast('Ziele aktualisiert', 'success');
}

/** Nur die Maßnahmen und Kennzahlen neu lesen (nach dem Speichern dort). */
async function _zlNebenlistenNeu() {
  try { _zlMass = (await spGetMassnahmenLeise()) || []; } catch (e) { /* bleibt */ }
  try { _zlKpi = (await spGetKennzahlenLeise()) || []; } catch (e) { /* bleibt */ }
}

/* ── Darstellung ── */

function _zlJahrVon(z) { return z.jahr || (z.termin ? z.termin.slice(0, 4) : ''); }

function _zlGefiltert() {
  const f = _zlFilter;
  const q = f.q.toLowerCase();
  return _zlSichtbar(_zl || []).filter(z => {
    if (q && !(`${z.nr} ${z.titel} ${z.beschreibung} ${z.verantwortlich} ${z.unternehmensziel}`).toLowerCase().includes(q)) return false;
    if (f.bereich && z.bereich !== f.bereich) return false;
    if (f.status && z.status !== f.status) return false;
    if (f.jahr && _zlJahrVon(z) !== f.jahr) return false;
    if (f.werk && (z.werke || []).length && !z.werke.includes(f.werk)) return false;
    return true;
  }).sort((a, b) => (Number(zlStatusInfo(b.status).offen) - Number(zlStatusInfo(a.status).offen))
    || String(a.termin || '9999').localeCompare(String(b.termin || '9999')) || a.nr.localeCompare(b.nr, 'de', { numeric: true }));
}

function _zlStatusBadge(z) {
  const ueber = zlTerminUeberschritten(z);
  const stil = ueber ? 'background:#fee2e2;color:#991b1b;border-color:#fecaca'
    : { erreicht: 'background:#dcfce7;color:#166534;border-color:#bbf7d0', teilweise: 'background:#fef9c3;color:#854d0e;border-color:#fde68a',
        verfehlt: 'background:#fee2e2;color:#991b1b;border-color:#fecaca', umsetzung: 'background:#e0ecff;color:#17509e;border-color:#bfd4f6',
        verabschiedet: 'background:#e0ecff;color:#17509e;border-color:#bfd4f6', verworfen: 'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb' }[z.status]
      || 'background:#f3f4f6;color:#374151;border-color:#e5e7eb';
  return `<span style="display:inline-block;border:1px solid;border-radius:6px;padding:1px 7px;font-size:.72rem;font-weight:700;white-space:nowrap;${stil}">${esc(zlStatusInfo(z.status).label)}${ueber ? ' · Termin überschritten' : ''}</span>`;
}

/** Eine Kennzahl am Ziel: Name, letzter Wert, Ampel. */
function _zlKpiChip(id) {
  const k = (_zlKpi || []).find(x => String(x.id) === String(id));
  if (!k || typeof kzBewertung !== 'function') return k ? `<span class="ic-tag">📊 ${esc(k.name)}</span>` : '';
  const b = kzBewertung(k);
  const l = kzLetzter(k);
  const farbe = { erfuellt: '#15803d', verfehlt: '#b91c1c', offen: '#6b7280' }[b];
  return `<span class="ic-tag" title="${esc(kzSollText(k))}">📊 ${esc(k.name)}: <b style="color:${farbe}">${l ? esc(kzZahlText(l.wert)) + (k.einheit ? ' ' + esc(k.einheit) : '') : 'kein Wert'}</b></span>`;
}

function _zlKarte(z) {
  const fort = zlFortschritt(z, _zlMass);
  const luecken = zlLuecken(z, _zlMass);
  const balken = fort.pct === null ? '' : `<div style="display:flex;align-items:center;gap:8px;margin-top:8px">
      <div style="flex:1;height:7px;background:var(--c-border-2,#eef2f7);border-radius:4px;overflow:hidden">
        <div style="width:${fort.pct}%;height:100%;background:${fort.pct === 100 ? '#16a34a' : '#17509e'}"></div></div>
      <span style="font-size:.75rem;color:var(--c-muted);white-space:nowrap">${fort.erledigt} von ${fort.gesamt} Maßnahmen erledigt</span></div>`;
  return `<div class="item-card" onclick="openZiel(${jsArg(z.id)})" style="cursor:pointer;border-left:4px solid ${zlTerminUeberschritten(z) || z.status === 'verfehlt' ? '#ef4444' : zlStatusInfo(z.status).ende ? '#22c55e' : '#17509e'}">
    <div class="ic-top"><div class="ic-title">${z.nr ? `<span style="color:var(--c-muted)">${esc(z.nr)}</span> ` : ''}${esc(z.titel)}</div>
      <div class="ic-topright">${_zlStatusBadge(z)}</div></div>
    <div class="ic-tags">
      <span class="ic-tag cat">${esc(_zlBereichLabel(z.bereich))}</span>
      ${z.termin ? `<span class="ic-tag">🗓 bis ${esc(fmtDate(z.termin))}</span>` : ''}
      ${z.verantwortlich ? `<span class="ic-tag">👤 ${esc(z.verantwortlich)}</span>` : ''}
      ${(z.werke || []).length ? `<span class="ic-tag">${esc(z.werke.join(', '))}</span>` : ''}
      ${z.kennzahlIds.map(_zlKpiChip).join('')}
    </div>
    ${balken}
    ${luecken.length ? `<div style="margin-top:8px;font-size:.78rem;color:#b45309" title="${esc(luecken.join(' · '))}">⚠ ${esc(luecken[0])}${luecken.length > 1 ? ` (und ${luecken.length - 1} weitere)` : ''}</div>` : ''}
  </div>`;
}

function renderZiele() {
  const mount = document.getElementById('ziele-mount');
  if (!mount) return;
  if (!_zl) { if (!_zlLaedt) initZiele(); return; }
  const schreiben = _zlDarfSchreiben();
  const alle = _zlSichtbar(_zl);
  const k = zlKennzahlen(alle, _zlMass);
  const liste = _zlGefiltert();
  const jahre = [...new Set(alle.map(_zlJahrVon).filter(Boolean))].sort().reverse();
  const fehlend = (typeof spMissingZieleColumns === 'function') ? spMissingZieleColumns() : [];
  const f = _zlFilter;
  const kachel = (n, label, farbe) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${farbe}">${n}</div><div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  const nachJahr = new Map();
  liste.forEach(z => { const j = _zlJahrVon(z) || 'ohne Jahr'; if (!nachJahr.has(j)) nachJahr.set(j, []); nachJahr.get(j).push(z); });
  const gruppen = [...nachJahr.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Die Ziele der Managementsysteme nach <b>ISO 27001 6.2</b> und der Konzernrichtlinie <b>Zieleplanung und -erreichung</b>:
      festgelegt im Management Review, mit Verantwortung, Termin, Messung und Ressourcen. Die Maßnahmen kommen aus der
      Maßnahmenliste, die Messwerte aus dem Kennzahlen-Register. Ein verfehltes Ziel wird ebenso bewertet wie ein erreichtes.
    </div>
    ${fehlend.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>⚠ In der Liste „Ziele" fehlen ${fehlend.length} Spalte(n):</b> ${fehlend.map(esc).join(' · ')}</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kachel(k.laufend, 'laufende Ziele', '#17509e')}
      ${kachel(k.erreicht, 'erreicht', '#15803d')}
      ${kachel(k.teilweise + k.verfehlt, 'teilweise oder nicht erreicht', (k.teilweise + k.verfehlt) ? '#b45309' : '#15803d')}
      ${kachel(k.ueberschritten, 'Termin überschritten', k.ueberschritten ? '#b91c1c' : '#15803d')}
      ${kachel(k.ohneKennzahl, 'laufend ohne Kennzahl', k.ohneKennzahl ? '#b45309' : '#15803d')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen …" value="${esc(f.q)}" oninput="_zlFilter.q=this.value;renderZiele()" style="width:200px">
      <select class="sort-select" onchange="_zlFilter.bereich=this.value;renderZiele()">
        <option value="">alle Bereiche</option>
        ${_zlBereiche().map(b => `<option value="${esc(b.key)}"${f.bereich === b.key ? ' selected' : ''}>${esc(b.label)}</option>`).join('')}</select>
      <select class="sort-select" onchange="_zlFilter.status=this.value;renderZiele()">
        <option value="">alle Status</option>
        ${ZL_STATUS.map(s => `<option value="${s.key}"${f.status === s.key ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
      ${jahre.length ? `<select class="sort-select" onchange="_zlFilter.jahr=this.value;renderZiele()">
        <option value="">alle Jahre</option>
        ${jahre.map(j => `<option value="${esc(j)}"${f.jahr === j ? ' selected' : ''}>${esc(j)}</option>`).join('')}</select>` : ''}
      <select class="sort-select" onchange="_zlFilter.werk=this.value;renderZiele()">
        <option value="">alle Werke</option>
        ${_zlWerke().map(w => `<option value="${esc(w)}"${f.werk === w ? ' selected' : ''}>${esc(w)}</option>`).join('')}</select>
      <div style="flex:1"></div>
      ${schreiben ? `<button class="btn btn-outline btn-sm" onclick="zlVorlageUebernehmen()" title="Ziele aus „ISMS_Vorlage_Zieleplanung.docx" in der ISMS-Bibliothek übernehmen">📄 Aus der Vorlage übernehmen</button>
        <button class="btn btn-primary btn-sm" onclick="openZiel(null)">+ Ziel</button>` : ''}
    </div>
    ${schreiben ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf die Ziele.</div>'}
    ${gruppen.length ? gruppen.map(([jahr, l]) => `
      <div style="font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;margin:18px 2px 8px">${esc(jahr)} (${l.length})</div>
      ${l.map(_zlKarte).join('')}`).join('')
      : emptyState(alle.length ? 'Keine Treffer für die aktuelle Filterung.'
        : 'Noch kein Ziel erfasst. Stehen die Ziele schon in der Vorlage zur Zieleplanung, lassen sie sich oben übernehmen.', alle.length ? '🔍' : '🎯')}`;
}

/* ── Editor ── */

function _zlNeu() {
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return zlNormal({ nr: zlNaechsteNr(_zl || [], 'S'), jahr: String(new Date().getFullYear()), verantwortlich: upn, bereich: 'isms', status: 'entwurf' });
}

function openZiel(id) {
  const src = id ? (_zl || []).find(z => String(z.id) === String(id)) : null;
  _zlEdit = src ? JSON.parse(JSON.stringify(src)) : _zlNeu();
  if (!_zlMembers && typeof spGetMembers === 'function') {
    spGetMembers().then(m => {
      _zlMembers = m;
      const dl = document.getElementById('zl-people');
      if (dl) dl.innerHTML = m.map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('');
    }).catch(() => { _zlMembers = []; });
  }
  renderZielEditor();
}

function zlWerkUmschalten(code, an) {
  const w = _zlEdit.werke || (_zlEdit.werke = []);
  const i = w.indexOf(code);
  if (an && i < 0) w.push(code);
  if (!an && i >= 0) w.splice(i, 1);
}

function zlKennzahlUmschalten(id, an) {
  const l = _zlEdit.kennzahlIds || (_zlEdit.kennzahlIds = []);
  const i = l.indexOf(String(id));
  if (an && i < 0) l.push(String(id));
  if (!an && i >= 0) l.splice(i, 1);
}

function zlBewertungSetzen(feld, wert) {
  _zlEdit.bewertung = Object.assign({ ergebnis: '', text: '', am: '', von: '', wirkId: '' }, _zlEdit.bewertung || {}, { [feld]: wert });
}

function renderZielEditor() {
  const z = _zlEdit;
  const schreiben = _zlDarfSchreiben();
  const luecken = zlLuecken(z, _zlMass);
  const mass = z.id ? zlMassnahmenVon(z, _zlMass) : [];
  const b = z.bewertung || {};
  const bewertungen = (_zlWirk || []).filter(w => w.art === 'bewertung').sort((x, y) => String(y.datum).localeCompare(String(x.datum)));
  const verlauf = (z.historie || []).slice().reverse().slice(0, 20).map(h =>
    `<div style="font-size:.75rem;color:var(--c-muted);padding:2px 0">${fmtDateTime(h.datum)} · <b>${esc(h.wer || '')}</b> · ${esc(h.aktion || '')}</div>`).join('');
  const kpis = (_zlKpi || []).filter(k => k.status !== 'stillgelegt' || z.kennzahlIds.includes(String(k.id)));
  openModal(`
    <div class="modal-header">
      <h3>🎯 ${z.id ? 'Ziel ' + esc(z.nr || '') : 'Neues Ziel ' + esc(z.nr || '')}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">ISO 27001 6.2 · Konzernrichtlinie Zieleplanung und -erreichung</div>
      ${luecken.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Was die Richtlinie noch verlangt:</b>
        <ul style="margin:6px 0 0 18px;padding:0">${luecken.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="form-grid">
        <div class="form-group"><label>Nr.</label><input type="text" value="${esc(z.nr)}" oninput="_zlEdit.nr=this.value" placeholder="S01"></div>
        <div class="form-group"><label>Jahr der Zieleplanung</label><input type="text" value="${esc(z.jahr)}" oninput="_zlEdit.jahr=this.value" placeholder="${new Date().getFullYear()}"></div>
        <div class="form-group full"><label>Ziel <span class="req">*</span></label>
          <input type="text" value="${esc(z.titel)}" oninput="_zlEdit.titel=this.value" placeholder="z. B. Zertifizierung nach ISO 27001"></div>
        <div class="form-group full"><label>Beschreibung</label>
          <textarea oninput="_zlEdit.beschreibung=this.value">${esc(z.beschreibung)}</textarea></div>
        <div class="form-group full"><label>Abgeleitet aus (Unternehmensziel, Leitlinie)</label>
          <input type="text" value="${esc(z.unternehmensziel)}" oninput="_zlEdit.unternehmensziel=this.value" placeholder="z. B. Vision 2030: sichere, verfügbare IT in allen Werken"></div>
        <div class="form-group"><label>Bereich des IMS</label>
          <select onchange="_zlEdit.bereich=this.value">${_zlBereiche().map(x => `<option value="${esc(x.key)}"${z.bereich === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Status</label>
          <select onchange="_zlEdit.status=this.value;renderZielEditor()">${ZL_STATUS.map(s => `<option value="${s.key}"${z.status === s.key ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Verantwortlich</label>
          <input type="text" list="zl-people" value="${esc(z.verantwortlich)}" oninput="_zlEdit.verantwortlich=this.value">
          <datalist id="zl-people">${(_zlMembers || []).map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('')}</datalist></div>
        <div class="form-group"><label>Zielerreichung bis</label>
          <input type="date" value="${esc(z.termin)}" onchange="_zlEdit.termin=this.value"></div>
        <div class="form-group full"><label>Messung der Zielerreichung</label>
          <input type="text" value="${esc(z.messung)}" oninput="_zlEdit.messung=this.value" placeholder="z. B. vollständige Maßnahmenumsetzung, Kennzahl ≥ Sollwert"></div>
        <div class="form-group full"><label>Benötigte Ressourcen</label>
          <textarea oninput="_zlEdit.ressourcen=this.value" placeholder="Personen, Budget, externe Partner, Werkzeuge">${esc(z.ressourcen)}</textarea></div>
        <div class="form-group"><label>Verabschiedet am</label>
          <input type="date" value="${esc(z.verabschiedetAm)}" onchange="_zlEdit.verabschiedetAm=this.value"></div>
        <div class="form-group"><label>Verabschiedet von</label>
          <input type="text" value="${esc(z.verabschiedetVon)}" oninput="_zlEdit.verabschiedetVon=this.value" placeholder="Geschäftsführung, Management Review"></div>
        <div class="form-group full"><label>Geltung (Werke)</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:6px">
            ${_zlWerke().map(x => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${(z.werke || []).includes(x) ? 'checked' : ''}
              onchange="zlWerkUmschalten(${jsArg(x)},this.checked)"> ${esc(x)}</label>`).join('')}
          </div><div class="field-hint">Kein Haken = konzernweit.</div></div>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Kennzahlen</div>
        ${kpis.length ? `<div style="display:flex;flex-direction:column;gap:4px">${kpis.map(k => `<label class="ack-check" style="font-weight:500">
            <input type="checkbox" ${z.kennzahlIds.includes(String(k.id)) ? 'checked' : ''} onchange="zlKennzahlUmschalten(${jsArg(k.id)},this.checked)">
            ${esc((k.nr ? k.nr + ' ' : '') + k.name)} <span class="field-hint">${esc(typeof kzSollText === 'function' ? kzSollText(k) : '')}</span></label>`).join('')}</div>`
          : '<div class="field-hint">Im Kennzahlen-Register steht noch keine Kennzahl.</div>'}
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Maßnahmen zur Zielerreichung</div>
        ${!z.id ? '<div class="field-hint">Erst speichern, dann Maßnahmen anlegen.</div>'
          : mass.length ? `<table class="tbl" style="font-size:.8rem;width:100%"><thead><tr><th>Maßnahme</th><th>Verantwortlich</th><th>Termin</th><th>Status</th></tr></thead>
            <tbody>${mass.map(m => `<tr onclick="zlMassnahmeOeffnen(${jsArg(m.id)})" style="cursor:pointer"><td>${esc(m.nr ? m.nr + ' ' : '')}<b>${esc(m.titel)}</b></td>
              <td>${esc(m.verantwortlich || '–')}</td><td>${m.termin ? fmtDate(m.termin) : '–'}</td><td>${esc(m.status)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="field-hint">Noch keine Maßnahme. Die Richtlinie verlangt sie mit Verantwortlichem und Umsetzungsdatum.</div>'}
        ${z.id && schreiben && typeof mnNeuFuerZiel === 'function' ? `<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="zlMassnahmeNeu()">+ Maßnahme zu diesem Ziel</button>` : ''}
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Bewertung (Management Review)</div>
        <div class="form-grid">
          <div class="form-group"><label>Ergebnis</label>
            <select onchange="zlBewertungSetzen('ergebnis',this.value)">
              <option value="">– noch nicht bewertet –</option>
              ${ZL_STATUS.filter(s => s.ende).map(s => `<option value="${s.key}"${b.ergebnis === s.key ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Bewertet am</label>
            <input type="date" value="${esc(b.am || '')}" onchange="zlBewertungSetzen('am',this.value)"></div>
          <div class="form-group full"><label>Bewertung</label>
            <textarea oninput="zlBewertungSetzen('text',this.value)" placeholder="Was wurde erreicht, woran ist es zu sehen? Bei einem verfehlten Ziel: warum, und was folgt für die Planung des nächsten Jahres?">${esc(b.text || '')}</textarea></div>
          <div class="form-group full"><label>In welcher Managementbewertung?</label>
            <select onchange="zlBewertungSetzen('wirkId',this.value)">
              <option value="">– keine gewählt –</option>
              ${bewertungen.map(w => `<option value="${esc(w.id)}"${String(b.wirkId) === String(w.id) ? ' selected' : ''}>${esc(w.titel)}${w.datum ? ' (' + esc(fmtDate(w.datum)) + ')' : ''}</option>`).join('')}</select>
            <div class="field-hint">Aus dem Register „Wirksamkeit & Verbesserung". „Ergebnis übernehmen" setzt den Status des Ziels.</div></div>
        </div>
      </div>

      ${verlauf ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Verlauf</div>${verlauf}</div>` : ''}
    </div>
    <div class="modal-footer">
      ${z.id && schreiben ? `<button class="btn btn-ghost btn-sm" onclick="zlLoeschen(${jsArg(z.id)})" style="color:#b91c1c">Löschen</button>` : ''}
      <div style="flex:1"></div>
      ${schreiben ? `<button class="btn btn-outline" onclick="zlErgebnisUebernehmen()" title="Den Status auf das Ergebnis der Bewertung setzen">Ergebnis übernehmen</button>
        <button class="btn btn-primary" id="zl-save" onclick="zlSpeichern()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

function _zlVermerk(z, aktion) {
  const wer = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '';
  (z.historie = z.historie || []).push({ datum: new Date().toISOString(), wer, aktion });
}

async function zlSpeichern() {
  if (!_zlDarfSchreiben()) { toast('Nur Lesezugriff auf die Ziele.', 'error'); return; }
  const z = _zlEdit;
  if (!String(z.titel || '').trim()) { toast('Bitte das Ziel benennen.', 'error'); return; }
  if (zlStatusInfo(z.status).ende) {
    const f = zlAbschlussfehler(z, z.status, z.bewertung && z.bewertung.text);
    if (f.length) { toast(f[0], 'error', 6000); return; }
  }
  _zlVermerk(z, z.id ? `geändert (${zlStatusInfo(z.status).label})` : 'angelegt');
  await _zlSchreiben(z, 'Gespeichert ✓');
}

/** Das Ergebnis der Bewertung als Status übernehmen, nur mit Bewertungstext. */
async function zlErgebnisUebernehmen() {
  const z = _zlEdit;
  const b = z.bewertung || {};
  const f = zlAbschlussfehler(z, b.ergebnis, b.text);
  if (f.length) { toast(f[0], 'error', 6000); return; }
  z.status = b.ergebnis;
  if (!b.am) zlBewertungSetzen('am', zlHeute());
  if (!z.bewertung.von && typeof State !== 'undefined' && State.user) zlBewertungSetzen('von', State.user.name || State.user.upn);
  _zlVermerk(z, `bewertet: ${zlStatusInfo(z.status).label}`);
  await _zlSchreiben(z, 'Bewertung übernommen ✓');
}

async function _zlSchreiben(z, meldung) {
  const btn = document.getElementById('zl-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    if (z.id) await spUpdateZiel(z.id, z);
    else z.id = await spAddZiel(z);
    closeModal();
    _zl = ((await spGetZiele()) || []).map(zlNormal);
    renderZiele();
    toast(meldung, 'success');
  } catch (e) {
    (z.historie || []).pop();
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

async function zlLoeschen(id) {
  if (!_zlDarfSchreiben()) return;
  const z = (_zl || []).find(x => String(x.id) === String(id));
  if (!z) return;
  const n = zlMassnahmenVon(z, _zlMass).length;
  if (!await uiConfirm(`Ziel „${z.titel}" endgültig löschen?${n ? ` ${n} Maßnahme(n) verweisen darauf und verlieren den Bezug.` : ''} Für den Nachweis ist „verworfen" meist die bessere Wahl.`,
    { title: 'Ziel löschen', okLabel: 'Endgültig löschen', danger: true })) return;
  try {
    await spDeleteZiel(id);
    closeModal();
    _zl = ((await spGetZiele()) || []).map(zlNormal);
    renderZiele();
  } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 'error'); }
}

/** Nach einer Maßnahme zurück zum Ziel, mit frischer Liste. */
function _zlZurueckZu(id) {
  return async () => { await _zlNebenlistenNeu(); renderZiele(); openZiel(id); };
}

function zlMassnahmeNeu() {
  const z = _zlEdit;
  if (!z || !z.id || typeof mnNeuFuerZiel !== 'function') return;
  closeModal();
  mnNeuFuerZiel(z.id, z.titel, _zlZurueckZu(z.id));
}

function zlMassnahmeOeffnen(mid) {
  const z = _zlEdit;
  if (!z || typeof mnOeffnenVonAussen !== 'function') return;
  closeModal();
  mnOeffnenVonAussen(mid, _zlZurueckZu(z.id));
}

/* ── Übernahme aus der Vorlage zur Zieleplanung ── */

let _zlVorschlag = null;   // { datei, ziele: [...], wahl: Set }

async function zlVorlageUebernehmen() {
  if (!_zlDarfSchreiben()) return;
  openModal(`<div class="modal-header"><h3>📄 Aus der Vorlage übernehmen</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="doc-loading">Suche die Vorlage zur Zieleplanung in der ISMS-Bibliothek …</div></div>`);
  try {
    const treffer = (await spSucheIsmsDatei('Vorlage_Zieleplanung')).filter(d => /\.docx$/i.test(d.name));
    const datei = treffer.find(d => /^ISMS_Vorlage_Zieleplanung\.docx$/i.test(d.name)) || treffer[0];
    if (!datei) throw new Error('Keine Datei „ISMS_Vorlage_Zieleplanung.docx" gefunden.');
    const text = await spGetPolicyDocText(datei.driveId, datei.itemId);
    const ziele = zlAusVorlageText(text);
    if (!ziele.length) throw new Error(`In „${datei.name}" steht kein Ziel in der erwarteten Form („Ziel S01: …").`);
    const vorhanden = new Set((_zl || []).map(z => z.nr));
    _zlVorschlag = { datei, ziele, wahl: new Set(ziele.map((z, i) => vorhanden.has(z.nr) ? -1 : i).filter(i => i >= 0)) };
    _zlVorschlagZeigen(vorhanden);
  } catch (e) {
    openModal(`<div class="modal-header"><h3>📄 Aus der Vorlage übernehmen</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body"><div class="col-warning" style="display:block">${esc(e.message)}</div></div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Schließen</button></div>`);
  }
}

function zlVorschlagWahl(i, an) { if (an) _zlVorschlag.wahl.add(i); else _zlVorschlag.wahl.delete(i); }

function _zlVorschlagZeigen(vorhanden) {
  const v = _zlVorschlag;
  openModal(`<div class="modal-header"><h3>📄 Aus der Vorlage übernehmen</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p style="margin:0 0 10px;line-height:1.55">In <a href="${esc(sichereUrl(v.datei.webUrl))}" target="_blank" rel="noopener"><b>${esc(v.datei.name)}</b></a>
      stehen ${v.ziele.length} Ziel(e). Übernommen werden Ziel, Beschreibung, Termin, Messung, Verantwortung und Ressourcen
      als „In Umsetzung", dazu je Maßnahme ein Eintrag in der Maßnahmenliste. Verantwortlich steht dort, wie in der Vorlage, als
      Abteilung; bitte danach eine Person eintragen.</p>
      ${v.ziele.map((z, i) => `<label class="item-card" style="display:block;cursor:pointer;margin-bottom:8px">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <input type="checkbox" ${v.wahl.has(i) ? 'checked' : ''} onchange="zlVorschlagWahl(${i},this.checked)" style="margin-top:4px">
          <div style="flex:1"><b>${esc(z.nr)} ${esc(z.titel)}</b>${vorhanden.has(z.nr) ? ' <span class="ic-tag" style="background:#fef9c3">Nr. schon vorhanden</span>' : ''}
            <div class="field-hint">bis ${esc(z.terminText || '–')} · ${esc(z.verantwortlich || 'ohne Verantwortliche')} · ${z.massnahmen.length} Maßnahme(n)</div></div>
        </div></label>`).join('')}
    </div>
    <div class="modal-footer"><div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="zl-import" onclick="zlVorschlagAnlegen()">Übernehmen</button></div>`, true);
}

async function zlVorschlagAnlegen() {
  const v = _zlVorschlag;
  if (!v || !v.wahl.size) { toast('Nichts ausgewählt.', 'error'); return; }
  const btn = document.getElementById('zl-import');
  if (btn) { btn.disabled = true; btn.textContent = 'Übernehme …'; }
  const wer = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '';
  const jetzt = new Date().toISOString();
  let ziele = 0, mass = 0;
  try {
    const eigene = (typeof spGetMassnahmen === 'function') ? (await spGetMassnahmen()) || [] : [];
    for (const i of [...v.wahl].sort((a, b) => a - b)) {
      const q = v.ziele[i];
      const z = zlNormal({ nr: q.nr, titel: q.titel, beschreibung: q.beschreibung, bereich: 'isms', termin: q.termin,
        jahr: String(new Date().getFullYear()), messung: q.messung, verantwortlich: q.verantwortlich, ressourcen: q.ressourcen,
        status: 'umsetzung', historie: [{ datum: jetzt, wer, aktion: `aus „${v.datei.name}" übernommen` }] });
      const id = await spAddZiel(z);
      ziele++;
      for (const m of q.massnahmen) {
        const neu = { nr: (typeof mnNaechsteNr === 'function') ? mnNaechsteNr(eigene) : '', titel: m.titel, quelle: 'ziel', bereich: 'isms',
          art: 'verbesserung', prioritaet: 'mittel', zielId: id, termin: m.termin, verantwortlich: m.verantwortlich,
          messung: m.messung, ressourcen: m.ressourcen, status: 'in Umsetzung',
          historie: [{ datum: jetzt, wer, aktion: `aus „${v.datei.name}" übernommen` }] };
        await spAddMassnahme(neu);
        eigene.push(neu);
        mass++;
      }
    }
    closeModal();
    _zlVorschlag = null;
    await refreshZiele();
    toast(`${ziele} Ziel(e) und ${mass} Maßnahme(n) übernommen ✓`, 'success');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Übernehmen'; }
    toast(`Abgebrochen nach ${ziele} Ziel(en): ${e.message}`, 'error');
  }
}

/** Für den Deep-Link ?ansicht=ziele&ziel=ID. */
async function zlDeepLink(id) {
  for (let i = 0; i < 60 && !_zl; i++) await new Promise(r => setTimeout(r, 150));
  if (!_zl) return;
  if (!_zl.some(z => String(z.id) === String(id))) { toast('Das Ziel aus dem Link gibt es nicht mehr.'); return; }
  openZiel(id);
}
