import { describe, it, expect } from 'vitest';
import { computeBuyerFit, gesamtScore } from '../../src/scoring/buyer-fit.js';

describe('computeBuyerFit — 2. Achse: kauft DIESER Betrieb?', () => {
    it('Cobic-Fall: Premium-Makler, starke Bewertungen, KEIN Werbe-Signal → mittel (nicht hoch)', () => {
        const bf = computeBuyerFit({
            adIntent: { active: false }, reviewRecency: { daysSinceLast: 28, velocity: 4, n: 5 },
            businessStrength: 100, rating: 4.9, reviews: 145, primaryType: 'real_estate_agency'
        });
        expect(bf.score).toBeLessThan(70);          // NICHT hoch — fehlt das Budget-Signal
        expect(bf.score).toBeGreaterThanOrEqual(45); // aber auch nicht niedrig (Premium + etabliert)
        expect(bf.label).toBe('mittel');
        expect(bf.reasons).toContain('kein Werbe-Signal');
    });

    it('Idealer Lead: schaltet Anzeigen + Premium + wächst → hoch', () => {
        const bf = computeBuyerFit({
            adIntent: { active: true }, reviewRecency: { daysSinceLast: 10, velocity: 8, n: 5 },
            businessStrength: 100, rating: 4.7, reviews: 300, primaryType: 'real_estate_agency'
        });
        expect(bf.score).toBeGreaterThanOrEqual(90);
        expect(bf.label).toBe('hoch');
        expect(bf.reasons).toContain('zahlt für Werbung');
        expect(bf.reasons).toContain('wächst (frische Bewertungen)');
    });

    it('Ad-Intent hebt den Score deutlich (Marketing-Budget = Kaufsignal)', () => {
        const base = { reviewRecency: { daysSinceLast: 30, velocity: 4, n: 5 }, businessStrength: 80, rating: 4.6, reviews: 100, primaryType: 'lawyer' };
        const ohne = computeBuyerFit({ ...base, adIntent: { active: false } }).score;
        const mit = computeBuyerFit({ ...base, adIntent: { active: true } }).score;
        expect(mit - ohne).toBeGreaterThanOrEqual(25);
    });

    it('Wachstum: frische, häufige Bewertungen > flaue/alte', () => {
        const base = { adIntent: { active: false }, businessStrength: 80, rating: 4.5, reviews: 90, primaryType: 'dentist' };
        const frisch = computeBuyerFit({ ...base, reviewRecency: { daysSinceLast: 15, velocity: 8, n: 5 } }).score;
        const flau = computeBuyerFit({ ...base, reviewRecency: { daysSinceLast: 500, velocity: 0.3, n: 4 } }).score;
        expect(frisch).toBeGreaterThan(flau);
    });

    it('Zu kleiner/schwacher Betrieb → gedeckelt (kann sich Premium kaum leisten)', () => {
        const winzig = computeBuyerFit({ adIntent: { active: true }, reviewRecency: { daysSinceLast: 10, velocity: 5, n: 3 }, businessStrength: 30, rating: 5.0, reviews: 5, primaryType: 'restaurant' });
        expect(winzig.score).toBeLessThanOrEqual(38);
        const schwach = computeBuyerFit({ adIntent: { active: true }, businessStrength: 50, rating: 3.0, reviews: 60, primaryType: 'lawyer' });
        expect(schwach.score).toBeLessThanOrEqual(38);
    });

    it('Premium-Branche zahlt sich im canPay-Anteil aus (vs. Gastro)', () => {
        const base = { adIntent: { active: false }, reviewRecency: { daysSinceLast: 30, velocity: 4, n: 5 }, businessStrength: 90, rating: 4.6, reviews: 120 };
        const makler = computeBuyerFit({ ...base, primaryType: 'real_estate_agency' }).score;
        const cafe = computeBuyerFit({ ...base, primaryType: 'cafe' }).score;
        expect(makler).toBeGreaterThan(cafe);
    });
});

describe('gesamtScore — Opportunity moduliert durch Buyer-Fit', () => {
    it('hoher Fit lässt Opportunity nahezu unangetastet, niedriger Fit zieht stark', () => {
        expect(gesamtScore(92, 100)).toBeGreaterThan(gesamtScore(92, 60));
        expect(gesamtScore(92, 60)).toBeGreaterThan(gesamtScore(92, 20));
        expect(gesamtScore(92, 100)).toBe(92);          // voller Fit = volle Chance
        expect(gesamtScore(92, 20)).toBeLessThan(70);   // schwacher Fit drückt 92 unter HOT
    });
    it('robust gegen fehlenden Fit (Default 50)', () => {
        expect(gesamtScore(80, undefined)).toBe(gesamtScore(80, 50));
    });
});
