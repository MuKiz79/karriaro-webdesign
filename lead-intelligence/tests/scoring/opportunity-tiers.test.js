/**
 * Regression-Gate für die Scan-Stage-Vor-Bewertung (CLAUDE.md §2: adversariale
 * Selbst-Verifikation MUSS in CI grün laufen, bevor gemerged wird).
 *
 * 27-Profil-Ground-Truth + Scanner-Vision-Schritt. HOT>=70, WARM 50–69, JUNK<50.
 * Importiert die ECHTE computeOpportunity — kein Re-Implement.
 */
import { describe, it, expect } from 'vitest';
import { computeOpportunity } from '../../src/scoring/opportunity.js';

// Scanner-Vision-Schritt 1:1 wie in orchestration/scanner.js nach dem Patch:
//  modern  → ×1.0 wenn ein hartes Strukturzeichen existiert (Relaunch-Fall bleibt),
//            sonst ×0.45 (modern-aber-langsam-Falle, F0);
//  veraltet→ Neuberechnung mit visionOutdated:true (zählt als hartes Signal).
function applyVisionStep(lead, visionModern, p) {
    if (visionModern === null || visionModern === undefined) return lead.opportunity;
    if (visionModern === true) {
        const mod = (lead.hardStructural || 0) >= 1 ? 1.0 : 0.45;
        return Math.max(0, Math.min(100, Math.round(lead.opportunity * mod)));
    }
    const re = computeOpportunity({
        ws: p.ws, tech: p.tech, place: p.place, websiteUri: '',
        techAge: p.techAge, reviewRecency: p.reviewRecency, visionOutdated: true
    });
    return Math.max(0, Math.min(100, re.opportunity));
}

function tierOf(score) {
    if (score >= 70) return 'HOT';
    if (score >= 50) return 'WARM';
    return 'JUNK';
}

function scoreProfile(p) {
    const base = computeOpportunity({
        ws: p.ws, tech: p.tech, place: p.place, websiteUri: '',
        techAge: p.techAge, reviewRecency: p.reviewRecency
    });
    return applyVisionStep(base, p.visionModern, p);
}

