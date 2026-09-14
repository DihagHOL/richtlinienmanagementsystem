'use strict';

/**
 * Notfallmanagement – das Modell
 * ==============================
 * ISO 27001 A.5.29 (Informationssicherheit bei Störungen), A.5.30 (IKT-Bereit-
 * schaft für Business Continuity), ISO 22301, BSI-Standard 200-4; NIS2 Art. 21
 * (2c) verlangt es ausdrücklich. Der Reifegrad-Katalog fragt es seit jeher ab
 * (R093: RPO/RTO, R071: Systemverantwortliche in der Notfalldoku) – ohne dass
 * die App eine Antwort geben konnte.
 *
 * **Der Plan hängt am Prozess, nicht am Asset.** Ein Server, der ausfällt, ist
 * kein Notfall. Ein Notfall ist der Prozess, der deshalb steht. Deshalb trägt
 * jede Kachel der Landkarte ihre Business-Impact-Analyse (Kritikalität, MTPD,
 * RTO, RPO), die Assets, von denen sie abhängt, und ihren Notfallplan. Die
 * Asset-Abhängigkeit ist die Brücke: „Asset X ist weg" → betroffene Prozesse
 * → deren Pläne, nach RTO sortiert.
 *
 * Diese Datei kennt weder DOM noch SharePoint noch die Landkarte-Funktionen.
 * Sie rechnet auf dem Datenobjekt der Landkarte und liefert Text – deshalb
 * kann der Audit Report sie laden, ohne die 180 KB Landkarte mitzunehmen,
 * und deshalb ist sie ohne Browser prüfbar.
 *
 * Zeiten stehen in **Stunden** (auch Bruchteile). Die Anzeige rechnet in
 * Minuten, Stunden oder Tage um; die Eingabe wählt die Einheit.
 */

/* ── Kritikalität: das Ergebnis der Business-Impact-Analyse ── */
const NF_KRITIKALITAET = {
  hoch:    { label: 'hoch',    farbe: '#b91c1c',
             text: 'Ein Ausfall gefährdet Lieferfähigkeit, Sicherheit oder Rechtspflichten – Notfallplan ist Pflicht.' },
  mittel:  { label: 'mittel',  farbe: '#b45309',
             text: 'Ein Ausfall ist tagelang tragbar, aber teuer – Plan empfohlen.' },
  niedrig: { label: 'niedrig', farbe: '#15803d',
             text: 'Ein Ausfall ist wochenlang tragbar – kein eigener Plan nötig.' },
};

/* ── Die Teile eines Notfallplans – in der Reihenfolge, in der sie gebraucht werden ── */
const NF_PLAN_TEILE = [
  { id: 'sofort',          titel: 'Sofortmaßnahmen',            pflicht: true,
    frage: 'Was ist in der ersten Stunde zu tun? Wer wird alarmiert, was wird gesichert, was gestoppt?' },
  { id: 'notbetrieb',      titel: 'Notbetrieb',                 pflicht: true,
    frage: 'Wie läuft der Prozess ohne das ausgefallene Asset weiter – Handbetrieb, Ausweichsystem, Ersatzlieferant?' },
  { id: 'wiederanlauf',    titel: 'Wiederanlauf',               pflicht: true,
    frage: 'In welcher Reihenfolge wird wiederhergestellt, wer gibt frei, woran ist zu erkennen, dass es läuft?' },
  { id: 'rueckkehr',       titel: 'Rückkehr zum Normalbetrieb', pflicht: false,
    frage: 'Wie werden Daten aus dem Notbetrieb nachgetragen, wann endet der Notfall, wer erklärt ihn für beendet?' },
  { id: 'voraussetzungen', titel: 'Voraussetzungen',            pflicht: false,
    frage: 'Was muss vorher da sein – Ersatzgeräte, Datensicherung, Formulare, Verträge, Zugänge?' },
];

/* ── Übungsarten nach BSI 200-4, vom Leichten zum Schweren ── */
const NF_UEBUNGSARTEN = {
  planbesprechung: { label: 'Planbesprechung', text: 'Der Plan wird am Tisch durchgegangen – findet Lücken im Text, kostet eine Stunde.' },
  stabsuebung:     { label: 'Stabsübung',      text: 'Der Krisenstab arbeitet ein Szenario ab, ohne dass etwas abgeschaltet wird.' },
  funktionstest:   { label: 'Funktionstest',   text: 'Ein Teil wird echt geprüft – Rückspielung einer Sicherung, Ausweichsystem, Alarmierung.' },
  volluebung:      { label: 'Vollübung',       text: 'Der Ausfall wird nachgestellt, der Notbetrieb läuft tatsächlich.' },
};

/* ── Die Rollen eines Krisenstabs. Rollen, nicht Personen: Personen wechseln. ── */
const NF_STAB_ROLLEN = [
  { rolle: 'Leitung Krisenstab',            pflicht: true,
    aufgabe: 'Erklärt den Notfall und sein Ende, entscheidet, priorisiert.' },
  { rolle: 'Stellvertretung Leitung',       pflicht: true,
    aufgabe: 'Übernimmt, wenn die Leitung nicht erreichbar ist – ein Krisenstab mit einem Kopf hat keinen.' },
  { rolle: 'Lage und Protokoll',            pflicht: false,
    aufgabe: 'Führt Lagebild und Protokoll: wer hat wann was entschieden. Ohne das gibt es hinterher keine Auswertung.' },
  { rolle: 'Kommunikation',                 pflicht: false,
    aufgabe: 'Belegschaft, Kunden, Behörden, Presse – eine Stimme nach außen.' },
  { rolle: 'IT / OT',                       pflicht: false,
    aufgabe: 'Systeme, Netz, Steuerungen; Wiederanlauf der Technik.' },
  { rolle: 'Produktion / Fachbereich',      pflicht: false,
    aufgabe: 'Notbetrieb im Werk, Reihenfolge der Aufträge.' },
  { rolle: 'Personal und Arbeitssicherheit', pflicht: false,
    aufgabe: 'Menschen zuerst: Evakuierung, Verletzte, Erreichbarkeit, Fürsorge.' },
  { rolle: 'Recht und Datenschutz',         pflicht: false,
    aufgabe: 'Meldepflichten (NIS2: 24 h Frühwarnung, 72 h Meldung; DSGVO: 72 h), Verträge, Versicherung.' },
];

/* ── Externe Stellen, die auf keiner Alarmkarte fehlen sollten ── */
const NF_STAB_EXTERNE = [
  { wer: 'Feuerwehr / Rettungsdienst', telefon: '112' },
  { wer: 'Polizei',                    telefon: '110' },
  { wer: 'Energieversorger (Störung)', telefon: '' },
  { wer: 'IT-Dienstleister (Bereitschaft)', telefon: '' },
  { wer: 'Versicherung (Schadenmeldung)', telefon: '' },
  { wer: 'BSI-Meldestelle (NIS2)',     telefon: '' },
  { wer: 'Datenschutzaufsicht',        telefon: '' },
];

/* ── Die Eskalationsstufen nach BSI 200-4 ──
   Störung, Notfall, Krise – und der Normalbetrieb als Nullpunkt. Die Stufen
   sind fest; je Werk wird ausgefüllt, WER sie ausruft und WEN er alarmiert.
   Der Rest leitet sich ab: Ein Prozess ist in Störung, bis seine RTO reißt,
   danach im Notfall; ab der MTPD ist es eine Krise. Damit hat die Frage
   „Ist das schon ein Notfall?" eine Antwort, die niemand im Moment der
   Aufregung neu erfinden muss. */
