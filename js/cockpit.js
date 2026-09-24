'use strict';

/**
 * Reiter „Cockpit" – Admin-Startseite
 * ===================================
 * Eine Übersichtsseite mit allen ISMS-Kennzahlen auf einen Blick, jede Kachel
 * klickbar in den passenden Reiter. Schnelle Kacheln rendern sofort aus dem
 * State; teure Kennzahlen (Compliance-Quote, SoA, Risiken, Vorschläge) laden
 * asynchron nach und aktualisieren nur ihre Kachel. Rein deterministisch.
 */

let _cockpitSeq = 0;   // laufende Nummer gegen veraltete Async-Updates

function initCockpit() {
  const mount = document.getElementById('cockpit-mount');
  if (!mount) return;
  const seq = ++_cockpitSeq;

  const tile = (id, icon, title, view, extra) => `
    <div class="item-card" style="cursor:pointer;min-width:0" onclick="${extra || `switchView(${jsArg(view)})`}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:1.15rem">${icon}</span>
        <b style="font-size:.85rem">${title}</b>
        <span style="margin-left:auto;color:var(--c-faint)">→</span>
      </div>
      <div id="ck-${id}"><div class="doc-loading" style="padding:8px 0">…</div></div>
    </div>`;

  mount.innerHTML = `
    <div class="view-desc" style="margin:0 0 14px">
      Alle ISMS-Kennzahlen auf einen Blick – jede Kachel führt in den passenden Reiter.
      <span style="color:var(--c-faint)">Stand: ${new Date().toLocaleString('de-DE')}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
      ${tile('policies',  '📄', 'Richtlinien',            'verwaltung')}
      ${tile('workflow',  '✅', 'Prüfung & Freigabe',      'freigaben')}
      ${tile('faellig',   '📅', 'Fälligkeiten / Reviews',  'faelligkeit')}
      ${tile('abdeckung', '🗺️', 'IMS-Abdeckung',           'abdeckung', `abdeckungSetMode('heatmap');switchView('abdeckung')`)}
      ${tile('soa',       '📋', 'SoA – Anwendbarkeit',     'abdeckung', `cockpitOpenSoa()`)}
      ${tile('risiken',   '🛡️', 'Risiko-Register',         'risiken')}
      ${tile('assets',    '🗂', 'Assetregister',            'assets')}
      ${tile('ausnahmen', '⚖️', 'Ausnahmen von Richtlinien', 'ausnahmen')}
      ${tile('wirksamkeit','📈', 'Wirksamkeit & Verbesserung', 'wirksamkeit')}
      ${tile('notfall',   '🚨', 'Notfall & Krisenstab',     'notfall')}
      ${tile('vorfaelle', '🎫', 'Vorfälle & Ereignisse',    'vorfaelle')}
      ${tile('wissen',    '🎓', 'Wissen & Awareness',       'wissen')}
      ${tile('compliance','📊', 'Audit Report',            'compliance')}
      ${tile('vorschlaege','✏️','Vorschläge',              'vorschlaege')}
    </div>`;

  _ckRenderPolicies();
  _ckRenderWorkflow();
  _ckRenderFaellig();
  _ckRenderAbdeckung();
  _ckLoadSoa(seq);
  _ckLoadRisiken(seq);
  _ckLoadAssets(seq);
  _ckLoadAusnahmen(seq);
  _ckLoadWirksamkeit(seq);
  _ckLoadNotfall(seq);
  _ckLoadVorfaelle(seq);
  _ckLoadWissen(seq);
  _ckLoadCompliance(seq);
  _ckLoadVorschlaege(seq);
}

function cockpitOpenSoa() {
  if (typeof abdeckungSetMode === 'function') _abdeckungMode = 'soa';
  switchView('abdeckung');
}

/* ── Kachel-Bausteine ── */

function _ckSet(id, html) {
  const el = document.getElementById('ck-' + id);
  if (el) el.innerHTML = html;
}
function _ckBig(n, label, col) {
  return `<div style="display:inline-block;margin-right:16px">
    <div style="font-size:1.5rem;font-weight:800;color:${col || 'var(--c-text)'}">${n}</div>
    <div style="font-size:.72rem;color:var(--c-muted)">${label}</div></div>`;
}
function _ckErr(id, msg) {
  _ckSet(id, `<div style="font-size:.78rem;color:var(--c-muted)">${esc(msg)}</div>`);
}

