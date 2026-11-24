/**
 * Hausschema für Prozessmodelle
 *
 * BPMN kennt über hundert Symbole. Das Schema lässt zehn zu und legt fest, wie
 * sie benannt werden – und die eigentliche Frage ist nicht, ob sich ein Modell
 * bauen lässt, sondern ob die Prüfung **anschlägt**. Ein Prüfer, der nie etwas
 * findet, ist kein Prüfer, sondern eine Beruhigung.
 *
 * Zwei Dinge trägt jedes Modell, die es vorher nicht trug:
 *
 *   • **Aufgabentypen.** 👤 Mensch, ⚙ System, ✋ Handgriff – am Symbol
 *     ablesbar. Der frühere Generator baute nur nackte `bpmn:task`; wer
 *     ausführt, stand allenfalls als Präfix im Text und verschwand beim ersten
 *     Umbenennen.
 *   • **Bahnen.** Eine Rolle je Bahn, jeder Knoten in genau einer. „Wer ist
 *     zuständig" hat damit immer eine Antwort, und ein Bahnwechsel ist im Bild
 *     eine Übergabe – genau dort gehen Prozesse kaputt.
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

const S = require(ROOT + '/js/prozessschema.js');
const { PROZESS_BAUSTEINE, PROZESS_REGELN, PROZESS_VORLAGE_TEXT,
  prozessTextLesen, prozessXmlBauen, prozessSchemaPruefen, prozessVorlageXml } = S;

/* ── 1) Die Schreibweise ── */
const z = (t) => prozessTextLesen(t)[0];
ok(z('Einkauf: Bestellung freigeben').bahn === 'Einkauf', 'Vor dem Doppelpunkt steht die Bahn');
ok(z('Einkauf: Bestellung freigeben').kind === 'user', 'Ohne weitere Angabe tut es ein Mensch');
ok(z('System: Bestätigung versenden').kind === 'service',
  'Die Bahn „System" heißt Automatik – wer das schreibt, meint kein Handanlegen');
ok(z('Cron: Erinnerung senden').kind === 'service', 'Ebenso „Cron", „Workflow", „Automatik"');
ok(z('Qualität: Probe entnehmen (manuell)').kind === 'manual', '„(manuell)" macht einen Handgriff daraus');
ok(z('Einkauf: Rechnung buchen (automatisch)').kind === 'service',
  '„(automatisch)" überschreibt die Bahn – auch im Einkauf läuft manches von selbst');
ok(z('Einkauf: Rechnung buchen (automatisch)').label === 'Rechnung buchen',
  'Die Klammer steht danach nicht mehr im Kasten');
ok(z('Einkauf: Betrag über 5.000 €?').kind === 'frage', 'Ein Fragezeichen macht eine Entscheidung daraus');
ok(z('Einkauf: Passt es? | nein: Ohne Freigabe bestellen').nein === 'Ohne Freigabe bestellen',
  'Der Nein-Zweig lässt sich benennen …');
ok(z('Einkauf: Passt es? | nein: Ohne Freigabe bestellen').label === 'Passt es?',
  '… und die Angabe verschwindet aus der Frage');
ok(z('Start: Bedarf gemeldet').kind === 'start' && z('Ende: Bedarf gedeckt').kind === 'ende',
  'Auslöser und Ergebnis sagen sich selbst an');
ok(z('Warten: Freigabe der Leitung').kind === 'warten', 'Und „Warten:" ebenso');
ok(z('3. Einkauf: Ware prüfen').bahn === 'Einkauf', 'Eine Nummerierung davor stört nicht');
ok(prozessTextLesen('A: eins → B: zwei').length === 2, 'Pfeile trennen mehrere Schritte einer Zeile');
ok(prozessTextLesen('').length === 0, 'Leerer Text ergibt keine Schritte');

