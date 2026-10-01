'use strict';

/**
 * Prozess-Backlog – Ansicht „📌 Backlog" im Reiter Prozesse
 * =========================================================
 * Die Landkarte zeigt, welche Prozesse es gibt, die Matrix, wer zuständig ist.
 * Das Backlog zeigt, **woran gerade gearbeitet wird**: jede Kachel aller
 * Landkarten in der Spalte ihres Lebenszyklus (IST · SOLL · POC · freigegeben
 * · ausgerollt), sortiert nach Priorität und Fälligkeit.
 *
 * Zwei Entscheidungen:
 *
 *  1. Die IST-Spalte zeigt nur, was priorisiert ist. 278 erfasste Kacheln
 *     untereinander sind kein Backlog, sondern eine zweite Landkarte. Wer den
 *     Rest sehen will, schaltet ihn dazu.
 *  2. Der Status wird an der Karte gesetzt und landet in derselben Datei wie
 *     alles andere (prozesslandkarte.json) – mit Versionsverlauf und derselben
 *     Gleichzeitigkeitsprüfung wie die Landkarte. Kein zweites Register.
 */

let _pbWerk = '';          // '' = alle Karten
let _pbPrio = '';          // '' = alle · 'ohne' = nicht priorisiert · sonst PZ_PRIO-Schlüssel
let _pbStandard = '';      // '' = alle · 'offen' = nicht entschieden · sonst PZ_STANDARD-Schlüssel
let _pbSuche = '';
let _pbIstAlle = false;    // IST-Spalte auch ohne Priorität zeigen

async function initProzessBacklog() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  mount.innerHTML = `${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('backlog') : ''}
    <div class="doc-loading">Landkarten werden gelesen …</div>`;
  if (typeof lkDatenLaden === 'function') { try { await lkDatenLaden(); } catch (e) { /* Startbestand reicht */ } }
  if (typeof lkMitgliederLaden === 'function') lkMitgliederLaden();
  renderProzessBacklog();
}

/** Die sichtbaren Karten (Trennung nach Gesellschaft), mit Inhalt. */
function pbWerke() {
  return (typeof lkWerkeMitKarte === 'function') ? lkWerkeMitKarte() : [];
}

/** Einträge nach den Filtern – ohne die IST-Einschränkung (die gilt nur für die Spalte). */
function pbEintraege() {
  const daten = (typeof _lkDaten !== 'undefined') ? _lkDaten : null;
  const werke = pbWerke();
  const q = pzSchluessel(_pbSuche);
  return pzEintraege(daten, _pbWerk ? werke.filter(w => w === _pbWerk) : werke).filter(e => {
    if (_pbPrio === 'ohne' ? e.prio : (_pbPrio && e.prio !== _pbPrio)) return false;
    if (_pbStandard === 'offen' ? e.standard.key : (_pbStandard && e.standard.key !== _pbStandard)) return false;
    if (q && !pzSchluessel(`${e.kachel.name} ${e.kachel.unter || ''} ${pzNrText(e.kachel)}`).includes(q)) return false;
    return true;
  });
}

function _pbPerson(upn) {
  return (typeof lkPersonName === 'function') ? lkPersonName(upn) : upn;
}

