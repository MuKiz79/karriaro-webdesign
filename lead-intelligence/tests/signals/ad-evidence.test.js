import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// Die Scan-Lib lebt bei den Cloud Functions (dort läuft sie), ist aber rein —
// deshalb hier ohne Netz und ohne Mock testbar.
const require = createRequire(import.meta.url);
const { scanHtmlForAdTags, scanGtmContainer, scanAdConsentMode, buildAdEvidence, MAX_CONTAINERS } =
    require('../../../functions/lib/ad-evidence.js');

describe('scanHtmlForAdTags', () => {
    it('findet eine AW-Conversion-ID im gtag-Script-Pfad', () => {
        const r = scanHtmlForAdTags('<script src="https://www.googletagmanager.com/gtag/js?id=AW-987654321"></script>');
        expect(r.googleAdsIds).toContain('AW-987654321');
    });

    it('findet eine AW-ID im gtag("config")-Aufruf', () => {
        const r = scanHtmlForAdTags(`<script>gtag('config', 'AW-123456789');</script>`);
        expect(r.googleAdsIds).toContain('AW-123456789');
    });

    it('findet Ad-Tags AUCH wenn ein Consent-Blocker sie deaktiviert hat', () => {
        // Das ist der Kern: type="text/plain" verhindert die Ausführung, nicht
        // aber den Konfigurations-Beweis.
        const r = scanHtmlForAdTags(
            `<script type="text/plain" data-usercentrics="Google Ads">gtag('config','AW-555666777');</script>`);
        expect(r.googleAdsIds).toContain('AW-555666777');
        expect(r.cmp).toBe('usercentrics');
    });

    it('wertet G-/GTM-/UA-IDs NICHT als Werbung', () => {
        const r = scanHtmlForAdTags(`
            <script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>
            <script src="https://www.googletagmanager.com/gtm.js?id=GTM-K23ZMF3"></script>
            <script>gtag('config','UA-12345-6');</script>`);
        expect(r.googleAdsIds).toEqual([]);
        expect(r.gtmIds).toContain('GTM-K23ZMF3');
    });

    it('erkennt Meta-Pixel per fbq-init und per noscript-Fallback', () => {
        const r = scanHtmlForAdTags(`
            <script>fbq('init', '1234567890');</script>
            <noscript><img src="https://www.facebook.com/tr?id=999888777&ev=PageView"></noscript>`);
        expect(r.fbPixelIds).toEqual(expect.arrayContaining(['1234567890', '999888777']));
    });

    it('dedupliziert GTM-IDs und deckelt sie bei MAX_CONTAINERS', () => {
        const many = ['GTM-AAAA111', 'GTM-BBBB222', 'GTM-CCCC333', 'GTM-DDDD444', 'GTM-AAAA111'].join(' ');
        const r = scanHtmlForAdTags(many);
        expect(r.gtmIds.length).toBe(MAX_CONTAINERS);
        expect(new Set(r.gtmIds).size).toBe(r.gtmIds.length);
    });

    it('nimmt eine UET-ID nur ernst, wenn auch das Bing-Skript da ist', () => {
        // Ohne bat.js ist `ti:"123456"` irgendein fremdes JS-Feld.
        expect(scanHtmlForAdTags(`<script>var o={"ti":"12345678"};</script>`).microsoft.found).toBe(false);
        const r = scanHtmlForAdTags(`<script src="https://bat.bing.com/bat.js"></script><script>var o={"ti":"12345678"};</script>`);
        expect(r.microsoft.found).toBe(true);
        expect(r.microsoft.ids).toContain('12345678');
    });

    it('leeres/kaputtes HTML ergibt leere Befunde statt Absturz', () => {
        for (const input of ['', null, undefined]) {
            const r = scanHtmlForAdTags(input);
            expect(r.googleAdsIds).toEqual([]);
            expect(r.gtmIds).toEqual([]);
        }
    });

    it('ist zustandslos — zwei Läufe liefern dasselbe (Regex-lastIndex-Falle)', () => {
        // Globale Regexe als Modul-Konstante behalten sonst ihren lastIndex und
        // liefern beim zweiten Aufruf weniger Treffer.
        const html = `<script>gtag('config','AW-111222333');fbq('init','1234567890');</script>`;
        expect(JSON.stringify(scanHtmlForAdTags(html))).toBe(JSON.stringify(scanHtmlForAdTags(html)));
    });
});

