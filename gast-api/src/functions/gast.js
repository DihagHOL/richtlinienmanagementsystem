'use strict';
/**
 * Gast-Dienst des RMS: HTTP-Endpunkte
 * ===================================
 *   GET  /api/kurs            freigegebene Beiträge aus wissen.json  { daten, geaendertAm }
 *   GET  /api/bestaetigungen  eigene Bestätigungen zu freigegebenen Beiträgen  [ack, …]
 *   POST /api/bestaetigung    eigene Bestätigung anlegen oder ändern  { id }
 *
 * authLevel „anonymous“: Die Function prüft das Zugriffstoken des RMS selbst (src/kern.js).
 * CORS stellt die Function App ein (nur https://rms.dihag.de).
 */
const { app } = require('@azure/functions');
const kern = require('../kern');
const { graph, schluessel } = require('../netz');

const e = kern.einstellungen(process.env);
let _spalten = null;

async function anmelden(request) {
  const kopf = request.headers.get('authorization') || '';
  const token = kopf.replace(/^Bearer\s+/i, '');
  return kern.tokenPruefen(token, e, kid => schluessel(e.tenant, kid));
}

function antwort(status, body) {
  return { status, jsonBody: body, headers: { 'Cache-Control': 'no-store' } };
}

/** Gemeinsamer Rahmen: anmelden, ausführen, Fehler ohne Interna melden. */
function endpunkt(arbeit) {
  return async (request, context) => {
    try {
      const nutzer = await anmelden(request);
      return antwort(200, await arbeit(nutzer, request));
    } catch (x) {
      const status = x.status || 500;
      if (status >= 500) context.error('[gast]', x.message);
      else context.log('[gast]', status, x.message);
      return antwort(status, { fehler: status >= 500 ? 'Der Gast-Dienst konnte die Anfrage nicht ausführen.' : x.message });
    }
  };
}

async function spalten() {
  if (_spalten) return _spalten;
  const j = await graph(`/sites/${e.siteId}/lists/${e.ackListId}/columns?$select=name`);
  _spalten = (j.value || []).map(c => c.name);
  return _spalten;
}

async function eigeneEintraege(nutzer) {
  const filter = encodeURIComponent(`fields/BenutzerUPN eq '${kern.odata(nutzer.upn)}'`);
  const j = await graph(`/sites/${e.siteId}/lists/${e.ackListId}/items?$expand=fields&$top=200&$filter=${filter}`,
    { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
  return (j.value || []).filter(i => kern.freigegebeneKennung(i.fields && i.fields.RichtlinieId, e)
    && String((i.fields && i.fields.BenutzerUPN) || '').toLowerCase() === nutzer.upn);
}

app.http('kurs', {
  methods: ['GET'], authLevel: 'anonymous', route: 'kurs',
  handler: endpunkt(async () => {
    // Über die Kennung der Datei, sonst über den Pfad in der Bibliothek
    const pfad = e.wissenItemId ? `/drives/${e.driveId}/items/${e.wissenItemId}`
      : `/drives/${e.driveId}/root:/${e.wissenPfad.split('/').map(encodeURIComponent).join('/')}`;
    const meta = await graph(`${pfad}?$select=lastModifiedDateTime`);
    const r = await graph(e.wissenItemId ? `${pfad}/content` : `${pfad}:/content`, { roh: true });
    if (!r.ok) throw Object.assign(new Error(`wissen.json ${r.status}`), { status: 502 });
    return { daten: kern.kursFiltern(await r.json(), e), geaendertAm: meta.lastModifiedDateTime || '' };
  }),
});

app.http('bestaetigungen', {
  methods: ['GET'], authLevel: 'anonymous', route: 'bestaetigungen',
  handler: endpunkt(async nutzer => (await eigeneEintraege(nutzer)).map(kern.ackAusEintrag)),
});

app.http('bestaetigung', {
  methods: ['POST'], authLevel: 'anonymous', route: 'bestaetigung',
  handler: endpunkt(async (nutzer, request) => {
    let a;
    try { a = await request.json(); } catch (x) { throw Object.assign(new Error('Ungültige Anfrage.'), { status: 400 }); }
    const { felder, rid, version } = kern.ackFelder(a || {}, nutzer, e, await spalten());
    // Vorhandenen Eintrag nur ändern, wenn er dieser Person und diesem Beitrag gehört
    let ziel = null;
    if (a.id) {
      const item = await graph(`/sites/${e.siteId}/lists/${e.ackListId}/items/${encodeURIComponent(a.id)}?$expand=fields`);
      if (!kern.eintragGehoert(item, nutzer, rid)) throw Object.assign(new Error('Dieser Eintrag gehört nicht zu Ihnen.'), { status: 403 });
      ziel = item.id;
    } else {
      const da = (await eigeneEintraege(nutzer)).find(i => i.fields.RichtlinieId === rid && String(i.fields.RichtlinienVersion || '') === version);
      if (da) ziel = da.id;
    }
    if (ziel) {
      await graph(`/sites/${e.siteId}/lists/${e.ackListId}/items/${ziel}/fields`, { method: 'PATCH', body: felder });
      return { id: String(ziel) };
    }
    const neu = await graph(`/sites/${e.siteId}/lists/${e.ackListId}/items`, { method: 'POST', body: { fields: felder } });
    return { id: String(neu.id) };
  }),
});
