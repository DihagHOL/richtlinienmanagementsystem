/**
 * Ziele, Maßnahmen, Kennzahlen – drei Register, die im IMS noch fehlten.
 *
 * Die Gliederung kommt aus den Dokumenten des Hauses: die „Vorlage zur
 * Zieleplanung" (Ziel, Termin, Messung, Verantwortlich, Ressourcen,
 * Maßnahmen), der „Maßnahmenplan IMS" (Bereich, NA/V/E, Priorität, Kapitel,
 * Sofort-/Korrekturmaßnahme, Wirksamkeitsprüfung) und „IMS-8.1 Kennzahlen"
 * (Einheit, Intervall, Sollvorgabe, Datenquelle, Verantwortlich, Verwendung).
 *
 * Geprüft wird: die Modelle (rechnen sie richtig?), die Listen auf der
 * ISMS-Site (senden sie nur, was es gibt?), die Ansichten (zeichnen sie mit
 * echten Daten ohne Fehler?) und die Verdrahtung (Navigation, Rechte,
 * Nachladen, Cockpit, Audit Report, Fälligkeiten).
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire as _requireFuerHelfer } from 'module';
const { jsArg, sichereUrl } = _requireFuerHelfer(import.meta.url)('../js/util.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');
const modell = (datei) => { const c = { module: { exports: {} } }; vm.createContext(c); vm.runInContext(lies(datei), c); return c.module.exports; };

const M = modell('js/massnahmenmodell.js');
const Z = modell('js/zielmodell.js');
const K = modell('js/kennzahlmodell.js');
const HEUTE = '2026-10-20';

/* ── 1) Maßnahmen ── */
ok(M.MN_BEREICHE.map(b => b.key).join(',') === 'isms,qualitaet,umwelt,energie,arbeitsschutz,compliance,datenschutz,ims', 'Bereiche des IMS wie im Maßnahmenplan, um die Managementsysteme erweitert');
ok(M.MN_BEWERTUNG.map(b => b.key).join('') === 'NAVE', 'Bewertung NA / V / E');
ok(M.MN_KATEGORIEN.map(k => k.annex).join(' ') === 'A.5 A.6 A.7 A.8', 'Kategorien: die vier Themen der ISO 27002');
const n0 = M.mnNormal({ titel: ' X ', bereich: 'mond', quelle: '??', status: 'fertig', werke: ['WGC', ''] });
ok(n0.titel === 'X' && n0.bereich === 'isms' && n0.quelle === 'sonstige' && n0.status === 'offen' && n0.werke.join() === 'WGC', 'Unbekanntes fällt auf sichere Vorgaben zurück');
ok(M.mnNaechsteNr([{ nr: 'M-2026-004' }, { nr: 'M-2025-019' }, { nr: 'frei' }], 2026) === 'M-2026-005', 'Laufende Nummer je Jahr');
ok(M.mnNaechsteNr([], 2027) === 'M-2027-001', 'Neues Jahr beginnt bei 001');
ok(M.mnLuecken({ titel: 'A', status: 'offen' }).length === 2, 'Ohne Verantwortung und Termin: zwei Lücken');
ok(M.mnLuecken({ titel: 'A', status: 'verworfen' }).length === 0, 'Verworfen braucht nichts mehr');
const naErledigt = { titel: 'A', verantwortlich: 'x', termin: '2026-01-01', bewertung: 'NA', status: 'erledigt' };
ok(M.mnLuecken(naErledigt).some(l => /10\.2/.test(l)), 'Erledigte Korrektur einer Nichtkonformität ohne Wirksamkeitsprüfung: Lücke mit Normbezug');
ok(M.mnAbschlussfehler(Object.assign({}, naErledigt, { status: 'offen', wirksamkeit: 'Seit drei Monaten kein Vorfall' })).length === 0, 'Mit Wirksamkeitsprüfung lässt sie sich erledigen');
ok(M.mnAbschlussfehler({ titel: 'V', verantwortlich: 'x', termin: '2026-01-01', bewertung: 'V' }).length === 0, 'Eine Verbesserung braucht keine Wirksamkeitsprüfung');

const risiken = [{ id: '3', titel: 'Ransomware', kategorie: 'Technik / IT', brutto: { e: 4, a: 5 }, netto: { e: 2, a: 4 }, controls: ['A.8.13'],
  massnahmen: [{ titel: 'Offline-Backup', verantwortlich: 'it@dihag.com', frist: '2026-09-01', status: 'offen' }, { titel: '', frist: '' }] }];