/* ── Sofort-Kacheln (aus dem State) ── */

function _ckRenderPolicies() {
  const pols = State.policies || [];
  const by = s => pols.filter(p => p.status === s).length;
  const pruef = pols.filter(p => p.status === 'Konformitätsprüfung' || p.status === 'InReview').length;
  _ckSet('policies',
    _ckBig(pols.filter(p => p.status !== 'Archiviert').length, 'aktiv', '#17509e') +
    _ckBig(by('Veröffentlicht'), 'veröffentlicht', '#15803d') +
    _ckBig(by('Entwurf'), 'Entwürfe', '#6b7280') +
    _ckBig(pruef + by('Mitbestimmung') + by('Freigabe'), 'im Workflow', (pruef + by('Mitbestimmung') + by('Freigabe')) ? '#b45309' : '#15803d'));
}

function _ckRenderWorkflow() {
  const pols = State.policies || [];
  const pruef = pols.filter(p => p.status === 'Konformitätsprüfung' || p.status === 'InReview');
  const frei = pols.filter(p => p.status === 'Freigabe' || p.status === 'Mitbestimmung');
  const oldest = [...pruef, ...frei]
    .map(p => p.pruefungSeit ? Math.floor((Date.now() - Date.parse(p.pruefungSeit)) / 86400000) : 0)
    .reduce((m, d) => Math.max(m, d), 0);
  _ckSet('workflow',
    _ckBig(pruef.length, 'in Prüfung', pruef.length ? '#b45309' : '#15803d') +
    _ckBig(frei.length, 'warten auf Freigabe', frei.length ? '#b45309' : '#15803d') +
    (oldest ? _ckBig(oldest + ' T', 'ältester Vorgang', oldest >= 14 ? '#b91c1c' : '#6b7280') : ''));
}

function _ckRenderFaellig() {
  if (typeof _faelligBuckets !== 'function') { _ckErr('faellig', 'Modul nicht geladen.'); return; }
  const b = _faelligBuckets();
  _ckSet('faellig',
    _ckBig(b.overdue.length, 'überfällig', b.overdue.length ? '#b91c1c' : '#15803d') +
    _ckBig(b.soon.length, 'fällig ≤ 30 T', b.soon.length ? '#b45309' : '#15803d') +
    _ckBig(b.none.length, 'ohne Termin', b.none.length ? '#6b7280' : '#15803d'));
}

function _ckRenderAbdeckung() {
  if (typeof _abdeckungData !== 'function' || typeof NORMEN === 'undefined') { _ckErr('abdeckung', 'Modul nicht geladen.'); return; }
  const data = _abdeckungData();
  // Nach `art`, nicht nach dem Gruppennamen: sonst zählte „NIS2" auch die
  // deutsche Umsetzung mit und die Kachel zeigte plötzlich eine andere Quote.
  const ids = art => (typeof normIdsMitArt === 'function') ? normIdsMitArt(art) : [];
  const saved = list => list.filter(id => data[id] && data[id].saved.length).length;
  const annex = ids('annex'), nis2 = ids('nis2');
  const aPct = annex.length ? Math.round(saved(annex) / annex.length * 100) : 0;
  const nPct = nis2.length ? Math.round(saved(nis2) / nis2.length * 100) : 0;
  _ckSet('abdeckung',
    _ckBig(aPct + '%', `Annex-A (${saved(annex)}/${annex.length})`, aPct >= 90 ? '#15803d' : aPct >= 60 ? '#b45309' : '#b91c1c') +
    _ckBig(nPct + '%', `NIS2 (${saved(nis2)}/${nis2.length})`, nPct >= 90 ? '#15803d' : nPct >= 60 ? '#b45309' : '#b91c1c'));
}

/* ── Async-Kacheln ── */