const NF_STUFEN = [
  { nr: 0, key: 'normal',   label: 'Normalbetrieb', farbe: '#15803d',
    kriterium: 'Alles läuft. Störungen werden im Tagesgeschäft behoben.',
    erklaert: '–', alarmiert: '–', mittel: 'Regelbetrieb, Ticket', meldepflicht: '' },
  { nr: 1, key: 'stoerung', label: 'Störung',       farbe: '#b45309',
    kriterium: 'Ein Asset oder Prozess fällt aus. Der Notbetrieb trägt, die RTO ist noch nicht erreicht.',
    erklaert: 'Schichtleitung / IT-Bereitschaft', alarmiert: 'Prozessverantwortliche',
    mittel: 'Notfallplan: Sofortmaßnahmen und Notbetrieb', meldepflicht: '' },
  { nr: 2, key: 'notfall',  label: 'Notfall',       farbe: '#dc2626',
    kriterium: 'Ein kritischer Prozess steht länger als seine RTO – oder wird es absehbar, weil das Asset länger braucht, als der Prozess weg sein darf.',
    erklaert: 'Leitung Krisenstab, auf Meldung der Prozessverantwortlichen', alarmiert: 'Krisenstab-Kern: Leitung, Stellvertretung, IT/OT, betroffener Fachbereich',
    mittel: 'Notfallplan: Wiederanlauf; Krisenstab in Bereitschaft',
    meldepflicht: 'Bei Sicherheitsvorfall: NIS2-Frühwarnung binnen 24 h; DSGVO binnen 72 h, wenn Personendaten betroffen' },
  { nr: 3, key: 'krise',    label: 'Krise',         farbe: '#7f1d1d',
    kriterium: 'Mehrere kritische Prozesse betroffen, Menschen gefährdet, MTPD erreicht oder Außenwirkung (Kunden, Behörden, Presse).',
    erklaert: 'Leitung Krisenstab', alarmiert: 'Gesamter Krisenstab, Geschäftsführung; externe Stellen nach Lage',
    mittel: 'Krisenstab tritt zusammen; nach außen spricht nur die Rolle Kommunikation',
    meldepflicht: 'NIS2-Meldung binnen 72 h, Abschlussbericht binnen eines Monats' },
];

/** Die Stufe zu einer Nummer – null, wenn es sie nicht gibt. */
function nfStufe(nr) { return NF_STUFEN.find(x => x.nr === Number(nr)) || null; }

/** Die Nummer einer Alarmierungszeile: aus `nr`, sonst aus der führenden Ziffer der Beschriftung. */
function _nfStufeNr(row) {
  if (!row) return null;
  const n = Number(row.nr);
  if (Number.isInteger(n) && n >= 1 && n <= 3) return n;
  const m = String(row.stufe || '').match(/^\s*([123])\b/);
  return m ? Number(m[1]) : null;
}

/** Wie lange ein Plan ohne Übung bleiben darf – danach ist er Papier. */
const NF_UEBUNG_MONATE = 12;
/** Wie alt der Krisenstab-Stand sein darf – Telefonnummern veralten schneller als Pläne. */
const NF_STAB_MONATE = 12;

/* ── Zeiten ── */

/** Stunden → lesbar: 30 min · 4 h · 2 Tage. Leer, wenn keine Zahl. */
function nfDauerText(h) {
  const n = Number(h);
  if (h === '' || h === null || h === undefined || !Number.isFinite(n) || n < 0) return '';
  if (n === 0) return '0 h';
  if (n < 1) return `${Math.round(n * 60)} min`;
  if (n < 24) return `${+n.toFixed(1)} h`;
  const t = n / 24;
  return `${+t.toFixed(1)} ${t === 1 ? 'Tag' : 'Tage'}`;
}

