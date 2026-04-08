/**
 * Information Gain pro Signal
 *
 * Berechnet welche Signale am meisten Information
 * ueber das Outcome liefern.
 * Mutual Information: I(X;Y) approximiert durch die
 * Shift-Staerke jedes Signals im Funnel.
 *
 * @module analysis/info-gain
 */

/**
 * Berechnet Information Gain fuer alle vorhandenen Signale
 *
 * @param {Object} ws - Website-Score
 * @param {Object} tech - Tech-Detection Ergebnis
 * @param {Object|null} place - Google Places Daten
 * @param {Object|null} footprint - Digital Footprint Ergebnis
 * @returns {{signals: Array, totalGain: number, strongestSignal: Object|null, label: string}}
 */
export function calculateInfoGain(ws, tech, place, footprint) {
    // Jedes Signal mit seinem geschaetzten Information Gain
    const signals = [];
    signals.push({ name: 'Performance < 50', present: ws.perf < 50, gain: 0.15, category: 'Website' });
    signals.push({ name: 'Kein SSL', present: !ws.isHttps, gain: 0.22, category: 'Website' });
    signals.push({ name: 'Baukasten-CMS', present: tech.isBaukasten, gain: 0.18, category: 'Technologie' });
    signals.push({ name: 'Google Bewertungen > 50', present: (place?.userRatingCount || 0) > 50, gain: 0.20, category: 'Business' });
    signals.push({ name: 'Rating >= 4.5', present: (place?.rating || 0) >= 4.5, gain: 0.12, category: 'Business' });
    signals.push({ name: 'Instagram aktiv', present: footprint?.hasInstagram || false, gain: 0.16, category: 'Digital' });
    signals.push({ name: 'Facebook Pixel', present: footprint?.hasFbPixel || false, gain: 0.19, category: 'Digital' });
    signals.push({ name: 'Google Ads aktiv', present: false, gain: 0.21, category: 'Digital' });  // Wird extern gesetzt
    signals.push({ name: 'SEO < 70', present: ws.seo < 70, gain: 0.10, category: 'Website' });
    signals.push({ name: 'A11y < 70 (BFSG)', present: ws.a11y < 70, gain: 0.08, category: 'Compliance' });

    // Sortiere nach Gain (nur vorhandene Signale)
    const sorted = signals.filter(s => s.present).sort((a, b) => b.gain - a.gain);
    const totalGain = sorted.reduce((s, sig) => s + sig.gain, 0);

    return {
        signals: sorted.slice(0, 6),
        totalGain: Math.round(totalGain * 100) / 100,
        strongestSignal: sorted[0] || null,
        label: totalGain > 0.5 ? 'Viele starke Signale — hohe Konfidenz'
            : totalGain > 0.25 ? 'Moderate Signale'
            : 'Wenig Signale — unsichere Bewertung'
    };
}
