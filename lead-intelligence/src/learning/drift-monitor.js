/**
 * Prior-Drift-Detection.
 *
 * Frage: Driftet die empirische Conversion-Rate einer Branche so weit
 * vom impliziten Prior weg, dass das Prior nicht mehr stimmt?
 *
 * Methode: Wilson-Score-CI über die letzten n Outcomes pro Branche.
 * Wenn der Prior-Mean außerhalb der Wilson-CI liegt → Drift signalisieren.
 * Optional Fenster (rollend, Default: alle Outcomes der letzten 90 Tage).
 *
 * Das ergänzt prior-update.js: Update verschiebt den Multiplikator
 * vorsichtig (Beta-conjugate); Drift-Monitor zeigt prominent an, dass
 * jenseits der Update-Glättung etwas systematisch nicht mehr passt.
 */

import { wilsonCI } from '../math/sampling.js';
import { impliedEndCR } from './prior-update.js';

const MS_PER_DAY = 86400000;
const DEFAULT_WINDOW_DAYS = 90;
const MIN_N_FOR_DRIFT = 15;

/**
 * Filtert Outcomes auf das Fenster [now - windowDays, now].
 */
export function filterWindow(entries, windowDays = DEFAULT_WINDOW_DAYS, now = Date.now()) {
    const cutoff = now - windowDays * MS_PER_DAY;
    return entries.filter(e => (e.timestamp || 0) >= cutoff);
}

/**
 * Drift-Test für eine einzelne Branche.
 * Liefert ein Verdict mit Wilson-CI und expliziter Aussage, ob der Prior
 * außerhalb des CI liegt.
 */
export function driftForBranch(branch, branchPrior, outcomes, z = 1.96) {
    const wins = outcomes.filter(o => o.outcome === 'kunde').length;
    const losses = outcomes.filter(o => o.outcome === 'verloren').length;
    const n = wins + losses;
    if (n < MIN_N_FOR_DRIFT) {
        return {
            branch,
            n,
            available: false,
            reason: `Mindestens ${MIN_N_FOR_DRIFT} Outcomes (Kunde/Verloren) für Drift-Test. Aktuell: ${n}.`
        };
    }
    const priorMean = impliedEndCR(branchPrior);
    const ci = wilsonCI(wins, n, z);
    const empirical = wins / n;
    const priorOutsideCI = priorMean < ci.lower || priorMean > ci.upper;
    const direction = empirical < priorMean ? 'unter' : empirical > priorMean ? 'über' : 'gleich';
    return {
        branch,
        n,
        wins,
        losses,
        available: true,
        empirical,
        empiricalPct: Math.round(empirical * 1000) / 10,
        priorMean,
        priorMeanPct: Math.round(priorMean * 1000) / 10,
        ci,
        ciPct: { lower: Math.round(ci.lower * 1000) / 10, upper: Math.round(ci.upper * 1000) / 10 },
        priorOutsideCI,
        direction,
        verdict: !priorOutsideCI
            ? 'Prior konsistent mit empirischen Daten'
            : direction === 'unter'
                ? `Prior überschätzt — empirisch ${Math.round(empirical * 1000) / 10}% < Prior ${Math.round(priorMean * 1000) / 10}%`
                : `Prior unterschätzt — empirisch ${Math.round(empirical * 1000) / 10}% > Prior ${Math.round(priorMean * 1000) / 10}%`
    };
}

/**
 * Drift-Test über alle Branchen, die im Outcome-Stream vorkommen.
 */
export function driftAllBranches(entries, branchPriorTable, windowDays = DEFAULT_WINDOW_DAYS, now = Date.now()) {
    const windowed = filterWindow(entries, windowDays, now);
    const byBranch = {};
    for (const e of windowed) {
        if (e.outcome !== 'kunde' && e.outcome !== 'verloren') continue;
        const b = e.branch || '_default';
        if (!byBranch[b]) byBranch[b] = [];
        byBranch[b].push(e);
    }
    const results = [];
    for (const [branch, outcomes] of Object.entries(byBranch)) {
        const prior = branchPriorTable[branch] || branchPriorTable._default;
        if (!prior) continue;
        results.push(driftForBranch(branch, prior, outcomes));
    }
    results.sort((a, b) => {
        const aDrift = a.priorOutsideCI ? 1 : 0;
        const bDrift = b.priorOutsideCI ? 1 : 0;
        return bDrift - aDrift || (b.n - a.n);
    });
    return {
        windowDays,
        windowedN: windowed.length,
        results,
        flagged: results.filter(r => r.priorOutsideCI),
        flaggedCount: results.filter(r => r.priorOutsideCI).length
    };
}

export const DRIFT_CONSTANTS = {
    MS_PER_DAY,
    DEFAULT_WINDOW_DAYS,
    MIN_N_FOR_DRIFT
};
