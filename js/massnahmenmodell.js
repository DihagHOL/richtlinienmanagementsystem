'use strict';

/**
 * Maßnahmen: das Modell (ohne DOM, ohne SharePoint)
 * =================================================
 * Die Maßnahmen des ISMS stehen in der Liste „Maßnahmen" auf der ISMS-Site,
 * die das Haus seit 2025 führt: Titel, Detailbeschreibung, „Entspringt aus"
 * (Externes Audit, Internes Audit, Management Review, Risikobehandlung,
 * Sicherheitsvorfall, Tests und Übungen, Zielemanagement), Status, Team,
 * Verantwortlich zur Umsetzung, geplante Umsetzung, Umsetzungsdatum,
 * Ressourcen und der Bezug auf die Controls der ISO/IEC 27001:2022.
 *
 * Daneben entstehen Maßnahmen in den Registern des RMS: in der
 * Risikobehandlung, an Abweichungen, in der Managementbewertung, nach
 * Notfallübungen. Die Gesamtsicht führt alle zusammen. Gepflegt wird jede dort,
 * wo sie steht; zwei Orte für dieselbe Maßnahme wären zwei Wahrheiten.
 *
 * Kategorisiert wird nach den Feldern der Liste. Das Thema nach ISO 27002
 * (organisatorisch, personell, physisch, technologisch) steht nicht in der
 * Liste, ergibt sich aber aus dem verknüpften Control: A.5.x ist organisatorisch.
 */

/** „Entspringt aus" – die Auswahl der Liste. „Sonstige" gibt es nur in der Gesamtsicht. */
const MN_QUELLEN = [
  { key: 'Risikobehandlung',   norm: 'ISO 27001 6.1.3 · 8.3' },
  { key: 'Internes Audit',     norm: 'ISO 27001 9.2' },
  { key: 'Externes Audit',     norm: '' },
  { key: 'Management Review',  norm: 'ISO 27001 9.3' },
  { key: 'Sicherheitsvorfall', norm: 'ISO 27001 A.5.26 · A.5.27' },
  { key: 'Tests und Übungen',  norm: 'ISO 27001 A.5.30 · A.8.29' },
  { key: 'Zielemanagement',    norm: 'ISO 27001 6.2' },
  { key: 'Sonstige',           norm: '', nurGesamtsicht: true },
].map(q => Object.assign({ label: q.key }, q));

/** Status: RMS-Schlüssel ↔ Auswahl der Liste. */
const MN_STATUS = [
  { key: 'offen',          label: 'Offen',          haus: 'Offen' },
  { key: 'in Umsetzung',   label: 'In Bearbeitung', haus: 'In Bearbeitung' },
  { key: 'zurückgestellt', label: 'Zurückgestellt', haus: 'Zurückgestellt' },
  { key: 'erledigt',       label: 'Abgeschlossen',  haus: 'Abgeschlossen' },
];

const MN_DURCHFUEHRUNG = ['Einmalig', 'Kontinuierlich'];
const MN_AUSWIRKUNG = ['Reduzierend', 'Transferierend', 'Keine'];

/** Die vier Themen der ISO 27002:2022, in der Ordnung von Anhang A. */
const MN_KATEGORIEN = [
  { key: 'organisatorisch', label: 'Organisatorisch', annex: 'A.5' },
  { key: 'personell',       label: 'Personell',       annex: 'A.6' },
  { key: 'physisch',        label: 'Physisch',        annex: 'A.7' },
  { key: 'technologisch',   label: 'Technologisch',   annex: 'A.8' },
];

/** Nach welchem Merkmal die Gesamtsicht kategorisiert. */
const MN_GRUPPIERUNG = [
  { key: 'quelle',         label: 'Entspringt aus' },
  { key: 'team',           label: 'Team' },
  { key: 'kategorie',      label: 'Thema (ISO 27002)' },
  { key: 'status',         label: 'Status' },
  { key: 'durchfuehrung',  label: 'Durchführung' },
  { key: 'verantwortlich', label: 'Verantwortlich' },
  { key: 'herkunft',       label: 'Register' },
];

const MN_HERKUNFT = {
  eigen:       { label: 'Liste „Maßnahmen"', kurz: 'ISMS-Liste' },
  risiko:      { label: 'Risiko-Register (RMS)', kurz: 'Risiko' },
  wirksamkeit: { label: 'Wirksamkeit & Verbesserung (RMS)', kurz: 'Wirksamkeit' },
};

