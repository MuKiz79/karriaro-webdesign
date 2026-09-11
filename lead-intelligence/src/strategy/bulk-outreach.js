/**
 * Bulk-Outreach-Engine — aus N CRM-Leads werden individuelle Entwürfe.
 * Zweistufige KI-Tiefe (Founder-Entscheidung):
 *
 *   Light-Lane  — alle Leads MIT Kontaktgrundlage, parallel, gratis: Kontakt-Gate
 *                 + buildOutreachPack aus persistierten pitchInputs + Pflichtteil.
 *   Deep-Lane   — nur Top-N & Score ≥ Schwelle, gedrosselt (5 neue deepResearch/h,
 *                 cache-first): deepResearch + generateMockup → reicheres Pack.
 *
 * Reihenfolge je Lead (2026-09-10):
 *   1. Sperrliste / bekannter Werbewiderspruch → 'suppressed'
 *   2. Kontakt-Gate (Double-Opt-In, Anfrage, Bestandskunde) → ohne Grundlage
 *      'no_basis': KEIN Netz-Call, KEIN Paket. Die Analyse bleibt im CRM nutzbar.
 *   3. Kontakt + Zustellbarkeit; meldet enrichContact einen Werbewiderspruch
 *      (V3), wird die Domain sofort gesperrt.
 *   4. Gate mit frischen Kontaktdaten erneut → Empfänger. Bei Double-Opt-In ist
 *      das ausschliesslich die eingewilligte Adresse.
 *   5. Paket + Pflichtteil (Absender, Herkunft, Abmeldung, Widerspruchshinweis).
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
import { loadSuppression, isSuppressed, addSuppression, normalizeDomain } from '../crm/suppression.js';
import { ladeEinwilligungenMitStatus } from '../crm/consents.js';
import { pruefeMailErlaubnis } from '../outreach/kontakt-grundlage.js';
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

/** Kompakte Kontakt-Zusammenfassung für die Persistenz am Lead. */
function toContactSummary(contact, reach, empfaenger) {
    return {
        owner: reach?.owner || contact?.owner || null,
        email: empfaenger || reach?.email || null,
        quality: reach?.quality || 'none',
        contactScore: contact?.contactScore ?? null,
        deliverability: reach?.deliverability || null,
        note: reach?.note ?? null          // Diagnose-Text für die „ohne Kontakt"-Liste
    };
}

/** Frische Kontaktdaten an den Lead hängen, ohne einen Werbewiderspruch zu verlieren. */
function mitFrischemKontakt(lead, contact) {
    if (!contact) return lead;
    const alt = lead.contactData || {};
    return {
        ...lead,
        contactData: {
            ...alt,
            owner: contact.owner || alt.owner || null,
            emails: contact.emails || alt.emails || [],
            genericEmails: contact.genericEmails || alt.genericEmails || [],
            allEmails: contact.allEmails?.length ? contact.allEmails : (alt.allEmails || []),
            ...(alt.werbewiderspruch === true || contact.werbewiderspruch === true ? { werbewiderspruch: true } : {})
        }
    };
}

/**
 * Anrede-Name nur, wenn er zur Empfänger-Adresse passt. Bei Double-Opt-In kennen
 * wir den Namen der einwilligenden Person nicht — der Impressums-Inhaber ist nur
 * dann richtig, wenn seine persönliche Adresse die eingewilligte ist.
 */
function ownerFuer(pruefung, contact) {
    if (!contact?.owner) return null;
    if (pruefung.grundlage !== 'doi') return contact.owner;
    const persoenlich = (contact.emails || []).map(e => String(e).trim().toLowerCase());
    return persoenlich.includes(pruefung.empfaenger) ? contact.owner : null;
}

async function sperreWegenWiderspruch(domain, suppressedSet) {
    const d = normalizeDomain(domain);
    if (!d) return;
    suppressedSet.add(d);
    try {
        await addSuppression(d, 'opt_out');
    } catch (e) {
        console.error('Werbewiderspruch — Sperrliste nicht geschrieben:', e);
    }
}

/**
 * Light-Verarbeitung eines Leads: Sperre → Gate → Kontakt → Gate → Pack.
 */
