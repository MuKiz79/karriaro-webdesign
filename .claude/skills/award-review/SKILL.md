---
name: award-review
description: Multi-Agent-Audit für Karriaro-Webdesign vor Award-Submission. Startet 3 parallele Explore-Subagents (Apple HIG / WCAG 2.2 AA / Awwwards-SOTD-Heuristik), konsolidiert Findings in priorisierter Tabelle, gibt 0-100 Score + Top-3-Quick-Wins zurück.
---

# /award-review — Multi-Agent-Audit für Award-Reife

## Ziel

Vor jeder Awwwards-/Apple-Design-Awards-Submission ein konsolidierter,
strukturierter 3-Lens-Audit der Live-Site. Output entscheidet:
**Submission-Ready (Score ≥ 85)** vs **Folge-Sprint nötig (Score < 85)**.

## Workflow

Wenn dieser Skill aufgerufen wird:

### Schritt 1 — CLAUDE.md laden

Lies `CLAUDE.md` im Projekt-Root für:
- Brand-Voice-Codex (verbotene Worte, erlaubte Voice)
- Performance-Budget (LCP/CLS/FID/TTI/Total-Size Targets)
- Award-Target (Awwwards SOTD Scoring 40/30/20/10)
- Bestehende Sprint-Patterns (138/139/140)

### Schritt 2 — Lighthouse-Snapshot

Falls letzter Lighthouse-Report in `award-submissions/.reports/` älter
als 24h ist, neu laufen lassen (sonst überspringen):

```bash
mkdir -p award-submissions/.reports
date_iso=$(date -u +"%Y%m%dT%H%M%S")
npx --yes lighthouse https://m.karriaro-webdesign.de/ \
  --preset=mobile --output=json \
  --output-path=award-submissions/.reports/lighthouse-mobile-${date_iso}.json \
  --chrome-flags="--headless" --quiet
```

Extrahiere die 4 Scores (Performance, Accessibility, Best-Practices, SEO)
für den Auditor-Context.

### Schritt 3 — 3 Subagents PARALLEL starten

In **einer einzigen Message** mit drei Agent-Tool-Calls:

#### Agent 1 — Apple-HIG-Auditor (subagent_type: Explore)

