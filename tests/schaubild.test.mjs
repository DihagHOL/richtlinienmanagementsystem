/**
 * Schaubilder in der Bibliothek (js/schaubild.js)
 *
 * Zwei Bilder, die das RMS zeichnet: Informations-, IT- und Cybersicherheit
 * mit den Assets aus dem Register, und die Kurve „Wie viel Sicherheit lohnt
 * sich" mit dem Stand des Risiko-Registers. Ohne Zugriff auf das Register
 * steht das Bild ohne Zahlen da. Im Code steht kein Name aus dem Haus.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

globalThis.jsArg = require(ROOT + '/js/util.js').jsArg;   // der echte Helfer für Inline-Handler
const S = require(ROOT + '/js/schaubild.js');
const A = require(ROOT + '/js/assetmodell.js');
const W = require(ROOT + '/js/wissenmodell.js');

/* ── 1) Assets nach Bereichen ── */
const asset = (titel, kategorie, mehr) => A.amVon(Object.assign({ titel, kategorie }, mehr || {}));
const assets = [
  asset('ERP Werk', 'anwendung', { verfuegbarkeit: 'sehr hoch', werke: 'SHB' }),
  asset('Mail', 'Anwendung / Software', { verfuegbarkeit: 'hoch' }),
  asset('Altsystem', 'anwendung', { status: 'außer Betrieb' }),
  asset('Dateiserver', 'server'),
  asset('Ofensteuerung', 'ot', { werke: 'SHB, WGC' }),
  asset('Formanlage', 'ot', { werke: 'WGC' }),
  asset('Prüfprotokolle', 'information', { traeger: 'Papier; Ordner im Labor' }),
  asset('Kundendaten', 'information'),
  asset('Schichtleitung', 'personal'),
  asset('Ohne Kategorie', ''),
  asset('Eigenes', 'Kran'),
];
const d = S.sbBereicheDaten(assets, { key: (k) => A.amKategorieKey(k), rang: A.amRang });
ok(d.gesamt === 10 && d.ohneKategorie === 2, 'Außer Betrieb zählt nicht, ohne passende Kategorie wird gezählt, aber nicht verteilt');
ok(d.je.anwendung.n === 2 && d.je.anwendung.beispiele.join() === 'ERP Werk,Mail', 'Die Beschriftung der Kategorie zählt wie ihr Schlüssel, das Verfügbarste steht vorn');
ok(d.je.ot.n === 2 && d.je.ot.werke.join() === 'SHB,WGC', 'Die Werke der Steuerungen kommen aus dem Register');
ok(d.papier === 1 && d.je.information.n === 2 && d.je.personal.n === 1 && d.je.cloud.n === 0, 'Papier erkennt das Bild am Träger');
ok(S.sbBereicheDaten(null).gesamt === 0, 'Ohne Register bleibt alles null');
ok(S.sbBereicheDaten([asset('Browser', 'server', { verfuegbarkeit: 'sehr hoch' }), asset('Zeitwirtschaft (ERP)', 'server', { verfuegbarkeit: 'sehr hoch' }), asset('Altes ERP', 'server')], { rang: A.amRang }).je.server.beispiele.join() === 'Zeitwirtschaft (ERP),Browser,Altes ERP',
  'Bei gleicher Verfügbarkeit steht ein ERP vorn, die Verfügbarkeit geht vor');
// Ein Register mit einer gemischten Gruppe, wie sie im Haus vorkommt
const gemischt = [
  asset('ERP Alt', 'Hardware / Software', { verfuegbarkeit: 'sehr hoch' }),
  asset('ERP Neu mit sehr langem Namen', 'Hardware / Software', { verfuegbarkeit: 'sehr hoch' }),
  asset('Drucker', 'Hardware / Software'),
  asset('Scanner', 'Hardware'),
  asset('Dateiserver', 'server'),
  asset('Ablauf', 'Prozess'),
];
const g = S.sbBereicheDaten(gemischt, { key: (k) => A.amKategorieKey(k), rang: A.amRang });
ok(g.je.itGemischt.n === 4 && g.je.itGemischt.name === 'Hardware / Software' && g.ohneKategorie === 1, 'Eine gemischte Gruppe „Hardware / Software“ zählt zur IT-Sicherheit, unter dem Namen, den das Register am häufigsten führt');
const gs = S.sbBereicheSvg(g, { klick: true });
ok(/Hardware \/ Software · 4/.test(gs) && /Server, Datenbanken · 1/.test(gs) && !/Anwendungen · 0/.test(gs) && !/Netze · 0/.test(gs), 'In der IT-Sicherheit stehen nur die Kategorien, die es gibt, kein irreführendes „Anwendungen · 0“');
ok(/sbAssetsZeigen\(&quot;Hardware \/ Software&quot;\)/.test(gs), 'Der Klick filtert auf die Gruppe des Registers');
ok(/>z\. B\. ERP Alt, Drucker</.test(gs) && !/…</.test(gs.split('IT-Sicherheit')[1]), 'Beispiele nur mit ganzen Namen: ein zu langer wird übersprungen');
ok(/Anwendungen · 0/.test(S.sbBereicheSvg(S.sbBereicheDaten([asset('Nur Papier', 'information')]))), 'Gibt es gar keine IT, stehen alle vier mit „· 0“ da');

