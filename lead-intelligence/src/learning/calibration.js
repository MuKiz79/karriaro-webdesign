/**
 * Calibration-Pipeline: empirische Validierung der Lead-Scores.
 *
 * Konsumiert die existierenden Outcome-Records (feedback-loop.js
 * speichert {domain, score, outcome} in localStorage). Berechnet:
 *   - Reliability Diagram (Score-Bucket → empirische CR mit Wilson-CI)
 *   - Brier Score (mittlere quadratische Abweichung)
 *   - Log-Loss (negativer mittlerer Log-Likelihood)
 *   - Calibration-in-the-Large (Bias zwischen Mean-Pred und Mean-Outcome)
 *
 * Kein Hidden-State: liest live aus localStorage, gibt einen reinen
 * Snapshot zurück. Das ist die Grundlage für jede ehrliche Aussage
 * über "hat unser Modell überhaupt prädiktive Güte?".
 *
 * Konvention: scoreToProb() bildet den Lead-Score (0..100) auf eine
 * implizierte Conversion-Wahrscheinlichkeit ab — NICHT identisch mit
 * der Markov-CR, sondern die Wahrscheinlichkeit, dass _dieser konkrete
 * Lead_ am Ende Kunde wird (das ist, was wir empirisch beobachten).
 * Wir nutzen die invertierte stückweise lineare Funktion aus
 * funnel-chain.scoreFromConversionRate().
 */

import { wilsonCI } from '../math/sampling.js';

const STORAGE_KEY = 'karriaro_feedback';
const EPS = 1e-6;

/**
 * Invers zu scoreFromConversionRate(): score (0..100) → impl. Wahrscheinlichkeit.
 * Nutzt die gleichen Knickpunkte (1%, 3%, 6%, 12%) und Score-Brackets.
 */
export function scoreToProb(score) {
    if (score <= 0) return EPS;
    let p;
    if (score < 20) p = (score / 20) * 0.01;
    else if (score < 50) p = 0.01 + ((score - 20) / 30) * 0.02;
    else if (score < 75) p = 0.03 + ((score - 50) / 25) * 0.03;
    else p = 0.06 + ((score - 75) / 25) * 0.06;
    return Math.max(EPS, Math.min(1 - EPS, p));
}

function loadOutcomes(rawEntries) {
    const entries = rawEntries || (() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"entries":[]}').entries; }
        catch { return []; }
    })();
    return entries
        .filter(e => e && (e.outcome === 'kunde' || e.outcome === 'verloren'))
        .map(e => ({
            score: e.score,
            won: e.outcome === 'kunde' ? 1 : 0,
            timestamp: e.timestamp || 0,
            domain: e.domain
        }));
}

/**
 * Brier Score = mean((p − y)^2). Niedriger = besser.
 * Brier=0 perfekt, Brier=0.25 = "immer 50% raten", Brier→1 katastrophal.
 */
export function brierScore(outcomes) {
    if (!outcomes.length) return null;
    const sum = outcomes.reduce((acc, o) => {
        const p = scoreToProb(o.score);
        return acc + (p - o.won) ** 2;
    }, 0);
    return sum / outcomes.length;
}

/**
 * Log-Loss = − mean(y·log(p) + (1−y)·log(1−p)).
 * Pönalisiert konfidente Fehlvorhersagen viel härter als Brier.
 */
export function logLoss(outcomes) {
    if (!outcomes.length) return null;
    const sum = outcomes.reduce((acc, o) => {
        const p = scoreToProb(o.score);
        return acc + (o.won * Math.log(p) + (1 - o.won) * Math.log(1 - p));
    }, 0);
    return -sum / outcomes.length;
}

/**
 * Reliability Diagram: gruppiere Outcomes in Score-Buckets, berechne pro
 * Bucket empirische CR + Wilson-CI. Default-Buckets matchen
 * feedback-loop.scoreBucket() für Konsistenz.
 */
const DEFAULT_BUCKETS = [
    { key: '0-24',   min: 0,  max: 24 },
    { key: '25-39',  min: 25, max: 39 },
    { key: '40-54',  min: 40, max: 54 },
    { key: '55-69',  min: 55, max: 69 },
    { key: '70-100', min: 70, max: 100 }
];

