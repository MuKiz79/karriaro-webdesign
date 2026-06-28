import { describe, it, expect } from 'vitest';
import { aggregateScan, hotNestScore } from '../../src/analysis/scan-aggregate.js';

function lead(branchKey, name, opportunity, adActive, rating, reviews, primaryType) {
    return {
        branch: { key: branchKey, name },
        primaryType: primaryType || branchKey,
        opportunity, leadScore: opportunity,
        adIntent: { active: adActive, signals: adActive ? ['Google Ads'] : [] },
        rating, reviews
    };
}

describe('aggregateScan', () => {
    const leads = [
        // Makler: 3 leads, 2 werben, 2 lohnend (≥50), 1 hot (≥70)
        lead('real_estate_agency', 'Makler', 75, true, 4.8, 1200),
        lead('real_estate_agency', 'Makler', 55, true, 4.5, 300),
        lead('real_estate_agency', 'Makler', 30, false, 4.0, 40),
        // Zahnarzt: 2 leads, 0 werben, 1 lohnend
        lead('dentist', 'Zahnärzte', 60, false, 4.9, 500),
        lead('dentist', 'Zahnärzte', 20, false, 4.2, 80)
    ];

    it('gruppiert nach Branche mit korrekten Zählungen', () => {
        const { branches } = aggregateScan(leads, 'Stuttgart', 5);
        const makler = branches.find(b => b.key === 'real_estate_agency');
        expect(makler.count).toBe(3);
        expect(makler.qualified).toBe(2);   // 75, 55 ≥ 50
        expect(makler.hot).toBe(1);         // 75 ≥ 70
        expect(makler.adActive).toBe(2);
        expect(makler.adQuote).toBeCloseTo(2 / 3, 5);
        expect(makler.adWeakCount).toBe(2); // 75 & 55: werben UND ≥50
    });

    it('Median-Opportunity + Median-Reviews korrekt', () => {
        const { branches } = aggregateScan(leads, 'Stuttgart', 5);
        const makler = branches.find(b => b.key === 'real_estate_agency');
        expect(makler.medianOpportunity).toBe(55);  // median(75,55,30)
        expect(makler.medianReviews).toBe(300);      // median(1200,300,40)
        expect(makler.medianRating).toBe(4.5);
    });

    it('sortiert nach nestScore — werbender Markt schlägt nicht-werbenden bei gleicher Größe', () => {
        const a = [
            lead('gym', 'Fitness', 60, true, 4.5, 200),
            lead('gym', 'Fitness', 55, true, 4.4, 150),
            lead('bakery', 'Bäckereien', 60, false, 4.5, 200),
            lead('bakery', 'Bäckereien', 55, false, 4.4, 150)
        ];
        const { branches } = aggregateScan(a, 'X', 5);
        expect(branches[0].key).toBe('gym'); // werbend → höher
    });

    it('Saison-Fenster: gym im Dezember (Monat 11) = true, im Juni (5) = false', () => {
        const a = [lead('gym', 'Fitness', 60, true, 4.5, 200)];
        expect(aggregateScan(a, 'X', 11).branches[0].seasonalNow).toBe(true);
        expect(aggregateScan(a, 'X', 5).branches[0].seasonalNow).toBe(false);
    });

    it('Stadt-Zusammenfassung: Totale + Anzeigen-Quote', () => {
        const { summary } = aggregateScan(leads, 'Stuttgart', 5);
        expect(summary.totalLeads).toBe(5);
        expect(summary.totalQualified).toBe(3); // 75,55,60
        expect(summary.totalHot).toBe(1);       // 75
        expect(summary.adActive).toBe(2);
        expect(summary.adQuote).toBeCloseTo(2 / 5, 5);
        expect(summary.topBranches[0]).toBe('Makler');
    });

    it('leere Liste → keine Branchen, Null-Summary', () => {
        const { branches, summary } = aggregateScan([], 'X', 5);
        expect(branches).toEqual([]);
        expect(summary.totalLeads).toBe(0);
        expect(summary.adQuote).toBe(0);
    });

    it('hotNestScore steigt mit Anzeigen-Quote und wirbt+schwach-Treffern', () => {
        const low = hotNestScore({ qualified: 5, adQuote: 0, adWeakCount: 0, medianOpportunity: 60, seasonalNow: false });
        const high = hotNestScore({ qualified: 5, adQuote: 0.8, adWeakCount: 4, medianOpportunity: 60, seasonalNow: false });
        expect(high).toBeGreaterThan(low);
    });
});
