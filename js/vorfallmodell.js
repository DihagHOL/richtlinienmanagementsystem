'use strict';

/**
 * Sicherheitsvorfälle & Ereignisse – das Modell
 * ==============================================
 * ISO 27001 A.5.24 (Planung und Vorbereitung), A.5.25 (Beurteilung und
 * Entscheidung: Ereignis oder Vorfall?), A.5.26 (Reaktion), A.5.27 (Lernen aus
 * Vorfällen), A.5.28 (Sammlung von Beweismaterial), A.8.32 (Änderungs-
 * management); NIS2 Art. 23 (Meldung erheblicher Sicherheitsvorfälle:
 * Frühwarnung 24 h, Meldung 72 h, Abschlussbericht ein Monat); DSGVO Art. 33
 * (Meldung binnen 72 h, wenn Personendaten betroffen sind).
 *
 * Woher die Vorfälle kommen: aus dem Ticketsystem des Hauses – der Liste
 * „Tickets" auf der Site „ticket". Dort landen Störungen (Incidents),
 * Änderungen (Changes) und Dokumentationsaufträge (Dokus), getrennt nach der
 * Art des Tickets. Das Ticket bleibt dort; die App liest es und legt darüber,
 * was ein ISMS braucht und ein Ticketsystem nicht hat:
 *
 *   Ist es ein Vorfall?          A.5.25 – die Beurteilung, wer sie traf, wann
 *   Ist er erheblich?            NIS2 Art. 23 – dann laufen die Fristen
 *   Wann wurde gemeldet?         Frühwarnung, Meldung, Abschlussbericht – je Zeitstempel
 *   Welche Eskalationsstufe?     Störung / Notfall / Krise – die Brücke zum Krisenstab
 *   Was war die Ursache?         A.5.26/A.5.27 – und welche Maßnahme folgt (Wirksamkeit 10.2)
 *   Wo liegen die Beweise?       A.5.28 – im Ticket, in der Akte, beim Dienstleister
 *
 * Diese Bewertung liegt in `vorfaelle.json` im Konfig-Ordner der App, je
 * Ticket-Id. Welche Tickets Informationssicherheit sind, entscheidet die
 * Kategorie – die Einstellungen nennen die Kategorien, bis dahin gilt ein
 * Muster.
 *
 * Diese Datei kennt weder DOM noch SharePoint. Sie normalisiert Tickets und
 * Bewertungen, rechnet Fristen, nennt Lücken und Kennzahlen – für den Reiter,
 * das Cockpit, den Audit Report und den Cron gleichermaßen.
 */

/* ── Vokabular ── */

/** Die Arten von Tickets, wie das Haus sie trennt – und was sie im ISMS sind. */
const VF_ARTEN = {
  incident: { key: 'incident', label: 'Vorfälle & Ereignisse', einzahl: 'Vorfall / Ereignis', icon: '🚨', norm: 'ISO 27001 A.5.24–A.5.28 · NIS2 Art. 23' },
  change:   { key: 'change',   label: 'Änderungen',            einzahl: 'Änderung',           icon: '🔧', norm: 'ISO 27001 A.8.32' },
  doku:     { key: 'doku',     label: 'Dokumentation',         einzahl: 'Dokumentation',      icon: '📄', norm: 'ISO 27001 A.5.37' },
};

/** Die Beurteilung nach A.5.25: Ereignis (kein Schaden, kein Verstoß) oder Sicherheitsvorfall. */
const VF_EINSTUFUNG = [
  { key: '',         label: 'nicht beurteilt' },
  { key: 'ereignis', label: 'Ereignis – kein Vorfall' },
  { key: 'vorfall',  label: 'Sicherheitsvorfall' },
];

/**
 * Die Meldefristen. NIS2 Art. 23 (4) für erhebliche Vorfälle: Frühwarnung
 * binnen 24 Stunden nach Kenntnis, Meldung binnen 72 Stunden, Abschlussbericht
 * spätestens einen Monat nach der Meldung. DSGVO Art. 33: binnen 72 Stunden an
 * die Aufsichtsbehörde, wenn Personendaten betroffen sind.
 */
