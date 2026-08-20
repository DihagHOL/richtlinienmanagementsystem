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

/* ═══════════════════════════════════════════════════
   Einstellungen: zwei Bereiche
   ═══════════════════════════════════════════════════
   Die Reiter-Berechtigungen bekommen einen eigenen Bereich. Als eine Karte
   unter zwölf anderen ging der Überblick verloren, sobald mehr als eine
   Handvoll Personen berechtigt war – und breit genug für eine Matrix war die
   schmale Spalte auch nicht. Der Entwurf (_cfgEdit) überlebt den Wechsel,
   ungespeicherte Änderungen gehen also nicht verloren. */

let _cfgBereich = 'rollen';   // 'rollen' | 'reiter'

function renderEinstellungen() {
  _cfgEdit = getAccessConfig();
  _rrExtra = [];
  _rrOffen = new Set();
  _rrSuche = '';
  _rrReiterFilter = '';
  _cfgRenderBereich();
}

/** Bereich wechseln – ohne den Entwurf zu verlieren. */
function cfgBereich(name) {
  _cfgBereich = (name === 'reiter') ? 'reiter' : 'rollen';
  _cfgRenderBereich();
}

function _cfgBereichLeiste() {
  const seg = (m, label) => {
    const on = _cfgBereich === m;
    return `<button type="button" onclick="cfgBereich('${m}')" style="border:0;padding:8px 18px;font:inherit;font-weight:600;font-size:.85rem;cursor:pointer;background:${on ? 'var(--c-primary)' : 'transparent'};color:${on ? '#fff' : 'var(--c-text)'}">${label}</button>`;
  };
  return `<div style="display:inline-flex;border:1px solid var(--c-border);border-radius:9px;overflow:hidden;margin-bottom:14px">
    ${seg('rollen', 'Rollen &amp; Verfahren')}${seg('reiter', '🔑 Reiter-Berechtigungen')}</div>`;
}

function _cfgRenderBereich() {
  const v = document.getElementById('view-einstellungen');
  if (!v) return;
  const reiter = _cfgBereich === 'reiter';
  v.innerHTML = `
    <div style="max-width:${reiter ? '1100px' : '680px'}">
      ${_cfgBereichLeiste()}
      ${reiter ? _reiterBereichHtml() : _rollenBereichHtml()}
      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-primary" onclick="saveCfg()">Einstellungen speichern</button>
      </div>
    </div>`;
  if (reiter) { rrRenderBody(); return; }
  renderCfgLists();
  renderRolesList();
  renderUserRolesList();
  loadAdDepartments();
}

