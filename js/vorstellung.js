'use strict';

/**
 * Vorstellung: Folien aus den Daten des RMS (Reiter „Notfall & Krisenstab")
 * ======================================================================
 * Für Gespräche mit Geschäftsführung und IT-Leitung. Alle Inhalte kommen aus
 * SharePoint: Landkarte, Krisenstab, Notfallpläne und Assetregister, damit die
 * Folien nie veralten. Was nur für das Gespräch gebraucht wird (Ansprechpartner,
 * Meldeweg, Termin), steht in prozesslandkarte.json unter notfall.vorstellung
 * und bekommt den Verlauf der Landkarte. Im Code steht kein Name und kein
 * Firmentext. Was nicht erfasst ist, erscheint als „offen".
 */

/** Angaben, die nicht aus den Registern kommen. */
const VS_FELDER = [
  { key: 'titel',           label: 'Titel der ersten Folie',               typ: 'zeile', platzhalter: 'Notfallvorsorge und Cybersicherheit' },
  { key: 'ansprechpartner', label: 'Ansprechpartner für Cybersecurity',    typ: 'zeile' },
  { key: 'vertretung',      label: 'Vertretung',                           typ: 'zeile' },
  { key: 'meldeweg',        label: 'Wohin melden die Werke einen Vorfall?', typ: 'text' },
  { key: 'koordination',    label: 'Wer koordiniert die ersten Maßnahmen?', typ: 'text' },
  { key: 'gfInfo',          label: 'Wer informiert die Geschäftsführung?',  typ: 'zeile' },
  { key: 'termin',          label: 'Termin für den Entwurf',                typ: 'zeile' },
  { key: 'schritte',        label: 'Nächste Schritte (eine Zeile je Schritt)', typ: 'text' },
];

const VS_PHASEN = ['planen', 'umsetzen', 'pruefen', 'anlass'];

function _vsEsc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Die gespeicherten Angaben, vollständig und als Text. */
function vsAngaben(roh) {
  const r = (roh && typeof roh === 'object') ? roh : {};
  const o = {};
  VS_FELDER.forEach(f => { o[f.key] = String(r[f.key] || '').trim(); });
  o.prozess = String(r.prozess || '');   // „WERK:id" des Prozesses für die ersten Stunden
  o.asset = String(r.asset || '');       // Id des Assets für den Beispielausfall
  return o;
}

