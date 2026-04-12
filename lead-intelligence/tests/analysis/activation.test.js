import { describe, it, expect } from 'vitest';
import { calculateActivation } from '../../src/analysis/activation.js';

describe('calculateActivation', () => {
    it('good website = high Ea (hard to activate)', () => {
        const r = calculateActivation(
            { perf: 90, isHttps: true, viewport: true, a11y: 95 },
            { isBaukasten: false }, { userRatingCount: 50 }, [], null
        );
        expect(r.Ea).toBeGreaterThan(50);
    });

    it('bad website = low Ea (easy to activate)', () => {
        const r = calculateActivation(
            { perf: 20, isHttps: false, viewport: false, a11y: 30 },
            { isBaukasten: true }, null, [], { yearlyRevenueLoss: 15000 }
        );
        expect(r.Ea).toBeLessThan(30);
    });

    it('should return catalysts', () => {
        const r = calculateActivation(
            { perf: 40, isHttps: false, viewport: true, a11y: 60 },
            { isBaukasten: false }, null, [], null
        );
        expect(r.catalysts.length).toBeGreaterThan(0);
        expect(r.bestCatalyst).toHaveProperty('name');
    });

    it('catalyst should reduce Ea', () => {
        const r = calculateActivation(
            { perf: 40, isHttps: false, viewport: true }, {}, null, [], null
        );
        expect(r.EaWithCatalyst).toBeLessThan(r.Ea);
    });

    it('speedup should be >= 1', () => {
        const r = calculateActivation({ perf: 50, isHttps: true, viewport: true }, {}, null, [], null);
        expect(r.speedup).toBeGreaterThanOrEqual(1);
    });
});
