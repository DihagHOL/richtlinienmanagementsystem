'use strict';

/**
 * Die Prozesse des RMS selbst
 * ===========================
 * Was das RMS tut, steht in Code und Dokumentation verstreut: der Freigabe-
 * Workflow in freigaben.js, die Erinnerungen im Cron, die Ausnahmen in ihrem
 * Register. Ein Auditor fragt nach den Prozessen, und ISO 27001 Klausel 4.4
 * verlangt sie samt ihren Wechselwirkungen. Hier stehen sie als Katalog nach
 * dem Hausschema: 13 Hauptprozesse, darunter ihre Unter- und Nebenprozesse.
 *
 * Jeder Eintrag ist ein Modell:
 *   name          Name des Modells, endet auf „(RMS)"
 *   kennung       Prozess-Kennung (das id von <bpmn:process>), fest, damit
 *                 eine ⊞ auch nach erneutem Anlegen auf ihr Ziel zeigt
 *   beschreibung  Sätze für die Dokumentation des Prozesses; sie stehen in der
 *                 Ansicht und in der Prozessbeschreibung unter dem Titel
 *   norm          Normbezug, eine Zeile
 *   unter, neben  zugeordnete Unter- (↳) und Nebenprozesse (⇢), nach Namen
 *   schritte      der Ablauf in der Schreibweise des Hausschemas
 *
 * Ein Schritt „… (Unterprozess)" bindet das Modell gleichen Namens (ohne
 * „(RMS)") als ⊞ ein. Die Gliederung entsteht daraus von selbst: Was ein
 * Schritt einbindet oder als Unter- oder Nebenprozess genannt ist, steht
 * darunter; oben bleiben die 13, die niemand nennt.
 *
 * Angelegt werden die Modelle über „📋 Standard-Prozesse" im Reiter
 * „Prozesse" (seedStandardProcesses in js/prozesse.js), in der Ablage des
 * Konzerns. Die Beschreibung folgt dem Stand der Software; ändert sich ein
 * Ablauf, wird er hier nachgezogen.
 */

/** Ordner der Ablage: Das RMS ist ein Konzernsystem. */
const RMS_PROZESS_ABLAGE = 'KONZERN';

