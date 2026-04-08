/**
 * Expected Value of Information
 * P6 FIX: Stetige Gaussian-Funktion statt springende Stufe
 */

/**
 * @param {number} conversionRate - Aktuelle CR 0-1
 * @param {number} dealSize - Auftragswert EUR
 * @param {number} completeness - Datenvollständigkeit 0-1
 * @param {number} timeToResearch - Stunden für weitere Recherche
 * @param {number} hourlyRate - Kosten pro Stunde
 */
export function calculateEVOI(conversionRate, dealSize, completeness, timeToResearch = 0.5, hourlyRate = 30) {
    const researchCost = timeToResearch * hourlyRate;
    const uncertainty = 1 - completeness;

    // Fix 7: Threshold aus Break-Even ableiten statt hart-codieren
    // Break-Even: P(conv) * dealSize = timeCost → P = timeCost / dealSize
    const breakEvenCR = (timeToResearch * hourlyRate * 4) / dealSize;  // 4x Recherche-Kosten als Akquise-Kosten
    const threshold = Math.max(0.005, Math.min(0.10, breakEvenCR));
    // Sigma proportional zum Threshold (breitere Unsicherheit bei höherem Threshold)
    const sigma = threshold * 0.8;
    const nearThreshold = Math.exp(-Math.pow(conversionRate - threshold, 2) / (2 * sigma * sigma));

    const pDecisionChange = nearThreshold * uncertainty;
    const valueOfChange = 0.5 * (timeToResearch * 2 * hourlyRate) + 0.5 * (conversionRate * 0.3 * dealSize);
    const expectedImprovement = pDecisionChange * valueOfChange;
    const netEVOI = expectedImprovement - researchCost;

    return {
        evoi: Math.round(netEVOI * 100) / 100,
        researchCost,
        expectedImprovement: Math.round(expectedImprovement * 100) / 100,
        pDecisionChange: Math.round(pDecisionChange * 100),
        recommendation: netEVOI > 5 ? `Weitere Recherche lohnt sich (+${Math.round(netEVOI)}€)`
            : netEVOI > 0 ? 'Marginal — recherchiere nur wenn Zeit übrig'
            : 'Sofort entscheiden',
        worthIt: netEVOI > 5
    };
}
