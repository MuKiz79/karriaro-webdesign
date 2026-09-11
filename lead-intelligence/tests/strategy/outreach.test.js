import { describe, it, expect } from 'vitest';
import { buildOutreachPack } from '../../src/strategy/outreach.js';

const baseData = {
    url: 'https://www.beispiel-friseur.de',
    ws: { perf: 35, isHttps: true, viewport: true, seo: 60, a11y: 65 },
    // 2026-09-10: war 4.9.0. Die korrigierte Support-Tabelle (analysis/tech-age.js)
    // weiss, dass die 4er-Reihe ab 4.7 weiter Sicherheitsupdates bekommt — 4.9 ist
    // damit kein hartes Tech-Alter mehr (gemessen: severity 3). Die Fixture soll
    // aber genau einen harten Anker tragen, gegen den die Barrierefreiheit ohne
    // geprüfte Pflichtlage NICHT gewinnen darf. 4.0 ist seit 09/2022 ohne Updates
    // (severity 5) — in der alten wie in der neuen Tabelle.
    tech: { cms: 'WordPress', version: '4.0.0', isBaukasten: false },
    place: {
        displayName: { text: 'Friseur Beispiel' },
        userRatingCount: 80,
        rating: 4.4,
        primaryType: 'hair_salon'
    },
    wayback: { yearsSince: 4.2, domainAgeYears: 9, firstSeen: '2016-04-01', lastChanged: '2021-01-01' },
    competitors: [
        { displayName: { text: 'Friseur A' }, rating: 4.8, userRatingCount: 120, websiteUri: 'https://a.de', primaryType: 'hair_salon' },
        { displayName: { text: 'Friseur B' }, rating: 4.6, userRatingCount: 95, primaryType: 'hair_salon' },
        { displayName: { text: 'Friseur C' }, rating: 4.5, userRatingCount: 60, primaryType: 'hair_salon' }
    ],
    // `fine` steht hier ABSICHTLICH noch drin: Alt-Daten aus Firestore und aus
    // laufenden Caches tragen das Feld weiter. Die Tests unten beweisen, dass es
    // in keinen Text mehr einfliesst — ein Feld zu löschen ist leichter, als
    // sicherzustellen, dass niemand es mehr liest.
    bfsgScore: { risk: 'hoch', complianceScore: 35, fine: '50.000€' },
    revenue: { yearlyLoss: 8500 },
    result: { leadScore: 72 }
};

