'use strict';

/**
 * Managementhandbuch
 * ==================
 * Der Reiter „Managementhandbuch“ leitet ein Handbuch des integrierten
 * Managementsystems aus den Daten des RMS her. Gegliedert ist es nach der
 * gemeinsamen Struktur der ISO-Managementsystemnormen (Abschnitte 4 bis 10),
 * die ISO 9001, 14001, 45001, 50001 und 27001 teilen.
 *
 * Was das RMS weiß, wird übernommen: das Verfahren aus dem Katalog der
 * RMS-Prozesse, die Prozesslandschaft und ihre Eigner aus der Landkarte, das
 * Konzernregelwerk aus der Governance-Struktur, die Pflichtschulungen aus
 * „Wissen“. Was nur die Geschäftsführung entscheiden kann (Kontext, Strategie,
 * Politik, Zusagen der Leitung), wird nicht erfunden, sondern als offen
 * markiert. Jeder Abschnitt trägt deshalb einen Status:
 *   daten   aus dem RMS hergeleitet
 *   teils   hergeleitet, die Lücke wird genannt
 *   offen   nicht herleitbar, Entscheidung nötig
 *
 * Ein Handbuch beschreibt das System und seine Verantwortung. Kennzahlen zur
 * Lage (offene Risiken, Vorfälle, BIA) stehen nicht darin: Sie wären nach
 * Tagen überholt und gehören in den C-Level-Bericht. Die wenigen Zahlen
 * tragen ihren Stand im Text.
 *
 * Der Entwurf entsteht bei jedem Öffnen neu aus den Daten und wird nicht
 * gespeichert. „Stand veröffentlichen“ legt eine Fassung ab
 * (managementhandbuch.json); alle mit Leserecht auf den Reiter sehen nur diese.
 *
 * mhBauen, mhAnsichtHtml und mhDruckHtml sind rein (getestet ohne Browser).
 */

const MH_STATUS = {
  daten: { symbol: '●', label: 'aus dem RMS hergeleitet', kurz: 'hergeleitet', farbe: '#15803d' },
  teils: { symbol: '◐', label: 'teils hergeleitet, Lücke genannt', kurz: 'teils', farbe: '#F08300' },
  offen: { symbol: '○', label: 'offen, Entscheidung nötig', kurz: 'offen', farbe: '#b91c1c' },
};
const MH_REGELWERK_STATUS = { gueltig: 'gültig', arbeit: 'in Arbeit', offen: 'offen' };
const MH_SYSTEME = 'ISO 9001, ISO 14001, ISO 45001, ISO 50001 und ISO 27001 (integriertes Managementsystem)';

/** Die Reiter, in denen eine Angabe gepflegt wird. */
const MH_QUELLE = {
  prozesse:   { view: 'prozesse',    label: 'Prozesse & Landkarte' },
  govstruktur: { view: 'govstruktur', label: 'Governance-Struktur' },
  abdeckung:  { view: 'abdeckung',   label: 'IMS-Abdeckung' },
  risiken:    { view: 'risiken',     label: 'Risiko-Register' },
  ziele:      { view: 'ziele',       label: 'Ziele' },
  kennzahlen: { view: 'kennzahlen',  label: 'Kennzahlen' },
  assets:     { view: 'assets',      label: 'Assetregister' },
  wissen:     { view: 'wissen',      label: 'Wissen' },
  ismsdocs:   { view: 'ismsdocs',    label: 'IMS-Dokumente' },
  verwaltung: { view: 'verwaltung',  label: 'Regelwerk Dashboard' },
  freigaben:  { view: 'freigaben',   label: 'Freigaben' },
  wirksamkeit: { view: 'wirksamkeit', label: 'Wirksamkeit & Verbesserung' },
  notfall:    { view: 'notfall',     label: 'Notfall & Krisenstab' },
  vorfaelle:  { view: 'vorfaelle',   label: 'Vorfälle & Ereignisse' },
  massnahmen: { view: 'massnahmen',  label: 'Maßnahmen' },
};

/* ── Herleiten ───────────────────────────────────────────────────────── */

/**
 * Das Handbuch aus den Quellen bauen.
 * q: { stand, katalog(name), lk (Daten der Landkarte), gov (Governance-Struktur), policies [{status}],
 *      kurse [{titel, wiederholung}], normen [Gruppennamen], werke [Kürzel], personName(upn), fehler [Text] }
 * Jede Quelle darf fehlen: Der Abschnitt zeigt dann seine Lücke, statt zu erfinden.
 */
