'use strict';

/**
 * BPMN-Anleitung als Word-Datei
 * =============================
 * Für alle, die einen Ablauf beschreiben sollen, aber nicht im RMS arbeiten:
 * Fachbereiche, Werke, Betriebsrat. Sie bekommen eine Datei, die sie ohne
 * Zugang lesen, ausfüllen und zurückschicken können.
 *
 * Inhalt sind dieselben zwei Stufen wie in „BPMN einfach erklärt", ohne die
 * Klickwege im RMS. Dazu kommen Bilder der Zeichen, die Beispiele als Diagramm,
 * ein Spickzettel und eine Vorlage zum Ausfüllen. Ansprechpartner ist, wer die
 * Datei im RMS erzeugt.
 *
 * Die Bilder zeichnet bpmn-js, die Beispiele laufen dafür durch den echten
 * Generator. Das Diagramm in der Datei ist also genau das, was im RMS aus dem
 * Text wird, in den Farben der Ansicht.
 *
 * Die .docx entsteht ohne Bibliothek, wie die Konzept-Skizze im Probelauf: Sie
 * ist ein ZIP aus ein paar XML-Teilen und den Bildern.
 */

const BPMN_ANLEITUNG_TITEL = 'Abläufe beschreiben mit BPMN';
const BPMN_ANLEITUNG_DATEI = 'Abläufe beschreiben mit BPMN.docx';

/* ═══════════════════════════════════════════════════
   Inhalt
   ═══════════════════════════════════════════════════
   Eine Liste von Blöcken, damit der Test sie ohne Browser lesen kann. Im Text
   steht **fett** und `Schreibweise`; die Word-Fassung setzt das eine fett,
   das andere in Schreibmaschinenschrift. Emoji bleiben draußen, Word zeigt sie
   nicht überall. Die Zeichen kommen als Bild. */

/** Die Zeile des Vertiefungsbeispiels, die einen Zusatz zeigt. */
function _baBeispielzeile(merkmal) {
  return String(BPMN_BEISPIEL_VERTIEFUNG).split('\n').find(z => z.includes(merkmal)) || merkmal;
}

/* Name ohne vorangestelltes Symbol: „✋ Handgriff" wird „Handgriff". */
const _baName = (zeichen) => String(zeichen).replace(/^\S+\s+/, '');

/* Der Spickzettel. Der Test baut aus diesen Zeilen ein Modell und prüft, dass
   daraus wirklich wird, was rechts steht. */
const BPMN_SPICKZETTEL = [
  ['Start: Antrag geht ein', 'Auslöser: womit der Ablauf beginnt'],
  ['Einkauf: Angebote einholen', 'Aufgabe in der Bahn „Einkauf"'],
  ['Führungskraft: Antrag freigeben? | nein: Antrag zurückgeben', 'Entscheidung mit einem Weg für ja und einem für nein'],
  ['System: Bestätigung versenden (automatisch)', 'Automatik: läuft ohne Zutun'],
  ['Werkstatt: Probe entnehmen (manuell)', 'Handgriff: Arbeit ohne System'],
  ['Qualität: Ursache analysieren (Unterprozess)', 'Unterprozess: ein eigener Prozess wird eingebunden'],
  ['Warten: Rückmeldung des Werks', 'Warten: der Ablauf ruht, bis etwas eintrifft'],
  ['Ende: Antrag genehmigt', 'Ergebnis: wie die Sache ausgeht'],
];

/**
 * Die Anleitung als Blöcke.
 * @param {{kontakt?:{name:string, mail?:string}, datum?:string}} o
 */
