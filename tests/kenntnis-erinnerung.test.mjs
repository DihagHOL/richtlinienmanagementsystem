/**
 * Erinnerungen an offene Kenntnisnahmen.
 *
 * Der Cron fasste bisher nur bei den Fachrollen nach – Prüfung, Mitbestimmung,
 * Freigabe. Wer ein veröffentlichtes Regelwerk lesen und bestätigen muss, hörte
 * nach der Veröffentlichungsmail nie wieder etwas davon; genau daran hängt aber
 * der Nachweis. Dieser Test hält fest, wen es trifft, wie oft – und wen nicht.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const s = lies('scripts/erinnerungen.mjs');

/* ── 1) Die rechnenden Teile, ausgeführt ── */
const ctx = { console, Date, Number, Array, Set, Map, JSON, isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext("const lc = (x) => String(x || '').toLowerCase();", ctx);
vm.runInContext(s.slice(s.indexOf('/** Rollen einer Person'), s.indexOf('/** Direktlink auf ein Regelwerk')), ctx);
vm.runInContext(s.slice(s.indexOf('function isDue('), s.indexOf('const lc =')), ctx);
const w = (a) => vm.runInContext(a, ctx);

ok(w('zielgruppeTrifft([], ["produktion"])') === true, 'Ohne Zielgruppe gilt ein Regelwerk für alle');
ok(w('zielgruppeTrifft(["ALLE"], ["produktion"])') === true, '„ALLE" ebenso');
ok(w('zielgruppeTrifft(["IT"], ["it"])') === true, 'Die passende Rolle trifft – Groß-/Kleinschreibung egal');
ok(w('zielgruppeTrifft(["IT"], ["produktion"])') === false, 'Eine fremde Rolle nicht');
ok(w('zielgruppeTrifft(["IT","Einkauf"], ["einkauf"])') === true, 'Eine von mehreren genügt');
ok(w('zielgruppeTrifft(["IT"], [])') === false, 'Wer keine Rolle hat, wird nicht angeschrieben');

ok(w('rollenVon({upn:"a@x.de",abteilung:"Produktion"},{}).includes("produktion")') === true,
  'Die AD-Abteilung zählt als Rolle');
ok(w('rollenVon({upn:"A@X.de",abteilung:""},{"a@x.de":["IT"]}).includes("it")') === true,
  'Manuell zugewiesene Rollen ebenso – unabhängig von der Schreibweise der Adresse');
ok(w('rollenVon({upn:"a@x.de",abteilung:""},{}).length') === 0, 'Ohne beides bleibt die Liste leer');

ok(w('kenntnisOffen(null, false, 0)') === true, 'Ohne Bestätigung ist die Kenntnisnahme offen');
ok(w('kenntnisOffen({gelesenAm:"2026-08-01T10:00:00Z"}, false, 0)') === false, 'Mit Bestätigung erledigt');
ok(w('kenntnisOffen({gelesenAm:"2026-08-01T10:00:00Z",quizBestanden:false}, true, 0)') === true,
  'Gelesen, aber Wissenstest offen: zählt weiter als offen');
ok(w('kenntnisOffen({gelesenAm:"2026-08-01T10:00:00Z",quizBestanden:true}, true, 0)') === false,
  'Test bestanden: erledigt');
ok(w('kenntnisOffen({gelesenAm:"2024-01-01T10:00:00Z"}, false, 12)') === true,
  'Jährliche Wiederholung überfällig → wieder offen');
ok(w('kenntnisOffen({gelesenAm:"2026-08-01T10:00:00Z"}, false, 12)') === false,
  'Innerhalb der Frist bleibt es erledigt');
ok(w('kenntnisOffen({gelesenAm:"kaputt"}, false, 12)') === false,
  'Ein unlesbares Datum führt nicht zu Dauermahnungen');

ok(w('isDue(7, 7, 7)') === true && w('isDue(14, 7, 7)') === true, 'Erinnert wird am 7. und am 14. Tag');
ok(w('isDue(8, 7, 7)') === false, 'Dazwischen nicht – niemand wird täglich angeschrieben');
ok(w('isDue(3, 7, 7)') === false, 'Und vor der ersten Frist gar nicht');

/* ── 2) Wer wird angeschrieben, wer nicht ── */
const block = s.slice(s.indexOf('// ── Offene Kenntnisnahmen'), s.indexOf('// ── Review-Fälligkeiten'));
ok(/\(f\.Status \|\| ''\) !== 'Veröffentlicht'\) continue;/.test(block), 'Nur veröffentlichte Regelwerke');
ok(/if \(f\.Pflicht === false\) continue;/.test(block), 'Freiwillige Lektüre wird nicht angemahnt');
ok(/if \(!zielgruppeTrifft\(zg, rollenVon\(u, userRoles\)\)\) continue;/.test(block),
  'Angeschrieben wird nur, wer laut Zielgruppe gemeint ist');
