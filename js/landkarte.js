'use strict';

/**
 * Prozesslandkarte – Ansicht „🗺 Landkarte" im Reiter Prozesse
 * ============================================================
 * Die Prozesslandschaft des Konzerns als anklickbare Karte: Führungs-,
 * Kern- und Unterstützungsprozesse in der gewohnten Darstellung. Jede Kachel
 * kennt ihren <b>Geltungsbereich</b> (Standorte) und – wo vorhanden – ihr
 * <b>BPMN-Modell</b>. Ein Klick führt von der Übersicht ins Modell und von dort
 * weiter zu den Regelwerken, die daran hängen.
 *
 * Drei Entscheidungen, die den Aufwand klein halten:
 *
 *  1. Die Karte liegt als `prozesslandkarte.json` im Konfig-Ordner – dieselbe
 *     Mechanik wie die Governance-Struktur. Keine neue SharePoint-Liste, keine
 *     neue Spalte, kein Administrationsaufwand.
 *  2. Die Verknüpfung Prozess → Regelwerk wird NICHT hier gespeichert. Sie
 *     steht längst im BPMN-XML (Marker `[[rms:policies=…]]`). Die Kachel merkt
 *     sich nur, welches Modell zu ihr gehört – eine Wahrheit, nicht zwei.
 *  3. Der Geltungsbereich nutzt dieselbe Auswahl wie Regelwerke
 *     (`renderGeltungsbereichSection`) und dasselbe Vokabular (STANDORTE,
 *     'ALLE'). Damit lässt sich fragen: „Welche Prozesse gelten in SHB?" –
 *     und die Antwort passt zu der, die die Regelwerke geben.
 */

/* ── Startbestand: die Prozesslandschaft, wie sie heute abgestimmt ist ── */
const LK_START = {
  baender: [
    { key: 'fuehrung',       titel: 'Führungsprozesse' },
    { key: 'kern',           titel: 'Kernprozesse' },
    { key: 'unterstuetzung', titel: 'Unterstützungsprozesse' },
  ],
  ergebnisse: ['Aufträge', 'Produkte', 'Einnahmen'],
  kacheln: [
    { id: 'strategie',     band: 'fuehrung', name: 'Strategie', unter: '' },
    { id: 'projekte',      band: 'fuehrung', name: 'Programm- und Projektmanagement', unter: 'Changemanagement' },
    { id: 'steuern',       band: 'fuehrung', name: 'Unternehmen steuern', unter: '' },
    { id: 'governance',    band: 'fuehrung', name: 'Corporate Governance', unter: 'Prozessmanagement' },
    { id: 'orgentwicklung',band: 'fuehrung', name: 'Organisations- und Mitarbeiterentwicklung', unter: '' },

    { id: 'vertrieb',      band: 'kern', name: 'Vertrieb', unter: 'Gießdienstleistungen vermarkten · CRM' },
    { id: 'produktion',    band: 'kern', name: 'Produktion', unter: 'Produkte herstellen' },
    { id: 'auftraege',     band: 'kern', name: 'Aufträge abwickeln', unter: 'Versand / Faktura' },

    { id: 'compliance',    band: 'unterstuetzung', name: 'Compliance', unter: 'Datenschutz · Legal' },
    { id: 'buchhaltung',   band: 'unterstuetzung', name: 'Buchhaltung', unter: '' },
    { id: 'controlling',   band: 'unterstuetzung', name: 'Controlling', unter: '' },
    { id: 'personal',      band: 'unterstuetzung', name: 'Personal', unter: '' },
    { id: 'beschaffung',   band: 'unterstuetzung', name: 'Beschaffung', unter: '' },
    { id: 'it',            band: 'unterstuetzung', name: 'IT', unter: '' },
    { id: 'instandhaltung',band: 'unterstuetzung', name: 'Instandhaltung', unter: '' },
    { id: 'avor',          band: 'unterstuetzung', name: 'Arbeitsvorbereitung', unter: '' },
    { id: 'qs',            band: 'unterstuetzung', name: 'Qualitätssicherung', unter: '' },
  ],
};

