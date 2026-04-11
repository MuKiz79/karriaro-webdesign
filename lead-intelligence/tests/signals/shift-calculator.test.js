import { describe, it, expect } from 'vitest';
import { calculateShifts } from '../../src/signals/shift-calculator.js';

const badWs = { perf: 25, seo: 40, a11y: 35, isHttps: false, viewport: false, viewportMissing: true };
const goodWs = { perf: 95, seo: 90, a11y: 92, isHttps: true, viewport: true, viewportMissing: false };
const avgWs = { perf: 55, seo: 65, a11y: 70, isHttps: true, viewport: true, viewportMissing: false };

const baukasten = { isBaukasten: true, cms: 'Wix', version: null };
const custom = { isBaukasten: false, cms: null, version: null };
const goodPlace = { userRatingCount: 120, rating: 4.7, websiteUri: 'https://test.de', regularOpeningHours: true, displayName: { text: 'Test' } };

describe('calculateShifts', () => {
    it('bad website should have positive interest shifts', () => {
        const s = calculateShifts(badWs, baukasten, goodPlace, [], null, null);
        expect(s.interest[0]).toBeGreaterThan(5);
    });

    it('good website should have low interest shifts', () => {
        const s = calculateShifts(goodWs, custom, goodPlace, [], null, null);
        expect(s.interest[0]).toBeLessThan(5);
    });

    it('no SSL should boost interest significantly', () => {
        const withSSL = calculateShifts({ ...avgWs, isHttps: true }, custom, goodPlace, [], null, null);
        const noSSL = calculateShifts({ ...avgWs, isHttps: false }, custom, goodPlace, [], null, null);
        expect(noSSL.interest[0]).toBeGreaterThan(withSSL.interest[0]);
    });

    it('baukasten should boost interest and close', () => {
        const withBk = calculateShifts(avgWs, baukasten, goodPlace, [], null, null);
        const withoutBk = calculateShifts(avgWs, custom, goodPlace, [], null, null);
        expect(withBk.interest[0]).toBeGreaterThan(withoutBk.interest[0]);
        expect(withBk.close[0]).toBeGreaterThan(withoutBk.close[0]);
    });

    it('good design should dampen performance shifts', () => {
        const goodDesign = { designQuality: 9 };
        const badDesign = { designQuality: 2 };
        const dampened = calculateShifts(badWs, custom, goodPlace, [], null, null, goodDesign);
        const amplified = calculateShifts(badWs, custom, goodPlace, [], null, null, badDesign);
        expect(amplified.interest[0]).toBeGreaterThan(dampened.interest[0]);
    });

    it('visually good website should get negative interest shifts', () => {
        const s = calculateShifts(goodWs, custom, goodPlace, [], null, null, { designQuality: 8 });
        expect(s.interest[1]).toBeGreaterThan(0);
    });

    it('should return all 5 shift pairs', () => {
        const s = calculateShifts(avgWs, custom, null, [], null, null);
        expect(s).toHaveProperty('reach');
        expect(s).toHaveProperty('open');
        expect(s).toHaveProperty('interest');
        expect(s).toHaveProperty('convo');
        expect(s).toHaveProperty('close');
        for (const key of ['reach', 'open', 'interest', 'convo', 'close']) {
            expect(s[key]).toHaveLength(2);
        }
    });
});
