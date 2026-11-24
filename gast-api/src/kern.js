'use strict';
/**
 * Gast-Dienst des RMS: reine Logik (ohne Azure, ohne Netz), auch in tests/gast-api.test.mjs
 * ==========================================================================================
 * Gäste aus anderen Mandanten (B2B, zuerst die Gienanth-Schulung) bekommen über Graph keinen
 * verlässlichen Zugriff auf SharePoint: Graph weist sie mit 401 „There has been an error
 * authenticating the request“ ab, obwohl Token und Rechte stimmen (19./20.11.2026). Dieser
 * Dienst liest und schreibt für sie, mit eigener verwalteter Identität und nur dem Nötigsten:
 * den freigegebenen Kurs aus wissen.json lesen, die eigenen Bestätigungen lesen und schreiben.
 *
 * Wer fragt, weist sich mit einem Zugriffstoken des RMS aus (Scope Gast.Kurs). Geprüft werden
 * Signatur, Aussteller, Zielgruppe, Ablauf, Scope und dass der Benutzer ein Gast aus einem der
 * freigegebenen Heimatmandanten ist. Name und Adresse für die Bestätigung kommen aus dem Token,
 * nie aus der Anfrage.
 */
const crypto = require('crypto');

const PREFIX = 'wissen:';
const SCOPE = 'Gast.Kurs';

/** Einstellungen aus der Umgebung (App-Einstellungen der Function). */
function einstellungen(env) {
  const liste = s => String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
  return {
    tenant: String(env.GAST_TENANT || '').trim(),
    clientId: String(env.GAST_CLIENT_ID || '').trim(),
    heimat: liste(env.GAST_HEIMAT).map(x => x.toLowerCase()),
    testOids: liste(env.GAST_TEST_OIDS).map(x => x.toLowerCase()),
    beitraege: liste(env.GAST_BEITRAEGE),
    siteId: String(env.GAST_SITE_ID || '').trim(),
    ackListId: String(env.GAST_ACK_LIST_ID || '').trim(),
    driveId: String(env.GAST_DRIVE_ID || '').trim(),
    wissenItemId: String(env.GAST_WISSEN_ITEM_ID || '').trim(),
    wissenPfad: String(env.GAST_WISSEN_PFAD || 'Richtlinienmanagement/wissen.json').trim(),
  };
}

function b64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Token zerlegen, ohne zu prüfen. */
function tokenTeile(token) {
  const teile = String(token || '').split('.');
  if (teile.length !== 3) throw new Error('kein JWT');
  return { kopf: JSON.parse(b64url(teile[0]).toString('utf8')), claims: JSON.parse(b64url(teile[1]).toString('utf8')),
    daten: teile[0] + '.' + teile[1], signatur: b64url(teile[2]) };
}

/**
 * Token prüfen. schluessel(kid) liefert den öffentlichen Schlüssel als JWK (oder null).
 * @returns {Promise<{upn:string, name:string, oid:string}>} sonst Fehler mit .status 401/403
 */
async function tokenPruefen(token, e, schluessel, jetzt) {
  const fehler = (status, text) => Object.assign(new Error(text), { status });
  let t;
  try { t = tokenTeile(token); } catch (x) { throw fehler(401, 'Token fehlt oder ist unlesbar.'); }
  if (t.kopf.alg !== 'RS256' || !t.kopf.kid) throw fehler(401, 'Token mit unerwarteter Signatur.');
  const jwk = await schluessel(t.kopf.kid);
  if (!jwk) throw fehler(401, 'Signaturschlüssel unbekannt.');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(t.daten), crypto.createPublicKey({ key: jwk, format: 'jwk' }), t.signatur);
  if (!ok) throw fehler(401, 'Signatur ungültig.');
  const c = t.claims;
  const s = Math.floor((jetzt || Date.now()) / 1000);
  if (!(c.exp > s - 60) || (c.nbf && c.nbf > s + 60)) throw fehler(401, 'Token abgelaufen.');
  if (c.tid !== e.tenant) throw fehler(401, 'Falscher Mandant.');
  const aussteller = [`https://login.microsoftonline.com/${e.tenant}/v2.0`, `https://sts.windows.net/${e.tenant}/`];
  if (!aussteller.includes(c.iss)) throw fehler(401, 'Falscher Aussteller.');
  if (![e.clientId, `api://${e.clientId}`].includes(c.aud)) throw fehler(401, 'Token ist nicht für diesen Dienst.');
  if (!String(c.scp || '').split(' ').includes(SCOPE)) throw fehler(403, 'Berechtigung Gast.Kurs fehlt.');
  const oid = String(c.oid || '').toLowerCase();
  const idp = String(c.idp || '').toLowerCase();
  const gast = !!idp && e.heimat.some(h => idp.includes(h));
  if (!gast && !e.testOids.includes(oid)) throw fehler(403, 'Nur für Gäste der freigegebenen Gesellschaften.');
  const upn = String(c.preferred_username || c.email || c.upn || c.unique_name || '').toLowerCase().replace(/^live\.com#/, '');
  if (!/^[^\s@|]+@[^\s@|]+\.[a-z]{2,}$/.test(upn)) throw fehler(403, 'Im Token fehlt die Adresse.');
  return { upn, name: String(c.name || upn).slice(0, 255), oid };
}

