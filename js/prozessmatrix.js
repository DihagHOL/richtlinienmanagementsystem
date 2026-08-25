/**
 * Zuständigkeits- und Abdeckungsmatrix der Prozesse.
 *
 * Die Landkarte beantwortet „wie läuft es?", die Mindmap „was hängt woran?".
 * Offen blieb die Frage, die in jedem Audit zuerst kommt: **wer ist zuständig –
 * und in welchem Werk?** Genau das ist diese Ansicht: Prozesse als Zeilen,
 * Werke als Spalten.
 *
 * Zwei Blätter auf derselben Tabelle:
 *   • Zuständigkeiten – wer verantwortet den Prozess in diesem Werk
 *   • Abdeckung       – wo fehlt Modell, Regelwerk oder Verantwortliche(r)
 *
 * Die Daten kommen unverändert aus den Landkarten (prozesslandkarte.json) und
 * der geladenen Modell-/Regelwerksliste. Nichts wird hier zusätzlich gespeichert.
 */

let _pmTab = 'zustaendig';   // 'zustaendig' | 'abdeckung'
let _pmBand = '';            // Filter auf ein Band
let _pmNurLuecken = false;   // nur Zeilen mit mindestens einer Lücke

/** Werke, die eine Landkarte führen. */
function pmWerke() {
  return (typeof lkWerkeMitKarte === 'function') ? lkWerkeMitKarte() : [];
}

/** Vergleichsschlüssel: verglichen wird, was Menschen vergleichen – der Name. */
function _pmSchluessel(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Eine Zeile je Prozess, quer über alle Werke.
 * Zwei Werke, die denselben Prozess führen, stehen in derselben Zeile – auch
 * wenn ihre Kacheln unterschiedliche Kennungen haben (etwa weil ein Werk seinen
 * eigenen angelegt hat statt die Karte zu übernehmen).
 */
function pmZeilen() {
  const alle = (typeof lkAlleKacheln === 'function') ? lkAlleKacheln() : [];
  const zeilen = new Map();
  alle.forEach(({ werk, kachel }) => {
    const key = _pmSchluessel(kachel.name);
    if (!key) return;
    if (!zeilen.has(key)) zeilen.set(key, { key, name: kachel.name, band: kachel.band || '', werke: {} });
    zeilen.get(key).werke[werk] = kachel;
  });
  const reihen = [...zeilen.values()];
  const bandRang = _pmBandReihenfolge();
  return reihen.sort((a, b) =>
    (bandRang.indexOf(a.band) + 1 || 99) - (bandRang.indexOf(b.band) + 1 || 99)
    || a.name.localeCompare(b.name, 'de'));
}

/** Bänder in ihrer üblichen Reihenfolge – über alle Karten gesammelt. */
function _pmBandReihenfolge() {
  const keys = [];
  pmWerke().forEach(w => ((typeof lkBaenderVon === 'function') ? lkBaenderVon(w) : [])
    .forEach(b => { if (!keys.includes(b.key)) keys.push(b.key); }));
  return keys;
}

function _pmBandTitel(key) {
  for (const w of pmWerke()) {
    const t = ((typeof lkBaenderVon === 'function') ? lkBaenderVon(w) : []).find(b => b.key === key);
    if (t) return t.titel;
  }
  return key || 'Ohne Band';
}

/** Stand einer Kachel: die drei Angaben, an denen sich Reife entscheidet. */
function pmStand(kachel, werk) {
  if (!kachel) return null;
  return {
    modell: ((typeof lkProzesseVon === 'function') ? lkProzesseVon(kachel, werk) : []).length,
    regelwerk: ((typeof lkRegelwerkeVon === 'function') ? lkRegelwerkeVon(kachel) : []).length,
    verantwortlich: String(kachel.verantwortlich || '').trim(),
  };
}

/** Hat die Zeile irgendwo eine Lücke? (Für den Filter „nur Lücken".) */
function pmZeileLueckig(z) {
  return pmWerke().some(w => {
    const st = pmStand(z.werke[w], w);
    return !st || !st.verantwortlich || !st.modell || !st.regelwerk;
  });
}

/* ── Ansicht ─────────────────────────────────────────────────────────── */

async function initProzessMatrix() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  mount.innerHTML = `${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('matrix') : ''}
    <div class="doc-loading">Landkarten werden gelesen …</div>`;
  if (typeof lkDatenLaden === 'function') { try { await lkDatenLaden(); } catch (e) { /* Startbestand reicht */ } }
  if (typeof lkMitgliederLaden === 'function') lkMitgliederLaden();
  renderProzessMatrix();
}

