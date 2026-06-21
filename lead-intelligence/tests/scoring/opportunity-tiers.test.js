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

const TESTSET = [
  { id:'T01', expectedTier:'HOT',  ws:{perf:34,seo:58,a11y:62,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.9'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:4.7,userRatingCount:180,primaryType:'dentist',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:12,velocity:6,n:5}, visionModern:false },
  { id:'T02', expectedTier:'HOT',  ws:{perf:41,seo:55,a11y:60,viewport:false,isHttps:true}, tech:{isBaukasten:false,cms:'Joomla',version:'3.10'}, techAge:{cms:'Joomla',cmsEolYear:2023,techSeverity:5}, place:{rating:4.6,userRatingCount:240,primaryType:'lawyer',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:9,velocity:7,n:5}, visionModern:false },
  { id:'T03', expectedTier:'HOT',  ws:{perf:48,seo:62,a11y:70,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Wix',version:null}, techAge:{cms:'Wix',cmsEolYear:null,techSeverity:3}, place:{rating:4.8,userRatingCount:95,primaryType:'real_estate_agency',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:21,velocity:4,n:5}, visionModern:false },
  { id:'T04', expectedTier:'HOT',  ws:{perf:52,seo:68,a11y:66,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Jimdo',version:null}, techAge:{cms:'Jimdo',cmsEolYear:null,techSeverity:3}, place:{rating:4.9,userRatingCount:140,primaryType:'physiotherapist',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:7,velocity:9,n:5}, visionModern:null },
  { id:'T05', expectedTier:'HOT',  ws:{perf:45,seo:60,a11y:58,viewport:true,isHttps:true}, tech:{isBaukasten:false,cms:'WordPress',version:'4.4'}, techAge:{cms:'WordPress',cmsEolYear:2022,techSeverity:5}, place:{rating:4.4,userRatingCount:320,primaryType:'car_dealer',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:5,velocity:14,n:5}, visionModern:false },
  { id:'T06', expectedTier:'HOT',  ws:{perf:55,seo:70,a11y:72,viewport:true,isHttps:true}, tech:{isBaukasten:true,cms:'Squarespace',version:null}, techAge:{cms:'Squarespace',cmsEolYear:null,techSeverity:3}, place:{rating:4.8,userRatingCount:110,primaryType:'veterinary_care',businessStatus:'OPERATIONAL'}, reviewRecency:{daysSinceLast:15,velocity:5,n:5}, visionModern:null },
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
});
