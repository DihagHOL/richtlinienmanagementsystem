'use strict';

/**
 * Ansicht „Verantwortung" im Reiter Prozesse.
 * ===========================================
 * Je Prozess der Konzern-Landkarte eine Kette über drei Ebenen: oben die
 * Holding mit Ziel und Prozesseigner, darunter je Werk die verantwortliche
 * Person, darunter die Rollen aus dem Ablauf mit den Namen der Kolleginnen
 * und Kollegen. Rechnen tut verantwortungmodell.js, hier wird gezeichnet,
 * bearbeitet und bestätigt.
 *
 * Wer die Namen der operativen Ebene sieht: das eigene Werk und wer die
 * Konzernsicht hat (meineWerke). Die Ebenen Holding und Werk sind für alle
 * mit Zugriff auf den Reiter sichtbar.
 */

let _vwWerkFilter = '';       // '' = alle Werke
let _vwBahnenCache = {};      // Modell-Kennung → Bahnen (null = nicht lesbar)
let _vwRollenLauf = null;     // laufendes Lesen der Modelle
let _vwOffen = '';            // Kette aus einem Link, die nach dem Zeichnen in Sicht rückt
let _vwAllAcksLauf = null;

function _vwDaten() { return (typeof _lkDaten !== 'undefined' && _lkDaten) ? _lkDaten : null; }
function _vwDarf() { return (typeof lkDarfSchreiben === 'function') ? lkDarfSchreiben('prozesse') : false; }
function _vwJahr() { return new Date().getFullYear(); }
function _vwUpn() { const u = (typeof State !== 'undefined' && State.user) || {}; return String(u.upn || u.mail || '').trim(); }
function _vwName(upn) { return (typeof lkPersonName === 'function') ? lkPersonName(upn) : String(upn || ''); }
function _vwMeineWerke() {
  try { return (typeof meineWerke === 'function') ? meineWerke() : ['*']; } catch (e) { return ['*']; }
}
function _vwKachel(id) {
  const d = _vwDaten();
  const karte = d && d.karten && d.karten.KONZERN;
  return (karte && Array.isArray(karte.kacheln)) ? (karte.kacheln.find(k => k.id === id) || null) : null;
}
/** Bestätigungen, die hier zählen: alle (wer pflegt) oder die eigenen. */
function _vwAcks() {
  if (typeof AdminState !== 'undefined' && Array.isArray(AdminState.allAcks)) return AdminState.allAcks;
  return (typeof State !== 'undefined' && Array.isArray(State.acks)) ? State.acks : [];
}
function _vwMitglieder() { return (typeof _lkMembers !== 'undefined' && Array.isArray(_lkMembers)) ? _lkMembers : []; }

/* ── Laden ───────────────────────────────────────────────────────────── */

async function initVerantwortung() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  mount.innerHTML = `${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('kette') : ''}
    <div class="doc-loading">Verantwortung wird gelesen …</div>`;
  if (typeof lkDatenLaden === 'function') { try { await lkDatenLaden(); } catch (e) { /* Startbestand reicht */ } }
  if (typeof lkMitgliederLaden === 'function') lkMitgliederLaden();
  if (typeof _processes !== 'undefined' && !_processes && typeof spListProcesses === 'function') {
    try { _processes = await spListProcesses(); } catch (e) { /* dann ohne Rollen aus den Modellen */ }
  }
  renderVerantwortung();
  _vwAlleBestaetigungenLaden();
  vwRollenAktualisieren();
}

/** Wer pflegt, sieht die Bestätigungen aller. Einmal je Sitzung. */
function _vwAlleBestaetigungenLaden() {
  if (!_vwDarf() || _vwAllAcksLauf || typeof AdminState === 'undefined' || Array.isArray(AdminState.allAcks)) return;
  if (typeof spGetAcknowledgements !== 'function') return;
  _vwAllAcksLauf = spGetAcknowledgements().then(a => {
    AdminState.allAcks = a || [];
    if (_vwImBild()) renderVerantwortung();
  }).catch(() => { /* dann zählen die eigenen */ });
}

function _vwImBild() { return (typeof _prozModus === 'undefined' || _prozModus === 'kette') && !!document.getElementById('vw-ansicht'); }

/**
 * Rollen aus den Modellen neu lesen. Ändert sich etwas, wird es gespeichert
 * (wer darf), damit der C-Level-Bericht ohne die Modelle auskommt.
 */
