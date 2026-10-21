'use strict';

/**
 * Normen-Katalog
 * ==============
 * Rein statische Referenzdaten – keine externen Dienste, keine KI. Grundlage
 * für den „Normbezug" je Regelwerk, die Abdeckungs-Heatmap und die SoA.
 *
 * Der Katalog begann als reiner ISMS-Katalog (ISO/IEC 27001:2022 + NIS2). Das
 * Konzernregelwerk umfasst aber sieben Kategorien – von Steuern bis
 * Arbeitssicherheit. Für Datenschutz, KI, Lieferkette, Hinweisgeberschutz,
 * Arbeitsschutz, Umwelt, Recht und IKS gab es bis dahin nichts, worauf ein
 * Regelwerk hätte zeigen können.
 *
 * Jede Gruppe trägt eine `art`. Daran hängen zwei Unterscheidungen:
 *   • ISMS-Kennzahlen (Heatmap, Cockpit) rechnen nur über 'klausel', 'annex'
 *     und 'nis2' – sonst verwässerten die neuen Regelwerke die ISO-Prozente.
 *   • Die SoA entscheidet nur über 'annex'. Klauseln, Gesetze und Verordnungen
 *     gelten, weil sie gelten; „nicht anwendbar" ist dort keine Option.
 */

const NORMEN = [
  { group: 'ISO 27001: Klauseln (Managementsystem)', art: 'klausel', items: [
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
  { group: 'Annex A.5: Organisatorische Controls', art: 'annex', items: [
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
  { group: 'Annex A.6: Personenbezogene Controls', art: 'annex', items: [
    { id: 'A.6.1', label: 'Sicherheitsüberprüfung (Screening)' },
    { id: 'A.6.2', label: 'Beschäftigungs- und Arbeitsvertragsbedingungen' },
    { id: 'A.6.3', label: 'Informationssicherheitsbewusstsein, -ausbildung und -schulung' },
    { id: 'A.6.4', label: 'Maßregelungsprozess (Disziplinarverfahren)' },
    { id: 'A.6.5', label: 'Verantwortlichkeiten bei Beendigung/Änderung der Beschäftigung' },
    { id: 'A.6.6', label: 'Vertraulichkeits- oder Geheimhaltungsvereinbarungen' },
    { id: 'A.6.7', label: 'Remote-Arbeit (Telearbeit)' },
    { id: 'A.6.8', label: 'Meldung von Informationssicherheitsereignissen' },
  ] },
  { group: 'Annex A.7: Physische Controls', art: 'annex', items: [
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
  { group: 'Annex A.8: Technologische Controls', art: 'annex', items: [
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
  { group: 'NIS2 (Richtlinie (EU) 2022/2555)', art: 'nis2', items: [
    { id: 'NIS2-20',     label: 'Art. 20: Governance / Verantwortung der Leitungsorgane' },
    { id: 'NIS2-21.2a',  label: 'Art. 21(2a): Risikoanalyse & Sicherheit der Informationssysteme' },
    { id: 'NIS2-21.2b',  label: 'Art. 21(2b): Bewältigung von Sicherheitsvorfällen' },
    { id: 'NIS2-21.2c',  label: 'Art. 21(2c): Business Continuity, Backup, Krisenmanagement' },
    { id: 'NIS2-21.2d',  label: 'Art. 21(2d): Sicherheit der Lieferkette' },
    { id: 'NIS2-21.2e',  label: 'Art. 21(2e): Sicherheit bei Beschaffung/Entwicklung/Wartung' },
    { id: 'NIS2-21.2f',  label: 'Art. 21(2f): Bewertung der Wirksamkeit der Maßnahmen' },
    { id: 'NIS2-21.2g',  label: 'Art. 21(2g): Cyberhygiene & Schulung' },
    { id: 'NIS2-21.2h',  label: 'Art. 21(2h): Kryptographie und Verschlüsselung' },
    { id: 'NIS2-21.2i',  label: 'Art. 21(2i): Personalsicherheit, Zugriffskontrolle, Asset-Mgmt.' },
    { id: 'NIS2-21.2j',  label: 'Art. 21(2j): MFA & gesicherte Kommunikation' },
    { id: 'NIS2-23',     label: 'Art. 23: Meldepflichten (24 h / 72 h / 1 Monat)' },
  ] },

  /* ── NIS2 in deutschem Recht ──
     Der Katalog zitierte bisher nur die Richtlinie. Geprüft wird nach dem
     Umsetzungsgesetz – die Paragraphen folgen dem BSIG n. F. (NIS2UmsuCG). */
  { group: 'NIS2-Umsetzung Deutschland (BSIG n. F.)', art: 'nis2-de', items: [
    { id: 'BSIG-28', label: '§ 28: Besonders wichtige und wichtige Einrichtungen' },
    { id: 'BSIG-30', label: '§ 30: Risikomanagementmaßnahmen' },
    { id: 'BSIG-31', label: '§ 31: Besondere Anforderungen an Betreiber kritischer Anlagen' },
    { id: 'BSIG-32', label: '§ 32: Meldepflichten (Früh-, Folge-, Abschlussmeldung)' },
    { id: 'BSIG-33', label: '§ 33: Registrierungspflicht' },
    { id: 'BSIG-38', label: '§ 38: Umsetzung, Überwachung und Schulung durch die Geschäftsleitung' },
    { id: 'BSIG-39', label: '§ 39: Aufsicht und Durchsetzung' },
  ] },

  /* ── Datenschutz ──
     Zwei gültige Konzernrichtlinien (Datenschutz, Datenschutz-Organisation)
     hatten bis hierher nur A.5.34 als Anker. */
  { group: 'Datenschutz (DSGVO / BDSG)', art: 'datenschutz', items: [
    { id: 'DSGVO-5',  label: 'Art. 5: Grundsätze für die Verarbeitung' },
    { id: 'DSGVO-6',  label: 'Art. 6: Rechtmäßigkeit der Verarbeitung' },
    { id: 'DSGVO-7',  label: 'Art. 7: Bedingungen für die Einwilligung' },
    { id: 'DSGVO-9',  label: 'Art. 9: Besondere Kategorien personenbezogener Daten' },
    { id: 'DSGVO-12', label: 'Art. 12: Transparenz und Modalitäten' },
    { id: 'DSGVO-13', label: 'Art. 13/14: Informationspflichten bei der Erhebung' },
    { id: 'DSGVO-15', label: 'Art. 15 bis 22: Rechte der betroffenen Person' },
    { id: 'DSGVO-24', label: 'Art. 24: Verantwortung des Verantwortlichen' },
    { id: 'DSGVO-25', label: 'Art. 25: Datenschutz durch Technikgestaltung und Voreinstellungen' },
    { id: 'DSGVO-26', label: 'Art. 26: Gemeinsam Verantwortliche' },
    { id: 'DSGVO-28', label: 'Art. 28: Auftragsverarbeiter (AVV)' },
    { id: 'DSGVO-30', label: 'Art. 30: Verzeichnis von Verarbeitungstätigkeiten' },
    { id: 'DSGVO-32', label: 'Art. 32: Sicherheit der Verarbeitung' },
    { id: 'DSGVO-33', label: 'Art. 33: Meldung von Datenschutzverletzungen (72 h)' },
    { id: 'DSGVO-34', label: 'Art. 34: Benachrichtigung der betroffenen Person' },
    { id: 'DSGVO-35', label: 'Art. 35: Datenschutz-Folgenabschätzung' },
    { id: 'DSGVO-37', label: 'Art. 37 bis 39: Datenschutzbeauftragter' },
    { id: 'DSGVO-44', label: 'Art. 44 bis 49: Übermittlung in Drittländer' },
    { id: 'BDSG-26',  label: '§ 26 BDSG: Datenverarbeitung im Beschäftigungsverhältnis' },
  ] },

  /* ── KI ──
     Die KI-Konzernrichtlinie ist final und das KI-Dashboard stuft Risikoklassen
     ein – ohne Artikel, auf den sich das berufen könnte. DIHAG ist Betreiber,
     nicht Anbieter: die Betreiberpflichten stehen deshalb im Vordergrund. */
  { group: 'KI-Verordnung (VO (EU) 2024/1689)', art: 'ki', items: [
    { id: 'KIVO-3',  label: 'Art. 3: Begriffsbestimmungen (KI-System, Betreiber, Anbieter)' },
    { id: 'KIVO-4',  label: 'Art. 4: KI-Kompetenz der Beschäftigten' },
    { id: 'KIVO-5',  label: 'Art. 5: Verbotene Praktiken im KI-Bereich' },
    { id: 'KIVO-6',  label: 'Art. 6 + Anhang III: Einstufung als Hochrisiko-KI-System' },
    { id: 'KIVO-25', label: 'Art. 25: Verantwortlichkeiten entlang der KI-Wertschöpfungskette' },
    { id: 'KIVO-26', label: 'Art. 26: Pflichten der Betreiber von Hochrisiko-KI-Systemen' },
    { id: 'KIVO-27', label: 'Art. 27: Grundrechte-Folgenabschätzung' },
    { id: 'KIVO-50', label: 'Art. 50: Transparenz, Kennzeichnung KI-erzeugter Inhalte' },
    { id: 'KIVO-86', label: 'Art. 86: Recht auf Erläuterung der Einzelfallentscheidung' },
    { id: 'KIVO-99', label: 'Art. 99: Sanktionen' },
  ] },

  /* ── Lieferkette ──
     „Grundsatzerklärung Menschenrechtsstrategie" und „Human Rights Risk
     Management" stehen in der Governance-Mappe als offen – hier ist das Raster,
     an dem sie sich bauen lassen. */
  { group: 'Lieferkette (LkSG)', art: 'lieferkette', items: [
    { id: 'LKSG-3',  label: '§ 3: Sorgfaltspflichten' },
    { id: 'LKSG-4',  label: '§ 4: Risikomanagement und Zuständigkeit' },
    { id: 'LKSG-5',  label: '§ 5: Risikoanalyse' },
    { id: 'LKSG-6',  label: '§ 6: Präventionsmaßnahmen, Grundsatzerklärung' },
    { id: 'LKSG-7',  label: '§ 7: Abhilfemaßnahmen' },
    { id: 'LKSG-8',  label: '§ 8: Beschwerdeverfahren' },
    { id: 'LKSG-9',  label: '§ 9: Mittelbare Zulieferer' },
    { id: 'LKSG-10', label: '§ 10: Dokumentations- und Berichtspflicht' },
  ] },

  { group: 'Hinweisgeberschutz (HinSchG)', art: 'hinweisgeber', items: [
    { id: 'HINSCHG-8',  label: '§ 8: Vertraulichkeitsgebot' },
    { id: 'HINSCHG-12', label: '§ 12: Pflicht zur Einrichtung interner Meldestellen' },
    { id: 'HINSCHG-13', label: '§ 13: Aufgaben der internen Meldestelle' },
    { id: 'HINSCHG-16', label: '§ 16: Interner Meldekanal' },
    { id: 'HINSCHG-17', label: '§ 17: Verfahren bei internen Meldungen' },
    { id: 'HINSCHG-36', label: '§ 36: Verbot von Repressalien' },
  ] },

  /* ── Arbeitsschutz ──
     Gießereibetrieb: „Sicherheit und Gesundheit am Arbeitsplatz" und
     „Arbeitsmedizinische Vorsorge" stehen als eigene Konzernregelungen an. */
  { group: 'Arbeitsschutz (ISO 45001 / ArbSchG)', art: 'arbeitsschutz', items: [
    { id: 'ISO45001-5.4',   label: 'ISO 45001 5.4: Konsultation und Beteiligung der Beschäftigten' },
    { id: 'ISO45001-6.1.2', label: 'ISO 45001 6.1.2: Gefährdungserkennung und Risikobeurteilung' },
    { id: 'ISO45001-7.2',   label: 'ISO 45001 7.2: Kompetenz und Unterweisung' },
    { id: 'ISO45001-8.1.2', label: 'ISO 45001 8.1.2: Beseitigung von Gefahren, Minderung von Risiken' },
    { id: 'ISO45001-8.2',   label: 'ISO 45001 8.2: Notfallplanung und -reaktion' },
    { id: 'ISO45001-10.2',  label: 'ISO 45001 10.2: Vorfall, Nichtkonformität, Korrekturmaßnahmen' },
    { id: 'ARBSCHG-3',      label: '§ 3 ArbSchG: Grundpflichten des Arbeitgebers' },
    { id: 'ARBSCHG-5',      label: '§ 5 ArbSchG: Gefährdungsbeurteilung' },
    { id: 'ARBSCHG-6',      label: '§ 6 ArbSchG: Dokumentation' },
    { id: 'ARBSCHG-12',     label: '§ 12 ArbSchG: Unterweisung' },
    { id: 'ARBMEDVV-2',     label: '§ 2 ArbMedVV: Arbeitsmedizinische Vorsorge' },
  ] },

  /* ── Umwelt und Nachhaltigkeit ──
     Eine Gießerei ist energie- und stoffintensiv; ISO 50001 gehört deshalb
     dazu, nicht nur ISO 14001. */
  { group: 'Umwelt & Nachhaltigkeit (ISO 14001 / ISO 50001 / CSRD)', art: 'umwelt', items: [
    { id: 'ISO14001-6.1.2', label: 'ISO 14001 6.1.2: Umweltaspekte' },
    { id: 'ISO14001-6.1.3', label: 'ISO 14001 6.1.3: Bindende Verpflichtungen' },
    { id: 'ISO14001-8.1',   label: 'ISO 14001 8.1: Betriebliche Planung und Steuerung' },
    { id: 'ISO14001-8.2',   label: 'ISO 14001 8.2: Notfallvorsorge und Gefahrenabwehr' },
    { id: 'ISO14001-9.1.2', label: 'ISO 14001 9.1.2: Bewertung der Einhaltung von Verpflichtungen' },
    { id: 'ISO50001-6.3',   label: 'ISO 50001 6.3: Energetische Bewertung' },
    { id: 'KRWG-7',         label: '§ 7 KrWG: Grundpflichten der Kreislaufwirtschaft' },
    { id: 'ESRS-E1',        label: 'ESRS E1: Klimawandel' },
    { id: 'ESRS-E5',        label: 'ESRS E5: Ressourcennutzung und Kreislaufwirtschaft' },
    { id: 'ESRS-S1',        label: 'ESRS S1: Eigene Belegschaft' },
    { id: 'ESRS-G1',        label: 'ESRS G1: Unternehmenspolitik und Unternehmenskultur' },
  ] },

  /* ── Recht und Compliance ──
     Kartellrecht, Exportkontrolle, AntiKorruption, Hinweisgebersystem und der
     Verhaltenskodex sind eigene Konzernregelungen – bisher ohne Normanker. */
  { group: 'Recht & Compliance', art: 'recht', items: [
    { id: 'AEUV-101',         label: 'Art. 101/102 AEUV: Kartellverbot, Missbrauch einer marktbeherrschenden Stellung' },
    { id: 'GWB-1',            label: '§ 1 GWB: Verbot wettbewerbsbeschränkender Vereinbarungen' },
    { id: 'STGB-299',         label: '§§ 299, 331 bis 334 StGB: Bestechlichkeit und Bestechung' },
    { id: 'ISO37001',         label: 'ISO 37001: Anti-Bribery-Managementsystem' },
    { id: 'AWG-AWV',          label: 'AWG / AWV: Außenwirtschaftsrecht, Genehmigungspflichten' },
    { id: 'DUALUSE-2021-821', label: 'VO (EU) 2021/821: Güter mit doppeltem Verwendungszweck (Dual Use)' },
    { id: 'GWG-4',            label: '§§ 4 bis 10 GwG: Geldwäscheprävention, Sorgfaltspflichten' },
    { id: 'AGG-12',           label: '§ 12 AGG: Maßnahmen und Pflichten des Arbeitgebers' },
    { id: 'DCGK',             label: 'Deutscher Corporate Governance Kodex (DCGK)' },
  ] },

  /* ── Internes Kontrollsystem ──
     „IKS", „KontraG-Risk Management" und „Funktionstrennung in SAP (SOD)"
     stehen in der Mappe – mit Ankern lassen sie sich prüfen. */
  { group: 'IKS & Risikofrüherkennung', art: 'iks', items: [
    { id: 'AKTG-91-2',  label: '§ 91 Abs. 2 AktG: Risikofrüherkennungssystem (KonTraG)' },
    { id: 'AKTG-91-3',  label: '§ 91 Abs. 3 AktG: Internes Kontroll- und Risikomanagementsystem (FISG)' },
    { id: 'IDW-PS-980', label: 'IDW PS 980: Compliance-Management-System' },
    { id: 'IDW-PS-340', label: 'IDW PS 340: Prüfung des Risikofrüherkennungssystems' },
    { id: 'COSO-IC',    label: 'COSO Internal Control: Rahmenwerk für das IKS' },
    { id: 'HGB-289',    label: '§ 289 HGB: Lagebericht, Risikoberichterstattung' },
  ] },
];

/* Flache Nachschlage-Tabellen: id → Label, id → Art, Set gültiger IDs. */
const NORMEN_LABEL = {};
const NORMEN_ART = {};
const NORMEN_IDS = new Set();
for (const g of NORMEN) for (const it of g.items) {
  NORMEN_LABEL[it.id] = it.label;
  NORMEN_ART[it.id] = g.art || 'sonstige';
  NORMEN_IDS.add(it.id);
}

/** Der ISMS-Umfang: ISO 27001 und NIS2. Die Kennzahlen der Abdeckung rechnen
 *  nur hierüber – sonst fiele die ISO-Quote, weil Regelwerke aus Umwelt oder
 *  Steuern dazukommen, die mit dem ISMS nichts zu tun haben. */
const NORM_ISMS_ARTEN = ['klausel', 'annex', 'nis2'];

/** Art einer Control-ID ('sonstige' für Unbekanntes). */
function normArtVon(id) { return NORMEN_ART[id] || 'sonstige'; }

/** Alle IDs einer oder mehrerer Arten. */
function normIdsMitArt(...arten) {
  const wahl = new Set(arten.flat());
  return NORMEN.filter(g => wahl.has(g.art)).flatMap(g => g.items.map(i => i.id));
}

/**
 * Wird über die Anwendbarkeit dieser Anforderung entschieden?
 * Nur bei Annex A: Die SoA nach 6.1.3 d) begründet Ein- und Ausschlüsse der
 * 93 Controls. Eine Klausel, ein Gesetz oder eine Verordnung ist nicht
 * „nicht anwendbar" – sie gilt.
 */
function normEntscheidbar(id) { return normArtVon(id) === 'annex'; }

/** Gruppe (Kurzname) zu einer Control-ID – für Heatmap-Einfärbung/Legende. */
function normGroupOf(id) {
  if (/^A\.5\./.test(id)) return 'A.5';
  if (/^A\.6\./.test(id)) return 'A.6';
  if (/^A\.7\./.test(id)) return 'A.7';
  if (/^A\.8\./.test(id)) return 'A.8';
  if (/^NIS2/.test(id))   return 'NIS2';
  if (/^BSIG-/.test(id))  return 'BSIG';
  if (/^(DSGVO|BDSG)-/.test(id)) return 'Datenschutz';
  if (/^KIVO-/.test(id))  return 'KI-VO';
  if (/^LKSG-/.test(id))  return 'LkSG';
  if (/^HINSCHG-/.test(id)) return 'HinSchG';
  if (/^(ISO45001|ARBSCHG|ARBMEDVV)-/.test(id)) return 'Arbeitsschutz';
  if (/^(ISO14001|ISO50001|ESRS|KRWG)-/.test(id)) return 'Umwelt';
  if (/^(AEUV|GWB|STGB|ISO37001|AWG|DUALUSE|GWG|AGG|DCGK)/.test(id)) return 'Recht';
  if (/^(AKTG|IDW|COSO|HGB)/.test(id)) return 'IKS';
  return 'Klausel';
}

/** Anzeigetext „ID — Label" (unbekannte IDs bleiben lesbar). */
function normLabel(id) { return NORMEN_LABEL[id] ? (id + ' (' + NORMEN_LABEL[id] + ')') : id; }

/* ═══════════════════════════════════════════════════
   Seed aus der Review-Mail (Max Muster) – Ein-Klick-Vorbefüllung
═══════════════════════════════════════════════════ */
const NORMBEZUG_SEED = {
  leitlinie:        ['5.1', '5.2', '5.3', '10.1', '10.2', 'A.5.1', 'A.5.4', 'NIS2-20', 'NIS2-21.2a'],
  auditmanagement:  ['9.2', '10.1', '10.2', '9.1', 'A.5.35', 'A.5.36', 'A.5.31', 'A.5.22', 'A.6.6', 'A.5.34', 'A.8.8', 'NIS2-21.2f'],
  zieleplanung:     ['6.2', '6.1', '9.1', '9.3', '5.2', '10.1', 'A.5.1', 'NIS2-20', 'NIS2-21.2f'],
  changemanagement: ['A.8.32', '6.3', 'A.8.9', 'A.5.37', 'A.8.8', 'A.5.24', 'A.5.36', 'NIS2-21.2e'],
  verhaltenskodex:  ['A.5.1', 'A.5.4', 'A.5.10', 'A.5.31', 'A.5.34', 'A.6.2', 'A.6.4', 'A.6.6', 'A.6.8', 'A.5.24', 'NIS2-21.2g', 'NIS2-21.2i'],
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
  module.exports = { NORMEN, NORMEN_LABEL, NORMEN_ART, NORMEN_IDS, NORM_ISMS_ARTEN,
    normGroupOf, normLabel, normArtVon, normIdsMitArt, normEntscheidbar,
    NORMBEZUG_SEED, normbezugSeedFor };
}
