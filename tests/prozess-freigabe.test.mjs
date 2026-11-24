/**
 * Freigabe von Prozessen über ein Regelwerk je Hauptprozess (js/prozessfreigabe.js).
 *
 * Ein Prozessmodell ist eine Arbeitsanweisung und wird freigegeben wie eine
 * Richtlinie. Was zählt, ist der Hauptprozess: Zu ihm gehört ein Regelwerk der
 * Art „Arbeits-/Prozessanweisung", seine Unter- und Nebenprozesse sind darin
 * enthalten. Das Dokument ist eine erzeugte Word-Beschreibung.
 *
 * Geprüft wird:
 *   • der Fingerabdruck des Ablaufs: Lage, Status und Verknüpfungen zählen
 *     nicht, ein umbenannter Schritt schon;
 *   • Umfang und Abweichung: welche Modelle dazugehören, was sich seit der
 *     Beschreibung geändert hat;
 *   • die Word-Beschreibung: Titel, Umfang, je Modell eine Seite mit Schritten;
 *   • der Weg im Reiter: anlegen (Datei hochladen, Regelwerk als Entwurf, im
 *     Modell eintragen, Editor öffnen) und aktualisieren (Dokument am selben Ort
 *     ersetzen, Stand und Historie nachziehen);
 *   • die Anzeige: Status am Hauptprozess, „Freigabe über" an den Teilen, die
 *     Zeile an Karten, Mails und im Editor.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const F = require(ROOT + '/js/prozessfreigabe.js');
const P = require(ROOT + '/js/prozesse.js');

/* ══ 1) Der Fingerabdruck ══ */
const roh = (doku, name, x) => `<bpmn:definitions><bpmn:process id="P"><bpmn:documentation>${doku}</bpmn:documentation>`
  + `<bpmn:userTask id="T" name="${name}"/></bpmn:process><bpmndi:BPMNDiagram id="D"><di:waypoint x="${x}"/></bpmndi:BPMNDiagram></bpmn:definitions>`;
const h1 = P.procInhaltHash(roh('Beschreibung [[rms:pm=ist]]', 'Rechnung prüfen', 1));
ok(/^[0-9a-f]{8}$/.test(h1), 'Ein kurzer Fingerabdruck');
ok(P.procInhaltHash(roh('Anders [[rms:policies=7]] [[rms:neben=X]]', 'Rechnung prüfen', 9)) === h1,
  'Lage, Status, Regelwerke und Gliederung ändern ihn nicht: am Ablauf ist nichts anders');
ok(P.procInhaltHash(roh('Beschreibung', 'Rechnung freigeben', 1)) !== h1, 'Ein umbenannter Schritt ändert ihn');
ok(P.procInhaltHash('') === '', 'Ohne Datei kein Fingerabdruck');
ok(/procInhaltHash\(s\)/.test(lies('js/prozesse.js')) && /h: String\(e\.h \|\| ''\)/.test(lies('js/util.js')) && /!\('h' in e\)/.test(lies('js/util.js')),
  'Er steht im Cache-Eintrag jedes Modells; ältere Einträge werden einmal nachgelesen');

/* ══ 2) Umfang, Abweichung, Kleinkram ══ */
const modelle = { A: { title: 'Auftragsabwicklung', ordner: 'HOL' }, B: { title: 'Angebot', ordner: 'HOL' },
  C: { title: 'Reklamation', ordner: 'HOL' }, D: { title: 'Versand', ordner: 'SHB' } };
const kinder = { A: [{ id: 'B', art: 'unter' }, { id: 'C', art: 'neben' }], C: [{ id: 'D', art: 'unter' }, { id: 'A', art: 'unter' }], B: [{ id: 'D', art: 'unter' }, { id: 'WEG', art: 'unter' }] };
const hash = { A: 'a1', B: 'b1', C: 'c1', D: 'd1' };
const umfang = F.pfUmfang('A', (id) => kinder[id] || [], (id) => modelle[id] || null, (id) => hash[id] || '');
ok(umfang.map(u => `${u.id}:${u.art}:${u.ebene}:${u.unter}`).join(' ') === 'A:haupt:0: B:unter:1:A D:unter:2:B C:neben:1:A',
  'Der Umfang: Hauptprozess zuerst, dann die Gliederung hinab; jedes Modell einmal, kein Kreis, kein gelöschtes');
