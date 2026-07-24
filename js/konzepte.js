/**
 * Regelwerk-Konzepte
 * ==================
 * Ein Konzept ist ein Vorschlag/Idee für ein mögliches neues Regelwerk.
 * Es hält fest, wie ein neues Regelwerk aussehen könnte bzw. ob es überhaupt
 * erstellt werden soll. Die Geschäftsleitung (GF) entscheidet über Priorität
 * und Umsetzung.
 *
 * Datenhaltung: gleiche SharePoint-Liste „Richtlinien", unterschieden per Feld
 * Typ='Konzept'. Alle konzept-spezifischen Daten liegen im Blob KonzeptJson.
 * Beim Laden werden Konzepte in State.konzepte getrennt (siehe app.js reloadData).
 *
 * Ablauf: Idee → GF-Prüfung → Angenommen (→ wird zu Regelwerk-Entwurf)
 *                            → Zurückgestellt / Abgelehnt (mit Begründung).
 */

let _kEditing = null;   // aktuell bearbeitetes Konzept

const KONZEPT_KATEGORIEN = ['ISO 27001', 'NIS2', 'ISMS allgemein', 'Datenschutz', 'IT-Sicherheit', 'Arbeitssicherheit', 'Allgemein'];
const KONZEPT_PRIOS = [['hoch', 'Hoch'], ['mittel', 'Mittel'], ['niedrig', 'Niedrig']];

function newKonzept() {
  return {
    id: null,
    typ: 'Konzept',
    title: '',
    beschreibung: '',
    kategorie: 'ISO 27001',
    status: 'Entwurf',            // SP-Status-Spalte neutral halten (nicht für Konzepte genutzt)
    dokumentUrl: '', dokumentName: '', dokumentDriveId: '', dokumentItemId: '',   // optionaler Anhang (Entwurf/Skizze als Datei)
    konzept: {
      motivation: '',
      skizze: '',
      prioritaet: 'mittel',
      antragstellerUpn: '',
      antragstellerName: '',
      eingereichtAm: '',
      entscheidung: { status: '', von: '', vonName: '', am: '', kommentar: '' },
      regelwerkId: '',           // gesetzt, wenn angenommen → in welches Regelwerk konvertiert
    },
  };
}

/* ── Status-Ableitung & Anzeige ── */

/** Abgeleiteter Konzept-Status: Idee · GF-Prüfung · Angenommen · Abgelehnt · Zurückgestellt. */
function konzeptStatus(k) {
  const e = (k.konzept && k.konzept.entscheidung) || {};
  if (e.status === 'angenommen') return 'Angenommen';
  if (e.status === 'abgelehnt') return 'Abgelehnt';
  if (e.status === 'zurueckgestellt') return 'Zurückgestellt';
  if (k.konzept && k.konzept.eingereichtAm) return 'GF-Prüfung';
  return 'Idee';
}

function konzeptStatusBadge(k) {
  const s = konzeptStatus(k);
  const map = {
    'Idee':           ['#eef2f7', '#475569'],
    'GF-Prüfung':     ['#fef3c7', '#b45309'],
    'Angenommen':     ['#dcfce7', '#15803d'],
    'Abgelehnt':      ['#fee2e2', '#b91c1c'],
    'Zurückgestellt': ['#e5e9ef', '#475569'],
  };
  const [bg, fg] = map[s] || map['Idee'];
  return `<span class="status-badge" style="background:${bg};color:${fg}">${s}</span>`;
}

function konzeptPrioLabel(p) {
  const m = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' };
  return m[p] || 'Mittel';
}

function _kClip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* ── Liste (Konzept-Modus im Regelwerk-Dashboard) ── */

function renderKonzeptCards(q) {
  let rows = (State.konzepte || []).slice();
  if (q) rows = rows.filter(k => (k.title + ' ' + (k.kategorie || '') + ' ' + ((k.konzept && k.konzept.motivation) || '')).toLowerCase().includes(q));
  const rank = (k) => { const s = konzeptStatus(k); return s === 'GF-Prüfung' ? 0 : s === 'Idee' ? 1 : s === 'Zurückgestellt' ? 2 : s === 'Angenommen' ? 3 : 4; };
  rows.sort((a, b) => rank(a) - rank(b) || (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));

  const intro = `<div class="field-hint" style="margin-bottom:12px">Konzepte sind <b>Vorschläge</b> für mögliche neue Regelwerke. Die Geschäftsleitung prüft Priorität und Umsetzung. Angenommene Konzepte werden zu einem <b>Regelwerk-Entwurf</b>.</div>`;
  if (!rows.length) return intro + emptyState('Noch keine Regelwerk-Konzepte. Lege oben mit „💡 Regelwerk-Konzept" eines an.', '💡');

  const isGF = typeof isCurrentUserGeschaeftsleitung === 'function' && isCurrentUserGeschaeftsleitung();
  const canWrite = typeof canWriteTab !== 'function' || canWriteTab('verwaltung');
  return intro + rows.map(k => _konzeptCard(k, isGF, canWrite)).join('');
}