function mnStatusInfo(k) { return MN_STATUS.find(s => s.key === k) || MN_STATUS[0]; }
function mnQuelleInfo(k) { return MN_QUELLEN.find(q => q.key === k) || null; }
function mnKategorieInfo(k) { return MN_KATEGORIEN.find(x => x.key === k) || null; }

function mnHeute(d) { return (d ? new Date(d) : new Date()).toISOString().slice(0, 10); }
// SharePoint setzt gern ein unsichtbares Leerzeichen (U+200B) an den Anfang eines Textfelds.
const _MN_ZWSP = String.fromCharCode(8203);
const _mnText = (v) => String(v == null ? '' : v).split(_MN_ZWSP).join('').trim();
const _mnTag = (v) => { const t = _mnText(v).slice(0, 10); return /^\d{4}-\d\d-\d\d$/.test(t) ? t : ''; };
const _mnListe = (v) => (Array.isArray(v) ? v.filter(x => x && (x.id || x.wert)).map(x => ({ id: String(x.id || ''), wert: _mnText(x.wert) })) : []);

/** Thema nach ISO 27002 aus Controls wie „A.6.01 Sicherheitsüberprüfung" oder „A.8.13". */
function mnKategorieAusIso(werte) {
  const themen = { 5: 'organisatorisch', 6: 'personell', 7: 'physisch', 8: 'technologisch' };
  const zaehl = {};
  (werte || []).forEach(w => {
    const m = /\bA\.0?([5-8])\./.exec(String(w || ''));
    if (m) zaehl[themen[m[1]]] = (zaehl[themen[m[1]]] || 0) + 1;
  });
  const sortiert = Object.entries(zaehl).sort((a, b) => b[1] - a[1]);
  return sortiert.length ? sortiert[0][0] : '';
}

/** Ein Eintrag der Liste „Maßnahmen" (aus _hausLesen) → RMS-Maßnahme. */
function mnAusHaus(roh) {
  const r = roh || {};
  const status = (MN_STATUS.find(s => s.haus === r.status) || MN_STATUS[0]).key;
  const quellen = (Array.isArray(r.quellen) ? r.quellen : []).map(_mnText).filter(Boolean);
  const teams = _mnListe(r.teams);
  const iso = _mnListe(r.iso);
  const v = r.verantwortlich || null;
  return {
    id: r.id ? String(r.id) : null, herkunft: 'eigen', schluessel: `mn:${r.id}`,
    titel: _mnText(r.titel), beschreibung: _mnText(r.beschreibung), status,
    quellen, quelle: quellen[0] || 'Sonstige', bericht: _mnText(r.bericht),
    durchfuehrung: MN_DURCHFUEHRUNG.includes(r.durchfuehrung) ? r.durchfuehrung : '',
    auswirkungEintritt: _mnText(r.auswirkungEintritt), auswirkungSchaden: _mnText(r.auswirkungSchaden),
    teams, team: teams.length ? teams[0].wert : '',
    verantwortlich: v ? (v.email || v.name || '') : '', verantwortlichName: v ? (v.name || v.email || '') : '',
    termin: _mnTag(r.termin), umgesetztAm: _mnTag(r.umgesetztAm),
    iso, normbezug: iso.map(x => x.wert.split(' ')[0]).join(', '), kategorie: mnKategorieAusIso(iso.map(x => x.wert)),
    ressourcen: _mnText(r.ressourcen), archiv: !!r.archiv, dokumente: _mnListe(r.dokumente),
    werke: [], bezugId: r.id ? String(r.id) : '', bezugTitel: '',
    modified: r.modified || '',
  };
}

/** RMS-Maßnahme → Felder der Liste (für _hausSchreiben). Nachschlagewerte als IDs. */
function mnZuHaus(m) {
  const x = m || {};
  const ids = (l) => (Array.isArray(l) ? l.map(e => (e && typeof e === 'object') ? e.id : e).filter(Boolean) : []);
  return {
    titel: _mnText(x.titel) || '(ohne Titel)', beschreibung: _mnText(x.beschreibung),
    status: mnStatusInfo(x.status).haus,
    quellen: (x.quellen || []).filter(q => mnQuelleInfo(q) && !mnQuelleInfo(q).nurGesamtsicht),
    bericht: _mnText(x.bericht), durchfuehrung: MN_DURCHFUEHRUNG.includes(x.durchfuehrung) ? x.durchfuehrung : '',
    auswirkungEintritt: MN_AUSWIRKUNG.includes(x.auswirkungEintritt) ? x.auswirkungEintritt : '',
    auswirkungSchaden: MN_AUSWIRKUNG.includes(x.auswirkungSchaden) ? x.auswirkungSchaden : '',
    teams: ids(x.teams), verantwortlich: _mnText(x.verantwortlich) && /@/.test(x.verantwortlich) ? _mnText(x.verantwortlich) : (x.verantwortlich ? undefined : ''),
    iso: ids(x.iso), termin: _mnTag(x.termin), umgesetztAm: _mnTag(x.umgesetztAm),
    ressourcen: _mnText(x.ressourcen), archiv: !!x.archiv,
  };
}

