/**
 * #1 Review-Velocity — Neue Reviews pro Monat
 *
 * Nicht nur Gesamtzahl, sondern WACHSTUM:
 * - 5-8 neue Reviews/Monat = aktives, wachsendes Geschäft mit Budget
 * - 0/Monat seit 3+ Monaten = stagnierend oder sterbend
 * - Plötzlicher Anstieg = Marketing-Push → investiert gerade
 *
 * Quelle: IMPIOUS 2026 Study (11.500 Listings), Local Falcon
 */

/**
 * Berechnet Review-Velocity aus Google Places Reviews
 * @param {Array} reviews - Google Places reviews Array
 * @param {number} totalCount - place.userRatingCount (kann > reviews.length sein)
 * @returns {Object} Velocity-Analyse
 */
export function calculateReviewVelocity(reviews, totalCount = 0) {
    if (!reviews || reviews.length < 2) {
        return { available: false, velocity: 0, label: 'Nicht genug Daten' };
    }

    // Reviews nach Datum sortieren (neueste zuerst)
    const dated = reviews
        .filter(r => r.publishTime)
        .map(r => ({ ...r, date: new Date(r.publishTime) }))
        .sort((a, b) => b.date - a.date);

    if (dated.length < 2) return { available: false, velocity: 0, label: 'Keine Datumsdaten' };

    const now = new Date();
    const newest = dated[0].date;
    const oldest = dated[dated.length - 1].date;

    // Zeitspanne der verfügbaren Reviews
    const spanDays = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));
    const spanMonths = spanDays / 30;

    // Velocity = Reviews in der Zeitspanne / Monate
    const velocity = Math.round(dated.length / spanMonths * 10) / 10;

    // Letzte 30 Tage vs. davor
    const last30 = dated.filter(r => (now - r.date) < 30 * 24 * 60 * 60 * 1000).length;
    const prev30 = dated.filter(r => {
        const age = now - r.date;
        return age >= 30 * 24 * 60 * 60 * 1000 && age < 60 * 24 * 60 * 60 * 1000;
    }).length;

    // Tage seit letzter Review
    const daysSinceLastReview = Math.round((now - newest) / (1000 * 60 * 60 * 24));

    // Trend
    let trend = 'stabil';
    if (last30 > prev30 * 1.5 && last30 >= 3) trend = 'beschleunigend';
    else if (last30 === 0 && daysSinceLastReview > 60) trend = 'stagnierend';
    else if (prev30 > last30 * 2) trend = 'verlangsamt';

    // Geschäfts-Signal
    let signal, strength;
    if (velocity >= 8) {
        signal = 'Stark wachsendes Geschäft — hohes Budget wahrscheinlich';
        strength = 5;
    } else if (velocity >= 4) {
        signal = 'Aktives Geschäft — investiert in Kundenzufriedenheit';
        strength = 3;
    } else if (velocity >= 1) {
        signal = 'Moderates Geschäft — stabil aber nicht wachsend';
        strength = 1;
    } else {
        signal = 'Kaum neue Bewertungen — möglicherweise stagnierend';
        strength = -1;
    }

    // Pitch-Relevanz
    let pitchArg = null;
    if (trend === 'beschleunigend') {
        pitchArg = `Ihr Geschäft wächst — ${last30} neue Bewertungen im letzten Monat. Der perfekte Zeitpunkt für eine Website die dieses Wachstum widerspiegelt.`;
    } else if (trend === 'stagnierend') {
        pitchArg = `Seit ${daysSinceLastReview} Tagen keine neue Google-Bewertung. Eine moderne Website kann helfen, die Online-Sichtbarkeit wiederzubeleben.`;
    }

    return {
        available: true,
        velocity,
        last30,
        prev30,
        trend,
        daysSinceLastReview,
        signal,
        strength,
        pitchArg,
        label: `${velocity} Reviews/Monat · Trend: ${trend}`,
        funnelImpact: {
            interest: trend === 'stagnierend' ? 2 : 0,
            close: velocity >= 5 ? 2 : velocity >= 2 ? 1 : 0
        }
    };
}