let _lkDaten = null;         // Arbeitsstand (aus SharePoint oder Startbestand)
let _lkGeaendertAm = '';     // Zeitstempel der geladenen Datei (Gleichzeitigkeit)
let _lkGeladen = false;
let _lkFilter = '';          // Standort-Filter ('' = alle)
let _lkEditing = null;       // Kachel im Bearbeiten-Dialog
let _lkZiehIndex = -1;       // laufendes Ziehen

/** Tiefe Kopie des Startbestands – nie die Konstante verändern. */
function lkStartbestand() { return JSON.parse(JSON.stringify(LK_START)); }

function lkBaender()    { return (_lkDaten && Array.isArray(_lkDaten.baender) && _lkDaten.baender.length) ? _lkDaten.baender : LK_START.baender; }
function lkKacheln()    { return (_lkDaten && Array.isArray(_lkDaten.kacheln)) ? _lkDaten.kacheln : []; }
function lkErgebnisse() { return (_lkDaten && Array.isArray(_lkDaten.ergebnisse)) ? _lkDaten.ergebnisse : LK_START.ergebnisse; }
function lkDatenGeladen() { return _lkGeladen; }

/** Darf die Karte bearbeitet werden? Wer den Reiter schreiben darf, darf es. */
function lkDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('prozesse'); }

/** Gilt die Kachel am gewählten Standort? Ohne Filter gilt alles. */
function lkGiltDort(k, standort) {
  if (!standort) return true;
  const g = Array.isArray(k.geltung) ? k.geltung : [];
  if (!g.length || g.includes('ALLE')) return true;   // ungepflegt = konzernweit
  return g.includes(standort);
}

/** Kachel → verknüpftes Modell aus der geladenen Prozessliste (id zuerst, sonst Name). */
function lkProzessVon(k) {
  const alle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  if (k.prozessId) {
    const t = alle.find(p => p.itemId === k.prozessId);
    if (t) return t;
  }
  const n = String(k.prozessName || '').trim().toLowerCase();
  return n ? alle.find(p => (p.title || '').trim().toLowerCase() === n) || null : null;
}

/* ── Laden und Speichern ─────────────────────────────────────────────── */

async function lkDatenLaden() {
  if (_lkGeladen) return _lkDaten;
  try {
    const gespeichert = (typeof spLoadLandkarte === 'function') ? await spLoadLandkarte() : null;
    if (gespeichert && gespeichert.daten) {
      const d = gespeichert.daten;
      _lkDaten = {
        baender:    (Array.isArray(d.baender) && d.baender.length) ? d.baender : lkStartbestand().baender,
        ergebnisse: Array.isArray(d.ergebnisse) ? d.ergebnisse : lkStartbestand().ergebnisse,
        kacheln:    Array.isArray(d.kacheln) ? d.kacheln : lkStartbestand().kacheln,
        historie:   Array.isArray(d.historie) ? d.historie : [],
      };
      _lkGeaendertAm = gespeichert.geaendertAm || '';
    } else {
      _lkDaten = lkStartbestand();
      _lkDaten.historie = [];
      _lkGeaendertAm = '';
    }
  } catch (e) {
    console.warn('[landkarte] Laden fehlgeschlagen, Startbestand gilt:', e.message);
    _lkDaten = lkStartbestand();
    _lkDaten.historie = [];
  }
  _lkGeladen = true;
  return _lkDaten;
}

/** Eintrag in den Versionsverlauf (wer, wann, was). */
function _lkVerlauf(was) {
  if (!_lkDaten) return;
  if (!Array.isArray(_lkDaten.historie)) _lkDaten.historie = [];
  const u = (typeof State !== 'undefined' && State.user) ? State.user : {};
  _lkDaten.historie.push({ datum: new Date().toISOString(), name: u.name || u.upn || '', was });
  if (_lkDaten.historie.length > 100) _lkDaten.historie = _lkDaten.historie.slice(-100);
}

/**
 * Speichern mit Gleichzeitigkeits-Prüfung: Hat jemand anders die Karte
 * inzwischen geändert, wird nichts überschrieben.
 */
