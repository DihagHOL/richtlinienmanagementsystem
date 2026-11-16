'use strict';

/**
 * Reiter „Maßnahmen" – die Gesamtliste, kategorisiert
 * ===================================================
 * Die Maßnahmen der Liste „Maßnahmen" auf der ISMS-Site, zusammen mit denen
 * aus dem Risiko-Register und dem Register „Wirksamkeit" des RMS. Die der
 * Liste werden hier gepflegt (mit ihren Spalten, wie sie sind); die aus den
 * Registern dort, wo sie entstanden sind, ein Klick führt hin.
 * Gerechnet wird in js/massnahmenmodell.js.
 */

let _mn = null;            // Liste „Maßnahmen" (auch archivierte)
let _mnRisiken = null;     // Risiko-Register des RMS
let _mnWirk = null;        // Register „Wirksamkeit" des RMS
let _mnZiele = null;       // Liste „ISMS Ziele" (welches Ziel eine Maßnahme verknüpft)
let _mnTeams = null;       // Nachschlageliste „Teams"
let _mnIso = null;         // Nachschlageliste „ISO/IEC 27001:2022"
let _mnLaedt = false;
let _mnFilter = { q: '', quelle: '', team: '', kategorie: '', status: '', durchfuehrung: '', herkunft: '', werk: '', zielId: '', offen: true, ueberfaellig: false, archiv: false };
let _mnGruppe = 'quelle';
let _mnEdit = null;
let _mnIsoSuche = '';
let _mnMembers = null;
let _mnDanach = null;      // nach dem nächsten Speichern (Reiter „Ziele"), bekommt die ID

function _mnDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('massnahmen'); }
function _mnWerke() { return (typeof STANDORTE !== 'undefined') ? STANDORTE : []; }

/** Die Gesamtsicht (archivierte nur auf Wunsch). */
function mnGesamt() {
  return mnAlle(_mn || [], _mnRisiken || [], _mnWirk || [], undefined, { archiv: _mnFilter.archiv });
}

/** Welche Ziele eine Maßnahme der Liste verknüpfen. */
function mnZieleVon(id) {
  return (_mnZiele || []).filter(z => (z.massnahmenIds || []).includes(String(id)));
}
function mnZieleText(id) { return mnZieleVon(id).map(z => z.titel).join(', '); }

/* ── Laden ── */

async function initMassnahmen() {
  const mount = document.getElementById('massnahmen-mount');
  if (!mount) return;
  if (_mn) { renderMassnahmen(); return; }
  if (_mnLaedt) return;
  _mnLaedt = true;
  mount.innerHTML = '<div class="doc-loading">Lade Maßnahmen aus der ISMS-Liste und den Registern …</div>';
  try {
    const [eigene, risiken, wirk, ziele] = await Promise.all([
      spGetMassnahmen(),
      (typeof spGetRisks === 'function') ? spGetRisks().catch(() => []) : [],
      (typeof spGetWirkLeise === 'function') ? spGetWirkLeise().catch(() => []) : [],
      (typeof spGetZieleLeise === 'function') ? spGetZieleLeise() : [],
    ]);
    _mn = eigene || []; _mnRisiken = risiken || []; _mnWirk = wirk || []; _mnZiele = ziele || [];
  } catch (e) {
    _mnLaedt = false;
    const isms = (typeof spIsmsSiteUrl === 'function') ? spIsmsSiteUrl() : 'https://dihag.sharepoint.com/sites/ISMS';
    mount.innerHTML = `<div class="col-warning" style="display:block"><b>Maßnahmen nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:10px">Gelesen wird die Liste „Maßnahmen" auf der <b>ISMS-Site</b>
      <a href="${esc(sichereUrl(isms + '/Lists/Massnahmen'))}" target="_blank" rel="noopener">${esc(isms)}</a>.</div></div>`;
    return;
  }
  _mnLaedt = false;
  renderMassnahmen();
}