async function processLeadLight(lead, ctx) {
    const { suppressedSet, profile, touchNumber, topNDomains, deepScoreThreshold, einwilligungen, einwilligungenGeladen } = ctx;
    const domain = lead.domain;
    const base = { ...lead, leadScore: lead.leadScore || 0 };
    const pruefe = (l) => pruefeMailErlaubnis(l, {
        einwilligungen, einwilligungenGeladen, kanal: 'email',
        gesperrt: l.suppressed === true || isSuppressed(l.domain, suppressedSet)
    });

    // 1) Sperrliste / bekannter Werbewiderspruch — nie wieder
    if (lead.suppressed || isSuppressed(domain, suppressedSet)) {
        return { ...base, outreachStatus: 'suppressed', kontaktPruefung: pruefe(lead), outreachPack: null };
    }
    if (lead.contactData?.werbewiderspruch === true) {
        await sperreWegenWiderspruch(domain, suppressedSet);
        return { ...base, outreachStatus: 'suppressed', werbewiderspruch: true, kontaktPruefung: pruefe(lead), outreachPack: null };
    }

    // 2) Kontakt-Gate vor jedem Netz-Call
    const vorab = pruefe(lead);
    if (!vorab.erlaubt) {
        return { ...base, outreachStatus: 'no_basis', kontaktPruefung: vorab, outreachPack: null };
    }

    // 3) Kontakt + Zustellbarkeit (beide Calls sind nicht rate-limited)
    const url = lead.url || (domain ? `https://${domain}` : null);
    const [contact, deliverability] = await Promise.all([
        enrichContact(url).catch(e => { console.warn(`enrichContact ${domain}:`, e); return null; }),
        checkEmailDeliverability(domain).catch(e => { console.warn(`checkEmailDeliverability ${domain}:`, e); return null; })
    ]);
    const angereichert = mitFrischemKontakt(lead, contact);
    if (contact?.werbewiderspruch === true) {
        await sperreWegenWiderspruch(domain, suppressedSet);
        return {
            ...base, contactData: angereichert.contactData, outreachStatus: 'suppressed', werbewiderspruch: true,
            kontaktPruefung: pruefe(angereichert), outreachPack: null
        };
    }

    // 4) Gate mit frischen Kontaktdaten → Empfänger
    const pruefung = pruefe(angereichert);
    const reach = verifyReachable({ contact, deliverability });
    const empfaenger = pruefung.erlaubt ? (pruefung.empfaenger || (pruefung.grundlage === 'doi' ? null : reach.email)) : null;
    const contactSummary = toContactSummary(contact, reach, empfaenger);
    if (!pruefung.erlaubt) {
        return { ...base, outreachStatus: 'no_basis', kontaktPruefung: pruefung, contact: contactSummary, outreachPack: null };
    }
    if (!empfaenger) {
        return {
            ...base, outreachStatus: 'no_contact', kontaktPruefung: pruefung,
            contact: { ...contactSummary, note: reach.note || 'Keine E-Mail-Adresse gefunden — ohne gefundene Adresse gibt es keinen Empfänger.' },
            outreachPack: null
        };
    }
    const pruefungMitEmpfaenger = { ...pruefung, empfaenger };

    // 5) Pack bauen (light, aus persistiertem Blob — kein Netzwerk)
    const contactData = { owner: ownerFuer(pruefungMitEmpfaenger, contact), allEmails: [empfaenger] };
    const pi = lead.pitchInputs || null;
    const data = pi
        ? mapToOutreachData(pi, { contactData, touchNumber })
        : { ...coerceLegacyLead(lead), contactData, touchNumber };

    const rawPack = data ? buildOutreachPack(data) : { available: false, reason: 'Kein verwertbares data-Shape.' };
    if (!rawPack.available) {
        return { ...base, outreachStatus: 'error', errorReason: rawPack.reason, kontaktPruefung: pruefungMitEmpfaenger, contact: contactSummary, outreachPack: null };
    }
    const pack = compliancify(rawPack, contactData, profile, pruefungMitEmpfaenger);

    const deepEligible = topNDomains.has(domain)
        && (lead.leadScore || 0) >= deepScoreThreshold
        && needsDeep(pi);

    return {
        ...base,
        outreachStatus: 'ready',
        aiTier: 'light',
        contact: contactSummary,
        kontaktPruefung: pruefungMitEmpfaenger,
        outreachPack: pack,
        pitchInputs: pi,
        _data: data,                 // Engine-intern: Deep-Lane re-packt darauf
        _deepEligible: deepEligible
    };
}