function renderProzessBacklog() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const werke = pbWerke();
  const eintraege = pbEintraege();
  const spalten = pzSpalten(eintraege);
  const istVerborgen = _pbIstAlle ? 0 : spalten.ist.filter(e => !e.prio).length;
  if (!_pbIstAlle) spalten.ist = spalten.ist.filter(e => e.prio);
  const kz = pzKennzahlen(eintraege);
  const schreiben = (typeof lkDarfSchreiben === 'function') ? lkDarfSchreiben() : false;
  const sel = (wert, aktuell) => (wert === aktuell ? ' selected' : '');
  const kpi = (zahl, gesamt, label, warn) => `<div class="pm-kpi"${warn ? ' style="border-color:#fca5a5"' : ''}><b${warn ? ' style="color:#b91c1c"' : ''}>${zahl}${
    gesamt !== null ? `<span>/${gesamt}</span>` : ''}</b>${label}</div>`;

  mount.innerHTML = `
    ${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('backlog') : ''}
    <div class="view-desc" style="margin:0 0 12px">
      Jeder Prozess durchläuft denselben Weg: <b>IST erfasst → SOLL in Arbeit → POC → freigegeben → ausgerollt</b>,
      danach die regelmäßige <b>Überprüfung</b>. Der <b>Prozesseigner</b> verantwortet den Prozess konzernweit,
      der <b>Standardisierungsgrad</b> sagt, ob er in allen Werken gleich laufen muss. Beides wird an der Kachel der
      Konzern-Landkarte gepflegt und gilt für gleichnamige Kacheln der Werke mit.
    </div>
    <div class="view-toolbar">
      <select onchange="pbSetWerk(this.value)" style="max-width:200px" aria-label="Landkarte filtern">
        <option value=""${sel('', _pbWerk)}>Alle Landkarten</option>
        ${werke.map(w => `<option value="${esc(w)}"${sel(w, _pbWerk)}>${esc((typeof lkWerkLabel === 'function') ? lkWerkLabel(w) : w)}</option>`).join('')}
      </select>
      <select onchange="pbSetPrio(this.value)" style="max-width:170px" aria-label="Priorität filtern">
        <option value=""${sel('', _pbPrio)}>Jede Priorität</option>
        ${PZ_PRIO.map(p => `<option value="${p.key}"${sel(p.key, _pbPrio)}>Priorität ${esc(p.label)}</option>`).join('')}
        <option value="ohne"${sel('ohne', _pbPrio)}>nicht priorisiert</option>
      </select>
      <select onchange="pbSetStandard(this.value)" style="max-width:210px" aria-label="Standardisierungsgrad filtern">
        <option value=""${sel('', _pbStandard)}>Jeder Standardisierungsgrad</option>
        ${PZ_STANDARD.map(s => `<option value="${s.key}"${sel(s.key, _pbStandard)}>${esc(s.label)}</option>`).join('')}
        <option value="offen"${sel('offen', _pbStandard)}>noch nicht entschieden</option>
      </select>
      <div class="search-box" style="max-width:220px">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input type="text" value="${esc(_pbSuche)}" aria-label="Prozess suchen" placeholder="Prozess suchen …" oninput="pbSuchen(this.value)">
      </div>
      <div class="toolbar-spacer"></div>
      <label class="ack-check" style="font-weight:500">
        <input type="checkbox" ${_pbIstAlle ? 'checked' : ''} onchange="pbIstAlleZeigen(this.checked)">
        <span>IST auch ohne Priorität</span></label>
    </div>
    <div class="pm-kpis">
      ${kpi(kz.mitEigner, kz.gesamt, 'mit Prozesseigner')}
      ${kpi(kz.standardEntschieden, kz.gesamt, 'Standardisierung entschieden')}
      ${kpi(kz.priorisiert, kz.gesamt, 'priorisiert')}
      ${kpi(kz.inArbeit, null, 'in Arbeit (SOLL bis freigegeben)')}
      ${kpi(kz.ausgerollt, null, 'ausgerollt')}
      ${kpi(kz.ueberfaellig + kz.ohneTermin, null, 'Überprüfung überfällig oder ohne Termin', kz.ueberfaellig + kz.ohneTermin > 0)}
    </div>
    ${!werke.length
      ? (typeof emptyState === 'function' ? emptyState('Noch keine Landkarte angelegt.', '🗺') : '')
      : `<div class="pb-brett">${PZ_STATUS.map(s => _pbSpalteHtml(s, spalten[s.key], schreiben,
          s.key === 'ist' ? istVerborgen : 0)).join('')}</div>`}`;
}

function _pbSpalteHtml(status, liste, schreiben, verborgen) {
  return `<div class="pb-spalte" style="--pb-c:${status.farbe}">
      <div class="pb-spalte-kopf" title="${esc(status.text)}"><span>${esc(status.label)}</span><i>${liste.length}</i></div>
      <div class="pb-spalte-inhalt">
        ${liste.length ? liste.map(e => _pbKarteHtml(e, schreiben)).join('')
          : `<div class="field-hint" style="padding:8px 4px">${status.key === 'ist' && verborgen ? 'Noch nichts priorisiert.' : 'Leer.'}</div>`}
        ${verborgen ? `<button class="btn btn-ghost btn-sm" style="width:100%" onclick="pbIstAlleZeigen(true)"
          title="Erfasste, aber nicht priorisierte Prozesse zeigen">+ ${verborgen} ohne Priorität</button>` : ''}
      </div>
    </div>`;
}

