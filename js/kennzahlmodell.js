'use strict';

/**
 * Kennzahlen: das Modell (ohne DOM, ohne SharePoint)
 * ==================================================
 * ISO 27001 9.1 verlangt festzulegen, was überwacht und gemessen wird, mit
 * welcher Methode, wann, von wem, und wann die Ergebnisse ausgewertet werden.
 * Die Werke führen dafür Excel-Tabellen („IMS-8.1 Kennzahlen": Kennzahl,
 * Einheit, Erhebungsintervall, Sollvorgabe, Datenquelle, Verantwortlich,
 * Verwendung). Was dort fehlt, ist der Verlauf: Eine Zeile sagt, was gemessen
 * werden soll, aber nicht, was im März herauskam und ob es besser wird.
 *
 * Hier hat jede Kennzahl ihre Messwerte mit Datum. Daraus ergeben sich der
 * letzte Stand, die Bewertung gegen den Sollwert, der Trend und wann die
 * nächste Messung fällig ist. Ein Teil der Werte entsteht im RMS selbst
 * (Kenntnisnahme-Quote, überfällige Maßnahmen …); die kann eine Kennzahl mit
 * „Automatik" übernehmen, statt dass jemand sie abschreibt. Die Kennzahlen der
 * Prozesse (Landkarte, Modelle) bleiben am Prozess und werden hier nur gezeigt.
 */

const KZ_INTERVALLE = [
  { key: 'monatlich', label: 'monatlich',     monate: 1 },
  { key: 'quartal',   label: 'quartalsweise', monate: 3 },
  { key: 'halbjahr',  label: 'halbjährlich',  monate: 6 },
  { key: 'jaehrlich', label: 'jährlich',      monate: 12 },
];

/* Dieselben Schlüssel wie PZ_RICHTUNG (Prozesskennzahlen), damit beide gleich lesen. */
const KZ_RICHTUNG = [
  { key: 'hoch',    label: 'mindestens', zeichen: '≥' },
  { key: 'niedrig', label: 'höchstens',  zeichen: '≤' },
];

const KZ_STATUS = [
  { key: 'entwurf',     label: 'In Erarbeitung' },
  { key: 'aktiv',       label: 'Aktiv' },
  { key: 'stillgelegt', label: 'Stillgelegt' },
];

const _kzPct = (a, b) => (b ? Math.round(a / b * 100) : null);
const _kzZahlOder = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Was das RMS selbst misst. `wert` liest aus den Metriken des Audit Reports
 * (_clevelGather); fehlt ein Teil, ist der Wert null statt einer falschen Null.
 */
