import { describe, it, expect } from 'vitest';
import {
    localDay,
    recommendedDailyCap,
    createdToday,
    remainingToday,
    recordCreated
} from '../../src/outreach/send-budget.js';

const TODAY = '2026-06-22';

describe('send-budget — Warmlauf-Rampe', () => {
    it('Tag 1 (keine Historie) empfiehlt 20', () => {
        expect(recommendedDailyCap({ counts: {} }, TODAY)).toBe(20);
    });

    it('steigt mit Anzahl bisheriger Aktiv-Tage: 20 → 25 → 30 → 40 → 50', () => {
        const ramp = [20, 25, 30, 40, 50];
        for (let priorDays = 0; priorDays < ramp.length; priorDays++) {
            const counts = {};
            for (let d = 0; d < priorDays; d++) counts[`2026-06-${String(10 + d).padStart(2, '0')}`] = 5;
            expect(recommendedDailyCap({ counts }, TODAY)).toBe(ramp[priorDays]);
        }
    });

    it('plateauiert bei 50 nach genug Aktiv-Tagen', () => {
        const counts = {};
        for (let d = 0; d < 12; d++) counts[`2026-05-${String(10 + d).padStart(2, '0')}`] = 8;
        expect(recommendedDailyCap({ counts }, TODAY)).toBe(50);
    });

    it('zählt nur Tage mit >0 Entwürfen als Aktiv-Tag', () => {
        const counts = { '2026-06-20': 0, '2026-06-21': 0 };
        expect(recommendedDailyCap({ counts }, TODAY)).toBe(20); // 0 Aktiv-Tage → Stufe 0
    });

    it('zählt HEUTE nicht als bisherigen Aktiv-Tag (Rampe steigt erst morgen)', () => {
        const counts = { [TODAY]: 15 };
        expect(recommendedDailyCap({ counts }, TODAY)).toBe(20);
    });
});

describe('send-budget — Tageszähler & Rest', () => {
    it('createdToday liest den heutigen Zähler', () => {
        expect(createdToday({ counts: { [TODAY]: 12 } }, TODAY)).toBe(12);
        expect(createdToday({ counts: {} }, TODAY)).toBe(0);
    });

    it('remainingToday = cap - createdToday, nie negativ', () => {
        expect(remainingToday({ counts: { [TODAY]: 5 } }, TODAY)).toBe(15);   // 20 - 5
        expect(remainingToday({ counts: { [TODAY]: 50 } }, TODAY)).toBe(0);   // 20 - 50 → 0
    });

    it('recordCreated addiert verbucht und ist rein (mutiert state nicht)', () => {
        const s0 = { counts: {} };
        const s1 = recordCreated(s0, 8, TODAY);
        expect(s1.counts[TODAY]).toBe(8);
        expect(s0.counts[TODAY]).toBeUndefined();        // Original unberührt
        const s2 = recordCreated(s1, 4, TODAY);
        expect(s2.counts[TODAY]).toBe(12);
    });

    it('recordCreated ignoriert negative/ungültige Mengen', () => {
        const s = recordCreated({ counts: {} }, -5, TODAY);
        expect(s.counts[TODAY]).toBe(0);
    });

    it('recordCreated kappt alte Tage (Storage klein)', () => {
        let s = { counts: {} };
        for (let d = 0; d < 60; d++) {
            s = recordCreated(s, 1, `2026-${String(1 + Math.floor(d / 28)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}`);
        }
        expect(Object.keys(s.counts).length).toBeLessThanOrEqual(45);
    });
});

describe('send-budget — localDay', () => {
    it('formatiert als lokales YYYY-MM-DD', () => {
        expect(localDay(new Date(2026, 5, 7))).toBe('2026-06-07');  // Monat 0-basiert, Zero-Pad
        expect(localDay(new Date(2026, 11, 31))).toBe('2026-12-31');
    });
});
