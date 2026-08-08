import { describe, it, expect } from 'vitest';
import { calculateCompositeScore } from '../../src/scoring/composite-score.js';
import { assessBuyingIntent, computeAdWaste } from '../../src/analysis/buying-intent.js';

/**
 * Basis-Fixture: schlechter Betrieb-Website-Zustand bei starkem Geschaeft.
 * Alle Tests variieren davon NUR das Kaufsignal — so misst der Vergleich
 * wirklich die neue Achse und nicht nebenbei etwas anderes.
 */
function fixture(overrides = {}) {
    return {
        ws: { perf: 25, isHttps: false, viewport: false, viewportMissing: true },
        tech: { isBaukasten: true },
        place: { userRatingCount: 150, rating: 4.6, primaryType: 'dentist' },
        footprint: { maturity: 0.5 },
        revenue: null,
        result: { conversionRate: 5 },
        screenshotAnalysis: { designQuality: 3 },
        contentAnalysis: null,
        socialSignals: null,
        triggerEvents: { hasSofort: true, totalImpact: 12 },
        bfsgScore: { risk: 'kritisch' },
        signalStack: { clusterCount: 2 },
        techDepth: { obsoleteScore: 5 },
        contentFreshness: { freshness: 'veraltet' },
        companyProfile: { isEnterprise: false },
        buyingIntent: null,
        adWaste: null,
        ...overrides
    };
}

