/**
 * Kurse (Beta)
 * ============
 * Bündelt mehrere Richtlinien zu einer Schulung. Mitarbeiter arbeiten die
 * enthaltenen Richtlinien über die normale Detail-Ansicht ab; der Kurs zeigt den
 * Gesamtfortschritt. Admin verwaltet Kurse (Titel, Beschreibung, Richtlinien-Auswahl).
 * Optionale SharePoint-Liste „Kurse" – fehlt sie, zeigt der Reiter einen Setup-Hinweis.
 */

const KurseState = { courses: [], editing: null };

async function initKurse() {
  const mount = document.getElementById('kurse-mount');
  if (!mount) return;
  mount.innerHTML = '<div class="doc-loading">Lade Kurse …</div>';
  try {
    KurseState.courses = await spGetCourses();   // ruft spInit()
    if (typeof spCoursesAvailable === 'function' && !spCoursesAvailable()) { renderKurseSetupHint(); return; }
    renderKurseList();
  } catch (e) {
    mount.innerHTML = `<div class="col-warning" style="display:block">Kurse konnten nicht geladen werden: ${esc(e.message)}</div>`;
  }
}

/** Enthaltene, veröffentlichte und für den aktuellen User sichtbare Richtlinien. */
function coursePolicies(c) {
  return (c.richtlinienIds || [])
    .map(id => State.policies.find(p => p.id === id))
    .filter(p => p && p.status === 'Veröffentlicht' && policyMatchesRoles(p.zielgruppen, State.myRoles));
}

function courseProgress(c) {
  const pols = coursePolicies(c);
  const done = pols.filter(p => completionStatus(p) === 'done').length;
  return { total: pols.length, done };
}

function renderKurseList() {
  const mount = document.getElementById('kurse-mount');
  if (!mount) return;
  const admin = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin();
  let list = KurseState.courses;
  if (!admin) list = list.filter(c => c.status === 'Veröffentlicht');

  const head = `<div class="view-toolbar">
      <span class="status-badge sb-review">Beta</span>
      <div class="toolbar-spacer"></div>
      ${admin ? `<button class="btn btn-primary btn-sm" onclick="openCourseEditor()">+ Neuer Kurs</button>` : ''}
    </div>`;

  if (!list.length) {
    mount.innerHTML = head + emptyState(admin ? 'Noch keine Kurse. Lege oben einen an.' : 'Aktuell sind keine Kurse veröffentlicht.', '🎓');
    return;
  }
  mount.innerHTML = head + '<div class="item-cards">' + list.map(c => courseCardHtml(c, admin)).join('') + '</div>';
}

function courseCardHtml(c, admin) {
  const pr = courseProgress(c);
  const pct = pr.total ? Math.round(pr.done / pr.total * 100) : 100;
  const onclick = admin ? `openCourseEditor('${c.id}')` : `openCourse('${c.id}')`;
  return `<div class="item-card" onclick="${onclick}">
    <div class="ic-top">
      <div class="ic-title">🎓 ${esc(c.title)}</div>
      <div class="ic-topright">${admin
        ? workflowBadge(c.status)
        : `<span class="status-badge ${pct === 100 ? 'sb-done' : 'sb-open'}">${pr.done}/${pr.total}</span>`}</div>
    </div>
    ${c.beschreibung ? `<div class="ic-desc">${esc(c.beschreibung)}</div>` : ''}
    <div class="progress ${pct === 100 ? 'done' : ''}" style="margin-top:8px"><span style="width:${pct}%"></span></div>
    <div class="ic-footer"><span class="grow">${(c.richtlinienIds || []).length} Richtlinie(n)</span><span>${admin ? esc(c.status) : pct + '%'}</span></div>
  </div>`;
}

/* ── Mitarbeiter: Kurs-Detail ── */
function openCourse(id) {
  const c = KurseState.courses.find(x => x.id === id);
  const mount = document.getElementById('kurse-mount');
  if (!c || !mount) return;
  const pols = coursePolicies(c);
  const pr = courseProgress(c);
  const pct = pr.total ? Math.round(pr.done / pr.total * 100) : 100;
  mount.innerHTML = `
    <button class="btn btn-ghost btn-sm back-btn" onclick="renderKurseList()">← Zurück zu Kursen</button>
    <div class="detail-header">
      <h2>🎓 ${esc(c.title)}</h2>
      ${c.beschreibung ? `<p class="ic-desc" style="margin-top:8px">${esc(c.beschreibung)}</p>` : ''}
      <div class="progress ${pct === 100 ? 'done' : ''}" style="margin-top:12px;max-width:420px"><span style="width:${pct}%"></span></div>
      <div class="field-hint" style="margin-top:6px">${pr.done} von ${pr.total} abgeschlossen (${pct}%)</div>
    </div>
    <div class="item-cards">${pols.length ? pols.map(p => {
      const st = completionStatus(p);
      return `<div class="item-card" onclick="openDetail('${p.id}')">
        <div class="ic-top"><div class="ic-title">${esc(p.title)}</div><div class="ic-topright">${memberBadge(st)}</div></div>
        <div class="ic-tags"><span class="ic-tag">Version ${esc(p.version)}</span>${p.quizErforderlich ? '<span class="ic-tag">📝 Wissenstest</span>' : ''}</div>
      </div>`;
    }).join('') : emptyState('Keine für dich sichtbaren Richtlinien in diesem Kurs.')}</div>`;
}

