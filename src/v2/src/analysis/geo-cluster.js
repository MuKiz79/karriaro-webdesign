/**
 * Geographische Cluster-Analyse (Haversine-Distanz)
 *
 * Berechnet Distanzen zwischen Lead und Konkurrenten,
 * erkennt Cluster und berechnet R0-Boost.
 *
 * @module analysis/geo-cluster
 */

import { haversine } from './graph.js';

/**
 * Analysiert geographische Cluster-Bildung
 *
 * @param {Object|null} place - Google Places Daten (mit location.latitude/longitude)
 * @param {Array|null} competitors - Konkurrenten (mit lat/lng)
 * @returns {{distances: Array, nearby500m: number, nearby1km: number,
 *            avgDistance: number, isCluster: boolean, r0Boost: number, label: string}}
 */
export function analyzeGeoCluster(place, competitors) {
    if (!place?.location || !competitors) {
        return { distances: [], avgDistance: 0, nearby500m: 0, nearby1km: 0, isCluster: false, r0Boost: 1.0, label: 'Keine Geodaten' };
    }

    const lat = place.location.latitude;
    const lng = place.location.longitude;

    const distances = competitors
        .filter(c => c.lat && c.lng)
        .map(c => ({
            name: c.name,
            distance: Math.round(haversine(lat, lng, c.lat, c.lng))
        }));

    const nearby500m = distances.filter(d => d.distance < 500).length;
    const nearby1km = distances.filter(d => d.distance < 1000).length;
    const avgDist = distances.length > 0
        ? Math.round(distances.reduce((s, d) => s + d.distance, 0) / distances.length)
        : 0;

    return {
        distances: distances.sort((a, b) => a.distance - b.distance).slice(0, 5),
        nearby500m,
        nearby1km,
        avgDistance: avgDist,
        isCluster: nearby500m >= 3,
        r0Boost: nearby500m >= 3 ? 1.5 : nearby1km >= 3 ? 1.2 : 1.0,
        label: nearby500m >= 3 ? `Dichtes Cluster (${nearby500m} innerhalb 500m)`
            : nearby1km >= 3 ? `Cluster (${nearby1km} innerhalb 1km)`
            : 'Kein Cluster'
    };
}
