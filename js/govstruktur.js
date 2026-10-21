/**
 * Reiter „Governance-Struktur“
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
  { key: "Weitere",                   erklaerung: "Vorlagen und Muster außerhalb der Pyramide" },
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

   Eine Sicht „nach Verantwortung“ gab es kurz; sie zeigte dieselben Daten noch
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

/** Darf die angemeldete Person Regelungen pflegen? */
function gsDarfSchreiben() {
  return typeof canWriteTab !== 'function' || canWriteTab('govstruktur');
}

/** Darf sie darüber hinaus den Aufbau ändern – also Zeilen und Spalten?
 *  Eigenes Recht: Eine umbenannte Ebene betrifft alles, was daran hängt. */
function gsDarfStruktur() {
  if (!gsDarfSchreiben()) return false;
  return typeof darfGovStrukturKoepfe !== 'function' || darfGovStrukturKoepfe();
}

/** Startbestand aus dem Import der Mappe (tiefe Kopie – die Konstanten bleiben unberührt). */
function gsStartbestand() {
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  return {
    arten: kopie(GOV_ARTEN),
    kategorien: kopie(GOV_KATEGORIEN),
    eintraege: kopie(GOV_EINTRAEGE),
    weitere: kopie(typeof GOV_WEITERE !== 'undefined' ? GOV_WEITERE : []),
    historie: [],
    stand: GOV_STAND,
  };
}

function gsEintraege() { return (_gsDaten && _gsDaten.eintraege) || []; }
function gsWeitere()   { return (_gsDaten && _gsDaten.weitere) || []; }

/** Spalten der Matrix. Auch die Ebenen sind gepflegte Daten, keine Konstanten:
 *  Die Pyramide kann sich ändern, und dann soll niemand im Code nachziehen müssen. */
function gsArten() {
  const arten = (_gsDaten && Array.isArray(_gsDaten.arten) && _gsDaten.arten.length)
    ? _gsDaten.arten : GOV_ARTEN;
  // Was in Einträgen steht, aber in keiner Spalte, würde sonst unsichtbar –
  // deshalb defensiv ergänzen (z. B. nach einem Import von Hand).
  const out = arten.slice();
  gsEintraege().forEach(e => {
    if (e.art && !out.some(a => a.key === e.art)) out.push({ key: e.art, erklaerung: '' });
  });
  return out;
}

/** Zeilen der Matrix. */
function gsKategorien() {
  const basis = (_gsDaten && Array.isArray(_gsDaten.kategorien) && _gsDaten.kategorien.length)
    ? _gsDaten.kategorien : GOV_KATEGORIEN;
  const out = [...basis];
  gsEintraege().forEach(e => { if (e.kategorie && !out.includes(e.kategorie)) out.push(e.kategorie); });
  return out;
}

/** Zeilen/Spalten im Arbeitsstand festschreiben (vor dem Ändern eines Kopfes). */
function _gsKoepfeSichern() {
  if (!_gsDaten) return;
  if (!Array.isArray(_gsDaten.arten) || !_gsDaten.arten.length) _gsDaten.arten = JSON.parse(JSON.stringify(gsArten()));
  if (!Array.isArray(_gsDaten.kategorien) || !_gsDaten.kategorien.length) _gsDaten.kategorien = gsKategorien();
}

/** Mehrere Verantwortliche stehen in der Mappe als „Muster/Muster/Muster“ oder „A, B“. */
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

/** Sind die Daten schon da? (ohne sie nachzuladen) */
function gsDatenGeladen() { return _gsGeladen; }

/** Dokumentenarten für den Regelwerk- und Konzept-Editor: die <b>Spaltenköpfe</b>
 *  der Matrix, also die Verbindlichkeitsebenen der Regelwerkspyramide
 *  (Handbuch, Policy, Konzernrichtlinie, …). Sie standen bis dahin als feste Liste
 *  im Code und wichen ab („Richtlinie“ statt „Policy“, „Weitere“ fehlte).
 *  Ein bereits gesetzter Wert bleibt wählbar, auch wenn er dort nicht (mehr)
 *  steht – sonst spränge er beim nächsten Speichern still um. */
function regelwerkArten(aktuell) {
  const basis = (typeof gsArten === 'function') ? gsArten() : GOV_ARTEN;
  const out = basis.map(a => String((a && a.key) || '').trim()).filter(Boolean);
  const a = String(aktuell || '').trim();
  if (a && !out.some(k => k.toLowerCase() === a.toLowerCase())) out.push(a);
  return out;
}

/** Erklärung zu einer Dokumentenart ('' = keine hinterlegt) – als Hilfe im Editor. */
function regelwerkArtHinweis(key) {
  const t = String(key || '').trim().toLowerCase();
  const basis = (typeof gsArten === 'function') ? gsArten() : GOV_ARTEN;
  const a = basis.find(x => String((x && x.key) || '').trim().toLowerCase() === t);
  return (a && a.erklaerung) || '';
}

