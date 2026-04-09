/**
 * #1 Signal Stacking — Exponentieller Boost bei gestackten Signalen
 *
 * Forschung: 2-3 gestackte Signale konvertieren 5-10× besser als einzelne.
 * Ein Account mit "SSL fehlt" + "Baukasten" + "263 Reviews" + "Wayback 3J"
 * ist EXPONENTIELL besser als die lineare Summe.
 *
 * Methodik: Identifiziere Signal-Cluster und berechne Multiplikatoren.
 */

// Signal-Kategorien die sich gegenseitig verstärken
const SIGNAL_CLUSTERS = {
    // "Visuell veraltet + technisch schlecht + erfolgreiches Geschäft" = Jackpot
    paradox: {
        name: 'Paradox-Lead',
        signals: ['bad_design', 'bad_perf', 'good_business', 'has_social'],
        multiplier: 2.5,
        minSignals: 3,
        pitchArg: 'Ihr Geschäft boomt, aber Ihre Website hält nicht mit. Das kostet Sie messbar Kunden.'
    },
    // "Rechtlich angreifbar + kein Bewusstsein"
    compliance: {
        name: 'Compliance-Risiko',
        signals: ['no_ssl', 'bad_a11y', 'no_privacy', 'bfsg_risk'],
        multiplier: 2.0,
        minSignals: 2,
        pitchArg: 'Ihre Website hat rechtliche Risiken: SSL fehlt, Barrierefreiheit nicht erfüllt. Seit 2025 drohen Bußgelder.'
    },
    // "Digital aktiv + schlechte Website" = versteht den Wert
    digitalParadox: {
        name: 'Digital-Paradox',
        signals: ['has_instagram', 'has_fb_pixel', 'has_analytics', 'bad_website'],
        multiplier: 1.8,
        minSignals: 2,
        pitchArg: 'Sie investieren in Online-Marketing — aber Ihre Website ist das schwächste Glied.'
    },
    // "Zeitdruck" = muss JETZT handeln
    urgency: {
        name: 'Dringlichkeit',
        signals: ['wayback_old', 'bfsg_risk', 'outdated_tech', 'declining_reviews'],
        multiplier: 1.6,
        minSignals: 2,
        pitchArg: 'Mehrere Faktoren zeigen: Der Zeitpunkt für eine neue Website ist jetzt — nicht in 6 Monaten.'
    },
    // "Wachstum" = hat Budget und investiert
    growth: {
        name: 'Wachstums-Signal',
        signals: ['many_reviews', 'hiring', 'has_ads', 'surge_intent'],
        multiplier: 1.5,
        minSignals: 2,
        pitchArg: 'Ihr Unternehmen wächst — Ihre Website sollte mitwachsen.'
    }
};

/**
 * Analysiert welche Signal-Cluster aktiv sind und berechnet den Stack-Multiplikator
 *
 * @param {Object} params - Alle verfügbaren Signale
 * @returns {Object} Stack-Analyse mit Multiplikator und aktiven Clustern
 */
export function analyzeSignalStack(params) {
    const {
        ws, tech, place, footprint, revenue, wayback,
        screenshotAnalysis, socialSignals, surgeIntent,
        emotionalReady, conversationReady, bfsgScore
    } = params;

    // Erkenne aktive Signale
    const activeSignals = new Set();

    // Website-Qualität
    const dq = screenshotAnalysis?.designQuality || 5;
    if (dq <= 4) activeSignals.add('bad_design');
    if (ws?.perf < 50) activeSignals.add('bad_perf');
    if (ws?.perf < 50 || dq <= 4) activeSignals.add('bad_website');
    if (!ws?.isHttps) activeSignals.add('no_ssl');
    if (ws?.a11y < 60) activeSignals.add('bad_a11y');
    if (bfsgScore?.risk === 'hoch' || bfsgScore?.risk === 'kritisch') activeSignals.add('bfsg_risk');

    // Business-Signale
    const reviews = place?.userRatingCount || 0;
    if (reviews > 50 && place?.rating >= 4.0) activeSignals.add('good_business');
    if (reviews > 100) activeSignals.add('many_reviews');

    // Digital-Signale
    if (footprint?.hasInstagram) activeSignals.add('has_instagram');
    if (footprint?.hasFbPixel) activeSignals.add('has_fb_pixel');
    if (footprint?.hasAnalytics) activeSignals.add('has_analytics');
    if (footprint?.hasFbPixel || footprint?.hasAnalytics) activeSignals.add('has_ads');
    if (footprint?.platformCount >= 2) activeSignals.add('has_social');

    // Zeitliche Signale
    if (wayback?.daysSince > 730) activeSignals.add('wayback_old');
    if (tech?.version && parseInt(tech.version) < 6) activeSignals.add('outdated_tech');
    if (tech?.isBaukasten) activeSignals.add('outdated_tech');
    if (socialSignals?.reviewTrend?.direction === 'fallend') activeSignals.add('declining_reviews');
    if (surgeIntent?.hasSurge) activeSignals.add('surge_intent');

    // Prüfe welche Cluster aktiv sind
    const activeClusters = [];
    for (const [key, cluster] of Object.entries(SIGNAL_CLUSTERS)) {
        const matchedSignals = cluster.signals.filter(s => activeSignals.has(s));
        if (matchedSignals.length >= cluster.minSignals) {
            activeClusters.push({
                key,
                name: cluster.name,
                matchedSignals,
                matchCount: matchedSignals.length,
                totalSignals: cluster.signals.length,
                multiplier: cluster.multiplier,
                pitchArg: cluster.pitchArg
            });
        }
    }

    // Gesamt-Multiplikator: höchster Cluster × (1 + 0.1 pro weiteren)
    activeClusters.sort((a, b) => b.multiplier - a.multiplier);
    let stackMultiplier = 1.0;
    if (activeClusters.length > 0) {
        stackMultiplier = activeClusters[0].multiplier;
        for (let i = 1; i < activeClusters.length; i++) {
            stackMultiplier += (activeClusters[i].multiplier - 1) * 0.3; // diminishing returns
        }
    }

    // Signal-Dichte: wie viele einzigartige Signale insgesamt
    const signalDensity = activeSignals.size;
    const densityBonus = signalDensity >= 8 ? 1.3 : signalDensity >= 5 ? 1.15 : 1.0;

    return {
        activeSignals: [...activeSignals],
        signalCount: activeSignals.size,
        activeClusters,
        clusterCount: activeClusters.length,
        stackMultiplier: Math.round(stackMultiplier * densityBonus * 100) / 100,
        topCluster: activeClusters[0] || null,
        pitchArgs: activeClusters.map(c => c.pitchArg),
        label: activeClusters.length >= 3 ? 'Massive Signal-Häufung — Top-Lead'
            : activeClusters.length >= 2 ? 'Starke Signal-Kombination'
            : activeClusters.length === 1 ? `Signal-Cluster: ${activeClusters[0].name}`
            : 'Einzelne Signale — kein Stack-Effekt'
    };
}