function mhBauen(q) {
  const o = q || {};
  const stand = String(o.stand || '');
  const kat = (typeof o.katalog === 'function') ? o.katalog : () => null;
  const heissen = (n) => String(n || '').replace(/\s*\(RMS\)\s*$/, '');
  const eindeutig = (xs) => [...new Set(xs.filter(Boolean))];
  const sl = (s) => MH_REGELWERK_STATUS[s] || String(s || '');
  const lkKonzern = o.lk && o.lk.karten && o.lk.karten.KONZERN;
  const lkm = (lkKonzern && Array.isArray(lkKonzern.kacheln) && lkKonzern.kacheln.length && typeof lkBerichtDaten === 'function')
    ? lkBerichtDaten(o.lk, 'KONZERN', { personName: o.personName, stand, werkLabel: 'Konzern' }) : null;
  const lkOffen = (titel) => lkm ? lkm.offen.filter(x => x.titel === titel).map(x => x.text) : [];
  const keineLandkarte = 'Die Prozesslandkarte des Konzerns liegt nicht vor oder ist leer.';

  const tab = (titel, kopf, zeilen) => ({ titel: titel || '', kopf, zeilen });
  const abschnitt = (nr, titel, a) => {
    const x = Object.assign({ absaetze: [], tabellen: [], proz: [], offen: [], quelle: [] }, a || {});
    const namen = x.proz.filter(n => kat(n));
    const verfahren = namen.map(n => { const p = kat(n); return { titel: heissen(p.name), text: (Array.isArray(p.beschreibung) ? p.beschreibung : []).slice(0, 2).join(' ') }; });
    const normbezug = eindeutig(namen.map(n => String(kat(n).norm || '').trim()));
    const hatInhalt = x.absaetze.length > 0 || x.tabellen.some(t => t.zeilen.length) || verfahren.length > 0;
    // Ein Abschnitt ohne Inhalt nennt immer, warum er leer ist, auch wenn eine Quelle fehlt.
    const offen = (!hatInhalt && !x.offen.length) ? ['Dazu liegt im RMS keine Beschreibung vor.'] : x.offen;
    return { nr, titel, status: !hatInhalt ? 'offen' : offen.length ? 'teils' : 'daten',
      verfahren, absaetze: x.absaetze, tabellen: x.tabellen.filter(t => t.zeilen.length), normbezug, offen, quelle: x.quelle };
  };

  const ketten = lkm ? lkm.bereiche.flatMap(b => b.ketten) : [];
  const werke = Array.isArray(o.werke) ? o.werke : [];
  const mitKarte = (o.lk && o.lk.karten) ? Object.keys(o.lk.karten).filter(w => Array.isArray(o.lk.karten[w].kacheln) && o.lk.karten[w].kacheln.length) : [];
  const normen = Array.isArray(o.normen) ? o.normen : [];
  const pol = Array.isArray(o.policies) ? o.policies : [];
  const kurse = Array.isArray(o.kurse) ? o.kurse : [];
  const gov = o.gov && typeof o.gov === 'object' ? o.gov : null;
  const govEintraege = gov && Array.isArray(gov.eintraege) ? gov.eintraege : [];
  const govWeitere = gov && Array.isArray(gov.weitere) ? gov.weitere : [];

  // Politik und Grundsatzerklärungen: Einträge der Art Policy und alles, was „Politik“ heißt.
  const politik = [].concat(
    govEintraege.filter(e => e.art === 'Policy' || /politik/i.test(String(e.titel || ''))),
    govWeitere.filter(e => /politik/i.test(String(e.titel || '') + ' ' + String(e.bereich || ''))));
  const unternehmenspolitik = politik.filter(e => /politik/i.test(String(e.titel || '')));
  const politikOffen = [];
  if (!gov) politikOffen.push('Das Konzernregelwerk (Governance-Struktur) war nicht lesbar, die Politik kann nicht beschrieben werden.');
  else if (!unternehmenspolitik.length) politikOffen.push('Eine Unternehmenspolitik ist im Konzernregelwerk nicht geführt. Sie ist von der Geschäftsführung festzulegen.');
  else if (!unternehmenspolitik.some(e => e.status === 'gueltig')) politikOffen.push(`Die Unternehmenspolitik ist noch nicht gültig (Status: ${sl(unternehmenspolitik[0].status)}). Entscheidung: Geschäftsführung.`);
  const politikNochNicht = politik.filter(e => e.status !== 'gueltig' && !unternehmenspolitik.includes(e)).map(e => e.titel);
  if (politikNochNicht.length) politikOffen.push(`Noch nicht gültig: ${politikNochNicht.join('; ')}.`);

  // Konzernregelwerk nach Dokumentenart (Pyramide der Governance-Struktur).
  const arten = gov && Array.isArray(gov.arten) ? gov.arten : [];
  const artZeilen = arten.map(a => {
    const rel = govEintraege.filter(e => e.art === a.key);
    return [a.key, String(a.erklaerung || ''), String(rel.filter(e => e.status === 'gueltig').length),
      String(rel.filter(e => e.status === 'arbeit').length), String(rel.filter(e => e.status === 'offen').length)];
  }).filter(z => z.slice(2).some(n => n !== '0'));

  const pn = (f) => pol.filter(f).length;
  const imWorkflow = pn(p => ['Konformitätsprüfung', 'InReview', 'Mitbestimmung', 'Freigabe'].includes(p.status));

  const kapitel = [
    abschnitt('4.1', 'Verstehen der Organisation und ihres Kontextes', {
      offen: ['Die internen und externen Themen, die für den Zweck und die strategische Ausrichtung des Unternehmens von Bedeutung sind, stehen nicht im RMS. Sie ergeben sich aus der Unternehmensstrategie, die noch nicht vorliegt. Entscheidung: Geschäftsführung.'] }),
    abschnitt('4.2', 'Verstehen der Erfordernisse und Erwartungen interessierter Parteien', {
      absaetze: normen.length ? [`Im RMS sind diese Normen und Rechtsvorschriften geführt und mit den Regelwerken abgeglichen: ${normen.join('; ')}.`] : [],
      offen: ['Weitere interessierte Parteien (etwa Kunden, Behörden, Beschäftigte und Eigentümer) und ihre Erwartungen sind nicht erfasst. Entscheidung: Geschäftsführung.'],
      quelle: [MH_QUELLE.abdeckung] }),
    abschnitt('4.3', 'Festlegen des Anwendungsbereichs des Managementsystems', {
      absaetze: [
        werke.length ? `Das RMS führt die Konzernebene und ${werke.length} Standorte (Gesellschaften): ${werke.join(', ')}.` : '',
        mitKarte.length ? `Eine Prozesslandkarte liegt vor für: ${mitKarte.map(w => w === 'KONZERN' ? 'Konzern' : w).join(', ')}.` : '',
      ].filter(Boolean),
      offen: lkOffen('Geltungsbereich').concat(['Die Abgrenzung des Anwendungsbereichs je Norm (Produkte, Tätigkeiten, Standorte, Ausschlüsse) legt die Geschäftsführung fest.']),
      quelle: [MH_QUELLE.prozesse] }),
    abschnitt('4.4', 'Managementsystem und seine Prozesse', {
      proz: ['Prozesslandkarte pflegen (RMS)', 'Prozesse managen (RMS)'],
      absaetze: lkm ? [
        `Stand ${stand}: Die Prozesslandkarte des Konzerns gliedert sich in ${lkm.zahlen.bereiche} Bereiche, ${lkm.zahlen.ketten} Ketten und ${lkm.zahlen.prozesse} Prozesse. Für ${lkm.zahlen.modelliert} Prozesse liegt ein BPMN-Modell vor.`,
        'Die Wechselwirkungen zwischen den Prozessen (Unterprozess, danach folgt, nutzt) stehen in der Landkarte und in der Gesamtkarte. Das Prozessverzeichnis steht in Anlage A.',
      ] : [],
      tabellen: lkm ? [tab('Bereiche und Ketten', ['Nr.', 'Kette', 'Prozesseigner der Gruppe', 'Prozesse'],
        lkm.bereiche.flatMap(b => [{ gruppe: b.titel, ebene: 1 }].concat(b.ketten.map(k =>
          [k.nr, k.name, k.eigner || 'offen', k.prozesse ? String(k.prozesse) : 'keine']))))] : [],
      offen: lkm ? [].concat(lkOffen('Ketten ohne Prozesse'), lkOffen('Prozesse ohne Kette'), lkOffen('Prozesse in zwei Ketten'), lkOffen('Standardisierungsgrad'))
        : [keineLandkarte],
      quelle: [MH_QUELLE.prozesse] }),

    abschnitt('5.1', 'Führung und Verpflichtung', {
      proz: ['Regelwerk freigeben (RMS)'],
      offen: ['Aussagen der obersten Leitung zu Führung und Verpflichtung (etwa Verantwortung für die Wirksamkeit, Bereitstellung von Ressourcen, Förderung der Verbesserung) sind im RMS nicht erfasst. Entscheidung: Geschäftsführung.'],
      quelle: [MH_QUELLE.freigaben] }),
    abschnitt('5.2', 'Politik', {
      tabellen: [tab('Politik und Grundsatzerklärungen im Konzernregelwerk', ['Dokument', 'Status'], politik.map(e => [String(e.titel || ''), sl(e.status)]))],
      offen: politikOffen,
      quelle: [MH_QUELLE.govstruktur] }),
    abschnitt('5.3', 'Rollen, Verantwortlichkeiten und Befugnisse in der Organisation', {
      proz: ['Krisenstab aufstellen (RMS)'],
      tabellen: lkm ? [
        tab('Prozesseigner der Gruppe je Kette', ['Nr.', 'Kette', 'Prozesseigner'], ketten.map(k => [k.nr, k.name, k.eigner || 'offen'])),
        tab('Verantwortungsketten im Betrieb', ['Prozess', 'Kette', 'Gesellschaften', 'Rollen'],
          lkm.verantwortung.map(p => [`${p.nr} ${p.name}`.trim(), p.kette, p.werke.join(', '), p.rollen.join(', ')])),
      ] : [],
      offen: lkm ? lkOffen('Prozesseigner benennen') : [keineLandkarte],
      quelle: [MH_QUELLE.prozesse] }),

    abschnitt('6.1', 'Maßnahmen zum Umgang mit Risiken und Chancen', {
      proz: ['Informationssicherheitsrisiken behandeln (RMS)', 'Erklärung zur Anwendbarkeit pflegen (RMS)'],
      offen: ['Das Verfahren des RMS ist auf die Informationssicherheit ausgelegt (ISO 27001, NIS2). Für die übrigen Normen des integrierten Systems ist zu klären, ob ihre Risiken und Chancen im selben Register geführt werden. Entscheidung: Geschäftsführung.'],
      quelle: [MH_QUELLE.risiken, MH_QUELLE.abdeckung] }),
    abschnitt('6.2', 'Ziele und Planung zu deren Erreichung', {
      proz: ['Ziele, Maßnahmen und Kennzahlen steuern (RMS)'],
      offen: lkOffen('Ziel aus der Unternehmensstrategie').map(t => `Ziel aus der Unternehmensstrategie: ${t}`)
        .concat(['Die strategischen Ziele des Unternehmens, aus denen die Ziele des Managementsystems abzuleiten sind, liegen im RMS nicht vor. Entscheidung: Geschäftsführung.']),
      quelle: [MH_QUELLE.ziele, MH_QUELLE.massnahmen, MH_QUELLE.kennzahlen] }),

    abschnitt('7.1', 'Ressourcen', {
      proz: ['Assets inventarisieren (RMS)'],
      offen: ['Personelle, finanzielle und räumliche Ressourcen sind im RMS nicht erfasst.'],
      quelle: [MH_QUELLE.assets] }),
    abschnitt('7.2', 'Kompetenz', {
      proz: ['Unterweisen und sensibilisieren (RMS)'],
      tabellen: [tab('Pflichtschulungen', ['Schulung', 'Wiederholung'], kurse.map(k => [String(k.titel || ''), Number(k.wiederholung) > 0 ? `alle ${Number(k.wiederholung)} Monate` : 'einmalig']))],
      offen: ['Anforderungen an die Kompetenz je Rolle und Nachweise außerhalb des RMS (Ausbildung, Qualifikationen) sind nicht erfasst.'],
      quelle: [MH_QUELLE.wissen] }),
    abschnitt('7.3', 'Bewusstsein', {
      proz: ['Kenntnisnahme bestätigen (RMS)', 'Wissenstest ablegen (RMS)'],
      quelle: [MH_QUELLE.wissen] }),
    abschnitt('7.4', 'Kommunikation', {
      offen: ['Was, wann, mit wem und wie intern und extern kommuniziert wird, ist im RMS nicht beschrieben. Entscheidung: Geschäftsführung.'] }),
    abschnitt('7.5', 'Dokumentierte Information', {
      proz: ['Regelwerk einführen und pflegen (RMS)', 'Konzernregelwerk lenken (RMS)', 'IMS-Dokument lenken (RMS)', 'Regelwerk überprüfen (RMS)'],
      absaetze: [
        pol.length ? `Stand ${stand}: ${pn(p => p.status === 'Veröffentlicht')} Regelwerke sind veröffentlicht, ${imWorkflow} im Freigabeverfahren, ${pn(p => p.status === 'Entwurf')} im Entwurf.` : '',
        gov ? 'Das Verzeichnis des Konzernregelwerks steht in Anlage B.' : '',
      ].filter(Boolean),
      tabellen: [tab('Konzernregelwerk nach Dokumentenart', ['Art', 'Bedeutung', 'gültig', 'in Arbeit', 'offen'], artZeilen)],
      quelle: [MH_QUELLE.verwaltung, MH_QUELLE.govstruktur, MH_QUELLE.ismsdocs] }),

    abschnitt('8', 'Betrieb', {
      proz: ['Notfallvorsorge betreiben (RMS)', 'Sicherheitsvorfälle behandeln (RMS)'],
      absaetze: lkm ? [`Die Abläufe sind als BPMN-Modelle beschrieben (${lkm.zahlen.modelliert} von ${lkm.zahlen.prozesse} Prozessen, Stand ${stand}).`] : [],
      offen: (lkm && lkm.zahlen.prozesse > lkm.zahlen.modelliert ? [`Für ${lkm.zahlen.prozesse - lkm.zahlen.modelliert} Prozesse liegt noch kein Modell vor.`] : [])
        .concat(['Die Planung und Steuerung der Leistungserbringung je Norm (etwa Produktion, Qualitätsplanung, Lieferanten, Änderungen) ist nur so weit beschrieben, wie Prozessmodelle vorliegen.']),
      quelle: [MH_QUELLE.prozesse, MH_QUELLE.notfall, MH_QUELLE.vorfaelle] }),

    abschnitt('9.1', 'Überwachung, Messung, Analyse und Bewertung', {
      proz: ['Kennzahl messen (RMS)', 'Normkonformität nachweisen (RMS)'],
      quelle: [MH_QUELLE.kennzahlen] }),
    abschnitt('9.2', 'Internes Audit', {
      proz: ['Wirksamkeit prüfen und verbessern (RMS)'],
      quelle: [MH_QUELLE.wirksamkeit] }),
    abschnitt('9.3', 'Managementbewertung', {
      proz: ['Managementbewertung durchführen (RMS)'],
      quelle: [MH_QUELLE.wirksamkeit] }),

    abschnitt('10', 'Verbesserung', {
      proz: ['Maßnahme umsetzen (RMS)', 'Änderung vorschlagen (RMS)'],
      quelle: [MH_QUELLE.massnahmen, MH_QUELLE.wirksamkeit] }),
  ];

  // Anlage A: alle Prozesse der Konzernkarte nach Bereich und Kette.
  const anlagen = [];
  if (lkm) {
    anlagen.push({ id: 'A', titel: 'Prozessverzeichnis der Prozesslandkarte Konzern', tabellen: [tab('', ['Nr.', 'Prozess', 'Modell', 'Geltung'],
      lkm.bereiche.flatMap(b => [{ gruppe: b.titel, ebene: 1 }].concat(b.ketten.flatMap(k =>
        [{ gruppe: `${k.nr} ${k.name}`.trim(), ebene: 2 }].concat(k.liste && k.liste.length
          ? k.liste.map(p => [p.nr, p.name, p.modell ? 'ja' : 'nein', (p.geltung || '') + (p.geltungOffen ? ' (zu bestätigen)' : '')])
          : [['', 'noch keine Prozesse', '', '']])))))] });
  }
  // Anlage B: das Konzernregelwerk, wie es in der Governance-Struktur geführt wird.
  if (gov && (govEintraege.length || govWeitere.length)) {
    const kategorien = Array.isArray(gov.kategorien) ? gov.kategorien : eindeutig(govEintraege.map(e => e.kategorie));
    const zeilenB = kategorien.flatMap(k => {
      const rel = govEintraege.filter(e => e.kategorie === k);
      return rel.length ? [{ gruppe: k, ebene: 1 }].concat(rel.map(e => [String(e.titel || ''), String(e.art || ''), sl(e.status),
        [e.version, e.datum].filter(Boolean).join(', ')])) : [];
    }).concat(govWeitere.length ? [{ gruppe: 'Weitere Regelungen', ebene: 1 }].concat(govWeitere.map(e => [String(e.titel || ''), String(e.bereich || ''), sl(e.status), ''])) : []);
    anlagen.push({ id: 'B', titel: 'Verzeichnis des Konzernregelwerks', tabellen: [tab('', ['Dokument', 'Art', 'Status', 'Version, Stand'], zeilenB)] });
  }

  const zaehl = (s) => kapitel.filter(k => k.status === s).length;
  return {
    schema: 1, titel: 'Managementhandbuch', geltung: 'Konzern', systeme: MH_SYSTEME,
    stand, ausgabe: '', status: 'Entwurf', freigabe: '', veroeffentlichtVon: '', veroeffentlichtAm: '',
    zahlen: { gesamt: kapitel.length, daten: zaehl('daten'), teils: zaehl('teils'), offen: zaehl('offen') },
    kapitel, anlagen, fehler: Array.isArray(o.fehler) ? o.fehler.slice() : [],
  };
}