/* ── 2) Die Vorlage ── */
const v = prozessVorlageXml();
const zaehl = (re) => (v.xml.match(re) || []).length;
ok(/^<\?xml/.test(v.xml) && v.xml.trim().endsWith('</bpmn:definitions>'), 'Die Vorlage ist ein vollständiges BPMN-Dokument');
ok(zaehl(/<bpmn:userTask\b/g) >= 3, 'Sie zeigt Aufgaben von Menschen');
ok(zaehl(/<bpmn:serviceTask\b/g) >= 2, 'Automatik-Schritte (⚙)');
ok(zaehl(/<bpmn:manualTask\b/g) >= 1, 'Und einen Handgriff ohne System (✋)');
ok(zaehl(/<bpmn:exclusiveGateway\b/g) === 1, 'Eine Entscheidung');
ok(zaehl(/<bpmn:intermediateCatchEvent\b/g) === 1, 'Ein Warten');
ok(zaehl(/<bpmn:lane\b/g) >= 4, 'Mehrere Bahnen – der Punkt der Übung');
ok(/<bpmn:collaboration\b/.test(v.xml) && /<bpmn:participant\b/.test(v.xml),
  'Bahnen brauchen einen Pool, sonst zeigt kein Werkzeug sie an');
ok(/<bpmndi:BPMNPlane[^>]*bpmnElement="Collab_1"/.test(v.xml),
  'Und die Zeichenebene hängt an der Zusammenarbeit, nicht am Prozess – sonst bleibt der Pool unsichtbar');
ok(!/NaN|undefined/.test(v.xml), 'Keine NaN/undefined im Layout');
// Beschriftungen tragen eigene Maße – deshalb Formen + Beschriftungen.
ok(zaehl(/<dc:Bounds\b/g) === zaehl(/<bpmndi:BPMNShape\b/g) + zaehl(/<bpmndi:BPMNLabel\b/g),
  'Jede Form und jede Beschriftung hat Maße');

const prVorlage = prozessSchemaPruefen(v.xml, { policyIds: ['7'] });
ok(prVorlage.fehler.length === 0, 'Die eigene Vorlage besteht die eigene Prüfung');
ok(prVorlage.hinweise.length === 0, '… und erzeugt auch keine Hinweise');
ok(prVorlage.zahlen.automatik === 2 && prVorlage.zahlen.handgriff === 1,
  'Die Zählung unterscheidet Mensch, System und Handgriff');

/* Alle Bausteine des Katalogs kommen in der Vorlage wirklich vor – sonst wäre
   die Tabelle eine Behauptung. (Ohne die Aufteilung ✛, die einen zweiten
   Strang bräuchte und die Vorlage unübersichtlich machte – und ohne den
   Unterprozess ⊞, der ein zweites Modell braucht, auf das er zeigen kann.) */
for (const b of PROZESS_BAUSTEINE.filter(x => x.key !== 'parallel' && x.key !== 'unter')) {
  ok(new RegExp('<bpmn:' + b.bpmn + '\\b').test(v.xml), `Die Vorlage zeigt „${b.titel}" (${b.symbol})`);
}

/* ── 2b) Das Layout: nichts liegt aufeinander ──
   Gefunden wurde das im Browser: Die Beschriftung des Gateways und das „nein"
   des senkrechten Zweigs lagen übereinander, weil beide unter dem Gateway
   sitzen wollten. Nachsehen ist keine Prüfung – deshalb wird gerechnet.

   Beschriftungen von Entscheidungen stehen seither OBEN; unter dem Gateway
   läuft der Nein-Zweig durch. */
function _diKaesten(xml) {
  const out = [];
  for (const m of xml.matchAll(/<bpmndi:BPMNShape[^>]*bpmnElement="([^"]+)"[^>]*>([\s\S]*?)<\/bpmndi:BPMNShape>/g)) {
    const el = m[1], inner = m[2];
    const b = /<dc:Bounds x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(inner);
    if (b) out.push({ el, art: 'Form', x: +b[1], y: +b[2], w: +b[3], h: +b[4] });
    const lb = /<bpmndi:BPMNLabel><dc:Bounds x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(inner);
    if (lb) out.push({ el, art: 'Beschriftung', x: +lb[1], y: +lb[2], w: +lb[3], h: +lb[4] });
  }
  return out;
}
function _ueberschneidungen(xml) {
  const k = _diKaesten(xml);
  const container = /^(Pool_|Lane_)/;   // die umschließen naturgemäß alles
  const trifft = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const out = [];
  for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) {
    const a = k[i], b = k[j];
    if (a.el === b.el || container.test(a.el) || container.test(b.el)) continue;
    if (trifft(a, b)) out.push(`${a.el} (${a.art}) × ${b.el} (${b.art})`);
  }
  return out;
}
const kollision = _ueberschneidungen(v.xml);
ok(kollision.length === 0, kollision.length
  ? `Überschneidungen im Layout: ${kollision.slice(0, 3).join(' · ')}`
  : 'Keine Form und keine Beschriftung liegt auf einer anderen');

