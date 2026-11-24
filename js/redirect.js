"use strict";

// Rückkehrseite der Anmeldung: die Antwort von Microsoft an das RMS weiterreichen.
// Läuft nur in redirect.html, nie in der App selbst (RMS und KI-Dashboard teilen sie).
msalRedirectBridge.broadcastResponseToMainFrame().catch(fehler => {
  console.error("Anmeldung: Antwort konnte nicht weitergereicht werden", fehler);
  document.body.textContent = "Die Anmeldung konnte nicht abgeschlossen werden. Bitte das Fenster schließen und erneut versuchen.";
});
