/**
 * Portfolio-Optimierung mit Markowitz Mean-Variance
 *
 * Fix 9: Statt isolierter Kelly pro Lead → optimale Zeitallokation
 * über ALLE Leads gleichzeitig unter der Constraint Σwᵢ ≤ 1
 *
 * @module scoring/portfolio
 */

/**
 * Berechnet Portfolio-Wahrscheinlichkeiten + optimale Allokation
 *
 * @param {Array<Object>} leads - Array von Lead-Objekten mit {leadScore, probability, type, expectedValue, timePerLead}
 * @param {number} baseRate - Basis-Conversion-Rate
 * @param {number} availableHours - Verfügbare Stunden pro Woche
 */
export function portfolioProbability(leads, baseRate = 0.05, availableHours = 20) {
    const probs = leads.map(s => {
        const score = typeof s === 'number' ? s : (s.probability || s.leadScore || 0);
        return Math.min(0.20, baseRate * (score / 50));
    });

    // P(mindestens 1 Conversion) = 1 - ∏(1-pᵢ)
    const uncorrAtLeastOne = 1 - probs.reduce((a, p) => a * (1 - p), 1);
    const expectedConversions = probs.reduce((a, p) => a + p, 0);

    // Cluster-Korrelation
    const hasTypes = leads.some(l => typeof l === 'object' && l.type);
    let clusterBonus = 1.0;
    if (hasTypes) {
        const types = leads.filter(l => typeof l === 'object').map(l => l.type);
        const uniqueTypes = new Set(types).size;
        if (uniqueTypes <= 2 && types.length >= 5) clusterBonus = 1.25;
        else if (uniqueTypes <= 3) clusterBonus = 1.15;
    }

    // Fix 9: Markowitz-ähnliche Allokation
    // Maximiere: Σ wᵢ × EVᵢ unter Σ wᵢ × timeᵢ ≤ availableHours
    // Greedy-Lösung: Sortiere nach EV/Stunde, allokiere bis Budget erschöpft
    const allocation = markowitzGreedy(leads, availableHours);

    return {
        atLeastOne: Math.round(Math.min(99.9, uncorrAtLeastOne * 100) * 10) / 10,
        expectedConversions: Math.round(expectedConversions * clusterBonus * 100) / 100,
        clusterBonus: Math.round(clusterBonus * 100) / 100,
        isCorrelated: clusterBonus > 1,
        allocation  // Fix 9: Optimale Zeitallokation pro Lead
    };
}

/**
 * Fix 9: Greedy Markowitz — sortiere nach EV/Stunde, allokiere bis Budget erschöpft
 * (Exakte Mean-Variance würde quadratische Programmierung brauchen,
 *  Greedy ist eine gute Approximation für unser Problem)
 */
function markowitzGreedy(leads, availableHours) {
    if (!leads.length || !leads[0]?.expectedValue) return [];

    const ranked = leads
        .filter(l => typeof l === 'object' && l.expectedValue !== undefined)
        .map((l, idx) => ({
            idx,
            name: l.name || l.domain || `Lead ${idx + 1}`,
            ev: l.expectedValue || 0,
            time: l.timePerLead || 2,
            evPerHour: (l.expectedValue || 0) / Math.max(0.5, l.timePerLead || 2),
            score: l.leadScore || l.probability || 0
        }))
        .filter(l => l.ev > 0)
        .sort((a, b) => b.evPerHour - a.evPerHour);

    let remaining = availableHours;
    const allocation = [];

    for (const lead of ranked) {
        if (remaining <= 0) break;
        const allocTime = Math.min(lead.time, remaining);
        const fraction = allocTime / lead.time;
        allocation.push({
            ...lead,
            allocatedHours: Math.round(allocTime * 10) / 10,
            fraction: Math.round(fraction * 100),
            allocatedEV: Math.round(lead.ev * fraction * 100) / 100
        });
        remaining -= allocTime;
    }

    return {
        leads: allocation,
        totalHours: Math.round((availableHours - remaining) * 10) / 10,
        totalEV: Math.round(allocation.reduce((s, l) => s + l.allocatedEV, 0) * 100) / 100,
        remainingHours: Math.round(remaining * 10) / 10
    };
}
