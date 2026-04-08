/**
 * 3. Surge Intent Detection
 * Erkennt plötzliche Veränderungen die Wachstum und Investitionsbereitschaft signalisieren
 */

export function detectSurgeIntent(footprint, jobSignal, googleAds, place) {
    const signals = [];
    let surgeScore = 0;

    // Facebook Pixel = aktives Werbebudget
    if (footprint?.hasFbPixel) {
        signals.push({ type: 'ad_spend', label: 'Facebook-Werbung aktiv', detail: 'Investiert bereits in Online-Marketing', strength: 3 });
        surgeScore += 3;
    }

    // Google Ads
    if (googleAds?.active) {
        signals.push({ type: 'ad_spend', label: 'Google Ads aktiv', detail: 'Schaltet bezahlte Suchanzeigen', strength: 3 });
        surgeScore += 3;
    }

    // Stellt ein = wächst
    if (jobSignal?.isHiring) {
        signals.push({ type: 'growth', label: 'Stellt Mitarbeiter ein', detail: 'Wachsendes Unternehmen — hat Budget', strength: 4 });
        surgeScore += 4;
    }

    // Viele Plattformen = Marketing-Push
    if (footprint?.platformCount >= 3) {
        signals.push({ type: 'marketing', label: `${footprint.platformCount} Social-Media-Kanäle aktiv`, detail: 'Investiert breit in Sichtbarkeit', strength: 2 });
        surgeScore += 2;
    }

    // Viele neue Bewertungen = wachsendes Geschäft
    if (place?.userRatingCount > 100) {
        signals.push({ type: 'growth', label: `${place.userRatingCount} Google-Bewertungen`, detail: 'Etabliertes, aktives Geschäft', strength: 2 });
        surgeScore += 2;
    }

    // Analytics = misst schon
    if (footprint?.hasAnalytics) {
        signals.push({ type: 'data_driven', label: 'Google Analytics aktiv', detail: 'Misst Website-Traffic — datengetriebene Entscheidungen', strength: 1 });
        surgeScore += 1;
    }

    return {
        signals,
        surgeScore,
        hasSurge: surgeScore >= 5,
        label: surgeScore >= 8 ? 'Starker Surge — Unternehmen investiert aktiv' :
               surgeScore >= 5 ? 'Moderater Surge — wachsend und investierend' :
               surgeScore >= 2 ? 'Schwache Signale' : 'Keine Surge-Signale',
        pitchArg: surgeScore >= 5 ? 'Sie investieren bereits in Online-Marketing und Wachstum — Ihre Website ist dabei das schwächste Glied.' : null,
        funnelImpact: Math.min(5, surgeScore)
    };
}
