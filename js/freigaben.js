/**
 * Reiter „Freigaben" – Konformitätsprüfung, Mitbestimmung, Freigabe
 * =================================================================
 * Der Genehmigungs-Workflow eines Regelwerks: Prüfer bewerten die Konformität,
 * bei Bedarf entscheidet die Mitbestimmung (KBR/Betriebsräte), zuletzt gibt die
 * Geschäftsleitung frei. Dazu die Workflow-Mails (inkl. Entscheidungs-Buttons),
 * der Schutz vor gleichzeitigem Bearbeiten und Statuswechsel wie Archivieren.
 *
 * Ausgegliedert aus admin.js, um die Datei überschaubar zu halten. Läuft im
 * gemeinsamen globalen Scope – Reihenfolge in index.html: nach admin.js.
 */


/**
 * Gleichzeitigkeits-Schutz: Hat jemand anderes das Regelwerk geändert, seit es
 * hier geöffnet wurde? Wenn ja, fragt die Funktion nach (Überschreiben oder
 * Abbrechen und neu laden). @returns true = weitermachen, false = abbrechen
 */
async function pruefeFremdaenderung(p, aktion) {
  if (!p || !p.id || typeof spGetPolicyMeta !== 'function') return true;
  const meta = await spGetPolicyMeta(p.id);
  if (!meta || !meta.modifiedAt || !p.modifiedAt) return true;      // unbekannt → nicht blockieren
  if (meta.modifiedAt === p.modifiedAt) return true;                 // unverändert → alles gut
  const wer = meta.modifiedBy ? ` von ${meta.modifiedBy}` : '';
  const wann = (typeof fmtDateTime === 'function') ? fmtDateTime(meta.modifiedAt) : meta.modifiedAt;
  const weiter = await uiConfirm(
    `Dieses Regelwerk wurde zwischenzeitlich${wer} geändert (${wann}). ` +
    `Wenn Sie jetzt ${aktion || 'speichern'}, überschreiben Sie diese Änderungen. ` +
    `Empfehlung: abbrechen, neu laden und die Änderungen ansehen.`,
    { title: 'Zwischenzeitlich geändert', okLabel: 'Trotzdem überschreiben', cancelLabel: 'Abbrechen', danger: true });
  if (!weiter) {
    closeModal();
    if (typeof refreshAll === 'function') refreshAll();
    else if (typeof reloadData === 'function') reloadData().then(() => renderAdminList());
    toast('Abgebrochen – die aktuelle Fassung wurde geladen.');
  }
  return weiter;
}

/* ═══════════════════════════════════════════════════
   Änderungshistorie (Audit-Trail je Regelwerk)
   Jede Änderung wird mit Zeitpunkt, Person und Beschreibung festgehalten –
   Nachweis für ISO 27001 / NIS2 („wer hat wann was geändert/entschieden").
═══════════════════════════════════════════════════ */

let _freigabenScope = null;   // 'meine' | 'alle' (null → automatisch je nach Zuständigkeit)
let _fgSecOpen = { pruef: true, mb: true, frei: true };   // ausklappbare Abschnitte im Freigaben-Reiter