describe('calculateCompositeScore — Kaufsignal statt Problem-Beleg', () => {
    it('schlechte Seite OHNE Kaufsignal ist KEIN starker Lead (Kern des Umbaus)', () => {
        // Vor dem Umbau ergab genau dieser Fall "hoher Composite" — die Seite ist
        // kaputt, also galt der Lead als heiss. Real ist das der schwerste Verkauf:
        // ein Inhaber, der jahrelang nichts investiert hat.
        const result = calculateCompositeScore(fixture());

        expect(result.composite).toBeLessThan(45);
        expect(result.hebel).toBeGreaterThan(80);   // Problem-Beleg ist maximal
        expect(result.intent).toBeLessThanOrEqual(8); // aber kein Kaufsignal
        expect(result.bottleneck.name).toBe('Intent');
        expect(result.intentNote).toMatch(/Kein Kaufsignal/);
    });

    it('IDENTISCHE Seite MIT laufenden Anzeigen rankt deutlich hoeher', () => {
        const ohne = calculateCompositeScore(fixture());

        // Kaufsignal ueber das echte Modul bauen, nicht handgeschnitzt —
        // so prueft der Test auch die Integration der beiden Module.
        const buyingIntent = assessBuyingIntent({
            googleAds: { active: true, signals: ['Google Ads aktiv'] },
            footprint: { maturity: 0.5, hasAnalytics: true },
            reviewRecency: { daysSinceLast: 12, velocity: 6.2, n: 5 }
        });
        const adWaste = computeAdWaste({
            ws: fixture().ws,
            adsActive: buyingIntent.adsActive
        });
        const mit = calculateCompositeScore(fixture({ buyingIntent, adWaste }));

        expect(buyingIntent.isProvenSpender).toBe(true);
        expect(mit.composite).toBeGreaterThan(ohne.composite + 20);
        expect(mit.composite).toBeGreaterThan(60);
        // Die Intent-Achse traegt den Sprung — nicht ein Nebeneffekt.
        expect(mit.intent).toBeGreaterThan(ohne.intent + 40);
        expect(mit.intentNote).toMatch(/Kaufsignal (beweisbar|wahrscheinlich)/);
        // Engpass bleibt hier zurecht "Intent" (Fit/Hebel sind bei 100 ausgereizt),
        // aber auf deutlich hoeherem Niveau — genau das ist der Unterschied.
        expect(mit.bottleneck.value).toBeGreaterThan(ohne.bottleneck.value + 40);
    });

    it('Anzeigen auf schwacher Seite erhoehen das Timing (Geld verbrennt jetzt)', () => {
        const buyingIntent = assessBuyingIntent({
            googleAds: { active: true, signals: ['Google Ads aktiv'] }
        });
        const adWaste = computeAdWaste({ ws: fixture().ws, adsActive: true });
        const mit = calculateCompositeScore(fixture({ buyingIntent, adWaste }));
        const ohne = calculateCompositeScore(fixture({ buyingIntent }));

        expect(adWaste.active).toBe(true);
        expect(mit.timing).toBe(Math.min(100, ohne.timing + 20));
    });

    it('gute Seite ohne Anlass bleibt schwach — auch wenn Anzeigen laufen', () => {
        // Kaufsignal allein reicht nicht: ohne Schwachstelle fehlt das Argument.
        const buyingIntent = assessBuyingIntent({
            googleAds: { active: true, signals: ['Google Ads aktiv'] },
            footprint: { hasAnalytics: true, platformCount: 4 }
        });
        const result = calculateCompositeScore({
            ws: { perf: 95, isHttps: true, viewport: true, viewportMissing: false },
            tech: { isBaukasten: false },
            place: { userRatingCount: 5, primaryType: '_default' },
            footprint: { maturity: 0.1 },
            revenue: null,
            result: { conversionRate: 1 },
            screenshotAnalysis: { designQuality: 9 },
            contentAnalysis: { hasCTA: true, hasUSP: true },
            socialSignals: null,
            triggerEvents: { hasSofort: false, totalImpact: 0 },
            bfsgScore: { risk: 'niedrig' },
            signalStack: { clusterCount: 0 },
            techDepth: { obsoleteScore: 0 },
            contentFreshness: { freshness: 'aktuell' },
            companyProfile: { isEnterprise: false },
            buyingIntent
        });
        expect(result.composite).toBeLessThan(45);
        expect(result.bottleneck.name).toBe('Hebel');
    });

    it('Hebel-Dimension traegt weiterhin die volle Problem-Logik', () => {
        const schlecht = calculateCompositeScore(fixture());
        const gut = calculateCompositeScore(fixture({
            ws: { perf: 95, isHttps: true, viewport: true, viewportMissing: false },
            screenshotAnalysis: { designQuality: 9 },
            bfsgScore: { risk: 'niedrig' },
            techDepth: { obsoleteScore: 0 },
            contentFreshness: { freshness: 'aktuell' },
            signalStack: { clusterCount: 0 }
        }));
        expect(schlecht.hebel).toBeGreaterThan(gut.hebel + 40);
    });

    it('enterprise = low fit', () => {
        const result = calculateCompositeScore({
            ws: { perf: 50 }, tech: {}, place: { userRatingCount: 200 },
            footprint: {}, revenue: null, result: { conversionRate: 3 },
            screenshotAnalysis: null, contentAnalysis: null, socialSignals: null,
            triggerEvents: { hasSofort: false, totalImpact: 0 },
            bfsgScore: {}, signalStack: { clusterCount: 0 },
            techDepth: { obsoleteScore: 0 }, contentFreshness: {},
            companyProfile: { isEnterprise: true }
        });
        expect(result.fit).toBeLessThan(50);
    });

    it('Alt-Aufrufer ohne buyingIntent stuerzt nicht ab, faellt auf den Boden', () => {
        const result = calculateCompositeScore(fixture({ buyingIntent: undefined }));
        expect(result.intent).toBe(8);
        expect(Number.isFinite(result.composite)).toBe(true);
        expect(result.dimensions).toHaveProperty('hebel');
    });

    it('should identify bottleneck dimension', () => {
        const result = calculateCompositeScore(fixture({
            ws: { perf: 95, isHttps: true, viewport: true },
            screenshotAnalysis: { designQuality: 8 },
            triggerEvents: { hasSofort: false, totalImpact: 0 },
            bfsgScore: { risk: 'niedrig' },
            signalStack: { clusterCount: 0 },
            techDepth: { obsoleteScore: 0 },
            contentFreshness: { freshness: 'aktuell' }
        }));
        expect(result.bottleneck).toHaveProperty('name');
        expect(result.bottleneck).toHaveProperty('value');
    });
});

