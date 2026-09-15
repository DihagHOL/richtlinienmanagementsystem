/**
 * Vorfälle & Ereignisse – das Modell (vorfallmodell.js)
 *
 * ISO 27001 A.5.24–A.5.28, NIS2 Art. 23, DSGVO Art. 33: Tickets aus dem
 * Ticketsystem lesen, nach Kategorie und Art trennen, die Beurteilung und
 * ihre Fristen rechnen, Lücken und Kennzahlen nennen, die Akte drucken.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AM = require(path.join(ROOT, 'js/assetmodell.js'));
// Das Modell greift im Browser auf amFeldKey/amWerkeVon zu – im Test stehen sie global bereit.
globalThis.amFeldKey = AM.amFeldKey; globalThis.amWerkeVon = AM.amWerkeVon;
const V = require(path.join(ROOT, 'js/vorfallmodell.js'));
const { VF_ARTEN, VF_EINSTUFUNG, VF_FRISTEN, VF_BEURTEILUNG_TAGE, VF_MONATE, VF_ALIASE,
  vfArtVon, vfOffen, vfPrioRang, vfIstSicherheit, vfAusFeldern, vfBewertungVon, vfFristen, vfRestText, vfLuecken, vfSichtbar, vfKennzahlen, vfBerichtHtml } = V;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const h = (n) => n * 3600000;
const jetzt = '2026-09-15T12:00:00.000Z';
const vor = (stunden) => new Date(new Date(jetzt).getTime() - h(stunden)).toISOString();

/* ── 1) Vokabular ── */
ok(Object.keys(VF_ARTEN).join() === 'incident,change,doku' && VF_EINSTUFUNG.length === 3 && VF_FRISTEN.length === 4, 'Drei Arten, drei Einstufungen, vier Fristen');
ok(VF_FRISTEN.find(f => f.key === 'fruehwarnung').stunden === 24 && VF_FRISTEN.find(f => f.key === 'meldung').stunden === 72 && VF_FRISTEN.find(f => f.key === 'abschluss').stunden === 720 && VF_FRISTEN.find(f => f.key === 'abschluss').ab === 'meldung' && VF_FRISTEN.find(f => f.key === 'dsgvo').stunden === 72,
  'NIS2 Art. 23: 24 h, 72 h, ein Monat nach der Meldung; DSGVO Art. 33: 72 h');
ok(vfArtVon('Incident') === 'incident' && vfArtVon('Störung') === 'incident' && vfArtVon('Change') === 'change' && vfArtVon('Änderung') === 'change' && vfArtVon('Doku') === 'doku' && vfArtVon('Dokumentation') === 'doku' && vfArtVon('Sonstiges') === '',
  'Die Art des Tickets: Incident/Störung, Change/Änderung, Doku – wie das Haus schreibt');
ok(vfArtVon('Service Request', { 'Service Request': 'change' }) === 'change' && vfArtVon('Incident', { Incident: 'doku' }) === 'doku', 'Die Einstellungen dürfen ein Wort anders zuordnen');
ok(vfOffen('Offen') && vfOffen('In Bearbeitung') && vfOffen('') && !vfOffen('Erledigt') && !vfOffen('Geschlossen') && !vfOffen('Closed') && !vfOffen('Abgebrochen'), 'Offen ist alles, was nicht nach Ende klingt');
ok(vfPrioRang('Kritisch') === 3 && vfPrioRang('Hoch') === 2 && vfPrioRang('Mittel') === 1 && vfPrioRang('Niedrig') === 0 && vfPrioRang('') === -1, 'Priorität auf 0–3');
ok(vfIstSicherheit('IT-Sicherheit', {}) && vfIstSicherheit('Phishing', {}) && vfIstSicherheit('Datenschutz', {}) && !vfIstSicherheit('Drucker', {}) && !vfIstSicherheit('', {}), 'Ohne Einstellungen zählt das Muster');
ok(vfIstSicherheit('Drucker', { vorfallKategorien: ['Drucker'] }) && !vfIstSicherheit('Phishing', { vorfallKategorien: ['Drucker'] }) && vfIstSicherheit('it-sicherheit', { vorfallKategorien: ['IT-Sicherheit'] }),
  'Nennen die Einstellungen Kategorien, gelten genau die – ohne Rücksicht auf Groß und Klein');