function renderFreigaben() {
  const list = document.getElementById('list-freigaben');
  if (!list) return;
  const admin = isCurrentUserAdmin();
  const inPruefung = State.policies.filter(p => p.status === 'Konformitätsprüfung' || p.status === 'InReview');
  const inMitbestimmung = State.policies.filter(p => p.status === 'Mitbestimmung');
  const inFreigabe = State.policies.filter(p => p.status === 'Freigabe');
  // Prüfer-Sicht: global ODER für mindestens eine laufende Richtlinie individuell hinterlegt.
  const istPruefer = admin || (typeof isCurrentUserPruefer === 'function' && isCurrentUserPruefer())
    || (typeof isCurrentUserPrueferForPolicy === 'function' && inPruefung.some(p => isCurrentUserPrueferForPolicy(p)));
  // GL-Sicht: global ODER für mindestens eine wartende Richtlinie individuell hinterlegt.
  const istGL = admin || (typeof isCurrentUserGeschaeftsleitung === 'function' && isCurrentUserGeschaeftsleitung())
    || (typeof isCurrentUserGeschaeftsleitungForPolicy === 'function' && inFreigabe.some(p => isCurrentUserGeschaeftsleitungForPolicy(p)));

  const prozess = `<div class="card" style="margin-bottom:14px"><div class="card-body" style="font-size:.85rem;line-height:1.6;color:#374151">
    <b>So läuft die Freigabe:</b> Entwurf → <b>1. Konformitätsprüfung</b> durch ${esc(getPruefer().join(', ') || '– keine Prüfer hinterlegt –')}
    (konform, wenn ${getKonformSchwelle() === 'alle' ? '<b>alle</b> zustimmen' : '<b>eine Person</b> zustimmt'}) → <b>1.5 Mitbestimmung</b> (Betriebsrat, nur wenn im Editor als betroffen markiert)
    → <b>2. Freigabe</b> durch die Geschäftsleitung
    ${esc(getGeschaeftsleitung().join(', ') || '– keine GL hinterlegt –')} (${getFreigabeSchwelle() === 'alle' ? '<b>alle</b>' : '<b>eine Person</b>'}) → <b>Veröffentlicht</b>.
    Bei „nicht konform" bleibt die Richtlinie in Prüfung. <i>Einzelne Richtlinien können im Editor eigene Prüfer bzw. Freigeber (und Schwellen) haben – dann gelten für sie ausschließlich diese.</i> Erinnerungen &amp; Eskalation laufen automatisch.
  </div></div>`;
  // Ausklappbarer Abschnitt (Kopf klickbar).
  const secBlock = (key, title, count, body) => {
    const open = _fgSecOpen[key] !== false;
    return `<div style="margin:14px 0 4px">
      <div onclick="fgToggleSection('${key}')" style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:.8rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:.04em;padding:6px 2px">
        <span style="width:1em">${open ? '▾' : '▸'}</span><span>${title} (${count})</span>
      </div>
      <div id="fg-sec-${key}" style="${open ? '' : 'display:none'}">${body}</div>
    </div>`;
  };

  // Mitbestimmung dokumentieren dürfen die Workflow-Beteiligten – und der
  // Betriebsrat selbst, erkannt an seiner Adresse bzw. Gruppenmitgliedschaft.
  const darfMb = (p) => (typeof darfMitbestimmung === 'function') ? darfMitbestimmung(p) : (istPruefer || istGL);
  const kannBR = istPruefer || istGL || inMitbestimmung.some(darfMb);

  // „Eigene" = für die jeweilige Richtlinie bin ich der zuständige Prüfer bzw. Freigeber.
  const isMinePruef = p => typeof isCurrentUserPrueferForPolicy === 'function' && isCurrentUserPrueferForPolicy(p);
  const isMineFrei  = p => typeof isCurrentUserGeschaeftsleitungForPolicy === 'function' && isCurrentUserGeschaeftsleitungForPolicy(p);
  const meinePruef = inPruefung.filter(isMinePruef);
  const meineFrei  = inFreigabe.filter(isMineFrei);
  const meineMb    = inMitbestimmung.filter(p => isMinePruef(p) || isMineFrei(p));
  const meineCount = meinePruef.length + meineMb.length + meineFrei.length;
  const alleCount  = inPruefung.length + inMitbestimmung.length + inFreigabe.length;
  // Standard: „mir zugewiesen", sobald es etwas für mich gibt – sonst „alle".
  if (_freigabenScope !== 'meine' && _freigabenScope !== 'alle') _freigabenScope = meineCount ? 'meine' : 'alle';
  const scope = _freigabenScope;
  const eigen = scope === 'meine';
  const pruefList = eigen ? meinePruef : inPruefung;
  const mbList    = eigen ? meineMb    : inMitbestimmung;
  const freiList  = eigen ? meineFrei  : inFreigabe;

  const toggle = (istPruefer || istGL) ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
    <button class="btn btn-sm ${eigen ? 'btn-primary' : 'btn-outline'}" onclick="setFreigabenScope('meine')" title="Nur Vorgänge, für die Sie zuständig sind">👤 Mir zugewiesen (${meineCount})</button>
    <button class="btn btn-sm ${!eigen ? 'btn-primary' : 'btn-outline'}" onclick="setFreigabenScope('alle')" title="Alle laufenden Vorgänge (Gesamtübersicht)">🗂 Alle Vorgänge (${alleCount})</button>
  </div>` : '';

  const leer = (was) => emptyState(eigen ? `Aktuell ist Ihnen nichts ${was} zugewiesen.` : `Aktuell nichts ${was}.`, '✓');

  let html = prozess + toggle;
  if (istPruefer) {
    html += secBlock('pruef', '1 · Konformitätsprüfung', pruefList.length,
      pruefList.length ? pruefList.map(p => pruefCardHtml(p)).join('') : leer('zur Prüfung'));
  }
  if (kannBR) {
    html += secBlock('mb', '1.5 · Mitbestimmung (Betriebsverfassung)', mbList.length,
      mbList.length ? mbList.map(p => mitbestimmungCardHtml(p, darfMb(p))).join('') : leer('in der Mitbestimmung'));
  }
  if (istGL) {
    html += secBlock('frei', '2 · Freigabe (Geschäftsleitung)', freiList.length,
      freiList.length ? freiList.map(p => freigabeCardHtml(p)).join('') : leer('zur Freigabe'));
  }
  if (!istPruefer && !istGL) html += `<div class="col-warning" style="display:block">Sie sind weder als Prüfer noch als Geschäftsleitung hinterlegt (Einstellungen).</div>`;
  list.innerHTML = html;
}

/** Abschnitt im Freigaben-Reiter ein-/ausklappen. */
function fgToggleSection(key) {
  _fgSecOpen[key] = _fgSecOpen[key] === false ? true : false;
  const body = document.getElementById('fg-sec-' + key);
  if (body) body.style.display = _fgSecOpen[key] ? '' : 'none';
  const caret = body && body.previousElementSibling && body.previousElementSibling.querySelector('span');
  if (caret) caret.textContent = _fgSecOpen[key] ? '▾' : '▸';
}

/** Abschnitt gezielt aufklappen (ohne Umschalten) – für Deep-Links und die Führung. */
function fgOpenSection(key) {
  if (_fgSecOpen[key] === false) fgToggleSection(key);
}

/** Umschalten zwischen „mir zugewiesen" und „alle Vorgänge" im Freigaben-Reiter. */
function setFreigabenScope(s) {
  _freigabenScope = (s === 'alle') ? 'alle' : 'meine';
  renderFreigaben();
}

/** Aus dem Mail-Deeplink: zur Karte der Richtlinie scrollen und kurz hervorheben. */
function focusPolicyCard(id) {
  let el = document.getElementById('fg-' + id);
  // Steht der Vorgang unter „Alle Vorgänge" statt „Mir zugewiesen"? Dann dorthin
  // wechseln, statt zu behaupten, es gäbe ihn nicht.
  if (!el && _freigabenScope !== 'alle') {
    setFreigabenScope('alle');
    el = document.getElementById('fg-' + id);
  }
  if (!el) { toast('Dieses Regelwerk ist gerade nicht in Ihrer Freigabe-Liste (evtl. schon bearbeitet oder veröffentlicht).'); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('fg-highlight');
  setTimeout(() => el.classList.remove('fg-highlight'), 4500);
}

/**
 * Aus dem Mail-Button (?aktion=…): Der Klick ist die Entscheidung – ohne zweite
 * Nachfrage. Geprüft wird die Rolle; was Pflicht ist (die Begründung bei „nicht
 * konform"), wird weiterhin abgefragt.
 */
function handleMailAction(id, aktion) {
  const p = policyZuId(id);
  if (!p) { toast('Richtlinie nicht gefunden (evtl. schon bearbeitet).'); return; }
  setTimeout(async () => {
    if (aktion === 'konform') {
      if (typeof isCurrentUserPrueferForPolicy === 'function' && !isCurrentUserPrueferForPolicy(p)) { toast('Nur die für diese Richtlinie hinterlegten Prüfer dürfen die Konformität bewerten.'); return; }
      markKonform(id, true);
    } else if (aktion === 'nicht_konform') {
      if (typeof isCurrentUserPrueferForPolicy === 'function' && !isCurrentUserPrueferForPolicy(p)) { toast('Nur die für diese Richtlinie hinterlegten Prüfer dürfen die Konformität bewerten.'); return; }
      markKonform(id, false);   // fragt anschließend nach der Anmerkung
    } else if (aktion === 'freigeben') {
      if (typeof isCurrentUserGeschaeftsleitungForPolicy === 'function' && !isCurrentUserGeschaeftsleitungForPolicy(p)) { toast('Nur die für diese Richtlinie hinterlegte Geschäftsleitung darf freigeben.'); return; }
      markFreigabe(id);
    } else if (aktion === 'zurueck') {
      markKonform(id, false);
    }
  }, 600);
}

function _votesHtml(p) {
  // Konformitätsprüfung + Freigabe – beide mit (optionaler) Anmerkung anzeigen
  // „in Vertretung für …" gehört sichtbar dazu, sonst wirkt die Freigabe unbefugt
  const iV = (v) => v && v.fuer ? ` <span style="color:var(--c-muted)">(in Vertretung für ${esc(v.fuer)})</span>` : '';
  const k = (p.konformitaet || []).map(v =>
    `<div style="padding:2px 0"><b>${esc(v.name || v.upn)}${iV(v)}:</b> ${v.entscheidung === 'konform'
      ? '<span style="color:#15803d">konform ✓</span>'
      : '<span style="color:#b91c1c">nicht konform</span>'}${v.anmerkung ? ' – ' + esc(v.anmerkung) : ''}</div>`);
  const f = (p.freigaben || []).map(v =>
    `<div style="padding:2px 0"><b>${esc(v.name || v.upn)}${iV(v)}:</b> <span style="color:#15803d">freigegeben ✓</span>${v.anmerkung ? ' – ' + esc(v.anmerkung) : ''}</div>`);
  const all = [...k, ...f];
  if (!all.length) return '';
  return `<div style="margin-top:8px;font-size:.8rem;border-top:1px solid var(--c-border-2);padding-top:8px">${all.join('')}</div>`;
}

/* Kommentar-/Anmerkungsfeld in einer Prüf-/Freigabe-Karte (RMS-Inline-Styling). */
function kommentarFeldHtml(id, placeholder) {
  return `<textarea id="fg-kom-${esc(id)}" rows="2" placeholder="${esc(placeholder)}"
    oninput="this.style.borderColor=''"
    style="width:100%;margin-top:10px;border:1px solid #d1d5db;border-radius:7px;padding:7px 10px;font-size:.85rem;font-family:inherit;resize:vertical;outline:none"></textarea>`;
}

function pruefCardHtml(p) {
  const mein = (p.konformitaet || []).find(v => (v.upn || '').toLowerCase() === State.user.upn.toLowerCase());
  const kannPruefen = typeof isCurrentUserPrueferForPolicy === 'function' && isCurrentUserPrueferForPolicy(p);
  return `<div class="item-card" id="fg-${esc(p.id)}" style="cursor:default">
    <div class="ic-top"><div class="ic-title">${esc(p.title)}</div><div class="ic-topright">${workflowBadge(p.status)}</div></div>
    ${p.beschreibung ? `<div class="ic-desc">${esc(p.beschreibung)}</div>` : ''}
    <div class="ic-tags">${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}<span class="ic-tag">v${esc(p.version)}</span></div>
    ${_votesHtml(p)}
    ${kannPruefen ? kommentarFeldHtml(p.id, 'Anmerkung – Pflicht bei „nicht konform", bei „konform" optional …') : ''}
    <div style="display:flex;gap:7px;margin-top:12px;align-items:center;flex-wrap:wrap">
      ${_policyOpenButtons(p)}
      <div style="flex:1"></div>
      ${kannPruefen ? `
        <button class="btn btn-ghost btn-sm" onclick="markKonform('${p.id}',false)">Nicht konform</button>
        <button class="btn btn-success btn-sm" onclick="markKonform('${p.id}',true)">${mein && mein.entscheidung === 'konform' ? '✓ konform (Sie)' : 'Konform'}</button>` : ''}
    </div>
  </div>`;
}

function mitbestimmungCardHtml(p, kannHandeln) {
  const werke = Array.isArray(p.mitbestimmungWerke) ? p.mitbestimmungWerke : [];
  const betroffen = [p.kbrBetroffen ? 'KBR' : null, ...werke].filter(Boolean).join(', ');
  const ziel = [p.kbrBetroffen ? 'den Konzernbetriebsrat' : null,
    werke.length ? 'die Betriebsräte (' + esc(werke.join(', ')) + ')' : null].filter(Boolean).join(' und ');
  return `<div class="item-card" id="fg-${esc(p.id)}" style="cursor:default">
    <div class="ic-top"><div class="ic-title">${esc(p.title)}</div><div class="ic-topright">${workflowBadge(p.status)}</div></div>
    ${p.beschreibung ? `<div class="ic-desc">${esc(p.beschreibung)}</div>` : ''}
    <div class="ic-tags">${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}<span class="ic-tag">v${esc(p.version)}</span>
      <span class="ic-tag" style="background:#eef2ff;color:#3730a3">🏛️ Betroffen: ${esc(betroffen || '–')}</span></div>
    ${_votesHtml(p)}
    <div class="field-hint" style="margin-top:8px">Das Regelwerk ist konform und wurde zur Mitbestimmungsprüfung an ${ziel || 'die Mitbestimmung'} gesendet. Nach Beteiligung des Betriebsrats hier entscheiden: <b>Konform</b> (weiter) oder <b>Nicht konform</b> (mit Begründung, zurück in die Prüfung).</div>
    ${kannHandeln ? kommentarFeldHtml(p.id, 'Anmerkung – Pflicht bei „nicht konform", bei „konform" optional (z. B. „BR SHB zugestimmt am …") …') : ''}
    <div style="display:flex;gap:7px;margin-top:12px;align-items:center;flex-wrap:wrap">
      ${_policyOpenButtons(p)}
      <div style="flex:1"></div>
      ${kannHandeln ? `
        <button class="btn btn-outline btn-sm" onclick="resendMitbestimmung('${p.id}')" title="Mitbestimmungs-Mail an KBR/BR erneut senden">✉ Erneut an BR senden</button>
        <button class="btn btn-ghost btn-sm" onclick="markMitbestimmung('${p.id}',false)">Nicht konform</button>
        <button class="btn btn-success btn-sm" onclick="markMitbestimmung('${p.id}',true)">Konform</button>` : ''}
    </div>
  </div>`;
}

function freigabeCardHtml(p) {
  const mein = (p.freigaben || []).find(v => (v.upn || '').toLowerCase() === State.user.upn.toLowerCase());
  const kannFreigeben = typeof isCurrentUserGeschaeftsleitungForPolicy === 'function' && isCurrentUserGeschaeftsleitungForPolicy(p);
  return `<div class="item-card" id="fg-${esc(p.id)}" style="cursor:default">
    <div class="ic-top"><div class="ic-title">${esc(p.title)}</div><div class="ic-topright">${workflowBadge(p.status)}</div></div>
    ${p.beschreibung ? `<div class="ic-desc">${esc(p.beschreibung)}</div>` : ''}
    <div class="ic-tags">${p.kategorie ? `<span class="ic-tag cat">${esc(p.kategorie)}</span>` : ''}<span class="ic-tag">v${esc(p.version)}</span></div>
    ${_votesHtml(p)}
    ${kommentarFeldHtml(p.id, 'Anmerkung – Pflicht bei „zurück", bei „freigeben" optional …')}
    <div style="display:flex;gap:7px;margin-top:12px;align-items:center;flex-wrap:wrap">
      ${_policyOpenButtons(p)}
      <div style="flex:1"></div>
      <button class="btn btn-ghost btn-sm" onclick="markKonform('${p.id}',false)">Zurück (nicht konform)</button>
      ${kannFreigeben ? `<button class="btn btn-success btn-sm" onclick="markFreigabe('${p.id}')">${mein ? '✓ freigegeben (Sie)' : '✓ Freigeben'}</button>` : ''}
    </div>
  </div>`;
}

function konformErreicht(p) {
  const pruefer = (typeof getPolicyPruefer === 'function') ? getPolicyPruefer(p) : getPruefer();
  if (!pruefer.length) return false;
  const schwelle = (typeof getPolicyKonformSchwelle === 'function') ? getPolicyKonformSchwelle(p) : getKonformSchwelle();
  const ja = (p.konformitaet || []).filter(v => v.entscheidung === 'konform').map(v => (v.upn || '').toLowerCase());
  return schwelle === 'einer' ? ja.length >= 1 : pruefer.every(u => ja.includes(u.toLowerCase()));
}
function freigabeErreicht(p) {
  const gl = (typeof getPolicyGeschaeftsleitung === 'function') ? getPolicyGeschaeftsleitung(p) : getGeschaeftsleitung();
  if (!gl.length) return false;
  const schwelle = (typeof getPolicyFreigabeSchwelle === 'function') ? getPolicyFreigabeSchwelle(p) : getFreigabeSchwelle();
  const ja = (p.freigaben || []).map(v => (v.upn || '').toLowerCase());
  return schwelle === 'alle' ? gl.every(u => ja.includes(u.toLowerCase())) : ja.length >= 1;
}

/** Ist die Mitbestimmung betroffen (KBR oder mind. ein Werks-BR gewählt)? */
function mitbestimmungPflicht(p) {
  return !!(p && (p.kbrBetroffen || (Array.isArray(p.mitbestimmungWerke) && p.mitbestimmungWerke.length)));
}
/** Wurde die Mitbestimmung (Betriebsrat) bereits dokumentiert bestätigt? */
function mitbestimmungBestaetigt(p) {
  return !!(p && p.mitbestimmung && p.mitbestimmung.bestaetigt);
}

async function markKonform(policyId, konform) {
  const src = policyZuId(policyId);
  if (!src) return;
  const p = JSON.parse(JSON.stringify(src));   // Arbeitskopie, damit State unberührt bleibt
  // Anmerkung aus dem Karten-Textfeld (Fallback prompt, falls Karte nicht im DOM, z. B. Mail-Aktion)
  const field = document.getElementById('fg-kom-' + policyId);
  let anmerkung = (field ? field.value : '').trim();
  if (!konform && !anmerkung) {
    if (field) {
      toast('Bitte eine Begründung eingeben – „nicht konform" muss begründet werden.', 'error');
      field.style.borderColor = '#ef4444'; field.focus();
      return;
    }
    const res = await uiPrompt('Warum ist das Regelwerk nicht konform? (Pflicht)', { title: 'Nicht konform', okLabel: 'Als nicht konform melden', danger: true });
    if (res === null) return;
    anmerkung = res.trim();
    if (!anmerkung) { toast('Ohne Begründung nicht möglich.', 'error'); return; }
  }
  p.konformitaet = (p.konformitaet || []).filter(v => (v.upn || '').toLowerCase() !== State.user.upn.toLowerCase());
  const _fuerPruef = (typeof vertretungFuerAus === 'function')
    ? vertretungFuerAus(getPolicyPruefer(p), State.user.upn) : '';
  p.konformitaet.push({
    upn: State.user.upn, name: State.user.name,
    entscheidung: konform ? 'konform' : 'nicht_konform',
    anmerkung: anmerkung || '', datum: new Date().toISOString(),
    ...(_fuerPruef ? { fuer: _fuerPruef } : {}),   // als Vertretung entschieden
  });
  let toGL = false, toBR = false;
  if (!konform) p.status = 'Konformitätsprüfung';
  else if (konformErreicht(p)) {
    // Ist die Mitbestimmung betroffen und noch nicht bestätigt → erst zum Betriebsrat,
    // sonst direkt zur GL-Freigabe.
    if (mitbestimmungPflicht(p) && !mitbestimmungBestaetigt(p)) {
      p.status = 'Mitbestimmung'; toBR = true;
      // Auch der Betriebsrat entscheidet aus der Mail – eigene Runde, eigenes Token.
      p.aktionToken = neuerAktionToken('mitbestimmung');
    }
    else { p.status = 'Freigabe'; toGL = true; p.aktionToken = neuerAktionToken('freigabe'); }
  }
  if (!await pruefeFremdaenderung(p, 'die Prüfung abschließt')) return;
  historieAdd(p, konform ? 'Konformitätsprüfung: konform' : 'Konformitätsprüfung: nicht konform',
    (anmerkung ? 'Anmerkung: ' + anmerkung : '') +
    (toBR ? (anmerkung ? '\n' : '') + 'Weiter an die Mitbestimmung (Betriebsrat).'
     : toGL ? (anmerkung ? '\n' : '') + 'Weiter an die Freigabe (Geschäftsleitung).' : '')
    + ekKanalHinweis());
  try {
    await spSavePolicy(p);
    await reloadData();
    renderFreigaben();
    toast(konform
      ? (toBR ? 'Konform – geht jetzt zur Mitbestimmung (Betriebsrat) ✓'
         : toGL ? 'Konform – geht jetzt zur Freigabe ✓' : 'Als konform markiert ✓')
      : 'Als „nicht konform" vermerkt.', 'success');
    if (toBR && typeof notifyMitbestimmung === 'function') notifyMitbestimmung(p);   // KBR/BR benachrichtigen
    if (toGL) notifyGL(p);
    if (toGL || toBR) _ismsWriteback(p, 'konform');   // Konformität ans Ursprungs-ISMS-Dokument zurückschreiben
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/** Status der Richtlinie an das Ursprungs-ISMS-Dokument zurückschreiben (best effort). */
async function _ismsWriteback(p, kind) {
  if (!p.dokumentDriveId || !p.dokumentItemId || typeof spIsmsWritebackStatus !== 'function') return;
  try {
    const ok = await spIsmsWritebackStatus(p.dokumentDriveId, p.dokumentItemId, kind,
      { upn: State.user.upn, name: State.user.name });
    if (ok) {
      toast(kind === 'freigabe' ? 'ISMS-Dokument: Freigabe vermerkt ✓' : 'ISMS-Dokument: Konformität vermerkt ✓', 'success');
      if (typeof invalidateIsmsCache === 'function') invalidateIsmsCache();   // ISMS-Reiter zeigt den neuen Stand frisch
    }
  } catch (e) { console.warn('[wf] ISMS-Rückschreiben (' + kind + ') fehlgeschlagen:', e.message); }
}

/** Mitbestimmung (Betriebsverfassung) entscheiden – wie die Konformitätsprüfung:
 *  konform → weiter zur GL-Freigabe; nicht konform (mit Pflicht-Begründung) → zurück in die Prüfung. */
async function markMitbestimmung(policyId, konform) {
  const src = policyZuId(policyId);
  if (!src) return;
  const p = JSON.parse(JSON.stringify(src));   // Arbeitskopie, damit State unberührt bleibt
  const field = document.getElementById('fg-kom-' + policyId);
  let anmerkung = (field ? field.value : '').trim();
  if (!konform && !anmerkung) {
    if (field) {
      toast('Bitte eine Begründung eingeben – „nicht konform" muss begründet werden.', 'error');
      field.style.borderColor = '#ef4444'; field.focus();
      return;
    }
    const res = await uiPrompt('Warum lehnt die Mitbestimmung ab? (Pflicht)', { title: 'Mitbestimmung: nicht konform', okLabel: 'Als nicht konform melden', danger: true });
    if (res === null) return;
    anmerkung = res.trim();
    if (!anmerkung) { toast('Ohne Begründung nicht möglich.', 'error'); return; }
  }
  p.mitbestimmung = {
    bestaetigt: !!konform, konform: !!konform,
    upn: State.user.upn, name: State.user.name,
    datum: new Date().toISOString(), anmerkung,
  };
  p.status = konform ? 'Freigabe' : 'Konformitätsprüfung';   // konform → GL-Freigabe; sonst zurück
  // Auch nach der Mitbestimmung beginnt für die GL eine neue Runde – neues Token.
  if (konform) p.aktionToken = neuerAktionToken('freigabe');
  if (!await pruefeFremdaenderung(p, 'die Mitbestimmung abschließt')) return;
  historieAdd(p, konform ? 'Mitbestimmung: konform' : 'Mitbestimmung: nicht konform',
    (anmerkung ? 'Begründung: ' + anmerkung + '\n' : '') +
    (konform ? 'Weiter an die Freigabe (Geschäftsleitung).' : 'Zurück in die Konformitätsprüfung.')
    + ekKanalHinweis());
  try {
    await spSavePolicy(p);
    await reloadData();
    renderFreigaben();
    toast(konform ? 'Mitbestimmung konform – geht jetzt zur Freigabe ✓' : 'Mitbestimmung: nicht konform – zurück in die Prüfung.', konform ? 'success' : 'error');
    if (konform) notifyGL(p);
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/** Mitbestimmungs-Mail (KBR/BR) für eine Richtlinie erneut senden. */
function resendMitbestimmung(policyId) {
  const p = policyZuId(policyId);
  if (p && typeof notifyMitbestimmung === 'function') notifyMitbestimmung(p);
}

async function markFreigabe(policyId) {
  const src = policyZuId(policyId);
  if (!src) return;
  const p = JSON.parse(JSON.stringify(src));   // Arbeitskopie, damit State unberührt bleibt
  const field = document.getElementById('fg-kom-' + policyId);
  const anmerkung = (field ? field.value : '').trim();   // bei Freigabe optional
  p.freigaben = (p.freigaben || []).filter(v => (v.upn || '').toLowerCase() !== State.user.upn.toLowerCase());
  p.freigaben.push({
    upn: State.user.upn, name: State.user.name, anmerkung, datum: new Date().toISOString(),
    // Handelt jemand als Vertretung, gehört das ins Protokoll – sonst steht dort
    // später eine Freigabe von einer Person, die gar nicht freigabeberechtigt ist.
    ...(typeof vertretungFuerAus === 'function'
      ? (() => { const f = vertretungFuerAus(getPolicyGeschaeftsleitung(p), State.user.upn); return f ? { fuer: f } : {}; })()
      : {}),
  });
  let published = false;
  if (freigabeErreicht(p)) {
    p.status = 'Veröffentlicht';
    p.veroeffentlichtAm = new Date().toISOString();
    p.freigegebenVon = (p.freigaben || []).map(v => v.name || v.upn).join(', ');
    published = true;
  }
  if (!await pruefeFremdaenderung(p, 'freigibst')) return;
  historieAdd(p, published ? 'Freigegeben & veröffentlicht' : 'Freigabe erteilt',
    (anmerkung ? 'Anmerkung: ' + anmerkung + '\n' : '') +
    (published ? `Version ${p.version} veröffentlicht.` : 'Weitere Freigaben stehen noch aus.')
    + ekKanalHinweis());
  try {
    await spSavePolicy(p);
    await reloadData();
    renderFreigaben();
    toast(published ? 'Freigegeben & veröffentlicht ✓' : 'Freigabe vermerkt (weitere GL nötig).', 'success');
    if (published) {
      _ismsWriteback(p, 'freigabe');   // Freigabe ans Ursprungs-ISMS-Dokument zurückschreiben
      // Bekanntgabe: bewusst mit Rückfrage. Eine reine Korrekturversion muss nicht
      // die halbe Belegschaft erreichen – die Entscheidung trifft, wer freigibt.
      const ziel = (typeof mailsFuerZielgruppen === 'function') ? mailsFuerZielgruppen(p.zielgruppen) : { adressen: [], fehlend: [] };
      if (ziel.adressen.length) {
        const att = await spGetDocAttachment(p.dokumentDriveId, p.dokumentItemId, p.dokumentName);
        if (await zielgruppeBekanntgabeDialog(p, ziel, { dokumentName: att ? att.name : '' })) {
          if (await notifyZielgruppe(p, { still: true })) {
            toast(`Zielgruppe informiert (${ziel.adressen.join(', ')}) ✓`, 'success');
            await zielgruppeBekanntgabeVermerken(p.id, ziel.adressen);
          }
        }
      } else if (typeof toast === 'function') {
        toast('Veröffentlicht. Für die Bekanntgabe fehlt ein Verteiler – Einstellungen → Verteiler je Zielgruppe.', 'error');
      }
    }
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/** Geltungsbereich als Text für Mails ('' = nicht gepflegt).
 *  Wer eine Freigabe erteilt oder ein Regelwerk zur Kenntnis bekommt, muss wissen,
 *  für welche Standorte es überhaupt gilt – das stand bisher nur in der App. */
function _mailGeltungsbereich(p) {
  const gb = (typeof geltungsbereichLabel === 'function') ? geltungsbereichLabel(p.geltungsbereich) : '';
  return gb || '';
}

/* ── Veröffentlichung bekanntgeben ──
   Bis hierher erfuhr die Zielgruppe von einem neuen Regelwerk nur, wenn sie die
   App öffnete – die erste Mail war die Erinnerung nach sieben Tagen. Das ist die
   falsche Reihenfolge und im Audit die Frage, wie Bekanntgabe sichergestellt ist
   (ISO 27001 A.6.3, Klausel 7.3). */

function _zielgruppeMailHtml(p) {
  // „ansicht=meine": Hier geht es ums Lesen und Bestätigen. Ohne die Angabe
  // hinge das Ziel an der Rolle des Empfängers.
  const url = p.id
    ? `https://rms.dihag.de/?richtlinie=${encodeURIComponent(p.id)}&ansicht=meine`
    : 'https://rms.dihag.de/?ansicht=meine';
  const wasTun = p.quizErforderlich
    ? 'lesen, die Kenntnisnahme bestätigen und den kurzen Wissenstest bestehen'
    : 'lesen und die Kenntnisnahme bestätigen';
  return mailRumpf(`
    <p>Guten Tag,</p>
    <p>ab sofort gilt ein neues Regelwerk:</p>
    <p style="font-size:17px"><b>${esc(p.title)}</b><br>
      <span style="color:#6b7280">Version ${esc(p.version)}${p.kategorie ? ' · ' + esc(p.kategorie) : ''}${p.regelwerkTyp ? ' · ' + esc(p.regelwerkTyp) : ''}</span></p>
    ${_mailGeltungsbereich(p) ? `<p style="margin:0 0 10px"><b>Gilt für:</b> ${esc(_mailGeltungsbereich(p))}</p>` : ''}
    ${p.beschreibung ? `<p>${esc(p.beschreibung)}</p>` : ''}
    <p>${p.pflicht !== false ? `Bitte das Regelwerk <b>${wasTun}</b>.` : 'Das Regelwerk steht Ihnen zur Kenntnis bereit.'}
       Das dauert meist wenige Minuten.</p>
    <p style="margin:18px 0 6px"><a href="${esc(url)}" style="display:inline-block;background:#17509e;color:#fff;text-decoration:none;padding:11px 22px;border-radius:7px;font-weight:600">Regelwerk öffnen →</a></p>
    ${mailFuss(`Automatische Nachricht vom DIHAG Regelwerk-Management-System.
      Sie erhalten sie, weil dieses Regelwerk für Ihren Bereich gilt.`)}
  `);
}

