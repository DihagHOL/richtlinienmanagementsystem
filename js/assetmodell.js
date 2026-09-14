'use strict';

/**
 * Assetregister – das Modell
 * ==========================
 * ISO 27001 A.5.9 (Inventar der Informationen und anderen Werte – mit
 * Eigentümer), A.5.12 (Klassifizierung), A.5.19–5.22 (Lieferanten); BSI 200-2
 * Strukturanalyse und Schutzbedarfsfeststellung; NIS2 Art. 21 (2i) (Asset-
 * Management). Der Reifegrad-Katalog fragt es seit jeher ab (R093: RPO/RTO für
 * Assets mit Verfügbarkeit „sehr hoch").
 *
 * Bisher las die App eine fremde Liste „Assets" auf der ISMS-Site, nur den
 * Titel und ein paar erratene Spalten. Jetzt führt sie ihr eigenes Register
 * („Assetregister", ISMS-Site, wird beim ersten Öffnen angelegt) – mit dem,
 * was ein Auditor fragt und was das Notfallmanagement rechnen muss:
 *
 *   Wer verantwortet es?              A.5.9 – ohne Eigentümer kein Inventar
 *   Wie schutzbedürftig ist es?       V/I/A nach BSI, Klassifizierung nach A.5.12
 *   Wo steht es, für welches Werk?    die Trennung nach Gesellschaft
 *   Wie schnell ist es wieder da?     Wiederherstellzeit und RPO – die Zahl,
 *                                     an der jede Prozess-RTO hängt
 *   Wovon hängt es selbst ab?         Asset → Asset; ein Netz reißt SAP mit
 *   Wann läuft es aus?                EOL, Vertragsende – vor dem Ausfall wissen
 *   Wer hilft?                        Hersteller, Lieferant, Support-Kontakt
 *
 * Und **Zusatzfelder aus den Einstellungen**: Was hier nicht vorgesehen ist,
 * definiert die Administration selbst (Text, Zahl, Datum, Auswahl, Ja/Nein) –
 * ohne dass jemand eine SharePoint-Spalte anlegt. Die Werte liegen als JSON am
 * Datensatz.
 *
 * Diese Datei kennt weder DOM noch SharePoint. Sie normalisiert Datensätze,
 * nennt Lücken beim Namen und rechnet Kennzahlen – für den Reiter, den Audit
 * Report und den Cron gleichermaßen.
 */

/* ── Vokabular ── */

/** Asset-Kategorien nach BSI-Strukturanalyse – die Standardliste; die Einstellungen dürfen sie ersetzen. */
const AM_KATEGORIEN_STANDARD = [
  { key: 'anwendung',   label: 'Anwendung / Software',              symbol: '🖥' },
  { key: 'server',      label: 'Server / Datenbank',                symbol: '🗄' },
  { key: 'netz',        label: 'Netzwerk / Kommunikation',          symbol: '🌐' },
  { key: 'endgeraet',   label: 'Endgeräte',                         symbol: '💻' },
  { key: 'ot',          label: 'OT / Steuerung / Maschine',         symbol: '⚙' },
  { key: 'information', label: 'Information / Daten',               symbol: '📄' },
  { key: 'cloud',       label: 'Cloud-Dienst / Dienstleister',      symbol: '☁' },
  { key: 'gebaeude',    label: 'Gebäude / Infrastruktur / Versorgung', symbol: '🏭' },
  { key: 'personal',    label: 'Personal / Schlüsselrolle',         symbol: '👤' },
  { key: 'sonstiges',   label: 'Sonstiges',                         symbol: '▫' },
];

/** Schutzbedarf nach BSI 200-2 – je Schutzziel. */
const AM_SCHUTZBEDARF = ['normal', 'hoch', 'sehr hoch'];
/** Vertraulichkeitsstufen der Klassifizierung (A.5.12). */
const AM_KLASSIFIZIERUNG = ['öffentlich', 'intern', 'vertraulich', 'streng vertraulich'];
const AM_STATUS = ['aktiv', 'in Beschaffung', 'auslaufend', 'außer Betrieb'];
/** Feldtypen, die Zusatzfelder haben dürfen. */
const AM_ZUSATZ_TYPEN = { text: 'Text', zahl: 'Zahl', datum: 'Datum', auswahl: 'Auswahl', jaNein: 'Ja/Nein' };
/** Wie viele Tage vor EOL oder Vertragsende gemahnt wird. */
const AM_VORLAUF_TAGE = 90;

