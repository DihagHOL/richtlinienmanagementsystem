'use strict';

/**
 * C-Level-Bericht der Landkarte
 * =============================
 * Der Knopf „📊 C-Level-Bericht“ in der Leiste einer Karte mit Ketten erzeugt
 * aus den Daten eine Druckfassung für die Geschäftsführung. Kompakt, etwa zwei
 * Seiten: Kennzahlen, Prozesseigner je Kette, offene Entscheidungen und die
 * Verantwortungsketten im Betrieb. Die BIA und die abgelösten Karten stehen
 * vorerst nicht darin, die vollständige Prozessliste steht in der Landkarte.
 *
 * lkBerichtDaten und lkBerichtHtml sind rein (getestet ohne Browser),
 * lkBerichtOeffnen ist der Knopf. Gerechnet wird wie in der Landkarte: Ketten
 * (art „kette“) und abgelöste Karten zählen nicht als Prozess, der Eigner einer
 * Kette ist der Prozesseigner oder, solange keiner gesetzt ist, die
 * verantwortliche Person.
 */

/**
 * Ein Name statt einer Adresse: „e.von.muster@…“ wird „E. von Muster“. Für
 * Bericht und Gesamtkarte, wenn die Mitgliederliste jemanden nicht kennt
 * (etwa ein Gastkonto). Ohne @ bleibt der Text, wie er ist.
 */
function lkNameAusAdresse(s) {
  const t = String(s || '').trim();
  return !/@/.test(t) ? t : t.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map(x => /^(von|van|de|der|zu|vom)$/i.test(x) ? x.toLowerCase()
      : (x.length === 1 ? x.toUpperCase() + '.' : x[0].toUpperCase() + x.slice(1))).join(' ');
}

/** Die Zahlen und Listen des Berichts. opt: { personName(upn), stand, werkLabel } */
function lkBerichtDaten(daten, werk, opt) {
  const o = opt || {};
  // Ein gedruckter Bericht nennt Namen, nie Adressen.
  const name = (u) => { const s = String(u || '').trim(); return s ? lkNameAusAdresse(String((o.personName && o.personName(s)) || s)) : ''; };
  const karte = (daten && daten.karten && daten.karten[werk]) || { baender: [], kacheln: [] };
  const kacheln = Array.isArray(karte.kacheln) ? karte.kacheln : [];
  const baender = (Array.isArray(karte.baender) ? karte.baender : []).filter(b => !b.archiv);
  const nachId = new Map(kacheln.map(k => [k.id, k]));
  const istKette = (k) => !!k && k.art === 'kette';
  const istAbgeloest = (k) => !!(k && k.abgeloest);
  const istProzess = (k) => !!k && !istKette(k) && !istAbgeloest(k) && k.typ !== 'kategorie';
  const nr = (k) => (Number.isFinite(Number(k.nr)) && k.nr !== '' && k.nr != null) ? 'P-' + String(k.nr).padStart(3, '0') : '';
  const kinder = (kt) => (Array.isArray(kt.verweise) ? kt.verweise : [])
    .filter(v => v && v.art === 'unterprozess')
    .map(v => { const z = String(v.ziel || ''); const i = z.indexOf(':'); return nachId.get(i >= 0 ? z.slice(i + 1) : z); })
    .filter(istProzess);
  const eigner = (kt) => String(kt.prozesseigner || '').trim() || String(kt.verantwortlich || '').trim();
  const offenGeltung = (k) => Array.isArray(k.offen) && k.offen.includes('geltung');

  const ketten = kacheln.filter(istKette);
  const prozesse = kacheln.filter(istProzess);
  const ketteVon = new Map();
  ketten.forEach(kt => kinder(kt).forEach(p => ketteVon.set(p.id, (ketteVon.get(p.id) || []).concat(kt))));

  const zeileKette = (kt) => {
    const ps = kinder(kt);
    return { nr: nr(kt), name: kt.name || '', eigner: name(eigner(kt)), prozesse: ps.length,
      modelliert: ps.filter(p => Array.isArray(p.prozesse) && p.prozesse.length).length };
  };
  const bereiche = baender.map(b => ({ titel: b.titel || b.key, ketten: ketten.filter(k => k.band === b.key).map(zeileKette) }))
    .filter(b => b.ketten.length);

  const verantwortung = prozesse.filter(p => p.kette && Array.isArray(p.kette.werke) && p.kette.werke.length).map(p => ({
    nr: nr(p), name: p.name || '', kette: ((ketteVon.get(p.id) || [])[0] || {}).name || '',
    werke: p.kette.werke.slice(), rollen: (Array.isArray(p.kette.rollen) ? p.kette.rollen : []).slice() }));

  const ohneEigner = ketten.filter(k => !eigner(k));
  const ohneProzesse = ketten.filter(k => !kinder(k).length);
  const ohneStandard = ketten.filter(k => !String(k.standardisierung || '').trim());
  const geltungOffen = kacheln.filter(k => !istAbgeloest(k) && offenGeltung(k));
  const ohneKette = ketten.length ? prozesse.filter(p => !ketteVon.has(p.id)) : [];
  const mehrfach = prozesse.filter(p => (ketteVon.get(p.id) || []).length > 1);
  const liste = (xs) => xs.map(k => `${nr(k) ? nr(k) + ' ' : ''}${k.name}`).join(', ');

  const eins = (n, einzahl, mehrzahl) => `${n} ${n === 1 ? einzahl : mehrzahl}`;
  const offen = [];
  if (ohneEigner.length) offen.push({ titel: 'Prozesseigner benennen', text: `${ohneEigner.length} von ${ketten.length} Ketten ${ohneEigner.length === 1 ? 'hat' : 'haben'} noch keinen Prozesseigner: ${liste(ohneEigner)}.` });
  if (ketten.length) offen.push({ titel: 'Ziel aus der Unternehmensstrategie', text: ketten.length === 1 ? 'Für die Kette noch offen.' : `Für alle ${ketten.length} Ketten noch offen.` });
  if (ohneStandard.length) offen.push({ titel: 'Standardisierungsgrad', text: `Für ${ohneStandard.length} von ${ketten.length} Ketten offen (gruppeneinheitlich, einheitlicher Rahmen oder werksspezifisch).` });
  if (geltungOffen.length) offen.push({ titel: 'Geltungsbereich', text: `Bei ${eins(geltungOffen.length, 'Kachel', 'Kacheln')} ist noch offen, für welche Gesellschaften sie gelten.` });
  if (ohneProzesse.length) offen.push({ titel: 'Ketten ohne Prozesse', text: `${eins(ohneProzesse.length, 'Kette hat', 'Ketten haben')} noch keine Prozesse der Ebene 2: ${liste(ohneProzesse)}.` });
  if (ohneKette.length) offen.push({ titel: 'Prozesse ohne Kette', text: `${eins(ohneKette.length, 'Prozess hängt', 'Prozesse hängen')} an keiner Kette: ${liste(ohneKette)}.` });
  if (mehrfach.length) offen.push({ titel: 'Prozesse in zwei Ketten', text: `${liste(mehrfach)}.` });

  return {
    werk, werkLabel: o.werkLabel || werk, stand: o.stand || '',
    zahlen: { bereiche: bereiche.length, ketten: ketten.length, prozesse: prozesse.length,
      modelliert: prozesse.filter(p => Array.isArray(p.prozesse) && p.prozesse.length).length,
      mitEigner: ketten.length - ohneEigner.length },
    bereiche, verantwortung, offen,
  };
}

