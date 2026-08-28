import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

// ---- Kontext für konzepte.js ----
const kctx = {
  console, esc,
  fmtDate: () => '24.07.2026',
  emptyState: (t) => `<empty>${t}</empty>`,
  toast: () => {},
  State: { user: { upn:'a@dihag.com', name:'Max Muster' }, konzepte: [], policies: [] },
  isCurrentUserGeschaeftsleitung: () => kISGF,
  canWriteTab: () => kCANWRITE,
};
kctx.window = kctx; kctx.globalThis = kctx;
let kISGF = false, kCANWRITE = true;
vm.createContext(kctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/util.js', 'utf8'), kctx);   // gemeinsame Helfer
vm.runInContext(fs.readFileSync(ROOT + '/js/konzepte.js','utf8'), kctx);

const run = (src) => vm.runInContext(src, kctx);

// 1) Defaults
run(`globalThis.__k = newKonzept();`);
ok(kctx.__k.typ === 'Konzept', 'newKonzept.typ = Konzept');
ok(kctx.__k.konzept.prioritaet === 'mittel', 'Default-Priorität = mittel');

// 2) Status-Ableitung
run(`
  const idee = newKonzept();
  const eingereicht = newKonzept(); eingereicht.konzept.eingereichtAm = '2026-07-01T00:00:00Z';
  const ang = newKonzept(); ang.konzept.entscheidung.status = 'angenommen';
  const abg = newKonzept(); abg.konzept.entscheidung.status = 'abgelehnt';
  const zur = newKonzept(); zur.konzept.entscheidung.status = 'zurueckgestellt';
  globalThis.__st = [konzeptStatus(idee), konzeptStatus(eingereicht), konzeptStatus(ang), konzeptStatus(abg), konzeptStatus(zur)];
`);
ok(JSON.stringify(kctx.__st) === JSON.stringify(['Idee','GF-Prüfung','Angenommen','Abgelehnt','Zurückgestellt']), 'konzeptStatus deckt alle Phasen ab');

// 3) Karten: GF sieht Entscheidungsbuttons nur bei GF-Prüfung
kISGF = true; kCANWRITE = true;
kctx.State.konzepte = [
  { id:'1', title:'KI-Regelwerk', kategorie:'IT-Sicherheit', modifiedAt:'2026-07-02',
    konzept:{ motivation:'Weil KI Risiken birgt', skizze:'', prioritaet:'hoch', antragstellerName:'Max', eingereichtAm:'2026-07-01T00:00:00Z', entscheidung:{status:'',von:'',vonName:'',am:'',kommentar:''}, regelwerkId:'' } },
  { id:'2', title:'Idee X', kategorie:'Allgemein', modifiedAt:'2026-07-03',
    konzept:{ motivation:'m', skizze:'', prioritaet:'mittel', antragstellerName:'', eingereichtAm:'', entscheidung:{status:'',von:'',vonName:'',am:'',kommentar:''}, regelwerkId:'' } },
];
run(`globalThis.__cards = renderKonzeptCards('');`);
let html = kctx.__cards;
ok(html.includes('💡 KI-Regelwerk') && html.includes('💡 Idee X'), 'Beide Konzeptkarten gerendert');
ok(html.includes('Annehmen → Regelwerk') && html.includes('✗ Ablehnen') && html.includes('⏸ Zurückstellen'), 'GF: Entscheidungsbuttons bei GF-Prüfung');
ok(html.includes('📤 Zur GF-Prüfung'), 'Idee (Entwurf): „Zur GF-Prüfung“-Button');
// GF-Prüfung-Konzept vor Idee sortiert
ok(html.indexOf('KI-Regelwerk') < html.indexOf('Idee X'), 'Sortierung: GF-Prüfung vor Idee');

// 4) Nicht-GF sieht keine Entscheidungsbuttons
kISGF = false;
run(`globalThis.__cards2 = renderKonzeptCards('');`);
ok(!kctx.__cards2.includes('Annehmen → Regelwerk') && !kctx.__cards2.includes('✗ Ablehnen'), 'Nicht-GF: keine Entscheidungsbuttons');

// 5) Suche filtert
run(`globalThis.__cards3 = renderKonzeptCards('ki-regelwerk');`);
ok(kctx.__cards3.includes('KI-Regelwerk') && !kctx.__cards3.includes('Idee X'), 'Suche filtert Karten');

// 6) Konzept → Beschreibung (Konvertierung)
run(`
  const k = newKonzept(); k.title='KI'; k.konzept.motivation='Mot'; k.konzept.skizze='Ski';
  globalThis.__b = _konzeptToBeschreibung(k);
`);
ok(kctx.__b.includes('Motivation: Mot') && kctx.__b.includes('Skizze / Inhalt: Ski') && kctx.__b.includes('Aus dem Konzept'), 'Beschreibung übernimmt Motivation+Skizze');

// ---- SharePoint _mapPolicy Round-Trip ----
const sctx = { console, JSON, };
sctx.window = sctx; sctx.globalThis = sctx;
sctx.fetch = () => {}; sctx.location = { origin:'', pathname:'' };
vm.createContext(sctx);
try {
  vm.runInContext(fs.readFileSync(ROOT + '/js/sharepoint.js','utf8'), sctx);
  const konzeptObj = { motivation:'M', skizze:'S', prioritaet:'hoch', entscheidung:{status:'angenommen'}, regelwerkId:'99' };
  sctx.__item = { id:'7', fields:{ Title:'T', Kategorie:'NIS2', Typ2:'Konzept', KonzeptJson: JSON.stringify(konzeptObj) } };
  vm.runInContext(`globalThis.__m = _mapPolicy(__item);`, sctx);
  const m = sctx.__m;
  ok(m.typ === 'Konzept', '_mapPolicy: Typ=Konzept → typ=Konzept');
  ok(m.konzept && m.konzept.prioritaet === 'hoch' && m.konzept.regelwerkId === '99', '_mapPolicy: KonzeptJson korrekt geparst');
  sctx.__item2 = { id:'8', fields:{ Title:'Regel', Kategorie:'ISO 27001' } };
  vm.runInContext(`globalThis.__m2 = _mapPolicy(__item2);`, sctx);
  ok(sctx.__m2.typ === 'Regelwerk' && sctx.__m2.konzept === null, '_mapPolicy: ohne Typ → Regelwerk, konzept=null');
} catch (e) {
  fail++; console.log('  ✗ sharepoint.js _mapPolicy nicht ladbar:', e.message);
}

// ---- Statische Wiring-Checks ----
const shp = fs.readFileSync(ROOT + '/js/sharepoint.js','utf8');
ok(/Typ2:\s*\(p\.typ === 'Konzept'\)/.test(shp), 'spSavePolicy schreibt Typ2 (nur für Konzepte)');
ok(/if \(!all\.Typ2\)\s*delete all\.Typ2/.test(shp), 'spSavePolicy lässt Typ2 bei Regelwerken weg');
ok(/KonzeptJson:\s*p\.konzept/.test(shp), 'spSavePolicy schreibt KonzeptJson');
ok(shp.includes("{ name: 'Typ2',") && shp.includes("{ name: 'KonzeptJson',"), 'POLICY_COLUMNS enthält Typ2 + KonzeptJson');
const appjs = fs.readFileSync(ROOT + '/js/app.js','utf8');
ok(appjs.includes("p.typ !== 'Konzept'") && appjs.includes("p.typ === 'Konzept'"), 'reloadData partitioniert Regelwerke/Konzepte');
ok(appjs.includes('konzepte: []'), 'State.konzepte default vorhanden');
const idx = fs.readFileSync(ROOT + '/index.html','utf8');
ok(idx.includes('openKonzeptEditor()') && idx.includes('js/konzepte.js'), 'index.html: Button + Script eingebunden');
const adm = fs.readFileSync(ROOT + '/js/admin.js','utf8');
ok(adm.includes("_adminMode === 'konzepte'") && adm.includes('renderKonzeptCards(q') && adm.includes('_adminModeBar'), 'admin.js: Modus-Umschalter delegiert an Konzepte');

/* ── Nach dem Einreichen: sichtbar machen, dass die Mail raus ist ── */
const kq = fs.readFileSync(ROOT + '/js/konzepte.js', 'utf8');
ok(/function konzeptVersandHinweis/.test(kq), 'Es gibt einen Versand-Hinweis');
ok(/Die E-Mail ist raus/.test(kq), 'Er sagt klar, dass die Nachricht raus ist');
ok(/Konzeptprüfung angefordert/.test(kq), 'Und wofür');
ok(/getGeschaeftsleitung/.test(kq), 'Er nennt die Empfänger');
ok(/await notifyKonzeptGF\(k\);\s*\n\s*konzeptVersandHinweis\(k\);/.test(kq),
  'Er kommt erst nach dem tatsächlichen Versand');

/* ── Annahme: Entwurf speichern, Ersteller informieren, Weg wählen ── */
ok(/function konzeptWeiche/.test(kq), 'Nach der Annahme kommt eine Bestätigung');
ok(/Der Regelwerk-Entwurf ist angelegt/.test(kq), 'Sie sagt, dass der Entwurf gespeichert ist');
ok(/Alles klar/.test(kq), 'Für die Geschäftsleitung reicht ein Schließen-Knopf');
ok(!/Direkt zur Konformitätsprüfung →<\/button>/.test(kq.slice(kq.indexOf('function konzeptWeiche'), kq.indexOf('function konzeptWeiche') + 2200)),
  'Der Dialog der Geschäftsleitung enthält keine Weiche mehr');
ok(/entscheidet, ob der Entwurf noch ausgearbeitet/.test(kq),
  'Sonst steht dort, dass die einreichende Person entscheidet');
ok(/Entwurf bearbeiten/.test(kq) && /Direkt zur Konformitätsprüfung/.test(kq),
  'Beide Wege sind benannt');
ok(/Wie soll es weitergehen\?/.test(kq), 'Die Info-Mail stellt die Frage');
ok(/ansicht=entwurf&aktion=pruefung/.test(kq),
  'Und bietet den direkten Weg als Schaltfläche an');
// Nicht mehr an das Anführungszeichen des href gebunden: Der Knopf kommt
// seit der Zusammenlegung aus mailBtn(), das Ziel steht in einem Template.
ok(/ansicht=entwurf[`"]/.test(kq), 'Ebenso das Bearbeiten');
ok(/async function konzeptDirektZurPruefung/.test(kq), 'Der direkte Weg ist umgesetzt');
ok(/setStatus\(rwId, 'Konformitätsprüfung'/.test(kq), 'Er setzt den Status');
ok(/notifyPruefer/.test(kq), 'Und benachrichtigt die Prüfer');
ok(/mitbestimmungPflicht/.test(kq) && /notifyMitbestimmung/.test(kq),
  'Bei betroffener Mitbestimmung auch den Betriebsrat');

ok(/async function notifyKonzeptErsteller/.test(kq), 'Die einreichende Person wird informiert');
for (const fall of ['angenommen', 'zurueckgestellt', 'abgelehnt'])
  ok(new RegExp("notifyKonzeptErsteller\\(k, '" + fall + "'\\)").test(kq),
    `Auch bei „${fall}"`);
ok(/antragstellerUpn/.test(kq), 'Empfänger ist die einreichende Person');
ok(!/sich selbst nicht anschreiben/.test(kq),
  'Die Info-Mail geht auch dann raus, wenn dieselbe Person entschieden hat');
ok(/Begründung/.test(kq), 'Die Begründung steht in der Mail');

/* ── Die Konzept-Entscheidung gehört in die Historie des Regelwerks ── */
ok(/historieAdd\(rw, 'Konzept freigegeben'/.test(kq),
  'Die Annahme des Konzepts wird in der Historie festgehalten');
ok(/historieAdd\(rw, 'Angelegt'/.test(kq), 'Ebenso die Entstehung des Entwurfs');
ok(/angenommen von \$\{e\.vonName/.test(kq), 'Mit der entscheidenden Person');
ok(/Eingereicht von \$\{ko\.antragstellerName\}/.test(kq), 'Und der einreichenden');
ok(kq.indexOf("historieAdd(rw, 'Konzept freigegeben'") < kq.indexOf('const savedRw = await spSavePolicy(rw)'),
  'Die Einträge stehen vor dem Speichern – sonst gingen sie verloren');

/* ── Deep-Link aus der Info-Mail ── */
const appjs3 = fs.readFileSync(ROOT + '/js/app.js', 'utf8');
ok(/ansicht === 'entwurf'/.test(appjs3), 'app.js kennt den Entwurfs-Deeplink');
ok(/konzeptDirektZurPruefung\(deepId\)/.test(appjs3), 'Mit Aktion „pruefung" geht es direkt weiter');
ok(/openPolicyEditor\(deepId\)/.test(appjs3), 'Ohne Aktion öffnet sich der Editor');
ok(/canWriteTab\('verwaltung'\)/.test(appjs3), 'Ohne Schreibrecht passiert nichts');

/* ── Startansicht ── */
const appjs2 = fs.readFileSync(ROOT + '/js/app.js', 'utf8');
ok(/await switchView\('meine'\); return;/.test(appjs2), 'Start ist immer „Meine Regelwerke"');
ok(!/canReadTab\('cockpit'\) \? 'cockpit'/.test(appjs2), 'Kein Sondereinstieg mehr ins Cockpit');

/* ── Rundgang ist entfernt ── */
ok(!fs.existsSync(path.join(ROOT, 'js/tutorial.js')), 'tutorial.js ist weg');
ok(!fs.existsSync(path.join(ROOT, 'rundgang.html')), 'Die eigenständige Rundgang-Seite ist weg');
const idx2 = fs.readFileSync(ROOT + '/index.html', 'utf8');
ok(!idx2.includes('tutorial.js'), 'index.html bindet sie nicht mehr ein');
for (const datei of ['js/anleitung.js', 'js/dokumentation.js', 'js/admin.js']) {
  const t = fs.readFileSync(path.join(ROOT, datei), 'utf8');
  ok(!/Rundgang/.test(t), `Keine Rundgang-Erwähnung mehr in ${datei}`);
}

/* ── Einführungs-Schritte im Dashboard ── */
const adm2 = fs.readFileSync(ROOT + '/js/admin.js', 'utf8');
const stationen = [...adm2.matchAll(/kurz: '([^']+)', was: '([^']+)', wer: '([^']+)'/g)]
  .map(m => ({ kurz: m[1], was: m[2], wer: m[3] }));
ok(stationen.length === 7, `Sieben Stationen (${stationen.length})`);
ok(stationen.map(s => s.kurz).join(' → ') ===
  'Konzept → Konzept-Entscheidung → Entwurf → Prüfung → Mitbestimmung → Freigabe → Veröffentlicht',
  'In der richtigen Reihenfolge');
ok(stationen.map(s => s.wer).join('|') === 'Sie|GL|Sie|Prüfer|KBR / BR|GL|Zielgruppe',
  `Zuständigkeiten stimmen (${stationen.map(s => s.wer).join(' | ')})`);
ok(!stationen.some(s => s.wer === 'du'), 'Keine Du-Form bei den Zuständigkeiten');
ok(stationen[6].wer === 'Zielgruppe',
  'Veröffentlicht betrifft die ausgewählte Zielgruppe, nicht pauschal „alle"');
ok(/nur bei den ausgewählten Mitarbeitenden/.test(adm2), 'Das steht auch im Text');

/* Mitbestimmung ist bedingt, Reihenfolge zur Freigabe umstellbar */
ok(/kurz: 'Mitbestimmung'[\s\S]{0,120}bedingt: true/.test(adm2), 'Mitbestimmung ist als bedingt markiert');
ok(/kurz: 'Mitbestimmung'[\s\S]{0,120}tauschbar: true/.test(adm2), 'Und als tauschbar');
ok(/kurz: 'Freigabe'[\s\S]{0,120}tauschbar: true/.test(adm2), 'Die Freigabe ebenso');
ok((adm2.match(/bedingt: true/g) || []).length === 1, 'Nur diese eine Station ist bedingt');
ok(/rw-chip-bedingt/.test(adm2), 'Bedingte Stationen werden gestrichelt dargestellt');
ok(/Reihenfolge je Regelwerk umstellbar/.test(adm2), 'Der Tausch-Pfeil trägt eine Erklärung');
ok(/nur, wenn die Mitbestimmung betroffen ist/.test(adm2),
  'Der Text sagt, wovon die Station abhängt');
ok(/Konzernbetriebsrat und\/oder Betriebsräte einzelner Werke ankreuzen/.test(adm2),
  'Und wo man das festlegt');
ok(/\.rw-marke-bedingt/.test(fs.readFileSync(ROOT + '/css/style.css', 'utf8')),
  'Die Marken sind formatiert');

console.log(`\n${fail? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
