/**
 * Mindmap als Baum: Wurzel links, Äste nach rechts.
 *
 * Die radiale Fokus-Ansicht beantwortet „was hängt an diesem einen Objekt?" –
 * gut zum Erkunden, schlecht zum Überblicken. Für den Überblick will man das,
 * was jedes Mindmap-Werkzeug zeigt: eine Wurzel, farbige Äste, aufklappbare
 * Zweige. Genau das ist diese Ansicht.
 *
 * Gezeichnet wird aus demselben Graphen wie die Fokus-Ansicht (_vkGraph) –
 * nur die hierarchischen Beziehungen, nicht die querlaufenden („gilt für").
 * Sonst wäre es kein Baum.
 *
 * Neue Zweige lassen sich direkt hier anlegen: das „+" am Knoten öffnet das
 * passende Fenster – Prozess, Modell oder Regelwerk, je nachdem, worauf es sitzt.
 */

/* Nur diese Beziehungen bilden die Hierarchie. „gilt für" verbindet quer und
   würde aus dem Baum wieder ein Netz machen. */
const VB_TYPEN = ['Landkarte von', 'gliedert', 'enthält', 'modelliert in', 'setzt um', 'geregelt durch'];

/* In der Abhängigkeits-Ansicht gehören die Verweise zwischen Prozessen dazu:
   Sie sind der Grund, warum ein Prozess ein anderes Werk betrifft. In der
   Übersicht bleiben sie draußen – dort stünde jeder Unterprozess zweimal,
   einmal unter seinem Bereich und einmal unter seinem Hauptprozess. */
const VB_VERWEIS_TYPEN = ['unterprozesse', 'danach folgt', 'nutzt'];

let _vbModus = 'baum';     // 'baum' = ganze Landschaft · 'abhaengig' = ab einem Knoten

function vbTypen() {
  return _vbModus === 'abhaengig' ? VB_TYPEN.concat(VB_VERWEIS_TYPEN) : VB_TYPEN;
}

/** Modus und Wurzel setzen; die aufgeklappten Zweige gelten für den alten Baum. */
function vbModusSetzen(modus, wurzel) {
  _vbModus = (modus === 'abhaengig') ? 'abhaengig' : 'baum';
  _vbWurzel = wurzel || '';
  _vbOffen = null;         // neu aufbauen: Wurzel und erste Ebene offen
  _vbWahl = '';
}

/* Astfarben aus dem DIHAG-Corporate-Design. Jeder Ast der ersten Ebene bekommt
   eine, alles darunter erbt sie – so sieht man die Zugehörigkeit ohne Linien
   zu verfolgen. */
const VB_PALETTE = ['#17509E', '#F08300', '#1A2644', '#5B8CB8', '#7A6417', '#424241'];

const VB_SPALTE = [220, 195, 180, 170, 165];   // Knotenbreite je Tiefe
const VB_LUECKE = 46;                          // Abstand zwischen den Spalten
const VB_ZEILE = 46;                           // Höhe einer Blattzeile
const VB_HOEHE = [54, 44, 40, 38, 38];         // Knotenhöhe je Tiefe

let _vbWurzel = '';        // gewählte Wurzel ('' = automatisch das offene Werk)
let _vbOffen = null;       // Set der aufgeklappten Pfade (null = noch nie gezeichnet)
let _vbWahl = '';          // ausgewählter Pfad
let _vbZoom = 1;           // 1 · 0.8 · 0.65

/* ── Baum aufbauen ───────────────────────────────────────────────────── */

/** Welche Wurzel? Standard ist das Werk, dessen Landkarte gerade offen ist. */
function vbWurzelId() {
  if (_vbWurzel && _vkGraph && _vkGraph.knoten.has(_vbWurzel)) return _vbWurzel;
  const eigen = (typeof _lkWerk !== 'undefined') ? 'werk:' + _lkWerk : '';
  if (_vkGraph && _vkGraph.knoten.has(eigen)) return eigen;
  return 'wurzel';
}

