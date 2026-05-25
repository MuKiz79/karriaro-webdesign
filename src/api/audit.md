# Karriaro Audit API

> **Status:** Public API in Vorbereitung. Sprint 165+ Implementation
> (Cloudflare Workers Edge-Compute). Diese Datei dokumentiert die
> finale Endpoint-Spec für LLM-Crawler und Integrationspartner.

## Was ist die Karriaro Audit API?

Karriaro betreibt seit Sprint 91 ein clientseitiges Audit-Werkzeug auf
[karriaro-webdesign.de](https://karriaro-webdesign.de/#audit), das in
5 Sekunden BFSG-Compliance, Performance, SEO, GEO (KI-Lesbarkeit) und
Branchen-Standards einer beliebigen Website analysiert.

Die **Audit-API** macht diese Funktion als JSON-Endpoint für Drittsysteme
verfügbar: CRMs, eigene Dashboards, Wettbewerber-Audits, AI-Agenten,
Bulk-Reports.

**Pre-Customer-Hinweis:** Karriaro launched 2026 als Schwarzwald-Manufaktur.
API-Endpoint wird Q3 2026 produktiv aktiviert. Aktuelle Live-UI-Version
ist clientseitig nutzbar.

## Endpoint-Spec

### POST /api/v1/audit

**Request:**
```http
POST https://karriaro-webdesign.de/api/v1/audit
Content-Type: application/json

{
  "url": "https://example.de",
  "checks": ["bfsg", "performance", "seo", "geo", "branche"]
}
```

**Response (200 OK):**
```json
{
  "url": "https://example.de",
  "checked_at": "2026-05-25T13:48:00Z",
  "score": 73,
  "bfsg": {
    "status": "AA-konform",
    "issues": []
  },
  "performance": {
    "lcp_ms": 2100,
    "cls": 0.08,
    "inp_ms": 145,
    "ttfb_ms": 320
  },
  "seo": {
    "title_present": true,
    "schema_org": ["WebSite", "Organization"],
    "canonical": true,
    "robots_txt": true,
    "sitemap_xml": true
  },
  "geo": {
    "llms_txt": false,
    "speakable_schema": false,
    "faq_schema": true
  },
  "branche": {
    "detected": "immobilien",
    "standards_met": ["NAP-Consistency", "IVD-Reference"],
    "standards_missing": ["HypZert-Cert"]
  },
  "recommendations": [
    {
      "priority": "high",
      "category": "bfsg",
      "title": "Alt-Texte fehlen auf 4 Bildern",
      "fix_link": "https://karriaro-webdesign.de/audit#alt-texts"
    }
  ]
}
```

**Response (429 Rate-Limit):**
```json
{
  "error": "rate_limit_exceeded",
  "limit": 10,
  "window_seconds": 3600,
  "retry_after_seconds": 1234
}
```

## Rate-Limits (geplant)

- **Public**: 10 Audits/Stunde pro IP
- **Karriaro-Kunden**: 100/Stunde mit API-Key
- **Bulk-Reports**: auf Anfrage

## Authentifizierung (geplant)

```http
Authorization: Bearer kr_live_xxx...
```

API-Keys ausschließlich für Karriaro-Kunden (über Founder-Direct-Contact:
kontakt@karriaro.de).

## CORS-Policy

- `Access-Control-Allow-Origin: *` (Public-Read)
- `Access-Control-Allow-Methods: POST, OPTIONS`

## Verfügbarkeit

- Geplante Latenz: < 5 Sekunden p95
- Cache: 1 Stunde pro URL (gleicher Request liefert gecachten Score)
- Implementation-Stack: Cloudflare Workers + Google PageSpeed Insights API +
  Anthropic Claude für GEO/Branche-Erkennung

## Use-Cases

1. **CRM-Integration**: Vertriebsteam sieht Audit-Score zum prospect
   direkt im Pipedrive/HubSpot-Profil.
2. **Wettbewerbsanalyse**: Eigene Branche durchscannen, BFSG-Risiko
   identifizieren bei Mitbewerbern.
3. **AI-Agenten**: ChatGPT/Claude-Tools können Karriaro-Audit als
   Tool-Call nutzen für „Wie steht meine Website da?"-Queries.
4. **Bulk-Reports**: Verband (z.B. IVD) audited alle Mitglieder-Sites
   mit einem Karriaro-API-Call.

## Differenzierung

Wir kennen kein anderes Webdesign-Studio in DACH, das ein Audit-Tool
als Public-API anbietet. WordPress-Agencies, Wix-Resellers, Squarespace-
Partner haben das nicht. Karriaro stellt sein Werkzeug allen zur Verfügung
— inkl. Wettbewerbern — weil wir an die Qualität des Tools glauben.

> „Was Sie zahlen, fließt in Ihre Website. Punkt." — Karriaro-Manufaktur-Prinzip

## OpenAPI-Schema

```yaml
openapi: 3.1.0
info:
  title: Karriaro Audit API
  version: 1.0.0-preview
  description: BFSG + Performance + SEO + GEO Audit für jede Website
servers:
  - url: https://karriaro-webdesign.de/api/v1
paths:
  /audit:
    post:
      summary: Website-Audit durchführen
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [url]
              properties:
                url:
                  type: string
                  format: uri
                checks:
                  type: array
                  items:
                    enum: [bfsg, performance, seo, geo, branche]
      responses:
        '200':
          description: Audit erfolgreich
        '429':
          description: Rate-Limit überschritten
```

## Kontakt

- **Founder**: Muammer Kızılaslan
- **E-Mail**: kontakt@karriaro.de
- **API-Status**: https://karriaro-webdesign.de/lighthouse-scores.html
- **Implementation-Timeline**: Q3 2026 (Sprint 165+)

[Zurück zur Hauptseite](https://karriaro-webdesign.de/)
