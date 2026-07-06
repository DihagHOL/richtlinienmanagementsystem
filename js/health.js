'use strict';

/**
 * Dokument-Health-Check (ohne KI)
 * ================================
 * Prüft die an Richtlinien angehängten Word-Dokumente direkt im Browser –
 * rein deterministische Code-Checks, keine externen Dienste:
 *   1. Inhalts-Dubletten:  SHA-256 über word/document.xml (nicht über die Datei –
 *      zwei Dateien können byteweise verschieden, aber inhaltlich identisch sein)
 *   2. Titel-Abgleich:     Titel der Richtlinie vs. Kopfbereich des Dokuments
 *   3. Platzhalter:        XX.XX.XXXX, "tbd", ausgefüllte Unterschriftslinien
 *   4. Bekannte Tippfehler ("Komformitätsprüfung") und leere Pflichtkapitel
 *
 * Nutzt ausschließlich die vorhandenen delegierten Graph-Berechtigungen
 * (Download über @microsoft.graph.downloadUrl wie in spGetDocAttachment).
 * docx = ZIP: minimaler ZIP-Reader + DecompressionStream('deflate-raw').
 */

const HealthState = { results: {}, running: false, ranAt: null };

/* ═══════════════════════════════════════════════════
   ZIP / docx: word/document.xml extrahieren
═══════════════════════════════════════════════════ */

/** End-of-Central-Directory-Record von hinten suchen (Signatur 0x06054b50). */
function _hcFindEocd(u8) {
  const min = Math.max(0, u8.length - 65558);   // 64 KB Kommentar + 22 Byte EOCD
  for (let i = u8.length - 22; i >= min; i--) {
    if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) return i;
  }
  return -1;
}

/** Einträge des Central Directory: [{ name, method, compSize, localOff }] */
function _hcZipEntries(u8) {
  const eocd = _hcFindEocd(u8);
  if (eocd < 0) return [];
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const count = dv.getUint16(eocd + 10, true);
  let pos = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const out = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) break;
    const nameLen = dv.getUint16(pos + 28, true);
    const extraLen = dv.getUint16(pos + 30, true);
    const commentLen = dv.getUint16(pos + 32, true);
    out.push({
      name:     dec.decode(u8.subarray(pos + 46, pos + 46 + nameLen)),
      method:   dv.getUint16(pos + 10, true),
      compSize: dv.getUint32(pos + 20, true),
      localOff: dv.getUint32(pos + 42, true),
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function _hcInflateRaw(comp) {
  try {
    const stream = new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) {
    if (typeof require === 'function') {   // Node < 21 (Tests): kein 'deflate-raw'
      try { return new Uint8Array(require('node:zlib').inflateRawSync(comp)); } catch (e2) { /* fallthrough */ }
    }
    throw e;
  }
}

/** Einen ZIP-Eintrag (z. B. 'word/document.xml') als Uint8Array extrahieren – oder null. */
async function hcExtractZipEntry(bytes, entryName) {
  const entry = _hcZipEntries(bytes).find(e => e.name === entryName);
  if (!entry) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(entry.localOff, true) !== 0x04034b50) return null;
  const nameLen = dv.getUint16(entry.localOff + 26, true);
  const extraLen = dv.getUint16(entry.localOff + 28, true);
  const start = entry.localOff + 30 + nameLen + extraLen;
  const comp = bytes.subarray(start, start + entry.compSize);
  if (entry.method === 0) return comp;                 // stored
  if (entry.method === 8) return _hcInflateRaw(comp);  // deflate
  return null;
}

async function hcSha256Hex(u8) {
  let subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  if (!subtle && typeof require === 'function') {      // Node-Fallback (Tests)
    try { subtle = require('node:crypto').webcrypto.subtle; } catch (e) { /* browser */ }
  }
  const digest = await subtle.digest('SHA-256', u8);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ═══════════════════════════════════════════════════
   Text-Extraktion & Checks
═══════════════════════════════════════════════════ */

/** WordprocessingML → Klartext (ein Absatz je Zeile). */
function hcXmlToText(xml) {
  let t = xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
       .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
       .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)));
  return t;
}

