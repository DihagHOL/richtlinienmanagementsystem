/**
 * Rollen & Zugriffskonfiguration
 * ==============================
 * Drei Rollen:
 *   - admin       → Richtlinien verwalten, Compliance, Einstellungen
 *   - genehmiger  → Richtlinien freigeben (InReview → Veröffentlicht)
 *   - mitarbeiter → lesen, bestätigen, Quiz (jede:r angemeldete Nutzer:in)
 *
 * Laufende Konfiguration liegt als access-config.json in SharePoint und wird
 * über die Einstellungen-Seite gepflegt. Muster aus e-rechnung/js/access.js.
 */

const ACCESS_CONFIG_DEFAULT = {
  admins:     ['pruefer@dihag.com'],
  genehmiger: ['pruefer@dihag.com'],
};

let _runtimeConfig = null;

function _cfg() { return _runtimeConfig || ACCESS_CONFIG_DEFAULT; }

/** Laufzeit-Config aus SharePoint laden (einmalig nach Login; Fehler → Default). */
async function loadRuntimeAccessConfig() {
  if (_runtimeConfig) return;
  try {
    const cfg = await spLoadAccessConfig();
    if (cfg && typeof cfg === 'object') {
      _runtimeConfig = {
        admins:     Array.isArray(cfg.admins) ? cfg.admins : [],
        genehmiger: Array.isArray(cfg.genehmiger) ? cfg.genehmiger : [],
      };
    }
  } catch (e) {
    console.info('[access] Keine SP-Config gefunden, nutze Default.');
  }
}

function getAccessConfig() { return JSON.parse(JSON.stringify(_cfg())); }

/** Config im Speicher aktualisieren (nach dem Speichern in SP). */
function setRuntimeConfig(cfg) { _runtimeConfig = cfg; }

/* ── Checks ── */

function _has(list, upn) {
  const u = (upn || '').toLowerCase().trim();
  return (list || []).some(x => String(x).toLowerCase().trim() === u);
}

function isAdmin(upn)      { return _has(_cfg().admins, upn); }
function isGenehmiger(upn) { return _has(_cfg().genehmiger, upn) || isAdmin(upn); }

function _currentUpn() {
  const acc = typeof getAuthUser === 'function' ? getAuthUser() : null;
  return acc ? acc.username : '';
}
function isCurrentUserAdmin()      { return isAdmin(_currentUpn()); }
function isCurrentUserGenehmiger() { return isGenehmiger(_currentUpn()); }

/**
 * Navigations-Einträge je nach Rolle ein-/ausblenden.
 * Nach Login + geladener Config aufrufen.
 */
function initRoleNav() {
  const admin = isCurrentUserAdmin();
  const geneh = isCurrentUserGenehmiger();

  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };

  show('nav-sep-admin',   admin || geneh);
  show('nav-verwaltung',  admin);
  show('nav-freigaben',   geneh);
  show('nav-compliance',  admin);
  show('nav-einstellungen', admin);
}
