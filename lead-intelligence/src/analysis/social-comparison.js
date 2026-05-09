/**
 * Signal 10: Social-Media-Konkurrenz-Vergleich
 * Vergleicht den Lead mit seinen Konkurrenten bezüglich Google-Profil-Qualität
 */

/**
 * Vergleicht das Social-Profil des Leads mit Konkurrenten
 * @param {Object} place - Google Places Daten des Leads
 * @param {Array} competitors - Konkurrenten aus nearbyPlaces
 * @returns {Object} Vergleichsergebnis
 */
export function compareSocialPresence(place, competitors) {
    if (!place || !competitors || competitors.length < 2) {
        return { available: false };
    }

    // Branchen-Filter: nur Konkurrenten mit gleichem primaryType.
    // Andernfalls wird der Vergleich verfaelscht (z.B. Tankstelle/Parkhaus als
    // "Konkurrenz" eines Immobilienmaklers — die haben naturgemaess viel mehr Reviews).
    const targetType = place.primaryType || null;
    const sameBranche = targetType
        ? competitors.filter(c => c?.primaryType === targetType)
        : competitors;

    if (sameBranche.length < 2) {
        return { available: false, reason: 'Zu wenig Branchen-Konkurrenten in der Umgebung gefunden.' };
    }

    const lead = extractProfile(place);
    const compProfiles = sameBranche.map(extractProfile).filter(p => p.name);

    if (compProfiles.length === 0) return { available: false };

    // Durchschnitte der Konkurrenz
    const avgRating = avg(compProfiles.map(c => c.rating).filter(Boolean));
    const avgReviews = avg(compProfiles.map(c => c.reviews).filter(Boolean));
    const avgPhotos = avg(compProfiles.map(c => c.photos).filter(Boolean));

    // Vergleich
    const gaps = [];

    // Review-Gap
    if (lead.reviews > 0 && avgReviews > 0) {
        const reviewRatio = lead.reviews / avgReviews;
        if (reviewRatio < 0.5) {
            gaps.push({
                type: 'reviews',
                label: `${lead.reviews} Bewertungen vs. Ø ${Math.round(avgReviews)} bei Konkurrenz`,
                detail: 'Deutlich weniger Bewertungen als Mitbewerber',
                severity: 'hoch',
                pitchArg: `Ihre Konkurrenten haben im Schnitt ${Math.round(avgReviews)} Google-Bewertungen — Sie nur ${lead.reviews}. Mehr Sichtbarkeit beginnt mit einer professionellen Website.`
            });
        } else if (reviewRatio > 2) {
            gaps.push({
                type: 'reviews',
                label: `${lead.reviews} Bewertungen — ${Math.round(reviewRatio)}x mehr als Konkurrenz`,
                detail: 'Marktführer bei Bewertungen — Website sollte das widerspiegeln',
                severity: 'paradox',
                pitchArg: `Sie haben ${Math.round(reviewRatio)}x mehr Bewertungen als Ihre Konkurrenten. Ihre Kunden lieben Sie — aber Ihre Website zeigt das nicht.`
            });
        }
    }

    // Rating-Gap
    if (lead.rating && avgRating) {
        const ratingDiff = lead.rating - avgRating;
        if (ratingDiff < -0.3) {
            gaps.push({
                type: 'rating',
                label: `${lead.rating} Sterne vs. Ø ${avgRating.toFixed(1)} bei Konkurrenz`,
                detail: 'Unterdurchschnittliche Bewertung',
                severity: 'hoch'
            });
        } else if (ratingDiff > 0.3) {
            gaps.push({
                type: 'rating',
                label: `${lead.rating} Sterne — besser als Konkurrenz (Ø ${avgRating.toFixed(1)})`,
                detail: 'Überdurchschnittliche Bewertung — Website sollte das kommunizieren',
                severity: 'paradox'
            });
        }
    }

    // Foto-Gap
    if (avgPhotos > 0) {
        const photoRatio = lead.photos / Math.max(1, avgPhotos);
        if (photoRatio < 0.3 && lead.photos < 3) {
            gaps.push({
                type: 'photos',
                label: `Nur ${lead.photos} Fotos vs. Ø ${Math.round(avgPhotos)} bei Konkurrenz`,
                detail: 'Visuell unterlegen im Google-Ergebnis',
                severity: 'mittel'
            });
        }
    }

    // Website-Gap (Konkurrenten mit Website vs. ohne)
    const compWithWebsite = compProfiles.filter(c => c.hasWebsite).length;
    const websiteRate = compWithWebsite / compProfiles.length;
    if (websiteRate > 0.8 && !lead.hasWebsite) {
        gaps.push({
            type: 'website',
            label: `${Math.round(websiteRate * 100)}% der Konkurrenten haben eine Website`,
            detail: 'Der Lead fällt im Google-Ergebnis ab',
            severity: 'kritisch'
        });
    }

    // Top-Konkurrent identifizieren (Benchmark)
    const topComp = [...compProfiles].sort((a, b) => (b.reviews * b.rating) - (a.reviews * a.rating))[0];

    return {
        available: true,
        lead: lead,
        avgCompetitor: { rating: avgRating, reviews: Math.round(avgReviews), photos: Math.round(avgPhotos) },
        topCompetitor: topComp,
        gaps,
        gapCount: gaps.length,
        hasParadox: gaps.some(g => g.severity === 'paradox'),
        pitchArgs: gaps.filter(g => g.pitchArg).map(g => g.pitchArg),
        funnelImpact: {
            interest: gaps.filter(g => g.severity === 'hoch' || g.severity === 'paradox').length * 2,
            close: gaps.some(g => g.severity === 'paradox') ? 2 : 0
        }
    };
}

function extractProfile(place) {
    return {
        name: place.displayName?.text || '',
        rating: place.rating || null,
        reviews: place.userRatingCount || 0,
        photos: place.photos?.length || 0,
        hasWebsite: !!place.websiteUri
    };
}

function avg(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
