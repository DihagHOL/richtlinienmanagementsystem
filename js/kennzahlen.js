'use strict';

/**
 * Reiter „Kennzahlen" (ISO 27001 9.1 · IMS-8.1 Kennzahlen)
 * ========================================================
 * Drei Teile:
 *   1. das Register: Kennzahlen mit Sollwert, Intervall, Methode und ihren
 *      Messwerten (Liste „Kennzahlen" auf der ISMS-Site),
 *   2. was das RMS selbst misst (aus den Metriken des Audit Reports) – zum
 *      Übernehmen in eine Kennzahl, statt es abzuschreiben,
 *   3. die Kennzahlen der Prozesse aus Landkarte und Modellen, nur zur Ansicht.
 * Gerechnet wird in js/kennzahlmodell.js.
 */

let _kz = null;            // Kennzahlen (Register)
let _kzZiele = null;       // Ziele (welche Ziele eine Kennzahl misst)
let _kzLaedt = false;
let _kzFilter = { q: '', bereich: '', status: '', werk: '' };
let _kzEdit = null;
let _kzMembers = null;
let _kzMetriken = null;    // Ergebnis von _clevelGather (auf Knopfdruck)
let _kzMisst = false;
let _kzProzesse = null;    // Prozesskennzahlen (aus Landkarte und Modellen)

