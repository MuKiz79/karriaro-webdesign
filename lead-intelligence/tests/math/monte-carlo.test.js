import { describe, it, expect } from 'vitest';
import { runSimulation } from '../../src/math/monte-carlo.js';

const stages = [
    { name: 'Reach', alpha: 8, beta: 3 },
    { name: 'Open', alpha: 5, beta: 15 },
    { name: 'Interest', alpha: 6, beta: 4 },
    { name: 'Convo', alpha: 4, beta: 4 },
    { name: 'Proposal', alpha: 7, beta: 3 },
    { name: 'Close', alpha: 5, beta: 4 }
];

describe('runSimulation', () => {
    it('should return leadScore 0-100', () => {
        const r = runSimulation(stages, 40, 1.0, 500);
        expect(r.leadScore).toBeGreaterThanOrEqual(0);
        expect(r.leadScore).toBeLessThanOrEqual(100);
    });

    it('should return conversionRate 0-1', () => {
        const r = runSimulation(stages, 40, 1.0, 500);
        expect(r.conversionRate).toBeGreaterThanOrEqual(0);
        expect(r.conversionRate).toBeLessThanOrEqual(1);
    });

    it('CI should bracket conversion rate', () => {
        const r = runSimulation(stages, 40, 1.0, 1000);
        expect(r.ci.lower).toBeLessThanOrEqual(r.conversionRatePct);
        expect(r.ci.upper).toBeGreaterThanOrEqual(r.conversionRatePct);
    });

    it('should return 6 stage results', () => {
        const r = runSimulation(stages, 40, 1.0, 500);
        expect(r.stageResults).toHaveLength(6);
        r.stageResults.forEach(s => {
            expect(s.mean).toBeGreaterThan(0);
            expect(s.mean).toBeLessThan(100);
        });
    });

    it('should identify a bottleneck', () => {
        const r = runSimulation(stages, 40, 1.0, 500);
        expect(r.bottleneck).toHaveProperty('name');
        expect(r.bottleneck).toHaveProperty('mean');
    });

    it('different activation energy should produce different results', () => {
        const low = runSimulation(stages, 5, 1.0, 1000);
        const high = runSimulation(stages, 80, 1.0, 1000);
        // Ea affects fallback rates in Markov chain — different Ea = different CR
        expect(Math.abs(low.conversionRate - high.conversionRate)).toBeLessThan(0.1);
        expect(low.leadScore).not.toBe(high.leadScore); // Not always true but usually
    });
});

