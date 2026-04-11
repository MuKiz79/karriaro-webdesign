import { describe, it, expect } from 'vitest';
import { analyzeSignalStack } from '../../src/analysis/signal-stacking.js';

describe('analyzeSignalStack', () => {
    it('no signals = no clusters, multiplier 1.0', () => {
        const result = analyzeSignalStack({
            ws: { perf: 95, isHttps: true, a11y: 95, viewport: true },
            tech: { isBaukasten: false },
            place: null, footprint: null, revenue: null, wayback: null,
            screenshotAnalysis: { designQuality: 8 },
            socialSignals: null, surgeIntent: null, emotionalReady: null,
            conversationReady: null, bfsgScore: null
        });
        expect(result.clusterCount).toBe(0);
        expect(result.stackMultiplier).toBe(1);
    });

    it('paradox lead (bad design + bad perf + good business + social) = high multiplier', () => {
        const result = analyzeSignalStack({
            ws: { perf: 30, isHttps: true, a11y: 50, viewport: true },
            tech: { isBaukasten: true },
            place: { userRatingCount: 200, rating: 4.8 },
            footprint: { hasInstagram: true, hasFbPixel: false, hasAnalytics: false, platformCount: 2 },
            revenue: null, wayback: null,
            screenshotAnalysis: { designQuality: 3 },
            socialSignals: null, surgeIntent: null, emotionalReady: null,
            conversationReady: null, bfsgScore: null
        });
        expect(result.clusterCount).toBeGreaterThanOrEqual(1);
        expect(result.stackMultiplier).toBeGreaterThan(1.5);
        expect(result.activeClusters.some(c => c.key === 'paradox')).toBe(true);
    });

    it('compliance cluster (no SSL + bad a11y)', () => {
        const result = analyzeSignalStack({
            ws: { perf: 50, isHttps: false, a11y: 40, viewport: true },
            tech: { isBaukasten: false },
            place: null, footprint: null, revenue: null, wayback: null,
            screenshotAnalysis: null, socialSignals: null, surgeIntent: null,
            emotionalReady: null, conversationReady: null,
            bfsgScore: { risk: 'hoch' }
        });
        expect(result.activeClusters.some(c => c.key === 'compliance')).toBe(true);
        expect(result.stackMultiplier).toBeGreaterThanOrEqual(2.0);
    });

    it('digital paradox (Instagram + FB pixel + bad website)', () => {
        const result = analyzeSignalStack({
            ws: { perf: 35, isHttps: true, a11y: 60, viewport: true },
            tech: { isBaukasten: false },
            place: null,
            footprint: { hasInstagram: true, hasFbPixel: true, hasAnalytics: true, platformCount: 3 },
            revenue: null, wayback: null,
            screenshotAnalysis: { designQuality: 4 },
            socialSignals: null, surgeIntent: null, emotionalReady: null,
            conversationReady: null, bfsgScore: null
        });
        expect(result.activeClusters.some(c => c.key === 'digitalParadox')).toBe(true);
    });

    it('multiple clusters should compound multiplier', () => {
        const result = analyzeSignalStack({
            ws: { perf: 25, isHttps: false, a11y: 30, viewport: false },
            tech: { isBaukasten: true, version: '4' },
            place: { userRatingCount: 200, rating: 4.5 },
            footprint: { hasInstagram: true, hasFbPixel: true, hasAnalytics: true, platformCount: 4 },
            revenue: null, wayback: { daysSince: 1100 },
            screenshotAnalysis: { designQuality: 2 },
            socialSignals: { reviewTrend: { direction: 'fallend' } },
            surgeIntent: null, emotionalReady: null,
            conversationReady: null, bfsgScore: { risk: 'kritisch' }
        });
        expect(result.clusterCount).toBeGreaterThanOrEqual(3);
        expect(result.stackMultiplier).toBeGreaterThan(2.5);
    });

    it('should return pitchArgs for active clusters', () => {
        const result = analyzeSignalStack({
            ws: { perf: 25, isHttps: false, a11y: 30, viewport: true },
            tech: { isBaukasten: false },
            place: null, footprint: null, revenue: null, wayback: null,
            screenshotAnalysis: null, socialSignals: null, surgeIntent: null,
            emotionalReady: null, conversationReady: null,
            bfsgScore: { risk: 'kritisch' }
        });
        if (result.clusterCount > 0) {
            expect(result.pitchArgs.length).toBeGreaterThan(0);
        }
    });
});