Prompt:
> Du bist Apple-HIG-2025-Auditor für Karriaro-Webdesign (m.karriaro-webdesign.de).
> Lies systematisch durch:
> - `src/m/index.html` (Mobile-Landing)
> - `src/m/case-study.html` (Editorial-Award-Page)
> - `src/css/mobile-overrides.css` (alle Mobile-Styles)
> - `src/js/m-interactions.js` (alle Interactions)
>
> Audit gegen Apple HIG 2025 (https://developer.apple.com/design/human-interface-guidelines):
> - **Touch-Targets**: alle interaktiven Elemente ≥ 44×44 pt
> - **Type-Scale**: System-Default oder bewusst editorial; min 11pt für Captions
> - **Color-Contrast**: WCAG-AA-Minimum, AAA bevorzugt
> - **Spacing**: 8pt-Grid (oder bewusst editorial-grid)
> - **Motion**: prefers-reduced-motion override für ALLE Animationen
> - **Dark-Mode**: Editorial-Palette statt OLED-Pure-Black
> - **Safe-Areas**: env(safe-area-inset-*) auf Notch/Home-Indicator-iPhones
> - **Hierarchy**: klare visuelle Hierarchie (1 H1 pro Page)
> - **Iconography**: SF-Symbols-Style oder bewusst custom-editorial
>
> Output: **Top-5 konkrete Issues** mit:
> - File:Zeile (z.B. `src/m/index.html:1247`)
> - Severity (Show-Stopper / Polish / Nice)
> - Empfohlener Fix in 1-2 Sätzen
>
> Keine generischen Lobgesänge. Konkret, scharf, ergebnisorientiert.

#### Agent 2 — WCAG-2.2-AA-Auditor (subagent_type: Explore)

Prompt:
> Du bist WCAG-2.2-AA-Compliance-Auditor für Karriaro-Webdesign.
> Lies durch wie Agent 1 (gleiche Files).
>
> Audit gegen WCAG 2.2 AA (https://www.w3.org/WAI/WCAG22/quickref/):
> - **Color-Contrast**: Body-Text ≥ 4.5:1, Large-Text ≥ 3:1, UI-Components ≥ 3:1
> - **Focus-Visible**: alle interaktiven Elemente sichtbarer Focus-Ring
> - **Keyboard-Navigation**: Tab-Order logisch, Esc schließt Modals
> - **ARIA-Labels**: alle Icon-Buttons, alle interaktiven SVGs
> - **Skip-Links**: „Skip to main content" verfügbar
> - **Alt-Texts**: alle `<img>` haben alt (auch dekorative = `alt=""`)
> - **Heading-Hierarchy**: keine h1→h3-Sprünge
> - **prefers-reduced-motion**: respektiert auf allen Animationen
> - **Form-Labels**: alle Inputs haben sichtbares `<label>`
> - **Touch-Targets**: ≥ 24×24 CSS-px (WCAG-2.2 neu), bevorzugt 44+
> - **Target Spacing**: Spacing zwischen Targets ≥ 24px (WCAG-2.2 neu)
>
> Output: **Top-5 konkrete Issues** mit File:Zeile, Severity, Fix.

#### Agent 3 — Awwwards-SOTD-Heuristik-Auditor (subagent_type: Explore)

Prompt:
> Du bist Awwwards-Site-of-the-Day-Juror (2026-Maßstab) für Karriaro-Webdesign.
> Awwwards-Scoring: Design 40% / Usability 30% / Creativity 20% / Content 10%.
>
> Lies durch wie Agent 1 (gleiche Files) PLUS:
> - `award-submissions/SUBMISSION.md` (Submission-Pitch)
> - `src/css/tokens.css` (Brand-Tokens)
> - `src/m/manifest.json` (PWA-Manifest)
>
> Awwwards-2026-SOTD-Heuristik (was Juroren WIRKLICH bewerten):
> - **Innovation**: was machst du anders als 80% der anderen Submissions?
> - **Polish**: 0 Drift, 0 Inkonsistenz, kein Off-by-1-Padding
> - **Mobile-First**: nicht „responsive desktop", echt mobile-conceived
> - **Loading-States**: jeder async Load hat State (Skeleton/Spinner/Progress)
> - **Microinteractions**: Hover/Tap/Scroll-Feedback bewusst designt
> - **Brand-Distinctiveness**: 1-Word-Recall (Magazine? Manufaktur? Editorial?)
> - **Editorial-Polish**: Type-Pairing, Pull-Quotes, Marginalia, Folio
> - **PWA + Offline**: funktioniert ohne Netz?
> - **Performance-Story**: Lighthouse-Score öffentlich kommuniziert?
> - **Content-Depth**: erzählt eine Story oder nur „Hier sind unsere Demos"?
>
> Output: **Top-5 konkrete Issues** mit File:Zeile, Severity, Award-Impact (1-10).

### Schritt 4 — Konsolidierung

Aus den 3 Agent-Reports baue eine **konsolidierte Findings-Tabelle**:

| # | Issue | Lens (HIG/WCAG/SOTD) | Severity | Fix-Aufwand (min) | Award-Impact (1-10) | File:Zeile |
|---|---|---|---|---|---|---|

Sortiere nach `Award-Impact DESC, dann Fix-Aufwand ASC`.

### Schritt 5 — Score berechnen

```
Total Score = 100
für jedes Issue:
  if Severity == "Show-Stopper":  -8
  if Severity == "Polish":        -3
  if Severity == "Nice":          -1
clamp(Total Score, 0, 100)
```

### Schritt 6 — Output-File

Schreibe nach `award-submissions/.reports/award-review-sprint-{N}.md`:

```markdown
# Award-Review — Sprint {N} — {ISO-Date}

**Score**: {Score}/100 — {Submission-Ready | Folge-Sprint nötig}

## Lighthouse-Snapshot
- Performance: {P}
- Accessibility: {A}
- Best-Practices: {BP}
- SEO: {SEO}

## Konsolidierte Findings

[Tabelle]

## Top-3 Quick-Wins

1. [Issue] — [Fix-Aufwand min] — [Award-Impact]
2. ...

## Empfehlung

{wenn Score ≥ 85}
**SUBMISSION-READY**. Finale Submission-Checkliste:
- [ ] Awwwards-Form ausgefüllt
- [ ] Apple Design Awards Form ausgefüllt (optional)
- [ ] 8+2 Screenshots in award-submissions/screenshots/
- [ ] SUBMISSION.md auf 300 Wörter geprüft
- [ ] OG-Image aktualisiert
- [ ] Twitter-Card meta

{wenn Score < 85}
**FOLGE-SPRINT NÖTIG**. Top-3 Quick-Wins zuerst (oben). Geschätzter
Aufwand bis Score 85: ~{X} min.
```

### Schritt 7 — User-Antwort

Gib dem User die konsolidierte Tabelle + Score + Top-3 + Pfad zum
Output-File zurück. Wenn Submission-Ready, frage NICHT „soll ich
submitten?" — gib die Checkliste aus, User entscheidet.

## Wann diesen Skill nicht nutzen

- Mid-Sprint-Quick-Checks (nutze Smoke + Visual-Sweep)
- Reine Code-Reviews (nutze /ultrareview)
- A11y-Spot-Checks (Axe-DevTools im Browser ist schneller)

## Limitationen

- Subagent-Findings können widersprüchlich sein. Konflikt-Resolution:
  Awwwards-Lens > Apple-HIG > WCAG (SOTD ist Primär-Target).
- Lighthouse läuft headless gegen Production — lokale Edits sind erst
  nach Push + 90s sichtbar.
- Score-Formel ist Heuristik, nicht Awwwards-internal-Scoring. Kalibriert
  empirisch für „Site-of-the-Day-Reife".
