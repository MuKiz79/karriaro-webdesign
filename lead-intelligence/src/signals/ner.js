/**
 * Named Entity Recognition (vereinfacht)
 *
 * Extrahiert aus PageSpeed-Daten und Google Places
 * Hinweise auf Kontaktpersonen, E-Mail, Firma und Adresse.
 *
 * @module signals/ner
 */

/**
 * Extrahiert benannte Entitaeten aus PSI-Daten und Place-Informationen
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @param {Object|null} place - Google Places API Ergebnis
 * @returns {{company?: string, address?: string, email?: string}}
 */
export function extractEntities(psiData, place) {
    const entities = {};

    // Name aus Google Places
    if (place?.displayName?.text) entities.company = place.displayName.text;

    // Adresse aus Google Places
    if (place?.formattedAddress) entities.address = place.formattedAddress;

    // E-Mail-Muster aus URLs (z.B. mailto: Links)
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || [])
        .map(i => i.url || '');
    for (const u of urls) {
        const mailto = u.match(/mailto:([^?"&]+)/i);
        if (mailto) {
            entities.email = decodeURIComponent(mailto[1]);
            break;
        }
    }

    return entities;
}
