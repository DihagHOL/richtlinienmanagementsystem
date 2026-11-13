'use strict';

/**
 * Verantwortungskette: wer einen Prozess verantwortet, von der Holding bis
 * zur Rolle im Werk.
 * =========================================================================
 * Drei Ebenen, eine Kette je Prozess der Konzern-Landkarte:
 *
 *   Strategisch    Holding: Prozesseigner, Ziel aus der Unternehmensstrategie,
 *                  Standardisierungsgrad. Eigner und Standard stehen schon an
 *                  der Konzernkachel, das Ziel kommt hier dazu.
 *   Administrativ  Werk: verantwortliche Person und Vertretung. Fehlt der
 *                  Eintrag in der Kette, gilt die gleichnamige Kachel der
 *                  Werks-Landkarte.
 *   Operativ       Rollen aus dem Ablauf: die Bahnen der BPMN-Modelle an der
 *                  Kachel, in denen Menschen arbeiten. Je Werk und Rolle
 *                  Personen und eine Vertretung.
 *
 * Gespeichert wird an der Konzernkachel in prozesslandkarte.json (Feld
 * `kette`), also dort, wo die Holding den Rahmen setzt. Namen stehen nur in
 * dieser Datei auf SharePoint, nie im Code.
 *
 * Bestätigt wird eine Rolle einmal im Jahr über die Liste „Bestaetigungen",
 * mit der Kennung `rolle:<Kachel>:<Werk>:<Rolle>` und dem Jahr als Fassung.
 * Die Kenntnisnahme der Richtlinien zählt nur ihre eigenen Kennungen, die
 * Rollen verfälschen sie also nicht (wie die Bibliothek mit `wissen:`).
 *
 * Dieses Modul rechnet nur. Es lädt nichts und zeichnet nichts, damit der
 * C-Level-Bericht dieselben Zahlen bekommt wie die Ansicht.
 */

const VW_PREFIX = 'rolle:';
/** Ab so vielen Rollen gilt eine Person als Engpass. */
const VW_HAEUFUNG = 4;
/** Ebene „Werk" in Bestätigungen und Listen. */
const VW_WERK_ROLLE = 'Verantwortlich im Werk';
const VW_EIGNER_ROLLE = 'Prozesseigner (Holding)';

/* Aufgaben, die ein Mensch erledigt. Eine Bahn mit mindestens einer davon ist
   eine Rolle. Service-, Skript- und Sendeaufgaben macht die Technik. */
const VW_MENSCH_TYPEN = ['task', 'userTask', 'manualTask'];
const VW_ALLE_TYPEN = ['task', 'userTask', 'manualTask', 'serviceTask', 'scriptTask', 'sendTask', 'receiveTask',
  'businessRuleTask', 'callActivity', 'subProcess'];

/* Bahnen ohne typisierte Aufgabe werden am Namen erkannt. Was hier passt, ist
   Technik und braucht keinen Namen. */
const VW_TECHNIK = /power automate|automatik|automatisch|system|-app\b|\bapp\b|konverter|prüfdienst|pruefdienst|sharepoint|monitoring|github|cron|workflow|azure|schnittstelle|\bbot\b/i;

/**
 * Startpaket: die ersten Ketten. Die Kennungen sind die der SAP-Vorlage der
 * Konzern-Landkarte, der Name ist der Rückfall, falls die Karte anders heißt.
 * Modelle werden über ihren Titel gefunden, IST-Fassungen bleiben außen vor.
 * Die Werke sind die, die heute schon über die Abläufe arbeiten.
 */
const VW_START = [
  { kachel: 'sap-s2p-rechnung', name: 'Rechnungsprüfung', band: 's2p', titel: 'E-Rechnung Eingang',
    modelle: /^E-Rechnung (Rechnungseingang|Eingangsprüfung|Sonstige Rechnung einschätzen|Eingangsrechnung freigeben)$/,
    werke: ['WGC', 'SHB', 'ZAI', 'EWA', 'LEG', 'HOL', 'DSO', 'MEG'] },
  { kachel: 'sap-l2c-faktura', name: 'Faktura', band: 'l2c', titel: 'E-Rechnung Ausgang',
    modelle: /^E-Rechnung (Rechnungsausgang|Erkennen und erfassen|Prüfen und erzeugen|Nebendateien ablegen)$/,
    werke: ['EIS', 'EWA', 'LEG', 'SHB', 'MEG', 'WGC', 'ZAI'] },
  { kachel: 'sap-s2p-bedarf', name: 'Bedarfsanforderung', band: 's2p', titel: 'Bedarfsmeldung',
    modelle: /^Bedarfsanfrage(-Erfassen|-Einkaufsprüfung|-Freigabelauf|-AutoEntwurf)?$/,
    werke: ['SHB'] },
];