/* ── Rückfrage vor der Bekanntgabe ──
   Eine Mail an mehrere hundert Leute verdient mehr als eine Textzeile: Wer sie
   bekommt, was drinsteht, ob das Dokument dranhängt – und die Möglichkeit,
   vorher hineinzusehen. Wer das einmal gesehen hat, klickt beim nächsten Mal
   ruhiger auf „Jetzt bekanntgeben". */

let _bgAntwort = null;

function bgEntscheiden(ja) {
  closeModal();
  const antwort = _bgAntwort;
  _bgAntwort = null;
  if (antwort) antwort(!!ja);
}

/** @returns {Promise<boolean>} true = senden */
function zielgruppeBekanntgabeDialog(p, ziel, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    _bgAntwort = resolve;
    const zg = (p.zielgruppen && p.zielgruppen.length) ? p.zielgruppen : ['ALLE'];
    const chip = (t, farbe, schrift) => `<span style="display:inline-block;background:${farbe || '#eef2ff'};
      color:${schrift || '#312e81'};border-radius:999px;padding:3px 10px;font-size:.78rem;font-weight:600;
      margin:0 6px 6px 0">${esc(t)}</span>`;
    const zeile = (label, inhalt) => `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--c-border-2)">
      <span style="flex:0 0 130px;color:var(--c-muted);font-size:.83rem">${esc(label)}</span>
      <span style="flex:1;min-width:0;font-size:.86rem">${inhalt}</span></div>`;

    const empfaenger = ziel.adressen.map(a => chip('📧 ' + a, '#dcfce7', '#166534')).join('');
    const fehlend = ziel.fehlend.length
      ? `<div class="col-warning" style="display:block;margin-top:10px">
           Für ${ziel.fehlend.map(f => '<b>' + esc(f) + '</b>').join(', ')} ist <b>kein Verteiler</b> hinterlegt –
           diese Gruppe erhält nichts. Nachtragen unter <i>Einstellungen → Verteiler je Zielgruppe</i>.</div>`
      : '';
    const dokument = o.dokumentName
      ? `📎 ${esc(o.dokumentName)} <span class="field-hint">hängt an der Mail</span>`
      : '<span class="field-hint">kein Anhang – die Mail verlinkt auf das Regelwerk</span>';
    const wieder = p.bekanntgabeAm
      ? `<div class="field-hint" style="margin-top:10px">⏱ Bereits bekanntgegeben am
         <b>${typeof fmtDateTime === 'function' ? esc(fmtDateTime(p.bekanntgabeAm)) : esc(p.bekanntgabeAm)}</b> –
         diese Nachricht geht erneut an alle.</div>`
      : '';

    openModal(`
      <div class="modal-header">
        <h3>📣 Veröffentlichung bekanntgeben</h3>
        <button class="modal-close" onclick="bgEntscheiden(false)">×</button>
      </div>
      <div class="modal-body">
        ${zeile('Regelwerk', `<b>${esc(p.title)}</b> <span class="field-hint">Version ${esc(p.version)}${p.regelwerkTyp ? ' · ' + esc(p.regelwerkTyp) : ''}</span>`)}
        ${zeile('Zielgruppe', zg.map(z => chip(z === 'ALLE' ? 'Alle Mitarbeitenden' : z)).join(''))}
        ${zeile('Geht an', empfaenger || '<span class="field-hint">–</span>')}
        ${zeile('Anhang', dokument)}
        ${zeile('Zu erledigen', p.pflicht !== false
          ? (p.quizErforderlich ? 'Kenntnisnahme <b>und</b> Wissenstest' : 'Kenntnisnahme')
          : '<span class="field-hint">freiwillige Lektüre</span>')}
        ${fehlend}${wieder}
        <details style="margin-top:14px">
          <summary style="cursor:pointer;font-weight:600;font-size:.86rem">So sieht die Nachricht aus</summary>
          <div style="border:1px solid var(--c-border);border-radius:10px;padding:14px;margin-top:8px;
            max-height:280px;overflow:auto;background:#fff">
            <div style="font-size:.78rem;color:var(--c-muted);margin-bottom:8px">
              Betreff: <b>Neues Regelwerk: ${esc(p.title)}</b></div>
            ${_zielgruppeMailHtml(p)}
          </div>
        </details>
        <div class="field-hint" style="margin-top:12px">
          Verschickt wird <b>eine</b> Mail je Verteiler – wer dazugehört, weiß Exchange.
          Zeitpunkt und Empfänger landen in der Historie des Regelwerks.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="bgEntscheiden(false)">${o.nachtraeglich ? 'Abbrechen' : 'Später'}</button>
        <button class="btn btn-primary" onclick="bgEntscheiden(true)">📣 Jetzt bekanntgeben</button>
      </div>`, true, { label: 'Veröffentlichung bekanntgeben' });
  });
}

