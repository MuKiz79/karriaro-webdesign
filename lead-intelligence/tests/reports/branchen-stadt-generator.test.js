import { describe, it, expect } from 'vitest';
import {
    generateReport,
    anonymizeId,
    summarizeNumeric,
    distributeCategorical,
    buildSignificanceTests,
    REPORT_GENERATOR_CONSTANTS
} from '../../src/reports/branchen-stadt-generator.js';

function makeLead(domain, overrides = {}) {
    return {
        domain,
        websiteUri: `https://${domain}`,
        name: `Firma ${domain}`,
        reviews: 12,
        rating: 4.4,
        ws: { perf: 60, seo: 70, a11y: 80, isHttps: true, viewport: true },
        cms: 'WordPress',
        version: '6.5',
        isBaukasten: false,
        leadScore: 65,
        conversionRate: 0.04,
        expectedValue: 100,
        ...overrides
    };
}

function makeLeads(n, perBase = {}) {
    return Array.from({ length: n }, (_, i) => makeLead(`leadtest-${i}.example.de`, {
        ...perBase,
        leadScore: 50 + (i % 40),
        ws: { perf: 40 + (i % 60), seo: 50 + (i % 50), a11y: 60 + (i % 40), isHttps: true, viewport: true }
    }));
}

describe('anonymizeId', () => {
    it('produces a stable ID for the same domain', () => {
        const a = anonymizeId('schmidt-friseur.de', 'hair_salon');
        const b = anonymizeId('schmidt-friseur.de', 'hair_salon');
        expect(a).toBe(b);
    });
    it('uses the branch prefix', () => {
        expect(anonymizeId('example.de', 'hair_salon')).toMatch(/^F-\d{3}$/);
        expect(anonymizeId('example.de', 'dentist')).toMatch(/^Z-\d{3}$/);
    });
    it('falls back to X-prefix for unknown branches', () => {
        expect(anonymizeId('example.de', 'unknown_branch')).toMatch(/^X-\d{3}$/);
    });
    it('normalizes www.', () => {
        expect(anonymizeId('www.example.de', 'cafe')).toBe(anonymizeId('example.de', 'cafe'));
    });
    it('handles empty input without throwing', () => {
        expect(anonymizeId('', 'hair_salon')).toBe('F-000');
    });
});

describe('summarizeNumeric', () => {
    it('returns null fields for empty input', () => {
        const s = summarizeNumeric([]);
        expect(s.n).toBe(0);
        expect(s.median).toBe(null);
    });
    it('filters non-finite values', () => {
        const s = summarizeNumeric([10, 20, null, undefined, NaN, 30]);
        expect(s.n).toBe(3);
        expect(s.median).toBe(20);
    });
    it('computes p25/p75 correctly on monotone input', () => {
        const s = summarizeNumeric([10, 20, 30, 40, 50]);
        expect(s.p25).toBe(20);
        expect(s.median).toBe(30);
        expect(s.p75).toBe(40);
        expect(s.min).toBe(10);
        expect(s.max).toBe(50);
    });
});

describe('distributeCategorical', () => {
    it('returns shares summing to ~1', () => {
        const d = distributeCategorical(['A', 'A', 'B', 'C', 'A']);
        const total = Object.values(d).reduce((s, x) => s + x.share, 0);
        expect(total).toBeGreaterThan(0.99);
        expect(total).toBeLessThan(1.01);
        expect(d.A.count).toBe(3);
    });
    it('groups long tail under Sonstige when topN is small', () => {
        const d = distributeCategorical(['A', 'B', 'C', 'D', 'E', 'F'], { topN: 2 });
        expect(d.Sonstige).toBeDefined();
        expect(d.Sonstige.count).toBe(4);
    });
    it('maps empty/null to dash', () => {
        const d = distributeCategorical(['A', '', null, undefined]);
        expect(d['—'].count).toBe(3);
    });
});

