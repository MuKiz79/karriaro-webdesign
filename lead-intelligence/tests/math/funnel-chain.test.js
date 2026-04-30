import { describe, it, expect } from 'vitest';
import {
    dampedForwardRates,
    conversionRateAnalytic,
    conditionalPassRates,
    reachProbabilities,
    runFunnelSimulation,
    scoreFromConversionRate
} from '../../src/math/funnel-chain.js';

describe('dampedForwardRates', () => {
    it('returns 6 rates clipped to [0.01, 1]', () => {
        const rates = dampedForwardRates([0.8, 0.3, 0.4, 0.35, 0.6, 0.5]);
        expect(rates).toHaveLength(6);
        for (const r of rates) {
            expect(r).toBeGreaterThanOrEqual(0.01);
            expect(r).toBeLessThanOrEqual(1);
        }
    });

    it('higher Ea reduces forward rates', () => {
        const low = dampedForwardRates([0.8, 0.3, 0.4, 0.35, 0.6, 0.5], 20);
        const high = dampedForwardRates([0.8, 0.3, 0.4, 0.35, 0.6, 0.5], 70);
        expect(high[2]).toBeLessThan(low[2]);
    });

    it('seasonFactor only affects stage 2 (open)', () => {
        const base = dampedForwardRates([0.8, 0.3, 0.4, 0.35, 0.6, 0.5], 40, 1.0);
        const peak = dampedForwardRates([0.8, 0.3, 0.4, 0.35, 0.6, 0.5], 40, 1.2);
        expect(peak[1]).toBeGreaterThan(base[1]);
        expect(peak[0]).toBeCloseTo(base[0], 6);
        expect(peak[2]).toBeCloseTo(base[2], 6);
    });
});

describe('conversionRateAnalytic', () => {
    it('agrees with manual product of dampened rates', () => {
        const rates = [0.9, 0.4, 0.5, 0.4, 0.6, 0.5];
        const f = dampedForwardRates(rates);
        const cr = conversionRateAnalytic(rates);
        const expected = f[0] * f[1] * f[2] * f[3] * f[4];
        expect(cr).toBeCloseTo(expected, 10);
    });

    it('higher input rates produce higher CR', () => {
        const high = conversionRateAnalytic([0.95, 0.5, 0.6, 0.5, 0.8, 0.7]);
        const low = conversionRateAnalytic([0.5, 0.1, 0.1, 0.1, 0.3, 0.2]);
        expect(high).toBeGreaterThan(low);
    });
});

describe('conditionalPassRates', () => {
    it('matches the first 5 dampened forward rates', () => {
        const rates = [0.8, 0.3, 0.4, 0.35, 0.6, 0.5];
        const cond = conditionalPassRates(rates);
        const fwd = dampedForwardRates(rates).slice(0, 5);
        expect(cond).toEqual(fwd);
    });
});

describe('reachProbabilities', () => {
    it('starts at 1 and is monotone non-increasing', () => {
        const rates = [0.8, 0.3, 0.4, 0.35, 0.6, 0.5];
        const reach = reachProbabilities(rates);
        expect(reach[0]).toBe(1);
        for (let i = 1; i < reach.length; i++) {
            expect(reach[i]).toBeLessThanOrEqual(reach[i - 1]);
        }
    });
});

describe('runFunnelSimulation', () => {
    const stages = [
        { name: 'Erreichbarkeit', alpha: 8,  beta: 3 },
        { name: 'Oeffnung',       alpha: 6,  beta: 16 },
        { name: 'Interesse',      alpha: 5,  beta: 5 },
        { name: 'Gespraech',      alpha: 4,  beta: 4 },
        { name: 'Angebot',        alpha: 6,  beta: 3 },
        { name: 'Abschluss',      alpha: 5,  beta: 4 }
    ];

    it('returns CR in [0, 1]', () => {
        const r = runFunnelSimulation(stages, 40, 1.0, 500);
        expect(r.conversionRate).toBeGreaterThanOrEqual(0);
        expect(r.conversionRate).toBeLessThanOrEqual(1);
    });

    it('Wilson CI brackets the point estimate', () => {
        const r = runFunnelSimulation(stages, 40, 1.0, 500);
        expect(r.ci.lower / 100).toBeLessThanOrEqual(r.conversionRate + 0.01);
        expect(r.ci.upper / 100).toBeGreaterThanOrEqual(r.conversionRate - 0.01);
    });

    it('conditionalPassRate per stage is in [0, 100]', () => {
        const r = runFunnelSimulation(stages, 40, 1.0, 500);
        for (const s of r.stageResults.slice(0, 5)) {
            expect(s.conditionalPassRate).toBeGreaterThanOrEqual(0);
            expect(s.conditionalPassRate).toBeLessThanOrEqual(100);
        }
    });

    it('method tag is sequential-bernoulli', () => {
        const r = runFunnelSimulation(stages, 40, 1.0, 200);
        expect(r.method).toBe('sequential-bernoulli');
    });

    it('higher Ea reduces conversion rate', () => {
        const easy = runFunnelSimulation(stages, 10, 1.0, 1000);
        const hard = runFunnelSimulation(stages, 70, 1.0, 1000);
        expect(easy.conversionRate).toBeGreaterThan(hard.conversionRate);
    });
});

describe('scoreFromConversionRate', () => {
    it('monotone increasing', () => {
        let prev = -1;
        for (const cr of [0, 0.005, 0.01, 0.03, 0.06, 0.10, 0.15]) {
            const s = scoreFromConversionRate(cr);
            expect(s).toBeGreaterThanOrEqual(prev);
            prev = s;
        }
    });

    it('caps at 100', () => {
        expect(scoreFromConversionRate(1.0)).toBeLessThanOrEqual(100);
    });

    it('returns 0 for cr <= 0', () => {
        expect(scoreFromConversionRate(0)).toBe(0);
        expect(scoreFromConversionRate(-1)).toBe(0);
    });
});
