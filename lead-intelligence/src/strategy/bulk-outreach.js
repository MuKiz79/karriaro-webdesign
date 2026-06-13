/**
 * Bulk-Outreach-Engine — aus N CRM-Leads werden hunderte fertige, individuelle
 * Entwürfe. Zweistufige KI-Tiefe (Founder-Entscheidung):
 *
 *   Light-Lane  — ALLE Leads, parallel, gratis: Kontakt-Gate + buildOutreachPack
 *                 aus persistierten pitchInputs + Compliance-Block.
 *   Deep-Lane   — nur Top-N & Score ≥ Schwelle, gedrosselt (5 neue deepResearch/h,
 *                 cache-first): deepResearch + generateMockup → reicheres Pack.
 *
 * Versand ist ASSISTIERT — diese Engine erzeugt nur Entwürfe, sie sendet nichts.
 *
 * @module strategy/bulk-outreach
 */

import { config } from '../config.js';
import { buildOutreachPack } from './outreach.js';
import { mapToOutreachData, coerceLegacyLead, buildPitchInputs } from './pitch-inputs.js';
import { compliancify } from './compliance.js';
import { verifyReachable } from '../verification/reachability.js';
import { loadSuppression, isSuppressed } from '../crm/suppression.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { enrichContact, checkEmailDeliverability, deepResearch, generateMockup } from '../api/cloud-functions.js';

/**
 * Rate-Budget für teure, nicht-gecachte deepResearch-Calls. Das Backend-Limit
 * ist 5/h pro IP — wir drosseln client-seitig und defern den Rest.
 */
export function makeRateBudget(maxPerHour = 5) {
    let used = 0;
    return {
        tryConsume() { if (used < maxPerHour) { used++; return true; } return false; },
        left() { return Math.max(0, maxPerHour - used); },
        used() { return used; }
    };
}

/** Deep nötig? Nur wenn der Blob noch keine Deep-Schwächen trägt (sonst reuse). */
export function needsDeep(pitchInputs) {
    const deep = pitchInputs?.deepAssessment;
    return !(deep && Array.isArray(deep.weaknesses) && deep.weaknesses.length > 0);
}

/** enrichContact-Ergebnis → das contactData-Shape, das buildOutreachPack liest. */
function toContactData(contact) {
    if (!contact) return null;
    const allEmails = contact.allEmails?.length
        ? contact.allEmails
        : [...(contact.emails || []), ...(contact.genericEmails || [])].filter(Boolean);
    return { owner: contact.owner || null, allEmails };
}

/** Kompakte Kontakt-Zusammenfassung für die Persistenz am Lead. */
function toContactSummary(contact, reach) {
    return {
        owner: reach?.owner || contact?.owner || null,
        email: reach?.email || null,
        quality: reach?.quality || 'none',
        contactScore: contact?.contactScore ?? null,
        deliverability: reach?.deliverability || null,
        note: reach?.note ?? null          // Diagnose-Text für die „ohne Kontakt"-Liste
    };
}

function contactDataFromSummary(summary) {
    return summary?.email ? { owner: summary.owner, allEmails: [summary.email] } : null;
}

/**
 * Light-Verarbeitung eines Leads: Suppression → Kontakt-Gate → Pack + Compliance.
 */
async function processLeadLight(lead, ctx) {
    const { suppressedSet, profile, touchNumber, topNDomains, deepScoreThreshold } = ctx;
    const domain = lead.domain;
    const base = { ...lead, leadScore: lead.leadScore || 0 };

    // 1) Suppression — nie zweimal
    if (lead.suppressed || isSuppressed(domain, suppressedSet)) {
        return { ...base, outreachStatus: 'suppressed', outreachPack: null };
    }

    // 2) Kontakt-Gate (beide Calls sind nicht rate-limited)
    const url = lead.url || (domain ? `https://${domain}` : null);
    const [contact, deliverability] = await Promise.all([
        enrichContact(url).catch(() => null),
        checkEmailDeliverability(domain).catch(() => null)
    ]);
    const reach = verifyReachable({ contact, deliverability });
    const contactSummary = toContactSummary(contact, reach);
    if (!reach.reachable) {
        return { ...base, outreachStatus: 'no_contact', contact: contactSummary, outreachPack: null };
    }

    // 3) Pack bauen (light, aus persistiertem Blob — kein Netzwerk)
    const pi = lead.pitchInputs || null;
    const data = pi
        ? mapToOutreachData(pi, { contactData: toContactData(contact), touchNumber })
        : { ...coerceLegacyLead(lead), contactData: toContactData(contact), touchNumber };

    const rawPack = data ? buildOutreachPack(data) : { available: false, reason: 'Kein verwertbares data-Shape.' };
    if (!rawPack.available) {
        return { ...base, outreachStatus: 'error', errorReason: rawPack.reason, contact: contactSummary, outreachPack: null };
    }
    const pack = compliancify(rawPack, toContactData(contact), profile);

    const deepEligible = topNDomains.has(domain)
        && (lead.leadScore || 0) >= deepScoreThreshold
        && needsDeep(pi);

    return {
        ...base,
        outreachStatus: 'ready',
        aiTier: 'light',
        contact: contactSummary,
        outreachPack: pack,
        pitchInputs: pi,
        _data: data,                 // Engine-intern: Deep-Lane re-packt darauf
        _deepEligible: deepEligible
    };
}

