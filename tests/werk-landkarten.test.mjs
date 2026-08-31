/**
 * Die Landkarten von Coswig, Zaigler und Schmiedeberg.
 *
 * Sie stammen aus den Dokumenten der Werke – IMS-4.4 Rev. 7 (Coswig), F_01_005
 * Rev. 5 (Zaigler), Prozesslandkarte 14.07.2026 (Schmiedeberg) – und sind
 * deshalb keine Erfindung, sondern eine Übersetzung. Geprüft wird, dass die
 * Übersetzung nichts verliert und nichts erfindet:
 *
 *   • Jeder Hauptprozess des Dokuments steht in der Vorlage.
 *   • Kein Verweis zeigt ins Nichts (lkVerweiseVon() verschweigt tote Ziele,
 *     ein Tippfehler in 103 Kacheln fiele sonst niemandem auf).
 *   • Und Coswig bleibt lesbar: 103 Kacheln nebeneinander wären unbrauchbar,
 *     deshalb zeigt die Karte die Hauptprozesse und ordnet den Rest darunter ein.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Promise,
  esc: (s) => String(s ?? ''),
  document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  toast: () => {}, openModal: () => {}, closeModal: () => {}, canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB', 'WGC', 'SCH', 'EIS', 'DSO', 'ZAI', 'LEG', 'MEG', 'EWA'],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
vm.runInContext(lies('js/landkarte.js'), ctx);
const run = (s) => vm.runInContext(s, ctx);

/* ── 1) Die drei Vorlagen stehen zur Wahl, jede beim richtigen Werk ── */
for (const [key, konst] of [['wgc', 'LK_WGC'], ['zai', 'LK_ZAI'], ['sch', 'LK_SCH']]) {
  ok(run(`LK_VORLAGEN.some(v => v.key === '${key}' && v.karte === ${konst})`),
    `Die Vorlage „${key}" steht im Dialog und zeigt auf ${konst}`);
}
const lk = lies('js/landkarte.js');
ok(/const jeWerk = \{ WGC: 'wgc', ZAI: 'zai', SCH: 'sch' \}/.test(lk),
  'Beim Öffnen der Karte eines Werks ist seine eigene Vorlage vorgewählt');

/* ── 2) Drei Bänder, gleiche Schlüssel wie überall ──
   „kern" ist nicht irgendein Name: Daran hängt die Pfeilform der Kernprozesse. */
for (const konst of ['LK_WGC', 'LK_ZAI', 'LK_SCH']) {
  ok(run(`${konst}.baender.map(b => b.key).join('|')`) === 'fuehrung|kern|unterstuetzung',
    `${konst}: Führungs-, Kern- und Unterstützungsprozesse`);
  ok(run(`${konst}.kacheln.every(k => ${konst}.baender.some(b => b.key === k.band))`),
    `${konst}: jede Kachel liegt in einem Band, das es gibt`);
  const ids = run(`${konst}.kacheln.map(k => k.id)`);
  ok(new Set(ids).size === ids.length, `${konst}: ${ids.length} Kacheln, jede Kennung nur einmal`);
  const verweise = run(`${konst}.kacheln.flatMap(k => (k.verweise||[]).map(v => ({ von: k.id, ...v })))`);
  const tot = verweise.filter(v => !ids.includes(v.ziel));
  ok(tot.length === 0, tot.length
    ? `${konst}: tote Ziele – ${tot.map(v => v.von + ' → ' + v.ziel).join(', ')}`
    : `${konst}: alle ${verweise.length} Verweise treffen eine Kachel der Vorlage`);
}

/* ── 3) Coswig: die sechzehn Hauptprozesse des Dokuments ── */
const wgcNamen = run(`LK_WGC.kacheln.filter(k => /^\\d+ /.test(k.name)).map(k => k.name)`);
ok(wgcNamen.length === 16, `Sechzehn nummerierte Hauptprozesse (${wgcNamen.length})`);
for (const n of ['1 Integriertes Managementsystem', '6 Verkauf (Vertrieb und After-Sales)',
                 '8 Fertigung (Gießerei)', '11 Beschaffung, Wareneingang und Logistik',
                 '16 Personalmanagement']) {
  ok(wgcNamen.includes(n), `… darunter „${n}"`);
}
ok(run(`LK_WGC.kacheln.filter(k => k.band === 'fuehrung' && /^\\d+ /.test(k.name)).length`) === 5,
  'Fünf Managementprozesse (1–5)');
ok(run(`LK_WGC.kacheln.filter(k => k.band === 'kern' && /^\\d+ /.test(k.name)).length`) === 5,
  'Fünf Kernprozesse (6–10)');
ok(run(`LK_WGC.kacheln.filter(k => k.band === 'unterstuetzung' && /^\\d+ /.test(k.name)).length`) === 6,
  'Sechs Unterstützungsprozesse (11–16)');

/* Die Dokumentennummern sind in einer QM-Landschaft die eigentliche Kennung. */
ok(run(`LK_WGC.kacheln.some(k => k.name === 'Anwendungsbereich des IMS' && k.unter === 'IMS-4.3')`),
  'Ein Teilprozess trägt seine Dokumentennummer');
ok(run(`LK_WGC.kacheln.filter(k => /^(IMS-|VA[- ])/.test(k.unter || '')).length`) >= 40,
  'Und zwar durchgehend – über 40 Teilprozesse mit Nummer');