/** „1. Sicherheit: …\n2. …" in einzelne Schritte, ohne die Nummern. */
function vsSchritte(text) {
  return String(text || '').split('\n').map(z => z.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
}

const _vsOffen = '<span class="vs-offen">offen</span>';
const _vsWert = (s) => (String(s || '').trim() ? _vsEsc(s) : _vsOffen);
const _vsAnzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

/**
 * Welches Asset der Beispielausfall zeigt: das gewählte, sonst ein ERP mit den
 * meisten wichtigen Prozessen (bei einem Angriff auf die IT das anschaulichste
 * Beispiel), sonst das Asset mit den meisten. `wahlen` ist danach sortiert.
 */
function vsAssetVorschlag(wahlen, gewaehlt) {
  const liste = wahlen || [];
  return liste.find(x => gewaehlt && x.id === gewaehlt)
    || liste.find(x => /(^|[^A-Za-z])(ERP|SAP)($|[^A-Za-z])/i.test(x.titel) && x.kritisch.length)
    || liste[0] || null;
}

function _vsFolie(key, inhalt, fuss) {
  return { key, html: `<section class="vs-folie vs-${key}" data-folie="${key}">${inhalt}${fuss ? `<p class="vs-fuss">${fuss}</p>` : ''}</section>` };
}

/**
 * Die Folien. `d` enthält nur Daten, keine Oberfläche:
 * { werkLabel, datum, angaben, kennzahlen:{kritisch,mitPlan,geuebt,stabOk,werke,stabFehlt},
 *   stab:{mitglieder:[{rolle,name,vertretung}], stufen:[{nr,label,erklaert,alarmiert}]}|null,
 *   prozess:{name,standAm,schritte:[]}|null, ausfall:{asset,stufe,erklaert,alarmiert,kritisch:[]}|null,
 *   phasen:[{titel,frage,reiter:[]}], luecken:[] }
 */
function vsFolien(d) {
  const a = d.angaben || vsAngaben({});
  const z = d.kennzahlen || {};
  const folien = [];

  folien.push(_vsFolie('titel',
    `<h1>${_vsEsc(a.titel || 'Notfallvorsorge und Cybersicherheit')}</h1><div class="vs-linie"></div>
     <p class="vs-unter">${_vsEsc(d.werkLabel)}, Stand ${_vsEsc(d.datum)}</p>`));

  folien.push(_vsFolie('zustaendig',
    `<h2>Zuständigkeit und Meldeweg</h2>
     <table class="vs-tabelle">
       <tr><td class="vs-frage">Ansprechpartner für Cybersecurity</td><td>${_vsWert(a.ansprechpartner)}</td></tr>
       <tr><td class="vs-frage">Vertretung</td><td>${_vsWert(a.vertretung)}</td></tr>
       <tr><td class="vs-frage">Wohin melden die Werke einen Vorfall?</td><td>${_vsWert(a.meldeweg)}</td></tr>
       <tr><td class="vs-frage">Wer koordiniert die ersten Maßnahmen?</td><td>${_vsWert(a.koordination)}</td></tr>
       <tr><td class="vs-frage">Wer informiert die Geschäftsführung?</td><td>${_vsWert(a.gfInfo)}</td></tr>
     </table>`));

  const karte = (zahl, text, warn) => `<div class="vs-karte${warn ? ' vs-warn' : ''}"><p class="vs-zahl">${zahl}</p><p>${text}</p></div>`;
  folien.push(_vsFolie('stand',
    `<h2>Wo wir beim Notfallplan stehen</h2>
     <div class="vs-karten">
       ${karte(z.kritisch || 0, 'wichtige Prozesse')}
       ${karte(z.mitPlan || 0, 'davon mit Notfallplan', (z.mitPlan || 0) < (z.kritisch || 0))}
       ${karte(z.geuebt || 0, 'davon geübt', (z.geuebt || 0) < (z.mitPlan || 0))}
       ${karte(`${z.stabOk || 0}/${z.werke || 0}`, 'Standorte mit vollständigem Krisenstab', (z.stabOk || 0) < (z.werke || 0))}
     </div>
     ${z.stabFehlt ? `<p class="vs-satz">${_vsAnzahl(z.stabFehlt, 'Standort hat', 'Standorte haben')} noch keinen Krisenstab.</p>` : ''}`,
    'Aus dem Reiter Notfall &amp; Krisenstab'));

  const s = d.stab;
  const stufe = (nr) => ((s && s.stufen) || []).find(x => x.nr === nr);
  const zeile = (nr) => {
    const st = stufe(nr);
    return st ? `<p><b>${_vsEsc(st.label)}.</b> Ausruf: ${_vsWert(st.erklaert)}. Alarmiert: ${_vsWert(st.alarmiert)}.</p>` : '';
  };
  folien.push(_vsFolie('krisenstab', s
    ? `<h2>Krisenstab ${_vsEsc(d.werkLabel)}</h2>
       <table class="vs-tabelle vs-eng">
         <tr><th>Rolle</th><th>Name</th><th>Vertretung</th></tr>
         ${s.mitglieder.map(m => `<tr><td class="vs-frage">${_vsEsc(m.rolle)}</td><td>${_vsWert(m.name)}</td><td>${_vsWert(m.vertretung)}</td></tr>`).join('')}
       </table>
       <div class="vs-unten">${zeile(2)}${zeile(3)}</div>`
    : `<h2>Krisenstab ${_vsEsc(d.werkLabel)}</h2><p class="vs-satz">Hier ist noch kein Krisenstab angelegt. ${_vsOffen}</p>`,
    'Aus dem Krisenstab im RMS'));

  const p = d.prozess;
  folien.push(_vsFolie('stunden', p && p.schritte.length
    ? `<h2>Die ersten Stunden: ${_vsEsc(p.name)}</h2>
       <div class="vs-karten">${p.schritte.slice(0, 4).map((t, i) => `<div class="vs-karte"><p class="vs-nr">${i + 1}</p><p>${_vsEsc(t)}</p></div>`).join('')}</div>`
    : `<h2>Die ersten Stunden</h2><p class="vs-satz">Es ist noch kein Notfallplan mit Sofortmaßnahmen ausgewählt. ${_vsOffen}</p>`,
    p ? `Sofortmaßnahmen aus dem Notfallplan im RMS${p.standAm ? ', Stand ' + _vsEsc(p.standAm) : ''}` : ''));

  const f = d.ausfall;
  folien.push(_vsFolie('ausfall', f
    ? `<h2>Beispielausfall: ${_vsEsc(f.asset)}</h2>
       <div class="vs-karten">
         ${karte(f.kritisch.length, f.kritisch.length === 1 ? 'wichtiger Prozess ist betroffen' : 'wichtige Prozesse sind betroffen', f.kritisch.length > 0)}
         <div class="vs-karte"><p>${f.kritisch.length ? f.kritisch.slice(0, 7).map(_vsEsc).join('<br>') + (f.kritisch.length > 7 ? `<br>und ${f.kritisch.length - 7} weitere` : '') : 'Kein wichtiger Prozess hängt an diesem Asset.'}</p></div>
       </div>
       <p class="vs-satz">Das RMS stuft den Ausfall als ${_vsEsc(f.stufe)} ein.${f.erklaert && f.erklaert !== '–' ? ` Ausruf: ${_vsEsc(f.erklaert)}.` : ''}</p>`
    : `<h2>Beispielausfall</h2><p class="vs-satz">Kein wichtiger Prozess ist mit einem Asset verknüpft. ${_vsOffen}</p>`,
    'Aus der Ausfall-Sicht'));

  folien.push(_vsFolie('phasen',
    `<h2>So arbeiten wir mit dem RMS</h2>
     <div class="vs-karten">${(d.phasen || []).map(ph => `<div class="vs-karte"><h3>${_vsEsc(ph.titel)}</h3><p>${_vsEsc(ph.frage)}</p><p class="vs-klein">${ph.reiter.slice(0, 5).map(_vsEsc).join(', ')}</p></div>`).join('')}</div>`,
    'Dieselbe Ordnung wie in der Seitenleiste'));

  const schritte = vsSchritte(a.schritte);
  folien.push(_vsFolie('weiter',
    `<h2>Was noch fehlt und wie es weitergeht</h2>
     <div class="vs-karten">
       <div class="vs-karte vs-warn"><h3>Fehlt noch</h3>${(d.luecken || []).length
         ? `<ul>${d.luecken.slice(0, 6).map(l => `<li>${_vsEsc(l)}</li>`).join('')}</ul>`
         : '<p>Keine offenen Punkte.</p>'}</div>
       <div class="vs-karte"><h3>Nächste Schritte</h3>
         <p><b>Entwurf bis:</b> ${_vsWert(a.termin)}</p>
         ${schritte.length ? `<ul>${schritte.slice(0, 6).map(t => `<li>${_vsEsc(t)}</li>`).join('')}</ul>` : `<p><b>Weitere Schritte:</b> ${_vsOffen}</p>`}
       </div>
     </div>`));

  return folien;
}

/* ── Daten aus dem RMS einsammeln ──────────────────────────────────────── */

/** Die vier Gruppen der Seitenleiste mit ihrer Frage und ihren Reitern. */
function vsPhasenAusLeiste() {
  const out = [];
  VS_PHASEN.forEach(k => {
    const kopf = document.getElementById('nav-grp-' + k);
    if (!kopf) return;
    const frageEl = kopf.querySelector('.nav-frage');
    const frage = frageEl ? frageEl.textContent.trim() : '';
    const titel = kopf.firstChild ? String(kopf.firstChild.textContent || '').trim() : '';
    const reiter = [];
    for (let el = kopf.nextElementSibling; el && !el.classList.contains('nav-sep'); el = el.nextElementSibling) {
      if (el.classList.contains('nav-item')) reiter.push(el.textContent.trim());
    }
    out.push({ titel, frage, reiter });
  });
  return out;
}

const _vsTag = (iso) => { const t = String(iso || '').slice(0, 10); return t ? t.split('-').reverse().join('.') : ''; };

/** Alle Prozesse, die sichtbar sind, als { werk, kachel }. */
function _vsKacheln() { return nfAlleKacheln(_lkDaten, _nfSichtbareWerke()); }

/** Assets, an denen ein wichtiger Prozess hängt, mit der Zahl der wichtigen Prozesse, die sie mitnehmen. */
function _vsAssetWahlen() {
  const ids = new Set();
  _vsKacheln().filter(x => nfIstKritisch(x.kachel)).forEach(x => nfBcmVon(x.kachel).assets.forEach(a => ids.add(_nfKanon(a.id))));
  return [...ids].map(id => {
    const opt = { kanon: _nfKanon, mit: _nfMitAusfall(id), assetRto: _nfAssetRtoMap() };
    const kritisch = nfAusfall(_lkDaten, id, _nfSichtbareWerke(), opt).filter(x => nfIstKritisch(x.kachel));
    const a = _nfAssetVon(id);
    return { id, opt, kritisch, titel: (a && (a.titel || a.title)) || id };
  }).sort((x, y) => (y.kritisch.length - x.kritisch.length) || x.titel.localeCompare(y.titel, 'de'));
}

function _vsProzessWahl(angaben) {
  const mitPlan = _vsKacheln().filter(x => nfHatPlan(x.kachel) && vsSchritte(nfBcmVon(x.kachel).plan.sofort).length);
  const fertigung = (x) => /fertigung|produktion|gie(ß|ss)erei/i.test(x.kachel.name);
  return mitPlan.find(x => `${x.werk}:${x.kachel.id}` === angaben.prozess)
    || mitPlan.find(x => x.werk === _lkWerk && nfIstKritisch(x.kachel) && fertigung(x))
    || mitPlan.find(x => nfIstKritisch(x.kachel) && fertigung(x))
    || mitPlan.find(x => nfIstKritisch(x.kachel))
    || null;
}

/** Was im Gespräch offen ist, in ganzen Sätzen. */
function _vsLuecken(stab, z) {
  const kritisch = _vsKacheln().filter(x => nfIstKritisch(x.kachel) && nfHatPlan(x.kachel));
  const ohneVerantwortung = kritisch.filter(x => !String(nfBcmVon(x.kachel).plan.verantwortlich || '').trim()).length;
  const ohneKontakte = kritisch.filter(x => !(nfBcmVon(x.kachel).plan.kontakte || []).length).length;
  const out = [];
  // Auf der Folie nur der erste Satz jeder Meldung.
  if (stab) nfStabLuecken(stab).slice(0, 2).forEach(l => out.push(l.split('. ')[0].replace(/\.?$/, '.')));
  else out.push('Für diesen Standort ist kein Krisenstab angelegt.');
  if (z.stabFehlt) out.push(`${_vsAnzahl(z.stabFehlt, 'Standort ist', 'Standorte sind')} ohne Krisenstab.`);
  if (ohneVerantwortung) out.push(`Bei ${_vsAnzahl(ohneVerantwortung, 'Notfallplan', 'Notfallplänen')} ist niemand verantwortlich.`);
  if (ohneKontakte) out.push(`${_vsAnzahl(ohneKontakte, 'Notfallplan hat', 'Notfallpläne haben')} keine Kontakte.`);
  if (z.mitPlan && !z.geuebt) out.push('Noch kein Notfallplan wurde geübt.');
  return out;
}

function vsDaten() {
  const werk = _lkWerk;
  const karte = ((_lkDaten.karten || {})[werk]) || {};
  const angaben = vsAngaben(nfDaten().vorstellung);
  const z = nfKennzahlen(_lkDaten, _nfUebungen || [], _nfSichtbareWerke(), nfPflichtWerke(), _nfAssetRtoMap());

  let stab = null;
  if (karte.krisenstab) {
    const s = nfStabVon(karte.krisenstab);
    stab = {
      mitglieder: s.mitglieder.map(m => ({ rolle: m.rolle, name: m.name ? _nfName(m.name) : '', vertretung: m.vertretung ? _nfName(m.vertretung) : '' })),
      stufen: nfAlarmierungVollstaendig(s.alarmierung).filter(r => r.nr).map(r => ({ nr: r.nr, label: (nfStufe(r.nr) || {}).label || r.stufe, erklaert: r.wer, alarmiert: r.tut })),
    };
  }

  const wp = _vsProzessWahl(angaben);
  let prozess = null;
  if (wp) {
    const b = nfBcmVon(wp.kachel);
    prozess = { name: wp.kachel.name + (wp.werk === 'KONZERN' ? '' : ` (${wp.werk})`), standAm: _vsTag(b.plan.standAm), schritte: vsSchritte(b.plan.sofort) };
  }

  const wahlen = _vsAssetWahlen();
  const wahl = vsAssetVorschlag(wahlen, angaben.asset ? _nfKanon(angaben.asset) : '');
  let ausfall = null;
  if (wahl) {
    const s = nfStufeBeiAusfall(_lkDaten, wahl.id, _nfSichtbareWerke(), wahl.opt);
    ausfall = {
      asset: wahl.titel.replace(/ \(ohne Prozess\)$/, ''),
      stufe: (s.stufe && s.stufe.label) || 'Störung',
      erklaert: (s.stufe && s.stufe.erklaert) || '',
      kritisch: wahl.kritisch.map(x => x.kachel.name + (x.werk === 'KONZERN' ? ' (Konzern)' : ` (${x.werk})`)),
    };
  }

  return {
    werkLabel: lkWerkLabel(werk),
    datum: new Date().toLocaleDateString('de-DE'),
    angaben,
    kennzahlen: { kritisch: z.kritisch, mitPlan: z.mitPlan, geuebt: z.geuebt, stabOk: z.stabOk, werke: z.werke, stabFehlt: z.stabFehlt },
    stab, prozess, ausfall,
    phasen: vsPhasenAusLeiste(),
    luecken: _vsLuecken(karte.krisenstab ? nfStabVon(karte.krisenstab) : null, z),
  };
}

/* ── Die Vorstellung am Bildschirm ─────────────────────────────────────── */

let _vsStand = { nr: 0, anzahl: 0 };

function vsOeffnen() {
  if (!_lkDaten) return;
  vsSchliessen();
  const folien = vsFolien(vsDaten());
  const root = document.createElement('div');
  root.className = 'vs-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Vorstellung');
  root.innerHTML = `
    <div class="vs-leiste">
      <button class="btn btn-sm btn-outline" onclick="vsBlaettern(-1)" title="Zurück (Pfeil links)">‹</button>
      <span class="vs-zaehler"></span>
      <button class="btn btn-sm btn-outline" onclick="vsBlaettern(1)" title="Weiter (Pfeil rechts)">›</button>
      <span class="vs-luft"></span>
      ${nfDarfSchreiben() ? '<button class="btn btn-sm btn-outline" onclick="vsAngabenBearbeiten()">Angaben ergänzen</button>' : ''}
      <button class="btn btn-sm btn-outline" onclick="vsDrucken()">Drucken / PDF</button>
      <button class="btn btn-sm btn-primary" onclick="vsSchliessen()">Schließen</button>
    </div>
    <div class="vs-buehne">${folien.map(f => f.html).join('')}</div>`;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  _vsStand = { nr: Math.min(_vsStand.nr, folien.length - 1), anzahl: folien.length };
  document.addEventListener('keydown', _vsTaste);
  window.addEventListener('resize', _vsSkalieren);
  _vsZeigen();
  _vsSkalieren();
}

