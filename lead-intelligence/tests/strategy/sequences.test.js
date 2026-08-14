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
        // a11y < 70 → Barrierefreiheits-Betreff in Tag 8.
        // 2026-08-14: war /BFSG/. Der Betreff behauptete eine Pflicht, die für die
        // meisten Empfänger gar nicht gilt (§§ 1, 3 BFSG), und der Rumpf sagte
        // „Erste Abmahnungen laufen" — unbelegbar. Jetzt steht der gemessene Wert da.
        expect(seq[2].subject).toMatch(/Barrierefreiheit 55\/100/);
        expect(seq[2].body).toMatch(/55\/100/);
        expect(seq[2].subject + seq[2].body).not.toMatch(/Abmahn|Bußgeld|Pflicht/);
    });

    it('robust gegen fehlende url (kein Crash)', () => {
        const seq = buildSequence({ ws: {} });
        expect(seq).toHaveLength(5);
        expect(seq[0].subject).toContain('Ihre-Website');
    });
});
