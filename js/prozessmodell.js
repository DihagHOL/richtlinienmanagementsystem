'use strict';

/**
 * Prozessmanagement – das Modell
 * ==============================
 * Die Landkarte kennt jeden Prozess, die Matrix sagt, wer ihn im Werk
 * verantwortet. Was fehlte, ist der Weg dazwischen: In welchem Stand ist ein
 * Prozess, wer verantwortet ihn konzernweit, soll er in allen Werken gleich
 * laufen, und wann wird er wieder überprüft? Ohne diese vier Angaben gibt es
 * Werkzeuge, aber keinen Prozess, der sie benutzt (Konzernfachregelung
 * Prozessmanagement).
 *
 * Gespeichert wird an der Kachel selbst, in prozesslandkarte.json:
 *
 *   status                 Lebenszyklus: IST · SOLL · POC · freigegeben · ausgerollt
 *   prozesseigner          verantwortet den Prozess konzernweit (E-Mail)
 *   standardisierung       gruppeneinheitlich · einheitlicher Rahmen · werksspezifisch
 *   prioritaet             hoch · mittel · niedrig
 *   naechsteUeberpruefung  JJJJ-MM-TT
 *
 * **Eine Wahrheit für den Konzernprozess.** Eigner und Standardisierungsgrad
 * gehören zum Konzernprozess, nicht zur einzelnen Werkkachel. Bleiben sie an
 * einer Werkkachel leer, gilt der Eintrag der gleichnamigen Kachel auf der
 * Konzern-Landkarte – derselbe Abgleich über den Namen wie in der Matrix.
 * Status, Priorität und Überprüfung bleiben je Werk: Ein Prozess ist in einem
 * Werk ausgerollt und im nächsten noch im POC.
 *
 * Diese Datei kennt weder DOM noch SharePoint. Sie rechnet auf dem
 * Datenobjekt der Landkarte – deshalb kann „Fälligkeiten" sie laden, ohne die
 * Landkarte mitzunehmen, und deshalb ist sie ohne Browser prüfbar.
 */

/* ── Lebenszyklus: in der Reihenfolge, in der ein Prozess ihn durchläuft ── */
const PZ_STATUS = [
  { key: 'ist',         label: 'IST erfasst',    kurz: 'IST',  farbe: '#64748b',
    text: 'Der Prozess steht in der Landkarte. Ein SOLL ist noch nicht begonnen.' },
  { key: 'soll',        label: 'SOLL in Arbeit', kurz: 'SOLL', farbe: '#0284C7',
    text: 'Prozesseigner und Fachabteilung modellieren den Zielprozess nach dem Hausschema.' },
  { key: 'poc',         label: 'POC läuft',      kurz: 'POC',  farbe: '#F08300',
    text: 'Der SOLL-Prozess wird in einem Werk erprobt. Die Erfolgskriterien stehen vorher fest.' },
  { key: 'freigegeben', label: 'Freigegeben',    kurz: 'frei', farbe: '#17509E',
    text: 'Nach dem POC freigegeben. Modell und Regelwerke sind veröffentlicht, der Rollout läuft.' },
  { key: 'ausgerollt',  label: 'Ausgerollt',     kurz: 'live', farbe: '#15803d',
    text: 'Der Prozess läuft in allen vorgesehenen Werken und wird regelmäßig überprüft.' },
];

/* ── Standardisierungsgrad: entscheidet das Prozess-Board je Konzernprozess ── */
const PZ_STANDARD = [
  { key: 'einheitlich', label: 'gruppeneinheitlich',   kurz: 'einheitlich',
    text: 'Läuft in allen Werken gleich. Abweichungen nur mit Beschluss des Prozess-Boards.' },
  { key: 'rahmen',      label: 'einheitlicher Rahmen', kurz: 'Rahmen',
    text: 'Ziel, Schnittstellen und Kennzahlen sind gleich. Der Ablauf im Werk darf abweichen.' },
  { key: 'lokal',       label: 'werksspezifisch',      kurz: 'lokal',
    text: 'Jedes Werk regelt den Prozess selbst.' },
];

const PZ_PRIO = [
  { key: 'hoch',    label: 'hoch',    rang: 1, farbe: '#b91c1c' },
  { key: 'mittel',  label: 'mittel',  rang: 2, farbe: '#b45309' },
  { key: 'niedrig', label: 'niedrig', rang: 3, farbe: '#64748b' },
];

/** Spätester Abstand zur nächsten Überprüfung eines freigegebenen Prozesses. */
const PZ_UEBERPRUEFUNG_MONATE = 12;
/** „Bald fällig" – dasselbe Fenster wie bei den Regelwerken. */
const PZ_BALD_TAGE = 30;

