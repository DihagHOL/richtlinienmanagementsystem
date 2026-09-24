'use strict';

/**
 * Hausschema für Prozessmodelle (BPMN 2.0)
 * ========================================
 * BPMN kennt über hundert Symbole. Wer alle zulässt, bekommt Modelle, die
 * niemand außer ihrem Verfasser liest – und im Audit erklärt werden müssen
 * statt zu erklären. Dieses Schema lässt **zehn** zu und legt fest, wie sie
 * benannt werden.
 *
 * Drei Entscheidungen tragen alles Weitere:
 *
 *   1. **Eine Aufgabe sagt, WER sie ausführt – am Symbol, nicht im Text.**
 *      👤 `userTask` ein Mensch · ⚙ `serviceTask` ein System ohne Zutun ·
 *      ✋ `manualTask` außerhalb jedes Systems. Das nackte `bpmn:task` ist
 *      verboten: Es sieht aus wie eine Aussage und ist keine.
 *   2. **Eine Bahn (Lane) ist eine Rolle, keine Person.** Personen wechseln,
 *      Rollen bleiben; ein Modell mit Namen darin ist am nächsten Montag falsch.
 *      Jeder Knoten liegt in genau einer Bahn – „wer ist zuständig" hat damit
 *      immer eine Antwort.
 *   3. **Benennung ist Teil des Schemas, nicht Geschmack.** Aufgaben: Verb im
 *      Infinitiv + Objekt („Antrag prüfen"). Entscheidungen: eine Frage mit
 *      Fragezeichen. Ereignisse: ein Zustand („Antrag genehmigt"), kein Verb.
 *
 * Das Schema ist hier **Daten**, keine Prosa: Die Dokumentation, die Legende im
 * Editor und die Prüfung lesen dieselbe Tabelle. Was hier steht, kann deshalb
 * nicht mit dem auseinanderlaufen, was das Werkzeug tut.
 */

/* ── 1) Die zugelassenen Bausteine ────────────────────────────────────────── */

const PROZESS_BAUSTEINE = [
  { key: 'start',   bpmn: 'startEvent',              symbol: '○',  titel: 'Auslöser',
    zweck: 'Womit fängt der Prozess an? Mit einem Ereignis, nicht mit einem Tun.',
    benennung: 'Zustand: „Antrag geht ein", „Frist erreicht"', beispiel: 'Antrag geht ein' },
  { key: 'user',    bpmn: 'userTask',                symbol: '👤', titel: 'Aufgabe (Mensch)',
    zweck: 'Eine Person tut etwas, im System oder daneben.',
    benennung: 'Verb im Infinitiv + Objekt', beispiel: 'Antrag fachlich prüfen' },
  { key: 'service', bpmn: 'serviceTask',             symbol: '⚙',  titel: 'Automatik (System)',
    zweck: 'Läuft ohne Zutun: Mail, Workflow, Schnittstelle, Cron.',
    benennung: 'Verb im Infinitiv + Objekt', beispiel: 'Bestätigung versenden' },
  { key: 'manual',  bpmn: 'manualTask',              symbol: '✋', titel: 'Handgriff (ohne System)',
    zweck: 'Findet außerhalb jeder Anwendung statt: Werkstatt, Papier, Telefon.',
    benennung: 'Verb im Infinitiv + Objekt', beispiel: 'Probe entnehmen' },
  { key: 'frage',   bpmn: 'exclusiveGateway',        symbol: '◇',  titel: 'Entscheidung (entweder/oder)',
    zweck: 'Genau ein Weg geht weiter. Jeder Ausgang ist beschriftet.',
    benennung: 'Frage mit Fragezeichen', beispiel: 'Betrag über 5.000 €?' },
  { key: 'parallel', bpmn: 'parallelGateway',        symbol: '✛',  titel: 'Aufteilung (beides)',
    zweck: 'Zwei Wege laufen gleichzeitig weiter und treffen sich wieder.',
    benennung: 'ohne Beschriftung', beispiel: '' },
  { key: 'warten',  bpmn: 'intermediateCatchEvent',  symbol: '⏱',  titel: 'Warten',
    zweck: 'Der Prozess ruht, bis eine Frist abläuft oder eine Nachricht kommt.',
    benennung: 'Worauf gewartet wird', beispiel: 'Rückmeldung des Werks' },
  { key: 'ende',    bpmn: 'endEvent',                symbol: '◎',  titel: 'Ergebnis',
    zweck: 'Wie der Prozess ausgeht. Mehrere Ergebnisse sind normal.',
    benennung: 'Zustand, kein Verb', beispiel: 'Antrag genehmigt' },
  { key: 'bahn',    bpmn: 'lane',                    symbol: '▭',  titel: 'Bahn (Rolle)',
    zweck: 'Wer verantwortlich ist. Rolle oder Stelle, nie eine Person.',
    benennung: 'Rollenbezeichnung', beispiel: 'Einkauf' },
  { key: 'unter',   bpmn: 'callActivity',            symbol: '⊞',  titel: 'Unterprozess (eingebundenes Modell)',
    zweck: 'Ein eigener Prozess, der an dieser Stelle im Ganzen läuft. Einmal modelliert, hier nur eingebunden.',
    benennung: 'Name des eingebundenen Prozesses', beispiel: 'Auftragserfassung' },
];

/* Die Kennung eines Modells ist das `id` seines <bpmn:process>. Sie muss im
   ganzen Haus einmalig sein, denn eine ⊞ Aufrufaktivität zeigt mit
   `calledElement` genau darauf. Zeit plus Zufall reicht dafür – und der
   Anfang „Process_" bleibt, damit fremde Werkzeuge sie als das lesen, was sie
   ist. „Process_1" allein ist keine Kennung: Die trug bis hierher jedes Modell. */
