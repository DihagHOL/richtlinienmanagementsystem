/**
 * Ziele, Maßnahmen, Kennzahlen – auf den bestehenden Listen der ISMS-Site.
 *
 * Das Haus führt dafür seit 2025 eigene Listen: „Maßnahmen", „ISMS Ziele",
 * „Kennzahlen", „Kennzahlen Tracking", dazu „Teams", „Standorte" und
 * „ISO/IEC 27001:2022". Ein erster Entwurf legte eigene Listen an und hätte
 * in die bestehenden Spalten ergänzt. Das ist das, was hier ausgeschlossen
 * wird: Das RMS liest und schreibt Einträge, legt keine Liste an, ändert
 * keine Spalte.
 *
 * Geprüft wird: die Modelle (lesen sie die Listen richtig, rechnen sie
 * richtig?), die Anbindung (was wird gesendet?), die Ansichten (zeichnen sie
 * mit echten Daten?) und die Verdrahtung.
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

/* Einträge, wie _hausLesen sie aus den Listen liefert (Aufbau wie im Bestand). */
const rohMass = [
  { id: '11', titel: '​Background Checks durchführen', beschreibung: 'Verpflichtender Background check', status: 'In Bearbeitung',
    quellen: ['Internes Audit', 'Risikobehandlung', 'Sicherheitsvorfall'], durchfuehrung: 'Kontinuierlich', teams: [{ id: '4', wert: 'Personal' }],
    iso: [{ id: '30', wert: 'A.6.01 Sicherheitsüberprüfung' }], termin: '2024-04-08', auswirkungEintritt: 'Reduzierend', archiv: false, ressourcen: 'HR' },
  { id: '12', titel: 'Videoüberwachung einführen', status: 'Offen', quellen: ['Risikobehandlung'], durchfuehrung: 'Einmalig',
    teams: [{ id: '6', wert: 'Facility Management' }], iso: [{ id: '40', wert: 'A.7.02 Physischer Zutritt' }], archiv: false },
  { id: '13', titel: 'VM-Server Umzug', status: 'Offen', quellen: ['Zielemanagement'], teams: [], verantwortlich: { id: '16', name: 'Max Muster', email: 'max@dihag.com' },
    termin: '2027-01-15', iso: [], archiv: false, ressourcen: 'Partner TAZ' },
  { id: '14', titel: 'Alt', status: 'Abgeschlossen', quellen: ['Externes Audit'], archiv: true, umgesetztAm: '2025-01-01' },
  { id: '15', titel: 'Zurückgestellt', status: 'Zurückgestellt', quellen: ['Management Review'], archiv: false },
];
const rohZiele = [
  { id: '1', titel: 'Erreichung der ISO27001 Zertifizierung', beschreibung: 'Sicherheitsniveau', termin: '2027-02-28', messung: 'Alle Dokumente gelebt',
    erreicht: 'Nein', status: 'Wie geplant', zieltyp: 'Operativ und strategisch', teams: [{ id: '23', wert: 'ISMS-Management' }],
    massnahmen: [{ id: '11', wert: 'Background Checks durchführen' }], standort: { id: '11', wert: 'Alle DIHAG-Standorte' }, prioritaet: 'sehr hoch',
    bemerkung: '<div class="ExternalClassX"><p><br></p></div>', archiv: false },
  { id: '2', titel: 'Umzug OnPremise Server', termin: '2025-12-31', messung: 'Anzahl VMs', erreicht: 'Nein', status: 'Wie geplant',
    teams: [{ id: '20', wert: 'IT' }], massnahmen: [{ id: '13', wert: 'VM-Server Umzug' }], archiv: false },
];
const rohKpi = [
  { id: '1', name: 'Offene Maßnahmen aus internen Audits', typ: 'Prozess-Kennzahl', turnus: 'Jährlich', einheit: 'Stückzahl',
    team: { id: '23', wert: 'ISMS-Management' }, normalwert: '<= 5 offene Maßnahmen', messung: 'Offene Maßnahmen', archiv: false },
  { id: '3', name: 'Microsoft Secure Score', typ: 'Technik-Kennzahl', turnus: 'Halbjährlich', einheit: 'Prozentsatz',
    team: { id: '20', wert: 'IT' }, normalwert: '60%', messung: 'Microsoft Score', archiv: false },
  { id: '7', name: 'Endpoint Security', typ: 'Technik-Kennzahl', turnus: 'Quartalsweise', einheit: 'Zustand', team: { id: '20', wert: 'IT' },
    normalwert: 'Ziel: 100% nach max. 30 Minuten, Grün: > 90%, Gelb: 70-90%, Rot: <70%', messung: 'Zeitvergleich', archiv: false },
  { id: '10', name: 'Migrierte Systeme', typ: 'Technik-Kennzahl', turnus: 'Halbjährlich', einheit: 'Stückzahl', team: { id: '20', wert: 'IT' }, normalwert: '', messung: 'Projekte', archiv: false },
];
const rohTracking = [
  { id: '7', wert: '36.73', kennzahl: { id: '3', wert: '' }, datum: '2022-07-22', standorte: [{ id: '1', wert: 'Gienanth' }] },
  { id: '9', wert: '61.5', kennzahl: { id: '3', wert: '' }, datum: '2026-08-06', von: { id: '16', name: 'Max Muster' } },
  { id: '10', wert: '80', kennzahl: { id: '7', wert: '' }, datum: '2026-07-31', bemerkung: '<div>Stichprobe</div>' },
  { id: '11', wert: 'x', kennzahl: null, datum: '2026-07-31' },
];

