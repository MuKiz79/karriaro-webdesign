import { describe, it, expect } from 'vitest';
import { buildPitchInputs, mapToOutreachData, coerceLegacyLead } from '../../src/strategy/pitch-inputs.js';
import { buildOutreachPack } from '../../src/strategy/outreach.js';

// Reiches Single-Check-Result (state.lastResult-ähnlich). Top-Arg ist BFSG (severity 5),
// bewusst OHNE visuellen Mockup-SVG, damit der Round-Trip den bestPitchAngle nicht
// durch das gedroppte svgDataUrl verschiebt (visual_mockup → mockup).
const richResult = {
    url: 'https://www.beispiel-friseur.de',
    ws: { perf: 35, isHttps: true, viewport: true, seo: 60, a11y: 65 },
    tech: { cms: 'WordPress', version: '4.9.0', isBaukasten: false },
    wayback: { yearsSince: 4.2, domainAgeYears: 9, firstSeen: '2016-04-01', lastChanged: '2021-01-01' },
    place: {
        displayName: { text: 'Friseur Beispiel' },
        userRatingCount: 80, rating: 4.4,
        primaryType: 'hair_salon', types: ['hair_salon']
    },
    competitors: [
        { displayName: { text: 'Friseur A' }, rating: 4.8, userRatingCount: 120, websiteUri: 'https://a.de', primaryType: 'hair_salon' },
        { displayName: { text: 'Friseur B' }, rating: 4.6, userRatingCount: 95, primaryType: 'hair_salon' }
    ],
    bfsgScore: { risk: 'hoch', complianceScore: 35, fine: '50.000€' },
    revenue: { yearlyLoss: 8500 },
    security: {
        summary: { topPitch: 'Offenes .git', critical: 1, high: 0 },
        findings: [{ title: '.git offen', severity: 5, pitchArg: 'Ihr .git-Verzeichnis ist öffentlich.', evidence: '/.git/HEAD', fixAdvice: 'Sperren', category: 'exposure' }]
    },
    deepAssessment: {
        keyPitchAngle: 'Veraltete Buchung kostet Termine',
        category: 'hair_salon',
        weaknesses: [{ title: 'Keine Online-Buchung', evidence: 'Kein Buchungs-Widget gefunden', severity: 5, category: 'conversion' }]
    },
    // Mockup nur als spec.hero.headline (svgDataUrl absichtlich nicht gesetzt)
    mockup: { spec: { hero: { headline: 'Friseur Beispiel — frischer Auftritt 2026' } } },
    branchStandards: { missing: [{ name: 'Online-Buchung' }, { name: 'Bewertungs-Widget' }, { name: 'Galerie' }] },
    result: { leadScore: 72 }
};

describe('buildPitchInputs', () => {
    it('verdichtet das reiche Result und enthält die teuren Signale', () => {
        const pi = buildPitchInputs(richResult);
        expect(pi).toBeTruthy();
        expect(pi.url).toBe('https://www.beispiel-friseur.de');
        expect(pi.bfsgScore.risk).toBe('hoch');
        expect(pi.security.findings[0].severity).toBe(5);
        expect(pi.deepAssessment.weaknesses[0].title).toBe('Keine Online-Buchung');
    });

    it('persistiert NIE das Mockup-SVG, nur die Headline', () => {
        const withSvg = { ...richResult, mockup: { svgDataUrl: 'data:image/svg+xml;base64,AAAA', spec: { hero: { headline: 'H' } }, htmlSnippet: '<svg/>' } };
        const pi = buildPitchInputs(withSvg);
        const json = JSON.stringify(pi);
        expect(json).not.toContain('svgDataUrl');
        expect(json).not.toContain('data:image');
        expect(pi.mockupHint.headline).toBe('H');
    });

    it('enthält kein undefined (Firestore-tauglich)', () => {
        const pi = buildPitchInputs(richResult);
        // clean() via JSON-Roundtrip → strukturell identisch, kein undefined
        expect(pi).toEqual(JSON.parse(JSON.stringify(pi)));
    });

    it('akzeptiert einen mageren Scanner-Lead (websiteUri statt url, kein deep/bfsg)', () => {
        const scannerLead = {
            websiteUri: 'https://kleiner-laden.de',
            ws: { perf: 28, isHttps: false }, tech: { cms: 'Wix', isBaukasten: true },
            place: { primaryType: 'florist', displayName: { text: 'Blumen Müller' } },
            leadScore: 40
        };
        const pi = buildPitchInputs(scannerLead);
        expect(pi.url).toBe('https://kleiner-laden.de');
        expect(pi.tech.isBaukasten).toBe(true);
        expect(pi.deepAssessment).toBeNull();
        expect(pi.leadScore).toBe(40);
    });

    it('gibt null ohne url/websiteUri zurück', () => {
        expect(buildPitchInputs({ ws: { perf: 10 } })).toBeNull();
        expect(buildPitchInputs(null)).toBeNull();
    });
});

describe('Round-Trip: buildPitchInputs → mapToOutreachData → buildOutreachPack', () => {
    it('liefert dasselbe bestPitchAngle wie das Original-Result (verlustfreies Mapping)', () => {
        const direct = buildOutreachPack(richResult);
        const roundTrip = buildOutreachPack(mapToOutreachData(buildPitchInputs(richResult)));
        expect(direct.available).toBe(true);
        expect(roundTrip.available).toBe(true);
        expect(roundTrip.bestPitchAngle).toBe(direct.bestPitchAngle);
    });

    it('reicht contactData (recipientEmail) und touchNumber durch', () => {
        const pi = buildPitchInputs(richResult);
        const data = mapToOutreachData(pi, { contactData: { owner: 'Anna Beispiel', allEmails: ['anna@beispiel-friseur.de'] }, touchNumber: 3 });
        const pack = buildOutreachPack(data);
        expect(pack.recipientEmail).toBe('anna@beispiel-friseur.de');
        // touchNumber=3 → Pricing-Reveal im Body
        expect(pack.primary.body).toMatch(/Preislich konkret/);
    });

    it('mapToOutreachData(null) ist null (kein Crash)', () => {
        expect(mapToOutreachData(null)).toBeNull();
        expect(mapToOutreachData({})).toBeNull();
    });
});

describe('coerceLegacyLead', () => {
    it('baut aus Summary-Feldern ein valides Pack (mindestens tech_age/perf)', () => {
        const legacy = { domain: 'alt-betrieb.de', cms: 'WordPress', isBaukasten: false, perf: 30, seo: 50, a11y: 55, type: 'plumber', name: 'Alt Betrieb', leadScore: 65 };
        const pack = buildOutreachPack(coerceLegacyLead(legacy));
        expect(pack.available).toBe(true);
        expect(pack.allArgs.length).toBeGreaterThan(0);
    });

    it('leitet die url aus der domain ab', () => {
        const data = coerceLegacyLead({ domain: 'x.de', cms: 'Joomla', perf: 20 });
        expect(data.url).toBe('https://x.de');
    });
});
