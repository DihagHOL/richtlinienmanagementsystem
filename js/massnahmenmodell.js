'use strict';

/**
 * Maßnahmen: das Modell (ohne DOM, ohne SharePoint)
 * =================================================
 * Maßnahmen entstanden bisher an vier Stellen: in der Risikobehandlung, an
 * Abweichungen, in der Managementbewertung und nach Notfallübungen. Jede Stelle
 * führte ihre eigene kleine Liste. Die Frage aus dem Audit, „welche Maßnahmen
 * laufen gerade, wer ist dran, was ist überfällig?", ließ sich nur beantworten,
 * indem man alle Register nacheinander öffnete. Und für Maßnahmen ohne solche
 * Herkunft (aus einem externen Audit, aus der Zieleplanung, aus einer Begehung)
 * gab es gar keinen Ort.
 *
 * Jetzt gibt es eine Liste „Massnahmen" für die eigenen und eine Gesamtsicht,
 * die alle zusammenführt. Die Maßnahmen aus Risiken und Wirksamkeit bleiben
 * dort, wo sie entstanden sind; die Gesamtsicht zeigt sie nur und führt zum
 * Ursprung. Zwei Orte für dieselbe Maßnahme wären zwei Wahrheiten.
 *
 * Die Kategorien folgen dem „Maßnahmenplan IMS" des Hauses (Bereich des IMS,
 * Bewertung NA / V / E, Priorität, Sofort- und Korrekturmaßnahme, Kapitel,
 * Wirksamkeitsprüfung, Nachweis), dazu die vier Themen der ISO 27002:2022.
 */

/** Bereich des IMS wie im Maßnahmenplan, um die Managementsysteme der Werke erweitert. */
const MN_BEREICHE = [
  { key: 'isms',          label: 'Informationssicherheit',        norm: 'ISO/IEC 27001' },
  { key: 'qualitaet',     label: 'Qualität',                      norm: 'ISO 9001 / IATF 16949' },
  { key: 'umwelt',        label: 'Umwelt',                        norm: 'ISO 14001' },
  { key: 'energie',       label: 'Energie',                       norm: 'ISO 50001' },
  { key: 'arbeitsschutz', label: 'Arbeits- und Gesundheitsschutz', norm: 'ISO 45001' },
  { key: 'compliance',    label: 'Compliance',                    norm: 'ISO 37301' },
  { key: 'datenschutz',   label: 'Datenschutz',                   norm: 'DSGVO' },
  { key: 'ims',           label: 'IMS übergreifend',              norm: '' },
];

/** Woher eine Maßnahme kommt. Die ersten vier entstehen in anderen Registern. */
const MN_QUELLEN = [
  { key: 'risiko',       label: 'Risikobehandlung',        norm: 'ISO 27001 6.1.3 · 8.3' },
  { key: 'abweichung',   label: 'Abweichung / Korrektur',  norm: 'ISO 27001 10.2' },
  { key: 'bewertung',    label: 'Managementbewertung',     norm: 'ISO 27001 9.3' },
  { key: 'uebung',       label: 'Notfallübung',            norm: 'ISO 27001 A.5.30' },
  { key: 'audit_intern', label: 'Internes Audit',          norm: 'ISO 27001 9.2' },
  { key: 'audit_extern', label: 'Externes Audit',          norm: '' },
  { key: 'ziel',         label: 'Zielerreichung',          norm: 'ISO 27001 6.2' },
  { key: 'vorfall',      label: 'Sicherheitsvorfall',      norm: 'ISO 27001 A.5.26 · A.5.27' },
  { key: 'pruefung',     label: 'Funktionsprüfung',        norm: 'ISO 27001 A.8.29 · A.8.32' },
  { key: 'kennzahl',     label: 'Kennzahl / Messung',      norm: 'ISO 27001 9.1' },
  { key: 'ausnahme',     label: 'Ausnahme',                norm: 'ISO 27001 A.5.36' },
  { key: 'recht',        label: 'Gesetz / Vertrag',        norm: 'ISO 27001 A.5.31' },
  { key: 'verbesserung', label: 'Verbesserungsvorschlag',  norm: 'ISO 27001 10.1' },
  { key: 'sonstige',     label: 'Sonstige',                norm: '' },
];