function bpmnAnleitungInhalt(o) {
  const opt = o || {};
  const k = opt.kontakt && opt.kontakt.name ? opt.kontakt : null;
  const an = k ? k.name + (k.mail ? ' (' + k.mail + ')' : '') : '';
  const zeilen = (t) => String(t).split('\n');

  return [
    { art: 'titel', text: BPMN_ANLEITUNG_TITEL },
    { art: 'untertitel', text: 'Eine Anleitung für alle, die einen Arbeitsablauf aufschreiben oder ein Prozessdiagramm lesen sollen' },
    { art: 'klein', text: [opt.datum ? 'Stand ' + opt.datum : '', an ? 'Ansprechpartner: ' + an : ''].filter(Boolean).join(' · ') },

    { art: 'h1', text: 'Worum es geht' },
    { art: 'p', text: 'Wir halten unsere Abläufe als Diagramme fest, in der Zeichensprache BPMN. Ein BPMN-Diagramm liest jede und jeder gleich: wo es losgeht, wer was tut, wo entschieden wird und wie die Sache ausgeht. BPMN ist international genormt (ISO/IEC 19510).' },
    { art: 'p', text: 'Zeichnen müssen Sie dafür nicht, und Sie brauchen auch kein Programm. Sie schreiben den Ablauf Zeile für Zeile auf, so wie eine Notiz. Aus diesen Zeilen entsteht im Regelwerk-Management (RMS) das Diagramm. Sie bekommen es danach zur Durchsicht.' },
    { art: 'h2', text: 'So gehen Sie vor' },
    { art: 'liste', nummern: true, punkte: [
      '**Teil 1** lesen: die sechs Zeichen. Das dauert fünf Minuten.',
      'Den Ablauf nach den vier Regeln aus **Teil 2** aufschreiben, am einfachsten gleich in die **Vorlage** am Ende dieser Datei.',
      an ? 'Die Datei speichern und an ' + an + ' schicken.'
         : 'Die Datei speichern und an die Person schicken, die Sie um die Beschreibung gebeten hat.',
      'Das Diagramm, das Sie zurückbekommen, durchsehen: Stimmt die Reihenfolge, stimmen die Zuständigen?',
    ] },
    { art: 'p', text: '**Teil 3** brauchen Sie erst bei größeren Abläufen. Vor der Vorlage steht alles Wichtige auf einer Seite als Spickzettel.' },

    { art: 'h1', text: 'Teil 1: Ein Diagramm lesen' },
    { art: 'p', text: 'Für den Anfang reichen sechs Zeichen:' },
    { art: 'tabelle', kopf: ['Zeichen', 'Name', 'Bedeutung', 'Beispiel'], breiten: [3.0, 3.1, 6.9, 3.6],
      zeilen: BPMN_ZEICHEN.map(z => [{ bild: 'zeichen-' + z.art, ersatz: _baName(z.zeichen) },
        '**' + _baName(z.zeichen) + '**', z.bedeutung, '„' + z.beispiel + '"']) },
    { art: 'p', text: '**So liest man ein Diagramm:** Von links nach rechts läuft die Zeit, von oben nach unten stehen die Zuständigen, jede Rolle in ihrer Bahn. Die Pfeile geben die Reihenfolge vor. Wo ein Pfeil die Bahn wechselt, wird Arbeit übergeben. An genau diesen Stellen bleibt im Alltag am meisten liegen.' },
    { art: 'p', text: '**Die Farben:** Orange tut ein Mensch, blau läuft automatisch, gold ist eine Entscheidung. Grün sind Anfang und gutes Ende, rot ist ein Ende, das niemand will, etwa „Antrag abgelehnt".' },
    { art: 'bild', bild: 'beispiel-einstieg', unterschrift: 'Beispiel: der Urlaubsantrag. Drei Bahnen, eine Entscheidung, zwei Ergebnisse.' },
    { art: 'p', text: 'Gelesen heißt das: Die Mitarbeitenden erfassen den Antrag. Die Führungskraft entscheidet. Bei ja trägt das Personal den Urlaub ins Zeitkonto ein, und der Urlaub ist genehmigt. Bei nein teilt die Führungskraft die Ablehnung mit, und der Vorgang ist beendet.' },

    { art: 'h1', text: 'Teil 2: Einen Ablauf aufschreiben' },
    { art: 'p', text: 'Vier Regeln genügen:' },
    { art: 'liste', nummern: true, punkte: [
      'Eine Zeile ist ein Schritt. Vorne steht die Rolle, dann ein Doppelpunkt, dann die Tätigkeit: `Einkauf: Angebote einholen`.',
      'Die Tätigkeit endet auf einem Verb: „Antrag prüfen", nicht „Antragsprüfung".',
      'Eine Entscheidung ist eine Frage mit Fragezeichen. Was im Nein-Fall zu tun ist, steht dahinter nach `| nein:`.',
      'Die erste Zeile beginnt mit `Start:`, die letzte mit `Ende:`.',
    ] },
    { art: 'p', text: 'Der Urlaubsantrag aus Teil 1 sieht so aus:' },
    { art: 'code', zeilen: zeilen(BPMN_BEISPIEL_EINSTIEG) },
    { art: 'p', text: 'Aus genau diesen fünf Zeilen ist das Diagramm in Teil 1 entstanden.', nurMitBild: 'beispiel-einstieg' },
    { art: 'p', text: 'Den senkrechten Strich `|` tippen Sie mit der Taste `AltGr` und der Taste `<` links unten.' },
    { art: 'h2', text: 'Damit es gut wird' },
    { art: 'liste', punkte: [
      'Rollen statt Namen: „Einkauf", nicht „Frau Weber". Personen wechseln, Rollen bleiben.',
      'Ein Schritt ist das, was eine Rolle am Stück erledigt. Sobald jemand anderes übernimmt, beginnt eine neue Zeile.',
      'Jedes Ende sagt, wie die Sache ausging: „Urlaub genehmigt", nicht „Ende" oder „fertig".',
      'Offene Fragen gehören unter den Ablauf, nicht hinein. Die Vorlage hat dafür ein eigenes Feld.',
    ] },
    { art: 'h2', text: 'Fertig ist Ihre Beschreibung, wenn' },
    { art: 'liste', punkte: [
      'die erste Zeile mit `Start:` sagt, was den Ablauf auslöst,',
      'jede Zeile eine Rolle und eine Tätigkeit nennt,',
      'jede Tätigkeit auf einem Verb endet,',
      'jede Entscheidung eine Frage ist und der Nein-Fall dahinter steht,',
      'jedes Ende sagt, wie die Sache ausgeht,',
      'Sie wissen, welche Vorgabe der Ablauf umsetzt, etwa eine Richtlinie oder Arbeitsanweisung. Gibt es eine, tragen Sie sie in der Vorlage ein.',
    ] },

    { art: 'h1', text: 'Teil 3: Größere Abläufe' },
    { art: 'p', text: 'Die meisten Abläufe kommen mit Teil 2 aus. Für größere gibt es weitere Zeichen. Sie schreiben sie mit einem Zusatz in Klammern am Ende der Zeile oder mit einem eigenen Zeilenanfang wie `Warten:`.' },
    { art: 'tabelle', kopf: ['Zeichen', 'Name', 'Wofür', 'So schreiben Sie es'], breiten: [3.0, 3.1, 4.8, 5.7],
      zeilen: [
        [{ bild: 'zeichen-automatik', ersatz: 'Automatik' }, '**Automatik**', 'Das System erledigt den Schritt ohne Zutun: Mail, Workflow, Schnittstelle.', { code: _baBeispielzeile('(automatisch)') }],
      ].concat(BPMN_ZEICHEN_MEHR.map(z => [
        { bild: 'zeichen-' + z.art, ersatz: _baName(z.zeichen) }, '**' + _baName(z.zeichen) + '**', z.wofuer,
        z.text ? { code: _baBeispielzeile(z.text.replace('… ', '').replace(' …', '')) }
               : 'Passt in keine Zeile. Schreiben Sie unter den Ablauf, welche Schritte gleichzeitig laufen.',
      ])) },
    { art: 'p', text: 'Heißt die Rolle **System**, **Automatik**, **Workflow** oder **Cron**, gilt der Schritt immer als Automatik.' },
    { art: 'p', text: 'Ein Beispiel mit allen Zusätzen, eine Reklamation:' },
    { art: 'code', zeilen: zeilen(BPMN_BEISPIEL_VERTIEFUNG) },
    { art: 'p', text: 'Das Diagramm dazu ist breiter als diese Seite. Es steht deshalb quer am Ende von Teil 3.', nurMitBild: 'beispiel-vertiefung' },
    { art: 'h2', text: 'Was nicht in eine Zeile passt' },
    { art: 'p', text: 'Manches lässt sich in Zeilen nicht ausdrücken. Schreiben Sie es in Worten unter den Ablauf, im RMS wird es dann nachgezeichnet.' },
    { art: 'tabelle', kopf: ['Fall', 'So schreiben Sie es dazu'], breiten: [4.2, 12.4], zeilen: [
      ['**Nachbessern**', 'Wird nach einem Nein nachgebessert und erneut geprüft: „Nach nein zurück zu: Antrag im Portal erfassen".'],
      ['**Gleichzeitig**', 'Laufen Schritte zur selben Zeit: „Gleichzeitig: Ware prüfen und Rechnung prüfen".'],
      ['**Weiter in einem anderen Prozess**', 'Geht der Ablauf in einen anderen Prozess über: „Weiter im Prozess Wareneingang".'],
      ['**Formular am Schritt**', 'Wird an einem Schritt ein Formular, eine Arbeitsanweisung oder ein Merkblatt gebraucht: Schritt und Dokument nennen und das Dokument mitschicken.'],
    ] },
    { art: 'bild', bild: 'beispiel-vertiefung', quer: true,
      unterschrift: 'Die Reklamation als Diagramm. „Ursache analysieren" ist ein eigener Prozess, der an dieser Stelle eingebunden wird.' },

    { art: 'h1', text: 'Spickzettel', neueSeite: true },
    { art: 'tabelle', kopf: ['Sie schreiben', 'Daraus wird'], breiten: [9.4, 7.2],
      zeilen: BPMN_SPICKZETTEL.map(([text, wird]) => [{ code: text }, wird]) },
    { art: 'hinweis', text: '**Die vier Regeln:** Eine Zeile ist ein Schritt. Vor dem Doppelpunkt steht die Rolle, kein Name. Die Tätigkeit endet auf einem Verb. Eine Entscheidung ist eine Frage, der Nein-Fall steht nach `| nein:`.' },
    { art: 'tabelle', kopf: ['Zeichen', 'Name', 'Zeichen', 'Name'], breiten: [3.0, 5.3, 3.0, 5.3],
      zeilen: (() => {
        const alle = BPMN_ZEICHEN.concat(BPMN_ZEICHEN_MEHR);
        const reihen = [];
        for (let i = 0; i < alle.length; i += 2) {
          const zelle = (z) => z ? [{ bild: 'zeichen-' + z.art, ersatz: _baName(z.zeichen) }, '**' + _baName(z.zeichen) + '**'] : ['', ''];
          reihen.push(zelle(alle[i]).concat(zelle(alle[i + 1])));
        }
        return reihen;
      })() },

    { art: 'h1', text: 'Vorlage: Ihr Ablauf', neueSeite: true },
    { art: 'p', text: 'Füllen Sie die Felder aus und schicken Sie die Datei zurück' + (an ? ' an ' + an : '') + '. Die grauen Beispiele überschreiben Sie einfach.' },
    { art: 'formular', breiten: [4.6, 12.0], zeilen: [
      ['Name des Ablaufs', 'z. B. Urlaub beantragen'],
      ['Verantwortliche Rolle', 'Wer ist für den Ablauf als Ganzes zuständig? z. B. Personal'],
      ['Bereich oder Werk', 'Wo läuft der Ablauf? z. B. alle Werke'],
      ['Zugehörige Vorgabe', 'Falls bekannt: Richtlinie, Arbeitsanweisung, Gesetz'],
      ['Ausgefüllt von', 'Name, Abteilung, Datum'],
    ] },
    { art: 'h2', text: 'Der Ablauf, Zeile für Zeile' },
    { art: 'feld', code: true, zeilen: ['Start: ', 'Rolle: Tätigkeit', 'Rolle: Tätigkeit', 'Rolle: Frage? | nein: Tätigkeit', 'Rolle: Tätigkeit', 'Ende: ', '', '', ''] },
    { art: 'h2', text: 'Offene Fragen und Anmerkungen' },
    { art: 'feld', zeilen: ['z. B. Wer vertritt die Führungskraft im Urlaub?', '', '', '', ''] },
  ];
}

