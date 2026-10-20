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
 *   status                 Phase im Lebenszyklus: identifiziert · aufnahme · analyse · soll · poc · freigegeben · ausgerollt
 *   prozesseigner          verantwortet den Prozess konzernweit (E-Mail)
 *   standardisierung       gruppeneinheitlich · einheitlicher Rahmen · werksspezifisch
 *   prioritaet             hoch · mittel · niedrig
 *   naechsteUeberpruefung  JJJJ-MM-TT
 *   reifegrad              '0' … '5', Fähigkeitsstufe nach ISO/IEC 33020
 *   kennzahlen             [{ name, einheit, richtung, ziel, ist, stand }] (ISO 9001 4.4 c)
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

/* ── Lebenszyklus: die Phasen des BPM-Lebenszyklus nach Dumas, La Rosa,
   Mendling und Reijers (Fundamentals of Business Process Management, 2. Aufl.
   2018): Identifikation, Aufnahme (discovery), Analyse, Redesign (SOLL),
   Umsetzung (implementation, hier POC und Rollout) und Betrieb (monitoring and
   controlling). Aus dem Betrieb geht es bei Abweichungen zurück in die Analyse.

   Das Backlog-Element ist der Prozess, nicht das Modell: eine Kachel ohne
   Modell oder ein Hauptprozess. Unter- und Nebenprozesse und die IST-Modelle,
   die er ablöst, hängen an seiner Karte (pzKarten). „eol" ist deshalb keine
   Phase, sondern die Art eines Modells: die IST-Aufnahme eines Ablaufs, den ein
   anderer Prozess ablöst. Sie kann noch in Benutzung sein, etwa in Werken, die
   noch nicht umgestellt sind; außer Betrieb ist sie erst mit abgeloestAm.

   „ist" ist der alte Schlüssel für „IST erfasst": an einer Kachel hieß das
   „steht in der Landkarte" (heute identifiziert), an einem Modell „Ablauf
   aufgenommen" (heute aufnahme). Beides wird beim Lesen umgedeutet. */
const PZ_STATUS = [
  { key: 'identifiziert', label: 'Identifiziert', kurz: 'neu', farbe: '#94a3b8',
    text: 'Der Prozess steht in der Landkarte. Prozesseigner und Priorität entscheiden, ob und wann er aufgenommen wird.' },
  { key: 'aufnahme',    label: 'IST-Aufnahme', kurz: 'IST', farbe: '#64748b',
    text: 'Der Ablauf wird so aufgenommen, wie er heute läuft: als IST-Modell, bei Varianten je eines.' },
  { key: 'analyse',     label: 'Analyse', kurz: 'Analyse', farbe: '#7c3aed',
    text: 'Die Schwachstellen des IST werden bewertet: was kostet Zeit, verursacht Fehler oder birgt Risiko, und warum.' },
  { key: 'soll',        label: 'SOLL-Design', kurz: 'SOLL', farbe: '#0284C7',
    text: 'Prozesseigner und Fachabteilung modellieren den Zielprozess nach dem Hausschema, mit Regelwerk und Freigeber.' },
  { key: 'poc',         label: 'Umsetzung: POC läuft', kurz: 'POC', farbe: '#F08300', phase: 'umsetzung',
    text: 'Das SOLL wird erprobt. Pilotwerk, Zeitraum und Erfolgskriterien stehen vorher fest (✎ Angaben).' },
  { key: 'freigegeben', label: 'Umsetzung: freigegeben, Rollout', kurz: 'Rollout', farbe: '#17509E', phase: 'umsetzung',
    text: 'Nach dem POC freigegeben. Modell und Regelwerk sind veröffentlicht, der Rollout in die Werke läuft. Er ist abgeschlossen, wenn kein abgelöstes IST mehr in Benutzung ist.' },
  { key: 'ausgerollt',  label: 'Betrieb', kurz: 'Betrieb', farbe: '#15803d',
    text: 'Der Prozess läuft in allen vorgesehenen Werken. Kennzahlen und Review zeigen, ob er hält, was er soll; bei Abweichung geht es zurück in die Analyse.' },
  { key: 'eol',         label: 'IST-Modell eines anderen Prozesses (EOL)', kurz: 'EOL', farbe: '#9F1239', anhang: true,
    text: 'IST-Aufnahme eines Ablaufs, den ein anderer Prozess ablöst. Sie hängt an dessen Karte und bleibt in Benutzung, bis sie außer Betrieb genommen ist.' },
];
/** Die Phasen, die ein Prozess haben kann (EOL ist die Art eines Modells). */
const PZ_PHASEN = PZ_STATUS.filter(s => !s.anhang);
/** Die Spalten des Backlogs. Die Umsetzung fasst POC und Rollout zusammen. */
const PZ_SPALTEN = [
  { key: 'identifiziert' }, { key: 'aufnahme' }, { key: 'analyse' }, { key: 'soll' },
  { key: 'umsetzung', label: 'Umsetzung', kurz: 'Umsetzung', farbe: '#F08300',
    text: 'POC, Freigabe und Rollout: Das SOLL wird erprobt, freigegeben und in die Werke gebracht.' },
  { key: 'ausgerollt' },
].map(s => Object.assign({}, PZ_STATUS.find(x => x.key === s.key) || {}, s));
/** Stufen, in denen ein Prozess einen IST-Prozess ablösen kann. */
const PZ_NACHFOLGER_STUFEN = ['soll', 'poc', 'freigegeben', 'ausgerollt'];

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

/* ── Reifegrad: die Fähigkeitsstufen nach ISO/IEC 33020 ──────────────
   Bewertet wird je Werk, wie der Status: Ein Prozess kann im Konzern
   etabliert sein und im neuen Werk erst durchgeführt werden. Deshalb erbt
   eine Werkkachel den Reifegrad nicht von der Konzernkachel. */
const PZ_REIFEGRAD = [
  { key: '0', label: '0 unvollständig', kurz: 'RG 0',
    text: 'Der Prozess wird nicht oder nur lückenhaft durchgeführt. Sein Zweck wird nicht sicher erreicht.' },
  { key: '1', label: '1 durchgeführt',  kurz: 'RG 1',
    text: 'Der Prozess erreicht seinen Zweck, hängt aber an einzelnen Personen. Planung und Steuerung fehlen.' },
  { key: '2', label: '2 gesteuert',     kurz: 'RG 2',
    text: 'Die Durchführung wird geplant, überwacht und bei Bedarf angepasst. Arbeitsergebnisse werden geprüft.' },
  { key: '3', label: '3 etabliert',     kurz: 'RG 3',
    text: 'Ein festgelegter Standardprozess (Modell, Rollen, Regelwerke) wird so angewendet, wie er beschrieben ist.' },
  { key: '4', label: '4 vorhersagbar',  kurz: 'RG 4',
    text: 'Der Prozess wird über Kennzahlen gesteuert. Abweichungen werden erkannt und ihre Ursachen analysiert.' },
  { key: '5', label: '5 innovierend',   kurz: 'RG 5',
    text: 'Der Prozess wird anhand seiner Kennzahlen laufend verbessert. Änderungen werden erprobt und gezielt eingeführt.' },
];
/** Mindeststufe für einen ausgerollten, gruppeneinheitlichen Prozess (Konzernfachregelung). */
const PZ_REIFEGRAD_ZIEL = '3';

