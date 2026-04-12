import { describe, it, expect } from 'vitest';
import { calculateKelly } from '../../src/math/kelly.js';

describe('calculateKelly', () => {
    it('high CR + high deal = invest more', () => {
        const result = calculateKelly(0.10, 1990, 2);
        expect(result.optimalHours).toBeGreaterThan(1);
        expect(result.expectedValue).toBeGreaterThan(0);
    });

    it('low CR = skip', () => {
        const result = calculateKelly(0.001, 990, 2);
        expect(result.optimalHours).toBeLessThanOrEqual(0.5);
        expect(result.recommendation).toContain('Skip');
    });

    it('R0 > 1 should increase NPV', () => {
        const withR0 = calculateKelly(0.05, 990, 2, 20, 2);
        const withoutR0 = calculateKelly(0.05, 990, 2, 20, 1);
        expect(withR0.npvTotal).toBeGreaterThan(withoutR0.npvTotal);
    });

    it('kelly fraction capped at 25%', () => {
        const result = calculateKelly(0.50, 10000, 1);
        expect(result.kellyFraction).toBeLessThanOrEqual(25);
    });
});
