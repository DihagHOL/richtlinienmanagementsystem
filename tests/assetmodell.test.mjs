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
const { amVon, amKurz, amKategorien, amKategorieKey, amZusatzfelder, amSollVerfuegbarkeit, amTageBis, amFaelligkeiten, amLuecken, amKanon,
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

/* ── 4) Die Vererbung ── */
ok(amSollVerfuegbarkeit([{ kritikalitaet: 'hoch' }]) === 'sehr hoch' && amSollVerfuegbarkeit([{ kritikalitaet: 'mittel' }]) === 'hoch'
  && amSollVerfuegbarkeit([{ kritikalitaet: 'niedrig' }]) === 'normal' && amSollVerfuegbarkeit([]) === '', 'Maximumprinzip: der kritischste Prozess bestimmt');

/* ── 5) Lücken ── */
const heute = '2026-09-14';
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
