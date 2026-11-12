/**
 * Verantwortungskette: Holding, Werk und Rollen je Prozess.
 *
 * Worauf es ankommt:
 *   • Rollen kommen aus den Bahnen der Modelle, und nur aus Bahnen, in denen
 *     Menschen arbeiten. Technik (Power Automate, SharePoint) braucht keinen Namen.
 *   • „niemand benannt", „ohne Vertretung" und „gibt es hier nicht" sind drei
 *     verschiedene Aussagen.
 *   • Die Namen der operativen Ebene sieht nur das eigene Werk und die Holding.
 *   • Bestätigungen tragen eine eigene Kennung und verfälschen die Kenntnisnahme nicht.
 *   • Das Startpaket legt E-Rechnung und Bedarfsmeldung an, ohne Vorhandenes zu überschreiben.
 *   • Im Code stehen keine Namen: Die Kette liegt in prozesslandkarte.json.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { jsArg } = require('../js/util.js');
const M = require('../js/verantwortungmodell.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Rollen aus den Bahnen ── */
const xml = `<?xml version="1.0"?><bpmn:definitions><bpmn:process id="P">
  <bpmn:laneSet id="S">
    <bpmn:lane id="L1" name="Werks-Postfach &amp; Power Automate"><bpmn:flowNodeRef>T1</bpmn:flowNodeRef></bpmn:lane>
    <bpmn:lane id="L2" name="Kreditorenbuchhaltung"><bpmn:flowNodeRef>T2</bpmn:flowNodeRef><bpmn:flowNodeRef>G1</bpmn:flowNodeRef></bpmn:lane>
    <bpmn:lane id="L3" name="SharePoint &#38; Monitoring"><bpmn:flowNodeRef>T3</bpmn:flowNodeRef></bpmn:lane>
    <bpmn:lane id="L4" name="Genehmiger"><bpmn:flowNodeRef>T4</bpmn:flowNodeRef></bpmn:lane>
    <bpmn:lane id="L5" name="Controlling"/>
    <bpmn:lane id="L6" name="Bedarfsanfrage-App"/>
  </bpmn:laneSet>
  <bpmn:serviceTask id="T1" name="Mail lesen"/>
  <bpmn:userTask id="T2" name="Prüfen"/>
  <bpmn:exclusiveGateway id="G1"/>
  <bpmn:scriptTask id="T3" name="Ablegen"/>
  <bpmn:task id="T4" name="Freigeben"/>
</bpmn:process></bpmn:definitions>`;
const bahnen = M.vwBahnenAusXml(xml);
ok(bahnen.length === 6, 'sechs Bahnen gelesen');
ok(bahnen[0].name === 'Werks-Postfach & Power Automate' && bahnen[2].name === 'SharePoint & Monitoring', 'Entitäten aufgelöst (&amp; und &#38;)');
ok(bahnen.find(b => b.name === 'Kreditorenbuchhaltung').mensch, 'Bahn mit Benutzeraufgabe ist eine Rolle');
ok(!bahnen.find(b => b.name.startsWith('Werks-Postfach')).mensch, 'Bahn nur mit Serviceaufgabe ist Technik');
ok(!bahnen.find(b => b.name.startsWith('SharePoint')).mensch, 'Bahn nur mit Skriptaufgabe ist Technik');
ok(bahnen.find(b => b.name === 'Genehmiger').mensch, 'eine schlichte Aufgabe zählt als Mensch');
ok(bahnen.find(b => b.name === 'Controlling').mensch && !bahnen.find(b => b.name === 'Bedarfsanfrage-App').mensch,
  'ohne Aufgaben entscheidet der Name: Controlling ja, die App nein');
const rollen = M.vwRollenAusBahnen([bahnen, [{ name: 'kreditorenbuchhaltung', mensch: true }, { name: 'Einkauf', mensch: true }]]);
ok(JSON.stringify(rollen) === JSON.stringify(['Kreditorenbuchhaltung', 'Genehmiger', 'Controlling', 'Einkauf']),
  'Rollen aus mehreren Modellen ohne Doppel, in der Reihenfolge des ersten Auftretens');

