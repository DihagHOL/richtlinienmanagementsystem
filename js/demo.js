/**
 * Vorführ- und Testmodus
 * ======================
 * Die vollständige Anwendung mit allen echten Bedienelementen – aber auf einer
 * erfundenen Datenbasis im Arbeitsspeicher. Jeder Klick löst wirklich das aus,
 * was er im Betrieb auslöst: Konzept einreichen, Prüfung, Mitbestimmung,
 * Freigabe, Kenntnisnahme, Historie.
 *
 * Zwei bewusste Abweichungen vom Normalbetrieb:
 *
 *   1. Daten: Lesen und Schreiben gehen in DemoDaten (Arbeitsspeicher).
 *      Nichts erreicht die SharePoint-Listen – die Vorführung kann den
 *      Echtbestand also nicht verunreinigen.
 *
 *   2. E-Mails: werden WIRKLICH über Microsoft Graph versendet – aber
 *      ausschließlich an das Postfach der vorführenden Person. Betreff und
 *      Kopfzeile weisen den Testcharakter aus, die ursprünglichen Empfänger
 *      stehen im Hinweis. Dadurch ist die Vorführung zugleich ein echter Test
 *      der Mailstrecke (Mail.Send, Vorlagen, Schaltflächen, Anhänge).
 *      Abschaltbar über den Schalter im Streifen.
 *
 * Zugang: nur für freigeschaltete Personen – Administratoren sowie die in den
 * Einstellungen unter „Vorführmodus" hinterlegten Benutzer (siehe darfDemo()).
 *
 * Start: ?demo=1 in der Adresse oder der Knopf in der Anleitung.
 * Die Anmeldung läuft normal – es gibt keinen Weg an ihr vorbei.
 */

/** Erfundene Beteiligte – bewusst keine echten Personen. */
const DEMO_TEAM = [
  { name: 'Demo Prüfer (IT-Sicherheit)', upn: 'demo.pruefer@dihag.com', department: 'IT' },
  { name: 'Demo Geschäftsleitung',       upn: 'demo.gf@dihag.com',      department: 'Geschäftsführung' },
  { name: 'Demo Konzernbetriebsrat',     upn: 'demo.kbr@dihag.com',     department: 'Verwaltung' },
  { name: 'Demo Qualitätsmanagement',    upn: 'demo.qm@dihag.com',      department: 'Qualitätsmanagement' },
  { name: 'Demo Personalabteilung',      upn: 'demo.hr@dihag.com',      department: 'Personal' },
];

/** Der komplette Datenbestand der Vorführung – nur im Arbeitsspeicher. */
const DemoDaten = { policies: [], acks: [], mails: [], naechsteId: 500 };

let _demoAn = false;
let _demoMailEcht = true;      // Mails wirklich versenden (an das eigene Postfach)
let _demoEchtSendMail = null;  // Originalfunktion, bevor sie ersetzt wird

/** Läuft die Anwendung gerade als Vorführung? */
function demoAktiv() { return _demoAn; }

/** Soll nach der Anmeldung in den Vorführmodus gewechselt werden? */
function demoGewuenscht() { return /[?&]demo=1(&|$)/.test(location.search); }

/** Vorführung starten (lädt die Seite mit ?demo=1 neu – Anmeldung bleibt bestehen). */
function demoStart() {
  if (typeof darfDemo === 'function' && !darfDemo()) { demoKeinZugriff(); return; }
  location.href = location.pathname + '?demo=1';
}

/** Vorführung beenden und normal weiterarbeiten. */
function demoBeenden() {
  if (!confirm('Vorführung beenden? Alle Demo-Daten werden verworfen.')) return;
  location.href = location.pathname;
}

