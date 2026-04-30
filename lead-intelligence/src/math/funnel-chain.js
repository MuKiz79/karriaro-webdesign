/**
 * Sequenzielles Bernoulli-Funnel (ersetzt das vormalige "Markov"-Theater).
 *
 * Begründung: Die alte buildTransitionMatrix() / simulate() in markov.js war
 * eine Markov-Kette ohne Rückfälle und ohne Schleifen — jede Stufe geht
 * deterministisch entweder vorwärts oder in den absorbierenden "Verloren"-
 * Zustand. Die End-Conversion ist mathematisch identisch zum Produkt der
 * (gedämpften) Stufen-Wahrscheinlichkeiten. Wir benennen das hier, was es ist,
 * und sparen eine Schicht MC-Varianz.
 *
 * Output ist API-kompatibel zu monteCarloMarkov(), damit die alte Aufrufer-
 * Pipeline stehen bleiben kann.
 */

import { sampleBeta, wilsonCI, percentile } from './sampling.js';
import { betaMean } from './beta-update.js';

/**
 * Berechnet die Stufen-Forward-Raten nach Ea-Dämpfung & Saisonalität.
 * Spiegelt buildTransitionMatrix(), aber als simple Vektor-Operation.
 *
 * @param {number[]} stageRates - [pReach, pOpen, pInterest, pConvo, pProposal, pClose]
 * @param {number} activationEa - 5-80
 * @param {number} seasonFactor - nur auf pOpen (Stufe 2)
 * @returns {number[]} 6 forward-Raten in [0.01, 1]
 */
export function dampedForwardRates(stageRates, activationEa = 40, seasonFactor = 1.0) {
    const damping = Math.min(0.20, 0.02 + (activationEa / 100) * 0.20);
    const dp = (p, factor = 1.0) => Math.max(0.01, Math.min(1, p * (1 - damping * factor)));
    const [p1, p2, p3, p4, p5, p6] = stageRates;
    const p2adj = Math.min(1, p2 * seasonFactor);
    return [dp(p1), dp(p2adj), dp(p3), dp(p4), dp(p5 * p6, 0.5), 1];
    // Letzter Eintrag ist Platzhalter; das tatsächliche close-Produkt steckt schon in Index 4.
}

/**
 * Conversion-Rate als geschlossene Form: Produkt der ersten 5 forward-Raten.
 * Kein MC-Sampling nötig — analytisch exakt.
 */
export function conversionRateAnalytic(stageRates, activationEa = 40, seasonFactor = 1.0) {
    const f = dampedForwardRates(stageRates, activationEa, seasonFactor);
    return f[0] * f[1] * f[2] * f[3] * f[4];
}

/**
 * Conditional Pass-Rate pro Stufe: P(Stufe i bestanden | Stufe i erreicht).
 * Ehrlich bei einer Forward-Only-Kette: identisch mit der gedämpften
 * Forward-Rate selbst.
 */
export function conditionalPassRates(stageRates, activationEa = 40, seasonFactor = 1.0) {
    return dampedForwardRates(stageRates, activationEa, seasonFactor).slice(0, 5);
}

/**
 * Erwartete Stufen-Erreichungs-Wahrscheinlichkeit P(Stufe i erreicht).
 * Stufe 0 = 1, danach kumulatives Produkt.
 */
export function reachProbabilities(stageRates, activationEa = 40, seasonFactor = 1.0) {
    const f = dampedForwardRates(stageRates, activationEa, seasonFactor);
    const reach = [1];
    for (let i = 0; i < 5; i++) reach.push(reach[i] * f[i]);
    return reach;
}

/**
 * Hauptfunktion: Sampelt Beta-Posteriors, berechnet pro Sample die exakte
 * Conversion-Rate, gibt Punkt-Schätzer + Wilson-CI + Stufen-Statistik zurück.
 *
 * @param {Array<{name:string, alpha:number, beta:number}>} stages
 * @param {number} activationEa
 * @param {number} seasonFactor
 * @param {number} N - Anzahl Beta-Samples (Default 2000)
 * @returns {Object} kompatibel mit dem alten runSimulation()-Output
 */
export function runFunnelSimulation(stages, activationEa = 40, seasonFactor = 1.0, N = 2000) {
    const stageSamples = stages.map(() => []);
    const crSamples = [];
    const reachAccum = stages.map(() => 0);
    const passAccum = stages.map(() => 0);

    for (let i = 0; i < N; i++) {
        const rates = stages.map((s, idx) => {
            const p = sampleBeta(s.alpha, s.beta);
            stageSamples[idx].push(p);
            return p;
        });
        const fwd = dampedForwardRates(rates, activationEa, seasonFactor);
        const reach = [1];
        for (let s = 0; s < 5; s++) {
            reach.push(reach[s] * fwd[s]);
            reachAccum[s] += reach[s];
            passAccum[s] += reach[s] * fwd[s];
        }
        crSamples.push(reach[5]);
    }

    const meanCR = crSamples.reduce((a, b) => a + b, 0) / N;
    // Wilson-CI auf binäre Successe-Approximation: round(meanCR * N) Erfolge.
    const successesEquivalent = Math.round(meanCR * N);
    const ci = wilsonCI(successesEquivalent, N);

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
            // Echte conditional pass rate: Σ(reach × pass) / Σ(reach), nur über die ersten 5 Stufen
            conditionalPassRate: idx < 5 && reachAccum[idx] > 0
                ? Math.round((passAccum[idx] / reachAccum[idx]) * 1000) / 10
                : null
        };
    });

    const bottleneck = [...stageResults].sort((a, b) => a.mean - b.mean)[0];

    const leadScore = scoreFromConversionRate(meanCR);

    return {
        leadScore,
        conversionRate: meanCR,
        conversionRatePct: Math.round(meanCR * 1000) / 10,
        ci: { lower: Math.round(ci.lower * 1000) / 10, upper: Math.round(ci.upper * 1000) / 10 },
        ciMargin: Math.round((ci.upper - ci.lower) / 2 * 1000) / 10,
        stageResults,
        bottleneck,
        medianSteps: null,
        converted: successesEquivalent,
        N,
        method: 'sequential-bernoulli'
    };
}

/**
 * Score-Mapping aus Conversion-Rate. Stückweise linear, Knickpunkte und
 * Score-Beträge sind kalibrierte Heuristik (1%, 3%, 6%, 12%) — nicht
 * statistisch herleitbar. Wird in einem Reliability-Diagram empirisch
 * validiert (siehe learning/calibration.js).
 */
export function scoreFromConversionRate(cr) {
    if (cr <= 0) return 0;
    let s;
    if (cr < 0.01) s = (cr / 0.01) * 20;
    else if (cr < 0.03) s = 20 + ((cr - 0.01) / 0.02) * 30;
    else if (cr < 0.06) s = 50 + ((cr - 0.03) / 0.03) * 25;
    else s = 75 + ((cr - 0.06) / 0.06) * 25;
    return Math.round(Math.min(100, Math.max(0, s)));
}
