/**
 * Website-Score Extraktion aus PageSpeed Categories
 *
 * Extrahiert Performance, Accessibility, SEO, Best Practices
 * sowie Core Web Vitals (FCP, LCP, CLS) und Viewport/HTTPS-Status.
 *
 * @module signals/website-score
 */

/**
 * Extrahiert Website-Scores aus PSI-Daten
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @returns {{perf:number, a11y:number, bp:number, seo:number, avg:number,
 *            fcp:string, lcp:string, cls:string, viewport:boolean,
 *            viewportMissing:boolean, isHttps:boolean}}
 */
export function extractWebsiteScore(psiData) {
    const cats = psiData?.lighthouseResult?.categories || {};
    const perf = Math.round((cats.performance?.score || 0) * 100);
    const a11y = Math.round((cats.accessibility?.score || 0) * 100);
    const bp = Math.round((cats['best-practices']?.score || 0) * 100);
    const seo = Math.round((cats.seo?.score || 0) * 100);
    const avg = Math.round((perf + a11y + bp + seo) / 4);

    const audits = psiData?.lighthouseResult?.audits || {};

    return {
        perf, a11y, bp, seo, avg,
        fcp: audits['first-contentful-paint']?.displayValue || '--',
        lcp: audits['largest-contentful-paint']?.displayValue || '--',
        cls: audits['cumulative-layout-shift']?.displayValue || '--',
        // Viewport: null/undefined = Audit nicht geladen (behandle als vorhanden)
        // 0 = explizit durchgefallen (aber kann zoom-disabled sein)
        // 1 = perfekt
        viewport: audits['viewport']?.score !== 0,
        viewportMissing: audits['viewport']?.score === 0 && !audits['viewport']?.warnings?.length,
        isHttps: (psiData?.lighthouseResult?.finalDisplayedUrl || '').startsWith('https')
    };
}

/**
 * Business-Health-Score aus Google Places Daten
 *
 * @param {Object|null} place - Google Places API Ergebnis
 * @returns {{score:number, available:boolean}}
 */
export function businessHealthScore(place) {
    if (!place) return { score: 0, available: false };
    let score = 40;
    const r = place.rating || 0;
    const c = place.userRatingCount || 0;
    if (r >= 4.5) score += 25;
    else if (r >= 4.0) score += 18;
    else if (r >= 3.0) score += 8;

    if (c > 200) score += 20;
    else if (c > 50) score += 14;
    else if (c > 15) score += 8;
    else if (c > 5) score += 3;

    if (place.photos && place.photos.length > 3) score += 8;
    if (place.regularOpeningHours) score += 7;
    return { score: Math.min(score, 100), available: true };
}

/**
 * Opportunity-Score: Wie gross ist die Luecke zwischen Business und Website?
 *
 * @param {number} websiteAvg - Durchschnitt der Website-Scores (0-100)
 * @param {number} businessHealth - Business-Health-Score (0-100)
 * @returns {number} Opportunity 0-100
 */
export function opportunityScore(websiteAvg, businessHealth) {
    const weakness = 100 - websiteAvg;
    return Math.round(weakness * (businessHealth / 100));
}
