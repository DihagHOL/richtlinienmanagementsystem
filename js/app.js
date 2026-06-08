/**
 * App-Controller + Mitarbeiter-Sicht
 * ==================================
 * Globaler State, Boot-Flow, View-Switching, gemeinsame UI-Helfer und die
 * Mitarbeiter-Views (Meine Richtlinien, Detail/Lesen, Kenntnisnahme).
 * Quiz-Logik in quiz.js, Admin-Logik in admin.js.
 */

const State = {
  user: null,        // { upn, name }
  myRoles: [],       // effektive Unternehmensrollen (AD-Abteilung + manuell)
  policies: [],      // alle Richtlinien (Admin sieht alle; Mitarbeiter-Filter clientseitig)
  acks: [],          // Bestätigungen des aktuellen Users
  loaded: false,
};

const PAGE_TITLES = {
  meine: 'Meine Richtlinien', detail: 'Richtlinie', quiz: 'Wissenstest', kurse: 'Kurse',
  verwaltung: 'Richtlinien verwalten', freigaben: 'Freigaben',
  compliance: 'Compliance', einstellungen: 'Einstellungen',
};

/* ═══════════════════════════════════════════════════
   Boot
═══════════════════════════════════════════════════ */

const APP_VERSION = 'v26';

/* Temporärer sichtbarer Diagnose-Streifen (für Fehlersuche Dokumentwähler). */
let _dbgOn = false;
function dbg(msg) {
  try {
    console.log('[RMS]', msg);
    if (!_dbgOn) return;
    let p = document.getElementById('rms-debug');
    if (!p) {
      p = document.createElement('div');
      p.id = 'rms-debug';
      p.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:32vh;overflow:auto;background:#0f172a;color:#7dd3fc;font:11px/1.45 monospace;padding:8px 10px;z-index:99999;white-space:pre-wrap;border-top:2px solid #38bdf8';
      const btn = document.createElement('button');
      btn.textContent = '✕ Diagnose schließen';
      btn.style.cssText = 'position:sticky;top:0;float:right;background:#1e293b;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font:11px monospace';
      btn.onclick = () => p.remove();
      p.appendChild(btn);
    }
    p.appendChild(document.createTextNode(new Date().toLocaleTimeString('de-DE') + '  ' + msg + '\n'));
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('%c[RMS] Build ' + APP_VERSION + ' geladen', 'color:#1a56db;font-weight:700');
  _dbgOn = /[?&]debug/.test(location.search);  // Diagnose-Streifen nur mit ?debug
  // Deep-Link aus Mail (?richtlinie=…) vor dem evtl. Login-Redirect sichern (überlebt in sessionStorage).
  if (/[?&]richtlinie=/.test(location.search)) {
    try { sessionStorage.setItem('rms_deeplink', location.search); } catch (e) {}
  }
  document.querySelectorAll('.nav-item[data-view]').forEach(n =>
    n.addEventListener('click', e => { e.preventDefault(); switchView(n.dataset.view); })
  );
  onAuthReady(bootApp);
  authInit();
});

async function bootApp(account) {
  State.user = { upn: account.username, name: account.name || account.username };
  try {
    await spInit();
    await loadRuntimeAccessConfig();
    initRoleNav();
    State.myRoles = await getCurrentUserRoles();
    await applyDeepLinkOrDefault();   // lädt Daten + rendert (Mail-Deeplink oder Standard)
  } catch (e) {
    console.error(e);
    toast('Fehler beim Laden: ' + e.message, 'error');
    renderMeineError(e.message);
  }
}

