'use strict';

/**
 * Reiter „Ziele" (ISO 27001 6.2 · Konzernrichtlinie Zieleplanung)
 * ===============================================================
 * Die Liste „ISMS Ziele" der ISMS-Site, gepflegt mit ihren Spalten, wie sie
 * sind. Dazu, was die Richtlinie verlangt und was davon fehlt: Verantwortung,
 * Termin, Messung, Maßnahmen mit Ressourcen, und die Bewertung im Management
 * Review, auch für ein nicht erreichtes Ziel. Gerechnet wird in js/zielmodell.js.
 */

let _zl = null;            // Liste „ISMS Ziele"
let _zlMass = null;        // Liste „Maßnahmen" (Fortschritt, Ressourcen, Auswahl)
let _zlTeams = null;       // Nachschlageliste „Teams"
let _zlStandorte = null;   // Nachschlageliste „Standorte"
let _zlLaedt = false;
let _zlFilter = { q: '', status: '', team: '', archiv: false };
let _zlEdit = null;
let _zlMassSuche = '';

function _zlDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('ziele'); }

/* ── Laden ── */

async function initZiele() {
  const mount = document.getElementById('ziele-mount');
  if (!mount) return;
  if (_zl) { renderZiele(); return; }
  if (_zlLaedt) return;
  _zlLaedt = true;
  mount.innerHTML = '<div class="doc-loading">Lade die Ziele aus der ISMS-Liste …</div>';
  try {
    const [ziele, mass] = await Promise.all([
      spGetZiele(),
      (typeof spGetMassnahmenLeise === 'function') ? spGetMassnahmenLeise() : [],
    ]);
    _zl = ziele || []; _zlMass = mass || [];
  } catch (e) {
    _zlLaedt = false;
    const isms = (typeof spIsmsSiteUrl === 'function') ? spIsmsSiteUrl() : 'https://dihag.sharepoint.com/sites/ISMS';
    mount.innerHTML = `<div class="col-warning" style="display:block"><b>Ziele nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:10px">Gelesen wird die Liste „ISMS Ziele" auf der <b>ISMS-Site</b>
      <a href="${esc(sichereUrl(isms))}" target="_blank" rel="noopener">${esc(isms)}</a>.</div></div>`;
    return;
  }
  _zlLaedt = false;
  renderZiele();
}

async function refreshZiele() {
  _zl = null; _zlMass = null;
  if (typeof spHausNeuLesen === 'function') spHausNeuLesen();
  await initZiele();
  toast('Ziele aktualisiert', 'success');
}

/* ── Darstellung ── */

function _zlGefiltert() {
  const f = _zlFilter;
  const q = f.q.toLowerCase();
  return (_zl || []).filter(z => {
    if (!f.archiv && z.archiv) return false;
    if (q && !(`${z.titel} ${z.beschreibung} ${z.messung} ${(z.teams || []).map(t => t.wert).join(' ')}`).toLowerCase().includes(q)) return false;
    if (f.status && z.status !== f.status) return false;
    if (f.team && !(z.teams || []).some(t => t.wert === f.team)) return false;
    return true;
  }).sort((a, b) => (Number(!!zlStatusInfo(b.status).laufend) - Number(!!zlStatusInfo(a.status).laufend))
    || String(a.termin || '9999').localeCompare(String(b.termin || '9999')) || a.titel.localeCompare(b.titel, 'de'));
}

function _zlStatusBadge(z) {
  const ueber = zlTerminUeberschritten(z);
  const erg = zlErgebnis(z);
  const s = zlStatusInfo(z.status);
  const stil = ueber || erg === 'verfehlt' ? 'background:#fee2e2;color:#991b1b;border-color:#fecaca'
    : erg === 'erreicht' ? 'background:#dcfce7;color:#166534;border-color:#bbf7d0'
    : s.warn ? 'background:#fef9c3;color:#854d0e;border-color:#fde68a'
    : s.gestoppt ? 'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb'
    : 'background:#e0ecff;color:#17509e;border-color:#bfd4f6';
  const zusatz = erg === 'erreicht' ? ' · erreicht' : erg === 'verfehlt' ? ' · nicht erreicht' : ueber ? ' · Termin überschritten' : '';
  return `<span style="display:inline-block;border:1px solid;border-radius:6px;padding:1px 7px;font-size:.72rem;font-weight:700;white-space:nowrap;${stil}">${esc(z.status)}${zusatz}</span>`;
}

