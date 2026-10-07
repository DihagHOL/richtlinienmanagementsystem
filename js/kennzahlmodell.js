'use strict';

/**
 * Kennzahlen: das Modell (ohne DOM, ohne SharePoint)
 * ==================================================
 * ISO 27001 9.1 verlangt festzulegen, was überwacht und gemessen wird, mit
 * welcher Methode, wann, von wem, und wann ausgewertet wird. Auf der ISMS-Site
 * stehen dafür zwei Listen: „Kennzahlen" (Titel, Kennzahl-Typ, Turnus,
 * Einheit, Verantwortlich, Umfang, Zweck, Normalwert, Messung, Betroffener
 * Bereich, Standort) und „Kennzahlen Tracking" mit den Messwerten (IST-Wert,
 * Datum der Erhebung, Erhoben durch, Maßnahme, Bemerkung, Standorte).
 *
 * Der Normalwert ist Freitext („<= 5 offene Maßnahmen", „60%",
 * „Grün: > 90%, Gelb: 70-90%, Rot: < 70%"). Was sich davon lesen lässt, wird
 * zur Ampel; was nicht, bleibt „offen" und wird als Lücke genannt, statt eine
 * Bewertung zu raten. Daraus folgen Ampel, Trend und die nächste fällige
 * Messung aus dem Turnus.
 */

const KZ_TURNUS = [
  { key: 'Monatlich',     monate: 1 },
  { key: 'Quartalsweise', monate: 3 },
  { key: 'Halbjährlich',  monate: 6 },
  { key: 'Jährlich',      monate: 12 },
];
const KZ_TYPEN = ['Prozess-Kennzahl', 'Technik-Kennzahl', 'Awareness-Kennzahl'];
const KZ_EINHEITEN = ['Stückzahl', 'Prozentsatz', 'Zustand'];

const _kzPct = (a, b) => (b ? Math.round(a / b * 100) : null);
const _kzZahlOder = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Was das RMS selbst misst. `wert` liest aus den Metriken des Audit Reports
 * (_clevelGather); fehlt ein Teil, ist der Wert null statt einer falschen Null.
 */
const KZ_AUTOMATIK = [
  { key: 'kenntnisquote', label: 'Kenntnisnahme-Quote der Pflicht-Regelwerke', einheit: '%', norm: 'ISO 27001 7.3',
    wert: (m) => (m.compliance ? _kzZahlOder(m.compliance.quote) : null) },
  { key: 'annexAbdeckung', label: 'Anhang A durch Regelwerke abgedeckt', einheit: '%', norm: 'ISO 27001 6.1.3',
    wert: (m) => (m.abdeckung ? _kzZahlOder(m.abdeckung.annexPct) : null) },
  { key: 'soaUmgesetzt', label: 'Anwendbare Controls umgesetzt (SoA)', einheit: '%', norm: 'ISO 27001 6.1.3 d',
    wert: (m) => (m.soa && m.soa.anwendbar ? _kzPct(m.soa.umgesetzt, m.soa.anwendbar) : null) },
  { key: 'risikenHoch', label: 'Offene hohe Risiken', einheit: '', norm: 'ISO 27001 8.3',
    wert: (m) => (m.risiken ? _kzZahlOder(m.risiken.hoch) : null) },
  { key: 'massnahmenUeberfaellig', label: 'Überfällige Maßnahmen (alle Register)', einheit: '', norm: 'ISO 27001 10.2',
    wert: (m) => (m.massnahmen ? _kzZahlOder(m.massnahmen.ueberfaellig)
      : (m.risiken || m.wirksamkeit) ? ((m.risiken ? m.risiken.mUeber : 0) + (m.wirksamkeit ? m.wirksamkeit.mUeber : 0)) : null) },
  { key: 'massnahmenOffen', label: 'Offene Maßnahmen (alle Register)', einheit: '', norm: 'ISO 27001 10.2',
    wert: (m) => (m.massnahmen ? m.massnahmen.offen + m.massnahmen.inUmsetzung : null) },
  { key: 'abweichungenOffen', label: 'Offene Abweichungen', einheit: '', norm: 'ISO 27001 10.2',
    wert: (m) => (m.wirksamkeit ? _kzZahlOder(m.wirksamkeit.abwOffen) : null) },
  { key: 'ausnahmenAbgelaufen', label: 'Abgelaufene Ausnahmen', einheit: '', norm: 'ISO 27001 A.5.36',
    wert: (m) => (m.ausnahmen ? _kzZahlOder(m.ausnahmen.abgelaufen) : null) },
  { key: 'regelwerkeUeberfaellig', label: 'Regelwerke mit überfälliger Überprüfung', einheit: '', norm: 'ISO 27001 A.5.1',
    wert: (m) => (m.faellig ? _kzZahlOder(m.faellig.overdue) : null) },
  { key: 'vorfaelleUnbeurteilt', label: 'Sicherheitsvorfälle ohne Beurteilung', einheit: '', norm: 'ISO 27001 A.5.25',
    wert: (m) => (m.vorfaelle ? _kzZahlOder(m.vorfaelle.unbeurteilt) : null) },
  { key: 'zieleImPlan', label: 'Laufende Ziele im Plan (Termin nicht überschritten)', einheit: '%', norm: 'ISO 27001 6.2',
    wert: (m) => (m.ziele && m.ziele.laufend ? _kzPct(m.ziele.laufend - m.ziele.ueberschritten, m.ziele.laufend) : null) },
];