/* ── Kleinkram ───────────────────────────────────────────────────────── */

function _vwText(v) { return String(v == null ? '' : v).trim(); }

/** XML-Entitäten auflösen (Bahnnamen kommen als „SharePoint &amp; Monitoring"). */
function vwEntitaeten(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Personen aus einem Feld: Liste oder Text mit Komma, Semikolon, Leerzeichen. */
function vwListe(v) {
  const roh = Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/);
  const gesehen = new Set();
  const out = [];
  roh.forEach(x => {
    const t = _vwText(x);
    if (!t || gesehen.has(t.toLowerCase())) return;
    gesehen.add(t.toLowerCase());
    out.push(t);
  });
  return out;
}

/** Schlüssel einer Rolle: klein, ohne Sonderzeichen. Zwei Schreibweisen einer Rolle sind eine. */
function vwSchluessel(rolle) {
  return _vwText(rolle).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function _vwGleich(a, b) { return _vwText(a).toLowerCase() === _vwText(b).toLowerCase(); }

/* ── Rollen aus den Modellen ─────────────────────────────────────────── */

/**
 * Bahnen eines BPMN-Modells mit der Angabe, ob dort Menschen arbeiten.
 * Liest den Text, ohne DOM, damit es auch im Test läuft.
 * → [{ name, mensch }]
 */
function vwBahnenAusXml(xml) {
  const text = String(xml || '');
  const typVon = {};
  const typMuster = new RegExp('<(?:[A-Za-z0-9_]+:)?(' + VW_ALLE_TYPEN.join('|') + ')\\b([^>]*)>', 'g');
  let m;
  while ((m = typMuster.exec(text))) {
    const id = /\bid="([^"]+)"/.exec(m[2]);
    if (id) typVon[id[1]] = m[1];
  }
  const out = [];
  const gesehen = new Set();
  const bahnMuster = /<(?:[A-Za-z0-9_]+:)?lane\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?lane>)/g;
  while ((m = bahnMuster.exec(text))) {
    const n = /\bname="([^"]*)"/.exec(m[1]);
    const lid = /\bid="([^"]*)"/.exec(m[1]);
    const name = _vwText(vwEntitaeten(n ? n[1] : '')).replace(/\s+/g, ' ');
    if (!name || gesehen.has(name.toLowerCase())) continue;
    gesehen.add(name.toLowerCase());
    const refs = [];
    const refMuster = /<(?:[A-Za-z0-9_]+:)?flowNodeRef>\s*([^<\s]+)\s*<\//g;
    let r;
    while ((r = refMuster.exec(m[3] || ''))) refs.push(r[1]);
    const typen = refs.map(id => typVon[id]).filter(Boolean);
    const mensch = typen.length
      ? typen.some(t => VW_MENSCH_TYPEN.includes(t))
      : !VW_TECHNIK.test(name);
    out.push({ id: lid ? lid[1] : '', name, mensch });
  }
  return out;
}

/**
 * Wo eine Rolle im Ablauf steht: je Modell die Bahn mit ihrem Namen.
 * `modelle` sind die Modelle an der Kachel ({ itemId, title }), `bahnenJe`
 * hält je Modell-Kennung die gelesenen Bahnen.
 * → [{ itemId, titel, bahnId }]
 */
function vwBahnStellen(modelle, bahnenJe, rolle) {
  const s = vwSchluessel(rolle);
  const out = [];
  if (!s) return out;
  (Array.isArray(modelle) ? modelle : []).forEach(p => {
    const bahnen = (bahnenJe && p && bahnenJe[p.itemId]) || [];
    const b = bahnen.find(x => x && x.id && vwSchluessel(x.name) === s);
    if (b) out.push({ itemId: p.itemId, titel: p.title || p.name || '', bahnId: b.id });
  });
  return out;
}