const VF_FRISTEN = [
  { key: 'fruehwarnung', label: 'Frühwarnung (NIS2)',       stunden: 24,      ab: 'kenntnis', wenn: 'erheblich',
    text: 'Verdacht auf rechtswidrige oder böswillige Handlung? Grenzüberschreitende Auswirkung? – an das BSI' },
  { key: 'meldung',      label: 'Meldung (NIS2)',           stunden: 72,      ab: 'kenntnis', wenn: 'erheblich',
    text: 'Erste Bewertung: Schweregrad, Auswirkungen, Kompromittierungsindikatoren' },
  { key: 'abschluss',    label: 'Abschlussbericht (NIS2)',  stunden: 24 * 30, ab: 'meldung',  wenn: 'erheblich',
    text: 'Beschreibung, Ursache, ergriffene Maßnahmen, grenzüberschreitende Auswirkungen' },
  { key: 'dsgvo',        label: 'Meldung Aufsichtsbehörde (DSGVO Art. 33)', stunden: 72, ab: 'kenntnis', wenn: 'personendaten',
    text: 'Art der Verletzung, Kategorien und Zahl der Betroffenen, Folgen, Maßnahmen – an die Landesdatenschutzbehörde' },
];

/** Bis wann ein Ereignis beurteilt sein sollte – danach ist die fehlende Beurteilung eine Lücke, keine Wartezeit. */
const VF_BEURTEILUNG_TAGE = 2;
/** Ab wann ein offener Vorfall auffällt. */
const VF_OFFEN_TAGE = 30;
/** Wie weit die App zurückliest (Monate). */
const VF_MONATE = 24;

/**
 * Was Informationssicherheit ist, solange die Einstellungen keine Kategorien
 * nennen: ein Muster über die Kategorie des Tickets.
 */
const VF_SICHERHEIT_MUSTER = /informationssicherheit|it-?sicherheit|security|sicherheit|cyber|phishing|malware|virus|ransom|trojan|schadsoftware|datenschutz|dsgvo|datenpanne|datenverlust|datenabfluss|unbefugt|hack|angriff|spam|diebstahl|verlust|social ?engineering|ddos|kompromitt|zugriffsverletzung|incident/i;

/**
 * Die Spalten der Liste „Tickets" – unter den Namen, die sie dort haben
 * können (die Ticket-App selbst rät sie genauso).
 */
const VF_ALIASE = {
  Status:        ['Status', 'Zustand', 'State'],
  Prioritaet:    ['Priorität', 'Priority', 'Prio', 'Dringlichkeit'],
  Kategorie:     ['Kategorie', 'Category', 'Typ', 'Type'],
  Art:           ['Art', 'Ticketart', 'TicketType', 'Tickettyp', 'Ticket Art'],
  Werk:          ['Werk', 'Standort', 'Standorte', 'Site', 'Gesellschaft', 'Location'],
  Beschreibung:  ['Beschreibung', 'Description', 'Kommentar', 'Inhalt', 'Details'],
  Zugewiesen:    ['Zugewiesen', 'Zugewiesen an', 'AssignedTo', 'Bearbeiter', 'ZugewiesenAn', 'Assigned To'],
  Melder:        ['Melder', 'Ersteller', 'Reporter', 'Auftraggeber', 'Author'],
  Abgeschlossen: ['Abgeschlossen', 'Erledigt am', 'Geschlossen', 'Closed', 'Erledigt'],
};

/* ── Normalisieren ── */

function _vfText(v) { return String(v == null ? '' : v).trim(); }
function _vfIso(v) { const s = _vfText(v); if (!s) return ''; const t = new Date(s).getTime(); return Number.isFinite(t) ? new Date(t).toISOString() : ''; }
function _vfEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

