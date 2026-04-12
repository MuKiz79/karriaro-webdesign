/**
 * #2 GBP-Dynamik — Wie "lebendig" ist das Google Business Profile?
 *
 * Google belohnt aktive Profile. Ein Profil das seit 6 Monaten
 * keine Fotos hat → Inhaber vernachlässigt Online-Präsenz → heißer Lead.
 *
 * Quelle: SearchEngineJournal 2026, KAIDM Modern Local SEO Signals
 */

/**
 * Analysiert die Dynamik des Google Business Profiles
 * @param {Object} place - Google Places API Response
 * @returns {Object} GBP-Dynamik-Analyse
 */
export function analyzeGBPDynamics(place) {
    if (!place) return { available: false };

    const signals = [];
    let dynamicScore = 0;
    const maxScore = 30;

    // ── Foto-Frische ──
    // Places API (New) gibt photos[].authorAttributions und Zeitstempel
    const photos = place.photos || [];
    const photoCount = photos.length;

    if (photoCount === 0) {
        signals.push({ type: 'photos', label: 'Keine Fotos im Profil', detail: 'Profil wirkt tot — starkes Pitch-Argument', impact: -3 });
        dynamicScore -= 3;
    } else if (photoCount < 5) {
        signals.push({ type: 'photos', label: `Nur ${photoCount} Fotos`, detail: 'Minimale visuelle Präsenz', impact: -1 });
        dynamicScore -= 1;
    } else if (photoCount >= 20) {
        signals.push({ type: 'photos', label: `${photoCount} Fotos — aktiv gepflegt`, detail: 'Inhaber investiert in Außenwirkung', impact: 3 });
        dynamicScore += 3;
    } else {
        signals.push({ type: 'photos', label: `${photoCount} Fotos`, detail: 'Grundlegende visuelle Präsenz', impact: 1 });
        dynamicScore += 1;
    }

    // ── Öffnungszeiten-Vollständigkeit ──
    if (place.regularOpeningHours?.periods?.length > 0) {
        signals.push({ type: 'hours', label: 'Öffnungszeiten gepflegt', detail: 'Profil aktiv verwaltet', impact: 2 });
        dynamicScore += 2;
    } else if (place.regularOpeningHours) {
        signals.push({ type: 'hours', label: 'Öffnungszeiten vorhanden', impact: 1 });
        dynamicScore += 1;
    } else {
        signals.push({ type: 'hours', label: 'Keine Öffnungszeiten', detail: 'Grundlegende Info fehlt', impact: -2 });
        dynamicScore -= 2;
    }

    // ── Website verlinkt ──
    if (place.websiteUri) {
        dynamicScore += 1;
    } else {
        signals.push({ type: 'website', label: 'Keine Website im Profil', detail: 'Braucht definitiv eine Website', impact: -3 });
        dynamicScore -= 3;
    }

    // ── Beschreibung / Editorial Summary ──
    if (place.editorialSummary?.text || place.generativeSummary) {
        signals.push({ type: 'description', label: 'Beschreibung vorhanden', impact: 1 });
        dynamicScore += 1;
    } else {
        signals.push({ type: 'description', label: 'Keine Beschreibung', detail: 'Inhaber hat das Profil nicht optimiert', impact: -1 });
        dynamicScore -= 1;
    }

    // ── Review-Engagement (antwortet der Inhaber?) ──
    const reviews = place.reviews || [];
    const repliedCount = reviews.filter(r => r.ownerResponse || r.reply).length;
    if (reviews.length >= 5 && repliedCount === 0) {
        signals.push({ type: 'engagement', label: 'Antwortet nie auf Bewertungen', detail: 'Kein Online-Engagement — vernachlässigt Kundenkommunikation', impact: -2 });
        dynamicScore -= 2;
    } else if (reviews.length >= 5 && repliedCount / reviews.length >= 0.5) {
        signals.push({ type: 'engagement', label: 'Antwortet aktiv auf Bewertungen', detail: 'Digital engagiert', impact: 3 });
        dynamicScore += 3;
    }

    // ── Telefon + Adresse ──
    if (place.internationalPhoneNumber) dynamicScore += 1;
    if (place.formattedAddress) dynamicScore += 1;

    // Gesamt-Bewertung
    const pct = Math.max(0, Math.round(((dynamicScore + 10) / (maxScore + 10)) * 100)); // Normalisiert auf 0-100

    // Paradox-Erkennung: Aktives GBP + schlechte Website = BESTER Lead
    const isActiveButNeglectedWeb = dynamicScore >= 5 && place.websiteUri;

    return {
        available: true,
        signals,
        dynamicScore,
        pct,
        isActiveButNeglectedWeb,
        label: pct >= 70 ? 'Sehr aktives Profil — Inhaber ist digital engagiert'
            : pct >= 40 ? 'Mäßig aktives Profil'
            : 'Vernachlässigtes Profil — Inhaber kümmert sich nicht',
        pitchArg: pct < 30
            ? 'Ihr Google-Profil wird kaum gepflegt — keine Beschreibung, kaum Fotos, keine Antworten auf Bewertungen. Das kostet Sie Sichtbarkeit.'
            : isActiveButNeglectedWeb
                ? 'Ihr Google-Profil ist aktiv gepflegt — aber Ihre Website hält nicht mit. Diese Diskrepanz sehen Ihre Kunden.'
                : null,
        funnelImpact: {
            interest: pct < 30 ? 2 : isActiveButNeglectedWeb ? 3 : 0,
            close: dynamicScore >= 5 ? 2 : 0 // Aktiver Inhaber = eher bereit zu investieren
        }
    };
}
