/**
 * Statistik-Panel: rendert Calibration / Drift / Inflation als CRM-Sektion.
 *
 * Konsumiert die learning/-Module ohne sie zu mutieren — reines Read-View.
 * Einziger seitliche Effekt: refreshAllBranches() schreibt den Posterior-
 * Cache, damit der Branch-Multiplikator beim nächsten Lead-Scoring ge-
 * nutzt werden kann.
 */

import { calibrationSnapshot } from '../learning/calibration.js';
import { driftAllBranches } from '../learning/drift-monitor.js';
import { inflationSnapshot, inflationVsCalibration } from '../learning/score-distribution.js';
import { refreshAllBranches, getAllBranchPosteriors } from '../learning/prior-update.js';
import { BRANCH_PRIORS } from '../priors/branch-priors.js';
import { getRatingStats, getAllRatings } from '../learning/lead-ratings.js';
import { trainRatingModel } from '../learning/rating-model.js';
import { escapeHtml as esc } from '../lib/escape-html.js';

const STORAGE_KEY = 'karriaro_feedback';

function loadEntries() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"entries":[]}').entries; }
    catch { return []; }
}

function bar(value, max, color) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return `<div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function formatPct(v) {
    return v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`;
}

function renderCalibration(snap) {
    if (!snap.available) {
        return `<div class="card stat-card"><h3 class="section-title">Calibration</h3>
            <p class="metric-desc">${snap.reason}</p></div>`;
    }
    const cil = snap.calibrationInTheLarge;
    const verdictColor = (snap.brierSkillScore || 0) > 0.05 ? 'var(--green)'
        : (snap.brierSkillScore || 0) > 0 ? 'var(--orange)' : 'var(--red)';

    let diagramHtml = '<table class="stat-table"><thead><tr><th>Bucket</th><th>n</th><th>Empirisch</th><th>Vorhergesagt</th><th>Wilson-CI</th><th>Verdict</th></tr></thead><tbody>';
    for (const b of snap.diagram) {
        if (b.n === 0) continue;
        diagramHtml += `<tr>
            <td>${b.bucket}</td>
            <td>${b.n}</td>
            <td><strong>${b.empiricalCRPct?.toFixed(1)}%</strong></td>
            <td>${b.meanPredictedPct?.toFixed(1)}%</td>
            <td>${b.ciPct.lower}–${b.ciPct.upper}%</td>
            <td class="stat-verdict">${b.verdict}</td>
        </tr>`;
    }
    diagramHtml += '</tbody></table>';

    return `<div class="card stat-card">
        <h3 class="section-title">Calibration · n=${snap.n}</h3>
        <div class="stat-grid">
            <div class="stat-cell">
                <div class="stat-label">Brier Score</div>
                <div class="stat-value">${snap.brier.toFixed(4)}</div>
                <div class="stat-hint">niedriger = besser (Baseline ${snap.baseline.brier.toFixed(4)})</div>
            </div>
            <div class="stat-cell">
                <div class="stat-label">Log-Loss</div>
                <div class="stat-value">${snap.logLoss.toFixed(4)}</div>
                <div class="stat-hint">${snap.baseline.logLoss ? `Baseline ${snap.baseline.logLoss.toFixed(4)}` : ''}</div>
            </div>
            <div class="stat-cell">
                <div class="stat-label">ECE</div>
                <div class="stat-value">${(snap.ece * 100).toFixed(2)}%</div>
                <div class="stat-hint">Expected Calibration Error</div>
            </div>
            <div class="stat-cell">
                <div class="stat-label">Brier Skill</div>
                <div class="stat-value" style="color:${verdictColor}">${(snap.brierSkillScore * 100).toFixed(1)}%</div>
                <div class="stat-hint">vs. Konstante p̄ raten</div>
            </div>
        </div>
        <p class="stat-verdict-line" style="color:${verdictColor}">${snap.verdict}</p>
        <p class="metric-desc">Calibration-in-the-Large: ${cil.verdict} (Bias ${cil.biasPct.toFixed(1)}pp)</p>
        <h4 class="stat-subtitle">Reliability Diagram</h4>
        ${diagramHtml}
    </div>`;
}