/** Die Druckfassung. o: { kopf (druckKopf), schrift: [woff2-Adressen] } */
function lkBerichtHtml(m, o) {
  const opt = o || {};
  const e = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const z = m.zahlen;
  const offenTag = '<span class="offen">offen</span>';
  const kachel = (zahl, text, farbe) => `<div class="kz"><div class="kz-zahl" style="color:${farbe}">${zahl}</div><div class="kz-text">${text}</div></div>`;
  const schrift = (Array.isArray(opt.schrift) ? opt.schrift : []).map(u =>
    `@font-face { font-family: 'Exo'; src: url('${e(u)}') format('woff2'); font-weight: 100 900; }`).join('\n');
  const eignerZeilen = m.bereiche.map(b => `<tr class="bereich"><td colspan="4">${e(b.titel)}</td></tr>` + b.ketten.map(k =>
    `<tr><td class="nr">${e(k.nr)}</td><td>${e(k.name)}</td><td>${k.eigner ? `<b>${e(k.eigner)}</b>` : offenTag}</td>
      <td class="zahl">${k.prozesse ? `${k.prozesse} <span class="klein">(${k.modelliert} modelliert)</span>` : '<span class="klein">noch keine</span>'}</td></tr>`).join('')).join('');
  const vkZeilen = m.verantwortung.map(p => `<tr><td class="nr">${e(p.nr)}</td><td><b>${e(p.name)}</b><br><span class="klein">${e(p.kette)}</span></td>
    <td>${e(p.werke.join(', '))}</td><td>${e(p.rollen.join(', '))}</td></tr>`).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>C-Level-Bericht Prozesslandkarte ${e(m.werkLabel)} (${e(m.stand)})</title>
<style>
${schrift}
@page { size: A4; margin: 15mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: Exo, 'Segoe UI', Arial, sans-serif; color: #424241; font-size: 10pt; line-height: 1.45; margin: 24px; }
@media print { body { margin: 0; } .noprint { display: none; } thead { display: table-header-group; } tr, .kz, li { break-inside: avoid; } h2 { break-after: avoid; } }
.noprint { margin: 0 0 14px; }
.titel { background: #1A2644; color: #fff; padding: 14px 16px 12px; border-bottom: 4px solid #F08300; margin: 10px 0 12px; }
.titel .ueber { color: #99B7CD; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; }
.titel h1 { margin: 2px 0 3px; font-size: 19pt; line-height: 1.2; }
.titel .unter { color: #99B7CD; font-size: 9pt; }
h2 { color: #1A2644; font-size: 12.5pt; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #99B7CD; }
p { margin: 0 0 7px; }
.klein { font-size: 8pt; color: #6b7280; }
.offen { color: #b45309; font-weight: 600; }
.kzs { display: flex; gap: 6px; margin: 0 0 10px; }
.kz { flex: 1; border: 1px solid #DCE3EC; border-top: 3px solid #17509E; padding: 6px 8px; }
.kz-zahl { font-size: 16pt; font-weight: 800; line-height: 1.1; }
.kz-text { font-size: 8pt; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; }
th { background: #1A2644; color: #fff; text-align: left; font-weight: 600; font-size: 8.5pt; padding: 5px 6px; }
td { border-bottom: 1px solid #E5E9F0; padding: 4px 6px; vertical-align: top; font-size: 9pt; }
tr.bereich td { background: #EAF1FA; color: #17509E; font-weight: 700; }
td.nr { white-space: nowrap; color: #17509E; font-weight: 600; width: 48px; }
td.zahl { white-space: nowrap; }
ol { margin: 4px 0 0; padding-left: 18px; } li { margin: 0 0 5px; } li b { color: #1A2644; }
.fuss { margin-top: 14px; font-size: 8pt; color: #6b7280; border-top: 1px solid #DCE3EC; padding-top: 6px; }
</style></head><body>
<div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:13px;cursor:pointer">🖨 Drucken / als PDF speichern</button></div>
${opt.kopf || ''}
<div class="titel"><div class="ueber">Bericht für die Geschäftsführung · Intern</div>
  <h1>Prozesslandkarte ${e(m.werkLabel)}</h1>
  <div class="unter">Stand ${e(m.stand)} · aus den Daten des RMS erzeugt</div></div>
<div class="kzs">
  ${kachel(z.bereiche, 'Bereiche (Ebene 0)', '#1A2644')}
  ${kachel(z.ketten, 'Ketten (Ebene 1)', '#17509E')}
  ${kachel(z.prozesse, 'Prozesse (Ebene 2)', '#17509E')}
  ${kachel(z.modelliert, 'mit BPMN-Modell (Ebene 3)', '#17509E')}
  ${kachel(`${z.mitEigner}/${z.ketten}`, 'Ketten mit Prozesseigner', z.ketten && z.mitEigner === z.ketten ? '#15803d' : '#F08300')}
</div>
<h2>Prozesseigner je Kette</h2>
<table><thead><tr><th>Nr.</th><th>Kette</th><th>Prozesseigner der Gruppe</th><th>Prozesse</th></tr></thead>
<tbody>${eignerZeilen || '<tr><td colspan="4">Diese Karte hat noch keine Ketten.</td></tr>'}</tbody></table>
<h2>Offene Entscheidungen</h2>
${m.offen.length ? `<ol>${m.offen.map(x => `<li><b>${e(x.titel)}:</b> ${e(x.text)}</li>`).join('')}</ol>` : '<p>Keine.</p>'}
${m.verantwortung.length ? `<h2>Verantwortungsketten im Betrieb</h2>
<table><thead><tr><th>Nr.</th><th>Prozess und Kette</th><th>Gesellschaften</th><th>Rollen</th></tr></thead><tbody>${vkZeilen}</tbody></table>` : ''}
<div class="fuss">Erzeugt aus der Prozesslandkarte des RMS. Die vollständige Liste aller Prozesse steht in der Landkarte.</div>
</body></html>`;
}

/** Der Knopf: Fenster sofort öffnen (sonst greift der Pop-up-Blocker), dann füllen. */
async function lkBerichtOeffnen() {
  const w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Bitte Pop-ups für diese Seite erlauben.', 'error'); return; }
  w.document.write('<p style="font-family:Arial,sans-serif;margin:24px">Bericht wird erstellt …</p>');
  // Die Namen der Eigner: Ohne Mitarbeiterliste stünden dort Mailadressen.
  if (typeof _lkMembers !== 'undefined' && !_lkMembers && typeof spGetMembers === 'function') {
    try { _lkMembers = (await spGetMembers()) || []; } catch (e) { /* dann eben mit Adresse */ }
  }
  const m = lkBerichtDaten(_lkDaten, _lkWerk, {
    personName: lkPersonName, werkLabel: lkWerkLabel(_lkWerk),
    stand: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  });
  const html = lkBerichtHtml(m, {
    kopf: druckKopf('Prozessmanagement'),
    // Eine Datei: Exo „latin“ enthält alles fürs Deutsche (äöüß, „“, –).
    schrift: [rmsAssetUrl('fonts/exo-latin.woff2')],
  });
  w.document.open();
  w.document.write(html);
  w.document.close();
}

if (typeof module !== 'undefined' && module.exports) module.exports = { lkBerichtDaten, lkBerichtHtml, lkNameAusAdresse };
