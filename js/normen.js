'use strict';

/**
 * Normen-Katalog: ISO/IEC 27001:2022 (Klauseln 4–10 + Annex A, 93 Controls)
 * und NIS2 (Richtlinie (EU) 2022/2555). Rein statische Referenzdaten – keine
 * externen Dienste, keine KI. Grundlage für den „Normbezug" je Richtlinie und
 * die ISMS-Abdeckungs-Heatmap.
 */

const NORMEN = [
  { group: 'ISO 27001 – Klauseln (Managementsystem)', items: [
    { id: '4.1',  label: 'Verstehen der Organisation und ihres Kontexts' },
    { id: '4.2',  label: 'Erfordernisse und Erwartungen interessierter Parteien' },
    { id: '4.3',  label: 'Festlegen des Anwendungsbereichs des ISMS' },
    { id: '4.4',  label: 'Informationssicherheits-Managementsystem' },
    { id: '5.1',  label: 'Führung und Verpflichtung' },
    { id: '5.2',  label: 'Politik' },
    { id: '5.3',  label: 'Rollen, Verantwortlichkeiten und Befugnisse' },
    { id: '6.1',  label: 'Maßnahmen zum Umgang mit Risiken und Chancen' },
    { id: '6.2',  label: 'Informationssicherheitsziele und Planung zu deren Erreichung' },
    { id: '6.3',  label: 'Planung von Änderungen' },
    { id: '7.1',  label: 'Ressourcen' },
    { id: '7.2',  label: 'Kompetenz' },
    { id: '7.3',  label: 'Bewusstsein' },
    { id: '7.4',  label: 'Kommunikation' },
    { id: '7.5',  label: 'Dokumentierte Information' },
    { id: '8.1',  label: 'Betriebliche Planung und Steuerung' },
    { id: '8.2',  label: 'Informationssicherheitsrisikobeurteilung' },
    { id: '8.3',  label: 'Informationssicherheitsrisikobehandlung' },
    { id: '9.1',  label: 'Überwachung, Messung, Analyse und Bewertung' },
    { id: '9.2',  label: 'Internes Audit' },
    { id: '9.3',  label: 'Managementbewertung' },
    { id: '10.1', label: 'Fortlaufende Verbesserung' },
    { id: '10.2', label: 'Nichtkonformität und Korrekturmaßnahmen' },
  ] },
  { group: 'Annex A.5 – Organisatorische Controls', items: [
    { id: 'A.5.1',  label: 'Informationssicherheitsrichtlinien' },
    { id: 'A.5.2',  label: 'Informationssicherheitsrollen und -verantwortlichkeiten' },
    { id: 'A.5.3',  label: 'Aufgabentrennung' },
    { id: 'A.5.4',  label: 'Verantwortung des Managements' },
    { id: 'A.5.5',  label: 'Kontakt mit Behörden' },
    { id: 'A.5.6',  label: 'Kontakt mit speziellen Interessengruppen' },
    { id: 'A.5.7',  label: 'Bedrohungsanalyse (Threat Intelligence)' },
    { id: 'A.5.8',  label: 'Informationssicherheit im Projektmanagement' },
    { id: 'A.5.9',  label: 'Inventar der Informationen und anderer damit verbundener Werte' },
    { id: 'A.5.10', label: 'Akzeptable Nutzung von Informationen und anderen Werten' },
    { id: 'A.5.11', label: 'Rückgabe von Werten' },
    { id: 'A.5.12', label: 'Klassifizierung von Informationen' },
    { id: 'A.5.13', label: 'Kennzeichnung von Informationen' },
    { id: 'A.5.14', label: 'Informationsübertragung' },
    { id: 'A.5.15', label: 'Zugangssteuerung' },
    { id: 'A.5.16', label: 'Identitätsmanagement' },
    { id: 'A.5.17', label: 'Authentisierungsinformationen' },
    { id: 'A.5.18', label: 'Zugangsrechte' },
    { id: 'A.5.19', label: 'Informationssicherheit in Lieferantenbeziehungen' },
    { id: 'A.5.20', label: 'Behandlung der Informationssicherheit in Lieferantenvereinbarungen' },
    { id: 'A.5.21', label: 'Umgang mit der Informationssicherheit in der IKT-Lieferkette' },
    { id: 'A.5.22', label: 'Überwachung, Überprüfung und Änderung von Lieferantendienstleistungen' },
    { id: 'A.5.23', label: 'Informationssicherheit bei der Nutzung von Cloud-Diensten' },
    { id: 'A.5.24', label: 'Planung und Vorbereitung der Handhabung von Informationssicherheitsvorfällen' },
    { id: 'A.5.25', label: 'Beurteilung und Entscheidung über Informationssicherheitsereignisse' },
    { id: 'A.5.26', label: 'Reaktion auf Informationssicherheitsvorfälle' },
    { id: 'A.5.27', label: 'Erkenntnisse aus Informationssicherheitsvorfällen' },
    { id: 'A.5.28', label: 'Sammeln von Beweismaterial' },
    { id: 'A.5.29', label: 'Informationssicherheit während einer Störung' },
    { id: 'A.5.30', label: 'IKT-Bereitschaft für Business Continuity' },
    { id: 'A.5.31', label: 'Rechtliche, gesetzliche, regulatorische und vertragliche Anforderungen' },
    { id: 'A.5.32', label: 'Geistige Eigentumsrechte' },
    { id: 'A.5.33', label: 'Schutz von Aufzeichnungen' },
    { id: 'A.5.34', label: 'Privatsphäre und Schutz personenbezogener Daten (PII)' },
    { id: 'A.5.35', label: 'Unabhängige Überprüfung der Informationssicherheit' },
    { id: 'A.5.36', label: 'Einhaltung von Richtlinien, Regeln und Standards' },
    { id: 'A.5.37', label: 'Dokumentierte Betriebsabläufe' },
  ] },
  { group: 'Annex A.6 – Personenbezogene Controls', items: [
    { id: 'A.6.1', label: 'Sicherheitsüberprüfung (Screening)' },
    { id: 'A.6.2', label: 'Beschäftigungs- und Arbeitsvertragsbedingungen' },
    { id: 'A.6.3', label: 'Informationssicherheitsbewusstsein, -ausbildung und -schulung' },
    { id: 'A.6.4', label: 'Maßregelungsprozess (Disziplinarverfahren)' },
    { id: 'A.6.5', label: 'Verantwortlichkeiten bei Beendigung/Änderung der Beschäftigung' },
    { id: 'A.6.6', label: 'Vertraulichkeits- oder Geheimhaltungsvereinbarungen' },
    { id: 'A.6.7', label: 'Remote-Arbeit (Telearbeit)' },
    { id: 'A.6.8', label: 'Meldung von Informationssicherheitsereignissen' },
  ] },
  { group: 'Annex A.7 – Physische Controls', items: [
    { id: 'A.7.1',  label: 'Physische Sicherheitsperimeter' },
    { id: 'A.7.2',  label: 'Physischer Zutritt' },
    { id: 'A.7.3',  label: 'Sicherung von Büros, Räumen und Einrichtungen' },
    { id: 'A.7.4',  label: 'Physische Sicherheitsüberwachung' },
    { id: 'A.7.5',  label: 'Schutz vor physischen und umweltbedingten Bedrohungen' },
    { id: 'A.7.6',  label: 'Arbeiten in Sicherheitsbereichen' },
    { id: 'A.7.7',  label: 'Aufgeräumter Arbeitsplatz und Bildschirmsperre' },
    { id: 'A.7.8',  label: 'Platzierung und Schutz von Geräten' },
    { id: 'A.7.9',  label: 'Sicherheit von Werten außerhalb der Räumlichkeiten' },
    { id: 'A.7.10', label: 'Speichermedien' },
    { id: 'A.7.11', label: 'Versorgungseinrichtungen' },
    { id: 'A.7.12', label: 'Sicherheit der Verkabelung' },
    { id: 'A.7.13', label: 'Instandhaltung von Geräten' },
    { id: 'A.7.14', label: 'Sichere Entsorgung oder Wiederverwendung von Geräten' },
  ] },
  { group: 'Annex A.8 – Technologische Controls', items: [
    { id: 'A.8.1',  label: 'Endgeräte der Benutzer' },
    { id: 'A.8.2',  label: 'Privilegierte Zugangsrechte' },
    { id: 'A.8.3',  label: 'Informationszugangsbeschränkung' },
    { id: 'A.8.4',  label: 'Zugang zum Quellcode' },
    { id: 'A.8.5',  label: 'Sichere Authentisierung' },
    { id: 'A.8.6',  label: 'Kapazitätssteuerung' },
    { id: 'A.8.7',  label: 'Schutz gegen Schadsoftware' },
    { id: 'A.8.8',  label: 'Handhabung von technischen Schwachstellen' },
    { id: 'A.8.9',  label: 'Konfigurationsmanagement' },
    { id: 'A.8.10', label: 'Löschung von Informationen' },
    { id: 'A.8.11', label: 'Datenmaskierung' },
    { id: 'A.8.12', label: 'Verhinderung von Datenlecks (DLP)' },
    { id: 'A.8.13', label: 'Sicherung von Informationen (Backup)' },
    { id: 'A.8.14', label: 'Redundanz von informationsverarbeitenden Einrichtungen' },
    { id: 'A.8.15', label: 'Protokollierung (Logging)' },
    { id: 'A.8.16', label: 'Überwachungsaktivitäten' },
    { id: 'A.8.17', label: 'Uhrensynchronisation' },
    { id: 'A.8.18', label: 'Nutzung von privilegierten Hilfsprogrammen' },
    { id: 'A.8.19', label: 'Installation von Software auf Systemen im Betrieb' },
    { id: 'A.8.20', label: 'Netzwerksicherheit' },
    { id: 'A.8.21', label: 'Sicherheit von Netzwerkdiensten' },
    { id: 'A.8.22', label: 'Trennung von Netzwerken' },
    { id: 'A.8.23', label: 'Webfilterung' },
    { id: 'A.8.24', label: 'Nutzung von Kryptographie' },
    { id: 'A.8.25', label: 'Lebenszyklus einer sicheren Entwicklung' },
    { id: 'A.8.26', label: 'Anforderungen an die Anwendungssicherheit' },
    { id: 'A.8.27', label: 'Sichere Systemarchitektur und Engineering-Prinzipien' },
    { id: 'A.8.28', label: 'Sichere Codierung' },
    { id: 'A.8.29', label: 'Sicherheitsprüfung bei Entwicklung und Abnahme' },
    { id: 'A.8.30', label: 'Ausgegliederte Entwicklung' },
    { id: 'A.8.31', label: 'Trennung von Entwicklungs-, Test- und Produktivumgebungen' },
    { id: 'A.8.32', label: 'Änderungssteuerung' },
    { id: 'A.8.33', label: 'Testinformationen' },
    { id: 'A.8.34', label: 'Schutz von Informationssystemen während Audittests' },
  ] },
  { group: 'NIS2 (Richtlinie (EU) 2022/2555)', items: [
    { id: 'NIS2-20',     label: 'Art. 20 – Governance / Verantwortung der Leitungsorgane' },
    { id: 'NIS2-21.2a',  label: 'Art. 21(2a) – Risikoanalyse & Sicherheit der Informationssysteme' },
    { id: 'NIS2-21.2b',  label: 'Art. 21(2b) – Bewältigung von Sicherheitsvorfällen' },
    { id: 'NIS2-21.2c',  label: 'Art. 21(2c) – Business Continuity, Backup, Krisenmanagement' },
    { id: 'NIS2-21.2d',  label: 'Art. 21(2d) – Sicherheit der Lieferkette' },
    { id: 'NIS2-21.2e',  label: 'Art. 21(2e) – Sicherheit bei Beschaffung/Entwicklung/Wartung' },
    { id: 'NIS2-21.2f',  label: 'Art. 21(2f) – Bewertung der Wirksamkeit der Maßnahmen' },
    { id: 'NIS2-21.2g',  label: 'Art. 21(2g) – Cyberhygiene & Schulung' },
    { id: 'NIS2-21.2h',  label: 'Art. 21(2h) – Kryptographie und Verschlüsselung' },
    { id: 'NIS2-21.2i',  label: 'Art. 21(2i) – Personalsicherheit, Zugriffskontrolle, Asset-Mgmt.' },
    { id: 'NIS2-21.2j',  label: 'Art. 21(2j) – MFA & gesicherte Kommunikation' },
    { id: 'NIS2-23',     label: 'Art. 23 – Meldepflichten (24 h / 72 h / 1 Monat)' },
  ] },
];

