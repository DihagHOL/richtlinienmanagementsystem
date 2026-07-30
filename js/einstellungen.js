/**
 * Reiter „Einstellungen" – Rollen, Rechte und Verfahren
 * =====================================================
 * Pflegt access-config.json: wer Administrator/Prüfer/Geschäftsleitung ist,
 * welche Rolle welchen Reiter sehen darf, Mitbestimmungs-Adressen (KBR/BR),
 * Genehmigungsschwellen, Power-Automate-Umfang und die Mail-Empfänger.
 *
 * Ausgegliedert aus admin.js. Läuft im gemeinsamen globalen Scope –
 * Reihenfolge in index.html: nach admin.js.
 */

let _cfgEdit = null;          // Einstellungen-Entwurf

/* ═══════════════════════════════════════════════════
   Verwaltung: Liste
═══════════════════════════════════════════════════ */

function renderEinstellungen() {
  _cfgEdit = getAccessConfig();
  const v = document.getElementById('view-einstellungen');
  v.innerHTML = `
    <div style="max-width:680px">
      <div class="col-warning" style="display:block">
        Einstellungen liegen in <code>access-config.json</code> in der Dokumentbibliothek.
        <b>Admins</b> verwalten Richtlinien & sehen Compliance, <b>Genehmiger</b> geben frei.
        <b>Rollen/Abteilungen</b> steuern, wer welche zielgruppenspezifische Richtlinie sieht.
      </div>
      ${roleCard('admins', 'Administratoren')}
      ${roleCard('genehmiger', 'Genehmiger (einfache Freigabe, optional)')}
      ${roleCard('pruefer', 'Konformitätsprüfer')}
      ${roleCard('geschaeftsleitung', 'Geschäftsleitung (Freigabe zur Veröffentlichung)')}
      ${roleCard('kiGenehmiger', 'KI-Gremium (KI-Dashboard) – leer = Genehmiger-Liste gilt')}
      ${roleCard('ismsVerantwortlich', 'ISMS-Verantwortliche (Empfänger für Änderungsvorschläge)')}
      ${roleCard('vorschlagEmpfaenger', 'Vorschlags-Empfänger (zusätzlich, eigene Adressen)')}
      ${reiterRechteCard()}

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Genehmigungsverfahren – Schwellen</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">Ablauf: Entwurf → Konformitätsprüfung → Freigabe → Veröffentlicht.</div>
          <div class="form-grid">
            <div class="form-group"><label>„Konform", wenn …</label>
              <select onchange="_cfgEdit.konformSchwelle=this.value">
                <option value="alle" ${_cfgEdit.konformSchwelle === 'alle' ? 'selected' : ''}>alle Prüfer zustimmen</option>
                <option value="einer" ${_cfgEdit.konformSchwelle === 'einer' ? 'selected' : ''}>ein Prüfer reicht</option>
              </select></div>
            <div class="form-group"><label>Freigabe, wenn …</label>
              <select onchange="_cfgEdit.freigabeSchwelle=this.value">
                <option value="einer" ${_cfgEdit.freigabeSchwelle === 'einer' ? 'selected' : ''}>eine GL-Person reicht</option>
                <option value="alle" ${_cfgEdit.freigabeSchwelle === 'alle' ? 'selected' : ''}>alle GL-Personen</option>
              </select></div>
            <div class="form-group full"><label>Genehmigung über Power Automate</label>
              <select onchange="cfgSetPAScope(this.value)">
                <option value="aus"  ${_cfgEdit.genehmigungPAScope === 'aus' || (!_cfgEdit.genehmigungPAScope && !_cfgEdit.genehmigungPA) ? 'selected' : ''}>Aus – App versendet die Mails (Standard)</option>
                <option value="gl"   ${_cfgEdit.genehmigungPAScope === 'gl' ? 'selected' : ''}>Nur Freigabe (Geschäftsleitung) über Power Automate</option>
                <option value="alle" ${_cfgEdit.genehmigungPAScope === 'alle' || (!_cfgEdit.genehmigungPAScope && _cfgEdit.genehmigungPA) ? 'selected' : ''}>Prüfung + Freigabe über Power Automate</option>
              </select></div>
          </div>
          <div class="field-hint" style="margin-top:10px">Legt fest, welche Etappen per <b>actionable Outlook-Mail</b> (Genehmigen/Ablehnen ohne Portal) über Power Automate laufen. Für die betroffene Etappe schaltet die App ihre eigene Hinweis-Mail ab. <b>Nur Freigabe (GL)</b>: Prüfer/Mitbestimmung bleiben in der App, nur der letzte Schritt läuft über Power Automate. Siehe <code>docs/GENEHMIGUNG-POWER-AUTOMATE.md</code>.</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Mitbestimmung (KBR / Betriebsräte)</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">
            Mailadressen für die Mitbestimmungsprüfung. Markierst du im Richtlinien-Editor den
            <b>Konzernbetriebsrat</b> oder den <b>Betriebsrat eines Werks</b> als betroffen, geht die
            Richtlinie beim Einreichen zur Konformitätsprüfung automatisch (mit Dokument) an die hier
            hinterlegte Adresse. Adressen dürfen auf Gruppengesellschafts-Domains liegen (z. B. ewa-guss.de).
          </div>
          <div class="form-grid">
            <div class="form-group full"><label>Konzernbetriebsrat (KBR)</label>
              <input type="email" value="${esc(_cfgEdit.kbrMail || '')}" oninput="_cfgEdit.kbrMail=this.value.trim()"></div>
          </div>
          <div style="font-weight:600;font-size:.82rem;margin:12px 0 8px">Betriebsräte je Werk</div>
          <div class="form-grid">
            ${(typeof MITBESTIMMUNG_WERKE !== 'undefined' ? MITBESTIMMUNG_WERKE : []).map(code => `
              <div class="form-group"><label>${esc(code)}</label>
                <input type="email" value="${esc((_cfgEdit.brMails || {})[code] || '')}"
                  oninput="mitSetBrMail('${code}', this.value)"></div>`).join('')}
          </div>
          <div class="field-hint" style="margin-top:10px">Leer lassen, wenn (noch) kein Betriebsrat hinterlegt ist. Fehlt eine Adresse für ein betroffenes Werk, erscheint beim Einreichen ein Hinweis.</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>C-Level-Bericht (Audit / Management)</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">
            Empfänger für den <b>C-Level-/Management-Bericht</b> aus dem Reiter <b>Audit Report</b>.
            Der Bericht fasst den ISMS-Status (ISO 27001 / NIS2) mit den wesentlichen Kennzahlen und einer
            Normkonformitäts-Prüfung zusammen und wird per Mausklick versendet. Mehrere Adressen mit Komma/Semikolon trennen.
          </div>
          <div class="form-grid">
            <div class="form-group full"><label>Empfänger C-Level-Bericht</label>
              <input type="text" value="${esc(_cfgEdit.clevelMail || '')}" oninput="_cfgEdit.clevelMail=this.value.trim()"
                placeholder="geschaeftsfuehrung@dihag.com, ciso@dihag.com"></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Erinnerungen &amp; Eskalation (automatisch)</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">
            Diese Werte steuern den zeitgesteuerten Versand (GitHub-Actions-Cron). Erinnert wird an noch
            offene Prüfer bzw. Geschäftsleitung. <b>Zugangsdaten</b> (Client Secret usw.) bleiben aus
            Sicherheitsgründen in den GitHub-Secrets – siehe <code>docs/ERINNERUNGEN-GITHUB-ACTIONS.md</code>.
          </div>
          <div class="form-grid">
            <div class="form-group"><label>Erinnerungen aktiv</label>
              <select onchange="_cfgEdit.erinnerungenAktiv=(this.value==='ja')">
                <option value="ja" ${_cfgEdit.erinnerungenAktiv !== false ? 'selected' : ''}>Ja – automatisch senden</option>
                <option value="nein" ${_cfgEdit.erinnerungenAktiv === false ? 'selected' : ''}>Nein – pausiert</option>
              </select></div>
            <div class="form-group"><label>Absender-Postfach</label>
              <input type="email" value="${esc(_cfgEdit.mailSender || '')}" oninput="_cfgEdit.mailSender=this.value" placeholder="pruefer@dihag.com"></div>
            <div class="form-group"><label>Erste Erinnerung nach (Tagen)</label>
              <input type="number" min="1" value="${esc(_cfgEdit.erinnerungErsteNachTagen || 7)}" onchange="_cfgEdit.erinnerungErsteNachTagen=parseInt(this.value,10)||7"></div>
            <div class="form-group"><label>Danach alle (Tagen)</label>
              <input type="number" min="1" value="${esc(_cfgEdit.erinnerungDannAlleTage || 3)}" onchange="_cfgEdit.erinnerungDannAlleTage=parseInt(this.value,10)||3"></div>
            <div class="form-group"><label>Eskalation ab (Tagen)</label>
              <input type="number" min="1" value="${esc(_cfgEdit.eskalationAbTagen || 14)}" onchange="_cfgEdit.eskalationAbTagen=parseInt(this.value,10)||14"></div>
            <div class="form-group"><label>Eskalations-Mail (Ersatz-Empfänger)</label>
              <input type="email" value="${esc(_cfgEdit.eskalationMail || '')}" oninput="_cfgEdit.eskalationMail=this.value" placeholder="ersatz-pruefer@dihag.com"></div>
          </div>
          <div class="field-hint" style="margin-top:10px">Beispiel mit Standardwerten: erste Erinnerung nach <b>7</b> Tagen, danach alle <b>3</b> Tage; ab <b>14</b> Tagen zusätzlich an die Eskalations-Mail. Das Absender-Postfach muss ein lizenziertes Exchange-Postfach sein und die erlaubte Empfänger-Domain bestimmen.</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Verfügbare Rollen / Abteilungen</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">Stehen als Zielgruppe für Richtlinien und für die Mitarbeiter-Zuordnung zur Verfügung. Am besten identisch zu den Azure-AD-Abteilungen benennen.</div>
          <div id="cfg-roles"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <input type="text" id="cfg-input-roles" placeholder="z. B. Produktion"
              style="flex:1;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit"
              onkeydown="if(event.key==='Enter')cfgAddRole()">
            <button class="btn btn-outline btn-sm" onclick="cfgAddRole()">+ Rolle</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Azure-AD-Abteilungen (automatische Zuordnung)</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">Diese Abteilungen (<code>department</code>) stehen in den AD-Profilen eurer Mitarbeiter. Eine Person gilt <b>automatisch</b> für eine Rolle, wenn ihre Abteilung exakt dem Rollennamen entspricht. Übernimm die passende Abteilung als Rolle.</div>
          <div id="ad-departments"><div class="doc-loading">Lade Mitarbeiter aus Azure-AD …</div></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Mitarbeiter-Rollen (manuell)</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">Optional. Die Abteilung aus dem Azure-AD-Profil greift automatisch — hier kannst du einzelnen Personen zusätzliche Rollen zuweisen (z. B. wenn die AD-Abteilung abweicht oder fehlt).</div>
          <div id="cfg-userroles"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <input type="email" id="cfg-input-ur" placeholder="name@dihag.com"
              style="flex:1;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit"
              onkeydown="if(event.key==='Enter')urAddUser()">
            <button class="btn btn-outline btn-sm" onclick="urAddUser()">+ Mitarbeiter</button>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-primary" onclick="saveCfg()">Einstellungen speichern</button>
      </div>
    </div>`;
  renderCfgLists();
  rrRenderBody();
  renderRolesList();
  renderUserRolesList();
  loadAdDepartments();
}

