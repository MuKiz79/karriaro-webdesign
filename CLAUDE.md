# Karriaro-Webdesign — Projekt-Kodex (Stand 2026-06)

Dieser Kodex wird bei jeder Claude-Code-Session als Context-Header geladen.
Brand-Voice, Award-Criteria und Performance-Budget sind nicht-verhandelbar
und überschreiben generische Defaults.

## Geschäftsmodell (kurz)

Karriaro = Kölner Webdesign-Manufaktur für handcodierte Premium-Websites
(Legal-Sitz Schiltach). Preisarchitektur 1.290–3.990 € einmalig (Essential /
Professional / Premium / Premium+). Zielgruppe: lokaler Mittelstand DACH
(Handwerk, Beauty, Immobilien, Gastronomie, Medizin, Recht). Kern-Tagline:

> **„Handcodierte Unikate mit eingebauten Werkzeugen, die mitarbeiten und
> für die KI-Auffindbarkeit optimiert sind."**

Sekundäres Motto: „Wenn Ihr Name draufsteht, steht unserer dahinter."
Marken-H1: „Ihre Website. Ein Unikat, das mitarbeitet." Early-Stage
(Stand 2026-06, ≥1 zahlender Kunde — echte Google-Review Ilyas Kablan).
Showcase überwiegend Founder-as-Demo.

## Brand-Voice-Codex

**Referenzen** (Ton + Visual): Aesop, Hermès, Manufactum, Brunello
Cucinelli, Monocle Magazine. **Nicht**: Apple-Clean (zu kalt),
Werkstatt-Klischee, generic SaaS-Hero.

### Erlaubte Voice-Patterns
- Editorial-Magazine-Codex: Folio-Nummern (№ 01–11), Pentagram-Print-
  Marginalia (Side-Notes mit ₁/₂/₃), JetBrains-Mono-Eyebrows in `uppercase
  letter-spacing: 0.16em`, Fraunces-Serif (opsz + WONK) für Headlines,
  Inter für Body.
- Sie-Anrede durchgängig (Executive-Audience).
- Sparringspartner als Kernterm (positiv konnotiert).
- Manufaktur-Siegel & Logo: dichte Phyllotaxis-Blüte (Goldener Winkel
  137.5°, ~110–120 Punkte; Gold = Fibonacci-Indizes). Single-Source-
  Generator `scripts/build-logo-assets.mjs` (favicon/PWA/og/Nav-SVG).
  Palette Navy #16202C / Creme #F1EFE7 / Messing #C9A24B, Wortmarke
  Fraunces. Pulsiert in Deep-Moment-Section.

### Verbotene Worte / Phrasen
- **„Handgemacht"** ist komplett raus (auch SEO/Meta → „handcodiert").
  Marken-Begriff ist durchgängig „handcodiert".
- **„Werkstatt"**, **„Werkbank"** als visuelle Sprache (kein Holz-Stock-
  Photo, kein Schurz-Hammer-Aesthetic).
- **„Handcodiert"** ist der durchgängige Marken-Anker (auch Hero/Subline);
  „Wenn Ihr Name draufsteht…" ist nur noch sekundäres Motto.
