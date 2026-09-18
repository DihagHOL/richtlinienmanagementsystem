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

/**
 * Die Art eines Assets nach ISO 27005: primär (Informationen, Prozesse – das,
 * was geschützt werden soll) oder unterstützend (Systeme, Medien, Personen –
 * das, worauf es liegt). Im Haus steht sie in der Spalte „Asset-Typ".
 */
const AM_ART = ['primär', 'unterstützend'];
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
/** Ein Bewertungswert bleibt, wie die Liste ihn hat – nur klein geschrieben. Verglichen wird über den Rang. */
function _amStufe(v) { return _amText(v).toLowerCase(); }

/**
 * Der Rang eines Schutzbedarfs – tolerant gegen die Skala des Hauses:
 * „sehr hoch", „3 – sehr hoch", „very high" → 2; „hoch", „high", „2", auch
 * „mittel" (die Mitte einer Dreierskala) → 1; „normal", „niedrig", „gering",
 * „low", „1" → 0; alles andere → -1 (bewertet, aber nicht einzuordnen).
 *
 * Bei der Vertraulichkeit steht im Haus die Einstufung: öffentlich und intern
 * → normal, vertraulich → hoch, streng vertraulich (geheim) → sehr hoch.
 */
function amRang(stufe) {
  const s = String(stufe || '').toLowerCase().replace(/[\s_\-–—]+/g, ' ').trim();
  if (!s) return -1;
  if (/sehr ?hoch|very ?high|^3\b|h(ö|oe)chst|kritisch|critical|^sh$|streng|geheim|secret|top/.test(s)) return 2;
  if (/hoch|high|^2\b|erh(ö|oe)ht|^h$|mittel|medium|^m$|vertraulich|confidential/.test(s)) return 1;
  if (/normal|niedrig|gering|low|basis|^1\b|^n$|klein|standard|^0\b|intern|(ö|oe)ffentlich|public/.test(s)) return 0;
  return -1;
}
/** Die BSI-Bezeichnung zu einem Rang. */
function amStufeLabel(rang) { return AM_SCHUTZBEDARF[rang] || ''; }

/** Ein Status des Hauses auf die vier Stufen der App – tolerant. */
function amStatusVon(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return 'aktiv';
  if (/au(ß|ss)er betrieb|ausgemustert|inaktiv|retired|decommission|stillgelegt|entsorgt|abgebaut|ausser|archiv/.test(s)) return 'außer Betrieb';
  if (/beschaffung|geplant|bestellt|planned|ordered|in planung/.test(s)) return 'in Beschaffung';
  if (/auslauf|phase.?out|abk(ü|ue)ndig|ablösung|abloesung|end of life/.test(s)) return 'auslaufend';
  return 'aktiv';
}

/** Eine Klassifizierung des Hauses auf die vier Stufen – tolerant; Unbekanntes bleibt Text. */
function amKlasseVon(text) {
  const s = String(text || '').toLowerCase().trim();
  if (!s) return '';
  if (/streng|strictly|secret|geheim|top/.test(s)) return 'streng vertraulich';
  if (/vertraulich|confidential/.test(s)) return 'vertraulich';
  if (/intern|internal/.test(s)) return 'intern';
  if (/öffentlich|oeffentlich|public/.test(s)) return 'öffentlich';
  return s;
}

/** Die Art eines Assets – tolerant: „Primär", „primary" → primär; „Sekundär", „unterstützend", „supporting" → unterstützend; sonst leer. */
function amArtVon(text) {
  const s = _amText(text).toLowerCase();
  if (!s) return '';
  if (/prim/.test(s)) return 'primär';
  if (/sekund|unterst|support|secondary/.test(s)) return 'unterstützend';
  return '';
}
/** Die Art in Worten für die Liste. */
function amArtText(art) { return art === 'primär' ? 'Primär' : art === 'unterstützend' ? 'Unterstützend' : ''; }

/**
 * Ein Link – aus einer Hyperlink-Spalte ({Url, Description}), aus Text
 * „https://…, Bezeichnung" oder aus einer nackten Adresse.
 * @returns {{url: string, text: string}}
 */
function amLinkVon(v) {
  if (v === null || v === undefined || v === '') return { url: '', text: '' };
  if (typeof v === 'object') return { url: _amText(v.url || v.Url), text: _amText(v.text || v.Description || v.description) };
  const s = _amText(v);
  const m = /^(https?:\/\/\S+?)(?:\s*,\s*(.+))?$/.exec(s);
  if (m) return { url: m[1], text: _amText(m[2]) };
  return { url: '', text: s };
}