/** Eingabe (Zahl + Einheit) → Stunden. '' bleibt '' – „nicht gepflegt" ist kein Nullwert. */
function nfDauerStunden(wert, einheit) {
  if (wert === '' || wert === null || wert === undefined) return '';
  const n = Number(String(wert).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return '';
  const f = { min: 1 / 60, h: 1, tage: 24 }[einheit || 'h'];
  return +(n * (f === undefined ? 1 : f)).toFixed(4);
}

/** Stunden → passende Einheit für die Eingabe: { wert, einheit }. */
function nfDauerEingabe(h) {
  const n = Number(h);
  if (h === '' || h === null || h === undefined || !Number.isFinite(n)) return { wert: '', einheit: 'h' };
  if (n >= 24 && n % 24 === 0) return { wert: n / 24, einheit: 'tage' };
  if (n < 1 && n > 0)          return { wert: Math.round(n * 60), einheit: 'min' };
  return { wert: +n.toFixed(2), einheit: 'h' };
}

function _nfZahl(v) { const n = Number(v); return (v === '' || v === null || v === undefined || !Number.isFinite(n)) ? null : n; }
/** Zum Sortieren: „nicht gepflegt" kommt ans Ende. */
function _nfSortZahl(v) { const n = _nfZahl(v); return n === null ? Infinity : n; }

/* ── Zugriff auf die Kachel ── */

/** Die BIA-Karte einer Kachel – immer ein Objekt, nie undefined. */
function nfBcmVon(k) {
  const b = (k && k.bcm && typeof k.bcm === 'object') ? k.bcm : {};
  return {
    kritikalitaet: NF_KRITIKALITAET[b.kritikalitaet] ? b.kritikalitaet : '',
    auswirkung: String(b.auswirkung || ''),
    mtpd: _nfZahl(b.mtpd) === null ? '' : Number(b.mtpd),
    rto:  _nfZahl(b.rto)  === null ? '' : Number(b.rto),
    rpo:  _nfZahl(b.rpo)  === null ? '' : Number(b.rpo),
    assets: Array.isArray(b.assets) ? b.assets.filter(a => a && a.id).map(a => ({ id: String(a.id), title: String(a.title || '#' + a.id),
      werke: Array.isArray(a.werke) ? a.werke.map(String).filter(Boolean) : [] })) : [],
    standAm: String(b.standAm || ''),
    plan: nfPlanVon(b.plan),
  };
}

function nfPlanVon(p) {
  const q = (p && typeof p === 'object') ? p : {};
  const out = { verantwortlich: String(q.verantwortlich || ''), standAm: String(q.standAm || ''),
    kontakte: Array.isArray(q.kontakte) ? q.kontakte.filter(x => x && (x.rolle || x.name || x.telefon))
      .map(x => ({ rolle: String(x.rolle || ''), name: String(x.name || ''), telefon: String(x.telefon || '') })) : [] };
  for (const t of NF_PLAN_TEILE) out[t.id] = String(q[t.id] || '');
  return out;
}

function nfIstKritisch(k) { return nfBcmVon(k).kritikalitaet === 'hoch'; }

/* ── Das Werk am Asset ──
   Die ISMS-Liste trägt es. Ein Asset ohne Werk oder mit 'ALLE' gilt überall. */

/** Gehört das Asset zu diesem Werk (oder ist es konzernweit)? */
function nfAssetPasst(asset, werk) {
  const w = (asset && Array.isArray(asset.werke)) ? asset.werke : [];
  if (!w.length || w.includes('ALLE') || !werk || werk === 'KONZERN') return true;
  return w.includes(werk);
}

/** Steht das Asset laut Liste ausdrücklich in einem anderen Werk? */
function nfAssetFremd(asset, werk) {
  const w = (asset && Array.isArray(asset.werke)) ? asset.werke : [];
  return !!(w.length && !w.includes('ALLE') && werk && werk !== 'KONZERN' && !w.includes(werk));
}

/** Darf diese Person das Asset sehen? null = keine Trennung. Ohne Werk: ja. */
function nfAssetSichtbar(asset, sichtbareWerke) {
  if (!Array.isArray(sichtbareWerke)) return true;
  const w = (asset && Array.isArray(asset.werke)) ? asset.werke : [];
  if (!w.length || w.includes('ALLE')) return true;
  return w.some(x => sichtbareWerke.includes(x));
}
function nfIstBewertet(k) { return !!nfBcmVon(k).kritikalitaet; }

/** Gibt es einen Plan, der den Namen verdient? Die drei Pflichtteile sind da. */
function nfHatPlan(k) {
  const p = nfBcmVon(k).plan;
  return NF_PLAN_TEILE.filter(t => t.pflicht).every(t => String(p[t.id] || '').trim());
}

function nfZiel(werk, id) { return `${werk}:${id}`; }

/* ── Übungen: die vierte Satzart im Wirksamkeits-Register ── */

/** Alle Übungen zu einem Prozess, neueste zuerst. */
function nfUebungenZu(uebungen, werk, id) {
  const z = nfZiel(werk, id);
  return (Array.isArray(uebungen) ? uebungen : [])
    .filter(u => u && u.art === 'uebung' && String(u.prozess || '') === z && u.status !== 'verworfen')
    .sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
}

function nfLetzteUebung(uebungen, werk, id) { return nfUebungenZu(uebungen, werk, id)[0] || null; }

function _nfMonateHer(iso) {
  if (!iso) return Infinity;
  const t = new Date(String(iso).slice(0, 10) + 'T00:00:00Z').getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / (30.44 * 86400000);
}

/** Übung fällig? Nie geübt zählt als fällig. */
function nfUebungFaellig(letzte, monate) {
  return _nfMonateHer(letzte && letzte.datum) > (monate || NF_UEBUNG_MONATE);
}

/* ── Die Prüfung: was einer Kachel fehlt ──
   Verweigert wird nichts – ein halber Plan ist im Ernstfall besser als keiner.
   Aber jede Lücke wird beim Namen genannt, und im Audit Report zählt sie. */

/**
 * @param {object} k       Kachel
 * @param {object} [ctx]   { assetRto: {id: {rto}}, uebungen: [...], werk }
 * @returns {{fehler:string[], hinweise:string[], rtoKonflikt:boolean}}
 */
function nfPruefung(k, ctx) {
  const c = ctx || {};
  const b = nfBcmVon(k);
  const fehler = [], hinweise = [];
  let rtoKonflikt = false;
  const hoch = b.kritikalitaet === 'hoch';

  if (!b.kritikalitaet) {
    fehler.push('Kritikalität nicht bewertet – ohne BIA weiß niemand, ob dieser Prozess einen Plan braucht.');
    return { fehler, hinweise, rtoKonflikt };
  }
  if (b.kritikalitaet === 'niedrig') return { fehler, hinweise, rtoKonflikt };

  // R093: RPO/RTO für das, was „sehr hoch" verfügbar sein muss.
  const zeit = (was, wert) => {
    if (wert === '') (hoch ? fehler : hinweise).push(`${was} fehlt (Reifegrad R093).`);
  };
  zeit('MTPD – maximal tolerierbare Ausfallzeit', b.mtpd);
  zeit('RTO – Wiederanlaufzeit', b.rto);
  zeit('RPO – tolerierbarer Datenverlust', b.rpo);

  if (b.rto !== '' && b.mtpd !== '' && b.rto > b.mtpd) {
    fehler.push(`RTO ${nfDauerText(b.rto)} liegt über der MTPD ${nfDauerText(b.mtpd)} – der Prozess wäre länger weg, als er weg sein darf.`);
  }

  if (!b.assets.length) {
    (hoch ? fehler : hinweise).push('Keine Assets zugeordnet – ohne Abhängigkeiten sagt der Plan nicht, wovor er schützt.');
  }

  // Die Zahl, die alle raten und niemand rechnet: Ein Prozess kann nicht
  // schneller wieder da sein als das Langsamste, wovon er abhängt.
  if (b.rto !== '' && c.assetRto) {
    for (const a of b.assets) {
      const ar = c.assetRto[a.id];
      const r = ar && _nfZahl(ar.rto);
      if (r !== null && r !== undefined && r > Number(b.rto)) {
        fehler.push(`RTO ${nfDauerText(b.rto)} ist nicht haltbar: „${a.title}" braucht ${nfDauerText(r)} zur Wiederherstellung.`);
        rtoKonflikt = true;
      }
    }
  }

  // Ein Asset, das laut Liste in einem anderen Werk steht: entweder eine
  // echte Abhängigkeit, die niemand kennt, oder ein Pflegefehler. Beides
  // sollte man sehen – als Hinweis, nicht als Lücke.
  for (const a of b.assets) {
    if (nfAssetFremd(a, c.werk)) hinweise.push(`„${a.title}" steht laut Asset-Liste in ${a.werke.join(', ')}, nicht in ${c.werk} – echte Abhängigkeit oder Pflegefehler?`);
  }

  const p = b.plan;
  for (const t of NF_PLAN_TEILE) {
    if (!String(p[t.id] || '').trim()) {
      if (t.pflicht) (hoch ? fehler : hinweise).push(`Notfallplan: „${t.titel}" fehlt.`);
      else if (hoch) hinweise.push(`Notfallplan: „${t.titel}" fehlt.`);
    }
  }
  if (hoch && !p.kontakte.length) fehler.push('Notfallplan: keine Kontakte – wen ruft man um drei Uhr nachts an?');
  if (!p.verantwortlich && !String((k && k.verantwortlich) || '').trim()) {
    (hoch ? fehler : hinweise).push('Niemand verantwortet den Plan (Reifegrad R071).');
  }

  if (hoch && nfHatPlan(k)) {
    const letzte = nfLetzteUebung(c.uebungen, c.werk, k.id);
    if (!letzte) hinweise.push(`Nie geübt – ein Plan ohne Übung ist Papier.`);
    else if (nfUebungFaellig(letzte)) hinweise.push(`Zuletzt geübt am ${String(letzte.datum).slice(0, 10)} – länger als ${NF_UEBUNG_MONATE} Monate her.`);
  }
  if (b.standAm && _nfMonateHer(b.standAm) > 24) hinweise.push(`BIA-Stand vom ${b.standAm.slice(0, 10)} – älter als zwei Jahre.`);
  return { fehler, hinweise, rtoKonflikt };
}

/* ── Krisenstab ── */

function nfStabVon(s) {
  const q = (s && typeof s === 'object') ? s : {};
  const liste = (a, felder) => (Array.isArray(a) ? a : []).filter(x => x && felder.some(f => String(x[f] || '').trim()))
    .map(x => { const o = {}; felder.forEach(f => { o[f] = String(x[f] || ''); }); return o; });
  return {
    standAm: String(q.standAm || ''),
    mitglieder: liste(q.mitglieder, ['rolle', 'name', 'telefon', 'mobil', 'vertretung', 'vertretungTelefon']),
    // Jede Zeile kennt ihre Stufe (1–3). Altbestand ohne `nr` wird an der
    // führenden Ziffer erkannt; die Beschriftung kommt aus dem Modell.
    alarmierung: liste(q.alarmierung, ['stufe', 'ausloeser', 'wer', 'tut']).map((x, i) => {
      const nr = _nfStufeNr(x) ?? _nfStufeNr((Array.isArray(q.alarmierung) ? q.alarmierung : [])[i]);
      const st = nfStufe(nr);
      return Object.assign(x, { nr, stufe: x.stufe || (st ? `${st.nr} – ${st.label}` : '') });
    }),
    externe: liste(q.externe, ['wer', 'telefon', 'hinweis']),
    treffpunkt: String(q.treffpunkt || ''),
    treffpunktErsatz: String(q.treffpunktErsatz || ''),
    kanal: String(q.kanal || ''),
    kanalErsatz: String(q.kanalErsatz || ''),
    hinweis: String(q.hinweis || ''),
  };
}

/** Leerer Stab mit den Rollen, die es geben muss – zum Ausfüllen. */
function nfStabVorlage() {
  return {
    standAm: '',
    mitglieder: NF_STAB_ROLLEN.map(r => ({ rolle: r.rolle, name: '', telefon: '', mobil: '', vertretung: '', vertretungTelefon: '' })),
    alarmierung: nfAlarmierungVorlage(),
    externe: NF_STAB_EXTERNE.map(e => ({ wer: e.wer, telefon: e.telefon, hinweis: '' })),
    treffpunkt: '', treffpunktErsatz: '', kanal: '', kanalErsatz: '', hinweis: '',
  };
}

/** Die drei Stufen als Alarmierungszeilen – Auslöser und Standardrollen aus dem Modell. */
function nfAlarmierungVorlage() {
  return NF_STUFEN.filter(x => x.nr >= 1).map(x => ({ nr: x.nr, stufe: `${x.nr} – ${x.label}`, ausloeser: x.kriterium, wer: x.erklaert, tut: x.alarmiert }));
}

/**
 * Die Alarmierung eines Stabs so, dass jede Stufe eine Zeile hat – fehlende
 * werden aus dem Modell ergänzt, fremde Zeilen (ohne Stufe) bleiben hinten.
 */
function nfAlarmierungVollstaendig(alarmierung) {
  const rows = Array.isArray(alarmierung) ? alarmierung.map(x => Object.assign({}, x, { nr: _nfStufeNr(x) })) : [];
  const out = [];
  for (const v of nfAlarmierungVorlage()) {
    const da = rows.find(r => r.nr === v.nr);
    out.push(da ? Object.assign({}, v, da, { stufe: da.stufe || v.stufe }) : v);
  }
  rows.filter(r => r.nr === null).forEach(r => out.push(r));
  return out;
}

const _nfIstLeitung = (m) => /leitung/i.test(m.rolle) && !/stellvertret|vertretung/i.test(m.rolle);
const _nfIstVertretung = (m) => /stellvertret/i.test(m.rolle) && /leitung/i.test(m.rolle);

/** Was dem Krisenstab fehlt. Leere Liste = im Ernstfall brauchbar. */
function nfStabLuecken(s) {
  if (!s) return ['Kein Krisenstab angelegt.'];
  const st = nfStabVon(s);
  const f = [];
  const mit = st.mitglieder;
  const nummer = (m) => String(m.telefon || m.mobil || '').trim();
  const leitung = mit.filter(_nfIstLeitung);
  if (!leitung.length || !leitung.some(m => m.name.trim())) f.push('Leitung Krisenstab ist nicht benannt.');
  else if (!leitung.some(m => m.name.trim() && nummer(m))) f.push('Leitung Krisenstab ohne Telefonnummer.');
  const vertr = mit.filter(_nfIstVertretung);
  if (!vertr.length || !vertr.some(m => m.name.trim())) f.push('Stellvertretung der Leitung ist nicht benannt – ein Krisenstab mit einem Kopf hat keinen.');
  else if (!vertr.some(m => m.name.trim() && nummer(m))) f.push('Stellvertretung ohne Telefonnummer.');
  const ohneNummer = mit.filter(m => m.name.trim() && !nummer(m) && !_nfIstLeitung(m) && !_nfIstVertretung(m));
  if (ohneNummer.length) f.push(`${ohneNummer.length} Mitglied(er) ohne Telefonnummer: ${ohneNummer.map(m => m.rolle || m.name).join(', ')}.`);
  if (!st.alarmierung.length) f.push('Keine Alarmierungskette – wer ruft wen, und wann?');
  else {
    // Jede Eskalationsstufe braucht jemanden, der sie ausruft. Sonst wird
    // aus einer Störung ein Notfall, ohne dass es jemand sagt.
    for (const v of NF_STUFEN.filter(x => x.nr >= 1)) {
      const row = st.alarmierung.find(r => r.nr === v.nr);
      if (!row) f.push(`Eskalationsstufe ${v.nr} (${v.label}) fehlt in der Alarmierung.`);
      else if (!String(row.wer || '').trim()) f.push(`Eskalationsstufe ${v.nr} (${v.label}): niemand benannt, der sie ausruft.`);
    }
  }
  if (!st.treffpunkt.trim()) f.push('Kein Treffpunkt.');
  if (!st.kanal.trim()) f.push('Kein Kommunikationskanal – und der Ausfall von Teams ist ein wahrscheinliches Szenario.');
  if (st.kanal.trim() && !st.kanalErsatz.trim()) f.push('Kein Ersatzkanal für den Fall, dass der erste ausfällt.');
  if (!st.standAm) f.push('Kein Stand – niemand weiß, ob die Nummern noch stimmen.');
  else if (_nfMonateHer(st.standAm) > NF_STAB_MONATE) f.push(`Stand vom ${st.standAm.slice(0, 10)} – älter als ${NF_STAB_MONATE} Monate. Telefonnummern veralten schneller als Pläne.`);
  return f;
}

/* ── Über alle Werke rechnen ── */

/**
 * Werke, die diese Person sehen darf – null = alle (die Trennung greift nicht).
 * Dieselbe Regel wie lkWerkeSichtbar() in der Landkarte, nur ohne sie zu
 * brauchen: Der Audit Report lädt die Landkarte-Ansicht nicht.
 */
function nfSichtbareWerke() {
  if (typeof trennungGreift !== 'function' || !trennungGreift() || typeof meineWerke !== 'function') return null;
  const meine = meineWerke();
  const alle = ['KONZERN'].concat(typeof STANDORTE !== 'undefined' ? STANDORTE : []);
  return alle.filter(w => w === 'KONZERN' || meine.includes(w));
}

/**
 * Die Werke, die einen Krisenstab haben müssen: jeder Standort – ob er schon
 * eine Landkarte hat oder nicht. Ein Werk ohne Prozesskacheln hat trotzdem
 * eine Pforte, eine Produktion und einen Brand. Die Konzern-Ebene steht
 * nicht in der Pflicht; wer dort einen Stab pflegt, darf das.
 */
function nfPflichtWerke() {
  const alle = (typeof STANDORTE !== 'undefined' && Array.isArray(STANDORTE)) ? STANDORTE.slice() : [];
  const sichtbar = nfSichtbareWerke();
  return sichtbar ? alle.filter(w => sichtbar.includes(w)) : alle;
}

/** Kacheln aller Karten als [{werk, kachel}], wahlweise auf Werke begrenzt. */
function nfAlleKacheln(daten, werke) {
  const karten = (daten && daten.karten) || {};
  const out = [];
  Object.keys(karten).forEach(w => {
    if (Array.isArray(werke) && !werke.includes(w)) return;
    (Array.isArray(karten[w].kacheln) ? karten[w].kacheln : []).forEach(k => out.push({ werk: w, kachel: k }));
  });
  return out;
}

/** Wiederherstellzeiten der Assets – ein Ort für alle Prozesse. */
function nfAssetRto(daten) {
  const n = (daten && daten.notfall && typeof daten.notfall === 'object') ? daten.notfall : {};
  return (n.assetRto && typeof n.assetRto === 'object') ? n.assetRto : {};
}

/**
 * Die Ausfall-Sicht: Welche Prozesse hängen an diesem Asset – nach RTO,
 * das Dringendste zuerst. Ohne RTO ans Ende: Wer keine Zeit gepflegt hat,
 * hat auch keinen Anspruch auf Vorrang.
 */
function nfAusfall(daten, assetId, werke) {
  const id = String(assetId || '');
  if (!id) return [];
  const rang = { hoch: 0, mittel: 1, niedrig: 2, '': 3 };
  return nfAlleKacheln(daten, werke)
    .filter(({ kachel }) => nfBcmVon(kachel).assets.some(a => a.id === id))
    .map(({ werk, kachel }) => { const b = nfBcmVon(kachel); return { werk, kachel, rto: b.rto, kritikalitaet: b.kritikalitaet, plan: nfHatPlan(kachel) }; })
    .sort((a, b) => (_nfSortZahl(a.rto) - _nfSortZahl(b.rto)) || (rang[a.kritikalitaet] - rang[b.kritikalitaet])
      || String(a.kachel.name).localeCompare(String(b.kachel.name), 'de'));
}

/**
 * Die Eskalationsleiter eines Prozesses – aus seinen eigenen Zahlen:
 * bis RTO Störung, ab RTO Notfall, ab MTPD Krise. Leer ohne RTO.
 * @returns {{nr:number, ab:number|'', bis:number|''}[]}
 */
function nfEskalationVon(k) {
  const b = nfBcmVon(k);
  if (b.rto === '' || b.kritikalitaet === 'niedrig' || !b.kritikalitaet) return [];
  const out = [{ nr: 1, ab: 0, bis: b.rto }, { nr: 2, ab: b.rto, bis: b.mtpd }];
  if (b.mtpd !== '') out.push({ nr: 3, ab: b.mtpd, bis: '' });
  return out;
}

/** Dieselbe Leiter als Satz: „bis 4 h Störung · ab 4 h Notfall · ab 1 Tag Krise". */
function nfEskalationText(k) {
  const l = nfEskalationVon(k);
  if (!l.length) return '';
  return l.map(x => `${x.nr === 1 ? 'bis' : 'ab'} ${nfDauerText(x.nr === 1 ? x.bis : x.ab)} ${nfStufe(x.nr).label}`).join(' · ');
}

/**
 * Welche Stufe ist ein Asset-Ausfall? Gerechnet aus den betroffenen Prozessen,
 * ihrer RTO/MTPD und der Wiederherstellzeit des Assets:
 *   0  nichts hängt daran
 *   1  Störung – Prozesse betroffen, aber innerhalb ihrer RTO haltbar
 *   2  Notfall – ein kritischer Prozess reißt seine RTO
 *   3  Krise – MTPD eines kritischen Prozesses erreicht oder mehrere kritische betroffen
 * @returns {{nr:number, stufe:object, gruende:string[], betroffen:number}}
 */
function nfStufeBeiAusfall(daten, assetId, werke) {
  const liste = nfAusfall(daten, assetId, werke);
  const ar = nfAssetRto(daten)[String(assetId || '')];
  const r = ar ? _nfZahl(ar.rto) : null;
  const gruende = [];
  if (!liste.length) return { nr: 0, stufe: nfStufe(0), gruende: ['Kein Prozess hängt an diesem Asset.'], betroffen: 0 };
  let nr = 1;
  const krit = liste.filter(x => x.kritikalitaet === 'hoch');
  for (const x of krit) {
    const b = nfBcmVon(x.kachel);
    const name = x.kachel.name;
    if (r !== null && b.mtpd !== '' && r >= Number(b.mtpd)) {
      nr = 3; gruende.push(`„${name}" wäre länger weg als seine MTPD (${nfDauerText(b.mtpd)}) – das Asset braucht ${nfDauerText(r)}.`);
    } else if (r !== null && b.rto !== '' && r > Number(b.rto)) {
      nr = Math.max(nr, 2); gruende.push(`„${name}" reißt seine RTO (${nfDauerText(b.rto)}) – das Asset braucht ${nfDauerText(r)}.`);
    } else if (r === null && b.rto !== '') {
      gruende.push(`Notfall, sobald „${name}" länger als ${nfDauerText(b.rto)} steht – Wiederherstellzeit des Assets nicht gepflegt.`);
    } else if (r !== null && b.rto !== '') {
      gruende.push(`„${name}" hält: RTO ${nfDauerText(b.rto)}, Wiederherstellung ${nfDauerText(r)}.`);
    }
  }
  if (krit.length >= 2) { nr = 3; gruende.push(`${krit.length} kritische Prozesse hängen daran – mehr als eine Störung.`); }
  if (nr === 1) gruende.unshift(`${liste.length} Prozess(e) betroffen, Notbetrieb laut Plan.`);
  return { nr, stufe: nfStufe(nr), gruende, betroffen: liste.length };
}

/**
 * Welche Assets tragen wie viele Prozesse? Ein Asset unter mehreren kritischen
 * Prozessen ist der Single Point of Failure, den niemand so genannt hat.
 */
function nfAssetTraeger(daten, werke) {
  const map = new Map();
  for (const { werk, kachel } of nfAlleKacheln(daten, werke)) {
    const b = nfBcmVon(kachel);
    for (const a of b.assets) {
      if (!map.has(a.id)) map.set(a.id, { id: a.id, title: a.title, werke: [], prozesse: [], kritisch: 0 });
      const e = map.get(a.id);
      e.prozesse.push({ werk, id: kachel.id, name: kachel.name, kritikalitaet: b.kritikalitaet, rto: b.rto });
      if (b.kritikalitaet === 'hoch') e.kritisch++;
      if (!e.title && a.title) e.title = a.title;
      if (!e.werke.length && a.werke.length) e.werke = a.werke.slice();
    }
  }
  return [...map.values()].sort((a, b) => (b.kritisch - a.kritisch) || (b.prozesse.length - a.prozesse.length)
    || String(a.title).localeCompare(String(b.title), 'de'));
}

/**
 * Kennzahlen für Cockpit und Audit Report.
 * @param {object} daten        Landkarte-Datenobjekt
 * @param {Array}  uebungen     Einträge des Wirksamkeits-Registers (alle Arten; gefiltert wird hier)
 * @param {string[]} [werke]    sichtbare Werke (Trennung nach Gesellschaft); null = alle
 * @param {string[]} [standorte] Werke, die einen Krisenstab haben müssen. Ohne Angabe:
 *                              die Werke, die Kacheln haben (Rückfall, wenn STANDORTE unbekannt ist)
 */
function nfKennzahlen(daten, uebungen, werke, standorte) {
  const alle = nfAlleKacheln(daten, werke);
  const assetRto = nfAssetRto(daten);
  const karten = (daten && daten.karten) || {};
  const z = { prozesse: alle.length, bewertet: 0, kritisch: 0, mitPlan: 0, ohnePlan: 0, geuebt: 0, ungeuebt: 0,
    ohneAssets: 0, rtoKonflikte: 0, fehler: 0, hinweise: 0, werke: 0, stabOk: 0, stabLuecken: 0, stabFehlt: 0,
    offen: [], stabOffen: [] };
  for (const { werk, kachel } of alle) {
    const b = nfBcmVon(kachel);
    if (b.kritikalitaet) z.bewertet++;
    const p = nfPruefung(kachel, { assetRto, uebungen, werk });
    z.fehler += p.fehler.length;
    z.hinweise += p.hinweise.length;
    if (p.fehler.length) z.offen.push({ werk, id: kachel.id, name: kachel.name, fehler: p.fehler });
    if (b.kritikalitaet !== 'hoch') continue;
    z.kritisch++;
    if (nfHatPlan(kachel)) {
      z.mitPlan++;
      const letzte = nfLetzteUebung(uebungen, werk, kachel.id);
      if (letzte && !nfUebungFaellig(letzte)) z.geuebt++; else z.ungeuebt++;
    } else z.ohnePlan++;
    if (!b.assets.length) z.ohneAssets++;
    if (p.rtoKonflikt) z.rtoKonflikte++;
  }
  // Der Krisenstab: je Standort, ob mit oder ohne Landkarte.
  const pflicht = Array.isArray(standorte) ? standorte.filter(w => !Array.isArray(werke) || werke.includes(w))
    : Object.keys(karten).filter(w => (!Array.isArray(werke) || werke.includes(w))
        && Array.isArray(karten[w].kacheln) && karten[w].kacheln.length);
  for (const w of pflicht) {
    z.werke++;
    const stab = karten[w] && karten[w].krisenstab;
    const lu = nfStabLuecken(stab || null);
    if (!stab) { z.stabFehlt++; z.stabOffen.push({ werk: w, fehlt: true, luecken: lu }); }
    else if (lu.length) { z.stabLuecken++; z.stabOffen.push({ werk: w, fehlt: false, luecken: lu }); }
    else z.stabOk++;
  }
  return z;
}

/* ── Der Druck: Notfallhandbuch, Alarmkarte, einzelner Plan ──
   Eine Web-App, die eine Anmeldung braucht, ist im Ernstfall vielleicht selbst
   das, was nicht geht. Deshalb gehört das hier ausgedruckt in die Schublade. */

function _nfEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _nfAbsatz(t) { return _nfEsc(t).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''); }
function _nfTag(iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '–'; }

