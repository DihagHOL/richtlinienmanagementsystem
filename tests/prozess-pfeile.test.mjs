/**
 * Pfeile des Generators
 *
 * Das Diagramm aus „✨ Aus Richtlinie" ist für viele das erste, das sie sehen.
 * Bis Oktober 2026 lief dort der Ja-Pfeil einer Entscheidung senkrecht durch
 * den Nein-Zweig und endete im Leeren, sobald der nächste Schritt eine Bahn
 * tiefer lag. Und ein Pfeil in eine höhere Bahn begann an der Unterkante
 * seines Kastens und lief durch ihn hindurch. Die Prüfung gegen das Hausschema
 * sah davon nichts, sie liest die Struktur und nicht das Bild.
 *
 * Diese Suite liest das Bild: Jeder Pfeil beginnt am Rand seiner Quelle, endet
 * am Rand seines Ziels und kreuzt unterwegs keinen anderen Kasten.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

globalThis.esc = (s) => String(s ?? '');
const S = require(ROOT + '/js/prozessschema.js');
const H = require(ROOT + '/js/bpmnhilfe.js');

/** Formen, Pfeile und deren Quelle/Ziel aus dem XML; Namensräume und Zeilenumbrüche egal. */
function lesen(xml) {
  const typ = {};
  for (const m of xml.matchAll(/<(?:\w+:)?(\w+) id="([^"]+)"/g)) if (!typ[m[2]]) typ[m[2]] = m[1];
  const formen = {};
  for (const m of xml.matchAll(/<(?:\w+:)?BPMNShape\b[^>]*bpmnElement="([^"]+)"[^>]*>\s*<(?:\w+:)?Bounds x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    const [, id, x, y, b, h] = m;
    formen[id] = { id, typ: typ[id], x: +x, y: +y, b: +b, h: +h };
  }
  const fluesse = {};
  for (const m of xml.matchAll(/<(?:\w+:)?sequenceFlow id="([^"]+)"[^>]*sourceRef="([^"]+)" targetRef="([^"]+)"/g)) fluesse[m[1]] = { von: m[2], nach: m[3] };
  const pfeile = {}, kanten = {};
  for (const m of xml.matchAll(/<(?:\w+:)?BPMNEdge\b[^>]*bpmnElement="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?BPMNEdge>/g)) {
    kanten[m[1]] = m[0];
    pfeile[m[1]] = [...m[2].matchAll(/<(?:\w+:)?waypoint x="([\d.-]+)" y="([\d.-]+)"/g)].map(p => [+p[1], +p[2]]);
  }
  return { formen, fluesse, pfeile, kanten };
}

const aufRand = (p, f) => {
  const [x, y] = p, t = 1;
  const innenX = x >= f.x - t && x <= f.x + f.b + t, innenY = y >= f.y - t && y <= f.y + f.h + t;
  const aufX = Math.abs(x - f.x) <= t || Math.abs(x - (f.x + f.b)) <= t;
  const aufY = Math.abs(y - f.y) <= t || Math.abs(y - (f.y + f.h)) <= t;
  return (aufX && innenY) || (aufY && innenX);
};

/* Schneidet die waagerechte oder senkrechte Strecke a→b das Innere der Form? */
const durch = (a, b, f) => {
  const x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]);
  const y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]);
  return x2 > f.x + 1 && x1 < f.x + f.b - 1 && y2 > f.y + 1 && y1 < f.y + f.h - 1;
};

/** Alle Fehler im Bild eines Modells, je Pfeil. */
function befunde(xml) {
  const { formen, fluesse, pfeile } = lesen(xml);
  const knoten = Object.keys(formen).filter(id => !/^(Pool|Lane)_/.test(id));
  const fehler = [];
  for (const [id, f] of Object.entries(fluesse)) {
    const wp = pfeile[id];
    if (!wp || wp.length < 2) { fehler.push(id + ' ohne Verlauf'); continue; }
    if (!aufRand(wp[0], formen[f.von])) fehler.push(id + ' beginnt nicht am Rand von ' + f.von);
    if (!aufRand(wp[wp.length - 1], formen[f.nach])) fehler.push(id + ' endet nicht am Rand von ' + f.nach);
    // Am Rand beginnen reicht nicht: Von der Unterkante nach oben liefe er durch die eigene Mitte.
    const mitte = (k) => [formen[k].x + formen[k].b / 2, formen[k].y + formen[k].h / 2];
    const ueber = (a, b, p) => p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
      && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
    if (ueber(wp[0], wp[1], mitte(f.von))) fehler.push(id + ' läuft durch die eigene Quelle ' + f.von);
    if (ueber(wp[wp.length - 2], wp[wp.length - 1], mitte(f.nach))) fehler.push(id + ' läuft durch sein Ziel ' + f.nach);
    for (let i = 1; i < wp.length; i++) {
      for (const k of knoten) {
        // Der erste Abschnitt liegt an der Quelle, der letzte am Ziel; der Rest darf keine berühren.
        if ((k === f.von && i === 1) || (k === f.nach && i === wp.length - 1)) continue;
        if (durch(wp[i - 1], wp[i], formen[k])) fehler.push(id + ' läuft durch ' + k);
      }
    }
  }
  return fehler;
}

