import { describe, it, expect } from 'vitest';
import { calculateEpidemic } from '../../src/analysis/epidemic.js';

describe('calculateEpidemic', () => {
    it('no data = R0 1.0', () => {
        const r = calculateEpidemic(null, null);
        expect(r.R0).toBe(1.0);
    });

    it('many competitors = higher R0', () => {
        const place = { primaryType: 'restaurant' };
        const few = calculateEpidemic(place, [{}, {}]);
        const many = calculateEpidemic(place, [{},{},{},{},{},{},{},{},{},{}]);
        expect(many.R0).toBeGreaterThan(few.R0);
    });

    it('R0 > 1 should be possible with enough competitors', () => {
        const r = calculateEpidemic(
            { primaryType: 'restaurant' },
            Array(10).fill({})
        );
        expect(r.R0).toBeGreaterThan(1);
        expect(r.isEpidemic).toBe(true);
    });

    it('should return cluster type', () => {
        const r = calculateEpidemic({ primaryType: 'restaurant' }, [{}]);
        expect(r.clusterType).toBeTruthy();
    });
});
