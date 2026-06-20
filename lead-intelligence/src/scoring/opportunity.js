/**
 * Opportunity-Score — transparente Vor-Bewertung für den Region-Scanner (und
 * die Batch-Suche). Modelliert direkt das, was der Founder sucht:
 *
 *     Opportunity = Website-Schlechtigkeit × Geschäftswert
 *
 * Bewusst NICHT der opake Monte-Carlo-Funnel-Score — sondern erklärbar (jeder
 * Lead trägt seine `reasons`-Chips) und nur aus GRATIS-Signalen (PSI + Places +
 * Tech-Detect). Die teure Tiefenanalyse bleibt dem Klick vorbehalten.
 *
 * @module scoring/opportunity
 */

import { analyzeTechAge } from '../analysis/tech-age.js';

const BAUKASTEN_URL = [
    { re: /\.wixsite\.com|static\.wixstatic/i, name: 'Wix' },
    { re: /\.jimdo\.|jimdofree\.|jimdosite\./i, name: 'Jimdo' },
    { re: /\.squarespace\.com/i, name: 'Squarespace' },
    { re: /\.weebly\.com/i, name: 'Weebly' },
    { re: /\.webnode\./i, name: 'Webnode' },
    { re: /\.wordpress\.com/i, name: 'WordPress.com' },
    { re: /\.strato\.|strato-hosting/i, name: 'Strato' },
    { re: /\.1und1\.de|\.ionos\./i, name: 'IONOS' }
];

/** Baukasten an der URL erkennbar? → Name oder null (gratis, kein Render). */
export function urlBaukasten(url) {
    for (const b of BAUKASTEN_URL) if (b.re.test(url || '')) return b.name;
    return null;
}

// Geschäftswert-Gewicht nach Branche (Premium-Heilberufe/Recht/Immobilien lohnen mehr).
const PREMIUM = new Set(['dentist', 'doctor', 'lawyer', 'real_estate_agency']);
const PROFESSIONAL = new Set(['roofing_contractor', 'plumber', 'electrician', 'moving_company',
    'physiotherapist', 'veterinary_care', 'lodging', 'hotel', 'car_dealer', 'car_repair', 'auto_repair']);
function dealFactor(primaryType) {
    if (PREMIUM.has(primaryType)) return 1.2;
    if (PROFESSIONAL.has(primaryType)) return 1.1;
    return 1.0;
}

/**
 * @param {{ws:object, tech:object, place:object, websiteUri?:string, techAge?:object}} p
 * @returns {{opportunity:number, badnessScore:number, businessStrength:number,
 *            looksAlreadyGood:boolean, reasons:string[]}}
 */
export function computeOpportunity({ ws = {}, tech = {}, place = {}, websiteUri = '', techAge = null }) {
    const perf = typeof ws.perf === 'number' ? ws.perf : 50;
    const isHttps = ws.isHttps !== false;
    const noMobile = ws.viewport === false || ws.viewportMissing === true;
    const ub = urlBaukasten(websiteUri);
    const baukasten = !!tech.isBaukasten || !!ub;
    const ta = techAge || analyzeTechAge(tech, {});
    const reviews = place.userRatingCount || 0;
    const rating = place.rating || 0;

    // ── Website-Schlechtigkeit (0–100) ──
    let b = Math.max(0, 100 - perf) * 0.45;          // Perf ist der größte Einzelhebel
    if (!isHttps) b += 22;                            // hartes Vertrauens-/Sicherheitssignal
    if (noMobile) b += 15;
    if (baukasten) b += 22;                           // strukturell limitiert + günstig ersetzbar
    if (ta.cmsEolYear) b += 20;                       // belegtes EOL-CMS (jetzt verlässlich)
    else if ((ta.techSeverity || 0) >= 4) b += 14;
    else if ((ta.techSeverity || 0) >= 2) b += 6;
    b += Math.max(0, 70 - (ws.seo ?? 70)) * 0.12;
    b += Math.max(0, 70 - (ws.a11y ?? 70)) * 0.12;
    const badnessScore = Math.min(100, Math.round(b));

    // ── Geschäftswert (0–100): viele Bewertungen × gutes Rating = etablierter Betrieb mit Budget ──
    const businessStrength = Math.min(100, Math.round(Math.log2(Math.max(1, reviews)) * (rating || 3) * 3));

    // ── „Schon-gut"-Wächter: sichtbar solide Seite → kein Lead (fängt 'Alte Kanzlei' ohne Vision) ──
    const looksAlreadyGood = perf >= 75 && isHttps && !baukasten && !ta.cmsEolYear && (ta.techSeverity || 0) < 2;

    let opp = (badnessScore * 0.6 + businessStrength * 0.4) * dealFactor(place.primaryType);
    if (looksAlreadyGood) opp *= 0.35;
    const opportunity = Math.max(0, Math.min(100, Math.round(opp)));

    // ── Begründungs-Chips ──
    const reasons = [];
    if (baukasten) reasons.push(ub || tech.cms || 'Baukasten');
    if (ta.cmsEolYear) reasons.push(`${ta.cms} veraltet`);
    reasons.push(`Perf ${perf}`);
    if (!isHttps) reasons.push('kein SSL');
    if (noMobile) reasons.push('nicht mobil');
    reasons.push(rating ? `${reviews}★ (${rating.toFixed(1)})` : `${reviews} Bew.`);

    return { opportunity, badnessScore, businessStrength, looksAlreadyGood, reasons };
}