const bauen = (name, text) => S.prozessXmlBauen({ name, schritte: S.prozessTextLesen(text) }).xml;

function pruefen(name, text) {
  const xml = bauen(name, text);
  const fehler = befunde(xml);
  ok(fehler.length === 0, `${name}: ${Object.keys(lesen(xml).fluesse).length} Pfeile, jeder von Rand zu Rand und durch keinen Kasten` +
    (fehler.length ? ' (' + fehler.join('; ') + ')' : ''));
}

/* Die Beispiele der Anleitung: Ja-Zweig eine Bahn tiefer, Rücksprung nach oben. */
pruefen('Urlaubsantrag', H.BPMN_BEISPIEL_EINSTIEG);
pruefen('Reklamation', H.BPMN_BEISPIEL_VERTIEFUNG);

/* Entscheidung, deren Ja-Weg nach OBEN geht, und zwei Entscheidungen hintereinander. */
pruefen('Ja nach oben', `Start: Bestellung geht ein
Einkauf: Bestellung prüfen
Lager: Ware vorrätig? | nein: Ware nachbestellen
Einkauf: Bestellung bestätigen
Ende: Bestellung bestätigt`);
pruefen('Zwei Fragen', `Start: Antrag geht ein
Fachbereich: Antrag prüfen
Leitung: Budget frei? | nein: Antrag zurückstellen
Geschäftsführung: Betrag über 50.000 €? | nein: Antrag freigeben
Geschäftsführung: Antrag im Gremium vorlegen
Ende: Antrag entschieden`);
pruefen('Frage am Schluss', `Start: Prüfung fällig
Qualität: Probe nehmen (manuell)
System: Messwerte übertragen (automatisch)
Qualität: Grenzwert eingehalten? | nein: Sperrvermerk setzen`);

/* Der Auslöser hat Abstand zum Bahnkopf, seine Beschriftung liegt nicht auf dem Bahnnamen. */
const ein = lesen(S.prozessXmlBauen({ name: 'x', schritte: S.prozessTextLesen(H.BPMN_BEISPIEL_EINSTIEG) }).xml);
const start = ein.formen.StartEvent_1, bahn = ein.formen.Lane_1;
ok(start.x + start.b / 2 - 48 >= bahn.x + 30,
  'Die Beschriftung des Auslösers (96 Punkte breit) beginnt rechts vom Bahnkopf');

/* ══════════════════════════════════════════════════════════════════
   Gespeicherte Modelle: die Reparatur
   ══════════════════════════════════════════════════════════════════
   Was der alte Generator gespeichert hat, wird hier nachgebaut: dieselben
   Formen, die Pfeile nach seiner alten Regel. */
