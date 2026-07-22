'use strict';

/**
 * Reifegrad-Katalog „IT und OT Betrieb" (ISMS-Betriebs-Gap-Analyse)
 * ================================================================
 * Maßnahmenkatalog aus dem gleichnamigen ISMS-Dokument (DIHAG/EIS/DSO).
 * Jede Maßnahme wird je Werk mit einer Ampel bewertet (rot/gelb/gruen/weiss).
 * IDs sind stabil – nicht umsortieren/löschen, nur anhängen.
 */

const REIFEGRAD_WERKE = ['DIHAG', 'EIS', 'DSO'];

// Ampel-Stufen laut Legende des Dokuments
const REIFEGRAD_STUFEN = {
  rot:   { label: 'nicht gelebt',    icon: '🔴', color: '#dc2626', bg: '#fef2f2' },
  gelb:  { label: 'teilweise',       icon: '🟡', color: '#b45309', bg: '#fffbeb' },
  gruen: { label: 'funktioniert',    icon: '🟢', color: '#15803d', bg: '#f0fdf4' },
  weiss: { label: 'keine Einschätzung', icon: '⚪', color: '#6b7280', bg: '#f9fafb' },
};
const REIFEGRAD_STUFEN_ORDER = ['gruen', 'gelb', 'rot', 'weiss'];

