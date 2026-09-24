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

/**
 * Ein Wert als Argument in einem Inline-Handler: `onclick="f(${jsArg(x)})"`.
 *
 * `esc()` genügt dort nicht. Der Browser entschlüsselt die Entitäten eines
 * Attributs, BEVOR er das JavaScript darin ausführt – aus `&#39;` wird wieder
 * ein `'`. Ein Dateiname wie „x');alert(1);('.docx" in `f('${esc(name)}')`
 * brach so aus dem String aus und lief als Code, mit den Graph-Rechten der
 * angemeldeten Person.
 *
 * Deshalb zwei Schichten in der richtigen Reihenfolge: erst ein JavaScript-
 * Literal (JSON maskiert Anführungszeichen, Backslash, Zeilenumbrüche), dann
 * fürs Attribut escapen. Das Ergebnis bringt seine Anführungszeichen selbst
 * mit – also OHNE eigene Quotes drumherum schreiben. Es ist immer ein String,
 * wie vorher `'…'` auch.
 */
function jsArg(v) {
  return JSON.stringify(String(v ?? ''))
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Ein Eintrag des Prozess-Verknüpfungs-Caches, auf eine Form gebracht.
 *
 * Der Cache (`_procLinkCache` in `js/prozesse.js`, gespiegelt in
 * `localStorage`) hält heute `{ p: [Kennung,…], d: Anlagen, k: kein Diagramm }`.
 * Ältere Stände legten dort nur die Liste der Kennungen ab. Weil der Speicher
 * die Sitzung überlebt, treffen beide Formen aufeinander – genau daran ist die
 * Mindmap mit „ids.forEach is not a function" gescheitert.
 *
 * Bewusst eine reine Funktion über den Eintrag statt über den Schlüssel: So
 * kennt sie keinen globalen Zustand und liegt hier, wo jede Datei sie erreicht.
 * Die Ablage selbst bleibt bei ihrem Eigentümer.
 *
 * Seit die Modelle einander als Unterprozess einbinden, stehen zwei Felder
 * mehr darin: `i` – die Kennung des Prozesses (das `id` von <bpmn:process>),
 * und `u` – die Kennungen der eingebundenen Modelle ([[rms:modell=…]]).
 *
 * `alt: true` heißt „unvollständig für die Kartenansicht" – dort fehlen
 * Anlagenzahl, Diagramm-Warnung oder die Unterprozesse. Die Richtlinien-
 * Kennungen selbst stehen in allen Formen vollständig drin.
 *
 * @returns {{p: string[], d: number, k: boolean, i: string, u: string[], alt: boolean}|null}
 */
function procLinkEintrag(e) {
  if (!e) return null;
  if (Array.isArray(e)) return { p: e, d: 0, k: false, i: '', u: [], alt: true };
  return {
    p: Array.isArray(e.p) ? e.p : [],
    d: Number(e.d) || 0,
    k: !!e.k,
    i: String(e.i || ''),
    u: Array.isArray(e.u) ? e.u.map(String) : [],
    alt: !('k' in e) || !('u' in e),
  };
}

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
/**
 * Die absolute Adresse einer Datei aus `assets/` – für Druckfenster und
 * Bescheinigungen. Die entstehen per `window.open('')` + `document.write`,
 * also ohne eigene Adresse; ein relativer Pfad hinge dort in der Luft.
 * Außerhalb des Browsers (Tests, Cron) gilt die Live-Adresse.
 */
function rmsAssetUrl(datei) {
  const basis = (typeof document !== 'undefined' && document.baseURI) || 'https://rms.dihag.de/';
  return new URL('assets/' + datei, basis).href;
}

/**
 * Der Kopf jeder Druckfassung: links das vollständige DIHAG-Logo, rechts
 * eine Zeile, woher das Blatt stammt. Bewusst mit Inline-Stil, damit ihn jede
 * Druckseite einbinden kann, ohne ihr eigenes CSS anzufassen – davon gibt es
 * ein knappes Dutzend, jede mit eigenem Stilblock.
 */
function druckKopf(zeile) {
  const rechts = zeile === undefined ? 'Regelwerk-Management' : String(zeile || '');
  return `<div class="druck-kopf" style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0 0 16px;padding:0 0 10px;border-bottom:2px solid #17509E">`
    + `<img src="${rmsAssetUrl('dihag-logo.png')}" alt="DIHAG Integrated Foundry Group" style="height:42px;width:auto">`
    + (rechts ? `<span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6b7280">${rechts}</span>` : '')
    + `</div>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { jsArg, fileExt, officeScheme, fmtFileSize, fileIcon, rmsAssetUrl, druckKopf };
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

/** Adresse auf einem SharePoint-Host des Tenants (auch …-my.sharepoint.com). */
const VIDEO_SHAREPOINT = /^https:\/\/[a-z0-9-]+\.sharepoint\.com(?:[:\/?#]|$)/i;

/** @returns {{art:'einbetten'|'link', src:string}|null} */
function videoEinbettung(eingabe) {
  let url = String(eingabe || '').trim();
  if (!url) return null;
  const iframe = url.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);   // ganzes Einbetten-Schnipsel
  if (iframe) url = iframe[1];
  url = url.replace(/&amp;/g, '&').trim();
  if (!/^https?:\/\//i.test(url)) return null;

  // Eingebettet wird embed.aspx nur aus SharePoint selbst. Den Pfad kann jeder
  // Server nachbauen – ein fremder Rahmen mitten in der App könnte etwa eine
  // falsche Microsoft-Anmeldung zeigen. Alles andere wird ein ehrlicher Link.
  if (/\/_layouts\/15\/embed\.aspx/i.test(url) && VIDEO_SHAREPOINT.test(url)) return { art: 'einbetten', src: url };

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
const VIDEO_INTERN = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:sharepoint\.com|dihag\.de|dihag\.com)(?:[:\/?#]|$)/i;   // am Host, nicht irgendwo in der Adresse

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
