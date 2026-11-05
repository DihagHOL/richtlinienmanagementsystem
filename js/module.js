'use strict';

/**
 * Module bei Bedarf nachladen
 * ===========================
 * Gemessener Anlass: Die Seite lud **1.421 KB JavaScript in 36 Dateien** – bei
 * jedem Aufruf. Davon waren **240 KB** das, was jede:r braucht (Anmeldung,
 * Regelwerke lesen, bestätigen, Wissenstest); die übrigen **1.181 KB** gehörten
 * zu Reitern, die für die meisten Konten gar nicht freigeschaltet sind. Weil
 * das Cache-Busting bei jedem Push eine neue Version erzwingt, wurde diese
 * Fracht auch noch regelmäßig neu geholt.
 *
 * Jetzt lädt der Kern sofort, alles andere erst beim Reiterwechsel.
 *
 * **Warum das hier ohne ES-Module geht:** Alle Skripte teilen einen globalen
 * Scope. Ein zur Laufzeit eingehängtes `<script>` landet in genau demselben –
 * die 459 Inline-Handler finden ihre Funktionen also weiterhin. Ein echter
 * Modulwechsel (`type="module"`) würde genau das zerstören.
 *
 * **Die Gruppen sind von Hand gepflegt, aber nicht geraten:** Ein Test rechnet
 * die harte Abhängigkeitshülle je Ansicht aus und besteht nur, wenn jede
 * Gruppe darunter abgeschlossen ist. Eine vergessene Datei nennt er beim Namen.
 * „Hart" heißt: nicht durch `typeof x === 'function'` abgesichert – ein
 * abgesicherter Aufruf fällt sauber aus, ein ungesicherter ist ein
 * ReferenceError.
 */

/* Der Kern steht als <script>-Tag in der index.html und ist immer da. */
const MODUL_KERN = ['util', 'mailbau', 'auth', 'access', 'sharepoint', 'quiz', 'app'];

/* Der Verwaltungsblock. Diese Dateien rufen einander gegenseitig ungesichert
   auf – admin ↔ freigaben ↔ konzepte ↔ einstellungen ↔ clevelreport hängen
   zyklisch zusammen. Sie zu trennen hieße echte Zyklen aufzubrechen; das ist
   eine eigene Aufgabe und keine Nebenwirkung des Nachladens. */
/* Die Reihenfolge ist die der bisherigen <script>-Tags. Sie sollte gleichgültig
   sein – es sind nur Deklarationen –, aber sie zu ändern wäre eine Wette ohne
   Gewinn. */
const MODUL_ADMIN = ['normen', 'health', 'admin', 'freigaben', 'einstellungen', 'konzepte',
  'abdeckung', 'soa', 'reifegrad-katalog', 'reifegrad-seed', 'reifegrad',
  'risiken', 'ausnahmen', 'wirksamkeit', 'notfallmodell', 'assetmodell', 'vorfallmodell', 'wissenmodell',
  // Die Modelle von Maßnahmen, Zielen und Kennzahlen: Audit Report und Cockpit rechnen damit.
  'massnahmenmodell', 'zielmodell', 'kennzahlmodell', 'clevelreport'];

