/**
 * 6. Revenue-Weighted Scoring
 * E[Revenue] = P(Conversion) × Deal-Wert × CLV-Multiplikator
 */

import { CUSTOMER_LIFETIME_VALUE } from '../priors/benchmark-data.js';

/**
 * Berechne den erwarteten Revenue pro Lead (nicht nur Score)
 * @param {number} conversionRate - 0-1
 * @param {string} branchType - z.B. 'dentist'
 * @param {number} dealSize - EUR Auftragswert
 * @returns {Object} { expectedRevenue, clvMultiplier, lifetime }
 */
export function calculateRevenueWeighted(conversionRate, branchType, dealSize) {
    const clv = CUSTOMER_LIFETIME_VALUE[branchType] || CUSTOMER_LIFETIME_VALUE._default;

    // CLV-Multiplikator: Wie viel ist ein Kunde über seine Lebenszeit wert?
    // Ein Zahnarzt-Kunde bringt über 10 Jahre €7.000 — nicht nur die einmaligen €1.990 Website-Kosten
    const clvMultiplier = clv.clv / dealSize;

    // Expected Revenue = P(Conversion) × Deal × CLV-Multiplikator
    const expectedRevenue = conversionRate * dealSize;
    const expectedLifetimeValue = conversionRate * clv.clv;

    return {
        expectedRevenue: Math.round(expectedRevenue * 100) / 100,
        expectedLifetimeValue: Math.round(expectedLifetimeValue * 100) / 100,
        clvMultiplier: Math.round(clvMultiplier * 10) / 10,
        clv: clv.clv,
        retentionYears: clv.retentionYears,
        visitsPerYear: clv.visitsPerYear,
        label: `E[Revenue] = ${Math.round(expectedRevenue)}€ Auftrag · Kunde bringt über ${clv.retentionYears} Jahre ~${clv.clv.toLocaleString('de-DE')}€`
    };
}