/**
 * Was einer Maßnahme der Liste fehlt, damit sie umgesetzt und nachgewiesen
 * werden kann: jemand, der sie verantwortet (Person oder Team), und ein Termin.
 * Abgeschlossen heißt: mit Umsetzungsdatum.
 */
function mnLuecken(m) {
  const f = [];
  if (!_mnText(m && m.titel)) f.push('Bezeichnung fehlt.');
  if (!m || m.archiv) return f;
  if (m.status === 'erledigt') {
    if (!m.umgesetztAm) f.push('Abgeschlossen, aber ohne Umsetzungsdatum.');
    return f;
  }
  if (m.status === 'zurückgestellt') return f;
  if (!m.verantwortlich && !(m.teams || []).length) f.push('Niemand ist verantwortlich, weder eine Person noch ein Team.');
  if (!m.termin) f.push('Kein Termin für die geplante Umsetzung.');
  if (!(m.quellen || []).length) f.push('Nicht angegeben, woraus die Maßnahme entspringt.');
  return f;
}

function mnUeberfaellig(e, heute) {
  const h = heute || mnHeute();
  return !!(e && !e.archiv && e.termin && (e.status === 'offen' || e.status === 'in Umsetzung') && String(e.termin).slice(0, 10) < h);
}

/* ── Die Gesamtsicht: ein Eintrag je Maßnahme, gleich woher ── */

const _MN_RISIKO_KATEGORIE = {
  'Organisation': 'organisatorisch', 'Personal': 'personell', 'Technik / IT': 'technologisch',
  'Physisch / Umgebung': 'physisch', 'Lieferanten / Dienstleister': 'organisatorisch', 'Recht / Compliance': 'organisatorisch',
};

/** Die Maßnahmen der Risikobehandlung im Risiko-Register des RMS. */
function mnAusRisiken(risiken) {
  const out = [];
  (Array.isArray(risiken) ? risiken : []).forEach(r => (Array.isArray(r.massnahmen) ? r.massnahmen : []).forEach((m, i) => {
    if (!m || !_mnText(m.titel)) return;
    const controls = Array.isArray(r.controls) ? r.controls : [];
    out.push({
      schluessel: `risiko:${r.id}:${i}`, herkunft: 'risiko', bezugId: String(r.id), bezugTitel: _mnText(r.titel), id: null,
      titel: _mnText(m.titel), verantwortlich: _mnText(m.verantwortlich), verantwortlichName: _mnText(m.verantwortlich),
      termin: _mnTag(m.frist), status: ['offen', 'in Umsetzung', 'erledigt'].includes(m.status) ? m.status : 'offen',
      quellen: ['Risikobehandlung'], quelle: 'Risikobehandlung', teams: [], team: '', durchfuehrung: '',
      kategorie: _MN_RISIKO_KATEGORIE[r.kategorie] || mnKategorieAusIso(controls), normbezug: controls.join(', '),
      werke: [], archiv: false,
    });
  }));
  return out;
}

/** „Entspringt aus" für eine Maßnahme aus dem Register „Wirksamkeit". */
function _mnWirkQuelle(w) {
  if (w.art === 'bewertung') return 'Management Review';
  if (w.art === 'uebung' || w.art === 'pruefung') return 'Tests und Übungen';
  if (w.art === 'audit') return 'Internes Audit';
  if (String(w.herkunftId || '').startsWith('ticket:')) return 'Sicherheitsvorfall';
  const q = String(w.quelle || '').toLowerCase();
  if (q.includes('externes audit')) return 'Externes Audit';
  if (q.includes('internes audit')) return 'Internes Audit';
  if (q.includes('übung') || q.includes('funktionsprüfung')) return 'Tests und Übungen';
  if (q.includes('vorfall')) return 'Sicherheitsvorfall';
  return 'Sonstige';
}

