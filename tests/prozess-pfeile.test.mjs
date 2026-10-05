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

/** Formen, Pfeile und deren Quelle/Ziel aus dem erzeugten XML. */
function lesen(xml) {
  const formen = {};
  for (const m of xml.matchAll(/<bpmndi:BPMNShape id="[^"]+" bpmnElement="([^"]+)"[^>]*><dc:Bounds x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    const [, id, x, y, b, h] = m;
    formen[id] = { x: +x, y: +y, b: +b, h: +h };
  }
  const fluesse = {};
  for (const m of xml.matchAll(/<bpmn:sequenceFlow id="([^"]+)"[^>]*sourceRef="([^"]+)" targetRef="([^"]+)"/g)) fluesse[m[1]] = { von: m[2], nach: m[3] };
  const pfeile = {};
  for (const m of xml.matchAll(/<bpmndi:BPMNEdge id="[^"]+" bpmnElement="([^"]+)">(.*?)<\/bpmndi:BPMNEdge>/g)) {
    pfeile[m[1]] = [...m[2].matchAll(/x="([\d.-]+)" y="([\d.-]+)"/g)].map(p => [+p[1], +p[2]]);
  }
  return { formen, fluesse, pfeile };
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

function pruefen(name, text) {
  const xml = S.prozessXmlBauen({ name, schritte: S.prozessTextLesen(text) }).xml;
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
  ok(fehler.length === 0, `${name}: ${Object.keys(fluesse).length} Pfeile, jeder von Rand zu Rand und durch keinen Kasten` +
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

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