function _zlKarte(z) {
  const fort = zlFortschritt(z, _zlMass);
  const luecken = zlLuecken(z, _zlMass);
  const rot = zlTerminUeberschritten(z) || zlErgebnis(z) === 'verfehlt';
  const balken = fort.pct === null ? '' : `<div style="display:flex;align-items:center;gap:8px;margin-top:8px">
      <div style="flex:1;height:7px;background:var(--c-border-2,#eef2f7);border-radius:4px;overflow:hidden">
        <div style="width:${fort.pct}%;height:100%;background:${fort.pct === 100 ? '#16a34a' : '#17509e'}"></div></div>
      <span style="font-size:.75rem;color:var(--c-muted);white-space:nowrap">${fort.erledigt} von ${fort.gesamt} Maßnahmen abgeschlossen</span></div>`;
  return `<div class="item-card" onclick="openZiel(${jsArg(z.id)})" style="cursor:pointer;border-left:4px solid ${rot ? '#ef4444' : zlErgebnis(z) === 'erreicht' ? '#22c55e' : '#17509e'}${z.archiv ? ';opacity:.6' : ''}">
    <div class="ic-top"><div class="ic-title">${esc(z.titel)}</div><div class="ic-topright">${_zlStatusBadge(z)}</div></div>
    <div class="ic-tags">
      ${z.zieltyp ? `<span class="ic-tag cat">${esc(z.zieltyp)}</span>` : ''}
      ${z.termin ? `<span class="ic-tag">🗓 bis ${esc(fmtDate(z.termin))}</span>` : ''}
      ${(z.teams || []).length ? `<span class="ic-tag">👥 ${esc(z.teams.map(t => t.wert).join(', '))}</span>` : ''}
      ${z.prioritaet ? `<span class="ic-tag">Priorität ${esc(z.prioritaet)}</span>` : ''}
      ${z.standort ? `<span class="ic-tag">${esc(z.standort.wert)}</span>` : ''}
    </div>
    ${z.messung ? `<div style="margin-top:6px;font-size:.8rem;color:var(--c-muted)">Messung: ${esc(z.messung.split('\n')[0])}</div>` : ''}
    ${balken}
    ${luecken.length ? `<div style="margin-top:8px;font-size:.78rem;color:#b45309" title="${esc(luecken.join(' · '))}">⚠ ${esc(luecken[0])}${luecken.length > 1 ? ` (und ${luecken.length - 1} weitere)` : ''}</div>` : ''}
  </div>`;
}