/** Startansicht: Mail-Deeplink (?richtlinie=ID&ansicht=…) berücksichtigen, sonst „Meine Richtlinien". */
async function applyDeepLinkOrDefault() {
  let search = '';
  try { search = sessionStorage.getItem('rms_deeplink') || location.search; } catch (e) { search = location.search; }
  try { sessionStorage.removeItem('rms_deeplink'); } catch (e) {}
  const params = new URLSearchParams(search);
  const deepId = params.get('richtlinie');
  if (!deepId) { await switchView('meine'); return; }

  const ansicht = (params.get('ansicht') || '').toLowerCase();
  const canReview = (typeof isCurrentUserPruefer === 'function' && isCurrentUserPruefer())
                 || (typeof isCurrentUserGeschaeftsleitung === 'function' && isCurrentUserGeschaeftsleitung());

  if (ansicht === 'freigaben' || (ansicht === '' && canReview)) {
    if (!canReview) { await switchView('meine'); toast('Diese Richtlinie liegt im Freigabe-Prozess – du bist dafür nicht berechtigt.'); return; }
    await switchView('freigaben');
    if (typeof focusPolicyCard === 'function') focusPolicyCard(deepId);
    const aktion = (params.get('aktion') || '').toLowerCase();
    if (aktion && typeof handleMailAction === 'function') handleMailAction(deepId, aktion);
  } else {
    await switchView('meine');
    if (State.policies.find(p => p.id === deepId)) openDetail(deepId);
    else toast('Die verlinkte Richtlinie ist für dich aktuell nicht sichtbar.');
  }
}

async function reloadData() {
  const [policies, acks] = await Promise.all([
    spGetPolicies(),
    spGetAcknowledgements(State.user.upn),
  ]);
  State.policies = policies;
  State.acks = acks;
  State.loaded = true;
  renderMeine();
}

async function reloadAcks() {
  State.acks = await spGetAcknowledgements(State.user.upn);
}

async function refreshAll() {
  const btn = document.getElementById('btn-reload');
  if (btn) btn.disabled = true;
  showSync(true);
  try {
    await reloadData();
    if (typeof renderAdminList === 'function') renderAdminList();
    if (typeof renderFreigaben === 'function') renderFreigaben();
    if (typeof initCompliance === 'function') initCompliance();
    toast('Aktualisiert', 'success');
  } catch (e) {
    toast('Fehler: ' + e.message, 'error');
  } finally {
    showSync(false);
    if (btn) btn.disabled = false;
  }
}

/** Dezenter „Aktualisiere…"-Hinweis oben mittig (beim Laden). */
function showSync(on, text) {
  let el = document.getElementById('sync-hint');
  if (on) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'sync-hint';
      el.className = 'sync-hint';
      document.body.appendChild(el);
    }
    el.innerHTML = '<span class="sync-spinner"></span>' + esc(text || 'Aktualisiere …');
    el.style.display = 'flex';
  } else if (el) {
    el.remove();
  }
}

/* ═══════════════════════════════════════════════════
   View-Switching
═══════════════════════════════════════════════════ */

async function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.view === view));
  document.getElementById('page-title').textContent = PAGE_TITLES[view] || '';
  document.getElementById('sidebar')?.classList.remove('open');
  window.scrollTo(0, 0);

  // Daten-Reiter: bei jedem Wechsel frisch aus SharePoint laden
  if (['meine', 'verwaltung', 'freigaben', 'compliance', 'kurse'].includes(view)) {
    showSync(true);
    try {
      await reloadData();                 // lädt Richtlinien + eigene Bestätigungen (+ renderMeine)
    } catch (e) {
      console.error(e);
      if (view === 'meine') renderMeineError(e.message);
      else toast('Aktualisierung fehlgeschlagen: ' + e.message, 'error');
      return;
    } finally {
      showSync(false);
    }
  }

  if (view === 'verwaltung'   && typeof renderAdminList === 'function')   renderAdminList();
  if (view === 'freigaben'    && typeof renderFreigaben === 'function')   renderFreigaben();
  if (view === 'compliance'   && typeof initCompliance === 'function')    initCompliance();
  if (view === 'einstellungen'&& typeof renderEinstellungen === 'function') renderEinstellungen();
  if (view === 'kurse'        && typeof initKurse === 'function')         initKurse();
}

/* ═══════════════════════════════════════════════════
   Mitarbeiter: Meine Richtlinien
═══════════════════════════════════════════════════ */

/** Für Mitarbeiter relevante Richtlinien: veröffentlicht UND zur eigenen Rolle passend. */
function publishedPolicies() {
  return State.policies.filter(p =>
    p.status === 'Veröffentlicht' && policyMatchesRoles(p.zielgruppen, State.myRoles));
}

