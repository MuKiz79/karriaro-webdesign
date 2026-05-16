# LinkedIn-Firmenseite „Karriaro Webdesign" · Setup-Sprint

**Ziel:** Firmenseite in 90 Minuten live · vollstaendig befuellt · Banner gerendert · Featured-Items gesetzt · Founder-Verknuepfung Muammer ohne Hansgrohe-Bezug.

**Voraussetzung:** Muammer ist Admin seines eigenen LinkedIn-Personal-Profils.

---

## Schritt 1 · Page anlegen (10 Min)

1. LinkedIn → oben rechts „Fuer Unternehmen" → „Unternehmensseite erstellen"
2. **Seitentyp:** Unternehmen (klein, 2-200 Mitarbeiter)
3. **Name:** `Karriaro Webdesign`
4. **LinkedIn-URL:** `linkedin.com/company/karriaro-webdesign` (URL-Slug pruefen, evtl. Variante mit `-de`)
5. **Webseite:** `https://karriaro-webdesign.de`
6. **Branche:** „Designdienstleistungen" (LinkedIn-Kategorie)
7. **Unternehmensgroesse:** 1-10 Mitarbeiter
8. **Unternehmenstyp:** Personengesellschaft
9. Checkbox: „Ich bestaetige, dass ich befugt bin"
10. „Seite erstellen"

---

## Schritt 2 · Logo + Banner (15 Min)

**Logo:** `marketing/social/logo-square-1080.svg`
- Browser oeffnen → SVG laden → `cmd+shift+4` + Leertaste + auf SVG klicken → PNG auf Desktop
- LinkedIn-Page-Settings → Logo hochladen (300×300 reicht, LI skaliert)

**Banner 1584×396:** `marketing/linkedin-launch/banner-1584x396.html`
- Wichtig: Die bestehende Variante hat „Ab 990 €" im Subline-Text — **vorher updaten auf „Ab 1.290 €"** in Zeile 160
- Browser oeffnen → `cmd+shift+4` + Leertaste + auf weisses Banner klicken → PNG auf Desktop
- LinkedIn-Page → „Cover-Bild bearbeiten" → PNG hochladen

---

## Schritt 3 · About-Section (20 Min)

**Tagline (max 120 Zeichen):**
> Wenn Ihr Name draufsteht, steht unserer dahinter. Handgeschriebene Websites fuer den DACH-Mittelstand. BFSG-konform.

**Beschreibung (max 2.000 Zeichen):**
```
Karriaro Webdesign ist eine Manufaktur. Wir schreiben Webseiten von Hand — HTML, CSS, ein wenig JavaScript — kein WordPress, kein Plugin-Wildwuchs, kein 80-MB-Theme.

Was Sie bekommen:
- Erster Entwurf nach 14 Tagen
- Lighthouse-Score 95+ (handmade-Performance)
- WCAG 2.2 AA · BFSG-konform ab Tag 1 inkl. Audit-Report
- Branchen-Module fuer Friseur, Restaurant, Dachdecker, Sanitaer, Spedition, Immobilien, Praxis
- Live-Tools: Foerderrechner, KI-Schadens-Check, Wertermittlung, Online-Buchung
- Code-Ownership: Sie bekommen den Quellcode, kein Lock-in
- Care-Wartung optional 99 €/Mt

Preise transparent auf der Webseite:
- Essential ab 1.290 € (Friseur, Restaurant)
- Professional ab 1.990 € (Handwerk, Logistik)
- Premium ab 2.990 € (Immobilien, Praxis)
- Premium+ ab 3.990 € (Mehrsprachig, Custom-Module)

Sie sehen sich selbst, bevor Sie entscheiden. Audit-Tool kostenfrei: karriaro-webdesign.de/website-check

Sitz · DACH · 100 % remote
Gegruendet · 2026 · Muammer Kizilaslan
```

**Kontakt-Block:**
- Webseite: https://karriaro-webdesign.de
- Email: kontakt@karriaro-webdesign.de (ggf. anlegen)
- Telefon: optional, sonst leer

