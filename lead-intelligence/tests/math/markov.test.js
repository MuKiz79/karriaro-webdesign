import { describe, it, expect } from 'vitest';
import { buildTransitionMatrix, simulate, monteCarloMarkov, STATE_CUSTOMER, STATE_LOST } from '../../src/math/markov.js';

describe('buildTransitionMatrix', () => {
    it('all rows should sum to ~1', () => {
        const T = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5]);
        for (let i = 0; i < T.length; i++) {
            const sum = T[i].reduce((a, b) => a + b, 0);
            expect(Math.abs(sum - 1)).toBeLessThan(0.01);
        }
    });

    it('absorbing states should stay', () => {
        const T = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5]);
        expect(T[STATE_CUSTOMER][STATE_CUSTOMER]).toBe(1);
        expect(T[STATE_LOST][STATE_LOST]).toBe(1);
    });

    it('higher Ea should reduce forward rates (damping)', () => {
        const T1 = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5], 20);
        const T2 = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5], 70);
        // Higher Ea = lower forward rate = higher lost rate
        expect(T2[1][2]).toBeLessThan(T1[1][2]); // p2 (Öffnung → Interesse) gedämpft
    });
});

describe('simulate', () => {
    it('should end in absorbing state', () => {
        const T = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5]);
        const result = simulate(T);
        expect([STATE_CUSTOMER, STATE_LOST]).toContain(result.finalState);
    });
});

describe('monteCarloMarkov', () => {
    it('conversion rate should be between 0 and 1', () => {
        const T = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5]);
        const result = monteCarloMarkov(T, 500);
        expect(result.conversionRate).toBeGreaterThanOrEqual(0);
        expect(result.conversionRate).toBeLessThanOrEqual(1);
    });

    it('high rates should give higher conversion than low rates', () => {
        const THigh = buildTransitionMatrix([0.9, 0.5, 0.6, 0.5, 0.8, 0.7]);
        const TLow = buildTransitionMatrix([0.5, 0.1, 0.1, 0.1, 0.3, 0.2]);
        const high = monteCarloMarkov(THigh, 1000);
        const low = monteCarloMarkov(TLow, 1000);
        expect(high.conversionRate).toBeGreaterThan(low.conversionRate);
    });
});