/* Die Gießerei-Kette in der Reihenfolge der Landschaft. */
run(`_lkDaten = { karten: { WGC: JSON.parse(JSON.stringify(LK_WGC)) } }; _lkWerk = 'WGC';`);
function kette(startName) {
  const weg = [];
  let k = run(`lkKacheln().find(x => x.name === ${JSON.stringify(startName)})`);
  for (let i = 0; i < 20 && k; i++) {
    weg.push(k.name);
    const next = (k.verweise || []).find(v => v.art === 'folgt');
    k = next ? run(`lkKacheln().find(x => x.id === ${JSON.stringify(next.ziel)})`) : null;
  }
  return weg;
}
const giess = kette('Prozess Formerei');
ok(giess.length === 8 && giess[0] === 'Prozess Formerei' && giess[7] === 'Prozess mechanische Bearbeitung',
  `Die Gießerei läuft in acht Schritten: ${giess.map(n => n.replace('Prozess ', '')).join(' → ')}`);

/* ── 4) Ineinandergreifend: die Gliederung hängt an den Hauptprozessen ── */
const ims = run(`lkKacheln().find(k => k.name === '1 Integriertes Managementsystem')`);
ok(run(`lkUnterprozesse(lkKachelVonId('${ims.id}')).map(v => v.kachel.name).join(', ')`)
  === 'Qualität, Umwelt, Energie, Arbeits- und Gesundheitsschutz',
  'Das IMS gliedert sich in seine vier Säulen …');
const qual = run(`lkUnterprozesse(lkKachelVonId('${ims.id}'))[0]`);
ok(run(`lkUnterprozesse(lkKachelVonZiel('WGC:${qual.kachel.id}').kachel).length`) === 3,
  '… und darunter liegt die dritte Ebene: die Teilprozesse mit ihren Nummern');
ok(run(`lkKacheln().filter(k => lkIstTeilprozess('WGC', k)).length`) > 70,
  'Über 70 Kacheln sind einem Hauptprozess zugeordnet, nicht frei im Band');

/* ── 5) Und die Karte bleibt lesbar ──
   103 Kacheln nebeneinander wären unbrauchbar. */
ok(run(`_lkNurHaupt`) === true, 'Die Karte zeigt zunächst nur die Hauptprozesse');
/* Der Kachel-Rumpf trägt genau eine Klasse „lk-kachel" – die inneren Teile
   heißen lk-kachel-kopf, -unter, -fuss. Deshalb auf das Ende der Klasse achten. */
const kacheln = (html) => (html.match(/class="lk-kachel[" ]/g) || []).length;
const zeile = run(`_lkZeileHtml({ key: 'unterstuetzung', titel: 'U' }, 0, false)`);
ok(kacheln(zeile) === 6, `Im Unterstützungsband stehen sechs Kacheln, nicht über achtzig (${kacheln(zeile)})`);
ok(/6 Prozesse · \d+ eingeordnet<\/i>/.test(zeile),
  'Und die Bandzeile sagt, wie viele darunter einsortiert sind');
run(`lkTeilprozesseZeigen(true)`);
const alleU = run(`_lkZeileHtml({ key: 'unterstuetzung', titel: 'U' }, 0, false)`);
ok(kacheln(alleU) > 70,
  `Eingeschaltet stehen sie einzeln da – versteckt ist nichts, es ist nur einsortiert (${kacheln(alleU)})`);
run(`lkTeilprozesseZeigen(false)`);
ok(kacheln(run(`_lkZeileHtml({ key: 'fuehrung', titel: 'F' }, 0, false)`)) === 5,
  'Das Führungsband zeigt seine fünf Hauptprozesse');
ok(/lkTeilprozesseZeigen/.test(lk), 'Der Schalter dafür steht in der Leiste');

/* ── 6) Zaigler: die Kette von der Anforderung bis zum Versand ── */
run(`_lkDaten = { karten: { ZAI: JSON.parse(JSON.stringify(LK_ZAI)) } }; _lkWerk = 'ZAI';`);
const zaiKette = kette('Verkaufsprozess');
ok(zaiKette.join(' → ') === 'Verkaufsprozess → Kundenauftrag → Auftragsbearbeitung → Produktion → Produkt-Abnahme → Versand',
  `Die Kernprozesse laufen als Kette: ${zaiKette.join(' → ')}`);
ok(run(`LK_ZAI.kacheln.find(k => k.name === 'Management').unter`) === 'VA 02:010 – VA 05:010',
  'Die Verfahrensanweisungen stehen im Untertitel');
ok(run(`LK_ZAI.kacheln.filter(k => k.band === 'unterstuetzung').length`) === 4,
  'Vier Unterstützungsprozesse wie im Dokument');
ok(run(`lkVerweiseAuf('ZAI','zai-fehlerhaft').length`) === 1,
  'Die Lenkung fehlerhafter Produkte wird von der Produkt-Abnahme gebraucht');

/* ── 7) Schmiedeberg: bewusst grob ── */
ok(run(`LK_SCH.kacheln.length`) === 8, 'Acht Prozesse – so steht es in der Landkarte');
ok(run(`LK_SCH.kacheln.map(k => k.name).join(', ')`)
  === 'Geschäftsführung, Personalmanagement, Managementsysteme, Vertrieb, Einkauf, Produktion, Infrastruktur & Instandhaltung, Logistik & Versand',
  'Und zwar genau diese');
run(`_lkDaten = { karten: { SCH: JSON.parse(JSON.stringify(LK_SCH)) } }; _lkWerk = 'SCH';`);
ok(kette('Vertrieb').join(' → ') === 'Vertrieb → Einkauf → Produktion → Logistik & Versand',
  'Die Kernprozesse sind zu einer Kette verbunden');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