function demoKeinZugriff() {
  openModal(`
    <div class="modal-header">
      <h3>Vorführmodus nicht freigeschaltet</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <p style="margin:0 0 12px;line-height:1.6">Der Vorführ- und Testmodus ist nur für freigeschaltete
      Personen nutzbar. Er legt zwar keine echten Daten an, versendet aber echte E-Mails und zeigt den
      vollständigen Funktionsumfang – deshalb ist er nicht allgemein zugänglich.</p>
      <p style="margin:0;line-height:1.6">Freischaltung über <b>Einstellungen → Vorführmodus</b>
      (durch eine Administratorin oder einen Administrator).</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal()">Verstanden</button>
    </div>`);
}

/* ═══════════════════════════════════════════════════
   Start (nach der Anmeldung, aus bootApp heraus)
═══════════════════════════════════════════════════ */

/**
 * Vorführmodus einschalten: Zugriff prüfen, Beispieldaten anlegen, Datenschicht
 * umlenken, Hinweisstreifen zeigen und die Ansichten neu aufbauen.
 * @returns true, wenn der Modus wirklich aktiv ist
 */
async function demoAktivieren() {
  if (_demoAn) return true;
  if (typeof darfDemo === 'function' && !darfDemo()) { demoKeinZugriff(); return false; }

  _demoAn = true;
  _demoSeed();
  _demoStubs();
  _demoBanner();

  // Rollen und Rechte der Vorführung greifen erst nach einem Neuaufbau
  if (typeof _resetAccessCache === 'function') _resetAccessCache();
  await loadRuntimeAccessConfig();
  State.myRoles = await getCurrentUserRoles();
  initRoleNav();
  State.loadedAt = 0;
  await reloadData();
  await switchView('verwaltung');

  if (/[?&]tour=1(&|$)/.test(location.search) && typeof tourStart === 'function') {
    setTimeout(() => tourStart(), 500);
  }
  return true;
}

/* ═══════════════════════════════════════════════════
   Beispieldaten
═══════════════════════════════════════════════════ */

function _demoIso(tageZurueck) {
  return new Date(Date.now() - tageZurueck * 86400000).toISOString();
}

function _demoIch() {
  return State.user ? State.user.upn : '';
}

function _demoPolicy(o) {
  return {
    id: String(DemoDaten.naechsteId++),
    typ: 'Regelwerk', konzept: null, regelwerkTyp: '', geltungsbereich: [], historie: [],
    title: '', beschreibung: '', kategorie: '',
    dokumentUrl: '', dokumentName: '', dokumentDriveId: '', dokumentItemId: '',
    version: '1.0', status: 'Entwurf', pflicht: true,
    quizErforderlich: false, quizBestehenProzent: 80, quiz: [],
    zielgruppen: [ZIELGRUPPE_ALLE], wiederholungMonate: 0, naechsteReview: '',
    veroeffentlichtAm: '', freigegebenVon: '',
    konformitaet: [], freigaben: [], normbezug: [],
    pruefKonfig: { pruefer: [], schwelle: '' }, freigabeKonfig: { freigeber: [], schwelle: '' },
    kbrBetroffen: false, mitbestimmungWerke: [], mitbestimmung: null, freigabeReihenfolge: 'gl_mb',
    pruefungSeit: '', modifiedAt: new Date().toISOString(),
    ...o,
  };
}

