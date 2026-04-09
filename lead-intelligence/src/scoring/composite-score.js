/**
 * #7 Composite Score — Fit × Intent × Timing
 *
 * Statt linearer Addition: Drei Dimensionen die multipliziert werden.
 * Fit = Passt der Lead zu uns? (Branche, Größe, Budget)
 * Intent = Will der Lead eine neue Website? (Signale, Schmerz)
 * Timing = Ist JETZT der richtige Zeitpunkt? (Trigger Events)
 *
 * Composite = Fit^0.3 × Intent^0.5 × Timing^0.2
 */

/**
 * Berechnet den Composite Score aus drei Dimensionen
 * @param {Object} params - Alle verfügbaren Daten
 * @returns {Object} Composite Score mit Dimensionen
 */
export function calculateCompositeScore(params) {
    const {
        ws, tech, place, footprint, revenue, result,
        screenshotAnalysis, contentAnalysis, socialSignals,
        triggerEvents, bfsgScore, signalStack, techDepth,
        contentFreshness, companyProfile
    } = params;

    // ── FIT (0-100): Passt der Lead zu Karriaro? ──
    let fit = 50; // Basis

    // Branche (lokales Unternehmen = Zielgruppe)
    if (place) fit += 15;
    if (companyProfile?.isEnterprise) fit -= 40; // Großunternehmen = kein Fit

    // Budget-Indikatoren
    const reviews = place?.userRatingCount || 0;
    if (reviews > 100) fit += 15;       // Etabliert, hat Budget
    else if (reviews > 30) fit += 10;
    else if (reviews < 5) fit -= 10;    // Vielleicht zu klein

    // Digital-Affinität (zu hoch = macht es selbst, zu niedrig = versteht es nicht)
    const maturity = footprint?.maturity || 0;
    if (maturity > 0.3 && maturity < 0.7) fit += 10; // Sweet Spot
    else if (maturity >= 0.7) fit -= 5;               // Macht es vielleicht selbst

    // Baukasten = perfekter Fit (will weg davon)
    if (tech?.isBaukasten) fit += 10;

    fit = Math.max(0, Math.min(100, fit));

    // ── INTENT (0-100): Will der Lead eine neue Website? ──
    let intent = 20; // Basis (jeder könnte eine gebrauchen)

    // Design-Qualität (schlecht = hoher Intent)
    const dq = screenshotAnalysis?.designQuality || 5;
    if (dq <= 3) intent += 25;
    else if (dq <= 5) intent += 15;
    else if (dq >= 8) intent -= 15; // Gutes Design = kein sichtbarer Bedarf

    // Performance-Probleme
    if (ws?.perf < 30) intent += 15;
    else if (ws?.perf < 50) intent += 10;
    else if (ws?.perf < 70 && dq <= 5) intent += 5;

    // Kritische Probleme (SSL, Viewport)
    if (!ws?.isHttps) intent += 20;
    if (ws?.viewportMissing) intent += 15;

    // BFSG-Risiko
    if (bfsgScore?.risk === 'kritisch') intent += 15;
    else if (bfsgScore?.risk === 'hoch') intent += 10;

    // Content-Frische
    if (contentFreshness?.freshness === 'aufgegeben') intent += 15;
    else if (contentFreshness?.freshness === 'veraltet') intent += 8;

    // Tech-Tiefe (veraltete Technologie)
    if (techDepth?.obsoleteScore >= 6) intent += 10;
    else if (techDepth?.obsoleteScore >= 3) intent += 5;

    // Signal Stack Bonus
    if (signalStack?.clusterCount >= 2) intent += 10;

    intent = Math.max(0, Math.min(100, intent));

    // ── TIMING (0-100): Ist JETZT der richtige Zeitpunkt? ──
    let timing = 30; // Basis

    if (triggerEvents?.hasSofort) timing += 30;
    else if (triggerEvents?.totalImpact >= 10) timing += 20;
    else if (triggerEvents?.totalImpact >= 5) timing += 10;

    // Saisonaler Bonus
    const month = new Date().getMonth();
    if ([2, 3, 8, 9].includes(month)) timing += 10; // Frühling/Herbst = Redesign-Saison

    // Review-Trend
    if (socialSignals?.reviewTrend?.direction === 'fallend') timing += 15;
    if (socialSignals?.reviewTrend?.direction === 'steigend') timing += 5; // Wachstum = guter Zeitpunkt

    // Wettbewerb aktiv
    if (triggerEvents?.events?.some(e => e.type === 'competition')) timing += 10;

    timing = Math.max(0, Math.min(100, timing));

    // ── COMPOSITE SCORE ──
    // Gewichtete geometrische Mittelung: Fit^0.3 × Intent^0.5 × Timing^0.2
    // Normalisiert auf 0-100
    const composite = Math.round(
        Math.pow(fit / 100, 0.3) *
        Math.pow(intent / 100, 0.5) *
        Math.pow(timing / 100, 0.2) * 100
    );

    // Welche Dimension ist der Engpass?
    const dims = [
        { name: 'Fit', value: fit },
        { name: 'Intent', value: intent },
        { name: 'Timing', value: timing }
    ];
    dims.sort((a, b) => a.value - b.value);
    const bottleneck = dims[0];

    return {
        composite,
        fit,
        intent,
        timing,
        bottleneck,
        dimensions: { fit, intent, timing },
        label: composite >= 65 ? 'Exzellenter Lead — Fit, Intent und Timing stimmen'
            : composite >= 45 ? 'Guter Lead — kontaktieren'
            : composite >= 30 ? 'Möglich — Engpass: ' + bottleneck.name
            : 'Schwacher Lead — mindestens eine Dimension fehlt',
        recommendation: bottleneck.name === 'Fit' ? 'Lead passt nicht ideal zu deinem Angebot'
            : bottleneck.name === 'Intent' ? 'Lead sieht keinen dringenden Bedarf — Schmerz herausarbeiten'
            : 'Timing ist nicht optimal — in Watchlist aufnehmen und später kontaktieren'
    };
}
