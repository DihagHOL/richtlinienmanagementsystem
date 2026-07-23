/**
 * Reiter „Vorschläge" – Änderungsvorschläge in der App bearbeiten
 * ===============================================================
 * Listet die in der SharePoint-Liste „Aenderungsvorschlaege" gespeicherten
 * Vorschläge. Klick auf eine Zeile öffnet ein rechtes Seitenpanel (Drawer) zum
 * Bearbeiten von Status + Bearbeiterkommentar. Sichtbar für Admins,
 * ISMS-Verantwortliche und Vorschlags-Empfänger.
 */

let _proposals = null;     // geladene Vorschläge (Cache)
let _proposalsLoading = false;

const PROPOSAL_STATUS_STYLE = {
  'Offen':          ['#fef3c7', '#92400e'],
  'In Bearbeitung': ['#dbeafe', '#1e40af'],
  'Erledigt':       ['#dcfce7', '#166534'],
  'Abgelehnt':      ['#fee2e2', '#991b1b'],
};

function _propStatusBadge(s) {
  const [bg, fg] = PROPOSAL_STATUS_STYLE[s] || ['#f1f5f9', '#475569'];
  return `<span style="display:inline-block;font-size:.7rem;font-weight:700;background:${bg};color:${fg};border-radius:999px;padding:2px 10px">${esc(s || 'Offen')}</span>`;
}

/** Herkunfts-Chip (Quelle): Health-Check-Vorschläge hervorheben, sonst dezent. */
function _propSourceChip(q) {
  if (!q) return '';
  const health = /health/i.test(q);
  const label = health ? '🩺 Dokumentprüfung' : esc(q);
  const style = health ? 'background:#fef9c3;color:#854d0e' : 'background:#eef2ff;color:#3730a3';
  return `<span style="display:inline-block;font-size:.66rem;font-weight:700;${style};border-radius:999px;padding:1px 8px;margin-left:6px">${label}</span>`;
}

async function initProposals() {
  const mount = document.getElementById('vorschlaege-mount');
  if (!mount) return;
  // Beim Öffnen IMMER frisch laden. Vorhandene Daten sofort zeigen (kein Leer-Flackern),
  // im Hintergrund neu laden und dann neu rendern.
  if (_proposals) renderProposals();
  else mount.innerHTML = '<div class="doc-loading">Lade Vorschläge …</div>';
  _proposalsLoading = true;
  try {
    _proposals = await spGetProposals();
  } catch (e) {
    _proposalsLoading = false;
    if (_proposals && _proposals.length) { toast('Aktualisieren fehlgeschlagen: ' + e.message, 'error'); return; }   // Cache behalten
    const denied = /\b40[13]\b|accessdenied|access denied|insufficient|unauthor/i.test(e.message || '');
    mount.innerHTML = denied
      ? `<div class="col-warning" style="display:block">
          <b>Vorschlags-Liste fehlt und konnte nicht automatisch angelegt werden</b> (das Konto darf in
          SharePoint keine Listen erstellen). Vorschläge werden weiterhin <b>per E-Mail</b> versendet –
          für die In-App-Übersicht muss die Liste einmalig manuell angelegt werden:
          <div style="margin-top:10px;font-size:.86rem;line-height:1.7">
            SharePoint-Site <code>sites/IT</code> → <b>Neu → Liste</b> → Name exakt
            <b>„Aenderungsvorschlaege"</b>. Spalten anlegen:
            <ul style="margin:6px 0 0;padding-left:20px">
              <li><b>Betreff</b>, <b>DokumentLink</b>, <b>Eingereicht</b>, <b>Empfaenger</b>, <b>Quelle</b> – je „Einzelne Textzeile"</li>
              <li><b>Vorschlag</b>, <b>Begruendung</b>, <b>Bearbeiterkommentar</b> – je „Mehrere Zeilen Text"</li>
              <li><b>Status</b> – „Auswahl" mit: Offen, In Bearbeitung, Erledigt, Abgelehnt</li>
            </ul>
            <span class="field-hint">Die Spalte „Titel" ist bereits vorhanden. Danach hier „↻ Aktualisieren".</span>
          </div></div>`
      : `<div class="col-warning" style="display:block">Vorschläge konnten nicht geladen werden: ${esc(e.message)}
          <br><span class="field-hint">Bitte „↻ Aktualisieren" versuchen oder die IT kontaktieren.</span></div>`;
    return;
  }
  _proposalsLoading = false;
  renderProposals();
}