async function refreshMassnahmen() {
  _mn = null; _mnRisiken = null; _mnWirk = null; _mnZiele = null;
  if (typeof spHausNeuLesen === 'function') spHausNeuLesen();
  await initMassnahmen();
  toast('Maßnahmen aktualisiert', 'success');
}

/* ── Darstellung ── */

function _mnStatusBadge(e) {
  const ueber = mnUeberfaellig(e);
  const stil = ueber ? 'background:#fee2e2;color:#991b1b;border-color:#fecaca'
    : { 'erledigt': 'background:#dcfce7;color:#166534;border-color:#bbf7d0', 'in Umsetzung': 'background:#e0ecff;color:#17509e;border-color:#bfd4f6',
        'offen': 'background:#fef9c3;color:#854d0e;border-color:#fde68a', 'zurückgestellt': 'background:#f3f4f6;color:#6b7280;border-color:#e5e7eb' }[e.status] || '';
  return `<span style="display:inline-block;border:1px solid;border-radius:6px;padding:1px 7px;font-size:.72rem;font-weight:700;white-space:nowrap;${stil}">${esc(mnStatusInfo(e.status).label)}${ueber ? ' · überfällig' : ''}${e.archiv ? ' · Archiv' : ''}</span>`;
}

function _mnZeile(e) {
  const h = MN_HERKUNFT[e.herkunft] || { kurz: e.herkunft };
  const luecken = e.herkunft === 'eigen' ? mnLuecken(e) : [];
  const ueber = mnUeberfaellig(e);
  const ziele = e.herkunft === 'eigen' ? mnZieleText(e.id) : '';
  const klick = e.herkunft === 'eigen' ? `openMassnahme(${jsArg(e.id)})` : `mnUrsprungOeffnen(${jsArg(e.schluessel)})`;
  return `<tr onclick="${klick}" style="cursor:pointer${e.archiv || e.status === 'zurückgestellt' ? ';opacity:.6' : ''}">
    <td><span class="ic-tag" style="font-size:.68rem;white-space:nowrap">${esc(h.kurz)}</span></td>
    <td><b>${esc(e.titel)}</b>
      ${e.bezugTitel ? `<div style="font-size:.7rem;color:var(--c-faint)">↳ ${esc(e.bezugTitel)}</div>` : ''}
      ${ziele ? `<div style="font-size:.7rem;color:var(--c-faint)">🎯 ${esc(ziele)}</div>` : ''}
      <div style="font-size:.7rem;color:var(--c-faint)">${esc((e.quellen || [e.quelle]).join(' · '))}${e.normbezug ? ' · ' + esc(e.normbezug) : ''}</div></td>
    <td style="color:var(--c-muted)">${esc(e.team || '–')}</td>
    <td style="color:var(--c-muted)">${esc(e.verantwortlichName || e.verantwortlich || '–')}</td>
    <td style="white-space:nowrap;${ueber ? 'color:#b91c1c;font-weight:700' : ''}">${e.termin ? fmtDate(e.termin) : '–'}</td>
    <td style="color:var(--c-muted)">${esc(e.kategorie ? mnGruppenLabel('kategorie', e.kategorie) : '–')}</td>
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
  const f = _mnFilter;
  const alle = mnGesamt();
  const k = mnKennzahlen(alle);
  const zielIds = f.zielId ? new Set(((_mnZiele || []).find(z => String(z.id) === String(f.zielId)) || {}).massnahmenIds || []) : null;
  const liste = mnFiltern(alle, Object.assign({}, f, { ids: zielIds }));
  const gruppen = mnGruppieren(liste, _mnGruppe);
  const fehlend = (typeof spHausFehlendeSpalten === 'function') ? spHausFehlendeSpalten('massnahmen') : [];
  const teams = [...new Set(alle.flatMap(e => (e.teams || []).map(t => t.wert)))].sort((a, b) => a.localeCompare(b, 'de'));

  const kachel = (n, label, farbe, titel) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px"${titel ? ` title="${esc(titel)}"` : ''}>
    <div style="font-size:1.45rem;font-weight:800;color:${farbe}">${n}</div><div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;
  const auswahl = (feld, leer, werte) => `<select class="sort-select" onchange="_mnFilter.${feld}=this.value;renderMassnahmen()">
      <option value="">${esc(leer)}</option>
      ${werte.map(x => `<option value="${esc(x.key)}"${f[feld] === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`;

  const uebersicht = mnGruppieren(alle, _mnGruppe);
  const uebersichtHtml = uebersicht.length ? `<div style="overflow-x:auto;margin-bottom:14px"><table class="tbl" style="font-size:.8rem">
    <thead><tr><th>${esc((MN_GRUPPIERUNG.find(g => g.key === _mnGruppe) || {}).label || '')}</th><th>offen</th><th>in Bearbeitung</th><th>überfällig</th><th>zurückgestellt</th><th>abgeschlossen</th><th>gesamt</th></tr></thead>
    <tbody>${uebersicht.map(g => {
      const z = (s) => g.eintraege.filter(e => e.status === s).length;
      const ue = g.eintraege.filter(e => mnUeberfaellig(e)).length;
      return `<tr><td><b>${esc(g.label)}</b></td><td>${z('offen')}</td><td>${z('in Umsetzung')}</td>
        <td style="${ue ? 'color:#b91c1c;font-weight:700' : ''}">${ue}</td><td>${z('zurückgestellt')}</td><td>${z('erledigt')}</td><td>${g.eintraege.length}</td></tr>`;
    }).join('')}</tbody></table></div>` : '';

  const tabelle = gruppen.length ? gruppen.map(g => {
    const ue = g.eintraege.filter(e => mnUeberfaellig(e)).length;
    return `<div style="font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;margin:18px 2px 8px">
        ${esc(g.label)} (${g.eintraege.length}${ue ? ` · <span style="color:#b91c1c">${ue} überfällig</span>` : ''})</div>
      <div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
        <thead><tr><th>Register</th><th>Maßnahme</th><th>Team</th><th>Verantwortlich</th><th>Geplant</th><th>Thema</th><th>Status</th><th>Angaben</th></tr></thead>
        <tbody>${g.eintraege.map(_mnZeile).join('')}</tbody></table></div>`;
  }).join('')
    : emptyState(alle.length ? 'Keine Treffer für die aktuelle Filterung.' : 'Keine Maßnahme gefunden.', alle.length ? '🔍' : '🛠');

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Die Liste <b>„Maßnahmen"</b> der ISMS-Site zusammen mit den Maßnahmen aus <b>Risiko-Register</b> und <b>Wirksamkeit</b> des RMS.
      Die der Liste werden hier gepflegt, die anderen dort, wo sie entstanden sind; ein Klick führt hin.
      Kategorisiert nach den Feldern der Liste: Entspringt aus, Team, Status, Durchführung. Das Thema nach ISO 27002 ergibt sich aus dem verknüpften Control.
    </div>
    ${fehlend.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>In der Liste „Maßnahmen" fehlen Spalten:</b> ${fehlend.map(esc).join(' · ')}. Diese Angaben bleiben leer.</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kachel(k.offen, 'offen', k.offen ? '#b45309' : '#15803d')}
      ${kachel(k.inUmsetzung, 'in Bearbeitung', '#17509e')}
      ${kachel(k.ueberfaellig, 'überfällig', k.ueberfaellig ? '#b91c1c' : '#15803d')}
      ${kachel(k.ohneTermin, 'ohne geplanten Termin', k.ohneTermin ? '#b45309' : '#15803d', `${k.ohneVerantwortlich} zudem ohne Person und ohne Team`)}
      ${kachel(k.quote + ' %', `abgeschlossen (${k.erledigt} von ${k.gesamt})`, '#17509e')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <label class="field-hint" style="margin:0">Kategorisieren nach</label>
      <select class="sort-select" onchange="_mnGruppe=this.value;renderMassnahmen()">
        ${MN_GRUPPIERUNG.map(g => `<option value="${g.key}"${_mnGruppe === g.key ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}
      </select>
    </div>
    ${uebersichtHtml}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen …" value="${esc(f.q)}" oninput="_mnFilter.q=this.value;renderMassnahmen()" style="width:190px">
      ${auswahl('quelle', 'entspringt aus …', MN_QUELLEN.map(q => ({ key: q.key, label: q.label })))}
      ${auswahl('team', 'alle Teams', teams.map(t => ({ key: t, label: t })))}
      ${auswahl('kategorie', 'alle Themen', MN_KATEGORIEN)}
      ${auswahl('status', 'alle Status', MN_STATUS)}
      ${auswahl('herkunft', 'alle Register', Object.entries(MN_HERKUNFT).map(([key, h]) => ({ key, label: h.label })))}
      ${(_mnZiele || []).length ? auswahl('zielId', 'alle Ziele', _mnZiele.map(z => ({ key: String(z.id), label: z.titel }))) : ''}
      <label class="ack-check" style="font-weight:500"><input type="checkbox" ${f.offen ? 'checked' : ''} onchange="_mnFilter.offen=this.checked;renderMassnahmen()"> nur offene</label>
      <label class="ack-check" style="font-weight:500"><input type="checkbox" ${f.ueberfaellig ? 'checked' : ''} onchange="_mnFilter.ueberfaellig=this.checked;renderMassnahmen()"> nur überfällige</label>
      <label class="ack-check" style="font-weight:500"><input type="checkbox" ${f.archiv ? 'checked' : ''} onchange="_mnFilter.archiv=this.checked;renderMassnahmen()"> mit Archiv</label>
      <div style="flex:1"></div>
      <button class="btn btn-outline btn-sm" onclick="mnExportCsv()">⬇ CSV</button>
      ${schreiben ? `<button class="btn btn-primary btn-sm" onclick="openMassnahme(null)">+ Maßnahme</button>` : ''}
    </div>
    ${schreiben ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf die Maßnahmen.</div>'}
    <div class="field-hint" style="margin:0 0 4px">${liste.length} von ${alle.length} Maßnahme(n)</div>
    ${tabelle}`;
}

/** Zum Ursprung einer Maßnahme aus einem Register des RMS. */
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

/* ── Editor (Liste „Maßnahmen") ── */

async function _mnNachschlagenLaden() {
  if (typeof spHausNachschlagen !== 'function') return;
  if (!_mnTeams) { try { _mnTeams = await spHausNachschlagen('teams'); } catch (e) { _mnTeams = []; } }
  if (!_mnIso) { try { _mnIso = await spHausNachschlagen('iso2022'); } catch (e) { _mnIso = []; } }
}

function _mnMitarbeiterLaden() {
  if (_mnMembers || typeof spGetMembers !== 'function') return;
  spGetMembers().then(m => {
    _mnMembers = m;
    const dl = document.getElementById('mn-people');
    if (dl) dl.innerHTML = m.map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('');
  }).catch(() => { _mnMembers = []; });
}

function _mnNeu(vorlage) {
  return Object.assign({ id: null, herkunft: 'eigen', titel: '', beschreibung: '', status: 'offen', quellen: [], durchfuehrung: 'Einmalig',
    bericht: '', auswirkungEintritt: '', auswirkungSchaden: '', teams: [], verantwortlich: '', verantwortlichName: '',
    termin: '', umgesetztAm: '', iso: [], ressourcen: '', archiv: false, dokumente: [] }, vorlage || {});
}

async function openMassnahme(id) {
  const src = id ? (_mn || []).find(m => String(m.id) === String(id)) : null;
  _mnEdit = src ? JSON.parse(JSON.stringify(src)) : _mnNeu();
  _mnDanach = null;
  _mnIsoSuche = '';
  _mnMitarbeiterLaden();
  renderMassnahmeEditor();
  if (!_mnTeams || !_mnIso) { await _mnNachschlagenLaden(); if (_mnEdit) renderMassnahmeEditor(); }
}

/**
 * Von außen: eine Maßnahme zu einem Ziel anlegen (Reiter „Ziele"). Die
 * Verknüpfung steht am Ziel; `danach` bekommt deshalb die neue ID.
 */
async function mnNeuFuerZiel(zielTitel, danach) {
  if (!_mn) { try { _mn = await spGetMassnahmen(); } catch (e) { _mn = []; } }
  _mnEdit = _mnNeu({ quellen: ['Zielemanagement'], bericht: zielTitel ? `Ziel „${zielTitel}"` : '' });
  _mnDanach = (typeof danach === 'function') ? danach : null;
  _mnMitarbeiterLaden();
  renderMassnahmeEditor();
  if (!_mnTeams || !_mnIso) { await _mnNachschlagenLaden(); if (_mnEdit) renderMassnahmeEditor(); }
}

/** Von außen: eine Maßnahme öffnen (Reiter „Ziele"). */
async function mnOeffnenVonAussen(id, danach) {
  if (!_mn) { try { _mn = await spGetMassnahmen(); } catch (e) { _mn = []; } }
  await openMassnahme(id);
  _mnDanach = (typeof danach === 'function') ? danach : null;
}

function mnQuelleUmschalten(q, an) {
  const l = _mnEdit.quellen || (_mnEdit.quellen = []);
  const i = l.indexOf(q);
  if (an && i < 0) l.push(q);
  if (!an && i >= 0) l.splice(i, 1);
}
function mnNachschlagenUmschalten(feld, id, wert, an) {
  const l = _mnEdit[feld] || (_mnEdit[feld] = []);
  const i = l.findIndex(x => String(x.id) === String(id));
  if (an && i < 0) l.push({ id: String(id), wert });
  if (!an && i >= 0) l.splice(i, 1);
  if (feld === 'teams') _mnEdit.team = l.length ? l[0].wert : '';
}
function mnIsoFiltern(text) {
  _mnIsoSuche = String(text || '');
  const box = document.getElementById('mn-iso-liste');
  if (box) box.innerHTML = _mnIsoListeHtml();
}

function _mnIsoListeHtml() {
  const q = _mnIsoSuche.toLowerCase();
  const gewaehlt = new Set((_mnEdit.iso || []).map(x => String(x.id)));
  const l = (_mnIso || []).filter(x => gewaehlt.has(x.id) || !q || x.wert.toLowerCase().includes(q));
  if (!_mnIso) return '<div class="field-hint">Lade die Controls …</div>';
  return l.map(x => `<label class="ack-check" style="font-weight:500;display:flex"><input type="checkbox" ${gewaehlt.has(x.id) ? 'checked' : ''}
      onchange="mnNachschlagenUmschalten('iso',${jsArg(x.id)},${jsArg(x.wert)},this.checked)"> ${esc(x.wert)}</label>`).join('') || '<div class="field-hint">Kein Control gefunden.</div>';
}

function renderMassnahmeEditor() {
  const m = _mnEdit;
  const schreiben = _mnDarfSchreiben();
  const luecken = mnLuecken(m);
  const ziele = m.id ? mnZieleVon(m.id) : [];
  const sel = (feld, werte, leer) => `<select onchange="_mnEdit.${feld}=this.value;renderMassnahmeEditor()">
      ${leer !== undefined ? `<option value="">${esc(leer)}</option>` : ''}
      ${werte.map(x => `<option value="${esc(x.key)}"${m[feld] === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`;
  const quelleInfo = mnQuelleInfo((m.quellen || [])[0]);
  openModal(`
    <div class="modal-header">
      <h3>🛠 ${m.id ? 'Maßnahme bearbeiten' : 'Neue Maßnahme'}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">Liste „Maßnahmen" auf der ISMS-Site${quelleInfo && quelleInfo.norm ? ' · ' + esc(quelleInfo.norm) : ''}</div>
      ${luecken.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Für Umsetzung und Nachweis fehlt noch:</b>
        <ul style="margin:6px 0 0 18px;padding:0">${luecken.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="form-grid">
        <div class="form-group full"><label>Maßnahme <span class="req">*</span></label>
          <input type="text" value="${esc(m.titel)}" oninput="_mnEdit.titel=this.value" placeholder="z. B. Mehrfaktor-Anmeldung für alle Fernzugänge"></div>
        <div class="form-group full"><label>Detailbeschreibung</label>
          <textarea oninput="_mnEdit.beschreibung=this.value">${esc(m.beschreibung)}</textarea></div>
        <div class="form-group full"><label>Entspringt aus</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:4px">
            ${MN_QUELLEN.filter(q => !q.nurGesamtsicht).map(q => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${(m.quellen || []).includes(q.key) ? 'checked' : ''}
              onchange="mnQuelleUmschalten(${jsArg(q.key)},this.checked)"> ${esc(q.label)}</label>`).join('')}
          </div></div>
        <div class="form-group"><label>Status</label>${sel('status', MN_STATUS)}</div>
        <div class="form-group"><label>Durchführung</label>${sel('durchfuehrung', MN_DURCHFUEHRUNG.map(x => ({ key: x, label: x })), '– wählen –')}</div>
        <div class="form-group"><label>Verantwortlich zur Umsetzung</label>
          <input type="text" list="mn-people" value="${esc(m.verantwortlich)}" oninput="_mnEdit.verantwortlich=this.value" placeholder="name@dihag.com">
          <datalist id="mn-people">${(_mnMembers || []).map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('')}</datalist>
          ${m.verantwortlichName && m.verantwortlichName !== m.verantwortlich ? `<div class="field-hint">${esc(m.verantwortlichName)}</div>` : ''}</div>
        <div class="form-group"><label>Geplante Umsetzung</label><input type="date" value="${esc(m.termin)}" onchange="_mnEdit.termin=this.value"></div>
        <div class="form-group"><label>Umsetzungsdatum</label><input type="date" value="${esc(m.umgesetztAm)}" onchange="_mnEdit.umgesetztAm=this.value"></div>
        <div class="form-group full"><label>Team</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:4px">
            ${(_mnTeams || []).map(t => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${(m.teams || []).some(x => String(x.id) === t.id) ? 'checked' : ''}
              onchange="mnNachschlagenUmschalten('teams',${jsArg(t.id)},${jsArg(t.wert)},this.checked)"> ${esc(t.wert)}</label>`).join('') || '<span class="field-hint">Lade die Teams …</span>'}
          </div></div>
        <div class="form-group full"><label>ISO/IEC 27001:2022</label>
          <input type="text" placeholder="Control suchen, z. B. A.8.13 oder Backup" value="${esc(_mnIsoSuche)}" oninput="mnIsoFiltern(this.value)" style="margin-bottom:6px">
          <div id="mn-iso-liste" style="max-height:170px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:6px 10px">${_mnIsoListeHtml()}</div>
          <div class="field-hint">Das Thema nach ISO 27002 ergibt sich daraus${m.kategorie ? `: <b>${esc(mnGruppenLabel('kategorie', m.kategorie))}</b>` : ''}.</div></div>
        <div class="form-group full"><label>Ressourcen</label>
          <textarea oninput="_mnEdit.ressourcen=this.value" placeholder="Personen, Budget, externe Partner, Werkzeuge">${esc(m.ressourcen)}</textarea></div>
        <div class="form-group full"><label>Quelle / Bericht</label>
          <textarea oninput="_mnEdit.bericht=this.value" placeholder="Aus welchem Bericht, Audit oder Vorfall?">${esc(m.bericht)}</textarea></div>
        <div class="form-group"><label>Auswirkung auf die Eintrittswahrscheinlichkeit</label>${sel('auswirkungEintritt', MN_AUSWIRKUNG.map(x => ({ key: x, label: x })), '– keine Angabe –')}</div>
        <div class="form-group"><label>Auswirkung auf die Schadenshöhe</label>${sel('auswirkungSchaden', MN_AUSWIRKUNG.map(x => ({ key: x, label: x })), '– keine Angabe –')}</div>
        <div class="form-group full"><label class="ack-check" style="font-weight:500"><input type="checkbox" ${m.archiv ? 'checked' : ''} onchange="_mnEdit.archiv=this.checked"> Archiv</label></div>
      </div>
      ${ziele.length ? `<div class="field-hint" style="margin-top:8px">🎯 Verknüpft mit dem Ziel: ${ziele.map(z => esc(z.titel)).join(', ')} (die Verknüpfung steht am Ziel)</div>` : ''}
      ${(m.dokumente || []).length ? `<div class="field-hint" style="margin-top:6px">📄 Zugehörige Dokumente: ${m.dokumente.map(d => esc(d.wert)).join(', ')}</div>` : ''}
    </div>
    <div class="modal-footer">
      ${m.id && schreiben ? `<button class="btn btn-ghost btn-sm" onclick="mnLoeschen(${jsArg(m.id)})" style="color:#b91c1c">Löschen</button>` : ''}
      <div style="flex:1"></div>
      ${schreiben && m.status !== 'erledigt' ? `<button class="btn btn-outline" onclick="mnErledigt()" title="Status „Abgeschlossen&quot;, Umsetzungsdatum heute, falls leer">Abschließen</button>` : ''}
      ${schreiben ? `<button class="btn btn-primary" id="mn-save" onclick="mnSpeichern()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

async function mnSpeichern() {
  if (!_mnDarfSchreiben()) { toast('Nur Lesezugriff auf die Maßnahmen.', 'error'); return; }
  const m = _mnEdit;
  if (!String(m.titel || '').trim()) { toast('Bitte die Maßnahme benennen.', 'error'); return; }
  if (m.verantwortlich && !/@/.test(m.verantwortlich) && m.verantwortlich !== m.verantwortlichName) {
    toast('Verantwortlich bitte als E-Mail-Adresse angeben.', 'error'); return;
  }
  await _mnSchreiben(m, 'Gespeichert ✓');
}

async function mnErledigt() {
  const m = _mnEdit;
  m.status = 'erledigt';
  if (!m.umgesetztAm) m.umgesetztAm = mnHeute();
  await _mnSchreiben(m, 'Abgeschlossen ✓');
}

async function _mnSchreiben(m, meldung) {
  const btn = document.getElementById('mn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    const id = await spSaveMassnahme(m);
    closeModal();
    _mn = await spGetMassnahmen();
    renderMassnahmen();
    toast(meldung, 'success');
    const danach = _mnDanach; _mnDanach = null;
    if (danach) { try { await danach(id); } catch (e) { /* die Sicht dort ist nicht unsere Sache */ } }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    toast('Speichern fehlgeschlagen: ' + e.message, 'error', 6000);
  }
}

async function mnLoeschen(id) {
  if (!_mnDarfSchreiben()) return;
  const m = (_mn || []).find(x => String(x.id) === String(id));
  if (!m) return;
  const ziele = mnZieleVon(id).length;
  if (!await uiConfirm(`„${m.titel}" endgültig aus der Liste „Maßnahmen" löschen?${ziele ? ` ${ziele} Ziel(e) verknüpfen sie.` : ''} „Archiv" behält den Eintrag für den Nachweis.`,
    { title: 'Maßnahme löschen', okLabel: 'Endgültig löschen', danger: true })) return;
  try {
    await spDeleteMassnahme(id);
    closeModal();
    _mn = await spGetMassnahmen();
    renderMassnahmen();
  } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 'error'); }
}

function mnExportCsv() {
  const f = _mnFilter;
  const zielIds = f.zielId ? new Set(((_mnZiele || []).find(z => String(z.id) === String(f.zielId)) || {}).massnahmenIds || []) : null;
  const csv = mnCsv(mnFiltern(mnGesamt(), Object.assign({}, f, { ids: zielIds })), mnZieleText);
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
