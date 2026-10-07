'use strict';

/**
 * Ziele: das Modell (ohne DOM, ohne SharePoint)
 * =============================================
 * ISO 27001 6.2 verlangt Informationssicherheitsziele, die zur Leitlinie
 * passen, messbar sind (soweit machbar), überwacht, vermittelt und
 * aktualisiert werden. Zur Planung gehört, was getan wird, mit welchen
 * Ressourcen, wer verantwortlich ist, bis wann und wie das Ergebnis bewertet
 * wird. Die Konzernrichtlinie „Zieleplanung und -erreichung" sagt dasselbe für
 * alle Managementsysteme und legt fest: Die Ziele werden im Management Review
 * festgelegt und dort jährlich bewertet; ein verfehltes Ziel wird ebenso
 * dokumentiert.
 *
 * Bisher standen die Ziele in einem Word-Dokument (Vorlage zur Zieleplanung).
 * Ob die Maßnahmen dazu laufen und was die Kennzahl gerade sagt, stand nirgends
 * daneben. Hier hängen die Maßnahmen aus der Maßnahmenliste und die Kennzahlen
 * aus dem Kennzahlen-Register am Ziel, und was die Richtlinie verlangt, wird
 * beim Namen genannt, solange es fehlt.
 */

const ZL_STATUS = [
  { key: 'entwurf',       label: 'Entwurf',            offen: true },
  { key: 'verabschiedet', label: 'Verabschiedet',      offen: true },
  { key: 'umsetzung',     label: 'In Umsetzung',       offen: true },
  { key: 'erreicht',      label: 'Erreicht',           offen: false, ende: true },
  { key: 'teilweise',     label: 'Teilweise erreicht', offen: false, ende: true },
  { key: 'verfehlt',      label: 'Nicht erreicht',     offen: false, ende: true },
  { key: 'verworfen',     label: 'Verworfen',          offen: false },
];

function zlStatusInfo(k) { return ZL_STATUS.find(x => x.key === k) || ZL_STATUS[0]; }
function zlHeute(d) { return (d ? new Date(d) : new Date()).toISOString().slice(0, 10); }
const _zlText = (v) => String(v == null ? '' : v).trim();
const _zlTag = (v) => { const t = _zlText(v).slice(0, 10); return /^\d{4}-\d\d-\d\d$/.test(t) ? t : ''; };

function zlNormal(z) {
  const x = z || {};
  const b = (x.bewertung && typeof x.bewertung === 'object') ? x.bewertung : null;
  return {
    id: x.id ? String(x.id) : null,
    nr: _zlText(x.nr), titel: _zlText(x.titel), beschreibung: _zlText(x.beschreibung),
    bereich: _zlText(x.bereich) || 'isms', unternehmensziel: _zlText(x.unternehmensziel),
    jahr: _zlText(x.jahr), termin: _zlTag(x.termin), messung: _zlText(x.messung),
    kennzahlIds: Array.isArray(x.kennzahlIds) ? x.kennzahlIds.map(String).filter(Boolean) : [],
    verantwortlich: _zlText(x.verantwortlich), ressourcen: _zlText(x.ressourcen),
    status: ZL_STATUS.some(s => s.key === x.status) ? x.status : 'entwurf',
    verabschiedetAm: _zlTag(x.verabschiedetAm), verabschiedetVon: _zlText(x.verabschiedetVon),
    bewertung: b ? { ergebnis: _zlText(b.ergebnis), text: _zlText(b.text), am: _zlTag(b.am), von: _zlText(b.von), wirkId: _zlText(b.wirkId) } : null,
    werke: Array.isArray(x.werke) ? x.werke.map(_zlText).filter(Boolean) : [],
    historie: Array.isArray(x.historie) ? x.historie : [],
  };
}

/** Nächste Nummer mit Präfix: S01, S02 … (S wie im Haus: Sicherheitsziel). */
function zlNaechsteNr(ziele, praefix) {
  const p = _zlText(praefix) || 'S';
  const re = new RegExp('^' + p.replace(/[^A-Za-z]/g, '') + '(\\d+)$');
  const max = (ziele || []).reduce((n, z) => { const t = re.exec(_zlText(z && z.nr)); return t ? Math.max(n, Number(t[1])) : n; }, 0);
  return p + String(max + 1).padStart(2, '0');
}

