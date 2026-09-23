'use strict';

/**
 * Wissen – das Modell der Bibliothek
 * ==================================
 * Themen, Beiträge (Video, Artikel, Link, Wissenstest) und was daraus für
 * eine Person folgt: gesehen, bestanden. Keine DOM-, keine SharePoint-
 * Zugriffe – der Reiter, das Cockpit, der Audit Report und die Tests rechnen
 * alle hiermit.
 *
 * Die Bibliothek ist freiwillig. Sie steht neben den Regelwerken, nicht
 * darüber: Nichts hier ist Pflichtlektüre, nichts erzeugt eine Erinnerung.
 * Trotzdem zählt, was gelesen und bestanden wurde – ISO 27001 7.3 fragt nach
 * Bewusstsein, und ein Nachweis dafür ist mehr als eine Behauptung. Die
 * Nachweise landen in der Bestätigungen-Liste wie die Kenntnisnahmen, mit
 * der Kennung „wissen:<Beitrag>" statt einer Richtlinien-Kennung: keine neue
 * Liste, keine neue Spalte – und jede Auswertung je Regelwerk filtert nach
 * ihrer Kennung, sieht diese Einträge also nicht.
 */

const WI_ARTEN = [
  { key: 'kurs',    symbol: '🎓', label: 'Schulung',    hinweis: 'Mehrere Module nacheinander, zum Schluss der Wissenstest. Kann Pflicht sein und sich nach Monaten wiederholen.' },
  { key: 'video',   symbol: '🎬', label: 'Video',       hinweis: 'Stream/SharePoint, YouTube oder Vimeo – wird in der Seite abgespielt, alles andere öffnet in einem neuen Tab.' },
  { key: 'artikel', symbol: '📄', label: 'Artikel',     hinweis: 'Kurzer Text zum Lesen. Absätze durch Leerzeile, Aufzählung mit „- ", **fett** mit Sternchen.' },
  { key: 'link',    symbol: '🔗', label: 'Link',        hinweis: 'Ein Verweis nach draußen – BSI, Datenschutzbehörde, Intranet.' },
  { key: 'test',    symbol: '❓', label: 'Wissenstest', hinweis: 'Fragen mit genau einer richtigen Antwort. Freiwillig, beliebig oft, die Reihenfolge wird gemischt.' },
];
/* Bereiche, nach denen die Themen in der Leiste gruppiert sind – damit die
   Bibliothek nicht wie eine IT-Sammlung aussieht, sobald ein Thema aus
   Compliance oder Arbeitssicherheit dazukommt. Freitext; das sind Vorschläge. */
const WI_BEREICHE = ['Informationssicherheit', 'Datenschutz', 'Compliance & Verhalten', 'Arbeitssicherheit', 'Qualität & Umwelt', 'Unternehmen'];
const WI_PREFIX = 'wissen:';           // Kennung in der Bestätigungen-Liste
const WI_TAGE = 30;                    // Fenster für „zuletzt" in den Kennzahlen
const WI_BESTEHEN = 80;                // Bestehensgrenze, wenn nichts anderes gesetzt ist
// Die Werke – nur als Rückfall, wenn der Verwaltungsblock (STANDORTE) nicht geladen ist.
const WI_WERKE = ['HOL', 'SHB', 'WGC', 'SCH', 'EIS', 'DSO', 'ZAI', 'LEG', 'MEG', 'EWA'];

function wiArt(key) { return WI_ARTEN.find(a => a.key === key) || WI_ARTEN.find(a => a.key === 'artikel'); }
function wiAckId(id) { return WI_PREFIX + String(id || ''); }
function wiIstWissenAck(a) { return !!a && String(a.richtlinieId || '').indexOf(WI_PREFIX) === 0; }
function wiBeitragIdVon(a) { return wiIstWissenAck(a) ? String(a.richtlinieId).slice(WI_PREFIX.length) : ''; }
function wiNeueId(prefix) {
  return (prefix || 'b') + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
}
/** Ein Kürzel aus einem Titel – für Themen, damit die Kennung lesbar bleibt. */
function wiSlug(text) {
  return String(text || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'thema';
}
function _wiEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Ein Artikel oder Schulungsmodul als HTML – aus einer Schreibweise, die
 * niemand lernen muss und die ein Textfeld verträgt:
 *
 *   Leerzeile           trennt Absätze
 *   # Überschrift       Zwischenüberschrift
 *   - Punkt             Aufzählung
 *   1. Schritt          nummerierte Schritte (große Ziffern)
 *   **fett**            Hervorhebung
 *   > Text              Hinweis-Kasten     >! Text  Warn-Kasten     >✓ Text  „Gut zu wissen"
 *   !! Titel: Text      ein Warnsignal als Karte (rot, mit Titel)
 *   :::mail … :::       eine nachgebaute E-Mail: Von:/An:/Betreff:/Hinweis:, dann „---", dann der Text;
 *                       [→ Beschriftung] wird darin zu einem Knopf, der nirgends hinführt
 *
 * Zeile für Zeile gelesen, damit eine Überschrift direkt über ihrer Liste
 * stehen darf – so schreibt man das nun einmal. Alles wird vorher
 * entschärft: Text bleibt Text.
 */
function wiTextHtml(text) {
  const out = [];
  let absatz = [], liste = [], nummern = [], kasten = null, signale = [], mail = null;
  const inline = (s) => _wiEsc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[→\s*([^\]]+)\]/g, '<span class="wi-mail-knopf">→ $1</span>');
  const absatzZu = () => { if (absatz.length) { out.push('<p>' + absatz.map(inline).join('<br>') + '</p>'); absatz = []; } };
  const listeZu = () => { if (liste.length) { out.push('<ul>' + liste.map(z => '<li>' + inline(z) + '</li>').join('') + '</ul>'); liste = []; } };
  const nummernZu = () => { if (nummern.length) { out.push('<ol class="wi-schritte">' + nummern.map(z => '<li><div>' + inline(z) + '</div></li>').join('') + '</ol>'); nummern = []; } };
  const kastenZu = () => { if (kasten) { out.push(`<div class="wi-box ${kasten.art}">` + kasten.zeilen.map(inline).join('<br>') + '</div>'); kasten = null; } };
  const signaleZu = () => { if (signale.length) { out.push('<div class="wi-signale">' + signale.map(s => `<div class="wi-signal"><b>${inline(s.titel)}</b>${s.text ? '<span>' + inline(s.text) + '</span>' : ''}</div>`).join('') + '</div>'); signale = []; } };
  const alleZu = () => { absatzZu(); listeZu(); nummernZu(); kastenZu(); signaleZu(); };
  const mailZu = () => {
    if (!mail) return;
    const kopf = mail.kopf.map(k => k.name === 'Hinweis'
      ? `<div class="wi-mail-warn">${inline(k.wert)}</div>`
      : `<div><span>${inline(k.name)}:</span> ${inline(k.wert)}</div>`).join('');
    out.push(`<div class="wi-mail"><div class="wi-mail-kopf">${kopf}</div><div class="wi-mail-text">${mail.text.map(inline).join('<br>')}</div></div>`);
    mail = null;
  };
  String(text || '').replace(/\r/g, '').split('\n').forEach(z => {
    const t = z.trim();
    if (mail) {
      if (t === ':::') { mailZu(); return; }
      if (t === '---') { mail.rumpf = true; return; }
      const m = !mail.rumpf && t.match(/^(Von|An|Betreff|Hinweis):\s*(.*)$/);
      if (m) mail.kopf.push({ name: m[1], wert: m[2] });
      else if (t || mail.rumpf) mail.text.push(t);
      return;
    }
    if (t === ':::mail') { alleZu(); mail = { kopf: [], text: [], rumpf: false }; return; }
    if (!t) { alleZu(); return; }
    if (/^#+\s+/.test(t)) { alleZu(); out.push('<h4>' + inline(t.replace(/^#+\s+/, '')) + '</h4>'); return; }
    if (/^>/.test(t)) {
      const art = /^>!/.test(t) ? 'warn' : /^>✓/.test(t) ? 'ok' : 'info';
      const zeile = t.replace(/^>[!✓]?\s?/, '');
      if (!kasten || kasten.art !== art) { alleZu(); kasten = { art, zeilen: [] }; }
      kasten.zeilen.push(zeile); return;
    }
    if (/^!!\s+/.test(t)) {
      absatzZu(); listeZu(); nummernZu(); kastenZu();
      const m = t.replace(/^!!\s+/, '').match(/^([^:]{2,80}):\s*(.*)$/);
      signale.push(m ? { titel: m[1], text: m[2] } : { titel: t.replace(/^!!\s+/, ''), text: '' }); return;
    }
    if (/^\d+[.)]\s+/.test(t)) { absatzZu(); listeZu(); kastenZu(); signaleZu(); nummern.push(t.replace(/^\d+[.)]\s+/, '')); return; }
    if (/^[-*•]\s+/.test(t)) { absatzZu(); nummernZu(); kastenZu(); signaleZu(); liste.push(t.replace(/^[-*•]\s+/, '')); return; }
    listeZu(); nummernZu(); kastenZu(); signaleZu(); absatz.push(t);
  });
  mailZu(); alleZu();
  return out.join('');
}

