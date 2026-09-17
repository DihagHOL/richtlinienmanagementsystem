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
  { key: 'video',   symbol: '🎬', label: 'Video',       hinweis: 'Stream/SharePoint, YouTube oder Vimeo – wird in der Seite abgespielt, alles andere öffnet in einem neuen Tab.' },
  { key: 'artikel', symbol: '📄', label: 'Artikel',     hinweis: 'Kurzer Text zum Lesen. Absätze durch Leerzeile, Aufzählung mit „- ", **fett** mit Sternchen.' },
  { key: 'link',    symbol: '🔗', label: 'Link',        hinweis: 'Ein Verweis nach draußen – BSI, Datenschutzbehörde, Intranet.' },
  { key: 'test',    symbol: '❓', label: 'Wissenstest', hinweis: 'Fragen mit genau einer richtigen Antwort. Freiwillig, beliebig oft, die Reihenfolge wird gemischt.' },
];
const WI_PREFIX = 'wissen:';           // Kennung in der Bestätigungen-Liste
const WI_TAGE = 30;                    // Fenster für „zuletzt" in den Kennzahlen
const WI_BESTEHEN = 80;                // Bestehensgrenze, wenn nichts anderes gesetzt ist
// Die Werke – nur als Rückfall, wenn der Verwaltungsblock (STANDORTE) nicht geladen ist.
const WI_WERKE = ['HOL', 'SHB', 'WGC', 'SCH', 'EIS', 'DSO', 'ZAI', 'LEG', 'MEG', 'EWA'];

function wiArt(key) { return WI_ARTEN.find(a => a.key === key) || WI_ARTEN[1]; }
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
 * Ein Artikel als HTML – aus einer Schreibweise, die niemand lernen muss:
 * Leerzeile trennt Absätze, „- " beginnt einen Aufzählungspunkt, **fett**
 * hebt hervor, eine Zeile mit „# " davor ist eine Zwischenüberschrift.
 * Zeile für Zeile gelesen, damit eine Überschrift direkt über ihrer Liste
 * stehen darf – so schreibt man das nun einmal. Alles wird vorher
 * entschärft: Text bleibt Text.
 */
