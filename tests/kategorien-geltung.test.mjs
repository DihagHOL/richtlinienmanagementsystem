/**
 * Zwei Dinge, die zusammengehören: die Systematik und der Geltungsbereich.
 *
 * Die Kategorien für ein Regelwerk standen als feste Liste im Code („ISO 27001",
 * „IT-Sicherheit" …) – neben der Systematik des Konzernregelwerks, die in der
 * Governance-Struktur gepflegt wird. Zwei Listen sind zwei Wahrheiten; jetzt gilt
 * die aus der Governance-Struktur.
 *
 * Und der Geltungsbereich – für welche Standorte ein Regelwerk überhaupt gilt –
 * stand in keiner einzigen Mail. Wer freigibt oder zur Kenntnis nehmen soll,
 * musste die App öffnen, um das zu erfahren.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const gs = lies('js/govstruktur.js');
const adm = lies('js/admin.js');
const fg = lies('js/freigaben.js');
const kon = lies('js/konzepte.js');
const cron = lies('scripts/erinnerungen.mjs');

/* ── 1) Kategorien kommen aus der Governance-Struktur ── */
const ctx = {
  console, State: { policies: [] },
  document: { getElementById: () => null },
  esc: (s) => String(s ?? ''), emptyState: () => '', toast: () => {},
  canWriteTab: () => true, darfGovStrukturKoepfe: () => true,
  openModal: () => {}, closeModal: () => {}, openDetail: () => {},
  spLoadGovStruktur: async () => null, spGovStrukturMeta: async () => null, spSaveGovStruktur: async () => 'x',
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(gs, ctx);
const w = (a) => vm.runInContext(a, ctx);

const kats = w('regelwerkKategorien()');
ok(kats.length === 7 && kats[0] === 'Allgemein', `Die sieben Kategorien des Konzernregelwerks (${kats.length})`);
ok(kats.includes('Compliance') && kats.includes('Security / Cyber Security'),
  'Dieselben Bezeichnungen wie in der Matrix');
ok(w("regelwerkKategorien('ISO 27001')").includes('ISO 27001'),
  'Ein alter Wert bleibt wählbar – sonst spränge er beim Speichern still um');
ok(w("regelwerkKategorien('Compliance').filter(k => k === 'Compliance').length") === 1,
  'Ein vorhandener Wert wird nicht doppelt angeboten');
ok(w("regelwerkKategorien('compliance').length") === 7, 'Groß-/Kleinschreibung erzeugt keine Dublette');
ok(w("regelwerkKategorien('')").length === 7 && w('regelwerkKategorien(null).length') === 7,
  'Ohne bisherigen Wert bleibt es bei der Systematik');

await ctx.gsDatenLaden();
ok(w('gsDatenGeladen()') === true, 'Die Daten lassen sich laden, ohne zu zeichnen');
w("_gsDaten.kategorien = ['Recht', 'Technik']; _gsDaten.eintraege = [];");
ok(w('regelwerkKategorien()').join('|') === 'Recht|Technik',
  'Wer die Zeilen der Matrix ändert, ändert damit die Auswahl im Editor');
w("_gsDaten.eintraege = [{ kategorie: 'Nachzügler', art: 'Policy', titel: 'X', owner: '', status: 'offen' }];");
ok(w('regelwerkKategorien()').includes('Nachzügler'),
  'Eine Kategorie, an der Regelungen hängen, bleibt wählbar – auch ohne eigene Zeile');

/* ── 1b) Dokumentenart kommt aus den Spalten derselben Matrix ──
   „die kategorien sind oben“ – gemeint sind die Spaltenköpfe: die
   Verbindlichkeitsebenen der Pyramide. Die standen fest im Code und wichen ab. */
const arten = w('regelwerkArten()');
ok(arten.length === 7 && arten[0] === 'Handbuch' && arten[1] === 'Policy',
  `Die Ebenen der Pyramide, in ihrer Reihenfolge (${arten.length})`);
ok(arten.includes('Konzernfachregelung') && arten.includes('Weitere'),
  '„Weitere“ ist dabei – im festen Code fehlte sie');
ok(!arten.includes('Richtlinie'), 'Und „Richtlinie“ heißt in der Matrix „Policy“');
ok(w("regelwerkArten('Richtlinie')").includes('Richtlinie'),
  'Ein Altbestand mit „Richtlinie“ bleibt wählbar – sonst spränge er still um');
ok(w("regelwerkArten('policy').length") === 7, 'Groß-/Kleinschreibung erzeugt keine Dublette');
ok(w("regelwerkArtHinweis('Policy')").startsWith('Strategischer Rahmen'),
  'Die Erklärung aus der Matrix steht als Hilfe daneben');
ok(w("regelwerkArtHinweis('gibt es nicht')") === '', 'Ohne Erklärung bleibt es leer');
w("_gsDaten.arten = [{ key: 'Nur Handbuch', erklaerung: 'X' }]; _gsDaten.eintraege = [];");
ok(w('regelwerkArten()').join('|') === 'Nur Handbuch' && w("regelwerkArtHinweis('nur handbuch')") === 'X',
  'Wer die Spalten der Matrix ändert, ändert damit die Auswahl im Editor');

/* ── 2) Eingebaut ── */
ok(/const cats = \(typeof regelwerkKategorien === 'function'\) \? regelwerkKategorien\(p\.kategorie\)/.test(adm),
  'Der Regelwerk-Editor nutzt sie');
ok(/gsDatenLaden\(\)\.then\(\(\) => \{ if \(_editing\) renderPolicyEditor\(\); \}\)/.test(adm),
  'Sind sie noch nicht geladen, zeichnet der Editor sich nach');
ok(/Themenfeld des Konzernregelwerks \(Zeile der <b>Governance-Struktur<\/b>\)/.test(adm),
  'Und sagt, woher die Liste kommt – die Zeilen der Matrix');
ok(/function konzeptKategorien/.test(kon) && /konzeptKategorien\(k\.kategorie\)/.test(kon),
  'Konzepte nutzen dieselbe Liste – sie werden ja zu Regelwerken');
ok(!/'ISO 27001', 'NIS2', 'ISMS allgemein'/.test(adm + kon), 'Die feste Liste ist raus');
ok(/const KATEGORIEN_FALLBACK/.test(adm), 'Ein Rückfall bleibt, falls die Struktur nicht geladen ist');
ok(/const arten = regelwerkTypen\(p\.regelwerkTyp\)/.test(adm), 'Die Dokumentenart ebenso');
ok(/function regelwerkTypen/.test(adm) && /regelwerkArten\(aktuell\)/.test(adm),
  'Über einen Wrapper, damit der Rückfall erhalten bleibt');
ok(/konzeptArten\(k\.regelwerkTyp\)/.test(kon) && /function konzeptArten/.test(kon),
  'Konzepte nutzen dieselben Ebenen – sie werden ja zu Regelwerken');
ok(/const vorhanden = \[\.\.\.new Set\(alle\.map\(p => p\.regelwerkTyp\)/.test(adm)
  && /Altbestand hinten anhängen/.test(adm),
  'Der Filter behält eine Art, die es nur noch im Altbestand gibt');
ok(/if \(typeof gsDatenGeladen === 'function' && !gsDatenGeladen\(\)/.test(kon),
  'Auch der Konzept-Editor lädt die Struktur nach, wenn nötig');
ok(/<option value="">– keine –<\/option>/.test(adm), 'Keine Kategorie ist ebenfalls erlaubt');

/* Der Normbezug hing an der Kategorie – das musste mit umgestellt werden */
ok(!/p\.kategorie === 'ISO 27001' \|\| p\.kategorie === 'NIS2'/.test(adm),
  'Der Normbezug hängt nicht mehr an der Kategorie');
ok(/\(typeof renderNormbezugSection === 'function'\) \? renderNormbezugSection\(\) : ''/.test(adm),
  'Er steht jetzt immer zur Verfügung (eingeklappt)');
ok(/inhaltlich stimmte die Kopplung ohnehin nicht/.test(adm), 'Mit Begründung im Quelltext');

/* ── 3) Geltungsbereich in den Mails ── */
ok(/function _mailGeltungsbereich/.test(fg), 'Es gibt einen Helfer dafür');
const wf = fg.slice(fg.indexOf('function _wfMailHtml'), fg.indexOf('async function setStatus'));
ok(/<b>Geltungsbereich:<\/b>/.test(wf), 'Die Prüf- und Freigabe-Mail nennt ihn');
ok(/<b>Zielgruppe:<\/b>/.test(wf), 'Und die Zielgruppe, wenn sie nicht „alle" ist');
const bg = fg.slice(fg.indexOf('function _zielgruppeMailHtml'), fg.indexOf('/* ── Rückfrage vor der Bekanntgabe'));
ok(/<b>Gilt für:<\/b>/.test(bg), 'Die Bekanntgabe an die Zielgruppe ebenso');
const mit = adm.slice(adm.indexOf('function _mitMailHtml'), adm.indexOf('async function initCompliance'));
ok(/<b>Geltungsbereich:<\/b>/.test(mit), 'Die Mitbestimmungs-Mail auch');
ok(/betroffene Werke:/.test(mit), 'Dort zusätzlich die betroffenen Werke – darum geht es beim Betriebsrat');
const rem = adm.slice(adm.indexOf('function reminderHtml'));
ok(/Gilt für: /.test(rem.slice(0, 900)), 'Die Erinnerung an Mitarbeitende nennt ihn');
ok(/Geltungsbereich: <b>/.test(kon), 'Und die Konzept-Mail an die Geschäftsleitung');

/* ── 4) Auch der Cron kennt ihn ── */
const ctx2 = { console, JSON, Array };
ctx2.globalThis = ctx2;
vm.createContext(ctx2);
vm.runInContext(cron.slice(cron.indexOf('function geltungsbereich(f)'), cron.indexOf('/** Einmal-Token der laufenden Runde')), ctx2);
const g = (f) => vm.runInContext('geltungsbereich(' + JSON.stringify(f) + ')', ctx2);
ok(g({ DatenJson: JSON.stringify({ geltungsbereich: ['HOL', 'SHB'] }) }) === 'HOL, SHB', 'Aus dem Sammelfeld');
ok(g({ DatenJson: JSON.stringify({ geltungsbereich: ['ALLE'] }) }) === 'Alle Standorte', '„Alle" wird ausgeschrieben');
ok(g({ GeltungsbereichJson: JSON.stringify(['EIS']) }) === 'EIS', 'Aus der Einzelspalte (Altbestand)');
ok(g({}) === '' && g({ DatenJson: 'kaputt' }) === '', 'Ohne Angabe oder bei kaputten Daten leer');
ok(/\$\{geltung \? `<p><b>Geltungsbereich:<\/b>/.test(cron), 'Die Erinnerungs-Mail nennt ihn');
ok(/geltungsbereich\(f\)\), att \? \[att\] : \[\]/.test(cron), 'Er wird beim Versand mitgegeben');
ok(/geltung: geltungsbereich\(f\)/.test(cron) && /gilt für ' \+ esc\(x\.geltung\)/.test(cron),
  'Auch die Kenntnisnahme-Erinnerung führt ihn je Regelwerk mit');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