/** Rollen aus mehreren Modellen: nur Bahnen mit Menschen, ohne Doppel, in der Reihenfolge des ersten Auftretens. */
function vwRollenAusBahnen(listen) {
  const out = [];
  (Array.isArray(listen) ? listen : []).forEach(bahnen => (bahnen || []).forEach(b => {
    if (!b || !b.mensch) return;
    if (!out.some(x => vwSchluessel(x) === vwSchluessel(b.name))) out.push(b.name);
  }));
  return out;
}

/* ── Die Kette an der Konzernkachel ──────────────────────────────────── */

/**
 * Die Kette einer Konzernkachel, aufgeräumt. Mit `anlegen` entsteht sie, wenn
 * es sie noch nicht gibt. Bearbeitet wird das Objekt selbst.
 */
function vwKetteVon(k, anlegen) {
  if (!k) return null;
  if (!k.kette || typeof k.kette !== 'object') {
    if (!anlegen) return null;
    k.kette = {};
  }
  const kt = k.kette;
  kt.ziel = _vwText(kt.ziel);
  kt.werke = vwListe(kt.werke).map(w => w.toUpperCase());
  if (!kt.werk || typeof kt.werk !== 'object') kt.werk = {};
  kt.rollen = Array.isArray(kt.rollen) ? kt.rollen.map(_vwText).filter(Boolean) : [];
  kt.extra = Array.isArray(kt.extra) ? kt.extra.map(_vwText).filter(Boolean) : [];
  return kt;
}

/** Alle Rollen der Kette: aus den Modellen und von Hand ergänzt, ohne Doppel. */
function vwRollen(kt) {
  const out = [];
  ((kt && kt.rollen) || []).concat((kt && kt.extra) || []).forEach(r => {
    if (r && !out.some(x => vwSchluessel(x) === vwSchluessel(r))) out.push(r);
  });
  return out;
}

/** Eintrag eines Werks in der Kette (legt ihn an). */
function vwWerkEintrag(kt, werk) {
  if (!kt.werk[werk] || typeof kt.werk[werk] !== 'object') kt.werk[werk] = {};
  const e = kt.werk[werk];
  e.verantwortlich = _vwText(e.verantwortlich);
  e.vertretung = _vwText(e.vertretung);
  if (!e.rollen || typeof e.rollen !== 'object') e.rollen = {};
  e.ohne = Array.isArray(e.ohne) ? e.ohne.map(_vwText).filter(Boolean) : [];
  return e;
}

/** Besetzung einer Rolle in einem Werk (ohne anzulegen). */
function _vwRollenEintrag(e, rolle) {
  if (!e || !e.rollen) return { personen: [], vertretung: '' };
  const key = Object.keys(e.rollen).find(x => vwSchluessel(x) === vwSchluessel(rolle));
  const r = key ? e.rollen[key] : null;
  return { personen: vwListe(r && r.personen), vertretung: _vwText(r && r.vertretung) };
}

/** Rolle in einem Werk setzen. Leere Angaben entfernen den Eintrag. */
function vwRolleSetzen(kt, werk, rolle, personen, vertretung) {
  const e = vwWerkEintrag(kt, werk);
  Object.keys(e.rollen).filter(x => vwSchluessel(x) === vwSchluessel(rolle)).forEach(x => { delete e.rollen[x]; });
  const p = vwListe(personen);
  const v = _vwText(vertretung);
  if (p.length || v) e.rollen[_vwText(rolle)] = { personen: p, vertretung: v };
}

/**
 * Status einer Zelle.
 *   leer            niemand benannt
 *   ohneVertretung  eine Person, keine Vertretung
 *   ok              Vertretung benannt oder mindestens zwei Personen
 */
function vwZellStatus(personen, vertretung) {
  const p = vwListe(personen);
  if (!p.length) return 'leer';
  if (_vwText(vertretung) || p.length >= 2) return 'ok';
  return 'ohneVertretung';
}

