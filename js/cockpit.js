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
    <div class="item-card" style="cursor:pointer;min-width:0" onclick="${extra || `switchView('${view}')`}">
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
      ${tile('abdeckung', '🗺️', 'ISMS-Abdeckung',          'abdeckung', `abdeckungSetMode('heatmap');switchView('abdeckung')`)}
      ${tile('soa',       '📋', 'SoA – Anwendbarkeit',     'abdeckung', `cockpitOpenSoa()`)}
      ${tile('risiken',   '🛡️', 'Risiko-Register',         'risiken')}
      ${tile('compliance','📊', 'Audit Report',            'compliance')}
      ${tile('vorschlaege','✏️','Vorschläge',              'vorschlaege')}
    </div>`;

  _ckRenderPolicies();
  _ckRenderWorkflow();
  _ckRenderFaellig();
  _ckRenderAbdeckung();
  _ckLoadSoa(seq);
  _ckLoadRisiken(seq);
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
    _ckBig(pols.filter(p => p.status !== 'Archiviert').length, 'aktiv', '#1a56db') +
    _ckBig(by('Veröffentlicht'), 'veröffentlicht', '#15803d') +
    _ckBig(by('Entwurf'), 'Entwürfe', '#6b7280') +
    _ckBig(pruef + by('Freigabe'), 'im Workflow', (pruef + by('Freigabe')) ? '#b45309' : '#15803d'));
}

function _ckRenderWorkflow() {
  const pols = State.policies || [];
  const pruef = pols.filter(p => p.status === 'Konformitätsprüfung' || p.status === 'InReview');
  const frei = pols.filter(p => p.status === 'Freigabe');
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
  const ids = grp => NORMEN.filter(g => grp.test(g.group)).flatMap(g => g.items.map(i => i.id));
  const saved = list => list.filter(id => data[id] && data[id].saved.length).length;
  const annex = ids(/Annex/), nis2 = ids(/NIS2/);
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
      _ckBig(open.length, 'offen', open.length ? '#1a56db' : '#15803d') +
      _ckBig(hoch, 'hoch', hoch ? '#b91c1c' : '#15803d') +
      _ckBig(over, 'Maßnahmen überfällig', over ? '#b91c1c' : '#15803d'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('risiken', 'Risiken nicht ladbar (Liste fehlt noch?).'); }
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
      _ckBig(pubs.length, 'Pflicht-Richtlinien', '#1a56db') +
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
      _ckBig(inArbeit, 'in Bearbeitung', '#1a56db') +
      _ckBig(props.length, 'gesamt', '#6b7280'));
  } catch (e) { if (seq === _cockpitSeq) _ckErr('vorschlaege', 'Vorschläge nicht ladbar.'); }
}