ok(umfang[3].werk === 'HOL' && umfang.find(u => u.id === 'D').werk === 'SHB' && umfang[0].h === 'a1', 'Mit Werk und Fingerabdruck');

const stand = umfang.map(u => ({ ...u }));
ok(!F.pfAbweichung(stand, umfang).irgendwas, 'Unverändert: keine Abweichung');
const jetzt = umfang.filter(u => u.id !== 'C').map(u => (u.id === 'B' ? { ...u, h: 'b2' } : u)).concat({ id: 'E', titel: 'Retoure', art: 'neben', h: 'e1' });
const ab = F.pfAbweichung(stand, jetzt);
ok(ab.geaendert.map(s => s.id).join() === 'B' && ab.dazu.map(s => s.id).join() === 'E' && ab.weg.map(s => s.id).join() === 'C' && ab.irgendwas,
  'Geändert, neu dabei, nicht mehr dabei');
ok(F.pfAbweichungText(ab) === 'Geändert: „Angebot". Neu dabei: „Retoure". Nicht mehr dabei: „Reklamation".', '… in einem Satz');
ok(!F.pfAbweichung(stand, umfang.map(u => ({ ...u, h: '' }))).irgendwas, 'Ein noch ungelesenes Modell gilt nicht als geändert: lieber später warnen als grundlos');

ok(F.pfGeltung('HOL').join() === 'HOL' && F.pfGeltung('KONZERN').join() === 'ALLE' && F.pfGeltung('').join() === 'ALLE',
  'Geltungsbereich aus dem Werk des Modells; Konzern und ohne Werk gelten überall');
ok(F.pfDateiname('Vertrieb', 'HOL', []) === 'Prozessbeschreibung Vertrieb (HOL).docx'
  && F.pfDateiname('Vertrieb', 'HOL', ['prozessbeschreibung vertrieb (hol).docx']) === 'Prozessbeschreibung Vertrieb (HOL) 2.docx'
  && F.pfDateiname('A/B: C?', '', []) === 'Prozessbeschreibung A B C.docx',
  'Dateiname mit Werk, frei, ohne verbotene Zeichen');
const regelwerke = [
  { id: '1', status: 'Archiviert', prozess: { hauptId: 'A' } },
  { id: '2', typ: 'Konzept', status: 'Entwurf', prozess: { hauptId: 'A' } },
  { id: '3', status: 'Konformitätsprüfung', prozess: { hauptId: 'A' } },
  { id: '4', status: 'Veröffentlicht' },
];
ok(F.pfRegelwerkVon('A', regelwerke).id === '3' && F.pfRegelwerkVon('B', regelwerke) === null,
  'Das Regelwerk eines Hauptprozesses: archivierte und Konzepte zählen nicht');
ok(F.PF_REGELWERK_TYP === 'Arbeits-/Prozessanweisung' && /'Arbeits-\/Prozessanweisung'/.test(lies('js/admin.js')),
  'Die Art gibt es schon in der Liste der Dokumentenarten');

/* ══ 3) Die Word-Beschreibung ══ */
const schritte = [
  { nr: 1, art: 'start', name: 'Auftrag geht ein', bahn: 'Vertrieb', aus: [] },
  { nr: 2, art: 'frage', name: 'Auftrag vollständig?', bahn: 'Vertrieb', aus: [{ label: 'ja', nachNr: 3 }, { label: 'nein', nachNr: 4 }] },
  { nr: 3, art: 'mensch', name: 'Auftrag erfassen', bahn: 'Vertrieb', aus: [] },
  { nr: 4, art: 'parallel', name: '', bahn: '', aus: [] },
];
ok(F.pfSchrittZeile(schritte[1], 'Entscheidung').join('|') === '2|Auftrag vollständig? (ja → Nr. 3, nein → Nr. 4)|Vertrieb|Entscheidung',
  'Eine Entscheidung nennt, wohin ihre Ausgänge führen');
