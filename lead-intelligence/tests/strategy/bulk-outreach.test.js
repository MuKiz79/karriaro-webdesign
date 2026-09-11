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

// 2026-09-10 — Leads OHNE Kontaktgrundlage bekommen keinen Entwurf mehr (Kontakt-Gate,
// § 7 Abs. 2 Nr. 2 UWG). Die Bestandstests liefen mit Kalt-Leads; sie tragen jetzt
// eine dokumentierte Anfrage, damit sie weiter die Engine prüfen und nicht das Gate.
const ANFRAGE = { art: 'anfrage', datum: '2026-09-01T00:00:00.000Z', nachweis: 'Kontaktformular vom 01.09.' };

function leadFixture(domain, score, extra = {}) {
    const pitchInputs = buildPitchInputs({
        url: `https://${domain}`,
        ws: { perf: 30, isHttps: true, seo: 50, a11y: 55 },
        tech: { cms: 'WordPress', version: '4.9' },
        bfsgScore: { risk: 'hoch', complianceScore: 35, fine: '50.000€' },
        place: { primaryType: 'hair_salon', displayName: { text: domain }, types: ['hair_salon'] },
        result: { leadScore: score }
    });
    return { id: domain.replace(/\W/g, '_'), domain, url: `https://${domain}`, leadScore: score, status: 'neu', pitchInputs, kontaktGrundlage: ANFRAGE, ...extra };
}

function einwilligung(domain, extra = {}) {
    return {
        id: `e-${domain}`, email: `inhaber@${domain}`, domain, confirmedAt: Date.now() - 86400000, revokedAt: null,
        stopped: false, sequenceStep: 0, source: 'website-pruefen', createdAt: Date.now() - 2 * 86400000,
        unsubscribeToken: 'tok-' + domain, ...extra
    };
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
    it('ohne Kontaktgrundlage: no_basis, KEIN Netz-Call, KEIN Paket', async () => {
        const kalt = leadFixture('kalt.de', 90, { kontaktGrundlage: { art: 'keine' } });
        const out = await generateBulkOutreach([kalt], { allowDeep: true, einwilligungen: [] });
        expect(out[0].outreachStatus).toBe('no_basis');
        expect(out[0].outreachPack).toBeNull();
        expect(out[0].kontaktPruefung.erlaubt).toBe(false);
        expect(out[0].kontaktPruefung.grund).toMatch(/Keine Kontaktgrundlage/);
        expect(cf.enrichContact).toHaveBeenCalledTimes(0);
        expect(cf.deepResearch).toHaveBeenCalledTimes(0);
    });

    it('Anfrage ohne Nachweis trägt nicht (Gegenprobe zur vollständigen Anfrage)', async () => {
        const unvollstaendig = leadFixture('u.de', 70, { kontaktGrundlage: { art: 'anfrage', datum: '2026-09-01', nachweis: null } });
        const vollstaendig = leadFixture('v.de', 70);
        const out = await generateBulkOutreach([unvollstaendig, vollstaendig], { allowDeep: false, einwilligungen: [] });
        expect(out[0].outreachStatus).toBe('no_basis');
        expect(out[1].outreachStatus).toBe('ready');
    });

    it('quality none ohne sonstige Adresse → no_contact, kein Pack', async () => {
        cf.enrichContact.mockResolvedValue({ quality: 'none', allEmails: [] });
        const out = await generateBulkOutreach([leadFixture('a.de', 70)], { allowDeep: false, einwilligungen: [] });
        expect(out[0].outreachStatus).toBe('no_contact');
        expect(out[0].outreachPack).toBeNull();
    });

    it('persönlicher Kontakt → ready, Pack mit Pflichtteil + Empfänger', async () => {
        const out = await generateBulkOutreach([leadFixture('a.de', 70)], { allowDeep: false, einwilligungen: [] });
        expect(out[0].outreachStatus).toBe('ready');
        expect(out[0].outreachPack.complianceApplied).toBe(true);
        expect(out[0].outreachPack.recipientEmail).toBe('a@x.de');
        expect(out[0].outreachPack.primary.body).toContain('Widerspruchsrecht');
        expect(out[0].outreachPack.primary.body).toContain('als Antwort auf Ihre Anfrage');
        expect(out[0].outreachPack.primary.body).not.toContain('kein Interesse');
        expect(out[0].aiTier).toBe('light');
    });

    it('Double-Opt-In: Empfänger ist die eingewilligte Adresse — auch ohne Impressums-Kontakt', async () => {
        cf.enrichContact.mockResolvedValue({ owner: 'Anna', quality: 'none', allEmails: [], emails: [], genericEmails: [] });
        const l = leadFixture('doi.de', 70, { kontaktGrundlage: { art: 'doi' } });
        const out = await generateBulkOutreach([l], { allowDeep: false, einwilligungen: [einwilligung('doi.de')], einwilligungenGeladen: true });
        expect(out[0].outreachStatus).toBe('ready');
        expect(out[0].outreachPack.recipientEmail).toBe('inhaber@doi.de');
        expect(out[0].outreachPack.listUnsubscribe.https).toBe('https://karriaro-webdesign.de/abmelden?t=tok-doi.de');
        // Der Impressums-Inhaber wird nicht angeredet, wenn seine Adresse nicht die eingewilligte ist
        expect(out[0].outreachPack.primary.body).not.toContain('Anna');
    });

    it('Double-Opt-In, Einwilligungen nicht lesbar → no_basis als „nicht prüfbar"', async () => {
        const l = leadFixture('doi.de', 70, { kontaktGrundlage: { art: 'doi' } });
        const out = await generateBulkOutreach([l], { allowDeep: false, einwilligungen: [einwilligung('doi.de')], einwilligungenGeladen: false });
        expect(out[0].outreachStatus).toBe('no_basis');
        expect(out[0].kontaktPruefung.nichtPruefbar).toBe(true);
        expect(cf.enrichContact).toHaveBeenCalledTimes(0);
    });

    it('Double-Opt-In widerrufen → no_basis', async () => {
        const l = leadFixture('doi.de', 70, { kontaktGrundlage: { art: 'doi' } });
        const out = await generateBulkOutreach([l], { allowDeep: false, einwilligungen: [einwilligung('doi.de', { revokedAt: Date.now() - 1000 })] });
        expect(out[0].outreachStatus).toBe('no_basis');
        expect(out[0].kontaktPruefung.grund).toMatch(/widerrufen/);
    });
});