/* ── Kennzahlen: ISO 9001 Abschnitt 4.4 c verlangt je Prozess Kriterien und
   Leistungsindikatoren. Eine Kennzahl hat ein Ziel und eine Richtung
   („mindestens" 95 % Liefertreue, „höchstens" 5 Tage Durchlaufzeit) und den
   zuletzt gemessenen Wert mit Stand. */
const PZ_RICHTUNG = [
  { key: 'hoch',    label: 'mindestens', zeichen: '≥' },
  { key: 'niedrig', label: 'höchstens',  zeichen: '≤' },
];

/** Spätester Abstand zur nächsten Überprüfung eines freigegebenen Prozesses. */
const PZ_UEBERPRUEFUNG_MONATE = 12;
/** „Bald fällig" – dasselbe Fenster wie bei den Regelwerken. */
const PZ_BALD_TAGE = 30;
/** Ab diesen Stufen braucht ein Prozess einen Review-Termin (POC: die Bewertung des Pilots). */
const PZ_REVIEW_PFLICHT = ['poc', 'freigegeben', 'ausgerollt'];

/** Die Phase einer Kachel. Ohne Angabe, mit dem alten „ist" oder mit EOL (gibt es nur an Modellen): identifiziert. */
function pzStatus(k) {
  const s = k && k.status;
  return PZ_PHASEN.some(x => x.key === s) ? s : 'identifiziert';
}
/** Die Angaben zu einer Phase; das alte „ist" eines Modells ist die IST-Aufnahme. */
function pzStatusInfo(key) {
  const k = key === 'ist' ? 'aufnahme' : key;
  return PZ_STATUS.find(x => x.key === k) || PZ_STATUS[0];
}
/** Die Spalte einer Phase: POC und Rollout stehen in der Umsetzung, ein loses IST-Modell in der IST-Aufnahme. */
function pzPhase(key) { const s = pzStatusInfo(key); return s.anhang ? 'aufnahme' : (s.phase || s.key); }
/** Die Phase davor und danach (Reihenfolge von PZ_PHASEN). */
function pzNaechstePhase(key) {
  const i = PZ_PHASEN.findIndex(x => x.key === pzStatusInfo(key).key);
  return i >= 0 && i < PZ_PHASEN.length - 1 ? PZ_PHASEN[i + 1].key : '';
}
function pzStandardInfo(key) { return PZ_STANDARD.find(x => x.key === key) || null; }
function pzPrioInfo(key) { return PZ_PRIO.find(x => x.key === key) || null; }
function pzReifegradInfo(key) { return PZ_REIFEGRAD.find(x => x.key === String(key == null ? '' : key)) || null; }
function pzRichtungInfo(key) { return PZ_RICHTUNG.find(x => x.key === key) || PZ_RICHTUNG[0]; }

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

/** Reifegrad der Kachel. Nur der eigene Eintrag – siehe PZ_REIFEGRAD. → { key, geerbt } */
function pzReifegrad(k) {
  const key = String((k && k.reifegrad) == null ? '' : k.reifegrad);
  return { key: pzReifegradInfo(key) ? key : '', geerbt: false };
}

/* ── Kennzahlen ──────────────────────────────────────────────────────── */