/* ── 2) Zellen und Kette ── */
ok(M.vwZellStatus([], '') === 'leer', 'niemand benannt → leer');
ok(M.vwZellStatus(['a@x.de'], '') === 'ohneVertretung', 'eine Person ohne Vertretung → gelb');
ok(M.vwZellStatus(['a@x.de'], 'b@x.de') === 'ok', 'mit Vertretung → grün');
ok(M.vwZellStatus('a@x.de, b@x.de', '') === 'ok', 'zwei Personen vertreten sich → grün');
ok(JSON.stringify(M.vwListe('a@x.de; b@x.de  A@x.de')) === JSON.stringify(['a@x.de', 'b@x.de']), 'Personenliste ohne Doppel, Groß/klein egal');

const daten = () => ({
  karten: {
    KONZERN: { baender: [{ key: 's2p', titel: 'S2P' }, { key: 'l2c', titel: 'L2C' }], kacheln: [
      { id: 'sap-s2p-rechnung', band: 's2p', name: 'Rechnungsprüfung', nr: 12, prozesseigner: 'eigner@dihag.com',
        standardisierung: 'rahmen',
        kette: { ziel: 'Kosten senken', werke: ['WGC', 'SHB', 'ZAI'], rollen: ['Kreditorenbuchhaltung', 'Genehmiger'], extra: [],
          werk: {
            WGC: { verantwortlich: 'max.muster@dihag.com', vertretung: 'pruefer@dihag.com',
              rollen: { Kreditorenbuchhaltung: { personen: ['kb1@dihag.com', 'kb2@dihag.com'], vertretung: '' },
                Genehmiger: { personen: ['gen@dihag.com'], vertretung: '' } } },
            SHB: { verantwortlich: '', vertretung: '', rollen: {}, ohne: ['Genehmiger'] },
          } } },
      { id: 'sap-l2c-faktura', band: 'l2c', name: 'Faktura', nr: 7 },
    ] },
    ZAI: { kacheln: [{ id: 'z1', name: 'Rechnungsprüfung', verantwortlich: 'zai.chef@dihag.com' }] },
  },
});
const d1 = daten();
ok(M.vwKetten(d1).length === 1, 'nur Kacheln mit Kette zählen');
const mx = M.vwMatrix(d1, d1.karten.KONZERN.kacheln[0]);
ok(mx.holding.status === 'ok' && mx.holding.eigner === 'eigner@dihag.com', 'Holding mit Ziel und Eigner ist vollständig');
ok(mx.zeilen.length === 3 && mx.zeilen[0].art === 'werk', 'Zeilen: Ebene Werk, dann zwei Rollen');
ok(mx.zeilen[0].zellen.WGC.status === 'ok', 'WGC: verantwortlich mit Vertretung');
ok(mx.zeilen[0].zellen.SHB.status === 'leer', 'SHB: niemand verantwortlich');
ok(mx.zeilen[0].zellen.ZAI.geerbt && mx.zeilen[0].zellen.ZAI.personen[0] === 'zai.chef@dihag.com',
  'ZAI: ohne Eintrag gilt die gleichnamige Kachel der Werks-Landkarte');
ok(mx.zeilen[2].zellen.SHB.status === 'entfaellt', '„gibt es hier nicht" ist keine Lücke');
ok(mx.zeilen[2].zellen.WGC.status === 'ohneVertretung', 'Genehmiger in WGC ohne Vertretung');

const kz = M.vwKennzahlen(d1, { acks: [], members: [{ upn: 'max.muster@dihag.com' }], jahr: 2026 });
ok(kz.ketten === 1 && kz.holdingOk === 1, 'Kennzahlen: eine Kette, Holding vollständig');
// Stellen ohne „entfällt": Werk ×3, Kreditoren ×3, Genehmiger ×2 (SHB hat keine).
// Ohne Vertretung: Genehmiger WGC und die aus der Werks-Landkarte geerbte Person in ZAI.
ok(kz.zellen === 8 && kz.leer === 4 && kz.ohneVertretung === 2, `Stellen: 8, offen 4, ohne Vertretung 2 (${kz.zellen}/${kz.leer}/${kz.ohneVertretung})`);
ok(kz.vollBesetzt === 0, 'mit Lücken ist der Prozess nicht voll besetzt');
ok(kz.lueckenJeWerk.SHB === 2 && kz.lueckenJeWerk.ZAI === 2 && !kz.lueckenJeWerk.WGC, 'Lücken je Werk gezählt');
ok(kz.unbekannt.includes('kb1@dihag.com') && !kz.unbekannt.includes('max.muster@dihag.com'), 'Namen außerhalb des Verzeichnisses fallen auf');

