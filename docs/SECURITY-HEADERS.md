# Security-Headers fuer karriaro-webdesign.de

Sprint 82 — Sicherheitsheader-Konfiguration. GitHub Pages setzt keine
Custom-Header, deshalb wird die Konfiguration **per Cloudflare-Transform-Rule**
gesetzt (Domain liegt hinter Cloudflare-Proxy).

## Empfohlene Header

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://lighthouse.karriaro.de https://unpkg.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; connect-src 'self' https://*.cloudfunctions.net https://formspree.io https://lighthouse.karriaro.de; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://formspree.io
```

`'unsafe-inline'` fuer `script-src` ist **interim noetig**, weil src/index.html
mehrere inline-`<script>`-Bloecke hat (Audit-Renderer, Lenis-Init,
Reading-Progress). Diese muessen schrittweise zu externen Dateien mit
Nonces extrahiert werden — als Folge-Sprint.

## Setup in Cloudflare

1. Login: https://dash.cloudflare.com → `karriaro-webdesign.de`
2. Rules → Transform Rules → "Modify Response Header"
3. Rule-Name: `karriaro-security-headers`
4. When incoming requests match: `(http.host eq "karriaro-webdesign.de" or http.host eq "www.karriaro-webdesign.de")`
5. Then: Set static — fuege jeden der Header oben einzeln hinzu
6. Deploy

## Verifikation

```bash
curl -sI https://karriaro-webdesign.de/ | grep -iE 'strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy'
```

Oder online: https://securityheaders.com/?q=karriaro-webdesign.de

Zielnote nach Setup: **B oder hoeher** (A waere nur ohne `'unsafe-inline'` machbar).

## Cookies

Aktuell setzt karriaro-webdesign.de keine Cookies. Falls Cookies eingefuehrt
werden (z.B. Calendly-Embed), zusaetzlich:

```
Set-Cookie: ...; Secure; HttpOnly; SameSite=Lax
```
