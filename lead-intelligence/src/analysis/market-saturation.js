/**
 * Lokale Marktsaettigung
 *
 * Analysiert wie gesaettigt der lokale Markt ist.
 * Hoehere Saettigung = mehr Differenzierungsbedarf = Lead hoert eher zu.
 *
 * @module analysis/market-saturation
 */

/**
 * Analysiert die lokale Marktsaettigung
 *
 * @param {Array|null} competitors - Konkurrenten-Array
 * @param {Object|null} place - Google Places Daten
 * @returns {{totalCompetitors: number, withWebsite: number,
 *            saturation: number, avgRating: number,
 *            label: string, funnelImpact: number}}
 */
export function analyzeMarketSaturation(competitors, place) {
    if (!competitors) {
        return { totalCompetitors: 0, withWebsite: 0, saturation: 0.5, avgRating: 0, label: 'Keine Daten', funnelImpact: 0 };
    }

    const count = competitors.length;
    const withSite = competitors.filter(c => c.perf !== null || c.url).length;
    const saturation = Math.min(1, count / 15);  // 15+ = gesaettigter Markt
    const avgRating = competitors.length > 0
        ? competitors.reduce((s, c) => s + (c.rating || 0), 0) / competitors.length
        : 0;

    return {
        totalCompetitors: count,
        withWebsite: withSite,
        saturation: Math.round(saturation * 100) / 100,
        avgRating: Math.round(avgRating * 10) / 10,
        label: saturation > 0.7 ? 'Hoch gesaettigt — starker Differenzierungsbedarf'
            : saturation > 0.4 ? 'Moderat — Wettbewerb vorhanden'
            : 'Niedrig — wenig Konkurrenz',
        funnelImpact: saturation > 0.6 ? 2 : 0
    };
}