/* ── 3) Bestätigung ── */
const ben = M.vwMeineRollen(d1, 'Max.Muster@dihag.com');
ok(ben.length === 1 && ben[0].werk === 'WGC' && ben[0].rolle === M.VW_WERK_ROLLE, 'eigene Benennung gefunden, Groß/klein egal');
const vertr = M.vwMeineRollen(d1, 'pruefer@dihag.com');
ok(vertr.length === 1 && vertr[0].vertretung && /\(Vertretung\)$/.test(vertr[0].rolle), 'Vertretungen werden mitgefragt');
ok(M.vwMeineRollen(d1, 'zai.chef@dihag.com').length === 0, 'aus der Werks-Landkarte geerbt: keine Benennung in der Kette');
const id = ben[0].id;
ok(id.startsWith(M.VW_PREFIX) && id.includes(':WGC:'), 'Kennung rolle:<Kachel>:<Werk>:<Rolle>');
const acks = [{ richtlinieId: id, version: '2026', benutzerUpn: 'max.muster@dihag.com' }];
ok(M.vwBestaetigt(acks, 'max.muster@dihag.com', id, 2026), 'Bestätigung für das Jahr erkannt');
ok(!M.vwBestaetigt(acks, 'max.muster@dihag.com', id, 2027), 'im neuen Jahr wieder offen');
ok(!M.vwIstRollenAck({ richtlinieId: '42' }) && M.vwIstRollenAck(acks[0]), 'Richtlinien-Bestätigungen bleiben getrennt');
const kz2 = M.vwKennzahlen(d1, { acks, jahr: 2026 });
ok(kz2.bestaetigt === 1 && kz2.benennungen === kz.benennungen, 'Bestätigte Benennungen gezählt');

/* ── 4) Sichtbarkeit ── */
ok(M.vwNamenSichtbar('WGC', ['*']), 'Konzernsicht sieht alle Namen');
ok(M.vwNamenSichtbar('WGC', ['WGC', 'SHB']) && !M.vwNamenSichtbar('ZAI', ['WGC', 'SHB']), 'Werk sieht nur die eigenen Namen');

/* ── 5) Startpaket ── */
const modelle = [
  { itemId: 'm1', title: 'E-Rechnung Rechnungseingang' }, { itemId: 'm2', title: 'E-Rechnung Eingangsprüfung' },
  { itemId: 'm3', title: 'E-Rechnung Rechnungseingang (IST)' }, { itemId: 'm4', title: 'E-Rechnung Rechnungsausgang' },
  { itemId: 'm5', title: 'Bedarfsanfrage' }, { itemId: 'm6', title: 'Bedarfsanfrage-Freigabelauf' },
  { itemId: 'm7', title: 'automatischer BANF Prozess (old)' },
];
const d2 = daten();
ok(M.vwStartpaketOffen(d2), 'Startpaket noch offen');
const erg = M.vwStartpaketAnwenden(d2, modelle);
const kon = d2.karten.KONZERN.kacheln;
const ein = kon.find(k => k.id === 'sap-s2p-rechnung');
ok(ein.prozesse.map(p => p.id).join() === 'm1,m2', 'Eingang: zwei SOLL-Modelle verknüpft, IST bleibt außen vor');
ok(ein.kette.werk.WGC.verantwortlich === 'max.muster@dihag.com' && ein.kette.ziel === 'Kosten senken', 'Vorhandene Namen und Ziel bleiben');
ok(ein.kette.werke.includes('EWA') && ein.kette.werke.includes('WGC'), 'Werke ergänzt, vorhandene behalten');
const aus = kon.find(k => k.id === 'sap-l2c-faktura');
ok(aus.prozesse.length === 1 && aus.kette && aus.kette.werke.includes('EIS'), 'Ausgang an der vorhandenen Kachel Faktura');
const bedarf = kon.find(k => vwName(k) === 'bedarfsanforderung');
function vwName(k) { return M.vwSchluessel(k.name); }
ok(bedarf && bedarf.band === 's2p' && bedarf.prozesse.map(p => p.id).join() === 'm5,m6' && bedarf.kette.werke.join() === 'SHB',
  'Bedarfsmeldung: fehlende Kachel im Band s2p angelegt, Modelle ohne das alte, Werk SHB');
