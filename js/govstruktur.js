/**
 * Reiter „Governance-Struktur"
 * ============================
 * Das Konzernregelwerk als Matrix: <b>Kategorie</b> (Spalten des
 * Konzernregelwerk-Fundaments) × <b>Dokumentenart</b> (Verbindlichkeitsebene der
 * Regelwerkspyramide), dazu Verantwortung und Stand je Regelung.
 *
 * Die Daten sind ein Auszug aus der Zuständigkeiten-Mappe des Corporate-Governance-
 * Boards (CGB_Organisation_Zuständigkeiten_Nomenklatur.xlsx, Stand 12.08.2026).
 * Sie stehen bewusst hier im Code und nicht in SharePoint: Es ist eine
 * Momentaufnahme der Planung, kein Live-Bestand. Ändert sich die Mappe, erzeugt
 * `python scripts/govstruktur-import.py <mappe.xlsx>` diesen Block neu.
 */

/** Verbindlichkeitsebenen der Regelwerkspyramide – oben am verbindlichsten. */
const GOV_ARTEN = [
  { key: "Handbuch",                  erklaerung: "In sich abgeschlossenes Themengebiet (z. B. Code of Conduct)" },
  { key: "Policy",                    erklaerung: "Strategischer Rahmen: Was ist das Ziel, der Grundsatz?" },
  { key: "Konzernrichtlinie",         erklaerung: "Operativer Rahmen: Wie handeln wir?" },
  { key: "Konzernfachregelung",       erklaerung: "Fachgerechte Ausführung" },
  { key: "Arbeits-/Prozessanweisung", erklaerung: "Handlungsanleitung Schritt für Schritt" },
  { key: "Leitfaden",                 erklaerung: "Handlungsempfehlungen" },
  { key: "Weitere",                   erklaerung: "Vorlagen und Muster – außerhalb der Pyramide" },
];

/** Kategorien des Konzernregelwerk-Fundaments (Reihenfolge wie in der Übersicht). */
const GOV_KATEGORIEN = [
  "Allgemein",
  "Recht / Steuern / Datenschutz / Versicherungen",
  "Compliance",
  "Security / Cyber Security",
  "Finanzen / ReWe / Controlling / Einkauf",
  "Nachhaltigkeit / Arbeitssicherheit & Gesundheitsschutz",
  "HR / Corporate Transformation / IT",
];

/** Stand der zugrunde liegenden Mappe. */
const GOV_STAND = "12.08.2026";

/** Ein Eintrag: { kategorie, art, titel, owner, status, … }.
 *  status: 'gueltig' (final abgelegt) | 'arbeit' (in Erarbeitung/Prüfung) | 'offen' (noch nicht begonnen).
 *  Titel und Verantwortung stehen unverändert so in der Mappe. */
const GOV_EINTRAEGE = [];

/** Regelungen außerhalb des Konzernregelwerks – gleiche Mappe, eigene Grobfunktion. */
const GOV_WEITERE = [];

/* ═══════════════════════════════════════════════════
   Ansicht
   ═══════════════════════════════════════════════════
   Die Matrix ist die Arbeitsfläche des Boards, nicht nur ein Bild: Jede Kachel
   lässt sich öffnen und ändern, jede Zelle nimmt neue Regelungen auf, und was
   nicht mehr gilt, fliegt raus. Gespeichert wird sofort nach jeder Änderung in
   `governance-struktur.json` neben der access-config – die Konstanten oben sind
   nur der Startbestand aus der CGB-Mappe.

   Eine Sicht „nach Verantwortung" gab es kurz; sie zeigte dieselben Daten noch
   einmal und ist wieder raus. Wer nach einer Person sucht, filtert die Matrix. */

let _gsDaten = null;        // { eintraege: [], weitere: [], stand: '' } – der Arbeitsstand
let _gsGeaendertAm = '';    // Zeitstempel der gespeicherten Datei (Gleichzeitigkeits-Schutz)
let _gsGeladen = false;
let _gsSuche = '';
let _gsStatus = '';         // '' | 'gueltig' | 'arbeit' | 'offen'
let _gsOwner = '';