/**
 * Zielgruppe über ein veröffentlichtes Regelwerk informieren – über die
 * hinterlegten Verteiler, nicht über Einzeladressen.
 * @returns {boolean} true, wenn eine Mail rausging
 */
async function notifyZielgruppe(p, opts) {
  const still = !!(opts && opts.still);
  if (typeof mailsFuerZielgruppen !== 'function') return false;
  const { adressen, fehlend } = mailsFuerZielgruppen(p.zielgruppen);
  if (!adressen.length) {
    if (!still) {
      toast(`Für ${fehlend.length ? '„' + fehlend.join('", „') + '"' : 'diese Zielgruppe'} ist kein Verteiler hinterlegt `
        + '– Einstellungen → Verteiler je Zielgruppe.', 'error');
    }
    return false;
  }
  try {
    const att = await spGetDocAttachment(p.dokumentDriveId, p.dokumentItemId, p.dokumentName);
    await spSendMail(adressen, `Neues Regelwerk: ${p.title}`, _zielgruppeMailHtml(p),
      att ? [att] : [], null, (typeof zielgruppenDomains === 'function') ? zielgruppenDomains() : []);
    if (fehlend.length) {
      toast(`Verschickt an ${adressen.length} Verteiler. Ohne Verteiler blieb: „${fehlend.join('", „')}".`, 'error');
    } else if (!still) {
      toast(`Zielgruppe informiert (${adressen.join(', ')}) ✓`, 'success');
    }
    return true;
  } catch (e) {
    toast('Bekanntgabe fehlgeschlagen: ' + e.message, 'error');
    return false;
  }
}

