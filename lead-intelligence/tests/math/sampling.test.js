import { describe, it, expect } from 'vitest';
import { sampleBeta, sampleGamma, wilsonCI, randn } from '../../src/math/sampling.js';

describe('sampleBeta', () => {
    it('should return values between 0 and 1', () => {
        for (let i = 0; i < 100; i++) {
            const v = sampleBeta(5, 5);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    it('mean should converge to a/(a+b)', () => {
        const a = 8, b = 12;
        const expected = a / (a + b);
        let sum = 0;
        const N = 10000;
        for (let i = 0; i < N; i++) sum += sampleBeta(a, b);
        const mean = sum / N;
        expect(Math.abs(mean - expected)).toBeLessThan(0.02);
    });

    it('should handle edge cases', () => {
        expect(sampleBeta(0.5, 0.5)).toBeGreaterThanOrEqual(0);
        expect(sampleBeta(100, 100)).toBeGreaterThanOrEqual(0);
        expect(typeof sampleBeta(0, 5)).toBe('number');
    });
});

describe('sampleGamma', () => {
    it('should return positive values', () => {
        for (let i = 0; i < 100; i++) {
            expect(sampleGamma(2)).toBeGreaterThan(0);
            expect(sampleGamma(0.5)).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('wilsonCI', () => {
    it('should contain the true proportion', () => {
        const ci = wilsonCI(50, 1000);
        expect(ci.lower).toBeLessThan(0.05);
        expect(ci.upper).toBeGreaterThan(0.05);
    });

    it('should be wider for small N', () => {
        const small = wilsonCI(1, 20);
        const large = wilsonCI(50, 1000);
        expect(small.upper - small.lower).toBeGreaterThan(large.upper - large.lower);
    });

    it('should handle zero successes', () => {
        const ci = wilsonCI(0, 100);
        expect(ci.lower).toBe(0);
        expect(ci.upper).toBeGreaterThan(0);
    });
});

describe('randn', () => {
    it('should have mean ~0', () => {
        let sum = 0;
        const N = 10000;
        for (let i = 0; i < N; i++) sum += randn();
        expect(Math.abs(sum / N)).toBeLessThan(0.05);
    });
});