/* ═══════════════════════════════════════════════════
   Word-Datei
   ═══════════════════════════════════════════════════ */

const _BA_FARBE = { navy: '1A2644', azur: '17509E', anthrazit: '424241', grau: '8A8F98', linie: 'C9D3E0', kopf: 'DCE6F2', code: 'F3F6FA' };
const _BA_CM = 567;                      // Twips je Zentimeter
const _BA_EMU = 360000;                  // EMU je Zentimeter
const _BA_SEITE = { b: 11906, h: 16838, rand: 1247 };   // A4, 2,2 cm Rand
const _BA_SATZ_CM = (_BA_SEITE.b - 2 * _BA_SEITE.rand) / _BA_CM;        // nutzbare Breite, rund 16,6 cm
const _BA_SATZ_QUER_CM = (_BA_SEITE.h - 2 * _BA_SEITE.rand) / _BA_CM;   // auf der Querseite, rund 25,3 cm
const _BA_CM_JE_PX_ZEICHEN = 0.021;      // Maßstab der Zeichenbilder in Tabellen

function _baXml(t) {
  return String(t == null ? '' : t)
    .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
}

/** Läufe aus Text mit **fett** und `Schreibweise`. `rpr` gilt für alle. */
function _baLaeufe(text, rpr) {
  const basis = rpr || '';
  return String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map(teil => {
    let eigen = basis, t = teil;
    if (/^\*\*[^*]+\*\*$/.test(teil)) { eigen += '<w:b/>'; t = teil.slice(2, -2); }
    else if (/^`[^`]+`$/.test(teil)) {
      eigen += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="' + _BA_FARBE.code + '"/>';
      t = teil.slice(1, -1);
    }
    return '<w:r>' + (eigen ? '<w:rPr>' + eigen + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + _baXml(t) + '</w:t></w:r>';
  }).join('');
}

/* Seitenformat eines Abschnitts. Steht es in einem Absatz, endet dort der
   Abschnitt; am Ende des Dokuments gilt es für den letzten. */
function _baSektion(quer) {
  const S = _BA_SEITE;
  return '<w:sectPr><w:footerReference w:type="default" r:id="rIdFuss"/>'
    + (quer ? '<w:pgSz w:w="' + S.h + '" w:h="' + S.b + '" w:orient="landscape"/>' : '<w:pgSz w:w="' + S.b + '" w:h="' + S.h + '"/>')
    + '<w:pgMar w:top="' + S.rand + '" w:right="' + S.rand + '" w:bottom="' + S.rand + '" w:left="' + S.rand + '" w:header="567" w:footer="567" w:gutter="0"/>'
    + '</w:sectPr>';
}

/** Ein Absatz. `ppr` sind zusätzliche Absatzeigenschaften in Schemareihenfolge. */
function _baAbsatz(stil, inhalt, ppr) {
  return '<w:p><w:pPr>' + (stil ? '<w:pStyle w:val="' + stil + '"/>' : '') + (ppr || '') + '</w:pPr>' + (inhalt || '') + '</w:p>';
}

/* Ein Bild, eingebettet in die Zeile. */
function _baBildXml(bild, nr, breiteCm) {
  const cx = Math.round(breiteCm * _BA_EMU);
  const cy = Math.round(breiteCm * bild.hoehe / bild.breite * _BA_EMU);
  const name = _baXml(bild.alt || 'Bild ' + nr);
  return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + '<wp:extent cx="' + cx + '" cy="' + cy + '"/>'
    + '<wp:docPr id="' + nr + '" name="Bild ' + nr + '" descr="' + name + '"/>'
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + nr + '" name="bild' + nr + '.png"/><pic:cNvPicPr/></pic:nvPicPr>'
    + '<pic:blipFill><a:blip r:embed="' + bild.rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
    + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

/** Tabelle mit festen Spaltenbreiten (cm). `zellen(zeile, spalte)` liefert den Inhalt einer Zelle. */
function _baTabelle(breiten, reihen, opt) {
  const o = opt || {};
  const tw = breiten.map(b => Math.round(b * _BA_CM));
  const rand = (s) => '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="' + _BA_FARBE.linie + '"/>';
  return '<w:tbl><w:tblPr><w:tblW w:w="' + tw.reduce((a, b) => a + b, 0) + '" w:type="dxa"/>'
    + '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(rand).join('') + '</w:tblBorders>'
    + '<w:tblLayout w:type="fixed"/>'
    + '<w:tblCellMar><w:top w:w="57" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar>'
    + '</w:tblPr><w:tblGrid>' + tw.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>'
    + reihen.map((reihe, r) => {
      const kopf = o.kopf && r === 0;
      return '<w:tr><w:trPr><w:cantSplit/>' + (kopf ? '<w:tblHeader/>' : '') + '</w:trPr>'
        + reihe.map((inhalt, s) => '<w:tc><w:tcPr><w:tcW w:w="' + tw[s] + '" w:type="dxa"/>'
          + ((kopf || (o.ersteSpalte && s === 0)) ? '<w:shd w:val="clear" w:color="auto" w:fill="' + _BA_FARBE.kopf + '"/>' : '')
          + '<w:vAlign w:val="center"/></w:tcPr>' + inhalt + '</w:tc>').join('')
        + '</w:tr>';
    }).join('')
    + '</w:tbl>'
    // Zwei Tabellen hintereinander verschmölze Word zu einer; der Absatz trennt sie.
    + _baAbsatz('', '', '<w:spacing w:before="0" w:after="60"/>');
}

/**
 * Die Word-Datei bauen.
 * @param {Array} bloecke aus bpmnAnleitungInhalt
 * @param {Object<string,{bytes:Uint8Array, breite:number, hoehe:number}>} bilder PNG je Schlüssel; fehlt eines, steht der Name da
 * @param {{autor?:string, zeit?:string}} [meta]
 * @returns {Uint8Array}
 */
function bpmnAnleitungDocx(bloecke, bilder, meta) {
  const enc = new TextEncoder();
  const m = meta || {};
  const medien = [];          // { name, bytes, rid }
  const vorrat = {};          // Schlüssel → Bild mit rid
  let nr = 0;
  const bildVon = (schluessel) => {
    const b = bilder && bilder[schluessel];
    if (!b || !b.bytes || !b.breite || !b.hoehe) return null;
    if (!vorrat[schluessel]) {
      const rid = 'rIdBild' + (medien.length + 1);
      medien.push({ name: 'media/bild' + (medien.length + 1) + '.png', bytes: b.bytes, rid });
      vorrat[schluessel] = { ...b, rid };
    }
    return vorrat[schluessel];
  };

  const zelleText = (inhalt, kopf) => {
    if (inhalt && typeof inhalt === 'object' && inhalt.bild) {
      const b = bildVon(inhalt.bild);
      return b ? _baAbsatz('', _baBildXml(b, ++nr, Math.min(b.breite * _BA_CM_JE_PX_ZEICHEN, 2.9)), '<w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/>')
               : _baAbsatz('', _baLaeufe(inhalt.ersatz || ''), '<w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/>');
    }
    if (inhalt && typeof inhalt === 'object' && inhalt.code) {
      return _baAbsatz('', _baLaeufe(inhalt.code, '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/>'), '<w:spacing w:before="0" w:after="0"/>');
    }
    return _baAbsatz('', _baLaeufe(String(inhalt == null ? '' : inhalt), kopf ? '<w:b/><w:color w:val="' + _BA_FARBE.navy + '"/>' : ''),
      '<w:spacing w:before="0" w:after="0"/>');
  };

  const teile = [];
  for (const b of bloecke) {
    if (b.nurMitBild && !bildVon(b.nurMitBild)) continue;   // verweist auf ein Bild, das fehlt
    const neu = b.neueSeite ? '<w:pageBreakBefore/>' : '';
    switch (b.art) {
      case 'titel': teile.push(_baAbsatz('Title', _baLaeufe(b.text))); break;
      case 'untertitel': teile.push(_baAbsatz('Subtitle', _baLaeufe(b.text))); break;
      case 'klein': if (b.text) teile.push(_baAbsatz('RmsKlein', _baLaeufe(b.text))); break;
      case 'h1': teile.push(_baAbsatz('Heading1', _baLaeufe(b.text), neu)); break;
      case 'h2': teile.push(_baAbsatz('Heading2', _baLaeufe(b.text), neu)); break;
      case 'p': teile.push(_baAbsatz('', _baLaeufe(b.text))); break;
      case 'hinweis': teile.push(_baAbsatz('RmsHinweis', _baLaeufe(b.text))); break;
      case 'liste':
        b.punkte.forEach((pkt, i) => teile.push(_baAbsatz('RmsListe',
          _baLaeufe(b.nummern ? (i + 1) + '.' : '•') + '<w:r><w:tab/></w:r>' + _baLaeufe(pkt))));
        break;
      case 'code':
        b.zeilen.forEach(z => teile.push(_baAbsatz('RmsCode', _baLaeufe(z.split('`').join('')))));
        teile.push(_baAbsatz('', '', '<w:spacing w:before="0" w:after="0"/>'));
        break;
      case 'bild': {
        const bild = bildVon(b.bild);
        if (!bild) break;      // ohne Bild auch keine Unterschrift, die auf eines zeigt
        // Ein breites Diagramm bekommt eine Querseite. Hochkant auf 16 cm
        // gestaucht, wäre seine Schrift kleiner als 4 Punkt.
        if (b.quer) teile.push(_baAbsatz('', '', _baSektion(false)));
        const breite = Math.min(b.quer ? _BA_SATZ_QUER_CM : _BA_SATZ_CM, bild.breite * 0.0265);
        teile.push(_baAbsatz('', _baBildXml(bild, ++nr, breite), '<w:keepNext/><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/>'));
        if (b.unterschrift) teile.push(_baAbsatz('Caption', _baLaeufe(b.unterschrift)));
        if (b.quer) teile.push(_baAbsatz('', '', _baSektion(true)));
        break;
      }
      case 'tabelle':
        teile.push(_baTabelle(b.breiten,
          [b.kopf.map(k => zelleText(k, true))].concat(b.zeilen.map(z => z.map(c => zelleText(c, false)))),
          { kopf: true }));
        break;
      case 'formular':
        teile.push(_baTabelle(b.breiten, b.zeilen.map(([feld, beispiel]) => [
          zelleText('**' + feld + '**', false),
          _baAbsatz('', _baLaeufe(beispiel, '<w:i/><w:color w:val="' + _BA_FARBE.grau + '"/>'), '<w:spacing w:before="40" w:after="40"/>'),
        ]), { ersteSpalte: true }));
        break;
      case 'feld':
        b.zeilen.forEach(z => teile.push(_baAbsatz(b.code ? 'RmsFeldCode' : 'RmsFeld',
          _baLaeufe(z, '<w:color w:val="' + _BA_FARBE.grau + '"/>'))));
        teile.push(_baAbsatz('', '', '<w:spacing w:before="0" w:after="0"/>'));
        break;
      default: break;
    }
  }

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const dokument = KOPF + '<w:document ' + NS + '><w:body>' + teile.join('')
    + _baSektion(false) + '</w:body></w:document>';

  const fuss = KOPF + '<w:ftr ' + NS + '>'
    + _baAbsatz('Footer', _baLaeufe(BPMN_ANLEITUNG_TITEL + ' · Seite ')
      + '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>'
      + _baLaeufe(' von ')
      + '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple>')
    + '</w:ftr>';

  const typen = KOPF + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
    + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '</Types>';

  const paket = KOPF + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '</Relationships>';

  const bezuege = KOPF + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rIdStile" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rIdEinst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
    + '<Relationship Id="rIdFuss" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
    + medien.map(md => '<Relationship Id="' + md.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + md.name + '"/>').join('')
    + '</Relationships>';

  const kern = KOPF + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
    + ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"'
    + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + '<dc:title>' + _baXml(BPMN_ANLEITUNG_TITEL) + '</dc:title>'
    + (m.autor ? '<dc:creator>' + _baXml(m.autor) + '</dc:creator>' : '')
    + '<dc:language>de-DE</dc:language>'
    + (m.zeit ? '<dcterms:created xsi:type="dcterms:W3CDTF">' + _baXml(m.zeit) + '</dcterms:created>' : '')
    + '</cp:coreProperties>';

  const einstellungen = KOPF + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/>'
    + '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
    + '<w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/></w:settings>';

  return _baZip([
    { name: '[Content_Types].xml', bytes: enc.encode(typen) },
    { name: '_rels/.rels', bytes: enc.encode(paket) },
    { name: 'docProps/core.xml', bytes: enc.encode(kern) },
    { name: 'word/document.xml', bytes: enc.encode(dokument) },
    { name: 'word/styles.xml', bytes: enc.encode(_baStile()) },
    { name: 'word/settings.xml', bytes: enc.encode(einstellungen) },
    { name: 'word/footer1.xml', bytes: enc.encode(fuss) },
    { name: 'word/_rels/document.xml.rels', bytes: enc.encode(bezuege) },
  ].concat(medien.map(md => ({ name: 'word/' + md.name, bytes: md.bytes }))));
}