/**
 * Deep-Anreicherung eines bereits fertigen Light-Leads: cache-first
 * deepResearch + generateMockup, dann Pack neu bauen — mit derselben Prüfung.
 */
async function enrichDeep(r, { profile }) {
    const data = r._data;
    if (!data?.url) return;
    const branche = data.place?.primaryType || null;
    const businessName = data.place?.displayName?.text || null;

    const dr = await deepResearch({ url: data.url, branche, place: data.place, force: false }).catch(e => { console.warn('deepResearch:', e); return null; });
    if (dr?.assessment) data.deepAssessment = dr.assessment;

    const mk = await generateMockup({ url: data.url, branche, businessName, force: false }).catch(e => { console.warn('generateMockup:', e); return null; });
    if (mk?.svgDataUrl) data.mockup = { svgDataUrl: mk.svgDataUrl, htmlSnippet: mk.htmlSnippet, spec: mk.spec };

    const rawPack = buildOutreachPack(data);
    if (rawPack.available) {
        r.outreachPack = compliancify(rawPack, data.contactData, profile, r.kontaktPruefung);
        r.aiTier = 'deep';
        // Blob aktualisieren → deepAssessment kann am Lead persistiert werden.
        r.pitchInputs = buildPitchInputs({ ...data, result: { leadScore: r.leadScore } });
    }
}

/**
 * Hauptfunktion — erzeugt Outreach-Pakete für eine Lead-Liste.
 *
 * @param {object[]} leads  CRM-Leads (mit optionalem pitchInputs-Blob und kontaktGrundlage)
 * @param {object} [opts]
 * @param {number} [opts.deepScoreThreshold=60]
 * @param {number} [opts.deepTopN=20]
 * @param {boolean} [opts.allowDeep=true]
 * @param {number} [opts.deepMaxPerHour=5]
 * @param {number} [opts.lightConcurrency=6]
 * @param {number} [opts.touchNumber=1]
 * @param {boolean} [opts.requireQualified=false]  nur Leads mit Verdikt ≠ 'unklar'
 * @param {Array}   [opts.einwilligungen]          vorab geladen; fehlt → ladeEinwilligungenMitStatus()
 * @param {boolean} [opts.einwilligungenGeladen]   zu opts.einwilligungen: waren sie lesbar?
 * @param {(p:{done:number,total:number,lead:string,phase:string})=>void} [onProgress]
 * @returns {Promise<object[]>}  angereicherte Leads (mit outreachStatus/kontaktPruefung/outreachPack)
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

    let einwilligungen = opts.einwilligungen;
    let einwilligungenGeladen = opts.einwilligungenGeladen;
    if (!Array.isArray(einwilligungen)) {
        const status = await ladeEinwilligungenMitStatus();
        einwilligungen = status.einwilligungen;
        einwilligungenGeladen = status.geladen;
        if (!status.geladen) console.warn('Einwilligungen nicht lesbar — Double-Opt-In-Leads werden blockiert:', status.fehler);
    }
    if (typeof einwilligungenGeladen !== 'boolean') einwilligungenGeladen = true;

    const input = requireQualified ? leads.filter(l => l.verifyVerdict !== 'unklar') : leads;
    const total = input.length;
    let done = 0;

    // Top-N nach leadScore (Deep-Gate) — nur unter Leads, die das Gate passieren
    // könnten; sonst verbrauchen Leads ohne Grundlage die teuren Deep-Plätze.
    const kandidatenDeep = input.filter(l => !l.suppressed
        && !isSuppressed(l.domain, suppressedSet)
        && pruefeMailErlaubnis(l, { einwilligungen, einwilligungenGeladen, kanal: 'email' }).erlaubt);
    const topNDomains = new Set(
        kandidatenDeep
            .sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0))
            .slice(0, Math.min(deepTopN, Math.ceil(input.length * 0.2) || 1))
            .map(l => l.domain)
    );

    // Light-Lane — alle, parallel, gratis.
    const results = await runWithConcurrency(input, lightConcurrency, async (lead) => {
        const r = await processLeadLight(lead, { suppressedSet, profile, touchNumber, topNDomains, deepScoreThreshold, einwilligungen, einwilligungenGeladen });
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
            } catch (e) { console.error('Deep-Lane:', e); r.deepError = true; }
            return r;
        });
    }

    // Engine-interne Felder vor Rückgabe entfernen.
    return results.filter(Boolean).map(({ _data, _deepEligible, ...rest }) => rest);
}
