/**
 * Gemeinsame Helfer
 * =================
 * Kleine Funktionen, die in mehreren Ansichten gebraucht werden (Dateien,
 * Office-Integration). Bewusst ohne Abhängigkeiten, damit diese Datei als
 * erste geladen werden kann.
 *
 * Hintergrund: Office-Schema, Dateigröße und Datei-Icon lagen zuvor in je zwei
 * bis drei identischen Kopien in admin.js, governance.js und ismsdocs.js –
 * Korrekturen landeten dadurch schnell nur in einer davon.
 */

/** Dateiendung in Kleinbuchstaben (ohne Punkt), '' wenn keine erkennbar. */
function fileExt(name) {
  const s = String(name || '');
  const i = s.lastIndexOf('.');
  return i > -1 ? s.slice(i + 1).toLowerCase() : '';
}

/**
 * URI-Schema, mit dem sich eine Datei in der Desktop-Office-App öffnen lässt
 * (ms-word:ofe|u|<url>). @returns 'ms-word' | 'ms-excel' | 'ms-powerpoint' | null
 */
function officeScheme(name) {
  const ext = fileExt(name);
  if (['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf'].includes(ext)) return 'ms-word';
  if (['xls', 'xlsx', 'xlsm', 'xlsb', 'csv'].includes(ext)) return 'ms-excel';
  if (['ppt', 'pptx', 'pps', 'ppsx'].includes(ext)) return 'ms-powerpoint';
  return null;
}

/** Dateigröße lesbar machen (B / KB / MB); '–' wenn unbekannt. */
function fmtFileSize(bytes) {
  if (!bytes) return '–';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/** Passendes Symbol zum Dateityp (für Listen). */
function fileIcon(name) {
  const ext = fileExt(name);
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return '📗';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return '📙';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'].includes(ext)) return '🖼️';
  if (['zip', '7z', 'rar', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['txt', 'md', 'log'].includes(ext)) return '📃';
  return '📄';
}

/* Node-Export nur für Tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fileExt, officeScheme, fmtFileSize, fileIcon };
}