function _demoSeed() {
  const ich = _demoIch();
  const meinName = State.user ? (State.user.name || ich) : 'Vorführung';

  DemoDaten.policies = [
    _demoPolicy({
      title: 'Informationssicherheitsleitlinie (Demo)',
      beschreibung: 'Grundsätze der Informationssicherheit in der DIHAG-Gruppe: Schutzziele, Verantwortlichkeiten und Verhalten im Alltag.',
      kategorie: 'IT-Sicherheit', regelwerkTyp: 'Konzernrichtlinie',
      geltungsbereich: ['ALLE'], version: '2.1', status: 'Veröffentlicht',
      veroeffentlichtAm: _demoIso(120), freigegebenVon: 'Demo Geschäftsleitung',
      wiederholungMonate: 12,
      naechsteReview: new Date(Date.now() + 90 * 86400000).toISOString(),
      normbezug: ['ISO27001:A.5.1'],
      quizErforderlich: true, quizBestehenProzent: 80,
      quiz: [
        { frage: 'Wem meldest du einen Verdacht auf einen Sicherheitsvorfall?', optionen: ['Der IT-Sicherheit', 'Niemandem', 'Erst dem Kunden'], richtig: 0 },
        { frage: 'Dürfen Firmendaten auf privaten USB-Sticks gespeichert werden?', optionen: ['Ja, immer', 'Nein', 'Nur freitags'], richtig: 1 },
      ],
      historie: [
        { datum: _demoIso(130), upn: ich, name: meinName, aktion: 'Angelegt', text: '' },
        { datum: _demoIso(120), upn: 'demo.gf@dihag.com', name: 'Demo Geschäftsleitung', aktion: 'Freigegeben & veröffentlicht', text: 'Version 2.1' },
      ],
    }),
    _demoPolicy({
      title: 'Reisekostenrichtlinie (Demo)',
      beschreibung: 'Erstattung von Reise-, Übernachtungs- und Bewirtungskosten.',
      kategorie: 'Finanzen', regelwerkTyp: 'Richtlinie',
      geltungsbereich: ['HOL', 'SHB'], version: '1.4', status: 'Veröffentlicht',
      veroeffentlichtAm: _demoIso(60), freigegebenVon: 'Demo Geschäftsleitung',
      historie: [{ datum: _demoIso(60), upn: 'demo.gf@dihag.com', name: 'Demo Geschäftsleitung', aktion: 'Freigegeben & veröffentlicht', text: '' }],
    }),
    _demoPolicy({
      title: 'Passwortrichtlinie (Demo)',
      beschreibung: 'Mindestlänge, Wechselintervalle und Umgang mit dem Passwort-Manager.',
      kategorie: 'IT-Sicherheit', regelwerkTyp: 'Konzernfachregelung',
      geltungsbereich: ['ALLE'], version: '1.0', status: 'Konformitätsprüfung',
      pruefungSeit: _demoIso(4),
      pruefKonfig: { pruefer: [ich], schwelle: 'einer' },
      normbezug: ['ISO27001:A.5.17'],
      historie: [
        { datum: _demoIso(9), upn: ich, name: meinName, aktion: 'Angelegt', text: '' },
        { datum: _demoIso(4), upn: ich, name: meinName, aktion: 'Zur Konformitätsprüfung', text: '' },
      ],
    }),
    _demoPolicy({
      title: 'Umgang mit Lieferantenaudits (Demo)',
      beschreibung: 'Ablauf, Zuständigkeiten und Dokumentation von Audits bei Lieferanten.',
      kategorie: 'Qualitätsmanagement', regelwerkTyp: 'Arbeits-/Prozessanweisung',
      geltungsbereich: ['SHB', 'EIS'], version: '0.3', status: 'Entwurf',
      zielgruppen: ['Qualitätsmanagement', 'Einkauf'],
      historie: [{ datum: _demoIso(2), upn: ich, name: meinName, aktion: 'Angelegt', text: '' }],
    }),
  ];

  // Eine bereits erledigte Kenntnisnahme, damit die Mitarbeitersicht nicht leer wirkt.
  const reise = DemoDaten.policies.find(p => p.title.startsWith('Reisekosten'));
  DemoDaten.acks = [{
    id: 'a1', richtlinieId: reise.id, version: reise.version,
    benutzerUpn: ich, benutzerName: meinName,
    gelesenAm: _demoIso(50), quizBestanden: false, quizScore: 0, quizVersuche: 0,
    abgeschlossenAm: _demoIso(50),
  }];
  DemoDaten.mails = [];
}

/**
 * Zugriffskonfiguration der Vorführung: Die vorführende Person hält alle Rollen –
 * nur so lässt sich die ganze Kette allein durchspielen. Die echte Konfiguration
 * bleibt unberührt (sie wird lediglich für diese Sitzung überlagert).
 */
