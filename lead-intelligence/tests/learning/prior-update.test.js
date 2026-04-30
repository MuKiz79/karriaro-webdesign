import { describe, it, expect } from 'vitest';
import {
    impliedEndCR,
    groupOutcomesByBranch,
    updateBranchPosterior,
    PRIOR_UPDATE_CONSTANTS
} from '../../src/learning/prior-update.js';

const samplePrior = {
    r: [8, 3], o: [6, 16], i: [5, 5], c: [4, 4], p: [6, 3], cl: [5, 4]
};

describe('impliedEndCR', () => {
    it('matches the product of stage means', () => {
        const cr = impliedEndCR(samplePrior);
        const expected =
            (8 / 11) * (6 / 22) * (5 / 10) * (4 / 8) * (6 / 9) * (5 / 9);
        expect(cr).toBeCloseTo(expected, 8);
    });

    it('is in (0, 1)', () => {
        const cr = impliedEndCR(samplePrior);
        expect(cr).toBeGreaterThan(0);
        expect(cr).toBeLessThan(1);
    });
});

describe('groupOutcomesByBranch', () => {
    it('groups wins and losses per branch, ignores other outcomes', () => {
        const entries = [
            { outcome: 'kunde',     branch: 'hair_salon' },
            { outcome: 'verloren',  branch: 'hair_salon' },
            { outcome: 'kein_kontakt', branch: 'hair_salon' },
            { outcome: 'kunde',     branch: 'dentist' }
        ];
        const groups = groupOutcomesByBranch(entries);
        expect(groups.hair_salon).toEqual({ wins: 1, total: 2 });
        expect(groups.dentist).toEqual({ wins: 1, total: 1 });
    });

    it('falls back to _default when branch missing', () => {
        const groups = groupOutcomesByBranch([{ outcome: 'kunde' }]);
        expect(groups._default).toEqual({ wins: 1, total: 1 });
    });
});

describe('updateBranchPosterior', () => {
    it('multiplier ≈ 1 when wins/losses match the prior ratio', () => {
        const priorMean = impliedEndCR(samplePrior);
        const total = 50;
        const wins = Math.round(total * priorMean);
        const losses = total - wins;
        const r = updateBranchPosterior(samplePrior, wins, losses);
        expect(Math.abs(r.multiplier - 1)).toBeLessThan(0.2);
    });

    it('multiplier > 1 when empirical CR exceeds prior', () => {
        const r = updateBranchPosterior(samplePrior, 25, 25); // 50% empirisch
        expect(r.multiplier).toBeGreaterThan(1);
    });

    it('multiplier < 1 when empirical CR is far below prior', () => {
        const r = updateBranchPosterior(samplePrior, 0, 50);
        expect(r.multiplier).toBeLessThan(1);
        expect(r.multiplier).toBeGreaterThanOrEqual(PRIOR_UPDATE_CONSTANTS.SHRINKAGE_FLOOR);
    });

    it('clipping is recorded for extreme deviations', () => {
        const r = updateBranchPosterior(samplePrior, 100, 0);
        expect(r.multiplier).toBeLessThanOrEqual(PRIOR_UPDATE_CONSTANTS.SHRINKAGE_CAP);
        expect(r.clipped).toBe(true);
    });

    it('posteriorStd > 0', () => {
        const r = updateBranchPosterior(samplePrior, 10, 10);
        expect(r.posteriorStd).toBeGreaterThan(0);
    });
});
