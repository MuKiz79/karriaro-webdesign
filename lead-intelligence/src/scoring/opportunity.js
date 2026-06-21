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

// Geschäftswert-Gewicht nach Branche. Premium-Heilberufe/Recht/Immobilien lohnen
// mehr; Low-Value-Branchen bekommen einen ECHTEN <1.0-Abschlag (F2/Rang-Inversion),
// in zwei Stufen nach typischem Projektwert/Marge:
//   • GASTRO (Restaurant/Café/Bäckerei): dünnste Margen, höchste Fluktuation → 0.68
//   • RETAIL/SERVICE (Florist/Salon/Beauty/Gym): niedrig, aber relaunch-würdiger → 0.82
const PREMIUM = new Set(['dentist', 'doctor', 'lawyer', 'real_estate_agency']);
const PROFESSIONAL = new Set(['roofing_contractor', 'plumber', 'electrician', 'moving_company',
    'physiotherapist', 'veterinary_care', 'lodging', 'hotel', 'car_dealer', 'car_repair', 'auto_repair']);
const LOW_VALUE_GASTRO = new Set(['restaurant', 'cafe', 'bakery']);
const LOW_VALUE_RETAIL = new Set(['hair_salon', 'beauty_salon', 'florist', 'gym']);
function dealFactor(primaryType) {
    if (PREMIUM.has(primaryType)) return 1.25;
    if (PROFESSIONAL.has(primaryType)) return 1.10;
    if (LOW_VALUE_GASTRO.has(primaryType)) return 0.68;
    if (LOW_VALUE_RETAIL.has(primaryType)) return 0.82;
    return 0.90;
}

/**
 * Liveness aus Review-Recency (F6) → Gate/Multiplikator (0.0 … 1.30). NIE additiv.
 * `reviewRecency` ist der in trimPlace abgeleitete Wert
 * { daysSinceLast:number|null, velocity:number|null, n:number }. Fehlt das Signal
 * (n<2 / kein publishTime) → NICHT bestrafen, leichter Abschlag (Daten fehlen ≠ tot).
 */
function livenessGate(reviewRecency, place) {
    const status = place && place.businessStatus;
    if (status && status !== 'OPERATIONAL') return { factor: 0.0, chip: 'inaktiv (geschlossen)' };
    const rr = reviewRecency || {};
    const d = typeof rr.daysSinceLast === 'number' ? rr.daysSinceLast : null;
    const v = typeof rr.velocity === 'number' ? rr.velocity : null;
    const n = rr.n || 0;
    if (d === null || n < 2) return { factor: 0.85, chip: null };
    // Primärachse: Tage seit der jüngsten Bewertung (BrightLocal „73% trauen nur dem
    // letzten Monat" → ~30–45T Frische-Klippe). >18 Mon. still → Nahe-0x-Gate.
    let factor;
    if (d <= 45) factor = 1.30;
    else if (d <= 120) factor = 1.10;
    else if (d <= 270) factor = 0.85;
    else if (d <= 540) factor = 0.42;
    else factor = 0.10;
    // Velocity-Override NUR bei >=3 datierten Reviews UND realer Spanne (spanMonths in
    // deriveReviewRecency bei ~1 Monat gefloort) → ein 2er-Freundes-Burst kann die
    // Velocity nicht aufblasen (Gaming-Fix).
    if (v !== null && n >= 3 && v >= 5 && d <= 180) factor = Math.max(factor, 1.30);
    if (v !== null && v < 0.5 && d > 270) factor = Math.min(factor, 0.25);
    let chip = null;
    if (d <= 45) chip = `aktiv · letzte Bew. ${d}T`;
    else if (d > 540) chip = `inaktiv · ${Math.round(d / 30)} Mon. still`;
    else if (d > 270) chip = `kühl · letzte Bew. ${Math.round(d / 30)} Mon.`;
    return { factor, chip };
}

/**
 * Geschäftswert als gesättigter Multiplikator (0.0 … 1.20) mit 0x-Gate (F2).
 * rating<=3.2 → 0x-Gate; rating===0 (Datenqualitäts-Flag) → Strafe (0.45), KEIN Freifahrtschein.
 */
function valueMult(businessStrength, rating, reviews, minReviews) {
    if (reviews < minReviews) return { mult: 0.0, gated: true };
    if (rating > 0 && rating <= 3.2) return { mult: 0.0, gated: true };
    if (rating === 0) return { mult: 0.45, gated: false };
    if (businessStrength >= 70) return { mult: 1.20, gated: false };
    if (businessStrength >= 45) return { mult: 1.00, gated: false };
    if (businessStrength >= 25) return { mult: 0.85, gated: false };
    return { mult: 0.70, gated: false };
}

// Eingangs-/Gate-Schwelle für Bewertungen — identisch zum Scanner-MIN_REVIEWS.
export const MIN_REVIEWS_VALUE = 8;

/**
 * @param {{ws:object, tech:object, place:object, websiteUri?:string, techAge?:object,
 *           reviewRecency?:{daysSinceLast:number|null, velocity:number|null, n:number},
 *           visionOutdated?:boolean, adIntent?:{active:boolean, signals?:string[]}}} p
 * @returns {{opportunity:number, badnessScore:number, businessStrength:number,
 *            looksAlreadyGood:boolean, reasons:string[], hardStructural:number, adIntent:boolean}}
 */
