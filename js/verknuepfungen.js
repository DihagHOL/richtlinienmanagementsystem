'use strict';

/**
 * Verknüpfungen – Ansicht „🕸 Verknüpfungen" im Reiter Prozesse
 * =============================================================
 * Wer hängt woran? Prozess ↔ Modell ↔ Regelwerk ↔ Standort als Mindmap.
 *
 * Der Aufbau ist der, den Prozessmanagement-Werkzeuge (Signavio, ADONIS, BIC)
 * „Beziehungsansicht" nennen: <b>ein Objekt im Mittelpunkt, seine Beziehungen
 * nach Art gruppiert ringsum</b>. Ein Klick auf einen Nachbarn rückt diesen in
 * die Mitte – so wandert man durch das Netz, statt einen Tellerteppich aus
 * hundert Knoten zu entwirren. Zurück führt der Weg über den Verlauf oben.
 *
 * Dazu die Frage, die eine Landkarte allein nie beantwortet: <b>Was hängt an
 * nichts?</b> Regelwerke ohne Prozess, Prozesse ohne Modell, Modelle ohne
 * Regelwerk – die Lücken stehen als eigene Liste daneben. In den genannten
 * Werkzeugen heißt das „Repository-Analyse"; hier ist es ein Kasten.
 *
 * Die Daten kommen aus drei Quellen, die es alle schon gibt:
 *   Landkarte (Kachel → Modell, Kachel → Standorte)
 *   BPMN-XML  (Modell → Regelwerke, Marker [[rms:policies=…]])
 *   State.policies (Regelwerk → Titel, Status, Geltungsbereich)
 * Nichts davon wird hier zusätzlich gespeichert.
 */

let _vkGraph = null;        // { knoten: Map, kanten: [] }
let _vkLaden = false;
let _vkFokus = '';          // Knoten-Kennung; '' = Gesamtsicht
let _vkPfad = [];           // Verlauf der besuchten Knoten

const VK_ARTEN = {
  wurzel:    { farbe: '#1A2644', text: '#fff', label: 'Landschaft' },
  band:      { farbe: '#17509E', text: '#fff', label: 'Band' },
  prozess:   { farbe: '#dbeada', text: '#2f5d38', label: 'Prozess' },
  modell:    { farbe: '#d2711f', text: '#fff', label: 'BPMN-Modell' },
  regelwerk: { farbe: '#fbf1c2', text: '#7a6417', label: 'Regelwerk' },
  // Werk und Standort sind dasselbe Ding: das Werk führt eine Landkarte UND ist
  // der Ort, für den Prozesse und Regelwerke gelten. Ein Knoten, zwei Rollen.
  werk:      { farbe: '#e6eef8', text: '#1A2644', label: 'Werk / Standort' },
};

/* ── Graph aufbauen ──────────────────────────────────────────────────── */

/** Alle Regelwerks-Verknüpfungen der Modelle holen (mit dem Cache aus prozesse.js). */
async function _vkModellLinks(p) {
  const key = p.itemId + '|' + p.modified;
  if (typeof _procLinkCache !== 'undefined' && _procLinkCache[key]) return _procLinkCache[key];
  try {
    const xml = await spGetProcessXml(p.itemId);
    const ids = (typeof _parsePolicyIds === 'function') ? _parsePolicyIds(xml) : [];
    if (typeof _procLinkCache !== 'undefined') _procLinkCache[key] = ids;
    return ids;
  } catch (e) { return []; }
}

/**
 * Knoten und Kanten aus Landkarte, Modellen und Regelwerken.
 * Die Modelle müssen dafür einzeln gelesen werden – deshalb passiert das
 * einmal beim Öffnen dieser Ansicht und nicht beim Zeichnen der Landkarte.
 */