function renderDrift(driftResult, posteriors) {
    const flagged = driftResult.flagged || [];
    if (driftResult.results.length === 0) {
        return `<div class="card stat-card"><h3 class="section-title">Branchen-Drift</h3>
            <p class="metric-desc">Keine Branche hat genug Outcomes (≥15) im 90-Tage-Fenster.</p></div>`;
    }
    let rowsHtml = '<table class="stat-table"><thead><tr><th>Branche</th><th>n</th><th>Empirisch</th><th>Prior</th><th>Wilson-CI</th><th>Multipl.</th><th>Verdict</th></tr></thead><tbody>';
    for (const r of driftResult.results) {
        if (!r.available) continue;
        const post = posteriors[r.branch];
        const mult = post ? post.multiplier.toFixed(2) : '—';
        const flagColor = r.priorOutsideCI ? 'var(--red)' : 'var(--muted)';
        rowsHtml += `<tr>
            <td>${r.branch}</td>
            <td>${r.n}</td>
            <td>${r.empiricalPct.toFixed(1)}%</td>
            <td>${r.priorMeanPct.toFixed(2)}%</td>
            <td>${r.ciPct.lower.toFixed(1)}–${r.ciPct.upper.toFixed(1)}%</td>
            <td>${mult}</td>
            <td style="color:${flagColor}">${r.verdict}</td>
        </tr>`;
    }
    rowsHtml += '</tbody></table>';
    return `<div class="card stat-card">
        <h3 class="section-title">Branchen-Drift · ${driftResult.windowDays}-Tage-Fenster</h3>
        ${flagged.length > 0
            ? `<p class="stat-flag" style="color:var(--red)">⚠ ${flagged.length} Branche(n) driften außerhalb der CI</p>`
            : `<p class="stat-flag" style="color:var(--green)">✓ Alle Branchen-Priors konsistent</p>`}
        ${rowsHtml}
    </div>`;
}

function renderInflation(snap, verdict) {
    if (!snap.available) {
        return `<div class="card stat-card"><h3 class="section-title">Score-Inflation</h3>
            <p class="metric-desc">${snap.reason}</p></div>`;
    }
    const u = snap.mannWhitney;
    const shiftColor = snap.medianShift > 3 ? 'var(--orange)' : snap.medianShift < -3 ? 'var(--accent)' : 'var(--green)';
    return `<div class="card stat-card">
        <h3 class="section-title">Score-Inflation · ${snap.windowDays}-Tage-Vergleich</h3>
        <div class="stat-grid">
            <div class="stat-cell">
                <div class="stat-label">Aktuell (n=${snap.current.n})</div>
                <div class="stat-value">${snap.current.median.toFixed(1)}</div>
                <div class="stat-hint">P10 ${snap.current.p10} · P90 ${snap.current.p90}</div>
            </div>
            <div class="stat-cell">
                <div class="stat-label">Vorperiode (n=${snap.previous.n})</div>
                <div class="stat-value">${snap.previous.median.toFixed(1)}</div>
                <div class="stat-hint">P10 ${snap.previous.p10} · P90 ${snap.previous.p90}</div>
            </div>
            <div class="stat-cell">
                <div class="stat-label">Δ Median</div>
                <div class="stat-value" style="color:${shiftColor}">${snap.medianShift > 0 ? '+' : ''}${snap.medianShift.toFixed(1)}</div>
                <div class="stat-hint">Mann-Whitney p=${u.p}</div>
            </div>
        </div>
        <p class="stat-verdict-line">${snap.verdict}</p>
        ${verdict?.calibrationKnown ? `<p class="metric-desc">Querverweis: ${verdict.verdict}</p>` : ''}
    </div>`;
}

/**
 * Hauptfunktion: rendert ein vollständiges Statistik-Panel als HTML-String.
 * Wird vom CRM-Renderer als Sektion eingefügt.
 */
