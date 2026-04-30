import { describe, it, expect } from 'vitest';
import {
    filterWindow,
    driftForBranch,
    driftAllBranches,
    DRIFT_CONSTANTS
} from '../../src/learning/drift-monitor.js';

const priorTable = {
    // Implied End-CR ≈ 2.84 %
    'hair_salon': { r: [9, 3], o: [5, 15], i: [5, 3], c: [6, 4], p: [8, 3], cl: [5, 4] },
    '_default':   { r: [8, 3], o: [6, 16], i: [5, 5], c: [4, 4], p: [6, 3], cl: [5, 4] },
    // Synthetisch: Implied End-CR ≈ 53 % — geeignet für "0/30 unter Prior"-Test
    'high_prior': { r: [9, 1], o: [9, 1], i: [9, 1], c: [9, 1], p: [9, 1], cl: [9, 1] }
};

function entry(branch, outcome, daysAgo = 0) {
    return { branch, outcome, timestamp: Date.now() - daysAgo * DRIFT_CONSTANTS.MS_PER_DAY };
}

describe('filterWindow', () => {
    it('excludes entries outside the window', () => {
        const entries = [
            entry('a', 'kunde', 1),
            entry('b', 'kunde', 100)
        ];
        const r = filterWindow(entries, 90);
        expect(r).toHaveLength(1);
        expect(r[0].branch).toBe('a');
    });
});

describe('driftForBranch', () => {
    it('flags below-MIN_N as unavailable', () => {
        const r = driftForBranch('hair_salon', priorTable.hair_salon, [entry('hair_salon', 'kunde')]);
        expect(r.available).toBe(false);
    });

    it('does not flag drift when empirical matches prior', () => {
        // Prior ≈ 2.84 % → ~1 Win in 30 Outcomes
        const outcomes = [];
        for (let i = 0; i < 30; i++) outcomes.push(entry('hair_salon', i < 1 ? 'kunde' : 'verloren'));
        const r = driftForBranch('hair_salon', priorTable.hair_salon, outcomes);
        expect(r.available).toBe(true);
        expect(r.priorOutsideCI).toBe(false);
    });

    it('flags drift when empirical is dramatically above prior', () => {
        const outcomes = [];
        for (let i = 0; i < 30; i++) outcomes.push(entry('hair_salon', 'kunde'));
        const r = driftForBranch('hair_salon', priorTable.hair_salon, outcomes);
        expect(r.priorOutsideCI).toBe(true);
        expect(r.direction).toBe('über');
    });

    it('flags drift when empirical is dramatically below prior', () => {
        // Synthetisch hoher Prior → 0/30 ist Wilson-CI [0, ~11.4%] — klar drunter
        const outcomes = [];
        for (let i = 0; i < 30; i++) outcomes.push(entry('high_prior', 'verloren'));
        const r = driftForBranch('high_prior', priorTable.high_prior, outcomes);
        expect(r.priorOutsideCI).toBe(true);
        expect(r.direction).toBe('unter');
    });
});

describe('driftAllBranches', () => {
    it('returns only branches with sufficient data, sorted with flagged first', () => {
        const entries = [];
        // 30x hair_salon, alle gewonnen → garantiert geflaggt
        for (let i = 0; i < 30; i++) entries.push(entry('hair_salon', 'kunde'));
        // 10x dentist (zu wenig)
        for (let i = 0; i < 10; i++) entries.push(entry('dentist', 'kunde'));

        const r = driftAllBranches(entries, priorTable);
        const hair = r.results.find(x => x.branch === 'hair_salon');
        expect(hair?.available).toBe(true);
        expect(r.flaggedCount).toBeGreaterThanOrEqual(1);
        expect(r.results[0].priorOutsideCI).toBe(true);
    });
});
