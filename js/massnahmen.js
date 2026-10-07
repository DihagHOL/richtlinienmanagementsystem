'use strict';

/**
 * Reiter „Maßnahmen" (ISO 27001 6.1.3, 6.2, 10.2 · Maßnahmenplan IMS)
 * ===================================================================
 * Die Gesamtliste aller Maßnahmen, kategorisiert. Eigene Maßnahmen stehen in
 * der Liste „Massnahmen" auf der ISMS-Site; die aus Risikobehandlung,
 * Abweichungen, Managementbewertungen und Notfallübungen bleiben in ihren
 * Registern und werden hier nur gezeigt, mit einem Klick zum Ursprung.
 * Gerechnet wird in js/massnahmenmodell.js.
 */

let _mn = null;            // eigene Maßnahmen (Liste „Massnahmen")
let _mnRisiken = null;     // Risiken (für die Maßnahmen der Risikobehandlung)
let _mnWirk = null;        // Wirksamkeit (Abweichungen, Bewertungen, Übungen)
let _mnZiele = null;       // Ziele (Auswahl und Anzeige)
let _mnLaedt = false;
let _mnFilter = { q: '', quelle: '', bereich: '', kategorie: '', bewertung: '', status: '', herkunft: '', werk: '', offen: true, ueberfaellig: false, zielId: '' };
let _mnGruppe = 'quelle';
let _mnEdit = null;
let _mnMembers = null;
let _mnDanach = null;      // nach dem nächsten Speichern (Ziele-Reiter)

function _mnDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('massnahmen'); }
function _mnWerke() { return (typeof STANDORTE !== 'undefined') ? STANDORTE : []; }

/** Sichtbar nach Gesellschaft, wie in den anderen Registern. */
function _mnSichtbar(liste) {
  if (typeof geltungSichtbar !== 'function') return liste;
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return liste.filter(e => geltungSichtbar(e.werke, upn));
}

function mnGesamt() {
  return _mnSichtbar(mnAlle(_mn || [], _mnRisiken || [], _mnWirk || []));
}

function mnZielTitel(id) {
  const z = (_mnZiele || []).find(x => String(x.id) === String(id));
  return z ? `${z.nr ? z.nr + ' ' : ''}${z.titel}` : '';
}

/* ── Laden ── */

async function initMassnahmen() {
  const mount = document.getElementById('massnahmen-mount');
  if (!mount) return;
  if (_mn) { renderMassnahmen(); return; }
  if (_mnLaedt) return;
  _mnLaedt = true;
  mount.innerHTML = '<div class="doc-loading">Lade Maßnahmen …</div>';
  try {
    // Die eigene Liste darf entstehen; die anderen werden nur gelesen.
    const [eigene, risiken, wirk, ziele] = await Promise.all([
      spGetMassnahmen(),
      (typeof spGetRisks === 'function') ? spGetRisks().catch(() => []) : [],
      (typeof spGetWirkLeise === 'function') ? spGetWirkLeise().catch(() => []) : [],
      (typeof spGetZieleLeise === 'function') ? spGetZieleLeise().catch(() => []) : [],
    ]);
    _mn = eigene || []; _mnRisiken = risiken || []; _mnWirk = wirk || []; _mnZiele = ziele || [];
  } catch (e) {
    _mnLaedt = false;
    mount.innerHTML = _mnLadefehlerHtml(e);
    return;
  }
  _mnLaedt = false;
  renderMassnahmen();
}

function _mnLadefehlerHtml(e) {
  const isms = (typeof spIsmsSiteUrl === 'function') ? spIsmsSiteUrl() : 'https://dihag.sharepoint.com/sites/ISMS';
  const cols = (typeof MASSNAHMEN_COLUMNS !== 'undefined') ? MASSNAHMEN_COLUMNS : [];
  return `<div class="col-warning" style="display:block">
    <b>Maßnahmen nicht ladbar:</b> ${esc(e.message)}
    <div style="margin-top:10px">Die Liste „Massnahmen" liegt wie Risiken und Wirksamkeit auf der <b>ISMS-Site</b>
      <a href="${esc(sichereUrl(isms))}" target="_blank" rel="noopener">${esc(isms)}</a>. Die App legt sie beim ersten Zugriff an;
      dafür braucht Ihr Konto dort das Recht, Listen zu erstellen.</div>
    <div style="margin-top:8px;line-height:1.9">Spalten: ${cols.map(c => `<code>${esc(c.name)}</code> <span style="color:var(--c-muted)">(${esc(c.typ)})</span>`).join(' · ')}</div>
  </div>`;
}

