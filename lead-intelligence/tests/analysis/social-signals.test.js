import { describe, it, expect } from 'vitest';
import { analyzeSocialSignals } from '../../src/analysis/social-signals.js';

describe('analyzeSocialSignals', () => {
    it('no place = not available', () => {
        const result = analyzeSocialSignals(null);
        expect(result.available).toBe(false);
    });

    it('active owner with replies = high score', () => {
        const result = analyzeSocialSignals({
            reviews: [
                { rating: 5, publishTime: new Date().toISOString(), ownerResponse: 'Danke!' },
                { rating: 4, publishTime: new Date().toISOString(), ownerResponse: 'Vielen Dank' },
                { rating: 5, publishTime: new Date(Date.now() - 3*86400000).toISOString(), ownerResponse: 'Freut uns' },
            ],
            photos: Array(12).fill({}),
            websiteUri: 'https://test.de',
            regularOpeningHours: true,
            internationalPhoneNumber: '+49123',
            formattedAddress: 'Teststr. 1',
            primaryType: 'dentist',
            displayName: { text: 'Test' }
        });
        expect(result.available).toBe(true);
        expect(result.score).toBeGreaterThan(10);
        expect(result.ownerReplyRate.rate).toBe(100);
        expect(result.photoSignal.count).toBe(12);
    });

    it('no replies + few photos = low score', () => {
        const result = analyzeSocialSignals({
            reviews: [
                { rating: 3, publishTime: new Date(Date.now() - 200*86400000).toISOString() },
                { rating: 2, publishTime: new Date(Date.now() - 250*86400000).toISOString() },
            ],
            photos: [{}],
            displayName: { text: 'Test' }
        });
        expect(result.score).toBeLessThan(5);
    });

    it('declining reviews = detected', () => {
        const result = analyzeSocialSignals({
            reviews: [
                { rating: 2, publishTime: new Date().toISOString() },
                { rating: 3, publishTime: new Date(Date.now() - 30*86400000).toISOString() },
                { rating: 5, publishTime: new Date(Date.now() - 200*86400000).toISOString() },
                { rating: 5, publishTime: new Date(Date.now() - 300*86400000).toISOString() },
            ],
            displayName: { text: 'Test' }
        });
        expect(result.reviewTrend).toBeTruthy();
        expect(result.reviewTrend.direction).toBe('fallend');
    });

    it('GBP completeness should detect missing fields', () => {
        const result = analyzeSocialSignals({
            displayName: { text: 'Test' },
            primaryType: 'dentist',
            reviews: [{ rating: 5, publishTime: new Date().toISOString() }]
            // Missing: websiteUri, regularOpeningHours, phone, address, photos
        });
        expect(result.gbpCompleteness.completeness).toBeLessThan(60);
        expect(result.gbpCompleteness.missingFields.length).toBeGreaterThan(3);
    });
});