export function reliabilityDiagram(outcomes, buckets = DEFAULT_BUCKETS) {
    return buckets.map(b => {
        const inBucket = outcomes.filter(o => o.score >= b.min && o.score <= b.max);
        const n = inBucket.length;
        const k = inBucket.reduce((s, o) => s + o.won, 0);
        const empirical = n > 0 ? k / n : null;
        const ci = n > 0 ? wilsonCI(k, n) : null;
        const meanPredicted = n > 0
            ? inBucket.reduce((s, o) => s + scoreToProb(o.score), 0) / n
            : null;
        const calibrationGap = (empirical !== null && meanPredicted !== null)
            ? empirical - meanPredicted
            : null;
        return {
            bucket: b.key,
            min: b.min,
            max: b.max,
            n,
            wins: k,
            empiricalCR: empirical,
            empiricalCRPct: empirical !== null ? Math.round(empirical * 1000) / 10 : null,
            meanPredicted,
            meanPredictedPct: meanPredicted !== null ? Math.round(meanPredicted * 1000) / 10 : null,
            ci: ci ? { lower: ci.lower, upper: ci.upper } : null,
            ciPct: ci ? { lower: Math.round(ci.lower * 1000) / 10, upper: Math.round(ci.upper * 1000) / 10 } : null,
            calibrationGap,
            verdict: calibrationGap === null ? 'n/a'
                : Math.abs(calibrationGap) < 0.02 ? 'kalibriert'
                : calibrationGap > 0 ? 'unter-kalibriert (Modell zu pessimistisch)'
                : 'über-kalibriert (Modell zu optimistisch)'
        };
    });
}

/**
 * Calibration-in-the-Large: Mean predicted vs Mean outcome über das
 * gesamte Set. Vorzeichen verrät systematischen Bias.
 */
export function calibrationInTheLarge(outcomes) {
    if (!outcomes.length) return null;
    const meanP = outcomes.reduce((s, o) => s + scoreToProb(o.score), 0) / outcomes.length;
    const meanY = outcomes.reduce((s, o) => s + o.won, 0) / outcomes.length;
    return {
        meanPredicted: meanP,
        meanOutcome: meanY,
        bias: meanP - meanY,
        biasPct: Math.round((meanP - meanY) * 1000) / 10,
        verdict: Math.abs(meanP - meanY) < 0.01 ? 'unbiased'
            : meanP > meanY ? 'systematisch zu optimistisch'
            : 'systematisch zu pessimistisch'
    };
}

/**
 * Reliability Score (Expected Calibration Error, ECE).
 * Σ (n_b / N) · |empirical_b − meanPred_b|, gewichtet nach Bucket-Größe.
 * 0 = perfekt kalibriert.
 */
export function expectedCalibrationError(diagram, total) {
    if (!total) return null;
    return diagram.reduce((acc, b) => {
        if (b.n === 0 || b.calibrationGap === null) return acc;
        return acc + (b.n / total) * Math.abs(b.calibrationGap);
    }, 0);
}

/**
 * Hauptfunktion: vollständiger Calibration-Snapshot.
 * Optional rawEntries übergeben für Tests; ohne: liest aus localStorage.
 */
export function calibrationSnapshot(rawEntries = null) {
    const outcomes = loadOutcomes(rawEntries);
    const N = outcomes.length;
    const MIN_N = 20;

    if (N < MIN_N) {
        return {
            available: false,
            n: N,
            required: MIN_N,
            reason: `Mindestens ${MIN_N} Outcomes (Kunde/Verloren) für statistische Aussage. Aktuell: ${N}.`
        };
    }

    const diagram = reliabilityDiagram(outcomes);
    const brier = brierScore(outcomes);
    const ll = logLoss(outcomes);
    const cil = calibrationInTheLarge(outcomes);
    const ece = expectedCalibrationError(diagram, N);

    // Vergleich zu trivialen Baselines:
    //   p̄ = Mean-Outcome (constant predictor)
    const meanY = cil.meanOutcome;
    const brierBaseline = meanY * (1 - meanY);              // Brier von "immer p̄"
    const llBaseline = meanY > EPS && meanY < 1 - EPS
        ? -(meanY * Math.log(meanY) + (1 - meanY) * Math.log(1 - meanY))
        : null;

    // Skill: 1 − Brier_model / Brier_baseline   (>0 = besser als Konstante)
    const brierSkill = brierBaseline > 0 ? 1 - brier / brierBaseline : null;

    return {
        available: true,
        n: N,
        diagram,
        brier,
        logLoss: ll,
        ece,
        calibrationInTheLarge: cil,
        baseline: {
            meanOutcome: meanY,
            brier: brierBaseline,
            logLoss: llBaseline
        },
        brierSkillScore: brierSkill,
        verdict: brierSkill === null ? 'n/a'
            : brierSkill > 0.1 ? 'Modell schlägt Konstanten-Baseline deutlich'
            : brierSkill > 0 ? 'Modell schlägt Konstanten-Baseline knapp'
            : 'Modell schlechter als "immer Mean-CR raten" — Score-Mapping prüfen'
    };
}