export function computeOpportunity({ ws = {}, tech = {}, place = {}, websiteUri = '', techAge = null, reviewRecency = null, visionOutdated = false, adIntent = null }) {
    const perf = typeof ws.perf === 'number' ? ws.perf : 50;
    const isHttps = ws.isHttps !== false;
    const noMobile = ws.viewport === false || ws.viewportMissing === true;
    const ub = urlBaukasten(websiteUri);
    const baukasten = !!tech.isBaukasten || !!ub;
    const ta = techAge || analyzeTechAge(tech, {});
    const reviews = place.userRatingCount || 0;
    const rating = place.rating || 0;

    // ── Badness (0–100): strukturelle Relaunch-Signale = Rückgrat (F3/F4); PSI-Lab-
    //    Perf DEMOTIERT (F0). hardStructural zählt harte Signale für Konvergenz (F1/F7/F8). ──
    let b = 0;
    let hardStructural = 0;
    if (baukasten) { b += 34; hardStructural++; }                 // F4: ~94% zuverlässig
    if (ta.cmsEolYear) { b += 34; hardStructural++; }             // F4: sicherheits-totes EOL-CMS
    else if ((ta.techSeverity || 0) >= 4) { b += 22; hardStructural++; }
    else if ((ta.techSeverity || 0) >= 2) b += 9;                 // weich, KEIN hartes Signal
    if (noMobile) { b += 24; hardStructural++; }                  // F3: nicht-mobil
    if (!isHttps) { b += 22; hardStructural++; }                  // F3: SSL/Vertrauen

    // Perf: gedeckelt & weich (war (100-perf)*0.45 ⇒ bis 45). Nur der Slow-Tail nudged (F0).
    if (perf < 40) b += 14;
    else if (perf < 55) b += 9;
    else if (perf < 70) b += 5;
    b += Math.max(0, 60 - (ws.seo ?? 60)) * 0.10;
    b += Math.max(0, 60 - (ws.a11y ?? 60)) * 0.10;

    // Design-Relaunch-Floor (F2): CURRENT-Tech ohne hartes Strukturzeichen, aber müder
    // Lab-Profile (perf<70) ist eine legitime Design/Conversion-Relaunch-Lead. Ohne Floor
    // wäre die Badness ~0 → Score 0 → Vision nie erreicht. Schnelle Seiten ausgenommen.
    if (hardStructural === 0 && perf < 70) b = Math.max(b, 32);
    // Badness-Sättigung ab ~46: weitere Flags geben abnehmenden Ertrag — reiner FLAG-COUNT
    // bläst das Produkt nicht linear auf (Multi-Flag-Low-Value kann Single-Flag-Premium nicht
    // davonlaufen), ein starkes Signal allein klärt aber weiter die HOT-Schwelle.
    if (b > 46) b = 46 + (b - 46) * 0.45;
    const badnessScore = Math.min(100, Math.round(b));

    // Visuell veraltet (Vision, Top-N) zählt als hartes Strukturzeichen (F1).
    if (visionOutdated) hardStructural++;

    // ── Geschäftswert (0–100): UNVERÄNDERTE Formel — bleibt für Shape/UI, fließt aber
    //    als gesättigter Multiplikator ein, nicht additiv. ──
    const businessStrength = Math.min(100, Math.round(Math.log2(Math.max(1, reviews)) * (rating || 3) * 3));

    const looksAlreadyGood = perf >= 70 && isHttps && !baukasten && !ta.cmsEolYear
        && (ta.techSeverity || 0) < 2 && hardStructural === 0;

    // ── Ad-Intent (stärkstes billiges KAUFSIGNAL): zahlt für Google-/Meta-Anzeigen →
    //    bewiesener Spender, der Geld in Kundengewinnung steckt UND es auf eine schlechte
    //    Seite leitet. Boost (×1.25) auf eine bereits qualifizierte Lead — KEIN Junk-Rescue
    //    (die Konvergenz-Schranke unten greift weiter, ad-intent allein macht nicht HOT). ──
    const adActive = !!(adIntent && adIntent.active);

    // ── Multiplikativer Kern (F2: Matrix von Achsen mit Gates, KEINE gewichtete Summe). ──
    const lg = livenessGate(reviewRecency, place);
    const vm = valueMult(businessStrength, rating, reviews, MIN_REVIEWS_VALUE);
    let opp = badnessScore * lg.factor * vm.mult * dealFactor(place.primaryType) * (adActive ? 1.25 : 1.0);
    if (looksAlreadyGood) opp *= 0.35;

    // Konvergenz-Schranke (F1/F7/F8): ohne >=1 hartes Strukturzeichen nie HOT (gedeckelt
    // unter 70) — eine müde Current-Tech-Premium-Relaunch-Lead bleibt aber WARM.
    if (hardStructural < 1) opp = Math.min(opp, 69);

    const opportunity = Math.max(0, Math.min(100, Math.round(opp)));

    // ── Begründungs-Chips (Transparenz; Ad-Intent prominent für Founder-Triage) ──
    const reasons = [];
    if (adActive) reasons.push('💸 Anzeigen aktiv');     // bewiesener Spender — zuerst
    if (baukasten) reasons.push(ub || tech.cms || 'Baukasten');
    if (ta.cmsEolYear) reasons.push(`${ta.cms} veraltet`);
    reasons.push(`Perf ${perf}`);
    if (!isHttps) reasons.push('kein SSL');
    if (noMobile) reasons.push('nicht mobil');
    if (lg.chip) reasons.push(lg.chip);
    if (vm.gated) reasons.push('zu kleiner Betrieb');
    reasons.push(rating ? `${reviews}★ (${rating.toFixed(1)})` : `${reviews} Bew.`);

    return { opportunity, badnessScore, businessStrength, looksAlreadyGood, reasons, hardStructural, adIntent: adActive };
}
