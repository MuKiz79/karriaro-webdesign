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

    const active = signals.length > 0;

    return {
        active,
        signals,
        adSpend: active,
        insight: active
            ? 'Gibt bereits Geld fuer Online-Werbung aus — versteht den Wert digitaler Praesenz'
            : 'Keine bezahlte Werbung erkannt',
        funnelImpact: active ? 3 : 0
    };
}