/** Bekanntgabe im Regelwerk vermerken (eigener Speichervorgang, damit sie im Audit steht). */
async function zielgruppeBekanntgabeVermerken(id, adressen) {
  const src = policyZuId(id);
  if (!src) return;
  const p = JSON.parse(JSON.stringify(src));
  p.bekanntgabeAm = new Date().toISOString();
  historieAdd(p, 'Zielgruppe informiert',
    `Bekanntgabe der Veröffentlichung an: ${adressen.join(', ')}`);
  try { await spSavePolicy(p); await reloadData(); } catch (e) { /* die Mail ist raus – das zählt */ }
}

/** „Zielgruppe informieren" von Hand (Nachzügler, vergessene Bekanntgabe, neue Version). */
async function zielgruppeInformieren(id) {
  const p = policyZuId(id);
  if (!p) { toast('Regelwerk nicht gefunden.', 'error'); return; }
  const { adressen, fehlend } = mailsFuerZielgruppen(p.zielgruppen);
  if (!adressen.length) {
    toast(`Kein Verteiler hinterlegt für „${fehlend.join('", „')}" – Einstellungen → Verteiler je Zielgruppe.`, 'error');
    return;
  }
  const att = await spGetDocAttachment(p.dokumentDriveId, p.dokumentItemId, p.dokumentName);
  if (!await zielgruppeBekanntgabeDialog(p, { adressen, fehlend },
    { dokumentName: att ? att.name : '', nachtraeglich: true })) return;
  if (await notifyZielgruppe(p, { still: true })) {
    toast(`Zielgruppe informiert (${adressen.join(', ')}) ✓`, 'success');
    await zielgruppeBekanntgabeVermerken(id, adressen);
  }
}

async function notifyPruefer(p) {
  if (typeof isPAPruefung === 'function' && isPAPruefung()) {
    console.info('[wf] Konformitätsprüfung über Power Automate – App-Prüfer-Mail übersprungen.');
    return;   // Power Automate verschickt die Genehmigungs-Mail
  }
  const zustaendig = (typeof getPolicyPruefer === 'function') ? getPolicyPruefer(p) : getPruefer();
  // Wer gerade vertreten wird, bekommt die Mail trotzdem – die Vertretung zusätzlich.
  const pruefer = (typeof mitVertretern === 'function') ? mitVertretern(zustaendig) : zustaendig;
  if (!pruefer.length) { toast('Keine Prüfer hinterlegt – bitte in den Einstellungen ergänzen (oder pro Regelwerk im Editor).', 'error'); return; }
  try {
    const att = await spGetDocAttachment(p.dokumentDriveId, p.dokumentItemId, p.dokumentName);
    // Einzelversand: Nur so trägt der Link die Adresse des Empfängers – und nur dann
    // ist die Entscheidung aus der Mail wirklich ein Klick.
    let sent = 0, letzterFehler = '';
    for (const empf of pruefer) {
      try {
        await spSendMail([empf], `Neues Regelwerk zur Sichtung: ${p.title}`,
          _wfMailHtml('Neues Regelwerk – bitte um Sichtung und ggf. Anmerkung', p,
            'Bitte prüfe das Regelwerk auf Konformität und markiere „konform" oder „nicht konform" (mit Anmerkung).',
            att ? att.name : '', 'pruefung', empf),
          att ? [att] : []);
        sent++;
      } catch (e) { letzterFehler = e.message; console.warn('Prüfer-Mail an', empf, e.message); }
    }
    if (!sent) throw new Error(letzterFehler || 'kein Empfänger erreicht');
    toast(`Prüfer benachrichtigt (${sent}) ✓` + (att ? ' (mit Dokument)' : ''), 'success');
  } catch (e) { console.warn('Prüfer-Mail:', e.message); toast('Mail an Prüfer fehlgeschlagen (Mail.Send nötig): ' + e.message, 'error'); }
}
async function notifyGL(p) {
  if (typeof isPAFreigabe === 'function' && isPAFreigabe()) {
    console.info('[wf] Freigabe über Power Automate – App-GL-Mail übersprungen.');
    return;   // Power Automate verschickt die Freigabe-Mail
  }
  const zustaendig = (typeof getPolicyGeschaeftsleitung === 'function') ? getPolicyGeschaeftsleitung(p) : getGeschaeftsleitung();
  const gl = (typeof mitVertretern === 'function') ? mitVertretern(zustaendig) : zustaendig;
  if (!gl.length) return;
  try {
    const att = await spGetDocAttachment(p.dokumentDriveId, p.dokumentItemId, p.dokumentName);
    // Einzelversand – jede Freigeberin bekommt ihren eigenen Ein-Klick-Link.
    for (const empf of gl) {
      try {
        await spSendMail([empf], `Regelwerk zur Freigabe: ${p.title}`,
          _wfMailHtml('Regelwerk ist konform – bitte um Freigabe', p,
            'Die Konformitätsprüfung ist abgeschlossen. Bitte gib das Regelwerk zur Veröffentlichung frei.',
            att ? att.name : '', 'freigabe', empf),
          att ? [att] : []);
      } catch (e) { console.warn('GL-Mail an', empf, e.message); }
    }
  } catch (e) { console.warn('GL-Mail:', e.message); }
}

/* ── Mitbestimmung: KBR + Betriebsräte der betroffenen Werke benachrichtigen ──
   Einzelversand pro Empfänger (Betriebsräte sehen sich nicht gegenseitig).
   Admin-gepflegte Adressen dürfen auch auf Gruppengesellschafts-Domains liegen. */
