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
  standort:  { farbe: '#e6eef8', text: '#1A2644', label: 'Standort' },
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

  add('wurzel', 'wurzel', 'Prozesslandschaft');
  (typeof lkBaender === 'function' ? lkBaender() : []).forEach(b => {
    add('band:' + b.key, 'band', b.titel);
    link('wurzel', 'band:' + b.key, 'gliedert');
  });

  const kacheln = (typeof lkKacheln === 'function') ? lkKacheln() : [];
  const policies = (typeof State !== 'undefined' && Array.isArray(State.policies)) ? State.policies : [];

  for (const k of kacheln) {
    const pid = 'prozess:' + k.id;
    add(pid, 'prozess', k.name, { unter: k.unter || '' });
    if (knoten.has('band:' + k.band)) link('band:' + k.band, pid, 'enthält');

    // Standorte (Geltungsbereich der Kachel)
    const g = Array.isArray(k.geltung) ? k.geltung : [];
    const orte = (!g.length || g.includes('ALLE'))
      ? ['ALLE'] : g;
    orte.forEach(o => {
      const sid = 'standort:' + o;
      add(sid, 'standort', o === 'ALLE' ? 'Alle Standorte' : o);
      link(pid, sid, 'gilt für');
    });

    const modell = (typeof lkProzessVon === 'function') ? lkProzessVon(k) : null;
    if (!modell) continue;
    const mid = 'modell:' + modell.itemId;
    add(mid, 'modell', modell.title, { itemId: modell.itemId });
    link(pid, mid, 'modelliert in');

    const ids = await _vkModellLinks(modell);
    ids.forEach(rid => {
      const treffer = policies.find(x => String(x.id) === String(rid));
      if (!treffer) return;
      const rw = 'regelwerk:' + treffer.id;
      add(rw, 'regelwerk', treffer.title, { policyId: treffer.id, status: treffer.status, version: treffer.version });
      link(mid, rw, 'setzt um');
      const gb = Array.isArray(treffer.geltungsbereich) ? treffer.geltungsbereich : [];
      ((!gb.length || gb.includes('ALLE')) ? ['ALLE'] : gb).forEach(o => {
        const sid = 'standort:' + o;
        add(sid, 'standort', o === 'ALLE' ? 'Alle Standorte' : o);
        link(rw, sid, 'gilt für');
      });
    });
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
    'setzt um': 'umgesetzt in', 'gilt für': 'gilt für' }[typ] || typ;
}

/* ── Ansicht ─────────────────────────────────────────────────────────── */

async function initVerknuepfungen() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  if (!_vkGraph && !_vkLaden) {
    _vkLaden = true;
    mount.innerHTML = `${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('netz') : ''}
      <div class="doc-loading">Verknüpfungen werden gelesen – die Modelle werden dafür einzeln geöffnet …</div>`;
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
  const kacheln = (typeof lkKacheln === 'function') ? lkKacheln() : [];
  const policies = (typeof State !== 'undefined' && Array.isArray(State.policies)) ? State.policies : [];
  const verknuepfteRw = new Set();
  const modelleMitRw = new Set();
  if (_vkGraph) {
    _vkGraph.kanten.filter(k => k.typ === 'setzt um').forEach(k => {
      verknuepfteRw.add(k.nach.replace('regelwerk:', ''));
      modelleMitRw.add(k.von);
    });
  }
  const ohneModell = kacheln.filter(k => !(typeof lkProzessVon === 'function' && lkProzessVon(k)));
  const modelle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  const modelleOhneRw = modelle.filter(m => !modelleMitRw.has('modell:' + m.itemId));
  const rwOhneProzess = policies.filter(p =>
    p.typ !== 'Konzept' && p.status === 'Veröffentlicht' && !verknuepfteRw.has(String(p.id)));
  const ohneGeltung = kacheln.filter(k => !Array.isArray(k.geltung) || !k.geltung.length);
  return { ohneModell, modelleOhneRw, rwOhneProzess, ohneGeltung };
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
      ${block('Prozesse ohne Modell', l.ohneModell,
        'In der Landkarte anklicken und „Modell anlegen".',
        (k) => `<div><a href="#" onclick="setProzessModus('karte');return false">${esc(k.name)}</a></div>`)}
      ${block('Modelle ohne Regelwerk', l.modelleOhneRw,
        'Im Prozess-Editor lässt sich zuordnen, welche Regelwerke der Ablauf umsetzt.',
        (m) => `<div><a href="#" onclick="openProcessEditor('${esc(m.itemId)}');return false">${esc(m.title)}</a></div>`)}
      ${block('Veröffentlichte Regelwerke ohne Prozess', l.rwOhneProzess,
        'Nicht jedes Regelwerk beschreibt einen Ablauf – aber wo es einen gibt, sollte er verknüpft sein.',
        (p) => `<div><a href="#" onclick="focusPolicyCard('${esc(p.id)}');return false">${esc(p.title)}</a></div>`)}
      ${block('Prozesse ohne Geltungsbereich', l.ohneGeltung,
        'Ungepflegt zählt als konzernweit – besser ausdrücklich festlegen.',
        (k) => `<div><a href="#" onclick="setProzessModus('karte');return false">${esc(k.name)}</a></div>`)}
    </div>`;
}