/* ── 1) Maßnahmen ── */
ok(M.MN_QUELLEN.filter(q => !q.nurGesamtsicht).map(q => q.key).join('|') === 'Risikobehandlung|Internes Audit|Externes Audit|Management Review|Sicherheitsvorfall|Tests und Übungen|Zielemanagement',
  '„Entspringt aus" mit den Auswahlwerten der Liste');
ok(M.MN_STATUS.map(s => s.haus).join('|') === 'Offen|In Bearbeitung|Zurückgestellt|Abgeschlossen', 'Status wie in der Liste');
const mm = rohMass.map(M.mnAusHaus);
ok(mm[0].titel === 'Background Checks durchführen' && mm[0].status === 'in Umsetzung' && mm[0].quelle === 'Internes Audit' && mm[0].quellen.length === 3,
  'Gelesen: unsichtbares Leerzeichen entfernt, Status abgebildet, mehrere Quellen');
ok(mm[0].team === 'Personal' && mm[0].normbezug === 'A.6.01' && mm[0].kategorie === 'personell', 'Team, Control und daraus das Thema (A.6 = personell)');
ok(mm[1].kategorie === 'physisch' && mm[2].verantwortlich === 'max@dihag.com' && mm[2].verantwortlichName === 'Max Muster', 'A.7 = physisch; Person mit E-Mail und Namen');
ok(M.mnKategorieAusIso(['A.8.13 Sicherung', 'A.8.15 Protokollierung', 'A.5.1 Politik']) === 'technologisch' && M.mnKategorieAusIso(['A.08.13']) === 'technologisch', 'Thema nach den meisten Controls, auch mit führender Null');
const zu = M.mnZuHaus(Object.assign({}, mm[0], { quellen: ['Risikobehandlung', 'Sonstige'], verantwortlich: 'neu@dihag.com' }));
ok(zu.status === 'In Bearbeitung' && zu.quellen.join() === 'Risikobehandlung' && zu.teams.join() === '4' && zu.iso.join() === '30', 'Geschrieben: Status als Auswahl, „Sonstige" nicht (gibt es in der Liste nicht), Nachschlagewerte als IDs');
ok(zu.verantwortlich === 'neu@dihag.com' && M.mnZuHaus({ titel: 'x', verantwortlich: 'Max Muster' }).verantwortlich === undefined && M.mnZuHaus({ titel: 'x' }).verantwortlich === '',
  'Person als E-Mail; ein bloßer Name bleibt unangetastet, leer wird geleert');
ok(M.mnLuecken(mm[1]).length === 1 && M.mnLuecken(Object.assign({}, mm[1], { teams: [] })).length === 2 && M.mnLuecken(mm[2]).length === 0, 'Lücken: ein Team genügt als Verantwortung; ohne Termin eine, ohne Team zwei, vollständig keine');
ok(M.mnLuecken(Object.assign({}, mm[3], { archiv: false })).length === 0 && M.mnLuecken(Object.assign({}, mm[3], { archiv: false, umgesetztAm: '' }))[0].includes('Umsetzungsdatum'),
  'Abgeschlossen braucht das Umsetzungsdatum');
ok(M.mnLuecken(mm[4]).length === 0, 'Zurückgestellt verlangt nichts');
ok(M.mnUeberfaellig(mm[0], HEUTE) && !M.mnUeberfaellig(mm[2], HEUTE) && !M.mnUeberfaellig(mm[4], HEUTE), 'Überfällig: geplant vorbei und offen; Zurückgestelltes nie');

const risiken = [{ id: '3', titel: 'Ransomware', kategorie: 'Technik / IT', controls: ['A.8.13'],
  massnahmen: [{ titel: 'Offline-Backup', verantwortlich: 'it@dihag.com', frist: '2026-09-01', status: 'offen' }, { titel: '' }] }];