function vsSchliessen() {
  const alt = document.querySelector('.vs-root');
  if (alt) { alt.remove(); document.body.style.overflow = ''; }
  document.removeEventListener('keydown', _vsTaste);
  window.removeEventListener('resize', _vsSkalieren);
}

function vsBlaettern(schritt) {
  _vsStand.nr = Math.max(0, Math.min(_vsStand.anzahl - 1, _vsStand.nr + schritt));
  _vsZeigen();
}

function _vsZeigen() {
  const root = document.querySelector('.vs-root');
  if (!root) return;
  root.querySelectorAll('.vs-folie').forEach((f, i) => f.classList.toggle('vs-aktiv', i === _vsStand.nr));
  const z = root.querySelector('.vs-zaehler');
  if (z) z.textContent = `${_vsStand.nr + 1} / ${_vsStand.anzahl}`;
}

/** Die Folie ist 1600 × 900 und wird in den freien Platz eingepasst. */
function _vsSkalieren() {
  const root = document.querySelector('.vs-root');
  if (!root) return;
  const buehne = root.querySelector('.vs-buehne');
  const k = Math.min(buehne.clientWidth / 1600, buehne.clientHeight / 900);
  root.style.setProperty('--vs-skala', String(k > 0 ? k : 1));
}

function _vsTaste(e) {
  // Der Angaben-Dialog liegt darüber: Dort tippt man, und sein Escape schließt nur ihn
  // (er hört vorher und markiert das Ereignis als verbraucht).
  if (e.defaultPrevented || document.querySelector('#modal-mount .modal')) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); vsBlaettern(1); }
  else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); vsBlaettern(-1); }
  else if (e.key === 'Escape') vsSchliessen();
}

