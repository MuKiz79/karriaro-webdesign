import { describe, it, expect } from 'vitest';
import { checkEnterpriseDB, DB_STATS, patternMatches } from '../../src/priors/enterprise-db.js';

describe('checkEnterpriseDB', () => {
    // Hotels
    it('NH Hotels = enterprise hotel', () => {
        const r = checkEnterpriseDB('nh-hotels.com');
        expect(r.isEnterprise).toBe(true);
        expect(r.category).toBe('hotel');
    });
    it('Motel One = enterprise hotel', () => {
        expect(checkEnterpriseDB('motel-one.com').isEnterprise).toBe(true);
    });
    it('Random hotel = not enterprise', () => {
        expect(checkEnterpriseDB('hotel-mueller-koeln.net').isEnterprise).toBe(false);
    });

    // Restaurants
    it('McDonalds = enterprise', () => {
        expect(checkEnterpriseDB('mcdonalds.de').isEnterprise).toBe(true);
        expect(checkEnterpriseDB('mcdonalds.de').category).toBe('restaurant');
    });
    it('Vapiano = enterprise', () => {
        expect(checkEnterpriseDB('vapiano.de').isEnterprise).toBe(true);
    });
    it('Local restaurant = not enterprise', () => {
        expect(checkEnterpriseDB('ristorante-roma-koeln.de').isEnterprise).toBe(false);
    });

    // Friseure
    it('Klier = enterprise beauty', () => {
        expect(checkEnterpriseDB('klier.de').isEnterprise).toBe(true);
        expect(checkEnterpriseDB('klier.de').category).toBe('beauty');
    });
    it('Local friseur = not enterprise', () => {
        expect(checkEnterpriseDB('friseur-meissner.de').isEnterprise).toBe(false);
    });

    // DAX
    it('Hansgrohe = enterprise dax', () => {
        const r = checkEnterpriseDB('hansgrohe.de');
        expect(r.isEnterprise).toBe(true);
    });
    it('Siemens = enterprise', () => {
        expect(checkEnterpriseDB('siemens.com').isEnterprise).toBe(true);
    });

    // Fitness
    it('McFit = enterprise fitness', () => {
        expect(checkEnterpriseDB('mcfit.com').isEnterprise).toBe(true);
    });
    it('Local gym = not enterprise', () => {
        expect(checkEnterpriseDB('fitness-studio-mueller.de').isEnterprise).toBe(false);
    });

    // Konkurrenz
    it('Webdesign agency = competitor', () => {
        const r = checkEnterpriseDB('webdesign-stuttgart.de');
        expect(r.isCompetitor).toBe(true);
        expect(r.isEnterprise).toBe(false);
    });
    it('SEO Agentur = competitor', () => {
        expect(checkEnterpriseDB('seo-agentur-berlin.de').isCompetitor).toBe(true);
    });

    // Normal
    it('Normal business = neither', () => {
        const r = checkEnterpriseDB('zahnarzt-schmidt-offenburg.de');
        expect(r.isEnterprise).toBe(false);
        expect(r.isCompetitor).toBe(false);
    });
});

describe('DB_STATS', () => {
    it('should have 300+ patterns', () => {
        expect(DB_STATS.totalPatterns).toBeGreaterThan(250);
    });
    it('should have 10 categories', () => {
        expect(DB_STATS.categories).toBe(10);
    });
});

// ════════════════════════════════════════════════════════════════
// Bugfix 2026-05-09: Word-Boundary-Match statt Blind-Substring
// ════════════════════════════════════════════════════════════════

describe('patternMatches — primitive', () => {
    it('atomic pattern matches whole domain-base', () => {
        expect(patternMatches('vonovia', 'vonovia')).toBe(true);
    });
    it('atomic pattern matches as token (split bei "-")', () => {
        expect(patternMatches('vonovia-shop', 'vonovia')).toBe(true);
        expect(patternMatches('shop-vonovia', 'vonovia')).toBe(true);
        expect(patternMatches('shop-vonovia-berlin', 'vonovia')).toBe(true);
    });
    it('atomic pattern does NOT match arbitrary substring', () => {
        // Der gemeldete Bug: "obi" als Substring in "amian-immobilien"
        expect(patternMatches('amian-immobilien', 'obi')).toBe(false);
        expect(patternMatches('leonhard-baeckerei', 'eon')).toBe(false);
        expect(patternMatches('admin-schmidt', 'dm')).toBe(false);
        expect(patternMatches('studio20-leipzig', 'o2')).toBe(false);
    });
    it('hyphenated pattern matches at word boundary', () => {
        expect(patternMatches('leg-immobilien', 'leg-immobilien')).toBe(true);
        expect(patternMatches('leg-immobilien-koeln', 'leg-immobilien')).toBe(true);
        expect(patternMatches('koeln-leg-immobilien', 'leg-immobilien')).toBe(true);
    });
    it('hyphenated pattern does NOT match without boundary', () => {
        // "kollegen-immobilien" enthaelt "leg-immobilien" als Substring,
        // aber nicht als Token-Sequenz ("kol-leg-immobilien" wuerde matchen,
        // "kollegen-immobilien" nicht).
        expect(patternMatches('kollegen-immobilien', 'leg-immobilien')).toBe(false);
    });
    it('handles edge cases', () => {
        expect(patternMatches('', 'obi')).toBe(false);
        expect(patternMatches('obi', '')).toBe(false);
    });
});

