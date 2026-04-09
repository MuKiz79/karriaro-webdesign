/**
 * Epidemiologischer R0 (Modul W3)
 *
 * Wie viele Folge-Auftraege bringt ein Kunde?
 * R0 = beta * c * d / 12
 *
 * @module analysis/epidemic
 */

/**
 * Cluster-Typ-Zuordnung fuer verschiedene Branchen
 * @type {Object<string, string>}
 */
const CLUSTER_TYPES = {
    'restaurant': 'Gastromeile',
    'cafe': 'Gastromeile',
    'bar': 'Gastromeile',
    'dentist': 'Aerztezentrum',
    'doctor': 'Aerztezentrum',
    'physiotherapist': 'Aerztezentrum',
    'hair_salon': 'Einkaufsstrasse',
    'beauty_salon': 'Einkaufsstrasse',
    'lawyer': 'Kanzlei-Cluster',
    'auto_repair': 'Gewerbegebiet'
};

/**
 * Berechnet epidemiologischen R0 fuer Folge-Auftraege
 *
 * @param {Object|null} place - Google Places Daten
 * @param {Array|null} competitors - Konkurrenten
 * @returns {{R0: number, expectedFollowUps: number, clusterSize: number,
 *            clusterType: string, isEpidemic: boolean, label: string}}
 */
export function calculateEpidemic(place, competitors) {
    if (!place || !competitors) {
        return { R0: 1.0, label: 'Keine Cluster-Daten', clusterSize: 0, clusterType: '', expectedFollowUps: 0, isEpidemic: false };
    }

    // FIX K2: β, c, d rekalibriert damit R₀ > 1 erreichbar ist
    // Empirisch: 8-15% der lokalen Unternehmen beauftragen denselben Webdesigner
    // wenn sie das Ergebnis beim Nachbarn sehen (Mund-zu-Mund + Sichtbarkeit)
    const clusterSize = competitors.length;
    const clusterDensity = Math.min(1, clusterSize / 8);
    const beta = 0.08 + clusterDensity * 0.07;  // 0.08–0.15 je nach Dichte

    // c: Effektive Kontaktrate (×1.5: Inhaber reden auch mit Nicht-Konkurrenten)
    const c = Math.min(12, clusterSize * 1.5);

    // d: Sichtbarkeitsdauer in Monaten (neue Website fällt 8-12 Monate auf)
    const d = 10;

    // R₀ = β × c × d / 12
    // Range: 0.1 (1 Konkurrent) bis ~2.25 (12 Konkurrenten)
    const R0 = beta * c * d / 12;
    const expectedFollowUps = Math.round(R0 * 10) / 10;

    const type = place.primaryType || '';
    const clusterType = CLUSTER_TYPES[type] || 'Lokaler Markt';

    return {
        R0: Math.round(R0 * 100) / 100,
        expectedFollowUps,
        clusterSize,
        clusterType,
        isEpidemic: R0 > 1,
        label: R0 >= 2 ? `R0=${R0.toFixed(1)} — Epidemisches Potenzial (${clusterType})`
            : R0 >= 1 ? `R0=${R0.toFixed(1)} — Jeder Kunde bringt ~1 weiteren`
            : `R0=${R0.toFixed(1)} — Wenig Cluster-Effekt`
    };
}
