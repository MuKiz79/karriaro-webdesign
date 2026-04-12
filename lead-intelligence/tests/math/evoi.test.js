import { describe, it, expect } from 'vitest';
import { calculateEVOI } from '../../src/math/evoi.js';

describe('calculateEVOI', () => {
    it('low completeness near threshold = research worthwhile', () => {
        const result = calculateEVOI(0.03, 1990, 0.3);
        expect(result.pDecisionChange).toBeGreaterThan(10);
    });

    it('high completeness = sofort entscheiden', () => {
        const result = calculateEVOI(0.05, 990, 0.95);
        expect(result.recommendation).toContain('Sofort');
    });

    it('should return numeric EVOI', () => {
        const result = calculateEVOI(0.03, 1990, 0.5);
        expect(typeof result.evoi).toBe('number');
        expect(typeof result.researchCost).toBe('number');
    });
});
