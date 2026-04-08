import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildTransitionMatrix, simulate, monteCarloMarkov, STATE_CUSTOMER, STATE_LOST } from '../../src/math/markov.js';

describe('buildTransitionMatrix', () => {
    it('all rows should sum to ~1', () => {
        const T = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5]);
        for (let i = 0; i < T.length; i++) {
            const sum = T[i].reduce((a, b) => a + b, 0);
            assert.ok(Math.abs(sum - 1) < 0.01, `Row ${i} sums to ${sum}`);
        }
    });

    it('absorbing states should stay', () => {
        const T = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5]);
        assert.strictEqual(T[STATE_CUSTOMER][STATE_CUSTOMER], 1);
        assert.strictEqual(T[STATE_LOST][STATE_LOST], 1);
    });

    it('higher Ea should increase fallback rates', () => {
        const T1 = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5], 20);
        const T2 = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5], 70);
        // Kontaktiert → Kalt (Rückfall) should be higher with higher Ea
        assert.ok(T2[1][0] > T1[1][0], `Fallback should increase with Ea`);
    });
});

describe('simulate', () => {
    it('should end in absorbing state', () => {
        const T = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5]);
        const result = simulate(T);
        assert.ok(result.finalState === STATE_CUSTOMER || result.finalState === STATE_LOST);
    });
});

describe('monteCarloMarkov', () => {
    it('conversion rate should be between 0 and 1', () => {
        const T = buildTransitionMatrix([0.8, 0.3, 0.4, 0.35, 0.6, 0.5]);
        const result = monteCarloMarkov(T, 500);
        assert.ok(result.conversionRate >= 0 && result.conversionRate <= 1);
    });

    it('high rates should give higher conversion than low rates', () => {
        const THigh = buildTransitionMatrix([0.9, 0.5, 0.6, 0.5, 0.8, 0.7]);
        const TLow = buildTransitionMatrix([0.5, 0.1, 0.1, 0.1, 0.3, 0.2]);
        const high = monteCarloMarkov(THigh, 1000);
        const low = monteCarloMarkov(TLow, 1000);
        assert.ok(high.conversionRate > low.conversionRate, `High ${high.conversionRate} should > Low ${low.conversionRate}`);
    });
});