function _hcNorm(s) {
  return String(s || '').toLowerCase()
    .replace(/[äöüß]/g, c => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[c]))
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Generische Wörter, die für den Titel-Abgleich nichts aussagen. */
const _HC_STOP = new Set(['isms', 'richtlinie', 'konzept', 'dokument', 'prozess', 'und', 'fuer', 'der', 'die', 'das']);

/* Standard-Kapitelüberschriften des Richtlinien-Templates (für Leer-Kapitel-Check). */
const _HC_HEADINGS = [
  'Änderungsverfolgung', 'Zweck', 'Anwendungs-/Geltungsbereich', 'Begriffsbestimmungen',
  'Regelungstatbestände, Rollen & Aufgaben/Prozesse/Verantwortlichkeiten',
  'Außer Kraft gesetzte/ Mitgeltende Konzernregelungen', 'Anhänge',
];

/**
 * Deterministische Inhalts-Checks. findings: [{ sev: 'error'|'warn'|'info', text }]
 */
function hcAnalyzeText(text, policyTitle) {
  const findings = [];
  const lines = text.split('\n').map(l => l.trim());
  const nonEmpty = lines.filter(l => l);

  // 1) Titel-Abgleich: signifikante Wörter des Richtlinien-Titels im Kopfbereich?
  const head = _hcNorm(nonEmpty.slice(0, 12).join(' '));
  const headWords = head.split(' ');
  const tokens = _hcNorm(policyTitle).split(' ').filter(w => w.length >= 4 && !_HC_STOP.has(w));
  if (tokens.length) {
    // Treffer: enthalten ODER gemeinsamer Wortstamm (erste 6 Zeichen), fängt Flexionen wie
    // „Projektmanagement" ↔ „Projekten" ohne Verhaltenskodex ↔ Scopedokument durchzulassen
    const hit = w => head.includes(w) ||
      headWords.some(hw => hw.length >= 6 && w.length >= 6 && hw.slice(0, 6) === w.slice(0, 6));
    const found = tokens.filter(hit).length;
    if (found / tokens.length < 0.5) {
      const docTitle = nonEmpty.slice(0, 3).join(' · ').replace(/-?\d{10,}/g, '').slice(0, 90);
      findings.push({ sev: 'error', text: `Titel im Dokument passt nicht zur Richtlinie (Dokument beginnt mit: „${docTitle}…")` });
    }
  }

  // 2) Platzhalter
  const ph = (text.match(/X{2}\.X{2}(\.X{2,4})?/g) || []).length;
  if (ph) findings.push({ sev: 'warn', text: `${ph}× Datums-Platzhalter (XX.XX.…) – Freigabetabelle/Termine unausgefüllt` });
  const tbd = (text.match(/\btbd\b/gi) || []).length;
  if (tbd) findings.push({ sev: 'warn', text: `${tbd}× Platzhalter „tbd"` });

  // 3) Bekannte Tippfehler
  if (/Komformit/.test(text)) findings.push({ sev: 'warn', text: 'Tippfehler „Komformitätsprüfung" (Template)' });

  // 4) Leere Pflichtkapitel: Überschrift direkt gefolgt von nächster Überschrift
  const idxOf = h => nonEmpty.findIndex(l => l === h || l.replace(/\s+/g, ' ') === h);
  for (const h of ['Begriffsbestimmungen', 'Außer Kraft gesetzte/ Mitgeltende Konzernregelungen', 'Anhänge']) {
    const i = idxOf(h);
    if (i < 0) continue;
    const next = nonEmpty[i + 1];
    if (next === undefined || _HC_HEADINGS.some(x => next === x || next.replace(/\s+/g, ' ') === x)) {
      findings.push({ sev: 'info', text: `Kapitel „${h}" ist leer` });
    }
  }
  return findings;
}

