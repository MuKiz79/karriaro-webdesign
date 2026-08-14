/**
 * Pitch-Inputs — das Bindeglied zwischen Analyse und Massen-Outreach.
 *
 * Problem: `buildOutreachPack(data)` braucht reiche Analyse-Daten (ws, tech,
 * revenue, bfsgScore, deepAssessment, security, mockup, competitors,
 * branchStandards, place), aber gespeicherte CRM-Leads haben nur Summary-Felder.
 * Die teuren, pitch-starken Signale (bfsg/deep/security/mockup) entstehen NUR
 * im Single-Check und werden heute weggeworfen.
 *
 * Lösung: Beim Speichern verdichten wir das reiche Result zu einem kompakten,
 * serialisierbaren `pitchInputs`-Blob (nur Felder, die buildOutreachPack liest).
 * Bei der Generierung mappen wir ihn verlustfrei zurück auf das data-Shape.
 *
 * WICHTIG: Das Mockup-SVG (DataURL) wird NICHT persistiert — es kann >50 KB
 * groß sein (Firestore-1-MB-Limit-Risiko). Stattdessen nur `mockupHint.headline`;
 * das SVG wird in der Deep-Lane bei Bedarf via generateMockup re-generiert
 * (server-7-Tage-gecacht → billig).
 *
 * @module strategy/pitch-inputs
 */

/** Entfernt undefined-Werte rekursiv — Firestore akzeptiert kein undefined. */
function clean(obj) {
    return JSON.parse(JSON.stringify(obj ?? null));
}

/**
 * Verdichtet ein reiches Analyse-Result (state.lastResult aus dem Single-Check
 * ODER einen Scanner-Lead) zu einem kompakten pitchInputs-Blob.
 *
 * Nimmt NUR die Felder, die buildOutreachPack tatsächlich liest. Alle Felder
 * sind optional und defensiv — fehlt etwas, fehlt nur das entsprechende
 * Pitch-Argument, kein Crash.
 *
 * @param {object} src  state.lastResult oder Scanner-Lead
 * @returns {object|null} pitchInputs (clean, ohne undefined) oder null
 */
export function buildPitchInputs(src = {}) {
    if (!src) return null;
    const url = src.url || src.websiteUri || null;
    if (!url) return null;

    const ws = src.ws || {};
    const tech = src.tech || {};
    const place = src.place || null;
    const deep = src.deepAssessment || src.deepResearch?.assessment || null;
    const mockup = src.mockup || null;

    const blob = {
        v: 1,                                   // Schema-Version → spätere Migration
        // Pflicht-Quelle für buildOutreachPack:
        url,
        ws: {
            perf: ws.perf ?? null, isHttps: ws.isHttps ?? null,
            viewport: ws.viewport ?? null, seo: ws.seo ?? null, a11y: ws.a11y ?? null
        },
        tech: { cms: tech.cms ?? null, version: tech.version ?? null, isBaukasten: !!tech.isBaukasten },
        wayback: src.wayback ? {
            yearsSince: src.wayback.yearsSince ?? null,
            domainAgeYears: src.wayback.domainAgeYears ?? null,
            firstSeen: src.wayback.firstSeen ?? null,
            lastChanged: src.wayback.lastChanged ?? null
        } : null,
        revenue: src.revenue?.yearlyLoss ? { yearlyLoss: src.revenue.yearlyLoss } : null,
        // 2026-08-14 — `fine` wird NICHT mehr durchgereicht. Ein Geldbetrag im
        // Prompt ist die direkteste Art, eine erfundene Rechtsfolge in generierten
        // Kundentext zu bekommen: das Modell schreibt sie ungeprüft aus. Stattdessen
        // die gemessene Schwere plus die geprüfte Betroffenheitslage — mehr darf
        // über die Rechtslage nicht behauptet werden.
        bfsgScore: src.bfsgScore ? {
            risk: src.bfsgScore.risk ?? null,
            complianceScore: src.bfsgScore.complianceScore ?? null,
            riskLabel: src.bfsgScore.riskLabel ?? null,
            pflichtLage: src.bfsgScore.pflichtLage?.lage ?? null
        } : null,
        // Deep/Security sind die teuren, pitch-starken Signale — wenn da, mitnehmen.
        deepAssessment: deep ? {
            keyPitchAngle: deep.keyPitchAngle ?? null,
            category: deep.category ?? null,
            weaknesses: (deep.weaknesses || []).slice(0, 3).map(w => ({
                title: w.title ?? null, evidence: w.evidence ?? null,
                severity: w.severity ?? null, category: w.category ?? null
            }))
        } : null,
        security: src.security?.summary ? {
            summary: {
                topPitch: src.security.summary.topPitch ?? null,
                critical: src.security.summary.critical ?? 0,
                high: src.security.summary.high ?? 0
            },
            findings: (src.security.findings || []).slice(0, 3).map(f => ({
                title: f.title ?? null, severity: f.severity ?? null,
                pitchArg: f.pitchArg ?? null, evidence: f.evidence ?? null,
                fixAdvice: f.fixAdvice ?? null, category: f.category ?? null
            }))
        } : null,
        // Mockup-SVG NICHT persistieren — nur die Headline als Hinweis.
        mockupHint: mockup?.spec?.hero?.headline
            ? { headline: mockup.spec.hero.headline }
            : (src.mockupSuggestion?.headline ? {
                headline: src.mockupSuggestion.headline,
                subline: src.mockupSuggestion.subline ?? null
            } : null),
        competitors: (src.competitors || []).slice(0, 4).map(c => ({
            displayName: { text: c.displayName?.text ?? null },
            rating: c.rating ?? null, userRatingCount: c.userRatingCount ?? null,
            websiteUri: c.websiteUri ?? null, primaryType: c.primaryType ?? null
        })),
        branchStandards: src.branchStandards?.missing?.length ? {
            missing: src.branchStandards.missing.slice(0, 6).map(m => ({ name: m.name ?? null }))
        } : null,
        place: place ? {
            types: place.types || [],
            primaryType: place.primaryType ?? null,
            displayName: { text: place.displayName?.text ?? null }
        } : null,
        // Ad-Intent (schaltet Anzeigen) — stärkster Pitch-Hook, aus dem Scan abgeleitet.
        adIntent: src.adIntent?.active ? { active: true, signals: (src.adIntent.signals || []).slice(0, 3) } : null,
        tier: src.tier ?? null,
        leadScore: src.result?.leadScore ?? src.leadScore ?? 0
    };

    return clean(blob);
}