describe('scanGtmContainer', () => {
    it('findet AW-IDs im Container-JS', () => {
        const r = scanGtmContainer('var a="AW-636243025";var b="AW-685997642";');
        expect(r.awIds).toEqual(expect.arrayContaining(['AW-636243025', 'AW-685997642']));
    });

    it('findet Meta-Pixel in der GTM-Template-Schreibweise', () => {
        expect(scanGtmContainer(`vtp_pixelId:"5556667778"`).fbPixelIds).toContain('5556667778');
    });

    it('erkennt Remarketing und Consent-Mode-denied', () => {
        const r = scanGtmContainer(`doubleclick.net/activity; "ad_storage":"denied"`);
        expect(r.display).toBe(true);
        expect(r.consentModeDenied).toBe(true);
    });

    it('begrenzt das Scan-Fenster, bricht aber nicht ab', () => {
        const huge = 'x'.repeat(2000000) + 'AW-999888777';
        const r = scanGtmContainer(huge);
        // Jenseits des Limits wird bewusst nicht mehr gesucht — kein Absturz.
        expect(Array.isArray(r.awIds)).toBe(true);
    });
});

describe('scanAdConsentMode', () => {
    it('erkennt ads_data_redaction als werbebezogen', () => {
        const r = scanAdConsentMode(`gtag("set","ads_data_redaction",true)`);
        expect(r.found).toBe(true);
        expect(r.redaction).toBe(true);
    });

    it('erkennt Consent-Mode-v2-Werbeparameter', () => {
        const r = scanAdConsentMode(`gtag("consent","default",{ad_storage:"denied",ad_user_data:"denied"})`);
        expect(r.found).toBe(true);
        expect(r.params).toEqual(expect.arrayContaining(['ad_storage', 'ad_user_data']));
    });

    it('reine Analytics-Einwilligung zählt NICHT als Werbe-Indiz', () => {
        expect(scanAdConsentMode(`gtag("consent","default",{analytics_storage:"denied"})`).found).toBe(false);
    });
});

describe('buildAdEvidence', () => {
    const emptyHtml = { googleAdsIds: [], gtmIds: [], fbPixelIds: [], microsoft: { found: false, ids: [] }, display: false, cmp: null };

    it('Quelltext-Fund gilt als "aktiv"', () => {
        const ev = buildAdEvidence({ ...emptyHtml, googleAdsIds: ['AW-111222333'] }, []);
        expect(ev.googleAds).toMatchObject({ found: true, source: 'html', confidence: 'aktiv' });
    });

    it('nur-Container-Fund gilt als "konfiguriert" — nie als laufende Kampagne', () => {
        const ev = buildAdEvidence(emptyHtml, [
            { id: 'GTM-X', fetched: true, hits: { awIds: ['AW-444555666'], fbPixelIds: [], uetIds: [], microsoft: false, display: false } }
        ]);
        expect(ev.googleAds).toMatchObject({ found: true, source: 'gtm-container', confidence: 'konfiguriert' });
        expect(ev.googleAds.ids).toContain('AW-444555666');
    });

    it('Quelltext schlägt Container (Präzedenz)', () => {
        const ev = buildAdEvidence({ ...emptyHtml, googleAdsIds: ['AW-111'] }, [
            { id: 'GTM-X', fetched: true, hits: { awIds: ['AW-999'], fbPixelIds: [], uetIds: [], microsoft: false, display: false } }
        ]);
        expect(ev.googleAds.source).toBe('html');
        expect(ev.googleAds.ids).toEqual(['AW-111']);
    });

    it('nicht abrufbare Container werden ignoriert, nicht als Fund gewertet', () => {
        const ev = buildAdEvidence(emptyHtml, [{ id: 'GTM-X', fetched: false, reason: 'Server-side GTM' }]);
        expect(ev.googleAds.found).toBe(false);
    });

    it('Werbe-Consent-Mode bleibt ein EIGENES Feld und fließt nie in googleAds.found', () => {
        const ev = buildAdEvidence(
            { ...emptyHtml, adConsentMode: { found: true, params: ['ad_storage'], redaction: true } }, []);
        expect(ev.googleAds.found).toBe(false);   // Indiz ist kein Beweis
        expect(ev.adConsentMode.found).toBe(true);
        expect(ev.adConsentMode.redaction).toBe(true);
    });

    it('ohne jeden Befund ist alles sauber leer', () => {
        const ev = buildAdEvidence(emptyHtml, []);
        expect(ev.googleAds.found).toBe(false);
        expect(ev.metaPixel.found).toBe(false);
        expect(ev.microsoftAds.found).toBe(false);
        expect(ev.display.found).toBe(false);
    });
});
