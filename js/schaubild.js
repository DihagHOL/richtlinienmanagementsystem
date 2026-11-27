'use strict';

/**
 * Schaubilder in der Bibliothek
 * =============================
 * Zwei Bilder, die das RMS selbst zeichnet und mit den eigenen Registern füllt:
 *
 *   bereiche     Informations-, IT- und Cybersicherheit: was wozu gehört, mit
 *                den Assets aus dem Assetregister je Bereich
 *   risikokurve  Wie viel Sicherheit sich lohnt: Schaden gegen Aufwand, dazu
 *                der Stand des Risiko-Registers
 *
 * Der Text zum Bild steht im Beitrag (wissen.json auf SharePoint). Zahlen und
 * Namen aus den Registern sieht nur, wer den Reiter dazu lesen darf; alle
 * anderen sehen das Bild ohne Zahlen. Gezeichnet wird als SVG im Seitentext,
 * ohne Bibliothek, damit es mit der Seite skaliert und druckt.
 */

/* ── Bereiche ── */

/* Die Asset-Kategorien im Bild. Wo sie stehen: Anwendungen, Server, Netze und
   Endgeräte in der IT-Sicherheit; Cloud-Dienste zwischen IT- und
   Informationssicherheit; Steuerungen nur in der Cybersicherheit;
   Informationen, Schlüsselrollen und Gebäude nur in der Informationssicherheit. */
const SB_KAT_TEXT = {
  anwendung: 'Anwendungen', server: 'Server, Datenbanken', netz: 'Netze', endgeraet: 'Endgeräte',
  cloud: 'Cloud-Dienste und Dienstleister', ot: 'Steuerungen und Maschinen',
  information: 'Informationen', personal: 'Schlüsselrollen', gebaeude: 'Gebäude, Strom',
};
/** Informationen auf Papier: erkannt am Träger oder an der Beschreibung. */
const SB_PAPIER = /papier|ordner|akte|ausdruck|analog/i;
/* Führt das Register eine gemischte Gruppe („Hardware / Software“ und ähnlich),
   steht sie unter ihrem eigenen Namen in der IT-Sicherheit. */
const SB_IT_GEMISCHT = /hardware|software|anwendung|applikation|it-system/i;

function _sbEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _sbKurz(s, n) { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1).trim() + '…' : t; }
/** „z. B. A, B“: ganze Namen, die in `max` Zeichen passen; ein zu langer wird übersprungen. */
function _sbBeispiele(liste, max) {
  let t = '';
  for (const x of liste || []) { const n = t ? t + ', ' + x : x; if (n.length <= max - 6) t = n; }
  if (!t && liste && liste.length) t = _sbKurz(liste[0], max - 6);
  return t ? 'z. B. ' + t : '';
}

/**
 * Die Assets nach Bereichen gezählt, mit Beispielen (die verfügbarsten zuerst)
 * und den Werken. Außer Betrieb Genommenes zählt nicht.
 * @param {object[]} assets  wie amVon sie liefert
 * @param {object} [opt]     { key(kategorie) → Schlüssel, rang(stufe) → Zahl }
 */
function sbBereicheDaten(assets, opt) {
  const o = opt || {};
  const key = typeof o.key === 'function' ? o.key : (k) => String(k || '').trim().toLowerCase();
  const rang = typeof o.rang === 'function' ? o.rang : () => 0;
  const aktiv = (Array.isArray(assets) ? assets : []).filter(a => a && a.status !== 'außer Betrieb');
  const je = {};
  Object.keys(SB_KAT_TEXT).concat(['itGemischt']).forEach(k => { je[k] = { n: 0, beispiele: [], werke: [] }; });
  const gruppen = {}, gemischt = {};
  let ohne = 0;
  aktiv.forEach(a => {
    const roh = String(a.kategorie || '').trim();
    const k = key(roh);
    if (je[k] && k !== 'itGemischt') (gruppen[k] = gruppen[k] || []).push(a);
    else if (roh && SB_IT_GEMISCHT.test(roh)) { (gruppen.itGemischt = gruppen.itGemischt || []).push(a); gemischt[roh] = (gemischt[roh] || 0) + 1; }
    else ohne++;
  });
  // Der Name der gemischten Gruppe ist der, den das Register am häufigsten führt.
  je.itGemischt.name = Object.keys(gemischt).sort((x, y) => gemischt[y] - gemischt[x])[0] || '';
  Object.keys(gruppen).forEach(k => {
    // Beispiele: das Verfügbarste zuerst, bei Gleichstand ein ERP (das kennt jede Geschäftsführung), dann nach Namen.
    const erp = (a) => (/(^|[^a-z])erp($|[^a-z])/i.test(a.titel || '') ? 1 : 0);
    const liste = gruppen[k].slice().sort((x, y) => (rang(y.verfuegbarkeit) - rang(x.verfuegbarkeit)) || (erp(y) - erp(x)) || String(x.titel || '').localeCompare(String(y.titel || ''), 'de'));
    je[k].n = liste.length;
    je[k].beispiele = liste.map(a => a.titel).filter(Boolean).slice(0, 3);
    je[k].werke = [...new Set([].concat(...liste.map(a => a.werke || [])).filter(w => w && w !== 'ALLE'))].sort();
  });
  const papier = (gruppen.information || []).filter(a => SB_PAPIER.test((a.traeger || []).join(' ') + ' ' + (a.beschreibung || ''))).length;
  return { gesamt: aktiv.length, ohneKategorie: ohne, je, papier };
}

