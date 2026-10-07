'use strict';

/**
 * Ziele: das Modell (ohne DOM, ohne SharePoint)
 * =============================================
 * ISO 27001 6.2 verlangt Informationssicherheitsziele, die messbar sind (soweit
 * machbar), überwacht und aktualisiert werden. Zur Planung gehört, was getan
 * wird, mit welchen Ressourcen, wer verantwortlich ist, bis wann und wie das
 * Ergebnis bewertet wird. Die Konzernrichtlinie „Zieleplanung und -erreichung"
 * sagt dasselbe und ergänzt: Bewertet wird im Management Review, ein nicht
 * erreichtes Ziel wird ebenso dokumentiert.
 *
 * Die Ziele stehen in der Liste „ISMS Ziele" auf der ISMS-Site: Ziel,
 * Beschreibung, Umsetzung bis, Messung, Zielerreichung (Ja/Nein), Zieltyp,
 * Status, Verantwortlich (Teams), Maßnahmen (aus der Liste „Maßnahmen"),
 * Standort, Priorität, Bemerkung. Ressourcen führt die Liste an den
 * Maßnahmen; daraus wird hier gelesen, ob sie für ein Ziel festgehalten sind.
 */

/** Status der Liste. laufend = in Arbeit; warn = Termin in Gefahr. */
const ZL_STATUS = [
  { key: 'Nicht begonnen', laufend: true },
  { key: 'Wie geplant',    laufend: true },
  { key: 'Verzögert',      laufend: true, warn: true },
  { key: 'Gefährdet',      laufend: true, warn: true },
  { key: 'Verschoben',     laufend: true, warn: true },
  { key: 'Abgeschlossen',  ende: true },
  { key: 'Gestoppt',       gestoppt: true },
];
const ZL_TYPEN = ['Operativ', 'Strategisch', 'Operativ und strategisch'];
const ZL_PRIO = ['sehr hoch', 'hoch', 'mittel', 'niedrig'];

function zlStatusInfo(k) { return ZL_STATUS.find(x => x.key === k) || ZL_STATUS[0]; }
function zlHeute(d) { return (d ? new Date(d) : new Date()).toISOString().slice(0, 10); }
const _zlText = (v) => String(v == null ? '' : v).trim();
const _zlTag = (v) => { const t = _zlText(v).slice(0, 10); return /^\d{4}-\d\d-\d\d$/.test(t) ? t : ''; };
const _zlListe = (v) => (Array.isArray(v) ? v.filter(x => x && (x.id || x.wert)).map(x => ({ id: String(x.id || ''), wert: _zlText(x.wert) })) : []);

/** Rich-Text der Bemerkung als schlichter Text. */
function zlOhneHtml(s) {
  return _zlText(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#58;/g, ':')
    .replace(/\n{3,}/g, '\n\n'));
}

/** Ein Eintrag der Liste „ISMS Ziele" (aus _hausLesen) → RMS-Ziel. */
function zlAusHaus(roh) {
  const r = roh || {};
  const massnahmen = _zlListe(r.massnahmen);
  return {
    id: r.id ? String(r.id) : null,
    titel: _zlText(r.titel), beschreibung: _zlText(r.beschreibung), termin: _zlTag(r.termin), messung: _zlText(r.messung),
    erreicht: ['Ja', 'Nein'].includes(r.erreicht) ? r.erreicht : '', archiv: !!r.archiv, bemerkung: zlOhneHtml(r.bemerkung),
    zieltyp: ZL_TYPEN.includes(r.zieltyp) ? r.zieltyp : '', status: ZL_STATUS.some(s => s.key === r.status) ? r.status : 'Nicht begonnen',
    teams: _zlListe(r.teams), massnahmenIds: massnahmen.map(m => m.id), massnahmenNamen: massnahmen.map(m => m.wert),
    standort: r.standort && r.standort.id ? { id: String(r.standort.id), wert: _zlText(r.standort.wert) } : null,
    prioritaet: ZL_PRIO.includes(r.prioritaet) ? r.prioritaet : '',
    modified: r.modified || '',
  };
}

