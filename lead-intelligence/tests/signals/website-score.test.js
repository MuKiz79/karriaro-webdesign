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

describe('Mess-Lücken sind als Lücke markiert (2026-08-17)', () => {
    it('gemessene Kategorien melden known=true', () => {
        const ws = extractWebsiteScore(mockPsi());
        expect(ws.perfKnown).toBe(true);
        expect(ws.a11yKnown).toBe(true);
        expect(ws.seoKnown).toBe(true);
        expect(ws.bpKnown).toBe(true);
    });

    it('Kategorie ohne Score (Lighthouse-Fehler) meldet known=false — die 0 ist KEIN Messwert', () => {
        // PSI liefert bei runtimeError/NO_FCP eine Kategorie ohne `score`.
        // Ohne dieses Flag las die 0 sich wie „katastrophal gemessen".
        const ws = extractWebsiteScore(mockPsi({ categories: { performance: {}, seo: { score: null } } }));
        expect(ws.perf).toBe(0);
        expect(ws.perfKnown).toBe(false);
        expect(ws.seoKnown).toBe(false);
        expect(ws.a11yKnown).toBe(true);      // die anderen bleiben unberührt
    });

    it('gar keine PSI-Antwort ⇒ nichts gilt als gemessen', () => {
        const ws = extractWebsiteScore(null);
        expect(ws.perfKnown).toBe(false);
        expect(ws.seoKnown).toBe(false);
        expect(ws.a11yKnown).toBe(false);
    });
});

describe('F16 — CrUX-Extraktion (2026-08-16)', () => {
    const base = { lighthouseResult: { categories: {}, audits: {} } };

    it('URL-Ebene wird bevorzugt', () => {
        const ws = extractWebsiteScore({
            ...base,
            loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2268, category: 'FAST' } } },
            originLoadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4000, category: 'SLOW' } } }
        });
        expect(ws.crux).toEqual({ lcpMs: 2268, category: 'FAST', source: 'url' });
    });

    it('Origin als Rückfall, wenn die URL keine Felddaten hat', () => {
        const ws = extractWebsiteScore({
            ...base,
            loadingExperience: { metrics: {} },
            originLoadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100, category: 'AVERAGE' } } }
        });
        expect(ws.crux).toEqual({ lcpMs: 3100, category: 'AVERAGE', source: 'origin' });
    });

    it('keine Felddaten ⇒ null — nie eine Richtung erfinden', () => {
        expect(extractWebsiteScore(base).crux).toBeNull();
        expect(extractWebsiteScore({}).crux).toBeNull();
    });
});
