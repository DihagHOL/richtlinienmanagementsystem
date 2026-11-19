'use strict';

/**
 * Gesamtkarte – Ansicht „🧭 Gesamtkarte" im Reiter Prozesse
 * ==========================================================
 * Alle Prozesse des RMS auf einer Karte, die man verschiebt und in die man
 * hineinzoomt. Oben der Gesamtprozess mit seiner Kette im Jahreszyklus,
 * darunter die 13 Themen in vier Bändern (Planen, Umsetzen, Prüfen und
 * verbessern, Anlassbezogen), in jedem Thema sein Hauptprozess mit den Unter-
 * und Nebenprozessen als Baum.
 *
 * Die Karte zeigt je nach Zoom mehr: von weitem die Themen, näher die Namen
 * der Prozesse, ganz nah Beschreibung, Rollen und Normbezug. Ein Klick auf
 * einen Prozess öffnet daneben alles, was zu ihm gehört: Ablauf, Rollen,
 * was er einbindet und wer ihn einbindet, welche Daten er von anderen liest,
 * das Modell im RMS mit seinen Regelwerken und den Reiter, in dem er läuft.
 * Seine Abhängigkeiten leuchten dabei auf der Karte auf, über alle Themen.
 *
 * Woher die Daten kommen:
 *   js/rmsprozesse.js  Katalog, Themen und Datenbezüge (eine Wahrheit, aus
 *                      der auch „📋 Standard-Prozesse" die Modelle baut)
 *   _processes         welche Modelle im RMS angelegt sind (Ablage KONZERN)
 *   Modell-Eintrag     die Regelwerke eines Modells, erst beim Anklicken
 * Gespeichert wird hier nichts.
 */

/* ── Darstellung ─────────────────────────────────────────────────────── */

const GK_PHASEN = [
  { key: 'planen',   titel: 'Planen',                farbe: '#17509E', text: 'Rahmen, Assets, Risiken, Anwendbarkeit und Ziele' },
  { key: 'umsetzen', titel: 'Umsetzen',              farbe: '#1A2644', text: 'Regelwerke, Unterweisung, Prozesse und Notfallvorsorge' },
  { key: 'pruefen',  titel: 'Prüfen und verbessern', farbe: '#F08300', text: 'Audit, Managementbewertung und Korrekturen' },
  { key: 'anlass',   titel: 'Anlassbezogen',         farbe: '#424241', text: 'kommt dazu, wenn etwas passiert oder beantragt wird' },
];

const GK_ICON = {
  regelwerke: '📜', unterweisung: '🎓', normen: '📐', risiken: '⚠', ziele: '🎯', wirksamkeit: '🔁',
  vorfaelle: '🚨', notfall: '🛟', assets: '🖥', prozesse: '🔀', ki: '🤖', governance: '🏛', betrieb: '⚙',
};

/* Wo ein Prozess im RMS bearbeitet wird, wenn es nicht der Einstieg seines
   Themas ist. Was hier fehlt, führt zum ersten Reiter des Themas. */
const GK_REITER = {
  'Regelwerk freigeben lassen (RMS)': 'freigaben', 'Konformität prüfen (RMS)': 'freigaben',
  'Mitbestimmung einholen (RMS)': 'freigaben', 'Regelwerk freigeben (RMS)': 'freigaben',
  'Aus der Mail entscheiden (RMS)': 'freigaben', 'Regelwerk-Konzept entscheiden (RMS)': 'freigaben',
  'Regelwerk überprüfen (RMS)': 'faelligkeit', 'Änderung vorschlagen (RMS)': 'vorschlaege',
  'Ausnahme genehmigen (RMS)': 'ausnahmen', 'IMS-Dokument lenken (RMS)': 'ismsdocs',
  'Governance-Entwurf übernehmen (RMS)': 'governance',
  'Kenntnisnahme bestätigen (RMS)': 'meine', 'Wissenstest ablegen (RMS)': 'meine',
  'C-Level-Bericht versenden (RMS)': 'compliance',
  'Maßnahme umsetzen (RMS)': 'massnahmen', 'Kennzahl messen (RMS)': 'kennzahlen',
  'Funktionsprüfung durchführen (RMS)': 'faelligkeit', 'Probelauf vorführen (RMS)': 'anleitung',
};

/* Namen der Reiter, falls PAGE_TITLES (app.js) nicht da ist. */
const GK_REITER_NAMEN = { ki: 'KI-Dashboard', notfall: 'Notfall & Krisenstab', vorfaelle: 'Vorfälle', assets: 'Assets' };

/* Maße der Karte in Weltpunkten. */
const GK_MASS = {
  kw: 280, kh: 170,       // Karte eines Prozesses
  dx: 64, dy: 22,         // Abstand zwischen Ebenen und zwischen Karten einer Ebene
  pad: 28, kopf: 150,     // Rand und Kopf eines Themas
  themaMin: 440,          // schmaler wird kein Thema, sonst passt sein Titel nicht
  luecke: 64,             // Abstand zwischen Themen
  bandKopf: 120,          // Kopf eines Bandes (Phase)
  rand: 80,               // Rand um alles
};

/* Ab diesen Zoomstufen zeigt die Karte mehr. */
const GK_ZOOM_MITTEL = 0.42, GK_ZOOM_NAH = 0.9, GK_ZOOM_MIN = 0.05, GK_ZOOM_MAX = 2.4;

let _gkDaten = null;          // gkDaten()
let _gkLage = null;           // gkLayout()
let _gkT = null;              // { k, x, y }: Bildschirm = Welt · k + (x, y)
let _gkWahl = '';             // gewählter Prozess (Name)
let _gkQuer = true;           // Querbezüge zeigen
let _gkSuche = '';
let _gkTrefferIdx = 0;
let _gkWunsch = null;         // { thema, prozess } aus Link oder Kopfzeile
let _gkAnim = 0;
const _gkRegelwerke = new Map();   // itemId → Liste der Regelwerk-Kennungen (oder 'lädt')

/* ── Daten ───────────────────────────────────────────────────────────── */

function _gkKurz(n) { return (typeof rmsKurzname === 'function') ? rmsKurzname(n) : String(n || ''); }

/** Rollen eines Ablaufs mit Zahl der Schritte, in der Reihenfolge ihres Auftretens. */
function gkRollen(schritte) {
  const m = new Map();
  (schritte || []).forEach(s => {
    if (!s.bahn) return;
    const r = m.get(s.bahn) || { name: s.bahn, n: 0, auto: true };
    r.n++;
    if (s.kind !== 'service' && !(typeof PS_AUTO_BAHNEN !== 'undefined' && PS_AUTO_BAHNEN.test(s.bahn))) r.auto = false;
    m.set(s.bahn, r);
  });
  return [...m.values()];
}

/**
 * Knoten, Kanten und Themen aus dem Katalog.
 * Kantenarten: ruft (⊞ eingebunden), unter (↳ zugeordnet), neben (⇢), nutzt (Datenbezug).
 */