function cfgAddRoleNamed(i) {
  const name = (AdminState.lastDepts || [])[i];
  if (!name) return;
  if (!_cfgEdit.roles) _cfgEdit.roles = [];
  if (!_cfgEdit.roles.some(r => r.toLowerCase() === name.toLowerCase())) _cfgEdit.roles.push(name);
  renderRolesList();
  renderUserRolesList();
  loadAdDepartments();
  toast('Rolle „' + name + '" hinzugefügt – noch speichern.', 'success');
}

function roleCard(role, title) {
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-header"><h2>${title}</h2></div>
    <div class="card-body">
      <div id="cfg-${role}"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input type="email" id="cfg-input-${role}" placeholder="name@dihag.com"
          style="flex:1;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit"
          onkeydown="if(event.key==='Enter')cfgAdd('${role}')">
        <button class="btn btn-outline btn-sm" onclick="cfgAdd('${role}')">+ Hinzufügen</button>
      </div>
    </div>
  </div>`;
}

/* ── Reiter-Berechtigungen: Checkbox-Matrix je Benutzer (E-Mail) ── */
let _rrExtraUsers = [];   // hinzugefügte Benutzer, die (noch) kein Häkchen haben

function reiterRechteCard() {
  if (typeof GOVERNABLE_TABS === 'undefined') return '';
  _rrExtraUsers = [];   // frischer Aufbau des Einstellungen-Reiters
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-header"><h2>Reiter-Berechtigungen (Lesen / Schreiben)</h2></div>
    <div class="card-body">
      <div class="field-hint" style="margin-bottom:10px">
        Zusätzlicher Zugriff auf einzelne Reiter je <b>Benutzer (E-Mail)</b> – einfach an-/abhaken.
        <b>Additiv</b>: Standardrechte bleiben, <b>Admins</b> haben immer Zugriff. <b>Schreiben</b> schließt <b>Lesen</b> ein
        (nur Lesen = Reiter sichtbar, aber nicht bearbeitbar). „Einstellungen" bleibt bewusst Admins vorbehalten.
      </div>
      <div id="rr-body"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input type="email" id="rr-input-user" placeholder="name@dihag.com"
          style="flex:1;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit"
          onkeydown="if(event.key==='Enter')rrAddUser()">
        <button class="btn btn-outline btn-sm" onclick="rrAddUser()">+ Benutzer</button>
      </div>
    </div></div>`;
}