/** Monate auf ein ISO-Datum – für die Wiederholung einer Schulung. */
function wiMonateSpaeter(iso, monate) {
  if (!iso || !(monate > 0)) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  d.setMonth(d.getMonth() + Number(monate));
  return d.toISOString();
}

/** Die Datei auf eine verlässliche Form bringen – fehlende Felder gefüllt, Fremdes weg. */
function wiNormalisieren(roh) {
  const d = (roh && typeof roh === 'object') ? roh : {};
  const themen = (Array.isArray(d.themen) ? d.themen : []).map(t => ({
    id: String(t.id || wiSlug(t.titel)), titel: String(t.titel || '').trim(), symbol: String(t.symbol || '📚'), kurz: String(t.kurz || ''),
    bereich: String(t.bereich || '').trim(),
  })).filter(t => t.id && t.titel);
  const beitraege = (Array.isArray(d.beitraege) ? d.beitraege : []).map(b => ({
    id: String(b.id || wiNeueId()), art: wiArt(b.art).key, thema: String(b.thema || ''),
    titel: String(b.titel || '').trim(), kurz: String(b.kurz || ''), url: String(b.url || ''), text: String(b.text || ''),
    quelle: String(b.quelle || ''), dauer: Math.max(0, Number(b.dauer) || 0),
    geltung: Array.isArray(b.geltung) && b.geltung.length ? b.geltung.map(String) : ['ALLE'],
    aktiv: b.aktiv !== false, stand: String(b.stand || '1'),
    bestehen: Math.max(1, Math.min(100, Number(b.bestehen) || WI_BESTEHEN)),
    fragen: (Array.isArray(b.fragen) ? b.fragen : []).map(q => ({
      frage: String(q.frage || ''), optionen: (Array.isArray(q.optionen) ? q.optionen : []).map(String), richtig: Number(q.richtig) || 0,
    })),
    // Schulung: Einstieg, Lernziele, Zielgruppe, Pflicht, Wiederholung (Monate), Module
    intro: String(b.intro || ''), zielgruppe: String(b.zielgruppe || ''),
    ziele: (Array.isArray(b.ziele) ? b.ziele : String(b.ziele || '').split('\n')).map(z => String(z).trim()).filter(Boolean),
    pflicht: b.pflicht === true, wiederholung: Math.max(0, Number(b.wiederholung) || 0),
    module: (Array.isArray(b.module) ? b.module : []).map((m, i) => ({
      id: String(m.id || ('m' + (i + 1))), titel: String(m.titel || '').trim(), text: String(m.text || ''),
    })),
    erstelltAm: String(b.erstelltAm || ''), erstelltVon: String(b.erstelltVon || ''),
    geaendertAm: String(b.geaendertAm || ''), geaendertVon: String(b.geaendertVon || ''),
  })).filter(b => b.id);
  return { version: 1, themen, beitraege };
}

function wiThema(daten, id) { return ((daten && daten.themen) || []).find(t => t.id === String(id)) || null; }
function wiBeitrag(daten, id) { return ((daten && daten.beitraege) || []).find(b => b.id === String(id)) || null; }

