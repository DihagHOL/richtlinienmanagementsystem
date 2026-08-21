/**
 * Microsoft Entra ID (Azure AD) Authentication
 * MSAL.js 2.x (msal-browser 2.38.2, CDN alcdn.msauth.net) — Single-Tenant: nur DIHAG-Konten.
 * Muster übernommen aus e-rechnung/js/auth.js.
 */

/** Basis-URL der App für den MSAL-Redirect – funktioniert auf GitHub-Pages-URL UND eigener Domain. */
function _redirectBase() {
  let p = location.origin + location.pathname.replace(/index\.html?$/i, '');
  if (!p.endsWith('/')) p += '/';
  return p;
}

const _AUTH = {
  clientId:    '46c63ab1-1bd7-4774-b702-ed73a3f57072',
  tenantId:    'fdb70646-023a-403b-a4b9-1f474a935123',
  // dynamisch: GitHub-Pages-URL ODER eigene Domain – BEIDE in Azure als SPA-Redirect-URI hinterlegen
  redirectUri: _redirectBase(),
};

// Alle benötigten Scopes bereits beim Login anfordern (wie ZAPP) → Consent einmalig,
// danach liefert acquireTokenSilent alles ohne weitere Rückfrage. Kein select_account
// erzwingen → angemeldete DIHAG-Nutzer melden sich per SSO stumm an (keine „Ja/Nein"-Fenster).
const _LOGIN_SCOPES = [
  'User.Read',
  'Sites.ReadWrite.All',
  'Files.ReadWrite.All',
  'User.Read.All',
  'Mail.Send',
];

let _msal = null;
let _account = null;
let _postAuthCb = null;

/**
 * Anmelde-Hinweis aus dem Link (?u=…). Entscheidungs-Mails tragen die Adresse des
 * Empfängers – damit trifft die Anmeldung sofort das richtige Konto (Microsoft zeigt
 * keine Kontoauswahl), und eine Entscheidung kann nicht unter einem fremden Namen
 * landen, wenn im Browser mehrere Konten liegen.
 */
function getLoginHint() {
  try {
    // Nach dem Login-Redirect kann die Ursprungs-URL verloren sein – app.js sichert
    // sie vorher, derselbe Vorrat gilt hier.
    let such = location.search;
    try { such = sessionStorage.getItem('rms_deeplink') || such; } catch (e) { /* gesperrt */ }
    const u = (new URLSearchParams(such).get('u') || '').trim().toLowerCase();
    // Bewusst enger als das, was als E-Mail zulässig wäre: Der Wert landet in
    // einem onclick-Attribut. Anführungszeichen und Winkelklammern haben hier
    // nichts zu suchen.
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(u) ? u : '';
  } catch (e) { return ''; }
}

/** Bewusst mit einem anderen Konto anmelden (der Link ging an jemand anderen). */
function authAnmeldenAls(upn) {
  if (!_msal) return;
  const hint = String(upn || '').trim();
  _msal.loginRedirect({
    scopes:    _LOGIN_SCOPES,
    loginHint: hint || undefined,
    prompt:    hint ? undefined : 'select_account',
    state:     location.pathname + location.search,
  });
}

/** Callback registrieren, der nach erfolgreichem Login (mit Account) aufgerufen wird. */
function onAuthReady(cb) { _postAuthCb = cb; }

