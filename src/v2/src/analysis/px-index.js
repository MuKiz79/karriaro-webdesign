/**
 * #9 Performance Experience Index (PX Index)
 * Geht über technische Compliance hinaus — misst wie die Seite sich ANFÜHLT.
 * Kombiniert Speed, Interaktivität, visuelles Layout, Content-Qualität.
 *
 * Neu in 2026: Multi-dimensionale Bewertung statt einzelner PageSpeed-Zahl.
 */

/**
 * Berechnet den PX Index
 * @param {Object} ws - Website-Score
 * @param {Object} psiData - PageSpeed Insights Response
 * @param {Object} contentAnalysis - KI Content-Analyse (optional)
 * @param {Object} screenshotAnalysis - KI Design-Analyse (optional)
 * @returns {Object} PX Index Ergebnis
 */
export function calculatePXIndex(ws, psiData, contentAnalysis = null, screenshotAnalysis = null) {
    const audits = psiData?.lighthouseResult?.audits || {};

    // ── Dimension 1: Speed (30%) ──
    const lcp = parseFloat(audits['largest-contentful-paint']?.numericValue || 0) / 1000;
    const fcp = parseFloat(audits['first-contentful-paint']?.numericValue || 0) / 1000;
    const speedScore = lcp <= 2.5 ? 100 : lcp <= 4 ? 70 : lcp <= 6 ? 40 : 20;

    // ── Dimension 2: Interaktivität (25%) ──
    const inp = parseFloat(audits['interaction-to-next-paint']?.numericValue || audits['total-blocking-time']?.numericValue || 0);
    const tbt = parseFloat(audits['total-blocking-time']?.numericValue || 0);
    const interactScore = tbt <= 200 ? 100 : tbt <= 600 ? 70 : tbt <= 1000 ? 40 : 20;

    // ── Dimension 3: Visuelles Layout (25%) ──
    const cls = parseFloat(audits['cumulative-layout-shift']?.numericValue || 0);
    const layoutScore = cls <= 0.1 ? 100 : cls <= 0.25 ? 60 : 30;
    const designScore = screenshotAnalysis?.designQuality ? screenshotAnalysis.designQuality * 10 : 50;
    const visualScore = Math.round(layoutScore * 0.5 + designScore * 0.5);

    // ── Dimension 4: Content-Qualität (20%) ──
    let contentScore = 50; // Default
    if (contentAnalysis && !contentAnalysis.error) {
        contentScore = 0;
        if (contentAnalysis.hasCTA) contentScore += 25;
        if (contentAnalysis.hasUSP) contentScore += 25;
        if (contentAnalysis.freshness === 'aktuell' || contentAnalysis.copyrightYear >= new Date().getFullYear() - 1) contentScore += 25;
        if (contentAnalysis.tonality === 'professionell' || contentAnalysis.tonality === 'modern') contentScore += 25;
    }

    // ── Gesamt PX Index ──
    const pxIndex = Math.round(
        speedScore * 0.30 +
        interactScore * 0.25 +
        visualScore * 0.25 +
        contentScore * 0.20
    );

    // ── Vergleich mit reinem PageSpeed ──
    const psDiff = pxIndex - ws.perf;
    let insight = '';
    if (psDiff > 15) {
        insight = 'Besser als PageSpeed vermuten lässt — Design und Content kompensieren Speed-Probleme';
    } else if (psDiff < -15) {
        insight = 'Schlechter als PageSpeed zeigt — Design oder Content ziehen die Erfahrung runter';
    } else {
        insight = 'PX Index und PageSpeed stimmen überein';
    }

    return {
        pxIndex,
        dimensions: {
            speed: { score: speedScore, lcp, fcp },
            interactivity: { score: interactScore, tbt, inp },
            visual: { score: visualScore, cls, designQuality: screenshotAnalysis?.designQuality || null },
            content: { score: contentScore }
        },
        psDiff,
        insight,
        label: pxIndex >= 75 ? 'Gute Nutzererfahrung' : pxIndex >= 50 ? 'Mittelmäßige Erfahrung' : pxIndex >= 30 ? 'Schlechte Erfahrung' : 'Kritisch schlechte Erfahrung'
    };
}