const _NF_DRUCK_CSS = `
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:24px;font-size:12px;line-height:1.45}
  h1{font-size:22px;margin:0 0 2px} h2{font-size:16px;margin:22px 0 6px;border-bottom:2px solid #17509e;padding-bottom:3px;color:#17509e}
  h3{font-size:13px;margin:14px 0 4px} .muted{color:#6b7280} p{margin:0 0 6px}
  table{border-collapse:collapse;width:100%;margin:6px 0 10px} th,td{border:1px solid #d1d5db;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#1a2644;color:#fff;font-size:11px} .k-hoch{color:#b91c1c;font-weight:700} .k-mittel{color:#b45309;font-weight:700} .k-niedrig{color:#15803d}
  .kasten{border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;margin:6px 0;background:#f9fafb}
  .warn{border-left:4px solid #b45309;background:#fffbeb;padding:8px 10px;margin:8px 0}
  .deck{border:3px solid #17509e;padding:28px;margin:0 0 20px} .deck h1{font-size:28px} .gross{font-size:18px;font-weight:700}
  .kontakt{font-size:14px} .kontakt td{padding:7px 8px} .nr{font-family:Consolas,monospace;font-size:14px;white-space:nowrap}
  .noprint{margin:14px 0} .seite{page-break-before:always}
  @media print{.noprint{display:none} body{margin:12px} thead{display:table-header-group} tr,h1,h2,h3,.kasten{break-inside:avoid;page-break-inside:avoid} h1,h2,h3{break-after:avoid;page-break-after:avoid}}`;

