/**
 * Geführte Vorführung („echte Trigger")
 * =====================================
 * Anders als der erklärende Rundgang (tutorial.js) arbeitet diese Führung mit der
 * echten Oberfläche: Sie hebt das jeweils nächste Bedienelement hervor, lässt es
 * anklickbar und wartet, bis der Schritt **wirklich** ausgeführt wurde. Erst dann
 * geht es weiter. Es gibt keine nachgebauten Bildschirme – jeder Klick löst genau
 * das aus, was er im Betrieb auslöst.
 *
 * Damit das gefahrlos geht, läuft die Führung im Demo-Modus (demo.js): erfundene
 * Daten im Arbeitsspeicher, kein SharePoint, kein Mailversand.
 *
 * Fortschritt wird nicht über abgefangene Klicks erkannt, sondern über den
 * tatsächlichen Zustand (`erfuellt`). Dadurch ist es egal, auf welchem Weg der
 * Vorführende ans Ziel kommt – auch ein Umweg zählt.
 */

let _tourIdx      = -1;     // aktueller Schritt (-1 = aus)
let _tourTimer    = null;   // Takt für Nachführen + Zustandsprüfung
let _tourListe    = null;   // Schritte der laufenden Führung
let _tourBasis    = null;   // Zustandsschnappschuss beim Betreten des Schritts
let _tourSeit     = 0;      // Zeitpunkt des Schrittwechsels (Mindestverweildauer)

const TOUR_TAKT      = 350;   // ms zwischen zwei Prüfungen
const TOUR_MINDEST   = 900;   // ms, die ein Schritt mindestens stehen bleibt

/* ═══════════════════════════════════════════════════
   Hilfen für die Schrittdefinitionen
═══════════════════════════════════════════════════ */

function _tourEl(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }

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

/** Das im Rundgang erzeugte Regelwerk (nach Titel). */
function _tourRegelwerk() {
  return (State.policies || []).find(p => p.title === TUT_BEISPIEL.titel) || null;
}

function _tourKonzept() {
  return (State.konzepte || []).find(k => k.title === TUT_BEISPIEL.titel) || null;
}

/* ═══════════════════════════════════════════════════
   Die Schritte
═══════════════════════════════════════════════════ */

