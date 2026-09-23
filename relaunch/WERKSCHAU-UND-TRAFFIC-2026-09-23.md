# Karriaro: Bildsprache, Werkschau und qualifizierter Traffic

Stand: 23. September 2026. Arbeitsgrundlage für weitere Konzeptseiten; keine Behauptung über bereits gewonnene Kunden oder messbare Resultate.

## Bildregel für neue Konzepte

- Keine generierten Menschen, Gesichter, Körperteile, Hände, Silhouetten oder Personenreflexionen. Das reale Schwarz-Weiß-Porträt des Gründers auf Karriaro ist davon getrennt.
- Jedes Motiv folgt einer konkreten gestalterischen These, die zur Branche passt: bei KANTE Fuge, Material und Licht; bei WALDRUHE Landschaft, Haus und Tagesrhythmus; bei TISCH & TON Komposition, Tisch und Objekt.
- Je Projekt zuerst eine kleine Bildregie festlegen: ein prägnantes Hero-Motiv, eine räumliche Totale, zwei bis drei Details. Gleiche Materialien und Lichtlogik über die ganze Serie; keine beliebige Sammlung einzelner Prompts.
- Qualität am endgültigen Ausschnitt prüfen: Desktop, Smartphone, Vorschaurahmen, Kontrast hinter Text, Perspektive, wiederkehrende Objekte, anatomiefreie Spiegelungen. Unglaubwürdige Details neu erzeugen oder das Motiv verwerfen.
- Konzeptbilder als KI-generiert kennzeichnen; fiktive Projekte als Konzepte und Demos ausweisen. Ein Bild darf niemals einen realen Auftrag, ein reales Produkt oder einen realen Ort vortäuschen.

Das neue KANTE-Hero-Motiv `site/studien/assets/kante-window-detail-v3.webp` entstand mit dem eingebauten `imagegen`-Werkzeug (Modus `photorealistic-natural`). Prompt-Kern: „architectural photograph of the join between patinated bronze window frame, limestone and deep reveal; directional late-afternoon light; no people, hands, silhouettes, reflections of people, logos or text“. Die unveränderte PNG-Ausgabe liegt unter `$CODEX_HOME/generated_images/01a0bb16-8888-7283-bc56-1905a014651d/exec-b9918f87-665d-4e64-b58c-4e08e43b66a2.png`; die WebP-Fassung ist das Projektasset.

## Wie neue Seiten in die Werkschau kommen

Die Seite `/arbeiten` hat nun drei Ebenen: eine tatsächlich veröffentlichte eigene Website, drei große kuratierte Konzeptbühnen mit bedienbarer Vorschau und einen ruhigen Textindex für weitere Entwürfe. Neue Arbeiten werden zuerst in den Index aufgenommen. Nur ein Projekt, das Bildsprache, Inhalt und einen nützlichen Besucherweg auf hohem Niveau verbindet, rückt in die kuratierte Auswahl. Die Zahl der Bühnen bleibt klein; eine neue ersetzt gegebenenfalls eine ältere. Die Daten für die Sammlung stehen zentral in `build-pages.py`.

Jede kuratierte Bühne beantwortet in wenigen Sekunden: Für wen ist die Website? Welche Aufgabe löst sie? Welche gestalterische Idee trägt sie? Was kann ich ausprobieren? Die Vorschau zeigt eine echte Website, kein isoliertes Stimmungsbild. Konzeptstatus und Demo-Funktion bleiben klar erkennbar.

## Traffic, der zu Anfragen führen kann

1. **Messbasis.** In Google Search Console die Property, Sitemap, Indexierung und Leistungsdaten für Startseite und `/arbeiten` prüfen. Relevant sind Suchanfragen, Impressionen, Klicks und die Seiten, über die Menschen kommen. Google beschreibt genau diese Berichte und die Sitemap-Einreichung in der [Search-Console-Einführung](https://developers.google.com/search/docs/monitor-debug/search-console-start). Das ist zunächst eine Prüfung; der Zugriff auf das Konto wurde hier nicht vorausgesetzt.
2. **Drei redaktionelle Projektseiten.** Für Handwerk, Unterkunft und Handel je eine indexierbare Karriaro-Seite erstellen, die den echten Designprozess erklärt: Ausgangsproblem, Gestaltungsentscheidung, nutzbare Funktion, Demo-Link und Bezug zum passenden Angebot. Die fiktiven Demo-Betriebsseiten bleiben `noindex`. Die Projektseiten dürfen keine Kundenresultate erfinden. Google empfiehlt originelle, hilfreiche Inhalte mit erkennbarer Erfahrung statt massenhaft ähnlicher Suchseiten ([Search Central](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)).
3. **Lokales Profil und echte Vertrauenssignale.** Das bestehende Google-Unternehmensprofil nur mit zutreffender Kategorie, Leistungen, Standort bzw. Einzugsgebiet und Kontaktdaten pflegen. Google nennt Relevanz, Distanz und Bekanntheit als wesentliche lokale Faktoren und betont vollständige Angaben und echte Bewertungen ([Google Business Profile](https://support.google.com/business/answer/7091?hl=de)). Das Profil soll reale Arbeit zeigen: eigenes Branding, echte Screenshots der veröffentlichten eigenen Website und später freigegebene Kundenarbeiten. Für Business-Profile-Fotos empfiehlt Google, dass sie die Realität darstellen und nicht stark durch KI verändert sind ([Fotohinweise](https://support.google.com/business/answer/6123536?hl=de)).
4. **Gezielte Verteilung statt Reichweite um ihrer selbst willen.** Pro kuratiertem Projekt drei kurze Formate produzieren: ein 15–30-Sekunden-Durchlauf durch die Website, ein Bild mit der gestalterischen Entscheidung und ein Beitrag zum geschäftlichen Problem der Branche. Auf eigenen Kanälen veröffentlichen und direkt auf die passende Projektseite führen. Zusätzlich persönliche Gespräche mit passenden lokalen Betrieben und möglichen Empfehlungspartnern vorbereiten; dabei den Entwurf ausdrücklich als Konzept bezeichnen. Keine automatisierten Massenanschreiben.
5. **Anfragen statt nur Klicks auswerten.** Monatlich erfassen: Quelle, besuchte Projektseite, ernsthafte Gespräche und Angebote. Wenn Traffic da ist, aber keine Gespräche entstehen, zuerst Angebot, Vertrauensbelege und Anfrageweg verbessern. Bezahlte Anzeigen erst wieder testen, wenn eine passende Zielseite und eine verlässliche Erfolgsmessung vorhanden sind.

Die unmittelbar nächste inhaltliche Ausbaustufe sind die drei redaktionellen Projektseiten. Sie geben den aufwendig gebauten Demos einen auffindbaren Kontext und können später mit echten Kundenarbeiten erweitert werden.