/* Auch der Fall, an dem es aufgefallen ist: Entscheidung mit Nein-Zweig. */
const mitZweig = prozessXmlBauen({ schritte: prozessTextLesen(
  'Einkauf: Betrag über 5.000 €? | nein: Ohne Freigabe bestellen') });
ok(_ueberschneidungen(mitZweig.xml).length === 0,
  'Auch unter einer Entscheidung mit Nein-Zweig bleibt Platz für die Beschriftung');
// Verglichen wird die Höhe, nicht die Kennung: Die ist eine Eigenheit des
// Generators, die Lage ist die Zusicherung.
const gw = _diKaesten(mitZweig.xml).filter(k => /^ExclusiveGateway/.test(k.el));
ok(gw.length === 2 && gw.find(k => k.art === 'Beschriftung').y < gw.find(k => k.art === 'Form').y,
  'Die Beschriftung der Entscheidung steht über ihr, nicht darunter – dort läuft der Nein-Zweig');

/* ── 3) Die Prüfung schlägt an ──
   Der eigentliche Test: Ein Modell, wie der alte Generator es baute. */
const schlecht = `<?xml version="1.0"?><bpmn:definitions><bpmn:process id="P">
  <bpmn:startEvent id="S1" name="Start"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
  <bpmn:startEvent id="S2" name="Noch ein Start" />
  <bpmn:task id="T1" name="Rechnungsprüfung"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:task>
  <bpmn:exclusiveGateway id="G1" name="Konform"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F3</bpmn:outgoing></bpmn:exclusiveGateway>
  <bpmn:endEvent id="E1"><bpmn:incoming>F3</bpmn:incoming></bpmn:endEvent>
  <bpmn:sequenceFlow id="F1" sourceRef="S1" targetRef="T1" />
  <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="G1" />
  <bpmn:sequenceFlow id="F3" sourceRef="G1" targetRef="E1" />
</bpmn:process></bpmn:definitions>`;
const pr = prozessSchemaPruefen(schlecht, { policyIds: [] });
const hat = (regel) => pr.fehler.some(f => f.regel === regel);
ok(hat('R1'), 'R1 – zwei Auslöser sind zwei Prozesse');
ok(hat('R2'), 'R2 – ein unbenanntes Ende sagt nicht, wie es ausging');
ok(hat('R3'), 'R3 – eine nackte Aufgabe verschweigt, wer sie ausführt');
ok(hat('R4'), 'R4 – ohne Bahnen steht nirgends, wer zuständig ist');
ok(hat('R6'), 'R6 – eine Entscheidung mit einem Ausgang ist keine');
ok(hat('R7'), 'R7 – ein Knoten ohne Ausgang ist eine Notiz, kein Schritt');
ok(pr.hinweise.some(h => h.regel === 'R8'), 'R8 – „Konform" ohne Fragezeichen ist ein Hinweis, kein Fehler');
ok(pr.hinweise.some(h => h.regel === 'R9'), 'R9 – ohne Richtlinie ist der Ablauf Gewohnheit');
ok(pr.fehler.every(f => f.text.length > 20),
  'Jede Meldung sagt, was zu tun ist – eine Regelnummer allein hilft niemandem');

/* Personen statt Rollen in einer Bahn. */
const mitPerson = prozessXmlBauen({ schritte: [
  { kind: 'user', label: 'Antrag prüfen', bahn: 'anna@dihag.com' },
] });
ok(prozessSchemaPruefen(mitPerson.xml).fehler.some(f => f.regel === 'R5'),
  'R5 – eine E-Mail-Adresse als Bahn ist ein Fehler, keine Geschmacksfrage');
const mitName = prozessXmlBauen({ schritte: [{ kind: 'user', label: 'Antrag prüfen', bahn: 'Anna Muster' }] });
ok(prozessSchemaPruefen(mitName.xml).hinweise.some(f => f.regel === 'R5'),
  '… und ein Personenname ein Hinweis: Sicher sagen lässt es sich nicht');

/* ── 4) Nein-Zweige: benannt ist nicht dasselbe wie unbenannt ── */
const mitNein = prozessXmlBauen({ schritte: prozessTextLesen('Einkauf: Passt es? | nein: Nur intern vermerken') });
ok(/name="Nur intern vermerken"/.test(mitNein.xml), 'Ein benannter Nein-Zweig trägt seinen Namen');
ok(/<bpmn:endEvent[^>]*name="Beendet"/.test(mitNein.xml),
  'Und endet in „Beendet" – nicht jede Nein-Antwort ist ein Fehler');