const KZ_AUTOMATIK = [
  { key: 'kenntnisquote', label: 'Kenntnisnahme-Quote der Pflicht-Regelwerke', einheit: '%', richtung: 'hoch', ziel: '90', norm: 'ISO 27001 7.3',
    wert: (m) => (m.compliance ? _kzZahlOder(m.compliance.quote) : null) },
  { key: 'annexAbdeckung', label: 'Anhang A durch Regelwerke abgedeckt', einheit: '%', richtung: 'hoch', ziel: '80', norm: 'ISO 27001 6.1.3',
    wert: (m) => (m.abdeckung ? _kzZahlOder(m.abdeckung.annexPct) : null) },
  { key: 'soaUmgesetzt', label: 'Anwendbare Controls umgesetzt (SoA)', einheit: '%', richtung: 'hoch', ziel: '80', norm: 'ISO 27001 6.1.3 d',
    wert: (m) => (m.soa && m.soa.anwendbar ? _kzPct(m.soa.umgesetzt, m.soa.anwendbar) : null) },
  { key: 'risikenHoch', label: 'Offene hohe Risiken', einheit: 'Anzahl', richtung: 'niedrig', ziel: '0', norm: 'ISO 27001 8.3',
    wert: (m) => (m.risiken ? _kzZahlOder(m.risiken.hoch) : null) },
  { key: 'massnahmenUeberfaellig', label: 'Überfällige Maßnahmen (alle Register)', einheit: 'Anzahl', richtung: 'niedrig', ziel: '0', norm: 'ISO 27001 10.2',
    wert: (m) => (m.massnahmen ? _kzZahlOder(m.massnahmen.ueberfaellig)
      : (m.risiken || m.wirksamkeit) ? ((m.risiken ? m.risiken.mUeber : 0) + (m.wirksamkeit ? m.wirksamkeit.mUeber : 0)) : null) },
  { key: 'abweichungenOffen', label: 'Offene Abweichungen', einheit: 'Anzahl', richtung: 'niedrig', ziel: '0', norm: 'ISO 27001 10.2',
    wert: (m) => (m.wirksamkeit ? _kzZahlOder(m.wirksamkeit.abwOffen) : null) },
  { key: 'ausnahmenAbgelaufen', label: 'Abgelaufene Ausnahmen', einheit: 'Anzahl', richtung: 'niedrig', ziel: '0', norm: 'ISO 27001 A.5.36',
    wert: (m) => (m.ausnahmen ? _kzZahlOder(m.ausnahmen.abgelaufen) : null) },
  { key: 'regelwerkeUeberfaellig', label: 'Regelwerke mit überfälliger Überprüfung', einheit: 'Anzahl', richtung: 'niedrig', ziel: '0', norm: 'ISO 27001 A.5.1',
    wert: (m) => (m.faellig ? _kzZahlOder(m.faellig.overdue) : null) },
  { key: 'vorfaelleUnbeurteilt', label: 'Sicherheitsvorfälle ohne Beurteilung', einheit: 'Anzahl', richtung: 'niedrig', ziel: '0', norm: 'ISO 27001 A.5.25',
    wert: (m) => (m.vorfaelle ? _kzZahlOder(m.vorfaelle.unbeurteilt) : null) },
  { key: 'zieleImPlan', label: 'Laufende Ziele im Plan (Termin nicht überschritten)', einheit: '%', richtung: 'hoch', ziel: '100', norm: 'ISO 27001 6.2',
    wert: (m) => (m.ziele && m.ziele.laufend ? _kzPct(m.ziele.laufend - m.ziele.ueberschritten, m.ziele.laufend) : null) },
];

function kzIntervallInfo(k) { return KZ_INTERVALLE.find(x => x.key === k) || null; }
function kzRichtungInfo(k) { return KZ_RICHTUNG.find(x => x.key === k) || KZ_RICHTUNG[0]; }
function kzStatusInfo(k) { return KZ_STATUS.find(x => x.key === k) || KZ_STATUS[1]; }
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

/** Zahl aus einer Eingabe: „95", „95,5", „1.250,5" → Zahl, sonst null (wie pzZahl). */
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
  if (z === null) return String(n);
  return z.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function kzNormal(k) {
  const x = k || {};
  const werte = (Array.isArray(x.werte) ? x.werte : []).map(w => ({
    datum: _kzTag(w && w.datum), wert: kzZahl(w && w.wert), kommentar: _kzText(w && w.kommentar), von: _kzText(w && w.von),
    ...(w && w.automatik ? { automatik: true } : {}),
  })).filter(w => w.datum && w.wert !== null).sort((a, b) => a.datum.localeCompare(b.datum));
  return {
    id: x.id ? String(x.id) : null,
    nr: _kzText(x.nr), name: _kzText(x.name), beschreibung: _kzText(x.beschreibung),
    bereich: _kzText(x.bereich) || 'isms', einheit: _kzText(x.einheit),
    richtung: KZ_RICHTUNG.some(r => r.key === x.richtung) ? x.richtung : 'hoch',
    ziel: _kzText(x.ziel), intervall: kzIntervallInfo(x.intervall) ? x.intervall : '',
    datenquelle: _kzText(x.datenquelle), methode: _kzText(x.methode), verantwortlich: _kzText(x.verantwortlich),
    verwendung: _kzText(x.verwendung), automatik: kzAutomatikInfo(x.automatik) ? x.automatik : '',
    werke: Array.isArray(x.werke) ? x.werke.map(_kzText).filter(Boolean) : [],
    status: KZ_STATUS.some(s => s.key === x.status) ? x.status : 'aktiv',
    werte, historie: Array.isArray(x.historie) ? x.historie : [],
  };
}

