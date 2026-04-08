/**
 * Lead History + Score Drift + Monitoring
 */

export function logLeadOutcome(domain, leadScore, outcome) {
    const h = JSON.parse(localStorage.getItem('karriaro_lead_history') || '[]');
    h.push({ domain, leadScore, outcome, timestamp: Date.now() });
    localStorage.setItem('karriaro_lead_history', JSON.stringify(h));
}

export function checkDrift(domain, currentScore) {
    const history = JSON.parse(localStorage.getItem('karriaro_score_history') || '{}');
    const prev = history[domain];
    const drifted = prev && Math.abs(currentScore - prev.score) > 15;
    history[domain] = { score: currentScore, checkedAt: Date.now() };
    localStorage.setItem('karriaro_score_history', JSON.stringify(history));
    return {
        drifted,
        previousScore: prev?.score || null,
        delta: prev ? currentScore - prev.score : null,
        alert: drifted ? `Score: ${prev.score} → ${currentScore}` : null
    };
}

export function saveBaseline(domain, scores) {
    const baselines = JSON.parse(localStorage.getItem('karriaro_baselines') || '{}');
    baselines[domain] = { ...scores, checkedAt: Date.now() };
    localStorage.setItem('karriaro_baselines', JSON.stringify(baselines));
}
