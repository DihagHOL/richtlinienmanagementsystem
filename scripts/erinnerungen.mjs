#!/usr/bin/env node
/**
 * Richtlinien-Erinnerungen (zeitgesteuert, App-only via Microsoft Graph).
 *
 * Läuft als GitHub-Action-Cron unbeaufsichtigt im Tenant – unabhängig davon,
 * ob jemand die Browser-App offen hat. Liest die SharePoint-Liste „Richtlinien"
 * + access-config.json, ermittelt überfällige Workflow-Schritte und schickt
 * Erinnerungs-Mails an die noch ausstehenden Prüfer / Geschäftsleitung.
 *
 * Verhalten kommt aus den APP-EINSTELLUNGEN (access-config.json, Reiter „Einstellungen →
 * Erinnerungen & Eskalation"): erinnerungenAktiv, mailSender, erinnerungErsteNachTagen,
 * erinnerungDannAlleTage, eskalationAbTagen, eskalationMail. Standard: erste Erinnerung nach
 * 7 Tagen, danach alle 3 Tage; ab 14 Tagen zusätzlich an die Eskalations-Mail.
 *
 * Benötigte Umgebungsvariablen (GitHub-Action-Secrets):
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET   – App-Registrierung (App-only), PFLICHT
 *   MAIL_SENDER                                              – Absender-Fallback, falls in den
 *                                                              App-Einstellungen kein „mailSender" gesetzt ist
 * Optional (überschreiben Defaults, App-Einstellungen haben aber Vorrang):
 *   SITE_HOST (Default dihag.sharepoint.com:/sites/IT), POLICY_LIST (Richtlinien),
 *   CONFIG_FOLDER (Richtlinienmanagement), APP_URL, ESKALATION_AB_TAGEN, DRY_RUN
 *
 * Benötigte Graph-APPLICATION-Rechte (Admin-Consent): Sites.Read.All, Mail.Send.
 * Für die Erinnerung an offene Kenntnisnahmen zusätzlich User.Read.All (Zielgruppen
 * auflösen). Fehlt das Recht, überspringt der Lauf nur diesen Teil.
 */

const TENANT = need('AZURE_TENANT_ID');
const CLIENT_ID = need('AZURE_CLIENT_ID');
const CLIENT_SECRET = need('AZURE_CLIENT_SECRET');
const ENV_SENDER = process.env.MAIL_SENDER || '';   // Fallback; bevorzugt wird „mailSender" aus den App-Einstellungen

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SITE_HOST = process.env.SITE_HOST || 'dihag.sharepoint.com:/sites/IT';
const POLICY_LIST = process.env.POLICY_LIST || 'Richtlinien';
const CONFIG_FOLDER = process.env.CONFIG_FOLDER || 'Richtlinienmanagement';
const APP_URL = process.env.APP_URL || 'https://rms.dihag.de/';
const ESKALATION_AB_ENV = Number(process.env.ESKALATION_AB_TAGEN || 0);
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
// Werden erst nach dem Laden der App-Einstellungen (access-config.json) gesetzt:
let SENDER = '';
let ALLOWED_DOMAIN = '';
const posInt = (v, def) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : def; };

function need(k) {
  const v = process.env[k];
  if (!v) { console.error(`FEHLT: Umgebungsvariable ${k}`); process.exit(1); }
  return v;
}

/** App-only-Token (Client-Credentials-Flow). */
async function getToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`Token (${r.status}): ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).access_token;
}

let TOKEN = '';
async function gget(path) {
  const r = await fetch(path.startsWith('http') ? path : GRAPH + path, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`GET ${path} (${r.status}): ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

/** Tage seit Referenzdatum (ganzzahlig). */
function daysSince(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return -1;
  return Math.floor((Date.now() - t) / 86400000);
}

/** Ist heute ein Erinnerungstag? Erste Erinnerung nach `erste` Tagen, danach alle `alle` Tage. */
function isDue(tage, erste, alle) {
  if (tage < 1 || tage < erste) return false;
  return (tage - erste) % alle === 0;
}

const lc = (s) => String(s || '').toLowerCase();
const inDomain = (upn) => ALLOWED_DOMAIN && lc(upn).endsWith('@' + ALLOWED_DOMAIN);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function resolveSiteAndList() {
  const site = await gget(`/sites/${SITE_HOST}`);
  const lists = await gget(`/sites/${site.id}/lists?$filter=displayName eq '${encodeURIComponent(POLICY_LIST)}'`);
  const list = (lists.value || [])[0];
  if (!list) throw new Error(`Liste „${POLICY_LIST}" auf ${SITE_HOST} nicht gefunden.`);
  return { siteId: site.id, listId: list.id };
}