/* Flache Nachschlage-Tabelle id → Label + Set gültiger IDs. */
const NORMEN_LABEL = {};
const NORMEN_IDS = new Set();
for (const g of NORMEN) for (const it of g.items) { NORMEN_LABEL[it.id] = it.label; NORMEN_IDS.add(it.id); }

/** Gruppe (Kurzname) zu einer Control-ID – für Heatmap-Einfärbung/Legende. */
function normGroupOf(id) {
  if (/^A\.5\./.test(id)) return 'A.5';
  if (/^A\.6\./.test(id)) return 'A.6';
  if (/^A\.7\./.test(id)) return 'A.7';
  if (/^A\.8\./.test(id)) return 'A.8';
  if (/^NIS2/.test(id))   return 'NIS2';
  return 'Klausel';
}

/** Anzeigetext „ID — Label" (unbekannte IDs bleiben lesbar). */
function normLabel(id) { return NORMEN_LABEL[id] ? (id + ' — ' + NORMEN_LABEL[id]) : id; }

/* ═══════════════════════════════════════════════════
   Seed aus der Review-Mail (Max Muster) – Ein-Klick-Vorbefüllung
═══════════════════════════════════════════════════ */
const NORMBEZUG_SEED = {
  leitlinie:        ['5.1', '5.2', '5.3', '10.1', '10.2', 'A.5.1', 'A.5.4'],
  auditmanagement:  ['9.2', '10.1', '10.2', '9.1', 'A.5.35', 'A.5.36', 'A.5.31', 'A.5.22', 'A.6.6', 'A.5.34', 'A.8.8'],
  zieleplanung:     ['6.2', '6.1', '9.1', '9.3', '5.2', '10.1', 'A.5.1'],
  changemanagement: ['A.8.32', '6.3', 'A.8.9', 'A.5.37', 'A.8.8', 'A.5.24', 'A.5.36'],
  verhaltenskodex:  ['A.5.1', 'A.5.4', 'A.5.10', 'A.5.31', 'A.5.34', 'A.6.2', 'A.6.4', 'A.6.6', 'A.6.8', 'A.5.24'],
};

/** Passt der Titel einer Richtlinie zu einem Seed? → Liste der Control-IDs (Kopie) oder null. */
function normbezugSeedFor(title) {
  const t = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  let key = null;
  if (t.includes('leitlinie')) key = 'leitlinie';
  else if (t.includes('audit')) key = 'auditmanagement';
  else if (t.includes('ziele')) key = 'zieleplanung';
  else if (t.includes('change')) key = 'changemanagement';
  else if (t.includes('verhaltenskodex') || t.includes('scopedokument') || t.includes('sicherheitsvorf')) key = 'verhaltenskodex';
  return key ? NORMBEZUG_SEED[key].slice() : null;
}

/* Node-Export nur für Tests (im Browser wirkungslos). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NORMEN, NORMEN_LABEL, NORMEN_IDS, normGroupOf, normLabel, NORMBEZUG_SEED, normbezugSeedFor };
}
