'use strict';

/**
 * Reiter „Kennzahlen" (ISO 27001 9.1)
 * ===================================
 * Drei Teile:
 *   1. die Liste „Kennzahlen" der ISMS-Site mit ihren Messwerten aus
 *      „Kennzahlen Tracking": Ampel gegen den Normalwert, Trend, Verlauf,
 *      nächste fällige Messung aus dem Turnus,
 *   2. was das RMS selbst misst (aus den Metriken des Audit Reports) – zum
 *      Eintragen als Messwert einer Kennzahl, statt es abzuschreiben,
 *   3. die Kennzahlen der Prozesse aus Landkarte und Modellen, nur zur Ansicht.
 * Gerechnet wird in js/kennzahlmodell.js.
 */

let _kz = null;            // Kennzahlen mit Messwerten
let _kzLaedt = false;
let _kzFilter = { q: '', typ: '', team: '', archiv: false };
let _kzEdit = null;
let _kzTeams = null;
let _kzStandorte = null;
let _kzMetriken = null;    // Ergebnis von _clevelGather (auf Knopfdruck)
let _kzMisst = false;
let _kzProzesse = null;    // Prozesskennzahlen (aus Landkarte und Modellen)

function _kzDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('kennzahlen'); }
function _kzIch() { return (typeof State !== 'undefined' && State.user) ? State.user.upn : ''; }

/** Welche Kennzahl eine Messgröße des RMS zuletzt aufnahm (je Browser gemerkt). */
function _kzZuordnung(key, id) {
  try {
    const m = JSON.parse(localStorage.getItem('rms_kz_automatik') || '{}');
    if (id === undefined) return m[key] || '';
    m[key] = String(id || ''); localStorage.setItem('rms_kz_automatik', JSON.stringify(m));
  } catch (e) { /* ohne Speicher: dann eben jedes Mal wählen */ }
  return '';
}

/* ── Laden ── */

async function initKennzahlen() {
  const mount = document.getElementById('kennzahlen-mount');
  if (!mount) return;
  if (_kz) { renderKennzahlen(); return; }
  if (_kzLaedt) return;
  _kzLaedt = true;
  mount.innerHTML = '<div class="doc-loading">Lade Kennzahlen und Messwerte aus den ISMS-Listen …</div>';
  try { _kz = (await spGetKennzahlen()) || []; }
  catch (e) {
    _kzLaedt = false;
    const isms = (typeof spIsmsSiteUrl === 'function') ? spIsmsSiteUrl() : 'https://dihag.sharepoint.com/sites/ISMS';
    mount.innerHTML = `<div class="col-warning" style="display:block"><b>Kennzahlen nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:10px">Gelesen werden die Listen „Kennzahlen" und „Kennzahlen Tracking" auf der <b>ISMS-Site</b>
      <a href="${esc(sichereUrl(isms))}" target="_blank" rel="noopener">${esc(isms)}</a>.</div></div>`;
    return;
  }
  _kzLaedt = false;
  renderKennzahlen();
  _kzProzesseLaden();
}

async function refreshKennzahlen() {
  _kz = null; _kzProzesse = null; _kzMetriken = null;
  if (typeof spHausNeuLesen === 'function') spHausNeuLesen();
  await initKennzahlen();
  toast('Kennzahlen aktualisiert', 'success');
}

/* ── Darstellung ── */

function _kzAmpel(b) {
  return { erfuellt: { farbe: '#15803d', text: 'grün' }, gelb: { farbe: '#b45309', text: 'gelb' }, verfehlt: { farbe: '#b91c1c', text: 'rot' }, offen: { farbe: '#6b7280', text: 'offen' } }[b] || { farbe: '#6b7280', text: 'offen' };
}

function _kzVerlaufSvg(k) {
  const v = kzVerlauf(k, 110, 26);
  if (!v.pfad) return '<span class="field-hint">–</span>';
  return `<svg width="110" height="26" viewBox="0 0 110 26" aria-hidden="true">
    ${v.soll !== null ? `<line x1="0" x2="110" y1="${v.soll}" y2="${v.soll}" stroke="#94a3b8" stroke-dasharray="3 3" stroke-width="1"/>` : ''}
    <path d="${v.pfad}" fill="none" stroke="#17509e" stroke-width="1.8"/>
    ${v.punkte.length ? `<circle cx="${v.punkte[v.punkte.length - 1].x}" cy="${v.punkte[v.punkte.length - 1].y}" r="2.4" fill="#17509e"/>` : ''}</svg>`;
}