function kzTurnusInfo(k) { return KZ_TURNUS.find(x => x.key === k) || null; }
function kzAutomatikInfo(k) { return KZ_AUTOMATIK.find(x => x.key === k) || null; }

/** Was die Automatik gerade misst (oder null). */
function kzAutomatikWert(key, metriken) {
  const a = kzAutomatikInfo(key);
  if (!a || !metriken) return null;
  try { return a.wert(metriken); } catch (e) { return null; }
}

function kzHeute(d) { return (d ? new Date(d) : new Date()).toISOString().slice(0, 10); }
const _kzText = (v) => String(v == null ? '' : v).trim();
const _kzTag = (v) => { const t = _kzText(v).slice(0, 10); return /^\d{4}-\d\d-\d\d$/.test(t) ? t : ''; };
const _kzListe = (v) => (Array.isArray(v) ? v.filter(x => x && (x.id || x.wert)).map(x => ({ id: String(x.id || ''), wert: _kzText(x.wert) })) : []);

/** Zahl aus einer Eingabe: „95", „95,5", „36.73", „1.250,5" → Zahl, sonst null. */
function kzZahl(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  let t = String(s == null ? '' : s).replace(/\s/g, '').replace(/[%€]/g, '');
  if (!t) return null;
  if (t.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.split('.').join('').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Zahl deutsch geschrieben: 1250.5 → „1.250,5". */
function kzZahlText(n) {
  if (n === null || n === undefined || n === '') return '';
  const z = typeof n === 'number' ? n : kzZahl(n);
  return z === null ? String(n) : z.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

const _KZ_OP = (s) => ({ '≥': '>=', '≤': '<=', '=>': '>=', '=<': '<=' }[s] || s);
const _kzErfuellt = (wert, op, grenze) => (op === '>' ? wert > grenze : op === '>=' ? wert >= grenze : op === '<' ? wert < grenze : wert <= grenze);

/**
 * Den Normalwert lesen.
 *   „Grün: > 90%, Gelb: 70-90%, Rot: < 70%" → Ampel mit Grün- und Rot-Grenze
 *   „<= 5 offene Maßnahmen"                  → Grenze, höchstens 5
 *   „60%", „99,5%" (Einheit Prozentsatz)     → Grenze, mindestens
 * → { art: 'ampel', richtung, gruen: {op, wert}, rot: {op, wert} } | { art: 'grenze', richtung, op, wert } | null
 */
function kzSoll(normalwert, einheit) {
  const t = _kzText(normalwert);
  if (!t) return null;
  const gruen = /gr(?:ü|ue)n\s*:\s*(>=|<=|=>|=<|≥|≤|>|<)\s*([\d.,]+)/i.exec(t);
  const rot = /rot\s*:\s*(>=|<=|=>|=<|≥|≤|>|<)\s*([\d.,]+)/i.exec(t);
  if (gruen) {
    const g = { op: _KZ_OP(gruen[1]), wert: kzZahl(gruen[2]) };
    const r = rot ? { op: _KZ_OP(rot[1]), wert: kzZahl(rot[2]) } : null;
    if (g.wert !== null) return { art: 'ampel', richtung: g.op.startsWith('>') ? 'hoch' : 'niedrig', gruen: g, rot: (r && r.wert !== null) ? r : null };
  }
  const grenze = /(>=|<=|=>|=<|≥|≤|>|<)\s*([\d.,]+)/.exec(t);
  if (grenze && kzZahl(grenze[2]) !== null) {
    const op = _KZ_OP(grenze[1]);
    return { art: 'grenze', richtung: op.startsWith('>') ? 'hoch' : 'niedrig', op, wert: kzZahl(grenze[2]) };
  }
  const nur = /^(?:mind\.?|mindestens|ziel:?)?\s*([\d.,]+)\s*%?$/i.exec(t);
  if (nur && (einheit === 'Prozentsatz' || /%/.test(t) || /^mind/i.test(t)) && kzZahl(nur[1]) !== null) {
    return { art: 'grenze', richtung: 'hoch', op: '>=', wert: kzZahl(nur[1]) };
  }
  return null;
}

/** Ein Messwert gegen den Normalwert: 'erfuellt' · 'gelb' · 'verfehlt' · 'offen'. */
function kzBewertungWert(soll, wert) {
  const w = kzZahl(wert);
  if (!soll || w === null) return 'offen';
  if (soll.art === 'grenze') return _kzErfuellt(w, soll.op, soll.wert) ? 'erfuellt' : 'verfehlt';
  if (_kzErfuellt(w, soll.gruen.op, soll.gruen.wert)) return 'erfuellt';
  if (soll.rot && _kzErfuellt(w, soll.rot.op, soll.rot.wert)) return 'verfehlt';
  return soll.rot ? 'gelb' : 'verfehlt';
}

/** Kennzahl (Liste „Kennzahlen") und ihre Messwerte (Liste „Kennzahlen Tracking") → RMS-Kennzahlen. */
function kzAusHaus(kpis, tracking) {
  const werteVon = {};
  (Array.isArray(tracking) ? tracking : []).forEach(t => {
    const kid = t && t.kennzahl && t.kennzahl.id ? String(t.kennzahl.id) : '';
    if (!kid) return;
    const w = { id: String(t.id), datum: _kzTag(t.datum), wert: kzZahl(t.wert), roh: _kzText(t.wert),
      bemerkung: typeof zlOhneHtml === 'function' ? zlOhneHtml(t.bemerkung) : _kzText(t.bemerkung).replace(/<[^>]+>/g, ''),
      von: t.von ? (t.von.name || t.von.email || '') : '', standorte: _kzListe(t.standorte), massnahmen: _kzListe(t.massnahmen) };
    (werteVon[kid] = werteVon[kid] || []).push(w);
  });
  return (Array.isArray(kpis) ? kpis : []).map(r => {
    const werte = (werteVon[String(r.id)] || []).filter(w => w.datum).sort((a, b) => a.datum.localeCompare(b.datum) || a.id.localeCompare(b.id, 'de', { numeric: true }));
    return {
      id: r.id ? String(r.id) : null, name: _kzText(r.name), typ: KZ_TYPEN.includes(r.typ) ? r.typ : '',
      turnus: kzTurnusInfo(r.turnus) ? r.turnus : '', beschreibung: _kzText(r.beschreibung),
      einheit: KZ_EINHEITEN.includes(r.einheit) ? r.einheit : '',
      team: r.team && r.team.id ? { id: String(r.team.id), wert: _kzText(r.team.wert) } : null,
      umfang: _kzText(r.umfang), zweck: _kzText(r.zweck), normalwert: _kzText(r.normalwert),
      bereiche: _kzListe(r.bereiche), archiv: !!r.archiv, messung: _kzText(r.messung), standorte: _kzListe(r.standorte),
      werte, modified: r.modified || '',
    };
  });
}

/** RMS-Kennzahl → Felder der Liste „Kennzahlen". */
function kzZuHaus(k) {
  const x = k || {};
  const ids = (l) => (Array.isArray(l) ? l.map(e => (e && typeof e === 'object') ? e.id : e).filter(Boolean).map(String) : []);
  return {
    name: _kzText(x.name) || '(ohne Titel)', typ: KZ_TYPEN.includes(x.typ) ? x.typ : '', turnus: kzTurnusInfo(x.turnus) ? x.turnus : '',
    beschreibung: _kzText(x.beschreibung), einheit: KZ_EINHEITEN.includes(x.einheit) ? x.einheit : '',
    team: x.team ? String(x.team.id || x.team) : '', umfang: _kzText(x.umfang), zweck: _kzText(x.zweck),
    normalwert: _kzText(x.normalwert), bereiche: ids(x.bereiche), archiv: !!x.archiv, messung: _kzText(x.messung), standorte: ids(x.standorte),
  };
}

/** Ein Messwert → Eintrag in „Kennzahlen Tracking". Der IST-Wert ist Text, mit Punkt als Dezimalzeichen wie im Bestand. */
function kzWertZuHaus(w) {
  const x = w || {};
  const n = kzZahl(x.wert);
  return {
    wert: n === null ? _kzText(x.wert) : String(n), kennzahl: String(x.kennzahlId || ''), datum: _kzTag(x.datum),
    von: _kzText(x.von) || '', bemerkung: _kzText(x.bemerkung),
    standorte: (x.standorte || []).map(s => String((s && s.id) || s)).filter(Boolean),
  };
}

function kzLetzter(k) { const w = (k && k.werte) || []; return w.length ? w[w.length - 1] : null; }
function kzSollVon(k) { return kzSoll(k && k.normalwert, k && k.einheit); }

/** Bewertung des letzten (oder eines gegebenen) Werts. */
function kzBewertung(k, wert) {
  return kzBewertungWert(kzSollVon(k), wert === undefined ? (kzLetzter(k) || {}).wert : wert);
}

/** Trend der letzten beiden Werte, gemessen an der Richtung des Normalwerts. */
function kzTrend(k) {
  const w = ((k && k.werte) || []).filter(x => x.wert !== null);
  const soll = kzSollVon(k);
  if (w.length < 2 || !soll) return '';
  const a = w[w.length - 2].wert, b = w[w.length - 1].wert;
  if (a === b) return 'gleich';
  return ((soll.richtung === 'niedrig') ? b < a : b > a) ? 'besser' : 'schlechter';
}

/** Nächste Messung: letzter Wert plus Turnus; ohne Wert sofort. → { faellig, datum, tage } oder null */
function kzNaechsteMessung(k, heute) {
  const iv = kzTurnusInfo(k && k.turnus);
  if (!iv || !k || k.archiv) return null;
  const h = heute || kzHeute();
  const letzter = kzLetzter(k);
  if (!letzter || !letzter.datum) return { faellig: true, datum: '', tage: 0 };
  const d = new Date(letzter.datum + 'T00:00:00Z');
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + iv.monate);
  d.setUTCDate(Math.min(tag, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  const datum = d.toISOString().slice(0, 10);
  const tage = Math.round((Date.parse(datum + 'T00:00:00Z') - Date.parse(h + 'T00:00:00Z')) / 86400000);
  return { faellig: tage <= 0, datum, tage };
}

/** Was einer Kennzahl fehlt, damit sie 9.1 genügt. */
function kzLuecken(k, heute) {
  const f = [];
  if (!k || !_kzText(k.name)) f.push('Bezeichnung fehlt.');
  if (!k || k.archiv) return f;
  if (!k.normalwert) f.push('Kein Normalwert: Ohne ihn lässt sich nichts bewerten.');
  else if (!kzSollVon(k)) f.push('Der Normalwert lässt sich nicht als Grenze lesen (etwa „<= 5" oder „Grün: > 90%"). Die Ampel bleibt offen.');
  if (!k.team) f.push('Niemand ist verantwortlich.');
  if (!k.turnus) f.push('Kein Turnus.');
  if (!k.messung) f.push('Nicht festgelegt, wie gemessen wird.');
  const n = kzNaechsteMessung(k, heute);
  if (n && n.faellig) f.push(k.werte && k.werte.length ? `Messung fällig seit ${n.datum.split('-').reverse().join('.')}.` : 'Noch kein Messwert erfasst.');
  return f;
}

/** Kennzahlen über das Register (ohne Archiv). */
function kzKennzahlen(liste, heute) {
  const l = (liste || []).filter(k => k && !k.archiv);
  const bew = l.map(k => kzBewertung(k));
  return {
    gesamt: l.length,
    erfuellt: bew.filter(b => b === 'erfuellt').length,
    gelb: bew.filter(b => b === 'gelb').length,
    verfehlt: bew.filter(b => b === 'verfehlt').length,
    offen: bew.filter(b => b === 'offen').length,
    messungFaellig: l.filter(k => { const n = kzNaechsteMessung(k, heute); return n && n.faellig; }).length,
    ohneSoll: l.filter(k => !kzSollVon(k)).length,
    mitLuecken: l.filter(k => kzLuecken(k, heute).length).length,
  };
}

/** Die Kennzahlen der Prozesse aus pzEintraege(): eine Zeile je Kennzahl. */
function kzAusProzessen(eintraege) {
  const out = [];
  (eintraege || []).forEach(e => ((e.kennzahlen && e.kennzahlen.liste) || []).forEach(k => {
    const soll = k.ziel ? { art: 'grenze', richtung: k.richtung === 'niedrig' ? 'niedrig' : 'hoch', op: k.richtung === 'niedrig' ? '<=' : '>=', wert: kzZahl(k.ziel) } : null;
    out.push({
      name: k.name, einheit: k.einheit || '', richtung: k.richtung || 'hoch', ziel: k.ziel || '', ist: k.ist || '', stand: k.stand || '',
      prozess: (e.kachel && e.kachel.name) || '', werk: e.werk || '', art: e.art, kachelId: (e.kachel && e.kachel.id) || '',
      geerbt: !!(e.kennzahlen && e.kennzahlen.geerbt),
      bewertung: (soll && soll.wert !== null) ? kzBewertungWert(soll, k.ist === '' ? null : k.ist) : 'offen',
    });
  }));
  return out.sort((a, b) => a.werk.localeCompare(b.werk) || a.prozess.localeCompare(b.prozess, 'de') || a.name.localeCompare(b.name, 'de'));
}

/** Verlauf als kleine Linie (SVG-Pfad), mit der Grenze des Normalwerts. → { pfad, soll, punkte } */
function kzVerlauf(k, breite, hoehe) {
  const w = ((k && k.werte) || []).filter(x => x.wert !== null).slice(-12);
  const b = breite || 120, h = hoehe || 28;
  if (!w.length) return { pfad: '', soll: null, punkte: [] };
  const s = kzSollVon(k);
  const grenze = s ? (s.art === 'grenze' ? s.wert : s.gruen.wert) : null;
  const zahlen = w.map(v => v.wert).concat(grenze === null ? [] : [grenze]);
  let min = Math.min(...zahlen), max = Math.max(...zahlen);
  if (min === max) { min -= 1; max += 1; }
  const px = (i) => (w.length === 1 ? b / 2 : (i / (w.length - 1)) * (b - 4) + 2);
  const py = (v) => h - 2 - ((v - min) / (max - min)) * (h - 4);
  const punkte = w.map((v, i) => ({ x: Math.round(px(i) * 10) / 10, y: Math.round(py(v.wert) * 10) / 10 }));
  return { pfad: punkte.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' '), soll: grenze === null ? null : Math.round(py(grenze) * 10) / 10, punkte };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KZ_TURNUS, KZ_TYPEN, KZ_EINHEITEN, KZ_AUTOMATIK, kzTurnusInfo, kzAutomatikInfo, kzAutomatikWert,
    kzHeute, kzZahl, kzZahlText, kzSoll, kzBewertungWert, kzAusHaus, kzZuHaus, kzWertZuHaus,
    kzLetzter, kzSollVon, kzBewertung, kzTrend, kzNaechsteMessung, kzLuecken, kzKennzahlen, kzAusProzessen, kzVerlauf,
  };
}