const wirk = [
  { id: '7', art: 'abweichung', titel: 'Rechte nicht entzogen', quelle: 'internes Audit', werke: ['SHB'], massnahmen: [{ titel: 'Austrittsprozess', status: 'erledigt' }] },
  { id: '8', art: 'abweichung', titel: 'Phishing', herkunftId: 'ticket:44', massnahmen: [{ titel: 'Schulung', status: 'offen' }] },
  { id: '9', art: 'bewertung', titel: 'MR 2026', massnahmen: [{ titel: 'Budget', status: 'in Umsetzung' }] },
  { id: '10', art: 'uebung', titel: 'Übung SAP', massnahmen: [{ titel: 'Telefonliste', status: 'offen' }] },
  { id: '11', art: 'abweichung', titel: 'Fund', quelle: 'Beobachtung im Betrieb', massnahmen: [{ titel: 'Prüfen', status: 'offen' }] },
];
ok(M.mnAusRisiken(risiken).length === 1 && M.mnAusRisiken(risiken)[0].quelle === 'Risikobehandlung' && M.mnAusRisiken(risiken)[0].kategorie === 'technologisch', 'Risiko-Register: Risikobehandlung, Thema aus der Risikokategorie');
ok(M.mnAusWirksamkeit(wirk).map(e => e.quelle).join('|') === 'Internes Audit|Sicherheitsvorfall|Management Review|Tests und Übungen|Sonstige', 'Wirksamkeit: auf „Entspringt aus" abgebildet, sonst „Sonstige"');
const alle = M.mnAlle(rohMass, risiken, wirk, HEUTE);
ok(alle.length === 10, 'Gesamtsicht ohne Archiv: 4 aus der Liste, 1 aus Risiken, 5 aus Wirksamkeit');
ok(M.mnAlle(rohMass, [], [], HEUTE, { archiv: true }).length === 5, 'Mit Archiv: alle der Liste');
ok(alle[0].titel === 'Background Checks durchführen' && alle[1].titel === 'Offline-Backup', 'Überfälliges zuerst, nach Termin');
ok(M.mnFiltern(alle, { quelle: 'Risikobehandlung' }).length === 3, 'Filter „Entspringt aus" trifft auch mehrwertige Einträge');
ok(M.mnFiltern(alle, { team: 'Personal' }).length === 1 && M.mnFiltern(alle, { offen: true }).length === 8, 'Filter Team; „nur offene" ohne Abgeschlossenes und Zurückgestelltes');
ok(M.mnFiltern(alle, { ids: new Set(['13']) }).length === 1 && M.mnFiltern(alle, { werk: 'WGC' }).length === 9, 'Filter „zum Ziel" über IDs; Werk lässt Einträge ohne Werk stehen');
const gq = M.mnGruppieren(alle, 'quelle');
ok(gq[0].wert === 'Risikobehandlung' && gq.slice(-1)[0].wert === 'Sonstige', 'Gruppen in der Reihenfolge der Auswahl, Sonstige zuletzt');
ok(M.mnGruppieren(alle, 'herkunft').map(g => g.wert).join() === 'eigen,risiko,wirksamkeit', 'Nach Register gruppierbar');
const k0 = M.mnKennzahlen(alle, HEUTE);
ok(k0.gesamt === 10 && k0.offen === 6 && k0.inUmsetzung === 2 && k0.zurueckgestellt === 1 && k0.erledigt === 1 && k0.ueberfaellig === 2, 'Kennzahlen der Gesamtsicht');
ok(k0.jeQuelle.Risikobehandlung === 3 && k0.ohneTermin === 5, 'Je Quelle (mehrwertig gezählt) und ohne Termin');
const csv = M.mnCsv(alle, (id) => (id === '13' ? 'Umzug OnPremise Server' : ''));
ok(csv.charCodeAt(0) === 0xFEFF && csv.split('\r\n').length === 11 && /"Entspringt aus"/.test(csv) && /"Umzug OnPremise Server"/.test(csv), 'CSV mit BOM, Kategorien und Ziel');

