'use strict';

/**
 * Reiter „Wissen" – die Bibliothek
 * ================================
 * Themen, Videos, Artikel, Links und Wissenstests – freiwillig, für alle.
 * Neben den Regelwerken, nicht darüber: Nichts hier ist Pflicht, nichts
 * erinnert. Wer will, liest; wer will, testet sich. Was gelesen und bestanden
 * wurde, wird trotzdem festgehalten (ISO 27001 7.3 fragt nach Bewusstsein) –
 * in der Bestätigungen-Liste, mit der Kennung „wissen:<Beitrag>".
 *
 * Gepflegt wird im Reiter selbst („✎ Pflegen"): Admins und alle mit
 * Schreibrecht auf den Reiter. Die Inhalte liegen in wissen.json im
 * Konfigurationsordner – wie die Landkarte, keine neue Liste.
 * Das Modell (Formen, Kennzahlen, Startbestand) steht in wissenmodell.js.
 */

let _wi = null;               // { daten: {themen, beitraege}, geaendertAm }
let _wiFilter = { thema: '', art: '', q: '' };
let _wiPflege = false;        // Pflege-Modus (nur mit Schreibrecht)
let _wiOffen = '';            // Kennung des geöffneten Beitrags
let _wiEdit = null;           // Beitrag oder Thema im Dialog
let _wiAlleAcks = null;       // Nachweise aller Personen (Auswertung)
let _wiDeepLink = '';         // ?beitrag=… – wird nach dem Laden geöffnet
let _wiKurs = { id: '', schritt: 0 };   // offene Schulung: 0 = Übersicht, 1…n = Modul, n+1 = Wissenstest/Abschluss

/** Welche Module dieser Schulung schon gelesen wurden – aus dem Nachweis in SharePoint. */
function _wiFortschritt(b) { return wiFortschrittVon(b, _wiStand(b).ack); }

/**
 * Ein gelesenes Modul festhalten – im Nachweis (Spalte „Fortschritt"), damit
 * es auf jedem Gerät weitergeht. Läuft im Hintergrund; die Seite wartet nicht.
 */
async function _wiFortschrittMerken(b, modulId) {
  const gelesen = _wiFortschritt(b);
  if (gelesen.includes(modulId) || typeof spSaveAcknowledgement !== 'function') return;
  const s = _wiStand(b), now = _wiJetzt();
  try {
    await spSaveAcknowledgement({ id: s.ack ? s.ack.id : undefined, richtlinieId: wiAckId(b.id), version: b.stand || '1',
      benutzerUpn: State.user.upn, benutzerName: State.user.name, gelesenAm: (s.ack && s.ack.gelesenAm) || now,
      quizBestanden: !!(s.ack && s.ack.quizBestanden), quizScore: (s.ack && s.ack.quizScore) || 0, quizVersuche: (s.ack && s.ack.quizVersuche) || 0,
      abgeschlossenAm: (s.ack && s.ack.abgeschlossenAm) || '', fortschritt: wiFortschrittText(b, gelesen.concat([modulId])) });
    if (typeof reloadAcks === 'function') await reloadAcks();
    // Die Fortschrittsleiste zieht nach, wenn die Seite noch dieselbe ist.
    if (_wiOffen === b.id) { const el = document.querySelector('.wi-fortschritt'); if (el && typeof _wiFortschrittHtml === 'function') el.outerHTML = _wiFortschrittHtml(b); }
  } catch (e) { console.warn('[wissen] Fortschritt nicht gespeichert:', e.message); }
}

function wiDarfPflegen() { return typeof canWriteTab === 'function' && canWriteTab('wissen'); }
function _wiMeineAcks() { return (typeof State !== 'undefined' && Array.isArray(State.acks)) ? State.acks : []; }
function _wiGeltungSichtbar(g) { return (typeof geltungSichtbar === 'function') ? geltungSichtbar(g) : true; }
function _wiWer() { return (typeof State !== 'undefined' && State.user) ? (State.user.name || State.user.upn || '') : ''; }
function _wiJetzt() { return new Date().toISOString(); }
function _wiDatum(iso) { return iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; }
function _wiWerke() { return (typeof STANDORTE !== 'undefined') ? STANDORTE : WI_WERKE; }
function _wiThemaVon(b) { return wiThema(_wi.daten, b.thema); }
function _wiStand(b) { return wiStand(b, _wiMeineAcks()); }

/** Was diese Person sehen darf – im Pflege-Modus alles, sonst nur Aktives im Geltungsbereich. */
function wiBeitraegeSichtbar() {
  const alle = (_wi && _wi.daten.beitraege) || [];
  if (_wiPflege) return alle.slice();
  return alle.filter(b => wiSichtbar(b, { geltungSichtbar: _wiGeltungSichtbar }));
}

/* ── Laden ── */

async function initWissen(still) {
  const mount = document.getElementById('wissen-mount');
  if (!mount) return;
  if (!still) mount.innerHTML = '<div class="doc-loading">Lade Bibliothek …</div>';
  try {
    const d = await spLoadWissen();
    _wi = { daten: wiNormalisieren(d.daten), geaendertAm: d.geaendertAm || '' };
    // Der eigene Stand kommt aus den Bestätigungen – die sind da, sobald
    // „Meine Regelwerke" einmal geladen hat; über einen Link hierher noch nicht.
    if (typeof State !== 'undefined' && !State.loaded && typeof reloadAcks === 'function') { try { await reloadAcks(); } catch (e) { /* dann ohne Stand */ } }
  } catch (e) {
    mount.innerHTML = `<div class="col-warning" style="display:block"><b>Bibliothek nicht ladbar:</b> ${esc(e.message)}</div>`;
    return;
  }
  // Die Spalte „Fortschritt" der Bestätigungen legt der erste Admin an, der
  // hierher kommt – bis dahin ginge der Modul-Fortschritt still verloren.
  if (typeof spEnsureAckColumns === 'function') spEnsureAckColumns().catch(() => {});
  const wunsch = _wiDeepLink || (typeof window !== 'undefined' && window._wiDeepLinkWunsch) || '';
  if (wunsch) { _wiOffen = wiBeitrag(_wi.daten, wunsch) ? wunsch : ''; _wiDeepLink = ''; if (typeof window !== 'undefined') window._wiDeepLinkWunsch = ''; }
  renderWissen();
}

async function refreshWissen() { _wiAlleAcks = null; await initWissen(); }

/* ── Zeichnen ── */

