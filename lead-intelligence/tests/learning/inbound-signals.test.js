import { describe, it, expect } from 'vitest';
import { calculateHeat, auditDocToLead, rankHotLeads, HEAT_CONSTANTS } from '../../src/learning/inbound-signals.js';

const NOW = 1735_000_000_000; // fix für deterministische Tests

describe('calculateHeat', () => {
    it('cold lead (no inbound, no visits) → 0', () => {
        const r = calculateHeat({}, NOW);
        expect(r.heat).toBe(0);
        expect(r.tier).toBe('cold');
    });

    it('inbound only → 30 (warm tier)', () => {
        const r = calculateHeat({ inbound: true }, NOW);
        expect(r.heat).toBe(30);
        expect(r.tier).toBe('cold');
    });

    it('inbound + 2 recent visits + tech severity 4 → ≥ 76', () => {
        const r = calculateHeat({
            inbound: true,
            visitCount: 2,
            lastVisitAtMs: NOW - 1000,
            techSeverity: 4
        }, NOW);
        // 30 + 16 + 20 + 10 = 76
        expect(r.heat).toBe(76);
        expect(r.tier).toBe('hot');
    });

    it('"100% lead": inbound + 5+ visits + recent + tech severity 5 + cta → 100', () => {
        const r = calculateHeat({
            inbound: true,
            visitCount: 5,
            lastVisitAtMs: NOW - 500,
            techSeverity: 5,
            ctaClicks: 2
        }, NOW);
        // 30 + 40 + 20 + 10 + 5 = 105 → clamp 100
        expect(r.heat).toBe(100);
        expect(r.tier).toBe('very_hot');
        expect(r.verdict).toMatch(/sofort kontaktieren/);
    });

    it('clamps visitCount above 5', () => {
        const a = calculateHeat({ inbound: true, visitCount: 5 }, NOW);
        const b = calculateHeat({ inbound: true, visitCount: 50 }, NOW);
        expect(a.heat).toBe(b.heat); // beide 30 + 40 = 70
    });

    it('does not give recent-bonus if last visit older than 24h', () => {
        const old = calculateHeat({
            inbound: true, visitCount: 3,
            lastVisitAtMs: NOW - 25 * 3600 * 1000,
            techSeverity: 4
        }, NOW);
        // 30 + 24 + 0 + 10 = 64
        expect(old.heat).toBe(64);
        expect(old.components.recent).toBe(false);
    });

    it('handles missing fields safely', () => {
        const r = calculateHeat(null, NOW);
        expect(r.heat).toBe(0);
        expect(r.components).toBeDefined();
    });
});

describe('auditDocToLead', () => {
    it('maps a Firestore doc to a lead structure', () => {
        const doc = {
            id: 'abc123',
            slug: 'abc123',
            domain: 'beispiel.de',
            url: 'https://beispiel.de',
            name: 'Max',
            email: 'max@beispiel.de',
            leadScore: 75,
            techAge: { severity: 4, headline: '⚠ Veraltet' },
            bfsg: { risk: 'hoch' },
            visitCount: 3,
            ctaClicks: 1,
            lastVisitAtMs: NOW - 1000,
            createdAtMs: NOW - 86400000,
            source: 'inbound_form'
        };
        const lead = auditDocToLead(doc);
        expect(lead.slug).toBe('abc123');
        expect(lead.domain).toBe('beispiel.de');
        expect(lead.techSeverity).toBe(4);
        expect(lead.inbound).toBe(true);
    });

    it('falls back to inbound=false when source is not set', () => {
        const lead = auditDocToLead({ id: 'x', techAge: {} });
        expect(lead.inbound).toBe(false);
    });
});

describe('rankHotLeads', () => {
    it('filters out leads below HOT_THRESHOLD and sorts by heat desc', () => {
        const docs = [
            { id: 'cold', source: 'inbound_form' }, // heat 30 → out
            {
                id: 'warm', source: 'inbound_form',
                visitCount: 2, lastVisitAtMs: NOW - 1000,
                techAge: { severity: 4 }
            }, // 76 → in
            {
                id: 'very_hot', source: 'inbound_form',
                visitCount: 5, lastVisitAtMs: NOW - 1000,
                techAge: { severity: 5 }, ctaClicks: 1
            } // 100 → in
        ];
        const ranked = rankHotLeads(docs, NOW);
        expect(ranked).toHaveLength(2);
        expect(ranked[0].slug).toBe('very_hot');
        expect(ranked[1].slug).toBe('warm');
    });

    it('returns empty array when no inbound leads', () => {
        expect(rankHotLeads([], NOW)).toEqual([]);
    });
});

describe('HEAT_CONSTANTS', () => {
    it('exports thresholds', () => {
        expect(HEAT_CONSTANTS.HOT_THRESHOLD).toBe(60);
        expect(HEAT_CONSTANTS.VERY_HOT_THRESHOLD).toBe(80);
    });
});
