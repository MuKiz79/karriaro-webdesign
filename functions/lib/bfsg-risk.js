/**
 * BFSG-Risiko-Tier — Single-Source (Sprint 180).
 *
 * Mappt einen Compliance-Score (0-100) auf { risk, fine }. Vorher in
 * light-audit.js (bfsgHeuristic, niedrig/mittel-Grenze <85) UND audit-pipeline.js
 * (checkBFSGCompliance, <90) dupliziert — Tier-Namen + Bußgeld-Beträge identisch,
 * nur die Grenze divergent. Beträge/Tiers jetzt single-sourced; die Grenze bleibt
 * pro Pipeline via `mittelBelow` parametrisiert (Heuristik=85 bewusst milder als
 * die PSI-Vollanalyse=90, da die HTML-Heuristik gröber/ungenauer ist).
 * → Null Verhaltensänderung; die Divergenz ist jetzt explizit statt versteckt.
 */
function bfsgRiskTier(score, opts) {
    const mittelBelow = (opts && typeof opts.mittelBelow === 'number') ? opts.mittelBelow : 90;
    if (score < 50) return { risk: 'kritisch', fine: '100.000 €' };
    if (score < 70) return { risk: 'hoch', fine: '50.000 €' };
    if (score < mittelBelow) return { risk: 'mittel', fine: '10.000 €' };
    return { risk: 'niedrig', fine: 'kein Risiko erkennbar' };
}

module.exports = { bfsgRiskTier };