function _demoConfig() {
  const ich = _demoIch();
  const echt = (typeof getAccessConfig === 'function') ? getAccessConfig() : {};
  return {
    ...echt,
    admins: [ich], genehmiger: [ich],
    roles: null,
    userRoles: { [ich]: ['IT', 'Geschäftsführung'] },
    reiterRechte: {},
    kbrMail: ich, brMails: { SHB: ich, EIS: ich },
    clevelMail: ich,
    pruefer: [ich], geschaeftsleitung: [ich],
    konformSchwelle: 'einer', freigabeSchwelle: 'einer',
    eskalationMail: '', genehmigungPAScope: 'aus', genehmigungPA: false,
    erinnerungenAktiv: false,
  };
}

/* ═══════════════════════════════════════════════════
   Ersatz für die SharePoint-Schicht
═══════════════════════════════════════════════════ */

function _demoKlon(o) { return JSON.parse(JSON.stringify(o)); }

function _demoStubs() {
  const g = window;

  g.spMissingPolicyColumns = () => [];
  g.spMissingAckColumns    = () => [];

  g.spLoadAccessConfig = async () => _demoConfig();
  g.spSaveAccessConfig = async () => { toast('Vorführung: Einstellungen werden nicht gespeichert.'); };

  g.spGetPolicies = async () => DemoDaten.policies.map(_demoKlon);

  g.spSavePolicy = async (p) => {
    const rein = _demoKlon(p);
    rein.modifiedAt = new Date().toISOString();
    const i = DemoDaten.policies.findIndex(x => String(x.id) === String(rein.id));
    if (rein.id && i >= 0) { DemoDaten.policies[i] = { ...DemoDaten.policies[i], ...rein }; return { id: rein.id }; }
    rein.id = String(DemoDaten.naechsteId++);
    DemoDaten.policies.push(rein);
    return { id: rein.id };
  };

  g.spGetPolicyMeta = async (id) => {
    const p = DemoDaten.policies.find(x => String(x.id) === String(id));
    return p ? { modifiedAt: p.modifiedAt, modifiedBy: (State.user && State.user.name) || '' } : null;
  };

  g.spDeletePolicy = async (id) => {
    DemoDaten.policies = DemoDaten.policies.filter(x => String(x.id) !== String(id));
  };

  g.spSetPolicyReview = async (id, iso) => {
    const p = DemoDaten.policies.find(x => String(x.id) === String(id));
    if (p) p.naechsteReview = iso || '';
  };

  g.spGetAcknowledgements = async (upn) => DemoDaten.acks
    .filter(a => !upn || a.benutzerUpn.toLowerCase() === String(upn).toLowerCase())
    .map(_demoKlon);

  g.spSaveAcknowledgement = async (a) => {
    const rein = _demoKlon(a);
    const i = DemoDaten.acks.findIndex(x => String(x.id) === String(rein.id));
    if (rein.id && i >= 0) { DemoDaten.acks[i] = { ...DemoDaten.acks[i], ...rein }; return { id: rein.id }; }
    rein.id = 'a' + DemoDaten.naechsteId++;
    DemoDaten.acks.push(rein);
    return { id: rein.id };
  };

  // Mitarbeiterliste: echte Kolleg:innen plus die erfundenen Demo-Rollen
  const echteMitglieder = g.spGetMembers;
  g.spGetMembers = async () => {
    let echte = [];
    try { echte = await echteMitglieder(); } catch (e) { echte = []; }
    return [..._demoKlon(DEMO_TEAM), ...echte];
  };

  // Dokumentablage gibt es in der Vorführung nicht – freundlich abfangen.
  g.spUploadPolicyDoc = async () => { toast('Vorführung: Es wird keine Datei hochgeladen.'); return null; };
  g.spGetDocAttachment = async () => null;

  // Mailversand umlenken (siehe _demoSendMail)
  if (!_demoEchtSendMail) _demoEchtSendMail = g.spSendMail;
  g.spSendMail = _demoSendMail;
}