async function notifyMitbestimmung(p) {
  const werke = Array.isArray(p.mitbestimmungWerke) ? p.mitbestimmungWerke : [];
  if (!p.kbrBetroffen && !werke.length) return;   // nichts betroffen → keine Mail

  const recipients = [];   // { mail, label }
  const fehlt = [];
  if (p.kbrBetroffen) {
    const kbr = (typeof getKbrMail === 'function' ? getKbrMail() : '').trim();
    if (kbr) recipients.push({ mail: kbr, label: 'Konzernbetriebsrat' });
    else fehlt.push('KBR');
  }
  for (const code of werke) {
    const m = (typeof getBrMail === 'function' ? getBrMail(code) : '').trim();
    if (m) recipients.push({ mail: m, label: 'Betriebsrat ' + code });
    else fehlt.push(code);
  }
  if (fehlt.length) {
    toast('Mitbestimmung: keine Mail hinterlegt für ' + fehlt.join(', ') + ' – bitte in den Einstellungen ergänzen.', 'error');
  }
  if (!recipients.length) return;

  // Dokument einmal laden und an jede Council-Mail anhängen
  let att = null;
  try { att = await spGetDocAttachment(p.dokumentDriveId, p.dokumentItemId, p.dokumentName); }
  catch (e) { console.warn('Mitbestimmung: Anhang nicht ladbar:', e.message); }

  let sent = 0;
  for (const r of recipients) {
    const dom = r.mail.includes('@') ? r.mail.split('@').pop() : '';
    try {
      await spSendMail([r.mail], `Mitbestimmung – Richtlinie zur Prüfung: ${p.title}`,
        _mitMailHtml(p, r.label, att ? att.name : ''),
        att ? [att] : [], null, dom ? [dom] : []);
      sent++;
    } catch (e) { console.warn('Mitbestimmungs-Mail an', r.mail, e.message); }
  }
  if (sent) toast(`Mitbestimmung: ${sent} Empfänger (KBR/Betriebsrat) benachrichtigt ✓`, 'success');
}
/** „Bereits freigegeben"-Block für Workflow-Mails – zeigt dem nächsten Prüfer/Freigeber,
 *  wer bereits zugestimmt hat (Konformitätsprüfung, Mitbestimmung, Freigabe). */
function _wfApprovalsHtml(p) {
  const d = (iso) => (typeof fmtDate === 'function' && iso) ? ' – ' + fmtDate(iso) : '';
  const rows = [];
  // Die Freigabe des Konzepts ist die erste Zustimmung im Ablauf – sie gehört
  // in diese Übersicht, aber klar unterscheidbar von der späteren Freigabe des
  // fertigen Regelwerks. Quelle ist die Änderungshistorie.
  const konz = (p.historie || []).find(h => h.aktion === 'Konzept freigegeben');
  if (konz) rows.push(`✓ Konzeptfreigabe (GL): <b>${esc(konz.name || konz.upn)}</b>${d(konz.datum)}`);
  (p.konformitaet || []).filter(v => v.entscheidung === 'konform').forEach(v =>
    rows.push(`✓ Konformitätsprüfung: <b>${esc(v.name || v.upn)}</b>${d(v.datum)}`));
  if (p.mitbestimmung && p.mitbestimmung.konform)
    rows.push(`✓ Mitbestimmung: <b>${esc(p.mitbestimmung.name || p.mitbestimmung.upn)}</b>${d(p.mitbestimmung.datum)}`);
  (p.freigaben || []).forEach(v =>
    rows.push(`✓ Freigabe des Regelwerks (GL): <b>${esc(v.name || v.upn)}</b>${d(v.datum)}`));
  if (!rows.length) return '';
  return `<div style="margin:14px 0;padding:10px 14px;background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 8px 8px 0;font-size:13px;color:#14532d">
    <b>Bereits freigegeben (zur Info):</b><br>${rows.join('<br>')}</div>`;
}

/**
 * Dokumentzeile der Workflow-Mails.
 * Der Anhang ist bequem, reicht aber nicht: Wer entscheidet, soll die Datei auch
 * an ihrem Platz in SharePoint ansehen können – dort steht sie mit Versionsstand
 * und Kommentaren. Deshalb immer beides anbieten, soweit vorhanden.
 */
function _wfDokumentHtml(p, attachmentName) {
  const zeilen = [];
  if (attachmentName) zeilen.push(`📎 Das Dokument ist dieser E-Mail angehängt: <b>${esc(attachmentName)}</b>.`);
  else if (p.dokumentName) zeilen.push(`📎 Hinterlegtes Dokument: <b>${esc(p.dokumentName)}</b> (nicht angehängt – zu groß oder nicht abrufbar).`);
  if (!zeilen.length && !p.dokumentUrl) return '';
  const link = p.dokumentUrl
    ? `<p style="margin:6px 0 0"><a href="${esc(p.dokumentUrl)}" style="color:#17509e;font-weight:600;text-decoration:none">📄 Dokument in SharePoint öffnen →</a>
       <span style="color:#9ca3af;font-size:12px">(immer der aktuelle Stand, mit Versionsverlauf)</span></p>`
    : '';
  return `${zeilen.length ? `<p style="margin:12px 0 0">${zeilen.join('<br>')}</p>` : ''}${link}`;
}

/* ═══════════════════════════════════════════════════
   Ein-Klick-Entscheidung aus der Mail
   ═══════════════════════════════════════════════════
   Der Knopf in der Mail führt auf eine Landung, die still anmeldet (SSO), das
   Token prüft und die Entscheidung sofort ausführt – kein Suchen, keine
   Rückfrage. Zwei Dinge müssen dabei zusammenkommen:

   • Das **Token** bindet den Klick an die laufende Runde. Ein Link aus einer
     früheren Runde (oder aus einer weitergeleiteten alten Mail) läuft ins Leere.
   • Die **Anmeldung** liefert, wer geklickt hat. Ein Link allein belegt nur den
     Zugriff aufs Postfach – für eine Freigabe, die im Audit standhalten soll, zu
     wenig. Deshalb keine Entscheidung ohne angemeldetes Konto.

   Ein Fehlklick lässt sich zurücknehmen (siehe freigabeZuruecknehmen) – auch das
   wird protokolliert. */

/* Läuft die Entscheidung gerade aus der Mail? Im Audit ist es ein Unterschied,
   ob jemand im Portal saß oder mit einem Klick aus der Benachrichtigung heraus
   entschieden hat. Der Merker wird in einKlickAktion() gesetzt und von den drei
   mark*-Funktionen beim Protokollieren gelesen – die werden aus beiden Wegen
   aufgerufen und sollen den Unterschied nicht kennen müssen. */
let _ekAusMail = false;
function ekKanalHinweis() {
  return _ekAusMail ? '\nEntschieden per Ein-Klick aus der Benachrichtigungs-Mail.' : '';
}

/** Neues Einmal-Token für eine Runde. */
function neuerAktionToken(art) {
  let wert = '';
  try {
    const b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    wert = Array.from(b).map(x => x.toString(36)).join('').slice(0, 24);
  } catch (e) {
    wert = (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 24);
  }
  return { wert, art, erstelltAm: new Date().toISOString() };
}

/** Passt das Token aus dem Link zur laufenden Runde? */
function aktionTokenGueltig(p, art, token) {
  const t = p && p.aktionToken;
  return !!(t && t.wert && token && t.wert === token && t.art === art);
}

/** In welchem Status ist diese Entscheidung überhaupt möglich? */
const _EK_ERWARTET = {
  freigeben:        ['Freigabe'],
  zurueck:          ['Freigabe'],
  konform:          ['Konformitätsprüfung', 'InReview'],
  nicht_konform:    ['Konformitätsprüfung', 'InReview'],
  mb_konform:       ['Mitbestimmung'],
  mb_nicht_konform: ['Mitbestimmung'],
};

function _ekPanel(inhalt) {
  const host = document.getElementById('modal-mount');
  if (!host) return;
  host.innerHTML = `<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="Entscheidung">
    <div class="modal-body" style="text-align:center;padding:28px 26px">${inhalt}</div></div></div>`;
}

const _ekSchliessen = `<div style="margin-top:16px"><button class="btn btn-outline" onclick="closeModal()">Schließen</button></div>`;

/**
 * Regelwerk für die Ein-Klick-Entscheidung holen – oder erklären, warum nicht.
 *
 * Ein leeres Ergebnis hat drei Ursachen, und nur eine davon heißt „gelöscht":
 * die Liste ist noch gar nicht geladen, die Kennung gehört zu einem Konzept,
 * oder es ist wirklich weg. Früher bekam man in allen drei Fällen dieselbe
 * Auskunft – und die war zweimal von drei Malen falsch.
 *
 * @returns {Promise<object|null>} das Regelwerk – oder null, dann steht die
 *          passende Meldung bereits auf dem Schirm.
 */
/**
 * Ein Regelwerk, das es gibt, das diese Person aber wegen der Trennung nach
 * Gesellschaft nicht sieht. „Gelöscht" wäre hier gelogen.
 * Gibt '' zurück, wenn das nicht der Fall ist.
 */
function fremdeGesellschaftHinweis(id) {
  if (typeof regelwerkVerborgen !== 'function' || !regelwerkVerborgen(id)) return '';
  const g = (typeof meineGesellschaft === 'function') ? meineGesellschaft() : null;
  return 'Dieses Regelwerk gehört zu einer anderen Gesellschaft und ist für Sie ausgeblendet'
    + (g && g.name ? ' – Sie sehen die Regelwerke von ' + g.name : '') + '.';
}

