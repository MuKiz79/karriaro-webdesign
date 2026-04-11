import { describe, it, expect } from 'vitest';
import { calculateCompositeScore } from '../../src/scoring/composite-score.js';

describe('calculateCompositeScore', () => {
    it('bad website + good business + triggers = high composite', () => {
        const result = calculateCompositeScore({
            ws: { perf: 25, isHttps: false, viewport: false, viewportMissing: true },
            tech: { isBaukasten: true },
            place: { userRatingCount: 150, rating: 4.6, primaryType: 'dentist' },
            footprint: { maturity: 0.5 },
            revenue: null,
            result: { conversionRate: 5 },
            screenshotAnalysis: { designQuality: 3 },
            contentAnalysis: null,
            socialSignals: null,
            triggerEvents: { hasSofort: true, totalImpact: 12 },
            bfsgScore: { risk: 'kritisch' },
            signalStack: { clusterCount: 2 },
            techDepth: { obsoleteScore: 5 },
            contentFreshness: { freshness: 'veraltet' },
            companyProfile: { isEnterprise: false }
        });
        expect(result.composite).toBeGreaterThan(50);
        expect(result.fit).toBeGreaterThan(40);
        expect(result.intent).toBeGreaterThan(50);
    });

    it('good website + no triggers = low composite', () => {
        const result = calculateCompositeScore({
            ws: { perf: 95, isHttps: true, viewport: true, viewportMissing: false },
            tech: { isBaukasten: false },
            place: { userRatingCount: 5, primaryType: '_default' },
            footprint: { maturity: 0.1 },
            revenue: null,
            result: { conversionRate: 1 },
            screenshotAnalysis: { designQuality: 9 },
            contentAnalysis: { hasCTA: true, hasUSP: true },
            socialSignals: null,
            triggerEvents: { hasSofort: false, totalImpact: 0 },
            bfsgScore: { risk: 'niedrig' },
            signalStack: { clusterCount: 0 },
            techDepth: { obsoleteScore: 0 },
            contentFreshness: { freshness: 'aktuell' },
            companyProfile: { isEnterprise: false }
        });
        expect(result.composite).toBeLessThan(40);
    });

    it('enterprise = low fit', () => {
        const result = calculateCompositeScore({
            ws: { perf: 50 }, tech: {}, place: { userRatingCount: 200 },
            footprint: {}, revenue: null, result: { conversionRate: 3 },
            screenshotAnalysis: null, contentAnalysis: null, socialSignals: null,
            triggerEvents: { hasSofort: false, totalImpact: 0 },
            bfsgScore: {}, signalStack: { clusterCount: 0 },
            techDepth: { obsoleteScore: 0 }, contentFreshness: {},
            companyProfile: { isEnterprise: true }
        });
        expect(result.fit).toBeLessThan(50);
    });

    it('should identify bottleneck dimension', () => {
        const result = calculateCompositeScore({
            ws: { perf: 95, isHttps: true, viewport: true },
            tech: {}, place: { userRatingCount: 100 },
            footprint: { maturity: 0.5 }, revenue: null,
            result: { conversionRate: 2 },
            screenshotAnalysis: { designQuality: 8 },
            contentAnalysis: null, socialSignals: null,
            triggerEvents: { hasSofort: false, totalImpact: 0 },
            bfsgScore: { risk: 'niedrig' },
            signalStack: { clusterCount: 0 },
            techDepth: { obsoleteScore: 0 },
            contentFreshness: { freshness: 'aktuell' },
            companyProfile: { isEnterprise: false }
        });
        expect(result.bottleneck).toHaveProperty('name');
        expect(result.bottleneck).toHaveProperty('value');
    });
});
