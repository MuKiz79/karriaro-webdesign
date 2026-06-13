import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cloud-Functions mocken (kein Netzwerk im Test).
vi.mock('../../src/api/cloud-functions.js', () => ({
    enrichContact: vi.fn(),
    checkEmailDeliverability: vi.fn(),
    deepResearch: vi.fn(),
    generateMockup: vi.fn()
}));

import * as cf from '../../src/api/cloud-functions.js';
import { generateBulkOutreach, makeRateBudget, needsDeep } from '../../src/strategy/bulk-outreach.js';
import { buildPitchInputs } from '../../src/strategy/pitch-inputs.js';

function leadFixture(domain, score, extra = {}) {
    const pitchInputs = buildPitchInputs({
        url: `https://${domain}`,
        ws: { perf: 30, isHttps: true, seo: 50, a11y: 55 },
        tech: { cms: 'WordPress', version: '4.9' },
        bfsgScore: { risk: 'hoch', complianceScore: 35, fine: '50.000€' },
        place: { primaryType: 'hair_salon', displayName: { text: domain }, types: ['hair_salon'] },
        result: { leadScore: score }
    });
    return { domain, url: `https://${domain}`, leadScore: score, status: 'neu', pitchInputs, ...extra };
}

beforeEach(() => {
    cf.enrichContact.mockReset().mockResolvedValue({ owner: 'Anna', quality: 'persönlich', allEmails: ['a@x.de'], emails: ['a@x.de'], genericEmails: [] });
    cf.checkEmailDeliverability.mockReset().mockResolvedValue({ score: 80, spf: true, dkim: true, dmarc: true, label: 'gut' });
    cf.deepResearch.mockReset().mockResolvedValue({ ok: true, assessment: { keyPitchAngle: 'X', category: 'hair_salon', weaknesses: [{ title: 'W', evidence: 'E', severity: 5, category: 'c' }] } });
    cf.generateMockup.mockReset().mockResolvedValue({ ok: true, svgDataUrl: 'data:image/svg+xml;base64,AAA', htmlSnippet: '<svg/>', spec: { hero: { headline: 'H' } } });
});

describe('makeRateBudget', () => {
    it('lässt genau maxPerHour Calls zu', () => {
        const b = makeRateBudget(3);
        expect(b.tryConsume()).toBe(true);
        expect(b.tryConsume()).toBe(true);
        expect(b.tryConsume()).toBe(true);
        expect(b.tryConsume()).toBe(false);
        expect(b.left()).toBe(0);
    });
});

describe('needsDeep', () => {
    it('true wenn kein deepAssessment, false wenn vorhanden', () => {
        expect(needsDeep(null)).toBe(true);
        expect(needsDeep({ deepAssessment: null })).toBe(true);
        expect(needsDeep({ deepAssessment: { weaknesses: [{ title: 'x' }] } })).toBe(false);
    });
});

describe('generateBulkOutreach — Kontakt-Gate', () => {
    it('quality none → outreachStatus no_contact, kein Pack', async () => {
        cf.enrichContact.mockResolvedValue({ quality: 'none', allEmails: [] });
        const out = await generateBulkOutreach([leadFixture('a.de', 70)], { allowDeep: false });
        expect(out[0].outreachStatus).toBe('no_contact');
        expect(out[0].outreachPack).toBeNull();
    });

    it('persönlicher Kontakt → ready, Pack mit Compliance + Empfänger', async () => {
        const out = await generateBulkOutreach([leadFixture('a.de', 70)], { allowDeep: false });
        expect(out[0].outreachStatus).toBe('ready');
        expect(out[0].outreachPack.complianceApplied).toBe(true);
        expect(out[0].outreachPack.recipientEmail).toBe('a@x.de');
        expect(out[0].outreachPack.primary.body).toContain('kein Interesse');
        expect(out[0].aiTier).toBe('light');
    });
});

describe('generateBulkOutreach — Suppression', () => {
    it('suppressed-Lead wird übersprungen OHNE Kontakt-Call', async () => {
        const out = await generateBulkOutreach([leadFixture('a.de', 70, { suppressed: true })], { allowDeep: false });
        expect(out[0].outreachStatus).toBe('suppressed');
        expect(cf.enrichContact).toHaveBeenCalledTimes(0);
    });
});

describe('generateBulkOutreach — onProgress + Light-Lane', () => {
    it('ruft onProgress total-mal, done monoton bis total', async () => {
        const leads = [leadFixture('a.de', 70), leadFixture('b.de', 50), leadFixture('c.de', 40)];
        const seen = [];
        const out = await generateBulkOutreach(leads, { allowDeep: false }, p => seen.push(p.done));
        expect(out).toHaveLength(3);
        expect(seen.filter(d => typeof d === 'number')).toHaveLength(3);
        expect(Math.max(...seen)).toBe(3);
        expect(cf.deepResearch).toHaveBeenCalledTimes(0); // allowDeep:false
    });
});

describe('generateBulkOutreach — Deep-Lane + Rate-Budget', () => {
    it('drosselt deepResearch auf deepMaxPerHour, Rest deepDeferred', async () => {
        // 50 Leads, alle Score 90 → topN = min(20, ceil(50*0.2)=10) = 10 Deep-Kandidaten.
        const leads = Array.from({ length: 50 }, (_, i) => leadFixture(`lead${i}.de`, 90));
        const out = await generateBulkOutreach(leads, { allowDeep: true, deepMaxPerHour: 5 });

        expect(cf.deepResearch).toHaveBeenCalledTimes(5);   // genau das Budget
        expect(cf.generateMockup).toHaveBeenCalledTimes(5);
        expect(out.filter(r => r.aiTier === 'deep')).toHaveLength(5);
        expect(out.filter(r => r.deepDeferred)).toHaveLength(5); // 10 Kandidaten − 5 Budget
    });

    it('respektiert die Score-Schwelle (Leads < threshold bekommen kein Deep)', async () => {
        // 10 Leads: 2× Score 90 (top-2, ≥60), Rest 30 → topN=2, beide ≥60 → genau 2 Deep.
        const leads = [
            leadFixture('hi1.de', 90), leadFixture('hi2.de', 90),
            ...Array.from({ length: 8 }, (_, i) => leadFixture(`lo${i}.de`, 30))
        ];
        await generateBulkOutreach(leads, { allowDeep: true, deepMaxPerHour: 10 });
        expect(cf.deepResearch).toHaveBeenCalledTimes(2);
    });
});
