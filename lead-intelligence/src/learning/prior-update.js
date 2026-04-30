/**
 * Branchen-Prior-Update: macht aus dem Reporting-Feedback echtes Lernen.
 *
 * Der ursprüngliche Workflow war: feedback-loop.js sammelt Outcomes pro
 * Branche, zeigt aber nur Bucket-Statistiken. Hier nutzen wir die Outcomes
 * als echte Beobachtungen und updaten den End-Conversion-Prior pro
 * Branche conjugate.
 *
 * Modell: Y_i ~ Bernoulli(theta_branch)  mit theta ~ Beta(alpha, beta).
 * Posterior: Beta(alpha + Σ y_i, beta + n - Σ y_i).
 *
 * Das Branch-Prior-Objekt hat keinen direkten End-CR-Eintrag — die
 * End-CR ist das Produkt der Stage-Priors. Wir updaten daher einen
 * separaten "tail"-Faktor: einen Multiplikator auf den letzten beiden
 * Stufen (close × proposal), der die End-CR an die empirische Realität
 * heranzieht. Das hält die Stage-Struktur intakt und verändert nur die
 * Größe, wo wir tatsächlich Daten haben.
 *
 * Speicher-Schlüssel: 'karriaro_branch_posterior'
 */

const STORAGE_KEY = 'karriaro_branch_posterior';
const MIN_N_FOR_UPDATE = 20;
const PSEUDO_PRIOR_STRENGTH = 30;  // Stärke des impliziten Prior auf das Stage-Produkt
const SHRINKAGE_CAP = 2.0;         // Max-Multiplikator (verhindert wilde Korrekturen aus n=20)
const SHRINKAGE_FLOOR = 0.5;       // Min-Multiplikator

/**
 * Berechnet den impliziten End-CR-Prior aus dem Branch-Prior-Objekt.
 * Das Stage-Produkt der Beta-Means ist eine kompakte Punkt-Approximation
 * der End-CR (ignoriert Korrelation zwischen Stages, die hier eh nicht
 * modelliert wird).
 */
export function impliedEndCR(branchPrior) {
    const stages = ['r', 'o', 'i', 'c', 'p', 'cl'];
    return stages.reduce((acc, key) => {
        const [a, b] = branchPrior[key];
        return acc * (a / (a + b));
    }, 1);
}

function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
}
function saveStore(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/**
 * Outcomes nach Branche bucketisieren.
 * Erwartet feedback-loop-Records mit {outcome, branch?, ...}.
 * Wenn der Branch nicht gespeichert ist, fällt es auf '_default' zurück.
 */
export function groupOutcomesByBranch(entries) {
    const groups = {};
    for (const e of entries) {
        if (e.outcome !== 'kunde' && e.outcome !== 'verloren') continue;
        const branch = e.branch || '_default';
        if (!groups[branch]) groups[branch] = { wins: 0, total: 0 };
        groups[branch].total++;
        if (e.outcome === 'kunde') groups[branch].wins++;
    }
    return groups;
}

/**
 * Conjugate Beta-Update auf den End-CR-Prior einer Branche.
 *
 * Der End-CR-Prior wird als Beta(α0, β0) parametrisiert, mit α0 + β0 =
 * PSEUDO_PRIOR_STRENGTH und α0/(α0+β0) = impliedEndCR(branchPrior).
 * Posterior: Beta(α0 + wins, β0 + losses).
 *
 * Liefert den Multiplikator: posteriorMean / priorMean, geclippt auf
 * [SHRINKAGE_FLOOR, SHRINKAGE_CAP].
 */
export function updateBranchPosterior(branchPrior, wins, losses) {
    const priorMean = impliedEndCR(branchPrior);
    const a0 = Math.max(0.5, priorMean * PSEUDO_PRIOR_STRENGTH);
    const b0 = Math.max(0.5, (1 - priorMean) * PSEUDO_PRIOR_STRENGTH);
    const alpha = a0 + wins;
    const beta  = b0 + losses;
    const posteriorMean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const rawMultiplier = priorMean > 0 ? posteriorMean / priorMean : 1;
    const multiplier = Math.max(SHRINKAGE_FLOOR, Math.min(SHRINKAGE_CAP, rawMultiplier));
    return {
        priorMean,
        posteriorMean,
        posteriorAlpha: alpha,
        posteriorBeta: beta,
        posteriorStd: Math.sqrt(variance),
        rawMultiplier,
        multiplier,
        clipped: rawMultiplier !== multiplier,
        n: wins + losses,
        wins, losses
    };
}

/**
 * Persistierter Snapshot pro Branche.
 * Für jede Branche mit n >= MIN_N_FOR_UPDATE: berechne Multiplikator und cache ihn.
 */
export function refreshAllBranches(entries, branchPriorTable) {
    const groups = groupOutcomesByBranch(entries);
    const store = {};
    for (const [branch, { wins, total }] of Object.entries(groups)) {
        if (total < MIN_N_FOR_UPDATE) continue;
        const prior = branchPriorTable[branch] || branchPriorTable._default;
        if (!prior) continue;
        const upd = updateBranchPosterior(prior, wins, total - wins);
        store[branch] = { ...upd, updatedAt: Date.now() };
    }
    saveStore(store);
    return store;
}

/**
 * Holt den persistierten Multiplikator für eine Branche, oder 1.0 wenn
 * keiner existiert. Genug Aufrufer-Code, um in den Scoring-Pfad einzu-
 * speisen, ohne die existierenden Branch-Priors zu mutieren.
 */
export function getBranchMultiplier(branch) {
    const store = loadStore();
    return store[branch]?.multiplier ?? 1.0;
}

export function getAllBranchPosteriors() {
    return loadStore();
}

export const PRIOR_UPDATE_CONSTANTS = {
    MIN_N_FOR_UPDATE,
    PSEUDO_PRIOR_STRENGTH,
    SHRINKAGE_CAP,
    SHRINKAGE_FLOOR
};