/** Ein Textstück im Bild; mit `klick` ein Knopf, der die Assets der Kategorie zeigt. */
function _sbText(x, y, text, cls, anker) {
  return `<text x="${x}" y="${y}" class="${cls || ''}" text-anchor="${anker || 'middle'}">${_sbEsc(text)}</text>`;
}
function _sbKlick(kat, inhalt, klick) {
  if (!klick) return inhalt;
  return `<g class="sb-klick" role="button" tabindex="0" onclick="sbAssetsZeigen(${jsArg(kat)})" onkeydown="if(event.key==='Enter'){sbAssetsZeigen(${jsArg(kat)})}"><title>Im Assetregister zeigen</title>${inhalt}</g>`;
}

/* Kleine Zeichen statt Bildern: Werk, Wolke, Ordner, Person, Haus. */
function _sbWerk(x, y) {
  return `<g class="sb-zeichen" transform="translate(${x},${y})"><path d="M0 34 V12 L12 18 V12 L24 18 V12 L36 18 V2 h6 V18 h6 V34 Z"/><rect x="5" y="24" width="7" height="6" class="sb-fenster"/><rect x="18" y="24" width="7" height="6" class="sb-fenster"/><rect x="31" y="24" width="7" height="6" class="sb-fenster"/></g>`;
}
function _sbWolke(x, y) {
  return `<path class="sb-wolke" transform="translate(${x},${y})" d="M-70 30 C-100 30 -100 -10 -70 -8 C-70 -40 -20 -48 -6 -22 C10 -48 60 -40 56 -6 C92 -8 92 30 62 30 Z"/>`;
}
function _sbOrdner(x, y) {
  return `<g class="sb-zeichen" transform="translate(${x},${y})"><rect x="0" y="0" width="14" height="30" rx="2"/><rect x="17" y="0" width="14" height="30" rx="2"/><circle cx="7" cy="23" r="3" class="sb-fenster"/><circle cx="24" cy="23" r="3" class="sb-fenster"/></g>`;
}
function _sbPerson(x, y) {
  return `<g class="sb-zeichen" transform="translate(${x},${y})"><circle cx="15" cy="9" r="8"/><path d="M0 32 C0 18 30 18 30 32 Z"/></g>`;
}
function _sbHaus(x, y) {
  return `<g class="sb-zeichen" transform="translate(${x},${y})"><path d="M0 14 L15 2 L30 14 V30 H0 Z"/><rect x="11" y="18" width="8" height="12" class="sb-fenster"/></g>`;
}

/**
 * Informations-, IT- und Cybersicherheit als Bild.
 * @param {object|null} d   sbBereicheDaten(...) oder null (ohne Zahlen)
 * @param {object} [opt]    { klick: Bereiche öffnen das Assetregister }
 */
