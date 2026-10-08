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
  { key: 'eol',         label: 'EOL, wird abgelöst', kurz: 'EOL', farbe: '#9F1239',
    text: 'Der bisherige Ablauf läuft aus und wird durch einen SOLL-Prozess abgelöst. Er bleibt als Nachweis des IST stehen, wird aber nicht weiterentwickelt und nicht mehr überprüft.' },
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

function pzStatus(k) {
  const s = k && k.status;
  return PZ_STATUS.some(x => x.key === s) ? s : 'ist';   // was in der Karte steht, ist erfasst
}
function pzStatusInfo(key) { return PZ_STATUS.find(x => x.key === key) || PZ_STATUS[0]; }
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
  if (pzStatus(k) === 'eol') {
    // Ein auslaufender Prozess wird nicht mehr überprüft: Er wird abgelöst.
    stufe = '';
  } else if (tage === null) {
    // Ohne Termin ist es eine Lücke, sobald es etwas zu bewerten gibt: der POC
    // (sein Ergebnis gegen die Erfolgskriterien) und der freigegebene Prozess.
    stufe = PZ_REVIEW_PFLICHT.includes(pzStatus(k)) ? 'fehlt' : '';
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
  // sie einsortiert werden (wie in der Modell-Liste).
  if (modelle) out.push(...pzModellEintraege(daten, modelle.filter(m => !werke || !m.ordner || werke.includes(m.ordner)), heute));
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
    eol: zaehl(e => e.status === 'eol'),
    modelle: zaehl(e => e.art === 'modell' && e.status !== 'eol'),
    mitFreigeber: zaehl(e => e.art === 'modell' && e.status !== 'eol' && e.freigeber),
    ueberfaellig: zaehl(e => e.pruefung.stufe === 'ueberfaellig'),
    ohneTermin: zaehl(e => e.pruefung.stufe === 'fehlt'),
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
  pzEintraege(daten, werke, heute, modelle).forEach(e => { if (b[e.pruefung.stufe]) b[e.pruefung.stufe].push(e); });
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

   Was am Modell leer ist, kommt von der Kachel, an der es hängt, und von dort
   wie gehabt von der gleichnamigen Konzernkachel. Hängt es an keiner, zählt
   für Eigner und Standardisierung die gleichnamige Konzernkachel. */

const PZ_PM_MARKER = /\[\[rms:pm=([^\]]*)\]\]/;
const PZ_KPI_MARKER = /\[\[rms:kpi=([^\]]*)\]\]/g;
const PZ_PM_FELDER = ['status', 'prozesseigner', 'standardisierung', 'prioritaet', 'naechsteUeberpruefung', 'reifegrad', 'freigeber', 'nachfolger'];
const PZ_KPI_FELDER = ['name', 'einheit', 'richtung', 'ziel', 'ist', 'stand'];
const PZ_PM_TEXTZEILE = 'Prozessmanagement: ';
const PZ_KPI_TEXTZEILE = 'Kennzahlen: ';

/** Ein Feld für den Marker tauglich machen: Trenner und Klammern raus. */
function _pzFeld(s) { return String(s == null ? '' : s).replace(/[|\[\]\r\n]/g, ' ').trim(); }

/** Nur gültige Werte behalten – was nicht passt, gilt als nicht gesetzt. */
function pzPmNormal(pm) {
  const p = pm || {};
  const datum = String(p.naechsteUeberpruefung || '').trim().slice(0, 10);
  return {
    status: PZ_STATUS.some(s => s.key === p.status) ? p.status : '',
    prozesseigner: _pzFeld(p.prozesseigner),
    standardisierung: pzStandardInfo(p.standardisierung) ? p.standardisierung : '',
    prioritaet: pzPrioInfo(p.prioritaet) ? p.prioritaet : '',
    naechsteUeberpruefung: pzTageBis(datum) === null ? '' : datum,
    reifegrad: pzReifegradInfo(p.reifegrad) ? String(p.reifegrad) : '',
    freigeber: _pzFeld(p.freigeber),
    nachfolger: _pzFeld(p.nachfolger),
    kennzahlen: pzKpiNormal(p.kennzahlen),
  };
}

/** Sind die Angaben der pm-Zeile leer? (Die Kennzahlen stehen in eigenen Zeilen.) */
function _pzPmZeileLeer(n) { return PZ_PM_FELDER.every(f => !n[f]); }

function pzPmLeer(pm) { const n = pzPmNormal(pm); return _pzPmZeileLeer(n) && !n.kennzahlen.length; }

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
  if (n.status) teile.push('Status ' + pzStatusInfo(n.status).label);
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
  return zeilen;
}

/** Die Angaben aus einem Text oder XML lesen (null, wenn weder pm- noch Kennzahl-Marker drinsteht). */
function pzPmAusText(text) {
  const s = String(text || '');
  const m = s.match(PZ_PM_MARKER);
  const kpis = [...s.matchAll(PZ_KPI_MARKER)].map(x => {
    const t = x[1].split('|').map(v => (v || '').trim());
    const k = {};
    PZ_KPI_FELDER.forEach((f, i) => { k[f] = t[i] || ''; });
    return k;
  });
  if (!m && !kpis.length) return null;
  const pm = { kennzahlen: kpis };
  const t = m ? m[1].split('|').map(x => (x || '').trim()) : [];
  PZ_PM_FELDER.forEach((f, i) => { pm[f] = t[i] || ''; });
  return pzPmNormal(pm);
}

/**
 * Modelle als Backlog-Einträge.
 * modelle: [{ itemId, title, ordner, pm, kacheln: [{ werk, kachel }] }] –
 * `kacheln` sind die Kacheln, die auf das Modell zeigen.
 */
function pzModellEintraege(daten, modelle, heute) {
  return (modelle || []).map(m => {
    const pm = pzPmNormal(m.pm);
    const host = (Array.isArray(m.kacheln) && m.kacheln.length === 1) ? m.kacheln[0] : null;
    const werk = m.ordner || '';
    const alsKachel = { name: m.title };
    const status = pm.status || (host ? pzStatus(host.kachel) : 'ist');
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
      status, eigner, standard, prio, freigeber: pm.freigeber, nachfolger: pm.nachfolger,
      pruefung: pzUeberpruefung({ status, naechsteUeberpruefung: termin }, heute),
      reifegrad, kennzahlen,
    };
  });
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PZ_STATUS, PZ_STANDARD, PZ_PRIO, PZ_UEBERPRUEFUNG_MONATE, PZ_BALD_TAGE, PZ_REVIEW_PFLICHT,
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