/** Ein Asset – immer vollständig, nie undefined. Nimmt Rohes aus der Liste oder aus der Oberfläche. */
function amVon(a) {
  const r = (a && typeof a === 'object') ? a : {};
  const abh = Array.isArray(r.abhaengigVon) ? r.abhaengigVon : [];
  return {
    id: _amText(r.id),
    quelleId: _amText(r.quelleId),            // Id in der alten ISMS-Liste „Assets" (Import)
    titel: _amText(r.titel || r.title),
    art: amArtVon(r.art),                     // primär | unterstützend | ''
    kategorie: _amText(r.kategorie),
    beschreibung: _amText(r.beschreibung),
    link: amLinkVon(r.link),                  // wo die Information liegt bzw. beschrieben ist
    traeger: _amListe(r.traeger),             // Informationsträger aus der Liste, die kein Asset sind (nur Namen)
    werke: _amListe(r.werke).map(w => w.toUpperCase()),
    standort: _amText(r.standort),
    verantwortlich: _amText(r.verantwortlich),
    vertretung: _amText(r.vertretung),
    betreiber: _amText(r.betreiber),
    vertraulichkeit: _amStufe(r.vertraulichkeit),
    integritaet: _amStufe(r.integritaet),
    verfuegbarkeit: _amStufe(r.verfuegbarkeit),
    // Steht bei der Vertraulichkeit die Einstufung (intern, vertraulich …), ist das zugleich die Klassifizierung.
    klassifizierung: amKlasseVon(r.klassifizierung) || (AM_KLASSIFIZIERUNG.includes(amKlasseVon(r.vertraulichkeit)) ? amKlasseVon(r.vertraulichkeit) : ''),
    personenbezogen: r.personenbezogen === true || /^(ja|true|1|yes|x)$/i.test(_amText(r.personenbezogen)),
    status: amStatusVon(r.status),
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
  if (k) t.push(k.label); else if (a.art) t.push(a.art);
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

/* ── Die Liste des Hauses lesen ──
   Die Liste „Assets" auf der ISMS-Site ist gewachsen: „Asset-Typ", „Standorte",
   „Asset-Owner", „Informationsträger", „Link zu den Informationen", „weitere
   Infos" – und Umlaute in den internen Namen („Integrit_x00e4_t"). Hier steht,
   wie die App das liest; der Reiter und der Cron nehmen dasselbe. ── */

/**
 * Gewachsene Namen, unter denen dieselbe Sache in der Liste stehen kann. Beim
 * Lesen werden sie der Reihe nach probiert; beim Schreiben ist der erste
 * vorhandene das Ziel – so entsteht keine zweite Spalte für dieselbe Sache.
 * „Werke" ↔ „Standorte": Im Haus sind die Standorte die Werke. „AbhaengigJson"
 * ↔ „Informationsträger": Worauf eine Information liegt, davon hängt sie ab.
 * Jeder Schlüssel ist eine Spalte, die die App erwartet (ASSET_COLUMNS).
 */
const AM_ALIASE = {
  Art:              ['Asset-Typ', 'AssetTyp', 'AssetType', 'Assetart', 'Typ', 'Type'],
  Kategorie:        ['Category', 'Klasse', 'Assetklasse', 'Typ', 'Type'],
  Beschreibung:     ['Description', 'Bemerkung', 'Kommentar', 'Notizen', 'weitere Infos', 'Weitere Informationen', 'Hinweise', 'Anmerkungen', 'Notes'],
  Werke:            ['Standort', 'Standorte', 'Werk', 'Location', 'Site', 'Gesellschaft'],
  Standort:         ['Raum', 'Gebaeude', 'Gebäude', 'Aufstellort'],
  Verantwortlich:   ['Owner', 'Asset-Owner', 'AssetOwner', 'Eigner', 'Eigentuemer', 'Eigentümer', 'Verantwortlicher', 'Besitzer', 'Verantwortung'],
  Vertretung:       ['Stellvertreter', 'Stellvertretung', 'Vertreter'],
  Betreiber:        ['Operator', 'Administrator'],
  Vertraulichkeit:  ['Confidentiality', 'C'],
  Integritaet:      ['Integrität', 'Integrity', 'I'],
  Verfuegbarkeit:   ['Verfügbarkeit', 'Availability', 'A'],
  Klassifizierung:  ['Classification', 'Klassifikation', 'Einstufung'],
  Personenbezogen:  ['Personendaten', 'DSGVO', 'PII'],
  AStatus:          ['Status', 'Lebenszyklus', 'Zustand'],
  Inbetriebnahme:   ['Anschaffung', 'Anschaffungsdatum', 'Beschaffung'],
  EOL:              ['SupportEnde', 'Support-Ende', 'EndOfLife', 'Ende'],
  Wiederherstellung: ['RTO', 'Wiederherstellzeit', 'Wiederanlaufzeit', 'Wiederanlauf'],
  Rpo:              ['RPO', 'Datenverlust'],
  Backup:           ['Datensicherung', 'Sicherung'],
  AbhaengigJson:    ['Informationsträger', 'Informationstraeger', 'Traeger', 'Träger', 'Abhaengigkeiten', 'Abhängigkeiten', 'HaengtAbVon', 'Hängt ab von', 'DependsOn', 'Dependencies'],
  Link:             ['Link zu den Informationen', 'URL', 'Hyperlink', 'Dokumentation', 'Doku', 'Quelle', 'Informationen'],
  Hersteller:       ['Manufacturer'],
  Lieferant:        ['Dienstleister', 'Supplier', 'Vendor', 'Anbieter'],
  SupportKontakt:   ['Support', 'Hotline', 'Kontakt', 'Ansprechpartner'],
  Vertragsende:     ['Vertragslaufzeit', 'Vertrag', 'Laufzeit'],
  Tags:             ['Schlagworte', 'Stichworte'],
  ZusatzJson:       [],
  HistorieJson:     [],
};

/**
 * Spaltennamen vergleichbar machen: Anzeigename „Integrität", interner Name
 * „Integrit_x00e4_t" und erwarteter Name „Integritaet" sind dasselbe.
 */
function amSpaltenNorm(s) {
  return String(s || '')
    .replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/** Hat diese Spalte die Art als Auswahl (Primär / Sekundär …)? Sonst gilt ein „Typ" als Kategorie. */
function amIstArtSpalte(meta) {
  const ch = (meta && Array.isArray(meta.choices)) ? meta.choices : (meta && meta.choice && Array.isArray(meta.choice.choices)) ? meta.choice.choices : [];
  return ch.length > 0 && ch.some(c => amArtVon(c));
}

/**
 * Die Spalte der Liste zu einem erwarteten Namen – über internen Namen,
 * Anzeigenamen oder Alias. `spalten` = [{name, displayName, choices?}], wie
 * Graph sie liefert. Null, wenn es sie unter keinem Namen gibt.
 * „Typ" kann die Art (primär/unterstützend) oder die Kategorie (Server,
 * Anwendung …) meinen – teilen sich beide eine Spalte, entscheidet deren Auswahl.
 */
function amSpalteFinden(spalten, erwartet, aliase) {
  const AL = (aliase && typeof aliase === 'object') ? aliase : AM_ALIASE;   // andere Listen (Tickets) bringen ihre eigenen Namen mit
  const arr = (Array.isArray(spalten) ? spalten : []).filter(Boolean);
  const such = (e) => {
    for (const k of [e].concat(AL[e] || [])) {
      const n = amSpaltenNorm(k);
      const hit = arr.find(c => c.name === k || amSpaltenNorm(c.name) === n || amSpaltenNorm(c.displayName) === n);
      if (hit) return hit;
    }
    return null;
  };
  const hit = such(erwartet);
  if (!hit) return null;
  if (erwartet === 'Kategorie' || erwartet === 'Art') {
    const andere = such(erwartet === 'Kategorie' ? 'Art' : 'Kategorie');
    if (andere && andere.name === hit.name && amIstArtSpalte(hit) !== (erwartet === 'Art')) return null;
  }
  return hit.name;
}

/**
 * Was beim Laden der Einträge angefordert wird: Nachschlage- und Personen-
 * felder liefern ihren Anzeigewert nur, wenn man sie ausdrücklich auswählt –
 * sonst kommt bloß die LookupId. `feld(erwartet)` → Spaltenname oder null.
 */
function amSelectVon(spalten, feld, aliase) {
  const AL = (aliase && typeof aliase === 'object') ? aliase : AM_ALIASE;
  const arr = (Array.isArray(spalten) ? spalten : []).filter(Boolean);
  const out = new Set(['id', 'Title']);
  const nachschlag = (c) => !!(c && (c.typ === 'lookup' || c.typ === 'person' || c.lookup || c.personOrGroup));
  for (const e of Object.keys(AL)) {
    const n = feld(e);
    if (!n) continue;
    out.add(n);
    if (nachschlag(arr.find(c => c.name === n))) out.add(n + 'LookupId');
  }
  const sb = arr.find(c => amSpaltenNorm(c.name) === 'schutzbedarf' || amSpaltenNorm(c.displayName) === 'schutzbedarf');
  if (sb) out.add(sb.name);
  return [...out].join(',');
}

/** Ein Feld, das Text, Auswahl, Mehrfachauswahl, Nachschlagen, Person oder Hyperlink sein kann – als Text. */
function amFeldText(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(amFeldText).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.Email || v.LookupValue || v.Label || v.Value || v.Title || v.DisplayName || v.Description || v.Url || '');
  return String(v);
}

/**
 * Der Schlüssel im Datensatz zu einem erwarteten Feld. Ist die Spalte bekannt
 * (`name` aus den Spaltenmeta), zählt nur sie – auch wenn sie leer ist, denn ein
 * Alias könnte etwas anderes meinen. Ohne Meta (Cron, Test) werden die Namen
 * direkt probiert: genau, umlautkodiert, normalisiert.
 */
function amFeldKey(f, erwartet, name, aliase) {
  const AL = (aliase && typeof aliase === 'object') ? aliase : AM_ALIASE;
  const da = (k) => { const v = f[k]; return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length); };
  if (name) return da(name) ? name : null;
  if (name === null) return null;
  const kand = [erwartet].concat(AL[erwartet] || []);
  for (const k of kand) if (da(k)) return k;
  const keys = Object.keys(f);
  for (const k of kand) {
    const n = amSpaltenNorm(k);
    const hit = keys.find(x => amSpaltenNorm(x) === n && da(x));
    if (hit) return hit;
  }
  return null;
}

/**
 * Die Werke eines Assets aus dem, was in der Liste steht: Text, Mehrfachwahl
 * (Array), Nachschlagen ({LookupValue}) oder eine Aufzählung „WGC; HOL".
 * Zugeordnet wird tolerant zu den Kürzeln (STANDORTE): „Wittenberge (WGC)"
 * trifft WGC; „alle", „Alle DIHAG-Standorte", „konzernweit" heißt konzernweit
 * ('ALLE'). Was sich nicht zuordnen lässt, bleibt als Text – sichtbar, ohne Wirkung.
 * @returns {{werke: string[], text: string}}
 */
function amWerkeVon(roh, standorte) {
  const teile = [];
  const nimm = (v) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach(nimm); return; }
    if (typeof v === 'object') { nimm(v.LookupValue || v.Label || v.Value || v.Title || ''); return; }
    String(v).split(/[;,|/]+/).map(s => s.trim()).filter(Boolean).forEach(s => teile.push(s));
  };
  nimm(roh);
  const kuerzel = Array.isArray(standorte) ? standorte : [];
  const werke = [];
  for (const t of teile) {
    const u = t.toUpperCase();
    if (/^(ALLE|ALL)\b|KONZERN|GESAMT|^ZENTRAL$|^GRUPPE$/.test(u)) { if (!werke.includes('ALLE')) werke.push('ALLE'); continue; }
    const hit = kuerzel.find(w => u === w.toUpperCase() || new RegExp('(^|[^A-Z])' + w.toUpperCase() + '([^A-Z]|$)').test(u))
      || (/^HOLDING$/.test(u) && kuerzel.includes('HOL') ? 'HOL' : null);
    if (hit && !werke.includes(hit)) werke.push(hit);
  }
  return { werke, text: teile.join(', ') };
}

