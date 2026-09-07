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
  'risiken', 'ausnahmen', 'wirksamkeit', 'clevelreport'];

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
  faelligkeit:   MODUL_ADMIN.concat(['faelligkeit']),
  ismsdocs:      MODUL_ADMIN.concat(['ismsdocs']),
  governance:    MODUL_ADMIN.concat(['governance']),
  prozesse:      MODUL_ADMIN.concat(['prozesse', 'landkarte', 'prozessmatrix', 'mindmapbaum', 'verknuepfungen']),
  anleitung:     MODUL_ADMIN.concat(['probelauf', 'tour', 'anleitung']),

  // Diese stehen für sich – sie brauchen den Verwaltungsblock nicht.
  govstruktur:  ['govstruktur'],
  abdeckung:    ['normen', 'abdeckung', 'soa', 'reifegrad-katalog', 'reifegrad-seed', 'reifegrad'],
  risiken:      ['normen', 'risiken'],
  ausnahmen:    ['normen', 'risiken', 'ausnahmen'],
  wirksamkeit:  ['wirksamkeit'],
  vorschlaege:  ['proposals'],
  dokumentation: ['dokumentation'],
};

const _modulGeladen = new Map();   // Name → Promise (auch der abgeschlossene Lauf)

/**
 * Die Version aus dem bereits geladenen Kern übernehmen.
 *
 * Das Cache-Busting (cache-bust.yml) ersetzt bei jedem Push die `?v=`-Parameter
 * in der index.html. Nachgeladene Dateien müssen dieselbe tragen, sonst hält
 * ein Browser die alte Fassung fest – genau der Fehler, den das Busting
 * verhindern soll. Abgelesen wird sie deshalb aus einem Tag, der schon dasteht,
 * statt sie irgendwo zu wiederholen.
 */
function _modulVersion() {
  const tag = document.querySelector('script[src*="js/app.js"]');
  const treffer = tag && /\?v=([A-Za-z0-9]+)/.exec(tag.getAttribute('src') || '');
  return treffer ? treffer[1] : '';
}

/** Ein einzelnes Modul einhängen – höchstens einmal. */
function modulLaden(name) {
  if (MODUL_KERN.includes(name)) return Promise.resolve();
  if (_modulGeladen.has(name)) return _modulGeladen.get(name);
  const p = new Promise((fertig, fehler) => {
    const v = _modulVersion();
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
 * Der Reihe nach, nicht gleichzeitig: Die Dateien greifen beim Laden schon
 * aufeinander zu (`reifegrad-seed` erwartet `reifegrad`), und `async = false`
 * allein garantiert die Reihenfolge nur für Tags, die im selben Zug entstehen.
 */
async function modulFuerAnsicht(view) {
  const liste = MODUL_ANSICHTEN[view];
  if (!liste || !liste.length) return;
  for (const name of liste) await modulLaden(name);
}

/** Sind alle Module einer Ansicht schon da? (Für Aufrufer, die nicht warten wollen.) */
function modulBereit(view) {
  return (MODUL_ANSICHTEN[view] || []).every(n => _modulGeladen.has(n) || MODUL_KERN.includes(n));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MODUL_KERN, MODUL_ADMIN, MODUL_ANSICHTEN };
}
