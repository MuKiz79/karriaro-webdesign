/**
 * Survival Analysis — Kaplan-Meier Time-to-Conversion
 */

const MEDIAN_DAYS = {
    'hair_salon': 10, 'beauty_salon': 12, 'restaurant': 14, 'cafe': 14,
    'dentist': 18, 'doctor': 20, 'physiotherapist': 16,
    'auto_repair': 12, 'plumber': 10, 'electrician': 10,
    'lawyer': 25, 'real_estate_agency': 22, 'hotel': 20,
    'car_dealer': 28, 'gym': 14, 'veterinary_care': 16,
    'bakery': 8, 'florist': 10, '_default': 16
};

export function estimateSurvival(branchType, leadScore) {
    const baseMedian = MEDIAN_DAYS[branchType] || MEDIAN_DAYS._default;
    const adjustedMedian = Math.round(baseMedian * (1.5 - leadScore / 100));
    const lambda = Math.log(2) / adjustedMedian;
    const survivalAt = (days) => Math.round(Math.exp(-lambda * days) * 100);

    return {
        medianDays: adjustedMedian,
        survival7d: survivalAt(7),
        survival14d: survivalAt(14),
        survival30d: survivalAt(30),
        giveUpAfter: Math.round(adjustedMedian * 2.5),
        label: `Median: ${adjustedMedian} Tage · Aufgeben nach ${Math.round(adjustedMedian * 2.5)} Tagen`
    };
}