/* ── 2) Ziele ── */
const zz = rohZiele.map(Z.zlAusHaus);
ok(zz[0].massnahmenIds.join() === '11' && zz[0].teams[0].wert === 'ISMS-Management' && zz[0].standort.wert === 'Alle DIHAG-Standorte' && zz[0].bemerkung === '', 'Gelesen: Maßnahmen als IDs, Teams, Standort; leere Rich-Text-Bemerkung wird leer');
ok(Z.zlOhneHtml('<div><p>Zeile&#58; eins</p><p>zwei &amp; drei</p></div>') === 'Zeile: eins\nzwei & drei', 'Rich-Text als Text');
const zh = Z.zlZuHaus(Object.assign({}, zz[0], { massnahmenIds: ['11', '13'] }));
ok(zh.massnahmen.join() === '11,13' && zh.teams.join() === '23' && zh.standort === '11' && zh.status === 'Wie geplant', 'Geschrieben: IDs für Maßnahmen, Teams, Standort');
ok(zh.bemerkung === undefined && Z.zlZuHaus(Object.assign({}, zz[0], { bemerkung: 'a <b>\nb', bemerkungGeaendert: true })).bemerkung === 'a &lt;b&gt;<br>b', 'Die Bemerkung wird nur geschrieben, wenn sie geändert wurde, und dann sicher');
ok(Z.zlErgebnis({ status: 'Abgeschlossen', erreicht: 'Ja' }) === 'erreicht' && Z.zlErgebnis({ status: 'Abgeschlossen', erreicht: 'Nein' }) === 'verfehlt' && Z.zlErgebnis({ status: 'Gestoppt' }) === 'gestoppt', 'Ergebnis aus Status und Zielerreichung');
const mass = rohMass.map(M.mnAusHaus);
ok(Z.zlLuecken(zz[0], mass, HEUTE).length === 0, 'Vollständig geplant: keine Lücke (Ressourcen an der Maßnahme)');
const l2 = Z.zlLuecken(zz[1], mass, HEUTE);
ok(l2.length === 1 && /Management Review/.test(l2[0]), 'Termin überschritten: das Ergebnis gehört ins Management Review');
ok(Z.zlLuecken({ titel: 'X', status: 'Wie geplant', massnahmenIds: ['12'] }, mass, HEUTE).length === 4, 'Ohne Team, Termin, Messung; Maßnahme ohne Ressourcen');
ok(Z.zlLuecken({ titel: 'X', status: 'Abgeschlossen', teams: [{ id: '1' }], termin: '2026-01-01', messung: 'm', erreicht: 'Nein' }, mass, HEUTE).some(l => /Begründung/.test(l)), 'Nicht erreicht ohne Bemerkung: Lücke');
ok(Z.zlAbschlussfehler({ erreicht: '' }).length === 1 && Z.zlAbschlussfehler({ erreicht: 'Nein', bemerkung: '' }).length === 1 && Z.zlAbschlussfehler({ erreicht: 'Ja' }).length === 0, 'Abschließen verlangt die Zielerreichung, bei „Nein" eine Bemerkung');
ok(Z.zlFortschritt(zz[0], mass).pct === 0 && Z.zlFortschritt({ massnahmenIds: ['14', '12'] }, mass).gesamt === 1, 'Fortschritt ohne Archiviertes');
const zk = Z.zlKennzahlen(zz.concat([{ titel: 'G', status: 'Gefährdet', termin: '2027-01-01' }, { titel: 'E', status: 'Abgeschlossen', erreicht: 'Ja' }]), mass, HEUTE);
ok(zk.gesamt === 4 && zk.laufend === 3 && zk.erreicht === 1 && zk.gefaehrdet === 1 && zk.ueberschritten === 1, 'Kennzahlen über die Ziele');

