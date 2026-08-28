/**
 * Bausteine für die Mails
 * =======================
 * Rumpf, Knopf und Fußzeile standen in vier Dateien in je zwei bis drei
 * Kopien. Der Knopf sogar dreimal wortgleich – derselbe 130 Zeichen lange
 * Style-String, zweimal „btn" genannt, einmal „mbBtn".
 *
 * Der Preis dafür war nicht theoretisch: Als die Entscheidungs-Links gegen
 * fehlende Kennungen abgesichert werden mussten, war dieselbe Sicherung an
 * drei Stellen einzeln einzubauen. Ändert jemand künftig das Aussehen der
 * Mails, ändert er es hier – oder in keiner.
 *
 * Bewusst ohne eigene Zustände: Diese Datei kennt nur Text.
 */

/** Farben der Entscheidungs-Knöpfe – überall dieselben. */
const MAIL_FARBE = {
  ja:      '#16a34a',
  nein:    '#dc2626',
  neutral: '#17509e',
  warten:  '#64748b',
};

/** Äußerer Rahmen jeder Workflow-Mail. */
function mailRumpf(inhalt) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;font-size:15px;line-height:1.6;color:#1e2939">${inhalt}</div>`;
}

/**
 * Ein Knopf in der Mail.
 *
 * Die Beschriftung wird absichtlich NICHT maskiert: Dort stehen Zeichen wie
 * „✓", „✗" und „→", die aus dem Quelltext kommen, nicht aus Benutzereingaben.
 * Das Ziel dagegen schon – dort steckt eine Kennung aus den Daten.
 */
function mailBtn(href, farbe, label) {
  return `<a href="${esc(href)}" style="display:inline-block;background:${farbe};color:#fff;text-decoration:none;padding:10px 18px;border-radius:7px;font-weight:600;margin:0 8px 8px 0">${label}</a>`;
}

/** Kleingedrucktes am Ende einer Mail. Enthält Links, wird deshalb nicht maskiert. */
function mailFuss(inhalt) {
  return `<p style="color:#9ca3af;font-size:12px;margin-top:20px">${inhalt}</p>`;
}
