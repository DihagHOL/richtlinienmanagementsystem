'use strict';

/**
 * Folien am Bildschirm
 * ====================
 * Der Rahmen, in dem das RMS Folien zeigt: die Vorstellung im Notfall-Reiter
 * und die Präsentation einer Schulung in der Bibliothek. Eine Folie ist
 * 1600 × 900 und wird in den freien Platz eingepasst; Pfeiltasten und Leertaste
 * blättern, Escape schließt, „Drucken / PDF“ gibt jede Folie als eigene Seite aus.
 *
 * Folien bringt der Aufrufer als fertige `<section class="vs-folie">` mit.
 * Steht der Inhalt in einem `.vs-inhalt`, wird er verkleinert, wenn er nicht
 * auf die Folie passt.
 */

let _flStand = { nr: 0, anzahl: 0 };

/**
 * @param {string} folienHtml  die Folien, aneinandergereiht
 * @param {object} [opt]       { label: für Bildschirmleser, knoepfe: HTML vor „Drucken“, nr: erste Folie }
 * @returns {HTMLElement} die Bühne, damit der Aufrufer nachzeichnen kann
 */
function folienOeffnen(folienHtml, opt) {
  const o = opt || {};
  folienSchliessen();
  const root = document.createElement('div');
  root.className = 'vs-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', o.label || 'Folien');
  root.innerHTML = `
    <div class="vs-leiste">
      <button class="btn btn-sm btn-outline" onclick="folienBlaettern(-1)" title="Zurück (Pfeil links)">‹</button>
      <span class="vs-zaehler"></span>
      <button class="btn btn-sm btn-outline" onclick="folienBlaettern(1)" title="Weiter (Pfeil rechts)">›</button>
      <span class="vs-luft"></span>
      ${o.knoepfe || ''}
      <button class="btn btn-sm btn-outline" onclick="folienDrucken()">Drucken / PDF</button>
      <button class="btn btn-sm btn-primary" onclick="folienSchliessen()">Schließen</button>
    </div>
    <div class="vs-buehne">${folienHtml}</div>`;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  const anzahl = root.querySelectorAll('.vs-folie').length;
  _flStand = { nr: Math.max(0, Math.min(Number(o.nr) || 0, anzahl - 1)), anzahl };
  document.addEventListener('keydown', _flTaste);
  window.addEventListener('resize', _flSkalieren);
  _flZeigen();
  _flSkalieren();
  return root.querySelector('.vs-buehne');
}

function folienSchliessen() {
  const alt = document.querySelector('.vs-root');
  if (alt) { alt.remove(); document.body.style.overflow = ''; }
  document.removeEventListener('keydown', _flTaste);
  window.removeEventListener('resize', _flSkalieren);
}

function folienBlaettern(schritt) {
  _flStand.nr = Math.max(0, Math.min(_flStand.anzahl - 1, _flStand.nr + schritt));
  _flZeigen();
}

/** Welche Folie gerade steht (für Aufrufer, die sich die Stelle merken). */
function folienNr() { return _flStand.nr; }

function _flZeigen() {
  const root = document.querySelector('.vs-root');
  if (!root) return;
  root.querySelectorAll('.vs-folie').forEach((f, i) => f.classList.toggle('vs-aktiv', i === _flStand.nr));
  const z = root.querySelector('.vs-zaehler');
  if (z) z.textContent = `${_flStand.nr + 1} / ${_flStand.anzahl}`;
  folienEinpassen();
}

/**
 * Passt der Inhalt einer Folie nicht, wird er kleiner: höchstens auf 60 %.
 * Ohne Angabe die sichtbare Folie; die anderen kommen dran, wenn sie zu sehen sind.
 */
function folienEinpassen(folie) {
  const f = folie || document.querySelector('.vs-root .vs-folie.vs-aktiv');
  const inhalt = f && f.querySelector('.vs-inhalt');
  if (!inhalt) return;
  inhalt.style.zoom = '';
  const platz = f.clientHeight - inhalt.offsetTop - 70;   // unten bleibt Luft für die Fußzeile
  const hoehe = inhalt.scrollHeight;
  if (platz > 0 && hoehe > platz) inhalt.style.zoom = String(Math.max(0.6, platz / hoehe).toFixed(3));
}

/** Die Folie ist 1600 × 900 und wird in den freien Platz eingepasst. */
function _flSkalieren() {
  const root = document.querySelector('.vs-root');
  if (!root) return;
  const buehne = root.querySelector('.vs-buehne');
  const k = Math.min(buehne.clientWidth / 1600, buehne.clientHeight / 900);
  root.style.setProperty('--vs-skala', String(k > 0 ? k : 1));
}

function _flTaste(e) {
  // Ein Dialog liegt darüber: Dort tippt man, und sein Escape schließt nur ihn
  // (er hört vorher und markiert das Ereignis als verbraucht).
  if (e.defaultPrevented || document.querySelector('#modal-mount .modal')) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); folienBlaettern(1); }
  else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); folienBlaettern(-1); }
  else if (e.key === 'Escape') folienSchliessen();
}

function folienDrucken() {
  const stil = document.createElement('style');
  stil.textContent = '@page { size: 297mm 167mm; margin: 0 }';
  document.head.appendChild(stil);
  document.body.classList.add('vs-drucken');
  // Im Druck stehen alle Folien da: jede einpassen, nicht nur die sichtbare.
  document.querySelectorAll('.vs-root .vs-folie').forEach(f => folienEinpassen(f));
  const fertig = () => { document.body.classList.remove('vs-drucken'); stil.remove(); window.removeEventListener('afterprint', fertig); };
  window.addEventListener('afterprint', fertig);
  window.print();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { folienOeffnen, folienSchliessen, folienBlaettern, folienEinpassen, folienDrucken, folienNr };
}
