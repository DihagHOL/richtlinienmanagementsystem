#!/usr/bin/env node
/**
 * Version je Datei (Cache-Busting)
 * ================================
 * Früher bekam nach jedem Push jede Datei den neuen Commit-SHA als `?v=`, der
 * Browser lud also auch alles Unveränderte neu. Jetzt trägt jede Datei die
 * Prüfsumme ihres Inhalts. Ändert sich die Datei, ändert sich ihre Adresse, die
 * anderen behalten ihre und kommen aus dem Browser-Cache.
 *
 * Geschrieben werden zwei Stellen:
 *  - die Tabelle MODUL_VERSIONEN in js/module.js für alles ohne Tag in der Seite
 *  - die `?v=`-Parameter in index.html und ki/index.html
 *
 * Die Reihenfolge zählt: js/module.js steht selbst als Tag in der Seite, seine
 * Prüfsumme hängt also an der Tabelle.
 *
 * Läuft in cache-bust.yml nach dem Setzen von APP_VERSION. Dadurch ändert sich
 * js/app.js bei jedem Push, die Datei wird also immer neu geholt.
 *
 *   node scripts/cache-version.mjs
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEITEN = ['index.html', 'ki/index.html'];
const TABELLE = /const MODUL_VERSIONEN = \{[^}]*\};/;
// Nur vorhandene Parameter: redirect.html und die Bibliotheken unter vendor/ tragen bewusst keinen.
const EINBINDUNG = /((?:src|href)=")([^":]+\.(?:js|css))\?v=[A-Za-z0-9]+"/g;

/** Über den Inhalt mit LF gebildet, damit Windows und die Action dieselbe Nummer bekommen. */
export function pruefsumme(datei) {
  const inhalt = fs.readFileSync(datei, 'utf8').split('\r\n').join('\n');
  return crypto.createHash('sha256').update(inhalt).digest('hex').slice(0, 8);
}

function schreiben(datei, neu) {
  if (fs.readFileSync(datei, 'utf8') !== neu) fs.writeFileSync(datei, neu);
}

/** Alle Versionen unterhalb von `wurzel` auf den aktuellen Inhalt setzen. */
export function versionenSetzen(wurzel = ROOT) {
  const startseite = fs.readFileSync(path.join(wurzel, 'index.html'), 'utf8');
  const mitTag = new Set([...startseite.matchAll(/src="js\/([^"?]+)\.js/g)].map(m => m[1]));
  const tabelle = {};
  for (const datei of fs.readdirSync(path.join(wurzel, 'js')).sort()) {
    const name = datei.replace(/\.js$/, '');
    if (name !== datei && !mitTag.has(name)) tabelle[name] = pruefsumme(path.join(wurzel, 'js', datei));
  }

  const lader = path.join(wurzel, 'js/module.js');
  const quelle = fs.readFileSync(lader, 'utf8');
  if (!TABELLE.test(quelle)) throw new Error('js/module.js: Zeile „const MODUL_VERSIONEN = {…};" nicht gefunden');
  // Als Funktion, sonst deutete replace() ein `$` im Ersatztext.
  schreiben(lader, quelle.replace(TABELLE, () => `const MODUL_VERSIONEN = ${JSON.stringify(tabelle)};`));

  for (const seite of SEITEN) {
    const datei = path.join(wurzel, seite);
    const html = fs.readFileSync(datei, 'utf8').replace(EINBINDUNG, (ganz, vorne, ziel) => {
      const pfad = path.join(path.dirname(datei), ziel);
      return fs.existsSync(pfad) ? `${vorne}${ziel}?v=${pruefsumme(pfad)}"` : ganz;
    });
    schreiben(datei, html);
  }
  return tabelle;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  console.log(`${Object.keys(versionenSetzen()).length} Module in der Tabelle, Seiten aktualisiert.`);
}