/* ── 2) Das Bild der Bereiche ── */
const ohne = S.sbBereicheSvg(null);
ok(/^<svg class="sb-svg"/.test(ohne) && /Cybersicherheit/.test(ohne) && /IT-Sicherheit/.test(ohne) && /Informations-/.test(ohne), 'Ohne Zahlen: die drei Flächen mit Namen');
ok(!/ · \d/.test(ohne) && !/sbAssetsZeigen/.test(ohne), 'Ohne Zahlen keine Zahl und kein Klick');
const mit = S.sbBereicheSvg(d, { klick: true });
ok(/Anwendungen · 2/.test(mit) && /Steuerungen und Maschinen · 2/.test(mit) && /SHB · WGC/.test(mit) && /z\. B\. ERP Werk, Mail/.test(mit), 'Mit Zahlen: je Kategorie die Zahl, Beispiele und Werke');
ok(/noch nicht im Register/.test(mit) && /class="sb-klein sb-blass sb-leer"/.test(mit), 'Was fehlt, steht als „noch nicht im Register“ da');
ok(/onclick="sbAssetsZeigen\(&quot;anwendung&quot;\)"/.test(mit) && /<title>Im Assetregister zeigen<\/title>/.test(mit), 'Ein Klick öffnet das Assetregister mit der Kategorie');
ok(!/sbAssetsZeigen/.test(S.sbBereicheSvg(d, { klick: false })), 'Ohne Leserecht auf das Register kein Klick');
const boese = S.sbBereicheSvg(S.sbBereicheDaten([asset('<script>x</script>', 'anwendung')], { key: (k) => A.amKategorieKey(k) }));
ok(!/<script>/.test(boese) && /&lt;script&gt;/.test(boese), 'Namen aus dem Register werden entschärft');

/* ── 3) Risiken in den Worten des Bildes ── */
const r = (e, a, mehr) => Object.assign({ brutto: { e: 5, a: 5 }, netto: { e, a }, status: 'offen', behandlung: '' }, mehr || {});
const risiken = [
  r(5, 4),                                                                   // hoch, ohne Entscheidung
  r(5, 4, { behandlung: 'mitigieren', massnahmen: [{ titel: 'M' }] }),       // hoch, geplant
  r(5, 4, { behandlung: 'mitigieren', massnahmen: [] }),                     // hoch, Behandlung ohne Maßnahme: ohne Entscheidung
  r(4, 4, { status: 'in Behandlung', behandlung: 'mitigieren' }),            // hoch, in Behandlung
  r(3, 5, { behandlung: 'akzeptieren', behandlungBegruendung: 'GF-Beschluss' }), // hoch, getragen
  r(3, 5, { behandlung: 'akzeptieren' }),                                    // akzeptiert ohne Begründung: offen
  r(2, 4),                                                                   // mittel
  r(1, 2, { brutto: { e: 1, a: 2 } }),                                       // niedrig, nicht gesenkt
  r(0, 0, { brutto: { e: 0, a: 0 } }),                                       // ohne Bewertung
  r(5, 5, { status: 'geschlossen' }),                                        // zählt nicht
];
const z = S.sbRisikoDaten(risiken);
ok(z.gesamt === 9 && z.hoch === 6 && z.mittel === 1 && z.niedrig === 1 && z.ohneBewertung === 1, 'Stufen wie im Risiko-Register, Geschlossenes zählt nicht');
ok(z.inBehandlung === 1 && z.getragen === 1 && z.geplant === 1 && z.hochGeplant === 1, 'Getragen heißt: akzeptiert und begründet; geplant: offen, aber mit Behandlung und Maßnahme');
ok(z.hochOhne === 3 && z.ohneEntscheidung === 6, 'Ohne Entscheidung: keine Behandlung, eine Behandlung ohne Maßnahme oder akzeptiert ohne Begründung');
ok(z.gesenkt === 7, 'Gesenkt heißt: netto unter brutto');
const risiko = lies('js/risiken.js');
ok(S.SB_HOCH === 15 && S.SB_MITTEL === 8 && /if \(score >= 15\) return 'hoch';/.test(risiko) && /if \(score >= 8\) return 'mittel';/.test(risiko), 'Die Stufen sind dieselben wie im Risiko-Register');

