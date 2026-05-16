# Karriaro Webdesign

Marketing-Site + Audit-Service der Webdesign-Manufaktur von Karriaro.

- **Marketing-Site**: statisch via GitHub Pages auf `karriaro-webdesign.de`,
  Quelle in `src/`, Auto-Deploy bei Push auf `main` via
  `.github/workflows/deploy.yml`.
- **Audit-Cloud-Functions**: Firebase Cloud Functions in
  `europe-west1`/`apex-executive`, Code in `functions/`. Endpoints:
  `quickAudit` (Inline-Mini-Audit), `requestAudit` (Komplettaudit per
  E-Mail), `deepResearch`, `generateMockup`, `securityAudit`, plus
  Google-Places-Proxies `searchPlaces`/`nearbyPlaces`.

## Setup

```bash
git clone … karriaro/webdesign
cd webdesign
npm ci
cd functions && npm ci && cd ..
```

Firebase-CLI:
```bash
npm i -g firebase-tools
firebase login
firebase use apex-executive
```

## Lokales Entwickeln

```bash
npm run preview   # serve dist/ auf http://localhost:3000
npm run build     # Tailwind + statische Copy nach dist/
```

## Tests

```bash
npm run test:audit   # 96 Tests: SSRF-Guard, Rate-Limit, Branch-Standards, Cross-Sell
npm run smoke        # Playwright-Smoke gegen 83 Seiten
```

## Deploy

Marketing-Site: Push auf `main`, GitHub-Action `.github/workflows/deploy.yml`
deployt nach GitHub Pages.

Cloud-Functions:
```bash
firebase deploy --only "functions:webdesign-functions"
```

## Secrets

Cloud-Function-Secrets sind via `defineSecret()` gebunden. Setzen:
```bash
firebase functions:secrets:set PLACES_API_KEY
firebase functions:secrets:set PSI_API_KEY
firebase functions:secrets:set CLAUDE_API_KEY
firebase functions:secrets:set SMTP_HOST
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
firebase functions:secrets:set IPHASH_SALT_BASE   # optional, Sprint 82
```

## Production-Readiness (Sprint 82)

Vor dem ersten zahlenden Kunden einmalig ausfuehren:

```bash
bash scripts/setup-firestore-ttl.sh       # DSGVO TTL-Policies (90d/7d)
bash scripts/setup-firestore-backup.sh    # GCS-Daily-Backup 30d Retention
BILLING_ACCOUNT_ID=XXXX bash scripts/setup-monitoring.sh   # Budget + Uptime
```

Plus Cloudflare Security-Header siehe `docs/SECURITY-HEADERS.md`.

## Architektur

```
src/                  Statische Marketing-Site (HTML/CSS/JS, inline)
  index.html          Hauptseite
  portfolio/*.html    7 Demo-Pages pro Branche
  *.html              Pflicht-Pages (impressum, datenschutz, agb, gruender, ...)

functions/
  index.js            8 Cloud-Function-Endpoints
  lib/
    safe-fetch.js     SSRF-Guard (Sprint 82)
    rate-limit-store.js  Firestore-backed Rate-Limit (Sprint 82)
    logger.js         Structured Cloud-Logging (Sprint 82)
    tech-patterns.js  Single-Source CMS-Pattern (Sprint 82)
    light-audit.js    Schnelle 3-5s Audit-Variante
    audit-pipeline.js Vollpipeline mit PSI/Lighthouse
    branch-standards.js  23 Branchen-Standards (was muss eine Friseur-Site haben?)
    karriaro-cross-sell.js  Empfohlene Karriaro-Tools pro Branche
    deep-research.js  Multi-Page-Crawl + Claude-Sonnet-Analyse
    mockup-generator.js  Claude-Mockup-Generation
    security-audit.js Security-Headers + TLS-Check
  test/
    audit-pipeline.test.js  54 Tests
    safe-fetch.test.js      31 Tests (Sprint 82)
    rate-limit-store.test.js  11 Tests (Sprint 82)

scripts/              Setup + Deploy + Image-Generation
docs/                 Operational Docs (Security-Headers, …)
```

## Runbook

| Symptom | Wahrscheinliche Ursache | Aktion |
|---|---|---|
| quickAudit gibt `degraded:true` | SSRF-Guard hat private-IP geblockt oder Site nicht erreichbar | Cloud-Logs filtern auf `ssrf:true` — wenn ja: korrektes Verhalten. Sonst: User-URL pruefen |
| 429 Rate-Limit-Exceeded | Firestore-Counter zaehlt zu oft | `rateLimitCounters/<hash>` in Firestore inspizieren — manuell loeschen falls Bug |
| Daily Firestore-Backup faellt aus | Cloud-Scheduler-Job angehalten oder Permission entzogen | `gcloud scheduler jobs run firestore-daily-backup` ; Logs in Cloud-Console |
| Lighthouse-Tracking sichtbar leer | Hetzner-Server unten oder Snippet blockiert | https://lighthouse.karriaro.de Status-Check |

## Sprint-Historie

Siehe Commits — Sprints 69–82 sind dokumentiert in den jeweiligen
Sprint-Memory-Files (Repo-extern).