describe('checkEnterpriseDB — False Positives (Bugfix)', () => {
    const knownLocalLeads = [
        'amian-immobilien.de',     // contains "obi" — der gemeldete Bug
        'studio20-leipzig.de',     // contains "o2"
        'leonhard-baeckerei.de',   // contains "eon"
        'admin-schmidt.de',        // contains "dm"
        'sappenhausen.de',         // contains "sap"
        'thamtusik-hannover.de',   // contains "mtu"
        'arweisen.de',             // contains "rwe"
        'pumarestaurant.de',       // contains "puma"
        'beklierung-koblenz.de',   // contains "klier"
        'kollegen-immobilien.de'   // contains "leg-immobilien" als Substring
    ];
    for (const d of knownLocalLeads) {
        it(`should NOT flag ${d} as enterprise`, () => {
            const r = checkEnterpriseDB(d);
            expect(r.isEnterprise, `unerwarteter Match: ${r.match} (${r.category})`).toBe(false);
        });
    }
});

describe('checkEnterpriseDB — Robustness', () => {
    it('handles empty/null input', () => {
        expect(checkEnterpriseDB('').isEnterprise).toBe(false);
        expect(checkEnterpriseDB(null).isEnterprise).toBe(false);
        expect(checkEnterpriseDB(undefined).isEnterprise).toBe(false);
    });
    it('is case-insensitive', () => {
        expect(checkEnterpriseDB('VONOVIA.DE').isEnterprise).toBe(true);
        expect(checkEnterpriseDB('Obi.de').isEnterprise).toBe(true);
    });
    it('handles URL with protocol', () => {
        expect(checkEnterpriseDB('https://www.vonovia.de').isEnterprise).toBe(true);
        expect(checkEnterpriseDB('http://obi.de').isEnterprise).toBe(true);
    });
    it('matches token-prefix subdomains', () => {
        for (const d of ['obi-baumarkt-stuttgart.de', 'vonovia-shop.de', 'remax-real-estate.de']) {
            expect(checkEnterpriseDB(d).isEnterprise, `${d} sollte Enterprise sein`).toBe(true);
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 2026-08-15 — Ketten-Lücke aus der Rangfolge-Verifikation. Vier ECHTE Ketten
// standen in den Top-10 der Städte-Scans; der Token-Matcher übersah sie, weil
// verschmolzene Konzern-Domains ('radissonhotels') keinen eigenen Eintrag
// hatten. Gegenprobe in BEIDE Richtungen: die Kette MUSS fallen, der ähnlich
// klingende Einzelbetrieb darf NICHT fallen.
// ════════════════════════════════════════════════════════════════════════════

describe('checkEnterpriseDB — Ketten aus dem Städte-Scan (2026-08-15)', () => {
    const realeKetten = [
        'radissonhotels.com',     // Radisson Blu Karlsruhe — globaler Konzern
        'anicura.de',             // AniCura — Mars-Tochter, Tierklinik-Kette
        'mcdreamshotels.de',      // McDreams — deutsche Budget-Hotelkette
        'rex.app'                 // Rex Tierarztpraxis — Praxis-Kette
    ];
    for (const d of realeKetten) {
        it(`kennt die Kette ${d}`, () => {
            const r = checkEnterpriseDB(d);
            expect(r.isEnterprise, `${d} muss Enterprise sein`).toBe(true);
        });
    }

    // Gegenprobe: Unabhängige Betriebe mit ähnlichen Namen bleiben drin —
    // ein Filter, der zu viel frisst, kostet echte Leads statt falscher.
    const unabhaengig = [
        'schlosshotelkarlsruhe.de',   // unabhängiges Hotel (stand korrekt R9)
        'rexroth-elektro.de',         // 'rexroth' ist EIN Token, nicht 'rex'
        'tierarztpraxis-weingarten.de',
        'hotel-krone-stuttgart.de'
    ];
    for (const d of unabhaengig) {
        it(`verschont den Einzelbetrieb ${d}`, () => {
            const r = checkEnterpriseDB(d);
            expect(r.isEnterprise, `unerwarteter Match: ${r.match} (${r.category})`).toBe(false);
        });
    }
});
