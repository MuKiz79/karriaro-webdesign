/**
 * Regularisierte logistische Regression (MAP) + AUC — pure, ohne Abhängigkeit.
 *
 * ─── Warum genau dieses Verfahren ──────────────────────────────────────────
 * Aufgabe: aus wenigen Dutzend Founder-Bewertungen („den würde ich anrufen")
 * lernen, welche der gemessenen Lead-Merkmale wirklich zählen.
 *
 *   • Kein RAG — es gibt keinen Text zu erden, und RAG lernt keine Gewichte.
 *   • Kein neuronales Netz / Boosting — bei n = 50–300 und ~20 Merkmalen
 *     überanpasst jedes Verfahren mit hoher Kapazität, und die Erklärbarkeit
 *     wäre weg. Die ist hier der einzige Schutz gegen ~90 unbelegte Zahlen.
 *   • Logistische Regression liefert EIN lesbares Gewicht je Merkmal, ist bei
 *     kleinem n durch die L2-Strafe stabil und gibt eine Wahrscheinlichkeit —
 *     die Grundlage für aktives Lernen (Unsicherheit = |p − 0.5|).
 *
 * Alle Funktionen sind rein: keine Netz-, DOM- oder Storage-Zugriffe.
 *
 * @module math/logistic
 */

import { mannWhitneyU } from '../learning/score-distribution.js';

/**
 * Mittelwert/Streuung je Spalte. MUSS mitgespeichert werden — eine Vorhersage
 * auf anders skalierten Merkmalen ist wertlos.
 * @param {number[][]} X  Zeilen = Beobachtungen, Spalten = Merkmale
 * @returns {{mean:number[], sd:number[]}}
 */
export function fitScaler(X) {
    const n = X.length;
    const d = n ? X[0].length : 0;
    const mean = new Array(d).fill(0);
    const sd = new Array(d).fill(1);
    if (!n) return { mean, sd };
    for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j] / n;
    for (let j = 0; j < d; j++) {
        let v = 0;
        for (const row of X) v += (row[j] - mean[j]) ** 2;
        // Konstante Spalten: sd 1 statt 0 — sonst NaN. Ihr zentrierter Wert ist
        // ohnehin 0, das Merkmal traegt dann schlicht nichts bei.
        sd[j] = Math.sqrt(v / n) || 1;
    }
    return { mean, sd };
}

/** Wendet einen Skalierer an (kopiert, mutiert nicht). */
export function applyScaler(X, scaler) {
    return X.map(row => row.map((v, j) => (v - scaler.mean[j]) / scaler.sd[j]));
}

function sigmoid(z) {
    // Numerisch stabil: exp(|z|) laeuft sonst bei grossen |z| ueber.
    if (z >= 0) return 1 / (1 + Math.exp(-z));
    const e = Math.exp(z);
    return e / (1 + e);
}

/**
 * MAP-Schätzung per Gradientenabstieg mit L2-Strafe.
 *
 * Die Strafe wirkt NICHT auf den Achsenabschnitt — sonst würde die Basisrate
 * gegen 50 % gezogen, obwohl sie einfach die Häufigkeit der Daumen-hoch ist.
 *
 * @param {number[][]} X  bereits standardisiert
 * @param {number[]} y    0/1
 * @param {{l2?:number, iterations?:number, lr?:number}} [opts]
 * @returns {{w:number[], b:number, iterations:number, logLik:number}}
 */