function _vbKinder(id) {
  if (!_vkGraph) return [];
  const raus = [];
  _vkGraph.kanten.forEach(k => {
    if (k.von !== id || !vbTypen().includes(k.typ)) return;
    if (raus.some(x => x.id === k.nach)) return;
    const n = _vkGraph.knoten.get(k.nach);
    if (n) raus.push({ id: k.nach, typ: k.typ, knoten: n });
  });
  return raus;
}

/**
 * Einen Ast aufbauen. `ahnen` schützt vor Zyklen: Ein Regelwerk, das an zwei
 * Prozessen hängt, darf zweimal im Baum stehen – aber nie unter sich selbst.
 */
function _vbAst(id, elternPfad, tiefe, farbe, ahnen) {
  const n = _vkGraph.knoten.get(id);
  if (!n) return null;
  const pfad = elternPfad ? elternPfad + '|' + id : id;
  const kinder = _vbKinder(id).filter(x => !ahnen.has(x.id));
  const offen = _vbOffen.has(pfad);
  const ast = { id, pfad, tiefe, farbe, daten: n, label: n.label, art: n.art,
    anzahl: kinder.length, offen, kinder: [] };
  if (offen && kinder.length) {
    const weiter = new Set(ahnen); weiter.add(id);
    ast.kinder = kinder.map((x, i) => _vbAst(x.id, pfad, tiefe + 1,
      tiefe === 0 ? VB_PALETTE[i % VB_PALETTE.length] : farbe, weiter)).filter(Boolean);
  }
  return ast;
}

function vbBaum() {
  if (!_vkGraph) return null;
  const wurzel = vbWurzelId();
  if (_vbOffen === null) {
    // Beim ersten Zeichnen: Wurzel und die erste Ebene offen – so sieht man die
    // Gliederung, ohne von allem erschlagen zu werden.
    _vbOffen = new Set([wurzel]);
    _vbKinder(wurzel).forEach(x => _vbOffen.add(wurzel + '|' + x.id));
  }
  _vbOffen.add(wurzel);
  return _vbAst(wurzel, '', 0, VB_PALETTE[0], new Set());
}

/** Positionen vergeben: Blätter der Reihe nach, Eltern mittig zu ihren Kindern. */
function vbLayout(ast) {
  const flach = [];
  let y = 0;
  const setze = (n) => {
    const breite = VB_SPALTE[Math.min(n.tiefe, VB_SPALTE.length - 1)];
    const hoehe = VB_HOEHE[Math.min(n.tiefe, VB_HOEHE.length - 1)];
    n.x = 0;
    for (let t = 0; t < n.tiefe; t++) n.x += VB_SPALTE[Math.min(t, VB_SPALTE.length - 1)] + VB_LUECKE;
    n.breite = breite; n.hoehe = hoehe;
    if (!n.kinder.length) { n.mitte = y + VB_ZEILE / 2; y += VB_ZEILE; }
    else {
      n.kinder.forEach(setze);
      n.mitte = (n.kinder[0].mitte + n.kinder[n.kinder.length - 1].mitte) / 2;
    }
    n.y = n.mitte - hoehe / 2;
    flach.push(n);
  };
  setze(ast);
  const breite = Math.max(...flach.map(n => n.x + n.breite)) + 20;
  return { flach, breite, hoehe: Math.max(y, VB_ZEILE) + 20 };
}

/* ── Zeichnen ────────────────────────────────────────────────────────── */