function _kzWertText(k, w) {
  if (!w) return '';
  const einheit = k.einheit === 'Prozentsatz' ? ' %' : '';
  return w.wert === null ? w.roh : kzZahlText(w.wert) + einheit;
}

function _kzZeile(k) {
  const l = kzLetzter(k);
  const b = _kzAmpel(kzBewertung(k));
  const t = kzTrend(k);
  const n = kzNaechsteMessung(k);
  const luecken = kzLuecken(k);
  return `<tr onclick="openKennzahl(${jsArg(k.id)})" style="cursor:pointer${k.archiv ? ';opacity:.55' : ''}">
    <td><b>${esc(k.name)}</b>
      <div style="font-size:.7rem;color:var(--c-faint)">${esc([k.typ, k.zweck].filter(Boolean).join(' · '))}</div></td>
    <td style="min-width:140px">${esc(k.normalwert || '–')}</td>
    <td style="white-space:nowrap">${l ? `<b style="color:${b.farbe}">${esc(_kzWertText(k, l))}</b>
      <div style="font-size:.7rem;color:var(--c-faint)">${esc(fmtDate(l.datum))}</div>` : '<span class="field-hint">kein Wert</span>'}</td>
    <td style="white-space:nowrap">${t === 'besser' ? '<span style="color:#15803d">▲ besser</span>'
      : t === 'schlechter' ? '<span style="color:#b91c1c">▼ schlechter</span>' : t === 'gleich' ? '<span class="field-hint">= gleich</span>' : ''}</td>
    <td>${_kzVerlaufSvg(k)}</td>
    <td style="white-space:nowrap">${esc(k.turnus || '–')}
      ${n ? `<div style="font-size:.7rem;${n.faellig ? 'color:#b91c1c;font-weight:700' : 'color:var(--c-faint)'}">${n.faellig ? 'Messung fällig' : 'nächste ' + esc(fmtDate(n.datum))}</div>` : ''}</td>
    <td style="color:var(--c-muted)">${esc(k.team ? k.team.wert : '–')}</td>
    <td>${luecken.length ? `<span title="${esc(luecken.join(' · '))}" style="color:#b45309;font-weight:600">${luecken.length} offen</span>` : '<span style="color:#15803d;font-weight:600">✓</span>'}</td>
    <td onclick="event.stopPropagation()">${_kzDarfSchreiben() && !k.archiv ? `<button class="btn btn-outline btn-sm" onclick="kzWertErfassen(${jsArg(k.id)})">+ Wert</button>` : ''}</td>
  </tr>`;
}