const RMS_PROZESSE = [

  /* ═══ 1 · Regelwerke ═══════════════════════════════════════════════════ */

  { name: 'Regelwerk einführen und pflegen (RMS)', kennung: 'Process_RMS_regelwerk',
    beschreibung: [
      'Der Lebenszyklus eines Regelwerks im RMS, vom Bedarf bis zur Außerkraftsetzung.',
      'Ein neues Thema beginnt als Konzept, über das die Geschäftsleitung vorab entscheidet; ein vorhandenes Dokument wird ohne Konzept als Entwurf aufgenommen.',
      'Jede Fassung durchläuft die Konformitätsprüfung, bei Betroffenheit die Mitbestimmung des Betriebsrats und die Freigabe durch die Geschäftsleitung. Erst dann wird sie veröffentlicht und der Zielgruppe bekanntgegeben.',
      'Die Mitarbeitenden bestätigen die Kenntnisnahme. Zum Termin der Wiedervorlage prüft die Administration, ob das Regelwerk unverändert gilt, in neuer Version erneut freigegeben oder außer Kraft gesetzt wird.',
      'Daneben laufen Änderungsvorschläge, die Prüfung der Dokumente und befristete Ausnahmen.',
    ],
    norm: 'ISO 27001 Klausel 5.2 und 7.5, A.5.1; NIS2 Art. 20',
    neben: ['Änderung vorschlagen (RMS)', 'Regelwerk-Dokumente prüfen (RMS)', 'Ausnahme genehmigen (RMS)'],
    schritte: `Start: Bedarf für ein Regelwerk erkannt
Administration: Regelwerk-Konzept entscheiden (Unterprozess)
Administration: Erstellung beschlossen? | nein: Konzept ablegen | Ende: Konzept abgelehnt oder zurückgestellt
Administration: Regelwerk-Entwurf erstellen (Unterprozess)
Administration: Regelwerk freigeben lassen (Unterprozess)
Geschäftsleitung: Regelwerk veröffentlichen und bekanntgeben (Unterprozess)
Mitarbeitende: Kenntnisnahme bestätigen (Unterprozess)
Warten: Termin der nächsten Überprüfung
Administration: Regelwerk überprüfen (Unterprozess)
Administration: Regelwerk weiter nötig? | nein: Regelwerk außer Kraft setzen (Unterprozess) | Ende: Regelwerk archiviert
Administration: Inhalt unverändert gültig? | nein: Neue Version anlegen | zurück: Regelwerk freigeben lassen
Administration: Nächsten Prüftermin setzen
Zurück: Termin der nächsten Überprüfung` },

  { name: 'Regelwerk-Konzept entscheiden (RMS)', kennung: 'Process_RMS_konzept',
    beschreibung: [
      'Bevor ein neues Regelwerk geschrieben wird, entscheidet die Geschäftsleitung, ob und mit welcher Priorität es kommt.',
      'Das Konzept nennt Arbeitstitel, Typ und Geltungsbereich, dazu Kategorie, Priorität, die Motivation und eine Skizze; ein erster Entwurf kann als Anhang beiliegen.',
      'Die Geschäftsleitung entscheidet aus der Mail oder in der App: annehmen, zurückstellen oder ablehnen. Eine Ablehnung braucht eine Begründung.',
      'Bei Annahme legt das RMS den Entwurf selbst an und übernimmt Angaben und Anhang. Die einreichende Person erfährt jede Entscheidung per Mail und wählt, ob sie den Entwurf bearbeitet oder direkt zur Prüfung gibt.',
      'Ein vorhandenes Dokument braucht kein Konzept und wird direkt als Entwurf angelegt.',
    ],
    norm: 'ISO 27001 Klausel 6.2 und 7.5.1',
    neben: ['Workflow-Erinnerungen versenden (RMS)'],
    schritte: `Start: Regelwerk-Bedarf gemeldet
Administration: Komplett neues Regelwerk? | nein: Vorhandenes Dokument direkt anlegen | Ende: Ohne Konzept als Entwurf übernommen
Administration: Arbeitstitel, Typ und Geltungsbereich erfassen
Administration: Motivation und Skizze beschreiben
Administration: Ersten Entwurf als Anhang beilegen
Administration: Konzept zur Prüfung einreichen
System: Konzept mit Entscheidungsknöpfen mailen
Warten: Entscheidung der Geschäftsleitung
Geschäftsleitung: Konzept annehmen? | nein: Zurückstellung oder Ablehnung begründen | Ende: Konzept abgelehnt oder zurückgestellt
System: Regelwerk-Entwurf aus dem Konzept anlegen
System: Einreichende Person per Mail informieren
Administration: Weiteres Vorgehen festlegen
Ende: Entwurf angelegt` },

  { name: 'Regelwerk-Entwurf erstellen (RMS)', kennung: 'Process_RMS_entwurf',
    beschreibung: [
      'Die Administration bereitet ein Regelwerk so vor, dass es geprüft werden kann.',
      'Pflicht sind Titel, Dokumentenart aus der Governance-Struktur und Geltungsbereich; ohne sie lässt sich nicht speichern.',
      'Dazu kommen das Dokument aus der Bibliothek, Zielgruppe, Pflichtlektüre, Wissenstest mit Bestehensgrenze, Lernvideos mit Quelle, Wiederholungspflicht, Normbezug und der Termin der nächsten Überprüfung.',
      'Prüfer und Freigeber gelten global oder nur für dieses Regelwerk. Ist ein Betriebsrat betroffen, wird er angekreuzt; die Reihenfolge von Mitbestimmung und Freigabe lässt sich je Regelwerk tauschen.',
      'Ein Entwurf entsteht aus einem angenommenen Konzept, direkt, aus dem Import mehrerer Dateien, aus dem Governance-Board oder aus den IMS-Dokumenten. Jede Änderung steht mit Person und Zeitpunkt in der Historie.',
    ],
    norm: 'ISO 27001 Klausel 7.5.2, A.5.1',
    unter: ['Governance-Entwurf übernehmen (RMS)', 'IMS-Dokument lenken (RMS)'],
    schritte: `Start: Entwurf angelegt
Administration: Titel, Dokumentenart und Geltungsbereich pflegen
Administration: Dokument hochladen oder aus der Bibliothek wählen
Administration: Zielgruppe und Pflichtlektüre festlegen
Administration: Wissenstest und Lernvideos hinterlegen
Administration: Wiederholung und nächste Überprüfung setzen
Administration: Normbezug zu Normen und Recht zuordnen
Administration: Prüfer, Freigeber und Betriebsrat festlegen
System: Pflichtangaben vollständig? | nein: Speichern verweigern | zurück: Titel, Dokumentenart und Geltungsbereich pflegen
System: Änderungen in der Historie vermerken
Administration: Zur Konformitätsprüfung einreichen
Ende: Entwurf eingereicht` },

  { name: 'Governance-Entwurf übernehmen (RMS)', kennung: 'Process_RMS_governance_entwurf',
    beschreibung: [
      'Entwürfe der Konzernregelungen entstehen bei Legal im Governance-Board. Das RMS zeigt sie mit Ordnerbaum, Vorschau und Versionsverlauf; bearbeitet wird in Office oder im Browser.',
      'Ist ein Entwurf reif, übernimmt die Administration ihn als Regelwerk. Der Editor öffnet sich mit dem Dokument, und der Entwurf geht durch dieselbe Prüfung und Freigabe wie jedes Regelwerk.',
      'Nach der Freigabe im RMS legt Legal die endgültige Fassung im Governance-Board ab und veröffentlicht sie dort.',
    ],
    norm: 'ISO 27001 Klausel 5.2 und 7.5',
    schritte: `Start: Regelungsentwurf liegt bei Legal
Legal: Entwurf im Governance-Board ablegen
Administration: Entwurf in Vorschau und Versionsverlauf sichten
Administration: Entwurf reif zur Prüfung? | nein: Anmerkungen an Legal geben | zurück: Entwurf im Governance-Board ablegen
Administration: Entwurf als Regelwerk übernehmen
Administration: Regelwerk freigeben lassen (Unterprozess)
Legal: Endgültige Fassung im Governance-Board ablegen
Legal: Regelung im Konzern veröffentlichen
Ende: Konzernregelung veröffentlicht` },

  { name: 'IMS-Dokument lenken (RMS)', kennung: 'Process_RMS_ims_dokument',
    beschreibung: [
      'Die Dokumente des integrierten Managementsystems liegen auf der ISMS-Site, nach Normen geordnet: ISO 9001, 14001, 45001, 50001 und 27001.',
      'Bearbeitet wird in Office oder im Browser; jede Speicherung ist eine neue Version, eine hochgeladene Fassung braucht eine Änderungsnotiz. Die Vertraulichkeit wird in der Liste gesetzt.',
      'Prüf- und Freigabestand sind nur Anzeige. Sie entstehen, wenn das Dokument als Regelwerk übernommen und freigegeben wird; das RMS schreibt Konformität und Freigabe dann an das Dokument zurück.',
    ],
    norm: 'ISO 27001 Klausel 7.5, A.5.12, A.5.13 und A.5.37',
    schritte: `Start: IMS-Dokument ist zu ändern
Administration: Dokument in der Vorschau öffnen
Administration: Dokument in Office oder im Browser bearbeiten
System: Neue Version in SharePoint anlegen
Administration: Vertraulichkeit einstufen
Administration: Freigabe nötig? | nein | Ende: Neue Version abgelegt
Administration: Dokument als Regelwerk übernehmen
Administration: Regelwerk freigeben lassen (Unterprozess)
System: Konformität und Freigabe zurückschreiben
Ende: Dokument geprüft und freigegeben` },

  { name: 'Regelwerk freigeben lassen (RMS)', kennung: 'Process_RMS_freigabe_workflow',
    beschreibung: [
      'Der Freigabe-Workflow eines Regelwerks: Konformitätsprüfung, Mitbestimmung bei Betroffenheit, Freigabe durch die Geschäftsleitung, Veröffentlichung.',
      'Jede Stufe entscheidet aus der Mail oder im Reiter „Freigaben". Jede Workflow-Mail nennt den Geltungsbereich und die bisherigen Zustimmungen, beginnend mit der Konzeptfreigabe.',
      'Ein „nicht konform" aus Prüfung, Mitbestimmung oder Freigabe schickt das Regelwerk mit Begründung zurück in die Prüfung; die Administration überarbeitet es, und die Prüfer stimmen neu ab. Die Reihenfolge von Mitbestimmung und Freigabe lässt sich je Regelwerk tauschen.',
      'Offene Stufen fasst ein täglicher Lauf nach. Prozessbeschreibungen aus dem Reiter „Prozesse" laufen als Arbeits-/Prozessanweisung durch denselben Workflow.',
    ],
    norm: 'ISO 27001 Klausel 5.3 und 7.5.2, A.5.1; NIS2 Art. 20',
    neben: ['Workflow-Erinnerungen versenden (RMS)'],
    schritte: `Start: Regelwerk zur Prüfung eingereicht
Konformitätsprüfer: Konformität prüfen (Unterprozess)
Administration: Prüfung bestanden? | nein: Regelwerk überarbeiten | zurück: Konformität prüfen
Betriebsrat: Mitbestimmung einholen (Unterprozess)
Administration: Mitbestimmung erteilt oder entbehrlich? | nein: Einwände einarbeiten | zurück: Konformität prüfen
Geschäftsleitung: Regelwerk freigeben (Unterprozess)
Administration: Freigabe erteilt? | nein: Regelwerk überarbeiten | zurück: Konformität prüfen
System: Regelwerk veröffentlichen
Ende: Regelwerk veröffentlicht` },

  { name: 'Konformität prüfen (RMS)', kennung: 'Process_RMS_konformitaet',
    beschreibung: [
      'Die Konformitätsprüfer bewerten fachlich, ob das Regelwerk den Vorgaben entspricht, etwa ISO 27001 und NIS2.',
      'Zuständig sind die globalen Prüfer oder die für dieses Regelwerk hinterlegten; eine eingetragene Vertretung darf ebenfalls entscheiden und wird als solche protokolliert.',
      'Jeder Prüfer erhält eine eigene Mail mit Dokument und Entscheidungsknöpfen. „Nicht konform" braucht eine Begründung. Konform ist das Regelwerk, wenn die Schwelle erreicht ist: alle Prüfer oder einer, je nach Einstellung.',
      'Dann geht es weiter zur Mitbestimmung oder direkt zur Freigabe, und die Konformität wird an ein verknüpftes IMS-Dokument zurückgeschrieben.',
    ],
    norm: 'ISO 27001 Klausel 7.5.2, A.5.1; NIS2 Art. 20',
    unter: ['Aus der Mail entscheiden (RMS)'],
    schritte: `Start: Regelwerk in Konformitätsprüfung
System: Prüf-Mail an jeden Prüfer einzeln senden
Warten: Votum der Prüfer
Konformitätsprüfer: Regelwerk und Dokument prüfen
Konformitätsprüfer: Regelwerk konform? | nein: Begründung erfassen | Ende: Regelwerk zurückgewiesen
System: Votum mit Person und Zeitpunkt protokollieren
System: Schwelle der Prüfer erreicht? | nein | zurück: Votum der Prüfer
System: Konformität an das IMS-Dokument zurückschreiben
Ende: Regelwerk konform` },

  { name: 'Mitbestimmung einholen (RMS)', kennung: 'Process_RMS_mitbestimmung',
    beschreibung: [
      'Ist im Editor ein Betriebsrat als betroffen angekreuzt, holt das RMS die Mitbestimmung ein, beim Konzernbetriebsrat und bei den Betriebsräten der betroffenen Werke.',
      'Die Mail geht an das Postfach des Betriebsrats, mit Dokument, Geltungsbereich, betroffenen Werken und den bisherigen Zustimmungen. Wer klickt, meldet sich mit dem eigenen Konto an; die Zugehörigkeit erkennt das RMS an der Adresse oder an der Gruppe aus den Einstellungen.',
      'Konform führt zur Freigabe, nicht konform mit Pflicht-Begründung zurück in die Konformitätsprüfung. Das Votum steht namentlich im Protokoll.',
      'Ohne Betroffenheit entfällt der Schritt.',
    ],
    norm: 'Betriebsverfassungsgesetz (Mitbestimmung); ISO 27001 Klausel 5.3',
    unter: ['Aus der Mail entscheiden (RMS)'],
    schritte: `Start: Regelwerk ist konform
System: Betriebsrat betroffen? | nein | Ende: Keine Mitbestimmung nötig
System: Dokument an KBR und Betriebsräte senden
Warten: Votum des Betriebsrats
Betriebsrat: Regelwerk beraten (manuell)
Betriebsrat: Zustimmung erteilen? | nein: Ablehnung begründen | Ende: Mitbestimmung nicht erteilt
System: Votum namentlich protokollieren
Ende: Mitbestimmung erteilt` },

  { name: 'Regelwerk freigeben (RMS)', kennung: 'Process_RMS_gl_freigabe',
    beschreibung: [
      'Die Geschäftsleitung, global oder je Regelwerk hinterlegt, gibt das geprüfte Regelwerk frei. Jede freigebende Person erhält eine eigene Mail mit Dokument, Geltungsbereich und den bisherigen Zustimmungen.',
      'Freigegeben ist das Regelwerk, wenn die Schwelle erreicht ist. Dann wird es veröffentlicht, Zeitpunkt und Freigebende werden vermerkt, und die Freigabe wird an ein verknüpftes IMS-Dokument zurückgeschrieben.',
      '„Zurück" gilt als nicht konform und schickt das Regelwerk mit Begründung in die Prüfung. Ein Fehlklick aus der Mail lässt sich auf der Ergebnisseite zurücknehmen.',
      'Wahlweise läuft dieser Schritt über Power Automate als Genehmigung in Outlook.',
    ],
    norm: 'ISO 27001 Klausel 5.3, A.5.1; NIS2 Art. 20',
    unter: ['Aus der Mail entscheiden (RMS)', 'Freigabe über Power Automate (RMS)'],
    schritte: `Start: Regelwerk wartet auf Freigabe
System: Freigabe-Mail an jede freigebende Person senden
Warten: Entscheidung der Geschäftsleitung
Geschäftsleitung: Regelwerk und Zustimmungen prüfen
Geschäftsleitung: Regelwerk freigeben? | nein: Zurückgabe begründen | Ende: Regelwerk nicht freigegeben
System: Freigabe mit Person und Zeitpunkt vermerken
System: Schwelle der Freigeber erreicht? | nein | zurück: Entscheidung der Geschäftsleitung
System: Status auf Veröffentlicht setzen
System: Freigabe an das IMS-Dokument zurückschreiben
Ende: Regelwerk freigegeben` },

  { name: 'Aus der Mail entscheiden (RMS)', kennung: 'Process_RMS_einklick',
    beschreibung: [
      'Prüfer, Betriebsrat und Geschäftsleitung entscheiden mit einem Klick in der Workflow-Mail, ohne das Portal zu suchen.',
      'Der Knopf trägt ein Einmal-Token der laufenden Runde. Die Seite meldet still per Single Sign-On an, prüft Rolle und Adressat und führt die Entscheidung ohne Rückfrage aus; nur eine Pflicht-Begründung wird abgefragt.',
      'Ein Knopf aus einer älteren Runde führt nur zum Vorgang. Klickt jemand anderes als der Adressat, bricht die Seite ab; eine eingetragene Vertretung darf entscheiden und wird so protokolliert. Ein Fehlklick lässt sich auf der Ergebnisseite zurücknehmen.',
    ],
    norm: 'ISO 27001 Klausel 5.3, A.5.1',
    schritte: `Start: Entscheidungsknopf in der Mail geklickt
System: Still per Single Sign-On anmelden
System: Token der laufenden Runde gültig? | nein: Vorgang ohne Entscheidung öffnen | Ende: Nichts entschieden
System: Angemeldete Person ist Adressat oder Vertretung? | nein: Kontowechsel anbieten | Ende: Entscheidung abgebrochen
System: Rolle für diese Stufe prüfen
Entscheidende: Pflicht-Begründung bei Ablehnung angeben
System: Entscheidung ausführen und protokollieren
System: Ergebnisseite mit Rückgängig zeigen
Entscheidende: Entscheidung richtig? | nein: Entscheidung rückgängig machen | Ende: Entscheidung zurückgenommen
Ende: Entscheidung gespeichert` },

  { name: 'Freigabe über Power Automate (RMS)', kennung: 'Process_RMS_power_automate',
    beschreibung: [
      'Wahlweise läuft die Freigabe der Geschäftsleitung, auf Wunsch auch die Konformitätsprüfung, über Power Automate: Microsoft verschickt eine Genehmigung, die direkt in Outlook beantwortet wird.',
      'In den Einstellungen wird je Etappe gewählt: aus, nur Freigabe oder Prüfung und Freigabe. Für diese Etappe verschickt das RMS keine eigene Mail.',
      'Der Flow startet, wenn der Status auf „Freigabe" springt, sperrt den Doppelstart und schreibt das Ergebnis in die Liste zurück. In Outlook erteilte Freigaben stehen im Audit Report als eigenes Ereignis.',
    ],
    norm: 'ISO 27001 Klausel 5.3, A.5.1',
    schritte: `Start: Status springt auf Freigabe
Power Automate: Doppelstart sperren (automatisch)
Power Automate: Genehmigung mit Dokument starten (automatisch)
Warten: Antwort in Outlook
Geschäftsleitung: Genehmigung erteilen? | nein: Ablehnung in Outlook begründen | Ende: Freigabe abgelehnt
Power Automate: Status, Freigebende und Zeitpunkt zurückschreiben (automatisch)
Power Automate: Sperre aufheben (automatisch)
Ende: Regelwerk über Outlook freigegeben` },

  { name: 'Workflow-Erinnerungen versenden (RMS)', kennung: 'Process_RMS_erinnerung_workflow',
    beschreibung: [
      'Ein täglicher Lauf in GitHub Actions fasst offene Workflow-Schritte nach, ohne dass jemand die App geöffnet hat: Konzeptprüfung, Konformitätsprüfung, Mitbestimmung und Freigabe.',
      'Erinnert wird nur, wer noch nicht entschieden hat, regelwerkseigene Prüfer und Freigeber zuerst. Die erste Erinnerung kommt nach 7 Tagen, danach alle 3 Tage, ab 14 Tagen zusätzlich an den Ersatz-Empfänger; alle Werte stehen in den Einstellungen, der Versand lässt sich pausieren.',
      'Die Mails tragen dieselben Entscheidungsknöpfe wie die erste Nachricht und gehen nur an Adressen der eigenen Domäne. Einträge eines Probelaufs bleiben außen vor.',
    ],
    norm: 'ISO 27001 Klausel 7.4 und 9.1, A.5.1',
    schritte: `Start: Täglicher Lauf um 06:00 UTC
Cron: Einstellungen und offene Vorgänge lesen
Cron: Erinnerungen aktiv? | nein | Ende: Lauf ohne Versand beendet
Cron: Heute ein Erinnerungstag? | nein | Ende: Heute keine Erinnerung
Cron: Ausstehende Entscheider ermitteln
Cron: Noch jemand offen? | nein | Ende: Alle haben entschieden
Cron: Erinnerung mit Entscheidungsknöpfen senden
Cron: Eskalationsgrenze erreicht? | nein | Ende: Erinnerung versendet
Cron: Ersatz-Empfänger zusätzlich anschreiben
Ende: Erinnerung eskaliert` },

  { name: 'Regelwerk veröffentlichen und bekanntgeben (RMS)', kennung: 'Process_RMS_bekanntgabe',
    beschreibung: [
      'Mit der letzten Freigabe ist das Regelwerk veröffentlicht und erscheint bei der Zielgruppe unter „Meine Regelwerke".',
      'Die freigebende Person entscheidet, ob die Zielgruppe informiert wird; eine reine Korrektur muss nicht die ganze Belegschaft erreichen. Die Mail geht an den Verteiler der Zielgruppe, nennt Titel, Version und was zu tun ist, verlinkt das Regelwerk und hängt das Dokument an.',
      'Zeitpunkt und Empfänger stehen in der Historie. Nachholen oder wiederholen lässt sich die Bekanntgabe im Audit Report.',
    ],
    norm: 'ISO 27001 Klausel 7.3 und 7.4, A.6.3',
    schritte: `Start: Regelwerk freigegeben
System: Regelwerk unter „Meine Regelwerke" anzeigen
Geschäftsleitung: Zielgruppe informieren? | nein | Ende: Veröffentlicht ohne Bekanntgabe
System: Verteiler der Zielgruppe hinterlegt? | nein: Fehlenden Verteiler melden | Ende: Bekanntgabe nicht möglich
System: Bekanntgabe mit Dokument an den Verteiler senden
System: Zeitpunkt und Empfänger in der Historie vermerken
Ende: Zielgruppe informiert` },

  { name: 'Kenntnisnahme bestätigen (RMS)', kennung: 'Process_RMS_kenntnisnahme',
    beschreibung: [
      'Mitarbeitende lesen die Regelwerke, die für ihre Zielgruppe veröffentlicht sind, und bestätigen die Kenntnisnahme. Das Häkchen wird erst nach kurzer Lesezeit oder nach dem Öffnen in SharePoint aktiv.',
      'Verlangt das Regelwerk einen Wissenstest, ist es erst mit bestandenem Test erledigt. Eine neue Version oder die fällige Wiederholung setzt die Bestätigung zurück, und der Ablauf beginnt neu.',
      'Gespeichert werden Zeitpunkt, Version, Ergebnis und Versuche; den Teilnahmenachweis kann jede Person an die eigene Adresse schicken. Die Auswertung dient dem Nachweis der Unterweisung, nicht der Leistungskontrolle.',
    ],
    norm: 'ISO 27001 Klausel 7.3, A.5.1 und A.6.3; NIS2 Art. 21 Abs. 2 g',
    schritte: `Start: Regelwerk für die Zielgruppe veröffentlicht
Mitarbeitende: Regelwerk unter „Meine Regelwerke" öffnen
Mitarbeitende: Dokument lesen
System: Bestätigung nach der Lesezeit freischalten
Mitarbeitende: Kenntnisnahme bestätigen
System: Bestätigung mit Version und Zeitpunkt speichern
System: Wissenstest verlangt? | nein | Ende: Regelwerk erledigt
Mitarbeitende: Wissenstest ablegen (Unterprozess)
Mitarbeitende: Teilnahmenachweis bei Bedarf mailen
Ende: Regelwerk mit Wissenstest erledigt` },

  { name: 'Wissenstest ablegen (RMS)', kennung: 'Process_RMS_wissenstest',
    beschreibung: [
      'Der Wissenstest weist nach, dass ein Regelwerk verstanden wurde. Ob es einen gibt und wo die Bestehensgrenze liegt (Standard 80 Prozent), legt die Administration je Regelwerk fest.',
      'Er startet erst nach bestätigter Kenntnisnahme. Fragen und Antworten werden bei jedem Versuch neu gemischt, genau eine Antwort je Frage ist richtig, und die Auswertung zeigt sofort die richtige Lösung.',
      'Nicht bestanden lässt sich beliebig oft wiederholen. Es zählt das beste Ergebnis; bestanden bleibt bestanden bis zur nächsten Version oder Wiederholung.',
    ],
    norm: 'ISO 27001 Klausel 7.2 und 7.3, A.6.3',
    schritte: `Start: Kenntnisnahme bestätigt
Mitarbeitende: Wissenstest starten
System: Fragen und Antworten mischen
Mitarbeitende: Alle Fragen beantworten und absenden
System: Antworten auswerten und Lösung zeigen
System: Bestes Ergebnis und Versuche speichern
Mitarbeitende: Test bestanden? | nein: Lösungen nachlesen | zurück: Wissenstest starten
Ende: Wissenstest bestanden` },

  { name: 'Regelwerk überprüfen (RMS)', kennung: 'Process_RMS_review',
    beschreibung: [
      'Die regelmäßige Überprüfung nach ISO 27001 A.5.1 anhand des Termins „Nächste Überprüfung", gebündelt im Reiter „Fälligkeiten": überfällig, fällig in 30 Tagen, später, ohne Termin.',
      'Die Administration erhält dazu eine Sammelmeldung. Geprüft werden Inhalt, Normbezug, Zuständigkeiten, Zielgruppe und das Dokument selbst, dazu offene Vorschläge und Ausnahmen.',
      'Danach steht fest, ob das Regelwerk unverändert gilt, geändert oder außer Kraft gesetzt wird. „+12 Monate" setzt den nächsten Termin auf heute plus zwölf Monate.',
    ],
    norm: 'ISO 27001 Klausel 9.3 und 10.1, A.5.1',
    schritte: `Start: Überprüfung fällig
Cron: Fällige Überprüfungen an die Administration melden
Administration: Regelwerk in den Fälligkeiten öffnen
Administration: Inhalt und Normbezug prüfen
Administration: Zuständigkeiten und Zielgruppe prüfen
Administration: Offene Vorschläge und Ausnahmen sichten
Administration: Ergebnis der Überprüfung festhalten
Ende: Überprüfung abgeschlossen` },

  { name: 'Regelwerk außer Kraft setzen (RMS)', kennung: 'Process_RMS_archiv',
    beschreibung: [
      'Ein veröffentlichtes Regelwerk wird archiviert, wenn es abgelöst wird oder wegfällt, auf Wunsch mit Grund, etwa „abgelöst durch …".',
      'Es verschwindet aus „Meine Regelwerke" und aus den Auswertungen, bleibt aber mit allen Bestätigungen und der Historie für Audits erhalten. Gelöscht wird nicht, denn sonst blieben Bestätigungen ohne Regelwerk zurück.',
      '„Reaktivieren" holt es als Entwurf zurück; dann läuft die Freigabe erneut.',
    ],
    norm: 'ISO 27001 Klausel 7.5.3, A.5.1',
    schritte: `Start: Regelwerk abgelöst oder entfallen
Administration: Nachfolge-Regelwerk vorhanden? | nein | weiter: Regelwerk archivieren
Administration: Nachfolger im Grund nennen
Administration: Regelwerk archivieren
System: Regelwerk aus „Meine Regelwerke" nehmen
System: Bestätigungen und Historie für Audits behalten
Ende: Regelwerk archiviert` },

  { name: 'Änderung vorschlagen (RMS)', kennung: 'Process_RMS_vorschlag',
    beschreibung: [
      'Wer in einem Regelwerk einen Fehler oder eine Verbesserung findet, schlägt die Änderung direkt aus der Detailansicht vor: was und warum.',
      'Der Vorschlag geht mit Direktlink zum Dokument per Mail an die Verantwortlichen, die einreichende Person erhält eine Kopie, weitere interne Empfänger lassen sich ergänzen. Im Reiter „Vorschläge" wird er mit Status und Kommentar bearbeitet: offen, in Bearbeitung, erledigt oder abgelehnt.',
      'Auch die Befunde des Dokument-Health-Checks werden so zu Vorschlägen.',
    ],
    norm: 'ISO 27001 Klausel 7.4 und 10.1, A.5.1',
    schritte: `Start: Fehler oder Verbesserung entdeckt
Mitarbeitende: Änderung im Regelwerk vorschlagen
System: Vorschlag mit Direktlink an die Verantwortlichen mailen
System: Kopie an die einreichende Person senden
ISMS-Team: Vorschlag im Reiter „Vorschläge" prüfen
ISMS-Team: Vorschlag umsetzen? | nein: Ablehnung kommentieren | Ende: Vorschlag abgelehnt
ISMS-Team: Status auf „In Bearbeitung" setzen
ISMS-Team: Regelwerk in neuer Version anpassen
ISMS-Team: Vorschlag als erledigt kommentieren
Ende: Vorschlag umgesetzt` },

  { name: 'Regelwerk-Dokumente prüfen (RMS)', kennung: 'Process_RMS_healthcheck',
    beschreibung: [
      'Der Dokument-Health-Check liest die angehängten Word-Dokumente direkt im Browser, deterministisch und ohne KI.',
      'Geprüft werden Inhalts-Dubletten, der Abgleich von Dokumenttitel und Regelwerk, offene Platzhalter, leere Pflichtkapitel, veraltete Begriffe aus einem pflegbaren Wörterbuch und die Version im Dokument gegen die im RMS.',
      'Je Regelwerk zeigt eine Ampel das Ergebnis. Aus den Befunden wird mit einem Klick ein vorausgefüllter Änderungsvorschlag.',
    ],
    norm: 'ISO 27001 Klausel 7.5.2 und 7.5.3, A.5.1',
    schritte: `Start: Dokumente zu prüfen
Administration: Prüfung der Dokumente starten
System: Word-Dokumente im Browser lesen
System: Dubletten, Titel und Platzhalter prüfen
System: Pflichtkapitel, Begriffe und Version prüfen
System: Ampel je Regelwerk setzen
Administration: Befunde vorhanden? | nein | Ende: Dokumente ohne Befund
Administration: Befunde als Änderungsvorschlag senden
ISMS-Team: Dokument in neuer Version korrigieren
Zurück: Prüfung der Dokumente starten` },

  { name: 'Ausnahme genehmigen (RMS)', kennung: 'Process_RMS_ausnahme',
    beschreibung: [
      'Eine dokumentierte, befristete Abweichung von einer Richtlinie im Ausnahmeregister. Der Reifegrad-Katalog verlangt in R130: mit Risikobewertung, befristet, Entscheidung dokumentiert, ISB einbezogen. Fehlt eines davon, verweigert das Register die Genehmigung.',
      'Bewertet wird Eintritt mal Auswirkung wie im Risiko-Register, optional mit einem Risiko verknüpft; ab einem Wert von 15 sind kompensierende Maßnahmen zu nennen. Ein Enddatum ist Pflicht, über zwölf Monate fragt das Register nach.',
      'Wer beantragt hat, kann nicht selbst genehmigen. Wurde außerhalb des RMS entschieden, etwa per Mail, werden Entscheider und Datum erfasst.',
      '„Abgelaufen" wird gerechnet, nicht gespeichert. Die Ausnahme erscheint an der Richtlinie; eine beendete Abweichung wird zurückgezogen statt gelöscht.',
    ],
    norm: 'ISO 27001 Klausel 6.1.3, A.5.36; Reifegrad-Katalog R130',
    schritte: `Start: Abweichung von einer Richtlinie nötig
Antragsteller: Ausnahme mit Richtlinie und Begründung beantragen
Antragsteller: Eintritt und Auswirkung bewerten
Antragsteller: Enddatum der Ausnahme festlegen
System: Risikowert 15 oder höher? | nein | weiter: Ausnahme bewerten und vermerken
Antragsteller: Kompensierende Maßnahmen benennen
ISB: Ausnahme bewerten und vermerken
Entscheidende: Ausnahme genehmigen? | nein: Ablehnung begründen | Ende: Ausnahme abgelehnt
System: Bedingungen aus R130 erfüllt? | nein: Genehmigung verweigern | zurück: Ausnahme mit Richtlinie und Begründung beantragen
System: Entscheidung mit Person und Datum vermerken
System: Ausnahme an der Richtlinie anzeigen
Warten: Enddatum erreicht
System: Ausnahme als abgelaufen zeigen
Ende: Ausnahme abgelaufen` },

  /* ═══ 2 · Unterweisung ═════════════════════════════════════════════════ */

  { name: 'Unterweisen und sensibilisieren (RMS)', kennung: 'Process_RMS_unterweisung',
    beschreibung: [
      'Wie das RMS sicherstellt, dass die Belegschaft ihre Regelwerke kennt und versteht, und wie die Unterweisung nachgewiesen wird.',
      'Pflicht sind die Kenntnisnahme veröffentlichter Regelwerke samt Wissenstest und die Pflichtschulungen im Reiter „Wissen". Freiwillig ist die Bibliothek mit Themen, Videos, Artikeln und Wissenstests.',
      'Offenes fasst ein täglicher Lauf nach. Der Audit Report zeigt Soll und Ist je Regelwerk, Abteilung und Person, je Pflichtschulung die Quote mit gültigem Abschluss.',
    ],
    norm: 'ISO 27001 Klausel 7.2, 7.3 und 9.1, A.6.3; NIS2 Art. 20 Abs. 2 und Art. 21 Abs. 2 g',
    neben: ['Kenntnisnahmen erinnern (RMS)', 'Wissen-Bibliothek pflegen (RMS)'],
    schritte: `Start: Regelwerk oder Schulung fällig
Mitarbeitende: Kenntnisnahme bestätigen (Unterprozess)
Mitarbeitende: Pflichtschulung absolvieren (Unterprozess)
Administration: Erfüllungsquote im Audit Report auswerten
Administration: Quote ausreichend? | nein: Zielgruppe erneut informieren | zurück: Kenntnisnahme bestätigen
Administration: Nachweis als Bericht oder CSV ablegen
Ende: Unterweisung nachgewiesen` },

  { name: 'Pflichtschulung absolvieren (RMS)', kennung: 'Process_RMS_pflichtschulung',
    beschreibung: [
      'Eine Schulung im Reiter „Wissen" besteht aus Modulen, die nacheinander durchgegangen werden, und endet mit einem Wissenstest; ohne Test ist sie mit dem letzten Modul abgeschlossen.',
      'Eine Pflichtschulung steht bei allen oben im Reiter, bis sie abgeschlossen ist, und wieder, wenn die Wiederholung fällig ist; der Abschluss trägt dann sein Ablaufdatum. „Gilt für" grenzt sie auf Werke ein.',
      'Der Startbestand bringt „Phishing erkennen" als jährliche Pflichtschulung mit.',
    ],
    norm: 'ISO 27001 Klausel 7.2 und 7.3, A.6.3; NIS2 Art. 20 Abs. 2',
    schritte: `Start: Pflichtschulung offen oder Wiederholung fällig
Mitarbeitende: Schulung im Reiter „Wissen" öffnen
Mitarbeitende: Module nacheinander durcharbeiten
System: Gelesene Module abhaken
Mitarbeitende: Abschlusstest ablegen
Mitarbeitende: Test bestanden? | nein: Module wiederholen | zurück: Abschlusstest ablegen
System: Abschluss mit Ablaufdatum speichern
Ende: Schulung abgeschlossen` },

  { name: 'Kenntnisnahmen erinnern (RMS)', kennung: 'Process_RMS_erinnerung_kenntnis',
    beschreibung: [
      'Der tägliche Lauf erinnert Mitarbeitende an veröffentlichte Pflicht-Regelwerke, die sie noch nicht bestätigt haben, und an offene oder auslaufende Pflichtschulungen. Jede Person erhält eine Mail über alle ihre offenen Punkte.',
      'Die erste Erinnerung kommt nach 7 Tagen, danach wöchentlich. Ab 21 Tagen geht eine Sammelmeldung an eine benannte Stelle: welches Regelwerk wie lange offen ist und wer fehlt. Sie geht nicht automatisch an Vorgesetzte, denn der Zweck ist der Nachweis der Unterweisung, keine Verhaltenskontrolle.',
      'Wer bestätigt, fällt sofort aus der Liste.',
    ],
    norm: 'ISO 27001 Klausel 7.3 und 7.4, A.6.3',
    schritte: `Start: Täglicher Lauf um 06:00 UTC
Cron: Mitarbeitende, Zielgruppen und Bestätigungen lesen
Cron: Offene Pflicht-Regelwerke je Person ermitteln
Cron: Offene Pflichtschulungen je Person ermitteln
Cron: Heute ein Erinnerungstag? | nein | Ende: Heute keine Erinnerung
Cron: Sammelmail an jede Person senden
Cron: Länger als 21 Tage offen? | nein | Ende: Erinnerungen versendet
Cron: Sammelmeldung an die benannte Stelle senden
Ende: Offene Kenntnisnahmen gemeldet` },

  { name: 'Wissen-Bibliothek pflegen (RMS)', kennung: 'Process_RMS_wissen_pflege',
    beschreibung: [
      'Die Bibliothek im Reiter „Wissen" ist für alle sichtbar und freiwillig: Themen, Videos, Artikel, Links, Wissenstests und Schulungen rund um Sicherheit, Datenschutz und die Regeln im Haus.',
      'Pflegen darf, wer Schreibrecht auf den Reiter hat. Fremdes Videomaterial braucht eine Quelle; „Sichtbar" nimmt einen Beitrag aus der Sicht, ohne ihn zu löschen. Werden die Fragen eines Tests geändert, gilt er als neu.',
      'Gespeichert wird in wissen.json; wer auf einem veralteten Stand speichert, wird abgewiesen. Die Auswertung zählt je Beitrag Personen, Tests und Bestandene.',
    ],
    norm: 'ISO 27001 Klausel 7.3, A.6.3',
    schritte: `Start: Thema oder Beitrag gewünscht
Redaktion: Pflegemodus einschalten
Redaktion: Thema anlegen oder wählen
Redaktion: Beitrag mit Art, Dauer und Inhalt erfassen
Redaktion: Sichtbarkeit und Geltung festlegen
System: Quelle bei fremdem Video vorhanden? | nein: Speichern verweigern | zurück: Beitrag mit Art, Dauer und Inhalt erfassen
System: Gespeicherter Stand noch aktuell? | nein: Neueren Stand laden | zurück: Beitrag mit Art, Dauer und Inhalt erfassen
System: Beitrag in der Bibliothek speichern
Ende: Beitrag veröffentlicht` },

  /* ═══ 3 · Normkonformität ══════════════════════════════════════════════ */

  { name: 'Normkonformität nachweisen (RMS)', kennung: 'Process_RMS_normkonformitaet',
    beschreibung: [
      'Wie das RMS zeigt, welche Anforderungen aus Normen und Recht durch Regelwerke abgedeckt sind, was davon im ISMS anwendbar und umgesetzt ist und wie reif der Betrieb ist.',
      'Die Abdeckung rechnet über 215 Anforderungen aus 15 Gruppen, die Erklärung zur Anwendbarkeit entscheidet über die 93 Controls aus Anhang A, der Reifegrad bewertet den Katalog „IT und OT Betrieb" je Werk.',
      'Das Cockpit zeigt die Kennzahlen laufend. Der Audit Report bündelt Erfüllungsquote, Freigabe-Audit und die Lücken aller Register; der C-Level-Bericht fasst das für die Geschäftsleitung zusammen.',
    ],
    norm: 'ISO 27001 Klausel 4.3, 6.1.3 d, 9.1 und 9.3; NIS2 Art. 21 Abs. 2',
    schritte: `Start: Nachweis zur Normkonformität gefragt
Administration: Kennzahlen im Cockpit verfolgen
Administration: Normabdeckung bewerten (Unterprozess)
Administration: Erklärung zur Anwendbarkeit pflegen (Unterprozess)
Administration: Reifegrad IT/OT bewerten (Unterprozess)
System: Audit Report aus allen Registern zusammenstellen
Administration: Lücken im Audit Report sichten
Administration: Lücken geschlossen oder geplant? | nein: Maßnahme umsetzen (Unterprozess) | zurück: Lücken im Audit Report sichten
Administration: Berichte als PDF oder CSV ablegen
Administration: C-Level-Bericht versenden (Unterprozess)
Ende: Normkonformität nachgewiesen` },

  { name: 'Normabdeckung bewerten (RMS)', kennung: 'Process_RMS_abdeckung',
    beschreibung: [
      'Die Heatmap im Reiter „IMS-Abdeckung" zeigt je Anforderung, ob ein Regelwerk sie abdeckt: grün gespeichert im Normbezug, gelb vorläufig aus der Review-Zuordnung, rot eine Lücke.',
      'Oben stehen die Quoten für Anhang A und NIS2, getrennt davon die weiteren Regelwerke, darunter die Lückenliste für ISO 27001. Vorläufige Zuordnungen lassen sich in den Normbezug der Regelwerke übernehmen.',
      'Report und CSV dienen als Auditnachweis.',
    ],
    norm: 'ISO 27001 Klausel 4.3, Anhang A; NIS2 Art. 21 Abs. 2',
    schritte: `Start: Abdeckung zu bewerten
System: Normbezug aller Regelwerke auswerten
Administration: Heatmap und Quoten sichten
Administration: Vorläufige Zuordnungen korrekt? | nein: Normbezug im Regelwerk korrigieren | zurück: Heatmap und Quoten sichten
Administration: Review-Zuordnungen in den Normbezug speichern
Administration: Lückenliste prüfen
Administration: Lücken durch Regelwerk oder Konzept schließen
Administration: Report oder CSV als Nachweis ablegen
Ende: Abdeckung dokumentiert` },

  { name: 'Erklärung zur Anwendbarkeit pflegen (RMS)', kennung: 'Process_RMS_soa',
    beschreibung: [
      'Die Erklärung zur Anwendbarkeit (SoA) entscheidet je Control aus Anhang A: anwendbar oder ausgeschlossen, Umsetzungsstatus und Begründung; ein Ausschluss braucht immer eine Begründung.',
      'Klauseln, NIS2 und Gesetze stehen mit „gilt immer" daneben; bei ihnen wird nur der Umsetzungsstatus gepflegt. „Aus Abdeckung vorbelegen" setzt offene Controls auf anwendbar und leitet den Status aus der Abdeckung ab, ohne Gepflegtes zu überschreiben.',
      'Gespeichert wird versioniert mit Person und Zeitpunkt. Unter einem Control steht der jüngste Nachweis aus Microsoft 365, den das Compliance-Cockpit gesichert hat.',
    ],
    norm: 'ISO 27001 Klausel 4.3 und 6.1.3 d, Anhang A; NIS2 Art. 21 Abs. 2',
    schritte: `Start: SoA neu oder zu aktualisieren
Administration: Status aus der Abdeckung vorbelegen
Administration: Je Control die Anwendbarkeit entscheiden
Administration: Umsetzungsstatus je Control setzen
Administration: Nachweise aus dem Compliance-Cockpit abgleichen
System: Jeder Ausschluss begründet? | nein: Speichern verweigern | zurück: Je Control die Anwendbarkeit entscheiden
System: SoA mit Version, Person und Zeitpunkt speichern
Administration: SoA-Report als Nachweis drucken
Ende: SoA aktuell` },

  { name: 'Reifegrad IT/OT bewerten (RMS)', kennung: 'Process_RMS_reifegrad',
    beschreibung: [
      'Gap- und Reifegradbewertung des Betriebs-Katalogs „IT und OT Betrieb" je Maßnahme und Werk mit einer Ampel: funktioniert, teilweise, nicht gelebt oder keine Einschätzung.',
      'Beim ersten Öffnen ist die Ampel aus dem Dokument vorbelegt und gilt für alle Werke gleich; danach wird je Werk verfeinert. Eigene Maßnahmen und Themen lassen sich ergänzen, Katalog-Maßnahmen umkehrbar ausblenden.',
      'Handlungsbedarf zeigt sich in Kennzahlen je Werk und Thema und geht in den C-Level-Bericht ein.',
    ],
    norm: 'ISO 27001 Klausel 8.1 und 9.1; NIS2 Art. 21 Abs. 2',
    schritte: `Start: Reifegrad zu bewerten
System: Ampel aus dem Katalog vorbelegen
Administration: Je Werk und Maßnahme die Ampel setzen
Administration: Eigene Maßnahmen und Themen ergänzen
Administration: Bewertung speichern
Administration: Handlungsbedarf rot oder gelb? | nein | Ende: Betrieb ohne Handlungsbedarf
Maßnahmenverantwortliche: Maßnahme umsetzen (Unterprozess)
Ende: Handlungsbedarf in Umsetzung` },

  { name: 'C-Level-Bericht versenden (RMS)', kennung: 'Process_RMS_clevel',
    beschreibung: [
      'Der Management-Bericht aus dem Audit Report: Gesamteinschätzung als Ampel, die wesentlichen Kennzahlen und eine Prüfung der Normkonformität nach ISO 27001 und NIS2 je Kapitel.',
      'Die Vorschau zeigt die Empfänger aus den Einstellungen, die Zeile lässt sich ändern. Der Bericht wird gedruckt, als PDF gesichert oder per Mail an die Geschäftsleitung geschickt.',
    ],
    norm: 'ISO 27001 Klausel 5.1, 9.1 und 9.3; NIS2 Art. 20',
    schritte: `Start: Managementbericht fällig
System: Kennzahlen und Reifegrad zusammenstellen
System: Normkonformität je Kapitel prüfen
Administration: Vorschau und Empfänger prüfen
Administration: Bericht versenden? | nein: Als PDF drucken | Ende: Bericht als PDF gesichert
System: Bericht per Mail an die Geschäftsleitung senden
Ende: Bericht versendet` },

  /* ═══ 4 · Risiken ══════════════════════════════════════════════════════ */

  { name: 'Informationssicherheitsrisiken behandeln (RMS)', kennung: 'Process_RMS_risiko',
    beschreibung: [
      'Das Risikomanagement nach ISO 27001 und NIS2 im Risiko-Register: erfassen, bewerten, behandeln, überwachen.',
      'Bewertet wird brutto vor und netto nach Maßnahmen, je Eintrittswahrscheinlichkeit mal Auswirkung auf einer Skala von 1 bis 5; ab 15 ist ein Risiko hoch, ab 8 mittel. Je Risiko werden Schutzziele, betroffene Assets, Controls und Regelwerke verknüpft.',
      'Die Strategie ist mitigieren, vermeiden, übertragen oder akzeptieren; eine Akzeptanz braucht eine Begründung. Maßnahmen tragen Verantwortliche und Fristen.',
      'Zum Termin der Wiedervorlage wird neu bewertet. Statt zu löschen wird ein Risiko geschlossen, so bleibt die Historie für das Audit.',
    ],
    norm: 'ISO 27001 Klausel 6.1.2, 6.1.3, 8.2 und 8.3; NIS2 Art. 21 Abs. 1 und 2 a',
    neben: ['Ausnahme genehmigen (RMS)', 'Sammelmeldungen versenden (RMS)'],
    schritte: `Start: Risiko erkannt
Administration: Risiko mit Kategorie und Eigner erfassen
Risikoeigner: Schutzziele, Assets und Controls zuordnen
Risikoeigner: Bruttorisiko bewerten
Risikoeigner: Behandlungsstrategie wählen
Risikoeigner: Maßnahmen nötig? | nein: Risikoakzeptanz begründen | weiter: Restrisiko bewerten
Maßnahmenverantwortliche: Maßnahme umsetzen (Unterprozess)
Risikoeigner: Restrisiko bewerten
Risikoeigner: Restrisiko tragbar? | nein: Weitere Maßnahme festlegen | zurück: Maßnahme umsetzen
System: Status und Historie fortschreiben
Warten: Termin der Wiedervorlage
Risikoeigner: Risiko weiter relevant? | nein: Risiko schließen | Ende: Risiko geschlossen
Zurück: Bruttorisiko bewerten` },

  { name: 'Sammelmeldungen versenden (RMS)', kennung: 'Process_RMS_digests',
    beschreibung: [
      'Neben den Erinnerungen schickt der tägliche Lauf der Administration Sammelmeldungen aus den Registern, je eine Mail, wenn etwas offen ist.',
      'Wiedervorlage: fällige und überfällige Überprüfungen der Regelwerke. Risiken: überfällige Maßnahmen und Risiko-Reviews. Ausnahmen: abgelaufene, in 30 Tagen auslaufende und unentschiedene. Wirksamkeit: überfällige Maßnahmen und unvollständige Nachweise.',
      'Notfall: kritische Prozesse ohne Plan, fällige Übungen, veraltete Krisenstäbe. Assets: auslaufender Support, fehlende Verantwortliche und Zeiten. Vorfälle: unbeurteilte Ereignisse, überfällige Meldefristen, erledigte Vorfälle ohne Lehre.',
      'Fehlt eine Liste, wird die Meldung übersprungen. Reste eines Probelaufs meldet der Lauf einmal die Woche der Person, die sie angelegt hat.',
    ],
    norm: 'ISO 27001 Klausel 9.1 und 10.1',
    schritte: `Start: Täglicher Lauf um 06:00 UTC
Cron: Administratoren aus den Einstellungen lesen
Cron: Wiedervorlagen der Regelwerke prüfen
Cron: Risiken und Ausnahmen prüfen
Cron: Register „Wirksamkeit" prüfen
Cron: Notfallvorsorge und Assets prüfen
Cron: Vorfälle aus dem Ticketsystem prüfen
Cron: Etwas offen? | nein | Ende: Nichts zu melden
Cron: Je Register eine Sammelmail senden
Ende: Administration informiert` },

  /* ═══ 5 · Ziele, Maßnahmen, Kennzahlen ═════════════════════════════════ */

  { name: 'Ziele, Maßnahmen und Kennzahlen steuern (RMS)', kennung: 'Process_RMS_ziele',
    beschreibung: [
      'Die Planung und Überwachung des ISMS mit den Listen „ISMS Ziele", „Maßnahmen", „Kennzahlen" und „Kennzahlen Tracking" der ISMS-Site; das RMS pflegt sie mit ihren Spalten, wie sie sind.',
      'Ein Ziel braucht nach der Konzernrichtlinie Zieleplanung und -erreichung Verantwortung, Termin, Messung, mindestens eine Maßnahme und Ressourcen. Abgeschlossen wird es mit der Angabe, ob es erreicht ist; ein überschrittener Termin gehört ins Management Review.',
      'Kennzahlen werden im Turnus gemessen, die Ampel folgt aus dem Normalwert.',
    ],
    norm: 'ISO 27001 Klausel 6.2, 9.1, 9.3 und 10.1',
    schritte: `Start: Ziel für das ISMS gesetzt
Zielverantwortliche: Ziel mit Termin und Messung anlegen
Zielverantwortliche: Maßnahmen zur Zielerreichung verknüpfen
Maßnahmenverantwortliche: Maßnahme umsetzen (Unterprozess)
Kennzahlverantwortliche: Kennzahl messen (Unterprozess)
Zielverantwortliche: Status des Ziels fortschreiben
Warten: Termin des Ziels erreicht
Zielverantwortliche: Ziel erreicht? | nein: Begründung in der Bemerkung erfassen | Ende: Ziel verfehlt, Thema fürs Management Review
Zielverantwortliche: Ziel mit Zielerreichung abschließen
Ende: Ziel erreicht` },

  { name: 'Maßnahme umsetzen (RMS)', kennung: 'Process_RMS_massnahme',
    beschreibung: [
      'Wie eine Maßnahme im ISMS bis zum Abschluss kommt, gleich aus welchem Register sie stammt: Liste „Maßnahmen", Risiko-Register oder Register „Wirksamkeit" (Abweichungen, Managementbewertungen, Notfallübungen).',
      'Gepflegt wird jede Maßnahme dort, wo sie entstanden ist; die Gesamtliste im Reiter „Maßnahmen" zeigt alle und führt mit einem Klick hin.',
      'Eine Maßnahme braucht Verantwortung, geplanten Termin und Herkunft, abgeschlossen auch ein Umsetzungsdatum. Überfällige Fristen werden rot und erscheinen in Cockpit, Fälligkeiten und Sammelmeldung.',
    ],
    norm: 'ISO 27001 Klausel 6.1.3, 6.2, 10.1 und 10.2',
    schritte: `Start: Maßnahme beschlossen
Administration: Maßnahme mit Herkunft und Controls erfassen
Administration: Verantwortung und geplanten Termin festlegen
Maßnahmenverantwortliche: Maßnahme durchführen
Maßnahmenverantwortliche: Status fortschreiben
Maßnahmenverantwortliche: Fristgerecht erledigt? | nein: Termin neu planen | zurück: Maßnahme durchführen
Maßnahmenverantwortliche: Umsetzungsdatum eintragen und abschließen
Ende: Maßnahme abgeschlossen` },

  { name: 'Kennzahl messen (RMS)', kennung: 'Process_RMS_kennzahl',
    beschreibung: [
      'Kennzahlen nach ISO 27001 9.1: was gemessen wird, wie, wie oft, von wem und was herauskam. Je Kennzahl Typ, Turnus, Einheit, Verantwortung, Normalwert, Messung und Zweck.',
      'Messwerte stehen in „Kennzahlen Tracking". Die Ampel folgt aus dem Normalwert, der Trend aus den letzten Werten; die nächste Messung ergibt sich aus dem Turnus.',
      'Werte, die ohnehin im RMS entstehen, misst die App selbst: Kenntnisnahme-Quote, Abdeckung, offene hohe Risiken, überfällige Maßnahmen, abgelaufene Ausnahmen, unbeurteilte Vorfälle.',
    ],
    norm: 'ISO 27001 Klausel 9.1; ISO 9001 Abschnitt 4.4',
    schritte: `Start: Messung laut Turnus fällig
Kennzahlverantwortliche: Wert im RMS messbar? | nein: Wert außerhalb erheben (manuell) | weiter: Messwert mit Datum eintragen
System: Wert aus den Registern messen
Kennzahlverantwortliche: Messwert mit Datum eintragen
System: Ampel aus dem Normalwert bestimmen
System: Trend und nächste Messung berechnen
Kennzahlverantwortliche: Ampel grün? | nein: Maßnahme umsetzen (Unterprozess) | Ende: Abweichung in Behandlung
Ende: Kennzahl im Soll` },

  /* ═══ 6 · Wirksamkeit ══════════════════════════════════════════════════ */

  { name: 'Wirksamkeit prüfen und verbessern (RMS)', kennung: 'Process_RMS_wirksamkeit',
    beschreibung: [
      'Der Nachweis, dass das ISMS wirkt, im Register „Wirksamkeit": interne Audits, Managementbewertungen, Abweichungen mit Korrekturmaßnahmen, Notfallübungen und Funktionsprüfungen des RMS, ein Register mit fünf Satzarten.',
      'Feststellungen aus Audit, Übung, Vorfall oder Prüfung werden als Abweichungen mit ihrer Herkunft angelegt, so hängen sie sichtbar zusammen.',
      'Abgeschlossen wird erst, wenn die Pflichtangaben vollständig sind; die Spalte „Nachweis" nennt, was noch fehlt. Statt zu löschen wird verworfen.',
    ],
    norm: 'ISO 27001 Klausel 9.2, 9.3, 10.1 und 10.2',
    neben: ['Sammelmeldungen versenden (RMS)'],
    schritte: `Start: Auditprogramm geplant
Auditor: Internes Audit durchführen (Unterprozess)
Administration: Abweichungen festgestellt? | nein | weiter: Managementbewertung durchführen
Fachbereich: Abweichung korrigieren (Unterprozess)
Geschäftsleitung: Managementbewertung durchführen (Unterprozess)
Geschäftsleitung: Verbesserung beschlossen? | nein | Ende: ISMS ohne Änderung bestätigt
Maßnahmenverantwortliche: Maßnahme umsetzen (Unterprozess)
Ende: ISMS fortlaufend verbessert` },

  { name: 'Internes Audit durchführen (RMS)', kennung: 'Process_RMS_audit',
    beschreibung: [
      'Ein internes Audit nach ISO 27001 9.2 als Satzart im Register „Wirksamkeit". Abschließen lässt es sich erst mit Umfang und Kriterien, Auditoren und Ergebnis.',
      'Jede Feststellung wird als eigene Abweichung angelegt und trägt das Audit als Herkunft; das Audit zeigt umgekehrt seine Abweichungen.',
      'Der Freigabe-Audit im Audit Report belegt zusätzlich, wer wann was geprüft und freigegeben hat.',
    ],
    norm: 'ISO 27001 Klausel 9.2',
    schritte: `Start: Audit laut Programm fällig
Auditor: Audit mit Umfang und Kriterien anlegen
Auditor: Auditoren und Termin festlegen
Auditor: Audit durchführen (manuell)
Auditor: Nachweise im RMS und im Audit Report prüfen
Auditor: Feststellungen gefunden? | nein | weiter: Auditergebnis festhalten
Auditor: Feststellungen als Abweichungen anlegen
Auditor: Auditergebnis festhalten
System: Pflichtangaben vollständig? | nein: Abschluss verweigern | zurück: Auditergebnis festhalten
Auditor: Audit abschließen
Ende: Audit abgeschlossen` },

  { name: 'Managementbewertung durchführen (RMS)', kennung: 'Process_RMS_mreview',
    beschreibung: [
      'Die Managementbewertung nach ISO 27001 9.3 als Satzart im Register „Wirksamkeit".',
      'Sie braucht alle acht Pflichteingaben aus 9.3.2 als Haken, die Teilnehmenden und die Entscheidungen; fehlt ein Haken, nennt das Register ihn beim Namen.',
      'Eingaben liefern Cockpit, Audit Report, Ziele, Kennzahlen, Risiken und Vorfälle; beschlossene Verbesserungen werden Maßnahmen.',
    ],
    norm: 'ISO 27001 Klausel 9.3 und 10.1',
    schritte: `Start: Managementbewertung terminiert
ISB: Eingaben aus Cockpit und Audit Report zusammenstellen
ISB: Ziele, Kennzahlen, Risiken und Vorfälle aufbereiten
Geschäftsleitung: Bewertung durchführen (manuell)
ISB: Pflichteingaben und Teilnehmende erfassen
Geschäftsleitung: Entscheidungen festhalten
System: Alle acht Pflichteingaben abgehakt? | nein: Fehlende Eingabe nennen | zurück: Pflichteingaben und Teilnehmende erfassen
ISB: Maßnahmen aus den Entscheidungen anlegen
Ende: Managementbewertung abgeschlossen` },

  { name: 'Abweichung korrigieren (RMS)', kennung: 'Process_RMS_abweichung',
    beschreibung: [
      'Nichtkonformität und Korrekturmaßnahme nach ISO 27001 10.2. Eine Abweichung stammt aus Audit, Übung, Vorfall, Funktionsprüfung oder Beobachtung und trägt ihre Herkunft.',
      'Abschließen verlangt die Ursache statt des Symptoms, mindestens eine erledigte Maßnahme und eine Wirksamkeitsbewertung. Der dritte Schritt wird gern übersprungen: „Maßnahme erledigt" heißt nicht „Problem behoben".',
      'Eine abgeschlossene Abweichung ohne Wirksamkeitsbeleg zählt im Audit Report als Lücke.',
    ],
    norm: 'ISO 27001 Klausel 10.2',
    schritte: `Start: Abweichung festgestellt
Administration: Abweichung mit Herkunft erfassen
Fachbereich: Ursache analysieren
Fachbereich: Korrekturmaßnahme festlegen
Maßnahmenverantwortliche: Maßnahme umsetzen (Unterprozess)
Administration: Wirksamkeit der Maßnahme bewerten
Administration: Maßnahme wirksam? | nein: Ursache neu bewerten | zurück: Ursache analysieren
System: Nachweis vollständig? | nein: Abschluss verweigern | zurück: Wirksamkeit der Maßnahme bewerten
Administration: Abweichung abschließen
Ende: Abweichung behoben` },

  /* ═══ 7 · Vorfälle ═════════════════════════════════════════════════════ */

  { name: 'Sicherheitsvorfälle behandeln (RMS)', kennung: 'Process_RMS_vorfall',
    beschreibung: [
      'Sicherheitsvorfälle und -ereignisse kommen aus dem Ticketsystem, erkannt an der Kategorie des Tickets. Bearbeitet wird das Ticket dort; das RMS schreibt nie hinein und legt die Bewertung nach ISO 27001 darüber.',
      'Jedes Ereignis wird binnen zwei Tagen beurteilt: Ereignis oder Sicherheitsvorfall. Ein erheblicher Vorfall löst die Meldefristen nach NIS2 aus, Personendaten die Meldung nach DSGVO.',
      'Ab der Stufe Notfall übernimmt der Krisenstab des Werks. Erledigt ist ein Vorfall erst mit Ursache, Reaktion und Lehren; Korrekturmaßnahmen laufen über das Register „Wirksamkeit". Die Vorfallakte fasst alles als PDF zusammen.',
      'Änderungen und Dokumentationsaufträge aus dem Ticketsystem zeigt der Reiter in eigenen Abschnitten.',
    ],
    norm: 'ISO 27001 Klausel 10.2, A.5.24 bis A.5.28; NIS2 Art. 23; DSGVO Art. 33',
    neben: ['Sammelmeldungen versenden (RMS)'],
    schritte: `Start: Ticket mit Sicherheitsbezug angelegt
Service-Desk: Ticket im Ticketsystem bearbeiten
System: Ticket über die Kategorie einlesen
ISB: Ereignis binnen zwei Tagen beurteilen
ISB: Sicherheitsvorfall? | nein: Als Ereignis dokumentieren | Ende: Ereignis ohne Vorfall dokumentiert
ISB: Eskalationsstufe festlegen
ISB: Notfall oder Krise? | nein | weiter: Meldepflichten erfüllen
Krisenstab: Ausfall bewältigen (Unterprozess)
ISB: Meldepflichten erfüllen (Unterprozess)
ISB: Ursache, Reaktion und Lehren festhalten
ISB: Ablageort der Beweismittel vermerken
ISB: Korrekturmaßnahme nötig? | nein | weiter: Vorfallakte als PDF erstellen
Fachbereich: Abweichung korrigieren (Unterprozess)
ISB: Vorfallakte als PDF erstellen
Ende: Vorfall abgeschlossen` },

  { name: 'Meldepflichten erfüllen (RMS)', kennung: 'Process_RMS_meldung',
    beschreibung: [
      'Ist ein Sicherheitsvorfall erheblich im Sinne von NIS2, laufen die Fristen ab Kenntnis: Frühwarnung binnen 24 Stunden, Meldung binnen 72 Stunden, Abschlussbericht binnen eines Monats nach der Meldung. Sind Personendaten betroffen, kommt die Meldung an die Aufsichtsbehörde binnen 72 Stunden hinzu.',
      'Gemeldet wird außerhalb des RMS über die Meldestellen; das RMS hält je Frist den Zeitpunkt der Erledigung fest. Überfällige Fristen sind rot, eine verspätete Meldung bleibt sichtbar.',
    ],
    norm: 'NIS2 Art. 23; BSIG; DSGVO Art. 33',
    schritte: `Start: Sicherheitsvorfall beurteilt
ISB: Vorfall erheblich nach NIS2? | nein | weiter: Personendaten betroffen?
ISB: Frühwarnung binnen 24 Stunden abgeben (manuell)
ISB: Meldung binnen 72 Stunden abgeben (manuell)
ISB: Abschlussbericht binnen eines Monats abgeben (manuell)
System: Erledigung je Frist mit Zeitpunkt vermerken
ISB: Personendaten betroffen? | nein | Ende: Meldepflichten nach NIS2 erfüllt
Datenschutz: Aufsichtsbehörde binnen 72 Stunden informieren (manuell)
System: Meldung an die Aufsichtsbehörde vermerken
Ende: Meldepflichten nach NIS2 und DSGVO erfüllt` },

  /* ═══ 8 · Notfallvorsorge ══════════════════════════════════════════════ */

  { name: 'Notfallvorsorge betreiben (RMS)', kennung: 'Process_RMS_notfall',
    beschreibung: [
      'Business Continuity nach BSI-Standard 200-4 und ISO 22301 im Reiter „Notfall & Krisenstab". Der Plan hängt am Prozess, nicht am Asset: Jede Kachel der Prozesslandkarte trägt ihre Business-Impact-Analyse, ihre Assets und ihren Notfallplan.',
      'Kritische Prozesse brauchen RTO und RPO, einen Plan, Kontakte und eine Übung binnen zwölf Monaten. Der Krisenstab je Werk regelt Rollen, Alarmierung, Treffpunkt und Kanäle; die Eskalationsstufen Störung, Notfall und Krise ergeben sich aus RTO und MTPD.',
      'Notfallhandbuch und Alarmkarte gibt es bewusst auch auf Papier.',
    ],
    norm: 'ISO 27001 A.5.29 und A.5.30; ISO 22301; BSI-Standard 200-4; NIS2 Art. 21 Abs. 2 c; Reifegrad R071 und R093',
    neben: ['Ausfall bewältigen (RMS)', 'Sammelmeldungen versenden (RMS)'],
    schritte: `Start: Prozess in der Landkarte erfasst
Prozessverantwortliche: Business-Impact-Analyse durchführen (Unterprozess)
Prozessverantwortliche: Prozess kritisch? | nein | Ende: Kein Notfallplan nötig
Prozessverantwortliche: Notfallplan erstellen (Unterprozess)
Notfallmanagement: Krisenstab aufstellen (Unterprozess)
Notfallmanagement: Notfallübung durchführen (Unterprozess)
Notfallmanagement: Notfallhandbuch und Alarmkarte drucken
Warten: Zwölf Monate seit der letzten Übung
Zurück: Notfallübung durchführen` },

  { name: 'Business-Impact-Analyse durchführen (RMS)', kennung: 'Process_RMS_bia',
    beschreibung: [
      'Die Business-Impact-Analyse an der Kachel eines Prozesses: Kritikalität, maximal tolerierbare Ausfallzeit (MTPD), Wiederanlaufzeit (RTO) und tolerierbarer Datenverlust (RPO), dazu die Assets, von denen der Prozess abhängt.',
      'Ist ein Prozess kritisch, sind RTO und RPO Pflicht, sonst wird nicht gespeichert. Die RTO muss unter der MTPD liegen und darf nicht kürzer sein als die Wiederherstellzeit des langsamsten Assets; Widersprüche stehen als Lücke da.',
      'Gespeichert wird in derselben Datei wie die Landkarte.',
    ],
    norm: 'ISO 27001 A.5.30; BSI-Standard 200-4; Reifegrad R093',
    schritte: `Start: Prozess zu bewerten
Prozessverantwortliche: Kritikalität festlegen
Prozessverantwortliche: MTPD, RTO und RPO angeben
Prozessverantwortliche: Abhängige Assets zuordnen
System: Pflichtzeiten bei hoher Kritikalität vorhanden? | nein: Speichern verweigern | zurück: MTPD, RTO und RPO angeben
System: RTO gegen MTPD und Asset-Zeiten prüfen
System: Zahlen widerspruchsfrei? | nein: Lücke anzeigen | Ende: BIA mit Lücke gespeichert
System: BIA an der Kachel speichern
Ende: BIA abgeschlossen` },

  { name: 'Notfallplan erstellen (RMS)', kennung: 'Process_RMS_notfallplan',
    beschreibung: [
      'Der Notfallplan eines Prozesses in der Reihenfolge, in der er gebraucht wird: Sofortmaßnahmen, Notbetrieb und Wiederanlauf sind Pflicht, Rückkehr zum Normalbetrieb und Voraussetzungen kommen dazu. Kurz und konkret, für jemanden, der den Prozess nicht kennt.',
      'Dazu Kontakte als Rollen und eine verantwortliche Person. Ein halber Plan wird trotzdem gespeichert, denn im Ernstfall ist er besser als keiner; was fehlt, steht als Lücke in Reiter, Cockpit und Audit Report.',
    ],
    norm: 'ISO 27001 A.5.29 und A.5.30; BSI-Standard 200-4',
    schritte: `Start: Kritischer Prozess ohne Plan
Prozessverantwortliche: Sofortmaßnahmen beschreiben
Prozessverantwortliche: Notbetrieb beschreiben
Prozessverantwortliche: Wiederanlauf beschreiben
Prozessverantwortliche: Rückkehr und Voraussetzungen ergänzen
Prozessverantwortliche: Kontakte als Rollen eintragen
System: Plan an der Kachel speichern
System: Pflichtteile vollständig? | nein: Lücke in Cockpit und Audit Report zeigen | Ende: Plan mit Lücke gespeichert
Prozessverantwortliche: Plan drucken und ablegen
Ende: Notfallplan vollständig` },

  { name: 'Krisenstab aufstellen (RMS)', kennung: 'Process_RMS_krisenstab',
    beschreibung: [
      'Je Werk ein Krisenstab nach BSI 200-4 mit acht Rollen, Namen, Nummern und Vertretungen, dazu Alarmierungskette, Treffpunkt, Kommunikations- und Ersatzkanal und externe Stellen.',
      'Jede Eskalationsstufe braucht jemanden, der sie ausruft, und eine Angabe, wen er alarmiert. Fehlen Leitung, Vertretung, Nummern, Treffpunkt oder Kanäle, ist das eine Lücke im Audit Report.',
      'Nach zwölf Monaten ohne Aktualisierung mahnt der tägliche Lauf, denn Telefonnummern veralten schneller als Pläne.',
    ],
    norm: 'ISO 27001 A.5.29; BSI-Standard 200-4; Reifegrad R071',
    schritte: `Start: Werk ohne aktuellen Krisenstab
Notfallmanagement: Rollen aus der Vorlage übernehmen
Notfallmanagement: Namen, Nummern und Vertretungen eintragen
Notfallmanagement: Alarmierungskette und Treffpunkt festlegen
Notfallmanagement: Kommunikations- und Ersatzkanal festlegen
Notfallmanagement: Ausrufer je Eskalationsstufe benennen
System: Pflichtangaben vollständig? | nein: Lücke im Audit Report zeigen | Ende: Krisenstab mit Lücke gespeichert
Notfallmanagement: Alarmkarte drucken und aushängen (manuell)
Warten: Zwölf Monate ohne Aktualisierung
Zurück: Namen, Nummern und Vertretungen eintragen` },

  { name: 'Notfallübung durchführen (RMS)', kennung: 'Process_RMS_uebung',
    beschreibung: [
      'Übungen sind eine Satzart im Register „Wirksamkeit": Eine Übung prüft einen Plan und findet Abweichungen, dieselbe Kette wie ein Audit.',
      'Übungsarten sind Planbesprechung, Stabsübung, Funktionstest und Vollübung. Abschließen lässt sich eine Übung erst mit Prozess, Übungsart, Szenario, Teilnehmenden und Ergebnis.',
      'Gefundene Lücken werden Abweichungen mit Ursache, Frist und Wirksamkeitsprüfung. Ein Plan ohne Übung seit zwölf Monaten erscheint als Hinweis und in der Sammelmeldung.',
    ],
    norm: 'ISO 27001 Klausel 10.2, A.5.30; BSI-Standard 200-4',
    schritte: `Start: Übung fällig
Notfallmanagement: Übungsart und Szenario wählen
Notfallmanagement: Teilnehmende einladen
Krisenstab: Übung durchführen (manuell)
Notfallmanagement: Ergebnis im Register festhalten
Notfallmanagement: Lücken gefunden? | nein | weiter: Übung abschließen
Fachbereich: Abweichung korrigieren (Unterprozess)
Notfallmanagement: Übung abschließen
Ende: Plan geübt` },

  { name: 'Ausfall bewältigen (RMS)', kennung: 'Process_RMS_ausfall',
    beschreibung: [
      'Der Ernstfall: Ein Asset fällt aus. Die Ausfall-Sicht nennt die betroffenen Prozesse in der Reihenfolge der Wiederherstellung, kürzeste RTO zuerst, mit ihren Plänen, und sagt, welche Eskalationsstufe der Ausfall wäre.',
      'Ein Prozess ist in Störung, bis seine RTO reißt, danach im Notfall; ab der MTPD ist es eine Krise. Ausgerufen wird jede Stufe von der dafür benannten Rolle; ab Notfall übernimmt der Krisenstab.',
      'Ist die Web-App selbst betroffen, gelten das gedruckte Notfallhandbuch und die Alarmkarte.',
    ],
    norm: 'ISO 27001 A.5.29 und A.5.30; BSI-Standard 200-4; NIS2 Art. 21 Abs. 2 c',
    schritte: `Start: Asset fällt aus
IT-Betrieb: Asset in der Ausfall-Sicht wählen
System: Betroffene Prozesse nach RTO ordnen
System: Eskalationsstufe aus RTO und MTPD ableiten
IT-Betrieb: Störung ausrufen und Sofortmaßnahmen starten
IT-Betrieb: RTO überschritten? | nein: Normalbetrieb wiederherstellen | Ende: Störung behoben
Krisenstab: Notfall ausrufen und Stab alarmieren
Krisenstab: Notbetrieb nach Plan aufnehmen
Krisenstab: MTPD überschritten? | nein: Wiederanlauf nach Plan durchführen | Ende: Notfall bewältigt
Krisenstab: Krise ausrufen und Geschäftsleitung einbinden
Krisenstab: Krisenlage führen und Rückkehr planen
Ende: Krise bewältigt` },

  /* ═══ 9 · Assets ═══════════════════════════════════════════════════════ */

  { name: 'Assets inventarisieren (RMS)', kennung: 'Process_RMS_assets',
    beschreibung: [
      'Das Inventar nach ISO 27001 A.5.9 in der Liste „Assets" der ISMS-Site: anlegen, bearbeiten, außer Betrieb nehmen. Die Spalten des Hauses werden gelesen, wie sie sind; fehlende legt das RMS nur auf ausdrücklichen Klick an.',
      'Je Asset Verantwortung, Schutzbedarf für Vertraulichkeit, Integrität und Verfügbarkeit, Klassifizierung, Werke, Wiederherstellzeit und RPO, Abhängigkeiten, Lebenszyklus und Lieferant. „Sehr hoch" verlangt Wiederherstellzeit und RPO.',
      'Der Schutzbedarf vererbt sich nach dem Maximumprinzip von den Prozessen; Widersprüche stehen als Hinweis da. 90 Tage vor Support-Ende oder Vertragsende mahnt das System.',
    ],
    norm: 'ISO 27001 A.5.9, A.5.10, A.5.12 und A.5.19 bis A.5.22; BSI-Standard 200-2; NIS2 Art. 21 Abs. 2 i',
    neben: ['Sammelmeldungen versenden (RMS)'],
    schritte: `Start: Asset beschafft oder entdeckt
Asset-Owner: Asset mit Typ und Werken erfassen
Asset-Owner: Verantwortung und Betreiber eintragen
Asset-Owner: Schutzbedarf und Klassifizierung festlegen
Asset-Owner: Wiederherstellzeit, RPO und Abhängigkeiten angeben
System: Pflichtangaben zum Schutzbedarf erfüllt? | nein: Speichern verweigern | zurück: Wiederherstellzeit, RPO und Abhängigkeiten angeben
System: Abhängigkeiten ohne Kreis? | nein: Kreis abweisen | zurück: Wiederherstellzeit, RPO und Abhängigkeiten angeben
System: Schutzbedarf gegen die Prozesse prüfen
Asset-Owner: Lieferant, Support und Vertragsende pflegen
Warten: 90 Tage vor Support- oder Vertragsende
Asset-Owner: Asset weiter im Betrieb? | nein: Asset außer Betrieb setzen | Ende: Asset außer Betrieb
Asset-Owner: Support oder Vertrag verlängern
Zurück: 90 Tage vor Support- oder Vertragsende` },

  /* ═══ 10 · Prozessmanagement ═══════════════════════════════════════════ */

  { name: 'Prozesse managen (RMS)', kennung: 'Process_RMS_prozessmanagement',
    beschreibung: [
      'Das Prozessmanagement im Reiter „Prozesse" nach dem BPM-Lebenszyklus (Dumas, La Rosa, Mendling, Reijers) und der Konzernfachregelung Prozessmanagement: identifizieren, IST aufnehmen, analysieren, SOLL entwerfen, im POC erproben, freigeben, ausrollen und betreiben.',
      'Jede Phase hat Kriterien, die die Karte im Backlog als nächsten Schritt zeigt; blockiert wird nichts. Modelle folgen dem Hausschema mit zehn Bausteinen.',
      'Freigegeben wird ein Hauptprozess mit allen Unter- und Nebenprozessen als Arbeits-/Prozessanweisung, durch denselben Workflow wie ein Regelwerk. Im Betrieb zählen Kennzahlen, Reifegrad und der Review-Termin.',
    ],
    norm: 'ISO 27001 Klausel 4.4 und 8.1, A.5.37; ISO 9001 Abschnitt 4.4',
    unter: ['Prozesslandkarte pflegen (RMS)'],
    schritte: `Start: Prozess in der Landkarte identifiziert
Prozesseigner: Prozesseigner und Priorität festlegen
Fachbereich: IST-Prozess aufnehmen (Unterprozess)
Prozesseigner: Schwachstellen analysieren
Prozesseigner: SOLL-Prozess entwerfen (Unterprozess)
Prozesseigner: IST und SOLL vergleichen (Unterprozess)
Prozesseigner: POC durchführen (Unterprozess)
Prozesseigner: POC bestanden? | nein: SOLL nachschärfen | zurück: SOLL-Prozess entwerfen
Prozesseigner: Prozessbeschreibung zur Freigabe erzeugen
Administration: Regelwerk freigeben lassen (Unterprozess)
Prozesseigner: Prozess in den Werken ausrollen
Prozesseigner: IST-Modelle außer Betrieb setzen
Warten: Review-Termin des Prozesses
Prozesseigner: Prozess weiter benötigt? | nein: Prozess auf EOL setzen | Ende: Prozess abgelöst
Prozesseigner: Kennzahlen und Reifegrad bewerten
Prozesseigner: Ziele erreicht? | nein: Nachbesserung anstoßen | zurück: Schwachstellen analysieren
Prozesseigner: Nächsten Review-Termin setzen
Zurück: Review-Termin des Prozesses` },

  { name: 'IST-Prozess aufnehmen (RMS)', kennung: 'Process_RMS_ist',
    beschreibung: [
      'Der Ablauf wird so aufgenommen, wie er heute läuft, als IST-Modell nach dem Hausschema, bei Varianten je eines.',
      'Wege dahin: im Modeler zeichnen, als Text in der Schreibweise des Hausschemas aufschreiben und erzeugen lassen, eine BPMN-Datei importieren oder einen Entwurf aus einem Regelwerk erkennen lassen. Kollegen ohne RMS bekommen die Word-Anleitung mit Vorlage.',
      'Nach jeder Änderung prüft der Modeler gegen die zehn Regeln; Befunde stehen in der Ansicht unter „Was auffällt".',
    ],
    norm: 'ISO 27001 Klausel 4.4, A.5.37; OMG BPMN 2.0',
    schritte: `Start: Prozess zur Aufnahme priorisiert
Fachbereich: Ablauf mit den Beteiligten erheben (manuell)
Fachbereich: Schritte als Text im Hausschema notieren
System: Modell mit Bahnen aus dem Text erzeugen
Fachbereich: Modell im Modeler ergänzen
System: Modell gegen das Hausschema prüfen
Fachbereich: Modell ohne Verstoß? | nein: Befunde beheben | zurück: Modell gegen das Hausschema prüfen
Fachbereich: Modell in der Ablage des Werks speichern
Ende: IST-Modell aufgenommen` },

  { name: 'SOLL-Prozess entwerfen (RMS)', kennung: 'Process_RMS_soll',
    beschreibung: [
      'Prozesseigner und Fachabteilung modellieren den Zielprozess nach dem Hausschema, mit Regelwerk und Freigeber.',
      'Was an mehreren Stellen läuft, wird als Unterprozess einmal modelliert und eingebunden; zugeordnete Unter- und Nebenprozesse hängen in der Gliederung am Hauptprozess. Dokumente stehen am Schritt, an dem sie gebraucht werden, Übergänge in andere Prozesse am Element.',
      'Angaben zum Prozessmanagement, Kennzahlen und Reifegrad stehen in der BPMN-Datei.',
    ],
    norm: 'ISO 27001 Klausel 4.4 und 8.1; ISO 9001 Abschnitt 4.4',
    schritte: `Start: Analyse abgeschlossen
Prozesseigner: Zielprozess im Modeler zeichnen
Prozesseigner: Wiederkehrende Abläufe als Unterprozess einbinden
Prozesseigner: Unter- und Nebenprozesse zuordnen
Prozesseigner: Dokumente an die Schritte hängen
Prozesseigner: Regelwerk verknüpfen und Freigeber benennen
Prozesseigner: Kennzahlen mit Ziel und Richtung festlegen
System: Modell gegen das Hausschema prüfen
Prozesseigner: Modell ohne Verstoß? | nein: Befunde beheben | zurück: Modell gegen das Hausschema prüfen
Ende: SOLL-Modell entworfen` },

  { name: 'IST und SOLL vergleichen (RMS)', kennung: 'Process_RMS_vergleich',
    beschreibung: [
      'Hängen an einem Prozess IST-Modelle, zeigt die Gegenüberstellung IST und SOLL untereinander, beide farbig, und je Zuordnung eine Zeile mit IST-Schritt, SOLL-Schritt, Änderung und Grund.',
      'Änderungen sind: bleibt, geändert, automatisiert, zusammengelegt, entfällt, neu. Vorschläge ordnen gleich oder ähnlich benannte Schritte zu; Anmerkungen je Zuordnung halten Fragen, Einwände und Entscheidungen der Beteiligten fest.',
      'Gespeichert wird am SOLL-Modell; die Prozessbeschreibung der Freigabe bekommt das Kapitel „Vergleich mit dem IST".',
    ],
    norm: 'ISO 27001 Klausel 4.4 und 8.1',
    schritte: `Start: SOLL-Modell löst ein IST ab
Prozesseigner: Gegenüberstellung öffnen
System: Zuordnungen nach Namen vorschlagen
Prozesseigner: Vorschläge übernehmen und ergänzen
Prozesseigner: Änderung und Grund je Zuordnung angeben
Fachbereich: Anmerkungen zu den Zuordnungen schreiben
Prozesseigner: Einwände geklärt? | nein: SOLL anpassen | zurück: Vorschläge übernehmen und ergänzen
System: Vergleich im SOLL-Modell speichern
Ende: Vergleich dokumentiert` },

  { name: 'POC durchführen (RMS)', kennung: 'Process_RMS_poc',
    beschreibung: [
      'Der POC erprobt das SOLL-Modell und steht deshalb an ihm: Pilotwerke, Beginn und Ende, Verantwortung, Erfolgskriterien mit Bewertung und das Ergebnis.',
      'Bewertet wird am Review-Termin des Modells. Das Ergebnis ist läuft, bestanden, verlängert oder nicht bestanden. Fehlen Pilotwerk oder Erfolgskriterien oder ist das Ende ohne Ergebnis überschritten, steht das orange an der Karte.',
      'Unter- und Nebenprozesse laufen im POC ihres Hauptprozesses mit.',
    ],
    norm: 'ISO 27001 Klausel 8.1 und 9.1',
    schritte: `Start: SOLL-Modell entworfen
Prozesseigner: Pilotwerke und Zeitraum festlegen
Prozesseigner: Erfolgskriterien formulieren
Pilotwerk: SOLL im Pilotwerk anwenden (manuell)
Warten: Review-Termin des POC
Prozesseigner: Erfolgskriterien bewerten
Prozesseigner: Bewertung abschließend? | nein: POC verlängern | zurück: Review-Termin des POC
Prozesseigner: Kriterien erfüllt? | nein: Ergebnis festhalten | Ende: POC nicht bestanden
Prozesseigner: POC als bestanden eintragen
Ende: POC bestanden` },

  { name: 'Prozesslandkarte pflegen (RMS)', kennung: 'Process_RMS_landkarte',
    beschreibung: [
      'Jedes Werk führt seine Landkarte, dazu kommt die Ebene Konzern: Bereiche als Zeilen, Führungs-, Kern- und Unterstützungsprozesse als Kacheln mit fester Prozess-Nr.',
      'Eine neue Karte entsteht aus einer Vorlage oder aus der Karte eines anderen Werks; danach wird angepasst, wo das Werk abweicht. Verweise zwischen Kacheln sind Unterprozesse, Kette und Querbezüge; ein Unterprozess wird einmal gepflegt und mehrfach verwendet.',
      'Jede Kachel trägt Geltungsbereich, Verantwortliche, Modelle und Regelwerke. Lücken zeigen Verknüpfungen, Matrix und Mindmap; jede Änderung steht im Versionsverlauf.',
    ],
    norm: 'ISO 27001 Klausel 4.4; ISO 9001 Abschnitt 4.4',
    schritte: `Start: Werk ohne oder mit veralteter Landkarte
Prozessmanagement: Vorlage oder Karte eines Werks übernehmen
Prozessmanagement: Bereiche und Kacheln anpassen
Prozessmanagement: Untertitel in Unterprozesse gliedern
Prozessmanagement: Verweise zwischen Prozessen pflegen
Prozessmanagement: Verantwortliche und Geltungsbereich eintragen
Prozessmanagement: Modelle und Regelwerke verknüpfen
System: Kreise und doppelte Namen abweisen
Prozessmanagement: Lücken in Matrix und Verknüpfungen prüfen
Prozessmanagement: Alle Lücken geschlossen? | nein: Fehlende Angaben nachtragen | zurück: Verantwortliche und Geltungsbereich eintragen
System: Änderungen im Versionsverlauf vermerken
Ende: Landkarte aktuell` },

  /* ═══ 11 · KI-Governance ═══════════════════════════════════════════════ */

  { name: 'KI-Systeme genehmigen (RMS)', kennung: 'Process_RMS_ki',
    beschreibung: [
      'Wer ein neues KI-System einsetzen will, stellt im KI-Dashboard einen Antrag nach der KI-Richtlinie CO-10-01; Richtlinie und Verhaltenskodex sind dort verlinkt.',
      'Das KI-Koordinierungsgremium wird automatisch informiert und entscheidet: genehmigen, ablehnen oder Rückfrage. Ablehnung und Rückfrage brauchen einen Kommentar. Im einstimmigen Modus ist der Antrag erst genehmigt, wenn alle Mitglieder außer dem Antragsteller zugestimmt haben; die Ausstehenden erfahren jede Teilzustimmung.',
      'Die Antwort auf eine Rückfrage setzt den Antrag wieder auf „Eingereicht". Mit der Genehmigung legt das Dashboard einen Lizenz-Entwurf an.',
    ],
    norm: 'ISO 27001 Klausel 5.3; NIS2 Art. 20; KI-Verordnung (EU) 2024/1689; KI-Richtlinie CO-10-01',
    schritte: `Start: KI-System soll eingesetzt werden
Antragsteller: Antrag ausfüllen oder Rückfrage beantworten
Antragsteller: Antrag einreichen
System: KI-Gremium per Mail informieren
KI-Gremium: Antrag prüfen
KI-Gremium: Antrag entscheidungsreif? | nein: Rückfrage mit Kommentar stellen | zurück: Antrag ausfüllen oder Rückfrage beantworten
KI-Gremium: Antrag genehmigen? | nein: Ablehnung kommentieren | Ende: Antrag abgelehnt
System: Zustimmung vermerken
System: Alle Mitglieder zugestimmt? | nein: Ausstehende informieren | zurück: Antrag prüfen
System: Antragsteller und Gremium informieren
System: Lizenz-Entwurf anlegen
Ende: KI-System genehmigt` },

  /* ═══ 12 · Konzernregelwerk ════════════════════════════════════════════ */

  { name: 'Konzernregelwerk lenken (RMS)', kennung: 'Process_RMS_governance',
    beschreibung: [
      'Der Bauplan des Konzernregelwerks in der Governance-Struktur: Kategorien als Zeilen, Dokumentenarten als Spalten, von Handbuch und Policy bis Leitfaden. Jede Regelung ist eine Kachel mit Verantwortung und Stand: gültig, in Arbeit oder offen.',
      'Gespeichert wird nach jeder Änderung, mit Rückfrage, wenn jemand anderes inzwischen gespeichert hat; die letzten 100 Änderungen stehen im Verlauf. Zeilen und Spalten ändert nur, wer dafür in den Einstellungen steht.',
      'Dieselben Spalten und Zeilen sind Dokumentenart und Kategorie im Regelwerk-Editor. Entwürfe entstehen bei Legal im Governance-Board und kommen von dort als Regelwerk ins RMS; IMS-Dokumente werden auf der ISMS-Site gelenkt.',
    ],
    norm: 'ISO 27001 Klausel 5.1, 5.3 und 7.5, A.5.1; DCGK',
    unter: ['IMS-Dokument lenken (RMS)'],
    schritte: `Start: Neue Konzernregelung geplant
Governance-Board: Regelung in der Matrix anlegen
Governance-Board: Kategorie, Dokumentenart und Verantwortung setzen
System: Stand noch aktuell? | nein: Vor dem Überschreiben nachfragen | zurück: Kategorie, Dokumentenart und Verantwortung setzen
System: Änderung speichern und im Verlauf vermerken
Legal: Governance-Entwurf übernehmen (Unterprozess)
Governance-Board: Stand der Regelung auf gültig setzen
Ende: Regelung gültig` },

  /* ═══ 13 · Betrieb des RMS ═════════════════════════════════════════════ */

  { name: 'RMS betreiben und ändern (RMS)', kennung: 'Process_RMS_betrieb',
    beschreibung: [
      'Wie das RMS selbst betrieben wird: wer was sieht und darf, wer welche Rolle hat, wie Änderungen ausgeliefert und geprüft werden.',
      'Das RMS ist eine Web-App auf GitHub Pages unter rms.dihag.de; angemeldet wird mit dem Microsoft-Konto, die Daten liegen in SharePoint-Listen und Konfigurationsdateien. Ein täglicher Lauf in GitHub Actions versendet Erinnerungen und Sammelmeldungen und prüft das Deployment.',
      'Nach jeder Änderung weist eine Funktionsprüfung nach, dass das System noch tut, was es soll; was nicht funktioniert, wird eine Abweichung.',
    ],
    norm: 'ISO 27001 Klausel 5.3 und 7.4, A.5.15, A.5.18, A.8.25, A.8.29 und A.8.32',
    unter: ['Zugriff auf Reiter vergeben (RMS)', 'Rollen und Vertretungen pflegen (RMS)', 'Probelauf vorführen (RMS)'],
    schritte: `Start: Änderungsbedarf am RMS
Administration: Änderungsbedarf beschreiben und priorisieren
Entwicklung: Änderung am RMS ausliefern (Unterprozess)
Administration: Funktionsprüfung durchführen (Unterprozess)
Administration: Prüfung ohne Fehler? | nein: Abweichung korrigieren (Unterprozess) | zurück: Änderung am RMS ausliefern
Ende: Änderung in Betrieb` },

  { name: 'Änderung am RMS ausliefern (RMS)', kennung: 'Process_RMS_deploy',
    beschreibung: [
      'Jede Änderung am RMS läuft über das Git-Repository und GitHub Pages. Vor dem Commit läuft die Testsuite lokal; erst wenn sie grün ist, wird gepusht.',
      'Auf GitHub prüfen Tests und Typprüfung jeden Push. Das Cache-Busting setzt die Version in die Adressen der Skripte, damit kein Browser eine alte Fassung festhält; danach veröffentlicht GitHub Pages die Seite.',
      'Der Deploy-Smoke prüft die Live-Seite nach der Auslieferung und zusätzlich jeden Morgen. Die Dokumentation im RMS wird mit derselben Änderung nachgezogen; ein Test prüft, dass sie zu den Funktionen passt.',
    ],
    norm: 'ISO 27001 A.8.25, A.8.29 und A.8.32',
    schritte: `Start: Änderung zur Umsetzung freigegeben
Entwicklung: Änderung im Repository umsetzen
Entwicklung: Tests und Dokumentation anpassen
Entwicklung: Testsuite lokal grün? | nein: Fehler beheben | zurück: Änderung im Repository umsetzen
Entwicklung: Änderung committen und pushen
CI-Pipeline: Tests und Typprüfung ausführen (automatisch)
CI-Pipeline: Pipeline grün? | nein: Fehlschlag melden (automatisch) | zurück: Änderung im Repository umsetzen
CI-Pipeline: Version per Cache-Busting setzen (automatisch)
CI-Pipeline: Seite auf GitHub Pages veröffentlichen (automatisch)
Entwicklung: Live-Seite per Deploy-Smoke prüfen (automatisch)
Entwicklung: Smoke-Test grün? | nein: Fehler beheben | zurück: Änderung im Repository umsetzen
Ende: Änderung ausgeliefert` },

  { name: 'Funktionsprüfung durchführen (RMS)', kennung: 'Process_RMS_funktionspruefung',
    beschreibung: [
      'Nach Änderungen am RMS der Nachweis, dass es noch tut, was es soll. Der Selbsttest im Probelauf spielt Konzept, Entwurf, Konformitätsprüfung, Mitbestimmung, Freigabe, Kenntnisnahme und Historie in einem Zug durch, prüft auch die Mails und auf Wunsch die Ablehnungswege.',
      'Vor dem Start zeigt er die Voraussetzungen, danach räumt er seinen Vorgang auf. Der Bericht wird als Funktionsprüfung im Register „Wirksamkeit" abgelegt, mit der geprüften Version.',
      'Ist die laufende Version noch nicht geprüft, wird die Prüfung spätestens 30 Tage nach der letzten fällig. Was nicht funktioniert hat, wird eine Abweichung mit der Prüfung als Herkunft.',
    ],
    norm: 'ISO 27001 Klausel 9.1, A.8.29 und A.8.32',
    schritte: `Start: Neue Version des RMS ausgeliefert
Administration: Probelauf starten
Administration: Voraussetzungen des Selbsttests prüfen
System: Selbsttest mit Mails und Ablehnungswegen ausführen
System: Bericht mit Prüfpunkten und Dauer zeigen
System: Vorgang des Tests aufräumen
Administration: Bericht als Funktionsprüfung ablegen
Administration: Alle Prüfpunkte grün? | nein: Fehler als Abweichung anlegen | Ende: Funktionsprüfung mit Abweichung
Ende: Funktion nachgewiesen` },

  { name: 'Zugriff auf Reiter vergeben (RMS)', kennung: 'Process_RMS_zugriff',
    beschreibung: [
      'Von sich aus sieht jede Person nur den Reiter „Wissen". Alles andere gibt die Administration frei: je Person, Gruppe oder ganze Gesellschaft, je Reiter kein Zugriff, Lesen oder Schreiben.',
      'Gruppen sind Sicherheits-, Verteiler- oder Microsoft-365-Gruppen, auch verschachtelt; gespeichert wird die Objekt-ID. Dynamische Verteilerlisten aus Exchange lassen sich nicht berechtigen.',
      'Die Trennung nach Gesellschaft beschränkt einen Reiter auf Konten bestimmter Domänen und auf Wunsch die Inhalte auf die eigenen Werke. Das trennt die Sicht, nicht den Zugriff auf die Listen; Administratoren sind ausgenommen.',
    ],
    norm: 'ISO 27001 Klausel 5.3, A.5.15 und A.5.18',
    schritte: `Start: Person oder Gesellschaft braucht Zugriff
Administration: Bedarf und Reiter klären
Administration: Person, Gruppe oder Gesellschaft wählen
Administration: Lesen oder Schreiben je Reiter setzen
Administration: Trennung nach Gesellschaft nötig? | nein | weiter: Berechtigung in der Konfiguration speichern
Administration: Domänen und Werke der Gesellschaft zuordnen
System: Berechtigung in der Konfiguration speichern
System: Reiter beim nächsten Laden zeigen
Ende: Zugriff eingerichtet` },

  { name: 'Rollen und Vertretungen pflegen (RMS)', kennung: 'Process_RMS_rollen',
    beschreibung: [
      'Wer im RMS prüft, freigibt oder Vorschläge bekommt, ergibt sich aus Rollen in den Einstellungen: Administration, Genehmiger, Konformitätsprüfer, Geschäftsleitung, KI-Gremium, ISMS-Verantwortliche und Vorschlags-Empfänger, dazu die Adressen von Konzern- und Betriebsräten je Werk.',
      'Die Rolle entscheidet, was jemand darf; den Reiter zeigt sie nicht von allein. Schwellen legen fest, ob alle zustimmen müssen oder einer reicht, global oder je Regelwerk.',
      'Für Urlaub und Krankheit wird je Person eine Vertretung mit Zeitraum eingetragen. Solange er läuft, bekommt sie die Mails mit, darf entscheiden und wird so protokolliert; danach gilt sie nicht mehr.',
    ],
    norm: 'ISO 27001 Klausel 5.3, A.5.2',
    schritte: `Start: Rolle neu zu besetzen oder Abwesenheit geplant
Administration: Rolle in den Einstellungen wählen
Administration: Personen der Rolle eintragen
Administration: Schwelle für Prüfung und Freigabe setzen
Administration: Abwesenheit geplant? | nein | weiter: Einstellungen speichern
Administration: Vertretung mit Zeitraum eintragen
System: Einstellungen speichern
Ende: Rollen und Vertretungen aktuell` },

  { name: 'Probelauf vorführen (RMS)', kennung: 'Process_RMS_probelauf',
    beschreibung: [
      'Der Probelauf führt die ganze Kette an einem echten Vorgang vor, vom Konzept bis zum Nachweis im Audit. Es entstehen echte Einträge und echte Mails; alles trägt „[Probelauf]" im Titel.',
      'Die geführte Vorführung hebt Schritt für Schritt das nächste Bedienelement hervor und eignet sich als Lernvideo. Die Belegschaft bekommt nichts mit, Auswertungen zählen Probelauf-Einträge nicht.',
      'Aufräumen löscht genau die angelegten Einträge. Starten dürfen Administratoren und Freigeschaltete.',
    ],
    norm: 'ISO 27001 Klausel 7.2 und 7.3',
    schritte: `Start: Vorführung oder Schulung geplant
Administration: Probelauf in der Anleitung starten
System: Empfänger der Mails vorab zeigen
Administration: Geführte Vorführung durchklicken
System: Einträge als Probelauf kennzeichnen
Entscheidende: Im Probelauf mitentscheiden
Administration: Vorführung als Lernvideo aufnehmen (manuell)
Administration: Probelauf aufräumen und beenden
Ende: Vorgang vorgeführt und entfernt` },
];