/** Zahl aus einer Eingabe: „95", „95,5", „1.250,5" → Zahl, sonst null. */
function pzZahl(s) {
  let t = String(s == null ? '' : s).replace(/\s/g, '').replace(/[%€]/g, '');
  if (!t) return null;
  // Deutsch geschrieben: Komma trennt Dezimalen, Punkte gliedern Tausender.
  if (t.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.split('.').join('').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Kennzahlen bereinigen: ohne Namen keine Kennzahl, ungültige Werte fallen raus. */
function pzKpiNormal(liste) {
  return (Array.isArray(liste) ? liste : []).map(x => {
    const k = x || {};
    const stand = String(k.stand || '').trim().slice(0, 10);
    return {
      name: _pzFeld(k.name),
      einheit: _pzFeld(k.einheit),
      richtung: PZ_RICHTUNG.some(r => r.key === k.richtung) ? k.richtung : 'hoch',
      ziel: _pzFeld(k.ziel),
      ist: _pzFeld(k.ist),
      stand: pzTageBis(stand) === null ? '' : stand,
    };
  }).filter(k => k.name);
}

/** Erfüllt? → 'erfuellt' · 'verfehlt' · 'offen' (Ziel oder Ist fehlt). */
function pzKpiBewertung(k) {
  const ziel = pzZahl(k && k.ziel), ist = pzZahl(k && k.ist);
  if (ziel === null || ist === null) return 'offen';
  const gut = (k.richtung === 'niedrig') ? ist <= ziel : ist >= ziel;
  return gut ? 'erfuellt' : 'verfehlt';
}

/** Zusammenfassung einer Liste: { gesamt, erfuellt, verfehlt, offen }. */
function pzKpiStand(liste) {
  const s = { gesamt: 0, erfuellt: 0, verfehlt: 0, offen: 0 };
  (liste || []).forEach(k => { s.gesamt++; s[pzKpiBewertung(k)]++; });
  return s;
}

/** „Liefertreue ≥ 95 %, Ist 93 % (Stand 30.09.2026)" */
function pzKpiText(k) {
  const r = pzRichtungInfo(k.richtung);
  const e = k.einheit ? ' ' + k.einheit : '';
  let t = k.name;
  if (k.ziel) t += ` ${r.zeichen} ${k.ziel}${e}`;
  if (k.ist) t += `, Ist ${k.ist}${e}`;
  if (k.stand) t += ` (Stand ${k.stand.split('-').reverse().join('.')})`;
  return t;
}

/**
 * Kennzahlen einer Kachel: die eigenen, sonst die der gleichnamigen
 * Konzernkachel als Vorgabe – aber ohne deren Messwerte, denn gemessen wird
 * im Werk. Ein werksspezifischer Prozess legt seine Kennzahlen selbst fest.
 * → { liste, geerbt }
 */
function pzKennzahlenVon(daten, werk, k) {
  const eigen = pzKpiNormal(k && k.kennzahlen);
  if (eigen.length) return { liste: eigen, geerbt: false };
  if (pzStandard(daten, werk, k).key === 'lokal') return { liste: [], geerbt: false };
  return _pzKpiVorgabe(pzKonzernKachel(daten, werk, k));
}

/** Die Kennzahlen einer Konzernkachel als Vorgabe: Ziel ja, Messwerte nein. */
function _pzKpiVorgabe(kk) {
  const liste = pzKpiNormal(kk && kk.kennzahlen).map(x => Object.assign(x, { ist: '', stand: '' }));
  return { liste, geerbt: liste.length > 0 };
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
  const st = k && k.status;
  if (st === 'eol') {
    // Ein IST-Modell, das ein anderer Prozess ablöst, wird nicht mehr überprüft.
    stufe = '';
  } else if (tage === null) {
    // Ohne Termin ist es eine Lücke, sobald es etwas zu bewerten gibt: der POC
    // (sein Ergebnis gegen die Erfolgskriterien) und der freigegebene Prozess.
    stufe = PZ_REVIEW_PFLICHT.includes(pzStatusInfo(st).key) ? 'fehlt' : '';
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
  if (!k || !PZ_PHASEN.some(x => x.key === neu)) return '';
  const alt = pzStatus(k);
  if (alt === neu && k.status === neu) return '';
  k.status = neu;
  let text = `Phase: ${pzStatusInfo(alt).label} → ${pzStatusInfo(neu).label}`;
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
 *
 * Mit `modelle` kommen die BPMN-Modelle dazu (siehe pzModellEintraege). Eine
 * Kachel, an der ein Modell hängt, steht dann nicht mehr für sich da: Der
 * Prozess ist das Modell, die Kachel ordnet es nur in die Landschaft ein.
 */
function pzEintraege(daten, werke, heute, modelle) {
  const karten = (daten && daten.karten) || {};
  const out = [];
  const mitModell = new Set();
  (modelle || []).forEach(m => (m.kacheln || []).forEach(x => mitModell.add(x.werk + ':' + x.kachel.id)));
  Object.keys(karten).filter(w => !werke || werke.includes(w)).forEach(werk => {
    const liste = Array.isArray(karten[werk].kacheln) ? karten[werk].kacheln : [];
    liste.filter(pzIstAblauf).filter(k => !mitModell.has(werk + ':' + k.id)).forEach(k => out.push({
      art: 'kachel', werk, kachel: k,
      status: pzStatus(k),
      eigner: pzEigner(daten, werk, k),
      standard: pzStandard(daten, werk, k),
      prio: pzPrioInfo(k.prioritaet) ? k.prioritaet : '',
      pruefung: pzUeberpruefung(k, heute),
      reifegrad: pzReifegrad(k),
      kennzahlen: pzKennzahlenVon(daten, werk, k),
    }));
  });
  // Modelle ohne Ablage gehören noch niemandem – sie bleiben sichtbar, damit
  // sie einsortiert werden (wie in der Modell-Liste). Gerechnet wird über alle
  // Modelle: Der Hauptprozess eines Unterprozesses kann in einer anderen Ablage liegen.
  if (modelle) out.push(...pzModellEintraege(daten, modelle, heute).filter(e => !werke || !e.werk || werke.includes(e.werk)));
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

/** Einträge oder Karten je Spalte, sortiert. → { identifiziert: [...], aufnahme: [...], ..., umsetzung: [...], ausgerollt: [...] } */
function pzSpalten(eintraege) {
  const sp = {};
  PZ_SPALTEN.forEach(s => { sp[s.key] = []; });
  eintraege.forEach(e => sp[pzPhase(e.status)].push(e));
  Object.values(sp).forEach(l => l.sort(pzSortieren));
  return sp;
}

/**
 * IST und SOLL: wer wen ablöst. Ein IST-Modell in EOL nennt das Modell, das
 * es ablöst; dessen Stand (SOLL, POC, freigegeben) zeigt, wie weit die Ablösung
 * ist. Umgekehrt kennt das SOLL-Modell die IST-Modelle, die es ablöst.
 * → { eol, nachfolger: Eintrag|null, fehlt, vorgaenger: [Einträge] }
 */
function pzAbloesung(eintraege, id) {
  const sid = String(id);
  const liste = (eintraege || []).filter(x => x.art === 'modell');
  const e = liste.find(x => String(x.kachel.id) === sid) || null;
  const eol = !!e && e.status === 'eol';
  const nid = eol ? String(e.nachfolger || '') : '';
  const nachfolger = nid ? (liste.find(x => String(x.kachel.id) === nid) || null) : null;
  return {
    eol, nachfolger, fehlt: eol && !nachfolger,
    vorgaenger: liste.filter(x => x.status === 'eol' && String(x.nachfolger || '') === sid),
  };
}

/**
 * Wer einen IST-Prozess ablösen kann: zuerst die Modelle ab dem SOLL, dann die
 * übrigen (ein SOLL-Modell ohne gesetzten Status gilt sonst als IST). Kein
 * anderes EOL und nicht das Modell selbst. → { passend: [...], weitere: [...] }
 */
function pzNachfolgerKandidaten(eintraege, eigeneId) {
  const nachName = (a, b) => String(a.kachel.name || '').localeCompare(String(b.kachel.name || ''), 'de');
  const liste = (eintraege || []).filter(x => x.art === 'modell' && x.status !== 'eol' && String(x.kachel.id) !== String(eigeneId));
  return {
    passend: liste.filter(x => PZ_NACHFOLGER_STUFEN.includes(x.status)).sort(nachName),
    weitere: liste.filter(x => !PZ_NACHFOLGER_STUFEN.includes(x.status)).sort(nachName),
  };
}

/**
 * Die Karten des Backlogs: je Prozess eine. Das ist jede Kachel ohne Modell
 * und jedes Modell, das unter keinem anderen steht (Hauptprozess) und keine
 * IST-Aufnahme eines anderen Prozesses ist. An der Karte hängen
 *   teile       ihre Unter- und Nebenprozesse, über beliebig viele Stufen,
 *   istModelle  die IST-Modelle (EOL), die dieser Prozess ablöst, samt Varianten.
 * Ein IST-Modell, dessen Prozess fehlt (nicht verknüpft oder gelöscht), bleibt
 * eine eigene Karte, damit es nicht verschwindet.
 * Erwartet Einträge aus pzEintraege (Modelle mit `haupt`, siehe pzModellEintraege).
 */
function pzKarten(eintraege) {
  const alle = eintraege || [];
  const modelle = new Map(alle.filter(e => e.art === 'modell').map(e => [String(e.kachel.id), e]));
  const oben = (e) => (e.haupt || []).map(id => modelle.get(String(id))).find(Boolean) || e;
  // Wo ein Eintrag hingehört: { karte, rolle } mit rolle karte · teil · ist.
  const heim = (e) => {
    if (e.art !== 'modell') return { karte: e, rolle: 'karte' };
    const h = oben(e);
    if (e.status === 'eol' || h.status === 'eol') {
      // Eine IST-Aufnahme gehört zum Prozess, den sie nennt (oder den ihr Hauptprozess nennt).
      const nid = (e.status === 'eol' && e.nachfolger) ? e.nachfolger : (h.status === 'eol' ? h.nachfolger : '');
      const n = nid ? modelle.get(String(nid)) : null;
      const prozess = n ? oben(n) : null;
      if (prozess && prozess.status !== 'eol') return { karte: prozess, rolle: 'ist' };
      return h === e ? { karte: e, rolle: 'karte' } : { karte: h, rolle: 'teil' };
    }
    return h === e ? { karte: e, rolle: 'karte' } : { karte: h, rolle: 'teil' };
  };
  const karten = new Map();
  const zuordnung = alle.map(e => ({ e, r: heim(e) }));
  zuordnung.filter(x => x.r.rolle === 'karte').forEach(x => karten.set(x.e, Object.assign({}, x.e, { teile: [], istModelle: [] })));
  zuordnung.filter(x => x.r.rolle !== 'karte').forEach(x => {
    const k = karten.get(x.r.karte);
    if (k) k[x.r.rolle === 'ist' ? 'istModelle' : 'teile'].push(x.e);
    else karten.set(x.e, Object.assign({}, x.e, { teile: [], istModelle: [] }));   // ohne Heimat: eigene Karte
  });
  return [...karten.values()];
}

/**
 * Was ein Prozess braucht, um seine Phase abzuschließen (Definition of Done),
 * geprüft an den vorhandenen Angaben. Die Kriterien blockieren nichts, die
 * Phase wird von Hand gesetzt; die Karte zeigt, was fehlt.
 * extra: { regelwerke: Anzahl verknüpfter Regelwerke, freigabe: Status des
 * Regelwerks der Freigabe ('' = keins) }.  → { phase, naechste, fehlt: ['…'] }
 */
function pzKriterien(k, extra, heute) {
  const x = extra || {};
  const phase = pzStatusInfo(k && k.status).key;
  const fehlt = [];
  const modell = k.art === 'modell';
  const ist = k.istModelle || [];
  if (phase === 'identifiziert') {
    if (!k.eigner || !k.eigner.upn) fehlt.push('Prozesseigner');
    if (!k.prio) fehlt.push('Priorität');
  } else if (phase === 'aufnahme') {
    if (!modell && !ist.length) fehlt.push('IST-Modell');
  } else if (phase === 'analyse') {
    if (!k.analyseAm) fehlt.push('Analyse abschließen (Datum)');
  } else if (phase === 'soll') {
    if (!modell) fehlt.push('SOLL-Modell');
    if (!x.regelwerke) fehlt.push('Regelwerk');
    if (!k.freigeber && !x.freigabe) fehlt.push('Freigeber');
  } else if (phase === 'poc') {
    const l = pzPocLuecken('poc', k.poc, heute);
    fehlt.push(...l);
    if (k.pruefung && !k.pruefung.datum) fehlt.push('Termin der Bewertung');
    if (!l.some(t => /Ende/.test(t)) && (!k.poc || k.poc.ergebnis !== 'bestanden')) fehlt.push('POC bestanden');
  } else if (phase === 'freigegeben') {
    if (x.freigabe !== 'Veröffentlicht') fehlt.push('Regelwerk der Freigabe veröffentlicht');
    fehlt.push(...pzLuecken(k));
    const laeuft = ist.filter(i => i.status === 'eol' && !i.abgeloestAm).length;
    if (laeuft) fehlt.push(`${laeuft} IST noch in Benutzung`);
  } else if (phase === 'ausgerollt') {
    fehlt.push(...pzLuecken(k));
    if (k.pruefung && k.pruefung.stufe === 'fehlt') fehlt.push('Review-Termin');
    if (k.pruefung && k.pruefung.stufe === 'ueberfaellig') fehlt.push('Review überfällig');
  } else if (phase === 'eol') {
    fehlt.push('Prozess verknüpfen, den es ablöst');
  }
  return { phase, naechste: pzNaechstePhase(phase), fehlt };
}

/** Kennzahlen für die Kopfzeile des Backlogs, gezählt über die Karten (Prozesse). */
function pzKennzahlen(eintraege) {
  const n = eintraege.length;
  const zaehl = (f) => eintraege.filter(f).length;
  const ist = eintraege.flatMap(k => k.istModelle || []);
  const loseIst = eintraege.filter(k => k.status === 'eol');
  return {
    gesamt: n,
    mitEigner: zaehl(e => e.eigner.upn),
    standardEntschieden: zaehl(e => e.standard.key),
    priorisiert: zaehl(e => e.prio),
    inArbeit: zaehl(e => ['aufnahme', 'analyse', 'soll', 'poc', 'freigegeben'].includes(e.status)),
    ausgerollt: zaehl(e => e.status === 'ausgerollt'),
    // IST-Modelle: zugeordnet hängen sie an ihrer Karte, lose stehen sie für sich.
    eol: ist.length + loseIst.length,
    eolMitSoll: ist.length,
    istInBenutzung: ist.concat(loseIst).filter(i => i.status === 'eol' && !i.abgeloestAm).length,
    modelle: zaehl(e => PZ_NACHFOLGER_STUFEN.includes(e.status)),
    mitFreigeber: zaehl(e => PZ_NACHFOLGER_STUFEN.includes(e.status) && e.freigeber),
    // Wer über seinen Hauptprozess geprüft wird, zählt dort.
    ueberfaellig: zaehl(e => e.pruefung.stufe === 'ueberfaellig' && !e.pruefung.ueber),
    ohneTermin: zaehl(e => e.pruefung.stufe === 'fehlt' && !e.pruefung.ueber),
    mitKennzahl: zaehl(e => e.kennzahlen && e.kennzahlen.liste.length),
    kennzahlVerfehlt: zaehl(e => e.kennzahlen && pzKpiStand(e.kennzahlen.liste).verfehlt),
    reifegradBewertet: zaehl(e => e.reifegrad && e.reifegrad.key),
  };
}

/**
 * Was einem freigegebenen oder ausgerollten Prozess nach der
 * Konzernfachregelung noch fehlt (ISO 9001 4.4, ISO/IEC 33020).
 * Vor der Freigabe ist nichts davon eine Lücke. → ['…', …]
 */
function pzLuecken(e) {
  if (!e || !['freigegeben', 'ausgerollt'].includes(e.status)) return [];
  const out = [];
  if (!e.kennzahlen || !e.kennzahlen.liste.length) out.push('keine Kennzahl');
  if (!e.reifegrad || !e.reifegrad.key) out.push('Reifegrad nicht bewertet');
  else if (e.status === 'ausgerollt' && e.standard && e.standard.key === 'einheitlich'
    && Number(e.reifegrad.key) < Number(PZ_REIFEGRAD_ZIEL)) out.push(`Reifegrad unter ${PZ_REIFEGRAD_ZIEL}`);
  return out;
}

/**
 * Für „Fälligkeiten": Prozesse mit Termin oder mit fehlendem Pflichttermin,
 * gruppiert wie bei den Regelwerken.
 */
function pzFaellige(daten, werke, heute, modelle) {
  const b = { ueberfaellig: [], bald: [], spaeter: [], fehlt: [] };
  // Unter- und Nebenprozesse ohne eigenen Termin stehen mit ihrem Hauptprozess da, nicht noch einmal.
  pzEintraege(daten, werke, heute, modelle).forEach(e => { if (b[e.pruefung.stufe] && !e.pruefung.ueber) b[e.pruefung.stufe].push(e); });
  const nachTagen = (a, c) => (a.pruefung.tage - c.pruefung.tage) || String(a.kachel.name).localeCompare(String(c.kachel.name), 'de');
  b.ueberfaellig.sort(nachTagen); b.bald.sort(nachTagen); b.spaeter.sort(nachTagen);
  b.fehlt.sort((a, c) => String(a.kachel.name).localeCompare(String(c.kachel.name), 'de'));
  return b;
}

/* ── Modelle: die Prozesse in BPMN ───────────────────────────────────
   Ein Modell ist ein Prozess, auch wenn es (noch) an keiner Kachel hängt.
   Seine Angaben stehen in der Datei selbst, als Marker in der Dokumentation
   des Prozesses, so wie Regelwerke und Anlagen:

     [[rms:pm=Status|Prozesseigner|Standardisierung|Priorität|Überprüfung|Reifegrad|Freigeber|Nachfolger]]
     [[rms:kpi=Name|Einheit|Richtung|Ziel|Ist|Stand]]      (je Kennzahl eine Zeile)

   Hinten Angefügtes steht nur da, wenn es gesetzt ist: Ältere Modelle mit fünf
   oder sechs Feldern lesen sich unverändert. „Freigeber" ist, wer den Prozess
   freigibt (siehe js/prozessfreigabe.js), „Nachfolger" die Datei-Kennung des
   SOLL-Modells, das einen auslaufenden Prozess (EOL) ablöst.

   Der POC gehört zum SOLL: Er erprobt genau dieses Modell. Darum steht er am
   SOLL-Modell selbst, nicht in einem zweiten:

     [[rms:poc=Werke|Beginn|Ende|Verantwortlich|Ergebnis]]
     [[rms:pockrit=Erfolgskriterium|Bewertung]]            (je Kriterium eine Zeile)

   Der Termin der Bewertung ist der Review-Termin des Modells (naechsteUeberpruefung).

   Der Vergleich mit dem IST steht ebenfalls am SOLL, je Zuordnung eine Zeile
   (js/prozessvergleich.js):

     [[rms:vgl=Art|IST-Schritte|SOLL-Schritte|Grund]]

   Ein Schritt ist „Modell-Kennung:Element-Kennung", mehrere mit Komma. Bei
   „entfällt" bleibt die SOLL-Seite leer, bei „neu" die IST-Seite.

   Was am Modell leer ist, kommt von der Kachel, an der es hängt, und von dort
   wie gehabt von der gleichnamigen Konzernkachel. Hängt es an keiner, zählt
   für Eigner und Standardisierung die gleichnamige Konzernkachel. */

const PZ_PM_MARKER = /\[\[rms:pm=([^\]]*)\]\]/;
const PZ_KPI_MARKER = /\[\[rms:kpi=([^\]]*)\]\]/g;
const PZ_PM_FELDER = ['status', 'prozesseigner', 'standardisierung', 'prioritaet', 'naechsteUeberpruefung', 'reifegrad', 'freigeber', 'nachfolger', 'analyseAm', 'abgeloestAm'];
const PZ_KPI_FELDER = ['name', 'einheit', 'richtung', 'ziel', 'ist', 'stand'];
const PZ_PM_TEXTZEILE = 'Prozessmanagement: ';
const PZ_KPI_TEXTZEILE = 'Kennzahlen: ';
const PZ_POC_MARKER = /\[\[rms:poc=([^\]]*)\]\]/;
const PZ_POC_KRIT_MARKER = /\[\[rms:pockrit=([^\]]*)\]\]/g;
const PZ_POC_FELDER = ['werke', 'start', 'ende', 'verantwortlich', 'ergebnis'];
const PZ_POC_TEXTZEILE = 'POC: ';
const PZ_POC_KRIT_TEXTZEILE = 'POC-Kriterien: ';
/** Ergebnis des POC: leer, solange er läuft. */
const PZ_POC_ERGEBNIS = [
  { key: '',            label: 'läuft',           farbe: '#F08300' },
  { key: 'bestanden',   label: 'bestanden',       farbe: '#15803d' },
  { key: 'verlaengert', label: 'verlängert',      farbe: '#b45309' },
  { key: 'nicht',       label: 'nicht bestanden', farbe: '#b91c1c' },
];
/** Vergleich mit dem IST: was aus einem Schritt wird. */
const PZ_VGL_MARKER = /\[\[rms:vgl=([^\]]*)\]\]/g;
const PZ_VGL_TEXTZEILE = 'Vergleich mit dem IST: ';
const PZ_VGL_ARTEN = [
  { key: 'bleibt',         label: 'bleibt',         farbe: '#64748b', text: 'Der Schritt läuft im SOLL wie bisher.' },
  { key: 'geaendert',      label: 'geändert',       farbe: '#b45309', text: 'Der Schritt bleibt, läuft aber anders: andere Rolle, anderes Werkzeug, andere Regel.' },
  { key: 'automatisiert',  label: 'automatisiert',  farbe: '#15803d', text: 'Was ein Mensch getan hat, erledigt im SOLL ein System.' },
  { key: 'zusammengelegt', label: 'zusammengelegt', farbe: '#7c3aed', text: 'Mehrere Schritte des IST werden im SOLL zu einem.' },
  { key: 'entfaellt',      label: 'entfällt',       farbe: '#b91c1c', text: 'Den Schritt gibt es im SOLL nicht mehr.' },
  { key: 'neu',            label: 'neu',            farbe: '#0284C7', text: 'Den Schritt gab es im IST nicht.' },
];