const ar = M.mnAusRisiken(risiken);
ok(ar.length === 1 && ar[0].schluessel === 'risiko:3:0' && ar[0].quelle === 'risiko' && ar[0].herkunft === 'risiko', 'Risikobehandlung: eine Zeile je benannter Maßnahme, mit Schlüssel zum Ursprung');
ok(ar[0].kategorie === 'technologisch' && ar[0].prioritaet === 'mittel' && ar[0].normbezug === 'A.8.13', 'Kategorie aus der Risikokategorie, Priorität aus dem Netto-Risiko (2×4 = mittel), Controls als Normbezug');
const wirk = [
  { id: '7', art: 'abweichung', titel: 'Rechte nicht entzogen', quelle: 'internes Audit', werke: ['SHB'], massnahmen: [{ titel: 'Austrittsprozess', status: 'erledigt' }] },
  { id: '8', art: 'abweichung', titel: 'Phishing', herkunftId: 'ticket:44', massnahmen: [{ titel: 'Schulung', status: 'offen', frist: '2026-12-01' }] },
  { id: '9', art: 'bewertung', titel: 'MR 2026', massnahmen: [{ titel: 'Budget', status: 'in Umsetzung' }] },
  { id: '10', art: 'uebung', titel: 'Übung SAP', massnahmen: [{ titel: 'Telefonliste', status: 'offen' }] },
];
const aw = M.mnAusWirksamkeit(wirk);
ok(aw.map(e => e.quelle).join(',') === 'audit_intern,vorfall,bewertung,uebung', 'Wirksamkeit: Quelle aus Satzart, Herkunft und Freitext');
ok(aw[0].bewertung === 'NA' && aw[0].art === 'korrektur' && aw[0].werke.join() === 'SHB' && aw[2].bewertung === '', 'Abweichung = Nichtkonformität und Korrektur, mit den Werken des Eintrags');
const eigene = [{ id: '1', nr: 'M-2026-001', titel: 'Externes Audit: Zutritt', quelle: 'audit_extern', verantwortlich: 'a', termin: '2026-10-01', status: 'offen', prioritaet: 'hoch', kategorie: 'physisch' },
  { id: '2', nr: 'M-2026-002', titel: 'Intranet', quelle: 'ziel', zielId: '5', verantwortlich: 'b', termin: '2027-01-01', status: 'erledigt' }];
const alle = M.mnAlle(eigene, risiken, wirk, HEUTE);
ok(alle.length === 7, 'Gesamtsicht: eigene, Risiken und Wirksamkeit zusammen (7)');
ok(alle[0].titel === 'Externes Audit: Zutritt' && alle[1].titel === 'Offline-Backup', 'Überfälliges zuerst, nach Priorität');
ok(alle[alle.length - 1].status === 'erledigt', 'Erledigtes am Ende');
ok(M.mnFiltern(alle, { offen: true }, HEUTE).length === 5, 'Filter „nur offene"');
ok(M.mnFiltern(alle, { ueberfaellig: true }, HEUTE).length === 2, 'Filter „nur überfällige"');
ok(M.mnFiltern(alle, { herkunft: 'wirksamkeit' }).length === 4 && M.mnFiltern(alle, { zielId: '5' }).length === 1, 'Filter nach Register und Ziel');
ok(M.mnFiltern(alle, { werk: 'WGC' }).length === 6, 'Werk-Filter: konzernweite bleiben, fremde Werke fallen weg');
ok(M.mnFiltern(alle, { q: 'ransom' }).length === 1, 'Volltext findet auch den Bezug (Risiko „Ransomware")');
const gq = M.mnGruppieren(alle, 'quelle');
ok(gq[0].wert === 'risiko' && gq.map(g => g.wert).indexOf('audit_extern') > gq.map(g => g.wert).indexOf('uebung'), 'Gruppen in der Reihenfolge des Katalogs');
ok(M.mnGruppieren(alle, 'kategorie').slice(-1)[0].label === 'ohne Angabe', 'Ohne Angabe steht am Ende');
const k0 = M.mnKennzahlen(alle, HEUTE);
ok(k0.gesamt === 7 && k0.offen === 4 && k0.inUmsetzung === 1 && k0.erledigt === 2 && k0.ueberfaellig === 2 && k0.quote === 29, 'Kennzahlen der Gesamtsicht');
ok(k0.ohneVerantwortlich === 3 && k0.jeQuelle.risiko === 1, 'Ohne Verantwortliche und je Quelle gezählt');
const csv = M.mnCsv(alle, (id) => (id === '5' ? 'S03 Intranet' : ''));
ok(csv.charCodeAt(0) === 0xFEFF && csv.split('\r\n').length === 8, 'CSV mit BOM, Kopf und einer Zeile je Maßnahme');
ok(/"Bewertung";"Art";"Priorität"/.test(csv) && /"S03 Intranet"/.test(csv) && /"Risiko-Register"/.test(csv), 'CSV trägt die Kategorien, das Ziel und das Register');