function wiTextHtml(text) {
  const out = [];
  let absatz = [], liste = [];
  const inline = (s) => _wiEsc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const absatzZu = () => { if (absatz.length) { out.push('<p>' + absatz.map(inline).join('<br>') + '</p>'); absatz = []; } };
  const listeZu = () => { if (liste.length) { out.push('<ul>' + liste.map(z => '<li>' + inline(z) + '</li>').join('') + '</ul>'); liste = []; } };
  String(text || '').replace(/\r/g, '').split('\n').forEach(z => {
    const t = z.trim();
    if (!t) { absatzZu(); listeZu(); return; }
    if (/^#+\s+/.test(t)) { absatzZu(); listeZu(); out.push('<h4>' + inline(t.replace(/^#+\s+/, '')) + '</h4>'); return; }
    if (/^[-*•]\s+/.test(t)) { absatzZu(); liste.push(t.replace(/^[-*•]\s+/, '')); return; }
    listeZu(); absatz.push(t);
  });
  absatzZu(); listeZu();
  return out.join('');
}

/** Die Datei auf eine verlässliche Form bringen – fehlende Felder gefüllt, Fremdes weg. */
function wiNormalisieren(roh) {
  const d = (roh && typeof roh === 'object') ? roh : {};
  const themen = (Array.isArray(d.themen) ? d.themen : []).map(t => ({
    id: String(t.id || wiSlug(t.titel)), titel: String(t.titel || '').trim(), symbol: String(t.symbol || '📚'), kurz: String(t.kurz || ''),
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
  if (art === 'test') {
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

/** Der Stand einer Person zu einem Beitrag – aus ihren Nachweisen. */
function wiStand(b, acks) {
  const leer = { ack: null, gesehen: false, bestanden: false, score: 0, versuche: 0, am: '' };
  if (!b) return leer;
  const a = (acks || []).find(x => String(x.richtlinieId) === wiAckId(b.id) && String(x.version || '1') === String(b.stand || '1'));
  if (!a) return leer;
  return { ack: a, gesehen: !!a.gelesenAm, bestanden: !!a.quizBestanden, score: Number(a.quizScore) || 0,
    versuche: Number(a.quizVersuche) || 0, am: a.abgeschlossenAm || a.gelesenAm || '' };
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
  return {
    beitraege: beitraege.length, themen: ((daten && daten.themen) || []).length,
    videos: beitraege.filter(b => b.art === 'video').length, artikel: beitraege.filter(b => b.art === 'artikel').length,
    links: beitraege.filter(b => b.art === 'link').length, tests: tests.length,
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
    return { beitrag: b, gesehen, teilnahmen: teil.length, bestanden: best, schnitt };
  });
}

/* ── Der Startbestand ──
   Sechs Themen, je ein Artikel und ein Wissenstest – allgemein gehalten, damit
   sie in jedem Werk stimmen. Ein Vorschlag zum Anpassen, keine Hausregel: Wo
   ein Regelwerk etwas anderes sagt, gilt das Regelwerk. Videos stehen bewusst
   nicht drin – die dreht das Haus selbst oder wählt sie aus. */
const WI_STARTBESTAND = {
  themen: [
    { id: 'phishing',     titel: 'Phishing & E-Mail',        symbol: '🎣', kurz: 'Die häufigste Tür für Angreifer – und die, die jede:r selbst zuhält.' },
    { id: 'passwoerter',  titel: 'Passwörter & Zugänge',     symbol: '🔑', kurz: 'Ein Dienst, ein Passwort, ein zweiter Faktor.' },
    { id: 'arbeitsplatz', titel: 'Arbeitsplatz & unterwegs', symbol: '💼', kurz: 'Bildschirm, Schreibtisch, Homeoffice, Bahn.' },
    { id: 'datenschutz',  titel: 'Datenschutz im Alltag',    symbol: '🛡️', kurz: 'Was personenbezogen ist – und was daraus folgt.' },
    { id: 'melden',       titel: 'Vorfall melden',           symbol: '🚨', kurz: 'Lieber einmal zu viel als einmal zu spät.' },
    { id: 'ki',           titel: 'KI im Arbeitsalltag',      symbol: '🤖', kurz: 'Was in einen KI-Chat darf – und was nicht.' },
  ],
  beitraege: [
    { id: 'start-phishing-artikel', art: 'artikel', thema: 'phishing', titel: 'Phishing erkennen in 60 Sekunden', dauer: 2,
      kurz: 'Fünf Merkmale, die fast jede betrügerische Mail verraten.',
      text: `Phishing-Mails sehen heute echt aus: richtiges Logo, korrektes Deutsch, oft sogar ein bekannter Absendername. Verraten tun sie sich trotzdem – meist an mehr als einem dieser Punkte.

# Fünf Merkmale
- **Druck.** „Sofort", „letzte Mahnung", „Konto wird gesperrt". Wer Sie zur Eile treibt, will, dass Sie nicht nachdenken.
- **Der Absender hinter dem Namen.** Der Anzeigename ist frei wählbar. Entscheidend ist die Adresse dahinter – und ob sie wirklich zur genannten Firma passt.
- **Der Link hinter dem Text.** Mit der Maus über den Link fahren, ohne zu klicken: Die Zieladresse erscheint unten im Fenster. Passt sie nicht zum Text, ist es Phishing.
- **Anhänge, die niemand angekündigt hat.** Rechnungen, Bewerbungen, „Dokument freigegeben" – von Absendern, mit denen Sie gerade nichts zu tun haben.
- **Die ungewöhnliche Bitte.** Zugangsdaten eingeben, Gutscheine kaufen, eine Überweisung „schnell" freigeben. Kein seriöser Prozess läuft so.

# Was tun
Nicht klicken, nicht antworten, nicht weiterleiten. Die Mail über die Melden-Funktion an die IT geben oder ein Ticket anlegen – auch wenn Sie nicht sicher sind. Eine Fehlmeldung kostet eine Minute; ein Klick kann Tage kosten.

Und wenn schon geklickt wurde: sofort melden. Wer schnell Bescheid sagt, macht nichts falsch – wer schweigt, gibt dem Angreifer Zeit.` },
    { id: 'start-phishing-test', art: 'test', thema: 'phishing', titel: 'Wissenstest: Phishing', dauer: 3, bestehen: 80,
      kurz: 'Fünf Fragen – die Reihenfolge ist jedes Mal anders.',
      fragen: [
        { frage: 'Eine Mail vom „Geschäftsführer" bittet Sie, dringend Gutscheinkarten zu kaufen und die Codes zu schicken. Was tun Sie?',
          optionen: ['Kaufen – der Chef hat es eilig.', 'Auf einem anderen Weg (Telefon, persönlich) nachfragen und die Mail melden.', 'Antworten und um Bestätigung per Mail bitten.'], richtig: 1 },
        { frage: 'Woran erkennen Sie, wohin ein Link wirklich führt?',
          optionen: ['Am blauen, unterstrichenen Text.', 'An der Zieladresse, die erscheint, wenn man mit der Maus über den Link fährt.', 'Am Logo in der Mail.'], richtig: 1 },
        { frage: 'Was ist das sicherste Zeichen für Phishing?',
          optionen: ['Rechtschreibfehler.', 'Ein fremdes Logo.', 'Zeitdruck plus die Bitte um Zugangsdaten, Geld oder einen Klick.'], richtig: 2 },
        { frage: 'Sie haben auf einen Link geklickt und Ihr Passwort eingegeben – dann kommen Zweifel. Was jetzt?',
          optionen: ['Abwarten, ob etwas passiert.', 'Sofort melden und das Passwort ändern.', 'Die Mail löschen, dann ist es erledigt.'], richtig: 1 },
        { frage: 'Der Anzeigename einer Mail lautet „DIHAG IT-Support". Was bedeutet das?',
          optionen: ['Die Mail kommt sicher von der IT.', 'Nichts – der Anzeigename ist frei wählbar, die Adresse dahinter zählt.', 'Die Mail wurde geprüft.'], richtig: 1 },
      ] },
    { id: 'start-passwoerter-artikel', art: 'artikel', thema: 'passwoerter', titel: 'Ein Dienst, ein Passwort – und ein zweiter Faktor', dauer: 2,
      kurz: 'Warum Länge wichtiger ist als Sonderzeichen und wieso ein Passwort nie zweimal verwendet wird.',
      text: `Passwörter werden nicht erraten, sie werden gestohlen – aus Datenlecks bei irgendeinem Online-Dienst. Wer dort dasselbe Passwort benutzt wie im Unternehmen, hat dem Angreifer die Tür aufgeschlossen.

# Drei Regeln
- **Jeder Dienst ein eigenes Passwort.** Ein Passwortmanager merkt sie sich – Sie merken sich nur eines.
- **Lang schlägt kompliziert.** Vier zusammenhanglose Wörter („KaffeeGießereiMondSchraube") sind sicherer als „P@ssw0rt!" und leichter zu merken.
- **Zweiter Faktor überall, wo es ihn gibt.** Die App auf dem Telefon macht ein gestohlenes Passwort wertlos.

# Was nie
- Passwörter per Mail, Chat oder Zettel weitergeben – auch nicht an die IT. Die IT fragt nicht danach.
- Eine MFA-Anfrage bestätigen, die Sie nicht selbst ausgelöst haben. Genau das ist der Angriff („MFA-Müdigkeit"): So lange Anfragen schicken, bis jemand auf „Ja" tippt.

Wenn Sie den Verdacht haben, ein Passwort sei bekannt geworden: ändern und melden – in dieser Reihenfolge, und beides heute.` },
    { id: 'start-passwoerter-test', art: 'test', thema: 'passwoerter', titel: 'Wissenstest: Passwörter & MFA', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Welches Passwort ist am sichersten?', optionen: ['P@ss2024!', 'Vier zusammenhanglose Wörter mit über 20 Zeichen', 'Der Name des Haustiers mit Geburtsjahr'], richtig: 1 },
        { frage: 'Ihr Telefon zeigt eine MFA-Anfrage, obwohl Sie sich gerade nirgends anmelden. Was tun Sie?', optionen: ['Bestätigen – wird schon die IT sein.', 'Ablehnen und melden, das Passwort ändern.', 'Ignorieren, das hört von selbst auf.'], richtig: 1 },
        { frage: 'Darf dasselbe Passwort für den Firmenzugang und einen Online-Shop verwendet werden?', optionen: ['Ja, wenn es lang genug ist.', 'Nein – ein Datenleck beim Shop öffnet sonst den Firmenzugang.', 'Ja, wenn MFA aktiv ist.'], richtig: 1 },
        { frage: 'Die „IT" ruft an und braucht Ihr Passwort, um ein Problem zu lösen. Was ist richtig?', optionen: ['Nennen – die IT hat ohnehin Zugriff.', 'Nie nennen: Die IT braucht Ihr Passwort nicht. Auflegen und melden.', 'Nur den ersten Teil nennen.'], richtig: 1 },
      ] },
    { id: 'start-arbeitsplatz-artikel', art: 'artikel', thema: 'arbeitsplatz', titel: 'Bildschirm, Schreibtisch, Bahn – Sicherheit ohne Technik', dauer: 2,
      kurz: 'Die Gewohnheiten, die kein Virenscanner ersetzt.',
      text: `Die meisten Informationen gehen nicht durch Hacker verloren, sondern durch Alltag: ein Ausdruck am Drucker, ein offener Bildschirm, ein Gespräch im Zug.

# Am Arbeitsplatz
- **Bildschirm sperren**, sobald Sie aufstehen – Windows-Taste + L. Es dauert eine Sekunde.
- **Schreibtisch am Abend leer**: Ausdrucke mit personenbezogenen oder vertraulichen Angaben in den Schrank oder in den Schredder, nicht in den Papierkorb.
- **Besucher begleiten.** Wer ohne Begleitung durchs Haus geht, gehört angesprochen – freundlich, aber immer.

# Unterwegs und zu Hause
- **Öffentliches WLAN nur mit VPN.** Ohne VPN liest jeder im selben Netz mit.
- **Blickschutz im Zug** – oder das Dokument später öffnen. Über die Schulter lesen ist keine Kunst.
- **Geräte nie im Auto lassen**, auch nicht kurz. Ein Laptop im Kofferraum ist ein Laptop weniger.
- **Verlust sofort melden**, damit das Gerät gesperrt werden kann – das ist wichtiger als die Frage nach der Schuld.

Und: Dienstliches auf dienstlichen Geräten. Der private Rechner hat keine Verschlüsselung, keine Sperre, keinen Schutz – und die Familie hat Zugriff.` },
    { id: 'start-arbeitsplatz-test', art: 'test', thema: 'arbeitsplatz', titel: 'Wissenstest: Arbeitsplatz & unterwegs', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Sie verlassen den Platz für zwei Minuten. Der Bildschirm …', optionen: ['… bleibt offen, das lohnt sich nicht.', '… wird gesperrt (Windows + L).', '… wird ausgeschaltet.'], richtig: 1 },
        { frage: 'Im Zug wollen Sie eine Kalkulation öffnen. Was ist richtig?', optionen: ['Öffnen, es sieht ja niemand hin.', 'Mit Blickschutz arbeiten oder warten, bis Sie allein sind.', 'Auf dem privaten Handy öffnen.'], richtig: 1 },
        { frage: 'Ein Ausdruck mit Gehaltsdaten wird nicht mehr gebraucht. Wohin damit?', optionen: ['Papierkorb.', 'Schredder oder verschlossener Datenschutzbehälter.', 'Auf dem Drucker liegen lassen.'], richtig: 1 },
        { frage: 'Das Diensthandy ist weg. Was ist der erste Schritt?', optionen: ['Ein paar Tage suchen.', 'Sofort melden, damit es gesperrt werden kann.', 'Eine neue SIM-Karte bestellen.'], richtig: 1 },
      ] },
    { id: 'start-datenschutz-artikel', art: 'artikel', thema: 'datenschutz', titel: 'Personenbezogene Daten – was das ist und was daraus folgt', dauer: 3,
      kurz: 'Name, Mail, Kennzeichen, Foto: alles, was auf einen Menschen zeigt.',
      text: `Personenbezogen ist alles, was sich einer Person zuordnen lässt: Name, Adresse, E-Mail, Telefonnummer, Personalnummer, Foto, Kfz-Kennzeichen, IP-Adresse, ein Gehalt, ein Krankheitstag. Nicht nur das, was „geheim" ist.

# Vier Grundsätze, die im Alltag reichen
- **Zweck.** Daten nur für den Zweck verwenden, für den sie erhoben wurden. Die Telefonliste ist für die Arbeit da, nicht für die Geburtstagsrunde.
- **So wenig wie nötig.** Nicht alles abfragen, was interessant wäre – nur, was gebraucht wird.
- **Nur, wer es braucht.** Eine Liste mit Krankheitstagen gehört nicht in die Abteilungsmail. Weitergabe an Dritte – auch an Dienstleister – nur mit Grundlage.
- **Nicht länger als nötig.** Was erledigt ist, wird gelöscht oder nach Vorgabe archiviert.

# Besondere Vorsicht
Gesundheit, Religion, Gewerkschaft, Herkunft: Solche Angaben sind besonders geschützt. Sie gehören nicht in Freitextfelder, nicht in Chats und nicht in Tabellen, die „nur intern" sind.

# Wenn etwas schiefgeht
Eine Mail an den falschen Verteiler, ein verlorener USB-Stick, ein Ausdruck am falschen Drucker: **innerhalb von 72 Stunden** muss das Unternehmen unter Umständen die Aufsichtsbehörde informieren. Die Frist läuft ab dem Bekanntwerden – deshalb sofort melden, nicht erst am Wochenende darüber nachdenken.` },
    { id: 'start-datenschutz-test', art: 'test', thema: 'datenschutz', titel: 'Wissenstest: Datenschutz', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Welche Angabe ist personenbezogen?', optionen: ['Das Kfz-Kennzeichen eines Mitarbeiters.', 'Die Anzahl der Mitarbeitenden im Werk.', 'Der Jahresumsatz.'], richtig: 0 },
        { frage: 'Ein Kollege bittet um die Telefonliste für eine private Einladung. Was gilt?', optionen: ['Kein Problem, die ist ja intern.', 'Nein – die Liste ist für den dienstlichen Zweck da.', 'Nur die Handynummern.'], richtig: 1 },
        { frage: 'Sie haben eine Gehaltsübersicht an einen falschen Verteiler gesendet. Was jetzt?', optionen: ['Rückruf der Mail und abwarten.', 'Sofort melden – die Frist gegenüber der Aufsicht kann 72 Stunden betragen.', 'Die Empfänger bitten, es zu löschen, damit ist es erledigt.'], richtig: 1 },
        { frage: 'Welche Angabe ist besonders geschützt?', optionen: ['Die Abteilung.', 'Ein Krankheitsgrund.', 'Die Personalnummer.'], richtig: 1 },
      ] },
    { id: 'start-melden-artikel', art: 'artikel', thema: 'melden', titel: 'Lieber einmal zu viel: Was, wann, wem melden', dauer: 2,
      kurz: 'Ein Sicherheitsvorfall ist kein Fehler, den man versteckt – er ist eine Information, die andere schützt.',
      text: `Die teuersten Vorfälle sind die, von denen die IT zu spät erfährt. Niemand wird für eine Meldung getadelt – auch nicht, wenn sich der Verdacht als harmlos herausstellt.

# Was gemeldet wird
- Eine verdächtige Mail, auch wenn Sie nicht geklickt haben.
- Ein Klick, eine Eingabe, ein geöffneter Anhang – und danach ein ungutes Gefühl.
- Ein verlorenes oder gestohlenes Gerät, ein USB-Stick unbekannter Herkunft.
- Ein Rechner, der sich plötzlich anders verhält: langsam, Fenster, die aufgehen, Dateien, die sich nicht öffnen lassen.
- Daten am falschen Ort: eine Mail an den falschen Empfänger, ein Ausdruck am falschen Drucker.
- Fremde Personen ohne Begleitung in Bereichen, in die sie nicht gehören.

# Wann
Sofort. Nicht nach dem Meeting, nicht nach Feierabend. Bei einem Verschlüsselungsverdacht: Netzwerkkabel ziehen oder WLAN aus, Gerät **nicht** ausschalten – und anrufen.

# Wem
Über das Ticketsystem oder telefonisch an die IT; wenn es schnell gehen muss, zusätzlich an die Vorgesetzten. Bei personenbezogenen Daten erfährt es zusätzlich der Datenschutz. Die Kontaktwege stehen in den Regelwerken und – für den Ernstfall – im Notfallplan.

Was Sie nicht tun: den Vorfall selbst „reparieren", Beweise löschen oder abwarten, ob es von allein weggeht.` },
    { id: 'start-melden-test', art: 'test', thema: 'melden', titel: 'Wissenstest: Vorfall melden', dauer: 2, bestehen: 80,
      kurz: 'Drei Fragen.',
      fragen: [
        { frage: 'Ihr Rechner zeigt eine Meldung, dass Ihre Dateien verschlüsselt wurden. Was ist richtig?', optionen: ['Rechner ausschalten und neu starten.', 'Vom Netz trennen, eingeschaltet lassen, sofort die IT anrufen.', 'Erst einmal den Anweisungen auf dem Bildschirm folgen.'], richtig: 1 },
        { frage: 'Sie haben eine verdächtige Mail erhalten, aber nichts angeklickt. Melden?', optionen: ['Nein, es ist ja nichts passiert.', 'Ja – die Meldung schützt die Kolleginnen und Kollegen, die dieselbe Mail bekommen.', 'Nur, wenn sie noch einmal kommt.'], richtig: 1 },
        { frage: 'Wann wird ein Vorfall gemeldet?', optionen: ['Nach Feierabend, wenn Ruhe ist.', 'Sofort – jede Stunde zählt.', 'Nachdem man selbst versucht hat, ihn zu beheben.'], richtig: 1 },
      ] },
    { id: 'start-ki-artikel', art: 'artikel', thema: 'ki', titel: 'Was in einen KI-Chat darf – und was nicht', dauer: 3,
      kurz: 'KI-Assistenten sind Werkzeuge. Was Sie hineingeben, verlässt das Haus.',
      text: `Ein KI-Chat ist ein Dienst eines fremden Anbieters. Was Sie eingeben, wird dort verarbeitet – je nach Dienst auch gespeichert und zum Training verwendet. Der Maßstab ist deshalb einfach: **Was Sie nicht auf eine Postkarte schreiben würden, gehört nicht in einen öffentlichen KI-Chat.**

# Nicht hinein
- Personenbezogene Daten: Namen von Mitarbeitenden, Kunden, Bewerbern; Mails mit Absendern; Gehälter; Beurteilungen.
- Vertrauliches: Kalkulationen, Angebote, Verträge, Zeichnungen, Rezepturen, Quellcode, Kundenlisten, Strategiepapiere.
- Zugangsdaten, interne Adressen, Systemnamen.

# Darf hinein
- Allgemeine Fragen, Formulierungshilfen für Texte ohne vertrauliche Inhalte, öffentliche Informationen, Übersetzungen unkritischer Texte.
- Alles, was das Haus über einen **freigegebenen** Dienst mit Vertrag und ohne Training erlaubt – welche das sind, sagt das KI-Regelwerk.

# Und das Ergebnis
KI erfindet. Zahlen, Paragrafen, Quellen und Zitate immer prüfen, bevor sie in ein Dokument wandern. Verantwortlich bleibt, wer das Ergebnis verwendet – nicht das Werkzeug.

Im Zweifel: Namen und Zahlen entfernen, allgemein fragen, oder den Anwendungsfall über den KI-Antrag freigeben lassen.` },
    { id: 'start-ki-test', art: 'test', thema: 'ki', titel: 'Wissenstest: KI im Arbeitsalltag', dauer: 2, bestehen: 80,
      kurz: 'Vier Fragen.',
      fragen: [
        { frage: 'Sie wollen eine Kundenmail freundlicher formulieren lassen. Was ist richtig?', optionen: ['Die ganze Mail samt Name und Angebotspreis einfügen.', 'Namen, Firmen und Zahlen entfernen – oder einen freigegebenen Dienst nutzen.', 'Nur den Betreff einfügen, den Rest im Kopf behalten.'], richtig: 1 },
        { frage: 'Ein KI-Chat nennt einen Paragrafen als Beleg. Was tun Sie?', optionen: ['Übernehmen – die KI hat den Text gelesen.', 'Prüfen, ob es den Paragrafen gibt und ob er das sagt.', 'Den Paragrafen weglassen, den Rest übernehmen.'], richtig: 1 },
        { frage: 'Welche Eingabe ist in einem öffentlichen KI-Chat in Ordnung?', optionen: ['Die Kalkulation eines Angebots.', 'Eine allgemeine Frage zur Formatierung einer Tabelle.', 'Die Bewerbungsunterlagen eines Kandidaten.'], richtig: 1 },
        { frage: 'Wer ist verantwortlich, wenn ein KI-Ergebnis falsch in ein Dokument gelangt?', optionen: ['Der Anbieter der KI.', 'Die Person, die das Ergebnis verwendet hat.', 'Niemand – es war die KI.'], richtig: 1 },
      ] },
  ],
};

/** Den Startbestand ergänzen – nur, was (nach Kennung) noch fehlt. @returns Zahl der neuen Beiträge */
function wiStartbestandErgaenzen(daten, wer, jetzt) {
  let n = 0;
  WI_STARTBESTAND.themen.forEach(t => { if (!wiThema(daten, t.id)) daten.themen.push(Object.assign({}, t)); });
  WI_STARTBESTAND.beitraege.forEach(b => {
    if (wiBeitrag(daten, b.id)) return;
    const neu = wiNormalisieren({ beitraege: [Object.assign({ erstelltAm: jetzt || new Date().toISOString(), erstelltVon: wer || '' }, b)] }).beitraege[0];
    daten.beitraege.push(neu); n++;
  });
  return n;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WI_ARTEN, WI_PREFIX, WI_TAGE, WI_BESTEHEN, WI_WERKE, WI_STARTBESTAND,
    wiArt, wiAckId, wiIstWissenAck, wiBeitragIdVon, wiNeueId, wiSlug, wiTextHtml, wiNormalisieren, wiThema, wiBeitrag,
    wiBeitragFehler, wiSichtbar, wiStand, wiKennzahlen, wiAuswertung, wiStartbestandErgaenzen };
}