describe('Nicht gemessen ≠ negativ gemessen — Hebel/Fit (Korrekturen 2026-08-08)', () => {
    /**
     * Eigenes Fixture mit KOPFRAUM: das Basis-fixture() ist maximal schlecht
     * (perf 25, kein SSL, BFSG kritisch …) und laeuft in den 100er-Deckel — dort
     * waere jeder Unterschied unsichtbar und der Test gruen aus dem falschen Grund.
     */
    const mild = (o = {}) => fixture({
        ws: { perf: 75, isHttps: true, viewport: true, viewportMissing: false },
        bfsgScore: null, signalStack: null, techDepth: null, contentFreshness: null,
        triggerEvents: null, screenshotAnalysis: null, tech: {},
        ...o
    });

    it('fehlende Vision-Analyse gibt KEINE Hebel-Punkte mehr', () => {
        // `screenshotAnalysis?.designQuality || 5` ergab 5 → `dq <= 5` → +15.
        // Derselbe Bug war in lead-scorer.js:90 schon 2026-05-03 behoben, hier nie.
        const ohne = calculateCompositeScore(mild({ screenshotAnalysis: null }));
        const gemessenMittel = calculateCompositeScore(mild({ screenshotAnalysis: { designQuality: 5 } }));
        expect(ohne.hebel).toBeLessThan(gemessenMittel.hebel);
        expect(gemessenMittel.hebel - ohne.hebel).toBe(15);   // exakt der erfundene Bonus
    });

    it('gemessen schlechtes Design wirkt weiterhin am staerksten', () => {
        // Gegenprobe: die Korrektur darf den echten Fall nicht mit abschalten.
        const s = q => calculateCompositeScore(mild({ screenshotAnalysis: { designQuality: q } })).hebel;
        expect(s(2)).toBeGreaterThan(s(5));
        expect(s(5)).toBeGreaterThan(s(9));
    });

    it('fehlende Website-Messung gibt keinen SSL-Hebel', () => {
        // `!ws?.isHttps` war true, wenn ws GAR NICHT vorlag → +20 fuers Nichtmessen.
        const ohneWs = calculateCompositeScore(mild({ ws: null }));
        const gemessenSicher = calculateCompositeScore(mild({ ws: { isHttps: true } }));
        expect(ohneWs.hebel).toBe(gemessenSicher.hebel);
    });

    it('gemessen fehlendes SSL wirkt weiterhin', () => {
        const unsicher = calculateCompositeScore(mild({ ws: { isHttps: false } }));
        const sicher = calculateCompositeScore(mild({ ws: { isHttps: true } }));
        expect(unsicher.hebel - sicher.hebel).toBe(20);
    });

    it('ein fehlender Places-Datensatz loest die „zu klein"-Strafe NICHT aus', () => {
        // Vorher: kein `place` → reviews=0 → `< 5` → −10, ZUSAETZLICH zum
        // entgangenen +15. Der Mechanismus, nicht das Gesamtergebnis, ist der Punkt:
        // ein vorhandener Datensatz OHNE Bewertungszahl muss gleich behandelt werden.
        const ohnePlace = calculateCompositeScore(mild({ place: null })).fit;
        const placeOhneZahl = calculateCompositeScore(mild({ place: { rating: 4.5 } })).fit;
        expect(placeOhneZahl - ohnePlace).toBe(15);   // NUR der Lokal-Bonus, keine Strafe
    });

    it('ein nachweislich kleiner Betrieb bleibt abgewertet', () => {
        const klein = calculateCompositeScore(mild({ place: { userRatingCount: 2, rating: 4.5 } })).fit;
        const gross = calculateCompositeScore(mild({ place: { userRatingCount: 150, rating: 4.5 } })).fit;
        expect(klein).toBeLessThan(gross);
    });
});
