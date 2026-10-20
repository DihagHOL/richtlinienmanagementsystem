'use strict';

/**
 * Vergleich IST → SOLL – „⇄ Vergleich" im Reiter Prozesse
 * ========================================================
 * Prozessorientiert arbeiten heißt auch festhalten, was aus jedem Schritt des
 * bisherigen Ablaufs wird. In der Prozessanalyse ist das die Gegenüberstellung
 * von IST und SOLL (Delta- oder Gap-Analyse): je Schritt, ob er bleibt, sich
 * ändert, automatisiert wird, mit anderen zusammengelegt wird oder entfällt,
 * und was im SOLL neu ist, jeweils mit dem Grund (etwa der Schwachstelle aus
 * der IST-Aufnahme).
 *
 * Die Ansicht zeigt das IST oben und das SOLL darunter, farbig wie in der
 * Modellansicht. Jede Zuordnung hat eine Nummer und eine Farbe, die in beiden
 * Diagrammen am Schritt steht: So ist zu sehen, was zu wem gehört. Was
 * entfällt, ist rot umrandet, was neu ist, blau.
 *
 * Gespeichert wird am SOLL (Hauptprozess), als Marker in seiner BPMN-Datei
 * (pm.vergleich, js/prozessmodell.js). IST sind die IST-Modelle an der Karte
 * des Prozesses (pzKarten), SOLL der Hauptprozess und seine Teilprozesse.
 */

/** Farben der Zuordnungen: gut zu unterscheiden, weiße Schrift darauf lesbar. */
const PV_FARBEN = ['#17509E', '#C2410C', '#15803d', '#7c3aed', '#0e7490', '#a16207', '#be185d', '#4d7c0f', '#1d4ed8', '#9a3412', '#6d28d9', '#047857'];
const PV_ROT = '#b91c1c', PV_BLAU = '#0284C7';
/** Was verglichen wird: die Tätigkeiten, nicht Rauten und Ereignisse. */
const PV_SCHRITT_ARTEN = ['mensch', 'automatik', 'handgriff', 'unter', 'ohne'];
const PV_FUELLWOERTER = new Set(['und', 'oder', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'im', 'in', 'an', 'am',
  'zu', 'zur', 'zum', 'per', 'mit', 'von', 'vom', 'für', 'auf', 'aus', 'bei', 'nach', 'je']);

/* ── Rechnen (ohne DOM) ─────────────────────────────────────────────── */

function pvFarbe(nr) { return PV_FARBEN[(Math.max(1, nr) - 1) % PV_FARBEN.length]; }

/** Die Farbe einer Zuordnung: rot, wenn der Schritt entfällt, blau, wenn er neu ist, sonst die der Nummer. */
function pvZeilenFarbe(z, nr) {
  return z.art === 'entfaellt' ? PV_ROT : z.art === 'neu' ? PV_BLAU : pvFarbe(nr);
}

function _pvXml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** Die Schritte eines Modells, die verglichen werden: Tätigkeiten mit Nummer, Name und Bahn. */
function pvSchritte(modellId, ablauf) {
  return ((ablauf && ablauf.schritte) || []).filter(s => PV_SCHRITT_ARTEN.includes(s.art))
    .map(s => ({ ref: String(modellId) + ':' + s.id, id: s.id, nr: s.nr, name: s.name || '(ohne Namen)', bahn: s.bahn || '' }));
}

/** Die Wörter eines Schrittnamens, ohne Füllwörter: zum Vergleichen. */
function pvWoerter(name) {
  return new Set(String(name || '').toLowerCase().replace(/[^a-zäöüß0-9]+/g, ' ').split(' ')
    .filter(w => w.length > 1 && !PV_FUELLWOERTER.has(w)));
}