/* ── 3) Kennzahlen ── */
ok(JSON.stringify(K.kzSoll('<= 5 offene Maßnahmen', 'Stückzahl')) === JSON.stringify({ art: 'grenze', richtung: 'niedrig', op: '<=', wert: 5 }), 'Normalwert „<= 5 …": Grenze, höchstens 5');
ok(K.kzSoll('60%', 'Prozentsatz').op === '>=' && K.kzSoll('99,5%', 'Prozentsatz').wert === 99.5, '„60%", „99,5%": Mindestwert');
const amp = K.kzSoll('Ziel: 100% nach max. 30 Minuten, Grün: > 90%, Gelb: 70-90%, Rot: <70%', 'Zustand');
ok(amp.art === 'ampel' && amp.gruen.wert === 90 && amp.rot.wert === 70, 'Ampel aus „Grün: > 90%, …, Rot: <70%", auch mit Text davor');
ok(K.kzBewertungWert(amp, 95) === 'erfuellt' && K.kzBewertungWert(amp, 80) === 'gelb' && K.kzBewertungWert(amp, 50) === 'verfehlt', 'Ampel grün, gelb, rot');
ok(K.kzSoll('', 'Stückzahl') === null && K.kzSoll('nach Bedarf', 'Stückzahl') === null && K.kzSoll('12', 'Stückzahl') === null, 'Ohne erkennbare Grenze: keine Bewertung geraten');
const kk = K.kzAusHaus(rohKpi, rohTracking);
ok(kk.length === 4 && kk[1].werte.length === 2 && kk[1].werte[1].wert === 61.5 && kk[1].werte[1].von === 'Max Muster', 'Messwerte aus „Kennzahlen Tracking" an der Kennzahl, „61.5" mit Punkt gelesen');
ok(kk[2].werte[0].bemerkung === 'Stichprobe' && kk[0].werte.length === 0, 'Bemerkung als Text; ohne Messwert leer; ein Wert ohne Kennzahl fällt weg');
ok(K.kzBewertung(kk[1]) === 'erfuellt' && K.kzTrend(kk[1]) === 'besser' && K.kzBewertung(kk[2]) === 'gelb', 'Secure Score 61,5 ≥ 60: grün und besser; Endpoint 80: gelb');
ok(K.kzNaechsteMessung(kk[1], HEUTE).datum === '2027-02-06' && !K.kzNaechsteMessung(kk[1], HEUTE).faellig, 'Halbjährlich: nächste Messung ein halbes Jahr nach der letzten');
ok(K.kzNaechsteMessung(kk[0], HEUTE).faellig && K.kzNaechsteMessung(Object.assign({}, kk[0], { archiv: true }), HEUTE) === null, 'Ohne Wert sofort fällig; Archiv nie');
ok(K.kzLuecken(kk[3], HEUTE).some(l => /Normalwert/.test(l)) && K.kzLuecken(kk[1], HEUTE).length === 0, 'Lücken: ohne Normalwert; vollständig keine');
const ks = K.kzKennzahlen(kk, HEUTE);
ok(ks.gesamt === 4 && ks.erfuellt === 1 && ks.gelb === 1 && ks.offen === 2 && ks.messungFaellig === 2 && ks.ohneSoll === 1, 'Kennzahlen über das Register');
const kh = K.kzZuHaus(Object.assign({}, kk[2], { bereiche: [{ id: '20' }, { id: '23' }], standorte: [{ id: '11' }] }));
ok(kh.team === '20' && kh.bereiche.join() === '20,23' && kh.standorte.join() === '11' && kh.turnus === 'Quartalsweise', 'Geschrieben: Team, Bereiche, Standorte als IDs');
const kw = K.kzWertZuHaus({ kennzahlId: '3', datum: '2026-10-20', wert: '62,5', von: 'max@dihag.com', bemerkung: 'Halbjahr' });
ok(kw.wert === '62.5' && kw.kennzahl === '3' && kw.datum === '2026-10-20' && kw.von === 'max@dihag.com', 'Messwert für „Kennzahlen Tracking": IST-Wert mit Punkt wie im Bestand');
const metr = { compliance: { quote: 87 }, soa: { umgesetzt: 40, anwendbar: 80 }, massnahmen: { ueberfaellig: 5, offen: 3, inUmsetzung: 2 }, ziele: { laufend: 4, ueberschritten: 1 }, faellig: { overdue: 0 } };
ok(K.kzAutomatikWert('kenntnisquote', metr) === 87 && K.kzAutomatikWert('soaUmgesetzt', metr) === 50 && K.kzAutomatikWert('zieleImPlan', metr) === 75 && K.kzAutomatikWert('massnahmenOffen', metr) === 5,
  'Automatik liest die Metriken des Audit Reports');
ok(K.kzAutomatikWert('vorfaelleUnbeurteilt', metr) === null && K.kzAutomatikWert('regelwerkeUeberfaellig', metr) === 0, 'Fehlt ein Teil: null, keine falsche Null; eine echte Null bleibt');
const vl = K.kzVerlauf(kk[1], 100, 20);
ok(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/.test(vl.pfad) && vl.soll !== null, 'Verlauf als SVG-Pfad mit der Grenze des Normalwerts');