function renderProzessMatrix() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const werke = pmWerke();
  const baender = _pmBandReihenfolge();
  let zeilen = pmZeilen();
  if (_pmBand) zeilen = zeilen.filter(z => z.band === _pmBand);
  if (_pmNurLuecken) zeilen = zeilen.filter(pmZeileLueckig);

  const tab = (key, label, titel) => `<button class="btn btn-sm ${_pmTab === key ? 'btn-primary' : 'btn-ghost'}"
      onclick="pmSetTab('${key}')" title="${titel}">${label}</button>`;

  mount.innerHTML = `
    ${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('matrix') : ''}
    <div class="view-desc" style="margin:0 0 12px">
      Prozesse als Zeilen, Werke als Spalten. <b>Zuständigkeiten</b> beantwortet „wer verantwortet
      diesen Ablauf hier?", <b>Abdeckung</b> zeigt, wo Modell, Regelwerk oder Verantwortliche(r) fehlen.
    </div>
    <div class="view-toolbar">
      ${tab('zustaendig', '👤 Zuständigkeiten', 'Wer verantwortet welchen Prozess in welchem Werk')}
      ${tab('abdeckung', '📊 Abdeckung', 'Wo fehlen Modell, Regelwerk oder Verantwortliche(r)')}
      <select onchange="pmSetBand(this.value)" style="max-width:220px" aria-label="Band filtern">
        <option value=""${_pmBand ? '' : ' selected'}>Alle Bänder</option>
        ${baender.map(b => `<option value="${esc(b)}"${_pmBand === b ? ' selected' : ''}>${esc(_pmBandTitel(b))}</option>`).join('')}
      </select>
      <label class="ack-check" style="font-weight:500">
        <input type="checkbox" ${_pmNurLuecken ? 'checked' : ''} onchange="pmToggleLuecken(this.checked)">
        <span>Nur Lücken</span></label>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-ghost btn-sm" onclick="pmCsv()" title="Als CSV für Excel">⬇ CSV</button>
      <button class="btn btn-outline btn-sm" onclick="pmDrucken()" title="Druckfassung öffnen">🖨 Drucken</button>
    </div>
    ${_pmKennzahlen(werke)}
    ${!werke.length
      ? (typeof emptyState === 'function' ? emptyState('Noch keine Landkarte angelegt.', '🗺') : '')
      : !zeilen.length
        ? (typeof emptyState === 'function' ? emptyState('Keine Zeile passt zum Filter.', '🔍') : '')
        : `<div class="pm-scroll"><table class="pm-tabelle">
            <thead><tr><th class="pm-erste">Prozess</th>
              ${werke.map(w => `<th>${esc(lkWerkLabel(w))}</th>`).join('')}</tr></thead>
            <tbody>${_pmZeilenHtml(zeilen, werke)}</tbody>
            <tfoot><tr><th class="pm-erste">${_pmTab === 'zustaendig' ? 'Verantwortliche gepflegt' : 'Prozesse geführt'}</th>
              ${werke.map(w => `<th>${_pmSpaltenSumme(w, zeilen)}</th>`).join('')}</tr></tfoot>
          </table></div>
          ${_pmLegende()}`}`;
}

function _pmKennzahlen(werke) {
  const zeilen = pmZeilen();
  let kacheln = 0, mitOwner = 0, mitModell = 0, mitRegelwerk = 0;
  zeilen.forEach(z => werke.forEach(w => {
    const st = pmStand(z.werke[w], w);
    if (!st) return;
    kacheln++;
    if (st.verantwortlich) mitOwner++;
    if (st.modell) mitModell++;
    if (st.regelwerk) mitRegelwerk++;
  }));
  const kachel = (zahl, gesamt, label) => `<div class="pm-kpi"><b>${zahl}<span>/${gesamt}</span></b>${label}</div>`;
  return `<div class="pm-kpis">
      ${kachel(mitOwner, kacheln, 'mit Verantwortlichem')}
      ${kachel(mitModell, kacheln, 'mit BPMN-Modell')}
      ${kachel(mitRegelwerk, kacheln, 'mit Regelwerk')}
      <div class="pm-kpi"><b>${zeilen.length}</b>Prozesse in ${werke.length} Werk${werke.length === 1 ? '' : 'en'}</div>
    </div>`;
}

