/**
 * BPMN-Anleitung als Word-Datei
 *
 * Die Datei geht an Leute ohne RMS. Wer darin einen Fehler findet, kann ihn
 * nirgends nachschlagen. Deshalb prüft diese Suite, was sonst erst beim Öffnen
 * in Word auffiele:
 *
 *   • Der Spickzettel stimmt: Aus seinen Zeilen baut der echte Generator genau
 *     die Elemente, die rechts daneben stehen.
 *   • Jedes Zeichen der Anleitung hat ein Bild, und jede Schreibweise in Teil 3
 *     ist eine Zeile aus dem geprüften Vertiefungsbeispiel.
 *   • Das ZIP ist vollständig: Jeder Teil hat seinen Inhaltstyp, jedes Bild
 *     seinen Bezug, jedes XML ist geschlossen.
 *   • Kein Emoji im Text, denn Word zeigt sie nicht überall.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* Alle vier Dateien in einen Sandkasten, wie im Browser nebeneinander geladen. */
const ctx = { console, TextEncoder, TextDecoder, Uint8Array, Uint32Array,
  esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['js/prozessschema.js', 'js/bpmndeutsch.js', 'js/bpmnhilfe.js', 'js/bpmnanleitung.js']) vm.runInContext(lies(f), ctx, { filename: f });
const G = (name) => vm.runInContext(name, ctx);

const inhalt = G('bpmnAnleitungInhalt');
const docx = G('bpmnAnleitungDocx');
const S = { lesen: G('prozessTextLesen'), bauen: G('prozessXmlBauen'), pruefen: G('prozessSchemaPruefen') };

/* ── 1) Ansprechpartner ── */
const mit = inhalt({ kontakt: { name: 'Max Muster', mail: 'pruefer@dihag.com' }, datum: '05.10.2026' });
const ohne = inhalt({});
const text = (bl) => JSON.stringify(bl);
ok(/Max Muster \(pruefer@dihag\.com\)/.test(text(mit)) && /Stand 05\.10\.2026/.test(text(mit)),
  'Wer die Datei erzeugt, steht als Ansprechpartner darin, mit Datum');
ok((text(mit).match(/pruefer@dihag\.com/g) || []).length >= 3,
  'und zwar oben, im Vorgehen und in der Vorlage, wohin sie zurückgeht');
ok(!/undefined|null/.test(text(ohne)) && /an die Person schicken, die Sie um die Beschreibung gebeten hat/.test(text(ohne)),
  'Ohne Anmeldung bleibt kein Loch: Dann heißt es „die Person, die Sie gebeten hat"');

/* ── 2) Der Spickzettel stimmt ── */
const zettel = G('BPMN_SPICKZETTEL');
const zettelText = zettel.map(z => z[0]).join('\n');
const xml = S.bauen({ name: 'Spickzettel', schritte: S.lesen(zettelText) }).xml;
const erwartet = [
  ['startEvent', 'Antrag geht ein'], ['userTask', 'Angebote einholen'], ['exclusiveGateway', 'Antrag freigeben?'],
  ['userTask', 'Antrag zurückgeben'], ['serviceTask', 'Bestätigung versenden'], ['manualTask', 'Probe entnehmen'],
  ['callActivity', 'Ursache analysieren'], ['intermediateCatchEvent', 'Rückmeldung des Werks'], ['endEvent', 'Antrag genehmigt'],
];
for (const [typ, name] of erwartet) {
  ok(new RegExp(`<bpmn:${typ} id="[^"]+" name="${name.replace('?', '\\?')}"`).test(xml), `Spickzettel: „${name}" wird ${typ}`);
}
ok(/<bpmn:lane id="Lane_\d+" name="Einkauf">\s*<bpmn:flowNodeRef>StartEvent_1<\/bpmn:flowNodeRef>\s*<bpmn:flowNodeRef>UserTask_2/.test(xml),
  'und „Einkauf: Angebote einholen" liegt in der Bahn „Einkauf", wie es dort steht');
const befund = S.pruefen(xml, { policyIds: ['1'] });
ok(befund.fehler.map(f => f.regel).join() === 'R10' && befund.hinweise.length === 0,
  'Die Prüfung findet daran nur R10, das eingebundene Modell wählt erst das RMS');