function _amJson(s, fallback) { try { const v = JSON.parse(String(s || '')); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; } }

/**
 * Wovon ein Asset abhängt – aus der eigenen Spalte (JSON-Liste von Ids), aus
 * einem Nachschlagefeld auf die Liste selbst (die Ids SIND die Ids der Assets)
 * oder aus Namen („Informationsträger" in einer anderen Liste, Text „SharePoint;
 * KeePass"), die später über den Titel aufgelöst werden (amTraegerAufloesen).
 * `lookup(key)` → {selbst, multi} oder null.
 * @returns {{ids: string[], namen: string[]}}
 */
function amAbhaengigLesen(f, key, lookup) {
  const out = { ids: [], namen: [] };
  if (!key) return out;
  const roh = f[key], idsRoh = f[key + 'LookupId'];
  const info = (typeof lookup === 'function') ? lookup(key) : null;
  const nimmId = (v) => {
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) { v.forEach(nimmId); return; }
    if (typeof v === 'object') { nimmId(v.LookupId !== undefined ? v.LookupId : v.id); return; }
    const s = String(v).trim();
    if (s && !out.ids.includes(s)) out.ids.push(s);
  };
  const nimmName = (v) => {
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) { v.forEach(nimmName); return; }
    if (typeof v === 'object') { nimmName(v.LookupValue || v.Title || v.Label || v.Value || ''); return; }
    String(v).split(/[;|]+/).map(s => s.trim()).filter(Boolean).forEach(s => { if (!out.namen.includes(s)) out.namen.push(s); });
  };
  if (typeof roh === 'string' && /^\s*\[/.test(roh)) {
    const arr = _amJson(roh, []);
    if (Array.isArray(arr)) arr.forEach(x => nimmId(typeof x === 'object' && x ? x.id : x));
    return out;
  }
  if (info && info.selbst) {
    nimmId(idsRoh);
    if (roh && typeof roh === 'object') nimmId(roh);
    if (!out.ids.length) nimmName(roh);   // nur, wenn keine Id zu haben war – sonst wären die Namen dieselben Assets
    return out;
  }
  nimmName(roh);
  return out;
}