function _pmZeilenHtml(zeilen, werke) {
  let letztesBand = null;
  return zeilen.map(z => {
    const kopf = (z.band !== letztesBand)
      ? `<tr class="pm-band"><td colspan="${werke.length + 1}">${esc(_pmBandTitel(z.band))}</td></tr>` : '';
    letztesBand = z.band;
    return kopf + `<tr>
        <td class="pm-erste">${esc(z.name)}</td>
        ${werke.map(w => _pmZelle(z, w)).join('')}
      </tr>`;
  }).join('');
}

function _pmZelle(z, werk) {
  const k = z.werke[werk];
  const st = pmStand(k, werk);
  if (!st) return `<td class="pm-leer" title="${esc(lkWerkLabel(werk))} führt diesen Prozess nicht">·</td>`;
  const klick = `onclick="pmOeffnen('${esc(werk)}','${esc(k.id)}')" role="button" tabindex="0"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pmOeffnen('${esc(werk)}','${esc(k.id)}')}"`;

  if (_pmTab === 'zustaendig') {
    return st.verantwortlich
      ? `<td class="pm-klick" ${klick} title="${esc(st.verantwortlich)}${k.vertretung ? ' · Vertretung: ' + esc(k.vertretung) : ''}">${
          esc(lkPersonName(st.verantwortlich))}</td>`
      : `<td class="pm-klick pm-fehlt" ${klick} title="Kein Verantwortlicher gepflegt – hier eintragen">—</td>`;
  }
  const marke = (an, buchstabe, titel) =>
    `<span class="pm-marke ${an ? 'an' : 'aus'}" title="${esc(titel)}">${buchstabe}</span>`;
  return `<td class="pm-klick" ${klick}>
      ${marke(st.verantwortlich, 'V', st.verantwortlich ? 'Verantwortlich: ' + lkPersonName(st.verantwortlich) : 'Kein Verantwortlicher')}
      ${marke(st.modell, 'M', st.modell ? `${st.modell} Modell(e)` : 'Kein BPMN-Modell')}
      ${marke(st.regelwerk, 'R', st.regelwerk ? `${st.regelwerk} Regelwerk(e)` : 'Kein Regelwerk zugeordnet')}
    </td>`;
}

function _pmSpaltenSumme(werk, zeilen) {
  const gefuehrt = zeilen.filter(z => z.werke[werk]);
  if (_pmTab === 'zustaendig') {
    const mit = gefuehrt.filter(z => String(z.werke[werk].verantwortlich || '').trim()).length;
    return `${mit}/${gefuehrt.length}`;
  }
  return `${gefuehrt.length}/${zeilen.length}`;
}

function _pmLegende() {
  return _pmTab === 'zustaendig'
    ? `<div class="field-hint" style="margin-top:8px">„—" heißt: Der Prozess wird in diesem Werk geführt,
        aber niemand verantwortet ihn. „·" heißt: Das Werk führt diesen Prozess nicht.
        Ein Klick öffnet die Kachel im jeweiligen Werk.</div>`
    : `<div class="field-hint" style="margin-top:8px"><b>V</b> Verantwortliche(r) · <b>M</b> BPMN-Modell ·
        <b>R</b> Regelwerk zugeordnet. Grün = vorhanden, blass = fehlt. „·" heißt: Das Werk führt
        diesen Prozess nicht – das kann völlig richtig sein.</div>`;
}

/* ── Bedienung ───────────────────────────────────────────────────────── */

function pmSetTab(t) { _pmTab = (t === 'abdeckung') ? 'abdeckung' : 'zustaendig'; renderProzessMatrix(); }
function pmSetBand(b) { _pmBand = b || ''; renderProzessMatrix(); }
function pmToggleLuecken(an) { _pmNurLuecken = !!an; renderProzessMatrix(); }

/** Aus der Matrix in die Landkarte des jeweiligen Werks springen. */
function pmOeffnen(werk, id) {
  if (typeof lkSpringeZu === 'function') {
    if (typeof setProzessModus === 'function') setProzessModus('karte');
    lkSpringeZu(werk, id);
  }
}

