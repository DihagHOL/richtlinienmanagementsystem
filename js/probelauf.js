/**
 * Probelauf – ein echter Vorgang zur Vorführung und Funktionsprüfung
 * ==================================================================
 * Hier wird nichts nachgebaut und nichts umgeleitet: Der Probelauf legt einen
 * <b>echten</b> Vorgang auf den echten SharePoint-Listen an und durchläuft ihn
 * mit dem normalen Code – Konzept, Entwurf, Konformitätsprüfung, Mitbestimmung,
 * Freigabe, Kenntnisnahme, Historie. Die E-Mails gehen über Microsoft Graph an
 * die hinterlegten Empfänger, mit echtem Dokument als Anhang und Fundstelle in
 * SharePoint.
 *
 * Das ist möglich, solange das System noch nicht ausgerollt ist: Der Bestand
 * ist leer, ein zusätzlicher Vorgang stört niemanden. Damit er hinterher
 * spurlos verschwindet, gilt:
 *
 *   1. Alles, was im Probelauf entsteht, trägt „[Probelauf]" im Titel –
 *      und zwar in den Daten, nicht per Sonderbehandlung. Dadurch steht die
 *      Kennzeichnung automatisch in Betreff, Mailtext und jeder Ansicht.
 *   2. Jeder angelegte Eintrag wird mitgeschrieben. „Aufräumen" löscht genau
 *      diese Einträge wieder – nichts anderes.
 *
 * Zugang nur für Freigeschaltete: Administratoren sowie die in den
 * Einstellungen unter „Probelauf" hinterlegten Personen (siehe darfProbelauf()).
 *
 * Start: Knopf in der Anleitung oder ?probelauf=1.
 */

/** Kennzeichnung im Titel – sie zieht sich von allein durch Mails und Ansichten. */
const PROBELAUF_PRAEFIX = '[Probelauf] ';

const PROBELAUF_SPUR = 'rms_probelauf_spur';   // angelegte Einträge (zum Aufräumen)
const PROBELAUF_AN = 'rms_probelauf_an';       // läuft gerade einer? (überlebt Neuladen und neue Tabs)

let _plAn = false;
let _plSpur = { policies: [], acks: [], dateien: [] };
let _plEchtSavePolicy = null;
let _plEchtSaveAck = null;
let _plEchtSendMail = null;

/** Läuft gerade ein Probelauf? */
function probelaufAktiv() { return _plAn; }

/**
 * Soll nach der Anmeldung ein Probelauf gestartet werden?
 * Nicht nur über die Adresse: Wer aus einer Mail heraus in einem neuen Tab
 * landet, hat den Parameter nicht dabei – der Probelauf soll trotzdem
 * weiterlaufen, bis er ausdrücklich beendet wird.
 */
function probelaufGewuenscht() {
  if (/[?&]probelauf=1(&|$)/.test(location.search)) return true;
  try { return localStorage.getItem(PROBELAUF_AN) === '1'; } catch (e) { return false; }
}

/**
 * Aufgeräumte Navigation für die Aufnahme: Im Probelauf bleiben nur die Reiter
 * stehen, die ohnehin jede und jeder sieht – plus <b>Regelwerk Dashboard</b> und
 * <b>Freigaben</b>, ohne die sich die Vorführung nicht zeigen ließe.
 *
 * Grund: Im Lernvideo verwirrt eine Leiste voller Reiter, die die Zuschauer nie
 * zu sehen bekommen. Beendet man den Probelauf, lädt die Seite neu – dann ist
 * wieder alles da.
 */
/* Festgelegt ist, was bleibt, nicht was weg muss. Mit einer Liste der
   auszublendenden Reiter rutschte jeder neue Reiter durch, bis ihn jemand
   nachtrug; so bleibt er von allein weg. „Vorschläge" bleibt ausdrücklich:
   Einen Änderungsvorschlag einzureichen ist etwas, das jede:r tut – genau der
   Teil, den ein Lernvideo zeigen soll. Links ohne eigene Ansicht (KI-Dashboard,
   DIHAG-Apps) sieht ohnehin jede und jeder, sie bleiben stehen. */
const PROBELAUF_NAV_BLEIBT = ['meine', 'wissen', 'anleitung', 'dokumentation', 'verwaltung', 'freigaben', 'vorschlaege'];

function probelaufNavFiltern() {
  if (!_plAn) return;
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    if (!PROBELAUF_NAV_BLEIBT.includes(el.getAttribute('data-view'))) el.style.display = 'none';
  });
  // Eine Gruppen-Überschrift ohne sichtbaren Reiter darunter fällt mit weg.
  document.querySelectorAll('.nav-sep').forEach(sep => {
    let el = sep.nextElementSibling, sichtbar = false;
    while (el && !el.classList.contains('nav-sep')) {
      if (el.classList.contains('nav-item') && el.style.display !== 'none') { sichtbar = true; break; }
      el = el.nextElementSibling;
    }
    if (!sichtbar) sep.style.display = 'none';
  });
}

/* ── Was der Probelauf außer sich selbst braucht ──
   Der Selbsttest geht die ganze Kette durch (konzepte.js, freigaben.js …), die
   Führung lebt in tour.js. Seit die Module erst beim Reiterwechsel kommen, war
   davon beim Start über ?probelauf=1 nichts da: „Geführte Vorführung" und
   „Selbsttest" liefen ins Leere. Geladen wird deshalb gleich beim Aktivieren,
   im Hintergrund, und jeder Knopf im Streifen wartet darauf. */
let _plModule = null;

function probelaufModule() {
  if (!_plModule) {
    const laden = (typeof modulFuerAnsicht === 'function') ? modulFuerAnsicht('probelauf') : Promise.resolve();
    _plModule = laden.catch(e => { _plModule = null; throw e; });   // beim nächsten Klick neu versuchen
  }
  return _plModule;
}

/** Auf die Module warten. → false, wenn sie nicht ladbar sind (dann mit Meldung). */
async function _plMitModulen() {
  try { await probelaufModule(); return true; } catch (e) {
    toast('Der Probelauf konnte nicht alles laden (' + e.message + '). Bitte die Seite neu laden.', 'error');
    return false;
  }
}

/** „▶ Geführte Vorführung" und „↺" im Streifen. */
async function probelaufTour(vonVorn) {
  if (!(await _plMitModulen())) return;
  if (vonVorn) tourNeu(); else tourStart();
}

/** Merken bzw. vergessen, dass gerade ein Probelauf läuft. */
function _plLaufMerken(an) {
  try { if (an) localStorage.setItem(PROBELAUF_AN, '1'); else localStorage.removeItem(PROBELAUF_AN); } catch (e) { /* gesperrt */ }
}

/** UPN der angemeldeten Person (für die Empfängerübersicht). */
function _plIch() { return (typeof State !== 'undefined' && State.user) ? State.user.upn : ''; }

/** Titel mit der Probelauf-Kennzeichnung versehen (doppelt schadet nicht). */
function probelaufTitel(titel) {
  const t = String(titel || '').trim();
  return t.startsWith(PROBELAUF_PRAEFIX) ? t : PROBELAUF_PRAEFIX + t;
}

/* ═══════════════════════════════════════════════════
   Start: erst zeigen, was passiert – dann starten
═══════════════════════════════════════════════════ */

