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

    // P6 FIX: Stetige Gaussian-Funktion zentriert auf Entscheidungsschwellwert
    // Maximaler Wert wenn CR nahe am Schwellwert (wo die Entscheidung kippen könnte)
    const threshold = 0.025;
    const sigma = 0.03;
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
