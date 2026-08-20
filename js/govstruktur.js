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
   Zwei Blickwinkel auf dieselben Daten: die Matrix beantwortet „was fehlt uns
   wo?", die Verantwortungssicht „wer hat wie viel offen?". Beides braucht das
   Board – deshalb ein Umschalter statt zweier Reiter. */

let _gsModus = 'matrix';   // 'matrix' | 'owner'
let _gsSuche = '';
let _gsStatus = '';        // '' | 'gueltig' | 'arbeit' | 'offen'
let _gsOwner = '';

const GOV_STATUS = {
  gueltig: { label: 'gültig',    farbe: '#166534', flaeche: '#dcfce7', rand: '#86efac' },
  arbeit:  { label: 'in Arbeit', farbe: '#92400e', flaeche: '#fef3c7', rand: '#fcd34d' },
  offen:   { label: 'offen',     farbe: '#475569', flaeche: '#f1f5f9', rand: '#cbd5e1' },
};

/** Mehrere Verantwortliche stehen in der Mappe als „Muster/Muster/Muster" oder „A, B". */
function gsOwnerListe(owner) {
  return String(owner || '').split(/[\/,]/).map(x => x.trim()).filter(Boolean);
}

/** Alle Verantwortlichen, alphabetisch – für den Filter. */
function gsAlleOwner() {
  const set = new Set();
  GOV_EINTRAEGE.forEach(e => gsOwnerListe(e.owner).forEach(o => set.add(o)));
  return [...set].sort((a, b) => a.localeCompare(b, 'de'));
}