/** Bewertung der Feststellung: die Spalte „NA / V / E" des Maßnahmenplans. */
const MN_BEWERTUNG = [
  { key: 'NA', label: 'Nichtkonformität (NA)' },
  { key: 'V',  label: 'Verbesserung (V)' },
  { key: 'E',  label: 'Empfehlung (E)' },
];

/** Art der Maßnahme. */
const MN_ARTEN = [
  { key: 'sofort',       label: 'Sofortmaßnahme' },
  { key: 'korrektur',    label: 'Korrekturmaßnahme' },
  { key: 'vorbeugung',   label: 'Vorbeugemaßnahme' },
  { key: 'verbesserung', label: 'Verbesserung' },
];

/** Die vier Themen der ISO 27002:2022, dieselbe Ordnung wie Anhang A. */
const MN_KATEGORIEN = [
  { key: 'organisatorisch', label: 'Organisatorisch', annex: 'A.5' },
  { key: 'personell',       label: 'Personell',       annex: 'A.6' },
  { key: 'physisch',        label: 'Physisch',        annex: 'A.7' },
  { key: 'technologisch',   label: 'Technologisch',   annex: 'A.8' },
];

const MN_PRIO = [
  { key: 'hoch',    label: 'hoch',    rang: 0 },
  { key: 'mittel',  label: 'mittel',  rang: 1 },
  { key: 'niedrig', label: 'niedrig', rang: 2 },
];

const MN_STATUS = ['offen', 'in Umsetzung', 'erledigt', 'verworfen'];

/** Nach welchem Merkmal die Gesamtsicht gruppiert. */
const MN_GRUPPIERUNG = [
  { key: 'quelle',         label: 'Quelle' },
  { key: 'bereich',        label: 'Bereich des IMS' },
  { key: 'kategorie',      label: 'Kategorie (ISO 27002)' },
  { key: 'bewertung',      label: 'Bewertung (NA / V / E)' },
  { key: 'art',            label: 'Art' },
  { key: 'prioritaet',     label: 'Priorität' },
  { key: 'status',         label: 'Status' },
  { key: 'verantwortlich', label: 'Verantwortlich' },
];

const _mnInfo = (liste, key) => liste.find(x => x.key === key) || null;
function mnBereichInfo(k)   { return _mnInfo(MN_BEREICHE, k); }
function mnQuelleInfo(k)    { return _mnInfo(MN_QUELLEN, k); }
function mnBewertungInfo(k) { return _mnInfo(MN_BEWERTUNG, k); }
function mnArtInfo(k)       { return _mnInfo(MN_ARTEN, k); }
function mnKategorieInfo(k) { return _mnInfo(MN_KATEGORIEN, k); }
function mnPrioInfo(k)      { return _mnInfo(MN_PRIO, k); }

function mnHeute(d) { return (d ? new Date(d) : new Date()).toISOString().slice(0, 10); }
const _mnText = (v) => String(v == null ? '' : v).trim();
const _mnTag = (v) => { const t = _mnText(v).slice(0, 10); return /^\d{4}-\d\d-\d\d$/.test(t) ? t : ''; };