const PROZESS_KENNUNG_GENERISCH = /^Process_\d*$/;
function prozessKennungNeu() {
  return 'Process_' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36).padStart(3, '0');
}
function prozessKennungGueltig(k) {
  return /^[A-Za-z_][\w.-]*$/.test(String(k || '')) && !PROZESS_KENNUNG_GENERISCH.test(String(k || ''));
}

/** BPMN-Typ → Baustein. */
function prozessBaustein(bpmnTyp) {
  return PROZESS_BAUSTEINE.find(b => b.bpmn === bpmnTyp) || null;
}

/* ── 2) Die Regeln, gegen die geprüft wird ───────────────────────────────── */

/* Jede Regel trägt ihre Begründung mit. Eine Regel, deren Grund man nicht
   nennen kann, sollte keine sein. */
const PROZESS_REGELN = [
  { id: 'R1', text: 'Genau ein Auslöser.',
    warum: 'Zwei Startpunkte heißen: es sind zwei Prozesse.' },
  { id: 'R2', text: 'Mindestens ein Ergebnis, und jedes ist benannt.',
    warum: 'Ein unbenanntes Ende beantwortet nicht, wie die Sache ausging.' },
  { id: 'R3', text: 'Keine nackte Aufgabe: Jede ist 👤, ⚙ oder ✋.',
    warum: 'Ob ein Mensch oder ein System handelt, ist die erste Frage bei jeder Übergabe.' },
  { id: 'R4', text: 'Jeder Knoten liegt in genau einer Bahn.',
    warum: 'Sonst hat „wer ist zuständig" keine Antwort.' },
  { id: 'R5', text: 'Bahnen tragen Rollen, keine Personen.',
    warum: 'Personen wechseln; ein Modell mit Namen ist am nächsten Montag falsch.' },
  { id: 'R6', text: 'Jede Entscheidung hat mindestens zwei Ausgänge, alle beschriftet.',
    warum: 'Ein unbeschrifteter Ausgang zwingt zum Raten, wann er gilt.' },
  { id: 'R7', text: 'Kein Knoten ohne Eingang (außer dem Auslöser) und ohne Ausgang (außer Ergebnissen).',
    warum: 'Ein loser Kasten ist kein Prozessschritt, sondern eine Notiz.' },
  { id: 'R8', text: 'Aufgaben beginnen mit einem Verb, Entscheidungen enden mit „?".',
    warum: 'Ein Substantiv sagt nicht, was zu tun ist.' },
  { id: 'R9', text: 'Der Prozess nennt mindestens eine Richtlinie.',
    warum: 'Ein Ablauf ohne Regelwerk ist Gewohnheit, keine Vorgabe.' },
  { id: 'R10', text: 'Ein Unterprozess wird eingebunden, nicht abgeschrieben. Jede ⊞ zeigt auf genau ein Modell.',
    warum: 'Was zweimal ausgeschrieben steht, ist bald zweimal verschieden; was eingebunden ist, gibt es einmal.' },
];

/* ── 3) Die Schreibweise: Text → Schritte ────────────────────────────────── */

/* Bahnen, die ohne weiteres Zutun als Automatik gelten. Wer „System" schreibt,
   meint kein Handanlegen. */
const PS_AUTO_BAHNEN = /^(system|automatik|automatisch|it-system|workflow|cron)$/i;

/**
 * Eine Zeile lesen.
 *
 * Die Schreibweise ist absichtlich das, was Leute ohnehin tippen:
 *
 *     Einkauf: Bestellung freigeben
 *     System: Bestätigung versenden
 *     Qualität: Prüfbericht erstellen (manuell)
 *     Einkauf: Betrag über 5.000 €? | nein: Ohne Freigabe bestellen
 *     Ende: Bestellung ausgelöst
 *
 * Vor dem Doppelpunkt steht die Bahn, dahinter der Schritt. Ein Fragezeichen
 * macht eine Entscheidung daraus, `(automatisch)` bzw. `(manuell)` überschreibt
 * den Aufgabentyp, `| nein: …` benennt den zweiten Zweig.
 */
function prozessZeileLesen(zeile) {
  let l = String(zeile || '').trim();
  if (!l) return null;
  l = l.replace(/^(\d+[.)]|[-–•*‣◦])\s+/, '').trim();
  if (l.length < 2) return null;

  // Bahn vor dem Doppelpunkt. Zahlen davor wären eine Nummerierung, keine Rolle.
  let bahn = '';
  const m = l.match(/^([A-Za-zÄÖÜäöüß0-9 ./&_-]{2,32}?):\s+(.+)$/);
  if (m && m[2].length >= 2 && !/^\d+$/.test(m[1].trim())) { bahn = m[1].trim(); l = m[2].trim(); }

  // Sonderzeilen: Auslöser und Ergebnis sagen sich selbst an.
  const kopf = bahn.toLowerCase();
  if (kopf === 'start' || kopf === 'auslöser' || kopf === 'ausloeser') return { kind: 'start', label: l, bahn: '' };
  if (kopf === 'ende' || kopf === 'ergebnis') return { kind: 'ende', label: l, bahn: '' };
  if (kopf === 'warten' || kopf === 'warten auf') return { kind: 'warten', label: l, bahn: '' };

  // Zweitname eines Entscheidungszweigs.
  let nein = '';
  const nm = l.match(/\|\s*nein\s*:\s*(.+)$/i);
  if (nm) { nein = nm[1].trim(); l = l.slice(0, nm.index).trim(); }

  // Aufgabentyp: ausdrücklich in Klammern, sonst über die Bahn, sonst Mensch.
  // „(Unterprozess)" meint: hier läuft ein eigener Prozess – im Modeler wird
  // dann das Modell gewählt, das eingebunden wird.
  let typ = '';
  const tm = l.match(/\s*\((automatisch|automatik|system|manuell|handisch|unterprozess|teilprozess)\)\s*$/i);
  if (tm) {
    typ = /manuell|handisch/i.test(tm[1]) ? 'manual' : /unterprozess|teilprozess/i.test(tm[1]) ? 'unter' : 'service';
    l = l.slice(0, tm.index).trim();
  }
  if (!typ) typ = PS_AUTO_BAHNEN.test(bahn) ? 'service' : 'user';

  if (/\?\s*$/.test(l)) return { kind: 'frage', label: l, bahn, nein };
  return { kind: typ, label: l, bahn, nein: '' };
}