/** Bewertung eines Erfolgskriteriums. */
const PZ_POC_BEWERTUNG = [
  { key: '',         label: 'offen',    zeichen: '○' },
  { key: 'erfuellt', label: 'erfüllt',  zeichen: '✓' },
  { key: 'verfehlt', label: 'verfehlt', zeichen: '✗' },
];

/** Ein Feld für den Marker tauglich machen: Trenner und Klammern raus. */
function _pzFeld(s) { return String(s == null ? '' : s).replace(/[|\[\]\r\n]/g, ' ').trim(); }

/** Nur gültige Werte behalten – was nicht passt, gilt als nicht gesetzt. */
function pzPmNormal(pm) {
  const p = pm || {};
  const datum = String(p.naechsteUeberpruefung || '').trim().slice(0, 10);
  const tag = (s) => { const d = String(s || '').trim().slice(0, 10); return pzTageBis(d) === null ? '' : d; };
  return {
    // Das alte „ist" eines Modells ist die IST-Aufnahme.
    status: p.status === 'ist' ? 'aufnahme' : (PZ_STATUS.some(s => s.key === p.status) ? p.status : ''),
    prozesseigner: _pzFeld(p.prozesseigner),
    standardisierung: pzStandardInfo(p.standardisierung) ? p.standardisierung : '',
    prioritaet: pzPrioInfo(p.prioritaet) ? p.prioritaet : '',
    naechsteUeberpruefung: pzTageBis(datum) === null ? '' : datum,
    reifegrad: pzReifegradInfo(p.reifegrad) ? String(p.reifegrad) : '',
    freigeber: _pzFeld(p.freigeber),
    nachfolger: _pzFeld(p.nachfolger),
    analyseAm: tag(p.analyseAm),
    abgeloestAm: tag(p.abgeloestAm),
    kennzahlen: pzKpiNormal(p.kennzahlen),
    poc: pzPocNormal(p.poc),
    vergleich: pzVglNormal(p.vergleich),
  };
}