const ohneNein = prozessXmlBauen({ schritte: prozessTextLesen('Einkauf: Passt es?') });
ok(/name="Abweichung behandeln"/.test(ohneNein.xml) && /name="Nachbessern"/.test(ohneNein.xml),
  'Ohne Angabe bleibt es bei „Abweichung behandeln" → „Nachbessern"');

/* ── 5) Ein Modell endet immer ── */
const offen = prozessXmlBauen({ schritte: [{ kind: 'user', label: 'Etwas tun', bahn: 'IT' }] });
ok(/<bpmn:endEvent/.test(offen.xml), 'Auch ohne geschriebenes Ende bekommt das Modell eines (R2)');
ok(prozessSchemaPruefen(offen.xml).fehler.length === 0, 'Und besteht damit die Prüfung');
const leer = prozessXmlBauen({ schritte: [] });
ok(prozessSchemaPruefen(leer.xml).fehler.length === 0, 'Selbst aus nichts entsteht ein regelkonformes Gerüst');

/* ── 6) Die Marker reisen mit ── */
const mitDoku = prozessXmlBauen({ schritte: prozessTextLesen('IT: Etwas tun'), doku: '[[rms:policies=7,9]]' });
ok(/<bpmn:documentation>\[\[rms:policies=7,9\]\]<\/bpmn:documentation>/.test(mitDoku.xml),
  'Richtlinien- und Anlagen-Marker stehen in der Prozess-Dokumentation');
ok(mitDoku.xml.indexOf('<bpmn:documentation>') < mitDoku.xml.indexOf('<bpmn:laneSet'),
  'Und zwar vor dem Bahnensatz – BPMN schreibt die Reihenfolge vor');

/* ── 7) Katalog und Regeln sind Daten, nicht Prosa ── */
ok(PROZESS_BAUSTEINE.length === 10, 'Zehn Bausteine – nicht die über hundert, die BPMN kennt');
ok(PROZESS_BAUSTEINE.every(b => b.symbol && b.bpmn && b.zweck && b.benennung),
  'Jeder trägt Symbol, BPMN-Typ, Zweck und Benennungsregel');
ok(new Set(PROZESS_BAUSTEINE.map(b => b.bpmn)).size === 10, 'Keine Dublette');
ok(PROZESS_REGELN.length === 10 && PROZESS_REGELN.every(r => r.warum),
  'Jede Regel trägt ihre Begründung – eine ohne wäre keine');