/**
 * Ganzen Text lesen.
 *
 * Pfeile trennen mehrere Schritte einer Zeile – so schreiben Leute Abläufe hin,
 * bevor sie an ein Werkzeug denken.
 */
function prozessTextLesen(text) {
  const zeilen = [];
  String(text || '').replace(/\r/g, '').split(/\n+/).forEach(z => {
    z.trim().split(/\s*(?:→|->|⇒|=>|➔|▶)\s*/).forEach(t => { t = t.trim(); if (t) zeilen.push(t); });
  });
  const out = [];
  for (const z of zeilen) {
    if (out.length >= 24) break;
    const s = prozessZeileLesen(z);
    if (s) out.push(s);
  }
  return out;
}

/** Die Bahnen in der Reihenfolge ihres ersten Auftretens. */
function prozessBahnen(schritte) {
  const b = [];
  for (const s of (schritte || [])) {
    if (!s.bahn || b.includes(s.bahn)) continue;
    b.push(s.bahn);
  }
  return b.length ? b : ['Fachbereich'];
}

/* ── 4) Schritte → BPMN mit Pool, Bahnen und typisierten Aufgaben ────────── */

/* Bahnhöhe: zwei Reihen (Hauptweg oben, Nein-Zweig unten) plus Luft dazwischen.
   Die Luft ist kein Geschmack – in ihr sitzt die Beschriftung „nein" des
   senkrechten Flusses. Zu eng, und sie liegt auf den Kästen. */
const PS_BAHN_H = 240;
const PS_SCHRITT_X = 190; // waagerechter Abstand zweier Schritte
const PS_POOL_X = 160, PS_POOL_Y = 80, PS_KOPF_B = 30;

function _psEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function _psKurz(s, ersatz) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!s) return ersatz || '';
  return s.length > 58 ? s.slice(0, 56) + '…' : s;
}

/**
 * Ein vollständiges BPMN-Modell nach Hausschema bauen.
 *
 * Waagerecht läuft die Zeit, senkrecht steht die Zuständigkeit – ein Wechsel
 * der Bahn ist im Bild eine Übergabe, und genau dort gehen Prozesse kaputt.
 *
 * @param {{name?:string, schritte:Array, policyIds?:string[], docs?:Array}} o
 * @returns {{name:string, xml:string, policyIds:string[], docs:Array}}
 */
