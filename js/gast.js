'use strict';

/**
 * Gäste (B2B) – Schulungen ohne SharePoint
 * ========================================
 * Gäste aus anderen Mandanten (zuerst die Phishing-Schulung für Gienanth) bekommen über Graph
 * keinen verlässlichen Zugriff auf SharePoint: Graph weist sie mit 401 „There has been an error
 * authenticating the request“ ab, obwohl Token und Rechte stimmen (19./20.11.2026). Für Gäste
 * startet das RMS deshalb ohne SharePoint. Kurs und eigene Bestätigungen kommen über den
 * Gast-Dienst (gast-api/, eine Azure Function mit eigener, eng begrenzter Identität).
 *
 * Ob jemand Gast ist, entscheidet istGastKonto in js/app.js (Claim „idp“ im ID-Token); nur dann
 * lädt bootApp diese Datei. Ein Gast sieht nur „Wissen“ und dort nur, was der Dienst für Gäste
 * freigibt. Mitarbeitende merken davon nichts. Mit dem Test-Schalter (localStorage
 * „rms_gast_test“ = „1“) nimmt der Dienst nur Kennungen an, die er als Test freigegeben hat.
 */
const GAST = {
  api:   'https://dihag-rms-gast.azurewebsites.net/api',
  scope: 'api://46c63ab1-1bd7-4774-b702-ed73a3f57072/Gast.Kurs',
};

/** Aufruf des Gast-Dienstes mit dem Token des RMS (Scope Gast.Kurs). */
async function _gastAbruf(pfad, opt) {
  const token = await acquireToken([GAST.scope]);
  if (!token) throw new Error('Anmeldung läuft …');
  const o = opt || {};
  const resp = await fetch(GAST.api + pfad, {
    method: o.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/json' }, o.body ? { 'Content-Type': 'application/json' } : {}),
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  let j = null;
  try { j = await resp.json(); } catch (e) { /* leer */ }
  if (!resp.ok) throw new Error((j && j.fehler) || `Gast-Dienst (${resp.status})`);
  return j;
}

/** Kurs für Gäste – Ersatz für spLoadWissen. */
async function gastKursLaden() {
  const j = await _gastAbruf('/kurs');
  return { daten: (j && j.daten) || { version: 1, themen: [], beitraege: [] }, geaendertAm: (j && j.geaendertAm) || '' };
}

/** Eigene Bestätigungen – Ersatz für spGetAcknowledgements (der Dienst kennt die Person aus dem Token). */
async function gastBestaetigungen() {
  const j = await _gastAbruf('/bestaetigungen');
  return Array.isArray(j) ? j : [];
}

/** Bestätigung speichern – Ersatz für spSaveAcknowledgement. Name und Adresse setzt der Dienst. */
async function gastBestaetigungSpeichern(a) {
  return _gastAbruf('/bestaetigung', { method: 'POST', body: {
    id: a.id || undefined, richtlinieId: a.richtlinieId, version: a.version, gelesenAm: a.gelesenAm,
    quizBestanden: !!a.quizBestanden, quizScore: a.quizScore, quizVersuche: a.quizVersuche,
    abgeschlossenAm: a.abgeschlossenAm || '', fortschritt: a.fortschritt,
  } });
}

/**
 * Start für Gäste statt bootApp: keine SharePoint-Abfragen, keine Einstellungen, keine Rollen.
 * Die Datenfunktionen, die „Wissen“ nutzt, gehen an den Gast-Dienst; alles andere bleibt aus.
 */
async function gastStart() {
  State.gast = true;
  State.myRoles = [];
  State.myGroups = [];
  const w = /** @type {any} */ (window);
  w.spInit = async () => {};
  w.spLoadWissen = gastKursLaden;
  w.spGetAcknowledgements = gastBestaetigungen;
  w.spSaveAcknowledgement = gastBestaetigungSpeichern;
  w.reloadData = async () => {
    State.acks = await gastBestaetigungen();
    State.loaded = true;
    State.loadedAt = Date.now();
  };
  w.spGetMyDepartment = async () => '';
  w.spGetMyGroups = async () => [];
  document.body.classList.add('rms-gast');
  initRoleNav();
  try { await reloadData(); } catch (e) { console.warn('[gast] Bestätigungen nicht geladen:', e.message); }
  await applyDeepLinkOrDefault();
}

if (typeof module !== 'undefined' && module.exports) module.exports = { GAST, gastKursLaden, gastBestaetigungen, gastBestaetigungSpeichern, gastStart };