/** Gleichnamige Kachel einer Werks-Landkarte (Rückfall für die Ebene Werk). */
function _vwWerkKachel(daten, werk, name) {
  const karte = daten && daten.karten && daten.karten[werk];
  const liste = (karte && Array.isArray(karte.kacheln)) ? karte.kacheln : [];
  const s = vwSchluessel(name);
  return s ? (liste.find(x => vwSchluessel(x.name) === s) || null) : null;
}

/** Ebene Holding. → { eigner, ziel, standard, status: ok | teil | leer } */
function vwHolding(k) {
  const kt = (k && k.kette) || {};
  const eigner = _vwText(k && k.prozesseigner) || _vwText(k && k.verantwortlich);
  const ziel = _vwText(kt.ziel);
  const standard = _vwText(k && k.standardisierung);
  const status = eigner && ziel ? 'ok' : (eigner || ziel ? 'teil' : 'leer');
  return { eigner, ziel, standard, status };
}

/**
 * Die Kette als Tabelle: Werke als Spalten, die Ebene Werk und die Rollen als Zeilen.
 * → { id, name, nr, holding, werke, zeilen: [{ art, rolle, zellen: { WERK: { personen, vertretung, status, geerbt } } }] }
 */
function vwMatrix(daten, k) {
  const kt = vwKetteVon(k, false) || { werke: [], werk: {}, rollen: [], extra: [] };
  const werke = kt.werke.slice();
  const zeilen = [];
  const werkZeile = { art: 'werk', rolle: VW_WERK_ROLLE, zellen: {} };
  werke.forEach(w => {
    const e = kt.werk[w] || {};
    let personen = vwListe(e.verantwortlich);
    let vertretung = _vwText(e.vertretung);
    let geerbt = false;
    if (!personen.length) {
      const wk = _vwWerkKachel(daten, w, k.name);
      if (wk && _vwText(wk.verantwortlich)) {
        personen = vwListe(wk.verantwortlich);
        vertretung = vertretung || _vwText(wk.vertretung);
        geerbt = true;
      }
    }
    werkZeile.zellen[w] = { personen, vertretung, status: vwZellStatus(personen, vertretung), geerbt };
  });
  zeilen.push(werkZeile);
  vwRollen(kt).forEach(rolle => {
    const z = { art: 'rolle', rolle, zellen: {} };
    werke.forEach(w => {
      const e = kt.werk[w] || {};
      if ((e.ohne || []).some(x => vwSchluessel(x) === vwSchluessel(rolle))) {
        z.zellen[w] = { personen: [], vertretung: '', status: 'entfaellt', geerbt: false };
        return;
      }
      const r = _vwRollenEintrag(e, rolle);
      z.zellen[w] = { personen: r.personen, vertretung: r.vertretung, status: vwZellStatus(r.personen, r.vertretung), geerbt: false };
    });
    zeilen.push(z);
  });
  return { id: k.id, name: k.name, nr: k.nr, holding: vwHolding(k), werke, zeilen };
}

/** Konzernkacheln mit Kette, nach Nummer und Name. */
function vwKetten(daten) {
  const karte = daten && daten.karten && daten.karten.KONZERN;
  const liste = (karte && Array.isArray(karte.kacheln)) ? karte.kacheln : [];
  return liste.filter(k => k && k.kette && typeof k.kette === 'object')
    .sort((a, b) => ((a.nr || 9999) - (b.nr || 9999)) || String(a.name || '').localeCompare(String(b.name || ''), 'de'));
}

/* ── Bestätigung ─────────────────────────────────────────────────────── */

function vwBestaetigungsId(kachelId, werk, rolle) {
  return VW_PREFIX + _vwText(kachelId) + ':' + _vwText(werk) + ':' + vwSchluessel(rolle);
}

function vwIstRollenAck(a) { return !!a && String(a.richtlinieId || '').indexOf(VW_PREFIX) === 0; }

/** Hat diese Person diese Rolle im Jahr bestätigt? */
function vwBestaetigt(acks, upn, id, jahr) {
  const u = _vwText(upn).toLowerCase();
  return (acks || []).some(a => vwIstRollenAck(a) && a.richtlinieId === id
    && String(a.version) === String(jahr) && _vwText(a.benutzerUpn).toLowerCase() === u);
}

