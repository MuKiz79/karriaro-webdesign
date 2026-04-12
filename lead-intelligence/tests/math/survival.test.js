import { describe, it, expect } from 'vitest';
import { estimateSurvival } from '../../src/math/survival.js';

describe('estimateSurvival', () => {
    it('high score = shorter median', () => {
        const high = estimateSurvival('dentist', 80);
        const low = estimateSurvival('dentist', 20);
        expect(high.medianDays).toBeLessThan(low.medianDays);
    });

    it('survival decreases over time', () => {
        const result = estimateSurvival('_default', 50);
        expect(result.survival7d).toBeGreaterThan(result.survival14d);
        expect(result.survival14d).toBeGreaterThan(result.survival30d);
    });

    it('should have Weibull k > 1', () => {
        const result = estimateSurvival('hair_salon', 60);
        expect(result.weibullK).toBeGreaterThan(1);
    });

    it('giveUpAfter should be ~2.5× median', () => {
        const result = estimateSurvival('_default', 50);
        expect(result.giveUpAfter).toBeCloseTo(result.medianDays * 2.5, 0);
    });

    it('different branches have different medians', () => {
        const dentist = estimateSurvival('dentist', 50);
        const bakery = estimateSurvival('bakery', 50);
        expect(dentist.medianDays).not.toBe(bakery.medianDays);
    });
});