function sbBereicheSvg(d, opt) {
  const klick = !!(d && opt && opt.klick);
  const je = d ? d.je : null;
  const zahl = (k) => (je ? je[k].n : null);
  // „· 12" hinter einer Zeile; 0 heißt: noch nicht im Register.
  const mitZahl = (k, text) => (je ? `${text} · ${zahl(k)}` : text);
  const zeile = (k, x, y, cls) => _sbKlick(k, _sbText(x, y, mitZahl(k, SB_KAT_TEXT[k]), (cls || '') + (je && !zahl(k) ? ' sb-leer' : '')), klick);
  // In der IT-Sicherheit stehen die Kategorien, die es im Register gibt; ist keine da, alle vier mit „· 0“.
  const itAlle = ['anwendung', 'server', 'netz', 'endgeraet', 'itGemischt'];
  const itZeilen = je && itAlle.some(k => zahl(k)) ? itAlle.filter(k => zahl(k)) : itAlle.slice(0, 4);
  const itText = (k) => (k === 'itGemischt' ? je.itGemischt.name : SB_KAT_TEXT[k]);
  const itKlick = (k) => (k === 'itGemischt' ? je.itGemischt.name : k);
  const exY = 252 + itZeilen.length * 24 + 2;
  const anw = je ? _sbBeispiele(je.anwendung.n ? je.anwendung.beispiele : je.itGemischt.beispiele, exY > 360 ? 28 : 32) : '';
  const ringBsp = je ? _sbBeispiele(je.cloud.beispiele, 26) : '';
  const otWerke = je ? je.ot.werke : [];
  return `<svg class="sb-svg" viewBox="0 0 960 560" role="img" aria-label="Informations-, IT- und Cybersicherheit">
  <ellipse class="sb-cyber" cx="385" cy="280" rx="365" ry="255"/>
  <circle class="sb-info" cx="690" cy="280" r="250"/>
  <circle class="sb-it" cx="575" cy="290" r="125"/>

  <path class="sb-leitung" d="M124 174 L182 262 M132 376 L186 318 M347 290 L450 290"/>
  ${_sbWolke(255, 280)}
  ${_sbText(250, 286, 'Internet', 'sb-wolke-text')}

  ${_sbText(255, 88, 'Cybersicherheit', 'sb-titel')}
  ${_sbText(255, 108, 'alles, was über Netze erreichbar ist', 'sb-unter')}
  ${_sbWerk(100, 136)}
  ${_sbText(158, 150, 'Werke', 'sb-fett', 'start')}
  ${_sbKlick('ot', _sbText(158, 167, mitZahl('ot', SB_KAT_TEXT.ot), 'sb-klein' + (je && !zahl('ot') ? ' sb-leer' : ''), 'start'), klick)}
  ${otWerke.length ? _sbText(158, 183, _sbKurz(otWerke.join(' · '), 30), 'sb-klein sb-blass', 'start') : ''}
  <g class="sb-zeichen" transform="translate(112,380)"><rect x="0" y="0" width="38" height="24" rx="3"/><rect x="-6" y="26" width="50" height="5" rx="2"/></g>
  ${_sbText(168, 392, 'Kunden, Lieferanten,', 'sb-klein', 'start')}
  ${_sbText(168, 408, 'Fernwartung', 'sb-klein', 'start')}

  ${_sbText(800, 110, 'Informations-', 'sb-titel')}
  ${_sbText(800, 132, 'sicherheit', 'sb-titel')}
  ${_sbText(815, 156, 'jede Information,', 'sb-unter')}
  ${_sbText(815, 172, 'egal in welcher Form', 'sb-unter')}
  ${je ? zeile('information', 815, 192, 'sb-klein sb-blass') : ''}
  ${_sbOrdner(819, 206)}
  ${_sbText(835, 252, 'Papier, Ordner', 'sb-klein')}
  ${je && d.papier ? _sbText(835, 267, `${d.papier} im Register`, 'sb-klein sb-blass') : ''}
  ${_sbPerson(820, 282)}
  ${_sbText(835, 328, 'Wissen in Köpfen', 'sb-klein')}
  ${je ? zeile('personal', 835, 343, 'sb-klein sb-blass') : ''}
  ${_sbHaus(820, 358)}
  ${je ? zeile('gebaeude', 835, 404, 'sb-klein') : _sbText(835, 404, SB_KAT_TEXT.gebaeude, 'sb-klein')}

  ${_sbText(590, 112, 'Cloud-Dienste', 'sb-klein sb-fett')}
  ${_sbText(590, 128, 'und Dienstleister', 'sb-klein sb-fett')}
  ${je ? _sbKlick('cloud', _sbText(590, 146, zahl('cloud') ? `${zahl('cloud')} im Register` : 'noch nicht im Register', 'sb-klein sb-blass' + (zahl('cloud') ? '' : ' sb-leer')), klick) : _sbText(590, 146, 'unsere Daten bei anderen', 'sb-klein sb-blass')}
  ${ringBsp ? _sbText(585, 446, ringBsp, 'sb-klein sb-blass') : ''}

  ${_sbText(575, 205, 'IT-Sicherheit', 'sb-titel sb-hell')}
  ${_sbText(575, 223, 'unsere Systeme', 'sb-unter sb-hell')}
  ${itZeilen.map((k, i) => _sbKlick(itKlick(k), _sbText(575, 252 + i * 24, mitZahl(k, itText(k)), 'sb-klein sb-hell' + (je && !zahl(k) ? ' sb-leer' : '')), klick)).join('')}
  ${anw ? _sbText(575, exY, anw, 'sb-klein sb-hell sb-blass') : ''}
</svg>`;
}

/* ── Risikokurve ── */

/* Die Stufen wie im Risiko-Register (riskStufe): ab 15 hoch, ab 8 mittel. */
const SB_HOCH = 15, SB_MITTEL = 8;

/**
 * Der Stand des Risiko-Registers in den Worten des Bildes. Geschlossenes zählt nicht.
 * Entschieden ist ein Risiko, wenn es begründet getragen wird oder eine Behandlung
 * mit mindestens einer Maßnahme hat. Ohne Entscheidung: alles andere.
 *   getragen       akzeptiert und begründet
 *   inBehandlung   Status „in Behandlung“
 *   geplant        Status „offen“, Behandlung und Maßnahmen stehen fest
 */