/**
 * Alle Benennungen: je Person, Kette, Werk und Rolle eine Zeile.
 * Vertretungen zählen mit, sie müssen genauso wissen, dass sie gemeint sind.
 * → [{ upn, kachelId, name, werk, rolle, vertretung, id }]
 */
function vwBenennungen(daten) {
  const out = [];
  const add = (upn, k, werk, rolle, vertretung) => {
    const u = _vwText(upn);
    if (!u) return;
    const label = vertretung ? rolle + ' (Vertretung)' : rolle;
    out.push({ upn: u, kachelId: k.id, name: k.name, werk, rolle: label, vertretung: !!vertretung,
      id: vwBestaetigungsId(k.id, werk, label) });
  };
  vwKetten(daten).forEach(k => {
    const h = vwHolding(k);
    add(h.eigner, k, 'KONZERN', VW_EIGNER_ROLLE, false);
    const mx = vwMatrix(daten, k);
    mx.zeilen.forEach(z => mx.werke.forEach(w => {
      const c = z.zellen[w];
      if (!c || c.status === 'entfaellt' || c.geerbt) return;
      c.personen.forEach(p => add(p, k, w, z.rolle, false));
      add(c.vertretung, k, w, z.rolle, true);
    }));
  });
  return out;
}

/** Meine Benennungen (für „Meine Rollen bestätigen"). */
function vwMeineRollen(daten, upn) {
  return vwBenennungen(daten).filter(b => _vwGleich(b.upn, upn));
}

/** Darf diese Person die Namen der operativen Ebene in diesem Werk sehen? */
function vwNamenSichtbar(werk, meineWerke) {
  const m = Array.isArray(meineWerke) ? meineWerke : ['*'];
  return m.includes('*') || m.includes(werk);
}

/* ── Kennzahlen (Ansicht und C-Level-Bericht) ────────────────────────── */

/**
 * Kennzahlen über alle Ketten.
 * `daten` ist der Inhalt von prozesslandkarte.json, `opt` trägt acks (Bestätigungen),
 * members (Verzeichnis) und jahr.
 */
function vwKennzahlen(daten, opt) {
  const o = opt || {};
  const jahr = o.jahr || new Date().getFullYear();
  const ketten = vwKetten(daten);
  const z = { ketten: ketten.length, holdingOk: 0, zellen: 0, besetzt: 0, ohneVertretung: 0, leer: 0,
    vollBesetzt: 0, quote: 0, personen: 0, haeufung: [], unbekannt: [], benennungen: 0, bestaetigt: 0,
    bestaetigtQuote: 0, lueckenJeWerk: {} };
  ketten.forEach(k => {
    if (vwHolding(k).status === 'ok') z.holdingOk++;
    const mx = vwMatrix(daten, k);
    let voll = mx.werke.length > 0 && vwHolding(k).status === 'ok';
    mx.zeilen.forEach(zl => mx.werke.forEach(w => {
      const c = zl.zellen[w];
      if (!c || c.status === 'entfaellt') return;
      z.zellen++;
      if (c.status === 'leer') {
        z.leer++; voll = false;
        z.lueckenJeWerk[w] = (z.lueckenJeWerk[w] || 0) + 1;
      } else {
        z.besetzt++;
        if (c.status === 'ohneVertretung') { z.ohneVertretung++; voll = false; }
      }
    }));
    if (voll) z.vollBesetzt++;
  });
  z.quote = z.zellen ? Math.round(z.besetzt / z.zellen * 100) : 0;

  const ben = vwBenennungen(daten);
  z.benennungen = ben.length;
  const jePerson = {};
  ben.forEach(b => {
    const u = b.upn.toLowerCase();
    jePerson[u] = jePerson[u] || { upn: b.upn, n: 0 };
    if (!b.vertretung) jePerson[u].n++;
  });
  z.personen = Object.keys(jePerson).length;
  z.haeufung = Object.values(jePerson).filter(p => p.n >= VW_HAEUFUNG).sort((a, b) => b.n - a.n);
  const mitglieder = Array.isArray(o.members) ? o.members : [];
  if (mitglieder.length) {
    const bekannt = new Set(mitglieder.map(m => _vwText(m.upn).toLowerCase()));
    z.unbekannt = Object.values(jePerson).map(p => p.upn).filter(u => !bekannt.has(u.toLowerCase()));
  }
  z.bestaetigt = ben.filter(b => vwBestaetigt(o.acks, b.upn, b.id, jahr)).length;
  z.bestaetigtQuote = ben.length ? Math.round(z.bestaetigt / ben.length * 100) : 0;
  return z;
}