async function vwRollenAktualisieren() {
  if (_vwRollenLauf) return _vwRollenLauf;
  _vwRollenLauf = (async () => {
    const d = _vwDaten();
    if (!d || typeof spGetProcessXml !== 'function') return;
    const geaendert = [];
    for (const k of vwKetten(d)) {
      const modelle = (typeof lkProzesseVon === 'function') ? lkProzesseVon(k, 'KONZERN') : [];
      if (!modelle.length) continue;
      const listen = [];
      for (const p of modelle) {
        if (!(p.itemId in _vwBahnenCache)) {
          try { _vwBahnenCache[p.itemId] = vwBahnenAusXml(await spGetProcessXml(p.itemId)); } catch (e) { _vwBahnenCache[p.itemId] = null; }
        }
        if (_vwBahnenCache[p.itemId]) listen.push(_vwBahnenCache[p.itemId]);
      }
      // Ein Modell nicht lesbar: lieber nichts ändern als Rollen verlieren.
      if (listen.length !== modelle.length) continue;
      const neu = vwRollenAusBahnen(listen);
      const kt = vwKetteVon(k, true);
      if (neu.join('|') !== kt.rollen.join('|')) { kt.rollen = neu; geaendert.push(k.name); }
    }
    if (!geaendert.length) return;
    if (_vwDarf() && typeof lkSpeichern === 'function') {
      await lkSpeichern(null, 'Rollen aus den Modellen übernommen: ' + geaendert.join(', '));
    } else if (_vwImBild()) renderVerantwortung();
  })();
  try { await _vwRollenLauf; } finally { _vwRollenLauf = null; }
}

/* ── Zeichnen ────────────────────────────────────────────────────────── */

