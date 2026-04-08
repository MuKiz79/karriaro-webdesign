/**
 * 4. Digital Body Language Score
 * Wie digital reif ist das Unternehmen? Basierend auf erkennbaren Signalen.
 */

export function assessDigitalMaturity(footprint, googleAds, psiData) {
    const signals = [];
    let score = 0;
    const maxScore = 30;

    // Cookie-Banner = DSGVO-bewusst
    if (footprint?.pixels?.some(p => p.key === 'cookiebot')) {
        signals.push({ label: 'Cookie-Management', detail: 'DSGVO-konform — rechtlich verantwortungsvoll', points: 3 });
        score += 3;
    }

    // Analytics = datengetrieben
    if (footprint?.hasAnalytics) {
        signals.push({ label: 'Web-Analytics', detail: 'Misst Website-Traffic — datengetriebene Entscheidungen', points: 3 });
        score += 3;
    }

    // Facebook Pixel = Marketing-Automation
    if (footprint?.hasFbPixel) {
        signals.push({ label: 'Marketing-Pixel', detail: 'Retargeting aktiv — versteht Online-Marketing', points: 4 });
        score += 4;
    }

    // Google Ads
    if (googleAds?.active) {
        signals.push({ label: 'Bezahlte Werbung', detail: 'Investiert in Sichtbarkeit', points: 4 });
        score += 4;
    }

    // Social Media Präsenz
    const platforms = footprint?.platformCount || 0;
    if (platforms >= 3) { signals.push({ label: `${platforms} Social-Media-Kanäle`, detail: 'Breite Online-Präsenz', points: 3 }); score += 3; }
    else if (platforms >= 1) { signals.push({ label: `${platforms} Social-Media-Kanal`, detail: 'Basis-Präsenz vorhanden', points: 1 }); score += 1; }

    // Instagram = visuell bewusst
    if (footprint?.hasInstagram) { score += 2; }

    // LinkedIn = B2B-bewusst
    if (footprint?.hasLinkedIn) { score += 2; }

    // Chat-Widget = kundenorientiert
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
    if (/tidio|intercom|drift|crisp|livechat|tawk|zendesk.*chat|freshchat/i.test(urls)) {
        signals.push({ label: 'Live-Chat/Chatbot', detail: 'Kundenservice-orientiert — versteht digitale Kommunikation', points: 3 });
        score += 3;
    }

    // A/B-Testing / Optimierung
    if (/optimizely|vwo|google.*optimize|ab.*tasty/i.test(urls)) {
        signals.push({ label: 'A/B-Testing aktiv', detail: 'Optimiert Website systematisch — sehr digital reif', points: 5 });
        score += 5;
    }

    const pct = Math.round((score / maxScore) * 100);

    return {
        signals,
        score,
        maxScore,
        pct,
        label: pct >= 70 ? 'Digital reif — versteht Online-Marketing' :
               pct >= 40 ? 'Digital aktiv — Potenzial vorhanden' :
               pct >= 15 ? 'Digital minimal — braucht Aufklärung' :
               'Digital abwesend — schwerer zu überzeugen',
        // Paradox: Hohe digitale Reife + schlechte Website = BESTER Lead
        // Niedrige Reife + schlechte Website = schwer zu überzeugen
        leadImplication: pct >= 40 ? 'positiv' : 'neutral'
    };
}