/* ── Startpaket ──────────────────────────────────────────────────────── */

/**
 * Die Konzernkachel zu einem Eintrag des Startpakets: über die Kennung, sonst
 * über den Namen. Fehlt sie, entsteht sie im passenden Band (oder im ersten).
 * → { kachel, neu }
 */
function vwStartKachel(daten, s, neueId) {
  if (!daten.karten) daten.karten = {};
  if (!daten.karten.KONZERN) daten.karten.KONZERN = { baender: [], kacheln: [] };
  const karte = daten.karten.KONZERN;
  if (!Array.isArray(karte.kacheln)) karte.kacheln = [];
  const da = karte.kacheln.find(k => k.id === s.kachel)
    || karte.kacheln.find(k => vwSchluessel(k.name) === vwSchluessel(s.name));
  if (da) return { kachel: da, neu: false };
  const baender = Array.isArray(karte.baender) ? karte.baender : [];
  const band = (baender.find(b => b.key === s.band) || baender[0] || { key: s.band }).key;
  const id = karte.kacheln.some(k => k.id === s.kachel) ? (neueId || s.kachel + '-2') : s.kachel;
  const kachel = { id, band, name: s.name, unter: s.titel, geltung: s.werke.slice() };
  karte.kacheln.push(kachel);
  return { kachel, neu: true };
}

/**
 * Startpaket anwenden: Modelle verknüpfen, Kette mit Werken anlegen. Was schon
 * da ist, bleibt: verknüpfte Modelle, Werke, Namen.
 * @param modelle  geladene Modellliste [{ itemId, title }]
 * → [{ name, titel, modelle, werke, neu }]
 */
function vwStartpaketAnwenden(daten, modelle) {
  const liste = Array.isArray(modelle) ? modelle : [];
  return VW_START.map(s => {
    const { kachel, neu } = vwStartKachel(daten, s);
    const verweise = Array.isArray(kachel.prozesse) ? kachel.prozesse
      : (kachel.prozessId || kachel.prozessName) ? [{ id: kachel.prozessId || '', name: kachel.prozessName || '' }] : [];
    let dazu = 0;
    liste.filter(p => s.modelle.test(_vwText(p.title))).forEach(p => {
      if (verweise.some(v => v.id === p.itemId || _vwGleich(v.name, p.title))) return;
      verweise.push({ id: p.itemId, name: p.title });
      dazu++;
    });
    kachel.prozesse = verweise;
    delete kachel.prozessId; delete kachel.prozessName;
    const kt = vwKetteVon(kachel, true);
    s.werke.forEach(w => { if (!kt.werke.includes(w)) kt.werke.push(w); });
    return { name: kachel.name, titel: s.titel, modelle: dazu, werke: kt.werke.length, neu };
  });
}

/** Fehlt noch ein Eintrag des Startpakets? */
function vwStartpaketOffen(daten) {
  const karte = daten && daten.karten && daten.karten.KONZERN;
  const liste = (karte && Array.isArray(karte.kacheln)) ? karte.kacheln : [];
  return VW_START.some(s => {
    const k = liste.find(x => x.id === s.kachel) || liste.find(x => vwSchluessel(x.name) === vwSchluessel(s.name));
    return !k || !k.kette;
  });
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VW_PREFIX, VW_HAEUFUNG, VW_START, VW_WERK_ROLLE, VW_EIGNER_ROLLE,
    vwEntitaeten, vwListe, vwSchluessel, vwBahnenAusXml, vwBahnStellen, vwRollenAusBahnen, vwKetteVon, vwRollen,
    vwWerkEintrag, vwRolleSetzen, vwZellStatus, vwHolding, vwMatrix, vwKetten, vwBestaetigungsId,
    vwIstRollenAck, vwBestaetigt, vwBenennungen, vwMeineRollen, vwNamenSichtbar, vwKennzahlen,
    vwStartKachel, vwStartpaketAnwenden, vwStartpaketOffen,
  };
}
