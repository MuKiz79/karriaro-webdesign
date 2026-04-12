import { describe, it, expect } from 'vitest';
import { portfolioProbability } from '../../src/scoring/portfolio.js';
import { calculateRevenueWeighted } from '../../src/scoring/revenue-weighted.js';

describe('portfolioProbability', () => {
    it('should calculate P(at least 1 conversion)', () => {
        const leads = [
            { conversionRate: 5, leadScore: 60 },
            { conversionRate: 3, leadScore: 45 },
            { conversionRate: 1, leadScore: 20 }
        ];
        const r = portfolioProbability(leads);
        expect(r.atLeastOne).toBeGreaterThan(0);
        expect(r.atLeastOne).toBeLessThanOrEqual(100);
        expect(r.expectedConversions).toBeGreaterThan(0);
    });

    it('empty leads = 0', () => {
        const r = portfolioProbability([]);
        expect(r.atLeastOne).toBe(0);
    });
});

describe('calculateRevenueWeighted', () => {
    it('should return a number', () => {
        const r = calculateRevenueWeighted(0.05, 'dentist', 1990);
        expect(typeof r).toBe('object');
        expect(r).toHaveProperty('expectedRevenue');
    });
});