/* ── Vergleich mit dem IST ── */

function pzVglArtInfo(key) { return PZ_VGL_ARTEN.find(x => x.key === key) || PZ_VGL_ARTEN[1]; }

/** Ein Schritt im Vergleich: „Modell:Element", ohne Trenner, Klammern und Leerzeichen. */
function _pzVglRef(s) {
  const t = String(s == null ? '' : s).trim();
  return /^[^\s:,|[\]]+:[^\s:,|[\]]+$/.test(t) ? t : '';
}

/**
 * Nur gültige Zuordnungen: mindestens eine Seite, bekannte Art. Fehlt die
 * SOLL-Seite, entfällt der Schritt; fehlt die IST-Seite, ist er neu.
 */
function pzVglNormal(liste) {
  return (Array.isArray(liste) ? liste : []).map(z => {
    const seite = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map(_pzVglRef).filter(Boolean))];
    const ist = seite(z && z.ist), soll = seite(z && z.soll);
    let art = PZ_VGL_ARTEN.some(a => a.key === (z && z.art)) ? z.art : 'geaendert';
    if (!soll.length) art = 'entfaellt';
    else if (!ist.length) art = 'neu';
    else if (art === 'entfaellt' || art === 'neu') art = 'geaendert';
    return { art, ist, soll, grund: _pzFeld(z && z.grund) };
  }).filter(z => z.ist.length || z.soll.length);
}

