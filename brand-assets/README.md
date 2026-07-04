# brand-assets/ — Marken-Bilder (Google-Business-Profil & Social)

Versionierte, **nicht** vom Hosting ausgelieferte Marken-Assets (liegt außerhalb `src/`).
Alles on-brand (Phyllotaxis-Blüte · Fraunces · Navy #16202C / Creme #F1EFE7 / Messing #C9A24B)
und **authentisch** — echte Live-Portfolio-Seiten und echtes Gründer-Foto, keine Attrappen.

## gbp/ — Bildset fürs Google-Unternehmensprofil

| Datei | Verwendung im GBP |
|---|---|
| `01-profil-logo-1024.png` | **Profilbild** (Logo-Variante) |
| `07-profil-gesicht-1024.jpg` | **Profilbild** (Gesichts-Variante — echtes Gesicht = stärkerer Trust-Anker) |
| `02-titelbild-1600x900.jpg` | **Titelbild** (16:9) |
| `03–05, 08–12 …arbeitsprobe…` | **Fotos** (Arbeitsproben-Karussell, alle 8 Branchen) |
| `06-gruender-kachel.jpg` | **Foto** „Inhaber/Über uns" |

Google-Vorgaben erfüllt: Profil ≥250², Titel 16:9, Fotos ≥720². Wähle **ein** Profilbild
(Empfehlung: Gesicht) und **ein** Titelbild; die übrigen in den Fotostream.

> Sterne + Foto-Karussell im Suchergebnis entstehen erst mit **verifiziertem GBP + echten
> Reviews** — die Bilder sind der visuelle Teil, die Reviews der Sterne-Hebel.

## Regenerieren

```
python3 scripts/upscale-portrait.py     # Gründer-Porträt 512→1200 aufbereiten (Cache)
node    scripts/build-gbp-assets.mjs     # gesamtes Set + src/images/og-gruender.jpg
# SKIP_SHOTS=1 node scripts/build-gbp-assets.mjs   # ohne Live-Screenshots (schnell)
```

Arbeitsproben werden live von `karriaro-webdesign.de/portfolio/*` gescreenshottet
(Demo-Balken `.kr-strip` wird entfernt). Für ein **schärferes/farbiges** Gründer-Porträt
ein hochauflösendes Original (2000px+) nach `src/images/muammer-portrait.jpg` legen — die
aktuelle Quelle ist nur 512² Graustufen.

`og-gruender.jpg` → `src/images/` (wird ausgeliefert, ist das og:image von `gruender.html`).
`.cache/` = Zwischenprodukte, nicht versioniert.

## atelier/ — „Das Atelier"-Komposition (Manufaktur-Positionierung)

Editoriale Atelier-Szene: **echtes Gründer-Porträt zentral, umgeben von echten Portfolio-Projekten** (Browser-Frames) + Blüte. Löst den „Team/Manufaktur-Wirkung ohne Solo-Optik"-Wunsch **ehrlich**: das „Team" ist als **Disziplinen** formuliert („Ein Kopf. Viele Disziplinen." — Webdesign · KI · Auffindbarkeit · Barrierefreiheit), **KEINE erfundenen Kollegen/Fake-Gesichter, kein Fake-Raum, kein Werkstatt-Klischee** (Aesop/Monocle-Editorial).

| Datei | Format | Verwendung |
|---|---|---|
| `atelier-quer-1600x1000.jpg` | 16:10 quer | „Über uns", LinkedIn, Web |
| `atelier-quadrat-1200.jpg` | 1:1 | GBP-Foto, Instagram |

Komponiert aus `src/images/muammer-portrait.jpg` (echtes Foto) + 3 Live-Portfolio-Screenshots (Stadtmakler/Dachdecker/Coaching) via Playwright. **Regel:** Team-Wirkung IMMER über „wir/Manufaktur/Disziplinen" + Gründer-als-Gesicht — NIE über generierte fremde Personen (UWG-Irreführung + gegen den „keine Attrappen"-Ethos).