/* ── Bausteine zum Anlegen ─────────────────────────────────────────────── */

/** Der Name ohne „(RMS)": so heißt der Schritt, der das Modell einbindet. */
function rmsKurzname(name) {
  return String(name || '').replace(/\s*\(RMS\)\s*$/, '').trim();
}

/** Der Eintrag zu einem Namen, mit oder ohne „(RMS)". */
function rmsProzess(name) {
  const kurz = rmsKurzname(name);
  return RMS_PROZESSE.find(p => rmsKurzname(p.name) === kurz) || null;
}

/**
 * Wen ein Modell unter sich hat: die Schritte „(Unterprozess)" (⊞), die
 * zugeordneten Unterprozesse (↳) und die Nebenprozesse (⇢), je nach Namen.
 */
function rmsKinder(p) {
  const aufrufe = [];
  (typeof prozessTextLesen === 'function' ? prozessTextLesen(p.schritte) : []).forEach(s => {
    if (s.kind === 'unter' && !aufrufe.includes(s.label)) aufrufe.push(s.label);
    if (s.kind === 'frage' && s.neinTyp === 'unter' && s.nein && !aufrufe.includes(s.nein)) aufrufe.push(s.nein);
  });
  return {
    aufrufe: aufrufe.map(k => (rmsProzess(k) || { name: k }).name),
    unter: (p.unter || []).slice(),
    neben: (p.neben || []).slice(),
  };
}

