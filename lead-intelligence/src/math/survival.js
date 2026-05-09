/**
 * Survival Analysis — Weibull Time-to-Conversion
 *
 * HINWEIS: Sowohl der Shape-Parameter k=1.5 als auch die Branchen-MEDIAN_DAYS
 * sind DEFAULT-HEURISTIKEN, nicht aus eigenen Outcome-Daten kalibriert. Die
 * Werte basieren auf der Annahme "moderate fallende Hazard-Rate, branchen-
 * typische Reaktionszeiten" — sind aber keine empirischen Schaetzer.
 *
 * Sobald >=50 echte Outcome-Daten (Lead → Antwort/Auftrag/Absage mit Datum)
 * vorliegen, sollte k aus einer Maximum-Likelihood-Anpassung an die empirische
 * Hazard-Rate geschaetzt werden, und die MEDIAN_DAYS aus Kaplan-Meier-Schaetzern
 * pro Branche.
 *
 * Die Zahlen sind besser als nichts (verhindern naive konstante Hazard-Annahme),
 * aber sollten im UI als "Default-Heuristik" markiert werden.
 */

const MEDIAN_DAYS = {
    'hair_salon': 10, 'beauty_salon': 12, 'restaurant': 14, 'cafe': 14,
    'dentist': 18, 'doctor': 20, 'physiotherapist': 16,
    'auto_repair': 12, 'plumber': 10, 'electrician': 10,
    'lawyer': 25, 'real_estate_agency': 22, 'hotel': 20,
    'car_dealer': 28, 'gym': 14, 'veterinary_care': 16,
    'bakery': 8, 'florist': 10, '_default': 16
};

/**
 * S(t) = exp(-(t/λ)^k) mit k > 1 → fallende Hazard-Rate
 * Idee: Wer nach 20 Tagen nicht geantwortet hat, antwortet wahrscheinlich nie.
 * k = 1.5 (Default-Heuristik), λ aus Median abgeleitet.
 */
export function estimateSurvival(branchType, leadScore) {
    const baseMedian = MEDIAN_DAYS[branchType] || MEDIAN_DAYS._default;
    const adjustedMedian = Math.max(3, Math.round(baseMedian * (1.5 - leadScore / 100)));

    // Weibull Parameter
    const k = 1.5;  // Shape > 1 = Wahrscheinlichkeit sinkt mit der Zeit
    // λ aus Median: S(median) = 0.5 → exp(-(median/λ)^k) = 0.5 → λ = median / (ln2)^(1/k)
    const lambda = adjustedMedian / Math.pow(Math.log(2), 1 / k);

    const survivalAt = (days) => Math.round(Math.exp(-Math.pow(days / lambda, k)) * 100);

    // Hazard-Rate h(t) = (k/λ) * (t/λ)^(k-1) — steigt mit t wenn k > 1
    const hazardAt = (days) => (k / lambda) * Math.pow(days / lambda, k - 1);

    return {
        medianDays: adjustedMedian,
        survival7d: survivalAt(7),
        survival14d: survivalAt(14),
        survival30d: survivalAt(30),
        giveUpAfter: Math.round(adjustedMedian * 2.5),
        weibullK: k,
        weibullLambda: Math.round(lambda * 10) / 10,
        hazard14d: Math.round(hazardAt(14) * 1000) / 1000,
        // Disclaimer im Label: Default-Heuristik, nicht aus History kalibriert
        label: `Median: ${adjustedMedian} Tage · Aufgeben nach ${Math.round(adjustedMedian * 2.5)} Tagen (Default-Heuristik, Weibull k=${k})`,
        isCalibrated: false
    };
}
