"use strict";

// Schutz gegen Clickjacking: RMS und KI-Dashboard dürfen nicht in einem fremden Rahmen stecken.
// Sonst ließe sich eine unsichtbare Kopie über eine harmlose Seite legen, und ein Klick
// dort träfe in Wahrheit „Freigeben" oder „Konform".
// GitHub Pages erlaubt keinen Header (frame-ancestors, X-Frame-Options), und im
// <meta>-CSP wirkt frame-ancestors nicht – daher der klassische Weg: index.html
// blendet die Seite per CSS aus, und nur dieses Skript blendet sie wieder ein, wenn
// sie ganz oben steht. Erst seit MSAL 5 möglich: Popups und unsichtbare iframes der
// Anmeldung laden redirect.html, nicht mehr die App selbst.
(function () {
  let oben = false;
  try { oben = window.self === window.top; } catch (e) { oben = false; }
  if (oben) {
    const sperre = document.getElementById("rahmenschutz");
    if (sperre) sperre.remove();
    return;
  }
  try { window.top.location = window.self.location.href; } catch (e) { /* Rahmen verbietet das – Seite bleibt leer */ }
})();
