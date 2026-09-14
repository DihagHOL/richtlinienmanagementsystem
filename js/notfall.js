'use strict';

/**
 * Reiter „Notfall & Krisenstab" – die Ansicht
 * ===========================================
 * Das Modell steht in `js/notfallmodell.js`; hier ist nur, was den Browser
 * braucht. Drei Sichten auf dieselben Daten:
 *
 *   BIA         Jede Kachel der Landkarte mit Kritikalität, MTPD/RTO/RPO,
 *               Assets, Plan, letzter Übung und ihren Lücken – die Tabelle,
 *               die ein Auditor sehen will.
 *   Ausfall     Asset wählen → betroffene Prozesse nach RTO → deren Pläne.
 *               Die Frage im Ernstfall: „Der Server ist weg – was steht, was
 *               zuerst?" Und umgekehrt: Welche Assets tragen mehrere kritische
 *               Prozesse (Single Point of Failure).
 *   Krisenstab  Je Werk: Rollen, Nummern, Eskalationsstufen (wer ruft wann
 *               wen), Treffpunkt, Kanäle.
 *
 * Gespeichert wird **in der Landkarte** (`prozesslandkarte.json`): Die BIA und
 * der Plan hängen an der Kachel (`kachel.bcm`), der Krisenstab an der Karte
 * des Werks (`karte.krisenstab`). Die Assets kommen aus dem **Assetregister**
 * (Wiederherstellzeit, Schutzbedarf, Abhängigkeit Asset → Asset); solange es
 * das noch nicht gibt, aus der alten ISMS-Liste „Assets", und die Wieder-
 * herstellzeiten dann aus `daten.notfall.assetRto` – der Rückfall von früher.
 *
 * Übungen sind die vierte Satzart des Wirksamkeits-Registers: Eine Übung
 * prüft einen Plan und findet Abweichungen – dieselbe Kette wie ein Audit.
 *
 * Der Druck (Handbuch, Alarmkarte, einzelner Plan) ist bewusst dabei: Eine
 * Web-App mit Anmeldung ist im Ernstfall vielleicht selbst das, was nicht geht.
 */

let _nfModus = 'bia';          // 'bia' | 'ausfall' | 'krisenstab'
let _nfAssets = null;          // Assets (Register, ersatzweise alte Liste); null = noch nicht geladen
let _nfAssetsFehler = null;
let _nfAssetIndex = new Map();  // Id → Asset, auch über die Id der alten Liste (quelleId)

/** Kommt das Asset aus dem Register (dann pflegt es die Wiederherstellzeit selbst)? */
function _nfRegister() { return Array.isArray(_nfAssets) && _nfAssets.length > 0 && _nfAssets.every(a => a.quelle !== 'isms'); }
/** Die Id im Register zu einer gespeicherten Id – Links aus der Zeit der alten Liste laufen weiter. */
function _nfKanon(id) { const a = _nfAssetIndex.get(String(id)); return a ? String(a.id) : String(id); }
function _nfAssetVon(id) { return _nfAssetIndex.get(String(id)) || null; }
function _nfIndexBauen() {
  _nfAssetIndex = new Map();
  for (const a of (_nfAssets || [])) { _nfAssetIndex.set(String(a.id), a); if (a.quelleId) _nfAssetIndex.set(String(a.quelleId), a); }
}
/**
 * Die Wiederherstellzeiten: aus dem Register, ersatzweise der alte Speicher
 * in der Landkarte. Unter beiden Ids (Register und alte Liste) auffindbar.
 */
function _nfAssetRtoMap() {
  const out = {};
  const alt = nfDaten().assetRto;
  for (const [id, v] of Object.entries(alt)) { out[id] = v; out[_nfKanon(id)] = out[_nfKanon(id)] || v; }
  for (const a of (_nfAssets || [])) {
    if (a.wiederherstellung === '' || a.wiederherstellung === undefined || a.wiederherstellung === null) continue;
    const v = { rto: Number(a.wiederherstellung), title: a.title };
    out[String(a.id)] = v; if (a.quelleId) out[String(a.quelleId)] = v;
  }
  return out;
}
/** Verfügbarkeit je Asset – für die Vererbung in der Prüfung. */
function _nfAssetInfo() {
  const out = {};
  for (const a of (_nfAssets || [])) { const i = { verfuegbarkeit: a.verfuegbarkeit || '' }; out[String(a.id)] = i; if (a.quelleId) out[String(a.quelleId)] = i; }
  return out;
}
/** Was mit ausfällt (Abhängigkeit Asset → Asset) – Ids in beiden Schreibweisen. */
function _nfMitAusfall(id) {
  if (typeof amAbhaengige !== 'function' || !_nfRegister()) return [];
  const out = [];
  for (const a of amAbhaengige(_nfAssets, _nfKanon(id))) { out.push(String(a.id)); if (a.quelleId) out.push(String(a.quelleId)); }
  return out;
}
let _nfUebungen = null;        // Übungen aus dem Wirksamkeits-Register; null = noch nicht geladen
let _nfEditing = null;         // { id, bcm, kachelName } im Editor
let _nfStabEditing = null;
let _nfAssetWahl = '';         // gewähltes Asset in der Ausfall-Sicht
let _nfNurWerk = false;        // Ausfall-Sicht: nur Assets dieses Werks und konzernweite
let _nfFilter = '';

/** Die Assets, die diese Person sehen darf – die Trennung nach Gesellschaft gilt auch hier. */
function _nfAssetsSichtbar() {
  const s = _nfSichtbareWerke();
  return (_nfAssets || []).filter(a => nfAssetSichtbar(a, s));
}
/** Die Eskalationsstufe als farbige Marke. */
function _nfStufeBadge(nr) {
  const v = nfStufe(nr);
  if (!v) return '';
  return `<span style="display:inline-block;border:1px solid ${v.farbe};color:${v.farbe};border-radius:6px;padding:1px 8px;font-size:.78rem;font-weight:800">${v.nr} – ${esc(v.label)}</span>`;
}

/** Die Eskalationsmatrix eines Werks: feste Stufen, werksspezifische Zuständigkeit. */
function _nfEskalationTabelle(alarmierung) {
  const zeilen = nfAlarmierungVollstaendig(alarmierung);
  return `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Stufe</th><th>Wann</th><th>Wer ruft sie aus</th><th>Wer wird alarmiert</th><th>Mittel</th><th>Meldepflicht</th></tr></thead>
    <tbody>${zeilen.map(a => { const v = nfStufe(a.nr) || {};
      return `<tr><td style="white-space:nowrap">${a.nr ? _nfStufeBadge(a.nr) : `<b>${esc(a.stufe)}</b>`}</td><td>${esc(a.ausloeser)}</td>
        <td>${esc(a.wer) || '<span style="color:#b91c1c">niemand benannt</span>'}</td><td>${esc(a.tut)}</td>
        <td style="color:var(--c-muted)">${esc(v.mittel || '')}</td><td style="color:var(--c-muted)">${esc(v.meldepflicht || '')}</td></tr>`; }).join('')}</tbody></table></div>`;
}

function _nfWerkTag(werke) {
  const w = Array.isArray(werke) ? werke.filter(x => x !== 'ALLE') : [];
  if (!w.length) return '';
  return `<span class="ic-tag" style="font-size:.66rem;padding:0 6px" title="Werk laut Asset-Liste">${esc(w.join(', '))}</span>`;
}

function nfDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('notfall'); }
function nfHeute() { return new Date().toISOString().slice(0, 10); }
function _nfName(upn) { return (typeof lkPersonName === 'function') ? lkPersonName(upn) : String(upn || ''); }

/** Die Werke, die diese Person sehen darf – null = alle. */
function _nfSichtbareWerke() { return nfSichtbareWerke(); }

/** Der Notfall-Block im Landkarte-Datenobjekt (legt ihn an). */
function nfDaten() {
  if (!_lkDaten) return { assetRto: {} };
  if (!_lkDaten.notfall || typeof _lkDaten.notfall !== 'object') _lkDaten.notfall = {};
  if (!_lkDaten.notfall.assetRto || typeof _lkDaten.notfall.assetRto !== 'object') _lkDaten.notfall.assetRto = {};
  return _lkDaten.notfall;
}

function _nfKontext(werk) {
  return { assetRto: _nfAssetRtoMap(), assetInfo: _nfAssetInfo(), uebungen: _nfUebungen || [], werk: werk || _lkWerk };
}

/* ── Laden ── */

async function _nfUebungenLaden(neu) {
  if (_nfUebungen && !neu) return _nfUebungen;
  try {
    const alle = (typeof spGetWirkLeise === 'function') ? await spGetWirkLeise() : null;
    _nfUebungen = Array.isArray(alle) ? alle.filter(w => w.art === 'uebung') : [];
  } catch (e) { _nfUebungen = []; }
  return _nfUebungen;
}

function _nfAssetsLaden() {
  if (_nfAssets !== null) return;
  const lader = (typeof spGetAssetsVereint === 'function') ? spGetAssetsVereint : ((typeof spGetAssets === 'function') ? spGetAssets : null);
  if (!lader) return;
  _nfAssets = [];   // „lädt" – doppelte Aufrufe vermeiden
  lader().then(a => { _nfAssets = a || []; _nfAssetsFehler = null; _nfIndexBauen(); nfAssetsNeu(); })
    .catch(e => { _nfAssets = []; _nfAssetsFehler = e.message || 'Assets nicht ladbar.'; nfAssetsNeu(); });
}