function probelaufStart() {
  if (typeof darfProbelauf === 'function' && !darfProbelauf()) { probelaufKeinZugriff(); return; }

  const liste = (a) => (a || []).filter(Boolean).join(', ') || '– niemand hinterlegt –';
  const pruefer = (typeof getPruefer === 'function') ? getPruefer() : [];
  const gl = (typeof getGeschaeftsleitung === 'function') ? getGeschaeftsleitung() : [];
  const kbr = (typeof getKbrMail === 'function' && getKbrMail()) ? [getKbrMail()] : [];

  openModal(`
    <div class="modal-header">
      <h3>Probelauf starten</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div class="pl-warnung">
        <b>Das wird ein echter Vorgang.</b> Es entstehen echte Einträge in den SharePoint-Listen,
        und es gehen echte E-Mails raus – nicht simuliert.
      </div>
      <p style="margin:14px 0 8px;line-height:1.6">Sinnvoll, solange das System noch nicht ausgerollt ist:
      So zeigt die Vorführung wirklich das, was später passiert, und prüft nebenbei die ganze Kette
      einschließlich Mailversand und Dokument-Anhang.</p>

      <div style="font-weight:600;font-size:.84rem;margin:14px 0 6px">E-Mails gehen an</div>
      <table class="pl-tabelle">
        <tr><td>Konzeptprüfung (Geschäftsleitung)</td><td>${esc(liste(gl))}</td></tr>
        <tr><td>Entscheidung zum Konzept</td><td>${esc(_plIch() || '–')} <span class="field-hint">(einreichende Person)</span></td></tr>
        <tr><td>Konformitätsprüfung</td><td>${esc(liste(pruefer))}</td></tr>
        <tr><td>Mitbestimmung (KBR)</td><td>${esc(liste(kbr))}</td></tr>
        <tr><td>Freigabe (Geschäftsleitung)</td><td>${esc(liste(gl))}</td></tr>
      </table>
      <div class="field-hint" style="margin-top:6px">Pflegbar unter Einstellungen. Wer hier steht,
      bekommt die Nachrichten tatsächlich zugestellt.</div>

      <div style="font-weight:600;font-size:.84rem;margin:16px 0 6px">Damit nichts zurückbleibt</div>
      <ul style="margin:0;padding-left:19px;font-size:.85rem;line-height:1.65;color:var(--c-muted)">
        <li>Alles, was entsteht, heißt <code>${esc(PROBELAUF_PRAEFIX)}…</code> – auch im Betreff der Mails.</li>
        <li>Die angelegten Einträge werden mitgeschrieben; <b>„Aufräumen"</b> löscht genau diese wieder.</li>
        <li>Die Belegschaft bekommt davon nichts mit: Unter „Meine Regelwerke" sehen Probelauf-Einträge nur
          Freigeschaltete, die Bekanntgabe geht nur an Sie, und der tägliche Erinnerungslauf lässt sie aus.</li>
        <li>Bereits versendete E-Mails lassen sich naturgemäß nicht zurückholen.</li>
      </ul>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-outline" onclick="closeModal();location.href=location.pathname+'?probelauf=1'">
        Nur starten</button>
      <button class="btn btn-primary" onclick="closeModal();location.href=location.pathname+'?probelauf=1&tour=1'">
        Starten &amp; Schritt für Schritt führen</button>
    </div>`, true);
}

/**
 * Beenden. Stehen noch Einträge in den Listen, wird Aufräumen gleich mit
 * angeboten – sonst bleiben sie liegen, weil man es danach vergisst.
 */
async function probelaufBeenden() {
  const offen = probelaufAnzahl();
  if (!offen) {
    const ja = (typeof uiConfirm === 'function')
      ? await uiConfirm('Die Seite lädt danach ohne Probelauf neu.', { title: 'Probelauf beenden', okLabel: 'Beenden' })
      : confirm('Probelauf beenden?');
    if (ja) _plBeendenJetzt();
    return;
  }
  openModal(`
    <div class="modal-header">
      <h3>Probelauf beenden</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <p style="margin:0 0 10px;line-height:1.6">Es sind <b>${offen} ${offen === 1 ? 'Eintrag' : 'Einträge'}</b> entstanden,
        die noch in den Listen stehen. „Aufräumen und beenden" löscht sie vorher.</p>
      <div class="pl-warnung">Versendete E-Mails bleiben in den Postfächern, sie lassen sich nicht zurückholen.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-outline" onclick="closeModal();_plBeendenJetzt()">Nur beenden</button>
      <button class="btn btn-primary" onclick="probelaufAufraeumenUndBeenden()">Aufräumen und beenden</button>
    </div>`, true);
}

function _plBeendenJetzt() {
  _plLaufMerken(false);
  if (typeof tourStandVergessen === 'function') tourStandVergessen();
  location.href = location.pathname;
}

async function probelaufAufraeumenUndBeenden() {
  await probelaufLoeschen();
  if (probelaufAnzahl()) { toast('Nicht alles ließ sich löschen. Der Probelauf bleibt offen, „🧹 Aufräumen" versucht es erneut.', 'error'); return; }
  _plBeendenJetzt();
}

function probelaufKeinZugriff() {
  openModal(`
    <div class="modal-header">
      <h3>Probelauf nicht freigeschaltet</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <p style="margin:0 0 12px;line-height:1.6">Der Probelauf legt echte Einträge an und versendet echte
      E-Mails. Er ist deshalb nur für ausdrücklich freigeschaltete Personen nutzbar.</p>
      <p style="margin:0;line-height:1.6">Freischaltung über <b>Einstellungen → Probelauf</b>
      (durch eine Administratorin oder einen Administrator).</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal()">Verstanden</button>
    </div>`);
}

/* ═══════════════════════════════════════════════════
   Aktivierung
═══════════════════════════════════════════════════ */

/**
 * Probelauf einschalten: Zugriff prüfen, Buchführung anhängen, Streifen zeigen.
 * Die Datenschicht bleibt unangetastet – es wird nichts ersetzt, nur mitgezählt.
 * Die Anwendung läuft danach ganz normal weiter; der Rückgabewert sagt nur, ob
 * der Modus wirklich aktiv ist.
 * @returns true, wenn der Probelauf läuft
 */
async function probelaufAktivieren() {
  if (_plAn) return true;
  if (typeof darfProbelauf === 'function' && !darfProbelauf()) { probelaufKeinZugriff(); return false; }

  _plAn = true;
  _plLaufMerken(true);
  _plSpurLaden();
  _plBuchfuehrung();
  _plBanner();
  probelaufNavFiltern();

  // Die Anwendung startet derweil normal weiter; erst danach kommt die Führung.
  probelaufModule().then(() => {
    _plBannerAktualisieren();   // Knopftext der Führung kennt erst tour.js
    if (/[?&]tour=1(&|$)/.test(location.search) && typeof tourStart === 'function') setTimeout(() => tourStart(), 600);
  }).catch(e => toast('Der Probelauf konnte nicht alles laden (' + e.message + '). Bitte die Seite neu laden.', 'error'));
  return true;
}

/* ═══════════════════════════════════════════════════
   Buchführung: was ist in diesem Probelauf entstanden?
   ═══════════════════════════════════════════════════
   Bewusst nur ein dünner Mantel um die echten Funktionen: Sie werden ganz
   normal aufgerufen, es wird lediglich notiert, was neu dazugekommen ist.
   Nur so lässt sich der Probelauf hinterher rückstandsfrei entfernen. */

function _plBuchfuehrung() {
  if (_plEchtSavePolicy) return;                     // nur einmal anhängen
  _plEchtSavePolicy = window.spSavePolicy;
  _plEchtSaveAck = window.spSaveAcknowledgement;

  window.spSavePolicy = async (p) => {
    const neu = !p.id;
    const res = await _plEchtSavePolicy(p);
    if (neu && res && res.id && !_plSpur.policies.includes(String(res.id))) {
      _plSpur.policies.push(String(res.id));
      _plSpurSpeichern();
    }
    return res;
  };

  window.spSaveAcknowledgement = async (a) => {
    const neu = !a.id;
    const res = await _plEchtSaveAck(a);
    if (neu && res && res.id && !_plSpur.acks.includes(String(res.id))) {
      _plSpur.acks.push(String(res.id));
      _plSpurSpeichern();
    }
    return res;
  };

  // Mails ebenso: verschickt wird ganz normal, notiert wird Betreff, Empfänger
  // und ob Graph sie angenommen hat. Der Selbsttest liest daraus, ob die Kette
  // wirklich jemanden erreicht hat – nicht nur, ob Empfänger hinterlegt sind.
  _plEchtSendMail = window.spSendMail;
  if (typeof _plEchtSendMail === 'function') {
    window.spSendMail = (an, betreff, html, anhaenge, cc, ...rest) => {
      const m = { an: [].concat(an || []).filter(Boolean), cc: [].concat(cc || []).filter(Boolean),
        betreff: String(betreff || ''), anhang: !!(anhaenge && anhaenge.length), status: 'laeuft', fehler: '' };
      _plMails.push(m);
      const lauf = Promise.resolve().then(() => _plEchtSendMail(an, betreff, html, anhaenge, cc, ...rest)).then(r => {
        if (r === false) { m.status = 'fehler'; m.fehler = 'Zustimmung zum Mailversand fehlt (Anmeldung läuft)'; } else m.status = 'ok';
        return r;
      }, e => { m.status = 'fehler'; m.fehler = (e && e.message) || String(e); throw e; });
      _plMailOffen.add(lauf);
      lauf.then(() => _plMailOffen.delete(lauf), () => _plMailOffen.delete(lauf));
      return lauf;
    };
  }
}

/* Die Mails dieses Probelaufs: { an, cc, betreff, anhang, status: 'laeuft'|'ok'|'fehler', fehler } */
let _plMails = [];
const _plMailOffen = new Set();
let _plMailRuheMs = 1500;   // so lange darf keine neue Mail kommen, bevor der Bericht steht

/**
 * Auf die letzten Mails warten. Manche Schritte schicken ihre Mail, ohne darauf
 * zu warten (notifyGL nach der Mitbestimmung), und laden vorher noch das
 * Dokument als Anhang. Fertig ist es erst, wenn eine Weile nichts mehr kommt.
 */