/* Die Formatvorlagen. Überschriften tragen die eingebauten Kennungen, damit
   Word sie im Navigationsbereich und im Inhaltsverzeichnis kennt. Farben aus
   dem Corporate Design, Schrift Arial: Exo ist in Word nicht überall da. */
function _baStile() {
  const F = _BA_FARBE;
  const stil = (id, name, ppr, rpr, extra) => '<w:style w:type="paragraph" w:styleId="' + id + '">'
    + '<w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/>' + (extra || '') + '<w:qFormat/>'
    + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '</w:style>';
  const kasten = (farbe, links) => '<w:pBdr>'
    + '<w:top w:val="single" w:sz="4" w:space="4" w:color="' + farbe + '"/>'
    + '<w:left w:val="single" w:sz="' + (links || 4) + '" w:space="6" w:color="' + farbe + '"/>'
    + '<w:bottom w:val="single" w:sz="4" w:space="4" w:color="' + farbe + '"/>'
    + '<w:right w:val="single" w:sz="4" w:space="6" w:color="' + farbe + '"/></w:pBdr>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>'
    + '<w:color w:val="' + F.anthrazit + '"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="de-DE" w:eastAsia="de-DE" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + stil('Title', 'Title', '<w:spacing w:after="60"/>', '<w:b/><w:color w:val="' + F.navy + '"/><w:sz w:val="48"/><w:szCs w:val="48"/>')
    + stil('Subtitle', 'Subtitle', '<w:spacing w:after="120"/>', '<w:color w:val="' + F.azur + '"/><w:sz w:val="26"/><w:szCs w:val="26"/>')
    + stil('RmsKlein', 'RMS Kleingedrucktes', '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="6" w:color="' + F.azur + '"/></w:pBdr><w:spacing w:after="240"/>',
      '<w:color w:val="' + F.grau + '"/><w:sz w:val="18"/><w:szCs w:val="18"/>')
    + stil('Heading1', 'heading 1', '<w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>',
      '<w:b/><w:color w:val="' + F.azur + '"/><w:sz w:val="32"/><w:szCs w:val="32"/>', '<w:next w:val="Normal"/>')
    + stil('Heading2', 'heading 2', '<w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/>',
      '<w:b/><w:color w:val="' + F.navy + '"/><w:sz w:val="24"/><w:szCs w:val="24"/>', '<w:next w:val="Normal"/>')
    + stil('RmsListe', 'RMS Liste', '<w:spacing w:after="60"/><w:ind w:left="397" w:hanging="397"/>', '')
    + stil('RmsCode', 'RMS Schreibweise', kasten(F.linie) + '<w:shd w:val="clear" w:color="auto" w:fill="' + F.code + '"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="113" w:right="113"/>',
      '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:color w:val="' + F.navy + '"/><w:sz w:val="19"/><w:szCs w:val="19"/>')
    + stil('RmsHinweis', 'RMS Hinweis', kasten(F.azur, 24) + '<w:shd w:val="clear" w:color="auto" w:fill="' + F.code + '"/><w:spacing w:before="120" w:after="200"/><w:ind w:left="113" w:right="113"/>', '')
    + stil('RmsFeld', 'RMS Eingabefeld', kasten(F.linie) + '<w:spacing w:after="0" w:line="300" w:lineRule="auto"/><w:ind w:left="113" w:right="113"/>', '')
    + stil('RmsFeldCode', 'RMS Eingabefeld Schreibweise', kasten(F.linie) + '<w:spacing w:after="0" w:line="300" w:lineRule="auto"/><w:ind w:left="113" w:right="113"/>',
      '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/><w:szCs w:val="19"/>')
    + stil('Caption', 'caption', '<w:spacing w:before="0" w:after="200"/><w:jc w:val="center"/>', '<w:i/><w:color w:val="' + F.grau + '"/><w:sz w:val="18"/><w:szCs w:val="18"/>')
    + stil('Footer', 'footer', '<w:jc w:val="center"/><w:spacing w:after="0"/>', '<w:color w:val="' + F.grau + '"/><w:sz w:val="16"/><w:szCs w:val="16"/>')
    + '</w:styles>';
}

