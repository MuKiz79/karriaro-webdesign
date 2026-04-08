/**
 * C10: Gaussian Process — Korrelierte Stufen-Perturbationen
 *
 * Modelliert die Korrelation zwischen Funnel-Stufen als kontinuierliche Funktion.
 * Benachbarte Stufen (z.B. Öffnung→Interesse) sind stärker korreliert als entfernte.
 * Squared Exponential Kernel: k(x,y) = σ² · exp(-||x-y||² / 2l²)
 */

import { randn } from './sampling.js';

/**
 * SE Kernel
 */
export function seKernel(x, y, sigma = 1, lengthScale = 0.5) {
    const diff = x - y;
    return sigma * sigma * Math.exp(-(diff * diff) / (2 * lengthScale * lengthScale));
}

/**
 * Generiere korrelierte Perturbationen für die 6 Funnel-Stufen
 * Verwendet eine Cholesky-ähnliche Dekomposition der Kovarianzmatrix
 *
 * @param {number[]} stageMeans - 6 Stufen-Mittelwerte (0-100)
 * @param {number} sigma - Kovarianz-Stärke (default 0.02 = kleine Perturbationen)
 * @param {number} lengthScale - Wie schnell die Korrelation mit Distanz abnimmt
 * @returns {number[]} Korreliert perturbierte Mittelwerte (0-100)
 */
export function correlateStageMeans(stageMeans, sigma = 0.02, lengthScale = 0.5) {
    const n = stageMeans.length;

    // Baue Kovarianzmatrix K
    const K = [];
    for (let i = 0; i < n; i++) {
        K[i] = [];
        for (let j = 0; j < n; j++) {
            K[i][j] = seKernel(i / n, j / n, sigma, lengthScale);
            if (i === j) K[i][j] += 0.001;  // Jitter für numerische Stabilität
        }
    }

    // Cholesky-ähnlich: Generiere korrelierte Perturbationen
    // Vereinfachte Cholesky (Lower-Triangular Approximation)
    const L = choleskyDecomposition(K);
    const z = Array.from({ length: n }, () => randn());

    // x = L × z
    const perturbations = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            perturbations[i] += L[i][j] * z[j];
        }
    }

    // Addiere Perturbationen zu den Mittelwerten
    return stageMeans.map((m, i) => Math.max(0, Math.min(100, m + perturbations[i] * 100)));
}

/**
 * Cholesky Decomposition: A = L × L^T
 * Für kleine Matrizen (6×6) effizient genug
 */
function choleskyDecomposition(A) {
    const n = A.length;
    const L = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let sum = 0;
            for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];

            if (i === j) {
                L[i][j] = Math.sqrt(Math.max(0, A[i][i] - sum));
            } else {
                L[i][j] = L[j][j] > 0 ? (A[i][j] - sum) / L[j][j] : 0;
            }
        }
    }
    return L;
}