function renderVerantwortung() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const d = _vwDaten() || { karten: {} };
  const darf = _vwDarf();
  const ketten = vwKetten(d);
  const alleWerke = [...new Set(ketten.flatMap(k => vwKetteVon(k, false).werke))];
  if (_vwWerkFilter && !alleWerke.includes(_vwWerkFilter)) _vwWerkFilter = '';
  const kz = vwKennzahlen(d, { acks: _vwAcks(), members: _vwMitglieder(), jahr: _vwJahr() });
  const upn = _vwUpn();
  const meineOffen = upn ? vwMeineRollen(d, upn).filter(b => !vwBestaetigt(_vwAcks(), upn, b.id, _vwJahr())) : [];

  mount.innerHTML = `
    ${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('kette') : ''}
    <div id="vw-ansicht">
    <div class="view-desc" style="margin:0 0 12px">
      Wer einen Prozess verantwortet, auf drei Ebenen: <b>strategisch</b> die Holding mit Ziel und Prozesseigner,
      <b>administrativ</b> die verantwortliche Person im Werk, <b>operativ</b> die Kolleginnen und Kollegen in den
      Rollen des Ablaufs. Die Rollen kommen aus den Bahnen der BPMN-Modelle an der Kachel.
    </div>
    ${meineOffen.length ? `<div class="vw-hinweis">Sie sind in <b>${meineOffen.length}</b> Rolle${meineOffen.length === 1 ? '' : 'n'} benannt,
      die Sie für ${_vwJahr()} noch nicht bestätigt haben.
      <button class="btn btn-primary btn-sm" onclick="vwBestaetigenDialog()">✓ Meine Rollen bestätigen</button></div>` : ''}
    <div class="view-toolbar">
      <select onchange="vwSetWerk(this.value)" style="max-width:200px" aria-label="Werk filtern">
        <option value=""${_vwWerkFilter ? '' : ' selected'}>Alle Werke</option>
        ${alleWerke.map(w => `<option value="${esc(w)}"${_vwWerkFilter === w ? ' selected' : ''}>${esc(w)}</option>`).join('')}
      </select>
      <div class="toolbar-spacer"></div>
      ${darf && vwStartpaketOffen(d) ? `<button class="btn btn-outline btn-sm" onclick="vwStartpaket()"
        title="Ketten für E-Rechnung Eingang, E-Rechnung Ausgang und Bedarfsmeldung anlegen und die Modelle verknüpfen">⚡ E-Rechnung und Bedarfsmeldung anlegen</button>` : ''}
      ${darf ? `<button class="btn btn-outline btn-sm" onclick="vwKetteDialog('')" title="Für einen weiteren Prozess der Konzern-Landkarte">+ Kette anlegen</button>` : ''}
      <button class="btn btn-outline btn-sm" onclick="vwDrucken()" title="Druckfassung für die Geschäftsführung">🖨 Drucken</button>
    </div>
    ${ketten.length ? _vwKennzahlenHtml(kz) : ''}
    ${ketten.length ? ketten.map(k => _vwKetteHtml(d, k, darf)).join('') : _vwLeerHtml(darf)}
    ${ketten.length ? _vwLegende() : ''}
    </div>`;
  if (_vwOffen) {
    const ziel = document.getElementById('vw-' + _vwOffen);
    _vwOffen = '';
    if (ziel && ziel.scrollIntoView) ziel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function _vwLeerHtml(darf) {
  return `<div class="vw-leer">
      <p><b>Noch keine Verantwortungskette angelegt.</b></p>
      <p class="field-hint">Eine Kette hängt an einem Prozess der Konzern-Landkarte. Für den Anfang gibt es drei
        fertige: E-Rechnung Eingang (Rechnungsprüfung), E-Rechnung Ausgang (Faktura) und die Bedarfsmeldung
        (Bedarfsanforderung), jeweils mit den Modellen und den Werken, die heute damit arbeiten.</p>
      ${darf ? '<button class="btn btn-primary" onclick="vwStartpaket()">⚡ E-Rechnung und Bedarfsmeldung anlegen</button>'
        : '<p class="field-hint">Anlegen kann, wer im Reiter Prozesse schreiben darf.</p>'}
    </div>`;
}

function _vwKennzahlenHtml(kz) {
  const kachel = (zahl, gesamt, label, titel) => `<div class="pm-kpi" title="${esc(titel || '')}"><b>${zahl}${
    gesamt !== null ? `<span>/${gesamt}</span>` : ''}</b>${label}</div>`;
  return `<div class="pm-kpis">
      ${kachel(kz.vollBesetzt, kz.ketten, 'Prozesse voll besetzt', 'Ziel und Eigner in der Holding, alle Werke und Rollen mit Person und Vertretung')}
      ${kachel(kz.besetzt, kz.zellen, 'Stellen besetzt', 'Ebene Werk und Rollen je Werk')}
      ${kachel(kz.ohneVertretung, null, 'ohne Vertretung', 'Eine Person, keine Vertretung')}
      ${kachel(kz.bestaetigt, kz.benennungen, `für ${_vwJahr()} bestätigt`, 'Benannte Personen, die ihre Rolle bestätigt haben')}
      ${kachel(kz.haeufung.length, null, `mit ${VW_HAEUFUNG}+ Rollen`, kz.haeufung.map(p => _vwName(p.upn) + ': ' + p.n).join(', ') || 'Niemand trägt zu viele Rollen')}
      ${kz.unbekannt.length ? kachel(kz.unbekannt.length, null, 'nicht im Verzeichnis', kz.unbekannt.join(', ')) : ''}
    </div>`;
}

function _vwKetteHtml(d, k, darf) {
  const mx = vwMatrix(d, k);
  const werke = _vwWerkFilter ? mx.werke.filter(w => w === _vwWerkFilter) : mx.werke;
  const modelle = (typeof lkProzesseVon === 'function') ? lkProzesseVon(k, 'KONZERN') : [];
  const nr = (typeof lkNrText === 'function') ? lkNrText(k) : '';
  const h = mx.holding;
  const std = (typeof pzStandardInfo === 'function' && h.standard) ? pzStandardInfo(h.standard) : null;
  const kpis = (typeof pzKpiNormal === 'function') ? pzKpiNormal(k.kennzahlen).length : 0;
  const feld = (label, wert, fehlt) => `<div class="vw-feld"><span>${label}</span>${wert ? wert : `<em class="vw-fehlt">${fehlt}</em>`}</div>`;
  const holdingKlick = darf ? `onclick="vwHoldingDialog(${jsArg(k.id)})" role="button" tabindex="0"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();vwHoldingDialog(${jsArg(k.id)})}"` : '';
  const zeilen = mx.zeilen;
  const rollen = zeilen.filter(z => z.art === 'rolle');
  const zeile = (z) => `<tr><td class="pm-erste" title="${esc(z.rolle)}">${esc(z.rolle)}</td>${
    werke.map(w => _vwZelleHtml(k, w, z, darf)).join('')}</tr>`;
  return `<section class="vw-kette" id="vw-${esc(k.id)}">
      <div class="vw-kopf">
        <div><span class="vw-nr">${esc(nr)}</span> <b>${esc(k.name)}</b>
          <span class="field-hint">${modelle.length} Modell${modelle.length === 1 ? '' : 'e'} · ${mx.werke.length} Werk${mx.werke.length === 1 ? '' : 'e'} · ${rollen.length} Rolle${rollen.length === 1 ? '' : 'n'}</span></div>
        <div class="vw-knoepfe">
          ${darf ? `<button class="btn btn-ghost btn-sm" onclick="vwKetteDialog(${jsArg(k.id)})">Werke und Rollen</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="vwKachelOeffnen(${jsArg(k.id)})" title="Kachel der Konzern-Landkarte mit Modellen und Regelwerken">Kachel öffnen</button>
          <button class="btn btn-ghost btn-sm" onclick="vwLinkKopieren(${jsArg(k.id)})" title="Link auf diese Kette">🔗</button>
        </div>
      </div>
      <div class="vw-ebene vw-holding vw-${h.status}${darf ? ' pm-klick' : ''}" ${holdingKlick}>
        <div class="vw-ebene-titel">Strategisch · Holding</div>
        <div class="vw-felder">
          ${feld('Ziel aus der Strategie', h.ziel ? esc(h.ziel) : '', 'nicht festgelegt')}
          ${feld('Prozesseigner', h.eigner ? esc(_vwName(h.eigner)) + _vwHaken(k.id, 'KONZERN', VW_EIGNER_ROLLE, h.eigner) : '', 'nicht benannt')}
          ${feld('Standardisierung', std ? esc(std.label) : '', 'nicht entschieden')}
          ${feld('Kennzahlen', kpis ? String(kpis) : '', 'keine')}
        </div>
      </div>
      ${!werke.length ? '<p class="field-hint" style="margin:8px 0 0">Noch keine Werke an dieser Kette.</p>' : `
      <div class="pm-scroll"><table class="pm-tabelle vw-tabelle">
        <thead><tr><th class="pm-erste">Ebene und Rolle</th>${werke.map(w => `<th>${esc(w)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr class="pm-band"><td colspan="${werke.length + 1}">Administrativ · Werk</td></tr>
          ${zeile(zeilen[0])}
          <tr class="pm-band"><td colspan="${werke.length + 1}">Operativ · Rollen aus dem Ablauf</td></tr>
          ${rollen.length ? rollen.map(zeile).join('')
            : `<tr><td colspan="${werke.length + 1}" class="field-hint">${modelle.length
              ? 'Die Modelle werden gelesen oder haben keine Bahn, in der Menschen arbeiten.'
              : 'Noch kein Modell an der Kachel. Rollen lassen sich auch von Hand ergänzen („Werke und Rollen").'}</td></tr>`}
        </tbody>
      </table></div>`}
    </section>`;
}

/** Häkchen hinter einem Namen, wenn die Rolle für dieses Jahr bestätigt ist. */
function _vwHaken(kachelId, werk, rolle, upn) {
  const id = vwBestaetigungsId(kachelId, werk, rolle);
  return vwBestaetigt(_vwAcks(), upn, id, _vwJahr()) ? ` <span class="vw-ok-haken" title="Für ${_vwJahr()} bestätigt">✓</span>` : '';
}

function _vwZelleHtml(k, werk, z, darf) {
  const c = z.zellen[werk];
  const klick = darf ? ` pm-klick" onclick="vwZelleDialog(${jsArg(k.id)},${jsArg(werk)},${jsArg(z.art === 'werk' ? '' : z.rolle)})" role="button" tabindex="0"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();vwZelleDialog(${jsArg(k.id)},${jsArg(werk)},${jsArg(z.art === 'werk' ? '' : z.rolle)})}"` : '"';
  if (!c || c.status === 'entfaellt') return `<td class="vw-zelle vw-entfaellt${klick} title="Diese Rolle gibt es in ${esc(werk)} nicht">entfällt</td>`;
  if (c.status === 'leer') return `<td class="vw-zelle vw-leer-zelle${klick} title="Niemand benannt">offen</td>`;
  const sichtbar = z.art === 'werk' || vwNamenSichtbar(werk, _vwMeineWerke());
  const klasse = c.status === 'ok' ? 'vw-ok' : 'vw-teil';
  if (!sichtbar) {
    return `<td class="vw-zelle ${klasse}${klick} title="Namen sieht das Werk selbst und die Holding">${c.personen.length} benannt${c.vertretung ? ' + Vertretung' : ''}</td>`;
  }
  const namen = c.personen.map(p => `${esc(_vwName(p))}${c.geerbt ? '' : _vwHaken(k.id, werk, z.rolle, p)}`).join('<br>');
  const vertretung = c.vertretung
    ? `<div class="vw-vertretung">Vertretung: ${esc(_vwName(c.vertretung))}${_vwHaken(k.id, werk, z.rolle + ' (Vertretung)', c.vertretung)}</div>`
    : (c.personen.length < 2 ? '<div class="vw-vertretung vw-fehlt">ohne Vertretung</div>' : '');
  return `<td class="vw-zelle ${klasse}${klick} title="${c.geerbt ? 'Aus der Landkarte des Werks' : ''}">${namen}${vertretung}${
    c.geerbt ? '<div class="vw-vertretung">aus der Werks-Landkarte</div>' : ''}</td>`;
}

function _vwLegende() {
  return `<div class="field-hint" style="margin-top:8px">Grün: besetzt mit Vertretung oder mit mindestens zwei Personen.
    Gelb: eine Person ohne Vertretung. Rot: niemand benannt. ✓: für ${_vwJahr()} bestätigt.
    Die Namen der operativen Ebene sieht das eigene Werk und die Holding.</div>`;
}

/* ── Bedienung ───────────────────────────────────────────────────────── */

function vwSetWerk(w) { _vwWerkFilter = w || ''; renderVerantwortung(); }

function vwKachelOeffnen(id) {
  if (typeof lkSpringeZu !== 'function') return;
  if (typeof setProzessModus === 'function') setProzessModus('karte');
  lkSpringeZu('KONZERN', id);
}

function vwLinkFuer(id) {
  const basis = (typeof location !== 'undefined') ? (location.origin + location.pathname) : '';
  return `${basis}?ansicht=prozesse&kette=${encodeURIComponent(id)}`;
}

async function vwLinkKopieren(id) {
  const url = vwLinkFuer(id);
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopiert ✓', 'success');
  } catch (e) {
    if (typeof uiConfirm === 'function') uiConfirm(`<div style="word-break:break-all">${esc(url)}</div>`, { title: 'Link zur Verantwortungskette', okLabel: 'Schließen', html: true });
  }
}

/** Aus einem Link (?kette=…) direkt in die Kette. */
function vwDeepLink(id) {
  _vwOffen = String(id || '');
  if (typeof setProzessModus === 'function') setProzessModus('kette');
}

/** Startpaket: die drei Ketten mit Modellen und Werken. */
async function vwStartpaket() {
  if (!_vwDarf()) return;
  const d = _vwDaten();
  if (!d) return;
  if (typeof _processes !== 'undefined' && !_processes && typeof spListProcesses === 'function') {
    try { _processes = await spListProcesses(); } catch (e) { toast('Modelle nicht lesbar: ' + e.message, 'error'); return; }
  }
  const erg = vwStartpaketAnwenden(d, (typeof _processes !== 'undefined' && _processes) || []);
  const text = erg.map(e => `${e.titel}: ${e.modelle} Modell(e) verknüpft, ${e.werke} Werk(e)`).join(' · ');
  const gespeichert = await lkSpeichern('Verantwortungsketten angelegt ✓', 'Startpaket Verantwortung: ' + text);
  if (gespeichert) vwRollenAktualisieren();
}

/* ── Dialoge ─────────────────────────────────────────────────────────── */

function _vwPersonFeld(id, wert, platzhalter) {
  return `<input type="text" id="${id}" list="lk-people" value="${esc(wert || '')}" placeholder="${esc(platzhalter || 'name@dihag.com')}">`;
}
function _vwPeopleDatalist() {
  return `<datalist id="lk-people">${(typeof _lkPeopleOptions === 'function') ? _lkPeopleOptions() : ''}</datalist>`;
}
function _vwWert(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

function vwHoldingDialog(id) {
  if (!_vwDarf()) return;
  const k = _vwKachel(id);
  if (!k) return;
  const kt = vwKetteVon(k, true);
  const stdOpt = (typeof PZ_STANDARD !== 'undefined' ? PZ_STANDARD : []).map(s =>
    `<option value="${esc(s.key)}"${k.standardisierung === s.key ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
  openModal(`
    <div class="modal-header"><h3>Holding · ${esc(k.name)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${_vwPeopleDatalist()}
      <div class="form-group full"><label>Ziel aus der Unternehmensstrategie</label>
        <textarea id="vw-ziel" rows="3" style="width:100%;font-family:inherit"
          placeholder="Wozu der Prozess beiträgt, in einem Satz">${esc(kt.ziel)}</textarea></div>
      <div class="form-grid">
        <div class="form-group"><label>Prozesseigner (Holding)</label>${_vwPersonFeld('vw-eigner', k.prozesseigner || k.verantwortlich)}
          <span class="field-hint">Verantwortet den Prozess in der ganzen Gruppe.</span></div>
        <div class="form-group"><label>Standardisierungsgrad</label>
          <select id="vw-standard"><option value="">noch nicht entschieden</option>${stdOpt}</select></div>
      </div>
      <p class="field-hint">Kennzahlen mit Zielwert pflegen Sie an der Kachel der Konzern-Landkarte.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="vwHoldingSpeichern(${jsArg(id)})">Speichern</button>
    </div>`);
}

async function vwHoldingSpeichern(id) {
  const k = _vwKachel(id);
  if (!k) return;
  const kt = vwKetteVon(k, true);
  const alt = vwHolding(k);
  kt.ziel = _vwWert('vw-ziel');
  k.prozesseigner = _vwWert('vw-eigner');
  k.standardisierung = _vwWert('vw-standard');
  const neu = vwHolding(k);
  const teile = [];
  if (alt.ziel !== neu.ziel) teile.push('Ziel');
  if (alt.eigner !== neu.eigner) teile.push(`Prozesseigner: ${alt.eigner || '(niemand)'} → ${neu.eigner || '(niemand)'}`);
  if (alt.standard !== neu.standard) teile.push('Standardisierung');
  closeModal();
  await lkSpeichern('Gespeichert ✓', `Holding ${k.name}: ${teile.join(', ') || 'unverändert'}`);
}

function vwZelleDialog(id, werk, rolle) {
  if (!_vwDarf()) return;
  const k = _vwKachel(id);
  if (!k) return;
  const kt = vwKetteVon(k, true);
  const e = vwWerkEintrag(kt, werk);
  const istWerk = !rolle;
  let personen = '', vertretung = '', ohne = false;
  if (istWerk) { personen = e.verantwortlich; vertretung = e.vertretung; }
  else {
    const key = Object.keys(e.rollen).find(x => vwSchluessel(x) === vwSchluessel(rolle));
    const r = key ? e.rollen[key] : null;
    personen = vwListe(r && r.personen).join(', ');
    vertretung = (r && r.vertretung) || '';
    ohne = e.ohne.some(x => vwSchluessel(x) === vwSchluessel(rolle));
  }
  openModal(`
    <div class="modal-header"><h3>${esc(werk)} · ${esc(istWerk ? VW_WERK_ROLLE : rolle)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${_vwPeopleDatalist()}
      <p class="field-hint" style="margin:0 0 10px">${esc(k.name)} · ${istWerk
        ? 'Die Person, die den Prozess in diesem Werk verantwortet und Abweichungen vom Standard entscheidet.'
        : 'Wer diese Rolle im Ablauf im Werk ausfüllt. Mehrere Personen mit Komma trennen.'}</p>
      <div class="form-group full"><label>${istWerk ? 'Verantwortlich' : 'Personen'}</label>
        ${_vwPersonFeld('vw-personen', personen, istWerk ? 'name@dihag.com' : 'name@dihag.com, name2@dihag.com')}</div>
      <div class="form-group full"><label>Vertretung</label>${_vwPersonFeld('vw-vertretung', vertretung)}</div>
      ${istWerk ? '' : `<label class="ack-check" style="font-weight:500"><input type="checkbox" id="vw-ohne"${ohne ? ' checked' : ''}>
        <span>Diese Rolle gibt es in ${esc(werk)} nicht</span></label>`}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="vwZelleSpeichern(${jsArg(id)},${jsArg(werk)},${jsArg(rolle)})">Speichern</button>
    </div>`);
}

async function vwZelleSpeichern(id, werk, rolle) {
  const k = _vwKachel(id);
  if (!k) return;
  const kt = vwKetteVon(k, true);
  const e = vwWerkEintrag(kt, werk);
  const personen = _vwWert('vw-personen');
  const vertretung = _vwWert('vw-vertretung');
  if (!rolle) {
    e.verantwortlich = vwListe(personen)[0] || '';
    e.vertretung = vertretung;
  } else {
    const ohneEl = document.getElementById('vw-ohne');
    const ohne = !!(ohneEl && ohneEl.checked);
    e.ohne = e.ohne.filter(x => vwSchluessel(x) !== vwSchluessel(rolle));
    if (ohne) e.ohne.push(rolle);
    vwRolleSetzen(kt, werk, rolle, ohne ? [] : personen, ohne ? '' : vertretung);
  }
  closeModal();
  await lkSpeichern('Gespeichert ✓', `${k.name} · ${werk} · ${rolle || VW_WERK_ROLLE}`);
}

/** Werke und zusätzliche Rollen einer Kette, oder eine neue Kette. */
function vwKetteDialog(id) {
  if (!_vwDarf()) return;
  const d = _vwDaten();
  const karte = d && d.karten && d.karten.KONZERN;
  const kacheln = (karte && Array.isArray(karte.kacheln)) ? karte.kacheln : [];
  const k = id ? _vwKachel(id) : null;
  const kt = k ? vwKetteVon(k, true) : { werke: [], rollen: [], extra: [] };
  const standorte = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];
  const frei = kacheln.filter(x => !x.kette).sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  openModal(`
    <div class="modal-header"><h3>${k ? 'Werke und Rollen · ' + esc(k.name) : 'Verantwortungskette anlegen'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${k ? '' : `<div class="form-group full"><label>Prozess der Konzern-Landkarte <span class="req">*</span></label>
        <select id="vw-kachel"><option value="">bitte wählen</option>${frei.map(x =>
          `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></div>`}
      <div class="form-group full"><label>Werke, in denen der Prozess läuft</label>
        <div class="vw-werkwahl">${standorte.map(w => `<label class="ack-check" style="font-weight:500">
          <input type="checkbox" class="vw-werk" value="${esc(w)}"${kt.werke.includes(w) ? ' checked' : ''}><span>${esc(w)}</span></label>`).join('')}</div></div>
      ${k && kt.rollen.length ? `<p class="field-hint" style="margin:0 0 6px">Aus den Modellen: <b>${kt.rollen.map(esc).join(', ')}</b></p>` : ''}
      <div class="form-group full"><label>Weitere Rollen (eine je Zeile)</label>
        <textarea id="vw-extra" rows="3" style="width:100%;font-family:inherit"
          placeholder="Rollen, die in keinem Modell als Bahn stehen">${esc(kt.extra.join('\n'))}</textarea></div>
      <p class="field-hint">Rollen aus den Modellen kommen von selbst, sobald ein Modell an der Kachel hängt.
        Modelle verknüpfen Sie über „Kachel öffnen".</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="vwKetteSpeichern(${jsArg(id || '')})">Speichern</button>
    </div>`);
}

async function vwKetteSpeichern(id) {
  const kachelId = id || _vwWert('vw-kachel');
  const k = kachelId ? _vwKachel(kachelId) : null;
  if (!k) { toast('Bitte einen Prozess wählen.', 'error'); return; }
  const kt = vwKetteVon(k, true);
  const werke = [...document.querySelectorAll('.vw-werk')].filter(el => el.checked).map(el => el.value);
  const weg = kt.werke.filter(w => !werke.includes(w));
  kt.werke = werke;
  // Ein abgewähltes Werk behält seine Namen in der Datei. Kommt es zurück, sind sie wieder da.
  kt.extra = String(_vwWert('vw-extra')).split('\n').map(s => s.trim()).filter(Boolean);
  closeModal();
  const ok = await lkSpeichern('Gespeichert ✓', `Verantwortungskette ${k.name}: ${werke.length} Werk(e)${weg.length ? ', ohne ' + weg.join(', ') : ''}`);
  if (ok) { _vwOffen = k.id; vwRollenAktualisieren(); }
}

/** Die eigenen Rollen für dieses Jahr bestätigen. */
async function vwBestaetigenDialog() {
  const d = _vwDaten();
  const upn = _vwUpn();
  if (!d || !upn) return;
  const jahr = _vwJahr();
  const offen = vwMeineRollen(d, upn).filter(b => !vwBestaetigt(_vwAcks(), upn, b.id, jahr));
  if (!offen.length) { toast('Alle Ihre Rollen sind bestätigt.'); return; }
  const liste = offen.map(b => `<li>${esc(b.name)} · ${esc(b.werk === 'KONZERN' ? 'Holding' : b.werk)} · ${esc(b.rolle)}</li>`).join('');
  const ja = await uiConfirm(`<p style="margin:0 0 8px">Mit der Bestätigung erklären Sie, dass Sie diese Rollen kennen und ausfüllen:</p>
    <ul style="margin:0 0 8px 18px">${liste}</ul>
    <p class="field-hint" style="margin:0">Stimmt etwas nicht, wenden Sie sich an die verantwortliche Person im Werk.</p>`,
    { title: `Meine Rollen ${jahr}`, okLabel: 'Bestätigen', html: true });
  if (!ja) return;
  const u = (typeof State !== 'undefined' && State.user) || {};
  let fehler = 0;
  for (const b of offen) {
    const a = { richtlinieId: b.id, version: String(jahr), benutzerUpn: upn, benutzerName: u.name || upn, gelesenAm: new Date().toISOString() };
    try {
      await spSaveAcknowledgement(a);
      if (typeof State !== 'undefined') (State.acks = State.acks || []).push(a);
      if (typeof AdminState !== 'undefined' && Array.isArray(AdminState.allAcks)) AdminState.allAcks.push(a);
    } catch (e) { fehler++; }
  }
  toast(fehler ? `${offen.length - fehler} von ${offen.length} bestätigt, ${fehler} fehlgeschlagen.` : 'Ihre Rollen sind bestätigt ✓', fehler ? 'error' : 'success');
  renderVerantwortung();
}

/* ── Druckfassung ────────────────────────────────────────────────────── */

function vwDrucken() {
  const d = _vwDaten() || { karten: {} };
  const ketten = vwKetten(d);
  const stamp = new Date().toLocaleDateString('de-DE');
  const kz = vwKennzahlen(d, { acks: _vwAcks(), members: _vwMitglieder(), jahr: _vwJahr() });
  const meine = _vwMeineWerke();
  const zelle = (c, werk, art) => {
    if (!c || c.status === 'entfaellt') return '<td style="color:#9ca3af">entfällt</td>';
    if (c.status === 'leer') return '<td style="color:#b91c1c;font-weight:700">offen</td>';
    const farbe = c.status === 'ok' ? '#f0fdf4' : '#fffbeb';
    if (art !== 'werk' && !vwNamenSichtbar(werk, meine)) return `<td style="background:${farbe}">${c.personen.length} benannt</td>`;
    return `<td style="background:${farbe}">${c.personen.map(p => esc(_vwName(p))).join('<br>')}${
      c.vertretung ? `<div style="color:#6b7280;font-size:10px">Vertretung: ${esc(_vwName(c.vertretung))}</div>` : ''}</td>`;
  };
  const teile = ketten.map(k => {
    const mx = vwMatrix(d, k);
    const h = mx.holding;
    const std = (typeof pzStandardInfo === 'function' && h.standard) ? pzStandardInfo(h.standard) : null;
    const kopf = `<tr><th>Ebene und Rolle</th>${mx.werke.map(w => `<th>${esc(w)}</th>`).join('')}</tr>`;
    const zeilen = mx.zeilen.map(z => `<tr><td><b>${esc(z.rolle)}</b></td>${mx.werke.map(w => zelle(z.zellen[w], w, z.art)).join('')}</tr>`).join('');
    return `<h2>${esc((typeof lkNrText === 'function' ? lkNrText(k) + ' ' : '') + k.name)}</h2>
      <table class="holding"><tr><td><b>Ziel</b></td><td>${h.ziel ? esc(h.ziel) : '<span class="rot">nicht festgelegt</span>'}</td></tr>
        <tr><td><b>Prozesseigner</b></td><td>${h.eigner ? esc(_vwName(h.eigner)) : '<span class="rot">nicht benannt</span>'}</td></tr>
        <tr><td><b>Standardisierung</b></td><td>${std ? esc(std.label) : 'nicht entschieden'}</td></tr></table>
      ${mx.werke.length ? `<table><thead>${kopf}</thead><tbody>${zeilen}</tbody></table>` : '<p class="muted">Noch keine Werke.</p>'}`;
  }).join('');
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>Verantwortung für Prozesse DIHAG (${esc(stamp)})</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:24px;font-size:12px;line-height:1.45}
      h1{font-size:18px;margin:0 0 2px} h2{font-size:14px;margin:18px 0 6px;color:#1A2644} .muted{color:#6b7280} .rot{color:#b91c1c;font-weight:700}
      table{border-collapse:collapse;width:100%;margin-top:6px}
      th,td{border:1px solid #d1d5db;padding:4px 8px;text-align:left;vertical-align:top}
      th{background:#1A2644;color:#fff;font-size:11px} table.holding td:first-child{width:160px;background:#eef2f7}
      .kpi{display:flex;gap:18px;margin:10px 0} .kpi div b{display:block;font-size:16px;color:#17509E}
      .noprint{margin:16px 0}
      @media print{.noprint{display:none} h2,tr{break-inside:avoid;page-break-inside:avoid}}
    </style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    ${(typeof druckKopf === 'function') ? druckKopf() : ''}
    <h1>Verantwortung für Prozesse</h1>
    <div class="muted">Holding (strategisch) · Werk (administrativ) · Rollen im Ablauf (operativ) · Stand ${esc(stamp)}</div>
    <div class="kpi">
      <div><b>${kz.vollBesetzt}/${kz.ketten}</b>Prozesse voll besetzt</div>
      <div><b>${kz.besetzt}/${kz.zellen}</b>Stellen besetzt</div>
      <div><b>${kz.ohneVertretung}</b>ohne Vertretung</div>
      <div><b>${kz.bestaetigt}/${kz.benennungen}</b>für ${_vwJahr()} bestätigt</div>
    </div>
    ${teile || '<p>Noch keine Verantwortungskette angelegt.</p>'}
    <p class="muted" style="margin-top:16px">Erzeugt aus den Prozesslandkarten des RMS. Namen der operativen Ebene erscheinen nur für das eigene Werk und die Holding.</p>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Bitte Pop-ups für diese Seite erlauben.', 'error'); return; }
  w.document.write(html);
  w.document.close();
}