function sbRisikoDaten(risiken) {
  const liste = (Array.isArray(risiken) ? risiken : []).filter(r => r && r.status !== 'geschlossen');
  const score = (b) => (b && b.e && b.a) ? Number(b.e) * Number(b.a) : 0;
  const z = { gesamt: liste.length, hoch: 0, mittel: 0, niedrig: 0, ohneBewertung: 0, ohneEntscheidung: 0, hochOhne: 0, hochGeplant: 0,
    inBehandlung: 0, geplant: 0, getragen: 0, gesenkt: 0 };
  liste.forEach(r => {
    const s = score(r.netto) || score(r.brutto);
    const st = s >= SB_HOCH ? 'hoch' : s >= SB_MITTEL ? 'mittel' : s > 0 ? 'niedrig' : '';
    if (st) z[st]++; else z.ohneBewertung++;
    const getragen = r.behandlung === 'akzeptieren' && String(r.behandlungBegruendung || '').trim() !== '';
    const mitPlan = !!r.behandlung && r.behandlung !== 'akzeptieren' && Array.isArray(r.massnahmen) && r.massnahmen.length > 0;
    if (getragen) z.getragen++;
    else if (r.status === 'in Behandlung') z.inBehandlung++;
    else if (mitPlan) { z.geplant++; if (st === 'hoch') z.hochGeplant++; }
    else { z.ohneEntscheidung++; if (st === 'hoch') z.hochOhne++; }
    if (score(r.netto) && score(r.brutto) && score(r.netto) < score(r.brutto)) z.gesenkt++;
  });
  return z;
}

/* Die Kurven: ein Prinzip, keine Beträge. t läuft von links (viel Restrisiko) nach rechts (keins). */
function _sbSchaden(t) { return Math.pow(1 - t, 1.8); }
function _sbAufwand(t) { return 0.035 / (1.035 - t) - 0.035 / 1.035 + 0.01; }
/** Der günstigste Punkt: die kleinste Summe aus Schaden und Aufwand. */
function sbOptimum() {
  let best = { t: 0, s: Infinity };
  for (let i = 0; i <= 400; i++) { const t = i / 400, s = _sbSchaden(t) + _sbAufwand(t); if (s < best.s) best = { t, s }; }
  return best;
}

/**
 * Wie viel Sicherheit sich lohnt, als Bild.
 * @param {object|null} z   sbRisikoDaten(...) oder null (ohne Zahlen)
 */
function sbKurveSvg(z) {
  const X0 = 110, X1 = 880, Y0 = 70, Y1 = 360, W = X1 - X0, H = Y1 - Y0, YMAX = 1.2;
  const px = (t) => +(X0 + t * W).toFixed(1);
  const py = (v) => +(Y1 - Math.min(v, YMAX) / YMAX * H).toFixed(1);
  const pfad = (f) => { const p = []; for (let i = 0; i <= 120; i++) { const t = i / 120; p.push((i ? 'L' : 'M') + px(t) + ' ' + py(f(t))); } return p.join(' '); };
  const LINKS = 0.38, RECHTS = 0.93;
  const mLinks = px(LINKS * 0.55), mMitte = px((LINKS + RECHTS) / 2), bLinks = px(LINKS / 2);
  const opt = sbOptimum();
  const ox = px(opt.t), oy = py(opt.s);
  // Unter der Achse, je Bereich: was das Register dazu sagt.
  const marke = (x, y, text, cls) => {
    const w = Math.round(text.length * 6.6 + 18);
    return `<g class="sb-marke ${cls}"><rect x="${x - w / 2}" y="${y - 15}" width="${w}" height="22" rx="11"/>${_sbText(x, y, text, 'sb-klein')}</g>`;
  };
  let bei = '';
  if (z) {
    const hohe = (n) => `${n} ${n === 1 ? 'hohes Risiko' : 'hohe Risiken'}`;
    bei = (z.hochOhne ? marke(bLinks, 412, `Bei uns: ${hohe(z.hochOhne)} ohne Entscheidung`, 'sb-marke-rot')
      : z.hochGeplant ? marke(bLinks, 412, `Bei uns: ${hohe(z.hochGeplant)} mit Plan`, 'sb-marke-orange')
      : marke(bLinks, 412, 'Bei uns: kein hohes Risiko offen', 'sb-marke-gruen'))
      + marke(mMitte, 412, `Bei uns: ${z.inBehandlung} in Behandlung, ${z.geplant} geplant, ${z.getragen} bewusst getragen`, 'sb-marke-blau');
  }
  const legende = (x, cls, text) => `<line class="${cls}" x1="${x}" y1="${z ? 447 : 417}" x2="${x + 26}" y2="${z ? 447 : 417}"/>${_sbText(x + 34, z ? 451 : 421, text, 'sb-klein', 'start')}`;
  const unten = z ? 482 : 452;
  return `<svg class="sb-svg" viewBox="0 0 960 ${unten + 14}" role="img" aria-label="Wie viel Sicherheit sich lohnt">
  <rect class="sb-zone-rot" x="${X0}" y="${Y0}" width="${px(LINKS) - X0}" height="${H}"/>
  <rect class="sb-zone-blau" x="${px(LINKS)}" y="${Y0}" width="${px(RECHTS) - px(LINKS)}" height="${H}"/>
  <rect class="sb-zone-grau" x="${px(RECHTS)}" y="${Y0}" width="${X1 - px(RECHTS)}" height="${H}"/>
  ${_sbText(mLinks, Y0 + 24, 'Fahrlässig', 'sb-titel')}
  ${_sbText(mLinks, Y0 + 44, 'hohe Risiken bleiben liegen,', 'sb-unter')}
  ${_sbText(mLinks, Y0 + 60, 'niemand entscheidet', 'sb-unter')}
  ${_sbText(mMitte, Y0 + 24, 'Risikomanagement', 'sb-titel')}
  ${_sbText(mMitte, Y0 + 44, 'bewerten, dann senken, übertragen', 'sb-unter')}
  ${_sbText(mMitte, Y0 + 60, 'oder bewusst tragen', 'sb-unter')}
  <text class="sb-unter sb-fett" transform="translate(${px((RECHTS + 1) / 2) + 4},${Y0 + 14}) rotate(90)">Um jeden Preis</text>

  <path class="sb-kurve-schaden" d="${pfad(_sbSchaden)}"/>
  <path class="sb-kurve-aufwand" d="${pfad(_sbAufwand)}"/>
  <path class="sb-kurve-summe" d="${pfad(t => _sbSchaden(t) + _sbAufwand(t))}"/>
  <line class="sb-hilfslinie" x1="${ox}" y1="${oy}" x2="${ox}" y2="${Y1}"/>
  <line class="sb-hilfslinie" x1="${ox}" y1="${oy - 28}" x2="${ox}" y2="${oy - 9}"/>
  <circle class="sb-optimum" cx="${ox}" cy="${oy}" r="7"/>
  ${_sbText(ox, oy - 48, 'wirtschaftlich am günstigsten:', 'sb-klein sb-fett')}
  ${_sbText(ox, oy - 33, 'kleinste Summe', 'sb-klein sb-fett')}

  <line class="sb-achse" x1="${X0}" y1="${Y1}" x2="${X1 + 8}" y2="${Y1}"/>
  <line class="sb-achse" x1="${X0}" y1="${Y1}" x2="${X0}" y2="${Y0 - 10}"/>
  ${_sbText(X0, Y1 + 22, 'viel Restrisiko', 'sb-klein', 'start')}
  ${_sbText(X1, Y1 + 22, 'kein Restrisiko', 'sb-klein', 'end')}
  ${_sbText((X0 + X1) / 2, Y1 + 22, 'Restrisiko, das wir bewusst tragen', 'sb-klein sb-fett')}
  <text class="sb-klein" transform="translate(${X0 - 18},${(Y0 + Y1) / 2}) rotate(-90)" text-anchor="middle">Euro pro Jahr</text>
  ${bei}
  ${legende(X0, 'sb-kurve-schaden', 'erwarteter Schaden')}${legende(X0 + 230, 'sb-kurve-aufwand', 'Aufwand für Maßnahmen')}${legende(X0 + 500, 'sb-kurve-summe', 'Summe aus beiden')}
  ${_sbText((X0 + X1) / 2, unten, 'Wo genau wir stehen wollen, legt die Geschäftsführung fest.', 'sb-unter sb-fett')}
</svg>`;
}