function rrRenderBody() {
  const host = document.getElementById('rr-body');
  if (!host) return;
  const users = _rrAllUsers();
  if (!users.length) {
    host.innerHTML = '<div class="field-hint">Noch keine Benutzer berechtigt – unten per E-Mail hinzufügen, dann Häkchen setzen.</div>';
    return;
  }
  const rr = _cfgEdit.reiterRechte || {};
  const has = (view, kind, u) => ((rr[view] || {})[kind] || []).some(x => String(x).toLowerCase() === u);
  host.innerHTML = users.map(u => `
    <div style="border:1px solid var(--c-border);border-radius:10px;padding:10px 12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span>👤</span><b style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(u)}</b>
        <button class="btn btn-ghost btn-sm" onclick="rrRemoveUser('${esc(u)}')" title="Benutzer und alle seine Reiter-Rechte entfernen">✕ entfernen</button>
      </div>
      <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:.83rem;width:100%">
        <thead><tr style="text-align:left;color:var(--c-muted)">
          <th style="padding:3px 8px">Reiter</th>
          <th style="padding:3px 8px;text-align:center;width:80px">Lesen</th>
          <th style="padding:3px 8px;text-align:center;width:80px">Schreiben</th></tr></thead>
        <tbody>${GOVERNABLE_TABS.map(t => `<tr>
          <td style="padding:3px 8px">${esc(t.label)}</td>
          <td style="padding:3px 8px;text-align:center"><input type="checkbox" ${has(t.view, 'lesen', u) ? 'checked' : ''} onchange="rrToggle('${t.view}','lesen','${esc(u)}',this.checked)"></td>
          <td style="padding:3px 8px;text-align:center"><input type="checkbox" ${has(t.view, 'schreiben', u) ? 'checked' : ''} onchange="rrToggle('${t.view}','schreiben','${esc(u)}',this.checked)"></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`).join('');
}

function rrAddUser() {
  const inp = document.getElementById('rr-input-user');
  const val = (inp.value || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { toast('Bitte gültige E-Mail eingeben.', 'error'); return; }
  if (_rrAllUsers().includes(val)) { toast('Bereits vorhanden.', 'error'); return; }
  _rrExtraUsers.push(val);
  inp.value = '';
  rrRenderBody();
}

function rrRemoveUser(u) {
  const lc = String(u).toLowerCase();
  _rrExtraUsers = _rrExtraUsers.filter(x => x !== lc);
  for (const v of Object.values(_cfgEdit.reiterRechte || {})) {
    if (Array.isArray(v.lesen))     v.lesen     = v.lesen.filter(x => String(x).toLowerCase() !== lc);
    if (Array.isArray(v.schreiben)) v.schreiben = v.schreiben.filter(x => String(x).toLowerCase() !== lc);
  }
  rrRenderBody();
}

function rrToggle(view, kind, u, on) {
  if (!_cfgEdit.reiterRechte) _cfgEdit.reiterRechte = {};
  if (!_cfgEdit.reiterRechte[view]) _cfgEdit.reiterRechte[view] = { lesen: [], schreiben: [] };
  const lc = String(u).toLowerCase();
  const e = _cfgEdit.reiterRechte[view];
  e[kind] = (e[kind] || []).filter(x => String(x).toLowerCase() !== lc);
  if (on) e[kind].push(lc);
  // Schreiben schließt Lesen ein → beim Anhaken von „Schreiben" auch „Lesen" sichtbar setzen.
  if (kind === 'schreiben' && on && !e.lesen.some(x => String(x).toLowerCase() === lc)) {
    e.lesen.push(lc);
    rrRenderBody();
  }
  // Beim Abhaken des letzten Häkchens bleibt der Benutzer bis zum Verlassen des Reiters sichtbar.
  if (!on && !_rrAllUsers().includes(lc)) _rrExtraUsers.push(lc);
}

/* Positionen im KI-Gremium (KI-Dashboard zeigt sie als Badge an den Genehmigern). */
const KI_GREMIUM_ROLLEN = ['Legal', 'Datenschutz', 'Compliance', 'IT'];

function cfgAdd(role) {
  const inp = document.getElementById('cfg-input-' + role);
  const val = (inp.value || '').trim().toLowerCase();
  if (!val || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { toast('Bitte gültige E-Mail eingeben.', 'error'); return; }
  if (!_cfgEdit[role]) _cfgEdit[role] = [];
  if (_cfgEdit[role].some(x => x.toLowerCase() === val)) { toast('Bereits vorhanden.', 'error'); return; }
  _cfgEdit[role].push(val);
  inp.value = '';
  renderCfgLists();
}

function cfgRemove(role, i) {
  const removed = _cfgEdit[role].splice(i, 1)[0];
  // KI-Gremium: zugehörige Positions-Zuordnung mit entfernen
  if (role === 'kiGenehmiger' && removed && _cfgEdit.kiGenehmigerRollen) {
    delete _cfgEdit.kiGenehmigerRollen[removed];
  }
  renderCfgLists();
}
function cfgAddRole() {
  const inp = document.getElementById('cfg-input-roles');
  const val = (inp.value || '').trim();
  if (!val) return;
  if (!_cfgEdit.roles) _cfgEdit.roles = [];
  if (_cfgEdit.roles.some(x => x.toLowerCase() === val.toLowerCase())) { toast('Rolle existiert bereits.', 'error'); return; }
  _cfgEdit.roles.push(val);
  inp.value = '';
  renderRolesList();
  renderUserRolesList();
}
function cfgRemoveRole(i) {
  const removed = _cfgEdit.roles.splice(i, 1)[0];
  // aus allen Mitarbeiter-Zuordnungen entfernen
  Object.keys(_cfgEdit.userRoles || {}).forEach(upn => {
    _cfgEdit.userRoles[upn] = (_cfgEdit.userRoles[upn] || []).filter(r => r !== removed);
  });
  renderRolesList();
  renderUserRolesList();
}

/** Betriebsrats-Mail eines Werks im Config-Entwurf setzen/entfernen (leer = löschen). */
function mitSetBrMail(code, val) {
  if (!_cfgEdit.brMails || typeof _cfgEdit.brMails !== 'object' || Array.isArray(_cfgEdit.brMails)) _cfgEdit.brMails = {};
  const v = String(val || '').trim();
  if (v) _cfgEdit.brMails[code] = v; else delete _cfgEdit.brMails[code];
}

/** Umfang der Power-Automate-Genehmigung setzen (+ Legacy-Boolean spiegeln). */
function cfgSetPAScope(v) {
  const scope = (v === 'gl' || v === 'alle') ? v : 'aus';
  _cfgEdit.genehmigungPAScope = scope;
  _cfgEdit.genehmigungPA = scope !== 'aus';
}

async function saveCfg() {
  try {
    await spSaveAccessConfig(_cfgEdit);
    setRuntimeConfig(JSON.parse(JSON.stringify(_cfgEdit)));
    initRoleNav();
    toast('Rollen gespeichert ✓', 'success');
  } catch (e) { toast('Fehler beim Speichern: ' + e.message, 'error'); }
}