/** Der Vergleich in einer Zeile: „12 Zuordnungen: 4 bleiben, 3 automatisiert, 2 entfallen, 1 neu". */
function pzVglKurz(liste) {
  const n = pzVglNormal(liste);
  if (!n.length) return '';
  const z = (k) => n.filter(x => x.art === k).length;
  const teile = [['bleibt', 'bleiben'], ['geaendert', 'geändert'], ['automatisiert', 'automatisiert'],
    ['zusammengelegt', 'zusammengelegt'], ['entfaellt', 'entfallen'], ['neu', 'neu']]
    .filter(([k]) => z(k)).map(([k, t]) => `${z(k)} ${z(k) === 1 && k === 'bleibt' ? 'bleibt' : z(k) === 1 && k === 'entfaellt' ? 'entfällt' : t}`);
  return `${n.length} Zuordnung${n.length === 1 ? '' : 'en'}: ${teile.join(', ')}`;
}

function pzVglZeilen(liste) {
  const n = pzVglNormal(liste);
  if (!n.length) return [];
  return [PZ_VGL_TEXTZEILE + pzVglKurz(n)].concat(n.map(z => '[[rms:vgl=' + [z.art, z.ist.join(','), z.soll.join(','), _pzFeld(z.grund)].join('|') + ']]'));
}

function pzVglAusText(text) {
  const n = [...String(text || '').matchAll(PZ_VGL_MARKER)].map(x => {
    const t = x[1].split('|');
    return { art: (t[0] || '').trim(), ist: t[1] || '', soll: t[2] || '', grund: (t[3] || '').trim() };
  });
  return n.length ? pzVglNormal(n) : null;
}

/* ── POC am SOLL-Modell ── */

function pzPocErgebnisInfo(key) { return PZ_POC_ERGEBNIS.find(x => x.key === key) || PZ_POC_ERGEBNIS[0]; }
function pzPocBewertungInfo(key) { return PZ_POC_BEWERTUNG.find(x => x.key === key) || PZ_POC_BEWERTUNG[0]; }

/** Nur gültige Werte. Werke als Liste von Kürzeln, Kriterien ohne leere Zeilen. */
function pzPocNormal(poc) {
  const p = poc || {};
  const datum = (s) => { const d = String(s || '').trim().slice(0, 10); return pzTageBis(d) === null ? '' : d; };
  const werke = (Array.isArray(p.werke) ? p.werke : String(p.werke || '').split(/[,;\s]+/))
    .map(w => _pzFeld(w).replace(/,/g, '').toUpperCase()).filter(Boolean);
  return {
    // „ALLE": der POC läuft in allen Werken (bleibt richtig, wenn eines dazukommt).
    werke: werke.includes('ALLE') ? ['ALLE'] : [...new Set(werke)],
    start: datum(p.start),
    ende: datum(p.ende),
    verantwortlich: _pzFeld(p.verantwortlich),
    ergebnis: PZ_POC_ERGEBNIS.some(x => x.key === p.ergebnis) ? p.ergebnis : '',
    kriterien: (Array.isArray(p.kriterien) ? p.kriterien : [])
      .map(k => ({ text: _pzFeld(k && k.text), bewertung: PZ_POC_BEWERTUNG.some(x => x.key === (k && k.bewertung)) ? k.bewertung : '' }))
      .filter(k => k.text),
  };
}

function pzPocLeer(poc) {
  const n = pzPocNormal(poc);
  return !n.werke.length && !n.start && !n.ende && !n.verantwortlich && !n.ergebnis && !n.kriterien.length;
}

/** Stand der Erfolgskriterien. → { gesamt, erfuellt, verfehlt, offen } */
function pzPocStand(poc) {
  const k = pzPocNormal(poc).kriterien;
  const z = (b) => k.filter(x => x.bewertung === b).length;
  return { gesamt: k.length, erfuellt: z('erfuellt'), verfehlt: z('verfehlt'), offen: z('') };
}

function _pzTagText(iso) { return iso ? iso.split('-').reverse().join('.') : ''; }

/** Die Werke eines POC zum Lesen: „alle Werke" oder die Kürzel. */
function pzPocWerkeText(werke) {
  return (werke || []).includes('ALLE') ? 'alle Werke' : (werke || []).join(', ');
}

/** Der POC in einer Zeile: „WGC, SHB · 01.10.2026 bis 30.11.2026 · 2 von 3 Kriterien erfüllt · läuft" */
function pzPocKurz(poc) {
  const n = pzPocNormal(poc);
  const s = pzPocStand(n);
  const teile = [];
  if (n.werke.length) teile.push(pzPocWerkeText(n.werke));
  if (n.start || n.ende) teile.push(n.start && n.ende ? `${_pzTagText(n.start)} bis ${_pzTagText(n.ende)}` : n.ende ? `bis ${_pzTagText(n.ende)}` : `ab ${_pzTagText(n.start)}`);
  if (s.gesamt) teile.push(`${s.erfuellt} von ${s.gesamt} Kriterien erfüllt${s.verfehlt ? ', ' + s.verfehlt + ' verfehlt' : ''}`);
  teile.push(pzPocErgebnisInfo(n.ergebnis).label);
  return teile.join(' · ');
}

/**
 * Was einem laufenden POC fehlt (Konzernfachregelung: Die Erfolgskriterien
 * stehen vorher fest). Nur für Modelle im POC. → ['…', …]
 */
function pzPocLuecken(status, poc, heute) {
  if (status !== 'poc') return [];
  const n = pzPocNormal(poc);
  const out = [];
  if (!n.werke.length) out.push('kein Pilotwerk');
  if (!n.kriterien.length) out.push('keine Erfolgskriterien');
  const tage = pzTageBis(n.ende, heute);
  if (!n.ergebnis && tage !== null && tage < 0) out.push('POC-Ende überschritten, Ergebnis offen');
  return out;
}

/** Klartext und Marker des POC für die Dokumentation. */
function pzPocZeilen(poc) {
  const n = pzPocNormal(poc);
  if (pzPocLeer(n)) return [];
  const zeilen = [];
  const kopf = [n.werke.length ? 'Pilot ' + pzPocWerkeText(n.werke) : '', n.start || n.ende ? `${_pzTagText(n.start) || '…'} bis ${_pzTagText(n.ende) || '…'}` : '',
    n.verantwortlich ? 'verantwortlich ' + n.verantwortlich : '', 'Ergebnis ' + pzPocErgebnisInfo(n.ergebnis).label].filter(Boolean);
  zeilen.push(PZ_POC_TEXTZEILE + kopf.join(' · '));
  zeilen.push('[[rms:poc=' + [n.werke.join(','), n.start, n.ende, n.verantwortlich, n.ergebnis].map(_pzFeld).join('|') + ']]');
  if (n.kriterien.length) {
    zeilen.push(PZ_POC_KRIT_TEXTZEILE + n.kriterien.map(k => `${k.text} (${pzPocBewertungInfo(k.bewertung).label})`).join('; '));
    n.kriterien.forEach(k => zeilen.push('[[rms:pockrit=' + _pzFeld(k.text) + '|' + k.bewertung + ']]'));
  }
  return zeilen;
}

/**
 * Mehrere Marker derselben Art feldweise zusammenführen: Ein Feld, das später
 * gesetzt ist, gewinnt. Ältere Modelle mit Pool trugen die Angaben zweimal (an
 * der Kollaboration und, später im XML, am Prozess); gilt die am Prozess.
 */
function _pzFelderZusammen(treffer) {
  const t = [];
  treffer.forEach(m => m[1].split('|').forEach((v, i) => { const w = (v || '').trim(); if (w) t[i] = w; }));
  return t;
}