function gsGefiltert() {
  const q = _gsSuche.toLowerCase().trim();
  return GOV_EINTRAEGE.filter(e => {
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

function gsModus(m) { _gsModus = m; renderGovStruktur(); }
function gsSuche(v) { _gsSuche = v || ''; renderGovStruktur(); }
function gsStatusFilter(v) { _gsStatus = v || ''; renderGovStruktur(); }
function gsOwnerFilter(v) { _gsOwner = v || ''; renderGovStruktur(); }

function renderGovStruktur() {
  const mount = document.getElementById('govstruktur-mount');
  if (!mount) return;
  ['matrix', 'owner'].forEach(m => {
    const b = document.getElementById('gs-modus-' + m);
    if (b) b.classList.toggle('an', _gsModus === m);
  });
  const rows = gsGefiltert();
  const zahl = (st) => GOV_EINTRAEGE.filter(e => e.status === st).length;
  const gesamt = GOV_EINTRAEGE.length;
  const anteil = (n) => Math.round(n / Math.max(1, gesamt) * 100);

  const balken = ['gueltig', 'arbeit', 'offen'].map(st =>
    `<div title="${zahl(st)} ${GOV_STATUS[st].label}" style="width:${anteil(zahl(st))}%;background:${GOV_STATUS[st].rand}"></div>`).join('');

  const kopf = `
    <div class="view-desc" style="margin:0 0 12px">
      Das <b>Konzernregelwerk</b> als Matrix: <b>Kategorie</b> (Fundament) × <b>Dokumentenart</b>
      (Verbindlichkeitsebene). Quelle ist die Zuständigkeiten-Mappe des Corporate-Governance-Boards,
      <b>Stand ${esc(GOV_STAND)}</b> – eine Momentaufnahme der Planung, kein Live-Bestand.
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

  mount.innerHTML = kopf + trefferHinweis
    + (_gsModus === 'owner' ? gsOwnerHtml(rows) : gsMatrixHtml(rows))
    + gsLegendeHtml() + gsWeitereHtml();
}

function gsFilterZuruecksetzen() {
  _gsSuche = ''; _gsStatus = ''; _gsOwner = '';
  const s = document.getElementById('search-govstruktur'); if (s) s.value = '';
  const o = document.getElementById('filter-gs-owner'); if (o) o.value = '';
  renderGovStruktur();
}

/** Ein Eintrag als Kachel – Titel, Verantwortung, Stand. */
function gsKachel(e) {
  const st = GOV_STATUS[e.status] || GOV_STATUS.offen;
  const treffer = gsPolicyTreffer(e.titel);
  const stand = [e.version, e.datum].filter(Boolean).join(' · ');
  return `<div class="gs-kachel" style="background:${st.flaeche};border-color:${st.rand}"
      title="${esc(e.statusRoh || st.label)}${stand ? ' · ' + esc(stand) : ''}${e.dokument ? '\n' + esc(e.dokument) : ''}">
      <div class="t">${esc(e.titel)}</div>
      <div class="m">
        <span class="o">${esc(e.owner || 'offen')}</span>
        <span class="s" style="color:${st.farbe}">${esc(st.label)}</span>
      </div>
      ${treffer ? `<button class="gs-link" onclick="openDetail('${esc(treffer.id)}')" title="Dieses Regelwerk liegt bereits im RMS">→ im RMS</button>` : ''}
    </div>`;
}

function gsMatrixHtml(rows) {
  // Spalten: nur Arten, die überhaupt vorkommen – sonst stünden leere Spalten herum.
  const arten = GOV_ARTEN.filter(a => GOV_EINTRAEGE.some(e => e.art === a.key));
  const kopf = `<tr>
      <th class="gs-ecke">Kategorie</th>
      ${arten.map(a => `<th title="${esc(a.erklaerung)}">${esc(a.key)}
        <span class="gs-n">${rows.filter(e => e.art === a.key).length}</span></th>`).join('')}
    </tr>`;
  const koerper = GOV_KATEGORIEN.map(k => {
    const inZeile = rows.filter(e => e.kategorie === k);
    return `<tr>
      <th class="gs-kat">${esc(k)}<span class="gs-n">${inZeile.length}</span></th>
      ${arten.map(a => {
        const zellen = inZeile.filter(e => e.art === a.key);
        return `<td>${zellen.length ? zellen.map(gsKachel).join('') : '<span class="gs-leer">–</span>'}</td>`;
      }).join('')}
    </tr>`;
  }).join('');
  return `<div class="gs-tabelle-wrap"><table class="gs-tabelle"><thead>${kopf}</thead><tbody>${koerper}</tbody></table></div>`;
}

function gsOwnerHtml(rows) {
  const jeOwner = new Map();
  for (const e of rows) {
    for (const o of (gsOwnerListe(e.owner).length ? gsOwnerListe(e.owner) : ['(noch offen)'])) {
      if (!jeOwner.has(o)) jeOwner.set(o, []);
      jeOwner.get(o).push(e);
    }
  }
  if (!jeOwner.size) return emptyState('Keine Treffer für die aktuelle Suche/Filterung.', '🔍');
  const karten = [...jeOwner.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'de'))
    .map(([owner, liste]) => {
      const zaehl = (st) => liste.filter(e => e.status === st).length;
      return `<div class="gs-owner-karte">
        <div class="gs-owner-kopf">
          <b>${esc(owner)}</b>
          <span class="gs-n">${liste.length}</span>
          ${['gueltig', 'arbeit', 'offen'].filter(st => zaehl(st)).map(st =>
            `<span class="gs-pill" style="background:${GOV_STATUS[st].flaeche};color:${GOV_STATUS[st].farbe}">${zaehl(st)} ${GOV_STATUS[st].label}</span>`).join('')}
        </div>
        <div class="gs-owner-liste">${liste.map(e => `
          <div class="gs-zeile">
            <span class="gs-punkt" style="background:${GOV_STATUS[e.status].rand}"></span>
            <span class="gs-zeile-t">${esc(e.titel)}</span>
            <span class="gs-zeile-m">${esc(e.art)} · ${esc(e.kategorie)}</span>
          </div>`).join('')}</div>
      </div>`;
    }).join('');
  return `<div class="gs-owner-grid">${karten}</div>`;
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

function gsWeitereHtml() {
  if (typeof GOV_WEITERE === 'undefined' || !GOV_WEITERE.length) return '';
  const bereiche = [...new Set(GOV_WEITERE.map(e => e.bereich))];
  return `<details class="gs-legende">
    <summary>Weitere Regelungsebenen (${GOV_WEITERE.length}) – außerhalb der Regelwerkspyramide</summary>
    ${bereiche.map(b => `<div style="margin-top:8px"><b>${esc(b)}</b>
      <div class="gs-owner-liste">${GOV_WEITERE.filter(e => e.bereich === b).map(e => `
        <div class="gs-zeile">
          <span class="gs-punkt" style="background:${GOV_STATUS[e.status].rand}"></span>
          <span class="gs-zeile-t">${esc(e.titel)}</span>
          <span class="gs-zeile-m">${esc(e.owner || '–')}</span>
        </div>`).join('')}</div></div>`).join('')}
    <div class="field-hint" style="margin-top:8px">Leitbild, Unternehmenspolitik und kollektivrechtliche
      Regelungen (KBV/BV) stehen in derselben Mappe, gehören aber nicht in die Pyramide des Konzernregelwerks.</div>
  </details>`;
}

/** Owner-Filter befüllen (einmal beim Öffnen des Reiters). */
function initGovStruktur() {
  const sel = document.getElementById('filter-gs-owner');
  if (sel && sel.options.length <= 1) {
    sel.innerHTML = '<option value="">Alle Verantwortlichen</option>'
      + gsAlleOwner().map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  }
  renderGovStruktur();
}
