import { describe, it, expect } from 'vitest';
import { computeDisqualifiers } from '../../src/scoring/disqualify.js';
import { gesamtScore } from '../../src/scoring/buyer-fit.js';

describe('computeDisqualifiers — Negativ-Schicht (Website nicht der Engpass)', () => {
    it('sauberer Lead → kein Dämpfer (×1.0, keine Gründe)', () => {
        const dq = computeDisqualifiers({ salesPlatforms: [], reviewRecency: { daysSinceLast: 20, velocity: 5, n: 5 } });
        expect(dq.multiplier).toBe(1);
        expect(dq.reasons).toEqual([]);
    });

    it('Verkauf über eingebettete Plattform → dämpft (×0.6) mit lesbarem Grund', () => {
        const dq = computeDisqualifiers({ salesPlatforms: ['ImmoScout/Immowelt'] });
        expect(dq.multiplier).toBe(0.6);
        expect(dq.reasons[0]).toMatch(/Vertrieb über ImmoScout/);
    });

    it('sehr stilles Geschäft (alte Bewertungen, kaum Velocity) → milder Dämpfer (×0.8)', () => {
        const dq = computeDisqualifiers({ salesPlatforms: [], reviewRecency: { daysSinceLast: 500, velocity: 0.3, n: 4 } });
        expect(dq.multiplier).toBe(0.8);
        expect(dq.reasons).toContain('⚠ Geschäft wirkt still');
    });

    it('beide Muster zusammen → kombiniert, aber NIE unter 0.45 (Dämpfer, kein Gate)', () => {
        const dq = computeDisqualifiers({ salesPlatforms: ['Lieferdienst'], reviewRecency: { daysSinceLast: 600, velocity: 0.2, n: 3 } });
        expect(dq.multiplier).toBe(0.48);          // 0.6 × 0.8
        expect(dq.multiplier).toBeGreaterThanOrEqual(0.45);
        expect(dq.reasons.length).toBe(2);
    });

    it('Untergrenze 0.45 hält auch bei aggressiven Mustern (nie 0×)', () => {
        // künstlich: viele Plattformen würden multiplikativ tief drücken — Floor schützt.
        const dq = computeDisqualifiers({ salesPlatforms: ['A'], reviewRecency: { daysSinceLast: 999, velocity: 0, n: 9 } });
        expect(dq.multiplier).toBeGreaterThanOrEqual(0.45);
    });

    it('frische Bewertungen lösen den Still-Dämpfer NICHT aus (kein Fehlalarm)', () => {
        const dq = computeDisqualifiers({ salesPlatforms: [], reviewRecency: { daysSinceLast: 28, velocity: 4, n: 5 } });
        expect(dq.multiplier).toBe(1);
    });

    it('Integration: ein Plattform-Verkäufer rutscht im Gesamt unter einen identischen Nicht-Verkäufer', () => {
        const opp = 88, fit = 70;
        const cleanGesamt = Math.round(gesamtScore(opp, fit) * computeDisqualifiers({ salesPlatforms: [] }).multiplier);
        const platformGesamt = Math.round(gesamtScore(opp, fit) * computeDisqualifiers({ salesPlatforms: ['ImmoScout/Immowelt'] }).multiplier);
        expect(platformGesamt).toBeLessThan(cleanGesamt);
        expect(cleanGesamt - platformGesamt).toBeGreaterThanOrEqual(20);
    });
});