async function refreshMassnahmen() {
  _mn = null; _mnRisiken = null; _mnWirk = null; _mnZiele = null;
  await initMassnahmen();
  if (typeof toast === 'function') toast('Maßnahmen aktualisiert', 'success');
}

/* ── Darstellung ── */

const _MN_HERKUNFT = {
  eigen:       { label: 'Maßnahmenliste', kurz: 'Liste' },
  risiko:      { label: 'Risiko-Register', kurz: 'Risiko' },
  wirksamkeit: { label: 'Wirksamkeit & Verbesserung', kurz: 'Wirksamkeit' },
};

function _mnStatusBadge(e) {
  const ueber = mnUeberfaellig(e);
  const stil = ueber ? 'background:#fee2e2;color:#991b1b;border-color:#fecaca'
    : { 'erledigt': 'background:#dcfce7;color:#166534;border-color:#bbf7d0',
        'in Umsetzung': 'background:#e0ecff;color:#17509e;border-color:#bfd4f6',
        'offen': 'background:#fef9c3;color:#854d0e;border-color:#fde68a',
        'verworfen': 'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb' }[e.status] || '';
  return `<span style="display:inline-block;border:1px solid;border-radius:6px;padding:1px 7px;font-size:.72rem;font-weight:700;white-space:nowrap;${stil}">${esc(e.status)}${ueber ? ' · überfällig' : ''}</span>`;
}

function _mnZeile(e) {
  const h = _MN_HERKUNFT[e.herkunft] || { kurz: e.herkunft };
  const luecken = e.herkunft === 'eigen' ? mnLuecken(e) : [];
  const ueber = mnUeberfaellig(e);
  const kat = e.kategorie ? (mnKategorieInfo(e.kategorie) || {}).label : '';
  const klick = e.herkunft === 'eigen' ? `openMassnahme(${jsArg(e.id)})` : `mnUrsprungOeffnen(${jsArg(e.schluessel)})`;
  return `<tr onclick="${klick}" style="cursor:pointer${e.status === 'verworfen' ? ';opacity:.55' : ''}">
    <td style="white-space:nowrap;font-size:.75rem;color:var(--c-muted)">${e.nr ? esc(e.nr) + '<br>' : ''}<span class="ic-tag" style="font-size:.68rem">${esc(h.kurz)}</span></td>
    <td><b>${esc(e.titel)}</b>
      ${e.bezugTitel ? `<div style="font-size:.7rem;color:var(--c-faint)">↳ ${esc(e.bezugTitel)}</div>` : ''}
      ${e.zielId && mnZielTitel(e.zielId) ? `<div style="font-size:.7rem;color:var(--c-faint)">🎯 ${esc(mnZielTitel(e.zielId))}</div>` : ''}</td>
    <td style="color:var(--c-muted)">${esc(e.verantwortlich || '–')}</td>
    <td style="white-space:nowrap;${ueber ? 'color:#b91c1c;font-weight:700' : ''}">${e.termin ? fmtDate(e.termin) : '–'}</td>
    <td>${esc(e.prioritaet || '')}</td>
    <td style="color:var(--c-muted)">${esc(kat || '–')}</td>
    <td>${_mnStatusBadge(e)}</td>
    <td>${luecken.length ? `<span title="${esc(luecken.join(' · '))}" style="color:#b45309;font-weight:600">${luecken.length} offen</span>`
      : e.herkunft === 'eigen' ? '<span style="color:#15803d;font-weight:600">✓</span>' : '<span class="field-hint">dort</span>'}</td>
  </tr>`;
}