/* ── 4) Die Anbindung: bestehende Listen, keine neuen, keine Spalten ── */
const sp = lies('js/sharepoint.js');
ok(!/_ismsRegister|MASSNAHMEN_COLUMNS|ZIELE_COLUMNS|KENNZAHLEN_COLUMNS/.test(sp), 'Kein Register mehr, das eigene Listen oder Spalten anlegt');
const block = sp.slice(sp.indexOf('const HAUS_LISTEN'), sp.indexOf('Assets / Werte'));
ok(!/\/columns`, token, \{|\/lists`, token, \{/.test(block) && !/_post\([^)]*\/columns/.test(block), 'Im Block der ISMS-Listen wird weder eine Liste noch eine Spalte angelegt');
ok(/massnahmen: 'Maßnahmen', ziele: 'ISMS Ziele', kennzahlen: 'Kennzahlen', tracking: 'Kennzahlen Tracking'/.test(sp), 'Die Listen des Hauses beim Namen');
const sctx = { console, JSON, Date, Promise, Set, Map, Array, Object, String, Math, Number, location: { origin: '', pathname: '' } };
sctx.window = sctx; sctx.globalThis = sctx;
vm.createContext(sctx);
vm.runInContext(sp, sctx);
const anfragen = [];
sctx.acquireToken = async () => 'tok';
vm.runInContext(`_sp.ismsSiteId = 'S';`, sctx);
const spalten = [
  { name: 'Title', displayName: 'Titel', text: {} }, { name: 'Status', displayName: 'Status', choice: { choices: ['Offen'] } },
  { name: 'Entspringt_x0020_aus', displayName: 'Entspringt aus', choice: { displayAs: 'checkBoxes', choices: ['Risikobehandlung'] } },
  { name: 'Team', displayName: 'Team', lookup: { allowMultipleValues: true, listId: 'T' } },
  { name: 'Verantwortlich_x0020_zur_x0020_U', displayName: 'Verantwortlich zur Umsetzung', personOrGroup: {} },
  { name: 'Geplante_x0020_Umsetzung', displayName: 'Geplante Umsetzung', dateTime: {} },
  { name: 'Durchf_x00fc_hrung', displayName: 'Durchführung', choice: { choices: ['Einmalig'] } },
  { name: 'Archiv', displayName: 'Archiv', boolean: {} },
];
sctx.fetch = async (url, opt) => {
  anfragen.push({ url, opt });
  const json = (o) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => o, text: async () => JSON.stringify(o) });
  if (/\/lists\?\$select/.test(url)) return json({ value: [{ id: 'L1', displayName: 'Maßnahmen', name: 'Massnahmen' }, { id: 'L2', displayName: 'ISMS Ziele', name: 'ISMS Ziele' }] });
  if (/\/lists\/L1\/columns/.test(url)) return json({ value: spalten });
  if (/\/lists\/[^/]+\/items\?\$expand=fields\(\$select=id,EMail/.test(url)) return json({ value: [{ id: '16', fields: { EMail: 'max@dihag.com', Title: 'Max' } }] });
  if (/\/lists\?.*userInformationList|template/.test(url)) return json({ value: [] });
  if (opt && opt.method === 'POST') return json({ id: '99' });
  if (opt && opt.method === 'PATCH') return json({});
  return json({ value: [], id: 'X' });
};
vm.runInContext(`_ismsUserListId = 'U';`, sctx);
const neueId = await vm.runInContext(`_hausSchreiben('massnahmen', null, { titel: 'Neu', status: 'Offen', quellen: ['Risikobehandlung'], teams: ['20', '23'],
  verantwortlich: 'max@dihag.com', termin: '2026-11-30', durchfuehrung: '', archiv: false, gibtEsNicht: 'x' })`, sctx);
const post = anfragen.find(a => a.opt && a.opt.method === 'POST');
const felder = JSON.parse(post.opt.body).fields;
ok(neueId === '99' && /\/lists\/L1\/items$/.test(post.url), 'Neuer Eintrag in der bestehenden Liste (POST auf ihre Einträge)');
ok(felder.Title === 'Neu' && felder.Status === 'Offen' && felder['Entspringt_x0020_aus@odata.type'] === 'Collection(Edm.String)' && felder.Entspringt_x0020_aus[0] === 'Risikobehandlung',
  'Interne Spaltennamen aus dem Anzeigenamen; Mehrfachauswahl als Sammlung');
ok(felder['TeamLookupId@odata.type'] === 'Collection(Edm.Int32)' && felder.TeamLookupId.join() === '20,23', 'Mehrfach-Nachschlagewert als Liste von IDs');
ok(felder.Verantwortlich_x0020_zur_x0020_ULookupId === '16', 'Person über die Benutzerinformationsliste der ISMS-Site');
ok(felder.Durchf_x00fc_hrung === null && felder.Archiv === false && !('gibtEsNicht' in felder), 'Leere Auswahl wird geleert; was es nicht gibt, wird nicht gesendet');
ok(/^2026-11-(29T2[23]|30T00):00:00\.000Z$/.test(felder.Geplante_x0020_Umsetzung), 'Datum als Mitternacht Ortszeit, wie SharePoint selbst speichert');
ok(vm.runInContext(`_hausTag('2027-02-27T23:00:00Z') === '2027-02-28' && _hausTag('2024-04-07T22:00:00Z') === '2024-04-08' && _hausTag('') === ''`, sctx), 'Gelesen: Mitternacht Ortszeit ist der Kalendertag');
ok(!anfragen.some(a => /\/columns$/.test(a.url) && a.opt && a.opt.method === 'POST') && !anfragen.some(a => /\/lists$/.test(a.url) && a.opt && a.opt.method === 'POST'),
  'Dabei keine neue Spalte, keine neue Liste');