/**
 * Kategorien für die Klassifikation eines Regelwerks.
 * Sie kommen aus der Governance-Struktur – dieselbe Systematik, in der das
 * Konzernregelwerk geführt wird. Zwei Listen nebeneinander wären zwei
 * Wahrheiten; gepflegt wird sie an einer Stelle, im Reiter Governance-Struktur.
 * @param {string} [aktuell] bisheriger Wert – bleibt wählbar, auch wenn er aus
 *   einer alten Systematik stammt (sonst spränge er beim Speichern still um)
 */
function regelwerkKategorien(aktuell) {
  const out = (typeof gsKategorien === 'function') ? gsKategorien().slice() : [];
  const a = String(aktuell || '').trim();
  if (a && !out.some(k => String(k).toLowerCase() === a.toLowerCase())) out.push(a);
  return out;
}

/** Daten laden, ohne zu zeichnen – für alle, die nur die Kategorien brauchen. */
async function gsDatenLaden() {
  if (_gsGeladen) return _gsDaten;
  try {
    const gespeichert = (typeof spLoadGovStruktur === 'function') ? await spLoadGovStruktur() : null;
    if (gespeichert && gespeichert.daten && Array.isArray(gespeichert.daten.eintraege)) {
      const d = gespeichert.daten;
      _gsDaten = {
        arten: (Array.isArray(d.arten) && d.arten.length) ? d.arten : JSON.parse(JSON.stringify(GOV_ARTEN)),
        kategorien: (Array.isArray(d.kategorien) && d.kategorien.length) ? d.kategorien : [...GOV_KATEGORIEN],
        eintraege: d.eintraege,
        weitere: Array.isArray(d.weitere) ? d.weitere : [],
        historie: Array.isArray(d.historie) ? d.historie : [],
        stand: d.stand || GOV_STAND,
      };
      _gsGeaendertAm = gespeichert.geaendertAm || '';
    } else {
      _gsDaten = gsStartbestand();
      _gsGeaendertAm = '';
    }
  } catch (e) {
    console.warn('[govstruktur] Laden fehlgeschlagen:', e.message);
    _gsDaten = gsStartbestand();
  }
  _gsGeladen = true;
  return _gsDaten;
}

