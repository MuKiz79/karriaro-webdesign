/**
 * 9. Local SEO Opportunity Score
 * Wie gut nutzt das Unternehmen lokale Suchmaschinenoptimierung?
 */

export function assessLocalSEO(ws, place, psiData) {
    const checks = [];
    let score = 0;
    const max = 20;

    // Google My Business Vollständigkeit
    if (place) {
        if (place.rating) { checks.push({ label: 'Google-Bewertungen', found: true }); score += 3; }
        if (place.userRatingCount > 10) { checks.push({ label: '10+ Bewertungen', found: true }); score += 2; }
        if (place.regularOpeningHours) { checks.push({ label: 'Öffnungszeiten gepflegt', found: true }); score += 2; }
        if (place.photos?.length > 3) { checks.push({ label: 'Fotos hochgeladen', found: true }); score += 2; }
        if (place.formattedAddress) { checks.push({ label: 'Adresse hinterlegt', found: true }); score += 1; }
        if (place.websiteUri) { checks.push({ label: 'Website verlinkt', found: true }); score += 1; }
    }

    // Schema.org auf der Website
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
    const hasSchema = /schema\.org|application\/ld\+json/i.test(urls);
    checks.push({ label: 'Schema.org Strukturdaten', found: hasSchema });
    if (hasSchema) score += 3;

    // SEO-Score
    if (ws.seo >= 80) { checks.push({ label: 'SEO-Score ≥ 80', found: true }); score += 3; }
    else { checks.push({ label: `SEO-Score ${ws.seo} (< 80)`, found: false }); }

    // Maps-Integration
    const hasMaps = /maps\.google|google\.com\/maps/i.test(urls);
    checks.push({ label: 'Google Maps eingebunden', found: hasMaps });
    if (hasMaps) score += 2;

    const pct = Math.round((score / max) * 100);

    // Paradox: Wer seinen GMB-Eintrag pflegt aber eine schlechte Website hat = bester Lead
    const gmbWellMaintained = place?.userRatingCount > 20 && place?.rating >= 4.0 && place?.photos?.length > 3;
    const websiteBad = ws.perf < 60 || ws.seo < 70;
    const isParadoxLead = gmbWellMaintained && websiteBad;

    return {
        checks,
        score, max, pct,
        isParadoxLead,
        label: isParadoxLead
            ? 'Google-Profil top, Website schlecht — perfekter Lead! Investiert in Sichtbarkeit, Website ist der blinde Fleck.'
            : pct >= 70 ? 'Gute lokale SEO — wenig Ansatzpunkte'
            : pct >= 40 ? 'Lücken in lokaler SEO — Verbesserungspotenzial'
            : 'Schwache lokale SEO — großer Handlungsbedarf',
        pitchArg: isParadoxLead
            ? `Ihr Google-Profil ist top gepflegt — ${place.rating} Sterne, ${place.userRatingCount} Bewertungen, Fotos, Öffnungszeiten. Aber wenn jemand auf Ihre Website klickt, passt der Eindruck nicht zusammen. Das Google-Profil macht Lust, die Website enttäuscht.`
            : null
    };
}
