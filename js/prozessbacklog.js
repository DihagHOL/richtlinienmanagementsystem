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
 *  3. Ein BPMN-Modell ist ein Prozess, auch ohne Kachel. Es steht als eigene
 *     Karte im Backlog; seine Angaben stehen in der .bpmn-Datei. Eine Kachel,
 *     an der ein Modell hängt, verschwindet dafür aus dem Backlog – sonst
 *     stünde derselbe Prozess zweimal da.
 */

let _pbWerk = '';          // '' = alle Karten
let _pbPrio = '';          // '' = alle · 'ohne' = nicht priorisiert · sonst PZ_PRIO-Schlüssel
let _pbStandard = '';      // '' = alle · 'offen' = nicht entschieden · sonst PZ_STANDARD-Schlüssel
let _pbSuche = '';
let _pbIstAlle = false;    // IST-Spalte auch ohne Priorität zeigen
let _pbArt = '';           // '' = alle · 'modell' · 'frei' (Modell ohne Landkarte) · 'kachel' (Kachel ohne Modell)

async function initProzessBacklog() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  mount.innerHTML = `${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('backlog') : ''}
    <div class="doc-loading">Landkarten werden gelesen …</div>`;
  if (typeof lkDatenLaden === 'function') { try { await lkDatenLaden(); } catch (e) { /* Startbestand reicht */ } }
  if (typeof lkMitgliederLaden === 'function') lkMitgliederLaden();
  // Die Modelle: erst die Liste, dann im Hintergrund ihre Angaben aus den Dateien.
  if (typeof spListProcesses === 'function' && typeof _processes !== 'undefined' && !_processes) {
    try { _processes = await spListProcesses(); } catch (e) { /* dann nur die Landkarten */ }
  }
  renderProzessBacklog();
  if (typeof procEintraegeLaden === 'function' && typeof _processes !== 'undefined' && _processes) {
    procEintraegeLaden(_processes).then(n => {
      if (n && typeof _prozModus !== 'undefined' && _prozModus === 'backlog') renderProzessBacklog();
    }).catch(() => {});
  }
}

/** Die Modelle der Liste mit ihren Angaben und den Kacheln, an denen sie hängen. */
function pbModelle() {
  const liste = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  return liste.map(p => {
    const e = (typeof procEintragVon === 'function') ? procEintragVon(p) : null;
    return { itemId: p.itemId, title: p.title, ordner: p.ordner || '', pm: e ? e.m : null,
      kacheln: (typeof procKachelnVon === 'function') ? procKachelnVon(p.itemId) : [] };
  });
}

/** Die sichtbaren Ebenen: Landkarten mit Inhalt und Ordner, in denen Modelle liegen. */
function pbWerke() {
  const karten = (typeof lkWerkeMitKarte === 'function') ? lkWerkeMitKarte() : [];
  const sichtbar = (typeof lkWerkeSichtbar === 'function') ? lkWerkeSichtbar() : null;
  const ordner = pbModelle().map(m => m.ordner).filter(o => o && (!sichtbar || sichtbar.includes(o)));
  const alle = [...new Set(karten.concat(ordner))];
  const rang = (w) => { const i = sichtbar ? sichtbar.indexOf(w) : -1; return i < 0 ? 500 : i; };
  return alle.sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, 'de'));
}

