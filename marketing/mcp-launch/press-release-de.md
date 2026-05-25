# Pressemeldung — Karriaro MCP-Server Launch

**Empfänger:**
- t3n (redaktion@t3n.de)
- Heise Developer (redaktion@heise.de mit Subject „MCP-Server")
- Computerwoche
- The Decoder (redaktion@the-decoder.de — KI-spezifisch)
- Golem.de (redaktion@golem.de)

**Subject-Line:**
```
Pressemeldung: Erste DACH-Webdesign-Manufaktur als Public MCP-Server für KI-Agenten
```

---

## Pressemeldung (für Copy-Paste)

**Datum:** 25. Mai 2026
**Embargo:** keine — sofort veröffentlichbar

---

### Schwarzwald-Manufaktur wird zum KI-Werkzeug: Karriaro startet Public MCP-Server

**Schiltach im Schwarzwald, 25. Mai 2026.** Die Karriaro
Webdesign-Manufaktur stellt ab heute ihre Audit- und Analyse-Engine als
öffentlichen MCP-Server (Model Context Protocol) bereit. KI-Agenten wie
Anthropics Claude Desktop, Cursor und OpenAI Codex können die vier
Werkzeuge direkt aufrufen — ohne Anmeldung, ohne Cookie, ohne Kosten.

Das Model Context Protocol, im November 2024 von Anthropic vorgestellt,
ermöglicht KI-Agenten den standardisierten Zugriff auf externe Tools und
Datenquellen. Karriaro ist die nach eigenen Angaben erste
Webdesign-Manufaktur im DACH-Raum mit einem öffentlich verfügbaren
MCP-Server.

**Die vier Werkzeuge:**

1. **`karriaro_audit_site`** — prüft eine Website auf Substanz,
   BFSG-Konformität (Barrierefreiheitsstärkungsgesetz), SEO und
   KI-Auffindbarkeit. Liefert qualitatives Verdict und Top-Findings im
   Editorial-Stil.

2. **`karriaro_extract_voice`** — analysiert den Brand-Voice einer
   Website nach dem Karriaro-Codex (Editorial-Premium à la Aesop/Hermès
   vs. SaaS-Filler vs. Werkstatt-Klischee). Nutzt Anthropic Claude im
   Hintergrund.

3. **`karriaro_generate_brand_mockup`** — generiert eine
   Hero-Mockup-SVG im Karriaro-Editorial-Stil für acht Branchen
   (Friseur, Praxis, Anwalt, Coaching, Immobilien, Handwerk, Gastro,
   Dachdecker).

4. **`karriaro_phyllotaxis_signature`** — erzeugt ein deterministisches
   Phyllotaxis-Siegel basierend auf dem Goldenen Winkel (137,5°) für
   einen gegebenen Namen.

**„Eine Manufaktur ist jetzt ein Werkzeug"**

„Wenn jemand seine Website prüfen lässt, sollte er nicht erst auf unsere
Website kommen", erklärt Muammer Kızılaslan, Gründer von Karriaro
Webdesign. „Wir kommen zu ihm — über sein KI-Werkzeug, in seinem
Workflow. Jede Antwort trägt unsere Signatur. Das ist unser Marketing
im Jahr 2026 — Pull statt Push."

**Technischer Hintergrund**

Der MCP-Server läuft auf Firebase Functions in Frankfurt (europe-west1),
kommuniziert über JSONRPC 2.0 mit HTTP-Transport und respektiert das
MCP-Protokoll der Version 2025-06-18. Ein Rate-Limit von 20 Aufrufen pro
Stunde pro IP-Adresse schützt vor Missbrauch; Cache-Hits zählen nicht.

Für lokale Installation existiert ein npm-Package (`@karriaro/webdesign-mcp`)
das stdio-Transport bereitstellt. Der vollständige Quellcode der
MCP-Komponente ist Open Source unter MIT-Lizenz.

**Über Karriaro Webdesign**

Karriaro ist eine 2026 gegründete Schwarzwald-Manufaktur für
handcodierte Premium-Websites. Zielgruppe ist der lokale Mittelstand im
deutschsprachigen Raum (Handwerk, Beauty, Immobilien, Gastronomie,
Medizin, Recht). Maximal fünf Pilot-Plätze pro Quartal.

Gründer Muammer Kızılaslan war zuvor 15 Jahre in Enterprise-IT tätig.
Die Manufaktur arbeitet nach dem Prinzip „Wenn Ihr Name draufsteht,
steht unserer dahinter."

**Links**

- MCP-Server-Dokumentation: https://karriaro-webdesign.de/api/mcp.html
- Karriaro Webdesign: https://karriaro-webdesign.de
- Gründer-Profil: https://karriaro-webdesign.de/gruender.html
- Quellcode: https://github.com/MuKiz79/karriaro-webdesign
- npm: https://www.npmjs.com/package/@karriaro/webdesign-mcp

**Pressekontakt**

Muammer Kızılaslan
Karriaro Webdesign-Manufaktur
kontakt@karriaro.de

---

## Hintergrund für Journalisten (off-record-Erläuterungen)

### Was ist MCP eigentlich?

Model Context Protocol (MCP) ist ein im November 2024 von Anthropic
publizierter offener Standard für KI-Agent-Tool-Integration. Vergleichbar
mit „USB für KI-Agenten" — statt jeder Tool-Integration einzeln zu
programmieren, sprechen Agent und Tool ein gemeinsames Protokoll.

Anthropic, Block, Replit, Sourcegraph und viele andere unterstützen MCP
seit Anfang 2025. Der Standard hat sich seitdem als Industrie-Default
etabliert.

### Was ist neu am Karriaro-Ansatz?

Bisherige MCP-Server sind überwiegend technische Tools (Datenbank-
Adapter, GitHub-Integration, File-System-Access). Karriaro ist nach
unserer Recherche der erste Anbieter aus der Webdesign-Branche im
DACH-Raum, der seine Service-Domain als MCP-Tool exponiert.

Die Geschäftslogik dahinter: jeder Aufruf trägt eine Brand-Signatur. Der
Endkunde, der via Claude sein Site-Audit anfordert, sieht „Audit by
Karriaro" — Marketing durch Tool-Nutzung statt durch klassische
Werbeschaltung.

### Wie groß ist Karriaro?

Ein-Personen-Manufaktur. Pre-Launch (keine zahlenden Kunden). Founder
Muammer Kızılaslan ist hauptberuflich VP IT bei einem internationalen
Konzern; Karriaro ist ein Pre-Customer-Aufbau-Projekt mit klarer
Manufaktur-Aesthetik (Aesop/Hermès/Manufactum-Referenzen).

### Story-Frame-Vorschläge für die Redaktion

1. „Erste DACH-Webdesign-Manufaktur als MCP-Server" — Trend-Story
   (Webdesign trifft KI-Standards)
2. „Pull statt Push — wie eine Schwarzwald-Manufaktur über
   Claude/Cursor Kunden gewinnt" — Marketing-Strategie-Story
3. „Brand-Voice-Analyse via Claude — wie Karriaro Aesop/Hermès vs.
   SaaS-Filler unterscheidet" — KI/Sprache-Story für The Decoder
4. „Open-Source-Webdesign-Tools im DACH-Raum 2026" — Developer-Story
   (Heise Developer)