function altWeg(a, b) {
  const my = (k) => k.y + k.h / 2, mx = (k) => k.x + k.b / 2;
  if (a.typ === 'exclusiveGateway' && b.y > a.y + 60) return [[mx(a), a.y + a.h], [mx(a), b.y]];
  if (Math.abs(my(a) - my(b)) > 30) return [[mx(a), a.y + a.h], [mx(a), my(b)], [b.x, my(b)]];
  return [[a.x + a.b, my(a)], [b.x, my(b)]];
}
function wieFrueher(xml) {
  const { formen, fluesse } = lesen(xml);
  return xml.replace(/(<bpmndi:BPMNEdge id="[^"]+" bpmnElement="([^"]+)">)([\s\S]*?)(<\/bpmndi:BPMNEdge>)/g, (g, auf, id, innen, zu) => {
    const f = fluesse[id];
    return auf + altWeg(formen[f.von], formen[f.nach]).map(p => `<di:waypoint x="${p[0]}" y="${p[1]}" />`).join('') + zu;
  });
}
const flussIds = (liste) => [...new Set(liste.map(t => t.split(' ')[0]))].sort();

const beispiele = {
  Urlaubsantrag: H.BPMN_BEISPIEL_EINSTIEG,
  Reklamation: H.BPMN_BEISPIEL_VERTIEFUNG,
  'Zwei Fragen': `Start: Antrag geht ein
Fachbereich: Antrag prüfen
Leitung: Budget frei? | nein: Antrag zurückstellen
Geschäftsführung: Betrag über 50.000 €? | nein: Antrag freigeben
Geschäftsführung: Antrag im Gremium vorlegen
Ende: Antrag entschieden`,
};
for (const [name, text] of Object.entries(beispiele)) {
  const alt = wieFrueher(bauen(name, text));
  const vorher = befunde(alt);
  const r = S.prozessPfeileReparieren(alt);
  const nachher = befunde(r.xml);
  ok(vorher.length > 0 && nachher.length === 0,
    `${name} wie früher gespeichert: ${flussIds(vorher).length} kaputte(r) Pfeil(e), nach der Reparatur keiner` + (nachher.length ? ' (' + nachher.join('; ') + ')' : ''));
  ok(r.repariert.map(x => x.fluss).sort().join() === flussIds(vorher).join() && r.repariert.every(x => !x.ueberschneidung),
    `${name}: Neu gezogen werden genau die kaputten, ohne Überschneidung`);
  const k0 = lesen(alt).kanten, k1 = lesen(r.xml).kanten;
  const angefasst = Object.keys(k0).filter(id => k0[id] !== k1[id]);
  ok(angefasst.sort().join() === r.repariert.map(x => x.fluss).sort().join(), `${name}: Jeder andere Pfeil bleibt Zeichen für Zeichen, wie er war`);
  ok(S.prozessPfeileReparieren(r.xml).repariert.length === 0, `${name}: Ein zweiter Lauf findet nichts mehr`);
  const frisch = bauen(name, text);
  const r0 = S.prozessPfeileReparieren(frisch);
  ok(r0.repariert.length === 0 && r0.xml === frisch, `${name}: Ein Modell des neuen Generators bleibt unberührt`);
}

/* So speichert bpmn-js: eingerückt, jede Kante mit Lage ihrer Beschriftung. */
const altUrlaub = wieFrueher(bauen('Urlaubsantrag', H.BPMN_BEISPIEL_EINSTIEG));
const gespeichert = altUrlaub.replace(/(<bpmndi:BPMNEdge [^>]*>)([\s\S]*?)(<\/bpmndi:BPMNEdge>)/g, (g, auf, innen, zu) =>
  auf + innen.split('<di:waypoint').filter(Boolean).map(w => '\n        <di:waypoint' + w).join('')
  + '\n        <bpmndi:BPMNLabel>\n          <dc:Bounds x="560" y="500" width="13" height="14" />\n        </bpmndi:BPMNLabel>\n      ' + zu);
const rg = S.prozessPfeileReparieren(gespeichert);
const kg = lesen(rg.xml).kanten;
ok(rg.repariert.length === 1 && befunde(rg.xml).length === 0, 'Eingerückt gespeichert (wie von bpmn-js) wird ebenso repariert');
ok(!/BPMNLabel/.test(kg[rg.repariert[0].fluss]) && Object.entries(kg).filter(([id]) => id !== rg.repariert[0].fluss).every(([, k]) => /BPMNLabel/.test(k)),
  'Die alte Lage der Beschriftung fällt nur am neu gezogenen Pfeil weg, bpmn-js setzt „ja" dann an die Mitte');
ok(/>\n        <di:waypoint x="\d+" y="\d+" \/>\n        <di:waypoint/.test(kg[rg.repariert[0].fluss]) && /\n      <\/bpmndi:BPMNEdge>$/.test(kg[rg.repariert[0].fluss]),
  'Die Einrückung der Datei bleibt erhalten');

/* Andere Werkzeuge schreiben andere Namensräume. */
const fremd = altUrlaub.split('di:waypoint').join('omgdi:waypoint').split('dc:Bounds').join('omgdc:Bounds');
const rf = S.prozessPfeileReparieren(fremd);
ok(rf.repariert.length === 1 && /<omgdi:waypoint /.test(lesen(rf.xml).kanten[rf.repariert[0].fluss]) && !/<di:waypoint/.test(rf.xml),
  'Auch mit anderen Namensräumen (omgdi, omgdc), und die neuen Punkte tragen denselben');

/* Von Hand gezogen, mit Umweg, aber richtig angesetzt: bleibt. */
const frischUrlaub = bauen('Urlaubsantrag', H.BPMN_BEISPIEL_EINSTIEG);
const L = lesen(frischUrlaub);
const st = L.formen.StartEvent_1, ta = L.formen.UserTask_2;
const umweg = [[st.x + st.b, st.y + 18], [st.x + st.b + 20, st.y + 18], [st.x + st.b + 20, st.y - 30], [ta.x - 20, st.y - 30], [ta.x - 20, ta.y + 35], [ta.x, ta.y + 35]];
const handgezogen = frischUrlaub.replace(/(<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">)[\s\S]*?(<\/bpmndi:BPMNEdge>)/,
  (g, auf, zu) => auf + umweg.map(p => `<di:waypoint x="${p[0]}" y="${p[1]}" />`).join('') + zu);
const rh = S.prozessPfeileReparieren(handgezogen);
ok(rh.repariert.length === 0 && rh.xml === handgezogen, 'Ein von Hand gezogener Umweg, der richtig an- und absetzt, bleibt, wie er ist');

/* ── Im RMS: Editor, Ansicht und die Sammelaktion ── */
const quelle = fs.readFileSync(path.join(ROOT, 'js/prozesse.js'), 'utf8').split('\r\n').join('\n');
ok(/const pfeile = itemId && !unbrauchbar \? _procPfeileRichten\(xml\)[^;]*;\s*xml = pfeile\.xml;\s*try \{\s*await _bpmnModeler\.importXML\(xml\)/.test(quelle),
  'Der Editor zieht kaputte Pfeile vor dem Laden neu');
ok(/_procDirty = !!\(pfeile\.repariert\.length && canWrite\);/.test(quelle),
  'und meldet das Modell als ungespeichert, wenn man schreiben darf');
ok(/xml = _procPfeileRichten\(xml\)\.xml;\s*_procAnsichtXml = xml;/.test(quelle), 'Die Ansicht zeigt sie schon richtig');
ok(/onclick="prozessPfeilePruefen\(\)"/.test(quelle), 'Die Liste hat „↪ Pfeile prüfen"');
ok(/opts\.html === true/.test(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8')), 'uiConfirm kann eine fertige Liste zeigen');

const meldungen = [], gespeicherteDateien = [], rueckfragen = [];
let antwort = true;
const dateien = {
  'm-alt': altUrlaub,
  'm-gut': frischUrlaub,
};
const pctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Promise,
  esc: (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'), toast: (t, art) => meldungen.push((art || 'info') + ': ' + t),
  fmtDate: (d) => String(d || '').slice(0, 10), canWriteTab: () => true,
  uiConfirm: async (text, opt) => { rueckfragen.push({ text, opt }); return antwort; },
  STANDORTE: ['HOL', 'SHB'], State: { user: { name: 'Anna Muster' }, policies: [] },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  openModal: () => {}, closeModal: () => {},
  spLoadLandkarte: async () => null, spLandkarteMeta: async () => '',
  spListProcesses: async () => [],
  spGetProcessXml: async (id) => { if (!(id in dateien)) throw new Error('404'); return dateien[id]; },
  spSaveProcess: async (name, xml, werk) => { gespeicherteDateien.push({ name, xml, werk }); return {}; },
};
pctx.window = pctx; pctx.globalThis = pctx;
vm.createContext(pctx);
for (const f of ['js/util.js', 'js/prozessschema.js', 'js/landkarte.js', 'js/prozesse.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), pctx, { filename: f });
}
const p = (code) => vm.runInContext(code, pctx);
p('refreshProzesse = async () => {};');
p(`_processes = [
  { itemId: 'm-alt', title: 'Urlaubsantrag', ordner: 'HOL' },
  { itemId: 'm-gut', title: 'Urlaub neu', ordner: 'HOL' },
  { itemId: 'm-weg', title: 'Verschwunden', ordner: '' },
];`);
await p('prozessPfeilePruefen()');
ok(rueckfragen.length === 1 && rueckfragen[0].opt.html === true && /Urlaubsantrag/.test(rueckfragen[0].text) && !/Urlaub neu/.test(rueckfragen[0].text),
  'Vorher fragt die App und nennt nur die betroffenen Modelle');
ok(/1 Pfeil\b/.test(rueckfragen[0].text) && /Verschwunden/.test(rueckfragen[0].text) && /Versionsverlauf/.test(rueckfragen[0].text),
  'mit Zahl der Pfeile, dem nicht lesbaren Modell und dem Hinweis auf den Versionsverlauf');
ok(gespeicherteDateien.length === 1 && gespeicherteDateien[0].name === 'Urlaubsantrag' && gespeicherteDateien[0].werk === 'HOL'
  && befunde(gespeicherteDateien[0].xml).length === 0,
  'Gespeichert wird nur das kaputte Modell, unter seinem Namen in seinem Werk, und danach ist es heil');
ok(/1 Modell\(e\) korrigiert/.test(meldungen[meldungen.length - 1]), 'Am Ende sagt die App, wie viele es waren');

gespeicherteDateien.length = 0; rueckfragen.length = 0; antwort = false;
await p('prozessPfeilePruefen()');
ok(rueckfragen.length === 1 && gespeicherteDateien.length === 0, 'Wer „Abbrechen" sagt, bekommt nichts gespeichert');

rueckfragen.length = 0; meldungen.length = 0;
p(`_processes = [{ itemId: 'm-gut', title: 'Urlaub neu', ordner: 'HOL' }];`);
await p('prozessPfeilePruefen()');
ok(rueckfragen.length === 0 && /in Ordnung/.test(meldungen[meldungen.length - 1]), 'Ist alles heil, gibt es keine Rückfrage, nur die Auskunft');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