ok(erg.length === 3 && erg[2].neu, 'drei Ketten gemeldet, die Bedarfsmeldung als neu');
ok(!M.vwStartpaketOffen(d2), 'danach ist nichts mehr offen');
M.vwStartpaketAnwenden(d2, modelle);
ok(ein.prozesse.length === 2 && kon.filter(k => vwName(k) === 'bedarfsanforderung').length === 1, 'ein zweiter Lauf verdoppelt nichts');

/* ── 6) Ansicht ── */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mount = { innerHTML: '' };
const felder = {};
const gespeichert = [];
let meine = ['*'];
let darf = true;
const ctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Map, Promise, encodeURIComponent, setTimeout,
  esc, jsArg, toast: () => {}, STANDORTE: ['HOL', 'SHB', 'WGC', 'ZAI', 'EWA'],
  State: { user: { upn: 'max.muster@dihag.com', name: 'Max Muster' }, acks: [] },
  AdminState: { allAcks: [] },
  document: {
    getElementById: (x) => x === 'prozesse-mount' ? mount : (x === 'vw-ansicht' ? {} : (felder[x] || null)),
    querySelectorAll: () => [],
  },
  prozessModusLeiste: (a) => `<div class="modus">${a}</div>`,
  lkDarfSchreiben: () => darf, meineWerke: () => meine, lkPersonName: (u) => u,
  lkProzesseVon: () => [], lkNrText: (k) => 'P-' + String(k.nr).padStart(3, '0'),
  pzStandardInfo: (k) => ({ rahmen: { label: 'einheitlicher Rahmen' } }[k] || null), pzKpiNormal: () => [],
  openModal: () => {}, closeModal: () => {},
  lkSpeichern: async (msg, was) => { gespeichert.push(was); return true; },
};
vm.createContext(ctx);
vm.runInContext(lies('js/verantwortungmodell.js'), ctx);
vm.runInContext(lies('js/verantwortung.js'), ctx);
ctx._lkDaten = daten();
vm.runInContext('var _lkDaten = this._lkDaten;', ctx);

vm.runInContext('renderVerantwortung()', ctx);
let h = mount.innerHTML;
ok(h.includes('Strategisch · Holding') && h.includes('Administrativ · Werk') && h.includes('Operativ · Rollen aus dem Ablauf'),
  'drei Ebenen sichtbar');
ok(h.includes('Kosten senken') && h.includes('eigner@dihag.com') && h.includes('einheitlicher Rahmen'), 'Holding mit Ziel, Eigner, Standard');
ok(h.includes('kb1@dihag.com') && h.includes('gen@dihag.com'), 'mit Konzernsicht stehen die Namen der Rollen da');
ok(h.includes('>offen<') && h.includes('entfällt') && h.includes('ohne Vertretung'), 'Lücke, entfällt und ohne Vertretung unterscheidbar');
ok(h.includes('Meine Rollen bestätigen'), 'eigene offene Benennung wird angeboten');
ok(h.includes('E-Rechnung und Bedarfsmeldung anlegen'), 'Startpaket wird angeboten, solange etwas fehlt');

meine = ['SHB'];
vm.runInContext('renderVerantwortung()', ctx);
h = mount.innerHTML;
ok(!h.includes('kb1@dihag.com') && h.includes('2 benannt'), 'fremdes Werk: Anzahl statt Namen bei den Rollen');
ok(h.includes('max.muster@dihag.com'), 'die Ebene Werk bleibt für alle sichtbar');