/* ── Hauptrisiken und Maßnahmen ──
   Drei Bausteine aus dem Risiko-Register, für Geschäftsführung und Werkleitung:
   die hohen Risiken mit dem Stand ihrer Maßnahmen, der Stand aller Maßnahmen mit
   dem, was überfällig ist, und was bei der Geschäftsführung liegt. Es zählen nur
   Risiken, die nicht geschlossen sind. */

function _sbScore(b) { return (b && b.e && b.a) ? Number(b.e) * Number(b.a) : 0; }
function _sbHeute(opt) { return (opt && opt.heute) || new Date().toISOString().slice(0, 10); }
function _sbTag(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; }
/** „Titel: Einzelheiten“ wird zu Kurztitel und Rest; ohne Doppelpunkt bleibt der Titel ganz. */
function _sbKurztitel(t) {
  const s = String(t || '').trim(), i = s.indexOf(': ');
  return i > 0 && i <= 90 ? { kurz: s.slice(0, i), rest: s.slice(i + 2) } : { kurz: s, rest: '' };
}
/** Kürzen an einer Wortgrenze. */
function _sbSatz(s, n) {
  const t = String(s || '').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1), j = cut.lastIndexOf(' ');
  return (j > n * 0.6 ? cut.slice(0, j) : cut).replace(/[,;:(]+$/, '') + ' …';
}
/** Eine Adresse wird zum Namen davor, alles andere bleibt, wie es ist. */
function _sbWer(v) {
  const s = String(v || '').trim(), m = /^([^@\s]+)@/.exec(s);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : s;
}
const SB_GF = /gesch(ä|ae)ftsf(ü|ue)hrung|gesch(ä|ae)ftsleitung|(^|[^a-z])(gf|gl)([^a-z]|$)/i;