/* ── 2) Ziele ── */
ok(Z.zlNaechsteNr([{ nr: 'S01' }, { nr: 'S07' }, { nr: 'Q02' }], 'S') === 'S08', 'Nummer S08 nach S07');
const zEntwurf = { titel: 'ISO 27001', status: 'entwurf' };
ok(Z.zlLuecken(zEntwurf, []).length === 0, 'Ein Entwurf darf unvollständig sein');
const zPlan = { id: '5', titel: 'Intranet', status: 'umsetzung' };
const lp = Z.zlLuecken(zPlan, [], HEUTE);
ok(lp.length === 5, 'Ab „verabschiedet": Verantwortung, Termin, Messung, Ressourcen, Maßnahme verlangt');
const zVoll = { id: '5', titel: 'Intranet', status: 'umsetzung', verantwortlich: 'it', termin: '2027-07-31', messung: 'alle Maßnahmen', ressourcen: '1 IT' };
ok(Z.zlLuecken(zVoll, [{ zielId: '5', status: 'offen' }], HEUTE).length === 0, 'Vollständig geplant: keine Lücke');
ok(Z.zlLuecken(Object.assign({}, zVoll, { termin: '2026-01-31' }), [{ zielId: '5', status: 'offen' }], HEUTE).some(l => /Management Review/.test(l)), 'Termin überschritten: die Bewertung gehört ins Management Review');
ok(Z.zlLuecken(Object.assign({}, zVoll, { status: 'verfehlt' }), [], HEUTE).some(l => /Bewertung/.test(l)), 'Auch ein verfehltes Ziel braucht seine Bewertung');
ok(Z.zlAbschlussfehler(zVoll, 'erreicht', '').length === 1 && Z.zlAbschlussfehler(zVoll, 'erreicht', 'Zertifikat liegt vor').length === 0, 'Ein Ergebnis gibt es nur mit Bewertungstext');
ok(Z.zlFortschritt(zVoll, [{ zielId: '5', status: 'erledigt' }, { zielId: '5', status: 'offen' }, { zielId: '5', status: 'verworfen' }]).pct === 50, 'Fortschritt ohne Verworfenes: 1 von 2');
const zk = Z.zlKennzahlen([zVoll, Object.assign({}, zVoll, { id: '6', termin: '2026-01-01' }), { titel: 'X', status: 'erreicht' }], [], HEUTE);
ok(zk.gesamt === 3 && zk.laufend === 2 && zk.erreicht === 1 && zk.ueberschritten === 1 && zk.ohneKennzahl === 2, 'Kennzahlen über die Ziele');
for (const [ein, aus] of [['Februar 2027', '2027-02-28'], ['Dezember 2025', '2025-12-31'], ['Juli 2026', '2026-07-31'], ['12/2025', '2025-12-31'],
  ['31.03.2026', '2026-03-31'], ['Q1 2027', '2027-03-31'], ['Ende 2028', '2028-12-31'], ['bald', '']])
  ok(Z.zlDatumAusText(ein) === aus, `Termin „${ein}" → ${aus || 'leer'}`);
const vorlage = ['Informationssicherheitsziele', '', 'Ziel S01: Zertifizierung', 'Beschreibung:', 'Zeile eins.', 'Zeile zwei.', 'Zielerreichung bis:', 'Februar 2027',
  'Messung der Zielerreichung:', 'Vollständige Maßnahmenumsetzung', 'Verantwortlich:', 'Compliance und IT', 'Maßnahme:', 'Einführung', 'Geplantes Umsetzungsdatum:', 'Februar 2027',
  'Verantwortlich:', 'Compliance', 'Messung:', 'Alles dokumentiert.', 'Ressourcen:', 'Partner', '', 'Ziel S02: Umzug', 'Beschreibung:', 'Konsolidierung.', '',
  'Zielerreichung bis:', 'Dezember 2025', 'Verantwortlich:', 'IT', 'Maßnahme:', 'VM-Umzug', 'Geplantes Umsetzungsdatum:', 'Dezember 2025', '', 'Verantwortlich:', 'IT',
  'Ressourcen:', 'Zwei Personen', 'Maßnahme:', 'Zweite', 'Ressourcen:', 'Budget', '', 'Max Muster', 'CEO'].join('\n');
