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

/* ═══════════════════════════════════════════════════
   Lernvideos
   ═══════════════════════════════════════════════════
   Eingegeben wird, was Stream/SharePoint beim „Teilen → Einbetten" in die
   Zwischenablage legt (ein ganzes <iframe>-Schnipsel) oder schlicht eine
   Adresse. Beides soll funktionieren, ohne dass jemand HTML verstehen muss.

   Eingebettet wird nur, was sich nachweislich einbetten lässt: Stream und
   SharePoint über embed.aspx, YouTube und Vimeo über ihre Player-Adressen.
   Alles andere bekommt einen Knopf, der in einem neuen Tab öffnet – ein
   leerer Rahmen (X-Frame-Options) wäre schlechter als ein ehrlicher Link. */

/** @returns {{art:'einbetten'|'link', src:string}|null} */
function videoEinbettung(eingabe) {
  let url = String(eingabe || '').trim();
  if (!url) return null;
  const iframe = url.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);   // ganzes Einbetten-Schnipsel
  if (iframe) url = iframe[1];
  url = url.replace(/&amp;/g, '&').trim();
  if (!/^https?:\/\//i.test(url)) return null;

  if (/\/_layouts\/15\/embed\.aspx/i.test(url)) return { art: 'einbetten', src: url };

  // „shorts/" gehört dazu: Kurzvideos sind genau das Format, das man für eine
  // Regel-Erklärung dreht – ohne den Zweig liefe der Link nur als Verweis raus.
  // „youtube-nocookie.com" ebenso: Genau diese Adresse steht im Einbetten-Code,
  // wenn jemand bei YouTube den erweiterten Datenschutzmodus wählt – also im
  // besseren Fall. Ohne den Zweig wäre ausgerechnet der nur ein Link gewesen.
  const yt = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?[^#]*\bv=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  if (yt) return { art: 'einbetten', src: 'https://www.youtube-nocookie.com/embed/' + yt[1] };

  const vi = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vi) return { art: 'einbetten', src: 'https://player.vimeo.com/video/' + vi[1] };

  return { art: 'link', src: url };
}

/* Was im eigenen Haus liegt, braucht keine Quellenangabe – wer dort ablegt,
   ist ohnehin bekannt. Alles andere ist fremdes Material. */
const VIDEO_INTERN = /(\.sharepoint\.com|\/_layouts\/15\/embed\.aspx|\.dihag\.(?:de|com))/i;

/**
 * Woher stammt ein Video? Für fremdes Material gehört eine Quelle dazu –
 * urheberrechtlich und damit die Leserin weiß, wessen Aussage sie gerade hört.
 * @returns {{extern:boolean, dienst:string}} dienst='' wenn keine Adresse erkannt
 */
function videoHerkunft(eingabe) {
  const e = videoEinbettung(eingabe);
  if (!e) return { extern: false, dienst: '' };
  const src = String(e.src || '');
  if (VIDEO_INTERN.test(src)) return { extern: false, dienst: 'SharePoint / Stream' };
  if (/youtube(?:-nocookie)?\.com|youtu\.be/i.test(src)) return { extern: true, dienst: 'YouTube' };
  if (/vimeo\.com/i.test(src)) return { extern: true, dienst: 'Vimeo' };
  return { extern: true, dienst: 'externe Quelle' };
}

/** Externe Videos ohne Quellenangabe – die Liste, die das Speichern anhält. */
function videosOhneQuelle(videos) {
  return (videos || [])
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v && String(v.url || '').trim()
      && videoHerkunft(v.url).extern && !String(v.quelle || '').trim());
}