/** RMS-Ziel → Felder der Liste (für _hausSchreiben). */
function zlZuHaus(z) {
  const x = z || {};
  const ids = (l) => (Array.isArray(l) ? l.map(e => (e && typeof e === 'object') ? e.id : e).filter(Boolean).map(String) : []);
  return {
    titel: _zlText(x.titel) || '(ohne Titel)', beschreibung: _zlText(x.beschreibung), termin: _zlTag(x.termin), messung: _zlText(x.messung),
    erreicht: ['Ja', 'Nein'].includes(x.erreicht) ? x.erreicht : '', archiv: !!x.archiv,
    // Die Bemerkung ist Rich-Text. Geschrieben wird sie nur, wenn sie im Editor geändert wurde,
    // damit ein bloßes Speichern die Formatierung in SharePoint nicht glättet.
    bemerkung: !x.bemerkungGeaendert ? undefined : _zlText(x.bemerkung).split('\n').map(z2 => z2.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('<br>'),
    zieltyp: ZL_TYPEN.includes(x.zieltyp) ? x.zieltyp : '', status: zlStatusInfo(x.status).key,
    teams: ids(x.teams), massnahmen: ids(x.massnahmenIds), standort: x.standort ? String(x.standort.id || x.standort) : '',
    prioritaet: ZL_PRIO.includes(x.prioritaet) ? x.prioritaet : '',
  };
}

/** erreicht · verfehlt · laufend · gestoppt */
function zlErgebnis(z) {
  const s = zlStatusInfo(z && z.status);
  if (s.gestoppt) return 'gestoppt';
  if (s.ende) return z.erreicht === 'Ja' ? 'erreicht' : z.erreicht === 'Nein' ? 'verfehlt' : 'abgeschlossen';
  return 'laufend';
}

/** Die Maßnahmen eines Ziels (die Liste verknüpft sie am Ziel). */
function zlMassnahmenVon(ziel, massnahmen) {
  const ids = new Set(((ziel && ziel.massnahmenIds) || []).map(String));
  return (massnahmen || []).filter(m => m.id && ids.has(String(m.id)));
}

/** Fortschritt: { gesamt, erledigt, pct } – pct ist null ohne Maßnahmen. */
function zlFortschritt(ziel, massnahmen) {
  const l = zlMassnahmenVon(ziel, massnahmen).filter(m => !m.archiv);
  const erledigt = l.filter(m => m.status === 'erledigt').length;
  return { gesamt: l.length, erledigt, pct: l.length ? Math.round(erledigt / l.length * 100) : null };
}

function zlTerminUeberschritten(z, heute) {
  return !!(z && !z.archiv && z.termin && zlStatusInfo(z.status).laufend && z.termin < (heute || zlHeute()));
}

/**
 * Was dem Ziel fehlt – gemessen an ISO 27001 6.2 und der Konzernrichtlinie.
 * `massnahmen` sind die Einträge der Liste „Maßnahmen" (für Ressourcen und Anzahl).
 */
function zlLuecken(z, massnahmen, heute) {
  const f = [];
  if (!z || !_zlText(z.titel)) f.push('Bezeichnung fehlt.');
  if (!z || z.archiv) return f;
  const s = zlStatusInfo(z.status);
  if (s.gestoppt) { if (!z.bemerkung) f.push('Gestoppt ohne Begründung (Bemerkung).'); return f; }
  if (!(z.teams || []).length) f.push('Niemand ist verantwortlich.');
  if (!z.termin) f.push('Kein Termin („Umsetzung bis").');
  if (!z.messung) f.push('Nicht festgelegt, wie die Zielerreichung gemessen wird.');
  const mass = zlMassnahmenVon(z, massnahmen);
  if (s.laufend) {
    if (!(z.massnahmenIds || []).length) f.push('Keine Maßnahme zur Zielerreichung verknüpft.');
    else if (!mass.some(m => _zlText(m.ressourcen))) f.push('An keiner Maßnahme sind die benötigten Ressourcen festgehalten.');
  }
  if (zlTerminUeberschritten(z, heute)) f.push('Der Termin ist überschritten. Das Ergebnis gehört in die Bewertung im Management Review, auch wenn das Ziel nicht erreicht ist.');
  if (s.ende && !z.erreicht) f.push('Abgeschlossen, aber nicht angegeben, ob das Ziel erreicht wurde.');
  if (s.ende && z.erreicht === 'Nein' && !z.bemerkung) f.push('Nicht erreicht, aber ohne Begründung (Bemerkung). Die Richtlinie verlangt, auch das zu dokumentieren.');
  return f;
}

/** Abschließen geht nur mit Angabe zur Zielerreichung, bei „Nein" mit Bemerkung. */
function zlAbschlussfehler(z) {
  const f = [];
  if (!['Ja', 'Nein'].includes(z && z.erreicht)) f.push('Bitte angeben, ob das Ziel erreicht wurde.');
  if (z && z.erreicht === 'Nein' && !_zlText(z.bemerkung)) f.push('Bei einem nicht erreichten Ziel gehört die Begründung in die Bemerkung.');
  return f;
}

/** Kennzahlen über alle Ziele (ohne Archiv). */
function zlKennzahlen(ziele, massnahmen, heute) {
  const l = (ziele || []).filter(z => z && !z.archiv);
  const laufend = l.filter(z => zlStatusInfo(z.status).laufend);
  return {
    gesamt: l.length,
    laufend: laufend.length,
    erreicht: l.filter(z => zlErgebnis(z) === 'erreicht').length,
    verfehlt: l.filter(z => zlErgebnis(z) === 'verfehlt').length,
    teilweise: 0,
    gefaehrdet: laufend.filter(z => zlStatusInfo(z.status).warn).length,
    ueberschritten: laufend.filter(z => zlTerminUeberschritten(z, heute)).length,
    mitLuecken: l.filter(z => zlLuecken(z, massnahmen, heute).length).length,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ZL_STATUS, ZL_TYPEN, ZL_PRIO, zlStatusInfo, zlHeute, zlOhneHtml, zlAusHaus, zlZuHaus, zlErgebnis,
    zlMassnahmenVon, zlFortschritt, zlTerminUeberschritten, zlLuecken, zlAbschlussfehler, zlKennzahlen,
  };
}
