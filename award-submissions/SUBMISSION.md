# Karriaro Webdesign — Award-Submission

**Site:** https://m.karriaro-webdesign.de
**Kategorie:** Web/PWA · Mobile Excellence · Editorial Design
**Sprint:** Award-Pitch 128-135 (Mai 2026)
**Author:** Mikael Karriaro · Karriaro Webdesign, Schwarzwald

---

## Title (≤70 Zeichen)

Editorial-Manufaktur — Webdesign als Magazine-Spread (Karriaro)

## Tagline (≤120 Zeichen)

Sechs editoriale Bewegungen. Acht Branchen-Bühnen. Eine Manufaktur.

## Tags

editorial · pwa · mobile-first · dark-mode · accessibility · scroll-driven · hermès-tier · magazine-design · typography · brand-design

---

## Description (300 Wörter)

**Editorial-Manufaktur — Webdesign als Magazine-Spread.**

Karriaro Webdesign ist eine Manufaktur aus dem Schwarzwald. Diese Mobile-Site ist nicht Marketing-Page, sondern ein Editorial-Magazine in sechs Bewegungen — choreographiert wie ein Hermès-Katalog, gepaced wie ein Pentagram-Print-Heft.

**Cover (№ 01):** Hero mit Folio-Marker "Nº 01 · 2026 · EDITORIAL", dreizeiliger Choreography-Headline und Pentagram-Print-Marginalia "₁ HANDCODIERT · ₂ SCHWARZWALD-ATELIER · ₃ № 01 · 2026". Manufaktur-Siegel-Embossing pulsiert dezent unter dem CTA.

**Editorial-Page (№ 02):** Acht Branchen, acht Bühnen — jede Portfolio-Demo schwebt auf eigener Brand-Color-Vitrine (Indigo, Charcoal, Sage, Taupe-Copper, Forest, Burgundy, Deep-Blue, Copper). Sheet-Modal mit iOS-Easing-Curve öffnet Live-Demo.

**Index (№ 03):** Persona-Tile-Grid für acht Mittelstand-Branchen. Touch-Targets ≥44 px, Deep-Link zum Demo-Sheet.

**Annotation (№ 04):** Fünf Werkzeuge mit Mini-Case statt Quantitäts-Theater (Apple-Acquisitions-Hebel: Qualität als Beweis, nicht Quantität als Versprechen).

**Brand-Signature (№ 05):** Manufaktur-Siegel als 13-Punkte-Phyllotaxis-SVG nach Goldenem Winkel.

**Schluss (№ 06):** Kontakt-Letter-Card.

**Deep Moment:** Body-BG morpht in sechs sanften Cream-Tönen während der Magazine-Page-Turn-Choreographie. Pin-Spy top-right "02 / 06 · DEMOS" als Reading-Indicator mit mix-blend-mode-difference (universal lesbar). Scroll-Driven-Siegel-Rotation als Progressive-Enhancement für Chrome 119+ (Safari TP).

**System:** Cascade-Layer-Disziplin nach 134 Sprints, Service-Worker mit Offline-Fallback, PWA-Manifest mit App-Shortcuts, Dark-Mode-Variants in warmer Editorial-Palette (kein OLED-Pure-Black), Reduced-Motion-Override für alle Animationen, BFSG-konform.

**Voice:** Fraunces (Serif) + Inter (Sans) + JetBrains Mono (Eyebrows). Magazine-Numbering № 01-06 als Editorial-Pacing.

---

## Submission-Form-Inputs

| Field | Value |
|---|---|
| URL | https://m.karriaro-webdesign.de |
| Case-Study | https://m.karriaro-webdesign.de/case-study.html |
| Title | Editorial-Manufaktur — Webdesign als Magazine-Spread |
| Category | Web · PWA · Mobile Excellence |
| Country | Germany |
| Studio | Karriaro Webdesign |
| Year | 2026 |
| Built with | Vanilla HTML/CSS/JS · No framework · Tailwind utilities |

---

## Award-Hebel-Übersicht

Sieben Hebel implementiert über 8 Sprints (128-135):

1. **Information-Architecture-Reorder** (Sprint 129)
   Show-don't-tell: Hero → Demos vor Personas. Eyebrow-Numbering konsistent in Render-Reihenfolge.

