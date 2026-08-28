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

/* Konzepte werden zu Regelwerken – sie brauchen dieselbe Systematik.
   Die Liste kommt aus der Governance-Struktur (js/govstruktur.js). */
function konzeptKategorien(aktuell) {
  return (typeof regelwerkKategorien === 'function')
    ? regelwerkKategorien(aktuell)
    : (typeof KATEGORIEN_FALLBACK !== 'undefined' ? KATEGORIEN_FALLBACK : ['Allgemein']);
}
/** Dokumentenarten – dieselbe Liste wie bei Regelwerken (Spalten der Governance-Struktur). */
function konzeptArten(aktuell) {
  return (typeof regelwerkTypen === 'function')
    ? regelwerkTypen(aktuell)
    : (typeof REGELWERK_TYPEN !== 'undefined' ? REGELWERK_TYPEN : []);
}

/** Erklärung zur Dokumentenart, wie sie in der Matrix steht ('' = keine). */
function konzeptArtHinweis(t) {
  return (typeof regelwerkArtHinweis === 'function') ? regelwerkArtHinweis(t) : '';
}

const KONZEPT_PRIOS = [['hoch', 'Hoch'], ['mittel', 'Mittel'], ['niedrig', 'Niedrig']];

function newKonzept() {
  return {
    id: null,
    typ: 'Konzept',
    title: '',
    beschreibung: '',
    kategorie: (typeof regelwerkKategorien === 'function') ? (regelwerkKategorien()[0] || '') : '',
    regelwerkTyp: '',             // Dokumentart (Handbuch, Richtlinie, …) – wird bei Annahme übernommen
    geltungsbereich: [],          // Standorte ('ALLE' = alle) – wird bei Annahme übernommen
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

/** Pflichtfelder eines Konzepts prüfen. @returns Meldung oder '' (alles gut) */
function konzeptPflichtfelderFehlen(k) {
  if (!k) return '';
  if (!(k.regelwerkTyp || '').trim()) return 'Bitte den Typ (Dokumentart) wählen – z. B. Policy oder Konzernrichtlinie.';
  if (!Array.isArray(k.geltungsbereich) || !k.geltungsbereich.length)
    return 'Bitte den Geltungsbereich festlegen: „Alle Standorte" oder einzelne Werke.';
  return '';
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

/** Volltextsuche über ein Konzept: Titel, Kategorie, Typ, Standorte, Motivation, Skizze, Antragsteller. */
function konzeptMatchesQuery(k, q) {
  if (!q) return true;
  const ko = k.konzept || {};
  const teile = [
    k.title, k.kategorie, k.regelwerkTyp, ko.motivation, ko.skizze, ko.antragstellerName,
    (Array.isArray(k.geltungsbereich) && typeof geltungsbereichLabel === 'function') ? geltungsbereichLabel(k.geltungsbereich) : '',
  ];
  return teile.join(' ').toLowerCase().includes(q);
}

function renderKonzeptCards(q, fTyp) {
  let rows = (State.konzepte || []).slice();
  if (fTyp) rows = rows.filter(k => (k.regelwerkTyp || '') === fTyp);
  if (q) rows = rows.filter(k => konzeptMatchesQuery(k, q));
  const rank = (k) => { const s = konzeptStatus(k); return s === 'GF-Prüfung' ? 0 : s === 'Idee' ? 1 : s === 'Zurückgestellt' ? 2 : s === 'Angenommen' ? 3 : 4; };
  rows.sort((a, b) => rank(a) - rank(b) || (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));

  const intro = `<div class="field-hint" style="margin-bottom:12px">Konzepte sind <b>Vorschläge</b> für mögliche neue Regelwerke. Die Geschäftsleitung prüft Priorität und Umsetzung. Angenommene Konzepte werden zu einem <b>Regelwerk-Entwurf</b>.</div>`;
  if (!rows.length) return intro + emptyState(
    (q || fTyp) ? 'Keine Treffer für die aktuellen Filter.' : 'Noch keine Regelwerk-Konzepte. Lege oben mit „💡 Regelwerk-Konzept" eines an.',
    (q || fTyp) ? '🔍' : '💡');

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
    <div class="item-card" id="konzept-${esc(k.id)}" onclick="openKonzeptEditor('${k.id}')">
      <div class="ic-top">
        <div class="ic-title">💡 ${esc(k.title)}</div>
        <div class="ic-topright">${konzeptStatusBadge(k)}</div>
      </div>
      <div class="ic-tags">
        ${k.regelwerkTyp ? `<span class="ic-tag" style="background:#eef2ff;color:#3730a3">${esc(k.regelwerkTyp)}</span>` : ''}
        ${k.kategorie ? `<span class="ic-tag cat">${esc(k.kategorie)}</span>` : ''}
        ${(k.geltungsbereich && k.geltungsbereich.length && typeof geltungsbereichLabel === 'function') ? `<span class="ic-tag">📍 ${esc(geltungsbereichLabel(k.geltungsbereich))}</span>` : ''}
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
    const src = konzeptZuId(id);
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
  // Systematik (Dokumentenart, Kategorie) kommt aus der Governance-Struktur.
  // War der Reiter noch nicht offen, nachladen und einmal neu zeichnen.
  if (typeof gsDatenGeladen === 'function' && !gsDatenGeladen() && typeof gsDatenLaden === 'function') {
    gsDatenLaden().then(() => { if (_kEditing) renderKonzeptEditor(); });
  }
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
      ${(typeof MUSTER_VORLAGE_URL !== 'undefined') ? `<p style="margin:0 0 12px"><a href="${esc(MUSTER_VORLAGE_URL)}" target="_blank" rel="noopener" style="color:var(--c-primary);font-weight:600;text-decoration:none">📁 Muster-Vorlage „Erstellung von Konzernregelungen" öffnen →</a></p>` : ''}
      ${k.id ? `<div style="margin-bottom:12px">Status: ${konzeptStatusBadge(k)}${(ko.entscheidung && ko.entscheidung.kommentar) ? ` <span class="field-hint">– „${esc(ko.entscheidung.kommentar)}" (${esc(ko.entscheidung.vonName || ko.entscheidung.von)})</span>` : ''}</div>` : ''}
      <div class="form-grid">
        <div class="form-group full">
          <label>Arbeitstitel <span class="req">*</span></label>
          <input type="text" value="${esc(k.title)}" oninput="_kEditing.title=this.value" placeholder="z. B. Regelwerk zur Nutzung von KI">
        </div>
        <div class="form-group">
          <label>Dokumentenart <span class="req">*</span></label>
          <select onchange="_kEditing.regelwerkTyp=this.value">
            <option value="">– bitte wählen –</option>
            ${konzeptArten(k.regelwerkTyp).map(t => `<option ${t === k.regelwerkTyp ? 'selected' : ''} title="${esc(konzeptArtHinweis(t))}">${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Kategorie</label>
          <select onchange="_kEditing.kategorie=this.value">
            <option value="">– keine –</option>
            ${konzeptKategorien(k.kategorie).map(c => `<option ${c === k.kategorie ? 'selected' : ''}>${esc(c)}</option>`).join('')}
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
      ${(typeof renderGeltungsbereichSection === 'function') ? renderGeltungsbereichSection(k.geltungsbereich, 'kgb') : ''}
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
  // Re-Render ohne Scroll-Sprung (Geltungsbereich/Typ ändern …)
  (typeof reopenModalKeepScroll === 'function' ? reopenModalKeepScroll : openModal)(body, true);
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
  const scheme = officeScheme(_kEditing.dokumentName);
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
  const fehlt = konzeptPflichtfelderFehlen(k);
  if (fehlt) { toast(fehlt, 'error'); return; }
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
  const src = konzeptZuId(id);
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
  // Ältere Konzepte (vor der Pflicht) müssen erst vervollständigt werden
  const fehlt = konzeptPflichtfelderFehlen(k);
  if (fehlt) { toast(fehlt + ' – bitte das Konzept öffnen und ergänzen.', 'error'); openKonzeptEditor(id); return; }
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
    await notifyKonzeptGF(k);
    konzeptVersandHinweis(k);
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/**
 * Nach dem Einreichen sichtbar machen, was tatsächlich passiert ist.
 * Ein Toast ist nach drei Sekunden weg – gerade in einer Vorführung soll aber
 * nachvollziehbar bleiben, dass die Mail zur Konzeptprüfung wirklich raus ist
 * und an wen.
 */
function konzeptVersandHinweis(k) {
  const gl = (typeof getGeschaeftsleitung === 'function') ? getGeschaeftsleitung() : [];
  const anhang = k.dokumentName ? `<li>Anhang: <b>${esc(k.dokumentName)}</b></li>` : '';
  openModal(`
    <div class="modal-header">
      <h3>Konzeptprüfung angefordert</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div style="padding:11px 14px;border-radius:9px;background:#f0fdf4;border-left:3px solid var(--c-success)">
        <b>Die E-Mail ist raus.</b> Die Geschäftsleitung kann direkt aus der Nachricht heraus entscheiden.
      </div>
      <ul style="margin:14px 0 0;padding-left:19px;font-size:.87rem;line-height:1.75">
        <li>Konzept: <b>${esc(k.title)}</b></li>
        <li>Empfänger: <b>${esc(gl.join(', ') || '– niemand hinterlegt –')}</b></li>
        ${anhang}
        <li>Schaltflächen in der Mail: <b>Annehmen</b> · <b>Zurückstellen</b> · <b>Ablehnen</b></li>
      </ul>
      <div class="field-hint" style="margin-top:12px">Solange nicht entschieden ist, steht das Konzept
      im Dashboard unter <b>💡 Konzepte</b> mit dem Status „GF-Prüfung".</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal()">Alles klar</button>
    </div>`);
}

/**
 * Entscheidung der Geschäftsleitung über ein Konzept.
 * @param {string} id Konzept-Id
 * @param {string} decision 'angenommen' | 'zurueckgestellt' | 'abgelehnt'
 * @param {object} [opts] { ohneRueckfrage: true } – Klick aus der Mail und Selbsttest: dieselbe
 *   Funktion ohne Dialoge, damit die Automatik dahinter wirklich geprüft wird.
 * @returns bei Annahme die Id des entstandenen Regelwerks
 */
async function konzeptDecide(id, decision, opts) {
  if (typeof isCurrentUserGeschaeftsleitung === 'function' && !isCurrentUserGeschaeftsleitung()) {
    toast('Nur die Geschäftsleitung kann über Konzepte entscheiden.', 'error'); return;
  }
  const k = _kClone(id); if (!k) return;
  // Aus der Mail heraus ist der Klick die Entscheidung – dann keine zweite
  // Nachfrage. Was Pflicht ist (die Begründung einer Ablehnung), wird trotzdem
  // abgefragt: Sie ist keine Rückfrage, sondern eine fehlende Angabe.
  const ohneRueckfrage = !!(opts && opts.ohneRueckfrage);

  if (decision === 'abgelehnt') {
    const res = await uiPrompt('Warum wird das Konzept abgelehnt? (Pflicht)', { title: 'Konzept ablehnen', okLabel: 'Ablehnen', danger: true });
    if (res === null) return;
    const grund = res.trim();
    if (!grund) { toast('Ohne Begründung nicht möglich.', 'error'); return; }
    k.konzept.entscheidung = _kEntsch('abgelehnt', grund);
    await _kPersist(k, 'Konzept abgelehnt.', 'error');
    notifyKonzeptErsteller(k, 'abgelehnt');
    return;
  }
  if (decision === 'zurueckgestellt') {
    // Die Notiz ist freiwillig – beim Ein-Klick-Weg entfällt sie.
    const res = ohneRueckfrage ? '' : await uiPrompt('Notiz zum Zurückstellen (optional):', { title: 'Konzept zurückstellen', okLabel: 'Zurückstellen' });
    if (res === null) return;
    k.konzept.entscheidung = _kEntsch('zurueckgestellt', res.trim());
    await _kPersist(k, 'Konzept zurückgestellt.');
    notifyKonzeptErsteller(k, 'zurueckgestellt');
    return;
  }

  // decision === 'angenommen'
  const ko = k.konzept || {};
  const ok = ohneRueckfrage || await uiConfirm('Konzept annehmen? Es wird daraus ein neues Regelwerk (Entwurf) erstellt, das anschließend mit einem Dokument versehen und in die Konformitätsprüfung gegeben wird.',
    { title: 'Konzept annehmen', okLabel: 'Annehmen & Regelwerk anlegen' });
  if (!ok) return;
  try {
    // 1) Regelwerk-Entwurf aus dem Konzept anlegen
    const rw = newPolicy();
    rw.title = k.title;
    rw.kategorie = k.kategorie;
    rw.regelwerkTyp = k.regelwerkTyp || '';   // Dokumentart aus dem Konzept übernehmen
    rw.geltungsbereich = Array.isArray(k.geltungsbereich) ? k.geltungsbereich.slice() : [];   // Geltungsbereich übernehmen
    rw.beschreibung = _konzeptToBeschreibung(k);
    rw.status = 'Entwurf';
    // Anhang des Konzepts als Startdokument des Regelwerks übernehmen (falls vorhanden)
    if (k.dokumentItemId || k.dokumentUrl) {
      rw.dokumentUrl = k.dokumentUrl || '';
      rw.dokumentName = k.dokumentName || '';
      rw.dokumentDriveId = k.dokumentDriveId || '';
      rw.dokumentItemId = k.dokumentItemId || '';
      // Am Regelwerk ist es keine Skizze mehr: „Konzept-Skizze X.docx" heißt ab
      // jetzt „X.docx". Es bleibt dieselbe Datei – nur der Name stimmt wieder.
      // Scheitert das Umbenennen, geht die Annahme trotzdem durch.
      const ohneSkizze = String(k.dokumentName || '').replace(/^Konzept[-\s]?Skizze\s*/i, '').trim();
      if (ohneSkizze && ohneSkizze !== k.dokumentName && rw.dokumentDriveId && rw.dokumentItemId
          && typeof spRenameDoc === 'function') {
        try {
          const neu = await spRenameDoc(rw.dokumentDriveId, rw.dokumentItemId, ohneSkizze);
          rw.dokumentName = neu.name || ohneSkizze;
          rw.dokumentUrl = neu.url || rw.dokumentUrl;
          // Das Konzept zeigt auf dieselbe Datei – sonst liefe sein Link ins Leere.
          k.dokumentName = rw.dokumentName;
          k.dokumentUrl = rw.dokumentUrl;
        } catch (e) { console.warn('Skizze nicht umbenannt:', e.message); }
      }
    }
    // Die Entscheidung über das Konzept gehört in die Historie des Regelwerks –
    // sie ist der erste Schritt seiner Entstehung und im Audit genauso relevant
    // wie Prüfung und Freigabe.
    if (typeof historieAdd === 'function') {
      const e = _kEntsch('angenommen', '');
      historieAdd(rw, 'Konzept freigegeben',
        `Konzept „${k.title}" angenommen von ${e.vonName || e.von}.`
        + (ko.antragstellerName ? ` Eingereicht von ${ko.antragstellerName}.` : '')
        + (ko.prioritaet ? ` Priorität: ${konzeptPrioLabel(ko.prioritaet)}.` : ''));
      historieAdd(rw, 'Angelegt', `Regelwerk-Entwurf aus dem Konzept „${k.title}" entstanden.`);
    }
    const savedRw = await spSavePolicy(rw);
    const rwId = (savedRw && savedRw.id) ? savedRw.id : '';
    // 2) Konzept als angenommen markieren + Verweis speichern
    k.konzept.entscheidung = _kEntsch('angenommen', '');
    k.konzept.regelwerkId = rwId;
    await spSavePolicy(k);
    await reloadData();
    toast('Konzept angenommen – Regelwerk-Entwurf angelegt ✓', 'success');
    notifyKonzeptErsteller(k, 'angenommen');
    // Die Weiche fragt nicht „sind Sie sicher?", sondern „wie weiter?" – die
    // bleibt auch beim Ein-Klick-Weg. Nur der Selbsttest schaltet sie ab.
    if (rwId && !(opts && opts.ohneWeiche)) konzeptWeiche(k, rwId);
    else { _adminMode = 'konzepte'; renderAdminList(); }
    return rwId;
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

/** Konzept-Karte hervorheben (Deep-Link ohne Aktion). */
/**
 * Ins Regelwerk Dashboard wechseln und dort das Konzept zeigen.
 *
 * `_adminMode` wird direkt gesetzt statt über setAdminMode(): das würde die
 * Liste rendern, bevor die Ansicht überhaupt sichtbar ist – switchView() holt
 * das gleich danach nach.
 */
async function konzeptOeffnen(id) {
  _adminMode = 'konzepte';
  await switchView('verwaltung');
  focusKonzeptCard(id);
}

function focusKonzeptCard(id) {
  const el = document.getElementById('konzept-' + id);
  if (!el) { toast('Dieses Konzept ist gerade nicht in der Liste (evtl. schon entschieden).'); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('fg-highlight');
  setTimeout(() => el.classList.remove('fg-highlight'), 4500);
}

/** Aus dem Mail-Button (?konzept=…&aktion=…): Entscheidung direkt ausführen (mit Rückfrage/Begründung). */
function handleKonzeptMailAction(id, aktion) {
  const k = konzeptZuId(id);
  if (!k) { toast('Konzept nicht gefunden (evtl. schon entschieden).'); return; }
  const map = { annehmen: 'angenommen', zurueckstellen: 'zurueckgestellt', zuruckstellen: 'zurueckgestellt', ablehnen: 'abgelehnt' };
  const decision = map[String(aktion || '').toLowerCase()];
  focusKonzeptCard(id);
  if (!decision) return;
  // Der Klick in der Mail IST die Entscheidung – weder Bestätigung noch
  // Folgefrage. Geprüft wird trotzdem das GF-Recht, und eine Ablehnung verlangt
  // weiterhin ihre Begründung. Wie es weitergeht, entscheidet man später im
  // Entwurf; direkt nach einem Mail-Klick will das niemand beantworten.
  setTimeout(() => { konzeptDecide(id, decision, { ohneRueckfrage: true, ohneWeiche: true }); }, 500);
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
  const base = 'https://rms.dihag.de/';
  const br = (s) => esc(String(s || '')).replace(/\n/g, '<br>');
  // Anhang UND Fundstelle in SharePoint: Wer entscheidet, soll die Datei auch dort
  // ansehen können – mit Versionsstand und Kommentaren.
  const anhangZeile = (hasAttachment
    ? `<p>📎 Ein Entwurf/Anhang ist dieser E-Mail beigefügt${k.dokumentName ? `: <b>${esc(k.dokumentName)}</b>` : ''}.</p>`
    : (hasDoc
      ? `<p>📎 Ein Entwurf/Anhang${k.dokumentName ? ` (<b>${esc(k.dokumentName)}</b>)` : ''} ist im Konzept hinterlegt (zu groß für den E-Mail-Anhang).</p>`
      : ''))
    + (k.dokumentUrl
      ? `<p style="margin:6px 0 0"><a href="${esc(k.dokumentUrl)}" style="color:#17509e;font-weight:600;text-decoration:none">📄 Dokument in SharePoint öffnen →</a>
         <span style="color:#9ca3af;font-size:12px">(immer der aktuelle Stand, mit Versionsverlauf)</span></p>`
      : '');
  const url = `${base}?konzept=${encodeURIComponent(k.id || '')}`;
  const act = (a) => `${url}&aktion=${a}`;
  const actions = k.id
    ? mailBtn(act('annehmen'), MAIL_FARBE.ja, '✓ Annehmen → Regelwerk') + mailBtn(act('zurueckstellen'), MAIL_FARBE.warten, '⏸ Zurückstellen') + mailBtn(act('ablehnen'), MAIL_FARBE.nein, '✗ Ablehnen')
    : '';
  return mailRumpf(`
    <p><b>Neues Regelwerk-Konzept zur Prüfung durch die Geschäftsleitung</b></p>
    <p>Titel: <b>${esc(k.title)}</b>${k.kategorie ? ' (' + esc(k.kategorie) + ')' : ''}<br>
       ${(typeof geltungsbereichLabel === 'function' && geltungsbereichLabel(k.geltungsbereich))
         ? 'Geltungsbereich: <b>' + esc(geltungsbereichLabel(k.geltungsbereich)) + '</b><br>' : ''}
       Priorität (Vorschlag): <b>${esc(konzeptPrioLabel(ko.prioritaet))}</b>${ko.antragstellerName ? '<br>Eingereicht von: ' + esc(ko.antragstellerName) : ''}</p>
    ${ko.motivation ? `<p><b>Warum?</b><br>${br(ko.motivation)}</p>` : ''}
    ${ko.skizze ? `<p><b>Wie könnte es aussehen?</b><br>${br(ko.skizze)}</p>` : ''}
    ${anhangZeile}
    ${actions
      ? `<p style="margin:18px 0 6px"><b>Direkt entscheiden:</b></p><p>${actions}</p>`
      : `<p><a href="${esc(url)}" style="display:inline-block;background:#17509e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:7px;font-weight:600">Regelwerk-Dashboard öffnen → 💡 Konzepte</a></p>`}
    ${mailFuss(`Der Button öffnet das Konzept in der App und führt die Entscheidung nach kurzer Rückfrage aus (Ablehnen/Zurückstellen mit Begründung; Anmeldung nötig, nur Geschäftsleitung). Oder <a href="${esc(url)}" style="color:#9ca3af">nur ansehen</a>.<br>Automatische Nachricht vom DIHAG Regelwerk-Management.`)}
  `);
}


/* ═══════════════════════════════════════════════════
   Nach der Annahme: bearbeiten oder gleich weiterschicken
═══════════════════════════════════════════════════ */

/**
 * Bestätigung für die Geschäftsleitung. Sie entscheidet über das Konzept – wie
 * es mit dem Entwurf weitergeht, entscheidet die Person, die das Konzept
 * geschrieben hat. Deshalb steht hier keine Weiche, sondern nur, was passiert
 * ist und wer jetzt am Zug ist.
 */
function konzeptWeiche(k, rwId) {
  const p = policyZuId(rwId);
  const ko = k.konzept || {};
  openModal(`
    <div class="modal-header">
      <h3>Konzept angenommen</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div style="padding:11px 14px;border-radius:9px;background:#f0fdf4;border-left:3px solid var(--c-success)">
        <b>Der Regelwerk-Entwurf ist angelegt.</b> Titel, Dokumentart, Geltungsbereich und die
        Begründung sind aus dem Konzept übernommen${p && p.dokumentName ? `, das Dokument <b>${esc(p.dokumentName)}</b> ist als Startdatei hinterlegt` : ''}.
      </div>
      <p style="margin:14px 0 0;line-height:1.6">
        ${ko.antragstellerName ? `<b>${esc(ko.antragstellerName)}</b> wurde` : 'Die einreichende Person wurde'}
        per E-Mail informiert und entscheidet, ob der Entwurf noch ausgearbeitet oder direkt in die
        Konformitätsprüfung gegeben wird.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal()">Alles klar</button>
    </div>`);
}

/** Den frisch entstandenen Entwurf ohne Umweg in die Konformitätsprüfung schicken. */
async function konzeptDirektZurPruefung(rwId) {
  const p = policyZuId(rwId);
  if (!p) { toast('Regelwerk nicht gefunden.', 'error'); return; }
  try {
    await setStatus(rwId, 'Konformitätsprüfung', 'Direkt aus dem angenommenen Konzept eingereicht');
    await reloadData();
    const frisch = policyZuId(rwId);
    if (typeof notifyPruefer === 'function') await notifyPruefer(frisch || p);
    if (typeof mitbestimmungPflicht === 'function' && mitbestimmungPflicht(frisch || p)
        && typeof notifyMitbestimmung === 'function') await notifyMitbestimmung(frisch || p);
    _adminMode = 'regelwerke';
    renderAdminList();
    toast('In der Konformitätsprüfung – Prüfer benachrichtigt ✓', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/**
 * Die einreichende Person über die Entscheidung informieren.
 * Wer ein Konzept einreicht, soll nicht im Dashboard nachsehen müssen, was
 * daraus geworden ist. Die Mail geht auch dann raus, wenn dieselbe Person
 * entschieden hat – in ihr steckt die Frage, wie es mit dem Entwurf weitergeht,
 * und die gehört zur einreichenden Person.
 */
async function notifyKonzeptErsteller(k, entscheidung) {
  const ko = k.konzept || {};
  const an = ko.antragstellerUpn || '';
  if (!an) return;                                  // niemand hinterlegt – nichts zu tun
  const texte = {
    angenommen: ['Konzept angenommen', 'Das Konzept wurde angenommen. Daraus ist ein Regelwerk-Entwurf entstanden, der jetzt ausgearbeitet und in die Konformitätsprüfung gegeben wird.', '#16a34a'],
    zurueckgestellt: ['Konzept zurückgestellt', 'Das Konzept wurde vorerst zurückgestellt.', '#64748b'],
    abgelehnt: ['Konzept abgelehnt', 'Das Konzept wurde abgelehnt.', '#dc2626'],
  };
  const [titel, text, farbe] = texte[entscheidung] || texte.angenommen;
  const e = ko.entscheidung || {};
  const html = mailRumpf(`
    <p><b>${esc(titel)}: ${esc(k.title)}</b></p>
    <p>${esc(text)}</p>
    <div style="margin:14px 0;padding:10px 14px;border-left:3px solid ${farbe};background:#f8fafc;border-radius:0 8px 8px 0;font-size:14px">
      Entschieden von <b>${esc(e.vonName || e.von || 'Geschäftsleitung')}</b>${e.am && typeof fmtDate === 'function' ? ' am ' + esc(fmtDate(e.am)) : ''}.
      ${e.kommentar ? `<br>Begründung: „${esc(e.kommentar)}"` : ''}
    </div>
    ${(entscheidung === 'angenommen' && ko.regelwerkId) ? `
      <p style="margin:18px 0 6px"><b>Wie soll es weitergehen?</b></p>
      <p>
        ${mailBtn(`https://rms.dihag.de/?richtlinie=${encodeURIComponent(ko.regelwerkId)}&ansicht=entwurf`,
          MAIL_FARBE.neutral, 'Entwurf bearbeiten')}
        ${mailBtn(`https://rms.dihag.de/?richtlinie=${encodeURIComponent(ko.regelwerkId)}&ansicht=entwurf&aktion=pruefung`,
          MAIL_FARBE.ja, 'Direkt zur Konformitätsprüfung')}
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0">Ausarbeiten heißt: Dokument ergänzen, Zielgruppe,
      Wissenstest und Mitbestimmung festlegen.</p>`
      : `<p>${mailBtn(`https://rms.dihag.de/?konzept=${encodeURIComponent(k.id || '')}`,
          MAIL_FARBE.neutral, 'Konzept öffnen →')}</p>`}
    ${mailFuss(`Automatische Nachricht vom DIHAG Regelwerk-Management.`)}
  `);
  try {
    await spSendMail([an], `${titel}: ${k.title}`, html);
  } catch (err) { console.warn('Ersteller-Info:', err.message); }
}