async function _ckLoadSoa(seq) {
  try {
    if (!_soaData && typeof spLoadSoa === 'function') {
      const loaded = await spLoadSoa();
      if (seq !== _cockpitSeq) return;
      _soaData = (loaded && typeof loaded === 'object') ? loaded : { controls: {}, meta: {} };
    }
    if (typeof _soaKpis !== 'function') { _ckErr('soa', 'Modul nicht geladen.'); return; }
    const k = _soaKpis();
    _ckSet('soa',
      _ckBig(`${k.gepflegt}/${k.total}`, 'entschieden', k.gepflegt === k.total ? '#15803d' : '#b45309') +
      _ckBig(k.ausgeschlossen, 'ausgeschlossen', '#6b7280') +
      _ckBig(`${k.umgesetzt}/${k.anwendbar}`, 'umgesetzt', (k.anwendbar && k.umgesetzt === k.anwendbar) ? '#15803d' : '#b45309') +
      (k.begrFehlt ? _ckBig(k.begrFehlt, 'Begründung fehlt', '#b91c1c') : ''));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('soa', 'SoA nicht ladbar: ' + e.message); }
}

async function _ckLoadRisiken(seq) {
  try {
    if (!_risks && typeof spGetRisks === 'function') {
      const r = await spGetRisks();
      if (seq !== _cockpitSeq) return;
      _risks = r;
    }
    const all = _risks || [];
    const open = all.filter(r => r.status !== 'geschlossen');
    const hoch = open.filter(r => riskStufe(riskScore(_riskEff(r).e, _riskEff(r).a)) === 'hoch').length;
    const over = all.reduce((s, r) => s + _riskOverdueMassnahmen(r).length, 0);
    _ckSet('risiken',
      _ckBig(open.length, 'offen', open.length ? '#17509e' : '#15803d') +
      _ckBig(hoch, 'hoch', hoch ? '#b91c1c' : '#15803d') +
      _ckBig(over, 'Maßnahmen überfällig', over ? '#b91c1c' : '#15803d'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('risiken', 'Risiken nicht ladbar (Liste fehlt noch?).'); }
}

/**
 * Ausnahmen: aktiv, abgelaufen, wartend.
 *
 * Gelesen wird still – die Kachel soll keine SharePoint-Liste anlegen. Wer den
 * Reiter öffnet, legt sie an; das Cockpit nur anzuzeigen ist kein Grund dafür.
 */
/** Das Inventar: Assets, ohne Verantwortlichen, „sehr hoch" ohne Wiederherstellzeit – still gelesen. */
async function _ckLoadAssets(seq) {
  try {
    if (typeof amKennzahlen !== 'function' || typeof spGetAssetRegisterLeise !== 'function') { _ckErr('assets', 'Modul nicht geladen.'); return; }
    const liste = await spGetAssetRegisterLeise();
    if (seq !== _cockpitSeq) return;
    if (!Array.isArray(liste)) { _ckErr('assets', 'Noch kein Register – Reiter öffnen zum Anlegen.'); return; }
    const z = amKennzahlen(liste, { werke: (typeof nfSichtbareWerke === 'function') ? nfSichtbareWerke() : null });
    _ckSet('assets',
      _ckBig(z.aktiv, 'Assets im Inventar', z.aktiv ? '#17509e' : '#b45309') +
      _ckBig(z.ohneVerantwortlichen, 'ohne Verantwortlichen', z.ohneVerantwortlichen ? '#b91c1c' : '#15803d') +
      _ckBig(z.sehrHochOhneRto, '„sehr hoch" ohne Wiederherstellzeit', z.sehrHochOhneRto ? '#b91c1c' : '#15803d'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('assets', 'Nicht ladbar.'); }
}

async function _ckLoadVorfaelle(seq) {
  try {
    if (typeof vfKennzahlen !== 'function' || typeof spGetTicketsLeise !== 'function') { _ckErr('vorfaelle', 'Modul nicht geladen.'); return; }
    const [tk, bw] = await Promise.all([spGetTicketsLeise(), (typeof spLoadVorfaelle === 'function') ? spLoadVorfaelle() : { daten: { bewertungen: {} } }]);
    if (seq !== _cockpitSeq) return;
    if (!tk) { _ckErr('vorfaelle', 'Ticketsystem nicht erreichbar.'); return; }
    const cfg = (typeof getAccessConfig === 'function') ? getAccessConfig() : {};
    const sicher = tk.tickets.filter(t => vfIstSicherheit(t.kategorie, cfg));
    const z = vfKennzahlen(sicher, bw.daten.bewertungen, { werke: (typeof nfSichtbareWerke === 'function') ? nfSichtbareWerke() : null });
    _ckSet('vorfaelle',
      _ckBig(z.offeneIncidents, 'Vorfälle / Ereignisse offen', z.offeneIncidents ? '#b45309' : '#15803d') +
      _ckBig(z.unbeurteilt, 'nicht beurteilt (A.5.25)', z.unbeurteilt ? '#b91c1c' : '#15803d') +
      _ckBig(z.fristenUeberfaellig, 'Meldefristen überfällig (NIS2)', z.fristenUeberfaellig ? '#b91c1c' : '#15803d'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('vorfaelle', 'Nicht ladbar.'); }
}

/* Wissen & Awareness: freiwillig, aber zählbar – wie viele Beiträge stehen
   bereit, wie viele Personen haben etwas festgehalten, wie viele Tests wurden
   bestanden. ISO 27001 7.3 fragt nach Bewusstsein; das hier ist der Beleg
   jenseits der Pflicht-Kenntnisnahmen. */
async function _ckLoadWissen(seq) {
  try {
    if (typeof wiKennzahlen !== 'function' || typeof spLoadWissen !== 'function') { _ckErr('wissen', 'Modul nicht geladen.'); return; }
    if (!AdminState.allAcks) AdminState.allAcks = await spGetAcknowledgements();
    const w = await spLoadWissen();
    if (seq !== _cockpitSeq) return;
    const z = wiKennzahlen(wiNormalisieren(w.daten), AdminState.allAcks || []);
    _ckSet('wissen',
      _ckBig(z.beitraege, `Beiträge in ${z.themen} Themen${z.kurse ? ` · ${z.kurse} Schulung${z.kurse > 1 ? 'en' : ''}` : ''}`, z.beitraege ? 'var(--c-text)' : '#b45309') +
      _ckBig(z.personen, 'Personen mit Nachweis', z.personen ? '#15803d' : 'var(--c-text)') +
      _ckBig(z.testBestanden, `Tests bestanden${z.testTeilnahmen ? ` (${z.quote} %)` : ''}`, z.testBestanden ? '#15803d' : 'var(--c-text)'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('wissen', 'Nicht ladbar.'); }
}

async function _ckLoadAusnahmen(seq) {
  try {
    if (!_excs && typeof spGetExceptionsLeise === 'function') {
      const a = await spGetExceptionsLeise();
      if (seq !== _cockpitSeq) return;
      if (!Array.isArray(a)) { _ckErr('ausnahmen', 'Noch keine Ausnahme erfasst – Reiter öffnen zum Anlegen.'); return; }
      _excs = a;
    }
    const alle = (typeof excSichtbare === 'function') ? excSichtbare() : (_excs || []);
    const aktiv = alle.filter(excIstAktiv).length;
    const ab = alle.filter(a => excEffektiverStatus(a) === 'abgelaufen').length;
    const offen = alle.filter(a => a.status === 'beantragt').length;
    _ckSet('ausnahmen',
      _ckBig(aktiv, 'aktiv gültig', aktiv ? '#b45309' : '#15803d') +
      _ckBig(ab, 'abgelaufen', ab ? '#b91c1c' : '#15803d') +
      _ckBig(offen, 'wartet auf Entscheidung', offen ? '#b45309' : '#15803d'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('ausnahmen', 'Ausnahmen nicht ladbar (Liste fehlt noch?).'); }
}

/** Audits, Bewertungen, Abweichungen – still gelesen, ohne Liste anzulegen. */
async function _ckLoadWirksamkeit(seq) {
  try {
    if (!_wirk && typeof spGetWirkLeise === 'function') {
      const a = await spGetWirkLeise();
      if (seq !== _cockpitSeq) return;
      if (!Array.isArray(a)) { _ckErr('wirksamkeit', 'Noch nichts erfasst – Reiter öffnen zum Anlegen.'); return; }
      _wirk = a;
    }
    const alle = (typeof wirkSichtbare === 'function') ? wirkSichtbare() : (_wirk || []);
    const offen = alle.filter(w => w.art === 'abweichung' && w.status !== 'abgeschlossen' && w.status !== 'verworfen').length;
    const ueber = alle.reduce((s, w) => s + wirkUeberfaellig(w).length, 0);
    const bew = alle.filter(w => w.art === 'bewertung').sort((a, b) => String(b.datum).localeCompare(String(a.datum)))[0];
    _ckSet('wirksamkeit',
      _ckBig(offen, 'Abweichungen offen', offen ? '#b45309' : '#15803d') +
      _ckBig(ueber, 'Maßnahmen überfällig', ueber ? '#b91c1c' : '#15803d') +
      _ckBig(bew ? fmtDate(bew.datum) : '–', 'letzte Bewertung', bew ? '#17509e' : '#b91c1c'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('wirksamkeit', 'Nicht ladbar (Liste fehlt noch?).'); }
}

/** Kritische Prozesse, Pläne, Übungen – aus der Landkarte, still gelesen. */
async function _ckLoadNotfall(seq) {
  try {
    if (typeof nfKennzahlen !== 'function' || typeof spLoadLandkarte !== 'function') { _ckErr('notfall', 'Modul nicht geladen.'); return; }
    const g = (typeof _lkDaten !== 'undefined' && _lkDaten) ? { daten: _lkDaten } : await spLoadLandkarte();
    if (seq !== _cockpitSeq) return;
    if (!g || !g.daten) { _ckErr('notfall', 'Noch keine Prozesslandkarte – Reiter „Prozesse" öffnen.'); return; }
    let uebungen = Array.isArray(_wirk) ? _wirk : null;
    if (!uebungen && typeof spGetWirkLeise === 'function') { try { uebungen = await spGetWirkLeise(); } catch (e) { uebungen = []; } }
    if (seq !== _cockpitSeq) return;
    const n = nfKennzahlen(g.daten, uebungen || [], nfSichtbareWerke(), nfPflichtWerke());
    _ckSet('notfall',
      _ckBig(n.kritisch, 'kritische Prozesse', n.kritisch ? '#17509e' : '#6b7280') +
      _ckBig(`${n.mitPlan}/${n.kritisch}`, 'mit Notfallplan', n.kritisch && n.mitPlan < n.kritisch ? '#b91c1c' : '#15803d') +
      _ckBig(`${n.stabOk}/${n.werke}`, 'Krisenstab vollständig', n.werke && n.stabOk < n.werke ? '#b91c1c' : '#15803d'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('notfall', 'Nicht ladbar.'); }
}

async function _ckLoadCompliance(seq) {
  try {
    if (!AdminState.members) AdminState.members = await spGetMembers();
    if (!AdminState.allAcks) AdminState.allAcks = await spGetAcknowledgements();
    if (seq !== _cockpitSeq) return;
    const pubs = (State.policies || []).filter(p => p.status === 'Veröffentlicht' && p.pflicht);
    let soll = 0, done = 0;
    for (const p of pubs) {
      const rows = _complianceRowsFor(p);
      soll += rows.length;
      done += rows.filter(r => r.st === 'abgeschlossen').length;
    }
    const q = soll ? Math.round(done / soll * 100) : 100;
    _ckSet('compliance',
      _ckBig(q + '%', 'Erfüllungsquote', q >= 90 ? '#15803d' : q >= 60 ? '#b45309' : '#b91c1c') +
      _ckBig(pubs.length, 'Pflicht-Richtlinien', '#17509e') +
      _ckBig(soll - done, 'offene Kenntnisnahmen', (soll - done) ? '#b45309' : '#15803d'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('compliance', 'Quote nicht ladbar: ' + e.message); }
}

async function _ckLoadVorschlaege(seq) {
  try {
    if (typeof spGetProposals !== 'function') { _ckErr('vorschlaege', 'Modul nicht geladen.'); return; }
    const props = await spGetProposals();
    if (seq !== _cockpitSeq) return;
    const offen = props.filter(p => p.status === 'Offen').length;
    const inArbeit = props.filter(p => p.status === 'In Bearbeitung').length;
    _ckSet('vorschlaege',
      _ckBig(offen, 'offen', offen ? '#b45309' : '#15803d') +
      _ckBig(inArbeit, 'in Bearbeitung', '#17509e') +
      _ckBig(props.length, 'gesamt', '#6b7280'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('vorschlaege', 'Vorschläge nicht ladbar.'); }
}
