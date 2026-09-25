/**
 * Anmelde-Ende-zu-Ende-Test des RMS mit simulierter Microsoft-Anmeldung (MSAL 5 + Redirect-Bridge).
 *
 * Fängt Authorize-, Token- und Graph-Endpunkte in Chromium ab und antwortet wie Entra.
 * Spielt alle Wege durch, die MSAL 5 über redirect.html führt – ohne echtes Konto:
 *   1. Anmeldung per Weiterleitung – der Deep-Link (?richtlinie=…) überlebt sie
 *   2. Mail-Link mit Adressat (?u=…): stille Anmeldung im unsichtbaren iframe
 *   3. fehlendes Recht: acquireTokenRedirect und zurück auf dieselbe Seite
 *   4. KI-Dashboard (/ki/): Anmeldung über dieselbe Rückkehrseite, zurück nach /ki/
 *   5. Clickjacking: das RMS in einem fremden Rahmen bleibt unsichtbar
 * Dazu: kein CSP-Verstoß. Vor jedem MSAL-Update laufen lassen.
 *
 *   npm i -D playwright && npx playwright install chromium   (einmalig, lokal)
 *   node e2e/anmeldung-msal.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPEN = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = (port, liefere) => new Promise(ok => { const s = http.createServer(liefere).listen(port, '127.0.0.1', () => ok(s)); });
const app = await server(8766, (req, res) => {
  let datei = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(datei) && fs.statSync(datei).isDirectory()) datei = path.join(datei, 'index.html');
  if (!datei.startsWith(ROOT) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream' }); res.end(fs.readFileSync(datei));
});
const fremdServer = await server(8767, (req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!DOCTYPE html><title>Fremde Seite</title><h1>Gewinnspiel</h1><iframe src="http://127.0.0.1:8766/index.html" width="900" height="600"></iframe>'); });
const { chromium } = await import(process.env.PLAYWRIGHT_MODUL || 'playwright');
const APP = 'http://127.0.0.1:8766/';
const TID = 'fdb70646-023a-403b-a4b9-1f474a935123', CID = '46c63ab1-1bd7-4774-b702-ed73a3f57072';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const clientInfo = b64({ uid: 'u1', utid: TID });
const nonces = {};           // code → nonce
const spur = [];             // was bei „Microsoft" ankam
let silentAblehnen = false;  // prompt=none → interaction_required (erzwingt das Popup)
let rtAblehnen = false;      // Refresh-Token ablehnen (erzwingt iframe/Popup)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

const b = await chromium.launch(process.env.CHROMIUM_PFAD ? { executablePath: process.env.CHROMIUM_PFAD } : {});
const ctx = await b.newContext();
const verstoss = [], fehler = [];
ctx.on('page', p => {
  p.on('console', m => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) verstoss.push(p.url().slice(0, 40) + ': ' + t.slice(0, 150)); else if (m.type() === 'error') fehler.push(t.slice(0, 150)); });
  p.on('pageerror', e => fehler.push('pageerror: ' + e.message.slice(0, 150)));
});
await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await ctx.route('https://graph.microsoft.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ value: [], id: 'site', displayName: 'Test' }) }));
await ctx.route('https://login.microsoftonline.com/**', async r => {
  const req = r.request(); const u = new URL(req.url());
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (u.pathname.includes('/discovery/instance')) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ tenant_discovery_endpoint: `https://login.microsoftonline.com/${TID}/v2.0/.well-known/openid-configuration`, 'api-version': '1.1', metadata: [{ preferred_network: 'login.microsoftonline.com', preferred_cache: 'login.windows.net', aliases: ['login.microsoftonline.com', 'login.windows.net'] }] }) });
  if (u.pathname.includes('openid-configuration')) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ token_endpoint: `https://login.microsoftonline.com/${TID}/oauth2/v2.0/token`, authorization_endpoint: `https://login.microsoftonline.com/${TID}/oauth2/v2.0/authorize`, end_session_endpoint: `https://login.microsoftonline.com/${TID}/oauth2/v2.0/logout`, issuer: `https://login.microsoftonline.com/${TID}/v2.0`, jwks_uri: 'x' }) });
  if (u.pathname.endsWith('/authorize')) {
    const q = u.searchParams, prompt = q.get('prompt') || '';
    const weg = q.get('response_mode') === 'query' ? '?' : '#';
    const ziel = q.get('redirect_uri');
    spur.push(`authorize prompt=${prompt || '-'} redirect_uri=${ziel.replace(APP, '/')} mode=${q.get('response_mode')}`);
    if (prompt === 'none' && silentAblehnen) {
      return r.fulfill({ status: 302, headers: { Location: `${ziel}${weg}error=interaction_required&error_description=test&state=${encodeURIComponent(q.get('state'))}` } });
    }
    const code = 'code' + Math.random().toString(36).slice(2);
    nonces[code] = q.get('nonce');
    return r.fulfill({ status: 302, headers: { Location: `${ziel}${weg}code=${code}&client_info=${clientInfo}&state=${encodeURIComponent(q.get('state'))}&session_state=s` } });
  }
  if (u.pathname.endsWith('/token')) {
    const f = new URLSearchParams(req.postData() || '');
    spur.push(`token grant=${f.get('grant_type')} scope=${(f.get('scope') || '').split(' ').filter(s => !/openid|profile|offline/.test(s)).join(',')}`);
    if (f.get('grant_type') === 'refresh_token' && rtAblehnen) return r.fulfill({ status: 400, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: 'invalid_grant', error_description: 'AADSTS50076 test', suberror: 'consent_required' }) });
    const jetzt = Math.floor(Date.now() / 1000);
    const idt = b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ aud: CID, iss: `https://login.microsoftonline.com/${TID}/v2.0`, tid: TID, oid: 'u1', sub: 'u1', nonce: nonces[f.get('code')] || undefined, preferred_username: 'test@dihag.com', name: 'Test Nutzer', iat: jetzt, nbf: jetzt, exp: jetzt + 3600 }) + '.x';
    return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ token_type: 'Bearer', scope: f.get('scope'), expires_in: 3600, ext_expires_in: 3600, access_token: 'at-' + Math.random().toString(36).slice(2), refresh_token: 'rt', id_token: idt, client_info: clientInfo }) });
  }
  return r.fulfill({ status: 404, body: '' });
});

const name = (pg) => pg.evaluate(() => (document.getElementById('hdr-name') || {}).textContent || '').catch(() => '');
const warteAufName = (pg) => pg.waitForFunction(() => (document.getElementById('hdr-name') || {}).textContent, null, { timeout: 20000 }).catch(() => {});

// 1) Anmeldung per Weiterleitung – mit Deep-Link
const p = await ctx.newPage();
spur.length = 0;
await p.goto(APP + 'index.html?richtlinie=42&ansicht=freigaben');
await warteAufName(p);
console.log('1) Weiterleitung:', JSON.stringify(await name(p)), '| sichtbar:', await p.evaluate(() => getComputedStyle(document.body).display !== 'none'),
  '| Deep-Link erhalten:', /richtlinie=42/.test(p.url()) || await p.evaluate(() => !!sessionStorage.getItem('rms_deeplink') || /richtlinie=42/.test(location.search)), '|', spur.join(' → '));

// 2) Mail-Link mit Adressat in frischem Browser: stille Anmeldung per iframe
await p.close();
const p2 = await ctx.newPage();
await p2.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }).catch(() => {});
spur.length = 0;
const vorher2 = ctx.pages().length;
await ctx.clearCookies();
await p2.goto(APP + 'index.html?richtlinie=42&ansicht=freigaben&aktion=freigeben&t=x&u=test@dihag.com');
await warteAufName(p2);
console.log('2) Mail-Link mit ?u=:', JSON.stringify(await name(p2)), '| neue Fenster:', ctx.pages().length - vorher2, '| auf der Seite geblieben:', p2.url().includes('richtlinie=42'), '|', spur.join(' → '));

// 3) Fehlendes Recht: Refresh-Token und stilles iframe abgelehnt → acquireTokenRedirect
rtAblehnen = true; silentAblehnen = true; spur.length = 0;
const vorUrl = p2.url();
await p2.evaluate(() => { acquireToken(['https://graph.microsoft.com/Policy.Read.All']).catch(() => {}); });
await p2.waitForTimeout(4000);
rtAblehnen = false; silentAblehnen = false;
await warteAufName(p2);
const hatToken = await p2.evaluate(() => acquireToken(['https://graph.microsoft.com/Policy.Read.All']).then(t => !!t, () => false)).catch(() => 'n/a');
console.log('3) acquireTokenRedirect:', 'zurück auf derselben Seite:', p2.url() === vorUrl, '| Token danach vorhanden:', hatToken, '|', spur.join(' → '));

// 4) KI-Dashboard in frischem Browser

const p4 = await ctx.newPage();
await p4.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }).catch(() => {});
await ctx.clearCookies();
spur.length = 0;
await p4.goto(APP + 'ki/');
await p4.waitForTimeout(6000);
console.log('4) KI-Dashboard: URL nach Anmeldung:', p4.url().replace(APP, '/'), '| sichtbar:', await p4.evaluate(() => getComputedStyle(document.body).display !== 'none'), '|', spur.slice(0, 3).join(' → '));

// 5) Clickjacking
const fremd = await ctx.newPage();
await fremd.goto('http://localhost:8767/');
await fremd.waitForTimeout(2000);
const fr = fremd.frames().find(f => f.url().startsWith(APP));
console.log('5) Im fremden Rahmen sichtbar:', fr ? await fr.evaluate(() => getComputedStyle(document.body).display !== 'none').catch(() => 'n/a') : 'kein Rahmen');

console.log('CSP-Verstöße:', verstoss.length ? verstoss : 'keine');
console.log('Fehler (ohne erwartete):', fehler.filter(f => !/Failed to load resource|Unsafe attempt to initiate navigation/.test(f)).slice(0, 8));
await b.close();
app.close(); fremdServer.close();
