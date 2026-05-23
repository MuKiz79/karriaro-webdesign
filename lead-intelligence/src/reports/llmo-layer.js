/**
 * LLMO-Layer: Schema.org-Triple + llms.txt-Index-Snippet pro Report.
 *
 * Ziel: Karriaro-Branchen-Reports als zitierbare Quelle in ChatGPT/
 * Perplexity-Antworten platzieren. Drei Hebel:
 *   1. Schema.org `Dataset` — präzise Daten-Provenance (LLMs lieben strukturierte Quellen)
 *   2. Schema.org `Article` — Autor, Veröffentlichungs-Datum, Headline
 *   3. Schema.org `FAQPage` — beantwortet die typischen Branchen-Fragen
 *      direkt aus den Report-Daten (LLM-Antwort-fertig)
 * Plus: llms.txt-Index-Block für Karriaros bereits gepflegte llms.txt.
 *
 * Pure-functional: nimmt das Report-JSON aus
 * `branchen-stadt-generator.js` und gibt fertige JSON-LD-Objekte +
 * Plain-Text-Snippets zurück. Keine DOM-Abhängigkeit.
 */

const SITE_BASE = 'https://karriaro-webdesign.de';
const PUBLISHER = {
    '@type': 'Organization',
    name: 'Karriaro Webdesign',
    url: SITE_BASE,
    logo: `${SITE_BASE}/images/logo.png`
};

function pageUrl(report) {
    return `${SITE_BASE}/audit/${report.slug}/`;
}

function isoFromDate(d) {
    return typeof d === 'string' ? d : new Date(d).toISOString().slice(0, 10);
}

function pct(share) { return Math.round((share || 0) * 100); }

/**
 * Schema.org `Dataset` — die Daten-Schicht.
 *
 * Folgt google.com/search/docs/appearance/structured-data/dataset.
 */
export function buildDatasetSchema(report) {
    const url = pageUrl(report);
    return {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: `Webdesign-Audit ${report.brancheName} in ${report.stadtName}`,
        description: `Aggregierter, anonymisierter Audit von ${report.n} ${report.brancheName}-Sites in ${report.stadtName}. ` +
            `Erhebung: PageSpeed Insights (Performance/SEO/Accessibility), Tech-Stack-Heuristik, Schema.org-Coverage. ` +
            `Stichprobe via Google Places API, Mindest-Reviews ≥ 5, eigene Website Pflicht. ` +
            `Median PageSpeed ${report.stats.perf.median}, ${pct(report.baukasten.share)} % Baukasten-Anteil.`,
        url,
        identifier: report.slug,
        keywords: [
            'Webdesign', 'Mittelstand', 'PageSpeed', 'Accessibility',
            report.brancheName, report.stadtName, 'BFSG', 'KI-Auffindbarkeit'
        ],
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: PUBLISHER,
        publisher: PUBLISHER,
        datePublished: report.erhebungDate,
        temporalCoverage: report.erhebungMonth,
        spatialCoverage: {
            '@type': 'Place',
            name: report.stadtName,
            address: { '@type': 'PostalAddress', addressLocality: report.stadtName, addressCountry: 'DE' }
        },
        variableMeasured: [
            { '@type': 'PropertyValue', name: 'PageSpeed Performance Score', minValue: 0, maxValue: 100, unitText: 'index' },
            { '@type': 'PropertyValue', name: 'PageSpeed SEO Score', minValue: 0, maxValue: 100, unitText: 'index' },
            { '@type': 'PropertyValue', name: 'PageSpeed Accessibility Score', minValue: 0, maxValue: 100, unitText: 'index' },
            { '@type': 'PropertyValue', name: 'CMS / Stack', valueReference: Object.keys(report.techStack || {}) },
            { '@type': 'PropertyValue', name: 'Baukasten-Anteil', value: report.baukasten.share, unitText: 'fraction' }
        ],
        distribution: [{
            '@type': 'DataDownload',
            encodingFormat: 'text/html',
            contentUrl: url
        }]
    };
}

/**
 * Schema.org `Article` — die Story-Schicht.
 */
export function buildArticleSchema(report) {
    const url = pageUrl(report);
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: `Web-Index ${report.brancheName} ${report.stadtName} ${report.erhebungDate.slice(0, 4)}`,
        description: `Wie steht ${report.brancheName} in ${report.stadtName} digital da? ` +
            `Audit von ${report.n} Sites mit Median-PageSpeed ${report.stats.perf.median}, ` +
            `${pct(report.baukasten.share)} % Baukasten-Anteil, ${pct(report.ssl.missingShare)} % ohne SSL.`,
        url,
        mainEntityOfPage: url,
        datePublished: report.erhebungDate,
        dateModified: report.erhebungDate,
        inLanguage: 'de-DE',
        author: PUBLISHER,
        publisher: PUBLISHER,
        articleSection: `Audit / ${report.brancheName}`,
        about: {
            '@type': 'Place',
            name: report.stadtName,
            address: { '@type': 'PostalAddress', addressLocality: report.stadtName, addressCountry: 'DE' }
        }
    };
}