const REIFEGRAD_KATALOG = [
  { id: "T01", titel: "Arbeitsumfeld der Administratoren", punkte: [
    { id: "R001", text: "Schulung/Verpflichtung: Datenschutzbelehrung; Rechte nur beruflich nutzen" },
    { id: "R002", text: "Persönliche Arbeitsumgebung: Nur Unternehmens-Standard; Abweichungen nur abgesichert (z. B. VM, separates Segment)" },
  ] },
  { id: "T02", titel: "Administrative Accounts und Berechtigungen", punkte: [
    { id: "R003", text: "Personalisiertes Benutzer-Konto ohne Adminrechte für Alltagstätigkeiten" },
    { id: "R004", text: "Administration mit separatem Admin/Service-Account" },
    { id: "R005", text: "Berechtigungskonzept für Adminrollen (root, GA, DA, LA, Exchange, SharePoint, …)" },
    { id: "R006", text: "Privilegien zeitlich begrenzen (just-in-time), MFA verpflichtend" },
    { id: "R007", text: "Minimierungsprinzip: Wenige Domänen-Admins etc." },
    { id: "R008", text: "Service-Accounts: Kein interaktiver Login; sonst starke Maßnahmen/Passwortsafe" },
    { id: "R009", text: "Passwörter (hochprivilegiert): ≥12 Zeichen, max. 365 Tage, Groß/Klein/Ziffer/Sonderz., Historie ≥15" },
  ] },
  { id: "T03", titel: "Berechtigungsmanagement", punkte: [
    { id: "R010", text: "Risikobasierte Authentifizierung; Berechtigungskonzepte ab Schutzklasse 2" },
    { id: "R011", text: "Eindeutige Benutzerkennungen; Gruppenbenutzer nur nach Risikobetrachtung/GF-Freigabe" },
    { id: "R012", text: "DRM/dynamische Zugriffe für kritische Infos (Ort/Zeit/Endgerät berücksichtigen)" },
    { id: "R013", text: "OT-Terminals: Nicht personalisierter Zugriff stark einschränken, Nachvollziehbarkeit über Schichtplan" },
  ] },
  { id: "T04", titel: "Bereitstellung/Änderung von Zugängen", punkte: [
    { id: "R014", text: "Ausgabe: Benutzerkennung per E-Mail; Initialpasswort über zweiten Kanal (Telefon/SMS/Übergabe/verschlüsselt)" },
    { id: "R015", text: "Passwort-Reset: Geeignete Identprüfung" },
    { id: "R016", text: "Remote/Cloud: Zwang zu 2FA" },
    { id: "R017", text: "Initialpasswort: Sofort ändern; nach Erstlogin erzwungen, wenn möglich" },
    { id: "R018", text: "OT: Hersteller-/Wartungszugänge minimieren; Default-Passwörter ändern; Tresor nutzen" },
  ] },
  { id: "T05", titel: "Deaktivierung/Löschung", punkte: [
    { id: "R019", text: "Austritt/Ende Partner: Zeitnahe Deaktivierung/Löschung; regelmäßiger Abgleich mit Stammdaten" },
  ] },
  { id: "T06", titel: "Rechtevergabe & -kontrolle", punkte: [
    { id: "R020", text: "Need-to-Know, Rollenbasiert; Privilegierte Rechte mit Vorgesetzten-Genehmigung, Ticket-Doku" },
    { id: "R021", text: "Lokale Adminrechte Endgeräte: Nur temporär" },
    { id: "R022", text: "Softwareinstallation: Nur nach IT-Freigabe (Lizenzen/Quelle/Patch-Level etc.)" },
    { id: "R023", text: "Prozess:" },
    { id: "R024", text: "Eintritt: Meldung HR/Vorgesetzter → Rechte lt. Rolle" },
    { id: "R025", text: "Wechsel: Antrag → Informationseigentümer-Freigabe → Anpassung" },
    { id: "R026", text: "Rechte-Reviews: Jährlich/anlassbezogen; bei sehr hohem Schutzbedarf vierteljährlich" },
    { id: "R027", text: "Rechteentzug: Bei Nichtbedarf/Verstoß/Inaktivität >1 Jahr/Austritt; dokumentieren" },
  ] },
  { id: "T07", titel: "Beschaffung & Entwicklung", punkte: [
    { id: "R028", text: "Beschaffung: Nach Unternehmensstandard über zentrale IT; Lizenzprüfung; Asset-/Lizenz-Doku" },
    { id: "R029", text: "OT-Beschaffung: IT/ISB einbeziehen; Inventar von Maschinen/IT-Komponenten" },
    { id: "R030", text: "Kapazitätsplanung: Monitoringdaten berücksichtigen" },
    { id: "R031", text: "Dienstleistungen/Outsourcing: Über IT koordinieren; SLAs; Abnahme (Pen-Test/Code-Review/Architektur)" },
    { id: "R032", text: "Standards/Best Practices: Zertifizierungen/CCRA, Herstellerempfehlungen, Ausfallsicherheit/Testumgebungen" },
    { id: "R033", text: "Vertraulichkeit: Quellcodezugang für Auftraggeber; Trennung von Kundendaten" },
    { id: "R034", text: "Zugänge Externer: Nur über sichere, temporäre Remote-Zugänge" },
    { id: "R035", text: "Dokumentation: Anforderungen, Lasten/Pflichten, Umgebungen, Tests, Rollback, Ticketregeln, Versionsverwaltung" },
    { id: "R036", text: "Skripte/Automatisierung: Nach „Sichere SW-Entwicklung“" },
  ] },
  { id: "T08", titel: "Grundinstallation & Konfiguration", punkte: [
    { id: "R037", text: "Zugangsschutz: Authentifizierung verpflichtend; Adminzugang nur Verantwortliche; Lockscreen ≤15 Min" },
    { id: "R038", text: "Accounts: Unnötige Nutzer entfernen; Defaults/Passwörter ändern" },
    { id: "R039", text: "OT-Ausnahmen: Risiko-Minimierung (kein Internet, begrenzte interne Zugriffe)" },
    { id: "R040", text: "IT-Systeme: Installation nur durch/mit IT; nach Systemlebenszyklus-Checkliste" },
    { id: "R041", text: "Konfig-Standards/Härtung: CIS/BSI, unnötige Dienste/Ports deaktivieren, Whitelist/Blacklist, Trennung privat/geschäftlich" },
    { id: "R042", text: "Änderungen: Change-Management, Vier-Augen, IT-Leitung & ISB involviert" },
    { id: "R043", text: "Verschlüsselung: Notebooks Vollverschlüsselung; Mobile: Datenbereiche + MDM" },
    { id: "R044", text: "Zeitquelle: Zentrale Synchronisation (insb. Logs)" },
    { id: "R045", text: "OT-Systeme: Physische Schutzmaßnahmen (z. B. Ports versiegeln)" },
    { id: "R046", text: "Anwendungen: Installation nach Standard; Tests in abgeschotteten Umgebungen" },
    { id: "R047", text: "Inventarisierung: Vollständige Übersicht Systeme/Apps/Cloud; Fremd-IT-Dienste prüfen" },
    { id: "R048", text: "Client-Auslieferung: Einweisung der Mitarbeitenden" },
  ] },
  { id: "T09", titel: "Change-Management", punkte: [
    { id: "R049", text: "Vorgaben/Verfahren: Siehe ISMS Prozess Change-Management" },
  ] },
  { id: "T10", titel: "Wartung, Löschung, Entsorgung", punkte: [
    { id: "R050", text: "Rückgabe: Immer an IT; sichere Datenlöschung nach Stand der Technik; vorherige Datensicherung" },
    { id: "R051", text: "Weitergabe/Verlagerung: Nur mit IT-Zustimmung; bei kritischen Systemen Risikoanalyse" },
    { id: "R052", text: "Entsorgung: Nur durch IT; Datenträger ISO 21964 Stufe 4; Nachweise vorhalten; OT-Komponenten vor Verschrottung entnehmen" },
    { id: "R053", text: "Wartung/Reparatur: Verträge, Koordination durch IT, Daten vorher sichern/löschen; OT-Wartungsverträge inkl. Sicherheitsverantwortungen" },
    { id: "R054", text: "Fernwartung:" },
    { id: "R055", text: "Zugänge minimal/temporär, verschlüsselt, segmentiert, least-privilege, Benutzerzustimmung bei Endgeräten" },
    { id: "R056", text: "OT-Fernwartung nur unter Aufsicht" },
    { id: "R057", text: "Logging: Zeitpunkt, Dauer, Zugreifender, Freigabe, Ziel; DSGVO-konform, Löschfristen einhalten; keine Verhaltenskontrolle" },
    { id: "R058", text: "Werkzeuge: Unternehmensstandard, Abweichungen durch ISB genehmigen" },
  ] },
  { id: "T11", titel: "Netzwerkmanagement", punkte: [
    { id: "R059", text: "Zugriff auf Komponenten: Über Mgmt-Systeme/ACL/Firewall; unnötige Mgmt-Protokolle deaktivieren" },
    { id: "R060", text: "Konfig-Management: Regelmäßige Sicherung/Schutz/Recovery-Test; Offline-Zugriff sicherstellen; Netzdoku/-plan pflegen; Geräte-/Benutzerauthentifizierung" },
    { id: "R061", text: "Segmentierung/Firewall: Zonen nach Risiko/Schutzbedarf; Übergänge über Firewalls; WLAN-Flächen begrenzen; externe Zugriffe nur verschlüsselt (VPN); Gastnetze strikt getrennt" },
    { id: "R062", text: "Firewall-Betrieb: Regeln mit Zweck/Antrag/Freigabe/Gültigkeit; Ablaufdaten dokumentieren; Konfig sichern; Angriffe/Events loggen und auswerten; Internetzugriff von Infra/OT minimieren" },
    { id: "R063", text: "Monitoring: Core/Switches/Router/WLAN – Verfügbarkeit, Auslastung, Fehler, Qualität" },
    { id: "R064", text: "Internet-Zugriffe: Nur über NG-Firewall; Web-Filter; OT-LTE vermeiden/absichern" },
    { id: "R065", text: "Standort-Anbindung: Risiko- und Sicherheitsuntersuchung; aktueller AV-/Patch-Stand" },
    { id: "R066", text: "VPN Site-to-Site: Keine unautorisierten Netzkopplungen" },
  ] },
  { id: "T12", titel: "Monitoring & Protokollierung", punkte: [
    { id: "R067", text: "Organisation: Einheitliches Konzept/Tools nach Standard; Auswahl nach Kritikalität" },
    { id: "R068", text: "Monitoring: Performance/Verfügbarkeit (inkl. OT); zentrale Erfassung (CPU/RAM/Platte/Temp/Throughput/Redundanz); Alarme bei Schwellwerten" },
    { id: "R069", text: "Logging: Pflicht bei hoher/ sehr hoher Vertraulichkeit/Integrität; Adminzugriffe, kritische Änderungen, externe Dienste berücksichtigen; Logs schützen/prüfen; Vorfälle nach Prozess melden; DSGVO-Fristen; keine Leistungskontrolle" },
    { id: "R070", text: "Angriffserkennung: Anomalie-Detection, SIEM, IDS, AV; zentral (IT/SOC) verwaltet; jährliche Überprüfung; Handling über Vorfallsprozess" },
  ] },
  { id: "T13", titel: "Business Continuity", punkte: [
    { id: "R071", text: "Verantwortlichkeiten: Für kritische Systeme/Apps Systemverantwortliche + Vertreter; Übersicht aktuell halten und in Notfalldoku aufnehmen; Vertretungsregelung bei Abwesenheit" },
    { id: "R072", text: "Doku & Prävention: Laufende Infoweitergabe; Systemdokus, Zugangsdaten/Schlüssel sicher ablegen; Weiterbildung; Schwerwiegende Fehler sofort melden; Risikoreiche Tätigkeiten mit Mehr-Augen/Ankündigung; Verbesserungen melden" },
  ] },
  { id: "T14", titel: "Patch- & Schwachstellenmanagement", punkte: [
    { id: "R073", text: "Rollen: ISB bewertet Schwachstellen; Systemverantwortliche patchen; CERT entscheidet in Grenzfällen" },
    { id: "R074", text: "Informationsquellen: Hersteller/Portale, Patch-Software (SCCM), NVD etc." },
    { id: "R075", text: "Bewertung: CVSS (FIRST 4.0); NVD-Bewertungen" },
    { id: "R076", text: "Patch-Kategorien:" },
    { id: "R077", text: "Standard (CVSS 1–3): Halbjährliche Wartungsfenster, niedriger Schaden" },
    { id: "R078", text: "Sicherheit (CVSS 4–6): Installation binnen 1–10 Tagen, mittlerer Schaden" },
    { id: "R079", text: "Emergency (CVSS 7–10): Sofort, hoher Schaden; Freigabeprozess reduziert, Maßnahmen lückenlos dokumentieren" },
    { id: "R080", text: "Ausnahmen: Kein Patch/Workaround → Risikoanalyse, ggf. Abschaltung/Überwachung; Technisch nicht möglich → Risikoanalyse/ISB-Meldung" },
    { id: "R081", text: "Altsysteme in OT: Isolation/Härtung kurzfristig, langfristiger Erneuerungsplan" },
    { id: "R082", text: "Rollout: Grundsätzlich alles patchen; Tests in geeigneter Umgebung; Funktionsprüfung mit Key-User" },
    { id: "R083", text: "Rollback: Strategien für kritische Systeme vorsehen/testen" },
    { id: "R084", text: "Überprüfung: Regelmäßige/v. a. anlassbezogene Prüfungen (Pen-Tests/Scans), intern/extern; Prüfplanung; Risiken durch Scans abstimmen; Maßnahmen ableiten" },
  ] },
  { id: "T15", titel: "Malware-Schutz", punkte: [
    { id: "R085", text: "Konfiguration: Zentrale Bereitstellung/Pflege; AV auf Servern/Clients; automatische Updates/Signaturen; Deaktivierung durch Nutzer verhindern; alle Systeme ins Management" },
    { id: "R086", text: "Ausnahmen: Alternative Schutzmaßnahmen bei Systemen ohne AV" },
    { id: "R087", text: "Kompatibilität: Bei OT-Beschaffung beachten" },
    { id: "R088", text: "Neue Bedrohungen: Bewertung auf Risiko" },
    { id: "R089", text: "Infektionen: Systeme grundsätzlich neu installieren oder isolieren" },
  ] },
  { id: "T16", titel: "Datensicherung & Wiederherstellung", punkte: [
    { id: "R090", text: "Organisation: Backup-Konzept durch IT; Standorte führen/prüfen/tauschen wiederher; Änderungen durch Eigentümer melden" },
    { id: "R091", text: "OT: Eigene Konzepte inkl. Konfig-Sicherung/Ersatzhardware" },
    { id: "R092", text: "Konzeptinhalte: Datenumfang, Berechtigungen, Parameter, Abhängigkeiten, Methode, Verantwortlichkeiten, Aufbewahrung/Retention/Brandabschnitt/extern" },
    { id: "R093", text: "RPO/RTO: Für Assets mit Verfügbarkeit „Sehr hoch“ definieren (vgl. IT-Notfallmanagement)" },
    { id: "R094", text: "Aufbewahrung/Löschung: Eigentümer-verantwortet, gesetzlich/vertraglich beachten; Cloud einschließen" },
    { id: "R095", text: "Tests: Regelmäßige Restore-Übungen (Datei/DB/System), Mängel beheben/Optimierungen einarbeiten" },
  ] },
  { id: "T17", titel: "Data Loss Prevention (DLP)", punkte: [
    { id: "R096", text: "Prävention: Asset-Klassifizierung; Sensibilisierung; Verschlüsselung; strikte Zugriffsmodelle; lokale Adminrechte minimieren; Admin-Nutzung überwachen" },
    { id: "R097", text: "Detektion/Reaktion: Protokollierung/Analyse; tiefgehende Maßnahmen nach ISO/IEC 27002 (App-Firewall, Geräte-Kontrolle, Security-Tools, M365/AV), kontinuierliche Überwachung" },
  ] },
  { id: "T18", titel: "Physische Sicherheit", punkte: [
    { id: "R098", text: "Sicherheitszonen: Nach ISMS-Konzept" },
    { id: "R099", text: "Serverräume – Betrieb: Kein Essen/Trinken/Rauchen; Beschriftung/Doku; keine Haushaltsgeräte; Aufstellen/Entfernen nur mit Genehmigung" },
    { id: "R100", text: "Zutritt: Zutritts- und Verlassensprotokoll; jährliche Rechteprüfung; Türen stets verschlossen; Begleitpflicht für Dritte; NDA/ADV vor Tätigkeitsbeginn" },
    { id: "R101", text: "Bau: F90-Bauteile/Schotts; keine Fenster; Sicherheitsschloss" },
    { id: "R102", text: "Redundanz: Geo-/Redundantes RZ, Offline/Read-Only-Backups/ IAM-geschützt" },
    { id: "R103", text: "Brandschutz: Keine Brandlasten; Gaslöschanlage; CO₂-Löscher; Rauchmelder/Alarmierung; Lagerverbote" },
    { id: "R104", text: "Technische Versorgung: N+1, separates Netz, externer Zugriff nur für Wartung/VPN, Wartungsprotokolle; USV/NSV, Klima, EMA, Leckage/Temp-Sensoren, Alarmpläne" },
    { id: "R105", text: "Verteilung: Abschließbare Verteilerschränke, getrennte Räume" },
    { id: "R106", text: "Video: Überwachung außen/innen; DSGVO-konforme Speicherung/Nutzung/Kennzeichnung; Videokonzept" },
  ] },
  { id: "T19", titel: "Kryptographie & Data Masking", punkte: [
    { id: "R107", text: "Verfahren: Von IT definiert/ISB freigegeben; nur sichere, passende Algorithmen/Schlüssellängen; jährlicher Abgleich" },
    { id: "R108", text: "Rechtliches: Länderspezifika beachten" },
    { id: "R109", text: "Einsatz: Daten mit hohem Schutzbedarf verschlüsseln (gemäß Verfahrensliste)" },
    { id: "R110", text: "Data Masking: Verschlüsselung, Pseudonymisierung/Anonymisierung (Logs, Personalnummern, Benutzernamen, Testdaten)" },
  ] },
  { id: "T20", titel: "Schlüsselmanagement", punkte: [
    { id: "R111", text: "Erzeugung: Sichere RNG; Langzeitschlüssel für Personen in PKI; Systemschlüssel ggf. lokal" },
    { id: "R112", text: "Speicherung: Verschlüsselt in geschütztem Bereich (z. B. Zertifikatsspeicher)" },
    { id: "R113", text: "Backup/DR: Schlüssel verschlüsselt sichern/archivieren; Wiederherstellung per Mehr-Augen-Prinzip" },
    { id: "R114", text: "Verteilung: Verschlüsselt + signiert; Kennwort separater Kanal; nur über verschlüsselte Wege; Zwischenkopien löschen" },
    { id: "R115", text: "Verwendung: Passwortsafe/Secret-Management" },
    { id: "R116", text: "Erneuerung: Bei Verdacht sofort austauschen; Gültigkeiten kurz halten" },
    { id: "R117", text: "Deaktivierung: Nach Widerruf der Zertifikate löschen" },
    { id: "R118", text: "Zertifikate: Gültigkeit prüfen, rechtzeitig ersetzen, nicht mehr benötigte widerrufen" },
  ] },
  { id: "T21", titel: "Übertragung & Verfahren (Beispiele)", punkte: [
    { id: "R119", text: "Öffentliche Netze: Immer verschlüsselt" },
    { id: "R120", text: "Private Netze (sehr hoher Schutzbedarf): Wenn möglich verschlüsselt (ggf. Applikationsebene)" },
    { id: "R121", text: "Beispiele:" },
    { id: "R122", text: "WLAN: RADIUS, WPA2/AES, 802.1X" },
    { id: "R123", text: "E-Mail: S/MIME/X.509, Signatur" },
    { id: "R124", text: "Festplatten/USB: BitLocker/To Go AES-256" },
    { id: "R125", text: "SMB v2/v3: AES-256" },
  ] },
  { id: "T22", titel: "Sichere Softwareentwicklung", punkte: [
    { id: "R126", text: "Vorgaben/Prozesse: In separater ISMS-Richtlinie „Sichere Softwareentwicklung“" },
  ] },
  { id: "T23", titel: "Sicherheitsvorfälle", punkte: [
    { id: "R127", text: "Bearbeitung: Nach ISMS-Prozess „Management von Sicherheitsvorfällen“" },
  ] },
  { id: "T24", titel: "Verantwortung, Compliance, Ausnahmen, Sanktionen", punkte: [
    { id: "R128", text: "Verantwortung: Führungskräfte fördern Sicherheitskultur; alle Mitarbeiter handeln sicherheitsbewusst" },
    { id: "R129", text: "Compliance: Anlehnung an ISO/IEC 27001 & Stand der Technik" },
    { id: "R130", text: "Ausnahmen: Mit Risikobewertung, befristet, Entscheidung dokumentiert, ISB einbeziehen" },
    { id: "R131", text: "Sanktionen: Von Ermahnung bis fristlose Kündigung; ggf. strafrechtliche Konsequenzen" },
  ] },
];

if (typeof module !== 'undefined' && module.exports) { module.exports = { REIFEGRAD_KATALOG, REIFEGRAD_WERKE, REIFEGRAD_STUFEN }; }