const vz = Z.zlAusVorlageText(vorlage);
ok(vz.length === 2 && vz[0].nr === 'S01' && vz[0].titel === 'Zertifizierung' && vz[0].termin === '2027-02-28', 'Vorlage: Ziele mit Nummer, Titel und Termin');
ok(vz[0].beschreibung === 'Zeile eins.\nZeile zwei.' && vz[0].verantwortlich === 'Compliance und IT' && vz[0].messung === 'Vollständige Maßnahmenumsetzung', 'Mehrzeilige Beschreibung; Verantwortung und Messung des Ziels');
ok(vz[0].massnahmen.length === 1 && vz[0].massnahmen[0].verantwortlich === 'Compliance' && vz[0].massnahmen[0].messung === 'Alles dokumentiert.', 'Nach „Maßnahme:" gehören Verantwortung und Messung zur Maßnahme');
ok(vz[1].massnahmen.length === 2 && vz[1].massnahmen[0].verantwortlich === 'IT' && vz[1].massnahmen[1].ressourcen === 'Budget', 'Leerzeile mitten in einer Maßnahme stört nicht');
ok(vz[1].ressourcen === 'Zwei Personen\nBudget' && !/Muster|CEO/.test(JSON.stringify(vz)), 'Ressourcen des Ziels aus seinen Maßnahmen; die Unterschriften bleiben draußen');

/* ── 3) Kennzahlen ── */
ok(K.kzZahl('1.250,5') === 1250.5 && K.kzZahl('93 %') === 93 && K.kzZahl('abc') === null && K.kzZahl(4) === 4, 'Zahlen deutsch gelesen');
const kp = { name: 'Patch-Quote', richtung: 'hoch', ziel: '95', intervall: 'monatlich', status: 'aktiv', verantwortlich: 'it', methode: 'WSUS',
  werte: [{ datum: '2026-08-31', wert: 91 }, { datum: '2026-09-30', wert: '96,5' }, { datum: 'kaputt', wert: 3 }] };
ok(K.kzNormal(kp).werte.length === 2 && K.kzLetzter(kp).wert === 96.5, 'Ungültige Werte fallen weg; letzter Wert');
ok(K.kzBewertung(kp) === 'erfuellt' && K.kzTrend(kp) === 'besser', '96,5 ≥ 95: im Ziel, besser als zuvor');
const kn = { name: 'Offene hohe Risiken', richtung: 'niedrig', ziel: '0', werte: [{ datum: '2026-09-01', wert: 1 }, { datum: '2026-10-01', wert: 3 }] };
ok(K.kzBewertung(kn) === 'verfehlt' && K.kzTrend(kn) === 'schlechter', 'Höchstens 0, Ist 3: verfehlt und schlechter');
ok(K.kzBewertung({ ziel: '', werte: [{ datum: '2026-01-01', wert: 1 }] }) === 'offen', 'Ohne Sollwert: offen');
const nm = K.kzNaechsteMessung({ intervall: 'monatlich', status: 'aktiv', werte: [{ datum: '2026-01-31', wert: 1 }] }, '2026-02-20');
ok(nm.datum === '2026-02-28' && !nm.faellig && nm.tage === 8, 'Nächste Messung: 31.01. + 1 Monat = 28.02.');
ok(K.kzNaechsteMessung(kp, HEUTE).faellig === false && K.kzNaechsteMessung(Object.assign({}, kp, { werte: [{ datum: '2026-08-31', wert: 91 }] }), HEUTE).faellig, 'Fällig, wenn das Intervall um ist');
ok(K.kzNaechsteMessung(Object.assign({}, kp, { status: 'stillgelegt' }), HEUTE) === null, 'Stillgelegt: keine Messung fällig');
ok(K.kzLuecken({ name: 'X', status: 'aktiv' }).length === 4, 'Ohne Soll, Verantwortung, Intervall und Methode: vier Lücken');
ok(K.kzLuecken(kp, HEUTE).length === 0, 'Vollständig und gemessen: keine Lücke');
const ks = K.kzKennzahlen([kp, kn, { name: 'neu', status: 'aktiv', intervall: 'quartal' }, { name: 'alt', status: 'stillgelegt' }], HEUTE);
ok(ks.gesamt === 3 && ks.erfuellt === 1 && ks.verfehlt === 1 && ks.offen === 1 && ks.messungFaellig === 1 && ks.ohneSoll === 1, 'Kennzahlen über das Register (Stillgelegtes zählt nicht)');
ok(K.kzSollText(kp) === '≥ 95' && K.kzSollText({ ziel: '5', richtung: 'niedrig', einheit: 'Tage' }) === '≤ 5 Tage', 'Sollwert als Text');
const metr = { compliance: { quote: 87 }, soa: { umgesetzt: 40, anwendbar: 80 }, risiken: { hoch: 2, mUeber: 1 }, wirksamkeit: { mUeber: 2, abwOffen: 3 },
  massnahmen: { ueberfaellig: 5 }, ziele: { laufend: 4, ueberschritten: 1 }, faellig: { overdue: 0 } };
