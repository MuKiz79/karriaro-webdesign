import { describe, it, expect } from 'vitest';
import { detectGoogleAds } from '../../src/signals/google-ads.js';

/** PSI-Antwort mit den gegebenen Request-URLs nachbauen. */
function psi(urls) {
    return {
        lighthouseResult: {
            audits: { 'network-requests': { details: { items: urls.map(u => ({ url: u })) } } }
        }
    };
}

describe('detectGoogleAds', () => {
    it('erkennt direkt geladene Ad-Skripte', () => {
        const r = detectGoogleAds(psi(['https://www.googleadservices.com/pagead/conversion.js']));
        expect(r.active).toBe(true);
        expect(r.signals).toContain('Google Ads aktiv');
        expect(r.consentBlind).toBe(false);
    });

    it('erkennt eine AW-Conversion-ID auch ohne geladenes Ad-Skript', () => {
        // Harter Beweis: das AW-Praefix ist bei Google eindeutig Google Ads.
        const r = detectGoogleAds(psi(['https://www.googletagmanager.com/gtag/js?id=AW-987654321']));
        expect(r.active).toBe(true);
        expect(r.signals).toContain('Google Ads aktiv');
    });

    it('wertet G-/GTM-IDs NICHT als Werbung (nur Analytics/Container)', () => {
        const r = detectGoogleAds(psi([
            'https://www.googletagmanager.com/gtm.js?id=GTM-K23ZMF3&l=dataLayer',
            'https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ'
        ]));
        expect(r.active).toBe(false);
        expect(r.signals).toEqual([]);
    });

    it('meldet Consent-Blindheit, wenn nur der Tag-Manager sichtbar ist', () => {
        // Empirisch verifiziert an check24.de und thermomix.de (2026-07-25):
        // beide schalten nachweislich Anzeigen, laden aber nur gtm.js — die
        // Ad-Tags feuern erst nach Cookie-Einwilligung, die Lighthouse nie gibt.
        const r = detectGoogleAds(psi([
            'https://www.check24.de/',
            'https://www.googletagmanager.com/gtm.js?id=GTM-K23ZMF3&l=dataLayer'
        ]));
        expect(r.active).toBe(false);
        expect(r.hasTagManager).toBe(true);
        expect(r.consentBlind).toBe(true);
        // Der Text darf NICHT als "schaltet keine Anzeigen" lesbar sein.
        expect(r.insight).toMatch(/nicht als/i);
    });

    it('ohne jeden Tag ist es echte Abwesenheit, keine Blindheit', () => {
        const r = detectGoogleAds(psi(['https://example.de/', 'https://example.de/style.css']));
        expect(r.active).toBe(false);
        expect(r.hasTagManager).toBe(false);
        expect(r.consentBlind).toBe(false);
    });

    it('leere/kaputte PSI-Daten stuerzen nicht ab', () => {
        expect(detectGoogleAds(null).active).toBe(false);
        expect(detectGoogleAds({}).consentBlind).toBe(false);
    });
});
