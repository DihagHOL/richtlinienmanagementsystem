'use strict';

/**
 * Reiter „Assetregister" – die Ansicht
 * ====================================
 * Das Modell steht in `js/assetmodell.js`, die Liste in `js/sharepoint.js`
 * (die Liste „Assets" auf der ISMS-Site – dieselbe, die es schon gab, jetzt
 * geführt statt nur gelesen). Hier ist nur, was den Browser braucht: Tabelle
 * mit Filtern, Editor, CSV und das gedruckte Inventar (A.5.9 will es vorzeigbar).
 *
 * Die Spalten: Was die Liste schon hat, wird tolerant gelesen (Typ statt
 * Kategorie, Owner statt Verantwortlich, ein einzelner Schutzbedarf für alle
 * drei Ziele). Was fehlt, nennt der Reiter mit Typ – anlegen kann man es in
 * SharePoint selbst oder auf Knopfdruck hier. Nie still.
 *
 * Was das Register mit dem Rest verbindet, ohne dass hier etwas doppelt
 * gespeichert würde:
 *   • Prozesse (Landkarte) hängen an Asset-Ids → „Verwendung" im Editor,
 *     Schutzbedarfs-Vererbung als Hinweis.
 *   • Risiken verweisen auf Asset-Ids → „Risiken" im Editor.
 *   • Notfall liest Wiederherstellzeit und Abhängigkeiten von hier.
 *   • Zusatzfelder kommen aus den Einstellungen – kein Feld ist hier fest
 *     verdrahtet, das dort nicht stünde.
 */

let _am = null;                // Assets (roh aus der Liste); null = noch nicht geladen
let _amLoading = false;
let _amEditing = null;
let _amFilter = { q: '', werk: '', kategorie: '', verf: '', status: '' };
let _amMembers = null;
let _amLandkarte = null;       // Landkarte-Daten (nur lesen) – wer hängt an welchem Asset?
let _amRisiken = null;         // Risiken (leise) – welche verweisen auf das Asset?

function amDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('assets'); }
function _amCfg() { return (typeof getAccessConfig === 'function') ? getAccessConfig() : {}; }
function _amKats() { return amKategorien(_amCfg()); }
function _amFelder() { return amZusatzfelder(_amCfg()); }
function _amKat(key) { const k = amKategorieKey(key, _amKats()); return _amKats().find(x => x.key === k) || null; }
function _amName(upn) {
  const u = String(upn || '').trim();
  const t = (_amMembers || []).find(m => String(m.upn || '').toLowerCase() === u.toLowerCase());
  return (t && t.name) || u;
}
function _amPeople() { return (_amMembers || []).map(u => `<option value="${esc(u.upn)}">${esc(u.name)}</option>`).join(''); }
function _amWerke() { return (typeof nfSichtbareWerke === 'function') ? nfSichtbareWerke() : null; }
function _amHeute() { return new Date().toISOString().slice(0, 10); }
function _amDauer(h) { return (typeof nfDauerText === 'function') ? nfDauerText(h) : (h === '' ? '' : `${h} h`); }

/** Die Prozesse der Landkarte, die an diesem Asset hängen – über beide Ids (Register und alte Liste). */
function _amProzesseVon(id, quelleId) {
  const karten = (_amLandkarte && _amLandkarte.karten) || {};
  const ids = new Set([String(id || ''), String(quelleId || '')].filter(Boolean));
  const out = [];
  Object.keys(karten).forEach(werk => (karten[werk].kacheln || []).forEach(k => {
    const b = (k.bcm && typeof k.bcm === 'object') ? k.bcm : {};
    if ((Array.isArray(b.assets) ? b.assets : []).some(a => a && ids.has(String(a.id)))) {
      out.push({ werk, id: k.id, name: k.name, kritikalitaet: b.kritikalitaet || '', rto: b.rto === undefined ? '' : b.rto });
    }
  }));
  return out;
}
function _amRisikenVon(id, quelleId) {
  const ids = new Set([String(id || ''), String(quelleId || '')].filter(Boolean));
  return (_amRisiken || []).filter(r => (r.assets || []).some(a => a && ids.has(String(a.id))) && r.status !== 'geschlossen');
}

/* ── Laden ── */

async function initAssets() {
  const mount = document.getElementById('assets-mount');
  if (!mount) return;
  if (_am) { renderAssets(); return; }
  mount.innerHTML = '<div class="doc-loading">Lade Assetregister …</div>';
  _amLoading = true;
  try {
    _am = await spGetAssetRegister();
  } catch (e) {
    _am = null; _amLoading = false;
    const listUrl = (typeof spAssetsListUrl === 'function') ? spAssetsListUrl() : 'https://dihag.sharepoint.com/sites/ISMS/Lists/Assets/AllItems.aspx';
    const cols = (typeof ASSET_COLUMNS !== 'undefined') ? ASSET_COLUMNS : [];
    mount.innerHTML = `<div class="col-warning" style="display:block">
      <b>Register nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:10px">Das Register ist die Liste <b>„Assets"</b> auf der ISMS-Site:
        <a href="${esc(listUrl)}" target="_blank" rel="noopener">${esc(listUrl)}</a>. Gibt es sie nicht, legt die App sie beim ersten Zugriff an –
        dafür braucht Ihr Konto dort das Recht, Listen zu erstellen.</div>
      <div style="margin-top:8px"><b>Erwartete Spalten</b> (Name genau so, Typ):</div>
      <div style="margin-top:8px;line-height:1.9">${cols.map(c => `<code>${esc(c.name)}</code> <span style="color:var(--c-muted)">(${esc(c.typ)})</span>`).join(' · ')}</div></div>`;
    return;
  }
  _amLoading = false;
  if (!_amMembers && typeof spGetMembers === 'function') spGetMembers().then(m => { _amMembers = m || []; renderAssets(); }).catch(() => { _amMembers = []; });
  if (!_amLandkarte && typeof spLoadLandkarte === 'function') spLoadLandkarte().then(g => { _amLandkarte = (g && g.daten) || {}; renderAssets(); }).catch(() => { _amLandkarte = {}; });
  if (!_amRisiken) {
    if (typeof _risks !== 'undefined' && Array.isArray(_risks)) _amRisiken = _risks;
    else if (typeof spGetRisks === 'function') spGetRisks().then(r => { _amRisiken = r || []; renderAssets(); }).catch(() => { _amRisiken = []; });
  }
  renderAssets();
}