const bloecke = F.pfBeschreibungBloecke({
  titel: 'Auftragsabwicklung HOL', werk: 'Holding', datum: '08.10.2026', wer: 'Max Muster',
  artTitel: (a) => ({ start: 'Auslöser', frage: 'Entscheidung', mensch: 'Mensch' }[a] || ''),
  modelle: [
    { id: 'A', titel: 'Auftragsabwicklung', art: 'haupt', ebene: 0, lead: 'Vom Auftrag bis zur Rechnung.', schritte, bild: 'm0', quer: true, anlagen: ['Checkliste.pdf'] },
    { id: 'B', titel: 'Angebot', art: 'unter', ebene: 1, oberTitel: 'Auftragsabwicklung', schritte: schritte.slice(0, 1) },
    { id: 'C', titel: 'Reklamation', art: 'neben', ebene: 1, oberTitel: 'Auftragsabwicklung', werk: 'SHB' },
  ],
});
ok(bloecke[0].art === 'titel' && bloecke[0].text === 'Auftragsabwicklung HOL' && /Arbeits-\/Prozessanweisung/.test(bloecke[1].text)
  && /Werk: Holding · Stand 08\.10\.2026 · erzeugt von Max Muster/.test(bloecke[2].text), 'Titel, Art, Werk, Stand, wer');
const umf = bloecke.find(b => b.art === 'tabelle');
ok(umf.zeilen.length === 3 && umf.zeilen[1][1] === 'Unterprozess' && umf.zeilen[2][1] === 'Nebenprozess' && umf.zeilen[1][0].startsWith('   '),
  'Der Umfang als Tabelle, eingerückt nach Ebene');