/* ── Admin: Kurs-Editor ── */
function openCourseEditor(id) {
  KurseState.editing = id
    ? JSON.parse(JSON.stringify(KurseState.courses.find(x => x.id === id)))
    : { id: null, title: '', beschreibung: '', richtlinienIds: [], status: 'Entwurf' };
  renderCourseEditor();
}

function renderCourseEditor() {
  const c = KurseState.editing;
  const pols = State.policies.slice().sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  openModal(`
    <div class="modal-header"><h3>${c.id ? 'Kurs bearbeiten' : 'Neuer Kurs'}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group full"><label>Titel <span class="req">*</span></label>
        <input type="text" value="${esc(c.title)}" oninput="KurseState.editing.title=this.value" placeholder="z. B. Onboarding IT-Sicherheit"></div>
      <div class="form-group full"><label>Beschreibung</label>
        <textarea oninput="KurseState.editing.beschreibung=this.value">${esc(c.beschreibung)}</textarea></div>
      <div class="form-group full"><label>Status</label>
        <select onchange="KurseState.editing.status=this.value">
          <option ${c.status === 'Entwurf' ? 'selected' : ''}>Entwurf</option>
          <option ${c.status === 'Veröffentlicht' ? 'selected' : ''}>Veröffentlicht</option>
        </select></div>
      <div class="form-group full"><label>Enthaltene Richtlinien</label>
        <div style="max-height:280px;overflow:auto;border:1px solid var(--c-border);border-radius:8px;padding:8px">
          ${pols.length ? pols.map(p => `<label class="ack-check" style="padding:5px 2px;font-weight:500">
            <input type="checkbox" ${c.richtlinienIds.includes(p.id) ? 'checked' : ''} onchange="courseToggle('${p.id}',this.checked)">
            <span>${esc(p.title)} <span style="color:var(--c-faint)">v${esc(p.version)} · ${esc(p.status)}</span></span></label>`).join('')
            : '<div class="field-hint">Noch keine Richtlinien vorhanden.</div>'}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      ${c.id ? `<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="deleteCourse('${c.id}')">Löschen</button>` : ''}
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveCourse()">Speichern</button>
    </div>`, true);
}

function courseToggle(pid, on) {
  const arr = KurseState.editing.richtlinienIds;
  const i = arr.indexOf(pid);
  if (on && i < 0) arr.push(pid);
  else if (!on && i >= 0) arr.splice(i, 1);
}

async function saveCourse() {
  const c = KurseState.editing;
  if (!c.title.trim()) { toast('Bitte einen Titel angeben.', 'error'); return; }
  try {
    await spSaveCourse(c);
    KurseState.courses = await spGetCourses();
    closeModal();
    renderKurseList();
    toast('Kurs gespeichert ✓', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

async function deleteCourse(id) {
  if (!confirm('Kurs wirklich löschen? (Die enthaltenen Richtlinien bleiben erhalten.)')) return;
  try {
    await spDeleteCourse(id);
    KurseState.courses = await spGetCourses();
    closeModal();
    renderKurseList();
    toast('Kurs gelöscht.', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

function renderKurseSetupHint() {
  const mount = document.getElementById('kurse-mount');
  if (mount) mount.innerHTML = `<div class="col-warning" style="display:block">
    <b>🎓 Kurse (Beta)</b> ist noch nicht eingerichtet. Lege dafür in SharePoint (Site <code>sites/IT</code>) eine Liste
    <b>„Kurse"</b> an mit den Spalten: <b>Beschreibung</b> (Mehrere Zeilen Text),
    <b>RichtlinienIds</b> (Mehrere Zeilen Text), <b>Status</b> (Auswahl: Entwurf / Veröffentlicht).
    Danach kannst du hier Kurse anlegen.</div>`;
}
