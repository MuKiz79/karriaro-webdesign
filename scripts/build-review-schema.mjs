/**
 * Sprint 252 — Review-/AggregateRating-JSON-LD aus src/data/reviews.json.
 *
 * Stufe 1 (jetzt, risikoarm): einzelne echte `Review`-Objekte, in die kanonische
 *   Organization-Entität (@id #organization) eingebettet → Rich-Result-Kandidat
 *   ohne Manual-Action-Risiko.
 * Stufe 2 (automatisch ab reviews.length >= aggregateThreshold): zusätzlich
 *   `aggregateRating`. ratingValue/reviewCount MÜSSEN exakt der GBP-Zahl entsprechen.
 *
 * Idempotent + aktualisierbar via Marker-Block (replace-between). Re-Run nach
 * jeder reviews.json-Änderung. Schreibt in TARGETS.
 *
 * Run: node scripts/build-review-schema.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const ORG_ID = 'https://karriaro-webdesign.de/#organization';
const START = '<!--KR_REVIEWS_START-->';
const END = '<!--KR_REVIEWS_END-->';

const TARGETS = ['index.html', 'webseite-erstellen-lassen.html'];

const data = JSON.parse(readFileSync(join(SRC, 'data', 'reviews.json'), 'utf8'));
const reviews = (data.reviews || []).filter(r => r && r.author && r.body);
const threshold = data.aggregateThreshold || 5;

function avg(rs) { return rs.reduce((s, r) => s + (Number(r.rating) || 0), 0) / rs.length; }

function buildNode() {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': ORG_ID,
    name: 'Karriaro Webdesign',
    review: reviews.map(r => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: String(r.rating), bestRating: '5' },
      author: { '@type': 'Person', name: r.author },
      reviewBody: r.body,
      ...(r.publisher ? { publisher: { '@type': 'Organization', name: r.publisher } } : {})
    }))
  };
  // Stufe 2: aggregateRating erst ab Schwelle (echte, GBP-deckungsgleiche Basis).
  if (reviews.length >= threshold) {
    const mean = avg(reviews);
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: (Math.round(mean * 10) / 10).toFixed(1),
      reviewCount: String(reviews.length),
      bestRating: '5',
      worstRating: '1'
    };
  }
  return node;
}

function block() {
  const json = JSON.stringify(buildNode(), null, 2)
    .split('\n').map(l => '    ' + l).join('\n');
  return START + '\n    <script type="application/ld+json">\n' + json + '\n    </script>\n    ' + END;
}

let done = 0;
const stage = reviews.length >= threshold ? 'Stufe 2 (inkl. aggregateRating)' : 'Stufe 1 (nur Review)';
for (const name of TARGETS) {
  const file = join(SRC, name);
  let html;
  try { html = readFileSync(file, 'utf8'); } catch { console.warn('  ⚠ fehlt:', name); continue; }
  const blk = block();
  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(START + '[\\s\\S]*?' + END), blk);
  } else {
    const i = html.lastIndexOf('</head>');
    if (i === -1) { console.warn('  ⚠ kein </head>:', name); continue; }
    html = html.slice(0, i) + blk + '\n' + html.slice(i);
  }
  writeFileSync(file, html);
  done++;
  console.log('  + ' + name);
}
console.log('\n' + done + ' Seiten · ' + reviews.length + ' Review(s) · ' + stage + ' (Schwelle ' + threshold + ').');