/** Nächste Nummer: K-01, K-02 … */
function kzNaechsteNr(liste) {
  const max = (liste || []).reduce((n, k) => { const t = /^K-(\d+)$/.exec(_kzText(k && k.nr)); return t ? Math.max(n, Number(t[1])) : n; }, 0);
  return 'K-' + String(max + 1).padStart(2, '0');
}

/** Der jüngste Messwert oder null. */
function kzLetzter(k) {
  const w = kzNormal(k).werte;
  return w.length ? w[w.length - 1] : null;
}

/** 'erfuellt' · 'verfehlt' · 'offen' (kein Sollwert oder kein Wert). */
function kzBewertung(k, wert) {
  const x = kzNormal(k);
  const ziel = kzZahl(x.ziel);
  const ist = (wert === undefined) ? (kzLetzter(x) || {}).wert : kzZahl(wert);
  if (ziel === null || ist === null || ist === undefined) return 'offen';
  return (x.richtung === 'niedrig' ? ist <= ziel : ist >= ziel) ? 'erfuellt' : 'verfehlt';
}

/** Trend der letzten beiden Werte, gemessen an der Richtung: 'besser' · 'schlechter' · 'gleich' · ''. */
function kzTrend(k) {
  const x = kzNormal(k);
  const w = x.werte;
  if (w.length < 2) return '';
  const a = w[w.length - 2].wert, b = w[w.length - 1].wert;
  if (a === b) return 'gleich';
  const hoeher = b > a;
  return (x.richtung === 'niedrig' ? !hoeher : hoeher) ? 'besser' : 'schlechter';
}

/**
 * Wann ist die nächste Messung fällig? Letzter Wert plus Intervall; ohne Wert
 * sofort. Nur für aktive Kennzahlen mit Intervall.
 * → { faellig, datum, tage } (tage negativ = überfällig) oder null
 */
function kzNaechsteMessung(k, heute) {
  const x = kzNormal(k);
  const iv = kzIntervallInfo(x.intervall);
  if (!iv || x.status !== 'aktiv') return null;
  const h = heute || kzHeute();
  const letzter = x.werte.length ? x.werte[x.werte.length - 1].datum : '';
  if (!letzter) return { faellig: true, datum: '', tage: 0 };
  const d = new Date(letzter + 'T00:00:00Z');
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + iv.monate);
  const letzterImMonat = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzterImMonat));
  const datum = d.toISOString().slice(0, 10);
  const tage = Math.round((Date.parse(datum + 'T00:00:00Z') - Date.parse(h + 'T00:00:00Z')) / 86400000);
  return { faellig: tage <= 0, datum, tage };
}

/** Was einer Kennzahl fehlt, damit sie 9.1 genügt: was, wie, wann, wer, und ob gemessen wird. */
function kzLuecken(k, heute) {
  const x = kzNormal(k);
  const f = [];
  if (!x.name) f.push('Bezeichnung fehlt.');
  if (x.status === 'stillgelegt') return f;
  if (kzZahl(x.ziel) === null) f.push('Kein Sollwert: Ohne ihn lässt sich nichts bewerten.');
  if (!x.verantwortlich) f.push('Niemand ist für die Messung verantwortlich.');
  if (!x.intervall) f.push('Kein Erhebungsintervall.');
  if (!x.methode && !x.datenquelle && !x.automatik) f.push('Weder Methode noch Datenquelle festgelegt.');
  const n = kzNaechsteMessung(x, heute);
  if (n && n.faellig && x.werte.length) f.push(`Messung fällig seit ${n.datum.split('-').reverse().join('.')}.`);
  if (n && n.faellig && !x.werte.length) f.push('Noch kein Messwert erfasst.');
  return f;
}

