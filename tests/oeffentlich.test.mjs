/**
 * Was nicht in dieses Repo gehört.
 *
 * Das Repo ist öffentlich, und GitHub Pages liefert jede Datei darin ohne
 * Anmeldung aus. Bewertungen, Doku und Ansprechpartner liegen deshalb auf
 * SharePoint. Dieser Test hält fest, dass sie nicht zurückkommen. Echte Namen
 * stehen hier bewusst nicht, sonst stünden sie wieder im Repo.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');
const da = (p) => fs.existsSync(path.join(ROOT, p));

ok(!da('docs'), 'Die Doku liegt nicht im Repo');
ok(!da('js/reifegrad-seed.js') && !/REIFEGRAD_SEED/.test(lies('js/reifegrad.js')), 'Die Ampeln der Gap-Analyse auch nicht');
ok(/const GOV_EINTRAEGE = \[\];/.test(lies('js/govstruktur.js')), 'Die Regelungsliste steht auf SharePoint');

const ki = lies('ki/app.js');
ok(!/rdoc-meta-table/.test(ki) && !/Ansprechpartner:/.test(ki), 'Richtlinie und Kodex stehen nicht im Programm');
ok(/ki-texte\.json/.test(ki), 'Sie kommen aus SharePoint');
ok(/_kiTextSauber\(_kiTexte\[schluessel\]\)/.test(ki), 'Und werden vor dem Anzeigen entschärft');

const code = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => lies('js/' + f)).join('\n');
ok(!/\+49[ \d/-]{8,}/.test(code + ki), 'Keine Telefonnummern im Code');
ok(!/administrator@/.test(code + ki), 'Kein Admin-Konto im Code');
ok(/admins:\s+\[\]/.test(lies('js/access.js')) && /const defAdmins = \[\]/.test(ki), 'Ohne lesbare Konfiguration hat niemand Rechte');

/* Ohne Startbestand wäre die Ansicht nach einem Ladefehler leer. Speichern
   überschriebe dann die echten Daten. */
const sp = lies('js/sharepoint.js');
ok(/if \(resp\.status === 404\) return null; \/\/ noch nicht angelegt/.test(sp), 'Nur „noch nicht angelegt" zählt als leer');
ok(/if \(_reifegradLadefehler\) \{ toast/.test(lies('js/reifegrad.js')), 'Nach einem Ladefehler ist Speichern gesperrt');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