function vsDrucken() {
  const stil = document.createElement('style');
  stil.textContent = '@page { size: 297mm 167mm; margin: 0 }';
  document.head.appendChild(stil);
  document.body.classList.add('vs-drucken');
  const fertig = () => { document.body.classList.remove('vs-drucken'); stil.remove(); window.removeEventListener('afterprint', fertig); };
  window.addEventListener('afterprint', fertig);
  window.print();
}

/** Der Dialog für alles, was nicht in den Registern steht. */
function vsAngabenBearbeiten() {
  if (!nfDarfSchreiben()) return;
  const a = vsAngaben(nfDaten().vorstellung);
  const feld = (f) => `<label class="field-label" style="display:block;margin-top:10px">${_vsEsc(f.label)}</label>${
    f.typ === 'text'
      ? `<textarea id="vs-f-${f.key}" rows="3" style="width:100%">${_vsEsc(a[f.key])}</textarea>`
      : `<input id="vs-f-${f.key}" style="width:100%" value="${_vsEsc(a[f.key])}" placeholder="${_vsEsc(f.platzhalter || '')}">`}`;
  const prozesse = _vsKacheln().filter(x => nfHatPlan(x.kachel) && vsSchritte(nfBcmVon(x.kachel).plan.sofort).length);
  const assets = _vsAssetWahlen();
  const option = (wert, text, gewaehlt) => `<option value="${_vsEsc(wert)}"${wert === gewaehlt ? ' selected' : ''}>${_vsEsc(text)}</option>`;
  openModal(`
    <div class="modal-header"><h3>Angaben für die Vorstellung</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p class="field-hint">Gespeichert wird in der Landkarte auf SharePoint. Leere Felder erscheinen auf den Folien als „offen".</p>
      ${VS_FELDER.map(feld).join('')}
      <label class="field-label" style="display:block;margin-top:10px">Notfallplan für die ersten Stunden</label>
      <select id="vs-f-prozess" style="width:100%">${option('', 'Automatisch (Fertigung)', a.prozess)}${prozesse.map(x => option(`${x.werk}:${x.kachel.id}`, `${x.kachel.name} (${lkWerkLabel(x.werk)})`, a.prozess)).join('')}</select>
      <label class="field-label" style="display:block;margin-top:10px">Asset für den Beispielausfall</label>
      <select id="vs-f-asset" style="width:100%">${option('', 'Automatisch (zuerst ein ERP, sonst das mit den meisten wichtigen Prozessen)', a.asset)}${assets.map(x => option(x.id, `${x.titel} (${x.kritisch.length})`, a.asset)).join('')}</select>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">Abbrechen</button><button class="btn btn-primary" onclick="vsAngabenSpeichern()">Speichern</button></div>`, true);
}

async function vsAngabenSpeichern() {
  if (!nfDarfSchreiben()) return;
  const wert = (k) => { const el = document.getElementById('vs-f-' + k); return el ? el.value : ''; };
  const neu = {};
  VS_FELDER.forEach(f => { neu[f.key] = wert(f.key).trim(); });
  neu.prozess = wert('prozess');
  neu.asset = wert('asset');
  nfDaten().vorstellung = neu;
  closeModal();
  if (await lkSpeichern('Angaben zur Vorstellung gespeichert ✓', 'Notfall: Angaben zur Vorstellung geändert', 'notfall')) vsOeffnen();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VS_FELDER, vsAngaben, vsSchritte, vsFolien, vsAssetVorschlag };
}