function _kzDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('kennzahlen'); }
function _kzWerke() { return (typeof STANDORTE !== 'undefined') ? STANDORTE : []; }
function _kzBereiche() { return (typeof MN_BEREICHE !== 'undefined') ? MN_BEREICHE : [{ key: 'isms', label: 'Informationssicherheit' }]; }
function _kzBereichLabel(k) { return (_kzBereiche().find(b => b.key === k) || {}).label || k || ''; }
function _kzIch() { return (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : ''; }

function _kzSichtbar(liste) {
  if (typeof geltungSichtbar !== 'function') return liste;
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return liste.filter(k => geltungSichtbar(k.werke, upn));
}

/* ── Laden ── */

async function initKennzahlen() {
  const mount = document.getElementById('kennzahlen-mount');
  if (!mount) return;
  if (_kz) { renderKennzahlen(); return; }
  if (_kzLaedt) return;
  _kzLaedt = true;
  mount.innerHTML = '<div class="doc-loading">Lade Kennzahlen …</div>';
  try {
    const [liste, ziele] = await Promise.all([
      spGetKennzahlen(),
      (typeof spGetZieleLeise === 'function') ? spGetZieleLeise().catch(() => []) : [],
    ]);
    _kz = (liste || []).map(kzNormal); _kzZiele = ziele || [];
  } catch (e) {
    _kzLaedt = false;
    const isms = (typeof spIsmsSiteUrl === 'function') ? spIsmsSiteUrl() : 'https://dihag.sharepoint.com/sites/ISMS';
    mount.innerHTML = `<div class="col-warning" style="display:block"><b>Kennzahlen nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:10px">Die Liste „Kennzahlen" liegt auf der <b>ISMS-Site</b>
      <a href="${esc(sichereUrl(isms))}" target="_blank" rel="noopener">${esc(isms)}</a> und wird beim ersten Zugriff angelegt;
      dafür braucht Ihr Konto dort das Recht, Listen zu erstellen.</div></div>`;
    return;
  }
  _kzLaedt = false;
  renderKennzahlen();
  _kzProzesseLaden();
}

async function refreshKennzahlen() {
  _kz = null; _kzZiele = null; _kzProzesse = null; _kzMetriken = null;
  await initKennzahlen();
  toast('Kennzahlen aktualisiert', 'success');
}

/* ── Darstellung ── */

function _kzZieleVon(id) {
  return (_kzZiele || []).filter(z => (z.kennzahlIds || []).map(String).includes(String(id)));
}

function _kzAmpel(b) {
  return { erfuellt: { farbe: '#15803d', text: 'im Ziel' }, verfehlt: { farbe: '#b91c1c', text: 'verfehlt' }, offen: { farbe: '#6b7280', text: 'offen' } }[b];
}

function _kzVerlaufSvg(k) {
  const v = kzVerlauf(k, 110, 26);
  if (!v.pfad) return '<span class="field-hint">–</span>';
  return `<svg width="110" height="26" viewBox="0 0 110 26" aria-hidden="true">
    ${v.soll !== null ? `<line x1="0" x2="110" y1="${v.soll}" y2="${v.soll}" stroke="#94a3b8" stroke-dasharray="3 3" stroke-width="1"/>` : ''}
    <path d="${v.pfad}" fill="none" stroke="#17509e" stroke-width="1.8"/>
    ${v.punkte.length ? `<circle cx="${v.punkte[v.punkte.length - 1].x}" cy="${v.punkte[v.punkte.length - 1].y}" r="2.4" fill="#17509e"/>` : ''}</svg>`;
}

function _kzZeile(k) {
  const l = kzLetzter(k);
  const b = _kzAmpel(kzBewertung(k));
  const t = kzTrend(k);
  const n = kzNaechsteMessung(k);
  const luecken = kzLuecken(k);
  const ziele = _kzZieleVon(k.id);
  return `<tr onclick="openKennzahl(${jsArg(k.id)})" style="cursor:pointer${k.status === 'stillgelegt' ? ';opacity:.55' : ''}">
    <td style="white-space:nowrap;color:var(--c-muted)">${esc(k.nr || '')}</td>
    <td><b>${esc(k.name)}</b>${k.automatik ? ' <span class="ic-tag" title="Der Wert kommt aus dem RMS">⚙ Automatik</span>' : ''}
      ${k.verwendung ? `<div style="font-size:.7rem;color:var(--c-faint)">${esc(k.verwendung)}</div>` : ''}
      ${ziele.length ? `<div style="font-size:.7rem;color:var(--c-faint)">🎯 ${ziele.map(z => esc((z.nr ? z.nr + ' ' : '') + z.titel)).join(', ')}</div>` : ''}</td>
    <td style="white-space:nowrap">${esc(kzSollText(k) || '–')}</td>
    <td style="white-space:nowrap">${l ? `<b style="color:${b.farbe}">${esc(kzZahlText(l.wert))}${k.einheit ? ' ' + esc(k.einheit) : ''}</b>
      <div style="font-size:.7rem;color:var(--c-faint)">${esc(fmtDate(l.datum))}</div>` : '<span class="field-hint">kein Wert</span>'}</td>
    <td style="white-space:nowrap">${t === 'besser' ? '<span style="color:#15803d" title="besser als zuvor">▲ besser</span>'
      : t === 'schlechter' ? '<span style="color:#b91c1c" title="schlechter als zuvor">▼ schlechter</span>' : t === 'gleich' ? '<span class="field-hint">= gleich</span>' : ''}</td>
    <td>${_kzVerlaufSvg(k)}</td>
    <td style="white-space:nowrap">${esc((kzIntervallInfo(k.intervall) || {}).label || '–')}
      ${n ? `<div style="font-size:.7rem;${n.faellig ? 'color:#b91c1c;font-weight:700' : 'color:var(--c-faint)'}">${n.faellig ? 'Messung fällig' : 'nächste ' + esc(fmtDate(n.datum))}</div>` : ''}</td>
    <td style="color:var(--c-muted)">${esc(k.verantwortlich || '–')}</td>
    <td>${luecken.length ? `<span title="${esc(luecken.join(' · '))}" style="color:#b45309;font-weight:600">${luecken.length} offen</span>` : '<span style="color:#15803d;font-weight:600">✓</span>'}</td>
    <td onclick="event.stopPropagation()">${_kzDarfSchreiben() && k.status !== 'stillgelegt' ? `<button class="btn btn-outline btn-sm" onclick="kzWertErfassen(${jsArg(k.id)})">+ Wert</button>` : ''}</td>
  </tr>`;
}

function renderKennzahlen() {
  const mount = document.getElementById('kennzahlen-mount');
  if (!mount) return;
  if (!_kz) { if (!_kzLaedt) initKennzahlen(); return; }
  const schreiben = _kzDarfSchreiben();
  const alle = _kzSichtbar(_kz);
  const s = kzKennzahlen(alle);
  const f = _kzFilter;
  const q = f.q.toLowerCase();
  const liste = alle.filter(k => (!q || `${k.nr} ${k.name} ${k.beschreibung} ${k.verantwortlich} ${k.datenquelle}`.toLowerCase().includes(q))
    && (!f.bereich || k.bereich === f.bereich) && (!f.status || k.status === f.status)
    && (!f.werk || !(k.werke || []).length || k.werke.includes(f.werk)))
    .sort((a, b) => Number(a.status === 'stillgelegt') - Number(b.status === 'stillgelegt') || a.nr.localeCompare(b.nr, 'de', { numeric: true }) || a.name.localeCompare(b.name, 'de'));
  const fehlend = (typeof spMissingKennzahlenColumns === 'function') ? spMissingKennzahlenColumns() : [];
  const kachel = (n, label, farbe) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${farbe}">${n}</div><div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Kennzahlen nach <b>ISO 27001 9.1</b>: was gemessen wird, wie, wie oft, von wem, und was dabei herauskam.
      Jede Kennzahl führt ihre Messwerte mit Datum; daraus ergeben sich Ampel, Trend und die nächste fällige Messung.
      Was das RMS selbst misst, lässt sich unten übernehmen. Die Kennzahlen der Prozesse stehen am Prozess und werden hier mit angezeigt.
    </div>
    ${fehlend.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>⚠ In der Liste „Kennzahlen" fehlen ${fehlend.length} Spalte(n):</b> ${fehlend.map(esc).join(' · ')}</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kachel(s.gesamt, 'Kennzahlen geführt', '#17509e')}
      ${kachel(s.erfuellt, 'im Ziel', '#15803d')}
      ${kachel(s.verfehlt, 'verfehlt', s.verfehlt ? '#b91c1c' : '#15803d')}
      ${kachel(s.messungFaellig, 'Messung fällig', s.messungFaellig ? '#b45309' : '#15803d')}
      ${kachel(s.ohneSoll, 'ohne Sollwert', s.ohneSoll ? '#b45309' : '#15803d')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen …" value="${esc(f.q)}" oninput="_kzFilter.q=this.value;renderKennzahlen()" style="width:200px">
      <select class="sort-select" onchange="_kzFilter.bereich=this.value;renderKennzahlen()">
        <option value="">alle Bereiche</option>
        ${_kzBereiche().map(b => `<option value="${esc(b.key)}"${f.bereich === b.key ? ' selected' : ''}>${esc(b.label)}</option>`).join('')}</select>
      <select class="sort-select" onchange="_kzFilter.status=this.value;renderKennzahlen()">
        <option value="">alle Status</option>
        ${KZ_STATUS.map(x => `<option value="${x.key}"${f.status === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
      <select class="sort-select" onchange="_kzFilter.werk=this.value;renderKennzahlen()">
        <option value="">alle Werke</option>
        ${_kzWerke().map(w => `<option value="${esc(w)}"${f.werk === w ? ' selected' : ''}>${esc(w)}</option>`).join('')}</select>
      <div style="flex:1"></div>
      ${schreiben ? `<button class="btn btn-primary btn-sm" onclick="openKennzahl(null)">+ Kennzahl</button>` : ''}
    </div>
    ${schreiben ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf die Kennzahlen.</div>'}
    ${liste.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
      <thead><tr><th>Nr</th><th>Kennzahl</th><th>Soll</th><th>Letzter Wert</th><th>Trend</th><th>Verlauf</th><th>Intervall</th><th>Verantwortlich</th><th>Nachweis</th><th></th></tr></thead>
      <tbody>${liste.map(_kzZeile).join('')}</tbody></table></div>`
      : emptyState(alle.length ? 'Keine Treffer für die aktuelle Filterung.' : 'Noch keine Kennzahl im Register. Unten steht, was das RMS schon misst.', alle.length ? '🔍' : '📊')}
    <div id="kz-automatik" style="margin-top:28px">${_kzAutomatikHtml()}</div>
    <div id="kz-prozesse" style="margin-top:28px">${_kzProzesseHtml()}</div>`;
}

/* ── Vom RMS gemessen ── */

function _kzAutomatikHtml() {
  const schreiben = _kzDarfSchreiben();
  const kopf = `<h3 style="margin:0 0 6px;font-size:1.05rem">Vom RMS gemessen</h3>
    <div class="view-desc" style="margin:0 0 10px">Werte, die im RMS ohnehin entstehen, aus denselben Daten wie der Audit Report.
      Eine Kennzahl mit „Automatik" übernimmt sie mit einem Klick, mit Datum und als automatisch gekennzeichnet.
      <button class="btn btn-ghost btn-sm" onclick="kzJetztMessen()" ${_kzMisst ? 'disabled' : ''}>${_kzMisst ? 'Misst …' : (_kzMetriken ? '↻ Neu messen' : '▶ Jetzt messen')}</button></div>`;
  if (!_kzMetriken) return kopf + `<div class="field-hint">${_kzMisst ? 'Die Register werden gelesen, das dauert einen Moment.' : 'Noch nicht gemessen. „Jetzt messen" liest alle Register einmal durch.'}</div>`;
  const zeilen = KZ_AUTOMATIK.map(a => {
    const wert = kzAutomatikWert(a.key, _kzMetriken);
    const geführt = (_kz || []).find(k => k.automatik === a.key && k.status !== 'stillgelegt');
    const b = _kzAmpel(kzBewertung({ ziel: geführt ? geführt.ziel : a.ziel, richtung: a.richtung, werte: [] }, wert));
    return `<tr><td><b>${esc(a.label)}</b><div style="font-size:.7rem;color:var(--c-faint)">${esc(a.norm)}</div></td>
      <td style="white-space:nowrap">${wert === null ? '<span class="field-hint">nicht messbar</span>' : `<b style="color:${b.farbe}">${esc(kzZahlText(wert))} ${esc(a.einheit === 'Anzahl' ? '' : a.einheit)}</b>`}</td>
      <td style="white-space:nowrap">${esc(kzSollText({ ziel: geführt ? geführt.ziel : a.ziel, richtung: a.richtung, einheit: a.einheit === 'Anzahl' ? '' : a.einheit }))}</td>
      <td>${geführt ? `<span class="field-hint">als ${esc(geführt.nr || geführt.name)} geführt</span>` : ''}</td>
      <td style="white-space:nowrap">${!schreiben || wert === null ? ''
        : geführt ? `<button class="btn btn-outline btn-sm" onclick="kzAutomatikUebernehmen(${jsArg(geführt.id)})">Wert übernehmen</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="kzAutomatikFuehren(${jsArg(a.key)})">Als Kennzahl führen</button>`}</td></tr>`;
  }).join('');
  const offen = (_kz || []).filter(k => k.automatik && k.status === 'aktiv' && kzAutomatikWert(k.automatik, _kzMetriken) !== null
    && !(k.werte.length && k.werte[k.werte.length - 1].datum === kzHeute()));
  return kopf + `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Messgröße</th><th>Wert heute</th><th>Soll</th><th>Register</th><th></th></tr></thead><tbody>${zeilen}</tbody></table></div>
    ${schreiben && offen.length ? `<div style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="kzAutomatikAlleUebernehmen()">Alle ${offen.length} geführten Werte übernehmen</button></div>` : ''}
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

/** Einen Messwert anhängen (eine Messung je Tag: derselbe Tag ersetzt). */
function _kzWertAnhaengen(k, datum, wert, kommentar, automatik) {
  const w = (k.werte || []).filter(x => x.datum !== datum);
  w.push(Object.assign({ datum, wert, kommentar: kommentar || '', von: _kzIch() }, automatik ? { automatik: true } : {}));
  k.werte = w.sort((a, b) => a.datum.localeCompare(b.datum));
}

async function kzAutomatikUebernehmen(id) {
  const k = JSON.parse(JSON.stringify((_kz || []).find(x => String(x.id) === String(id)) || null));
  if (!k) return;
  const wert = kzAutomatikWert(k.automatik, _kzMetriken);
  if (wert === null) { toast('Für diese Kennzahl liegt gerade kein Wert vor.', 'error'); return; }
  _kzWertAnhaengen(k, kzHeute(), wert, 'vom RMS gemessen', true);
  _kzVermerk(k, `Wert ${kzZahlText(wert)} übernommen (Automatik)`);
  await _kzSchreiben(k, 'Wert übernommen ✓', false);
}

async function kzAutomatikAlleUebernehmen() {
  const heute = kzHeute();
  const ziele = (_kz || []).filter(k => k.automatik && k.status === 'aktiv' && kzAutomatikWert(k.automatik, _kzMetriken) !== null
    && !(k.werte.length && k.werte[k.werte.length - 1].datum === heute));
  let n = 0;
  for (const src of ziele) {
    const k = JSON.parse(JSON.stringify(src));
    const wert = kzAutomatikWert(k.automatik, _kzMetriken);
    _kzWertAnhaengen(k, heute, wert, 'vom RMS gemessen', true);
    _kzVermerk(k, `Wert ${kzZahlText(wert)} übernommen (Automatik)`);
    try { await spUpdateKennzahl(k.id, k); n++; } catch (e) { toast(`${k.name}: ${e.message}`, 'error'); }
  }
  _kz = ((await spGetKennzahlen()) || []).map(kzNormal);
  renderKennzahlen();
  toast(`${n} Wert(e) übernommen ✓`, 'success');
}

function kzAutomatikFuehren(key) {
  const a = kzAutomatikInfo(key);
  if (!a) return;
  _kzEdit = kzNormal({ nr: kzNaechsteNr(_kz || []), name: a.label, einheit: a.einheit === 'Anzahl' ? 'Anzahl' : a.einheit, richtung: a.richtung,
    ziel: a.ziel, intervall: 'monatlich', automatik: key, datenquelle: 'RMS (automatisch)', methode: `Vom RMS gemessen, dieselbe Grundlage wie im Audit Report (${a.norm}).`,
    verantwortlich: (typeof State !== 'undefined' && State.user) ? State.user.upn : '', verwendung: 'Management Review', status: 'aktiv', bereich: 'isms' });
  _kzMitarbeiterLaden();
  renderKennzahlEditor();
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
    let modelle = [];
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
    <thead><tr><th>Werk</th><th>Prozess</th><th>Kennzahl</th><th>Soll</th><th>Ist</th><th>Stand</th><th></th></tr></thead>
    <tbody>${_kzProzesse.map(p => {
      const b = _kzAmpel(p.bewertung);
      return `<tr><td style="white-space:nowrap">${esc(label(p.werk))}</td>
        <td>${p.art === 'modell' ? '🔀 ' : ''}${esc(p.prozess)}</td>
        <td><b>${esc(p.name)}</b>${p.geerbt ? ' <span class="ic-tag" title="Vorgabe der Konzernkachel">Vorgabe</span>' : ''}</td>
        <td style="white-space:nowrap">${esc(kzSollText({ ziel: p.ziel, richtung: p.richtung, einheit: p.einheit }) || '–')}</td>
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

/* ── Wert erfassen ── */

function kzWertErfassen(id) {
  const k = (_kz || []).find(x => String(x.id) === String(id));
  if (!k) return;
  openModal(`<div class="modal-header"><h3>📊 Wert erfassen: ${esc(k.name)}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">Soll ${esc(kzSollText(k) || 'nicht festgelegt')}${k.methode ? ' · ' + esc(k.methode) : ''}</div>
      <div class="form-grid">
        <div class="form-group"><label>Datum der Messung</label><input type="date" id="kz-w-datum" value="${kzHeute()}"></div>
        <div class="form-group"><label>Wert${k.einheit ? ' (' + esc(k.einheit) + ')' : ''}</label><input type="text" id="kz-w-wert" inputmode="decimal" placeholder="z. B. 93,5"></div>
        <div class="form-group full"><label>Kommentar</label><input type="text" id="kz-w-kom" placeholder="optional: Besonderheit, Quelle"></div>
      </div>
    </div>
    <div class="modal-footer"><div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="kz-w-save" onclick="kzWertSpeichern(${jsArg(k.id)})">Speichern</button></div>`);
  setTimeout(() => { const el = document.getElementById('kz-w-wert'); if (el) el.focus(); }, 50);
}

async function kzWertSpeichern(id) {
  const src = (_kz || []).find(x => String(x.id) === String(id));
  if (!src) return;
  const datum = (document.getElementById('kz-w-datum') || {}).value || '';
  const wert = kzZahl((document.getElementById('kz-w-wert') || {}).value);
  const kom = ((document.getElementById('kz-w-kom') || {}).value || '').trim();
  if (!/^\d{4}-\d\d-\d\d$/.test(datum)) { toast('Bitte ein Datum angeben.', 'error'); return; }
  if (wert === null) { toast('Bitte eine Zahl eingeben.', 'error'); return; }
  const k = JSON.parse(JSON.stringify(src));
  _kzWertAnhaengen(k, datum, wert, kom, false);
  _kzVermerk(k, `Wert ${kzZahlText(wert)} vom ${datum.split('-').reverse().join('.')} erfasst`);
  const btn = document.getElementById('kz-w-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  await _kzSchreiben(k, 'Wert erfasst ✓', true);
}

/* ── Editor ── */

function _kzMitarbeiterLaden() {
  if (_kzMembers || typeof spGetMembers !== 'function') return;
  spGetMembers().then(m => {
    _kzMembers = m;
    const dl = document.getElementById('kz-people');
    if (dl) dl.innerHTML = m.map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('');
  }).catch(() => { _kzMembers = []; });
}

function openKennzahl(id) {
  const src = id ? (_kz || []).find(k => String(k.id) === String(id)) : null;
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  _kzEdit = src ? JSON.parse(JSON.stringify(src))
    : kzNormal({ nr: kzNaechsteNr(_kz || []), verantwortlich: upn, status: 'aktiv', bereich: 'isms', intervall: 'quartal' });
  _kzMitarbeiterLaden();
  renderKennzahlEditor();
}

function kzWerkUmschalten(code, an) {
  const w = _kzEdit.werke || (_kzEdit.werke = []);
  const i = w.indexOf(code);
  if (an && i < 0) w.push(code);
  if (!an && i >= 0) w.splice(i, 1);
}

function kzWertWeg(i) {
  (_kzEdit.werte || []).splice(i, 1);
  renderKennzahlEditor();
}

function renderKennzahlEditor() {
  const k = _kzEdit;
  const schreiben = _kzDarfSchreiben();
  const luecken = kzLuecken(k);
  const ziele = k.id ? _kzZieleVon(k.id) : [];
  const verlauf = (k.historie || []).slice().reverse().slice(0, 20).map(h =>
    `<div style="font-size:.75rem;color:var(--c-muted);padding:2px 0">${fmtDateTime(h.datum)} · <b>${esc(h.wer || '')}</b> · ${esc(h.aktion || '')}</div>`).join('');
  const werte = (k.werte || []).slice().reverse();
  openModal(`
    <div class="modal-header">
      <h3>📊 ${k.id ? 'Kennzahl ' + esc(k.nr || '') : 'Neue Kennzahl ' + esc(k.nr || '')}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">ISO 27001 9.1: was, wie, wann, wer, und wann ausgewertet wird</div>
      ${luecken.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Für 9.1 fehlt noch:</b>
        <ul style="margin:6px 0 0 18px;padding:0">${luecken.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="form-grid">
        <div class="form-group"><label>Nr.</label><input type="text" value="${esc(k.nr)}" oninput="_kzEdit.nr=this.value" placeholder="K-01"></div>
        <div class="form-group"><label>Status</label>
          <select onchange="_kzEdit.status=this.value">${KZ_STATUS.map(s => `<option value="${s.key}"${k.status === s.key ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></div>
        <div class="form-group full"><label>Kennzahl <span class="req">*</span></label>
          <input type="text" value="${esc(k.name)}" oninput="_kzEdit.name=this.value" placeholder="z. B. Patch-Quote Server innerhalb von 14 Tagen"></div>
        <div class="form-group full"><label>Beschreibung</label>
          <textarea oninput="_kzEdit.beschreibung=this.value" placeholder="Was sagt die Kennzahl aus?">${esc(k.beschreibung)}</textarea></div>
        <div class="form-group"><label>Bereich des IMS</label>
          <select onchange="_kzEdit.bereich=this.value">${_kzBereiche().map(x => `<option value="${esc(x.key)}"${k.bereich === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Einheit</label><input type="text" value="${esc(k.einheit)}" oninput="_kzEdit.einheit=this.value" placeholder="%, Tage, Anzahl, kWh/t"></div>
        <div class="form-group"><label>Richtung</label>
          <select onchange="_kzEdit.richtung=this.value">${KZ_RICHTUNG.map(r => `<option value="${r.key}"${k.richtung === r.key ? ' selected' : ''}>${esc(r.label)} (${esc(r.zeichen)})</option>`).join('')}</select></div>
        <div class="form-group"><label>Sollwert</label><input type="text" value="${esc(k.ziel)}" oninput="_kzEdit.ziel=this.value" inputmode="decimal" placeholder="z. B. 95"></div>
        <div class="form-group"><label>Erhebungsintervall</label>
          <select onchange="_kzEdit.intervall=this.value"><option value="">– wählen –</option>
            ${KZ_INTERVALLE.map(i => `<option value="${i.key}"${k.intervall === i.key ? ' selected' : ''}>${esc(i.label)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Verantwortlich</label>
          <input type="text" list="kz-people" value="${esc(k.verantwortlich)}" oninput="_kzEdit.verantwortlich=this.value">
          <datalist id="kz-people">${(_kzMembers || []).map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join('')}</datalist></div>
        <div class="form-group"><label>Datenquelle</label><input type="text" value="${esc(k.datenquelle)}" oninput="_kzEdit.datenquelle=this.value" placeholder="z. B. WSUS-Bericht, Ticketsystem"></div>
        <div class="form-group"><label>Verwendung in</label><input type="text" value="${esc(k.verwendung)}" oninput="_kzEdit.verwendung=this.value" placeholder="z. B. Management Review, Monatsbericht"></div>
        <div class="form-group full"><label>Methode der Messung</label>
          <textarea oninput="_kzEdit.methode=this.value" placeholder="Wie wird gemessen und gerechnet? So, dass zwei Personen auf dasselbe Ergebnis kommen.">${esc(k.methode)}</textarea></div>
        <div class="form-group"><label>Automatik</label>
          <select onchange="_kzEdit.automatik=this.value"><option value="">– von Hand erfasst –</option>
            ${KZ_AUTOMATIK.map(a => `<option value="${a.key}"${k.automatik === a.key ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select>
          <div class="field-hint">Mit Automatik übernimmt „Vom RMS gemessen" den Wert.</div></div>
        <div class="form-group full"><label>Geltung (Werke)</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:6px">
            ${_kzWerke().map(x => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${(k.werke || []).includes(x) ? 'checked' : ''}
              onchange="kzWerkUmschalten(${jsArg(x)},this.checked)"> ${esc(x)}</label>`).join('')}
          </div><div class="field-hint">Kein Haken = konzernweit.</div></div>
      </div>
      ${ziele.length ? `<div class="field-hint" style="margin-top:10px">🎯 Misst: ${ziele.map(z => esc((z.nr ? z.nr + ' ' : '') + z.titel)).join(', ')}</div>` : ''}
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Messwerte</div>
        ${werte.length ? `<div style="margin-bottom:8px">${_kzVerlaufSvg(k)}</div>
          <table class="tbl" style="font-size:.8rem;width:100%"><thead><tr><th>Datum</th><th>Wert</th><th>Bewertung</th><th>Kommentar</th><th>Erfasst von</th><th></th></tr></thead>
          <tbody>${werte.map((w) => {
            const i = (k.werte || []).indexOf(w);
            const b = _kzAmpel(kzBewertung(k, w.wert));
            return `<tr><td>${esc(fmtDate(w.datum))}</td><td><b>${esc(kzZahlText(w.wert))}</b>${k.einheit ? ' ' + esc(k.einheit) : ''}</td>
              <td style="color:${b.farbe}">${esc(b.text)}</td><td>${esc(w.kommentar || '')}${w.automatik ? ' ⚙' : ''}</td><td style="color:var(--c-muted)">${esc(w.von || '')}</td>
              <td>${schreiben ? `<button class="btn btn-ghost btn-sm" onclick="kzWertWeg(${i})" title="Wert entfernen">✕</button>` : ''}</td></tr>`;
          }).join('')}</tbody></table>` : '<div class="field-hint">Noch kein Messwert. Werte erfassen Sie in der Liste mit „+ Wert".</div>'}
      </div>
      ${verlauf ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Verlauf</div>${verlauf}</div>` : ''}
    </div>
    <div class="modal-footer">
      ${k.id && schreiben ? `<button class="btn btn-ghost btn-sm" onclick="kzLoeschen(${jsArg(k.id)})" style="color:#b91c1c">Löschen</button>` : ''}
      <div style="flex:1"></div>
      ${schreiben ? `<button class="btn btn-primary" id="kz-save" onclick="kzSpeichern()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

function _kzVermerk(k, aktion) {
  (k.historie = k.historie || []).push({ datum: new Date().toISOString(), wer: _kzIch(), aktion });
}

async function kzSpeichern() {
  if (!_kzDarfSchreiben()) { toast('Nur Lesezugriff auf die Kennzahlen.', 'error'); return; }
  const k = _kzEdit;
  if (!String(k.name || '').trim()) { toast('Bitte die Kennzahl benennen.', 'error'); return; }
  if (k.ziel && kzZahl(k.ziel) === null) { toast('Der Sollwert muss eine Zahl sein.', 'error'); return; }
  _kzVermerk(k, k.id ? 'geändert' : 'angelegt');
  await _kzSchreiben(k, 'Gespeichert ✓', true);
}

async function _kzSchreiben(k, meldung, modal) {
  const btn = document.getElementById('kz-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    if (k.id) await spUpdateKennzahl(k.id, k);
    else k.id = await spAddKennzahl(k);
    if (modal) closeModal();
    _kz = ((await spGetKennzahlen()) || []).map(kzNormal);
    renderKennzahlen();
    toast(meldung, 'success');
  } catch (e) {
    (k.historie || []).pop();
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    const b2 = document.getElementById('kz-w-save');
    if (b2) { b2.disabled = false; b2.textContent = 'Speichern'; }
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

async function kzLoeschen(id) {
  if (!_kzDarfSchreiben()) return;
  const k = (_kz || []).find(x => String(x.id) === String(id));
  if (!k) return;
  const ziele = _kzZieleVon(id).length;
  if (!await uiConfirm(`Kennzahl „${k.name}" mit ${k.werte.length} Messwert(en) endgültig löschen?${ziele ? ` ${ziele} Ziel(e) messen damit.` : ''} „Stillgelegt" behält den Verlauf.`,
    { title: 'Kennzahl löschen', okLabel: 'Endgültig löschen', danger: true })) return;
  try {
    await spDeleteKennzahl(id);
    closeModal();
    _kz = ((await spGetKennzahlen()) || []).map(kzNormal);
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
