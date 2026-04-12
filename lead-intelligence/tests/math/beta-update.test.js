import { describe, it, expect } from 'vitest';
import { conjugateUpdate, betaMean, betaVariance, betaMode } from '../../src/math/beta-update.js';

describe('conjugateUpdate', () => {
    it('positive shift increases alpha', () => {
        const [a, b] = conjugateUpdate([5, 5], 4);
        expect(a).toBeGreaterThan(5);
        expect(b).toBe(5); // negative shift=0 → beta unchanged
    });

    it('negative shift increases beta', () => {
        const [a, b] = conjugateUpdate([5, 5], -3);
        expect(a).toBe(5);
        expect(b).toBeGreaterThan(5);
    });

    it('shift is damped by 0.5', () => {
        const [a] = conjugateUpdate([5, 5], 4);
        expect(a).toBe(7); // 5 + 4*0.5 = 7
    });

    it('alpha and beta never below 1', () => {
        const [a, b] = conjugateUpdate([1, 1], -100);
        expect(a).toBeGreaterThanOrEqual(1);
        expect(b).toBeGreaterThanOrEqual(1);
    });
});

describe('betaMean', () => {
    it('symmetric → 0.5', () => expect(betaMean(5, 5)).toBe(0.5));
    it('skewed → correct', () => expect(betaMean(8, 2)).toBe(0.8));
});

describe('betaVariance', () => {
    it('higher a+b → lower variance', () => {
        expect(betaVariance(50, 50)).toBeLessThan(betaVariance(5, 5));
    });
});

describe('betaMode', () => {
    it('symmetric → 0.5', () => expect(betaMode(5, 5)).toBe(0.5));
    it('skewed → correct', () => expect(betaMode(8, 2)).toBeCloseTo(0.875, 2));
});
