/**
 * Die Prozesse des RMS selbst (js/rmsprozesse.js)
 *
 * 13 Hauptprozesse, darunter ihre Unter- und Nebenprozesse, 61 Modelle. Ein
 * Katalog dieser Größe ist nur so gut wie seine Prüfung: Ein Rücksprung, der
 * sein Ziel verfehlt, wird stillschweigend zu einem Ende; eine Beschriftung
 * über 58 Zeichen wird abgeschnitten und verliert ihr Verb; ein Pfeil, der
 * durch einen Kasten läuft, fällt erst im Bild auf. Deshalb wird jedes Modell
 * gebaut und gegen Hausschema, Lage und Pfeile gerechnet, nicht angesehen.
 *
 * Danach das Anlegen: von unten nach oben, in der Ablage des Konzerns, mit
 * den Datei-Kennungen der schon angelegten Modelle in ⊞ und Gliederung.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const S = require(ROOT + '/js/prozessschema.js');
const R = require(ROOT + '/js/rmsprozesse.js');
const { RMS_PROZESSE } = R;

/* ── 1) Der Katalog als Ganzes ── */
ok(RMS_PROZESSE.length === 61, `61 Modelle im Katalog (ist ${RMS_PROZESSE.length})`);
ok(new Set(RMS_PROZESSE.map(p => p.name)).size === RMS_PROZESSE.length, 'Jeder Name kommt einmal vor');
ok(new Set(RMS_PROZESSE.map(p => p.kennung)).size === RMS_PROZESSE.length, 'Jede Prozess-Kennung kommt einmal vor');
ok(RMS_PROZESSE.every(p => /\(RMS\)$/.test(p.name)), 'Alle Namen enden auf „(RMS)"');
// SharePoint ersetzt solche Zeichen im Dateinamen durch „_" (spProzessDateiname):
// Aus „Reifegrad IT/OT bewerten" wurde in der Liste „IT_OT", der Pool im Modell
// hieß anders als die Datei.
ok(RMS_PROZESSE.every(p => !/[#%&{}\\<>*?/$!'":@+`|=]/.test(p.name)),
  'Kein Name trägt ein Zeichen, das SharePoint im Dateinamen ersetzen würde');
ok(RMS_PROZESSE.every(p => S.prozessKennungGueltig(p.kennung) && /^Process_RMS_/.test(p.kennung)),
  'Die Kennungen sind gültig und sprechend (Process_RMS_…), keine „Process_1"');
ok(RMS_PROZESSE.every(p => Array.isArray(p.beschreibung) && p.beschreibung.length >= 2 && p.norm),
  'Jedes Modell hat eine Beschreibung aus mindestens zwei Sätzen und einen Normbezug');
ok(R.RMS_PROZESS_ABLAGE === 'KONZERN', 'Abgelegt wird beim Konzern: Das RMS ist ein Konzernsystem');

const haupt = R.rmsHauptprozesse().map(p => p.name);
ok(haupt.length === 13, `13 Hauptprozesse oben (ist ${haupt.length})`);
['Regelwerk einführen und pflegen (RMS)', 'Unterweisen und sensibilisieren (RMS)', 'Normkonformität nachweisen (RMS)',
  'Informationssicherheitsrisiken behandeln (RMS)', 'Ziele, Maßnahmen und Kennzahlen steuern (RMS)',
  'Wirksamkeit prüfen und verbessern (RMS)', 'Sicherheitsvorfälle behandeln (RMS)', 'Notfallvorsorge betreiben (RMS)',
  'Assets inventarisieren (RMS)', 'Prozesse managen (RMS)', 'KI-Systeme genehmigen (RMS)',
  'Konzernregelwerk lenken (RMS)', 'RMS betreiben und ändern (RMS)'].forEach(n =>
  ok(haupt.includes(n), `Hauptprozess „${n}"`));

/* Jedes Modell steht irgendwo: oben oder unter einem anderen. */
const darunter = new Set();
RMS_PROZESSE.forEach(p => { const k = R.rmsKinder(p); [...k.aufrufe, ...k.unter, ...k.neben].forEach(n => darunter.add(n)); });
ok(RMS_PROZESSE.every(p => haupt.includes(p.name) || darunter.has(p.name)), 'Jedes übrige Modell hängt unter einem Hauptprozess');
ok([...darunter].every(n => R.rmsProzess(n)), 'Jede Einbindung und Zuordnung zeigt auf ein Modell des Katalogs');

/* Unter- und Nebenprozesse, die mehrere Eltern haben: einmal gepflegt. */
const eltern = (name) => RMS_PROZESSE.filter(p => { const k = R.rmsKinder(p); return [...k.aufrufe, ...k.unter, ...k.neben].includes(name); }).map(p => p.name);
ok(eltern('Maßnahme umsetzen (RMS)').length >= 5, 'Maßnahme umsetzen ist einmal modelliert und überall eingebunden, wo Maßnahmen entstehen');
ok(eltern('Regelwerk freigeben lassen (RMS)').includes('Prozesse managen (RMS)'),
  'Prozesse werden über denselben Freigabe-Workflow freigegeben wie Regelwerke');
ok(eltern('Kenntnisnahme bestätigen (RMS)').length === 2, 'Die Kenntnisnahme gehört zum Regelwerk und zur Unterweisung');
ok(eltern('Aus der Mail entscheiden (RMS)').length === 3, 'Die Ein-Klick-Entscheidung hängt an Prüfung, Mitbestimmung und Freigabe');
ok(eltern('Sammelmeldungen versenden (RMS)').length >= 4, 'Die Sammelmeldungen laufen neben den Registern her');

const reihe = R.rmsReihenfolge().map(p => p.name);
ok(reihe.length === RMS_PROZESSE.length, 'Die Reihenfolge zum Anlegen enthält jedes Modell einmal');
ok(RMS_PROZESSE.every(p => { const k = R.rmsKinder(p); return [...k.aufrufe, ...k.unter, ...k.neben].every(n => reihe.indexOf(n) < reihe.indexOf(p.name)); }),
  'Jedes Modell kommt nach allem, was es einbindet oder nennt: Es braucht deren Datei-Kennung');

/* ── 2) Jedes Modell ── */
const ids = {};
RMS_PROZESSE.forEach((p, i) => { ids[p.name] = 'ITEM' + i; });
const befunde = [];
const melde = (p, t) => befunde.push(`${p.name}: ${t}`);
const verbOk = (t) => /\b\w+e?n\b\s*$/.test(t);

function lage(xml) {
  const formen = {}, kasten = [];
  for (const m of xml.matchAll(/<bpmndi:BPMNShape[^>]*bpmnElement="([^"]+)"[^>]*>([\s\S]*?)<\/bpmndi:BPMNShape>/g)) {
    const b = /<dc:Bounds x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(m[2]);
    const lb = /<bpmndi:BPMNLabel><dc:Bounds x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(m[2]);
    if (/^(Pool_|Lane_)/.test(m[1])) continue;
    if (b) { formen[m[1]] = { x: +b[1], y: +b[2], w: +b[3], h: +b[4] }; kasten.push({ el: m[1], ...formen[m[1]] }); }
    if (lb) kasten.push({ el: m[1] + ' (Beschriftung)', x: +lb[1], y: +lb[2], w: +lb[3], h: +lb[4] });
  }
  const fl = {};
  for (const m of xml.matchAll(/<bpmn:sequenceFlow id="([^"]+)"[^>]*sourceRef="([^"]+)" targetRef="([^"]+)"/g)) fl[m[1]] = { von: m[2], nach: m[3] };
  const kanten = [...xml.matchAll(/<bpmndi:BPMNEdge id="[^"]+" bpmnElement="([^"]+)">([\s\S]*?)<\/bpmndi:BPMNEdge>/g)]
    .map(m => ({ id: m[1], ...fl[m[1]], wp: [...m[2].matchAll(/x="([-\d.]+)" y="([-\d.]+)"/g)].map(z => [+z[1], +z[2]]) }));
  return { formen, kasten, kanten };
}

for (const p of RMS_PROZESSE) {
  const zeilen = p.schritte.split('\n').filter(z => z.trim());
  const st = S.prozessTextLesen(p.schritte);
  if (zeilen.length > 24) melde(p, `${zeilen.length} Zeilen, der Generator liest höchstens 24`);
  if (st.length !== zeilen.length) melde(p, `${zeilen.length} Zeilen, aber ${st.length} Schritte gelesen`);
  st.forEach(s => {
    [s.label, s.nein, s.neinEnde].filter(Boolean).forEach(t => { if (t.length > 58) melde(p, `Beschriftung über 58 Zeichen, sie würde abgeschnitten: ${t}`); });
    if (['user', 'service', 'manual'].includes(s.kind) && !verbOk(s.label)) melde(p, `Schritt ohne Verb am Ende: ${s.label}`);
    if (s.nein && s.neinTyp !== 'unter' && !verbOk(s.nein)) melde(p, `Nein-Schritt ohne Verb am Ende: ${s.nein}`);
    if (s.kind === 'frage' && !s.nein && !s.neinEnde && !s.neinZurueck) melde(p, `Entscheidung ohne benannten Nein-Ausgang: ${s.label}`);
  });
  // Jeder Sprung findet sein Ziel; sonst würde er still zu einem Ende.
  const namen = [];
  st.forEach(s => { if (!['start', 'zurueck', 'ende'].includes(s.kind)) namen.push(s.label.toLowerCase()); if (s.nein) namen.push(s.nein.toLowerCase()); });
  st.forEach((s, i) => {
    if (s.kind === 'frage' && s.neinZurueck && !namen.includes(s.neinZurueck.toLowerCase())) melde(p, `Sprungziel fehlt: ${s.neinZurueck}`);
    if (s.kind === 'zurueck' && !st.slice(0, i).some(y => !['start', 'zurueck', 'ende'].includes(y.kind) && y.label.toLowerCase() === s.label.toLowerCase()))
      melde(p, `„Zurück:" zeigt auf keinen früheren Schritt: ${s.label}`);
  });
  const xml = R.rmsModellXml(p, ids);
  const pr = S.prozessSchemaPruefen(xml, {});
  pr.fehler.forEach(f => melde(p, `Verstoß ${f.regel}: ${f.text}`));
  pr.hinweise.forEach(f => melde(p, `Hinweis ${f.regel}: ${f.text}`));
  if (/name="(Beendet|Nachbessern)"/.test(xml)) melde(p, 'Ein Nein-Zweig endet ohne sprechendes Ergebnis');
  if (/NaN|undefined/.test(xml)) melde(p, 'NaN oder undefined im XML');
  S.prozessPfeileReparieren(xml).repariert.forEach(r => melde(p, `Pfeil ${r.fluss}: ${r.grund.join(', ')}`));
  // Lage: nichts übereinander, kein Pfeil durch einen Kasten, keine zwei Pfeile auf einer Linie.
  const { formen, kasten, kanten } = lage(xml);
  const trifft = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; i < kasten.length; i++) for (let j = i + 1; j < kasten.length; j++)
    if (kasten[i].el.split(' ')[0] !== kasten[j].el.split(' ')[0] && trifft(kasten[i], kasten[j])) melde(p, `${kasten[i].el} liegt auf ${kasten[j].el}`);
  const durch = (a, b, f) => Math.max(a[0], b[0]) > f.x + 1 && Math.min(a[0], b[0]) < f.x + f.w - 1 && Math.max(a[1], b[1]) > f.y + 1 && Math.min(a[1], b[1]) < f.y + f.h - 1;
  kanten.forEach(e => {
    for (let i = 1; i < e.wp.length; i++) for (const [fid, f] of Object.entries(formen))
      if (fid !== e.von && fid !== e.nach && durch(e.wp[i - 1], e.wp[i], f)) melde(p, `Pfeil ${e.id} läuft durch ${fid}`);
  });
  const segs = kanten.flatMap(e => e.wp.slice(1).map((q, i) => ({ e: e.id, a: e.wp[i], b: q })));
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const s = segs[i], t = segs[j];
    if (s.e === t.e) continue;
    const senk = (q) => Math.abs(q.a[0] - q.b[0]) < 1, waag = (q) => Math.abs(q.a[1] - q.b[1]) < 1;
    let ueber = 0;
    if (senk(s) && senk(t) && Math.abs(s.a[0] - t.a[0]) < 1) ueber = Math.min(Math.max(s.a[1], s.b[1]), Math.max(t.a[1], t.b[1])) - Math.max(Math.min(s.a[1], s.b[1]), Math.min(t.a[1], t.b[1]));
    if (waag(s) && waag(t) && Math.abs(s.a[1] - t.a[1]) < 1) ueber = Math.min(Math.max(s.a[0], s.b[0]), Math.max(t.a[0], t.b[0])) - Math.max(Math.min(s.a[0], s.b[0]), Math.min(t.a[0], t.b[0]));
    if (ueber > 20) melde(p, `Pfeile ${s.e} und ${t.e} liegen ${Math.round(ueber)} Punkte aufeinander`);
  }
  // Jede ⊞ zeigt auf ihr Modell: Datei-Kennung im Marker, Prozess-Kennung als calledElement.
  for (const m of xml.matchAll(/<bpmn:callActivity id="[^"]+" name="([^"]*)" calledElement="([^"]+)"><bpmn:documentation>([^<]*)<\/bpmn:documentation>/g)) {
    const ziel = R.rmsProzess(m[1]);
    if (!ziel || ziel.kennung !== m[2] || !m[3].includes('[[rms:modell=' + ids[ziel.name] + ']]')) melde(p, `⊞ „${m[1]}" zeigt nicht richtig auf sein Modell`);
  }
  if ((xml.match(/<bpmn:callActivity\b/g) || []).length !== (xml.match(/calledElement="Process_RMS_/g) || []).length) melde(p, 'Eine ⊞ ohne calledElement');
}
ok(befunde.length === 0, befunde.length
  ? `${befunde.length} Befund(e): ${befunde.slice(0, 6).join(' · ')}`
  : 'Alle 61 Modelle: Hausschema ohne Verstoß und ohne Hinweis, jede Beschriftung ganz, jeder Sprung mit Ziel, nichts übereinander, kein Pfeil durch einen Kasten oder auf einem anderen');

/* Die Dokumentation des Prozesses: Beschreibung, Normbezug, Gliederung. */
const h1 = R.rmsProzess('Regelwerk einführen und pflegen');
const doku = R.rmsDokuText(h1, ids);
ok(doku.startsWith(h1.beschreibung[0]) && /\nNormbezug: ISO 27001/.test(doku), 'Die Dokumentation beginnt mit der Beschreibung und nennt den Normbezug');
ok(/\nNebenprozesse: Änderung vorschlagen \(RMS\); Regelwerk-Dokumente prüfen \(RMS\); Ausnahme genehmigen \(RMS\)\n\[\[rms:neben=ITEM\d+,ITEM\d+,ITEM\d+\]\]$/.test(doku),
  'Die Nebenprozesse stehen in Klartext und als Marker mit Datei-Kennungen, wie die Gliederung im RMS sie liest');
ok(!/rms:neben/.test(R.rmsDokuText(h1, {})), 'Ohne Datei-Kennungen keine Marker: Ein Verweis ins Leere wäre schlimmer als keiner');
const xmlH1 = R.rmsModellXml(h1, ids);
ok(/<bpmn:process id="Process_RMS_regelwerk"/.test(xmlH1) && /<bpmn:participant id="Pool_1" name="Regelwerk einführen und pflegen \(RMS\)"/.test(xmlH1),
  'Das Modell trägt seine feste Kennung und seinen Namen');
ok(/calledElement="Process_RMS_archiv"/.test(xmlH1), 'Auch ein Unterprozess im Nein-Zweig wird eingebunden (Regelwerk außer Kraft setzen)');

/* Wie das RMS die Datei liest: Gliederung und Kurzbeschreibung. */
const ctxP = { console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, RegExp, Number,
  document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
ctxP.globalThis = ctxP;
vm.createContext(ctxP);
['js/util.js', 'js/prozessschema.js', 'js/rmsprozesse.js', 'js/prozesse.js'].forEach(f => vm.runInContext(lies(f), ctxP));
const gl = vm.runInContext('procGliederungAusText', ctxP)(xmlH1);
ok(gl.n.length === 3 && gl.u.length === 0, 'Die Gliederung im RMS liest drei Nebenprozesse aus dem Modell');
ok(vm.runInContext('procUnterAusXml', ctxP)(xmlH1).length === 7, 'und sieben eingebundene Unterprozesse (⊞)');
const lead = vm.runInContext('_procLead', ctxP)(xmlH1, null);
ok(lead.startsWith('Der Lebenszyklus eines Regelwerks') && /Normbezug:/.test(lead) && !/rms:/.test(lead),
  'Die Beschreibung erscheint in Ansicht und Prozessbeschreibung als Satz unter dem Titel, ohne Marker');

/* ── 3) Anlegen im RMS ── */
const gespeichert = [], meldungen = [], fragen = [];
let antworten = [];
let naechsteId = 100;
const ctx = { console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, RegExp, Number,
  document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  localStorage: { getItem: () => null, setItem: () => {} }, window: {},
  esc: (s) => String(s ?? ''), canWriteTab: () => true,
  toast: (t, art) => meldungen.push({ t, art }),
  uiConfirm: async (text, o) => { fragen.push({ text, o }); return antworten.shift(); },
  spProzessDateiname: (n) => String(n || 'Prozess').replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '_').trim() || 'Prozess',
  spSaveProcess: async (name, xml, werk) => {
    const alt = ctx._liste.find(p => p.title === name && p.ordner === werk);
    const id = alt ? alt.itemId : String(naechsteId++);
    gespeichert.push({ name, xml, werk, id });
    return { id };
  },
  spListProcesses: async () => ctx._liste,
  _liste: [],
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/util.js', 'js/prozessschema.js', 'js/rmsprozesse.js', 'js/prozesse.js'].forEach(f => vm.runInContext(lies(f), ctx));
vm.runInContext('initProzesse = async () => {}', ctx);

antworten = [true];
await vm.runInContext('seedStandardProcesses()', ctx);
ok(gespeichert.length === 61 && gespeichert.every(g => g.werk === 'KONZERN'), 'Alle 61 Modelle werden in der Ablage KONZERN gespeichert');
ok(fragen.length === 1 && /61 Modelle/.test(fragen[0].text) && /13 Hauptprozesse/.test(fragen[0].text) && fragen[0].o.okLabel === '61 anlegen',
  'Vorher fragt das RMS, mit Zahl der Modelle und Hauptprozesse');
const idVon = {};
gespeichert.forEach(g => { idVon[g.name] = g.id; });
const pos = (n) => gespeichert.findIndex(g => g.name === n);
ok(RMS_PROZESSE.every(p => { const k = R.rmsKinder(p); return [...k.aufrufe, ...k.unter, ...k.neben].every(n => pos(n) < pos(p.name)); }),
  'Von unten nach oben: Jedes Modell wird nach allem gespeichert, worauf es zeigt');
const xmlH1Live = gespeichert.find(g => g.name === h1.name).xml;
ok(xmlH1Live.includes('[[rms:modell=' + idVon['Regelwerk-Konzept entscheiden (RMS)'] + ']]')
  && xmlH1Live.includes('[[rms:neben=' + ['Änderung vorschlagen (RMS)', 'Regelwerk-Dokumente prüfen (RMS)', 'Ausnahme genehmigen (RMS)'].map(n => idVon[n]).join(',') + ']]'),
  'Eingebundene und zugeordnete Modelle tragen die Datei-Kennungen, die SharePoint gerade vergeben hat');
ok(meldungen.some(m => /61 angelegt/.test(m.t) && m.art === 'success'), 'Danach meldet das RMS, wie viele angelegt sind');

/* Ein zweites Mal: Alles ist da. Überspringen ändert nichts. */
ctx._liste = gespeichert.map(g => ({ itemId: g.id, title: g.name, ordner: g.werk }));
gespeichert.length = 0; fragen.length = 0; meldungen.length = 0;
antworten = [true, false];
await vm.runInContext('seedStandardProcesses()', ctx);
ok(fragen.length === 2 && /61<\/b> gibt es dort schon/.test(fragen[0].text) && fragen[1].o.cancelLabel === 'Überspringen',
  'Gibt es die Modelle schon, fragt ein zweiter Schritt: aktualisieren oder überspringen');
ok(gespeichert.length === 0 && meldungen.some(m => /Nichts zu tun/.test(m.t)), 'Überspringen schreibt nichts');

/* Aktualisieren: dieselben Dateien, neue Version. */
antworten = [true, true];
fragen.length = 0; meldungen.length = 0;
await vm.runInContext('seedStandardProcesses()', ctx);
ok(gespeichert.length === 61 && gespeichert.every(g => ctx._liste.some(p => p.itemId === g.id)),
  'Aktualisieren schreibt in dieselben Dateien, die Datei-Kennungen bleiben');
ok(meldungen.some(m => /61 aktualisiert/.test(m.t)), 'und meldet die Zahl der aktualisierten');

/* Ein Modell gleichen Namens in einem anderen Werk ist ein anderes Modell. */
ctx._liste = [{ itemId: '7', title: 'Maßnahme umsetzen (RMS)', ordner: 'SHB' }];
gespeichert.length = 0; fragen.length = 0;
antworten = [true];
await vm.runInContext('seedStandardProcesses()', ctx);
ok(gespeichert.length === 61 && fragen.length === 1, 'Gleichnamiges in einer anderen Ablage zählt nicht als vorhanden');

/* Ohne Schreibrecht passiert nichts. */
gespeichert.length = 0; meldungen.length = 0;
vm.runInContext('canWriteTab = () => false', ctx);
await vm.runInContext('seedStandardProcesses()', ctx);
ok(gespeichert.length === 0 && meldungen.some(m => /Nur Lesezugriff/.test(m.t)), 'Ohne Schreibrecht auf „Prozesse" wird nichts angelegt');

/* ── 4) Verdrahtung ── */
const pjs = lies('js/prozesse.js');
ok(/onclick="seedStandardProcesses\(\)"/.test(pjs) && /📋 Standard-Prozesse/.test(pjs), 'Der Knopf „📋 Standard-Prozesse" ruft das Anlegen');
ok(!/RMS_PROCESS_SEEDS/.test(pjs), 'Die alten flachen Schrittlisten sind entfernt');
const modul = lies('js/module.js');
ok(/prozesse:\s+MODUL_ADMIN\.concat\(\['prozessschema', 'rmsprozesse'/.test(modul) && /dokumentation: \['prozessschema', 'rmsprozesse'/.test(modul),
  'Der Katalog lädt mit den Reitern „Prozesse" und „Dokumentation"');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`); process.exit(fail ? 1 : 0);
