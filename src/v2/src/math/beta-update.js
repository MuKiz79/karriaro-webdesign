/**
 * Conjugate Beta Update — Partial Pooling (Gelman BDA)
 *
 * Prior: Beta(a0, b0)
 * Observation: shift positive signals observed
 * Posterior: Beta(a0 + max(0, shift), b0 + max(0, -shift))
 *
 * This is the exact conjugate update for a Beta-Bernoulli model.
 * Positive shift = more successes observed → Alpha rises
 * Negative shift = more failures observed → Beta rises
 */
/**
 * FIX W8: Shifts skaliert als Pseudo-Beobachtungen
 * Problem vorher: shift=+4 wurde als "4 echte Conversions beobachtet" behandelt,
 * was die Posterior unnatürlich stark verschob.
 * Fix: Shifts werden mit einem Dämpfungsfaktor skaliert (0.5),
 * sodass sie wie "schwache Evidenz" wirken statt wie harte Daten.
 * Stärke der Prior bleibt dominant bei wenig Signalen.
 */
const SHIFT_DAMPING = 0.5;

export function conjugateUpdate(prior, shift) {
    const [a0, b0] = prior;
    const dampedShift = shift * SHIFT_DAMPING;
    const alpha = Math.max(1, a0 + Math.max(0, dampedShift));
    const beta = Math.max(1, b0 + Math.max(0, -dampedShift));
    return [alpha, beta];
}

/**
 * Beta Distribution Moments
 */
export function betaMean(a, b) { return a / (a + b); }
export function betaVariance(a, b) { return (a * b) / ((a + b) ** 2 * (a + b + 1)); }
export function betaMode(a, b) { return a > 1 && b > 1 ? (a - 1) / (a + b - 2) : betaMean(a, b); }