/**
 * Mappt pitchInputs zurück auf das exakte data-Shape, das buildOutreachPack
 * erwartet. Reicht Laufzeit-Kontext (Kontakt, touchNumber, ggf. re-generiertes
 * Mockup) durch — diese kommen NICHT aus dem persistierten Blob.
 *
 * @param {object} pitchInputs
 * @param {{contactData?: object|null, touchNumber?: number, mockup?: object|null}} [ctx]
 * @returns {object|null} data für buildOutreachPack
 */
export function mapToOutreachData(pitchInputs, { contactData = null, touchNumber = 1, mockup = null } = {}) {
    if (!pitchInputs || !pitchInputs.url) return null;
    return {
        url: pitchInputs.url,
        ws: pitchInputs.ws || {},
        tech: pitchInputs.tech || {},
        wayback: pitchInputs.wayback || {},
        revenue: pitchInputs.revenue || null,
        bfsgScore: pitchInputs.bfsgScore || null,
        deepAssessment: pitchInputs.deepAssessment || null,
        security: pitchInputs.security || null,
        // Legacy-Text-Mockup-Arg aus der Headline; das visuelle Mockup (svgDataUrl)
        // nur, wenn es zur Laufzeit re-generiert wurde.
        mockupSuggestion: pitchInputs.mockupHint || null,
        mockup: mockup || null,
        competitors: pitchInputs.competitors || [],
        branchStandards: pitchInputs.branchStandards || null,
        place: pitchInputs.place || null,
        adIntent: pitchInputs.adIntent || null,
        tier: pitchInputs.tier || null,
        contactData,
        touchNumber,
        result: { leadScore: pitchInputs.leadScore || 0 }
    };
}

/**
 * Notlösung für Alt-Leads ohne pitchInputs-Blob: baut ein minimales data-Shape
 * aus den CRM-Summary-Feldern. Liefert meist nur das tech_age/perf/ssl-Argument
 * — also ein schwächeres, aber valides Pack statt gar keines.
 *
 * @param {object} lead  CRM-Lead mit Summary-Feldern (domain/url/cms/perf/...)
 * @returns {object} data für buildOutreachPack
 */
export function coerceLegacyLead(lead = {}) {
    const url = lead.url || (lead.domain ? `https://${lead.domain}` : null);
    return {
        url,
        ws: { perf: lead.perf ?? null, seo: lead.seo ?? null, a11y: lead.a11y ?? null, isHttps: true },
        tech: { cms: lead.cms || null, isBaukasten: !!lead.isBaukasten },
        wayback: {},
        place: { primaryType: lead.type || null, displayName: { text: lead.name || null }, types: [] },
        result: { leadScore: lead.leadScore || 0 }
    };
}
