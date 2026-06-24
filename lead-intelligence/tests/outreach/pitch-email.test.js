import { describe, it, expect } from 'vitest';
import { buildPitchEmail } from '../../src/outreach/channels.js';

const URL = 'https://karriaro-leads.web.app/pitch/avenius-immobilien-07439c';

const makler = {
    url: 'https://stuttgart-wohnungssuche.de',
    place: {
        displayName: { text: 'Avenius Immobilien' },
        rating: 4.8, userRatingCount: 1600,
        formattedAddress: 'Königstraße 1, 70173 Stuttgart',
        primaryType: 'real_estate_agency',
        primaryTypeDisplayName: { text: 'Immobilienmakler' }
    },
    companyProfile: { branche: 'Immobilienmakler' },
    contactData: { owner: 'Sven Berger', allEmails: ['immo@avenius.de'] }
};

describe('buildPitchEmail — Neva-Voice Pitch-Mail', () => {
    it('referenziert die generierte Pitch-URL', () => {
        const m = buildPitchEmail(makler, URL);
        expect(m.body).toContain(URL);
    });

    it('nennt echte Substanz (Sterne + Bewertungen) wenn vorhanden', () => {
        const m = buildPitchEmail(makler, URL);
        expect(m.body).toContain('4,8 Sternen');
        expect(m.body).toContain('1600 Bewertungen');
        expect(m.body).toContain('Avenius Immobilien');
    });

    it('persönliche Anrede aus contactData.owner', () => {
        const m = buildPitchEmail(makler, URL);
        expect(m.body).toMatch(/^Sehr geehrte\/r Sven Berger,/);
        expect(m.recipientEmail).toBe('immo@avenius.de');
    });

    it('Makler-Werkzeuge in der Mail (branche-adaptiv)', () => {
        const m = buildPitchEmail(makler, URL);
        expect(m.body).toContain('Sofort-Wertermittlung');
    });

    it('Restaurant → andere Werkzeuge, KEINE Makler-Begriffe', () => {
        const resto = { ...makler, companyProfile: { branche: 'Restaurant' }, place: { ...makler.place, primaryType: 'restaurant' } };
        const m = buildPitchEmail(resto, URL);
        expect(m.body).toContain('Reservierung');
        expect(m.body).not.toContain('Wertermittlung');
    });

    it('ohne owner: neutrale Anrede; ohne rating: keine erfundene Bewertungszeile', () => {
        const thin = { url: 'https://x-test.de', place: { displayName: { text: 'X GmbH' }, formattedAddress: 'Stuttgart' }, companyProfile: {}, contactData: {} };
        const m = buildPitchEmail(thin, URL);
        expect(m.body).toContain('Sehr geehrte Damen und Herren,');
        expect(m.body).not.toMatch(/\d+ Bewertungen/);
        expect(m.recipientEmail).toBeNull();
    });

    it('Betreff trägt den Firmennamen', () => {
        const m = buildPitchEmail(makler, URL);
        expect(m.subject).toContain('Avenius Immobilien');
    });

    it('Marken-Anker handcodiert + kein Abo, keine verbotenen Superlative', () => {
        const m = buildPitchEmail(makler, URL);
        expect(m.body).toContain('handcodiert');
        expect(m.body).toContain('kein Abo');
        expect(m.body).not.toMatch(/\bgarantiert\b|\bNummer 1\b|\bunschlagbar\b/i);
    });
});
