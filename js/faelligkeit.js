'use strict';

/**
 * Reiter „Fälligkeiten / Wiedervorlage" (Admin)
 * =============================================
 * Zeigt Richtlinien nach dem Termin der nächsten internen Überprüfung
 * (`naechsteReview`) gruppiert: überfällig · fällig in ≤ 30 Tagen · später ·
 * ohne Termin. ISO 27001 A.5.1 verlangt die regelmäßige Überprüfung von
 * Richtlinien – hier wird das operativ sichtbar und mit einem Klick pflegbar.
 * Rein deterministisch aus dem State, keine externen Dienste, keine KI.
 * Der GitHub-Erinnerungs-Cron verschickt zusätzlich einen Fälligkeits-Digest.
 */

const FAELLIG_SOON_DAYS = 30;   // „fällig bald"-Fenster

/** Tage bis zum Review-Termin (negativ = überfällig) oder null, wenn kein Termin. */
function _faelligDays(p) {
  if (!p.naechsteReview) return null;
  const d = new Date(p.naechsteReview);
  if (isNaN(d)) return null;
  const day = 86400000;
  return Math.floor((d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / day);
}

/** Alle relevanten Richtlinien in Kategorien einsortieren. */
function _faelligBuckets() {
  const b = { overdue: [], soon: [], later: [], none: [] };
  for (const p of (typeof berichtsPolicies === 'function' ? berichtsPolicies() : (State.policies || []))) {
    if (p.status === 'Archiviert') continue;
    const d = _faelligDays(p);
    if (d === null) b.none.push({ p, d });
    else if (d < 0) b.overdue.push({ p, d });
    else if (d <= FAELLIG_SOON_DAYS) b.soon.push({ p, d });
    else b.later.push({ p, d });
  }
  const byDate = (a, c) => a.d - c.d;
  b.overdue.sort(byDate); b.soon.sort(byDate); b.later.sort(byDate);
  b.none.sort((a, c) => (a.p.title || '').localeCompare(c.p.title || '', 'de'));
  return b;
}

function _faelligDueLabel(d) {
  if (d === null) return '– kein Termin –';
  if (d < 0)  return `überfällig seit ${-d} Tag${-d === 1 ? '' : 'en'}`;
  if (d === 0) return 'heute fällig';
  return `fällig in ${d} Tag${d === 1 ? '' : 'en'}`;
}

function _faelligCard(entry, accent) {
  const { p, d } = entry;
  const dateTxt = p.naechsteReview ? fmtDate(p.naechsteReview) : '—';
  return `<div class="item-card" style="cursor:default;border-left:4px solid ${accent}">
    <div class="ic-top"><div class="ic-title">${esc(p.title)}</div>
      <div class="ic-topright">${typeof workflowBadge === 'function' ? workflowBadge(p.status) : ''}</div></div>
    <div class="ic-tags">
      ${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}
      <span class="ic-tag">v${esc(p.version)}</span>
      <span class="ic-tag" style="${d !== null && d < 0 ? 'background:#fef2f2;color:#b91c1c' : (d !== null && d <= FAELLIG_SOON_DAYS ? 'background:#fffbeb;color:#b45309' : '')}">🔎 ${esc(dateTxt)} · ${esc(_faelligDueLabel(d))}</span>
      ${p.wiederholungMonate ? `<span class="ic-tag">↻ ${p.wiederholungMonate == 12 ? 'jährlich' : 'alle ' + p.wiederholungMonate + ' Mon.'}</span>` : ''}
    </div>
    <div style="display:flex;gap:7px;margin-top:12px;align-items:center;flex-wrap:wrap">
      <span style="flex:1;min-width:0;font-size:.8rem;color:var(--c-muted)">${p.dokumentName ? '📄 ' + esc(p.dokumentName) : '⚠ kein Dokument'}</span>
      <button class="btn btn-outline btn-sm" onclick="openPolicyEditor(${jsArg(p.id)})">✏ Bearbeiten</button>
      ${(typeof canWriteTab !== 'function' || canWriteTab('faelligkeit')) ? `
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:.8rem;color:var(--c-muted)">heute +
          <input type="number" id="fael-m-${esc(p.id)}" min="1" max="120" value="${p.wiederholungMonate || 12}"
            style="width:58px;border:1px solid #d1d5db;border-radius:6px;padding:4px 6px;font-size:.82rem;font-family:inherit" title="Monate bis zur nächsten Überprüfung"> Mon.</span>
        <button class="btn btn-success btn-sm" onclick="faelligSetReviewMonths(${jsArg(p.id)})" title="Nächste Überprüfung auf heute + eingetragene Monate setzen">🔁 Setzen</button>
        ${p.naechsteReview ? `<button class="btn btn-ghost btn-sm" onclick="faelligClearReview(${jsArg(p.id)})" title="Überprüfungstermin entfernen">✕ Termin entfernen</button>` : ''}` : ''}
    </div>
  </div>`;
}

/* ── Rubriken ──
   Regelwerke, Register, Funktionsprüfung und Prozesse standen untereinander auf
   einer langen Seite; wer die Überprüfung der Prozesse suchte, scrollte an allen
   Regelwerken vorbei. Jede Art hat jetzt ihre Rubrik, „Alles" zeigt sie wie
   bisher zusammen. Die Wahl bleibt im Browser, ?rubrik=prozesse springt direkt hin. */
const FAELLIG_RUBRIKEN = [
  { key: '',           label: 'Alles' },
  { key: 'regelwerke', label: '📘 Regelwerke' },
  { key: 'register',   label: '📋 Maßnahmen, Ziele, Kennzahlen' },
  { key: 'funktion',   label: '🧪 Funktionsprüfung' },
  { key: 'prozesse',   label: '🔀 Prozesse' },
];
const FAELLIG_RUBRIK_SPEICHER = 'rms_faellig_rubrik';
let _faelligRubrik = null;

function _faelligRubrikAktiv() {
  if (_faelligRubrik === null) {
    let r = '';
    try { r = new URLSearchParams(location.search).get('rubrik') || localStorage.getItem(FAELLIG_RUBRIK_SPEICHER) || ''; }
    catch (e) { r = ''; }
    _faelligRubrik = FAELLIG_RUBRIKEN.some(x => x.key === r) ? r : '';
  }
  return _faelligRubrik;
}

function faelligRubrikSetzen(r) {
  _faelligRubrik = FAELLIG_RUBRIKEN.some(x => x.key === r) ? r : '';
  try { localStorage.setItem(FAELLIG_RUBRIK_SPEICHER, _faelligRubrik); } catch (e) { /* gilt dann nur jetzt */ }
  renderFaelligkeit();
}

function renderFaelligkeit() {
  const mount = document.getElementById('faelligkeit-mount');
  if (!mount) return;
  const rubrik = _faelligRubrikAktiv();
  const zeigt = (key) => !rubrik || rubrik === key;
  const b = _faelligBuckets();
  const kpi = (n, label, col) => `<div style="flex:1;min-width:120px;background:var(--c-surface,#fff);border:1px solid var(--c-border);border-radius:10px;padding:12px 14px">
    <div style="font-size:1.6rem;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:.8rem;color:var(--c-muted)">${label}</div></div>`;

  const section = (title, list, accent, emptyTxt) => `
    <div style="font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;margin:20px 2px 8px">${esc(title)} (${list.length})</div>
    ${list.length ? list.map(e => _faelligCard(e, accent)).join('') : (typeof emptyState === 'function' ? emptyState(emptyTxt, '✓') : `<div class="field-hint">${esc(emptyTxt)}</div>`)}`;

  const rubriken = `<div class="fael-rubriken" role="tablist" aria-label="Rubrik">${FAELLIG_RUBRIKEN.map(r => {
    const zahl = r.key === 'regelwerke' && b.overdue.length ? ` <span class="fael-zahl">${b.overdue.length}</span>` : '';
    return `<button type="button" role="tab" aria-selected="${rubrik === r.key}" class="btn btn-sm ${rubrik === r.key ? 'btn-primary' : 'btn-ghost'}"
      onclick="faelligRubrikSetzen(${jsArg(r.key)})">${r.label}${zahl}</button>`;
  }).join('')}</div>`;
  const regelwerke = !zeigt('regelwerke') ? '' : `
    <div class="view-desc" style="margin:0 0 14px">
      Interne Überprüfung (Wiedervorlage) der Richtlinien – Grundlage: Feld „Nächste Überprüfung".
      <b>ISO 27001 A.5.1</b> verlangt die regelmäßige Überprüfung. „+12 Monate" setzt den nächsten Termin sofort.
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px">
      ${kpi(b.overdue.length, 'überfällig', '#b91c1c')}
      ${kpi(b.soon.length, `fällig in ≤ ${FAELLIG_SOON_DAYS} Tagen`, '#b45309')}
      ${kpi(b.later.length, 'später terminiert', '#15803d')}
      ${kpi(b.none.length, 'ohne Termin', '#6b7280')}
    </div>
    ${section('Überfällig', b.overdue, '#ef4444', 'Nichts überfällig.')}
    ${section(`Fällig in ≤ ${FAELLIG_SOON_DAYS} Tagen`, b.soon, '#f59e0b', 'Nichts in den nächsten Wochen fällig.')}
    ${b.none.length ? section('Ohne Überprüfungstermin', b.none, '#9ca3af', '') : ''}
    ${b.later.length ? section('Später terminiert', b.later, '#22c55e', '') : ''}`;
  const abstand = (key) => (rubrik === key ? '0' : '28px');
  mount.innerHTML = `${rubriken}${regelwerke}
    ${zeigt('register') ? `<div id="fael-register" style="margin-top:${abstand('register')}"></div>` : ''}
    ${zeigt('funktion') ? `<div id="fael-funktion" style="margin-top:${abstand('funktion')}"></div>` : ''}
    ${zeigt('prozesse') ? `<div id="fael-prozesse" style="margin-top:${abstand('prozesse')}"></div>` : ''}`;
  if (zeigt('register')) _faelligRegisterZeigen();
  if (zeigt('funktion')) _faelligFunktionZeigen();
  if (zeigt('prozesse')) _faelligProzesseZeigen();
}

/* ── Maßnahmen, Ziele, Kennzahlen: was dort ansteht ──
   Eine überfällige Maßnahme, ein Ziel über dem Termin, eine fällige Messung
   sind dieselbe Art Wiedervorlage wie ein Regelwerk, das überprüft werden muss.
   Gelesen wird leise: Fehlt eine Liste, fehlt nur ihr Teil. */

let _faelligReg = null;   // { mass, ziele, kpi } (Cache bis „Aktualisieren")

async function _faelligRegisterZeigen(neu) {
  const host = document.getElementById('fael-register');
  if (!host || typeof mnAlle !== 'function') return;
  if (!_faelligReg || neu) {
    host.innerHTML = '<div class="doc-loading">Maßnahmen, Ziele und Kennzahlen werden gelesen …</div>';
    const leise = async (fn) => { try { return (typeof fn === 'function') ? await fn() : null; } catch (e) { return null; } };
    const [eigene, ziele, kpi, risiken, wirk] = await Promise.all([
      leise(typeof spGetMassnahmenLeise === 'function' ? spGetMassnahmenLeise : null),
      leise(typeof spGetZieleLeise === 'function' ? spGetZieleLeise : null),
      leise(typeof spGetKennzahlenLeise === 'function' ? spGetKennzahlenLeise : null),
      leise(typeof spGetRisks === 'function' ? spGetRisks : null),
      leise(typeof spGetWirkLeise === 'function' ? spGetWirkLeise : null),
    ]);
    _faelligReg = { eigene: eigene || [], ziele: ziele || [], kpi: kpi || [],
      mass: mnAlle(eigene || [], risiken || [], wirk || []) };
  }
  const ziel = document.getElementById('fael-register');
  if (ziel) ziel.innerHTML = _faelligRegisterHtml(_faelligReg);
}

function _faelligRegisterHtml(r) {
  const datum = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('.');
  const ueber = r.mass.filter(e => mnUeberfaellig(e)).sort((a, b) => String(a.termin).localeCompare(String(b.termin)));
  const ziele = (typeof zlTerminUeberschritten === 'function') ? r.ziele.filter(z => zlTerminUeberschritten(z)) : [];
  const kpi = (typeof kzNaechsteMessung === 'function') ? r.kpi.filter(k => { const n = kzNaechsteMessung(k); return n && n.faellig; }) : [];
  const zeile = (icon, titel, info, ansicht, art, id) => `<div class="item-card" style="cursor:pointer;border-left:4px solid #ef4444;padding:9px 13px"
      onclick="faelligRegisterOeffnen(${jsArg(ansicht)},${jsArg(art)},${jsArg(id)})">
      <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><span>${icon}</span><b>${esc(titel)}</b>
        <span class="field-hint" style="margin-left:auto">${esc(info)}</span></div></div>`;
  const liste = (titel, l, html) => l.length ? `
    <div style="font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;margin:14px 2px 8px">${esc(titel)} (${l.length})</div>
    ${l.slice(0, 12).map(html).join('')}${l.length > 12 ? `<div class="field-hint">und ${l.length - 12} weitere</div>` : ''}` : '';
  const summe = ueber.length + ziele.length + kpi.length;
  return `
    <h3 style="margin:0 0 6px;font-size:1.05rem">Maßnahmen, Ziele und Kennzahlen</h3>
    <div class="view-desc" style="margin:0 0 10px">
      Überfällige Maßnahmen aus allen Registern, Ziele über ihrem Termin (die Bewertung gehört ins Management Review)
      und Kennzahlen, deren Messung fällig ist.
      <button class="btn btn-ghost btn-sm" onclick="_faelligRegisterZeigen(true)" title="Neu lesen">↻ Aktualisieren</button>
    </div>
    ${summe ? '' : '<div class="field-hint">Nichts überfällig.</div>'}
    ${liste('Maßnahmen überfällig', ueber, e => zeile('🛠', e.titel, `fällig seit ${datum(e.termin)}${(e.verantwortlichName || e.team) ? ' · ' + (e.verantwortlichName || e.team) : ''}`,
      e.herkunft === 'risiko' ? 'risiken' : e.herkunft === 'wirksamkeit' ? 'wirksamkeit' : 'massnahmen', e.herkunft, e.bezugId))}
    ${liste('Ziele über dem Termin', ziele, z => zeile('🎯', z.titel, `Termin ${datum(z.termin)}${(z.teams || []).length ? ' · ' + z.teams.map(t => t.wert).join(', ') : ''}`, 'ziele', 'ziel', z.id))}
    ${liste('Messung fällig', kpi, k => zeile('📊', k.name, `${k.turnus || ''}${k.team ? ' · ' + k.team.wert : ''}`, 'kennzahlen', 'kennzahl', k.id))}`;
}

/** Aus den Fälligkeiten zum Eintrag – im Register, in dem er gepflegt wird. */
async function faelligRegisterOeffnen(ansicht, art, id) {
  if (typeof switchView !== 'function') return;
  await switchView(ansicht);
  if (typeof _ansichtZielOeffnen !== 'function') return;
  const p = { risiken: { risiko: id }, wirksamkeit: { eintrag: id }, massnahmen: { massnahme: id }, ziele: { ziel: id }, kennzahlen: { kennzahl: id } }[ansicht];
  if (p) await _ansichtZielOeffnen(ansicht, new URLSearchParams(p));
}

/* ── Funktionsprüfung des RMS nach einem Update (ISO 27001 A.8.29 · A.8.32) ──
   Eine Änderung am System soll geprüft werden, bevor man sich auf sie verlässt.
   Der Selbsttest im Probelauf legt dafür einen Nachweis im Register
   „Wirksamkeit" ab (Satzart Funktionsprüfung, mit der Version im Umfang). Das
   RMS wird oft aktualisiert. Nicht jedes Update braucht einen eigenen Test,
   aber spätestens FP_FRIST_TAGE nach der letzten Prüfung ist der nächste fällig. */

const FP_FRIST_TAGE = 30;

let _faelligWirk = null;   // Wirksamkeits-Register (leise gelesen, Cache bis „Aktualisieren")

/**
 * Steht eine Funktionsprüfung des RMS aus?
 * @param {Array} wirk      Einträge des Registers „Wirksamkeit"
 * @param {string} version  laufende Version (APP_VERSION)
 * @param {string} stand    Tag des Builds (APP_STAND, YYYY-MM-DD)
 * @param {Date} [heute]
 * @returns {{ stufe: 'nie'|'aktuell'|'faellig'|'ueberfaellig'|'fehler', letzte: object|null, version: string, tage: number|null, frist: string }}
 */
function faelligFunktionspruefung(wirk, version, stand, heute) {
  const jetzt = heute ? new Date(heute) : new Date();
  const tag = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const rms = (Array.isArray(wirk) ? wirk : []).filter(w => w && w.art === 'pruefung'
    && /\bRMS\b/.test(String(w.titel || '') + ' ' + String(w.umfang || '')) && w.status !== 'verworfen' && w.datum);
  rms.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  const letzte = rms[0] || null;
  if (!letzte) return { stufe: 'nie', letzte: null, version: '', tage: null, frist: '' };
  const m = /Version (v-[0-9a-f]+)/.exec(String(letzte.umfang || ''));
  const geprueft = m ? m[1] : '';
  const datum = String(letzte.datum).slice(0, 10);
  const fristD = new Date(datum + 'T00:00:00Z'); fristD.setUTCDate(fristD.getUTCDate() + FP_FRIST_TAGE);
  const frist = fristD.toISOString().slice(0, 10);
  const tage = Math.round((fristD.getTime() - tag(jetzt)) / 86400000);
  // Hat die letzte Prüfung Fehler gefunden, ist das die Nachricht, nicht ihr Alter.
  if (letzte.status !== 'abgeschlossen') return { stufe: 'fehler', letzte, version: geprueft, tage, frist };
  const aktuell = geprueft ? geprueft === version : (!!stand && datum >= stand);
  if (aktuell) return { stufe: 'aktuell', letzte, version: geprueft, tage, frist };
  return { stufe: tage < 0 ? 'ueberfaellig' : 'faellig', letzte, version: geprueft, tage, frist };
}

async function _faelligFunktionZeigen(neu) {
  const host = document.getElementById('fael-funktion');
  if (!host) return;
  if (!_faelligWirk || neu) {
    host.innerHTML = '<div class="doc-loading">Funktionsprüfungen werden gelesen …</div>';
    try { _faelligWirk = (typeof spGetWirkLeise === 'function') ? (await spGetWirkLeise()) || [] : []; }
    catch (e) { _faelligWirk = []; }
  }
  const ziel = document.getElementById('fael-funktion');
  if (!ziel) return;
  const version = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '';
  const stand = (typeof APP_STAND !== 'undefined') ? APP_STAND : '';
  ziel.innerHTML = _faelligFunktionHtml(faelligFunktionspruefung(_faelligWirk, version, stand), version, stand);
}

function _faelligFunktionHtml(f, version, stand) {
  const datum = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('.');
  const farbe = { nie: '#ef4444', ueberfaellig: '#ef4444', fehler: '#ef4444', faellig: '#f59e0b', aktuell: '#22c55e' }[f.stufe];
  const l = f.letzte;
  const text = {
    nie: 'Für das RMS ist noch keine Funktionsprüfung abgelegt.',
    fehler: `Die letzte Funktionsprüfung vom ${l ? datum(l.datum) : ''} hat Fehler gefunden und ist nicht abgeschlossen.`,
    aktuell: `Die laufende Version ist geprüft (${l ? datum(l.datum) : ''}). Bis zum nächsten Update ist nichts zu tun.`,
    faellig: `Seit der letzten Funktionsprüfung vom ${l ? datum(l.datum) : ''}${f.version ? ` (${f.version})` : ''} wurde das RMS aktualisiert. Nächste Prüfung bis ${datum(f.frist)}.`,
    ueberfaellig: `Seit der letzten Funktionsprüfung vom ${l ? datum(l.datum) : ''}${f.version ? ` (${f.version})` : ''} wurde das RMS aktualisiert. Die Prüfung war bis ${datum(f.frist)} fällig.`,
  }[f.stufe];
  const darfTest = typeof darfProbelauf === 'function' && darfProbelauf();
  return `
    <h3 style="margin:0 0 6px;font-size:1.05rem">Funktionsprüfung des RMS</h3>
    <div class="view-desc" style="margin:0 0 10px">
      Nach Änderungen am System ein Nachweis, dass es noch tut, was es soll (<b>ISO 27001 A.8.29 · A.8.32</b>).
      Der Selbsttest im Probelauf legt ihn im Register „Wirksamkeit" ab; spätestens ${FP_FRIST_TAGE} Tage nach der letzten Prüfung ist die nächste fällig.
      <button class="btn btn-ghost btn-sm" onclick="_faelligFunktionZeigen(true)" title="Register neu lesen">↻ Aktualisieren</button>
    </div>
    <div class="item-card" style="cursor:default;border-left:4px solid ${farbe}">
      <div class="ic-top"><div class="ic-title">🧪 ${esc(text)}</div></div>
      <div class="ic-tags">
        <span class="ic-tag">laufende Version ${esc(version || '–')}${stand ? ' vom ' + esc(datum(stand)) : ''}</span>
        ${l ? `<span class="ic-tag">zuletzt geprüft: ${esc(datum(l.datum))}${f.version ? ' · ' + esc(f.version) : ''}</span>` : ''}
      </div>
      <div style="display:flex;gap:7px;margin-top:10px;justify-content:flex-end;flex-wrap:wrap">
        ${l ? `<button class="btn btn-ghost btn-sm" onclick="faelligPruefungOeffnen(${jsArg(l.id)})">Letzte Prüfung öffnen</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="faelligPruefungOeffnen('')">Prüfung von Hand erfassen</button>
        ${darfTest && f.stufe !== 'aktuell' ? `<button class="btn btn-primary btn-sm" onclick="switchView('anleitung')" title="Der Selbsttest startet aus dem Probelauf (Anleitung)">🧪 Zum Selbsttest</button>` : ''}
      </div>
    </div>`;
}

/** Aus den Fälligkeiten ins Register „Wirksamkeit": eine Prüfung öffnen oder neu erfassen. */
async function faelligPruefungOeffnen(id) {
  if (typeof switchView === 'function') await switchView('wirksamkeit');
  if (typeof initWirksamkeit === 'function') await initWirksamkeit();
  if (typeof openWirkEditor === 'function') await openWirkEditor(id || null, 'pruefung');
}

/* ── Prozesse: die Überprüfung aus der Konzernfachregelung Prozessmanagement ──
   Die Termine stehen an den Kacheln der Landkarten (prozesslandkarte.json).
   Gelesen wird die Datei direkt – die Landkarte selbst wird dafür nicht
   geladen. Gerechnet wird mit js/prozessmodell.js. */

let _faelligPzDaten = null;   // gelesene Landkarten (Cache bis „Aktualisieren")
let _faelligPzModelle = null; // Modelle mit ihren Angaben aus den .bpmn-Dateien (Cache)

/**
 * Die Modelle samt Angaben. Ein Modell ist ein Prozess, auch ohne Kachel –
 * seine Überprüfung steht in der Datei. Gelesen wird direkt (fünf Dateien
 * nebeneinander), die Prozess-Ansicht wird dafür nicht geladen.
 */
async function _faelligPzModelleLesen(daten) {
  if (typeof spListProcesses !== 'function' || typeof spGetProcessXml !== 'function' || typeof pzPmAusText !== 'function') return [];
  const liste = await spListProcesses();
  const karten = (daten && daten.karten) || {};
  const kachelnVon = (itemId) => {
    const out = [];
    Object.keys(karten).forEach(werk => (karten[werk].kacheln || []).forEach(k => {
      if ((Array.isArray(k.prozesse) ? k.prozesse : []).some(v => v && String(v.id) === String(itemId))) out.push({ werk, kachel: k });
    }));
    return out;
  };
  const modelle = [];
  for (let i = 0; i < liste.length; i += 5) {
    await Promise.all(liste.slice(i, i + 5).map(async p => {
      let pm = null;
      try { pm = pzPmAusText(String(await spGetProcessXml(p.itemId)).split('&amp;').join('&')); } catch (e) { /* ohne Angaben */ }
      modelle.push({ itemId: p.itemId, title: p.title, ordner: p.ordner || '', pm, kacheln: kachelnVon(p.itemId) });
    }));
  }
  return modelle;
}

/** Karten, die man sehen darf – dieselbe Trennung wie in der Landkarte. */
function _faelligPzWerke(daten) {
  const alle = Object.keys((daten && daten.karten) || {});
  if (typeof trennungGreift !== 'function' || !trennungGreift() || typeof meineWerke !== 'function') return alle;
  const meine = meineWerke();
  return alle.filter(w => w === 'KONZERN' || meine.includes(w));
}

async function _faelligProzesseZeigen(neu) {
  const host = document.getElementById('fael-prozesse');
  if (!host || typeof pzFaellige !== 'function') return;
  if (!_faelligPzDaten || neu) {
    host.innerHTML = '<div class="doc-loading">Prozess-Überprüfungen werden gelesen …</div>';
    try {
      const g = (typeof spLoadLandkarte === 'function') ? await spLoadLandkarte() : null;
      _faelligPzDaten = (g && g.daten && g.daten.karten) ? g.daten : { karten: {} };
      try { _faelligPzModelle = await _faelligPzModelleLesen(_faelligPzDaten); } catch (e) { _faelligPzModelle = []; }
    } catch (e) {
      host.innerHTML = `<div class="field-hint">Prozesse konnten nicht gelesen werden: ${esc(e.message)}</div>`;
      return;
    }
  }
  const ziel = document.getElementById('fael-prozesse');
  if (!ziel) return;
  ziel.innerHTML = _faelligProzesseHtml(pzFaellige(_faelligPzDaten, _faelligPzWerke(_faelligPzDaten), undefined, _faelligPzModelle || []));
}

function _faelligProzesseHtml(b) {
  const label = (w) => (w === 'KONZERN' ? 'Konzern / Holding' : w);
  const karte = (e, accent) => {
    const p = e.pruefung;
    const wann = p.stufe === 'fehlt' ? (e.status === 'poc' ? 'POC ohne Termin für die Bewertung' : 'freigegeben, aber ohne Termin')
      : `${p.datum.split('-').reverse().join('.')} · ${_faelligDueLabel(p.tage)}`;
    const eigner = e.eigner.upn ? esc(e.eigner.upn) : '<span style="color:#b45309">kein Prozesseigner</span>';
    return `<div class="item-card" style="cursor:default;border-left:4px solid ${accent}">
      <div class="ic-top"><div class="ic-title">${e.art === 'modell' ? '🔀 ' : ''}${esc(e.kachel.name)}${pzNrText(e.kachel) ? ` <span class="field-hint">${esc(pzNrText(e.kachel))}</span>` : ''}</div>
        <div class="ic-topright"><span class="ic-tag">${esc(pzStatusInfo(e.status).label)}</span></div></div>
      <div class="ic-tags">
        <span class="ic-tag cat">${esc(e.werk ? label(e.werk) : 'ohne Ablage')}</span>
        <span class="ic-tag" style="${p.stufe === 'ueberfaellig' || p.stufe === 'fehlt' ? 'background:#fef2f2;color:#b91c1c' : (p.stufe === 'bald' ? 'background:#fffbeb;color:#b45309' : '')}">🔎 ${esc(wann)}</span>
        <span class="ic-tag">👤 ${eigner}</span>
      </div>
      <div style="display:flex;gap:7px;margin-top:10px;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="${e.art === 'modell' ? `faelligModellOeffnen(${jsArg(e.kachel.id)})` : `faelligProzessOeffnen(${jsArg(e.werk)},${jsArg(e.kachel.id)})`}">Prozess öffnen</button>
      </div>
    </div>`;
  };
  const liste = (titel, l, accent) => l.length ? `
    <div style="font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;margin:16px 2px 8px">${esc(titel)} (${l.length})</div>
    ${l.map(e => karte(e, accent)).join('')}` : '';
  const summe = b.ueberfaellig.length + b.bald.length + b.spaeter.length + b.fehlt.length;
  return `
    <h3 style="margin:0 0 6px;font-size:1.05rem">Prozesse</h3>
    <div class="view-desc" style="margin:0 0 10px">
      Review der Prozesse aus Landkarten und Modellen. Ein <b>POC</b> braucht den Termin seiner Bewertung, freigegebene Prozesse
      werden spätestens alle ${typeof PZ_UEBERPRUEFUNG_MONATE !== 'undefined' ? PZ_UEBERPRUEFUNG_MONATE : 12} Monate durch den
      Prozesseigner überprüft. Ein auslaufender Prozess (<b>EOL</b>) wird nicht mehr überprüft. Der Termin steht am Modell
      (Backlog „✎ Angaben" oder Prozess-Editor) oder an der Kachel (Landkarte, „Bearbeiten").
      <button class="btn btn-ghost btn-sm" onclick="_faelligProzesseZeigen(true)" title="Landkarten neu lesen">↻ Aktualisieren</button>
    </div>
    ${summe ? '' : '<div class="field-hint">Noch kein Prozess mit Review-Termin. Er wird fällig, sobald ein Prozess im POC ist oder freigegeben wird.</div>'}
    ${liste('Überfällig', b.ueberfaellig, '#ef4444')}
    ${liste('Ohne Review-Termin', b.fehlt, '#ef4444')}
    ${liste(`Fällig in ≤ ${FAELLIG_SOON_DAYS} Tagen`, b.bald, '#f59e0b')}
    ${liste('Später terminiert', b.spaeter, '#22c55e')}`;
}

/** Aus den Fälligkeiten ins Modell. */
async function faelligModellOeffnen(itemId) {
  if (typeof switchView === 'function') await switchView('prozesse');
  if (typeof openProcessAnsicht === 'function') await openProcessAnsicht(itemId);
}

/** Aus den Fälligkeiten in die Landkarte, Kachel geöffnet. */
async function faelligProzessOeffnen(werk, id) {
  if (typeof switchView === 'function') await switchView('prozesse');
  if (typeof lkDeepLink === 'function') await lkDeepLink(werk, id);
}

/** Nächste Überprüfung auf heute + N Monate setzen (N aus dem Karten-Eingabefeld). */
async function faelligSetReviewMonths(id) {
  const inp = document.getElementById('fael-m-' + id);
  const months = Math.max(1, Math.min(120, parseInt(inp?.value, 10) || 12));
  const d = new Date(); d.setMonth(d.getMonth() + months);
  await _faelligApplyReview(id, d.toISOString(), `Nächste Überprüfung: ${fmtDate(d.toISOString())} ✓`);
}

/** Überprüfungstermin entfernen (Feld leeren – dokumentiert bewusst „kein Termin"). */
async function faelligClearReview(id) {
  await _faelligApplyReview(id, '', 'Überprüfungstermin entfernt ✓');
}

/** Termin (ISO oder '') gezielt speichern + Ansichten aktualisieren. */
async function _faelligApplyReview(id, iso, okMsg) {
  if (typeof canWriteTab === 'function' && !canWriteTab('faelligkeit')) {
    if (typeof toast === 'function') toast('Nur Lesezugriff auf „Fälligkeiten".', 'error'); return;
  }
  const src = policyZuId(id);
  if (!src) return;
  try {
    await spSetPolicyReview(id, iso);   // eigener PATCH: kann auch leeren
    if (typeof reloadData === 'function') await reloadData();
    else src.naechsteReview = iso;
    renderFaelligkeit();
    if (typeof renderAdminList === 'function') renderAdminList();
    if (typeof toast === 'function') toast(okMsg, 'success');
  } catch (e) {
    if (typeof toast === 'function') toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

/* Node-Export nur für Tests (im Browser wirkungslos). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _faelligDays, _faelligBuckets, _faelligDueLabel, _faelligProzesseHtml, faelligFunktionspruefung, _faelligFunktionHtml, FP_FRIST_TAGE };
}
