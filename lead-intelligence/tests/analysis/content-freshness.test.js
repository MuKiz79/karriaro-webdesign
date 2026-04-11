import { describe, it, expect } from 'vitest';
import { analyzeContentFreshness } from '../../src/analysis/content-freshness.js';

describe('analyzeContentFreshness', () => {
    it('old copyright + old wayback = aufgegeben', () => {
        const result = analyzeContentFreshness(
            { lighthouseResult: { audits: { 'network-requests': { details: { items: [] } } } } },
            { copyrightYear: 2019 },
            { available: true, daysSince: 1500, yearsSince: 4.1 }
        );
        expect(result.freshness).toBe('aufgegeben');
        expect(result.pitchArg).toBeTruthy();
    });

    it('current copyright + no wayback = aktuell', () => {
        const result = analyzeContentFreshness(
            { lighthouseResult: { audits: { 'network-requests': { details: { items: [] } } } } },
            { copyrightYear: new Date().getFullYear() },
            null
        );
        expect(result.freshness).toBe('aktuell');
    });

    it('old jQuery in URLs = tech signal', () => {
        const result = analyzeContentFreshness(
            { lighthouseResult: { audits: { 'network-requests': { details: { items: [{ url: 'https://cdn.example.de/jquery-1.9.1.min.js' }] } } } } },
            null, null
        );
        expect(result.signals.some(s => s.type === 'tech')).toBe(true);
    });
});