/** Ein Feld der Liste als Text – Person, Nachschlagen, Mehrfachauswahl inbegriffen. */
function vfFeldText(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(vfFeldText).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.Email || v.email || v.LookupValue || v.Label || v.Value || v.Title || v.DisplayName || v.displayName || '');
  return String(v);
}

/** Die Art eines Tickets, wie das Haus sie schreibt – auf incident / change / doku; die Einstellungen dürfen einzelne Worte anders zuordnen. */
function vfArtVon(text, zuordnung) {
  const s = _vfText(text);
  if (!s) return '';
  const z = (zuordnung && typeof zuordnung === 'object') ? zuordnung : {};
  const eigene = Object.keys(z).find(k => k.toLowerCase() === s.toLowerCase());
  if (eigene !== undefined && VF_ARTEN[z[eigene]]) return z[eigene];
  const u = s.toLowerCase();
  if (/incident|st(ö|oe)rung|vorfall|ereignis|problem|fehler|ausfall|alarm/.test(u)) return 'incident';
  if (/change|(ä|ae)nderung|rfc|anpassung|umstellung|wechsel/.test(u)) return 'change';
  if (/doku|dokument|wiki|anleitung|beschreibung|handbuch/.test(u)) return 'doku';
  return '';
}

/** Ist das Ticket noch offen? Alles, was nicht nach Ende klingt. */
function vfOffen(status) {
  const s = _vfText(status).toLowerCase();
  if (!s) return true;
  return !/erledigt|geschlossen|abgeschlossen|closed|done|resolved|gel(ö|oe)st|abgebrochen|storniert|verworfen|cancel|fertig|beendet|archiv/.test(s);
}

/** Priorität des Hauses auf 0 (niedrig) … 3 (kritisch). */
function vfPrioRang(text) {
  const s = _vfText(text).toLowerCase();
  if (!s) return -1;
  if (/kritisch|critical|notfall|^p?0\b|^1\b|h(ö|oe)chst|sehr ?hoch|urgent/.test(s)) return 3;
  if (/hoch|high|^p?1\b|^2\b/.test(s)) return 2;
  if (/mittel|medium|normal|^p?2\b|^3\b/.test(s)) return 1;
  if (/niedrig|gering|low|^p?3\b|^4\b/.test(s)) return 0;
  return -1;
}

/**
 * Zählt die Kategorie eines Tickets als Informationssicherheit? Nennen die
 * Einstellungen Kategorien, gelten genau die; sonst das Muster.
 * @param {string} kategorie
 * @param {object} [cfg] { vorfallKategorien: string[] }
 */
function vfIstSicherheit(kategorie, cfg) {
  const k = _vfText(kategorie);
  const liste = (cfg && Array.isArray(cfg.vorfallKategorien)) ? cfg.vorfallKategorien.map(x => _vfText(x).toLowerCase()).filter(Boolean) : [];
  if (liste.length) return liste.includes(k.toLowerCase());
  return VF_SICHERHEIT_MUSTER.test(k);
}

/**
 * Ein Ticket aus der Liste, gelesen wie das Haus es führt.
 * @param {object} it    Graph-Element {id, fields, webUrl, createdDateTime …} oder nur die Felder
 * @param {object} [opt] { feld: (erwartet) => Spaltenname|null, standorte: string[], zuordnung: {Art → key}, urlVon: (id) => string }
 */