async function _plMailsAbwarten(maxMs) {
  const ende = Date.now() + (maxMs || 20000);
  let zuletzt = -1;
  while (Date.now() < ende) {
    if (!_plMailOffen.size && _plMails.length === zuletzt) return;
    zuletzt = _plMails.length;
    await new Promise(r => setTimeout(r, _plMailRuheMs));
  }
}

function _plSpurSpeichern() {
  try { localStorage.setItem(PROBELAUF_SPUR, JSON.stringify(_plSpur)); } catch (e) { /* egal */ }
  _plBannerAktualisieren();
}

function _plSpurLaden() {
  try {
    const o = JSON.parse(localStorage.getItem(PROBELAUF_SPUR) || 'null');
    if (o && Array.isArray(o.policies)) {
      _plSpur = { policies: o.policies, acks: o.acks || [], dateien: o.dateien || [] };
    }
  } catch (e) { /* frisch anfangen */ }
}

function _plSpurLeeren() {
  _plSpur = { policies: [], acks: [], dateien: [] };
  try { localStorage.removeItem(PROBELAUF_SPUR); } catch (e) { /* egal */ }
  _plBannerAktualisieren();
}

/** Wie viele Einträge hat dieser Probelauf angelegt? */
function probelaufAnzahl() { return _plSpur.policies.length + _plSpur.acks.length + _plSpur.dateien.length; }

/* ═══════════════════════════════════════════════════
   Aufräumen
═══════════════════════════════════════════════════ */

/**
 * Probelauf-Einträge, die nicht in der Spur dieses Browsers stehen: angelegt
 * in einem anderen Browser, oder die Spur ging mit dem Browserspeicher
 * verloren. Erkennbar sind sie trotzdem, denn die Kennzeichnung steht im Titel.
 */
function _plReste() {
  const inSpur = new Set(_plSpur.policies.map(String));
  const alle = (typeof State !== 'undefined') ? (State.policiesAlle || State.policies || []) : [];
  return alle.filter(p => String(p.title || '').startsWith(PROBELAUF_PRAEFIX) && !inSpur.has(String(p.id)));
}

function probelaufAufraeumen() {
  // Die Spur haelt Regelwerke UND Konzepte, deshalb beide Helfer.
  const eintraege = _plSpur.policies
    .map(id => policyZuId(id) || konzeptZuId(id))
    .filter(Boolean);
  const verwaist = _plSpur.policies.length - eintraege.length;
  const reste = _plReste();

  if (!probelaufAnzahl() && !reste.length) { toast('Es ist nichts aufzuräumen.'); return; }

  openModal(`
    <div class="modal-header">
      <h3>Probelauf aufräumen</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <p style="margin:0 0 12px;line-height:1.6">Gelöscht wird ausschließlich, was in diesem Probelauf
      entstanden ist:</p>
      ${eintraege.length ? `<ul style="margin:0 0 12px;padding-left:19px;font-size:.86rem;line-height:1.7">
        ${eintraege.map(p => `<li>${esc(p.title)} <span class="field-hint">(${esc(p.typ === 'Konzept' ? 'Konzept' : p.status)})</span></li>`).join('')}
      </ul>` : ''}
      ${_plSpur.acks.length ? `<p style="margin:0 0 12px;font-size:.86rem">${_plSpur.acks.length} Kenntnisnahme(n)</p>` : ''}
      ${_plSpur.dateien.length ? `<ul style="margin:0 0 12px;padding-left:19px;font-size:.86rem;line-height:1.7">
        ${_plSpur.dateien.map(d => `<li>📄 ${esc(d.name)} <span class="field-hint">(Dokumentbibliothek)</span></li>`).join('')}
      </ul>` : ''}
      ${verwaist ? `<p class="field-hint" style="margin:0 0 12px">${verwaist} Eintrag/Einträge sind bereits nicht mehr vorhanden.</p>` : ''}
      ${reste.length ? `<div style="border:1px solid var(--c-border);border-radius:8px;padding:9px 11px;margin:0 0 12px">
        <label class="ack-check" style="font-weight:600"><input type="checkbox" id="pl-reste">
          <span>Auch ${reste.length === 1 ? 'diesen Eintrag' : 'diese ' + reste.length + ' Einträge'} aus anderen Probeläufen löschen</span></label>
        <ul style="margin:6px 0 4px;padding-left:19px;font-size:.84rem;line-height:1.6">
          ${reste.map(p => `<li>${esc(p.title)} <span class="field-hint">(${esc(p.typ === 'Konzept' ? 'Konzept' : p.status)})</span></li>`).join('')}
        </ul>
        <div class="field-hint">Sie stammen aus einem anderen Browser oder einem früheren Probelauf. Läuft gerade
          an anderer Stelle ein Probelauf, gehören sie dorthin: dann nicht ankreuzen.</div>
      </div>` : ''}
      <div class="pl-warnung">Versendete E-Mails bleiben in den Postfächern – die lassen sich nicht zurückholen.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-danger" onclick="probelaufLoeschen()">Endgültig löschen</button>
    </div>`, true);
}

/**
 * Löschaufträge zu viert nebeneinander statt einzeln hintereinander. Mehr
 * gleichzeitig bringt wenig und riskiert die Drosselung durch Graph.
 * → { weg, fehler }
 */
async function _plAbarbeiten(auftraege) {
  let weg = 0, fehler = 0;
  for (let i = 0; i < auftraege.length; i += 4) {
    const erg = await Promise.allSettled(auftraege.slice(i, i + 4).map(f => f()));
    erg.forEach(r => { if (r.status === 'fulfilled') weg++; else { fehler++; console.warn('[probelauf]', r.reason && r.reason.message); } });
  }
  return { weg, fehler };
}

/**
 * Einträge löschen. → { weg, fehler, uebrig } – `uebrig` ist, was nicht
 * gelöscht werden konnte, in derselben Form wie `teil`.
 */
async function _plLoeschen(teil) {
  const uebrig = { policies: [], acks: [], dateien: [] };
  const auftraege = [];
  const auftrag = (art, x, f) => auftraege.push(() => Promise.resolve().then(f).catch(e => { uebrig[art].push(x); throw e; }));
  (teil.policies || []).forEach(id => auftrag('policies', id, () => spDeletePolicy(id)));
  (teil.acks || []).forEach(id => auftrag('acks', id, () => spDeleteAcknowledgement(id)));
  (teil.dateien || []).forEach(d => auftrag('dateien', d, () => spDeleteDriveItem(d.driveId, d.itemId)));
  const { weg, fehler } = await _plAbarbeiten(auftraege);
  return { weg, fehler, uebrig };
}

async function probelaufLoeschen() {
  const mitResten = !!(document.getElementById('pl-reste') || {}).checked;
  closeModal();
  showSync(true, 'Räume auf …');
  const teil = { policies: _plSpur.policies.slice(), acks: _plSpur.acks.slice(), dateien: _plSpur.dateien.slice() };
  if (mitResten) {
    // Was zu den Resten gehört: der Eintrag, die eigenen Kenntnisnahmen dazu und
    // das Dokument, sofern es ebenfalls als Probelauf gekennzeichnet ist. Konzept
    // und Regelwerk teilen sich nach der Annahme eine Datei – sie geht nur einmal.
    const dateien = new Set(teil.dateien.map(d => String(d.itemId)));
    const reste = _plReste();
    const ids = new Set(reste.map(p => String(p.id)));
    reste.forEach(p => teil.policies.push(p.id));
    ((typeof State !== 'undefined' && State.acks) || []).filter(a => ids.has(String(a.richtlinieId)) && a.id)
      .forEach(a => teil.acks.push(a.id));
    reste.filter(p => p.dokumentDriveId && p.dokumentItemId && String(p.dokumentName || '').includes(PROBELAUF_PRAEFIX.trim()))
      .forEach(p => {
        if (dateien.has(String(p.dokumentItemId))) return;
        dateien.add(String(p.dokumentItemId));
        teil.dateien.push({ driveId: p.dokumentDriveId, itemId: p.dokumentItemId, name: p.dokumentName });
      });
  }
  const { weg, fehler, uebrig } = await _plLoeschen(teil);
  // Was nicht ging, bleibt in der Spur – sonst stünde es danach unbemerkt in den Listen.
  const rest = { policies: _plSpur.policies.filter(id => uebrig.policies.includes(id)),
    acks: _plSpur.acks.filter(id => uebrig.acks.includes(id)), dateien: _plSpur.dateien.filter(d => uebrig.dateien.includes(d)) };
  if (rest.policies.length + rest.acks.length + rest.dateien.length) { _plSpur = rest; _plSpurSpeichern(); }
  else _plSpurLeeren();
  if (typeof tourStandVergessen === 'function') tourStandVergessen();   // Vorgang ist weg
  try {
    State.loadedAt = 0;
    await reloadData();
    if (typeof renderAdminList === 'function') renderAdminList();
    if (typeof renderFreigaben === 'function') renderFreigaben();
  } catch (e) { /* Ansicht aktualisiert sich beim nächsten Wechsel */ }
  showSync(false);
  toast(fehler ? `${weg} gelöscht, ${fehler} nicht löschbar (siehe Konsole).` : `Aufgeräumt – ${weg} Einträge gelöscht ✓`,
    fehler ? 'error' : 'success');
}