ok(/Seine 2 Unter- und Nebenprozesse gehören dazu und werden nicht einzeln freigegeben/.test(JSON.stringify(bloecke)), 'Und der Satz, was zählt: der Hauptprozess');
const h1s = bloecke.filter(b => b.art === 'h1');
ok(h1s.length === 3 && h1s.every(b => b.neueSeite), 'Je Modell eine eigene Seite');
ok(bloecke.filter(b => b.art === 'bild').length === 1 && bloecke.find(b => b.art === 'bild').quer === true, 'Ein Bild nur, wo es eines gibt; breit heißt quer');
const tab1 = bloecke.filter(b => b.art === 'tabelle')[1];
ok(tab1.kopf.join() === 'Nr.,Schritt,Zuständig,Art' && tab1.zeilen.length === 3, 'Die Schritte als Tabelle, ohne namenlose Aufteilungen');
ok(bloecke.some(b => b.art === 'p' && /^Nebenprozess von „Auftragsabwicklung" · Werk SHB$/.test(b.text)) && bloecke.some(b => b.art === 'liste' && b.punkte[0] === 'Checkliste.pdf'),
  'Jede Seite sagt, wozu das Modell gehört; hinterlegte Dokumente stehen dabei');

/* Durch die echte Word-Werkstatt */
const dctx = { console, TextEncoder, TextDecoder, Uint8Array, Uint32Array,
  esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
dctx.window = dctx; dctx.globalThis = dctx;
vm.createContext(dctx);
for (const f of ['js/prozessschema.js', 'js/bpmndeutsch.js', 'js/bpmnhilfe.js', 'js/bpmnanleitung.js']) vm.runInContext(lies(f), dctx, { filename: f });
const bytes = vm.runInContext('bpmnAnleitungDocx', dctx)(bloecke, {}, { titel: 'Prozessbeschreibung Auftragsabwicklung HOL' });
const inhalt = new TextDecoder().decode(bytes);
ok(bytes[0] === 0x50 && bytes[1] === 0x4b, 'Es entsteht eine Word-Datei (ZIP)');
ok(/<dc:title>Prozessbeschreibung Auftragsabwicklung HOL<\/dc:title>/.test(inhalt) && /Prozessbeschreibung Auftragsabwicklung HOL · Seite/.test(inhalt),
  'Titel und Fußzeile sind die der Beschreibung, nicht die der Anleitung');
ok(/Auftrag vollständig\? \(ja → Nr\. 3, nein → Nr\. 4\)/.test(inhalt) && /Reklamation/.test(inhalt), 'Schritte und alle Modelle stehen drin');

/* ══ 4) Der Weg im Reiter Prozesse ══ */
const mount = { innerHTML: '' };
const gemeldet = [], hochgeladen = [], ersetzt = [], gespeichertP = [], gespeichertM = [], geoeffnet = [];
const xmlVon = (id, name, doku) => `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="Process_${id}">`
  + (doku ? `<bpmn:documentation>${doku}</bpmn:documentation>` : '')
  + `<bpmn:startEvent id="S" name="Start ${name}"/><bpmn:userTask id="T" name="${name} bearbeiten"/></bpmn:process></bpmn:definitions>`;
const ctx = {
  console, URLSearchParams, setTimeout, clearTimeout, TextEncoder, TextDecoder, Uint8Array, Uint32Array,
  document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    getElementById: (id) => (id === 'proc-cards' || id === 'prozesse-mount' ? mount : (id === 'pf-titel' ? { value: 'Auftragsabwicklung' } : null)) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { search: '' },
  esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtDate: (d) => String(d || ''), toast: (t) => gemeldet.push(String(t)), uiConfirm: async () => true,
  openModal: (h) => { ctx.__modal = h; }, closeModal: () => { ctx.__modal = ''; }, canWriteTab: () => true, policyZuId: () => null,
  workflowBadge: (s) => `<span class="status-badge">${s}</span>`,
  State: { user: { name: 'Max Muster', upn: 'max.muster@dihag.com' }, policies: [] },
  spGetProcessXml: async (id) => ctx.__xml[id],
  spListProcesses: async () => ctx.__liste.map(p => ({ ...p })),
  spSaveProcess: async (name, xml, werk) => { gespeichertM.push({ name, xml, werk }); const p = ctx.__liste.find(x => x.title === name); if (p) { ctx.__xml[p.itemId] = xml; p.modified += '+'; } return { id: p && p.itemId }; },
  spUploadPolicyDoc: async (name, b, typ) => { hochgeladen.push({ name, laenge: b.length, typ }); return { driveId: 'drv', itemId: 'doc1', name, url: 'https://sp/' + name }; },
  spReplaceDocContent: async (d, i, b, typ) => { ersetzt.push({ d, i, laenge: b.length, typ }); return {}; },
  spSavePolicy: async (p) => { gespeichertP.push(JSON.parse(JSON.stringify(p))); return { id: p.id || '77' }; },
  newPolicy: () => ({ id: null, typ: 'Regelwerk', title: '', version: '1.0', status: 'Entwurf', geltungsbereich: [], historie: [] }),
  historieAdd: (p, aktion, text) => { (p.historie = p.historie || []).push({ aktion, text }); },
  pruefeFremdaenderung: async () => true,
  reloadData: async () => { ctx.State.policies = gespeichertP.length ? [{ ...gespeichertP[gespeichertP.length - 1], id: gespeichertP[gespeichertP.length - 1].id || '77' }] : []; },
  openPolicyEditor: (id) => geoeffnet.push(String(id)),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['js/util.js', 'js/prozessschema.js', 'js/bpmndeutsch.js', 'js/bpmnhilfe.js', 'js/bpmnanleitung.js', 'js/landkarte.js', 'js/prozesse.js', 'js/prozessfreigabe.js']) {
  vm.runInContext(lies(f), ctx, { filename: f });
}
const run = (s) => vm.runInContext(s, ctx);

ctx.__liste = [
  { itemId: 'A', title: 'Auftragsabwicklung', ordner: 'HOL', modified: 'm1' },
  { itemId: 'B', title: 'Angebot', ordner: 'HOL', modified: 'm2' },
  { itemId: 'C', title: 'Reklamation', ordner: 'HOL', modified: 'm3' },
];
ctx.__xml = {
  A: xmlVon('A', 'Auftrag', 'Unterprozesse: Angebot\n[[rms:unter=B]]\nNebenprozesse: Reklamation\n[[rms:neben=C]]'),
  B: xmlVon('B', 'Angebot'), C: xmlVon('C', 'Reklamation'),
};
run(`_processes = __liste.map(p => ({ ...p })); _procLinkCache = {};
  for (const p of _processes) _procLinkCache[p.itemId + '|' + p.modified] = procEintragAusXml(__xml[p.itemId]);`);

ok(run("pfIstHauptprozess('A')") === true && run("pfIstHauptprozess('B')") === false && run("pfHauptprozesseVon('B').join()") === 'A',
  'Hauptprozess ist, was unter keinem anderen Modell steht; Teile kennen ihren Hauptprozess');
ok(/pfFreigabeStarten\(&quot;A&quot;\)/.test(run("pfStatusHtml('A')")) && /Zur Freigabe/.test(run("pfStatusHtml('A')")), 'Ohne Regelwerk: „📋 Zur Freigabe"');
ok(/Freigabe über Auftragsabwicklung/.test(run("pfUeberHtml('B')")) && /noch nicht eingereicht/.test(run("pfUeberHtml('B')")), 'Am Unterprozess: Freigabe über den Hauptprozess, noch nicht eingereicht');

await run("pfFreigabeStarten('B')");
ok(gemeldet.some(t => /Teil von „Auftragsabwicklung"\. Freigegeben wird der Hauptprozess/.test(t)), 'Ein Unterprozess wird nicht einzeln freigegeben – die Meldung sagt, wo es langgeht');
await run("pfFreigabeStarten('A')");
ok(/Freigabe vorbereiten: Auftragsabwicklung/.test(ctx.__modal) && /Umfang \(3 Modelle\)/.test(ctx.__modal) && /Arbeits-\/Prozessanweisung/.test(ctx.__modal),
  'Der Dialog zeigt Art und Umfang, bevor etwas angelegt wird');

await run("pfAnlegen('A')");
ok(hochgeladen.length === 1 && hochgeladen[0].name === 'Prozessbeschreibung Auftragsabwicklung (HOL).docx' && /wordprocessingml/.test(hochgeladen[0].typ) && hochgeladen[0].laenge > 1000,
  'Die Word-Beschreibung wird als Regelwerkdokument hochgeladen');
const neu = gespeichertP[0];
ok(neu && neu.regelwerkTyp === 'Arbeits-/Prozessanweisung' && neu.status === 'Entwurf' && neu.title === 'Auftragsabwicklung' && neu.geltungsbereich.join() === 'HOL'
  && neu.dokumentItemId === 'doc1' && neu.dokumentDriveId === 'drv', 'Das Regelwerk: Entwurf, Art, Geltungsbereich, Dokument');
ok(neu.prozess.hauptId === 'A' && neu.prozess.stand.map(s => s.id + ':' + s.art).join() === 'A:haupt,B:unter,C:neben' && neu.prozess.stand.every(s => /^[0-9a-f]{8}$/.test(s.h))
  && neu.prozess.standVon === 'Max Muster', 'Am Regelwerk steht der Hauptprozess mit dem Stand, aus dem das Dokument entstand');
ok(/mit 2 Unter- und Nebenprozessen\. Prozessbeschreibung erzeugt/.test(neu.historie[0].text), 'Die Historie sagt, woher das Regelwerk kommt');
ok(gespeichertM.length === 1 && gespeichertM[0].name === 'Auftragsabwicklung' && /\[\[rms:policies=77\]\]/.test(gespeichertM[0].xml) && /\[\[rms:unter=B\]\]/.test(gespeichertM[0].xml),
  'Das Modell trägt das Regelwerk ein (R9 erfüllt), die Gliederung bleibt');
ok(geoeffnet.join() === '77', 'Danach öffnet sich der Editor: Prüfer, Geschäftsleitung, dann zur Konformitätsprüfung');

// Das Eintragen ins Modell hat die Datei geändert – am Ablauf aber nichts.
run(`for (const p of _processes) _procLinkCache[p.itemId + '|' + p.modified] = procEintragAusXml(__xml[p.itemId]);`);
let html = run("pfStatusHtml('A')");
ok(/pfRegelwerkOeffnen\(&quot;77&quot;\)/.test(html) && /Entwurf/.test(html) && !/Beschreibung aktualisieren/.test(html),
  'Mit Regelwerk: Status und Version; das Eintragen des Regelwerks zählt nicht als Änderung');
ok(/Freigabe über Auftragsabwicklung: <span class="status-badge">Entwurf/.test(run("pfUeberHtml('C')")), 'Am Nebenprozess steht der Status des Hauptprozesses');

// Ein Schritt im Unterprozess wird umbenannt.
ctx.__xml.B = xmlVon('B', 'Angebot schreiben');
run(`_processes.find(p => p.itemId === 'B').modified = 'm2b'; _procLinkCache['B|m2b'] = procEintragAusXml(__xml.B);`);
html = run("pfStatusHtml('A')");
ok(/⚠ Geändert: Beschreibung aktualisieren/.test(html) && /Geändert: „Angebot&quot;/.test(html), 'Ändert sich der Ablauf, steht es am Hauptprozess, mit dem Modell');

ctx.State.policies[0].status = 'Veröffentlicht';
await run("pfBeschreibungAktualisieren('A')");
ok(ersetzt.length === 1 && ersetzt[0].d === 'drv' && ersetzt[0].i === 'doc1' && ersetzt[0].laenge > 1000, 'Das Dokument wird am selben Ort ersetzt: SharePoint führt die Version');
const nach = gespeichertP[gespeichertP.length - 1];
ok(nach.prozess.stand.find(s => s.id === 'B').h === run("procEintragVon(procModellVon('B')).h") && nach.historie.some(h => h.aktion === 'Prozessbeschreibung aktualisiert' && /„Angebot"/.test(h.text)),
  'Stand und Historie sind nachgezogen');
ok(geoeffnet[geoeffnet.length - 1] === '77', 'Bei einem veröffentlichten Regelwerk öffnet sich der Editor: Version erhöhen, erneut einreichen');

/* In der Gliederung */
run(`_procKacheln = false; _procBaumOffen = new Set(['A']); _prozModus = 'liste'; _renderProcCards();`);
ok(/pfRegelwerkOeffnen/.test(mount.innerHTML) && (mount.innerHTML.match(/📋 Freigabe über Auftragsabwicklung/g) || []).length === 2,
  'Die Gliederung: Status am Hauptprozess, „Freigabe über" an Unter- und Nebenprozess');

/* ══ 5) Freigaben, Mails, Editor, Ablage ══ */
const fg = lies('js/freigaben.js');
ok((fg.match(/\$\{fgProzessZeile\(p\)\}/g) || []).length === 3 && /\$\{fgProzessZeile\(p, true\)\}/.test(fg), 'Die Zeile zum Prozess an allen drei Karten und in jeder Workflow-Mail');
const fctx = { esc: dctx.esc, Math, Date, Array, String };
vm.createContext(fctx);
vm.runInContext(fg.slice(fg.indexOf('function fgProzessZeile'), fg.indexOf('function _wfDokumentHtml')), fctx);
const zeile = vm.runInContext("fgProzessZeile({ title: 'X', prozess: { hauptId: 'A', titel: 'Auftragsabwicklung', standAm: '2026-10-08T10:00:00Z', stand: [{}, {}, {}] } })", fctx);
ok(/Gibt den Prozess <b>Auftragsabwicklung<\/b> frei, mit 2 Unter- und Nebenprozessen\. Diagramme und Schritte stehen im Dokument \(Stand 08\.10\.2026\)/.test(zeile),
  'Wortlaut der Zeile');
ok(vm.runInContext("fgProzessZeile({ title: 'Y' })", fctx) === '', 'Ein gewöhnliches Regelwerk bekommt keine');
ok(/p\.prozess && p\.prozess\.hauptId \? `\$\{typeof fgProzessZeile === 'function'/.test(lies('js/admin.js')), 'Im Editor steht sie über dem Dokument, mit dem Hinweis, wo es entsteht');
ok(/\{ feld: 'prozess',\s+spalte: '',\s+json: true,\s+leer: null \}/.test(lies('js/sharepoint.js')), 'Gespeichert im Sammelfeld, ohne neue SharePoint-Spalte');
const mod = lies('js/module.js');
ok(/prozesse:\s+MODUL_ADMIN\.concat\(\[[^\]]*'prozesse', 'prozessfreigabe'/.test(mod) && /notfall:\s+MODUL_ADMIN\.concat\(\[[^\]]*'prozesse', 'prozessfreigabe'/.test(mod),
  'Das Modul lädt mit dem Reiter Prozesse und dem Notfall-Reiter');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
