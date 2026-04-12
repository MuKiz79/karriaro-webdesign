import { describe, it, expect } from 'vitest';
import { detectTech } from '../../src/signals/tech-detect.js';
import { detectGoogleAds } from '../../src/signals/google-ads.js';
import { detectJobSignals } from '../../src/signals/job-signal.js';

const mockPsi = (urls = []) => ({ lighthouseResult: { audits: {
    'network-requests': { details: { items: urls.map(u => ({ url: u, mimeType: 'text/html' })) } }
} } });

describe('detectTech', () => {
    it('WordPress detected', () => {
        const r = detectTech(mockPsi(['https://example.de/wp-content/themes/flavor/style.css']));
        expect(r.cms).toContain('WordPress');
    });
    it('Wix detected', () => {
        const r = detectTech(mockPsi(['https://static.wixstatic.com/media/image.jpg']));
        expect(r.isBaukasten).toBe(true);
        expect(r.cms).toContain('Wix');
    });
    it('clean site = no CMS', () => {
        const r = detectTech(mockPsi(['https://example.de/app.js']));
        expect(r.isBaukasten).toBe(false);
    });
});

describe('detectGoogleAds', () => {
    it('AdSense detected', () => {
        const r = detectGoogleAds(mockPsi(['https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js']));
        expect(r.active).toBe(true);
    });
    it('no ads = inactive', () => {
        const r = detectGoogleAds(mockPsi(['https://example.de/style.css']));
        expect(r.active).toBe(false);
    });
});

describe('detectJobSignals', () => {
    it('job page detected', () => {
        const r = detectJobSignals(mockPsi(['https://example.de/karriere', 'https://example.de/jobs/developer']));
        expect(r.isHiring).toBe(true);
    });
    it('no job signals', () => {
        const r = detectJobSignals(mockPsi(['https://example.de/kontakt']));
        expect(r.isHiring).toBe(false);
    });
});
