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

console.log(`\n${fail? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
