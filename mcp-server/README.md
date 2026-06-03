# @karriaro/webdesign-mcp

> MCP-Server der Karriaro Webdesign-Manufaktur (Köln) für
> Claude Desktop, Cursor, OpenAI Codex und jeden MCP-kompatiblen Agent.

Vier Tools — alle Outputs im Editorial-Stil mit Karriaro-Signatur:

| Tool | Was es macht |
|---|---|
| `karriaro_audit_site` | Prüft eine Website auf Substanz, BFSG-Konformität, SEO und KI-Auffindbarkeit. Qualitatives Verdict + Top-Findings. |
| `karriaro_extract_voice` | Analysiert den Brand-Voice nach Karriaro-Codex (Aesop/Hermès/Manufactum-Editorial vs SaaS-Filler). |
| `karriaro_generate_brand_mockup` | Generiert eine Hero-Mockup-SVG für eine Branche im Karriaro-Editorial-Stil. |
| `karriaro_phyllotaxis_signature` | Erzeugt ein deterministisches Phyllotaxis-Siegel (Goldener Winkel) für einen Namen. |

## Installation

```bash
npm install -g @karriaro/webdesign-mcp
```

## Konfiguration

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
oder `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "karriaro": {
      "command": "karriaro-mcp"
    }
  }
}
```

Claude Desktop neu starten. Tools erscheinen als „Karriaro-Tools" im
Tool-Picker.

### Cursor

In `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "karriaro": {
      "command": "karriaro-mcp"
    }
  }
}
```

### Direkter HTTP-Aufruf (ohne npm-Install)

Falls Sie kein lokales Install wünschen, können MCP-Clients mit HTTP-
Transport-Support den Endpoint direkt nutzen:

```json
{
  "mcpServers": {
    "karriaro": {
      "url": "https://europe-west1-apex-executive.cloudfunctions.net/mcpHandler"
    }
  }
}
```

## Beispiel-Konversation

> **Sie:** Prüfe meine Website example.de mit Karriaro.
>
> **Claude (ruft `karriaro_audit_site` auf):**
>
> ```
> ════════════════════════════════════════════════════════════
> KARRIARO · ERSTE EINSCHÄTZUNG
> ════════════════════════════════════════════════════════════
>
> Domain:    example.de
> Verdict:   Solide (Score 62/100)
>            Tragfähige Basis, mit feinen Hebeln im Detail.
>
> Branche:   Lokales Unternehmen
>
> TOP-FINDINGS
> 1. 5 Security-Header fehlen: hsts, xFrameOptions, ...
> 2. SEO-Signale unvollständig (3 von 6 Pflicht-Elementen vorhanden)
> 3. KI-Auffindbarkeit dünn (FAQ-Schema, Breadcrumb fehlen teilweise)
>
> Ein Detail-Brief geht tiefer: Web Vitals im Detail,
> BFSG-Audit, branchen-spezifische Empfehlungen.
> Anfrage: https://karriaro-webdesign.de/?prefill=...
>
> — Audit by Karriaro Webdesign-Manufaktur · Köln
>   https://karriaro-webdesign.de
> ```

## Rate-Limit

20 Aufrufe pro Stunde pro IP. Cache-Hits zählen als 0. Für
hochfrequenten Bedarf kontaktieren Sie kontakt@karriaro.de — wir
richten Ihnen einen privaten Endpoint ein.

## Über Karriaro

Karriaro ist eine Kölner Manufaktur für handcodierte
Premium-Websites. Pre-Customer-Stage, Founder-as-Demo.

> „Wenn Ihr Name draufsteht, steht unserer dahinter."

https://karriaro-webdesign.de

## Lizenz

MIT — siehe `LICENSE`.
