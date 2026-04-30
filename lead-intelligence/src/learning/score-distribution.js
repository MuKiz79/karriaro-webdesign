/**
 * Score-Inflation-Tracker.
 *
 * Frage: Wandert der Median der ausgegebenen Lead-Scores über Zeit nach
 * oben, ohne dass die empirische Conversion mitläuft? Genau dann wäre die
 * Pipeline durch Boni & Multiplikatoren self-inflating.
 *
 * Methode:
 *   1) Logge bei jeder Analyse {timestamp, score} (Append-Only).
 *   2) Berechne Histogramm + Quantile (P10, Median, P90) im aktuellen
 *      Fenster und in einem Vergleichsfenster davor.
 *   3) Vergleiche: Bewegung des Medians, Verschiebung der Verteilung
 *      (Mann-Whitney-U als nicht-parametrische Drift-Statistik).
 *   4) Querverweis auf calibration.js: wenn Score-Median ↑ aber empirische
 *      CR konstant → Inflation.
 *
 * Speicher-Schlüssel: 'karriaro_score_log' (Array von {ts, score, branch?}).
 * Cap auf MAX_LOG_ENTRIES, älteste werden verworfen.
 */

const STORAGE_KEY = 'karriaro_score_log';
const MAX_LOG_ENTRIES = 5000;
const MS_PER_DAY = 86400000;

function loadLog() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
}
function saveLog(log) {
    if (log.length > MAX_LOG_ENTRIES) log = log.slice(-MAX_LOG_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
}

/**
 * Persistiert einen einzelnen Score-Eintrag. In der Pipeline am Ende
 * von runSingleCheck() / Batch-Eintrag aufzurufen.
 */
export function logScore(score, branch = '_default', ts = Date.now()) {
    const log = loadLog();
    log.push({ ts, score, branch });
    saveLog(log);
}

function quantile(sortedArr, q) {
    if (!sortedArr.length) return null;
    const idx = (sortedArr.length - 1) * q;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sortedArr[lo];
    return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function summarize(scores) {
    if (!scores.length) return { n: 0 };
    const sorted = [...scores].sort((a, b) => a - b);
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    return {
        n: sorted.length,
        mean: Math.round(mean * 10) / 10,
        p10: Math.round(quantile(sorted, 0.10) * 10) / 10,
        median: Math.round(quantile(sorted, 0.50) * 10) / 10,
        p90: Math.round(quantile(sorted, 0.90) * 10) / 10,
        min: sorted[0],
        max: sorted[sorted.length - 1]
    };
}

/**
 * Histogramm mit gewählten Bin-Breiten (Default: 10er-Schritte).
 */
export function histogram(scores, binSize = 10) {
    const bins = [];
    for (let lo = 0; lo < 100; lo += binSize) {
        const hi = Math.min(100, lo + binSize - 1);
        const count = scores.filter(s => s >= lo && s <= hi).length;
        bins.push({ lo, hi, count, pct: scores.length ? Math.round(count / scores.length * 1000) / 10 : 0 });
    }
    return bins;
}

/**
 * Mann-Whitney-U-Test: nicht-parametrischer Two-Sample-Test auf
 * Verteilungsverschiebung. Liefert U, mittlere Rangsumme und einen
 * z-approximierten p-Wert (zweiseitig).
 *
 * Eigene Implementation, weil die Pipeline keine Stat-Lib hat. Tie-
 * Korrektur in der Varianz wäre theoretisch sauberer, hier reicht die
 * Standard-Approximation.
 */
export function mannWhitneyU(sampleA, sampleB) {
    const nA = sampleA.length, nB = sampleB.length;
    if (nA === 0 || nB === 0) return null;
    const combined = [
        ...sampleA.map(v => ({ v, src: 'A' })),
        ...sampleB.map(v => ({ v, src: 'B' }))
    ].sort((x, y) => x.v - y.v);

    // Average-rank assignment für Ties
    let i = 0;
    while (i < combined.length) {
        let j = i;
        while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
        const avgRank = (i + j) / 2 + 1; // 1-basiert
        for (let k = i; k <= j; k++) combined[k].rank = avgRank;
        i = j + 1;
    }
    const rankSumA = combined.filter(x => x.src === 'A').reduce((s, x) => s + x.rank, 0);
    const U_A = rankSumA - (nA * (nA + 1)) / 2;
    const U_B = nA * nB - U_A;
    const U = Math.min(U_A, U_B);

    // Normalapprox (gültig für n >= ~10)
    const meanU = (nA * nB) / 2;
    const stdU = Math.sqrt((nA * nB * (nA + nB + 1)) / 12);
    const z = stdU > 0 ? (U_A - meanU) / stdU : 0;
    // Two-tailed p via Erfc-Approximation
    const p = 2 * (1 - normCdf(Math.abs(z)));
    return { U, U_A, U_B, z: Math.round(z * 1000) / 1000, p: Math.round(p * 1000) / 1000, nA, nB };
}

/** Standard-Normal-CDF via Abramowitz-Stegun-Approximation. */
function normCdf(x) {
    const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
    const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
    const sign = x < 0 ? -1 : 1;
    const xa = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * xa);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-xa * xa);
    return 0.5 * (1.0 + sign * y);
}