function vfAusFeldern(it, opt) {
  const o = opt || {};
  const f = (it && it.fields && typeof it.fields === 'object') ? it.fields : (it || {});
  const feldName = (typeof o.feld === 'function') ? o.feld : () => undefined;
  const key = (e) => (typeof amFeldKey === 'function') ? amFeldKey(f, e, feldName(e), VF_ALIASE) : _vfKeyOhneModell(f, e);
  const text = (e) => { const k = key(e); return k ? vfFeldText(f[k]).trim() : ''; };
  const wk = key('Werk');
  const w = (typeof amWerkeVon === 'function') ? amWerkeVon(wk ? f[wk] : null, o.standorte) : { werke: [], text: wk ? vfFeldText(f[wk]) : '' };
  const id = String((it && it.id) || f.id || f.ID || '');
  const artRoh = text('Art');
  const t = {
    id,
    titel: _vfText(f.Title || f.LinkTitle),
    status: text('Status'),
    prio: text('Prioritaet'),
    kategorie: text('Kategorie'),
    artRoh,
    art: vfArtVon(artRoh, o.zuordnung),
    werke: w.werke,
    werkText: w.text,
    beschreibung: text('Beschreibung'),
    zugewiesen: text('Zugewiesen'),
    melder: text('Melder') || vfFeldText(f.Author || (it && it.createdBy && it.createdBy.user) || '').trim(),
    erstellt: _vfIso((it && it.createdDateTime) || f.Created || f.created || ''),
    geaendert: _vfIso((it && it.lastModifiedDateTime) || f.Modified || f.modified || ''),
    abgeschlossen: _vfIso(text('Abgeschlossen')),
    url: (it && it.webUrl) || ((typeof o.urlVon === 'function') ? o.urlVon(id) : ''),
  };
  t.offen = vfOffen(t.status);
  return t;
}
function _vfKeyOhneModell(f, erwartet) {
  const norm = (s) => String(s || '').replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16))).toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  const da = (k) => { const v = f[k]; return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length); };
  for (const k of [erwartet].concat(VF_ALIASE[erwartet] || [])) if (da(k)) return k;
  const keys = Object.keys(f);
  for (const k of [erwartet].concat(VF_ALIASE[erwartet] || [])) { const n = norm(k); const hit = keys.find(x => norm(x) === n && da(x)); if (hit) return hit; }
  return null;
}

/** Die Bewertung zu einem Ticket – immer vollständig. */
function vfBewertungVon(b) {
  const r = (b && typeof b === 'object') ? b : {};
  const m = (r.meldungen && typeof r.meldungen === 'object') ? r.meldungen : {};
  const stufe = (r.stufe === null || r.stufe === undefined || r.stufe === '') ? null : Number(r.stufe);
  return {
    einstufung: ['ereignis', 'vorfall'].includes(r.einstufung) ? r.einstufung : '',
    erheblich: r.erheblich === true ? true : r.erheblich === false ? false : null,   // null = nicht entschieden
    personendaten: r.personendaten === true,
    stufe: Number.isFinite(stufe) && stufe >= 0 && stufe <= 3 ? stufe : null,
    kenntnisAm: _vfIso(r.kenntnisAm),
    meldungen: { fruehwarnung: _vfIso(m.fruehwarnung), meldung: _vfIso(m.meldung), abschluss: _vfIso(m.abschluss), dsgvo: _vfIso(m.dsgvo) },
    behoerde: _vfText(r.behoerde),
    ursache: _vfText(r.ursache),
    reaktion: _vfText(r.reaktion),
    lessons: _vfText(r.lessons),
    beweise: _vfText(r.beweise),
    bewertetVon: _vfText(r.bewertetVon),
    bewertetAm: _vfIso(r.bewertetAm),
    historie: Array.isArray(r.historie) ? r.historie : [],
  };
}

/* ── Fristen ── */

/**
 * Die Fristen eines Vorfalls – gerechnet ab Kenntnis (Bewertung, sonst
 * Erstellung des Tickets). Nur die, die gelten: NIS2 bei „erheblich", DSGVO
 * bei Personendaten. Jede mit Fälligkeit, Erledigung und Stand.
 * @returns {{key, label, text, faellig: string, erledigt: string, stand: 'erledigt'|'offen'|'ueberfaellig', restStunden: number}[]}
 */
