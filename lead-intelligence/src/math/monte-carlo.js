/**
 * Monte-Carlo Hauptberechnung.
 *
 * NEU (Audit 2026-04-30): Die alte "Markov"-Schicht war forward-only und
 * mathematisch identisch zu einem sequenziellen Bernoulli-Funnel. Wir
 * delegieren jetzt an math/funnel-chain.js — selbe Semantik, weniger
 * MC-Varianz, ehrliche conditionalPassRate. Diese Datei bleibt als
 * Aufrufer-API stehen (Tests + lead-scorer importieren von hier).
 *
 * FIXES (alt):
 * I2: Wilson CI aus N Beta-Samples (jetzt: aus runFunnelSimulation)
 * I7: Eine einzige Conversion-Rate aus Bernoulli-Produkt
 */

import { sampleBeta, wilsonCI, percentile } from './sampling.js';
import { conjugateUpdate, betaMean } from './beta-update.js';
import { buildTransitionMatrix, monteCarloMarkov } from './markov.js';
import { runFunnelSimulation } from './funnel-chain.js';

/**
 * Hauptberechnung: Sampelt Beta-Verteilungen → baut Markov-Matrix → simuliert
 *
 * @param {Array<{name:string, alpha:number, beta:number}>} stages - 6 Funnel-Stufen
 * @param {number} activationEa - Aktivierungsenergie
 * @param {number} seasonFactor - Saisonalitätsfaktor
 * @param {number} N - Anzahl Monte-Carlo-Simulationen
 * @returns {Object} Vollständiges Ergebnis
 */
export function runSimulation(stages, activationEa = 40, seasonFactor = 1.0, N = 2000) {
    return runFunnelSimulation(stages, activationEa, seasonFactor, N);
}

/**
 * I5 FIX: Kontrafaktische Sensitivity — re-simuliere OHNE einzelne Signale
 * @param {Function} buildStagesFn - Funktion die Stages aus Shifts baut
 * @param {Object} baseShifts - Basis-Shifts
 * @param {string[]} signalNames - Welche Signale testen
 * @param {number} activationEa
 * @param {number} seasonFactor
 */
export function counterfactualSensitivity(buildStagesFn, baseShifts, signalNames, activationEa, seasonFactor) {
    // Berechne Baseline-Score
    const baseStages = buildStagesFn(baseShifts);
    const baseResult = runSimulation(baseStages, activationEa, seasonFactor, 500);

    const sensitivities = [];
    for (const signal of signalNames) {
        // Kopiere Shifts und entferne dieses Signal
        const modifiedShifts = JSON.parse(JSON.stringify(baseShifts));
        // Setze alle Shifts die zu diesem Signal gehören auf 0
        for (const key of Object.keys(modifiedShifts)) {
            if (modifiedShifts[key]._signals?.[signal]) {
                modifiedShifts[key][0] -= modifiedShifts[key]._signals[signal];
            }
        }

        const modStages = buildStagesFn(modifiedShifts);
        const modResult = runSimulation(modStages, activationEa, seasonFactor, 500);

        const delta = baseResult.leadScore - modResult.leadScore;
        if (Math.abs(delta) > 1) {
            sensitivities.push({ signal, delta, baseScore: baseResult.leadScore, withoutScore: modResult.leadScore });
        }
    }

    return sensitivities.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * I4 FIX: Sobol-ähnliche Variance Decomposition
 * Welche Stufe trägt die meiste Unsicherheit zur End-Conversion bei?
 */
export function varianceDecomposition(stages, activationEa, seasonFactor, N = 500) {
    // Berechne Gesamt-Varianz
    const results = [];
    for (let i = 0; i < N; i++) {
        const rates = stages.map(s => sampleBeta(s.alpha, s.beta));
        const T = buildTransitionMatrix(rates, activationEa, seasonFactor);
        const sim = monteCarloMarkov(T, 1);
        results.push(sim.conversionRate);
    }
    const totalVar = variance(results);

    // Pro Stufe: Fixiere alle anderen auf Mean, variiere nur diese
    const decomposition = stages.map((s, idx) => {
        const fixedResults = [];
        for (let i = 0; i < N; i++) {
            const rates = stages.map((st, j) => j === idx ? sampleBeta(st.alpha, st.beta) : betaMean(st.alpha, st.beta));
            const T = buildTransitionMatrix(rates, activationEa, seasonFactor);
            const sim = monteCarloMarkov(T, 1);
            fixedResults.push(sim.conversionRate);
        }
        const stageVar = variance(fixedResults);
        return { name: s.name, varianceContribution: totalVar > 0 ? stageVar / totalVar : 0 };
    });

    // Normalisiere
    const total = decomposition.reduce((s, d) => s + d.varianceContribution, 0);
    decomposition.forEach(d => d.pct = total > 0 ? Math.round(d.varianceContribution / total * 100) : 17);
    decomposition.sort((a, b) => b.pct - a.pct);

    return decomposition;
}

function variance(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}