/** Die Maßnahmen eines Ziels aus der Maßnahmenliste. */
function zlMassnahmenVon(ziel, massnahmen) {
  const id = ziel && ziel.id ? String(ziel.id) : '';
  return id ? (massnahmen || []).filter(m => String(m.zielId || '') === id && m.status !== 'verworfen') : [];
}

/** Fortschritt der Maßnahmen: { gesamt, erledigt, pct }; pct ist null ohne Maßnahmen. */
function zlFortschritt(ziel, massnahmen) {
  const l = zlMassnahmenVon(ziel, massnahmen);
  const erledigt = l.filter(m => m.status === 'erledigt').length;
  return { gesamt: l.length, erledigt, pct: l.length ? Math.round(erledigt / l.length * 100) : null };
}

function zlTerminUeberschritten(z, heute) {
  const x = zlNormal(z);
  return !!(x.termin && zlStatusInfo(x.status).offen && x.termin < (heute || zlHeute()));
}

/**
 * Was dem Ziel fehlt – gemessen an dem, was ISO 27001 6.2 und die
 * Konzernrichtlinie verlangen. Ein Entwurf darf unvollständig sein; ab
 * „verabschiedet" muss die Planung stehen; ein beendetes Ziel braucht seine
 * Bewertung.
 */
function zlLuecken(z, massnahmen, heute) {
  const x = zlNormal(z);
  const f = [];
  if (!x.titel) f.push('Bezeichnung fehlt.');
  if (x.status === 'verworfen') return f;
  const geplant = x.status !== 'entwurf';
  if (geplant) {
    if (!x.verantwortlich) f.push('Niemand ist verantwortlich.');
    if (!x.termin) f.push('Kein Termin für die Zielerreichung.');
    if (!x.messung && !x.kennzahlIds.length) f.push('Nicht festgelegt, wie die Zielerreichung gemessen wird (Messung oder Kennzahl).');
    if (!x.ressourcen) f.push('Die benötigten Ressourcen sind nicht festgehalten.');
    if (zlStatusInfo(x.status).offen && !zlMassnahmenVon(x, massnahmen).length) f.push('Keine Maßnahme zur Zielerreichung geplant.');
  }
  if (zlTerminUeberschritten(x, heute)) f.push('Der Termin ist überschritten. Das Ergebnis gehört in die Bewertung (Management Review), auch wenn das Ziel verfehlt ist.');
  if (zlStatusInfo(x.status).ende && !(x.bewertung && x.bewertung.text)) f.push('Die Bewertung der Zielerreichung fehlt.');
  return f;
}

/** Ein Ergebnis setzen (erreicht, teilweise, verfehlt) geht nur mit Bewertung. */
function zlAbschlussfehler(z, ergebnis, bewertungText) {
  const f = [];
  if (!zlStatusInfo(ergebnis).ende) f.push('Unbekanntes Ergebnis.');
  if (!_zlText(bewertungText)) f.push('Ohne Bewertung kein Ergebnis: Was wurde erreicht, woran ist es zu sehen?');
  return f;
}

/** Kennzahlen über alle Ziele. */
function zlKennzahlen(ziele, massnahmen, heute) {
  const l = (ziele || []).map(zlNormal).filter(z => z.status !== 'verworfen');
  const laufend = l.filter(z => zlStatusInfo(z.status).offen);
  return {
    gesamt: l.length,
    laufend: laufend.length,
    erreicht: l.filter(z => z.status === 'erreicht').length,
    teilweise: l.filter(z => z.status === 'teilweise').length,
    verfehlt: l.filter(z => z.status === 'verfehlt').length,
    ueberschritten: laufend.filter(z => zlTerminUeberschritten(z, heute)).length,
    ohneKennzahl: laufend.filter(z => !z.kennzahlIds.length).length,
    mitLuecken: l.filter(z => zlLuecken(z, massnahmen, heute).length).length,
  };
}

/* ── Die Vorlage zur Zieleplanung lesen ──
   Die Ziele stehen bisher in „ISMS_Vorlage_Zieleplanung.docx", Ziel für Ziel
   mit denselben Überschriften. Daraus wird ein Vorschlag zum Übernehmen –
   niemand soll sie abtippen. */

const _ZL_MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];

