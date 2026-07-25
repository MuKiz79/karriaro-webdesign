import { describe, it, expect } from 'vitest';
import { assessBuyingIntent, computeAdWaste, PROVEN_THRESHOLD } from '../../src/analysis/buying-intent.js';
import { lossFactors, combineLoss } from '../../src/math/revenue-model.js';

describe('assessBuyingIntent — bewiesenes Geldausgeben', () => {
    it('leere Eingabe = kein Kaufsignal, kein Absturz', () => {
        const r = assessBuyingIntent({});
        expect(r.score).toBe(0);
        expect(r.tier).toBe('keins');
        expect(r.isProvenSpender).toBe(false);
        expect(r.signals).toEqual([]);
        expect(r.missing.length).toBeGreaterThan(0);
    });

    it('laufende Google Ads machen den Betrieb zum bewiesenen Spender', () => {
        const r = assessBuyingIntent({
            googleAds: { active: true, signals: ['Google Ads aktiv'] }
        });
        expect(r.isProvenSpender).toBe(true);
        expect(r.adsActive).toBe(true);
        expect(r.score).toBeGreaterThanOrEqual(PROVEN_THRESHOLD);
        expect(r.signals[0].key).toBe('google_ads');
        expect(r.signals[0].proof).toContain('Google Ads');
    });

    it('Meta-Pixel allein zaehlt ebenfalls als Werbebudget', () => {
        const r = assessBuyingIntent({ footprint: { hasFbPixel: true } });
        expect(r.adsActive).toBe(true);
        expect(r.isProvenSpender).toBe(true);
    });

    it('echte Stellenzahl schlaegt den Website-Proxy', () => {
        const echt = assessBuyingIntent({ jobOpenings: 4 });
        const proxy = assessBuyingIntent({ jobSignal: { isHiring: true, signals: ['Karriere-Bereich erkannt'] } });
        expect(echt.score).toBeGreaterThan(proxy.score);
        expect(echt.isProvenSpender).toBe(true);
        expect(echt.signals[0].label).toMatch(/4 offene Stellen/);
    });

    it('eine einzelne Stelle zaehlt schwaecher als mehrere', () => {
        expect(assessBuyingIntent({ jobOpenings: 1 }).score)
            .toBeLessThan(assessBuyingIntent({ jobOpenings: 3 }).score);
    });

    it('reine Aktivitaets-Signale sind KEIN bewiesenes Kaufsignal', () => {
        // Frische Bewertungen + Analytics zeigen einen lebenden Betrieb — aber
        // keine Investitionsentscheidung. isProvenSpender muss false bleiben.
        const r = assessBuyingIntent({
            footprint: { hasAnalytics: true, platformCount: 4 },
            reviewRecency: { daysSinceLast: 10, velocity: 7, n: 6 }
        });
        expect(r.score).toBeGreaterThan(0);
        expect(r.isProvenSpender).toBe(false);
        expect(r.adsActive).toBe(false);
    });

    it('Velocity-Bonus greift NICHT bei duenner Datenlage (Gaming-Schutz)', () => {
        // 2 Bewertungen von Freunden duerfen die Kaufbereitschaft nicht aufblasen.
        const duenn = assessBuyingIntent({ reviewRecency: { daysSinceLast: 5, velocity: 9, n: 2 } });
        const belastbar = assessBuyingIntent({ reviewRecency: { daysSinceLast: 5, velocity: 9, n: 5 } });
        expect(duenn.signals.some(s => s.key === 'reviews_velocity')).toBe(false);
        expect(belastbar.signals.some(s => s.key === 'reviews_velocity')).toBe(true);
    });

    it('alte Bewertungen geben keinen Frische-Bonus', () => {
        const r = assessBuyingIntent({ reviewRecency: { daysSinceLast: 400, velocity: 0.2, n: 5 } });
        expect(r.signals.some(s => s.key === 'reviews_fresh')).toBe(false);
    });

    it('Tag-Manager ohne Ad-Tags zaehlt schwach — und sagt, dass die Messung blind ist', () => {
        // Kritisch fuer die Ehrlichkeit: der Founder darf "keine Anzeigen erkannt"
        // NICHT als "schaltet keine Anzeigen" lesen. Empirisch belegt an 5 echten
        // deutschen Werbetreibenden, die alle 0 Ad-Tags auslieferten (2026-07-25).
        const r = assessBuyingIntent({
            googleAds: { active: false, signals: [], hasTagManager: true, consentBlind: true }
        });
        expect(r.signals.some(s => s.key === 'tag_manager')).toBe(true);
        expect(r.isProvenSpender).toBe(false);   // wahrscheinlich, aber nicht bewiesen
        expect(r.missing.join(' ')).toMatch(/nicht messbar/);
        // Muss schwaecher wiegen als ein echter Ad-Nachweis.
        const echt = assessBuyingIntent({ googleAds: { active: true, signals: ['Google Ads aktiv'] } });
        expect(r.score).toBeLessThan(echt.score);
    });

    it('ohne Tag-Manager ist es echte Abwesenheit, nicht Blindheit', () => {
        const r = assessBuyingIntent({ googleAds: { active: false, signals: [], hasTagManager: false } });
        expect(r.signals.some(s => s.key === 'tag_manager')).toBe(false);
        expect(r.missing.join(' ')).toMatch(/Keine bezahlte Werbung/);
    });

    it('Werbe-Consent-Mode wiegt staerker als blanker Tag-Manager, bleibt aber Indiz', () => {
        const acm = assessBuyingIntent({
            googleAds: { active: false, signals: [], hasTagManager: true, adConsentMode: { found: true, params: ['ad_storage'], redaction: true } }
        });
        const gtmOnly = assessBuyingIntent({
            googleAds: { active: false, signals: [], hasTagManager: true }
        });
        const echt = assessBuyingIntent({ googleAds: { active: true, signals: ['Google Ads aktiv'] } });

        expect(acm.signals.some(s => s.key === 'ad_consent_mode')).toBe(true);
        expect(acm.score).toBeGreaterThan(gtmOnly.score);
        expect(acm.score).toBeLessThan(echt.score);
        expect(acm.isProvenSpender).toBe(false);
        expect(acm.missing.join(' ')).toMatch(/nicht belegt/);
    });

    it('eine Bot-Wall erzeugt weder Signal noch Strafe', () => {
        const r = assessBuyingIntent({
            googleAds: { active: false, signals: [], hasTagManager: false, blocked: 'challenge' }
        });
        expect(r.signals).toEqual([]);
        expect(r.missing.join(' ')).toMatch(/blockiert/);
    });

    it('Meta-Pixel aus dem Container weist die Quelle korrekt aus', () => {
        const r = assessBuyingIntent({ footprint: { hasFbPixel: true, fbPixelSource: 'gtm-container' } });
        const s = r.signals.find(x => x.key === 'meta_ads');
        expect(s.proof).toMatch(/GTM-Container/);
    });

    it('Score ist bei 100 gedeckelt und Signale sind nach Gewicht sortiert', () => {
        const r = assessBuyingIntent({
            googleAds: { active: true, signals: ['Google Ads aktiv', 'Google Display Network', 'Microsoft Ads'] },
            footprint: { hasFbPixel: true, hasAnalytics: true, platformCount: 5 },
            jobOpenings: 6,
            reviewRecency: { daysSinceLast: 3, velocity: 11, n: 8 }
        });
        expect(r.score).toBe(100);
        expect(r.tier).toBe('beweisbar');
        const weights = r.signals.map(s => s.weight);
        expect(weights).toEqual([...weights].sort((a, b) => b - a));
    });
});

