/**
 * Kelly Criterion — Optimale Zeitallokation pro Lead
 *
 * P4 FIX: Echte Kelly-Formel f* = (p*b - q) / b
 * NPV mit R₀-Folgeaufträgen
 */

/**
 * @param {number} conversionRate - P(Conversion) 0-1
 * @param {number} dealSize - Auftragswert in EUR
 * @param {number} timeHours - Geschätzter Zeitaufwand in Stunden
 * @param {number} hoursPerWeek - Verfügbare Wochenstunden
 * @param {number} r0 - Epidemiologischer R₀ (Folgeaufträge)
 * @param {number} hourlyOppCost - Opportunitätskosten EUR/h
 */
export function calculateKelly(conversionRate, dealSize, timeHours, hoursPerWeek = 20, r0 = 1, hourlyOppCost = 30) {
    const timeCost = timeHours * hourlyOppCost;

    // NPV mit Folgeaufträgen
    const discountRate = 0.05;
    const followUpDeals = Math.max(0, r0 - 1);
    const npvFollowUp = followUpDeals * dealSize / (1 + discountRate);
    const totalDealValue = dealSize + npvFollowUp;

    // P4 FIX: Echte Kelly-Formel
    const p = conversionRate;
    const q = 1 - p;
    const b = totalDealValue / timeCost;  // Gewinn/Einsatz Ratio
    const kellyF = Math.max(0, Math.min(0.25, (p * b - q) / b));

    // Expected Value
    const ev = p * totalDealValue - timeCost;
    const optimalHours = Math.round(kellyF * hoursPerWeek * 10) / 10;
    const roiPerHour = ev / Math.max(0.5, timeHours);

    return {
        kellyFraction: Math.round(kellyF * 1000) / 10,
        optimalHours,
        expectedValue: Math.round(ev * 100) / 100,
        roiPerHour: Math.round(roiPerHour * 100) / 100,
        npvTotal: Math.round(totalDealValue),
        followUpValue: Math.round(npvFollowUp),
        recommendation: optimalHours < 0.3 ? 'Skip — EV zu niedrig'
            : optimalHours < 1.5 ? 'Quick-Pitch — max 1h'
            : optimalHours < 3 ? 'Standard-Akquise — 2-3h'
            : 'Voll investieren'
    };
}