function renderZiele() {
  const mount = document.getElementById('ziele-mount');
  if (!mount) return;
  if (!_zl) { if (!_zlLaedt) initZiele(); return; }
  const schreiben = _zlDarfSchreiben();
  const k = zlKennzahlen(_zl, _zlMass);
  const liste = _zlGefiltert();
  const fehlend = (typeof spHausFehlendeSpalten === 'function') ? spHausFehlendeSpalten('ziele') : [];
  const teams = [...new Set((_zl || []).flatMap(z => (z.teams || []).map(t => t.wert)))].sort((a, b) => a.localeCompare(b, 'de'));
  const f = _zlFilter;
  const kachel = (n, label, farbe) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${farbe}">${n}</div><div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Die Liste <b>„ISMS Ziele"</b> der ISMS-Site, geprüft gegen <b>ISO 27001 6.2</b> und die Konzernrichtlinie
      <b>Zieleplanung und -erreichung</b>: Verantwortung, Termin, Messung, Maßnahmen mit Ressourcen, und die Bewertung
      im Management Review. Ein nicht erreichtes Ziel wird ebenso dokumentiert wie ein erreichtes.
    </div>
    ${fehlend.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>In der Liste „ISMS Ziele" fehlen Spalten:</b> ${fehlend.map(esc).join(' · ')}. Diese Angaben bleiben leer.</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kachel(k.laufend, 'laufende Ziele', '#17509e')}
      ${kachel(k.erreicht, 'erreicht', '#15803d')}
      ${kachel(k.verfehlt, 'nicht erreicht', k.verfehlt ? '#b45309' : '#15803d')}
      ${kachel(k.gefaehrdet, 'verzögert, gefährdet oder verschoben', k.gefaehrdet ? '#b45309' : '#15803d')}
      ${kachel(k.ueberschritten, 'Termin überschritten', k.ueberschritten ? '#b91c1c' : '#15803d')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen …" value="${esc(f.q)}" oninput="_zlFilter.q=this.value;renderZiele()" style="width:200px">
      <select class="sort-select" onchange="_zlFilter.status=this.value;renderZiele()">
        <option value="">alle Status</option>
        ${ZL_STATUS.map(s => `<option value="${esc(s.key)}"${f.status === s.key ? ' selected' : ''}>${esc(s.key)}</option>`).join('')}</select>
      <select class="sort-select" onchange="_zlFilter.team=this.value;renderZiele()">
        <option value="">alle Teams</option>
        ${teams.map(t => `<option value="${esc(t)}"${f.team === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <label class="ack-check" style="font-weight:500"><input type="checkbox" ${f.archiv ? 'checked' : ''} onchange="_zlFilter.archiv=this.checked;renderZiele()"> mit Archiv</label>
      <div style="flex:1"></div>
      ${schreiben ? `<button class="btn btn-primary btn-sm" onclick="openZiel(null)">+ Ziel</button>` : ''}
    </div>
    ${schreiben ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf die Ziele.</div>'}
    ${liste.length ? liste.map(_zlKarte).join('') : emptyState((_zl || []).length ? 'Keine Treffer für die aktuelle Filterung.' : 'In der Liste „ISMS Ziele" steht noch kein Ziel.', '🎯')}`;
}

/* ── Editor ── */

async function _zlNachschlagenLaden() {
  if (typeof spHausNachschlagen !== 'function') return;
  if (!_zlTeams) { try { _zlTeams = await spHausNachschlagen('teams'); } catch (e) { _zlTeams = []; } }
  if (!_zlStandorte) { try { _zlStandorte = await spHausNachschlagen('standorte'); } catch (e) { _zlStandorte = []; } }
}

async function openZiel(id) {
  const src = id ? (_zl || []).find(z => String(z.id) === String(id)) : null;
  _zlEdit = src ? JSON.parse(JSON.stringify(src))
    : { id: null, titel: '', beschreibung: '', termin: '', messung: '', erreicht: '', archiv: false, bemerkung: '', zieltyp: 'Operativ',
        status: 'Nicht begonnen', teams: [], massnahmenIds: [], massnahmenNamen: [], standort: null, prioritaet: '' };
  _zlMassSuche = '';
  renderZielEditor();
  if (!_zlTeams || !_zlStandorte) { await _zlNachschlagenLaden(); if (_zlEdit) renderZielEditor(); }
}

function zlTeamUmschalten(id, wert, an) {
  const l = _zlEdit.teams || (_zlEdit.teams = []);
  const i = l.findIndex(x => String(x.id) === String(id));
  if (an && i < 0) l.push({ id: String(id), wert });
  if (!an && i >= 0) l.splice(i, 1);
}
function zlMassnahmeUmschalten(id, an) {
  const l = _zlEdit.massnahmenIds || (_zlEdit.massnahmenIds = []);
  const i = l.indexOf(String(id));
  if (an && i < 0) l.push(String(id));
  if (!an && i >= 0) l.splice(i, 1);
}
function zlMassFiltern(text) {
  _zlMassSuche = String(text || '');
  const box = document.getElementById('zl-mass-liste');
  if (box) box.innerHTML = _zlMassListeHtml();
}

function _zlMassListeHtml() {
  const q = _zlMassSuche.toLowerCase();
  const gew = new Set((_zlEdit.massnahmenIds || []).map(String));
  const l = (_zlMass || []).filter(m => gew.has(String(m.id)) || ((!m.archiv) && (!q || m.titel.toLowerCase().includes(q))))
    .sort((a, b) => Number(gew.has(String(b.id))) - Number(gew.has(String(a.id))) || a.titel.localeCompare(b.titel, 'de'));
  return l.map(m => `<label class="ack-check" style="font-weight:500;display:flex;gap:6px"><input type="checkbox" ${gew.has(String(m.id)) ? 'checked' : ''}
      onchange="zlMassnahmeUmschalten(${jsArg(m.id)},this.checked)"> <span>${esc(m.titel)} <span class="field-hint">${esc(_zlMassStatus(m))}${m.ressourcen ? ' · Ressourcen festgehalten' : ''}</span></span></label>`).join('')
    || '<div class="field-hint">Keine Maßnahme gefunden.</div>';
}

function _zlMassStatus(m) { return (typeof mnStatusInfo === 'function') ? mnStatusInfo(m.status).label : m.status; }

function renderZielEditor() {
  const z = _zlEdit;
  const schreiben = _zlDarfSchreiben();
  const luecken = zlLuecken(z, _zlMass);
  const fort = zlFortschritt(z, _zlMass);
  const sel = (feld, werte, leer) => `<select onchange="_zlEdit.${feld}=this.value;renderZielEditor()">
      ${leer !== undefined ? `<option value="">${esc(leer)}</option>` : ''}
      ${werte.map(x => `<option value="${esc(x)}"${z[feld] === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  openModal(`
    <div class="modal-header">
      <h3>🎯 ${z.id ? 'Ziel bearbeiten' : 'Neues Ziel'}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">Liste „ISMS Ziele" · ISO 27001 6.2 · Konzernrichtlinie Zieleplanung und -erreichung</div>
      ${luecken.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Was die Richtlinie noch verlangt:</b>
        <ul style="margin:6px 0 0 18px;padding:0">${luecken.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="form-grid">
        <div class="form-group full"><label>Ziel <span class="req">*</span></label>
          <input type="text" value="${esc(z.titel)}" oninput="_zlEdit.titel=this.value" placeholder="z. B. Erreichung der ISO27001 Zertifizierung"></div>
        <div class="form-group full"><label>Beschreibung</label><textarea oninput="_zlEdit.beschreibung=this.value">${esc(z.beschreibung)}</textarea></div>
        <div class="form-group"><label>Status</label>${sel('status', ZL_STATUS.map(s => s.key))}</div>
        <div class="form-group"><label>Umsetzung bis</label><input type="date" value="${esc(z.termin)}" onchange="_zlEdit.termin=this.value"></div>
        <div class="form-group"><label>Zieltyp</label>${sel('zieltyp', ZL_TYPEN, '– wählen –')}</div>
        <div class="form-group"><label>Priorität</label>${sel('prioritaet', ZL_PRIO, '– keine –')}</div>
        <div class="form-group full"><label>Messung</label>
          <textarea oninput="_zlEdit.messung=this.value" placeholder="Woran wird die Zielerreichung gemessen?">${esc(z.messung)}</textarea></div>
        <div class="form-group full"><label>Verantwortlich</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:4px">
            ${(_zlTeams || []).map(t => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${(z.teams || []).some(x => String(x.id) === t.id) ? 'checked' : ''}
              onchange="zlTeamUmschalten(${jsArg(t.id)},${jsArg(t.wert)},this.checked)"> ${esc(t.wert)}</label>`).join('') || '<span class="field-hint">Lade die Teams …</span>'}
          </div></div>
        <div class="form-group"><label>Standort</label>
          <select onchange="_zlEdit.standort=this.value?{id:this.value,wert:this.options[this.selectedIndex].text}:null">
            <option value="">– keiner –</option>
            ${(_zlStandorte || []).map(s => `<option value="${esc(s.id)}"${z.standort && String(z.standort.id) === s.id ? ' selected' : ''}>${esc(s.wert)}</option>`).join('')}
          </select></div>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Maßnahmen zur Zielerreichung${fort.gesamt ? ` <span class="field-hint">${fort.erledigt} von ${fort.gesamt} abgeschlossen</span>` : ''}</div>
        <input type="text" placeholder="Maßnahme suchen" value="${esc(_zlMassSuche)}" oninput="zlMassFiltern(this.value)" style="margin-bottom:6px;width:100%">
        <div id="zl-mass-liste" style="max-height:200px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:6px 10px">${_zlMassListeHtml()}</div>
        <div class="field-hint" style="margin-top:4px">Die Ressourcen stehen in der Liste an den Maßnahmen.</div>
        ${z.id && schreiben && typeof mnNeuFuerZiel === 'function' ? `<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="zlMassnahmeNeu()">+ Neue Maßnahme zu diesem Ziel</button>` : ''}
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Bewertung (Management Review)</div>
        <div class="form-grid">
          <div class="form-group"><label>Zielerreichung</label>${sel('erreicht', ['Ja', 'Nein'], '– noch nicht bewertet –')}</div>
          <div class="form-group full"><label>Bemerkung${z.erreicht === 'Nein' ? ' <span class="req">*</span>' : ''}</label>
            <textarea oninput="_zlEdit.bemerkung=this.value;_zlEdit.bemerkungGeaendert=true" placeholder="Was wurde erreicht? Bei einem nicht erreichten Ziel: warum, und was folgt für die Planung des nächsten Jahres?">${esc(z.bemerkung)}</textarea></div>
          <div class="form-group full"><label class="ack-check" style="font-weight:500"><input type="checkbox" ${z.archiv ? 'checked' : ''} onchange="_zlEdit.archiv=this.checked"> Archiv</label></div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      ${z.id && schreiben ? `<button class="btn btn-ghost btn-sm" onclick="zlLoeschen(${jsArg(z.id)})" style="color:#b91c1c">Löschen</button>` : ''}
      <div style="flex:1"></div>
      ${schreiben && z.status !== 'Abgeschlossen' ? `<button class="btn btn-outline" onclick="zlAbschliessen()" title="Status „Abgeschlossen&quot;, braucht die Angabe zur Zielerreichung">Abschließen</button>` : ''}
      ${schreiben ? `<button class="btn btn-primary" id="zl-save" onclick="zlSpeichern()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

async function zlSpeichern() {
  if (!_zlDarfSchreiben()) { toast('Nur Lesezugriff auf die Ziele.', 'error'); return; }
  const z = _zlEdit;
  if (!String(z.titel || '').trim()) { toast('Bitte das Ziel benennen.', 'error'); return; }
  if (z.status === 'Abgeschlossen') {
    const f = zlAbschlussfehler(z);
    if (f.length) { toast(f[0], 'error', 6000); return; }
  }
  await _zlSchreiben(z, 'Gespeichert ✓');
}

async function zlAbschliessen() {
  const z = _zlEdit;
  const f = zlAbschlussfehler(z);
  if (f.length) { toast(f[0], 'error', 6000); return; }
  z.status = 'Abgeschlossen';
  await _zlSchreiben(z, 'Abgeschlossen ✓');
}

async function _zlSchreiben(z, meldung) {
  const btn = document.getElementById('zl-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    z.id = await spSaveZiel(z);
    closeModal();
    _zl = await spGetZiele();
    renderZiele();
    toast(meldung, 'success');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    toast('Speichern fehlgeschlagen: ' + e.message, 'error', 6000);
  }
}

async function zlLoeschen(id) {
  if (!_zlDarfSchreiben()) return;
  const z = (_zl || []).find(x => String(x.id) === String(id));
  if (!z) return;
  if (!await uiConfirm(`Ziel „${z.titel}" endgültig aus der Liste „ISMS Ziele" löschen? „Archiv" behält es für den Nachweis.`,
    { title: 'Ziel löschen', okLabel: 'Endgültig löschen', danger: true })) return;
  try {
    await spDeleteZiel(id);
    closeModal();
    _zl = await spGetZiele();
    renderZiele();
  } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 'error'); }
}

/** Neue Maßnahme anlegen und am Ziel verknüpfen (die Verknüpfung steht in der Liste am Ziel). */
function zlMassnahmeNeu() {
  const z = _zlEdit;
  if (!z || !z.id || typeof mnNeuFuerZiel !== 'function') return;
  const zielId = z.id;
  closeModal();
  mnNeuFuerZiel(z.titel, async (neueId) => {
    try { _zlMass = (await spGetMassnahmenLeise()) || _zlMass; } catch (e) { /* bleibt */ }
    const frisch = (_zl || []).find(x => String(x.id) === String(zielId));
    if (frisch && neueId) {
      const kopie = JSON.parse(JSON.stringify(frisch));
      kopie.massnahmenIds = [...new Set([...(kopie.massnahmenIds || []), String(neueId)])];
      try { await spSaveZiel(kopie); _zl = await spGetZiele(); toast('Maßnahme am Ziel verknüpft ✓', 'success'); }
      catch (e) { toast('Maßnahme angelegt, Verknüpfung am Ziel fehlgeschlagen: ' + e.message, 'error', 6000); }
    }
    renderZiele();
    openZiel(zielId);
  });
}

/** Für den Deep-Link ?ansicht=ziele&ziel=ID. */
async function zlDeepLink(id) {
  for (let i = 0; i < 60 && !_zl; i++) await new Promise(r => setTimeout(r, 150));
  if (!_zl) return;
  if (!_zl.some(z => String(z.id) === String(id))) { toast('Das Ziel aus dem Link gibt es nicht mehr.'); return; }
  openZiel(id);
}