function renderWissen() {
  const mount = document.getElementById('wissen-mount');
  if (!mount || !_wi) return;
  if (_wiOffen) {
    const b = wiBeitrag(_wi.daten, _wiOffen);
    if (b && (wiSichtbar(b, { geltungSichtbar: _wiGeltungSichtbar }) || _wiPflege)) { mount.innerHTML = _wiDetailHtml(b); return; }
    _wiOffen = '';
  }
  const pflege = wiDarfPflegen();
  const sichtbar = wiBeitraegeSichtbar();
  const meine = _wiMeineAcks();
  const erledigt = sichtbar.filter(b => wiStand(b, meine).erledigt).length;
  // Pflichtschulungen stehen oben – offen, begonnen oder zur Auffrischung fällig.
  const pflicht = sichtbar.filter(b => b.art === 'kurs' && b.pflicht && b.aktiv !== false)
    .map(b => ({ b, st: wiKursStatus(b, meine) })).filter(x => x.st.key !== 'erledigt');
  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 12px">
      <b>Freiwillig, jederzeit, ohne Nachweispflicht</b> – bis auf die Pflichtschulungen, die sind gekennzeichnet. Kurze Videos,
      Artikel, Schulungen und Tests rund um Sicherheit, Datenschutz und die Regeln im Haus – zum Nachschlagen, wenn eine Frage
      auftaucht, oder für fünf Minuten zwischendurch.
      ${sichtbar.length ? `<span style="color:var(--c-faint)">${sichtbar.length} Beiträge${erledigt ? ` · ${erledigt} davon erledigt` : ''}</span>` : ''}
    </div>
    ${pflicht.map(x => `<div class="wi-pflicht${x.st.key === 'faellig' ? ' faellig' : ''}">
        <span class="wi-pflicht-symbol">📋</span>
        <div style="flex:1;min-width:0"><b>Pflichtschulung${x.st.key === 'faellig' ? ' – Auffrischung fällig' : x.st.key === 'laeuft' ? ' – begonnen' : ''}:</b> ${esc(x.b.titel)}
          <span class="field-hint">${x.b.dauer ? `ca. ${x.b.dauer} Min. · ` : ''}${x.b.module.length} Module${x.b.fragen.length ? ' · 1 Wissenstest' : ''}</span></div>
        <button class="btn btn-primary btn-sm" onclick="wiKursStarten(${jsArg(x.b.id)})">${x.st.key === 'laeuft' ? 'Fortsetzen' : x.st.key === 'faellig' ? 'Auffrischen' : 'Starten'}</button>
      </div>`).join('')}
    <div class="view-toolbar">
      <div class="search-box">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input type="text" id="wi-suche" placeholder="Thema, Titel, Stichwort …" value="${esc(_wiFilter.q)}" oninput="wiSuche(this.value)">
      </div>
      <div class="toolbar-spacer"></div>
      ${pflege && _wiPflege ? `
        <button class="btn btn-primary btn-sm" onclick="wiBeitragDialog('')">+ Beitrag</button>
        <button class="btn btn-outline btn-sm" onclick="wiThemaDialog('')">+ Thema</button>
        <button class="btn btn-outline btn-sm" onclick="wiAuswertungOeffnen()" title="Wer hat was angesehen, welche Tests wurden bestanden">📊 Auswertung</button>
        <button class="btn btn-outline btn-sm" onclick="wiStartbestand()" title="Sechs Themen mit je einem Artikel und einem Wissenstest – als Vorschlag zum Anpassen">📋 Startbestand</button>` : ''}
      ${pflege ? `<button class="btn btn-sm ${_wiPflege ? 'btn-primary' : 'btn-ghost'}" onclick="wiPflegeUmschalten()"
        title="Beiträge und Themen anlegen, ändern, sortieren">${_wiPflege ? '✓ Fertig' : '✎ Pflegen'}</button>` : ''}
      <button class="btn btn-sm btn-ghost" onclick="refreshWissen()" title="Aktualisieren">↻</button>
    </div>
    ${_wiChipsHtml(sichtbar)}
    <div id="wi-liste">${_wiListeHtml()}</div>`;
}

/**
 * Die Filterleisten: Themen nach Bereich gruppiert, dazu die Arten. Kein
 * „Alle"-Knopf – ein Klick auf den aktiven Chip nimmt den Filter zurück, und
 * solange einer gesetzt ist, steht ein ✕ daneben. Die Bereichs-Beschriftung
 * zeigt, dass hier nicht nur IT steht.
 */
function _wiChipsHtml(sichtbar) {
  const chip = (aktiv, onclick, text, titel) => `<button type="button" class="wi-chip${aktiv ? ' aktiv' : ''}" onclick="${onclick}" title="${esc(titel || '')}"${aktiv ? ' aria-pressed="true"' : ''}>${text}</button>`;
  const themenMit = new Set(sichtbar.map(b => b.thema));
  const themen = _wi.daten.themen.filter(t => themenMit.has(t.id) || _wiPflege);
  const arten = WI_ARTEN.filter(a => sichtbar.some(b => b.art === a.key));
  if (!themen.length && !arten.length) return '';
  const bereiche = [...new Set(themen.map(t => t.bereich || ''))].sort((a, b) => Number(a === '') - Number(b === ''));   // ohne Bereich zuletzt
  const mehrereBereiche = bereiche.filter(Boolean).length > 1 || (bereiche.includes('') && bereiche.length > 1);
  const themaChip = (t) => chip(_wiFilter.thema === t.id, `wiFilter('thema',${jsArg(_wiFilter.thema === t.id ? '' : t.id)})`, `${esc(t.symbol)} ${esc(t.titel)}`, t.kurz);
  const weitere = (themenMit.has('') || sichtbar.some(b => !wiThema(_wi.daten, b.thema)))
    ? chip(_wiFilter.thema === '-', `wiFilter('thema',${jsArg(_wiFilter.thema === '-' ? '' : '-')})`, '📚 Weitere') : '';
  const aktiv = !!(_wiFilter.thema || _wiFilter.art);
  const zurueck = aktiv ? `<button type="button" class="wi-chip wi-chip-x" onclick="wiFilter('thema','');wiFilter('art','')" title="Filter zurücksetzen">✕</button>` : '';
  const themenHtml = mehrereBereiche
    ? bereiche.map(br => `<div class="wi-chips-gruppe"><span class="wi-chips-bereich">${esc(br || 'Weitere Bereiche')}</span>${themen.filter(t => (t.bereich || '') === br).map(themaChip).join('')}</div>`).join('') + (weitere ? `<div class="wi-chips-gruppe">${weitere}</div>` : '')
    : themen.map(themaChip).join('') + weitere;
  return `<div class="wi-chips${mehrereBereiche ? ' gruppiert' : ''}">${themenHtml}${mehrereBereiche ? '' : zurueck}</div>
    <div class="wi-chips">
      ${arten.map(a => chip(_wiFilter.art === a.key, `wiFilter('art',${jsArg(_wiFilter.art === a.key ? '' : a.key)})`, `${a.symbol} ${esc(a.label)}`, a.hinweis)).join('')}
      ${mehrereBereiche ? zurueck : ''}
    </div>`;
}

function _wiGefiltert() {
  const q = String(_wiFilter.q || '').trim().toLowerCase();
  return wiBeitraegeSichtbar().filter(b => {
    const t = _wiThemaVon(b);
    if (_wiFilter.thema === '-' ? !!t : (_wiFilter.thema && (!t || t.id !== _wiFilter.thema))) return false;
    if (_wiFilter.art && b.art !== _wiFilter.art) return false;
    if (q && !`${b.titel} ${b.kurz} ${t ? t.titel : ''} ${b.quelle}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Die Beiträge nach Thema gruppiert – in der Reihenfolge der Themen, Unzugeordnetes zuletzt. */
function _wiListeHtml() {
  const rows = _wiGefiltert();
  if (!rows.length) {
    const alle = wiBeitraegeSichtbar().length;
    if (!alle) return (typeof emptyState === 'function')
      ? emptyState(wiDarfPflegen() ? 'Noch keine Beiträge – „✎ Pflegen" und dann „+ Beitrag" oder „📋 Startbestand".' : 'Die Bibliothek wird gerade eingerichtet – bald gibt es hier etwas zu lesen.', '📚')
      : '';
    return (typeof emptyState === 'function') ? emptyState('Keine Treffer.', '🔍') : '';
  }
  const gruppen = _wi.daten.themen.map(t => ({ t, rows: rows.filter(b => b.thema === t.id) })).filter(g => g.rows.length || _wiPflege);
  const rest = rows.filter(b => !_wiThemaVon(b));
  if (rest.length) gruppen.push({ t: { id: '', titel: 'Weitere', symbol: '📚', kurz: '' }, rows: rest });
  return gruppen.map((g, gi) => `
    <div class="wi-gruppe">
      <div class="wi-gruppe-kopf">
        <span class="wi-gruppe-symbol">${esc(g.t.symbol)}</span>
        <div style="flex:1;min-width:0">
          <div class="wi-gruppe-titel">${esc(g.t.titel)} <span class="field-hint" style="font-weight:500">${g.rows.length} Beitr${g.rows.length === 1 ? 'ag' : 'äge'}</span></div>
          ${g.t.kurz ? `<div class="wi-gruppe-kurz">${esc(g.t.kurz)}</div>` : ''}
        </div>
        ${_wiPflege && g.t.id ? `<div class="wi-pflege">
          <button class="btn btn-ghost btn-sm" onclick="wiThemaVerschieben(${jsArg(g.t.id)},-1)" title="Nach oben" ${gi === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-ghost btn-sm" onclick="wiThemaVerschieben(${jsArg(g.t.id)},1)" title="Nach unten">↓</button>
          <button class="btn btn-ghost btn-sm" onclick="wiThemaDialog(${jsArg(g.t.id)})" title="Thema bearbeiten">✎</button>
          <button class="btn btn-ghost btn-sm" onclick="wiBeitragDialog('', ${jsArg(g.t.id)})" title="Beitrag in diesem Thema anlegen">+</button>
        </div>` : ''}
      </div>
      <div class="wi-karten">${g.rows.map(b => _wiKarteHtml(b)).join('')}</div>
    </div>`).join('');
}

function _wiStandHtml(b, s) {
  if (b.art === 'kurs') {
    const st = wiKursStatus(b, _wiMeineAcks());
    if (st.key === 'erledigt') return `<span class="wi-stand ok">✓ ${esc(st.text)}</span>`;
    if (st.key === 'faellig') return `<span class="wi-stand faellig">🔄 ${esc(st.text)}</span>`;
    if (st.key === 'laeuft') return `<span class="wi-stand">▶ begonnen · ${_wiFortschritt(b).length} von ${b.module.length} Modulen</span>`;
    return `<span class="wi-stand offen">○ ${esc(st.text)}</span>`;
  }
  if (b.art === 'test') {
    if (s.bestanden) return `<span class="wi-stand ok">✓ bestanden · ${s.score} %</span>`;
    if (s.versuche) return `<span class="wi-stand">${s.versuche} Versuch${s.versuche > 1 ? 'e' : ''} · zuletzt ${s.score} %</span>`;
    return '<span class="wi-stand offen">○ noch nicht gemacht</span>';
  }
  return s.gesehen ? `<span class="wi-stand ok">✓ angesehen ${_wiDatum(s.am)}</span>` : '<span class="wi-stand offen">○ noch nicht angesehen</span>';
}

function _wiKarteHtml(b) {
  const art = wiArt(b.art), s = _wiStand(b);
  const geltung = (b.geltung || []).includes('ALLE') ? '' : `<span class="ic-tag" title="Geltungsbereich">${esc(b.geltung.join(', '))}</span>`;
  return `
    <div class="wi-karte${b.aktiv === false ? ' inaktiv' : ''}${s.gesehen || s.bestanden ? ' erledigt' : ''}" onclick="wiOeffnen(${jsArg(b.id)})" role="button" tabindex="0"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();wiOeffnen(${jsArg(b.id)})}">
      <div class="wi-karte-kopf">
        <span class="wi-art wi-art-${art.key}">${art.symbol} ${esc(art.label)}</span>
        ${b.dauer ? `<span class="wi-dauer">⏱ ${b.dauer} min</span>` : ''}
        ${b.aktiv === false ? '<span class="ic-tag" style="background:#fef3c7;color:#92400e">inaktiv</span>' : ''}
        ${geltung}
        <span class="toolbar-spacer"></span>
        ${_wiPflege ? `<span class="wi-pflege" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="wiBeitragVerschieben(${jsArg(b.id)},-1)" title="Nach oben">↑</button>
          <button class="btn btn-ghost btn-sm" onclick="wiBeitragVerschieben(${jsArg(b.id)},1)" title="Nach unten">↓</button>
          <button class="btn btn-ghost btn-sm" onclick="wiBeitragDialog(${jsArg(b.id)})" title="Bearbeiten">✎</button>
        </span>` : ''}
      </div>
      <div class="wi-karte-titel">${esc(b.titel)}</div>
      ${b.kurz ? `<div class="wi-karte-kurz">${esc(b.kurz)}</div>` : ''}
      <div class="wi-karte-fuss">${_wiStandHtml(b, s)}${b.art === 'test' && b.fragen.length ? `<span class="field-hint">${b.fragen.length} Frage${b.fragen.length > 1 ? 'n' : ''}</span>` : ''}${
        b.art === 'kurs' ? `<span class="field-hint">${b.module.length} Module${b.fragen.length ? ' · Wissenstest' : ''}</span>${b.pflicht ? '<span class="ic-tag" style="background:#fef3c7;color:#92400e">📋 Pflicht</span>' : ''}` : ''}</div>
    </div>`;
}

function wiSuche(q) { _wiFilter.q = q || ''; const el = document.getElementById('wi-liste'); if (el) el.innerHTML = _wiListeHtml(); }
function wiFilter(feld, wert) { _wiFilter[feld] = wert || ''; renderWissen(); }
function wiPflegeUmschalten() { _wiPflege = !_wiPflege && wiDarfPflegen(); renderWissen(); }

/* ── Ein Beitrag ── */

function wiOeffnen(id) { _wiOffen = String(id || ''); _wiKurs = { id: _wiOffen, schritt: 0 }; renderWissen(); window.scrollTo(0, 0); }
function wiSchliessen() { _wiOffen = ''; renderWissen(); }

function wiLink(id) {
  const basis = (typeof location !== 'undefined') ? location.origin + location.pathname : '';
  return `${basis}?ansicht=wissen&beitrag=${encodeURIComponent(id)}`;
}
async function wiLinkKopieren(id) {
  try { await navigator.clipboard.writeText(wiLink(id)); toast('Link kopiert ✓ – für Mails, Aushänge, Schulungen.', 'success'); }
  catch (e) { toast('Link: ' + wiLink(id), 'info'); }
}

function _wiDetailHtml(b) {
  if (b.art === 'kurs') return _wiKursHtml(b);
  const art = wiArt(b.art), t = _wiThemaVon(b), s = _wiStand(b);
  let inhalt = '';
  if (b.art === 'video') {
    const e = (typeof videoEinbettung === 'function') ? videoEinbettung(b.url) : null;
    inhalt = e && e.art === 'einbetten'
      ? `<div class="lernvideo-rahmen"><iframe src="${esc(e.src)}" title="${esc(b.titel)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
      : e ? `<a class="btn btn-primary" href="${esc(sichereUrl(e.src))}" target="_blank" rel="noopener">▶ Video in neuem Tab öffnen</a>
            <div class="field-hint" style="margin-top:6px">Dieses Video lässt sich nicht einbetten – es öffnet beim Anbieter.</div>`
          : '<div class="field-hint">Keine gültige Video-Adresse hinterlegt.</div>';
  } else if (b.art === 'artikel') {
    inhalt = `<div class="wi-artikel">${wiTextHtml(b.text)}</div>`;
  } else if (b.art === 'link') {
    inhalt = `<a class="btn btn-primary" href="${esc(sichereUrl(b.url))}" target="_blank" rel="noopener">🔗 Öffnen: ${esc(b.url.replace(/^https?:\/\//i, '').split('/')[0])}</a>
      <div class="field-hint" style="margin-top:6px;word-break:break-all">${esc(b.url)}</div>`;
  } else {
    inhalt = `<div id="wi-test">
      <p style="margin:0 0 10px;line-height:1.55">${b.fragen.length} Frage${b.fragen.length > 1 ? 'n' : ''}, bestanden ab ${b.bestehen} % richtig.
        Freiwillig und beliebig oft – die Reihenfolge der Fragen und Antworten ist jedes Mal anders. Falsche Antworten werden
        nach der Auswertung mit der richtigen Lösung gezeigt: Der Test ist zugleich das Lernmittel.</p>
      ${s.bestanden ? `<div class="wi-stand ok" style="margin-bottom:10px">✓ Bestanden mit ${s.score} % (${_wiDatum(s.am)}). Noch einmal? Gern.</div>` : ''}
      <button class="btn btn-primary" onclick="wiTestStarten(${jsArg(b.id)})">${s.versuche ? 'Noch einmal versuchen' : 'Test starten'}</button>
    </div>`;
  }
  const quelle = b.quelle ? `<div class="lernvideo-quelle">Quelle: ${esc(b.quelle)}</div>` : '';
  const gesehenKnopf = b.art !== 'test'
    ? (s.gesehen
      ? `<span class="wi-stand ok">✓ Angesehen am ${_wiDatum(s.am)}</span>`
      : `<button class="btn btn-success btn-sm" onclick="wiGesehen(${jsArg(b.id)})" title="Freiwillig – hält fest, dass Sie den Beitrag angesehen haben">✓ Ich habe das angesehen</button>`)
    : '';
  return `
    <div class="wi-detail">
      <div class="view-toolbar" style="margin-bottom:12px">
        <button class="btn btn-sm btn-ghost" onclick="wiSchliessen()">← Zurück zur Bibliothek</button>
        <div class="toolbar-spacer"></div>
        <button class="btn btn-ghost btn-sm" onclick="wiLinkKopieren(${jsArg(b.id)})" title="Dauerhafter Link auf diesen Beitrag">🔗 Link</button>
        ${wiDarfPflegen() ? `<button class="btn btn-outline btn-sm" onclick="wiBeitragDialog(${jsArg(b.id)})">✎ Bearbeiten</button>` : ''}
      </div>
      <div class="wi-detail-kopf">
        <div class="ic-tags">
          <span class="wi-art wi-art-${art.key}">${art.symbol} ${esc(art.label)}</span>
          ${t ? `<span class="ic-tag cat" style="cursor:pointer" onclick="wiFilter('thema',${jsArg(t.id)});wiSchliessen()">${esc(t.symbol)} ${esc(t.titel)}</span>` : ''}
          ${b.dauer ? `<span class="ic-tag">⏱ ${b.dauer} min</span>` : ''}
          ${b.aktiv === false ? '<span class="ic-tag" style="background:#fef3c7;color:#92400e">inaktiv – nur im Pflege-Modus sichtbar</span>' : ''}
        </div>
        <h2 style="margin:6px 0 4px">${esc(b.titel)}</h2>
        ${b.kurz ? `<div class="wi-detail-kurz">${esc(b.kurz)}</div>` : ''}
      </div>
      <div class="wi-detail-inhalt">${inhalt}${quelle}</div>
      <div class="wi-detail-fuss">${gesehenKnopf}</div>
    </div>`;
}

/** Festhalten, dass ein Beitrag angesehen wurde – freiwillig, ein Klick. */
async function wiGesehen(id) {
  const b = wiBeitrag(_wi.daten, id);
  if (!b || typeof spSaveAcknowledgement !== 'function') return;
  const s = _wiStand(b);
  const now = _wiJetzt();
  try {
    await spSaveAcknowledgement({
      id: s.ack ? s.ack.id : undefined, richtlinieId: wiAckId(b.id), version: b.stand || '1',
      benutzerUpn: State.user.upn, benutzerName: State.user.name,
      gelesenAm: (s.ack && s.ack.gelesenAm) || now,
      quizBestanden: !!(s.ack && s.ack.quizBestanden), quizScore: (s.ack && s.ack.quizScore) || 0, quizVersuche: (s.ack && s.ack.quizVersuche) || 0,
      abgeschlossenAm: (s.ack && s.ack.abgeschlossenAm) || now,
    });
    if (typeof reloadAcks === 'function') await reloadAcks();
    toast('Festgehalten ✓', 'success');
  } catch (e) { toast('Konnte nicht gespeichert werden: ' + e.message, 'error'); }
  renderWissen();
}

/* ── Wissenstest – über die Engine aus quiz.js, aber ohne Regelwerk ── */

function wiTestStarten(id) {
  const b = wiBeitrag(_wi.daten, id);
  const host = document.getElementById('wi-test');
  if (!b || !host || !b.fragen.length) return;
  _quiz = { policyId: wiAckId(b.id), answers: {}, questions: shuffleQuiz(b.fragen) };
  host.innerHTML = `
    <div class="quiz-progress" style="margin-bottom:10px">${_quiz.questions.length} Frage(n) · bestanden ab ${b.bestehen} % richtig</div>
    <form id="quiz-form" onsubmit="return false">${_quiz.questions.map((q, i) => quizQuestionHtml(q, i)).join('')}</form>
    <div style="display:flex;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-primary btn-lg" id="quiz-submit" onclick="wiTestAuswerten(${jsArg(b.id)})">Antworten auswerten</button>
    </div>`;
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function wiTestAuswerten(id) {
  const b = wiBeitrag(_wi.daten, id);
  const host = document.getElementById('wi-test');
  if (!b || !host || !_quiz || _quiz.policyId !== wiAckId(b.id)) return;
  const qs = _quiz.questions, total = qs.length;
  if (Object.keys(_quiz.answers).length < total) { toast(`Bitte alle ${total} Fragen beantworten.`, 'error'); return; }
  let correct = 0;
  qs.forEach((q, i) => { if (_quiz.answers[i] === q.richtig) correct++; });
  const score = Math.round(correct / total * 100);
  const passed = score >= b.bestehen;
  qs.forEach((q, i) => {
    const qEl = host.querySelector(`.quiz-q[data-qi="${i}"]`);
    if (!qEl) return;
    qEl.querySelectorAll('input').forEach(inp => { inp.disabled = true; });
    qEl.querySelectorAll('.quiz-opt').forEach(o => {
      const oi = +o.dataset.oi;
      if (oi === q.richtig) o.classList.add('correct');
      else if (oi === _quiz.answers[i]) o.classList.add('wrong');
    });
  });
  const s = _wiStand(b);
  const now = _wiJetzt();
  const btn = document.getElementById('quiz-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichern …'; }
  try {
    await spSaveAcknowledgement({
      id: s.ack ? s.ack.id : undefined, richtlinieId: wiAckId(b.id), version: b.stand || '1',
      benutzerUpn: State.user.upn, benutzerName: State.user.name,
      gelesenAm: (s.ack && s.ack.gelesenAm) || now,
      quizBestanden: passed || !!(s.ack && s.ack.quizBestanden),
      quizScore: Math.max(score, (s.ack && s.ack.quizScore) || 0),
      quizVersuche: ((s.ack && s.ack.quizVersuche) || 0) + 1,
      // Eine Schulung wird mit jedem bestandenen Test neu abgeschlossen – so
      // beginnt die Frist der Wiederholung von vorn. Ein Test allein behält
      // sein erstes Datum.
      abgeschlossenAm: passed ? (b.art === 'kurs' ? now : ((s.ack && s.ack.abgeschlossenAm) || now)) : ((s.ack && s.ack.abgeschlossenAm) || ''),
    });
    if (typeof reloadAcks === 'function') await reloadAcks();
  } catch (e) { toast('Ergebnis konnte nicht gespeichert werden: ' + e.message, 'error'); }
  if (btn) btn.remove();
  const res = document.createElement('div');
  res.className = 'quiz-q quiz-result ' + (passed ? 'pass' : 'fail');
  const kurs = b.art === 'kurs';
  const neu = kurs && passed ? wiStand(b, _wiMeineAcks()) : null;
  res.innerHTML = `
    <div class="big">${score}%</div>
    <div class="msg">${correct} von ${total} richtig — ${passed
      ? (kurs ? `bestanden ✓ Schulung abgeschlossen${neu && neu.faelligAm ? `, gültig bis ${_wiDatum(neu.faelligAm)}` : ''}` : 'bestanden ✓')
      : 'noch nicht bestanden – die richtigen Antworten stehen oben'}</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      ${passed && kurs ? `<button class="btn btn-success" onclick="wiZertifikat(${jsArg(b.id)})">🎓 Bescheinigung</button><button class="btn btn-outline" onclick="wiKursZu(${jsArg(b.id)}, 0)">Zur Übersicht</button>` : ''}
      <button class="btn ${passed ? (kurs ? 'btn-ghost' : 'btn-success') : 'btn-primary'}" onclick="wiTestStarten(${jsArg(b.id)})">${passed ? 'Noch einmal' : 'Erneut versuchen'}</button>
      <button class="btn btn-ghost" onclick="wiSchliessen()">Zurück zur Bibliothek</button>
    </div>`;
  host.appendChild(res);
  res.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ── Schulung: Übersicht → Module → Wissenstest ── */

function _wiKursHtml(b) {
  const n = b.module.length, mitTest = b.fragen.length > 0;
  const schritt = (_wiKurs.id === b.id) ? _wiKurs.schritt : 0;
  const gelesen = _wiFortschritt(b);
  const st = wiKursStatus(b, _wiMeineAcks());
  const kopf = `
    <div class="view-toolbar" style="margin-bottom:12px">
      <button class="btn btn-sm btn-ghost" onclick="wiSchliessen()">← Zurück zur Bibliothek</button>
      ${schritt > 0 ? `<button class="btn btn-sm btn-ghost" onclick="wiKursZu(${jsArg(b.id)}, 0)">☰ Übersicht</button>` : ''}
      <div class="toolbar-spacer"></div>
      <button class="btn btn-ghost btn-sm" onclick="wiLinkKopieren(${jsArg(b.id)})" title="Dauerhafter Link auf diese Schulung">🔗 Link</button>
      ${wiDarfPflegen() ? `<button class="btn btn-outline btn-sm" onclick="wiBeitragDialog(${jsArg(b.id)})">✎ Bearbeiten</button>` : ''}
    </div>`;
  const fortschritt = _wiFortschrittHtml(b);

  if (schritt === 0) {
    const t = _wiThemaVon(b);
    const statusHtml = st.key === 'erledigt' ? `<div class="wi-box ok" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="flex:1">✓ Sie haben diese Schulung abgeschlossen${st.stand.am ? ' am ' + _wiDatum(st.stand.am) : ''}${st.stand.faelligAm ? ` – gültig bis ${_wiDatum(st.stand.faelligAm)}` : ''}.</span><button class="btn btn-outline btn-sm" onclick="wiZertifikat(${jsArg(b.id)})">🎓 Bescheinigung</button></div>`
      : st.key === 'faellig' ? `<div class="wi-box warn">🔄 Ihr Abschluss vom ${_wiDatum(st.stand.am)} ist abgelaufen – bitte auffrischen.</div>`
      : st.key === 'laeuft' ? `<div class="wi-box info">▶ Begonnen – ${gelesen.length} von ${n} Modulen gelesen.</div>` : '';
    const knopf = st.key === 'laeuft' && gelesen.length < n ? 'Fortsetzen' : st.key === 'erledigt' ? 'Noch einmal durchgehen' : st.key === 'faellig' ? 'Auffrischen' : 'Schulung starten';
    return kopf + `
    <div class="wi-kurs">
      <div class="wi-kurs-hero">
        <div class="ic-tags">
          <span class="wi-art wi-art-kurs">🎓 Schulung</span>
          ${t ? `<span class="ic-tag cat">${esc(t.symbol)} ${esc(t.titel)}</span>` : ''}
          ${b.pflicht ? '<span class="ic-tag" style="background:#fef3c7;color:#92400e">📋 Pflichttraining</span>' : ''}
          ${b.aktiv === false ? '<span class="ic-tag" style="background:#fef3c7;color:#92400e">inaktiv – nur im Pflege-Modus sichtbar</span>' : ''}
        </div>
        <h2 style="margin:8px 0 6px">${esc(b.titel)}</h2>
        ${b.intro ? `<div class="wi-kurs-intro"><div class="wi-kurs-warum">Warum dieser Kurs?</div>${wiTextHtml(b.intro)}</div>` : (b.kurz ? `<div class="wi-detail-kurz">${esc(b.kurz)}</div>` : '')}
      </div>
      <div class="wi-meta">
        <div class="wi-meta-kachel"><span class="wi-meta-symbol">⏱</span><div><div class="wi-meta-titel">Dauer</div><div>${b.dauer ? `Ca. ${b.dauer} Minuten · ` : ''}${n} Modul${n === 1 ? '' : 'e'}${mitTest ? ' · 1 Wissenstest' : ''}</div></div></div>
        <div class="wi-meta-kachel"><span class="wi-meta-symbol">🎓</span><div><div class="wi-meta-titel">Zielgruppe</div><div>${esc(b.zielgruppe || 'Alle Mitarbeitenden')}</div></div></div>
        <div class="wi-meta-kachel"><span class="wi-meta-symbol">📋</span><div><div class="wi-meta-titel">${b.pflicht ? 'Pflichttraining' : 'Freiwillig'}</div><div>${b.pflicht ? 'Diese Schulung ist für die Zielgruppe verpflichtend' : 'Keine Pflicht – aber empfohlen'}</div></div></div>
        <div class="wi-meta-kachel"><span class="wi-meta-symbol">🔄</span><div><div class="wi-meta-titel">Wiederholung</div><div>${b.wiederholung ? (b.wiederholung === 12 ? 'Jährliche Auffrischung' : `Alle ${b.wiederholung} Monate`) : 'Keine Wiederholung nötig'}</div></div></div>
      </div>
      ${statusHtml}
      ${b.ziele.length ? `<div class="wi-kurs-block"><h3>Nach dieser Schulung können Sie …</h3><ul class="wi-ziele">${b.ziele.map(z => `<li>${esc(z)}</li>`).join('')}</ul></div>` : ''}
      <div class="wi-kurs-block"><h3>Die Module</h3>
        <ol class="wi-module">${b.module.map((m, i) => `<li class="${gelesen.includes(m.id) ? 'da' : ''}" onclick="wiKursZu(${jsArg(b.id)}, ${i + 1})" role="button" tabindex="0"
            onkeydown="if(event.key==='Enter'){wiKursZu(${jsArg(b.id)}, ${i + 1})}"><span class="wi-modul-nr">${String(i + 1).padStart(2, '0')}</span><span>${esc(m.titel)}</span><span class="wi-modul-stand">${gelesen.includes(m.id) ? '✓' : ''}</span></li>`).join('')}${
          mitTest ? `<li class="${st.key === 'erledigt' ? 'da' : ''}" onclick="wiKursZu(${jsArg(b.id)}, ${n + 1})" role="button" tabindex="0"><span class="wi-modul-nr">❓</span><span>Wissenstest · ${b.fragen.length} Fragen, bestanden ab ${b.bestehen} %</span><span class="wi-modul-stand">${st.key === 'erledigt' ? '✓' : ''}</span></li>` : ''}</ol>
      </div>
      <div class="wi-detail-fuss"><button class="btn btn-primary btn-lg" onclick="wiKursStarten(${jsArg(b.id)})">${knopf} →</button>${fortschritt}</div>
    </div>`;
  }

  if (schritt >= 1 && schritt <= n) {
    const m = b.module[schritt - 1];
    const letztes = schritt === n;
    return kopf + `
    <div class="wi-kurs">
      <div class="wi-modul-kopf"><span class="wi-modul-zaehler">Modul ${String(schritt).padStart(2, '0')} von ${String(n).padStart(2, '0')}</span>${fortschritt}</div>
      <h2 style="margin:4px 0 12px">${esc(m.titel)}</h2>
      <div class="wi-artikel">${wiTextHtml(m.text)}</div>
      <div class="wi-detail-fuss" style="justify-content:space-between">
        <button class="btn btn-outline" onclick="wiKursZu(${jsArg(b.id)}, ${schritt - 1})">← ${schritt === 1 ? 'Übersicht' : 'Zurück'}</button>
        <button class="btn btn-primary" onclick="wiKursWeiter(${jsArg(b.id)}, ${schritt})">${letztes ? (mitTest ? 'Zum Wissenstest →' : 'Schulung abschließen ✓') : 'Weiter →'}</button>
      </div>
    </div>`;
  }

  // n+1: der Wissenstest – oder, ohne Test, der Abschluss
  return kopf + `
    <div class="wi-kurs">
      <div class="wi-modul-kopf"><span class="wi-modul-zaehler">${mitTest ? 'Wissenstest' : 'Abschluss'}</span>${fortschritt}</div>
      <h2 style="margin:4px 0 12px">${mitTest ? 'Wissenstest: ' + esc(b.titel) : 'Geschafft'}</h2>
      ${mitTest ? `<div id="wi-test">
        <p style="margin:0 0 10px;line-height:1.55">${b.fragen.length} Frage${b.fragen.length > 1 ? 'n' : ''}, bestanden ab ${b.bestehen} % richtig.
          Die Reihenfolge ist jedes Mal anders; nach der Auswertung sehen Sie die richtigen Antworten. Nicht bestanden heißt: noch einmal – ohne Sperrfrist.</p>
        ${gelesen.length < n ? `<div class="wi-box info">Sie haben ${gelesen.length} von ${n} Modulen gelesen – der Test geht trotzdem. Die Module stehen jederzeit in der Übersicht.</div>` : ''}
        <button class="btn btn-primary" onclick="wiTestStarten(${jsArg(b.id)})">Test starten</button>
      </div>` : `<div class="wi-box ok">Sie haben alle ${n} Module gelesen.</div>
        <div class="wi-detail-fuss">${st.key === 'erledigt' ? `<span class="wi-stand ok">✓ Abgeschlossen am ${_wiDatum(st.stand.am)}</span><button class="btn btn-outline btn-sm" onclick="wiZertifikat(${jsArg(b.id)})">🎓 Bescheinigung</button>` : `<button class="btn btn-success" onclick="wiKursAbschliessen(${jsArg(b.id)})">✓ Schulung abschließen</button>`}</div>`}
    </div>`;
}

function _wiFortschrittHtml(b) {
  const gelesen = _wiFortschritt(b), st = wiKursStatus(b, _wiMeineAcks());
  return `<div class="wi-fortschritt" title="${gelesen.length} von ${b.module.length} Modulen gelesen">${b.module.map(m =>
    `<span class="${gelesen.includes(m.id) ? 'da' : ''}"></span>`).join('')}${b.fragen.length ? `<span class="test ${st.key === 'erledigt' ? 'da' : ''}"></span>` : ''}</div>`;
}

/** Die Teilnahmebescheinigung – eine eigene Seite zum Drucken oder als PDF. */
function wiZertifikat(id) {
  const b = wiBeitrag(_wi.daten, id);
  if (!b) return;
  const s = _wiStand(b);
  if (!s.erledigt) { toast('Die Bescheinigung gibt es nach dem Abschluss.', 'error'); return; }
  const html = wiZertifikatHtml({ kurs: b, stand: s, name: State.user.name, upn: State.user.upn, jetzt: _wiJetzt(), logo: rmsAssetUrl('dihag-logo.png') });
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blockiert – bitte für diese Seite erlauben.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function wiKursZu(id, schritt) {
  const b = wiBeitrag(_wi.daten, id);
  if (!b) return;
  _wiOffen = b.id;
  _wiKurs = { id: b.id, schritt: Math.max(0, Math.min(b.module.length + 1, Number(schritt) || 0)) };
  renderWissen(); window.scrollTo(0, 0);
}

/** Starten oder fortsetzen: beim ersten Modul, das noch nicht gelesen ist. */
async function wiKursStarten(id) {
  const b = wiBeitrag(_wi.daten, id);
  if (!b) return;
  const gelesen = _wiFortschritt(b);
  const erstesOffen = b.module.findIndex(m => !gelesen.includes(m.id));
  // „Begonnen" festhalten – einmal, still. So sieht die Auswertung, wer
  // angefangen hat, und die Karte zeigt „begonnen" auch auf einem anderen Gerät.
  const s = _wiStand(b);
  if (!s.ack && typeof spSaveAcknowledgement === 'function') {
    try {
      await spSaveAcknowledgement({ richtlinieId: wiAckId(b.id), version: b.stand || '1', benutzerUpn: State.user.upn, benutzerName: State.user.name,
        gelesenAm: _wiJetzt(), quizBestanden: false, quizScore: 0, quizVersuche: 0, abgeschlossenAm: '' });
      if (typeof reloadAcks === 'function') await reloadAcks();
    } catch (e) { /* dann ohne „begonnen" – der Abschluss zählt */ }
  }
  wiKursZu(id, erstesOffen >= 0 ? erstesOffen + 1 : (b.fragen.length ? b.module.length + 1 : 1));
}

/** „Weiter": das Modul gilt als gelesen, dann das nächste – oder der Test. */
function wiKursWeiter(id, schritt) {
  const b = wiBeitrag(_wi.daten, id);
  if (!b) return;
  const m = b.module[schritt - 1];
  if (schritt >= b.module.length && !b.fragen.length) { wiKursAbschliessen(id); return; }
  wiKursZu(id, schritt + 1);
  if (m) _wiFortschrittMerken(b, m.id).catch(() => {});   // nach dem Umblättern – die Seite wartet nicht auf SharePoint
}

/** Ohne Wissenstest: alle Module gelesen = abgeschlossen. */
async function wiKursAbschliessen(id) {
  const b = wiBeitrag(_wi.daten, id);
  if (!b || typeof spSaveAcknowledgement !== 'function') return;
  const s = _wiStand(b), now = _wiJetzt();
  try {
    await spSaveAcknowledgement({ id: s.ack ? s.ack.id : undefined, richtlinieId: wiAckId(b.id), version: b.stand || '1',
      benutzerUpn: State.user.upn, benutzerName: State.user.name, gelesenAm: (s.ack && s.ack.gelesenAm) || now,
      quizBestanden: !!(s.ack && s.ack.quizBestanden), quizScore: (s.ack && s.ack.quizScore) || 0, quizVersuche: (s.ack && s.ack.quizVersuche) || 0,
      abgeschlossenAm: now });
    if (typeof reloadAcks === 'function') await reloadAcks();
    toast('Schulung abgeschlossen ✓', 'success');
  } catch (e) { toast('Konnte nicht gespeichert werden: ' + e.message, 'error'); }
  wiKursZu(id, b.module.length + 1);
}

/* ── Pflege: speichern ── */

async function wiSpeichern(meldung) {
  try {
    const r = await spSaveWissen(_wi.daten, _wi.geaendertAm);
    _wi.geaendertAm = r.geaendertAm || '';
    if (meldung) toast(meldung, 'success');
    return true;
  } catch (e) {
    if (/zwischenzeitlich/i.test(e.message)) {
      toast('Jemand hat die Bibliothek zwischenzeitlich geändert – sie wird neu geladen, bitte die Änderung wiederholen.', 'error');
      await initWissen(true);
    } else toast('Speichern fehlgeschlagen: ' + e.message, 'error');
    return false;
  }
}

/* ── Pflege: Themen ── */

function wiThemaDialog(id) {
  if (!wiDarfPflegen()) return;
  const t = id ? wiThema(_wi.daten, id) : null;
  _wiEdit = t ? Object.assign({}, t) : { id: '', titel: '', symbol: '📚', kurz: '', bereich: '' };
  openModal(`
    <div class="modal-header"><h3>${t ? 'Thema bearbeiten' : 'Neues Thema'}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="wi-zeile">
        <div class="form-group" style="flex:0 0 90px"><label>Symbol</label>
          <input type="text" id="wi-t-symbol" value="${esc(_wiEdit.symbol)}" maxlength="4" style="text-align:center;font-size:1.2rem"></div>
        <div class="form-group" style="flex:1"><label>Titel <span class="req">*</span></label>
          <input type="text" id="wi-t-titel" value="${esc(_wiEdit.titel)}" placeholder="z. B. Phishing &amp; E-Mail"></div>
      </div>
      <div class="form-group full"><label>Eine Zeile dazu</label>
        <input type="text" id="wi-t-kurz" value="${esc(_wiEdit.kurz)}" placeholder="Worum es in diesem Thema geht – ein Satz"></div>
      <div class="form-group full"><label>Bereich</label>
        <input type="text" id="wi-t-bereich" list="wi-bereiche" value="${esc(_wiEdit.bereich || '')}" placeholder="z. B. Informationssicherheit, Compliance & Verhalten, Arbeitssicherheit">
        <datalist id="wi-bereiche">${WI_BEREICHE.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
        <span class="field-hint">Die Themenleiste gruppiert nach Bereich – so sieht man, dass hier nicht nur IT steht.</span></div>
      ${t ? `<div class="field-hint">${_wi.daten.beitraege.filter(b => b.thema === t.id).length} Beiträge in diesem Thema. Beim Löschen bleiben sie erhalten und stehen unter „Weitere".</div>` : ''}
    </div>
    <div class="modal-footer">
      ${t ? `<button class="btn btn-ghost" style="color:#b91c1c" onclick="wiThemaLoeschen(${jsArg(t.id)})">Löschen</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="wiThemaSpeichern()">Speichern</button>
    </div>`);
}

async function wiThemaSpeichern() {
  const titel = (document.getElementById('wi-t-titel') || {}).value || '';
  if (!titel.trim()) { toast('Bitte einen Titel angeben.', 'error'); return; }
  const symbol = ((document.getElementById('wi-t-symbol') || {}).value || '📚').trim() || '📚';
  const kurz = ((document.getElementById('wi-t-kurz') || {}).value || '').trim();
  const bereich = ((document.getElementById('wi-t-bereich') || {}).value || '').trim();
  if (_wiEdit.id) {
    Object.assign(wiThema(_wi.daten, _wiEdit.id), { titel: titel.trim(), symbol, kurz, bereich });
  } else {
    let id = wiSlug(titel);
    while (wiThema(_wi.daten, id)) id += '-2';
    _wi.daten.themen.push({ id, titel: titel.trim(), symbol, kurz, bereich });
  }
  if (await wiSpeichern('Thema gespeichert ✓')) { closeModal(); renderWissen(); }
}

async function wiThemaLoeschen(id) {
  const t = wiThema(_wi.daten, id);
  if (!t) return;
  const n = _wi.daten.beitraege.filter(b => b.thema === id).length;
  if (!await uiConfirm(`Thema „${t.titel}" löschen?${n ? ` Die ${n} Beiträge bleiben erhalten und stehen dann unter „Weitere".` : ''}`, { title: 'Thema löschen', okLabel: 'Löschen', danger: true })) return;
  _wi.daten.themen = _wi.daten.themen.filter(x => x.id !== id);
  _wi.daten.beitraege.forEach(b => { if (b.thema === id) b.thema = ''; });
  if (_wiFilter.thema === id) _wiFilter.thema = '';
  if (await wiSpeichern('Thema gelöscht.')) { closeModal(); renderWissen(); }
}

async function wiThemaVerschieben(id, richtung) {
  const arr = _wi.daten.themen;
  const i = arr.findIndex(t => t.id === id);
  const j = i + (richtung < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  if (await wiSpeichern()) renderWissen();
}

/* ── Pflege: Beiträge ── */

function wiBeitragDialog(id, thema) {
  if (!wiDarfPflegen()) return;
  const b = id ? wiBeitrag(_wi.daten, id) : null;
  _wiEdit = b ? JSON.parse(JSON.stringify(b)) : wiNormalisieren({ beitraege: [{ id: wiNeueId(), art: 'video', thema: thema || _wiFilter.thema || '', titel: '', geltung: ['ALLE'], aktiv: true }] }).beitraege[0];
  _wiEdit._neu = !b;
  openModal(_wiBeitragDialogHtml(), true);
}

function _wiBeitragDialogHtml() {
  const b = _wiEdit;
  const art = wiArt(b.art);
  const werke = _wiWerke();
  const alle = (b.geltung || []).includes('ALLE');
  const fehler = wiBeitragFehler(b);
  let artFelder = '';
  if (b.art === 'video' || b.art === 'link') {
    const e = (typeof videoEinbettung === 'function') ? videoEinbettung(b.url) : null;
    const herkunft = (typeof videoHerkunft === 'function') ? videoHerkunft(b.url) : { extern: false, dienst: '' };
    const status = !String(b.url || '').trim() ? ''
      : b.art === 'link' ? (e ? '<span class="field-hint">↗ öffnet in einem neuen Tab</span>' : '<span class="field-hint" style="color:#b45309">⚠ keine gültige Adresse (https://…)</span>')
      : e && e.art === 'einbetten' ? '<span class="field-hint" style="color:#15803d">▶ wird direkt in der Seite abgespielt</span>'
      : e ? '<span class="field-hint">↗ nicht einbettbar – öffnet in einem neuen Tab</span>'
      : '<span class="field-hint" style="color:#b45309">⚠ keine gültige Adresse erkannt</span>';
    artFelder = `
      <div class="form-group full"><label>${b.art === 'video' ? 'Video-Adresse oder Einbetten-Code' : 'Adresse'} <span class="req">*</span></label>
        <input type="text" id="wi-b-url" value="${esc(b.url)}" placeholder="${b.art === 'video' ? 'Stream/SharePoint: Teilen → Einbetten, Code hier einfügen – oder YouTube/Vimeo-Adresse' : 'https://…'}"
          oninput="wiEditSet('url',this.value)" onchange="wiEditNeu()">
        ${status}</div>
      <div class="form-group full"><label>Quelle${herkunft.extern ? ' <span class="req">*</span>' : ''}</label>
        <input type="text" id="wi-b-quelle" value="${esc(b.quelle)}" placeholder="z. B. Bundesamt für Sicherheit in der Informationstechnik (BSI)" oninput="wiEditSet('quelle',this.value)">
        ${herkunft.extern && !String(b.quelle || '').trim() ? `<span class="field-hint" style="color:#b45309">⚠ Fremdes Material (${esc(herkunft.dienst)}) – bitte die Quelle angeben.</span>` : ''}</div>`;
  } else if (b.art === 'kurs') {
    artFelder = `
      <div class="form-group full"><label>Warum dieser Kurs? (Einstieg)</label>
        <textarea id="wi-b-intro" rows="3" style="width:100%;font-family:inherit;font-size:.9rem;line-height:1.5" placeholder="Zwei, drei Sätze: Warum lohnt sich das – **fett** geht auch." oninput="wiEditSet('intro',this.value)">${esc(b.intro)}</textarea></div>
      <div class="wi-zeile">
        <div class="form-group" style="flex:1"><label>Zielgruppe</label>
          <input type="text" value="${esc(b.zielgruppe)}" placeholder="Alle Mitarbeitenden – kein Vorwissen erforderlich" oninput="wiEditSet('zielgruppe',this.value)"></div>
        <div class="form-group" style="flex:0 0 170px"><label>Wiederholung</label>
          <select onchange="wiEditSet('wiederholung',+this.value)">
            ${[[0, 'keine'], [6, 'alle 6 Monate'], [12, 'jährlich'], [24, 'alle 2 Jahre'], [36, 'alle 3 Jahre']].map(([m, l]) => `<option value="${m}"${b.wiederholung === m ? ' selected' : ''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <label class="ack-check" style="font-weight:600;margin-bottom:8px"><input type="checkbox" ${b.pflicht ? 'checked' : ''} onchange="wiEditSet('pflicht',this.checked)"> Pflichttraining – steht bei allen oben, bis es abgeschlossen ist${b.wiederholung ? ' (und wieder, wenn die Wiederholung fällig ist)' : ''}</label>
      <div class="form-group full"><label>Nach dieser Schulung können Sie … (eine Zeile je Ziel)</label>
        <textarea id="wi-b-ziele" rows="4" style="width:100%;font-family:inherit;font-size:.9rem;line-height:1.5" placeholder="Phishing-E-Mails an typischen Merkmalen erkennen&#10;Im Ernstfall richtig und schnell reagieren" oninput="wiEditSet('ziele',this.value.split('\\n'))">${esc(b.ziele.join('\n'))}</textarea></div>
      <div class="form-group full"><label>Module <span class="req">*</span></label>
        <div id="wi-module">${_wiModuleHtml()}</div>
        <button class="btn btn-ghost btn-sm" onclick="wiModulAdd()">+ Modul</button>
        <span class="field-hint">Je Modul eine Seite. Schreibweise wie beim Artikel – dazu <code>1. Schritt</code> für nummerierte Schritte,
          <code>&gt; Hinweis</code>, <code>&gt;! Warnung</code>, <code>&gt;✓ Gut zu wissen</code> als Kästen, <code>!! Titel: Text</code> für ein Warnsignal
          und <code>:::mail … :::</code> für eine nachgebaute E-Mail (Von:/An:/Betreff:/Hinweis:, dann <code>---</code>, dann der Text; <code>[→ Knopf]</code>).</span></div>
      <div class="form-group full" style="margin-top:6px"><label>Wissenstest zum Schluss <span class="field-hint" style="font-weight:400">(empfohlen – ohne Test gilt die Schulung mit dem letzten Modul als abgeschlossen)</span></label>
        <div class="wi-zeile" style="align-items:center;gap:8px;margin-bottom:6px">
          <label style="margin:0">Bestanden ab</label>
          <input type="number" min="1" max="100" value="${b.bestehen}" style="width:72px" oninput="wiEditSet('bestehen',Math.max(1,Math.min(100,+this.value||${WI_BESTEHEN})))"> %
        </div>
        <div id="wi-fragen">${_wiFragenHtml()}</div>
        <button class="btn btn-ghost btn-sm" onclick="wiFrageAdd()">+ Frage hinzufügen</button></div>`;
  } else if (b.art === 'artikel') {
    artFelder = `
      <div class="form-group full"><label>Text <span class="req">*</span></label>
        <textarea id="wi-b-text" rows="14" style="width:100%;font-family:inherit;font-size:.9rem;line-height:1.5" placeholder="Leerzeile trennt Absätze, „- “ beginnt eine Aufzählung, **fett** hebt hervor, „# “ macht eine Zwischenüberschrift." oninput="wiEditSet('text',this.value)">${esc(b.text)}</textarea>
        <span class="field-hint">Kurz und konkret: Was ist das Risiko, woran erkennt man es, was tut man. Drei Absätze schlagen drei Seiten.</span></div>
      <div class="form-group full"><label>Quelle</label>
        <input type="text" id="wi-b-quelle" value="${esc(b.quelle)}" placeholder="falls der Text auf einer Vorlage beruht" oninput="wiEditSet('quelle',this.value)"></div>`;
  } else {
    artFelder = `
      <div class="wi-zeile" style="align-items:center;gap:8px">
        <label style="margin:0">Bestanden ab</label>
        <input type="number" min="1" max="100" value="${b.bestehen}" style="width:72px" oninput="wiEditSet('bestehen',Math.max(1,Math.min(100,+this.value||${WI_BESTEHEN})))"> %
      </div>
      <div id="wi-fragen">${_wiFragenHtml()}</div>
      <button class="btn btn-ghost btn-sm" onclick="wiFrageAdd()">+ Frage hinzufügen</button>`;
  }
  return `
    <div class="modal-header"><h3>${b._neu ? 'Neuer Beitrag' : 'Beitrag bearbeiten'}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="wi-zeile">
        <div class="form-group" style="flex:0 0 200px"><label>Art</label>
          <select id="wi-b-art" onchange="wiEditSet('art',this.value);wiEditNeu()">
            ${WI_ARTEN.map(a => `<option value="${a.key}"${a.key === b.art ? ' selected' : ''}>${a.symbol} ${esc(a.label)}</option>`).join('')}
          </select></div>
        <div class="form-group" style="flex:1"><label>Thema</label>
          <select id="wi-b-thema" onchange="wiEditSet('thema',this.value)">
            <option value="">— Weitere —</option>
            ${_wi.daten.themen.map(t => `<option value="${esc(t.id)}"${t.id === b.thema ? ' selected' : ''}>${esc(t.symbol)} ${esc(t.titel)}</option>`).join('')}
          </select></div>
        <div class="form-group" style="flex:0 0 110px"><label>Dauer (min)</label>
          <input type="number" min="0" max="600" value="${b.dauer || ''}" placeholder="5" oninput="wiEditSet('dauer',+this.value||0)"></div>
      </div>
      <div class="field-hint" style="margin:-4px 0 10px">${esc(art.hinweis)}</div>
      <div class="form-group full"><label>Titel <span class="req">*</span></label>
        <input type="text" id="wi-b-titel" value="${esc(b.titel)}" placeholder="z. B. Phishing erkennen in 60 Sekunden" oninput="wiEditSet('titel',this.value)"></div>
      <div class="form-group full"><label>Eine Zeile dazu</label>
        <input type="text" id="wi-b-kurz" value="${esc(b.kurz)}" placeholder="Was man nach dem Anschauen weiß – ein Satz" oninput="wiEditSet('kurz',this.value)"></div>
      ${artFelder}
      <div class="form-group full" style="margin-top:8px"><label>Gilt für</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px 14px">
          <label class="ack-check" style="font-weight:600"><input type="checkbox" ${alle ? 'checked' : ''} onchange="wiEditGeltung('ALLE',this.checked)"> Alle Standorte</label>
          ${werke.map(w => `<label class="ack-check"><input type="checkbox" ${!alle && b.geltung.includes(w) ? 'checked' : ''} ${alle ? 'disabled' : ''} onchange="wiEditGeltung(${jsArg(w)},this.checked)"> ${esc(w)}</label>`).join('')}
        </div>
        <span class="field-hint">Ist die Trennung nach Gesellschaft eingeschaltet, sehen Beiträge nur die Werke, für die sie gelten. Konzernweites sieht jede:r.</span></div>
      <label class="ack-check" style="font-weight:600;margin-top:6px"><input type="checkbox" ${b.aktiv !== false ? 'checked' : ''} onchange="wiEditSet('aktiv',this.checked)"> Sichtbar (inaktive Beiträge sehen nur Pflegende)</label>
      ${fehler.length ? `<div class="col-warning" style="display:block;margin-top:10px"><b>Noch offen:</b><ul style="margin:4px 0 0 18px;padding:0">${fehler.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
      ${!b._neu && (b.erstelltAm || b.geaendertAm) ? `<div class="field-hint" style="margin-top:10px">${b.erstelltAm ? `Angelegt ${_wiDatum(b.erstelltAm)}${b.erstelltVon ? ' von ' + esc(b.erstelltVon) : ''}` : ''}${b.geaendertAm ? ` · zuletzt geändert ${_wiDatum(b.geaendertAm)}${b.geaendertVon ? ' von ' + esc(b.geaendertVon) : ''}` : ''}</div>` : ''}
    </div>
    <div class="modal-footer">
      ${!b._neu ? `<button class="btn btn-ghost" style="color:#b91c1c" onclick="wiBeitragLoeschen(${jsArg(b.id)})">Löschen</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="wiBeitragSpeichern()">Speichern</button>
    </div>`;
}

function _wiModuleHtml() {
  const module = _wiEdit.module || [];
  if (!module.length) return '<div class="field-hint" style="margin-bottom:10px">Noch kein Modul. Fünf kurze schlagen ein langes: eine Frage je Modul, eine Seite je Antwort.</div>';
  return module.map((m, i) => `
    <div class="qe-item">
      <div class="qe-head"><span class="t">Modul ${String(i + 1).padStart(2, '0')}</span>
        <span style="display:inline-flex;gap:2px">
          <button class="btn btn-ghost btn-sm" onclick="wiModulVerschieben(${i},-1)" ${i === 0 ? 'disabled' : ''} title="Nach oben">↑</button>
          <button class="btn btn-ghost btn-sm" onclick="wiModulVerschieben(${i},1)" ${i === module.length - 1 ? 'disabled' : ''} title="Nach unten">↓</button>
          <button class="btn btn-ghost btn-sm" onclick="wiModulRemove(${i})">Entfernen</button></span></div>
      <div class="form-group full" style="margin-bottom:8px">
        <input type="text" value="${esc(m.titel)}" oninput="_wiEdit.module[${i}].titel=this.value" placeholder="Titel des Moduls, z. B. Was ist Phishing?"></div>
      <div class="form-group full" style="margin-bottom:0">
        <textarea rows="8" style="width:100%;font-family:inherit;font-size:.88rem;line-height:1.5" oninput="_wiEdit.module[${i}].text=this.value" placeholder="Der Inhalt dieser Seite …">${esc(m.text)}</textarea></div>
    </div>`).join('');
}
function _wiModuleNeu() { const el = document.getElementById('wi-module'); if (el) el.innerHTML = _wiModuleHtml(); }
function wiModulAdd() { (_wiEdit.module = _wiEdit.module || []).push({ id: 'm' + Date.now().toString(36), titel: '', text: '' }); _wiModuleNeu(); }
function wiModulRemove(i) { _wiEdit.module.splice(i, 1); _wiModuleNeu(); }
function wiModulVerschieben(i, richtung) {
  const j = i + richtung, arr = _wiEdit.module;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  _wiModuleNeu();
}

function _wiFragenHtml() {
  const fragen = _wiEdit.fragen || [];
  if (!fragen.length) return '<div class="field-hint" style="margin-bottom:10px">Noch keine Fragen. Gute Fragen prüfen eine Entscheidung („Was tun Sie, wenn …?"), nicht eine Definition.</div>';
  return fragen.map((q, i) => `
    <div class="qe-item">
      <div class="qe-head"><span class="t">Frage ${i + 1}</span><button class="btn btn-ghost btn-sm" onclick="wiFrageRemove(${i})">Entfernen</button></div>
      <div class="form-group full" style="margin-bottom:10px">
        <input type="text" value="${esc(q.frage)}" oninput="_wiEdit.fragen[${i}].frage=this.value" placeholder="Fragetext"></div>
      <div class="field-hint" style="margin-bottom:6px">Richtige Antwort markieren:</div>
      ${q.optionen.map((opt, oi) => `
        <div class="qe-opt-row">
          <input type="radio" name="wi-q-${i}" ${q.richtig === oi ? 'checked' : ''} onchange="_wiEdit.fragen[${i}].richtig=${oi}">
          <input type="text" value="${esc(opt)}" oninput="_wiEdit.fragen[${i}].optionen[${oi}]=this.value" placeholder="Antwort ${oi + 1}">
          ${q.optionen.length > 2 ? `<button class="btn btn-ghost btn-sm" onclick="wiOptionRemove(${i},${oi})">✕</button>` : ''}
        </div>`).join('')}
      <button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="wiOptionAdd(${i})">+ Antwort</button>
    </div>`).join('');
}

function wiEditSet(feld, wert) { if (_wiEdit) _wiEdit[feld] = wert; }
function wiEditNeu() { if (_wiEdit) reopenModalKeepScroll(_wiBeitragDialogHtml(), true); }
function wiEditGeltung(werk, an) {
  if (!_wiEdit) return;
  let g = (_wiEdit.geltung || []).filter(x => x !== 'ALLE');
  if (werk === 'ALLE') g = an ? ['ALLE'] : g;
  else g = an ? g.concat([werk]) : g.filter(x => x !== werk);
  _wiEdit.geltung = g.length ? [...new Set(g)] : ['ALLE'];
  wiEditNeu();
}
function _wiFragenNeu() { const el = document.getElementById('wi-fragen'); if (el) el.innerHTML = _wiFragenHtml(); }
function wiFrageAdd() { (_wiEdit.fragen = _wiEdit.fragen || []).push({ frage: '', optionen: ['', '', ''], richtig: 0 }); _wiFragenNeu(); }
function wiFrageRemove(i) { _wiEdit.fragen.splice(i, 1); _wiFragenNeu(); }
function wiOptionAdd(i) { _wiEdit.fragen[i].optionen.push(''); _wiFragenNeu(); }
function wiOptionRemove(i, oi) {
  _wiEdit.fragen[i].optionen.splice(oi, 1);
  if (_wiEdit.fragen[i].richtig >= _wiEdit.fragen[i].optionen.length) _wiEdit.fragen[i].richtig = 0;
  _wiFragenNeu();
}

async function wiBeitragSpeichern() {
  if (!_wiEdit || !wiDarfPflegen()) return;
  const b = _wiEdit;
  const fehler = wiBeitragFehler(b);
  const herkunft = (b.art === 'video' && typeof videoHerkunft === 'function') ? videoHerkunft(b.url) : { extern: false };
  if (herkunft.extern && !String(b.quelle || '').trim()) fehler.push('Fremdes Material braucht eine Quellenangabe.');
  if (fehler.length) { toast(fehler[0], 'error'); wiEditNeu(); return; }
  const now = _wiJetzt();
  const neu = wiNormalisieren({ beitraege: [Object.assign({}, b, {
    geaendertAm: b._neu ? '' : now, geaendertVon: b._neu ? '' : _wiWer(),
    erstelltAm: b.erstelltAm || now, erstelltVon: b.erstelltVon || _wiWer(),
  })] }).beitraege[0];
  if (b.art === 'test' || b.art === 'kurs') {
    // Geänderte Fragen sind ein neuer Stand: Wer den alten bestanden hat, hat
    // nicht diesen bestanden. Ein neuer Stand heißt neue Nachweise. Geänderte
    // Modultexte (ein Tippfehler, ein neuer Absatz) lassen Abschlüsse gelten.
    const alt = wiBeitrag(_wi.daten, neu.id);
    if (alt && JSON.stringify(alt.fragen) !== JSON.stringify(neu.fragen)) neu.stand = String((Number(alt.stand) || 1) + 1);
  }
  const i = _wi.daten.beitraege.findIndex(x => x.id === neu.id);
  if (i >= 0) _wi.daten.beitraege[i] = neu; else _wi.daten.beitraege.push(neu);
  if (await wiSpeichern(b._neu ? 'Beitrag angelegt ✓' : 'Beitrag gespeichert ✓')) { closeModal(); _wiEdit = null; renderWissen(); }
}

async function wiBeitragLoeschen(id) {
  const b = wiBeitrag(_wi.daten, id);
  if (!b || !wiDarfPflegen()) return;
  if (!await uiConfirm(`„${b.titel}" löschen? Die Nachweise der Personen bleiben in der Bestätigungen-Liste, der Beitrag ist danach nicht mehr zu sehen.`,
    { title: 'Beitrag löschen', okLabel: 'Löschen', danger: true })) return;
  _wi.daten.beitraege = _wi.daten.beitraege.filter(x => x.id !== id);
  if (_wiOffen === id) _wiOffen = '';
  if (await wiSpeichern('Beitrag gelöscht.')) { closeModal(); _wiEdit = null; renderWissen(); }
}

/** Innerhalb seines Themas nach oben oder unten – die Reihenfolge ist die der Datei. */
async function wiBeitragVerschieben(id, richtung) {
  const arr = _wi.daten.beitraege;
  const i = arr.findIndex(b => b.id === id);
  if (i < 0) return;
  const gleich = (x) => x.thema === arr[i].thema;
  let j = i + (richtung < 0 ? -1 : 1);
  while (j >= 0 && j < arr.length && !gleich(arr[j])) j += (richtung < 0 ? -1 : 1);
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  if (await wiSpeichern()) renderWissen();
}

async function wiStartbestand() {
  if (!wiDarfPflegen()) return;
  const n = wiStartbestandErgaenzen(_wi.daten, _wiWer(), _wiJetzt());
  if (!n) { toast('Der Startbestand ist schon vollständig da.', 'info'); return; }
  if (await wiSpeichern(`${n} Beiträge in ${WI_STARTBESTAND.themen.length} Themen angelegt ✓ – ein Vorschlag zum Anpassen.`)) renderWissen();
}

/* ── Auswertung (Pflege): wer hat was angesehen, welche Tests bestanden ── */

async function wiAuswertungOeffnen() {
  if (!wiDarfPflegen()) return;
  openModal(`<div class="modal-header"><h3>📊 Auswertung</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="doc-loading">Nachweise werden gelesen …</div></div>`, true);
  try {
    if (!_wiAlleAcks) _wiAlleAcks = (await spGetAcknowledgements()).filter(wiIstWissenAck);
  } catch (e) { const body = document.querySelector('.modal-body'); if (body) body.innerHTML = `<div class="col-warning" style="display:block">${esc(e.message)}</div>`; return; }
  const z = wiKennzahlen(_wi.daten, _wiAlleAcks);
  const zeilen = wiAuswertung(_wi.daten, _wiAlleAcks);
  const body = document.querySelector('.modal-body');
  if (!body) return;
  // Pflichtschulungen: die Quote braucht die Personen des Hauses.
  let pflichtHtml = '';
  if (z.pflichtKurse) {
    let members = null;
    try { members = (typeof AdminState !== 'undefined' && AdminState.members) || ((typeof spGetMembers === 'function') ? await spGetMembers() : null); } catch (e) { members = null; }
    const q = wiPflichtQuote(_wi.daten, _wiAlleAcks, members || []);
    pflichtHtml = `<div class="wi-kurs-block" style="margin:0 0 12px"><h3 style="margin-top:0">📋 Pflichtschulungen</h3>${q.map(x => `
      <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--c-border)">
        <span style="flex:1">${esc(x.kurs.titel)}</span>
        <b>${x.soll ? `${x.ist} von ${x.soll} (${x.quote} %)` : `${x.gueltig} gültige Abschlüsse`}</b>
        ${x.kurs.wiederholung ? `<span class="field-hint">Wiederholung alle ${x.kurs.wiederholung} Monate</span>` : ''}
      </div>`).join('')}${members ? '' : '<div class="field-hint">Ohne Personenliste keine Quote – nur die Zahl der gültigen Abschlüsse.</div>'}</div>`;
  }
  body.innerHTML = pflichtHtml + `
    <div class="field-hint" style="margin-bottom:10px">Gezählt werden Personen, nicht Klicks: „angesehen" ist der Knopf unter dem Beitrag, „bestanden" der Test, bei Schulungen zählt der gültige Abschluss.
      ${z.personen === 1 ? 'Eine Person hat' : `${z.personen} Personen haben`} bisher etwas festgehalten, ${z.zuletzt} Nachweis${z.zuletzt === 1 ? '' : 'e'} in den letzten ${WI_TAGE} Tagen.
      Nachweise stehen in der Bestätigungen-Liste („wissen:…"), auch für gelöschte Beiträge.</div>
    <table class="tbl" style="width:100%"><thead><tr><th>Beitrag</th><th>Art</th><th class="num">angesehen / begonnen</th><th class="num">Tests</th><th class="num">bestanden</th><th class="num">Ø</th></tr></thead>
    <tbody>${zeilen.map(r => `<tr>
      <td>${esc(r.beitrag.titel)}${r.beitrag.aktiv === false ? ' <span class="field-hint">(inaktiv)</span>' : ''}${
        r.beitrag.art === 'kurs' ? `<div class="field-hint">${r.gueltig} gültig abgeschlossen${r.abgelaufen ? `, ${r.abgelaufen} abgelaufen` : ''}</div>` : ''}</td>
      <td>${wiArt(r.beitrag.art).symbol} ${esc(wiArt(r.beitrag.art).label)}</td>
      <td class="num">${r.gesehen}</td>
      <td class="num">${r.beitrag.art === 'test' ? r.teilnahmen : '–'}</td>
      <td class="num">${r.beitrag.art === 'test' ? r.bestanden : '–'}</td>
      <td class="num">${r.beitrag.art === 'test' && r.teilnahmen ? r.schnitt + ' %' : '–'}</td></tr>`).join('')}</tbody></table>
    <div style="margin-top:10px"><button class="btn btn-outline btn-sm" onclick="wiAuswertungCsv()">⬇ CSV</button></div>`;
}

function wiAuswertungCsv() {
  const zeilen = wiAuswertung(_wi.daten, _wiAlleAcks || []);
  const csv = ['Beitrag;Art;Thema;angesehen;Tests;bestanden;Durchschnitt']
    .concat(zeilen.map(r => [r.beitrag.titel, wiArt(r.beitrag.art).label, (_wiThemaVon(r.beitrag) || {}).titel || '', r.gesehen, r.teilnahmen, r.bestanden, r.schnitt]
      .map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';'))).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wissen-auswertung.csv';
  document.body.appendChild(a); a.click(); a.remove();
}