function tourSchritte() {
  return [
    {
      titel: 'Vorführung starten',
      text: `Ab hier bedienst du die <b>echte Anwendung</b> – nur mit erfundenen Daten.
             Jeder Schritt wartet, bis du ihn wirklich ausgeführt hast.
             Wenn es schnell gehen soll: <b>Vormachen</b> erledigt den Schritt für dich.`,
      ziel: null,
      erfuellt: null,
    },
    {
      titel: '1 · Regelwerk-Dashboard öffnen',
      text: 'Hier verwaltet die Fachseite alle Regelwerke und Konzepte. Klick den Reiter an.',
      ziel: '#nav-verwaltung',
      erfuellt: () => _tourAnsicht('verwaltung'),
      vormachen: () => switchView('verwaltung'),
    },
    {
      titel: '2 · Ein Konzept anlegen',
      text: `Neue Regelwerke starten als <b>Konzept</b>: erst entscheidet die Geschäftsleitung,
             ob es überhaupt gebraucht wird. Klick auf „💡 Regelwerk-Konzept".`,
      ziel: '#btn-new-konzept',
      erfuellt: () => _tourDialog('Regelwerk-Konzept'),
      vormachen: () => { setAdminMode('konzepte'); openKonzeptEditor(); },
    },
    {
      titel: '3 · Konzept ausfüllen und einreichen',
      text: `Arbeitstitel, Dokumentart und Geltungsbereich sind Pflicht, dazu die Frage <i>Warum?</i>.
             Dann unten „Zur GF-Prüfung einreichen".`,
      ziel: '.modal-footer .btn-primary',
      basis: () => (State.konzepte || []).filter(k => k.konzept && k.konzept.eingereichtAm).length,
      erfuellt: (b) => (State.konzepte || []).filter(k => k.konzept && k.konzept.eingereichtAm).length > b,
      vormachen: () => {
        if (typeof _kEditing === 'undefined' || !_kEditing) return;
        _kEditing.title = TUT_BEISPIEL.titel;
        _kEditing.regelwerkTyp = TUT_BEISPIEL.typ;
        _kEditing.kategorie = 'IT-Sicherheit';
        _kEditing.geltungsbereich = ['ALLE'];
        _kEditing.konzept.prioritaet = 'hoch';
        _kEditing.konzept.motivation =
          'KI-Werkzeuge werden bereits genutzt – ohne Regeln drohen Datenabfluss und Compliance-Risiken.';
        _kEditing.konzept.skizze =
          'Zulässige Werkzeuge, Umgang mit Geschäftsgeheimnissen, Kennzeichnung KI-erzeugter Inhalte, Freigabewege.';
        renderKonzeptEditor();
        setTimeout(() => saveKonzept(true), 400);
      },
    },
    {
      titel: '4 · Die Mail an die Geschäftsleitung',
      text: `Die Anwendung hat die Geschäftsleitung benachrichtigt. In der Vorführung wird nichts
             versendet – die Nachricht liegt im <b>Postausgang</b>. Öffne sie.`,
      ziel: '#demo-postausgang',
      erfuellt: () => !!document.getElementById('demo-mail-body'),
      vormachen: () => { demoPostausgang(); setTimeout(() => demoZeigeMail(0), 300); },
    },
    {
      titel: '5 · Entscheiden – direkt aus der Mail',
      text: `Annehmen, Zurückstellen oder Ablehnen stehen als Schaltflächen <b>in der Mail</b>.
             Klick auf „✓ Annehmen" – daraus entsteht automatisch ein Regelwerk-Entwurf.`,
      ziel: '#demo-mail-body a',
      erfuellt: () => {
        const k = _tourKonzept();
        return !!(k && k.konzept && k.konzept.entscheidung && k.konzept.entscheidung.status === 'angenommen');
      },
      vormachen: () => {
        const k = _tourKonzept();
        if (k) { closeModal(); switchView('verwaltung').then(() => konzeptDecide(k.id, 'angenommen')); }
      },
    },
    {
      titel: '6 · Aus dem Konzept wird ein Entwurf',
      text: `Titel, Dokumentart, Geltungsbereich und die Begründung sind übernommen.
             Ergänze jetzt, was das Regelwerk braucht – und schick es mit
             „Zur Konformitätsprüfung →" weiter.`,
      ziel: '.modal-footer .btn-primary',
      erfuellt: () => { const p = _tourRegelwerk(); return !!(p && p.status === 'Konformitätsprüfung'); },
      vormachen: () => {
        const p = _tourRegelwerk();
        if (!p) return;
        openPolicyEditor(p.id);
        setTimeout(() => {
          if (typeof _editing !== 'undefined' && _editing) {
            _editing.kbrBetroffen = true;
            _editing.pruefKonfig = { pruefer: ['demo.pruefer@dihag.com'], schwelle: 'einer' };
          }
          savePolicy('Konformitätsprüfung');
        }, 400);
      },
    },
    {
      titel: '7 · Konformitätsprüfung',
      text: `Der Reiter <b>Freigaben</b> zeigt alles, was auf eine Entscheidung wartet.
             Öffne ihn und setze das Regelwerk auf „Konform".`,
      ziel: '#nav-freigaben',
      erfuellt: () => { const p = _tourRegelwerk(); return !!(p && (p.konformitaet || []).length); },
      vormachen: () => {
        const p = _tourRegelwerk();
        if (p) switchView('freigaben').then(() => markKonform(p.id, true));
      },
    },
    {
      titel: '8 · Mitbestimmung',
      text: `Ist die Mitbestimmung betroffen, geht es an den Konzernbetriebsrat bzw. die
             Betriebsräte der gewählten Werke. Auch das wird hier entschieden.`,
      ziel: '#view-freigaben',
      erfuellt: () => {
        const p = _tourRegelwerk();
        return !p || !mitbestimmungPflicht(p) || mitbestimmungBestaetigt(p);
      },
      vormachen: () => {
        const p = _tourRegelwerk();
        if (p && mitbestimmungPflicht(p)) markMitbestimmung(p.id, true);
      },
    },
    {
      titel: '9 · Freigabe durch die Geschäftsleitung',
      text: `In der Freigabe-Karte steht, wer vorher schon zugestimmt hat.
             Mit der Freigabe wird das Regelwerk veröffentlicht.`,
      ziel: '#view-freigaben',
      erfuellt: () => { const p = _tourRegelwerk(); return !!(p && p.status === 'Veröffentlicht'); },
      vormachen: () => { const p = _tourRegelwerk(); if (p) markFreigabe(p.id); },
    },
    {
      titel: '10 · Kenntnisnahme',
      text: `Jetzt erscheint das Regelwerk bei allen Mitarbeitenden der Zielgruppe.
             Wechsle zu „Meine Regelwerke", öffne es und bestätige die Kenntnisnahme.`,
      ziel: '.nav-item[data-view="meine"]',
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
      titel: '11 · Nachweis im Audit',
      text: `Der eigentliche Zweck: Auf Knopfdruck belegbar, <b>wer wann was</b> entschieden hat.
             Öffne das Regelwerk im Dashboard und klapp die <b>Änderungshistorie</b> auf.`,
      ziel: '#nav-verwaltung',
      erfuellt: () => !!_tourEl('#ed-sec-hist.open, #ed-body-hist'),
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
      titel: 'Durchlauf abgeschlossen',
      text: `Vom Konzept über Prüfung und Mitbestimmung bis zu Freigabe, Kenntnisnahme und
             Audit-Nachweis – alles an einer Stelle und lückenlos protokolliert.<br><br>
             Die Vorführung lässt sich oben im Streifen jederzeit neu starten oder beenden.`,
      ziel: null,
      erfuellt: null,
    },
  ];
}