/* ── 2) Tickets lesen ── */
const roh = { id: 4711, createdDateTime: vor(30), lastModifiedDateTime: vor(1), webUrl: 'https://t/4711', createdBy: { user: { displayName: 'Max Melder' } },
  fields: { Title: 'Phishing-Mail an Buchhaltung', Status: 'In Bearbeitung', 'Priorit_x00e4_t': 'Hoch', Kategorie: 'IT-Sicherheit', Art: 'Incident', Werk: 'Wittenberge (WGC)',
    Beschreibung: 'Zwei Kollegen haben geklickt.', Zugewiesen: { LookupValue: 'IT Support', Email: 'it@x' } } };
const t = vfAusFeldern(roh, { standorte: ['HOL', 'WGC'] });
ok(t.id === '4711' && t.titel === 'Phishing-Mail an Buchhaltung' && t.status === 'In Bearbeitung' && t.prio === 'Hoch' && t.kategorie === 'IT-Sicherheit' && t.art === 'incident' && t.artRoh === 'Incident', 'Titel, Status, Priorität (kodiert), Kategorie, Art');
ok(t.werke.join() === 'WGC' && t.zugewiesen === 'it@x' && t.melder === 'Max Melder' && t.erstellt === vor(30) && t.offen && t.url === 'https://t/4711', 'Werk (Kürzel im Text), Bearbeiter (Person), Melder, Zeit, offen, Link');
const ohne = vfAusFeldern({ id: 5, Title: 'x', Status: 'Erledigt', Ticketart: 'Change', Category: 'Security', Created: vor(100), Modified: vor(2) }, { urlVon: (id) => `u/${id}` });
ok(ohne.art === 'change' && ohne.kategorie === 'Security' && !ohne.offen && ohne.erstellt === vor(100) && ohne.geaendert === vor(2) && ohne.url === 'u/5', 'Auch aus nackten Feldern (Cron): Ticketart, Category, Created/Modified, Link aus der Vorlage');
ok(vfAusFeldern({ id: 6, fields: { Title: 'y', Typ: 'Sicherheit', Art: 'Störung' } }, { feld: (e) => (e === 'Kategorie' ? 'Typ' : e === 'Art' ? 'Art' : null) }).kategorie === 'Sicherheit', 'Mit Spaltenmeta zählt, was die Meta sagt');

/* ── 3) Bewertung und Fristen ── */
const b0 = vfBewertungVon(null);
ok(b0.einstufung === '' && b0.erheblich === null && b0.stufe === null && b0.personendaten === false && b0.meldungen.fruehwarnung === '' && Array.isArray(b0.historie), 'Eine leere Bewertung ist vollständig');
ok(vfBewertungVon({ einstufung: 'vorfall', erheblich: 'ja', stufe: '2', kenntnisAm: 'nix' }).erheblich === null && vfBewertungVon({ einstufung: 'vorfall', erheblich: true, stufe: '2' }).stufe === 2 && vfBewertungVon({ stufe: 9 }).stufe === null && vfBewertungVon({ kenntnisAm: 'nix' }).kenntnisAm === '',
  'Erheblich nur als Wahrheitswert, Stufe 0–3, kaputte Zeiten werden leer');
ok(vfFristen(t, { einstufung: 'ereignis', erheblich: true }, jetzt).length === 0 && vfFristen(t, { einstufung: 'vorfall', erheblich: false }, jetzt).length === 0, 'Ein Ereignis hat keine Fristen; ein nicht erheblicher Vorfall ohne Personendaten auch nicht');
const fr = vfFristen(t, { einstufung: 'vorfall', erheblich: true }, jetzt);   // Kenntnis vor 30 h
ok(fr.length === 3 && fr[0].key === 'fruehwarnung' && fr[0].stand === 'ueberfaellig' && fr[0].restStunden === -6 && fr[1].key === 'meldung' && fr[1].stand === 'offen' && fr[1].restStunden === 42,
  'Erheblich, Kenntnis vor 30 h: Frühwarnung seit 6 h überfällig, Meldung noch 42 h');
ok(fr[2].key === 'abschluss' && fr[2].faellig === new Date(new Date(vor(30)).getTime() + h(72) + h(720)).toISOString(), 'Der Abschlussbericht rechnet ab der Meldefrist, solange nicht gemeldet ist …');
const fr2 = vfFristen(t, { einstufung: 'vorfall', erheblich: true, meldungen: { fruehwarnung: vor(20), meldung: vor(2) } }, jetzt);
ok(fr2[0].stand === 'erledigt' && fr2[1].stand === 'erledigt' && fr2[2].faellig === new Date(new Date(vor(2)).getTime() + h(720)).toISOString() && fr2[2].stand === 'offen',
  '… und ab der tatsächlichen Meldung, sobald sie da ist; erledigte Fristen sind erledigt');