async function refreshProposals() {
  _proposals = null;
  await initProposals();
}

function renderProposals() {
  const mount = document.getElementById('vorschlaege-mount');
  if (!mount) return;
  const all = _proposals || [];
  const statusF = document.getElementById('filter-prop-status')?.value || '';
  const q = (document.getElementById('search-prop')?.value || '').toLowerCase().trim();

  let rows = all.slice();
  if (statusF) rows = rows.filter(p => (p.status || 'Offen') === statusF);
  if (q) rows = rows.filter(p => (p.titel + ' ' + p.betreff + ' ' + p.eingereicht + ' ' + p.vorschlag).toLowerCase().includes(q));

  const offen = all.filter(p => (p.status || 'Offen') === 'Offen').length;
  const sub = `<div class="view-desc" style="margin:0 0 12px"><b>${all.length}</b> Vorschlag/Vorschläge${offen ? ` · <b>${offen}</b> offen` : ''} · Zeile anklicken zum Bearbeiten.</div>`;

  if (!all.length) {
    mount.innerHTML = sub + emptyState('Noch keine Vorschläge eingegangen.', '✉️');
    return;
  }
  if (!rows.length) { mount.innerHTML = sub + emptyState('Keine Treffer für die aktuelle Filterung.', '🔍'); return; }

  mount.innerHTML = sub + `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Status</th><th>Betreff / Dokument</th><th>Eingereicht von</th><th>Datum</th></tr></thead>
    <tbody>${rows.map(p => `
      <tr onclick="openProposalDrawer('${esc(p.id)}')" style="cursor:pointer">
        <td>${_propStatusBadge(p.status)}</td>
        <td><b>${esc(p.titel || '–')}</b>${_propSourceChip(p.quelle)}${p.betreff ? `<div style="font-size:.74rem;color:var(--c-faint)">${esc(p.betreff)}</div>` : ''}</td>
        <td style="color:var(--c-muted)">${esc(p.eingereicht || '–')}</td>
        <td style="color:var(--c-muted)">${p.created ? fmtDate(p.created) : '–'}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

/* ── Rechtes Seitenpanel (Drawer) ── */

function _drawer(html) {
  const mount = document.getElementById('modal-mount');
  if (!mount) return;
  mount.innerHTML = `
    <div class="drawer-backdrop" onclick="if(event.target===this)closeModal()"
      style="position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:1000;display:flex;justify-content:flex-end">
      <div class="drawer-panel" role="dialog"
        style="width:min(520px,94vw);height:100%;background:var(--c-surface);box-shadow:-8px 0 30px rgba(0,0,0,.18);
               overflow-y:auto;animation:drawerIn .18s ease-out">${html}</div>
    </div>
    <style>@keyframes drawerIn{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}</style>`;
}

function openProposalDrawer(id) {
  const p = (_proposals || []).find(x => String(x.id) === String(id));
  if (!p) return;
  const canEdit = typeof isCurrentUserProposalManager === 'function' ? isCurrentUserProposalManager() : true;
  const br = s => esc(s).replace(/\n/g, '<br>');
  const statusOpts = (typeof PROPOSAL_STATUS !== 'undefined' ? PROPOSAL_STATUS : ['Offen', 'In Bearbeitung', 'Erledigt', 'Abgelehnt'])
    .map(s => `<option value="${esc(s)}" ${s === (p.status || 'Offen') ? 'selected' : ''}>${esc(s)}</option>`).join('');
  _drawer(`
    <div style="position:sticky;top:0;background:var(--c-surface);border-bottom:1px solid var(--c-border);
                padding:16px 20px;display:flex;align-items:center;gap:10px;z-index:1">
      <div style="flex:1"><div style="font-weight:800;font-size:1.02rem">${esc(p.titel || 'Vorschlag')}</div>
        <div style="font-size:.76rem;color:var(--c-muted)">${_propStatusBadge(p.status)}${_propSourceChip(p.quelle)} &nbsp; eingereicht ${p.created ? 'am ' + esc(fmtDate(p.created)) : ''} von ${esc(p.eingereicht || '–')}</div></div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div style="padding:18px 20px">
      ${p.link ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <button class="btn btn-outline btn-sm" onclick="proposalDrawerOpenOffice('${esc(p.id)}')" title="Im Desktop-Office öffnen">✏️ In Office öffnen</button>
        <button class="btn btn-outline btn-sm" onclick="proposalDrawerOpenWeb('${esc(p.id)}')" title="In SharePoint / Office für das Web öffnen">🌐 Im Browser öffnen</button>
      </div>` : ''}
      ${p.empfaenger ? `<div style="margin-bottom:12px"><div class="field-hint">Benachrichtigt (E-Mail)</div><div style="font-weight:600;font-size:.85rem">${esc(p.empfaenger)}</div></div>` : ''}
      ${p.betreff ? `<div style="margin-bottom:12px"><div class="field-hint">Abschnitt / Betreff</div><div style="font-weight:600">${esc(p.betreff)}</div></div>` : ''}
      <div style="margin-bottom:12px"><div class="field-hint">Vorgeschlagene Änderung</div>
        <div style="background:var(--c-bg);border-radius:8px;padding:10px 12px;line-height:1.5">${br(p.vorschlag) || '–'}</div></div>
      ${p.begruendung ? `<div style="margin-bottom:12px"><div class="field-hint">Begründung</div>
        <div style="background:var(--c-bg);border-radius:8px;padding:10px 12px;line-height:1.5">${br(p.begruendung)}</div></div>` : ''}

      <hr style="border:none;border-top:1px solid var(--c-border);margin:16px 0">

      <div class="form-grid">
        <div class="form-group full"><label>Status</label>
          <select id="prop-edit-status" ${canEdit ? '' : 'disabled'}>${statusOpts}</select></div>
        <div class="form-group full"><label>Bearbeiter-Kommentar</label>
          <textarea id="prop-edit-kommentar" ${canEdit ? '' : 'disabled'} placeholder="Notiz/Antwort zur Bearbeitung …">${esc(p.kommentar || '')}</textarea></div>
      </div>
    </div>
    <div style="position:sticky;bottom:0;background:var(--c-surface);border-top:1px solid var(--c-border);
                padding:14px 20px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-outline" onclick="closeModal()">Schließen</button>
      ${canEdit ? `<button class="btn btn-primary" id="prop-edit-btn" onclick="saveProposalEdit('${esc(p.id)}')">Speichern</button>` : ''}
    </div>`);
}

/* Dokument-Link eines Vorschlags. */
function _propLink(id) { const p = (_proposals || []).find(x => String(x.id) === String(id)); return p ? (p.link || '') : ''; }

/** Betroffenes Dokument im Desktop-Office öffnen (Vorschlags-Drawer). */
function proposalDrawerOpenOffice(id) {
  const u = _propLink(id);
  if (!u) { toast('Kein Dokument-Link hinterlegt.', 'error'); return; }
  const clean = u.split('?')[0];
  const scheme = (typeof _policyOfficeScheme === 'function' && _policyOfficeScheme(clean)) || 'ms-word';
  window.location.href = `${scheme}:ofe|u|${u}`;
  toast('Öffne in Office … Öffnet sich nichts? „🌐 Im Browser öffnen" nutzen.');
}

/** Betroffenes Dokument in SharePoint/Office-Web öffnen (Vorschlags-Drawer). */
function proposalDrawerOpenWeb(id) {
  let u = _propLink(id);
  if (!u) { toast('Kein Dokument-Link hinterlegt.', 'error'); return; }
  if (/Doc\.aspx/i.test(u)) {
    u = u.replace(/([?&])action=[^&]*/i, '$1action=edit');
    if (!/[?&]action=/i.test(u)) u += (u.includes('?') ? '&' : '?') + 'action=edit';
  }
  window.open(u, '_blank', 'noopener');
}

async function saveProposalEdit(id) {
  const p = (_proposals || []).find(x => String(x.id) === String(id));
  if (!p) return;
  const status = document.getElementById('prop-edit-status')?.value || p.status;
  const kommentar = document.getElementById('prop-edit-kommentar')?.value || '';
  const btn = document.getElementById('prop-edit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichern …'; }
  try {
    await spUpdateProposal(id, { Status: status, Bearbeiterkommentar: kommentar });
    p.status = status; p.kommentar = kommentar;   // Cache aktualisieren
    toast('Vorschlag aktualisiert ✓', 'success');
    closeModal();
    renderProposals();
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
  }
}