/* ── 4) Die Kurve ── */
const o = S.sbOptimum();
ok(o.t > 0.38 && o.t < 0.93, 'Der günstigste Punkt liegt im Bereich Risikomanagement');
const k0 = S.sbKurveSvg(null);
ok(/Fahrlässig/.test(k0) && /Risikomanagement/.test(k0) && /Um jeden Preis/.test(k0) && /legt die Geschäftsführung fest/.test(k0) && !/Bei uns/.test(k0), 'Ohne Register: das Prinzip, keine Zahlen');
const k1 = S.sbKurveSvg(z);
ok(/Bei uns: 3 hohe Risiken ohne Entscheidung/.test(k1) && /Bei uns: 1 in Behandlung, 1 geplant, 1 bewusst getragen/.test(k1) && /sb-marke-rot/.test(k1), 'Mit Register: hohe Risiken ohne Entscheidung links, Behandlung in der Mitte');
const plan = (e, a) => r(e, a, { behandlung: 'mitigieren', massnahmen: [{ titel: 'M' }] });
ok(/Bei uns: 2 hohe Risiken mit Plan/.test(S.sbKurveSvg(S.sbRisikoDaten([plan(5, 4), plan(4, 4)]))) && /sb-marke-orange/.test(S.sbKurveSvg(S.sbRisikoDaten([plan(5, 4)]))), 'Hohe Risiken mit Plan stehen orange links, nicht als „ohne Entscheidung“');
ok(/kein hohes Risiko offen/.test(S.sbKurveSvg(S.sbRisikoDaten([r(1, 1)]))) && /1 hohes Risiko ohne Entscheidung/.test(S.sbKurveSvg(S.sbRisikoDaten([r(5, 5)]))), 'Kein offenes hohes Risiko ist eine grüne Marke, eins steht in der Einzahl');
ok(!/NaN|undefined/.test(k0 + k1 + mit + ohne), 'Keine kaputten Zahlen im Bild');

/* ── 5) Bild und Zeile darunter ── */
ok(/Aus dem Risiko-Register: 9 Risiken offen oder in Behandlung, davon 6 hoch, 1 mittel, 1 niedrig, 1 ohne Bewertung.*Ohne Entscheidung: 6./.test(S.sbHtml('risikokurve', risiken, { klick: true })) && /sbRisikenZeigen\(\)/.test(S.sbHtml('risikokurve', risiken, { klick: true })), 'Unter der Kurve: woher die Zahlen kommen, und der Weg ins Register');
ok(/Mit Zugriff auf das Risiko-Register/.test(S.sbHtml('risikokurve', null)) && /Mit Zugriff auf das Assetregister/.test(S.sbHtml('bereiche', null)), 'Ohne Zugriff sagt die Zeile, was fehlt');
ok(/gibt es nicht/.test(S.sbHtml('unsinn', null)), 'Ein unbekanntes Bild sagt das');