async function _ekRegelwerkHolen(id) {
  let p = policyZuId(id);
  if (p) return p;

  // Beim Start wird ein Fehler beim Laden absichtlich verschluckt (bootApp);
  // dann ist die Liste schlicht leer. Einmal nachladen, bevor wir etwas über
  // den Verbleib behaupten.
  try {
    await reloadData({ rendern: false });
  } catch (e) {
    _ekPanel(`<h3>Die Regelwerke konnten nicht geladen werden</h3>
      <p style="line-height:1.55">${esc(e.message || 'Unbekannter Fehler')}</p>
      <p style="line-height:1.55">Ihre Entscheidung ist damit <b>nicht</b> gespeichert.
      Bitte die Seite neu laden und den Link noch einmal anklicken.</p>${_ekSchliessen}`);
    return null;
  }
  p = policyZuId(id);
  if (p) return p;

  // Konzepte liegen seit der Trennung in State.konzepte. Ein Link darauf fand
  // hier nie etwas – und bekam fälschlich „gelöscht" zu hören.
  const k = konzeptZuId(id);
  if (k) {
    _ekPanel(`<h3>Das ist noch ein Konzept</h3>
      <p style="line-height:1.55">„${esc(k.title)}" liegt als Konzept vor – entschieden wird
      darüber im Regelwerk Dashboard unter „Konzepte", nicht in der Freigabe.</p>
      <div style="margin-top:16px"><button class="btn btn-primary"
        onclick="closeModal();konzeptOeffnen('${esc(String(id))}')">Konzept öffnen</button></div>`);
    return null;
  }

  // Es gibt das Regelwerk – nur nicht für diese Person. Das ist eine andere
  // Auskunft als „gelöscht", und die falsche schickt sie auf eine Suche.
  const fremd = fremdeGesellschaftHinweis(id);
  if (fremd) {
    _ekPanel(`<h3>Nicht Ihre Gesellschaft</h3>
      <p style="line-height:1.55">${esc(fremd)}</p>
      <p style="line-height:1.55">Ihre Entscheidung ist damit <b>nicht</b> gespeichert. Wenden Sie sich
      an die Person, die Ihnen die Mail geschickt hat – vermutlich ist der Link an den falschen
      Verteiler gegangen.</p>${_ekSchliessen}`);
    return null;
  }

  _ekPanel(`<h3>Regelwerk nicht gefunden</h3>
    <p style="line-height:1.55">Es wurde vermutlich zwischenzeitlich gelöscht oder archiviert.</p>
    <p style="color:#6b7280;font-size:12px;margin-top:10px">Kennung aus dem Link: <b>${esc(String(id))}</b></p>${_ekSchliessen}`);
  return null;
}

/**
 * Landung aus der Mail: prüfen, ausführen, Ergebnis zeigen.
 * Ohne gültiges Token bleibt es beim gewohnten Weg mit Rückfrage.
 */
async function einKlickAktion(id, aktion, token, adressatAusLink) {
  const p = await _ekRegelwerkHolen(id);
  if (!p) return;

  // Der Link nennt seinen Adressaten. Weil der Konto-Cache über Tabs geteilt wird,
  // könnte an einem Rechner sonst die Entscheidung unter einem fremden Namen landen –
  // etwa nach einer weitergeleiteten Mail mit der Bitte, kurz einzuspringen.
  const adressat = String(adressatAusLink || '').trim().toLowerCase()
    || ((typeof getLoginHint === 'function') ? getLoginHint() : '');
  const ich = String((State.user && State.user.upn) || '').toLowerCase();
  if (adressat && ich && adressat !== ich) {
    _ekPanel(`<h3>Dieser Link war an jemand anderen adressiert</h3>
      <p style="line-height:1.55">Angemeldet sind Sie als <b>${esc(ich)}</b>, die Mail ging an
      <b>${esc(adressat)}</b>. Eine Entscheidung stünde sonst unter dem falschen Namen.</p>
      <p style="line-height:1.55">Sind Sie <b>eingesprungen</b>, tragen Sie die Vertretung in den
      Einstellungen ein und entscheiden im Portal – dann steht es auch so im Protokoll.</p>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="authAnmeldenAls('${esc(adressat)}')">Als ${esc(adressat)} anmelden</button>
        <button class="btn btn-outline" onclick="closeModal();focusPolicyCard('${esc(id)}')">Im Portal öffnen</button></div>`);
    return;
  }

  const art = String(aktion).startsWith('mb_') ? 'mitbestimmung'
    : (aktion === 'freigeben' || aktion === 'zurueck') ? 'freigabe' : 'pruefung';
  const erwartet = _EK_ERWARTET[aktion] || [];

  if (!erwartet.includes(p.status)) {
    _ekPanel(`<div style="font-size:2rem">✓</div><h3>Schon erledigt</h3>
      <p style="line-height:1.55">„${esc(p.title)}" steht inzwischen auf <b>${esc(p.status)}</b> –
      hier ist nichts mehr zu tun.</p>
      <div style="margin-top:16px"><button class="btn btn-primary" onclick="closeModal();focusPolicyCard('${esc(id)}')">Vorgang ansehen</button></div>`);
    return;
  }
  const befugt = (art === 'mitbestimmung')
    ? (typeof darfMitbestimmung === 'function' && darfMitbestimmung(p))
    : (art === 'freigabe')
      ? (typeof isCurrentUserGeschaeftsleitungForPolicy === 'function' && isCurrentUserGeschaeftsleitungForPolicy(p))
      : (typeof isCurrentUserPrueferForPolicy === 'function' && isCurrentUserPrueferForPolicy(p));
  if (!befugt) {
    const kreis = art === 'mitbestimmung' ? 'der Betriebsrat (und der Kreis der Prüfer bzw. die Geschäftsleitung)'
      : art === 'freigabe' ? 'die Geschäftsleitung' : 'der Kreis der Prüfer';
    _ekPanel(`<h3>Dafür fehlt Ihnen die Berechtigung</h3>
      <p style="line-height:1.55">Für „${esc(p.title)}" ist ${kreis} hinterlegt.
      ${art === 'mitbestimmung'
        ? 'Erkannt wird die Zugehörigkeit über die Adresse des Betriebsrats aus den Einstellungen – als eigene Adresse oder über die Mitgliedschaft in der hinterlegten Gruppe.'
        : 'Sind Sie eingesprungen, muss die <b>Vertretung</b> in den Einstellungen eingetragen sein.'}</p>${_ekSchliessen}`);
    return;
  }
  if (!aktionTokenGueltig(p, art, token)) {
    // Kein Drama, nur kein Ein-Klick: Der Link stammt aus einer früheren Runde.
    _ekPanel(`<h3>Dieser Link ist nicht mehr aktuell</h3>
      <p style="line-height:1.55">Zu „${esc(p.title)}" läuft inzwischen eine neue Runde. Bitte den Vorgang
      öffnen und dort entscheiden – die Angaben sind dann auf dem aktuellen Stand.</p>
      <div style="margin-top:16px"><button class="btn btn-primary" onclick="closeModal();focusPolicyCard('${esc(id)}')">Vorgang öffnen</button></div>`);
    return;
  }

  const fuer = (art === 'mitbestimmung' || typeof vertretungFuerAus !== 'function') ? ''
    : vertretungFuerAus(art === 'freigabe' ? getPolicyGeschaeftsleitung(p) : getPolicyPruefer(p), State.user.upn);
  const inVertretung = fuer ? `<div class="field-hint" style="margin-top:6px">in Vertretung für ${esc(fuer)}</div>` : '';
  _ekPanel(`<div class="doc-loading">Entscheidung wird gespeichert …</div>`);

  // Das finally ist kein Fehlerfänger: Es reicht eine Ablehnung unverändert
  // weiter und stellt nur sicher, dass der Merker nicht stehen bleibt.
  _ekAusMail = true;
  try {
    if (aktion === 'freigeben') await markFreigabe(id);
    else if (aktion === 'konform') await markKonform(id, true);
    else if (aktion === 'mb_konform') await markMitbestimmung(id, true);
    // „Nicht konform" fragt in beiden Fällen nach der Begründung – markKonform und
    // markMitbestimmung greifen ohne Eingabefeld auf die Rückfrage zurück.
    else if (aktion === 'mb_nicht_konform') await markMitbestimmung(id, false);
    else await markKonform(id, false);
  } finally { _ekAusMail = false; }

  const danach = policyZuId(id) || p;
  const fertig = aktion === 'freigeben'
    ? (danach.status === 'Veröffentlicht'
      ? `<div style="font-size:2rem">🎉</div><h3>Freigegeben und veröffentlicht</h3>
         <p style="line-height:1.55">„${esc(p.title)}" ist ab sofort für die Zielgruppe sichtbar.</p>${inVertretung}
         <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
           <button class="btn btn-outline" onclick="freigabeZuruecknehmen('${esc(id)}')">Rückgängig</button>
           <button class="btn btn-primary" onclick="closeModal()">Fertig</button></div>`
      : `<div style="font-size:2rem">✓</div><h3>Ihre Freigabe ist vermerkt</h3>
         <p style="line-height:1.55">Für die Veröffentlichung fehlen noch weitere Freigaben.</p>${inVertretung}${_ekSchliessen}`)
    : `<div style="font-size:2rem">✓</div><h3>Entscheidung gespeichert</h3>
       <p style="line-height:1.55">„${esc(p.title)}" steht jetzt auf <b>${esc(danach.status)}</b>.</p>${inVertretung}${_ekSchliessen}`;
  _ekPanel(fertig);
}

