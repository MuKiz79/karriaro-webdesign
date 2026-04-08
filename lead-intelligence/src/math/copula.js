/**
 * C12: Clayton Copula — Korrelierte Lead-Abhängigkeiten
 *
 * Modelliert untere Tail-Abhängigkeit:
 * Wenn ein Friseur auf der Straße scheitert, scheitert der andere wahrscheinlich auch.
 * C(u,v) = (u^-θ + v^-θ - 1)^(-1/θ)
 */

import { clamp } from './sampling.js';

/**
 * Clayton Copula Conditional Sampling
 * Generiert ein v das mit u über den Clayton-Parameter θ korreliert ist
 *
 * @param {number} theta - Abhängigkeits-Parameter (0=unabhängig, ∞=perfekt korreliert)
 * @param {number} u - Erste Uniform-Variable (0-1)
 * @returns {number} Korreliertes v (0-1)
 */
export function claytonSample(theta, u) {
    if (theta <= 0) return Math.random();  // Unabhängig
    const v = Math.random();
    const t = Math.pow(
        Math.pow(u, -theta) * (Math.pow(v, -theta / (1 + theta)) - 1) + 1,
        -1 / theta
    );
    return clamp(t);
}

/**
 * Berechne korrelierte Portfolio-Conversions
 * Für Leads im gleichen Cluster (gleiche Straße/Branche) stärkere Korrelation
 *
 * @param {number[]} leadProbs - Array von Einzel-Conversion-Wahrscheinlichkeiten (0-1)
 * @param {boolean} sameCluster - Sind die Leads im gleichen lokalen Cluster?
 * @returns {number[]} Array von 0/1 (konvertiert / nicht konvertiert)
 */
export function correlatedPortfolio(leadProbs, sameCluster = false) {
    if (leadProbs.length < 2) {
        return leadProbs.map(p => Math.random() < p ? 1 : 0);
    }

    // Stärkere Abhängigkeit bei Cluster-Leads
    const theta = sameCluster ? 2.0 : 0.5;

    // Erster Lead unabhängig
    const u = Math.random();
    const results = [u < leadProbs[0] ? 1 : 0];

    // Alle weiteren via Copula verbunden
    for (let i = 1; i < leadProbs.length; i++) {
        const correlatedU = claytonSample(theta, u);
        results.push(correlatedU < leadProbs[i] ? 1 : 0);
    }

    return results;
}

/**
 * Berechne korrelierte Portfolio-Wahrscheinlichkeit via Monte-Carlo
 *
 * @param {number[]} leadProbs - Einzel-Wahrscheinlichkeiten
 * @param {boolean} sameCluster
 * @param {number} N - Simulationen
 * @returns {{atLeastOne: number, expectedConversions: number}}
 */
export function correlatedPortfolioProbability(leadProbs, sameCluster = false, N = 1000) {
    let atLeastOneCount = 0;
    let totalConversions = 0;

    for (let i = 0; i < N; i++) {
        const results = correlatedPortfolio(leadProbs, sameCluster);
        const conversions = results.reduce((a, b) => a + b, 0);
        if (conversions > 0) atLeastOneCount++;
        totalConversions += conversions;
    }

    return {
        atLeastOne: Math.round((atLeastOneCount / N) * 1000) / 10,
        expectedConversions: Math.round((totalConversions / N) * 100) / 100
    };
}