/** Was eine Ansicht braucht, bevor sie gezeichnet wird. */
const MODUL_ANSICHTEN = {
  // „Meine Regelwerke", Detailansicht und Wissenstest kommen mit dem Kern aus.
  meine:  [],
  detail: ['ismsdocs'],   // „Änderung vorschlagen" lebt dort
  quiz:   [],

  cockpit:       MODUL_ADMIN.concat(['cockpit']),
  verwaltung:    MODUL_ADMIN,
  freigaben:     MODUL_ADMIN,
  einstellungen: MODUL_ADMIN,
  compliance:    MODUL_ADMIN,
  faelligkeit:   MODUL_ADMIN.concat(['prozessmodell', 'faelligkeit']),
  ismsdocs:      MODUL_ADMIN.concat(['ismsdocs']),
  governance:    MODUL_ADMIN.concat(['governance']),
  // notfall steht bei den Prozessen, weil der Kachel-Dialog der Landkarte den
  // Notfall-Stand zeigt und den Plan öffnet – dieselbe Kachel, zwei Reiter.
  prozesse:      MODUL_ADMIN.concat(['prozessschema', 'rmsprozesse', 'bpmndeutsch', 'bpmnhilfe', 'bpmnanleitung', 'prozessmodell', 'prozesse', 'prozessfreigabe', 'prozessvergleich', 'landkarte', 'prozessmatrix', 'prozessbacklog', 'mindmapbaum', 'verknuepfungen', 'notfall']),
  // Die Notfall-Ansicht rechnet auf der Landkarte und legt Übungen im
  // Wirksamkeits-Register an – beides muss da sein. Der Editor (prozesse)
  // steht dabei, weil der Kachel-Dialog der Landkarte ihn öffnen kann.
  notfall:       MODUL_ADMIN.concat(['prozessschema', 'rmsprozesse', 'bpmndeutsch', 'bpmnhilfe', 'bpmnanleitung', 'prozessmodell', 'prozesse', 'prozessfreigabe', 'prozessvergleich', 'landkarte', 'notfall']),
  vorfaelle:     MODUL_ADMIN.concat(['vorfaelle']),
  // Die Bibliothek ist für alle da und braucht den Verwaltungsblock nicht:
  // Modell und Ansicht, mehr nicht – so bleibt der Reiter für 1.000 Leser leicht.
  wissen:        ['wissenmodell', 'wissen'],
  // Das Assetregister: Modell im Verwaltungsblock (Report, Notfall, Risiken
  // rechnen damit), die Ansicht nur hier.
  assets:        MODUL_ADMIN.concat(['assets']),
  // Ziele, Maßnahmen, Kennzahlen. Am Ziel legt man Maßnahmen an (massnahmen.js),
  // die Kennzahlen messen mit dem Audit Report (_clevelGather) und lesen die
  // Prozesskennzahlen über das Prozessmodell.
  massnahmen:    MODUL_ADMIN.concat(['massnahmen']),
  ziele:         MODUL_ADMIN.concat(['massnahmen', 'ziele']),
  kennzahlen:    MODUL_ADMIN.concat(['prozessmodell', 'kennzahlen']),
  anleitung:     MODUL_ADMIN.concat(['probelauf', 'tour', 'anleitung']),
  // Kein Reiter, aber eine eigene Lage: Ein laufender Probelauf (?probelauf=1)
  // beginnt auf „Meine Regelwerke". Sein Streifen bietet trotzdem Führung und
  // Selbsttest an, und die gehen die ganze Kette durch. probelauf.js lädt das
  // beim Aktivieren nach (probelaufModule); der Test unten prüft die Hülle.
  probelauf:     MODUL_ADMIN.concat(['probelauf', 'tour']),

  // Diese stehen für sich – sie brauchen den Verwaltungsblock nicht.
  govstruktur:  ['govstruktur'],
  abdeckung:    ['normen', 'abdeckung', 'soa', 'reifegrad-katalog', 'reifegrad-seed', 'reifegrad'],
  risiken:      ['normen', 'risiken'],
  ausnahmen:    ['normen', 'risiken', 'ausnahmen'],
  // Die vierte Satzart (Notfallübung) liest ihre Übungsarten aus dem Modell.
  wirksamkeit:  ['notfallmodell', 'wirksamkeit'],
  vorschlaege:  ['proposals'],
  // prozessschema steht dabei, weil der Abschnitt „Prozesse niederschreiben"
  // seine Tabellen AUS dessen Daten baut. Ohne das Modul blieben sie leer –
  // die Wächter fangen den Fehler ab, aber eine leere Tabelle ist auch keine
  // Auskunft. bpmnhilfe liefert den Abschnitt „BPMN einfach erklärt", den auch
  // der Modeler als Hilfe zeigt. bpmndeutsch nennt ihr die deutschen Texte des
  // Modelers, bpmnanleitung baut daraus die Word-Fassung zum Weitergeben.
  dokumentation: ['prozessschema', 'rmsprozesse', 'bpmndeutsch', 'bpmnhilfe', 'bpmnanleitung', 'notfallmodell', 'assetmodell', 'vorfallmodell', 'dokumentation'],
};

const _modulGeladen = new Map();   // Name → Promise (auch der abgeschlossene Lauf)

/* Die Prüfsummen der nachladbaren Dateien. scripts/cache-version.mjs schreibt
   diese Zeile nach jedem Push neu, von Hand ändert sie niemand. */