/** Lesbare Zielgruppe einer Richtlinie. */
function zielgruppenLabel(p) {
  if (!p.zielgruppen || !p.zielgruppen.length || p.zielgruppen.includes('ALLE')) return 'Alle Mitarbeiter';
  return p.zielgruppen.join(', ');
}

/** Ist eine abgeschlossene Bestätigung wegen Wiederholungspflicht abgelaufen? */
function isExpired(p, a) {
  if (!a || !p.wiederholungMonate || p.wiederholungMonate <= 0) return false;
  const base = a.abgeschlossenAm || a.gelesenAm;
  if (!base) return false;
  const d = new Date(base);
  if (isNaN(d)) return false;
  d.setMonth(d.getMonth() + p.wiederholungMonate);
  return d.getTime() < Date.now();
}

/** Abschluss-Status einer Richtlinie für den aktuellen User. */
function completionStatus(p) {
  const a = State.acks.find(x => x.richtlinieId === p.id && x.version === p.version);
  if (!a || !a.gelesenAm) return 'open';
  if (isExpired(p, a)) return 'open';            // Wiederholung fällig → erneut bestätigen
  if (p.quizErforderlich && !a.quizBestanden) return 'read';
  return 'done';
}

function renderMeine() {
  const list = document.getElementById('list-meine');
  if (!list) return;
  const pubs = publishedPolicies();

  // Stats
  const done = pubs.filter(p => completionStatus(p) === 'done').length;
  const open = pubs.length - done;
  const quote = pubs.length ? Math.round(done / pubs.length * 100) : 100;
  document.getElementById('meine-stats').innerHTML = `
    ${statCard('blue', '📋', pubs.length, 'Zugewiesen')}
    ${statCard('orange', '⏳', open, 'Offen')}
    ${statCard('green', '✓', done, 'Abgeschlossen')}
    ${statCard('purple', '📊', quote + '%', 'Erfüllungsquote')}`;

  // Filter + Suche
  const q = (document.getElementById('search-meine')?.value || '').toLowerCase().trim();
  const f = document.getElementById('filter-meine')?.value || 'all';
  let rows = pubs;
  if (f === 'open') rows = rows.filter(p => completionStatus(p) !== 'done');
  if (f === 'done') rows = rows.filter(p => completionStatus(p) === 'done');
  if (q) rows = rows.filter(p =>
    (p.title + ' ' + p.beschreibung + ' ' + p.kategorie).toLowerCase().includes(q));

  if (!rows.length) {
    list.innerHTML = emptyState(State.loaded
      ? 'Keine Richtlinien gefunden.'
      : 'Lade Richtlinien …');
    return;
  }

  list.innerHTML = rows.map(p => {
    const st = completionStatus(p);
    return `<div class="item-card" onclick="openDetail('${p.id}')">
      <div class="ic-top">
        <div class="ic-title">${esc(p.title)}</div>
        <div class="ic-topright">${memberBadge(st)}</div>
      </div>
      ${p.beschreibung ? `<div class="ic-desc">${esc(p.beschreibung)}</div>` : ''}
      <div class="ic-tags">
        ${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}
        <span class="ic-tag">Version ${esc(p.version)}</span>
        ${p.quizErforderlich ? '<span class="ic-tag">📝 Wissenstest</span>' : ''}
        ${(p.zielgruppen && p.zielgruppen.length && !p.zielgruppen.includes('ALLE')) ? `<span class="ic-tag">👥 ${esc(p.zielgruppen.join(', '))}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderMeineError(msg) {
  const list = document.getElementById('list-meine');
  if (list) list.innerHTML = `<div class="col-warning" style="display:block">
    Daten konnten nicht geladen werden: ${esc(msg)}<br>
    Bitte prüfen, ob die SharePoint-Listen „Richtlinien" und „Bestaetigungen" existieren
    und die Graph-Berechtigungen (mit Admin-Consent) erteilt wurden.</div>`;
}

function memberBadge(st) {
  if (st === 'done') return '<span class="status-badge sb-done">✓ Abgeschlossen</span>';
  if (st === 'read') return '<span class="status-badge sb-read">Test offen</span>';
  return '<span class="status-badge sb-open">Offen</span>';
}

/* ═══════════════════════════════════════════════════
   Mitarbeiter: Detail (Lesen + Kenntnisnahme)
═══════════════════════════════════════════════════ */

async function openDetail(policyId) {
  const p = State.policies.find(x => x.id === policyId);
  if (!p) return;
  switchView('detail');
  const v = document.getElementById('view-detail');
  const a = State.acks.find(x => x.richtlinieId === p.id && x.version === p.version);
  const st = completionStatus(p);

  v.innerHTML = `
    <button class="btn btn-ghost btn-sm back-btn" onclick="switchView('meine')">← Zurück</button>
    <div class="detail-header">
      <h2>${esc(p.title)}</h2>
      <div class="detail-meta">
        ${memberBadge(st)}
        ${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}
        <span class="ic-tag">Version ${esc(p.version)}</span>
      </div>
      ${p.beschreibung ? `<p class="ic-desc" style="margin-top:10px">${esc(p.beschreibung)}</p>` : ''}
    </div>
    <div class="detail-grid">
      <div class="doc-frame-wrap">
        <div class="doc-frame-head">
          <span class="t">📄 ${esc(p.dokumentName || 'Richtliniendokument')}</span>
          ${p.dokumentUrl ? `<a class="btn btn-outline btn-sm" href="${esc(p.dokumentUrl)}" target="_blank" rel="noopener" onclick="unlockReadGate()">In SharePoint öffnen ↗</a>` : ''}
        </div>
        <div id="doc-frame-host"><div class="doc-loading">Vorschau wird geladen …</div></div>
      </div>
      <div id="ack-host">${renderAckCard(p, a, st)}</div>
    </div>`;

  loadPreview(p);
  if (st === 'open') startReadGate(10);   // Lese-Gate: Kenntnisnahme erst nach Lesen/Öffnen
}

/* ── Lese-Gate (#6): Kenntnisnahme erst nach Mindest-Lesezeit oder Dokument-Öffnen ── */
let _readGateTimer = null;
function startReadGate(seconds) {
  clearInterval(_readGateTimer);
  let left = seconds;
  const tick = () => {
    const hint = document.getElementById('read-gate-hint');
    if (left <= 0 || !hint) { unlockReadGate(); return; }
    hint.textContent = `Bitte zuerst das Dokument lesen … (${left}s) – oder „In SharePoint öffnen" klicken`;
    left--;
  };
  tick();
  _readGateTimer = setInterval(tick, 1000);
}
function unlockReadGate() {
  clearInterval(_readGateTimer);
  _readGateTimer = null;
  const hint = document.getElementById('read-gate-hint');
  const cb = document.getElementById('ack-cb');
  if (hint) hint.remove();
  if (cb) cb.disabled = false;
}

async function loadPreview(p) {
  const host = document.getElementById('doc-frame-host');
  if (!host) return;
  if (!p.dokumentDriveId || !p.dokumentItemId) {
    host.innerHTML = `<div class="doc-loading">Kein Dokument hinterlegt.${
      p.dokumentUrl ? ` <a href="${esc(p.dokumentUrl)}" target="_blank" rel="noopener">Dokument öffnen ↗</a>` : ''}</div>`;
    return;
  }
  try {
    const url = await spGetPreviewUrl(p.dokumentDriveId, p.dokumentItemId);
    if (!url) throw new Error('keine Vorschau-URL');
    host.innerHTML = `<iframe class="doc-frame" src="${esc(url)}" allowfullscreen></iframe>`;
  } catch (e) {
    host.innerHTML = `<div class="doc-loading">Vorschau nicht verfügbar.${
      p.dokumentUrl ? ` <a href="${esc(p.dokumentUrl)}" target="_blank" rel="noopener">Dokument in SharePoint öffnen ↗</a>` : ''}</div>`;
  }
}

function renderAckCard(p, a, st) {
  const expired = isExpired(p, a);
  const read = !!(a && a.gelesenAm) && !expired;     // bei Ablauf zählt als „nicht gelesen"
  const quizDone = !!(a && a.quizBestanden) && !expired;

  // Schritt 1: Lesen + Kenntnisnahme
  let step1;
  if (read) {
    step1 = `<div class="ack-step">
      <div class="ack-dot ok">✓</div>
      <div class="ack-step-body">
        <div class="t">Kenntnisnahme bestätigt</div>
        <div class="s">am ${fmtDate(a.gelesenAm)}</div>
      </div></div>`;
  } else {
    step1 = `<div class="ack-step">
      <div class="ack-dot active">1</div>
      <div class="ack-step-body">
        <div class="t">Kenntnisnahme bestätigen</div>
        ${expired ? '<div class="s" style="color:#b45309">↻ Wiederholung fällig – bitte erneut lesen und bestätigen.</div>' : ''}
        <label class="ack-check" style="margin-top:8px">
          <input type="checkbox" id="ack-cb" disabled onchange="document.getElementById('ack-btn').disabled=!this.checked">
          <span>Ich habe die Richtlinie „${esc(p.title)}" (Version ${esc(p.version)}) gelesen und verstanden.</span>
        </label>
        <div id="read-gate-hint" class="field-hint" style="margin-top:5px;color:#b45309">Bitte zuerst das Dokument lesen …</div>
        <div class="actions">
          <button class="btn btn-primary" id="ack-btn" disabled onclick="confirmRead('${p.id}')">Kenntnisnahme bestätigen</button>
        </div>
      </div></div>`;
  }

  // Schritt 2: Quiz (nur falls erforderlich)
  let step2 = '';
  if (p.quizErforderlich) {
    if (quizDone) {
      step2 = `<div class="ack-step">
        <div class="ack-dot ok">✓</div>
        <div class="ack-step-body">
          <div class="t">Wissenstest bestanden</div>
          <div class="s">${a.quizScore}% &middot; ${a.quizVersuche} Versuch(e)</div>
        </div></div>`;
    } else {
      step2 = `<div class="ack-step">
        <div class="ack-dot ${read ? 'active' : ''}">2</div>
        <div class="ack-step-body">
          <div class="t">Wissenstest absolvieren</div>
          <div class="s">${p.quiz.length} Frage(n) &middot; bestanden ab ${p.quizBestehenProzent}%</div>
          <div class="actions">
            <button class="btn btn-primary" ${read ? '' : 'disabled'} onclick="startQuiz('${p.id}')">
              ${read ? 'Wissenstest starten' : 'Erst Kenntnisnahme bestätigen'}
            </button>
          </div>
        </div></div>`;
    }
  }

  const finished = st === 'done';
  const banner = finished
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:9px;padding:12px 14px;margin-top:14px;color:#15803d;font-size:.85rem">
        <div style="font-weight:600;margin-bottom:8px">✓ Diese Richtlinie ist vollständig abgeschlossen.</div>
        <button class="btn btn-outline btn-sm" onclick="sendCertificate('${p.id}')">📄 Nachweis per Mail an mich</button>
      </div>`
    : '';

  return `<div class="ack-card">
    <div class="card-header" style="padding:0 0 10px;border-bottom:1px solid var(--c-border-2);margin-bottom:6px">
      <h2>Status</h2>
    </div>
    ${step1}${step2}${banner}
  </div>`;
}

async function confirmRead(policyId) {
  const p = State.policies.find(x => x.id === policyId);
  if (!p) return;
  const btn = document.getElementById('ack-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichern …'; }
  const now = new Date().toISOString();
  const existing = State.acks.find(x => x.richtlinieId === p.id && x.version === p.version);
  const fresh = !existing || isExpired(p, existing);   // abgelaufen ⇒ Zyklus neu starten
  try {
    await spSaveAcknowledgement({
      id:              existing?.id,
      richtlinieId:    p.id,
      version:         p.version,
      benutzerUpn:     State.user.upn,
      benutzerName:    State.user.name,
      gelesenAm:       fresh ? now : (existing.gelesenAm || now),
      quizBestanden:   fresh ? false : (existing.quizBestanden || false),
      quizScore:       fresh ? 0 : (existing.quizScore || 0),
      quizVersuche:    fresh ? 0 : (existing.quizVersuche || 0),
      abgeschlossenAm: p.quizErforderlich ? (fresh ? '' : (existing.abgeschlossenAm || '')) : now,
    });
    await reloadAcks();
    toast(p.quizErforderlich
      ? 'Kenntnisnahme gespeichert – jetzt den Wissenstest absolvieren.'
      : 'Richtlinie abgeschlossen ✓', 'success');
    openDetail(policyId);
  } catch (e) {
    toast('Fehler beim Speichern: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Kenntnisnahme bestätigen'; }
  }
}

/* ── #8 Nachweis/Zertifikat per Mail an den Benutzer ── */
async function sendCertificate(policyId) {
  const p = State.policies.find(x => x.id === policyId);
  if (!p) return;
  const a = State.acks.find(x => x.richtlinieId === p.id && x.version === p.version);
  const when = (a && (a.abgeschlossenAm || a.gelesenAm)) || new Date().toISOString();
  try {
    const ok = await spSendMail(State.user.upn, `Teilnahmenachweis: ${p.title}`, certificateHtml(p, a, when));
    if (ok) toast('Nachweis per Mail an dich gesendet ✓', 'success');
  } catch (e) {
    toast('Mail-Versand fehlgeschlagen: ' + e.message, 'error');
  }
}

function certificateHtml(p, a, when) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e9ef;border-radius:12px;overflow:hidden">
    <div style="background:#1a56db;color:#fff;padding:24px 28px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">DIHAG Richtlinienmanagement</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px">Teilnahmenachweis</div>
    </div>
    <div style="padding:24px 28px;color:#1e2939;font-size:15px;line-height:1.6">
      <p>Hiermit wird bestätigt, dass</p>
      <p style="font-size:18px;font-weight:700;margin:8px 0">${esc(State.user.name)}</p>
      <p>die folgende Richtlinie zur Kenntnis genommen${p.quizErforderlich ? ' und den Wissenstest bestanden' : ''} hat:</p>
      <table style="width:100%;margin:14px 0;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280;width:150px">Richtlinie</td><td style="padding:6px 0;font-weight:600">${esc(p.title)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Version</td><td style="padding:6px 0">${esc(p.version)}</td></tr>
        ${p.quizErforderlich && a ? `<tr><td style="padding:6px 0;color:#6b7280">Testergebnis</td><td style="padding:6px 0">${a.quizScore}%</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#6b7280">Datum</td><td style="padding:6px 0">${fmtDate(when)}</td></tr>
      </table>
      <p style="color:#9ca3af;font-size:12px;margin-top:20px">Automatisch erzeugt vom DIHAG Richtlinienmanagementsystem.</p>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   Gemeinsame UI-Helfer (auch von quiz.js / admin.js genutzt)
═══════════════════════════════════════════════════ */

function statCard(color, icon, value, label) {
  return `<div class="stat-card">
    <div class="stat-icon ${color}">${esc(icon)}</div>
    <div><div class="stat-value">${esc(String(value))}</div><div class="stat-label">${esc(label)}</div></div>
  </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function emptyState(text, icon = '📭') {
  return `<div class="empty-state"><div class="icon">${icon}</div><p>${esc(text)}</p></div>`;
}

/** Workflow-Status-Badge (Entwurf/InReview/Veröffentlicht/Archiviert). */
function workflowBadge(status) {
  const map = {
    'Entwurf':              ['sb-draft', 'Entwurf'],
    'Konformitätsprüfung':  ['sb-review', 'Konformitätsprüfung'],
    'InReview':             ['sb-review', 'In Prüfung'],
    'Freigabe':             ['sb-read', 'Freigabe ausstehend'],
    'Veröffentlicht':       ['sb-published', 'Veröffentlicht'],
    'Archiviert':           ['sb-archived', 'Archiviert'],
  };
  const [cls, label] = map[status] || ['sb-draft', status || '—'];
  return `<span class="status-badge ${cls}">${esc(label)}</span>`;
}

/* ── Toast ── */
function toast(msg, type = '') {
  const c = document.getElementById('toast-c');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
}

/* ── Modal ── */
function openModal(html, wide = false) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal${wide ? ' wide' : ''}">${html}</div></div>`;
}
function closeModal() {
  document.getElementById('modal-mount').innerHTML = '';
}
