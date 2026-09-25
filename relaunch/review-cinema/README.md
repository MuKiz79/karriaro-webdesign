# Interne Vorschau: persönliche Websites als filmische Galerie

Stand: 25. September 2026. Grundlage: Produktions-Commit d1d0edf.
Isolierter Branch: codex/personal-cinematic-gallery-20260925.
Die Produktion und der gesicherte Tarek-Entwurf wurden nicht verändert.

## Vorschau starten

Vom Repository aus:

```sh
python3 relaunch/review-cinema/serve.py --port 4330
```

Dann http://127.0.0.1:4330/persoenliche-websites öffnen.
Der Server bindet ausschließlich an localhost. Er ersetzt den Formular-Endpunkt nur in dieser Vorschau durch einen lokalen, nicht speichernden Test-Endpunkt. Keine Nachricht wird versendet. Die Quelldatei behält den bestehenden Formspree-Endpunkt und die bisherigen Formularfelder.

## Gestaltung und Umfang

Ein neues, zusammenhängendes Stylesheet ersetzt die früheren neun zusätzlichen Landingpage-Stylesheets. Dunkler Auftakt und eine breite Bühne für eine einzige veröffentlichte Arbeit; anschließend helle Abschnitte für Nutzen, gestalterische Herleitung, Leistung und Ablauf. Kurze Anfrage mit sichtbarer, entfernbarer Referenzauswahl. Die bisherigen Konzeptseiten bleiben vorhanden, werden hier aber nicht präsentiert. Bestehende Beispielparameter und Sprungmarken bleiben kompatibel.

Kein öffentlicher Preis beschlossen: „Individuell kalkuliert. Verbindliches Angebot vor Beginn.“
Die Angebotsfassung ist ein interner Entwurf. Auch der enthaltene Umfang mit zwei Korrekturschleifen wird erst mit der Angebotsfreigabe verbindlich.

## Herkunft der Medien

- Sämtliche gezeigten Website-Ansichten stammen von muammerkizilaslan.com, keine nachgebaute Oberfläche.
- pg-themen.webp, pg-person.webp und pg-arbeit.webp: Bildschirmaufnahmen der aktuellen veröffentlichten Website, am 25.09.2026 bei 1440 × 900 aufgenommen.
- Zwei eigene 17-Sekunden-Filme: 9 Sekunden aus der vorhandenen Bildschirmaufnahme des Themenraums, anschließend je 4 Sekunden aktuelle Aufnahme von Geschichte und Arbeit. Die Filme zeigen also sowohl bewegte Originalaufnahmen als auch stehende Originalansichten.
- Desktop 1440 × 810, Smartphone 390 × 844; H.264, stumm, 24 fps, faststart. Vollständige Frames mit angepassten Rändern, kein Beschnitt. Gesamtvolumen beider Filme ca. 1,34 MB; es wird nur die passende Variante geladen.
- Das Porträt ist das vorhandene authentische Material. Keine generierten Personen, Hände oder fremden Identitäten.

## Prüfung

- 57 automatisierte Tests bestanden: unter anderem Referenzübernahme und Entfernung, alte Parameter, Formularfehler und Erfolg, Leerzeichenvalidierung, Videopause, Viewportwechsel, Offscreen-Pause, reduzierter Bewegung und Autoplay-Fehler.
- Sitecheck: 42 HTML-Routen mit lokalen Links, Bildern, Sprungmarken und eindeutigen IDs geprüft.
- Browser: 360, 390, 768 und 1440 px; zusätzlich Standardansicht 1280 px. Hero, Film, Nutzen, USP, Arbeitsansichten, Leistung, Ablauf und Kontakt visuell geprüft. Keine horizontalen Seitenüberläufe in den geprüften Breiten. Tablet-Ablauf und mobile Filmfläche nach Prüfung korrigiert.
- Mobile Menüöffnung und Escape, Filmsteuerung per Enter, sichtbarer Fokus, tatsächliche Filmwiedergabe, Entfernen einer Auswahl ohne Verlust der Eingaben sowie simulierter Formularversand im Browser geprüft.
- Keine Browser-Konsolenfehler in der geprüften Ansicht.
- Vorschau-Screenshots: preview-desktop.png und preview-mobile.png.

## Vor einer Veröffentlichung noch erforderlich

Gestalterische Abnahme durch Muammer, Entscheidung zur öffentlichen Preisangabe und Freigabe des Leistungsumfangs. Ein echter Formspree-Versand einschließlich Zustellung wurde in dieser Etappe ausdrücklich nicht durchgeführt. Der schnelle Verständnistest mit einer außenstehenden Person steht ebenfalls noch aus; die Seite benennt Angebot, Nutzen und nächsten Schritt bereits im Hero.

Nicht deployen: Diese Fassung ist als interne Vorschau gekennzeichnet und mit noindex/nofollow versehen. Vor späterem Einsatz müssen Vorschau- und Indexierungsstatus bewusst angepasst werden.
