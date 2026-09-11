/**
 * HTTPS-Messung, PHP/Hoster und datierte CMS-Tabelle im Opportunity-Score
 * (2026-09-10, Vertrag V6). Ergänzt die kalibrierte Ground-Truth in
 * opportunity-tiers.test.js, die bewusst unverändert bleibt.
 */
import { describe, it, expect } from 'vitest';
import { computeOpportunity } from '../../src/scoring/opportunity.js';
import { analyzeTechAge } from '../../src/analysis/tech-age.js';

const JETZT = new Date(2026, 8, 10);

// Profil MIT Kopfraum (kein Clamp bei 100, kein 69er-Deckel durch Baukasten-Fehlen
// verschleiert): Anwalt, mittlere Stärke, WordPress 6 → ohne CMS-Befund.
const basis = {
    ws: { perf: 60, viewport: true, isHttps: true },
    tech: { isBaukasten: false, cms: 'WordPress', version: '6.4.2' },
    place: { rating: 4.4, userRatingCount: 30, primaryType: 'lawyer', businessStatus: 'OPERATIONAL' },
    reviewRecency: { daysSinceLast: 60, velocity: null, n: 5 }
};
const mit = (o) => computeOpportunity({ ...basis, ...o });

describe('HTTPS: +22 nur bei gemessenem reachable === false', () => {
    const ohneSslPsi = mit({ ws: { ...basis.ws, isHttps: false } });
    const mitSsl = mit({});

    it('ohne httpsCheck: bisherige Logik unverändert (Regressionsschutz)', () => {
        // Nicht über die Badness vergleichen: ohne hartes Zeichen hebt der
        // Design-Floor (32) die SSL-Seite über die Nicht-SSL-Seite (22 + 5 = 27).
        // Die Wirkung von „kein SSL" ist das harte Strukturzeichen und der
        // wegfallende 69er-Deckel.
        expect(ohneSslPsi.hardStructural).toBe(1);
        expect(mitSsl.hardStructural).toBe(0);
        expect(ohneSslPsi.scoreCap).toBeNull();
        expect(mitSsl.scoreCap).toBe(69);
        expect(ohneSslPsi.reasons).toContain('kein SSL');
        expect(ohneSslPsi.anlaesse.some(a => a.art === 'chrome-warnung')).toBe(false);
        expect(ohneSslPsi.httpsGemessen).toBe(false);
    });

    it('reachable false wirkt wie fehlendes SSL — plus Chrome-Anlass mit Datum', () => {
        const r = mit({ ws: { ...basis.ws, isHttps: false }, httpsCheck: { checked: true, reachable: false, certValidForHost: null, redirectsToHttps: null } });
        expect(r.badnessScore).toBe(ohneSslPsi.badnessScore);
        expect(r.opportunity).toBe(ohneSslPsi.opportunity);
        expect(r.reasons.some(x => x.startsWith('📅 kein HTTPS'))).toBe(true);
        expect(r.anlaesse).toContainEqual(expect.objectContaining({ art: 'chrome-warnung', datum: '2026-10' }));
        expect(r.httpsGemessen).toBe(true);
    });

    it('Gegenprobe (Prüfung): PSI lud die https-Fassung → reachable false erzeugt weder +22 noch Chrome-Anlass', () => {
        const r = mit({ httpsCheck: { checked: true, reachable: false } });   // basis.ws.isHttps === true
        expect(r.opportunity).toBe(mitSsl.opportunity);
        expect(r.hardStructural).toBe(0);
        expect(r.reasons.some(x => /kein (HTTPS|SSL)/.test(x))).toBe(false);
        expect(r.anlaesse).toEqual([]);
    });

    it('Gegenprobe: reachable true schlägt PSI „kein SSL" — kein +22, kein hartes Zeichen', () => {
        const r = mit({
            ws: { ...basis.ws, isHttps: false },
            httpsCheck: { checked: true, reachable: true, certValidForHost: true, redirectsToHttps: false }
        });
        expect(r.hardStructural).toBe(0);
        expect(r.badnessScore).toBe(mitSsl.badnessScore);
        expect(r.opportunity).toBe(mitSsl.opportunity);
        expect(r.reasons).not.toContain('kein SSL');
        expect(r.reasons).toContain('HTTPS ohne Weiterleitung');   // weich, ohne Score
        expect(r.anlaesse).toEqual([]);
    });

    it('reachable null (nicht gemessen) fällt auf PSI zurück', () => {
        const r = mit({ ws: { ...basis.ws, isHttps: false }, httpsCheck: { checked: true, reachable: null } });
        expect(r.opportunity).toBe(ohneSslPsi.opportunity);
        expect(r.reasons).toContain('kein SSL');
    });
});

describe('PHP/Hoster: sichtbar + filterbar, aber score-neutral', () => {
    const php = { version: '7.4', eol: true, eolDatum: '2022-11-28' };

    it('Chip mit Datum und Anlass, Score UNVERÄNDERT (alt ≠ Kaufsignal)', () => {
        const ohne = mit({});
        const r = mit({ php, hoster: { name: 'strato', quelle: 'mx' } });
        expect(r.opportunity).toBe(ohne.opportunity);
        expect(r.badnessScore).toBe(ohne.badnessScore);
        expect(r.hardStructural).toBe(ohne.hardStructural);
        expect(r.reasons).toContain('📅 PHP 7.4 ohne Sicherheitsupdates seit 28.11.2022');
        expect(r.reasons.some(x => x.startsWith('💶 Strato'))).toBe(true);
        expect(r.anlaesse).toContainEqual(expect.objectContaining({ art: 'php-eol', datum: '2022-11-28' }));
    });

    it('Gegenprobe: eol null → weder Chip noch Anlass', () => {
        const r = mit({ php: { version: '7.4', eol: null, eolDatum: null }, hoster: { name: 'ionos' } });
        expect(r.reasons.join(' ')).not.toMatch(/PHP|💶/);
        expect(r.anlaesse).toEqual([]);
    });
});

describe('CMS-EOL aus der datierten Tabelle', () => {
    const wp = v => mit({ tech: { ...basis.tech, version: v }, techAge: analyzeTechAge({ ...basis.tech, version: v }, {}, { jetzt: JETZT }) });

    it('Gegenprobe: WordPress 4.9 ist kein hartes Strukturzeichen mehr', () => {
        const r = wp('4.9.18');
        expect(r.hardStructural).toBe(0);
        expect(r.scoreCap).toBe(69);
        expect(r.anlaesse).toEqual([]);
    });

    it('WordPress 4.5 zählt hart, zeigt das Datum und ist filterbar', () => {
        const r = wp('4.5');
        expect(r.hardStructural).toBe(1);
        expect(r.reasons).toContain('📅 WordPress 4.5 ohne Sicherheitsupdates seit 07/2025');
        expect(r.anlaesse).toContainEqual(expect.objectContaining({ art: 'cms-eol', datum: '2025-07' }));
    });

    it('gespeicherte techAge-Objekte ohne `eol` behalten ihr Verhalten (cmsEolYear-Rückfall)', () => {
        const r = mit({ techAge: { cms: 'WordPress', cmsEolYear: 2022, techSeverity: 5 } });
        expect(r.hardStructural).toBe(1);
        expect(r.reasons).toContain('WordPress veraltet');
    });
});
