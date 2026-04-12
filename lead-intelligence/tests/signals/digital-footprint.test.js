import { describe, it, expect } from 'vitest';
import { analyzeDigitalFootprint } from '../../src/signals/digital-footprint.js';

const mockPsi = (urls = []) => ({
    lighthouseResult: {
        audits: {
            'network-requests': { details: { items: urls.map(u => ({ url: u, mimeType: 'text/html' })) } }
        }
    }
});

describe('analyzeDigitalFootprint', () => {
    it('no URLs = minimal footprint', () => {
        const r = analyzeDigitalFootprint(mockPsi([]));
        expect(r.platformCount).toBe(0);
        expect(r.label).toBe('Digital minimal');
    });

    it('Instagram detected', () => {
        const r = analyzeDigitalFootprint(mockPsi(['https://instagram.com/testshop']));
        expect(r.hasInstagram).toBe(true);
        expect(r.platformCount).toBe(1);
    });

    it('Facebook Pixel detected', () => {
        const r = analyzeDigitalFootprint(mockPsi(['https://connect.facebook.net/en_US/fbevents.js']));
        expect(r.hasFbPixel).toBe(true);
    });

    it('Google Analytics detected', () => {
        const r = analyzeDigitalFootprint(mockPsi(['https://www.googletagmanager.com/gtag/js']));
        expect(r.hasAnalytics).toBe(true);
    });

    it('multiple platforms = higher maturity', () => {
        const r = analyzeDigitalFootprint(mockPsi([
            'https://instagram.com/test', 'https://facebook.com/test',
            'https://linkedin.com/company/test', 'https://connect.facebook.net/fbevents.js',
            'https://www.googletagmanager.com/gtag/js'
        ]));
        expect(r.platformCount).toBeGreaterThanOrEqual(3);
        expect(r.maturity).toBeGreaterThan(0.5);
        expect(r.label).toBe('Digital reif');
    });
});
