'use strict';

/**
 * Reiter „Vorfälle" – Sicherheitsvorfälle & Ereignisse aus dem Ticketsystem
 * ==========================================================================
 * Das Ticket bleibt im Ticketsystem (Site „ticket", Liste „Tickets"). Dieser
 * Reiter zieht heraus, was Informationssicherheit ist – über die Kategorie –
 * und legt darüber, was ISO 27001 A.5.24–A.5.28 und NIS2 Art. 23 verlangen:
 * die Beurteilung (Ereignis oder Vorfall?), die Erheblichkeit und ihre
 * Fristen, die Eskalationsstufe, Ursache, Lehren, Beweise, Maßnahmen. Nach
 * der Art des Tickets getrennt: Vorfälle & Ereignisse, Änderungen (A.8.32),
 * Dokumentation (A.5.37). Das Modell steht in vorfallmodell.js.
 */

let _vf = null;              // { tickets, kategorien, arten } – alle Tickets des Zeitraums
let _vfBew = null;           // { bewertungen: {id → …} } aus vorfaelle.json
let _vfMassnahmen = null;    // Wirksamkeits-Register (leise) – Korrekturmaßnahmen zu Tickets
let _vfLoading = false;
let _vfEditing = null;       // { ticket, bewertung }
let _vfFilter = { q: '', werk: '', art: 'incident', status: 'offen', einstufung: '' };

function vfDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('vorfaelle'); }
function _vfCfg() { return (typeof getAccessConfig === 'function') ? getAccessConfig() : {}; }
function _vfWerke() { return (typeof nfSichtbareWerke === 'function') ? nfSichtbareWerke() : null; }
function _vfJetzt() { return new Date().toISOString(); }
function _vfBewertung(id) { return vfBewertungVon((_vfBew && _vfBew.bewertungen) ? _vfBew.bewertungen[String(id)] : null); }
function _vfMassnahmenVon(id) { return (_vfMassnahmen || []).filter(m => String(m.herkunftId || '') === `ticket:${id}`); }
function _vfLuecken(t) { return vfLuecken(t, _vfBewertung(t.id), { jetzt: _vfJetzt(), massnahmen: _vfMassnahmen || [] }); }
function _vfDt(iso) { return iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–'; }
function _vfLokal(iso) { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

/** Die Tickets, die Informationssicherheit sind – über die Kategorie (Einstellungen oder Muster). */
function _vfSicherheit() {
  const cfg = _vfCfg();
  return ((_vf && _vf.tickets) || []).filter(t => vfIstSicherheit(t.kategorie, cfg));
}

/* ── Laden ── */

async function initVorfaelle() {
  const mount = document.getElementById('vorfaelle-mount');
  if (!mount) return;
  if (_vf && _vfBew) { renderVorfaelle(); return; }
  mount.innerHTML = '<div class="doc-loading">Lade Tickets …</div>';
  _vfLoading = true;
  try {
    const [tk, bw] = await Promise.all([spGetTickets(), spLoadVorfaelle()]);
    _vf = tk; _vfBew = bw.daten;
  } catch (e) {
    _vf = null; _vfLoading = false;
    mount.innerHTML = `<div class="col-warning" style="display:block"><b>Tickets nicht ladbar:</b> ${esc(e.message)}
      <div style="margin-top:8px">Quelle ist die Liste <b>„${esc(typeof SP !== 'undefined' ? SP.ticketList : 'Tickets')}"</b> auf der Site „ticket":
      <a href="${esc((typeof spTicketListUrl === 'function') ? spTicketListUrl() : '#')}" target="_blank" rel="noopener">${esc((typeof spTicketListUrl === 'function') ? spTicketListUrl() : '')}</a>. Ihr Konto braucht dort Leserecht.</div></div>`;
    return;
  }
  _vfLoading = false;
  if (!_vfMassnahmen && typeof spGetWirkLeise === 'function') spGetWirkLeise().then(w => { _vfMassnahmen = Array.isArray(w) ? w : []; renderVorfaelle(); }).catch(() => { _vfMassnahmen = []; });
  renderVorfaelle();
}

async function refreshVorfaelle() {
  _vf = null; _vfBew = null; _vfMassnahmen = null;
  await initVorfaelle();
  if (typeof toast === 'function') toast('Tickets aktualisiert', 'success');
}

/* ── Die Ansicht ── */

function _vfGefiltert(art) {
  const f = _vfFilter;
  const sichtbar = _vfWerke();
  let rows = _vfSicherheit().filter(t => vfSichtbar(t, sichtbar)).filter(t => (t.art || 'sonstig') === art);
  if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter(t => [t.id, t.titel, t.kategorie, t.beschreibung, t.zugewiesen, t.melder, t.werkText].join(' ').toLowerCase().includes(q)); }
  if (f.werk) rows = rows.filter(t => t.werke.includes(f.werk) || t.werke.includes('ALLE'));
  if (f.status === 'offen') rows = rows.filter(t => t.offen);
  else if (f.status === 'erledigt') rows = rows.filter(t => !t.offen);
  if (art === 'incident' && f.einstufung) rows = rows.filter(t => (f.einstufung === 'luecke') ? _vfLuecken(t).fehler.length > 0 : _vfBewertung(t.id).einstufung === f.einstufung);
  // Was drängt, steht oben: Lücken, dann Fristen, dann das Neueste.
  if (art === 'incident') {
    const rang = (t) => { const l = _vfLuecken(t); return l.fehler.length ? 0 : (t.offen ? 1 : 2); };
    rows.sort((a, b) => (rang(a) - rang(b)) || (b.erstellt || '').localeCompare(a.erstellt || ''));
  }
  return rows;
}

function _vfBadge(text, farbe, hintergrund, title) {
  return `<span title="${esc(title || '')}" style="font-size:.72rem;padding:1px 7px;border-radius:999px;background:${hintergrund};color:${farbe};font-weight:600;white-space:nowrap">${esc(text)}</span>`;
}
function _vfPrioHtml(p) {
  const r = vfPrioRang(p);
  if (!p) return '<span style="color:var(--c-faint)">–</span>';
  const col = r === 3 ? '#b91c1c' : r === 2 ? '#b45309' : r === 1 ? '#17509e' : '#6b7280';
  return `<span style="color:${col};font-weight:600;font-size:.78rem">${esc(p)}</span>`;
}
function _vfEinstufungHtml(b) {
  if (!b.einstufung) return _vfBadge('nicht beurteilt', '#b45309', '#fef3c7', 'A.5.25: Ereignis oder Vorfall?');
  if (b.einstufung === 'ereignis') return _vfBadge('Ereignis', '#374151', '#f3f4f6', 'kein Vorfall');
  return _vfBadge(b.erheblich === true ? 'Vorfall · erheblich' : 'Vorfall', '#991b1b', '#fee2e2', b.erheblich === true ? 'NIS2-meldepflichtig' : 'Sicherheitsvorfall');
}
function _vfFristenHtml(t, b) {
  const fr = vfFristen(t, b, _vfJetzt());
  if (!fr.length) return '<span style="color:var(--c-faint)">–</span>';
  return fr.map(x => {
    const col = x.stand === 'ueberfaellig' ? ['#991b1b', '#fee2e2'] : x.stand === 'erledigt' ? ['#166534', '#dcfce7'] : x.stand === 'verspaetet' ? ['#92400e', '#fef3c7'] : ['#1e40af', '#dbeafe'];
    const kurz = x.key === 'fruehwarnung' ? '24 h' : x.key === 'meldung' ? '72 h' : x.key === 'abschluss' ? '1 Monat' : 'DSGVO';
    return _vfBadge(`${kurz} ${x.stand === 'erledigt' ? '✓' : x.stand === 'verspaetet' ? '✓ spät' : vfRestText(x.restStunden)}`, col[0], col[1], `${x.label}: fällig ${_vfDt(x.faellig)}${x.erledigt ? `, erledigt ${_vfDt(x.erledigt)}` : ''}`);
  }).join(' ');
}

function renderVorfaelle() {
  const mount = document.getElementById('vorfaelle-mount');
  if (!mount) return;
  if (!_vf || !_vfBew) { if (!_vfLoading) initVorfaelle(); return; }
  const canWrite = vfDarfSchreiben();
  const cfg = _vfCfg();
  const werke = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];
  const sichtbar = _vfWerke();
  const sicher = _vfSicherheit();
  const z = vfKennzahlen(sicher, _vfBew.bewertungen, { jetzt: _vfJetzt(), werke: sichtbar, massnahmen: _vfMassnahmen || [] });
  const kats = (cfg.vorfallKategorien || []).filter(Boolean);
  const kpi = (n, label, col) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:10px 13px">
    <div style="font-size:1.45rem;font-weight:800;color:${col}">${n}</div><div style="font-size:.78rem;color:var(--c-muted)">${label}</div></div>`;

  const incidents = _vfGefiltert('incident'), changes = _vfGefiltert('change'), dokus = _vfGefiltert('doku'), sonstige = _vfGefiltert('sonstig');
  const zeileAllg = (t, extra) => `<tr onclick="openVorfall('${esc(t.id)}')" style="cursor:pointer${t.offen ? '' : ';opacity:.7'}">
      <td style="white-space:nowrap;color:var(--c-muted)">${esc((t.erstellt || '').slice(0, 10))}</td>
      <td><b>#${esc(t.id)}</b> ${esc(t.titel)}${t.beschreibung ? `<div style="font-size:.7rem;color:var(--c-faint)">${esc(t.beschreibung.slice(0, 110))}${t.beschreibung.length > 110 ? ' …' : ''}</div>` : ''}</td>
      <td style="white-space:nowrap">${t.werke.length ? (t.werke.includes('ALLE') ? 'konzernweit' : esc(t.werke.join(', '))) : (t.werkText ? esc(t.werkText) : '<span style="color:var(--c-faint)">–</span>')}</td>
      <td style="white-space:nowrap">${esc(t.kategorie)}</td>
      <td>${_vfPrioHtml(t.prio)}</td>
      <td style="white-space:nowrap">${esc(t.status) || '–'}</td>${extra || ''}</tr>`;
  const tabelle = (rows, kopfExtra, zeileExtra, leer) => rows.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:.82rem"><thead><tr><th>Datum</th><th>Ticket</th><th>Werk</th><th>Kategorie</th><th>Prio</th><th>Status</th>${kopfExtra || ''}</tr></thead>
    <tbody>${rows.map(t => zeileAllg(t, zeileExtra ? zeileExtra(t) : '')).join('')}</tbody></table></div>` : `<div class="field-hint" style="padding:6px 0 10px">${leer}</div>`;
  const incZeile = (t) => { const b = _vfBewertung(t.id); const l = _vfLuecken(t);
    return `<td>${_vfEinstufungHtml(b)}${b.stufe !== null && b.stufe >= 2 && typeof nfStufe === 'function' ? ` ${_vfBadge(nfStufe(b.stufe).label, '#fff', nfStufe(b.stufe).farbe, 'Eskalationsstufe')}` : ''}</td><td>${_vfFristenHtml(t, b)}</td>
      <td>${l.fehler.length ? `<span title="${esc(l.fehler.join(' · '))}" style="color:#b91c1c;font-weight:600">${l.fehler.length}</span>` : (l.hinweise.length ? `<span title="${esc(l.hinweise.join(' · '))}" style="color:#b45309">${l.hinweise.length} Hinweis(e)</span>` : '<span style="color:#15803d;font-weight:600">✓</span>')}</td>`; };
  const sek = (key, titel, norm, inhalt) => `<div style="margin-top:16px"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px"><div style="font-weight:700;font-size:.95rem">${VF_ARTEN[key] ? VF_ARTEN[key].icon + ' ' : ''}${titel}</div><span class="field-hint">${norm}</span></div>${inhalt}</div>`;

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      Aus dem <b>Ticketsystem</b> (Liste „Tickets"), was Informationssicherheit ist – über die Kategorie${kats.length ? `: <b>${kats.map(esc).join(', ')}</b>` : ' <i>(Muster – die Kategorien lassen sich in den Einstellungen festlegen)</i>'}.
      Das Ticket bleibt dort; hier steht, was das ISMS darüber legt: <b>Beurteilung</b> (A.5.25: Ereignis oder Vorfall), <b>Erheblichkeit und Fristen</b> (NIS2 Art. 23: 24 h · 72 h · 1 Monat; DSGVO Art. 33: 72 h),
      <b>Eskalationsstufe</b> (Krisenstab), <b>Ursache, Lehren, Beweise</b> (A.5.26–A.5.28) und die <b>Korrekturmaßnahme</b> im Wirksamkeits-Register.
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${kpi(z.offeneIncidents, 'Vorfälle / Ereignisse offen', z.offeneIncidents ? '#b45309' : '#15803d')}
      ${kpi(z.unbeurteilt, 'nicht beurteilt (A.5.25)', z.unbeurteilt ? '#b91c1c' : '#15803d')}
      ${kpi(z.fristenUeberfaellig, 'Meldefristen überfällig', z.fristenUeberfaellig ? '#b91c1c' : '#15803d')}
      ${kpi(z.vorfaelle, `Sicherheitsvorfälle · ${z.erheblich} erheblich`, z.erheblich ? '#b45309' : '#17509e')}
      ${kpi(z.letzte12Monate, 'Meldungen in 12 Monaten', '#17509e')}
      ${kpi(z.dauerMittelTage === null ? '–' : z.dauerMittelTage + ' T', 'Ø Bearbeitungsdauer', '#17509e')}
    </div>
    ${z.offenListe.length ? `<div class="col-warning" style="display:block;margin-bottom:12px"><b>Was drängt:</b> ${z.offenListe.slice(0, 5).map(o => `<a href="#" onclick="openVorfall('${esc(o.id)}');return false" style="color:inherit">#${esc(o.id)} ${esc(o.titel)}</a> – ${esc(o.fehler[0])}`).join(' · ')}${z.offenListe.length > 5 ? ` · +${z.offenListe.length - 5}` : ''}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <input type="text" class="sort-select" placeholder="Suchen …" value="${esc(_vfFilter.q)}" oninput="_vfFilter.q=this.value;renderVorfaelle()" style="width:200px">
      <select class="sort-select" onchange="_vfFilter.werk=this.value;renderVorfaelle()"><option value="">alle Werke</option>${werke.filter(w => !sichtbar || sichtbar.includes(w)).map(w => `<option value="${esc(w)}"${_vfFilter.werk === w ? ' selected' : ''}>${esc(w)}</option>`).join('')}</select>
      <select class="sort-select" onchange="_vfFilter.status=this.value;renderVorfaelle()"><option value="offen"${_vfFilter.status === 'offen' ? ' selected' : ''}>Status: offen</option><option value="erledigt"${_vfFilter.status === 'erledigt' ? ' selected' : ''}>erledigt</option><option value=""${_vfFilter.status === '' ? ' selected' : ''}>alle</option></select>
      <select class="sort-select" onchange="_vfFilter.einstufung=this.value;renderVorfaelle()"><option value="">Beurteilung: alle</option><option value="luecke"${_vfFilter.einstufung === 'luecke' ? ' selected' : ''}>mit Lücken</option>${VF_EINSTUFUNG.map(e => `<option value="${esc(e.key)}"${_vfFilter.einstufung === e.key && e.key ? ' selected' : ''}>${esc(e.label)}</option>`).join('')}</select>
      <div style="flex:1"></div>
      <a href="${esc((typeof spTicketListUrl === 'function') ? spTicketListUrl() : '#')}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" title="Die Liste im Ticketsystem">↗ Ticketsystem</a>
      <span class="field-hint">${sicher.length} von ${(_vf.tickets || []).length} Tickets der letzten ${typeof VF_MONATE !== 'undefined' ? VF_MONATE : 24} Monate</span>
    </div>
    ${canWrite ? '' : '<div class="col-warning" style="display:block;margin-bottom:12px">👁 <b>Nur-Lese-Zugriff</b> – Beurteilungen kann hier niemand eintragen.</div>'}
    ${sek('incident', 'Vorfälle &amp; Ereignisse', 'ISO 27001 A.5.24–A.5.28 · NIS2 Art. 23',
      tabelle(incidents, '<th>Beurteilung</th><th>Fristen</th><th>Lücken</th>', incZeile, 'Keine Tickets dieser Art in der Auswahl.'))}
    ${sek('change', 'Änderungen mit Sicherheitsbezug', 'ISO 27001 A.8.32 – geplant, geprüft, freigegeben, dokumentiert',
      tabelle(changes, '', null, 'Keine Änderungen in der Auswahl.'))}
    ${sek('doku', 'Dokumentation', 'ISO 27001 A.5.37 – dokumentierte Betriebsabläufe',
      tabelle(dokus, '', null, 'Keine Dokumentationsaufträge in der Auswahl.'))}
    ${sonstige.length ? sek('', 'Ohne erkannte Art', 'Die Art des Tickets ist keiner Gruppe zugeordnet – in den Einstellungen zuordnen', tabelle(sonstige, '', null, '')) : ''}`;
}

/* ── Der Dialog: das Ticket und seine Beurteilung ── */

function openVorfall(id) {
  const t = ((_vf && _vf.tickets) || []).find(x => String(x.id) === String(id));
  if (!t) return;
  _vfEditing = { ticket: t, bewertung: _vfBewertung(t.id) };
  renderVorfallEditor();
}

function vfSet(feld, wert) { if (_vfEditing) { _vfEditing.bewertung[feld] = wert; _vfDialogNeu(); } }
function vfSetMeldung(key, wert) { if (_vfEditing) { _vfEditing.bewertung.meldungen[key] = wert ? new Date(wert).toISOString() : ''; _vfDialogNeu(); } }
function vfSetErheblich(v) { vfSet('erheblich', v === 'ja' ? true : v === 'nein' ? false : null); }
function vfSetStufe(v) { vfSet('stufe', v === '' ? null : Number(v)); }
function _vfDialogNeu() {
  const el = document.getElementById('vf-fristen'); if (el && _vfEditing) el.innerHTML = _vfFristenBlock();
  const l = document.getElementById('vf-luecken'); if (l && _vfEditing) l.innerHTML = _vfLueckenHtml();
}
function _vfLueckenHtml() {
  const { ticket, bewertung } = _vfEditing;
  const l = vfLuecken(ticket, bewertung, { jetzt: _vfJetzt(), massnahmen: _vfMassnahmen || [] });
  if (!l.fehler.length && !l.hinweise.length) return ticket.art === 'incident' ? '<div class="col-warning" style="display:block;border-color:#bbf7d0;background:#f0fdf4;color:#166534">✓ Vollständig.</div>' : '';
  return `${l.fehler.length ? `<div class="col-warning" style="display:block"><b>Lücken (${l.fehler.length}):</b><ul style="margin:6px 0 0 18px;padding:0">${l.fehler.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${l.hinweise.length ? `<div class="field-hint" style="margin-top:6px">Hinweise: ${l.hinweise.map(esc).join(' · ')}</div>` : ''}`;
}
function _vfFristenBlock() {
  const { ticket, bewertung: b } = _vfEditing;
  const ro = vfDarfSchreiben() ? '' : ' disabled';
  if (b.einstufung !== 'vorfall') return '<div class="field-hint">Fristen laufen erst, wenn es ein Sicherheitsvorfall ist – und bei „erheblich" (NIS2) oder Personendaten (DSGVO).</div>';
  const fr = vfFristen(ticket, b, _vfJetzt());
  if (!fr.length) return '<div class="field-hint">Nicht erheblich, keine Personendaten: keine Meldepflicht. Bleibt die Entscheidung offen, gilt sie als Lücke.</div>';
  return `<table class="tbl" style="font-size:.8rem"><thead><tr><th>Frist</th><th>Fällig</th><th>Erledigt am</th><th>Stand</th></tr></thead><tbody>${fr.map(x => `<tr>
    <td><b>${esc(x.label)}</b><div class="field-hint">${esc(x.text)}</div></td><td style="white-space:nowrap">${_vfDt(x.faellig)}</td>
    <td><input type="datetime-local" value="${esc(_vfLokal(x.erledigt))}" onchange="vfSetMeldung('${x.key}',this.value)"${ro}></td>
    <td style="white-space:nowrap;font-weight:600;color:${x.stand === 'ueberfaellig' ? '#b91c1c' : x.stand === 'erledigt' ? '#15803d' : '#b45309'}">${x.stand === 'erledigt' ? 'fristgerecht ✓' : x.stand === 'verspaetet' ? 'verspätet abgegeben' : vfRestText(x.restStunden)}</td></tr>`).join('')}</tbody></table>
    <div class="form-group" style="margin-top:8px"><label>Behörde / Referenz der Meldung</label><input type="text" value="${esc(b.behoerde)}" oninput="vfSet('behoerde',this.value)" placeholder="BSI-Meldeportal, Aktenzeichen; LfDI, Vorgangsnummer"${ro}></div>`;
}

function renderVorfallEditor() {
  const { ticket: t, bewertung: b } = _vfEditing;
  const canWrite = vfDarfSchreiben();
  const ro = canWrite ? '' : ' disabled';
  const massnahmen = _vfMassnahmenVon(t.id);
  const stufen = (typeof NF_STUFEN !== 'undefined') ? NF_STUFEN : [];
  const kopf = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px 14px;font-size:.85rem;margin-bottom:8px">
      <div><span class="field-hint">Art / Kategorie</span><br>${esc(t.artRoh || '–')} / <b>${esc(t.kategorie || '–')}</b></div>
      <div><span class="field-hint">Werk</span><br>${esc(t.werke.includes('ALLE') ? 'konzernweit' : t.werke.join(', ') || t.werkText || '–')}</div>
      <div><span class="field-hint">Priorität / Status</span><br>${_vfPrioHtml(t.prio)} / ${esc(t.status || '–')}</div>
      <div><span class="field-hint">Gemeldet</span><br>${_vfDt(t.erstellt)}${t.melder ? `<br><span class="field-hint">${esc(t.melder)}</span>` : ''}</div>
      <div><span class="field-hint">Bearbeitung</span><br>${esc(t.zugewiesen || '–')}${!t.offen ? `<br><span class="field-hint">erledigt ${_vfDt(t.abgeschlossen || t.geaendert)}</span>` : ''}</div>
    </div>
    ${t.beschreibung ? `<div style="font-size:.85rem;white-space:pre-wrap;max-height:140px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:8px 10px;background:var(--c-surface,#fff)">${esc(t.beschreibung)}</div>` : ''}
    <div style="margin-top:6px"><a href="${esc(t.url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Im Ticketsystem öffnen ↗</a> <span class="field-hint">Bearbeitet wird dort – Kommentare, Anhänge, Status.</span></div>`;

  const bewertung = t.art !== 'incident' ? '' : `
      <div id="vf-luecken" style="margin:12px 0">${_vfLueckenHtml()}</div>
      <div style="font-weight:700;font-size:.9rem;margin:0 0 6px">Beurteilung <span class="field-hint" style="font-weight:400">A.5.25 – Ereignis oder Sicherheitsvorfall?</span></div>
      <div class="form-grid">
        <div class="form-group"><label>Einstufung</label>
          <select onchange="vfSet('einstufung',this.value)"${ro}>${VF_EINSTUFUNG.map(e => `<option value="${esc(e.key)}"${b.einstufung === e.key ? ' selected' : ''}>${esc(e.label)}</option>`).join('')}</select>
          <span class="field-hint">Ereignis: nichts kompromittiert, kein Verstoß. Vorfall: Vertraulichkeit, Integrität oder Verfügbarkeit verletzt oder bedroht.</span></div>
        <div class="form-group"><label>Eskalationsstufe</label>
          <select onchange="vfSetStufe(this.value)"${ro}><option value=""${b.stufe === null ? ' selected' : ''}>– offen –</option>${stufen.map(s => `<option value="${s.nr}"${b.stufe === s.nr ? ' selected' : ''}>${s.nr} · ${esc(s.label)}</option>`).join('')}</select>
          <span class="field-hint">Ab Notfall ist der Krisenstab des Werks zuständig (Reiter Notfall).</span></div>
        <div class="form-group"><label>Kenntnis am</label>
          <input type="datetime-local" value="${esc(_vfLokal(b.kenntnisAm || t.erstellt))}" onchange="vfSet('kenntnisAm',this.value?new Date(this.value).toISOString():'')"${ro}>
          <span class="field-hint">Ab hier laufen die Fristen. Vorbelegt mit der Meldung des Tickets.</span></div>
        <div class="form-group"><label>Erheblich (NIS2 Art. 23)</label>
          <select onchange="vfSetErheblich(this.value)"${ro}><option value=""${b.erheblich === null ? ' selected' : ''}>– nicht entschieden –</option><option value="ja"${b.erheblich === true ? ' selected' : ''}>ja – meldepflichtig</option><option value="nein"${b.erheblich === false ? ' selected' : ''}>nein</option></select>
          <span class="field-hint">Erheblich: schwere Betriebsstörung oder finanzieller Verlust, oder erheblicher Schaden für andere. Dann Frühwarnung binnen 24 h.</span></div>
        <div class="form-group full"><label class="ack-check" style="font-weight:500"><input type="checkbox" ${b.personendaten ? 'checked' : ''} onchange="vfSet('personendaten',this.checked)"${ro}> Personenbezogene Daten betroffen – DSGVO Art. 33, Meldung binnen 72 h</label></div>
      </div>
      <div style="font-weight:700;font-size:.9rem;margin:14px 0 6px">Meldungen</div>
      <div id="vf-fristen">${_vfFristenBlock()}</div>
      <div style="font-weight:700;font-size:.9rem;margin:14px 0 6px">Reaktion und Lehren <span class="field-hint" style="font-weight:400">A.5.26 · A.5.27</span></div>
      <div class="form-grid">
        <div class="form-group full"><label>Ursache</label><textarea oninput="vfSet('ursache',this.value)" placeholder="Was ist tatsächlich passiert – technisch, organisatorisch, menschlich?"${ro}>${esc(b.ursache)}</textarea></div>
        <div class="form-group full"><label>Reaktion / Eindämmung</label><textarea oninput="vfSet('reaktion',this.value)" placeholder="Was wurde sofort getan, um den Schaden zu begrenzen?"${ro}>${esc(b.reaktion)}</textarea></div>
        <div class="form-group full"><label>Lessons learned</label><textarea oninput="vfSet('lessons',this.value)" placeholder="Was verhindert die Wiederholung? Auch: „nichts nötig, weil …"${ro}>${esc(b.lessons)}</textarea></div>
        <div class="form-group full"><label>Beweismittel <span class="field-hint" style="font-weight:400">A.5.28</span></label><input type="text" value="${esc(b.beweise)}" oninput="vfSet('beweise',this.value)" placeholder="Logs, Screenshots, Forensik-Bericht – wo liegen sie, wer hat sie gesichert?"${ro}></div>
      </div>
      <div style="font-weight:700;font-size:.9rem;margin:14px 0 6px">Korrekturmaßnahmen <span class="field-hint" style="font-weight:400">Wirksamkeits-Register, ISO 27001 10.2</span></div>
      <div style="font-size:.85rem">${massnahmen.length ? massnahmen.map(m => `<div>⚠️ <b>${esc(m.titel)}</b> <span class="field-hint">${esc(m.status)}${m.verantwortlich ? ' · ' + esc(m.verantwortlich) : ''}</span></div>`).join('') : '<span class="field-hint">Noch keine Maßnahme zu diesem Ticket.</span>'}
        ${canWrite && typeof wirkAbweichungFuer === 'function' ? `<div style="margin-top:6px"><button class="btn btn-outline btn-sm" onclick="vfMassnahmeAnlegen()">+ Korrekturmaßnahme anlegen</button></div>` : ''}</div>
      ${b.bewertetVon ? `<div class="field-hint" style="margin-top:12px">Zuletzt beurteilt von ${esc(b.bewertetVon)} am ${_vfDt(b.bewertetAm)}.</div>` : ''}`;

  openModal(`
    <div class="modal-header"><h3>${VF_ARTEN[t.art] ? VF_ARTEN[t.art].icon + ' ' : '🎫 '}#${esc(t.id)} ${esc(t.titel)}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">${kopf}${bewertung}</div>
    <div class="modal-footer">
      ${t.art === 'incident' ? `<button class="btn btn-ghost btn-sm" onclick="vfAkteDrucken()" title="Die Vorfallakte als PDF – der Nachweis nach A.5.28">🖨 Vorfallakte</button>` : ''}
      <div style="flex:1"></div>
      ${canWrite && t.art === 'incident' ? `<button class="btn btn-primary" id="vf-save-btn" onclick="saveVorfall()">Beurteilung speichern</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`, true, { label: 'Vorfall beurteilen' });
}

async function saveVorfall() {
  if (!vfDarfSchreiben() || !_vfEditing) return;
  const { ticket: t, bewertung: b } = _vfEditing;
  const wer = (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn) : '';
  b.bewertetVon = wer; b.bewertetAm = _vfJetzt();
  (b.historie = b.historie || []).push({ datum: b.bewertetAm, wer, aktion: `beurteilt: ${b.einstufung || 'offen'}${b.erheblich === true ? ', erheblich' : ''}` });
  const btn = document.getElementById('vf-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
  try {
    const r = await spSaveVorfallBewertung(t.id, b);
    _vfBew = r.daten;
    closeModal(); _vfEditing = null;
    renderVorfaelle();
    const l = vfLuecken(t, b, { jetzt: _vfJetzt(), massnahmen: _vfMassnahmen || [] });
    toast(l.fehler.length ? `Gespeichert – ${l.fehler.length} Lücke(n) bleiben` : 'Beurteilung gespeichert ✓', 'success');
  } catch (e) {
    b.historie.pop();
    if (btn) { btn.disabled = false; btn.textContent = 'Beurteilung speichern'; }
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

/** Eine Korrekturmaßnahme im Wirksamkeits-Register anlegen – Quelle „Sicherheitsvorfall", Herkunft dieses Ticket. */
function vfMassnahmeAnlegen() {
  if (!_vfEditing || typeof wirkAbweichungFuer !== 'function') return;
  const { ticket: t, bewertung: b } = _vfEditing;
  const werk = t.werke.find(w => w !== 'ALLE') || '';
  closeModal();
  wirkAbweichungFuer(`ticket:${t.id}`, `Maßnahme zu #${t.id} ${t.titel}`, werk, [b.ursache ? `Ursache: ${b.ursache}` : '', b.lessons ? `Lehre: ${b.lessons}` : ''].filter(Boolean).join('\n'),
    async () => { if (typeof spGetWirkLeise === 'function') { try { _vfMassnahmen = await spGetWirkLeise() || []; } catch (e) { /* bleibt */ } } openVorfall(t.id); });
}

function vfAkteDrucken() {
  if (!_vfEditing) return;
  const { ticket, bewertung } = _vfEditing;
  const html = vfBerichtHtml({ ticket, bewertung, massnahmen: _vfMassnahmen || [], jetzt: _vfJetzt() });
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blockiert – bitte für diese Seite erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