describe('buildOutreachPack', () => {
    it('produces a non-empty pack with three tone variants', () => {
        const pack = buildOutreachPack(baseData);
        expect(pack.available).toBe(true);
        expect(pack.variants).toHaveLength(3);
        for (const v of pack.variants) {
            expect(v.subject).toBeTruthy();
            expect(v.body).toBeTruthy();
            expect(v.copyText).toContain('Betreff:');
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2026-08-14 — Die Barrierefreiheit führt nur noch mit GEPRÜFTER Betroffenheit.
    //
    // Vorher gewann sie immer mit severity 5, weil sie als Rechtsdruck galt
    // („Bußgelder bis ${fine}"). Ohne diese Drohung ist sie ein echter, aber
    // schwächerer Hebel als ein hartes Tech-Alter — außer die Seite ermöglicht
    // nachweislich einen Online-Abschluss, dann kann das BFSG tatsächlich greifen.
    // ─────────────────────────────────────────────────────────────────────────

    it('ohne geprüfte Pflichtlage führt die Barrierefreiheit NICHT mehr', () => {
        const pack = buildOutreachPack(baseData);
        expect(pack.bestPitchAngle).not.toBe('bfsg');
        // Das Argument verschwindet aber nicht — es steht nur nicht mehr vorn.
        const bfsgArg = pack.allArgs.find(a => a.type === 'bfsg');
        expect(bfsgArg).toBeTruthy();
        expect(bfsgArg.severity).toBe(4);
        expect(bfsgArg.text).not.toMatch(/Bußgeld|Abmahn|100\.000|50\.000/);
    });

    it('mit belegtem Online-Abschluss führt sie wieder (severity 5, mit Vorbehalt)', () => {
        const pack = buildOutreachPack({
            ...baseData,
            bfsgScore: {
                ...baseData.bfsgScore,
                rechtsHinweis: 'Hinzu kommt: Die Seite ermöglicht einen Online-Abschluss (Shopify-Shop). '
                    + 'Damit kann sie unter das BFSG fallen. Ob eine Pflicht besteht, hängt zusätzlich '
                    + 'von der Betriebsgröße ab.'
            }
        });
        const bfsgArg = pack.allArgs.find(a => a.type === 'bfsg');
        expect(bfsgArg.severity).toBe(5);
        expect(bfsgArg.text).toMatch(/Betriebsgröße/);   // der Vorbehalt fährt in die Mail mit
        expect(bfsgArg.text).not.toMatch(/Bußgeld|Abmahn/);
    });

    it('falls back to tech_age when BFSG is low risk', () => {
        const data = { ...baseData, bfsgScore: { risk: 'niedrig', complianceScore: 80 } };
        const pack = buildOutreachPack(data);
        expect(pack.available).toBe(true);
        expect(pack.allArgs.find(a => a.type === 'tech_age')).toBeTruthy();
    });

    it('Mockup wins over BFSG when both available (severity tie, mockup first)', () => {
        const data = {
            ...baseData,
            mockupSuggestion: { headline: 'Friseur Beispiel — frischer Auftritt 2026', subline: 'Mobile First, Online-Buchung integriert' }
        };
        const pack = buildOutreachPack(data);
        expect(pack.bestPitchAngle).toBe('mockup');
        expect(pack.mockupHeadline).toMatch(/frischer Auftritt/);
    });

    it('exposes competitors filtered by quality threshold', () => {
        const pack = buildOutreachPack(baseData);
        expect(pack.competitors.length).toBeGreaterThanOrEqual(2);
        for (const c of pack.competitors) {
            expect(c.rating).toBeGreaterThanOrEqual(4.0);
            expect(c.reviews).toBeGreaterThan(30);
        }
    });

    it('filters competitors to same primaryType (no cross-branche pollution)', () => {
        // Bug fixed: vorher wurden Tankstelle/Parkhaus als "Konkurrenz" eines
        // Immobilienmaklers gezeigt, weil der primaryType-Filter fehlte.
        const data = {
            ...baseData,
            competitors: [
                { displayName: { text: 'Friseur A' }, rating: 4.8, userRatingCount: 120, primaryType: 'hair_salon' },
                { displayName: { text: 'JET Tankstelle' }, rating: 4.4, userRatingCount: 678, primaryType: 'gas_station' },
                { displayName: { text: 'Parkhaus' }, rating: 4.3, userRatingCount: 336, primaryType: 'parking' },
                { displayName: { text: 'Friseur B' }, rating: 4.6, userRatingCount: 95, primaryType: 'hair_salon' }
            ]
        };
        const pack = buildOutreachPack(data);
        for (const c of pack.competitors) {
            expect(c.name).toMatch(/^Friseur/);
        }
        // Tankstelle und Parkhaus sollten draussen sein
        expect(pack.competitors.find(c => c.name.includes('Tankstelle'))).toBeUndefined();
        expect(pack.competitors.find(c => c.name.includes('Parkhaus'))).toBeUndefined();
    });

    it('Mailtext nennt nur Mitbewerber derselben Branche und nur Gemessenes', () => {
        const data = {
            ...baseData,
            competitors: [
                { displayName: { text: 'Friseur A' }, rating: 4.8, userRatingCount: 120, primaryType: 'hair_salon' },
                { displayName: { text: 'JET Tankstelle' }, rating: 4.4, userRatingCount: 678, primaryType: 'gas_station' },
                { displayName: { text: 'Friseur B' }, rating: 4.6, userRatingCount: 95, primaryType: 'hair_salon' }
            ]
        };
        const arg = buildOutreachPack(data).allArgs.find(a => a.type === 'competitors');
        expect(arg).toBeTruthy();
        expect(arg.text).toContain('Friseur A, Friseur B');          // Gegenprobe: gleiche Branche bleibt
        expect(arg.text).not.toContain('Tankstelle');
        expect(arg.text).not.toMatch(/modernere|ranken|Schwachstellen/);
        // Nur EIN branchengleicher Mitbewerber → kein Vergleichs-Argument
        const einer = buildOutreachPack({ ...data, competitors: data.competitors.slice(0, 2) });
        expect(einer.allArgs.find(a => a.type === 'competitors')).toBeUndefined();
    });

    it('each variant body stays under ~120 words', () => {
        const pack = buildOutreachPack(baseData);
        for (const v of pack.variants) {
            expect(v.wordCount).toBeLessThan(120);
        }
    });

    it('returns unavailable when no pain signals exist', () => {
        const sterileData = {
            url: 'https://www.test.de',
            ws: { perf: 95, isHttps: true, viewport: true, seo: 95, a11y: 95 },
            tech: { cms: 'WordPress', version: '6.4', isBaukasten: false },
            place: { displayName: { text: 'Test' }, userRatingCount: 5, rating: 4.0 },
            wayback: { yearsSince: 0.2, domainAgeYears: 1 },
            competitors: [],
            bfsgScore: { risk: 'niedrig' },
            revenue: { yearlyLoss: 0 },
            result: { leadScore: 20 }
        };
        const pack = buildOutreachPack(sterileData);
        expect(pack.available).toBe(false);
    });

    it('mailto-friendly: subject and body are plain strings', () => {
        const pack = buildOutreachPack(baseData);
        expect(typeof pack.primary.subject).toBe('string');
        expect(typeof pack.primary.body).toBe('string');
        expect(pack.primary.body).not.toContain('<');
    });
});

// 2026-09-10 — kein geratener Empfänger, Preise aus einer Quelle, keine Zeitzusagen.
describe('buildOutreachPack — Empfänger, Preise, Zusagen', () => {
    it('ohne gefundene Adresse KEIN Empfänger (früher: geratene info@<domain>)', () => {
        const pack = buildOutreachPack(baseData);
        expect(pack.recipientEmail).toBeNull();
        expect(pack.recipientHinweis).toMatch(/Keine E-Mail-Adresse gefunden/);
    });

    it('gefundene Adresse wird Empfänger (Gegenprobe)', () => {
        const pack = buildOutreachPack({ ...baseData, contactData: { owner: null, genericEmails: ['info@beispiel-friseur.de'] } });
        expect(pack.recipientEmail).toBe('info@beispiel-friseur.de');
        expect(pack.recipientHinweis).toBeNull();
    });

    it('der Profil-Freitext „Preisbereich" landet nicht in der Mail — Preis kommt aus PREISE', async () => {
        const { config } = await import('../../src/config.js');
        const vorher = config.profile.priceRange;
        config.profile.priceRange = 'ab 990 €';
        try {
            const pack = buildOutreachPack(baseData);   // hair_salon → Essential
            for (const v of pack.variants) {
                expect(v.body).toContain('ab 1.290 € einmalig');
                expect(v.body).not.toContain('990 €');
            }
        } finally {
            config.profile.priceRange = vorher;
        }
    });

    it('keine Lieferzeit-, Reaktionszeit- oder Verknappungs-Zusage in irgendeiner Variante und Stufe', () => {
        const typen = [['hair_salon'], ['plumber'], ['dentist'], ['lawyer']];
        for (const types of typen) {
            for (const touchNumber of [1, 3]) {
                const pack = buildOutreachPack({
                    ...baseData, touchNumber,
                    tier: types[0] === 'lawyer' ? 'premium-plus' : null,
                    place: { ...baseData.place, types, primaryType: types[0] }
                });
                for (const v of pack.variants) {
                    const t = `${v.subject} ${v.body} ${v.bodyHtml}`;
                    expect(t).not.toMatch(/Tagen online|24h|SLA|limitiert|Maklerprovision|refinanziert|in 2 Wochen|48 Stunden/);
                    expect(t).toMatch(/erst der Entwurf, dann Ihre Entscheidung/);
                }
            }
        }
    });
});