function _konzeptCard(k, isGF, canWrite) {
  const ko = k.konzept || {};
  const st = konzeptStatus(k);
  const e = ko.entscheidung || {};
  const actions = [];
  if (canWrite && (st === 'Idee' || st === 'Zurückgestellt')) {
    actions.push(`<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();konzeptSubmitGF('${k.id}')">📤 Zur GF-Prüfung</button>`);
  }
  if (isGF && st === 'GF-Prüfung') {
    actions.push(`<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();konzeptDecide('${k.id}','angenommen')">✓ Annehmen → Regelwerk</button>`);
    actions.push(`<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();konzeptDecide('${k.id}','zurueckgestellt')">⏸ Zurückstellen</button>`);
    actions.push(`<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();konzeptDecide('${k.id}','abgelehnt')">✗ Ablehnen</button>`);
  }
  if (st === 'Angenommen' && ko.regelwerkId) {
    actions.push(`<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openPolicyFromKonzept('${esc(ko.regelwerkId)}')">→ Zum Regelwerk</button>`);
  }
  const actionsRow = actions.length ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap" onclick="event.stopPropagation()">${actions.join('')}</div>` : '';
  return `
    <div class="item-card" onclick="openKonzeptEditor('${k.id}')">
      <div class="ic-top">
        <div class="ic-title">💡 ${esc(k.title)}</div>
        <div class="ic-topright">${konzeptStatusBadge(k)}</div>
      </div>
      <div class="ic-tags">
        ${k.kategorie ? `<span class="ic-tag cat">${esc(k.kategorie)}</span>` : ''}
        <span class="ic-tag">Prio: ${esc(konzeptPrioLabel(ko.prioritaet))}</span>
        ${k.dokumentName ? `<span class="ic-tag" title="${esc(k.dokumentName)}">📎 Anhang</span>` : ''}
        ${ko.antragstellerName ? `<span class="ic-tag">👤 ${esc(ko.antragstellerName)}</span>` : ''}
        ${ko.eingereichtAm ? `<span class="ic-tag">📤 eingereicht ${fmtDate(ko.eingereichtAm)}</span>` : ''}
      </div>
      ${ko.motivation ? `<div class="ic-desc">${esc(_kClip(ko.motivation, 180))}</div>` : ''}
      ${(e.kommentar || e.status) ? `<div class="field-hint" style="margin-top:2px">${st}${e.kommentar ? `: „${esc(e.kommentar)}"` : ''}${e.vonName ? ` – ${esc(e.vonName)}` : ''}${e.am ? `, ${fmtDate(e.am)}` : ''}</div>` : ''}
      ${actionsRow}
    </div>`;
}

/* ── Editor ── */

function openKonzeptEditor(id) {
  if (typeof canWriteTab === 'function' && !canWriteTab('verwaltung')) {
    toast('Nur Lesezugriff – Konzepte können nicht angelegt/bearbeitet werden.', 'error'); return;
  }
  if (id) {
    const src = (State.konzepte || []).find(x => x.id === id);
    if (!src) { toast('Konzept nicht gefunden.', 'error'); return; }
    _kEditing = JSON.parse(JSON.stringify(src));
    if (!_kEditing.konzept) _kEditing.konzept = newKonzept().konzept;
    if (!_kEditing.konzept.entscheidung) _kEditing.konzept.entscheidung = { status: '', von: '', vonName: '', am: '', kommentar: '' };
  } else {
    _kEditing = newKonzept();
  }
  renderKonzeptEditor();
}