function pzStatus(k) {
  const s = k && k.status;
  return PZ_STATUS.some(x => x.key === s) ? s : 'ist';   // was in der Karte steht, ist erfasst
}
function pzStatusInfo(key) { return PZ_STATUS.find(x => x.key === key) || PZ_STATUS[0]; }
function pzStandardInfo(key) { return PZ_STANDARD.find(x => x.key === key) || null; }
function pzPrioInfo(key) { return PZ_PRIO.find(x => x.key === key) || null; }

/** Vergleichsschlüssel: derselbe wie in der Matrix – verglichen wird der Name. */
function pzSchluessel(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Eine Kategorie-Kachel ist kein Ablauf – sie hat keinen Lebenszyklus. */
function pzIstAblauf(k) { return !!k && k.typ !== 'kategorie'; }

function pzNrText(k) {
  return (k && Number.isInteger(k.nr) && k.nr > 0) ? 'P-' + String(k.nr).padStart(3, '0') : '';
}

/** Die gleichnamige Kachel auf der Konzern-Landkarte (null auf der Konzernkarte selbst). */
function pzKonzernKachel(daten, werk, k) {
  if (!k || werk === 'KONZERN') return null;
  const karte = daten && daten.karten && daten.karten.KONZERN;
  const liste = (karte && Array.isArray(karte.kacheln)) ? karte.kacheln : [];
  const s = pzSchluessel(k.name);
  return s ? (liste.find(x => pzSchluessel(x.name) === s) || null) : null;
}

/**
 * Prozesseigner: der eigene Eintrag, sonst der der Konzernkachel.
 * Auf der Konzern-Landkarte verantwortet die verantwortliche Person den
 * Prozess konzernweit – dort ist sie ohne eigenen Eintrag zugleich Eigner.
 * → { upn, geerbt }
 */
function pzEigner(daten, werk, k) {
  const eigen = String((k && k.prozesseigner) || '').trim();
  if (eigen) return { upn: eigen, geerbt: false };
  if (werk === 'KONZERN') {
    const v = String((k && k.verantwortlich) || '').trim();
    return { upn: v, geerbt: false };
  }
  const kk = pzKonzernKachel(daten, werk, k);
  const von = kk ? (String(kk.prozesseigner || '').trim() || String(kk.verantwortlich || '').trim()) : '';
  return { upn: von, geerbt: !!von };
}

/** Standardisierungsgrad: eigener Eintrag, sonst der der Konzernkachel. → { key, geerbt } */
function pzStandard(daten, werk, k) {
  if (k && pzStandardInfo(k.standardisierung)) return { key: k.standardisierung, geerbt: false };
  const kk = pzKonzernKachel(daten, werk, k);
  if (kk && pzStandardInfo(kk.standardisierung)) return { key: kk.standardisierung, geerbt: true };
  return { key: '', geerbt: false };
}

/* ── Überprüfung ─────────────────────────────────────────────────────── */

function _pzTag(d) {
  const x = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
  return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
}

/** Tage bis zum Termin (negativ = überfällig) oder null ohne gültigen Termin. */
function pzTageBis(datum, heute) {
  const s = String(datum || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const [j, m, t] = s.slice(0, 10).split('-').map(Number);
  const ziel = Date.UTC(j, m - 1, t);
  if (isNaN(ziel)) return null;
  return Math.round((ziel - _pzTag(heute || new Date())) / 86400000);
}

/** Stand der Überprüfung: { datum, tage, stufe } – stufe: ueberfaellig · bald · spaeter · fehlt · '' */
function pzUeberpruefung(k, heute) {
  const datum = String((k && k.naechsteUeberpruefung) || '').slice(0, 10);
  const tage = pzTageBis(datum, heute);
  let stufe = '';
  if (tage === null) {
    // Ohne Termin ist es erst dann eine Lücke, wenn der Prozess freigegeben ist.
    stufe = ['freigegeben', 'ausgerollt'].includes(pzStatus(k)) ? 'fehlt' : '';
  } else if (tage < 0) stufe = 'ueberfaellig';
  else if (tage <= PZ_BALD_TAGE) stufe = 'bald';
  else stufe = 'spaeter';
  return { datum: tage === null ? '' : datum, tage, stufe };
}

/** Vorschlag für den nächsten Termin: heute + Monate, als JJJJ-MM-TT. */
function pzTerminVorschlag(heute, monate) {
  const d = (heute instanceof Date) ? new Date(heute.getTime()) : (heute ? new Date(heute) : new Date());
  d.setMonth(d.getMonth() + (monate || PZ_UEBERPRUEFUNG_MONATE));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Status setzen. Wer einen Prozess freigibt oder ausrollt, legt damit auch die
 * Überprüfung fest – ohne Termin wird sie vergessen. Fehlt einer, wird er auf
 * heute + 12 Monate gesetzt.
 * → Beschreibung für den Versionsverlauf ('' = keine Änderung)
 */
function pzStatusSetzen(k, neu, heute) {
  if (!k || !PZ_STATUS.some(x => x.key === neu)) return '';
  const alt = pzStatus(k);
  if (alt === neu && k.status === neu) return '';
  k.status = neu;
  let text = `Status: ${pzStatusInfo(alt).label} → ${pzStatusInfo(neu).label}`;
  if (['freigegeben', 'ausgerollt'].includes(neu) && pzTageBis(k.naechsteUeberpruefung, heute) === null) {
    k.naechsteUeberpruefung = pzTerminVorschlag(heute);
    text += `; Überprüfung bis ${k.naechsteUeberpruefung}`;
  }
  return text;
}

/* ── Backlog: alle Abläufe aller Karten ──────────────────────────────── */

/**
 * Jede Kachel als Eintrag mit allem, was das Backlog braucht.
 * `werke` begrenzt auf die sichtbaren Karten (Trennung nach Gesellschaft).
 */
function pzEintraege(daten, werke, heute) {
  const karten = (daten && daten.karten) || {};
  const out = [];
  Object.keys(karten).filter(w => !werke || werke.includes(w)).forEach(werk => {
    const liste = Array.isArray(karten[werk].kacheln) ? karten[werk].kacheln : [];
    liste.filter(pzIstAblauf).forEach(k => out.push({
      werk, kachel: k,
      status: pzStatus(k),
      eigner: pzEigner(daten, werk, k),
      standard: pzStandard(daten, werk, k),
      prio: pzPrioInfo(k.prioritaet) ? k.prioritaet : '',
      pruefung: pzUeberpruefung(k, heute),
    }));
  });
  return out;
}

/** Reihenfolge in einer Spalte: Priorität, dann Fälligkeit, dann Name. */
function pzSortieren(a, b) {
  const r = (e) => (pzPrioInfo(e.prio) || { rang: 9 }).rang;
  if (r(a) !== r(b)) return r(a) - r(b);
  const t = (e) => (e.pruefung.tage === null ? 99999 : e.pruefung.tage);
  if (t(a) !== t(b)) return t(a) - t(b);
  return String(a.kachel.name || '').localeCompare(String(b.kachel.name || ''), 'de');
}

/** Einträge je Status, sortiert. → { ist: [...], soll: [...], ... } */
function pzSpalten(eintraege) {
  const sp = {};
  PZ_STATUS.forEach(s => { sp[s.key] = []; });
  eintraege.forEach(e => sp[e.status].push(e));
  Object.values(sp).forEach(l => l.sort(pzSortieren));
  return sp;
}

/** Kennzahlen für die Kopfzeile des Backlogs. */
function pzKennzahlen(eintraege) {
  const n = eintraege.length;
  const zaehl = (f) => eintraege.filter(f).length;
  return {
    gesamt: n,
    mitEigner: zaehl(e => e.eigner.upn),
    standardEntschieden: zaehl(e => e.standard.key),
    priorisiert: zaehl(e => e.prio),
    inArbeit: zaehl(e => ['soll', 'poc', 'freigegeben'].includes(e.status)),
    ausgerollt: zaehl(e => e.status === 'ausgerollt'),
    ueberfaellig: zaehl(e => e.pruefung.stufe === 'ueberfaellig'),
    ohneTermin: zaehl(e => e.pruefung.stufe === 'fehlt'),
  };
}

/**
 * Für „Fälligkeiten": Prozesse mit Termin oder mit fehlendem Pflichttermin,
 * gruppiert wie bei den Regelwerken.
 */
function pzFaellige(daten, werke, heute) {
  const b = { ueberfaellig: [], bald: [], spaeter: [], fehlt: [] };
  pzEintraege(daten, werke, heute).forEach(e => { if (b[e.pruefung.stufe]) b[e.pruefung.stufe].push(e); });
  const nachTagen = (a, c) => (a.pruefung.tage - c.pruefung.tage) || String(a.kachel.name).localeCompare(String(c.kachel.name), 'de');
  b.ueberfaellig.sort(nachTagen); b.bald.sort(nachTagen); b.spaeter.sort(nachTagen);
  b.fehlt.sort((a, c) => String(a.kachel.name).localeCompare(String(c.kachel.name), 'de'));
  return b;
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PZ_STATUS, PZ_STANDARD, PZ_PRIO, PZ_UEBERPRUEFUNG_MONATE, PZ_BALD_TAGE,
    pzStatus, pzStatusInfo, pzStandardInfo, pzPrioInfo, pzSchluessel, pzIstAblauf, pzNrText,
    pzKonzernKachel, pzEigner, pzStandard, pzTageBis, pzUeberpruefung, pzTerminVorschlag,
    pzStatusSetzen, pzEintraege, pzSortieren, pzSpalten, pzKennzahlen, pzFaellige,
  };
}
