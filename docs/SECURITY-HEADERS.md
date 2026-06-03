# Security-Headers für karriaro-webdesign.de

Die Domain liegt auf **Firebase Hosting** (Projekt `apex-executive`, Target
`karriaro-webdesign`). Security- und Cache-Header werden direkt im
`headers`-Block von **`firebase.json`** gesetzt — kein Cloudflare, keine
GitHub-Pages-Workarounds. Änderungen gehen mit dem nächsten Push live
(Auto-Deploy via `.github/workflows/deploy.yml`).

## Tatsächlich gesetzte Header (Quelle: `firebase.json`, `source: "**"`)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options:     nosniff
X-Frame-Options:            SAMEORIGIN
Referrer-Policy:            strict-origin-when-cross-origin
Permissions-Policy:         camera=(), microphone=(), geolocation=(), interest-cohort=()
```

Zusätzlich setzt `firebase.json` Cache-Control je Dateityp: Bilder/Fonts
`max-age=31536000, immutable`, CSS/JS `max-age=2592000`, HTML
`max-age=300, must-revalidate`.

## Content-Security-Policy — aktuell NICHT gesetzt

Es ist **kein `Content-Security-Policy`-Header konfiguriert**. Grund: die
Seiten (v.a. `src/index.html`) enthalten mehrere Inline-`<script>`- und
`<style>`-Blöcke (Audit-Renderer, Lenis-Init, Reading-Progress,
Critical-CSS). Eine CSP ohne `'unsafe-inline'` würde diese brechen; eine
CSP mit `'unsafe-inline'` bringt kaum Schutz.

### Künftige Härtung (offenes To-do, eigener Sprint)
1. Inline-Scripts/Styles schrittweise in externe Dateien auslagern bzw. mit
   Nonces/Hashes versehen.
2. `X-Frame-Options` von `SAMEORIGIN` auf `DENY` ziehen (die Seite wird
   nirgends absichtlich same-origin geframed — vorher Demo-Embed-iframes auf
   `/portfolio/*-embed*.html` prüfen, die intern eingebettet werden).
3. Dann eine restriktive CSP nachrüsten (Richtwert):
   `default-src 'self'; script-src 'self' <nonce>; connect-src 'self'
   https://*.cloudfunctions.net https://formspree.io https://lighthouse.karriaro.de;
   frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://formspree.io`.

## Verifikation

```bash
curl -sI https://karriaro-webdesign.de/ | grep -iE 'strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy'
```

Oder online: https://securityheaders.com/?q=karriaro-webdesign.de — Self-Audit
(Section № 11) verlinkt diesen Check öffentlich als Verifizierbarkeits-Beleg.

## Cookies

Aktuell setzt karriaro-webdesign.de keine Cookies (cookiefreies First-Party-
Tracking via Lighthouse `t.js`). Falls Cookies eingeführt werden (z. B.
Calendly-Embed), zusätzlich: `Set-Cookie: …; Secure; HttpOnly; SameSite=Lax`.
