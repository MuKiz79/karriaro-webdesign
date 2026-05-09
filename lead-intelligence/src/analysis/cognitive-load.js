/**
 * #9 Cognitive Load — Wie überfordert die Website den Besucher?
 *
 * Zu viele Menüpunkte, zu viele Farben, kein klarer CTA = Besucher verlässt die Seite.
 * Messbar aus Lighthouse-Daten: DOM-Größe, Request-Anzahl, CSS-Komplexität.
 *
 * Quelle: Psychology Today, HBR 2018 "How Customers Decide"
 */

/**
 * Analysiert die kognitive Last einer Website
 * @param {Object} psiData - PageSpeed Insights Response
 * @returns {Object} Cognitive Load Assessment
 */
export function assessCognitiveLoad(psiData) {
    const audits = psiData?.lighthouseResult?.audits || {};
    let loadScore = 0; // 0 = minimal, 100 = maximal überfordernd

    // ── DOM-Größe (zu viele Elemente = überladene Seite) ──
    // null-safe: PSI liefert manchmal kein numericValue (z.B. fehlgeschlagenes Audit).
    // In dem Fall bleibt domSize=null statt 0, damit der Report nicht "0 DOM-Elemente"
    // als Tatsache rendert.
    const rawDom = audits['dom-size']?.numericValue;
    const domSize = (typeof rawDom === 'number' && rawDom > 0) ? rawDom : null;
    if (domSize !== null) {
        if (domSize > 3000) loadScore += 20;
        else if (domSize > 1500) loadScore += 10;
        else if (domSize > 800) loadScore += 5;
    }

    // ── Anzahl Requests (zu viele = langsam + chaotisch) ──
    const requests = audits['network-requests']?.details?.items?.length || 0;
    if (requests > 100) loadScore += 20;
    else if (requests > 60) loadScore += 10;
    else if (requests > 30) loadScore += 5;

    // ── Render-Blocking Resources (Seite zeigt lange nichts) ──
    const blockingResources = audits['render-blocking-resources']?.details?.items?.length || 0;
    if (blockingResources > 5) loadScore += 15;
    else if (blockingResources > 2) loadScore += 8;

    // ── Unused CSS/JS (Bloat) ──
    const unusedJs = audits['unused-javascript']?.details?.items?.length || 0;
    const unusedCss = audits['unused-css-rules']?.details?.items?.length || 0;
    const bloat = unusedJs + unusedCss;
    if (bloat > 10) loadScore += 15;
    else if (bloat > 5) loadScore += 8;

    // ── Layout Shift (visuelles Chaos) ──
    const cls = audits['cumulative-layout-shift']?.numericValue || 0;
    if (cls > 0.25) loadScore += 15;
    else if (cls > 0.1) loadScore += 5;

    // ── Third-Party Scripts (tracken, laden, verlangsamen) ──
    const thirdParty = audits['third-party-summary']?.details?.items?.length || 0;
    if (thirdParty > 10) loadScore += 10;
    else if (thirdParty > 5) loadScore += 5;

    loadScore = Math.min(100, loadScore);

    const level = loadScore >= 60 ? 'überladen' : loadScore >= 35 ? 'hoch' : loadScore >= 15 ? 'moderat' : 'niedrig';

    return {
        loadScore,
        level,
        domSize,
        requests,
        blockingResources,
        bloat,
        thirdParty,
        label: `Cognitive Load: ${level} (${loadScore}/100)`,
        pitchArg: loadScore >= 50
            ? `Ihre Website hat ${requests} Requests${domSize !== null ? `, ${domSize} DOM-Elemente` : ''} und ${bloat} ungenutzte Dateien. Das überfordert Besucher und verlangsamt alles. Eine schlanke, handcodierte Website löst das sofort.`
            : null,
        funnelImpact: loadScore >= 50 ? 2 : 0
    };
}