function gkDaten() {
  const katalog = (typeof RMS_PROZESSE !== 'undefined') ? RMS_PROZESSE : [];
  const themen = (typeof RMS_THEMEN !== 'undefined') ? RMS_THEMEN : [];
  const bezuege = (typeof RMS_BEZUEGE !== 'undefined') ? RMS_BEZUEGE : [];
  const lesen = (typeof prozessTextLesen === 'function') ? prozessTextLesen : () => [];
  const knoten = new Map();
  katalog.forEach(p => {
    const schritte = lesen(p.schritte);
    const t = (typeof rmsThemaVon === 'function') ? rmsThemaVon(p.name) : null;
    knoten.set(p.name, {
      name: p.name, kurz: _gkKurz(p.name), kennung: p.kennung, gesamt: !!p.gesamt,
      thema: t ? t.key : '', haupt: !!(t && t.haupt === p.name),
      beschreibung: (p.beschreibung || []).slice(), norm: p.norm || '',
      schritte, rollen: gkRollen(schritte),
      nAufgaben: schritte.filter(s => ['user', 'service', 'manual', 'unter'].includes(s.kind)).length,
      nFragen: schritte.filter(s => s.kind === 'frage').length,
      ein: [], aus: [],
    });
  });
  const kanten = [];
  const kante = (von, nach, art, text) => {
    const a = knoten.get(von), b = knoten.get(nach);
    if (!a || !b || von === nach) return;
    if (kanten.some(k => k.von === von && k.nach === nach && k.art === art)) return;
    const k = { von, nach, art, text: text || '', quer: a.thema !== b.thema && !a.gesamt };
    kanten.push(k); a.aus.push(k); b.ein.push(k);
  };
  katalog.forEach(p => {
    const k = (typeof rmsKinder === 'function') ? rmsKinder(p) : { aufrufe: [], unter: [], neben: [] };
    k.aufrufe.forEach(n => kante(p.name, n, 'ruft'));
    k.unter.forEach(n => kante(p.name, n, 'unter'));
    k.neben.forEach(n => kante(p.name, n, 'neben'));
  });
  bezuege.forEach(b => kante(b.von, b.nach, 'nutzt', b.text));

  const gesamt = katalog.find(p => p.gesamt);
  const gesamtKinder = gesamt && typeof rmsKinder === 'function' ? rmsKinder(gesamt) : { aufrufe: [], neben: [] };
  // Reihenfolge der Themen: wie die Kette des Gesamtprozesses, danach was daneben läuft.
  const folge = gesamtKinder.aufrufe.concat(gesamtKinder.neben);
  const themenListe = themen.map(t => Object.assign({}, t, {
    icon: GK_ICON[t.key] || '▪',
    mitglieder: katalog.filter(p => !p.gesamt && knoten.get(p.name).thema === t.key).map(p => p.name),
  })).sort((a, b) => {
    const ia = folge.indexOf(a.haupt), ib = folge.indexOf(b.haupt);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return { gesamt: gesamt ? gesamt.name : '', kette: gesamtKinder.aufrufe, neben: gesamtKinder.neben,
    themen: themenListe, knoten, kanten };
}

/** Rollen eines ganzen Themas (über alle seine Prozesse). */
function gkThemaRollen(daten, t) {
  const m = new Map();
  t.mitglieder.forEach(n => daten.knoten.get(n).rollen.forEach(r => {
    const x = m.get(r.name) || { name: r.name, n: 0, auto: r.auto };
    x.n += r.n; x.auto = x.auto && r.auto; m.set(r.name, x);
  }));
  return [...m.values()].sort((a, b) => b.n - a.n);
}

/* ── Lage ────────────────────────────────────────────────────────────── */

/**
 * Ein Thema als Baum, Wurzel links: Jeder Prozess steht einmal, unter dem,
 * der ihn auf dem kürzesten Weg vom Hauptprozess erreicht; weitere Eltern
 * werden Querkanten. Innerhalb einer Ebene rückt eine Karte nach unten, bis
 * sie frei ist, aber nie über ihre Eltern hinaus nach oben.
 */
function _gkThemaBaum(daten, t, M) {
  const drin = new Set(t.mitglieder);
  const eltern = new Map([[t.haupt, null]]);
  const reihe = [t.haupt];
  for (let i = 0; i < reihe.length; i++) {
    daten.knoten.get(reihe[i]).aus.forEach(k => {
      if (k.art === 'nutzt' || !drin.has(k.nach) || eltern.has(k.nach)) return;
      eltern.set(k.nach, { von: reihe[i], art: k.art });
      reihe.push(k.nach);
    });
  }
  // Was das Thema enthält, aber von seinem Hauptprozess aus nicht erreicht wird, hängt direkt daran.
  t.mitglieder.filter(n => !eltern.has(n)).forEach(n => { eltern.set(n, { von: t.haupt, art: 'unter', ersatz: true }); reihe.push(n); });

  const lage = new Map();           // Name → { ebene, y }
  const baum = [];                  // { von, nach, art }
  const naechstes = [];             // je Ebene die nächste freie Höhe
  const besuche = (name, ebene, minY) => {
    const y = Math.max(naechstes[ebene] || 0, minY);
    naechstes[ebene] = y + M.kh + M.dy;
    lage.set(name, { ebene, y });
    reihe.filter(n => eltern.get(n) && eltern.get(n).von === name).forEach(n => {
      baum.push(Object.assign({ nach: n }, eltern.get(n)));
      besuche(n, ebene + 1, y);
    });
  };
  besuche(t.haupt, 0, 0);
  const ebenen = Math.max(...[...lage.values()].map(l => l.ebene)) + 1;
  const hoehe = Math.max(...naechstes.filter(v => v != null)) - M.dy;
  return {
    lage, baum,
    w: Math.max(M.themaMin, M.pad * 2 + ebenen * M.kw + (ebenen - 1) * M.dx),
    h: M.kopf + hoehe + M.pad,
  };
}

/**
 * Die ganze Karte: Gesamtprozess oben, darunter je Phase ein Band mit seinen
 * Themen. In einem Band stapeln sich kleine Themen in einer Spalte, solange
 * sie nicht höher werden als das größte.
 * @returns {{w:number,h:number,gesamt:object,baender:Array,themen:Object,karten:Map,baum:Array}}
 */
function gkLayout(daten) {
  const M = GK_MASS;
  const themen = {}, karten = new Map(), baum = [];
  const baeume = new Map(daten.themen.map(t => [t.key, _gkThemaBaum(daten, t, M)]));

  // Der Gesamtprozess: links seine Karte, daneben die Kette in zwei Zeilen
  // (erst Planen, dann der Rest bis zum Ende), darunter was anlassbezogen
  // daneben läuft, rechts seine Beschreibung.
  const G = { w: 232, h: 112, gap: 40, zeile: 56 };
  const gesamt = { x: M.rand, y: M.rand };
  const kx = M.rand + 40 + M.kw + 80;
  const y1 = gesamt.y + 110, y2 = y1 + G.h + G.zeile;
  const phaseVon = (n) => { const t = daten.themen.find(x => x.haupt === n); return t ? t.phase : ''; };
  const reihe1 = ['start'].concat(daten.kette.filter(n => phaseVon(n) === 'planen'));
  const reihe2 = daten.kette.filter(n => phaseVon(n) !== 'planen').concat(['frage', 'ende']);
  const glied = (g, i, gy) => ({ art: ['start', 'frage', 'ende'].includes(g) ? g : 'thema', name: g, x: kx + i * (G.w + G.gap), y: gy, w: G.w, h: G.h });
  gesamt.glieder = reihe1.map((g, i) => glied(g, i, y1)).concat(reihe2.map((g, i) => glied(g, i, y2)));
  const yn = y2 + G.h + 76;
  gesamt.neben = daten.neben.map((n, i) => ({ name: n, x: kx + i * (G.w * 1.5 + G.gap), y: yn, w: G.w * 1.5, h: 64 }));
  gesamt.label = { x: kx, kette: y1 - 40, neben: yn - 40 };
  const kettenRechts = Math.max(...gesamt.glieder.map(g => g.x + g.w), ...gesamt.neben.map(g => g.x + g.w));
  gesamt.h = yn + 64 + 48 - gesamt.y;
  gesamt.inhalt = { x: gesamt.x, y: gesamt.y, w: kettenRechts + 48 - gesamt.x, h: gesamt.h };
  gesamt.text = { x: kettenRechts + 100, y: y1 - 6, w: 0 };
  if (daten.gesamt) karten.set(daten.gesamt, { x: M.rand + 40, y: y1, w: M.kw, h: 2 * G.h + G.zeile, thema: '' });

  // Die Phasen stehen als Spalten nebeneinander, in der Reihenfolge der Kette.
  // Ein Thema, das unter das vorige nicht mehr passt, beginnt eine neue Spalte;
  // passen heißt: nicht tiefer als das größte Thema der ganzen Karte.
  const top = gesamt.y + gesamt.h + M.luecke;
  const zielH = Math.max(...[...baeume.values()].map(b => b.h));
  const innen = top + M.bandKopf;
  const baender = [];
  let x = M.rand;
  GK_PHASEN.forEach(ph => {
    const liste = daten.themen.filter(t => t.phase === ph.key);
    if (!liste.length) return;
    let sx = x + 40, sy = innen, spalteW = 0, unten = innen;
    liste.forEach(t => {
      const b = baeume.get(t.key);
      if (sy > innen && sy + b.h > innen + zielH + M.luecke) { sx += spalteW + M.luecke; sy = innen; spalteW = 0; }
      themen[t.key] = { x: sx, y: sy, w: b.w, h: b.h };
      b.lage.forEach((l, name) => karten.set(name, {
        x: sx + M.pad + l.ebene * (M.kw + M.dx), y: sy + M.kopf + l.y, w: M.kw, h: M.kh, thema: t.key, ebene: l.ebene }));
      b.baum.forEach(k => baum.push(k));
      unten = Math.max(unten, sy + b.h);
      sy += b.h + M.luecke;
      spalteW = Math.max(spalteW, b.w);
    });
    const w = sx + spalteW + 40 - x;
    baender.push({ key: ph.key, titel: ph.titel, farbe: ph.farbe, text: ph.text, x, y: top, w, h: unten - top + 40 });
    x += w + M.luecke;
  });
  const bandH = Math.max(...baender.map(b => b.h));
  baender.forEach(b => { b.h = bandH; });
  const breite = Math.max(x - M.luecke, gesamt.inhalt.x + gesamt.inhalt.w);
  gesamt.w = breite - gesamt.x;
  gesamt.text.w = gesamt.x + gesamt.w - 60 - gesamt.text.x;
  if (gesamt.text.w < 520) gesamt.text = null;
  const y = top + bandH + M.luecke;
  return { w: breite + M.rand, h: y - M.luecke + M.rand, gesamt, baender, themen, karten, baum };
}

/* ── Modelle im RMS ──────────────────────────────────────────────────── */

/** Das Modell eines Katalog-Prozesses in der Ablage des Konzerns, oder null. */
function gkModell(name) {
  const liste = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  const ablage = (typeof RMS_PROZESS_ABLAGE !== 'undefined') ? RMS_PROZESS_ABLAGE : 'KONZERN';
  const norm = (s) => {
    const t = String(s || '').replace(/\.bpmn$/i, '');
    return ((typeof spProzessDateiname === 'function') ? spProzessDateiname(t) : t).toLowerCase();
  };
  const n = norm(name);
  return liste.find(p => (p.ordner || '') === ablage && norm(p.title) === n) || null;
}

function _gkModelleGeladen() { return typeof _processes !== 'undefined' && Array.isArray(_processes); }

/* ── Text und Hilfen ─────────────────────────────────────────────────── */

function _gkEsc(s) {
  if (typeof esc === 'function') return esc(s);
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _gkArg(s) { return (typeof jsArg === 'function') ? jsArg(s) : JSON.stringify(String(s)); }
function _gkSatz(t) { const m = String(t || '').match(/^.*?[.!?](\s|$)/); return m ? m[0].trim() : String(t || ''); }
function _gkThema(key) { return _gkDaten ? _gkDaten.themen.find(t => t.key === key) : null; }
function _gkPhase(key) { return GK_PHASEN.find(p => p.key === key) || GK_PHASEN[0]; }
function _gkFarbe(name) {
  const n = _gkDaten && _gkDaten.knoten.get(name);
  if (!n || n.gesamt) return '#1A2644';
  const t = _gkThema(n.thema);
  return t ? _gkPhase(t.phase).farbe : '#17509E';
}
function gkReiterVon(name) {
  const n = _gkDaten && _gkDaten.knoten.get(name);
  const t = n ? _gkThema(n.thema) : null;
  return GK_REITER[name] || (t && t.reiter[0]) || '';
}
function _gkReiterName(view) {
  if (typeof PAGE_TITLES !== 'undefined' && PAGE_TITLES[view]) return PAGE_TITLES[view];
  return GK_REITER_NAMEN[view] || view;
}
function _gkDarfReiter(view) {
  if (!view) return false;
  return typeof canReadTab !== 'function' || canReadTab(view);
}

/** Was eine Kante sagt, aus Sicht des Prozesses `name`. */
function gkKantenText(k, name) {
  const hin = k.von === name;
  return {
    ruft:  hin ? '⊞ bindet ein' : '⊞ eingebunden in',
    unter: hin ? '↳ Unterprozess' : '↳ zugeordnet zu',
    neben: hin ? '⇢ Nebenprozess' : '⇢ läuft neben',
    nutzt: hin ? '↔ nutzt Daten von' : '↔ liefert Daten an',
  }[k.art] || k.art;
}

/** Wie ein Prozess in seinem Thema steht: Hauptprozess, eingebunden, zugeordnet, Nebenprozess. */
function gkArtVon(name) {
  const n = _gkDaten && _gkDaten.knoten.get(name);
  if (!n) return '';
  if (n.gesamt) return 'Gesamtprozess';
  if (n.haupt) return 'Hauptprozess';
  const b = _gkLage && _gkLage.baum.find(k => k.nach === name);
  return b ? ({ ruft: 'Unterprozess, eingebunden', unter: 'Unterprozess, zugeordnet', neben: 'Nebenprozess' }[b.art] || 'Unterprozess') : 'Unterprozess';
}

/* Trifft die Suche? Name, Beschreibung, Rollen, Normbezug und Thema zählen. */
function gkTrifft(n, q) {
  if (!q) return false;
  const t = _gkThema(n.thema);
  const heu = [n.kurz, n.beschreibung.join(' '), n.norm, n.rollen.map(r => r.name).join(' '), t ? t.titel : ''].join(' ').toLowerCase();
  return String(q).toLowerCase().split(/\s+/).filter(Boolean).every(w => heu.includes(w));
}
function gkTreffer() {
  if (!_gkDaten || !_gkSuche.trim()) return [];
  return [..._gkDaten.knoten.values()].filter(n => gkTrifft(n, _gkSuche.trim())).map(n => n.name);
}

/* ── Zeichnen ────────────────────────────────────────────────────────── */

function _gkKantenPfad(a, b, baum) {
  // Baumkanten laufen von rechts nach links; Querkanten nehmen die Seiten, die sich zugewandt sind.
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  let x1, y1, x2, y2, c1x, c1y, c2x, c2y;
  if (baum || Math.abs(bx - ax) >= Math.abs(by - ay)) {
    const rechts = baum || bx >= ax;
    x1 = rechts ? a.x + a.w : a.x; y1 = ay;
    x2 = rechts ? b.x : b.x + b.w; y2 = by;
    const d = Math.max(40, Math.abs(x2 - x1) / 2);
    c1x = x1 + (rechts ? d : -d); c1y = y1; c2x = x2 + (rechts ? -d : d); c2y = y2;
  } else {
    const unten = by >= ay;
    x1 = ax; y1 = unten ? a.y + a.h : a.y;
    x2 = bx; y2 = unten ? b.y : b.y + b.h;
    const d = Math.max(40, Math.abs(y2 - y1) / 2);
    c1x = x1; c1y = y1 + (unten ? d : -d); c2x = x2; c2y = y2 + (unten ? -d : d);
  }
  const r = (v) => Math.round(v);
  return `M${r(x1)},${r(y1)} C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(x2)},${r(y2)}`;
}

function _gkLinien() {
  const L = _gkLage, D = _gkDaten;
  const imBaum = new Set(L.baum.map(k => k.von + '>' + k.nach));
  const linien = [];
  L.baum.forEach(k => {
    const a = L.karten.get(k.von), b = L.karten.get(k.nach);
    if (a && b) linien.push(`<path class="gk-linie gk-${k.art} gk-baum" data-von="${_gkEsc(k.von)}" data-nach="${_gkEsc(k.nach)}"
      d="${_gkKantenPfad(a, b, true)}" marker-end="url(#gk-pfeil)"/>`);
  });
  D.kanten.forEach(k => {
    if (imBaum.has(k.von + '>' + k.nach)) return;
    const vonGesamt = D.knoten.get(k.von).gesamt;
    if (vonGesamt) return;   // die Kette des Gesamtprozesses steht oben als eigene Leiste
    const a = L.karten.get(k.von), b = L.karten.get(k.nach);
    if (!a || !b) return;
    linien.push(`<path class="gk-linie gk-${k.art} gk-querlinie${k.quer ? ' gk-fremd' : ''}" data-von="${_gkEsc(k.von)}" data-nach="${_gkEsc(k.nach)}"
      d="${_gkKantenPfad(a, b, false)}" marker-end="url(#gk-pfeil-${k.art === 'nutzt' ? 'daten' : 'quer'})"><title>${_gkEsc(_gkKurz(k.von) + ' ' + gkKantenText(k, k.von).replace(/^\S+\s/, '') + ' ' + _gkKurz(k.nach) + (k.text ? ': ' + k.text : ''))}</title></path>`);
  });
  const gl = L.gesamt.glieder || [];
  gl.forEach((a, i) => {
    const b = gl[i + 1];
    if (!b) return;
    const ay = a.y + a.h / 2, by = b.y + b.h / 2;
    const d = a.y === b.y ? `M${a.x + a.w},${ay} H${b.x - 2}`
      : `M${a.x + a.w},${ay} H${a.x + a.w + 20} V${a.y + a.h + 28} H${b.x - 20} V${by} H${b.x - 2}`;
    linien.unshift(`<path class="gk-kettenlinie" d="${d}" marker-end="url(#gk-pfeil-kette)"/>`);
  });
  return `<svg class="gk-linien" width="${L.w}" height="${L.h}" viewBox="0 0 ${L.w} ${L.h}" aria-hidden="true">
    <defs>
      <marker id="gk-pfeil" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker>
      <marker id="gk-pfeil-quer" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#17509E"/></marker>
      <marker id="gk-pfeil-kette" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#cfe0f5"/></marker>
      <marker id="gk-pfeil-daten" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#F08300"/></marker>
    </defs>
    ${linien.join('')}
  </svg>`;
}

function _gkKarteHtml(name) {
  const n = _gkDaten.knoten.get(name), r = _gkLage.karten.get(name);
  const modell = gkModell(name);
  const art = gkArtVon(name);
  const zeichen = n.gesamt ? '◎' : n.haupt ? '★' : ({ 'Nebenprozess': '⇢', 'Unterprozess, zugeordnet': '↳' }[art] || '⊞');
  const rollen = n.rollen.filter(x => !x.auto);
  const quer = n.ein.concat(n.aus).filter(k => k.quer).length;
  const stand = !_gkModelleGeladen() ? '' : modell
    ? '<span class="gk-stand gk-stand-da" title="Modell im RMS angelegt">● Modell</span>'
    : '<span class="gk-stand" title="Noch kein Modell im RMS: „📋 Standard-Prozesse“ in der Modell-Liste legt es an">○ kein Modell</span>';
  return `<div class="gk-karte${n.gesamt ? ' gk-karte-gesamt' : ''}${n.haupt ? ' gk-karte-haupt' : ''}${art === 'Nebenprozess' ? ' gk-karte-neben' : ''}"
      data-gk="${_gkEsc(name)}" role="button" tabindex="0" aria-label="${_gkEsc(n.kurz + ', ' + art)}"
      style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--gk-farbe:${_gkFarbe(name)}">
    <div class="gk-karte-kopf"><span class="gk-zeichen">${zeichen}</span><span class="gk-art">${_gkEsc(art)}</span>${stand}</div>
    <div class="gk-karte-titel">${_gkEsc(n.kurz)}</div>
    <div class="gk-karte-mehr">
      <div class="gk-karte-satz">${_gkEsc(_gkSatz(n.beschreibung[0]))}</div>
      <div class="gk-karte-rollen">${rollen.slice(0, 3).map(x => `<span>${_gkEsc(x.name)}</span>`).join('')}${rollen.length > 3 ? `<span>+${rollen.length - 3}</span>` : ''}</div>
      <div class="gk-karte-zahlen">${n.nAufgaben} Schritte · ${n.nFragen} Entscheidung${n.nFragen === 1 ? '' : 'en'}${quer ? ` · ${quer} ↔ andere Themen` : ''}</div>
    </div>
  </div>`;
}

function _gkThemaHtml(t) {
  const r = _gkLage.themen[t.key], ph = _gkPhase(t.phase);
  const rollen = gkThemaRollen(_gkDaten, t).filter(x => !x.auto);
  const modelle = _gkModelleGeladen() ? t.mitglieder.filter(n => gkModell(n)).length : null;
  const quer = new Set();
  t.mitglieder.forEach(n => { const k = _gkDaten.knoten.get(n); k.ein.concat(k.aus).forEach(x => { if (x.quer) quer.add(x.von === n ? _gkDaten.knoten.get(x.nach).thema : _gkDaten.knoten.get(x.von).thema); }); });
  quer.delete(t.key); quer.delete('');
  const reiter = t.reiter.filter(_gkDarfReiter);
  return `<div class="gk-thema" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--gk-farbe:${ph.farbe}">
    <div class="gk-thema-kopf" data-gk-thema="${_gkEsc(t.key)}" title="Ins Thema zoomen">
      <div class="gk-thema-titel"><span class="gk-thema-icon">${t.icon}</span>${_gkEsc(t.titel)}</div>
      <div class="gk-thema-zeile">${t.mitglieder.length} Prozesse · ${rollen.length} Rollen${modelle != null ? ` · Modelle im RMS: ${modelle} von ${t.mitglieder.length}` : ''}${quer.size ? ` · verbunden mit ${[...quer].map(k => (_gkThema(k) || {}).titel).filter(Boolean).join(', ')}` : ''}</div>
      ${reiter.length ? `<div class="gk-thema-reiter">${reiter.map(v => `<button type="button" class="gk-reiter" data-gk-reiter="${_gkEsc(v)}" title="Reiter öffnen">→ ${_gkEsc(_gkReiterName(v))}</button>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

function _gkGesamtHtml() {
  const L = _gkLage, D = _gkDaten, g = L.gesamt;
  const n = D.knoten.get(D.gesamt);
  if (!n) return '';
  const glieder = g.glieder.map(x => {
    if (x.art === 'start' || x.art === 'ende') {
      return `<div class="gk-kette-punkt" style="left:${x.x}px;top:${x.y}px;width:${x.w}px;height:${x.h}px">${_gkEsc((n.schritte.find(s => s.kind === x.art) || {}).label || '')}</div>`;
    }
    if (x.art === 'frage') {
      const f = n.schritte.find(s => s.kind === 'frage') || {};
      const zurueck = f.neinZurueck ? _gkKurz((typeof rmsProzess === 'function' && rmsProzess(f.neinZurueck)) ? rmsProzess(f.neinZurueck).name : f.neinZurueck) : '';
      return `<div class="gk-kette-frage" style="left:${x.x}px;top:${x.y}px;width:${x.w}px;height:${x.h}px">
        <b>◆ ${_gkEsc(f.label || '')}</b><span>nein: ${_gkEsc(f.nein || '')}${zurueck ? `, zurück zu ${_gkEsc(zurueck)} ↺` : ''}</span></div>`;
    }
    const t = D.themen.find(y => y.haupt === x.name);
    const ph = _gkPhase(t ? t.phase : 'planen');
    return `<div class="gk-kette-glied" data-gk-thema="${_gkEsc(t ? t.key : '')}" role="button" tabindex="0"
        style="left:${x.x}px;top:${x.y}px;width:${x.w}px;height:${x.h}px;--gk-farbe:${ph.farbe}" title="${_gkEsc(_gkKurz(x.name))}: ins Thema zoomen">
      <span class="gk-kette-phase">${_gkEsc(ph.titel)}</span><span class="gk-kette-name">${t ? t.icon + ' ' + _gkEsc(t.titel) : _gkEsc(_gkKurz(x.name))}</span></div>`;
  }).join('');
  const neben = g.neben.map(x => {
    const t = D.themen.find(y => y.haupt === x.name);
    return `<div class="gk-kette-neben" data-gk-thema="${_gkEsc(t ? t.key : '')}" role="button" tabindex="0"
      style="left:${x.x}px;top:${x.y}px;width:${x.w}px;height:${x.h}px">⇢ ${t ? t.icon + ' ' : ''}${_gkEsc(_gkKurz(x.name))}</div>`;
  }).join('');
  const text = g.text ? `<div class="gk-gesamt-text" style="left:${g.text.x}px;top:${g.text.y}px;width:${g.text.w}px">
      ${n.beschreibung.map(x => `<p>${_gkEsc(x)}</p>`).join('')}
      ${n.norm ? `<p class="gk-gesamt-norm">📐 Normbezug: ${_gkEsc(n.norm)}</p>` : ''}</div>` : '';
  return `<div class="gk-gesamt" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px">
      <div class="gk-gesamt-titel">◎ Gesamtprozess des RMS: ${_gkEsc(n.kurz)}</div>
    </div>
    <div class="gk-kette-label" style="left:${g.label.x}px;top:${g.label.kette}px">Kette im Jahreszyklus</div>
    <div class="gk-kette-label" style="left:${g.label.x}px;top:${g.label.neben}px">Anlassbezogen daneben</div>
    ${glieder}${neben}${text}`;
}

function _gkBaenderHtml() {
  return _gkLage.baender.map(b => `<div class="gk-band" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;--gk-farbe:${b.farbe}">
      <div class="gk-band-kopf"><b>${_gkEsc(b.titel)}</b><span>${_gkEsc(b.text)}</span></div></div>`).join('');
}

function _gkLegende() {
  return `<div class="gk-legende" id="gk-legende">
    <span><i class="gk-l gk-l-ruft"></i>⊞ bindet ein</span>
    <span><i class="gk-l gk-l-unter"></i>↳ Unterprozess</span>
    <span><i class="gk-l gk-l-neben"></i>⇢ Nebenprozess</span>
    <span><i class="gk-l gk-l-quer"></i>Querbezug zu anderem Thema</span>
    <span><i class="gk-l gk-l-nutzt"></i>↔ nutzt Daten</span>
    <span>★ Hauptprozess · ● Modell im RMS</span>
  </div>`;
}

/** Ansicht aufbauen. Zoom, Wahl und Suche überstehen das erneute Zeichnen. */
function initGesamtkarte() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  if (typeof RMS_PROZESSE === 'undefined' || typeof RMS_THEMEN === 'undefined') {
    mount.innerHTML = `${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('gesamt') : ''}
      <div class="col-warning" style="display:block">Der Katalog der RMS-Prozesse ist nicht geladen. Bitte die Seite neu laden.</div>`;
    return;
  }
  _gkDaten = gkDaten();
  _gkLage = gkLayout(_gkDaten);
  if (_gkWahl && !_gkDaten.knoten.has(_gkWahl)) _gkWahl = '';
  const D = _gkDaten, L = _gkLage;
  const namen = [...D.knoten.values()].map(n => n.kurz).sort((a, b) => a.localeCompare(b, 'de'));
  mount.innerHTML = `${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('gesamt') : ''}
    <div class="gk-leiste">
      <div class="search-box gk-suchfeld">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input type="search" id="gk-suche" placeholder="Prozess, Rolle oder Norm suchen, z. B. Betriebsrat oder A.5.24"
          list="gk-namen" value="${_gkEsc(_gkSuche)}" aria-label="Gesamtkarte durchsuchen">
      </div>
      <datalist id="gk-namen">${namen.map(x => `<option value="${_gkEsc(x)}"></option>`).join('')}</datalist>
      <span class="gk-trefferzahl" id="gk-trefferzahl" aria-live="polite"></span>
      <div class="toolbar-spacer"></div>
      <button type="button" class="btn btn-sm btn-ghost" onclick="gkZoomen(1/1.4)" title="Verkleinern (Taste −)">－</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="gkZoomen(1.4)" title="Vergrößern (Taste +)">＋</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="gkEinpassen(true)" title="Ganze Karte zeigen (Taste 0)">⤢ Ganze Karte</button>
      <button type="button" class="btn btn-sm ${_gkQuer ? 'btn-primary' : 'btn-ghost'}" id="gk-quer-knopf" onclick="gkQuerUmschalten()"
        title="Querbezüge zwischen den Themen und Datenbezüge zeigen">↔ Querbezüge</button>
    </div>
    ${_gkLegende()}
    <div class="gk-buehne">
      <div class="gk-flaeche${_gkQuer ? '' : ' gk-ohne-quer'}" id="gk-flaeche" tabindex="0"
        aria-label="Gesamtkarte der RMS-Prozesse. Ziehen verschiebt, Mausrad zoomt, Plus und Minus auch.">
        <div class="gk-welt" id="gk-welt" style="width:${L.w}px;height:${L.h}px">
          ${_gkBaenderHtml()}
          ${D.themen.map(_gkThemaHtml).join('')}
          ${_gkGesamtHtml()}
          ${_gkLinien()}
          ${[...L.karten.keys()].map(_gkKarteHtml).join('')}
        </div>
        <div class="gk-etiketten" id="gk-etiketten">
          ${L.baender.map(b => `<span class="gk-etikett gk-etikett-band" data-gk-ort="band:${_gkEsc(b.key)}" data-gk-rang="1000" style="--gk-farbe:${b.farbe}">${_gkEsc(b.titel)}</span>`).join('')}
          ${D.gesamt ? `<button type="button" class="gk-etikett gk-etikett-gesamt" data-gk-ort="gesamt" data-gk-rang="500">◎ Gesamtprozess<small>Kette im Jahreszyklus</small></button>` : ''}
          ${D.themen.map(t => `<button type="button" class="gk-etikett" data-gk-ort="thema:${_gkEsc(t.key)}" data-gk-thema="${_gkEsc(t.key)}" data-gk-rang="${t.mitglieder.length}"
            style="--gk-farbe:${_gkPhase(t.phase).farbe}">${t.icon} ${_gkEsc(t.titel)}<small>${t.mitglieder.length} Prozess${t.mitglieder.length === 1 ? '' : 'e'}</small></button>`).join('')}
        </div>
        ${_gkMiniHtml()}
      </div>
      <aside class="gk-panel" id="gk-panel" aria-live="polite"></aside>
    </div>`;
  _gkVerdrahten();
  const fl = document.getElementById('gk-flaeche');
  const wunsch = _gkWunsch; _gkWunsch = null;
  if (!_gkT) gkEinpassen(false); else _gkAnwenden();
  if (wunsch && wunsch.prozess) {
    const n = [...D.knoten.values()].find(x => x.kennung === wunsch.prozess || x.name === wunsch.prozess || x.kurz === wunsch.prozess);
    if (n) gkWaehlen(n.name, true);
  } else if (wunsch && wunsch.thema && _gkThema(wunsch.thema)) {
    gkThemaZeigen(wunsch.thema);
  }
  _gkPanelZeichnen();
  _gkSucheAnwenden(false);
  if (fl && typeof ResizeObserver === 'function') new ResizeObserver(() => _gkAnwenden()).observe(fl);
}

/* ── Übersichtskarte unten links ─────────────────────────────────────── */

function _gkMiniHtml() {
  const L = _gkLage, s = 180 / L.w;
  return `<div class="gk-mini" id="gk-mini" style="width:${Math.round(L.w * s)}px;height:${Math.round(L.h * s)}px" title="Übersicht: klicken springt hin">
    <svg width="${Math.round(L.w * s)}" height="${Math.round(L.h * s)}" viewBox="0 0 ${L.w} ${L.h}">
      <rect x="${L.gesamt.x}" y="${L.gesamt.y}" width="${L.gesamt.w}" height="${L.gesamt.h}" fill="#1A2644" opacity=".55"/>
      ${_gkDaten.themen.map(t => { const r = L.themen[t.key]; return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${_gkPhase(t.phase).farbe}" opacity=".55"/>`; }).join('')}
      <rect id="gk-mini-sicht" x="0" y="0" width="10" height="10" fill="none" stroke="#F08300" stroke-width="${Math.round(2 / s)}"/>
    </svg></div>`;
}

/* ── Bewegen ─────────────────────────────────────────────────────────── */

function _gkFlaeche() { return document.getElementById('gk-flaeche'); }

/** Was von der Karte zu sehen ist. Die Seitenspalte steht daneben, die Fläche wird dann schmaler. */
function _gkSicht() {
  const fl = _gkFlaeche();
  if (!fl) return { w: 1000, h: 600 };
  return { w: Math.max(200, fl.clientWidth), h: Math.max(200, fl.clientHeight) };
}

function _gkZoomKlasse(k) { return k < GK_ZOOM_MITTEL ? 'gk-fern' : k < GK_ZOOM_NAH ? 'gk-mittel' : 'gk-nah'; }

function _gkAnwenden() {
  const fl = _gkFlaeche(), welt = document.getElementById('gk-welt');
  if (!fl || !welt || !_gkT) return;
  const { k, x, y } = _gkT;
  welt.style.transform = `translate(${x}px,${y}px) scale(${k})`;
  const klasse = _gkZoomKlasse(k);
  ['gk-fern', 'gk-mittel', 'gk-nah'].forEach(c => fl.classList.toggle(c, c === klasse));
  // Etiketten der Themen in Bildschirmgröße, solange die Karte zu klein für ihre Köpfe ist.
  const et = document.getElementById('gk-etiketten');
  if (et) et.classList.toggle('gk-klein', k < 0.2);
  if (et && klasse === 'gk-fern') {
    // Schilder in Bildschirmgröße, solange die Karte zu klein für ihre Köpfe ist.
    // Wer ein größeres Schild verdecken würde, wartet, bis Platz ist.
    const belegt = [];
    [.../** @type {NodeListOf<HTMLElement>} */ (et.querySelectorAll('[data-gk-ort]'))].sort((a, b) => (+b.dataset.gkRang || 0) - (+a.dataset.gkRang || 0)).forEach(el => {
      const [art, key] = el.dataset.gkOrt.split(':');
      const r = art === 'thema' ? _gkLage.themen[key] : art === 'gesamt' ? _gkLage.gesamt.inhalt : _gkLage.baender.find(b => b.key === key);
      if (!r) return;
      el.style.visibility = '';
      let l, t;
      if (art === 'band') {
        el.style.maxWidth = Math.max(40, Math.round(r.w * k - 20)) + 'px';
        l = x + (r.x + 24) * k; t = y + (r.y + 14) * k;
      } else if (art === 'thema') {
        // In die linke obere Ecke des Themas, wie ein Ortsname auf der Karte.
        l = x + r.x * k + 6; t = y + (r.y + 10) * k + 4;
      } else {
        l = x + (r.x + r.w / 2) * k - el.offsetWidth / 2; t = y + (r.y + r.h / 2) * k - el.offsetHeight / 2;
      }
      const stoesst = (bx) => belegt.some(q => bx.l < q.r + 4 && q.l < bx.r + 4 && bx.t < q.b + 4 && q.t < bx.b + 4);
      let box = { l, t, r: l + el.offsetWidth, b: t + el.offsetHeight };
      // Ein Thema-Schild weicht innerhalb seines Themas nach unten aus, bevor es verschwindet.
      for (let i = 0; art === 'thema' && i < 4 && stoesst(box) && box.b + el.offsetHeight + 6 < y + (r.y + r.h) * k; i++) {
        box = { l: box.l, t: box.t + el.offsetHeight + 6, r: box.r, b: box.b + el.offsetHeight + 6 };
      }
      el.style.left = Math.round(box.l) + 'px'; el.style.top = Math.round(box.t) + 'px';
      if (stoesst(box)) { el.style.visibility = 'hidden'; return; }
      belegt.push(box);
    });
  }
  const sicht = document.getElementById('gk-mini-sicht');
  if (sicht) {
    sicht.setAttribute('x', String(Math.round(-x / k)));
    sicht.setAttribute('y', String(Math.round(-y / k)));
    sicht.setAttribute('width', String(Math.round(fl.clientWidth / k)));
    sicht.setAttribute('height', String(Math.round(fl.clientHeight / k)));
  }
}

function _gkBegrenzen(k) { return Math.min(GK_ZOOM_MAX, Math.max(GK_ZOOM_MIN, k)); }

/** Weich zu einer neuen Lage gleiten. */
function _gkGleiten(ziel, ms) {
  if (!_gkT || !ms || typeof requestAnimationFrame !== 'function') { _gkT = ziel; _gkAnwenden(); return; }
  const start = Object.assign({}, _gkT), t0 = Date.now(), lauf = ++_gkAnim;
  const schritt = () => {
    if (lauf !== _gkAnim) return;
    const f = Math.min(1, (Date.now() - t0) / ms), e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    _gkT = { k: start.k + (ziel.k - start.k) * e, x: start.x + (ziel.x - start.x) * e, y: start.y + (ziel.y - start.y) * e };
    _gkAnwenden();
    if (f < 1) requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
}

/** Ein Rechteck der Welt in die Sicht holen. */
function _gkZeigeRechteck(r, maxK, ms) {
  const s = _gkSicht(), rand = 40;
  const k = _gkBegrenzen(Math.min((s.w - rand * 2) / r.w, (s.h - rand * 2) / r.h, maxK || GK_ZOOM_MAX));
  _gkGleiten({ k, x: s.w / 2 - (r.x + r.w / 2) * k, y: s.h / 2 - (r.y + r.h / 2) * k }, ms);
}

function gkEinpassen(weich) {
  if (!_gkLage) return;
  _gkZeigeRechteck({ x: 0, y: 0, w: _gkLage.w, h: _gkLage.h }, 1, weich ? 350 : 0);
}

/** Um die Mitte der Sicht (oder einen Punkt) zoomen. */
function gkZoomen(faktor, px, py) {
  if (!_gkT) return;
  const s = _gkSicht();
  const cx = px == null ? s.w / 2 : px, cy = py == null ? s.h / 2 : py;
  const k = _gkBegrenzen(_gkT.k * faktor), f = k / _gkT.k;
  const ziel = { k, x: cx - (cx - _gkT.x) * f, y: cy - (cy - _gkT.y) * f };
  if (px == null) _gkGleiten(ziel, 200); else { _gkAnim++; _gkT = ziel; _gkAnwenden(); }
}

function gkThemaZeigen(key) {
  const r = _gkLage && _gkLage.themen[key];
  if (!r) return;
  const s = _gkSicht(), rand = 40;
  const passt = Math.min((s.w - 2 * rand) / r.w, (s.h - 2 * rand) / r.h);
  // Mindestens so nah, dass die Namen lesbar sind. Passt das Thema dann nicht
  // mehr ganz hinein, steht es oben links: Kopf und Hauptprozess zuerst.
  const k = _gkBegrenzen(Math.min(1.1, Math.max(passt, 0.55)));
  const x = r.w * k <= s.w - 2 * rand ? s.w / 2 - (r.x + r.w / 2) * k : rand - r.x * k;
  const y = r.h * k <= s.h - 2 * rand ? s.h / 2 - (r.y + r.h / 2) * k : rand - r.y * k;
  _gkGleiten({ k, x, y }, 400);
}

/** Einen Prozess wählen: Seitenspalte füllen, Abhängigkeiten hervorheben, auf Wunsch hinfahren. */
function gkWaehlen(name, hinfahren) {
  if (!_gkDaten || !_gkDaten.knoten.has(name)) return;
  _gkWahl = name;
  _gkPanelZeichnen();
  _gkHervorheben();
  if (hinfahren) {
    const r = _gkLage.karten.get(name);
    if (r) {
      const k = Math.max(_gkT ? _gkT.k : 1, GK_ZOOM_NAH);
      const s = _gkSicht();
      _gkGleiten({ k, x: s.w / 2 - (r.x + r.w / 2) * k, y: s.h / 2 - (r.y + r.h / 2) * k }, 400);
    }
  }
}

function gkAbwaehlen() { _gkWahl = ''; _gkPanelZeichnen(); _gkHervorheben(); }

function gkQuerUmschalten() {
  _gkQuer = !_gkQuer;
  const fl = _gkFlaeche(); if (fl) fl.classList.toggle('gk-ohne-quer', !_gkQuer);
  const b = document.getElementById('gk-quer-knopf');
  if (b) { b.classList.toggle('btn-primary', _gkQuer); b.classList.toggle('btn-ghost', !_gkQuer); }
}

/** Gewählten Prozess und seine Nachbarn markieren, alles andere tritt zurück. */
function _gkHervorheben() {
  const welt = document.getElementById('gk-welt');
  if (!welt) return;
  const nah = new Set();
  if (_gkWahl) _gkDaten.kanten.forEach(k => { if (k.von === _gkWahl) nah.add(k.nach); if (k.nach === _gkWahl) nah.add(k.von); });
  welt.classList.toggle('gk-hat-wahl', !!_gkWahl);
  /** @type {NodeListOf<HTMLElement>} */ (welt.querySelectorAll('.gk-karte')).forEach(el => {
    el.classList.toggle('gk-gewaehlt', el.dataset.gk === _gkWahl);
    el.classList.toggle('gk-nachbar', nah.has(el.dataset.gk));
  });
  /** @type {NodeListOf<HTMLElement>} */ (welt.querySelectorAll('.gk-linie')).forEach(el => el.classList.toggle('gk-an', !!_gkWahl && (el.dataset.von === _gkWahl || el.dataset.nach === _gkWahl)));
}

/* ── Suche ───────────────────────────────────────────────────────────── */

function _gkSucheAnwenden(springen) {
  const treffer = gkTreffer(), set = new Set(treffer);
  const welt = document.getElementById('gk-welt');
  if (welt) {
    welt.classList.toggle('gk-sucht', !!_gkSuche.trim());
    /** @type {NodeListOf<HTMLElement>} */ (welt.querySelectorAll('.gk-karte')).forEach(el => el.classList.toggle('gk-treffer', set.has(el.dataset.gk)));
  }
  const z = document.getElementById('gk-trefferzahl');
  if (z) z.textContent = _gkSuche.trim() ? (treffer.length ? `${treffer.length} Treffer${treffer.length > 1 ? ', Eingabetaste springt weiter' : ''}` : 'kein Treffer') : '';
  if (springen && treffer.length) {
    _gkTrefferIdx = _gkTrefferIdx % treffer.length;
    gkWaehlen(treffer[_gkTrefferIdx], true);
    _gkTrefferIdx++;
  }
}

/* ── Seitenspalte ────────────────────────────────────────────────────── */

function _gkVerweis(name, zusatz) {
  const n = _gkDaten.knoten.get(name);
  if (!n) return '';
  const t = _gkThema(n.thema), eigen = _gkDaten.knoten.get(_gkWahl);
  const fremd = t && eigen && eigen.thema !== n.thema;
  return `<li><a href="#" onclick="gkWaehlen(${_gkArg(name)}, true);return false">${_gkEsc(n.kurz)}</a>${
    fremd ? ` <span class="gk-chip" style="--gk-farbe:${_gkPhase(t.phase).farbe}">${t.icon} ${_gkEsc(t.titel)}</span>` : ''}${
    zusatz ? `<div class="gk-verweis-text">${_gkEsc(zusatz)}</div>` : ''}</li>`;
}

function _gkSchrittHtml(s) {
  if (s.kind === 'start') return `<li class="gk-s-start">▶ ${_gkEsc(s.label)}</li>`;
  if (s.kind === 'ende') return `<li class="gk-s-ende">■ ${_gkEsc(s.label)}</li>`;
  if (s.kind === 'warten') return `<li class="gk-s-warten">⏳ ${_gkEsc(s.label)}</li>`;
  if (s.kind === 'zurueck') return `<li class="gk-s-warten">↺ zurück zu ${_gkEsc(s.label)}</li>`;
  const rolle = s.bahn ? `<b>${_gkEsc(s.bahn)}:</b> ` : '';
  if (s.kind === 'frage') {
    const weiter = s.neinEnde ? `, Ende: ${_gkEsc(s.neinEnde)}` : s.neinZurueck ? `, zurück zu ${_gkEsc(s.neinZurueck)}` : '';
    return `<li class="gk-s-frage">${rolle}◆ ${_gkEsc(s.label)}${s.nein || weiter ? `<div class="gk-verweis-text">nein: ${_gkEsc(s.nein || '')}${weiter}</div>` : ''}</li>`;
  }
  const z = { unter: '⊞ ', service: '⚙ ', manual: '✋ ' }[s.kind] || '';
  const ziel = s.kind === 'unter' && typeof rmsProzess === 'function' ? rmsProzess(s.label) : null;
  const label = ziel ? `<a href="#" onclick="gkWaehlen(${_gkArg(ziel.name)}, true);return false">${_gkEsc(s.label)}</a>` : _gkEsc(s.label);
  return `<li>${rolle}${z}${label}</li>`;
}

function _gkPanelZeichnen() {
  const panel = document.getElementById('gk-panel');
  if (!panel) return;
  const n = _gkWahl && _gkDaten.knoten.get(_gkWahl);
  panel.classList.toggle('offen', !!n);
  if (!n) { panel.innerHTML = ''; return; }
  const t = _gkThema(n.thema);
  const modell = gkModell(n.name);
  const gruppen = [
    ['Bindet ein', n.aus.filter(k => k.art === 'ruft')],
    ['Unterprozesse', n.aus.filter(k => k.art === 'unter')],
    ['Nebenprozesse', n.aus.filter(k => k.art === 'neben')],
    ['Eingebunden in oder genannt bei', n.ein.filter(k => k.art !== 'nutzt')],
    ['Nutzt Daten von', n.aus.filter(k => k.art === 'nutzt')],
    ['Liefert Daten an', n.ein.filter(k => k.art === 'nutzt')],
  ].filter(([, l]) => l.length);
  const reiter = gkReiterVon(n.name);
  const pfad = [];
  let zeiger = n.name;
  for (let i = 0; i < 8 && zeiger; i++) { const b = _gkLage.baum.find(k => k.nach === zeiger); zeiger = b ? b.von : ''; if (zeiger) pfad.unshift(zeiger); }
  const rollen = n.rollen;
  panel.innerHTML = `
    <div class="gk-panel-kopf">
      <div class="gk-panel-pfad">${_gkDaten.gesamt && !n.gesamt ? `<a href="#" onclick="gkWaehlen(${_gkArg(_gkDaten.gesamt)}, true);return false">Gesamtprozess</a> › ` : ''}${
        t ? `<a href="#" onclick="gkThemaZeigen(${_gkArg(t.key)});return false">${t.icon} ${_gkEsc(t.titel)}</a>${pfad.length ? ' › ' : ''}` : ''}${
        pfad.filter(x => !(_gkDaten.knoten.get(x) || {}).gesamt).map(x => `<a href="#" onclick="gkWaehlen(${_gkArg(x)}, true);return false">${_gkEsc(_gkKurz(x))}</a>`).join(' › ')}</div>
      <button type="button" class="gk-panel-zu" onclick="gkAbwaehlen()" title="Schließen (Esc)" aria-label="Schließen">✕</button>
    </div>
    <h3 class="gk-panel-titel">${_gkEsc(n.kurz)}</h3>
    <div class="gk-panel-art"><span class="gk-chip" style="--gk-farbe:${_gkFarbe(n.name)}">${_gkEsc(gkArtVon(n.name))}</span>${
      t ? ` <span class="gk-chip gk-chip-hell">${_gkEsc(_gkPhase(t.phase).titel)}</span>` : ''}</div>
    ${n.beschreibung.map(x => `<p>${_gkEsc(x)}</p>`).join('')}
    ${n.norm ? `<div class="gk-panel-norm">📐 <b>Normbezug:</b> ${_gkEsc(n.norm)}</div>` : ''}
    <div class="gk-panel-abschnitt">Rollen im Ablauf</div>
    <div class="gk-rollen">${rollen.map(r => `<span class="${r.auto ? 'gk-rolle-auto' : ''}" title="${r.n} Schritt${r.n === 1 ? '' : 'e'}">${r.auto ? '⚙ ' : ''}${_gkEsc(r.name)} <small>${r.n}</small></span>`).join('')}</div>
    <details class="gk-ablauf"${n.gesamt ? ' open' : ''}><summary>Ablauf: ${n.nAufgaben} Schritte, ${n.nFragen} Entscheidung${n.nFragen === 1 ? '' : 'en'}</summary>
      <ol>${n.schritte.map(_gkSchrittHtml).join('')}</ol></details>
    ${gruppen.map(([titel, liste]) => `<div class="gk-panel-abschnitt">${_gkEsc(titel)} <small>${liste.length}</small></div>
      <ul class="gk-verweise">${liste.map(k => _gkVerweis(k.von === n.name ? k.nach : k.von, k.text)).join('')}</ul>`).join('')}
    <div class="gk-panel-abschnitt">Im RMS</div>
    <div class="gk-panel-rms">${!_gkModelleGeladen() ? '<span class="field-hint">Modelle werden geladen …</span>'
      : modell ? `<button type="button" class="btn btn-sm btn-outline" onclick="openProcessAnsicht(${_gkArg(modell.itemId)})">🔀 Modell öffnen</button>
        <div class="gk-regelwerke" id="gk-regelwerke"><span class="field-hint">Regelwerke werden gelesen …</span></div>`
      : '<span class="field-hint">Noch kein Modell im RMS. „📋 Standard-Prozesse“ in der Modell-Liste legt es an.</span>'}
      ${_gkDarfReiter(reiter) ? `<button type="button" class="btn btn-sm btn-ghost" onclick="gkReiterOeffnen(${_gkArg(reiter)})">→ ${_gkEsc(_gkReiterName(reiter))}</button>` : ''}
    </div>`;
  if (modell) _gkRegelwerkeLaden(modell);
}

/** Die Regelwerke am Modell, aus dem Eintrag des Modells (einmal gelesen, dann gemerkt). */
async function _gkRegelwerkeLaden(modell) {
  const zeigen = () => {
    const el = document.getElementById('gk-regelwerke');
    const ids = _gkRegelwerke.get(modell.itemId);
    if (!el || ids === 'lädt' || ids == null) return;
    const policies = (typeof State !== 'undefined' && Array.isArray(State.policies)) ? State.policies : [];
    const liste = ids.map(id => policies.find(p => String(p.id) === String(id))).filter(Boolean);
    el.innerHTML = liste.length
      ? `<div class="gk-panel-abschnitt">Regelwerke am Modell <small>${liste.length}</small></div><ul class="gk-verweise">${liste.map(p =>
          `<li>${typeof openDetail === 'function' ? `<a href="#" onclick="openDetail(${_gkArg(p.id)});return false">${_gkEsc(p.title)}</a>` : _gkEsc(p.title)}${p.status ? ` <span class="gk-verweis-text">${_gkEsc(p.status)}</span>` : ''}</li>`).join('')}</ul>`
      : '<span class="field-hint">Am Modell ist noch kein Regelwerk verknüpft.</span>';
  };
  if (_gkRegelwerke.has(modell.itemId)) { zeigen(); return; }
  if (typeof procEintragLaden !== 'function') { _gkRegelwerke.set(modell.itemId, []); zeigen(); return; }
  _gkRegelwerke.set(modell.itemId, 'lädt');
  let ids = [];
  try { const e = await procEintragLaden(modell); ids = (e && Array.isArray(e.p)) ? e.p.map(String) : []; } catch (err) { ids = []; }
  _gkRegelwerke.set(modell.itemId, ids);
  zeigen();
}

/** In den Reiter eines Themas wechseln; das KI-Dashboard ist eine eigene Seite. */
function gkReiterOeffnen(view) {
  if (view === 'ki') { window.open('ki/', '_blank', 'noopener'); return; }
  if (typeof switchView === 'function') switchView(view);
}

/**
 * Von außen: die Gesamtkarte öffnen und ein Thema oder einen Prozess zeigen
 * (Link ?ansicht=prozesse&karte=gesamt&thema=… oder Knopf in der Kopfzeile).
 */
function gkWunschSetzen(w) {
  _gkWunsch = w || null;
  if (typeof _prozModus !== 'undefined') _prozModus = 'gesamt';
}

/* ── Bedienung ───────────────────────────────────────────────────────── */

/** Das nächste Element zum Ziel eines Ereignisses, das zum Selektor passt. */
function _gkNah(e, sel) {
  const t = /** @type {any} */ (e.target);
  return /** @type {HTMLElement|null} */ (t && t.closest ? t.closest(sel) : null);
}

function _gkVerdrahten() {
  const fl = _gkFlaeche();
  if (!fl) return;
  const zeiger = new Map();
  let start = null, bewegt = false, pinch = null;

  fl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = fl.getBoundingClientRect();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    gkZoomen(Math.exp(-d * 0.0016), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  fl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || _gkNah(e, '.gk-mini')) return;
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zeiger.size === 1) { start = { x: e.clientX, y: e.clientY, tx: _gkT.x, ty: _gkT.y }; bewegt = false; }
    if (zeiger.size === 2) {
      const [a, b] = [...zeiger.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: _gkT.k };
    }
  });
  fl.addEventListener('pointermove', (e) => {
    if (!zeiger.has(e.pointerId)) return;
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zeiger.size === 2 && pinch) {
      const [a, b] = [...zeiger.values()], r = fl.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      gkZoomen((pinch.k * d / pinch.d) / _gkT.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      bewegt = true;
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!bewegt && Math.hypot(dx, dy) > 4) { bewegt = true; try { fl.setPointerCapture(e.pointerId); } catch (err) { /* egal */ } fl.classList.add('gk-zieht'); }
    if (bewegt) { _gkAnim++; _gkT = { k: _gkT.k, x: start.tx + dx, y: start.ty + dy }; _gkAnwenden(); }
  });
  const loslassen = (e) => {
    zeiger.delete(e.pointerId);
    if (zeiger.size < 2) pinch = null;
    if (zeiger.size === 0) { fl.classList.remove('gk-zieht'); start = null; }
  };
  fl.addEventListener('pointerup', loslassen);
  fl.addEventListener('pointercancel', loslassen);

  fl.addEventListener('click', (e) => {
    if (bewegt) { bewegt = false; return; }
    if (_gkNah(e, '[data-gk-ort="gesamt"]')) { _gkZeigeRechteck(_gkLage.gesamt.inhalt, 1.1, 400); return; }
    const reiter = _gkNah(e, '[data-gk-reiter]');
    if (reiter) { gkReiterOeffnen(reiter.dataset.gkReiter); return; }
    const karte = _gkNah(e, '[data-gk]');
    if (karte) { gkWaehlen(karte.dataset.gk, false); return; }
    const thema = _gkNah(e, '[data-gk-thema]');
    if (thema && thema.dataset.gkThema) { gkThemaZeigen(thema.dataset.gkThema); return; }
    if (!_gkNah(e, '.gk-mini')) gkAbwaehlen();
  });
  fl.addEventListener('dblclick', (e) => {
    const karte = _gkNah(e, '[data-gk]');
    if (karte) { gkWaehlen(karte.dataset.gk, true); return; }
    const r = fl.getBoundingClientRect();
    gkZoomen(2, e.clientX - r.left, e.clientY - r.top);
  });
  fl.addEventListener('keydown', (e) => {
    const karte = _gkNah(e, '[data-gk]');
    const thema = _gkNah(e, '[data-gk-thema]');
    if (e.key === 'Enter' && karte) { gkWaehlen(karte.dataset.gk, true); e.preventDefault(); return; }
    if (e.key === 'Enter' && thema) { gkThemaZeigen(thema.dataset.gkThema); e.preventDefault(); return; }
    const schritt = 120;
    const tasten = {
      '+': () => gkZoomen(1.4), '=': () => gkZoomen(1.4), '-': () => gkZoomen(1 / 1.4), '0': () => gkEinpassen(true),
      ArrowLeft: () => gkVerschieben(schritt, 0), ArrowRight: () => gkVerschieben(-schritt, 0),
      ArrowUp: () => gkVerschieben(0, schritt), ArrowDown: () => gkVerschieben(0, -schritt),
      Escape: () => gkAbwaehlen(),
    };
    if (tasten[e.key]) { tasten[e.key](); e.preventDefault(); }
  });

  const mini = document.getElementById('gk-mini');
  if (mini) {
    const springe = (e) => {
      const r = mini.getBoundingClientRect(), s = _gkSicht();
      const wx = (e.clientX - r.left) / r.width * _gkLage.w, wy = (e.clientY - r.top) / r.height * _gkLage.h;
      _gkAnim++;
      _gkT = { k: _gkT.k, x: s.w / 2 - wx * _gkT.k, y: s.h / 2 - wy * _gkT.k };
      _gkAnwenden();
    };
    let ziehtMini = false;
    mini.addEventListener('pointerdown', (e) => { ziehtMini = true; try { mini.setPointerCapture(e.pointerId); } catch (err) { /* egal */ } springe(e); e.stopPropagation(); });
    mini.addEventListener('pointermove', (e) => { if (ziehtMini) springe(e); });
    mini.addEventListener('pointerup', () => { ziehtMini = false; });
  }

  const suche = /** @type {HTMLInputElement|null} */ (document.getElementById('gk-suche'));
  if (suche) {
    suche.addEventListener('input', () => { _gkSuche = suche.value; _gkTrefferIdx = 0; _gkSucheAnwenden(false); });
    suche.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); _gkSucheAnwenden(true); } });
  }
}

function gkVerschieben(dx, dy) {
  if (!_gkT) return;
  _gkGleiten({ k: _gkT.k, x: _gkT.x + dx, y: _gkT.y + dy }, 150);
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { gkDaten, gkLayout, gkRollen, gkThemaRollen, gkTrifft, gkKantenText, GK_PHASEN, GK_REITER, GK_MASS };
}
