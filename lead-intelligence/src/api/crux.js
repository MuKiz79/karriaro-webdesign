/**
 * Chrome User Experience Report (CrUX) API
 * Echte Performance-Daten von echten Chrome-Nutzern (28-Tage-Fenster)
 * Kostenlos, braucht nur den gleichen API Key wie PageSpeed
 */
import { config } from '../config.js';

/**
 * Hole CrUX-Daten für eine Domain
 * @param {string} origin - z.B. "https://beispiel.de"
 * @returns {Object|null} { lcp, fid, cls, ttfb } in Millisekunden/Score
 */
export async function fetchCrUX(origin) {
    if (!config.psiKey) return null;
    try {
        const res = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${config.psiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, formFactor: 'PHONE' })  // Mobile-First
        });
        if (!res.ok) return null;
        const data = await res.json();
        const metrics = data.record?.metrics || {};

        return {
            lcp: extractP75(metrics.largest_contentful_paint),
            fid: extractP75(metrics.first_input_delay) || extractP75(metrics.interaction_to_next_paint),
            cls: extractP75(metrics.cumulative_layout_shift),
            ttfb: extractP75(metrics.experimental_time_to_first_byte),
            // Anteil "guter" Erfahrungen
            lcpGoodPct: extractGoodPct(metrics.largest_contentful_paint),
            clsGoodPct: extractGoodPct(metrics.cumulative_layout_shift),
            hasData: true
        };
    } catch (e) {
        return null;
    }
}

function extractP75(metric) {
    if (!metric?.percentiles?.p75) return null;
    return metric.percentiles.p75;
}

function extractGoodPct(metric) {
    if (!metric?.histogram) return null;
    // Erstes Bin = "good"
    return Math.round((metric.histogram[0]?.density || 0) * 100);
}