/** @type {Record<string, string>} */
const MODUL_VERSIONEN = {"abdeckung":"603fbbe8","admin":"869a0f3f","anleitung":"24306c49","assetmodell":"98b96f47","assets":"7754a2ad","ausnahmen":"5b7cb81e","bpmnanleitung":"6393b4ae","bpmndeutsch":"761b2e71","bpmnhilfe":"9e27eb02","clevelreport":"09aed82b","cockpit":"d6ab060d","dokumentation":"b20aaf36","einstellungen":"569fdec8","faelligkeit":"018375fc","freigaben":"abb7e4f1","governance":"737081f7","govstruktur":"f62dd43e","health":"73a5afe2","ismsdocs":"b967a862","kennzahlen":"062c1464","kennzahlmodell":"c06a8f7d","konzepte":"4167e6b8","landkarte":"9535049c","massnahmen":"82f707b8","massnahmenmodell":"40fd1d55","mindmapbaum":"1d139bda","normen":"e0a21e76","notfall":"dc5a94e7","notfallmodell":"800cd1cb","probelauf":"155a061a","proposals":"9784e749","prozessbacklog":"158f92cc","prozesse":"00b1c06b","prozessfreigabe":"ee8f95dc","prozessmatrix":"278c1ad5","prozessmodell":"69ba4f62","prozessschema":"ee7e2502","prozessvergleich":"2dc0b5c9","redirect":"222da0db","reifegrad-katalog":"570a0d08","reifegrad-seed":"6c429264","reifegrad":"154169ed","risiken":"07ac1240","rmsprozesse":"f00554f7","soa":"3c861941","tour":"d6460880","verknuepfungen":"8161107e","vorfaelle":"60f19be0","vorfallmodell":"939dabbb","wirksamkeit":"0d9cb40a","wissen":"f06cf783","wissenmodell":"6e31036d","ziele":"5a62abe9","zielmodell":"0e9557a6"};

/**
 * Die Version eines Moduls.
 *
 * Jede Datei trägt die Prüfsumme ihres Inhalts (cache-bust.yml). So holt der
 * Browser nach einem Push nur, was sich geändert hat. Fehlt ein Modul in der
 * Tabelle, ist es neu und der Bot-Commit steht noch aus. Dann gilt die Version
 * des Kerns, abgelesen aus einem Tag, der schon dasteht: Ohne `?v=` hielte ein
 * Browser die alte Fassung fest.
 */
function _modulVersion(name) {
  if (MODUL_VERSIONEN[name]) return MODUL_VERSIONEN[name];
  const tag = document.querySelector('script[src*="js/app.js"]');
  const treffer = tag && /\?v=([A-Za-z0-9]+)/.exec(tag.getAttribute('src') || '');
  return treffer ? treffer[1] : '';
}

/** Ein einzelnes Modul einhängen – höchstens einmal. */
function modulLaden(name) {
  if (MODUL_KERN.includes(name)) return Promise.resolve();
  if (_modulGeladen.has(name)) return _modulGeladen.get(name);
  const p = new Promise((fertig, fehler) => {
    const v = _modulVersion(name);
    const el = document.createElement('script');
    el.src = 'js/' + name + '.js' + (v ? '?v=' + v : '');
    el.async = false;   // Reihenfolge einhalten: die Dateien bauen aufeinander auf
    el.onload = () => fertig();
    el.onerror = () => { _modulGeladen.delete(name); fehler(new Error('Modul „' + name + '" nicht ladbar')); };
    document.head.appendChild(el);
  });
  _modulGeladen.set(name, p);
  return p;
}

/**
 * Alles laden, was eine Ansicht braucht.
 *
 * Gleichzeitig holen, der Reihe nach ausführen: Alle Tags entstehen im selben
 * Zug, `async = false` hält dann die Reihenfolge ein, und keine Datei wartet
 * auf das Holen der vorigen. Der Reiter Prozesse hängt an 37 Dateien, einzeln
 * nacheinander waren das 37 Wartezeiten.
 *
 * Scheitert eine Datei, laufen die übrigen trotzdem durch. Das schadet nicht,
 * weil keine Datei beim Laden eine andere braucht (der Test prüft das), und der
 * nächste Versuch holt nur die gescheiterte.
 */
async function modulFuerAnsicht(view) {
  const liste = MODUL_ANSICHTEN[view];
  if (!liste || !liste.length) return;
  await Promise.all(liste.map(name => modulLaden(name)));
}

/** Sind alle Module einer Ansicht schon da? (Für Aufrufer, die nicht warten wollen.) */
function modulBereit(view) {
  return (MODUL_ANSICHTEN[view] || []).every(n => _modulGeladen.has(n) || MODUL_KERN.includes(n));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MODUL_KERN, MODUL_ADMIN, MODUL_ANSICHTEN };
}