/** Ähnlichkeit zweier Namen: Anteil gemeinsamer Wörter (0 bis 1). */
function pvAehnlich(a, b) {
  const x = pvWoerter(a), y = pvWoerter(b);
  if (!x.size || !y.size) return 0;
  let gleich = 0;
  x.forEach(w => { if (y.has(w)) gleich++; });
  return gleich / (x.size + y.size - gleich);
}

/**
 * Vorschläge: Paare aus IST- und SOLL-Schritten mit ähnlichem Namen, die noch
 * in keiner Zuordnung stehen; jeder Schritt höchstens einmal, die ähnlichsten
 * zuerst. Gleicher Name: „bleibt", ähnlicher: „geändert". → [{ art, ist, soll, grund }]
 */
function pvVorschlaege(ist, soll, zeilen, schwelle) {
  const grenze = schwelle == null ? 0.5 : schwelle;
  const belegt = new Set((zeilen || []).flatMap(z => (z.ist || []).concat(z.soll || [])));
  const paare = [];
  (ist || []).filter(a => !belegt.has(a.ref)).forEach(a => (soll || []).filter(b => !belegt.has(b.ref)).forEach(b => {
    const w = pvAehnlich(a.name, b.name);
    if (w >= grenze) paare.push({ a, b, w });
  }));
  paare.sort((p, q) => q.w - p.w);
  const genommen = new Set(), out = [];
  paare.forEach(p => {
    if (genommen.has(p.a.ref) || genommen.has(p.b.ref)) return;
    genommen.add(p.a.ref); genommen.add(p.b.ref);
    out.push({ art: p.w === 1 ? 'bleibt' : 'geaendert', ist: [p.a.ref], soll: [p.b.ref], grund: '' });
  });
  return out;
}

/** Wie viel zugeordnet ist, und was noch offen ist. */
function pvAbdeckung(ist, soll, zeilen) {
  const belegt = new Set((zeilen || []).flatMap(z => (z.ist || []).concat(z.soll || [])));
  const offenIst = (ist || []).filter(s => !belegt.has(s.ref)), offenSoll = (soll || []).filter(s => !belegt.has(s.ref));
  return { istGesamt: (ist || []).length, istZu: (ist || []).length - offenIst.length,
    sollGesamt: (soll || []).length, sollZu: (soll || []).length - offenSoll.length, offenIst, offenSoll };
}

/**
 * Die Marken eines Diagramms: je Element die Nummern und Farben der
 * Zuordnungen, in denen es auf dieser Seite steht. → Map(elementId → [{ nr, farbe }])
 */
function pvMarken(zeilen, seite, modellId) {
  const out = new Map(), vorn = String(modellId) + ':';
  (zeilen || []).forEach((z, i) => (z[seite] || []).forEach(ref => {
    if (!String(ref).startsWith(vorn)) return;
    const id = String(ref).slice(vorn.length);
    if (!out.has(id)) out.set(id, []);
    out.get(id).push({ nr: i + 1, farbe: pvZeilenFarbe(z, i + 1) });
  }));
  return out;
}

/** Lage und Größe der Formen aus dem BPMN-XML. → { elementId: { x, y, w, h } } */
function pvBoundsAusXml(xml) {
  const out = {};
  for (const m of String(xml || '').matchAll(/<(\w+:)?BPMNShape\b([^>]*)>([\s\S]*?)<\/(\w+:)?BPMNShape>/g)) {
    const el = (m[2].match(/\bbpmnElement="([^"]+)"/) || [])[1];
    const b = m[3].match(/<(\w+:)?Bounds\b([^>]*)\/?>/);
    if (!el || !b) continue;
    const zahl = (n) => parseFloat((b[2].match(new RegExp('\\b' + n + '="([^"]+)"')) || [])[1]);
    const x = zahl('x'), y = zahl('y'), w = zahl('width'), h = zahl('height');
    if ([x, y, w, h].every(v => isFinite(v))) out[el] = { x, y, w, h };
  }
  return out;
}

