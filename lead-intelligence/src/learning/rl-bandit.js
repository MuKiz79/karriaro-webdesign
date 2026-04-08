/**
 * C11: Reinforcement Learning — Multi-Armed Bandit (UCB1)
 *
 * Lernt welche Follow-Up-Nachricht bei welcher Branche am besten funktioniert.
 * Actions: problem_screenshot, euro_verlust, konkurrenz_vergleich, kostenloser_entwurf, social_proof
 */

/**
 * Hole gespeicherten RL-State
 */
function getState() {
    return JSON.parse(localStorage.getItem('karriaro_rl_state') || '{}');
}

function saveState(state) {
    localStorage.setItem('karriaro_rl_state', JSON.stringify(state));
}

const ACTIONS = ['problem_screenshot', 'euro_verlust', 'konkurrenz_vergleich', 'kostenloser_entwurf', 'social_proof'];

const ACTION_LABELS = {
    'problem_screenshot': 'Screenshot des Problems zeigen',
    'euro_verlust': 'Umsatzverlust-Zahl nennen',
    'konkurrenz_vergleich': 'Konkurrenz-Vergleich zeigen',
    'kostenloser_entwurf': 'Kostenlosen Entwurf anbieten',
    'social_proof': 'Referenz-Projekt zeigen (Kolbe)'
};

/**
 * Wähle Aktion via Upper Confidence Bound (UCB1)
 *
 * @param {string} branchType - z.B. 'dentist'
 * @param {number} touchpoint - Welcher Touchpoint (1-5)
 * @returns {{action: string, label: string, reason: string}}
 */
export function selectAction(branchType, touchpoint) {
    const state = getState();
    const key = `${branchType}_${touchpoint}`;
    const stats = state[key] || {};

    const totalPlays = ACTIONS.reduce((s, a) => s + (stats[a]?.plays || 0), 0);

    // Exploration: Jede Aktion mindestens 2x ausprobieren
    if (totalPlays < ACTIONS.length * 2) {
        const leastPlayed = ACTIONS.reduce((best, a) =>
            (!stats[a] || stats[a].plays < (stats[best]?.plays || Infinity)) ? a : best, ACTIONS[0]);
        return {
            action: leastPlayed,
            label: ACTION_LABELS[leastPlayed],
            reason: 'Exploration (zu wenig Daten)',
            totalPlays
        };
    }

    // UCB1: Wähle Aktion mit höchstem Upper Confidence Bound
    let bestAction = ACTIONS[0], bestUCB = -Infinity;
    for (const a of ACTIONS) {
        const s = stats[a] || { plays: 1, reward: 0 };
        const mean = s.reward / s.plays;
        const ucb = mean + Math.sqrt(2 * Math.log(totalPlays) / s.plays);
        if (ucb > bestUCB) { bestUCB = ucb; bestAction = a; }
    }

    return {
        action: bestAction,
        label: ACTION_LABELS[bestAction],
        reason: `UCB1-Optimierung (${totalPlays} Versuche)`,
        ucb: Math.round(bestUCB * 100) / 100,
        totalPlays
    };
}

/**
 * Registriere Ergebnis
 * @param {string} branchType
 * @param {number} touchpoint
 * @param {string} action
 * @param {number} reward - 0 = keine Antwort, 1 = Antwort/Erfolg
 */
export function logReward(branchType, touchpoint, action, reward) {
    const state = getState();
    const key = `${branchType}_${touchpoint}`;
    if (!state[key]) state[key] = {};
    if (!state[key][action]) state[key][action] = { plays: 0, reward: 0 };
    state[key][action].plays++;
    state[key][action].reward += reward;
    saveState(state);
}

/**
 * Hole Statistiken für Anzeige
 */
export function getStats(branchType, touchpoint) {
    const state = getState();
    const key = `${branchType}_${touchpoint}`;
    const stats = state[key] || {};
    return ACTIONS.map(a => ({
        action: a,
        label: ACTION_LABELS[a],
        plays: stats[a]?.plays || 0,
        reward: stats[a]?.reward || 0,
        rate: stats[a]?.plays > 0 ? Math.round((stats[a].reward / stats[a].plays) * 100) : 0
    }));
}