/**
 * Ein Eintrag der Liste „Assets", gelesen wie das Haus ihn führt – für den
 * Reiter, den Notfall, die Risiken und den Cron dasselbe.
 * @param {object} it    Graph-Element {id, fields, webUrl …} oder nur die Felder
 * @param {object} [opt] { feld: (erwartet) => Spaltenname|null (aus den Spaltenmeta; ohne: Namen direkt probieren),
 *                        standorte: string[], lookup: (name) => {selbst, multi}|null }
 */
function amAusFeldern(it, opt) {
  const o = opt || {};
  const f = (it && it.fields && typeof it.fields === 'object') ? it.fields : (it || {});
  const feld = (typeof o.feld === 'function') ? o.feld : () => undefined;
  const key = (e) => amFeldKey(f, e, feld(e));
  const roh = (e) => { const k = key(e); return k ? f[k] : null; };
  const text = (e) => amFeldText(roh(e)).trim();
  const zahl = (v) => { const n = Number(v); return (v === '' || v === null || v === undefined || !Number.isFinite(n)) ? '' : n; };
  const wk = key('Werke');
  const w = amWerkeVon(wk ? f[wk] : null, o.standorte);
  const sb = amFeldText(f.Schutzbedarf).trim();               // ein einzelner „Schutzbedarf" gilt für alle drei Ziele
  const artRoh = text('Art'), katRoh = text('Kategorie');
  const abh = amAbhaengigLesen(f, key('AbhaengigJson'), o.lookup);
  const a = {
    id: String((it && it.id) || f.id || f.ID || ''),
    quelleId: '',
    titel: _amText(f.Title || f.LinkTitle),
    art: amArtVon(artRoh) || amArtVon(katRoh),                // steht die Art in „Typ", ist das keine Kategorie
    kategorie: amArtVon(katRoh) ? '' : katRoh,
    beschreibung: text('Beschreibung'),
    werke: w.werke,
    werkText: w.text,
    standort: (key('Standort') && key('Standort') !== wk) ? text('Standort') : '',   // steht im „Standort" das Werk, ist er nicht zugleich der Aufstellort
    verantwortlich: text('Verantwortlich'),
    vertretung: text('Vertretung'),
    betreiber: text('Betreiber'),
    vertraulichkeit: (text('Vertraulichkeit') || sb).toLowerCase(),
    integritaet: (text('Integritaet') || sb).toLowerCase(),
    verfuegbarkeit: (text('Verfuegbarkeit') || sb).toLowerCase(),
    klassifizierung: text('Klassifizierung').toLowerCase(),
    personenbezogen: /^(ja|true|1|yes|x)$/i.test(text('Personenbezogen')),
    status: text('AStatus') || 'aktiv',
    inbetriebnahme: text('Inbetriebnahme').slice(0, 10),
    eol: text('EOL').slice(0, 10),
    wiederherstellung: zahl(roh('Wiederherstellung')),
    rpo: zahl(roh('Rpo')),
    backup: text('Backup'),
    abhaengigVon: abh.ids,
    traeger: abh.namen,
    link: amLinkVon(roh('Link')),
    hersteller: text('Hersteller'),
    lieferant: text('Lieferant'),
    supportKontakt: text('SupportKontakt'),
    vertragsende: text('Vertragsende').slice(0, 10),
    tags: text('Tags').split(',').map(x => x.trim()).filter(Boolean),
    zusatz: _amJson(text('ZusatzJson'), {}),
    historie: _amJson(text('HistorieJson'), []),
    created: (it && it.createdDateTime) || '',
    modified: (it && it.lastModifiedDateTime) || '',
    url: (it && it.webUrl) || '',
  };
  if (!Array.isArray(a.historie)) a.historie = [];
  if (!a.zusatz || typeof a.zusatz !== 'object' || Array.isArray(a.zusatz)) a.zusatz = {};
  // Für alle, die Assets bisher nur als {id, title, sub, werke} kannten (Risiken, Notfall).
  a.title = a.titel;
  a.sub = [a.kategorie || a.art, a.werke.includes('ALLE') ? 'konzernweit' : a.werke.join(', '), a.verfuegbarkeit ? 'Verfügbarkeit ' + a.verfuegbarkeit : ''].filter(Boolean).join(' · ');
  return a;
}