darf = false;
vm.runInContext('renderVerantwortung()', ctx);
h = mount.innerHTML;
ok(!h.includes('vwZelleDialog') && !h.includes('E-Rechnung und Bedarfsmeldung anlegen'), 'ohne Schreibrecht nichts zum Bearbeiten');

darf = true; meine = ['*'];
felder['vw-personen'] = { value: 'neu1@dihag.com, neu2@dihag.com' };
felder['vw-vertretung'] = { value: '' };
felder['vw-ohne'] = { checked: false };
await vm.runInContext(`vwZelleSpeichern('sap-s2p-rechnung', 'SHB', 'Kreditorenbuchhaltung')`, ctx);
const shb = ctx._lkDaten.karten.KONZERN.kacheln[0].kette.werk.SHB;
ok(JSON.stringify(shb.rollen.Kreditorenbuchhaltung.personen) === JSON.stringify(['neu1@dihag.com', 'neu2@dihag.com']), 'Rolle im Werk gespeichert');
ok(gespeichert.at(-1).includes('SHB') && gespeichert.at(-1).includes('Kreditorenbuchhaltung'), 'Verlaufseintrag nennt Werk und Rolle');

felder['vw-personen'] = { value: 'werk@dihag.com' };
felder['vw-vertretung'] = { value: 'werk2@dihag.com' };
await vm.runInContext(`vwZelleSpeichern('sap-s2p-rechnung', 'SHB', '')`, ctx);
ok(shb.verantwortlich === 'werk@dihag.com' && shb.vertretung === 'werk2@dihag.com', 'Ebene Werk gespeichert');

felder['vw-ziel'] = { value: 'Durchlaufzeit halbieren' };
felder['vw-eigner'] = { value: 'neuer.eigner@dihag.com' };
felder['vw-standard'] = { value: 'einheitlich' };
await vm.runInContext(`vwHoldingSpeichern('sap-s2p-rechnung')`, ctx);
const kk = ctx._lkDaten.karten.KONZERN.kacheln[0];
ok(kk.kette.ziel === 'Durchlaufzeit halbieren' && kk.prozesseigner === 'neuer.eigner@dihag.com' && kk.standardisierung === 'einheitlich',
  'Holding gespeichert');
ok(/Prozesseigner: eigner@dihag\.com → neuer\.eigner@dihag\.com/.test(gespeichert.at(-1)), 'Wechsel des Eigners steht im Verlauf');

/* ── 7) Einbindung ── */
const modul = lies('js/module.js');
ok(/'verantwortungmodell', 'clevelreport'/.test(modul), 'Modell im Verwaltungsblock vor dem C-Level-Bericht');
ok(/'prozessmatrix', 'verantwortung'/.test(modul), 'Ansicht lädt mit dem Reiter Prozesse');
const proz = lies('js/prozesse.js');
ok(proz.includes(`knopf('kette'`) && proz.includes(`'kette' && typeof initVerantwortung`), 'Modus „Verantwortung" im Reiter Prozesse');
ok(lies('js/landkarte.js').includes(`modus === 'kette' && typeof renderVerantwortung`), 'nach dem Speichern bleibt die Ansicht stehen');
ok(lies('js/app.js').includes(`params.get('kette')`) , 'Link ?kette= führt in die Kette');
const cl = lies('js/clevelreport.js');
ok(cl.includes('vwKennzahlen(') && cl.includes(`'ISO 5.3'`), 'C-Level-Bericht rechnet die Besetzung mit und bewertet Kap. 5.3');

/* ── 8) Keine Namen im Code ── */
const code = lies('js/verantwortungmodell.js') + lies('js/verantwortung.js');
ok(!/[a-z0-9._-]+@(dihag|[a-z-]+guss|eurometall)\.[a-z]+/i.test(code.replace(/name@dihag\.com|name2@dihag\.com/g, '')),
  'keine echten Adressen im Code, nur Platzhalter');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
