/**
 * Geführte Vorführung – zugleich das Drehbuch des Lernvideos
 * ==========================================================
 * Die Texte sprechen die <b>Zuschauer</b> an, nicht die bedienende Person:
 * Was hier auf dem Bildschirm steht, ist der Lehrtext des Videos und lässt sich
 * mitlesen. Was zu klicken ist, steht im <b>Hinweis</b> darunter – das stört
 * beim Zuschauen nicht und führt beim Aufnehmen zuverlässig.
 * Die Führung arbeitet mit der echten Oberfläche: Sie hebt das jeweils nächste
 * Bedienelement hervor, lässt es anklickbar und wartet, bis der Schritt
 * **wirklich** ausgeführt wurde. Erst dann geht es weiter. Es gibt keine
 * nachgebauten Bildschirme – jeder Klick löst genau das aus, was er im Betrieb
 * auslöst.
 *
 * Die Führung läuft im Probelauf (probelauf.js): Es entsteht ein echter Vorgang
 * mit echten E-Mails. Alles trägt „[Probelauf]" im Titel und lässt sich hinterher
 * über „Aufräumen" wieder entfernen.
 *
 * Fortschritt wird nicht über abgefangene Klicks erkannt, sondern über den
 * tatsächlichen Zustand (`erfuellt`). Dadurch ist es egal, auf welchem Weg man
 * ans Ziel kommt – auch ein Umweg zählt. Ein Schritt, dessen Bedingung beim
 * Betreten schon erfüllt ist, springt NICHT weiter: sonst rauschte die Führung
 * an Schritten vorbei, die man noch gar nicht gesehen hat.
 */

/** Beispiel, das sich durch die ganze Führung zieht. */
const TOUR_BEISPIEL = {
  titel: 'Regelwerk zur Nutzung von KI',
  typ: 'Konzernrichtlinie',
};

let _tourIdx      = -1;      // aktueller Schritt (-1 = aus)
let _tourTimer    = null;    // Takt für Nachführen + Zustandsprüfung
let _tourListe    = null;    // Schritte der laufenden Führung
let _tourBasis    = null;    // Zustandsschnappschuss beim Betreten des Schritts
let _tourSeit     = 0;       // Zeitpunkt des Schrittwechsels
let _tourVorerf   = false;   // war der Schritt beim Betreten schon erfüllt?

const TOUR_TAKT    = 350;    // ms zwischen zwei Prüfungen
const TOUR_MINDEST = 700;    // ms, die ein Schritt mindestens stehen bleibt
const TOUR_STAND   = 'rms_tour_stand';   // zuletzt erreichter Schritt

/* Der Stand überlebt das Schließen der Sprechblase – und auch einen Seitenwechsel.
   In einer Vorführung will man zwischendurch etwas anderes zeigen und danach
   genau dort weitermachen, wo man aufgehört hat. */
