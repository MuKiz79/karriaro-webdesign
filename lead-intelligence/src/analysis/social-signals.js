/**
 * Social Signals — Erweiterte Signale aus Google Places + Social Media
 *
 * Signal 1: Review-Recency (letzte Bewertung vor X Tagen)
 * Signal 2: Owner-Reply-Rate (Inhaber antwortet auf Reviews)
 * Signal 3: Foto-Anzahl im GBP
 * Signal 4: GBP-Vollständigkeit
 * Signal 9: Review-Sentiment-Trend (besser/schlechter über Zeit)
 */

/**
 * Analysiert Google Places Daten für Social Signals
 * @param {Object} place - Google Places API (New) Response
 * @returns {Object} Social Signal Scores
 */
export function analyzeSocialSignals(place) {
    if (!place) return { available: false, signals: [], score: 0 };

    const signals = [];
    let score = 0;
    const maxScore = 50;

    // ── Signal 1: Review-Recency ──
    const reviews = place.reviews || [];
    let reviewRecency = null;
    if (reviews.length > 0) {
        // Places API (New) returns publishTime as ISO string
        const dates = reviews
            .map(r => r.publishTime ? new Date(r.publishTime) : null)
            .filter(Boolean)
            .sort((a, b) => b - a);

        if (dates.length > 0) {
            const newestReview = dates[0];
            const daysSince = Math.round((Date.now() - newestReview.getTime()) / (1000 * 60 * 60 * 24));
            reviewRecency = { daysSince, date: newestReview.toISOString().slice(0, 10) };

            if (daysSince < 14) {
                signals.push({ type: 'review_recency', label: 'Bewertung in letzten 2 Wochen', detail: `Letzte Bewertung vor ${daysSince} Tagen — sehr aktives Geschäft`, strength: 5 });
                score += 5;
            } else if (daysSince < 30) {
                signals.push({ type: 'review_recency', label: 'Bewertung im letzten Monat', detail: `Letzte Bewertung vor ${daysSince} Tagen`, strength: 4 });
                score += 4;
            } else if (daysSince < 90) {
                signals.push({ type: 'review_recency', label: 'Bewertung in letzten 3 Monaten', detail: `Letzte Bewertung vor ${daysSince} Tagen`, strength: 2 });
                score += 2;
            } else if (daysSince > 180) {
                signals.push({ type: 'review_recency', label: 'Seit 6+ Monaten keine Bewertung', detail: `Letzte Bewertung vor ${daysSince} Tagen — möglicherweise inaktiv`, strength: -2 });
                score -= 2;
            }
        }
    }

    // ── Signal 2: Owner-Reply-Rate ──
    // ── Signal 2: Owner-Reply-Rate + Qualität ──
    let ownerReplyRate = null;
    if (reviews.length > 0) {
        const replies = reviews.filter(r => r.ownerResponse || r.reply);
        const withReply = replies.length;
        const rate = withReply / reviews.length;

        // Antwort-Qualität: Durchschnittliche Länge der Antworten
        const replyTexts = replies.map(r => (r.ownerResponse || r.reply || '').toString());
        const avgReplyLength = replyTexts.length > 0
            ? Math.round(replyTexts.reduce((s, t) => s + t.length, 0) / replyTexts.length)
            : 0;
        const isPersonalized = avgReplyLength > 50; // > 50 Zeichen = nicht nur "Danke"

        ownerReplyRate = {
            replied: withReply, total: reviews.length, rate: Math.round(rate * 100),
            avgReplyLength, isPersonalized
        };

        if (rate >= 0.8 && isPersonalized) {
            signals.push({ type: 'owner_replies', label: `Inhaber antwortet personalisiert auf ${ownerReplyRate.rate}% der Bewertungen`, detail: `Ø ${avgReplyLength} Zeichen pro Antwort — sehr engagierter Inhaber`, strength: 6 });
            score += 6;
        } else if (rate >= 0.8) {
            signals.push({ type: 'owner_replies', label: `Inhaber antwortet auf ${ownerReplyRate.rate}% der Bewertungen`, detail: 'Sehr engagierter Inhaber — versteht digitale Kommunikation', strength: 5 });
            score += 5;
        } else if (rate >= 0.5) {
            signals.push({ type: 'owner_replies', label: `Inhaber antwortet auf ${ownerReplyRate.rate}% der Bewertungen`, detail: 'Aktiver Inhaber — reagiert auf Kundenfeedback', strength: 3 });
            score += 3;
        } else if (rate >= 0.2) {
            signals.push({ type: 'owner_replies', label: `Nur ${ownerReplyRate.rate}% der Bewertungen beantwortet`, detail: 'Gelegentlich aktiv', strength: 1 });
            score += 1;
        } else if (reviews.length >= 10) {
            signals.push({ type: 'owner_replies', label: 'Inhaber antwortet nie auf Bewertungen', detail: 'Kein digitales Engagement — schwerer zu überzeugen', strength: -1 });
            score -= 1;
        }
    }

    // ── Signal 3: Foto-Anzahl im GBP ──
    const photoCount = place.photos?.length || 0;
    let photoSignal = null;
    if (photoCount >= 10) {
        photoSignal = { count: photoCount, label: 'Umfangreiche Fotogalerie' };
        signals.push({ type: 'photos', label: `${photoCount} Fotos im Google-Profil`, detail: 'Investiert in visuelle Darstellung — versteht Außenwirkung', strength: 3 });
        score += 3;
    } else if (photoCount >= 3) {
        photoSignal = { count: photoCount, label: 'Basis-Fotos vorhanden' };
        signals.push({ type: 'photos', label: `${photoCount} Fotos im Google-Profil`, detail: 'Grundlegende visuelle Präsenz', strength: 1 });
        score += 1;
    } else {
        photoSignal = { count: photoCount, label: 'Kaum/keine Fotos' };
        signals.push({ type: 'photos', label: 'Kaum Fotos im Google-Profil', detail: 'Visuelle Vernachlässigung — Pitch-Argument', strength: -1 });
        score -= 1;
    }

    // ── Signal 4: GBP-Vollständigkeit ──
    const gbpFields = {
        websiteUri: !!place.websiteUri,
        regularOpeningHours: !!place.regularOpeningHours,
        formattedPhoneNumber: !!(place.internationalPhoneNumber || place.nationalPhoneNumber),
        formattedAddress: !!place.formattedAddress,
        primaryType: !!place.primaryType,
        displayName: !!place.displayName,
        photos: photoCount > 0,
        reviews: reviews.length > 0,
        description: !!(place.editorialSummary?.text || place.generativeSummary)
    };
    const completedFields = Object.values(gbpFields).filter(Boolean).length;
    const totalFields = Object.keys(gbpFields).length;
    const completeness = Math.round(completedFields / totalFields * 100);
    const missingFields = Object.entries(gbpFields).filter(([, v]) => !v).map(([k]) => k);

    if (completeness >= 90) {
        signals.push({ type: 'gbp_complete', label: `Google-Profil ${completeness}% vollständig`, detail: 'Profil wird aktiv gepflegt', strength: 3 });
        score += 3;
    } else if (completeness >= 60) {
        signals.push({ type: 'gbp_complete', label: `Google-Profil nur ${completeness}% vollständig`, detail: `Fehlt: ${missingFields.join(', ')}`, strength: 1 });
        score += 1;
    } else {
        signals.push({ type: 'gbp_complete', label: `Google-Profil nur ${completeness}% vollständig`, detail: 'Stark vernachlässigt — digitales Bewusstsein fehlt', strength: -2 });
        score -= 2;
    }

    // ── Signal 9: Review-Trend (letzte 5 vs. älteste 5 Bewertungen) ──
    let reviewTrend = null;
    if (reviews.length >= 4) {
        const sorted = [...reviews]
            .filter(r => r.rating != null)
            .sort((a, b) => new Date(b.publishTime || 0) - new Date(a.publishTime || 0));

        const half = Math.floor(sorted.length / 2);
        const recentAvg = sorted.slice(0, half).reduce((s, r) => s + r.rating, 0) / half;
        const olderAvg = sorted.slice(half).reduce((s, r) => s + r.rating, 0) / (sorted.length - half);
        const trend = recentAvg - olderAvg;

        reviewTrend = {
            recentAvg: Math.round(recentAvg * 10) / 10,
            olderAvg: Math.round(olderAvg * 10) / 10,
            delta: Math.round(trend * 10) / 10,
            direction: trend > 0.3 ? 'steigend' : trend < -0.3 ? 'fallend' : 'stabil'
        };

        if (trend < -0.5) {
            signals.push({ type: 'review_trend', label: `Bewertungen werden schlechter (${reviewTrend.olderAvg} → ${reviewTrend.recentAvg})`, detail: 'Fallender Trend — dringender Handlungsbedarf, starkes Pitch-Argument', strength: 4 });
            score += 4;
        } else if (trend > 0.3) {
            signals.push({ type: 'review_trend', label: `Bewertungen werden besser (${reviewTrend.olderAvg} → ${reviewTrend.recentAvg})`, detail: 'Steigender Trend — Geschäft wächst, guter Zeitpunkt', strength: 2 });
            score += 2;
        }
    }

    // ── Gesamt-Score ──
    const pct = Math.max(0, Math.round((score / maxScore) * 100));

    // ── Pitch-Argumente generieren ──
    const pitchArgs = [];
    if (ownerReplyRate && ownerReplyRate.rate >= 50) {
        pitchArgs.push(`Sie antworten auf ${ownerReplyRate.rate}% Ihrer Google-Bewertungen — Sie verstehen digitale Kundenkommunikation. Ihre Website sollte das gleiche Niveau haben.`);
    }
    if (reviewTrend?.direction === 'fallend') {
        pitchArgs.push(`Ihre Google-Bewertungen zeigen einen Abwärtstrend (${reviewTrend.olderAvg} → ${reviewTrend.recentAvg} Sterne). Eine moderne Website kann helfen, den Eindruck zu verbessern.`);
    }
    if (photoCount >= 10 && score > 5) {
        pitchArgs.push(`${photoCount} Fotos in Ihrem Google-Profil zeigen: Sie investieren in Ihre Außenwirkung. Ihre Website hinkt dem hinterher.`);
    }
    if (reviewRecency && reviewRecency.daysSince > 180) {
        pitchArgs.push(`Seit ${Math.round(reviewRecency.daysSince / 30)} Monaten keine neue Google-Bewertung — ein Zeichen dass die Online-Sichtbarkeit sinkt.`);
    }

    return {
        available: true,
        signals,
        score,
        pct,
        reviewRecency,
        ownerReplyRate,
        photoSignal,
        gbpCompleteness: { completeness, missingFields, fields: gbpFields },
        reviewTrend,
        pitchArgs,
        label: pct >= 60 ? 'Social-Signale stark — digital engagierter Inhaber'
            : pct >= 30 ? 'Social-Signale moderat — Potenzial vorhanden'
            : 'Social-Signale schwach — wenig digitales Engagement',
        // Funnel-Impact für shift-calculator
        funnelImpact: {
            interest: score >= 10 ? 3 : score >= 5 ? 2 : score >= 0 ? 1 : 0,
            convo: ownerReplyRate?.rate >= 50 ? 2 : 0,
            close: (reviewTrend?.direction === 'fallend' || reviewRecency?.daysSince > 180) ? 2 : 0
        }
    };
}