async function refreshAssets() {
  _am = null;
  await initAssets();
  if (typeof toast === 'function') toast('Register aktualisiert', 'success');
}

/* ── Die Tabelle ── */

function _amGefiltert() {
  const f = _amFilter;
  const sichtbar = _amWerke();
  let rows = (_am || []).map(amVon).filter(a => amSichtbar(a, sichtbar));
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter(a => [a.titel, a.beschreibung, a.standort, a.verantwortlich, a.hersteller, a.lieferant, a.tags.join(' '), a.werke.join(' '),
      Object.values(a.zusatz).join(' ')].join(' ').toLowerCase().includes(q));
  }
  if (f.werk) rows = rows.filter(a => a.werke.includes(f.werk) || a.werke.includes('ALLE'));
  if (f.kategorie) rows = rows.filter(a => amKategorieKey(a.kategorie, _amKats()) === f.kategorie);
  if (f.verf) rows = rows.filter(a => amRang(a.verfuegbarkeit) === amRang(f.verf));
  if (f.status) rows = rows.filter(a => a.status === f.status);
  else rows = rows.filter(a => a.status !== 'außer Betrieb');
  // Was drängt, steht oben: Lücken, dann „sehr hoch", dann Name.
  const rang = (a) => { const l = amLuecken(a, { prozesse: _amProzesseVon(a.id, a.quelleId) }); return (l.fehler.length ? 0 : 1) * 10 + (2 - Math.max(0, amRang(a.verfuegbarkeit))); };
  rows.sort((x, y) => (rang(x) - rang(y)) || x.titel.localeCompare(y.titel, 'de'));
  return rows;
}

function _amSb(v) {
  if (!v) return '<span style="color:var(--c-faint)">–</span>';
  const r = amRang(v);
  const col = r === 2 ? '#b91c1c' : r === 1 ? '#b45309' : r === 0 ? '#15803d' : '#6b7280';
  return `<span style="color:${col};font-weight:700;font-size:.75rem" title="${r < 0 ? 'Bewertung aus der Liste – nicht einzuordnen' : 'Rang: ' + esc(amStufeLabel(r))}">${esc(v)}</span>`;
}

