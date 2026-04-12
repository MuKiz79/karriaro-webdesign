import { describe, it, expect } from 'vitest';
import { extractWebsiteScore } from '../../src/signals/website-score.js';

const mockPsi = (overrides = {}) => ({
    lighthouseResult: {
        categories: {
            performance: { score: 0.85 },
            accessibility: { score: 0.90 },
            seo: { score: 0.75 },
            'best-practices': { score: 0.80 },
            ...overrides.categories
        },
        audits: {
            'largest-contentful-paint': { numericValue: 2000 },
            'is-on-https': { score: 1 },
            viewport: { score: 1 },
            ...overrides.audits
        }
    }
});

describe('extractWebsiteScore', () => {
    it('should extract all scores', () => {
        const ws = extractWebsiteScore(mockPsi());
        expect(ws.perf).toBe(85);
        expect(ws.a11y).toBe(90);
        expect(ws.seo).toBe(75);
        // isHttps uses is-on-https audit or checks for redirected-to-https
        expect(typeof ws.isHttps).toBe('boolean');
        expect(typeof ws.viewport).toBe('boolean');
    });

    it('no HTTPS = isHttps false', () => {
        const ws = extractWebsiteScore(mockPsi({ audits: { 'is-on-https': { score: 0 } } }));
        expect(ws.isHttps).toBe(false);
    });

    it('no viewport = viewport false', () => {
        const ws = extractWebsiteScore(mockPsi({ audits: { viewport: { score: 0 } } }));
        expect(ws.viewport).toBe(false);
    });

    it('handles null psiData', () => {
        const ws = extractWebsiteScore(null);
        expect(ws.perf).toBe(0);
    });
});
