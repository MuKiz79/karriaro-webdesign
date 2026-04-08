/**
 * Markov Decision Process — FIX I7: Markov IST der Funnel
 *
 * 7 Zustände: Kalt → Kontaktiert → Interessiert → Gespräch → Angebot → Kunde → Verloren
 * Rückfallraten abhängig von Aktivierungsenergie (Ea)
 * EINZIGES Modell für Conversion-Rate (kein separater Produkt-Funnel)
 */

export const STATE_NAMES = ['Kalt', 'Kontaktiert', 'Interessiert', 'Im Gespräch', 'Angebot', 'Kunde', 'Verloren'];
export const STATE_CUSTOMER = 5;
export const STATE_LOST = 6;

/**
 * Baue Übergangsmatrix aus Stufen-Wahrscheinlichkeiten
 * @param {number[]} stageRates - [pReach, pOpen, pInterest, pConvo, pProposal, pClose] je 0-1
 * @param {number} activationEa - Aktivierungsenergie (5-80), höher = mehr Rückfall
 * @param {number} seasonFactor - Saisonalitätsfaktor (nur auf Öffnungs-Stufe, Index 1)
 */
export function buildTransitionMatrix(stageRates, activationEa = 40, seasonFactor = 1.0) {
    const [p1, p2, p3, p4, p5, p6] = stageRates;

    // P2 FIX: Saisonalität nur auf Öffnung
    const p2adj = Math.min(1, p2 * seasonFactor);

    // Rückfallrate abhängig von Aktivierungsenergie
    const fb = Math.min(0.25, 0.05 + (activationEa / 100) * 0.15);

    return [
        //  Kalt   Kont   Inter  Gespr  Angeb  Kunde  Verl
        [0,      p1,    0,     0,     0,     0,     1 - p1],                              // Kalt
        [fb,     0,     p2adj, 0,     0,     0,     Math.max(0, 1 - p2adj - fb)],         // Kontaktiert
        [0,      fb*.8, 0,     p3,    0,     0,     Math.max(0, 1 - p3 - fb * .8)],       // Interessiert
        [0,      0,     fb*.6, 0,     p4,    0,     Math.max(0, 1 - p4 - fb * .6)],       // Gespräch
        [0,      0,     0,     fb*.5, 0,     p5*p6, Math.max(0, 1 - p5 * p6 - fb * .5)],  // Angebot
        [0,      0,     0,     0,     0,     1,     0],                                    // Kunde (absorbing)
        [0,      0,     0,     0,     0,     0,     1]                                     // Verloren (absorbing)
    ];
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
 * Monte-Carlo über N Simulationen — FIX I7: Dies ist die EINZIGE Conversion-Rate
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
