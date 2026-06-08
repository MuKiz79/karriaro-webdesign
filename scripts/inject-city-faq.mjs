/**
 * Sprint 238 — Lokale FAQ (sichtbar + FAQPage-Schema) für die 15 Stadt-Landing-Seiten.
 * Schließt den GEO-Struktur-Hebel (Kategorie B / Q&A). Echte, city-interpolierte Fragen
 * (kein leeres Schema → Google-Richtlinien-konform). Idempotent via Marker.
 *
 * Run: node scripts/inject-city-faq.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const MARKER = 'data-city-faq';

const CITY = {
  berlin: 'Berlin', bremen: 'Bremen', dortmund: 'Dortmund', dresden: 'Dresden',
  duesseldorf: 'Düsseldorf', essen: 'Essen', frankfurt: 'Frankfurt', hamburg: 'Hamburg',
  hannover: 'Hannover', koeln: 'Köln', leipzig: 'Leipzig', muenchen: 'München',
  nuernberg: 'Nürnberg', stuttgart: 'Stuttgart'
};

// Echte, lokal relevante Fragen. Antworten markenkonform + rechtssicher
// (Lieferzeit „je nach Umfang", remote DACH, kein 24/7, abbrechen vor Zahlung).
function qa(stadt) {
  return [
    ['Was kostet eine Website für ein Unternehmen in ' + stadt + '?',
     'Karriaro arbeitet mit festen Paketen von 1.290 € (Essential) bis 3.990 € (Premium+) — einmalig, ohne Abo. Der Preis richtet sich nach Umfang und Ihrer Zuarbeit, nicht nach Ihrem Standort.'],
    ['Wie lange dauert ein Webdesign-Projekt für einen Betrieb aus ' + stadt + '?',
     'Je nach Umfang wenige Tage bis einige Wochen. Sie sehen früh einen Entwurf und können jederzeit abbrechen, bevor eine Zahlung fällig wird.'],
    ['Arbeiten Sie auch remote mit Kunden aus ' + stadt + '?',
     'Ja. Karriaro betreut Betriebe in ganz DACH remote — persönlich begleitet, mit klaren Reaktionszeiten. Ein Vor-Ort-Termin in ' + stadt + ' ist nicht nötig.']
  ];
}

function faqSchema(stadt) {
  const items = qa(stadt).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }));
  return '    <script type="application/ld+json" ' + MARKER + '>\n    ' +
    JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items }) +
    '\n    </script>\n';
}

function faqSection(stadt) {
  const rows = qa(stadt).map(([q, a]) =>
    '        <h3 style="font-size:18px;font-weight:600;margin:24px 0 6px;">' + q + '</h3>\n' +
    '        <p style="color:#424245;margin:0;">' + a + '</p>'
  ).join('\n');
  return '    <section class="fade-in" ' + MARKER + ' aria-labelledby="city-faq-h" style="padding:64px 24px;">\n' +
    '      <div style="max-width:760px;margin:0 auto;">\n' +
    '        <h2 id="city-faq-h" style="font-size:26px;font-weight:600;margin-bottom:8px;">Häufige Fragen aus ' + stadt + '</h2>\n' +
    rows + '\n' +
    '      </div>\n    </section>\n';
}

let done = 0, skip = 0;
for (const f of readdirSync(SRC)) {
  const m = f.match(/^webdesign-([a-z]+)\.html$/);
  if (!m || !CITY[m[1]]) continue;
  const stadt = CITY[m[1]];
  const file = join(SRC, f);
  let html = readFileSync(file, 'utf8');
  if (html.includes(MARKER)) { skip++; continue; }
  const hIdx = html.lastIndexOf('</head>');
  const mIdx = html.lastIndexOf('</main>');
  if (hIdx === -1 || mIdx === -1) { console.warn('  ⚠ kein </head>/</main>:', f); continue; }
  // Erst Body (höherer Index), dann Head — sonst verschiebt sich mIdx.
  html = html.slice(0, mIdx) + faqSection(stadt) + html.slice(mIdx);
  const hIdx2 = html.lastIndexOf('</head>');
  html = html.slice(0, hIdx2) + faqSchema(stadt) + html.slice(hIdx2);
  writeFileSync(file, html);
  done++;
  console.log('  + ' + f + '  (' + stadt + ')');
}
console.log('\n' + done + ' Stadt-Seiten mit lokaler FAQ, ' + skip + ' übersprungen.');