function renderMassnahmen() {
  const mount = document.getElementById('massnahmen-mount');
  if (!mount) return;
  if (!_mn) { if (!_mnLaedt) initMassnahmen(); return; }
  const schreiben = _mnDarfSchreiben();
  const alle = mnGesamt();
  const k = mnKennzahlen(alle);
  const liste = mnFiltern(alle, _mnFilter);
  const gruppen = mnGruppieren(liste, _mnGruppe);
  const fehlend = (typeof spMissingMassnahmenColumns === 'function') ? spMissingMassnahmenColumns() : [];
  const f = _mnFilter;

  const kachel = (n, label, farbe, titel) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px"${titel ? ` title="${esc(titel)}"` : ''}>
    <div style="font-size:1.45rem;font-weight:800;color:${farbe}">${n}</div><div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;
  const auswahl = (feld, leer, katalog) => `<select class="sort-select" onchange="_mnFilter.${feld}=this.value;renderMassnahmen()">
      <option value="">${esc(leer)}</option>
      ${katalog.map(x => `<option value="${esc(x.key)}"${f[feld] === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`;

  // Übersicht: die gewählte Kategorisierung als Zählung je Status
  const uebersicht = mnGruppieren(alle.filter(e => e.status !== 'verworfen'), _mnGruppe);
  const uebersichtHtml = uebersicht.length ? `<div style="overflow-x:auto;margin-bottom:14px"><table class="tbl" style="font-size:.8rem">
    <thead><tr><th>${esc((MN_GRUPPIERUNG.find(g => g.key === _mnGruppe) || {}).label || '')}</th><th>offen</th><th>in Umsetzung</th><th>überfällig</th><th>erledigt</th><th>gesamt</th></tr></thead>
    <tbody>${uebersicht.map(g => {
      const z = (s) => g.eintraege.filter(e => e.status === s).length;
      const ue = g.eintraege.filter(e => mnUeberfaellig(e)).length;
      return `<tr><td><b>${esc(g.label)}</b></td><td>${z('offen')}</td><td>${z('in Umsetzung')}</td>
        <td style="${ue ? 'color:#b91c1c;font-weight:700' : ''}">${ue}</td><td>${z('erledigt')}</td><td>${g.eintraege.length}</td></tr>`;
    }).join('')}</tbody></table></div>` : '';

  const tabelle = gruppen.length ? gruppen.map(g => {
    const ue = g.eintraege.filter(e => mnUeberfaellig(e)).length;
    return `<div style="font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;margin:18px 2px 8px">
        ${esc(g.label)} (${g.eintraege.length}${ue ? ` · <span style="color:#b91c1c">${ue} überfällig</span>` : ''})</div>
      <div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
        <thead><tr><th>Nr / Herkunft</th><th>Maßnahme</th><th>Verantwortlich</th><th>Termin</th><th>Priorität</th><th>Kategorie</th><th>Status</th><th>Nachweis</th></tr></thead>
        <tbody>${g.eintraege.map(_mnZeile).join('')}</tbody></table></div>`;
  }).join('')
    : emptyState(alle.length ? 'Keine Treffer für die aktuelle Filterung.' : 'Noch keine Maßnahme erfasst.', alle.length ? '🔍' : '🛠');

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Alle Maßnahmen an einem Ort: die eigenen aus dieser Liste und die aus <b>Risikobehandlung</b>, <b>Abweichungen</b>,
      <b>Managementbewertungen</b> und <b>Notfallübungen</b>. Die letzteren werden dort gepflegt, wo sie entstanden sind;
      ein Klick führt hin. Kategorisiert nach dem Maßnahmenplan IMS: Bereich, Quelle, Bewertung (NA, V, E), Art, Priorität
      und die vier Themen der ISO 27002.
    </div>
    ${fehlend.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>⚠ In der Liste „Massnahmen" fehlen ${fehlend.length} Spalte(n):</b> ${fehlend.map(esc).join(' · ')}</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kachel(k.offen, 'offen', k.offen ? '#b45309' : '#15803d')}
      ${kachel(k.inUmsetzung, 'in Umsetzung', '#17509e')}
      ${kachel(k.ueberfaellig, 'überfällig', k.ueberfaellig ? '#b91c1c' : '#15803d')}
      ${kachel(k.ohneVerantwortlich + k.ohneTermin, 'ohne Verantwortliche oder Termin', (k.ohneVerantwortlich + k.ohneTermin) ? '#b45309' : '#15803d',
        `${k.ohneVerantwortlich} ohne Verantwortliche, ${k.ohneTermin} ohne Termin`)}
      ${kachel(k.quote + ' %', `erledigt (${k.erledigt} von ${k.gesamt})`, '#17509e')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <label class="field-hint" style="margin:0">Kategorisieren nach</label>
      <select class="sort-select" onchange="_mnGruppe=this.value;renderMassnahmen()">
        ${MN_GRUPPIERUNG.map(g => `<option value="${g.key}"${_mnGruppe === g.key ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}
      </select>
    </div>
    ${uebersichtHtml}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen …" value="${esc(f.q)}" oninput="_mnFilter.q=this.value;renderMassnahmen()" style="width:200px">
      ${auswahl('quelle', 'alle Quellen', MN_QUELLEN)}
      ${auswahl('bereich', 'alle Bereiche', MN_BEREICHE)}
      ${auswahl('kategorie', 'alle Kategorien', MN_KATEGORIEN)}
      ${auswahl('bewertung', 'NA / V / E', MN_BEWERTUNG)}
      <select class="sort-select" onchange="_mnFilter.herkunft=this.value;renderMassnahmen()">
        <option value="">alle Register</option>
        ${Object.entries(_MN_HERKUNFT).map(([key, h]) => `<option value="${key}"${f.herkunft === key ? ' selected' : ''}>${esc(h.label)}</option>`).join('')}
      </select>
      <select class="sort-select" onchange="_mnFilter.werk=this.value;renderMassnahmen()">
        <option value="">alle Werke</option>
        ${_mnWerke().map(w => `<option value="${esc(w)}"${f.werk === w ? ' selected' : ''}>${esc(w)}</option>`).join('')}
      </select>
      ${(_mnZiele || []).length ? `<select class="sort-select" onchange="_mnFilter.zielId=this.value;renderMassnahmen()">
        <option value="">alle Ziele</option>
        ${(_mnZiele || []).map(z => `<option value="${esc(z.id)}"${f.zielId === String(z.id) ? ' selected' : ''}>${esc(mnZielTitel(z.id))}</option>`).join('')}
      </select>` : ''}
      <label class="ack-check" style="font-weight:500"><input type="checkbox" ${f.offen ? 'checked' : ''} onchange="_mnFilter.offen=this.checked;renderMassnahmen()"> nur offene</label>
      <label class="ack-check" style="font-weight:500"><input type="checkbox" ${f.ueberfaellig ? 'checked' : ''} onchange="_mnFilter.ueberfaellig=this.checked;renderMassnahmen()"> nur überfällige</label>
      <div style="flex:1"></div>
      <button class="btn btn-outline btn-sm" onclick="mnExportCsv()">⬇ CSV</button>
      ${schreiben ? `<button class="btn btn-primary btn-sm" onclick="openMassnahme(null)">+ Maßnahme</button>` : ''}
    </div>
    ${schreiben ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf die Maßnahmenliste.</div>'}
    <div class="field-hint" style="margin:0 0 4px">${liste.length} von ${alle.length} Maßnahme(n)</div>
    ${tabelle}`;
}

/** Zum Ursprung einer Maßnahme aus einem anderen Register. */
async function mnUrsprungOeffnen(schluessel) {
  const [herkunft, id] = String(schluessel || '').split(':');
  if (typeof switchView !== 'function' || typeof _ansichtZielOeffnen !== 'function') return;
  if (herkunft === 'risiko') {
    await switchView('risiken');
    await _ansichtZielOeffnen('risiken', new URLSearchParams({ risiko: id }));
  } else if (herkunft === 'wirk') {
    await switchView('wirksamkeit');
    await _ansichtZielOeffnen('wirksamkeit', new URLSearchParams({ eintrag: id }));
  }
}

/* ── Editor (eigene Maßnahmen) ── */

function _mnNeu(vorlage) {
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return Object.assign(mnNormal({ verantwortlich: upn, status: 'offen', prioritaet: 'mittel', bereich: 'isms', quelle: 'sonstige' }),
    { nr: mnNaechsteNr(_mn || []) }, vorlage || {});
}

function _mnMitarbeiterLaden() {
  if (_mnMembers || typeof spGetMembers !== 'function') return;
  spGetMembers().then(m => {
    _mnMembers = m;
    const dl = document.getElementById('mn-people');
    if (dl) dl.innerHTML = m.map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('');
  }).catch(() => { _mnMembers = []; });
}

function openMassnahme(id) {
  const src = id ? (_mn || []).find(m => String(m.id) === String(id)) : null;
  _mnEdit = src ? JSON.parse(JSON.stringify(mnNormal(src))) : _mnNeu();
  _mnDanach = null;
  _mnMitarbeiterLaden();
  renderMassnahmeEditor();
}

/**
 * Von außen: eine Maßnahme zu einem Ziel anlegen (Reiter „Ziele").
 * @param {Function} [danach] wird nach dem Speichern gerufen
 */
async function mnNeuFuerZiel(zielId, zielTitel, danach) {
  if (!_mn) { try { _mn = await spGetMassnahmen(); } catch (e) { _mn = []; } }
  _mnEdit = _mnNeu({ quelle: 'ziel', zielId: String(zielId || ''), art: 'verbesserung',
    zielDerMassnahme: zielTitel ? `Beitrag zum Ziel „${zielTitel}"` : '' });
  _mnDanach = (typeof danach === 'function') ? danach : null;
  _mnMitarbeiterLaden();
  renderMassnahmeEditor();
}

/** Von außen: eine eigene Maßnahme öffnen (Reiter „Ziele"). */
async function mnOeffnenVonAussen(id, danach) {
  if (!_mn) { try { _mn = await spGetMassnahmen(); } catch (e) { _mn = []; } }
  openMassnahme(id);
  _mnDanach = (typeof danach === 'function') ? danach : null;
}

function mnWerkUmschalten(code, an) {
  const w = _mnEdit.werke || (_mnEdit.werke = []);
  const i = w.indexOf(code);
  if (an && i < 0) w.push(code);
  if (!an && i >= 0) w.splice(i, 1);
}

function renderMassnahmeEditor() {
  const m = _mnEdit;
  const schreiben = _mnDarfSchreiben();
  const luecken = mnLuecken(m);
  const sel = (feld, katalog, leer) => `<select onchange="_mnEdit.${feld}=this.value;renderMassnahmeEditor()">
      ${leer !== undefined ? `<option value="">${esc(leer)}</option>` : ''}
      ${katalog.map(x => `<option value="${esc(x.key)}"${m[feld] === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`;
  const datum = (feld) => `<input type="date" value="${esc(m[feld] || '')}" onchange="_mnEdit.${feld}=this.value">`;
  const verlauf = (m.historie || []).slice().reverse().slice(0, 20).map(h =>
    `<div style="font-size:.75rem;color:var(--c-muted);padding:2px 0">${fmtDateTime(h.datum)} · <b>${esc(h.wer || '')}</b> · ${esc(h.aktion || '')}</div>`).join('');
  const quelle = mnQuelleInfo(m.quelle);
  openModal(`
    <div class="modal-header">
      <h3>🛠 ${m.id ? 'Maßnahme ' + esc(m.nr || '') : 'Neue Maßnahme ' + esc(m.nr || '')}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      ${quelle && quelle.norm ? `<div class="field-hint" style="margin-bottom:10px">${esc(quelle.norm)}</div>` : ''}
      ${luecken.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Für einen vollständigen Nachweis fehlt noch:</b>
        <ul style="margin:6px 0 0 18px;padding:0">${luecken.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="form-grid">
        <div class="form-group full"><label>Maßnahme <span class="req">*</span></label>
          <input type="text" value="${esc(m.titel)}" oninput="_mnEdit.titel=this.value" placeholder="z. B. Mehrfaktor-Anmeldung für alle Fernzugänge"></div>
        <div class="form-group full"><label>Beschreibung / To-do</label>
          <textarea oninput="_mnEdit.beschreibung=this.value" placeholder="Was genau ist zu tun?">${esc(m.beschreibung)}</textarea></div>
        <div class="form-group"><label>Bereich des IMS</label>${sel('bereich', MN_BEREICHE)}</div>
        <div class="form-group"><label>Quelle</label>${sel('quelle', MN_QUELLEN)}</div>
        <div class="form-group"><label>Bewertung</label>${sel('bewertung', MN_BEWERTUNG, '– keine –')}
          <div class="field-hint">NA Nichtkonformität · V Verbesserung · E Empfehlung</div></div>
        <div class="form-group"><label>Art</label>${sel('art', MN_ARTEN, '– wählen –')}</div>
        <div class="form-group"><label>Kategorie (ISO 27002)</label>${sel('kategorie', MN_KATEGORIEN.map(x => ({ key: x.key, label: `${x.label} (${x.annex})` })), '– wählen –')}</div>
        <div class="form-group"><label>Priorität</label>${sel('prioritaet', MN_PRIO)}</div>
        <div class="form-group"><label>Normbezug / Kapitel</label>
          <input type="text" value="${esc(m.normbezug)}" oninput="_mnEdit.normbezug=this.value" placeholder="z. B. A.8.5 oder ISO 9001 8.5"></div>
        <div class="form-group"><label>Zum Ziel</label>
          <select onchange="_mnEdit.zielId=this.value">
            <option value="">– keinem Ziel –</option>
            ${(_mnZiele || []).map(z => `<option value="${esc(z.id)}"${String(m.zielId) === String(z.id) ? ' selected' : ''}>${esc(mnZielTitel(z.id))}</option>`).join('')}
            ${m.zielId && !(_mnZiele || []).some(z => String(z.id) === String(m.zielId)) ? `<option value="${esc(m.zielId)}" selected>Ziel ${esc(m.zielId)}</option>` : ''}
          </select></div>
        <div class="form-group full"><label>Ziel der Maßnahme</label>
          <input type="text" value="${esc(m.zielDerMassnahme)}" oninput="_mnEdit.zielDerMassnahme=this.value" placeholder="Was soll sie bewirken?"></div>
        ${m.bewertung === 'NA' || m.art === 'korrektur' ? `<div class="form-group full"><label>Ursachenanalyse</label>
          <textarea oninput="_mnEdit.ursache=this.value" placeholder="Warum kam es dazu? Nicht das Symptom, sondern der Grund.">${esc(m.ursache)}</textarea></div>` : ''}
        <div class="form-group"><label>Verantwortlich <span class="req">*</span></label>
          <input type="text" list="mn-people" value="${esc(m.verantwortlich)}" oninput="_mnEdit.verantwortlich=this.value">
          <datalist id="mn-people">${(_mnMembers || []).map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('')}</datalist></div>
        <div class="form-group"><label>Termin Umsetzung <span class="req">*</span></label>${datum('termin')}</div>
        <div class="form-group"><label>Status</label>
          <select onchange="_mnEdit.status=this.value;renderMassnahmeEditor()">
            ${MN_STATUS.map(s => `<option value="${esc(s)}"${m.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Status geprüft am</label>${datum('statusGeprueftAm')}</div>
        <div class="form-group"><label>Kosten geplant (€)</label>
          <input type="number" min="0" step="any" value="${esc(m.kostenPlan)}" oninput="_mnEdit.kostenPlan=this.value"></div>
        <div class="form-group"><label>Kosten Ist (€)</label>
          <input type="number" min="0" step="any" value="${esc(m.kostenIst)}" oninput="_mnEdit.kostenIst=this.value"></div>
        <div class="form-group full"><label>Messung der Umsetzung</label>
          <input type="text" value="${esc(m.messung)}" oninput="_mnEdit.messung=this.value" placeholder="Woran ist zu erkennen, dass sie umgesetzt ist?"></div>
        <div class="form-group full"><label>Ressourcen</label>
          <input type="text" value="${esc(m.ressourcen)}" oninput="_mnEdit.ressourcen=this.value" placeholder="Personen, Budget, externe Partner, Werkzeuge"></div>
        <div class="form-group full"><label>Wirksamkeitsprüfung${(m.bewertung === 'NA' || m.art === 'korrektur') && m.status === 'erledigt' ? ' <span class="req">*</span>' : ''}</label>
          <textarea oninput="_mnEdit.wirksamkeit=this.value" placeholder="Hat sie gewirkt? Woran ist das zu sehen?">${esc(m.wirksamkeit)}</textarea></div>
        <div class="form-group"><label>Wirksamkeit geprüft am</label>${datum('wirksamAm')}</div>
        <div class="form-group"><label>Nachweis (Link)</label>
          <input type="url" value="${esc(m.nachweis)}" oninput="_mnEdit.nachweis=this.value" placeholder="https://…"></div>
        <div class="form-group full"><label>Geltung (Werke)</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:6px">
            ${_mnWerke().map(x => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${(m.werke || []).includes(x) ? 'checked' : ''}
              onchange="mnWerkUmschalten(${jsArg(x)},this.checked)"> ${esc(x)}</label>`).join('')}
          </div><div class="field-hint">Kein Haken = konzernweit.</div></div>
      </div>
      ${verlauf ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Verlauf</div>${verlauf}</div>` : ''}
    </div>
    <div class="modal-footer">
      ${m.id && schreiben ? `<button class="btn btn-ghost btn-sm" onclick="mnLoeschen(${jsArg(m.id)})" style="color:#b91c1c">Löschen</button>` : ''}
      <div style="flex:1"></div>
      ${schreiben && m.status !== 'erledigt' ? `<button class="btn btn-outline" onclick="mnErledigt()">Erledigt</button>` : ''}
      ${schreiben ? `<button class="btn btn-primary" id="mn-save" onclick="mnSpeichern()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

function _mnVermerk(m, aktion) {
  const wer = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '';
  (m.historie = m.historie || []).push({ datum: new Date().toISOString(), wer, aktion });
}

async function mnSpeichern() {
  if (!_mnDarfSchreiben()) { toast('Nur Lesezugriff auf die Maßnahmenliste.', 'error'); return; }
  const m = _mnEdit;
  if (!String(m.titel || '').trim()) { toast('Bitte die Maßnahme benennen.', 'error'); return; }
  if (m.status === 'erledigt') {
    const f = mnAbschlussfehler(m);
    if (f.length) { toast('Noch nicht erledigt: ' + f[0], 'error', 6000); return; }
  }
  _mnVermerk(m, m.id ? `geändert (Status ${m.status})` : 'angelegt');
  await _mnSchreiben(m, 'Gespeichert ✓');
}

async function mnErledigt() {
  const m = _mnEdit;
  const f = mnAbschlussfehler(m);
  if (f.length) { toast('Noch nicht erledigt: ' + f[0], 'error', 6000); return; }
  m.status = 'erledigt';
  if (!m.statusGeprueftAm) m.statusGeprueftAm = mnHeute();
  _mnVermerk(m, 'erledigt');
  await _mnSchreiben(m, 'Als erledigt vermerkt ✓');
}

async function _mnSchreiben(m, meldung) {
  const btn = document.getElementById('mn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    if (m.id) await spUpdateMassnahme(m.id, m);
    else m.id = await spAddMassnahme(m);
    closeModal();
    _mn = await spGetMassnahmen();
    renderMassnahmen();
    toast(meldung, 'success');
    const danach = _mnDanach; _mnDanach = null;
    if (danach) { try { await danach(); } catch (e) { /* die Sicht dort ist nicht unsere Sache */ } }
  } catch (e) {
    (m.historie || []).pop();
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

async function mnLoeschen(id) {
  if (!_mnDarfSchreiben()) return;
  const m = (_mn || []).find(x => String(x.id) === String(id));
  if (!m) return;
  if (!await uiConfirm(`„${m.titel}" endgültig löschen? Für den Nachweis ist „verworfen" meist die bessere Wahl.`,
    { title: 'Maßnahme löschen', okLabel: 'Endgültig löschen', danger: true })) return;
  try {
    await spDeleteMassnahme(id);
    closeModal();
    _mn = await spGetMassnahmen();
    renderMassnahmen();
  } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 'error'); }
}

function mnExportCsv() {
  const csv = mnCsv(mnFiltern(mnGesamt(), _mnFilter), mnZielTitel);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `Massnahmen_${mnHeute()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Für den Deep-Link ?ansicht=massnahmen&massnahme=ID. */
async function mnDeepLink(id) {
  for (let i = 0; i < 60 && !_mn; i++) await new Promise(r => setTimeout(r, 150));
  if (!_mn) return;
  if (!_mn.some(m => String(m.id) === String(id))) { toast('Die Maßnahme aus dem Link gibt es nicht mehr.'); return; }
  openMassnahme(id);
}
