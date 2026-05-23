import { describe, it, expect } from 'vitest';
import { boxPlot, histogramChart, donutChart, ACCENT_BY_BRANCH } from '../../src/reports/svg-charts.js';

describe('boxPlot', () => {
    it('returns empty-chart fallback for missing data', () => {
        const svg = boxPlot(null);
        expect(svg).toContain('Keine Daten');
        expect(svg).toContain('<svg');
    });
    it('renders an SVG with median + n + a11y label', () => {
        const stats = { n: 47, median: 62, p25: 48, p75: 78, mean: 63, min: 22, max: 95 };
        const svg = boxPlot(stats, { label: 'Performance', unit: '', accent: ACCENT_BY_BRANCH.hair_salon });
        expect(svg).toContain('<svg');
        expect(svg).toContain('aria-label');
        expect(svg).toContain('Median 62');
        expect(svg).toContain('n = 47');
        expect(svg).toContain(ACCENT_BY_BRANCH.hair_salon);
    });
    it('escapes label content', () => {
        const stats = { n: 1, median: 50, p25: 50, p75: 50, mean: 50, min: 50, max: 50 };
        const svg = boxPlot(stats, { label: '<script>alert(1)</script>' });
        expect(svg).not.toContain('<script>');
        expect(svg).toContain('&lt;script&gt;');
    });
});

describe('histogramChart', () => {
    it('returns empty-chart fallback for missing data', () => {
        expect(histogramChart([])).toContain('Keine Daten');
    });
    it('renders one bar per bin and shows total n', () => {
        const bins = [
            { lo: 0, hi: 9, count: 2 },
            { lo: 10, hi: 19, count: 5 },
            { lo: 20, hi: 29, count: 8 },
            { lo: 30, hi: 39, count: 3 }
        ];
        const svg = histogramChart(bins, { label: 'Score-Verteilung' });
        const rectMatches = svg.match(/<rect /g) || [];
        // 1 background rect + 4 bars
        expect(rectMatches.length).toBe(5);
        expect(svg).toContain('n = 18');
        expect(svg).toContain('SCORE-VERTEILUNG');
    });
});

describe('donutChart', () => {
    it('returns empty-chart fallback for empty distribution', () => {
        expect(donutChart({})).toContain('Keine Daten');
    });
    it('renders one path per category and shows the top label', () => {
        const dist = {
            WordPress: { count: 34, share: 0.723 },
            Jimdo: { count: 4, share: 0.085 },
            Static: { count: 9, share: 0.192 }
        };
        const svg = donutChart(dist, { label: 'Tech-Stack', accent: ACCENT_BY_BRANCH.dentist });
        const pathMatches = svg.match(/<path /g) || [];
        expect(pathMatches.length).toBe(3);
        expect(svg).toContain('WordPress');
        expect(svg).toContain('72 % der 47');
        expect(svg).toContain('TECH-STACK');
    });
    it('aria-label mentions the top category', () => {
        const dist = { A: { count: 6, share: 0.6 }, B: { count: 4, share: 0.4 } };
        const svg = donutChart(dist);
        expect(svg).toMatch(/aria-label="[^"]*Spitzenreiter A/);
    });
});

describe('ACCENT_BY_BRANCH', () => {
    it('covers all 18 scanner branches', () => {
        const keys = ['dentist', 'hair_salon', 'restaurant', 'auto_repair', 'beauty_salon',
            'physiotherapist', 'lawyer', 'real_estate_agency', 'hotel', 'plumber',
            'electrician', 'veterinary_care', 'gym', 'moving_company', 'car_dealer',
            'bakery', 'florist', 'cafe'];
        for (const k of keys) {
            expect(ACCENT_BY_BRANCH[k]).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
});
