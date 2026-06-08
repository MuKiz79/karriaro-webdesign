/**
 * Sprint 238 — Hand-gefertigte FAQ (sichtbar + FAQPage-Schema) für zwei Einzelseiten
 * mit dünner Struktur: /ki-sichtbarkeit (Vorzeige-Seite) und /werkschau.
 * Echte, on-topic Q&A (kein leeres Schema). Farb-neutral → erbt das jeweilige Theme.
 * Idempotent via Marker. Run: node scripts/inject-page-faq.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const MARKER = 'data-page-faq';

const PAGES = {
  'ki-sichtbarkeit': [
    ['Was bedeutet KI-Sichtbarkeit?',
     'KI-Sichtbarkeit beschreibt, ob und wie Antwortmaschinen wie ChatGPT, Perplexity und Googles AI-Overviews Ihr Unternehmen kennen, korrekt beschreiben und als Quelle nennen. 2026 beginnt die Suche zunehmend dort — nicht mehr nur in der klassischen Trefferliste.'],
    ['Wie beeinflusse ich, wie ChatGPT mein Unternehmen darstellt?',
     'Drei Hebel zählen am meisten: eine für KI-Crawler lesbare Website (server-gerendert, nicht nur per JavaScript), eine eindeutige Entität (konsistenter Name, Schema, verknüpfte Profile) und Erwähnungen über viele vertrauenswürdige Quellen hinweg.'],
    ['Hilft eine llms.txt-Datei, damit KI mich besser findet?',
     'Nein. Kein großes KI-System wertet llms.txt derzeit aus — Google stellt sie offen mit dem längst wirkungslosen Keywords-Meta-Tag auf eine Stufe. Wir setzen stattdessen auf die nachweislich wirksamen Signale.'],
    ['Was ist der wichtigste technische Hebel?',
     'Dass KI-Crawler Ihre Inhalte überhaupt sehen. Sie führen kein JavaScript aus — eine server-gerenderte, sauber strukturierte Seite ist die Grundvoraussetzung. Genau so baut Karriaro: handcodiert, ausliefernd statt nachladend.']
  ],
  'werkschau': [
    ['Was ist die Karriaro-Werkschau?',
     'Eine kuratierte Schau handcodierter Website-Arbeiten — vom ersten Entwurf bis zum fertigen Unikat. Sie zeigt, wie Karriaro Gestaltung, Technik und eingebaute Werkzeuge zusammenbringt.'],
    ['Sind die gezeigten Arbeiten echte Kundenprojekte?',
     'Die Werkschau mischt echte Projekte mit Studien und Demonstratoren. Demo-Beispiele sind als solche gekennzeichnet und stehen für eine Branche, nicht für reale Auftraggeber.'],
    ['Kann mein Betrieb so eine Website bekommen?',
     'Ja. Jede Karriaro-Site wird einzeln handcodiert — vom Paket Essential (1.290 €) bis Premium+. Den Umfang stimmen wir vorab ab, Sie können vor jeder Zahlung abbrechen.']
  ]
};

function schema(qa) {
  const items = qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }));
  return '    <script type="application/ld+json" ' + MARKER + '>\n    ' +
    JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items }) +
    '\n    </script>\n';
}

function section(qa) {
  const rows = qa.map(([q, a]) =>
    '        <h3 style="font-size:1.1rem;font-weight:600;margin:1.4rem 0 .35rem;">' + q + '</h3>\n' +
    '        <p style="margin:0;opacity:.85;">' + a + '</p>'
  ).join('\n');
  return '    <section class="fade-in" ' + MARKER + ' aria-labelledby="page-faq-h" style="max-width:640px;margin:3.5rem auto 0;padding:2rem 1.5rem 0;border-top:1px solid currentColor;border-image:linear-gradient(to right,currentColor,transparent) 1;">\n' +
    '      <h2 id="page-faq-h" style="font-size:1.5rem;font-weight:600;margin:0 0 .25rem;">Häufige Fragen</h2>\n' +
    rows + '\n' +
    '    </section>\n';
}

let done = 0, skip = 0;
for (const [name, qa] of Object.entries(PAGES)) {
  const file = join(SRC, name + '.html');
  let html = readFileSync(file, 'utf8');
  if (html.includes(MARKER)) { skip++; continue; }
  const mIdx = html.lastIndexOf('</main>');
  const hIdx = html.lastIndexOf('</head>');
  if (mIdx === -1 || hIdx === -1) { console.warn('  ⚠ kein </main>/</head>:', name); continue; }
  html = html.slice(0, mIdx) + section(qa) + html.slice(mIdx);
  const hIdx2 = html.lastIndexOf('</head>');
  html = html.slice(0, hIdx2) + schema(qa) + html.slice(hIdx2);
  writeFileSync(file, html);
  done++;
  console.log('  + ' + name + '.html  (' + qa.length + ' Q&A)');
}
console.log('\n' + done + ' Seiten mit FAQ, ' + skip + ' übersprungen.');