/* ═══════════════════════════════════════════════════
   Steuerung
═══════════════════════════════════════════════════ */

/** Führung starten. Ohne Demo-Modus zuerst dorthin wechseln. */
function tourStart(idx) {
  if (typeof demoAktiv !== 'function' || !demoAktiv()) {
    if (!confirm('Die geführte Vorführung läuft im Demo-Modus mit erfundenen Daten.\n\nJetzt in den Demo-Modus wechseln? Die Seite wird dazu neu geladen.')) return;
    location.href = location.pathname + '?demo=1&tour=1';
    return;
  }
  _tourListe = tourSchritte();
  _tourGehe(Number(idx) || 0);
  if (!_tourTimer) _tourTimer = setInterval(_tourTakt, TOUR_TAKT);
}

function _tourGehe(i) {
  if (!_tourListe) _tourListe = tourSchritte();
  _tourIdx = Math.max(0, Math.min(_tourListe.length - 1, i));
  const s = _tourListe[_tourIdx];
  _tourBasis = (typeof s.basis === 'function') ? s.basis() : null;
  _tourSeit = Date.now();
  _tourZeichne();
}

function tourWeiter() {
  if (!_tourListe) return;
  if (_tourIdx >= _tourListe.length - 1) { tourEnde(); return; }
  _tourGehe(_tourIdx + 1);
}

function tourZurueck() { if (_tourIdx > 0) _tourGehe(_tourIdx - 1); }

function tourVormachen() {
  const s = _tourListe && _tourListe[_tourIdx];
  if (!s || typeof s.vormachen !== 'function') return;
  try { s.vormachen(); } catch (e) { toast('Konnte den Schritt nicht vormachen: ' + e.message, 'error'); }
}

function tourEnde() {
  if (_tourTimer) { clearInterval(_tourTimer); _tourTimer = null; }
  _tourIdx = -1; _tourListe = null; _tourBasis = null;
  document.querySelectorAll('.tour-mask, .tour-ring, .tour-tip').forEach(el => el.remove());
  document.body.classList.remove('tour-on');
}

/** Takt: Hervorhebung nachführen und prüfen, ob der Schritt erledigt ist. */
function _tourTakt() {
  if (_tourIdx < 0 || !_tourListe) return;
  const s = _tourListe[_tourIdx];
  _tourPositioniere();
  if (typeof s.erfuellt !== 'function') return;
  if (Date.now() - _tourSeit < TOUR_MINDEST) return;
  let fertig = false;
  try { fertig = !!s.erfuellt(_tourBasis); } catch (e) { fertig = false; }
  if (fertig) {
    _tourSeit = Date.now();          // Doppel-Auslösung verhindern
    setTimeout(() => { if (_tourIdx >= 0) tourWeiter(); }, 500);
  }
}

/* ═══════════════════════════════════════════════════
   Darstellung: Ausschnitt-Maske + Sprechblase
═══════════════════════════════════════════════════ */

function _tourZeichne() {
  document.body.classList.add('tour-on');
  const s = _tourListe[_tourIdx];

  // Grundgerüst nur einmal anlegen
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
  const n = _tourListe.length;
  tip.innerHTML = `
    <div class="tour-tip-kopf">
      <span class="tour-zaehler">Schritt ${_tourIdx + 1} / ${n}</span>
      <button class="tour-x" onclick="tourEnde()" aria-label="Vorführung beenden">×</button>
    </div>
    <h4 class="tour-titel">${esc(s.titel)}</h4>
    <div class="tour-text">${s.text}</div>
    <div class="tour-tip-fuss">
      ${_tourIdx > 0 ? '<button class="btn btn-outline btn-sm" onclick="tourZurueck()">← Zurück</button>' : ''}
      ${typeof s.vormachen === 'function' ? '<button class="btn btn-outline btn-sm" onclick="tourVormachen()">Vormachen</button>' : ''}
      <button class="btn btn-primary btn-sm" onclick="tourWeiter()">
        ${_tourIdx === n - 1 ? 'Fertig' : (typeof s.erfuellt === 'function' ? 'Überspringen →' : 'Weiter →')}</button>
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
  ring.style.cssText += `;left:${x}px;top:${y}px;width:${w}px;height:${h}px`;

  // Sprechblase unter das Ziel, sonst darüber
  const tipH = tip.offsetHeight || 200, tipW = tip.offsetWidth || 340;
  const platzUnten = window.innerHeight - (y + h);
  let top = platzUnten > tipH + 20 ? (y + h + 12) : Math.max(12, y - tipH - 12);
  // Erst am rechten Rand einfangen, dann am linken – sonst rutscht die Sprechblase
  // auf schmalen Fenstern ins Negative.
  let left = Math.max(12, Math.min(Math.max(12, x), window.innerWidth - tipW - 12));
  tip.style.transform = 'none';
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

window.addEventListener('resize', () => { if (_tourIdx >= 0) _tourPositioniere(); });

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TOUR_TAKT, TOUR_MINDEST };
}
