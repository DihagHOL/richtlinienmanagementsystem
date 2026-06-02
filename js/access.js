/**
 * Rollen, Zielgruppen & Zugriffskonfiguration
 * ===========================================
 * Berechtigungs-Rollen (App-intern):
 *   - admin       → Richtlinien verwalten, Compliance, Einstellungen
 *   - genehmiger  → Richtlinien freigeben (InReview → Veröffentlicht)
 *   - mitarbeiter → lesen, bestätigen, Quiz (jede:r angemeldete Nutzer:in)
 *
 * Unternehmens-Rollen (Zielgruppen für Richtlinien):
 *   Frei definierbare Rollen/Abteilungen. Die effektive Rolle eines Mitarbeiters
 *   ergibt sich aus seiner Azure-AD-Abteilung (`department`) PLUS manuell in den
 *   Einstellungen zugeordneten Rollen ("beides kombiniert").
 *
 * Laufende Konfiguration: access-config.json in SharePoint, gepflegt über Einstellungen.
 */

const ACCESS_CONFIG_DEFAULT = {
  admins:     ['pruefer@dihag.com', 'pruefer@dihag.com'],
  genehmiger: ['pruefer@dihag.com', 'pruefer@dihag.com'],
  roles:      null,   // null → COMPANY_ROLES_DEFAULT
  userRoles:  {},     // { "user@dihag.com": ["IT", "Qualitätsmanagement"] }
};

/* Gängige Unternehmensrollen/Abteilungen (Default, in Einstellungen anpassbar). */
const COMPANY_ROLES_DEFAULT = [
  'Geschäftsführung', 'IT', 'Personal', 'Finanzen & Buchhaltung',
  'Einkauf', 'Vertrieb', 'Produktion', 'Qualitätsmanagement',
  'Logistik & Lager', 'Instandhaltung', 'Arbeitssicherheit', 'Verwaltung',
];

const ZIELGRUPPE_ALLE = 'ALLE';

let _runtimeConfig = null;
let _myRolesCache = null;

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
        roles:      Array.isArray(cfg.roles) && cfg.roles.length ? cfg.roles : null,
        userRoles:  (cfg.userRoles && typeof cfg.userRoles === 'object') ? cfg.userRoles : {},
      };
    }
  } catch (e) {
    console.info('[access] Keine SP-Config gefunden, nutze Default.');
  }
}

function getAccessConfig() {
  const c = _cfg();
  return {
    admins:     [...(c.admins || [])],
    genehmiger: [...(c.genehmiger || [])],
    roles:      [...getCompanyRoles()],
    userRoles:  JSON.parse(JSON.stringify(c.userRoles || {})),
  };
}

/** Config im Speicher aktualisieren (nach dem Speichern in SP). */
function setRuntimeConfig(cfg) { _runtimeConfig = cfg; _myRolesCache = null; }

/** Verfügbare Unternehmensrollen (aus Config oder Default). */
function getCompanyRoles() {
  const r = _cfg().roles;
  return (Array.isArray(r) && r.length) ? r : [...COMPANY_ROLES_DEFAULT];
}

/* ── Berechtigungs-Checks ── */

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

/* ── Unternehmens-Rollen / Zielgruppen ── */

/** Manuell zugeordnete Rollen für einen UPN (case-insensitive). */
function manualRolesFor(upn) {
  const map = _cfg().userRoles || {};
  const u = (upn || '').toLowerCase().trim();
  for (const k of Object.keys(map)) {
    if (k.toLowerCase().trim() === u) return Array.isArray(map[k]) ? map[k] : [];
  }
  return [];
}

/** Effektive Rollen = manuelle Zuordnung ∪ AD-Abteilung. */
function effectiveRoles(upn, department) {
  const set = new Set(manualRolesFor(upn));
  if (department && String(department).trim()) set.add(String(department).trim());
  return [...set];
}

/** Effektive Rollen des aktuell angemeldeten Users (mit AD-Abteilung via Graph). */
async function getCurrentUserRoles() {
  if (_myRolesCache) return _myRolesCache;
  let dep = '';
  try { dep = await spGetMyDepartment(); } catch (e) { /* department optional */ }
  _myRolesCache = effectiveRoles(_currentUpn(), dep);
  return _myRolesCache;
}

/**
 * Prüft, ob eine Richtlinie für eine Rollenmenge sichtbar ist.
 * Leere Zielgruppe oder "ALLE" → für alle sichtbar.
 */
function policyMatchesRoles(zielgruppen, roles) {
  if (!Array.isArray(zielgruppen) || !zielgruppen.length || zielgruppen.includes(ZIELGRUPPE_ALLE)) return true;
  const set = new Set((roles || []).map(r => String(r).toLowerCase().trim()));
  return zielgruppen.some(z => set.has(String(z).toLowerCase().trim()));
}

/**
 * Navigations-Einträge je nach Berechtigungs-Rolle ein-/ausblenden.
 */
function initRoleNav() {
  const admin = isCurrentUserAdmin();
  const geneh = isCurrentUserGenehmiger();
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  show('nav-sep-admin',     admin || geneh);
  show('nav-verwaltung',    admin);
  show('nav-freigaben',     geneh);
  show('nav-compliance',    admin);
  show('nav-einstellungen', admin);
}
