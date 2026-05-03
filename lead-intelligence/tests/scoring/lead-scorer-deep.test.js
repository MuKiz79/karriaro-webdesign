/**
 * Tests fuer den Score-Override durch Deep Research.
 * Wir testen drei Verhaltensweisen:
 *   1. Mit deepAssessment.leadPotential wird der Score von der Deep-Schicht uebernommen
 *      (scoreSource === 'deep').
 *   2. Ohne deepAssessment laeuft der alte Pfad (scoreSource === 'quick').
 *   3. screenshotAnalysis null fuehrt nicht mehr zu kuenstlicher Score-Anhebung
 *      (designQuality bleibt neutral, statt als "schlecht" zu zaehlen).
 */
import { describe, it, expect } from 'vitest';
import { scoreLead } from '../../src/scoring/lead-scorer.js';

const baseInputs = () => ({
    ws: { perf: 50, seo: 60, a11y: 65, isHttps: true, viewport: true },
    tech: { cms: 'WordPress', version: '6.4', isBaukasten: false },
    place: {
        // Bewusst eine Branche nutzen, die NICHT in anderen Tests gemutiert wird
        // (vermeidet Test-Reihenfolge-Abhaengigkeit ueber localStorage-Posteriors)
        primaryType: 'restaurant',
        userRatingCount: 80,
        rating: 4.4,
        displayName: { text: 'Restaurant Test' }
    },
    competitors: [],
    footprint: { platforms: [], maturity: 0.5 },
    revenue: { yearlyLoss: 5000, roi: 2.5 },
    epidemicResult: { R0: 1.0 }
});

describe('scoreLead — Deep-Research-Override', () => {
    it('uses deepAssessment.leadPotential when provided (scoreSource = deep)', () => {
        const i = baseInputs();
        const deep = { leadPotential: 78, overallScore: 35, weaknesses: [], strengths: [] };
        const r = scoreLead(i.ws, i.tech, i.place, i.competitors, i.footprint, i.revenue, null, null, null, deep);
        expect(r.scoreSource).toBe('deep');
        expect(r.leadScore).toBeGreaterThanOrEqual(73); // 78 + small evBoost in either direction
        expect(r.leadScore).toBeLessThanOrEqual(83);
    });

    it('falls back to quick path when deepAssessment is null (scoreSource = quick)', () => {
        const i = baseInputs();
        const r = scoreLead(i.ws, i.tech, i.place, i.competitors, i.footprint, i.revenue, null, null, null, null);
        expect(r.scoreSource).toBe('quick');
        expect(r.quickScore).toBe(r.leadScore);
        expect(r.leadScore).toBeGreaterThanOrEqual(0);
        expect(r.leadScore).toBeLessThanOrEqual(100);
    });

    it('clamps deep leadPotential between 0 and 100', () => {
        const i = baseInputs();
        const high = scoreLead(i.ws, i.tech, i.place, i.competitors, i.footprint, i.revenue, null, null, null, { leadPotential: 150 });
        const low = scoreLead(i.ws, i.tech, i.place, i.competitors, i.footprint, i.revenue, null, null, null, { leadPotential: -20 });
        expect(high.leadScore).toBeLessThanOrEqual(100);
        expect(low.leadScore).toBeGreaterThanOrEqual(0);
    });

    it('treats null screenshotAnalysis as neutral, matching designQuality:5 (mid)', () => {
        const i = baseInputs();
        const withNull = scoreLead(i.ws, i.tech, i.place, i.competitors, i.footprint, i.revenue, null, null, null, null);
        const withMid  = scoreLead(i.ws, i.tech, i.place, i.competitors, i.footprint, i.revenue, null, { designQuality: 5 }, null, null);
        // null und designQuality:5 sollen beide das neutrale Damping (1.0) ausloesen
        // → Score-Differenz darf nur durch MC-Sampling-Rauschen entstehen.
        expect(Math.abs(withNull.leadScore - withMid.leadScore)).toBeLessThanOrEqual(5);
    });

    it('preserves quickScore alongside deep override for diagnostics', () => {
        const i = baseInputs();
        const deep = { leadPotential: 90, overallScore: 25 };
        const r = scoreLead(i.ws, i.tech, i.place, i.competitors, i.footprint, i.revenue, null, null, null, deep);
        expect(r.quickScore).toBeDefined();
        expect(typeof r.quickScore).toBe('number');
        expect(r.scoreSource).toBe('deep');
        // quickScore und leadScore koennen unterschiedlich sein
    });
});