const _NF_DRUCKKNOPF = `<div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>`;

/** Die Krisenstab-Abschnitte – gemeinsam für Handbuch und Alarmkarte. */
function _nfStabAbschnitte(stab, opt) {
  const st = nfStabVon(stab);
  const lu = nfStabLuecken(stab);
  const name = (opt && opt.personName) ? opt.personName : (x) => x;
  const nummer = (m) => [m.telefon, m.mobil].filter(Boolean).map(n => `<span class="nr">${_nfEsc(n)}</span>`).join('<br>') || '–';
  const mit = st.mitglieder.length ? `<table class="kontakt"><thead><tr><th>Rolle</th><th>Name</th><th>Telefon</th><th>Vertretung</th><th>Telefon</th></tr></thead><tbody>${
    st.mitglieder.map(m => `<tr><td><b>${_nfEsc(m.rolle)}</b></td><td>${_nfEsc(name(m.name)) || '<span class="muted">nicht benannt</span>'}</td><td>${nummer(m)}</td><td>${_nfEsc(name(m.vertretung)) || '–'}</td><td>${m.vertretungTelefon ? `<span class="nr">${_nfEsc(m.vertretungTelefon)}</span>` : '–'}</td></tr>`).join('')
  }</tbody></table>` : '<p class="muted">Keine Mitglieder eingetragen.</p>';
  // Die Eskalationsmatrix: die festen Stufen aus dem Modell, je Stufe das,
  // was das Werk dazu gesagt hat – wer sie ausruft, wen er alarmiert.
  const zeilen = nfAlarmierungVollstaendig(st.alarmierung);
  const alarm = `<table><thead><tr><th>Stufe</th><th>Wann</th><th>Wer ruft sie aus</th><th>Wer wird alarmiert</th><th>Mittel</th><th>Meldepflicht</th></tr></thead><tbody>${
    zeilen.map(a => { const v = nfStufe(a.nr) || {};
      return `<tr><td style="white-space:nowrap;color:${v.farbe || '#111827'}"><b>${_nfEsc(a.stufe)}</b></td><td>${_nfEsc(a.ausloeser)}</td><td>${_nfEsc(a.wer) || '<span class="muted">niemand benannt</span>'}</td><td>${_nfEsc(a.tut)}</td><td>${_nfEsc(v.mittel || '')}</td><td>${_nfEsc(v.meldepflicht || '')}</td></tr>`; }).join('')
  }</tbody></table>`;
  const ext = st.externe.length ? `<table class="kontakt"><thead><tr><th>Stelle</th><th>Telefon</th><th>Hinweis</th></tr></thead><tbody>${
    st.externe.map(e => `<tr><td>${_nfEsc(e.wer)}</td><td><span class="nr">${_nfEsc(e.telefon) || '–'}</span></td><td>${_nfEsc(e.hinweis)}</td></tr>`).join('')
  }</tbody></table>` : '';
  return `
    ${lu.length ? `<div class="warn"><b>Lücken im Krisenstab (${lu.length}):</b> ${lu.map(_nfEsc).join(' · ')}</div>` : ''}
    <h3>Krisenstab</h3>${mit}
    <h3>Eskalationsstufen – wer ruft wann wen?</h3>${alarm}
    <div class="kasten"><b>Treffpunkt:</b> ${_nfEsc(st.treffpunkt) || '<span class="muted">nicht festgelegt</span>'}
      ${st.treffpunktErsatz ? ` &nbsp;·&nbsp; <b>Ersatz:</b> ${_nfEsc(st.treffpunktErsatz)}` : ''}<br>
      <b>Kommunikation:</b> ${_nfEsc(st.kanal) || '<span class="muted">nicht festgelegt</span>'}
      ${st.kanalErsatz ? ` &nbsp;·&nbsp; <b>Ersatz:</b> ${_nfEsc(st.kanalErsatz)}` : ''}
      ${st.hinweis ? `<br>${_nfEsc(st.hinweis)}` : ''}</div>
    ${ext ? `<h3>Externe Stellen</h3>${ext}` : ''}`;
}