function renderAssets() {
  const mount = document.getElementById('assets-mount');
  if (!mount) return;
  if (!_am) { if (!_amLoading) initAssets(); return; }
  const canWrite = amDarfSchreiben();
  const kats = _amKats();
  const werke = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];
  const sichtbar = _amWerke();
  const z = amKennzahlen(_am, { prozesseVon: _amProzesseVon, werke: sichtbar, heute: _amHeute() });
  const missing = (typeof spMissingAssetColumns === 'function') ? spMissingAssetColumns() : [];
  const faellig = amFaelligkeiten((_am || []).filter(a => amSichtbar(a, sichtbar)), AM_VORLAUF_TAGE, _amHeute());

  const kpi = (n, label, col) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  const rows = _amGefiltert();
  const table = rows.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem">
    <thead><tr><th>Asset</th><th>Kategorie</th><th>Werke</th><th>Verantwortlich</th><th title="Vertraulichkeit">V</th><th title="Integrität">I</th><th title="Verfügbarkeit">A</th><th>Klassif.</th><th>Wiederherst.</th><th>Prozesse</th><th>Risiken</th><th>Status</th><th>Lücken</th></tr></thead>
    <tbody>${rows.map(a => {
      const k = _amKat(a.kategorie);
      const pr = _amProzesseVon(a.id, a.quelleId);
      const ri = _amRisikenVon(a.id, a.quelleId);
      const l = amLuecken(a, { prozesse: pr, heute: _amHeute() });
      return `<tr onclick="openAssetEditor('${esc(a.id)}')" style="cursor:pointer${a.status === 'außer Betrieb' ? ';opacity:.55' : ''}">
        <td><b>${esc(a.titel)}</b>${a.standort ? `<div style="font-size:.68rem;color:var(--c-faint)">${esc(a.standort)}</div>` : ''}${a.abhaengigVon.length ? `<div style="font-size:.68rem;color:var(--c-faint)">↳ hängt an ${a.abhaengigVon.length} Asset(s)</div>` : ''}</td>
        <td style="white-space:nowrap">${k ? `${k.symbol} ${esc(k.label)}` : (a.kategorie ? `<span title="Aus der Liste – keiner Kategorie zugeordnet">${esc(a.kategorie)}</span>` : '<span style="color:#b45309">–</span>')}</td>
        <td style="white-space:nowrap">${a.werke.length ? (a.werke.includes('ALLE') ? 'konzernweit' : esc(a.werke.join(', '))) : '<span style="color:#b45309">–</span>'}</td>
        <td style="color:var(--c-muted)">${a.verantwortlich ? esc(_amName(a.verantwortlich)) : '<span style="color:#b91c1c">–</span>'}</td>
        <td>${_amSb(a.vertraulichkeit)}</td><td>${_amSb(a.integritaet)}</td><td>${_amSb(a.verfuegbarkeit)}</td>
        <td style="white-space:nowrap">${esc(a.klassifizierung) || '<span style="color:var(--c-faint)">–</span>'}</td>
        <td style="white-space:nowrap">${a.wiederherstellung === '' ? '<span style="color:var(--c-faint)">–</span>' : esc(_amDauer(a.wiederherstellung))}</td>
        <td title="${esc(pr.map(p => p.name).join(', '))}">${pr.length ? `${pr.length}${pr.some(p => p.kritikalitaet === 'hoch') ? ' <span style="color:#b91c1c" title="darunter kritische">🚨</span>' : ''}` : '<span style="color:var(--c-faint)">–</span>'}</td>
        <td>${ri.length || '<span style="color:var(--c-faint)">–</span>'}</td>
        <td style="white-space:nowrap">${esc(a.status)}</td>
        <td>${l.fehler.length ? `<span title="${esc(l.fehler.join(' · '))}" style="color:#b91c1c;font-weight:600">${l.fehler.length}</span>`
          : (l.hinweise.length ? `<span title="${esc(l.hinweise.join(' · '))}" style="color:#b45309">${l.hinweise.length} Hinweis(e)</span>` : '<span style="color:#15803d;font-weight:600">✓</span>')}</td>
      </tr>`; }).join('')}</tbody></table></div>`
    : emptyState(_am.length ? 'Keine Treffer für die aktuelle Filterung.' : 'Noch kein Asset erfasst – oben anlegen oder aus der ISMS-Liste „Assets" übernehmen.', _am.length ? '🔍' : '🗂');

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Das Inventar nach <b>ISO 27001 A.5.9</b>: jedes Asset mit Verantwortlichem, <b>Schutzbedarf</b> (Vertraulichkeit, Integrität,
      Verfügbarkeit nach BSI), <b>Klassifizierung</b> (A.5.12), Werk, Wiederherstellzeit, Abhängigkeiten, Lebenszyklus und Lieferant.
      Risiken und Notfallpläne verweisen hierher – die Wiederherstellzeit hier ist die Zahl, an der jede Prozess-RTO hängt.
    </div>
    ${missing.length ? `<div class="col-warning" style="display:block;margin-bottom:12px">
      <b>⚠ In der Liste „Assets" fehlen ${missing.length} von ${(typeof ASSET_COLUMNS !== 'undefined' ? ASSET_COLUMNS : []).length} erwarteten Spalten</b> – was dort nicht steht, kann die App nicht speichern:
      <div style="margin-top:6px;line-height:1.9">${missing.map(n => { const c = (typeof ASSET_COLUMNS !== 'undefined' ? ASSET_COLUMNS : []).find(x => x.name === n); return `<code>${esc(n)}</code> <span style="color:var(--c-muted)">(${esc(c ? c.typ : '')})</span>`; }).join(' · ')}</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <a href="${esc((typeof spAssetsListUrl === 'function') ? spAssetsListUrl() : '#')}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Liste in SharePoint öffnen ↗</a>
        ${canWrite ? `<button class="btn btn-primary btn-sm" onclick="assetsSpaltenAnlegen()" title="Legt genau diese Spalten mit diesen Typen an – nichts Vorhandenes wird verändert">Fehlende Spalten jetzt anlegen</button>` : ''}
        <span class="field-hint">Vorhandene Spalten mit anderen Namen (Typ, Owner, Schutzbedarf, RTO …) werden zum Lesen weiter erkannt.</span>
      </div></div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kpi(z.aktiv, 'Assets aktiv', '#17509e')}
      ${kpi(z.ohneVerantwortlichen, 'ohne Verantwortlichen', z.ohneVerantwortlichen ? '#b91c1c' : '#15803d')}
      ${kpi(z.ohneSchutzbedarf, 'ohne Schutzbedarf', z.ohneSchutzbedarf ? '#b45309' : '#15803d')}
      ${kpi(`${z.sehrHoch - z.sehrHochOhneRto}/${z.sehrHoch}`, '„sehr hoch" mit Wiederherstellzeit', z.sehrHochOhneRto ? '#b91c1c' : '#15803d')}
      ${kpi(z.faellig, `EOL / Vertrag in ${AM_VORLAUF_TAGE} Tagen`, z.faellig ? '#b45309' : '#15803d')}
      ${kpi(z.fehler, 'Lücken gesamt', z.fehler ? '#b45309' : '#15803d')}
    </div>
    ${(typeof spAssetSpaltenBericht === 'function') ? `<details style="margin-bottom:12px;font-size:.8rem"><summary style="cursor:pointer;color:var(--c-muted)">Spaltenzuordnung – so liest die App Ihre Liste</summary>
      <div style="overflow-x:auto;margin-top:6px"><table class="tbl" style="font-size:.78rem"><thead><tr><th>Die App erwartet</th><th>Gefunden in der Liste</th><th>Typ</th><th>Auswahl</th></tr></thead><tbody>${
        spAssetSpaltenBericht().map(b => `<tr><td><code>${esc(b.erwartet)}</code></td><td>${b.gefunden ? `${esc(b.anzeige)}${b.anzeige !== b.gefunden ? ` <span style="color:var(--c-faint)">(${esc(b.gefunden)})</span>` : ''}` : '<span style="color:#b45309">fehlt</span>'}</td><td>${esc(b.spaltentyp || b.typ)}</td><td style="color:var(--c-muted)">${esc((b.choices || []).join(' · '))}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    ${z.vererbung ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>${z.vererbung} Asset(s) mit zu niedrigem Schutzbedarf</b> – Prozesse, die daran hängen, verlangen mehr (Vererbung nach BSI-Maximumprinzip). Steht in der Spalte „Lücken" als Hinweis.</div>` : ''}
    ${faellig.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Läuft aus:</b> ${faellig.slice(0, 6).map(f => `${esc(f.asset.titel)} (${esc(f.was)} ${f.ueberfaellig ? `seit ${-f.tage} Tagen` : `in ${f.tage} Tagen`})`).join(' · ')}${faellig.length > 6 ? ` · +${faellig.length - 6}` : ''}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input type="text" class="sort-select" placeholder="Suchen …" value="${esc(_amFilter.q)}" oninput="_amFilter.q=this.value;renderAssets()" style="width:200px">
      <select class="sort-select" onchange="_amFilter.werk=this.value;renderAssets()">
        <option value="">alle Werke</option>${werke.filter(w => !sichtbar || sichtbar.includes(w)).map(w => `<option value="${esc(w)}"${_amFilter.werk === w ? ' selected' : ''}>${esc(w)}</option>`).join('')}
      </select>
      <select class="sort-select" onchange="_amFilter.kategorie=this.value;renderAssets()">
        <option value="">alle Kategorien</option>${kats.map(k => `<option value="${esc(k.key)}"${_amFilter.kategorie === k.key ? ' selected' : ''}>${k.symbol} ${esc(k.label)}</option>`).join('')}
      </select>
      <select class="sort-select" onchange="_amFilter.verf=this.value;renderAssets()">
        <option value="">Verfügbarkeit: alle</option>${AM_SCHUTZBEDARF.map(v => `<option value="${esc(v)}"${_amFilter.verf === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
      <select class="sort-select" onchange="_amFilter.status=this.value;renderAssets()">
        <option value="">Status: in Betrieb</option>${AM_STATUS.map(v => `<option value="${esc(v)}"${_amFilter.status === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      <button class="btn btn-outline btn-sm" onclick="assetsExportCsv()">⬇ CSV</button>
      <button class="btn btn-outline btn-sm" onclick="assetsInventarDrucken()" title="Das Inventar als PDF – der Nachweis zu A.5.9">🖨 Inventar</button>
      <a href="${esc((typeof spAssetsListUrl === 'function') ? spAssetsListUrl() : '#')}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" title="Dieselbe Liste in SharePoint">↗ SharePoint</a>
      ${canWrite ? `<button class="btn btn-primary btn-sm" onclick="openAssetEditor(null)">+ Asset</button>` : ''}
    </div>
    ${canWrite ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> auf dieses Register.</div>'}
    ${table}`;
}

/* ── Der Editor ── */

function _amNeu() {
  const upn = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
  return amVon({ id: '', verantwortlich: upn, status: 'aktiv', werke: [] });
}

function openAssetEditor(id) {
  const src = id ? (_am || []).find(a => String(a.id) === String(id)) : null;
  if (id && !src) return;
  _amEditing = src ? amVon(JSON.parse(JSON.stringify(src))) : _amNeu();
  renderAssetEditor();
}

function amSet(feld, wert) { if (_amEditing) { _amEditing[feld] = wert; _amLueckenNeu(); } }
function amZeit(feld) {
  const w = document.getElementById(`am-${feld}-wert`), e = document.getElementById(`am-${feld}-einheit`);
  _amEditing[feld] = (typeof nfDauerStunden === 'function') ? nfDauerStunden(w ? w.value : '', e ? e.value : 'h') : (w && w.value !== '' ? Number(w.value) : '');
  _amLueckenNeu();
}
function amWerkToggle(code, an) {
  const w = _amEditing.werke;
  if (code === 'ALLE') { _amEditing.werke = an ? ['ALLE'] : []; renderAssetEditor(); return; }
  const i = w.indexOf(code);
  if (an && i < 0) w.push(code);
  if (!an && i >= 0) w.splice(i, 1);
  _amEditing.werke = w.filter(x => x !== 'ALLE');
  _amLueckenNeu();
}
function amZusatzSetzen(key, wert) { _amEditing.zusatz = _amEditing.zusatz || {}; _amEditing.zusatz[key] = wert; }
function amAbhToggle(id, an) {
  const k = String(id);
  const arr = _amEditing.abhaengigVon.filter(x => x !== k);
  if (an) {
    if (amKreis(_am || [], _amEditing.id || '(neu)', k) && _amEditing.id) {
      toast('Das ergäbe einen Kreis – das Asset hängt schon (mittelbar) an diesem.', 'error'); renderAssetEditor(); return;
    }
    arr.push(k);
  }
  _amEditing.abhaengigVon = arr;
  const el = document.getElementById('am-abh'); if (el) el.innerHTML = _amAbhHtml();
  _amLueckenNeu();
}

function _amAbhHtml() {
  const a = _amEditing;
  const filter = String(document.getElementById('am-abh-filter')?.value || '').toLowerCase().trim();
  const andere = (_am || []).map(amVon).filter(x => x.id && x.id !== a.id && x.status !== 'außer Betrieb')
    .filter(x => !filter || (x.titel + ' ' + x.kategorie).toLowerCase().includes(filter));
  const sel = new Set(a.abhaengigVon);
  const row = (x) => `<label class="ack-check" style="font-weight:500"><input type="checkbox" ${sel.has(x.id) ? 'checked' : ''} onchange="amAbhToggle('${esc(x.id)}',this.checked)">
    <span><b>${esc(x.titel)}</b> <span style="color:var(--c-faint)">${esc(amKurz(x, _amKats()))}</span></span></label>`;
  const gewaehlt = andere.filter(x => sel.has(x.id)), rest = andere.filter(x => !sel.has(x.id));
  return (gewaehlt.map(row).join('') + rest.slice(0, 60).map(row).join('')) || '<div class="field-hint">Keine anderen Assets.</div>';
}

function _amLueckenNeu() {
  const el = document.getElementById('am-luecken');
  if (el && _amEditing) el.innerHTML = _amLueckenHtml();
}
function _amLueckenHtml() {
  const a = _amEditing;
  const l = amLuecken(a, { prozesse: _amProzesseVon(a.id, a.quelleId), heute: _amHeute() });
  if (!l.fehler.length && !l.hinweise.length) return `<div class="col-warning" style="display:block;border-color:#bbf7d0;background:#f0fdf4;color:#166534">✓ Vollständig.</div>`;
  return `${l.fehler.length ? `<div class="col-warning" style="display:block"><b>Lücken (${l.fehler.length}):</b><ul style="margin:6px 0 0 18px;padding:0">${l.fehler.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${l.hinweise.length ? `<div class="field-hint" style="margin-top:6px">Hinweise: ${l.hinweise.map(esc).join(' · ')}</div>` : ''}`;
}

function _amZusatzHtml(a, ro) {
  const felder = _amFelder();
  if (!felder.length) return `<div class="field-hint">Keine Zusatzfelder definiert – unter <b>Einstellungen → Assetregister</b> lassen sich eigene anlegen (Text, Zahl, Datum, Auswahl, Ja/Nein).</div>`;
  return `<div class="form-grid">${felder.map(f => {
    const v = (a.zusatz || {})[f.key];
    const w = v === undefined || v === null ? '' : String(v);
    let inp;
    if (f.typ === 'zahl') inp = `<input type="number" step="any" value="${esc(w)}" onchange="amZusatzSetzen('${f.key}',this.value)"${ro}>`;
    else if (f.typ === 'datum') inp = `<input type="date" value="${esc(w.slice(0, 10))}" onchange="amZusatzSetzen('${f.key}',this.value)"${ro}>`;
    else if (f.typ === 'jaNein') inp = `<select onchange="amZusatzSetzen('${f.key}',this.value)"${ro}><option value=""${!w ? ' selected' : ''}>–</option><option value="ja"${w === 'ja' ? ' selected' : ''}>ja</option><option value="nein"${w === 'nein' ? ' selected' : ''}>nein</option></select>`;
    else if (f.typ === 'auswahl') inp = `<select onchange="amZusatzSetzen('${f.key}',this.value)"${ro}><option value="">–</option>${f.optionen.map(o => `<option value="${esc(o)}"${w === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else inp = `<input type="text" value="${esc(w)}" oninput="amZusatzSetzen('${f.key}',this.value)"${ro}>`;
    return `<div class="form-group"><label>${esc(f.label)}${f.pflicht ? ' <span class="req">*</span>' : ''}</label>${inp}</div>`;
  }).join('')}</div>`;
}

function renderAssetEditor() {
  const a = _amEditing;
  if (!a) return;
  const canWrite = amDarfSchreiben();
  const ro = canWrite ? '' : ' disabled';
  const kats = _amKats();
  const werke = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];
  const pr = _amProzesseVon(a.id, a.quelleId);
  const ri = _amRisikenVon(a.id, a.quelleId);
  const abhaengige = a.id ? amAbhaengige(_am || [], a.id) : [];
  const soll = amSollVerfuegbarkeit(pr);
  const zeit = (feld, label, hilfe, pflicht) => {
    const e = (typeof nfDauerEingabe === 'function') ? nfDauerEingabe(a[feld]) : { wert: a[feld], einheit: 'h' };
    return `<div class="form-group"><label>${label}${pflicht ? ' <span class="req">*</span>' : ''}</label>
      <div style="display:flex;gap:6px"><input type="number" min="0" step="0.5" id="am-${feld}-wert" value="${esc(e.wert)}" style="width:90px" onchange="amZeit('${feld}')"${ro}>
      <select id="am-${feld}-einheit" onchange="amZeit('${feld}')"${ro}>${['min', 'h', 'tage'].map(x => `<option value="${x}"${e.einheit === x ? ' selected' : ''}>${x === 'tage' ? 'Tage' : x === 'h' ? 'Stunden' : 'Minuten'}</option>`).join('')}</select></div>
      <span class="field-hint">${hilfe}</span></div>`;
  };
  // Die Auswahl zeigt, was die Spalte der Liste kennt (Choice), sonst die BSI-Skala; ein Wert,
  // der in keiner steht, bleibt als „(aus der Liste)" wählbar – nichts geht beim Öffnen verloren.
  const wahlVon = (spalte) => { const b = (typeof spAssetSpaltenBericht === 'function') ? spAssetSpaltenBericht().find(x => x.erwartet === spalte) : null; return (b && b.choices && b.choices.length) ? b.choices : null; };
  const sb = (feld, spalte, label, hilfe) => { const opts = wahlVon(spalte) || AM_SCHUTZBEDARF; const cur = a[feld];
    const drin = opts.some(v => String(v).toLowerCase() === cur);
    return `<div class="form-group"><label>${label}${cur && amRang(cur) >= 0 ? ` <span class="field-hint" style="font-weight:400">→ ${esc(amStufeLabel(amRang(cur)))}</span>` : ''}</label>
    <select onchange="amSet('${feld}',this.value.toLowerCase())"${ro}><option value=""${!cur ? ' selected' : ''}>– nicht bewertet –</option>${opts.map(v => `<option value="${esc(v)}"${String(v).toLowerCase() === cur ? ' selected' : ''}>${esc(v)}</option>`).join('')}${cur && !drin ? `<option value="${esc(cur)}" selected>${esc(cur)} (aus der Liste)</option>` : ''}</select>
    <span class="field-hint">${hilfe}</span></div>`; };
  const histRows = (a.historie || []).slice().reverse().slice(0, 15).map(h =>
    `<div style="font-size:.75rem;color:var(--c-muted);padding:2px 0">${fmtDateTime(h.datum)} · <b>${esc(h.wer || '')}</b> · ${esc(h.aktion || '')}</div>`).join('');

  openModal(`
    <div class="modal-header"><h3>🗂 ${a.id ? esc(a.titel) : 'Neues Asset'}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div id="am-luecken" style="margin-bottom:12px">${_amLueckenHtml()}</div>

      <div style="font-weight:700;font-size:.9rem;margin:0 0 6px">Stammdaten</div>
      <div class="form-grid">
        <div class="form-group full"><label>Bezeichnung <span class="req">*</span></label>
          <input type="text" value="${esc(a.titel)}" oninput="amSet('titel',this.value)" placeholder="z. B. SAP S/4HANA, Leitstand Gießerei 2, Kundenstammdaten"${ro}></div>
        <div class="form-group"><label>Kategorie <span class="req">*</span></label>
          <select onchange="amSet('kategorie',this.value)"${ro}><option value=""${!a.kategorie ? ' selected' : ''}>– wählen –</option>${kats.map(k => `<option value="${esc(k.key)}"${amKategorieKey(a.kategorie, kats) === k.key ? ' selected' : ''}>${k.symbol} ${esc(k.label)}</option>`).join('')}${a.kategorie && !kats.some(k => k.key === amKategorieKey(a.kategorie, kats)) ? `<option value="${esc(a.kategorie)}" selected>${esc(a.kategorie)} (aus der Liste)</option>` : ''}</select>
          <span class="field-hint">Nach BSI-Strukturanalyse; die Liste ist in den Einstellungen änderbar.</span></div>
        <div class="form-group"><label>Status</label>
          <select onchange="amSet('status',this.value)"${ro}>${AM_STATUS.map(v => `<option value="${esc(v)}"${a.status === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="form-group full"><label>Beschreibung</label>
          <textarea oninput="amSet('beschreibung',this.value)" placeholder="Was ist es, wofür wird es gebraucht, was ist besonders?"${ro}>${esc(a.beschreibung)}</textarea></div>
        <div class="form-group full"><label>Werke <span class="req">*</span></label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:6px">
            <label class="ack-check" style="font-weight:600"><input type="checkbox" ${a.werke.includes('ALLE') ? 'checked' : ''} onchange="amWerkToggle('ALLE',this.checked)"${ro}> konzernweit</label>
            ${werke.map(w => `<label class="ack-check" style="font-weight:500${a.werke.includes('ALLE') ? ';opacity:.5' : ''}"><input type="checkbox" ${a.werke.includes(w) ? 'checked' : ''} ${a.werke.includes('ALLE') ? 'disabled' : ''} onchange="amWerkToggle('${esc(w)}',this.checked)"${ro}> ${esc(w)}</label>`).join('')}
          </div><span class="field-hint">Die Trennung nach Gesellschaft und die Notfall-Sichten hängen daran.</span></div>
        <div class="form-group"><label>Standort (frei)</label>
          <input type="text" value="${esc(a.standort)}" oninput="amSet('standort',this.value)" placeholder="Gebäude, Raum, Rack, Halle"${ro}></div>
        <div class="form-group"><label>Tags</label>
          <input type="text" value="${esc(a.tags.join(', '))}" oninput="amSet('tags',this.value.split(',').map(s=>s.trim()).filter(Boolean))" placeholder="frei, durch Komma getrennt"${ro}></div>
      </div>

      <div style="font-weight:700;font-size:.9rem;margin:14px 0 6px">Verantwortung <span class="field-hint" style="font-weight:400">A.5.9 – ohne Eigentümer kein Inventar</span></div>
      <div class="form-grid">
        <div class="form-group"><label>Verantwortlich (E-Mail) <span class="req">*</span></label>
          <input type="text" list="am-people" value="${esc(a.verantwortlich)}" oninput="amSet('verantwortlich',this.value)" placeholder="name@dihag.com"${ro}>
          <datalist id="am-people">${_amPeople()}</datalist></div>
        <div class="form-group"><label>Vertretung (E-Mail)</label>
          <input type="text" list="am-people" value="${esc(a.vertretung)}" oninput="amSet('vertretung',this.value)"${ro}></div>
        <div class="form-group full"><label>Betreiber</label>
          <input type="text" value="${esc(a.betreiber)}" oninput="amSet('betreiber',this.value)" placeholder="interne IT, OT-Team, externer Dienstleister …"${ro}></div>
      </div>

      <div style="font-weight:700;font-size:.9rem;margin:14px 0 2px">Schutzbedarf <span class="field-hint" style="font-weight:400">BSI 200-2 · A.5.12</span></div>
      ${soll ? `<div class="field-hint" style="margin-bottom:6px">Vererbung: ${pr.length} Prozess(e) hängen daran${pr.some(p => p.kritikalitaet === 'hoch') ? `, ${pr.filter(p => p.kritikalitaet === 'hoch').length} kritische` : ''} → Verfügbarkeit mindestens <b>${esc(soll)}</b>.</div>` : ''}
      <div class="form-grid">
        ${sb('vertraulichkeit', 'Vertraulichkeit', 'Vertraulichkeit', 'Was passiert, wenn es Unbefugte lesen?')}
        ${sb('integritaet', 'Integritaet', 'Integrität', 'Was passiert, wenn es unbemerkt falsch ist?')}
        ${sb('verfuegbarkeit', 'Verfuegbarkeit', 'Verfügbarkeit', '„sehr hoch" verlangt Wiederherstellzeit und RPO (R093).')}
        <div class="form-group"><label>Klassifizierung</label>
          <select onchange="amSet('klassifizierung',this.value.toLowerCase())"${ro}><option value=""${!a.klassifizierung ? ' selected' : ''}>–</option>${(wahlVon('Klassifizierung') || AM_KLASSIFIZIERUNG).map(v => `<option value="${esc(v)}"${String(v).toLowerCase() === a.klassifizierung ? ' selected' : ''}>${esc(v)}</option>`).join('')}${a.klassifizierung && !(wahlVon('Klassifizierung') || AM_KLASSIFIZIERUNG).some(v => String(v).toLowerCase() === a.klassifizierung) ? `<option value="${esc(a.klassifizierung)}" selected>${esc(a.klassifizierung)} (aus der Liste)</option>` : ''}</select>
          <span class="field-hint">Pflicht bei Informationen und bei Vertraulichkeit „hoch".</span></div>
        <div class="form-group"><label>Personenbezogene Daten</label>
          <label class="ack-check" style="font-weight:500;padding-top:6px"><input type="checkbox" ${a.personenbezogen ? 'checked' : ''} onchange="amSet('personenbezogen',this.checked)"${ro}> ja – DSGVO (72-h-Meldung, Verarbeitungsverzeichnis)</label></div>
      </div>

      <div style="font-weight:700;font-size:.9rem;margin:14px 0 6px">Betrieb und Wiederanlauf</div>
      <div class="form-grid">
        ${zeit('wiederherstellung', 'Wiederherstellzeit', 'Wie lange braucht die Wiederherstellung? Kein Prozess kann schneller wieder da sein als das Langsamste, wovon er abhängt.', amRang(a.verfuegbarkeit) === 2)}
        ${zeit('rpo', 'RPO – tolerierbarer Datenverlust', 'Wie alt darf der letzte gesicherte Stand sein?', amRang(a.verfuegbarkeit) === 2)}
        <div class="form-group full"><label>Datensicherung</label>
          <input type="text" value="${esc(a.backup)}" oninput="amSet('backup',this.value)" placeholder="Verfahren, Intervall, Ort, letzter Rücksicherungstest"${ro}></div>
        <div class="form-group"><label>Inbetriebnahme</label>
          <input type="date" value="${esc(a.inbetriebnahme)}" onchange="amSet('inbetriebnahme',this.value)"${ro}></div>
        <div class="form-group"><label>Support-Ende / EOL</label>
          <input type="date" value="${esc(a.eol)}" onchange="amSet('eol',this.value)"${ro}>
          <span class="field-hint">${AM_VORLAUF_TAGE} Tage vorher mahnt das System.</span></div>
      </div>

      <div style="font-weight:700;font-size:.9rem;margin:14px 0 6px">Hersteller und Lieferant <span class="field-hint" style="font-weight:400">A.5.19–5.22</span></div>
      <div class="form-grid">
        <div class="form-group"><label>Hersteller</label><input type="text" value="${esc(a.hersteller)}" oninput="amSet('hersteller',this.value)"${ro}></div>
        <div class="form-group"><label>Lieferant / Dienstleister</label><input type="text" value="${esc(a.lieferant)}" oninput="amSet('lieferant',this.value)"${ro}></div>
        <div class="form-group"><label>Support-Kontakt</label><input type="text" value="${esc(a.supportKontakt)}" oninput="amSet('supportKontakt',this.value)" placeholder="Hotline, Ticketportal, Kundennummer"${ro}></div>
        <div class="form-group"><label>Vertragsende</label><input type="date" value="${esc(a.vertragsende)}" onchange="amSet('vertragsende',this.value)"${ro}></div>
      </div>

      <div style="font-weight:700;font-size:.9rem;margin:14px 0 2px">Hängt ab von <span class="field-hint" style="font-weight:400">${a.abhaengigVon.length} Asset(s)</span></div>
      <div class="field-hint" style="margin-bottom:6px">Fällt eines davon aus, fällt dieses mit – die Ausfall-Sicht im Notfall-Reiter rechnet damit.</div>
      <input type="text" id="am-abh-filter" class="sort-select" placeholder="Assets filtern …" oninput="document.getElementById('am-abh').innerHTML=_amAbhHtml()" style="width:100%;margin-bottom:6px"${ro}>
      <div id="am-abh" style="max-height:180px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:6px 10px">${_amAbhHtml()}</div>
      ${abhaengige.length ? `<div class="field-hint" style="margin-top:6px">Davon hängen ab (auch mittelbar): ${abhaengige.map(x => esc(x.titel)).join(', ')}</div>` : ''}

      <div style="font-weight:700;font-size:.9rem;margin:14px 0 6px">Zusatzfelder</div>
      ${_amZusatzHtml(a, ro)}

      <div style="font-weight:700;font-size:.9rem;margin:14px 0 6px">Verwendung</div>
      <div style="font-size:.85rem">
        <div><b>Prozesse:</b> ${pr.length ? pr.map(p => `${esc(p.name)} <span class="field-hint">(${esc(p.werk)}${p.kritikalitaet ? ', ' + esc(p.kritikalitaet) : ''})</span>`).join(' · ') : '<span class="field-hint">keiner – in der Business-Impact-Analyse (Notfall-Reiter) zuordnen</span>'}</div>
        <div style="margin-top:4px"><b>Risiken:</b> ${ri.length ? ri.map(r => esc(r.titel)).join(' · ') : '<span class="field-hint">keine offenen</span>'}</div>
        ${a.url ? `<div style="margin-top:4px" class="field-hint"><a href="${esc(a.url)}" target="_blank" rel="noopener" style="color:var(--c-primary)">In SharePoint öffnen ↗</a></div>` : ''}
      </div>
      ${histRows ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border)"><div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Verlauf</div>${histRows}</div>` : ''}
    </div>
    <div class="modal-footer">
      ${a.id && canWrite ? `<button class="btn btn-ghost btn-sm" onclick="deleteAsset('${esc(a.id)}')" style="color:#b91c1c">Löschen</button>` : ''}
      <div style="flex:1"></div>
      ${canWrite ? `<button class="btn btn-primary" id="am-save-btn" onclick="saveAsset()">Speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, true, { label: 'Asset bearbeiten' });
}

/* ── Speichern, Löschen ── */

function _amVermerk(a, aktion) {
  const wer = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '';
  (a.historie = a.historie || []).push({ datum: new Date().toISOString(), wer, aktion });
}

async function saveAsset() {
  if (!amDarfSchreiben() || !_amEditing) return;
  const a = _amEditing;
  if (!String(a.titel || '').trim()) { toast('Bitte eine Bezeichnung angeben.', 'error'); return; }
  const pflicht = _amFelder().filter(f => f.pflicht && !String((a.zusatz || {})[f.key] || '').trim());
  if (pflicht.length) { toast(`Pflichtfeld fehlt: ${pflicht.map(f => f.label).join(', ')}`, 'error'); return; }
  _amVermerk(a, a.id ? 'geändert' : 'angelegt');
  const btn = document.getElementById('am-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    if (a.id) await spUpdateAsset(a.id, a); else await spAddAsset(a);
    closeModal();
    _amEditing = null;
    _am = null;
    await initAssets();
    const l = amLuecken(a, { prozesse: _amProzesseVon(a.id, a.quelleId), heute: _amHeute() });
    toast(l.fehler.length ? `Gespeichert – ${l.fehler.length} Lücke(n) bleiben` : 'Gespeichert ✓', 'success');
  } catch (e) {
    a.historie.pop();
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

async function deleteAsset(id) {
  if (!amDarfSchreiben()) return;
  const a = (_am || []).map(amVon).find(x => x.id === String(id));
  if (!a) return;
  const pr = _amProzesseVon(a.id, a.quelleId), ri = _amRisikenVon(a.id, a.quelleId), abh = amAbhaengige(_am || [], a.id);
  const warn = [pr.length ? `${pr.length} Prozess(e) hängen daran` : '', ri.length ? `${ri.length} Risiko/Risiken verweisen darauf` : '', abh.length ? `${abh.length} Asset(s) hängen davon ab` : ''].filter(Boolean).join(', ');
  const ok = (typeof uiConfirm === 'function')
    ? await uiConfirm(`„${a.titel}" endgültig löschen?${warn ? `\n\n${warn} – die Verweise bleiben als Leerstelle stehen.` : ''}\n\nFür ein ausgemustertes Asset ist „außer Betrieb" meist die bessere Wahl: Das Inventar zeigt dann, was es gab.`,
        { title: 'Asset löschen', okLabel: 'Endgültig löschen', danger: true })
    : confirm(`„${a.titel}" löschen?`);
  if (!ok) return;
  try {
    await spDeleteAsset(a.id);
    closeModal();
    _amEditing = null;
    _am = null;
    await initAssets();
    toast('Gelöscht', 'success');
  } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 'error'); }
}

/* ── Fehlende Spalten anlegen – auf Knopfdruck, nie still ── */

async function assetsSpaltenAnlegen() {
  if (!amDarfSchreiben() || typeof spErgaenzeAssetSpalten !== 'function') return;
  const missing = (typeof spMissingAssetColumns === 'function') ? spMissingAssetColumns() : [];
  if (!missing.length) { toast('Alle erwarteten Spalten sind da.', 'success'); return; }
  const ok = (typeof uiConfirm === 'function')
    ? await uiConfirm(`${missing.length} Spalte(n) in der Liste „Assets" anlegen?\n\n${missing.join(', ')}\n\nVorhandene Spalten und Einträge werden nicht verändert.`,
        { title: 'Spalten anlegen', okLabel: `${missing.length} anlegen` })
    : confirm(`${missing.length} Spalten anlegen?`);
  if (!ok) return;
  try {
    const r = await spErgaenzeAssetSpalten();
    if (r.fehler.length) toast(`${r.angelegt.length} angelegt, ${r.fehler.length} nicht: ${r.fehler[0]}`, 'error', 8000);
    else toast(`${r.angelegt.length} Spalte(n) angelegt ✓`, 'success');
    _am = null;
    await initAssets();
  } catch (e) { toast('Spalten nicht anlegbar: ' + e.message, 'error'); }
}

/* ── Export, Druck ── */

function assetsExportCsv() {
  const rows = _amGefiltert();
  const felder = _amFelder();
  const kopf = ['Bezeichnung', 'Kategorie', 'Werke', 'Standort', 'Verantwortlich', 'Vertretung', 'Betreiber', 'Vertraulichkeit', 'Integrität', 'Verfügbarkeit',
    'Klassifizierung', 'Personenbezogen', 'Status', 'Inbetriebnahme', 'EOL', 'Wiederherstellzeit (h)', 'RPO (h)', 'Datensicherung', 'Hängt ab von',
    'Hersteller', 'Lieferant', 'Support-Kontakt', 'Vertragsende', 'Tags', 'Prozesse', 'Lücken'].concat(felder.map(f => f.label));
  const zelle = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const titelVon = (id) => { const x = (_am || []).map(amVon).find(y => y.id === id); return x ? x.titel : id; };
  const zeilen = rows.map(a => [a.titel, (_amKat(a.kategorie) || {}).label || a.kategorie, a.werke.join(' '), a.standort, a.verantwortlich, a.vertretung, a.betreiber,
    a.vertraulichkeit, a.integritaet, a.verfuegbarkeit, a.klassifizierung, a.personenbezogen ? 'ja' : 'nein', a.status, a.inbetriebnahme, a.eol,
    a.wiederherstellung, a.rpo, a.backup, a.abhaengigVon.map(titelVon).join(' | '), a.hersteller, a.lieferant, a.supportKontakt, a.vertragsende, a.tags.join(' '),
    _amProzesseVon(a.id, a.quelleId).map(p => p.name).join(' | '), amLuecken(a, { prozesse: _amProzesseVon(a.id, a.quelleId), heute: _amHeute() }).fehler.join(' | ')]
    .concat(felder.map(f => (a.zusatz || {})[f.key] || '')).map(zelle).join(';'));
  const csv = '﻿' + [kopf.map(zelle).join(';')].concat(zeilen).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `Assetregister_${_amHeute()}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function assetsInventarDrucken() {
  const sichtbar = _amWerke();
  const liste = (_am || []).filter(a => amSichtbar(a, sichtbar)).filter(a => !_amFilter.werk || amVon(a).werke.includes(_amFilter.werk) || amVon(a).werke.includes('ALLE'));
  const html = amInventarHtml({ liste, kategorien: _amKats(), personName: _amName, werkLabel: _amFilter.werk || '' });
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up-Blocker? Bitte Pop-ups erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { amDarfSchreiben, renderAssets, openAssetEditor, saveAsset };
}
