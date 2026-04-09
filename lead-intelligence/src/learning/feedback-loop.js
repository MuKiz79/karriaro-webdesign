/**
 * #12 Feedback Loop — Trackt echte Conversions um das Modell zu personalisieren
 *
 * Speichert: Score → tatsächliches Outcome (Kunde ja/nein)
 * Berechnet: Persönliche Conversion-Rate nach Score-Bucket
 * Kalibriert: Über Zeit werden die Priors angepasst
 */

const STORAGE_KEY = 'karriaro_feedback';

/**
 * Speichert ein Outcome für einen Lead
 * @param {string} domain - Lead-Domain
 * @param {number} score - Lead-Score bei Analyse
 * @param {string} outcome - 'kunde' | 'verloren' | 'kein_kontakt'
 */
export function recordOutcome(domain, score, outcome) {
    const data = loadFeedback();
    const bucket = scoreBucket(score);

    // Vorhandenen Eintrag updaten oder neuen anlegen
    const idx = data.entries.findIndex(e => e.domain === domain);
    const entry = {
        domain,
        score,
        bucket,
        outcome,
        timestamp: Date.now()
    };

    if (idx >= 0) {
        data.entries[idx] = entry;
    } else {
        data.entries.push(entry);
    }

    // Bucket-Statistiken aktualisieren
    recalculateBuckets(data);
    saveFeedback(data);
}

/**
 * Berechnet die persönliche Conversion-Rate pro Score-Bucket
 * @returns {Object} Bucket-Statistiken und Kalibrierungsfaktoren
 */
export function getCalibration() {
    const data = loadFeedback();

    if (data.entries.length < 5) {
        return { available: false, reason: 'Mindestens 5 Outcomes nötig für Kalibrierung', entries: data.entries.length };
    }

    const buckets = {};
    for (const entry of data.entries) {
        if (entry.outcome === 'kein_kontakt') continue;
        if (!buckets[entry.bucket]) {
            buckets[entry.bucket] = { total: 0, converted: 0, scores: [] };
        }
        buckets[entry.bucket].total++;
        buckets[entry.bucket].scores.push(entry.score);
        if (entry.outcome === 'kunde') buckets[entry.bucket].converted++;
    }

    const calibration = {};
    for (const [bucket, stats] of Object.entries(buckets)) {
        const rate = stats.total > 0 ? stats.converted / stats.total : 0;
        calibration[bucket] = {
            conversionRate: Math.round(rate * 100),
            total: stats.total,
            converted: stats.converted,
            avgScore: Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
        };
    }

    // Gesamt-Conversion
    const totalOutcomes = data.entries.filter(e => e.outcome !== 'kein_kontakt');
    const totalConverted = totalOutcomes.filter(e => e.outcome === 'kunde').length;
    const overallRate = totalOutcomes.length > 0 ? totalConverted / totalOutcomes.length : 0;

    return {
        available: true,
        buckets: calibration,
        overall: {
            total: totalOutcomes.length,
            converted: totalConverted,
            rate: Math.round(overallRate * 100)
        },
        insight: overallRate > 0.1 ? `Deine persönliche CR: ${Math.round(overallRate * 100)}% — besser als Durchschnitt`
            : overallRate > 0.03 ? `Deine persönliche CR: ${Math.round(overallRate * 100)}% — im Normalbereich`
            : `Deine persönliche CR: ${Math.round(overallRate * 100)}% — fokussiere auf Leads mit Score 55+`
    };
}

/**
 * Gibt Score-basierten Hinweis basierend auf historischen Daten
 */
export function getScoreInsight(score) {
    const cal = getCalibration();
    if (!cal.available) return null;

    const bucket = scoreBucket(score);
    const bucketData = cal.buckets[bucket];
    if (!bucketData || bucketData.total < 3) return null;

    return {
        historicalRate: bucketData.conversionRate,
        sampleSize: bucketData.total,
        message: `Leads mit Score ${bucket} konvertieren bei dir zu ${bucketData.conversionRate}% (n=${bucketData.total})`
    };
}

function scoreBucket(score) {
    if (score >= 70) return '70-100';
    if (score >= 55) return '55-69';
    if (score >= 40) return '40-54';
    if (score >= 25) return '25-39';
    return '0-24';
}

function recalculateBuckets(data) {
    // Statistiken werden bei getCalibration() berechnet
    data.lastUpdated = Date.now();
}

function loadFeedback() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"entries":[],"lastUpdated":0}');
    } catch {
        return { entries: [], lastUpdated: 0 };
    }
}

function saveFeedback(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