/** Ein einzelner Notfallplan als Abschnitt. */
function _nfPlanAbschnitt(werk, k, opt) {
  const b = nfBcmVon(k);
  const p = b.plan;
  const o = opt || {};
  const name = o.personName || ((x) => x);
  const letzte = nfLetzteUebung(o.uebungen, werk, k.id);
  const pr = nfPruefung(k, { assetRto: o.assetRto, uebungen: o.uebungen, werk });
  const kr = NF_KRITIKALITAET[b.kritikalitaet];
  const zeit = (v) => v === '' ? '<span class="muted">–</span>' : `<b>${_nfEsc(nfDauerText(v))}</b>`;
  return `
    <h2>${_nfEsc(k.name)}${k.unter ? ` <span class="muted" style="font-weight:400;font-size:12px">– ${_nfEsc(k.unter)}</span>` : ''}</h2>
    <table><tbody>
      <tr><th style="width:22%">Kritikalität</th><td class="k-${b.kritikalitaet || 'niedrig'}">${kr ? _nfEsc(kr.label) : 'nicht bewertet'}</td>
          <th style="width:22%">Verantwortlich</th><td>${_nfEsc(name(p.verantwortlich || k.verantwortlich || '')) || '–'}${k.vertretung ? ` <span class="muted">· Vertretung ${_nfEsc(name(k.vertretung))}</span>` : ''}</td></tr>
      <tr><th>MTPD / RTO / RPO</th><td>${zeit(b.mtpd)} / ${zeit(b.rto)} / ${zeit(b.rpo)}${nfEskalationText(k) ? `<br><span class="muted">Eskalation: ${_nfEsc(nfEskalationText(k))}</span>` : ''}</td>
          <th>Stand</th><td>BIA ${_nfTag(b.standAm)} · Plan ${_nfTag(p.standAm)} · zuletzt geübt ${letzte ? _nfTag(letzte.datum) + (letzte.uebungsart && NF_UEBUNGSARTEN[letzte.uebungsart] ? ` (${_nfEsc(NF_UEBUNGSARTEN[letzte.uebungsart].label)})` : '') : '<span class="k-hoch">nie</span>'}</td></tr>
      ${b.auswirkung ? `<tr><th>Auswirkung bei Ausfall</th><td colspan="3">${_nfEsc(b.auswirkung)}</td></tr>` : ''}
      <tr><th>Abhängig von</th><td colspan="3">${b.assets.length ? b.assets.map(a => {
        const r = o.assetRto && o.assetRto[a.id] && _nfZahl(o.assetRto[a.id].rto);
        return `${_nfEsc(a.title)}${a.werke.length ? ` <span class="muted">[${_nfEsc(a.werke.join(', '))}]</span>` : ''}${r !== null && r !== undefined ? ` <span class="muted">(Wiederherstellung ${_nfEsc(nfDauerText(r))})</span>` : ''}`;
      }).join(' · ') : '<span class="muted">keine Assets zugeordnet</span>'}</td></tr>
    </tbody></table>
    ${pr.fehler.length ? `<div class="warn"><b>Lücken (${pr.fehler.length}):</b> ${pr.fehler.map(_nfEsc).join(' · ')}</div>` : ''}
    ${NF_PLAN_TEILE.map(t => `<h3>${_nfEsc(t.titel)}</h3>${String(p[t.id] || '').trim() ? _nfAbsatz(p[t.id]) : '<p class="muted">– nicht beschrieben –</p>'}`).join('')}
    <h3>Kontakte</h3>
    ${p.kontakte.length ? `<table class="kontakt"><thead><tr><th>Rolle</th><th>Name</th><th>Telefon</th></tr></thead><tbody>${
      p.kontakte.map(x => `<tr><td>${_nfEsc(x.rolle)}</td><td>${_nfEsc(name(x.name))}</td><td><span class="nr">${_nfEsc(x.telefon) || '–'}</span></td></tr>`).join('')
    }</tbody></table>` : '<p class="muted">Keine Kontakte hinterlegt.</p>'}`;
}