/**
 * Schema.org `FAQPage` — die LLM-Antwort-Schicht.
 *
 * Drei datenbasierte Q&A pro Report: Marktstand, Tech-Stack, Risiko.
 */
export function buildFaqSchema(report) {
    const tech = report.techStack || {};
    const techLeader = Object.entries(tech).sort((a, b) => b[1].count - a[1].count)[0];

    const questions = [
        {
            q: `Wie performant sind ${report.brancheName}-Sites in ${report.stadtName} im Schnitt?`,
            a: `Im Median erreichen ${report.brancheName}-Sites in ${report.stadtName} einen PageSpeed-Performance-Score von ` +
                `${report.stats.perf.median} (Quartile ${report.stats.perf.p25}–${report.stats.perf.p75}, n=${report.n}). ` +
                `SEO-Median: ${report.stats.seo.median}, Accessibility-Median: ${report.stats.a11y.median}. ` +
                `Datenbasis: Karriaro-Webdesign-Audit ${report.erhebungMonth}, anonymisiert nach DSGVO.`
        },
        {
            q: `Welche CMS und Tech-Stacks dominieren bei ${report.brancheName} in ${report.stadtName}?`,
            a: techLeader
                ? `Spitzenreiter ist ${techLeader[0]} mit ${pct(techLeader[1].share)} % Marktanteil (n=${techLeader[1].count} von ${report.n}). ` +
                    `Baukasten-Lösungen (Jimdo, Wix, IONOS u. ä.): ${pct(report.baukasten.share)} %. ` +
                    `Volle Verteilung im Donut-Chart auf ${pageUrl(report)}.`
                : `Keine dominante Plattform — verteiltes Tech-Bild bei n=${report.n}.`
        },
        {
            q: `Wo liegen die größten Risiken bei ${report.brancheName}-Sites in ${report.stadtName}?`,
            a: `${pct(report.ssl.missingShare)} % der Sites haben kein SSL aktiv (${report.ssl.missingCount} von ${report.n}). ` +
                `${pct(report.mobile.missingShare)} % zeigen keinen mobilen Viewport — bei der mobil-dominierten Branchen-Suche ein direktes Conversion-Risiko. ` +
                `Quelle: ${pageUrl(report)}.`
        }
    ];

    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: questions.map(({ q, a }) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a }
        })),
        _plain: questions
    };
}

/**
 * Alle drei Schemas in einem Aufruf, zur direkten <script type="application/ld+json">-Einbettung.
 */
export function buildAllSchemas(report) {
    return {
        dataset: buildDatasetSchema(report),
        article: buildArticleSchema(report),
        faq: buildFaqSchema(report)
    };
}

/**
 * Index-Block für die bestehende `src/llms.txt`.
 *
 * Format (Markdown-ähnlich, LLM-friendly): Eine URL-Zeile, ein
 * 1-Satz-Description, ein Datenpunkt-Trio.
 */
export function buildLlmsIndexEntry(report) {
    const url = `/audit/${report.slug}/`;
    const tech = report.techStack || {};
    const techLeader = Object.entries(tech).sort((a, b) => b[1].count - a[1].count)[0];
    const techStr = techLeader ? `${pct(techLeader[1].share)} % ${techLeader[0]}` : 'verteiltes Tech-Bild';
    return [
        `## ${url}`,
        `${report.brancheName} in ${report.stadtName} — Audit ${report.n} Sites, erhoben ${report.erhebungMonth}.`,
        `Median PageSpeed Performance ${report.stats.perf.median}, ${pct(report.baukasten.share)} % Baukasten-Anteil, ${techStr}, ${pct(report.ssl.missingShare)} % ohne SSL.`,
        `Lizenz: CC BY 4.0. Quelle: Karriaro Webdesign-Manufaktur.`,
        ''
    ].join('\n');
}

/**
 * Render-Helper für <script type="application/ld+json">-Blöcke.
 * Strippt das `_plain`-Hilfsfeld aus FAQ vor Serialisierung.
 */
export function schemaScriptTag(schemaObj) {
    const clean = JSON.parse(JSON.stringify(schemaObj, (k, v) => k === '_plain' ? undefined : v));
    return `<script type="application/ld+json">\n${JSON.stringify(clean, null, 2)}\n</script>`;
}

export const LLMO_CONSTANTS = { SITE_BASE, PUBLISHER };