ok(vfFristen(t, { einstufung: 'vorfall', erheblich: true, meldungen: { fruehwarnung: vor(2) } }, jetzt)[0].stand === 'verspaetet', 'Eine Frühwarnung nach 28 h ist verspätet – abgegeben, aber sichtbar');
const frD = vfFristen(t, { einstufung: 'vorfall', erheblich: false, personendaten: true }, jetzt);
ok(frD.length === 1 && frD[0].key === 'dsgvo' && frD[0].restStunden === 42, 'Personendaten ohne NIS2-Erheblichkeit: nur die DSGVO-Frist');
ok(vfFristen(t, { einstufung: 'vorfall', erheblich: true, kenntnisAm: vor(10) }, jetzt)[0].restStunden === 14, 'Die Kenntnis aus der Bewertung schlägt die Erstellung des Tickets');
ok(vfRestText(-6) === 'seit 6 h überfällig' && vfRestText(42) === 'noch 42 h' && vfRestText(100) === 'noch 4 Tagen', 'Rest in Worten');

/* ── 4) Lücken ── */
const frisch = Object.assign({}, t, { erstellt: vor(10) });
ok(vfLuecken(frisch, null, { jetzt }).fehler.length === 0 && vfLuecken(frisch, null, { jetzt }).hinweise.some(x => /Noch nicht beurteilt/.test(x)), 'Ein Ereignis von vorhin: Hinweis, keine Lücke');
const alt = Object.assign({}, t, { erstellt: vor(24 * (VF_BEURTEILUNG_TAGE + 1)) });
ok(vfLuecken(alt, null, { jetzt }).fehler.some(x => /Nicht beurteilt \(A\.5\.25\) – seit 3 Tagen/.test(x)), `Nach ${VF_BEURTEILUNG_TAGE} Tagen ohne Beurteilung: Lücke`);
ok(vfLuecken(alt, { einstufung: 'ereignis' }, { jetzt }).fehler.length === 0, 'Als Ereignis beurteilt: nichts mehr offen');
const lu = vfLuecken(t, { einstufung: 'vorfall' }, { jetzt });
ok(lu.fehler.some(x => /Erheblichkeit nicht entschieden/.test(x)) && lu.hinweise.some(x => /Eskalationsstufe/.test(x)), 'Ein Vorfall ohne Entscheidung über die Erheblichkeit: Lücke; ohne Stufe: Hinweis');
const luE = vfLuecken(t, { einstufung: 'vorfall', erheblich: true, stufe: 2 }, { jetzt });
ok(luE.fehler.some(x => /Frühwarnung \(NIS2\) seit 6 h überfällig/.test(x)) && luE.hinweise.some(x => /Krisenstab/.test(x)) && luE.hinweise.some(x => /Beweismittel/.test(x)), 'Erheblich und überfällig: die Frühwarnung als Lücke; Stufe 2 nennt den Krisenstab; Beweise gefragt');
const zu = Object.assign({}, t, { status: 'Erledigt', offen: false });
const luZ = vfLuecken(zu, { einstufung: 'vorfall', erheblich: false, stufe: 1 }, { jetzt });
ok(luZ.fehler.some(x => /Ursache nicht festgehalten \(A\.5\.26\)/.test(x)) && luZ.fehler.some(x => /keine Lehre daraus \(A\.5\.27\)/.test(x)) && luZ.hinweise.some(x => /Keine Korrekturmaßnahme/.test(x)),
  'Erledigt ohne Ursache und Lehre: zwei Lücken; ohne Maßnahme: Hinweis');
const luF = vfLuecken(zu, { einstufung: 'vorfall', erheblich: false, stufe: 1, ursache: 'Makro', lessons: 'Makros sperren', beweise: 'Mail im Quarantäne-Ordner' }, { jetzt, massnahmen: [{ herkunftId: 'ticket:4711' }] });
ok(luF.fehler.length === 0 && luF.hinweise.length === 0, 'Mit Ursache, Lehre und Maßnahme: vollständig');
ok(vfLuecken(Object.assign({}, t, { art: 'change' }), null, { jetzt }).fehler.length === 0, 'Änderungen und Dokus werden nicht beurteilt');

