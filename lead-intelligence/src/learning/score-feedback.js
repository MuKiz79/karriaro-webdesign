/**
 * Score-Feedback — KI lernt aus deinen Entscheidungen
 *
 * Workflow:
 * 1. Du siehst ein Ergebnis (z.B. Score 65 für einen Friseur)
 * 2. Du gibst Feedback: "Zu hoch" / "Passt" / "Zu niedrig"
 * 3. Das System speichert: {domain, score, signals, feedback}
 * 4. Nach 10+ Feedbacks: Berechnet Korrekturfaktoren pro Signal
 * 5. Korrekturfaktoren fließen in den Shift-Calculator ein
 *
 * Das ist ein einfacher Online-Learning-Ansatz:
 * Wenn du oft sagst "Score zu hoch" bei Leads mit Instagram aber ohne schlechte Website,
 * lernt das System: Instagram-Shift ist für dich weniger relevant.
 */

const STORAGE_KEY = 'karriaro_score_feedback';

/**
 * Speichere Feedback zu einem Ergebnis
 * @param {string} domain
 * @param {number} score - Der angezeigte Score
 * @param {string} feedback - 'too_high' | 'correct' | 'too_low'
 * @param {Object} signals - Aktive Signale die zum Score beigetragen haben
 */
export function saveFeedback(domain, score, feedback, signals = {}) {
    const data = loadData();
    data.entries.push({
        domain,
        score,
        feedback,
        signals, // z.B. { perf: 35, hasSSL: false, isBaukasten: true, reviews: 120, ... }
        ts: Date.now()
    });
    // Max 200 Einträge
    if (data.entries.length > 200) data.entries = data.entries.slice(-200);

    // Korrekturfaktoren neu berechnen
    data.corrections = calculateCorrections(data.entries);
    data.lastUpdated = Date.now();

    saveData(data);
    return data.corrections;
}

/**
 * Hole die aktuellen Korrekturfaktoren
 * @returns {Object} { shiftMultipliers, confidence, sampleSize }
 */
export function getCorrections() {
    const data = loadData();
    return {
        corrections: data.corrections || {},
        sampleSize: data.entries?.length || 0,
        isCalibrated: (data.entries?.length || 0) >= 10,
        lastUpdated: data.lastUpdated
    };
}

/**
 * Berechnet Korrekturfaktoren aus Feedback-Daten
 *
 * Methode: Für jedes Signal berechne ob Leads MIT diesem Signal
 * häufiger als "zu hoch" oder "zu niedrig" bewertet werden.
 *
 * Ergebnis: Multiplikator pro Signal (0.5 = halb so stark, 1.5 = anderthalbfach)
 */
function calculateCorrections(entries) {
    if (entries.length < 5) return {};

    // Signale die wir tracken
    const signalNames = [
        'lowPerf', 'noSSL', 'isBaukasten', 'noViewport',
        'hasInstagram', 'hasFbPixel', 'manyReviews', 'fewReviews',
        'highDesignQuality', 'lowDesignQuality',
        'bfsgRisk', 'oldWayback', 'hasCompetitors'
    ];

    const corrections = {};

    for (const signal of signalNames) {
        const withSignal = entries.filter(e => e.signals?.[signal]);
        if (withSignal.length < 3) continue; // Zu wenig Daten

        const tooHigh = withSignal.filter(e => e.feedback === 'too_high').length;
        const tooLow = withSignal.filter(e => e.feedback === 'too_low').length;
        const correct = withSignal.filter(e => e.feedback === 'correct').length;
        const total = withSignal.length;

        // Berechne Bias: Positiv = Score ist zu hoch → Signal-Gewicht reduzieren
        // Negativ = Score ist zu niedrig → Signal-Gewicht erhöhen
        const bias = (tooHigh - tooLow) / total;

        // Multiplikator: 1.0 = keine Änderung
        // bias > 0 (oft "zu hoch") → Multiplikator < 1.0 (Signal weniger wichtig)
        // bias < 0 (oft "zu niedrig") → Multiplikator > 1.0 (Signal wichtiger)
        const multiplier = Math.max(0.3, Math.min(2.0, 1.0 - bias * 0.5));

        // Nur speichern wenn signifikant abweichend
        if (Math.abs(multiplier - 1.0) > 0.1) {
            corrections[signal] = {
                multiplier: Math.round(multiplier * 100) / 100,
                sampleSize: total,
                tooHigh, tooLow, correct,
                confidence: total >= 10 ? 'hoch' : total >= 5 ? 'mittel' : 'niedrig'
            };
        }
    }

    return corrections;
}

