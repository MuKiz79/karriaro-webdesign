# Karriaro Webdesign — Case Study (Award-Submission)

**Project:** karriaro-webdesign.de — Brand-Site & Productized-Service-Plattform
**Year:** 2026
**Founder & Designer:** Muammer Kızılaslan, Köln
**Stack:** Vanilla HTML / CSS / JS · Fraunces · Inter · JetBrains Mono · Cormorant Garamond · Lenis · GitHub Pages
**Live:** https://karriaro-webdesign.de
**Repo:** https://github.com/MuKiz79/karriaro-webdesign

---

## 01 · Problem

Der deutsche Mittelstand (KMU 50+) ist im Webdesign-Markt zwischen zwei schlechten Optionen eingeklemmt:

- **Freelancer** für 500 € — günstig, aber unzuverlässig, Vendor-Lock-In, keine BFSG-Compliance.
- **Agentur** für 5–25 k € — teuer, slow (6-Monats-Projekte), Account-Manager-Karussell, generische Templates.

Gleichzeitig wird ab Juni 2025 das **Barrierefreiheitsstärkungsgesetz (BFSG)** Pflicht für Unternehmens-Websites in Deutschland. Über 80 % aller KMU-Sites sind nicht konform.

## 02 · Insight

Ein Productized-Service mit drei harten Versprechen, die kein Wettbewerber gleichzeitig hält:
1. **Festpreis** (Essential 1.290 € · Professional 1.990 € · Premium 2.990 € · Premium+ 3.990 €) — branchen-getrennt, keine Stundenabrechnung.
2. **Festes Liefer-SLA** (7–28 Tage je nach Tier).
3. **Founder-Sale** — direkt vom Gründer, kein Vertriebsapparat. „Eine Person pro Auftrag."

Die Brand-Site muss diese drei Versprechen nicht nur behaupten, sondern **live beweisen** — durch Demonstration eigener Webdesign-Fähigkeit auf der Site selbst.

## 03 · Solution

Eine Brand-Site, die als **ihre eigene beste Case-Study** funktioniert. Vier konstruktive Säulen:

### A · Substanz statt Marketing-Theater
50+ interaktive Branchen-Werkzeuge auf 7 Demo-Sub-Pages (BAFA-Förderrechner für Dachdecker, KI-Symptom-Checker für Praxen, AI-Sommelier für Restaurants etc.). Auf der Hauptseite **wechseln 7 Live-Tools** über eine Tab-Bühne; jedes Werkzeug ist mit echten Berechnungen voll funktional, kein Mockup.

10.538 Zeilen handcodierter Code · 0 Templates · 0 externe Plugins. Counter live animiert beim Scroll-In.

### B · Self-Demonstrating Performance
Eine Sektion namens „Diese Seite läuft schneller als 95 % der DACH-Sites — beweisen wir live" zeigt einen **SVG-Bar-Chart**, dessen Karriaro-Bar den realtime Largest-Contentful-Paint per Browser-`PerformanceObserver` ausgibt. Vergleichswerte: DACH-Median 2,8 s · WordPress+Elementor 4,2 s · Wix 5,1 s.

### C · Editorial Magazine, kein Marketing-Web
Custom Type-System (Fraunces Variable Display + Inter Body + JetBrains Mono Eyebrows + Cormorant Garamond für Pull-Quote). Manufaktur-Brand-Palette: Indigo `#1A2E40` · Werkstatt-Gold `#8A7B5C` · Skizzen-Cream `#F8F4ED`. Asymmetrische Editorial-Layouts: 60vh Pull-Quote-Hero mit überhängendem Anführungszeichen (clamp 180–320px), 40/60-Founder-POV mit handgezeichneter Konzept-Skizze als Inline-SVG, 5-Akt-Werkstatt-Scrollytelling, Beitrag/Übernahme als „Split-Manuskript" (handschriftliche Italic-Spalte vs gesetzte Druck-Spalte), Stempel-Briefkarte als Kontakt-Form mit handschriftlicher Signatur.

### D · Sales-Geometrie
4-Tier-Pricing mit **Branchen-Selector** (Dropdown markiert das passende Tier). **Wartung default ON** in jeder Karte als Toggle (Care 99 €/Mt oder Care+ 199 €/Mt) — der bestehende Geschäftsmodell-Hebel zur Recurring-Revenue-Maximierung. Cross-Sell für Karriaro Profil-Generator als 290 €-Add-on. Empfehlungsprogramm 200 € Cashback prominent.

## 04 · Craft & Detail

- **Type-Pairing-System:** vier Webfonts mit semantischer Rolle (Display/Body/Mono/Italic-Quote), Variable-Font-Subsetting für Performance
- **Manufaktur-Palette codifiziert** in CSS-Tokens (`:root` Layer + `src/css/tokens.css` shared)
- **A11y first:** `:focus-visible` mit 3px Indigo-Outline, vollständiger `prefers-reduced-motion`-Branch (Lenis, Stagger-Reveal, Bar-Animations disabled), WCAG-konform
- **Lenis Smooth-Scroll** + Reading-Progress-Bar + Stagger-Reveal-Observer + Magnetic-CTA auf Pointer-Devices
- **Footer-Colophon „This page made of":** Type-Stack-Specimen mit jeder Font in eigener Schrift gerendert, Palette-Swatches als Kreise, Live-LCP-Wert, Manufaktur-Stand-Counter, „Made in Köln"
- **Stadt-Karte Deutschland** im Footer als abstrakter SVG-Punkte-Cluster (14 Städte mit Title-Tooltips, Berlin + Köln als Gold-Marker)

## 05 · Architecture

Zero-JavaScript-Framework. Vanilla HTML/CSS/JS, static-hosted auf GitHub Pages. **Performance-Budget:** LCP < 0,5 s, Lighthouse 95+. Repository ist Open-Source — der Quellcode der Brand-Site demonstriert direkt, was Kunden geliefert bekommen.

- `src/index.html` — Hauptseite, ~3.500 Zeilen
- `src/portfolio/*.html` — 7 Branchen-Demo-Sub-Pages, je 1.000–1.800 Zeilen, jede mit echtem Live-Tool
- `src/js/karriaro-tools.js` — Shared Live-Tool-Modul, ~230 Zeilen
- `src/css/karriaro-tools.css` + `src/css/tokens.css` — Shared Brand-System

## 06 · Outcome

**Stand zur Award-Submission (Mai 2026):** Pre-Customer-Phase. Outbound-Maschine + Audit-Tool sind aktiviert, ICP-Top-6-Branchen sind definiert. Die Brand-Site selbst ist das primäre Konversions-Asset und Award-Submission-Ziel.

Karriaro-Webdesign hat keinen Anspruch, „das schönste Web zu machen". Sie hat den Anspruch, **das ehrlichste deutsche Webdesign** zu sein — branchen-spezifisch, BFSG-konform, code-eigen, Manufaktur-handwerklich.

Die Site ist ihre eigene Bewerbung.