/** Was einem Beitrag fehlt, um gespeichert zu werden – leer heißt: nichts. */
function wiBeitragFehler(b) {
  const f = [];
  if (!b || !String(b.titel || '').trim()) f.push('Ein Titel fehlt.');
  const art = wiArt(b && b.art).key;
  if ((art === 'video' || art === 'link') && !/^https?:\/\//i.test(String(b.url || '').trim()) && !/<iframe/i.test(String(b.url || '')))
    f.push(art === 'video' ? 'Eine Video-Adresse oder der Einbetten-Code fehlt.' : 'Eine Adresse (https://…) fehlt.');
  if (art === 'artikel' && !String(b.text || '').trim()) f.push('Der Text des Artikels fehlt.');
  if (art === 'kurs') {
    const module = Array.isArray(b.module) ? b.module : [];
    if (!module.length) f.push('Eine Schulung braucht mindestens ein Modul.');
    module.forEach((m, i) => {
      if (!String(m.titel || '').trim()) f.push(`Modul ${i + 1} hat keinen Titel.`);
      if (!String(m.text || '').trim()) f.push(`Modul ${i + 1} hat keinen Inhalt.`);
    });
  }
  if (art === 'test' || (art === 'kurs' && Array.isArray(b.fragen) && b.fragen.length)) {
    const fragen = Array.isArray(b.fragen) ? b.fragen : [];
    if (!fragen.length) f.push('Ein Wissenstest braucht mindestens eine Frage.');
    fragen.forEach((q, i) => {
      const opts = (q.optionen || []).map(o => String(o || '').trim());
      if (!String(q.frage || '').trim()) f.push(`Frage ${i + 1} hat keinen Text.`);
      if (opts.filter(Boolean).length < 2) f.push(`Frage ${i + 1} braucht mindestens zwei Antworten.`);
      if (opts.some(o => !o)) f.push(`Frage ${i + 1} hat eine leere Antwort.`);
      if (!(q.richtig >= 0 && q.richtig < opts.length)) f.push(`Frage ${i + 1}: Welche Antwort ist richtig?`);
    });
  }
  return f;
}

/** Sichtbar für diese Person: aktiv und im Geltungsbereich. */
function wiSichtbar(b, opt) {
  if (!b || b.aktiv === false) return false;
  const pruefe = opt && typeof opt.geltungSichtbar === 'function' ? opt.geltungSichtbar : null;
  return pruefe ? !!pruefe(b.geltung) : true;
}

/**
 * Der Stand einer Person zu einem Beitrag – aus ihren Nachweisen.
 * Bei einer Schulung zählt der Abschluss (alle Module, Test bestanden); mit
 * Wiederholung läuft er ab: `faelligAm` ist der Tag, ab dem die Auffrischung
 * ansteht, `gueltig` sagt, ob der Abschluss heute noch trägt.
 */
function wiStand(b, acks, jetzt) {
  const leer = { ack: null, gesehen: false, bestanden: false, score: 0, versuche: 0, am: '', erledigt: false, faelligAm: '', gueltig: false, abgelaufen: false };
  if (!b) return leer;
  const a = (acks || []).find(x => String(x.richtlinieId) === wiAckId(b.id) && String(x.version || '1') === String(b.stand || '1'));
  if (!a) return leer;
  const s = { ack: a, gesehen: !!a.gelesenAm, bestanden: !!a.quizBestanden, score: Number(a.quizScore) || 0,
    versuche: Number(a.quizVersuche) || 0, am: a.abgeschlossenAm || a.gelesenAm || '', erledigt: false, faelligAm: '', gueltig: false, abgelaufen: false };
  if (b.art === 'kurs') {
    const mitTest = Array.isArray(b.fragen) && b.fragen.length > 0;
    s.erledigt = !!a.abgeschlossenAm && (!mitTest || !!a.quizBestanden);
    s.faelligAm = s.erledigt ? wiMonateSpaeter(a.abgeschlossenAm, b.wiederholung) : '';
    const heute = jetzt ? new Date(jetzt).toISOString() : new Date().toISOString();
    s.abgelaufen = !!s.faelligAm && s.faelligAm <= heute;
    s.gueltig = s.erledigt && !s.abgelaufen;
  } else {
    s.erledigt = b.art === 'test' ? s.bestanden : s.gesehen;
    s.gueltig = s.erledigt;
  }
  return s;
}

/** Ein ISO-Datum als Tag: 18.09.2027 – ohne Uhrzeit, ohne Zeitzone. */
function wiTag(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/**
 * Der Modul-Fortschritt einer Schulung steht im Nachweis selbst (Spalte
 * „Fortschritt" der Bestätigungen-Liste): {"s":"<Stand>","m":["m1","m2"]}.
 * In SharePoint, nicht im Browser – auf einem anderen Gerät geht es dort
 * weiter, wo man aufgehört hat. Ein anderer Stand zählt nicht.
 */
function wiFortschrittVon(b, ack) {
  if (!b || !ack || !ack.fortschritt) return [];
  try {
    const f = JSON.parse(String(ack.fortschritt));
    if (!f || String(f.s || '1') !== String(b.stand || '1') || !Array.isArray(f.m)) return [];
    const ids = new Set((b.module || []).map(m => m.id));
    return f.m.map(String).filter(id => ids.has(id));
  } catch (e) { return []; }
}
function wiFortschrittText(b, module) {
  return JSON.stringify({ s: String((b && b.stand) || '1'), m: [...new Set((module || []).map(String))] });
}

/** Wo eine Schulung für diese Person steht – als Wort und als Farbe. */
function wiKursStatus(b, acks, jetzt) {
  const s = wiStand(b, acks, jetzt);
  if (s.gueltig) return { key: 'erledigt', text: 'abgeschlossen' + (s.faelligAm ? ', gültig bis ' + wiTag(s.faelligAm) : ''), stand: s };
  if (s.abgelaufen) return { key: 'faellig', text: 'Auffrischung fällig', stand: s };
  if (s.gesehen) return { key: 'laeuft', text: 'begonnen', stand: s };
  return { key: 'offen', text: b.pflicht ? 'Pflicht, noch offen' : 'noch nicht begonnen', stand: s };
}

/**
 * Pflichtschulungen: wie viele der Mitarbeitenden haben einen gültigen
 * Abschluss? `members` sind die Personen des Hauses (UPN); ohne sie gibt es
 * nur die Zahl der gültigen Abschlüsse, keine Quote.
 */
function wiPflichtQuote(daten, acks, members, jetzt) {
  const kurse = ((daten && daten.beitraege) || []).filter(b => b.art === 'kurs' && b.pflicht && b.aktiv !== false);
  const upns = (members || []).map(m => String((m && m.upn) || m || '').toLowerCase()).filter(Boolean);
  return kurse.map(k => {
    const rel = (acks || []).filter(a => String(a.richtlinieId) === wiAckId(k.id) && String(a.version || '1') === String(k.stand || '1'));
    const gueltig = new Set(rel.filter(a => wiStand(k, [a], jetzt).gueltig).map(a => String(a.benutzerUpn || '').toLowerCase()));
    const ist = upns.length ? upns.filter(u => gueltig.has(u)).length : gueltig.size;
    const soll = upns.length;
    return { kurs: k, soll, ist, gueltig: gueltig.size, quote: soll ? Math.round(ist / soll * 100) : null };
  });
}

/**
 * Kennzahlen über die Bibliothek – für Cockpit und Audit Report.
 * `acks` sind die Nachweise ALLER Personen (Admin-Sicht); mit den eigenen
 * ergibt sich nur der eigene Stand.
 */
function wiKennzahlen(daten, acks, opt) {
  const o = opt || {};
  const jetzt = o.jetzt ? new Date(o.jetzt) : new Date();
  const grenze = new Date(jetzt.getTime() - (o.tage || WI_TAGE) * 86400000).toISOString();
  const beitraege = ((daten && daten.beitraege) || []).filter(b => b.aktiv !== false);
  const ids = new Set(beitraege.map(b => b.id));
  const rel = (acks || []).filter(a => wiIstWissenAck(a) && ids.has(wiBeitragIdVon(a)));
  const personen = new Set(rel.map(a => String(a.benutzerUpn || '').toLowerCase()).filter(Boolean));
  const zuletzt = rel.filter(a => (a.abgeschlossenAm || a.gelesenAm || '') >= grenze);
  const tests = beitraege.filter(b => b.art === 'test');
  const testIds = new Set(tests.map(t => t.id));
  const testAcks = rel.filter(a => testIds.has(wiBeitragIdVon(a)) && Number(a.quizVersuche) > 0);
  const bestanden = testAcks.filter(a => a.quizBestanden);
  const kurse = beitraege.filter(b => b.art === 'kurs');
  const kursAbschluesse = kurse.reduce((n, k) => n + rel.filter(a => wiBeitragIdVon(a) === k.id && wiStand(k, [a], jetzt).gueltig).length, 0);
  return {
    beitraege: beitraege.length, themen: ((daten && daten.themen) || []).length,
    videos: beitraege.filter(b => b.art === 'video').length, artikel: beitraege.filter(b => b.art === 'artikel').length,
    links: beitraege.filter(b => b.art === 'link').length, tests: tests.length,
    kurse: kurse.length, pflichtKurse: kurse.filter(k => k.pflicht).length, kursAbschluesse,
    personen: personen.size, nachweise: rel.length, zuletzt: zuletzt.length,
    testTeilnahmen: testAcks.length, testBestanden: bestanden.length,
    quote: testAcks.length ? Math.round(bestanden.length / testAcks.length * 100) : 0,
  };
}

/** Je Beitrag: wie viele Personen gesehen, wie viele Tests bestanden, Ø Ergebnis. */
function wiAuswertung(daten, acks) {
  return ((daten && daten.beitraege) || []).map(b => {
    const rel = (acks || []).filter(a => String(a.richtlinieId) === wiAckId(b.id));
    const gesehen = new Set(rel.filter(a => a.gelesenAm).map(a => String(a.benutzerUpn || '').toLowerCase())).size;
    const teil = rel.filter(a => Number(a.quizVersuche) > 0);
    const best = teil.filter(a => a.quizBestanden).length;
    const schnitt = teil.length ? Math.round(teil.reduce((s, a) => s + (Number(a.quizScore) || 0), 0) / teil.length) : 0;
    const gueltig = b.art === 'kurs' ? new Set(rel.filter(a => wiStand(b, [a]).gueltig).map(a => String(a.benutzerUpn || '').toLowerCase())).size : 0;
    const abgelaufen = b.art === 'kurs' ? new Set(rel.filter(a => wiStand(b, [a]).abgelaufen).map(a => String(a.benutzerUpn || '').toLowerCase())).size : 0;
    return { beitrag: b, gesehen, teilnahmen: teil.length, bestanden: best, schnitt, gueltig, abgelaufen };
  });
}

/* ── Der Startbestand ──
   Sechs Themen, je ein Artikel und ein Wissenstest – allgemein gehalten, damit
   sie in jedem Werk stimmen. Ein Vorschlag zum Anpassen, keine Hausregel: Wo
   ein Regelwerk etwas anderes sagt, gilt das Regelwerk. Videos stehen bewusst
   nicht drin – die dreht das Haus selbst oder wählt sie aus. */
const WI_STARTBESTAND = {
  themen: [
    { id: 'phishing',     titel: 'Phishing & E-Mail',        symbol: '🎣', kurz: 'Die häufigste Tür für Angreifer, und die, die jede:r selbst zuhält.', bereich: 'Informationssicherheit' },
    { id: 'passwoerter',  titel: 'Passwörter & Zugänge',     symbol: '🔑', kurz: 'Ein Dienst, ein Passwort, ein zweiter Faktor.', bereich: 'Informationssicherheit' },
    { id: 'arbeitsplatz', titel: 'Arbeitsplatz & unterwegs', symbol: '💼', kurz: 'Bildschirm, Schreibtisch, Homeoffice, Bahn.', bereich: 'Informationssicherheit' },
    { id: 'melden',       titel: 'Vorfall melden',           symbol: '🚨', kurz: 'Lieber einmal zu viel als einmal zu spät.', bereich: 'Informationssicherheit' },
    { id: 'ki',           titel: 'KI im Arbeitsalltag',      symbol: '🤖', kurz: 'Was in einen KI-Chat darf: und was nicht.', bereich: 'Informationssicherheit' },
    { id: 'datenschutz',  titel: 'Datenschutz im Alltag',    symbol: '🛡️', kurz: 'Was personenbezogen ist: und was daraus folgt.', bereich: 'Datenschutz' },
    { id: 'verhalten',    titel: 'Verhaltenskodex & Compliance', symbol: '⚖️', kurz: 'Geschenke, Einladungen, Interessenkonflikte, und wo man Bedenken loswird.', bereich: 'Compliance & Verhalten' },
    { id: 'arbeitssicherheit', titel: 'Sicher arbeiten',    symbol: '🦺', kurz: 'Schutzausrüstung, Beinaheunfälle, das Recht, Nein zu sagen.', bereich: 'Arbeitssicherheit' },
  ],
  beitraege: [
    { id: 'start-verhalten-artikel', art: 'artikel', thema: 'verhalten', titel: 'Geschenke, Einladungen, Interessenkonflikte: die drei Alltagsfragen', dauer: 3,
      kurz: 'Die meisten Compliance-Fragen sind keine Rechtsfragen, sondern Anstandsfragen mit einer Grenze.',
      text: `Compliance klingt nach Juristerei. Im Alltag sind es drei Fragen, die immer wieder auftauchen, und für alle drei gibt es eine einfache Prüfung: **Würde ich es meiner Vorgesetzten, einem Kunden und der Zeitung genauso erzählen?**

# Geschenke und Einladungen
- **Annehmen** darf man, was üblich und geringwertig ist: der Kalender, die Flasche Wein, das Mittagessen im Rahmen eines Termins.
- **Melden oder ablehnen** muss man, was darüber hinausgeht oder zeitlich in eine Entscheidung fällt. Eine Einladung zum Fußballspiel in der Woche der Auftragsvergabe hat ein Geschmäckle, auch wenn nichts dahintersteckt.
- **Geben** gilt genauso: Wer Amtsträgern oder Einkäufern etwas schenkt, bewegt sich schnell im Strafrecht. Im Zweifel vorher fragen.

# Interessenkonflikte
Ein Interessenkonflikt ist kein Vorwurf, sondern eine Situation: Die Schwester arbeitet beim Lieferanten, der Freund bewirbt sich, man hält Anteile an einem Wettbewerber. **Der Fehler ist nicht die Situation. Der Fehler ist, sie zu verschweigen.** Offenlegen, und die Entscheidung trifft jemand anderes.

# Wettbewerb
Preise, Kunden, Gebiete, Konditionen. Darüber spricht man mit Wettbewerbern nicht. Auch nicht „unter uns" auf der Messe, auch nicht im Verband. Kommt es dazu, das Gespräch beenden und den Vorfall melden.

# Bedenken loswerden
Wer etwas beobachtet, das nicht in Ordnung ist, hat Wege: Vorgesetzte, Compliance, oder (wenn das nicht geht) das **Hinweisgebersystem**, auch anonym. Wer hinweist, ist geschützt; Nachteile für einen Hinweis sind selbst ein Verstoß.

>✓ Die Regel für den Zweifel: erst fragen, dann handeln. Eine Rückfrage kostet zehn Minuten. Ein Verstoß kostet die Stelle. Manchmal mehr.` },
    { id: 'start-verhalten-test', art: 'test', thema: 'verhalten', titel: 'Wissenstest: Verhaltenskodex', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Ein Lieferant lädt Sie in der Woche der Auftragsvergabe zum Bundesligaspiel mit Hotel ein. Was ist richtig?', optionen: ['Annehmen: das ist Kundenpflege.', 'Ablehnen oder vorher offenlegen und entscheiden lassen. Der Zeitpunkt ist das Problem.', 'Annehmen, aber niemandem erzählen.'], richtig: 1 },
        { frage: 'Ihr Bruder bewirbt sich in Ihrer Abteilung, Sie sitzen im Auswahlgespräch. Was tun Sie?', optionen: ['Nichts sagen, aber besonders streng sein.', 'Den Interessenkonflikt offenlegen und die Auswahl anderen überlassen.', 'Das Gespräch führen: Familie ist Privatsache.'], richtig: 1 },
        { frage: 'Auf der Messe erzählt ein Wettbewerber, er erhöhe im Januar die Preise um 5 %, und fragt nach Ihren Plänen. Was tun Sie?', optionen: ['Höflich eine grobe Zahl nennen.', 'Das Gespräch beenden und den Vorfall melden.', 'Zuhören, aber nichts sagen: zuhören ist erlaubt.'], richtig: 1 },
        { frage: 'Sie beobachten, dass Prüfprotokolle nachträglich geändert werden. Was ist der richtige Weg?', optionen: ['Abwarten, ob es jemand anderem auffällt.', 'Vorgesetzte oder Compliance ansprechen, oder das Hinweisgebersystem nutzen, auch anonym.', 'Die Kollegen direkt beschuldigen.'], richtig: 1 },
      ] },
    { id: 'start-arbeitssicherheit-artikel', art: 'artikel', thema: 'arbeitssicherheit', titel: 'Sicher arbeiten: vier Gewohnheiten, die Unfälle verhindern', dauer: 3,
      kurz: 'Schutzausrüstung, Beinaheunfälle, das Recht, Nein zu sagen, und warum Melden kein Petzen ist.',
      text: `Die meisten Unfälle passieren nicht bei den gefährlichen Arbeiten, sondern bei den gewohnten: der schnelle Handgriff ohne Handschuh, der Weg über die Palette statt außen herum, die Maschine, die „nur kurz" ohne Schutz läuft.

# Vier Gewohnheiten
1. **Schutzausrüstung tragen, immer, nicht meistens.** Helm, Brille, Handschuhe, Sicherheitsschuhe, Gehörschutz: Was die Unterweisung für den Bereich vorsieht, gilt für die zwei Minuten genauso wie für die Schicht.
2. **Wege sind Wege.** Markierte Verkehrswege einhalten, nicht über Material klettern, Fluchtwege und Feuerlöscher frei halten. Stapler haben Vorfahrt, und tote Winkel.
3. **Beinaheunfälle melden.** Der Stein, der neben Ihnen einschlug, das Kabel, über das Sie fast gestolpert wären: Was heute fast passiert ist, passiert morgen jemand anderem. Die Meldung ist kein Petzen, sondern die einzige Chance, es vorher zu ändern.
4. **Nein sagen dürfen.** Wer eine Arbeit für gefährlich hält, darf sie unterbrechen und Rücksprache halten. Niemand muss eine Anweisung ausführen, die ihn in Gefahr bringt.

# Im Notfall
- **Erste Hilfe:** Wer die Ersthelfer im Bereich sind, steht am Aushang. Merken, bevor es nötig ist.
- **Melden:** Notruf absetzen, Vorgesetzte informieren, den Unfall im Verbandbuch eintragen, auch die kleine Schnittwunde. Ohne Eintrag gibt es später keinen Versicherungsschutz.
- **Ruhe bewahren:** erst sichern (Maschine aus, Bereich absperren), dann helfen.

>✓ Sicherheit ist keine Regel gegen die Arbeit, sondern die Bedingung, dass alle abends heimkommen. Wer sie ernst nimmt, wird nicht belächelt. Wer sie überspringt, wird angesprochen.` },
    { id: 'start-arbeitssicherheit-test', art: 'test', thema: 'arbeitssicherheit', titel: 'Wissenstest: Sicher arbeiten', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Ein Kabel liegt quer über dem Weg, Sie stolpern fast, nichts passiert. Was tun Sie?', optionen: ['Nichts: es ist ja nichts passiert.', 'Kabel sichern und den Beinaheunfall melden.', 'Kollegen warnen, das reicht.'], richtig: 1 },
        { frage: 'Sie sollen „nur kurz" ohne Schutzbrille an der Maschine nachjustieren. Was gilt?', optionen: ['Kurz geht ohne.', 'Schutzausrüstung gilt auch für zwei Minuten.', 'Nur, wenn die Vorgesetzte es sagt.'], richtig: 1 },
        { frage: 'Sie halten eine angewiesene Arbeit für gefährlich. Dürfen Sie sie unterbrechen?', optionen: ['Nein, Anweisung ist Anweisung.', 'Ja: unterbrechen und Rücksprache halten.', 'Nur mit Betriebsrat.'], richtig: 1 },
        { frage: 'Eine kleine Schnittwunde, ein Pflaster. Muss das ins Verbandbuch?', optionen: ['Nein, nur größere Verletzungen.', 'Ja: ohne Eintrag fehlt später der Versicherungsschutz.', 'Nur, wenn es blutet.'], richtig: 1 },
      ] },
    { id: 'start-phishing-artikel', art: 'artikel', thema: 'phishing', titel: 'Phishing erkennen in 60 Sekunden', dauer: 2,
      kurz: 'Fünf Merkmale, die fast jede betrügerische Mail verraten.',
      text: `Phishing-Mails sehen heute echt aus: richtiges Logo, korrektes Deutsch, oft sogar ein bekannter Absendername. Verraten tun sie sich trotzdem, meist an mehr als einem dieser Punkte.

# Fünf Merkmale
- **Druck.** „Sofort", „letzte Mahnung", „Konto wird gesperrt". Wer Sie zur Eile treibt, will, dass Sie nicht nachdenken.
- **Der Absender hinter dem Namen.** Der Anzeigename ist frei wählbar. Entscheidend ist die Adresse dahinter, und ob sie wirklich zur genannten Firma passt.
- **Der Link hinter dem Text.** Mit der Maus über den Link fahren, ohne zu klicken: Die Zieladresse erscheint unten im Fenster. Passt sie nicht zum Text, ist es Phishing.
- **Anhänge, die niemand angekündigt hat.** Rechnungen, Bewerbungen, „Dokument freigegeben", von Absendern, mit denen Sie gerade nichts zu tun haben.
- **Die ungewöhnliche Bitte.** Zugangsdaten eingeben, Gutscheine kaufen, eine Überweisung „schnell" freigeben. Kein seriöser Prozess läuft so.

# Was tun
Nicht klicken, nicht antworten, nicht weiterleiten. Die Mail über die Melden-Funktion an die IT geben oder ein Ticket anlegen, auch wenn Sie nicht sicher sind. Eine Fehlmeldung kostet eine Minute; ein Klick kann Tage kosten.

Und wenn schon geklickt wurde: sofort melden. Wer schnell Bescheid sagt, macht nichts falsch. Wer schweigt, gibt dem Angreifer Zeit.` },
    { id: 'start-phishing-test', art: 'test', thema: 'phishing', titel: 'Wissenstest: Phishing', dauer: 3, bestehen: 80,
      kurz: 'Fünf Fragen: die Reihenfolge ist jedes Mal anders.',
      fragen: [
        { frage: 'Eine Mail vom „Geschäftsführer" bittet Sie, dringend Gutscheinkarten zu kaufen und die Codes zu schicken. Was tun Sie?',
          optionen: ['Kaufen: der Chef hat es eilig.', 'Auf einem anderen Weg (Telefon, persönlich) nachfragen und die Mail melden.', 'Antworten und um Bestätigung per Mail bitten.'], richtig: 1 },
        { frage: 'Woran erkennen Sie, wohin ein Link wirklich führt?',
          optionen: ['Am blauen, unterstrichenen Text.', 'An der Zieladresse, die erscheint, wenn man mit der Maus über den Link fährt.', 'Am Logo in der Mail.'], richtig: 1 },
        { frage: 'Was ist das sicherste Zeichen für Phishing?',
          optionen: ['Rechtschreibfehler.', 'Ein fremdes Logo.', 'Zeitdruck plus die Bitte um Zugangsdaten, Geld oder einen Klick.'], richtig: 2 },
        { frage: 'Sie haben auf einen Link geklickt und Ihr Passwort eingegeben, dann kommen Zweifel. Was jetzt?',
          optionen: ['Abwarten, ob etwas passiert.', 'Sofort melden und das Passwort ändern.', 'Die Mail löschen, dann ist es erledigt.'], richtig: 1 },
        { frage: 'Der Anzeigename einer Mail lautet „DIHAG IT-Support". Was bedeutet das?',
          optionen: ['Die Mail kommt sicher von der IT.', 'Nichts: der Anzeigename ist frei wählbar, die Adresse dahinter zählt.', 'Die Mail wurde geprüft.'], richtig: 1 },
      ] },
    { id: 'start-passwoerter-artikel', art: 'artikel', thema: 'passwoerter', titel: 'Ein Dienst, ein Passwort und ein zweiter Faktor', dauer: 2,
      kurz: 'Warum Länge wichtiger ist als Sonderzeichen und wieso ein Passwort nie zweimal verwendet wird.',
      text: `Passwörter werden nicht erraten, sie werden gestohlen, aus Datenlecks bei irgendeinem Online-Dienst. Wer dort dasselbe Passwort benutzt wie im Unternehmen, hat dem Angreifer die Tür aufgeschlossen.

# Drei Regeln
- **Jeder Dienst ein eigenes Passwort.** Ein Passwortmanager merkt sie sich. Sie merken sich nur eines.
- **Lang schlägt kompliziert.** Vier zusammenhanglose Wörter („KaffeeGießereiMondSchraube") sind sicherer als „P@ssw0rt!" und leichter zu merken.
- **Zweiter Faktor überall, wo es ihn gibt.** Die App auf dem Telefon macht ein gestohlenes Passwort wertlos.

# Was nie
- Passwörter per Mail, Chat oder Zettel weitergeben, auch nicht an die IT. Die IT fragt nicht danach.
- Eine MFA-Anfrage bestätigen, die Sie nicht selbst ausgelöst haben. Genau das ist der Angriff („MFA-Müdigkeit"): So lange Anfragen schicken, bis jemand auf „Ja" tippt.

Wenn Sie den Verdacht haben, ein Passwort sei bekannt geworden: ändern und melden, in dieser Reihenfolge, und beides heute.` },
    { id: 'start-passwoerter-test', art: 'test', thema: 'passwoerter', titel: 'Wissenstest: Passwörter & MFA', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Welches Passwort ist am sichersten?', optionen: ['P@ss2024!', 'Vier zusammenhanglose Wörter mit über 20 Zeichen', 'Der Name des Haustiers mit Geburtsjahr'], richtig: 1 },
        { frage: 'Ihr Telefon zeigt eine MFA-Anfrage, obwohl Sie sich gerade nirgends anmelden. Was tun Sie?', optionen: ['Bestätigen: wird schon die IT sein.', 'Ablehnen und melden, das Passwort ändern.', 'Ignorieren, das hört von selbst auf.'], richtig: 1 },
        { frage: 'Darf dasselbe Passwort für den Firmenzugang und einen Online-Shop verwendet werden?', optionen: ['Ja, wenn es lang genug ist.', 'Nein: ein Datenleck beim Shop öffnet sonst den Firmenzugang.', 'Ja, wenn MFA aktiv ist.'], richtig: 1 },
        { frage: 'Die „IT" ruft an und braucht Ihr Passwort, um ein Problem zu lösen. Was ist richtig?', optionen: ['Nennen: die IT hat ohnehin Zugriff.', 'Nie nennen: Die IT braucht Ihr Passwort nicht. Auflegen und melden.', 'Nur den ersten Teil nennen.'], richtig: 1 },
      ] },
    { id: 'start-arbeitsplatz-artikel', art: 'artikel', thema: 'arbeitsplatz', titel: 'Bildschirm, Schreibtisch, Bahn: Sicherheit ohne Technik', dauer: 2,
      kurz: 'Die Gewohnheiten, die kein Virenscanner ersetzt.',
      text: `Die meisten Informationen gehen nicht durch Hacker verloren, sondern durch Alltag: ein Ausdruck am Drucker, ein offener Bildschirm, ein Gespräch im Zug.

# Am Arbeitsplatz
- **Bildschirm sperren**, sobald Sie aufstehen. Windows-Taste + L. Es dauert eine Sekunde.
- **Schreibtisch am Abend leer**: Ausdrucke mit personenbezogenen oder vertraulichen Angaben in den Schrank oder in den Schredder, nicht in den Papierkorb.
- **Besucher begleiten.** Wer ohne Begleitung durchs Haus geht, gehört angesprochen. Freundlich, aber immer.

# Unterwegs und zu Hause
- **Öffentliches WLAN nur mit VPN.** Ohne VPN liest jeder im selben Netz mit.
- **Blickschutz im Zug**: oder das Dokument später öffnen. Über die Schulter lesen ist keine Kunst.
- **Geräte nie im Auto lassen**, auch nicht kurz. Ein Laptop im Kofferraum ist ein Laptop weniger.
- **Verlust sofort melden**, damit das Gerät gesperrt werden kann. Das ist wichtiger als die Frage nach der Schuld.

Und: Dienstliches auf dienstlichen Geräten. Der private Rechner hat keine Verschlüsselung, keine Sperre, keinen Schutz, und die Familie hat Zugriff.` },
    { id: 'start-arbeitsplatz-test', art: 'test', thema: 'arbeitsplatz', titel: 'Wissenstest: Arbeitsplatz & unterwegs', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Sie verlassen den Platz für zwei Minuten. Der Bildschirm …', optionen: ['… bleibt offen, das lohnt sich nicht.', '… wird gesperrt (Windows + L).', '… wird ausgeschaltet.'], richtig: 1 },
        { frage: 'Im Zug wollen Sie eine Kalkulation öffnen. Was ist richtig?', optionen: ['Öffnen, es sieht ja niemand hin.', 'Mit Blickschutz arbeiten oder warten, bis Sie allein sind.', 'Auf dem privaten Handy öffnen.'], richtig: 1 },
        { frage: 'Ein Ausdruck mit Gehaltsdaten wird nicht mehr gebraucht. Wohin damit?', optionen: ['Papierkorb.', 'Schredder oder verschlossener Datenschutzbehälter.', 'Auf dem Drucker liegen lassen.'], richtig: 1 },
        { frage: 'Das Diensthandy ist weg. Was ist der erste Schritt?', optionen: ['Ein paar Tage suchen.', 'Sofort melden, damit es gesperrt werden kann.', 'Eine neue SIM-Karte bestellen.'], richtig: 1 },
      ] },
    { id: 'start-datenschutz-artikel', art: 'artikel', thema: 'datenschutz', titel: 'Personenbezogene Daten: was das ist und was daraus folgt', dauer: 3,
      kurz: 'Name, Mail, Kennzeichen, Foto: alles, was auf einen Menschen zeigt.',
      text: `Personenbezogen ist alles, was sich einer Person zuordnen lässt: Name, Adresse, E-Mail, Telefonnummer, Personalnummer, Foto, Kfz-Kennzeichen, IP-Adresse, ein Gehalt, ein Krankheitstag. Nicht nur das, was „geheim" ist.

# Vier Grundsätze, die im Alltag reichen
- **Zweck.** Daten nur für den Zweck verwenden, für den sie erhoben wurden. Die Telefonliste ist für die Arbeit da, nicht für die Geburtstagsrunde.
- **So wenig wie nötig.** Nicht alles abfragen, was interessant wäre, nur, was gebraucht wird.
- **Nur, wer es braucht.** Eine Liste mit Krankheitstagen gehört nicht in die Abteilungsmail. Weitergabe an Dritte (auch an Dienstleister) nur mit Grundlage.
- **Nicht länger als nötig.** Was erledigt ist, wird gelöscht oder nach Vorgabe archiviert.

# Besondere Vorsicht
Gesundheit, Religion, Gewerkschaft, Herkunft: Solche Angaben sind besonders geschützt. Sie gehören nicht in Freitextfelder, nicht in Chats und nicht in Tabellen, die „nur intern" sind.

# Wenn etwas schiefgeht
Eine Mail an den falschen Verteiler, ein verlorener USB-Stick, ein Ausdruck am falschen Drucker: **innerhalb von 72 Stunden** muss das Unternehmen unter Umständen die Aufsichtsbehörde informieren. Die Frist läuft ab dem Bekanntwerden. Deshalb sofort melden, nicht erst am Wochenende darüber nachdenken.` },
    { id: 'start-datenschutz-test', art: 'test', thema: 'datenschutz', titel: 'Wissenstest: Datenschutz', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Welche Angabe ist personenbezogen?', optionen: ['Das Kfz-Kennzeichen eines Mitarbeiters.', 'Die Anzahl der Mitarbeitenden im Werk.', 'Der Jahresumsatz.'], richtig: 0 },
        { frage: 'Ein Kollege bittet um die Telefonliste für eine private Einladung. Was gilt?', optionen: ['Kein Problem, die ist ja intern.', 'Nein: die Liste ist für den dienstlichen Zweck da.', 'Nur die Handynummern.'], richtig: 1 },
        { frage: 'Sie haben eine Gehaltsübersicht an einen falschen Verteiler gesendet. Was jetzt?', optionen: ['Rückruf der Mail und abwarten.', 'Sofort melden: die Frist gegenüber der Aufsicht kann 72 Stunden betragen.', 'Die Empfänger bitten, es zu löschen, damit ist es erledigt.'], richtig: 1 },
        { frage: 'Welche Angabe ist besonders geschützt?', optionen: ['Die Abteilung.', 'Ein Krankheitsgrund.', 'Die Personalnummer.'], richtig: 1 },
      ] },
    { id: 'start-melden-artikel', art: 'artikel', thema: 'melden', titel: 'Lieber einmal zu viel: Was, wann, wem melden', dauer: 2,
      kurz: 'Ein Sicherheitsvorfall ist kein Fehler, den man versteckt. Er ist eine Information, die andere schützt.',
      text: `Die teuersten Vorfälle sind die, von denen die IT zu spät erfährt. Niemand wird für eine Meldung getadelt, auch nicht, wenn sich der Verdacht als harmlos herausstellt.

# Was gemeldet wird
- Eine verdächtige Mail, auch wenn Sie nicht geklickt haben.
- Ein Klick, eine Eingabe, ein geöffneter Anhang, und danach ein ungutes Gefühl.
- Ein verlorenes oder gestohlenes Gerät, ein USB-Stick unbekannter Herkunft.
- Ein Rechner, der sich plötzlich anders verhält: langsam, Fenster, die aufgehen, Dateien, die sich nicht öffnen lassen.
- Daten am falschen Ort: eine Mail an den falschen Empfänger, ein Ausdruck am falschen Drucker.
- Fremde Personen ohne Begleitung in Bereichen, in die sie nicht gehören.

# Wann
Sofort. Nicht nach dem Meeting, nicht nach Feierabend. Bei einem Verschlüsselungsverdacht: Netzwerkkabel ziehen oder WLAN aus, Gerät **nicht** ausschalten, und anrufen.

# Wem
Über das Ticketsystem oder telefonisch an die IT; wenn es schnell gehen muss, zusätzlich an die Vorgesetzten. Bei personenbezogenen Daten erfährt es zusätzlich der Datenschutz. Die Kontaktwege stehen in den Regelwerken und (für den Ernstfall) im Notfallplan.

Was Sie nicht tun: den Vorfall selbst „reparieren", Beweise löschen oder abwarten, ob es von allein weggeht.` },
    { id: 'start-melden-test', art: 'test', thema: 'melden', titel: 'Wissenstest: Vorfall melden', dauer: 2, bestehen: 80,
      kurz: 'Drei Fragen.',
      fragen: [
        { frage: 'Ihr Rechner zeigt eine Meldung, dass Ihre Dateien verschlüsselt wurden. Was ist richtig?', optionen: ['Rechner ausschalten und neu starten.', 'Vom Netz trennen, eingeschaltet lassen, sofort die IT anrufen.', 'Erst einmal den Anweisungen auf dem Bildschirm folgen.'], richtig: 1 },
        { frage: 'Sie haben eine verdächtige Mail erhalten, aber nichts angeklickt. Melden?', optionen: ['Nein, es ist ja nichts passiert.', 'Ja: die Meldung schützt die Kolleginnen und Kollegen, die dieselbe Mail bekommen.', 'Nur, wenn sie noch einmal kommt.'], richtig: 1 },
        { frage: 'Wann wird ein Vorfall gemeldet?', optionen: ['Nach Feierabend, wenn Ruhe ist.', 'Sofort: jede Stunde zählt.', 'Nachdem man selbst versucht hat, ihn zu beheben.'], richtig: 1 },
      ] },
    { id: 'start-ki-artikel', art: 'artikel', thema: 'ki', titel: 'Was in einen KI-Chat darf und was nicht', dauer: 3,
      kurz: 'KI-Assistenten sind Werkzeuge. Was Sie hineingeben, verlässt das Haus.',
      text: `Ein KI-Chat ist ein Dienst eines fremden Anbieters. Was Sie eingeben, wird dort verarbeitet, je nach Dienst auch gespeichert und zum Training verwendet. Der Maßstab ist deshalb einfach: **Was Sie nicht auf eine Postkarte schreiben würden, gehört nicht in einen öffentlichen KI-Chat.**

# Nicht hinein
- Personenbezogene Daten: Namen von Mitarbeitenden, Kunden, Bewerbern; Mails mit Absendern; Gehälter; Beurteilungen.
- Vertrauliches: Kalkulationen, Angebote, Verträge, Zeichnungen, Rezepturen, Quellcode, Kundenlisten, Strategiepapiere.
- Zugangsdaten, interne Adressen, Systemnamen.

# Darf hinein
- Allgemeine Fragen, Formulierungshilfen für Texte ohne vertrauliche Inhalte, öffentliche Informationen, Übersetzungen unkritischer Texte.
- Alles, was das Haus über einen **freigegebenen** Dienst mit Vertrag und ohne Training erlaubt. Welche das sind, sagt das KI-Regelwerk.

# Und das Ergebnis
KI erfindet. Zahlen, Paragrafen, Quellen und Zitate immer prüfen, bevor sie in ein Dokument wandern. Verantwortlich bleibt, wer das Ergebnis verwendet. Nicht das Werkzeug.

Im Zweifel: Namen und Zahlen entfernen, allgemein fragen, oder den Anwendungsfall über den KI-Antrag freigeben lassen.` },
    { id: 'start-ki-test', art: 'test', thema: 'ki', titel: 'Wissenstest: KI im Arbeitsalltag', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Sie wollen eine Kundenmail freundlicher formulieren lassen. Was ist richtig?', optionen: ['Die ganze Mail samt Name und Angebotspreis einfügen.', 'Namen, Firmen und Zahlen entfernen, oder einen freigegebenen Dienst nutzen.', 'Nur den Betreff einfügen, den Rest im Kopf behalten.'], richtig: 1 },
        { frage: 'Ein KI-Chat nennt einen Paragrafen als Beleg. Was tun Sie?', optionen: ['Übernehmen: die KI hat den Text gelesen.', 'Prüfen, ob es den Paragrafen gibt und ob er das sagt.', 'Den Paragrafen weglassen, den Rest übernehmen.'], richtig: 1 },
        { frage: 'Welche Eingabe ist in einem öffentlichen KI-Chat in Ordnung?', optionen: ['Die Kalkulation eines Angebots.', 'Eine allgemeine Frage zur Formatierung einer Tabelle.', 'Die Bewerbungsunterlagen eines Kandidaten.'], richtig: 1 },
        { frage: 'Wer ist verantwortlich, wenn ein KI-Ergebnis falsch in ein Dokument gelangt?', optionen: ['Der Anbieter der KI.', 'Die Person, die das Ergebnis verwendet hat.', 'Niemand: es war die KI.'], richtig: 1 },
      ] },
  ],
};