function prozessXmlBauen(o) {
  const opt = o || {};
  let schritte = Array.isArray(opt.schritte) ? opt.schritte.slice() : [];
  if (!schritte.length) schritte = [{ kind: 'user', label: 'Schritt beschreiben', bahn: 'Fachbereich' }];

  const bahnen = prozessBahnen(schritte);
  const bahnY = {};
  bahnen.forEach((b, i) => { bahnY[b] = PS_POOL_Y + i * PS_BAHN_H; });
  const standardBahn = bahnen[0];
  const reiheHaupt = (b) => bahnY[b] + 70;      // Mitte der oberen Reihe
  const reiheZweig = (b) => bahnY[b] + 180;     // Mitte der unteren Reihe

  const knoten = [], fluesse = [], zweigEnden = [];
  let n = 0;
  const neu = (typ, name, bahn, x, y, w, h) => {
    const id = typ.replace(/^./, c => c.toUpperCase()) + '_' + (++n);
    knoten.push({ id, typ, name: name || '', bahn: bahn || standardBahn, x, y, w, h });
    return id;
  };
  const fluss = (von, nach, name) => {
    if (!von || !nach) return;
    fluesse.push({ id: 'Flow_' + (fluesse.length + 1), von, nach, name: name || '' });
  };

  // Der Auslöser: entweder ausdrücklich geschrieben oder stillschweigend davor.
  let x = PS_POOL_X + PS_KOPF_B + 40;
  const ersteBahn = (schritte.find(s => s.bahn) || {}).bahn || standardBahn;
  let startName = 'Start';
  const startIdx = schritte.findIndex(s => s.kind === 'start');
  if (startIdx >= 0) { startName = schritte[startIdx].label; schritte.splice(startIdx, 1); }
  const startId = neu('startEvent', _psKurz(startName, 'Start'), ersteBahn, x, reiheHaupt(ersteBahn) - 18, 36, 36);
  x += 110;

  let vorher = startId, vorherWarFrage = false, letzteBahn = ersteBahn;
  const enden = [];

  for (const s of schritte) {
    const bahn = s.bahn || letzteBahn;
    letzteBahn = bahn;

    if (s.kind === 'ende') {
      const id = neu('endEvent', _psKurz(s.label, 'Ende'), bahn, x, reiheHaupt(bahn) - 18, 36, 36);
      fluss(vorher, id, vorherWarFrage ? 'ja' : '');
      enden.push(id);
      vorher = null; vorherWarFrage = false;
      x += 110;
      continue;
    }

    if (s.kind === 'warten') {
      const id = neu('intermediateCatchEvent', _psKurz(s.label, 'Warten'), bahn, x, reiheHaupt(bahn) - 18, 36, 36);
      fluss(vorher, id, vorherWarFrage ? 'ja' : '');
      vorher = id; vorherWarFrage = false;
      x += 110;
      continue;
    }

    if (s.kind === 'frage') {
      const id = neu('exclusiveGateway', _psKurz(s.label, 'Entscheidung?'), bahn, x, reiheHaupt(bahn) - 25, 50, 50);
      fluss(vorher, id, vorherWarFrage ? 'ja' : '');
      // Der Nein-Zweig bleibt in derselben Bahn – wer entscheidet, trägt auch
      // die Folge der Ablehnung, bis das Modell etwas anderes sagt.
      // Wer den Zweig benennt, meint einen regulären Ausgang; wer ihn offen
      // lässt, meint eine Nachbesserung. Nicht jede Nein-Antwort ist ein Fehler –
      // bei „Kann der Kunde betroffen sein?" wäre „Abweichung behandeln" falsch.
      const benannt = !!_psKurz(s.nein, '');
      const zweig = neu('userTask', _psKurz(s.nein, '') || 'Abweichung behandeln', bahn,
        x - 50, reiheZweig(bahn) - 35, 150, 70);
      zweigEnden.push({ id: zweig, name: benannt ? 'Beendet' : 'Nachbessern' });
      fluss(id, zweig, 'nein');
      vorher = id; vorherWarFrage = true;
      x += PS_SCHRITT_X;
      continue;
    }

    const typ = s.kind === 'service' ? 'serviceTask' : s.kind === 'manual' ? 'manualTask'
      : s.kind === 'unter' ? 'callActivity' : 'userTask';
    const id = neu(typ, _psKurz(s.label, 'Schritt'), bahn, x, reiheHaupt(bahn) - 35, 150, 70);
    fluss(vorher, id, vorherWarFrage ? 'ja' : '');
    vorher = id; vorherWarFrage = false;
    x += PS_SCHRITT_X;
  }

  // Offenes Ende schließen – ein Modell ohne Ergebnis verstößt gegen R2.
  if (vorher) {
    const id = neu('endEvent', 'Vorgang abgeschlossen', letzteBahn, x, reiheHaupt(letzteBahn) - 18, 36, 36);
    fluss(vorher, id, vorherWarFrage ? 'ja' : '');
    enden.push(id);
    x += 110;
  }

  // Jeder Nein-Zweig braucht seinerseits ein Ergebnis (R7).
  zweigEnden.forEach(z => {
    if (fluesse.some(f => f.von === z.id)) return;
    const k = knoten.find(y => y.id === z.id);
    if (!k) return;
    const id = neu('endEvent', z.name, k.bahn, k.x + k.w + 40, k.y + k.h / 2 - 18, 36, 36);
    fluss(k.id, id);
    enden.push(id);
  });

  const poolB = Math.max(x + 60 - PS_POOL_X, 520);
  const poolH = bahnen.length * PS_BAHN_H;

  const einAus = (id) => {
    const ein = fluesse.filter(f => f.nach === id).map(f => `<bpmn:incoming>${f.id}</bpmn:incoming>`).join('');
    const aus = fluesse.filter(f => f.von === id).map(f => `<bpmn:outgoing>${f.id}</bpmn:outgoing>`).join('');
    return ein + aus;
  };

  const laneSet = `    <bpmn:laneSet id="LaneSet_1">
${bahnen.map((b, i) => `      <bpmn:lane id="Lane_${i + 1}" name="${_psEsc(b)}">
${knoten.filter(k => k.bahn === b).map(k => `        <bpmn:flowNodeRef>${k.id}</bpmn:flowNodeRef>`).join('\n')}
      </bpmn:lane>`).join('\n')}
    </bpmn:laneSet>`;

  const elemente = knoten.map(k =>
    `    <bpmn:${k.typ} id="${k.id}"${k.name ? ` name="${_psEsc(k.name)}"` : ''}>${einAus(k.id)}</bpmn:${k.typ}>`)
    .concat(fluesse.map(f =>
      `    <bpmn:sequenceFlow id="${f.id}"${f.name ? ` name="${_psEsc(f.name)}"` : ''} sourceRef="${f.von}" targetRef="${f.nach}" />`))
    .join('\n');

  const di = [];
  di.push(`      <bpmndi:BPMNShape id="Pool_1_di" bpmnElement="Pool_1" isHorizontal="true"><dc:Bounds x="${PS_POOL_X}" y="${PS_POOL_Y}" width="${poolB}" height="${poolH}" /></bpmndi:BPMNShape>`);
  bahnen.forEach((b, i) => {
    di.push(`      <bpmndi:BPMNShape id="Lane_${i + 1}_di" bpmnElement="Lane_${i + 1}" isHorizontal="true"><dc:Bounds x="${PS_POOL_X + PS_KOPF_B}" y="${bahnY[b]}" width="${poolB - PS_KOPF_B}" height="${PS_BAHN_H}" /></bpmndi:BPMNShape>`);
  });
  knoten.forEach(k => {
    const marker = k.typ === 'exclusiveGateway' ? ' isMarkerVisible="true"' : '';
    // Ereignisse beschriften unten, Entscheidungen oben: Unter einem Gateway
    // laeuft der Nein-Zweig senkrecht weg, und seine eigene Beschriftung waere
    // sonst genau dort.
    const oben = k.typ === 'exclusiveGateway' || k.typ === 'parallelGateway';
    const label = /Event|Gateway/.test(k.typ) && k.name
      ? `<bpmndi:BPMNLabel><dc:Bounds x="${k.x - 30}" y="${oben ? k.y - 22 : k.y + k.h + 6}" width="${k.w + 60}" height="14" /></bpmndi:BPMNLabel>` : '';
    di.push(`      <bpmndi:BPMNShape id="${k.id}_di" bpmnElement="${k.id}"${marker}><dc:Bounds x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" />${label}</bpmndi:BPMNShape>`);
  });
  const beiId = {};
  knoten.forEach(k => { beiId[k.id] = k; });
  fluesse.forEach(f => {
    const a = beiId[f.von], b = beiId[f.nach];
    if (!a || !b) return;
    const my = (k) => k.y + k.h / 2, mx = (k) => k.x + k.w / 2;
    let wp;
    if (a.typ === 'exclusiveGateway' && b.y > a.y + 60) wp = [[mx(a), a.y + a.h], [mx(a), b.y]];
    else if (Math.abs(my(a) - my(b)) > 30) wp = [[mx(a), a.y + a.h], [mx(a), my(b)], [b.x, my(b)]];
    else wp = [[a.x + a.w, my(a)], [b.x, my(b)]];
    di.push(`      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">${
      wp.map(p => `<di:waypoint x="${Math.round(p[0])}" y="${Math.round(p[1])}" />`).join('')}</bpmndi:BPMNEdge>`);
  });

  const name = opt.name || 'Prozess';
  // Jedes erzeugte Modell bekommt seine eigene Kennung – sonst hießen alle
  // „Process_1", und keine Aufrufaktivität könnte eines davon meinen.
  const kennung = prozessKennungGueltig(opt.kennung) ? opt.kennung : prozessKennungNeu();
  // Der Text mit den Markern [[rms:policies=…]] / [[rms:doc=…]] wird
  // hereingereicht, nicht hier gebaut: Er gehört zu prozesse.js, und ein
  // Verweis dorthin würde zwei Dateien aufeinander zeigen lassen.
  const doku = opt.doku
    ? `    <bpmn:documentation>${_psEsc(opt.doku)}</bpmn:documentation>\n` : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_1" name="${_psEsc(name)}" processRef="${kennung}" />
  </bpmn:collaboration>
  <bpmn:process id="${kennung}" isExecutable="false">
${doku}${laneSet}
${elemente}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dia_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collab_1">
${di.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

  return { name, xml, kennung, policyIds: (opt.policyIds || []).map(String), docs: opt.docs || [] };
}

/** Kurzweg: Text → Modell. */
function prozessXmlAusText(text, name, policyIds, docs) {
  return prozessXmlBauen({ name, schritte: prozessTextLesen(text), policyIds, docs });
}

/* ── 5) Die Prüfung ──────────────────────────────────────────────────────── */

/* Gelesen wird mit regulären Ausdrücken statt mit einem XML-Parser: Das Modul
   läuft auch im Test ohne DOM, und geprüft wird die Struktur, nicht der
   Zeichensatz. Ein Modell, das an einem Regex vorbeikommt, aber die Regel
   verletzt, wäre ein Fehler dieser Prüfung – nicht des Schemas. */

const PS_KNOTEN_RE = /<bpmn:(startEvent|endEvent|userTask|serviceTask|manualTask|task|scriptTask|sendTask|receiveTask|businessRuleTask|exclusiveGateway|parallelGateway|inclusiveGateway|intermediateCatchEvent|intermediateThrowEvent|subProcess|callActivity)\b([^>]*)>/g;
/* Zwei großgeschriebene Wörter sehen aus wie ein Name, sind aber oft ein
   System oder eine Stelle: „Power Automate", „Exchange Online", „Technische Leitung". */
const PS_KEINE_PERSON = /\b(automate|online|teams|server|system|systeme|portal|app|apps|cloud|service|dienst|dienste|team|leitung|abteilung|werk|management|einkauf|vertrieb|buchhaltung|personal|kunde|kunden|lieferant|bank|workflow|flow|konverter|monitoring|sharepoint|outlook|office|azure|purview)\b/i;
const PS_ATTR = (roh, name) => {
  const m = new RegExp(name + '="([^"]*)"').exec(roh || '');
  return m ? m[1] : '';
};

/**
 * Ein Modell gegen das Hausschema prüfen.
 *
 * @returns {{fehler:Array, hinweise:Array, zahlen:object}} – „Fehler" verletzt
 *   eine Regel, „Hinweis" ist eine Empfehlung, die man begründet übergehen darf.
 */
function prozessSchemaPruefen(xml, opt) {
  const o = opt || {};
  const s = String(xml || '');
  const fehler = [], hinweise = [];
  // Jeder Befund nennt das Element, an dem er hängt. Die Ansicht zeigt ihn dort
  // an und springt beim Klick hin; ohne Kennung bliebe nur der Text.
  const melde = (regel, text, id) => fehler.push({ regel, text, id: id || '' });
  const rate = (regel, text, id) => hinweise.push({ regel, text, id: id || '' });

  const knoten = [];
  let m;
  PS_KNOTEN_RE.lastIndex = 0;
  while ((m = PS_KNOTEN_RE.exec(s))) {
    knoten.push({ typ: m[1], id: PS_ATTR(m[2], 'id'), name: _psText(PS_ATTR(m[2], 'name')) });
  }
  const fluesse = [...s.matchAll(/<bpmn:sequenceFlow\b([^>]*)>/g)].map(x => ({
    id: PS_ATTR(x[1], 'id'), von: PS_ATTR(x[1], 'sourceRef'),
    nach: PS_ATTR(x[1], 'targetRef'), name: _psText(PS_ATTR(x[1], 'name')),
  }));
  const bahnen = [...s.matchAll(/<bpmn:lane\b([^>]*)>([\s\S]*?)<\/bpmn:lane>/g)].map(x => ({
    id: PS_ATTR(x[1], 'id'), name: _psText(PS_ATTR(x[1], 'name')),
    knoten: [...x[2].matchAll(/<bpmn:flowNodeRef>([^<]+)<\/bpmn:flowNodeRef>/g)].map(y => y[1]),
  }));

  const zahlen = {
    knoten: knoten.length, fluesse: fluesse.length, bahnen: bahnen.length,
    mensch: knoten.filter(k => k.typ === 'userTask').length,
    automatik: knoten.filter(k => k.typ === 'serviceTask').length,
    handgriff: knoten.filter(k => k.typ === 'manualTask').length,
    unterprozesse: knoten.filter(k => k.typ === 'callActivity').length,
  };

  // R1 – genau ein Auslöser
  const starts = knoten.filter(k => k.typ === 'startEvent');
  if (!starts.length) melde('R1', 'Kein Auslöser: Der Prozess hat keinen Anfang.');
  else if (starts.length > 1) melde('R1', `${starts.length} Auslöser: Das sind ${starts.length} Prozesse.`, starts[1].id);

  // R2 – Ergebnisse
  const enden = knoten.filter(k => k.typ === 'endEvent');
  if (!enden.length) melde('R2', 'Kein Ergebnis: Es steht nicht da, wie der Prozess ausgeht.');
  enden.filter(k => !String(k.name || '').trim()).forEach(k =>
    melde('R2', 'Ein Ergebnis ist unbenannt. „Ende" allein sagt nicht, wie es ausging.', k.id));

  // R3 – keine nackten Aufgaben
  knoten.filter(k => k.typ === 'task').forEach(k =>
    melde('R3', `„${k.name || k.id}" ist eine Aufgabe ohne Typ. Tut es ein 👤 Mensch, ein ⚙ System, oder ist es ein ✋ Handgriff?`, k.id));
  ['scriptTask', 'sendTask', 'receiveTask', 'businessRuleTask'].forEach(t =>
    knoten.filter(k => k.typ === t).forEach(k =>
      rate('R3', `„${k.name || k.id}" nutzt ${t}. Das Hausschema kennt nur 👤, ⚙ und ✋.`, k.id)));

  // R4 – jeder Knoten in genau einer Bahn
  if (!bahnen.length) {
    melde('R4', 'Keine Bahnen: Es steht nirgends, wer zuständig ist.');
  } else {
    const zugeordnet = new Map();
    bahnen.forEach(b => b.knoten.forEach(id => zugeordnet.set(id, (zugeordnet.get(id) || 0) + 1)));
    knoten.filter(k => !zugeordnet.has(k.id)).forEach(k =>
      melde('R4', `„${k.name || k.id}" liegt in keiner Bahn. Wer ist dafür zuständig?`, k.id));
    [...zugeordnet].filter(([, n]) => n > 1).forEach(([id]) =>
      melde('R4', `„${id}" liegt in mehreren Bahnen, damit ist die Zuständigkeit nicht entscheidbar.`, id));
  }

  // R5 – Rollen, keine Personen
  bahnen.forEach(b => {
    const nm = String(b.name || '').trim();
    if (!nm) { melde('R5', 'Eine Bahn ist unbenannt.', b.id); return; }
    if (/@/.test(nm)) melde('R5', `Bahn „${nm}" nennt eine E-Mail-Adresse. Bahnen tragen Rollen.`, b.id);
    else if (/^[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+$/.test(nm) && !PS_KEINE_PERSON.test(nm))
      rate('R5', `Bahn „${nm}" sieht nach einem Personennamen aus. Gemeint ist die Rolle.`, b.id);
  });

  // R6 – Entscheidungen
  knoten.filter(k => k.typ === 'exclusiveGateway').forEach(k => {
    const raus = fluesse.filter(f => f.von === k.id);
    if (raus.length < 2) melde('R6', `Entscheidung „${k.name || k.id}" hat ${raus.length ? 'nur einen Ausgang' : 'keinen Ausgang'}. Sie braucht mindestens zwei.`, k.id);
    raus.filter(f => !String(f.name || '').trim()).forEach(f =>
      melde('R6', `Ein Ausgang von „${k.name || k.id}" ist unbeschriftet. Wann gilt er?`, f.id || k.id));
    if (!/\?\s*$/.test(String(k.name || '').trim()))
      rate('R8', `Entscheidung „${k.name || k.id}" ist keine Frage. Ein Fragezeichen macht sie eindeutig.`, k.id);
  });

  // R7 – nichts hängt lose
  const hatEin = new Set(fluesse.map(f => f.nach));
  const hatAus = new Set(fluesse.map(f => f.von));
  knoten.forEach(k => {
    if (k.typ !== 'startEvent' && !hatEin.has(k.id))
      melde('R7', `„${k.name || k.id}" hat keinen Eingang. Wie kommt der Prozess dorthin?`, k.id);
    if (k.typ !== 'endEvent' && !hatAus.has(k.id))
      melde('R7', `„${k.name || k.id}" hat keinen Ausgang. Wie geht es weiter?`, k.id);
  });

  // R8 – Benennung der Aufgaben
  knoten.filter(k => /Task$/.test(k.typ)).forEach(k => {
    const nm = String(k.name || '').trim();
    if (!nm) { melde('R8', 'Eine Aufgabe ist unbenannt.', k.id); return; }
    // Ein Verb im Infinitiv endet auf -en oder -n. Grob, aber es fängt genau
    // den häufigen Fall „Rechnungsprüfung" statt „Rechnung prüfen".
    if (!/\b\w+e?n\b\s*$/.test(nm.replace(/\s*\([^)]*\)\s*$/, '')))
      rate('R8', `„${nm}" endet nicht auf einem Verb: „Rechnung prüfen" statt „Rechnungsprüfung".`, k.id);
  });

  // R9 – Regelwerksbezug (der Aufrufer weiß, ob welche verknüpft sind)
  if (o.policyIds && !o.policyIds.length)
    rate('R9', 'Keine Richtlinie verknüpft. Ein Ablauf ohne Regelwerk ist Gewohnheit, keine Vorgabe.');

  // R10 – Unterprozesse werden eingebunden, nicht abgeschrieben. Eine ⊞ ohne
  // Modell ist ein Versprechen; ein ausgeschriebener Unterprozess ist eine
  // Kopie, die beim nächsten Modell schon anders aussieht.
  [...s.matchAll(/<bpmn:callActivity\b([^>]*?)(?:\/>|>([\s\S]*?)<\/bpmn:callActivity>)/g)].forEach(x => {
    const nm = PS_ATTR(x[1], 'name') || PS_ATTR(x[1], 'id');
    const hatModell = /\[\[rms:modell=[^\]]+\]\]/.test(x[2] || '') || !!PS_ATTR(x[1], 'calledElement');
    if (!hatModell) melde('R10', `⊞ „${nm}" bindet kein Modell ein. Welcher Prozess läuft hier?`, PS_ATTR(x[1], 'id'));
  });
  knoten.filter(k => k.typ === 'subProcess').forEach(k =>
    rate('R10', `„${k.name || k.id}" ist ein ausgeschriebener Unterprozess. Als eigenes Modell anlegen und einbinden, dann gibt es ihn genau einmal.`, k.id));

  // Der Name der Stelle, damit die Ansicht mehrere Befunde einer Regel als
  // eine Zeile mit anklickbaren Stellen zeigen kann.
  const namen = {};
  knoten.forEach(k => { namen[k.id] = k.name || k.id; });
  bahnen.forEach(b => { namen[b.id] = b.name || 'Bahn'; });
  fluesse.forEach(f => { namen[f.id] = f.name || ('Ausgang von „' + (namen[f.von] || f.von) + '"'); });
  fehler.concat(hinweise).forEach(f => { f.name = f.id ? (namen[f.id] || f.id) : ''; });

  return { fehler, hinweise, zahlen };
}