async function authInit() {
  _msal = new msal.PublicClientApplication({
    auth: {
      clientId:              _AUTH.clientId,
      authority:             `https://login.microsoftonline.com/${_AUTH.tenantId}`,
      redirectUri:           _AUTH.redirectUri,
      postLogoutRedirectUri: _AUTH.redirectUri,
    },
    cache: {
      // localStorage statt sessionStorage: Ein Klick aus Outlook öffnet einen NEUEN
      // Tab. Mit sessionStorage ist dort kein Konto bekannt – jede Entscheidung liefe
      // erst über die Microsoft-Anmeldeseite, und genau das soll sie nicht.
      // Preis: Die Anmeldung überlebt das Schließen des Browsers; an einem geteilten
      // Rechner bleibt das Konto angemeldet – wie bei Outlook und Teams auch.
      cacheLocation:          'localStorage',
      storeAuthStateInCookie: true,
    },
  });

  // Rückkehr vom Login verarbeiten
  let response = null;
  try {
    response = await _msal.handleRedirectPromise();
  } catch (err) {
    _showAuthError(err);
    return;
  }

  if (response) _account = response.account;

  // Sub-App-Rückkehr: Login/Token-Redirect aus einer Unterseite (z.B. /ki/)
  // landet auf der App-Wurzel (registrierte Redirect-URI) – der state-Parameter
  // enthält den Ursprungspfad, dorthin zurückleiten (Konto ist bereits gecacht).
  if (response && typeof response.state === 'string' && response.state.startsWith('/')
      && response.state !== location.pathname + location.search) {
    location.replace(response.state);
    return;
  }

  const accounts = _msal.getAllAccounts();
  const hint = getLoginHint();

  if (!_account && accounts.length) {
    // Der Konto-Cache wird über Tabs geteilt und kann mehrere Konten enthalten.
    // Kommt der Aufruf aus einer Entscheidungs-Mail, zählt deren Adressat.
    _account = (hint && accounts.find(a => (a.username || '').toLowerCase() === hint))
      || _msal.getActiveAccount() || accounts[0];
  }

  if (!_account) {
    // Noch kein Konto im Browser. Erst stumm versuchen (kein sichtbarer Umweg über
    // die Microsoft-Seite), sonst der gewohnte Redirect – ohne prompt:'select_account',
    // damit angemeldete DIHAG-Nutzer ohne Rückfrage durchkommen.
    if (hint) {
      try {
        const r = await _msal.ssoSilent({ scopes: _LOGIN_SCOPES, loginHint: hint });
        if (r && r.account) _account = r.account;
      } catch (e) { /* kein stiller Weg – dann eben über die Anmeldeseite */ }
    }
    if (!_account) {
      await _msal.loginRedirect({
        scopes:    _LOGIN_SCOPES,
        loginHint: hint || undefined,   // spart die Kontoauswahl
        state:     location.pathname + location.search,
      });
      return;
    }
  }
  _msal.setActiveAccount(_account);

  _renderUser(_account);
  _showApp();

  if (_postAuthCb) {
    try { await _postAuthCb(_account); }
    catch (e) { console.error('[auth] postAuth callback failed:', e); }
  }
}

function _showApp() {
  const boot = document.getElementById('boot');
  const app  = document.getElementById('app');
  if (boot) boot.style.display = 'none';
  if (app)  app.style.display  = 'flex';
}

function _renderUser(account) {
  const nameEl = document.getElementById('hdr-name');
  const mailEl = document.getElementById('hdr-mail');
  const avEl   = document.getElementById('hdr-av');
  const display = account.name || account.username || '';
  const email   = account.username || '';
  if (nameEl) nameEl.textContent = display;
  if (mailEl) mailEl.textContent = email;
  if (avEl) {
    const parts = display.trim().split(/\s+/).filter(Boolean);
    avEl.textContent = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : display.slice(0, 2).toUpperCase();
  }
}

function authLogout() {
  if (_msal) _msal.logoutRedirect({ account: _account });
}

/** Aktuell angemeldetes MSAL-Konto. */
function getAuthUser() { return _account; }

/**
 * Access-Token für Graph/SharePoint-Scopes anfordern.
 * Bei fehlendem Consent / Ablauf → Redirect zu Microsoft (gibt null zurück).
 */
async function acquireToken(scopes) {
  if (!_msal || !_account) throw new Error('Nicht angemeldet');
  try {
    const result = await _msal.acquireTokenSilent({ scopes, account: _account });
    return result.accessToken;
  } catch (e) {
    if (e instanceof msal.InteractionRequiredAuthError) {
      await _msal.acquireTokenRedirect({
        scopes, account: _account,
        state: location.pathname + location.search,   // Rückkehr zur Ursprungsseite
      });
      return null; // Seite wird umgeleitet
    }
    throw e;
  }
}

function _showAuthError(err) {
  const sub = document.getElementById('boot-sub');
  const spn = document.getElementById('boot-spinner');
  const erB = document.getElementById('boot-err');
  const btn = document.getElementById('boot-btn');
  if (sub) sub.textContent = 'Anmeldung fehlgeschlagen';
  if (spn) spn.style.display = 'none';
  if (erB) erB.textContent = err && (err.message || err.errorMessage) || String(err);
  if (btn) btn.style.display = '';
}