async function vkGraphBauen() {
  const knoten = new Map();
  const kanten = [];
  const add = (id, art, label, extra) => {
    if (!knoten.has(id)) knoten.set(id, Object.assign({ id, art, label, grad: 0 }, extra || {}));
    return knoten.get(id);
  };
  const link = (von, nach, typ) => {
    if (!knoten.has(von) || !knoten.has(nach)) return;
    kanten.push({ von, nach, typ });
    knoten.get(von).grad++; knoten.get(nach).grad++;
  };

  const werkLabel = (w) => (typeof lkWerkLabel === 'function') ? lkWerkLabel(w) : w;
  const werkKnoten = (w) => {
    const id = 'werk:' + w;
    add(id, 'werk', w === 'ALLE' ? 'Alle Standorte' : werkLabel(w), { werk: w });
    return id;
  };

  add('wurzel', 'wurzel', 'Konzern');
  const alleKacheln = (typeof lkAlleKacheln === 'function') ? lkAlleKacheln() : [];
  const policies = (typeof State !== 'undefined' && Array.isArray(State.policies)) ? State.policies : [];

  // Jedes Werk mit eigener Landkarte hängt unter dem Konzern.
  [...new Set(alleKacheln.map(x => x.werk))].forEach(w => link('wurzel', werkKnoten(w), 'Landkarte von'));

  for (const eintrag of alleKacheln) {
    const w = eintrag.werk, k = eintrag.kachel;
    const pid = `prozess:${w}:${k.id}`;
    add(pid, 'prozess', k.name, { unter: k.unter || '', werk: w, kachelId: k.id });

    const bid = `band:${w}:${k.band}`;
    if (!knoten.has(bid)) {
      const baender = (typeof lkBaenderVon === 'function') ? lkBaenderVon(w) : [];
      const b = baender.find(x => x.key === k.band);
      add(bid, 'band', (b ? b.titel : k.band) + ' · ' + werkLabel(w), { werk: w });
      link('werk:' + w, bid, 'gliedert');
    }
    link(bid, pid, 'enthält');

    // Geltungsbereich der Kachel – dieselben Werk-Knoten
    const g = Array.isArray(k.geltung) ? k.geltung : [];
    ((!g.length || g.includes('ALLE')) ? ['ALLE'] : g).forEach(o => link(pid, werkKnoten(o), 'gilt für'));

    /** Regelwerk als Knoten anlegen (samt seinem Geltungsbereich). */
    const regelwerkKnoten = (rid) => {
      const treffer = policies.find(x => String(x.id) === String(rid));
      if (!treffer) return '';
      const rw = 'regelwerk:' + treffer.id;
      add(rw, 'regelwerk', treffer.title, { policyId: treffer.id, status: treffer.status, version: treffer.version });
      const gb = Array.isArray(treffer.geltungsbereich) ? treffer.geltungsbereich : [];
      ((!gb.length || gb.includes('ALLE')) ? ['ALLE'] : gb).forEach(o => link(rw, werkKnoten(o), 'gilt für'));
      return rw;
    };

    // Regelwerke, die direkt an der Kachel hängen – der Weg für Prozesse, die
    // (noch) kein Modell haben. Ohne ihn bliebe die Mindmap dort leer.
    (Array.isArray(k.regelwerke) ? k.regelwerke : []).forEach(rid => {
      const rw = regelwerkKnoten(rid);
      if (rw) link(pid, rw, 'geregelt durch');
    });

    // Ein Prozess besteht oft aus mehreren Abläufen – alle hängen an der Kachel.
    const modelle = (typeof lkProzesseVon === 'function') ? lkProzesseVon(k) : [];
    for (const modell of modelle) {
      const mid = 'modell:' + modell.itemId;
      add(mid, 'modell', modell.title, { itemId: modell.itemId, modellName: modell.title });
      link(pid, mid, 'modelliert in');

      const ids = await _vkModellLinks(modell);
      ids.forEach(rid => {
        const rw = regelwerkKnoten(rid);
        if (rw) link(mid, rw, 'setzt um');
      });
    }
  }
  return { knoten, kanten };
}