2. **Demo-Cards-Statement** (Sprint 131)
   Brand-Color-Vitrine pro Portfolio. Floating-Mockup-Shadow auf 8 unterschiedlichen Bühnen-Farben. Tactile-Feedback bei Tap.

3. **Hero-Verdichtung** (Sprint 130)
   Mickel-Letter-Spacing-Polish, Pentagram-Marginalia-Trios, Paula-Scher-Siegel-Embossing, Stagger 6→3 Beats (Identity/Promise/Proof).

4. **Deep-Moment** (Sprint 132)
   IntersectionObserver-Section-Reveal + Body-BG-Shift via 6 Cream-Töne + Siegel-Pulse 8s-Cycle. scroll-timeline als Progressive-Enhancement.

5. **Reading-Indicator** (Sprint 133)
   Pin-Spy Magazine-Page-Counter top-right. Sticky-CTA-Wording bewusst unverändert (semantische tel:+wa.me/-Links, kein Broken-UX).

6. **PWA + Dark-Mode** (Sprint 134)
   Manifest mit Shortcuts, Service-Worker mit stale-while-revalidate, offline.html Editorial-Page, warme Dark-Editorial-Palette.

7. **System-Hygiene** (Sprint 128)
   Brand-Token-Vereinheitlichung, 2547 Zeilen Dead-Code raus, 5 Inline-Scripts in m-interactions.js extrahiert.

---

## Screenshots

`screenshots/` (generiert via `node scripts/award-screenshots.mjs`):

1. `01-hero-cover-light.jpg` — Cover-Hero in Light-Mode
2. `02-demos-stadtmakler-light.jpg` — Demo-Page-№02 mit Indigo-Vitrine
3. `03-personas-light.jpg` — Persona-Index mit Cream-Even-Warmer-BG
4. `04-deep-moment-light.jpg` — Hero-zu-Demos Transition mit Body-BG-Morph
5. `05-siegel-light.jpg` — Manufaktur-Siegel mit Cream-Gold-Tint
6. `06-hero-cover-dark.jpg` — Cover-Hero in Dark-Editorial
7. `07-demos-stadtmakler-dark.jpg` — Demo-Page in Dark-Mode

Alle 1179×2556 px (iPhone 16 Pro native @ 3× retina).

---

## Build- + Submission-Workflow

```bash
# 1. Build Mobile-Pages
node scripts/build-mobile-pages.mjs

# 2. Generate Submission-Screenshots
node scripts/award-screenshots.mjs

# 3. Sync zum Mobile-Repo
bash scripts/sync-mobile-repo.sh

# 4. Submission-Form ausfüllen (siehe Submission-Form-Inputs oben)
```

---

## Accessibility-Statement

- WCAG 2.2 AA Foundation
- Touch-Targets ≥ 44 px (WCAG 2.5.5)
- Reduced-Motion-Override für ALLE Animationen
- Dark-Mode-Variants via prefers-color-scheme
- Color-Contrast getestet auf Light + Dark
- aria-labels, aria-hidden, role="dialog" auf Sheet-Modal
- Focus-Rings auf interaktiven Elementen
- Skip-Link für Screen-Reader
- BFSG-konform (deutsches Barrierefreiheits-Stärkungsgesetz)
- Semantisches HTML, kein div-Soup

---

## Performance-Statement

- 100 % statisches HTML, kein Build-Step für Output
- Sprint 134 PWA-Service-Worker (stale-while-revalidate für Assets,
  network-first für HTML, offline-fallback)
- WebP-Variants für alle Demo-Mockups (480 w + 800 w)
- Lazy-Load für Slides 1-7 (Slide 0 eager + fetchpriority="high")
- Intrinsic `<img width height>` für CLS=0
- Smoke-Tests: 83/83 grün
- Cache-Bust per Sprint (CSS v=134, JS v=134)

---

## Built with

Vanilla HTML5 · CSS3 · ES2020 JavaScript · Tailwind 3.4 (utilities only) ·
Playwright (Screenshots) · Service-Worker · No framework. Single-Source-
Build-Pipeline (scripts/build-mobile-pages.mjs).

Hosted on GitHub Pages mit Cloudflare DNS.