/* ── Ausgabe: CSV und Druckfassung ───────────────────────────────────── */

function pmCsv() {
  const werke = pmWerke();
  const zeilen = pmZeilen();
  const feld = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const kopf = ['Band', 'Prozess'].concat(werke.map(w => lkWerkLabel(w)));
  const reihen = zeilen.map(z => [_pmBandTitel(z.band), z.name].concat(werke.map(w => {
    const st = pmStand(z.werke[w], w);
    if (!st) return '';
    return _pmTab === 'zustaendig'
      ? (st.verantwortlich || 'offen')
      : `V:${st.verantwortlich ? 'ja' : 'nein'} M:${st.modell} R:${st.regelwerk}`;
  })));
  // Semikolon und BOM: so öffnet Excel die Datei ohne Import-Assistenten.
  const csv = '﻿' + [kopf].concat(reihen).map(r => r.map(feld).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Prozess-${_pmTab === 'zustaendig' ? 'Zustaendigkeiten' : 'Abdeckung'}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pmDrucken() {
  const werke = pmWerke();
  const zeilen = pmZeilen();
  const stamp = new Date().toLocaleDateString('de-DE');
  let letztesBand = null;
  const reihen = zeilen.map(z => {
    const kopf = (z.band !== letztesBand)
      ? `<tr><td colspan="${werke.length + 1}" style="background:#e5e7eb;font-weight:700">${esc(_pmBandTitel(z.band))}</td></tr>` : '';
    letztesBand = z.band;
    const zellen = werke.map(w => {
      const st = pmStand(z.werke[w], w);
      if (!st) return '<td style="color:#9ca3af">·</td>';
      if (_pmTab === 'zustaendig') {
        return st.verantwortlich
          ? `<td>${esc(lkPersonName(st.verantwortlich))}</td>`
          : '<td style="color:#b91c1c">offen</td>';
      }
      return `<td>${st.verantwortlich ? 'V ' : ''}${st.modell ? 'M ' : ''}${st.regelwerk ? 'R' : ''}${
        st.verantwortlich || st.modell || st.regelwerk ? '' : '<span style="color:#b91c1c">—</span>'}</td>`;
    }).join('');
    return kopf + `<tr><td><b>${esc(z.name)}</b></td>${zellen}</tr>`;
  }).join('');

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>Prozess-${_pmTab === 'zustaendig' ? 'Zuständigkeiten' : 'Abdeckung'} – DIHAG (${esc(stamp)})</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:24px;font-size:12px;line-height:1.45}
      h1{font-size:18px;margin:0 0 2px} .muted{color:#6b7280}
      table{border-collapse:collapse;width:100%;margin-top:10px}
      th,td{border:1px solid #d1d5db;padding:4px 8px;text-align:left;vertical-align:top}
      th{background:#1A2644;color:#fff;font-size:11px} .noprint{margin:16px 0}
      @media print{.noprint{display:none}thead{display:table-header-group}tr,h1{break-inside:avoid;page-break-inside:avoid}}
    </style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
    <h1>Prozess-${_pmTab === 'zustaendig' ? 'Zuständigkeiten' : 'Abdeckung'}</h1>
    <div class="muted">DIHAG · Regelwerk-Management · Stand ${esc(stamp)} · ${zeilen.length} Prozesse ·
      ${werke.length} Werk${werke.length === 1 ? '' : 'e'}${_pmTab === 'abdeckung' ? ' · V = Verantwortliche(r), M = BPMN-Modell, R = Regelwerk' : ''}</div>
    <table><thead><tr><th>Prozess</th>${werke.map(w => `<th>${esc(lkWerkLabel(w))}</th>`).join('')}</tr></thead>
      <tbody>${reihen || `<tr><td colspan="${werke.length + 1}">Keine Prozesse.</td></tr>`}</tbody></table>
    <p class="muted" style="margin-top:16px">Erzeugt aus den Prozesslandkarten des RMS – „·" heißt, das Werk führt diesen Prozess nicht.</p>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Bitte Pop-ups für diese Seite erlauben.', 'error'); return; }
  w.document.write(html);
  w.document.close();
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _pmSchluessel };
}
