import { describe, it, expect } from 'vitest';
import { calculateRevenueLoss } from '../../src/math/revenue-model.js';

describe('calculateRevenueLoss', () => {
    it('bad website = higher loss', () => {
        const r = calculateRevenueLoss(
            { perf: 25, seo: 40, a11y: 35, isHttps: false, viewport: false, lcp: '6.5' },
            { primaryType: 'dentist', userRatingCount: 100 }
        );
        expect(r.yearlyLoss).toBeGreaterThan(0);
        expect(r.roi).toBeGreaterThan(0);
    });

    it('good website = low loss', () => {
        const r = calculateRevenueLoss(
            { perf: 95, seo: 90, a11y: 92, isHttps: true, viewport: true, lcp: '1.0' },
            { primaryType: 'dentist', userRatingCount: 50 }
        );
        expect(r.yearlyLoss).toBeLessThan(15000); // Good site still has some loss from visitors
    });

    it('MC interval should be ordered', () => {
        const r = calculateRevenueLoss(
            { perf: 40, seo: 50, a11y: 60, isHttps: true, viewport: true, lcp: '4.0' },
            { primaryType: 'restaurant', userRatingCount: 30 }
        );
        expect(r.yearlyLow).toBeLessThanOrEqual(r.yearlyLoss);
        expect(r.yearlyHigh).toBeGreaterThanOrEqual(r.yearlyLoss);
    });

    it('no place = uses default', () => {
        const r = calculateRevenueLoss(
            { perf: 50, seo: 60, a11y: 70, isHttps: true, viewport: true, lcp: '3.0' },
            null
        );
        expect(r).toHaveProperty('yearlyLoss');
        expect(r).toHaveProperty('estMonthlyVisitors');
    });
});