/** Nachbarn eines Knotens, nach Beziehungsart gruppiert. */
function vkNachbarn(id) {
  if (!_vkGraph) return [];
  const gruppen = new Map();
  _vkGraph.kanten.forEach(k => {
    let nid = null, typ = k.typ;
    if (k.von === id) nid = k.nach;
    else if (k.nach === id) { nid = k.von; typ = _vkGegenrichtung(k.typ); }
    if (!nid) return;
    if (!gruppen.has(typ)) gruppen.set(typ, []);
    if (!gruppen.get(typ).some(n => n.id === nid)) gruppen.get(typ).push(_vkGraph.knoten.get(nid));
  });
  return [...gruppen.entries()].map(([typ, liste]) => ({ typ, liste: liste.filter(Boolean) }));
}

function _vkGegenrichtung(typ) {
  return { 'gliedert': 'gehört zu', 'enthält': 'gehört zu', 'modelliert in': 'modelliert',
    'setzt um': 'umgesetzt in', 'gilt für': 'gilt hier', 'Landkarte von': 'gehört zum',
    'geregelt durch': 'regelt' }[typ] || typ;
}

/* ── Ansicht ─────────────────────────────────────────────────────────── */

async function initVerknuepfungen() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  if (!_vkGraph && !_vkLaden) {
    _vkLaden = true;
    const anzahl = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes.length : 0;
    mount.innerHTML = `${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('netz') : ''}
      <div class="doc-loading">Verknüpfungen werden gelesen${anzahl ? ` – ${anzahl} Modell${anzahl > 1 ? 'e' : ''} werden dafür einzeln geöffnet` : ''} …</div>`;
    if (typeof lkDatenLaden === 'function') await lkDatenLaden();
    try { _vkGraph = await vkGraphBauen(); }
    catch (e) {
      _vkLaden = false;
      mount.innerHTML = `<div class="col-warning" style="display:block">Verknüpfungen konnten nicht gelesen werden: ${esc(e.message)}</div>`;
      return;
    }
    _vkLaden = false;
  }
  renderVerknuepfungen();
}

async function vkNeuLaden() { _vkGraph = null; _vkFokus = ''; _vkPfad = []; await initVerknuepfungen(); }

function vkFokus(id) {
  if (!_vkGraph || !_vkGraph.knoten.has(id)) return;
  if (_vkFokus && _vkFokus !== id) _vkPfad.push(_vkFokus);
  _vkFokus = id;
  renderVerknuepfungen();
}
function vkZurueck() {
  _vkFokus = _vkPfad.pop() || '';
  renderVerknuepfungen();
}
function vkGesamt() { _vkFokus = ''; _vkPfad = []; renderVerknuepfungen(); }

function renderVerknuepfungen() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount || !_vkGraph) return;
  const mitte = _vkFokus || 'wurzel';
  const k = _vkGraph.knoten.get(mitte);
  if (!k) { _vkFokus = ''; return renderVerknuepfungen(); }

  mount.innerHTML = `
    ${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('netz') : ''}
    <div class="view-desc" style="margin:0 0 12px">
      Wer hängt woran? In der Mitte steht ein Objekt, ringsum seine Beziehungen –
      ein Klick auf einen Nachbarn rückt diesen in die Mitte.
    </div>
    <div class="view-toolbar">
      ${_vkPfad.length ? `<button class="btn btn-ghost btn-sm" onclick="vkZurueck()">← Zurück</button>` : ''}
      ${_vkFokus ? `<button class="btn btn-ghost btn-sm" onclick="vkGesamt()">⌂ Ganze Landschaft</button>` : ''}
      <label class="field-hint" style="margin:0 6px 0 10px">In die Mitte</label>
      <select id="vk-wahl" onchange="vkFokus(this.value)" style="max-width:280px">
        ${_vkAuswahlHtml(mitte)}
      </select>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-ghost btn-sm" onclick="vkNeuLaden()" title="Verknüpfungen neu einlesen">↻ Aktualisieren</button>
    </div>
    <div class="vk-flaeche">${_vkSvg(mitte)}</div>
    ${_vkAktionenHtml(k)}
    ${_vkNachbarnListe(mitte)}
    ${_vkLueckenHtml()}`;
}

/** Auswahlliste aller Knoten, nach Art gruppiert – damit niemand sich
 *  durch drei Ebenen klicken muss, um ein bestimmtes Objekt zu sehen. */