/** Eine eigene Maßnahme bereinigen: unbekannte Schlüssel fallen weg, Listen sind Listen. */
function mnNormal(m) {
  const x = m || {};
  const wahl = (liste, k, def) => (_mnInfo(liste, k) ? k : def);
  return {
    id: x.id ? String(x.id) : null,
    nr: _mnText(x.nr), titel: _mnText(x.titel), beschreibung: _mnText(x.beschreibung),
    bereich: wahl(MN_BEREICHE, x.bereich, 'isms'),
    quelle: wahl(MN_QUELLEN, x.quelle, 'sonstige'),
    bewertung: wahl(MN_BEWERTUNG, x.bewertung, ''),
    art: wahl(MN_ARTEN, x.art, ''),
    kategorie: wahl(MN_KATEGORIEN, x.kategorie, ''),
    prioritaet: wahl(MN_PRIO, x.prioritaet, 'mittel'),
    normbezug: _mnText(x.normbezug), zielDerMassnahme: _mnText(x.zielDerMassnahme), ursache: _mnText(x.ursache),
    verantwortlich: _mnText(x.verantwortlich), termin: _mnTag(x.termin),
    status: MN_STATUS.includes(x.status) ? x.status : 'offen',
    statusGeprueftAm: _mnTag(x.statusGeprueftAm),
    kostenPlan: x.kostenPlan === '' || x.kostenPlan == null ? '' : x.kostenPlan,
    kostenIst: x.kostenIst === '' || x.kostenIst == null ? '' : x.kostenIst,
    messung: _mnText(x.messung), ressourcen: _mnText(x.ressourcen),
    wirksamkeit: _mnText(x.wirksamkeit), wirksamAm: _mnTag(x.wirksamAm),
    nachweis: _mnText(x.nachweis),
    werke: Array.isArray(x.werke) ? x.werke.map(_mnText).filter(Boolean) : [],
    zielId: _mnText(x.zielId), herkunftId: _mnText(x.herkunftId),
    historie: Array.isArray(x.historie) ? x.historie : [],
  };
}

