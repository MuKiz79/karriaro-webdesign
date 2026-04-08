/**
 * Job-Posting Erkennung als Wachstums-Signal
 *
 * Erkennt aus Network Requests ob Karriere/Jobs-Seiten,
 * Recruiting-Software (Indeed, Stepstone, Personio etc.) vorhanden sind.
 *
 * @module signals/job-signal
 */

/**
 * Erkennt Karriere/Recruiting-Signale aus PageSpeed-Daten
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @returns {{isHiring: boolean, signals: string[], label: string, funnelImpact: number}}
 */
export function detectJobSignals(psiData) {
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || [])
        .map(i => i.url || '').join(' ');
    const html = urls.toLowerCase();

    const signals = [];
    if (/indeed\.com|stepstone\.de|jobs\.|karriere|career|stellenangebot|bewerbung/i.test(html)) {
        signals.push('Karriere-Bereich erkannt');
    }
    if (/join\.com|personio\.de|recruitee|greenhouse/i.test(html)) {
        signals.push('Recruiting-Software aktiv');
    }

    const isHiring = signals.length > 0;

    return {
        isHiring,
        signals,
        label: isHiring ? 'Stellt ein — wachsendes Unternehmen' : 'Keine Job-Signale',
        funnelImpact: isHiring ? 2 : 0
    };
}