describe('generateBulkOutreach — Sperrliste und Werbewiderspruch', () => {
    it('suppressed-Lead wird übersprungen OHNE Kontakt-Call', async () => {
        const out = await generateBulkOutreach([leadFixture('a.de', 70, { suppressed: true })], { allowDeep: false, einwilligungen: [] });
        expect(out[0].outreachStatus).toBe('suppressed');
        expect(cf.enrichContact).toHaveBeenCalledTimes(0);
    });

    it('bekannter Werbewiderspruch am Lead → suppressed ohne Kontakt-Call', async () => {
        const out = await generateBulkOutreach([leadFixture('w.de', 70, { contactData: { werbewiderspruch: true } })], { allowDeep: false, einwilligungen: [] });
        expect(out[0].outreachStatus).toBe('suppressed');
        expect(out[0].werbewiderspruch).toBe(true);
        expect(cf.enrichContact).toHaveBeenCalledTimes(0);
    });

    it('enrichContact meldet Werbewiderspruch → suppressed, kein Paket, trotz gültiger Anfrage', async () => {
        cf.enrichContact.mockResolvedValue({ owner: 'Anna', quality: 'persönlich', allEmails: ['a@x.de'], emails: ['a@x.de'], werbewiderspruch: true });
        const out = await generateBulkOutreach([leadFixture('w.de', 70)], { allowDeep: false, einwilligungen: [] });
        expect(out[0].outreachStatus).toBe('suppressed');
        expect(out[0].werbewiderspruch).toBe(true);
        expect(out[0].outreachPack).toBeNull();
        expect(out[0].kontaktPruefung.grund).toMatch(/Werbewiderspruch/);
    });
});

describe('generateBulkOutreach — onProgress + Light-Lane', () => {
    it('ruft onProgress total-mal, done monoton bis total', async () => {
        const leads = [leadFixture('a.de', 70), leadFixture('b.de', 50), leadFixture('c.de', 40)];
        const seen = [];
        const out = await generateBulkOutreach(leads, { allowDeep: false, einwilligungen: [] }, p => seen.push(p.done));
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
        const out = await generateBulkOutreach(leads, { allowDeep: true, deepMaxPerHour: 5, einwilligungen: [] });

        expect(cf.deepResearch).toHaveBeenCalledTimes(5);   // genau das Budget
        expect(cf.generateMockup).toHaveBeenCalledTimes(5);
        expect(out.filter(r => r.aiTier === 'deep')).toHaveLength(5);
        expect(out.filter(r => r.deepDeferred)).toHaveLength(5); // 10 Kandidaten − 5 Budget
        // Deep-Pack trägt weiter den Pflichtteil
        for (const r of out.filter(x => x.aiTier === 'deep')) expect(r.outreachPack.primary.body).toContain('Widerspruchsrecht');
    });

    it('respektiert die Score-Schwelle (Leads < threshold bekommen kein Deep)', async () => {
        // 10 Leads: 2× Score 90 (top-2, ≥60), Rest 30 → topN=2, beide ≥60 → genau 2 Deep.
        const leads = [
            leadFixture('hi1.de', 90), leadFixture('hi2.de', 90),
            ...Array.from({ length: 8 }, (_, i) => leadFixture(`lo${i}.de`, 30))
        ];
        await generateBulkOutreach(leads, { allowDeep: true, deepMaxPerHour: 10, einwilligungen: [] });
        expect(cf.deepResearch).toHaveBeenCalledTimes(2);
    });

    it('Leads ohne Grundlage verbrauchen keine Deep-Plätze', async () => {
        // 10 Leads Score 90: 8 ohne Grundlage, 2 mit → topN = min(20, 2) = 2 → beide Deep.
        const leads = [
            ...Array.from({ length: 8 }, (_, i) => leadFixture(`kalt${i}.de`, 95, { kontaktGrundlage: { art: 'keine' } })),
            leadFixture('ok1.de', 90), leadFixture('ok2.de', 90)
        ];
        const out = await generateBulkOutreach(leads, { allowDeep: true, deepMaxPerHour: 10, einwilligungen: [] });
        expect(cf.deepResearch).toHaveBeenCalledTimes(2);
        expect(out.filter(r => r.aiTier === 'deep').map(r => r.domain).sort()).toEqual(['ok1.de', 'ok2.de']);
    });
});