function _tourStandSpeichern() {
  try { localStorage.setItem(TOUR_STAND, String(_tourIdx)); } catch (e) { /* egal */ }
}
function tourStand() {
  try {
    const n = parseInt(localStorage.getItem(TOUR_STAND), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (e) { return 0; }
}
function tourStandVergessen() {
  try { localStorage.removeItem(TOUR_STAND); } catch (e) { /* egal */ }
}
/** Beschriftung für den Knopf im Streifen. */
function tourKnopfText() {
  const n = tourStand();
  return n ? `▶ Weiter bei Schritt ${n + 1}` : '▶ Geführte Vorführung';
}

/* ═══════════════════════════════════════════════════
   Hilfen für die Schrittdefinitionen
═══════════════════════════════════════════════════ */

/** Ziel eines Schritts auflösen. `ziel` darf ein Selektor oder eine Funktion sein,
 *  die einen Selektor liefert – nötig für Karten, deren Id erst zur Laufzeit feststeht. */
function _tourEl(ziel) {
  try {
    const sel = (typeof ziel === 'function') ? ziel() : ziel;
    return sel ? document.querySelector(sel) : null;
  } catch (e) { return null; }
}

/** Ist die genannte Ansicht gerade offen? */
function _tourAnsicht(view) {
  const el = document.getElementById('view-' + view);
  return !!(el && el.classList.contains('active'));
}

/** Offener Dialog, dessen Überschrift den Text enthält. */
function _tourDialog(teil) {
  const h = document.querySelector('.modal .modal-header h3');
  return !!(h && h.textContent.includes(teil));
}

/** Titel des Probelauf-Vorgangs – gekennzeichnet, damit er überall erkennbar ist. */
function _tourTitel() {
  return (typeof probelaufTitel === 'function') ? probelaufTitel(TOUR_BEISPIEL.titel) : TOUR_BEISPIEL.titel;
}
function _tourRegelwerk() {
  return (State.policies || []).find(p => p.title === _tourTitel()) || null;
}
function _tourKonzept() {
  return (State.konzepte || []).find(k => k.title === _tourTitel()) || null;
}

/**
 * Freigaben-Reiter für einen Schritt vorbereiten: den passenden Abschnitt
 * aufklappen und die Karte des Vorgangs ansteuern. Ohne das müsste man in einer
 * Vorführung erst selbst suchen, welcher der drei Abschnitte gemeint ist.
 */
function _tourFreigabenAbschnitt(key) {
  const p = _tourRegelwerk();
  if (!p) return;
  if (typeof fgOpenSection === 'function') fgOpenSection(key);
  if (typeof focusPolicyCard === 'function') focusPolicyCard(p.id);
}

/** Selektor auf die Karte des Vorgangs im Freigaben-Reiter. */
function _tourKarteSel(inner) {
  const p = _tourRegelwerk();
  return p ? `#fg-${p.id}${inner ? ' ' + inner : ''}` : null;
}

/* ═══════════════════════════════════════════════════
   Die Schritte
═══════════════════════════════════════════════════ */

function tourSchritte() {
  return [
    {
      symbol: '🎬',
      titel: 'Herzlich willkommen',
      text: 'Wie aus einer Idee ein gültiges Regelwerk wird – in gut fünf Minuten.',
      hinweis: 'Kein Testmodus: Hier entsteht ein <b>echter Vorgang</b> mit echten E-Mails. Jeder Schritt wartet, bis Sie ihn wirklich ausgeführt haben. „🧹 Aufräumen" entfernt ihn danach wieder.',
      ziel: null, erfuellt: null,
    },
    {
      symbol: '📋',
      titel: 'Regelwerk-Dashboard öffnen',
      text: 'Hier liegen alle Regelwerke und Konzepte des Konzerns.',
      hinweis: 'Zum Mitmachen: Reiter <b>Verwaltung</b> anklicken.',
      ziel: '#nav-verwaltung',
      erfuellt: () => _tourAnsicht('verwaltung'),
      vormachen: () => switchView('verwaltung'),
    },
    {
      // Nicht jedes Regelwerk ist neu. Wer Bestand übernimmt, soll nicht erst
      // ein Konzept erfinden müssen – dafür gibt es „Direkt anlegen".
      symbol: '📥',
      titel: 'Bestehendes Regelwerk aufnehmen',
      text: 'Nicht jedes Regelwerk ist neu – vorhandene Dokumente kommen ohne Konzept direkt herein.',
      hinweis: 'Zum Zeigen: <b>+ Neues Regelwerk</b> öffnen. „Direkt anlegen" ist der Weg für Bestand und Migration, „💡 Konzept erstellen" der für ein neues Thema. Wir gehen gleich den zweiten.',
      ziel: '#btn-new-policy',
      erfuellt: null,
    },
    {
      symbol: '💡',
      titel: 'Ein Konzept anlegen',
      text: 'Jedes Regelwerk beginnt als <b>Konzept</b> – erst entscheidet die Geschäftsleitung.',
      hinweis: 'Zum Mitmachen: <b>+ Neues Konzept</b>.',
      ziel: '#btn-new-konzept',
      erfuellt: () => _tourDialog('Regelwerk-Konzept'),
      vormachen: () => { setAdminMode('konzepte'); openKonzeptEditor(); },
    },
    {
      symbol: '✍️',
      titel: 'Konzept ausfüllen',
      text: 'Arbeitstitel, Dokumentart, Geltungsbereich – und die Frage <i>Warum?</i>',
      hinweis: '„✨ Vormachen" füllt das Formular aus und legt eine Skizze an.',
      ziel: '.modal-body',
      platz: 'ecke',
      erfuellt: () => {
        if (typeof _kEditing === 'undefined' || !_kEditing) return false;
        const ko = _kEditing.konzept || {};
        return !!(_kEditing.title && _kEditing.regelwerkTyp
          && (_kEditing.geltungsbereich || []).length && ko.motivation);
      },
      vormachen: async () => {
        if (typeof _kEditing === 'undefined' || !_kEditing) return;
        _kEditing.title = _tourTitel();
        _kEditing.regelwerkTyp = TOUR_BEISPIEL.typ;
        _kEditing.kategorie = 'IT-Sicherheit';
        _kEditing.geltungsbereich = ['ALLE'];
        _kEditing.konzept.prioritaet = 'hoch';
        _kEditing.konzept.motivation =
          'KI-Werkzeuge werden bereits genutzt – ohne Regeln drohen Datenabfluss und Compliance-Risiken.';
        _kEditing.konzept.skizze =
          'Zulässige Werkzeuge, Umgang mit Geschäftsgeheimnissen, Kennzeichnung KI-erzeugter Inhalte, Freigabewege.';
        // Anhang wie im Betrieb: Die Geschäftsleitung entscheidet anhand der Skizze.
        if (typeof probelaufDokument === 'function' && !_kEditing.dokumentItemId) {
          await probelaufDokument(_kEditing, 'konzept');
        }
        renderKonzeptEditor();
      },
    },
    {
      symbol: '📤',
      titel: 'Zur GF-Prüfung einreichen',
      text: 'Das Konzept geht an die Geschäftsleitung.',
      hinweis: 'Zum Mitmachen: unten auf „Zur GF-Prüfung einreichen".',
      ziel: '.modal-footer .btn-primary',
      basis: () => (State.konzepte || []).filter(k => k.konzept && k.konzept.eingereichtAm).length,
      erfuellt: (b) => (State.konzepte || []).filter(k => k.konzept && k.konzept.eingereichtAm).length > b,
      vormachen: () => saveKonzept(true),
    },
    {
      symbol: '✉️',
      titel: 'Die Mail im Postfach – Annehmen, Zurückstellen oder Ablehnen',
      text: 'Entschieden wird dort, wo alle ohnehin sind: im Postfach.',
      hinweis: 'Ein Klick in der Mail genügt – ohne Rückfrage. Mit Anhang und Link nach SharePoint; genau diese Mail bekommen Geschäftsführung, Prüfer und Betriebsrat.',
      ziel: null,
      // Es geht weiter, sobald die Entscheidung wirklich gefallen ist – egal ob
      // in der Mail oder auf der Karte.
      erfuellt: () => {
        const k = _tourKonzept();
        return !!(k && k.konzept && k.konzept.entscheidung && k.konzept.entscheidung.status === 'angenommen');
      },
      vormachen: () => {
        const k = _tourKonzept();
        if (k) { setAdminMode('konzepte'); switchView('verwaltung').then(() => konzeptDecide(k.id, 'angenommen', { ohneRueckfrage: true, ohneWeiche: true })); }
      },
    },
    {
      // Hier entscheidet sich, wen das Regelwerk erreicht und was es verlangt –
      // der Teil, der die Mitarbeitenden später wirklich betrifft.
      symbol: '🎯',
      titel: 'Zielgruppe, Pflichtlektüre, Wissenstest',
      text: 'Am Entwurf wird festgelegt, wer es lesen muss – und ob ein Wissenstest dazugehört.',
      hinweis: 'Alles ist vorbelegt: Pflichtlektüre, Wissenstest mit zwei Fragen, jährliche Wiedervorlage und ein Lernvideo. Scrollen Sie ruhig durch – die Sprechblase steht unten links und ist nicht im Weg.',
      // Der Schritt springt selbst ins Regelwerk: Von hier an geht es nicht mehr
      // um das Konzept, sondern um das, was die Mitarbeitenden später sehen.
      beim: () => { const p = _tourRegelwerk(); if (p) openPolicyEditor(p.id); },
      ziel: '.modal-body',
      platz: 'ecke',
      erfuellt: null,
      vormachen: () => {
        const p = _tourRegelwerk();
        if (!p) return;
        openPolicyEditor(p.id);
        setTimeout(() => {
          if (typeof _editing === 'undefined' || !_editing) return;
          _editing.pflicht = true;                 // Pflichtlektüre
          _editing.quizErforderlich = true;        // mit Wissenstest
          _editing.wiederholungMonate = 12;        // jährlich erneut bestätigen
          // Ein Wissenstest mit zwei Fragen – im Video wird erklärt, nicht getippt.
          if (!Array.isArray(_editing.quiz) || !_editing.quiz.length) {
            _editing.quiz = [
              { frage: 'Dürfen Geschäftsgeheimnisse in ein öffentliches KI-Werkzeug eingegeben werden?',
                optionen: ['Nein, niemals', 'Ja, wenn es schnell gehen muss', 'Nur mit Zustimmung der Kollegen'], richtig: 0 },
              { frage: 'Was gilt für Texte und Bilder, die eine KI erzeugt hat?',
                optionen: ['Sie werden gekennzeichnet', 'Sie brauchen keine Kennzeichnung', 'Sie dürfen gar nicht verwendet werden'], richtig: 0 },
            ];
            _editing.quizBestehenProzent = 80;
          }
          if (!Array.isArray(_editing.videos) || !_editing.videos.length) {
            _editing.videos = [{ titel: 'Regelwerke im Konzern – kurz erklärt',
              url: 'https://www.youtube.com/watch?v=QnRo245Cv6w&t=7s' }];
          }
          if (typeof renderPolicyEditor === 'function') renderPolicyEditor();
        }, 300);
      },
    },
    {
      symbol: '📄',
      titel: 'Aus dem Konzept wird ein Entwurf',
      text: 'Die Angaben sind übernommen – jetzt kommt das <b>Dokument</b> dazu.',
      hinweis: 'Zum Mitmachen: Dokument anhängen (⬆), dann „Zur Konformitätsprüfung →".',
      ziel: '.modal-footer .btn-primary',
      erfuellt: () => { const p = _tourRegelwerk(); return !!(p && p.status === 'Konformitätsprüfung'); },
      vormachen: async () => {
        const p = _tourRegelwerk();
        if (!p) return;
        openPolicyEditor(p.id);
        // Beispieldokument wirklich ablegen – sonst ginge die Mail ohne Anhang raus.
        if (typeof probelaufDokument === 'function' && !p.dokumentItemId
            && typeof _editing !== 'undefined' && _editing) {
          await probelaufDokument(_editing);
          renderPolicyEditor();
        }
        setTimeout(() => {
          if (typeof _editing !== 'undefined' && _editing) {
            _editing.kbrBetroffen = true;
            if (!(_editing.pruefKonfig && _editing.pruefKonfig.pruefer.length)
                && typeof getPruefer === 'function' && !getPruefer().length) {
              // Keine Prüfer hinterlegt? Dann wenigstens an die vorführende Person.
              _editing.pruefKonfig = { pruefer: [State.user.upn], schwelle: 'einer' };
            }
          }
          savePolicy('Konformitätsprüfung');
        }, 400);
      },
    },
    {
      symbol: '🔍',
      titel: 'Freigaben-Reiter öffnen',
      text: 'Hier wartet alles, was noch entschieden werden muss.',
      hinweis: 'Zum Mitmachen: Reiter <b>Freigaben</b> öffnen.',
      ziel: '#nav-freigaben',
      erfuellt: () => _tourAnsicht('freigaben'),
      vormachen: () => switchView('freigaben'),
    },
    {
      symbol: '✅',
      // Drei Entscheidungen, ein Schritt: Wer sie per Mail trifft, klickt hier
      // nichts – die Führung wartet einfach, bis veröffentlicht ist.
      titel: 'Konformitätsprüfung, Mitbestimmung und Freigabe',
      text: 'Drei Entscheidungen – jede per Mail, jede mit einem Klick.',
      hinweis: '„Nicht konform" verlangt immer eine Begründung. Die Freigabe-Mail nennt, wer vorher schon zugestimmt hat. Es geht weiter, sobald das Regelwerk veröffentlicht ist.',
      // Die Warteschlange offen zeigen, während in der Mail entschieden wird.
      beim: () => _tourFreigabenAbschnitt('pruef'),
      ziel: null,
      erfuellt: () => { const p = _tourRegelwerk(); return !!(p && p.status === 'Veröffentlicht'); },
      vormachen: () => {
        const p = _tourRegelwerk();
        if (!p) return;
        markKonform(p.id, true);
        setTimeout(() => {
          const q = _tourRegelwerk();
          if (q && typeof mitbestimmungPflicht === 'function' && mitbestimmungPflicht(q)
              && typeof mitbestimmungBestaetigt === 'function' && !mitbestimmungBestaetigt(q)) markMitbestimmung(q.id, true);
          setTimeout(() => { const r = _tourRegelwerk(); if (r && r.status !== 'Veröffentlicht') markFreigabe(r.id); }, 600);
        }, 600);
      },
    },
    {
      symbol: '👀',
      titel: 'Meine Regelwerke öffnen',
      text: 'Ab jetzt steht es bei allen in der Zielgruppe – hier sehen es die Mitarbeitenden.',
      hinweis: 'Zum Mitmachen: Reiter <b>Meine Regelwerke</b>. Diesen Reiter sieht jede und jeder im Konzern.',
      ziel: '.nav-item[data-view="meine"]',
      erfuellt: () => _tourAnsicht('meine'),
      vormachen: () => switchView('meine'),
    },
    {
      symbol: '✅',
      titel: 'Kenntnisnahme, Wissenstest und Video',
      text: 'Lesen, mit einem Klick bestätigen – bei wichtigen Themen folgt der Wissenstest.',
      hinweis: 'Das Lernvideo steht direkt beim Dokument, oberhalb des Wissenstests. Die Bestätigung ist der Nachweis; über die Erinnerungs-Mails kommt sie auch ohne Anmeldung zustande.',
      ziel: null,
      platz: 'ecke',
      beim: () => { const p = _tourRegelwerk(); if (p && typeof openDetail === 'function') openDetail(p.id); },
      erfuellt: () => {
        const p = _tourRegelwerk();
        return !!(p && (State.acks || []).some(a => String(a.richtlinieId) === String(p.id)));
      },
      vormachen: () => {
        const p = _tourRegelwerk();
        if (p) switchView('meine').then(() => { openDetail(p.id); setTimeout(() => confirmRead(p.id), 400); });
      },
    },
    {
      symbol: '🗂️',
      titel: 'Nachweis im Audit',
      text: 'Wer wann was entschieden hat – auf Knopfdruck.',
      hinweis: 'Zum Mitmachen: Regelwerk öffnen, <b>Änderungshistorie</b> aufklappen.',
      ziel: '#nav-verwaltung',
      erfuellt: () => !!_tourEl('#ed-body-hist'),
      vormachen: () => {
        const p = _tourRegelwerk();
        if (!p) return;
        setAdminMode('regelwerke');
        switchView('verwaltung').then(() => {
          openPolicyEditor(p.id);
          setTimeout(() => { if (typeof edToggleSection === 'function') edToggleSection('hist'); }, 400);
        });
      },
    },
    {
      symbol: '🏁',
      titel: 'Was das für Sie heißt',
      text: 'Nachsehen, lesen, bestätigen – und mitreden, wenn etwas nicht passt.',
      hinweis: 'Jetzt aufräumen? „🧹 Aufräumen" im Streifen unten löscht genau die Einträge dieses Probelaufs.',
      ziel: null, erfuellt: null,
    },
  ];
}

/* ═══════════════════════════════════════════════════
   Steuerung
═══════════════════════════════════════════════════ */

/** Führung starten. Ohne laufenden Probelauf zuerst dorthin. */
function tourStart(idx) {
  // Ohne laufenden Probelauf zuerst erklären, was dabei entsteht.
  if (typeof probelaufAktiv !== 'function' || !probelaufAktiv()) {
    if (typeof probelaufStart === 'function') probelaufStart();
    return;
  }
  _tourListe = tourSchritte();
  // Ohne ausdrückliche Schrittnummer beim letzten Stand weitermachen.
  const ziel = (idx === undefined || idx === null) ? tourStand() : (Number(idx) || 0);
  _tourGehe(ziel);
  if (!_tourTimer) _tourTimer = setInterval(_tourTakt, TOUR_TAKT);
}

/** Von vorn beginnen (verwirft den gemerkten Stand). */
function tourNeu() { tourStandVergessen(); tourStart(0); }

function _tourGehe(i) {
  if (!_tourListe) _tourListe = tourSchritte();
  _tourIdx = Math.max(0, Math.min(_tourListe.length - 1, i));
  const s = _tourListe[_tourIdx];
  // Vorbereitung: den passenden Abschnitt aufklappen, die Karte ansteuern …
  if (typeof s.beim === 'function') { try { s.beim(); } catch (e) { console.warn('[tour]', e.message); } }
  _tourBasis = (typeof s.basis === 'function') ? s.basis() : null;
  // Schon erledigt? Dann trotzdem stehen bleiben und den Weiter-Knopf anbieten.
  _tourVorerf = false;
  if (typeof s.erfuellt === 'function') {
    try { _tourVorerf = !!s.erfuellt(_tourBasis); } catch (e) { _tourVorerf = false; }
  }
  _tourSeit = Date.now();
  _tourStandSpeichern();
  _tourZeichne();
}

function tourWeiter() {
  if (!_tourListe) return;
  if (_tourIdx >= _tourListe.length - 1) { tourEnde(true); return; }   // durch = Stand verwerfen
  _tourGehe(_tourIdx + 1);
}

function tourZurueck() { if (_tourIdx > 0) _tourGehe(_tourIdx - 1); }

function tourVormachen() {
  const s = _tourListe && _tourListe[_tourIdx];
  if (!s || typeof s.vormachen !== 'function') return;
  try { s.vormachen(); } catch (e) { toast('Konnte den Schritt nicht vormachen: ' + e.message, 'error'); }
}

/**
 * Führung schließen.
 * @param {boolean} abgeschlossen true = durchgelaufen (Stand verwerfen),
 *   sonst nur angehalten – der Schritt bleibt gemerkt.
 */
function tourEnde(abgeschlossen) {
  const stand = _tourIdx;
  if (_tourTimer) { clearInterval(_tourTimer); _tourTimer = null; }
  _tourIdx = -1; _tourListe = null; _tourBasis = null; _tourVorerf = false;
  document.querySelectorAll('.tour-mask, .tour-ring, .tour-tip').forEach(el => el.remove());
  document.body.classList.remove('tour-on');

  if (abgeschlossen) tourStandVergessen();
  else if (stand > 0) toast(`Angehalten bei Schritt ${stand + 1} – unten im Streifen geht es weiter.`);
  if (typeof probelaufBannerAktualisieren === 'function') probelaufBannerAktualisieren();
}

/** Takt: Hervorhebung nachführen und prüfen, ob der Schritt erledigt ist. */
function _tourTakt() {
  if (_tourIdx < 0 || !_tourListe) return;
  const s = _tourListe[_tourIdx];
  _tourPositioniere();
  if (typeof s.erfuellt !== 'function') return;
  if (_tourVorerf) return;                       // war schon erledigt – nicht überspringen
  if (Date.now() - _tourSeit < TOUR_MINDEST) return;
  let fertig = false;
  try { fertig = !!s.erfuellt(_tourBasis); } catch (e) { fertig = false; }
  if (!fertig) return;
  _tourVorerf = true;                            // Doppel-Auslösung verhindern
  _tourErledigt();
  setTimeout(() => { if (_tourIdx >= 0) tourWeiter(); }, 850);
}

/** Kurze Rückmeldung, bevor der nächste Schritt kommt. */
function _tourErledigt() {
  const st = document.getElementById('tour-status');
  if (st) st.innerHTML = '<span class="tour-ok">✓ erledigt</span>';
  const ring = document.getElementById('tour-ring');
  if (ring) ring.classList.add('ok');
}

/* ═══════════════════════════════════════════════════
   Darstellung: Ausschnitt-Maske + Sprechblase
═══════════════════════════════════════════════════ */

function _tourZeichne() {
  document.body.classList.add('tour-on');
  const s = _tourListe[_tourIdx];

  if (!document.getElementById('tour-tip')) {
    ['t', 'r', 'b', 'l'].forEach(k => {
      const d = document.createElement('div');
      d.className = 'tour-mask'; d.id = 'tour-mask-' + k;
      document.body.appendChild(d);
    });
    const ring = document.createElement('div');
    ring.className = 'tour-ring'; ring.id = 'tour-ring';
    document.body.appendChild(ring);
    const tip = document.createElement('div');
    tip.className = 'tour-tip'; tip.id = 'tour-tip';
    tip.setAttribute('role', 'dialog');
    tip.setAttribute('aria-live', 'polite');
    document.body.appendChild(tip);
  }

  const tip = document.getElementById('tour-tip');
  const ring = document.getElementById('tour-ring');
  if (ring) ring.classList.remove('ok');

  const n = _tourListe.length;
  const anteil = Math.round((_tourIdx / (n - 1)) * 100);
  const wartet = typeof s.erfuellt === 'function' && !_tourVorerf;
  const status = wartet
    ? '<span class="tour-wartet"><i></i> wartet auf Sie</span>'
    : (typeof s.erfuellt === 'function' ? '<span class="tour-ok">✓ erledigt</span>' : '');

  tip.className = 'tour-tip' + (s.ziel ? '' : ' tour-tip-mitte');
  tip.innerHTML = `
    <div class="tour-fortschritt"><span style="width:${anteil}%"></span></div>
    <div class="tour-tip-kopf">
      <span class="tour-zaehler">Schritt ${_tourIdx + 1} von ${n}</span>
      <span id="tour-status">${status}</span>
      <button class="tour-x" onclick="tourEnde()" aria-label="Vorführung beenden">×</button>
    </div>
    <div class="tour-kopfzeile">
      <span class="tour-symbol" aria-hidden="true">${s.symbol || '•'}</span>
      <h4 class="tour-titel">${esc(s.titel)}</h4>
    </div>
    <div class="tour-text">${s.text}</div>
    ${s.hinweis ? `<div class="tour-hinweis">${s.hinweis}</div>` : ''}
    <div class="tour-tip-fuss">
      ${_tourIdx > 0 ? '<button class="btn btn-ghost btn-sm" onclick="tourZurueck()">← Zurück</button>' : ''}
      <span class="tour-luecke"></span>
      ${typeof s.vormachen === 'function' ? '<button class="btn btn-outline btn-sm" onclick="tourVormachen()">✨ Vormachen</button>' : ''}
      <button class="btn btn-primary btn-sm" onclick="tourWeiter()">
        ${_tourIdx === n - 1 ? 'Fertig' : (wartet ? 'Überspringen →' : 'Weiter →')}</button>
    </div>`;

  _tourPositioniere(true);
}

function _tourPositioniere(scrollen) {
  const s = _tourListe && _tourListe[_tourIdx];
  if (!s) return;
  const tip = document.getElementById('tour-tip');
  const ring = document.getElementById('tour-ring');
  if (!tip) return;

  const el = s.ziel ? _tourEl(s.ziel) : null;
  const masken = ['t', 'r', 'b', 'l'].map(k => document.getElementById('tour-mask-' + k));

  if (!el) {
    // Kein Ziel: alles abdunkeln, Sprechblase mittig
    masken[0].style.cssText = 'inset:0';
    masken.slice(1).forEach(m => { m.style.cssText = 'width:0;height:0'; });
    ring.style.display = 'none';
    tip.style.left = '50%'; tip.style.top = '50%';
    tip.style.transform = 'translate(-50%,-50%)';
    return;
  }

  if (scrollen) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }

  const r = el.getBoundingClientRect();
  const pad = 6;
  const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad);
  const w = r.width + pad * 2, h = r.height + pad * 2;

  // Vier Rechtecke um das Ziel – das Loch bleibt anklickbar
  masken[0].style.cssText = `left:0;top:0;right:0;height:${Math.max(0, y)}px`;
  masken[1].style.cssText = `left:${x + w}px;top:${y}px;right:0;height:${h}px`;
  masken[2].style.cssText = `left:0;top:${y + h}px;right:0;bottom:0`;
  masken[3].style.cssText = `left:0;top:${y}px;width:${Math.max(0, x)}px;height:${h}px`;

  ring.style.display = '';
  ring.style.left = x + 'px'; ring.style.top = y + 'px';
  ring.style.width = w + 'px'; ring.style.height = h + 'px';

  // Sprechblase unter das Ziel, sonst darüber.
  // Bei `platz: 'ecke'` stattdessen unten links: Ist das Ziel ein ganzes
  // Formular, deckte die Blase sonst genau die Felder ab, um die es geht –
  // und man kann darin nicht mehr scrollen, ohne sie zu verschieben.
  const tipH = tip.offsetHeight || 220, tipW = tip.offsetWidth || 360;
  if (s.platz === 'ecke') {
    tip.style.transform = 'none';
    tip.style.left = '16px';
    tip.style.top = Math.max(12, window.innerHeight - tipH - 16) + 'px';
    return;
  }
  const platzUnten = window.innerHeight - (y + h);
  const top = platzUnten > tipH + 20 ? (y + h + 14) : Math.max(12, y - tipH - 14);
  const left = Math.max(12, Math.min(Math.max(12, x), window.innerWidth - tipW - 12));
  tip.style.transform = 'none';
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

window.addEventListener('resize', () => { if (_tourIdx >= 0) _tourPositioniere(); });

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TOUR_TAKT, TOUR_MINDEST };
}
