'use strict';
/**
 * Gast-Dienst: Netz (verwaltete Identität, Graph, Signaturschlüssel)
 * ==================================================================
 * Die Function greift mit ihrer eigenen verwalteten Identität auf Graph zu, ohne Geheimnis. Rechte
 * hat sie nur auf das, was ihr freigegeben ist (Files.SelectedOperations.Selected auf wissen.json,
 * Lists.SelectedOperations.Selected auf „Bestaetigungen“).
 */
const GRAPH = 'https://graph.microsoft.com/v1.0';

let _mi = { token: '', bis: 0 };
let _jwks = { keys: [], bis: 0 };

/** Zugriffstoken der verwalteten Identität für Graph (App Service / Functions). */
async function miToken() {
  if (_mi.token && Date.now() < _mi.bis - 300000) return _mi.token;
  const url = `${process.env.IDENTITY_ENDPOINT}?resource=https://graph.microsoft.com&api-version=2019-08-01`;
  const r = await fetch(url, { headers: { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER || '' } });
  if (!r.ok) throw Object.assign(new Error(`Verwaltete Identität: ${r.status}`), { status: 502 });
  const j = await r.json();
  _mi = { token: j.access_token, bis: Number(j.expires_on) * 1000 || Date.now() + 3000000 };
  return _mi.token;
}

/** Graph-Aufruf mit der Identität der Function; Fehler mit Status und kurzem Text. */
async function graph(pfad, opt) {
  const o = opt || {};
  const r = await fetch(GRAPH + pfad, {
    method: o.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + await miToken(), Accept: 'application/json' },
      o.body ? { 'Content-Type': 'application/json' } : {}, o.headers || {}),
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  if (o.roh) return r;
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200);
    throw Object.assign(new Error(`Graph ${r.status}: ${t}`), { status: r.status === 404 ? 404 : 502 });
  }
  return r.status === 204 ? null : r.json();
}

/** Öffentlicher Schlüssel zu kid (Microsoft Entra), zwölf Stunden zwischengespeichert. */
async function schluessel(tenant, kid) {
  const finde = () => {
    const k = _jwks.keys.find(x => x.kid === kid);
    return k ? { kty: k.kty, n: k.n, e: k.e } : null;
  };
  if (Date.now() < _jwks.bis && finde()) return finde();
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`);
  if (!r.ok) return null;
  const j = await r.json();
  _jwks = { keys: (j.keys || []).filter(k => k.kty === 'RSA'), bis: Date.now() + 12 * 3600 * 1000 };
  return finde();
}

module.exports = { graph, schluessel, GRAPH };
