/**
 * 10. Emotional Readiness
 * Erkennt aus Review-Sentiment ob Kunden sich über die Website beschweren
 * "Konnte online keinen Termin buchen" = stärkstes Argument
 */

/**
 * @param {Object} reviewSentiment - Ergebnis von analyzeReviews Cloud Function
 * @returns {Object} { isReady, websiteComplaints, pitchArg }
 */
export function assessEmotionalReadiness(reviewSentiment) {
    if (!reviewSentiment || reviewSentiment.error) {
        return { available: false, isReady: false };
    }

    const complaints = reviewSentiment.websiteComplaints || 0;
    const issues = reviewSentiment.websiteIssues || [];
    const satisfaction = reviewSentiment.overallSatisfaction || 5;
    const sentiment = reviewSentiment.sentiment || 'neutral';

    // Wenn Kunden sich über die Website beschweren = emotionale Bereitschaft des Inhabers
    const isReady = complaints > 0;

    let pitchArg = null;
    if (complaints > 0 && issues.length > 0) {
        pitchArg = `Ihre eigenen Kunden beschweren sich in den Google-Bewertungen über die Website: "${issues[0]}". Das kostet Sie nicht nur Neukunden — es frustriert auch Stammkunden.`;
    } else if (complaints > 0) {
        pitchArg = `In ${complaints} Ihrer Google-Bewertungen gibt es Hinweise auf Website-Probleme. Wenn Kunden sich beschweren, ist es höchste Zeit.`;
    }

    // Hohe Zufriedenheit + Website-Beschwerden = perfektes Argument
    // "Ihre Kunden lieben Sie — aber Ihre Website hält nicht mit"
    const paradox = satisfaction >= 7 && complaints > 0;

    return {
        available: true,
        isReady,
        complaints,
        issues,
        satisfaction,
        sentiment,
        paradox,
        pitchArg,
        label: paradox
            ? `Kunden lieben das Geschäft (${satisfaction}/10) — aber beschweren sich über die Website. Perfektes Timing.`
            : isReady
                ? `${complaints} Website-Beschwerden in Bewertungen gefunden`
                : sentiment === 'positiv'
                    ? 'Zufriedene Kunden, keine Website-Beschwerden'
                    : 'Keine relevanten Signale',
        funnelImpact: paradox ? 5 : complaints > 0 ? 3 : 0
    };
}
