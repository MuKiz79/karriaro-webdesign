import { describe, it, expect } from 'vitest';
import { scoreLead } from '../../src/scoring/lead-scorer.js';

// Minimal-Mocks
const goodWebsite = { perf: 95, seo: 90, a11y: 92, isHttps: true, viewport: true, viewportMissing: false, lcp: '1.2', bp: 'best-practices' };
const badWebsite = { perf: 25, seo: 40, a11y: 35, isHttps: false, viewport: false, viewportMissing: true, lcp: '6.5', bp: 'best-practices' };
const avgWebsite = { perf: 55, seo: 65, a11y: 70, isHttps: true, viewport: true, viewportMissing: false, lcp: '3.2', bp: 'best-practices' };

const goodPlace = { primaryType: 'dentist', displayName: { text: 'Dr. Test' }, userRatingCount: 120, rating: 4.7, websiteUri: 'https://test.de', regularOpeningHours: true, primaryTypeDisplayName: { text: 'Zahnarzt' } };
const weakPlace = { primaryType: 'bakery', displayName: { text: 'Bäcker Test' }, userRatingCount: 3, rating: 3.5, websiteUri: 'https://test.de', primaryTypeDisplayName: { text: 'Bäckerei' } };

const baukastenTech = { isBaukasten: true, cms: 'Wix', version: null };
const customTech = { isBaukasten: false, cms: null, version: null };

describe('scoreLead', () => {
    it('bad website + good business = high score', () => {
        const result = scoreLead(badWebsite, baukastenTech, goodPlace, [], null);
        expect(result.leadScore).toBeGreaterThan(50);
        expect(result.conversionRate).toBeGreaterThan(0);
    });

    it('good website + good business = lower score than bad website', () => {
        const good = scoreLead(goodWebsite, customTech, goodPlace, [], null);
        const bad = scoreLead(badWebsite, baukastenTech, goodPlace, [], null);
        expect(good.leadScore).toBeLessThan(bad.leadScore);
    });

    it('bad website + no place = moderate score', () => {
        const result = scoreLead(badWebsite, baukastenTech, null, [], null);
        expect(result.leadScore).toBeGreaterThan(20);
        expect(result.leadScore).toBeLessThan(70);
    });

    it('should return all required fields', () => {
        const result = scoreLead(avgWebsite, customTech, goodPlace, [], null);
        expect(result).toHaveProperty('leadScore');
        expect(result).toHaveProperty('conversionRate');
        expect(result).toHaveProperty('ci');
        expect(result).toHaveProperty('stages');
        expect(result).toHaveProperty('bottleneck');
        expect(result).toHaveProperty('kelly');
        expect(result).toHaveProperty('survival');
        expect(result).toHaveProperty('channelResult');
        expect(result).toHaveProperty('nextAction');
        expect(result).toHaveProperty('expectedValue');
    });

    it('lead score should be between 0 and 100', () => {
        const result = scoreLead(badWebsite, baukastenTech, goodPlace, [], null);
        expect(result.leadScore).toBeGreaterThanOrEqual(0);
        expect(result.leadScore).toBeLessThanOrEqual(100);
    });

    it('CI should contain the conversion rate', () => {
        const result = scoreLead(avgWebsite, customTech, goodPlace, [], null);
        expect(result.ci.lower).toBeLessThanOrEqual(result.conversionRate);
        expect(result.ci.upper).toBeGreaterThanOrEqual(result.conversionRate);
    });

    it('should have 6 funnel stages', () => {
        const result = scoreLead(avgWebsite, customTech, goodPlace, [], null);
        expect(result.stages).toHaveLength(6);
        expect(result.stages[0]).toHaveProperty('name');
        expect(result.stages[0]).toHaveProperty('mean');
    });

    it('design quality should dampen score for good-looking sites', () => {
        const goodDesign = { designQuality: 9, designEra: 'Modern' };
        const badDesign = { designQuality: 2, designEra: '2010s' };
        // scoreLead(ws, tech, place, competitors, footprint, revenue, epidemicResult, screenshotAnalysis, contentAnalysis)
        const withGoodDesign = scoreLead(avgWebsite, customTech, goodPlace, [], null, null, null, goodDesign);
        const withBadDesign = scoreLead(avgWebsite, customTech, goodPlace, [], null, null, null, badDesign);
        expect(withBadDesign.leadScore).toBeGreaterThanOrEqual(withGoodDesign.leadScore);
    });
});