function _rollenBereichHtml() {
  return `
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
      ${roleCard('govStrukturKoepfe', 'Governance-Struktur: Zeilen &amp; Spalten ändern (Aufbau der Systematik)')}

      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h2>Probelauf (Vorführung &amp; Funktionsprüfung)</h2></div>
        <div class="card-body">
          <div class="field-hint" style="margin-bottom:10px">
            Der Probelauf durchläuft die komplette Kette als <b>echten Vorgang</b>: Es entstehen echte
            Einträge in den Listen, und es gehen echte E-Mails an die hinterlegten Empfänger.
            Alles Angelegte trägt <b>[Probelauf]</b> im Titel und kann anschließend auf einen Klick
            wieder gelöscht werden.<br>
            <b>Admins sind immer freigeschaltet.</b> Hier zusätzliche Personen eintragen.
          </div>
          <div id="cfg-probelaufUser"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <input type="email" id="cfg-input-probelaufUser" placeholder="name@dihag.com"
              style="flex:1;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit"
              onkeydown="if(event.key==='Enter')cfgAdd('probelaufUser')">
            <button class="btn btn-outline btn-sm" onclick="cfgAdd('probelaufUser')">+ Hinzufügen</button>
          </div>
        </div>
      </div>

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
            Mailadressen für die Mitbestimmungsprüfung. Markieren Sie im Regelwerk-Editor den
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

          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--c-border)">
            <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Offene Kenntnisnahmen (Mitarbeitende)</div>
            <div class="field-hint" style="margin-bottom:10px">
              Erinnert die <b>Mitarbeitenden</b> daran, dass ein veröffentlichtes Regelwerk noch zu lesen
              und zu bestätigen ist (samt Wissenstest, falls gefordert). Gezählt wird ab Veröffentlichung;
              jede Person bekommt <b>eine</b> Mail über <b>alle</b> ihre offenen Regelwerke, nicht eine je Regelwerk.
              Betroffen ist nur, wer laut Zielgruppe gemeint ist – und nur solange die Bestätigung fehlt.
            </div>
            <div class="form-grid">
              <div class="form-group"><label>Kenntnisnahme-Erinnerungen</label>
                <select onchange="_cfgEdit.kenntnisErinnerungAktiv=(this.value==='ja')">
                  <option value="ja" ${_cfgEdit.kenntnisErinnerungAktiv !== false ? 'selected' : ''}>Ja – automatisch senden</option>
                  <option value="nein" ${_cfgEdit.kenntnisErinnerungAktiv === false ? 'selected' : ''}>Nein – pausiert</option>
                </select></div>
              <div class="form-group"><label>Erste Erinnerung nach (Tagen)</label>
                <input type="number" min="1" value="${esc(_cfgEdit.kenntnisErsteNachTagen || 7)}" onchange="_cfgEdit.kenntnisErsteNachTagen=parseInt(this.value,10)||7"></div>
              <div class="form-group"><label>Danach alle (Tagen)</label>
                <input type="number" min="1" value="${esc(_cfgEdit.kenntnisDannAlleTage || 7)}" onchange="_cfgEdit.kenntnisDannAlleTage=parseInt(this.value,10)||7"></div>
              <div class="form-group"><label>Eskalation ab (Tagen)</label>
                <input type="number" min="1" value="${esc(_cfgEdit.kenntnisEskalationAbTagen || 21)}" onchange="_cfgEdit.kenntnisEskalationAbTagen=parseInt(this.value,10)||21"></div>
              <div class="form-group full"><label>Eskalation an (leer = Eskalations-Mail oben)</label>
                <input type="email" value="${esc(_cfgEdit.kenntnisEskalationMail || '')}" oninput="_cfgEdit.kenntnisEskalationMail=this.value" placeholder="ims@dihag.com"></div>
            </div>
            <div class="field-hint" style="margin-top:10px">
              Die Eskalation ist eine <b>Sammelmeldung</b> an eine Stelle (nicht an Vorgesetzte): welches Regelwerk
              wie lange offen ist und wer noch fehlt. Voraussetzung ist, dass das Cron-Konto die Mitarbeitenden
              lesen darf (Graph-Anwendungsrecht <code>User.Read.All</code>) – sonst überspringt der Lauf diesen Teil
              und schreibt es ins Protokoll.
            </div>
          </div>
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
          <div class="field-hint" style="margin-bottom:10px">Optional. Die Abteilung aus dem Azure-AD-Profil greift automatisch — hier können Sie einzelnen Personen zusätzliche Rollen zuweisen (z. B. wenn die AD-Abteilung abweicht oder fehlt).</div>
          <div id="cfg-userroles"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <input type="email" id="cfg-input-ur" placeholder="name@dihag.com"
              style="flex:1;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit"
              onkeydown="if(event.key==='Enter')urAddUser()">
            <button class="btn btn-outline btn-sm" onclick="urAddUser()">+ Mitarbeiter</button>
          </div>
        </div>
      </div>`;
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

/* ═══════════════════════════════════════════════════
   Reiter-Berechtigungen (Lesen / Schreiben)
   ═══════════════════════════════════════════════════
   Überblick zuerst: eine Zeile je Person oder Gruppe, ein Kürzel je Reiter
   (– / L / S). Ein Klick auf eine Zelle schaltet weiter, ein Klick auf die
   Zeile klappt die ausführliche Ansicht mit Beschriftungen auf.

   Freigaben gehen an eine Person (E-Mail) oder an eine Gruppe – Sicherheits-,
   Verteiler- oder Microsoft-365-Gruppe.
   Gruppen stehen als „gruppe:<Objekt-ID>" in der Liste – die ID und nicht der
   Name, weil eine umbenannte Gruppe sonst still ihre Rechte verlöre. Der Name
   wird nur zur Anzeige unter `gruppenNamen` mitgeführt. */

let _rrExtra = [];             // Träger ohne (noch) ein Recht – bleiben sichtbar
let _rrOffen = new Set();      // ausgeklappte Zeilen
let _rrSuche = '';
let _rrReiterFilter = '';
let _rrPickerOffen = false;

const _rrFeldStil = 'border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit';

function _reiterBereichHtml() {
  if (typeof GOVERNABLE_TABS === 'undefined') return '';
  return `
    <div class="col-warning" style="display:block">
      <b>Zusätzlicher</b> Zugriff auf einzelne Reiter – für einzelne Personen <b>und für
      Gruppen</b> (Sicherheits-, Verteiler- und Microsoft-365-Gruppen). Additiv zu den
      Standardrechten: <b>Admins</b> haben immer Zugriff,
      <b>Schreiben</b> schließt <b>Lesen</b> ein (nur Lesen = Reiter sichtbar, aber nicht
      bearbeitbar). „Einstellungen" bleibt bewusst Admins vorbehalten.
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-header"><h2>Wer darf welchen Reiter?</h2></div>
      <div class="card-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
          <input type="search" id="rr-suche" placeholder="🔍 Person oder Gruppe suchen …"
            value="${esc(_rrSuche)}" oninput="rrSuche(this.value)"
            style="flex:1;min-width:220px;${_rrFeldStil}">
          <select class="sort-select" onchange="rrReiterFilter(this.value)" aria-label="Nach Reiter filtern">
            <option value="">Alle Reiter</option>
            ${GOVERNABLE_TABS.map(t => `<option value="${t.view}"${_rrReiterFilter === t.view ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
          </select>
        </div>
        <div id="rr-body"></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <input type="email" id="rr-input-user" placeholder="name@dihag.com"
            onkeydown="if(event.key==='Enter')rrAddUser()" style="flex:1;min-width:200px;${_rrFeldStil}">
          <button class="btn btn-outline btn-sm" onclick="rrAddUser()">+ Person</button>
          <button class="btn btn-outline btn-sm" onclick="rrPicker()">👥 + Gruppe</button>
        </div>
        <div id="rr-picker" style="display:none;margin-top:12px;border:1px solid var(--c-border);border-radius:10px;padding:12px"></div>
        <div class="field-hint" id="rr-gruppen-status" style="margin-top:12px">${_rrGruppenStatus()}</div>
      </div>
    </div>`;
}

/** Hinweis, ob gruppenbasierte Freigaben überhaupt greifen können. */
function _rrGruppenStatus() {
  const lesbar = (typeof spGruppenLesbar === 'function') ? spGruppenLesbar() : null;
  const n = ((typeof State !== 'undefined' && State.myGroups) || []).length;
  if (lesbar === false) {
    return '⚠ Die Gruppen-Mitgliedschaften Ihres Kontos konnten nicht gelesen werden – '
      + 'gruppenbasierte Freigaben greifen dann nicht. Freigaben an einzelne Personen sind davon unberührt.';
  }
  if (lesbar === true) {
    return `Gruppen-Auswertung aktiv – Ihr Konto gehört zu ${n} Gruppe(n) `
      + '(Sicherheits-, Verteiler- und Microsoft-365-Gruppen). Dynamische Verteilerlisten aus '
      + 'Exchange lassen sich nicht berechtigen: Sie existieren nur dort, nicht im Verzeichnis.';
  }
  return '';
}

/* ── Träger, Stufen, Filter (rein rechnend – ohne DOM) ── */

/** Anzeigename einer Gruppe aus dem Entwurf. */
function _rrGruppenName(id) {
  return ((_cfgEdit && _cfgEdit.gruppenNamen) || {})[String(id).toLowerCase()] || id;
}

/** Beschriftung der Gruppenart aus dem Entwurf (unbekannt → schlicht „Gruppe"). */
function _rrGruppenArtLabel(id) {
  const art = ((_cfgEdit && _cfgEdit.gruppenTypen) || {})[String(id).toLowerCase()] || '';
  return (typeof gruppenArtLabel === 'function') ? gruppenArtLabel(art) : 'Gruppe';
}

/** Alle Träger: was in den Listen steht plus frisch Hinzugefügtes. */
function _rrEintraege() {
  const set = new Set(_rrExtra);
  for (const v of Object.values((_cfgEdit && _cfgEdit.reiterRechte) || {})) {
    (v.lesen || []).forEach(x => set.add(String(x).toLowerCase()));
    (v.schreiben || []).forEach(x => set.add(String(x).toLowerCase()));
  }
  return [...set]
    .map(key => (typeof istGruppenEintrag === 'function' && istGruppenEintrag(key))
      ? { key, art: 'gruppe', name: _rrGruppenName(gruppenIdVon(key)) }
      : { key, art: 'person', name: key })
    .sort((a, b) => (a.art === b.art)
      ? String(a.name).localeCompare(String(b.name), 'de')
      : (a.art === 'gruppe' ? -1 : 1));      // Gruppen zuerst: sie betreffen mehrere
}

/** Recht eines Trägers auf einem Reiter: '-' | 'L' | 'S'. */
function _rrStufe(view, key) {
  const e = (((_cfgEdit && _cfgEdit.reiterRechte) || {})[view]) || {};
  const drin = (arr) => (arr || []).some(x => String(x).toLowerCase() === key);
  if (drin(e.schreiben)) return 'S';
  if (drin(e.lesen)) return 'L';
  return '-';
}

/** Suche (Name/E-Mail) und Reiter-Filter anwenden. */
function _rrGefiltert(eintraege, suche, reiter) {
  const q = String(suche || '').toLowerCase().trim();
  return (eintraege || []).filter(e => {
    if (q && !String(e.name).toLowerCase().includes(q) && !String(e.key).toLowerCase().includes(q)) return false;
    if (reiter && _rrStufe(reiter, e.key) === '-') return false;
    return true;
  });
}

/* ── Anzeige ── */

function rrSuche(v) { _rrSuche = v || ''; rrRenderBody(); }
function rrReiterFilter(v) { _rrReiterFilter = v || ''; rrRenderBody(); }
function rrToggleOffen(key) {
  if (_rrOffen.has(key)) _rrOffen.delete(key); else _rrOffen.add(key);
  rrRenderBody();
}

function rrRenderBody() {
  const host = document.getElementById('rr-body');
  if (!host) return;
  const alle = _rrEintraege();
  if (!alle.length) {
    host.innerHTML = '<div class="field-hint">Noch niemand zusätzlich berechtigt – unten eine Person '
      + 'oder eine Gruppe hinzufügen, dann in der Zeile die Reiter freigeben.</div>';
    return;
  }
  const zeilen = _rrGefiltert(alle, _rrSuche, _rrReiterFilter);
  const kopf = `<tr style="text-align:left;color:var(--c-muted);font-size:.75rem">
      <th style="padding:6px 8px;position:sticky;left:0;background:var(--c-bg);min-width:230px">Person / Gruppe</th>
      ${GOVERNABLE_TABS.map(t => `<th title="${esc(t.label)}" style="padding:6px 4px;text-align:center;font-weight:600">${esc(t.kurz || t.label)}</th>`).join('')}
      <th style="width:38px"></th></tr>`;

  const zelle = (t, e) => {
    const st = _rrStufe(t.view, e.key);
    const farbe = st === 'S' ? 'background:var(--c-primary);color:#fff'
      : st === 'L' ? 'background:#e3edf7;color:var(--c-primary)'
      : 'color:var(--c-muted)';
    const titel = `${e.name} · ${t.label}: ${st === 'S' ? 'Schreiben' : st === 'L' ? 'Lesen' : 'kein Zugriff'} (klicken zum Weiterschalten)`;
    return `<td style="padding:3px 4px;text-align:center">
      <button type="button" onclick="rrCycle('${t.view}','${esc(e.key)}')" title="${esc(titel)}"
        style="border:1px solid var(--c-border);border-radius:6px;width:30px;height:26px;cursor:pointer;font:inherit;font-size:.75rem;font-weight:700;${farbe}">${st === '-' ? '–' : st}</button></td>`;
  };

  const detail = (e) => `<tr><td colspan="${GOVERNABLE_TABS.length + 2}" style="padding:0 8px 12px">
      <div style="border:1px solid var(--c-border);border-radius:10px;padding:10px 12px;background:var(--c-bg-soft,transparent)">
        <table style="border-collapse:collapse;font-size:.83rem;width:100%">
          <thead><tr style="text-align:left;color:var(--c-muted)">
            <th style="padding:3px 8px">Reiter</th>
            <th style="padding:3px 8px;text-align:center;width:90px">Lesen</th>
            <th style="padding:3px 8px;text-align:center;width:90px">Schreiben</th></tr></thead>
          <tbody>${GOVERNABLE_TABS.map(t => {
            const st = _rrStufe(t.view, e.key);
            return `<tr>
              <td style="padding:3px 8px">${esc(t.label)}</td>
              <td style="padding:3px 8px;text-align:center"><input type="checkbox" ${st !== '-' ? 'checked' : ''} onchange="rrToggle('${t.view}','lesen','${esc(e.key)}',this.checked)"></td>
              <td style="padding:3px 8px;text-align:center"><input type="checkbox" ${st === 'S' ? 'checked' : ''} onchange="rrToggle('${t.view}','schreiben','${esc(e.key)}',this.checked)"></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div></td></tr>`;

  const koerper = zeilen.map(e => {
    const offen = _rrOffen.has(e.key);
    const anzahl = GOVERNABLE_TABS.filter(t => _rrStufe(t.view, e.key) !== '-').length;
    const zusatz = e.art === 'gruppe'
      ? `<span class="field-hint" style="font-weight:400"> · ${esc(_rrGruppenArtLabel(gruppenIdVon(e.key)))}</span>` : '';
    return `<tr>
        <td style="padding:5px 8px;position:sticky;left:0;background:var(--c-bg)">
          <div style="display:flex;align-items:center;gap:6px">
            <button type="button" onclick="rrToggleOffen('${esc(e.key)}')" aria-expanded="${offen}"
              title="Einzelne Reiter mit Beschriftung anzeigen"
              style="border:0;background:none;cursor:pointer;font:inherit;color:var(--c-muted);padding:0 2px">${offen ? '▾' : '▸'}</button>
            <span>${e.art === 'gruppe' ? '👥' : '👤'}</span>
            <span style="min-width:0;overflow-wrap:anywhere"><b>${esc(e.name)}</b>${zusatz}
              <span class="field-hint" style="font-weight:400"> · ${anzahl} Reiter</span></span>
          </div></td>
        ${GOVERNABLE_TABS.map(t => zelle(t, e)).join('')}
        <td style="padding:5px 4px;text-align:right">
          <button class="btn btn-ghost btn-sm" onclick="rrRemove('${esc(e.key)}')" title="Alle Reiter-Rechte dieses Eintrags entfernen">✕</button></td>
      </tr>${offen ? detail(e) : ''}`;
  }).join('');

  const personen = alle.filter(e => e.art === 'person').length;
  const gruppen = alle.length - personen;
  const freigaben = alle.reduce((n, e) => n + GOVERNABLE_TABS.filter(t => _rrStufe(t.view, e.key) !== '-').length, 0);
  const kopfzeile = `<div class="field-hint" style="margin-bottom:8px">
      ${personen} Person(en), ${gruppen} Gruppe(n) · ${freigaben} Freigabe(n)
      ${zeilen.length !== alle.length ? ` · <b>${zeilen.length}</b> passen zum Filter` : ''}
      · <b>L</b> = Lesen, <b>S</b> = Schreiben</div>`;

  host.innerHTML = kopfzeile + (zeilen.length
    ? `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:.83rem">
         <thead>${kopf}</thead><tbody>${koerper}</tbody></table></div>`
    : '<div class="field-hint">Keine Treffer für Suche/Filter.</div>');
}

/* ── Ändern ── */

/** Stufe setzen; 'S' schließt 'L' ein. Der Eintrag bleibt sichtbar, auch wenn nichts mehr gesetzt ist. */
function _rrSetzen(view, key, stufe) {
  if (!_cfgEdit.reiterRechte) _cfgEdit.reiterRechte = {};
  const e = _cfgEdit.reiterRechte[view] = _cfgEdit.reiterRechte[view] || { lesen: [], schreiben: [] };
  const ohne = (arr) => (arr || []).filter(x => String(x).toLowerCase() !== key);
  e.lesen = ohne(e.lesen);
  e.schreiben = ohne(e.schreiben);
  if (stufe === 'L') e.lesen.push(key);
  if (stufe === 'S') { e.schreiben.push(key); e.lesen.push(key); }
  if (!_rrExtra.includes(key)) _rrExtra.push(key);
  rrRenderBody();
}

/** Zelle weiterschalten: kein Zugriff → Lesen → Schreiben → kein Zugriff. */
function rrCycle(view, key) {
  const jetzt = _rrStufe(view, key);
  _rrSetzen(view, key, jetzt === '-' ? 'L' : jetzt === 'L' ? 'S' : '-');
}

function rrToggle(view, kind, key, on) {
  const jetzt = _rrStufe(view, key);
  let neu;
  if (kind === 'schreiben') neu = on ? 'S' : (jetzt === 'S' ? 'L' : jetzt);
  else neu = on ? (jetzt === 'S' ? 'S' : 'L') : '-';
  _rrSetzen(view, key, neu);
}

function rrRemove(key) {
  const lc = String(key).toLowerCase();
  _rrExtra = _rrExtra.filter(x => x !== lc);
  _rrOffen.delete(lc);
  for (const v of Object.values(_cfgEdit.reiterRechte || {})) {
    if (Array.isArray(v.lesen))     v.lesen     = v.lesen.filter(x => String(x).toLowerCase() !== lc);
    if (Array.isArray(v.schreiben)) v.schreiben = v.schreiben.filter(x => String(x).toLowerCase() !== lc);
  }
  if (typeof istGruppenEintrag === 'function' && istGruppenEintrag(lc)) {
    const gid = gruppenIdVon(lc);
    if (_cfgEdit.gruppenNamen) delete _cfgEdit.gruppenNamen[gid];
    if (_cfgEdit.gruppenTypen) delete _cfgEdit.gruppenTypen[gid];
  }
  rrRenderBody();
}

function rrAddUser() {
  const inp = document.getElementById('rr-input-user');
  const val = (inp.value || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { toast('Bitte gültige E-Mail eingeben.', 'error'); return; }
  if (_rrEintraege().some(e => e.key === val)) { toast('Bereits vorhanden.', 'error'); return; }
  _rrExtra.push(val);
  _rrOffen.add(val);        // gleich aufgeklappt: die Rechte müssen ja noch gesetzt werden
  inp.value = '';
  rrRenderBody();
}

/* ── Gruppen auswählen ── */

function rrPicker() {
  _rrPickerOffen = !_rrPickerOffen;
  const host = document.getElementById('rr-picker');
  if (!host) return;
  host.style.display = _rrPickerOffen ? '' : 'none';
  if (!_rrPickerOffen) return;
  host.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input type="search" id="rr-gruppe-suche" placeholder="Gruppenname oder Adresse (mind. 2 Zeichen)"
        onkeydown="if(event.key==='Enter')rrGruppenSuche()" style="flex:1;min-width:200px;${_rrFeldStil}">
      <button class="btn btn-outline btn-sm" onclick="rrGruppenSuche()">Suchen</button>
    </div>
    <div id="rr-gruppen-treffer" style="margin-top:10px"></div>
    <details style="margin-top:10px">
      <summary style="cursor:pointer;font-size:.83rem;color:var(--c-muted)">Gruppe direkt per Objekt-ID eintragen</summary>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <input type="text" id="rr-gruppe-id" placeholder="Objekt-ID (GUID aus Entra)" style="flex:1;min-width:240px;${_rrFeldStil}">
        <input type="text" id="rr-gruppe-name" placeholder="Anzeigename" style="flex:1;min-width:160px;${_rrFeldStil}">
        <select id="rr-gruppe-art" class="sort-select" aria-label="Art der Gruppe">
          <option value="sicherheit">Sicherheitsgruppe</option>
          <option value="verteiler">Verteilergruppe</option>
          <option value="m365">Microsoft-365-Gruppe</option>
        </select>
        <button class="btn btn-outline btn-sm" onclick="rrAddGruppeManuell()">+ Übernehmen</button>
      </div>
      <div class="field-hint" style="margin-top:6px">Entra-Portal → Gruppen → Gruppe öffnen → „Objekt-ID".</div>
    </details>`;
}

async function rrGruppenSuche() {
  const q = (document.getElementById('rr-gruppe-suche')?.value || '').trim();
  const host = document.getElementById('rr-gruppen-treffer');
  if (!host) return;
  if (q.length < 2) { host.innerHTML = '<div class="field-hint">Bitte mindestens zwei Zeichen eingeben.</div>'; return; }
  host.innerHTML = '<div class="doc-loading">Suche …</div>';
  let treffer = [], hinweis = '';
  try {
    treffer = await spSearchGroups(q);
  } catch (e) {
    // Ohne Verzeichnis-Leserecht: wenigstens die eigenen Gruppen anbieten.
    const eigen = ((typeof State !== 'undefined' && State.myGroups) || []);
    treffer = eigen.filter(g => String(g.name || '').toLowerCase().includes(q.toLowerCase()));
    hinweis = 'Dieses Konto darf das Verzeichnis nicht durchsuchen – gezeigt werden Ihre eigenen Gruppen. '
      + 'Andere Gruppen unten per Objekt-ID eintragen.';
  }
  const schon = new Set(_rrEintraege().filter(e => e.art === 'gruppe').map(e => gruppenIdVon(e.key)));
  const label = (art) => (typeof gruppenArtLabel === 'function') ? gruppenArtLabel(art) : 'Gruppe';
  host.innerHTML = (hinweis ? `<div class="field-hint" style="margin-bottom:8px">${esc(hinweis)}</div>` : '')
    + (treffer.length
      ? treffer.map(g => `<div class="dp-row" style="cursor:default">
          <span class="ic">${g.art === 'verteiler' ? '📧' : '👥'}</span>
          <span class="nm">${esc(g.name || g.id)}
            <span class="field-hint">${esc(label(g.art))}${g.mail ? ' · ' + esc(g.mail) : ''}</span></span>
          ${schon.has(g.id)
            ? '<span class="status-badge sb-done">bereits berechtigt</span>'
            : `<button class="btn btn-outline btn-sm"
                onclick="rrAddGruppe('${esc(g.id)}','${esc(g.name || g.id)}','${esc(g.art || '')}')">+ Übernehmen</button>`}
        </div>`).join('')
      : '<div class="field-hint">Keine Gruppe gefunden – auch nicht unter dieser Adresse.</div>');
}

function rrAddGruppe(id, name, art) {
  const gid = String(id || '').toLowerCase().trim();
  if (!gid) return;
  const key = RECHT_GRUPPE + gid;
  if (!_cfgEdit.gruppenNamen) _cfgEdit.gruppenNamen = {};
  if (!_cfgEdit.gruppenTypen) _cfgEdit.gruppenTypen = {};
  _cfgEdit.gruppenNamen[gid] = name || gid;
  if (art) _cfgEdit.gruppenTypen[gid] = art;
  if (_rrEintraege().some(e => e.key === key)) { toast('Bereits vorhanden.', 'error'); return; }
  _rrExtra.push(key);
  _rrOffen.add(key);
  _rrPickerOffen = false;
  const host = document.getElementById('rr-picker');
  if (host) host.style.display = 'none';
  rrRenderBody();
  toast(`Gruppe „${name || gid}" hinzugefügt – Reiter freigeben und speichern.`, 'success');
}

function rrAddGruppeManuell() {
  const id = (document.getElementById('rr-gruppe-id')?.value || '').trim().toLowerCase();
  const name = (document.getElementById('rr-gruppe-name')?.value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    toast('Bitte die Objekt-ID der Gruppe eingeben (GUID).', 'error'); return;
  }
  rrAddGruppe(id, name || id, (document.getElementById('rr-gruppe-art')?.value || '').trim());
}

/** Namen und Arten von Gruppen, die nirgends mehr berechtigt sind, beim Speichern wegräumen. */
function _rrGruppenNamenAufraeumen(cfg) {
  if (!cfg) return;
  const benutzt = new Set();
  for (const v of Object.values(cfg.reiterRechte || {})) {
    [...(v.lesen || []), ...(v.schreiben || [])].forEach(x => {
      if (typeof istGruppenEintrag === 'function' && istGruppenEintrag(x)) benutzt.add(gruppenIdVon(x));
    });
  }
  for (const feld of ['gruppenNamen', 'gruppenTypen']) {
    if (!cfg[feld]) continue;
    for (const id of Object.keys(cfg[feld])) if (!benutzt.has(id)) delete cfg[feld][id];
  }
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
    _rrGruppenNamenAufraeumen(_cfgEdit);
    await spSaveAccessConfig(_cfgEdit);
    setRuntimeConfig(JSON.parse(JSON.stringify(_cfgEdit)));
    initRoleNav();
    toast('Rollen gespeichert ✓', 'success');
  } catch (e) { toast('Fehler beim Speichern: ' + e.message, 'error'); }
}