/**
 * Informationsträger, die nur als Name kamen, über den Titel den Assets
 * zuordnen – danach hängt „Personaldaten" an „SharePoint" wie jede andere
 * Abhängigkeit. Was kein Asset ist, bleibt als Name stehen.
 */
function amTraegerAufloesen(liste) {
  const arr = Array.isArray(liste) ? liste : [];
  const byTitel = new Map();
  for (const a of arr) { const t = _amText(a.titel || a.title).toLowerCase(); if (t && !byTitel.has(t)) byTitel.set(t, String(a.id)); }
  for (const a of arr) {
    if (!Array.isArray(a.traeger) || !a.traeger.length) continue;
    const ids = Array.isArray(a.abhaengigVon) ? a.abhaengigVon.map(x => String(typeof x === 'object' && x ? x.id : x)) : [];
    const rest = [];
    for (const n of a.traeger) {
      const id = byTitel.get(_amText(n).toLowerCase());
      if (id && id !== String(a.id)) { if (!ids.includes(id)) ids.push(id); } else rest.push(n);
    }
    a.abhaengigVon = ids;
    a.traeger = rest;
  }
  return arr;
}

/* ── Ableitungen ── */

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
 * @param {object} [ctx] { prozesse: [{kritikalitaet}], heute, kategorien, liste: alle Assets (für die Vererbung Asset → Asset) }
 */