function renderKennzahlen() {
  const mount = document.getElementById('kennzahlen-mount');
  if (!mount) return;
  if (!_kz) { if (!_kzLaedt) initKennzahlen(); return; }
  const schreiben = _kzDarfSchreiben();
  const s = kzKennzahlen(_kz);
  const f = _kzFilter;
  const q = f.q.toLowerCase();
  const teams = [...new Set(_kz.map(k => k.team ? k.team.wert : '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const liste = _kz.filter(k => (f.archiv || !k.archiv)
    && (!q || `${k.name} ${k.beschreibung} ${k.zweck} ${k.messung} ${k.normalwert}`.toLowerCase().includes(q))
    && (!f.typ || k.typ === f.typ) && (!f.team || (k.team && k.team.wert === f.team)))
    .sort((a, b) => Number(a.archiv) - Number(b.archiv) || a.name.localeCompare(b.name, 'de'));
  const fehlend = (typeof spHausFehlendeSpalten === 'function') ? spHausFehlendeSpalten('kennzahlen').concat(spHausFehlendeSpalten('tracking')) : [];
  const kachel = (n, label, farbe) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${farbe}">${n}</div><div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Die Listen <b>„Kennzahlen"</b> und <b>„Kennzahlen Tracking"</b> der ISMS-Site, nach <b>ISO 27001 9.1</b>: was gemessen wird,
      wie, wie oft, von wem, und was herauskam. Die Ampel liest den Normalwert, wo er eine Grenze nennt („&lt;= 5", „Grün: &gt; 90%").
      Was das RMS selbst misst, lässt sich unten als Messwert eintragen.
    </div>
    ${fehlend.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>In den Kennzahl-Listen fehlen Spalten:</b> ${fehlend.map(esc).join(' · ')}. Diese Angaben bleiben leer.</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kachel(s.gesamt, 'Kennzahlen geführt', '#17509e')}
      ${kachel(s.erfuellt, 'grün', '#15803d')}
      ${kachel(s.gelb + s.verfehlt, 'gelb oder rot', (s.gelb + s.verfehlt) ? '#b91c1c' : '#15803d')}
      ${kachel(s.messungFaellig, 'Messung fällig', s.messungFaellig ? '#b45309' : '#15803d')}
      ${kachel(s.ohneSoll, 'Normalwert nicht auswertbar', s.ohneSoll ? '#b45309' : '#15803d')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen …" value="${esc(f.q)}" oninput="_kzFilter.q=this.value;renderKennzahlen()" style="width:200px">
      <select class="sort-select" onchange="_kzFilter.typ=this.value;renderKennzahlen()">
        <option value="">alle Typen</option>
        ${KZ_TYPEN.map(t => `<option value="${esc(t)}"${f.typ === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select class="sort-select" onchange="_kzFilter.team=this.value;renderKennzahlen()">
        <option value="">alle Teams</option>
        ${teams.map(t => `<option value="${esc(t)}"${f.team === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <label class="ack-check" style="font-weight:500"><input type="checkbox" ${f.archiv ? 'checked' : ''} onchange="_kzFilter.archiv=this.checked;renderKennzahlen()"> mit Archiv</label>
      <div style="flex:1"></div>
      ${schreiben ? `<button class="btn btn-primary btn-sm" onclick="openKennzahl(null)">+ Kennzahl</button>` : ''}
    </div>
    ${schreiben ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf die Kennzahlen.</div>'}
    ${liste.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
      <thead><tr><th>Kennzahl</th><th>Normalwert</th><th>Letzter Wert</th><th>Trend</th><th>Verlauf</th><th>Turnus</th><th>Verantwortlich</th><th>Angaben</th><th></th></tr></thead>
      <tbody>${liste.map(_kzZeile).join('')}</tbody></table></div>`
      : emptyState(_kz.length ? 'Keine Treffer für die aktuelle Filterung.' : 'In der Liste „Kennzahlen" steht noch keine Kennzahl.', '📊')}
    <div id="kz-automatik" style="margin-top:28px">${_kzAutomatikHtml()}</div>
    <div id="kz-prozesse" style="margin-top:28px">${_kzProzesseHtml()}</div>`;
}

/* ── Vom RMS gemessen ── */

function _kzAutomatikHtml() {
  const schreiben = _kzDarfSchreiben();
  const kopf = `<h3 style="margin:0 0 6px;font-size:1.05rem">Vom RMS gemessen</h3>
    <div class="view-desc" style="margin:0 0 10px">Werte, die im RMS ohnehin entstehen, aus denselben Daten wie der Audit Report.
      Jeder lässt sich als Messwert einer Kennzahl in „Kennzahlen Tracking" eintragen, mit heutigem Datum.
      <button class="btn btn-ghost btn-sm" onclick="kzJetztMessen()" ${_kzMisst ? 'disabled' : ''}>${_kzMisst ? 'Misst …' : (_kzMetriken ? '↻ Neu messen' : '▶ Jetzt messen')}</button></div>`;
  if (!_kzMetriken) return kopf + `<div class="field-hint">${_kzMisst ? 'Die Register werden gelesen, das dauert einen Moment.' : 'Noch nicht gemessen. „Jetzt messen" liest alle Register einmal durch.'}</div>`;
  const aktive = (_kz || []).filter(k => !k.archiv);
  const zeilen = KZ_AUTOMATIK.map(a => {
    const wert = kzAutomatikWert(a.key, _kzMetriken);
    const ziel = _kzZuordnung(a.key);
    return `<tr><td><b>${esc(a.label)}</b><div style="font-size:.7rem;color:var(--c-faint)">${esc(a.norm)}</div></td>
      <td style="white-space:nowrap">${wert === null ? '<span class="field-hint">nicht messbar</span>' : `<b>${esc(kzZahlText(wert))}${a.einheit ? ' ' + esc(a.einheit) : ''}</b>`}</td>
      <td>${schreiben && wert !== null && aktive.length ? `<div style="display:flex;gap:6px;align-items:center">
        <select class="sort-select" id="kz-auto-${a.key}" style="max-width:260px">
          <option value="">– Kennzahl wählen –</option>
          ${aktive.map(k => `<option value="${esc(k.id)}"${ziel === String(k.id) ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}
        </select>
        <button class="btn btn-outline btn-sm" onclick="kzAutomatikEintragen(${jsArg(a.key)})">Eintragen</button></div>` : ''}</td></tr>`;
  }).join('');
  return kopf + `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Messgröße</th><th>Wert heute</th><th>Als Messwert eintragen in</th></tr></thead><tbody>${zeilen}</tbody></table></div>
    ${(_kzMetriken.fehler || []).length ? `<div class="field-hint" style="margin-top:6px">Nicht alles war lesbar: ${esc(_kzMetriken.fehler.join(' · '))}</div>` : ''}`;
}

async function kzJetztMessen() {
  if (typeof _clevelGather !== 'function') { toast('Die Messung braucht den Audit Report. Bitte die Seite neu laden.', 'error'); return; }
  _kzMisst = true;
  const host = document.getElementById('kz-automatik');
  if (host) host.innerHTML = _kzAutomatikHtml();
  try { _kzMetriken = await _clevelGather(); }
  catch (e) { toast('Messung fehlgeschlagen: ' + e.message, 'error'); }
  _kzMisst = false;
  const h2 = document.getElementById('kz-automatik');
  if (h2) h2.innerHTML = _kzAutomatikHtml();
}

async function kzAutomatikEintragen(key) {
  const sel = document.getElementById('kz-auto-' + key);
  const id = sel ? sel.value : '';
  const k = (_kz || []).find(x => String(x.id) === String(id));
  const wert = kzAutomatikWert(key, _kzMetriken);
  if (!k) { toast('Bitte die Kennzahl wählen.', 'error'); return; }
  if (wert === null) { toast('Für diese Messgröße liegt gerade kein Wert vor.', 'error'); return; }
  const a = kzAutomatikInfo(key);
  if (!await uiConfirm(`${kzZahlText(wert)}${a.einheit ? ' ' + a.einheit : ''} als Messwert vom ${fmtDate(kzHeute())} in „${k.name}" eintragen?`,
    { title: 'Messwert eintragen', okLabel: 'Eintragen' })) return;
  _kzZuordnung(key, id);
  await _kzWertSchreiben({ kennzahlId: k.id, datum: kzHeute(), wert, bemerkung: `Vom RMS gemessen: ${a.label}`, von: _kzIch() }, 'Messwert eingetragen ✓');
}

/* ── Prozesskennzahlen ── */

async function _kzProzesseLaden(neu) {
  if (_kzProzesse && !neu) return;
  if (typeof pzEintraege !== 'function' || typeof spLoadLandkarte !== 'function') { _kzProzesse = []; return; }
  _kzProzesse = null;
  const host = document.getElementById('kz-prozesse');
  if (host) host.innerHTML = _kzProzesseHtml(true);
  try {
    const g = await spLoadLandkarte();
    const daten = (g && g.daten && g.daten.karten) ? g.daten : { karten: {} };
    const modelle = [];
    if (typeof spListProcesses === 'function' && typeof spGetProcessXml === 'function' && typeof pzPmAusText === 'function') {
      const karten = daten.karten || {};
      const kachelnVon = (itemId) => {
        const out = [];
        Object.keys(karten).forEach(werk => (karten[werk].kacheln || []).forEach(k => {
          if ((Array.isArray(k.prozesse) ? k.prozesse : []).some(v => v && String(v.id) === String(itemId))) out.push({ werk, kachel: k });
        }));
        return out;
      };
      const liste = await spListProcesses();
      for (let i = 0; i < liste.length; i += 5) {
        await Promise.all(liste.slice(i, i + 5).map(async p => {
          let pm = null;
          try { pm = pzPmAusText(String(await spGetProcessXml(p.itemId)).split('&amp;').join('&')); } catch (e) { /* ohne Angaben */ }
          modelle.push({ itemId: p.itemId, title: p.title, ordner: p.ordner || '', pm, kacheln: kachelnVon(p.itemId) });
        }));
      }
    }
    let werke = Object.keys(daten.karten || {});
    if (typeof trennungGreift === 'function' && trennungGreift() && typeof meineWerke === 'function') {
      const meine = meineWerke();
      werke = werke.filter(w => w === 'KONZERN' || meine.includes(w));
    }
    _kzProzesse = kzAusProzessen(pzEintraege(daten, werke, undefined, modelle));
  } catch (e) { _kzProzesse = []; }
  const h2 = document.getElementById('kz-prozesse');
  if (h2) h2.innerHTML = _kzProzesseHtml();
}

function _kzProzesseHtml(laedt) {
  const kopf = `<h3 style="margin:0 0 6px;font-size:1.05rem">Prozesskennzahlen</h3>
    <div class="view-desc" style="margin:0 0 10px">Die Kennzahlen der Prozesse (ISO 9001 4.4 c) stehen an der Kachel der Landkarte oder im Modell
      und werden dort gepflegt. Eine Kennzahl der Konzernkachel gilt im Werk als Vorgabe, gemessen wird im Werk.
      <button class="btn btn-ghost btn-sm" onclick="_kzProzesseLaden(true)">↻ Aktualisieren</button></div>`;
  if (laedt || !_kzProzesse) return kopf + '<div class="doc-loading">Prozesse werden gelesen …</div>';
  if (!_kzProzesse.length) return kopf + '<div class="field-hint">An keinem Prozess steht eine Kennzahl.</div>';
  const label = (w) => (w === 'KONZERN' ? 'Konzern / Holding' : w || 'ohne Ablage');
  return kopf + `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Werk</th><th>Prozess</th><th>Kennzahl</th><th>Ziel</th><th>Ist</th><th>Stand</th><th></th></tr></thead>
    <tbody>${_kzProzesse.map(p => {
      const b = _kzAmpel(p.bewertung);
      return `<tr><td style="white-space:nowrap">${esc(label(p.werk))}</td>
        <td>${p.art === 'modell' ? '🔀 ' : ''}${esc(p.prozess)}</td>
        <td><b>${esc(p.name)}</b>${p.geerbt ? ' <span class="ic-tag" title="Vorgabe der Konzernkachel">Vorgabe</span>' : ''}</td>
        <td style="white-space:nowrap">${p.ziel ? `${p.richtung === 'niedrig' ? '≤' : '≥'} ${esc(p.ziel)}${p.einheit ? ' ' + esc(p.einheit) : ''}` : '–'}</td>
        <td style="white-space:nowrap">${p.ist ? `<b style="color:${b.farbe}">${esc(p.ist)}${p.einheit ? ' ' + esc(p.einheit) : ''}</b>` : '<span class="field-hint">–</span>'}</td>
        <td style="white-space:nowrap">${p.stand ? esc(fmtDate(p.stand)) : '–'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="kzProzessOeffnen(${jsArg(p.art)},${jsArg(p.werk)},${jsArg(p.kachelId)})">Prozess öffnen</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

async function kzProzessOeffnen(art, werk, id) {
  if (typeof switchView === 'function') await switchView('prozesse');
  if (art === 'modell') { if (typeof openProcessAnsicht === 'function') await openProcessAnsicht(id); }
  else if (typeof lkDeepLink === 'function') await lkDeepLink(werk, id);
}

/* ── Messwert erfassen ── */

function kzWertErfassen(id) {
  const k = (_kz || []).find(x => String(x.id) === String(id));
  if (!k) return;
  openModal(`<div class="modal-header"><h3>📊 Messwert: ${esc(k.name)}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">Normalwert: ${esc(k.normalwert || 'nicht festgelegt')}${k.messung ? ' · Messung: ' + esc(k.messung) : ''}</div>
      <div class="form-grid">
        <div class="form-group"><label>Datum der Erhebung</label><input type="date" id="kz-w-datum" value="${kzHeute()}"></div>
        <div class="form-group"><label>IST-Wert${k.einheit ? ' (' + esc(k.einheit) + ')' : ''}</label><input type="text" id="kz-w-wert" inputmode="decimal" placeholder="z. B. 93,5"></div>
        <div class="form-group full"><label>Bemerkung</label><input type="text" id="kz-w-kom" placeholder="optional: Besonderheit, Quelle"></div>
      </div>
      <div class="field-hint">Gespeichert in „Kennzahlen Tracking", erhoben durch ${esc(_kzIch())}.</div>
    </div>
    <div class="modal-footer"><div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="kz-w-save" onclick="kzWertSpeichern(${jsArg(k.id)})">Speichern</button></div>`);
  setTimeout(() => { const el = document.getElementById('kz-w-wert'); if (el) el.focus(); }, 50);
}

async function kzWertSpeichern(id) {
  const datum = (document.getElementById('kz-w-datum') || {}).value || '';
  const roh = ((document.getElementById('kz-w-wert') || {}).value || '').trim();
  const bemerkung = ((document.getElementById('kz-w-kom') || {}).value || '').trim();
  if (!/^\d{4}-\d\d-\d\d$/.test(datum)) { toast('Bitte ein Datum angeben.', 'error'); return; }
  if (!roh) { toast('Bitte einen Wert eingeben.', 'error'); return; }
  const btn = document.getElementById('kz-w-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  await _kzWertSchreiben({ kennzahlId: id, datum, wert: roh, bemerkung, von: _kzIch() }, 'Messwert erfasst ✓', true);
}

async function _kzWertSchreiben(w, meldung, modal) {
  try {
    await spAddKennzahlWert(w);
    if (modal) closeModal();
    _kz = (await spGetKennzahlen()) || [];
    renderKennzahlen();
    toast(meldung, 'success');
  } catch (e) {
    const btn = document.getElementById('kz-w-save');
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    toast('Speichern fehlgeschlagen: ' + e.message, 'error', 6000);
  }
}

async function kzWertLoeschen(kid, wid) {
  if (!_kzDarfSchreiben()) return;
  if (!await uiConfirm('Diesen Messwert endgültig aus „Kennzahlen Tracking" löschen?', { title: 'Messwert löschen', okLabel: 'Löschen', danger: true })) return;
  try {
    await spDeleteKennzahlWert(wid);
    _kz = (await spGetKennzahlen()) || [];
    renderKennzahlen();
    openKennzahl(kid);
  } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 'error'); }
}

/* ── Editor (Liste „Kennzahlen") ── */

async function openKennzahl(id) {
  const src = id ? (_kz || []).find(k => String(k.id) === String(id)) : null;
  _kzEdit = src ? JSON.parse(JSON.stringify(src))
    : { id: null, name: '', typ: 'Prozess-Kennzahl', turnus: 'Quartalsweise', beschreibung: '', einheit: 'Prozentsatz', team: null,
        umfang: '', zweck: '', normalwert: '', bereiche: [], archiv: false, messung: '', standorte: [], werte: [] };
  renderKennzahlEditor();
  if (typeof spHausNachschlagen === 'function' && (!_kzTeams || !_kzStandorte)) {
    try { _kzTeams = _kzTeams || await spHausNachschlagen('teams'); _kzStandorte = _kzStandorte || await spHausNachschlagen('standorte'); }
    catch (e) { _kzTeams = _kzTeams || []; _kzStandorte = _kzStandorte || []; }
    if (_kzEdit) renderKennzahlEditor();
  }
}

function kzListeUmschalten(feld, id, wert, an) {
  const l = _kzEdit[feld] || (_kzEdit[feld] = []);
  const i = l.findIndex(x => String(x.id) === String(id));
  if (an && i < 0) l.push({ id: String(id), wert });
  if (!an && i >= 0) l.splice(i, 1);
}

function renderKennzahlEditor() {
  const k = _kzEdit;
  const schreiben = _kzDarfSchreiben();
  const luecken = kzLuecken(k);
  const soll = kzSollVon(k);
  const sel = (feld, werte, leer) => `<select onchange="_kzEdit.${feld}=this.value;renderKennzahlEditor()">
      ${leer !== undefined ? `<option value="">${esc(leer)}</option>` : ''}
      ${werte.map(x => `<option value="${esc(x)}"${k[feld] === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  const haken = (feld, liste) => (liste || []).map(t => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${(k[feld] || []).some(x => String(x.id) === t.id) ? 'checked' : ''}
      onchange="kzListeUmschalten(${jsArg(feld)},${jsArg(t.id)},${jsArg(t.wert)},this.checked)"> ${esc(t.wert)}</label>`).join('') || '<span class="field-hint">Lade …</span>';
  const werte = (k.werte || []).slice().reverse();
  openModal(`
    <div class="modal-header">
      <h3>📊 ${k.id ? 'Kennzahl bearbeiten' : 'Neue Kennzahl'}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">Liste „Kennzahlen" · ISO 27001 9.1: was, wie, wann, wer</div>
      ${luecken.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Für 9.1 fehlt noch:</b>
        <ul style="margin:6px 0 0 18px;padding:0">${luecken.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="form-grid">
        <div class="form-group full"><label>Kennzahl <span class="req">*</span></label>
          <input type="text" value="${esc(k.name)}" oninput="_kzEdit.name=this.value" placeholder="z. B. Patch-Quote Server innerhalb von 14 Tagen"></div>
        <div class="form-group full"><label>Beschreibung</label><textarea oninput="_kzEdit.beschreibung=this.value">${esc(k.beschreibung)}</textarea></div>
        <div class="form-group"><label>Kennzahl-Typ</label>${sel('typ', KZ_TYPEN, '– wählen –')}</div>
        <div class="form-group"><label>Turnus</label>${sel('turnus', KZ_TURNUS.map(t => t.key), '– wählen –')}</div>
        <div class="form-group"><label>Einheit</label>${sel('einheit', KZ_EINHEITEN, '– wählen –')}</div>
        <div class="form-group"><label>Verantwortlich</label>
          <select onchange="_kzEdit.team=this.value?{id:this.value,wert:this.options[this.selectedIndex].text}:null">
            <option value="">– kein Team –</option>
            ${(_kzTeams || []).map(t => `<option value="${esc(t.id)}"${k.team && String(k.team.id) === t.id ? ' selected' : ''}>${esc(t.wert)}</option>`).join('')}
          </select></div>
        <div class="form-group full"><label>Normalwert</label>
          <input type="text" value="${esc(k.normalwert)}" oninput="_kzEdit.normalwert=this.value" onchange="renderKennzahlEditor()" placeholder="z. B. &lt;= 5 offene Maßnahmen oder Grün: &gt; 90%, Gelb: 70-90%, Rot: &lt; 70%">
          <div class="field-hint">${soll ? (soll.art === 'ampel'
            ? `Gelesen als Ampel: grün ${esc(soll.gruen.op)} ${esc(kzZahlText(soll.gruen.wert))}${soll.rot ? `, rot ${esc(soll.rot.op)} ${esc(kzZahlText(soll.rot.wert))}` : ''}`
            : `Gelesen als Grenze: ${esc(soll.op)} ${esc(kzZahlText(soll.wert))}`) : 'Ohne erkennbare Grenze bleibt die Ampel offen.'}</div></div>
        <div class="form-group full"><label>Messung</label>
          <input type="text" value="${esc(k.messung)}" oninput="_kzEdit.messung=this.value" placeholder="Wie wird gemessen und gerechnet?"></div>
        <div class="form-group"><label>Zweck</label><input type="text" value="${esc(k.zweck)}" oninput="_kzEdit.zweck=this.value"></div>
        <div class="form-group"><label>Umfang</label><input type="text" value="${esc(k.umfang)}" oninput="_kzEdit.umfang=this.value"></div>
        <div class="form-group full"><label>Betroffener Bereich</label><div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:4px">${haken('bereiche', _kzTeams)}</div></div>
        <div class="form-group full"><label>Standort</label><div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:4px">${haken('standorte', _kzStandorte)}</div></div>
        <div class="form-group full"><label class="ack-check" style="font-weight:500"><input type="checkbox" ${k.archiv ? 'checked' : ''} onchange="_kzEdit.archiv=this.checked"> Archiv</label></div>
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Messwerte (Kennzahlen Tracking)</div>
        ${werte.length ? `<div style="margin-bottom:8px">${_kzVerlaufSvg(k)}</div>
          <table class="tbl" style="font-size:.8rem;width:100%"><thead><tr><th>Datum</th><th>IST-Wert</th><th>Ampel</th><th>Bemerkung</th><th>Erhoben durch</th><th></th></tr></thead>
          <tbody>${werte.map(w => {
            const b = _kzAmpel(kzBewertung(k, w.wert));
            return `<tr><td>${esc(fmtDate(w.datum))}</td><td><b>${esc(_kzWertText(k, w))}</b></td><td style="color:${b.farbe}">${esc(b.text)}</td>
              <td>${esc(w.bemerkung || '')}</td><td style="color:var(--c-muted)">${esc(w.von || '')}</td>
              <td>${schreiben && k.id ? `<button class="btn btn-ghost btn-sm" onclick="kzWertLoeschen(${jsArg(k.id)},${jsArg(w.id)})" title="Messwert löschen">✕</button>` : ''}</td></tr>`;
          }).join('')}</tbody></table>` : '<div class="field-hint">Noch kein Messwert. In der Liste mit „+ Wert" erfassen.</div>'}
      </div>
    </div>
    <div class="modal-footer">
      ${k.id && schreiben ? `<button class="btn btn-ghost btn-sm" onclick="kzLoeschen(${jsArg(k.id)})" style="color:#b91c1c">Löschen</button>` : ''}
      <div style="flex:1"></div>
      ${schreiben ? `<button class="btn btn-primary" id="kz-save" onclick="kzSpeichern()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

async function kzSpeichern() {
  if (!_kzDarfSchreiben()) { toast('Nur Lesezugriff auf die Kennzahlen.', 'error'); return; }
  const k = _kzEdit;
  if (!String(k.name || '').trim()) { toast('Bitte die Kennzahl benennen.', 'error'); return; }
  const btn = document.getElementById('kz-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    k.id = await spSaveKennzahl(k);
    closeModal();
    _kz = (await spGetKennzahlen()) || [];
    renderKennzahlen();
    toast('Gespeichert ✓', 'success');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    toast('Speichern fehlgeschlagen: ' + e.message, 'error', 6000);
  }
}

async function kzLoeschen(id) {
  if (!_kzDarfSchreiben()) return;
  const k = (_kz || []).find(x => String(x.id) === String(id));
  if (!k) return;
  if (!await uiConfirm(`Kennzahl „${k.name}" endgültig aus der Liste löschen? Ihre ${k.werte.length} Messwert(e) in „Kennzahlen Tracking" verlieren den Bezug. „Archiv" behält beides.`,
    { title: 'Kennzahl löschen', okLabel: 'Endgültig löschen', danger: true })) return;
  try {
    await spDeleteKennzahl(id);
    closeModal();
    _kz = (await spGetKennzahlen()) || [];
    renderKennzahlen();
  } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 'error'); }
}

/** Für den Deep-Link ?ansicht=kennzahlen&kennzahl=ID. */
async function kzDeepLink(id) {
  for (let i = 0; i < 60 && !_kz; i++) await new Promise(r => setTimeout(r, 150));
  if (!_kz) return;
  if (!_kz.some(k => String(k.id) === String(id))) { toast('Die Kennzahl aus dem Link gibt es nicht mehr.'); return; }
  openKennzahl(id);
}
