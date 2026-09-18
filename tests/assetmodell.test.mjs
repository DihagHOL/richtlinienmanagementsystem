/**
 * Assetregister – das Modell (ISO 27001 A.5.9/A.5.12, BSI 200-2)
 *
 * Bisher las die App eine fremde Liste und erriet ihre Spalten. Jetzt hat
 * sie ein eigenes Register, und das Modell hier sagt, was ein Asset ist, was
 * ihm fehlt, was mit ihm ausfällt und was die Prozesse von ihm verlangen.
 *
 * Der Prüfstein: die Schutzbedarfs-Vererbung (ein kritischer Prozess
 * verlangt „sehr hoch"), die Abhängigkeit Asset → Asset (ein Netz reißt SAP
 * mit – ohne Kreis), R093 („sehr hoch" ohne Wiederherstellzeit ist eine
 * Lücke) und die Zusatzfelder, die niemand in SharePoint anlegen muss.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const A = require(path.join(ROOT, 'js', 'assetmodell.js'));
const { amVon, amKurz, amKategorien, amKategorieKey, amZusatzfelder, amRang, amStufeLabel, amStatusVon, amKlasseVon, amArtVon, amArtText, amLinkVon,
  amSpaltenNorm, amSpalteFinden, amSelectVon, amFeldText, amFeldKey, amWerkeVon, amAbhaengigLesen, amAusFeldern, amTraegerAufloesen, AM_ALIASE, AM_ART, amSollVerfuegbarkeit, amTageBis, amFaelligkeiten, amLuecken, amKanon,
  amAbhaengige, amVoraussetzungen, amKreis, amSichtbar, amKennzahlen, amInventarHtml, AM_KATEGORIEN_STANDARD, AM_SCHUTZBEDARF, AM_VORLAUF_TAGE } = A;

/* ── 1) Kein Browser ── */
const src = fs.readFileSync(path.join(ROOT, 'js', 'assetmodell.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
ok(!/\bdocument\.|\blocalStorage\b|\bfetch\(/.test(src.replace(/onclick="window\.print\(\)"/g, '')), 'Kein DOM, kein Netz – der Cron kann es laden');

/* ── 2) Normalisieren ── */
let a = amVon({});
ok(a.id === '' && a.titel === '' && a.status === 'aktiv' && a.werke.length === 0 && a.wiederherstellung === '' && typeof a.zusatz === 'object', 'Leer, aber vollständig – kein undefined');
a = amVon({ id: 7, title: 'SAP', werke: 'hol, wgc', vertraulichkeit: 'Sehr Hoch', klassifizierung: 'Intern', status: 'kaputt', wiederherstellung: '12', rpo: -1, eol: '2027-03-01T00:00:00Z', abhaengigVon: [{ id: 3 }, '4', ''], personenbezogen: 'ja' });
ok(a.id === '7' && a.titel === 'SAP' && a.werke.join() === 'HOL,WGC', 'Ids werden Text, Werke Großbuchstaben, title → titel');
ok(a.vertraulichkeit === 'sehr hoch' && a.klassifizierung === 'intern' && a.status === 'aktiv', 'Stufen tolerant, ein unbekannter Status wird „aktiv"');
ok(a.wiederherstellung === 12 && a.rpo === '' && a.eol === '2027-03-01', 'Zahlen aus Text, negative fallen weg, Datum ohne Uhrzeit');
ok(a.abhaengigVon.join() === '3,4' && a.personenbezogen === true, 'Abhängigkeiten als Ids, „ja" ist wahr');
ok(amKurz(amVon({ kategorie: 'server', werke: ['ALLE'], verfuegbarkeit: 'hoch' })) === 'Server / Datenbank · konzernweit · Verfügbarkeit hoch', 'Die Kurzzeile');

/* ── 3) Einstellungen ── */
ok(amKategorien({}).length === AM_KATEGORIEN_STANDARD.length && amKategorien({ assetKategorien: [] }).length === 10, 'Ohne eigene: der Standard nach BSI');
ok(amKategorien({ assetKategorien: [{ key: 'Roboter 1', label: 'Roboter' }, { key: '', label: 'x' }] }).map(k => k.key).join() === 'roboter1', 'Eigene ersetzen ihn – Schlüssel bereinigt, Leeres fällt weg');
const zf = amZusatzfelder({ assetZusatzfelder: [{ label: 'Inventarnummer', typ: 'text', pflicht: true }, { label: 'Raum', typ: 'auswahl', optionen: 'EG; OG' }, { label: 'Wartung', typ: 'unsinn' }, { label: '' }, { label: 'Inventarnummer' }] });
ok(zf.length === 3 && zf[0].key === 'inventarnummer' && zf[0].pflicht === true, 'Zusatzfelder: Schlüssel aus dem Namen, Pflicht bleibt, Doppeltes fällt weg');
ok(zf[1].optionen.join() === 'EG,OG' && zf[2].typ === 'text', 'Optionen aufgeteilt, unbekannter Typ wird Text');

ok(amKategorieKey('Server') === 'server' && amKategorieKey('Server / Datenbank') === 'server' && amKategorieKey('server') === 'server' && amKategorieKey('Roboter') === 'Roboter' && amKategorieKey('') === '',
  'Eine Beschriftung aus der Liste findet ihren Schlüssel; Unbekanntes bleibt Text');
ok(amLuecken({ titel: 'X', kategorie: 'Information / Daten' }).fehler.some(x => /Klassifizierung fehlt/.test(x)), 'Auch als Beschriftung: eine Information verlangt Klassifizierung');

/* ── 3b) Die Skala des Hauses – gelesen wie sie ist, verglichen über den Rang ── */
const heute = '2026-09-14';
ok(amRang('sehr hoch') === 2 && amRang('3 – sehr hoch') === 2 && amRang('very high') === 2 && amRang('3') === 2, '„sehr hoch" in jeder Schreibweise → Rang 2');
ok(amRang('hoch') === 1 && amRang('2 - hoch') === 1 && amRang('High') === 1 && amRang('mittel') === 1, '„hoch", „2", „mittel" (Mitte einer Dreierskala) → Rang 1');
ok(amRang('normal') === 0 && amRang('niedrig') === 0 && amRang('1 - niedrig') === 0 && amRang('low') === 0 && amRang('gering') === 0, '„normal", „niedrig", „1", „low" → Rang 0');
ok(amRang('') === -1 && amRang('egal') === -1 && amStufeLabel(2) === 'sehr hoch' && amStufeLabel(-1) === '', 'Leer und Unbekanntes: kein Rang');
ok(amRang('intern') === 0 && amRang('öffentlich') === 0 && amRang('vertraulich') === 1 && amRang('streng vertraulich') === 2 && amRang('Confidential') === 1,
  'Die Einstufung bei der Vertraulichkeit: intern → normal, vertraulich → hoch, streng vertraulich → sehr hoch');
const ein = amVon({ vertraulichkeit: 'vertraulich', integritaet: 'sehr hoch', verfuegbarkeit: 'sehr hoch' });
ok(ein.klassifizierung === 'vertraulich' && ein.vertraulichkeit === 'vertraulich', 'Steht die Einstufung bei der Vertraulichkeit, ist sie zugleich die Klassifizierung');
ok(amVon({ vertraulichkeit: 'hoch' }).klassifizierung === '' && amVon({ vertraulichkeit: 'intern', klassifizierung: 'Streng Vertraulich' }).klassifizierung === 'streng vertraulich',
  '„hoch" ist keine Einstufung; eine eigene Klassifizierung geht vor');
ok(amVon({ vertraulichkeit: '3 - Sehr Hoch' }).vertraulichkeit === '3 - sehr hoch', 'Der Wert bleibt, wie die Liste ihn hat – nur klein');
ok(amStatusVon('in Betrieb') === 'aktiv' && amStatusVon('ausgemustert') === 'außer Betrieb' && amStatusVon('geplant') === 'in Beschaffung' && amStatusVon('Phase-out') === 'auslaufend' && amStatusVon('') === 'aktiv',
  'Ein Status des Hauses landet auf einer der vier Stufen');
ok(amKlasseVon('Streng Vertraulich') === 'streng vertraulich' && amKlasseVon('Confidential') === 'vertraulich' && amKlasseVon('Public') === 'öffentlich' && amKlasseVon('TLP:GREEN') === 'tlp:green', 'Klassifizierung tolerant, Unbekanntes bleibt');
let lu2 = amLuecken({ titel: 'X', kategorie: 'server', werke: ['HOL'], verantwortlich: 'a', vertraulichkeit: '2 - hoch', integritaet: '3 - sehr hoch', verfuegbarkeit: '3 - sehr hoch', klassifizierung: 'intern', wiederherstellung: 4, rpo: 1 }, { heute });
ok(lu2.fehler.length === 0 && lu2.hinweise.length === 0, 'Eine Bewertung in der Skala des Hauses ist eine Bewertung – keine Lücke, kein Hinweis');
lu2 = amLuecken({ titel: 'X', verfuegbarkeit: 'egal' }, { heute });
ok(lu2.hinweise.some(x => /nicht einzuordnen: Verfügbarkeit „egal"/.test(x)), 'Ein Wert, den die App nicht einordnen kann, wird als Hinweis genannt – nicht als fehlend');
ok(amKennzahlen([{ id: '1', titel: 'A', verfuegbarkeit: '3 - sehr hoch' }], { heute }).sehrHoch === 1, 'Die Kennzahl „sehr hoch" zählt über den Rang');

/* ── 3c) Die Liste des Hauses – Asset-Typ, Standorte, Asset-Owner, Informationsträger, Link, weitere Infos ── */
ok(amArtVon('Primär') === 'primär' && amArtVon('primary') === 'primär' && amArtVon('Sekundär') === 'unterstützend' && amArtVon('supporting') === 'unterstützend' && amArtVon('Server') === '' && AM_ART.length === 2,
  'Die Art nach ISO 27005: Primär / Sekundär in jeder Schreibweise, sonst nichts');
ok(amArtText('primär') === 'Primär' && amArtText('') === '', 'Die Art in Worten');
ok(amLinkVon({ Url: 'https://x/y', Description: 'Prozesslandkarte' }).text === 'Prozesslandkarte' && amLinkVon('https://x/y, Doku').url === 'https://x/y' && amLinkVon('https://x/y, Doku').text === 'Doku' && amLinkVon('https://x/y').url === 'https://x/y' && amLinkVon('nur Text').text === 'nur Text' && amLinkVon('').url === '',
  'Ein Link aus Hyperlink-Spalte, aus „Adresse, Text" oder nackter Adresse');
ok(amSpaltenNorm('Integrit_x00e4_t') === 'integritaet' && amSpaltenNorm('Asset-Owner') === 'assetowner' && amSpaltenNorm('weitere Infos') === 'weitereinfos', 'Spaltennamen vergleichbar: kodiert, mit Umlaut, mit Bindestrich, mit Leerzeichen');
const hausSpalten = [
  { name: 'Title', displayName: 'Asset' }, { name: 'Asset_x002d_Typ', displayName: 'Asset-Typ' }, { name: 'Standorte', displayName: 'Standorte', lookup: { listId: 'b' } },
  { name: 'Asset_x002d_Owner', displayName: 'Asset-Owner', lookup: { listId: 'c' } }, { name: 'Vertraulichkeit', displayName: 'Vertraulichkeit' },
  { name: 'Integrit_x00e4_t', displayName: 'Integrität' }, { name: 'Verf_x00fc_gbarkeit', displayName: 'Verfügbarkeit' },
  { name: 'LinkzudenInformationen', displayName: 'Link zu den Informationen' }, { name: 'Informationstr_x00e4_ger', displayName: 'Informationsträger', lookup: { listId: 'a', allowMultipleValues: true } },
  { name: 'weitereInfos', displayName: 'weitere Infos' },
];
const hf = (e) => amSpalteFinden(hausSpalten, e);
ok(hf('Art') === 'Asset_x002d_Typ' && hf('Kategorie') === null && hf('Werke') === 'Standorte' && hf('Verantwortlich') === 'Asset_x002d_Owner' && hf('AbhaengigJson') === 'Informationstr_x00e4_ger' && hf('Link') === 'LinkzudenInformationen' && hf('Beschreibung') === 'weitereInfos' && hf('Integritaet') === 'Integrit_x00e4_t' && hf('Rpo') === null,
  'Jede Spalte des Hauses wird gefunden: Asset-Typ = Art, Standorte = Werke, Asset-Owner = Verantwortlich, Informationsträger = Abhängigkeit, Link, weitere Infos = Beschreibung');
ok(amSpalteFinden([{ name: 'Typ', displayName: 'Typ', choices: ['Primär', 'Sekundär'] }], 'Art') === 'Typ' && amSpalteFinden([{ name: 'Typ', displayName: 'Typ', choices: ['Primär', 'Sekundär'] }], 'Kategorie') === null,
  'Ein „Typ" mit Primär/Sekundär ist die Art …');
ok(amSpalteFinden([{ name: 'Typ', displayName: 'Typ', choices: ['Server', 'Anwendung'] }], 'Kategorie') === 'Typ' && amSpalteFinden([{ name: 'Typ', displayName: 'Typ', choices: ['Server', 'Anwendung'] }], 'Art') === null && amSpalteFinden([{ name: 'Typ', displayName: 'Typ' }], 'Kategorie') === 'Typ',
  '… ein „Typ" mit Server/Anwendung (oder ohne Auswahl) die Kategorie');
const sel = amSelectVon(hausSpalten, hf).split(',');
ok(sel[0] === 'id' && sel[1] === 'Title' && sel.includes('Asset_x002d_OwnerLookupId') && sel.includes('StandorteLookupId') && sel.includes('Informationstr_x00e4_gerLookupId') && !sel.includes('Kategorie') && !sel.includes('Rpo'),
  'Die Feldauswahl: nur, was es gibt – Nachschlagefelder samt LookupId');
ok(amFeldText({ Description: 'Doku', Url: 'https://x' }) === 'Doku' && amFeldText([{ LookupValue: 'A' }, { LookupValue: 'B' }]) === 'A, B' && amFeldText({ Email: 'a@x' }) === 'a@x', 'Ein Feld als Text: Hyperlink, Nachschlagen, Person');
const w1 = amWerkeVon('Alle DIHAG-Standorte', ['HOL', 'WGC']), w2 = amWerkeVon([{ LookupValue: 'Wittenberge (WGC)' }, { LookupValue: 'HOL' }], ['HOL', 'WGC']), w3 = amWerkeVon('', ['HOL']);
ok(w1.werke.join() === 'ALLE' && w2.werke.join() === 'WGC,HOL' && w3.werke.length === 0 && amWerkeVon('alle Werke', ['HOL']).werke.join() === 'ALLE', '„Alle DIHAG-Standorte" heißt konzernweit; Kürzel werden erkannt; leer bleibt leer');
const lk = (n) => (n === 'Informationstr_x00e4_ger' ? { selbst: true, multi: true } : null);
ok(amAbhaengigLesen({ 'Informationstr_x00e4_gerLookupId': [11, 12] }, 'Informationstr_x00e4_ger', lk).ids.join() === '11,12', 'Nachschlagen auf die Liste selbst: die LookupIds sind die Asset-Ids');
ok(amAbhaengigLesen({ 'Informationstr_x00e4_ger': [{ LookupId: 11, LookupValue: 'Sharepoint' }] }, 'Informationstr_x00e4_ger', lk).ids.join() === '11', '… auch aus den Objekten');
const fremd = amAbhaengigLesen({ Traeger: [{ LookupId: 5, LookupValue: 'Sharepoint' }, { LookupId: 6, LookupValue: 'KeePass (Passworttresor)' }] }, 'Traeger', () => ({ selbst: false, multi: true }));
ok(fremd.ids.length === 0 && fremd.namen.join('|') === 'Sharepoint|KeePass (Passworttresor)', 'Nachschlagen in eine andere Liste: fremde Ids sind keine Asset-Ids – die Namen bleiben, zum Auflösen');
ok(amAbhaengigLesen({ AbhaengigJson: '["3","4"]' }, 'AbhaengigJson', null).ids.join() === '3,4' && amAbhaengigLesen({}, null, null).ids.length === 0, 'Die eigene JSON-Spalte wie bisher');
// Ohne Spaltenmeta (Cron, Test): die Namen werden direkt gefunden – auch kodiert und mit Bindestrich
const ohneMeta = amAusFeldern({ id: 2, Title: 'Personaldaten', 'Asset_x002d_Typ': 'Primär', Standorte: 'Alle DIHAG-Standorte', 'Asset_x002d_Owner': 'Personal', Vertraulichkeit: 'vertraulich', 'Integrit_x00e4_t': 'hoch', 'Verf_x00fc_gbarkeit': 'sehr hoch',
  LinkzudenInformationen: { Url: 'https://x', Description: 'Asset-Management' }, 'Informationstr_x00e4_ger': [{ LookupId: 11, LookupValue: 'Sharepoint' }], weitereInfos: 'Papierform' }, { standorte: ['HOL', 'WGC'] });
ok(ohneMeta.id === '2' && ohneMeta.art === 'primär' && ohneMeta.kategorie === '' && ohneMeta.werke.join() === 'ALLE' && ohneMeta.verantwortlich === 'Personal' && ohneMeta.integritaet === 'hoch' && ohneMeta.link.text === 'Asset-Management' && ohneMeta.beschreibung === 'Papierform',
  'Ohne Spaltenmeta: Asset-Typ, Standorte, Asset-Owner, Integrität (kodiert), Link, weitere Infos – alles gefunden');
ok(ohneMeta.abhaengigVon.length === 0 && ohneMeta.traeger.join() === 'Sharepoint', 'Ohne zu wissen, wohin das Nachschlagen zeigt, bleibt der Informationsträger ein Name …');
const liste = amTraegerAufloesen([ohneMeta, amAusFeldern({ id: 11, Title: 'Sharepoint', 'Asset_x002d_Typ': 'Sekundär' }, {})]);
ok(liste[0].abhaengigVon.join() === '11' && liste[0].traeger.length === 0 && liste[1].art === 'unterstützend', '… und wird über den Titel zum Asset: Personaldaten hängt an Sharepoint');
ok(amTraegerAufloesen([{ id: '1', titel: 'A', traeger: ['Gibt es nicht'], abhaengigVon: [] }])[0].traeger.join() === 'Gibt es nicht', 'Was kein Asset ist, bleibt als Name stehen');
ok(amAusFeldern({ id: 3, fields: { Title: 'X', Typ: 'Anwendung' } }, { feld: (e) => (e === 'Kategorie' ? 'Typ' : e === 'Art' ? null : null) }).kategorie === 'anwendung', 'Mit Spaltenmeta zählt, was die Meta sagt – das Wort des Hauses wird zum Schlüssel der App');
ok(amAusFeldern({ id: 3, fields: { Title: 'X', Typ: 'Anwendung', Kategorie: 'Server' } }, { feld: (e) => (e === 'Kategorie' ? 'Kategorie' : null) }).kategorie === 'server'
  && amAusFeldern({ id: 4, fields: { Title: 'Y', Kategorie: '', Typ: 'Server' } }, { feld: (e) => (e === 'Kategorie' ? 'Kategorie' : null) }).kategorie === 'server'
  && amAusFeldern({ id: 5, fields: { Title: 'Z', Kategorie: '', Typ: 'Primär' } }, { feld: (e) => (e === 'Kategorie' ? 'Kategorie' : null) }).kategorie === '',
  'Ist die eigene Spalte gefüllt, zählt sie; ist sie leer, springt der Alias des Hauses ein – steht dort die Art, wird daraus keine Kategorie');
// Vererbung Asset → Asset und die Art in den Lücken
const pers = { id: '2', titel: 'Personaldaten', art: 'primär', werke: ['ALLE'], verantwortlich: 'Personal', vertraulichkeit: 'vertraulich', integritaet: 'hoch', verfuegbarkeit: 'sehr hoch', abhaengigVon: ['11'] };
const shp = { id: '11', titel: 'Sharepoint', art: 'unterstützend', werke: ['ALLE'], verantwortlich: 'IT', vertraulichkeit: 'intern', integritaet: 'normal', verfuegbarkeit: 'sehr hoch', wiederherstellung: 4, rpo: 1 };
const luShp = amLuecken(shp, { heute, liste: [pers, shp] });
ok(!luShp.fehler.some(x => /Kategorie fehlt/.test(x)), 'Führt die Liste nur die Art, fehlt keine Kategorie');
ok(luShp.hinweise.filter(x => /Vererbung/.test(x)).length === 2 && luShp.hinweise.some(x => /„Personaldaten" liegt hierauf und verlangt Vertraulichkeit „hoch", eingetragen ist „intern"/.test(x)) && luShp.hinweise.some(x => /Integrität „hoch"/.test(x)),
  'Vererbung Asset → Asset: Personaldaten (vertraulich, hoch) liegt auf Sharepoint (intern, normal) → Sharepoint braucht mehr');
ok(amLuecken(pers, { heute, liste: [pers, shp] }).hinweise.every(x => !/Vererbung/.test(x)), 'Die Information selbst erbt keinen Schutzbedarf von unten …');
const luPers = amLuecken(pers, { heute, liste: [pers, shp] });
ok(!luPers.fehler.some(x => /R093/.test(x)) && luPers.hinweise.some(x => /Wiederherstellzeit über die Informationsträger: 4 h – das Langsamste von „Sharepoint"/.test(x)),
  '… aber die Wiederherstellzeit und das RPO: Personaldaten sind wieder da, wenn Sharepoint wieder da ist (R093 erfüllt über den Träger)');
ok(amLuecken(pers, { heute }).fehler.filter(x => /R093/.test(x)).length === 2 && amLuecken(pers, { heute, liste: [pers, Object.assign({}, shp, { wiederherstellung: '' })] }).fehler.some(x => /keine Wiederherstellzeit/.test(x)),
  'Ohne Träger – oder mit einem Träger ohne Zeit – fehlt sie wirklich');
ok(amLuecken({ id: '5', titel: 'Passwörter', art: 'primär', werke: ['HOL'], verantwortlich: 'x', vertraulichkeit: 'streng vertraulich', integritaet: 'sehr hoch', verfuegbarkeit: 'hoch', klassifizierung: 'streng vertraulich', wiederherstellung: 1 }, { heute }).hinweise.some(x => /Primäres Asset ohne Informationsträger/.test(x)),
  'Ein primäres Asset ohne Informationsträger: Hinweis – worauf liegt es?');
ok(amKennzahlen([pers, shp], { heute }).primaer === 1 && amKennzahlen([pers, shp], { heute }).vererbung === 1, 'Kennzahlen: primäre Assets, Assets mit zu niedrigem Schutzbedarf (auch durch andere Assets)');
ok(/Liegt auf \/ hängt ab von/.test(amInventarHtml({ liste: [pers, shp] })) && /Sharepoint<\/td>/.test(amInventarHtml({ liste: [pers, shp] })) && /Primäre Assets/.test(amInventarHtml({ liste: [pers, shp] })), 'Das Inventar zeigt, worauf etwas liegt, und gruppiert nach Art, wenn es keine Kategorie gibt');
ok(amVon({ art: 'Primär', link: 'https://x, Doku', traeger: 'A; B' }).art === 'primär' && amVon({ link: 'https://x, Doku' }).link.text === 'Doku' && amVon({ traeger: ['A', 'B'] }).traeger.join() === 'A,B', 'amVon normalisiert Art, Link und Träger');

/* ── 4) Die Vererbung ── */
ok(amSollVerfuegbarkeit([{ kritikalitaet: 'hoch' }]) === 'sehr hoch' && amSollVerfuegbarkeit([{ kritikalitaet: 'mittel' }]) === 'hoch'
  && amSollVerfuegbarkeit([{ kritikalitaet: 'niedrig' }]) === 'normal' && amSollVerfuegbarkeit([]) === '', 'Maximumprinzip: der kritischste Prozess bestimmt');

/* ── 5) Lücken ── */
let l = amLuecken({ titel: 'SAP', kategorie: 'anwendung', werke: ['ALLE'], verantwortlich: 'a@x', vertraulichkeit: 'hoch', integritaet: 'hoch', verfuegbarkeit: 'sehr hoch', klassifizierung: 'intern', wiederherstellung: 12, rpo: 4 }, { heute });
ok(l.fehler.length === 0 && l.hinweise.length === 0, `Ein vollständiges Asset hat keine Lücke (${l.fehler.join(' | ')})`);
l = amLuecken({ titel: 'X' }, { heute });
ok(l.fehler.some(x => /Kategorie/.test(x)) && l.fehler.some(x => /A\.5\.9/.test(x)) && l.fehler.some(x => /Kein Werk/.test(x)) && l.fehler.some(x => /Schutzbedarf nicht festgestellt/.test(x)),
  'Kategorie, Verantwortlicher, Werk, Schutzbedarf – jede Lücke beim Namen');
l = amLuecken({ titel: 'X', vertraulichkeit: 'hoch' }, { heute });
ok(l.fehler.some(x => /unvollständig: Integrität, Verfügbarkeit/.test(x)) && l.fehler.some(x => /Klassifizierung fehlt \(A\.5\.12\)/.test(x)), 'Teilweise bewertet: die fehlenden genannt; Vertraulichkeit „hoch" verlangt Klassifizierung');
l = amLuecken({ titel: 'X', kategorie: 'information' }, { heute });
ok(l.fehler.some(x => /Klassifizierung fehlt/.test(x)), 'Eine Information ohne Klassifizierung ist eine Lücke');
l = amLuecken({ titel: 'X', verfuegbarkeit: 'sehr hoch' }, { heute });
ok(l.fehler.filter(x => /R093/.test(x)).length === 2, '„sehr hoch" ohne Wiederherstellzeit und RPO → zwei Lücken (R093)');
l = amLuecken({ titel: 'X', eol: '2026-01-01', vertragsende: '2026-10-30' }, { heute });
ok(l.fehler.some(x => /EOL abgelaufen seit 2026-01-01/.test(x)) && l.hinweise.some(x => /Vertrag endet in 46 Tagen/.test(x)), 'EOL vorbei ist eine Lücke, Vertragsende in 46 Tagen ein Hinweis');
l = amLuecken({ titel: 'X', eol: '2026-01-01', status: 'außer Betrieb' }, { heute });
ok(!l.fehler.some(x => /EOL/.test(x)), 'Außer Betrieb: EOL ist egal');
l = amLuecken({ titel: 'SAP', verfuegbarkeit: 'hoch' }, { heute, prozesse: [{ kritikalitaet: 'hoch' }, { kritikalitaet: 'hoch' }] });
ok(l.hinweise.some(x => /Vererbung: 2 kritische Prozesse hängen daran → Verfügbarkeit mindestens „sehr hoch", eingetragen ist „hoch"/.test(x)), 'Die Vererbung als Hinweis, mit Zahl');
l = amLuecken({ titel: 'X', kategorie: 'cloud' }, { heute });
ok(l.hinweise.some(x => /Support-Kontakt/.test(x)), 'Ein Cloud-Dienst ohne Support-Kontakt: wen ruft man nachts an?');
l = amLuecken({ titel: 'X', personenbezogen: true, klassifizierung: 'öffentlich' }, { heute });
ok(l.hinweise.some(x => /Personenbezogene Daten/.test(x)), 'Personendaten „öffentlich" – das passt nicht');

/* ── 6) Abhängigkeiten ── */
const L = [
  { id: '1', titel: 'SAP', abhaengigVon: ['2', 'a3'] },
  { id: '2', titel: 'DB', abhaengigVon: ['3'] },
  { id: '3', titel: 'Netz', quelleId: 'a3' },
  { id: '4', titel: 'Telefon' },
  { id: '5', titel: 'Alt', abhaengigVon: ['1'], status: 'außer Betrieb' },
];
ok(amKanon(L, 'a3') === '3' && amKanon(L, '3') === '3' && amKanon(L, '99') === '99', 'Eine alte Id findet ihr Asset im Register; Unbekanntes bleibt');
ok(amAbhaengige(L, '3').map(x => x.titel).sort().join() === 'Alt,DB,SAP', 'Netz fällt → DB, SAP (über DB und direkt), Alt (über SAP) fallen mit – mittelbar, ohne Doppelte');
ok(amAbhaengige(L, 'a3').length === 3, 'Auch über die alte Id');
ok(amAbhaengige(L, '4').length === 0, 'Am Telefon hängt nichts');
ok(amVoraussetzungen(L, '1').map(x => x.titel).sort().join() === 'DB,Netz', 'SAP braucht DB und Netz');
ok(amKreis(L, '3', '1') === true && amKreis(L, '3', '4') === false && amKreis(L, '3', '3') === true, 'Netz von SAP abhängig zu machen wäre ein Kreis; von Telefon nicht; von sich selbst schon');

/* ── 7) Fälligkeiten und Sichtbarkeit ── */
const F = amFaelligkeiten([{ titel: 'A', eol: '2026-10-01' }, { titel: 'B', vertragsende: '2026-08-01' }, { titel: 'C', eol: '2027-06-01' }, { titel: 'D', eol: '2026-01-01', status: 'außer Betrieb' }], 90, heute);
ok(F.map(f => f.asset.titel + ':' + f.tage).join() === 'B:-44,A:17', 'Überfälliges zuerst, Fernes und Ausgemustertes nicht');
ok(amSichtbar({ werke: ['WGC'] }, null) && amSichtbar({ werke: [] }, ['HOL']) && amSichtbar({ werke: ['ALLE'] }, ['HOL']) && !amSichtbar({ werke: ['WGC'] }, ['HOL']), 'Die Trennung nach Gesellschaft');

/* ── 8) Kennzahlen ── */
const K = [
  { id: '1', titel: 'SAP', kategorie: 'anwendung', werke: ['ALLE'], verantwortlich: 'a', vertraulichkeit: 'hoch', integritaet: 'hoch', verfuegbarkeit: 'sehr hoch', klassifizierung: 'intern', wiederherstellung: 12, rpo: 4, personenbezogen: true },
  { id: '2', titel: 'DB', kategorie: 'server', werke: ['HOL'], verfuegbarkeit: 'sehr hoch', eol: '2026-01-01' },
  { id: '3', titel: 'Netz', kategorie: 'netz', werke: ['HOL'], verantwortlich: 'b', verfuegbarkeit: 'hoch', vertragsende: '2026-10-01' },
  { id: '4', titel: 'Alt', status: 'außer Betrieb' },
  { id: '5', titel: 'Fremd', werke: ['ZAI'], verantwortlich: 'c' },
];
let z = amKennzahlen(K, { heute, prozesseVon: (id) => (id === '3' ? [{ kritikalitaet: 'hoch' }] : []) });
ok(z.gesamt === 5 && z.aktiv === 4, 'Fünf Assets, vier aktiv');
ok(z.ohneVerantwortlichen === 1 && z.ohneSchutzbedarf === 1 && z.ohneKlassifizierung === 3, 'DB ohne Verantwortlichen, Fremd ohne Schutzbedarf, drei ohne Klassifizierung');
ok(z.sehrHoch === 2 && z.sehrHochOhneRto === 1 && z.eolAbgelaufen === 1 && z.faellig === 2 && z.personenbezogen === 1, '„sehr hoch": 2, davon 1 ohne Zeit; 1 EOL vorbei; 2 fällig; 1 mit Personendaten');
ok(z.vererbung === 1 && z.kategorien.netz === 1, 'Netz: kritischer Prozess verlangt „sehr hoch" – Vererbung; Kategorien gezählt');
z = amKennzahlen(K, { heute, werke: ['HOL'] });
ok(z.gesamt === 4 && !z.offen.some(o => o.titel === 'Fremd'), 'Mit Trennung fällt ZAI weg; konzernweites bleibt');
ok(amKennzahlen(null).gesamt === 0 && amKennzahlen([], {}).fehler === 0, 'Ohne Daten: Nullen');

/* ── 9) Das Inventar ── */
const hb = amInventarHtml({ liste: K, stand: '14.09.2026', werkLabel: 'HOL' });
ok(/<title>Assetinventar HOL<\/title>/.test(hb) && /A\.5\.9/.test(hb) && /window\.print\(\)/.test(hb), 'Ein eigenständiges Dokument mit Normbezug und Druckknopf');
ok(/Anwendung \/ Software \(1\)/.test(hb) && /Server \/ Datenbank \(1\)/.test(hb), 'Nach Kategorien gruppiert, mit Zahl');
ok(/<span class="sh">sehr hoch<\/span>/.test(hb) && /12 h/.test(hb), 'Schutzbedarf hervorgehoben, Zeiten lesbar');
ok(!/>Alt</.test(hb), 'Ausgemustertes steht nicht im Inventar');
ok(/&lt;b&gt;/.test(amInventarHtml({ liste: [{ titel: '<b>' }] })), 'Maskiert');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