function renderKonzeptEditor() {
  const k = _kEditing;
  const ko = k.konzept;
  const st = konzeptStatus(k);
  const readOnly = typeof canWriteTab === 'function' && !canWriteTab('verwaltung');
  const body = `
    <div class="modal-header">
      <h3>${k.id ? 'Regelwerk-Konzept bearbeiten' : 'Neues Regelwerk-Konzept'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:12px">Ein Konzept ist ein <b>Vorschlag</b> für ein mögliches neues Regelwerk – die Idee, wie es aussehen könnte bzw. ob es überhaupt erstellt werden soll. Die <b>Geschäftsleitung</b> entscheidet über Priorität und Umsetzung. Wird es angenommen, entsteht daraus automatisch ein Regelwerk-Entwurf.</div>
      ${k.id ? `<div style="margin-bottom:12px">Status: ${konzeptStatusBadge(k)}${(ko.entscheidung && ko.entscheidung.kommentar) ? ` <span class="field-hint">– „${esc(ko.entscheidung.kommentar)}" (${esc(ko.entscheidung.vonName || ko.entscheidung.von)})</span>` : ''}</div>` : ''}
      <div class="form-grid">
        <div class="form-group full">
          <label>Arbeitstitel <span class="req">*</span></label>
          <input type="text" value="${esc(k.title)}" oninput="_kEditing.title=this.value" placeholder="z. B. Regelwerk zur Nutzung von KI">
        </div>
        <div class="form-group">
          <label>Kategorie</label>
          <select onchange="_kEditing.kategorie=this.value">
            ${KONZEPT_KATEGORIEN.map(c => `<option ${c === k.kategorie ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Priorität (Vorschlag)</label>
          <select onchange="_kEditing.konzept.prioritaet=this.value">
            ${KONZEPT_PRIOS.map(([v, l]) => `<option value="${v}" ${ko.prioritaet === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group full">
          <label>Warum? – Motivation / Problem <span class="req">*</span></label>
          <textarea oninput="_kEditing.konzept.motivation=this.value" placeholder="Welches Problem/Risiko soll das Regelwerk adressieren? Warum jetzt?">${esc(ko.motivation)}</textarea>
        </div>
        <div class="form-group full">
          <label>Wie könnte es aussehen? – Skizze / Inhalt (optional)</label>
          <textarea oninput="_kEditing.konzept.skizze=this.value" placeholder="Grobe Inhalte, Geltungsbereich, Kernaussagen – als Entwurfsgedanke.">${esc(ko.skizze)}</textarea>
        </div>
        <div class="form-group full">
          <label>Anhang (optional)</label>
          <div class="doc-chip ${k.dokumentName ? '' : 'doc-chip-empty'}">
            ${k.dokumentName ? '📎 ' + esc(k.dokumentName) : 'kein Anhang'}
          </div>
          <div class="doc-actions" style="margin-top:6px">
            <button class="btn btn-outline btn-sm" onclick="document.getElementById('k-upload-input').click()">⬆ ${k.dokumentName ? 'Ersetzen' : 'Datei anhängen'}</button>
            ${k.dokumentUrl ? `<button class="btn btn-outline btn-sm" onclick="konzeptOpenAttachmentOffice()" title="Im Desktop-Office öffnen">✏️ In Office</button>
              <button class="btn btn-outline btn-sm" onclick="konzeptOpenAttachmentWeb()" title="In SharePoint / Office für das Web öffnen">🌐 Im Browser</button>` : ''}
            ${k.dokumentName ? `<button class="btn btn-ghost btn-sm" onclick="konzeptRemoveAttachment()">✕ Entfernen</button>` : ''}
            <input type="file" id="k-upload-input" accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.odt,.png,.jpg,.jpeg" style="display:none" onchange="konzeptUploadAttachment(this.files[0]); this.value='';">
          </div>
          <span class="field-hint">Optionaler Entwurf/Skizze als Datei (z. B. Word/PDF) – zeigt, wie das Regelwerk aussehen könnte. Bei Annahme wird der Anhang als Startdokument des Regelwerks übernommen.</span>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      ${readOnly
        ? `<span class="field-hint" style="margin-right:auto">👁 Nur Lesezugriff.</span><button class="btn btn-outline" onclick="closeModal()">Schließen</button>`
        : `${k.id ? `<button class="btn btn-danger btn-sm" onclick="konzeptDelete('${k.id}')" style="margin-right:auto">Löschen</button>` : ''}
           <button class="btn btn-outline" onclick="saveKonzept(false)">Als Idee speichern</button>
           ${(st === 'Idee' || st === 'GF-Prüfung' || st === 'Zurückgestellt')
             ? `<button class="btn btn-primary" onclick="saveKonzept(true)">${st === 'GF-Prüfung' ? '↻ Erneut zur GF-Prüfung' : 'Zur GF-Prüfung einreichen →'}</button>`
             : ''}`}
    </div>`;
  openModal(body, true);
}

/* ── Anhang (optionaler Datei-Entwurf am Konzept) ── */

async function konzeptUploadAttachment(file) {
  if (!file || !_kEditing) return;
  toast('Anhang wird hochgeladen …');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await spUploadPolicyDoc(file.name, bytes, file.type);
    _kEditing.dokumentUrl = doc.url;
    _kEditing.dokumentName = doc.name;
    _kEditing.dokumentDriveId = doc.driveId;
    _kEditing.dokumentItemId = doc.itemId;
    renderKonzeptEditor();
    toast('Anhang hinzugefügt ✓ – nicht vergessen zu speichern.', 'success');
  } catch (e) {
    toast('Upload fehlgeschlagen: ' + e.message, 'error');
  }
}

function konzeptRemoveAttachment() {
  if (!_kEditing) return;
  _kEditing.dokumentUrl = ''; _kEditing.dokumentName = '';
  _kEditing.dokumentDriveId = ''; _kEditing.dokumentItemId = '';
  renderKonzeptEditor();
}

function konzeptOpenAttachmentWeb() {
  if (_kEditing && _kEditing.dokumentUrl) window.open(_kEditing.dokumentUrl, '_blank', 'noopener');
  else toast('Kein Anhang hinterlegt.', 'error');
}

async function konzeptOpenAttachmentOffice() {
  if (!_kEditing || !_kEditing.dokumentDriveId || !_kEditing.dokumentItemId) { toast('Kein Anhang hinterlegt.', 'error'); return; }
  const scheme = (typeof _policyOfficeScheme === 'function') ? _policyOfficeScheme(_kEditing.dokumentName) : null;
  if (!scheme) { konzeptOpenAttachmentWeb(); return; }   // z. B. PDF → im Browser
  toast('Datei-URL wird ermittelt …');
  let fileUrl = '';
  try { fileUrl = await spGetDirectFileUrl(_kEditing.dokumentDriveId, _kEditing.dokumentItemId); } catch (e) { fileUrl = ''; }
  if (fileUrl) { window.location.href = `${scheme}:ofe|u|${fileUrl}`; toast('Öffne in Office … Öffnet sich nichts? „🌐 Im Browser" nutzen.'); }
  else konzeptOpenAttachmentWeb();
}

async function saveKonzept(submit) {
  if (typeof canWriteTab === 'function' && !canWriteTab('verwaltung')) { toast('Nur Lesezugriff – Speichern nicht möglich.', 'error'); return; }
  const k = _kEditing;
  if (!k.title.trim()) { toast('Bitte einen Arbeitstitel angeben.', 'error'); return; }
  if (submit && !((k.konzept.motivation || '').trim())) { toast('Für die Einreichung bitte die Motivation ausfüllen.', 'error'); return; }
  k.typ = 'Konzept';
  k.status = 'Entwurf';
  if (!k.konzept.antragstellerUpn && State.user) {
    k.konzept.antragstellerUpn = State.user.upn;
    k.konzept.antragstellerName = State.user.name || State.user.upn;
  }
  if (submit) k.konzept.eingereichtAm = new Date().toISOString();
  try {
    const saved = await spSavePolicy(k);
    if (!k.id && saved && saved.id) k.id = saved.id;
    await reloadData();
    closeModal();
    _adminMode = 'konzepte';
    renderAdminList();
    if (submit) {
      toast('Konzept zur GF-Prüfung eingereicht ✓', 'success');
      notifyKonzeptGF(k);
    } else {
      toast('Konzept gespeichert ✓', 'success');
    }
  } catch (e) {
    toast('Fehler beim Speichern: ' + e.message, 'error');
  }
}

async function konzeptDelete(id) {
  if (typeof canWriteTab === 'function' && !canWriteTab('verwaltung')) { toast('Nur Lesezugriff.', 'error'); return; }
  const ok = await uiConfirm('Dieses Konzept wirklich löschen?', { title: 'Konzept löschen', danger: true, okLabel: 'Löschen' });
  if (!ok) return;
  try {
    await spDeletePolicy(id);
    await reloadData();
    _adminMode = 'konzepte';
    renderAdminList();
    toast('Konzept gelöscht.', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/* ── Einreichen & GF-Entscheidung (von den Karten) ── */

function _kClone(id) {
  const src = (State.konzepte || []).find(x => x.id === id);
  if (!src) { toast('Konzept nicht gefunden.', 'error'); return null; }
  const k = JSON.parse(JSON.stringify(src));
  k.typ = 'Konzept';
  if (!k.konzept) k.konzept = newKonzept().konzept;
  if (!k.konzept.entscheidung) k.konzept.entscheidung = { status: '', von: '', vonName: '', am: '', kommentar: '' };
  return k;
}

function _kEntsch(status, kommentar) {
  return {
    status,
    von: State.user ? State.user.upn : '',
    vonName: State.user ? (State.user.name || State.user.upn) : '',
    am: new Date().toISOString(),
    kommentar: kommentar || '',
  };
}

async function _kPersist(k, msg, type) {
  try {
    await spSavePolicy(k);
    await reloadData();
    _adminMode = 'konzepte';
    renderAdminList();
    toast(msg, type || 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

async function konzeptSubmitGF(id) {
  if (typeof canWriteTab === 'function' && !canWriteTab('verwaltung')) { toast('Nur Lesezugriff.', 'error'); return; }
  const k = _kClone(id); if (!k) return;
  k.konzept.eingereichtAm = new Date().toISOString();
  if (!k.konzept.antragstellerUpn && State.user) {
    k.konzept.antragstellerUpn = State.user.upn;
    k.konzept.antragstellerName = State.user.name || State.user.upn;
  }
  try {
    await spSavePolicy(k);
    await reloadData();
    _adminMode = 'konzepte';
    renderAdminList();
    toast('Konzept zur GF-Prüfung eingereicht ✓', 'success');
    notifyKonzeptGF(k);
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

async function konzeptDecide(id, decision) {
  if (typeof isCurrentUserGeschaeftsleitung === 'function' && !isCurrentUserGeschaeftsleitung()) {
    toast('Nur die Geschäftsleitung kann über Konzepte entscheiden.', 'error'); return;
  }
  const k = _kClone(id); if (!k) return;

  if (decision === 'abgelehnt') {
    const res = await uiPrompt('Warum wird das Konzept abgelehnt? (Pflicht)', { title: 'Konzept ablehnen', okLabel: 'Ablehnen', danger: true });
    if (res === null) return;
    const grund = res.trim();
    if (!grund) { toast('Ohne Begründung nicht möglich.', 'error'); return; }
    k.konzept.entscheidung = _kEntsch('abgelehnt', grund);
    await _kPersist(k, 'Konzept abgelehnt.', 'error');
    return;
  }
  if (decision === 'zurueckgestellt') {
    const res = await uiPrompt('Notiz zum Zurückstellen (optional):', { title: 'Konzept zurückstellen', okLabel: 'Zurückstellen' });
    if (res === null) return;
    k.konzept.entscheidung = _kEntsch('zurueckgestellt', res.trim());
    await _kPersist(k, 'Konzept zurückgestellt.');
    return;
  }

  // decision === 'angenommen'
  const ok = await uiConfirm('Konzept annehmen? Es wird daraus ein neues Regelwerk (Entwurf) erstellt, das du anschließend mit einem Dokument versiehst und in die Konformitätsprüfung schickst.',
    { title: 'Konzept annehmen', okLabel: 'Annehmen & Regelwerk anlegen' });
  if (!ok) return;
  try {
    // 1) Regelwerk-Entwurf aus dem Konzept anlegen
    const rw = newPolicy();
    rw.title = k.title;
    rw.kategorie = k.kategorie;
    rw.beschreibung = _konzeptToBeschreibung(k);
    rw.status = 'Entwurf';
    // Anhang des Konzepts als Startdokument des Regelwerks übernehmen (falls vorhanden)
    if (k.dokumentItemId || k.dokumentUrl) {
      rw.dokumentUrl = k.dokumentUrl || '';
      rw.dokumentName = k.dokumentName || '';
      rw.dokumentDriveId = k.dokumentDriveId || '';
      rw.dokumentItemId = k.dokumentItemId || '';
    }
    const savedRw = await spSavePolicy(rw);
    const rwId = (savedRw && savedRw.id) ? savedRw.id : '';
    // 2) Konzept als angenommen markieren + Verweis speichern
    k.konzept.entscheidung = _kEntsch('angenommen', '');
    k.konzept.regelwerkId = rwId;
    await spSavePolicy(k);
    await reloadData();
    toast('Konzept angenommen – Regelwerk-Entwurf angelegt ✓', 'success');
    if (rwId) openPolicyFromKonzept(rwId);
    else { _adminMode = 'konzepte'; renderAdminList(); }
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

function _konzeptToBeschreibung(k) {
  const ko = k.konzept || {};
  const parts = [];
  if (k.beschreibung) parts.push(String(k.beschreibung).trim());
  if (ko.motivation) parts.push('Motivation: ' + String(ko.motivation).trim());
  if (ko.skizze) parts.push('Skizze / Inhalt: ' + String(ko.skizze).trim());
  parts.push('(Aus dem Konzept „' + k.title + '" übernommen.)');
  return parts.filter(Boolean).join('\n\n');
}

/** Vom Konzept ins erzeugte Regelwerk springen (Regelwerk-Modus + Editor). */
function openPolicyFromKonzept(regelwerkId) {
  _adminMode = 'regelwerke';
  renderAdminList();
  if (typeof openPolicyEditor === 'function') openPolicyEditor(regelwerkId);
}

/* ── Mail an die Geschäftsleitung ── */

async function notifyKonzeptGF(k) {
  const gl = (typeof getGeschaeftsleitung === 'function') ? getGeschaeftsleitung() : [];
  if (!gl.length) { toast('Keine Geschäftsleitung hinterlegt – bitte in den Einstellungen ergänzen.', 'error'); return; }
  const hasDoc = !!(k.dokumentDriveId && k.dokumentItemId);
  let att = null;
  if (hasDoc && typeof spGetDocAttachment === 'function') {
    try { att = await spGetDocAttachment(k.dokumentDriveId, k.dokumentItemId, k.dokumentName); } catch (e) { att = null; }
  }
  try {
    await spSendMail(gl, `Neues Regelwerk-Konzept zur Prüfung: ${k.title}`, _konzeptMailHtml(k, !!att, hasDoc), att ? [att] : []);
    // hasDoc && !att = Datei vorhanden, aber zu groß / nicht ladbar → nur im Konzept hinterlegt
    toast('Geschäftsleitung benachrichtigt ✓' + (att ? ' (mit Anhang)' : (hasDoc ? ' (Anhang zu groß – im Konzept hinterlegt)' : '')), 'success');
  } catch (e) {
    console.warn('Konzept-GF-Mail:', e.message);
    toast('Mail an GL fehlgeschlagen (Mail.Send nötig): ' + e.message, 'error');
  }
}

function _konzeptMailHtml(k, hasAttachment, hasDoc) {
  const ko = k.konzept || {};
  const base = 'https://richtlinienmanagement.dihag-extern.com/';
  const br = (s) => esc(String(s || '')).replace(/\n/g, '<br>');
  const anhangZeile = hasAttachment
    ? `<p>📎 Ein Entwurf/Anhang ist dieser E-Mail beigefügt${k.dokumentName ? `: <b>${esc(k.dokumentName)}</b>` : ''}.</p>`
    : (hasDoc
      ? `<p>📎 Ein Entwurf/Anhang${k.dokumentName ? ` (<b>${esc(k.dokumentName)}</b>)` : ''} ist im Konzept hinterlegt (zu groß für den E-Mail-Anhang) – bitte über den Button ansehen.</p>`
      : '');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;font-size:15px;line-height:1.6;color:#1e2939">
    <p><b>Neues Regelwerk-Konzept zur Prüfung durch die Geschäftsleitung</b></p>
    <p>Titel: <b>${esc(k.title)}</b>${k.kategorie ? ' (' + esc(k.kategorie) + ')' : ''}<br>
       Priorität (Vorschlag): <b>${esc(konzeptPrioLabel(ko.prioritaet))}</b>${ko.antragstellerName ? '<br>Eingereicht von: ' + esc(ko.antragstellerName) : ''}</p>
    ${ko.motivation ? `<p><b>Warum?</b><br>${br(ko.motivation)}</p>` : ''}
    ${ko.skizze ? `<p><b>Wie könnte es aussehen?</b><br>${br(ko.skizze)}</p>` : ''}
    ${anhangZeile}
    <p>Bitte im Regelwerk-Management prüfen und entscheiden – <b>Annehmen</b> (es entsteht ein Regelwerk-Entwurf), <b>Zurückstellen</b> oder <b>Ablehnen</b>:</p>
    <p><a href="${esc(base)}" style="display:inline-block;background:#17509e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:7px;font-weight:600">Regelwerk-Dashboard öffnen → 💡 Konzepte</a></p>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Automatische Nachricht vom DIHAG Regelwerk-Management.</p>
  </div>`;
}