/** „Februar 2027" → 2027-02-28, „12/2025" → 2025-12-31, „31.12.2025" → 2025-12-31, „Q1 2027" → 2027-03-31. */
function zlDatumAusText(s) {
  const t = _zlText(s).toLowerCase().replace(/maerz/g, 'märz');
  const ende = (j, m) => { const d = new Date(Date.UTC(j, m, 0)); return d.toISOString().slice(0, 10); };
  let m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return m[0];
  m = /\bq([1-4])\s*\/?\s*(\d{4})/.exec(t);
  if (m) return ende(Number(m[2]), Number(m[1]) * 3);
  m = /\b(\d{1,2})\s*[/.]\s*(\d{4})\b/.exec(t);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return ende(Number(m[2]), Number(m[1]));
  for (let i = 0; i < 12; i++) {
    const r = new RegExp(_ZL_MONATE[i] + '\\s+(\\d{4})').exec(t);
    if (r) return ende(Number(r[1]), i + 1);
  }
  m = /\b(20\d\d)\b/.exec(t);
  if (m) return `${m[1]}-12-31`;
  return '';
}

const _ZL_FELDER = [
  { re: /^beschreibung\s*:/i, feld: 'beschreibung' },
  { re: /^zielerreichung bis\s*:/i, feld: 'terminText' },
  { re: /^messung der zielerreichung\s*:/i, feld: 'messung' },
  { re: /^verantwortlich\s*:/i, feld: 'verantwortlich' },
  { re: /^ma(ß|ss)nahme\s*:/i, feld: '#massnahme' },
  { re: /^geplantes umsetzungsdatum\s*:/i, feld: 'terminText', m: true },
  { re: /^messung\s*:/i, feld: 'messung', m: true },
  { re: /^ressourcen\s*:/i, feld: 'ressourcen' },
];

/**
 * Ziele aus dem Text der Vorlage.
 * → [{ nr, titel, beschreibung, termin, terminText, messung, verantwortlich, ressourcen,
 *      massnahmen: [{ titel, termin, terminText, verantwortlich, messung, ressourcen }] }]
 */
function zlAusVorlageText(text) {
  const zeilen = String(text || '').split(/\r?\n/).map(s => s.trim());
  const ziele = [];
  let ziel = null, mass = null, feld = null, ziel_obj = null;
  const anhaengen = (obj, f, wert) => { if (!wert) return; obj[f] = obj[f] ? obj[f] + '\n' + wert : wert; };
  for (const z of zeilen) {
    const kopf = /^Ziel\s+([A-Z]{0,3}\d{1,3})\s*[:.–-]\s*(.+)$/.exec(z);
    if (kopf) {
      ziel = { nr: kopf[1], titel: kopf[2].trim(), beschreibung: '', terminText: '', messung: '', verantwortlich: '', ressourcen: '', massnahmen: [] };
      ziele.push(ziel); mass = null; feld = null; ziel_obj = ziel;
      continue;
    }
    if (!ziel) continue;
    if (!z) { feld = null; continue; }   // eine Leerzeile beendet das Feld (danach: Unterschriften, Bilder)
    const def = _ZL_FELDER.find(d => d.re.test(z));
    if (def) {
      const rest = z.replace(def.re, '').trim();
      if (def.feld === '#massnahme') {
        mass = { titel: rest, terminText: '', verantwortlich: '', messung: '', ressourcen: '' };
        ziel.massnahmen.push(mass); ziel_obj = mass; feld = rest ? null : 'titel';
        continue;
      }
      // Nach einer Maßnahme gehören Umsetzungsdatum, Verantwortlich, Messung und
      // Ressourcen zu ihr. Beschreibung, Termin und Messung der Zielerreichung
      // gehören immer zum Ziel.
      const zurMassnahme = def.m || ['verantwortlich', 'ressourcen'].includes(def.feld);
      ziel_obj = (zurMassnahme && mass) ? mass : ziel;
      feld = def.feld;
      anhaengen(ziel_obj, feld, rest);
      continue;
    }
    if (feld && ziel_obj) anhaengen(ziel_obj, feld, z);
  }
  return ziele.map(x => {
    const massnahmen = x.massnahmen.filter(m => m.titel).map(m => Object.assign(m, { termin: zlDatumAusText(m.terminText) }));
    const ressourcen = x.ressourcen || massnahmen.map(m => m.ressourcen).filter(Boolean).join('\n');
    return Object.assign(x, { termin: zlDatumAusText(x.terminText), ressourcen, massnahmen });
  }).filter(x => x.titel);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ZL_STATUS, zlStatusInfo, zlHeute, zlNormal, zlNaechsteNr, zlMassnahmenVon, zlFortschritt, zlTerminUeberschritten,
    zlLuecken, zlAbschlussfehler, zlKennzahlen, zlDatumAusText, zlAusVorlageText,
  };
}