/** Aus dem Entwurf eine Fassung machen: eingefroren, mit Ausgabe, Freigabe und Herkunft. */
function mhVeroeffentlicht(entwurf, m, vorher) {
  const meta = m || {};
  const fassung = JSON.parse(JSON.stringify(entwurf));
  fassung.status = 'Veröffentlicht';
  fassung.ausgabe = String(meta.ausgabe || '').trim();
  fassung.freigabe = String(meta.freigabe || '').trim();
  fassung.veroeffentlichtVon = String(meta.von || '');
  fassung.veroeffentlichtAm = String(meta.am || '');
  fassung.fehler = [];
  const hist = (vorher && Array.isArray(vorher.historie)) ? vorher.historie.slice() : [];
  hist.push({ ausgabe: fassung.ausgabe, stand: fassung.stand, am: fassung.veroeffentlichtAm, von: fassung.veroeffentlichtVon,
    freigabe: fassung.freigabe, offen: fassung.zahlen.offen, teils: fassung.zahlen.teils });
  fassung.historie = hist.slice(-20);
  return fassung;
}

/** Der Vorschlag für die nächste Ausgabe: 0.1, 0.2, … solange etwas offen ist, danach 1.0. */
function mhNaechsteAusgabe(vorher, entwurf) {
  const alles = !!entwurf && entwurf.zahlen && entwurf.zahlen.offen === 0 && entwurf.zahlen.teils === 0;
  const m = vorher && /^(\d+)\.(\d+)$/.exec(String(vorher.ausgabe || ''));
  if (!m) return alles ? '1.0' : '0.1';
  const major = Number(m[1]), minor = Number(m[2]);
  return (major === 0 && alles) ? '1.0' : `${major}.${minor + 1}`;
}

