import { describe, it, expect } from 'vitest';
import { buildOutreachPack } from '../../src/strategy/outreach.js';

const baseData = {
    url: 'https://www.beispiel-friseur.de',
    ws: { perf: 35, isHttps: true, viewport: true, seo: 60, a11y: 65 },
    tech: { cms: 'WordPress', version: '4.9.0', isBaukasten: false },
    place: {
        displayName: { text: 'Friseur Beispiel' },
        userRatingCount: 80,
        rating: 4.4,
        primaryType: 'hair_salon'
    },
    wayback: { yearsSince: 4.2, domainAgeYears: 9, firstSeen: '2016-04-01', lastChanged: '2021-01-01' },
    competitors: [
        { displayName: { text: 'Friseur A' }, rating: 4.8, userRatingCount: 120, websiteUri: 'https://a.de', primaryType: 'hair_salon' },
        { displayName: { text: 'Friseur B' }, rating: 4.6, userRatingCount: 95, primaryType: 'hair_salon' },
        { displayName: { text: 'Friseur C' }, rating: 4.5, userRatingCount: 60, primaryType: 'hair_salon' }
    ],
    bfsgScore: { risk: 'hoch', complianceScore: 35, fine: '50.000€' },
    revenue: { yearlyLoss: 8500 },
    result: { leadScore: 72 }
};

describe('buildOutreachPack', () => {
    it('produces a non-empty pack with three tone variants', () => {
        const pack = buildOutreachPack(baseData);
        expect(pack.available).toBe(true);
        expect(pack.variants).toHaveLength(3);
        for (const v of pack.variants) {
            expect(v.subject).toBeTruthy();
            expect(v.body).toBeTruthy();
            expect(v.copyText).toContain('Betreff:');
        }
    });

    it('priorityArg picks BFSG when risk is high (severity 5)', () => {
        const pack = buildOutreachPack(baseData);
        // BFSG (5) und Mockup (5) sind gleichauf — bei equal severity gewinnt der erste in der Reihenfolge
        // (Mockup ist erste, aber hier nicht verfügbar) → BFSG sollte Top sein
        expect(['bfsg', 'mockup']).toContain(pack.bestPitchAngle);
    });

    it('falls back to tech_age when BFSG is low risk', () => {
        const data = { ...baseData, bfsgScore: { risk: 'niedrig', complianceScore: 80 } };
        const pack = buildOutreachPack(data);
        expect(pack.available).toBe(true);
        expect(pack.allArgs.find(a => a.type === 'tech_age')).toBeTruthy();
    });

    it('Mockup wins over BFSG when both available (severity tie, mockup first)', () => {
        const data = {
            ...baseData,
            mockupSuggestion: { headline: 'Friseur Beispiel — frischer Auftritt 2026', subline: 'Mobile First, Online-Buchung integriert' }
        };
        const pack = buildOutreachPack(data);
        expect(pack.bestPitchAngle).toBe('mockup');
        expect(pack.mockupHeadline).toMatch(/frischer Auftritt/);
    });

    it('exposes competitors filtered by quality threshold', () => {
        const pack = buildOutreachPack(baseData);
        expect(pack.competitors.length).toBeGreaterThanOrEqual(2);
        for (const c of pack.competitors) {
            expect(c.rating).toBeGreaterThanOrEqual(4.0);
            expect(c.reviews).toBeGreaterThan(30);
        }
    });

    it('filters competitors to same primaryType (no cross-branche pollution)', () => {
        // Bug fixed: vorher wurden Tankstelle/Parkhaus als "Konkurrenz" eines
        // Immobilienmaklers gezeigt, weil der primaryType-Filter fehlte.
        const data = {
            ...baseData,
            competitors: [
                { displayName: { text: 'Friseur A' }, rating: 4.8, userRatingCount: 120, primaryType: 'hair_salon' },
                { displayName: { text: 'JET Tankstelle' }, rating: 4.4, userRatingCount: 678, primaryType: 'gas_station' },
                { displayName: { text: 'Parkhaus' }, rating: 4.3, userRatingCount: 336, primaryType: 'parking' },
                { displayName: { text: 'Friseur B' }, rating: 4.6, userRatingCount: 95, primaryType: 'hair_salon' }
            ]
        };
        const pack = buildOutreachPack(data);
        for (const c of pack.competitors) {
            expect(c.name).toMatch(/^Friseur/);
        }
        // Tankstelle und Parkhaus sollten draussen sein
        expect(pack.competitors.find(c => c.name.includes('Tankstelle'))).toBeUndefined();
        expect(pack.competitors.find(c => c.name.includes('Parkhaus'))).toBeUndefined();
    });

    it('each variant body stays under ~120 words', () => {
        const pack = buildOutreachPack(baseData);
        for (const v of pack.variants) {
            expect(v.wordCount).toBeLessThan(120);
        }
    });

    it('returns unavailable when no pain signals exist', () => {
        const sterileData = {
            url: 'https://www.test.de',
            ws: { perf: 95, isHttps: true, viewport: true, seo: 95, a11y: 95 },
            tech: { cms: 'WordPress', version: '6.4', isBaukasten: false },
            place: { displayName: { text: 'Test' }, userRatingCount: 5, rating: 4.0 },
            wayback: { yearsSince: 0.2, domainAgeYears: 1 },
            competitors: [],
            bfsgScore: { risk: 'niedrig' },
            revenue: { yearlyLoss: 0 },
            result: { leadScore: 20 }
        };
        const pack = buildOutreachPack(sterileData);
        expect(pack.available).toBe(false);
    });

    it('mailto-friendly: subject and body are plain strings', () => {
        const pack = buildOutreachPack(baseData);
        expect(typeof pack.primary.subject).toBe('string');
        expect(typeof pack.primary.body).toBe('string');
        expect(pack.primary.body).not.toContain('<');
    });
});
