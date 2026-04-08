/**
 * Netzwerk-Zentralitaet / Graphentheorie (Modul W5)
 *
 * Betweenness Centrality (vereinfacht):
 * Wie zentral liegt der Lead im lokalen Wettbewerbsnetz?
 * Nutzt Haversine-Distanz fuer geografische Berechnung.
 *
 * @module analysis/graph
 */

/**
 * Haversine-Formel: Distanz zwischen zwei Koordinaten in Metern
 *
 * @param {number} lat1 - Breitengrad 1
 * @param {number} lon1 - Laengengrad 1
 * @param {number} lat2 - Breitengrad 2
 * @param {number} lon2 - Laengengrad 2
 * @returns {number} Distanz in Metern
 */
export function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;  // Erdradius in Metern
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Berechnet Netzwerk-Zentralitaet im Wettbewerbs-Graphen
 *
 * @param {Object|null} place - Google Places Daten
 * @param {Array|null} competitors - Konkurrenten mit perf, rating
 * @returns {{centrality: number, clusterCoeff: number, cohesion: number,
 *            neighbors: number, label: string}}
 */
export function calculateCentrality(place, competitors) {
    if (!place || !competitors || competitors.length < 2) {
        return { centrality: 0.5, clusterCoeff: 0, cohesion: 0, neighbors: 0, label: 'Zu wenig Konkurrenz-Daten' };
    }

    // Varianz der Performance-Scores: Niedrige Varianz = enger Markt = hohe Centrality
    const perfs = competitors.filter(c => c.perf !== null && c.perf !== undefined).map(c => c.perf);
    if (perfs.length < 2) {
        return { centrality: 0.5, clusterCoeff: 0, cohesion: 0, neighbors: competitors.length, label: 'Zu wenig Daten' };
    }

    const mean = perfs.reduce((a, b) => a + b, 0) / perfs.length;
    const variance = perfs.reduce((s, p) => s + (p - mean) ** 2, 0) / perfs.length;
    const sd = Math.sqrt(variance);
    const cohesion = 1 - Math.min(1, sd / 40);

    // Cluster-Koeffizient: Wie viele Konkurrenten haben aehnliche Ratings?
    const ratings = competitors.filter(c => c.rating).map(c => c.rating);
    let similarPairs = 0, totalPairs = 0;
    for (let i = 0; i < ratings.length; i++) {
        for (let j = i + 1; j < ratings.length; j++) {
            totalPairs++;
            if (Math.abs(ratings[i] - ratings[j]) < 0.5) similarPairs++;
        }
    }
    const clusterCoeff = totalPairs > 0 ? similarPairs / totalPairs : 0;

    // Betweenness Centrality (vereinfacht):
    const centrality = (
        Math.min(1, competitors.length / 8) * 0.40 +
        cohesion                             * 0.35 +
        clusterCoeff                         * 0.25
    );

    return {
        centrality: Math.round(centrality * 100) / 100,
        clusterCoeff: Math.round(clusterCoeff * 100) / 100,
        cohesion: Math.round(cohesion * 100) / 100,
        neighbors: competitors.length,
        label: centrality >= 0.7 ? 'Hoch-zentral — jeder sieht den Vergleich'
            : centrality >= 0.4 ? 'Mittel — moderater Wettbewerbs-Druck'
            : 'Peripher — wenig direkter Vergleich'
    };
}