/** Nach dem Laden der Assets die Stellen nachzeichnen, die sie zeigen. */
function nfAssetsNeu() {
  // Links aus der Zeit vor dem Register: Id und Werk nachziehen – ein Link
  // auf die alte Liste wird beim nächsten Speichern ein Link ins Register.
  if (_nfEditing && Array.isArray(_nfAssets)) {
    for (const a of _nfEditing.bcm.assets) {
      const f = _nfAssetVon(a.id);
      if (!f) continue;
      a.id = String(f.id);
      if (f.title) a.title = f.title;
      if ((!a.werke || !a.werke.length) && Array.isArray(f.werke)) a.werke = f.werke.slice();
    }
  }
  const el = document.getElementById('nf-assets');
  if (el && _nfEditing) el.innerHTML = _nfAssetsHtml();
  if (_nfModus === 'ausfall') renderNotfall();
}

async function initNotfall() {
  const mount = document.getElementById('notfall-mount');
  if (!mount) return;
  if (typeof lkDatenLaden !== 'function') { mount.innerHTML = emptyState('Landkarte-Modul nicht geladen.', '⚠️'); return; }
  if (!_lkGeladen) {
    mount.innerHTML = '<div class="doc-loading">Lade Prozesslandkarte …</div>';
    await lkDatenLaden();
  }
  if (typeof lkMitgliederLaden === 'function') lkMitgliederLaden();
  _nfAssetsLaden();
  if (!_nfUebungen) {
    mount.innerHTML = '<div class="doc-loading">Lade Übungen …</div>';
    await _nfUebungenLaden();
  }
  renderNotfall();
}

async function refreshNotfall() {
  _lkGeladen = false;
  await lkDatenLaden();
  await _nfUebungenLaden(true);
  _nfAssets = null; _nfAssetsLaden();
  renderNotfall();
  if (typeof toast === 'function') toast('Aktualisiert', 'success');
}

/** Nach einer gespeicherten Übung: neu laden und die Sicht nachziehen. */
async function nfUebungenNeu() {
  await _nfUebungenLaden(true);
  if (_nfEditing) { nfKachelOeffnen(_nfEditing.id); return; }
  renderNotfall();
}

function nfSetModus(m) { _nfModus = ['bia', 'ausfall', 'krisenstab'].includes(m) ? m : 'bia'; renderNotfall(); }
function nfSetWerk(w) { if (typeof lkWerkSetzenStill === 'function') lkWerkSetzenStill(w); renderNotfall(); }

/* ── Die Ansicht ── */