const GOV_STATUS = {
  gueltig: { label: 'gültig',    farbe: '#166534', flaeche: '#dcfce7', rand: '#86efac' },
  arbeit:  { label: 'in Arbeit', farbe: '#92400e', flaeche: '#fef3c7', rand: '#fcd34d' },
  offen:   { label: 'offen',     farbe: '#475569', flaeche: '#f1f5f9', rand: '#cbd5e1' },
};

/** Darf die angemeldete Person die Matrix ändern? */
function gsDarfSchreiben() {
  return typeof canWriteTab !== 'function' || canWriteTab('govstruktur');
}

/** Startbestand aus dem Import der Mappe (tiefe Kopie – die Konstanten bleiben unberührt). */
function gsStartbestand() {
  return {
    eintraege: JSON.parse(JSON.stringify(GOV_EINTRAEGE)),
    weitere: JSON.parse(JSON.stringify(typeof GOV_WEITERE !== 'undefined' ? GOV_WEITERE : [])),
    stand: GOV_STAND,
  };
}

function gsEintraege() { return (_gsDaten && _gsDaten.eintraege) || []; }
function gsWeitere()   { return (_gsDaten && _gsDaten.weitere) || []; }

/** Kategorien: die bekannten plus alles, was inzwischen dazugekommen ist. */
function gsKategorien() {
  const out = [...GOV_KATEGORIEN];
  gsEintraege().forEach(e => { if (e.kategorie && !out.includes(e.kategorie)) out.push(e.kategorie); });
  return out;
}

/** Mehrere Verantwortliche stehen in der Mappe als „Muster/Muster/Muster" oder „A, B". */
function gsOwnerListe(owner) {
  return String(owner || '').split(/[\/,]/).map(x => x.trim()).filter(Boolean);
}

/** Alle Verantwortlichen, alphabetisch – für den Filter. */
function gsAlleOwner() {
  const set = new Set();
  gsEintraege().forEach(e => gsOwnerListe(e.owner).forEach(o => set.add(o)));
  return [...set].sort((a, b) => a.localeCompare(b, 'de'));
}

