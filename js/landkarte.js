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

/* Jedes Werk führt seine eigene Landkarte; dazu die Konzern-Ebene für das,
   was die Holding steuert. Die Reihenfolge bestimmt die Auswahl oben. */
const LK_WERKE = ['KONZERN'].concat(typeof STANDORTE !== 'undefined' ? STANDORTE : []);
function lkWerkLabel(w) { return w === 'KONZERN' ? 'Konzern / Holding' : w; }

/* ── Startbestand: die abgestimmte Landschaft – sie gehört zu HOL ── */
const LK_START_WERK = 'HOL';
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

let _lkDaten = null;         // { version, karten: { WERK: {…} }, historie }
let _lkGeaendertAm = '';     // Zeitstempel der geladenen Datei (Gleichzeitigkeit)
let _lkGeladen = false;
let _lkWerk = LK_START_WERK; // welche Landkarte gerade offen ist
let _lkFilter = '';          // Standort-Filter innerhalb der Karte ('' = alle)
let _lkEditing = null;       // Kachel im Bearbeiten-Dialog
let _lkZiehIndex = -1;       // laufendes Ziehen
let _lkSuche = '';           // Suche über ALLE Landkarten

/** Tiefe Kopie des Startbestands – nie die Konstante verändern. */
function lkStartbestand() {
  return { version: 2, karten: { [LK_START_WERK]: JSON.parse(JSON.stringify(LK_START)) }, historie: [] };
}

/** Leere Karte für ein Werk, das noch keine hat. */
function lkLeereKarte() {
  return { baender: JSON.parse(JSON.stringify(LK_START.baender)), ergebnisse: [], kacheln: [] };
}

/** Das gerade gewählte Werk. */
function lkWerk() { return _lkWerk; }

/** Karte eines Werks (legt sie im Arbeitsstand an, wenn sie fehlt). */
function lkKarte(werk) {
  const w = werk || _lkWerk;
  if (!_lkDaten) return lkLeereKarte();
  if (!_lkDaten.karten || typeof _lkDaten.karten !== 'object') _lkDaten.karten = {};
  if (!_lkDaten.karten[w]) _lkDaten.karten[w] = lkLeereKarte();
  return _lkDaten.karten[w];
}

/** Welche Werke haben schon eine Karte mit Inhalt? */
function lkWerkeMitKarte() {
  const k = (_lkDaten && _lkDaten.karten) || {};
  return Object.keys(k).filter(w => Array.isArray(k[w].kacheln) && k[w].kacheln.length);
}

function lkBaender()    { const k = lkKarte(); return (Array.isArray(k.baender) && k.baender.length) ? k.baender : LK_START.baender; }
function lkKacheln()    { const k = lkKarte(); return Array.isArray(k.kacheln) ? k.kacheln : []; }
function lkErgebnisse() { const k = lkKarte(); return Array.isArray(k.ergebnisse) ? k.ergebnisse : []; }
function lkDatenGeladen() { return _lkGeladen; }

/** Alle Kacheln aller Werke – für die Mindmap, die über die Werke hinweg schaut. */
function lkAlleKacheln() {
  const karten = (_lkDaten && _lkDaten.karten) || {};
  const out = [];
  Object.keys(karten).forEach(w => {
    (Array.isArray(karten[w].kacheln) ? karten[w].kacheln : []).forEach(k => out.push({ werk: w, kachel: k }));
  });
  return out;
}

/** Bänder einer bestimmten Karte (die Mindmap braucht sie je Werk). */
function lkBaenderVon(werk) {
  const k = (_lkDaten && _lkDaten.karten && _lkDaten.karten[werk]) || null;
  return (k && Array.isArray(k.baender) && k.baender.length) ? k.baender : LK_START.baender;
}

/** Darf die Karte bearbeitet werden? Wer den Reiter schreiben darf, darf es. */
function lkDarfSchreiben() { return typeof canWriteTab !== 'function' || canWriteTab('prozesse'); }

/** Gilt die Kachel am gewählten Standort? Ohne Filter gilt alles. */
function lkGiltDort(k, standort) {
  if (!standort) return true;
  const g = Array.isArray(k.geltung) ? k.geltung : [];
  if (!g.length || g.includes('ALLE')) return true;   // ungepflegt = konzernweit
  return g.includes(standort);
}