/* ── ZIP ohne Kompression, wie _plZip im Probelauf ── */
let _baCrcTab = null;
function _baCrc32(bytes) {
  if (!_baCrcTab) {
    _baCrcTab = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _baCrcTab[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ _baCrcTab[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _baZip(teile) {
  const enc = new TextEncoder();
  const stuecke = [], zentral = [];
  let versatz = 0;
  const z16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
  const z32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  // Bit 11: Namen in UTF-8. DOS-Datum 1.1.2026, damit gleiche Eingabe gleiche Bytes ergibt.
  const flags = 0x0800, zeit = 0, datum = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const teil of teile) {
    const name = enc.encode(teil.name);
    const crc = _baCrc32(teil.bytes);
    const kopf = [].concat(z32(0x04034b50), z16(20), z16(flags), z16(0), z16(zeit), z16(datum),
      z32(crc), z32(teil.bytes.length), z32(teil.bytes.length), z16(name.length), z16(0));
    stuecke.push(new Uint8Array(kopf), name, teil.bytes);
    zentral.push({ name, crc, laenge: teil.bytes.length, versatz });
    versatz += kopf.length + name.length + teil.bytes.length;
  }
  const start = versatz;
  for (const z of zentral) {
    const kopf = [].concat(z32(0x02014b50), z16(20), z16(20), z16(flags), z16(0), z16(zeit), z16(datum),
      z32(z.crc), z32(z.laenge), z32(z.laenge), z16(z.name.length), z16(0), z16(0), z16(0), z16(0),
      z32(0), z32(z.versatz));
    stuecke.push(new Uint8Array(kopf), z.name);
    versatz += kopf.length + z.name.length;
  }
  stuecke.push(new Uint8Array([].concat(z32(0x06054b50), z16(0), z16(0), z16(zentral.length), z16(zentral.length),
    z32(versatz - start), z32(start), z16(0))));
  const raus = new Uint8Array(stuecke.reduce((n, t) => n + t.length, 0));
  let i = 0;
  for (const t of stuecke) { raus.set(t, i); i += t.length; }
  return raus;
}

/* ═══════════════════════════════════════════════════
   Bilder (nur im Browser)
   ═══════════════════════════════════════════════════ */

/* Ein Blatt mit allen zehn Zeichen. Ereignisse und Rauten ohne Namen, damit
   der Ausschnitt nur das Zeichen zeigt; Aufgaben mit dem Beispiel aus der
   Tabelle, damit man sieht, wo der Text steht. */
function _baZeichenXml() {
  const beispiel = (art) => {
    const z = BPMN_ZEICHEN.concat(BPMN_ZEICHEN_MEHR).find(x => x.art === art);
    return z && z.beispiel ? z.beispiel : '';
  };
  const elemente = [
    ['start', 'startEvent', '', 36, 36],
    ['mensch', 'userTask', beispiel('mensch'), 100, 80],
    ['automatik', 'serviceTask', beispiel('automatik'), 100, 80],
    ['frage', 'exclusiveGateway', '', 50, 50],
    ['ende', 'endEvent', '', 36, 36],
    ['handgriff', 'manualTask', 'Probe entnehmen', 100, 80],
    ['warten', 'intermediateCatchEvent', '', 36, 36],
    ['parallel', 'parallelGateway', '', 50, 50],
    ['unter', 'callActivity', 'Ursache analysieren', 100, 80],
  ];
  let x = 20;
  const lage = {};
  const knoten = [], formen = [];
  for (const [art, typ, name, b, h] of elemente) {
    const id = 'Zeichen_' + art;
    lage[art] = { x, y: 100 - h / 2, b, h };
    const innen = typ === 'intermediateCatchEvent' ? '<bpmn:timerEventDefinition id="' + id + '_frist"/>' : '';
    knoten.push('<bpmn:' + typ + ' id="' + id + '"' + (name ? ' name="' + _baXml(name) + '"' : '') + '>' + innen + '</bpmn:' + typ + '>');
    // Die Raute trägt ihr X wie im erzeugten Diagramm, sonst sähe sie anders aus als dort.
    const marker = typ === 'exclusiveGateway' ? ' isMarkerVisible="true"' : '';
    formen.push('<bpmndi:BPMNShape id="' + id + '_di" bpmnElement="' + id + '"' + marker + '><dc:Bounds x="' + x + '" y="' + (100 - h / 2) + '" width="' + b + '" height="' + h + '"/></bpmndi:BPMNShape>');
    x += b + 40;
  }
  return { lage, xml: _baDefinitionen('<bpmn:process id="Zeichen" isExecutable="false">' + knoten.join('') + '</bpmn:process>',
    '<bpmndi:BPMNPlane id="Zeichen_plane" bpmnElement="Zeichen">' + formen.join('') + '</bpmndi:BPMNPlane>') };
}

/* Die Bahn: ein schmaler Pool mit zwei Bahnen, die erste heißt wie im
   Beispiel. Schmal, damit er in der Tabellenspalte nicht winzig wird. */
function _baBahnXml() {
  const rolle = (BPMN_ZEICHEN.find(z => z.art === 'bahn') || {}).beispiel || 'Einkauf';
  return { lage: { bahn: { x: 0, y: 0, b: 130, h: 120 } }, xml: _baDefinitionen(
    '<bpmn:collaboration id="Bahn_k"><bpmn:participant id="Bahn_pool" name="Ablauf" processRef="Bahn_p"/></bpmn:collaboration>'
    + '<bpmn:process id="Bahn_p" isExecutable="false"><bpmn:laneSet id="Bahn_s">'
    + '<bpmn:lane id="Bahn_1" name="' + _baXml(rolle) + '"/><bpmn:lane id="Bahn_2" name="Lager"/></bpmn:laneSet></bpmn:process>',
    '<bpmndi:BPMNPlane id="Bahn_plane" bpmnElement="Bahn_k">'
    + '<bpmndi:BPMNShape id="Bahn_pool_di" bpmnElement="Bahn_pool" isHorizontal="true"><dc:Bounds x="0" y="0" width="130" height="120"/></bpmndi:BPMNShape>'
    + '<bpmndi:BPMNShape id="Bahn_1_di" bpmnElement="Bahn_1" isHorizontal="true"><dc:Bounds x="30" y="0" width="100" height="60"/></bpmndi:BPMNShape>'
    + '<bpmndi:BPMNShape id="Bahn_2_di" bpmnElement="Bahn_2" isHorizontal="true"><dc:Bounds x="30" y="60" width="100" height="60"/></bpmndi:BPMNShape>'
    + '</bpmndi:BPMNPlane>') };
}

function _baDefinitionen(inhalt, ebene) {
  return '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"'
    + ' xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"'
    + ' xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Anleitung" targetNamespace="http://bpmn.io/schema/bpmn">'
    + inhalt + '<bpmndi:BPMNDiagram id="Anleitung_d">' + ebene + '</bpmndi:BPMNDiagram></bpmn:definitions>';
}

/** bpmn-js holen, falls der Reiter es noch nicht geladen hat (in der Dokumentation nicht). */
function _baBpmnLaden() {
  if (typeof window !== 'undefined' && window.BpmnJS) return Promise.resolve();
  if (typeof _ensureBpmnLib === 'function') return _ensureBpmnLib();
  return new Promise((ok, fehler) => {
    const s = document.createElement('script');
    s.src = 'vendor/bpmn-js/bpmn-modeler.production.min.js';
    s.onload = () => ok();
    s.onerror = () => fehler(new Error('bpmn-js konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

/** BPMN zeichnen lassen und als SVG holen, in den Farben der Ansicht. */
async function _baZeichnen(xml) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-20000px;top:0;width:2000px;height:1200px;visibility:hidden';
  document.body.appendChild(box);
  const Ansicht = window.BpmnJS.Viewer || window.BpmnJS;
  const viewer = new Ansicht({ container: box });
  try {
    await viewer.importXML(xml);
    const { svg } = await viewer.saveSVG();
    const arten = {};
    viewer.get('elementRegistry').getAll().forEach(el => {
      if (el.labelTarget || !el.businessObject) return;
      arten[el.id] = { typ: String(el.type || '').replace(/^bpmn:/, ''), name: el.businessObject.name || '' };
    });
    return _baFaerben(svg, arten);
  } finally {
    viewer.destroy();
    box.remove();
  }
}

/* Wie _procSvgFaerben in der Ansicht: Im Browser kommen die Farben aus
   Stilregeln, ein Bild braucht sie an jeder Form. */
function _baFaerben(svg, arten) {
  if (typeof PROZESS_ARTEN === 'undefined' || typeof prozessArt !== 'function') return svg;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  let bahn = 0;
  doc.querySelectorAll('g.djs-element[data-element-id]').forEach(g => {
    const el = arten[g.getAttribute('data-element-id')];
    const visual = [...g.children].find(n => /\bdjs-visual\b/.test(n.getAttribute('class') || ''));
    if (!el || !visual) return;
    if (el.typ === 'Lane') {
      if (bahn++ % 2) { const r = visual.querySelector('rect'); if (r) r.style.fill = '#F6F8FB'; }
      return;
    }
    const art = prozessArt(el.typ.charAt(0).toLowerCase() + el.typ.slice(1), el.name);
    const a = art && PROZESS_ARTEN[art];
    if (!a) return;
    [...visual.children].forEach(n => {
      const tag = n.tagName.toLowerCase();
      if (tag === 'rect' || tag === 'circle' || tag === 'polygon') { n.style.fill = a.fill; n.style.stroke = a.stroke; }
      else if (tag === 'path') {
        n.style.stroke = a.stroke;
        if (art === 'frage' || art === 'parallel') n.style.fill = a.stroke;
      }
    });
  });
  return new XMLSerializer().serializeToString(doc);
}

/** Ausschnitt eines SVG (Diagrammkoordinaten) mit etwas Rand. */
function _baAusschnitt(svg, l) {
  const rand = 6;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const wurzel = doc.documentElement;
  wurzel.setAttribute('viewBox', [l.x - rand, l.y - rand, l.b + 2 * rand, l.h + 2 * rand].join(' '));
  wurzel.setAttribute('width', l.b + 2 * rand);
  wurzel.setAttribute('height', l.h + 2 * rand);
  return new XMLSerializer().serializeToString(doc);
}

/** SVG als PNG, `skala`-fach aufgelöst, damit es auch gedruckt scharf bleibt. */
async function _baPng(svg, skala, alt) {
  const wurzel = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const breite = parseFloat(wurzel.getAttribute('width')), hoehe = parseFloat(wurzel.getAttribute('height'));
  const bild = new Image();
  bild.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await bild.decode();
  const c = document.createElement('canvas');
  c.width = Math.ceil(breite * skala); c.height = Math.ceil(hoehe * skala);
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bild, 0, 0, c.width, c.height);
  const blob = await new Promise((ok, fehler) => c.toBlob(b => (b ? ok(b) : fehler(new Error('Bild leer'))), 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), breite, hoehe, alt };
}

/** Alle Bilder der Anleitung: zehn Zeichen und die beiden Beispiele. */
async function _baBilder() {
  await _baBpmnLaden();
  const bilder = {};
  const alle = BPMN_ZEICHEN.concat(BPMN_ZEICHEN_MEHR);
  for (const blatt of [_baZeichenXml(), _baBahnXml()]) {
    const svg = await _baZeichnen(blatt.xml);
    for (const [art, l] of Object.entries(blatt.lage)) {
      const z = alle.find(x => x.art === art);
      bilder['zeichen-' + art] = await _baPng(_baAusschnitt(svg, l), 4, z ? _baName(z.zeichen) : art);
    }
  }
  const beispiele = [
    ['beispiel-einstieg', 'Urlaubsantrag', BPMN_BEISPIEL_EINSTIEG],
    ['beispiel-vertiefung', 'Reklamation', BPMN_BEISPIEL_VERTIEFUNG],
  ];
  for (const [schluessel, name, text] of beispiele) {
    const xml = prozessXmlBauen({ name, schritte: prozessTextLesen(text) }).xml;
    bilder[schluessel] = await _baPng(await _baZeichnen(xml), 2.5, 'Beispiel als Diagramm: ' + name);
  }
  return bilder;
}

/* ═══════════════════════════════════════════════════
   Herunterladen
   ═══════════════════════════════════════════════════ */

let _baLaeuft = false;

/** Knopf „📄 Word-Anleitung zum Weitergeben" im Modeler-Dialog und in der Dokumentation. */
async function bpmnAnleitungHerunterladen() {
  if (_baLaeuft) return;
  _baLaeuft = true;
  try {
    toast('Die Anleitung wird erstellt …');
    // Ohne Bilder ist die Anleitung schwächer, aber nicht falsch. Lieber sie so
    // ausliefern als gar nicht.
    let bilder = {};
    try { bilder = await _baBilder(); }
    catch (e) { console.warn('[bpmnanleitung] Bilder:', e.message); }
    const u = (typeof State !== 'undefined' && State.user) || {};
    const kontakt = u.name ? { name: u.name, mail: /@/.test(u.upn || '') ? u.upn : '' } : null;
    const jetzt = new Date();
    const bytes = bpmnAnleitungDocx(
      bpmnAnleitungInhalt({ kontakt, datum: jetzt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }),
      bilder, { autor: kontakt && kontakt.name, zeit: jetzt.toISOString().slice(0, 19) + 'Z' });
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = BPMN_ANLEITUNG_DATEI;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(Object.keys(bilder).length ? 'Anleitung gespeichert ✓' : 'Anleitung gespeichert, aber ohne Bilder', Object.keys(bilder).length ? 'success' : 'error');
  } catch (e) {
    toast('Die Anleitung konnte nicht erstellt werden: ' + e.message, 'error');
  } finally {
    _baLaeuft = false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BPMN_ANLEITUNG_TITEL, BPMN_ANLEITUNG_DATEI, BPMN_SPICKZETTEL, bpmnAnleitungInhalt, bpmnAnleitungDocx };
}
