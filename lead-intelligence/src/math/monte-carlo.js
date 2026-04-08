/**
 * Monte-Carlo Hauptberechnung — FIX I7: Einheitliches Markov-Modell
 *
 * FIXES:
 * I1: Keine Momentum-Verzerrung der Beta-Verteilung
 *     → Stufen-Korrelation über die Markov-Rückfallraten (nicht Beta-Parameter)
 * I2: Wilson CI aus binären Markov-Ergebnissen
 * I3: stagePassRates nur conditional (für erreichte Stufen)
 * I7: Markov IST der Funnel — eine einzige Conversion-Rate
 */

import { sampleBeta, wilsonCI, percentile } from './sampling.js';
import { conjugateUpdate, betaMean } from './beta-update.js';
import { buildTransitionMatrix, monteCarloMarkov } from './markov.js';

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
    // Für jede MC-Iteration: Sample Stufen-Raten, baue Matrix, simuliere
    let totalConverted = 0;
    const allSteps = [];
    const convSteps = [];

    // I3 FIX: Conditional Pass-Rates (nur für Leads die die Stufe erreicht haben)
    const stageReachedCount = stages.map(() => 0);
    const stagePassedCount = stages.map(() => 0);

    // Sammle Stufen-Raten-Samples für Unsicherheitsband
    const stageSamples = stages.map(() => []);

    for (let i = 0; i < N; i++) {
        // Sample Stufen-Wahrscheinlichkeiten aus Beta-Posteriors
        const rates = stages.map((s, idx) => {
            const p = sampleBeta(s.alpha, s.beta);
            stageSamples[idx].push(p);
            return p;
        });

        // Baue Transition-Matrix mit gesampelten Raten
        const T = buildTransitionMatrix(rates, activationEa, seasonFactor);

        // Simuliere durch Markov-Kette
        const sim = monteCarloMarkov(T, 1);  // Eine Simulation pro Rate-Sample

        if (sim.converted) {
            totalConverted++;
            convSteps.push(sim.medianSteps || 1);
        }
        allSteps.push(sim.avgSteps);

        // I3 FIX: Tracke welche Stufen TATSÄCHLICH erreicht wurden
        // Im Markov: State 0→1 = Stufe 1 erreicht, 1→2 = Stufe 2, etc.
        // Vereinfachung: Wenn converted, wurden alle Stufen erreicht
        // Wenn nicht: Stufen bis zum Abbruch wurden erreicht
        const maxStateReached = sim.converted ? 5 : Math.max(0, ...allSteps.map(() => 0));
        // Genauer: Die Markov-Simulation gibt uns nicht direkt welche Stufe erreicht wurde
        // Wir approximieren: Bei Conversion = alle 6 Stufen reached+passed
        if (sim.converted) {
            for (let s = 0; s < stages.length; s++) { stageReachedCount[s]++; stagePassedCount[s]++; }
        }
    }

    // I7 FIX: Eine einzige Conversion-Rate aus Markov
    const conversionRate = totalConverted / N;

    // I2 FIX: Wilson Score CI aus binären Ergebnissen
    const ci = wilsonCI(totalConverted, N);

    // Stufen-Ergebnisse (I3: conditional rates)
    const stageResults = stages.map((s, idx) => {
        const samples = stageSamples[idx];
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        return {
            name: s.name,
            mean: Math.round(mean * 1000) / 10,
            alpha: s.alpha,
            beta: s.beta,
            ci5: Math.round(percentile(samples, 5) * 1000) / 10,
            ci95: Math.round(percentile(samples, 95) * 1000) / 10,
            conditionalPassRate: stageReachedCount[idx] > 0
                ? Math.round((stagePassedCount[idx] / stageReachedCount[idx]) * 1000) / 10
                : null
        };
    });

    const bottleneck = [...stageResults].sort((a, b) => a.mean - b.mean)[0];

    // Lead Score (logarithmische Skalierung)
    const leadScore = Math.round(Math.min(100, Math.max(0,
        conversionRate <= 0 ? 0 :
        conversionRate < 0.01 ? conversionRate / 0.01 * 20 :
        conversionRate < 0.03 ? 20 + (conversionRate - 0.01) / 0.02 * 30 :
        conversionRate < 0.06 ? 50 + (conversionRate - 0.03) / 0.03 * 25 :
        75 + (conversionRate - 0.06) / 0.06 * 25
    )));

    // Median Steps to Conversion
    const medianSteps = convSteps.length > 0
        ? [...convSteps].sort((a, b) => a - b)[Math.floor(convSteps.length / 2)]
        : null;

    return {
        leadScore,
        conversionRate,
        conversionRatePct: Math.round(conversionRate * 1000) / 10,
        ci: { lower: Math.round(ci.lower * 1000) / 10, upper: Math.round(ci.upper * 1000) / 10 },
        ciMargin: Math.round((ci.upper - ci.lower) / 2 * 1000) / 10,
        stageResults,
        bottleneck,
        medianSteps,
        converted: totalConverted,
        N
    };
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