/**
 * Verweise einer Kachel auf ihre BPMN-Modelle. Ein Prozess besteht oft aus
 * mehreren Abläufen – Angebot, Auftrag, Reklamation gehören alle zum Vertrieb.
 * Frühere Fassungen kannten nur einen; deren Felder werden hier mitgelesen.
 */
function lkModellVerweise(k) {
  if (Array.isArray(k.prozesse)) return k.prozesse;
  if (k.prozessId || k.prozessName) return [{ id: k.prozessId || '', name: k.prozessName || '' }];
  return [];
}

/**
 * Ein Verweis → Modell aus der geladenen Prozessliste (Kennung zuerst, sonst Name).
 * Der Name allein ist nicht mehr eindeutig, seit jedes Werk seinen eigenen Ordner
 * hat: „Vertrieb" gibt es in HOL und in SHB. Deshalb zählt bei der Namenssuche
 * zuerst der Ordner des eigenen Werks.
 */
function lkModellZu(verweis, werk) {
  const alle = (typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [];
  if (verweis && verweis.id) {
    const t = alle.find(p => p.itemId === verweis.id);
    if (t) return t;
  }
  const n = String((verweis && verweis.name) || '').trim().toLowerCase();
  if (!n) return null;
  const passt = (p) => (p.title || '').trim().toLowerCase() === n;
  const w = String(werk || '').trim();
  return (w && alle.find(p => passt(p) && (p.ordner || '') === w)) || alle.find(passt) || null;
}

/** Alle aufgelösten Modelle einer Kachel (Verweise ins Leere fallen weg). */
function lkProzesseVon(k, werk) {
  const w = werk || _lkWerk;
  return lkModellVerweise(k).map(v => lkModellZu(v, w)).filter(Boolean);
}

/** Das erste Modell – für Anzeigen, die nur eines brauchen. */
function lkProzessVon(k, werk) { return lkProzesseVon(k, werk)[0] || null; }

/** Direkt an der Kachel hängende Regelwerke (ohne Umweg über ein Modell). */
function lkRegelwerkeVon(k) {
  const ids = Array.isArray(k.regelwerke) ? k.regelwerke.map(String) : [];
  if (!ids.length) return [];
  const alle = (typeof State !== 'undefined' && Array.isArray(State.policies)) ? State.policies : [];
  return ids.map(id => alle.find(p => String(p.id) === id)).filter(Boolean);
}

/* ── Laden und Speichern ─────────────────────────────────────────────── */

async function lkDatenLaden() {
  if (_lkGeladen) return _lkDaten;
  try {
    const gespeichert = (typeof spLoadLandkarte === 'function') ? await spLoadLandkarte() : null;
    if (gespeichert && gespeichert.daten) {
      const d = gespeichert.daten;
      if (d.karten && typeof d.karten === 'object') {
        _lkDaten = { version: 2, karten: d.karten, historie: Array.isArray(d.historie) ? d.historie : [] };
      } else {
        // Fassung 1 kannte nur EINE Landkarte. Die abgestimmte Landschaft gehört
        // zu HOL – dorthin wandert sie, ohne dass jemand etwas neu erfassen muss.
        _lkDaten = {
          version: 2,
          karten: { [LK_START_WERK]: {
            baender:    (Array.isArray(d.baender) && d.baender.length) ? d.baender : JSON.parse(JSON.stringify(LK_START.baender)),
            ergebnisse: Array.isArray(d.ergebnisse) ? d.ergebnisse : JSON.parse(JSON.stringify(LK_START.ergebnisse)),
            kacheln:    Array.isArray(d.kacheln) ? d.kacheln : JSON.parse(JSON.stringify(LK_START.kacheln)),
          } },
          historie: Array.isArray(d.historie) ? d.historie : [],
        };
      }
      _lkGeaendertAm = gespeichert.geaendertAm || '';
    } else {
      _lkDaten = lkStartbestand();
      _lkGeaendertAm = '';
    }
  } catch (e) {
    console.warn('[landkarte] Laden fehlgeschlagen, Startbestand gilt:', e.message);
    _lkDaten = lkStartbestand();
  }
  // Auf ein Werk stellen, das auch etwas zeigt.
  const belegt = lkWerkeMitKarte();
  if (belegt.length && !belegt.includes(_lkWerk)) _lkWerk = belegt[0];
  _lkGeladen = true;
  return _lkDaten;
}

/** Eintrag in den Versionsverlauf (wer, wann, was). */
function _lkVerlauf(was) {
  if (!_lkDaten) return;
  if (!Array.isArray(_lkDaten.historie)) _lkDaten.historie = [];
  const u = (typeof State !== 'undefined' && State.user) ? State.user : {};
  _lkDaten.historie.push({ datum: new Date().toISOString(), name: u.name || u.upn || '', werk: _lkWerk, was });
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
  const belegt = lkWerkeMitKarte();
  mount.innerHTML = `
    ${(typeof prozessModusLeiste === 'function') ? prozessModusLeiste('karte') : ''}
    <div class="view-desc" style="margin:0 0 12px">
      Die Prozesslandschaft von <b>${esc(lkWerkLabel(_lkWerk))}</b> – jedes Werk führt seine eigene.
      Ein Klick auf eine Kachel zeigt Geltungsbereich, das hinterlegte <b>BPMN-Modell</b> und die
      daran hängenden Regelwerke. <b>${mitModell}</b> von <b>${kacheln.length}</b> Prozessen sind modelliert.
    </div>
    <div class="view-toolbar">
      <label class="field-hint" style="margin:0 6px 0 0">Landkarte</label>
      <select id="lk-werk" onchange="lkSetWerk(this.value)" style="max-width:210px">
        ${LK_WERKE.map(w => `<option value="${esc(w)}"${_lkWerk === w ? ' selected' : ''}>${esc(lkWerkLabel(w))}${
          belegt.includes(w) ? '' : ' – leer'}</option>`).join('')}
      </select>
      <label class="field-hint" style="margin:0 6px 0 14px">gilt für</label>
      <select id="lk-filter" onchange="lkSetFilter(this.value)" style="max-width:160px">
        <option value="">alle</option>
        ${standorte.map(s => `<option value="${esc(s)}"${_lkFilter === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <div class="search-box" style="margin-left:14px;max-width:230px">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input type="text" id="lk-suche" value="${esc(_lkSuche)}" aria-label="Prozess in allen Landkarten suchen"
          placeholder="In allen Werken suchen …" oninput="lkSuchen(this.value)">
      </div>
      <div class="toolbar-spacer"></div>
      ${stand ? `<button class="btn btn-ghost btn-sm" onclick="lkVerlaufZeigen()" title="Versionsverlauf">
        🕘 ${esc(stand.name || '–')}${stand.datum && typeof fmtDate === 'function' ? ' · ' + esc(fmtDate(stand.datum)) : ''}</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="lkNeuLaden()" title="Aktualisieren">↻ Aktualisieren</button>
      ${schreiben ? `<button class="btn btn-outline btn-sm" onclick="lkKachelNeu()">+ Prozess</button>` : ''}
    </div>
    ${_lkTrefferHtml()}
    ${_lkFilter ? `<div class="field-hint" style="margin:0 0 10px">Prozesse, die am Standort <b>${esc(_lkFilter)}</b>
      nicht gelten, sind ausgegraut – die Landschaft bleibt dadurch vergleichbar.</div>` : ''}
    ${kacheln.length ? `<div class="lk-karte">
      ${_lkBandHtml('fuehrung', schreiben)}
      ${_lkKernHtml(schreiben)}
      ${_lkBandHtml('unterstuetzung', schreiben)}
    </div>` : _lkLeerHtml(schreiben, belegt)}
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
  const n = lkProzesseVon(k).length;
  const r = (Array.isArray(k.regelwerke) ? k.regelwerke.length : 0);
  const titel = [n ? `${n} Modell${n > 1 ? 'e' : ''}` : 'noch kein Modell',
    r ? `${r} Regelwerk${r > 1 ? 'e' : ''}` : ''].filter(Boolean).join(' · ');
  return `<i class="lk-punkt ${n ? 'lk-punkt-modell' : 'lk-punkt-offen'}" title="${esc(titel)}"></i>${
    n > 1 ? `<span class="lk-zahl-punkt" title="${esc(titel)}">${n}</span>` : ''}`;
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

/** Mit Enter und Leertaste bedienbar – die Kacheln sind Schaltflächen, keine Bilder. */
function _lkTastatur(id) {
  return ` role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();lkKachelOeffnen('${esc(id)}')}"`;
}

function _lkKachelHtml(k, i, band, schreiben) {
  const aus = !lkGiltDort(k, _lkFilter);
  const g = _lkGeltungKurz(k);
  return `<div class="lk-kachel lk-${esc(band)}${aus ? ' lk-aus' : ''}"${_lkZiehAttr(i, schreiben)}${_lkTastatur(k.id)}
      onclick="lkKachelOeffnen('${esc(k.id)}')" aria-label="${esc(k.name + (k.unter ? ' – ' + k.unter : ''))}" title="${esc(k.name)}">
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
  return `<div class="lk-pfeil${aus ? ' lk-aus' : ''}"${_lkZiehAttr(i, schreiben)}${_lkTastatur(k.id)}
      onclick="lkKachelOeffnen('${esc(k.id)}')" aria-label="${esc(k.name + (k.unter ? ' – ' + k.unter : ''))}" title="${esc(k.name)}">
      ${_lkStatusPunkt(k)}<b>${esc(k.name)}</b>
      ${k.unter ? `<span class="lk-pfeil-unter">${esc(k.unter)}</span>` : ''}
      ${g ? `<span class="lk-pfeil-geltung">${esc(g)}</span>` : ''}
    </div>`;
}

/** Für ein Werk gibt es noch keine Karte: anlegen oder von einem anderen übernehmen. */
function _lkLeerHtml(schreiben, belegt) {
  const quellen = belegt.filter(w => w !== _lkWerk);
  return `<div class="lk-karte" style="text-align:center;padding:44px 20px">
      <div style="font-size:2rem;margin-bottom:8px">🗺</div>
      <div style="font-weight:700;margin-bottom:6px">Für ${esc(lkWerkLabel(_lkWerk))} gibt es noch keine Landkarte.</div>
      <div class="field-hint" style="max-width:520px;margin:0 auto 16px">
        Jedes Werk führt seine eigene Landschaft. Sie können bei null anfangen – oder die
        Struktur eines anderen Werks übernehmen und dort anpassen, wo es abweicht.
      </div>
      ${schreiben ? `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="lkKachelNeu()">+ Erster Prozess</button>
        ${quellen.length ? `<button class="btn btn-outline btn-sm" onclick="lkUebernehmenDialog()">Von einem anderen Werk übernehmen</button>` : ''}
      </div>` : '<div class="field-hint">Für das Anlegen fehlt Ihnen das Schreibrecht auf „Prozesse".</div>'}
    </div>`;
}

/** Landkarte wechseln. */
function lkSetWerk(w) {
  _lkWerk = LK_WERKE.includes(w) ? w : _lkWerk;
  renderLandkarte();
}

function lkUebernehmenDialog() {
  const quellen = lkWerkeMitKarte().filter(w => w !== _lkWerk);
  if (!quellen.length) return;
  openModal(`
    <div class="modal-header"><h3>Landkarte übernehmen</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Die Struktur wird nach
        <b>${esc(lkWerkLabel(_lkWerk))}</b> kopiert – Bänder und Kacheln.
        Der Geltungsbereich wird auf ${esc(lkWerkLabel(_lkWerk))} gesetzt; alles Weitere lässt sich
        danach anpassen. Die Quelle bleibt unverändert.</p>
      <div class="form-group full">
        <select id="lk-quelle">${quellen.map(w =>
          `<option value="${esc(w)}">${esc(lkWerkLabel(w))} – ${lkKarte(w).kacheln.length} Prozesse</option>`).join('')}</select>
      </div>
      <label class="ack-check" style="font-weight:500">
        <input type="checkbox" id="lk-uebernahme-modelle">
        <span>Auch die Verknüpfungen zu den BPMN-Modellen mitnehmen</span>
      </label>
      <span class="field-hint">Ohne Haken bekommt ${esc(lkWerkLabel(_lkWerk))} eine leere Struktur und
        modelliert seine Abläufe selbst – die Modelle des anderen Werks bleiben dort, wo sie hingehören.</span>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="lkUebernehmen()">Übernehmen</button>
    </div>`);
}

async function lkUebernehmen() {
  const wahl = document.getElementById('lk-quelle');
  if (!wahl || !lkDarfSchreiben()) return;
  const quelle = lkKarte(wahl.value);
  const ziel = lkKarte(_lkWerk);
  ziel.baender = JSON.parse(JSON.stringify(quelle.baender || []));
  ziel.ergebnisse = JSON.parse(JSON.stringify(quelle.ergebnisse || []));
  const mitModellen = !!(document.getElementById('lk-uebernahme-modelle') || {}).checked;
  ziel.kacheln = JSON.parse(JSON.stringify(quelle.kacheln || []))
    .map(k => Object.assign(k, { geltung: _lkWerk === 'KONZERN' ? ['ALLE'] : [_lkWerk] }));
  ziel.kacheln.forEach(_lkVerweise);   // Altbestand-Felder gleich mit umstellen
  // Die Modelle des Quellwerks liegen in dessen Ordner. Sie mitzuschleppen
  // hieße, dass zwei Werke auf dieselbe Datei zeigen – deshalb nur auf Wunsch.
  if (!mitModellen) ziel.kacheln.forEach(k => { k.prozesse = []; });
  closeModal();
  await lkSpeichern(`Landkarte von ${lkWerkLabel(wahl.value)} übernommen ✓`,
    `Landkarte für ${lkWerkLabel(_lkWerk)} aus ${lkWerkLabel(wahl.value)} übernommen (${ziel.kacheln.length} Prozesse)`);
}

/**
 * Suche über alle Werke. Bei zehn Landkarten ist „wo steckt die Beschaffung?"
 * sonst eine Klickstrecke – hier ist es ein Treffer mit Werk daneben.
 */
function lkSuchen(q) {
  _lkSuche = String(q || '');
  const host = document.getElementById('lk-treffer');
  if (host) { host.outerHTML = _lkTrefferHtml(); return; }
  renderLandkarte();
}

function lkTreffer(q) {
  const s = String(q || '').trim().toLowerCase();
  if (s.length < 2) return [];
  return ((typeof lkAlleKacheln === 'function') ? lkAlleKacheln() : [])
    .filter(x => [x.kachel.name, x.kachel.unter].filter(Boolean).join(' ').toLowerCase().includes(s))
    .slice(0, 12);
}

function _lkTrefferHtml() {
  const q = _lkSuche.trim();
  if (q.length < 2) return '<div id="lk-treffer"></div>';
  const treffer = lkTreffer(q);
  return `<div id="lk-treffer" class="lk-treffer">
      ${treffer.length ? treffer.map(t => `<button class="lk-treffer-knopf"
          onclick="lkSpringeZu('${esc(t.werk)}','${esc(t.kachel.id)}')">
          ${esc(t.kachel.name)} <span>${esc(lkWerkLabel(t.werk))}</span></button>`).join('')
        : `<span class="field-hint">Kein Prozess mit „${esc(q)}" – in keiner Landkarte.</span>`}
    </div>`;
}

/** Zum Treffer springen: richtige Karte öffnen, Kachel zeigen. */
function lkSpringeZu(werk, id) {
  _lkWerk = LK_WERKE.includes(werk) ? werk : _lkWerk;
  renderLandkarte();
  lkKachelOeffnen(id);
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
  const modelle = lkProzesseVon(k);
  const eigene = lkRegelwerkeVon(k);
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
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">
          BPMN-Modelle${modelle.length > 1 ? ` <span class="field-hint">(${modelle.length})</span>` : ''}</div>
        ${modelle.length ? modelle.map(m => `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:4px 0">
              <span style="flex:1;min-width:140px">🔀 <b>${esc(m.title)}</b>${
                (m.ordner || '') === _lkWerk ? '' :
                ` <span class="ic-tag" title="Die Datei liegt nicht im Ordner dieses Werks">${
                  esc(m.ordner ? lkWerkLabel(m.ordner) : 'ohne Werk')}</span>`}</span>
              <button class="btn btn-outline btn-sm" onclick="closeModal();openProcessEditor('${esc(m.itemId)}')">Öffnen</button>
              ${schreiben ? `<button class="btn btn-ghost btn-sm" onclick="lkModellLoesen('${esc(k.id)}','${esc(m.itemId)}')">Lösen</button>` : ''}
            </div>`).join('')
          : `<div class="field-hint" style="margin-bottom:8px">Für diesen Prozess ist noch kein Modell hinterlegt.</div>`}
        ${schreiben ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
               <button class="btn ${modelle.length ? 'btn-outline' : 'btn-primary'} btn-sm" onclick="lkProzessAnlegen('${esc(k.id)}')">+ Modell anlegen</button>
               <button class="btn btn-outline btn-sm" onclick="lkVerknuepfenDialog('${esc(k.id)}')">+ Vorhandenes verknüpfen</button>
             </div>` : ''}
        ${modelle.length > 1 ? `<div class="field-hint" style="margin-top:6px">Ein Prozess besteht oft aus mehreren Abläufen – alle hängen an dieser Kachel.</div>` : ''}
      </div>

      <div style="border-top:1px solid var(--c-border);margin-top:14px;padding-top:12px">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:6px">Regelwerke zu diesem Prozess</div>
        ${eigene.length ? `<div style="margin-bottom:8px">${eigene.map(r => `<div style="padding:4px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <a href="#" onclick="closeModal();focusPolicyCard('${esc(r.id)}');return false"
               style="color:var(--c-primary);font-weight:600;text-decoration:none;flex:1;min-width:140px">${esc(r.title)}</a>
            <span class="field-hint">direkt verknüpft</span>
          </div>`).join('')}</div>` : ''}
        ${schreiben ? `<button class="btn btn-outline btn-sm" onclick="lkRegelwerkeDialog('${esc(k.id)}')" style="margin-bottom:10px">Regelwerke zuordnen</button>` : ''}
        <div id="lk-regelwerke" class="field-hint">${modelle.length ? 'Aus den Modellen wird geladen …'
          : (eigene.length ? '' : 'Noch keine Regelwerke – direkt zuordnen oder über ein Modell verknüpfen.')}</div>
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
  if (modelle.length) _lkRegelwerkeLaden(modelle, k);
}

/** Regelwerke aus den BPMN-Dateien holen – erst beim Öffnen, nicht für die ganze Karte.
 *  Bei mehreren Modellen wird je Regelwerk gezeigt, aus welchem es stammt. */
async function _lkRegelwerkeLaden(modelle, kachel) {
  const host = document.getElementById('lk-regelwerke');
  if (!host) return;
  const eigeneIds = new Set((Array.isArray(kachel && kachel.regelwerke) ? kachel.regelwerke : []).map(String));
  try {
    const treffer = new Map();   // policyId → { policy, quellen: [] }
    for (const m of modelle) {
      const xml = await spGetProcessXml(m.itemId);
      const ids = (typeof _parsePolicyIds === 'function') ? _parsePolicyIds(xml) : [];
      ids.forEach(id => {
        const pol = (State.policies || []).find(x => String(x.id) === String(id));
        if (!pol) return;
        if (!treffer.has(String(id))) treffer.set(String(id), { pol, quellen: [] });
        treffer.get(String(id)).quellen.push(m.title);
      });
    }
    const rows = [...treffer.values()].filter(t => !eigeneIds.has(String(t.pol.id)));
    if (!rows.length) {
      host.innerHTML = 'In den Modellen ist kein weiteres Regelwerk verknüpft.';
      return;
    }
    host.className = '';
    host.innerHTML = rows.map(t => `<div style="padding:5px 0">
        <a href="#" onclick="closeModal();focusPolicyCard('${esc(t.pol.id)}');return false"
           style="color:var(--c-primary);font-weight:600;text-decoration:none">${esc(t.pol.title)}</a>
        <span class="field-hint"> · Version ${esc(t.pol.version)}${t.pol.status ? ' · ' + esc(t.pol.status) : ''}
          · über ${esc(t.quellen.join(', '))}</span>
      </div>`).join('');
  } catch (e) {
    host.innerHTML = 'Regelwerke konnten nicht gelesen werden: ' + esc(e.message);
  }
}

/** Regelwerke direkt an der Kachel zuordnen – für Prozesse, die (noch) kein Modell haben. */
function lkRegelwerkeDialog(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  const schon = (Array.isArray(k.regelwerke) ? k.regelwerke : []).map(String);
  const policies = ((typeof State !== 'undefined' && State.policies) || [])
    .filter(p => p.typ !== 'Konzept')
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  openModal(`
    <div class="modal-header"><h3>Regelwerke zuordnen</h3>
      <button class="modal-close" onclick="lkKachelOeffnen('${esc(k.id)}')">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Welche Regelwerke regeln <b>${esc(k.name)}</b>?
        Diese Zuordnung hängt an der Kachel – unabhängig davon, ob es ein Modell gibt. Was über ein
        BPMN-Modell verknüpft ist, steht weiterhin dort und muss hier nicht wiederholt werden.</p>
      <div style="max-height:340px;overflow:auto;border:1px solid var(--c-border);border-radius:9px;padding:10px">
        ${policies.length ? policies.map(p => `<label class="ack-check" style="font-weight:500">
          <input type="checkbox" value="${esc(p.id)}" ${schon.includes(String(p.id)) ? 'checked' : ''}>
          <span>${esc(p.title)} <span class="field-hint">· ${esc(p.status || '')}</span></span></label>`).join('')
          : '<div class="field-hint">Es gibt noch keine Regelwerke.</div>'}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="lkKachelOeffnen('${esc(k.id)}')">Zurück</button>
      <button class="btn btn-primary" onclick="lkRegelwerkeSpeichern('${esc(k.id)}')">Speichern</button>
    </div>`);
}

async function lkRegelwerkeSpeichern(id) {
  const k = lkKachelVonId(id);
  if (!k) return;
  const host = document.querySelector('.modal-body');
  const ids = host ? [...host.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value) : [];
  const vorher = (Array.isArray(k.regelwerke) ? k.regelwerke : []).length;
  k.regelwerke = ids;
  closeModal();
  await lkSpeichern(ids.length ? `${ids.length} Regelwerk(e) zugeordnet ✓` : 'Zuordnung entfernt ✓',
    `Regelwerke von „${k.name}" geändert (${vorher} → ${ids.length})`);
}

/* ── Modell anlegen / verknüpfen ─────────────────────────────────────── */

/** Aus einer Kachel ein BPMN-Grundgerüst erzeugen und verknüpfen. */
/** Verweise einer Kachel als Feld sicherstellen (und Altbestand mitnehmen). */
function _lkVerweise(k) {
  if (!Array.isArray(k.prozesse)) {
    k.prozesse = (k.prozessId || k.prozessName) ? [{ id: k.prozessId || '', name: k.prozessName || '' }] : [];
    delete k.prozessId; delete k.prozessName;
  }
  return k.prozesse;
}

/** Dateiname für ein weiteres Modell: „Vertrieb", dann „Vertrieb 2" … –
 *  gleiche Namen im selben Ordner wären dieselbe Datei, das zweite Modell
 *  überschriebe das erste. Über Werke hinweg stört der gleiche Name dagegen
 *  nicht: HOL/Vertrieb und SHB/Vertrieb sind zwei Dateien. */
function _lkFreierModellName(basis, werk) {
  const w = String(werk === undefined ? _lkWerk : (werk || ''));
  const alle = ((typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [])
    .filter(p => (p.ordner || '') === w);
  const belegt = (n) => alle.some(p => (p.title || '').trim().toLowerCase() === n.trim().toLowerCase());
  if (!belegt(basis)) return basis;
  for (let i = 2; i < 50; i++) if (!belegt(`${basis} ${i}`)) return `${basis} ${i}`;
  return `${basis} ${Date.now()}`;
}

async function lkProzessAnlegen(id) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  try {
    const name = _lkFreierModellName(k.name, _lkWerk);
    const text = [name, k.unter].filter(Boolean).join('\n');
    const xml = (typeof _bpmnFromText === 'function')
      ? _bpmnFromText(text, name, [])
      : (typeof DEFAULT_BPMN !== 'undefined' ? DEFAULT_BPMN : '');
    // Das Modell gehört zum Werk dieser Landkarte – es landet in dessen Ordner.
    const item = await spSaveProcess(name, xml, _lkWerk);
    _lkVerweise(k).push({ id: (item && item.id) || '', name });
    if (typeof refreshProzesse === 'function') await refreshProzesse();
    await lkSpeichern(`Modell „${name}" angelegt ✓`, `Modell „${name}" für „${k.name}" angelegt`);
    closeModal();
    if (item && item.id && typeof openProcessEditor === 'function') openProcessEditor(item.id);
  } catch (e) {
    toast('Anlegen fehlgeschlagen: ' + e.message, 'error');
  }
}

function lkVerknuepfenDialog(id) {
  const k = lkKachelVonId(id);
  if (!k) return;
  const schon = new Set(lkModellVerweise(k).map(v => v.id).filter(Boolean));
  const alle = ((typeof _processes !== 'undefined' && Array.isArray(_processes)) ? _processes : [])
    .filter(p => !schon.has(p.itemId))   // was schon hängt, nicht noch einmal anbieten
    // Modelle des eigenen Werks zuerst – die sind in aller Regel gemeint.
    .sort((a, b) => ((b.ordner || '') === _lkWerk) - ((a.ordner || '') === _lkWerk)
      || (a.title || '').localeCompare(b.title || '', 'de'));
  if (!alle.length) { toast('Es gibt kein weiteres Modell zum Verknüpfen.', 'error'); return; }
  openModal(`
    <div class="modal-header"><h3>Modell verknüpfen</h3>
      <button class="modal-close" onclick="lkKachelOeffnen('${esc(k.id)}')">×</button></div>
    <div class="modal-body">
      <p class="field-hint" style="margin:0 0 10px">Welches vorhandene BPMN-Modell gehört zu „${esc(k.name)}"?</p>
      <div class="form-group full">
        <select id="lk-proc-wahl">
          ${alle.map(p => `<option value="${esc(p.itemId)}">${esc(p.title)} · ${
            esc(p.ordner ? lkWerkLabel(p.ordner) : 'ohne Werk')}</option>`).join('')}
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
  const verweise = _lkVerweise(k);
  if (verweise.some(v => v.id === p.itemId)) { toast('Dieses Modell hängt bereits an der Kachel.', 'error'); return; }
  verweise.push({ id: p.itemId, name: p.title });
  closeModal();
  await lkSpeichern(`„${k.name}" mit „${p.title}" verknüpft ✓`, `„${k.name}" mit Modell „${p.title}" verknüpft`);
}

/** Ein einzelnes Modell von der Kachel lösen (die Datei bleibt bestehen). */
async function lkModellLoesen(id, itemId) {
  const k = lkKachelVonId(id);
  if (!k || !lkDarfSchreiben()) return;
  const verweise = _lkVerweise(k);
  const i = verweise.findIndex(v => v.id === itemId);
  if (i < 0) return;
  const name = verweise[i].name || '';
  verweise.splice(i, 1);
  closeModal();
  await lkSpeichern('Verknüpfung gelöst ✓',
    `Modell${name ? ' „' + name + '"' : ''} von „${k.name}" gelöst – die Datei bleibt bestehen`);
}

/* ── Kacheln bearbeiten ──────────────────────────────────────────────── */

function lkKachelNeu() {
  if (!lkDarfSchreiben()) return;
  // In einer Werk-Karte gilt ein neuer Prozess zunächst für dieses Werk;
  // auf Konzern-Ebene konzernweit. Beides bleibt änderbar.
  const vorgabe = (_lkWerk === 'KONZERN') ? ['ALLE'] : [_lkWerk];
  _lkEditing = { id: '', band: 'unterstuetzung', name: '', unter: '', geltung: vorgabe, prozesse: [], regelwerke: [], neu: true };
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
    lkKacheln().push({ id, band: k.band, name, unter: String(k.unter || '').trim(), geltung, prozesse: [], regelwerke: [] });
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
  if (typeof vkFokus === 'function') vkFokus('prozess:' + _lkWerk + ':' + id);
}