/** Die Maßnahmen aus Abweichungen, Managementbewertungen und Übungen. */
function mnAusWirksamkeit(wirk) {
  const out = [];
  (Array.isArray(wirk) ? wirk : []).forEach(w => (Array.isArray(w.massnahmen) ? w.massnahmen : []).forEach((m, i) => {
    if (!m || !_mnText(m.titel)) return;
    const quelle = _mnWirkQuelle(w);
    out.push({
      schluessel: `wirk:${w.id}:${i}`, herkunft: 'wirksamkeit', bezugId: String(w.id), bezugTitel: _mnText(w.titel), id: null,
      titel: _mnText(m.titel), verantwortlich: _mnText(m.verantwortlich), verantwortlichName: _mnText(m.verantwortlich),
      termin: _mnTag(m.frist), status: ['offen', 'in Umsetzung', 'erledigt'].includes(m.status) ? m.status : 'offen',
      quellen: [quelle], quelle, teams: [], team: '', durchfuehrung: '', kategorie: '', normbezug: _mnText(w.normbezug),
      werke: Array.isArray(w.werke) ? w.werke : [], archiv: false,
    });
  }));
  return out;
}

/**
 * Alles zusammen, das Dringende zuerst: überfällig, offen nach Termin,
 * zurückgestellt, erledigt. Archivierte Einträge der Liste nur auf Wunsch.
 */
function mnAlle(eigene, risiken, wirk, heute, opt) {
  const h = heute || mnHeute();
  const mitArchiv = !!(opt && opt.archiv);
  const liste = (Array.isArray(eigene) ? eigene : []).map(m => (m && m.herkunft === 'eigen') ? m : mnAusHaus(m))
    .filter(m => mitArchiv || !m.archiv)
    .concat(mnAusRisiken(risiken), mnAusWirksamkeit(wirk));
  const rang = (e) => mnUeberfaellig(e, h) ? 0 : (e.status === 'offen' || e.status === 'in Umsetzung') ? 1 : e.status === 'zurückgestellt' ? 2 : 3;
  return liste.sort((a, b) => (rang(a) - rang(b))
    || String(a.termin || '9999').localeCompare(String(b.termin || '9999'))
    || a.titel.localeCompare(b.titel, 'de'));
}

/**
 * Filtern: q (Volltext); quelle und team treffen, wenn einer der Werte passt;
 * kategorie, status, durchfuehrung, herkunft genau; ids (Set) für „zum Ziel";
 * offen und ueberfaellig als Schalter; werk lässt Einträge ohne Werk stehen.
 */
function mnFiltern(liste, f, heute) {
  const g = f || {};
  const q = _mnText(g.q).toLowerCase();
  return (liste || []).filter(e => {
    if (q && !(`${e.titel} ${e.beschreibung || ''} ${e.verantwortlichName || ''} ${e.team || ''} ${e.bezugTitel || ''} ${e.normbezug || ''} ${e.bericht || ''}`).toLowerCase().includes(q)) return false;
    if (g.quelle && !(e.quellen || [e.quelle]).includes(g.quelle)) return false;
    if (g.team && !(e.teams || []).some(t => t.wert === g.team)) return false;
    for (const k of ['kategorie', 'status', 'durchfuehrung', 'herkunft']) if (g[k] && e[k] !== g[k]) return false;
    if (g.offen && (e.status === 'erledigt' || e.status === 'zurückgestellt')) return false;
    if (g.ueberfaellig && !mnUeberfaellig(e, heute)) return false;
    if (g.werk && (e.werke || []).length && !e.werke.includes(g.werk)) return false;
    if (g.ids && !(e.id && g.ids.has(String(e.id)))) return false;
    return true;
  });
}

/** Beschriftung einer Gruppe. */
function mnGruppenLabel(nach, wert) {
  if (!wert) return nach === 'verantwortlich' ? 'ohne Verantwortliche' : nach === 'team' ? 'ohne Team' : 'ohne Angabe';
  if (nach === 'status') return mnStatusInfo(wert).label;
  if (nach === 'kategorie') return (mnKategorieInfo(wert) || {}).label || wert;
  if (nach === 'herkunft') return (MN_HERKUNFT[wert] || {}).label || wert;
  return wert;
}