/** Fehlklick zurücknehmen: Freigabe entfernen, Veröffentlichung aufheben – protokolliert. */
async function freigabeZuruecknehmen(id) {
  const src = policyZuId(id);
  if (!src) return;
  const p = JSON.parse(JSON.stringify(src));
  const meine = (p.freigaben || []).filter(v => (v.upn || '').toLowerCase() === State.user.upn.toLowerCase());
  if (!meine.length) { toast('Von Ihnen liegt hier keine Freigabe vor.', 'error'); return; }
  p.freigaben = (p.freigaben || []).filter(v => (v.upn || '').toLowerCase() !== State.user.upn.toLowerCase());
  p.status = 'Freigabe';
  p.veroeffentlichtAm = '';
  // Neues Token: Der Link aus der alten Mail soll nach einer Rücknahme nicht
  // einfach ein zweites Mal funktionieren.
  p.aktionToken = neuerAktionToken('freigabe');
  p.freigegebenVon = (p.freigaben || []).map(v => v.name || v.upn).join(', ');
  historieAdd(p, 'Freigabe zurückgenommen',
    'Die eigene Freigabe wurde direkt nach der Entscheidung zurückgenommen; das Regelwerk ist wieder in der Freigabe.');
  try {
    await spSavePolicy(p);
    await reloadData();
    if (typeof renderFreigaben === 'function') renderFreigaben();
    _ekPanel(`<div style="font-size:2rem">↩</div><h3>Zurückgenommen</h3>
      <p style="line-height:1.55">„${esc(p.title)}" liegt wieder zur Freigabe bereit.</p>${_ekSchliessen}`);
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

function _wfMailHtml(headline, p, text, attachmentName, phase, empfaenger) {
  const base = 'https://rms.dihag.de/';
  // Ohne Kennung gibt es keinen brauchbaren Link – „?richtlinie=undefined"
  // zeigt beim Klick nur „Regelwerk nicht gefunden". Dann lieber der Reiter.
  const url = p.id
    ? `${base}?richtlinie=${encodeURIComponent(p.id)}&ansicht=freigaben`
    : `${base}?ansicht=freigaben`;
  // Das Token macht aus dem Link eine Ein-Klick-Entscheidung – ohne ihn bleibt es
  // beim gewohnten Weg mit Rückfrage (z. B. bei Mails aus einer früheren Runde).
  const tok = (p.aktionToken && p.aktionToken.wert) ? `&t=${encodeURIComponent(p.aktionToken.wert)}` : '';
  // Der Adressat steht im Link: Microsoft meldet ihn ohne Kontoauswahl an, und die
  // App merkt es, wenn jemand anders auf den weitergeleiteten Link klickt.
  const hint = String(empfaenger || '').trim() ? `&u=${encodeURIComponent(String(empfaenger).trim())}` : '';
  const act = (a) => `${url}&aktion=${a}${tok}${hint}`;
  // Ein-Klick nur mit Kennung: Ein Knopf, der zuverlässig in eine Fehlermeldung
  // führt, ist schlimmer als keiner.
  const actions = !p.id ? ''
    : phase === 'freigabe'
    ? mailBtn(act('freigeben'), MAIL_FARBE.ja, '✓ Freigeben') + mailBtn(act('zurueck'), MAIL_FARBE.nein, '✗ Zurück (nicht konform)')
    : phase === 'pruefung'
      ? mailBtn(act('konform'), MAIL_FARBE.ja, '✓ Konform') + mailBtn(act('nicht_konform'), MAIL_FARBE.nein, '✗ Nicht konform')
      : '';
  return mailRumpf(`
    <p><b>${esc(headline)}</b></p>
    <p>Richtlinie: <a href="${esc(url)}" style="color:#17509e;font-weight:700;text-decoration:none">${esc(p.title)}</a> (Version ${esc(p.version)}${p.kategorie ? ', ' + esc(p.kategorie) : ''}${p.regelwerkTyp ? ', ' + esc(p.regelwerkTyp) : ''})</p>
    ${_mailGeltungsbereich(p) ? `<p style="margin:0 0 10px"><b>Geltungsbereich:</b> ${esc(_mailGeltungsbereich(p))}${(p.zielgruppen && p.zielgruppen.length && !p.zielgruppen.includes('ALLE')) ? ` · <b>Zielgruppe:</b> ${esc(p.zielgruppen.join(', '))}` : ''}</p>` : ''}
    <p>${esc(text)}</p>
    ${_wfDokumentHtml(p, attachmentName)}
    ${_wfApprovalsHtml(p)}
    ${actions ? `<p style="margin:18px 0 6px"><b>Direkt entscheiden:</b></p><p>${actions}</p>` : `<p><a href="${esc(url)}" style="display:inline-block;background:#17509e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:7px;font-weight:600">Richtlinie öffnen &amp; bearbeiten →</a></p>`}
    ${mailFuss(`Der Button meldet Sie still an (SSO) und führt die Entscheidung direkt aus – ein Klick, kein Suchen. Ein Fehlklick lässt sich auf derselben Seite zurücknehmen. Oder <a href="${esc(url)}" style="color:#9ca3af">nur ansehen</a>.<br>Automatische Nachricht vom DIHAG Regelwerk-Management-System.`)}
  `);
}



async function setStatus(id, status, historienText) {
  const src = policyZuId(id);
  if (!src) { toast('Regelwerk nicht gefunden.', 'error'); return; }
  const p = JSON.parse(JSON.stringify(src));
  const vorher = p.status;
  if (!await pruefeFremdaenderung(p, 'den Status änderst')) return;
  p.status = status;
  if (vorher !== status) historieAdd(p, 'Status geändert', historienText || `„${vorher}" → „${status}"`);
  try {
    await spSavePolicy(p);
    await reloadData();
    if (typeof renderFreigaben === 'function') renderFreigaben();
    renderAdminList();
    toast('Status geändert: ' + status, 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}

/** Veröffentlichtes Regelwerk außer Kraft setzen (bleibt für Audits erhalten). */
async function archivierePolicy(id) {
  if (typeof canWriteTab === 'function' && !canWriteTab('verwaltung')) { toast('Nur Lesezugriff auf „Regelwerk Dashboard".', 'error'); return; }
  const p = policyZuId(id);
  if (!p) return;
  const grund = await uiPrompt(
    `„${p.title}" archivieren? Es erscheint dann nicht mehr unter „Meine Regelwerke", bleibt aber mit allen Bestätigungen und der Historie erhalten.\n\nGrund (optional, z. B. „abgelöst durch …"):`,
    { title: 'Regelwerk archivieren', okLabel: 'Archivieren' });
  if (grund === null) return;
  closeModal();
  await setStatus(id, 'Archiviert', `„${p.status}" → „Archiviert"` + (grund.trim() ? `\nGrund: ${grund.trim()}` : ''));
}

/** Archiviertes Regelwerk zurück in den Entwurf holen. */
async function reaktivierePolicy(id) {
  if (typeof canWriteTab === 'function' && !canWriteTab('verwaltung')) { toast('Nur Lesezugriff auf „Regelwerk Dashboard".', 'error'); return; }
  const p = policyZuId(id);
  if (!p) return;
  if (!await uiConfirm(`„${p.title}" reaktivieren? Es geht zurück in den Status „Entwurf" und muss den Freigabeprozess erneut durchlaufen, bevor es wieder sichtbar wird.`,
    { title: 'Regelwerk reaktivieren', okLabel: 'Reaktivieren' })) return;
  closeModal();
  await setStatus(id, 'Entwurf', '„Archiviert" → „Entwurf" (reaktiviert)');
}

/* ═══════════════════════════════════════════════════
   Compliance-Dashboard
═══════════════════════════════════════════════════ */

/** Alle Konformitäts-/Freigabe-Ereignisse aller Richtlinien als flache, chronologische Liste. */
function _freigabeAuditRows() {
  const out = [];
  for (const p of (State.policies || [])) {
    for (const v of (p.konformitaet || [])) {
      out.push({
        datum: v.datum || '', policy: p.title, version: p.version,
        aktion: v.entscheidung === 'konform' ? 'Konformitätsprüfung: konform' : 'Konformitätsprüfung: nicht konform',
        wer: (v.name || v.upn || '') + (v.fuer ? ` (in Vertretung für ${v.fuer})` : ''),
        anmerkung: v.anmerkung || '',
      });
    }
    for (const v of (p.freigaben || [])) {
      out.push({
        datum: v.datum || '', policy: p.title, version: p.version,
        aktion: 'Freigabe erteilt',
        wer: (v.name || v.upn || '') + (v.fuer ? ` (in Vertretung für ${v.fuer})` : ''),
        anmerkung: v.anmerkung || '',
      });
    }
    // In Outlook (Power Automate) erteilte Freigabe: kein App-JSON, aber FreigegebenVon gesetzt
    if (!(p.freigaben || []).length && p.freigegebenVon) {
      out.push({
        datum: p.veroeffentlichtAm || '', policy: p.title, version: p.version,
        aktion: 'Freigabe erteilt (Outlook / Power Automate)', wer: p.freigegebenVon, anmerkung: '',
      });
    }
    if (p.veroeffentlichtAm) {
      out.push({
        datum: p.veroeffentlichtAm, policy: p.title, version: p.version,
        aktion: 'Veröffentlicht', wer: p.freigegebenVon || '', anmerkung: '',
      });
    }
  }
  out.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  return out;
}