/* ═══════════════════════════════════════════════════
   Das Dokument zum Vorgang
   ═══════════════════════════════════════════════════
   Ein Regelwerk ohne Datei erklärt die Lage nur halb: Prüfer, Betriebsrat und
   Geschäftsleitung entscheiden anhand des Dokuments. Im Probelauf gibt es
   deshalb ein echtes – als Word-Datei, damit sie sich in SharePoint direkt
   weiterschreiben lässt. Sie hängt an den Mails UND ist über den
   SharePoint-Link erreichbar, genau wie im Betrieb. Beim Aufräumen wird die
   Datei wieder gelöscht. */

/* ── Word-Datei ohne Bibliothek ──
   Ein PDF kann man ansehen, aber nicht weiterschreiben. Für das Konzept ist
   genau das gewünscht: in SharePoint öffnen, direkt ergänzen, fertig. Eine
   .docx ist ein ZIP mit drei XML-Teilen – das lässt sich von Hand erzeugen,
   ohne eine Bibliothek einzubinden. */

/** CRC-32 nach ZIP-Norm (Tabelle wird beim ersten Aufruf gebaut). */
let _plCrcTab = null;
function _plCrc32(bytes) {
  if (!_plCrcTab) {
    _plCrcTab = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _plCrcTab[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ _plCrcTab[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Minimales ZIP-Archiv, unkomprimiert („stored").
 * @param {Array<{name:string, bytes:Uint8Array}>} teile
 */
function _plZip(teile) {
  const enc = new TextEncoder();
  const stuecke = [], zentral = [];
  let versatz = 0;
  const z16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
  const z32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

  for (const teil of teile) {
    const name = enc.encode(teil.name);
    const crc = _plCrc32(teil.bytes);
    const kopf = [].concat(
      z32(0x04034b50), z16(20), z16(0), z16(0), z16(0), z16(0),
      z32(crc), z32(teil.bytes.length), z32(teil.bytes.length),
      z16(name.length), z16(0));
    stuecke.push(new Uint8Array(kopf), name, teil.bytes);
    zentral.push({ name, crc, laenge: teil.bytes.length, versatz });
    versatz += kopf.length + name.length + teil.bytes.length;
  }

  const start = versatz;
  for (const z of zentral) {
    const kopf = [].concat(
      z32(0x02014b50), z16(20), z16(20), z16(0), z16(0), z16(0), z16(0),
      z32(z.crc), z32(z.laenge), z32(z.laenge),
      z16(z.name.length), z16(0), z16(0), z16(0), z16(0),
      z32(0), z32(z.versatz));
    stuecke.push(new Uint8Array(kopf), z.name);
    versatz += kopf.length + z.name.length;
  }
  stuecke.push(new Uint8Array([].concat(
    z32(0x06054b50), z16(0), z16(0), z16(zentral.length), z16(zentral.length),
    z32(versatz - start), z32(start), z16(0))));

  const raus = new Uint8Array(stuecke.reduce((n, t) => n + t.length, 0));
  let i = 0;
  for (const t of stuecke) { raus.set(t, i); i += t.length; }
  return raus;
}

function _plXmlEsc(t) {
  return String(t == null ? '' : t)
    .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
    .split('"').join('&quot;');
}

/**
 * Word-Dokument bauen. Zeilen mit führendem '#' werden zu Zwischenüberschriften.
 * @returns Uint8Array (.docx)
 */
function _plDocxBauen(titel, zeilen) {
  const enc = new TextEncoder();
  const abs = (text, groesse, fett) =>
    '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr>'
    + (fett ? '<w:b/>' : '') + '<w:sz w:val="' + groesse + '"/><w:szCs w:val="' + groesse + '"/>'
    + '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>'
    + '<w:t xml:space="preserve">' + _plXmlEsc(text) + '</w:t></w:r></w:p>';

  const koerper = [abs(titel, 36, true)].concat(zeilen.map(z =>
    !z ? '<w:p/>' : (z.startsWith('#') ? abs(z.slice(1), 26, true) : abs(z, 22, false)))).join('');

  const dokument = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + koerper
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'
    + '</w:body></w:document>';

  const typen = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>';

  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';

  return _plZip([
    { name: '[Content_Types].xml', bytes: enc.encode(typen) },
    { name: '_rels/.rels', bytes: enc.encode(rels) },
    { name: 'word/document.xml', bytes: enc.encode(dokument) },
  ]);
}

const DOCX_TYP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Inhalt der Konzept-Skizze – am Aufbau der Muster-Vorlage orientiert. */
function _plInhaltKonzept(p) {
  const ko = (p && p.konzept) || {};
  return [
    '#Konzept-Skizze (Muster)',
    'Grundlage: Muster „Erstellung von Konzernregelungen".',
    'Diese Datei gehört zu einem Probelauf – kein echter Regelungsbedarf.',
    '',
    `Arbeitstitel: ${(p && p.title) || '-'}`,
    `Dokumentart: ${(p && p.regelwerkTyp) || '-'}`,
    `Geltungsbereich: ${(p && typeof geltungsbereichLabel === 'function') ? geltungsbereichLabel(p.geltungsbereich) : '-'}`,
    `Kategorie: ${(p && p.kategorie) || '-'}`,
    '',
    '#1. Warum? - Motivation und Problem',
    ...(_plUmbruch(ko.motivation || '-')),
    '',
    '#2. Wie koennte es aussehen? - Skizze',
    ...(_plUmbruch(ko.skizze || '-')),
    '',
    '#3. Entscheidung der Geschäftsleitung',
    'Annehmen, Zurückstellen oder Ablehnen – direkt aus der E-Mail.',
    'Bei Annahme entsteht daraus automatisch ein Regelwerk-Entwurf.',
  ];
}

/** Langen Text auf PDF-taugliche Zeilen umbrechen. */
function _plUmbruch(text, breite) {
  const max = breite || 78;
  const zeilen = [];
  for (const absatz of String(text || '').split(/\r?\n/)) {
    let rest = absatz.trim();
    if (!rest) { zeilen.push(''); continue; }
    while (rest.length > max) {
      let schnitt = rest.lastIndexOf(' ', max);
      if (schnitt <= 0) schnitt = max;
      zeilen.push(rest.slice(0, schnitt));
      rest = rest.slice(schnitt + 1);
    }
    zeilen.push(rest);
  }
  return zeilen;
}

/** Inhalt des Regelwerk-Entwurfs – bewusst als Dokumententwurf lesbar. */
function _plInhaltRegelwerk(p) {
  return [
    '#1. Zweck und Geltungsbereich',
    'Dieses Dokument gehört zu einem Probelauf des Regelwerk-Managements.',
    'Es liegt kein echter Regelungsbedarf zugrunde.',
    '',
    `Titel: ${(p && p.title) || '-'}`,
    `Dokumentart: ${(p && p.regelwerkTyp) || '-'}`,
    `Geltungsbereich: ${(p && typeof geltungsbereichLabel === 'function') ? geltungsbereichLabel(p.geltungsbereich) : '-'}`,
    `Version: ${(p && p.version) || '-'}`,
    `Erstellt: ${new Date().toLocaleString('de-DE')}`,
    '',
    '#2. Warum hängt hier eine Datei?',
    'Prüfer, Betriebsrat und Geschäftsleitung entscheiden anhand des Dokuments.',
    'Es hängt an der Mail und liegt zugleich in SharePoint – dort mit',
    'Versionsverlauf und Kommentaren, immer im aktuellen Stand.',
    '',
    '#3. Nächster Schritt',
    'Über die Schaltflächen in der Mail wird direkt entschieden.',
  ];
}

/**
 * Beispieldokument erzeugen, in die Dokumentbibliothek legen und am Vorgang
 * hinterlegen. Danach hängt es an den Mails und ist über SharePoint erreichbar.
 * @param {object} p Regelwerk oder Konzept (wird um die Dokumentfelder ergänzt)
 * @param {string} [art] 'konzept' für die Skizze nach Muster-Vorlage
 * @returns true bei Erfolg
 */
async function probelaufDokument(p, art) {
  if (!p) return false;
  const konzept = art === 'konzept';
  try {
    const titel = String(p.title || 'Regelwerk');
    const rein = titel.replace(/[<>:"/\\|?*]/g, '').trim() || 'Regelwerk';
    const bytes = konzept
      ? _plDocxBauen('Konzept-Skizze: ' + titel, _plInhaltKonzept(p))
      : _plDocxBauen(titel, _plInhaltRegelwerk(p));
    const name = (konzept ? 'Konzept-Skizze ' + rein : rein) + '.docx';
    const res = await spUploadPolicyDoc(name, bytes, DOCX_TYP);
    p.dokumentName = res.name;
    p.dokumentUrl = res.url;
    p.dokumentDriveId = res.driveId;
    p.dokumentItemId = res.itemId;
    _plSpur.dateien.push({ driveId: res.driveId, itemId: res.itemId, name: res.name });
    _plSpurSpeichern();
    return true;
  } catch (e) {
    console.warn('[probelauf] Dokument-Upload:', e.message);
    toast('Beispieldokument konnte nicht abgelegt werden: ' + e.message, 'error');
    return false;
  }
}

/* ═══════════════════════════════════════════════════
   Hinweisstreifen
═══════════════════════════════════════════════════ */

function _plBanner() {
  if (document.getElementById('pl-banner')) return;
  const b = document.createElement('div');
  b.id = 'pl-banner';
  b.className = 'demo-banner';
  b.innerHTML = `
    <span class="demo-dot" aria-hidden="true"></span>
    <b>Probelauf</b>
    <span class="demo-banner-text">Echter Vorgang: echte Einträge, echte E-Mails.
      Alles trägt „${esc(PROBELAUF_PRAEFIX.trim())}" im Titel.</span>
    <span class="pl-zaehler" id="pl-zaehler" title="In diesem Probelauf angelegte Einträge">0 Einträge</span>
    <button class="demo-banner-btn" id="pl-tour-btn" onclick="probelaufTour()">▶ Geführte Vorführung</button>
    <button class="demo-banner-btn" id="pl-tour-neu" onclick="probelaufTour(true)" title="Vorführung von vorn beginnen"
      style="display:none">↺</button>
    <button class="demo-banner-btn" onclick="probelaufSelbsttest()">✓ Selbsttest</button>
    <button class="demo-banner-btn" onclick="probelaufAufraeumen()">🧹 Aufräumen</button>
    <button class="demo-banner-btn" onclick="probelaufBeenden()">Beenden</button>`;
  document.body.appendChild(b);
  document.body.classList.add('demo-mode');
  _plBannerAktualisieren();
}

function _plBannerAktualisieren() {
  const el = document.getElementById('pl-zaehler');
  if (el) {
    const n = probelaufAnzahl();
    el.textContent = n === 1 ? '1 Eintrag' : n + ' Einträge';
    el.classList.toggle('pl-zaehler-voll', n > 0);
  }
  // Angehaltene Führung: Der Knopf bietet an, genau dort weiterzumachen.
  const btn = document.getElementById('pl-tour-btn');
  const neu = document.getElementById('pl-tour-neu');
  const stand = (typeof tourStand === 'function') ? tourStand() : 0;
  if (btn) {
    btn.textContent = (typeof tourKnopfText === 'function') ? tourKnopfText() : '▶ Geführte Vorführung';
    btn.classList.toggle('demo-neu', stand > 0);
  }
  if (neu) neu.style.display = stand > 0 ? '' : 'none';
}

/** Von außen (tour.js) aufrufbar, wenn sich der Stand der Führung geändert hat. */
function probelaufBannerAktualisieren() { _plBannerAktualisieren(); }

/* ═══════════════════════════════════════════════════
   Selbsttest: die Kette einmal automatisch durchlaufen
═══════════════════════════════════════════════════ */

const _plPruef = [];
let _plTestStart = 0;        // für die Dauer im Bericht
let _plMailStart = 0;        // ab welcher Mail der laufende Test zählt
let _plBerichtDaten = null;  // der letzte Bericht – für „Als Nachweis ablegen"

function _plOk(name, bedingung, detail) {
  _plPruef.push({ name, ok: !!bedingung, detail: detail || '' });
  return !!bedingung;
}

/** Kein Fehler, aber etwas, das man wissen muss – etwa eine Freigabe-Schwelle, die der Test nicht erreichen kann. */
function _plHinweis(name, detail) {
  _plPruef.push({ name, ok: true, hinweis: true, detail: detail || '' });
}

function _plPolicy(id) { return policyZuId(id) || {}; }

function _plListe(fn) {
  const f = (typeof window !== 'undefined' && window[fn]) || null;
  return (typeof f === 'function') ? (f() || []).filter(Boolean) : [];
}
function _plKbr() { return (typeof getKbrMail === 'function' && getKbrMail()) ? [getKbrMail()] : []; }

/**
 * Was der Selbsttest braucht, damit er durchläuft. Gezeigt wird es vor dem
 * Start, damit ein rotes Ergebnis nicht erst nach zwei Minuten erklärt, dass
 * etwas in den Einstellungen fehlt.
 */
function _plVoraussetzungen() {
  const gl = _plListe('getGeschaeftsleitung');
  const pruefer = _plListe('getPruefer');
  const schwelle = (typeof getFreigabeSchwelle === 'function') ? getFreigabeSchwelle() : '';
  const istGl = typeof isCurrentUserGeschaeftsleitung !== 'function' || isCurrentUserGeschaeftsleitung();
  return [
    { ok: istGl, text: istGl ? 'Sie stehen in der Geschäftsleitung und können das Konzept annehmen.'
      : 'Sie stehen nicht in der Geschäftsleitung: Der Test bleibt bei der Annahme des Konzepts stehen.' },
    { ok: gl.length > 0, text: gl.length ? `Geschäftsleitung hinterlegt (${gl.length})` : 'Keine Geschäftsleitung hinterlegt.' },
    { ok: pruefer.length > 0, text: pruefer.length ? `Prüfer hinterlegt (${pruefer.length})` : 'Keine Prüfer hinterlegt.' },
    { ok: _plKbr().length > 0, text: _plKbr().length ? 'Konzernbetriebsrat hinterlegt' : 'Kein Konzernbetriebsrat hinterlegt: Die Mitbestimmung bekommt keine Mail.' },
    { ok: !(schwelle === 'alle' && gl.length > 1), text: (schwelle === 'alle' && gl.length > 1)
      ? `Freigabe-Schwelle „alle" bei ${gl.length} Personen: Der Test erteilt eine Freigabe, veröffentlicht wird erst nach allen.`
      : 'Eine Freigabe genügt zur Veröffentlichung.' },
  ];
}

/* Der Startdialog: vorher fragen, mit zwei Entscheidungen. */
let _plFrageAntwort = null;

function _plSelbsttestFragen() {
  return new Promise(resolve => {
    _plFrageAntwort = resolve;
    openModal(`
      <div class="modal-header">
        <h3>Selbsttest starten</h3>
        <button class="modal-close" onclick="_plFrageEnde(false)" aria-label="Schließen">×</button>
      </div>
      <div class="modal-body">
        <div class="pl-warnung">Der Selbsttest legt einen echten Vorgang an und versendet echte E-Mails an die hinterlegten Empfänger.</div>
        <div style="font-weight:600;font-size:.84rem;margin:14px 0 6px">Voraussetzungen</div>
        <ul style="margin:0 0 12px;padding:0;list-style:none;font-size:.85rem;line-height:1.7">
          ${_plVoraussetzungen().map(v => `<li><span style="color:${v.ok ? 'var(--c-success)' : '#b45309'};font-weight:700">${v.ok ? '✓' : '⚠'}</span> ${esc(v.text)}</li>`).join('')}
        </ul>
        <label class="ack-check" style="font-weight:500;display:flex;margin-bottom:6px"><input type="checkbox" id="pl-st-aufraeumen" checked>
          <span>Danach aufräumen: Was der Test anlegt, wird gleich wieder gelöscht. Der Bericht bleibt.</span></label>
        <label class="ack-check" style="font-weight:500;display:flex"><input type="checkbox" id="pl-st-gross">
          <span>Auch Ablehnungen prüfen: Konzept abgelehnt, „nicht konform" in Prüfung und Mitbestimmung.
            Zwei Vorgänge mehr, entsprechend mehr Mails.</span></label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="_plFrageEnde(false)">Abbrechen</button>
        <button class="btn btn-primary" onclick="_plFrageEnde(true)">Selbsttest starten</button>
      </div>`, true);
  });
}

function _plFrageEnde(ja) {
  const r = _plFrageAntwort;
  _plFrageAntwort = null;
  const wahl = ja ? {
    aufraeumen: !!(document.getElementById('pl-st-aufraeumen') || {}).checked,
    gross: !!(document.getElementById('pl-st-gross') || {}).checked,
  } : null;
  closeModal();
  if (r) r(wahl);
}

/* ── Bausteine der Kette ── */

/** Konzept anlegen und bei der Geschäftsleitung einreichen. → das eingereichte Konzept oder null */
async function _plKonzeptEinreichen(titel, pruefen) {
  const k = newKonzept();
  k.title = titel;
  k.regelwerkTyp = 'Konzernrichtlinie';
  k.kategorie = 'IT-Sicherheit';
  k.geltungsbereich = ['ALLE'];
  k.konzept.motivation = 'Automatischer Selbsttest der Prozesskette (Probelauf).';
  k.konzept.prioritaet = 'hoch';
  const gespeichert = await spSavePolicy(k);
  pruefen('Konzept anlegen', !!(gespeichert && gespeichert.id));
  await reloadData({ rendern: false });
  const kAngelegt = (State.konzepte || []).find(x => x.title === titel);
  pruefen('Konzept steht in der Liste', !!kAngelegt);
  if (!kAngelegt) return null;
  await konzeptSubmitGF(kAngelegt.id);   // lädt selbst neu
  const kEing = (State.konzepte || []).find(x => x.title === titel);
  pruefen('Konzept eingereicht', !!(kEing && kEing.konzept && kEing.konzept.eingereichtAm));
  return kEing || null;
}

/**
 * Annahme über den ECHTEN Weg – dieselbe Funktion, die die Geschäftsleitung
 * auslöst, nur ohne die Rückfrage-Dialoge. → Id des entstandenen Regelwerks
 */
async function _plAnnehmen(kEing, pruefen) {
  if (typeof isCurrentUserGeschaeftsleitung === 'function' && !isCurrentUserGeschaeftsleitung()) {
    pruefen('Konzept angenommen (echter Weg)', false,
      'Nur die Geschäftsleitung kann Konzepte annehmen. Sie stehen nicht in der Liste (Einstellungen → Geschäftsleitung).');
    return '';
  }
  const rwId = await konzeptDecide(kEing.id, 'angenommen', { ohneRueckfrage: true, ohneWeiche: true });   // lädt selbst neu
  pruefen('Konzept angenommen (echter Weg)', !!rwId);
  return rwId || '';
}

/** Dokument und Mitbestimmung ergänzen – wie beim Ausarbeiten im Editor. */
async function _plEntwurfAusarbeiten(rwId, pruefen) {
  const entwurf = JSON.parse(JSON.stringify(_plPolicy(rwId)));
  entwurf.kbrBetroffen = true;
  const mitDok = await probelaufDokument(entwurf);
  pruefen('Dokument in der Bibliothek abgelegt', mitDok, entwurf.dokumentName || '');
  await spSavePolicy(entwurf);
  await reloadData({ rendern: false });   // der nächste Schritt liest den Stand aus State
}

/**
 * In die Konformitätsprüfung – auf dem Weg, den die Weiche nach der Annahme
 * anbietet: Status setzen, Prüfer und Betriebsrat benachrichtigen.
 */
async function _plZurPruefung(rwId) {
  if (typeof konzeptDirektZurPruefung === 'function') { await konzeptDirektZurPruefung(rwId); return; }
  await setStatus(rwId, 'Konformitätsprüfung', 'Selbsttest (Probelauf)');
  if (typeof notifyPruefer === 'function') await notifyPruefer(_plPolicy(rwId));
}

/**
 * Nach der Freigabe: veröffentlicht? Wenn nicht, liegt es oft an der Schwelle –
 * steht sie auf „alle", kann eine einzelne Person nicht veröffentlichen. Das
 * ist dann ein Hinweis, kein Fehler. → true, wenn veröffentlicht
 */
function _plFreigabePruefen(rwId) {
  const p = _plPolicy(rwId);
  if (p.status === 'Veröffentlicht') { _plOk('Freigegeben und veröffentlicht', true); return true; }
  const gl = (typeof getPolicyGeschaeftsleitung === 'function') ? getPolicyGeschaeftsleitung(p) : _plListe('getGeschaeftsleitung');
  const schwelle = (typeof getPolicyFreigabeSchwelle === 'function') ? getPolicyFreigabeSchwelle(p)
    : (typeof getFreigabeSchwelle === 'function' ? getFreigabeSchwelle() : '');
  const ja = new Set((p.freigaben || []).map(v => String(v.upn || '').toLowerCase()));
  const davonGl = gl.filter(u => ja.has(String(u).toLowerCase())).length;
  if (schwelle === 'alle' && gl.length > 1 && ja.size) {
    _plHinweis('Freigabe erteilt, Veröffentlichung steht aus',
      `${davonGl} von ${gl.length} Freigaben der Geschäftsleitung. Die Schwelle steht auf „alle", die übrigen haben eine Mail bekommen.`);
  } else {
    _plOk('Freigegeben und veröffentlicht', false, `Status: ${p.status || 'unbekannt'}`
      + (ja.size && !davonGl ? '. Ihre Freigabe zählt nicht, Sie stehen nicht in der Geschäftsleitung.' : ''));
  }
  return false;
}

/* ── Mails prüfen: am Betreff erkennbar (siehe die notify…-Funktionen) ── */

const _PL_MAILARTEN = [
  { praefix: 'Neues Regelwerk-Konzept zur Prüfung', name: 'Mail zur Konzeptprüfung an die Geschäftsleitung', empf: () => _plListe('getGeschaeftsleitung') },
  { praefix: 'Konzept angenommen', name: 'Mail an die einreichende Person', empf: () => [_plIch()] },
  { praefix: 'Neues Regelwerk zur Sichtung', name: 'Mail an die Prüfer', empf: () => _plListe('getPruefer'), pa: 'isPAPruefung' },
  { praefix: 'Mitbestimmung', name: 'Mail an den Betriebsrat', empf: _plKbr },
  { praefix: 'Regelwerk zur Freigabe', name: 'Mail zur Freigabe an die Geschäftsleitung', empf: () => _plListe('getGeschaeftsleitung'), pa: 'isPAFreigabe' },
  { praefix: 'Neues Regelwerk:', name: 'Bekanntgabe (im Probelauf nur an Sie)', empf: () => [_plIch()], nurVeroeffentlicht: true },
];

/** Die Mails des laufenden Tests zu einem Vorgang (Betreff endet auf seinen Titel). */
function _plMailsZu(titel) {
  return _plMails.slice(_plMailStart).filter(m => m.betreff.endsWith(titel));
}

function _plMailPruefen(name, mails, empfaenger) {
  if (!mails.length) {
    if (!empfaenger.length) _plHinweis(name, 'Kein Empfänger hinterlegt (Einstellungen), es ging keine Mail raus.');
    else _plOk(name, false, 'Keine Mail versendet.');
    return;
  }
  const an = [...new Set(mails.flatMap(m => m.an))];
  const fehl = mails.filter(m => m.status === 'fehler');
  if (fehl.length) { _plOk(name, false, fehl.map(m => m.fehler).join('; ')); return; }
  if (mails.some(m => m.status === 'laeuft')) { _plHinweis(name, `Versand läuft noch (${an.join(', ')})`); return; }
  _plOk(name, true, `${mails.length === 1 ? '1 Mail' : mails.length + ' Mails'} an ${an.join(', ')}`
    + (mails.some(m => m.anhang) ? ', mit Dokument im Anhang' : ''));
}

function _plMailsAuswerten(titel, veroeffentlicht, gross) {
  const zu = _plMailsZu(titel);
  _PL_MAILARTEN.filter(a => !a.nurVeroeffentlicht || veroeffentlicht).forEach(a => {
    const mails = zu.filter(m => m.betreff.startsWith(a.praefix));
    // Läuft die Etappe über Power Automate, verschickt die App diese Mail gar nicht selbst.
    const paFn = a.pa && (typeof window !== 'undefined') ? window[a.pa] : null;
    if (!mails.length && typeof paFn === 'function' && paFn()) {
      _plHinweis(a.name, 'Läuft über Power Automate. Diese Mail verschickt der Flow, der Selbsttest sieht sie nicht.');
      return;
    }
    _plMailPruefen(a.name, mails, a.empf());
  });
  if (gross) {
    _plMailPruefen('Ablehnung: Mail an die einreichende Person',
      _plMailsZu(titel + ' (Ablehnung)').filter(m => m.betreff.startsWith('Konzept abgelehnt')), [_plIch()]);
  }
  const alle = _plMails.slice(_plMailStart);
  const fehl = alle.filter(m => m.status === 'fehler').length;
  const laeuft = alle.filter(m => m.status === 'laeuft').length;
  if (laeuft) _plHinweis('Alle Mails zugestellt', `${alle.length - fehl - laeuft} von ${alle.length} angenommen, ${laeuft} noch unterwegs.`);
  else _plOk('Alle Mails zugestellt', alle.length > 0 && !fehl, `${alle.length - fehl} von ${alle.length} von Microsoft Graph angenommen.`);
}

/* ── Die große Variante: auch die Wege, auf denen etwas abgelehnt wird ── */

const _PL_GRUND = 'Selbsttest: Dieser Weg wird absichtlich geprüft.';

async function _plAblehnungPruefen(basis) {
  const pr = (name, b, d) => _plOk('Ablehnung: ' + name, b, d);
  const kEing = await _plKonzeptEinreichen(basis + ' (Ablehnung)', pr);
  if (!kEing) return;
  await konzeptDecide(kEing.id, 'abgelehnt', { grund: _PL_GRUND });   // lädt selbst neu
  const k = konzeptZuId(kEing.id) || {};
  const e = (k.konzept && k.konzept.entscheidung) || {};
  pr('Konzept abgelehnt', typeof konzeptStatus === 'function' ? konzeptStatus(k) === 'Abgelehnt' : e.status === 'abgelehnt');
  pr('Begründung festgehalten', e.kommentar === _PL_GRUND);
}

async function _plRueckwegePruefen(basis) {
  const pr = (name, b, d) => _plOk('Rückwege: ' + name, b, d);
  const kEing = await _plKonzeptEinreichen(basis + ' (Rückwege)', pr);
  if (!kEing) return;
  const id = await _plAnnehmen(kEing, pr);
  if (!id) return;
  await _plEntwurfAusarbeiten(id, pr);
  await _plZurPruefung(id);
  await markKonform(id, false, { grund: _PL_GRUND });
  let p = _plPolicy(id);
  pr('„Nicht konform" hält den Entwurf in der Prüfung', p.status === 'Konformitätsprüfung');
  pr('Die Begründung steht im Prüfvotum', (p.konformitaet || []).some(v => v.entscheidung === 'nicht_konform' && v.anmerkung === _PL_GRUND));
  await markKonform(id, true);
  p = _plPolicy(id);
  pr('Danach konform: weiter zur Mitbestimmung', p.status === 'Mitbestimmung');
  await markMitbestimmung(id, false, { grund: _PL_GRUND });
  p = _plPolicy(id);
  pr('Mitbestimmung „nicht konform": zurück in die Prüfung', p.status === 'Konformitätsprüfung' && !!p.mitbestimmung && p.mitbestimmung.konform === false);
  pr('Der Rückweg steht in der Historie', (p.historie || []).some(h => h.aktion === 'Mitbestimmung: nicht konform'));
}

/* ── Der Ablauf ── */

/**
 * Legt einen echten Vorgang an und führt ihn durch alle Stufen, mit Prüfung
 * nach jedem Schritt. Danach wartet er auf die letzten Mails, prüft sie, räumt
 * auf Wunsch auf und zeigt den Bericht.
 */
async function probelaufSelbsttest() {
  if (!_plAn) { toast('Der Selbsttest läuft nur im Probelauf.', 'error'); return; }
  if (!(await _plMitModulen())) return;
  const wahl = await _plSelbsttestFragen();
  if (!wahl) return;

  _plPruef.length = 0;
  const titel = probelaufTitel('Selbsttest ' + new Date().toLocaleString('de-DE'));
  _plTestStart = Date.now();
  _plMailStart = _plMails.length;
  const spurVorher = { policies: _plSpur.policies.length, acks: _plSpur.acks.length, dateien: _plSpur.dateien.length };
  const n = wahl.gross ? 9 : 7;
  // Jeder Schritt sagt, wo der Test steht. Neu geladen wird nur, wo der
  // aufgerufene Schritt es nicht selbst tut.
  const schritt = (i, text) => showSync(true, `Selbsttest ${i}/${n}: ${text} …`);
  let veroeffentlicht = false;
  try {
    veroeffentlicht = await _plKette(titel, schritt);
    if (wahl.gross) {
      schritt(8, 'Ablehnung eines Konzepts');
      await _plAblehnungPruefen(titel);
      schritt(9, 'Rückwege in Prüfung und Mitbestimmung');
      await _plRueckwegePruefen(titel);
    }
  } catch (e) {
    _plOk('Durchlauf ohne Fehler', false, e.message || String(e));
  }

  showSync(true, 'Selbsttest: warte auf die letzten Mails …');
  await _plMailsAbwarten();
  _plMailsAuswerten(titel, veroeffentlicht, wahl.gross);

  let aufgeraeumt = null;
  if (wahl.aufraeumen) {
    showSync(true, 'Selbsttest: räume auf …');
    aufgeraeumt = await _plAufraeumenSeit(spurVorher);
  }
  _plBerichtDaten = {
    titel, start: _plTestStart, dauer: Math.max(1, Math.round((Date.now() - _plTestStart) / 1000)),
    gross: wahl.gross, aufgeraeumt, pruefungen: _plPruef.slice(), mails: _plMails.slice(_plMailStart), nachweisId: '',
  };
  showSync(false);
  _plBericht(titel);
}

/** Der Hauptweg, Schritt 1 bis 7. → true, wenn das Regelwerk veröffentlicht ist */
async function _plKette(titel, schritt) {
  // 1) Konzept anlegen und einreichen
  schritt(1, 'Konzept anlegen und einreichen');
  const kEing = await _plKonzeptEinreichen(titel, _plOk);
  if (!kEing) return false;

  // 2) Annahme
  schritt(2, 'Konzept annehmen');
  const rwId = await _plAnnehmen(kEing, _plOk);
  if (!rwId) return false;
  const entstanden = _plPolicy(rwId);
  _plOk('Regelwerk-Entwurf automatisch entstanden', entstanden.status === 'Entwurf');
  _plOk('Titel, Dokumentart und Geltungsbereich übernommen',
    entstanden.title === titel && entstanden.regelwerkTyp === kEing.regelwerkTyp
    && (entstanden.geltungsbereich || []).length > 0);
  _plOk('Konzept-Freigabe steht in der Historie',
    (entstanden.historie || []).some(h => h.aktion === 'Konzept freigegeben'));
  _plOk('Verweis vom Konzept auf das Regelwerk',
    (konzeptZuId(kEing.id) || {}).konzept?.regelwerkId === rwId);

  // 3) Dokument
  schritt(3, 'Dokument ablegen');
  await _plEntwurfAusarbeiten(rwId, _plOk);

  // 4) Konformitätsprüfung (setStatus und mark… laden selbst neu)
  schritt(4, 'Konformitätsprüfung');
  await _plZurPruefung(rwId);
  _plOk('Status Konformitätsprüfung', _plPolicy(rwId).status === 'Konformitätsprüfung');
  await markKonform(rwId, true);
  _plOk('Konformität bestätigt', (_plPolicy(rwId).konformitaet || []).length > 0);

  // 5) Mitbestimmung
  if (mitbestimmungPflicht(_plPolicy(rwId))) {
    schritt(5, 'Mitbestimmung');
    await markMitbestimmung(rwId, true);
    _plOk('Mitbestimmung bestätigt', mitbestimmungBestaetigt(_plPolicy(rwId)));
  }

  // 6) Freigabe
  schritt(6, 'Freigabe');
  await markFreigabe(rwId);
  const veroeffentlicht = _plFreigabePruefen(rwId);

  // 7) Kenntnisnahme und Nachweis
  schritt(7, 'Kenntnisnahme und Nachweis');
  if (veroeffentlicht) {
    await confirmRead(rwId);   // lädt die Kenntnisnahmen selbst neu
    _plOk('Kenntnisnahme gespeichert',
      (State.acks || []).some(a => String(a.richtlinieId) === String(rwId)));
  } else {
    _plHinweis('Kenntnisnahme entfällt', 'Das Regelwerk ist noch nicht veröffentlicht.');
  }
  const fertig = _plPolicy(rwId);
  _plOk('Änderungshistorie geschrieben', (fertig.historie || []).length >= 3,
    (fertig.historie || []).length + ' Einträge');
  _plOk('Geltungsbereich erhalten', (fertig.geltungsbereich || []).length > 0);
  _plOk('Dokumentart erhalten', !!fertig.regelwerkTyp);
  _plOk('Dokument am Regelwerk hinterlegt', !!(fertig.dokumentItemId && fertig.dokumentUrl),
    fertig.dokumentName || 'keine Datei');
  _plOk('Als Probelauf erkennbar', String(fertig.title || '').startsWith(PROBELAUF_PRAEFIX));
  return veroeffentlicht;
}

/**
 * Löscht, was seit `vorher` in die Spur kam – also genau den Vorgang des
 * Selbsttests, nicht den der Vorführung. Was nicht ging, bleibt in der Spur.
 */
async function _plAufraeumenSeit(vorher) {
  const teil = { policies: _plSpur.policies.slice(vorher.policies), acks: _plSpur.acks.slice(vorher.acks),
    dateien: _plSpur.dateien.slice(vorher.dateien) };
  const { weg, fehler, uebrig } = await _plLoeschen(teil);
  _plSpur = {
    policies: _plSpur.policies.slice(0, vorher.policies).concat(uebrig.policies),
    acks: _plSpur.acks.slice(0, vorher.acks).concat(uebrig.acks),
    dateien: _plSpur.dateien.slice(0, vorher.dateien).concat(uebrig.dateien),
  };
  _plSpurSpeichern();
  try { await reloadData({ rendern: false }); } catch (e) { /* die Ansicht holt es beim nächsten Wechsel */ }
  return { weg, fehler };
}

/* ── Bericht ── */

function _plBericht(titel) {
  showSync(false);
  const d = _plBerichtDaten || { pruefungen: _plPruef.slice(), mails: [], dauer: 0 };
  const pruef = d.pruefungen;
  const rot = pruef.filter(p => !p.ok).length;
  const gelb = pruef.filter(p => p.hinweis).length;
  const zeilen = pruef.map(p => `
    <div style="display:flex;gap:9px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--c-border-2)">
      <span style="color:${!p.ok ? 'var(--c-danger)' : p.hinweis ? '#b45309' : 'var(--c-success)'};font-weight:700">${!p.ok ? '✗' : p.hinweis ? '⚠' : '✓'}</span>
      <div>
        <div style="font-size:.86rem">${esc(p.name)}</div>
        ${p.detail ? `<div class="field-hint">${esc(p.detail)}</div>` : ''}
      </div>
    </div>`).join('');
  const mails = (d.mails || []).map(m => `
    <tr><td style="padding:3px 6px 3px 0">${m.status === 'ok' ? '✓' : m.status === 'fehler' ? '✗' : '…'}</td>
      <td style="padding:3px 6px">${esc(m.betreff.replace(PROBELAUF_PRAEFIX, ''))}</td>
      <td style="padding:3px 0;color:var(--c-muted)">${esc(m.an.join(', '))}${m.fehler ? ` <span style="color:var(--c-danger)">${esc(m.fehler)}</span>` : ''}</td></tr>`).join('');
  const kopf = rot ? `${rot} von ${pruef.length} fehlgeschlagen`
    : `${pruef.length - gelb} Prüfungen bestanden${gelb ? `, ${gelb} ${gelb === 1 ? 'Hinweis' : 'Hinweise'}` : ''}`;
  const ag = d.aufgeraeumt;
  const aufgeraeumtText = ag ? (ag.fehler ? `Aufgeräumt: ${ag.weg} Einträge gelöscht, ${ag.fehler} nicht. Der Rest steht unter „🧹 Aufräumen".`
    : `Aufgeräumt: ${ag.weg} Einträge gelöscht.`) : 'Die Einträge stehen noch in den Listen, „🧹 Aufräumen" löscht sie.';

  openModal(`
    <div class="modal-header">
      <h3>Selbsttest: ${kopf}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div style="padding:10px 13px;border-radius:8px;margin-bottom:14px;
        background:${rot ? '#fef2f2' : gelb ? '#fffbeb' : '#f0fdf4'};border-left:3px solid ${rot ? 'var(--c-danger)' : gelb ? '#b45309' : 'var(--c-success)'}">
        <b>${rot ? 'Es gibt Abweichungen.' : gelb ? 'Die Prozesskette trägt, mit Hinweisen.' : 'Die Prozesskette trägt.'}</b>
        <div class="field-hint" style="margin-top:3px">Echter Durchlauf „${esc(titel)}": Konzept, Prüfung,
        Mitbestimmung, Freigabe, Kenntnisnahme und Nachweis in einem Zug${d.gross ? ', dazu die Ablehnungswege' : ''}${d.dauer ? ` (${d.dauer} s)` : ''}.
        ${esc(aufgeraeumtText)}</div>
      </div>
      ${zeilen}
      ${mails ? `<div style="font-weight:600;font-size:.84rem;margin:16px 0 6px">Versendete Mails (${d.mails.length})</div>
        <table style="width:100%;font-size:.8rem;border-collapse:collapse">${mails}</table>` : ''}
      ${d.nachweisId ? '<p class="field-hint" style="margin:12px 0 0">Als Nachweis im Register „Wirksamkeit & Verbesserung" abgelegt.</p>' : ''}
    </div>
    <div class="modal-footer">
      ${probelaufAnzahl() ? '<button class="btn btn-outline" onclick="probelaufAufraeumen()">🧹 Aufräumen</button>' : ''}
      ${!d.nachweisId && typeof spAddWirk === 'function' ? `<button class="btn btn-outline" onclick="probelaufNachweisAblegen()"
        title="Als Funktionsprüfung im Register „Wirksamkeit & Verbesserung" ablegen">📋 Als Nachweis ablegen</button>` : ''}
      <button class="btn btn-primary" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

/* ── Nachweis: der Bericht als Funktionsprüfung im Register „Wirksamkeit & Verbesserung" ──
   Der Vorgang selbst trägt „[Probelauf]" und verschwindet beim Aufräumen. Der
   Nachweis nicht: Er belegt, dass das System nach einer Änderung geprüft
   wurde (ISO 27001 A.8.29, A.8.32), und trägt deshalb keine Kennzeichnung. */

/** Der Eintrag fürs Register. Ohne DOM und ohne SharePoint – deshalb prüfbar. */
function probelaufNachweis(d, wer) {
  const rot = d.pruefungen.filter(p => !p.ok).length;
  const gelb = d.pruefungen.filter(p => p.hinweis).length;
  const tag = new Date(d.start).toLocaleDateString('de-DE');
  const zeile = (p) => `${!p.ok ? '✗' : p.hinweis ? '⚠' : '✓'} ${p.name}${p.detail ? ': ' + p.detail : ''}`;
  const version = (typeof APP_VERSION !== 'undefined') ? ` (Version ${APP_VERSION})` : '';
  const ergebnis = [
    rot ? `${rot} von ${d.pruefungen.length} Prüfungen fehlgeschlagen.` : `Alle ${d.pruefungen.length} Prüfungen bestanden${gelb ? `, ${gelb} mit Hinweis` : ''}.`,
    `Dauer ${d.dauer} s. ${d.aufgeraeumt ? 'Der Prüfvorgang wurde danach gelöscht.' : 'Der Prüfvorgang steht als [Probelauf] in den Listen.'}`,
    '', ...d.pruefungen.map(zeile),
  ];
  if ((d.mails || []).length) {
    ergebnis.push('', `Mails (${d.mails.length}):`);
    d.mails.forEach(m => ergebnis.push(`${m.status === 'ok' ? '✓' : m.status === 'fehler' ? '✗' : '…'} ${m.betreff} an ${m.an.join(', ')}`));
  }
  return {
    id: null, art: 'pruefung',
    titel: `Funktionsprüfung RMS: Selbsttest der Prozesskette vom ${tag}`,
    beschreibung: 'Automatisch aus dem Selbsttest im Probelauf übernommen.',
    datum: new Date(d.start).toISOString(), verantwortlich: wer.upn, beteiligte: [wer.upn], werke: [],
    status: rot ? 'offen' : 'abgeschlossen',
    quelle: '', herkunftId: '', ursache: '', massnahmen: [], wirksamkeit: '', wirksamAm: '', eingaben: [],
    umfang: `Selbsttest im Probelauf${version}: Konzept anlegen und einreichen, Annahme, Dokument, Konformitätsprüfung, `
      + `Mitbestimmung, Freigabe, Kenntnisnahme${d.gross ? ', dazu Ablehnung eines Konzepts und „nicht konform" in Prüfung und Mitbestimmung' : ''}. `
      + 'Echte Einträge in den SharePoint-Listen, echte Mails über Microsoft Graph an die hinterlegten Empfänger.',
    ergebnis: ergebnis.join('\n'),
    normbezug: (typeof WIRK_ARTEN !== 'undefined' && WIRK_ARTEN.pruefung) ? WIRK_ARTEN.pruefung.norm : 'ISO 27001 A.8.29 · A.8.32',
    historie: [{ datum: new Date().toISOString(), wer: wer.name || wer.upn, aktion: 'Aus dem Selbsttest angelegt' }],
    prozess: '', uebungsart: '',
  };
}

async function probelaufNachweisAblegen() {
  const d = _plBerichtDaten;
  if (!d) return;
  if (typeof spAddWirk !== 'function') { toast('Das Register „Wirksamkeit & Verbesserung" ist nicht verfügbar.', 'error'); return; }
  const wer = { upn: _plIch(), name: (State.user && State.user.name) || _plIch() };
  showSync(true, 'Lege den Nachweis ab …');
  try {
    d.nachweisId = String(await spAddWirk(probelaufNachweis(d, wer)) || 'ja');
    try { _wirk = null; } catch (e) { /* Register noch nicht geladen */ }
    toast('Als Funktionsprüfung im Register „Wirksamkeit & Verbesserung" abgelegt ✓', 'success');
  } catch (e) {
    toast('Nachweis nicht abgelegt: ' + e.message, 'error');
  } finally { showSync(false); }
  _plBericht(d.titel);
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROBELAUF_PRAEFIX };
}
