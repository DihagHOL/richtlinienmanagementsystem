/**
 * Erinnerungs-Cron: welche Etappen er nachfasst.
 *
 * Der Cron erinnerte lange nur bei Konformitätsprüfung und Freigabe. Die beiden
 * Etappen, die am ehesten liegen bleiben – ein Konzept bei der Geschäftsleitung
 * und ein Regelwerk beim Betriebsrat – fielen durch. Dieser Test hält fest,
 * dass beide erfasst sind und die Nachricht zum jeweiligen Vorgang passt.
 *
 * Geprüft wird der Quelltext: Der Cron läuft nur in der GitHub-Action mit
 * echten Zugangsdaten, hier ist er nicht ausführbar.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const s = fs.readFileSync(path.join(ROOT, 'scripts/erinnerungen.mjs'), 'utf8');

/* ── Konzepte bei der Geschäftsleitung ── */
ok(/\(f\.Typ2 \|\| ''\) === 'Konzept'/.test(s), 'Konzepte werden erkannt');
ok(/phase = 'Konzeptprüfung'/.test(s), 'Sie bekommen eine eigene Phase');
ok(/roleRecipients = mitVertretern\(gl, cfg\.vertretungen\);/.test(s),
  'Empfänger ist die Geschäftsleitung – samt ihrer Vertretung');
ok(/if \(!ko\.eingereichtAm \|\| entschieden\) continue;/.test(s),
  'Nur eingereichte und noch offene Konzepte – Entwürfe und Erledigtes nicht');
ok(/eingereichtAm \|\| ref/.test(s), 'Die Frist zählt ab dem Einreichen, nicht ab der letzten Änderung');
ok(/function konzeptLink/.test(s), 'Der Link führt ins Dashboard, nicht in die Freigaben');
ok(/konzeptLink\(id, 'annehmen'\)/.test(s) && /konzeptLink\(id, 'zurueckstellen'\)/.test(s)
  && /konzeptLink\(id, 'ablehnen'\)/.test(s), 'Alle drei Entscheidungen stehen in der Mail');

/* ── Mitbestimmung beim Betriebsrat ── */
ok(/status === 'Mitbestimmung'/.test(s), 'Die Mitbestimmung wird erkannt');
ok(/phase = 'Mitbestimmung'/.test(s), 'Auch sie hat eine eigene Phase');
ok(/mb\.bestaetigung && mb\.bestaetigung\.konform/.test(s), 'Bereits Bestätigtes wird übersprungen');
ok(/mb\.kbrBetroffen \? kbrMail : ''/.test(s), 'Der Konzernbetriebsrat wird angeschrieben, wenn betroffen');
ok(/werke\.map\(\(w\) => brMails\[w\] \|\| ''\)/.test(s), 'Und die Betriebsräte der betroffenen Werke');
ok(/const kbrMail = \(cfg\.kbrMail \|\| ''\)/.test(s) && /const brMails =/.test(s),
  'Die Adressen kommen aus der Konfiguration');

/* ── Betriebsrats-Adressen dürfen auf Gruppendomains liegen ── */
ok(/extraErlaubt = \[\]/.test(s), 'sendMail kennt zusätzlich erlaubte Adressen');
ok(/inDomain\(u\) \|\| erlaubt\.has\(lc\(u\)\)/.test(s), 'Diese kommen am Domainfilter vorbei');
ok(/phase === 'Mitbestimmung' \? roleRecipients : \[\]/.test(s),
  'Genutzt wird das nur für die Mitbestimmung');

/* ── Der Text passt zum Vorgang ── */
ok(/const gegenstand = konzept \? 'das Regelwerk-Konzept' : 'das Regelwerk'/.test(s),
  'Die Mail nennt Konzept und Regelwerk beim Namen');
ok(!/für die Richtlinie <a/.test(s), 'Keine „Richtlinie" mehr im Fließtext');

/* ── Die bisherigen Etappen laufen weiter ── */
for (const [muster, text] of [
  [/status === 'Konformitätsprüfung' \|\| status === 'InReview'/, 'Konformitätsprüfung'],
  [/status === 'Freigabe' \|\| status === 'Freigabe ausstehend'/, 'Freigabe'],
]) ok(muster.test(s), `Weiterhin erfasst: ${text}`);
ok(/continue; \/\/ nur laufende Workflow-Schritte/.test(s), 'Alles andere wird weiterhin übersprungen');

/* ── Eskalation und Taktung gelten für alle Phasen ── */
const abschnitt = s.slice(s.indexOf('let phase =') > 0 ? s.indexOf('let phase =') : 0);
ok(/if \(!isDue\(tage, erste, alle\)\)/.test(abschnitt), 'Die Taktung greift vor dem Versand');
ok(/eskalationAb > 0 && tage >= eskalationAb/.test(abschnitt), 'Die Eskalation ebenso');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