ok(/if \(!kenntnisOffen\(acks\.get\(/.test(block), 'Und nur, wer noch nicht bestätigt hat');
ok(/daysSince\(f\.VeroeffentlichtAm/.test(block), 'Die Frist zählt ab Veröffentlichung');
ok(/jeUser\.get\(lc\(u\.upn\)\)\.posten\.push/.test(block) && /for \(const u of jeUser\.values\(\)\)/.test(block),
  'Jede Person bekommt eine Mail über alle ihre offenen Regelwerke – nicht eine je Regelwerk');
ok(/u\.posten\.length === 1[\s\S]{0,200}Regelwerke warten auf Ihre Kenntnisnahme/.test(block),
  'Der Betreff passt sich an eins oder mehrere an');
ok(/accountEnabled === false\) continue;/.test(s), 'Gesperrte Konten bekommen nichts');

/* ── 3) Eskalation: Sammelmeldung, nicht Vorgesetzte ── */
ok(/kenntnisEskalationMail \|\| cfg\.eskalationMail/.test(block), 'Die Eskalation geht an eine benannte Stelle');
ok(/function kenntnisEskalationHtml/.test(s), 'Sie ist eine Sammelmeldung');
ok(/keine Leistungskontrolle/.test(s), 'Und benennt ihren Zweck');
ok(!/manager|vorgesetzt/i.test(block), 'Nirgends wird automatisch an Vorgesetzte eskaliert');
ok(/eskalation\.sort\(\(a, b\) => b\.tage - a\.tage\)/.test(block), 'Das Längste steht oben');

/* ── 4) Abschaltbar und ohne Kollateralschaden ── */
ok(/if \(cfg\.kenntnisErinnerungAktiv === false\)/.test(block), 'Der Teil lässt sich in den Einstellungen abschalten');
ok(/catch \(e\) \{ console\.log\('Kenntnisnahme-Erinnerungen übersprungen:/.test(s),
  'Ein Fehler hier legt den übrigen Lauf nicht lahm');
ok(/User\.Read\.All/.test(block) && /Teil übersprungen/.test(block),
  'Fehlt das Recht zum Lesen der Mitarbeitenden, sagt das Protokoll warum');
ok(/Bestaetigungen" nicht gefunden – übersprungen/.test(block), 'Ohne Bestätigungsliste ebenso');
ok(/zusätzlich User\.Read\.All/.test(s), 'Der Dateikopf nennt das nötige Recht');

/* ── 5) Einstellungen ── */
// Der Link der Erinnerung: dieselbe Frage wie bei der Bekanntgabe. Eine
// Geschäftsleitung, die zur Kenntnisnahme gemahnt wird, gehört in „Meine
// Regelwerke" – nicht in den Freigabe-Reiter.
ok(/function regelwerkLink[\s\S]*?ansicht=meine/.test(s),
  'Die Kenntnisnahme-Erinnerung verlinkt ausdrücklich die Leseansicht');
ok(/function policyLink[\s\S]*?ansicht=freigaben/.test(s),
  'Der Freigabe-Link bleibt davon unberührt');

const acc = lies('js/access.js');
for (const [feld, wert] of [['kenntnisErsteNachTagen', '7'], ['kenntnisDannAlleTage', '7'], ['kenntnisEskalationAbTagen', '21']])
  ok(new RegExp(`${feld}:\\s+${wert},`).test(acc), `Standardwert gepflegt: ${feld} = ${wert}`);
ok(/kenntnisErinnerungAktiv:\s+true,/.test(acc), 'Eingeschaltet, solange niemand widerspricht');
ok(/kenntnisErinnerungAktiv:\s+cfg\.kenntnisErinnerungAktiv !== false,/.test(acc), 'Aus der Konfiguration gelesen');
ok(/kenntnisErinnerungAktiv:\s+c\.kenntnisErinnerungAktiv !== false,/.test(acc), 'Und in den Editor übernommen');
const eins = lies('js/einstellungen.js');
ok(/Offene Kenntnisnahmen \(Mitarbeitende\)/.test(eins), 'Die Einstellungen haben einen eigenen Block dafür');
ok(/_cfgEdit\.kenntnisErsteNachTagen=parseInt/.test(eins), 'Die Taktung ist einstellbar');
ok(/nicht an Vorgesetzte/.test(eins), 'Und der Block sagt, wohin die Eskalation geht');

/* ── 6) Dokumentation ── */
const doku = lies('js/dokumentation.js');
ok(/sec\('erinnerungen', 'Erinnerungen & Eskalation'/.test(doku), 'Eigener Abschnitt in der Dokumentation');
ok(/\['erinnerungen',\s+'Erinnerungen & Eskalation'\]/.test(doku), 'Im Inhaltsverzeichnis');
ok(/Zweckbindung/.test(doku), 'Mit Hinweis zur Zweckbindung');
ok(/Erinnerungen & Eskalation \(automatisch\)/.test(lies('docs/BENUTZERHANDBUCH.md')), 'Handbuch ebenfalls');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
