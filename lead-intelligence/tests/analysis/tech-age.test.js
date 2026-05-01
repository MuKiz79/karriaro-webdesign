import { describe, it, expect } from 'vitest';
import { analyzeTechAge } from '../../src/analysis/tech-age.js';

describe('analyzeTechAge', () => {
    it('flags WordPress 4.x as EOL with high severity', () => {
        const r = analyzeTechAge(
            { cms: 'WordPress', version: '4.9.18', isBaukasten: false },
            { yearsSince: 4, domainAgeYears: 8, firstSeen: '2017-03-12', lastChanged: '2021-06-01' }
        );
        expect(r.cmsEolYear).toBe(2022);
        expect(r.techSeverity).toBe(5);
        expect(r.severity).toBe(5);
        expect(r.pitchArg).toMatch(/WordPress 4/);
    });

    it('keeps current WordPress 6.x at low severity', () => {
        const r = analyzeTechAge(
            { cms: 'WordPress', version: '6.4.2', isBaukasten: false },
            { yearsSince: 0.3, domainAgeYears: 5 }
        );
        expect(r.cmsEolYear).toBe(null);
        expect(r.techSeverity).toBeLessThanOrEqual(2);
        expect(r.era).toBe('modern');
    });

    it('flags Baukasten regardless of age', () => {
        const r = analyzeTechAge(
            { cms: 'Wix', version: null, isBaukasten: true },
            { yearsSince: 0.5, domainAgeYears: 2 }
        );
        expect(r.isBaukasten).toBe(true);
        expect(r.techStackVerdict).toMatch(/Baukasten/);
        expect(r.techSeverity).toBeGreaterThanOrEqual(3);
    });

    it('handles missing wayback data gracefully', () => {
        const r = analyzeTechAge(
            { cms: 'WordPress', version: '6.4.0', isBaukasten: false },
            {}
        );
        expect(r.era).toBe('unknown');
        expect(r.eraSeverity).toBe(0);
    });

    it('produces a strong pitchArg when both EOL and abandoned', () => {
        const r = analyzeTechAge(
            { cms: 'WordPress', version: '4.5.0', isBaukasten: false },
            { yearsSince: 6, domainAgeYears: 10, firstSeen: '2014-05-01', lastChanged: '2019-08-01' }
        );
        expect(r.pitchArg).toMatch(/Sicherheitsupdates/);
    });

    it('headline reflects severity', () => {
        const high = analyzeTechAge(
            { cms: 'WordPress', version: '4.0', isBaukasten: false },
            { yearsSince: 5 }
        );
        const low = analyzeTechAge(
            { cms: 'WordPress', version: '6.4', isBaukasten: false },
            { yearsSince: 0.2 }
        );
        expect(high.headline).toMatch(/⚠/);
        expect(low.headline).not.toMatch(/⚠/);
    });
});
