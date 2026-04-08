/**
 * Kahneman Dual Process — System 1/2 (Modul W6)
 *
 * Welches Entscheidungssystem dominiert beim Lead?
 * System 1: schnell, emotional, instinktiv
 * System 2: langsam, rational, analytisch
 *
 * @module analysis/kahneman
 */

/**
 * Branchen mit analytischen Entscheidern (System 2 dominant)
 * @type {string[]}
 */
const ANALYTICAL_BRANCHES = ['lawyer', 'real_estate_agency', 'doctor', 'hotel'];

/**
 * Berechnet System 1/2 Dominanz und empfiehlt Pitch-Strategie
 *
 * @param {Object} ws - Website-Score
 * @param {Object} tech - Tech-Detection Ergebnis
 * @param {Object|null} place - Google Places Daten
 * @param {Object|null} revenue - Revenue-Model Ergebnis
 * @param {Object|null} activation - Aktivierungsenergie-Ergebnis
 * @returns {{system1: number, system2: number, dominant: string,
 *            s1Triggers: string[], s2Triggers: string[],
 *            pitchStrategy: Object, label: string}}
 */
export function calculateKahneman(ws, tech, place, revenue, activation) {
    // System 1 Trigger (schnell, emotional, instinktiv)
    let s1 = 0;
    const s1Triggers = [];
    if (!ws.isHttps) {
        s1 += 30;
        s1Triggers.push('"Nicht sicher" Warnung — loest Angst aus');
    }
    if (!ws.viewport) {
        s1 += 20;
        s1Triggers.push('Mobile kaputt — sofort sichtbar beim Testen');
    }
    if (revenue && revenue.yearlyRevenueLoss > 8000) {
        s1 += 25;
        s1Triggers.push(`${revenue.yearlyRevenueLoss.toLocaleString('de-DE')} EUR Verlust/Jahr — Schmerz-Zahl`);
    }
    if (ws.perf < 25) {
        s1 += 15;
        s1Triggers.push('Extrem langsam — jeder spuert das');
    }
    if (tech.isBaukasten) {
        s1 += 10;
        s1Triggers.push('Baukasten-Grenzen — kennt der Inhaber selbst');
    }

    // System 2 Trigger (langsam, rational, analytisch)
    let s2 = 0;
    const s2Triggers = [];
    if (revenue && revenue.roi > 2) {
        s2 += 25;
        s2Triggers.push(`ROI ${revenue.roi}x — rationales Argument`);
    }
    if (place?.userRatingCount > 50) {
        s2 += 15;
        s2Triggers.push('Etabliertes Unternehmen — entscheidet analytisch');
    }
    if (activation && activation.Ea > 40) {
        s2 += 20;
        s2Triggers.push('Hohe Aktivierungsenergie — braucht rationale Ueberzeugung');
    }
    const type = place?.primaryType || '';
    if (ANALYTICAL_BRANCHES.includes(type)) {
        s2 += 15;
        s2Triggers.push('Branche mit analytischen Entscheidern');
    }
    if (ws.perf >= 50 && ws.seo >= 50) {
        s2 += 10;
        s2Triggers.push('Website nicht katastrophal — kein emotionaler Schock moeglich');
    }

    const total = s1 + s2 || 1;
    const s1Pct = Math.round((s1 / total) * 100);
    const s2Pct = 100 - s1Pct;
    const dominant = s1Pct >= 55 ? 'system1' : s2Pct >= 55 ? 'system2' : 'mixed';

    // Pitch-Empfehlung
    let pitchStrategy;
    if (dominant === 'system1') {
        pitchStrategy = {
            approach: 'Emotional — Schmerz zuerst, Loesung danach',
            opening: s1Triggers[0] || 'Visuelles Problem zeigen',
            format: 'Screenshot + Euro-Zahl im Betreff, kurze E-Mail',
            avoid: 'Keine langen ROI-Tabellen — der Lead entscheidet aus dem Bauch'
        };
    } else if (dominant === 'system2') {
        pitchStrategy = {
            approach: 'Rational — Daten, ROI, Vergleich',
            opening: s2Triggers[0] || 'ROI-Berechnung',
            format: 'Detaillierter Report mit Zahlen, Konkurrenz-Tabelle',
            avoid: 'Keine emotionalen Tricks — dieser Lead will Fakten'
        };
    } else {
        pitchStrategy = {
            approach: 'Hybrid — emotionaler Hook, rationale Vertiefung',
            opening: 'Screenshot als Aufhaenger, dann ROI-Argument',
            format: 'Kurzer emotionaler Einstieg, dann Daten-Anhang',
            avoid: 'Weder rein emotional noch rein rational'
        };
    }

    return {
        system1: s1Pct,
        system2: s2Pct,
        dominant,
        s1Triggers: s1Triggers.slice(0, 3),
        s2Triggers: s2Triggers.slice(0, 3),
        pitchStrategy,
        label: dominant === 'system1' ? `System 1 dominant (${s1Pct}%) — emotionaler Pitch`
            : dominant === 'system2' ? `System 2 dominant (${s2Pct}%) — rationaler Pitch`
            : `Gemischt (${s1Pct}/${s2Pct}) — Hybrid-Pitch`
    };
}
