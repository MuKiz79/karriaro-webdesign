/**
 * Arrhenius Aktivierungsenergie (Modul W2)
 *
 * k = A * e^(-Ea/RT)
 * Wie viel Energie braucht es den Lead zu aktivieren?
 * Hoehere Ea = schwerer zu ueberzeugen.
 *
 * @module analysis/activation
 */

/**
 * Berechnet Aktivierungsenergie und Reaktionsgeschwindigkeit
 *
 * @param {Object} ws - Website-Score
 * @param {Object} tech - Tech-Detection Ergebnis
 * @param {Object|null} place - Google Places Daten
 * @param {Array|null} competitors - Konkurrenten
 * @param {Object|null} revenue - Revenue-Model Ergebnis
 * @returns {{Ea: number, EaWithCatalyst: number, T: number,
 *            k: number, kCatalyzed: number, speedup: number,
 *            catalysts: Array, bestCatalyst: Object|null, label: string}}
 */
export function calculateActivation(ws, tech, place, competitors, revenue) {
    // Ea: Aktivierungsenergie (psychologische Huerden)
    let Ea = 50;

    // Faktoren die Ea ERHOEHEN (Widerstand)
    if (ws.perf >= 70) Ea += 15;
    if (ws.isHttps && ws.viewport) Ea += 10;
    if (!place) Ea += 20;
    const count = place?.userRatingCount || 0;
    if (count < 5) Ea += 10;

    // Faktoren die Ea SENKEN (Dringlichkeit/Schmerz)
    if (!ws.isHttps) Ea -= 25;
    if (!ws.viewport) Ea -= 20;
    if (ws.perf < 30) Ea -= 15;
    if (tech.isBaukasten) Ea -= 10;
    if (revenue && revenue.yearlyRevenueLoss > 10000) Ea -= 15;

    // T: Temperatur (Markt-Druck, externe Faktoren)
    let T = 300;
    if (competitors && competitors.filter(c => c.perf > 60).length > 2) T += 50;
    if (ws.a11y < 50) T += 30;  // BFSG-Deadline
    const month = new Date().getMonth();
    if ([2, 3, 4, 8, 9].includes(month)) T += 20;  // Fruehling/Herbst = Redesign-Saison

    // Katalysatoren: Senken Ea ohne Temperatur zu erhoehen
    const catalysts = [];
    catalysts.push({ name: 'Kostenloser Entwurf', reduction: 15 });
    if (competitors && competitors.length > 0) {
        catalysts.push({ name: 'Konkurrenz-Vergleich zeigen', reduction: 10 });
    }
    if (revenue && revenue.yearlyRevenueLoss > 5000) {
        catalysts.push({
            name: `Umsatzverlust ${revenue.yearlyRevenueLoss.toLocaleString('de-DE')} EUR nennen`,
            reduction: 12
        });
    }
    if (!ws.isHttps) {
        catalysts.push({ name: '"Nicht sicher"-Screenshot senden', reduction: 8 });
    }

    const bestCatalyst = catalysts.sort((a, b) => b.reduction - a.reduction)[0];
    const EaWithCatalyst = Math.max(5, Ea - (bestCatalyst?.reduction || 0));

    // Arrhenius: Reaktionsgeschwindigkeit
    const R = 8.314;
    const A = 1000;
    const k = A * Math.exp(-Ea / (R * T / 100));
    const kCatalyzed = A * Math.exp(-EaWithCatalyst / (R * T / 100));

    return {
        Ea: Math.round(Math.max(5, Ea)),
        EaWithCatalyst: Math.round(EaWithCatalyst),
        T: Math.round(T),
        k: Math.round(k * 100) / 100,
        kCatalyzed: Math.round(kCatalyzed * 100) / 100,
        speedup: kCatalyzed > 0 && k > 0 ? Math.round((kCatalyzed / k) * 10) / 10 : 1,
        catalysts,
        bestCatalyst,
        label: Ea <= 25 ? 'Niedrig — braucht nur einen Anstoss'
            : Ea <= 45 ? 'Mittel — Katalysator empfohlen'
            : 'Hoch — schwer zu aktivieren'
    };
}