/** access-config.json aus der Dokumentbibliothek lesen (Rollen/Schwellen). */
async function loadConfig(siteId) {
  const drives = await gget(`/sites/${siteId}/drives`);
  const docDrive = (drives.value || []).find((d) =>
    ['Dokumente', 'Documents', 'Freigegebene Dokumente', 'Shared Documents'].includes(d.name)
  ) || (drives.value || [])[0];
  if (!docDrive) return {};
  try {
    const r = await fetch(`${GRAPH}/drives/${docDrive.id}/root:/${CONFIG_FOLDER}/access-config.json:/content`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

async function loadPolicies(siteId, listId) {
  const out = [];
  let url = `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`;
  while (url) {
    const page = await gget(url);
    (page.value || []).forEach((it) => out.push(it));
    url = page['@odata.nextLink'] || null;
  }
  return out;
}

/**
 * @param {string[]} [extraErlaubt] Adressen, die trotz fremder Domain zugestellt
 *   werden dürfen – die Betriebsrats-Adressen liegen auf Gruppengesellschafts-
 *   Domains (z. B. ewa-guss.de) und sind von Admins gepflegt, also vertrauenswürdig.
 */
async function sendMail(toList, subject, html, attachments = [], extraErlaubt = []) {
  const erlaubt = new Set(extraErlaubt.map(lc));
  const recipients = [...new Set(toList.filter((u) => inDomain(u) || erlaubt.has(lc(u))).map(lc))];
  if (!recipients.length) { console.log(`   ⚠ keine gültigen Empfänger (Domain ${ALLOWED_DOMAIN}) – übersprungen`); return false; }
  const mitAnhang = attachments && attachments.length ? ' (mit Anhang)' : '';
  if (DRY_RUN) { console.log(`   [DRY_RUN] würde senden an: ${recipients.join(', ')}${mitAnhang}`); return true; }
  const message = {
    subject: subject.slice(0, 255),
    body: { contentType: 'HTML', content: html },
    toRecipients: recipients.map((a) => ({ emailAddress: { address: a } })),
  };
  if (attachments && attachments.length) message.attachments = attachments;
  const r = await fetch(`${GRAPH}/users/${encodeURIComponent(SENDER)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: false }),
  });
  if (!r.ok) { console.log(`   ✗ sendMail (${r.status}): ${(await r.text()).slice(0, 200)}`); return false; }
  console.log(`   ✓ gesendet an: ${recipients.join(', ')}${mitAnhang}`);
  return true;
}

const MAX_ATTACH = 2.5 * 1024 * 1024;   // ~2,5 MB roh → base64 bleibt unter Graphs 4-MB-Mailgrenze

function guessType(name = '') {
  const e = String(name).toLowerCase().split('.').pop();
  return ({
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }[e]) || 'application/octet-stream';
}

/** Graph-Shares-ID aus einer Freigabe-/Web-URL (für Dokumente ohne gespeicherte DriveId/ItemId). */
function encodeShareUrl(u) {
  const b64 = Buffer.from(u, 'utf8').toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  return 'u!' + b64;
}

/** Dokument der Richtlinie als E-Mail-Anhang (oder null → nur Link). */
async function fetchAttachment(driveId, itemId, fallbackName, docUrl) {
  let metaPath, contentPath;
  if (driveId && itemId) {
    metaPath = `/drives/${driveId}/items/${itemId}?$select=name,size,file`;
    contentPath = `/drives/${driveId}/items/${itemId}/content`;
  } else if (docUrl) {
    const sid = encodeShareUrl(docUrl);
    metaPath = `/shares/${sid}/driveItem?$select=name,size,file`;
    contentPath = `/shares/${sid}/driveItem/content`;
  } else {
    return null;
  }
  let meta;
  try { meta = await gget(metaPath); }
  catch (e) { console.log(`   ⚠ Anhang-Metadaten nicht ladbar: ${e.message} – Mail nur mit Link`); return null; }
  if ((meta.size || 0) > MAX_ATTACH) { console.log(`   ⚠ Dokument ${((meta.size || 0) / 1048576).toFixed(1)} MB > ${(MAX_ATTACH / 1048576).toFixed(1)} MB – Mail nur mit Link`); return null; }
  try {
    // /content liefert 302 auf eine vorab-authentifizierte URL; fetch folgt dem Redirect.
    const r = await fetch(GRAPH + contentPath, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) { console.log(`   ⚠ Anhang-Download ${r.status} – Mail nur mit Link`); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_ATTACH) { console.log('   ⚠ Anhang zu groß – Mail nur mit Link'); return null; }
    return {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: meta.name || fallbackName || 'Richtlinie',
      contentType: (meta.file && meta.file.mimeType) || guessType(meta.name || fallbackName),
      contentBytes: buf.toString('base64'),
    };
  } catch (e) { console.log(`   ⚠ Anhang-Fehler: ${e.message} – Mail nur mit Link`); return null; }
}

/* ── Vertretung (Urlaub, Krankheit) ──
   Dieselbe Regel wie in der App: Läuft der Zeitraum, geht die Erinnerung auch an
   die Vertretung, und ihr Votum zählt für die vertretene Person – sonst würde
   weiter gemahnt, obwohl längst entschieden ist. */

function vertretungAktiv(eintrag, heute) {
  if (!eintrag || !eintrag.vertreter) return false;
  const tag = (heute || new Date().toISOString()).slice(0, 10);
  const von = String(eintrag.von || '').slice(0, 10);
  const bis = String(eintrag.bis || '').slice(0, 10);
  if (von && tag < von) return false;
  if (bis && tag > bis) return false;
  return true;
}

/** Empfänger um die gerade aktiven Vertretungen erweitern. */
function mitVertretern(liste, vertretungen) {
  const v = vertretungen || {};
  const out = [];
  for (const u of (liste || []).filter(Boolean)) {
    const key = lc(u);
    if (!out.includes(key)) out.push(key);
    const e = v[key];
    if (vertretungAktiv(e) && !out.includes(lc(e.vertreter))) out.push(lc(e.vertreter));
  }
  return out;
}

/** Wer hat abgestimmt – auch, wenn es die Vertretung war (Feld „fuer"). */
function abgestimmtVon(votes) {
  const out = [];
  for (const v of (votes || [])) {
    if (v.upn) out.push(lc(v.upn));
    if (v.fuer) out.push(lc(v.fuer));
  }
  return out;
}

/** Direktlink in die App, der genau diese Richtlinie im Freigabe-Reiter öffnet. */
function policyLink(id, aktion, token, empf) {
  const sep = APP_URL.includes('?') ? '&' : '?';
  return `${APP_URL}${sep}richtlinie=${encodeURIComponent(id)}&ansicht=freigaben`
    + (aktion ? '&aktion=' + aktion : '')
    + (aktion && token ? '&t=' + encodeURIComponent(token) : '')
    // Adressat im Link: Microsoft meldet ihn ohne Kontoauswahl an.
    + (aktion && empf ? '&u=' + encodeURIComponent(empf) : '');
}

/** Geltungsbereich als Text ('' = nicht gepflegt). Steht im Sammelfeld DatenJson,
 *  bei Altbestand in der Spalte GeltungsbereichJson. */
function geltungsbereich(f) {
  let arr = [];
  try {
    const d = JSON.parse(f.DatenJson || '{}') || {};
    arr = Array.isArray(d.geltungsbereich) ? d.geltungsbereich : [];
  } catch { arr = []; }
  if (!arr.length) {
    try { const g = JSON.parse(f.GeltungsbereichJson || '[]'); if (Array.isArray(g)) arr = g; } catch { /* keiner */ }
  }
  if (!arr.length) return '';
  return arr.includes('ALLE') ? 'Alle Standorte' : arr.join(', ');
}

/** Einmal-Token der laufenden Runde aus dem Sammelfeld (für den Ein-Klick-Link). */
function aktionToken(f, art) {
  try {
    const t = (JSON.parse(f.DatenJson || '{}') || {}).aktionToken;
    return (t && t.art === art && t.wert) ? t.wert : '';
  } catch { return ''; }
}

/** Konzepte liegen nicht im Freigaben-Reiter, sondern im Regelwerk-Dashboard. */
function konzeptLink(id, aktion) {
  const sep = APP_URL.includes('?') ? '&' : '?';
  return `${APP_URL}${sep}konzept=${encodeURIComponent(id)}${aktion ? '&aktion=' + aktion : ''}`;
}

const _btn = (href, bg, label) => `<a href="${esc(href)}" style="background:${bg};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600;margin:0 8px 8px 0">${label}</a>`;

function mailHtml(id, title, phase, tage, pending, eskaliert, attachmentName, token, geltung, empf) {
  const konzept = phase === 'Konzeptprüfung';
  const link = konzept ? konzeptLink(id) : policyLink(id);
  const actions = konzept
    ? _btn(konzeptLink(id, 'annehmen'), '#16a34a', '✓ Annehmen → Regelwerk')
      + _btn(konzeptLink(id, 'zurueckstellen'), '#64748b', '⏸ Zurückstellen')
      + _btn(konzeptLink(id, 'ablehnen'), '#dc2626', '✗ Ablehnen')
    : phase === 'Freigabe'
      ? _btn(policyLink(id, 'freigeben', token, empf), '#16a34a', '✓ Freigeben') + _btn(policyLink(id, 'zurueck', token, empf), '#dc2626', '✗ Zurück (nicht konform)')
      : _btn(policyLink(id, 'konform', token, empf), '#16a34a', '✓ Konform') + _btn(policyLink(id, 'nicht_konform', token, empf), '#dc2626', '✗ Nicht konform');
  const gegenstand = konzept ? 'das Regelwerk-Konzept' : 'das Regelwerk';
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937">
    <p>Guten Tag,</p>
    <p>für ${gegenstand} <a href="${esc(link)}" style="color:#1a56db;font-weight:700;text-decoration:none">${esc(title)}</a>
       steht seit <b>${tage} Tagen</b> der Schritt <b>${esc(phase)}</b> aus.</p>
    ${geltung ? `<p><b>Geltungsbereich:</b> ${esc(geltung)}</p>` : ''}
    <p>Bitte um Sichtung und ggf. Anmerkung. Noch ausstehend:</p>
    <ul>${pending.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
    ${attachmentName ? `<p>📎 Das aktuelle Dokument ist dieser E-Mail angehängt: <b>${esc(attachmentName)}</b>.</p>` : ''}
    ${eskaliert ? `<p style="color:#b45309"><b>Eskalation:</b> Diese Erinnerung geht aufgrund der Verzögerung zusätzlich an den Ersatz-Empfänger.</p>` : ''}
    <p style="margin:18px 0 6px"><b>Direkt entscheiden:</b></p>
    <p>${actions}</p>
    <p style="color:#6b7280;font-size:12px">Der Button öffnet den Vorgang in der App und führt die Entscheidung nach kurzer Rückfrage aus (Anmeldung nötig).
       Oder <a href="${esc(link)}" style="color:#1a56db">nur ansehen &amp; bearbeiten</a>.<br>Automatische Erinnerung des DIHAG Richtlinienmanagements.</p>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   Kenntnisnahmen der Mitarbeitenden
   ═══════════════════════════════════════════════════
   Der Cron erinnerte nur die Fachrollen (Prüfung, Mitbestimmung, Freigabe).
   Wer ein veröffentlichtes Regelwerk lesen und bestätigen muss, hörte nach der
   Veröffentlichungsmail nie wieder etwas davon – dabei hängt genau daran der
   Nachweis. Jede Person bekommt eine Mail über alle ihre offenen Regelwerke,
   nicht eine Mail je Regelwerk. */

/** Aktive Mitarbeitende aus Entra. Braucht das Anwendungsrecht User.Read.All. */
async function ladeMitarbeitende() {
  const out = [];
  let url = '/users?$select=displayName,userPrincipalName,mail,department,accountEnabled&$top=999';
  while (url) {
    const page = await gget(url);
    for (const u of (page.value || [])) {
      if (u.accountEnabled === false) continue;
      const upn = String(u.userPrincipalName || u.mail || '').trim();
      if (!upn.includes('@')) continue;
      out.push({ upn, name: u.displayName || upn, abteilung: String(u.department || '').trim() });
    }
    url = page['@odata.nextLink'] || null;
  }
  return out;
}

/** Bestätigungen als Nachschlagewerk: „regelwerkId|version|upn" → Eintrag. */
async function ladeBestaetigungen(siteId) {
  const lists = await gget(`/sites/${siteId}/lists?$filter=displayName eq 'Bestaetigungen'`);
  const list = (lists.value || [])[0];
  if (!list) return null;
  const map = new Map();
  let url = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=500`;
  while (url) {
    const page = await gget(url);
    for (const it of (page.value || [])) {
      const f = it.fields || {};
      map.set(`${f.RichtlinieId}|${f.RichtlinienVersion}|${lc(f.BenutzerUPN)}`, {
        gelesenAm: f.GelesenAm || '',
        quizBestanden: f.QuizBestanden === true,
        abgeschlossenAm: f.AbgeschlossenAm || '',
      });
    }
    url = page['@odata.nextLink'] || null;
  }
  return map;
}

/** Rollen einer Person: AD-Abteilung plus manuelle Zuordnung aus der Konfiguration. */
function rollenVon(user, userRoles) {
  const manuell = (userRoles && (userRoles[lc(user.upn)] || userRoles[user.upn])) || [];
  return [user.abteilung, ...(Array.isArray(manuell) ? manuell : [])]
    .filter(Boolean).map((r) => lc(String(r).trim()));
}

/** Gilt das Regelwerk für diese Rollen? Leere Zielgruppe oder „ALLE" heißt: für alle. */
function zielgruppeTrifft(zielgruppen, rollen) {
  const zg = (Array.isArray(zielgruppen) ? zielgruppen : []).filter(Boolean);
  if (!zg.length || zg.some((z) => lc(z) === 'alle')) return true;
  const set = new Set((rollen || []).map(lc));
  return zg.some((z) => set.has(lc(String(z).trim())));
}

/** Ist die Kenntnisnahme offen? Auch dann, wenn die Wiederholungsfrist abgelaufen ist. */
function kenntnisOffen(ack, quizNoetig, wiederholungMonate) {
  if (!ack || !ack.gelesenAm) return true;
  if (quizNoetig && !ack.quizBestanden) return true;
  const monate = Number(wiederholungMonate || 0);
  if (monate > 0) {
    const faellig = new Date(ack.abgeschlossenAm || ack.gelesenAm);
    if (!isNaN(faellig)) {
      faellig.setMonth(faellig.getMonth() + monate);
      if (faellig.getTime() < Date.now()) return true;
    }
  }
  return false;
}

/** Direktlink auf ein Regelwerk in der Leseansicht. */
function regelwerkLink(id) {
  const sep = APP_URL.includes('?') ? '&' : '?';
  return `${APP_URL}${sep}richtlinie=${encodeURIComponent(id)}`;
}

function kenntnisMailHtml(name, posten) {
  const zeilen = posten.map((x) => `<li style="margin-bottom:6px">
      <a href="${esc(regelwerkLink(x.id))}" style="color:#1a56db;font-weight:700;text-decoration:none">${esc(x.title)}</a>
      <span style="color:#6b7280"> – seit ${x.tage} Tag(en) veröffentlicht${x.quizNoetig ? ', mit Wissenstest' : ''}${x.geltung ? ' · gilt für ' + esc(x.geltung) : ''}</span></li>`).join('');
  const eins = posten.length === 1;
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px">
    <p>Guten Tag ${esc(name)},</p>
    <p>${eins ? 'ein Regelwerk wartet' : `${posten.length} Regelwerke warten`} noch auf Ihre Kenntnisnahme:</p>
    <ul style="padding-left:18px">${zeilen}</ul>
    <p>Bitte öffnen, lesen und die Kenntnisnahme bestätigen${posten.some((x) => x.quizNoetig) ? ' – bei Regelwerken mit Wissenstest zusätzlich den Test bestehen' : ''}.
       Das dauert meist wenige Minuten.</p>
    <p style="margin:18px 0 6px">${_btn(`${APP_URL}${APP_URL.includes('?') ? '&' : '?'}ansicht=meine`, '#1a56db', 'Meine Regelwerke öffnen →')}</p>
    <p style="color:#6b7280;font-size:12px">Automatische Erinnerung des DIHAG Regelwerk-Managements.
       Ist etwas bereits erledigt, kreuzt sich diese Mail nur mit Ihrer Bestätigung – dann bitte ignorieren.</p>
  </div>`;
}

function kenntnisEskalationHtml(posten) {
  const rows = posten.map((x) => `<tr>
      <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${esc(x.title)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;color:#b45309;font-weight:600">seit ${x.tage} Tagen</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${x.offen.length} offen</td></tr>
    <tr><td colspan="3" style="padding:0 8px 8px;color:#6b7280;font-size:12px">${esc(x.offen.join(', '))}</td></tr>`).join('');
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;max-width:640px">
    <p><b>Offene Kenntnisnahmen – Eskalation</b></p>
    <p>Bei folgenden Regelwerken fehlen Bestätigungen deutlich über die vorgesehene Frist hinaus:</p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="margin-top:16px">${_btn(`${APP_URL}${APP_URL.includes('?') ? '&' : '?'}ansicht=compliance`, '#1a56db', 'Audit Report öffnen →')}</p>
    <p style="color:#6b7280;font-size:12px">Zweck ist der Nachweis der Unterweisung, keine Leistungskontrolle.
       Automatische Nachricht des DIHAG Regelwerk-Managements.</p>
  </div>`;
}

(async function main() {
  console.log(`Richtlinien-Erinnerungen · ${new Date().toISOString()} · DRY_RUN=${DRY_RUN}`);
  TOKEN = await getToken();
  const { siteId, listId } = await resolveSiteAndList();
  const cfg = await loadConfig(siteId);
  if (cfg.erinnerungenAktiv === false) {
    console.log('Erinnerungen sind in den App-Einstellungen deaktiviert – nichts zu tun.');
    return;
  }
  SENDER = (cfg.mailSender || ENV_SENDER || '').trim();
  if (!SENDER) { console.error('FEHLT: Absender. „Absender-Postfach" in den App-Einstellungen setzen oder Secret MAIL_SENDER hinterlegen.'); process.exit(1); }
  ALLOWED_DOMAIN = SENDER.split('@')[1]?.toLowerCase() || '';
  const erste = posInt(process.env.ERINNERUNG_ERSTE, posInt(cfg.erinnerungErsteNachTagen, 7));
  const alle = posInt(process.env.ERINNERUNG_ALLE, posInt(cfg.erinnerungDannAlleTage, 3));
  const eskalationAb = posInt(cfg.eskalationAbTagen, ESKALATION_AB_ENV || 14);
  const pruefer = (cfg.pruefer || []).filter(Boolean);
  const gl = (cfg.geschaeftsleitung || []).filter(Boolean);
  const kbrMail = (cfg.kbrMail || '').trim();
  const brMails = (cfg.brMails && typeof cfg.brMails === 'object') ? cfg.brMails : {};
  const eskalationMail = cfg.eskalationMail || '';
  console.log(`Absender: ${SENDER} · Prüfer: ${pruefer.length} · GL: ${gl.length} · Taktung: erst nach ${erste}d, dann alle ${alle}d · Eskalation ab ${eskalationAb}d → ${eskalationMail || '–'}`);

  const items = await loadPolicies(siteId, listId);
  console.log(`Richtlinien gesamt: ${items.length}`);

  let sent = 0, checked = 0;
  for (const it of items) {
    const f = it.fields || {};
    const status = f.Status || '';
    const title = f.Title || '(ohne Titel)';
    let ref = f.PruefungSeit || it.lastModifiedDateTime || '';
    if ((f.Typ2 || '') === 'Konzept') {
      try { ref = (JSON.parse(f.KonzeptJson || '{}') || {}).eingereichtAm || ref; } catch { /* Standard */ }
    }
    const tage = daysSince(ref);

    let phase = '', roleRecipients = [], voted = [];
    // Konzepte: liegen bei der Geschäftsleitung, solange keine Entscheidung
    // gefallen ist. Sie tragen keinen Status, sondern stecken in KonzeptJson –
    // ohne diesen Zweig wurde die erste Etappe des Ablaufs nie erinnert.
    if ((f.Typ2 || '') === 'Konzept') {
      let ko = {};
      try { ko = JSON.parse(f.KonzeptJson || '{}') || {}; } catch { ko = {}; }
      const entschieden = ko.entscheidung && ko.entscheidung.status;
      if (!ko.eingereichtAm || entschieden) continue;      // Entwurf oder erledigt
      phase = 'Konzeptprüfung';
      roleRecipients = mitVertretern(gl, cfg.vertretungen);
      voted = [];
    } else if (status === 'Mitbestimmung') {
      // Beim Betriebsrat: KBR und/oder die Betriebsräte der betroffenen Werke.
      let mb = {};
      try { mb = JSON.parse(f.MitbestimmungJson || '{}') || {}; } catch { mb = {}; }
      if (mb.bestaetigung && mb.bestaetigung.konform) continue;   // schon bestätigt
      const werke = Array.isArray(mb.werke) ? mb.werke : [];
      phase = 'Mitbestimmung';
      roleRecipients = [mb.kbrBetroffen ? kbrMail : '', ...werke.map((w) => brMails[w] || '')]
        .filter(Boolean);
      voted = [];
    } else if (status === 'Konformitätsprüfung' || status === 'InReview') {
      phase = 'Konformitätsprüfung';
      // Pro-Richtlinie-Prüfer haben Vorrang; sonst die globale Prüferliste.
      let ownPruefer = [];
      try { const pk = JSON.parse(f.PruefKonfigJson || '{}'); if (Array.isArray(pk.pruefer)) ownPruefer = pk.pruefer.filter(Boolean); } catch { ownPruefer = []; }
      roleRecipients = mitVertretern(ownPruefer.length ? ownPruefer : pruefer, cfg.vertretungen);
      try { voted = abgestimmtVon(JSON.parse(f.KonformitaetJson || '[]')); } catch { voted = []; }
    } else if (status === 'Freigabe' || status === 'Freigabe ausstehend') {
      phase = 'Freigabe';
      // Pro-Richtlinie-Freigeber haben Vorrang; sonst die globale GL-Liste.
      let ownFreigeber = [];
      try { const fk = JSON.parse(f.FreigabeKonfigJson || '{}'); if (Array.isArray(fk.freigeber)) ownFreigeber = fk.freigeber.filter(Boolean); } catch { ownFreigeber = []; }
      roleRecipients = mitVertretern(ownFreigeber.length ? ownFreigeber : gl, cfg.vertretungen);
      try { voted = abgestimmtVon(JSON.parse(f.FreigabeJson || '[]')); } catch { voted = []; }
    } else {
      continue; // nur laufende Workflow-Schritte
    }
    checked++;

    if (!isDue(tage, erste, alle)) { console.log(`• ${title} [${phase}] – ${tage}d, heute keine Erinnerung`); continue; }

    const vertretungen = cfg.vertretungen || {};
    const erledigt = (u) => {
      const key = lc(u);
      if (voted.includes(key)) return true;
      // Hat die Person, die diese hier vertritt, schon entschieden? Und andersherum.
      const e = vertretungen[key];
      if (vertretungAktiv(e) && voted.includes(lc(e.vertreter))) return true;
      return Object.entries(vertretungen).some(([fuer, x]) =>
        vertretungAktiv(x) && lc(x.vertreter) === key && voted.includes(lc(fuer)));
    };
    const pending = roleRecipients.filter((u) => !erledigt(u));
    if (!pending.length) { console.log(`• ${title} [${phase}] – ${tage}d, alle haben bereits reagiert`); continue; }

    const eskaliert = eskalationAb > 0 && tage >= eskalationAb && !!eskalationMail;
    const docUrl = typeof f.DokumentUrl === 'string' ? f.DokumentUrl : ((f.DokumentUrl && f.DokumentUrl.Url) || '');
    console.log(`   doc-Felder: driveId=${f.DokumentDriveId ? 'ja' : 'nein'}, itemId=${f.DokumentItemId ? 'ja' : 'nein'}, url=${docUrl ? 'ja' : 'nein'}, name=${f.DokumentName || '-'}`);
    const att = await fetchAttachment(f.DokumentDriveId, f.DokumentItemId, f.DokumentName, docUrl);
    console.log(`• ${title} [${phase}] – ${tage}d, ausstehend: ${pending.join(', ')}${eskaliert ? ' (+Eskalation)' : ''}${att ? ' (+Anhang)' : ''}`);
    // Bei der Mitbestimmung sind die Empfänger admin-gepflegte BR-Adressen –
    // sie dürfen auch auf Gruppengesellschafts-Domains liegen.
    // Einzelversand: Der Ein-Klick-Link trägt die Adresse des Empfängers, sonst müsste
    // sich jeder erst anmelden. Die Eskalation geht zusätzlich raus – ohne persönlichen
    // Link, sie entscheidet ja nicht.
    const tok = aktionToken(f, phase === 'Freigabe' ? 'freigabe' : 'pruefung');
    const bau = (empf) => mailHtml(it.id, title, phase, tage, pending, eskaliert,
      att ? att.name : '', tok, geltungsbereich(f), empf);
    const erlaubt = phase === 'Mitbestimmung' ? roleRecipients : [];
    let zugestellt = 0;
    for (const empf of pending) {
      if (await sendMail([empf], `Erinnerung: ${phase} – ${title}`, bau(empf), att ? [att] : [], erlaubt)) zugestellt++;
    }
    if (eskaliert && await sendMail([eskalationMail], `Erinnerung: ${phase} – ${title}`,
      bau(''), att ? [att] : [], erlaubt)) zugestellt++;
    if (zugestellt) sent++;
  }

  // ── Offene Kenntnisnahmen: Erinnerung an die Mitarbeitenden ──
  try {
    if (cfg.kenntnisErinnerungAktiv === false) {
      console.log('Kenntnisnahme-Erinnerungen: in den App-Einstellungen abgeschaltet.');
    } else {
      const kErste = posInt(cfg.kenntnisErsteNachTagen, 7);
      const kAlle = posInt(cfg.kenntnisDannAlleTage, 7);
      const kEskAb = posInt(cfg.kenntnisEskalationAbTagen, 21);
      const kEskMail = String(cfg.kenntnisEskalationMail || cfg.eskalationMail || '').trim();
      const acks = await ladeBestaetigungen(siteId);
      let users = [];
      if (!acks) {
        console.log('Kenntnisnahme: Liste „Bestaetigungen" nicht gefunden – übersprungen.');
      } else {
        try {
          users = await ladeMitarbeitende();
        } catch (e) {
          console.log(`Kenntnisnahme: Mitarbeitende nicht lesbar (${e.message}). Dem App-Konto fehlt`
            + ' vermutlich das Anwendungsrecht „User.Read.All" (Admin-Consent) – Teil übersprungen.');
        }
      }
      if (acks && users.length) {
        const userRoles = (cfg.userRoles && typeof cfg.userRoles === 'object') ? cfg.userRoles : {};
        const jeUser = new Map();     // upn → { upn, name, posten: [] }
        const eskalation = [];        // { title, tage, offen: [Namen] }
        for (const it of items) {
          const f = it.fields || {};
          if ((f.Status || '') !== 'Veröffentlicht') continue;
          if (f.Pflicht === false) continue;            // freiwillige Lektüre wird nicht angemahnt
          const tage = daysSince(f.VeroeffentlichtAm || it.lastModifiedDateTime || '');
          const faellig = isDue(tage, kErste, kAlle);
          const eskaliert = kEskAb > 0 && tage >= kEskAb && !!kEskMail;
          if (!faellig && !eskaliert) continue;
          const title = f.Title || '(ohne Titel)';
          const version = f.Version1 || '1.0';
          let zg = []; try { zg = JSON.parse(f.Zielgruppen || '[]'); } catch { zg = []; }
          let fragen = 0; try { fragen = (JSON.parse(f.QuizJson || '[]') || []).length; } catch { fragen = 0; }
          const quizNoetig = !!f.QuizErforderlich && fragen > 0;
          const offeneNamen = [];
          for (const u of users) {
            if (!zielgruppeTrifft(zg, rollenVon(u, userRoles))) continue;
            if (!kenntnisOffen(acks.get(`${it.id}|${version}|${lc(u.upn)}`), quizNoetig, f.WiederholungMonate)) continue;
            offeneNamen.push(u.name);
            if (!faellig) continue;                     // an diesem Tag nur für die Eskalation zählen
            if (!jeUser.has(lc(u.upn))) jeUser.set(lc(u.upn), { upn: u.upn, name: u.name, posten: [] });
            jeUser.get(lc(u.upn)).posten.push({ id: it.id, title, tage, quizNoetig, geltung: geltungsbereich(f) });
          }
          if (eskaliert && offeneNamen.length) eskalation.push({ title, tage, offen: offeneNamen });
          console.log(`• Kenntnisnahme „${title}" – ${tage}d, offen: ${offeneNamen.length}`);
        }
        for (const u of jeUser.values()) {
          const betreff = u.posten.length === 1
            ? `Bitte um Kenntnisnahme: ${u.posten[0].title}`
            : `${u.posten.length} Regelwerke warten auf Ihre Kenntnisnahme`;
          if (await sendMail([u.upn], betreff, kenntnisMailHtml(u.name, u.posten), [])) sent++;
        }
        console.log(`Kenntnisnahme: ${jeUser.size} Person(en) erinnert.`);
        if (eskalation.length && kEskMail) {
          eskalation.sort((a, b) => b.tage - a.tage);
          if (await sendMail([kEskMail], `Offene Kenntnisnahmen: ${eskalation.length} Regelwerk(e) überfällig`,
            kenntnisEskalationHtml(eskalation), [])) sent++;
          console.log(`Kenntnisnahme-Eskalation: ${eskalation.length} Regelwerk(e) an ${kEskMail}`);
        }
      }
    }
  } catch (e) { console.log('Kenntnisnahme-Erinnerungen übersprungen:', e.message); }

  // ── Review-Fälligkeiten (Wiedervorlage) als Sammel-Mail an die Admins (ISO 27001 A.5.1) ──
  try {
    const admins = (cfg.admins || []).filter(Boolean);
    const reviewVorlauf = posInt(cfg.reviewVorlaufTage, 14);
    if (!admins.length) {
      console.log('Review-Digest: keine Admins in der Config – übersprungen.');
    } else {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = [];
      for (const it of items) {
        const f = it.fields || {};
        if ((f.Status || '') === 'Archiviert' || !f.NaechsteReview) continue;
        const d = new Date(f.NaechsteReview); if (isNaN(d)) continue;
        d.setHours(0, 0, 0, 0);
        const tageBis = Math.round((d - today) / 86400000);
        if (tageBis <= reviewVorlauf) due.push({ title: f.Title || '(ohne Titel)', tageBis });
      }
      if (!due.length) {
        console.log('Review-Digest: keine fälligen Überprüfungen.');
      } else {
        due.sort((a, b) => a.tageBis - b.tageBis);
        const rows = due.map((x) => {
          const lab = x.tageBis < 0 ? `überfällig seit ${-x.tageBis} Tag(en)` : (x.tageBis === 0 ? 'heute fällig' : `fällig in ${x.tageBis} Tag(en)`);
          const col = x.tageBis < 0 ? '#b91c1c' : (x.tageBis <= 7 ? '#b45309' : '#374151');
          return `<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${esc(x.title)}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:${col};font-weight:600;white-space:nowrap">${esc(lab)}</td></tr>`;
        }).join('');
        const overdue = due.filter((x) => x.tageBis < 0).length;
        const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px">
          <p><b>Fällige Richtlinien-Überprüfungen (Wiedervorlage)</b></p>
          <p>Folgende Richtlinien sind überfällig oder werden in den nächsten ${reviewVorlauf} Tagen zur internen Überprüfung fällig (ISO&nbsp;27001 A.5.1):</p>
          <table style="border-collapse:collapse;width:100%">${rows}</table>
          <p style="margin-top:16px"><a href="${esc(APP_URL)}?ansicht=faelligkeit" style="background:#1a56db;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">Fälligkeiten öffnen →</a></p>
          <p style="color:#6b7280;font-size:12px">Automatische Nachricht des DIHAG Richtlinienmanagements.</p></div>`;
        const ok = await sendMail(admins, `Richtlinien-Überprüfung: ${due.length} fällig/überfällig${overdue ? ` (davon ${overdue} überfällig)` : ''}`, html, []);
        if (ok) sent++;
        console.log(`Review-Digest: ${due.length} fällige Überprüfung(en) (${overdue} überfällig) an ${admins.join(', ')}`);
      }
    }
  } catch (e) { console.log('Review-Digest übersprungen:', e.message); }

  // ── Risiko-Digest: überfällige Maßnahmen + Risiko-Reviews an die Admins (ISO 27001 6.1.3/8.3) ──
  try {
    const admins = (cfg.admins || []).filter(Boolean);
    if (!admins.length) {
      console.log('Risiko-Digest: keine Admins in der Config – übersprungen.');
    } else {
      // Liste „Risiken" suchen (existiert erst nach dem ersten Öffnen des Reiters)
      const rl = await gget(`/sites/${siteId}/lists?$filter=displayName eq 'Risiken'`);
      const riskList = (rl.value || [])[0];
      if (!riskList) {
        console.log('Risiko-Digest: Liste „Risiken" existiert (noch) nicht – übersprungen.');
      } else {
        const risks = [];
        let url = `/sites/${siteId}/lists/${riskList.id}/items?$expand=fields&$top=200`;
        while (url) {
          const resp = await gget(url);
          for (const it of (resp.value || [])) risks.push(it.fields || {});
          url = resp['@odata.nextLink'] || null;
        }
        const todayStr = new Date().toISOString().slice(0, 10);
        const rowsOut = [];
        for (const f of risks) {
          if ((f.RiskStatus || 'offen') === 'geschlossen') continue;
          let ms = [];
          try { ms = JSON.parse(f.MassnahmenJson || '[]'); } catch (e) { ms = []; }
          for (const m of ms) {
            if (m && m.status !== 'erledigt' && m.frist && String(m.frist).slice(0, 10) < todayStr) {
              rowsOut.push({ risiko: f.Title || '(ohne Titel)', was: `Maßnahme „${m.titel || '?'}" überfällig seit ${String(m.frist).slice(0, 10)}`, wer: m.verantwortlich || '' });
            }
          }
          if (f.NaechsteReview && String(f.NaechsteReview).slice(0, 10) < todayStr) {
            rowsOut.push({ risiko: f.Title || '(ohne Titel)', was: `Risiko-Review überfällig (${String(f.NaechsteReview).slice(0, 10)})`, wer: f.Eigner || '' });
          }
        }
        if (!rowsOut.length) {
          console.log('Risiko-Digest: nichts überfällig.');
        } else {
          const rows = rowsOut.map((x) =>
            `<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${esc(x.risiko)}</td>
             <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#b91c1c;font-weight:600">${esc(x.was)}</td>
             <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${esc(x.wer)}</td></tr>`).join('');
          const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;max-width:640px">
            <p><b>Risiko-Register: überfällige Maßnahmen und Reviews</b></p>
            <p>Im Risiko-Register sind Fristen abgelaufen (ISO&nbsp;27001 6.1.3/8.3):</p>
            <table style="border-collapse:collapse;width:100%">${rows}</table>
            <p style="margin-top:16px"><a href="${esc(APP_URL)}?ansicht=risiken" style="background:#1a56db;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">Risiko-Register öffnen →</a></p>
            <p style="color:#6b7280;font-size:12px">Automatische Nachricht des DIHAG Richtlinienmanagements.</p></div>`;
          const ok = await sendMail(admins, `Risiko-Register: ${rowsOut.length} überfällige Frist(en)`, html, []);
          if (ok) sent++;
          console.log(`Risiko-Digest: ${rowsOut.length} überfällige Frist(en) an ${admins.join(', ')}`);
        }
      }
    }
  } catch (e) { console.log('Risiko-Digest übersprungen:', e.message); }

  console.log(`Fertig. Laufende Schritte geprüft: ${checked}, Erinnerungen gesendet: ${sent}.`);
})().catch((e) => { console.error('FEHLER:', e.message); process.exit(1); });
