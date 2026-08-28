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
/* Ausgeblendet wird, was in der Aufnahme nur ablenkt. „Vorschläge" gehört
   ausdrücklich nicht dazu: Einen Änderungsvorschlag einzureichen ist etwas,
   das jede:r tut – genau der Teil, den ein Lernvideo zeigen soll. Der Reiter
   steht ohnehin in derselben Gruppe wie Dashboard und Freigaben. */
const PROBELAUF_NAV_AUS = ['nav-cockpit', 'nav-ismsdocs', 'nav-governance', 'nav-govstruktur',
  'nav-prozesse', 'nav-abdeckung', 'nav-faelligkeit', 'nav-risiken',
  'nav-compliance', 'nav-einstellungen', 'nav-grp-governance', 'nav-grp-isms', 'nav-grp-verwaltung'];

function probelaufNavFiltern() {
  if (!_plAn) return;
  PROBELAUF_NAV_AUS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
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
  _plLaufMerken(false);
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

  if (/[?&]tour=1(&|$)/.test(location.search) && typeof tourStart === 'function') {
    setTimeout(() => tourStart(), 600);
  }
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

function _plPolicy(id) { return policyZuId(id) || {}; }

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
    _plOk('Mail zur Konzeptprüfung an die Geschäftsleitung',
      (typeof getGeschaeftsleitung === 'function') && getGeschaeftsleitung().length > 0,
      (typeof getGeschaeftsleitung === 'function') ? getGeschaeftsleitung().join(', ') : '');

    // 2) Annahme über den ECHTEN Weg – dieselbe Funktion, die die
    //    Geschäftsleitung auslöst, nur ohne die Rückfrage-Dialoge.
    rwId = await konzeptDecide(kEing.id, 'angenommen', { ohneRueckfrage: true, ohneWeiche: true });
    await reloadData();
    _plOk('Konzept angenommen (echter Weg)', !!rwId);
    if (!rwId) return _plBericht(titel);

    const entstanden = _plPolicy(rwId);
    _plOk('Regelwerk-Entwurf automatisch entstanden', entstanden.status === 'Entwurf');
    _plOk('Titel, Dokumentart und Geltungsbereich übernommen',
      entstanden.title === titel && entstanden.regelwerkTyp === kEing.regelwerkTyp
      && (entstanden.geltungsbereich || []).length > 0);
    _plOk('Konzept-Freigabe steht in der Historie',
      (entstanden.historie || []).some(h => h.aktion === 'Konzept freigegeben'));
    _plOk('Verweis vom Konzept auf das Regelwerk',
      (konzeptZuId(kEing.id) || {}).konzept?.regelwerkId === rwId);

    // Dokument und Mitbestimmung ergänzen – wie beim Ausarbeiten im Editor
    const entwurf = JSON.parse(JSON.stringify(entstanden));
    entwurf.kbrBetroffen = true;
    const mitDok = await probelaufDokument(entwurf);
    _plOk('Dokument in der Bibliothek abgelegt', mitDok, entwurf.dokumentName || '');
    await spSavePolicy(entwurf);
    await reloadData();

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
