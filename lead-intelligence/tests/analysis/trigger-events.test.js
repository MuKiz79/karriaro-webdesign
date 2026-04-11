import { describe, it, expect } from 'vitest';
import { detectTriggerEvents } from '../../src/analysis/trigger-events.js';

describe('detectTriggerEvents', () => {
    it('no SSL + bad a11y = sofort triggers', () => {
        const result = detectTriggerEvents({
            ws: { isHttps: false, a11y: 40, perf: 50 },
            tech: {}, place: null, wayback: null,
            footprint: null, psiData: null, contentAnalysis: null,
            socialSignals: null, competitors: null
        });
        expect(result.hasSofort).toBe(true);
        expect(result.eventCount).toBeGreaterThanOrEqual(2);
    });

    it('perfect website = no triggers', () => {
        const result = detectTriggerEvents({
            ws: { isHttps: true, a11y: 95, perf: 95 },
            tech: {}, place: null, wayback: null,
            footprint: null, psiData: null, contentAnalysis: null,
            socialSignals: null, competitors: null
        });
        expect(result.hasSofort).toBe(false);
        expect(result.totalImpact).toBeLessThan(5);
    });

    it('old wayback + outdated tech = high impact', () => {
        const result = detectTriggerEvents({
            ws: { isHttps: true, a11y: 80, perf: 50 },
            tech: { version: '4', cms: 'WordPress' },
            place: null,
            wayback: { daysSince: 900, yearsSince: 2.5 },
            footprint: null, psiData: null, contentAnalysis: null,
            socialSignals: null, competitors: null
        });
        expect(result.totalImpact).toBeGreaterThanOrEqual(6);
    });

    it('should sort events by impact', () => {
        const result = detectTriggerEvents({
            ws: { isHttps: false, a11y: 30, perf: 20 },
            tech: { version: '4', cms: 'WordPress' },
            place: null, wayback: { daysSince: 1000, yearsSince: 2.7 },
            footprint: null, psiData: null, contentAnalysis: null,
            socialSignals: null, competitors: null
        });
        for (let i = 1; i < result.events.length; i++) {
            expect(result.events[i].impact).toBeLessThanOrEqual(result.events[i-1].impact);
        }
    });
});
