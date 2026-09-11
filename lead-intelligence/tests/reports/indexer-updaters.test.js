import { describe, it, expect } from 'vitest';
import { buildSitemapBlock, buildLlmsBlock, updateSitemap, updateLlms } from '../../src/reports/indexer-updaters.js';

function fixtureReport(slug, overrides = {}) {
    return {
        slug,
        brancheKey: 'hair_salon',
        brancheName: 'Friseure',
        stadtName: 'Köln',
        erhebungDate: '2026-05-24',
        erhebungMonth: '2026-05',
        n: 47,
        stats: { perf: { median: 65 } },
        techStack: { WordPress: { count: 34, share: 0.723 } },
        baukasten: { count: 10, share: 0.21 },
        ssl: { missingShare: 0.06 },
        ...overrides
    };
}

describe('buildSitemapBlock', () => {
    it('always lists the hub /audit/ URL', () => {
        const block = buildSitemapBlock([], '2026-05-24');
        expect(block).toContain('https://karriaro-webdesign.de/audit/');
        expect(block).toContain('AUTO-WEB-INDEX-START');
        expect(block).toContain('AUTO-WEB-INDEX-END');
    });
    it('lists live reports and skips -preview suffix', () => {
        const reports = [
            fixtureReport('friseure-koeln'),
            fixtureReport('friseure-muenchen-preview', { stadtName: 'München' }),
            fixtureReport('zahnaerzte-koeln', { brancheKey: 'dentist', brancheName: 'Zahnärzte' })
        ];
        const block = buildSitemapBlock(reports, '2026-05-24');
        expect(block).toContain('/audit/friseure-koeln/');
        expect(block).toContain('/audit/zahnaerzte-koeln/');
        expect(block).not.toContain('friseure-muenchen-preview');
    });
    it('lastmod nennt das Veröffentlichungsdatum, nicht den Messtag', () => {
        const block = buildSitemapBlock([fixtureReport('friseure-koeln', { veroeffentlichtAm: '2026-09-11' })], '2026-09-12');
        expect(block).toContain('/audit/friseure-koeln/</loc><lastmod>2026-09-11</lastmod>');
        expect(block).not.toContain('<lastmod>2026-05-24</lastmod>');
    });
    it('lastmod folgt einer späteren Aktualisierung', () => {
        const block = buildSitemapBlock([fixtureReport('friseure-koeln', { veroeffentlichtAm: '2026-09-11', aktualisiertAm: '2026-10-02' })], '2026-10-03');
        expect(block).toContain('/audit/friseure-koeln/</loc><lastmod>2026-10-02</lastmod>');
    });
    it('Altbestand ohne Veröffentlichungsdatum fällt auf den Messtag zurück', () => {
        const block = buildSitemapBlock([fixtureReport('friseure-koeln')], '2026-09-12');
        expect(block).toContain('/audit/friseure-koeln/</loc><lastmod>2026-05-24</lastmod>');
    });
});

describe('buildLlmsBlock', () => {
    it('renders empty-state when no live reports exist', () => {
        const block = buildLlmsBlock([fixtureReport('friseure-koeln-preview')]);
        expect(block).toMatch(/keine veröffentlichten Live-Reports/i);
        expect(block).toContain('## Web-Index');
    });
    it('renders one entry per live report', () => {
        const block = buildLlmsBlock([
            fixtureReport('friseure-koeln'),
            fixtureReport('zahnaerzte-koeln', { brancheKey: 'dentist', brancheName: 'Zahnärzte' })
        ]);
        expect(block).toContain('/audit/friseure-koeln/');
        expect(block).toContain('/audit/zahnaerzte-koeln/');
        expect(block).toContain('Median PageSpeed Performance 65');
    });
});

describe('updateSitemap', () => {
    const baseline = `<?xml version="1.0"?>
<urlset>
    <url><loc>foo</loc></url>

    <!-- AUTO-WEB-INDEX-START — initial -->
    <!-- AUTO-WEB-INDEX-END -->

</urlset>`;
    it('is idempotent — running twice yields the same content', () => {
        const reports = [fixtureReport('friseure-koeln')];
        const once = updateSitemap(baseline, reports, '2026-05-24');
        const twice = updateSitemap(once, reports, '2026-05-24');
        expect(once).toBe(twice);
    });
    it('throws clear error when markers are missing', () => {
        expect(() => updateSitemap('<urlset></urlset>', [], '2026-05-24'))
            .toThrow(/Marker-Block nicht gefunden/);
    });
});

describe('updateLlms', () => {
    const baseline = `# Karriaro

> Tagline.

<!-- AUTO-WEB-INDEX-START — initial -->
<!-- AUTO-WEB-INDEX-END -->
`;
    it('is idempotent', () => {
        const reports = [fixtureReport('friseure-koeln')];
        const once = updateLlms(baseline, reports);
        const twice = updateLlms(once, reports);
        expect(once).toBe(twice);
    });
    it('inserts a live report entry into the marker block', () => {
        const reports = [fixtureReport('friseure-koeln')];
        const out = updateLlms(baseline, reports);
        expect(out).toContain('/audit/friseure-koeln/');
        expect(out.indexOf('AUTO-WEB-INDEX-START')).toBeLessThan(out.indexOf('/audit/friseure-koeln/'));
        expect(out.indexOf('/audit/friseure-koeln/')).toBeLessThan(out.indexOf('AUTO-WEB-INDEX-END'));
    });
});