describe('computeAdWaste — die Killer-Kombi', () => {
    const schwach = { perf: 25, lcp: '6.0', viewport: false, isHttps: false, seo: 40 };

    it('ohne laufende Anzeigen gibt es kein Argument', () => {
        const r = computeAdWaste({ ws: schwach, adsActive: false });
        expect(r.active).toBe(false);
        expect(r.pitch).toBeNull();
    });

    it('Anzeigen auf schwacher Seite ergeben einen belegten Verlustanteil', () => {
        const r = computeAdWaste({ ws: schwach, adsActive: true });
        expect(r.active).toBe(true);
        expect(r.lossPct).toBeGreaterThan(20);
        expect(r.drivers.map(d => d.key).sort()).toEqual(['mobile', 'speed', 'ssl']);
        expect(r.pitch).toContain('%');
    });

    it('behauptet OHNE bekanntes Budget KEINEN Euro-Betrag', () => {
        const r = computeAdWaste({ ws: schwach, adsActive: true });
        expect(r.monthlyWasteEur).toBeNull();
        expect(r.pitch).not.toMatch(/\d+\s*€/);
        expect(r.assumptionNote).toMatch(/unbekannt/);
    });

    it('rechnet den Euro-Betrag NUR bei bekanntem Budget — und weist ihn aus', () => {
        const r = computeAdWaste({ ws: schwach, adsActive: true, monthlyAdBudget: 800 });
        expect(r.monthlyWasteEur).toBeGreaterThan(0);
        expect(r.monthlyWasteEur).toBeLessThan(800);
        expect(r.pitch).toContain('800 €');
        expect(r.assumptionNote).toContain('800');
    });

    it('klammert SEO-Verluste aus — bezahlte Klicks haengen nicht am Ranking', () => {
        // Mechanismus-Assertion: der Ad-Waste-Anteil muss exakt der Kombination
        // aus speed/mobile/ssl entsprechen, OHNE seo. Waere seo faelschlich drin,
        // laege der Wert messbar hoeher.
        const f = lossFactors(schwach);
        const ohneSeo = Math.round(combineLoss([f.speed, f.mobile, f.ssl]) * 100);
        const mitSeo = Math.round(combineLoss([f.speed, f.mobile, f.ssl, f.seo]) * 100);

        const r = computeAdWaste({ ws: schwach, adsActive: true });
        expect(r.lossPct).toBe(ohneSeo);
        expect(mitSeo).toBeGreaterThan(ohneSeo); // beweist, dass der Unterschied real ist
    });

    it('technisch saubere Seite mit Anzeigen ergibt kein Argument', () => {
        const r = computeAdWaste({
            ws: { perf: 95, lcp: '1.8', viewport: true, isHttps: true, seo: 90 },
            adsActive: true
        });
        expect(r.active).toBe(false);
        expect(r.lossPct).toBe(0);
    });
});