/* ── 5) Die Ansichten zeichnen mit echten Daten ── */
const mounts = {};
const modals = [];
const vctx = {
  console, JSON, Date, Promise, Set, Map, Array, Object, String, Math, Number, URLSearchParams, setTimeout,
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  jsArg, sichereUrl,
  fmtDate: (s) => String(s || '').slice(0, 10).split('-').reverse().join('.'), fmtDateTime: (s) => String(s || ''),
  emptyState: (t) => `<div class="empty">${t}</div>`, toast: () => {}, openModal: (h) => modals.push(h), closeModal: () => {},
  canWriteTab: () => true, State: { user: { upn: 'isb@dihag.com', name: 'Iris' } },
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: (id) => (mounts[id] = mounts[id] || { innerHTML: '' }) },
};
vctx.globalThis = vctx;
vm.createContext(vctx);
for (const f of ['js/massnahmenmodell.js', 'js/zielmodell.js', 'js/kennzahlmodell.js', 'js/massnahmen.js', 'js/ziele.js', 'js/kennzahlen.js']) vm.runInContext(lies(f), vctx);
const v = (a) => vm.runInContext(a, vctx);
vctx.__mass = mass; vctx.__risiken = risiken; vctx.__wirk = wirk; vctx.__ziele = zz; vctx.__kpi = kk;
v(`_mn = __mass; _mnRisiken = __risiken; _mnWirk = __wirk; _mnZiele = __ziele; _mnFilter.offen = false; renderMassnahmen()`);
const mh = mounts['massnahmen-mount'].innerHTML;
ok(/Background Checks durchführen/.test(mh) && /Offline-Backup/.test(mh) && /Telefonliste/.test(mh) && !/>Alt</.test(mh), 'Maßnahmen: Liste und Register zusammen, Archiv ausgeblendet');
ok(/Kategorisieren nach/.test(mh) && /Risikobehandlung \(2/.test(mh) && /Entspringt aus/.test(mh), 'Kategorisiert nach „Entspringt aus", mit Übersicht');
ok(/mnUrsprungOeffnen\(&quot;risiko:3:0&quot;\)/.test(mh) && /openMassnahme\(&quot;11&quot;\)/.test(mh) && /🎯 Erreichung der ISO27001 Zertifizierung/.test(mh), 'Register führen zum Ursprung, die Liste in den Editor; das Ziel steht dabei');
v(`_mnGruppe = 'kategorie'; renderMassnahmen()`);
ok(/Personell \(1/.test(mounts['massnahmen-mount'].innerHTML) && /Physisch \(1/.test(mounts['massnahmen-mount'].innerHTML), 'Umschalten auf das Thema nach ISO 27002');
await v(`_mnTeams = [{ id: '4', wert: 'Personal' }]; _mnIso = [{ id: '30', wert: 'A.6.01 Sicherheitsüberprüfung' }]; openMassnahme('11')`);
const ed = modals.at(-1);
ok(/Entspringt aus/.test(ed) && /Verantwortlich zur Umsetzung/.test(ed) && /ISO\/IEC 27001:2022/.test(ed) && /Personell/.test(ed) && /Archiv/.test(ed), 'Editor mit den Spalten der Liste');
ok(!/Bewertung|Kosten|Wirksamkeitsprüfung/.test(ed), 'Keine Felder, die die Liste nicht hat');

v(`_zl = __ziele; _zlMass = __mass; renderZiele()`);
const zhtml = mounts['ziele-mount'].innerHTML;
ok(/Erreichung der ISO27001 Zertifizierung/.test(zhtml) && /0 von 1 Maßnahmen abgeschlossen/.test(zhtml) && /Termin überschritten/.test(zhtml), 'Ziele: Fortschritt und überschrittener Termin');
ok(/ISMS-Management/.test(zhtml) && /Operativ und strategisch/.test(zhtml) && !/Aus der Vorlage/.test(zhtml), 'Teams und Zieltyp; keine Übernahme aus der Vorlage mehr (die Ziele stehen schon in der Liste)');
await v(`_zlTeams = [{ id: '23', wert: 'ISMS-Management' }]; _zlStandorte = [{ id: '11', wert: 'Alle DIHAG-Standorte' }]; openZiel('1')`);
ok(/Bewertung \(Management Review\)/.test(modals.at(-1)) && /Zielerreichung/.test(modals.at(-1)) && /Background Checks/.test(modals.at(-1)), 'Ziel-Editor: Bewertung, Zielerreichung, verknüpfte Maßnahmen');

v(`_kz = __kpi; _kzProzesse = []; renderKennzahlen()`);
const khtml = mounts['kennzahlen-mount'].innerHTML;
ok(/Microsoft Secure Score/.test(khtml) && /▲ besser/.test(khtml) && /<svg/.test(khtml) && /&lt;= 5 offene Maßnahmen/.test(khtml), 'Kennzahlen: Normalwert, Trend, Verlauf');
ok(/Vom RMS gemessen/.test(khtml) && /Prozesskennzahlen/.test(khtml), 'Mit „Vom RMS gemessen" und Prozesskennzahlen');
vctx.__metr = metr;
v(`_kzMetriken = Object.assign({ fehler: [] }, __metr)`);
const ah = v('_kzAutomatikHtml()');
ok(/Kenntnisnahme-Quote/.test(ah) && /Kennzahl wählen/.test(ah) && /nicht messbar/.test(ah), 'Automatik: Wert heute, Kennzahl wählen und eintragen');
await v(`_kzTeams = [{ id: '20', wert: 'IT' }]; _kzStandorte = []; openKennzahl('7')`);
ok(/Gelesen als Ampel: grün &gt; 90, rot &lt; 70/.test(modals.at(-1)) && /Kennzahlen Tracking/.test(modals.at(-1)), 'Kennzahl-Editor zeigt, wie der Normalwert gelesen wird');

/* ── 6) Verdrahtung ── */
const html = lies('index.html');
for (const [id, mount, refresh] of [['ziele', 'ziele-mount', 'refreshZiele'], ['massnahmen', 'massnahmen-mount', 'refreshMassnahmen'], ['kennzahlen', 'kennzahlen-mount', 'refreshKennzahlen']]) {
  ok(new RegExp(`<a class="nav-item" data-view="${id}" id="nav-${id}" style="display:none">`).test(html), `Navigation: ${id}, von sich aus ausgeblendet`);
  ok(new RegExp(`<section id="view-${id}" class="view">[\\s\\S]*?<div id="${mount}">`).test(html) && html.includes(`onclick="${refresh}()"`), `Ansicht ${id} mit Mount und Aktualisieren`);
}
const acc = lies('js/access.js');
ok(/\{ view: 'ziele',\s*label: 'Ziele'/.test(acc) && /\{ view: 'massnahmen',\s*label: 'Maßnahmen'/.test(acc) && /\{ view: 'kennzahlen',\s*label: 'Kennzahlen'/.test(acc), 'In der Reiter-Matrix');
ok(!/REITER_OHNE_STANDARD = \[[^\]]*'(ziele|massnahmen|kennzahlen)'/.test(acc), 'Von sich aus nur für Admins');
const plBleibt = (lies('js/probelauf.js').match(/PROBELAUF_NAV_BLEIBT = \[([^\]]*)\]/) || [])[1] || '';
ok(plBleibt && !/'(ziele|massnahmen|kennzahlen)'/.test(plBleibt), 'Im Probelauf ausgeblendet');
const mctx = { module: { exports: {} }, document: { querySelector: () => null }, Map, Promise };
mctx.window = mctx; mctx.globalThis = mctx; vm.createContext(mctx);
vm.runInContext(lies('js/module.js'), mctx);
const { MODUL_ADMIN, MODUL_ANSICHTEN } = mctx.module.exports;
ok(['massnahmenmodell', 'zielmodell', 'kennzahlmodell'].every(x => MODUL_ADMIN.includes(x)) && MODUL_ADMIN.indexOf('kennzahlmodell') < MODUL_ADMIN.indexOf('clevelreport'), 'Modelle im Verwaltungsblock, vor dem Audit Report');
ok(MODUL_ANSICHTEN.ziele.includes('massnahmen') && MODUL_ANSICHTEN.kennzahlen.includes('prozessmodell'), 'Die Ansichten laden, was sie brauchen');
const app = lies('js/app.js');
ok(/initZiele\(\);/.test(app) && /initMassnahmen\(\);/.test(app) && /initKennzahlen\(\);/.test(app) && /mnDeepLink/.test(app) && /zlDeepLink/.test(app) && /kzDeepLink/.test(app), 'switchView und Deep-Links');
ok(/_ckLoadZieleMassnahmenKennzahlen\(seq\)/.test(lies('js/cockpit.js')), 'Cockpit: drei Kacheln');
const cl = lies('js/clevelreport.js');
ok(/add\('ISO 6\.2', 'Informationssicherheitsziele'/.test(cl) && /add\('ISO 9\.1', 'Überwachung, Messung, Analyse und Bewertung'/.test(cl) && /spGetKennzahlenLeise\(\)/.test(cl), 'Audit Report: ISO 6.2, ISO 9.1, leise gelesen');
ok(/Ziele über dem Termin/.test(lies('js/faelligkeit.js')) && /Messung fällig/.test(lies('js/faelligkeit.js')), 'Fälligkeiten: Maßnahmen, Ziele, Messungen');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
