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
 *  4. EOL gehört zur IST-Erfassung: Das IST-Modell eines Ablaufs, den ein SOLL
 *     ablöst, steht in der IST-Spalte unter „wird abgelöst". Es muss mit seinem
 *     SOLL-Modell verknüpft sein; die Karte zeigt, wie weit das SOLL ist (SOLL,
 *     POC, freigegeben), die SOLL-Karte umgekehrt, welches IST sie ablöst.
 *  5. Der POC gehört zum SOLL: Pilotwerk, Zeitraum, Erfolgskriterien und
 *     Ergebnis stehen am SOLL-Modell (am Hauptprozess, Unter- und Nebenprozesse
 *     laufen mit). So zeigt die Kette IST → SOLL → POC auf jeder Karte, wo sie steht.
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
      kacheln: (typeof procKachelnVon === 'function') ? procKachelnVon(p.itemId) : [],
      kinder: (typeof procGliederungKinder === 'function') ? procGliederungKinder(p.itemId).map(k => k.id) : [] };
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
  // Alle Modelle mitgeben (der Hauptprozess kann woanders liegen), gefiltert wird danach.
  return pzEintraege(daten, _pbWerk ? werke.filter(w => w === _pbWerk) : werke, undefined, pbModelle()).filter(e => {
    if (_pbWerk && e.art === 'modell' && e.werk !== _pbWerk) return false;
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
  // Ohne Priorität ausgeblendet wird nur das reine IST. Was abgelöst wird,
  // hängt an einem laufenden SOLL und bleibt sichtbar.
  const istVerborgen = _pbIstAlle ? 0 : spalten.ist.filter(e => e.status === 'ist' && !e.prio).length;
  if (!_pbIstAlle) spalten.ist = spalten.ist.filter(e => e.prio || e.status === 'eol');
  const kz = pzKennzahlen(eintraege);
  const pocs = eintraege.filter(e => e.art === 'modell' && e.status === 'poc' && _pbIstHaupt(e.kachel.id));
  const pocMitKriterien = pocs.filter(e => e.poc && e.poc.kriterien.length).length;
  const schreiben = (typeof lkDarfSchreiben === 'function') ? lkDarfSchreiben() : false;
  const sel = (wert, aktuell) => (wert === aktuell ? ' selected' : '');
  const kpi = (zahl, gesamt, label, warn) => `<div class="pm-kpi"${warn ? ' style="border-color:#fca5a5"' : ''}><b${warn ? ' style="color:#b91c1c"' : ''}>${zahl}${
    gesamt !== null ? `<span>/${gesamt}</span>` : ''}</b>${label}</div>`;

  mount.innerHTML = `
    ${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('backlog') : ''}
    <div class="view-desc" style="margin:0 0 12px">
      Jeder Prozess durchläuft denselben Weg: <b>IST erfasst → SOLL in Arbeit → POC → freigegeben → ausgerollt</b>,
      danach die regelmäßige <b>Überprüfung</b>. Wird ein bisheriger Ablauf durch ein SOLL abgelöst, bleibt sein IST-Modell
      in der IST-Erfassung unter <b>„wird abgelöst (EOL)"</b>, verknüpft mit dem SOLL-Modell und dessen Stand
      (SOLL, POC, freigegeben). Der <b>POC</b> 🧪 gehört zum SOLL: Pilotwerk, Zeitraum und Erfolgskriterien stehen am
      SOLL-Modell, am Hauptprozess. Ab dem POC braucht ein Prozess einen <b>Review-Termin</b> (Fälligkeiten → Prozesse)
      und die Angabe, <b>wer ihn freigibt</b>. Ein Prozess ist ein <b>BPMN-Modell</b> 🔀, auch ohne Landkarte,
      oder eine <b>Kachel</b> 🗺, die noch kein Modell hat. Der <b>Prozesseigner</b> verantwortet den Prozess konzernweit,
      der <b>Standardisierungsgrad</b> sagt, ob er in allen Werken gleich laufen muss. Was am Modell leer bleibt, gilt von
      seiner Kachel, und dort von der gleichnamigen Kachel der Konzern-Landkarte. Ab der Freigabe braucht ein Prozess
      mindestens eine <b>Kennzahl</b> (ISO 9001, 4.4) und einen bewerteten <b>Reifegrad</b> (ISO/IEC 33020).
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
      ${kz.modelle ? kpi(kz.mitFreigeber, kz.modelle, 'Modelle mit Freigeber', kz.mitFreigeber < kz.modelle) : ''}
      ${kz.eol ? kpi(kz.eolMitSoll, kz.eol, 'abgelöste IST mit SOLL verknüpft', kz.eolMitSoll < kz.eol) : ''}
      ${pocs.length ? kpi(pocMitKriterien, pocs.length, 'POC mit Erfolgskriterien', pocMitKriterien < pocs.length) : ''}
      ${kpi(kz.ueberfaellig + kz.ohneTermin, null, 'Review überfällig oder ohne Termin', kz.ueberfaellig + kz.ohneTermin > 0)}
      ${kz.mitKennzahl !== undefined ? `
      ${kpi(kz.mitKennzahl, kz.gesamt, 'mit Kennzahlen')}
      ${kpi(kz.kennzahlVerfehlt, null, 'Kennzahl verfehlt', kz.kennzahlVerfehlt > 0)}
      ${kpi(kz.reifegradBewertet, kz.gesamt, 'Reifegrad bewertet')}` : ''}
    </div>
    ${!werke.length
      ? (typeof emptyState === 'function' ? emptyState('Noch keine Landkarte angelegt.', '🗺') : '')
      : `<div class="pb-brett">${PZ_SPALTEN.map(s => _pbSpalteHtml(s, spalten[s.key], schreiben,
          s.key === 'ist' ? istVerborgen : 0)).join('')}</div>`}`;
}

/** Eine Spalte. In der IST-Erfassung steht unter dem IST, was abgelöst wird (EOL). */
function _pbSpalteHtml(status, liste, schreiben, verborgen) {
  const unter = PZ_STATUS.filter(s => s.phase === status.key);
  const eigen = liste.filter(e => !unter.some(s => s.key === e.status));
  const titel = [status.text].concat(unter.map(s => s.label + ': ' + s.text)).join('\n');
  return `<div class="pb-spalte" style="--pb-c:${status.farbe}">
      <div class="pb-spalte-kopf" title="${esc(titel)}"><span>${esc(status.spalte || status.label)}</span><i>${liste.length}</i></div>
      <div class="pb-spalte-inhalt">
        ${eigen.length ? eigen.map(e => _pbKarteHtml(e, schreiben)).join('')
          : (verborgen || !liste.length) ? `<div class="field-hint" style="padding:8px 4px">${status.key === 'ist' && verborgen ? 'Noch nichts priorisiert.' : 'Leer.'}</div>` : ''}
        ${verborgen ? `<button class="btn btn-ghost btn-sm" style="width:100%" onclick="pbIstAlleZeigen(true)"
          title="Erfasste, aber nicht priorisierte Prozesse zeigen">+ ${verborgen} ohne Priorität</button>` : ''}
        ${unter.map(s => {
          const teil = liste.filter(e => e.status === s.key);
          return teil.length ? `<div class="pb-unterkopf" style="--pb-c:${s.farbe}" title="${esc(s.text)}"><span>↪ wird abgelöst (${esc(s.kurz)})</span><i>${teil.length}</i></div>
            ${teil.map(e => _pbKarteHtml(e, schreiben)).join('')}` : '';
        }).join('')}
      </div>
    </div>`;
}

function _pbKarteHtml(e, schreiben) {
  const k = e.kachel;
  const prio = pzPrioInfo(e.prio);
  const std = pzStandardInfo(e.standard.key);
  const p = e.pruefung;
  const werkLabel = (typeof lkWerkLabel === 'function') ? lkWerkLabel(e.werk) : e.werk;
  const pruefText = (p.stufe === 'fehlt' ? '⏰ Überprüfung fehlt'
    : p.stufe === 'ueberfaellig' ? `⏰ seit ${-p.tage} Tag${p.tage === -1 ? '' : 'en'} fällig`
    : p.datum ? `🔎 ${p.datum.split('-').reverse().join('.')}` : '') + (p.ueber && (p.stufe || p.datum) ? ` über ${p.ueber.name}` : '');
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
      ${modell ? _pbFreigabeHtml(e) : ''}
      ${modell ? _pbAbloesungHtml(e, schreiben) : ''}
      ${modell ? _pbPocHtml(e, schreiben) : ''}
      ${pruefText ? `<div class="pb-karte-pruefung"${pruefFarbe ? ` style="color:${pruefFarbe}"` : ''}>${esc(pruefText)}</div>` : ''}
      ${_pbReifeHtml(e)}
      ${schreiben && modell ? `<button type="button" class="pb-angaben" onclick="pbAngabenDialog(${jsArg(k.id)})"
          title="Prozesseigner, Freigeber, Review-Termin und Nachfolger eintragen">✎ Angaben</button>` : ''}
      ${schreiben ? `<select class="pb-status" aria-label="Status von ${esc(k.name)}"
          onchange="${modell ? `pbModellStatusSetzen(${jsArg(k.id)},this.value)` : `pbStatusSetzen(${jsArg(e.werk)},${jsArg(k.id)},this.value)`}">
          ${PZ_STATUS.filter(s => modell || s.key !== 'eol' || s.key === e.status)
            .map(s => `<option value="${s.key}"${s.key === e.status ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>` : ''}
    </div>`;
}

/** Reifegrad, Kennzahlen und was einem freigegebenen Prozess davon noch fehlt. */
function _pbReifeHtml(e) {
  if (typeof pzLuecken !== 'function' || !e.kennzahlen) return '';
  const rg = pzReifegradInfo(e.reifegrad.key);
  const s = pzKpiStand(e.kennzahlen.liste);
  const teile = [];
  if (rg) teile.push(`<span title="Reifegrad nach ISO/IEC 33020${e.reifegrad.geerbt ? ' (von der Kachel)' : ''}: ${esc(rg.text)}">${esc(rg.kurz)}</span>`);
  if (s.gesamt) {
    const titel = e.kennzahlen.liste.map(pzKpiText).join('\n') + (e.kennzahlen.geerbt ? '\n(Vorgabe, hier noch nicht gemessen)' : '');
    teile.push(`<span title="${esc(titel)}"${s.verfehlt ? ' style="color:#b91c1c"' : ''}>📊 ${s.erfuellt}/${s.gesamt} im Ziel${e.kennzahlen.geerbt ? ' ↑' : ''}</span>`);
  }
  const luecken = pzLuecken(e);
  if (luecken.length) teile.push(`<span style="color:#b45309">⚠ ${esc(luecken.join(', '))}</span>`);
  return teile.length ? `<div class="pb-karte-pruefung">${teile.join(' · ')}</div>` : '';
}

/**
 * Wer gibt frei? Ein Hauptprozess wird über ein Regelwerk freigegeben
 * (js/prozessfreigabe.js): Gibt es das, stehen sein Status und seine Freigeber
 * da. Sonst der am Modell eingetragene Freigeber, und fehlt der ab dem SOLL,
 * steht die Frage offen da. Unter- und Nebenprozesse gehen über ihren Hauptprozess.
 */
function _pbFreigabeHtml(e) {
  if (e.status === 'eol') return '';
  const id = e.kachel.id;
  if (typeof pfIstHauptprozess === 'function' && !pfIstHauptprozess(id)) {
    return typeof pfUeberHtml === 'function' ? `<div class="pb-karte-person">${pfUeberHtml(id)}</div>` : '';
  }
  const rw = (typeof pfRegelwerkVon === 'function') ? pfRegelwerkVon(id) : null;
  if (rw) {
    const wer = (typeof getPolicyGeschaeftsleitung === 'function') ? getPolicyGeschaeftsleitung(rw) : [];
    return `<div class="pb-karte-person">📋 <a href="#" onclick="event.preventDefault();pfRegelwerkOeffnen(${jsArg(rw.id)})"
        title="Regelwerk der Freigabe öffnen">${typeof workflowBadge === 'function' ? workflowBadge(rw.status) : esc(rw.status)}</a>
      Freigabe: ${esc(wer.length ? wer.map(_pbPerson).join(', ') : 'Geschäftsleitung')}</div>`;
  }
  if (e.freigeber) return `<div class="pb-karte-person">✅ Freigabe durch ${esc(_pbPerson(e.freigeber))}</div>`;
  return e.status === 'ist' ? '' : '<div class="pb-karte-person" style="color:#b45309">✅ wer gibt frei? offen</div>';
}

/** Alle Modelle als Einträge, ungefiltert: Das SOLL zu einem IST kann in einer anderen Ablage liegen. */
function _pbModellEintraege() {
  const daten = (typeof _lkDaten !== 'undefined') ? _lkDaten : null;
  return pzModellEintraege(daten, pbModelle());
}

/** Die Stufe eines verknüpften Modells als Etikett: SOLL in Arbeit, POC läuft … */
function _pbStufeHtml(x) {
  const s = pzStatusInfo(x.status);
  return `<span class="pb-tag" style="color:${s.farbe};border-color:${s.farbe}" title="${esc(s.text)}">${esc(s.label)}</span>`;
}

/**
 * IST und SOLL: Das IST in EOL nennt das SOLL-Modell, das es ablöst, mit dessen
 * Stand; fehlt die Verknüpfung, steht das rot da. Das SOLL nennt, welches IST
 * es ablöst.
 */
function _pbAbloesungHtml(e, schreiben) {
  const link = (id, t) => `<a href="#" onclick="event.preventDefault();pbModellOeffnen(${jsArg(id)})">${esc(t)}</a>`;
  const ab = pzAbloesung(_pbModellEintraege(), e.kachel.id);
  if (e.status === 'eol') {
    if (ab.nachfolger) {
      const poc = _pbPocVon(ab.nachfolger);
      return `<div class="pb-karte-person" title="Das SOLL-Modell, das diesen Ablauf ablöst, und wie weit es ist">↪ abgelöst durch ${
        link(ab.nachfolger.kachel.id, ab.nachfolger.kachel.name)} ${_pbStufeHtml(ab.nachfolger)}</div>${poc
        ? `<div class="pb-karte-person pb-poc" title="Der POC dieses SOLL">🧪 POC: ${esc(pzPocKurz(poc.poc))}</div>` : ''}`;
    }
    return `<div class="pb-karte-person" style="color:#b91c1c">↪ kein SOLL-Prozess verknüpft${schreiben
      ? ` · <a href="#" onclick="event.preventDefault();pbAngabenDialog(${jsArg(e.kachel.id)})">verknüpfen</a>` : ''}</div>`;
  }
  return ab.vorgaenger.length ? `<div class="pb-karte-person" title="Diese IST-Abläufe laufen aus, wenn dieser Prozess ausgerollt ist">↩ löst ab: ${
    ab.vorgaenger.map(x => link(x.kachel.id, x.kachel.name)).join(', ')} <span class="pb-tag">IST</span></div>` : '';
}

/** Hauptprozess? Ohne Gliederung (Modul nicht geladen) gilt jedes Modell als einer. */
function _pbIstHaupt(id) {
  return typeof pfIstHauptprozess !== 'function' || pfIstHauptprozess(id);
}

/**
 * Der POC, der für ein Modell gilt: am Hauptprozess der eigene, an einem Unter-
 * oder Nebenprozess der seines Hauptprozesses. → { eintrag, poc, ueber } | null
 */
function _pbPocVon(e) {
  if (_pbIstHaupt(e.kachel.id)) return pzPocLeer(e.poc) ? null : { eintrag: e, poc: e.poc, ueber: null };
  const haupt = (typeof pfHauptprozesseVon === 'function') ? pfHauptprozesseVon(e.kachel.id) : [];
  const alle = _pbModellEintraege();
  for (const h of haupt) {
    const x = alle.find(y => String(y.kachel.id) === String(h));
    if (x && !pzPocLeer(x.poc)) return { eintrag: x, poc: x.poc, ueber: x };
  }
  return null;
}

/** Die POC-Zeile einer Karte: Stand, Ergebnis und was dem laufenden POC fehlt. */
function _pbPocHtml(e, schreiben) {
  if (e.status === 'ist' || e.status === 'eol') return '';
  const x = _pbPocVon(e);
  const haupt = _pbIstHaupt(e.kachel.id);
  const luecken = haupt ? pzPocLuecken(e.status, e.poc) : [];
  if (!x && !luecken.length) return '';
  const erg = x ? pzPocErgebnisInfo(x.poc.ergebnis) : null;
  const titel = x ? x.poc.kriterien.map(k => `${pzPocBewertungInfo(k.bewertung).zeichen} ${k.text}`).join('\n') : '';
  const zeile = x ? `<div class="pb-karte-person pb-poc" title="${esc(titel || 'Noch keine Erfolgskriterien')}">🧪 POC${x.ueber
      ? ` über <a href="#" onclick="event.preventDefault();pbModellOeffnen(${jsArg(x.ueber.kachel.id)})">${esc(x.ueber.kachel.name)}</a>` : ''}: ${
      esc(pzPocKurz(x.poc).replace(/ · [^·]+$/, ''))} <span class="pb-tag" style="color:${erg.farbe};border-color:${erg.farbe}">${esc(erg.label)}</span></div>` : '';
  const fehlt = luecken.length ? `<div class="pb-karte-person" style="color:#b45309">🧪 ${esc(luecken.join(', '))}${schreiben
      ? ` · <a href="#" onclick="event.preventDefault();pbAngabenDialog(${jsArg(e.kachel.id)})">eintragen</a>` : ''}</div>` : '';
  return zeile + fehlt;
}

/** Die Auswahl des SOLL-Prozesses: zuerst, was ab dem SOLL steht, dann der Rest. */
function _pbNachfolgerOptionen(eigeneId, gewaehlt) {
  const k = pzNachfolgerKandidaten(_pbModellEintraege(), eigeneId);
  const werk = (x) => (x.werk ? ' (' + ((typeof lkWerkLabel === 'function') ? lkWerkLabel(x.werk) : x.werk) + ')' : '');
  const opt = (x) => `<option value="${esc(x.kachel.id)}"${String(x.kachel.id) === String(gewaehlt) ? ' selected' : ''}>${
    esc(x.kachel.name + werk(x) + ' · ' + pzStatusInfo(x.status).kurz)}</option>`;
  return `${k.passend.length ? `<optgroup label="SOLL, POC und weiter">${k.passend.map(opt).join('')}</optgroup>` : ''}
    ${k.weitere.length ? `<optgroup label="Weitere Modelle (noch als IST geführt)">${k.weitere.map(opt).join('')}</optgroup>` : ''}`;
}

/* ── Angaben am Modell ──
   Prozesseigner, Freigeber, Review-Termin und Nachfolger direkt im Backlog
   setzen, ohne den Modeler zu öffnen. Geschrieben wird wie beim Status in die
   .bpmn-Datei (procXmlDokuNeu): Regelwerke, Anlagen, Gliederung und
   Beschreibung bleiben stehen. */

/** `status` gibt eine Stufe vor: Wer an der Karte EOL wählt, landet hier, um das SOLL zu verknüpfen. */
function pbAngabenDialog(itemId, status) {
  if (typeof lkDarfSchreiben === 'function' && !lkDarfSchreiben()) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const p = (typeof procModellVon === 'function') ? procModellVon(itemId) : null;
  if (!p) { toast('Modell nicht gefunden – bitte neu laden.', 'error'); return; }
  const e = (typeof procEintragVon === 'function') ? procEintragVon(p) : null;
  const pm = pzPmNormal((e && e.m) || {});
  if (status) pm.status = status;
  const sel = (a, b) => (a === b ? ' selected' : '');
  const haupt = _pbIstHaupt(p.itemId);
  const ueber = haupt ? [] : ((typeof pfHauptprozesseVon === 'function') ? pfHauptprozesseVon(p.itemId) : [])
    .map(h => (procModellVon(h) || {}).title).filter(Boolean);
  _pbKriterien = pm.poc.kriterien.map(k => Object.assign({}, k));
  openModal(`
    <div class="modal-header"><h3>✎ Angaben: ${esc(p.title)}</h3>
      <button class="modal-close" onclick="closeModal()" aria-label="Schließen">×</button></div>
    <div class="modal-body">
      <div class="field-hint" style="margin:0 0 12px">Gespeichert in der BPMN-Datei des Modells, wie im Prozess-Editor. Reifegrad und Kennzahlen bleiben, wie sie sind.</div>
      <div class="form-grid">
        <div class="form-group"><label for="pb-a-status">Status</label>
          <select id="pb-a-status" onchange="pbAngabenStatus(this.value)">
            <option value=""${sel('', pm.status)}>wie Kachel oder Vorgabe</option>
            ${PZ_STATUS.map(s => `<option value="${s.key}"${sel(s.key, pm.status)}>${esc(s.label)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label for="pb-a-prio">Priorität</label>
          <select id="pb-a-prio"><option value=""${sel('', pm.prioritaet)}>nicht priorisiert</option>
            ${PZ_PRIO.map(x => `<option value="${x.key}"${sel(x.key, pm.prioritaet)}>${esc(x.label)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label for="pb-a-eigner">Prozesseigner</label>
          <input type="text" id="pb-a-eigner" list="pb-people" value="${esc(pm.prozesseigner)}" placeholder="name@dihag.com">
          <span class="field-hint">Verantwortet den Prozess konzernweit.</span></div>
        <div class="form-group"><label for="pb-a-freigeber">Freigabe durch</label>
          <input type="text" id="pb-a-freigeber" list="pb-people" value="${esc(pm.freigeber)}" placeholder="name@dihag.com">
          <span class="field-hint">Wer den Prozess freigibt. Bei „📋 Zur Freigabe" wird sie oder er Freigeber des Regelwerks.</span></div>
        <div class="form-group"><label for="pb-a-termin">Review (nächste Überprüfung)</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="date" id="pb-a-termin" value="${esc(pm.naechsteUeberpruefung)}" style="flex:1">
            <button type="button" class="btn btn-ghost btn-sm" onclick="pbAngabenTermin()" title="Auf heute + ${PZ_UEBERPRUEFUNG_MONATE} Monate setzen">+${PZ_UEBERPRUEFUNG_MONATE} Mon.</button>
          </div>
          <span class="field-hint">Im POC der Termin seiner Bewertung. Steht in Fälligkeiten → Prozesse.</span></div>
        <div class="form-group" id="pb-a-nachfolger-zeile" style="${pm.status === 'eol' ? '' : 'display:none'}"><label for="pb-a-nachfolger">Abgelöst durch (SOLL-Prozess) *</label>
          <select id="pb-a-nachfolger"><option value="">SOLL-Prozess wählen …</option>
            ${_pbNachfolgerOptionen(p.itemId, pm.nachfolger)}
          </select>
          <span class="field-hint">Pflicht bei EOL. Das IST bleibt in der IST-Erfassung und zeigt, wie weit dieses SOLL ist (SOLL, POC, freigegeben).</span></div>
      </div>
      <fieldset id="pb-a-poc" class="pb-poc-feld" style="${_pbPocSichtbar(pm.status, pm.poc) ? '' : 'display:none'}">
        <legend>🧪 POC für dieses SOLL</legend>
        ${haupt ? `
        <div class="form-grid">
          <div class="form-group"><label for="pb-a-poc-werke">Pilotwerk(e)</label>
            <input type="text" id="pb-a-poc-werke" value="${esc(pm.poc.werke.join(', '))}" placeholder="z. B. WGC, SHB"></div>
          <div class="form-group"><label for="pb-a-poc-verantwortlich">Verantwortlich für den POC</label>
            <input type="text" id="pb-a-poc-verantwortlich" list="pb-people" value="${esc(pm.poc.verantwortlich)}" placeholder="name@dihag.com"></div>
          <div class="form-group"><label for="pb-a-poc-start">Beginn</label>
            <input type="date" id="pb-a-poc-start" value="${esc(pm.poc.start)}"></div>
          <div class="form-group"><label for="pb-a-poc-ende">Ende</label>
            <input type="date" id="pb-a-poc-ende" value="${esc(pm.poc.ende)}"></div>
          <div class="form-group"><label for="pb-a-poc-ergebnis">Ergebnis</label>
            <select id="pb-a-poc-ergebnis">${PZ_POC_ERGEBNIS.map(x => `<option value="${x.key}"${sel(x.key, pm.poc.ergebnis)}>${esc(x.label)}</option>`).join('')}</select>
            <span class="field-hint">Bewertet wird am Review-Termin oben.</span></div>
        </div>
        <label class="field-hint" style="display:block;margin:8px 0 4px">Erfolgskriterien (stehen vor dem POC fest)</label>
        <div id="pb-a-poc-krit">${_pbKriterienHtml()}</div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="pbKriteriumNeu()">+ Erfolgskriterium</button>`
        : `<div class="field-hint">Der POC wird am Hauptprozess geführt${ueber.length ? `: <b>${esc(ueber.join(', '))}</b>` : ''}. Unter- und Nebenprozesse laufen mit.</div>`}
      </fieldset>
      <datalist id="pb-people">${(typeof _lkPeopleOptions === 'function') ? _lkPeopleOptions() : ''}</datalist>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" id="pb-a-speichern" onclick="pbAngabenSpeichern(${jsArg(itemId)})">Speichern</button>
    </div>`);
  if (typeof lkMitgliederLaden === 'function') lkMitgliederLaden();
}

function pbAngabenStatus(status) {
  const z = document.getElementById('pb-a-nachfolger-zeile');
  if (z) z.style.display = status === 'eol' ? '' : 'none';
  const poc = document.getElementById('pb-a-poc');
  if (poc) poc.style.display = _pbPocSichtbar(status, _pbPocFormular() || {}) ? '' : 'none';
}

/** Den POC-Teil zeigen: ab dem SOLL, oder wenn schon etwas eingetragen ist. */
function _pbPocSichtbar(status, poc) {
  return PZ_NACHFOLGER_STUFEN.includes(status) || !pzPocLeer(poc);
}

/* Erfolgskriterien im Dialog: eine Liste, die beim Tippen mitgeschrieben wird. */
let _pbKriterien = [];

function _pbKriterienHtml() {
  if (!_pbKriterien.length) return '<div class="field-hint" style="margin-bottom:4px">Noch keine. Ohne Erfolgskriterien ist der POC eine Lücke.</div>';
  return _pbKriterien.map((k, i) => `<div class="pb-krit">
      <input type="text" value="${esc(k.text)}" aria-label="Erfolgskriterium ${i + 1}" placeholder="z. B. 95 % der Rechnungen automatisch erkannt"
        oninput="pbKriteriumSetzen(${i},'text',this.value)">
      <select aria-label="Bewertung" onchange="pbKriteriumSetzen(${i},'bewertung',this.value)">${PZ_POC_BEWERTUNG.map(b =>
        `<option value="${b.key}"${b.key === k.bewertung ? ' selected' : ''}>${b.zeichen} ${esc(b.label)}</option>`).join('')}</select>
      <button type="button" class="btn btn-ghost btn-sm" onclick="pbKriteriumWeg(${i})" aria-label="Kriterium entfernen" title="Entfernen">✕</button>
    </div>`).join('');
}

function _pbKriterienZeigen() {
  const c = document.getElementById('pb-a-poc-krit');
  if (c) c.innerHTML = _pbKriterienHtml();
}

function pbKriteriumNeu() {
  _pbKriterien.push({ text: '', bewertung: '' });
  _pbKriterienZeigen();
  const felder = document.querySelectorAll('#pb-a-poc-krit input');
  if (felder.length) felder[felder.length - 1].focus();
}

function pbKriteriumSetzen(i, feld, wert) {
  if (_pbKriterien[i]) _pbKriterien[i][feld] = String(wert || '');
}

function pbKriteriumWeg(i) {
  _pbKriterien.splice(i, 1);
  _pbKriterienZeigen();
}

/** Der POC aus dem Dialog (null, wenn der Dialog keine POC-Felder hat). */
function _pbPocFormular() {
  if (!document.getElementById('pb-a-poc-werke')) return null;
  const wert = (id) => String((document.getElementById(id) || {}).value || '').trim();
  return pzPocNormal({
    werke: wert('pb-a-poc-werke'), start: wert('pb-a-poc-start'), ende: wert('pb-a-poc-ende'),
    verantwortlich: wert('pb-a-poc-verantwortlich'), ergebnis: wert('pb-a-poc-ergebnis'), kriterien: _pbKriterien,
  });
}

function pbAngabenTermin() {
  const f = document.getElementById('pb-a-termin');
  if (f && typeof pzTerminVorschlag === 'function') f.value = pzTerminVorschlag();
}

async function pbAngabenSpeichern(itemId) {
  if (typeof lkDarfSchreiben === 'function' && !lkDarfSchreiben()) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return; }
  const p = (typeof procModellVon === 'function') ? procModellVon(itemId) : null;
  if (!p || typeof spGetProcessXml !== 'function' || typeof procXmlDokuNeu !== 'function') { toast('Modell nicht gefunden – bitte neu laden.', 'error'); return; }
  const wert = (id) => String((document.getElementById(id) || {}).value || '').trim();
  const knopf = document.getElementById('pb-a-speichern');
  if (knopf) knopf.disabled = true;
  try {
    const xml = await spGetProcessXml(itemId);
    // Von der Datei ausgehen, nicht vom Cache: Reifegrad und Kennzahlen bleiben.
    const pm = procPmAusXml(xml) || pzPmNormal({});
    pm.status = wert('pb-a-status');
    pm.prioritaet = wert('pb-a-prio');
    pm.prozesseigner = wert('pb-a-eigner');
    pm.freigeber = wert('pb-a-freigeber');
    pm.naechsteUeberpruefung = wert('pb-a-termin');
    pm.nachfolger = pm.status === 'eol' ? wert('pb-a-nachfolger') : '';
    // Der POC kommt aus dem Dialog, wenn er dort steht; sonst bleibt der aus der Datei.
    const poc = _pbPocFormular();
    if (poc) pm.poc = poc;
    if (poc && poc.start && poc.ende && poc.ende < poc.start) {
      toast('Das Ende des POC liegt vor seinem Beginn.', 'error');
      if (knopf) knopf.disabled = false;
      return;
    }
    if (pm.status === 'eol' && !pm.nachfolger) {
      toast('Ein IST, das abgelöst wird, braucht seinen SOLL-Prozess. Bitte unter „Abgelöst durch" wählen.', 'error');
      if (knopf) knopf.disabled = false;
      return;
    }
    // Wer freigibt oder ausrollt, bekommt einen Termin, wie beim Status an der Karte.
    if (['freigegeben', 'ausgerollt'].includes(pm.status) && !pm.naechsteUeberpruefung) pm.naechsteUeberpruefung = pzTerminVorschlag();
    const neu = procXmlDokuNeu(xml, { pm: pzPmNormal(pm) });
    await spSaveProcess(p.title, neu, p.ordner || '');
    try { _processes = await spListProcesses(); } catch (e) { /* dann mit der alten Liste */ }
    const q = procModellVon(itemId);
    if (q && typeof procLinksMerken === 'function') procLinksMerken(q.itemId + '|' + q.modified, procEintragAusXml(neu));
    closeModal();
    toast(`${p.title}: Angaben gespeichert ✓`, 'success');
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
    if (knopf) knopf.disabled = false;
    return;
  }
  renderProzessBacklog();
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
  // EOL nur mit dem SOLL, das ablöst: Dafür geht es über die Angaben.
  if (status === 'eol') { renderProzessBacklog(); pbAngabenDialog(itemId, 'eol'); return; }
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
  module.exports = { pbEintraege, pbModelle, _pbFreigabeHtml, _pbAbloesungHtml, _pbNachfolgerOptionen, _pbSpalteHtml, _pbPocHtml, _pbPocVon };
}
