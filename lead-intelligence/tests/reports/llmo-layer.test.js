import { describe, it, expect } from 'vitest';
import {
    buildDatasetSchema,
    buildArticleSchema,
    buildFaqSchema,
    buildAllSchemas,
    buildLlmsIndexEntry,
    schemaScriptTag
} from '../../src/reports/llmo-layer.js';

function fixtureReport(overrides = {}) {
    return {
        brancheKey: 'hair_salon',
        brancheSlug: 'friseure',
        brancheName: 'Friseure',
        stadtName: 'Köln',
        stadtSlug: 'koeln',
        slug: 'friseure-koeln',
        erhebungDate: '2026-05-24',
        erhebungMonth: '2026-05',
        n: 47,
        stats: {
            perf: { n: 47, median: 65, p25: 48, p75: 78, mean: 63, min: 22, max: 95 },
            seo: { n: 47, median: 78, p25: 70, p75: 86, mean: 77, min: 50, max: 99 },
            a11y: { n: 47, median: 72, p25: 65, p75: 80, mean: 71, min: 40, max: 98 },
            leadScore: { n: 47, median: 60, p25: 45, p75: 75, mean: 60, min: 20, max: 95 }
        },
        techStack: {
            WordPress: { count: 34, share: 0.723 },
            Jimdo: { count: 4, share: 0.085 },
            Wix: { count: 5, share: 0.106 },
            Static: { count: 4, share: 0.086 }
        },
        baukasten: { count: 10, share: 0.213 },
        ssl: { missingCount: 3, missingShare: 0.064 },
        mobile: { missingCount: 1, missingShare: 0.021 },
        ...overrides
    };
}

describe('buildDatasetSchema', () => {
    it('includes Dataset @type and the canonical URL', () => {
        const s = buildDatasetSchema(fixtureReport());
        expect(s['@type']).toBe('Dataset');
        expect(s.url).toBe('https://karriaro-webdesign.de/audit/friseure-koeln/');
        expect(s.identifier).toBe('friseure-koeln');
    });
    it('cites the median performance score in the description', () => {
        const s = buildDatasetSchema(fixtureReport());
        expect(s.description).toContain('Median PageSpeed 65');
        expect(s.description).toContain('21 % Baukasten');
    });
    it('lists variableMeasured entries', () => {
        const s = buildDatasetSchema(fixtureReport());
        const names = s.variableMeasured.map(v => v.name);
        expect(names).toContain('PageSpeed Performance Score');
        expect(names).toContain('Baukasten-Anteil');
    });
    it('records temporal + spatial coverage', () => {
        const s = buildDatasetSchema(fixtureReport());
        expect(s.temporalCoverage).toBe('2026-05');
        expect(s.spatialCoverage.name).toBe('Köln');
    });
});

describe('buildArticleSchema', () => {
    it('builds an Article with headline + canonical URL', () => {
        const s = buildArticleSchema(fixtureReport());
        expect(s['@type']).toBe('Article');
        expect(s.headline).toBe('Web-Index Friseure Köln 2026');
        expect(s.url).toBe('https://karriaro-webdesign.de/audit/friseure-koeln/');
        expect(s.inLanguage).toBe('de-DE');
    });
});

describe('buildFaqSchema', () => {
    it('produces three FAQ questions with data-grounded answers', () => {
        const s = buildFaqSchema(fixtureReport());
        expect(s['@type']).toBe('FAQPage');
        expect(s.mainEntity).toHaveLength(3);
        const firstAnswer = s.mainEntity[0].acceptedAnswer.text;
        expect(firstAnswer).toContain('65');
        expect(firstAnswer).toContain('n=47');
        const techAnswer = s.mainEntity[1].acceptedAnswer.text;
        expect(techAnswer).toContain('WordPress');
        expect(techAnswer).toContain('72 %');
    });
    it('keeps a plain mirror for HTML rendering', () => {
        const s = buildFaqSchema(fixtureReport());
        expect(s._plain).toHaveLength(3);
        expect(s._plain[0].q).toMatch(/^Wie performant/);
    });
});

describe('buildAllSchemas', () => {
    it('returns Dataset, Article, FaqPage together', () => {
        const all = buildAllSchemas(fixtureReport());
        expect(all.dataset['@type']).toBe('Dataset');
        expect(all.article['@type']).toBe('Article');
        expect(all.faq['@type']).toBe('FAQPage');
    });
});

describe('buildLlmsIndexEntry', () => {
    it('renders a 4-line block ending with newline', () => {
        const entry = buildLlmsIndexEntry(fixtureReport());
        expect(entry).toContain('## /audit/friseure-koeln/');
        expect(entry).toContain('Friseure in Köln');
        expect(entry).toContain('Median PageSpeed Performance 65');
        expect(entry).toContain('72 % WordPress');
        expect(entry).toContain('CC BY 4.0');
        expect(entry.endsWith('\n')).toBe(true);
    });
});

describe('schemaScriptTag', () => {
    it('wraps JSON-LD inside a <script> tag with correct type', () => {
        const tag = schemaScriptTag(buildArticleSchema(fixtureReport()));
        expect(tag).toMatch(/^<script type="application\/ld\+json">/);
        expect(tag).toMatch(/<\/script>$/);
        expect(tag).toContain('"@type": "Article"');
    });
    it('strips the _plain helper field from FAQ output', () => {
        const tag = schemaScriptTag(buildFaqSchema(fixtureReport()));
        expect(tag).not.toContain('_plain');
        expect(tag).toContain('FAQPage');
    });
});