const genutzt = new Set(
  [...lies('js/prozessschema.js').matchAll(/melde\('(R\d+)'|rate\('(R\d+)'/g)].map(m => m[1] || m[2]));
ok(PROZESS_REGELN.every(r => genutzt.has(r.id)),
  'Jede Regel wird auch geprüft – eine Regel ohne Prüfung ist ein Wunsch');

/* ── 8) Angeschlossen? ── */
const pjs = lies('js/prozesse.js');
ok(/return prozessXmlBauen\(\{/.test(pjs) || /prozessXmlAusText\(/.test(pjs),
  'Der Freitext-Generator in prozesse.js baut über das Hausschema');
ok(!/shapes\.push\(\{ id: tid, type: 'task'/.test(pjs),
  'Der frühere Generator ist abgelöst, nicht danebengestellt');
ok(/onclick="prozessSchemaPruefung\(\)"/.test(pjs), 'Der Editor hat einen Knopf „🔍 Schema"');
ok(/id="proc-schema"/.test(pjs), 'Und einen Kasten für das Ergebnis');
ok(/function prozessSchemaLegende/.test(pjs), 'Die zehn Bausteine stehen als Legende im Editor');
ok(/'prozessschema'/.test(lies('js/module.js')), 'Das Modul steht in der Nachlade-Karte');
ok(lies('js/module.js').indexOf("'prozessschema'") < lies('js/module.js').indexOf("'prozesse'"),
  'Und wird vor prozesse.js geladen – die Datei ruft es beim Erzeugen auf');

/* ── 9) Der Dokumentations-Abschnitt ──
   Er baut seine Tabellen AUS den Daten. Eine abgeschriebene Tabelle liefe mit
   dem Werkzeug auseinander, sobald jemand eine Regel ändert – und niemand
   merkte es. */
const vm = (await import('vm')).default;
const dctx = { console, JSON, Date, Array, Object, String, Math,
  esc: (x) => String(x ?? ''), State: { user: {} }, document: { getElementById: () => null } };
dctx.window = dctx; dctx.globalThis = dctx;
vm.createContext(dctx);
vm.runInContext(lies('js/prozessschema.js'), dctx);
vm.runInContext(lies('js/dokumentation.js'), dctx);
const secs = vm.runInContext('_dokuSections()', dctx);
const teil = secs.slice(secs.indexOf('id="doku-prozessschema"'));
const doku = teil.slice(0, teil.indexOf('id="doku-vorschlaege"'));
ok(doku.length > 3000, 'Der Abschnitt „Prozesse niederschreiben" wird gezeichnet');
ok(doku.indexOf(String.fromCharCode(36) + '{') < 0, 'Ohne sichtbaren Platzhalter');
ok((doku.match(/Benennung:/g) || []).length === PROZESS_BAUSTEINE.length,
  'Die Bausteintabelle kommt aus den Daten – alle zehn, keiner abgeschrieben');
ok((doku.match(/>R\d+</g) || []).length === PROZESS_REGELN.length, 'Die Regeltabelle ebenso');
ok(doku.includes('Bedarf gemeldet'), 'Und die Schreibvorlage steht zum Abschreiben da');
ok(/dokumentation:\s*\['prozessschema',[^\]]*'dokumentation'\]/.test(lies('js/module.js')),
  'Der Doku-Reiter lädt das Schema mit – sonst blieben seine Tabellen leer');
ok(doku.includes('| Ende: Text') && doku.includes('| zurück: Schritt') && doku.includes('| weiter: Schritt') && doku.includes('Zurück: Schritt'),
  'Die Schreibweise für Ergebnis, Rücksprung und Sprung nach vorn steht in der Tabelle');

/* ── 10) Wie der Nein-Zweig ausgeht: Ergebnis, Rücksprung, Sprung nach vorn ──
   Bis Oktober 2026 kannte der Generator nur Zweige, die enden, und zwar in
   „Beendet" oder „Nachbessern". Der Freigabe-Workflow eines Regelwerks ist
   aber eine Schleife: nicht konform, überarbeiten, wieder in die Prüfung.
   Ohne Rücksprung ließ er sich nicht wahrheitsgemäß zeichnen. */
const zw = (t) => prozessTextLesen(t)[0];
ok(zw('Leitung: Genehmigt? | nein: Ablehnung begründen | Ende: Antrag abgelehnt').neinEnde === 'Antrag abgelehnt',
  '„| Ende: …" benennt das Ergebnis des Nein-Zweigs');
ok(zw('Prüfer: Vollständig? | nein: Angaben nachfordern | zurück: Antrag prüfen').neinZurueck === 'Antrag prüfen',
  '„| zurück: …" nennt den Schritt, zu dem der Zweig zurückführt');
ok(zw('Prüfer: Vollständig? | nein: Angaben nachfordern | zurueck: Antrag prüfen').neinZurueck === 'Antrag prüfen'
  && zw('Leitung: Ab 5.000 €? | nein | weiter: Bestellen').neinZurueck === 'Bestellen', 'Auch „zurueck" und „weiter" werden gelesen');
ok(zw('Leitung: Ab 5.000 €? | nein | weiter: Bestellen').neinOhne === true, '„| nein" ohne Text heißt: kein eigener Schritt im Zweig');
ok(zw('System: Frist? | nein: Erinnerung senden').neinTyp === '' && zw('Leitung: Frist? | nein: Mahnung senden (automatisch)').neinTyp === 'service',
  'Der Schritt im Nein-Zweig kann seinen Typ in Klammern tragen');
ok(zw('Einkauf: Teile A | B zählen').label === 'Teile A | B zählen', 'Ein Strich in gewöhnlichem Text bleibt stehen');
ok(zw('Zurück: Antrag prüfen').kind === 'zurueck', '„Zurück:" ist eine eigene Zeile für den Hauptweg');

const schleife = prozessXmlBauen({ name: 'Schleife', schritte: prozessTextLesen(`Start: Antrag geht ein
Fachbereich: Antrag erfassen
Prüfer: Antrag prüfen
Prüfer: Antrag vollständig? | nein: Angaben nachfordern | zurück: Antrag prüfen
Leitung: Antrag genehmigen? | nein: Ablehnung begründen | Ende: Antrag abgelehnt
System: Ab 5.000 €? | nein | weiter: Bestellung auslösen
Leitung: Zweite Freigabe erteilen
System: Bestellung auslösen
System: Lieferung pünktlich? | nein | Ende: Lieferung angemahnt
Warten: Rechnung geht ein
Buchhaltung: Rechnung korrekt? | nein | zurück: Rechnung geht ein
Buchhaltung: Rechnung buchen
Zurück: Antrag erfassen`) }).xml;
const prS = prozessSchemaPruefen(schleife, {});
ok(prS.fehler.length === 0 && prS.hinweise.length === 0, 'Ein Modell mit Schleifen und Sprüngen besteht die Prüfung ohne Befund');
const fl = (von, nach) => new RegExp(`<bpmn:sequenceFlow id="[^"]+"(?: name="([^"]*)")? sourceRef="${von}" targetRef="${nach}"`).exec(schleife);
// Namen wie „Ab 5.000 €?" taugen nicht als regulärer Ausdruck: verglichen wird der Text.
const idVon = (name) => ([...schleife.matchAll(/<bpmn:\w+ id="([^"]+)" name="([^"]*)"/g)].find(m => m[2] === name) || [])[1];
ok(fl(idVon('Angaben nachfordern'), idVon('Antrag prüfen')), 'Der Nein-Schritt führt zurück zu „Antrag prüfen"');
ok(/<bpmn:endEvent id="[^"]+" name="Antrag abgelehnt"/.test(schleife), 'Das Ergebnis des Nein-Zweigs trägt seinen Namen');
ok(S.prozessArt('endEvent', 'Antrag abgelehnt') === 'abbruch', '… und wird als negatives Ende rot');
const weiter = fl(idVon('Ab 5.000 €?'), idVon('Bestellung auslösen'));
ok(weiter && weiter[1] === 'nein', 'Ohne eigenen Schritt geht der Nein-Ausgang direkt weiter; die Wege treffen sich');
const angemahnt = fl(idVon('Lieferung pünktlich?'), idVon('Lieferung angemahnt'));
ok(angemahnt && angemahnt[1] === 'nein', '„| nein | Ende: …" führt die Raute direkt in das Ergebnis');
ok(fl(idVon('Rechnung korrekt?'), idVon('Rechnung geht ein')), 'Ein Rücksprung kann auch auf ein Warten zeigen');
ok(fl(idVon('Rechnung buchen'), idVon('Antrag erfassen')), '„Zurück:" schließt den Hauptweg zu einem früheren Schritt');
ok(!/name="(Beendet|Nachbessern)"/.test(schleife), 'Kein Ergebnis heißt mehr pauschal „Beendet"');
ok(S.prozessPfeileReparieren(schleife).repariert.length === 0, 'Die Pfeile der Sprünge setzen sauber an und ab, die Reparatur findet nichts');
ok(_ueberschneidungen(schleife).length === 0, 'Nichts liegt aufeinander');
ok(S.prozessAblauf(schleife).zahlen.unerreichbar === 0, 'In der Schrittliste ist jeder Schritt vom Auslöser aus erreichbar');

/* Ein Sprungziel, das es nicht gibt, darf kein Pfeil ins Leere werden. */
const ohneZiel = prozessXmlBauen({ schritte: prozessTextLesen('Start: A\nX: Frage? | nein: Prüfen | zurück: Gibt es nicht\nX: Weiter machen') }).xml;
ok(prozessSchemaPruefen(ohneZiel, {}).fehler.length === 0 && /<bpmn:endEvent id="[^"]+" name="Beendet"/.test(ohneZiel),
  'Fehlt das Sprungziel, endet der Zweig wie bisher, statt ins Leere zu zeigen');

/* Zwei Entscheidungen hintereinander in einer Bahn: Das Ergebnis des ersten
   Zweigs lag auf dem Schritt des zweiten. Jetzt rückt die zweite Raute. */
const zweiInEiner = prozessXmlBauen({ schritte: prozessTextLesen(`Start: A
Leitung: Erste Frage? | nein: Erstes erledigen | Ende: Erstes Ergebnis
Leitung: Zweite Frage? | nein: Zweites erledigen | Ende: Zweites Ergebnis
Leitung: Weiter arbeiten`) }).xml;
ok(_ueberschneidungen(zweiInEiner).length === 0, 'Zwei Nein-Zweige nebeneinander in einer Bahn liegen nicht aufeinander');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
