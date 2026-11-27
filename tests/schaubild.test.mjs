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
  r(5, 4),                                                                   // hoch, offen
  r(4, 4, { status: 'in Behandlung', behandlung: 'mitigieren' }),            // hoch, in Behandlung
  r(3, 5, { behandlung: 'akzeptieren', behandlungBegruendung: 'GF-Beschluss' }), // hoch, getragen
  r(3, 5, { behandlung: 'akzeptieren' }),                                    // akzeptiert ohne Begründung: offen
  r(2, 4),                                                                   // mittel
  r(1, 2, { brutto: { e: 1, a: 2 } }),                                       // niedrig, nicht gesenkt
  r(0, 0, { brutto: { e: 0, a: 0 } }),                                       // ohne Bewertung
  r(5, 5, { status: 'geschlossen' }),                                        // zählt nicht
];
const z = S.sbRisikoDaten(risiken);
ok(z.gesamt === 7 && z.hoch === 4 && z.mittel === 1 && z.niedrig === 1 && z.ohneBewertung === 1, 'Stufen wie im Risiko-Register, Geschlossenes zählt nicht');
ok(z.hochOffen === 2 && z.inBehandlung === 1 && z.getragen === 1, 'Getragen heißt: akzeptiert und begründet; ohne Begründung bleibt ein hohes Risiko offen');
ok(z.gesenkt === 5, 'Gesenkt heißt: netto unter brutto');
const risiko = lies('js/risiken.js');
ok(S.SB_HOCH === 15 && S.SB_MITTEL === 8 && /if \(score >= 15\) return 'hoch';/.test(risiko) && /if \(score >= 8\) return 'mittel';/.test(risiko), 'Die Stufen sind dieselben wie im Risiko-Register');

/* ── 4) Die Kurve ── */
const o = S.sbOptimum();
ok(o.t > 0.38 && o.t < 0.93, 'Der günstigste Punkt liegt im Bereich Risikomanagement');
const k0 = S.sbKurveSvg(null);
ok(/Fahrlässig/.test(k0) && /Risikomanagement/.test(k0) && /Um jeden Preis/.test(k0) && /legt die Geschäftsführung fest/.test(k0) && !/Bei uns/.test(k0), 'Ohne Register: das Prinzip, keine Zahlen');
const k1 = S.sbKurveSvg(z);
ok(/Bei uns: 2 hohe Risiken noch offen/.test(k1) && /Bei uns: 1 in Behandlung, 1 bewusst getragen/.test(k1) && /sb-marke-rot/.test(k1), 'Mit Register: offene hohe Risiken links, Behandlung in der Mitte');
ok(/kein hohes Risiko offen/.test(S.sbKurveSvg(S.sbRisikoDaten([r(1, 1)]))) && /1 hohes Risiko noch offen/.test(S.sbKurveSvg(S.sbRisikoDaten([r(5, 5)]))), 'Kein offenes hohes Risiko ist eine grüne Marke, eins steht in der Einzahl');
ok(!/NaN|undefined/.test(k0 + k1 + mit + ohne), 'Keine kaputten Zahlen im Bild');

/* ── 5) Bild und Zeile darunter ── */
ok(/Aus dem Risiko-Register: 7 Risiken offen oder in Behandlung, davon 4 hoch, 1 mittel, 1 niedrig, 1 ohne Bewertung/.test(S.sbHtml('risikokurve', risiken, { klick: true })) && /sbRisikenZeigen\(\)/.test(S.sbHtml('risikokurve', risiken, { klick: true })), 'Unter der Kurve: woher die Zahlen kommen, und der Weg ins Register');
ok(/Mit Zugriff auf das Risiko-Register/.test(S.sbHtml('risikokurve', null)) && /Mit Zugriff auf das Assetregister/.test(S.sbHtml('bereiche', null)), 'Ohne Zugriff sagt die Zeile, was fehlt');
ok(/gibt es nicht/.test(S.sbHtml('unsinn', null)), 'Ein unbekanntes Bild sagt das');

/* ── 6) In der Bibliothek ── */
ok(W.WI_ARTEN.some(a => a.key === 'schaubild') && W.WI_SCHAUBILDER.map(s => s.key).join() === 'bereiche,risikokurve', 'Die Bibliothek kennt die Art und beide Bilder');
ok(W.wiBeitragFehler({ art: 'schaubild', titel: 'x', bild: '' }).some(f => /Welches Schaubild/.test(f)) && W.wiBeitragFehler({ art: 'schaubild', titel: 'x', bild: 'bereiche' }).length === 0, 'Ohne gewähltes Bild lässt sich nichts speichern');
ok(W.wiNormalisieren({ beitraege: [{ id: 's', art: 'schaubild', titel: 'x', bild: 'risikokurve' }] }).beitraege[0].bild === 'risikokurve', 'Das gewählte Bild bleibt beim Normalisieren');
const start = W.WI_STARTBESTAND.beitraege.filter(b => b.art === 'schaubild');
ok(start.length === 2 && start.every(b => b.thema === 'grundlagen' && W.wiBeitragFehler(b).length === 0) && W.WI_STARTBESTAND.themen.some(t => t.id === 'grundlagen'), 'Der Startbestand bringt beide unter „Sicherheit verstehen“ mit');
ok(start.every(b => !/[–—]/.test(b.text + b.kurz + b.titel)), 'Keine Gedankenstriche in den Texten');
const wissen = lies('js/wissen.js');
ok(/b\.art === 'schaubild' && typeof sbZeichnen === 'function'\) sbZeichnen\(b, \(\) => _wiOffen === b\.id\)/.test(wissen) && /id="sb-bild"/.test(wissen), 'Der Reiter zeichnet das Bild sofort und mit Zahlen nach');
ok(/WI_SCHAUBILDER\.map/.test(wissen) && /sbCacheLeeren/.test(wissen), 'Der Pflege-Dialog bietet die Bilder an, Aktualisieren lädt die Register neu');
ok(/wissen:\s+\['wissenmodell', 'schaubild', 'wissen'\]/.test(lies('js/module.js')), 'Das Modul lädt mit dem Reiter Wissen');
const eigen = lies('js/schaubild.js');
ok(/_sbDarf\('assets'\)/.test(eigen) && /_sbDarf\('risiken'\)/.test(eigen) && /canReadTab\(view\)/.test(eigen), 'Zahlen nur mit Leserecht auf das Register');
ok(/modulLaden\('assetmodell'\)/.test(eigen) && /spGetRisksLeise/.test(eigen) && /async function spGetRisksLeise/.test(lies('js/sharepoint.js')), 'Das Assetmodell kommt erst bei Bedarf, die Risikoliste wird nie angelegt');
ok(!/localStorage|sessionStorage/.test(eigen), 'Nichts landet im Browserspeicher');
ok(!/@[a-z0-9-]+\.(com|de)\b/i.test(eigen) && !/Fedorov|Lissitsa|Friedland|Dihag|DIHAG|SAP|Timeline/.test(eigen), 'Im Code stehen keine Namen und keine Systeme aus dem Haus');
ok(/\.sb-svg\b/.test(lies('css/style.css')) && /<b>📊 Schaubild:<\/b>/.test(lies('js/dokumentation.js')), 'Gestaltet und dokumentiert');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
