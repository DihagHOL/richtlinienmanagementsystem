/**
 * Barrierefreiheit: Dialoge (Escape, Fokus-Falle, Fokus-Rückgabe, ARIA),
 * Live-Region für Meldungen, Beschriftungen, Landmarks und Tastaturbedienung.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const app = fs.readFileSync(ROOT + '/js/app.js', 'utf8');
const admin = fs.readFileSync(ROOT + '/js/admin.js', 'utf8');
const governance = fs.readFileSync(ROOT + '/js/governance.js', 'utf8');
const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
const css = fs.readFileSync(ROOT + '/css/style.css', 'utf8');

/* ── 1) Dialog: Auszeichnung ── */
ok(/role="dialog"/.test(app), 'Dialog hat role="dialog"');
ok(/aria-modal="true"/.test(app), 'Dialog ist als modal ausgezeichnet');
ok(/setAttribute\('aria-labelledby'/.test(app), 'Dialog übernimmt seine Überschrift als Beschriftung');

/* ── 2) Dialog: Tastatur ── */
ok(/e\.key === 'Escape'/.test(app) && /closeModal\(\)/.test(app), 'Escape schließt den Dialog');
ok(/e\.key !== 'Tab'/.test(app) && /shiftKey/.test(app), 'Tab und Shift+Tab werden behandelt (Fokus-Falle)');
ok(/letzte\.focus\(\)/.test(app) && /erste\.focus\(\)/.test(app), 'Fokus springt am Rand des Dialogs um');
ok(/_modalOpener[\s\S]{0,400}\.focus\(\)/.test(app), 'Fokus kehrt beim Schließen zum Auslöser zurück');
ok(/removeEventListener\('keydown', _modalKeyHandler/.test(app), 'Tastatur-Handler wird beim Schließen wieder entfernt');

/* ── 3) Verhalten im Sandkasten prüfen ── */
const listeners = {};
const el = (extra = {}) => ({
  innerHTML: '', style: {}, classList: { contains: () => false, add() {}, remove() {} },
  setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
  querySelector: () => null, querySelectorAll: () => [], focus() { ctx.__fokus = extra.id || 'x'; },
  ...extra,
});
const mount = el({ id: 'modal-mount' });
const ctx = {
  console, esc: s => String(s ?? ''),
  document: {
    getElementById: (id) => (id === 'modal-mount' ? mount : null),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (t, h) => { listeners[t] = h; },
    removeEventListener: (t) => { delete listeners[t]; },
    activeElement: null, contains: () => true,
  },
  setTimeout: (fn) => fn(),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(app.replace(/document\.addEventListener\('DOMContentLoaded'[\s\S]*?\n\}\);/, ''), ctx);

vm.runInContext('openModal("<div class=\\"modal-header\\"><h3>Test</h3></div>", false);', ctx);
ok(mount.innerHTML.includes('role="dialog"') && mount.innerHTML.includes('aria-modal="true"'),
  'openModal erzeugt einen ausgezeichneten Dialog');
ok(typeof listeners.keydown === 'function', 'Tastatur-Handler ist nach dem Öffnen aktiv');

let verhindert = false;
listeners.keydown({ key: 'Escape', preventDefault: () => { verhindert = true; } });
ok(verhindert && mount.innerHTML === '', 'Escape schließt tatsächlich und unterdrückt die Standardaktion');
ok(typeof listeners.keydown !== 'function', 'Handler ist nach dem Schließen entfernt');

/* ── 4) Meldungen als Live-Region ── */
ok(/aria-live/.test(app) && /assertive/.test(app) && /polite/.test(app),
  'Meldungen werden über eine Live-Region angekündigt (Fehler dringlicher)');

/* ── 5) Ausklappbares mit Zustand ── */
ok(/aria-expanded="\$\{open \? 'true' : 'false'\}"/.test(admin), 'Editor-Abschnitte melden auf-/zugeklappt');
ok(/aria-expanded="\$\{expanded \? 'true' : 'false'\}"/.test(governance), 'Ordner-Baum meldet auf-/zugeklappt');
ok(/role="tree"/.test(governance) && /role="treeitem"/.test(governance), 'Ordner-Baum ist als Baum ausgezeichnet');
ok(/aria-selected=/.test(governance) && /aria-level=/.test(governance), 'Baumknoten melden Auswahl und Ebene');
ok(/ArrowRight/.test(governance) && /ArrowLeft/.test(governance), 'Baum lässt sich mit den Pfeiltasten auf-/zuklappen');
ok(/tabindex="0"/.test(governance), 'Baumknoten sind per Tab erreichbar');

/* ── 6) Seitenstruktur und Beschriftungen ── */
ok(/class="skip-link"/.test(html) && /#hauptinhalt/.test(html), 'Sprungmarke „Zum Inhalt springen" vorhanden');
ok(/id="hauptinhalt"/.test(html), 'Hauptbereich ist als Sprungziel ausgezeichnet');
ok(/<nav class="sidebar-nav"[^>]*aria-label="Hauptnavigation"/.test(html), 'Navigation ist benannt');
const suchfelder = [...html.matchAll(/<input type="text" id="search-[a-z]+"[^>]*>/g)];
ok(suchfelder.length > 0 && suchfelder.every(m => m[0].includes('aria-label')), `Alle ${suchfelder.length} Suchfelder sind beschriftet`);
const filter = [...html.matchAll(/<select id="filter-[a-z-]+"[^>]*>/g)];
ok(filter.length > 0 && filter.every(m => m[0].includes('aria-label')), `Alle ${filter.length} Filter sind beschriftet`);

/* ── 7) Sichtbarer Fokus und Rücksicht auf Bewegungsempfindlichkeit ── */
ok(/:focus-visible\s*\{[^}]*outline/.test(css), 'Tastaturfokus ist sichtbar');
ok(/\.skip-link:focus\s*\{[^}]*left:\s*0/.test(css), 'Sprungmarke wird bei Fokus sichtbar');
ok(/prefers-reduced-motion/.test(css), 'Reduzierte Bewegung wird respektiert');

console.log(`\n${fail ? '✗' : '✓'} ${pass} grün, ${fail} rot`);
process.exit(fail ? 1 : 0);
