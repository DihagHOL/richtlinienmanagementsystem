/**
 * Dokumente am Prozess („Anlagen").
 *
 * Ein Modell zeigt den Ablauf, aber nicht das Beiwerk: Merkblatt, Formular,
 * Kundeninformation. Diese Verweise stehen – wie die Richtlinien – im BPMN
 * selbst. Drei Dinge hängen daran:
 *
 *   • Der Marker muss einen Rundlauf überstehen. bpmn-js schreibt die
 *     Dokumentation XML-escaped; wer beim Zurücklesen nicht entschärft, macht
 *     aus „a&b.pdf" ein „a&amp;b.pdf" und aus jedem zweiten Link einen toten.
 *   • Anlagen dürfen die Prozessliste nicht verschmutzen. Sie liegen im
 *     Unterordner „Anlagen"; der ist kein Werk und wird beim Auflisten
 *     übersprungen.
 *   • Und sie dürfen nicht verschwinden: Der Netz-Reiter schreibt dieselbe
 *     Dokumentation neu, wenn man ein Regelwerk zuordnet. Ohne Vorkehrung
 *     löschte dieser Klick jedes hinterlegte Dokument mit.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const { _parseProcessDocs, _procDokuText, _procDocMarker, _docFeld, _xmlUnesc,
        _bpmnFromText, _parseSteps } = require(ROOT + '/js/prozesse.js');

/* ══════════════════════════════════════════════════════════════════
   Teil 1 – der Marker
   ══════════════════════════════════════════════════════════════════ */

ok(_docFeld('a|b') === 'a b', 'Der Trenner „|" darf nicht im Feld stehen');
ok(_docFeld('a[b]c') === 'a b c', 'Eckige Klammern ebenfalls nicht – sie beenden den Marker');
ok(_docFeld('a\nb') === 'a b', 'Zeilenumbrüche werden zu Leerzeichen (eine Zeile je Anlage)');
ok(_docFeld(null) === '' && _docFeld(undefined) === '', 'Nichts bleibt nichts');

ok(_xmlUnesc('a&amp;b') === 'a&b', 'Aus &amp; wird wieder ein kaufmännisches Und');
ok(_xmlUnesc('&lt;x&gt; &quot;y&quot;') === '<x> "y"', 'Spitze Klammern und Anführungszeichen ebenso');
ok(_xmlUnesc('&amp;lt;') === '&lt;',
  'Reihenfolge stimmt: aus &amp;lt; wird &lt; als Text – keine spitze Klammer');

const einDoc = { name: 'Partnerinfo.pdf', url: 'https://x.test/a?b=1&c=2', driveId: 'd1', itemId: 'i1' };
ok(_procDocMarker(einDoc) === '[[rms:doc=Partnerinfo.pdf|https://x.test/a?b=1&c=2|d1|i1]]',
  'Marker: Name, Adresse, Bibliothek, Kennung – mit „|" getrennt');

const rund = _parseProcessDocs('irgendwas ' + _procDocMarker(einDoc) + ' und mehr');
ok(rund.length === 1 && rund[0].name === einDoc.name && rund[0].itemId === 'i1',
  'Marker wird aus einem beliebigen Text wieder herausgelesen');

const zwei = _parseProcessDocs(_procDocMarker(einDoc) + '\n' + _procDocMarker({ name: 'B.docx', url: '', driveId: '', itemId: 'i2' }));
ok(zwei.length === 2 && zwei[1].name === 'B.docx' && zwei[1].url === '',
  'Mehrere Anlagen: je eine Zeile, auch ohne Adresse');

ok(_parseProcessDocs('[[rms:doc=' + _docFeld('a&amp;b.pdf'.replace('&amp;', '&')) + '||]]').length === 1,
  'Auch eine Anlage ohne Kennung (reiner Link) zählt');