/** Nur die freigegebenen, aktiven Beiträge und ihre Themen; ohne Angaben zu Bearbeitern. */
function kursFiltern(daten, e) {
  const d = daten && typeof daten === 'object' ? daten : {};
  const beitraege = (d.beitraege || [])
    .filter(b => b && e.beitraege.includes(String(b.id)) && b.aktiv !== false)
    .map(b => { const k = Object.assign({}, b); delete k.erstelltVon; delete k.geaendertVon; return k; });
  const themen = new Set(beitraege.map(b => b.thema));
  return { version: d.version || 1, themen: (d.themen || []).filter(t => t && themen.has(t.id)), beitraege };
}

/** Kennung einer Bestätigung, wenn sie zu einem freigegebenen Beitrag gehört, sonst ''. */
function freigegebeneKennung(rid, e) {
  const s = String(rid || '');
  return s.indexOf(PREFIX) === 0 && e.beitraege.includes(s.slice(PREFIX.length)) ? s : '';
}

/** SharePoint-Eintrag -> Form, die das RMS kennt (wie _mapAck in js/sharepoint.js). */
function ackAusEintrag(item) {
  const f = (item && item.fields) || {};
  return {
    id: String(item.id), richtlinieId: f.RichtlinieId || '', version: f.RichtlinienVersion || '',
    benutzerUpn: f.BenutzerUPN || '', benutzerName: f.BenutzerName || '', gelesenAm: f.GelesenAm || '',
    quizBestanden: !!f.QuizBestanden, quizScore: Number(f.QuizScore || 0), quizVersuche: Number(f.QuizVersuche || 0),
    abgeschlossenAm: f.AbgeschlossenAm || '', fortschritt: f.Fortschritt || '',
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Anfrage zum Speichern prüfen und in Spalten umsetzen. Benutzer kommt aus dem Token.
 * spalten: Namen der Spalten, die es in der Liste gibt (nur die werden gesendet).
 * @returns {{felder:object, rid:string}} sonst Fehler mit .status 400
 */
function ackFelder(a, nutzer, e, spalten) {
  const fehler = text => Object.assign(new Error(text), { status: 400 });
  const rid = freigegebeneKennung(a && a.richtlinieId, e);
  if (!rid) throw fehler('Dieser Beitrag ist für Gäste nicht freigegeben.');
  const version = String((a && a.version) || '1').slice(0, 50);
  const zeit = (v, name) => { if (!v) return ''; if (!ISO.test(String(v))) throw fehler(`${name}: kein gültiger Zeitpunkt.`); return String(v); };
  const zahl = (v, max, name) => { const n = Number(v || 0); if (!Number.isFinite(n) || n < 0 || n > max) throw fehler(`${name}: ungültig.`); return Math.round(n); };
  const all = {
    Title: `${nutzer.upn}|${rid}|${version}`.slice(0, 255),
    RichtlinieId: rid,
    RichtlinienVersion: version,
    BenutzerUPN: nutzer.upn,
    BenutzerName: nutzer.name,
    GelesenAm: zeit(a.gelesenAm, 'Gelesen am') || new Date().toISOString(),
    QuizBestanden: !!a.quizBestanden,
    QuizScore: zahl(a.quizScore, 100, 'Ergebnis'),
    QuizVersuche: zahl(a.quizVersuche, 1000, 'Versuche'),
    AbgeschlossenAm: zeit(a.abgeschlossenAm, 'Abgeschlossen am'),
  };
  if (typeof a.fortschritt === 'string') all.Fortschritt = a.fortschritt.slice(0, 2000);
  if (!all.AbgeschlossenAm) delete all.AbgeschlossenAm;
  const gibt = new Set(spalten || Object.keys(all));
  return { felder: Object.fromEntries(Object.entries(all).filter(([k]) => gibt.has(k))), rid, version };
}

/** Gehört der vorhandene Eintrag dieser Person und diesem Beitrag? */
function eintragGehoert(item, nutzer, rid) {
  const f = (item && item.fields) || {};
  return String(f.BenutzerUPN || '').toLowerCase() === nutzer.upn && String(f.RichtlinieId || '') === rid;
}

/** OData-Wert in Hochkommas (Hochkomma verdoppeln). */
function odata(s) { return String(s).replace(/'/g, "''"); }

module.exports = { PREFIX, SCOPE, einstellungen, tokenTeile, tokenPruefen, kursFiltern, freigegebeneKennung, ackAusEintrag, ackFelder, eintragGehoert, odata };
