/**
 * Sprint 237/238 — Injiziert/aktualisiert pro Seite einen kanonischen JSON-LD-@graph:
 *   1) Organization (mit sameAs)  → GEO-Kategorie C: Entitäts-Klarheit
 *   2) WebPage (mit dateModified)  → GEO-Kategorie D: Frische
 * vor </head>. Idempotent: ersetzt einen vorhandenen Marker-Block, sonst injiziert er.
 *
 * dateModified = DATE-Konstante (echtes Edit-Datum dieses Sprints; KEINE wiederholte
 * Datums-Bumperei ohne Inhaltsänderung — das wäre Fake-Freshness, siehe KB-Domäne).
 * Künftig pro echtem Inhalts-Edit der jeweiligen Seite bumpen.
 *
 * Run: node scripts/inject-org-schema.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const BASE = 'https://karriaro-webdesign.de';
const DATE = '2026-06-08';
const MARKER_RE = /[ \t]*<!-- Kanonische Organization[\s\S]*?<\/script>\n?/;

// index.html trägt eigene reiche WebDesignAgency mit @id #organization → NICHT injizieren
// (sonst doppelte @id). Utility-Seiten ausgeklammert.
const SKIP = new Set(['index.html', '404.html', 'success.html']);

function pageUrl(rel) {
  const path = rel.replace(/\.html$/, '');
  return BASE + '/' + path;
}

function block(rel) {
  const url = pageUrl(rel);
  return `    <!-- Kanonische Organization-Entität + WebPage-Frische (site-weit; GEO). Marker: #organization -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": "${BASE}/#organization",
          "name": "Karriaro Webdesign",
          "url": "${BASE}",
          "logo": "${BASE}/images/favicon.svg",
          "email": "kontakt@karriaro.de",
          "address": { "@type": "PostalAddress", "streetAddress": "Spitalstr. 7", "addressLocality": "Schiltach", "postalCode": "77761", "addressCountry": "DE" },
          "founder": { "@type": "Person", "name": "Muammer Kızılaslan", "url": "${BASE}/gruender", "sameAs": ["https://muammerkizilaslan.com", "https://www.linkedin.com/in/muammerkizilaslan"] },
          "sameAs": ["https://muammerkizilaslan.com", "https://www.linkedin.com/in/muammerkizilaslan"]
        },
        {
          "@type": "WebPage",
          "@id": "${url}#webpage",
          "url": "${url}",
          "isPartOf": { "@id": "${BASE}/#organization" },
          "publisher": { "@id": "${BASE}/#organization" },
          "dateModified": "${DATE}"
        }
      ]
    }
    </script>
`;
}

function targets() {
  const out = [];
  for (const f of readdirSync(SRC)) {
    if (f.endsWith('.html') && !SKIP.has(f)) out.push(f);
  }
  for (const sub of ['blog', 'portfolio']) {
    try {
      for (const f of readdirSync(join(SRC, sub))) {
        if (f.endsWith('.html') && !/-embed/.test(f)) out.push(sub + '/' + f);
      }
    } catch (_) { /* kein Ordner */ }
  }
  return out;
}

let updated = 0, injected = 0;
for (const rel of targets()) {
  const file = join(SRC, rel);
  let html = readFileSync(file, 'utf8');
  const b = block(rel);
  if (MARKER_RE.test(html)) {
    const next = html.replace(MARKER_RE, b);
    if (next !== html) { writeFileSync(file, next); updated++; console.log('  ~ ' + rel); }
  } else {
    const idx = html.lastIndexOf('</head>');
    if (idx === -1) { console.warn('  ⚠ kein </head>:', rel); continue; }
    html = html.slice(0, idx) + b + html.slice(idx);
    writeFileSync(file, html);
    injected++;
    console.log('  + ' + rel);
  }
}
console.log(`\n${injected} neu injiziert, ${updated} aktualisiert (Org-Entität + WebPage/dateModified ${DATE}).`);