/**
 * Inflation-Snapshot: vergleicht Fenster [now-2W, now-W) (Vorperiode)
 * mit [now-W, now] (aktuell). Default W=14 Tage.
 */
export function inflationSnapshot(windowDays = 14, now = Date.now(), rawLog = null) {
    const log = rawLog || loadLog();
    const cutoffNow = now - windowDays * MS_PER_DAY;
    const cutoffPrev = now - 2 * windowDays * MS_PER_DAY;
    const current = log.filter(e => e.ts >= cutoffNow).map(e => e.score);
    const previous = log.filter(e => e.ts >= cutoffPrev && e.ts < cutoffNow).map(e => e.score);

    const sumCurrent = summarize(current);
    const sumPrevious = summarize(previous);

    const MIN_N = 30;
    if (sumCurrent.n < MIN_N || sumPrevious.n < MIN_N) {
        return {
            available: false,
            current: sumCurrent,
            previous: sumPrevious,
            required: MIN_N,
            reason: `Mindestens ${MIN_N} Scores pro Fenster — aktuell ${sumCurrent.n}, vorher ${sumPrevious.n}.`
        };
    }

    const u = mannWhitneyU(current, previous);
    const medianShift = sumCurrent.median - sumPrevious.median;
    const meanShift = sumCurrent.mean - sumPrevious.mean;

    return {
        available: true,
        windowDays,
        current: sumCurrent,
        previous: sumPrevious,
        currentHistogram: histogram(current),
        previousHistogram: histogram(previous),
        medianShift: Math.round(medianShift * 10) / 10,
        meanShift: Math.round(meanShift * 10) / 10,
        mannWhitney: u,
        verdict: u && u.p < 0.05 && Math.abs(medianShift) >= 3
            ? medianShift > 0
                ? `Score-Median um ${medianShift.toFixed(1)} Punkte gestiegen (p=${u.p}) — auf Inflation prüfen`
                : `Score-Median um ${Math.abs(medianShift).toFixed(1)} Punkte gefallen (p=${u.p})`
            : 'Score-Verteilung stabil'
    };
}

/**
 * Querverweis-Helfer: nimmt einen Inflation-Snapshot und einen
 * Calibration-Snapshot und entscheidet, ob es Score-Inflation OHNE
 * empirisch-bessere Performance gibt — der eigentliche Inflations-Indiz.
 */
export function inflationVsCalibration(inflation, calibration) {
    if (!inflation?.available) return { available: false, reason: 'Inflation-Snapshot fehlt' };
    if (!calibration?.available) {
        return {
            available: true,
            inflated: inflation.medianShift > 3,
            calibrationKnown: false,
            verdict: inflation.medianShift > 3
                ? `Scores driften nach oben (Δmedian=${inflation.medianShift}) — Empirie unbekannt, mehr Outcomes nötig`
                : 'Scores stabil'
        };
    }
    const cilBias = calibration.calibrationInTheLarge?.bias ?? 0;
    return {
        available: true,
        calibrationKnown: true,
        medianShift: inflation.medianShift,
        cilBias: Math.round(cilBias * 1000) / 10,
        verdict: inflation.medianShift > 3 && cilBias > 0.02
            ? 'Score-Inflation bestätigt: Scores steigen UND das Modell ist zu optimistisch'
            : inflation.medianShift > 3 && cilBias <= 0.02
                ? 'Scores steigen, Calibration aber stabil — vermutlich echte Lead-Verbesserung'
                : inflation.medianShift <= 3 && cilBias > 0.02
                    ? 'Score-Verteilung stabil, aber systematisch zu optimistisch — Mapping zu hoch'
                    : 'Stabil und kalibriert'
    };
}

export const SCORE_LOG_CONSTANTS = { MAX_LOG_ENTRIES, MS_PER_DAY };