/* ── 3) Zeichen und Schreibweisen ── */
const arten = G('BPMN_ZEICHEN.concat(BPMN_ZEICHEN_MEHR).map(z => z.art)');
const gezeichnet = Object.keys(G('_baZeichenXml()').lage).concat(Object.keys(G('_baBahnXml()').lage));
ok(arten.every(a => gezeichnet.includes(a)) && arten.length === 10, 'Alle zehn Zeichen bekommen ein Bild');
const bildSchluessel = new Set();
JSON.stringify(mit, (k, v) => { if (k === 'bild') bildSchluessel.add(v); return v; });
const verfuegbar = new Set(gezeichnet.map(a => 'zeichen-' + a).concat(['beispiel-einstieg', 'beispiel-vertiefung']));
ok([...bildSchluessel].every(s => verfuegbar.has(s)), 'Jedes Bild, das die Anleitung zeigt, wird auch gezeichnet');

const vertiefung = G('BPMN_BEISPIEL_VERTIEFUNG').split('\n');
const codes = [];
const teil3 = mit.find(b => b.art === 'tabelle' && b.kopf.includes('So schreiben Sie es'));
teil3.zeilen.forEach(z => { if (z[3] && z[3].code) codes.push(z[3].code); });
ok(codes.length === 4 && codes.every(c => vertiefung.includes(c)),
  'Jede Schreibweise in Teil 3 ist eine Zeile aus dem geprüften Vertiefungsbeispiel');
const beispiele = mit.filter(b => b.art === 'code').map(b => b.zeilen.join('\n'));
ok(beispiele.includes(G('BPMN_BEISPIEL_EINSTIEG')) && beispiele.includes(G('BPMN_BEISPIEL_VERTIEFUNG')),
  'Beide Beispiele stehen wörtlich darin, dieselben wie in der Anleitung im RMS');

/* Die Zeichen-Blätter sind gültiges BPMN mit Lage für jedes Element. */
const blatt = G('_baZeichenXml()');
ok(Object.entries(blatt.lage).every(([a]) => new RegExp(`bpmnElement="Zeichen_${a}"`).test(blatt.xml)),
  'Jedes Zeichen auf dem Blatt hat eine Form im Diagramm');

/* ── 4) Das ZIP ── */
function entpacken(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let ende = bytes.length - 22;
  while (ende >= 0 && dv.getUint32(ende, true) !== 0x06054b50) ende--;
  const anzahl = dv.getUint16(ende + 10, true);
  let p = dv.getUint32(ende + 16, true);
  const teile = {};
  for (let i = 0; i < anzahl; i++) {
    const laenge = dv.getUint32(p + 20, true), nameL = dv.getUint16(p + 28, true);
    const extraL = dv.getUint16(p + 30, true), komL = dv.getUint16(p + 32, true), lokal = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameL));
    const start = lokal + 30 + dv.getUint16(lokal + 26, true) + dv.getUint16(lokal + 28, true);
    teile[name] = bytes.subarray(start, start + laenge);
    p += 46 + nameL + extraL + komL;
  }
  return teile;
}
const geschlossen = (x) => {
  const stapel = [];
  for (const m of x.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stapel.push(m[2]);
    else if (stapel.pop() !== m[2]) return false;
  }
  return stapel.length === 0;
};

// Ein winziges, gültiges PNG genügt als Bild.
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const bilder = Object.fromEntries([...verfuegbar].map(k => [k, { bytes: png, breite: k.startsWith('beispiel') ? 1600 : 112, hoehe: 92, alt: k }]));
const datei = docx(mit, bilder, { autor: 'Max Muster', zeit: '2026-10-05T10:00:00Z' });
const teile = entpacken(datei);
const t = (n) => new TextDecoder().decode(teile[n]);

for (const n of ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/document.xml', 'word/styles.xml', 'word/settings.xml', 'word/footer1.xml', 'word/_rels/document.xml.rels']) {
  ok(teile[n] && geschlossen(t(n)), `${n} ist da und sauber geschlossen`);
}
const typen = t('[Content_Types].xml');
ok(['document', 'styles', 'settings', 'footer1'].every(n => typen.includes(`PartName="/word/${n}.xml"`)) && /Extension="png"/.test(typen),
  'Jeder Teil hat seinen Inhaltstyp, PNG eingeschlossen');
