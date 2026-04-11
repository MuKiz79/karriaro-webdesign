import { describe, it, expect } from 'vitest';
import { auditUX } from '../../src/analysis/ux-audit.js';

const mockPsi = (viewportScore = 1) => ({
    lighthouseResult: {
        audits: {
            viewport: { score: viewportScore },
            'network-requests': {
                details: { items: [
                    { url: 'https://example.de/kontakt' },
                    { url: 'https://example.de/impressum' },
                    { url: 'https://maps.googleapis.com/maps/api/js' }
                ]}
            }
        }
    }
});

const mockPlace = (type = '_default') => ({
    primaryType: type,
    displayName: { text: 'Test Business' },
    internationalPhoneNumber: '+491234567',
    formattedAddress: 'Teststraße 1, 12345 Berlin',
    websiteUri: 'https://example.de',
    regularOpeningHours: true
});

describe('auditUX', () => {
    it('mobile should be found via Lighthouse viewport audit', () => {
        const result = auditUX(mockPsi(1), mockPlace());
        const mobile = result.results.find(r => r.id === 'mobile');
        expect(mobile).toBeTruthy();
        expect(mobile.found).toBe(true);
    });

    it('mobile should fail when viewport score is 0', () => {
        const result = auditUX(mockPsi(0), mockPlace());
        const mobile = result.results.find(r => r.id === 'mobile');
        expect(mobile.found).toBe(false);
    });

    it('contact should be found via Place phone number', () => {
        const result = auditUX(mockPsi(), mockPlace());
        const contact = result.results.find(r => r.id === 'contact' || r.id === 'phone');
        expect(contact).toBeTruthy();
        expect(contact.found).toBe(true);
    });

    it('contact should fall back to URL pattern when no place', () => {
        const result = auditUX(mockPsi(), null);
        const contact = result.results.find(r => r.id === 'contact');
        // URL has /kontakt and /impressum → should match pattern
        expect(contact.found).toBe(true);
    });

    it('dentist persona should include booking check', () => {
        const result = auditUX(mockPsi(), mockPlace('dentist'));
        expect(result.persona.name).toBe('Zahnarztpraxis');
        expect(result.results.some(r => r.id === 'booking')).toBe(true);
    });

    it('restaurant persona should include menu check', () => {
        const result = auditUX(mockPsi(), mockPlace('restaurant'));
        expect(result.persona.name).toBe('Restaurant');
        expect(result.results.some(r => r.id === 'menu')).toBe(true);
    });

    it('all personas should have mobile and contact checks', () => {
        for (const type of ['dentist', 'restaurant', 'hair_salon', 'hotel', 'lawyer', '_default']) {
            const result = auditUX(mockPsi(), mockPlace(type));
            const hasContact = result.results.some(r => r.id === 'contact' || r.id === 'phone');
            const hasMobile = result.results.some(r => r.id === 'mobile');
            expect(hasContact, `${type} should have contact`).toBe(true);
            expect(hasMobile, `${type} should have mobile`).toBe(true);
        }
    });

    it('should return uxScore between 0 and 100', () => {
        const result = auditUX(mockPsi(), mockPlace());
        expect(result.uxScore).toBeGreaterThanOrEqual(0);
        expect(result.uxScore).toBeLessThanOrEqual(100);
    });

    it('should return modernFeatures', () => {
        const result = auditUX(mockPsi(), mockPlace());
        expect(result.modernFeatures).toBeTruthy();
        expect(result.modernFeatures.length).toBeGreaterThan(0);
    });
});