/** Alle Maßnahmen der nicht geschlossenen Risiken, mit Risiko und „überfällig“. */
function sbMassnahmen(risiken, opt) {
  const heute = _sbHeute(opt);
  const out = [];
  (Array.isArray(risiken) ? risiken : []).filter(r => r && r.status !== 'geschlossen').forEach(r => {
    (Array.isArray(r.massnahmen) ? r.massnahmen : []).forEach(m => {
      const status = String(m.status || 'offen');
      const frist = String(m.frist || '').slice(0, 10);
      out.push({ titel: String(m.titel || ''), status, frist, verantwortlich: String(m.verantwortlich || ''),
        erledigt: status === 'erledigt', ueberfaellig: status !== 'erledigt' && !!frist && frist < heute,
        risiko: _sbKurztitel(r.titel).kurz, risikoId: r.id, score: _sbScore(r.netto) || _sbScore(r.brutto) });
    });
  });
  return out;
}

/** Die hohen Risiken, das schwerste zuerst, je mit dem Stand seiner Maßnahmen. */
function sbHauptrisiken(risiken, opt) {
  const alle = sbMassnahmen(risiken, opt);
  return (Array.isArray(risiken) ? risiken : [])
    .filter(r => r && r.status !== 'geschlossen' && (_sbScore(r.netto) || _sbScore(r.brutto)) >= SB_HOCH)
    .map(r => {
      const m = alle.filter(x => x.risikoId === r.id);
      return Object.assign(_sbKurztitel(r.titel), { id: r.id, score: _sbScore(r.netto) || _sbScore(r.brutto), status: r.status || 'offen',
        massnahmen: m.length, erledigt: m.filter(x => x.erledigt).length, inUmsetzung: m.filter(x => x.status === 'in Umsetzung').length,
        ueberfaellig: m.filter(x => x.ueberfaellig).length });
    })
    .sort((x, y) => (y.score - x.score) || x.kurz.localeCompare(y.kurz, 'de'));
}

/** Zahlen für die Kacheln und die Listen: überfällig, bald fällig, bei der Geschäftsführung. */
function sbMassnahmenStand(risiken, opt) {
  const heute = _sbHeute(opt);
  const bis = new Date(new Date(heute + 'T00:00:00Z').getTime() + 31 * 864e5).toISOString().slice(0, 10);
  const m = sbMassnahmen(risiken, opt);
  const nachFrist = (x, y) => (x.frist || '9999').localeCompare(y.frist || '9999') || (y.score - x.score);
  return {
    gesamt: m.length, erledigt: m.filter(x => x.erledigt).length, inUmsetzung: m.filter(x => x.status === 'in Umsetzung').length,
    offen: m.filter(x => !x.erledigt && x.status !== 'in Umsetzung').length,
    ueberfaellig: m.filter(x => x.ueberfaellig).sort(nachFrist),
    bald: m.filter(x => !x.erledigt && !x.ueberfaellig && x.frist && x.frist <= bis).sort(nachFrist),
    gf: m.filter(x => !x.erledigt && SB_GF.test(x.verantwortlich)).sort(nachFrist),
  };
}

function _sbMassnahmeZeilen(liste, max, mitRisiko) {
  return `<ul class="sb-mliste">${liste.slice(0, max).map(x => `<li title="${_sbEsc(x.titel)}">
    <span class="sb-frist${x.ueberfaellig ? ' sb-rot' : ''}">${x.frist ? _sbTag(x.frist) : 'ohne Frist'}</span>
    <span class="sb-mtext">${_sbEsc(_sbSatz(x.titel, 110))}${mitRisiko ? `<small>${_sbEsc(_sbSatz(x.risiko, 60))} · ${_sbEsc(_sbWer(x.verantwortlich) || 'niemand benannt')}</small>` : ''}</span></li>`).join('')}</ul>
    ${liste.length > max ? `<div class="sb-mehr">und ${liste.length - max} weitere</div>` : ''}`;
}