function gsGefiltert() {
  const q = _gsSuche.toLowerCase().trim();
  return gsEintraege().filter(e => {
    if (_gsStatus && e.status !== _gsStatus) return false;
    if (_gsOwner && !gsOwnerListe(e.owner).some(o => o === _gsOwner)) return false;
    if (q && !(`${e.titel} ${e.owner} ${e.kategorie} ${e.art} ${e.dokument || ''}`).toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Gibt es zu dieser Regelung schon ein Regelwerk im RMS? (Titelvergleich, tolerant) */
function gsPolicyTreffer(titel) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
  const t = norm(titel);
  if (t.length < 5) return null;
  return ((typeof State !== 'undefined' && State.policies) || [])
    .find(p => { const n = norm(p.title); return n === t || n.includes(t) || t.includes(n); }) || null;
}

function gsSuche(v) { _gsSuche = v || ''; renderGovStruktur(); }
function gsStatusFilter(v) { _gsStatus = v || ''; renderGovStruktur(); }
function gsOwnerFilter(v) { _gsOwner = v || ''; renderGovStruktur(); }

function gsFilterZuruecksetzen() {
  _gsSuche = ''; _gsStatus = ''; _gsOwner = '';
  const s = document.getElementById('search-govstruktur'); if (s) s.value = '';
  const o = document.getElementById('filter-gs-owner'); if (o) o.value = '';
  renderGovStruktur();
}

/* ── Laden und Speichern ── */

async function initGovStruktur() {
  const mount = document.getElementById('govstruktur-mount');
  if (!mount) return;
  if (!_gsGeladen) {
    mount.innerHTML = '<div class="doc-loading">Governance-Struktur wird geladen …</div>';
    try {
      const gespeichert = (typeof spLoadGovStruktur === 'function') ? await spLoadGovStruktur() : null;
      if (gespeichert && gespeichert.daten && Array.isArray(gespeichert.daten.eintraege)) {
        _gsDaten = {
          eintraege: gespeichert.daten.eintraege,
          weitere: Array.isArray(gespeichert.daten.weitere) ? gespeichert.daten.weitere : [],
          stand: gespeichert.daten.stand || GOV_STAND,
        };
        _gsGeaendertAm = gespeichert.geaendertAm || '';
      } else {
        _gsDaten = gsStartbestand();      // noch nie gespeichert → Stand aus der Mappe
        _gsGeaendertAm = '';
      }
    } catch (e) {
      console.warn('[govstruktur] Laden fehlgeschlagen:', e.message);
      _gsDaten = gsStartbestand();
    }
    _gsGeladen = true;
  }
  const sel = document.getElementById('filter-gs-owner');
  if (sel) {
    sel.innerHTML = '<option value="">Alle Verantwortlichen</option>'
      + gsAlleOwner().map(o => `<option value="${esc(o)}"${_gsOwner === o ? ' selected' : ''}>${esc(o)}</option>`).join('');
  }
  renderGovStruktur();
}

/** Änderung sichern. Vorher prüfen, ob jemand anderes zwischenzeitlich gespeichert hat. */
async function gsSpeichern(meldung) {
  if (!gsDarfSchreiben()) { toast('Nur Lesezugriff auf die Governance-Struktur.', 'error'); return false; }
  try {
    if (_gsGeaendertAm && typeof spGovStrukturMeta === 'function') {
      const jetzt = await spGovStrukturMeta();
      if (jetzt && jetzt !== _gsGeaendertAm) {
        const weiter = confirm('Jemand anderes hat die Governance-Struktur zwischenzeitlich gespeichert.\n\n'
          + 'OK: Ihre Fassung überschreibt die andere.\nAbbrechen: nichts speichern, Reiter neu laden.');
        if (!weiter) return false;
      }
    }
    _gsDaten.gespeichertAm = new Date().toISOString();
    _gsDaten.gespeichertVon = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
    _gsGeaendertAm = await spSaveGovStruktur(_gsDaten);
    toast(meldung || 'Gespeichert ✓', 'success');
    return true;
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
    return false;
  }
}

/* ── Anzeige ── */

function renderGovStruktur() {
  const mount = document.getElementById('govstruktur-mount');
  if (!mount) return;
  if (!_gsDaten) { mount.innerHTML = '<div class="doc-loading">Governance-Struktur wird geladen …</div>'; return; }
  const alle = gsEintraege();
  const rows = gsGefiltert();
  const zahl = (st) => alle.filter(e => e.status === st).length;
  const gesamt = alle.length;
  const anteil = (n) => Math.round(n / Math.max(1, gesamt) * 100);
  const schreiben = gsDarfSchreiben();

  const balken = ['gueltig', 'arbeit', 'offen'].map(st =>
    `<div title="${zahl(st)} ${GOV_STATUS[st].label}" style="width:${anteil(zahl(st))}%;background:${GOV_STATUS[st].rand}"></div>`).join('');

  const kopf = `
    <div class="view-desc" style="margin:0 0 12px">
      Das <b>Konzernregelwerk</b> als Matrix: <b>Kategorie</b> (Fundament) × <b>Dokumentenart</b>
      (Verbindlichkeitsebene). ${schreiben
        ? 'Kachel anklicken zum Bearbeiten, <b>+</b> in einer Zelle legt dort eine neue Regelung an.'
        : '👁 Nur-Lese-Zugriff – Änderungen sind gesperrt.'}
      Startbestand aus der Zuständigkeiten-Mappe des Corporate-Governance-Boards,
      <b>Stand ${esc((_gsDaten && _gsDaten.stand) || GOV_STAND)}</b>.
    </div>
    <div class="gs-kennzahlen">
      <div class="gs-kz"><span class="n">${gesamt}</span><span class="l">Regelungen</span></div>
      ${['gueltig', 'arbeit', 'offen'].map(st => `
        <div class="gs-kz" style="cursor:pointer" onclick="gsStatusFilter('${_gsStatus === st ? '' : st}')"
          title="Nach diesem Stand filtern">
          <span class="n" style="color:${GOV_STATUS[st].farbe}">${zahl(st)}</span>
          <span class="l">${GOV_STATUS[st].label}${_gsStatus === st ? ' ✓' : ''}</span></div>`).join('')}
      <div class="gs-balken">${balken}</div>
    </div>`;

  const trefferHinweis = rows.length !== gesamt
    ? `<div class="field-hint" style="margin-bottom:10px"><b>${rows.length}</b> von ${gesamt} passen zum Filter
       · <button class="btn btn-ghost btn-sm" onclick="gsFilterZuruecksetzen()">Filter zurücksetzen</button></div>`
    : '';

  mount.innerHTML = kopf + trefferHinweis + gsMatrixHtml(rows, schreiben)
    + gsLegendeHtml() + gsWeitereHtml(schreiben);
}

/** Ein Eintrag als Kachel – Titel, Verantwortung, Stand. */
function gsKachel(e, schreiben) {
  const st = GOV_STATUS[e.status] || GOV_STATUS.offen;
  const treffer = gsPolicyTreffer(e.titel);
  const stand = [e.version, e.datum].filter(Boolean).join(' · ');
  const i = gsEintraege().indexOf(e);
  return `<div class="gs-kachel${schreiben ? ' klickbar' : ''}" style="background:${st.flaeche};border-color:${st.rand}"
      ${schreiben ? `onclick="gsBearbeiten(${i})" role="button" tabindex="0"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();gsBearbeiten(${i})}"` : ''}
      title="${esc(e.statusRoh || st.label)}${stand ? ' · ' + esc(stand) : ''}${e.dokument ? ' · ' + esc(e.dokument) : ''}${schreiben ? ' – zum Bearbeiten anklicken' : ''}">
      <div class="t">${esc(e.titel)}</div>
      <div class="m">
        <span class="o">${esc(e.owner || 'noch offen')}</span>
        <span class="s" style="color:${st.farbe}">${esc(st.label)}</span>
      </div>
      ${treffer ? `<button class="gs-link" onclick="event.stopPropagation();openDetail('${esc(treffer.id)}')"
        title="Dieses Regelwerk liegt bereits im RMS">→ im RMS</button>` : ''}
    </div>`;
}

function gsMatrixHtml(rows, schreiben) {
  // Beim Bearbeiten alle Ebenen zeigen – sonst käme man in eine leere Ebene nie hinein.
  const arten = schreiben ? GOV_ARTEN : GOV_ARTEN.filter(a => gsEintraege().some(e => e.art === a.key));
  const kategorien = gsKategorien();
  const kopf = `<tr>
      <th class="gs-ecke">Kategorie</th>
      ${arten.map(a => `<th title="${esc(a.erklaerung)}">${esc(a.key)}
        <span class="gs-n">${rows.filter(e => e.art === a.key).length}</span></th>`).join('')}
    </tr>`;
  const koerper = kategorien.map(k => {
    const inZeile = rows.filter(e => e.kategorie === k);
    return `<tr>
      <th class="gs-kat">${esc(k)}<span class="gs-n">${inZeile.length}</span></th>
      ${arten.map(a => {
        const zellen = inZeile.filter(e => e.art === a.key);
        return `<td>${zellen.map(e => gsKachel(e, schreiben)).join('')
          || (schreiben ? '' : '<span class="gs-leer">–</span>')}
          ${schreiben ? `<button class="gs-plus" onclick="gsNeu('${esc(k)}','${esc(a.key)}')"
            title="Neue Regelung in „${esc(k)}" als ${esc(a.key)}">+</button>` : ''}</td>`;
      }).join('')}
    </tr>`;
  }).join('');
  return `<div class="gs-tabelle-wrap"><table class="gs-tabelle"><thead>${kopf}</thead><tbody>${koerper}</tbody></table></div>`;
}

function gsLegendeHtml() {
  return `<details class="gs-legende">
    <summary>Was bedeuten die Dokumentenarten?</summary>
    <table class="gs-legende-tbl"><tbody>${GOV_ARTEN.map(a =>
      `<tr><td><b>${esc(a.key)}</b></td><td>${esc(a.erklaerung)}</td></tr>`).join('')}</tbody></table>
    <div class="field-hint" style="margin-top:8px">Von oben nach unten nimmt die Verbindlichkeit ab:
      Ein Handbuch fasst ein Themengebiet abschließend, ein Leitfaden empfiehlt.</div>
  </details>`;
}

function gsWeitereHtml(schreiben) {
  const liste = gsWeitere();
  const bereiche = [...new Set(liste.map(e => e.bereich))];
  return `<details class="gs-legende">
    <summary>Weitere Regelungsebenen (${liste.length}) – außerhalb der Regelwerkspyramide</summary>
    ${bereiche.map(b => `<div style="margin-top:8px"><b>${esc(b)}</b>
      <div class="gs-owner-liste">${liste.filter(e => e.bereich === b).map(e => {
        const i = liste.indexOf(e);
        return `<div class="gs-zeile${schreiben ? ' klickbar' : ''}"
            ${schreiben ? `onclick="gsWeitereBearbeiten(${i})" role="button" tabindex="0"
              onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();gsWeitereBearbeiten(${i})}"` : ''}>
            <span class="gs-punkt" style="background:${(GOV_STATUS[e.status] || GOV_STATUS.offen).rand}"></span>
            <span class="gs-zeile-t">${esc(e.titel)}</span>
            <span class="gs-zeile-m">${esc(e.owner || '–')}</span>
          </div>`;
      }).join('')}</div></div>`).join('')}
    ${schreiben ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="gsWeitereNeu()">+ Eintrag</button>` : ''}
    <div class="field-hint" style="margin-top:8px">Leitbild, Unternehmenspolitik und kollektivrechtliche
      Regelungen (KBV/BV) stehen in derselben Mappe, gehören aber nicht in die Pyramide des Konzernregelwerks.</div>
  </details>`;
}

/* ── Bearbeiten ── */

let _gsEdit = null;   // { index, feld: … } – der offene Dialog

const _gsFeld = 'width:100%;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit';

function gsNeu(kategorie, art) {
  gsDialog({ kategorie, art, titel: '', owner: '', status: 'offen', dokument: '', version: '', datum: '' }, -1);
}

function gsBearbeiten(i) {
  const e = gsEintraege()[i];
  if (e) gsDialog(JSON.parse(JSON.stringify(e)), i);
}

function gsDialog(entwurf, index) {
  if (!gsDarfSchreiben()) return;
  _gsEdit = { entwurf, index };
  const e = entwurf;
  const kategorien = gsKategorien();
  openModal(`
    <div class="modal-header">
      <h3>${index < 0 ? 'Neue Regelung' : 'Regelung bearbeiten'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full">
          <label>Titel <span class="req">*</span></label>
          <input type="text" id="gs-f-titel" value="${esc(e.titel || '')}" style="${_gsFeld}"
            placeholder="z. B. Umgang mit Interessenkonflikten">
        </div>
        <div class="form-group">
          <label>Kategorie <span class="req">*</span></label>
          <input type="text" id="gs-f-kategorie" list="gs-kategorien" value="${esc(e.kategorie || '')}" style="${_gsFeld}">
          <datalist id="gs-kategorien">${kategorien.map(k => `<option value="${esc(k)}"></option>`).join('')}</datalist>
          <span class="field-hint">Bestehende wählen oder eine neue eintragen.</span>
        </div>
        <div class="form-group">
          <label>Dokumentenart <span class="req">*</span></label>
          <select id="gs-f-art" style="${_gsFeld}">
            ${GOV_ARTEN.map(a => `<option value="${esc(a.key)}"${a.key === e.art ? ' selected' : ''}>${esc(a.key)}</option>`).join('')}
          </select>
          <span class="field-hint">Bestimmt die Spalte – also die Verbindlichkeit.</span>
        </div>
        <div class="form-group">
          <label>Verantwortung</label>
          <input type="text" id="gs-f-owner" value="${esc(e.owner || '')}" style="${_gsFeld}"
            placeholder="Nachname, mehrere mit / trennen">
        </div>
        <div class="form-group">
          <label>Stand</label>
          <select id="gs-f-status" style="${_gsFeld}">
            ${Object.entries(GOV_STATUS).map(([k, v]) =>
              `<option value="${k}"${k === e.status ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group full">
          <label>Dokumentname (optional)</label>
          <input type="text" id="gs-f-dokument" value="${esc(e.dokument || '')}" style="${_gsFeld}"
            placeholder="Dateiname wie in der Ablage">
        </div>
        <div class="form-group">
          <label>Version (optional)</label>
          <input type="text" id="gs-f-version" value="${esc(e.version || '')}" style="${_gsFeld}" placeholder="V1.1">
        </div>
        <div class="form-group">
          <label>Datum (optional)</label>
          <input type="text" id="gs-f-datum" value="${esc(e.datum || '')}" style="${_gsFeld}" placeholder="TT.MM.JJJJ">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      ${index >= 0 ? `<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="gsLoeschen(${index})">Löschen</button>` : ''}
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="gsUebernehmen()">${index < 0 ? 'Anlegen' : 'Speichern'}</button>
    </div>`, false, { label: 'Regelung bearbeiten' });
}

async function gsUebernehmen() {
  if (!_gsEdit) return;
  const hole = (f) => (document.getElementById('gs-f-' + f)?.value || '').trim();
  const e = {
    kategorie: hole('kategorie'), art: hole('art'), titel: hole('titel'), owner: hole('owner'),
    status: hole('status') || 'offen', dokument: hole('dokument'), version: hole('version'), datum: hole('datum'),
  };
  if (!e.titel) { toast('Bitte einen Titel angeben.', 'error'); return; }
  if (!e.kategorie) { toast('Bitte eine Kategorie wählen oder eintragen.', 'error'); return; }
  if (!GOV_ARTEN.some(a => a.key === e.art)) { toast('Bitte eine Dokumentenart wählen.', 'error'); return; }
  // Leere Felder nicht mitschleppen – die Datei bleibt lesbar
  Object.keys(e).forEach(k => { if (!e[k]) delete e[k]; });
  e.status = e.status || 'offen';

  const neu = _gsEdit.index < 0;
  if (neu) _gsDaten.eintraege.push(e);
  else _gsDaten.eintraege[_gsEdit.index] = { ..._gsDaten.eintraege[_gsEdit.index], ...e, statusRoh: undefined };
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern(neu ? 'Regelung angelegt ✓' : 'Regelung gespeichert ✓');
  initGovStrukturFilter();
}

async function gsLoeschen(i) {
  const e = gsEintraege()[i];
  if (!e) return;
  if (!confirm(`„${e.titel}" aus der Governance-Struktur entfernen?`)) return;
  _gsDaten.eintraege.splice(i, 1);
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern('Regelung entfernt ✓');
  initGovStrukturFilter();
}

/* Einträge außerhalb der Pyramide (Leitbild, Unternehmenspolitik, KBV) */

function gsWeitereNeu() { gsWeitereDialog({ bereich: '', titel: '', owner: '', status: 'offen' }, -1); }

function gsWeitereBearbeiten(i) {
  const e = gsWeitere()[i];
  if (e) gsWeitereDialog(JSON.parse(JSON.stringify(e)), i);
}

function gsWeitereDialog(entwurf, index) {
  if (!gsDarfSchreiben()) return;
  _gsEdit = { entwurf, index, weitere: true };
  const bereiche = [...new Set(gsWeitere().map(x => x.bereich))];
  openModal(`
    <div class="modal-header">
      <h3>${index < 0 ? 'Neuer Eintrag' : 'Eintrag bearbeiten'} (außerhalb der Pyramide)</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full">
          <label>Titel <span class="req">*</span></label>
          <input type="text" id="gs-w-titel" value="${esc(entwurf.titel || '')}" style="${_gsFeld}">
        </div>
        <div class="form-group">
          <label>Bereich <span class="req">*</span></label>
          <input type="text" id="gs-w-bereich" list="gs-bereiche" value="${esc(entwurf.bereich || '')}" style="${_gsFeld}"
            placeholder="z. B. Kollektivrechtliche Regelungen">
          <datalist id="gs-bereiche">${bereiche.map(b => `<option value="${esc(b)}"></option>`).join('')}</datalist>
        </div>
        <div class="form-group">
          <label>Verantwortung</label>
          <input type="text" id="gs-w-owner" value="${esc(entwurf.owner || '')}" style="${_gsFeld}">
        </div>
        <div class="form-group">
          <label>Stand</label>
          <select id="gs-w-status" style="${_gsFeld}">
            ${Object.entries(GOV_STATUS).map(([k, v]) =>
              `<option value="${k}"${k === entwurf.status ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      ${index >= 0 ? `<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="gsWeitereLoeschen(${index})">Löschen</button>` : ''}
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="gsWeitereUebernehmen()">${index < 0 ? 'Anlegen' : 'Speichern'}</button>
    </div>`, false, { label: 'Eintrag bearbeiten' });
}

async function gsWeitereUebernehmen() {
  if (!_gsEdit) return;
  const hole = (f) => (document.getElementById('gs-w-' + f)?.value || '').trim();
  const e = { bereich: hole('bereich'), titel: hole('titel'), owner: hole('owner'), status: hole('status') || 'offen' };
  if (!e.titel) { toast('Bitte einen Titel angeben.', 'error'); return; }
  if (!e.bereich) { toast('Bitte einen Bereich angeben.', 'error'); return; }
  Object.keys(e).forEach(k => { if (!e[k]) delete e[k]; });
  e.status = e.status || 'offen';
  const neu = _gsEdit.index < 0;
  if (neu) _gsDaten.weitere.push(e);
  else _gsDaten.weitere[_gsEdit.index] = { ..._gsDaten.weitere[_gsEdit.index], ...e, statusRoh: undefined };
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern(neu ? 'Eintrag angelegt ✓' : 'Eintrag gespeichert ✓');
}

async function gsWeitereLoeschen(i) {
  const e = gsWeitere()[i];
  if (!e) return;
  if (!confirm(`„${e.titel}" entfernen?`)) return;
  _gsDaten.weitere.splice(i, 1);
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern('Eintrag entfernt ✓');
}

/** Verantwortungs-Filter neu befüllen (nach Änderungen können Namen dazukommen/wegfallen). */
function initGovStrukturFilter() {
  const sel = document.getElementById('filter-gs-owner');
  if (!sel) return;
  const alle = gsAlleOwner();
  if (_gsOwner && !alle.includes(_gsOwner)) _gsOwner = '';
  sel.innerHTML = '<option value="">Alle Verantwortlichen</option>'
    + alle.map(o => `<option value="${esc(o)}"${_gsOwner === o ? ' selected' : ''}>${esc(o)}</option>`).join('');
}

/** Zurück auf den Startbestand aus der CGB-Mappe – nur nach ausdrücklicher Rückfrage. */
async function gsZuruecksetzen() {
  if (!gsDarfSchreiben()) { toast('Nur Lesezugriff auf die Governance-Struktur.', 'error'); return; }
  if (!confirm('Alle Änderungen verwerfen und den Startbestand aus der CGB-Mappe wiederherstellen?\n\n'
    + `Das ersetzt die aktuell ${gsEintraege().length} Regelungen durch die ${GOV_EINTRAEGE.length} aus der Mappe (Stand ${GOV_STAND}).`)) return;
  _gsDaten = gsStartbestand();
  renderGovStruktur();
  await gsSpeichern('Startbestand wiederhergestellt ✓');
  initGovStrukturFilter();
}