/* ── 5b) Hauptrisiken, Maßnahmen, Aufgaben der Geschäftsführung ── */
const heute = { heute: '2026-11-27' };
const reg = [
  { id: '1', titel: 'Veraltete Systeme: Altbetriebssystem und Großrechner', brutto: { e: 4, a: 4 }, netto: { e: 0, a: 0 }, status: 'in Behandlung', massnahmen: [
    { titel: 'Bestand erheben', status: 'in Umsetzung', frist: '2026-10-31', verantwortlich: 'isb@firma.example' },
    { titel: 'Ablösung planen', status: 'erledigt', frist: '2026-09-30', verantwortlich: 'isb@firma.example' },
    { titel: 'Netz trennen', status: 'offen', frist: '2026-12-15', verantwortlich: 'IT' }] },
  { id: '2', titel: 'Rolle nicht ausgestattet', brutto: { e: 4, a: 4 }, status: 'offen', massnahmen: [
    { titel: 'Zeitbudget festlegen', status: 'offen', frist: '2026-10-31', verantwortlich: 'Geschäftsführung' },
    { titel: 'Bestellung schriftlich bestätigen', status: 'offen', frist: '2027-01-31', verantwortlich: 'GF' }] },
  { id: '3', titel: 'Mittleres Risiko', brutto: { e: 2, a: 4 }, status: 'offen', massnahmen: [{ titel: 'Etwas tun', status: 'offen', frist: '', verantwortlich: '' },
    { titel: 'Richtungsentscheidung der GL einholen', status: 'in Umsetzung', frist: '2027-02-01', verantwortlich: 'isb@firma.example' },
    { titel: 'Gläubiger informieren', status: 'offen', frist: '', verantwortlich: 'Buchhaltung' }] },
  { id: '4', titel: 'Hoch ohne Maßnahme', brutto: { e: 5, a: 5 }, status: 'offen', massnahmen: [] },
  { id: '5', titel: 'Geschlossen', brutto: { e: 5, a: 5 }, status: 'geschlossen', massnahmen: [{ titel: 'Alt', status: 'offen', frist: '2020-01-01', verantwortlich: 'GF' }] },
];
const hr = S.sbHauptrisiken(reg, heute);
ok(hr.map(r => r.id).join() === '4,2,1' && hr[2].kurz === 'Veraltete Systeme' && hr[2].rest === 'Altbetriebssystem und Großrechner', 'Hohe Risiken, das schwerste zuerst, bei Gleichstand nach Namen; der Titel wird am Doppelpunkt in Kurztitel und Einzelheiten geteilt');
ok(hr[2].massnahmen === 3 && hr[2].erledigt === 1 && hr[2].ueberfaellig === 1 && hr[0].massnahmen === 0, 'Je Risiko: Maßnahmen, erledigt, über der Frist');
const st = S.sbMassnahmenStand(reg, heute);
ok(st.gesamt === 8 && st.erledigt === 1 && st.inUmsetzung === 2 && st.offen === 5, 'Gezählt werden nur Maßnahmen offener Risiken');
ok(st.ueberfaellig.map(x => x.titel).join() === 'Bestand erheben,Zeitbudget festlegen' && st.bald.map(x => x.titel).join() === 'Netz trennen', 'Über der Frist und in den nächsten 30 Tagen fällig');
ok(st.gf.map(x => x.titel).join() === 'Zeitbudget festlegen,Bestellung schriftlich bestätigen,Richtungsentscheidung der GL einholen', 'Bei der Geschäftsführung: als Verantwortliche („Geschäftsführung“, „GF“) oder im Titel („der GL“); nicht „Geschlossen“, nicht „Gläubiger“');
const hh = S.sbHtml('hauptrisiken', reg, Object.assign({ klick: true }, heute));
ok(/<b>Veraltete Systeme<\/b><small>Altbetriebssystem und Großrechner<\/small>/.test(hh) && /1 von 3 erledigt/.test(hh) && /1 überfällig/.test(hh) && /keine Maßnahme/.test(hh) && /sbRisikenZeigen/.test(hh), 'Die Tabelle der Hauptrisiken mit Fortschritt, Fristen und dem Weg ins Register');
const mh = S.sbHtml('massnahmen', reg, heute);
ok(/<b>1<\/b><span>erledigt/.test(mh) && /<b>2<\/b><span>über der Frist/.test(mh) && /31\.10\.2026/.test(mh) && /Isb · |Isb</.test(mh) && /Stand 27\.11\.2026/.test(mh), 'Der Stand der Maßnahmen: Kacheln, was über der Frist ist, mit Datum und Verantwortlichen');
ok(/Zeitbudget festlegen/.test(S.sbHtml('gf', reg, heute)) && /keine offene Maßnahme bei der Geschäftsführung/.test(S.sbHtml('gf', [], heute)), 'Die Aufgaben der Geschäftsführung, und ein Satz, wenn es keine gibt');
ok(/Mit Zugriff auf das Risiko-Register/.test(S.sbHtml('hauptrisiken', null)), 'Ohne Leserecht kein Inhalt aus dem Register');
ok(!/<script>/.test(S.sbHtml('massnahmen', [{ id: 'x', titel: '<script>', brutto: { e: 5, a: 5 }, massnahmen: [{ titel: '<script>', status: 'offen', frist: '2020-01-01' }] }], heute)), 'Texte aus dem Register werden entschärft');