/** Kennzahlen über das Register. */
function kzKennzahlen(liste, heute) {
  const l = (liste || []).map(kzNormal).filter(k => k.status !== 'stillgelegt');
  const bew = l.map(k => kzBewertung(k));
  return {
    gesamt: l.length,
    erfuellt: bew.filter(b => b === 'erfuellt').length,
    verfehlt: bew.filter(b => b === 'verfehlt').length,
    offen: bew.filter(b => b === 'offen').length,
    messungFaellig: l.filter(k => { const n = kzNaechsteMessung(k, heute); return n && n.faellig; }).length,
    ohneSoll: l.filter(k => kzZahl(k.ziel) === null).length,
    mitLuecken: l.filter(k => kzLuecken(k, heute).length).length,
  };
}

/** „Kenntnisnahme-Quote ≥ 90 %" */
function kzSollText(k) {
  const x = kzNormal(k);
  if (!x.ziel) return '';
  return `${kzRichtungInfo(x.richtung).zeichen} ${x.ziel}${x.einheit ? ' ' + x.einheit : ''}`;
}

/** Die Kennzahlen der Prozesse aus pzEintraege(): eine Zeile je Kennzahl. */
function kzAusProzessen(eintraege) {
  const out = [];
  (eintraege || []).forEach(e => ((e.kennzahlen && e.kennzahlen.liste) || []).forEach(k => out.push({
    name: k.name, einheit: k.einheit || '', richtung: k.richtung || 'hoch', ziel: k.ziel || '', ist: k.ist || '', stand: k.stand || '',
    prozess: (e.kachel && e.kachel.name) || '', werk: e.werk || '', art: e.art, kachelId: (e.kachel && e.kachel.id) || '',
    geerbt: !!(e.kennzahlen && e.kennzahlen.geerbt),
    bewertung: kzBewertung({ ziel: k.ziel, richtung: k.richtung, werte: [] }, k.ist === '' ? null : k.ist),
  })));
  return out.sort((a, b) => a.werk.localeCompare(b.werk) || a.prozess.localeCompare(b.prozess, 'de') || a.name.localeCompare(b.name, 'de'));
}

/**
 * Verlauf als kleine Linie (SVG-Pfad). Die Sollwert-Linie liefert `soll`
 * mit, wenn es einen gibt. → { pfad, soll, punkte } in einem breite × hoehe-Feld
 */
function kzVerlauf(k, breite, hoehe) {
  const x = kzNormal(k);
  const w = x.werte.slice(-12);
  const b = breite || 120, h = hoehe || 28;
  if (!w.length) return { pfad: '', soll: null, punkte: [] };
  const ziel = kzZahl(x.ziel);
  const zahlen = w.map(v => v.wert).concat(ziel === null ? [] : [ziel]);
  let min = Math.min(...zahlen), max = Math.max(...zahlen);
  if (min === max) { min -= 1; max += 1; }
  const px = (i) => (w.length === 1 ? b / 2 : (i / (w.length - 1)) * (b - 4) + 2);
  const py = (v) => h - 2 - ((v - min) / (max - min)) * (h - 4);
  const punkte = w.map((v, i) => ({ x: Math.round(px(i) * 10) / 10, y: Math.round(py(v.wert) * 10) / 10 }));
  return {
    pfad: punkte.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' '),
    soll: ziel === null ? null : Math.round(py(ziel) * 10) / 10,
    punkte,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KZ_INTERVALLE, KZ_RICHTUNG, KZ_STATUS, KZ_AUTOMATIK,
    kzIntervallInfo, kzRichtungInfo, kzStatusInfo, kzAutomatikInfo, kzAutomatikWert,
    kzHeute, kzZahl, kzZahlText, kzNormal, kzNaechsteNr, kzLetzter, kzBewertung, kzTrend, kzNaechsteMessung,
    kzLuecken, kzKennzahlen, kzSollText, kzAusProzessen, kzVerlauf,
  };
}
