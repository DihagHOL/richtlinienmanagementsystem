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

let _plAn = false;
let _plSpur = { policies: [], acks: [], dateien: [] };
let _plEchtSavePolicy = null;
let _plEchtSaveAck = null;

/** Läuft gerade ein Probelauf? */
function probelaufAktiv() { return _plAn; }

/** Soll nach der Anmeldung ein Probelauf gestartet werden? */
function probelaufGewuenscht() { return /[?&]probelauf=1(&|$)/.test(location.search); }

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

function probelaufBeenden() {
  const offen = probelaufAnzahl();
  const frage = offen
    ? `Probelauf beenden?\n\nEs sind ${offen} Einträge entstanden, die noch in den Listen stehen.\nDu kannst sie vorher über „Aufräumen" löschen.`
    : 'Probelauf beenden?';
  if (!confirm(frage)) return;
  if (typeof tourStandVergessen === 'function') tourStandVergessen();
  location.href = location.pathname;
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
 * @returns true, wenn der Probelauf läuft
 */
async function probelaufAktivieren() {
  if (_plAn) return true;
  if (typeof darfProbelauf === 'function' && !darfProbelauf()) { probelaufKeinZugriff(); return false; }

  _plAn = true;
  _plSpurLaden();
  _plBuchfuehrung();
  _plBanner();

  if (/[?&]tour=1(&|$)/.test(location.search) && typeof tourStart === 'function') {
    setTimeout(() => tourStart(), 600);
  }
  return false;   // false = normale Startansicht weiterlaufen lassen (kein Sonderweg)
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

function probelaufAufraeumen() {
  const eintraege = _plSpur.policies
    .map(id => (State.policies || []).concat(State.konzepte || []).find(p => String(p.id) === id))
    .filter(Boolean);
  const verwaist = _plSpur.policies.length - eintraege.length;

  if (!probelaufAnzahl()) { toast('Es ist nichts aufzuräumen.'); return; }

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
      <div class="pl-warnung">Versendete E-Mails bleiben in den Postfächern – die lassen sich nicht zurückholen.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-danger" onclick="probelaufLoeschen()">Endgültig löschen</button>
    </div>`, true);
}

async function probelaufLoeschen() {
  closeModal();
  showSync(true, 'Räume auf …');
  let weg = 0, fehler = 0;
  for (const id of _plSpur.policies.slice()) {
    try { await spDeletePolicy(id); weg++; } catch (e) { fehler++; console.warn('[probelauf]', e.message); }
  }
  for (const id of _plSpur.acks.slice()) {
    try { await spDeleteAcknowledgement(id); weg++; } catch (e) { fehler++; console.warn('[probelauf]', e.message); }
  }
  for (const d of _plSpur.dateien.slice()) {
    try { await spDeleteDriveItem(d.driveId, d.itemId); weg++; } catch (e) { fehler++; console.warn('[probelauf]', e.message); }
  }
  _plSpurLeeren();
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
   Das Dokument zum Regelwerk
   ═══════════════════════════════════════════════════
   Ein Regelwerk ohne Datei erklärt die Lage nur halb: Prüfer, Betriebsrat und
   Geschäftsleitung entscheiden anhand des Dokuments. Im Probelauf gibt es
   deshalb ein echtes: Es wird als PDF erzeugt, in die Dokumentbibliothek
   hochgeladen und am Regelwerk hinterlegt. Damit hängt es an den Mails UND ist
   über den SharePoint-Link erreichbar – genau wie im Betrieb. Beim Aufräumen
   wird die Datei wieder gelöscht. */

/** Typografie und Umlaute auf das PDF-Zeichenset (WinAnsi) herunterbrechen. */
function _plLatin(t) {
  const karte = { '„': '"', '“': '"', '”': '"', '‘': "'", '’': "'",
                  '–': '-', '—': '-', '→': '->', ' ': ' ' };
  return String(t).split('').map(c => karte[c] || (c.charCodeAt(0) < 256 ? c : '')).join('');
}

/**
 * Erzeugt ein kleines, gültiges PDF – ohne Bibliothek, damit der Probelauf
 * überall läuft. Es lässt sich öffnen und drucken und zeigt, was im Betrieb an
 * der Mail hängt.
 */
function _plPdfBauen(titel, zeilen) {
  const BS = String.fromCharCode(92);   // Backslash und Zeilenumbruch ohne
  const NL = String.fromCharCode(10);   // Escape-Sequenzen im Quelltext
  const t = (x) => _plLatin(x).split(BS).join(BS + BS)
    .split('(').join(BS + '(').split(')').join(BS + ')');

  let y = 780;
  const text = [`BT /F1 17 Tf 56 ${y} Td (${t(titel)}) Tj ET`];
  y -= 34;
  for (const z of zeilen) {
    const fett = z.startsWith('#');
    const zeile = fett ? z.slice(1) : z;
    if (!zeile) { y -= 10; continue; }
    text.push(`BT /${fett ? 'F1' : 'F2'} ${fett ? 12 : 11} Tf 56 ${y} Td (${t(zeile)}) Tj ET`);
    y -= fett ? 22 : 17;
  }
  const inhalt = text.join(NL);

  const objekte = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>',
    `<</Length ${inhalt.length}>>stream${NL}${inhalt}${NL}endstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
  ];
  let pdf = '%PDF-1.4' + NL;
  const stellen = [];
  objekte.forEach((o, i) => { stellen.push(pdf.length); pdf += `${i + 1} 0 obj${o}endobj${NL}`; });
  const xref = pdf.length;
  pdf += `xref${NL}0 ${objekte.length + 1}${NL}0000000000 65535 f ${NL}`;
  stellen.forEach(off => { pdf += String(off).padStart(10, '0') + ' 00000 n ' + NL; });
  pdf += `trailer<</Size ${objekte.length + 1}/Root 1 0 R>>${NL}startxref${NL}${xref}${NL}%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** Inhalt des Beispieldokuments – bewusst als Regelwerksentwurf lesbar. */
function _plPdfInhalt(p) {
  return [
    '#1. Zweck und Geltungsbereich',
    'Dieses Dokument gehoert zu einem Probelauf des Regelwerk-Managements.',
    'Es liegt kein echter Regelungsbedarf zugrunde.',
    '',
    `Titel: ${(p && p.title) || '-'}`,
    `Dokumentart: ${(p && p.regelwerkTyp) || '-'}`,
    `Geltungsbereich: ${(p && typeof geltungsbereichLabel === 'function') ? geltungsbereichLabel(p.geltungsbereich) : '-'}`,
    `Version: ${(p && p.version) || '-'}`,
    `Erstellt: ${new Date().toLocaleString('de-DE')}`,
    '',
    '#2. Warum haengt hier eine Datei?',
    'Pruefer, Betriebsrat und Geschaeftsleitung entscheiden anhand des Dokuments.',
    'Es haengt an der Mail und liegt zugleich in SharePoint - dort mit',
    'Versionsverlauf und Kommentaren, immer im aktuellen Stand.',
    '',
    '#3. Naechster Schritt',
    'Ueber die Schaltflaechen in der Mail wird direkt entschieden.',
  ];
}

/**
 * Beispieldokument erzeugen, in die Dokumentbibliothek legen und am Regelwerk
 * hinterlegen. Danach hängt es an den Mails und ist über SharePoint erreichbar.
 * @param {object} p Regelwerk (wird um die Dokumentfelder ergänzt)
 * @returns true bei Erfolg
 */
async function probelaufDokument(p) {
  if (!p) return false;
  try {
    const bytes = _plPdfBauen(_plLatin(p.title || 'Regelwerk'), _plPdfInhalt(p));
    const name = (_plLatin(p.title || 'Regelwerk').replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'Regelwerk') + '.pdf';
    const res = await spUploadPolicyDoc(name, bytes, 'application/pdf');
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
    <button class="demo-banner-btn" id="pl-tour-btn" onclick="tourStart()">▶ Geführte Vorführung</button>
    <button class="demo-banner-btn" id="pl-tour-neu" onclick="tourNeu()" title="Vorführung von vorn beginnen"
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

function _plOk(name, bedingung, detail) {
  _plPruef.push({ name, ok: !!bedingung, detail: detail || '' });
  return !!bedingung;
}

function _plPolicy(id) { return (State.policies || []).find(p => String(p.id) === String(id)) || {}; }

/**
 * Legt einen echten Vorgang an und führt ihn durch alle Stufen, mit Prüfung
 * nach jedem Schritt. Anschließend steht der Bericht – und über „Aufräumen"
 * verschwindet der Vorgang wieder.
 */
async function probelaufSelbsttest() {
  if (!_plAn) { toast('Der Selbsttest läuft nur im Probelauf.', 'error'); return; }
  if (!confirm('Der Selbsttest legt einen echten Vorgang an und versendet echte E-Mails.\n\nFortfahren?')) return;

  _plPruef.length = 0;
  const titel = probelaufTitel('Selbsttest ' + new Date().toLocaleString('de-DE'));
  showSync(true, 'Selbsttest läuft …');
  let rwId = '';
  try {
    // 1) Konzept anlegen und einreichen
    const k = newKonzept();
    k.title = titel;
    k.regelwerkTyp = 'Konzernrichtlinie';
    k.kategorie = 'IT-Sicherheit';
    k.geltungsbereich = ['ALLE'];
    k.konzept.motivation = 'Automatischer Selbsttest der Prozesskette (Probelauf).';
    k.konzept.prioritaet = 'hoch';
    const gespeichert = await spSavePolicy(k);
    _plOk('Konzept anlegen', !!(gespeichert && gespeichert.id));
    await reloadData();

    const kAngelegt = (State.konzepte || []).find(x => x.title === titel);
    _plOk('Konzept steht in der Liste', !!kAngelegt);
    if (!kAngelegt) return _plBericht(titel);

    await konzeptSubmitGF(kAngelegt.id);
    await reloadData();
    const kEing = (State.konzepte || []).find(x => x.title === titel);
    _plOk('Konzept eingereicht', !!(kEing && kEing.konzept && kEing.konzept.eingereichtAm));
    _plOk('Mail an die Geschäftsleitung', (typeof getGeschaeftsleitung === 'function') && getGeschaeftsleitung().length > 0,
      (typeof getGeschaeftsleitung === 'function') ? getGeschaeftsleitung().join(', ') : '');

    // 2) Regelwerk-Entwurf aus dem Konzept
    const rw = newPolicy();
    rw.title = titel;
    rw.kategorie = kEing.kategorie;
    rw.regelwerkTyp = kEing.regelwerkTyp;
    rw.geltungsbereich = (kEing.geltungsbereich || []).slice();
    rw.status = 'Entwurf';
    rw.kbrBetroffen = true;
    // Dokument wirklich ablegen – ohne Datei prüft der Test die Mailanhänge nicht mit.
    const mitDok = await probelaufDokument(rw);
    _plOk('Dokument in der Bibliothek abgelegt', mitDok, rw.dokumentName || '');
    const rwSaved = await spSavePolicy(rw);
    _plOk('Regelwerk-Entwurf angelegt', !!(rwSaved && rwSaved.id));
    await reloadData();
    rwId = rwSaved.id;

    // 3) Konformitätsprüfung
    await setStatus(rwId, 'Konformitätsprüfung', 'Selbsttest (Probelauf)');
    await reloadData();
    _plOk('Status Konformitätsprüfung', _plPolicy(rwId).status === 'Konformitätsprüfung');

    await markKonform(rwId, true);
    await reloadData();
    _plOk('Konformität bestätigt', (_plPolicy(rwId).konformitaet || []).length > 0);

    // 4) Mitbestimmung
    if (mitbestimmungPflicht(_plPolicy(rwId))) {
      await markMitbestimmung(rwId, true);
      await reloadData();
      _plOk('Mitbestimmung bestätigt', mitbestimmungBestaetigt(_plPolicy(rwId)));
    }

    // 5) Freigabe
    await markFreigabe(rwId);
    await reloadData();
    _plOk('Freigegeben und veröffentlicht', _plPolicy(rwId).status === 'Veröffentlicht');

    // 6) Kenntnisnahme
    await confirmRead(rwId);
    await reloadAcks();
    _plOk('Kenntnisnahme gespeichert',
      (State.acks || []).some(a => String(a.richtlinieId) === String(rwId)));

    // 7) Nachweis
    const fertig = _plPolicy(rwId);
    _plOk('Änderungshistorie geschrieben', (fertig.historie || []).length >= 3,
      (fertig.historie || []).length + ' Einträge');
    _plOk('Geltungsbereich erhalten', (fertig.geltungsbereich || []).length > 0);
    _plOk('Dokumentart erhalten', !!fertig.regelwerkTyp);
    _plOk('Dokument am Regelwerk hinterlegt', !!(fertig.dokumentItemId && fertig.dokumentUrl),
      fertig.dokumentName || 'keine Datei');
    _plOk('Als Probelauf erkennbar', String(fertig.title || '').startsWith(PROBELAUF_PRAEFIX));
  } catch (e) {
    _plOk('Durchlauf ohne Fehler', false, e.message || String(e));
  } finally {
    showSync(false);
  }
  _plBericht(titel);
}

function _plBericht(titel) {
  const rot = _plPruef.filter(p => !p.ok).length;
  const zeilen = _plPruef.map(p => `
    <div style="display:flex;gap:9px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--c-border-2)">
      <span style="color:${p.ok ? 'var(--c-success)' : 'var(--c-danger)'};font-weight:700">${p.ok ? '✓' : '✗'}</span>
      <div>
        <div style="font-size:.86rem">${esc(p.name)}</div>
        ${p.detail ? `<div class="field-hint">${esc(p.detail)}</div>` : ''}
      </div>
    </div>`).join('');

  openModal(`
    <div class="modal-header">
      <h3>Selbsttest – ${rot ? rot + ' von ' + _plPruef.length + ' fehlgeschlagen' : _plPruef.length + ' Prüfungen bestanden'}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button>
    </div>
    <div class="modal-body">
      <div style="padding:10px 13px;border-radius:8px;margin-bottom:14px;
        background:${rot ? '#fef2f2' : '#f0fdf4'};border-left:3px solid ${rot ? 'var(--c-danger)' : 'var(--c-success)'}">
        <b>${rot ? 'Es gibt Abweichungen.' : 'Die Prozesskette trägt.'}</b>
        <div class="field-hint" style="margin-top:3px">Echter Durchlauf „${esc(titel)}" – Konzept, Prüfung,
        Mitbestimmung, Freigabe, Kenntnisnahme und Nachweis in einem Zug. Die E-Mails liegen in den
        Postfächern der hinterlegten Empfänger.</div>
      </div>
      ${zeilen}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="probelaufAufraeumen()">🧹 Aufräumen</button>
      <button class="btn btn-primary" onclick="closeModal()">Schließen</button>
    </div>`, true);
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROBELAUF_PRAEFIX };
}