/* ── 6) In der Bibliothek ── */
ok(W.WI_ARTEN.some(a => a.key === 'schaubild') && W.WI_SCHAUBILDER.map(s => s.key).join() === 'bereiche,risikokurve,hauptrisiken,massnahmen,gf', 'Die Bibliothek kennt die Art und alle fünf Bausteine');
ok(W.wiBeitragFehler({ art: 'schaubild', titel: 'x', bild: '' }).some(f => /Welches Schaubild/.test(f)) && W.wiBeitragFehler({ art: 'schaubild', titel: 'x', bild: 'bereiche' }).length === 0, 'Ohne gewähltes Bild lässt sich nichts speichern');
ok(W.wiNormalisieren({ beitraege: [{ id: 's', art: 'schaubild', titel: 'x', bild: 'risikokurve' }] }).beitraege[0].bild === 'risikokurve', 'Das gewählte Bild bleibt beim Normalisieren');
const start = W.WI_STARTBESTAND.beitraege.filter(b => b.art === 'schaubild');
ok(start.length === 2 && start.every(b => b.thema === 'grundlagen' && W.wiBeitragFehler(b).length === 0) && W.WI_STARTBESTAND.themen.some(t => t.id === 'grundlagen'), 'Der Startbestand bringt beide unter „Sicherheit verstehen“ mit');
ok(start.every(b => !/[–—]/.test(b.text + b.kurz + b.titel)), 'Keine Gedankenstriche in den Texten');
const wissen = lies('js/wissen.js');
ok(/b\.art === 'schaubild' && typeof sbZeichnen === 'function'\) sbZeichnen\(b, \(\) => _wiOffen === b\.id\)/.test(wissen) && /id="sb-bild"/.test(wissen), 'Der Reiter zeichnet das Bild sofort und mit Zahlen nach');
ok(/WI_SCHAUBILDER\.map/.test(wissen) && /sbCacheLeeren/.test(wissen), 'Der Pflege-Dialog bietet die Bilder an, Aktualisieren lädt die Register neu');
ok(/wissen:\s+\['wissenmodell', 'schaubild', 'folien', 'wissen'\]/.test(lies('js/module.js')), 'Das Modul lädt mit dem Reiter Wissen');
const eigen = lies('js/schaubild.js');
ok(/_sbDarf\('assets'\)/.test(eigen) && /_sbDarf\('risiken'\)/.test(eigen) && /canReadTab\(view\)/.test(eigen), 'Zahlen nur mit Leserecht auf das Register');
ok(/geltungSichtbar\(a\.werke\)/.test(eigen), 'Mit der Trennung nach Gesellschaft zählt nur, was die Person im Register sähe');
ok(/Object\.assign\(_amFilter, \{ q: '', werk: '', kategorie: kat/.test(eigen) && /\(aus der Liste\)<\/option>` : ''\}/.test(lies('js/assets.js')), 'Der Klick setzt nur die Kategorie, das Register zeigt auch eine Gruppe aus der Liste als Filter');
ok(/modulLaden\('assetmodell'\)/.test(eigen) && /spGetRisksLeise/.test(eigen) && /async function spGetRisksLeise/.test(lies('js/sharepoint.js')), 'Das Assetmodell kommt erst bei Bedarf, die Risikoliste wird nie angelegt');
ok(!/localStorage|sessionStorage/.test(eigen), 'Nichts landet im Browserspeicher');
ok(!/@[a-z0-9-]+\.(com|de)\b/i.test(eigen) && !/Fedorov|Lissitsa|Friedland|Dihag|DIHAG|SAP|Timeline/.test(eigen), 'Im Code stehen keine Namen und keine Systeme aus dem Haus');
ok(/\.sb-svg\b/.test(lies('css/style.css')) && /<b>📊 Schaubild:<\/b>/.test(lies('js/dokumentation.js')), 'Gestaltet und dokumentiert');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
