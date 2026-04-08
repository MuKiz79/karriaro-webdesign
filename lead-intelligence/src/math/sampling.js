/**
 * Statistische Sampling-Funktionen
 * Marsaglia-Tsang Gamma → Beta, Box-Muller Normal, Hilfsfunktionen
 */

/** Box-Muller Transform: Standard Normal N(0,1) */
export function randn() {
    const u1 = Math.random(), u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Clamp value to [lo, hi] */
export function clamp(v, lo = 0, hi = 1) {
    return Math.max(lo, Math.min(hi, v));
}

/** Percentile of sorted array */
export function percentile(arr, p) {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length * p / 100)];
}

/**
 * Gamma Sampling via Marsaglia-Tsang (2000)
 * Korrekt für alle shape > 0
 * Für shape < 1: Boosting-Trick Gamma(a) = Gamma(a+1) * U^(1/a)
 */
export function sampleGamma(shape, scale = 1) {
    if (shape <= 0) return 0;
    if (shape < 1) {
        return sampleGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
        let x, v;
        do { x = randn(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        const u = Math.random();
        if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v * scale;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
    }
}

/**
 * Beta Sampling via zwei Gamma-Variablen
 * Beta(a,b) = Gamma(a) / (Gamma(a) + Gamma(b))
 */
export function sampleBeta(a, b) {
    if (a <= 0 || b <= 0) return a / (a + b) || 0.5;
    const x = sampleGamma(a);
    const y = sampleGamma(b);
    if (x + y === 0) return 0.5;
    return x / (x + y);
}

/**
 * Wilson Score Interval für binäre Proportion
 * Korrekt auch bei kleinem N (besser als Normalapproximation)
 */
export function wilsonCI(successes, total, z = 1.96) {
    if (total === 0) return { lower: 0, upper: 1, center: 0.5 };
    const p = successes / total;
    const denom = 1 + (z * z) / total;
    const center = (p + (z * z) / (2 * total)) / denom;
    const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denom;
    return {
        lower: Math.max(0, center - margin),
        upper: Math.min(1, center + margin),
        center
    };
}