/** Die Hauptprozesse: Modelle, die kein anderes einbindet oder nennt. */
function rmsHauptprozesse() {
  const darunter = new Set();
  RMS_PROZESSE.forEach(p => { const k = rmsKinder(p); [...k.aufrufe, ...k.unter, ...k.neben].forEach(n => darunter.add(n)); });
  return RMS_PROZESSE.filter(p => !darunter.has(p.name));
}

/**
 * Die Reihenfolge zum Anlegen: erst, worauf andere zeigen. Ein Modell kann
 * nur einbinden, was schon eine Datei-Kennung hat.
 */
function rmsReihenfolge() {
  const fertig = [], gesehen = new Set();
  const besuche = (p, weg) => {
    if (!p || gesehen.has(p.name)) return;
    if (weg.includes(p.name)) throw new Error('Kreis im Katalog: ' + weg.concat(p.name).join(' → '));
    const k = rmsKinder(p);
    [...k.aufrufe, ...k.unter, ...k.neben].forEach(n => besuche(rmsProzess(n), weg.concat(p.name)));
    gesehen.add(p.name);
    fertig.push(p);
  };
  RMS_PROZESSE.forEach(p => besuche(p, []));
  return fertig;
}

function _rmsEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Die Dokumentation des Prozesses: Beschreibung, Normbezug und die Gliederung
 * (Klartext und Marker, wie js/prozesse.js sie schreibt). `ids` nennt je Name
 * die Datei-Kennung der schon angelegten Modelle.
 */