/* Die Schulung „Phishing erkennen" – fünf Module und ein Wissenstest, nach
   der Vorlage des Hauses. Kontaktwege (Ticket-Adresse, Notfallnummer) stehen
   im Text; wer sie ändert, ändert sie im Modul „Richtig reagieren". */
const WI_KURS_PHISHING = {
  id: 'start-phishing-kurs', art: 'kurs', thema: 'phishing', titel: 'Phishing erkennen: so erkennen Sie gefälschte E-Mails',
  kurz: '91 % aller Cyberangriffe beginnen mit einer E-Mail. Dieses Training zeigt, wie Sie sie erkennen, und was Sie dann tun.',
  intro: `**91 % aller Cyberangriffe beginnen mit einer E-Mail.** Phishing ist die häufigste und gefährlichste Angriffsmethode, und gleichzeitig eine der wenigen, die Sie persönlich verhindern können. Dieses Training zeigt Ihnen, wie.`,
  dauer: 20, zielgruppe: 'Alle Mitarbeitenden: kein Vorwissen erforderlich', pflicht: true, wiederholung: 12, bestehen: 80,
  ziele: [
    'Phishing-E-Mails an typischen Merkmalen erkennen',
    'Verschiedene Arten von Phishing-Angriffen unterscheiden',
    'Warnsignale in E-Mails, Links und Anhängen identifizieren',
    'Im Ernstfall richtig und schnell reagieren',
    'Verdächtige E-Mails korrekt melden',
  ],
  module: [
    { id: 'm1', titel: 'Was ist Phishing?', text: `# Was bedeutet „Phishing"?
Der Begriff leitet sich vom englischen „fishing" (Angeln) ab, mit einem „Ph" für „Password". Wie ein Angler wirft der Angreifer einen Köder aus und wartet, bis jemand anbeißt.

Beim Phishing versuchen Kriminelle, über gefälschte E-Mails, Nachrichten oder Webseiten an vertrauliche Daten zu gelangen: Passwörter, Zugangsdaten, Bankdaten oder persönliche Informationen.

# Wie funktioniert es? Der typische Ablauf
1. **Täuschende E-Mail wird versendet.** Der Angreifer versendet eine E-Mail, die aussieht wie eine Nachricht von einem bekannten Absender. Bank, IT-Abteilung, Microsoft oder einem Kollegen.
2. **Opfer klickt auf Link oder Anhang.** Die E-Mail enthält einen Link zu einer gefälschten Webseite oder einen infizierten Anhang. Ein einziger Klick reicht aus.
3. **Daten werden gestohlen.** Auf der gefälschten Seite gibt das Opfer seine Zugangsdaten ein, oder durch den Anhang wird Schadsoftware installiert.
4. **Angreifer nutzt die Daten.** Mit den gestohlenen Zugangsdaten greift der Angreifer auf Firmen-E-Mails, SharePoint, Bankkonten oder interne Systeme zu.

> Phishing ist kein Technik-Problem, das die IT allein löst. Der Filter fängt vieles, aber die Mail, die durchkommt, landet bei Ihnen. Deshalb dieses Training.` },
    { id: 'm2', titel: 'Arten von Phishing', text: `Nicht alle Angriffe sehen gleich aus. Die wichtigsten Varianten:

# Massen-Phishing
Dieselbe Mail an Tausende: „Ihr Paket konnte nicht zugestellt werden", „Ihr Konto wurde gesperrt". Unpersönlich, oft mit Fehlern, aber in der Masse trifft sie immer jemanden.

# Spear-Phishing
Der **gezielte Angriff auf eine bestimmte Person oder Abteilung.** Der Angreifer kennt Ihren Namen, Ihre Rolle, Ihre Projekte, aus LinkedIn, der Website, früheren Datenlecks. Die Mail passt perfekt in Ihren Arbeitstag. Das ist die gefährlichste Form, weil sie nicht wie Phishing aussieht.

# CEO-Betrug (Whaling / Business E-Mail Compromise)
Eine Mail „vom Geschäftsführer" oder von der Finanzleitung: dringende Überweisung, Gutscheinkarten, geänderte Bankverbindung eines Lieferanten. Setzt auf Autorität und Zeitdruck, und darauf, dass niemand nachfragt.

# Smishing und Vishing
**Smishing** ist Phishing per SMS oder Messenger („Ihr Paket wartet; Link"), **Vishing** per Telefon: Ein angeblicher IT-Mitarbeiter, ein angeblicher Bankberater, der „nur kurz" Ihre Zugangsdaten braucht.

# Quishing
Ein QR-Code auf einem Aushang, in einer Mail, auf einem Parkautomaten. Führt auf eine gefälschte Seite. Das Handy zeigt die Zieladresse kaum an.

# Nachgebaute Anmeldeseiten
Der Link führt auf eine täuschend echte Microsoft-, SharePoint- oder Bank-Anmeldung. Wer dort eingibt, gibt dem Angreifer den Schlüssel, oft samt zweitem Faktor, weil die Seite ihn gleich mit abfragt.

>✓ Allen Varianten ist eines gemeinsam: Sie brauchen Ihre Mitwirkung. Einen Klick, eine Eingabe, einen Anruf zurück. Ohne sie passiert nichts.` },
    { id: 'm3', titel: 'Eine gefälschte E-Mail lesen', text: `# Beispiel-Analyse
Diese E-Mail ist gefälscht: können Sie die Signale sehen?

:::mail
Von: IT-Support <support@diihag.com>
An: m.mustermann@dihag.com
Betreff: ⚠️ Ihr Konto wird gesperrt!
Hinweis: ⚠ Absender nicht verifiziert. Externe E-Mail
---
Sehr geehrte/r Herr/Frau Mustermann,
wir haben ungewöhnliche Aktivitäten festgestellt. Bestätigen Sie Ihre Identität innerhalb von 24 Stunden, sonst wird Ihr Zugang dauerhaft gesperrt.
Klicken Sie hier:
[→ Jetzt Konto bestätigen]
:::

# Die Signale
!! Falsche Absender-Domain: „diihag.com" statt „dihag.com". Ein einzelnes „i" zu viel, leicht zu übersehen.
!! Künstlicher Zeitdruck: „24 Stunden" und die Drohung mit Sperrung sollen Sie zu schnellem, unkritischem Handeln verleiten.
!! Unpersönliche Anrede: „Sehr geehrte/r Herr/Frau". Echte Unternehmenssysteme kennen Ihren Namen.
!! Link ohne sichtbares Ziel: Echte Links zeigen beim Hover immer die Zieladresse. Prüfen Sie diese vor jedem Klick.
!! Ungewöhnliche Aufforderung: Die IT fordert niemals per E-Mail zur Passwort-Eingabe oder Konto-Bestätigung auf.

> Jedes dieser Signale allein wäre verdächtig. Drei davon zusammen sind ein sicheres Zeichen.` },
    { id: 'm4', titel: 'Die 7 wichtigsten Warnsignale', text: `# Checkliste
Wenn eines dieser Signale zutrifft, halten Sie inne, bei zwei ist es fast sicher Phishing.

- ⚠ **Absender-Domain** weicht vom bekannten Unternehmen ab
- ⚠ **Dringende Aufforderung** mit Frist oder Drohung
- ⚠ **Unpersönliche oder seltsame Anrede**
- ⚠ **Aufforderung, Passwort oder Daten einzugeben**
- ⚠ **Link führt zu einer fremden oder seltsamen Adresse**, mit der Maus darüberfahren, ohne zu klicken
- ⚠ **Unerwarteter Anhang**, vor allem .zip, .exe, .docm, .html
- ⚠ **Rechtschreibfehler oder seltsame Formulierungen**

# Und was kein Signal ist
Ein Logo, ein korrekter Name, ein freundlicher Ton, sogar ein „echter" Absendername. All das lässt sich fälschen. Verlassen Sie sich nicht darauf, dass eine Mail „gut aussieht".

>✓ Im Zweifel gilt: lieber einmal zu viel nachfragen als einmal zu wenig. Niemand wird für eine Rückfrage getadelt.` },
    { id: 'm5', titel: 'Richtig reagieren', text: `# Wenn Sie eine verdächtige E-Mail erhalten
1. **Nicht klicken, nicht antworten.** Öffnen Sie keine Links und keine Anhänge. Antworten Sie nicht auf die E-Mail, auch wenn Sie nach dem Grund fragen wollen.
2. **Absender unabhängig prüfen.** Kennen Sie den Absender? Rufen Sie ihn über die bekannte, offizielle Nummer an. Nicht über eine in der E-Mail genannte Nummer.
3. **IT-Security informieren.** Leiten Sie die E-Mail weiter an **ticket@dihag.com**, oder melden Sie sie über den Knopf „Phishing melden" in Outlook.
4. **E-Mail löschen.** Nach der Meldung die E-Mail aus dem Posteingang und aus dem Papierkorb löschen.

# Wenn Sie bereits geklickt haben
>! 🚨 Ruhig bleiben, und sofort handeln:
>! • Gerät sofort vom Netzwerk trennen (WLAN aus, LAN-Kabel ziehen)
>! • IT-Security sofort anrufen: **[Telefonnummer IT-Security]**
>! • Passwörter von einem anderen Gerät aus ändern
>! • Nichts weiter auf dem betroffenen Gerät tun
>! • Ehrlich kommunizieren. Es trifft jeden, keine Scham nötig

>✓ Gut zu wissen: Wer einen Vorfall sofort meldet, hilft dem Unternehmen, schnell zu reagieren. Wer schweigt, ermöglicht dem Angreifer, unbemerkt weiterzumachen.` },
  ],
  fragen: [
    { frage: 'Was versteht man unter „Spear-Phishing"?',
      optionen: ['Phishing-Angriffe per SMS', 'Massen-Phishing an Millionen Empfänger', 'Gezielter Angriff auf eine bestimmte Person oder Abteilung'], richtig: 2 },
    { frage: 'Welche Aussage über die IT-Abteilung ist korrekt?',
      optionen: ['Die IT fragt gelegentlich per E-Mail nach Passwörtern zur Überprüfung', 'Die IT fordert Passwörter nur bei dringenden Sicherheitsvorfällen an', 'Die IT fragt niemals (unter keinen Umständen) nach Ihrem Passwort'], richtig: 2 },
    { frage: 'Sie haben versehentlich auf einen Link in einer verdächtigen E-Mail geklickt. Was tun Sie als Erstes?',
      optionen: ['Gerät neu starten und hoffen, dass nichts passiert ist', 'Gerät vom Netzwerk trennen und sofort IT-Security anrufen', 'Den Vorfall nicht melden, um keine Probleme zu bekommen'], richtig: 1 },
    { frage: 'Sie erhalten eine E-Mail von „support@miicrosoft.com" mit der Bitte, Ihr Passwort zu bestätigen. Was ist das erste Warnsignal?',
      optionen: ['Die E-Mail ist auf Englisch', 'Die Absender-Domain „miicrosoft.com" ist falsch geschrieben', 'Die E-Mail enthält kein Logo'], richtig: 1 },
    { frage: 'Eine dringende E-Mail fordert Sie auf, „innerhalb von 2 Stunden" Ihr Passwort zu ändern, sonst wird Ihr Konto gesperrt. Wie reagieren Sie?',
      optionen: ['E-Mail ignorieren, IT-Security informieren und den Link nicht klicken', 'Passwort sofort über den Link in der E-Mail ändern', 'Per Antwort-E-Mail beim Absender nachfragen'], richtig: 0 },
  ],
};
WI_STARTBESTAND.beitraege.unshift(WI_KURS_PHISHING);

