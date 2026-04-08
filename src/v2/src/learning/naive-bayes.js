/**
 * Fix 10: Naive-Bayes Shift-Berechnung
 *
 * Statt menschlich geschätzter Integer-Shifts:
 * Berechne Log-Likelihood-Ratio für jedes Signal
 * P(Signal | Converted) / P(Signal | Not Converted)
 *
 * Lernt aus echten Daten welche Signale wirklich prädiktiv sind.
 * Bis 50+ Datenpunkte: Fallback auf synthetische Daten.
 */

import { generateSyntheticTrainingData } from '../priors/benchmark-data.js';

/**
 * Trainiere Naive-Bayes-Modell aus Trainingsdaten
 * @param {Array} data - Array von {features, outcome}
 * @returns {Object} Likelihood-Ratios pro Feature
 */
export function trainNaiveBayes(data) {
    if (!data || data.length < 20) {
        // Fallback: Synthetische Daten verwenden
        data = generateSyntheticTrainingData(200);
    }

    const converted = data.filter(d => d.outcome === 1);
    const notConverted = data.filter(d => d.outcome === 0);

    if (converted.length < 5 || notConverted.length < 5) {
        return { ready: false, reason: 'Zu wenig Daten', n: data.length };
    }

    // Berechne P(Feature | Converted) und P(Feature | Not Converted) für binäre Features
    const binaryFeatures = ['isBaukasten', 'hasInstagram', 'hasFbPixel', 'hasSSL', 'hasViewport'];
    const continuousFeatures = ['perf', 'seo', 'a11y', 'reviews', 'rating'];

    const likelihoods = {};

    // Binäre Features: Laplace-geglättete Wahrscheinlichkeiten
    for (const f of binaryFeatures) {
        const pGivenConv = (converted.filter(d => d.features[f]).length + 1) / (converted.length + 2);
        const pGivenNotConv = (notConverted.filter(d => d.features[f]).length + 1) / (notConverted.length + 2);
        const logLR = Math.log(pGivenConv / pGivenNotConv);
        likelihoods[f] = {
            pConv: Math.round(pGivenConv * 1000) / 1000,
            pNotConv: Math.round(pGivenNotConv * 1000) / 1000,
            logLikelihoodRatio: Math.round(logLR * 1000) / 1000,
            // Shift: Positiver logLR = Signal prädiziert Conversion → positiver Shift
            suggestedShift: Math.round(logLR * 3)  // Skaliert auf Integer-Shifts
        };
    }

    // Kontinuierliche Features: Vergleiche Mittelwerte
    for (const f of continuousFeatures) {
        const meanConv = converted.reduce((s, d) => s + (d.features[f] || 0), 0) / converted.length;
        const meanNotConv = notConverted.reduce((s, d) => s + (d.features[f] || 0), 0) / notConverted.length;
        const diff = meanConv - meanNotConv;
        const pooledSD = Math.sqrt(
            (variance(converted.map(d => d.features[f] || 0)) + variance(notConverted.map(d => d.features[f] || 0))) / 2
        ) || 1;
        const effectSize = diff / pooledSD;  // Cohen's d

        likelihoods[f] = {
            meanConv: Math.round(meanConv * 10) / 10,
            meanNotConv: Math.round(meanNotConv * 10) / 10,
            effectSize: Math.round(effectSize * 100) / 100,
            // Negativer Effect Size für perf/seo/a11y = schlechtere Website → besserer Lead
            direction: effectSize < 0 ? 'Niedriger = besserer Lead' : 'Höher = besserer Lead'
        };
    }

    return {
        ready: true,
        n: data.length,
        nConverted: converted.length,
        likelihoods,
        priorConvRate: converted.length / data.length
    };
}

function variance(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

/**
 * Berechne Naive-Bayes Score für einen Lead
 * @param {Object} features - Lead-Features
 * @param {Object} model - Trainiertes Modell aus trainNaiveBayes
 * @returns {number} Log-Posterior-Odds (höher = besserer Lead)
 */
export function predictNaiveBayes(features, model) {
    if (!model?.ready) return null;

    let logOdds = Math.log(model.priorConvRate / (1 - model.priorConvRate));

    for (const [f, lr] of Object.entries(model.likelihoods)) {
        if (lr.logLikelihoodRatio !== undefined && features[f] !== undefined) {
            logOdds += features[f] ? lr.logLikelihoodRatio : -lr.logLikelihoodRatio * 0.3;
        }
    }

    // Konvertiere zu Wahrscheinlichkeit
    const prob = 1 / (1 + Math.exp(-logOdds));
    return { probability: Math.round(prob * 1000) / 10, logOdds: Math.round(logOdds * 100) / 100 };
}