ok(K.kzAutomatikWert('kenntnisquote', metr) === 87 && K.kzAutomatikWert('soaUmgesetzt', metr) === 50 && K.kzAutomatikWert('zieleImPlan', metr) === 75, 'Automatik liest die Metriken des Audit Reports');
ok(K.kzAutomatikWert('massnahmenUeberfaellig', metr) === 5 && K.kzAutomatikWert('massnahmenUeberfaellig', { risiken: { mUeber: 1 }, wirksamkeit: { mUeber: 2 } }) === 3, 'Überfällige Maßnahmen: aus der Gesamtsicht, sonst aus Risiken und Wirksamkeit');
ok(K.kzAutomatikWert('vorfaelleUnbeurteilt', metr) === null && K.kzAutomatikWert('regelwerkeUeberfaellig', metr) === 0, 'Fehlt ein Teil, ist der Wert null, keine falsche Null; eine echte Null bleibt');
const ap = K.kzAusProzessen([{ art: 'kachel', werk: 'WGC', kachel: { id: 'k1', name: 'Einkauf' }, kennzahlen: { liste: [{ name: 'Liefertreue', richtung: 'hoch', ziel: '95', ist: '93', einheit: '%' }], geerbt: false } },
  { art: 'modell', werk: 'HOL', kachel: { id: 'm9', name: 'Vertrieb' }, kennzahlen: { liste: [{ name: 'Angebote', richtung: 'hoch', ziel: '10', ist: '' }], geerbt: true } }]);
ok(ap.length === 2 && ap[0].werk === 'HOL' && ap[0].geerbt && ap[0].bewertung === 'offen' && ap[1].bewertung === 'verfehlt', 'Prozesskennzahlen: je Kennzahl eine Zeile, Vorgabe erkannt, bewertet');
const vl = K.kzVerlauf(kp, 100, 20);
ok(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/.test(vl.pfad) && vl.soll !== null && vl.punkte.length === 2, 'Verlauf als SVG-Pfad mit Sollwert-Linie');
ok(K.kzNaechsteNr([{ nr: 'K-09' }, { nr: 'X' }]) === 'K-10', 'Nummer K-10 nach K-09');

