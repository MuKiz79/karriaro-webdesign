import { describe, it, expect } from 'vitest';
import { fitScaler, applyScaler, fitLogistic, predict, auc, looCv } from '../../src/math/logistic.js';

/** Deterministischer Zufall — Tests dürfen nicht von Math.random abhängen. */
function rng(seed = 42) {
    let s = seed;
    return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

describe('fitScaler / applyScaler', () => {
    it('zentriert und skaliert auf Mittelwert 0, Streuung 1', () => {
        const X = [[1, 10], [3, 20], [5, 30]];
        const sc = fitScaler(X);
        expect(sc.mean[0]).toBeCloseTo(3, 6);
        const Z = applyScaler(X, sc);
        const m = Z.reduce((s, r) => s + r[0], 0) / 3;
        expect(m).toBeCloseTo(0, 6);
    });

    it('eine konstante Spalte ergibt NaN-freie Nullen statt Division durch 0', () => {
        const Z = applyScaler([[5, 1], [5, 2]], fitScaler([[5, 1], [5, 2]]));
        expect(Z.every(r => Number.isFinite(r[0]))).toBe(true);
        expect(Z[0][0]).toBe(0);
    });

    it('mutiert die Eingabe nicht', () => {
        const X = [[1, 2], [3, 4]];
        const kopie = JSON.parse(JSON.stringify(X));
        applyScaler(X, fitScaler(X));
        expect(X).toEqual(kopie);
    });
});

describe('fitLogistic — findet eine BEKANNTE Regel wieder', () => {
    // Der eigentliche Beweis: ein Fit-Test, der nur „läuft ohne Fehler" prüft,
    // sagt nichts. Hier werden Daten aus einer bekannten Logit-Regel erzeugt und
    // das Verfahren muss deren Gewichte in Vorzeichen und Größenordnung treffen.
    function synthetisch(n, wWahr, bWahr, seed) {
        const r = rng(seed);
        const X = [], y = [];
        for (let i = 0; i < n; i++) {
            const row = wWahr.map(() => r() * 4 - 2);          // gleichverteilt −2…2
            let z = bWahr;
            for (let j = 0; j < row.length; j++) z += wWahr[j] * row[j];
            const p = 1 / (1 + Math.exp(-z));
            X.push(row);
            y.push(r() < p ? 1 : 0);
        }
        return { X, y };
    }

    it('trifft Vorzeichen und Rangfolge der wahren Gewichte', () => {
        const wWahr = [2.0, -1.5, 0.0];
        const { X, y } = synthetisch(400, wWahr, 0, 7);
        const sc = fitScaler(X);
        const m = fitLogistic(applyScaler(X, sc), y, { l2: 0.5, iterations: 3000, lr: 0.5 });

        expect(m.w[0]).toBeGreaterThan(0);          // positives Merkmal
        expect(m.w[1]).toBeLessThan(0);             // negatives Merkmal
        expect(Math.abs(m.w[0])).toBeGreaterThan(Math.abs(m.w[2]));  // stark > irrelevant
        expect(Math.abs(m.w[1])).toBeGreaterThan(Math.abs(m.w[2]));
    });

    it('das irrelevante Merkmal bleibt nahe null', () => {
        const { X, y } = synthetisch(400, [2.0, -1.5, 0.0], 0, 7);
        const sc = fitScaler(X);
        const m = fitLogistic(applyScaler(X, sc), y, { l2: 0.5, iterations: 3000, lr: 0.5 });
        expect(Math.abs(m.w[2])).toBeLessThan(0.5);
    });

    it('die L2-Strafe schrumpft die Gewichte', () => {
        const { X, y } = synthetisch(200, [2.0, -1.5, 0.0], 0, 11);
        const Z = applyScaler(X, fitScaler(X));
        const weich = fitLogistic(Z, y, { l2: 0.1, iterations: 2000, lr: 0.5 });
        const hart = fitLogistic(Z, y, { l2: 200, iterations: 2000, lr: 0.5 });
        expect(Math.abs(hart.w[0])).toBeLessThan(Math.abs(weich.w[0]));
    });

    it('bestraft den Achsenabschnitt NICHT — die Basisrate bleibt lernbar', () => {
        // 90 % Einsen: b muss deutlich positiv werden, auch bei harter L2-Strafe.
        const X = Array.from({ length: 100 }, (_, i) => [i / 100]);
        const y = X.map((_, i) => (i < 90 ? 1 : 0));
        const m = fitLogistic(applyScaler(X, fitScaler(X)), y, { l2: 500, iterations: 2000, lr: 0.5 });
        expect(m.b).toBeGreaterThan(1);
    });

    it('leere Eingabe ergibt ein neutrales Modell statt Absturz', () => {
        const m = fitLogistic([], [], {});
        expect(m.b).toBe(0);
        expect(m.w).toEqual([]);
    });

    it('bleibt bei extremen Werten numerisch stabil', () => {
        const X = [[1e6], [-1e6], [1e6], [-1e6]];
        const m = fitLogistic(applyScaler(X, fitScaler(X)), [1, 0, 1, 0], { iterations: 500 });
        expect(Number.isFinite(m.b)).toBe(true);
        expect(m.w.every(Number.isFinite)).toBe(true);
    });
});

describe('auc', () => {
    it('perfekte Trennung = 1.0', () => {
        expect(auc([0.9, 0.8, 0.7], [0.3, 0.2, 0.1])).toBeCloseTo(1.0, 6);
    });
    it('vollstaendig invertiert = 0.0', () => {
        expect(auc([0.1, 0.2, 0.3], [0.7, 0.8, 0.9])).toBeCloseTo(0.0, 6);
    });
    it('identische Werte (reiner Zufall) = 0.5', () => {
        expect(auc([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(0.5, 6);
    });
    it('ohne eine der beiden Klassen ist AUC undefiniert → null', () => {
        expect(auc([], [0.1])).toBeNull();
        expect(auc([0.9], [])).toBeNull();
    });
    it('handrechenbarer Teilfall', () => {
        // pos = [3], neg = [1, 5] → 1 von 2 Paaren richtig geordnet → 0.5
        expect(auc([3], [1, 5])).toBeCloseTo(0.5, 6);
    });
});

describe('looCv', () => {
    it('erkennt ein lernbares Muster mit AUC deutlich ueber 0.5', () => {
        const r = rng(3);
        const X = [], y = [];
        for (let i = 0; i < 60; i++) {
            const v = r() * 4 - 2;
            X.push([v, r() * 4 - 2]);
            y.push(v > 0 ? 1 : 0);            // Klasse haengt NUR an Merkmal 0
        }
        const { auc: a } = looCv(X, y, { l2: 0.5, iterations: 800, lr: 0.5 });
        expect(a).toBeGreaterThan(0.85);
    });

    it('erkennt REINES RAUSCHEN als solches — kein Selbstbetrug', () => {
        // Der wichtigste Schutz: ohne diesen Test wuerde ein ueberangepasstes
        // Modell auch bei zufaelligen Labels eine hohe AUC melden und das Gate
        // wuerde die Rangfolge auf Rauschen umstellen.
        const r = rng(5);
        const X = Array.from({ length: 60 }, () => [r() * 4 - 2, r() * 4 - 2]);
        const y = Array.from({ length: 60 }, () => (r() < 0.5 ? 1 : 0));
        const { auc: a } = looCv(X, y, { l2: 1.0, iterations: 800, lr: 0.5 });
        expect(a).toBeGreaterThan(0.25);
        expect(a).toBeLessThan(0.75);
    });

    it('zu wenige Daten ergeben null statt einer erfundenen Zahl', () => {
        expect(looCv([[1]], [1]).auc).toBeNull();
        expect(looCv([[1], [2]], [1, 0]).auc).toBeNull();
    });

    it('nur eine Klasse vorhanden → AUC null', () => {
        const X = Array.from({ length: 10 }, (_, i) => [i]);
        expect(looCv(X, X.map(() => 1)).auc).toBeNull();
    });
});
