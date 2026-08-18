/**
 * Löschschutz und Skalierung.
 *
 * Zwei Dinge, die im Betrieb teuer wären:
 *
 *  1. Ein veröffentlichtes Regelwerk zu löschen zerreißt den Audit-Nachweis –
 *     die Kenntnisnahmen bleiben als verwaiste Einträge zurück. Ab dem ersten
 *     Nachweis führt der Weg deshalb über „Archivieren".
 *  2. Die Bestätigungen wurden bei jeder Anmeldung komplett geladen und erst im
 *     Browser gefiltert. Das skaliert nicht über ein Werk hinaus.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── 1) Die Regel selbst, an allen Zuständen durchgespielt ── */
const admin = lies('js/admin.js');
const regel = admin.slice(admin.indexOf('/** Darf dieses Regelwerk gelöscht werden'),
  admin.indexOf('function deletePolicyConfirm'));
const ctx = { console, State: { acks: [] } };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(regel, ctx);
const darf = (p, acks = []) => {
  ctx.State.acks = acks;
  return vm.runInContext('darfGeloeschtWerden(' + JSON.stringify(p) + ')', ctx);
};

ok(darf({ title: 'neu' }) === true, 'Ein ungespeicherter Entwurf darf weg');
ok(darf({ id: '1', typ: 'Konzept', status: 'Entwurf' }) === true, 'Konzepte hängen an keinem Nachweis');
ok(darf({ id: '2', status: 'Entwurf' }) === true, 'Ein leerer Entwurf darf weg');
ok(darf({ id: '3', status: 'Entwurf', konformitaet: [{}] }) === false,
  'Mit Prüfentscheidung nicht mehr');
ok(darf({ id: '4', status: 'Entwurf', freigaben: [{}] }) === false, 'Mit Freigabe nicht mehr');
ok(darf({ id: '5', status: 'Entwurf' }, [{ richtlinieId: '5' }]) === false,
  'Mit Kenntnisnahme nicht mehr');
ok(darf({ id: '6', status: 'Entwurf', veroeffentlichtAm: '2026-01-01' }) === false,
  'Einmal veröffentlicht nicht mehr');
for (const status of ['Konformitätsprüfung', 'Mitbestimmung', 'Freigabe', 'Veröffentlicht', 'Archiviert'])
  ok(darf({ id: '7', status }) === false, `Im Status ${status} nur archivierbar`);

/* ── 2) Die Regel greift an allen drei Stellen ── */
ok(/Löschen nicht möglich/.test(admin) && /trägt bereits einen Nachweis/.test(admin),
  'Der Dialog erklärt, warum nicht gelöscht wird');
ok(/async function doDeletePolicy[\s\S]{0,300}if \(!darfGeloeschtWerden\(p\)\)/.test(admin),
  'Auch der Aufruf selbst prüft – nicht nur der Dialog');
ok(/🔒 Nur archivierbar/.test(admin), 'Der Editor zeigt statt „Löschen" den Grund');
ok(/archivierePolicy\('\$\{esc\(id\)\}'\)/.test(admin), 'Und bietet direkt das Archivieren an');
ok(/verwaiste\n?\s*\*?\s*Einträge|verwaiste Einträge/.test(admin) || /Kenntnisnahmen, Prüf- und Freigabe/.test(admin),
  'Der Kommentar erklärt den Grund für die Regel');

/* ── 3) Bestätigungen serverseitig filtern ── */
const sp = lies('js/sharepoint.js');
ok(/\$filter=fields\/BenutzerUPN eq/.test(sp), 'SharePoint filtert selbst nach der Person');
ok(/replace\(\/'\/g, "''"\)/.test(sp), 'Hochkommas im UPN werden für OData maskiert');
ok(/catch \(e\) \{[\s\S]{0,300}lade ungefiltert/.test(sp),
  'Ohne Index auf der Spalte greift der bisherige Weg als Rückfall');
ok(/indizieren macht es schnell/.test(sp), 'Und die Meldung sagt, was zu tun ist');
const fn = sp.slice(sp.indexOf('async function spGetAcknowledgements'),
  sp.indexOf('function _mapAck'));
ok(!/while \(url\)/.test(fn), 'Die Handschlaufe über alle Seiten ist raus');
ok(/_getAll\(/.test(fn), 'Stattdessen der gemeinsame Seiten-Helfer');

/* ── 4) Absender-Postfach ── */
ok(/function getMailSender/.test(lies('js/access.js')), 'Es gibt ein konfigurierbares Absender-Postfach');
ok(/mailSender:\s+'pruefer@dihag\.com'/.test(lies('js/access.js')), 'Standard ist pruefer@dihag.com');
ok(/ACCESS_CONFIG_DEFAULT\.mailSender/.test(lies('js/access.js')),
  'Ein leeres Feld in der gespeicherten Konfiguration fällt auf den Standard zurück');
ok(/users\/\$\{encodeURIComponent\(absender\)\}\/sendMail/.test(sp), 'Versendet wird über dieses Postfach');
ok(/nutze das eigene Postfach/.test(sp), 'Fehlt die Berechtigung, geht es über das eigene – ohne Ausfall');
ok(/Mail\.Send\.Shared/.test(lies('js/auth.js')), 'Der dafür nötige Scope wird angefordert');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
