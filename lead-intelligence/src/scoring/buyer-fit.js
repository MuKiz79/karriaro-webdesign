/**
 * Buyer-Fit — die zweite Achse: „kauft DIESER Betrieb wahrscheinlich?" (orthogonal
 * zur Opportunity „wie sehr braucht die Seite Hilfe").
 *
 * Founder-Befund (BESTLAGE360-Fall): ein Lead kann technisch top sein (alte Jimdo-
 * Seite = hohe Opportunity) und trotzdem schlecht KAUFEN — wenn kein Marketing-Budget
 * fließt, das Geschäft nicht wächst und die eigene Seite ohnehin „gut genug" ist.
 *
 * GÜNSTIGER PROXY aus Signalen, die der Scan SCHON hat (kein Extra-Call):
 *   1. Zahlungskraft  — Geschäftswert (rating×reviews) + Premium-Branche (dealFactor)
 *   2. Marketing-Budget — Ad-Intent (schaltet Google/Meta-Werbung = bewiesener Spender)
 *   3. Wachstum/Aktivität — Review-Velocity (frische Bewertungen = lebendig, nicht im Abschwung)
 *
 * ⚠️ KEIN Ersatz für die tiefe Buyer-Fit-Recherche (Owner-Struktur, Objekt-Volumen-Trend,
 * Wettbewerb, Erreichbarkeit) — die bleibt der Einzel-Analyse/dem Recherche-Workflow.
 *
 * Reine Funktion → testbar.
 * @module scoring/buyer-fit
 */
import { dealFactor } from './opportunity.js';

/** Branchen-Wert → Bonus „kann sich Premium leisten + sieht ROI". */
function branchValueBonus(primaryType) {
    const f = dealFactor(primaryType);     // 1.25 premium / 1.10 prof / 0.90 default / 0.82 retail / 0.68 gastro
    if (f >= 1.25) return 15;
    if (f >= 1.10) return 9;
    if (f >= 0.90) return 5;
    return 2;
}

/**
 * @param {{adIntent?:{active:boolean}, reviewRecency?:{daysSinceLast?:number, velocity?:number, n?:number},
 *          businessStrength?:number, rating?:number, reviews?:number, primaryType?:string}} p
 * @returns {{score:number, label:'hoch'|'mittel'|'niedrig', reasons:string[], parts:object}}
 */
export function computeBuyerFit({ adIntent = null, reviewRecency = null, businessStrength = 0, rating = 0, reviews = 0, primaryType = null } = {}) {
    const reasons = [];

    // 1) Zahlungskraft / etabliert (0–45): Geschäftswert + Branchen-Wert.
    const canPay = Math.min(45, Math.round((businessStrength || 0) * 0.30) + branchValueBonus(primaryType));

    // 2) Marketing-Budget (0–35): Ad-Intent = bewiesener Spender + Owned-Marketing-Mentalität.
    //    Fehlen ist kein Beweis, aber KEIN positives Kaufsignal → real dämpfend (Founder-Befund).
    const marketing = (adIntent && adIntent.active) ? 35 : 6;
    if (adIntent && adIntent.active) reasons.push('zahlt für Werbung');
    else reasons.push('kein Werbe-Signal');

    // 3) Wachstum / Aktivität (0–20): Review-Velocity als Lebendigkeits-/Trend-Proxy.
    let growth = 8; // neutral, wenn keine Velocity-Daten
    const d = reviewRecency && reviewRecency.daysSinceLast;
    const v = (reviewRecency && reviewRecency.velocity) || 0;
    const n = (reviewRecency && reviewRecency.n) || 0;
    if (n >= 3 && typeof d === 'number') {
        if (v >= 5 && d <= 120) { growth = 20; reasons.push('wächst (frische Bewertungen)'); }
        else if (v >= 2 && d <= 270) { growth = 12; }
        else if (d <= 365) { growth = 8; }
        else { growth = 2; reasons.push('Aktivität flau'); }
    }

    let score = Math.max(0, Math.min(100, canPay + marketing + growth));

    // Zu kleiner/schwacher Betrieb kann sich die Investition kaum leisten → Deckel.
    if ((reviews || 0) < 8 || (rating || 0) <= 3.2) {
        score = Math.min(score, 38);
        reasons.push('zu klein/schwach für Premium');
    }

    const label = score >= 70 ? 'hoch' : score >= 45 ? 'mittel' : 'niedrig';
    return { score: Math.round(score), label, reasons, parts: { canPay, marketing, growth } };
}

/** Gesamt-Chance = Opportunity, moduliert durch Buyer-Fit (Fit dämpft max. ~45%). */
export function gesamtScore(opportunity, buyerFit) {
    const o = opportunity || 0;
    const f = typeof buyerFit === 'number' ? buyerFit : 50;
    return Math.round(o * (0.55 + 0.45 * f / 100));
}
