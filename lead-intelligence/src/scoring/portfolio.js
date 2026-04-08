/**
 * Portfolio-Wahrscheinlichkeit mit Lead-Korrelation
 *
 * Berechnet P(mindestens 1 Conversion) und erwartete Conversions
 * fuer ein Portfolio von Leads. Beruecksichtigt Cluster-Korrelation (R0-Effekt).
 *
 * @module scoring/portfolio
 */

/**
 * Berechnet Portfolio-Wahrscheinlichkeiten
 *
 * Leads in der gleichen Branche/Stadt sind korreliert.
 * Wenn einer konvertiert, steigt die Wahrscheinlichkeit fuer aehnliche Leads.
 *
 * @param {Array<number|Object>} leads - Array von Lead-Scores (Zahl oder Objekt mit probability/leadScore/type)
 * @param {number} baseRate - Basis-Conversion-Rate
 * @returns {{atLeastOne: number, expectedConversions: number,
 *            clusterBonus: number, isCorrelated: boolean}}
 */
export function portfolioProbability(leads, baseRate = 0.05) {
    const probs = leads.map(s => {
        const score = typeof s === 'number' ? s : (s.probability || s.leadScore || 0);
        return Math.min(0.20, baseRate * (score / 50));
    });

    // Unkorrelierte Basis: P(mindestens 1) = 1 - Produkt(1-p_i)
    const uncorr_atLeastOne = 1 - probs.reduce((a, p) => a * (1 - p), 1);
    const expectedConversions = probs.reduce((a, p) => a + p, 0);

    // Korrelations-Boost durch Cluster-Effekt
    // Weniger einzigartige Typen = mehr Korrelation = staerkerer R0
    const hasTypes = leads.some(l => typeof l === 'object' && l.type);
    let clusterBonus = 1.0;
    if (hasTypes) {
        const types = leads.filter(l => typeof l === 'object').map(l => l.type);
        const uniqueTypes = new Set(types).size;
        if (uniqueTypes <= 2 && types.length >= 5) clusterBonus = 1.25;
        else if (uniqueTypes <= 3) clusterBonus = 1.15;
    }

    return {
        atLeastOne: Math.round(Math.min(99.9, uncorr_atLeastOne * 100) * 10) / 10,
        expectedConversions: Math.round(expectedConversions * clusterBonus * 100) / 100,
        clusterBonus: Math.round(clusterBonus * 100) / 100,
        isCorrelated: clusterBonus > 1
    };
}
