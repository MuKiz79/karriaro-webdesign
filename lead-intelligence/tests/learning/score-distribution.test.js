import { describe, it, expect } from 'vitest';
import {
    histogram,
    mannWhitneyU,
    inflationSnapshot,
    inflationVsCalibration,
    SCORE_LOG_CONSTANTS
} from '../../src/learning/score-distribution.js';

describe('histogram', () => {
    it('default bins partition 0..100 with binSize 10', () => {
        const h = histogram([5, 15, 95]);
        expect(h).toHaveLength(10);
        expect(h[0].count).toBe(1);
        expect(h[1].count).toBe(1);
        expect(h[9].count).toBe(1);
    });
});

describe('mannWhitneyU', () => {
    it('returns null on empty input', () => {
        expect(mannWhitneyU([], [1, 2])).toBe(null);
    });

    it('detects a clear shift', () => {
        const A = [10, 12, 11, 13, 14, 15, 9, 11, 12, 14];
        const B = [60, 62, 58, 64, 61, 63, 65, 59, 60, 62];
        const r = mannWhitneyU(A, B);
        expect(r.p).toBeLessThan(0.05);
    });

    it('returns p ≈ 1 for identical samples', () => {
        const A = [10, 20, 30, 40, 50];
        const B = [10, 20, 30, 40, 50];
        const r = mannWhitneyU(A, B);
        expect(r.p).toBeGreaterThan(0.5);
    });
});

function makeLog(now, scoresByDay) {
    // scoresByDay: {-7: [scores...], -1: [scores...], ...}
    const log = [];
    for (const [days, scores] of Object.entries(scoresByDay)) {
        const ts = now - Math.abs(parseInt(days)) * SCORE_LOG_CONSTANTS.MS_PER_DAY;
        for (const s of scores) log.push({ ts, score: s, branch: '_default' });
    }
    return log;
}

describe('inflationSnapshot', () => {
    it('reports unavailable below MIN_N', () => {
        const now = Date.now();
        const log = makeLog(now, { '-1': [50, 60], '-15': [40, 45] });
        const snap = inflationSnapshot(14, now, log);
        expect(snap.available).toBe(false);
    });

    it('detects a real upward shift in the median', () => {
        const now = Date.now();
        const day = SCORE_LOG_CONSTANTS.MS_PER_DAY;
        // Aktuelles Fenster: [now-14d, now]      — 40 Scores um 70
        // Vorperiode:        [now-28d, now-14d) — 40 Scores um 40
        const log = [];
        for (let i = 0; i < 40; i++) {
            log.push({ ts: now - (1 + (i % 13)) * day, score: 68 + (i % 5), branch: '_default' });
        }
        for (let i = 0; i < 40; i++) {
            log.push({ ts: now - (15 + (i % 13)) * day, score: 38 + (i % 5), branch: '_default' });
        }
        const snap = inflationSnapshot(14, now, log);
        expect(snap.available).toBe(true);
        expect(snap.medianShift).toBeGreaterThan(0);
        expect(snap.mannWhitney.p).toBeLessThan(0.05);
    });
});

describe('inflationVsCalibration', () => {
    it('flags inflation when scores rise without empirical backing', () => {
        const inflation = { available: true, medianShift: 10 };
        const calibration = {
            available: true,
            calibrationInTheLarge: { bias: 0.05 }
        };
        const r = inflationVsCalibration(inflation, calibration);
        expect(r.verdict).toMatch(/Inflation bestätigt/);
    });

    it('passes when scores rise but calibration is stable', () => {
        const inflation = { available: true, medianShift: 10 };
        const calibration = {
            available: true,
            calibrationInTheLarge: { bias: 0.0 }
        };
        const r = inflationVsCalibration(inflation, calibration);
        expect(r.verdict).toMatch(/echte Lead-Verbesserung/);
    });
});