/* ═══════════════════════════════════════════════════
   Prüf-Lauf über alle Richtlinien (Admin-Ansicht)
═══════════════════════════════════════════════════ */

async function runHealthCheck() {
  if (HealthState.running) return;
  const btn = document.getElementById('btn-health');
  HealthState.running = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Prüfe …'; }
  try {
    const token = await acquireToken(SP.scopes);
    if (!token) return;   // Redirect zum Login läuft
    const pols = State.policies.filter(p => p.status !== 'Archiviert');
    HealthState.results = {};
    let done = 0;
    for (const p of pols) {
      const res = { status: 'ok', findings: [], hash: null, fileName: p.dokumentName || '' };
      HealthState.results[p.id] = res;
      done++;
      if (btn) btn.textContent = `⏳ Prüfe ${done}/${pols.length} …`;
      if (!p.naechsteReview) res.findings.push({ sev: 'info', text: 'Kein Review-Termin (Wiedervorlage) gesetzt' });
      if (!p.dokumentDriveId || !p.dokumentItemId) {
        res.status = 'na';
        res.findings.push({ sev: 'info', text: 'Kein Dokument zugeordnet – Inhaltsprüfung nicht möglich' });
        continue;
      }
      try {
        const metaResp = await fetch(
          `${SP.graphBase}/drives/${p.dokumentDriveId}/items/${p.dokumentItemId}` +
          `?$select=name,size,file,@microsoft.graph.downloadUrl`,
          { headers: { Authorization: `Bearer ${token}` } });
        if (!metaResp.ok) throw new Error('Graph ' + metaResp.status);
        const meta = await metaResp.json();
        res.fileName = meta.name || res.fileName;
        if (!/\.docx$/i.test(meta.name || '')) {
          res.status = 'na';
          res.findings.push({ sev: 'info', text: `Kein .docx (${esc(meta.name || '?')}) – Inhaltsprüfung übersprungen` });
          continue;
        }
        if ((meta.size || 0) > 25 * 1024 * 1024) {
          res.status = 'na';
          res.findings.push({ sev: 'info', text: 'Dokument > 25 MB – Inhaltsprüfung übersprungen' });
          continue;
        }
        const dl = meta['@microsoft.graph.downloadUrl'];
        if (!dl) throw new Error('kein Download-Link');
        const bytes = new Uint8Array(await (await fetch(dl)).arrayBuffer());
        const xmlBytes = await hcExtractZipEntry(bytes, 'word/document.xml');
        if (!xmlBytes) {
          res.status = 'warn';
          res.findings.push({ sev: 'warn', text: 'word/document.xml nicht lesbar (Datei beschädigt oder kein Word-Format?)' });
          continue;
        }
        res.hash = await hcSha256Hex(xmlBytes);
        const text = hcXmlToText(new TextDecoder('utf-8').decode(xmlBytes));
        res.findings.push(...hcAnalyzeText(text, p.title));
      } catch (e) {
        res.status = 'na';
        res.findings.push({ sev: 'info', text: 'Nicht prüfbar: ' + e.message });
      }
    }

    // Inhalts-Dubletten über alle geprüften Dokumente
    const byHash = {};
    for (const [id, r] of Object.entries(HealthState.results)) {
      if (r.hash) (byHash[r.hash] = byHash[r.hash] || []).push(id);
    }
    for (const ids of Object.values(byHash)) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        const others = ids.filter(x => x !== id)
          .map(x => (State.policies.find(p => p.id === x) || {}).title || x);
        HealthState.results[id].findings.push({ sev: 'error', text: 'Dokumentinhalt ist identisch mit: ' + others.join(', ') });
      }
    }

    // Gesamtstatus je Richtlinie
    for (const r of Object.values(HealthState.results)) {
      if (r.status === 'na') continue;
      r.status = r.findings.some(f => f.sev === 'error') ? 'error'
               : r.findings.some(f => f.sev === 'warn') ? 'warn' : 'ok';
    }
    HealthState.ranAt = new Date();
    if (typeof renderAdminList === 'function') renderAdminList();
    showHealthReport();
  } catch (e) {
    console.error('Health-Check fehlgeschlagen:', e);
    if (typeof toast === 'function') toast('Dokumentprüfung fehlgeschlagen: ' + e.message, 'error');
  } finally {
    HealthState.running = false;
    if (btn) { btn.disabled = false; btn.textContent = '🩺 Dokumente prüfen'; }
  }
}

