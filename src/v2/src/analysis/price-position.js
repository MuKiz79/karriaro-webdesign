/**
 * Preis-Positionierung aus Google Places
 *
 * Nutzt priceLevel aus der Google Places API
 * um die Preisklasse zu bestimmen.
 * Premium + schlechte Website = maximale Diskrepanz.
 *
 * @module analysis/price-position
 */

/**
 * Labels fuer die verschiedenen Preis-Level
 * @type {Object<number, string>}
 */
const PRICE_LABELS = {
    0: 'Kostenlos',
    1: 'Guenstig',
    2: 'Mittelklasse',
    3: 'Gehoben',
    4: 'Premium'
};

/**
 * Analysiert die Preis-Positionierung
 *
 * @param {Object|null} place - Google Places Daten (mit priceLevel)
 * @returns {{level: number|null, label: string, isPremium: boolean, funnelImpact: number}}
 */
export function analyzePricePosition(place) {
    if (!place) {
        return { level: null, label: 'Unbekannt', isPremium: false, funnelImpact: 0 };
    }

    const level = place.priceLevel || null;

    return {
        level,
        label: PRICE_LABELS[level] || 'Unbekannt',
        isPremium: level >= 3,
        funnelImpact: level >= 3 ? 4 : level === 2 ? 2 : 0
    };
}