/** Einträge nach den Filtern – ohne die IST-Einschränkung (die gilt nur für die Spalte). */
function pbEintraege() {
  const daten = (typeof _lkDaten !== 'undefined') ? _lkDaten : null;
  const werke = pbWerke();
  const q = pzSchluessel(_pbSuche);
  const modelle = pbModelle().filter(m => !_pbWerk || m.ordner === _pbWerk);
  return pzEintraege(daten, _pbWerk ? werke.filter(w => w === _pbWerk) : werke, undefined, modelle).filter(e => {
    if (_pbArt === 'modell' && e.art !== 'modell') return false;
    if (_pbArt === 'frei' && !(e.art === 'modell' && !e.modell.kacheln.length)) return false;
    if (_pbArt === 'kachel' && e.art !== 'kachel') return false;
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
      danach die regelmäßige <b>Überprüfung</b>. Ein Prozess ist ein <b>BPMN-Modell</b> 🔀, auch ohne Landkarte,
      oder eine <b>Kachel</b> 🗺, die noch kein Modell hat. Der <b>Prozesseigner</b> verantwortet den Prozess konzernweit,
      der <b>Standardisierungsgrad</b> sagt, ob er in allen Werken gleich laufen muss. Was am Modell leer bleibt, gilt von
      seiner Kachel, und dort von der gleichnamigen Kachel der Konzern-Landkarte.
    </div>
    <div class="view-toolbar">
      <select onchange="pbSetWerk(this.value)" style="max-width:200px" aria-label="Landkarte filtern">
        <option value=""${sel('', _pbWerk)}>Alle Landkarten</option>
        ${werke.map(w => `<option value="${esc(w)}"${sel(w, _pbWerk)}>${esc((typeof lkWerkLabel === 'function') ? lkWerkLabel(w) : w)}</option>`).join('')}
      </select>
      <select onchange="pbSetArt(this.value)" style="max-width:220px" aria-label="Herkunft filtern">
        <option value=""${sel('', _pbArt)}>Modelle und Kacheln</option>
        <option value="modell"${sel('modell', _pbArt)}>nur Modelle</option>
        <option value="frei"${sel('frei', _pbArt)}>Modelle ohne Landkarte</option>
        <option value="kachel"${sel('kachel', _pbArt)}>Kacheln ohne Modell</option>
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
      ${schreiben ? `<button class="btn btn-primary btn-sm" onclick="pbNeuDialog()" title="Einen Prozess als BPMN-Modell anlegen, mit oder ohne Kachel">+ Prozess anlegen</button>` : ''}
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
  const modell = e.art === 'modell';
  const oeffnen = modell ? `pbModellOeffnen(${jsArg(k.id)})` : `pbOeffnen(${jsArg(e.werk)},${jsArg(k.id)})`;
  const kacheln = modell ? e.modell.kacheln : [];
  const herkunft = modell
    ? (kacheln.length === 1
        ? `<span class="pb-tag" title="Hängt an der Kachel „${esc(kacheln[0].kachel.name)}" (${esc((typeof lkWerkLabel === 'function') ? lkWerkLabel(kacheln[0].werk) : kacheln[0].werk)})">🗺 ${esc(pzNrText(kacheln[0].kachel) || kacheln[0].kachel.name)}</span>`
        : kacheln.length ? `<span class="pb-tag" title="Hängt an ${kacheln.length} Kacheln">🗺 ${kacheln.length}</span>`
          : '<span class="pb-tag" title="Hängt an keiner Kachel der Landkarten">ohne Landkarte</span>')
    : '<span class="pb-tag" title="Kachel der Landkarte, noch ohne BPMN-Modell">ohne Modell</span>';
  return `<div class="pb-karte" style="border-left-color:${prio ? prio.farbe : 'var(--c-border)'}">
      <div class="pb-karte-kopf">
        <a href="#" onclick="event.preventDefault();${oeffnen}" title="${modell ? 'Modell öffnen' : 'In der Landkarte öffnen'}">${modell ? '🔀 ' : ''}${esc(k.name)}</a>
        ${pzNrText(k) ? `<span class="pb-nr">${esc(pzNrText(k))}</span>` : ''}
      </div>
      <div class="pb-karte-meta">
        <span class="pb-tag">${esc(e.werk ? werkLabel : 'ohne Ablage')}</span>
        ${herkunft}
        ${prio ? `<span class="pb-tag" style="color:${prio.farbe};border-color:${prio.farbe}">Prio ${esc(prio.label)}</span>` : ''}
        ${std ? `<span class="pb-tag" title="${esc(std.text)}${e.standard.geerbt ? ' (von der Konzern-Landkarte)' : ''}">${esc(std.kurz)}${e.standard.geerbt ? ' ↑' : ''}</span>` : ''}
      </div>
      <div class="pb-karte-person">${e.eigner.upn
        ? `👤 ${esc(_pbPerson(e.eigner.upn))}${e.eigner.geerbt ? ' <span class="field-hint" title="Prozesseigner der Konzern-Landkarte">↑</span>' : ''}`
        : '<span style="color:#b45309">👤 kein Prozesseigner</span>'}</div>
      ${pruefText ? `<div class="pb-karte-pruefung"${pruefFarbe ? ` style="color:${pruefFarbe}"` : ''}>${esc(pruefText)}</div>` : ''}
      ${schreiben ? `<select class="pb-status" aria-label="Status von ${esc(k.name)}"
          onchange="${modell ? `pbModellStatusSetzen(${jsArg(k.id)},this.value)` : `pbStatusSetzen(${jsArg(e.werk)},${jsArg(k.id)},this.value)`}">
          ${PZ_STATUS.map(s => `<option value="${s.key}"${s.key === e.status ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>` : ''}
    </div>`;
}

/* ── Bedienung ───────────────────────────────────────────────────────── */

function pbSetWerk(w) { _pbWerk = w || ''; renderProzessBacklog(); }
function pbSetPrio(p) { _pbPrio = p || ''; renderProzessBacklog(); }
function pbSetStandard(s) { _pbStandard = s || ''; renderProzessBacklog(); }
function pbIstAlleZeigen(an) { _pbIstAlle = !!an; renderProzessBacklog(); }
function pbSetArt(a) { _pbArt = a || ''; renderProzessBacklog(); }

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

/* ── Modelle im Backlog ──────────────────────────────────────────────── */

function pbModellOeffnen(itemId) {
  if (typeof openProcessAnsicht === 'function') openProcessAnsicht(itemId);
}

/**
 * Status am Modell setzen: in die .bpmn-Datei, ohne den Modeler zu öffnen.
 * Regelwerke, Anlagen und Beschreibung bleiben stehen (procXmlDokuNeu).
 */
async function pbModellStatusSetzen(itemId, status) {
  if (typeof lkDarfSchreiben === 'function' && !lkDarfSchreiben()) {
    toast('Nur Lesezugriff auf „Prozesse".', 'error'); renderProzessBacklog(); return;
  }
  const p = (typeof procModellVon === 'function') ? procModellVon(itemId) : null;
  if (!p || typeof spGetProcessXml !== 'function' || typeof procXmlDokuNeu !== 'function') {
    toast('Modell nicht gefunden – bitte neu laden.', 'error'); return;
  }
  try {
    const xml = await spGetProcessXml(itemId);
    const pm = procPmAusXml(xml) || pzPmNormal({});
    // Auch ein geerbter Termin zählt: Wer freigibt, bekommt nur dann einen
    // neuen, wenn weder Modell noch Kachel einen haben.
    const daten = (typeof _lkDaten !== 'undefined') ? _lkDaten : null;
    const kacheln = (typeof procKachelnVon === 'function') ? procKachelnVon(itemId) : [];
    const vorher = pzModellEintraege(daten, [{ itemId, title: p.title, ordner: p.ordner || '', pm, kacheln }])[0];
    pm.status = status;
    if (['freigegeben', 'ausgerollt'].includes(status) && vorher.pruefung.tage === null && !pm.naechsteUeberpruefung) {
      pm.naechsteUeberpruefung = pzTerminVorschlag();
    }
    const neu = procXmlDokuNeu(xml, { pm });
    await spSaveProcess(p.title, neu, p.ordner || '');
    try { _processes = await spListProcesses(); } catch (e) { /* dann mit der alten Liste */ }
    const q = procModellVon(itemId);
    if (q && typeof procLinksMerken === 'function') procLinksMerken(q.itemId + '|' + q.modified, procEintragAusXml(neu));
    toast(`${p.title}: ${pzStatusInfo(vorher.status).label} → ${pzStatusInfo(status).label} ✓`, 'success');
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
  renderProzessBacklog();
}

/* ── Prozess anlegen ─────────────────────────────────────────────────
   Angelegt wird ein BPMN-Modell – das ist der Prozess. Die Kachel auf der
   Landkarte ist eine Möglichkeit, keine Pflicht: Ein Modell kann später an
   eine Kachel gehängt werden („+ Vorhandenes verknüpfen"). */

function pbNeuDialog() {
  if (typeof lkDarfSchreiben === 'function' && !lkDarfSchreiben()) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const werke = (typeof lkWerkeSichtbar === 'function') ? lkWerkeSichtbar() : [];
  const start = _pbWerk || (werke.includes('HOL') ? 'HOL' : (werke[0] || ''));
  const label = (w) => (typeof lkWerkLabel === 'function') ? lkWerkLabel(w) : w;
  if (typeof lkMitgliederLaden === 'function') lkMitgliederLaden();
  openModal(`
    <div class="modal-header"><h3>Prozess anlegen</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 12px">Angelegt wird ein <b>BPMN-Modell</b> in „Prozesse/&lt;Ablage&gt;". Das ist der Prozess.
        Eine Kachel auf der Landkarte ist optional, das Modell lässt sich auch später an eine Kachel hängen.</p>
      <div class="form-grid">
        <div class="form-group full"><label>Name <span class="req">*</span></label>
          <input type="text" id="pb-neu-name" placeholder="z. B. Bestellung freigeben"></div>
        <div class="form-group"><label>Ablage (Konzern / Gesellschaft)</label>
          <select id="pb-neu-werk" onchange="pbNeuBaender()">
            <option value="">— ohne Ablage —</option>
            ${werke.map(w => `<option value="${esc(w)}"${w === start ? ' selected' : ''}>${esc(label(w))}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Status</label>
          <select id="pb-neu-status">${PZ_STATUS.map(s => `<option value="${s.key}">${esc(s.label)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Prozesseigner (E-Mail)</label>
          <input type="text" id="pb-neu-eigner" list="lk-people" placeholder="leer = von der Kachel">
          <datalist id="lk-people">${(typeof _lkPeopleOptions === 'function') ? _lkPeopleOptions() : ''}</datalist></div>
        <div class="form-group"><label>Priorität</label>
          <select id="pb-neu-prio"><option value="">nicht priorisiert</option>${PZ_PRIO.map(p => `<option value="${p.key}">${esc(p.label)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Standardisierungsgrad</label>
          <select id="pb-neu-std"><option value="">noch nicht entschieden</option>${PZ_STANDARD.map(s => `<option value="${s.key}">${esc(s.label)}</option>`).join('')}</select></div>
        <div class="form-group full">
          <label class="ack-check" style="font-weight:500"><input type="checkbox" id="pb-neu-karte" onchange="pbNeuBaender()">
            <span>Auch auf der Landkarte der Ablage eintragen</span></label>
          <div id="pb-neu-band-feld" style="display:none;margin-top:6px">
            <select id="pb-neu-band"></select>
            <span class="field-hint">Die Kachel bekommt das Modell gleich verknüpft.</span>
          </div></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <div style="flex:1"></div>
      <button class="btn btn-outline" onclick="pbNeuAnlegen(false)">Anlegen</button>
      <button class="btn btn-primary" onclick="pbNeuAnlegen(true)">Anlegen und modellieren</button>
    </div>`);
  pbNeuBaender();
  const n = document.getElementById('pb-neu-name');
  if (n && n.focus) n.focus();
}

/** Die Bänder der gewählten Landkarte – nur, wenn die Kachel gewünscht ist. */
function pbNeuBaender() {
  const werk = (document.getElementById('pb-neu-werk') || {}).value || '';
  const karte = document.getElementById('pb-neu-karte');
  const feld = document.getElementById('pb-neu-band-feld');
  const sel = document.getElementById('pb-neu-band');
  if (karte) karte.disabled = !werk;
  if (karte && !werk) karte.checked = false;
  if (feld) feld.style.display = (karte && karte.checked) ? '' : 'none';
  if (sel) {
    const baender = (typeof lkBaenderVon === 'function') ? lkBaenderVon(werk) : [];
    sel.innerHTML = baender.map(b => `<option value="${esc(b.key)}"${b.key === 'kern' ? ' selected' : ''}>${esc(b.titel)}</option>`).join('');
  }
}

async function pbNeuAnlegen(modellieren) {
  if (typeof lkDarfSchreiben === 'function' && !lkDarfSchreiben()) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const wert = (id) => String((document.getElementById(id) || {}).value || '').trim();
  const name = wert('pb-neu-name');
  if (!name) { toast('Bitte einen Namen angeben.', 'error'); return; }
  const werk = wert('pb-neu-werk');
  const aufKarte = !!(document.getElementById('pb-neu-karte') || {}).checked && !!werk;
  const band = wert('pb-neu-band');
  try {
    if (typeof _processes !== 'undefined' && !_processes) _processes = await spListProcesses();
    const doppel = (typeof procNamensDoppel === 'function') ? procNamensDoppel(name).find(p => (p.ordner || '') === werk) : null;
    if (doppel) { toast(`Ein Modell „${doppel.title}" gibt es in dieser Ablage schon.`, 'error'); return; }
    if (aufKarte && typeof lkNamensDoppel === 'function' && lkNamensDoppel(name, '').some(x => x.werk === werk)) {
      toast(`„${name}" gibt es auf dieser Landkarte schon. Das Modell dort mit „+ Vorhandenes verknüpfen" anhängen.`, 'error'); return;
    }
    const pm = pzPmNormal({ status: wert('pb-neu-status'), prozesseigner: wert('pb-neu-eigner'),
      standardisierung: wert('pb-neu-std'), prioritaet: wert('pb-neu-prio') });
    if (['freigegeben', 'ausgerollt'].includes(pm.status)) pm.naechsteUeberpruefung = pzTerminVorschlag();
    const xml = procXmlDokuNeu(procLeeresBpmn(), { ids: [], docs: [], pm });
    const item = await spSaveProcess(name, xml, werk);
    if (aufKarte && item && item.id) {
      const offen = _lkWerk;
      _lkWerk = werk;
      try {
        lkKarte(werk);
        const k = { id: lkFreieKachelId(name), band: band || 'kern', name, unter: '',
          geltung: werk === 'KONZERN' ? ['ALLE'] : [werk], typ: '', verantwortlich: '', vertretung: '',
          prozesse: [{ id: item.id, name }], regelwerke: [] };
        lkKacheln().push(k);
        lkNummernVergeben();
        await lkSpeichern('', `Prozess „${name}" (${lkNrText(k)}) mit Modell angelegt`);
      } finally { _lkWerk = offen; }
    }
    try { _processes = await spListProcesses(); } catch (e) { /* dann ohne */ }
    const q = (typeof procModellVon === 'function' && item) ? procModellVon(item.id) : null;
    if (q && typeof procLinksMerken === 'function') procLinksMerken(q.itemId + '|' + q.modified, procEintragAusXml(xml));
    closeModal();
    toast(`Prozess „${name}" angelegt ✓`, 'success');
    if (modellieren && item && item.id && typeof openProcessEditor === 'function') openProcessEditor(item.id);
    else renderProzessBacklog();
  } catch (e) {
    toast('Anlegen fehlgeschlagen: ' + e.message, 'error');
  }
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pbEintraege, pbModelle };
}
