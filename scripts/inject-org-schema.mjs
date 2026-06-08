/**
 * Sprint 237 — Injiziert die kanonische Organization-Entität (mit sameAs) site-weit
 * vor </head>. Schließt den größten GEO-Self-Audit-Hebel: Entitäts-Klarheit war nur
 * auf der Home gesetzt (20/20), alle Unterseiten 0/20 bzw. 13/20.
 *
 * Grundlage: ~/Projects/knowledge-base/playbooks/geo-audit-score.md (Kategorie C).
 * Idempotent: überspringt Dateien, die den @id-Marker schon tragen.
 *
 * Run: node scripts/inject-org-schema.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const MARKER = 'karriaro-webdesign.de/#organization';

const SNIPPET = `    <!-- Kanonische Organization-Entität (site-weit; GEO: Entitäts-Klarheit). Marker: #organization -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://karriaro-webdesign.de/#organization",
      "name": "Karriaro Webdesign",
      "url": "https://karriaro-webdesign.de",
      "logo": "https://karriaro-webdesign.de/images/favicon.svg",
      "email": "kontakt@karriaro.de",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Spitalstr. 7",
        "addressLocality": "Schiltach",
        "postalCode": "77761",
        "addressCountry": "DE"
      },
      "founder": {
        "@type": "Person",
        "name": "Muammer Kızılaslan",
        "url": "https://karriaro-webdesign.de/gruender",
        "sameAs": ["https://muammerkizilaslan.com", "https://www.linkedin.com/in/muammerkizilaslan"]
      },
      "sameAs": ["https://muammerkizilaslan.com", "https://www.linkedin.com/in/muammerkizilaslan"]
    }
    </script>
`;

// Utility-/Sonderseiten ausklammern (index hat eigene reiche WebDesignAgency + bekommt @id separat).
const SKIP = new Set(['index.html', '404.html', 'success.html']);

function targets() {
  const out = [];
  for (const f of readdirSync(SRC)) {
    if (f.endsWith('.html') && !SKIP.has(f)) out.push(join(SRC, f));
  }
  try {
    for (const f of readdirSync(join(SRC, 'blog'))) {
      if (f.endsWith('.html')) out.push(join(SRC, 'blog', f));
    }
  } catch (_) { /* kein blog-Ordner */ }
  return out;
}

let injected = 0, skipped = 0;
for (const file of targets()) {
  let html = readFileSync(file, 'utf8');
  if (html.includes(MARKER)) { skipped++; continue; }
  const idx = html.lastIndexOf('</head>');
  if (idx === -1) { console.warn('  ⚠ kein </head>:', file); continue; }
  html = html.slice(0, idx) + SNIPPET + html.slice(idx);
  writeFileSync(file, html);
  injected++;
  console.log('  + ' + file.slice(file.indexOf('/src/') + 5));
}
console.log(`\n${injected} Seiten injiziert, ${skipped} übersprungen (Marker vorhanden).`);