/** Ein SVG um `rand` Punkte auf jeder Seite größer machen (Platz für die Nummern). */
function pvSvgRand(svg, rand) {
  return String(svg).replace(/<svg\b[^>]*>/, (kopf) => {
    const vb = ((kopf.match(/\bviewBox="([^"]*)"/) || [])[1] || '').split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !vb.every(isFinite)) return kopf;
    const b = vb[2] + 2 * rand, h = vb[3] + 2 * rand;
    return kopf.replace(/\bviewBox="[^"]*"/, `viewBox="${vb[0] - rand} ${vb[1] - rand} ${b} ${h}"`)
      .replace(/\bwidth="[^"]*"/, `width="${b}"`).replace(/\bheight="[^"]*"/, `height="${h}"`);
  });
}

/** Die Marken ins Bild: ein Rahmen in der Farbe der Zuordnung und je Zuordnung eine Nummer. */
function pvSvgMitMarken(svg, bounds, marken) {
  const teile = [];
  marken.forEach((liste, id) => {
    const b = bounds[id];
    if (!b || !liste.length) return;
    teile.push(`<rect x="${b.x - 6}" y="${b.y - 6}" width="${b.w + 12}" height="${b.h + 12}" rx="12" fill="none" stroke="${liste[0].farbe}" stroke-width="4"/>`);
    liste.forEach((m, i) => {
      const cx = b.x - 2 + i * 28, cy = b.y - 8;
      teile.push(`<circle cx="${cx}" cy="${cy}" r="13" fill="${m.farbe}" stroke="#fff" stroke-width="2"/>`
        + `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#fff">${m.nr}</text>`);
    });
  });
  if (!teile.length) return svg;
  return pvSvgRand(svg, 24).replace(/<\/svg>\s*$/, `<g class="pv-marken">${teile.join('')}</g></svg>`);
}

/** Mehrere Bilder untereinander, je mit Überschrift: für das PNG des Vergleichs. */
function pvSvgUntereinander(teile) {
  const kopf = 40, abstand = 28;
  let y = 0, breite = 0;
  const innen = [];
  (teile || []).forEach(t => {
    const m = String(t.svg || '').match(/<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/);
    if (!m) return;
    const attr = (n) => (m[1].match(new RegExp('\\b' + n + '="([^"]*)"')) || [])[1] || '';
    const w = parseFloat(attr('width')) || 0, h = parseFloat(attr('height')) || 0;
    if (!w || !h) return;
    innen.push(`<text x="8" y="${y + 26}" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#1A2644">${_pvXml(t.titel)}</text>`);
    innen.push(`<svg x="0" y="${y + kopf}" width="${w}" height="${h}" viewBox="${attr('viewBox') || `0 0 ${w} ${h}`}">${m[2]}</svg>`);
    y += kopf + h + abstand;
    breite = Math.max(breite, w);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${breite}" height="${y}" viewBox="0 0 ${breite} ${y}">${innen.join('')}</svg>`;
}

/** Die Gegenüberstellung als Tabellenzeilen (Word): Nr., IST, SOLL, Änderung, Grund. */
function pvZeilenFuerWord(zeilen, namen) {
  const n = (typeof pzVglNormal === 'function') ? pzVglNormal(zeilen) : (zeilen || []);
  const name = (ref) => (namen && namen[ref]) || ref;
  return n.map((z, i) => [String(i + 1), z.ist.map(name).join('; ') || '–', z.soll.map(name).join('; ') || '–',
    (typeof pzVglArtInfo === 'function') ? pzVglArtInfo(z.art).label : z.art, z.grund || '']);
}

/* ── Die Ansicht ────────────────────────────────────────────────────── */

let _pv = null;   // { sollId, von, ist: [Modell], soll: [Modell], zeilen, geaendert, tab: { ist, soll }, gross: { ist, soll } }

/** Die Karte des Prozesses, zu dem ein Modell gehört (als SOLL, Teilprozess oder IST). */
function pvKarteVon(id) {
  if (typeof pzKarten !== 'function' || typeof procModellEintraegeAlle !== 'function') return null;
  const sid = String(id);
  const karten = pzKarten(procModellEintraegeAlle()).filter(k => k.art === 'modell');
  return karten.find(k => String(k.kachel.id) === sid)
    || karten.find(k => (k.teile || []).concat(k.istModelle || []).some(x => String(x.kachel.id) === sid)) || null;
}

/** Hat ein Modell etwas zu vergleichen? (Es gehört zu einem Prozess mit IST-Modellen.) */
function pvMoeglich(id) {
  const k = pvKarteVon(id);
  return !!(k && k.status !== 'eol' && (k.istModelle || []).length);
}

function _pvDarf() {
  return typeof canWriteTab !== 'function' || canWriteTab('prozesse');
}

/**
 * Den Vergleich öffnen. `id` ist irgendein Modell des Prozesses (SOLL,
 * Teilprozess oder IST), `von` sagt, wohin „← Zurück" führt ('backlog' oder
 * die Kennung des Modells, aus dessen Ansicht man kam).
 */
async function pvOeffnen(id, von) {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const k = pvKarteVon(id);
  if (!k || k.status === 'eol') { toast('Zu diesem Modell gibt es keinen Prozess, der ein IST ablöst.', 'error'); return; }
  mount.innerHTML = '<div class="doc-loading">Vergleich wird vorbereitet …</div>';
  try {
    const lade = async (e) => {
      const xml = await spGetProcessXml(e.kachel.id);
      const ablauf = (typeof prozessAblauf === 'function') ? prozessAblauf(xml) : { schritte: [] };
      return { id: String(e.kachel.id), titel: e.kachel.name, xml, schritte: pvSchritte(e.kachel.id, ablauf), svg: '' };
    };
    const soll = [];
    for (const e of [k].concat(k.teile || [])) soll.push(await lade(e));
    const ist = [];
    for (const e of (k.istModelle || [])) ist.push(await lade(e));
    const pm = (typeof procPmAusXml === 'function' ? procPmAusXml(soll[0].xml) : null) || {};
    _pv = { sollId: String(k.kachel.id), titel: k.kachel.name, von: von || 'backlog', ist, soll,
      zeilen: (typeof pzVglNormal === 'function' ? pzVglNormal(pm.vergleich) : []).map(z => Object.assign({}, z)),
      geaendert: false, tab: { ist: 0, soll: 0 }, gross: { ist: false, soll: false } };
    _pvRender();
  } catch (e) {
    mount.innerHTML = `<div class="field-hint" style="color:#b91c1c">Vergleich nicht ladbar: ${esc(e.message)}</div>`;
  }
}

function _pvAlleIst() { return _pv ? _pv.ist.flatMap(m => m.schritte) : []; }
function _pvAlleSoll() { return _pv ? _pv.soll.flatMap(m => m.schritte) : []; }

/** Name eines Schritts für Tabelle und Word: „Modell · Nr. Schritt". */
function _pvName(ref) {
  if (!_pv) return ref;
  for (const m of _pv.ist.concat(_pv.soll)) {
    const s = m.schritte.find(x => x.ref === ref);
    if (s) return `${m.titel} · ${s.nr}. ${s.name}`;
  }
  return ref + ' (nicht mehr im Modell)';
}

function _pvRender() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount || !_pv) return;
  const darf = _pvDarf();
  const ab = pvAbdeckung(_pvAlleIst(), _pvAlleSoll(), _pv.zeilen);
  const kurz = (typeof pzVglKurz === 'function') ? pzVglKurz(_pv.zeilen) : '';
  const vorschlaege = pvVorschlaege(_pvAlleIst(), _pvAlleSoll(), _pv.zeilen);
  const reiter = (seite) => _pv[seite].length > 1 ? `<div class="pv-reiter">${_pv[seite].map((m, i) =>
    `<button type="button" class="${i === _pv.tab[seite] ? 'aktiv' : ''}" onclick="pvReiter(${jsArg(seite)},${i})">${esc(m.titel)}</button>`).join('')}</div>` : '';
  const bild = (seite, titel) => `
    <div class="pv-block">
      <div class="pv-block-kopf"><h3>${titel}</h3>
        <button type="button" class="btn btn-ghost btn-sm" onclick="pvGross(${jsArg(seite)})" title="Zwischen Einpassen und Originalgröße wechseln">${_pv.gross[seite] ? '⤢ Einpassen' : '🔍 100 %'}</button></div>
      ${reiter(seite)}
      <div class="pv-bild${_pv.gross[seite] ? ' pv-gross' : ''}" id="pv-bild-${seite}"><div class="field-hint">Wird gezeichnet …</div></div>
    </div>`;
  mount.innerHTML = `
    <div class="pv-seite">
      <div class="pv-kopf">
        <button type="button" class="btn btn-outline btn-sm" onclick="pvZurueck()">← Zurück</button>
        <h2>⇄ Vergleich IST → SOLL: ${esc(_pv.titel)}</h2>
        <div class="toolbar-spacer"></div>
        <button type="button" class="btn btn-outline btn-sm" onclick="pvPng()" title="IST und SOLL mit den Nummern als ein Bild">🖼 PNG</button>
        ${darf ? `<button type="button" class="btn btn-primary btn-sm" id="pv-speichern" onclick="pvSpeichern()" ${_pv.geaendert ? '' : 'disabled'}>💾 Speichern</button>` : ''}
      </div>
      <div class="view-desc" style="margin:0 0 10px">Was aus jedem Schritt des bisherigen Ablaufs wird: bleibt, geändert,
        automatisiert, zusammengelegt oder entfällt, und was im SOLL neu ist, jeweils mit Grund (etwa der Schwachstelle aus der
        IST-Aufnahme). Jede Zuordnung hat eine <b>Nummer und Farbe</b>, die in beiden Diagrammen am Schritt steht; was entfällt,
        ist <b style="color:${PV_ROT}">rot</b>, was neu ist, <b style="color:${PV_BLAU}">blau</b>. Gespeichert wird am SOLL-Modell.</div>
      <div class="pm-kpis">
        <div class="pm-kpi"${ab.istZu < ab.istGesamt ? ' style="border-color:#fca5a5"' : ''}><b>${ab.istZu}<span>/${ab.istGesamt}</span></b>IST-Schritte zugeordnet</div>
        <div class="pm-kpi"${ab.sollZu < ab.sollGesamt ? ' style="border-color:#fca5a5"' : ''}><b>${ab.sollZu}<span>/${ab.sollGesamt}</span></b>SOLL-Schritte zugeordnet</div>
        ${kurz ? `<div class="pm-kpi" style="flex:2 1 260px"><b style="font-size:.95rem">${esc(kurz)}</b>Gegenüberstellung</div>` : ''}
      </div>
      ${_pv.ist.length ? bild('ist', 'IST') : '<div class="field-hint" style="margin:8px 0">Diesem Prozess ist noch kein IST-Modell zugeordnet.</div>'}
      ${bild('soll', 'SOLL')}
      <div class="pv-block">
        <div class="pv-block-kopf"><h3>Gegenüberstellung</h3>
          ${darf ? `<button type="button" class="btn btn-ghost btn-sm" onclick="pvZeileNeu('', '')">+ Zuordnung</button>
          ${vorschlaege.length ? `<button type="button" class="btn btn-ghost btn-sm" onclick="pvVorschlaegeUebernehmen()" title="Paare mit gleichem oder ähnlichem Namen">💡 ${vorschlaege.length} Vorschläge übernehmen</button>` : ''}` : ''}
        </div>
        ${_pvTabelleHtml(darf)}
        ${_pvOffenHtml(ab, darf)}
      </div>
    </div>`;
  _pvBild('ist');
  _pvBild('soll');
}

function _pvOptionen(seite, gewaehlt) {
  const leer = seite === 'ist' ? '– kein IST: neu im SOLL –' : '– kein SOLL: entfällt –';
  return `<option value="">${leer}</option>` + _pv[seite].map(m => `<optgroup label="${esc(m.titel)}">${m.schritte.map(s =>
    `<option value="${esc(s.ref)}"${s.ref === gewaehlt ? ' selected' : ''}>${esc(s.nr + '. ' + s.name + (s.bahn ? ' · ' + s.bahn : ''))}</option>`).join('')}</optgroup>`).join('');
}

function _pvTabelleHtml(darf) {
  if (!_pv.zeilen.length) return '<div class="field-hint" style="margin:6px 0">Noch keine Zuordnung. Unten stehen die Schritte, die noch offen sind.</div>';
  const arten = (typeof PZ_VGL_ARTEN !== 'undefined') ? PZ_VGL_ARTEN : [];
  return `<div class="table-wrap"><table class="pv-tabelle">
      <thead><tr><th>Nr.</th><th>IST</th><th></th><th>SOLL</th><th>Änderung</th><th>Grund</th>${darf ? '<th></th>' : ''}</tr></thead>
      <tbody>${_pv.zeilen.map((z, i) => {
        const farbe = pvZeilenFarbe(z, i + 1);
        const art = arten.find(a => a.key === z.art) || { label: z.art, farbe: '#64748b', text: '' };
        return `<tr>
          <td><span class="pv-nr" style="background:${farbe}">${i + 1}</span></td>
          <td>${darf ? `<select aria-label="IST-Schritt ${i + 1}" onchange="pvZeileSetzen(${i},'ist',this.value)">${_pvOptionen('ist', z.ist[0] || '')}</select>`
            : esc(z.ist.map(_pvName).join('; ') || '–')}</td>
          <td class="pv-pfeil">→</td>
          <td>${darf ? `<select aria-label="SOLL-Schritt ${i + 1}" onchange="pvZeileSetzen(${i},'soll',this.value)">${_pvOptionen('soll', z.soll[0] || '')}</select>`
            : esc(z.soll.map(_pvName).join('; ') || '–')}</td>
          <td>${darf ? `<select aria-label="Änderung ${i + 1}" onchange="pvZeileSetzen(${i},'art',this.value)" style="color:${art.farbe};font-weight:600">${arten.map(a =>
              `<option value="${a.key}"${a.key === z.art ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select>`
            : `<span style="color:${art.farbe};font-weight:600" title="${esc(art.text)}">${esc(art.label)}</span>`}</td>
          <td>${darf ? `<input type="text" aria-label="Grund ${i + 1}" value="${esc(z.grund)}" placeholder="z. B. G3, Medienbruch" oninput="pvZeileSetzen(${i},'grund',this.value)">` : esc(z.grund)}</td>
          ${darf ? `<td><button type="button" class="btn btn-ghost btn-sm" onclick="pvZeileWeg(${i})" aria-label="Zuordnung ${i + 1} entfernen" title="Entfernen">✕</button></td>` : ''}
        </tr>`;
      }).join('')}</tbody></table></div>`;
}

function _pvOffenHtml(ab, darf) {
  if (!ab.offenIst.length && !ab.offenSoll.length) return '<div class="field-hint" style="margin-top:8px;color:#15803d">✓ Jeder Schritt in IST und SOLL ist zugeordnet.</div>';
  const chip = (s, seite) => darf
    ? `<button type="button" class="pv-chip" onclick="pvZeileNeu(${jsArg(seite === 'ist' ? s.ref : '')}, ${jsArg(seite === 'soll' ? s.ref : '')})" title="Als neue Zuordnung aufnehmen">+ ${esc(s.nr + '. ' + s.name)}</button>`
    : `<span class="pv-chip">${esc(s.nr + '. ' + s.name)}</span>`;
  const gruppe = (seite, liste) => _pv[seite].map(m => {
    const offen = liste.filter(s => m.schritte.includes(s));
    return offen.length ? `<div class="pv-offen-gruppe"><span class="field-hint">${esc(m.titel)}:</span> ${offen.map(s => chip(s, seite)).join(' ')}</div>` : '';
  }).join('');
  return `<div class="pv-offen">
      ${ab.offenIst.length ? `<h4>IST, noch nicht zugeordnet (${ab.offenIst.length})</h4>${gruppe('ist', ab.offenIst)}` : ''}
      ${ab.offenSoll.length ? `<h4>SOLL, noch nicht zugeordnet (${ab.offenSoll.length})</h4>${gruppe('soll', ab.offenSoll)}` : ''}
    </div>`;
}

/** Ein Diagramm zeichnen (einmal je Modell) und die Marken der Zuordnungen hineinsetzen. */
async function _pvBild(seite) {
  if (!_pv || !_pv[seite].length) return;
  const host = document.getElementById('pv-bild-' + seite);
  const m = _pv[seite][_pv.tab[seite]];
  if (!host || !m) return;
  try {
    if (!m.svg && typeof procSvgAusXml === 'function') m.svg = await procSvgAusXml(m.xml);
    if (!m.svg) { host.innerHTML = '<div class="field-hint">Zeichnen ist hier nicht möglich.</div>'; return; }
    host.innerHTML = _pvBildMitMarken(seite, m);
  } catch (e) { host.innerHTML = `<div class="field-hint" style="color:#b91c1c">Nicht zu zeichnen: ${esc(e.message)}</div>`; }
}

function _pvBildMitMarken(seite, m) {
  return pvSvgMitMarken(m.svg, pvBoundsAusXml(m.xml), pvMarken(_pv.zeilen, seite, m.id));
}

/* ── Bedienung ──────────────────────────────────────────────────────── */

function pvReiter(seite, i) {
  if (!_pv) return;
  _pv.tab[seite] = i;
  _pvRender();
}

function pvGross(seite) {
  if (!_pv) return;
  _pv.gross[seite] = !_pv.gross[seite];
  _pvRender();
}

function pvZeileSetzen(i, feld, wert) {
  if (!_pv || !_pv.zeilen[i]) return;
  const z = _pv.zeilen[i];
  if (feld === 'ist' || feld === 'soll') z[feld] = wert ? [String(wert)] : [];
  else if (feld === 'art') z.art = String(wert);
  else if (feld === 'grund') { z.grund = String(wert || ''); _pv.geaendert = true; const k = document.getElementById('pv-speichern'); if (k) k.disabled = false; return; }
  // Die Art folgt den Seiten: ohne SOLL entfällt der Schritt, ohne IST ist er neu.
  if (feld !== 'art') {
    if (!z.soll.length) z.art = 'entfaellt';
    else if (!z.ist.length) z.art = 'neu';
    else if (z.art === 'entfaellt' || z.art === 'neu') z.art = 'geaendert';
  }
  // Eine Zeile ohne beide Seiten bleibt stehen, bis eine gewählt ist; beim Speichern fällt sie weg.
  _pv.geaendert = true;
  _pvRender();
}

function pvZeileNeu(ist, soll) {
  if (!_pv) return;
  _pv.zeilen.push({ art: soll && ist ? 'geaendert' : soll ? 'neu' : 'entfaellt', ist: ist ? [String(ist)] : [], soll: soll ? [String(soll)] : [], grund: '' });
  _pv.geaendert = true;
  _pvRender();
}

function pvZeileWeg(i) {
  if (!_pv) return;
  _pv.zeilen.splice(i, 1);
  _pv.geaendert = true;
  _pvRender();
}

function pvVorschlaegeUebernehmen() {
  if (!_pv) return;
  const neu = pvVorschlaege(_pvAlleIst(), _pvAlleSoll(), _pv.zeilen);
  if (!neu.length) return;
  _pv.zeilen = _pv.zeilen.concat(neu);
  _pv.geaendert = true;
  _pvRender();
  toast(`${neu.length} Zuordnungen vorgeschlagen. Bitte prüfen und speichern.`, 'success');
}

/** Am SOLL-Modell speichern, ausgehend vom Stand der Datei: Alle anderen Angaben bleiben. */
async function pvSpeichern() {
  if (!_pv || !_pvDarf()) return;
  const knopf = document.getElementById('pv-speichern');
  if (knopf) knopf.disabled = true;
  try {
    const p = procModellVon(_pv.sollId);
    if (!p) throw new Error('Modell nicht gefunden, bitte neu laden.');
    const xml = await spGetProcessXml(_pv.sollId);
    const pm = procPmAusXml(xml) || pzPmNormal({});
    pm.vergleich = pzVglNormal(_pv.zeilen);
    const neu = procXmlDokuNeu(xml, { pm: pzPmNormal(pm) });
    await spSaveProcess(p.title, neu, p.ordner || '');
    try { _processes = await spListProcesses(); } catch (e) { /* dann mit der alten Liste */ }
    const q = procModellVon(_pv.sollId);
    if (q && typeof procLinksMerken === 'function') procLinksMerken(q.itemId + '|' + q.modified, procEintragAusXml(neu));
    _pv.soll[0].xml = neu;
    _pv.zeilen = pm.vergleich.map(z => Object.assign({}, z));
    _pv.geaendert = false;
    toast(`Vergleich gespeichert ✓ (${pzVglKurz(pm.vergleich) || 'leer'})`, 'success');
    _pvRender();
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
    if (knopf) knopf.disabled = false;
  }
}

/** IST und SOLL (die gerade gezeigten) mit den Nummern als ein PNG. */
async function pvPng() {
  if (!_pv || typeof procSvgAlsPng !== 'function') return;
  try {
    const teile = [];
    for (const seite of ['ist', 'soll']) {
      const m = _pv[seite][_pv.tab[seite]];
      if (!m) continue;
      if (!m.svg) m.svg = await procSvgAusXml(m.xml);
      teile.push({ titel: (seite === 'ist' ? 'IST: ' : 'SOLL: ') + m.titel, svg: _pvBildMitMarken(seite, m) });
    }
    const png = await procSvgAlsPng(pvSvgUntereinander(teile));
    _procHerunterladen(png, 'Vergleich ' + String(_pv.titel).replace(/[\\/:*?"<>|]/g, ' ') + '.png');
    toast('Bild gespeichert ✓', 'success');
  } catch (e) { toast('Bild-Export fehlgeschlagen: ' + e.message, 'error'); }
}

async function pvZurueck() {
  if (_pv && _pv.geaendert && typeof uiConfirm === 'function'
    && !await uiConfirm('Die Gegenüberstellung hat ungespeicherte Änderungen. Ohne Speichern gehen sie verloren.', { title: 'Vergleich verlassen?', okLabel: 'Verwerfen' })) return;
  const von = _pv ? _pv.von : 'backlog';
  _pv = null;
  if (von === 'backlog' && typeof setProzessModus === 'function') setProzessModus('backlog');
  else if (von && typeof openProcessAnsicht === 'function') openProcessAnsicht(von);
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PV_FARBEN, PV_ROT, PV_BLAU, pvFarbe, pvZeilenFarbe, pvSchritte, pvWoerter, pvAehnlich, pvVorschlaege, pvAbdeckung,
    pvMarken, pvBoundsAusXml, pvSvgRand, pvSvgMitMarken, pvSvgUntereinander, pvZeilenFuerWord };
}