function _pbKarteHtml(e, schreiben) {
  const k = e.kachel;
  const prio = pzPrioInfo(e.prio);
  const std = pzStandardInfo(e.standard.key);
  const p = e.pruefung;
  const werkLabel = (typeof lkWerkLabel === 'function') ? lkWerkLabel(e.werk) : e.werk;
  const pruefText = p.stufe === 'fehlt' ? '⏰ Überprüfung fehlt'
    : p.stufe === 'ueberfaellig' ? `⏰ seit ${-p.tage} Tag${p.tage === -1 ? '' : 'en'} fällig`
    : p.datum ? `🔎 ${p.datum.split('-').reverse().join('.')}` : '';
  const pruefFarbe = (p.stufe === 'fehlt' || p.stufe === 'ueberfaellig') ? '#b91c1c' : (p.stufe === 'bald' ? '#b45309' : '');
  const oeffnen = `pbOeffnen(${jsArg(e.werk)},${jsArg(k.id)})`;
  return `<div class="pb-karte" style="border-left-color:${prio ? prio.farbe : 'var(--c-border)'}">
      <div class="pb-karte-kopf">
        <a href="#" onclick="event.preventDefault();${oeffnen}" title="In der Landkarte öffnen">${esc(k.name)}</a>
        ${pzNrText(k) ? `<span class="pb-nr">${esc(pzNrText(k))}</span>` : ''}
      </div>
      <div class="pb-karte-meta">
        <span class="pb-tag">${esc(werkLabel)}</span>
        ${prio ? `<span class="pb-tag" style="color:${prio.farbe};border-color:${prio.farbe}">Prio ${esc(prio.label)}</span>` : ''}
        ${std ? `<span class="pb-tag" title="${esc(std.text)}${e.standard.geerbt ? ' (von der Konzern-Landkarte)' : ''}">${esc(std.kurz)}${e.standard.geerbt ? ' ↑' : ''}</span>` : ''}
      </div>
      <div class="pb-karte-person">${e.eigner.upn
        ? `👤 ${esc(_pbPerson(e.eigner.upn))}${e.eigner.geerbt ? ' <span class="field-hint" title="Prozesseigner der Konzern-Landkarte">↑</span>' : ''}`
        : '<span style="color:#b45309">👤 kein Prozesseigner</span>'}</div>
      ${pruefText ? `<div class="pb-karte-pruefung"${pruefFarbe ? ` style="color:${pruefFarbe}"` : ''}>${esc(pruefText)}</div>` : ''}
      ${schreiben ? `<select class="pb-status" aria-label="Status von ${esc(k.name)}"
          onchange="pbStatusSetzen(${jsArg(e.werk)},${jsArg(k.id)},this.value)">
          ${PZ_STATUS.map(s => `<option value="${s.key}"${s.key === e.status ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>` : ''}
    </div>`;
}

/* ── Bedienung ───────────────────────────────────────────────────────── */

function pbSetWerk(w) { _pbWerk = w || ''; renderProzessBacklog(); }
function pbSetPrio(p) { _pbPrio = p || ''; renderProzessBacklog(); }
function pbSetStandard(s) { _pbStandard = s || ''; renderProzessBacklog(); }
function pbIstAlleZeigen(an) { _pbIstAlle = !!an; renderProzessBacklog(); }

let _pbSucheTimer = 0;
function pbSuchen(q) {
  _pbSuche = String(q || '');
  clearTimeout(_pbSucheTimer);
  _pbSucheTimer = setTimeout(() => {
    renderProzessBacklog();
    const el = document.querySelector('.view-toolbar .search-box input');
    if (el && el.focus) { el.focus(); try { el.setSelectionRange(_pbSuche.length, _pbSuche.length); } catch (e) { /* egal */ } }
  }, 250);
}

/** Aus dem Backlog in die Landkarte des jeweiligen Werks, Kachel geöffnet. */
function pbOeffnen(werk, id) {
  if (typeof setProzessModus === 'function') setProzessModus('karte');
  if (typeof lkSpringeZu === 'function') lkSpringeZu(werk, id);
}

/**
 * Status an der Karte setzen. Gespeichert wird über die Landkarte – mit ihrem
 * Verlauf, ihrer Gleichzeitigkeitsprüfung und ihrem Recht.
 */
async function pbStatusSetzen(werk, id, status) {
  if (typeof lkDarfSchreiben === 'function' && !lkDarfSchreiben()) {
    toast('Nur Lesezugriff auf „Prozesse".', 'error'); renderProzessBacklog(); return;
  }
  const karte = (_lkDaten && _lkDaten.karten && _lkDaten.karten[werk]) || null;
  const k = karte && Array.isArray(karte.kacheln) ? karte.kacheln.find(x => x.id === id) : null;
  if (!k) { toast('Prozess nicht gefunden – bitte neu laden.', 'error'); return; }
  const vorher = { status: k.status, naechsteUeberpruefung: k.naechsteUeberpruefung };
  const text = pzStatusSetzen(k, status);
  if (!text) return;
  // Der Verlauf merkt sich das Werk der offenen Landkarte – hier ist es das der Karte.
  const offen = _lkWerk;
  _lkWerk = werk;
  const gut = await lkSpeichern(`${k.name}: ${pzStatusInfo(status).label} ✓`, `„${k.name}" – ${text}`);
  _lkWerk = offen;
  if (!gut) {
    k.status = vorher.status;
    k.naechsteUeberpruefung = vorher.naechsteUeberpruefung;
    renderProzessBacklog();
  }
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pbEintraege };
}