/* ═══════════════════════════════════════════════════
   Mailversand: echt, aber ausschließlich an das eigene Postfach
═══════════════════════════════════════════════════ */

function _demoMailHinweis(anUrspruenglich, ccUrspruenglich) {
  const liste = (a) => (Array.isArray(a) ? a : [a]).filter(Boolean).join(', ');
  return `
  <div style="border:2px solid #f08300;background:#fff7ed;border-radius:8px;padding:11px 14px;margin:0 0 16px;
    font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.6;color:#7c2d12">
    <b>Testnachricht aus dem Vorführmodus des Regelwerk-Managements.</b><br>
    Diese Mail wurde erzeugt, um die Mailstrecke zu prüfen. Es liegt <b>kein echter Vorgang</b> zugrunde –
    bitte nichts veranlassen.<br>
    Im Echtbetrieb ginge sie an: <b>${esc(liste(anUrspruenglich)) || '–'}</b>${ccUrspruenglich && liste(ccUrspruenglich) ? ` (Cc: ${esc(liste(ccUrspruenglich))})` : ''}.
  </div>`;
}

/**
 * Ersatz für spSendMail im Vorführmodus.
 * Versendet wirklich – aber nur an die vorführende Person – und legt die Nachricht
 * zusätzlich im Postausgang ab, damit die Schaltflächen darin bedienbar bleiben.
 */
async function _demoSendMail(toUpns, subject, htmlBody, attachments, ccUpns, extraDomains) {
  const ich = _demoIch();
  const betreff = '[RMS-Vorführung] ' + String(subject || '');
  const html = _demoMailHinweis(toUpns, ccUpns) + (htmlBody || '');

  let versendet = false, fehler = '';
  if (_demoMailEcht && ich && _demoEchtSendMail) {
    try {
      versendet = await _demoEchtSendMail([ich], betreff, html, attachments, [], extraDomains);
    } catch (e) {
      fehler = e.message || String(e);
      console.warn('[demo] Mailversand fehlgeschlagen:', fehler);
    }
  }

  DemoDaten.mails.unshift({
    an: Array.isArray(toUpns) ? toUpns : [toUpns],
    cc: Array.isArray(ccUpns) ? ccUpns : (ccUpns ? [ccUpns] : []),
    betreff: String(subject || '(ohne Betreff)'),
    html: htmlBody || '',
    anhaenge: (attachments || []).map(a => a && a.name).filter(Boolean),
    am: new Date().toISOString(),
    versendetAn: versendet ? ich : '',
    fehler,
  });
  _demoBannerAktualisieren();

  if (fehler) toast('Vorführung: Mail konnte nicht versendet werden – ' + fehler, 'error');
  else if (versendet) toast('Testmail an dich selbst versendet ✓');
  return true;
}

/** Echten Versand an-/abschalten. */
function demoMailSchalter(an) {
  _demoMailEcht = !!an;
  toast(_demoMailEcht ? 'Testmails werden an dich versendet.' : 'Mailversand aus – Nachrichten nur im Postausgang.');
  _demoBannerAktualisieren();
}

/* ═══════════════════════════════════════════════════
   Hinweisstreifen + Postausgang
═══════════════════════════════════════════════════ */

function _demoBanner() {
  if (document.getElementById('demo-banner')) return;
  const b = document.createElement('div');
  b.id = 'demo-banner';
  b.className = 'demo-banner';
  b.innerHTML = `
    <span class="demo-dot" aria-hidden="true"></span>
    <b>Vorführ- und Testmodus</b>
    <span class="demo-banner-text">Erfundene Daten – nichts wird in SharePoint gespeichert.
      E-Mails gehen als Test an dich selbst.</span>
    <label class="demo-switch" title="Testmails wirklich versenden">
      <input type="checkbox" id="demo-mail-an" checked onchange="demoMailSchalter(this.checked)"> Mailversand
    </label>
    <button class="demo-banner-btn" id="demo-postausgang" onclick="demoPostausgang()">✉ Postausgang <span id="demo-mailzahl">0</span></button>
    <button class="demo-banner-btn" onclick="tourStart()">▶ Geführte Vorführung</button>
    <button class="demo-banner-btn" onclick="demoSelbsttest()">✓ Selbsttest</button>
    <button class="demo-banner-btn" onclick="demoBeenden()">Beenden</button>`;
  document.body.appendChild(b);
  document.body.classList.add('demo-mode');
  _demoBannerAktualisieren();
}

