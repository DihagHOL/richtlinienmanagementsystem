# Tests

Automatische Tests für das Regelwerk-Management. Sie laufen **ohne Browser und ohne
Anmeldung**: Die App-Dateien werden in einem Node-Sandkasten (`vm`) mit einfachen
Stubs für `document`, `State`, `toast` usw. geladen; geprüft wird das erzeugte HTML
bzw. das Verhalten der reinen Funktionen. Deshalb sind sie schnell und laufen auch
in der GitHub Action.

## Ausführen

```bash
node scripts/test.mjs
```

Weitere Möglichkeiten:

```bash
node scripts/test.mjs konzept    # nur Suiten, deren Name „konzept" enthält
node scripts/test.mjs -v         # jede Einzelprüfung anzeigen
node tests/konzepte.test.mjs     # eine einzelne Suite direkt
```

Der Runner startet zuerst den **Smoketest** (Bundle-Integrität + alle
Inline-Handler zeigen auf existierende Funktionen) und danach jede Suite in einem
eigenen Prozess. Exit-Code ≠ 0 = mindestens eine Prüfung rot.

## Was wird abgedeckt

| Suite | Inhalt |
|---|---|
| `dashboard-filter-suche` | Filter nach Typ/Standort, Volltextsuche, Leerzustände, keine Browser-Popups |
| `editor-workflow` | Ausklappbare Abschnitte, Reihenfolge Freigabe ↔ Mitbestimmung, Badges |
| `geltungsbereich-mail-gate` | Geltungsbereich, „bereits freigegeben" in Mails, Muster-Vorlage, Konzept-Gate |
| `governance-baum` | Ordner-Baum: Aufbau, Zähler, Auswahl inkl. Unterordner, Suche |
| `konzepte` | Konzept-Status, Karten/Rollen-Gating, Konvertierung zum Regelwerk |
| `konzept-anhang` / `-mail` | Anhang am Konzept, Übernahme ins Regelwerk, Mail-Anhang |
| `konzept-mail-deeplink` | Entscheidungs-Buttons in der GF-Mail, Deep-Link-Handling |
| `regelwerk-typ` | Dokumentart (Handbuch, Richtlinie …) in beiden Editoren |
| `sp-spaltennamen` | SharePoint-Spalten über internen **oder** Anzeigenamen auflösen |
| `standard-prozesse` | Die 14 RMS-Standardprozesse erzeugen valides BPMN |

## Neue Tests schreiben

Eine neue Datei `tests/<thema>.test.mjs` anlegen; der Runner findet sie
automatisch. Aufbau (verkürzt):

```js
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const ctx = { console, esc: s => String(s ?? ''), toast: () => {}, State: { policies: [] } };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/admin.js', 'utf8'), ctx);

// … Prüfungen mit ok(...) …

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
```

Wichtig: Die **Schlusszeile im Format `N grün, M rot`** beibehalten – daraus liest
der Runner die Anzahl der Prüfungen.