/** Nächste laufende Nummer eines Jahres: M-2026-001, M-2026-002 … */
function mnNaechsteNr(eigene, jahr) {
  const j = String(jahr || new Date().getFullYear());
  const max = (eigene || []).reduce((n, m) => {
    const t = /^M-(\d{4})-(\d+)$/.exec(String(m && m.nr || ''));
    return (t && t[1] === j) ? Math.max(n, Number(t[2])) : n;
  }, 0);
  return `M-${j}-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Was einer eigenen Maßnahme fehlt, damit sie als Nachweis taugt.
 * Ohne Verantwortung und Termin ist eine Maßnahme ein Wunsch. Eine erledigte
 * Korrektur einer Nichtkonformität ist erst fertig, wenn jemand nachgesehen
 * hat, ob sie gewirkt hat (ISO 27001 10.2 f).
 */
function mnLuecken(m) {
  const x = mnNormal(m);
  const f = [];
  if (!x.titel) f.push('Bezeichnung fehlt.');
  if (x.status === 'verworfen') return f;
  if (!x.verantwortlich) f.push('Niemand ist verantwortlich.');
  if (!x.termin) f.push('Kein Termin für die Umsetzung.');
  if (x.status === 'erledigt') {
    if ((x.bewertung === 'NA' || x.art === 'korrektur') && !x.wirksamkeit) {
      f.push('Erledigt, aber die Wirksamkeit ist nicht geprüft. Bei einer Korrektur verlangt ISO 27001 10.2 beides.');
    }
  }
  return f;
}

/** Erledigt setzen geht nur ohne Lücken, sonst wäre „erledigt" eine Behauptung. */
function mnAbschlussfehler(m) {
  const x = mnNormal(Object.assign({}, m, { status: 'erledigt' }));
  return mnLuecken(x);
}

function mnUeberfaellig(e, heute) {
  const h = heute || mnHeute();
  return !!(e && e.termin && e.status !== 'erledigt' && e.status !== 'verworfen' && String(e.termin).slice(0, 10) < h);
}

/* ── Die Gesamtsicht: ein Eintrag je Maßnahme, gleich woher ── */

const _MN_RISIKO_KATEGORIE = {
  'Organisation': 'organisatorisch', 'Personal': 'personell', 'Technik / IT': 'technologisch',
  'Physisch / Umgebung': 'physisch', 'Lieferanten / Dienstleister': 'organisatorisch', 'Recht / Compliance': 'organisatorisch',
};

/** Stufe eines Risikos wie im Risiko-Register: Netto, wenn bewertet, sonst Brutto. */
function _mnRisikoPrio(r) {
  const n = r && r.netto, b = r && r.brutto;
  const w = (n && n.e && n.a) ? n : (b || {});
  const s = (Number(w.e) || 0) * (Number(w.a) || 0);
  return s >= 15 ? 'hoch' : s >= 8 ? 'mittel' : s > 0 ? 'niedrig' : 'mittel';
}

/** Die Maßnahmen der Risikobehandlung. */
function mnAusRisiken(risiken) {
  const out = [];
  (Array.isArray(risiken) ? risiken : []).forEach(r => (Array.isArray(r.massnahmen) ? r.massnahmen : []).forEach((m, i) => {
    if (!m || !_mnText(m.titel)) return;
    out.push({
      schluessel: `risiko:${r.id}:${i}`, herkunft: 'risiko', bezugId: String(r.id), bezugTitel: _mnText(r.titel),
      titel: _mnText(m.titel), verantwortlich: _mnText(m.verantwortlich), termin: _mnTag(m.frist),
      status: MN_STATUS.includes(m.status) ? m.status : 'offen',
      quelle: 'risiko', bereich: 'isms', bewertung: '', art: 'vorbeugung',
      kategorie: _MN_RISIKO_KATEGORIE[r.kategorie] || '', prioritaet: _mnRisikoPrio(r),
      normbezug: (Array.isArray(r.controls) ? r.controls : []).join(', '), werke: [], zielId: '',
    });
  }));
  return out;
}

/** Welche Quelle hat eine Maßnahme aus dem Register „Wirksamkeit"? */
function _mnWirkQuelle(w) {
  if (w.art === 'bewertung') return 'bewertung';
  if (w.art === 'uebung') return 'uebung';
  if (w.art === 'audit') return 'audit_intern';
  if (w.art === 'pruefung') return 'pruefung';
  if (String(w.herkunftId || '').startsWith('ticket:')) return 'vorfall';
  const q = String(w.quelle || '').toLowerCase();
  if (q.includes('externes audit')) return 'audit_extern';
  if (q.includes('internes audit')) return 'audit_intern';
  if (q.includes('übung')) return 'uebung';
  if (q.includes('funktionsprüfung')) return 'pruefung';
  if (q.includes('vorfall')) return 'vorfall';
  if (q.includes('ausnahme')) return 'ausnahme';
  if (q.includes('kennzahl')) return 'kennzahl';
  return 'abweichung';
}

/** Die Maßnahmen aus Abweichungen, Managementbewertungen und Übungen. */
function mnAusWirksamkeit(wirk) {
  const out = [];
  (Array.isArray(wirk) ? wirk : []).forEach(w => (Array.isArray(w.massnahmen) ? w.massnahmen : []).forEach((m, i) => {
    if (!m || !_mnText(m.titel)) return;
    const abw = w.art === 'abweichung';
    out.push({
      schluessel: `wirk:${w.id}:${i}`, herkunft: 'wirksamkeit', bezugId: String(w.id), bezugTitel: _mnText(w.titel),
      titel: _mnText(m.titel), verantwortlich: _mnText(m.verantwortlich), termin: _mnTag(m.frist),
      status: MN_STATUS.includes(m.status) ? m.status : 'offen',
      quelle: _mnWirkQuelle(w), bereich: 'isms', bewertung: abw ? 'NA' : '', art: abw ? 'korrektur' : 'verbesserung',
      kategorie: '', prioritaet: abw ? 'hoch' : 'mittel', normbezug: _mnText(w.normbezug),
      werke: Array.isArray(w.werke) ? w.werke : [], zielId: '',
    });
  }));
  return out;
}

/** Die eigenen Maßnahmen als Einträge der Gesamtsicht. */
function mnAusEigenen(eigene) {
  return (Array.isArray(eigene) ? eigene : []).map(x => {
    const m = mnNormal(x);
    return Object.assign({}, m, { schluessel: `mn:${m.id}`, herkunft: 'eigen', bezugId: m.id, bezugTitel: '' });
  });
}

/** Alles zusammen, das Dringende zuerst: überfällig, offen nach Priorität und Termin, dann erledigt. */
function mnAlle(eigene, risiken, wirk, heute) {
  const h = heute || mnHeute();
  const alle = mnAusEigenen(eigene).concat(mnAusRisiken(risiken), mnAusWirksamkeit(wirk));
  const rang = (e) => mnUeberfaellig(e, h) ? 0 : (e.status === 'offen' || e.status === 'in Umsetzung') ? 1 : e.status === 'erledigt' ? 2 : 3;
  return alle.sort((a, b) => (rang(a) - rang(b))
    || ((mnPrioInfo(a.prioritaet) || { rang: 9 }).rang - (mnPrioInfo(b.prioritaet) || { rang: 9 }).rang)
    || String(a.termin || '9999').localeCompare(String(b.termin || '9999'))
    || a.titel.localeCompare(b.titel, 'de'));
}

/** Filtern: q (Volltext), sowie je Merkmal ein Wert; ueberfaellig=true nur Überfälliges. */
function mnFiltern(liste, f, heute) {
  const g = f || {};
  const q = _mnText(g.q).toLowerCase();
  return (liste || []).filter(e => {
    if (q && !(`${e.nr || ''} ${e.titel} ${e.beschreibung || ''} ${e.verantwortlich} ${e.bezugTitel || ''} ${e.normbezug || ''}`).toLowerCase().includes(q)) return false;
    for (const k of ['quelle', 'bereich', 'kategorie', 'bewertung', 'art', 'prioritaet', 'status', 'herkunft']) {
      if (g[k] && e[k] !== g[k]) return false;
    }
    if (g.offen && (e.status === 'erledigt' || e.status === 'verworfen')) return false;
    if (g.werk && !(e.werke || []).includes(g.werk) && (e.werke || []).length) return false;
    if (g.ueberfaellig && !mnUeberfaellig(e, heute)) return false;
    if (g.zielId && e.zielId !== g.zielId) return false;
    return true;
  });
}

/** Beschriftung einer Gruppe. */
function mnGruppenLabel(nach, wert) {
  if (!wert) return nach === 'verantwortlich' ? 'ohne Verantwortliche' : 'ohne Angabe';
  const info = { quelle: mnQuelleInfo, bereich: mnBereichInfo, kategorie: mnKategorieInfo, bewertung: mnBewertungInfo,
    art: mnArtInfo, prioritaet: mnPrioInfo }[nach];
  return info ? ((info(wert) || {}).label || wert) : wert;
}

/** Nach einem Merkmal gruppieren, in der Reihenfolge der Kataloge. → [{ wert, label, eintraege }] */
function mnGruppieren(liste, nach) {
  const reihe = { quelle: MN_QUELLEN, bereich: MN_BEREICHE, kategorie: MN_KATEGORIEN, bewertung: MN_BEWERTUNG,
    art: MN_ARTEN, prioritaet: MN_PRIO }[nach];
  const map = new Map();
  (liste || []).forEach(e => {
    const w = String(e[nach] || '');
    if (!map.has(w)) map.set(w, []);
    map.get(w).push(e);
  });
  const ord = (w) => {
    if (!w) return 999;
    if (reihe) { const i = reihe.findIndex(x => x.key === w); return i < 0 ? 500 : i; }
    if (nach === 'status') { const i = MN_STATUS.indexOf(w); return i < 0 ? 500 : i; }
    return 0;
  };
  return [...map.entries()]
    .sort((a, b) => (ord(a[0]) - ord(b[0])) || a[0].localeCompare(b[0], 'de'))
    .map(([wert, eintraege]) => ({ wert, label: mnGruppenLabel(nach, wert), eintraege }));
}

/** Kennzahlen der Gesamtsicht. */
function mnKennzahlen(liste, heute) {
  const h = heute || mnHeute();
  const l = liste || [];
  const lebend = l.filter(e => e.status !== 'verworfen');
  const offen = lebend.filter(e => e.status !== 'erledigt');
  const zaehle = (feld) => {
    const o = {};
    lebend.forEach(e => { const k = e[feld] || ''; o[k] = (o[k] || 0) + 1; });
    return o;
  };
  return {
    gesamt: lebend.length,
    offen: offen.filter(e => e.status === 'offen').length,
    inUmsetzung: offen.filter(e => e.status === 'in Umsetzung').length,
    erledigt: lebend.filter(e => e.status === 'erledigt').length,
    ueberfaellig: offen.filter(e => mnUeberfaellig(e, h)).length,
    ohneVerantwortlich: offen.filter(e => !e.verantwortlich).length,
    ohneTermin: offen.filter(e => !e.termin).length,
    quote: lebend.length ? Math.round(lebend.filter(e => e.status === 'erledigt').length / lebend.length * 100) : 0,
    jeQuelle: zaehle('quelle'), jeBereich: zaehle('bereich'), jeKategorie: zaehle('kategorie'),
  };
}

/** Die Gesamtsicht als CSV (Semikolon, mit BOM für Excel). */
function mnCsv(liste, zielTitel) {
  const zt = typeof zielTitel === 'function' ? zielTitel : () => '';
  const kopf = ['Nr', 'Maßnahme', 'Herkunft', 'Bezug', 'Quelle', 'Bereich des IMS', 'Kategorie', 'Bewertung', 'Art', 'Priorität',
    'Normbezug', 'Verantwortlich', 'Termin', 'Status', 'Status geprüft am', 'Werke', 'Ziel', 'Kosten geplant', 'Kosten Ist',
    'Ursache', 'Messung', 'Ressourcen', 'Wirksamkeit', 'Wirksam am', 'Nachweis'];
  const zelle = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const herkunft = { eigen: 'Maßnahmenliste', risiko: 'Risiko-Register', wirksamkeit: 'Wirksamkeit & Verbesserung' };
  const zeilen = (liste || []).map(e => [
    e.nr || '', e.titel, herkunft[e.herkunft] || e.herkunft, e.bezugTitel || '', mnGruppenLabel('quelle', e.quelle),
    mnGruppenLabel('bereich', e.bereich), e.kategorie ? mnGruppenLabel('kategorie', e.kategorie) : '',
    e.bewertung ? mnGruppenLabel('bewertung', e.bewertung) : '', e.art ? mnGruppenLabel('art', e.art) : '',
    e.prioritaet || '', e.normbezug || '', e.verantwortlich || '', e.termin || '', e.status, e.statusGeprueftAm || '',
    (e.werke || []).join(' '), e.zielId ? zt(e.zielId) : '', e.kostenPlan == null ? '' : e.kostenPlan, e.kostenIst == null ? '' : e.kostenIst,
    e.ursache || '', e.messung || '', e.ressourcen || '', e.wirksamkeit || '', e.wirksamAm || '', e.nachweis || '',
  ].map(zelle).join(';'));
  return '﻿' + [kopf.map(zelle).join(';')].concat(zeilen).join('\r\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MN_BEREICHE, MN_QUELLEN, MN_BEWERTUNG, MN_ARTEN, MN_KATEGORIEN, MN_PRIO, MN_STATUS, MN_GRUPPIERUNG,
    mnBereichInfo, mnQuelleInfo, mnBewertungInfo, mnArtInfo, mnKategorieInfo, mnPrioInfo,
    mnNormal, mnNaechsteNr, mnLuecken, mnAbschlussfehler, mnUeberfaellig,
    mnAusRisiken, mnAusWirksamkeit, mnAusEigenen, mnAlle, mnFiltern, mnGruppenLabel, mnGruppieren, mnKennzahlen, mnCsv,
  };
}