function renderNotfall() {
  const mount = document.getElementById('notfall-mount');
  if (!mount || !_lkDaten) return;
  if (typeof lkWerkAbsichern === 'function') lkWerkAbsichern();
  const schreiben = nfDarfSchreiben();
  // Alle Werke, die diese Person sehen darf – auch die ohne Landkarte. Der
  // Krisenstab gehört zu jedem Standort; die Prozesskacheln kommen später.
  const werke = (typeof lkWerkeSichtbar === 'function') ? lkWerkeSichtbar() : [_lkWerk];
  if (!werke.includes(_lkWerk)) werke.unshift(_lkWerk);
  const mitKarte = new Set((typeof lkWerkeMitKarte === 'function') ? lkWerkeMitKarte() : []);
  const z = nfKennzahlen(_lkDaten, _nfUebungen || [], _nfSichtbareWerke(), nfPflichtWerke(), _nfAssetRtoMap());

  const kpi = (n, label, col) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;
  const tab = (m, label) => `<button class="btn btn-sm ${_nfModus === m ? 'btn-primary' : 'btn-outline'}" onclick="nfSetModus('${m}')">${label}</button>`;

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      <b>Der Plan hängt am Prozess, nicht am Asset.</b> Ein Server, der ausfällt, ist kein Notfall – ein Notfall ist der
      Prozess, der deshalb steht. Jede Kachel der Landkarte trägt deshalb ihre Business-Impact-Analyse (Kritikalität,
      MTPD/RTO/RPO), die Assets, von denen sie abhängt, und ihren Notfallplan. Die Asset-Abhängigkeit ist die Brücke:
      „Asset X ist weg" → betroffene Prozesse → deren Pläne, nach RTO sortiert.
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kpi(z.kritisch, 'kritische Prozesse', z.kritisch ? '#17509e' : '#6b7280')}
      ${kpi(`${z.mitPlan}/${z.kritisch}`, 'davon mit Notfallplan', z.kritisch && z.mitPlan < z.kritisch ? '#b91c1c' : '#15803d')}
      ${kpi(`${z.geuebt}/${z.mitPlan}`, `in ${NF_UEBUNG_MONATE} Monaten geübt`, z.mitPlan && z.geuebt < z.mitPlan ? '#b45309' : '#15803d')}
      ${kpi(z.rtoKonflikte, 'RTO nicht haltbar', z.rtoKonflikte ? '#b91c1c' : '#15803d')}
      ${kpi(`${z.stabOk}/${z.werke}`, 'Werke mit vollständigem Krisenstab', z.werke && z.stabOk < z.werke ? '#b91c1c' : '#15803d')}
      ${z.stabFehlt ? kpi(z.stabFehlt, 'Werke ohne Krisenstab', '#b91c1c') : ''}
      ${kpi(z.fehler, 'Lücken gesamt', z.fehler ? '#b45309' : '#15803d')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <label style="font-size:.85rem;color:var(--c-muted)">Werk</label>
      <select class="sort-select" onchange="nfSetWerk(this.value)" title="Alle Werke – auch ohne Landkarte; der Krisenstab gehört zu jedem">
        ${werke.map(w => `<option value="${esc(w)}"${w === _lkWerk ? ' selected' : ''}>${esc(lkWerkLabel(w))}${
          mitKarte.has(w) || w === 'KONZERN' ? '' : ' · ohne Landkarte'}</option>`).join('')}
      </select>
      ${tab('bia', '📊 BIA & Pläne')} ${tab('ausfall', '⚡ Ausfall-Sicht')} ${tab('krisenstab', '🧭 Krisenstab')}
      <div style="flex:1"></div>
      <button class="btn btn-outline btn-sm" onclick="nfAlarmkarteDrucken()" title="Eine Seite: wen man anruft – zum Aushängen">🖨 Alarmkarte</button>
      <button class="btn btn-primary btn-sm" onclick="nfHandbuchDrucken()" title="Krisenstab, kritische Prozesse nach RTO, alle Pläne – als PDF in die Schublade">🖨 Notfallhandbuch</button>
    </div>
    ${schreiben ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf diesen Reiter.</div>'}
    ${_nfModus === 'ausfall' ? _nfAusfallHtml() : _nfModus === 'krisenstab' ? _nfStabHtml(schreiben) : _nfBiaHtml(schreiben)}`;
}

/* ── Sicht 1: BIA & Pläne ── */

function _nfKritBadge(krit) {
  const k = NF_KRITIKALITAET[krit];
  if (!k) return '<span style="color:var(--c-faint)">nicht bewertet</span>';
  return `<span style="display:inline-block;border:1px solid ${k.farbe};color:${k.farbe};border-radius:6px;padding:1px 7px;font-size:.72rem;font-weight:700">${esc(k.label)}</span>`;
}

function _nfBiaHtml(schreiben) {
  const kacheln = (typeof lkKacheln === 'function') ? lkKacheln() : [];
  if (!kacheln.length) return emptyState('Für dieses Werk gibt es noch keine Landkarte – erst im Reiter „Prozesse" anlegen.', '🗺');
  const q = _nfFilter.toLowerCase();
  const rang = { hoch: 0, mittel: 1, '': 2, niedrig: 3 };
  const rows = kacheln
    .filter(k => !q || (k.name + ' ' + (k.unter || '')).toLowerCase().includes(q))
    .map(k => ({ k, b: nfBcmVon(k), p: nfPruefung(k, _nfKontext()) }))
    .sort((a, b) => (rang[a.b.kritikalitaet] - rang[b.b.kritikalitaet])
      || (_nfSortZahl(a.b.rto) - _nfSortZahl(b.b.rto))
      || String(a.k.name).localeCompare(String(b.k.name), 'de'));
  const unbewertet = kacheln.filter(k => !nfIstBewertet(k)).length;
  const zeit = (v) => v === '' ? '<span style="color:var(--c-faint)">–</span>' : esc(nfDauerText(v));
  const table = `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Prozess</th><th>Kritikalität</th><th>MTPD</th><th>RTO</th><th>RPO</th><th>Assets</th><th>Plan</th><th>Zuletzt geübt</th><th>Lücken</th></tr></thead>
    <tbody>${rows.map(({ k, b, p }) => {
      const letzte = nfLetzteUebung(_nfUebungen, _lkWerk, k.id);
      const plan = nfHatPlan(k);
      return `<tr onclick="nfKachelOeffnen('${esc(k.id)}')" style="cursor:pointer${b.kritikalitaet === 'niedrig' ? ';opacity:.6' : ''}">
        <td><b>${esc(k.name)}</b>${k.unter ? `<div style="font-size:.68rem;color:var(--c-faint)">${esc(k.unter)}</div>` : ''}</td>
        <td>${_nfKritBadge(b.kritikalitaet)}</td>
        <td style="white-space:nowrap">${zeit(b.mtpd)}</td><td style="white-space:nowrap">${zeit(b.rto)}</td><td style="white-space:nowrap">${zeit(b.rpo)}</td>
        <td title="${esc(b.assets.map(a => a.title).join(', '))}">${b.assets.length || '<span style="color:var(--c-faint)">–</span>'}</td>
        <td>${plan ? '<span style="color:#15803d;font-weight:700">✓</span>' : (b.kritikalitaet === 'hoch' ? '<span style="color:#b91c1c;font-weight:700">fehlt</span>' : '<span style="color:var(--c-faint)">–</span>')}</td>
        <td style="white-space:nowrap">${letzte ? fmtDate(letzte.datum) + (nfUebungFaellig(letzte) ? ' <span style="color:#b45309" title="Länger als 12 Monate her">⚠</span>' : '')
          : (plan ? '<span style="color:#b45309;font-weight:600">nie</span>' : '<span style="color:var(--c-faint)">–</span>')}</td>
        <td>${p.fehler.length ? `<span title="${esc(p.fehler.join(' · '))}" style="color:#b91c1c;font-weight:600">${p.fehler.length}</span>`
          : (p.hinweise.length ? `<span title="${esc(p.hinweise.join(' · '))}" style="color:#b45309">${p.hinweise.length} Hinweis(e)</span>` : '<span style="color:#15803d;font-weight:600">✓</span>')}</td>
      </tr>`; }).join('')}</tbody></table></div>`;
  return `
    ${unbewertet ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>${unbewertet} Prozess(e) ohne Business-Impact-Analyse.</b>
      Erst die BIA sagt, welcher Prozess einen Plan braucht – „Kritikalität niedrig" ist auch eine Antwort, und eine dokumentierte.</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <input type="text" class="sort-select" placeholder="Prozess suchen …" value="${esc(_nfFilter)}" oninput="_nfFilter=this.value;renderNotfall()" style="width:220px">
      <span class="field-hint">Sortiert: kritische zuerst, darin nach RTO. Klick öffnet BIA und Plan.</span>
    </div>
    ${table}`;
}

/* ── Sicht 2: Ausfall ── */

function _nfAusfallHtml() {
  const werke = _nfSichtbareWerke();
  const alleTraeger = nfAssetTraeger(_lkDaten, werke, { kanon: _nfKanon });
  // Das Werk am Asset: aus dem Register, ersatzweise aus dem gespeicherten Link.
  const werkeVon = (id) => {
    const a = _nfAssetVon(id);
    if (a && Array.isArray(a.werke) && a.werke.length) return a.werke;
    const t = alleTraeger.find(x => x.id === _nfKanon(id));
    return (t && t.werke) || [];
  };
  const passt = (id) => !_nfNurWerk || nfAssetPasst({ werke: werkeVon(id) }, _lkWerk);
  const traeger = alleTraeger.filter(t => nfAssetSichtbar({ werke: werkeVon(t.id) }, werke) && passt(t.id));
  const bekannt = new Map(traeger.map(t => [t.id, t.title]));
  for (const a of _nfAssetsSichtbar()) if (!bekannt.has(String(a.id)) && passt(String(a.id))) bekannt.set(String(a.id), a.title);
  const optionen = [...bekannt.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'de'));
  const rto = _nfAssetRtoMap();
  const register = _nfRegister();
  const schreiben = register ? (typeof canWriteTab !== 'function' || canWriteTab('assets')) : nfDarfSchreiben();
  const mit = _nfAssetWahl ? _nfMitAusfall(_nfAssetWahl) : [];
  const ausfallOpt = { kanon: _nfKanon, mit, assetRto: rto };

  let treffer = '';
  if (_nfAssetWahl) {
    const liste = nfAusfall(_lkDaten, _nfAssetWahl, werke, ausfallOpt);
    const titel = bekannt.get(_nfAssetWahl) || _nfAssetWahl;
    const mitNamen = [...new Set(mit.map(x => (_nfAssetVon(x) || {}).title).filter(Boolean))];
    const r = rto[_nfAssetWahl] && nfDauerText(rto[_nfAssetWahl].rto);
    const risiken = (typeof _risks !== 'undefined' && Array.isArray(_risks))
      ? _risks.filter(x => (x.assets || []).some(a => String(a.id) === _nfAssetWahl) && x.status !== 'geschlossen').length : null;
    treffer = `<div class="item-card" style="margin-bottom:12px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <b style="font-size:1rem">⚡ „${esc(titel)}" fällt aus</b> ${_nfWerkTag(werkeVon(_nfAssetWahl))}
        <span class="field-hint">Wiederherstellung: ${r ? `<b>${esc(r)}</b>` : 'nicht gepflegt'}</span>
        ${risiken !== null && risiken ? `<span class="field-hint">· ${risiken} offene(s) Risiko/Risiken im Register</span>` : ''}
        ${(() => { const st = nfStufeBeiAusfall(_lkDaten, _nfAssetWahl, werke, ausfallOpt);
          return `<span title="${esc(st.gruende.join(' '))}">Eskalationsstufe: ${_nfStufeBadge(st.nr)}</span>`; })()}
        ${schreiben ? `<span style="margin-left:auto;font-size:.8rem" title="${register ? 'Wird im Assetregister gespeichert' : 'Wird in der Landkarte gespeichert (alte Liste)'}">Wiederherstellzeit:
          <input type="number" min="0" step="0.5" style="width:70px" id="nf-arto-wert" value="${esc(nfDauerEingabe(rto[_nfAssetWahl] ? rto[_nfAssetWahl].rto : '').wert)}">
          <select id="nf-arto-einheit">${['min', 'h', 'tage'].map(e => `<option value="${e}"${nfDauerEingabe(rto[_nfAssetWahl] ? rto[_nfAssetWahl].rto : '').einheit === e ? ' selected' : ''}>${e === 'tage' ? 'Tage' : e}</option>`).join('')}</select>
          <button class="btn btn-outline btn-sm" onclick="nfAssetRtoSpeichern('${esc(_nfAssetWahl)}')">Setzen</button></span>` : ''}
      </div>
      ${mitNamen.length ? `<div style="font-size:.85rem;margin-bottom:6px;color:#b91c1c"><b>Reißt mit:</b> ${mitNamen.map(esc).join(', ')} <span class="field-hint">– hängen laut Assetregister daran; ihre Prozesse stehen mit in der Liste.</span></div>` : ''}
      ${(() => { const st = nfStufeBeiAusfall(_lkDaten, _nfAssetWahl, werke, ausfallOpt); const v = st.stufe;
        return liste.length ? `<div style="font-size:.82rem;color:var(--c-muted);margin-bottom:8px;border-left:3px solid ${v.farbe};padding-left:8px">
          <b style="color:${v.farbe}">${st.nr} – ${esc(v.label)}:</b> ${st.gruende.map(esc).join(' ')}
          ${st.nr >= 2 ? `<br>Ausrufen: <b>${esc((nfAlarmierungVollstaendig((lkKarte().krisenstab || {}).alarmierung).find(a => a.nr === st.nr) || {}).wer || v.erklaert)}</b> · alarmiert: ${esc((nfAlarmierungVollstaendig((lkKarte().krisenstab || {}).alarmierung).find(a => a.nr === st.nr) || {}).tut || v.alarmiert)}${v.meldepflicht ? ` · ${esc(v.meldepflicht)}` : ''}` : ''}</div>` : ''; })()}
      ${liste.length ? `<div style="font-size:.85rem;margin-bottom:6px">Betroffen – <b>in dieser Reihenfolge wiederherstellen</b> (kürzeste RTO zuerst):</div>
        <ol style="margin:0;padding-left:22px">${liste.map(({ werk, kachel, rto: prto, kritikalitaet, plan }, i) => {
          const b = nfBcmVon(kachel);
          const konflikt = rto[_nfAssetWahl] && prto !== '' && Number(rto[_nfAssetWahl].rto) > Number(prto);
          return `<li style="margin:4px 0"><b>${esc(kachel.name)}</b> <span class="field-hint">(${esc(lkWerkLabel(werk))})</span>
            ${_nfKritBadge(kritikalitaet)} · RTO ${prto === '' ? '<span style="color:var(--c-faint)">–</span>' : `<b>${esc(nfDauerText(prto))}</b>`}
            ${konflikt ? ' <span style="color:#b91c1c;font-weight:600" title="Das Asset braucht länger, als der Prozess weg sein darf">⚠ nicht haltbar</span>' : ''}
            · Plan ${plan ? '<span style="color:#15803d">✓</span>' : '<span style="color:#b91c1c">fehlt</span>'}
            ${(b.plan.verantwortlich || kachel.verantwortlich) ? ` · 👤 ${esc(_nfName(b.plan.verantwortlich || kachel.verantwortlich))}` : ''}
            <button class="btn btn-ghost btn-sm" onclick="nfSetWerk('${esc(werk)}');nfKachelOeffnen('${esc(kachel.id)}')">Plan öffnen</button></li>`; }).join('')}</ol>`
        : '<div class="field-hint">Kein Prozess hängt an diesem Asset – oder niemand hat es eingetragen. Beides sollte man wissen.</div>'}
    </div>`;
  }

  const matrix = traeger.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Asset</th><th>Werk</th><th>Wiederherstellung</th><th>Trägt</th><th>Prozesse (nach RTO)</th></tr></thead>
    <tbody>${traeger.map(t => {
      const r = rto[t.id] && nfDauerText(rto[t.id].rto);
      const pr = t.prozesse.slice().sort((a, b) => _nfSortZahl(a.rto) - _nfSortZahl(b.rto));
      const aw = werkeVon(t.id);
      // Prozesse, die laut Liste nicht in einem Werk dieses Assets liegen.
      const fremd = pr.filter(p => nfAssetFremd({ werke: aw }, p.werk));
      const abh = _nfRegister() && typeof amAbhaengige === 'function' ? amAbhaengige(_nfAssets, t.id).length : 0;
      return `<tr onclick="_nfAssetWahl='${esc(t.id)}';renderNotfall()" style="cursor:pointer${t.id === _nfAssetWahl ? ';background:var(--c-bg,#f8fafc)' : ''}">
        <td><b>${esc(t.title)}</b>${abh ? `<div style="font-size:.68rem;color:#b91c1c">reißt ${abh} Asset(s) mit</div>` : ''}</td>
        <td style="white-space:nowrap">${aw.length ? esc(aw.filter(x => x !== 'ALLE').join(', ') || 'konzernweit') : '<span style="color:var(--c-faint)">–</span>'}${
          fremd.length ? ` <span style="color:#b45309" title="${esc(fremd.map(p => p.name + ' (' + p.werk + ')').join(', '))} hängen daran, liegen aber in einem anderen Werk">⚠</span>` : ''}</td>
        <td style="white-space:nowrap">${r ? esc(r) : '<span style="color:var(--c-faint)">–</span>'}</td>
        <td style="white-space:nowrap">${t.kritisch > 1 ? `<span style="color:#b91c1c;font-weight:700" title="Single Point of Failure: mehrere kritische Prozesse hängen daran">⚠ ${t.kritisch} kritische</span>`
          : t.kritisch === 1 ? '1 kritischen' : `${t.prozesse.length}`}</td>
        <td>${pr.map(p => `${esc(p.name)}${p.rto !== '' ? ` <span class="field-hint">${esc(nfDauerText(p.rto))}</span>` : ''}`).join(' → ')}</td>
      </tr>`; }).join('')}</tbody></table></div>`
    : emptyState('Noch keinem Prozess sind Assets zugeordnet – in der BIA-Sicht einen Prozess öffnen und die Assets wählen.', '🔗');

  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <label style="font-size:.85rem;color:var(--c-muted)">Was fällt aus?</label>
      <select class="sort-select" onchange="_nfAssetWahl=this.value;renderNotfall()" style="min-width:260px">
        <option value="">– Asset wählen –</option>
        ${optionen.map(([id, t]) => `<option value="${esc(id)}"${id === _nfAssetWahl ? ' selected' : ''}>${esc(t)}${bekannt.has(id) && traeger.some(x => x.id === id) ? '' : ' (ohne Prozess)'}</option>`).join('')}
      </select>
      ${_nfAssetsFehler ? `<span class="field-hint" style="color:#b45309">ISMS-Liste „Assets": ${esc(_nfAssetsFehler)}</span>` : ''}
      <label class="ack-check" style="font-weight:500;font-size:.82rem"><input type="checkbox" ${_nfNurWerk ? 'checked' : ''}
        onchange="_nfNurWerk=this.checked;renderNotfall()"> nur Assets von ${esc(lkWerkLabel(_lkWerk))} und konzernweite</label>
      <span class="field-hint">${werke ? 'nur die Werke Ihrer Gesellschaft' : 'über alle Werke'} · Werk laut Asset-Liste</span>
    </div>
    ${treffer}
    <div style="font-weight:700;font-size:.9rem;margin:6px 0">Welche Assets tragen wie viele Prozesse?</div>
    <div class="field-hint" style="margin-bottom:8px">Ein Asset unter mehreren kritischen Prozessen ist der Single Point of Failure, den bisher niemand so genannt hat.</div>
    ${matrix}`;
}

async function nfAssetRtoSpeichern(id) {
  const w = document.getElementById('nf-arto-wert'), e = document.getElementById('nf-arto-einheit');
  const h = nfDauerStunden(w ? w.value : '', e ? e.value : 'h');
  // Mit Register: dort ist die eine Wahrheit – und dort gilt dessen Schreibrecht.
  if (_nfRegister()) {
    if (typeof canWriteTab === 'function' && !canWriteTab('assets')) { toast('Nur Lesezugriff auf das Assetregister.', 'error'); return; }
    const a = _nfAssetVon(id);
    if (!a) return;
    try {
      await spUpdateAsset(a.id, Object.assign({}, a, { wiederherstellung: h }));
      a.wiederherstellung = h;
      toast('Wiederherstellzeit im Assetregister gesetzt ✓', 'success');
      renderNotfall();
    } catch (err) { toast('Speichern fehlgeschlagen: ' + err.message, 'error'); }
    return;
  }
  if (!nfDarfSchreiben()) return;
  const rto = nfDaten().assetRto;
  const titel = (nfAssetTraeger(_lkDaten).find(t => t.id === id) || {}).title || ((_nfAssets || []).find(a => String(a.id) === id) || {}).title || '';
  if (h === '') delete rto[id]; else rto[id] = { rto: h, title: titel };
  if (await lkSpeichern('Wiederherstellzeit gesetzt ✓', `Notfall: Wiederherstellzeit „${titel || id}" = ${nfDauerText(h) || 'gelöscht'}`, 'notfall')) renderNotfall();
}

/* ── Sicht 3: Krisenstab ── */

function _nfStabHtml(schreiben) {
  const karte = (typeof lkKarte === 'function') ? lkKarte() : {};
  const stab = karte.krisenstab || null;
  const lu = nfStabLuecken(stab);
  const z = nfKennzahlen(_lkDaten, [], _nfSichtbareWerke(), nfPflichtWerke());
  const andere = z.stabOffen.filter(o => o.werk !== _lkWerk);
  const uebersicht = andere.length ? `<div class="field-hint" style="margin-top:14px">In anderen Werken offen: ${
    andere.map(o => `<a href="#" onclick="nfSetWerk('${esc(o.werk)}');return false" style="color:var(--c-primary);font-weight:600">${esc(lkWerkLabel(o.werk))}</a> (${o.fehlt ? 'kein Krisenstab' : `${o.luecken.length} Lücke(n)`})`).join(' · ')}</div>` : '';
  if (!stab) {
    return `${emptyState(`Für ${lkWerkLabel(_lkWerk)} ist noch kein Krisenstab angelegt.`, '🧭')}
      <div style="text-align:center;margin-top:-8px">
        <div class="field-hint" style="margin-bottom:10px">Die Vorlage bringt die acht Rollen nach BSI 200-4, die drei Eskalationsstufen (Störung, Notfall, Krise) und die externen Stellen mit – auszufüllen sind Namen und Nummern.</div>
        ${schreiben ? `<button class="btn btn-primary" onclick="nfStabAnlegen()">+ Krisenstab anlegen</button>` : ''}
        ${uebersicht}
      </div>`;
  }
  const st = nfStabVon(stab);
  const nummer = (m) => [m.telefon, m.mobil].filter(Boolean).map(esc).join(' · ') || '<span style="color:var(--c-faint)">–</span>';
  return `
    ${lu.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Lücken im Krisenstab (${lu.length}):</b>
      <ul style="margin:6px 0 0 18px;padding:0">${lu.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>`
      : `<div class="col-warning" style="display:block;margin-bottom:12px;border-color:#bbf7d0;background:#f0fdf4;color:#166534">✓ Krisenstab vollständig – Stand ${fmtDate(st.standAm)}.</div>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <span class="field-hint">Stand ${st.standAm ? fmtDate(st.standAm) : '–'}</span>
      <div style="flex:1"></div>
      ${schreiben ? `<button class="btn btn-primary btn-sm" onclick="nfStabBearbeiten()">Bearbeiten</button>` : ''}
    </div>
    <div style="font-weight:700;font-size:.9rem;margin:6px 0">Mitglieder</div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem"><thead><tr><th>Rolle</th><th>Name</th><th>Telefon</th><th>Vertretung</th><th>Telefon</th></tr></thead>
      <tbody>${st.mitglieder.map(m => `<tr><td><b>${esc(m.rolle)}</b></td><td>${m.name ? esc(_nfName(m.name)) : '<span style="color:#b91c1c">nicht benannt</span>'}</td>
        <td style="white-space:nowrap">${nummer(m)}</td><td>${m.vertretung ? esc(_nfName(m.vertretung)) : '<span style="color:var(--c-faint)">–</span>'}</td><td style="white-space:nowrap">${esc(m.vertretungTelefon) || '<span style="color:var(--c-faint)">–</span>'}</td></tr>`).join('')
        || '<tr><td colspan="5" style="color:var(--c-muted)">Keine Mitglieder.</td></tr>'}</tbody></table></div>
    <div style="font-weight:700;font-size:.9rem;margin:12px 0 2px">Eskalationsstufen – wer ruft wann wen?</div>
    <div class="field-hint" style="margin-bottom:6px">Die Stufen sind fest (BSI 200-4); das Werk sagt, wer sie ausruft und wen er alarmiert. Ein Prozess ist in <b>Störung</b>, bis seine RTO reißt, danach im <b>Notfall</b>; ab der MTPD ist es eine <b>Krise</b>.</div>
    ${_nfEskalationTabelle(st.alarmierung)}
    <div class="item-card" style="margin-top:12px;font-size:.86rem">
      <div><b>Treffpunkt:</b> ${esc(st.treffpunkt) || '<span style="color:#b91c1c">nicht festgelegt</span>'}${st.treffpunktErsatz ? ` &nbsp;·&nbsp; <b>Ersatz:</b> ${esc(st.treffpunktErsatz)}` : ''}</div>
      <div style="margin-top:4px"><b>Kommunikation:</b> ${esc(st.kanal) || '<span style="color:#b91c1c">nicht festgelegt</span>'}${st.kanalErsatz ? ` &nbsp;·&nbsp; <b>Ersatz:</b> ${esc(st.kanalErsatz)}` : ''}</div>
      ${st.hinweis ? `<div style="margin-top:4px">${esc(st.hinweis)}</div>` : ''}
    </div>
    ${st.externe.length ? `<div style="font-weight:700;font-size:.9rem;margin:12px 0 6px">Externe Stellen</div>
    <div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem"><thead><tr><th>Stelle</th><th>Telefon</th><th>Hinweis</th></tr></thead>
      <tbody>${st.externe.map(e => `<tr><td>${esc(e.wer)}</td><td style="white-space:nowrap">${esc(e.telefon) || '<span style="color:var(--c-faint)">–</span>'}</td><td>${esc(e.hinweis)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${uebersicht}`;
}

function nfStabAnlegen() {
  if (!nfDarfSchreiben()) return;
  _nfStabEditing = nfStabVorlage();
  renderNfStabEditor();
}

function nfStabBearbeiten() {
  if (!nfDarfSchreiben()) return;
  const karte = lkKarte();
  _nfStabEditing = JSON.parse(JSON.stringify(nfStabVon(karte.krisenstab || nfStabVorlage())));
  // Altbestand ohne alle drei Stufen: die fehlenden aus dem Modell ergänzen.
  _nfStabEditing.alarmierung = nfAlarmierungVollstaendig(_nfStabEditing.alarmierung);
  renderNfStabEditor();
}

function nfStabZeile(liste, i, feld, wert) { const z = (_nfStabEditing[liste] || [])[i]; if (z) z[feld] = wert; }
function nfStabZeileWeg(liste, i) { (_nfStabEditing[liste] || []).splice(i, 1); renderNfStabEditor(); }
function nfStabZeileHinzu(liste) {
  const leer = { mitglieder: { rolle: '', name: '', telefon: '', mobil: '', vertretung: '', vertretungTelefon: '' },
    alarmierung: { stufe: '', ausloeser: '', wer: '', tut: '' }, externe: { wer: '', telefon: '', hinweis: '' } }[liste];
  (_nfStabEditing[liste] = _nfStabEditing[liste] || []).push(Object.assign({}, leer));
  renderNfStabEditor();
}

function renderNfStabEditor() {
  const s = _nfStabEditing;
  if (!s) return;
  if (typeof lkMitgliederLaden === 'function') lkMitgliederLaden();
  const lu = nfStabLuecken(s);
  const inp = (liste, i, feld, wert, ph, breite, list) => `<input type="text" value="${esc(wert)}" placeholder="${esc(ph || '')}"${list ? ` list="${list}"` : ''}
    oninput="nfStabZeile('${liste}',${i},'${feld}',this.value)" style="width:${breite || '100%'}">`;
  const rollen = NF_STAB_ROLLEN.map(r => `<option value="${esc(r.rolle)}">${esc(r.aufgabe)}</option>`).join('');
  const mit = (s.mitglieder || []).map((m, i) => `<tr>
    <td>${inp('mitglieder', i, 'rolle', m.rolle, 'Rolle', '150px', 'nf-rollen')}</td>
    <td>${inp('mitglieder', i, 'name', m.name, 'Name oder E-Mail', '150px', 'lk-people')}</td>
    <td>${inp('mitglieder', i, 'telefon', m.telefon, 'Festnetz', '110px')}</td>
    <td>${inp('mitglieder', i, 'mobil', m.mobil, 'Mobil', '110px')}</td>
    <td>${inp('mitglieder', i, 'vertretung', m.vertretung, 'Vertretung', '140px', 'lk-people')}</td>
    <td>${inp('mitglieder', i, 'vertretungTelefon', m.vertretungTelefon, 'Telefon', '110px')}</td>
    <td><button class="btn btn-ghost btn-sm" onclick="nfStabZeileWeg('mitglieder',${i})" title="Entfernen">✕</button></td></tr>`).join('');
  // Die drei Stufen stehen fest – Beschriftung und Reihenfolge kommen aus dem
  // Modell, nur Auslöser, Ausrufer und Alarmierte gehören dem Werk. Zeilen
  // ohne Stufe (Altbestand) bleiben bearbeitbar und löschbar.
  const alarm = (s.alarmierung || []).map((a, i) => { const v = nfStufe(a.nr); return `<tr>
    <td style="white-space:nowrap">${v ? _nfStufeBadge(v.nr) : inp('alarmierung', i, 'stufe', a.stufe, 'Stufe', '110px')}</td>
    <td>${inp('alarmierung', i, 'ausloeser', a.ausloeser, v ? v.kriterium : 'Woran erkennt man die Stufe?')}</td>
    <td>${inp('alarmierung', i, 'wer', a.wer, v ? v.erklaert : 'Wer ruft sie aus?', '170px')}</td>
    <td>${inp('alarmierung', i, 'tut', a.tut, v ? v.alarmiert : 'Wer wird alarmiert?')}</td>
    <td>${v ? '' : `<button class="btn btn-ghost btn-sm" onclick="nfStabZeileWeg('alarmierung',${i})" title="Entfernen">✕</button>`}</td></tr>`; }).join('');
  const ext = (s.externe || []).map((e, i) => `<tr>
    <td>${inp('externe', i, 'wer', e.wer, 'Stelle', '220px')}</td>
    <td>${inp('externe', i, 'telefon', e.telefon, 'Telefon', '140px')}</td>
    <td>${inp('externe', i, 'hinweis', e.hinweis, 'Kundennummer, Ansprechpartner, Öffnungszeiten …')}</td>
    <td><button class="btn btn-ghost btn-sm" onclick="nfStabZeileWeg('externe',${i})" title="Entfernen">✕</button></td></tr>`).join('');
  openModal(`
    <div class="modal-header"><h3>🧭 Krisenstab ${esc(lkWerkLabel(_lkWerk))}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">Rollen, nicht Personen – Personen wechseln. Jede benannte Person braucht eine Nummer, die nachts erreichbar ist.
        Der Stand wird beim Speichern auf heute gesetzt; nach ${NF_STAB_MONATE} Monaten mahnt das System.</div>
      ${lu.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Noch offen:</b><ul style="margin:6px 0 0 18px;padding:0">${lu.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <datalist id="nf-rollen">${rollen}</datalist>
      <datalist id="lk-people">${(typeof _lkPeopleOptions === 'function') ? _lkPeopleOptions() : ''}</datalist>
      <div style="font-weight:700;font-size:.9rem;margin:0 0 6px">Mitglieder</div>
      <div style="overflow-x:auto"><table class="tbl" style="font-size:.8rem;width:100%"><thead><tr><th>Rolle</th><th>Name</th><th>Telefon</th><th>Mobil</th><th>Vertretung</th><th>Telefon</th><th></th></tr></thead>
        <tbody>${mit || '<tr><td colspan="7" style="color:var(--c-muted)">Keine Mitglieder.</td></tr>'}</tbody></table></div>
      <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="nfStabZeileHinzu('mitglieder')">+ Mitglied</button>
      <div style="font-weight:700;font-size:.9rem;margin:14px 0 2px">Eskalationsstufen – wer ruft wann wen?</div>
      <div class="field-hint" style="margin-bottom:6px">Störung → Notfall → Krise sind fest. Je Stufe: Wann gilt sie hier, wer ruft sie aus, wer wird alarmiert. Jede Stufe braucht einen Ausrufer – sonst wird aus einer Störung ein Notfall, ohne dass es jemand sagt.</div>
      <div style="overflow-x:auto"><table class="tbl" style="font-size:.8rem;width:100%"><thead><tr><th>Stufe</th><th>Wann</th><th>Wer ruft sie aus</th><th>Wer wird alarmiert</th><th></th></tr></thead>
        <tbody>${alarm}</tbody></table></div>
      <div class="form-grid" style="margin-top:14px">
        <div class="form-group"><label>Treffpunkt <span class="req">*</span></label>
          <input type="text" value="${esc(s.treffpunkt)}" oninput="_nfStabEditing.treffpunkt=this.value" placeholder="z. B. Besprechungsraum Verwaltung, EG"></div>
        <div class="form-group"><label>Treffpunkt Ersatz</label>
          <input type="text" value="${esc(s.treffpunktErsatz)}" oninput="_nfStabEditing.treffpunktErsatz=this.value" placeholder="wenn das Gebäude selbst betroffen ist"></div>
        <div class="form-group"><label>Kommunikationskanal <span class="req">*</span></label>
          <input type="text" value="${esc(s.kanal)}" oninput="_nfStabEditing.kanal=this.value" placeholder="z. B. Teams-Kanal „Krisenstab"">
          <span class="field-hint">Und der Ausfall von Teams ist ein wahrscheinliches Szenario – deshalb:</span></div>
        <div class="form-group"><label>Ersatzkanal <span class="req">*</span></label>
          <input type="text" value="${esc(s.kanalErsatz)}" oninput="_nfStabEditing.kanalErsatz=this.value" placeholder="z. B. Mobiltelefon / Signal-Gruppe / Sammelpunkt"></div>
        <div class="form-group full"><label>Hinweis</label>
          <input type="text" value="${esc(s.hinweis)}" oninput="_nfStabEditing.hinweis=this.value" placeholder="z. B. Schlüssel zum Krisenstab-Raum an der Pforte"></div>
      </div>
      <div style="font-weight:700;font-size:.9rem;margin:14px 0 6px">Externe Stellen</div>
      <div style="overflow-x:auto"><table class="tbl" style="font-size:.8rem;width:100%"><thead><tr><th>Stelle</th><th>Telefon</th><th>Hinweis</th><th></th></tr></thead>
        <tbody>${ext || '<tr><td colspan="4" style="color:var(--c-muted)">Keine.</td></tr>'}</tbody></table></div>
      <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="nfStabZeileHinzu('externe')">+ Stelle</button>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="nf-stab-save" onclick="nfStabSpeichern()">Speichern</button>
    </div>`, true, { label: 'Krisenstab bearbeiten' });
}

async function nfStabSpeichern() {
  if (!nfDarfSchreiben() || !_nfStabEditing) return;
  const s = nfStabVon(_nfStabEditing);
  s.standAm = new Date().toISOString();
  // lkKarte() legt für ein Werk ohne Landkarte eine leere an – der Stab hängt
  // dann an einer Karte ohne Kacheln. Das ist gewollt: Erst der Krisenstab,
  // die Prozesse kommen, wenn sie kommen.
  const karte = lkKarte();
  const neu = !karte.krisenstab;
  karte.krisenstab = s;
  closeModal();
  _nfStabEditing = null;
  const lu = nfStabLuecken(s);
  if (await lkSpeichern(lu.length ? `Gespeichert – ${lu.length} Lücke(n) bleiben` : 'Krisenstab gespeichert ✓',
      `Notfall: Krisenstab ${lkWerkLabel(_lkWerk)} ${neu ? 'angelegt' : 'geändert'}`, 'notfall')) renderNotfall();
}

/* ── Der Editor: BIA und Plan einer Kachel ── */

function nfKachelOeffnen(id) {
  const k = (typeof lkKachelVonId === 'function') ? lkKachelVonId(id) : null;
  if (!k) return;
  if (typeof lkMitgliederLaden === 'function') lkMitgliederLaden();
  _nfAssetsLaden();
  _nfEditing = { id: k.id, name: k.name, unter: k.unter || '', verantwortlich: k.verantwortlich || '', vertretung: k.vertretung || '',
    bcm: nfBcmVon(k), assetRto: JSON.parse(JSON.stringify(nfDaten().assetRto)), registerRto: {} };
  nfAssetsNeu();   // Ids und Werke der Links nachziehen, falls die Assets schon da sind
  if (!_nfUebungen) _nfUebungenLaden().then(() => { if (_nfEditing && _nfEditing.id === id) renderNfEditor(); });
  renderNfEditor();
}

function nfZeit(feld, wert, einheit) {
  const w = document.getElementById(`nf-${feld}-wert`), e = document.getElementById(`nf-${feld}-einheit`);
  _nfEditing.bcm[feld] = nfDauerStunden(w ? w.value : wert, e ? e.value : einheit);
  _nfLueckenNeu();
  const el = document.getElementById('nf-eskalation');
  if (el) el.innerHTML = _nfEskalationHtml();
}

/** Die Eskalationsleiter des Prozesses im Editor – aus RTO und MTPD, ohne Eingabe. */
function _nfEskalationHtml() {
  if (!_nfEditing) return '';
  const k = { bcm: _nfEditing.bcm };
  const l = nfEskalationVon(k);
  if (!l.length) return `<div class="field-hint">Eskalation: erst mit Kritikalität (hoch/mittel) und RTO – dann steht hier, ab wann aus der Störung ein Notfall wird.</div>`;
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:.82rem">
    <span style="color:var(--c-muted)">Eskalation:</span>
    ${l.map(x => `<span>${x.nr === 1 ? 'bis' : 'ab'} <b>${esc(nfDauerText(x.nr === 1 ? x.bis : x.ab))}</b> ${_nfStufeBadge(x.nr)}</span>`).join('<span style="color:var(--c-faint)">→</span>')}
    ${l.length < 3 ? '<span class="field-hint">· MTPD fehlt – ohne sie gibt es keine Krisen-Schwelle</span>' : ''}
  </div>`;
}

function nfKritSetzen(v) { _nfEditing.bcm.kritikalitaet = NF_KRITIKALITAET[v] ? v : ''; renderNfEditor(); }
function nfPlanFeld(feld, wert) { _nfEditing.bcm.plan[feld] = wert; _nfLueckenNeu(); }
function nfKontaktHinzu() { _nfEditing.bcm.plan.kontakte.push({ rolle: '', name: '', telefon: '' }); renderNfEditor(); }
function nfKontaktWeg(i) { _nfEditing.bcm.plan.kontakte.splice(i, 1); renderNfEditor(); }
function nfKontaktSetzen(i, feld, wert) { const x = _nfEditing.bcm.plan.kontakte[i]; if (x) x[feld] = wert; }

function nfAssetUmschalten(id, an) {
  const key = _nfKanon(id);
  const b = _nfEditing.bcm;
  b.assets = b.assets.filter(a => _nfKanon(a.id) !== key);
  if (an) {
    const f = _nfAssetVon(key);
    b.assets.push({ id: key, title: (f && f.title) || ('#' + key), werke: (f && Array.isArray(f.werke)) ? f.werke.slice() : [] });
  }
  const el = document.getElementById('nf-assets');
  if (el) el.innerHTML = _nfAssetsHtml();
  _nfLueckenNeu();
}

function nfAssetRtoSetzen(id) {
  const w = document.getElementById(`nf-arto-${id}-wert`), e = document.getElementById(`nf-arto-${id}-einheit`);
  const h = nfDauerStunden(w ? w.value : '', e ? e.value : 'h');
  const a = _nfEditing.bcm.assets.find(x => x.id === String(id));
  if (_nfRegister()) {
    // Ins Register – beim Speichern der Kachel, mit dem Recht des Registers.
    _nfEditing.registerRto[String(id)] = h;
    if (h === '') delete _nfEditing.assetRto[id]; else _nfEditing.assetRto[id] = { rto: h, title: (a && a.title) || '' };
  } else if (h === '') delete _nfEditing.assetRto[id]; else _nfEditing.assetRto[id] = { rto: h, title: (a && a.title) || '' };
  _nfLueckenNeu();
}

function _nfAssetsHtml() {
  const sel = _nfEditing.bcm.assets;
  const selIds = new Set(sel.map(a => a.id));
  const loaded = _nfAssets || [];
  const filter = String(document.getElementById('nf-asset-filter')?.value || '').toLowerCase().trim();
  const register = _nfRegister();
  const darfRegister = !register || typeof canWriteTab !== 'function' || canWriteTab('assets');
  const rtoZeile = (a) => {
    const reg = _nfAssetVon(a.id);
    const wert = (register && reg && reg.wiederherstellung !== '' && !(String(a.id) in _nfEditing.registerRto)) ? reg.wiederherstellung
      : (_nfEditing.assetRto[a.id] ? _nfEditing.assetRto[a.id].rto : '');
    const e = nfDauerEingabe(wert);
    if (!darfRegister) return `<span style="margin-left:auto;white-space:nowrap;font-size:.75rem;color:var(--c-muted)" title="Wird im Assetregister gepflegt">Wiederherstellung ${wert === '' ? '<b style="color:#b45309">fehlt</b>' : `<b>${esc(nfDauerText(wert))}</b>`}</span>`;
    return `<span style="margin-left:auto;white-space:nowrap;font-size:.75rem;color:var(--c-muted)" title="${register ? 'Wird beim Speichern ins Assetregister geschrieben – die eine Wahrheit für alle Prozesse.' : 'Wie lange braucht die Wiederherstellung dieses Assets? Gilt für alle Prozesse, die daran hängen.'}">Wiederherstellung
      <input type="number" min="0" step="0.5" id="nf-arto-${esc(a.id)}-wert" value="${esc(e.wert)}" style="width:60px" onchange="nfAssetRtoSetzen('${esc(a.id)}')">
      <select id="nf-arto-${esc(a.id)}-einheit" onchange="nfAssetRtoSetzen('${esc(a.id)}')">${['min', 'h', 'tage'].map(x => `<option value="${x}"${e.einheit === x ? ' selected' : ''}>${x === 'tage' ? 'Tage' : x}</option>`).join('')}</select></span>`;
  };
  const sbBadge = (a) => {
    if (!register || !a.verfuegbarkeit) return '';
    const col = a.verfuegbarkeit === 'sehr hoch' ? '#b91c1c' : a.verfuegbarkeit === 'hoch' ? '#b45309' : '#15803d';
    return ` <span style="font-size:.66rem;color:${col};font-weight:700" title="Verfügbarkeit laut Assetregister">A: ${esc(a.verfuegbarkeit)}</span>`;
  };
  const row = (a, checked) => `<label class="ack-check" style="font-weight:500;align-items:center;display:flex;gap:8px">
    <input type="checkbox" ${checked ? 'checked' : ''} onchange="nfAssetUmschalten('${esc(String(a.id))}',this.checked)">
    <span><b>${esc(a.title)}</b> ${_nfWerkTag(a.werke)}${sbBadge(a)}${nfAssetFremd(a, _lkWerk) ? ' <span style="color:#b45309" title="Steht laut Liste in einem anderen Werk">⚠</span>' : ''}${a.sub && !register ? ` <span style="color:var(--c-faint)">${esc(a.sub)}</span>` : ''}${register && a.kategorie ? ` <span style="color:var(--c-faint)">${esc(a.kategorie)}</span>` : ''}</span>
    ${checked ? rtoZeile({ id: String(a.id), title: a.title }) : ''}</label>`;
  let html = '';
  if (_nfAssets === null || (_nfAssets.length === 0 && !_nfAssetsFehler)) html += '<div class="field-hint">Lade Assets aus der ISMS-Liste „Assets" …</div>';
  else if (!loaded.length) html += `<div class="field-hint" style="margin-bottom:4px">${esc(_nfAssetsFehler || 'Keine Assets in der ISMS-Liste „Assets".')}</div>`;
  const loadedIds = new Set(loaded.map(a => String(a.id)));
  const items = _nfAssetsSichtbar().filter(a => a.status !== 'außer Betrieb' || selIds.has(String(a.id)))
    .filter(a => !filter || (a.title + ' ' + (a.sub || '') + ' ' + (a.werke || []).join(' ')).toLowerCase().includes(filter));
  // Gewählte zuerst – die sind das, worum es geht.
  html += items.filter(a => selIds.has(String(a.id))).map(a => row(a, true)).join('');
  if (!filter) html += sel.filter(a => !loadedIds.has(a.id) && !_nfAssetVon(a.id)).map(a => row(a, true)).join('');
  // Dann die des eigenen Werks und die konzernweiten; fremde Werke darunter –
  // wählbar bleiben sie: Ein HOL-Prozess kann an einem Server in WGC hängen.
  const offen = items.filter(a => !selIds.has(String(a.id)));
  const eigene = offen.filter(a => nfAssetPasst(a, _lkWerk));
  const fremde = offen.filter(a => !nfAssetPasst(a, _lkWerk));
  html += eigene.map(a => row(a, false)).join('');
  if (fremde.length) html += `<div class="field-hint" style="margin:8px 0 4px;border-top:1px dashed var(--c-border);padding-top:6px">Assets anderer Werke (${fremde.length}) – laut Liste nicht in ${esc(lkWerkLabel(_lkWerk))}:</div>`
    + fremde.map(a => row(a, false)).join('');
  return html || '<div class="field-hint">Keine Treffer.</div>';
}

function _nfLueckenNeu() {
  const el = document.getElementById('nf-luecken');
  if (el && _nfEditing) el.innerHTML = _nfLueckenHtml();
}

function _nfLueckenHtml() {
  const k = { id: _nfEditing.id, name: _nfEditing.name, verantwortlich: _nfEditing.verantwortlich, bcm: _nfEditing.bcm };
  const p = nfPruefung(k, { assetRto: Object.assign({}, _nfAssetRtoMap(), _nfEditing.assetRto), assetInfo: _nfAssetInfo(), uebungen: _nfUebungen || [], werk: _lkWerk });
  if (!p.fehler.length && !p.hinweise.length) return `<div class="col-warning" style="display:block;border-color:#bbf7d0;background:#f0fdf4;color:#166534">✓ Vollständig – nichts fehlt.</div>`;
  return `${p.fehler.length ? `<div class="col-warning" style="display:block"><b>Lücken (${p.fehler.length}):</b>
    <ul style="margin:6px 0 0 18px;padding:0">${p.fehler.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${p.hinweise.length ? `<div class="field-hint" style="margin-top:6px">Hinweise: ${p.hinweise.map(esc).join(' · ')}</div>` : ''}`;
}

function renderNfEditor() {
  const e = _nfEditing;
  if (!e) return;
  const b = e.bcm, p = b.plan;
  const schreiben = nfDarfSchreiben();
  const ro = schreiben ? '' : ' disabled';
  const zeit = (feld, label, hilfe) => {
    const v = nfDauerEingabe(b[feld]);
    return `<div class="form-group"><label>${label}${b.kritikalitaet === 'hoch' && feld !== 'mtpd' ? ' <span class="req">*</span>' : ''}</label>
      <div style="display:flex;gap:6px"><input type="number" min="0" step="0.5" id="nf-${feld}-wert" value="${esc(v.wert)}" style="width:90px" onchange="nfZeit('${feld}')"${ro}>
      <select id="nf-${feld}-einheit" onchange="nfZeit('${feld}')"${ro}>${['min', 'h', 'tage'].map(x => `<option value="${x}"${v.einheit === x ? ' selected' : ''}>${x === 'tage' ? 'Tage' : x === 'h' ? 'Stunden' : 'Minuten'}</option>`).join('')}</select></div>
      <span class="field-hint">${hilfe}</span></div>`;
  };
  const uebungen = nfUebungenZu(_nfUebungen, _lkWerk, e.id);
  const kontakte = p.kontakte.map((x, i) => `<tr>
    <td><input type="text" value="${esc(x.rolle)}" oninput="nfKontaktSetzen(${i},'rolle',this.value)" placeholder="z. B. IT-Bereitschaft" style="width:100%"${ro}></td>
    <td><input type="text" list="lk-people" value="${esc(x.name)}" oninput="nfKontaktSetzen(${i},'name',this.value)" placeholder="Name oder E-Mail" style="width:170px"${ro}></td>
    <td><input type="text" value="${esc(x.telefon)}" oninput="nfKontaktSetzen(${i},'telefon',this.value)" placeholder="nachts erreichbar" style="width:140px"${ro}></td>
    <td>${schreiben ? `<button class="btn btn-ghost btn-sm" onclick="nfKontaktWeg(${i})" title="Entfernen">✕</button>` : ''}</td></tr>`).join('');

  openModal(`
    <div class="modal-header"><h3>🚨 ${esc(e.name)}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${e.unter ? `<p class="ic-desc" style="margin:0 0 10px">${esc(e.unter)}</p>` : ''}
      <div id="nf-luecken" style="margin-bottom:12px">${_nfLueckenHtml()}</div>

      <div style="font-weight:700;font-size:.9rem;margin:0 0 4px">Business-Impact-Analyse</div>
      <div class="field-hint" style="margin-bottom:8px">Was passiert, wenn dieser Prozess steht? Daraus folgt, wie schnell er wieder laufen muss.${b.standAm ? ` Stand ${fmtDate(b.standAm)}.` : ''}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        ${Object.entries(NF_KRITIKALITAET).map(([key, kr]) => `<label class="ack-check" style="font-weight:600;color:${kr.farbe};align-items:flex-start;flex:1;min-width:160px" title="${esc(kr.text)}">
          <input type="radio" name="nf-krit" ${b.kritikalitaet === key ? 'checked' : ''} onchange="nfKritSetzen('${key}')"${ro}> <span>${esc(kr.label)}<div style="font-weight:400;font-size:.72rem;color:var(--c-muted)">${esc(kr.text)}</div></span></label>`).join('')}
      </div>
      <div class="form-grid">
        <div class="form-group full"><label>Auswirkung bei Ausfall</label>
          <textarea oninput="_nfEditing.bcm.auswirkung=this.value" placeholder="Finanziell (je Tag), rechtlich (Fristen, Meldepflichten), Kunden, Sicherheit von Menschen – konkret." ${ro}>${esc(b.auswirkung)}</textarea></div>
        ${zeit('mtpd', 'MTPD – maximal tolerierbare Ausfallzeit', 'Ab wann ist der Schaden nicht mehr tragbar?')}
        ${zeit('rto', 'RTO – Wiederanlaufzeit', 'Bis wann muss er wieder laufen? Muss unter der MTPD liegen.')}
        ${zeit('rpo', 'RPO – tolerierbarer Datenverlust', 'Wie alt darf der letzte gesicherte Stand sein?')}
      </div>
      <div id="nf-eskalation" style="margin-top:4px">${_nfEskalationHtml()}</div>

      <div style="font-weight:700;font-size:.9rem;margin:14px 0 4px">Wovon hängt der Prozess ab? <span class="field-hint" style="font-weight:400">${b.assets.length} Asset(s)</span></div>
      <div class="field-hint" style="margin-bottom:6px">${_nfRegister() ? 'Aus dem <b>Assetregister</b> – Schutzbedarf, Werk und Wiederherstellzeit kommen von dort.' : 'Aus der ISMS-Liste „Assets".'} Je Asset die Wiederherstellzeit – gilt für alle Prozesse, die daran hängen: Ein Prozess kann nicht schneller wieder da sein als das Langsamste, wovon er abhängt.</div>
      <input type="text" id="nf-asset-filter" class="sort-select" placeholder="Assets filtern …" oninput="document.getElementById('nf-assets').innerHTML=_nfAssetsHtml()" style="width:100%;margin-bottom:6px">
      <div id="nf-assets" style="max-height:220px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:6px 10px">${_nfAssetsHtml()}</div>

      <div style="font-weight:700;font-size:.9rem;margin:16px 0 4px">Notfallplan${p.standAm ? ` <span class="field-hint" style="font-weight:400">Stand ${fmtDate(p.standAm)}</span>` : ''}</div>
      <div class="field-hint" style="margin-bottom:8px">In der Reihenfolge, in der er gebraucht wird. Kurz, konkret, für jemanden, der den Prozess nicht kennt. Die ersten drei Teile sind Pflicht.</div>
      <div class="form-grid">
        <div class="form-group full"><label>Verantwortlich für den Plan</label>
          <input type="text" list="lk-people" value="${esc(p.verantwortlich)}" oninput="nfPlanFeld('verantwortlich',this.value)" placeholder="${esc(e.verantwortlich ? 'leer = Prozessverantwortliche(r) ' + _nfName(e.verantwortlich) : 'name@dihag.com')}"${ro}>
          <datalist id="lk-people">${(typeof _lkPeopleOptions === 'function') ? _lkPeopleOptions() : ''}</datalist></div>
        ${NF_PLAN_TEILE.map(t => `<div class="form-group full"><label>${esc(t.titel)}${t.pflicht ? ' <span class="req">*</span>' : ''}</label>
          <textarea oninput="nfPlanFeld('${t.id}',this.value)" placeholder="${esc(t.frage)}" style="min-height:${t.pflicht ? 80 : 56}px"${ro}>${esc(p[t.id])}</textarea></div>`).join('')}
      </div>
      <div style="font-weight:700;font-size:.85rem;margin:10px 0 4px">Kontakte <span class="req">*</span></div>
      <div class="field-hint" style="margin-bottom:6px">Wen ruft man um drei Uhr nachts an? Rollen zuerst, dann die Person, die sie gerade hat.</div>
      <table class="tbl" style="font-size:.8rem;width:100%"><thead><tr><th>Rolle</th><th>Name</th><th>Telefon</th><th></th></tr></thead>
        <tbody>${kontakte || '<tr><td colspan="4" style="color:var(--c-muted)">Noch kein Kontakt.</td></tr>'}</tbody></table>
      ${schreiben ? `<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="nfKontaktHinzu()">+ Kontakt</button>` : ''}

      <div style="font-weight:700;font-size:.9rem;margin:16px 0 4px">Übungen</div>
      <div class="field-hint" style="margin-bottom:6px">Ein Plan ohne Übung ist Papier. Übungen stehen im Wirksamkeits-Register – gefundene Lücken werden dort zu Abweichungen, und die haben Fristen.</div>
      ${uebungen.length ? `<table class="tbl" style="font-size:.8rem;width:100%"><thead><tr><th>Datum</th><th>Art</th><th>Bezeichnung</th><th>Status</th><th>Nachweis</th></tr></thead>
        <tbody>${uebungen.map(u => `<tr onclick="${typeof openWirkEditor === 'function' ? `openWirkEditor('${esc(u.id)}')` : ''}" style="cursor:pointer">
          <td style="white-space:nowrap">${fmtDate(u.datum)}</td><td>${esc((NF_UEBUNGSARTEN[u.uebungsart] || {}).label || u.uebungsart || '–')}</td><td>${esc(u.titel)}</td><td>${esc(u.status)}</td>
          <td>${typeof wirkAbschlussfehler === 'function' && wirkAbschlussfehler(u).length ? `<span style="color:#b45309">${wirkAbschlussfehler(u).length} offen</span>` : '<span style="color:#15803d">✓</span>'}</td></tr>`).join('')}</tbody></table>`
        : `<div class="field-hint">${nfHatPlan({ bcm: b }) ? '<span style="color:#b45309;font-weight:600">Nie geübt.</span>' : 'Noch keine Übung – erst der Plan, dann die Übung.'}</div>`}
      ${schreiben && typeof wirkUebungFuer === 'function' ? `<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="nfUebungErfassen()">+ Übung erfassen</button>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost btn-sm" onclick="nfPlanDrucken('${esc(e.id)}')" title="Diesen Plan als PDF – für die Schublade">🖨 Plan drucken</button>
      <div style="flex:1"></div>
      ${schreiben ? `<button class="btn btn-primary" id="nf-save-btn" onclick="nfKachelSpeichern()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, true, { label: 'Notfallplan bearbeiten' });
}

function nfUebungErfassen() {
  if (!_nfEditing || typeof wirkUebungFuer !== 'function') return;
  const e = _nfEditing;
  wirkUebungFuer(nfZiel(_lkWerk, e.id), e.name, _lkWerk === 'KONZERN' ? '' : _lkWerk, nfUebungenNeu);
}

async function nfKachelSpeichern() {
  if (!nfDarfSchreiben() || !_nfEditing) return;
  const e = _nfEditing;
  const k = lkKachelVonId(e.id);
  if (!k) return;
  const b = e.bcm;
  // Die eine Verweigerung: Wer „hoch" sagt, muss RTO und RPO nennen (R093).
  // Sonst steht „kritisch" da und niemand weiß, was das heißt.
  if (b.kritikalitaet === 'hoch' && (b.rto === '' || b.rpo === '')) {
    toast('Kritikalität „hoch" verlangt RTO und RPO (Reifegrad R093) – oder vorerst „mittel" wählen.', 'error', 6000);
    return;
  }
  const alt = nfBcmVon(k);
  const biaAlt = JSON.stringify([alt.kritikalitaet, alt.auswirkung, alt.mtpd, alt.rto, alt.rpo, alt.assets]);
  const biaNeu = JSON.stringify([b.kritikalitaet, b.auswirkung, b.mtpd, b.rto, b.rpo, b.assets]);
  const planAlt = JSON.stringify(Object.assign({}, alt.plan, { standAm: '' }));
  const planNeu = JSON.stringify(Object.assign({}, b.plan, { standAm: '' }));
  if (biaAlt !== biaNeu) b.standAm = new Date().toISOString();
  if (planAlt !== planNeu) b.plan.standAm = new Date().toISOString();
  k.bcm = b;
  // Wiederherstellzeiten: mit Register dorthin (eine Wahrheit), sonst in die Landkarte.
  if (_nfRegister()) {
    const darf = typeof canWriteTab !== 'function' || canWriteTab('assets');
    for (const [id, h] of Object.entries(e.registerRto || {})) {
      const a = _nfAssetVon(id);
      if (!a || !darf) continue;
      try { await spUpdateAsset(a.id, Object.assign({}, a, { wiederherstellung: h })); a.wiederherstellung = h; }
      catch (err) { toast(`Wiederherstellzeit „${a.title}" nicht gespeichert: ${err.message}`, 'error'); }
    }
  } else nfDaten().assetRto = e.assetRto;
  const teile = [];
  if (alt.kritikalitaet !== b.kritikalitaet) teile.push(`Kritikalität ${alt.kritikalitaet || '–'} → ${b.kritikalitaet || '–'}`);
  if (alt.rto !== b.rto) teile.push(`RTO ${nfDauerText(alt.rto) || '–'} → ${nfDauerText(b.rto) || '–'}`);
  if (planAlt !== planNeu) teile.push('Plan geändert');
  if (JSON.stringify(alt.assets) !== JSON.stringify(b.assets)) teile.push(`${b.assets.length} Asset(s)`);
  const btn = document.getElementById('nf-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  const p = nfPruefung(k, _nfKontext());
  closeModal();
  _nfEditing = null;
  if (await lkSpeichern(p.fehler.length ? `Gespeichert – ${p.fehler.length} Lücke(n) bleiben` : 'Gespeichert ✓',
      `Notfall: „${k.name}"${teile.length ? ' – ' + teile.join('; ') : ' gespeichert'}`, 'notfall')) renderNotfall();
}

/* ── Druck ── */

function _nfFenster(html) {
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up-Blocker? Bitte Pop-ups erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function _nfDruckDaten(nurKachel) {
  const karte = lkKarte();
  return { werk: _lkWerk, werkLabel: lkWerkLabel(_lkWerk), karte, stab: karte.krisenstab || null,
    assetRto: _nfAssetRtoMap(), uebungen: _nfUebungen || [], personName: _nfName,
    stand: new Date().toLocaleString('de-DE'), nurKachel: nurKachel || '' };
}

function nfHandbuchDrucken() { _nfFenster(nfHandbuchHtml(_nfDruckDaten())); }
function nfAlarmkarteDrucken() { _nfFenster(nfAlarmkarteHtml(_nfDruckDaten())); }
function nfPlanDrucken(id) {
  // Aus dem Editor heraus zählt der Stand im Editor – auch ungespeichert.
  if (_nfEditing && _nfEditing.id === id) {
    const d = _nfDruckDaten(id);
    const k = JSON.parse(JSON.stringify(lkKachelVonId(id) || {}));
    k.bcm = _nfEditing.bcm;
    d.karte = { kacheln: [k] };
    d.assetRto = _nfEditing.assetRto;
    _nfFenster(nfHandbuchHtml(d));
    return;
  }
  _nfFenster(nfHandbuchHtml(_nfDruckDaten(id)));
}

/* ── Haken für die Landkarte ──
   Die Kachel zeigt ihren Notfall-Stand, ohne dass die Landkarte das Modell
   kennen muss – sie fragt nur, ob es diese Funktionen gibt. */

/** Kleines Zeichen auf der Kachel: kritischer Prozess. */
function nfKachelMarker(k) {
  const b = nfBcmVon(k);
  if (b.kritikalitaet !== 'hoch') return '';
  return `<span title="Kritischer Prozess (RTO ${esc(nfDauerText(b.rto) || '–')})${nfHatPlan(k) ? '' : ' – ohne Notfallplan'}" style="font-size:.7rem">🚨</span>`;
}

/** Die Notfall-Zeile im Kachel-Dialog der Landkarte. */
function nfKachelZeile(k, werk) {
  const b = nfBcmVon(k);
  const darf = typeof canReadTab !== 'function' || canReadTab('notfall');
  if (!darf) return '';
  const letzte = nfLetzteUebung(_nfUebungen, werk, k.id);
  if (_nfAssets === null) _nfAssetsLaden();
  const p = nfPruefung(k, _nfKontext(werk));
  const text = !b.kritikalitaet ? '<span style="color:#b45309">Keine Business-Impact-Analyse</span>'
    : `Kritikalität ${_nfKritBadge(b.kritikalitaet)}${b.rto !== '' ? ` · RTO <b>${esc(nfDauerText(b.rto))}</b>` : ''}${
      b.kritikalitaet === 'niedrig' ? '' : ` · Plan ${nfHatPlan(k) ? '<span style="color:#15803d">✓</span>' : '<span style="color:#b91c1c">fehlt</span>'}`}${
      letzte ? ` · geübt ${fmtDate(letzte.datum)}` : ''}${p.fehler.length ? ` · <span style="color:#b91c1c">${p.fehler.length} Lücke(n)</span>` : ''}`;
  return `<div style="margin:0 0 14px;font-size:.86rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    <span>🚨 ${text}</span>
    <button class="btn btn-outline btn-sm" onclick="closeModal();nfKachelOeffnen('${esc(k.id)}')">Notfallplan</button></div>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nfDarfSchreiben, nfDaten, renderNotfall, nfKachelZeile, nfKachelMarker };
}