/** Nach einem Merkmal gruppieren (mehrwertige zählen nach dem ersten Wert). → [{ wert, label, eintraege }] */
function mnGruppieren(liste, nach) {
  const wertVon = (e) => nach === 'verantwortlich' ? (e.verantwortlichName || e.verantwortlich || '') : String(e[nach] || '');
  const reihe = nach === 'quelle' ? MN_QUELLEN.map(x => x.key) : nach === 'kategorie' ? MN_KATEGORIEN.map(x => x.key)
    : nach === 'status' ? MN_STATUS.map(x => x.key) : nach === 'durchfuehrung' ? MN_DURCHFUEHRUNG
    : nach === 'herkunft' ? Object.keys(MN_HERKUNFT) : null;
  const map = new Map();
  (liste || []).forEach(e => { const w = wertVon(e); if (!map.has(w)) map.set(w, []); map.get(w).push(e); });
  const ord = (w) => { if (!w) return 999; if (!reihe) return 0; const i = reihe.indexOf(w); return i < 0 ? 500 : i; };
  return [...map.entries()].sort((a, b) => (ord(a[0]) - ord(b[0])) || a[0].localeCompare(b[0], 'de'))
    .map(([wert, eintraege]) => ({ wert, label: mnGruppenLabel(nach, wert), eintraege }));
}

/** Kennzahlen der Gesamtsicht. */
function mnKennzahlen(liste, heute) {
  const h = heute || mnHeute();
  const l = (liste || []).filter(e => !e.archiv);
  const laufend = l.filter(e => e.status === 'offen' || e.status === 'in Umsetzung');
  const jeQuelle = {};
  l.forEach(e => (e.quellen && e.quellen.length ? e.quellen : [e.quelle || 'Sonstige']).forEach(q => { jeQuelle[q] = (jeQuelle[q] || 0) + 1; }));
  const erledigt = l.filter(e => e.status === 'erledigt').length;
  return {
    gesamt: l.length,
    offen: l.filter(e => e.status === 'offen').length,
    inUmsetzung: l.filter(e => e.status === 'in Umsetzung').length,
    zurueckgestellt: l.filter(e => e.status === 'zurückgestellt').length,
    erledigt,
    ueberfaellig: laufend.filter(e => mnUeberfaellig(e, h)).length,
    ohneVerantwortlich: laufend.filter(e => !e.verantwortlich && !(e.teams || []).length).length,
    ohneTermin: laufend.filter(e => !e.termin).length,
    quote: l.length ? Math.round(erledigt / l.length * 100) : 0,
    jeQuelle,
  };
}

/** Die Gesamtsicht als CSV (Semikolon, mit BOM für Excel). */
function mnCsv(liste, zieleVon) {
  const zv = typeof zieleVon === 'function' ? zieleVon : () => '';
  const kopf = ['Maßnahme', 'Register', 'Bezug', 'Entspringt aus', 'Status', 'Durchführung', 'Team', 'Verantwortlich',
    'Geplante Umsetzung', 'Umsetzungsdatum', 'ISO/IEC 27001:2022', 'Thema (ISO 27002)', 'Ziele', 'Ressourcen', 'Quelle / Bericht', 'Werke'];
  const zelle = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const zeilen = (liste || []).map(e => [
    e.titel, (MN_HERKUNFT[e.herkunft] || {}).label || e.herkunft, e.bezugTitel || '', (e.quellen || [e.quelle]).join(', '),
    mnStatusInfo(e.status).label, e.durchfuehrung || '', (e.teams || []).map(t => t.wert).join(', '), e.verantwortlichName || e.verantwortlich || '',
    e.termin || '', e.umgesetztAm || '', (e.iso || []).map(x => x.wert).join(', ') || e.normbezug || '',
    e.kategorie ? mnGruppenLabel('kategorie', e.kategorie) : '', e.id ? zv(e.id) : '', e.ressourcen || '', e.bericht || '', (e.werke || []).join(' '),
  ].map(zelle).join(';'));
  return '﻿' + [kopf.map(zelle).join(';')].concat(zeilen).join('\r\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MN_QUELLEN, MN_STATUS, MN_DURCHFUEHRUNG, MN_AUSWIRKUNG, MN_KATEGORIEN, MN_GRUPPIERUNG, MN_HERKUNFT,
    mnStatusInfo, mnQuelleInfo, mnKategorieInfo, mnHeute, mnKategorieAusIso, mnAusHaus, mnZuHaus,
    mnLuecken, mnUeberfaellig, mnAusRisiken, mnAusWirksamkeit, mnAlle, mnFiltern, mnGruppenLabel, mnGruppieren, mnKennzahlen, mnCsv,
  };
}