const dok = t('word/document.xml'), bez = t('word/_rels/document.xml.rels');
const eingebettet = [...new Set([...dok.matchAll(/r:embed="([^"]+)"/g)].map(m => m[1]))];
ok(eingebettet.length === verfuegbar.size && eingebettet.every(r => new RegExp(`Id="${r}"[^>]*Target="media/bild\\d+\\.png"`).test(bez)
  && teile['word/' + bez.match(new RegExp(`Id="${r}"[^>]*Target="([^"]+)"`))[1]]),
  `Jedes der ${verfuegbar.size} Bilder liegt einmal im Paket und hat seinen Bezug, auch wenn es mehrfach vorkommt`);
const ids = [...dok.matchAll(/<wp:docPr id="(\d+)"/g)].map(m => m[1]);
ok(ids.length > verfuegbar.size && new Set(ids).size === ids.length, `Jede der ${ids.length} Bildstellen hat eine eigene Kennung`);
ok(/<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/.test(dok) && (dok.match(/<w:sectPr>/g) || []).length === 3,
  'Das breite Diagramm steht auf einer eigenen Querseite');
ok(/<w:compatSetting w:name="compatibilityMode"[^>]*w:val="15"\/>/.test(t('word/settings.xml')),
  'Word öffnet die Datei ohne Kompatibilitätsmodus');
ok(/<dc:title>Abläufe beschreiben mit BPMN<\/dc:title>/.test(t('docProps/core.xml')), 'Der Titel steht in den Eigenschaften');
ok(/w:instr=" PAGE "/.test(t('word/footer1.xml')) && /w:instr=" NUMPAGES "/.test(t('word/footer1.xml')), 'Die Fußzeile zählt die Seiten');

const nurText = [...dok.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join(' ');
ok(!/\p{Extended_Pictographic}/u.test(nurText), 'Kein Emoji im Text, die Zeichen kommen als Bild');
ok(/Antrag im Portal erfassen/.test(nurText) && /Vorlage: Ihr Ablauf/.test(nurText), 'Text und Vorlage stehen im Dokument');

ok(Buffer.compare(Buffer.from(datei), Buffer.from(docx(mit, bilder, { autor: 'Max Muster', zeit: '2026-10-05T10:00:00Z' }))) === 0,
  'Gleiche Eingabe, gleiche Bytes');

/* Ohne Bilder: kein Verweis ins Leere. */
const karg = entpacken(docx(mit, {}, {}));
const kargDok = new TextDecoder().decode(karg['word/document.xml']);
ok(!/r:embed/.test(kargDok) && !/quer auf|in Teil 1 entstanden|Querseite/.test(kargDok) && !/landscape/.test(kargDok),
  'Ohne Bilder fehlen auch die Sätze, die auf ein Bild zeigen, und die Querseite');
ok(/>Auslöser</.test(kargDok), 'In der Zeichen-Tabelle steht dann der Name an Stelle des Bildes');

/* ── 5) Erreichbar und sauber geschrieben ── */
ok(/onclick="bpmnAnleitungHerunterladen\(\)"/.test(lies('js/bpmnhilfe.js')) && /onclick="bpmnAnleitungHerunterladen\(\)"/.test(lies('js/dokumentation.js')),
  'Der Knopf steht im Modeler-Dialog und in der Dokumentation');
const modul = lies('js/module.js');
for (const gruppe of ['prozesse', 'notfall', 'dokumentation']) {
  const zeile = (modul.match(new RegExp(`^\\s*${gruppe}:.*$`, 'm')) || [''])[0];
  ok(/'bpmnanleitung'/.test(zeile), `Die Ansicht „${gruppe}" lädt die Word-Fassung`);
}
const quelle = lies('js/bpmnanleitung.js');
const striche = (quelle.match(/\s[–—]\s/g) || []).length;
ok(striche === 0, `Keine Gedankenstriche (${striche} gefunden)`);

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
