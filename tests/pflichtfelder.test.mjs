/**
 * Pflichtfelder: Geltungsbereich (Regelwerk UND Konzept) sowie Typ (Konzept).
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_DATEIEN = ['admin.js', 'freigaben.js', 'einstellungen.js'];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

/* ── Konzept-Prüfung (reine Funktion) ── */
const kctx = {
  console, esc, toast: (m) => kctx.__toasts.push(m), canWriteTab: () => true,
  fmtDate: () => '', emptyState: () => '', openModal: () => {}, closeModal: () => {},
  isCurrentUserGeschaeftsleitung: () => false, geltungsbereichLabel: () => '',
  renderGeltungsbereichSection: () => '', REGELWERK_TYPEN: ['Handbuch', 'Richtlinie'],
  State: { konzepte: [], user: { upn: 'a@x', name: 'A' } },
  __toasts: [],
};
kctx.window = kctx; kctx.globalThis = kctx;
vm.createContext(kctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/util.js', 'utf8'), kctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/konzepte.js', 'utf8'), kctx);
const kpruef = vm.runInContext('konzeptPflichtfelderFehlen', kctx);

const K = (o) => Object.assign({ title: 'T', regelwerkTyp: '', geltungsbereich: [], konzept: { motivation: 'M' } }, o);

ok(/Typ/.test(kpruef(K({}))), 'Konzept ohne Typ: Meldung nennt den Typ');
ok(/Geltungsbereich/.test(kpruef(K({ regelwerkTyp: 'Handbuch' }))), 'Konzept ohne Geltungsbereich: Meldung nennt den Geltungsbereich');
ok(kpruef(K({ regelwerkTyp: 'Handbuch', geltungsbereich: ['ALLE'] })) === '', 'Typ + „Alle Standorte" reichen aus');
ok(kpruef(K({ regelwerkTyp: 'Richtlinie', geltungsbereich: ['HOL', 'SHB'] })) === '', 'Typ + einzelne Werke reichen aus');
ok(/Typ/.test(kpruef(K({ regelwerkTyp: '   ', geltungsbereich: ['ALLE'] }))), 'Nur Leerzeichen zählen nicht als Typ');
ok(kpruef(null) === '', 'Kein Konzept übergeben: keine Meldung (kein Absturz)');

/* ── Beide Speicherwege des Konzepts prüfen ── */
const kjs = fs.readFileSync(ROOT + '/js/konzepte.js', 'utf8');
ok(/async function saveKonzept[\s\S]{0,400}konzeptPflichtfelderFehlen\(k\)/.test(kjs),
  'saveKonzept prüft die Pflichtfelder (auch beim reinen Speichern)');
ok(/async function konzeptSubmitGF[\s\S]{0,400}konzeptPflichtfelderFehlen\(k\)/.test(kjs),
  'Einreichen von der Karte prüft ebenfalls (Altbestand)');
ok(/openKonzeptEditor\(id\); return;/.test(kjs),
  'Bei unvollständigem Altbestand öffnet sich der Editor zum Ergänzen');

/* ── Regelwerk: Geltungsbereich ── */
const adm = ADMIN_DATEIEN.map(f => fs.readFileSync(ROOT + '/js/' + f, 'utf8')).join('\n');
ok(/async function savePolicy[\s\S]{0,900}!Array\.isArray\(p\.geltungsbereich\) \|\| !p\.geltungsbereich\.length/.test(adm),
  'savePolicy prüft den Geltungsbereich');
const posGeltung = adm.search(/Bitte den Geltungsbereich festlegen/);
const posDokument = adm.search(/Bitte ein Dokument zuordnen/);
ok(posGeltung > -1 && posDokument > -1 && posGeltung > posDokument,
  'Reihenfolge der Prüfungen bleibt nachvollziehbar (Titel → Dokument → Geltungsbereich)');

/* ── Kennzeichnung in der Oberfläche ── */
ok(/Geltungsbereich \(Standorte\) <span class="req">\*<\/span>/.test(adm), 'Geltungsbereich ist mit * gekennzeichnet');
ok(/Pflichtangabe/.test(adm), 'Hinweistext nennt die Pflicht');
ok(/Typ \(Dokumentart\) <span class="req">\*<\/span>/.test(kjs), 'Konzept-Typ ist mit * gekennzeichnet');

/* ── Regelwerk-Typ bleibt bewusst optional (Migration bestehender Dokumente) ── */
const adminOnly = fs.readFileSync(ROOT + '/js/admin.js', 'utf8');
ok(!/regelwerkTyp[^\n]{0,80}toast\(/.test(adminOnly), 'Regelwerk-Typ ist weiterhin optional (Direktanlage/Migration)');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