/**
 * Deep-Anreicherung eines bereits fertigen Light-Leads: cache-first
 * deepResearch + generateMockup, dann Pack neu bauen.
 */
async function enrichDeep(r, { profile }) {
    const data = r._data;
    if (!data?.url) return;
    const branche = data.place?.primaryType || null;
    const businessName = data.place?.displayName?.text || null;

    const dr = await deepResearch({ url: data.url, branche, place: data.place, force: false }).catch(() => null);
    if (dr?.assessment) data.deepAssessment = dr.assessment;

    const mk = await generateMockup({ url: data.url, branche, businessName, force: false }).catch(() => null);
    if (mk?.svgDataUrl) data.mockup = { svgDataUrl: mk.svgDataUrl, htmlSnippet: mk.htmlSnippet, spec: mk.spec };

    const rawPack = buildOutreachPack(data);
    if (rawPack.available) {
        r.outreachPack = compliancify(rawPack, contactDataFromSummary(r.contact), profile);
        r.aiTier = 'deep';
        // Blob aktualisieren → deepAssessment kann am Lead persistiert werden.
        r.pitchInputs = buildPitchInputs({ ...data, result: { leadScore: r.leadScore } });
    }
}

/**
 * Hauptfunktion — erzeugt Outreach-Pakete für eine Lead-Liste.
 *
 * @param {object[]} leads  CRM-Leads (mit optionalem pitchInputs-Blob)
 * @param {object} [opts]
 * @param {number} [opts.deepScoreThreshold=60]
 * @param {number} [opts.deepTopN=20]
 * @param {boolean} [opts.allowDeep=true]
 * @param {number} [opts.deepMaxPerHour=5]
 * @param {number} [opts.lightConcurrency=6]
 * @param {number} [opts.touchNumber=1]
 * @param {boolean} [opts.requireQualified=false]  nur Leads mit Verdikt ≠ 'unklar'
 * @param {(p:{done:number,total:number,lead:string,phase:string})=>void} [onProgress]
 * @returns {Promise<object[]>}  angereicherte Leads (mit outreachStatus/outreachPack)
 */
export async function generateBulkOutreach(leads, opts = {}, onProgress = () => {}) {
    const {
        deepScoreThreshold = 60,
        deepTopN = 20,
        allowDeep = true,
        deepMaxPerHour = 5,
        lightConcurrency = 6,
        touchNumber = 1,
        requireQualified = false
    } = opts;

    const profile = config?.profile || {};
    const suppressedSet = await loadSuppression();

    const input = requireQualified ? leads.filter(l => l.verifyVerdict !== 'unklar') : leads;
    const total = input.length;
    let done = 0;

    // Top-N nach leadScore (Deep-Gate) — Suppression vorab raus.
    const topNDomains = new Set(
        input.filter(l => !isSuppressed(l.domain, suppressedSet) && !l.suppressed)
            .sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0))
            .slice(0, Math.min(deepTopN, Math.ceil(input.length * 0.2) || 1))
            .map(l => l.domain)
    );

    // Light-Lane — alle, parallel, gratis.
    const results = await runWithConcurrency(input, lightConcurrency, async (lead) => {
        const r = await processLeadLight(lead, { suppressedSet, profile, touchNumber, topNDomains, deepScoreThreshold });
        done++;
        onProgress({ done, total, lead: lead.domain, phase: 'light', status: r.outreachStatus });
        return r;
    });

    // Deep-Lane — gedrosselt, Concurrency 1.
    if (allowDeep) {
        const deepBudget = makeRateBudget(deepMaxPerHour);
        const deepCandidates = results.filter(r => r && r.outreachStatus === 'ready' && r._deepEligible);
        await runWithConcurrency(deepCandidates, 1, async (r) => {
            if (!deepBudget.tryConsume()) { r.deepDeferred = true; return r; }
            try {
                await enrichDeep(r, { profile });
                onProgress({ done, total, lead: r.domain, phase: 'deep', deepBudgetLeft: deepBudget.left() });
            } catch { r.deepError = true; }
            return r;
        });
    }

    // Engine-interne Felder vor Rückgabe entfernen.
    return results.filter(Boolean).map(({ _data, _deepEligible, ...rest }) => rest);
}