/* ── 5b) Die Ansicht: Farbe je Baustein, Ablauf als Schrittliste ───────── */

/* Dieselben Farben und dieselbe Bedeutung wie auf der Prozessseite der
   E-Rechnung: Orange tut ein Mensch, Blau läuft von selbst, Violett ist ein
   eingebundener Prozess, Gold eine Entscheidung, Grün Anfang und gutes Ende,
   Rot ein Ende, das niemand will. Wer beide Seiten kennt, liest beide gleich. */
const PROZESS_ARTEN = {
  start:     { titel: 'Auslöser',           symbol: '○',  fill: '#DDF3E4', stroke: '#1E7B3A' },
  mensch:    { titel: 'Mensch',             symbol: '👤', fill: '#FFE3C8', stroke: '#C2410C' },
  automatik: { titel: 'Automatik',          symbol: '⚙',  fill: '#D8E8F8', stroke: '#17509E' },
  handgriff: { titel: 'Handgriff',          symbol: '✋', fill: '#E6E6E4', stroke: '#424241' },
  unter:     { titel: 'Unterprozess',       symbol: '⊞',  fill: '#E6DDF7', stroke: '#5B3FA8' },
  frage:     { titel: 'Entscheidung',       symbol: '◇',  fill: '#FFF8DB', stroke: '#8A6100' },
  parallel:  { titel: 'Aufteilung',         symbol: '✛',  fill: '#FFF8DB', stroke: '#8A6100' },
  warten:    { titel: 'Warten',             symbol: '⏱',  fill: '#F1F1F3', stroke: '#8A8F98' },
  ende:      { titel: 'Ergebnis',           symbol: '◎',  fill: '#DDF3E4', stroke: '#1E7B3A' },
  abbruch:   { titel: 'Ergebnis, negativ',  symbol: '⊗',  fill: '#FDE2E1', stroke: '#B42318' },
  ohne:      { titel: 'Aufgabe ohne Typ',   symbol: '▭',  fill: '#FFFFFF', stroke: '#8A8F98' },
};

