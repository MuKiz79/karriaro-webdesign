/**
 * Tests für alle verbleibenden Analysis-Module
 * Kompakt: 1-3 Tests pro Modul, Fokus auf Korrektheit + Edge Cases
 */
import { describe, it, expect } from 'vitest';
import { analyzeFutureReadiness } from '../../src/analysis/future-readiness.js';
import { compareSocialPresence } from '../../src/analysis/social-comparison.js';
import { assessDigitalMaturity } from '../../src/analysis/digital-maturity.js';
import { assessConversationReadiness } from '../../src/analysis/conversation-ready.js';
import { detectSurgeIntent } from '../../src/analysis/surge-intent.js';
import { assessLocalSEO } from '../../src/analysis/local-seo.js';
import { assessEmotionalReadiness } from '../../src/analysis/emotional-readiness.js';
import { assessTechTrajectory } from '../../src/analysis/tech-trajectory.js';
import { detectStakeholder } from '../../src/analysis/stakeholder.js';
import { checkSchema } from '../../src/analysis/schema-check.js';
import { checkMessaging } from '../../src/analysis/messaging-check.js';

const mockPsi = (urls = []) => ({ lighthouseResult: { audits: {
    'network-requests': { details: { items: urls.map(u => ({ url: u, mimeType: 'text/html' })) } },
    viewport: { score: 1 }, 'is-on-https': { score: 1 },
    'largest-contentful-paint': { numericValue: 3000 },
    'total-blocking-time': { numericValue: 400 },
    'cumulative-layout-shift': { numericValue: 0.1 },
    'structured-data': { score: 0 }
}, categories: { performance: { score: 0.5 }, accessibility: { score: 0.7 }, seo: { score: 0.6 } } } });

describe('analyzeFutureReadiness', () => {
    it('should return readinessScore 0-100', () => {
        const r = analyzeFutureReadiness({ perf: 50, seo: 60, a11y: 70, isHttps: true, viewport: true }, mockPsi());
        expect(r.readinessScore).toBeGreaterThanOrEqual(0);
        expect(r.readinessScore).toBeLessThanOrEqual(100);
        expect(r.results.length).toBeGreaterThan(0);
    });
});

describe('compareSocialPresence', () => {
    it('no competitors = not available', () => {
        expect(compareSocialPresence(null, []).available).toBe(false);
    });
    it('lead with fewer reviews = gap detected', () => {
        const lead = { displayName: { text: 'A' }, rating: 4.0, userRatingCount: 10, photos: [] };
        const comps = [
            { displayName: { text: 'B' }, rating: 4.5, userRatingCount: 200, photos: Array(5).fill({}) },
            { displayName: { text: 'C' }, rating: 4.3, userRatingCount: 150, photos: Array(3).fill({}) }
        ];
        const r = compareSocialPresence(lead, comps);
        expect(r.available).toBe(true);
        expect(r.gaps.length).toBeGreaterThan(0);
    });
});

describe('assessDigitalMaturity', () => {
    it('no signals = low score', () => {
        const r = assessDigitalMaturity({ platformCount: 0 }, null, mockPsi());
        expect(r.pct).toBeLessThan(30);
    });
    it('many signals = high score', () => {
        const r = assessDigitalMaturity(
            { platformCount: 4, hasInstagram: true, hasLinkedIn: true, hasFbPixel: true, hasAnalytics: true, pixels: [{ key: 'cookiebot' }] },
            { active: true }, mockPsi(['https://tidio.com/widget.js'])
        );
        expect(r.pct).toBeGreaterThan(40);
    });
});

describe('assessConversationReadiness', () => {
    it('no SSL + bad a11y = ready', () => {
        const r = assessConversationReadiness({ isHttps: false, a11y: 40 }, {}, null, null, null);
        expect(r.isReady).toBe(true);
        expect(r.readiness).toBeGreaterThan(5);
    });
    it('perfect site = not ready', () => {
        const r = assessConversationReadiness({ isHttps: true, a11y: 95 }, {}, null, null, null);
        expect(r.isReady).toBe(false);
    });
});

describe('detectSurgeIntent', () => {
    it('FB pixel + many platforms = surge', () => {
        const r = detectSurgeIntent({ hasFbPixel: true, platformCount: 4, hasAnalytics: true }, null, { active: true }, { userRatingCount: 200 });
        expect(r.hasSurge).toBe(true);
        expect(r.surgeScore).toBeGreaterThan(5);
    });
    it('no signals = no surge', () => {
        const r = detectSurgeIntent({ platformCount: 0 }, null, null, null);
        expect(r.hasSurge).toBe(false);
    });
});

describe('assessLocalSEO', () => {
    it('should return an object', () => {
        const r = assessLocalSEO({ perf: 50, seo: 60 }, { userRatingCount: 50, rating: 4.5 }, mockPsi());
        expect(r).toHaveProperty('isParadoxLead');
    });
});

describe('assessEmotionalReadiness', () => {
    it('no data = not available', () => {
        const r = assessEmotionalReadiness(null);
        expect(r.available).toBe(false);
    });
    it('website complaints = ready', () => {
        const r = assessEmotionalReadiness({ websiteComplaints: 3, websiteIssues: ['Seite lädt nicht'], overallSatisfaction: 8 });
        expect(r.isReady).toBe(true);
        expect(r.paradox).toBe(true);
    });
});

describe('assessTechTrajectory', () => {
    it('should return an object', () => {
        const r = assessTechTrajectory({ isBaukasten: true, cms: 'Wix' }, null);
        expect(r).toHaveProperty('urgency');
    });
});

describe('detectStakeholder', () => {
    it('should detect decision maker type', () => {
        const r = detectStakeholder(mockPsi(), { primaryType: 'dentist' });
        expect(r).toHaveProperty('decisionMaker');
        expect(r).toHaveProperty('salesCycle');
    });
});

describe('checkSchema', () => {
    it('empty site = low score', () => {
        const r = checkSchema(mockPsi());
        expect(r.score).toBeLessThan(50);
        expect(r.missingSchemas.length).toBeGreaterThan(0);
    });
});

describe('checkMessaging', () => {
    it('WhatsApp URL = detected', () => {
        const r = checkMessaging(mockPsi(['https://wa.me/4912345']));
        expect(r.hasWhatsApp).toBe(true);
    });
    it('no messaging = not detected', () => {
        const r = checkMessaging(mockPsi(['https://example.de/page']));
        expect(r.hasWhatsApp).toBe(false);
        expect(r.hasBooking).toBe(false);
    });
});
