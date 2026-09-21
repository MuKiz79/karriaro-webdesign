# KARRIARO Designmanufaktur · Produktiver Relaunch

Seit 21.09.2026 ist `relaunch/site/` die Quelle für karriaro-webdesign.de. `relaunch/dist-live/` enthält die veröffentlichbaren Dateien mit bereinigten URLs. Der alte Ordner `src/` bleibt als historischer Bestand erhalten und wird nicht mehr als Website veröffentlicht. Backend-Funktionen bleiben erhalten.

Änderungen: `cd relaunch`, `npm install`, `npm run build`, `npm run check`, `npm test`, `python3 deploy-live.py`. Anschließend Quelle und dist-live gemeinsam committen. Der bestehende GitHub-Workflow veröffentlicht bei Push auf main das neue Hosting-Verzeichnis.

Die mobile Domain wird vom Repo karriaro-webdesign-mobile auf die responsive Hauptdomain weitergeleitet. Den alten Mobile-Generator und Sync nicht mehr verwenden.

Das Porträt bleibt auf der Website sichtbar, erhält aber X-Robots-Tag: noindex auf den Bilddateien. Vorschaubild und Logo verwenden KARRIARO-Grafiken. Der Kontaktweg bleibt Formspree /f/mjggbdre.