/** Die hohen Risiken als Tabelle: Risiko, Bewertung, wie weit die Maßnahmen sind. */
function sbHauptrisikenHtml(liste) {
  if (!liste.length) return '<div class="sb-leerzeile">Im Register steht kein offenes hohes Risiko.</div>';
  return `<table class="sb-tabelle"><thead><tr><th>Risiko</th><th>Bewertung</th><th>Maßnahmen</th></tr></thead><tbody>${liste.map(r => {
    const anteil = r.massnahmen ? Math.round(r.erledigt / r.massnahmen * 100) : 0;
    return `<tr><td><b>${_sbEsc(r.kurz)}</b>${r.rest ? `<small>${_sbEsc(_sbSatz(r.rest, 120))}</small>` : ''}</td>
      <td><span class="sb-score">${r.score}</span><small>${_sbEsc(r.status)}</small></td>
      <td>${r.massnahmen ? `<div class="sb-balken"><span style="width:${anteil}%"></span></div>${r.erledigt} von ${r.massnahmen} erledigt${r.ueberfaellig ? `<small class="sb-rot">${r.ueberfaellig} überfällig</small>` : ''}` : '<span class="sb-rot">keine Maßnahme</span>'}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function sbMassnahmenHtml(s) {
  const kachel = (n, text, cls) => `<div class="sb-kachel ${cls || ''}"><b>${n}</b><span>${text}</span></div>`;
  return `<div class="sb-kacheln">${kachel(s.erledigt, 'erledigt', 'sb-gruen')}${kachel(s.inUmsetzung, 'in Umsetzung')}${kachel(s.offen, 'noch nicht begonnen')}${kachel(s.ueberfaellig.length, 'über der Frist', s.ueberfaellig.length ? 'sb-rot' : 'sb-gruen')}</div>
    ${s.ueberfaellig.length ? `<h4>Über der Frist</h4>${_sbMassnahmeZeilen(s.ueberfaellig, 5, true)}` : ''}
    ${s.bald.length ? `<h4>In den nächsten 30 Tagen fällig</h4>${_sbMassnahmeZeilen(s.bald, 3, true)}` : ''}`;
}

function sbGfHtml(s) {
  if (!s.gf.length) return '<div class="sb-leerzeile">Im Risiko-Register liegt gerade keine offene Maßnahme bei der Geschäftsführung.</div>';
  return _sbMassnahmeZeilen(s.gf, 6, true);
}

/* ── Zusammen: Bild und Zeile darunter ── */

/**
 * Das Schaubild mit der Zeile, woher die Zahlen kommen.
 * @param {string} bild   'bereiche' | 'risikokurve'
 * @param {object[]|null} roh  Assets bzw. Risiken; null = ohne Zahlen
 * @param {object} [opt]  { key, rang, klick }
 */
function sbHtml(bild, roh, opt) {
  const o = opt || {};
  if (bild === 'risikokurve') {
    const z = Array.isArray(roh) ? sbRisikoDaten(roh) : null;
    const fuss = z
      ? `Aus dem Risiko-Register: ${z.gesamt} Risiken offen oder in Behandlung, davon ${z.hoch} hoch, ${z.mittel} mittel, ${z.niedrig} niedrig${z.ohneBewertung ? `, ${z.ohneBewertung} ohne Bewertung` : ''} (Stufen: ab ${SB_HOCH} hoch, ab ${SB_MITTEL} mittel). ${z.ohneEntscheidung ? `Ohne Entscheidung: ${z.ohneEntscheidung}. ` : ''}Geplant heißt: Behandlung und Maßnahmen stehen fest, das Risiko steht aber noch auf „offen“. Bei ${z.gesenkt} ist die Bewertung nach Maßnahmen schon niedriger als vorher. Die Kurven zeigen das Prinzip, Beträge hat das Register nicht.`
      : 'Die Kurven zeigen das Prinzip. Mit Zugriff auf das Risiko-Register steht hier, wo wir stehen.';
    return sbKurveSvg(z) + `<div class="sb-fuss">${_sbEsc(fuss)}${z && o.klick ? ' <button class="btn btn-ghost btn-sm" onclick="sbRisikenZeigen()">Zum Risiko-Register</button>' : ''}</div>`;
  }
  if (bild === 'hauptrisiken' || bild === 'massnahmen' || bild === 'gf') {
    if (!Array.isArray(roh)) return '<div class="sb-leerzeile">Mit Zugriff auf das Risiko-Register stehen hier unsere Risiken und Maßnahmen.</div>';
    const s = sbMassnahmenStand(roh, o);
    const inhalt = bild === 'hauptrisiken' ? sbHauptrisikenHtml(sbHauptrisiken(roh, o)) : bild === 'massnahmen' ? sbMassnahmenHtml(s) : sbGfHtml(s);
    const fuss = bild === 'hauptrisiken' ? `Aus dem Risiko-Register: Risiken mit Bewertung ab ${SB_HOCH}, das schwerste zuerst. Bewertung = Eintritt × Auswirkung, höchstens 25.`
      : bild === 'massnahmen' ? `Aus dem Risiko-Register: ${s.gesamt} Maßnahmen zu den offenen Risiken, Stand ${_sbTag(_sbHeute(o))}.`
      : 'Aus dem Risiko-Register: offene Maßnahmen, bei denen die Geschäftsführung als verantwortlich eingetragen ist.';
    return `<div class="sb-block">${inhalt}</div><div class="sb-fuss">${_sbEsc(fuss)}${o.klick ? ' <button class="btn btn-ghost btn-sm" onclick="sbRisikenZeigen()">Zum Risiko-Register</button>' : ''}</div>`;
  }
  if (bild === 'bereiche') {
    const d = Array.isArray(roh) ? sbBereicheDaten(roh, o) : null;
    const fuss = d
      ? `Aus dem Assetregister: ${d.gesamt} Assets in Betrieb${d.ohneKategorie ? `, ${d.ohneKategorie} davon ohne passende Kategorie und nicht im Bild` : ''}. „· 0“ heißt: noch nicht im Register.${o.klick ? ' Ein Klick auf einen Bereich zeigt die Assets.' : ''}`
      : 'Mit Zugriff auf das Assetregister stehen hier unsere Zahlen.';
    return sbBereicheSvg(d, o) + `<div class="sb-fuss">${_sbEsc(fuss)}</div>`;
  }
  return '<div class="field-hint">Dieses Schaubild gibt es nicht (mehr).</div>';
}

/* ── Im Browser: Daten holen, zeichnen, weiterklicken ── */

let _sbCache = { assets: undefined, risiken: undefined };
function sbCacheLeeren() { _sbCache = { assets: undefined, risiken: undefined }; }
function _sbDarf(view) { return typeof canReadTab === 'function' && canReadTab(view); }

async function _sbAssets() {
  if (_sbCache.assets !== undefined) return _sbCache.assets;
  if (!_sbDarf('assets')) return (_sbCache.assets = null);
  try {
    // Das Assetmodell kommt erst, wenn es gebraucht wird: Die Bibliothek bleibt für alle leicht.
    if (typeof amAusFeldern !== 'function' && typeof modulLaden === 'function') await modulLaden('assetmodell');
    const l = (typeof spGetAssetRegisterLeise === 'function') ? await spGetAssetRegisterLeise() : null;
    // Mit der Trennung nach Gesellschaft nur, was diese Person auch im Register sähe.
    _sbCache.assets = Array.isArray(l) ? l.filter(a => typeof geltungSichtbar !== 'function' || geltungSichtbar(a.werke)) : null;
  } catch (e) { console.warn('[schaubild] Assetregister nicht lesbar:', e.message); _sbCache.assets = null; }
  return _sbCache.assets;
}

async function _sbRisiken() {
  if (_sbCache.risiken !== undefined) return _sbCache.risiken;
  if (!_sbDarf('risiken')) return (_sbCache.risiken = null);
  try {
    const l = (typeof _risks !== 'undefined' && Array.isArray(_risks)) ? _risks
      : (typeof spGetRisksLeise === 'function') ? await spGetRisksLeise() : null;
    _sbCache.risiken = Array.isArray(l) ? l : null;
  } catch (e) { console.warn('[schaubild] Risiko-Register nicht lesbar:', e.message); _sbCache.risiken = null; }
  return _sbCache.risiken;
}

const SB_AUS_RISIKEN = ['risikokurve', 'hauptrisiken', 'massnahmen', 'gf'];
function _sbRoh(bild) { return SB_AUS_RISIKEN.includes(bild) ? _sbRisiken() : bild === 'bereiche' ? _sbAssets() : Promise.resolve(null); }
/** Die Optionen fürs Zeichnen; der Klick ins Register nur mit Leserecht, und nie, wenn `klick` false ist. */
function _sbOptionen(bild, klick) {
  return {
    key: (typeof amKategorieKey === 'function') ? (k) => amKategorieKey(k) : undefined,
    rang: (typeof amRang === 'function') ? amRang : undefined,
    klick: klick !== false && _sbDarf(SB_AUS_RISIKEN.includes(bild) ? 'risiken' : 'assets'),
  };
}

/**
 * Das Bild mit Zahlen nachzeichnen, sobald die Register da sind.
 * @param {object} b         der Beitrag
 * @param {Function} [noch]  sagt, ob die Seite noch dieselbe ist
 */
async function sbZeichnen(b, noch) {
  if (!b || typeof document === 'undefined') return;
  const roh = await _sbRoh(b.bild);
  if (!roh || (typeof noch === 'function' && !noch())) return;
  const el = document.getElementById('sb-bild');
  if (!el) return;
  el.innerHTML = sbHtml(b.bild, roh, _sbOptionen(b.bild));
}

/**
 * Die Platzhalter `[data-schaubild]` in einem Bereich füllen (aus [[schaubild:…]] im
 * Text eines Artikels oder Moduls): sofort ohne Zahlen, dann mit, sobald die Register da sind.
 * @param {Element} root
 * @param {object} [opt]  { klick: false in Folien, wo ein Sprung ins Register stören würde }
 */
async function sbEinbetten(root, opt) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const felder = Array.from(root.querySelectorAll('[data-schaubild]'));
  felder.forEach(el => { el.innerHTML = sbHtml(el.getAttribute('data-schaubild'), null); });
  for (const el of felder) {
    const bild = el.getAttribute('data-schaubild');
    const roh = await _sbRoh(bild);
    if (roh && el.isConnected !== false) el.innerHTML = sbHtml(bild, roh, _sbOptionen(bild, opt && opt.klick));
  }
}

async function sbAssetsZeigen(kat) {
  if (typeof switchView !== 'function') return;
  await switchView('assets');
  // Nur die Kategorie, sonst nichts: Die Zahl im Bild soll die Zahl der Zeilen sein.
  if (typeof _amFilter !== 'undefined') { Object.assign(_amFilter, { q: '', werk: '', kategorie: kat || '', art: '', verf: '', status: '' }); if (typeof renderAssets === 'function') renderAssets(); }
}
async function sbRisikenZeigen() { if (typeof switchView === 'function') await switchView('risiken'); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SB_KAT_TEXT, SB_HOCH, SB_MITTEL, sbBereicheDaten, sbBereicheSvg, sbRisikoDaten, sbKurveSvg, sbOptimum, sbHtml, sbEinbetten,
    sbMassnahmen, sbHauptrisiken, sbMassnahmenStand };
}