/* ═══════════════════════════════════════════════════
   UI: Badge in der Admin-Liste + Ergebnisbericht
═══════════════════════════════════════════════════ */

const _HC_BADGE = {
  ok:    ['🟢', 'Dokument geprüft – ohne Befund'],
  warn:  ['🟡', 'Hinweise gefunden'],
  error: ['🔴', 'Kritische Befunde'],
  na:    ['⚪', 'Nicht geprüft / nicht prüfbar'],
};

function healthBadge(p) {
  const r = HealthState.results[p.id];
  if (!r) return '';
  const [icon, label] = _HC_BADGE[r.status] || _HC_BADGE.na;
  const n = r.findings.filter(f => f.sev !== 'info').length;
  const tip = r.findings.map(f => f.text).join(' · ') || label;
  return `<span class="ic-tag" style="cursor:pointer" title="${esc(tip)}"
    onclick="event.stopPropagation();showHealthReport()">${icon}${n ? ' ' + n : ''}</span>`;
}

function showHealthReport() {
  const ids = Object.keys(HealthState.results);
  if (!ids.length) return;
  const SEV = { error: ['🔴', '#b91c1c'], warn: ['🟡', '#b45309'], info: ['ℹ️', '#6b7280'] };
  const order = { error: 0, warn: 1, na: 2, ok: 3 };
  const rows = ids
    .map(id => ({ id, p: State.policies.find(x => x.id === id), r: HealthState.results[id] }))
    .filter(x => x.p)
    .sort((a, b) => (order[a.r.status] ?? 9) - (order[b.r.status] ?? 9));
  const counts = rows.reduce((a, x) => { a[x.r.status] = (a[x.r.status] || 0) + 1; return a; }, {});
  const body = rows.map(({ p, r }) => `
    <div style="border:1px solid var(--c-border);border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;gap:8px;align-items:center">
        <span>${(_HC_BADGE[r.status] || _HC_BADGE.na)[0]}</span>
        <b style="flex:1">${esc(p.title)}</b>
        <span style="font-size:.75rem;color:var(--c-muted)">${esc(r.fileName || '')}</span>
      </div>
      ${r.findings.length ? `<ul style="margin:6px 0 0 26px;padding:0;font-size:.83rem">
        ${r.findings.map(f => `<li style="color:${(SEV[f.sev] || SEV.info)[1]}">${(SEV[f.sev] || SEV.info)[0]} ${esc(f.text)}</li>`).join('')}
      </ul>` : '<div style="margin:4px 0 0 26px;font-size:.83rem;color:#15803d">Keine Befunde</div>'}
    </div>`).join('');
  openModal(`
    <div class="modal-header"><h3>🩺 Dokumentprüfung – Ergebnis</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field-hint" style="margin-bottom:10px">
        ${rows.length} Richtlinien geprüft (${counts.error || 0} kritisch · ${counts.warn || 0} Hinweise · ${counts.na || 0} nicht prüfbar)
        – geprüft ${HealthState.ranAt ? HealthState.ranAt.toLocaleString('de-DE') : ''}.
        Prüfumfang: Inhalts-Dubletten, Titel-Abgleich, Platzhalter, leere Kapitel – deterministisch im Browser, ohne externe Dienste.
      </div>
      ${body}
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Schließen</button></div>`);
}

/* Node-Export nur für Tests (im Browser wirkungslos). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { hcExtractZipEntry, hcSha256Hex, hcXmlToText, hcAnalyzeText, _hcZipEntries };
}