function rmsDokuText(p, ids) {
  const zeilen = (p.beschreibung || []).slice();
  if (p.norm) zeilen.push('Normbezug: ' + p.norm);
  [['unter', 'Unterprozesse'], ['neben', 'Nebenprozesse']].forEach(([art, titel]) => {
    const namen = (p[art] || []).filter(n => ids && ids[n]);
    if (!namen.length) return;
    zeilen.push(titel + ': ' + namen.join('; '));
    zeilen.push('[[rms:' + art + '=' + namen.map(n => ids[n]).join(',') + ']]');
  });
  return zeilen.join('\n');
}

/**
 * Das fertige Modell: gebaut nach Hausschema, jede ⊞ mit dem Verweis auf ihr
 * Modell (Datei-Kennung im Marker, Prozess-Kennung als calledElement).
 * @param {object} p   Eintrag aus RMS_PROZESSE
 * @param {object} ids Name → Datei-Kennung der schon angelegten Modelle
 * @returns {string} BPMN-XML
 */
function rmsModellXml(p, ids) {
  const { xml } = prozessXmlBauen({
    name: p.name, kennung: p.kennung, schritte: prozessTextLesen(p.schritte), doku: rmsDokuText(p, ids || {}),
  });
  return xml.replace(/<bpmn:callActivity id="([^"]+)" name="([^"]*)">/g, (ganz, id, nameEsc) => {
    const ziel = rmsProzess(nameEsc.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    if (!ziel) return ganz;
    const datei = ids && ids[ziel.name];
    const doku = 'Unterprozess: ' + ziel.name + (datei ? '\n[[rms:modell=' + datei + ']]' : '');
    return `<bpmn:callActivity id="${id}" name="${nameEsc}" calledElement="${ziel.kennung}"><bpmn:documentation>${_rmsEsc(doku)}</bpmn:documentation>`;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  if (typeof prozessXmlBauen === 'undefined') Object.assign(globalThis, require('./prozessschema.js'));
  module.exports = { RMS_PROZESSE, RMS_PROZESS_ABLAGE, rmsKurzname, rmsProzess, rmsKinder, rmsHauptprozesse,
    rmsReihenfolge, rmsDokuText, rmsModellXml };
}