/* ── Normalisieren ── */

function _amText(v) { return String(v == null ? '' : v).trim(); }
function _amZahl(v) { const n = Number(v); return (v === '' || v === null || v === undefined || !Number.isFinite(n) || n < 0) ? '' : n; }
function _amDatum(v) { const s = _amText(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; }
function _amListe(v) {
  if (Array.isArray(v)) return v.map(_amText).filter(Boolean);
  return _amText(v).split(/[;,]+/).map(s => s.trim()).filter(Boolean);
}
function _amStufe(v, liste) { const s = _amText(v).toLowerCase(); return liste.find(x => x.toLowerCase() === s) || ''; }

/** Ein Asset – immer vollständig, nie undefined. Nimmt Rohes aus der Liste oder aus der Oberfläche. */
function amVon(a) {
  const r = (a && typeof a === 'object') ? a : {};
  const abh = Array.isArray(r.abhaengigVon) ? r.abhaengigVon : [];
  return {
    id: _amText(r.id),
    quelleId: _amText(r.quelleId),            // Id in der alten ISMS-Liste „Assets" (Import)
    titel: _amText(r.titel || r.title),
    kategorie: _amText(r.kategorie),
    beschreibung: _amText(r.beschreibung),
    werke: _amListe(r.werke).map(w => w.toUpperCase()),
    standort: _amText(r.standort),
    verantwortlich: _amText(r.verantwortlich),
    vertretung: _amText(r.vertretung),
    betreiber: _amText(r.betreiber),
    vertraulichkeit: _amStufe(r.vertraulichkeit, AM_SCHUTZBEDARF),
    integritaet: _amStufe(r.integritaet, AM_SCHUTZBEDARF),
    verfuegbarkeit: _amStufe(r.verfuegbarkeit, AM_SCHUTZBEDARF),
    klassifizierung: _amStufe(r.klassifizierung, AM_KLASSIFIZIERUNG),
    personenbezogen: r.personenbezogen === true || /^(ja|true|1)$/i.test(_amText(r.personenbezogen)),
    status: AM_STATUS.includes(_amText(r.status)) ? _amText(r.status) : 'aktiv',
    inbetriebnahme: _amDatum(r.inbetriebnahme),
    eol: _amDatum(r.eol),
    wiederherstellung: _amZahl(r.wiederherstellung),   // Stunden – die Zahl, an der jede Prozess-RTO hängt
    rpo: _amZahl(r.rpo),                               // Stunden – wie alt der letzte Stand sein darf
    backup: _amText(r.backup),
    abhaengigVon: abh.map(x => _amText(typeof x === 'object' && x ? x.id : x)).filter(Boolean),
    hersteller: _amText(r.hersteller),
    lieferant: _amText(r.lieferant),
    supportKontakt: _amText(r.supportKontakt),
    vertragsende: _amDatum(r.vertragsende),
    tags: _amListe(r.tags),
    zusatz: (r.zusatz && typeof r.zusatz === 'object' && !Array.isArray(r.zusatz)) ? r.zusatz : {},
    historie: Array.isArray(r.historie) ? r.historie : [],
    created: _amText(r.created), modified: _amText(r.modified),
  };
}

/** Kurzzeile fürs Auge: Kategorie · Werke · Schutzbedarf. */
function amKurz(a, kategorien) {
  const k = (kategorien || AM_KATEGORIEN_STANDARD).find(x => x.key === a.kategorie);
  const t = [];
  if (k) t.push(k.label);
  if (a.werke.length) t.push(a.werke.includes('ALLE') ? 'konzernweit' : a.werke.join(', '));
  if (a.verfuegbarkeit) t.push(`Verfügbarkeit ${a.verfuegbarkeit}`);
  return t.join(' · ');
}

/* ── Einstellungen: Kategorien und Zusatzfelder ── */

/**
 * Den Schlüssel einer Kategorie finden – auch wenn in der Liste die Beschriftung
 * steht („Server / Datenbank", „server", „Server"). Unbekanntes bleibt Text.
 */
function amKategorieKey(wert, kategorien) {
  const t = _amText(wert);
  if (!t) return '';
  const kats = kategorien || AM_KATEGORIEN_STANDARD;
  const u = t.toLowerCase();
  const hit = kats.find(k => k.key === u || k.label.toLowerCase() === u || k.label.toLowerCase().split(/\s*\/\s*/).includes(u));
  return hit ? hit.key : t;
}

function amKategorien(cfg) {
  const eigene = cfg && Array.isArray(cfg.assetKategorien) ? cfg.assetKategorien : [];
  const gut = eigene.filter(k => k && _amText(k.key) && _amText(k.label))
    .map(k => ({ key: _amText(k.key).toLowerCase().replace(/[^a-z0-9_-]/g, ''), label: _amText(k.label), symbol: _amText(k.symbol) || '▫' }))
    .filter(k => k.key);
  return gut.length ? gut : AM_KATEGORIEN_STANDARD.slice();
}

/** Die Zusatzfelder aus den Einstellungen – bereinigt, mit sicherem Schlüssel. */
function amZusatzfelder(cfg) {
  const roh = cfg && Array.isArray(cfg.assetZusatzfelder) ? cfg.assetZusatzfelder : [];
  const gesehen = new Set();
  const out = [];
  for (const f of roh) {
    if (!f || !_amText(f.label)) continue;
    const key = (_amText(f.key) || _amText(f.label)).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (!key || gesehen.has(key)) continue;
    gesehen.add(key);
    const typ = AM_ZUSATZ_TYPEN[f.typ] ? f.typ : 'text';
    out.push({ key, label: _amText(f.label), typ, optionen: typ === 'auswahl' ? _amListe(f.optionen) : [], pflicht: !!f.pflicht });
  }
  return out;
}

/* ── Ableitungen ── */

function amRang(stufe) { return AM_SCHUTZBEDARF.indexOf(stufe); }

/**
 * Schutzbedarfs-Vererbung (BSI, Maximumprinzip): Ein Asset braucht mindestens
 * die Verfügbarkeit, die der kritischste Prozess verlangt, der daran hängt.
 * @param {{kritikalitaet:string}[]} prozesse
 */
function amSollVerfuegbarkeit(prozesse) {
  const p = Array.isArray(prozesse) ? prozesse : [];
  if (p.some(x => x.kritikalitaet === 'hoch')) return 'sehr hoch';
  if (p.some(x => x.kritikalitaet === 'mittel')) return 'hoch';
  if (p.length) return 'normal';
  return '';
}

/** Tage bis zu einem Datum (negativ = vorbei); null ohne Datum. */
function amTageBis(datum, heute) {
  if (!datum) return null;
  const a = new Date(String(datum).slice(0, 10) + 'T00:00:00Z').getTime();
  const b = new Date((heute || new Date().toISOString()).slice(0, 10) + 'T00:00:00Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

/** Was in den nächsten `tage` Tagen ausläuft – oder schon vorbei ist. */
function amFaelligkeiten(liste, tage, heute) {
  const grenze = tage || AM_VORLAUF_TAGE;
  const out = [];
  for (const roh of (Array.isArray(liste) ? liste : [])) {
    const a = amVon(roh);
    if (a.status === 'außer Betrieb') continue;
    for (const [feld, was] of [['eol', 'Support / EOL'], ['vertragsende', 'Vertrag']]) {
      const t = amTageBis(a[feld], heute);
      if (t !== null && t <= grenze) out.push({ asset: a, was, datum: a[feld], tage: t, ueberfaellig: t < 0 });
    }
  }
  return out.sort((x, y) => x.tage - y.tage);
}

/**
 * Was einem Asset fehlt. Verweigert wird nichts – ein halb gepflegtes Asset
 * ist besser als keines im Inventar. Aber jede Lücke wird beim Namen genannt.
 * @param {object} roh   Asset
 * @param {object} [ctx] { prozesse: [{kritikalitaet}], heute, kategorien }
 */
function amLuecken(roh, ctx) {
  const a = amVon(roh);
  const c = ctx || {};
  const fehler = [], hinweise = [];
  if (!a.titel) fehler.push('Bezeichnung fehlt.');
  if (!a.kategorie) fehler.push('Kategorie fehlt – ohne sie ist das Inventar nicht auswertbar.');
  if (!a.verantwortlich) fehler.push('Kein Verantwortlicher (A.5.9) – ein Asset ohne Eigentümer pflegt niemand.');
  if (!a.werke.length) fehler.push('Kein Werk zugeordnet – „konzernweit" ist auch eine Antwort.');
  const fehlend = [['vertraulichkeit', 'Vertraulichkeit'], ['integritaet', 'Integrität'], ['verfuegbarkeit', 'Verfügbarkeit']].filter(([f]) => !a[f]).map(([, l]) => l);
  if (fehlend.length === 3) fehler.push('Schutzbedarf nicht festgestellt (Vertraulichkeit, Integrität, Verfügbarkeit).');
  else if (fehlend.length) fehler.push(`Schutzbedarf unvollständig: ${fehlend.join(', ')} fehlt.`);
  const katKey = amKategorieKey(a.kategorie, c.kategorien);
  if (!a.klassifizierung && (katKey === 'information' || amRang(a.vertraulichkeit) >= 1)) {
    fehler.push('Klassifizierung fehlt (A.5.12) – bei Informationen und bei Vertraulichkeit „hoch" Pflicht.');
  }
  // R093: Wer „sehr hoch" verfügbar sein muss, braucht Wiederherstellzeit und RPO.
  if (a.verfuegbarkeit === 'sehr hoch') {
    if (a.wiederherstellung === '') fehler.push('Verfügbarkeit „sehr hoch", aber keine Wiederherstellzeit (Reifegrad R093).');
    if (a.rpo === '') fehler.push('Verfügbarkeit „sehr hoch", aber kein RPO (Reifegrad R093).');
  }
  if (a.status !== 'außer Betrieb') {
    const te = amTageBis(a.eol, c.heute), tv = amTageBis(a.vertragsende, c.heute);
    if (te !== null && te < 0) fehler.push(`Support / EOL abgelaufen seit ${a.eol} – ohne Sicherheitsupdates.`);
    else if (te !== null && te <= AM_VORLAUF_TAGE) hinweise.push(`Support / EOL endet in ${te} Tagen (${a.eol}).`);
    if (tv !== null && tv < 0) fehler.push(`Vertrag abgelaufen seit ${a.vertragsende}.`);
    else if (tv !== null && tv <= AM_VORLAUF_TAGE) hinweise.push(`Vertrag endet in ${tv} Tagen (${a.vertragsende}).`);
  }
  // Vererbung: Prozesse verlangen mehr, als das Asset bietet.
  const soll = amSollVerfuegbarkeit(c.prozesse);
  if (soll && amRang(soll) > amRang(a.verfuegbarkeit)) {
    const n = (c.prozesse || []).filter(p => p.kritikalitaet === 'hoch').length;
    hinweise.push(`Schutzbedarfs-Vererbung: ${n ? `${n} kritische Prozesse hängen daran` : 'Prozesse hängen daran'} → Verfügbarkeit mindestens „${soll}", eingetragen ist „${a.verfuegbarkeit || 'nichts'}".`);
  }
  if ((katKey === 'cloud' || a.lieferant) && !a.supportKontakt) hinweise.push('Lieferant ohne Support-Kontakt (A.5.19) – wen ruft man nachts an?');
  if (a.personenbezogen && (!a.klassifizierung || a.klassifizierung === 'öffentlich')) hinweise.push('Personenbezogene Daten, aber Klassifizierung fehlt oder „öffentlich".');
  if (a.verfuegbarkeit !== 'sehr hoch' && a.verfuegbarkeit && a.wiederherstellung === '') hinweise.push('Keine Wiederherstellzeit – die Prozesse, die daran hängen, können ihre RTO nicht prüfen.');
  return { fehler, hinweise };
}

/* ── Abhängigkeiten zwischen Assets ── */

function _amIndex(liste) {
  const m = new Map();
  for (const roh of (Array.isArray(liste) ? liste : [])) { const a = amVon(roh); if (a.id) m.set(a.id, a); if (a.quelleId) m.set('q:' + a.quelleId, a); }
  return m;
}

/** Die Id im Register zu einer gespeicherten Id – auch wenn die aus der alten Liste stammt. */
function amKanon(liste, id) {
  const m = _amIndex(liste);
  const s = _amText(id);
  if (m.has(s)) return m.get(s).id;
  if (m.has('q:' + s)) return m.get('q:' + s).id;
  return s;
}

/**
 * Was alles mit ausfällt, wenn dieses Asset ausfällt: alle Assets, die
 * (auch mittelbar) davon abhängen. Ohne das Asset selbst; Zyklen sind
 * ungefährlich.
 */
function amAbhaengige(liste, id) {
  const alle = (Array.isArray(liste) ? liste : []).map(amVon);
  const start = amKanon(liste, id);
  const gesehen = new Set([start]);
  const stapel = [start];
  const out = [];
  while (stapel.length) {
    const x = stapel.pop();
    for (const a of alle) {
      if (!a.id || gesehen.has(a.id)) continue;
      if (a.abhaengigVon.map(v => amKanon(liste, v)).includes(x)) { gesehen.add(a.id); stapel.push(a.id); out.push(a); }
    }
  }
  return out;
}

/** Wovon dieses Asset (auch mittelbar) abhängt. */
function amVoraussetzungen(liste, id) {
  const m = _amIndex(liste);
  const start = amKanon(liste, id);
  const gesehen = new Set([start]);
  const stapel = [start];
  const out = [];
  while (stapel.length) {
    const x = m.get(stapel.pop());
    if (!x) continue;
    for (const v of x.abhaengigVon) {
      const k = amKanon(liste, v);
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      const a = m.get(k);
      if (a) { out.push(a); stapel.push(k); }
    }
  }
  return out;
}

/** Ergibt eine Abhängigkeit einen Kreis? (A hängt von B, B von A – das gibt es, aber man sollte es wissen.) */
function amKreis(liste, id, neuVon) {
  const k = amKanon(liste, id), n = amKanon(liste, neuVon);
  if (n === k) return true;
  return amVoraussetzungen(liste, n).some(a => a.id === k);
}

/* ── Sichtbarkeit (Trennung nach Gesellschaft) ── */

function amSichtbar(roh, sichtbareWerke) {
  if (!Array.isArray(sichtbareWerke)) return true;
  const a = amVon(roh);
  if (!a.werke.length || a.werke.includes('ALLE')) return true;
  return a.werke.some(w => sichtbareWerke.includes(w));
}

/* ── Kennzahlen ── */

/**
 * @param {Array} liste       Assets (roh)
 * @param {object} [ctx]      { prozesseVon: (assetId) => [{kritikalitaet}], heute, werke }
 */
function amKennzahlen(liste, ctx) {
  const c = ctx || {};
  const alle = (Array.isArray(liste) ? liste : []).map(amVon).filter(a => amSichtbar(a, c.werke));
  const aktiv = alle.filter(a => a.status !== 'außer Betrieb');
  const z = { gesamt: alle.length, aktiv: aktiv.length, ohneVerantwortlichen: 0, ohneSchutzbedarf: 0, ohneKlassifizierung: 0,
    sehrHoch: 0, sehrHochOhneRto: 0, eolAbgelaufen: 0, faellig: 0, personenbezogen: 0, fehler: 0, hinweise: 0,
    vererbung: 0, kategorien: {}, offen: [] };
  for (const a of aktiv) {
    const l = amLuecken(a, { prozesse: c.prozesseVon ? c.prozesseVon(a.id, a.quelleId) : [], heute: c.heute });
    z.fehler += l.fehler.length; z.hinweise += l.hinweise.length;
    if (l.fehler.length) z.offen.push({ id: a.id, titel: a.titel, fehler: l.fehler });
    if (!a.verantwortlich) z.ohneVerantwortlichen++;
    if (!a.vertraulichkeit && !a.integritaet && !a.verfuegbarkeit) z.ohneSchutzbedarf++;
    if (!a.klassifizierung) z.ohneKlassifizierung++;
    if (a.verfuegbarkeit === 'sehr hoch') { z.sehrHoch++; if (a.wiederherstellung === '') z.sehrHochOhneRto++; }
    const te = amTageBis(a.eol, c.heute);
    if (te !== null && te < 0) z.eolAbgelaufen++;
    if (a.personenbezogen) z.personenbezogen++;
    if (l.hinweise.some(h => /Vererbung/.test(h))) z.vererbung++;
    z.kategorien[a.kategorie || ''] = (z.kategorien[a.kategorie || ''] || 0) + 1;
  }
  z.faellig = amFaelligkeiten(alle, AM_VORLAUF_TAGE, c.heute).length;
  return z;
}

/* ── Der Ausdruck: das Inventar (A.5.9 will es vorzeigbar) ── */

function _amEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

function amInventarHtml(o) {
  const liste = (Array.isArray(o.liste) ? o.liste : []).map(amVon).filter(a => a.status !== 'außer Betrieb' || o.mitAusserBetrieb);
  const kats = o.kategorien || AM_KATEGORIEN_STANDARD;
  const name = o.personName || ((x) => x);
  const kat = (k) => { const x = kats.find(y => y.key === k); return x ? x.label : (k || '–'); };
  const dauer = (h) => (h === '' ? '–' : (h < 1 ? `${Math.round(h * 60)} min` : h < 24 ? `${h} h` : `${+(h / 24).toFixed(1)} Tage`));
  const gruppen = new Map();
  for (const a of liste) { const k = a.kategorie || ''; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(a); }
  const stand = o.stand || new Date().toLocaleString('de-DE');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Assetinventar${o.werkLabel ? ' ' + _amEsc(o.werkLabel) : ''}</title>
    <style>*{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:24px;font-size:11px;line-height:1.4}
      h1{font-size:18px;margin:0 0 2px} h2{font-size:13px;margin:16px 0 4px;color:#17509e;border-bottom:1px solid #17509e} .muted{color:#6b7280}
      table{border-collapse:collapse;width:100%;margin-top:4px} th,td{border:1px solid #d1d5db;padding:3px 5px;text-align:left;vertical-align:top}
      th{background:#1a2644;color:#fff;font-size:10px} .sh{color:#b91c1c;font-weight:700} .h{color:#b45309;font-weight:700}
      .noprint{margin:14px 0} @media print{.noprint{display:none} body{margin:12px} thead{display:table-header-group} tr,h2{break-inside:avoid} h2{break-after:avoid}}</style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    <h1>Assetinventar${o.werkLabel ? ' – ' + _amEsc(o.werkLabel) : ''}</h1>
    <div class="muted">DIHAG · ISO/IEC 27001:2022 A.5.9 (Inventar), A.5.12 (Klassifizierung) · BSI 200-2 Schutzbedarf · Stand ${_amEsc(stand)} · ${liste.length} Assets</div>
    ${[...gruppen.entries()].map(([k, arr]) => `<h2>${_amEsc(kat(k))} (${arr.length})</h2>
      <table><thead><tr><th>Asset</th><th>Werke</th><th>Verantwortlich</th><th>V</th><th>I</th><th>A</th><th>Klassifizierung</th><th>Wiederherst.</th><th>RPO</th><th>Status</th><th>EOL</th><th>Lieferant / Support</th></tr></thead><tbody>${
        arr.sort((x, y) => x.titel.localeCompare(y.titel, 'de')).map(a => { const sb = (v) => v === 'sehr hoch' ? '<span class="sh">sehr hoch</span>' : v === 'hoch' ? '<span class="h">hoch</span>' : (_amEsc(v) || '–');
          return `<tr><td><b>${_amEsc(a.titel)}</b>${a.beschreibung ? `<div class="muted">${_amEsc(a.beschreibung.slice(0, 120))}</div>` : ''}</td><td>${_amEsc(a.werke.includes('ALLE') ? 'konzernweit' : a.werke.join(', ')) || '–'}</td><td>${_amEsc(name(a.verantwortlich)) || '<span class="sh">–</span>'}</td>
            <td>${sb(a.vertraulichkeit)}</td><td>${sb(a.integritaet)}</td><td>${sb(a.verfuegbarkeit)}</td><td>${_amEsc(a.klassifizierung) || '–'}</td><td>${dauer(a.wiederherstellung)}</td><td>${dauer(a.rpo)}</td><td>${_amEsc(a.status)}</td><td>${_amEsc(a.eol) || '–'}</td><td>${_amEsc([a.lieferant || a.hersteller, a.supportKontakt].filter(Boolean).join(' · ')) || '–'}</td></tr>`; }).join('')
      }</tbody></table>`).join('')}
    <p class="muted" style="margin-top:14px">Erstellt aus dem DIHAG-Richtlinienmanagement (rms.dihag.de), Reiter „Assetregister" – deterministisch, ohne KI.</p>
    </body></html>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AM_KATEGORIEN_STANDARD, AM_SCHUTZBEDARF, AM_KLASSIFIZIERUNG, AM_STATUS, AM_ZUSATZ_TYPEN, AM_VORLAUF_TAGE,
    amVon, amKurz, amKategorien, amKategorieKey, amZusatzfelder, amRang, amSollVerfuegbarkeit, amTageBis, amFaelligkeiten, amLuecken,
    amKanon, amAbhaengige, amVoraussetzungen, amKreis, amSichtbar, amKennzahlen, amInventarHtml };
}
