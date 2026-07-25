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

describe('detectGoogleAds mit statischer Ad-Evidenz', () => {
    // PSI sieht nur den Tag-Manager — der reale DE-Normalfall.
    const psiConsentBlind = psi([
        'https://beispiel.de/',
        'https://www.googletagmanager.com/gtm.js?id=GTM-K23ZMF3'
    ]);
    const evidence = (over = {}) => ({
        ok: true, blocked: null,
        gtmContainers: [{ id: 'GTM-K23ZMF3', fetched: true }],
        adEvidence: {
            googleAds: { found: false, ids: [], source: null, confidence: null },
            metaPixel: { found: false, ids: [], source: null, confidence: null },
            microsoftAds: { found: false, ids: [], source: null, confidence: null },
            display: { found: false, source: null },
            adConsentMode: { found: false, params: [], redaction: false },
            ...over
        }
    });

    it('Container-Fund loest die Consent-Blindheit auf', () => {
        const r = detectGoogleAds(psiConsentBlind, evidence({
            googleAds: { found: true, ids: ['AW-636243025'], source: 'gtm-container', confidence: 'konfiguriert' }
        }));
        expect(r.active).toBe(true);
        expect(r.consentBlind).toBe(false);
        expect(r.signals.join(' ')).toMatch(/konfiguriert \(im GTM-Container/);
        expect(r.evidence).toMatchObject({ source: 'gtm-container', confidence: 'konfiguriert' });
        expect(r.insight).toMatch(/GTM-Container konfiguriert/);
    });

    it('Quelltext-Fund wird als "aktiv" ausgewiesen', () => {
        const r = detectGoogleAds(psiConsentBlind, evidence({
            googleAds: { found: true, ids: ['AW-111222333'], source: 'html', confidence: 'aktiv' }
        }));
        expect(r.evidence.confidence).toBe('aktiv');
        expect(r.signals.join(' ')).toMatch(/Conversion-Tag im Quelltext/);
    });

    it('Werbe-Consent-Mode macht NICHT active — Indiz bleibt Indiz', () => {
        const r = detectGoogleAds(psiConsentBlind, evidence({
            adConsentMode: { found: true, params: ['ad_storage'], redaction: true }
        }));
        expect(r.active).toBe(false);
        expect(r.adConsentMode.found).toBe(true);
        expect(r.insight).toMatch(/kein Nachweis/);
    });

    it('eine Bot-Wall wird ignoriert und NICHT als "keine Werbung" gelesen', () => {
        const r = detectGoogleAds(psiConsentBlind, {
            ok: true, blocked: 'challenge',
            adEvidence: { googleAds: { found: true, ids: ['AW-1'], source: 'html', confidence: 'aktiv' } }
        });
        expect(r.active).toBe(false);       // geblockte Evidenz zaehlt nicht
        expect(r.blocked).toBe('challenge');
        expect(r.insight).toMatch(/blockiert/);
    });

    it('ohne adEvidence bleibt das Verhalten unveraendert', () => {
        const a = detectGoogleAds(psiConsentBlind);
        const b = detectGoogleAds(psiConsentBlind, null);
        expect(a.active).toBe(false);
        expect(a.consentBlind).toBe(true);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