/** Hex-Farbe mit Deckkraft – für die helleren Ebenen. */
function _vbTon(hex, deckung) {
  const h = String(hex || '#17509E').replace('#', '');
  const z = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(z >> 16) & 255},${(z >> 8) & 255},${z & 255},${deckung})`;
}

function _vbLinien(flach) {
  return flach.filter(n => n.kinder.length).map(n => n.kinder.map(k => {
    const x1 = n.x + n.breite, y1 = n.mitte, x2 = k.x, y2 = k.mitte;
    const dx = Math.max(18, (x2 - x1) / 2);
    return `<path d="M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}"
      fill="none" stroke="${k.farbe}" stroke-width="${k.tiefe <= 1 ? 2.5 : 1.6}"
      stroke-linecap="round" opacity="${k.tiefe <= 1 ? 0.95 : 0.55}"/>`;
  }).join('')).join('');
}

/**
 * Beschriftung im Baum. Bänder heißen im Graphen „Kernprozesse · HOL", damit
 * sie in der Nahsicht unterscheidbar sind. Im Baum steht das Werk schon an der
 * Wurzel – dann ist der Zusatz nur Rauschen.
 */
function _vbLabel(n) {
  const wurzel = vbWurzelId();
  if (n.art === 'band' && n.daten.werk && wurzel === 'werk:' + n.daten.werk) {
    const anhang = ' · ' + ((typeof lkWerkLabel === 'function') ? lkWerkLabel(n.daten.werk) : n.daten.werk);
    if (n.label.endsWith(anhang)) return n.label.slice(0, -anhang.length);
  }
  return n.label;
}

function _vbKnotenHtml(n) {
  const t = Math.min(n.tiefe, 3);
  const stil = t === 0 ? `background:${n.farbe === VB_PALETTE[0] ? '#1A2644' : n.farbe};color:#fff`
    : t === 1 ? `background:${n.farbe};color:#fff`
    : t === 2 ? `background:${_vbTon(n.farbe, .13)};color:#243044;border:1px solid ${_vbTon(n.farbe, .3)}`
    : `background:#fff;color:#334155;border:1px solid ${_vbTon(n.farbe, .42)}`;
  const versteckt = !n.offen && n.anzahl;
  const art = (typeof VK_ARTEN !== 'undefined' && VK_ARTEN[n.art]) ? VK_ARTEN[n.art].label : n.art;
  return `<div class="vb-knoten vb-t${t}${_vbWahl === n.pfad ? ' vb-gewaehlt' : ''}"
      style="left:${n.x}px;top:${n.y}px;width:${n.breite}px;min-height:${n.hoehe}px;${stil}"
      role="button" tabindex="0" aria-expanded="${n.anzahl ? n.offen : ''}"
      aria-label="${esc(_vbLabel(n))} – ${esc(art)}${n.anzahl ? `, ${n.anzahl} untergeordnet` : ''}"
      title="${esc(n.label)} · ${esc(art)}"
      onclick="vbKlick('${esc(n.pfad)}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();vbKlick('${esc(n.pfad)}')}">
      <span class="vb-text">${esc(_vbLabel(n))}</span>
      ${versteckt ? `<span class="vb-zahl" title="${n.anzahl} zugeklappt">${n.anzahl}</span>` : ''}
      ${_vbPlusHtml(n)}
    </div>`;
}

/** Das „+" am Knoten – nur dort, wo sich wirklich etwas anlegen lässt. */
function _vbPlusHtml(n) {
  if (typeof lkDarfSchreiben === 'function' && !lkDarfSchreiben()) return '';
  if (!['werk', 'band', 'prozess', 'modell'].includes(n.art)) return '';
  const was = { werk: 'Prozess', band: 'Prozess', prozess: 'Modell oder Regelwerk', modell: 'Regelwerk' }[n.art];
  return `<button class="vb-plus" title="${esc(was)} hinzufügen"
      aria-label="${esc(was)} zu ${esc(n.label)} hinzufügen"
      onclick="event.stopPropagation();vbPlus('${esc(n.pfad)}')">+</button>`;
}

function vbRenderHtml() {
  const ast = vbBaum();
  if (!ast) return '<div class="field-hint">Noch nichts zu zeigen.</div>';
  const { flach, breite, hoehe } = vbLayout(ast);
  // Der Zoom skaliert die Bühne; die Fläche darunter trägt die *skalierte*
  // Größe – sonst bliebe beim Verkleinern der alte Platzbedarf stehen.
  return `<div class="vb-rahmen">
      <div class="vb-flaeche" style="width:${Math.round(breite * _vbZoom)}px;height:${Math.round(hoehe * _vbZoom)}px">
        <div class="vb-buehne" style="width:${breite}px;height:${hoehe}px;transform:scale(${_vbZoom});">
          <svg class="vb-linien" width="${breite}" height="${hoehe}" aria-hidden="true">${_vbLinien(flach)}</svg>
          ${flach.map(_vbKnotenHtml).join('')}
        </div>
      </div>
    </div>`;
}