/* Ein Ergebnis, das niemand will, sagt es im Namen. */
const PS_ABBRUCH_RE = /abgelehnt|zurückgewiesen|zurueckgewiesen|abgebrochen|gescheitert|fehlgeschlagen|verworfen|storniert|eskaliert|nicht\s+(erteilt|genehmigt|freigegeben|bestanden|möglich|zulässig|erfolgt)/i;

/** BPMN-Typ und Name → Art (Schlüssel in PROZESS_ARTEN); leer für Unbekanntes. */
function prozessArt(typ, name) {
  switch (String(typ || '').replace(/^bpmn:/, '')) {
    case 'startEvent': return 'start';
    case 'endEvent': return PS_ABBRUCH_RE.test(String(name || '')) ? 'abbruch' : 'ende';
    case 'userTask': return 'mensch';
    case 'serviceTask': case 'scriptTask': case 'sendTask': case 'receiveTask': case 'businessRuleTask': return 'automatik';
    case 'manualTask': return 'handgriff';
    case 'callActivity': case 'subProcess': return 'unter';
    case 'exclusiveGateway': case 'inclusiveGateway': case 'eventBasedGateway': case 'complexGateway': return 'frage';
    case 'parallelGateway': return 'parallel';
    case 'intermediateCatchEvent': case 'intermediateThrowEvent': case 'boundaryEvent': return 'warten';
    case 'task': return 'ohne';
    default: return '';
  }
}