/* ── 4) Die Listen auf der ISMS-Site ── */
const sp = lies('js/sharepoint.js');
const sctx = { console, JSON, Date, Promise, Set, Map, Array, Object, String, Math, Number, location: { origin: '', pathname: '' } };
sctx.window = sctx; sctx.globalThis = sctx;
vm.createContext(sctx);
vm.runInContext(sp, sctx);
const w = (a) => vm.runInContext(a, sctx);
ok(w(`_regMassnahmen.name === 'Massnahmen' && _regZiele.name === 'Ziele' && _regKennzahlen.name === 'Kennzahlen'`), 'Drei Listen: Massnahmen, Ziele, Kennzahlen');
w(`_regMassnahmen.cols = new Set(['Title', 'Nr', 'MTermin', 'MStatus', 'KostenPlan', 'HistorieJson'])`);
const neu = w(`_regMassnahmen._felder({ titel: 'A', nr: 'M-2026-001', termin: '', status: 'offen', kostenPlan: '', beschreibung: 'gibt es nicht' }, false)`);
ok(neu.Title === 'A' && neu.Nr === 'M-2026-001' && !('MTermin' in neu) && !('KostenPlan' in neu) && !('Beschreibung' in neu), 'Anlegen: leeres Datum und leere Zahl weggelassen, unbekannte Spalte nicht gesendet');
const aend = w(`_regMassnahmen._felder({ titel: 'A', termin: '', kostenPlan: '' }, true)`);
ok(aend.MTermin === null && aend.KostenPlan === null, 'Ändern: geleertes Datum und geleerte Zahl werden geleert (null)');
const mit = w(`_regMassnahmen._felder({ titel: 'A', termin: '2026-11-30' }, false)`);
ok(mit.MTermin === '2026-11-30T12:00:00Z', 'Datum mittags UTC, damit kein Tag durch die Zeitzone kippt');
w(`_regKennzahlen.cols = null`);
const kf = w(`_regKennzahlen._felder({ name: 'Q', werte: [{ datum: '2026-01-01', wert: 1 }], automatik: 'kenntnisquote' }, false)`);
ok(JSON.parse(kf.WerteJson).length === 1 && kf.Automatik === 'kenntnisquote' && kf.Title === 'Q', 'Kennzahl: Messwerte als JSON, Automatik als Spalte');
ok(/async function spGetMassnahmenLeise\(\)\s*\{ return _regMassnahmen\.alle\(false\); \}/.test(sp) && /async function spGetZieleLeise\(\)/.test(sp) && /async function spGetKennzahlenLeise\(\)/.test(sp),
  'Leise lesen legt keine Liste an (Cockpit, Audit Report, Fälligkeiten)');