/* ── Ausgabe ─────────────────────────────────────────────────────────── */

function _mhEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function _mhArg(s) { return (typeof jsArg === 'function') ? jsArg(s) : JSON.stringify(String(s)); }
function _mhId(nr) { return 'mh-k-' + String(nr).replace(/[^0-9a-z]+/gi, '-'); }
function _mhDatum(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

/** Eine Tabelle; Gruppenzeilen ({gruppe, ebene}) gliedern, das Wort „offen“ fällt als Marke auf. */
function _mhTabelleHtml(t) {
  const e = _mhEsc;
  const zelle = (v) => String(v) === 'offen' ? '<span class="mh-offen-tag">offen</span>' : e(v);
  const spalten = t.kopf.length;
  // Nur eine Spalte „Nr.“ wird als Nummer gesetzt (blau, ohne Umbruch); Titel dürfen umbrechen.
  const nrSpalte = t.kopf[0] === 'Nr.';
  return `<table class="mh-tab">${t.titel ? `<caption>${e(t.titel)}</caption>` : ''}
    <thead><tr>${t.kopf.map(k => `<th>${e(k)}</th>`).join('')}</tr></thead>
    <tbody>${t.zeilen.map(z => Array.isArray(z)
      ? `<tr>${z.map((c, i) => { const kl = i === 0 && nrSpalte ? 'mh-nr' : (i > 0 && String(c).length <= 14 ? 'mh-kurz' : '');
        return `<td${kl ? ` class="${kl}"` : ''}>${zelle(c)}</td>`; }).join('')}</tr>`
      : `<tr class="mh-gruppe mh-g${z.ebene || 1}"><td colspan="${spalten}">${e(z.gruppe)}</td></tr>`).join('')}</tbody></table>`;
}

function _mhKapitelHtml(k, o) {
  const e = _mhEsc, st = MH_STATUS[k.status] || MH_STATUS.offen;
  const darf = typeof o.darf === 'function' ? o.darf : () => true;
  const quellen = o.druck ? [] : (k.quelle || []).filter(x => x && darf(x.view));
  return `<section class="mh-kap mh-st-${e(k.status)}" id="${_mhId(k.nr)}">
    <h3><span class="mh-knr">${e(k.nr)}</span>${e(k.titel)}<span class="mh-chip mh-chip-${e(k.status)}" title="${e(st.label)}">${st.symbol} ${e(st.kurz)}</span></h3>
    ${(k.verfahren || []).map(v => `<p class="mh-verfahren"><b>${e(v.titel)}.</b> ${e(v.text)}</p>`).join('')}
    ${(k.absaetze || []).map(a => `<p>${e(a)}</p>`).join('')}
    ${(k.tabellen || []).map(_mhTabelleHtml).join('')}
    ${(k.offen || []).length ? `<div class="mh-offen"><b>Offen</b><ul>${k.offen.map(x => `<li>${e(x)}</li>`).join('')}</ul></div>` : ''}
    ${(k.normbezug || []).length ? `<p class="mh-norm">Normbezug im RMS: ${k.normbezug.map(e).join(' · ')}</p>` : ''}
    ${quellen.length ? `<p class="mh-quellen">Im RMS: ${quellen.map(x => `<button type="button" class="mh-quelle" onclick="switchView(${_mhArg(x.view)})">→ ${e(x.label)}</button>`).join(' ')}</p>` : ''}
  </section>`;
}

function _mhAnlageHtml(a) {
  return `<section class="mh-kap mh-anlage" id="mh-anlage-${_mhEsc(a.id)}"><h3><span class="mh-knr">Anlage ${_mhEsc(a.id)}</span>${_mhEsc(a.titel)}</h3>${a.tabellen.map(_mhTabelleHtml).join('')}</section>`;
}

/** Hinweis, wenn Quellen nicht lesbar waren: Ein Abschnitt kann dann leerer sein, als das RMS weiß. */
function _mhFehlerHtml(h) {
  return (h.fehler && h.fehler.length)
    ? `<div class="col-warning" style="display:block"><b>Nicht alle Quellen waren lesbar:</b> ${h.fehler.map(_mhEsc).join('; ')}. Betroffene Abschnitte können leerer sein, als das RMS weiß.</div>` : '';
}

/** Dokumentinformation und Stand der Herleitung. */
function _mhMetaHtml(h) {
  const e = _mhEsc, z = h.zahlen;
  const zeile = (k, v) => `<div><dt>${e(k)}</dt><dd>${v}</dd></div>`;
  return `<dl class="mh-meta">
      ${zeile('Stand', e(h.stand))}
      ${zeile('Ausgabe', h.ausgabe ? e(h.ausgabe) : '<span class="mh-offen-tag">Entwurf</span>')}
      ${zeile('Status', e(h.status))}
      ${zeile('Freigabe', h.freigabe ? e(h.freigabe) : '<span class="mh-offen-tag">offen</span>')}
      ${h.veroeffentlichtAm ? zeile('Veröffentlicht', `${e(_mhDatum(h.veroeffentlichtAm))}${h.veroeffentlichtVon ? ', ' + e(h.veroeffentlichtVon) : ''}`) : ''}
    </dl>
    <p class="mh-stand"><b>${z.daten} von ${z.gesamt}</b> Abschnitten sind aus dem RMS hergeleitet, <b>${z.teils}</b> teils, <b>${z.offen}</b> sind offen und brauchen eine Entscheidung der Geschäftsführung.</p>
    <p class="mh-legende">${Object.keys(MH_STATUS).map(s => `<span class="mh-chip mh-chip-${s}">${MH_STATUS[s].symbol} ${e(MH_STATUS[s].label)}</span>`).join(' ')}</p>`;
}

/** Inhaltsverzeichnis mit Status. */
function _mhInhaltHtml(h, o) {
  const e = _mhEsc;
  const link = (id, text) => o.druck ? text : `<a href="#${id}" onclick="mhSprung(${_mhArg(id)});return false">${text}</a>`;
  return `<ol class="mh-inhalt">${h.kapitel.map(k =>
    `<li class="mh-i-${e(k.status)}"><span class="mh-punkt" title="${e((MH_STATUS[k.status] || MH_STATUS.offen).label)}">${(MH_STATUS[k.status] || MH_STATUS.offen).symbol}</span> ${link(_mhId(k.nr), `<b>${e(k.nr)}</b> ${e(k.titel)}`)}</li>`).join('')
    }${h.anlagen.map(a => `<li><span class="mh-punkt"> </span> ${link('mh-anlage-' + a.id, `<b>Anlage ${e(a.id)}</b> ${e(a.titel)}`)}</li>`).join('')}</ol>`;
}

/** Das Handbuch für den Bildschirm. o: { darf(view) → bool, ob der Reiter lesbar ist }. */
function mhAnsichtHtml(h, o) {
  const opt = o || {};
  const e = _mhEsc;
  return `<div class="mh-dok">
    <div class="mh-titel"><div class="mh-ueber">${e(h.status === 'Entwurf' ? 'Entwurf, aus den aktuellen Daten erzeugt' : 'Veröffentlichte Fassung')} · Intern</div>
      <h2>${e(h.titel)}</h2><div class="mh-unter">${e(h.geltung)} · ${e(h.systeme)}</div></div>
    ${_mhFehlerHtml(h)}
    ${_mhMetaHtml(h)}
    <h4 class="mh-h4">Inhalt</h4>
    ${_mhInhaltHtml(h, {})}
    ${h.kapitel.map(k => _mhKapitelHtml(k, opt)).join('')}
    ${h.anlagen.map(_mhAnlageHtml).join('')}
  </div>`;
}

/** Die Druckfassung. o: { kopf (druckKopf), schrift: [woff2-Adressen] } */
function mhDruckHtml(h, o) {
  const opt = o || {};
  const e = _mhEsc;
  const schrift = (Array.isArray(opt.schrift) ? opt.schrift : []).map(u =>
    `@font-face { font-family: 'Exo'; src: url('${e(u)}') format('woff2'); font-weight: 100 900; }`).join('\n');
  const z = h.zahlen;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>${e(h.titel)} (${e(h.stand)}${h.ausgabe ? ', Ausgabe ' + e(h.ausgabe) : ', Entwurf'})</title>
<style>
${schrift}
@page { size: A4; margin: 15mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: Exo, 'Segoe UI', Arial, sans-serif; color: #424241; font-size: 10pt; line-height: 1.45; margin: 24px; }
@media print { body { margin: 0; } .noprint { display: none; } thead { display: table-header-group; } tr, .mh-offen { break-inside: avoid; } h3 { break-after: avoid; } .mh-seitenumbruch { break-before: page; } }
.noprint { margin: 0 0 14px; }
.mh-titel { background: #1A2644; color: #fff; padding: 16px 18px 14px; border-bottom: 4px solid #F08300; margin: 10px 0 12px; }
.mh-ueber { color: #99B7CD; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; }
.mh-titel h2 { margin: 3px 0 4px; font-size: 22pt; line-height: 1.15; }
.mh-unter { color: #99B7CD; font-size: 9pt; }
h3 { color: #1A2644; font-size: 12pt; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #99B7CD; }
h4.mh-h4 { color: #1A2644; font-size: 11pt; margin: 14px 0 4px; }
.mh-knr { color: #17509E; margin-right: 8px; font-variant-numeric: tabular-nums; }
.mh-chip { font-size: 7.5pt; font-weight: 600; margin-left: 10px; padding: 1px 7px; border-radius: 9px; border: 1px solid; white-space: nowrap; vertical-align: 1px; }
.mh-chip-daten { color: #15803d; border-color: #15803d; } .mh-chip-teils { color: #b45309; border-color: #F08300; } .mh-chip-offen { color: #b91c1c; border-color: #b91c1c; }
.mh-legende { font-size: 8pt; } .mh-legende .mh-chip { margin: 0 6px 0 0; }
p { margin: 0 0 7px; }
.mh-meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 14px; margin: 0 0 8px; }
.mh-meta dt { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; } .mh-meta dd { margin: 0; font-weight: 600; color: #1A2644; }
.mh-offen-tag { color: #b45309; font-weight: 700; }
.mh-offen { border-left: 3px solid #F08300; background: #FFF6EA; padding: 5px 10px; margin: 6px 0 8px; font-size: 9pt; } .mh-offen ul { margin: 3px 0 0; padding-left: 16px; } .mh-offen li { margin: 0 0 3px; }
.mh-verfahren b { color: #1A2644; }
.mh-norm { font-size: 8pt; color: #6b7280; }
.mh-inhalt { margin: 4px 0 8px; padding-left: 0; list-style: none; columns: 2; font-size: 9pt; } .mh-inhalt li { margin: 0 0 2px; break-inside: avoid; } .mh-punkt { display: inline-block; width: 14px; }
.mh-i-daten .mh-punkt { color: #15803d; } .mh-i-teils .mh-punkt { color: #F08300; } .mh-i-offen .mh-punkt { color: #b91c1c; }
table.mh-tab { width: 100%; border-collapse: collapse; margin: 4px 0 8px; }
.mh-tab caption { text-align: left; font-weight: 700; color: #1A2644; font-size: 9pt; padding: 4px 0 3px; }
.mh-tab th { background: #1A2644; color: #fff; text-align: left; font-weight: 600; font-size: 8.5pt; padding: 5px 6px; }
.mh-tab td { border-bottom: 1px solid #E5E9F0; padding: 4px 6px; vertical-align: top; font-size: 9pt; }
.mh-tab td.mh-nr { white-space: nowrap; color: #17509E; font-weight: 600; width: 56px; }
.mh-tab td.mh-kurz { white-space: nowrap; }
.mh-tab tr.mh-g1 td { background: #EAF1FA; color: #17509E; font-weight: 700; } .mh-tab tr.mh-g2 td { background: #F6F8FB; color: #1A2644; font-weight: 600; padding-left: 14px; }
.mh-fuss { margin-top: 14px; font-size: 8pt; color: #6b7280; border-top: 1px solid #DCE3EC; padding-top: 6px; }
.col-warning { border: 1px solid #F08300; background: #FFF6EA; padding: 6px 10px; margin: 0 0 8px; font-size: 9pt; }
</style></head><body>
<div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
${opt.kopf || ''}
<div class="mh-titel"><div class="mh-ueber">${e(h.status === 'Entwurf' ? 'Entwurf, nicht freigegeben' : 'Managementhandbuch')} · Intern</div>
  <h2>${e(h.titel)}</h2><div class="mh-unter">${e(h.geltung)} · ${e(h.systeme)}</div></div>
${_mhFehlerHtml(h)}
${_mhMetaHtml(h)}
<h4 class="mh-h4">Inhalt</h4>
${_mhInhaltHtml(h, { druck: true })}
${h.kapitel.map(k => _mhKapitelHtml(k, { druck: true })).join('')}
${h.anlagen.map(a => `<div class="mh-seitenumbruch"></div>${_mhAnlageHtml(a)}`).join('')}
<div class="mh-fuss">Gegliedert nach der gemeinsamen Struktur der ISO-Managementsystemnormen. Aus den Daten des RMS hergeleitet, Stand ${e(h.stand)}. Abschnitte mit dem Status „offen“ brauchen eine Entscheidung der Geschäftsführung.</div>
</body></html>`;
}

/* ── Bedienung ───────────────────────────────────────────────────────── */

const _mh = { gelesen: null, geaendertAm: '', entwurf: null, ansicht: '', laedt: false };

/** Zu einem Abschnitt springen. */
function mhSprung(id) {
  const el = document.getElementById(id);
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth' });
}

function mhDarfPflegen() { return typeof canWriteTab !== 'function' || canWriteTab('handbuch'); }
function mhHeute() { return new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function _mhMount() { return document.getElementById('handbuch-mount'); }

/** Die Quellen lesen. Jede darf scheitern; was fehlt, steht dann als Hinweis im Handbuch. */
async function mhQuellenLesen() {
  const fehler = [];
  const q = {
    stand: mhHeute(),
    katalog: (n) => (typeof rmsProzess === 'function') ? rmsProzess(n) : null,
    normen: (typeof NORMEN !== 'undefined' && Array.isArray(NORMEN)) ? NORMEN.map(g => g.group) : [],
    werke: (typeof STANDORTE !== 'undefined') ? STANDORTE.slice() : [],
    policies: (typeof berichtsPolicies === 'function') ? berichtsPolicies() : ((typeof State !== 'undefined' && State.policies) || []),
    lk: null, gov: null, kurse: [], personName: (u) => u,
  };
  if (!q.katalog('Prozesse managen (RMS)')) fehler.push('Katalog der RMS-Prozesse nicht geladen');
  try {
    if (typeof _lkDaten !== 'undefined' && _lkDaten) q.lk = _lkDaten;
    else { const g = (typeof spLoadLandkarte === 'function') ? await spLoadLandkarte() : null; q.lk = (g && g.daten) ? g.daten : null; }
  } catch (e) { fehler.push('Prozesslandkarte: ' + e.message); }
  try {
    const members = (typeof AdminState !== 'undefined' && AdminState.members) || ((typeof spGetMembers === 'function') ? await spGetMembers() : []) || [];
    q.personName = (u) => { const t = members.find(m => String(m.upn || '').toLowerCase() === String(u || '').toLowerCase()); return (t && t.name) || u; };
  } catch (e) { /* dann Namen aus den Adressen */ }
  try { const g = (typeof spLoadGovStruktur === 'function') ? await spLoadGovStruktur() : null; q.gov = (g && g.daten) ? g.daten : null; }
  catch (e) { fehler.push('Governance-Struktur: ' + e.message); }
  try {
    if (typeof spLoadWissen === 'function' && typeof wiNormalisieren === 'function') {
      const w = await spLoadWissen();
      q.kurse = wiNormalisieren(w.daten).beitraege.filter(b => b.art === 'kurs' && b.pflicht && b.aktiv !== false)
        .map(b => ({ titel: b.titel, wiederholung: b.wiederholung }));
    }
  } catch (e) { fehler.push('Pflichtschulungen: ' + e.message); }
  q.fehler = fehler;
  return q;
}

async function mhEntwurfNeu() {
  const mount = _mhMount();
  if (mount) mount.innerHTML = '<div class="doc-loading">Entwurf wird aus den Daten hergeleitet …</div>';
  _mh.entwurf = mhBauen(await mhQuellenLesen());
}

async function initHandbuch() {
  const mount = _mhMount();
  if (!mount) return;
  mount.innerHTML = '<div class="doc-loading">Managementhandbuch wird gelesen …</div>';
  try {
    const g = await spLoadHandbuch();
    _mh.gelesen = g.daten; _mh.geaendertAm = g.geaendertAm;
  } catch (e) {
    mount.innerHTML = `<div class="col-warning" style="display:block">Das Managementhandbuch konnte nicht gelesen werden: ${_mhEsc(e.message)}</div>`;
    return;
  }
  // Wer pflegt, beginnt beim Entwurf; alle anderen sehen nur die veröffentlichte Fassung.
  _mh.ansicht = mhDarfPflegen() ? (_mh.ansicht || 'entwurf') : 'veroeffentlicht';
  if (_mh.ansicht === 'entwurf' && !_mh.entwurf) await mhEntwurfNeu();
  mhZeichnen();
}

async function mhAktualisieren() { _mh.entwurf = null; await initHandbuch(); }

async function mhAnsicht(a) {
  _mh.ansicht = (a === 'entwurf' && mhDarfPflegen()) ? 'entwurf' : 'veroeffentlicht';
  if (_mh.ansicht === 'entwurf' && !_mh.entwurf) await mhEntwurfNeu();
  mhZeichnen();
}

/** Das Dokument, das gerade zu sehen ist. */
function mhAktuelles() { return (_mh.ansicht === 'entwurf' && mhDarfPflegen()) ? _mh.entwurf : _mh.gelesen; }

function mhZeichnen() {
  const mount = _mhMount();
  if (!mount) return;
  const pflege = mhDarfPflegen(), h = mhAktuelles(), entwurf = _mh.ansicht === 'entwurf' && pflege;
  const darf = (view) => typeof canReadTab !== 'function' || canReadTab(view);
  const knopf = (a, text) => `<button type="button" class="btn btn-sm ${_mh.ansicht === a ? 'btn-primary' : 'btn-ghost'}" onclick="mhAnsicht(${_mhArg(a)})">${text}</button>`;
  mount.innerHTML = `<div class="mh-leiste">
      ${pflege ? `<div class="mh-umschalter">${knopf('entwurf', 'Entwurf (aktuelle Daten)')}${knopf('veroeffentlicht', _mh.gelesen ? `Veröffentlicht (Ausgabe ${_mhEsc(_mh.gelesen.ausgabe)})` : 'Veröffentlicht')}</div>` : ''}
      <div class="toolbar-spacer"></div>
      <button type="button" class="btn btn-sm btn-ghost" onclick="mhAktualisieren()" title="Daten neu lesen">↻ Aktualisieren</button>
      ${h ? '<button type="button" class="btn btn-sm btn-outline" onclick="mhDrucken()">🖨 Drucken / als PDF</button>' : ''}
      ${entwurf && h ? '<button type="button" class="btn btn-sm btn-primary" onclick="mhVeroeffentlichenDialog()" title="Diese Fassung für alle mit Leserecht festhalten">Stand veröffentlichen</button>' : ''}
    </div>
    ${h ? mhAnsichtHtml(h, { darf }) : `<div class="mh-leer">${pflege
      ? 'Noch keine Fassung veröffentlicht. Der Entwurf zeigt, was sich aus den Daten herleiten lässt.'
      : 'Das Managementhandbuch ist noch nicht veröffentlicht.'}</div>`}`;
}

function mhDrucken() {
  const h = mhAktuelles();
  if (!h) { if (typeof toast === 'function') toast('Es gibt noch nichts zu drucken.', 'error'); return; }
  const w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Bitte Pop-ups für diese Seite erlauben.', 'error'); return; }
  w.document.open();
  w.document.write(mhDruckHtml(h, { kopf: druckKopf('Managementhandbuch'), schrift: [rmsAssetUrl('fonts/exo-latin.woff2')] }));
  w.document.close();
}

function mhVeroeffentlichenDialog() {
  const h = _mh.entwurf;
  if (!h || !mhDarfPflegen()) return;
  const z = h.zahlen;
  openModal(`<div class="modal-header"><h3>Stand veröffentlichen</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p>Alle mit Leserecht auf den Reiter sehen danach diese Fassung. Der Entwurf bleibt davon unberührt und wird weiter aus den Daten hergeleitet.</p>
      <p class="field-hint">${z.daten} Abschnitte hergeleitet, ${z.teils} teils, ${z.offen} offen. Offene Abschnitte erscheinen in der Fassung als offen.</p>
      ${h.fehler.length ? `<div class="col-warning" style="display:block">Nicht alle Quellen waren lesbar (${h.fehler.map(_mhEsc).join('; ')}). Besser erst aktualisieren.</div>` : ''}
      <div class="form-group"><label for="mh-ausgabe">Ausgabe</label>
        <input type="text" id="mh-ausgabe" value="${_mhEsc(mhNaechsteAusgabe(_mh.gelesen, h))}" maxlength="20"></div>
      <div class="form-group"><label for="mh-freigabe">Freigabe (Funktion oder Name, Datum)</label>
        <input type="text" id="mh-freigabe" maxlength="200" placeholder="leer lassen, solange nicht freigegeben">
        <div class="field-hint">Die Freigabe durch die Geschäftsführung wird hier nur festgehalten. Das RMS gibt das Handbuch nicht selbst frei.</div></div>
    </div>
    <div class="modal-footer"><div style="flex:1"></div>
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="mh-ok" onclick="mhVeroeffentlichen()">Veröffentlichen</button></div>`);
}

async function mhVeroeffentlichen() {
  const h = _mh.entwurf;
  if (!h || !mhDarfPflegen()) return;
  const ausgabe = (document.getElementById('mh-ausgabe') || {}).value || '';
  const freigabe = (document.getElementById('mh-freigabe') || {}).value || '';
  if (!ausgabe.trim()) { toast('Bitte eine Ausgabe angeben.', 'error'); return; }
  const btn = document.getElementById('mh-ok');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichern …'; }
  const u = (typeof State !== 'undefined' && State.user) ? State.user : {};
  const fassung = mhVeroeffentlicht(h, { ausgabe, freigabe, von: u.name || u.upn || '', am: new Date().toISOString() }, _mh.gelesen);
  try {
    const r = await spSaveHandbuch(fassung, _mh.geaendertAm);
    _mh.gelesen = fassung; _mh.geaendertAm = r.geaendertAm;
    closeModal();
    toast(`Ausgabe ${fassung.ausgabe} veröffentlicht ✓`, 'success');
    mhZeichnen();
  } catch (e) {
    toast('Konnte nicht veröffentlicht werden: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Veröffentlichen'; }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mhBauen, mhVeroeffentlicht, mhNaechsteAusgabe, mhAnsichtHtml, mhDruckHtml, MH_STATUS };
}
