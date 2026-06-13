import { describe, it, expect } from 'vitest';
import { buildSequence, SEQUENCE_STEPS, TOUCHPOINTS } from '../../src/templates/sequences.js';

describe('sequences', () => {
    it('SEQUENCE_STEPS hat 5 Schritte, TOUCHPOINTS sind die 4 Follow-ups (ohne Tag 1)', () => {
        expect(SEQUENCE_STEPS.map(s => s.day)).toEqual([1, 4, 8, 12, 18]);
        expect(TOUCHPOINTS.map(s => s.day)).toEqual([4, 8, 12, 18]);
    });

    it('buildSequence liefert 5 Mails mit Domain + Performance im Erstkontakt', () => {
        const seq = buildSequence({ url: 'https://www.friseur-x.de', ws: { perf: 35, seo: 60, a11y: 55 }, revenue: { yearlyLoss: 8500 } });
        expect(seq).toHaveLength(5);
        expect(seq[0].subject).toContain('friseur-x.de');
        expect(seq[0].body).toContain('35/100');
        expect(seq[0].body).toContain('8.500');
        // a11y < 70 → BFSG-Betreff in Tag 8
        expect(seq[2].subject).toMatch(/BFSG/);
    });

    it('robust gegen fehlende url (kein Crash)', () => {
        const seq = buildSequence({ ws: {} });
        expect(seq).toHaveLength(5);
        expect(seq[0].subject).toContain('Ihre-Website');
    });
});