async function lkSpeichern(meldung, was) {
  if (!lkDarfSchreiben()) { toast('Nur Lesezugriff auf „Prozesse".', 'error'); return false; }
  try {
    if (typeof spLandkarteMeta === 'function') {
      const jetzt = await spLandkarteMeta();
      if (jetzt && _lkGeaendertAm && jetzt !== _lkGeaendertAm) {
        toast('Die Landkarte wurde zwischenzeitlich von jemand anderem geändert – bitte neu laden.', 'error');
        return false;
      }
    }
    if (was) _lkVerlauf(was);
    _lkGeaendertAm = await spSaveLandkarte(_lkDaten);
    if (meldung) toast(meldung, 'success');
    renderLandkarte();
    return true;
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
    return false;
  }
}

/* ── Ansicht ─────────────────────────────────────────────────────────── */

async function initLandkarte() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  if (!_lkGeladen) {
    mount.innerHTML = '<div class="doc-loading">Lade Prozesslandkarte …</div>';
    await lkDatenLaden();
  }
  renderLandkarte();
}

function renderLandkarte() {
  const mount = document.getElementById('prozesse-mount');
  if (!mount) return;
  const schreiben = lkDarfSchreiben();
  const kacheln = lkKacheln();
  const mitModell = kacheln.filter(k => lkProzessVon(k)).length;
  const stand = (_lkDaten && Array.isArray(_lkDaten.historie) && _lkDaten.historie.length)
    ? _lkDaten.historie[_lkDaten.historie.length - 1] : null;

  const standorte = (typeof STANDORTE !== 'undefined') ? STANDORTE : [];
  mount.innerHTML = `
    ${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('karte') : ''}
    <div class="view-desc" style="margin:0 0 12px">
      Die Prozesslandschaft des Konzerns. Ein Klick auf eine Kachel zeigt Geltungsbereich,
      das hinterlegte <b>BPMN-Modell</b> und die daran hängenden Regelwerke.
      <b>${mitModell}</b> von <b>${kacheln.length}</b> Prozessen sind modelliert.
    </div>
    <div class="view-toolbar">
      <label class="field-hint" style="margin:0 6px 0 0">Standort</label>
      <select id="lk-filter" onchange="lkSetFilter(this.value)" style="max-width:190px">
        <option value="">Alle Standorte</option>
        ${standorte.map(s => `<option value="${esc(s)}"${_lkFilter === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <div class="toolbar-spacer"></div>
      ${stand ? `<button class="btn btn-ghost btn-sm" onclick="lkVerlaufZeigen()" title="Versionsverlauf">
        🕘 ${esc(stand.name || '–')}${stand.datum && typeof fmtDate === 'function' ? ' · ' + esc(fmtDate(stand.datum)) : ''}</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="lkNeuLaden()" title="Aktualisieren">↻ Aktualisieren</button>
      ${schreiben ? `<button class="btn btn-outline btn-sm" onclick="lkKachelNeu()">+ Prozess</button>` : ''}
    </div>
    ${_lkFilter ? `<div class="field-hint" style="margin:0 0 10px">Prozesse, die am Standort <b>${esc(_lkFilter)}</b>
      nicht gelten, sind ausgegraut – die Landschaft bleibt dadurch vergleichbar.</div>` : ''}
    <div class="lk-karte">
      ${_lkBandHtml('fuehrung', schreiben)}
      ${_lkKernHtml(schreiben)}
      ${_lkBandHtml('unterstuetzung', schreiben)}
    </div>
    <div class="lk-legende">
      <span><i class="lk-punkt lk-punkt-modell"></i> Modell hinterlegt</span>
      <span><i class="lk-punkt lk-punkt-offen"></i> noch kein Modell</span>
      ${schreiben ? '<span>Kacheln lassen sich zwischen den Bändern ziehen.</span>' : ''}
    </div>`;
}

function _lkBandTitel(key) {
  const b = lkBaender().find(x => x.key === key);
  return b ? b.titel : key;
}

/** Führungs- bzw. Unterstützungsband: Balken + Reihe von Kacheln. */
function _lkBandHtml(key, schreiben) {
  const alle = lkKacheln();
  const idx = alle.map((k, i) => ({ k, i })).filter(x => x.k.band === key);
  const oben = key === 'fuehrung';
  const balken = `<div class="lk-band lk-band-${esc(key)}">${esc(_lkBandTitel(key))}</div>`;
  // Spaltenzahl = Anzahl der Kacheln: ein Band, eine Zeile, gleiche Breiten.
  const spalten = Math.max(1, idx.length);
  const reihe = `<div class="lk-reihe" style="grid-template-columns:repeat(${spalten},minmax(0,1fr))"
      ondragover="lkZiehUeber(event)" ondrop="lkZiehAblegen(event,'${esc(key)}',-1)">
      ${idx.length ? idx.map(x => _lkKachelHtml(x.k, x.i, key, schreiben)).join('')
        : `<div class="field-hint" style="padding:14px">Noch kein Prozess in diesem Band.</div>`}
    </div>`;
  return oben ? balken + reihe : reihe + balken;
}

/** Kernprozesse: Klammer links, Pfeile in der Mitte, Ergebnisse rechts. */
function _lkKernHtml(schreiben) {
  const alle = lkKacheln();
  const idx = alle.map((k, i) => ({ k, i })).filter(x => x.k.band === 'kern');
  return `<div class="lk-kern">
      <div class="lk-kern-klammer"><span>${esc(_lkBandTitel('kern'))}</span></div>
      <div class="lk-kern-pfeile" ondragover="lkZiehUeber(event)" ondrop="lkZiehAblegen(event,'kern',-1)">
        ${idx.length ? idx.map(x => _lkPfeilHtml(x.k, x.i, schreiben)).join('')
          : `<div class="field-hint" style="padding:14px">Noch kein Kernprozess.</div>`}
      </div>
      <div class="lk-ergebnis">
        ${lkErgebnisse().map(e => `<div class="lk-ergebnis-zeile">${esc(e)}</div>`).join('')}
      </div>
    </div>`;
}

function _lkStatusPunkt(k) {
  const p = lkProzessVon(k);
  return `<i class="lk-punkt ${p ? 'lk-punkt-modell' : 'lk-punkt-offen'}" title="${p ? 'BPMN-Modell hinterlegt' : 'noch kein Modell'}"></i>`;
}

function _lkGeltungKurz(k) {
  const g = Array.isArray(k.geltung) ? k.geltung : [];
  if (!g.length || g.includes('ALLE')) return '';
  return g.join(', ');
}

function _lkZiehAttr(i, schreiben) {
  return schreiben
    ? ` draggable="true" ondragstart="lkZiehStart(event,${i})" ondragend="lkZiehEnde()" ondragover="lkZiehUeber(event)" ondrop="lkZiehAblegen(event,'',${i})"`
    : '';
}

function _lkKachelHtml(k, i, band, schreiben) {
  const aus = !lkGiltDort(k, _lkFilter);
  const g = _lkGeltungKurz(k);
  return `<div class="lk-kachel lk-${esc(band)}${aus ? ' lk-aus' : ''}"${_lkZiehAttr(i, schreiben)}
      onclick="lkKachelOeffnen('${esc(k.id)}')" title="${esc(k.name)}">
      <div class="lk-kachel-inhalt">
        <div class="lk-kachel-kopf">${_lkStatusPunkt(k)}<span>${esc(k.name)}</span></div>
        ${k.unter ? `<div class="lk-kachel-unter">${esc(k.unter)}</div>` : ''}
        ${g ? `<div class="lk-kachel-geltung">${esc(g)}</div>` : ''}
      </div>
    </div>`;
}

function _lkPfeilHtml(k, i, schreiben) {
  const aus = !lkGiltDort(k, _lkFilter);
  const g = _lkGeltungKurz(k);
  return `<div class="lk-pfeil${aus ? ' lk-aus' : ''}"${_lkZiehAttr(i, schreiben)}
      onclick="lkKachelOeffnen('${esc(k.id)}')" title="${esc(k.name)}">
      ${_lkStatusPunkt(k)}<b>${esc(k.name)}</b>
      ${k.unter ? `<span class="lk-pfeil-unter">${esc(k.unter)}</span>` : ''}
      ${g ? `<span class="lk-pfeil-geltung">${esc(g)}</span>` : ''}
    </div>`;
}

function lkSetFilter(v) { _lkFilter = v || ''; renderLandkarte(); }

async function lkNeuLaden() {
  _lkGeladen = false; _lkDaten = null;
  if (typeof refreshProzesse === 'function') await refreshProzesse();
  else await initLandkarte();
}

/* ── Kachel öffnen: Geltungsbereich, Modell, Regelwerke ──────────────── */

function lkKachelVonId(id) { return lkKacheln().find(k => k.id === id) || null; }

function lkKachelOeffnen(id) {
  const k = lkKachelVonId(id);
  if (!k) return;
  const p = lkProzessVon(k);
  const schreiben = lkDarfSchreiben();
  const gb = (typeof geltungsbereichLabel === 'function') ? geltungsbereichLabel(k.geltung) : '';
  openModal(`
    <div class="modal-header">
      <h3>${esc(k.name)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      ${k.unter ? `<p class="ic-desc" style="margin:0 0 12px">${esc(k.unter)}</p>` : ''}
      <div class="ic-tags" style="margin-bottom:14px">
        <span class="ic-tag">${esc(_lkBandTitel(k.band))}</span>
        <span class="ic-tag cat">${esc(gb || 'Geltungsbereich nicht gepflegt')}</span>
      </div>

      <div style="border-top:1px solid var(--c-border);padding-top:12px">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">BPMN-Modell</div>
        ${p ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span>🔀 <b>${esc(p.title)}</b></span>
              <button class="btn btn-primary btn-sm" onclick="closeModal();openProcessEditor('${esc(p.itemId)}')">Modell öffnen</button>
              ${schreiben ? `<button class="btn btn-ghost btn-sm" onclick="lkVerknuepfungLoesen('${esc(k.id)}')">Verknüpfung lösen</button>` : ''}
            </div>`
          : `<div class="field-hint" style="margin-bottom:8px">Für diesen Prozess ist noch kein Modell hinterlegt.</div>
             ${schreiben ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
               <button class="btn btn-primary btn-sm" onclick="lkProzessAnlegen('${esc(k.id)}')">Modell anlegen</button>
               <button class="btn btn-outline btn-sm" onclick="lkVerknuepfenDialog('${esc(k.id)}')">Vorhandenes verknüpfen</button>
             </div>` : ''}`}
      </div>

      <div style="border-top:1px solid var(--c-border);margin-top:14px;padding-top:12px">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Regelwerke zu diesem Prozess</div>
        <div id="lk-regelwerke" class="field-hint">${p ? 'Wird geladen …' : 'Regelwerke hängen am Modell – sobald eines hinterlegt ist, stehen sie hier.'}</div>
      </div>
    </div>
    <div class="modal-footer">
      ${schreiben ? `<button class="btn btn-ghost" onclick="lkKachelLoeschen('${esc(k.id)}')">Löschen</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-outline" onclick="lkZuVerknuepfungen('${esc(k.id)}')"
        title="Diesen Prozess in der Mindmap in die Mitte stellen">🕸 Verknüpfungen</button>
      ${schreiben ? `<button class="btn btn-outline" onclick="lkKachelBearbeiten('${esc(k.id)}')">Bearbeiten</button>` : ''}
      <button class="btn btn-primary" onclick="closeModal()">Schließen</button>
    </div>`);
  if (p) _lkRegelwerkeLaden(p);
}

/** Verknüpfte Regelwerke aus dem BPMN-XML holen – erst beim Öffnen, nicht für die ganze Karte. */
async function _lkRegelwerkeLaden(p) {
  const host = document.getElementById('lk-regelwerke');
  if (!host) return;
  try {
    const xml = await spGetProcessXml(p.itemId);
    const ids = (typeof _parsePolicyIds === 'function') ? _parsePolicyIds(xml) : [];
    const treffer = (State.policies || []).filter(x => ids.includes(String(x.id)));
    if (!treffer.length) {
      host.innerHTML = 'Im Modell ist noch kein Regelwerk verknüpft – das geschieht im Prozess-Editor.';
      return;
    }
    host.className = '';
    host.innerHTML = treffer.map(x => `<div style="padding:5px 0">
        <a href="#" onclick="closeModal();focusPolicyCard('${esc(x.id)}');return false"
           style="color:var(--c-primary);font-weight:600;text-decoration:none">${esc(x.title)}</a>
        <span class="field-hint"> · Version ${esc(x.version)}${x.status ? ' · ' + esc(x.status) : ''}</span>
      </div>`).join('');
  } catch (e) {
    host.innerHTML = 'Regelwerke konnten nicht gelesen werden: ' + esc(e.message);
  }
}

/* ── Modell anlegen / verknüpfen ─────────────────────────────────────── */

/** Aus einer Kachel ein BPMN-Grundgerüst erzeugen und verknüpfen. */
async function lkProzessAnlegen(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  try {
    const text = [k.name, k.unter].filter(Boolean).join('\n');
    const xml = (typeof _bpmnFromText === 'function')
      ? _bpmnFromText(text, k.name, [])
      : (typeof DEFAULT_BPMN !== 'undefined' ? DEFAULT_BPMN : '');
    const item = await spSaveProcess(k.name, xml);
    k.prozessId = (item && item.id) || '';
    k.prozessName = k.name;
    if (typeof refreshProzesse === 'function') await refreshProzesse();
    await lkSpeichern(`Modell für „${k.name}" angelegt ✓`, `Modell für „${k.name}" angelegt`);
    closeModal();
    if (k.prozessId && typeof openProcessEditor === 'function') openProcessEditor(k.prozessId);
  } catch (e) {
    toast('Anlegen fehlgeschlagen: ' + e.message, 'error');
  }
}

function lkVerknuepfenDialog(id) {
  const k = lkKachelVonId(id);
  if (!k) return;
  const alle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  if (!alle.length) { toast('Es gibt noch keine Prozesse zum Verknüpfen.', 'error'); return; }
  openModal(`
    <div class="modal-header"><h3>Modell verknüpfen</h3>
      <button class="modal-close" onclick="lkKachelOeffnen('${esc(k.id)}')">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Welches vorhandene BPMN-Modell gehört zu „${esc(k.name)}"?</p>
      <div class="form-group full">
        <select id="lk-proc-wahl">
          ${alle.map(p => `<option value="${esc(p.itemId)}">${esc(p.title)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="lkKachelOeffnen('${esc(k.id)}')">Zurück</button>
      <button class="btn btn-primary" onclick="lkVerknuepfen('${esc(k.id)}')">Verknüpfen</button>
    </div>`);
}

async function lkVerknuepfen(id) {
  const k = lkKachelVonId(id);
  const wahl = document.getElementById('lk-proc-wahl');
  if (!k || !wahl) return;
  const alle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  const p = alle.find(x => x.itemId === wahl.value);
  if (!p) return;
  k.prozessId = p.itemId;
  k.prozessName = p.title;
  closeModal();
  await lkSpeichern(`„${k.name}" mit „${p.title}" verknüpft ✓`, `„${k.name}" mit Modell „${p.title}" verknüpft`);
}

async function lkVerknuepfungLoesen(id) {
  const k = lkKachelVonId(id);
  if (!k) return;
  const alt = k.prozessName || '';
  k.prozessId = ''; k.prozessName = '';
  closeModal();
  await lkSpeichern('Verknüpfung gelöst ✓', `Verknüpfung von „${k.name}"${alt ? ' zu „' + alt + '"' : ''} gelöst`);
}

/* ── Kacheln bearbeiten ──────────────────────────────────────────────── */

function lkKachelNeu() {
  if (!lkDarfSchreiben()) return;
  _lkEditing = { id: '', band: 'unterstuetzung', name: '', unter: '', geltung: ['ALLE'], prozessId: '', prozessName: '', neu: true };
  renderLkEditor();
}

function lkKachelBearbeiten(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  _lkEditing = JSON.parse(JSON.stringify(k));
  _lkEditing.neu = false;
  if (!Array.isArray(_lkEditing.geltung)) _lkEditing.geltung = ['ALLE'];
  renderLkEditor();
}

function renderLkEditor() {
  const k = _lkEditing;
  if (!k) return;
  // Für die Geltungsbereich-Auswahl gilt dieselbe Oberfläche wie bei Regelwerken;
  // _gbScope('lgb') zeigt auf _lkEditing.geltungsbereich – deshalb hier spiegeln.
  k.geltungsbereich = k.geltung;
  openModal(`
    <div class="modal-header">
      <h3>${k.neu ? 'Prozess anlegen' : 'Prozess bearbeiten'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full">
          <label>Name <span class="req">*</span></label>
          <input type="text" value="${esc(k.name)}" oninput="_lkEditing.name=this.value" placeholder="z. B. Beschaffung">
        </div>
        <div class="form-group full">
          <label>Untertitel</label>
          <input type="text" value="${esc(k.unter || '')}" oninput="_lkEditing.unter=this.value" placeholder="z. B. Versand / Faktura">
          <span class="field-hint">Kurz – er steht klein unter dem Namen.</span>
        </div>
        <div class="form-group full">
          <label>Band</label>
          <select onchange="_lkEditing.band=this.value">
            ${lkBaender().map(b => `<option value="${esc(b.key)}"${b.key === k.band ? ' selected' : ''}>${esc(b.titel)}</option>`).join('')}
          </select>
        </div>
      </div>
      ${(typeof renderGeltungsbereichSection === 'function') ? renderGeltungsbereichSection(k.geltung, 'lgb') : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="lkEditorSpeichern()">Speichern</button>
    </div>`);
}

async function lkEditorSpeichern() {
  const k = _lkEditing;
  if (!k) return;
  const name = String(k.name || '').trim();
  if (!name) { toast('Bitte einen Namen angeben.', 'error'); return; }
  const geltung = Array.isArray(k.geltungsbereich) ? k.geltungsbereich : (k.geltung || []);
  if (!geltung.length) { toast('Bitte den Geltungsbereich festlegen: „Alle Standorte" oder einzelne Werke.', 'error'); return; }

  if (k.neu) {
    const id = _lkNeueId(name);
    lkKacheln().push({ id, band: k.band, name, unter: String(k.unter || '').trim(), geltung, prozessId: '', prozessName: '' });
    closeModal();
    _lkEditing = null;
    await lkSpeichern(`„${name}" angelegt ✓`, `Prozess „${name}" angelegt`);
    return;
  }
  const ziel = lkKachelVonId(k.id);
  if (!ziel) return;
  const alt = { name: ziel.name, band: ziel.band, unter: ziel.unter || '', geltung: (ziel.geltung || []).join(',') };
  ziel.name = name;
  ziel.unter = String(k.unter || '').trim();
  ziel.band = k.band;
  ziel.geltung = geltung;
  const teile = [];
  if (alt.name !== name) teile.push(`Name: „${alt.name}" → „${name}"`);
  if (alt.band !== ziel.band) teile.push(`Band: ${_lkBandTitel(alt.band)} → ${_lkBandTitel(ziel.band)}`);
  if (alt.unter !== ziel.unter) teile.push('Untertitel geändert');
  if (alt.geltung !== geltung.join(',')) teile.push(`Geltungsbereich: ${geltungsbereichLabel(geltung)}`);
  closeModal();
  _lkEditing = null;
  await lkSpeichern('Gespeichert ✓', `„${name}" geändert${teile.length ? ' – ' + teile.join('; ') : ''}`);
}

function _lkNeueId(name) {
  const basis = String(name).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'prozess';
  let id = basis, n = 2;
  while (lkKachelVonId(id)) id = basis + n++;
  return id;
}

async function lkKachelLoeschen(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  const p = lkProzessVon(k);
  const ok = (typeof uiConfirm === 'function')
    ? await uiConfirm(`„${k.name}" aus der Landkarte entfernen?${p ? '\n\nDas BPMN-Modell bleibt erhalten – nur die Kachel verschwindet.' : ''}`,
        { title: 'Prozess entfernen', okLabel: 'Entfernen', danger: true })
    : confirm(`„${k.name}" entfernen?`);
  if (!ok) return;
  const liste = lkKacheln();
  const i = liste.findIndex(x => x.id === id);
  if (i < 0) return;
  liste.splice(i, 1);
  closeModal();
  await lkSpeichern('Entfernt ✓', `Prozess „${k.name}" aus der Landkarte entfernt`);
}

/* ── Ziehen und Ablegen: Reihenfolge und Band ────────────────────────── */

function lkZiehStart(ev, i) {
  _lkZiehIndex = i;
  if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', String(i)); } catch (e) { /* egal */ } }
  if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.add('lk-zieht');
}
function lkZiehEnde() {
  _lkZiehIndex = -1;
  document.querySelectorAll('.lk-zieht').forEach(el => el.classList.remove('lk-zieht'));
}
function lkZiehUeber(ev) { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'; }

/**
 * Ablegen: auf eine Kachel (zielIndex ≥ 0) verschiebt davor, auf ein leeres
 * Band (zielIndex = -1) hängt ans Ende. Das Band der Zielkachel gewinnt –
 * so wechselt ein Prozess das Band, indem man ihn dorthin zieht.
 */
async function lkZiehAblegen(ev, bandKey, zielIndex) {
  ev.preventDefault(); ev.stopPropagation();
  const liste = lkKacheln();
  const von = _lkZiehIndex;
  lkZiehEnde();
  if (von < 0 || von >= liste.length) return;
  const kachel = liste[von];
  const altesBand = kachel.band;
  let neuesBand = bandKey;
  if (zielIndex >= 0 && liste[zielIndex]) neuesBand = liste[zielIndex].band;
  if (zielIndex === von) return;

  liste.splice(von, 1);
  let ziel = zielIndex;
  if (ziel < 0) ziel = liste.length;
  else if (von < zielIndex) ziel = zielIndex - 1;
  kachel.band = neuesBand || altesBand;
  liste.splice(ziel, 0, kachel);

  const was = (altesBand !== kachel.band)
    ? `„${kachel.name}" nach ${_lkBandTitel(kachel.band)} verschoben`
    : `Reihenfolge in ${_lkBandTitel(kachel.band)} geändert („${kachel.name}")`;
  await lkSpeichern('', was);
}

/* ── Versionsverlauf ─────────────────────────────────────────────────── */

function lkVerlaufZeigen() {
  const h = (_lkDaten && Array.isArray(_lkDaten.historie)) ? _lkDaten.historie.slice().reverse() : [];
  openModal(`
    <div class="modal-header"><h3>Versionsverlauf der Landkarte</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${h.length ? `<div style="font-size:.87rem;line-height:1.7">${h.map(e => `
        <div style="padding:7px 0;border-bottom:1px solid var(--c-border-2)">
          <b>${esc(e.name || '–')}</b>
          <span class="field-hint"> · ${typeof fmtDate === 'function' ? esc(fmtDate(e.datum)) : esc(e.datum)}</span>
          <div>${esc(e.was || '')}</div>
        </div>`).join('')}</div>`
        : '<p class="field-hint">Noch keine Änderung verzeichnet.</p>'}
      <p class="field-hint" style="margin-top:12px">Ältere Fassungen der Datei bewahrt SharePoint zusätzlich auf.</p>
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Schließen</button></div>`);
}

/** Von der Kachel in die Mindmap – dieser Prozess kommt in die Mitte. */
async function lkZuVerknuepfungen(id) {
  closeModal();
  if (typeof setProzessModus !== 'function') return;
  setProzessModus('netz');
  // Der Graph wird beim Umschalten aufgebaut; danach den Fokus setzen.
  if (typeof initVerknuepfungen === 'function') await initVerknuepfungen();
  if (typeof vkFokus === 'function') vkFokus('prozess:' + id);
}
