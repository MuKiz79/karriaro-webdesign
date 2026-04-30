/**
 * "Markov"-Kette — DEPRECATED, nur noch für Tests + Backward-Compat.
 *
 * Ohne Rückfälle und ohne Schleifen ist diese Kette mathematisch keine
 * Markov-Kette mit echtem Mehrwert, sondern ein sequenzielles Bernoulli-
 * Funnel. Neue Aufrufer sollen math/funnel-chain.js nutzen, das die
 * gleiche Conversion-Rate analytisch (ohne MC-Varianz) liefert.
 *
 * 7 Zustände: Kalt → Kontaktiert → Interessiert → Gespräch → Angebot → Kunde → Verloren
 *
 * Ea wirkt als Dämpfung der Forward-Rate, nicht als Rückfall-Pfad.
 */

export const STATE_NAMES = ['Kalt', 'Kontaktiert', 'Interessiert', 'Im Gespräch', 'Angebot', 'Kunde', 'Verloren'];
export const STATE_CUSTOMER = 5;
export const STATE_LOST = 6;

/**
 * Baue Übergangsmatrix aus Stufen-Wahrscheinlichkeiten
 * @param {number[]} stageRates - [pReach, pOpen, pInterest, pConvo, pProposal, pClose] je 0-1
 * @param {number} activationEa - Aktivierungsenergie (5-80), höher = schwerer zu überzeugen
 * @param {number} seasonFactor - Saisonalitätsfaktor (nur auf Öffnungs-Stufe)
 */
export function buildTransitionMatrix(stageRates, activationEa = 40, seasonFactor = 1.0) {
    const [p1, p2, p3, p4, p5, p6] = stageRates;

    // Ea-Dämpfung: Höhere Ea → Forward-Rate wird reduziert
    // Ea=5 → damping=0.02 (kaum Widerstand)
    // Ea=40 → damping=0.10
    // Ea=80 → damping=0.18 (starker Widerstand)
    const damping = Math.min(0.20, 0.02 + (activationEa / 100) * 0.20);

    // Saisonalität nur auf Öffnung
    const p2adj = Math.min(1, p2 * seasonFactor);

    // Gedämpfte Forward-Rates
    const dp = (p, factor = 1.0) => Math.max(0.01, p * (1 - damping * factor));

    const T = [
        //  Kalt      Kont      Inter     Gespr     Angeb     Kunde     Verl
        [0,         dp(p1),   0,        0,        0,        0,        1 - dp(p1)],
        [0,         0,        dp(p2adj),0,        0,        0,        1 - dp(p2adj)],
        [0,         0,        0,        dp(p3),   0,        0,        1 - dp(p3)],
        [0,         0,        0,        0,        dp(p4),   0,        1 - dp(p4)],
        [0,         0,        0,        0,        0,        dp(p5*p6, 0.5), 1 - dp(p5*p6, 0.5)],
        [0,         0,        0,        0,        0,        1,        0],    // Kunde (absorbing)
        [0,         0,        0,        0,        0,        0,        1]     // Verloren (absorbing)
    ];

    return T;
}

/**
 * Simuliere einen Lead durch die Markov-Kette
 */
export function simulate(T, maxSteps = 25) {
    let state = 0;
    const path = [state];
    for (let step = 0; step < maxSteps; step++) {
        const row = T[state];
        const r = Math.random();
        let cumul = 0;
        for (let j = 0; j < row.length; j++) {
            cumul += Math.max(0, row[j]);
            if (r < cumul) { state = j; break; }
        }
        path.push(state);
        if (state >= STATE_CUSTOMER) break;
    }
    return { finalState: state, path, converted: state === STATE_CUSTOMER };
}

/**
 * Monte-Carlo über N Simulationen
 */
export function monteCarloMarkov(T, N = 2000) {
    let converted = 0;
    const steps = [];
    const convSteps = [];

    for (let i = 0; i < N; i++) {
        const sim = simulate(T);
        if (sim.converted) {
            converted++;
            convSteps.push(sim.path.length - 1);
        }
        steps.push(sim.path.length - 1);
    }

    const conversionRate = converted / N;
    const medianSteps = convSteps.length > 0
        ? [...convSteps].sort((a, b) => a - b)[Math.floor(convSteps.length / 2)]
        : null;

    return { conversionRate, converted, lost: N - converted, medianSteps, avgSteps: steps.reduce((a, b) => a + b, 0) / N, N };
}
