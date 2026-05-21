# Karriaro-Webdesign — Projekt-Kodex (Sprint 141)

Dieser Kodex wird bei jeder Claude-Code-Session als Context-Header geladen.
Brand-Voice, Award-Criteria und Performance-Budget sind nicht-verhandelbar
und überschreiben generische Defaults.

## Geschäftsmodell (kurz)

Karriaro = Schwarzwald-Manufaktur für handcodierte Premium-Websites.
Preisarchitektur 1.290–3.990 € einmalig (Essential / Professional /
Premium / Premium+). Zielgruppe: lokaler Mittelstand DACH (Handwerk,
Beauty, Immobilien, Gastronomie, Medizin, Recht). USP:

> **„Wenn Ihr Name draufsteht, steht unserer dahinter."**

Pre-Launch (Stand 2026-05-21, keine zahlenden Kunden). Showcase ist
Founder-as-Demo; Testimonials = [].

## Brand-Voice-Codex

**Referenzen** (Ton + Visual): Aesop, Hermès, Manufactum, Brunello
Cucinelli, Monocle Magazine. **Nicht**: Apple-Clean (zu kalt),
Werkstatt-Klischee, generic SaaS-Hero.

### Erlaubte Voice-Patterns
- Editorial-Magazine-Codex: Folio-Nummern (№ 01–06), Pentagram-Print-
  Marginalia (Side-Notes mit ₁/₂/₃), JetBrains-Mono-Eyebrows in `uppercase
  letter-spacing: 0.16em`, Fraunces-Serif (opsz + WONK) für Headlines,
  Inter für Body.
- Sie-Anrede durchgängig (Executive-Audience).
- Sparringspartner als Kernterm (positiv konnotiert).
- Manufaktur-Siegel: Fibonacci-Phyllotaxis-SVG (Goldener Winkel 137.5°,
  13 Punkte), pulsiert in Deep-Moment-Section.

### Verbotene Worte / Phrasen
- **„Handgemacht"** als isolierter Hero-Term (Werkstatt-Klischee). Erlaubt
  nur in Pull-Quote-Kontext mit Editorial-Framing.
- **„Werkstatt"**, **„Werkbank"** als visuelle Sprache (kein Holz-Stock-
  Photo, kein Schurz-Hammer-Aesthetic).
- **„Handcodiert"** alleine ist OK, aber nicht als USP-Anker — der ist die
  Promise „Wenn Ihr Name draufsteht…".
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

- **Smoke-Tests**: `npm run smoke` → 83/83 ✓ als Pre-Commit-Gate.
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
separat (siehe feedback_deploy_workflow.md). GitHub-Pages-Deploy für
beide Repos:
- Desktop: `MuKiz79/karriaro-webdesign` → `karriaro-webdesign.de`
- Mobile: `MuKiz79/karriaro-webdesign-mobile` → `m.karriaro-webdesign.de`

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