/**
 * Extrahiere Signale aus einem Analyse-Ergebnis für das Feedback-System
 * @param {Object} data - state.lastResult
 * @returns {Object} Signal-Map
 */
export function extractSignals(data) {
    return {
        lowPerf: (data.ws?.perf || 100) < 50,
        noSSL: !data.ws?.isHttps,
        isBaukasten: !!data.tech?.isBaukasten,
        noViewport: !!data.ws?.viewportMissing,
        hasInstagram: !!data.footprint?.hasInstagram,
        hasFbPixel: !!data.footprint?.hasFbPixel,
        manyReviews: (data.place?.userRatingCount || 0) > 50,
        fewReviews: (data.place?.userRatingCount || 0) < 10,
        highDesignQuality: (data.screenshotAnalysis?.designQuality || 5) >= 7,
        lowDesignQuality: (data.screenshotAnalysis?.designQuality || 5) <= 3,
        bfsgRisk: data.bfsgScore?.risk === 'hoch' || data.bfsgScore?.risk === 'kritisch',
        oldWayback: (data.wayback?.daysSince || 0) > 365,
        hasCompetitors: (data.competitors?.length || 0) > 2,
        // Meta
        branch: data.place?.primaryType || '_default',
        score: data.result?.leadScore || 0
    };
}

/**
 * Wende Korrekturfaktoren auf Shifts an
 * @param {Object} shifts - Basis-Shifts aus calculateShifts
 * @returns {Object} Korrigierte Shifts
 */
export function applyCorrections(shifts) {
    const { corrections, isCalibrated } = getCorrections();
    if (!isCalibrated) return shifts;

    const s = { ...shifts, interest: [...shifts.interest], close: [...shifts.close] };

    // Korrekturen anwenden
    if (corrections.lowPerf) s.interest[0] = Math.round(s.interest[0] * (corrections.lowPerf.multiplier || 1));
    if (corrections.noSSL) s.interest[0] = Math.round(s.interest[0] * (corrections.noSSL.multiplier || 1));
    if (corrections.isBaukasten) s.interest[0] = Math.round(s.interest[0] * (corrections.isBaukasten.multiplier || 1));
    if (corrections.hasInstagram) s.interest[0] = Math.round(s.interest[0] * (corrections.hasInstagram.multiplier || 1));
    if (corrections.manyReviews) s.close[0] = Math.round(s.close[0] * (corrections.manyReviews.multiplier || 1));

    return s;
}

/**
 * Statistiken über das Feedback
 */
export function getFeedbackStats() {
    const data = loadData();
    const entries = data.entries || [];
    return {
        total: entries.length,
        tooHigh: entries.filter(e => e.feedback === 'too_high').length,
        correct: entries.filter(e => e.feedback === 'correct').length,
        tooLow: entries.filter(e => e.feedback === 'too_low').length,
        corrections: data.corrections || {},
        isCalibrated: entries.length >= 10,
        accuracy: entries.length > 0 ? Math.round(entries.filter(e => e.feedback === 'correct').length / entries.length * 100) : 0
    };
}

function loadData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"entries":[],"corrections":{}}'); }
    catch { return { entries: [], corrections: {} }; }
}
function saveData(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
