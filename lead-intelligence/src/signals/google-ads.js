/**
 * Google Ads / Display Network / Bing Ads Erkennung
 *
 * Erkennt aus Network Requests ob ein Unternehmen
 * bezahlte Online-Werbung schaltet.
 *
 * @module signals/google-ads
 */

/**
 * Erkennt Google Ads, Display Network, Conversion Tracking und Microsoft Ads
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @returns {{active: boolean, signals: string[], adSpend: boolean,
 *            insight: string, funnelImpact: number}}
 */
export function detectGoogleAds(psiData) {
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || [])
        .map(i => i.url || '').join(' ');

    const signals = [];
    if (/googleadservices\.com|googlesyndication\.com/i.test(urls)) {
        signals.push('Google Ads aktiv');
    }
    if (/doubleclick\.net/i.test(urls)) {
        signals.push('Google Display Network');
    }
    if (/google\.com\/pagead/i.test(urls)) {
        signals.push('Google Ads Conversion Tracking');
    }
    if (/bing\.com\/action|bingads/i.test(urls)) {
        signals.push('Microsoft Ads');
    }

    // Harter Beweis auch OHNE geladenes Ad-Skript: eine Conversion-ID im
    // gtag-/GTM-Aufruf. Google-Praefixe sind eindeutig — AW = Google Ads,
    // G/GT = Analytics/Tag-Manager, GTM = Container. Nur AW zaehlt als Werbung.
    const awMatch = urls.match(/\bAW-[A-Z0-9]{6,}/i);
    if (awMatch && !signals.some(s => /Google Ads/i.test(s))) {
        signals.push('Google Ads aktiv');
    }

    // ── Consent-Blindheit (wichtig fuer die Interpretation) ──────────────────
    // Lighthouse klickt keinen Cookie-Banner weg. Auf DE-Seiten liegen Ad- und
    // Remarketing-Tags nach DSGVO fast immer IM Tag-Manager und feuern erst nach
    // Einwilligung — empirisch verifiziert an check24.de und thermomix.de
    // (2026-07-25): beide laden gtm.js, aber KEIN googleadservices/doubleclick,
    // obwohl beide nachweislich Anzeigen schalten.
    // Daraus folgt: "keine Anzeigen erkannt" ist NICHT "schaltet keine Anzeigen".
    // Der Tag-Manager wird deshalb separat gemeldet — als schwaecheres Signal
    // ("verwaltet Marketing-Tags") und als Hinweis, dass die Messung blind sein
    // kann. Er wird bewusst NICHT als laufende Werbung gewertet.
    const hasTagManager = /googletagmanager\.com/i.test(urls);
    const active = signals.length > 0;
    const consentBlind = !active && hasTagManager;

    return {
        active,
        signals,
        adSpend: active,
        hasTagManager,
        consentBlind,
        insight: active
            ? 'Gibt bereits Geld für Online-Werbung aus — versteht den Wert digitaler Präsenz'
            : consentBlind
            ? 'Keine Anzeigen messbar — Tag-Manager vorhanden, Ad-Tags feuern aber erst nach Cookie-Einwilligung. Nicht als "schaltet keine Anzeigen" lesen.'
            : 'Keine bezahlte Werbung erkannt',
        funnelImpact: active ? 3 : 0
    };
}