function vfFristen(ticket, bewertung, jetzt) {
  const t = ticket || {}, b = vfBewertungVon(bewertung);
  const now = jetzt ? new Date(jetzt).getTime() : Date.now();
  const kenntnis = b.kenntnisAm || t.erstellt || '';
  if (!kenntnis || b.einstufung !== 'vorfall') return [];
  const out = [];
  for (const fr of VF_FRISTEN) {
    if (fr.wenn === 'erheblich' && b.erheblich !== true) continue;
    if (fr.wenn === 'personendaten' && !b.personendaten) continue;
    const basis = fr.ab === 'meldung' ? (b.meldungen.meldung || new Date(new Date(kenntnis).getTime() + 72 * 3600000).toISOString()) : kenntnis;
    const faellig = new Date(new Date(basis).getTime() + fr.stunden * 3600000).toISOString();
    const erledigt = b.meldungen[fr.key] || '';
    const rest = (new Date(faellig).getTime() - now) / 3600000;
    const stand = erledigt ? (new Date(erledigt).getTime() <= new Date(faellig).getTime() ? 'erledigt' : 'verspaetet') : (rest < 0 ? 'ueberfaellig' : 'offen');
    out.push({ key: fr.key, label: fr.label, text: fr.text, faellig, erledigt, stand, restStunden: Math.round(rest) });
  }
  return out;
}

/** Stunden als Text: „in 5 h", „in 2 Tagen", „seit 3 h überfällig". */
function vfRestText(h) {
  const a = Math.abs(h);
  const t = a < 48 ? `${a} h` : `${Math.round(a / 24)} Tagen`;
  return h < 0 ? `seit ${t} überfällig` : `noch ${t}`;
}

/* ── Lücken ── */

function _vfTage(iso, jetzt) { if (!iso) return null; const a = new Date(iso).getTime(); const b = jetzt ? new Date(jetzt).getTime() : Date.now(); return Number.isFinite(a) ? (b - a) / 86400000 : null; }

/**
 * Was einem Vorfall im ISMS fehlt – das Ticket mag erledigt sein, die
 * Beurteilung, die Meldung, die Lehre daraus sind es dann noch nicht.
 * @param {object} ticket     normalisiert (vfAusFeldern)
 * @param {object} bewertung  roh
 * @param {object} [opt]      { jetzt, massnahmen: [{herkunftId}] (Wirksamkeits-Register) }
 */
function vfLuecken(ticket, bewertung, opt) {
  const o = opt || {};
  const t = ticket || {}, b = vfBewertungVon(bewertung);
  const fehler = [], hinweise = [];
  if (t.art !== 'incident') return { fehler, hinweise };
  const alter = _vfTage(t.erstellt, o.jetzt);
  if (!b.einstufung) {
    if (alter !== null && alter > VF_BEURTEILUNG_TAGE) fehler.push(`Nicht beurteilt (A.5.25) – seit ${Math.round(alter)} Tagen: Ereignis oder Sicherheitsvorfall?`);
    else hinweise.push('Noch nicht beurteilt (A.5.25): Ereignis oder Sicherheitsvorfall?');
    return { fehler, hinweise };
  }
  if (b.einstufung !== 'vorfall') return { fehler, hinweise };
  if (b.erheblich === null) fehler.push('Erheblichkeit nicht entschieden (NIS2 Art. 23) – erheblich heißt: Frühwarnung binnen 24 h.');
  for (const fr of vfFristen(t, b, o.jetzt)) {
    if (fr.stand === 'ueberfaellig') fehler.push(`${fr.label} ${vfRestText(fr.restStunden)} – fällig war ${fr.faellig.slice(0, 16).replace('T', ' ')}.`);
    else if (fr.stand === 'verspaetet') hinweise.push(`${fr.label} verspätet abgegeben (${fr.erledigt.slice(0, 16).replace('T', ' ')}, fällig war ${fr.faellig.slice(0, 16).replace('T', ' ')}).`);
    else if (fr.stand === 'offen' && fr.restStunden <= 24) hinweise.push(`${fr.label} fällig: ${vfRestText(fr.restStunden)}.`);
  }
  if (b.stufe === null) hinweise.push('Keine Eskalationsstufe – Störung, Notfall oder Krise? (Krisenstab, A.5.29)');
  if (b.stufe !== null && b.stufe >= 2) hinweise.push(`Eskalationsstufe ${b.stufe} – der Krisenstab des Werks ist zuständig.`);
  const massnahmen = (Array.isArray(o.massnahmen) ? o.massnahmen : []).filter(m => m && String(m.herkunftId || '') === `ticket:${t.id}`);
  if (!t.offen || t.abgeschlossen) {
    if (!b.ursache) fehler.push('Ticket erledigt, Ursache nicht festgehalten (A.5.26).');
    if (!b.lessons) fehler.push('Ticket erledigt, keine Lehre daraus (A.5.27) – was verhindert die Wiederholung?');
    if (!massnahmen.length) hinweise.push('Keine Korrekturmaßnahme im Wirksamkeits-Register (10.2) – oder es brauchte keine: dann als Lehre festhalten.');
  } else if (alter !== null && alter > VF_OFFEN_TAGE) {
    hinweise.push(`Seit ${Math.round(alter)} Tagen offen.`);
  }
  if (!b.beweise && (b.erheblich === true || b.personendaten)) hinweise.push('Beweismittel nicht benannt (A.5.28) – Logs, Screenshots, Forensik-Bericht: wo liegen sie?');
  return { fehler, hinweise };
}