function amLuecken(roh, ctx) {
  const a = amVon(roh);
  const c = ctx || {};
  const fehler = [], hinweise = [];
  if (!a.titel) fehler.push('Bezeichnung fehlt.');
  // Führt die Liste nur die Art (primär / unterstützend), ist das die Einteilung des Hauses – keine Lücke.
  if (!a.kategorie && !a.art) fehler.push('Kategorie fehlt – ohne sie ist das Inventar nicht auswertbar.');
  if (!a.verantwortlich) fehler.push('Kein Verantwortlicher (A.5.9) – ein Asset ohne Eigentümer pflegt niemand.');
  if (!a.werke.length) fehler.push('Kein Werk zugeordnet – „konzernweit" ist auch eine Antwort.');
  const fehlend = [['vertraulichkeit', 'Vertraulichkeit'], ['integritaet', 'Integrität'], ['verfuegbarkeit', 'Verfügbarkeit']].filter(([f]) => !a[f]).map(([, l]) => l);
  if (fehlend.length === 3) fehler.push('Schutzbedarf nicht festgestellt (Vertraulichkeit, Integrität, Verfügbarkeit).');
  else if (fehlend.length) fehler.push(`Schutzbedarf unvollständig: ${fehlend.join(', ')} fehlt.`);
  const katKey = amKategorieKey(a.kategorie, c.kategorien);
  if (!a.klassifizierung && (katKey === 'information' || amRang(a.vertraulichkeit) >= 1)) {
    fehler.push('Klassifizierung fehlt (A.5.12) – bei Informationen und bei Vertraulichkeit „hoch" Pflicht.');
  }
  const unklar = [['vertraulichkeit', 'Vertraulichkeit'], ['integritaet', 'Integrität'], ['verfuegbarkeit', 'Verfügbarkeit']].filter(([f]) => a[f] && amRang(a[f]) < 0);
  if (unklar.length) hinweise.push(`Bewertung nicht einzuordnen: ${unklar.map(([f, l]) => `${l} „${a[f]}"`).join(', ')} – die App kennt normal / hoch / sehr hoch (auch „1–3", „low/high").`);
  // Ein primäres Asset (die Information, der Prozess) hat keine eigene Wiederherstellzeit –
  // es erbt sie von seinen Trägern, und das Langsamste zählt. Fehlt sie bei einem Träger, fehlt sie.
  const andere = (Array.isArray(c.liste) ? c.liste : []).map(amVon).filter(x => x.id && x.id !== a.id);
  const unten = andere.filter(x => a.abhaengigVon.includes(x.id));
  const geerbt = (feld) => { if (a.art !== 'primär' || !unten.length) return ''; const v = unten.map(x => x[feld]); return v.every(x => x !== '') ? Math.max(...v) : ''; };
  const rto = a.wiederherstellung !== '' ? a.wiederherstellung : geerbt('wiederherstellung');
  const rpo = a.rpo !== '' ? a.rpo : geerbt('rpo');
  if (a.wiederherstellung === '' && rto !== '') hinweise.push(`Wiederherstellzeit über die Informationsträger: ${rto} h – das Langsamste von ${unten.map(x => `„${x.titel}"`).join(', ')}.`);
  // R093: Wer „sehr hoch" verfügbar sein muss, braucht Wiederherstellzeit und RPO.
  if (amRang(a.verfuegbarkeit) === 2) {
    if (rto === '') fehler.push('Verfügbarkeit „sehr hoch", aber keine Wiederherstellzeit (Reifegrad R093).');
    if (rpo === '') fehler.push('Verfügbarkeit „sehr hoch", aber kein RPO (Reifegrad R093).');
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
  // Vererbung Asset → Asset: Was auf diesem Asset liegt (die Information, der Prozess), verlangt mindestens seinen Schutzbedarf.
  const oben = andere.filter(x => x.status !== 'außer Betrieb' && x.abhaengigVon.includes(a.id));
  for (const [feld, label] of [['vertraulichkeit', 'Vertraulichkeit'], ['integritaet', 'Integrität'], ['verfuegbarkeit', 'Verfügbarkeit']]) {
    const max = oben.reduce((m, x) => Math.max(m, amRang(x[feld])), -1);
    if (max >= 0 && max > amRang(a[feld])) {
      const wer = oben.filter(x => amRang(x[feld]) === max).map(x => `„${x.titel}"`);
      hinweise.push(`Schutzbedarfs-Vererbung: ${wer.slice(0, 3).join(', ')}${wer.length > 3 ? ` (+${wer.length - 3})` : ''} liegt hierauf und verlangt ${label} „${amStufeLabel(max)}", eingetragen ist „${a[feld] || 'nichts'}".`);
    }
  }
  if (a.art === 'primär' && !a.abhaengigVon.length && !a.traeger.length) hinweise.push('Primäres Asset ohne Informationsträger – auf welchem System oder Medium liegt es? Darüber vererbt sich der Schutzbedarf.');
  if ((katKey === 'cloud' || a.lieferant) && !a.supportKontakt) hinweise.push('Lieferant ohne Support-Kontakt (A.5.19) – wen ruft man nachts an?');
  if (a.personenbezogen && (!a.klassifizierung || a.klassifizierung === 'öffentlich')) hinweise.push('Personenbezogene Daten, aber Klassifizierung fehlt oder „öffentlich".');
  if (amRang(a.verfuegbarkeit) !== 2 && a.verfuegbarkeit && rto === '') hinweise.push('Keine Wiederherstellzeit – die Prozesse, die daran hängen, können ihre RTO nicht prüfen.');
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
    vererbung: 0, primaer: 0, kategorien: {}, offen: [] };
  for (const a of aktiv) {
    const l = amLuecken(a, { prozesse: c.prozesseVon ? c.prozesseVon(a.id, a.quelleId) : [], heute: c.heute, liste: alle });
    z.fehler += l.fehler.length; z.hinweise += l.hinweise.length;
    if (l.fehler.length) z.offen.push({ id: a.id, titel: a.titel, fehler: l.fehler });
    if (!a.verantwortlich) z.ohneVerantwortlichen++;
    if (!a.vertraulichkeit && !a.integritaet && !a.verfuegbarkeit) z.ohneSchutzbedarf++;
    if (!a.klassifizierung) z.ohneKlassifizierung++;
    if (amRang(a.verfuegbarkeit) === 2) { z.sehrHoch++; if (a.wiederherstellung === '') z.sehrHochOhneRto++; }
    const te = amTageBis(a.eol, c.heute);
    if (te !== null && te < 0) z.eolAbgelaufen++;
    if (a.personenbezogen) z.personenbezogen++;
    if (l.hinweise.some(h => /Vererbung/.test(h))) z.vererbung++;
    if (a.art === 'primär') z.primaer++;
    z.kategorien[a.kategorie || a.art || ''] = (z.kategorien[a.kategorie || a.art || ''] || 0) + 1;
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
  const kat = (k) => { const x = kats.find(y => y.key === k); return x ? x.label : (k === 'primär' ? 'Primäre Assets (Informationen, Prozesse)' : k === 'unterstützend' ? 'Unterstützende Assets (Systeme, Medien)' : (k || '–')); };
  const titelVon = (id) => { const x = liste.find(y => y.id === String(id)); return x ? x.titel : ''; };
  const dauer = (h) => (h === '' ? '–' : (h < 1 ? `${Math.round(h * 60)} min` : h < 24 ? `${h} h` : `${+(h / 24).toFixed(1)} Tage`));
  const sb = (v) => (amRang(v) === 2 ? `<span class="sh">${_amEsc(v)}</span>` : amRang(v) === 1 ? `<span class="h">${_amEsc(v)}</span>` : (_amEsc(v) || '–'));
  const gruppen = new Map();
  for (const a of liste) { const k = a.kategorie || a.art || ''; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(a); }
  const stand = o.stand || new Date().toLocaleString('de-DE');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Assetinventar${o.werkLabel ? ' ' + _amEsc(o.werkLabel) : ''}</title>
    <style>*{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:24px;font-size:11px;line-height:1.4}
      h1{font-size:18px;margin:0 0 2px} h2{font-size:13px;margin:16px 0 4px;color:#17509e;border-bottom:1px solid #17509e} .muted{color:#6b7280}
      table{border-collapse:collapse;width:100%;margin-top:4px} th,td{border:1px solid #d1d5db;padding:3px 5px;text-align:left;vertical-align:top}
      th{background:#1a2644;color:#fff;font-size:10px} .sh{color:#b91c1c;font-weight:700} .h{color:#b45309;font-weight:700}
      .noprint{margin:14px 0} @media print{.noprint{display:none} body{margin:12px} thead{display:table-header-group} tr,h2{break-inside:avoid} h2{break-after:avoid}}</style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    ${o.kopf || ''}
    <h1>Assetinventar${o.werkLabel ? ' – ' + _amEsc(o.werkLabel) : ''}</h1>
    <div class="muted">DIHAG · ISO/IEC 27001:2022 A.5.9 (Inventar), A.5.12 (Klassifizierung) · BSI 200-2 Schutzbedarf · Stand ${_amEsc(stand)} · ${liste.length} Assets</div>
    ${[...gruppen.entries()].map(([k, arr]) => `<h2>${_amEsc(kat(k))} (${arr.length})</h2>
      <table><thead><tr><th>Asset</th><th>Werke</th><th>Verantwortlich</th><th>V</th><th>I</th><th>A</th><th>Klassifizierung</th><th>Liegt auf / hängt ab von</th><th>Wiederherst.</th><th>RPO</th><th>Status</th><th>EOL</th><th>Lieferant / Support</th></tr></thead><tbody>${
        arr.sort((x, y) => x.titel.localeCompare(y.titel, 'de')).map(a => {
          const traeger = a.abhaengigVon.map(titelVon).filter(Boolean).concat(a.traeger);
          return `<tr><td><b>${_amEsc(a.titel)}</b>${a.beschreibung ? `<div class="muted">${_amEsc(a.beschreibung.slice(0, 120))}</div>` : ''}${a.link.url || a.link.text ? `<div class="muted">🔗 ${_amEsc(a.link.text || a.link.url)}</div>` : ''}</td><td>${_amEsc(a.werke.includes('ALLE') ? 'konzernweit' : a.werke.join(', ')) || '–'}</td><td>${_amEsc(name(a.verantwortlich)) || '<span class="sh">–</span>'}</td>
            <td>${sb(a.vertraulichkeit)}</td><td>${sb(a.integritaet)}</td><td>${sb(a.verfuegbarkeit)}</td><td>${_amEsc(a.klassifizierung) || '–'}</td><td>${_amEsc(traeger.join(', ')) || '–'}</td><td>${dauer(a.wiederherstellung)}</td><td>${dauer(a.rpo)}</td><td>${_amEsc(a.status)}</td><td>${_amEsc(a.eol) || '–'}</td><td>${_amEsc([a.lieferant || a.hersteller, a.supportKontakt].filter(Boolean).join(' · ')) || '–'}</td></tr>`; }).join('')
      }</tbody></table>`).join('')}
    <p class="muted" style="margin-top:14px">Erstellt aus dem DIHAG-Richtlinienmanagement (rms.dihag.de), Reiter „Assetregister" – deterministisch, ohne KI.</p>
    </body></html>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AM_KATEGORIEN_STANDARD, AM_ART, AM_SCHUTZBEDARF, AM_KLASSIFIZIERUNG, AM_STATUS, AM_ZUSATZ_TYPEN, AM_VORLAUF_TAGE, AM_ALIASE,
    amVon, amKurz, amKategorien, amKategorieKey, amZusatzfelder, amRang, amStufeLabel, amStatusVon, amKlasseVon, amArtVon, amArtText, amLinkVon,
    amSpaltenNorm, amIstArtSpalte, amSpalteFinden, amSelectVon, amFeldText, amFeldKey, amWerkeVon, amAbhaengigLesen, amAusFeldern, amTraegerAufloesen,
    amSollVerfuegbarkeit, amTageBis, amFaelligkeiten, amLuecken,
    amKanon, amAbhaengige, amVoraussetzungen, amKreis, amSichtbar, amKennzahlen, amInventarHtml };
}
