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

    // Beta: Uebertragungswahrscheinlichkeit (wie sichtbar ist das Ergebnis?)
    const beta = 0.15;

    // c: Kontaktrate (wie viele aehnliche Geschaefte im Umkreis?)
    const clusterSize = competitors.length;
    const c = Math.min(10, clusterSize);

    // d: Dauer der Sichtbarkeit (Monate in denen die neue Website auffaellt)
    const d = 6;

    // R0 = beta * c * d / 12 (normalisiert auf Jahresbasis)
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