/* ── Sichtbarkeit ── */

function vfSichtbar(ticket, sichtbareWerke) {
  if (!Array.isArray(sichtbareWerke)) return true;
  const w = Array.isArray(ticket.werke) ? ticket.werke : [];
  if (!w.length || w.includes('ALLE')) return true;
  return w.some(x => sichtbareWerke.includes(x));
}

/* ── Kennzahlen ── */

/**
 * @param {Array} tickets      normalisiert, schon auf Sicherheit gefiltert
 * @param {object} bewertungen { id → Bewertung }
 * @param {object} [opt]       { jetzt, werke, massnahmen }
 */
function vfKennzahlen(tickets, bewertungen, opt) {
  const o = opt || {};
  const bw = (bewertungen && typeof bewertungen === 'object') ? bewertungen : {};
  const alle = (Array.isArray(tickets) ? tickets : []).filter(t => vfSichtbar(t, o.werke));
  const z = { gesamt: alle.length, incidents: 0, changes: 0, dokus: 0, sonstige: 0, offen: 0, offeneIncidents: 0,
    unbeurteilt: 0, ereignisse: 0, vorfaelle: 0, erheblich: 0, personendaten: 0, fristenOffen: 0, fristenUeberfaellig: 0,
    ohneLessons: 0, krise: 0, fehler: 0, hinweise: 0, letzte12Monate: 0, offenAelter: 0, dauerMittelTage: null, kategorien: {}, offenListe: [] };
  const jetzt = o.jetzt ? new Date(o.jetzt).getTime() : Date.now();
  const dauern = [];
  for (const t of alle) {
    if (t.art === 'incident') z.incidents++; else if (t.art === 'change') z.changes++; else if (t.art === 'doku') z.dokus++; else z.sonstige++;
    if (t.offen) z.offen++;
    z.kategorien[t.kategorie || ''] = (z.kategorien[t.kategorie || ''] || 0) + 1;
    if (t.art !== 'incident') continue;
    const b = vfBewertungVon(bw[t.id]);
    if (t.offen) z.offeneIncidents++;
    if (t.erstellt && jetzt - new Date(t.erstellt).getTime() <= 365 * 86400000) z.letzte12Monate++;
    if (!b.einstufung) z.unbeurteilt++;
    else if (b.einstufung === 'ereignis') z.ereignisse++;
    else {
      z.vorfaelle++;
      if (b.erheblich === true) z.erheblich++;
      if (b.personendaten) z.personendaten++;
      if (b.stufe !== null && b.stufe >= 2) z.krise++;
      for (const fr of vfFristen(t, b, o.jetzt)) { if (fr.stand === 'offen') z.fristenOffen++; if (fr.stand === 'ueberfaellig') z.fristenUeberfaellig++; }
      if ((!t.offen || t.abgeschlossen) && !b.lessons) z.ohneLessons++;
    }
    if (t.offen && _vfTage(t.erstellt, o.jetzt) > VF_OFFEN_TAGE) z.offenAelter++;
    if (!t.offen && t.erstellt) { const ende = t.abgeschlossen || t.geaendert; if (ende) dauern.push((new Date(ende).getTime() - new Date(t.erstellt).getTime()) / 86400000); }
    const l = vfLuecken(t, b, { jetzt: o.jetzt, massnahmen: o.massnahmen });
    z.fehler += l.fehler.length; z.hinweise += l.hinweise.length;
    if (l.fehler.length) z.offenListe.push({ id: t.id, titel: t.titel, fehler: l.fehler, werke: t.werke });
  }
  if (dauern.length) z.dauerMittelTage = +(dauern.reduce((a, b) => a + b, 0) / dauern.length).toFixed(1);
  return z;
}