describe('buildSignificanceTests', () => {
    it('returns no tests below sample threshold', () => {
        const leads = [
            { cms: 'WordPress', isBaukasten: false, ws: { perf: 50 } },
            { cms: 'Static', isBaukasten: false, ws: { perf: 80 } }
        ];
        expect(buildSignificanceTests(leads)).toEqual([]);
    });
    it('detects a clear WordPress-vs-Static performance gap', () => {
        const wpLeads = Array.from({ length: 15 }, (_, i) => ({
            cms: 'WordPress', isBaukasten: false, ws: { perf: 30 + (i % 10) }
        }));
        const stLeads = Array.from({ length: 15 }, (_, i) => ({
            cms: 'Static', isBaukasten: false, ws: { perf: 85 + (i % 10) }
        }));
        const tests = buildSignificanceTests([...wpLeads, ...stLeads]);
        expect(tests.length).toBeGreaterThan(0);
        const t = tests.find(x => x.label.includes('WordPress'));
        expect(t).toBeDefined();
        expect(t.p).toBeLessThan(0.05);
    });
});

describe('generateReport', () => {
    it('throws INSUFFICIENT_SAMPLE below MIN_N', () => {
        const tiny = makeLeads(10);
        let err;
        try { generateReport(tiny, { brancheKey: 'hair_salon', stadtName: 'Köln' }); }
        catch (e) { err = e; }
        expect(err).toBeDefined();
        expect(err.code).toBe('INSUFFICIENT_SAMPLE');
        expect(err.n).toBe(10);
    });

    it('throws on unknown brancheKey', () => {
        const leads = makeLeads(40);
        expect(() => generateReport(leads, { brancheKey: 'spaceship', stadtName: 'Köln' }))
            .toThrow(/Unknown brancheKey/);
    });

    it('produces a well-formed report at the threshold', () => {
        const leads = makeLeads(REPORT_GENERATOR_CONSTANTS.MIN_N);
        const r = generateReport(leads, { brancheKey: 'hair_salon', stadtName: 'Köln', erhebungTs: Date.parse('2026-05-24T12:00:00Z') });
        expect(r.slug).toBe('friseure-koeln');
        expect(r.brancheName).toBe('Friseure');
        expect(r.stadtName).toBe('Köln');
        expect(r.stadtSlug).toBe('koeln');
        expect(r.erhebungDate).toBe('2026-05-24');
        expect(r.n).toBe(30);
        expect(r.leads).toHaveLength(30);
        expect(r.stats.perf.n).toBe(30);
        expect(r.stats.leadScore.median).toBeGreaterThan(0);
        expect(Object.keys(r.techStack).length).toBeGreaterThan(0);
        expect(r.methodology.minSampleSize).toBe(30);
    });

    it('handles diacritics in stadtName via slug normalization', () => {
        const leads = makeLeads(REPORT_GENERATOR_CONSTANTS.MIN_N);
        const r = generateReport(leads, { brancheKey: 'dentist', stadtName: 'München' });
        expect(r.stadtSlug).toBe('muenchen');
        expect(r.slug).toBe('zahnaerzte-muenchen');
    });

    it('anonymizes — no domain or URL leaks into output', () => {
        const leads = makeLeads(REPORT_GENERATOR_CONSTANTS.MIN_N);
        const r = generateReport(leads, { brancheKey: 'hair_salon', stadtName: 'Köln' });
        const serialized = JSON.stringify(r);
        expect(serialized).not.toMatch(/leadtest-/);
        expect(serialized).not.toMatch(/example\.de/);
        for (const lead of r.leads) {
            expect(lead.id).toMatch(/^F-\d{3}$/);
            expect(lead.domain).toBeUndefined();
            expect(lead.websiteUri).toBeUndefined();
        }
    });

    it('reports SSL/Mobile-missing shares', () => {
        const leads = makeLeads(40).map((l, i) => ({
            ...l,
            ws: { ...l.ws, isHttps: i < 4 ? false : true, viewport: i < 2 ? false : true }
        }));
        const r = generateReport(leads, { brancheKey: 'cafe', stadtName: 'Köln' });
        expect(r.ssl.missingCount).toBe(4);
        expect(r.mobile.missingCount).toBe(2);
    });
});
