import { describe, it, expect } from 'vitest';
import { matchEmployer, distinctiveTokens, normalizeName, deriveJobOpenings } from '../../src/signals/employer-match.js';

describe('normalizeName / distinctiveTokens', () => {
    it('löst Umlaute auf, damit "Müller" und "Mueller" zusammenfinden', () => {
        expect(normalizeName('Müller')).toEqual(normalizeName('Mueller'));
    });

    it('entfernt Rechtsformen', () => {
        expect(normalizeName('Beispiel GmbH & Co. KG')).not.toContain('gmbh');
    });

    it('entfernt Branchen-Gattungsbegriffe aus den distinktiven Tokens', () => {
        expect(distinctiveTokens('Zahnarztpraxis Dr. Müller')).toEqual(['mueller']);
    });

    it('ein reiner Gattungsname hat KEINE distinktiven Tokens', () => {
        expect(distinctiveTokens('Zahnarztpraxis Köln')).toEqual([]);
    });
});

describe('matchEmployer', () => {
    it('findet denselben Betrieb trotz anderer Schreibweise', () => {
        expect(matchEmployer('Zahnarztpraxis Dr. Müller', ['Dr. Mueller GmbH', 'Praxis Schmidt']))
            .toBe('Dr. Mueller GmbH');
    });

    it('matcht NICHT über einen reinen Gattungsnamen', () => {
        // Sonst bekäme "Zahnarztpraxis Köln" jede Zahnarztstelle der Stadt
        // angerechnet — ein erfundenes Kaufsignal.
        expect(matchEmployer('Zahnarztpraxis Köln', ['Zahnarztpraxis Schmidt', 'Zahnarzt Zentrum'])).toBeNull();
    });

    it('matcht nicht, wenn kein distinktives Wort übereinstimmt', () => {
        expect(matchEmployer('Friseursalon Sonnenschein', ['Haarstudio Beispiel GmbH'])).toBeNull();
    });

    it('wählt bei mehreren Kandidaten den mit dem größten Overlap', () => {
        expect(matchEmployer('Bäckerei Sonnenschein Kablan', ['Sonnenschein GmbH', 'Sonnenschein Kablan OHG']))
            .toBe('Sonnenschein Kablan OHG');
    });

    it('leere Eingaben ergeben null statt Absturz', () => {
        expect(matchEmployer('', ['Beispiel GmbH'])).toBeNull();
        expect(matchEmployer('Beispiel Betrieb', [])).toBeNull();
        expect(matchEmployer('Beispiel Betrieb', null)).toBeNull();
    });
});

describe('deriveJobOpenings', () => {
    const payload = (over = {}) => ({
        ok: true, total: 4, count: 4,
        employers: ['Dr. Mueller GmbH'],
        jobs: [{ arbeitgeber: 'Dr. Mueller GmbH' }, { arbeitgeber: 'Dr. Mueller GmbH' }],
        ...over
    });

    it('liefert die Gesamtzahl, wenn der Arbeitgeber sauber matcht', () => {
        expect(deriveJobOpenings(payload(), 'Zahnarztpraxis Dr. Müller'))
            .toEqual({ openings: 4, employer: 'Dr. Mueller GmbH' });
    });

    it('liefert 0 ohne Match — lieber kein Signal als ein erfundenes', () => {
        expect(deriveJobOpenings(payload(), 'Bäckerei Sonnenschein').openings).toBe(0);
    });

    it('Ketten-Schutz: bei sehr breiter Trefferliste zählen nur exakte Treffer', () => {
        const wide = payload({
            total: 300,
            jobs: [
                { arbeitgeber: 'Dr. Mueller GmbH' },
                { arbeitgeber: 'Fremdfirma AG' },
                { arbeitgeber: 'Dr. Mueller GmbH' }
            ]
        });
        expect(deriveJobOpenings(wide, 'Zahnarztpraxis Dr. Müller').openings).toBe(2);
    });

    it('fehlende oder fehlerhafte Antwort ergibt 0', () => {
        expect(deriveJobOpenings(null, 'Irgendwas').openings).toBe(0);
        expect(deriveJobOpenings({ ok: false }, 'Irgendwas').openings).toBe(0);
    });
});

describe('Gattungs-Komposita (2026-08-16, Live-Fund Branchen-Jobsuche)', () => {
    it('„zahnzentrum" trägt einen Match NICHT mehr allein', () => {
        // Realfall: WEISS32 Zahnzentrum ↔ Hossam Marey Elite Zahnzentrum —
        // zwei völlig verschiedene Betriebe, gemeinsam nur das Kompositum.
        expect(matchEmployer('WEISS32 Zahnzentrum Stuttgart',
            ['Hossam Marey Elite Zahnzentrum'], 'Stuttgart')).toBeNull();
    });
    it('Gegenprobe: der echte Eigenname matcht weiter', () => {
        expect(matchEmployer('WEISS32 Zahnzentrum Stuttgart',
            ['WEISS32 MVZ GmbH', 'Hossam Marey Elite Zahnzentrum'], 'Stuttgart'))
            .toBe('WEISS32 MVZ GmbH');
    });
    it('MVZ/Gesundheitszentrum sind ebenfalls Gattung', () => {
        expect(matchEmployer('MVZ Gesundheitszentrum Stuttgart',
            ['MVZ Zahnorama GmbH'], 'Stuttgart')).toBeNull();
    });
});