/* ── 5) Sichtbarkeit, Kennzahlen ── */
ok(vfSichtbar(t, ['WGC']) && !vfSichtbar(t, ['HOL']) && vfSichtbar(Object.assign({}, t, { werke: [] }), ['HOL']) && vfSichtbar(t, null), 'Trennung nach Gesellschaft: nur das eigene Werk, ohne Werk für alle');
const tickets = [
  t,                                                                                        // offen, Vorfall erheblich, Frühwarnung überfällig
  Object.assign({}, t, { id: '2', erstellt: vor(24 * 5), offen: true }),                       // unbeurteilt, 5 Tage
  Object.assign({}, t, { id: '3', status: 'Erledigt', offen: false, erstellt: vor(24 * 40), geaendert: vor(24 * 38) }),   // Vorfall erledigt ohne Lehre
  Object.assign({}, t, { id: '4', art: 'change', artRoh: 'Change' }),
  Object.assign({}, t, { id: '5', art: 'doku', artRoh: 'Doku', werke: ['HOL'] }),
  Object.assign({}, t, { id: '6', erstellt: vor(24 * 400), status: 'Erledigt', offen: false, geaendert: vor(24 * 399) }),  // alt, Ereignis
];
const bew = { 4711: { einstufung: 'vorfall', erheblich: true, stufe: 2 }, 3: { einstufung: 'vorfall', erheblich: false }, 6: { einstufung: 'ereignis' } };
const z = vfKennzahlen(tickets, bew, { jetzt });
ok(z.gesamt === 6 && z.incidents === 4 && z.changes === 1 && z.dokus === 1 && z.offen === 4 && z.offeneIncidents === 2, 'Zählt: gesamt, je Art, offen');
ok(z.unbeurteilt === 1 && z.ereignisse === 1 && z.vorfaelle === 2 && z.erheblich === 1 && z.krise === 1 && z.fristenUeberfaellig === 1 && z.fristenOffen === 2 && z.ohneLessons === 1 && z.letzte12Monate === 3,
  'Beurteilungen, Erheblichkeit, Stufe, Fristen, fehlende Lehren, Meldungen in 12 Monaten');
ok(z.dauerMittelTage === 1.5 && z.fehler >= 4 && z.offenListe.length === 3 && z.offenListe[0].id === '4711', 'Bearbeitungsdauer im Mittel; die Liste dessen, was drängt');
ok(vfKennzahlen(tickets, bew, { jetzt, werke: ['HOL'] }).gesamt === 1, 'Mit Sichtbarkeit: nur HOL (die Doku)');

/* ── 6) Die Akte ── */
const html = vfBerichtHtml({ ticket: t, bewertung: { einstufung: 'vorfall', erheblich: true, stufe: 2, ursache: 'Makro', lessons: 'Makros sperren', meldungen: { fruehwarnung: vor(20) } }, jetzt, massnahmen: [{ herkunftId: 'ticket:4711', titel: 'Makros sperren', status: 'offen' }] });
ok(/<title>Vorfallakte 4711 – Phishing-Mail an Buchhaltung<\/title>/.test(html) && /Sicherheitsvorfall<\/b>/.test(html) && /ja – meldepflichtig/.test(html) && /Frühwarnung \(NIS2\)/.test(html) && /fristgerecht/.test(html) && /noch 42 h/.test(html) && /Makros sperren/.test(html) && /window\.print\(\)/.test(html) && !/\$\{/.test(html),
  'Die Akte: Ticket, Beurteilung, Fristen mit Stand, Lehren, Maßnahme, Druckknopf – ohne Platzhalter');
ok(/&lt;/.test(vfBerichtHtml({ ticket: Object.assign({}, t, { titel: '<b>x' }), bewertung: null })) , 'Titel werden escaped');

/* ── 7) Die Aliase kennen die Ticket-App ── */
ok(VF_ALIASE.Kategorie.includes('Kategorie') && VF_ALIASE.Art.includes('Ticketart') && VF_ALIASE.Prioritaet.includes('Priorität') && VF_ALIASE.Zugewiesen.includes('AssignedTo') && VF_MONATE === 24, 'Dieselben Spaltennamen wie die Ticket-App; 24 Monate zurück');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
