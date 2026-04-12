import { describe, it, expect } from 'vitest';
import { calculateKahneman } from '../../src/analysis/kahneman.js';

describe('calculateKahneman', () => {
    it('no SSL + no viewport = system 1 dominant', () => {
        const result = calculateKahneman(
            { isHttps: false, viewport: false, perf: 20 },
            { isBaukasten: true }, null, null, null
        );
        expect(result.system1).toBeGreaterThan(result.system2);
        expect(result.dominant).toBe('system1');
    });

    it('good website + lawyer = system 2 dominant', () => {
        const result = calculateKahneman(
            { isHttps: true, viewport: true, perf: 80, seo: 80 },
            { isBaukasten: false },
            { primaryType: 'lawyer', userRatingCount: 100 },
            { roi: 3 },
            { Ea: 50 }
        );
        expect(result.system2).toBeGreaterThanOrEqual(result.system1);
    });

    it('should return pitchStrategy', () => {
        const result = calculateKahneman({ isHttps: true, perf: 50 }, {}, null, null, null);
        expect(result.pitchStrategy).toHaveProperty('approach');
        expect(result.pitchStrategy).toHaveProperty('format');
    });

    it('system1 + system2 = 100', () => {
        const result = calculateKahneman({ isHttps: false, perf: 30 }, { isBaukasten: true }, null, { yearlyRevenueLoss: 10000 }, null);
        expect(result.system1 + result.system2).toBe(100);
    });
});