// ⚠️ RE-KALIBRIERUNG 2026-07-26 (T01/T04/T06: HOT → WARM).
// Die urspruengliche Ground-Truth kodierte die These „schlechte Seite + starker
// Betrieb = heisser Lead". Ein echter Stuttgart-Scan hat sie falsifiziert: der
// Founder hat die Top-Treffer (zwei ausgebuchte Zahnarztpraxen, eine Tierarzt-
// praxis) als „nicht unser Klientel" zurueckgewiesen — waehrend der einzige
// Betrieb mit bewiesenem Kaufsignal (Anwalt, Google Ads auf eine Seite ohne SSL)
// dahinter lag. T06 IST dieser Tierarzt-Fall.
// Neu gilt: kapazitaetsgebundene Heilberufe OHNE Kaufsignal sind WARM, nicht HOT
// (Bedarfsdruck-Achse in scoring/opportunity.js). Sie verschwinden nicht — sie
// stehen hinter den Betrieben, die nachweislich Geld fuer Kunden ausgeben.
// Gegenprobe, dass hier keine Branchen-Diskriminierung entstanden ist, im
// describe „Bedarfsdruck-Achse" unten: dieselben Profile MIT Anzeigen = wieder HOT.
const TESTSET = [
  { id:'T01', expectedTier:'WARM', ws:{perf:34,seo:58,a11y:62,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.9'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:4.7,userRatingCount:180,primaryType:'dentist',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:12,velocity:6,n:5}, visionModern:false },
  { id:'T02', expectedTier:'HOT',  ws:{perf:41,seo:55,a11y:60,viewport:false,isHttps:true}, tech:{isBaukasten:false,cms:'Joomla',version:'3.10'}, techAge:{cms:'Joomla',cmsEolYear:2023,techSeverity:5}, place:{rating:4.6,userRatingCount:240,primaryType:'lawyer',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:9,velocity:7,n:5}, visionModern:false },
  { id:'T03', expectedTier:'HOT',  ws:{perf:48,seo:62,a11y:70,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Wix',version:null}, techAge:{cms:'Wix',cmsEolYear:null,techSeverity:3}, place:{rating:4.8,userRatingCount:95,primaryType:'real_estate_agency',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:21,velocity:4,n:5}, visionModern:false },
  { id:'T04', expectedTier:'WARM', ws:{perf:52,seo:68,a11y:66,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Jimdo',version:null}, techAge:{cms:'Jimdo',cmsEolYear:null,techSeverity:3}, place:{rating:4.9,userRatingCount:140,primaryType:'physiotherapist',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:7,velocity:9,n:5}, visionModern:null },
  { id:'T05', expectedTier:'HOT',  ws:{perf:45,seo:60,a11y:58,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.4'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:4.4,userRatingCount:320,primaryType:'car_dealer',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:5,velocity:14,n:5}, visionModern:false },
  { id:'T06', expectedTier:'WARM', ws:{perf:55,seo:70,a11y:72,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Squarespace',version:null}, techAge:{cms:'Squarespace',cmsEolYear:null,techSeverity:3}, place:{rating:4.8,userRatingCount:110,primaryType:'veterinary_care',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:15,velocity:5,n:5}, visionModern:null },
  { id:'T07', expectedTier:'HOT',  ws:{perf:38,seo:54,a11y:52,viewport:false,isHttps:false}, tech:{isBaukasten:false,cms:'WordPress',version:'5.2'}, techAge:{cms:'WordPress',cmsEolYear:null,techSeverity:2}, place:{rating:4.5,userRatingCount:88,primaryType:'roofing_contractor',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:18,velocity:4,n:5}, visionModern:false },
  { id:'T08', expectedTier:'HOT',  ws:{perf:50,seo:66,a11y:64,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.1'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:4.3,userRatingCount:130,primaryType:'plumber',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:28,velocity:3,n:5}, visionModern:null },
  { id:'T26', expectedTier:'HOT',  ws:{perf:43,seo:58,a11y:56,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.6'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:4.6,userRatingCount:900,primaryType:'hotel',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:4,velocity:12,n:5}, visionModern:false },

  { id:'T09', expectedTier:'WARM', ws:{perf:44,seo:60,a11y:58,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Wix',version:null}, techAge:{cms:'Wix',cmsEolYear:null,techSeverity:3}, place:{rating:4.5,userRatingCount:210,primaryType:'restaurant',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:8,velocity:11,n:5}, visionModern:false },
  { id:'T10', expectedTier:'WARM', ws:{perf:47,seo:62,a11y:60,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Jimdo',version:null}, techAge:{cms:'Jimdo',cmsEolYear:null,techSeverity:3}, place:{rating:4.6,userRatingCount:75,primaryType:'hair_salon',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:14,velocity:5,n:5}, visionModern:null },
  { id:'T11', expectedTier:'WARM', ws:{perf:40,seo:56,a11y:55,viewport:true,isHttps:false}, tech:{isBaukasten:false,cms:'WordPress',version:'4.0'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:4.4,userRatingCount:65,primaryType:'cafe',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:25,velocity:3,n:5}, visionModern:false },
  { id:'T12', expectedTier:'WARM', ws:{perf:36,seo:52,a11y:54,viewport:false,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.3'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:4.5,userRatingCount:140,primaryType:'bakery',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:19,velocity:4,n:5}, visionModern:false },
  { id:'T13', expectedTier:'WARM', ws:{perf:58,seo:70,a11y:68,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Squarespace',version:null}, techAge:{cms:'Squarespace',cmsEolYear:null,techSeverity:3}, place:{rating:4.7,userRatingCount:90,primaryType:'florist',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:11,velocity:6,n:5}, visionModern:true },
  { id:'T14', expectedTier:'WARM', ws:{perf:60,seo:72,a11y:70,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'6.1'}, techAge:{cms:'WordPress',cmsEolYear:null,techSeverity:0}, place:{rating:4.4,userRatingCount:115,primaryType:'electrician',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:16,velocity:5,n:5}, visionModern:null },

  { id:'T15', expectedTier:'JUNK', ws:{perf:30,seo:45,a11y:48,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.2'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:3.1,userRatingCount:7,primaryType:'dentist',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:540,velocity:0.2,n:3}, visionModern:false },
  { id:'T16', expectedTier:'JUNK', ws:{perf:28,seo:40,a11y:44,viewport:false,isHttps:false}, tech:{isBaukasten:false,cms:'Joomla',version:'3.8'}, techAge:{cms:'Joomla',cmsEolYear:2023,techSeverity:5}, place:{rating:4.2,userRatingCount:6,primaryType:'lawyer',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:720,velocity:0.1,n:2}, visionModern:false },
  { id:'T17', expectedTier:'JUNK', ws:{perf:42,seo:58,a11y:55,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Wix',version:null}, techAge:{cms:'Wix',cmsEolYear:null,techSeverity:3}, place:{rating:5.0,userRatingCount:5,primaryType:'hair_salon',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:200,velocity:0.3,n:2}, visionModern:null },
  { id:'T18', expectedTier:'JUNK', ws:{perf:33,seo:50,a11y:50,viewport:false,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.5'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:3.4,userRatingCount:9,primaryType:'restaurant',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:410,velocity:0.2,n:2}, visionModern:false },
  { id:'T19', expectedTier:'JUNK', ws:{perf:38,seo:54,a11y:52,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Jimdo',version:null}, techAge:{cms:'Jimdo',cmsEolYear:null,techSeverity:3}, place:{rating:4.0,userRatingCount:12,primaryType:'beauty_salon',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:380,velocity:0.3,n:2}, visionModern:false },
  { id:'T20', expectedTier:'JUNK', ws:{perf:35,seo:52,a11y:50,viewport:false,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.0'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:3.0,userRatingCount:11,primaryType:'restaurant',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:300,velocity:0.3,n:2}, visionModern:false },
  { id:'T21', expectedTier:'JUNK', ws:{perf:46,seo:60,a11y:58,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Wix',version:null}, techAge:{cms:'Wix',cmsEolYear:null,techSeverity:3}, place:{rating:4.1,userRatingCount:55,primaryType:'gym',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:260,velocity:0.5,n:3}, visionModern:null },
  { id:'T22', expectedTier:'JUNK', ws:{perf:92,seo:95,a11y:93,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:null,version:null}, techAge:{cms:null,cmsEolYear:null,techSeverity:0}, place:{rating:4.8,userRatingCount:220,primaryType:'dentist',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:6,velocity:12,n:5}, visionModern:true },
  { id:'T23', expectedTier:'JUNK', ws:{perf:88,seo:90,a11y:91,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'6.3'}, techAge:{cms:'WordPress',cmsEolYear:null,techSeverity:0}, place:{rating:4.7,userRatingCount:160,primaryType:'lawyer',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:10,velocity:8,n:5}, visionModern:true },
  { id:'T24', expectedTier:'JUNK', ws:{perf:49,seo:80,a11y:85,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'6.0'}, techAge:{cms:'WordPress',cmsEolYear:null,techSeverity:0}, place:{rating:4.7,userRatingCount:130,primaryType:'physiotherapist',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:9,velocity:7,n:5}, visionModern:true },
  { id:'T25', expectedTier:'JUNK', ws:{perf:51,seo:78,a11y:82,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:null,version:null}, techAge:{cms:null,cmsEolYear:null,techSeverity:0}, place:{rating:4.6,userRatingCount:175,primaryType:'restaurant',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:7,velocity:10,n:5}, visionModern:true },
  { id:'T27', expectedTier:'JUNK', ws:{perf:40,seo:54,a11y:52,viewport:false,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.6'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:4.2,userRatingCount:850,primaryType:'hotel',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:800,velocity:0.1,n:3}, visionModern:false }
];

describe('computeOpportunity — 27-Profil-Ground-Truth (Scan-Stage-Tiers)', () => {
    for (const p of TESTSET) {
        it(`${p.id} → ${p.expectedTier}`, () => {
            const score = scoreProfile(p);
            expect(tierOf(score), `${p.id} score=${score}`).toBe(p.expectedTier);
        });
    }

    it('saubere Trennung: kein JUNK über einem HOT', () => {
        const scored = TESTSET.map(p => ({ exp: p.expectedTier, s: scoreProfile(p) }));
        const minHot = Math.min(...scored.filter(x => x.exp === 'HOT').map(x => x.s));
        const maxJunk = Math.max(...scored.filter(x => x.exp === 'JUNK').map(x => x.s));
        expect(minHot).toBeGreaterThan(maxJunk);
    });

    it('T26 (lebendig) >> T27 (tot) trotz identischem Review-COUNT — Velocity, nicht Zahl (F6)', () => {
        const t26 = scoreProfile(TESTSET.find(p => p.id === 'T26'));
        const t27 = scoreProfile(TESTSET.find(p => p.id === 'T27'));
        expect(t26 - t27).toBeGreaterThanOrEqual(30);
    });

    it('Premium-Single-Flag schlägt Low-Value-Multi-Flag (F2): T08 > T12, T01 > T09', () => {
        const s = id => scoreProfile(TESTSET.find(p => p.id === id));
        expect(s('T08')).toBeGreaterThan(s('T12'));
        expect(s('T01')).toBeGreaterThan(s('T09'));
    });

    it('Wert-Gate: rating<=3.2 und rating===0 erreichen NIE HOT', () => {
        const lowRating = computeOpportunity({
            ws: { perf: 30, seo: 45, a11y: 45, viewport: false, isHttps: false },
            tech: { isBaukasten: false, cms: 'WordPress' },
            place: { rating: 3.0, userRatingCount: 120, primaryType: 'lawyer', businessStatus: 'OPERATIONAL' },
            techAge: { cms: 'WordPress', cmsEolYear: 2022, techSeverity: 5 },
            reviewRecency: { daysSinceLast: 10, velocity: 8, n: 5 }
        });
        const noRating = computeOpportunity({
            ws: { perf: 30, seo: 45, a11y: 45, viewport: false, isHttps: false },
            tech: { isBaukasten: false, cms: 'WordPress' },
            place: { rating: 0, userRatingCount: 200, primaryType: 'lawyer', businessStatus: 'OPERATIONAL' },
            techAge: { cms: 'WordPress', cmsEolYear: 2022, techSeverity: 5 },
            reviewRecency: { daysSinceLast: 10, velocity: 8, n: 5 }
        });
        expect(lowRating.opportunity).toBeLessThan(70);
        expect(noRating.opportunity).toBeLessThan(70);
    });
});

describe('Ad-Intent (Kaufsignal: schaltet Anzeigen)', () => {
    const qualified = {
        ws: { perf: 45, seo: 60, a11y: 58, viewport: true, isHttps: true },
        tech: { isBaukasten: true, cms: 'Wix' },
        techAge: { cms: 'Wix', cmsEolYear: null, techSeverity: 3 },
        place: { rating: 4.7, userRatingCount: 120, primaryType: 'dentist', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 14, velocity: 6, n: 5 }
    };
    const dead = {
        ws: { perf: 30, seo: 45, viewport: false, isHttps: false },
        tech: { isBaukasten: true, cms: 'Wix' },
        techAge: { cms: 'Wix', cmsEolYear: null, techSeverity: 3 },
        place: { rating: 4.2, userRatingCount: 40, primaryType: 'plumber', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 700, velocity: 0.2, n: 4 }
    };
    const soft = {
        ws: { perf: 60, seo: 65, viewport: true, isHttps: true },
        tech: { isBaukasten: false, cms: 'WordPress' },
        techAge: { cms: 'WordPress', cmsEolYear: null, techSeverity: 1 },
        place: { rating: 4.6, userRatingCount: 90, primaryType: 'physiotherapist', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 20, velocity: 5, n: 5 }
    };
    const ad = { active: true, signals: ['Google Ads aktiv'] };

    it('boostet eine qualifizierte Lead (proven spender + Relaunch-Grund)', () => {
        const a = computeOpportunity({ ...qualified }).opportunity;
        const b = computeOpportunity({ ...qualified, adIntent: ad });
        expect(b.opportunity).toBeGreaterThan(a);
        expect(b.adIntent).toBe(true);
    });
    it('rettet KEIN totes Geschäft (Liveness-Gate dominiert)', () => {
        expect(computeOpportunity({ ...dead, adIntent: ad }).opportunity).toBeLessThan(50);
    });
    it('macht eine soft-Lead ohne hartes Strukturzeichen NICHT HOT (Konvergenz)', () => {
        expect(computeOpportunity({ ...soft, adIntent: ad }).opportunity).toBeLessThan(70);
    });

    // ── Kaufsignal-Achse (2026-07-25) ──
    const job = { isHiring: true, signals: ['Karriere-Bereich erkannt'] };

    it('"stellt ein" ist ein eigenstaendiges Kaufsignal', () => {
        const ohne = computeOpportunity({ ...qualified }).opportunity;
        const mit = computeOpportunity({ ...qualified, jobIntent: job });
        expect(mit.opportunity).toBeGreaterThan(ohne);
        expect(mit.buySignal.hiring).toBe(true);
    });

    it('Anzeigen + Einstellung stapeln sich', () => {
        // Eigene Fixture mit Kopfraum: `qualified` saettigt mit Anzeigen bereits
        // bei 100, dort waere das Stapeln nicht messbar (Clamp, kein Fehler).
        const midsize = {
            ws: { perf: 50, seo: 60, a11y: 58, viewport: true, isHttps: true },
            tech: { isBaukasten: true, cms: 'Wix' },
            techAge: { cms: 'Wix', cmsEolYear: null, techSeverity: 3 },
            place: { rating: 4.3, userRatingCount: 30, primaryType: 'hair_salon', businessStatus: 'OPERATIONAL' },
            reviewRecency: { daysSinceLast: 30, velocity: 3, n: 5 }
        };
        const nur = computeOpportunity({ ...midsize, adIntent: ad }).opportunity;
        const beide = computeOpportunity({ ...midsize, adIntent: ad, jobIntent: job });
        expect(nur).toBeLessThan(100);                 // Kopfraum wirklich vorhanden
        expect(beide.opportunity).toBeGreaterThan(nur);
        expect(beide.buySignal.mult).toBeCloseTo(1.35 * 1.15, 2);
    });

    it('FEHLENDES Kaufsignal wird NICHT bestraft (Neutralwert 1.0)', () => {
        // Schuetzt die kalibrierte 27-Profil-Ground-Truth: ohne Signal darf sich
        // der Score gegenueber dem Stand vor der Kaufsignal-Achse nicht aendern.
        const r = computeOpportunity({ ...qualified });
        expect(r.buySignal.mult).toBe(1);
        expect(r.buySignal.adActive).toBe(false);
        expect(r.buySignal.hiring).toBe(false);
    });

    it('"stellt ein" rettet ebenfalls KEIN totes Geschaeft', () => {
        expect(computeOpportunity({ ...dead, adIntent: ad, jobIntent: job }).opportunity).toBeLessThan(50);
    });
});

describe('Timing/Saison-Boost', () => {
    const hair = {
        ws: { perf: 45, seo: 60, viewport: true, isHttps: true },
        tech: { isBaukasten: true, cms: 'Wix' },
        techAge: { cms: 'Wix', cmsEolYear: null, techSeverity: 3 },
        place: { rating: 4.7, userRatingCount: 120, primaryType: 'hair_salon', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 14, velocity: 6, n: 5 }
    };
    const season = { months: [9, 10], label: 'Saison' };

    it('boostet eine qualifizierte Lead im Saison-Fenster', () => {
        const a = computeOpportunity({ ...hair }).opportunity;
        const b = computeOpportunity({ ...hair, seasonal: season }).opportunity;
        expect(b).toBeGreaterThan(a);
    });
    it('rettet KEIN totes Geschäft per Saison-Boost', () => {
        const dead = {
            ws: { perf: 30, viewport: false, isHttps: false }, tech: { isBaukasten: true, cms: 'Wix' },
            techAge: { techSeverity: 3 },
            place: { rating: 4, userRatingCount: 40, primaryType: 'hair_salon', businessStatus: 'OPERATIONAL' },
            reviewRecency: { daysSinceLast: 700, velocity: 0.2, n: 4 }
        };
        expect(computeOpportunity({ ...dead, seasonal: season }).opportunity).toBeLessThan(50);
    });
});

describe('Bedarfsdruck-Achse (F9) — „will der Betrieb überhaupt mehr Kunden?"', () => {
    // Ausgelöst durch echte Founder-Rückmeldung am Stuttgart-Scan (2026-07-26):
    // ausgebuchte Praxen standen über einem bewiesenen Werbetreibenden.
    const praxis = {
        ws: { perf: 63, viewport: true, isHttps: true },
        tech: { isBaukasten: true, cms: 'Wix' },
        techAge: { cms: 'Wix', cmsEolYear: null, techSeverity: 3 },
        place: { rating: 5.0, userRatingCount: 25, primaryType: 'dentist', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 33, velocity: null, n: 5 }
    };
    const ad = { active: true, signals: ['Google Ads'] };

    it('dämpft eine etablierte, kapazitätsgebundene Praxis ohne Kaufsignal', () => {
        const r = computeOpportunity({ ...praxis });
        expect(r.demandFactor).toBe(0.70);
        expect(r.reasons).toContain('⏸ kein Wachstumssignal');
        expect(r.opportunity).toBeLessThan(70);          // nicht mehr HOT
        expect(r.opportunity).toBeGreaterThanOrEqual(50); // aber auch nicht weggeworfen
    });

    it('hebt DIESELBE Praxis mit Anzeigen wieder über die HOT-Schwelle', () => {
        // Beweist: die Achse misst Kaufabsicht, nicht Branchenzugehörigkeit.
        const ohne = computeOpportunity({ ...praxis }).opportunity;
        const mit = computeOpportunity({ ...praxis, adIntent: ad });
        expect(mit.demandFactor).toBe(1.0);
        expect(mit.opportunity).toBeGreaterThanOrEqual(70);
        expect(mit.opportunity - ohne).toBeGreaterThan(20);
    });

    it('„stellt ein" hebt den Abschlag ebenfalls auf — Wachstum ist bewiesen', () => {
        const r = computeOpportunity({ ...praxis, jobIntent: { isHiring: true, signals: ['Stellenanzeige'] } });
        expect(r.demandFactor).toBe(1.0);
        expect(r.reasons).not.toContain('⏸ kein Wachstumssignal');
    });

    it('verschont eine JUNGE Praxis ohne Patientenstamm (Zulauf gesucht)', () => {
        // businessStrength < 45 → der Betrieb ist noch nicht etabliert, der
        // „ausgelastet"-Schluss wäre unbelegt.
        const jung = { ...praxis, place: { ...praxis.place, userRatingCount: 9, rating: 4.6 } };
        const r = computeOpportunity(jung);
        expect(r.businessStrength).toBeLessThan(45);
        expect(r.demandFactor).toBe(1.0);
    });

    it('lässt nicht-kapazitätsgebundene Branchen unberührt (Anwalt, Umzug, Handwerk)', () => {
        for (const t of ['lawyer', 'moving_company', 'roofing_contractor', 'real_estate_agency', 'hair_salon']) {
            const r = computeOpportunity({ ...praxis, place: { ...praxis.place, primaryType: t } });
            expect(r.demandFactor, `${t} darf nicht gedämpft werden`).toBe(1.0);
        }
    });

    it('der Werbetreibende schlägt die ausgebuchte Praxis — der Kernfall des Founders', () => {
        // RA Voggel (Anzeigen + EOL-CMS + kein SSL) vs. Zahnarzt Simon (nur Wix).
        const anwalt = computeOpportunity({
            ws: { perf: 64, viewport: true, isHttps: false }, tech: { cms: 'WordPress' },
            techAge: { cms: 'WordPress', cmsEolYear: 2021, techSeverity: 5 },
            place: { rating: 5.0, userRatingCount: 30, primaryType: 'lawyer', businessStatus: 'OPERATIONAL' },
            reviewRecency: { daysSinceLast: 200, velocity: null, n: 5 },
            adIntent: ad
        }).opportunity;
        expect(anwalt).toBeGreaterThan(computeOpportunity({ ...praxis }).opportunity);
    });
});

describe('Kaufsignal-Abstufung (F10) — Evidenz-Summe statt zwei Schalter', () => {
    const basis = {
        ws: { perf: 55, viewport: true, isHttps: true },
        tech: { isBaukasten: true, cms: 'Wix' },
        techAge: { cms: 'Wix', cmsEolYear: null, techSeverity: 3 },
        place: { rating: 4.6, userRatingCount: 60, primaryType: 'lawyer', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 30, velocity: null, n: 5 }
    };

    it('ohne buyingIntent bleibt der alte Multiplikator erhalten (Rückfallpfad)', () => {
        // buySignal.mult wird seit jeher auf 2 Stellen gerundet (1.35×1.15 = 1.5525 → 1.55).
        const alt = computeOpportunity({ ...basis, adIntent: { active: true }, jobIntent: { isHiring: true } });
        expect(alt.buySignal.mult).toBe(1.55);
        expect(alt.buySignal.proven).toBe(true);
        expect(alt.buySignal.intentScore).toBeNull();   // kein buyingIntent übergeben
    });

    it('bewiesene Ausgabe hebt den Faktor, gestapelte Evidenz hebt ihn weiter', () => {
        // Bewusst ein Profil MIT Kopfraum — bei einem gesättigten Lead (100) wäre
        // der Unterschied nicht messbar und der Test grün aus dem falschen Grund.
        const mitLuft = {
            ...basis,
            place: { rating: 4.4, userRatingCount: 20, primaryType: 'restaurant', businessStatus: 'OPERATIONAL' },
            reviewRecency: { daysSinceLast: 100, velocity: null, n: 5 }
        };
        // ⚠️ Fixture 2026-08-08 korrigiert: es setzte einen score OHNE signals —
        // eine Kombination, die real nie vorkommt. Seit die Stapel-Schwelle die
        // Bewertungs-Signale ausklammert (spendScore), muss das Fixture die
        // Signale tragen, aus denen der score entsteht.
        const einfach = computeOpportunity({ ...mitLuft, buyingIntent: { isProvenSpender: true, score: 32, tier: 'wahrscheinlich', signals: [{ key: 'google_ads', weight: 32 }] } });
        const gestapelt = computeOpportunity({ ...mitLuft, buyingIntent: { isProvenSpender: true, score: 58, tier: 'beweisbar', signals: [{ key: 'google_ads', weight: 32 }, { key: 'hiring', weight: 26 }] } });
        expect(einfach.opportunity).toBeLessThan(100);   // Kopfraum wirklich vorhanden
        expect(einfach.buySignal.mult).toBe(1.35);
        expect(gestapelt.buySignal.mult).toBe(1.55);
        expect(gestapelt.opportunity).toBeGreaterThan(einfach.opportunity);
    });

    it('reine AKTIVITÄTS-Signale heben den Faktor NICHT — der Kernfehler von gestern', () => {
        // reviewsFresh 14 + analytics 8 + socialBreadth 8 = 30 reißt die
        // PROVEN_THRESHOLD, ist aber keine einzige ausgegebene Mark.
        const r = computeOpportunity({
            ...basis,
            buyingIntent: {
                isProvenSpender: false, score: 30, tier: 'wahrscheinlich',
                signals: [{ key: 'reviews_fresh' }, { key: 'analytics' }, { key: 'social_breadth' }]
            }
        });
        expect(r.buySignal.mult).toBe(1.0);
        expect(r.buySignal.proven).toBe(false);
    });

    it('wahrscheinliche Werbung (GTM/Consent-Mode) gibt einen kleinen Aufschlag, keinen Spender-Status', () => {
        const r = computeOpportunity({
            ...basis,
            buyingIntent: { isProvenSpender: false, score: 28, tier: 'schwach', signals: [{ key: 'ad_consent_mode' }] }
        });
        expect(r.buySignal.mult).toBe(1.15);
        expect(r.buySignal.proven).toBe(false);
    });

    it('nur bewiesene Ausgabe hebt den Bedarfsdruck-Abschlag auf', () => {
        const praxis = { ...basis, place: { ...basis.place, primaryType: 'dentist', userRatingCount: 90, rating: 4.9 } };
        const nurAktiv = computeOpportunity({ ...praxis, buyingIntent: { isProvenSpender: false, score: 44, tier: 'wahrscheinlich', signals: [{ key: 'reviews_fresh' }] } });
        const spender = computeOpportunity({ ...praxis, buyingIntent: { isProvenSpender: true, score: 44, tier: 'wahrscheinlich', signals: [{ key: 'google_ads', weight: 32 }] } });
        expect(nurAktiv.demandFactor).toBe(0.70);
        expect(spender.demandFactor).toBe(1.0);
    });
});

describe('Erreichbarkeit (F11) — ungeprüft bleibt neutral', () => {
    const basis = {
        ws: { perf: 55, viewport: true, isHttps: true },
        tech: { isBaukasten: true, cms: 'Wix' },
        techAge: { cms: 'Wix', cmsEolYear: null, techSeverity: 3 },
        place: { rating: 4.6, userRatingCount: 60, primaryType: 'lawyer', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 30, velocity: null, n: 5 }
    };

    it('wertet NICHT ab, wenn gar nicht geprüft wurde', () => {
        expect(computeOpportunity({ ...basis }).reachFactor).toBe(1.0);
        expect(computeOpportunity({ ...basis, contactPaths: null }).reachFactor).toBe(1.0);
        // checked:false = Bot-Wall/übersprungen → ebenfalls neutral
        expect(computeOpportunity({ ...basis, contactPaths: { checked: false } }).reachFactor).toBe(1.0);
    });

    it('wertet ab, wenn die Prüfung KEINEN Kontaktweg fand', () => {
        const r = computeOpportunity({ ...basis, contactPaths: { checked: true, hasMailto: false, hasTel: false, hasImpressumLink: false } });
        expect(r.reachFactor).toBe(0.85);
        expect(r.reasons).toContain('✉ kein Kontaktweg gefunden');
    });

    it('wertet mit Kontaktweg nicht ab', () => {
        expect(computeOpportunity({ ...basis, contactPaths: { checked: true, hasMailto: true } }).reachFactor).toBe(1.0);
        expect(computeOpportunity({ ...basis, contactPaths: { checked: true, hasTel: true } }).reachFactor).toBe(1.0);
    });

    it('Impressum-Link allein = halber Abschlag (Adresse steht dort vielleicht)', () => {
        const r = computeOpportunity({ ...basis, contactPaths: { checked: true, hasImpressumLink: true } });
        expect(r.reachFactor).toBe(0.92);
        expect(r.reasons).not.toContain('✉ kein Kontaktweg gefunden');
    });
});

describe('Nicht gemessen ≠ negativ gemessen (Korrekturen 2026-08-08)', () => {
    // Die 27-Profil-Ground-Truth hat VOLLSTÄNDIGE Daten und konnte diese Fehler
    // deshalb nie fangen. Diese Tests erzwingen genau die Lücken-Pfade.
    const voll = {
        ws: { perf: 55, viewport: true, isHttps: true },
        tech: { isBaukasten: true, cms: 'Wix' },
        techAge: { cms: 'Wix', cmsEolYear: null, techSeverity: 3 },
        place: { rating: 4.6, userRatingCount: 60, primaryType: 'lawyer', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 30, velocity: null, n: 5 }
    };

    it('fehlende datierte Bewertungen sind NEUTRAL, nicht ×0.85', () => {
        // Ob `publishTime` in der Places-Antwort steht, ist eine Eigenschaft von
        // Googles Daten — nicht des Betriebs.
        const ohne = computeOpportunity({ ...voll, reviewRecency: { daysSinceLast: null, velocity: null, n: 0 } });
        const neutral = computeOpportunity({ ...voll, reviewRecency: null });
        // Gegenprobe über den Mechanismus: identisch zu einem Lauf, in dem das
        // Liveness-Gate nachweislich 1.0 liefert (weder Bonus noch Abschlag).
        expect(ohne.opportunity).toBe(neutral.opportunity);
        // Und der gemessene Frische-Bonus bleibt ein BONUS, kein Normalzustand.
        expect(computeOpportunity({ ...voll }).opportunity).toBeGreaterThan(ohne.opportunity);
    });

    it('ein fehlendes Rating (Places liefert 0) wird nicht bestraft', () => {
        const ohneRating = computeOpportunity({ ...voll, place: { ...voll.place, rating: 0 } });
        // Vor der Korrektur: ×0.45. Jetzt fällt der Fall auf die
        // businessStrength-Stufen durch → höchstens der entgangene Stärke-Bonus.
        expect(ohneRating.opportunity).toBeGreaterThan(computeOpportunity({ ...voll }).opportunity * 0.6);
        // Ein NACHWEISLICH schlechtes Rating bleibt dagegen ein hartes Gate.
        expect(computeOpportunity({ ...voll, place: { ...voll.place, rating: 2.9 } }).opportunity).toBe(0);
    });

    it('eine fehlgeschlagene PSI-Messung erzeugt KEINE Badness', () => {
        const ohnePsi = computeOpportunity({
            ...voll, ws: { viewport: true, isHttps: true },
            tech: {}, techAge: { cms: null, cmsEolYear: null, techSeverity: 0 }
        });
        // Vorher: Default-perf 50 → +9 Badness UND Floor 32.
        expect(ohnePsi.badnessScore).toBe(0);
    });

    it('ein GEMESSENER schwacher perf-Wert wirkt weiterhin', () => {
        // Gegenprobe: die Korrektur darf den echten Fall nicht mit abschalten.
        const langsam = computeOpportunity({
            ...voll, ws: { perf: 35, viewport: true, isHttps: true },
            tech: {}, techAge: { cms: null, cmsEolYear: null, techSeverity: 0 }
        });
        expect(langsam.badnessScore).toBeGreaterThanOrEqual(32);   // Floor greift
    });

    it('Bewertungs-Frische kippt die Kaufsignal-Schwelle NICHT mehr', () => {
        // Die Frische wird bereits vom livenessGate mit ×1.30 belohnt. Sie darf
        // nicht zusätzlich den Sprung 1.35 → 1.55 auslösen.
        const w = { google_ads: 32, reviews_fresh: 14, analytics: 8, social_breadth: 8 };
        const mitFrische = computeOpportunity({
            ...voll,
            buyingIntent: {
                isProvenSpender: true, tier: 'beweisbar', score: 62,
                signals: Object.entries(w).map(([key, weight]) => ({ key, weight }))
            }
        });
        expect(mitFrische.buySignal.mult).toBe(1.35);
    });

    it('echte Ausgaben-Stapelung hebt weiterhin auf 1.55', () => {
        const echt = computeOpportunity({
            ...voll,
            buyingIntent: {
                isProvenSpender: true, tier: 'beweisbar', score: 58,
                signals: [{ key: 'google_ads', weight: 32 }, { key: 'hiring', weight: 26 }]
            }
        });
        expect(echt.buySignal.mult).toBe(1.55);
    });
});

describe('scoreCap — die Konvergenz-Schranke ist eine exportierte Invariante (F13, 2026-08-15)', () => {
    // Verifikations-Befund d2: Der Peer-Multiplikator im Scanner lief NACH den
    // Deckeln und hob gedeckelte 69er auf 75 — in Karlsruhe standen sechs der
    // Top-10 nur dadurch über der HOT-Schwelle. computeOpportunity exportiert
    // den Deckel jetzt, damit JEDER nachgelagerte Multiplikator ihn erneut
    // anwenden kann. Der Scanner tut das (scanner.js, Peer-Block).
    const starkOhneStruktur = {
        // Perf 24 macht viel Badness, ist aber KEIN hartes Strukturzeichen —
        // exakt die Klasse der sechs Karlsruher Durchbrecher.
        ws: { perf: 24, viewport: true, isHttps: true },
        tech: {},
        place: { rating: 4.8, userRatingCount: 200, primaryType: 'lawyer', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 15, velocity: 5, n: 5 },
        adIntent: { active: true, signals: ['Google Ads'] }
    };

    it('deckelt ohne hartes Strukturzeichen EXAKT bei 69 und exportiert scoreCap', () => {
        const r = computeOpportunity({ ...starkOhneStruktur });
        expect(r.hardStructural).toBe(0);
        expect(r.opportunity).toBe(69);      // vorher nur "<70" geprüft — jetzt der exakte Deckel
        expect(r.scoreCap).toBe(69);
    });

    it('exportiert KEINEN Deckel, wenn ein hartes Strukturzeichen da ist', () => {
        const r = computeOpportunity({ ...starkOhneStruktur, ws: { ...starkOhneStruktur.ws, isHttps: false } });
        expect(r.hardStructural).toBeGreaterThanOrEqual(1);
        expect(r.scoreCap).toBeNull();
    });

    it('Ruf unprüfbar (Bewertungen ohne Note) ⇒ scoreCap 69 auch MIT Strukturzeichen', () => {
        const r = computeOpportunity({
            ...starkOhneStruktur,
            ws: { ...starkOhneStruktur.ws, isHttps: false },
            place: { ...starkOhneStruktur.place, rating: 0, userRatingCount: 200 }
        });
        expect(r.scoreCap).toBe(69);
    });

    it('Gegenprobe Scanner-Semantik: Peer-Aufschlag ×1.15 darf einen 69er nie über 70 heben', () => {
        // Nachbau des Scanner-Peer-Blocks (scanner.js) — die eine Zeile, um die
        // es geht, mit dem exportierten Deckel.
        const r = computeOpportunity({ ...starkOhneStruktur });
        let opp = Math.max(0, Math.min(100, Math.round(r.opportunity * 1.15)));
        if (r.scoreCap) opp = Math.min(opp, r.scoreCap);
        expect(opp).toBe(69);
    });
});

describe('F16 — CrUX-Felddaten als Labor-Korrektiv (2026-08-16)', () => {
    // Realfall zbc.dental: Labor-LCP 8,7–18,9 s (Perf 53), aber echte Nutzer
    // p75 = 2,3 s = FAST. Die Formel las nur das Labor — ein „Ihre Seite ist
    // langsam"-Anschreiben wäre vom Inhaber in einer Minute widerlegt worden.
    const NUR_PERF = {
        // Kein hartes Strukturzeichen — die Klasse, die der Design-Floor (32) trägt.
        ws: { perf: 45, viewport: true, isHttps: true },
        tech: {},
        place: { rating: 4.8, userRatingCount: 120, primaryType: 'hair_salon', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 20, velocity: 3, n: 5 }
    };

    it('Feld FAST hebt den Design-Floor auf und halbiert die Perf-Badness', () => {
        const ohne = computeOpportunity({ ...NUR_PERF });
        const mit = computeOpportunity({ ...NUR_PERF, ws: { ...NUR_PERF.ws, crux: { lcpMs: 2268, category: 'FAST', source: 'url' } } });
        expect(ohne.badnessScore).toBeGreaterThanOrEqual(32);   // Floor trägt den Fall
        expect(mit.badnessScore).toBeLessThan(15);              // Floor weg, Perf halbiert
        expect(mit.opportunity).toBeLessThan(ohne.opportunity);
        expect(mit.reasons).toContain('⚡ Feld: schnell (echte Nutzer)');
    });

    it('Feld SLOW bestätigt das Labor: Badness unverändert + eigener Chip', () => {
        const ohne = computeOpportunity({ ...NUR_PERF });
        const mit = computeOpportunity({ ...NUR_PERF, ws: { ...NUR_PERF.ws, crux: { lcpMs: 5100, category: 'SLOW', source: 'origin' } } });
        expect(mit.badnessScore).toBe(ohne.badnessScore);
        expect(mit.opportunity).toBe(ohne.opportunity);
        expect(mit.reasons).toContain('🐌 Feld: langsam (echte Nutzer)');
    });

    it('keine Felddaten / AVERAGE = exakt das bisherige Verhalten (Regressionsschutz)', () => {
        const ohne = computeOpportunity({ ...NUR_PERF });
        const avg = computeOpportunity({ ...NUR_PERF, ws: { ...NUR_PERF.ws, crux: { lcpMs: 3400, category: 'AVERAGE', source: 'url' } } });
        expect(avg.opportunity).toBe(ohne.opportunity);
        expect(avg.badnessScore).toBe(ohne.badnessScore);
        expect(avg.reasons).not.toContain('⚡ Feld: schnell (echte Nutzer)');
    });

    it('zbc-Klasse: Baukasten+Ads-Fall ÜBERLEBT Feld-FAST — nur der Perf-Anteil fällt', () => {
        // Feld-FAST widerlegt das PERF-Argument, nicht den Baukasten-Fall. Der
        // Lead bleibt (zurecht) hoch — aber der Chip warnt vor dem falschen
        // Anschreiben-Argument.
        const zbc = {
            ws: { perf: 53, viewport: true, isHttps: true, crux: { lcpMs: 2268, category: 'FAST', source: 'url' } },
            tech: { isBaukasten: true, cms: 'Squarespace' },
            place: { rating: 5.0, userRatingCount: 56, primaryType: 'dentist', businessStatus: 'OPERATIONAL' },
            reviewRecency: { daysSinceLast: 20, velocity: 4, n: 5 },
            adIntent: { active: true, signals: ['Google Ads'] }
        };
        const r = computeOpportunity(zbc);
        expect(r.hardStructural).toBeGreaterThanOrEqual(1);
        expect(r.opportunity).toBeGreaterThanOrEqual(70);       // Fall trägt weiter
        expect(r.reasons).toContain('⚡ Feld: schnell (echte Nutzer)');
    });

    it('Floor bleibt bei SLOW und bei fehlenden Felddaten aktiv (Gegenprobe)', () => {
        const slow = computeOpportunity({ ...NUR_PERF, ws: { ...NUR_PERF.ws, crux: { lcpMs: 6000, category: 'SLOW', source: 'url' } } });
        expect(slow.badnessScore).toBeGreaterThanOrEqual(32);
    });
});

describe('F17 — „frisch investiert kauft nicht nochmal" (2026-08-17, Founder-Kriterium)', () => {
    // Realfall Poppenbütteler Hof: Founder erkannte am Auftritt, dass die
    // Seite kürzlich modernisiert wurde — die Formel kannte das Kriterium nicht.
    const MONAT = 30 * 86400000;
    const hotel = {
        ws: { perf: 44, viewport: true, isHttps: true },
        tech: { isBaukasten: true, cms: 'Squarespace' },
        place: { rating: 4.1, userRatingCount: 276, primaryType: 'hotel', businessStatus: 'OPERATIONAL' },
        reviewRecency: { daysSinceLast: 21, velocity: 3, n: 5 },
        adIntent: { active: true, signals: ['Google Ads'] }
    };

    it('Relaunch-Verdacht (CMS-Wechsel) dämpft ×0.5 und erklärt sich im Chip', () => {
        const ohne = computeOpportunity({ ...hotel });
        const mit = computeOpportunity({ ...hotel, siteAge: { relaunchVerdacht: true, cmsThen: 'WordPress', cmsNow: 'Squarespace' } });
        expect(mit.investFactor).toBe(0.5);
        expect(mit.opportunity).toBeLessThan(ohne.opportunity);
        expect(mit.reasons.join(' ')).toContain('🆕 frisch investiert');
        expect(mit.reasons.join(' ')).toContain('WordPress → Squarespace');
    });

    it('junge Domain (< 18 Monate, RDAP) dämpft ebenfalls', () => {
        const r = computeOpportunity({ ...hotel, siteAge: { relaunchVerdacht: null, domainRegisteredMs: Date.now() - 6 * MONAT } });
        expect(r.investFactor).toBe(0.5);
        expect(r.reasons.join(' ')).toContain('Domain jünger als 18 Mon.');
    });

    it('MÄNGEL-AUSNAHME: neue Seite ohne SSL wird NICHT gedämpft — schlecht gekauft = ansprechbar', () => {
        const r = computeOpportunity({
            ...hotel, ws: { ...hotel.ws, isHttps: false },
            siteAge: { relaunchVerdacht: true, cmsThen: 'WordPress', cmsNow: 'Squarespace' }
        });
        expect(r.investFactor).toBe(1.0);
        expect(r.reasons.join(' ')).toContain('🆕 neu, aber mangelhaft');
    });

    it('ungeprüft (kein siteAge / Verdacht null / alte Domain) = neutral, kein Chip', () => {
        const basis = computeOpportunity({ ...hotel });
        for (const siteAge of [null, { relaunchVerdacht: null }, { relaunchVerdacht: false, domainRegisteredMs: Date.now() - 60 * MONAT }]) {
            const r = computeOpportunity({ ...hotel, siteAge });
            expect(r.opportunity).toBe(basis.opportunity);
            expect(r.investFactor).toBe(1.0);
            expect(r.reasons.join(' ')).not.toContain('🆕');
        }
    });

    it('Gegenprobe: der Dämpfer halbiert wirklich den Roh-Score (kein No-Op über Deckel)', () => {
        // hotel hat hardStructural ≥ 1 (Baukasten) — kein 69er-Deckel, der die
        // Halbierung verschleiern könnte. Test grün aus dem richtigen Grund.
        const ohne = computeOpportunity({ ...hotel });
        const mit = computeOpportunity({ ...hotel, siteAge: { relaunchVerdacht: true, cmsThen: 'WordPress', cmsNow: 'Squarespace' } });
        expect(ohne.opportunity).toBeGreaterThanOrEqual(70);
        expect(mit.opportunity).toBeLessThanOrEqual(Math.ceil(ohne.opportunity * 0.6));
    });
});
