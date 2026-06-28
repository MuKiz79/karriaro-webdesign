/**
 * Disqualifikations-Multiplikator — die „Negativ-Schicht" (Deep-Research-Befund,
 * höchster Hebel bei null Infra).
 *
 * Bedarf (Opportunity) × Buyer-Fit allein übersieht Muster, bei denen die WEBSITE
 * NICHT der Engpass ist — dann ist der Lead trotz hoher Opportunity ein schwacher
 * KAUF-Kandidat (Founder-Befund: Makler 4,9★ auf alter Jimdo, Vertrieb läuft über
 * ImmoScout/Instagram, „Seite gut genug").
 *
 * Gated PRODUCT (multiplikativ, NIE 0×, mit lesbarem Grund) — KEINE additive Summe.
 * ⚠️ Die Kausalbrücke „verkauft-über-Plattform / still → kauft-keine-neue-Seite" ist
 * PLAUSIBEL, nicht empirisch belegt (Evidenz stammt aus B2B-SaaS-Sales, keine Quelle
 * belegt direkt „lokales KMU kauft Website"). Daher bewusst MILDER Dämpfer, kein Gate.
 *
 * Reine Funktion → testbar. Speist nur aus Signalen, die der Scan schon hat.
 * @module scoring/disqualify
 */

/**
 * @param {{salesPlatforms?:string[], reviewRecency?:{daysSinceLast?:number, velocity?:number, n?:number}}} p
 * @returns {{multiplier:number, reasons:string[]}}  multiplier 0.45–1.0
 */
export function computeDisqualifiers({ salesPlatforms = [], reviewRecency = null } = {}) {
    let mult = 1.0;
    const reasons = [];

    // 1) Verkauf läuft (auch) über eine eingebettete Plattform → eigene Seite seltener
    //    der Engpass. Stärkstes billiges Disqualifikations-Signal.
    if (Array.isArray(salesPlatforms) && salesPlatforms.length) {
        mult *= 0.6;
        reasons.push(`⚠ Vertrieb über ${salesPlatforms[0]}`);
    }

    // 2) Sehr stilles Geschäft (alte Bewertungen + kaum Velocity) → wenig Veränderungs-
    //    druck, oft „läuft auch so". Milder Dämpfer.
    const d = reviewRecency && reviewRecency.daysSinceLast;
    const v = (reviewRecency && reviewRecency.velocity) || 0;
    const n = (reviewRecency && reviewRecency.n) || 0;
    if (n >= 2 && typeof d === 'number' && d > 365 && v < 1) {
        mult *= 0.8;
        reasons.push('⚠ Geschäft wirkt still');
    }

    // Untergrenze: NIE 0× — ein Dämpfer, kein Gate. Das schwächste Signal darf einen
    // sonst starken Lead nicht auslöschen (Playbook: gated product, nie blind 0).
    mult = Math.max(0.45, mult);
    return { multiplier: +mult.toFixed(2), reasons };
}
