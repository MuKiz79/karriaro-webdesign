# Mobile-Subdomain Setup — m.karriaro-webdesign.de

Sprint 87 — Eigenstaendige Mobile-Version der gesamten Site auf eigener
Subdomain. Die Mobile-Pages liegen statisch unter `src/m/` und werden
ueber GitHub Pages bereits unter `https://karriaro-webdesign.de/m/*`
ausgeliefert. Diese Doku beschreibt den Sub-Domain-Schritt.

## Architektur

```
karriaro-webdesign.de/             ← Desktop-Site (src/)
karriaro-webdesign.de/m/           ← Mobile-Pages (src/m/) — sofort verfuegbar
m.karriaro-webdesign.de/           ← Cloudflare-Worker → /m/$1 (siehe unten)
```

## Voraussetzungen

- Domain `karriaro-webdesign.de` ist bei Cloudflare angebunden (DNS + Proxy).
- GitHub-Pages-Build laeuft via `.github/workflows/deploy.yml` aus `src/`.

## Setup-Optionen

### Option 1 — Cloudflare Worker (empfohlen)

Saubere URLs ohne 301-Redirect. User sieht `m.karriaro-webdesign.de/preise.html`
in der Adresszeile, der Worker proxied intern auf `karriaro-webdesign.de/m/preise.html`.

**1.1 DNS** in Cloudflare-Dashboard:
- Typ: `CNAME`
- Name: `m`
- Target: `karriaro-webdesign.de`
- Proxy-Status: **Proxied** (orange Cloud)
- TTL: Auto

**1.2 Worker-Code** unter Cloudflare → Workers & Pages → Create Worker:

```javascript
export default {
    async fetch(request) {
        const url = new URL(request.url);
        // m.karriaro-webdesign.de/* → karriaro-webdesign.de/m/$1
        const targetPath = url.pathname === '/' ? '/m/' : `/m${url.pathname}`;
        const target = new URL(targetPath + url.search, 'https://karriaro-webdesign.de');
        const response = await fetch(target.toString(), {
            method: request.method,
            headers: request.headers,
            body: request.body
        });
        return new Response(response.body, response);
    }
};
```

**1.3 Worker-Route** unter Workers → Routes:
- Route: `m.karriaro-webdesign.de/*`
- Worker: (den oben erstellten auswaehlen)

### Option 2 — Cloudflare Page-Rule (einfacher, aber 301)

Schneller eingerichtet, aber User sieht in der Adresszeile die Weiterleitung.

**2.1 DNS** wie oben (Option 1.1).

**2.2 Page-Rule** unter Rules → Page Rules:
- URL: `m.karriaro-webdesign.de/*`
- Setting: **Forwarding URL** (301)
- Target: `https://karriaro-webdesign.de/m/$1`

### Option 3 — Manuell ohne Subdomain

Mobile-Pages sind sofort unter `https://karriaro-webdesign.de/m/*` aufrufbar,
ohne Subdomain-Setup. Beispiel: `karriaro-webdesign.de/m/preise.html`. Wenn
keine eigene Subdomain gewuenscht ist, kann dieser Schritt uebersprungen werden.

## Auto-Redirect (optional)

Falls Desktop-Site bei kleinem Viewport auf Mobile-Subdomain weiterleiten soll,
kann am Ende von `src/index.html` ein Snippet ergaenzt werden:

```html
<script>
(function () {
    if (window.innerWidth <= 640 && !sessionStorage.getItem('keepDesktop')) {
        window.location.replace('https://m.karriaro-webdesign.de' + window.location.pathname);
    }
})();
</script>
```

Plus in `src/m/*.html` ein "Desktop-Version anzeigen"-Link, der
`sessionStorage.setItem('keepDesktop', '1')` setzt und auf Desktop wechselt.

**Standard (Sprint 87): kein Auto-Redirect**. User wechselt manuell. Wenn das
gewuenscht ist, in spaeterem Sprint umbauen.

## Verifikation

```bash
# 1) Mobile-Pages direkt erreichbar (vor Subdomain-Setup)
curl -sI https://karriaro-webdesign.de/m/ | grep -i "content-type\|http/"
curl -sI https://karriaro-webdesign.de/m/preise.html | grep -i "content-type\|http/"

# 2) Nach Subdomain-Setup
curl -sI https://m.karriaro-webdesign.de/ | grep -i "content-type\|http/"
curl -sI https://m.karriaro-webdesign.de/preise.html | grep -i "content-type\|http/"

# 3) Mobile-Layout im Browser
# DevTools → Device Toolbar → iPhone 13 (390 × 844)
# Pruefen: Single-Column, 48 × 48 px Buttons, Mobile-Nav-Drawer
```

## SEO-Hinweise

- Alle Mobile-Pages haben `<link rel="canonical" href="https://karriaro-webdesign.de/{pfad}.html">` auf die Desktop-Version → kein Duplicate-Content-Problem.
- Desktop-Pages koennten `<link rel="alternate" media="only screen and (max-width: 640px)" href="https://m.karriaro-webdesign.de/{pfad}.html">` ergaenzen (Folge-Sprint).
- sitemap.xml: nur Desktop-URLs aufnehmen. Mobile-Pages sind via Canonical-Tag der Desktop-Version zugeordnet.

## Wartung

**Aenderung an Mobile-Pages:**
1. `scripts/build-mobile-pages.mjs` editieren (Page-Definitionen)
2. `node scripts/build-mobile-pages.mjs` ausfuehren
3. Commit + Push
4. Github-Pages-Deploy + Cloudflare-Cache-Purge (falls noetig)

**Aenderung an mobile.css:**
- Direkt in `src/css/mobile.css` editieren. Wirkt fuer alle Mobile-Pages
  (sie laden die Datei via `<link rel="stylesheet">`).

**Aenderung an Nav/Footer (zentral):**
- In `scripts/build-mobile-pages.mjs` die `NAV_HTML` oder `FOOTER_HTML`-
  Konstante editieren, dann Skript neu laufen lassen — propagiert auf alle
  38 Pages.

## Stand 2026-05-16

- 38 Mobile-Pages generiert: index, preise, gruender, audit, website-check,
  warum-handcoded, impressum, datenschutz, agb, barrierefreiheit, blog,
  404, success + 8 Portfolio-Demos + 14 Stadt-Landings + 3 Blog-Artikel.
- Subdomain m.karriaro-webdesign.de **noch nicht eingerichtet** — User-Action
  per dieser Doku.