export function fitLogistic(X, y, { l2 = 1.0, iterations = 500, lr = 0.1 } = {}) {
    const n = X.length;
    const d = n ? X[0].length : 0;
    const w = new Array(d).fill(0);
    let b = 0;
    if (!n) return { w, b, iterations: 0, logLik: 0 };

    for (let it = 0; it < iterations; it++) {
        const gw = new Array(d).fill(0);
        let gb = 0;
        for (let i = 0; i < n; i++) {
            let z = b;
            for (let j = 0; j < d; j++) z += w[j] * X[i][j];
            const err = sigmoid(z) - y[i];
            gb += err / n;
            for (let j = 0; j < d; j++) gw[j] += (err * X[i][j]) / n;
        }
        // ⚠️ Die L2-Strafe NICHT in den Gradientenschritt mischen. `w -= lr·(l2/n)·w`
        // divergiert, sobald `lr·l2/n > 2` — das Gewicht oszilliert und laeuft nach
        // wenigen Iterationen auf NaN. Ein Test mit l2=500 hat genau das gezeigt.
        // Stattdessen der PROXIMALE Schritt `w / (1 + lr·l2/n)`: exakte Loesung des
        // Straf-Teilproblems, unbedingt stabil fuer jedes l2, und fuer kleine
        // Schrittweiten identisch zum Gradientenschritt.
        const shrink = 1 / (1 + lr * (l2 / n));
        for (let j = 0; j < d; j++) w[j] = (w[j] - lr * gw[j]) * shrink;
        b -= lr * gb;                       // Achsenabschnitt bleibt unbestraft
        if (!Number.isFinite(b) || w.some(v => !Number.isFinite(v))) {
            // Sicherheitsnetz: lieber ein neutrales Modell als NaN-Gewichte, die
            // still in eine Rangfolge einflieszen.
            return { w: new Array(d).fill(0), b: 0, iterations: it, logLik: -Infinity, diverged: true };
        }
    }

    let logLik = 0;
    for (let i = 0; i < n; i++) {
        let z = b;
        for (let j = 0; j < d; j++) z += w[j] * X[i][j];
        const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(z)));
        logLik += y[i] ? Math.log(p) : Math.log(1 - p);
    }
    return { w, b, iterations, logLik };
}

/** Wahrscheinlichkeit je Zeile. `X` muss mit DEMSELBEN Skalierer transformiert sein. */
export function predict(X, model) {
    return X.map(row => {
        let z = model.b;
        for (let j = 0; j < row.length; j++) z += model.w[j] * row[j];
        return sigmoid(z);
    });
}

/**
 * AUC (Fläche unter der ROC-Kurve) = Wahrscheinlichkeit, dass ein zufälliger
 * Positivfall höher bewertet wird als ein zufälliger Negativfall. Genau das
 * misst RANGFOLGE-Qualität — und darum geht es hier, nicht um kalibrierte
 * Wahrscheinlichkeiten.
 *
 * Baut auf dem vorhandenen `mannWhitneyU` (mit Tie-Korrektur) auf:
 * AUC = U(positiv) / (n₊ · n₋).
 *
 * @returns {number|null} null bei fehlender Klasse (AUC dann undefiniert)
 */
export function auc(scoresPositive, scoresNegative) {
    const nP = scoresPositive.length, nN = scoresNegative.length;
    if (!nP || !nN) return null;
    // ⚠️ Das Feld heisst U_A (nicht uA) — ein Tippfehler haette hier still
    // `null` geliefert und das Gate haette nie ausgeloest.
    const r = mannWhitneyU(scoresPositive, scoresNegative);
    if (!r || typeof r.U_A !== 'number') return null;
    return r.U_A / (nP * nN);
}

/**
 * Leave-one-out-Kreuzvalidierung: jede Beobachtung einmal als Testfall.
 * Bei n ≤ ~300 problemlos bezahlbar und die belastbarste Schätzung, die bei
 * so wenigen Daten überhaupt zu haben ist (k-fold würde bei n=40 stark
 * schwanken, je nachdem wie die Faltung fällt).
 *
 * ⚠️ Der Skalierer wird IN JEDER Falte neu geschätzt. Ihn einmal über alle
 * Daten zu bilden waere ein Leck aus dem Testfall in das Training und wuerde
 * die AUC schoenrechnen.
 *
 * @returns {{predictions:number[], auc:number|null}}
 */
export function looCv(X, y, opts = {}) {
    const n = X.length;
    const predictions = new Array(n).fill(0.5);
    if (n < 3) return { predictions, auc: null };

    for (let i = 0; i < n; i++) {
        const Xtr = [], ytr = [];
        for (let k = 0; k < n; k++) if (k !== i) { Xtr.push(X[k]); ytr.push(y[k]); }
        // Entartete Falte (nur eine Klasse im Training) → neutrale Vorhersage.
        if (!ytr.some(v => v === 1) || !ytr.some(v => v === 0)) continue;
        const sc = fitScaler(Xtr);
        const m = fitLogistic(applyScaler(Xtr, sc), ytr, opts);
        predictions[i] = predict(applyScaler([X[i]], sc), m)[0];
    }
    const pos = predictions.filter((_, i) => y[i] === 1);
    const neg = predictions.filter((_, i) => y[i] === 0);
    return { predictions, auc: auc(pos, neg) };
}