/** Je Schlüssel nur einmal, der spätere gewinnt (doppelte Kennzahlen oder Kriterien). */
function _pzEinmal(liste, schluessel) {
  const m = new Map();
  liste.forEach(x => { const k = schluessel(x); m.delete(k); m.set(k, x); });
  return [...m.values()];
}

/** Den POC aus einem Text oder XML lesen (null, wenn keiner drinsteht). */
function pzPocAusText(text) {
  const s = String(text || '');
  const kopf = [...s.matchAll(new RegExp(PZ_POC_MARKER.source, 'g'))];
  const krit = _pzEinmal([...s.matchAll(PZ_POC_KRIT_MARKER)].map(x => {
    const t = x[1].split('|').map(v => (v || '').trim());
    return { text: t[0] || '', bewertung: t[1] || '' };
  }), k => k.text);
  if (!kopf.length && !krit.length) return null;
  const poc = { kriterien: krit };
  const t = _pzFelderZusammen(kopf);
  PZ_POC_FELDER.forEach((f, i) => { poc[f] = t[i] || ''; });
  return pzPocNormal(poc);
}

/** Sind die Angaben der pm-Zeile leer? (Die Kennzahlen stehen in eigenen Zeilen.) */
function _pzPmZeileLeer(n) { return PZ_PM_FELDER.every(f => !n[f]); }

function pzPmLeer(pm) { const n = pzPmNormal(pm); return _pzPmZeileLeer(n) && !n.kennzahlen.length && pzPocLeer(n.poc) && !n.vergleich.length; }

/** Der Marker der pm-Zeile ('' wenn dort nichts gesetzt ist). */
function pzPmMarker(pm) {
  const n = pzPmNormal(pm);
  if (_pzPmZeileLeer(n)) return '';
  const felder = PZ_PM_FELDER.map(f => _pzFeld(n[f]));
  // Leeres hinten fällt weg, bis zum alten Format mit fünf Feldern.
  while (felder.length > 5 && !felder[felder.length - 1]) felder.pop();
  return '[[rms:pm=' + felder.join('|') + ']]';
}

/** Die Zeile im Klartext – damit auch ein fremder Modeler zeigt, was gilt. */
function pzPmKlartext(pm) {
  const n = pzPmNormal(pm);
  if (_pzPmZeileLeer(n)) return '';
  const teile = [];
  if (n.status) teile.push('Phase ' + pzStatusInfo(n.status).label);
  if (n.prozesseigner) teile.push('Prozesseigner ' + n.prozesseigner);
  if (n.standardisierung) teile.push(pzStandardInfo(n.standardisierung).label);
  if (n.prioritaet) teile.push('Priorität ' + pzPrioInfo(n.prioritaet).label);
  if (n.naechsteUeberpruefung) teile.push('Überprüfung bis ' + n.naechsteUeberpruefung);
  if (n.reifegrad) teile.push('Reifegrad ' + pzReifegradInfo(n.reifegrad).label);
  if (n.freigeber) teile.push('Freigabe durch ' + n.freigeber);
  if (n.nachfolger) {
    const m = (typeof procModellVon === 'function') ? procModellVon(n.nachfolger) : null;
    teile.push('abgelöst durch ' + (m ? m.title : n.nachfolger));
  }
  if (n.analyseAm) teile.push('Analyse abgeschlossen am ' + n.analyseAm);
  if (n.abgeloestAm) teile.push('außer Betrieb seit ' + n.abgeloestAm);
  return PZ_PM_TEXTZEILE + teile.join(' · ');
}

function pzKpiMarker(k) {
  return '[[rms:kpi=' + PZ_KPI_FELDER.map(f => _pzFeld(k[f])).join('|') + ']]';
}

/**
 * Alle Zeilen für die Dokumentation des Prozesses: die pm-Zeile im Klartext
 * und als Marker, dann die Kennzahlen (eine Klartextzeile, je Kennzahl ein
 * Marker – wie bei den Anlagen).
 */
function pzPmZeilen(pm) {
  const n = pzPmNormal(pm);
  const zeilen = [];
  if (!_pzPmZeileLeer(n)) zeilen.push(pzPmKlartext(n), pzPmMarker(n));
  if (n.kennzahlen.length) {
    zeilen.push(PZ_KPI_TEXTZEILE + n.kennzahlen.map(pzKpiText).join('; '));
    n.kennzahlen.forEach(k => zeilen.push(pzKpiMarker(k)));
  }
  zeilen.push(...pzPocZeilen(n.poc));
  zeilen.push(...pzVglZeilen(n.vergleich));
  return zeilen;
}

/** Die Angaben aus einem Text oder XML lesen (null, wenn weder pm- noch Kennzahl-Marker drinsteht). */
function pzPmAusText(text) {
  const s = String(text || '');
  const zeilen = [...s.matchAll(new RegExp(PZ_PM_MARKER.source, 'g'))];
  const kpis = _pzEinmal([...s.matchAll(PZ_KPI_MARKER)].map(x => {
    const t = x[1].split('|').map(v => (v || '').trim());
    const k = {};
    PZ_KPI_FELDER.forEach((f, i) => { k[f] = t[i] || ''; });
    return k;
  }), k => k.name);
  const poc = pzPocAusText(s);
  const vergleich = pzVglAusText(s);
  if (!zeilen.length && !kpis.length && !poc && !vergleich) return null;
  const pm = { kennzahlen: kpis, poc, vergleich };
  const t = _pzFelderZusammen(zeilen);
  PZ_PM_FELDER.forEach((f, i) => { pm[f] = t[i] || ''; });
  return pzPmNormal(pm);
}

/**
 * Die Unter- und Nebenprozesse eines Modells aus seinem XML: was ein Schritt
 * aufruft (⊞, [[rms:modell=…]]) und was zugeordnet ist ([[rms:unter=…]],
 * [[rms:neben=…]]). Für Ansichten, die die Gliederung nicht laden (Fälligkeiten).
 */
function pzKinderAusText(text) {
  const s = String(text || '');
  const ids = [];
  for (const m of s.matchAll(/\[\[rms:(modell|unter|neben)=([^\]]*)\]\]/g)) ids.push(...m[2].split(','));
  return [...new Set(ids.map(x => x.trim()).filter(Boolean))];
}

/**
 * Die Hauptprozesse je Modell: wer über beliebig viele Stufen über ihm steht
 * und selbst unter keinem. modelle[].kinder sind die Kennungen seiner Unter-
 * und Nebenprozesse. → Map(id → [Kennungen der Hauptprozesse])
 */
function pzHauptprozesse(modelle) {
  const eltern = new Map();
  (modelle || []).forEach(m => (m.kinder || []).forEach(k => {
    const id = String(k);
    if (id === String(m.itemId)) return;
    const a = eltern.get(id) || [];
    a.push(String(m.itemId));
    eltern.set(id, a);
  }));
  const out = new Map();
  (modelle || []).forEach(m => {
    const id = String(m.itemId);
    const haupt = [], gesehen = new Set([id]);
    const hoch = (x) => {
      const e = eltern.get(x) || [];
      if (!e.length) { if (x !== id && !haupt.includes(x)) haupt.push(x); return; }
      e.forEach(p => { if (!gesehen.has(p)) { gesehen.add(p); hoch(p); } });
    };
    hoch(id);
    out.set(id, haupt);
  });
  return out;
}