/**
 * Was hat das System aus den Daumen gelernt — und was beweist das NICHT.
 *
 * ⚠️ Zwei Kanäle, die nie vermischt werden dürfen:
 *   • URTEIL (Daumen) lernt, wen der Founder anrufen WÜRDE. Das spart seine
 *     Zeit, ist aber kein Beleg über den Markt — im schlimmsten Fall lernt das
 *     Modell nur, seinen eigenen Bias schneller zu bestätigen.
 *   • ERGEBNIS (geantwortet/gewonnen) ist die einzige echte Wahrheit.
 * Erst die Kreuzung beider Zahlen zeigt, ob das Urteil trägt.
 */
function renderRatingModel() {
    const st = getRatingStats();
    if (!st.total) {
        return `<div class="stat-block">
            <div class="section-label">Ihr Urteil</div>
            <p class="metric-desc">Noch keine Bewertung. Die Daumen in der Lead-Liste sind die Grundlage — ab 40 Bewertungen (mindestens 8 je Seite) prüft das System, ob es die Rangfolge besser ordnen kann als die eingebaute Heuristik.</p>
        </div>`;
    }
    const t = trainRatingModel();
    const outcomes = loadEntries();
    const ratings = getAllRatings();

    // Die entscheidende Kreuzung: von den Daumen-hoch — wie viele haben reagiert?
    const upDomains = new Set(Object.values(ratings).filter(r => r.rating === 'up').map(r => r.domain));
    const upMitOutcome = outcomes.filter(e => upDomains.has(e.domain));
    const upGewonnen = upMitOutcome.filter(e => e.outcome === 'kunde').length;

    const gew = t.gewichte.slice(0, 8).map(g =>
        `<div class="feature-row"><span>${esc(g.merkmal)}</span><span style="color:${g.gewicht >= 0 ? 'var(--green)' : 'var(--red)'}">${g.gewicht >= 0 ? '+' : ''}${g.gewicht.toFixed(2)}</span></div>`
    ).join('');

    return `<div class="stat-block">
        <div class="section-label">Ihr Urteil — was das System daraus gelernt hat</div>
        <p class="metric-desc">
            ${st.up}× „würde ich anrufen" · ${st.down}× „nicht" · ${st.skip}× „weiß ich nicht"
            (${st.trainierbar} verwertbar — Enthaltungen zählen bewusst nicht mit).
        </p>
        <p class="metric-desc"><strong>${esc(t.hinweis)}</strong></p>
        ${t.gewichte.length ? `<div class="section-label" style="margin-top:12px">Gelernte Gewichte (Auszug)</div>${gew}
        <p class="metric-desc">Positiv = spricht dafür, dass Sie anrufen würden. Lesen Sie das gegen Ihr Bauchgefühl — steht dort Unsinn, ist die Datenlage noch zu dünn.</p>` : ''}
        <div class="section-label" style="margin-top:16px">Trägt Ihr Urteil? (die eigentliche Frage)</div>
        <p class="metric-desc">
            ${upMitOutcome.length === 0
                ? 'Noch kein Ergebnis zu einem der bewerteten Betriebe. Erst wenn Mails raus sind und Antworten erfasst werden, lässt sich sagen, ob Ihr Urteil den Markt trifft — bis dahin lernt das System nur, Ihnen schneller zuzustimmen.'
                : `Von ${upDomains.size} mit Daumen hoch haben ${upMitOutcome.length} ein erfasstes Ergebnis, davon ${upGewonnen} gewonnen.`}
        </p>
    </div>`;
}

export function renderStatisticsPanel() {
    const entries = loadEntries();
    refreshAllBranches(entries, BRANCH_PRIORS);
    const posteriors = getAllBranchPosteriors();
    const cal = calibrationSnapshot(entries);
    const drift = driftAllBranches(entries, BRANCH_PRIORS);
    const infl = inflationSnapshot();
    const verdict = inflationVsCalibration(infl, cal);
    return `
        <div class="stat-section">
            <h2 class="section-title">Wissenschaft & Selbst-Validierung</h2>
            <p class="metric-desc">Empirische Auswertung aller bisherigen Outcomes — Brier / ECE / Drift / Inflation.</p>
            ${renderRatingModel()}
            ${renderCalibration(cal)}
            ${renderDrift(drift, posteriors)}
            ${renderInflation(infl, verdict)}
        </div>
    `;
}
