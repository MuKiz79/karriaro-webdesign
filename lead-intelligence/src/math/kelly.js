/**
 * Zeit-Allokations-Heuristik (vormals "Kelly Criterion").
 *
 * Vorgeschichte: Diese Funktion war als Kelly-Bet-Sizer benannt. Das war
 * methodisch unsauber — Akquise ist keine wiederholte Wette mit
 * Bankroll-Verlust im Misserfolg, sondern Zeit-Investition mit linearen
 * Opportunitätskosten. Wir behalten die Formel als bewusste Heuristik,
 * aber nennen sie, was sie ist: eine EV/h-basierte Stunden-Empfehlung
 * mit Cap.
 *
 * Output-Felder:
 *   - kellyFraction: Anteil der Wochenstunden für diesen Lead, 0..25%
 *     (Cap absichtlich, damit ein einzelner Lead kein Pipeline-Risiko ist)
 *   - optimalHours: kellyFraction × hoursPerWeek
 *   - expectedValue: p × NPV − timeCost (klassisches EV)
 *   - roiPerHour: ev / timeHours
 *
 * Die Formel f* = (p·b − q)/b ist Kelly-formal, aber sie wird hier auf
 * Zeit-Bankroll appliziert, was kein klassisches Kelly-Setting ist. Im
 * Code ist das durch die Konstante CAP_FRACTION = 0.25 ohnehin domi-
 * niert: in der Praxis wirkt die Funktion wie eine min(EV-positive
 * Fraction, 25%) Heuristik. Der EV ist mathematisch korrekt; nur der
 * Bankroll-Anteil ist eine Approximation.
 */

const CAP_FRACTION = 0.25;
const HOURS_FLOOR = 0.5;

/**
 * @param {number} conversionRate - P(Conversion) 0-1
 * @param {number} dealSize - Auftragswert in EUR
 * @param {number} timeHours - Geschätzter Zeitaufwand in Stunden
 * @param {number} hoursPerWeek - Verfügbare Wochenstunden (Bankroll)
 * @param {number} r0 - Epidemiologischer R₀ (Folgeaufträge)
 * @param {number} hourlyOppCost - Opportunitätskosten EUR/h
 */
export function calculateKelly(conversionRate, dealSize, timeHours, hoursPerWeek = 20, r0 = 1, hourlyOppCost = 30) {
    const timeCost = timeHours * hourlyOppCost;

    // NPV mit Folgeaufträgen (Diskontrate 5% p.a., one-step)
    const discountRate = 0.05;
    const followUpDeals = Math.max(0, r0 - 1);
    const npvFollowUp = followUpDeals * dealSize / (1 + discountRate);
    const totalDealValue = dealSize + npvFollowUp;

    // Heuristische "Kelly"-Fraktion: f = (p·b − q)/b mit b = NPV/timeCost.
    // Mathematisch sauber wäre Kelly nur in einem Bankroll-mit-Verlust-Modell.
    // Hier ist b ein dimensionsloses Verhältnis Gewinn/Einsatz; die Cap-
    // Konstante macht das in der Praxis zur EV-positiven Stunden-Heuristik.
    const p = conversionRate;
    const q = 1 - p;
    const b = totalDealValue / Math.max(1, timeCost);
    const kellyF = b > 0 ? Math.max(0, Math.min(CAP_FRACTION, (p * b - q) / b)) : 0;

    // EV (klassisch, sauber)
    const ev = p * totalDealValue - timeCost;
    const optimalHours = Math.round(kellyF * hoursPerWeek * 10) / 10;
    const roiPerHour = ev / Math.max(HOURS_FLOOR, timeHours);

    return {
        // Bestehende Felder bleiben (API-Kompat) — Bedeutung im Disclaimer oben.
        kellyFraction: Math.round(kellyF * 1000) / 10,
        optimalHours,
        expectedValue: Math.round(ev * 100) / 100,
        roiPerHour: Math.round(roiPerHour * 100) / 100,
        npvTotal: Math.round(totalDealValue),
        followUpValue: Math.round(npvFollowUp),
        // Neu: explizite Kennzeichnung
        method: 'time-allocation-heuristic',
        capFraction: CAP_FRACTION,
        evPositive: ev > 0,
        recommendation: optimalHours < 0.3 ? 'Skip — EV zu niedrig'
            : optimalHours < 1.5 ? 'Quick-Pitch — max 1h'
            : optimalHours < 3 ? 'Standard-Akquise — 2-3h'
            : 'Voll investieren'
    };
}

/**
 * Direkter EV/h-Cap-Sizer ohne Kelly-Schmuck. Empfohlene Stunden =
 * EV-positive Stunden bis zu hoursPerWeek × CAP_FRACTION. Liefert das
 * gleiche Sizing in der Praxis, ohne die Kelly-Begriffsverwirrung.
 */
export function evPerHourCap(conversionRate, dealSize, timeHours, hoursPerWeek = 20, r0 = 1, hourlyOppCost = 30) {
    const followUpDeals = Math.max(0, r0 - 1);
    const npvFollowUp = followUpDeals * dealSize / 1.05;
    const totalDealValue = dealSize + npvFollowUp;
    const ev = conversionRate * totalDealValue - timeHours * hourlyOppCost;
    const evPerHour = ev / Math.max(HOURS_FLOOR, timeHours);
    const cappedHours = ev > 0 ? Math.min(hoursPerWeek * CAP_FRACTION, timeHours) : 0;
    return {
        method: 'ev-per-hour-cap',
        ev: Math.round(ev * 100) / 100,
        evPerHour: Math.round(evPerHour * 100) / 100,
        recommendedHours: Math.round(cappedHours * 10) / 10,
        capFraction: CAP_FRACTION
    };
}

export const KELLY_CONSTANTS = { CAP_FRACTION, HOURS_FLOOR };