**Standorte:**
- Hauptsitz: Stuttgart (oder Hauptarbeitsort)
- Auch sichtbar: Berlin, Hamburg, Muenchen, Koeln, Frankfurt (als „Wir bedienen…") — dies verstaerkt Local-SEO

**Hashtags (3):** `#Webdesign` · `#Manufaktur` · `#BFSG`

**Block "Unser Mark" (am Ende der Beschreibung anhaengen, kurz vor den Preisen oder als eigener Absatz):**
```
Unser Mark · Die Karriaro-Manufakturpunze
Vier Eck-Brackets als Frame, dreizehn Punkte innen, angeordnet nach dem Goldenen Winkel (137,5°). Das ist die Mathematik der Sonnenblume — und die Hallmark-Tradition der Goldschmiede seit dem 14. Jahrhundert. Wenn die Punze auf einer Seite steht, steht Karriaro dahinter.
→ karriaro-webdesign.de/gruender#punze
```

---

## Schritt 4 · Featured-Items (15 Min)

LinkedIn-Page → Bereich „Featured" → 4 Slots:

| Slot | Asset | URL | Bild-Hint |
|---|---|---|---|
| 1 | **Audit-Tool** (Lead-Magnet) | `https://karriaro-webdesign.de/website-check` | Screenshot der Audit-Page oder generischer Square-Logo |
| 2 | **Demo Friseur** | `https://karriaro-webdesign.de/friseur-salon.html` | `src/images/friseur-mockup.jpg` |
| 3 | **Demo Dachdecker** | `https://karriaro-webdesign.de/meisterbetrieb-mueller.html` | `src/images/dachdecker-mockup.jpg` |
| 4 | **Demo Immobilien** | `https://karriaro-webdesign.de/immobilien-makler.html` | `src/images/immobilien-mockup.jpg` |

Jeder Featured-Item-Titel: kurzer Hook (max 30 Zeichen): „24-h-Audit kostenfrei", „Friseur-Demo", „Dachdecker · Foerderrechner", „Makler · Wertermittlung".

---

## Schritt 5 · Founder-Verknuepfung Muammer (10 Min)

**Wichtig (Memory-Constraint):** Personal-Profil nicht ueber Hansgrohe-VP-Title verknuepfen.

1. Muammer-Personal-Profil → „Erfahrung" → „+" → „Karriaro Webdesign hinzufuegen"
2. **Rolle:** „Gruender" (NICHT „CTO" o.ae., das verwaessert)
3. **Startdatum:** Gruendungsdatum 2026
4. **Beschreibung:** 1-2 Saetze, nicht ueber VP-Karriere reden:
   > „Karriaro Webdesign — handgemachte Websites fuer KMU. Manufaktur statt Baukasten, 14 Tage statt 6 Wochen, BFSG-konform ab Tag 1. karriaro-webdesign.de"
5. **Industrie:** Designdienstleistungen

**Cover-Photo Personal-Profil:** Falls noch Hansgrohe-Theme → auf neutrales Branding wechseln (z.B. Karriaro-Logo gross + „Gruender Karriaro Webdesign · Sparringspartner C-Level Karriere-Profile"). Hansgrohe bleibt nur unter „Erfahrung", nicht im Cover oder Headline.

---

## Schritt 6 · Erste 5 Posts (Pre-Launch) (20 Min)

Die Firmenseite mit 0 Posts wirkt verlassen. Pre-Launch 5 Posts setzen, alle zeitgleich (oder ueber 2 Tage gestreckt):

1. **Day-0-Post:** Founder-POV E1 („Warum wir Manufaktur nennen") aus `copy-library.md`
2. **Day-0-Post +30 Min:** Carousel A1 Friseur (`carousel-1080x1350.html?branche=Friseur · Stuttgart`)
3. **Day-1-Post 09:00:** B1 BFSG-Pflicht-Text
4. **Day-1-Post 16:00:** D1 Foerderrechner-Screencast (60s)
5. **Day-2-Post 11:00:** E3 Pricing-Transparenz

Damit hat die Page bei Launch der LinkedIn-Werbe-Tour bereits 5 Posts und sieht aktiv aus.

---

## Schritt 7 · Mitarbeiter einladen (auch wenn nur 1) (5 Min)

LinkedIn-Page → „Mitarbeiter einladen" → Muammer als ersten Mitarbeiter hinzufuegen.

Auswirkung: Page erscheint im Personal-Profil als „Arbeitet bei Karriaro Webdesign" und vice versa — Trust-Verstaerker.

---

## Schritt 8 · Page-Posts-Cross-Sharing (Forever) (5 Min)

Setting in Muammer-Personal-Profil:
- Jeder Firmenseite-Post wird montags/mittwochs/freitags von Muammer-Personal **gleichen Tag um 11:00 cross-shared** (siehe `content-calendar-30d.md` Fr-11:00-Slot).

Auswirkung: Personal-Profil ist Reach-Verstaerker fuer Page (LinkedIn-Erfahrung: Personen ~5× Reach vs Page).

---

## Checkliste Abnahme

- [ ] Page-URL `linkedin.com/company/karriaro-webdesign` (oder Variante) live
- [ ] Logo + Banner sichtbar (Banner mit „Ab 1.290 €", nicht 990 €)
- [ ] About-Text auf Karriaro-Sprache, KEIN Hansgrohe-Bezug
- [ ] 4 Featured-Items mit echten Demo-Links
- [ ] Muammer im Erfahrungs-Block als „Gruender", Hansgrohe bleibt unter „Erfahrung" aber NICHT in Cover/Headline
- [ ] 5 Pre-Launch-Posts veroeffentlicht
- [ ] Founder cross-postet ersten Page-Post auf Personal-Profil
- [ ] DM-Outreach-Skript fuer Sales-Navigator-Listen vorbereitet (`marketing/linkedin-launch/90-min-launch-sprint.md` Step 7 wiederverwendbar)

---

## Banner-Update-Snippet (Vorab-Fix)

In `marketing/linkedin-launch/banner-1584x396.html` Zeile 160:

```html
<!-- VORHER -->
<div class="banner-subline"><span class="accent">Erster Entwurf in 24 Stunden.</span> Ab 990 € einmalig.</div>

<!-- NACHHER -->
<div class="banner-subline"><span class="accent">Erster Entwurf in 14 Tagen.</span> Ab 1.290 € einmalig.</div>
```

Begruendung: 990 € ist alter Preis (Hauptseite ist auf 4-Tier-Pricing 1.290 €+ migriert, Sprint 40). „24 Stunden" ist die Audit-Zeit, NICHT die Liefer-Zeit — Verwechslung schadet bei Erstbesuchern. „14 Tage" ist der saubere Liefer-Anker (`gruender.html`/Pricing-Sektion).