function _vkAuswahlHtml(mitte) {
  const nachArt = new Map();
  [..._vkGraph.knoten.values()].forEach(n => {
    if (!nachArt.has(n.art)) nachArt.set(n.art, []);
    nachArt.get(n.art).push(n);
  });
  const reihenfolge = ['wurzel', 'band', 'prozess', 'modell', 'regelwerk', 'standort'];
  return reihenfolge.filter(a => nachArt.has(a)).map(a => {
    const liste = nachArt.get(a).sort((x, y) => x.label.localeCompare(y.label, 'de'));
    const eintraege = liste.map(n =>
      `<option value="${esc(n.id)}"${n.id === mitte ? ' selected' : ''}>${esc(n.label)}</option>`).join('');
    return a === 'wurzel' ? eintraege
      : `<optgroup label="${esc((VK_ARTEN[a] || {}).label || a)}">${eintraege}</optgroup>`;
  }).join('');
}

/** Radiale Mindmap: Mitte + Nachbarn, nach Beziehungsart in Sektoren. */
function _vkSvg(mitteId) {
  const mitte = _vkGraph.knoten.get(mitteId);
  const gruppen = vkNachbarn(mitteId);
  const gesamt = gruppen.reduce((n, g) => n + g.liste.length, 0);
  if (!gesamt) {
    return `<svg viewBox="0 0 900 260" class="vk-svg" role="img" aria-label="Beziehungen">
      ${_vkKnotenSvg(mitte, 450, 130, true)}
      <text x="450" y="210" text-anchor="middle" class="vk-leer">Keine Verknüpfungen</text></svg>`;
  }
  // Mehr als ein Dutzend Kästen auf einem Kreis werden unlesbar – die breiten
  // stoßen links und rechts aneinander. Deshalb zeigt das Bild höchstens zwölf,
  // und zwar reihum aus jeder Beziehungsart, damit keine ganz fehlt. Vollständig
  // stehen alle darunter als Chips.
  const MAX = 12;
  const reihum = [];
  const kopien = gruppen.map(g => ({ typ: g.typ, rest: g.liste.slice() }));
  while (reihum.length < Math.min(gesamt, MAX)) {
    let genommen = false;
    for (const g of kopien) {
      if (!g.rest.length || reihum.length >= MAX) continue;
      reihum.push({ n: g.rest.shift(), typ: g.typ });
      genommen = true;
    }
    if (!genommen) break;
  }

  const anzahl = reihum.length;
  const B = 980, H = Math.max(400, 230 + anzahl * 22);
  const cx = B / 2, cy = H / 2;
  const rx = Math.min(390, B / 2 - 100), ry = Math.min(H / 2 - 55, 250);

  const punkte = reihum.map((e, i) => {
    const t = (i + 0.5) / anzahl;
    const w = -Math.PI / 2 + t * 2 * Math.PI;
    const text = _vkKurz(e.n.label, 18);
    const b = Math.max(96, text.length * 7.4 + 26);
    // In der Fläche halten: ein breiter Kasten am Rand ragte sonst heraus.
    const x = Math.min(Math.max(cx + Math.cos(w) * rx, b / 2 + 8), B - b / 2 - 8);
    return { n: e.n, typ: e.typ, text, breite: b, x, y: cy + Math.sin(w) * ry };
  });

  const kanten = punkte.map(p => {
    const mx = (cx + p.x) / 2, my = (cy + p.y) / 2;
    return `<path d="M ${cx} ${cy} Q ${mx} ${my} ${p.x.toFixed(1)} ${p.y.toFixed(1)}" class="vk-kante"/>
      <text class="vk-kanten-text" x="${((cx + p.x * 2) / 3).toFixed(1)}" y="${((cy + p.y * 2) / 3 - 6).toFixed(1)}"
        text-anchor="middle">${esc(p.typ)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${B} ${H}" class="vk-svg" role="img" aria-label="Beziehungen von ${esc(mitte.label)}">
      ${kanten}
      ${punkte.map(p => _vkKnotenSvg(p.n, p.x, p.y, false, p.text, p.breite)).join('')}
      ${_vkKnotenSvg(mitte, cx, cy, true)}
    </svg>`;
}

/** Alle Beziehungen als Text – vollständig, auch was das Bild nicht mehr zeigt. */
function _vkNachbarnListe(mitteId) {
  const gruppen = vkNachbarn(mitteId);
  if (!gruppen.length) return '';
  return `<div class="vk-chips">${gruppen.map(g => `
      <div class="vk-chip-gruppe">
        <div class="vk-chip-kopf">${esc(g.typ)} <span class="vk-zahl">${g.liste.length}</span></div>
        <div>${g.liste.map(n => {
          const art = VK_ARTEN[n.art] || VK_ARTEN.prozess;
          return `<button class="vk-chip" style="background:${art.farbe};color:${art.text}"
            onclick="vkFokus('${esc(n.id)}')" title="${esc(art.label)}: ${esc(n.label)}">${esc(n.label)}</button>`;
        }).join('')}</div>
      </div>`).join('')}</div>`;
}

function _vkKnotenSvg(n, x, y, istMitte, textVor, breiteVor) {
  const art = VK_ARTEN[n.art] || VK_ARTEN.prozess;
  const text = textVor || _vkKurz(n.label, istMitte ? 30 : 18);
  const b = breiteVor || Math.max(96, text.length * (istMitte ? 9.2 : 7.4) + 26);
  const h = istMitte ? 46 : 34;
  return `<g class="vk-knoten${istMitte ? ' vk-mitte' : ''}" ${istMitte ? '' : `onclick="vkFokus('${esc(n.id)}')"`}>
      <rect x="${(x - b / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${b.toFixed(1)}" height="${h}"
        rx="9" fill="${art.farbe}" stroke="rgba(0,0,0,.14)"/>
      <text x="${x.toFixed(1)}" y="${(y + (istMitte ? 5 : 4)).toFixed(1)}" text-anchor="middle"
        fill="${art.text}" font-size="${istMitte ? 15 : 12.5}" font-weight="${istMitte ? 700 : 600}">${esc(text)}</text>
      <title>${esc(art.label)}: ${esc(n.label)}</title>
    </g>`;
}

function _vkKurz(s, max) {
  const t = String(s || '');
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/* ── Lücken: was hängt an nichts? ────────────────────────────────────── */

function vkLuecken() {
  // Über ALLE Werke, nicht nur über die gerade geöffnete Karte – sonst zeigt die
  // Übersicht nur einen Ausschnitt und die Lücken der anderen Werke bleiben blind.
  const alle = (typeof lkAlleKacheln === 'function') ? lkAlleKacheln() : [];
  const kacheln = alle.map(x => Object.assign({ werk: x.werk }, x.kachel));
  const policies = (typeof State !== 'undefined' && Array.isArray(State.policies)) ? State.policies : [];
  const verknuepfteRw = new Set();
  const modelleMitRw = new Set();
  if (_vkGraph) {
    _vkGraph.kanten.filter(k => k.typ === 'setzt um').forEach(k => {
      verknuepfteRw.add(k.nach.replace('regelwerk:', ''));
      modelleMitRw.add(k.von);
    });
  }
  const ohneModell = kacheln.filter(k => !((typeof lkProzesseVon === 'function' ? lkProzesseVon(k) : []).length));
  const modelle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  const modelleOhneRw = modelle.filter(m => !modelleMitRw.has('modell:' + m.itemId));
  const rwOhneProzess = policies.filter(p =>
    p.typ !== 'Konzept' && p.status === 'Veröffentlicht' && !verknuepfteRw.has(String(p.id)));
  const ohneGeltung = kacheln.filter(k => !Array.isArray(k.geltung) || !k.geltung.length);
  // Ein Prozess ganz ohne Bezug – weder Modell noch Regelwerk – ist die eigentliche
  // Baustelle. „Nur kein Modell" ist oft in Ordnung, wenn Regelwerke daran hängen.
  const ohneAllesId = new Set();
  if (_vkGraph) {
    _vkGraph.kanten.forEach(x => {
      if (x.typ === 'modelliert in' || x.typ === 'geregelt durch') ohneAllesId.add(x.von);
    });
  }
  const ohneBezug = kacheln.filter(k => !ohneAllesId.has(`prozess:${k.werk}:${k.id}`));
  return { ohneModell, modelleOhneRw, rwOhneProzess, ohneGeltung, ohneBezug };
}

function _vkLueckenHtml() {
  const l = vkLuecken();
  const block = (titel, eintraege, hinweis, aktion) => `
    <div class="vk-luecke">
      <div class="vk-luecke-kopf">${esc(titel)} <span class="vk-zahl">${eintraege.length}</span></div>
      ${eintraege.length
        ? `<div class="vk-luecke-liste">${eintraege.slice(0, 8).map(aktion).join('')}
             ${eintraege.length > 8 ? `<div class="field-hint">… und ${eintraege.length - 8} weitere</div>` : ''}</div>
           <div class="field-hint" style="margin-top:6px">${esc(hinweis)}</div>`
        : '<div class="field-hint">Nichts offen ✓</div>'}
    </div>`;

  return `<div class="vk-luecken">
      ${block('Prozesse ohne jeden Bezug', l.ohneBezug,
        'Weder Modell noch Regelwerk – hier ist noch gar nichts hinterlegt.',
        (k) => `<div><a href="#" onclick="vkFokus('prozess:${esc(k.werk)}:${esc(k.id)}');return false">${esc(k.name)}</a>
          <span class="field-hint"> · ${esc(k.werk)}</span></div>`)}
      ${block('Prozesse ohne Modell', l.ohneModell,
        'Ein Klick stellt den Prozess in die Mitte – dort lässt sich ein Modell anlegen oder verknüpfen.',
        (k) => `<div><a href="#" onclick="vkFokus('prozess:${esc(k.werk)}:${esc(k.id)}');return false">${esc(k.name)}</a>
          <span class="field-hint"> · ${esc(k.werk)}</span></div>`)}
      ${block('Modelle ohne Regelwerk', l.modelleOhneRw,
        'Im Prozess-Editor lässt sich zuordnen, welche Regelwerke der Ablauf umsetzt.',
        (m) => `<div><a href="#" onclick="openProcessEditor('${esc(m.itemId)}');return false">${esc(m.title)}</a></div>`)}
      ${block('Veröffentlichte Regelwerke ohne Prozess', l.rwOhneProzess,
        'Nicht jedes Regelwerk beschreibt einen Ablauf – aber wo es einen gibt, sollte er verknüpft sein.',
        (p) => `<div><a href="#" onclick="focusPolicyCard('${esc(p.id)}');return false">${esc(p.title)}</a></div>`)}
      ${block('Prozesse ohne Geltungsbereich', l.ohneGeltung,
        'Ungepflegt zählt als konzernweit – besser ausdrücklich festlegen.',
        (k) => `<div><a href="#" onclick="vkZurKarte('${esc(k.werk)}','${esc(k.id)}');return false">${esc(k.name)}</a>
          <span class="field-hint"> · ${esc(k.werk)}</span></div>`)}
    </div>`;
}


/* ── Verknüpfen direkt in der Mindmap ────────────────────────────────────
   „Wer hängt woran" ist erst dann nützlich, wenn man es hier auch ändern kann.
   Prozess → Modell läuft über die Landkarte (dort liegt die Kachel);
   Modell → Regelwerk schreibt den Marker in die BPMN-Datei – dieselbe Stelle,
   die der Prozess-Editor beschreibt, nur ohne den Modeler zu öffnen. */

function _vkDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('prozesse'); }

/** Zur Landkarte des Werks springen (und die Kachel öffnen). */
function vkZurKarte(werk, kachelId) {
  if (typeof lkSetWerk === 'function') lkSetWerk(werk);
  if (typeof setProzessModus === 'function') setProzessModus('karte');
  if (kachelId && typeof lkKachelOeffnen === 'function') setTimeout(() => lkKachelOeffnen(kachelId), 0);
}

/** Aktionsleiste je nach Art des Knotens in der Mitte. */
function _vkAktionenHtml(k) {
  if (!k || !_vkDarfSchreiben()) return '';
  const knopf = (fn, label, art) => `<button class="btn btn-${art || 'outline'} btn-sm" onclick="${fn}">${label}</button>`;
  let inhalt = '';
  if (k.art === 'prozess') {
    const modelle = _vkGraph.kanten.filter(x => x.von === k.id && x.typ === 'modelliert in');
    inhalt = knopf(`vkZurKarte('${esc(k.werk)}','${esc(k.kachelId)}')`,
      modelle.length ? 'In der Landkarte öffnen' : 'Modell anlegen oder verknüpfen',
      modelle.length ? 'ghost' : 'primary');
    if (modelle.length === 1) {
      inhalt = knopf(`vkModellOeffnen('${esc(modelle[0].nach)}')`, 'Modell öffnen', 'primary')
        + knopf(`vkRegelwerkeDialog('${esc(modelle[0].nach)}')`, 'Regelwerke zuordnen') + inhalt;
    } else if (modelle.length > 1) {
      // Bei mehreren Abläufen wäre „das Modell" mehrdeutig – dann führt der Weg
      // über die Kachel, wo alle stehen.
      inhalt = `<span class="field-hint" style="align-self:center">${modelle.length} Modelle – über die Kachel zu öffnen</span>` + inhalt;
    }
  } else if (k.art === 'modell') {
    inhalt = knopf(`vkModellOeffnen('${esc(k.id)}')`, 'Modell öffnen', 'primary')
      + knopf(`vkRegelwerkeDialog('${esc(k.id)}')`, 'Regelwerke zuordnen');
  } else if (k.art === 'regelwerk') {
    inhalt = knopf(`closeModal();focusPolicyCard('${esc(k.policyId)}')`, 'Regelwerk öffnen', 'primary')
      + knopf(`vkRegelwerkAnModell('${esc(k.id)}')`, 'Mit einem Modell verknüpfen');
  }
  return inhalt ? `<div class="vk-aktionen">${inhalt}</div>` : '';
}

function vkModellOeffnen(knotenId) {
  const n = _vkGraph && _vkGraph.knoten.get(knotenId);
  if (n && n.itemId && typeof openProcessEditor === 'function') openProcessEditor(n.itemId);
}

/* ── Regelwerke einem Modell zuordnen (ohne den Modeler zu öffnen) ── */

/** Marker im BPMN-XML setzen/ersetzen/entfernen. Die Dokumentation des Prozesses
 *  ist laut Schema sein erstes Kindelement – dort steht sie auch beim Modeler. */
function vkXmlMitRegelwerken(xml, ids) {
  const namen = ids.map(id => {
    const p = (typeof State !== 'undefined' && (State.policies || [])).find(x => String(x.id) === String(id));
    return p ? p.title : ('Regelwerk ' + id);
  });
  const text = ids.length
    ? `Im Einklang mit den Richtlinien: ${namen.join('; ')}\n[[rms:policies=${ids.join(',')}]]`
    : '';
  const esc2 = (t) => (typeof _xmlEsc === 'function') ? _xmlEsc(t)
    : String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const proc = String(xml).match(/<(\w+:)?process\b[^>]*>/);
  if (!proc) return xml;
  const prefix = proc[1] || '';
  const pos = proc.index + proc[0].length;
  const rest = xml.slice(pos);
  const doku = rest.match(/^(\s*)<(\w+:)?documentation\b[^>]*>[\s\S]*?<\/(\w+:)?documentation>/);
  if (doku) {
    const ersatz = text ? `${doku[1]}<${prefix}documentation>${esc2(text)}</${prefix}documentation>` : '';
    return xml.slice(0, pos) + ersatz + rest.slice(doku[0].length);
  }
  if (!text) return xml;
  return xml.slice(0, pos) + `\n    <${prefix}documentation>${esc2(text)}</${prefix}documentation>` + rest;
}

function vkRegelwerkeDialog(modellKnoten) {
  const n = _vkGraph && _vkGraph.knoten.get(modellKnoten);
  if (!n) return;
  const schon = _vkGraph.kanten.filter(x => x.von === n.id && x.typ === 'setzt um')
    .map(x => x.nach.replace('regelwerk:', ''));
  const policies = ((typeof State !== 'undefined' && State.policies) || [])
    .filter(p => p.typ !== 'Konzept')
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  openModal(`
    <div class="modal-header"><h3>Regelwerke zuordnen</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Welche Regelwerke setzt <b>${esc(n.label)}</b> um?
        Die Zuordnung wird in der BPMN-Datei gespeichert – dieselbe Stelle, die auch der
        Prozess-Editor beschreibt.</p>
      <div style="max-height:340px;overflow:auto;border:1px solid var(--c-border);border-radius:9px;padding:10px">
        ${policies.length ? policies.map(p => `<label class="ack-check" style="font-weight:500">
          <input type="checkbox" value="${esc(p.id)}" ${schon.includes(String(p.id)) ? 'checked' : ''}>
          <span>${esc(p.title)} <span class="field-hint">· ${esc(p.status || '')}</span></span></label>`).join('')
          : '<div class="field-hint">Es gibt noch keine Regelwerke.</div>'}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="vkRegelwerkeSpeichern('${esc(n.id)}')">Speichern</button>
    </div>`);
}

async function vkRegelwerkeSpeichern(modellKnoten) {
  const n = _vkGraph && _vkGraph.knoten.get(modellKnoten);
  if (!n || !n.itemId) return;
  const host = document.querySelector('.modal-body');
  const ids = host ? [...host.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value) : [];
  closeModal();
  try {
    const xml = await spGetProcessXml(n.itemId);
    await spSaveProcess(n.modellName || n.label, vkXmlMitRegelwerken(xml, ids));
    if (typeof _procLinkCache !== 'undefined') _procLinkCache = {};
    if (typeof _processes !== 'undefined') _processes = null;
    toast(ids.length ? `${ids.length} Regelwerk(e) zugeordnet ✓` : 'Zuordnung entfernt ✓', 'success');
    await vkNeuLaden();
    vkFokus(modellKnoten);
  } catch (e) {
    toast('Zuordnung fehlgeschlagen: ' + e.message, 'error');
  }
}

/** Vom Regelwerk aus: an welchem Modell soll es hängen? */
function vkRegelwerkAnModell(regelwerkKnoten) {
  const n = _vkGraph && _vkGraph.knoten.get(regelwerkKnoten);
  const modelle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  if (!n) return;
  if (!modelle.length) { toast('Es gibt noch kein Modell zum Verknüpfen.', 'error'); return; }
  openModal(`
    <div class="modal-header"><h3>Regelwerk mit einem Modell verknüpfen</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Welcher Ablauf setzt <b>${esc(n.label)}</b> um?</p>
      <div class="form-group full">
        <select id="vk-modell-wahl">${modelle.map(m =>
          `<option value="${esc(m.itemId)}">${esc(m.title)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="vkRegelwerkAnModellSpeichern('${esc(n.policyId)}')">Verknüpfen</button>
    </div>`);
}

async function vkRegelwerkAnModellSpeichern(policyId) {
  const wahl = document.getElementById('vk-modell-wahl');
  const modelle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  const m = wahl && modelle.find(x => x.itemId === wahl.value);
  if (!m) return;
  closeModal();
  try {
    const xml = await spGetProcessXml(m.itemId);
    const vorhanden = (typeof _parsePolicyIds === 'function') ? _parsePolicyIds(xml) : [];
    const ids = vorhanden.includes(String(policyId)) ? vorhanden : vorhanden.concat(String(policyId));
    await spSaveProcess(m.title, vkXmlMitRegelwerken(xml, ids));
    if (typeof _procLinkCache !== 'undefined') _procLinkCache = {};
    if (typeof _processes !== 'undefined') _processes = null;
    toast(`Mit „${m.title}" verknüpft ✓`, 'success');
    await vkNeuLaden();
    vkFokus('regelwerk:' + policyId);
  } catch (e) {
    toast('Verknüpfen fehlgeschlagen: ' + e.message, 'error');
  }
}