/* ── Bedienung ───────────────────────────────────────────────────────── */

function _vbFinde(pfad, ast) {
  if (!ast) return null;
  if (ast.pfad === pfad) return ast;
  for (const k of ast.kinder) { const t = _vbFinde(pfad, k); if (t) return t; }
  return null;
}

/** Klick auf einen Knoten: auswählen und – wenn er Kinder hat – auf-/zuklappen. */
function vbKlick(pfad) {
  _vbWahl = pfad;
  if (_vbOffen.has(pfad)) _vbOffen.delete(pfad);
  else _vbOffen.add(pfad);
  renderVerknuepfungen();
}

function vbSetWurzel(id) { _vbWurzel = id || ''; _vbOffen = null; _vbWahl = ''; renderVerknuepfungen(); }
function vbZoom(z) { _vbZoom = z; renderVerknuepfungen(); }

function vbAlleAuf() {
  const grenze = 400;   // bei sehr großen Bäumen bleibt es beim Vorhandenen
  const sammeln = (id, pfad, ahnen, tiefe) => {
    if (_vbOffen.size > grenze || tiefe > 6) return;
    const p = pfad ? pfad + '|' + id : id;
    _vbOffen.add(p);
    const weiter = new Set(ahnen); weiter.add(id);
    _vbKinder(id).filter(x => !ahnen.has(x.id)).forEach(x => sammeln(x.id, p, weiter, tiefe + 1));
  };
  _vbOffen = new Set();
  sammeln(vbWurzelId(), '', new Set(), 0);
  renderVerknuepfungen();
}

function vbAlleZu() {
  _vbOffen = new Set([vbWurzelId()]);
  _vbWahl = '';
  renderVerknuepfungen();
}

/** Der ausgewählte Knoten – für die Aktionsleiste unter dem Baum. */
function vbWahlKnoten() {
  if (!_vbWahl || !_vkGraph) return null;
  const id = _vbWahl.split('|').pop();
  return _vkGraph.knoten.get(id) || null;
}

/* ── Hinzufügen ──────────────────────────────────────────────────────── */

/**
 * Das „+" öffnet, was an dieser Stelle Sinn ergibt:
 *   Werk/Band → neuer Prozess (Band vorbelegt)
 *   Prozess   → Modell anlegen, Modell verknüpfen oder Regelwerk zuordnen
 *   Modell    → Regelwerke zuordnen
 */
function vbPlus(pfad) {
  const ast = _vbFinde(pfad, vbBaum());
  const n = ast ? ast.daten : (_vkGraph && _vkGraph.knoten.get(String(pfad).split('|').pop()));
  if (!n) return;
  _vbWahl = pfad;
  const werk = n.werk || (typeof _lkWerk !== 'undefined' ? _lkWerk : '');
  if (typeof lkWerkSetzenStill === 'function' && werk) lkWerkSetzenStill(werk);

  if (n.art === 'werk' || n.art === 'band') {
    const band = (n.art === 'band') ? String(n.id).split(':')[2] : '';
    if (typeof lkKachelNeu === 'function') lkKachelNeu(band);
    return;
  }
  if (n.art === 'modell') {
    if (typeof vkRegelwerkeDialog === 'function') vkRegelwerkeDialog(n.id);
    return;
  }
  if (n.art === 'prozess') {
    const id = n.kachelId;
    openModal(`
      <div class="modal-header"><h3>Zu „${esc(n.label)}" hinzufügen</h3>
        <button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <p class="field-hint" style="margin:0 0 12px">Was soll an diesem Prozess hängen?</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary" onclick="closeModal();lkProzessAnlegen('${esc(id)}')">
            🔀 Neues BPMN-Modell anlegen</button>
          <button class="btn btn-outline" onclick="closeModal();lkVerknuepfenDialog('${esc(id)}')">
            🔗 Vorhandenes Modell verknüpfen</button>
          <button class="btn btn-outline" onclick="closeModal();lkRegelwerkeDialog('${esc(id)}')">
            📕 Regelwerke zuordnen</button>
        </div>
      </div>`);
  }
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VB_TYPEN, VB_PALETTE };
}
