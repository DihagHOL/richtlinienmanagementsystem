/**
 * Lernvideos am Regelwerk.
 *
 * Ein Erklärvideo bleibt eher hängen als zwölf Seiten Fließtext. Eingegeben wird,
 * was Stream/SharePoint beim „Teilen → Einbetten" in die Zwischenablage legt – ein
 * ganzes <iframe>-Schnipsel – oder schlicht eine Adresse. Beides muss funktionieren,
 * ohne dass jemand HTML verstehen muss. Und eingebettet werden darf nur, was sich
 * wirklich einbetten lässt: ein leerer Rahmen wäre schlechter als ein Link.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

/* ── 1) Adresse deuten (rechnend) ── */
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(lies('js/util.js'), ctx);
const deute = (x) => vm.runInContext('videoEinbettung(' + JSON.stringify(x) + ')', ctx);

const sp = 'https://dihag.sharepoint.com/sites/ISMS/_layouts/15/embed.aspx?UniqueId=abc-123';
ok(deute(`<iframe width="640" src="${sp}" frameborder="0"></iframe>`)?.src === sp,
  'Der Einbetten-Code aus Stream/SharePoint wird ausgepackt');
ok(deute(`<iframe width="640" src="${sp}"></iframe>`)?.art === 'einbetten', 'Und direkt abgespielt');
ok(deute(sp)?.art === 'einbetten', 'Die nackte embed.aspx-Adresse ebenso');
ok(deute(`<iframe src='${sp}'></iframe>`)?.src === sp, 'Auch mit einfachen Anführungszeichen');
ok(deute('https://dihag.sharepoint.com/sites/ISMS/_layouts/15/embed.aspx?a=1&amp;b=2')?.src
  === 'https://dihag.sharepoint.com/sites/ISMS/_layouts/15/embed.aspx?a=1&b=2',
  'HTML-Maskierung im Code wird zurückgedreht');

