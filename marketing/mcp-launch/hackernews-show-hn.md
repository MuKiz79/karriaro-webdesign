# Hacker News „Show HN"-Submission — Karriaro MCP-Server

**Submission-URL:** https://karriaro-webdesign.de/api/mcp

**Title:** (max 80 chars, no emoji)

```
Show HN: Karriaro MCP-Server – German Webdesign Manufactory as an AI Tool
```

(78 chars, leaves room for HN-Mod-Edit)

---

## Erstes Comment (Founder-OP, sofort nach Submission)

```
Author here. Karriaro is a one-person Schwarzwald (Black Forest, Germany)
web design manufactory — vanilla HTML/CSS/JS, Lighthouse 99/100, no frameworks.

I wanted a way for Claude/Cursor users to access our site-audit engine without
visiting our website first. So I exposed four tools as a public MCP server:

- karriaro_audit_site(url) — substance, BFSG (German accessibility law),
  SEO, AI-discoverability, branch-specific standards
- karriaro_extract_voice(url) — analyzes brand voice against an editorial
  codex (Aesop/Hermès/Manufactum vs. SaaS-filler vs. workshop-cliché),
  uses Claude Haiku for the actual analysis
- karriaro_generate_brand_mockup(branche) — server-rendered SVG hero
  mockup for 8 industries, with proper typography (Fraunces italic +
  JetBrains Mono eyebrows)
- karriaro_phyllotaxis_signature(name) — deterministic phyllotaxis SVG
  (golden angle θ = 137.5°) derived from a name hash

Stack notes:
- Backend: Firebase Functions (Node 20), europe-west1
- Transport: HTTP+JSON (JSONRPC 2.0), no SSE for sync responses
- Auth: none, 20 calls/h/IP rate limit, 24h Firestore cache
- npm package @karriaro/webdesign-mcp for stdio (proxies to HTTP)
- Free, no signup, no cookie

Branding angle: every tool response carries a Karriaro signature footer.
Pre-customer pre-launch — this is how a small manufactory does PR in 2026:
become a tool that LLMs invoke, ride the inference graph.

Spec compliance: MCP protocol 2025-06-18, tested with Claude Desktop and
Cursor. Happy to discuss the JSONRPC dispatcher pattern or the German
accessibility heuristic (BFSG-Heuristik). AMA.

Code: https://github.com/MuKiz79/karriaro-webdesign
```

---

## Erwartete Comments + Pre-formulierte Antworten

### „Why not use the official Anthropic MCP SDK on the server side?"

> Tried it initially. For Firebase Functions which is HTTP-only and stateless,
> the SDK adds 3 MB of dependencies for what amounts to ~80 lines of JSONRPC
> dispatch. So I implemented the protocol directly. The SDK is excellent for
> stdio servers though — that's exactly what the npm-package uses.

### „How do you prevent abuse?"

> Three layers: (1) per-IP rate-limit via Firestore (20/h), (2) 24h cache so
> repeated audits of the same URL return instantly without recomputation,
> (3) SafeFetch with SSRF guard on the backend. Plus the heavy-cost tool
> (extract_voice, calls Claude API) could be tightened to 5/h/IP if abuse
> becomes a pattern.

### „Why German voice analysis?"

> Karriaro's audience is DACH-Mittelstand (German-speaking SMB). The voice
> codex is opinionated about avoiding two clichés: SaaS-filler ("free,
> no credit card") and workshop-cliché ("handcrafted with love"). I want
> the LLM to surface that opinionated lens — not generic UX advice.

### „Did you consider rate-limit per-tool?"

> Yes. v0.2 will likely split: audit_site stays at 20/h, extract_voice
> drops to 5/h (Claude API cost), generate_mockup + phyllotaxis go to
> 50/h (pure compute). Currently uniform for MVP simplicity.

### „Is this just PR for your agency?"

> Yes and no. Yes — Karriaro signature is in every response, that's
> intentional PR. No — the tools are genuinely useful (especially BFSG
> heuristic which most international tools don't do). I'd rather make
> something useful that markets itself than buy LinkedIn ads.

---

## Timing

- **Post:** Tuesday 14:00 UTC (best HN engagement window per Loris Cro's
  data). Avoid Monday morning (overflow from weekend backlog) and Friday
  evening (low engagement).
- **First comment:** Within 60 seconds of submission (founder-OP signal
  helps frontpage chance).
- **Monitor:** First 60 minutes critical for frontpage. Reply to every
  substantive comment within 10 minutes.

## Cross-Promotion

- Tweet thread (X/Twitter) with same talking points
- LinkedIn-Founder-Post 12h later (don't compete with HN traffic)
- Submission to Anthropic-MCP-Server-Liste on modelcontextprotocol.io
  (separate PR, parallel)