ok(/root\/search\(q=/.test(sp) && /async function spSucheIsmsDatei/.test(sp), 'Die Vorlage wird über die Suche gefunden, nicht durch Lesen der ganzen Bibliothek');

/* ── 5) Die Ansichten zeichnen mit echten Daten ── */
const mounts = {};
const modals = [];
const vctx = {
  console, JSON, Date, Promise, Set, Map, Array, Object, String, Math, Number, URLSearchParams, setTimeout,
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  jsArg, sichereUrl,
  fmtDate: (s) => String(s || '').slice(0, 10).split('-').reverse().join('.'), fmtDateTime: (s) => String(s || ''),
  emptyState: (t) => `<div class="empty">${t}</div>`, toast: () => {}, openModal: (h) => modals.push(h), closeModal: () => {},
  canWriteTab: () => true, STANDORTE: ['HOL', 'SHB', 'WGC'], State: { user: { upn: 'isb@dihag.com', name: 'Iris' } },
  document: { getElementById: (id) => (mounts[id] = mounts[id] || { innerHTML: '' }) },
};
vctx.globalThis = vctx;
vm.createContext(vctx);
for (const f of ['js/massnahmenmodell.js', 'js/zielmodell.js', 'js/kennzahlmodell.js', 'js/massnahmen.js', 'js/ziele.js', 'js/kennzahlen.js']) vm.runInContext(lies(f), vctx);
const v = (a) => vm.runInContext(a, vctx);
vctx.__eigene = eigene; vctx.__risiken = risiken; vctx.__wirk = wirk;
v(`_mn = __eigene; _mnRisiken = __risiken; _mnWirk = __wirk; _mnZiele = [{ id: '5', nr: 'S03', titel: 'Intranet' }]; _mnFilter.offen = false; renderMassnahmen()`);
const mh = mounts['massnahmen-mount'].innerHTML;
ok(/Offline-Backup/.test(mh) && /Externes Audit: Zutritt/.test(mh) && /Schulung/.test(mh), 'Maßnahmen: eigene und fremde in einer Liste');
ok(/Kategorisieren nach/.test(mh) && /Risikobehandlung \(1/.test(mh) && />überfällig</.test(mh), 'Gruppiert nach Quelle, mit Übersicht und Kacheln');
ok(/mnUrsprungOeffnen\(&quot;risiko:3:0&quot;\)/.test(mh) && /openMassnahme\(&quot;1&quot;\)/.test(mh), 'Fremde führen zum Ursprung, eigene in den Editor');
ok(/🎯 S03 Intranet/.test(mh), 'Am Ziel hängende Maßnahme zeigt das Ziel');
v(`_mnGruppe = 'kategorie'; renderMassnahmen()`);
ok(/Technologisch \(1/.test(mounts['massnahmen-mount'].innerHTML), 'Umschalten auf Kategorie (ISO 27002)');
v(`openMassnahme('1')`);
ok(/Maßnahme M-2026-001/.test(modals.at(-1)) && /Bereich des IMS/.test(modals.at(-1)) && /NA Nichtkonformität · V Verbesserung · E Empfehlung/.test(modals.at(-1)), 'Editor mit den Kategorien des Maßnahmenplans');
v(`openMassnahme(null)`);
ok(/Neue Maßnahme M-2026-003/.test(modals.at(-1)), 'Neue Maßnahme bekommt die nächste Nummer');

vctx.__ziele = [zVoll, { id: '6', nr: 'S01', titel: 'ISO 27001', status: 'umsetzung', termin: '2026-02-28', kennzahlIds: ['k1'] }];
vctx.__kpi = [Object.assign({ id: 'k1', nr: 'K-01' }, kp)];
v(`_zl = __ziele.map(zlNormal); _zlMass = [{ id: 'm1', zielId: '5', status: 'erledigt', titel: 'A' }, { id: 'm2', zielId: '5', status: 'offen', titel: 'B' }];
   _zlKpi = __kpi; _zlWirk = [{ id: 'w1', art: 'bewertung', titel: 'MR 2026', datum: '2026-03-01' }]; renderZiele()`);
const zh = mounts['ziele-mount'].innerHTML;
ok(/Intranet/.test(zh) && /1 von 2 Maßnahmen erledigt/.test(zh) && /Termin überschritten/.test(zh), 'Ziele: Fortschritt der Maßnahmen und überschrittener Termin');
ok(/📊 Patch-Quote: <b style="color:#15803d">96,5/.test(zh), 'Die verknüpfte Kennzahl zeigt ihren letzten Wert mit Ampel');
ok(/Aus der Vorlage übernehmen/.test(zh), 'Übernahme aus der Vorlage angeboten');
v(`openZiel('5')`);
ok(/Bewertung \(Management Review\)/.test(modals.at(-1)) && /MR 2026/.test(modals.at(-1)) && /\+ Maßnahme zu diesem Ziel/.test(modals.at(-1)), 'Ziel-Editor: Bewertung mit Managementbewertung, Maßnahme anlegen');

v(`_kz = __kpi.map(kzNormal); _kzZiele = __ziele; _kzProzesse = []; renderKennzahlen()`);
const kh = mounts['kennzahlen-mount'].innerHTML;
ok(/Patch-Quote/.test(kh) && /▲ besser/.test(kh) && /<svg/.test(kh) && /🎯 S01 ISO 27001/.test(kh), 'Kennzahlen: Trend, Verlauf und gemessene Ziele');
ok(/Vom RMS gemessen/.test(kh) && /Jetzt messen/.test(kh) && /Prozesskennzahlen/.test(kh), 'Mit Automatik und Prozesskennzahlen');
vctx.__metr = metr;
v(`_kzMetriken = Object.assign({ fehler: [] }, __metr)`);
const ah = v('_kzAutomatikHtml()');
ok(/Kenntnisnahme-Quote der Pflicht-Regelwerke/.test(ah) && /Als Kennzahl führen/.test(ah) && /nicht messbar/.test(ah), 'Automatik: Wert heute, führen oder nicht messbar');
v(`kzWertErfassen('k1')`);
ok(/Wert erfassen: Patch-Quote/.test(modals.at(-1)), '„+ Wert" öffnet die Erfassung');

/* ── 6) Verdrahtung ── */
const html = lies('index.html');
for (const [id, mount, refresh] of [['ziele', 'ziele-mount', 'refreshZiele'], ['massnahmen', 'massnahmen-mount', 'refreshMassnahmen'], ['kennzahlen', 'kennzahlen-mount', 'refreshKennzahlen']]) {
  ok(new RegExp(`<a class="nav-item" data-view="${id}" id="nav-${id}" style="display:none">`).test(html), `Navigation: ${id}, von sich aus ausgeblendet`);
  ok(new RegExp(`<section id="view-${id}" class="view">[\\s\\S]*?<div id="${mount}">`).test(html) && html.includes(`onclick="${refresh}()"`), `Ansicht ${id} mit Mount und Aktualisieren`);
}
ok(html.indexOf('id="nav-ziele"') > html.indexOf('id="nav-assets"') && html.indexOf('id="nav-kennzahlen"') < html.indexOf('id="nav-wirksamkeit"'), 'In der Gruppe „IMS und Prozesse", vor Wirksamkeit');
const acc = lies('js/access.js');
ok(/\{ view: 'ziele',\s*label: 'Ziele'/.test(acc) && /\{ view: 'massnahmen',\s*label: 'Maßnahmen'/.test(acc) && /\{ view: 'kennzahlen',\s*label: 'Kennzahlen'/.test(acc), 'In der Reiter-Matrix (Einstellungen → Reiter-Berechtigungen)');
ok(/show\('nav-ziele',\s+v\.ziele\)/.test(acc) && /show\('nav-massnahmen',\s+v\.massnahmen\)/.test(acc) && /show\('nav-kennzahlen',\s+v\.kennzahlen\)/.test(acc), 'Sichtbar nach Leserecht');
ok(/v\.ziele \|\| v\.massnahmen \|\| v\.kennzahlen/.test(acc.slice(acc.indexOf("show('nav-grp-isms'"))), 'Die Gruppen-Überschrift zählt sie mit');
ok(!/REITER_OHNE_STANDARD = \[[^\]]*'(ziele|massnahmen|kennzahlen)'/.test(acc), 'Von sich aus nur für Admins; wer sie sonst sieht, entscheidet die Reiter-Freigabe');
const plBleibt = (lies('js/probelauf.js').match(/PROBELAUF_NAV_BLEIBT = \[([^\]]*)\]/) || [])[1] || '';
ok(plBleibt && !/'(ziele|massnahmen|kennzahlen)'/.test(plBleibt), 'Im Probelauf ausgeblendet');
const mctx = { module: { exports: {} }, document: { querySelector: () => null }, Map, Promise };
mctx.window = mctx; mctx.globalThis = mctx; vm.createContext(mctx);
vm.runInContext(lies('js/module.js'), mctx);
const { MODUL_ADMIN, MODUL_ANSICHTEN } = mctx.module.exports;
ok(['massnahmenmodell', 'zielmodell', 'kennzahlmodell'].every(x => MODUL_ADMIN.includes(x)) && MODUL_ADMIN.indexOf('kennzahlmodell') < MODUL_ADMIN.indexOf('clevelreport'),
  'Die Modelle im Verwaltungsblock, vor dem Audit Report');
ok(MODUL_ANSICHTEN.massnahmen.includes('massnahmen') && MODUL_ANSICHTEN.ziele.includes('massnahmen') && MODUL_ANSICHTEN.ziele.includes('ziele')
  && MODUL_ANSICHTEN.kennzahlen.includes('prozessmodell') && MODUL_ANSICHTEN.kennzahlen.includes('kennzahlen'), 'Die Ansichten laden, was sie brauchen');
const app = lies('js/app.js');
ok(/if \(view === 'ziele'\s+&& typeof initZiele === 'function'\)\s+initZiele\(\);/.test(app) && /initMassnahmen\(\);/.test(app) && /initKennzahlen\(\);/.test(app), 'switchView startet die Ansichten');
ok(/'ziele', 'massnahmen', 'kennzahlen', 'wirksamkeit'/.test(app) && /mnDeepLink\(params\.get\('massnahme'\)\)/.test(app) && /zlDeepLink/.test(app) && /kzDeepLink/.test(app), 'Deep-Links auf Maßnahme, Ziel, Kennzahl');
const ck = lies('js/cockpit.js');
ok(/tile\('ziele'/.test(ck) && /tile\('massnahmen'/.test(ck) && /tile\('kennzahlen'/.test(ck) && /_ckLoadZieleMassnahmenKennzahlen\(seq\)/.test(ck), 'Cockpit: drei Kacheln');
const cl = lies('js/clevelreport.js');
ok(/add\('ISO 6\.2', 'Informationssicherheitsziele'/.test(cl) && /add\('ISO 9\.1', 'Überwachung, Messung, Analyse und Bewertung'/.test(cl) && /'Maßnahmen \(alle Register\)'/.test(cl),
  'Audit Report: ISO 6.2, ISO 9.1 und die Maßnahmen');
ok(/spGetMassnahmenLeise\(\)/.test(cl) && /spGetZieleLeise\(\)/.test(cl) && /spGetKennzahlenLeise\(\)/.test(cl), 'Der Audit Report liest leise');
const fae = lies('js/faelligkeit.js');
ok(/<div id="fael-register"/.test(fae) && /_faelligRegisterZeigen\(\);/.test(fae) && /Maßnahmen überfällig/.test(fae) && /Ziele über dem Termin/.test(fae) && /Messung fällig/.test(fae),
  'Fälligkeiten: überfällige Maßnahmen, Ziele über dem Termin, fällige Messungen');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
