import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { _bpmnFromText, _parseSteps, RMS_PROCESS_SEEDS } = require(ROOT + '/js/prozesse.js');
let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);} };

// Erwartete Gateways je Seed (Anzahl „?"-/Entscheidungsschritte)
const expectGw = {
  'Regelwerk-Lebenszyklus (RMS)': 2,
  'Regelwerk-Konzept (RMS)': 1,
  'Kenntnisnahme & Wissenstest (RMS)': 3,
  'Änderungsvorschlag ISMS-Dokument (RMS)': 1,
  'Risiko-Management (RMS)': 1,
  'Kurs / Schulung (RMS)': 1,
  'KI-System beantragen (RMS)': 1,
  'Dokument-Health-Check (RMS)': 1,
  'ISMS-Abdeckung & SoA (RMS)': 1,
  'Fälligkeit / Wiedervorlage (RMS)': 2,
  'Governance-Übernahme (RMS)': 1,
  'Audit-Report / C-Level (RMS)': 1,
  'Regelwerk – Allgemein (RMS)': 1,
  'Regelwerk außer Kraft setzen / Archivierung (RMS)': 1,
};

ok(Array.isArray(RMS_PROCESS_SEEDS) && RMS_PROCESS_SEEDS.length === 14, '14 Standard-Prozesse definiert');
ok(RMS_PROCESS_SEEDS.every(s => /\(RMS\)$/.test(s.name)), 'Alle Namen mit „(RMS)“ gekennzeichnet');
ok(new Set(RMS_PROCESS_SEEDS.map(s=>s.name)).size === RMS_PROCESS_SEEDS.length, 'Alle Prozessnamen eindeutig');

const count = (str, sub) => str.split(sub).length - 1;
for (const s of RMS_PROCESS_SEEDS) {
  const { xml } = _bpmnFromText(s.steps, s.name, []);
  const tag = `[${s.name}]`;
  ok(xml.startsWith('<?xml') && xml.trim().endsWith('</bpmn:definitions>'), `${tag} XML-Rahmen ok`);
  ok(xml.includes('<bpmn:startEvent') && xml.includes('<bpmn:endEvent'), `${tag} Start/Ende vorhanden`);
  ok(xml.includes('<bpmn:incoming>') && xml.includes('<bpmn:outgoing>'), `${tag} incoming/outgoing gesetzt`);
  ok(xml.includes('<bpmndi:BPMNPlane') && xml.includes('<dc:Bounds'), `${tag} DI-Layout vorhanden`);
  ok(!/NaN|undefined/.test(xml), `${tag} keine NaN/undefined im XML`);
  const gw = count(xml, '<bpmn:exclusiveGateway');
  ok(gw === expectGw[s.name], `${tag} Gateways = ${expectGw[s.name]} (ist ${gw})`);
  // jede Entscheidung erzeugt ja-/nein-Zweig
  if (expectGw[s.name] > 0) ok(xml.includes('name="nein"') && xml.includes('name="ja"'), `${tag} ja/nein-Zweige vorhanden`);
}

// Rollen-Präfix wird erkannt (Mitarbeiter:/ISMS-Team:)
const stKn = _parseSteps(RMS_PROCESS_SEEDS[2].steps);
ok(stKn.some(x => x.role === 'Mitarbeiter'), 'Rollen-Präfix „Mitarbeiter“ erkannt');

// Statische Wiring-Checks
const pjs = fs.readFileSync(ROOT + '/js/prozesse.js','utf8');
ok(/onclick="seedStandardProcesses\(\)"/.test(pjs), 'Toolbar-Button ruft seedStandardProcesses');
ok(/existing\.has\(norm\(s\.name\)\)/.test(pjs), 'Idempotent: überspringt vorhandene Prozesse');
ok(/await spSaveProcess\(s\.name, xml\)/.test(pjs), 'Speichert je Seed via spSaveProcess');

console.log(`\n${fail?'✗':'✓'} ${pass} grün, ${fail} rot`); process.exit(fail?1:0);