const ytErwartet = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
ok(deute('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')?.src === ytErwartet, 'YouTube-Adresse wird zur Player-Adresse');
ok(deute('https://youtu.be/dQw4w9WgXcQ')?.src === ytErwartet, 'Auch die Kurzform');
ok(deute('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.src === ytErwartet,
  'Und Shorts – genau das Format, in dem kurze Erklärvideos entstehen');
ok(deute('https://www.youtube.com/embed/dQw4w9WgXcQ')?.src === ytErwartet, 'Und eine schon fertige Einbettung');
ok(/nocookie/.test(ytErwartet), 'YouTube läuft ohne Cookies – der Aufruf soll niemanden verfolgen');
ok(deute('https://vimeo.com/76979871')?.src === 'https://player.vimeo.com/video/76979871', 'Vimeo ebenso');

const teilen = 'https://dihag.sharepoint.com/:v:/s/ISMS/EabcXYZ?e=1';
ok(deute(teilen)?.art === 'link' && deute(teilen)?.src === teilen,
  'Ein normaler Teilen-Link lässt sich nicht einbetten → Knopf statt leerem Rahmen');
ok(deute('nur text') === null, 'Text ohne Adresse ergibt nichts');
ok(deute('') === null && deute(null) === null && deute(undefined) === null, 'Leere Eingaben stürzen nicht ab');
ok(deute('javascript:alert(1)') === null, 'Nur http(s) wird akzeptiert');
ok(deute('  https://vimeo.com/12345  ')?.art === 'einbetten', 'Leerzeichen drumherum stören nicht');

/* ── 2) Gespeichert wird ohne neue SharePoint-Spalte ── */
const shp = lies('js/sharepoint.js');
ok(/\{ feld: 'videos',\s+spalte: '',\s+json: true,\s+leer: \[\] \}/.test(shp),
  'Videos liegen im Sammelfeld DatenJson – keine neue Spalte nötig');
ok(/if \(!Array\.isArray\(out\.videos\)\) out\.videos = \[\];/.test(shp), 'Kaputte Daten kippen die App nicht');

/* ── 3) Editor ── */
const adm = lies('js/admin.js');
ok(/function renderVideoEditorSection/.test(adm), 'Der Editor hat einen Video-Abschnitt');
ok(/\$\{renderVideoEditorSection\(\)\}/.test(adm), 'Und er wird eingebunden');
ok(/onclick="vidAdd\(\)"/.test(adm) && /onclick="vidRemove\(\$\{i\}\)"/.test(adm), 'Videos lassen sich anlegen und entfernen');
ok(/wird direkt in der Seite abgespielt/.test(adm) && /öffnet in einem neuen Tab/.test(adm),
  'Der Editor sagt sofort, ob abgespielt oder verlinkt wird');
ok(/Teilen → Einbetten/.test(adm), 'Und wo der Code herkommt');
ok(/videos: \[\]/.test(adm), 'Neue Regelwerke starten mit leerer Videoliste');

/* ── 4) Leseansicht ── */
const app = lies('js/app.js');
ok(/function renderLernvideos/.test(app), 'Die Leseansicht zeigt die Videos');
ok(app.indexOf('${renderLernvideos(p)}') > app.indexOf('doc-frame-host'),
  'Sie stehen unter dem Dokument – das Lese-Gate hängt am Dokument, nicht am Video');
ok(/allowfullscreen/.test(app) && /loading="lazy"/.test(app), 'Vollbild ja, Laden erst bei Bedarf');
ok(/target="_blank" rel="noopener"/.test(app), 'Nicht einbettbare Videos öffnen sicher in einem neuen Tab');
ok(/\.filter\(v => v && String\(v\.url \|\| ''\)\.trim\(\)\)/.test(app), 'Leere Einträge werden übersprungen');
const css = lies('css/style.css');
ok(/\.lernvideo-rahmen \{[^}]*padding-top: 56\.25%/.test(css), 'Der Rahmen behält 16:9, egal wie breit');

/* ── 4a) Das Video darf den Status nicht verdrängen ──
   Die Detailansicht ist ein Raster: Dokument links, Status rechts. Das Video
   spannt beide Spalten – ohne feste Zuweisung rutschte die Statuskarte dadurch
   in die dritte Zeile, also unter das Video statt neben das Dokument. */
ok(/\.detail-grid \{[^}]*grid-template-columns: 1fr 320px/.test(css), 'Detailansicht: zwei Spalten');
ok(/\.detail-status \{ grid-column: 2; grid-row: 1; \}/.test(css),
  'Die Statuskarte sitzt fest in Spalte 2, Zeile 1 – neben dem Dokument');
ok(/\.lernvideo-wrap \{[^}]*grid-column: 1 \/ -1/.test(css), 'Das Video spannt weiterhin die volle Breite');
const eng = css.slice(css.indexOf('@media (max-width: 900px) {\n  .detail-grid'));
ok(/\.detail-status \{ grid-column: 1; grid-row: auto; \}/.test(eng.slice(0, 300)),
  'Auf schmalen Geräten wird die Zuweisung wieder aufgehoben – sonst entstünde eine zweite Spalte');
ok(/<div id="ack-host" class="detail-status">/.test(app), 'Die Leseansicht vergibt die Klasse');

/* ── 5) Dokumentation ── */
const doku = lies('js/dokumentation.js');
ok(/sec\('wissenstest', 'Wissenstest & Lernvideos'/.test(doku), 'Die Dokumentation hat einen eigenen Abschnitt');
ok(/\['wissenstest',\s+'Wissenstest & Lernvideos'\]/.test(doku), 'Und er steht im Inhaltsverzeichnis');
ok(/Rechte am Video<\/b> vergibt SharePoint/.test(doku), 'Sie erklärt, wer das Video sehen darf');
ok(/Wissenstest & Lernvideos/.test(lies('docs/BENUTZERHANDBUCH.md')), 'Das Handbuch ebenfalls');

/* ══════════════════════════════════════════════════════════════════
   youtube-nocookie: ausgerechnet die datenschutzfreundliche Adresse
   ══════════════════════════════════════════════════════════════════ */

// Wer bei YouTube den erweiterten Datenschutzmodus wählt, bekommt genau diese
// Adresse in den Einbetten-Code. Vorher fiel sie durch und lief als bloßer Link.
const nc = deute('https://www.youtube-nocookie.com/embed/8hKPmMOMuz8');
ok(nc && nc.art === 'einbetten' && nc.src === 'https://www.youtube-nocookie.com/embed/8hKPmMOMuz8',
  'youtube-nocookie.com wird eingebettet, nicht verlinkt');
ok(deute('<iframe src="https://www.youtube-nocookie.com/embed/abc123XYZ?start=7"></iframe>')?.src
   === 'https://www.youtube-nocookie.com/embed/abc123XYZ',
  'Auch aus dem Einbetten-Code samt Parametern');
ok(deute('https://www.youtube.com/watch?v=8hKPmMOMuz8')?.src === 'https://www.youtube-nocookie.com/embed/8hKPmMOMuz8',
  'Eine gewöhnliche YouTube-Adresse landet weiterhin auf der nocookie-Fassung');

/* ══════════════════════════════════════════════════════════════════
   Herkunft und Quellenangabe
   ══════════════════════════════════════════════════════════════════ */

const herkunft = (x) => vm.runInContext('videoHerkunft(' + JSON.stringify(x) + ')', ctx);
ok(herkunft(sp).extern === false, 'Was in SharePoint/Stream liegt, ist kein fremdes Material');
ok(herkunft('https://dihag.sharepoint.com/sites/x/video.mp4').extern === false, 'Der eigene Mandant ebenso wenig');
ok(herkunft('https://www.youtube.com/watch?v=8hKPmMOMuz8').extern === true
   && herkunft('https://www.youtube.com/watch?v=8hKPmMOMuz8').dienst === 'YouTube', 'YouTube ist extern');
ok(herkunft('https://www.youtube-nocookie.com/embed/8hKPmMOMuz8').dienst === 'YouTube',
  'Die nocookie-Fassung ebenfalls – dieselbe Quelle, nur höflicher');
ok(herkunft('https://vimeo.com/12345').dienst === 'Vimeo', 'Vimeo wird erkannt');
ok(herkunft('https://beispiel.test/film.mp4').extern === true, 'Alles Unbekannte gilt als extern');
ok(herkunft('kein link').dienst === '', 'Ohne Adresse keine Herkunft');

const ohne = (v) => vm.runInContext('videosOhneQuelle(' + JSON.stringify(v) + ')', ctx);
ok(ohne([{ url: 'https://www.youtube.com/watch?v=8hKPmMOMuz8', quelle: '' }]).length === 1,
  'Ein externes Video ohne Quelle wird gemeldet');
ok(ohne([{ url: 'https://www.youtube.com/watch?v=8hKPmMOMuz8', quelle: 'Bundesamt für Sicherheit in der Informationstechnik (BSI)' }]).length === 0,
  'Mit Quelle nicht mehr');
ok(ohne([{ url: sp, quelle: '' }]).length === 0, 'Eigenes Material braucht keine');
ok(ohne([{ url: '', quelle: '' }]).length === 0, 'Und eine leere Zeile ist kein Verstoß');
ok(ohne([{ url: 'https://vimeo.com/1', quelle: '   ' }]).length === 1, 'Leerzeichen sind keine Quelle');
ok(ohne(null).length === 0 && ohne([]).length === 0, 'Ohne Videos nichts zu melden');
ok(ohne([{ url: sp }, { url: 'https://vimeo.com/1' }])[0].i === 1,
  'Gemeldet wird die Nummer des betroffenen Videos, nicht irgendeine');

/* ══════════════════════════════════════════════════════════════════
   Verdrahtung: Editor, Speichern, Leseansicht
   ══════════════════════════════════════════════════════════════════ */

const appjs = app, tourjs = lies('js/tour.js');
ok(/vidSet\(\$\{i\},'quelle',this\.value\)/.test(adm), 'Der Editor hat ein Quellenfeld');
ok(/Bundesamt für Sicherheit in der Informationstechnik \(BSI\)/.test(adm),
  'Mit dem Beispiel im Platzhalter – ein leeres Feld sagt niemandem, was gemeint ist');
ok(/quelleFehlt/.test(adm) && /Fremdes Material/.test(adm),
  'Fehlt sie bei fremdem Material, steht es sichtbar am Video');
ok(/videos\.push\(\{ titel: '', url: '', quelle: '' \}\)/.test(adm), 'Neue Videos bringen das Feld gleich mit');
ok(/const ohne = videosOhneQuelle\(p\.videos\);/.test(adm) && /Bitte die Quelle angeben/.test(adm),
  'Das Speichern hält an, solange fremdes Material ohne Quelle darin steht');
ok(adm.indexOf('videosOhneQuelle(p.videos)') < adm.indexOf('pruefeFremdaenderung'),
  'Und zwar vor dem Schreibzugriff, nicht danach');

ok(/lernvideo-quelle/.test(appjs) && /Quelle: \$\{esc\(quelle\)\}/.test(appjs),
  'In der Leseansicht steht die Quelle unter dem Video');
ok(/Eingebettet über \$\{esc\(h\.dienst\)\}/.test(appjs),
  'Fehlt sie im Altbestand, nennt die Zeile wenigstens den Dienst – stumm einbetten wäre schlechter');
ok(/\.lernvideo-quelle/.test(lies('css/style.css')), 'Und hat ein eigenes Format');

ok(/quelle: 'Bundesamt für Sicherheit in der Informationstechnik \(BSI\)'/.test(tourjs),
  'Die Vorführung legt ihr Video mit Quelle an – sonst hielte ihr eigenes Speichern an');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