/**
 * Das Notfallhandbuch eines Werks: Deckblatt, Krisenstab, kritische Prozesse
 * nach RTO, je Prozess der Plan, Asset-Ausfallmatrix.
 * @param {object} o { werk, werkLabel, karte, stab, assetRto, uebungen, personName, stand, nurKachel }
 */
function nfHandbuchHtml(o) {
  const werk = o.werk, karte = o.karte || {};
  const kacheln = (Array.isArray(karte.kacheln) ? karte.kacheln : []).filter(k => !o.nurKachel || k.id === o.nurKachel);
  const bewertet = kacheln.filter(k => nfBcmVon(k).kritikalitaet && nfBcmVon(k).kritikalitaet !== 'niedrig');
  const nachRto = bewertet.slice().sort((a, b) =>
    (_nfSortZahl(nfBcmVon(a).rto) - _nfSortZahl(nfBcmVon(b).rto)) || String(a.name).localeCompare(String(b.name), 'de'));
  const stand = o.stand || new Date().toLocaleString('de-DE');
  const titel = o.nurKachel ? `Notfallplan „${(kacheln[0] || {}).name || ''}"` : 'Notfallhandbuch';
  const name = o.personName || ((x) => x);
  const zeit = (v) => v === '' ? '–' : _nfEsc(nfDauerText(v));

  const uebersicht = nachRto.length ? `<table><thead><tr><th>Prozess</th><th>Kritikalität</th><th>MTPD</th><th>RTO</th><th>RPO</th><th>Verantwortlich</th><th>Assets</th><th>Plan</th><th>Zuletzt geübt</th></tr></thead><tbody>${
    nachRto.map(k => { const b = nfBcmVon(k); const l = nfLetzteUebung(o.uebungen, werk, k.id);
      return `<tr><td><b>${_nfEsc(k.name)}</b></td><td class="k-${b.kritikalitaet}">${_nfEsc(NF_KRITIKALITAET[b.kritikalitaet].label)}</td><td>${zeit(b.mtpd)}</td><td>${zeit(b.rto)}</td><td>${zeit(b.rpo)}</td><td>${_nfEsc(name(b.plan.verantwortlich || k.verantwortlich || '')) || '–'}</td><td>${b.assets.length}</td><td>${nfHatPlan(k) ? '✓' : '<span class="k-hoch">fehlt</span>'}</td><td>${l ? _nfTag(l.datum) : '<span class="k-hoch">nie</span>'}</td></tr>`; }).join('')
  }</tbody></table>` : '<p class="muted">Kein Prozess mit Kritikalität hoch oder mittel bewertet.</p>';

  const traeger = nfAssetTraeger({ karten: { [werk]: karte } }).filter(t => !o.nurKachel || t.prozesse.some(p => p.id === o.nurKachel));
  const matrix = traeger.length ? `<table><thead><tr><th>Asset</th><th>Wiederherstellung</th><th>Trägt Prozesse (nach RTO)</th></tr></thead><tbody>${
    traeger.map(t => { const r = o.assetRto && o.assetRto[t.id] && _nfZahl(o.assetRto[t.id].rto);
      const pr = t.prozesse.slice().sort((a, b) => _nfSortZahl(a.rto) - _nfSortZahl(b.rto));
      return `<tr><td><b>${_nfEsc(t.title)}</b>${t.werke.length ? ` <span class="muted">[${_nfEsc(t.werke.join(', '))}]</span>` : ''}${t.kritisch > 1 ? ` <span class="k-hoch">⚠ ${t.kritisch} kritische</span>` : ''}</td><td>${r !== null && r !== undefined ? _nfEsc(nfDauerText(r)) : '–'}</td><td>${
        pr.map(p => `${_nfEsc(p.name)}${p.rto !== '' ? ` (${_nfEsc(nfDauerText(p.rto))})` : ''}`).join(' → ')}</td></tr>`; }).join('')
  }</tbody></table>` : '';

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${_nfEsc(titel)} ${_nfEsc(o.werkLabel || werk)}</title><style>${_NF_DRUCK_CSS}</style></head><body>
    ${_NF_DRUCKKNOPF}
    <div class="deck">
      <div class="muted">DIHAG · ${_nfEsc(o.werkLabel || werk)}</div>
      <h1>${_nfEsc(titel)}</h1>
      <div class="gross">Stand ${_nfEsc(stand)}</div>
      <p class="muted" style="margin-top:14px">ISO/IEC 27001:2022 A.5.29, A.5.30 · ISO 22301 · BSI-Standard 200-4 · NIS2 Art. 21 (2c).
        Dieser Ausdruck ist die Fassung für den Fall, dass nichts anderes mehr geht. Er gehört an einen Ort, den der
        Krisenstab ohne Strom, Netz und Anmeldung erreicht. Die App-Fassung ist die aktuellere.</p>
      ${o.nurKachel ? '' : `<p><b>Im Ernstfall:</b> Erst Menschen, dann Alarmierung (Abschnitt 1), dann die Prozesse in der Reihenfolge des Abschnitts 2 – das mit der kürzesten RTO zuerst.</p>`}
    </div>
    ${o.nurKachel ? '' : `<h2>1 · Krisenstab und Alarmierung</h2>${_nfStabAbschnitte(o.stab, { personName: name })}
    <h2 class="seite">2 · Kritische Prozesse – nach Wiederanlaufzeit</h2>${uebersicht}
    ${matrix ? `<h3>Wovon sie abhängen</h3>${matrix}` : ''}
    <h2 class="seite">3 · Die Notfallpläne</h2>`}
    ${(o.nurKachel ? kacheln : nachRto).map(k => _nfPlanAbschnitt(werk, k, { personName: name, assetRto: o.assetRto, uebungen: o.uebungen })).join('')}
    ${!o.nurKachel && !nachRto.length ? '<p class="muted">Keine Pläne – erst die Business-Impact-Analyse, dann der Plan.</p>' : ''}
    <p class="muted" style="margin-top:18px">Erstellt aus dem DIHAG-Richtlinienmanagement (rms.dihag.de), Reiter „Notfall &amp; Krisenstab" – deterministisch, ohne KI.</p>
    </body></html>`;
}

/** Die Alarmkarte: eine Seite, wen man anruft. Zum Aushängen. */
function nfAlarmkarteHtml(o) {
  const stand = o.stand || new Date().toLocaleDateString('de-DE');
  const karte = o.karte || {};
  const kritisch = (Array.isArray(karte.kacheln) ? karte.kacheln : []).filter(nfIstKritisch)
    .sort((a, b) => _nfSortZahl(nfBcmVon(a).rto) - _nfSortZahl(nfBcmVon(b).rto));
  const name = o.personName || ((x) => x);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Alarmkarte ${_nfEsc(o.werkLabel || o.werk)}</title><style>${_NF_DRUCK_CSS}
    body{font-size:13px} h1{font-size:24px;color:#b91c1c}</style></head><body>
    ${_NF_DRUCKKNOPF}
    <h1>🚨 Alarmkarte ${_nfEsc(o.werkLabel || o.werk)}</h1>
    <div class="muted">Stand ${_nfEsc(stand)} · Aushängen: Pforte, Leitstand, Serverraum, Krisenstab-Raum</div>
    ${_nfStabAbschnitte(o.stab, { personName: name })}
    ${kritisch.length ? `<h3>Kritische Prozesse – wer ist zuständig?</h3><table class="kontakt"><thead><tr><th>Prozess</th><th>RTO</th><th>Verantwortlich</th><th>Erster Kontakt laut Plan</th></tr></thead><tbody>${
      kritisch.map(k => { const b = nfBcmVon(k); const e = b.plan.kontakte[0];
        return `<tr><td><b>${_nfEsc(k.name)}</b></td><td>${b.rto === '' ? '–' : _nfEsc(nfDauerText(b.rto))}</td><td>${_nfEsc(name(b.plan.verantwortlich || k.verantwortlich || '')) || '–'}</td><td>${e ? `${_nfEsc(e.rolle)} ${_nfEsc(name(e.name))} <span class="nr">${_nfEsc(e.telefon)}</span>` : '–'}</td></tr>`; }).join('')
    }</tbody></table>` : ''}
    </body></html>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NF_KRITIKALITAET, NF_PLAN_TEILE, NF_UEBUNGSARTEN, NF_STAB_ROLLEN, NF_STAB_EXTERNE,
    NF_UEBUNG_MONATE, NF_STAB_MONATE, nfDauerText, nfDauerStunden, nfDauerEingabe, nfBcmVon, nfPlanVon,
    nfIstKritisch, nfIstBewertet, nfHatPlan, nfZiel, nfUebungenZu, nfLetzteUebung, nfUebungFaellig, nfPruefung,
    nfAssetPasst, nfAssetFremd, nfAssetSichtbar,
    NF_STUFEN, nfStufe, nfAlarmierungVorlage, nfAlarmierungVollstaendig, nfEskalationVon, nfEskalationText, nfStufeBeiAusfall,
    nfStabVon, nfStabVorlage, nfStabLuecken, nfSichtbareWerke, nfPflichtWerke, _nfSortZahl, nfAlleKacheln, nfAssetRto, nfAusfall, nfAssetTraeger, nfKennzahlen,
    nfHandbuchHtml, nfAlarmkarteHtml };
}