- SaaS-Filler: „keine Kreditkarte nötig", „kostenlos starten", „in unter
  60 Sekunden" als billige Reduktion. Erlaubt: konkrete Demo-Werte mit
  Editorial-Voice („Wertermittlung in 60 Sekunden, diskret begleitet").
- **Hansgrohe-Reference** in Public-Messaging (Brand-Trennung-Regel).
  Founder-Bio darf VP-IT-Hintergrund erwähnen, aber NICHT als Karriaro-
  Authority-Anker. Hansgrohe-Logo nie auf der Site.
- „Du"-Anrede in Karriaro-Content (Cockpit darf, Public-Site nicht).

## Award-Target

**Primär**: Awwwards Site of the Day (SOTD) — Scoring-Gewichtung
- Design 40%
- Usability 30%
- Creativity 20%
- Content 10%

**Sekundär** (parallel-submitten, Submission-Aufwand ≈ +30 min/Award):
Apple Design Awards (PWA-Mobile-Excellence), FWA (Mobile-Award),
CSS Design Awards (Editorial-Design).

## Performance-Budget (nicht-verhandelbar)

Mobile First-Visit, gemessen via Lighthouse Mobile-Preset auf 4G:

| Metric | Target | Action bei Verletzung |
|---|---|---|
| LCP | ≤ 1.8s | Hero-Image WebP+lazy, Critical-CSS inline |
| CLS | ≤ 0.05 | Intrinsic width/height auf allen Bildern |
| FID / INP | ≤ 100ms | Kein 3rd-Party-JS, JS unter 50KB |
| TTI | ≤ 3s | Code-Splitting (HTML splits via lazy iframes) |
| Total Page Size | ≤ 200KB | WebP-Mockups 480w/800w, Inline-Critical |

Stack-Regel: **vanilla HTML/CSS/JS only**. Kein React/Vue/Svelte.
Keine 3rd-Party-Tracker (Plausible-EU OK, Google Analytics NEIN).
WebP für alle Mockups (`/images/mockups-opt/*.webp`).
Critical-CSS inline im `<head>` der Mobile-Hauptseiten.

## Test- + Build-Conventions

- **Smoke-Tests**: `npm run smoke` → 83/2 (83 pass / 2 known-fail) als Pre-Commit-Gate.
- **Mobile-Build**: `node scripts/build-mobile-pages.mjs` (generiert
  `src/m/*` aus `src/*`, propagiert Embed-Snippet via Sprint-140-Regex).
- **Mobile-Repo-Sync**: `bash scripts/sync-mobile-repo.sh` (interaktiv,
  `read` prompt am Ende — User muss y/N drücken).
- **Cache-Bust-Konvention**: bei jedem Mobile-Overrides-CSS-Update oder
  Embed-Snippet-Change → `?v={SprintNumber}` in allen `<link>`-Refs
  hochzählen (siehe feedback_mobile_overrides_cache_bust.md).
- **Lighthouse**: `npx lighthouse https://m.karriaro-webdesign.de/
  --preset=mobile --output=json` (lokal); CI-Run via Post-Push-Hook
  (siehe `.claude/hooks/post-push-lighthouse.sh`).

## Sprint-Memory-Konvention

Nach jedem Sprint Memory-File anlegen:
`~/.claude/projects/-Users-muammerkizilaslan/memory/project_karriaro_webdesign_sprint_{N}_{YYYY-MM-DD}.md`

Plus Index-Entry in `MEMORY.md` (Format `- [Titel](file.md) — Kurzhook`).
Memory-Body MUSS enthalten: Commits, Trigger (User-Quote), Root-Cause,
Fix, Verifikation, Lessons-Learned, Stand.

## Wichtige Bestehende Patterns (nicht brechen)

- **Sprint 138**: `section.hero` auf Mobile braucht `padding: 64px 24px
  !important` + `grid-template-columns: minmax(0, 1fr) !important`. CSS-
  Grid `1fr` (= `minmax(auto, 1fr)`) expandiert durch content-min-width.
- **Sprint 139**: Source-Image-Quality-Issues nicht via CSS fixen.
  Python-PIL-Crop (`scripts/crop-portrait-top.py`) ist reusable.
- **Sprint 140**: `?embed=hero` aktiviert `html.embed-hero`-Mode auf den
  8 Portfolio-Pages. iframe in Demo-Karten ist `pointer-events: none` +
  lazy via IntersectionObserver (rootMargin 200px), Skeleton-Fallback.
- **stripAutoRedirect-Regex**: negative-Lookahead gegen `</script>`
  (nicht greedy lazy `*?`), sonst werden benachbarte Scripts/Styles
  geschluckt.
- **8 Portfolio-Pages haben 5 verschiedene Hero-DOM-Patterns** —
  Stadtmakler/Coaching/Restaurant/Spedition haben `.hero-content`,
  Praxis/Friseur/Dachdecker/Sanitär nutzen unbenanntes `<div>` +
  `.hero-mockup`. Universal-CSS muss beide handhaben.

## Deploy-Workflow (immer zusammen)

Bei jeder Code-Änderung: build + commit + push + (mobile-)sync. Nicht
separat (siehe feedback_deploy_workflow.md). **Firebase-Hosting**-Auto-Deploy
bei Push auf `main` via `.github/workflows/deploy.yml`
(`FirebaseExtended/action-hosting-deploy`, Secret
`FIREBASE_SERVICE_ACCOUNT_APEX_EXECUTIVE`, Projekt `apex-executive`, Target
`karriaro-webdesign`). Security-Header + Cache-Control liegen in
`firebase.json` (nicht Cloudflare/GitHub-Pages):
- Desktop: Repo `MuKiz79/karriaro-webdesign` → `karriaro-webdesign.de`
- Mobile: Repo `MuKiz79/karriaro-webdesign-mobile` → `m.karriaro-webdesign.de`
  (separater Sync via `scripts/sync-mobile-repo.sh`)

## Plan-Mode + Auto-Mode

- **Plan-Mode**: für nicht-trivialen Sprint immer erst Plan in
  `~/.claude/plans/wir-sind-im-projekt-parallel-lemur.md`, dann
  ExitPlanMode mit `allowedPrompts`.
- **Auto-Mode**: bei klar gegebenem Auftrag ohne Klärungs-Frage weiter
  ausführen — Memory `feedback_keine_sprint_stops.md` ist relevant.

## Award-Review-Skill

`.claude/skills/award-review/SKILL.md` startet 3 parallele Subagents
(Apple HIG / WCAG 2.2 AA / Awwwards-SOTD-Heuristik). Output landet in
`award-submissions/.reports/award-review-sprint-{N}.md` (gitignored).
