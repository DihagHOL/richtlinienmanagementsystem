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
 */

const TENANT = need('AZURE_TENANT_ID');
const CLIENT_ID = need('AZURE_CLIENT_ID');
const CLIENT_SECRET = need('AZURE_CLIENT_SECRET');
const ENV_SENDER = process.env.MAIL_SENDER || '';   // Fallback; bevorzugt wird „mailSender" aus den App-Einstellungen

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SITE_HOST = process.env.SITE_HOST || 'dihag.sharepoint.com:/sites/IT';
const POLICY_LIST = process.env.POLICY_LIST || 'Richtlinien';
const CONFIG_FOLDER = process.env.CONFIG_FOLDER || 'Richtlinienmanagement';
const APP_URL = process.env.APP_URL || 'https://dfedorov12.github.io/richtlinienmanagementsystem/';
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

async function sendMail(toList, subject, html) {
  const recipients = [...new Set(toList.filter(inDomain).map(lc))];
  if (!recipients.length) { console.log(`   ⚠ keine gültigen Empfänger (Domain ${ALLOWED_DOMAIN}) – übersprungen`); return false; }
  if (DRY_RUN) { console.log(`   [DRY_RUN] würde senden an: ${recipients.join(', ')}`); return true; }
  const r = await fetch(`${GRAPH}/users/${encodeURIComponent(SENDER)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: subject.slice(0, 255),
        body: { contentType: 'HTML', content: html },
        toRecipients: recipients.map((a) => ({ emailAddress: { address: a } })),
      },
      saveToSentItems: false,
    }),
  });
  if (!r.ok) { console.log(`   ✗ sendMail (${r.status}): ${(await r.text()).slice(0, 200)}`); return false; }
  console.log(`   ✓ gesendet an: ${recipients.join(', ')}`);
  return true;
}

function mailHtml(title, phase, tage, pending, eskaliert) {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937">
    <p>Guten Tag,</p>
    <p>für die Richtlinie <b>${esc(title)}</b> steht seit <b>${tage} Tagen</b> der Schritt
       <b>${esc(phase)}</b> aus.</p>
    <p>Bitte um Sichtung und ggf. Anmerkung. Noch ausstehend:</p>
    <ul>${pending.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
    ${eskaliert ? `<p style="color:#b45309"><b>Eskalation:</b> Diese Erinnerung geht aufgrund der Verzögerung zusätzlich an den Ersatz-Empfänger.</p>` : ''}
    <p><a href="${esc(APP_URL)}" style="background:#1a56db;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;display:inline-block">Im Richtlinienmanagement öffnen</a></p>
    <p style="color:#6b7280;font-size:12px">Automatische Erinnerung des DIHAG Richtlinienmanagements.</p>
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
  const eskalationMail = cfg.eskalationMail || '';
  console.log(`Absender: ${SENDER} · Prüfer: ${pruefer.length} · GL: ${gl.length} · Taktung: erst nach ${erste}d, dann alle ${alle}d · Eskalation ab ${eskalationAb}d → ${eskalationMail || '–'}`);

  const items = await loadPolicies(siteId, listId);
  console.log(`Richtlinien gesamt: ${items.length}`);

  let sent = 0, checked = 0;
  for (const it of items) {
    const f = it.fields || {};
    const status = f.Status || '';
    const title = f.Title || '(ohne Titel)';
    const ref = f.PruefungSeit || it.lastModifiedDateTime || '';
    const tage = daysSince(ref);

    let phase = '', roleRecipients = [], voted = [];
    if (status === 'Konformitätsprüfung' || status === 'InReview') {
      phase = 'Konformitätsprüfung';
      roleRecipients = pruefer;
      try { voted = (JSON.parse(f.KonformitaetJson || '[]')).map((v) => lc(v.upn)); } catch { voted = []; }
    } else if (status === 'Freigabe' || status === 'Freigabe ausstehend') {
      phase = 'Freigabe';
      roleRecipients = gl;
      try { voted = (JSON.parse(f.FreigabeJson || '[]')).map((v) => lc(v.upn)); } catch { voted = []; }
    } else {
      continue; // nur laufende Workflow-Schritte
    }
    checked++;

    if (!isDue(tage, erste, alle)) { console.log(`• ${title} [${phase}] – ${tage}d, heute keine Erinnerung`); continue; }

    const pending = roleRecipients.filter((u) => !voted.includes(lc(u)));
    if (!pending.length) { console.log(`• ${title} [${phase}] – ${tage}d, alle haben bereits reagiert`); continue; }

    const eskaliert = eskalationAb > 0 && tage >= eskalationAb && !!eskalationMail;
    const to = eskaliert ? [...pending, eskalationMail] : pending;
    console.log(`• ${title} [${phase}] – ${tage}d, ausstehend: ${pending.join(', ')}${eskaliert ? ' (+Eskalation)' : ''}`);
    const ok = await sendMail(to, `Erinnerung: ${phase} – ${title}`, mailHtml(title, phase, tage, pending, eskaliert));
    if (ok) sent++;
  }
  console.log(`Fertig. Laufende Schritte geprüft: ${checked}, Erinnerungen gesendet: ${sent}.`);
})().catch((e) => { console.error('FEHLER:', e.message); process.exit(1); });