/* ── Der Ausdruck: die Vorfallakte (A.5.28 will sie vorzeigbar) ── */

function vfBerichtHtml(o) {
  const t = o.ticket || {}, b = vfBewertungVon(o.bewertung);
  const fristen = vfFristen(t, b, o.jetzt);
  const massnahmen = (Array.isArray(o.massnahmen) ? o.massnahmen : []).filter(m => String(m.herkunftId || '') === `ticket:${t.id}`);
  const dt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
  const stufe = (b.stufe !== null && typeof NF_STUFEN !== 'undefined') ? (NF_STUFEN.find(s => s.nr === b.stufe) || {}).label : (b.stufe !== null ? `Stufe ${b.stufe}` : '');
  const einstufung = (VF_EINSTUFUNG.find(e => e.key === b.einstufung) || VF_EINSTUFUNG[0]).label;
  const zeile = (k, v) => `<tr><th>${_vfEsc(k)}</th><td>${v || '–'}</td></tr>`;
  const stand = o.stand || new Date().toLocaleString('de-DE');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Vorfallakte ${_vfEsc(t.id)} – ${_vfEsc(t.titel)}</title>
    <style>*{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:24px;font-size:12px;line-height:1.45}
      h1{font-size:18px;margin:0 0 2px} h2{font-size:13px;margin:16px 0 4px;color:#17509e;border-bottom:1px solid #17509e} .muted{color:#6b7280}
      table{border-collapse:collapse;width:100%;margin-top:4px} th,td{border:1px solid #d1d5db;padding:4px 6px;text-align:left;vertical-align:top} th{background:#f3f4f6;width:220px;font-weight:600}
      .rot{color:#b91c1c;font-weight:700} .gruen{color:#15803d;font-weight:700} .gelb{color:#b45309;font-weight:700} p{margin:4px 0;white-space:pre-wrap}
      .noprint{margin:14px 0} @media print{.noprint{display:none} body{margin:12px} h2{break-after:avoid} tr{break-inside:avoid}}</style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    <h1>Vorfallakte #${_vfEsc(t.id)} – ${_vfEsc(t.titel)}</h1>
    <div class="muted">DIHAG · ISO/IEC 27001:2022 A.5.24–A.5.28 · NIS2 Art. 23 · Stand ${_vfEsc(stand)}</div>
    <h2>Das Ticket</h2>
    <table>${zeile('Ticket', `#${_vfEsc(t.id)}${t.url ? ` · ${_vfEsc(t.url)}` : ''}`)}${zeile('Art / Kategorie', `${_vfEsc(t.artRoh)} / ${_vfEsc(t.kategorie)}`)}${zeile('Werk', _vfEsc(t.werke.includes('ALLE') ? 'konzernweit' : t.werke.join(', ') || t.werkText))}
      ${zeile('Priorität / Status', `${_vfEsc(t.prio)} / ${_vfEsc(t.status)}`)}${zeile('Gemeldet', `${dt(t.erstellt)}${t.melder ? ` von ${_vfEsc(t.melder)}` : ''}`)}${zeile('Bearbeitung', _vfEsc(t.zugewiesen))}${zeile('Erledigt', t.offen ? 'offen' : dt(t.abgeschlossen || t.geaendert))}
      ${zeile('Beschreibung', `<p>${_vfEsc(t.beschreibung)}</p>`)}</table>
    <h2>Beurteilung (A.5.25)</h2>
    <table>${zeile('Einstufung', `<b>${_vfEsc(einstufung)}</b>`)}${zeile('Eskalationsstufe', _vfEsc(stufe))}${zeile('Kenntnis am', dt(b.kenntnisAm || t.erstellt))}
      ${zeile('Erheblich (NIS2 Art. 23)', b.erheblich === true ? '<span class="rot">ja – meldepflichtig</span>' : b.erheblich === false ? 'nein' : '<span class="gelb">nicht entschieden</span>')}${zeile('Personendaten betroffen (DSGVO Art. 33)', b.personendaten ? '<span class="rot">ja</span>' : 'nein')}
      ${zeile('Beurteilt', b.bewertetVon ? `${_vfEsc(b.bewertetVon)}, ${dt(b.bewertetAm)}` : '')}</table>
    ${fristen.length ? `<h2>Meldungen</h2><table><tr><th>Frist</th><td><b>Fällig</b></td><td><b>Erledigt</b></td><td><b>Stand</b></td></tr>${fristen.map(fr =>
      `<tr><th>${_vfEsc(fr.label)}<div class="muted" style="font-weight:400">${_vfEsc(fr.text)}</div></th><td>${dt(fr.faellig)}</td><td>${dt(fr.erledigt)}</td><td class="${fr.stand === 'ueberfaellig' ? 'rot' : fr.stand === 'erledigt' ? 'gruen' : 'gelb'}">${fr.stand === 'ueberfaellig' ? vfRestText(fr.restStunden) : fr.stand === 'erledigt' ? 'fristgerecht' : fr.stand === 'verspaetet' ? 'verspätet' : vfRestText(fr.restStunden)}</td></tr>`).join('')}</table>
      ${b.behoerde ? `<p class="muted">Behörde / Referenz: ${_vfEsc(b.behoerde)}</p>` : ''}` : ''}
    <h2>Reaktion und Lehren (A.5.26 · A.5.27)</h2>
    <table>${zeile('Ursache', `<p>${_vfEsc(b.ursache)}</p>`)}${zeile('Reaktion / Eindämmung', `<p>${_vfEsc(b.reaktion)}</p>`)}${zeile('Lessons learned', `<p>${_vfEsc(b.lessons)}</p>`)}
      ${zeile('Korrekturmaßnahmen (10.2)', massnahmen.length ? massnahmen.map(m => `${_vfEsc(m.titel)} <span class="muted">(${_vfEsc(m.status)})</span>`).join('<br>') : '')}</table>
    <h2>Beweismittel (A.5.28)</h2>
    <p>${_vfEsc(b.beweise) || '<span class="muted">nicht benannt – das Ticket selbst mit Anhängen und Kommentaren ist der Nachweis der Bearbeitung.</span>'}</p>
    <p class="muted" style="margin-top:14px">Erstellt aus dem DIHAG-Richtlinienmanagement (rms.dihag.de), Reiter „Vorfälle" – deterministisch, ohne KI.</p>
    </body></html>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VF_ARTEN, VF_EINSTUFUNG, VF_FRISTEN, VF_BEURTEILUNG_TAGE, VF_OFFEN_TAGE, VF_MONATE, VF_SICHERHEIT_MUSTER, VF_ALIASE,
    vfFeldText, vfArtVon, vfOffen, vfPrioRang, vfIstSicherheit, vfAusFeldern, vfBewertungVon, vfFristen, vfRestText, vfLuecken, vfSichtbar, vfKennzahlen, vfBerichtHtml };
}