/** Entitäten aus einem Attribut: Im Modell steht „&amp;", gezeigt wird „&". */
function _psText(s) {
  // bpmn-js schreibt „&" als &#38; und „<" als &#60;. Zuerst die Zeilenumbrüche
  // (im Namen ein Leerzeichen), dann alle Zahlen, &amp; zuletzt: Sonst würde aus
  // einem geschriebenen „&amp;#38;" fälschlich ein „&".
  return String(s || '').replace(/&#10;|&#xA;/gi, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Das Modell als Schrittliste, für alle, die kein BPMN lesen.
 *
 * Gelesen wird vom Auslöser aus, der Hauptweg zuerst: Ein unbeschrifteter oder
 * mit „ja" beschrifteter Ausgang kommt vor den anderen, so steht der Regelfall
 * oben und die Abzweigungen darunter. Was vom Auslöser aus nicht erreichbar
 * ist, hängt hinten an und ist markiert. Eine Übergabe ist jeder Fluss, der
 * die Bahn wechselt: Dort wartet ein Vorgang auf jemand anderen, und dort geht
 * er am ehesten verloren.
 *
 * @returns {{schritte:Array, uebergaben:Array, zahlen:object}}
 */
function prozessAblauf(xml) {
  const s = String(xml || '');
  const knoten = [];
  let m;
  PS_KNOTEN_RE.lastIndex = 0;
  while ((m = PS_KNOTEN_RE.exec(s))) {
    knoten.push({ typ: m[1], id: PS_ATTR(m[2], 'id'), name: _psText(PS_ATTR(m[2], 'name')) });
  }
  const fluesse = [...s.matchAll(/<bpmn:sequenceFlow\b([^>]*)>/g)].map(x => ({
    id: PS_ATTR(x[1], 'id'), von: PS_ATTR(x[1], 'sourceRef'),
    nach: PS_ATTR(x[1], 'targetRef'), name: _psText(PS_ATTR(x[1], 'name')),
  }));
  const bahnVon = {};
  [...s.matchAll(/<bpmn:lane\b([^>]*)>([\s\S]*?)<\/bpmn:lane>/g)].forEach(x => {
    const name = _psText(PS_ATTR(x[1], 'name'));
    [...x[2].matchAll(/<bpmn:flowNodeRef>([^<]+)<\/bpmn:flowNodeRef>/g)].forEach(y => {
      if (!bahnVon[y[1]]) bahnVon[y[1]] = name;
    });
  });

  const beiId = {};
  knoten.forEach(k => { beiId[k.id] = k; });
  const regelfall = (f) => {
    const n = String(f.name || '').trim().toLowerCase();
    return !n || /^(ja|yes|ok|in ordnung|freigegeben|genehmigt|vollständig)$/.test(n) ? 0 : 1;
  };
  const raus = (id) => fluesse.filter(f => f.von === id && beiId[f.nach])
    .map((f, i) => ({ f, i })).sort((a, b) => regelfall(a.f) - regelfall(b.f) || a.i - b.i).map(x => x.f);

  const reihe = [], gesehen = new Set();
  const besuche = (id) => {
    if (gesehen.has(id) || !beiId[id]) return;
    gesehen.add(id);
    reihe.push(beiId[id]);
    raus(id).forEach(f => besuche(f.nach));
  };
  knoten.filter(k => k.typ === 'startEvent').forEach(k => besuche(k.id));
  const erreichbar = new Set(gesehen);
  knoten.filter(k => !gesehen.has(k.id)).forEach(k => { gesehen.add(k.id); reihe.push(k); });

  const nr = {};
  reihe.forEach((k, i) => { nr[k.id] = i + 1; });
  const schritte = reihe.map(k => ({
    nr: nr[k.id], id: k.id, typ: k.typ, art: prozessArt(k.typ, k.name),
    name: k.name, bahn: bahnVon[k.id] || '',
    unerreichbar: !erreichbar.has(k.id),
    aus: raus(k.id).map(f => ({ label: f.name, nach: f.nach, nachNr: nr[f.nach], nachName: beiId[f.nach].name })),
    uebergabeVon: '',
  }));

  // Übergaben: Flüsse, die die Bahn wechseln. Am Ziel vermerkt, wer abgibt.
  const uebergaben = fluesse.filter(f => bahnVon[f.von] && bahnVon[f.nach] && bahnVon[f.von] !== bahnVon[f.nach])
    .map(f => ({ id: f.id, von: f.von, nach: f.nach, vonBahn: bahnVon[f.von], nachBahn: bahnVon[f.nach] }));
  uebergaben.forEach(u => {
    const z = schritte.find(x => x.id === u.nach);
    if (z && !z.uebergabeVon) z.uebergabeVon = u.vonBahn;
  });

  const zaehle = (art) => schritte.filter(x => x.art === art).length;
  const mensch = zaehle('mensch'), automatik = zaehle('automatik'), handgriff = zaehle('handgriff');
  const aufgaben = mensch + automatik + handgriff + zaehle('unter') + zaehle('ohne');
  const zahlen = {
    schritte: schritte.length, aufgaben, mensch, automatik, handgriff,
    unter: zaehle('unter'), entscheidungen: zaehle('frage'), ergebnisse: zaehle('ende') + zaehle('abbruch'),
    bahnen: [...new Set(Object.values(bahnVon))].length, uebergaben: uebergaben.length,
    unerreichbar: schritte.filter(x => x.unerreichbar).length,
    // Anteil der Aufgaben, die ohne Zutun laufen: die Stellschraube beim Optimieren.
    automatikQuote: (mensch + automatik + handgriff) ? Math.round(100 * automatik / (mensch + automatik + handgriff)) : 0,
  };
  return { schritte, uebergaben, zahlen };
}

/* ── 6) Die Vorlage zum Abschreiben ──────────────────────────────────────── */

/**
 * Die Schreibvorlage.
 *
 * Kein Beispiel „irgendein Prozess", sondern einer, den im Haus jede:r kennt –
 * und der alle Bausteine mindestens einmal zeigt, die ein Text zeigen kann
 * (die Aufteilung ✛ und der Unterprozess ⊞ brauchen ein zweites Modell). Wer ihn überschreibt,
 * hat das Schema angewandt, ohne es gelesen zu haben.
 */
const PROZESS_VORLAGE_TEXT = `Start: Bedarf gemeldet
Fachbereich: Bedarf beschreiben und begründen
Fachbereich: Betrag über 5.000 €? | nein: Direkt bei Rahmenvertrag bestellen
Einkauf: Angebote einholen
System: Freigabeanfrage an Leitung senden (automatisch)
Warten: Freigabe der Leitung
Leitung: Freigabe erteilen
Einkauf: Bestellung auslösen
Wareneingang: Ware prüfen und einlagern (manuell)
System: Wareneingang buchen (automatisch)
Ende: Bedarf gedeckt`;

/** Die Vorlage als fertiges Modell. */
function prozessVorlageXml(name) {
  return prozessXmlBauen({
    name: name || 'Vorlage: Beschaffung',
    schritte: prozessTextLesen(PROZESS_VORLAGE_TEXT),
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PROZESS_BAUSTEINE, PROZESS_REGELN, PROZESS_VORLAGE_TEXT, PROZESS_KENNUNG_GENERISCH, PROZESS_ARTEN,
    prozessTextLesen, prozessXmlBauen, prozessXmlAusText, prozessSchemaPruefen, prozessVorlageXml,
    prozessKennungNeu, prozessKennungGueltig, prozessArt, prozessAblauf,
  };
}