/**
 * Modelle als Backlog-Einträge.
 * modelle: [{ itemId, title, ordner, pm, kacheln: [{ werk, kachel }], kinder: [ids] }] –
 * `kacheln` sind die Kacheln, die auf das Modell zeigen, `kinder` seine Unter-
 * und Nebenprozesse (optional).
 *
 * Unter- und Nebenprozesse ohne eigenen Review-Termin gehen über ihren
 * Hauptprozess, wie bei Freigabe und POC: Sie übernehmen dessen Termin
 * (pruefung.ueber nennt ihn) und zählen weder in den Kennzahlen noch in den
 * Fälligkeiten ein zweites Mal.
 */
function pzModellEintraege(daten, modelle, heute) {
  const eintraege = _pzModellEintraegeEinzeln(daten, modelle, heute);
  const hauptVon = pzHauptprozesse(modelle);
  const nachId = new Map(eintraege.map(e => [String(e.kachel.id), e]));
  eintraege.forEach(e => { e.haupt = hauptVon.get(String(e.kachel.id)) || []; });
  eintraege.forEach(e => {
    if (e.pruefung.eigen) return;
    const haupt = (hauptVon.get(String(e.kachel.id)) || []).map(h => nachId.get(h)).filter(Boolean);
    if (!haupt.length) return;
    // Mehrere Hauptprozesse: der früheste Termin gilt; ohne Termin der erste.
    const mitTermin = haupt.filter(h => h.pruefung.datum).sort((a, b) => a.pruefung.datum.localeCompare(b.pruefung.datum));
    const h = mitTermin[0] || haupt[0];
    e.pruefung = Object.assign({}, h.pruefung, { eigen: false, ueber: { id: h.kachel.id, name: h.kachel.name } });
  });
  return eintraege;
}

function _pzModellEintraegeEinzeln(daten, modelle, heute) {
  return (modelle || []).map(m => {
    const pm = pzPmNormal(m.pm);
    const host = (Array.isArray(m.kacheln) && m.kacheln.length === 1) ? m.kacheln[0] : null;
    const werk = m.ordner || '';
    const alsKachel = { name: m.title };
    // Ein Modell ist mindestens aufgenommen: Sagt die Kachel nur „identifiziert", gilt die IST-Aufnahme.
    const vonKachel = host ? pzStatus(host.kachel) : '';
    const status = pm.status || (vonKachel && vonKachel !== 'identifiziert' ? vonKachel : 'aufnahme');
    let eigner = { upn: pm.prozesseigner, geerbt: false };
    if (!eigner.upn) {
      let von = '';
      if (host) von = pzEigner(daten, host.werk, host.kachel).upn;
      else {
        const kk = pzKonzernKachel(daten, werk === 'KONZERN' ? '' : werk, alsKachel);
        von = kk ? (String(kk.prozesseigner || '').trim() || String(kk.verantwortlich || '').trim()) : '';
      }
      eigner = { upn: von, geerbt: !!von };
    }
    let standard = { key: pm.standardisierung, geerbt: false };
    if (!standard.key) {
      const von = host ? pzStandard(daten, host.werk, host.kachel).key
        : ((pzKonzernKachel(daten, werk === 'KONZERN' ? '' : werk, alsKachel) || {}).standardisierung || '');
      standard = { key: pzStandardInfo(von) ? von : '', geerbt: !!pzStandardInfo(von) };
    }
    const prio = pm.prioritaet || (host && pzPrioInfo(host.kachel.prioritaet) ? host.kachel.prioritaet : '');
    const termin = pm.naechsteUeberpruefung || (host ? String(host.kachel.naechsteUeberpruefung || '') : '');
    // Reifegrad und Kennzahlen: Modell und Kachel sind derselbe Prozess im
    // selben Werk – die Kachel vererbt beides samt Messwerten. Ohne Kachel
    // gelten die Kennzahlen der Konzernkachel als Vorgabe (ohne Messwerte).
    const rgKachel = host ? pzReifegrad(host.kachel).key : '';
    const reifegrad = pm.reifegrad ? { key: pm.reifegrad, geerbt: false } : { key: rgKachel, geerbt: !!rgKachel };
    let kennzahlen = { liste: pm.kennzahlen, geerbt: false };
    if (!kennzahlen.liste.length) {
      if (host) {
        const v = pzKennzahlenVon(daten, host.werk, host.kachel);
        kennzahlen = { liste: v.liste, geerbt: v.liste.length > 0 };
      } else if (standard.key !== 'lokal') {
        kennzahlen = _pzKpiVorgabe(pzKonzernKachel(daten, werk === 'KONZERN' ? '' : werk, alsKachel));
      }
    }
    return {
      art: 'modell', werk, kachel: { id: m.itemId, name: m.title }, modell: m, host,
      status, eigner, standard, prio, freigeber: pm.freigeber, nachfolger: pm.nachfolger, poc: pm.poc,
      analyseAm: pm.analyseAm, abgeloestAm: pm.abgeloestAm, regelwerke: Number(m.regelwerke) || 0, haupt: [],
      vergleich: pm.vergleich, vergleichKurz: pm.vergleich.length ? `${pm.vergleich.length} Zuordnung${pm.vergleich.length === 1 ? '' : 'en'}` : '',
      pruefung: Object.assign(pzUeberpruefung({ status, naechsteUeberpruefung: termin }, heute), { eigen: !!termin, ueber: null }),
      reifegrad, kennzahlen,
    };
  });
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PZ_STATUS, PZ_SPALTEN, PZ_NACHFOLGER_STUFEN, PZ_VGL_ARTEN, PZ_VGL_TEXTZEILE, pzVglArtInfo, pzVglNormal, pzVglKurz, pzVglZeilen, pzVglAusText,
    pzPhase, pzNaechstePhase, PZ_PHASEN, pzKarten, pzKriterien, pzAbloesung, pzNachfolgerKandidaten, pzKinderAusText, pzHauptprozesse,
    PZ_POC_ERGEBNIS, PZ_POC_BEWERTUNG, PZ_POC_TEXTZEILE, PZ_POC_KRIT_TEXTZEILE, pzPocNormal, pzPocLeer, pzPocStand, pzPocKurz,
    pzPocLuecken, pzPocZeilen, pzPocAusText, pzPocWerkeText, pzPocErgebnisInfo, pzPocBewertungInfo,
    PZ_STANDARD, PZ_PRIO, PZ_UEBERPRUEFUNG_MONATE, PZ_BALD_TAGE, PZ_REVIEW_PFLICHT,
    PZ_REIFEGRAD, PZ_REIFEGRAD_ZIEL, PZ_RICHTUNG,
    pzStatus, pzStatusInfo, pzStandardInfo, pzPrioInfo, pzSchluessel, pzIstAblauf, pzNrText,
    pzReifegradInfo, pzRichtungInfo, pzReifegrad,
    pzZahl, pzKpiNormal, pzKpiBewertung, pzKpiStand, pzKpiText, pzKennzahlenVon,
    pzKonzernKachel, pzEigner, pzStandard, pzTageBis, pzUeberpruefung, pzTerminVorschlag,
    pzStatusSetzen, pzEintraege, pzSortieren, pzSpalten, pzKennzahlen, pzLuecken, pzFaellige,
    PZ_PM_TEXTZEILE, PZ_KPI_TEXTZEILE, pzPmNormal, pzPmLeer, pzPmMarker, pzPmKlartext, pzKpiMarker, pzPmZeilen,
    pzPmAusText, pzModellEintraege,
  };
}