ok(_parseProcessDocs('kein Marker weit und breit').length === 0, 'Ohne Marker keine Anlagen');
ok(_parseProcessDocs(null).length === 0 && _parseProcessDocs('').length === 0, 'Nichts stürzt nicht ab');

// Zweimal hintereinander aufgerufen – das globale /g darf nicht hängen bleiben
const t = _procDocMarker(einDoc);
ok(_parseProcessDocs(t).length === 1 && _parseProcessDocs(t).length === 1,
  'Zweiter Aufruf findet dasselbe – der Suchzeiger wird nicht mitgeschleppt');

/* ══════════════════════════════════════════════════════════════════
   Teil 2 – die Dokumentation im Modell
   ══════════════════════════════════════════════════════════════════ */

const txtBeides = _procDokuText(['7'], [einDoc]);
ok(/\[\[rms:policies=7\]\]/.test(txtBeides), 'Richtlinien-Marker bleibt, wie er war');
ok(/\[\[rms:doc=Partnerinfo\.pdf\|/.test(txtBeides), 'Anlagen-Marker steht daneben');
ok(/Hinterlegte Dokumente: Partnerinfo\.pdf/.test(txtBeides),
  'Darüber der Klartext – auch ein fremder Modeler zeigt so, was dranhängt');
ok(_procDokuText([], []) === '', 'Ohne beides bleibt die Dokumentation leer');
ok(!/rms:doc/.test(_procDokuText(['7'], [])), 'Nur Richtlinien: kein leerer Anlagen-Marker');
ok(!/rms:policies/.test(_procDokuText([], [einDoc])), 'Nur Anlagen: kein leerer Richtlinien-Marker');

/* ══════════════════════════════════════════════════════════════════
   Teil 3 – Generator: Anlagen und ein eigener Nein-Zweig
   ══════════════════════════════════════════════════════════════════ */

const g = _bpmnFromText('1. Etwas tun\n2. Passt es? | nein: Nur intern vermerken', 'Test', [], [einDoc]);
ok(/\[\[rms:doc=Partnerinfo\.pdf\|/.test(g.xml), 'Ein erzeugter Prozess kann Anlagen mitbringen');
ok(g.docs.length === 1, 'Die Anlagen kommen mit dem Ergebnis zurück');
ok(/name="Nur intern vermerken"/.test(g.xml), 'Der Nein-Zweig trägt den angegebenen Namen');
ok(/<bpmn:endEvent id="RejEnd1" name="Beendet"/.test(g.xml),
  'Und endet in „Beendet" statt in „Nachbessern" – nicht jede Nein-Antwort ist ein Fehler');
ok(!/\| nein:/.test(g.xml), 'Die Angabe selbst steht nicht mehr im Kasten');

const gOhne = _bpmnFromText('1. Passt es?', 'Test', []);
ok(/name="Abweichung behandeln"/.test(gOhne.xml) && /name="Nachbessern"/.test(gOhne.xml),
  'Ohne Angabe bleibt es beim bisherigen Nein-Zweig');
ok(!/rms:doc/.test(gOhne.xml), 'Ohne Anlagen kein Marker');

const st = _parseSteps('1. Passt es? | nein: Nur intern vermerken');
ok(st.length === 1 && st[0].kind === 'decision' && st[0].label === 'Passt es?' && st[0].nein === 'Nur intern vermerken',
  'Der Schritt selbst kennt Frage und Nein-Zweig getrennt');

/* ══════════════════════════════════════════════════════════════════
   Teil 4 – Ablage: „Prozesse/<Werk>/Anlagen"
   ══════════════════════════════════════════════════════════════════ */

const rufe = [];
let getAntwort = () => ({ value: [] });
const sctx = {
  console, JSON, Date, Array, Object, String, Math, Set, Promise, encodeURIComponent,
  TextEncoder: class { encode(s) { return s; } },
  fetch: () => {}, location: { origin: '', pathname: '' },
  acquireToken: async () => 'tok',
};
sctx.window = sctx; sctx.globalThis = sctx;
vm.createContext(sctx);
vm.runInContext(lies('js/sharepoint.js'), sctx);
sctx.__get = async (url) => { rufe.push({ url, method: 'GET' }); return getAntwort(url); };
sctx.__ruf = async (url, opt) => {
  rufe.push({ url, method: (opt || {}).method || 'GET', body: (opt || {}).body || '' });
  return { ok: true, status: 200, json: async () => ({ id: 'neu', name: 'Partnerinfo.pdf', webUrl: 'https://sp/x' }), text: async () => '' };
};
vm.runInContext(`
  _ismsLib = async () => {};
  _sp.ismsDriveId = 'drv';
  _get = (url) => __get(url);
  _fetchRetry = (url, opt) => __ruf(url, opt);
`, sctx);
const s = (code) => vm.runInContext(code, sctx);

const erg = await s("spUploadProcessDoc('HOL', 'Partnerinfo.pdf', 'xx', 'application/pdf')");
const put = rufe.find(r => r.method === 'PUT');
ok(!!put && /Prozesse\/HOL\/Anlagen\/Partnerinfo\.pdf:\/content$/.test(put.url),
  'Die Datei landet in „Prozesse/HOL/Anlagen" – neben dem Modell, nicht darin');
const ordner = rufe.filter(r => r.method === 'POST' && /Anlagen/.test(r.body || ''));
ok(ordner.length === 1 && /"@microsoft.graph.conflictBehavior":"fail"/.test(ordner[0].body),
  'Der Anlagen-Ordner wird angelegt; „fail" heißt: 409 ist der Normalfall');
ok(erg.itemId === 'neu' && erg.driveId === 'drv' && erg.url === 'https://sp/x',
  'Zurück kommt die Kennung – verschoben wird die Datei später vielleicht, umbenannt auch');

rufe.length = 0;
await s("spUploadProcessDoc('', 'Merkblatt.pdf', 'xx', 'application/pdf')");
const put2 = rufe.find(r => r.method === 'PUT');
ok(!!put2 && /Prozesse\/Anlagen\/Merkblatt\.pdf:\/content$/.test(put2.url),
  'Ohne Werk: direkt unter „Prozesse/Anlagen"');

rufe.length = 0;
getAntwort = (url) => /root:\/Prozesse:/.test(url)
  ? { value: [{ id: 'f1', name: 'HOL', folder: {} }, { id: 'f2', name: 'Anlagen', folder: {} },
              { id: 'x', name: 'Direkt.bpmn' }] }
  : { value: [] };
const liste = await s('spListProcesses()');
ok(!rufe.some(r => r.url.includes('/items/f2/children')),
  'Der Anlagen-Ordner wird beim Auflisten übersprungen – er ist kein Werk');
ok(rufe.some(r => r.url.includes('/items/f1/children')), 'Der Werk-Ordner dagegen schon');
ok(liste.length === 1 && liste[0].title === 'Direkt', 'Nur .bpmn-Dateien werden zu Prozessen');

/* ══════════════════════════════════════════════════════════════════
   Teil 5 – Anlagen überleben das Zuordnen im Netz-Reiter
   ══════════════════════════════════════════════════════════════════ */

const vctx = {
  console, JSON, Date, Array, Object, String, Math, Number, Map, Set, Promise,
  esc: (x) => String(x ?? ''), toast: () => {}, fmtDate: () => '', canWriteTab: () => true,
  STANDORTE: ['HOL', 'SHB'],
  State: { user: { name: 'T' }, policies: [{ id: '2', title: 'Kartellrecht' }] },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  openModal: () => {}, closeModal: () => {}, geltungsbereichLabel: () => '',
  prozessModusLeiste: () => '', openProcessEditor: () => {}, focusPolicyCard: () => {},
  setProzessModus: () => {}, localStorage: { getItem: () => null, setItem: () => {} },
};
vctx.window = vctx; vctx.globalThis = vctx;
vm.createContext(vctx);
vm.runInContext(lies('js/landkarte.js'), vctx);
vm.runInContext(lies('js/prozesse.js'), vctx);
vm.runInContext(lies('js/verknuepfungen.js'), vctx);

const mitAnlage = `<?xml version="1.0"?><bpmn:definitions><bpmn:process id="P">
    <bpmn:documentation>Hinterlegte Dokumente: Partnerinfo.pdf
[[rms:doc=Partnerinfo.pdf|https://sp/x|d1|i1]]</bpmn:documentation>
  </bpmn:process></bpmn:definitions>`;
const neu = vm.runInContext('vkXmlMitRegelwerken(__xml, ["2"])',
  Object.assign(vctx, { __xml: mitAnlage }));
ok(/\[\[rms:policies=2\]\]/.test(neu), 'Das zugeordnete Regelwerk steht drin');
ok(/\[\[rms:doc=Partnerinfo\.pdf\|https:\/\/sp\/x\|d1\|i1\]\]/.test(neu),
  'Und die Anlage ist noch da – sie teilt sich die Dokumentation mit den Regelwerken');
const leer = vm.runInContext('vkXmlMitRegelwerken(__xml, [])', Object.assign(vctx, { __xml: mitAnlage }));
ok(/rms:doc=Partnerinfo/.test(leer) && !/rms:policies/.test(leer),
  'Auch beim Lösen des letzten Regelwerks bleibt die Anlage stehen');

/* ══════════════════════════════════════════════════════════════════
   Teil 6 – Verdrahtung im Editor
   ══════════════════════════════════════════════════════════════════ */

const pjs = lies('js/prozesse.js');
ok(/id="proc-doc-list"/.test(pjs), 'Der Editor hat ein Feld für hinterlegte Dokumente');
ok(/onchange="prozessDokHochladen\(this\)"/.test(pjs), 'Datei-Knopf hängt am Hochladen');
ok(/onclick="prozessDokLink\(\)"/.test(pjs), 'Link-Knopf für bereits abgelegte Dokumente');
ok(/4 \* 1024 \* 1024/.test(pjs), 'Über 4 MB wird auf den Link-Weg verwiesen statt blind hochzuladen');
ok(/_setProcessDoku\(_selectedPolicyIds\(\), _procDocs\)/.test(pjs),
  'Gespeichert wird beides zusammen – Richtlinien und Anlagen');
ok((pjs.match(/_setProcessDoku\(_selectedPolicyIds\(\), _procDocs\)/g) || []).length === 2,
  'Auch der .bpmn-Download nimmt die Anlagen mit');
ok(/_procDocs = _parseProcessDocs\(xml\)/.test(pjs), 'Beim Öffnen werden sie aus dem Modell gelesen');
ok(/if \(_procEditing && _procEditing\.itemId\) await saveProcess\(\)/.test(pjs),
  'Bei einem gespeicherten Modell wird die Verknüpfung sofort mitgeschrieben – sonst läge die Datei verwaist da');
ok(/Die Datei selbst bleibt in der Bibliothek/.test(pjs),
  'Entfernen löst nur die Verknüpfung – Löschen wäre eine andere Entscheidung');
ok(/📎 \$\{docs\}/.test(pjs), 'Die Karte in der Liste zeigt, wie viele Anlagen dranhängen');
ok(/Array\.isArray\(e\) \? e : e\.p/.test(pjs),
  'Alte Cache-Einträge (reine Id-Liste) fallen nicht durch');
ok(!/_setProcessPolicies/.test(pjs), 'Die alte Einzweck-Funktion ist restlos ersetzt');

const sjs = lies('js/sharepoint.js');
ok(/const PROC_DOC_FOLDER = 'Anlagen'/.test(sjs), 'Der Ordnername steht an einer Stelle');
ok(/f\.folder && f\.name !== PROC_DOC_FOLDER/.test(sjs), 'Und wird beim Auflisten ausgenommen');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