function _demoBannerAktualisieren() {
  const el = document.getElementById('demo-mailzahl');
  if (el) el.textContent = String(DemoDaten.mails.length);
  const btn = document.getElementById('demo-postausgang');
  if (btn) btn.classList.toggle('demo-neu', DemoDaten.mails.length > 0);
}

function demoPostausgang() {
  const liste = DemoDaten.mails.length
    ? DemoDaten.mails.map((m, i) => `
        <button class="demo-mail-row" onclick="demoZeigeMail(${i})">
          <div class="demo-mail-subj">${esc(m.betreff)}</div>
          <div class="demo-mail-meta">an ${esc(m.an.join(', '))}${m.anhaenge.length ? ' · 📎 ' + esc(m.anhaenge.join(', ')) : ''}
            · ${typeof fmtDateTime === 'function' ? fmtDateTime(m.am) : esc(m.am)}
            ${m.versendetAn ? ` · <span style="color:var(--c-success)">als Test an ${esc(m.versendetAn)} versendet</span>`
              : (m.fehler ? ` · <span style="color:var(--c-danger)">Versand fehlgeschlagen</span>` : ' · nicht versendet')}</div>
        </button>`).join('')
    : `<div class="field-hint">Noch keine E-Mail erzeugt. Reiche zum Beispiel ein Konzept bei der
       Geschäftsleitung ein – die Nachricht landet dann hier und in deinem Postfach.</div>`;

  openModal(`
    <div class="modal-header">
      <h3>Postausgang (Vorführung)</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <p class="field-hint" style="margin-bottom:12px">Jede Nachricht geht als Testmail an dein eigenes
      Postfach – mit Hinweis, dass kein echter Vorgang dahintersteht. Hier sind dieselben
      Entscheidungs-Schaltflächen bedienbar wie im Postfach der Empfänger.</p>
      ${liste}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

function demoZeigeMail(i) {
  const m = DemoDaten.mails[i];
  if (!m) return;
  openModal(`
    <div class="modal-header">
      <h3>${esc(m.betreff)}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div class="demo-mail-head">
        <div><b>An:</b> ${esc(m.an.join(', '))}</div>
        ${m.cc.length ? `<div><b>Cc:</b> ${esc(m.cc.join(', '))}</div>` : ''}
        ${m.anhaenge.length ? `<div><b>Anhang:</b> ${esc(m.anhaenge.join(', '))}</div>` : ''}
        <div class="field-hint">${m.versendetAn
          ? 'Als Testmail an ' + esc(m.versendetAn) + ' versendet.'
          : (m.fehler ? 'Versand fehlgeschlagen: ' + esc(m.fehler) : 'Nicht versendet (Mailversand aus).')}</div>
      </div>
      <div id="demo-mail-body" class="demo-mail-body">${m.html}</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="demoPostausgang()">← Postausgang</button>
    </div>`, true);

  // Die Schaltflächen in der Mail sind echte Links auf die App. In der Vorführung
  // führen wir die Aktion direkt aus, statt die Seite neu zu laden.
  const body = document.getElementById('demo-mail-body');
  if (body) body.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    demoMailLink(a.getAttribute('href'));
  });
}

/** Deep-Link aus einer Demo-Mail ausführen (?konzept=…&aktion=… bzw. ?richtlinie=…). */
function demoMailLink(href) {
  let params;
  try { params = new URL(href, location.href).searchParams; }
  catch (e) { return; }
  const aktion    = (params.get('aktion') || '').toLowerCase();
  const konzeptId = params.get('konzept');
  const policyId  = params.get('richtlinie');

  closeModal();
  if (konzeptId) {
    if (typeof setAdminMode === 'function') setAdminMode('konzepte');
    switchView('verwaltung').then(() => {
      if (aktion && typeof handleKonzeptMailAction === 'function') handleKonzeptMailAction(konzeptId, aktion);
      else if (typeof focusKonzeptCard === 'function') focusKonzeptCard(konzeptId);
    });
    return;
  }
  if (policyId) {
    switchView('freigaben').then(() => {
      if (aktion && typeof handleMailAction === 'function') handleMailAction(policyId, aktion);
      else if (typeof focusPolicyCard === 'function') focusPolicyCard(policyId);
    });
    return;
  }
  toast('Dieser Link führt in der Vorführung nirgendwohin.');
}

/* ═══════════════════════════════════════════════════
   Selbsttest: die Kette einmal automatisch durchspielen
═══════════════════════════════════════════════════ */

const _demoPruef = [];

function _demoOk(name, bedingung, detail) {
  _demoPruef.push({ name, ok: !!bedingung, detail: detail || '' });
  return !!bedingung;
}

/**
 * Spielt Konzept → Entwurf → Prüfung → Mitbestimmung → Freigabe → Kenntnisnahme
 * ohne Zutun durch und prüft nach jedem Schritt den Zustand. Ergebnis als Bericht.
 * Nützlich nach jedem Deployment: zeigt in einem Durchlauf, ob Workflow,
 * Historie und Mailstrecke tragen.
 */
async function demoSelbsttest() {
  if (!_demoAn) { toast('Der Selbsttest läuft nur im Vorführmodus.', 'error'); return; }
  _demoPruef.length = 0;
  const titel = 'Selbsttest ' + new Date().toLocaleTimeString('de-DE');
  const mailsVorher = DemoDaten.mails.length;

  toast('Selbsttest läuft …');
  try {
    // 1) Konzept anlegen und einreichen
    const k = newKonzept();
    k.title = titel;
    k.regelwerkTyp = 'Konzernrichtlinie';
    k.kategorie = 'IT-Sicherheit';
    k.geltungsbereich = ['ALLE'];
    k.konzept.motivation = 'Automatischer Selbsttest der Prozesskette.';
    k.konzept.prioritaet = 'hoch';
    const gespeichert = await spSavePolicy(k);
    _demoOk('Konzept anlegen', !!(gespeichert && gespeichert.id));
    await reloadData();

    const kAngelegt = (State.konzepte || []).find(x => x.title === titel);
    _demoOk('Konzept in der Liste', !!kAngelegt);
    if (!kAngelegt) return _demoBericht(titel);

    await konzeptSubmitGF(kAngelegt.id);
    const kEing = (State.konzepte || []).find(x => x.title === titel);
    _demoOk('Konzept eingereicht', !!(kEing && kEing.konzept && kEing.konzept.eingereichtAm));
    _demoOk('Mail an die Geschäftsleitung erzeugt', DemoDaten.mails.length > mailsVorher,
      DemoDaten.mails[0] ? DemoDaten.mails[0].betreff : '');
    const ersteMail = DemoDaten.mails[0];
    if (_demoMailEcht) {
      _demoOk('Mailversand über Microsoft Graph', !!(ersteMail && ersteMail.versendetAn),
        ersteMail && ersteMail.fehler ? ersteMail.fehler : 'an ' + (ersteMail ? ersteMail.versendetAn : ''));
    }

    // 2) Annahme (ohne Rückfrage – wir bauen den Entwurf direkt)
    const rw = newPolicy();
    rw.title = titel;
    rw.kategorie = kEing.kategorie;
    rw.regelwerkTyp = kEing.regelwerkTyp;
    rw.geltungsbereich = kEing.geltungsbereich.slice();
    rw.status = 'Entwurf';
    rw.kbrBetroffen = true;
    rw.pruefKonfig = { pruefer: [_demoIch()], schwelle: 'einer' };
    const rwSaved = await spSavePolicy(rw);
    _demoOk('Regelwerk-Entwurf aus dem Konzept', !!(rwSaved && rwSaved.id));
    await reloadData();
    const rwId = rwSaved.id;

    // 3) Konformitätsprüfung
    await setStatus(rwId, 'Konformitätsprüfung', 'Selbsttest');
    await reloadData();
    _demoOk('Status Konformitätsprüfung', _demoStatus(rwId) === 'Konformitätsprüfung');

    await markKonform(rwId, true);
    await reloadData();
    _demoOk('Konformität bestätigt', (_demoPolicy2(rwId).konformitaet || []).length > 0);

    // 4) Mitbestimmung
    const nachKonform = _demoPolicy2(rwId);
    if (mitbestimmungPflicht(nachKonform)) {
      await markMitbestimmung(rwId, true);
      await reloadData();
      _demoOk('Mitbestimmung bestätigt', mitbestimmungBestaetigt(_demoPolicy2(rwId)));
    }

    // 5) Freigabe
    await markFreigabe(rwId);
    await reloadData();
    _demoOk('Freigegeben und veröffentlicht', _demoStatus(rwId) === 'Veröffentlicht');

    // 6) Kenntnisnahme
    await confirmRead(rwId);
    await reloadAcks();
    _demoOk('Kenntnisnahme gespeichert',
      (State.acks || []).some(a => String(a.richtlinieId) === String(rwId)));

    // 7) Nachweis
    const fertig = _demoPolicy2(rwId);
    _demoOk('Änderungshistorie geschrieben', (fertig.historie || []).length >= 3,
      (fertig.historie || []).length + ' Einträge');
    _demoOk('Geltungsbereich erhalten', (fertig.geltungsbereich || []).length > 0);
    _demoOk('Dokumentart erhalten', !!fertig.regelwerkTyp);
  } catch (e) {
    _demoOk('Durchlauf ohne Fehler', false, e.message || String(e));
  }
  _demoBericht(titel);
}

function _demoPolicy2(id) {
  return (State.policies || []).find(p => String(p.id) === String(id)) || {};
}
function _demoStatus(id) { return _demoPolicy2(id).status || ''; }

function _demoBericht(titel) {
  const rot = _demoPruef.filter(p => !p.ok).length;
  const zeilen = _demoPruef.map(p => `
    <div style="display:flex;gap:9px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--c-border-2)">
      <span style="color:${p.ok ? 'var(--c-success)' : 'var(--c-danger)'};font-weight:700">${p.ok ? '✓' : '✗'}</span>
      <div>
        <div style="font-size:.86rem">${esc(p.name)}</div>
        ${p.detail ? `<div class="field-hint">${esc(p.detail)}</div>` : ''}
      </div>
    </div>`).join('');

  openModal(`
    <div class="modal-header">
      <h3>Selbsttest – ${rot ? rot + ' von ' + _demoPruef.length + ' fehlgeschlagen' : _demoPruef.length + ' Prüfungen bestanden'}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div style="padding:10px 13px;border-radius:8px;margin-bottom:14px;
        background:${rot ? '#fef2f2' : '#f0fdf4'};border-left:3px solid ${rot ? 'var(--c-danger)' : 'var(--c-success)'}">
        <b>${rot ? 'Es gibt Abweichungen.' : 'Die Prozesskette trägt.'}</b>
        <div class="field-hint" style="margin-top:3px">Durchlauf „${esc(titel)}" – Konzept, Prüfung,
        Mitbestimmung, Freigabe, Kenntnisnahme und Nachweis in einem Zug.</div>
      </div>
      ${zeilen}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="demoPostausgang()">✉ Postausgang</button>
      <button class="btn btn-primary" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEMO_TEAM };
}
