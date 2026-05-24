import { describe, it, expect } from 'vitest';
import { buildHubHtml, reportToHubCard } from '../../src/reports/hub-builder.js';

function fixtureReport(overrides = {}) {
    return {
        brancheKey: 'hair_salon',
        brancheName: 'Friseure',
        stadtName: 'Köln',
        slug: 'friseure-koeln',
        erhebungDate: '2026-05-24',
        erhebungMonth: '2026-05',
        n: 47,
        stats: { perf: { median: 65 } },
        baukasten: { share: 0.21 },
        ssl: { missingShare: 0.06 },
        ...overrides
    };
}

describe('reportToHubCard', () => {
    it('marks -preview slugs as demo', () => {
        const card = reportToHubCard(fixtureReport(), 'friseure-koeln-preview');
        expect(card.isDemo).toBe(true);
        expect(card.href).toBe('/audit/friseure-koeln-preview/');
    });
    it('preserves live slugs', () => {
        const card = reportToHubCard(fixtureReport(), 'friseure-koeln');
        expect(card.isDemo).toBe(false);
        expect(card.medianPerf).toBe(65);
    });
});

describe('buildHubHtml', () => {
    it('renders the empty state when no reports exist', () => {
        const html = buildHubHtml([]);
        expect(html).toContain('Web-Index startet');
        expect(html).not.toContain('application/ld+json');
        expect(html).toContain('<meta name="robots" content="index,follow');
    });

    it('renders one card per report, sorted live-first', () => {
        const cards = [
            reportToHubCard(fixtureReport({ stadtName: 'München' }), 'friseure-muenchen-preview'),
            reportToHubCard(fixtureReport(), 'friseure-koeln')
        ];
        const html = buildHubHtml(cards);
        const friseureKoelnIdx = html.indexOf('/audit/friseure-koeln/');
        const muenchenIdx = html.indexOf('/audit/friseure-muenchen-preview/');
        expect(friseureKoelnIdx).toBeGreaterThan(-1);
        expect(muenchenIdx).toBeGreaterThan(-1);
        expect(friseureKoelnIdx).toBeLessThan(muenchenIdx);
    });

    it('hides demos when showDemos:false', () => {
        const cards = [
            reportToHubCard(fixtureReport({ stadtName: 'München' }), 'friseure-muenchen-preview')
        ];
        const html = buildHubHtml(cards, { showDemos: false });
        expect(html).toContain('Web-Index startet');
        expect(html).not.toContain('friseure-muenchen-preview');
    });

    it('emits CollectionPage schema only when live reports exist', () => {
        const liveOnly = buildHubHtml([reportToHubCard(fixtureReport(), 'friseure-koeln')]);
        expect(liveOnly).toContain('"@type": "CollectionPage"');
        expect(liveOnly).toContain('"hasPart"');
        const demoOnly = buildHubHtml([reportToHubCard(fixtureReport(), 'friseure-muenchen-preview')]);
        expect(demoOnly).not.toContain('CollectionPage');
    });

    it('counts only live reports in the summary bar', () => {
        const cards = [
            reportToHubCard(fixtureReport(), 'friseure-koeln'),
            reportToHubCard(fixtureReport({ stadtName: 'Berlin', n: 50 }), 'friseure-berlin-preview')
        ];
        const html = buildHubHtml(cards);
        expect(html).toMatch(/<strong>1<\/strong>\s*Audits/);
        expect(html).toMatch(/<strong>47<\/strong>\s*Sites/);
    });

    it('passes the voice-linter (Sie-Anrede, Sparringspartner-Voice)', () => {
        const cards = [reportToHubCard(fixtureReport(), 'friseure-koeln')];
        expect(() => buildHubHtml(cards)).not.toThrow();
    });

    it('shows DEMO badge in folio for demo cards', () => {
        const cards = [reportToHubCard(fixtureReport(), 'friseure-koeln-preview')];
        const html = buildHubHtml(cards);
        expect(html).toContain('DEMO-VORSCHAU');
    });
});