/**
 * Die Teilnahmebescheinigung – eine eigene Seite zum Drucken oder als PDF.
 * Sie belegt, was der Nachweis in der Bestätigungen-Liste festhält: wer,
 * welche Schulung, wann, mit welchem Ergebnis, wie lange gültig. Die
 * Nummer ist die Kennung des Nachweises – so lässt sich jede Bescheinigung
 * in der Liste wiederfinden. `o.logo` ist die absolute Adresse des
 * DIHAG-Logos; ohne sie steht der Name des Systems in Schrift.
 */
function wiZertifikatHtml(o) {
  const b = o.kurs || {}, s = o.stand || {}, name = o.name || o.upn || '', E = _wiEsc;
  const datum = wiTag(s.am || s.ack && s.ack.abgeschlossenAm || '');
  const bis = s.faelligAm ? wiTag(s.faelligAm) : '';
  const ackId = String((s.ack && s.ack.id) || '0');
  const nummer = 'RMS-W-' + (/^\d+$/.test(ackId) ? ackId.padStart(6, '0') : ackId);
  const module = (b.module || []).map(m => `<li>${E(m.titel)}</li>`).join('');
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Teilnahmebescheinigung: ${E(b.titel)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { margin: 0; font-family: Exo, 'Segoe UI', Arial, sans-serif; color: #1A2644; background: #f3f4f6; }
  .blatt { max-width: 1000px; margin: 24px auto; background: #fff; padding: 46px 56px; border: 10px solid #17509E; outline: 2px solid #F08300; outline-offset: -20px; position: relative; }
  .kopf { display: flex; justify-content: space-between; align-items: center; margin-bottom: 26px; }
  .marke { display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 20px; letter-spacing: .04em; }
  .marke img { display: block; height: 60px; width: auto; }
  .nr { font-family: Consolas, monospace; color: #6b7280; font-size: 13px; text-align: right; line-height: 1.5; }
  h1 { font-size: 15px; letter-spacing: .3em; text-transform: uppercase; color: #F08300; margin: 0 0 12px; }
  .wer { font-size: 34px; font-weight: 800; margin: 6px 0 10px; }
  .was { font-size: 18px; line-height: 1.5; margin: 0 0 22px; }
  .was b { color: #17509E; }
  .fakten { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 0 0 22px; }
  .fakt { border-top: 3px solid #99B7CD; padding-top: 8px; }
  .fakt small { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; }
  .fakt span { font-size: 17px; font-weight: 700; }
  .module { display: flex; gap: 28px; align-items: flex-start; font-size: 13px; color: #424241; }
  .module ol { margin: 6px 0 0; padding-left: 20px; columns: 2; column-gap: 28px; line-height: 1.6; }
  .fuss { margin-top: 26px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; color: #6b7280; }
  .siegel { width: 92px; height: 92px; border-radius: 50%; border: 3px solid #F08300; color: #F08300; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 800; font-size: 11px; letter-spacing: .06em; transform: rotate(-8deg); }
  .knopf { position: fixed; top: 14px; right: 14px; background: #17509E; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; font: 600 14px Exo, 'Segoe UI', Arial, sans-serif; cursor: pointer; }
  @media print { body { background: #fff; } .blatt { margin: 0; border-width: 8px; box-shadow: none; } .knopf { display: none; } }
</style></head><body>
<button class="knopf" onclick="window.print()">🖨 Drucken / als PDF speichern</button>
<div class="blatt">
  <div class="kopf">
    <div class="marke">${o.logo ? `<img src="${E(o.logo)}" alt="DIHAG Integrated Foundry Group">` : 'DIHAG · Regelwerk-Management'}</div>
    <div class="nr">Bescheinigung ${E(nummer)}<br>${E(datum)}</div>
  </div>
  <h1>Teilnahmebescheinigung</h1>
  <div class="wer">${E(name)}</div>
  <div class="was">hat die Schulung <b>„${E(b.titel)}"</b> erfolgreich abgeschlossen${s.score ? `, Wissenstest bestanden mit <b>${E(s.score)} %</b>` : ''}.</div>
  <div class="fakten">
    <div class="fakt"><small>Abgeschlossen am</small><span>${E(datum || '–')}</span></div>
    <div class="fakt"><small>Gültig bis</small><span>${E(bis || 'unbefristet')}</span></div>
    <div class="fakt"><small>Umfang</small><span>${(b.module || []).length} Module${(b.fragen || []).length ? ' · Wissenstest' : ''}${b.dauer ? ` · ca. ${E(b.dauer)} Min.` : ''}</span></div>
    <div class="fakt"><small>Art</small><span>${b.pflicht ? 'Pflichtschulung' : 'Freiwillige Schulung'}${b.wiederholung ? ` · alle ${E(b.wiederholung)} Monate` : ''}</span></div>
  </div>
  <div class="module"><div><b>Inhalte</b><ol>${module}</ol></div></div>
  <div class="fuss">
    <div>${E(o.upn || '')}<br>Der Nachweis liegt im Regelwerk-Management-System (Bestätigungen, Kennung ${E(WI_PREFIX + (b.id || ''))}${s.ack && s.ack.id ? `, Eintrag ${E(s.ack.id)}` : ''}).${o.jetzt ? `<br>Ausgestellt am ${E(wiTag(o.jetzt))}.` : ''}</div>
    <div class="siegel">BESTANDEN<br>✓</div>
  </div>
</div>
</body></html>`;
}

/** Den Startbestand ergänzen – nur, was (nach Kennung) noch fehlt. @returns Zahl der neuen Beiträge */
function wiStartbestandErgaenzen(daten, wer, jetzt) {
  let n = 0;
  WI_STARTBESTAND.themen.forEach(t => {
    const da = wiThema(daten, t.id);
    if (!da) daten.themen.push(Object.assign({}, t));
    else if (!da.bereich && t.bereich) da.bereich = t.bereich;   // ein Thema von früher bekommt seinen Bereich, sonst bleibt es, wie es ist
  });
  WI_STARTBESTAND.beitraege.forEach(b => {
    if (wiBeitrag(daten, b.id)) return;
    const neu = wiNormalisieren({ beitraege: [Object.assign({ erstelltAm: jetzt || new Date().toISOString(), erstelltVon: wer || '' }, b)] }).beitraege[0];
    daten.beitraege.push(neu); n++;
  });
  return n;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WI_ARTEN, WI_BEREICHE, WI_PREFIX, WI_TAGE, WI_BESTEHEN, WI_WERKE, WI_STARTBESTAND, WI_KURS_PHISHING,
    wiArt, wiAckId, wiIstWissenAck, wiBeitragIdVon, wiNeueId, wiSlug, wiTextHtml, wiMonateSpaeter, wiNormalisieren, wiThema, wiBeitrag,
    wiBeitragFehler, wiSichtbar, wiStand, wiKursStatus, wiPflichtQuote, wiKennzahlen, wiAuswertung, wiStartbestandErgaenzen, wiTag,
    wiFortschrittVon, wiFortschrittText, wiZertifikatHtml };
}
