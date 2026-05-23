import { describe, it, expect } from 'vitest';
import { buildReportHtml } from '../../src/reports/static-html-builder.js';
import { generateReport } from '../../src/reports/branchen-stadt-generator.js';

function makeLeads(n) {
    return Array.from({ length: n }, (_, i) => ({
        domain: `lead-${i}.example.de`,
        websiteUri: `https://lead-${i}.example.de`,
        name: `Firma ${i}`,
        reviews: 10, rating: 4.3,
        ws: {
            perf: 35 + (i * 3) % 60,
            seo: 50 + (i * 5) % 50,
            a11y: 60 + (i * 4) % 40,
            isHttps: i % 12 !== 0,
            viewport: i % 18 !== 0
        },
        cms: i % 3 === 0 ? 'WordPress' : i % 3 === 1 ? 'Static' : 'Jimdo',
        version: '1',
        isBaukasten: i % 5 === 0,
        leadScore: 30 + (i * 7) % 65
    }));
}

describe('buildReportHtml', () => {
    const report = generateReport(makeLeads(45), {
        brancheKey: 'hair_salon',
        stadtName: 'Köln',
        erhebungTs: Date.parse('2026-05-24T10:00:00Z')
    });

    it('produces a complete HTML document', () => {
        const html = buildReportHtml(report);
        expect(html).toMatch(/^<!doctype html>/i);
        expect(html).toContain('<html lang="de">');
        expect(html).toContain('</html>');
    });

    it('embeds canonical URL and three JSON-LD scripts', () => {
        const html = buildReportHtml(report);
        expect(html).toContain('rel="canonical" href="https://karriaro-webdesign.de/audit/friseure-koeln/"');
        const ldMatches = html.match(/application\/ld\+json/g) || [];
        expect(ldMatches.length).toBe(3);
        expect(html).toContain('"@type": "Dataset"');
        expect(html).toContain('"@type": "Article"');
        expect(html).toContain('"@type": "FAQPage"');
    });

    it('renders all three SVG charts inline', () => {
        const html = buildReportHtml(report);
        const svgCount = (html.match(/<svg /g) || []).length;
        expect(svgCount).toBe(3);
    });

    it('uses Sie-Anrede throughout (passes voice-linter)', () => {
        expect(() => buildReportHtml(report)).not.toThrow();
    });

    it('throws when the brand-codex is violated via injected report data', () => {
        const dirty = {
            ...report,
            methodology: { ...report.methodology, source: 'In unserer Werkstatt erhoben.' }
        };
        let err;
        try { buildReportHtml(dirty); }
        catch (e) { err = e; }
        expect(err).toBeDefined();
        expect(err.code).toBe('VOICE_VIOLATION');
    });

    it('shows the Sparringspartner CTA wording (Brand-Codex Kernterm)', () => {
        const html = buildReportHtml(report);
        expect(html).toContain('Sparringspartner');
    });

    it('limits the lead-table to the first 50 rows', () => {
        const big = generateReport(makeLeads(120), {
            brancheKey: 'dentist',
            stadtName: 'München',
            erhebungTs: Date.parse('2026-05-24T10:00:00Z')
        });
        const html = buildReportHtml(big);
        const trCount = (html.match(/<tr>/g) || []).length;
        // 1 header tr + 50 data trs
        expect(trCount).toBe(51);
        expect(html).toContain('der ersten 50 von 120');
    });

    it('defaults to index,follow when noindex option is not set', () => {
        const html = buildReportHtml(report);
        expect(html).toMatch(/<meta name="robots" content="index,follow/);
        expect(html).toContain('rel="canonical"');
        expect(html).not.toContain('DEMO-VORSCHAU');
    });

    it('emits noindex meta + DEMO banner and strips JSON-LD when noindex is true', () => {
        const html = buildReportHtml(report, { noindex: true });
        expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
        expect(html).not.toContain('rel="canonical"');
        expect(html).not.toContain('application/ld+json');
        expect(html).toContain('DEMO-VORSCHAU');
        expect(html).toContain('kr-demo-banner');
        expect(html).toMatch(/<title>\[DEMO\]/);
    });

    it('renders Mann-Whitney verdict when a clear WordPress/Static gap exists', () => {
        const wpFast = Array.from({ length: 20 }, (_, i) => ({
            domain: `wp-${i}.de`, websiteUri: `https://wp-${i}.de`, name: `WP ${i}`,
            reviews: 8, rating: 4.0,
            ws: { perf: 30 + (i % 8), seo: 60, a11y: 60, isHttps: true, viewport: true },
            cms: 'WordPress', isBaukasten: false, leadScore: 40
        }));
        const stFast = Array.from({ length: 20 }, (_, i) => ({
            domain: `st-${i}.de`, websiteUri: `https://st-${i}.de`, name: `Static ${i}`,
            reviews: 8, rating: 4.0,
            ws: { perf: 85 + (i % 8), seo: 80, a11y: 80, isHttps: true, viewport: true },
            cms: 'Static', isBaukasten: false, leadScore: 70
        }));
        const r = generateReport([...wpFast, ...stFast], {
            brancheKey: 'cafe', stadtName: 'Berlin',
            erhebungTs: Date.parse('2026-05-24T10:00:00Z')
        });
        const html = buildReportHtml(r);
        expect(html).toContain('STATISTISCHE TESTS');
        expect(html).toContain('WordPress');
    });
});