async function initGovStruktur() {
  const mount = document.getElementById('govstruktur-mount');
  if (!mount) return;
  if (!_gsGeladen) {
    mount.innerHTML = '<div class="doc-loading">Governance-Struktur wird geladen …</div>';
    try {
      const gespeichert = (typeof spLoadGovStruktur === 'function') ? await spLoadGovStruktur() : null;
      if (gespeichert && gespeichert.daten && Array.isArray(gespeichert.daten.eintraege)) {
        const d = gespeichert.daten;
        _gsDaten = {
          // Ältere Fassungen kennen noch keine gepflegten Köpfe – dann gilt der Startbestand.
          arten: (Array.isArray(d.arten) && d.arten.length) ? d.arten : JSON.parse(JSON.stringify(GOV_ARTEN)),
          kategorien: (Array.isArray(d.kategorien) && d.kategorien.length) ? d.kategorien : [...GOV_KATEGORIEN],
          eintraege: d.eintraege,
          weitere: Array.isArray(d.weitere) ? d.weitere : [],
          historie: Array.isArray(d.historie) ? d.historie : [],
          stand: d.stand || GOV_STAND,
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

/** Wie viele Einträge der Verlauf behält – genug für ein Vierteljahr Arbeit. */
const GS_VERLAUF_MAX = 100;

/** Eine Änderung im Verlauf festhalten (neueste zuerst). */
function _gsVerlauf(was) {
  if (!_gsDaten || !was) return;
  if (!Array.isArray(_gsDaten.historie)) _gsDaten.historie = [];
  const u = (typeof State !== 'undefined' && State.user) ? State.user : {};
  _gsDaten.historie.unshift({
    am: new Date().toISOString(),
    upn: u.upn || '',
    name: u.name || u.upn || 'unbekannt',
    was,
  });
  if (_gsDaten.historie.length > GS_VERLAUF_MAX) _gsDaten.historie.length = GS_VERLAUF_MAX;
}

function gsHistorie() { return (_gsDaten && Array.isArray(_gsDaten.historie)) ? _gsDaten.historie : []; }

/** Änderung sichern. Vorher prüfen, ob jemand anderes zwischenzeitlich gespeichert hat.
 *  @param {string} [was] Kurztext für den Versionsverlauf – ohne ihn wird nichts protokolliert. */
async function gsSpeichern(meldung, was) {
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
    _gsVerlauf(was);
    _gsDaten.gespeichertAm = new Date().toISOString();
    _gsDaten.gespeichertVon = (typeof State !== 'undefined' && State.user) ? State.user.upn : '';
    _gsGeaendertAm = await spSaveGovStruktur(_gsDaten);
    toast(meldung || 'Gespeichert ✓', 'success');
    if (was) renderGovStruktur();     // damit „Zuletzt geändert“ sofort stimmt
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
        ? 'Kachel anklicken zum Bearbeiten, <b>ziehen</b> verschiebt sie in eine andere Zelle, <b>+</b> legt dort eine neue an.'
          + (gsDarfStruktur()
            ? ' Zeilen und Spalten lassen sich über ihre Köpfe umbenennen, verschieben und ergänzen.'
            : ' Den <b>Aufbau</b> (Zeilen und Spalten) ändert nur, wer dafür eigens freigeschaltet ist.')
        : '👁 Nur-Lese-Zugriff. Änderungen sind gesperrt.'}
      Startbestand aus der Zuständigkeiten-Mappe des Corporate-Governance-Boards,
      <b>Stand ${esc((_gsDaten && _gsDaten.stand) || GOV_STAND)}</b>.
    </div>
    <div class="gs-kennzahlen">
      <div class="gs-kz"><span class="n">${gesamt}</span><span class="l">Regelungen</span></div>
      ${['gueltig', 'arbeit', 'offen'].map(st => `
        <div class="gs-kz" style="cursor:pointer" onclick="gsStatusFilter(${jsArg(_gsStatus === st ? '' : st)})"
          title="Nach diesem Stand filtern">
          <span class="n" style="color:${GOV_STATUS[st].farbe}">${zahl(st)}</span>
          <span class="l">${GOV_STATUS[st].label}${_gsStatus === st ? ' ✓' : ''}</span></div>`).join('')}
      <div class="gs-balken">${balken}</div>
    </div>`;

  const verlauf = gsHistorie();
  const letzte = verlauf[0];
  const verlaufZeile = letzte
    ? `<div class="gs-verlauf">🕘 Zuletzt geändert: <b>${esc(letzte.was)}</b>
        · ${esc(letzte.name)} · ${esc(gsZeit(letzte.am))}
        <button class="btn btn-ghost btn-sm" onclick="gsVerlaufZeigen()">Versionsverlauf (${verlauf.length})</button></div>`
    : `<div class="gs-verlauf">🕘 Noch keine Änderung erfasst. Der Verlauf beginnt mit der ersten Bearbeitung.</div>`;

  const trefferHinweis = rows.length !== gesamt
    ? `<div class="field-hint" style="margin-bottom:10px"><b>${rows.length}</b> von ${gesamt} passen zum Filter
       · <button class="btn btn-ghost btn-sm" onclick="gsFilterZuruecksetzen()">Filter zurücksetzen</button></div>`
    : '';

  mount.innerHTML = kopf + verlaufZeile + trefferHinweis + gsMatrixHtml(rows, schreiben)
    + gsLegendeHtml() + gsWeitereHtml(schreiben);
}

/** Ein Eintrag als Kachel – Titel, Verantwortung, Stand. Beim Bearbeiten außerdem
 *  greifbar: Ziehen legt sie in eine andere Zelle, also andere Kategorie/Ebene. */
function gsKachel(e, schreiben) {
  const st = GOV_STATUS[e.status] || GOV_STATUS.offen;
  const treffer = gsPolicyTreffer(e.titel);
  const stand = [e.version, e.datum].filter(Boolean).join(' · ');
  const i = gsEintraege().indexOf(e);
  return `<div class="gs-kachel${schreiben ? ' klickbar' : ''}" style="background:${st.flaeche};border-color:${st.rand}"
      ${schreiben ? `onclick="gsBearbeiten(${i})" role="button" tabindex="0"
        draggable="true" ondragstart="gsZiehStart(event,${i})" ondragend="gsZiehEnde(event)"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();gsBearbeiten(${i})}"` : ''}
      title="${esc(e.statusRoh || st.label)}${stand ? ' · ' + esc(stand) : ''}${e.dokument ? ' · ' + esc(e.dokument) : ''}${schreiben ? '. Anklicken zum Bearbeiten, ziehen zum Verschieben' : ''}">
      <div class="t">${esc(e.titel)}</div>
      <div class="m">
        <span class="o">${esc(e.owner || 'noch offen')}</span>
        <span class="s" style="color:${st.farbe}">${esc(st.label)}</span>
      </div>
      ${treffer ? `<button class="gs-link" onclick="event.stopPropagation();openDetail(${jsArg(treffer.id)})"
        title="Dieses Regelwerk liegt bereits im RMS">→ im RMS</button>` : ''}
    </div>`;
}

function gsMatrixHtml(rows, schreiben) {
  const struktur = schreiben && gsDarfStruktur();
  const alleArten = gsArten();
  // Beim Bearbeiten alle Ebenen zeigen – sonst käme man in eine leere Ebene nie hinein.
  const arten = schreiben ? alleArten : alleArten.filter(a => gsEintraege().some(e => e.art === a.key));
  const kategorien = gsKategorien();

  const pfeil = (fn, i, richtung, zeichen, titel) => `<button class="gs-pfeil" onclick="event.stopPropagation();${fn}(${i},${richtung})"
      title="${esc(titel)}">${zeichen}</button>`;

  const kopf = `<tr>
      <th class="gs-ecke">Kategorie${struktur ? ' <span class="gs-hinweis">Kopf anklicken zum Umbenennen</span>' : ''}</th>
      ${arten.map((a, i) => `<th title="${esc(a.erklaerung || a.key)}">
        <div class="gs-kopf${struktur ? ' klickbar' : ''}"
          ${struktur ? `onclick="gsEbeneBearbeiten(${i})" role="button" tabindex="0"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();gsEbeneBearbeiten(${i})}"` : ''}>
          <span class="gs-kopf-t">${esc(a.key)}</span>
          <span class="gs-n">${rows.filter(e => e.art === a.key).length}</span>
          ${struktur ? `<span class="gs-pfeile">
            ${i > 0 ? pfeil('gsEbeneVerschieben', i, -1, '‹', 'Spalte nach links') : ''}
            ${i < arten.length - 1 ? pfeil('gsEbeneVerschieben', i, 1, '›', 'Spalte nach rechts') : ''}
          </span>` : ''}
        </div></th>`).join('')}
      ${struktur ? '<th class="gs-anhang"><button class="gs-plus" onclick="gsEbeneNeu()" title="Neue Ebene (Spalte) anlegen">+ Ebene</button></th>' : ''}
    </tr>`;

  const koerper = kategorien.map((k, ki) => {
    const inZeile = rows.filter(e => e.kategorie === k);
    return `<tr>
      <th class="gs-kat">
        <div class="gs-kopf${struktur ? ' klickbar' : ''}"
          ${struktur ? `onclick="gsKategorieBearbeiten(${ki})" role="button" tabindex="0"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();gsKategorieBearbeiten(${ki})}"` : ''}>
          <span class="gs-kopf-t">${esc(k)}</span>
          <span class="gs-n">${inZeile.length}</span>
          ${struktur ? `<span class="gs-pfeile">
            ${ki > 0 ? pfeil('gsKategorieVerschieben', ki, -1, '‹', 'Zeile nach oben') : ''}
            ${ki < kategorien.length - 1 ? pfeil('gsKategorieVerschieben', ki, 1, '›', 'Zeile nach unten') : ''}
          </span>` : ''}
        </div></th>
      ${arten.map((a, ai) => {
        const zellen = inZeile.filter(e => e.art === a.key);
        return `<td${schreiben ? ` ondragover="gsZiehUeber(event,this)" ondragleave="gsZiehRaus(this)"
            ondrop="gsZiehAblegen(event,this,${ki},${ai})"` : ''}>${zellen.map(e => gsKachel(e, schreiben)).join('')
          || (schreiben ? '' : '<span class="gs-leer">–</span>')}
          ${schreiben ? `<button class="gs-plus" onclick="gsNeu(${ki},${ai})"
            title="Neue Regelung in „${esc(k)}“ als ${esc(a.key)}">+</button>` : ''}</td>`;
      }).join('')}
      ${struktur ? '<td class="gs-anhang"></td>' : ''}
    </tr>`;
  }).join('');

  const fuss = struktur
    ? `<tr><th class="gs-kat"><button class="gs-plus" onclick="gsKategorieNeu()"
         title="Neue Kategorie (Zeile) anlegen">+ Kategorie</button></th>
       <td colspan="${arten.length + 1}"></td></tr>`
    : '';
  return `<div class="gs-tabelle-wrap"><table class="gs-tabelle">
      <thead>${kopf}</thead><tbody>${koerper}${fuss}</tbody></table></div>`;
}

function gsLegendeHtml() {
  return `<details class="gs-legende">
    <summary>Was bedeuten die Dokumentenarten?</summary>
    <table class="gs-legende-tbl"><tbody>${gsArten().map(a =>
      `<tr><td><b>${esc(a.key)}</b></td><td>${esc(a.erklaerung || '')}</td></tr>`).join('')}</tbody></table>
    <div class="field-hint" style="margin-top:8px">Von oben nach unten nimmt die Verbindlichkeit ab:
      Ein Handbuch fasst ein Themengebiet abschließend, ein Leitfaden empfiehlt.</div>
  </details>`;
}

function gsWeitereHtml(schreiben) {
  const liste = gsWeitere();
  const bereiche = [...new Set(liste.map(e => e.bereich))];
  return `<details class="gs-legende">
    <summary>Weitere Regelungsebenen (${liste.length}) außerhalb der Regelwerkspyramide</summary>
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
      Regelungen (KBV/BV) sind Bestandteile der Corporate Governance. Aufgrund ihres eigenständigen
      Charakters sowie ihrer normativen bzw. hierarchischen Stellung sind sie jedoch nicht dem
      Konzernregelwerk zuzuordnen.</div>
  </details>`;
}

/* ── Bearbeiten ── */

let _gsEdit = null;   // { index, feld: … } – der offene Dialog

const _gsFeld = 'width:100%;border:1px solid #d1d5db;border-radius:7px;padding:8px 11px;font-size:.875rem;font-family:inherit';

/** Kategorie/Ebene aus Index oder Name auflösen – die Matrix übergibt Indizes,
 *  damit Namen mit Apostroph die Bedienelemente nicht zerlegen. */
function _gsKatName(x) { return (typeof x === 'number') ? (gsKategorien()[x] || '') : String(x || ''); }
function _gsArtName(x) { return (typeof x === 'number') ? ((gsArten()[x] || {}).key || '') : String(x || ''); }

function gsNeu(kategorie, art) {
  gsDialog({
    kategorie: _gsKatName(kategorie), art: _gsArtName(art),
    titel: '', owner: '', status: 'offen', dokument: '', version: '', datum: '',
  }, -1);
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
            ${gsArten().map(a => `<option value="${esc(a.key)}"${a.key === e.art ? ' selected' : ''}>${esc(a.key)}</option>`).join('')}
          </select>
          <span class="field-hint">Bestimmt die Spalte, also die Verbindlichkeit.</span>
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
  if (!gsArten().some(a => a.key === e.art)) { toast('Bitte eine Dokumentenart wählen.', 'error'); return; }
  // Leere Felder nicht mitschleppen – die Datei bleibt lesbar
  Object.keys(e).forEach(k => { if (!e[k]) delete e[k]; });
  e.status = e.status || 'offen';

  const neu = _gsEdit.index < 0;
  if (neu) _gsDaten.eintraege.push(e);
  else _gsDaten.eintraege[_gsEdit.index] = { ..._gsDaten.eintraege[_gsEdit.index], ...e, statusRoh: undefined };
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern(neu ? 'Regelung angelegt ✓' : 'Regelung gespeichert ✓',
    `Regelung „${e.titel}“ ${neu ? 'angelegt' : 'geändert'} (${e.kategorie} / ${e.art})`);
  initGovStrukturFilter();
}

async function gsLoeschen(i) {
  const e = gsEintraege()[i];
  if (!e) return;
  if (!confirm(`„${e.titel}“ aus der Governance-Struktur entfernen?`)) return;
  _gsDaten.eintraege.splice(i, 1);
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern('Regelung entfernt ✓', `Regelung „${e.titel}“ entfernt (${e.kategorie} / ${e.art})`);
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
  await gsSpeichern(neu ? 'Eintrag angelegt ✓' : 'Eintrag gespeichert ✓',
    `Eintrag „${e.titel}“ ${neu ? 'angelegt' : 'geändert'} (${e.bereich})`);
}

async function gsWeitereLoeschen(i) {
  const e = gsWeitere()[i];
  if (!e) return;
  if (!confirm(`„${e.titel}“ entfernen?`)) return;
  _gsDaten.weitere.splice(i, 1);
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern('Eintrag entfernt ✓', `Eintrag „${e.titel}“ entfernt (${e.bereich})`);
}

/* ── Kacheln verschieben ──
   Eine Regelung in der falschen Zelle ist der häufigste Fehler beim Aufbau einer
   solchen Matrix. Ziehen ist dafür der kürzeste Weg; über den Dialog geht es
   weiterhin auch (Kategorie und Ebene stehen dort als Felder). */

let _gsZieht = -1;   // Index der gerade gezogenen Regelung

function gsZiehStart(ev, i) {
  if (!gsDarfSchreiben()) return;
  _gsZieht = i;
  try {
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', String(i));   // Firefox braucht Nutzlast
  } catch (e) { /* egal – der Index steht in _gsZieht */ }
  if (ev.target && ev.target.classList) ev.target.classList.add('zieht');
}

function gsZiehEnde(ev) {
  _gsZieht = -1;
  if (ev && ev.target && ev.target.classList) ev.target.classList.remove('zieht');
  document.querySelectorAll('.gs-tabelle td.ziel').forEach(td => td.classList.remove('ziel'));
}

function gsZiehUeber(ev, td) {
  if (_gsZieht < 0) return;
  ev.preventDefault();                       // ohne das lehnt der Browser das Ablegen ab
  ev.dataTransfer.dropEffect = 'move';
  if (td && td.classList) td.classList.add('ziel');
}

function gsZiehRaus(td) { if (td && td.classList) td.classList.remove('ziel'); }

async function gsZiehAblegen(ev, td, ki, ai) {
  if (ev && ev.preventDefault) ev.preventDefault();
  if (td && td.classList) td.classList.remove('ziel');
  let i = _gsZieht;
  if (i < 0 && ev && ev.dataTransfer) i = parseInt(ev.dataTransfer.getData('text/plain'), 10);
  _gsZieht = -1;
  if (!gsDarfSchreiben() || !(i >= 0)) return;
  const e = gsEintraege()[i];
  if (!e) return;
  const kategorie = _gsKatName(ki);
  const art = _gsArtName(ai);
  if (!kategorie || !art) return;
  if (e.kategorie === kategorie && e.art === art) return;    // in derselben Zelle abgelegt
  const vonKat = e.kategorie, vonArt = e.art;
  e.kategorie = kategorie;
  e.art = art;
  renderGovStruktur();
  const wohin = (vonKat !== kategorie ? `${kategorie}` : '') + (vonArt !== art ? `${vonKat !== kategorie ? ' / ' : ''}${art}` : '');
  await gsSpeichern(`Verschoben nach „${wohin}“ ✓`, `Regelung „${e.titel}“ verschoben: ${vonKat} / ${vonArt} → ${kategorie} / ${art}`);
}

/* ── Zeilen und Spalten bearbeiten ──
   Auch die Beschriftungen sind Daten: Wird eine Ebene oder Kategorie umbenannt,
   ziehen alle Regelungen mit, die daran hängen – sonst hinge die Hälfte der
   Matrix plötzlich in einer Spalte, die es nicht mehr gibt. */

function gsEbeneNeu() { gsEbeneDialog({ key: '', erklaerung: '' }, -1); }

function gsEbeneBearbeiten(i) {
  const a = gsArten()[i];
  if (a) gsEbeneDialog({ ...a }, i);
}

function gsEbeneDialog(entwurf, index) {
  if (!gsDarfStruktur()) return;
  _gsEdit = { entwurf, index, ebene: true };
  const anzahl = index >= 0 ? gsEintraege().filter(e => e.art === entwurf.key).length : 0;
  openModal(`
    <div class="modal-header">
      <h3>${index < 0 ? 'Neue Ebene (Spalte)' : 'Ebene bearbeiten'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full">
          <label>Bezeichnung <span class="req">*</span></label>
          <input type="text" id="gs-e-key" value="${esc(entwurf.key || '')}" style="${_gsFeld}"
            placeholder="z. B. Konzernrichtlinie">
          ${anzahl ? `<span class="field-hint">${anzahl} Regelung(en) stehen in dieser Spalte, sie ziehen beim Umbenennen mit.</span>` : ''}
        </div>
        <div class="form-group full">
          <label>Erklärung</label>
          <input type="text" id="gs-e-erklaerung" value="${esc(entwurf.erklaerung || '')}" style="${_gsFeld}"
            placeholder="Was regelt diese Ebene? Erscheint als Tooltip und in der Legende.">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      ${index >= 0 ? `<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="gsEbeneLoeschen(${index})">Löschen</button>` : ''}
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="gsEbeneUebernehmen()">${index < 0 ? 'Anlegen' : 'Speichern'}</button>
    </div>`, false, { label: 'Ebene bearbeiten' });
}

async function gsEbeneUebernehmen() {
  if (!gsDarfStruktur()) { toast('Den Aufbau der Governance-Struktur darf nur ändern, wer dafür freigeschaltet ist.', 'error'); return; }
  if (!_gsEdit) return;
  const key = (document.getElementById('gs-e-key')?.value || '').trim();
  const erklaerung = (document.getElementById('gs-e-erklaerung')?.value || '').trim();
  if (!key) { toast('Bitte eine Bezeichnung angeben.', 'error'); return; }
  _gsKoepfeSichern();
  const i = _gsEdit.index;
  const doppelt = _gsDaten.arten.some((a, j) => j !== i && a.key.toLowerCase() === key.toLowerCase());
  if (doppelt) { toast('Diese Ebene gibt es schon.', 'error'); return; }
  let meldung = 'Ebene angelegt ✓';
  let verlaufText = `Ebene „${key}“ angelegt`;
  if (i < 0) {
    _gsDaten.arten.push({ key, erklaerung });
  } else {
    const alt = _gsDaten.arten[i].key;
    _gsDaten.arten[i] = { key, erklaerung };
    if (alt !== key) _gsDaten.eintraege.forEach(e => { if (e.art === alt) e.art = key; });
    meldung = 'Ebene gespeichert ✓';
    verlaufText = (alt !== key) ? `Ebene „${alt}“ umbenannt in „${key}“` : `Ebene „${key}“ bearbeitet`;
  }
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern(meldung, verlaufText);
}

async function gsEbeneLoeschen(i) {
  if (!gsDarfStruktur()) { toast('Den Aufbau der Governance-Struktur darf nur ändern, wer dafür freigeschaltet ist.', 'error'); return; }
  _gsKoepfeSichern();
  const a = _gsDaten.arten[i];
  if (!a) return;
  if (_gsDaten.arten.length <= 1) { toast('Mindestens eine Ebene muss bleiben.', 'error'); return; }
  const betroffen = gsEintraege().filter(e => e.art === a.key);
  if (!betroffen.length) {
    if (!confirm(`Ebene „${a.key}“ entfernen?`)) return;
    _gsDaten.arten.splice(i, 1);
    closeModal();
    _gsEdit = null;
    renderGovStruktur();
    await gsSpeichern('Ebene entfernt ✓', `Ebene „${a.key}“ entfernt (war leer)`);
    return;
  }
  // Nicht stillschweigend Regelungen mitlöschen – sie brauchen ein neues Zuhause.
  gsUmziehenDialog({
    titel: `Ebene „${a.key}“ entfernen`,
    text: `${betroffen.length} Regelung(en) stehen in dieser Spalte. Wohin sollen sie?`,
    ziele: _gsDaten.arten.filter((x, j) => j !== i).map(x => x.key),
    aktion: 'gsEbeneUmziehenUndLoeschen(' + i + ')',
  });
}

async function gsEbeneUmziehenUndLoeschen(i) {
  if (!gsDarfStruktur()) { toast('Den Aufbau der Governance-Struktur darf nur ändern, wer dafür freigeschaltet ist.', 'error'); return; }
  const ziel = (document.getElementById('gs-umzug-ziel')?.value || '').trim();
  if (!ziel) return;
  _gsKoepfeSichern();
  const alt = _gsDaten.arten[i].key;
  _gsDaten.eintraege.forEach(e => { if (e.art === alt) e.art = ziel; });
  _gsDaten.arten.splice(i, 1);
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern(`Ebene entfernt, Regelungen nach „${ziel}“ verschoben ✓`,
    `Ebene „${alt}“ entfernt, Regelungen nach „${ziel}“ verschoben`);
}

async function gsEbeneVerschieben(i, richtung) {
  if (!gsDarfStruktur()) { toast('Den Aufbau der Governance-Struktur darf nur ändern, wer dafür freigeschaltet ist.', 'error'); return; }
  _gsKoepfeSichern();
  const j = i + richtung;
  if (j < 0 || j >= _gsDaten.arten.length) return;
  const [a] = _gsDaten.arten.splice(i, 1);
  _gsDaten.arten.splice(j, 0, a);
  renderGovStruktur();
  await gsSpeichern('Reihenfolge gespeichert ✓', `Ebene „${a.key}“ nach ${richtung < 0 ? 'links' : 'rechts'} verschoben`);
}

function gsKategorieNeu() { gsKategorieDialog('', -1); }

function gsKategorieBearbeiten(i) {
  const k = gsKategorien()[i];
  if (k !== undefined) gsKategorieDialog(k, i);
}

function gsKategorieDialog(name, index) {
  if (!gsDarfStruktur()) return;
  _gsEdit = { entwurf: name, index, kategorie: true };
  const anzahl = index >= 0 ? gsEintraege().filter(e => e.kategorie === name).length : 0;
  openModal(`
    <div class="modal-header">
      <h3>${index < 0 ? 'Neue Kategorie (Zeile)' : 'Kategorie bearbeiten'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group full">
        <label>Bezeichnung <span class="req">*</span></label>
        <input type="text" id="gs-k-name" value="${esc(name || '')}" style="${_gsFeld}"
          placeholder="z. B. Recht / Steuern / Datenschutz / Versicherungen">
        ${anzahl ? `<span class="field-hint">${anzahl} Regelung(en) stehen in dieser Zeile, sie ziehen beim Umbenennen mit.</span>` : ''}
      </div>
    </div>
    <div class="modal-footer">
      ${index >= 0 ? `<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="gsKategorieLoeschen(${index})">Löschen</button>` : ''}
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="gsKategorieUebernehmen()">${index < 0 ? 'Anlegen' : 'Speichern'}</button>
    </div>`, false, { label: 'Kategorie bearbeiten' });
}

async function gsKategorieUebernehmen() {
  if (!gsDarfStruktur()) { toast('Den Aufbau der Governance-Struktur darf nur ändern, wer dafür freigeschaltet ist.', 'error'); return; }
  if (!_gsEdit) return;
  const name = (document.getElementById('gs-k-name')?.value || '').trim();
  if (!name) { toast('Bitte eine Bezeichnung angeben.', 'error'); return; }
  _gsKoepfeSichern();
  const i = _gsEdit.index;
  if (_gsDaten.kategorien.some((k, j) => j !== i && k.toLowerCase() === name.toLowerCase())) {
    toast('Diese Kategorie gibt es schon.', 'error'); return;
  }
  let meldung = 'Kategorie angelegt ✓';
  let verlaufText = `Kategorie „${name}“ angelegt`;
  if (i < 0) {
    _gsDaten.kategorien.push(name);
  } else {
    const alt = _gsDaten.kategorien[i];
    _gsDaten.kategorien[i] = name;
    if (alt !== name) _gsDaten.eintraege.forEach(e => { if (e.kategorie === alt) e.kategorie = name; });
    meldung = 'Kategorie gespeichert ✓';
    verlaufText = (alt !== name) ? `Kategorie „${alt}“ umbenannt in „${name}“` : `Kategorie „${name}“ bearbeitet`;
  }
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern(meldung, verlaufText);
}

async function gsKategorieLoeschen(i) {
  if (!gsDarfStruktur()) { toast('Den Aufbau der Governance-Struktur darf nur ändern, wer dafür freigeschaltet ist.', 'error'); return; }
  _gsKoepfeSichern();
  const k = _gsDaten.kategorien[i];
  if (k === undefined) return;
  if (_gsDaten.kategorien.length <= 1) { toast('Mindestens eine Kategorie muss bleiben.', 'error'); return; }
  const betroffen = gsEintraege().filter(e => e.kategorie === k);
  if (!betroffen.length) {
    if (!confirm(`Kategorie „${k}“ entfernen?`)) return;
    _gsDaten.kategorien.splice(i, 1);
    closeModal();
    _gsEdit = null;
    renderGovStruktur();
    await gsSpeichern('Kategorie entfernt ✓', `Kategorie „${k}“ entfernt (war leer)`);
    return;
  }
  gsUmziehenDialog({
    titel: `Kategorie „${k}“ entfernen`,
    text: `${betroffen.length} Regelung(en) stehen in dieser Zeile. Wohin sollen sie?`,
    ziele: _gsDaten.kategorien.filter((x, j) => j !== i),
    aktion: 'gsKategorieUmziehenUndLoeschen(' + i + ')',
  });
}

async function gsKategorieUmziehenUndLoeschen(i) {
  if (!gsDarfStruktur()) { toast('Den Aufbau der Governance-Struktur darf nur ändern, wer dafür freigeschaltet ist.', 'error'); return; }
  const ziel = (document.getElementById('gs-umzug-ziel')?.value || '').trim();
  if (!ziel) return;
  _gsKoepfeSichern();
  const alt = _gsDaten.kategorien[i];
  _gsDaten.eintraege.forEach(e => { if (e.kategorie === alt) e.kategorie = ziel; });
  _gsDaten.kategorien.splice(i, 1);
  closeModal();
  _gsEdit = null;
  renderGovStruktur();
  await gsSpeichern(`Kategorie entfernt, Regelungen nach „${ziel}“ verschoben ✓`,
    `Kategorie „${alt}“ entfernt, Regelungen nach „${ziel}“ verschoben`);
}

async function gsKategorieVerschieben(i, richtung) {
  if (!gsDarfStruktur()) { toast('Den Aufbau der Governance-Struktur darf nur ändern, wer dafür freigeschaltet ist.', 'error'); return; }
  _gsKoepfeSichern();
  const j = i + richtung;
  if (j < 0 || j >= _gsDaten.kategorien.length) return;
  const [k] = _gsDaten.kategorien.splice(i, 1);
  _gsDaten.kategorien.splice(j, 0, k);
  renderGovStruktur();
  await gsSpeichern('Reihenfolge gespeichert ✓', `Kategorie „${k}“ nach ${richtung < 0 ? 'oben' : 'unten'} verschoben`);
}

/** Rückfrage, wenn an einer Zeile/Spalte noch Regelungen hängen. */
function gsUmziehenDialog({ titel, text, ziele, aktion }) {
  openModal(`
    <div class="modal-header">
      <h3>${esc(titel)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <p style="margin:0 0 10px;line-height:1.5">${esc(text)}</p>
      <div class="form-group full">
        <label>Verschieben nach</label>
        <select id="gs-umzug-ziel" style="${_gsFeld}">
          ${ziele.map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-danger" onclick="${aktion}">Verschieben und entfernen</button>
    </div>`, false, { label: titel });
}

/** Zeitpunkt lesbar machen – Datum und Uhrzeit, wie man es vorlesen würde. */
function gsZeit(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso || '');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}

/** Versionsverlauf: wer wann was geändert hat. */
function gsVerlaufZeigen() {
  const v = gsHistorie();
  openModal(`
    <div class="modal-header">
      <h3>Versionsverlauf</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      ${v.length ? `<table class="gs-verlauf-tbl"><tbody>${v.map(x => `
        <tr>
          <td class="z">${esc(gsZeit(x.am))}</td>
          <td class="w">${esc(x.name || x.upn || 'unbekannt')}</td>
          <td>${esc(x.was)}</td>
        </tr>`).join('')}</tbody></table>`
        : '<div class="field-hint">Noch keine Änderung erfasst.</div>'}
      <div class="field-hint" style="margin-top:10px">
        Die letzten ${GS_VERLAUF_MAX} Änderungen. Ältere Fassungen der Datei bewahrt SharePoint
        zusätzlich im Versionsverlauf von <code>governance-struktur.json</code> auf.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Schließen</button>
    </div>`, false, { label: 'Versionsverlauf' });
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

