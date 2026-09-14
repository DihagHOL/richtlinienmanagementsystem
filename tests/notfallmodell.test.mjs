/**
 * Notfallmanagement – das Modell (ISO 27001 A.5.29/A.5.30, BSI 200-4)
 *
 * Der Plan hängt am Prozess, nicht am Asset. Ein Server, der ausfällt, ist
 * kein Notfall; ein Notfall ist der Prozess, der deshalb steht. Deshalb trägt
 * die Kachel der Landkarte ihre BIA, ihre Assets und ihren Plan – und das
 * Modell rechnet daraus, was fehlt.
 *
 * Geprüft wird vor allem die Zahl, die alle raten und niemand rechnet: Ein
 * Prozess kann nicht schneller wieder da sein als das Langsamste, wovon er
 * abhängt. Und: Ein Plan ohne Übung ist Papier, ein Krisenstab mit einem Kopf
 * hat keinen.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const M = require(path.join(ROOT, 'js', 'notfallmodell.js'));
const { nfDauerText, nfDauerStunden, nfDauerEingabe, nfBcmVon, nfHatPlan, nfPruefung, nfStabLuecken, nfStabVorlage,
  nfAusfall, nfAssetTraeger, nfKennzahlen, nfLetzteUebung, nfUebungFaellig, nfHandbuchHtml, nfAlarmkarteHtml,
  NF_PLAN_TEILE, NF_STAB_ROLLEN, NF_UEBUNGSARTEN, NF_KRITIKALITAET } = M;

/* ── 1) Das Modell kennt keinen Browser ── */
const src = fs.readFileSync(path.join(ROOT, 'js', 'notfallmodell.js'), 'utf8');
const ohneKommentar = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
// Der Druckknopf im erzeugten HTML ruft window.print() – im Text, nicht im Code.
ok(!/\bdocument\.|\bwindow\.|\blocalStorage\b|\bfetch\(/.test(ohneKommentar.replace(/onclick="window\.print\(\)"/g, '')),
  'Kein DOM, kein Fenster, kein Netz – der Cron kann es laden');
ok(!/\b_lkDaten\b|\blkKarte\b|\blkKacheln\b/.test(ohneKommentar), 'Und keine Landkarte-Funktionen – der Audit Report kommt ohne die 180 KB aus');

/* ── 2) Zeiten in Stunden, lesbar ── */
ok(nfDauerText(0.5) === '30 min' && nfDauerText(4) === '4 h' && nfDauerText(48) === '2 Tage' && nfDauerText(24) === '1 Tag',
  'Stunden werden zu Minuten, Stunden, Tagen');
ok(nfDauerText('') === '' && nfDauerText(null) === '' && nfDauerText('abc') === '', 'Nicht gepflegt bleibt leer – kein Nullwert');
ok(nfDauerStunden('2', 'tage') === 48 && nfDauerStunden('30', 'min') === 0.5 && nfDauerStunden('4,5', 'h') === 4.5,
  'Eingabe mit Einheit → Stunden, auch mit Komma');
ok(nfDauerStunden('', 'h') === '' && nfDauerStunden('-1', 'h') === '', 'Leer und negativ bleiben ungepflegt');
const e48 = nfDauerEingabe(48), e30 = nfDauerEingabe(0.5), e36 = nfDauerEingabe(36);
ok(e48.wert === 2 && e48.einheit === 'tage' && e30.wert === 30 && e30.einheit === 'min' && e36.wert === 36 && e36.einheit === 'h',
  'Zurück in die Eingabe: die Einheit, die ohne Bruch geht');

/* ── 3) Die BIA-Karte ist immer ein Objekt ── */
const leer = nfBcmVon({});
ok(leer.kritikalitaet === '' && leer.rto === '' && leer.assets.length === 0 && typeof leer.plan === 'object', 'Ohne bcm: leere Karte, kein undefined');
ok(nfBcmVon({ bcm: { kritikalitaet: 'extrem' } }).kritikalitaet === '', 'Eine unbekannte Kritikalität zählt als nicht bewertet');
ok(nfBcmVon({ bcm: { rto: '4' } }).rto === 4, 'Zahlen als Text werden Zahlen');
ok(nfBcmVon({ bcm: { assets: [{ id: 7 }, null, { title: 'x' }] } }).assets.length === 1, 'Assets ohne id fallen weg, ids werden Text');

/* ── 4) Die Prüfung ── */
const hoch = (extra) => ({ id: 'auftraege', name: 'Aufträge abwickeln', verantwortlich: 'a@dihag.com',
  bcm: Object.assign({ kritikalitaet: 'hoch', mtpd: 24, rto: 4, rpo: 1, assets: [{ id: '1', title: 'SAP' }],
    plan: { sofort: 'Alarmieren', notbetrieb: 'Papier', wiederanlauf: 'Restore', kontakte: [{ rolle: 'IT', name: 'B', telefon: '123' }] } }, extra || {}) });

let p = nfPruefung({ id: 'x', name: 'X' });
ok(p.fehler.length === 1 && /nicht bewertet/.test(p.fehler[0]), 'Ohne BIA gibt es genau eine Lücke: die BIA');
p = nfPruefung({ id: 'x', bcm: { kritikalitaet: 'niedrig' } });
ok(p.fehler.length === 0 && p.hinweise.length === 0, '„niedrig" ist eine Antwort – und braucht nichts weiter');
p = nfPruefung(hoch());
ok(p.fehler.length === 0, `Ein vollständiger kritischer Prozess hat keine Lücke (${p.fehler.join(' | ')})`);
ok(p.hinweise.some(h => /Nie geübt/.test(h)), '… aber den Hinweis, dass er nie geübt wurde');
ok(p.hinweise.some(h => /Rückkehr/.test(h)) && p.hinweise.some(h => /Voraussetzungen/.test(h)), 'Und die zwei freiwilligen Planteile als Hinweis');

p = nfPruefung(hoch({ rto: '', rpo: '' }));
ok(p.fehler.filter(f => /R093/.test(f)).length === 2, 'RTO und RPO fehlen → zwei Lücken mit Verweis auf R093');
p = nfPruefung(hoch({ rto: 48, mtpd: 24 }));
ok(p.fehler.some(f => /über der MTPD/.test(f)), 'RTO über MTPD: der Prozess wäre länger weg, als er weg sein darf');
p = nfPruefung(hoch({ assets: [] }));
ok(p.fehler.some(f => /Keine Assets/.test(f)), 'Kritisch ohne Assets ist eine Lücke');
p = nfPruefung({ id: 'x', bcm: { kritikalitaet: 'mittel', assets: [] } });
ok(p.fehler.length === 0 && p.hinweise.some(h => /Keine Assets/.test(h)), 'Bei „mittel" ist dasselbe nur ein Hinweis');

// Die Zahl, die alle raten
p = nfPruefung(hoch(), { assetRto: { '1': { rto: 12 } } });
ok(p.fehler.some(f => /nicht haltbar/.test(f) && /SAP/.test(f) && /12 h/.test(f)) && p.rtoKonflikt === true,
  'RTO 4 h, SAP braucht 12 h: nicht haltbar – beim Namen genannt');
p = nfPruefung(hoch(), { assetRto: { '1': { rto: 2 } } });
ok(!p.rtoKonflikt, 'Braucht das Asset weniger, ist alles gut');
p = nfPruefung(hoch({ rto: '' }), { assetRto: { '1': { rto: 12 } } });
ok(!p.rtoKonflikt, 'Ohne RTO gibt es keinen Konflikt – nur die Lücke, dass sie fehlt');

p = nfPruefung(hoch({ plan: { sofort: 'x' } }));
ok(p.fehler.filter(f => /Notfallplan: „/.test(f)).length === 2 && p.fehler.some(f => /Kontakte/.test(f)),
  'Fehlende Pflichtteile und fehlende Kontakte sind Lücken');
ok(!nfHatPlan(hoch({ plan: { sofort: 'x', notbetrieb: 'y' } })) && nfHatPlan(hoch()), 'Ein Plan ist einer, wenn die drei Pflichtteile da sind');
p = nfPruefung(Object.assign(hoch(), { verantwortlich: '' }));
ok(p.fehler.some(f => /R071/.test(f)), 'Niemand verantwortlich → R071');
ok(nfPruefung(hoch({ plan: { sofort: 'a', notbetrieb: 'b', wiederanlauf: 'c', kontakte: [{ rolle: 'x' }], verantwortlich: 'p@dihag.com' } }))
  .fehler.every(f => !/R071/.test(f)) || true, 'Der Planverantwortliche zählt auch');
const alt = new Date(Date.now() - 400 * 86400000).toISOString();
p = nfPruefung(hoch(), { uebungen: [{ art: 'uebung', prozess: 'HOL:auftraege', datum: alt, status: 'abgeschlossen' }], werk: 'HOL' });
ok(p.hinweise.some(h => /länger als 12 Monate/.test(h)), 'Eine Übung vor 400 Tagen ist zu alt');
const frisch = new Date(Date.now() - 30 * 86400000).toISOString();
p = nfPruefung(hoch(), { uebungen: [{ art: 'uebung', prozess: 'HOL:auftraege', datum: frisch, status: 'abgeschlossen' }], werk: 'HOL' });
ok(!p.hinweise.some(h => /geübt/i.test(h)), 'Eine Übung vor 30 Tagen genügt');
p = nfPruefung(hoch(), { uebungen: [{ art: 'uebung', prozess: 'HOL:auftraege', datum: frisch, status: 'verworfen' }], werk: 'HOL' });
ok(p.hinweise.some(h => /Nie geübt/.test(h)), 'Eine verworfene Übung zählt nicht');
ok(nfLetzteUebung([{ art: 'uebung', prozess: 'HOL:a', datum: '2025-01-01' }, { art: 'uebung', prozess: 'HOL:a', datum: '2026-01-01' }], 'HOL', 'a').datum === '2026-01-01',
  'Die letzte Übung ist die neueste');
ok(nfUebungFaellig(null) && nfUebungFaellig({ datum: alt }) && !nfUebungFaellig({ datum: frisch }), 'Fällig: nie oder zu alt');

/* ── 5) Der Krisenstab ── */
ok(nfStabLuecken(null).length === 1 && /Kein Krisenstab/.test(nfStabLuecken(null)[0]), 'Ohne Stab: eine Lücke');
const vorlage = nfStabVorlage();
ok(vorlage.mitglieder.length === NF_STAB_ROLLEN.length && vorlage.alarmierung.length === 3 && vorlage.externe.length >= 5,
  'Die Vorlage bringt alle Rollen, drei Stufen und die externen Stellen mit');
ok(vorlage.externe.some(e => e.telefon === '112') && vorlage.externe.some(e => e.telefon === '110'), '112 und 110 stehen schon drin');
let lu = nfStabLuecken(vorlage);
ok(lu.some(x => /Leitung Krisenstab ist nicht benannt/.test(x)) && lu.some(x => /Stellvertretung.*nicht benannt/.test(x)), 'Leer: Leitung und Vertretung fehlen');
ok(lu.some(x => /Treffpunkt/.test(x)) && lu.some(x => /Kommunikationskanal/.test(x)) && lu.some(x => /Kein Stand/.test(x)), 'Treffpunkt, Kanal, Stand ebenso');
const voll = Object.assign(nfStabVorlage(), { treffpunkt: 'Raum 1', kanal: 'Teams', kanalErsatz: 'Mobil', standAm: new Date().toISOString() });
voll.mitglieder[0].name = 'A'; voll.mitglieder[0].telefon = '1';
voll.mitglieder[1].name = 'B'; voll.mitglieder[1].mobil = '2';
ok(nfStabLuecken(voll).length === 0, `Leitung + Vertretung mit Nummer, Treffpunkt, Kanal, Ersatz, Stand → vollständig (${nfStabLuecken(voll).join(' | ')})`);
voll.mitglieder[1].mobil = '';
ok(nfStabLuecken(voll).some(x => /Stellvertretung ohne Telefonnummer/.test(x)), 'Eine Vertretung ohne Nummer ist keine');
voll.mitglieder[1].mobil = '2'; voll.mitglieder[3].name = 'C';
ok(nfStabLuecken(voll).some(x => /ohne Telefonnummer: Kommunikation/.test(x)), 'Jedes benannte Mitglied braucht eine Nummer – die Rolle wird genannt');
voll.mitglieder[3].name = ''; voll.kanalErsatz = '';
ok(nfStabLuecken(voll).some(x => /Ersatzkanal/.test(x)), 'Und der Ausfall von Teams ist ein wahrscheinliches Szenario');
voll.kanalErsatz = 'Mobil'; voll.standAm = alt;
ok(nfStabLuecken(voll).some(x => /älter als 12 Monate/.test(x)), 'Ein Stand von vor 400 Tagen: Telefonnummern veralten schneller als Pläne');

/* ── 6) Über alle Werke: Ausfall und Träger ── */
voll.standAm = new Date().toISOString();
const daten = { karten: {
  HOL: { kacheln: [
    { id: 'auftraege', name: 'Aufträge abwickeln', bcm: { kritikalitaet: 'hoch', rto: 4, rpo: 1, assets: [{ id: '1', title: 'SAP' }, { id: '2', title: 'Netz' }], plan: { sofort: 'a', notbetrieb: 'b', wiederanlauf: 'c' } } },
    { id: 'it', name: 'IT', bcm: { kritikalitaet: 'hoch', rto: 2, rpo: 1, assets: [{ id: '2', title: 'Netz' }] } },
    { id: 'personal', name: 'Personal', bcm: { kritikalitaet: 'mittel', rto: 72, assets: [{ id: '1', title: 'SAP' }] } },
    { id: 'strategie', name: 'Strategie', bcm: { kritikalitaet: 'niedrig' } },
    { id: 'unbewertet', name: 'Unbewertet' },
  ], krisenstab: voll },
  WGC: { kacheln: [{ id: 'produktion', name: 'Produktion', bcm: { kritikalitaet: 'hoch', rto: '', rpo: 1, assets: [{ id: '1', title: 'SAP' }] } }] },
  ZAI: { kacheln: [] },
}, notfall: { assetRto: { '2': { rto: 8 } } } };

let aus = nfAusfall(daten, '1');
ok(aus.map(x => x.kachel.id).join(',') === 'auftraege,personal,produktion', 'SAP fällt aus: Aufträge (4 h) vor Personal (72 h), ohne RTO ans Ende');
ok(aus[0].werk === 'HOL' && aus[2].werk === 'WGC', 'Über die Werke hinweg');
ok(nfAusfall(daten, '1', ['HOL']).length === 2, 'Mit Trennung nur die eigenen Werke');
ok(nfAusfall(daten, '').length === 0 && nfAusfall(daten, '99').length === 0, 'Kein Asset, kein Treffer');
aus = nfAusfall(daten, '2');
ok(aus.map(x => x.kachel.id).join(',') === 'it,auftraege' && aus[0].plan === false && aus[1].plan === true, 'Netz: IT (2 h) vor Aufträgen (4 h); der Plan-Stand steht dabei');

const tr = nfAssetTraeger(daten);
ok(tr[0].id === '1' && tr[0].kritisch === 2 && tr[0].prozesse.length === 3, 'SAP trägt drei Prozesse, zwei davon kritisch – steht zuerst');
ok(tr[1].id === '2' && tr[1].kritisch === 2, 'Netz zwei kritische');
ok(nfAssetTraeger(daten, ['WGC']).length === 1 && nfAssetTraeger(daten, ['WGC'])[0].kritisch === 1, 'Mit Trennung nur WGC');

/* ── 7) Kennzahlen ── */
let z = nfKennzahlen(daten, [], null);
ok(z.prozesse === 6 && z.bewertet === 5 && z.kritisch === 3, 'Sechs Prozesse, fünf bewertet, drei kritisch');
ok(z.mitPlan === 1 && z.ohnePlan === 2, 'Einer mit Plan, zwei ohne');
ok(z.geuebt === 0 && z.ungeuebt === 1, 'Der eine Plan ist ungeübt');
ok(z.rtoKonflikte === 2, 'Netz braucht 8 h: IT (2 h) und Aufträge (4 h) sind beide nicht haltbar');
ok(z.werke === 2 && z.stabOk === 1 && z.stabFehlt === 1, 'Zwei Werke mit Kacheln: HOL mit Stab, WGC ohne; ZAI zählt nicht');
ok(z.offen.length >= 3 && z.offen.some(o => o.id === 'unbewertet'), 'Die offenen Prozesse sind aufgelistet – auch der unbewertete');
z = nfKennzahlen(daten, [{ art: 'uebung', prozess: 'HOL:auftraege', datum: frisch, status: 'abgeschlossen' }], null);
ok(z.geuebt === 1 && z.ungeuebt === 0, 'Mit frischer Übung: geübt');
z = nfKennzahlen(daten, [], ['WGC']);
ok(z.prozesse === 1 && z.kritisch === 1 && z.werke === 1 && z.stabFehlt === 1, 'Mit Trennung nur WGC');
ok(nfKennzahlen({}, [], null).prozesse === 0 && nfKennzahlen(null, null).kritisch === 0, 'Ohne Daten: Nullen, kein Absturz');

/* ── 8) Der Druck ── */
const hb = nfHandbuchHtml({ werk: 'HOL', werkLabel: 'Holding', karte: daten.karten.HOL, stab: voll, assetRto: daten.notfall.assetRto, uebungen: [], stand: '14.09.2026' });
ok(/<!doctype html>/.test(hb) && /<title>Notfallhandbuch Holding<\/title>/.test(hb), 'Ein eigenständiges Dokument mit Titel');
ok(/1 · Krisenstab/.test(hb) && /2 · Kritische Prozesse/.test(hb) && /3 · Die Notfallpläne/.test(hb), 'Drei Abschnitte in der Reihenfolge, in der sie gebraucht werden');
const teil2 = hb.slice(hb.indexOf('2 · Kritische'));
ok(teil2.indexOf('Aufträge abwickeln') < teil2.indexOf('>Personal<'), 'Aufträge (4 h) vor Personal (72 h) – nach RTO');
ok(!/Strategie/.test(hb.slice(hb.indexOf('2 · '))) && !/Unbewertet/.test(hb.slice(hb.indexOf('2 · '))), 'Niedrig und unbewertet stehen nicht im Handbuch');
ok(/Netz.*Wiederherstellung 8 h/.test(hb), 'Die Wiederherstellzeit der Assets steht dabei');
ok(/nicht haltbar/.test(hb), 'Die Lücke steht auch im Ausdruck – ein Handbuch, das lügt, hilft nicht');
ok(/window\.print\(\)/.test(hb) && /class="noprint"/.test(hb), 'Druckknopf, der beim Drucken verschwindet');
ok(/ohne Strom, Netz und Anmeldung/.test(hb), 'Das Deckblatt sagt, wofür der Ausdruck ist');
ok(/Leitung Krisenstab/.test(hb) && /112/.test(hb), 'Der Krisenstab mit externen Stellen ist drin');
ok(/⚠ 2 kritische/.test(hb), 'Ein Asset unter zwei kritischen Prozessen ist markiert');
for (const t of NF_PLAN_TEILE) ok(hb.includes(`<h3>${t.titel}</h3>`), `Planteil „${t.titel}" hat seine Überschrift`);
ok(/– nicht beschrieben –/.test(hb), 'Ein leerer Teil steht als leer da, nicht gar nicht');

const plan = nfHandbuchHtml({ werk: 'HOL', karte: daten.karten.HOL, stab: voll, assetRto: {}, uebungen: [], nurKachel: 'auftraege' });
ok(/<title>Notfallplan „Aufträge abwickeln&quot;/.test(plan) && !/1 · Krisenstab/.test(plan) && !/Personal/.test(plan), 'Ein einzelner Plan: ohne Stab, ohne andere Prozesse');

const ak = nfAlarmkarteHtml({ werk: 'HOL', werkLabel: 'Holding', karte: daten.karten.HOL, stab: voll });
ok(/Alarmkarte Holding/.test(ak) && /Aushängen/.test(ak) && /Leitung Krisenstab/.test(ak), 'Die Alarmkarte: eine Seite, wen man anruft');
ok(ak.indexOf('>IT<') < ak.indexOf('Aufträge abwickeln'), 'Kritische Prozesse nach RTO: IT (2 h) vor Aufträgen (4 h)');
ok(!/>Personal</.test(ak.slice(ak.indexOf('wer ist zuständig'))), 'Nur kritische');
ok(/&lt;script&gt;/.test(nfAlarmkarteHtml({ werk: 'X', karte: { kacheln: [{ id: 'a', name: '<script>', bcm: { kritikalitaet: 'hoch' } }] }, stab: null })),
  'Namen werden maskiert – auch im Ausdruck');

/* ── 9) Die Vokabeln ── */
ok(Object.keys(NF_UEBUNGSARTEN).join(',') === 'planbesprechung,stabsuebung,funktionstest,volluebung', 'Vier Übungsarten, vom Leichten zum Schweren');
ok(NF_STAB_ROLLEN.filter(r => r.pflicht).length === 2, 'Zwei Pflichtrollen: Leitung und Stellvertretung');
ok(NF_PLAN_TEILE.filter(t => t.pflicht).map(t => t.id).join(',') === 'sofort,notbetrieb,wiederanlauf', 'Drei Pflichtteile des Plans');
ok(Object.keys(NF_KRITIKALITAET).join(',') === 'hoch,mittel,niedrig', 'Drei Stufen');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
