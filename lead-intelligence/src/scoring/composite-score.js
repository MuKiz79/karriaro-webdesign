/**
 * #7 Aufmerksamkeits-Index — Fit × Intent × Hebel × Timing
 *
 * WICHTIG: Das Ergebnis ist KEINE Conversion-Wahrscheinlichkeit.
 * Die Inputs sind hand-vergebene Punkte auf einer 0..100-Skala — keine
 * Likelihoods. Die multiplikative Aggregation als gewichtetes geometrisches
 * Mittel (Exponenten summieren auf 1) dient nur dazu, den Score zu killen,
 * sobald eine Dimension nahe Null ist ("Engpass-Logik"). Es ist ein
 * Aufmerksamkeits-Index für die Priorisierung, kein statistischer Schätzer.
 *
 * ─── Umbau 2026-07-25: Intent bedeutet jetzt KAUFBEREITSCHAFT ──────────────
 * Vorher bestand "Intent" zu 100 % aus Problem-Belegen (Design schlecht, Perf
 * schlecht, kein SSL, BFSG, Content alt, Tech alt). Das misst, ob die Seite
 * SCHLECHT ist — nicht, ob der Inhaber KAUFEN will. Folge: Das Werkzeug hat
 * systematisch die am staerksten vernachlaessigten Betriebe nach oben sortiert
 * — also genau die schwersten Verkaeufe (kein Budget-Beweis, kein Leidensdruck).
 *
 * Jetzt sauber getrennt:
 *   • INTENT = bewiesene Investitionsbereitschaft (analysis/buying-intent.js).
 *              Gibt der Betrieb JETZT Geld fuer Kundengewinnung aus?
 *   • HEBEL  = der Problem-Beleg von vorher. Bleibt wichtig — ohne Schwachstelle
 *              gibt es kein Pitch-Argument —, ist aber der ANLASS, nicht das Signal.
 *
 * Gewichte: Intent 0.35 > Hebel 0.30 > Fit 0.20 > Timing 0.15 (Summe 1).
 * Intent fuehrt bewusst knapp: Budget-Beweis schlaegt Schmerz-Beweis, aber ein
 * Betrieb ohne jede Schwachstelle bleibt trotzdem kein Lead.
 *
 * Empirisch validiert wird das Mapping in learning/calibration.js
 * (Reliability Diagram). Wenn dort der ECE auseinandergeht, sind die
 * +/- Punkte hier neu zu kalibrieren.
 *
 * attentionIndex = Fit^0.20 × Intent^0.35 × Hebel^0.30 × Timing^0.15 × 100
 */

/**
 * Bodenwert fuer die Intent-Dimension. Ein Lead ganz ohne erkennbares Kaufsignal
 * soll im Ranking absacken — aber nicht auf exakt 0, sonst kollabiert das
 * geometrische Mittel und ALLE signalfreien Leads werden ununterscheidbar 0.
 * Mit dem Boden bleibt die Reihung ueber die anderen Dimensionen erhalten,
 * waehrend ein bewiesener Spender (~60) rund doppelt so stark gewichtet wird.
 */
const INTENT_FLOOR = 8;

/**
 * Berechnet den Composite Score aus drei Dimensionen
 * @param {Object} params - Alle verfügbaren Daten
 * @returns {Object} Composite Score mit Dimensionen
 */
export function calculateCompositeScore(params) {
    const {
        ws, tech, place, footprint, revenue, result,
        screenshotAnalysis, contentAnalysis, socialSignals,
        triggerEvents, bfsgScore, signalStack, techDepth,
        contentFreshness, companyProfile,
        buyingIntent = null, adWaste = null
    } = params;

    // ── FIT (0-100): Passt der Lead zu Karriaro? ──
    let fit = 50; // Basis

    // Branche (lokales Unternehmen = Zielgruppe)
    if (place) fit += 15;
    if (companyProfile?.isEnterprise) fit -= 40; // Großunternehmen = kein Fit

    // Budget-Indikatoren
    const reviews = place?.userRatingCount || 0;
    if (reviews > 100) fit += 15;       // Etabliert, hat Budget
    else if (reviews > 30) fit += 10;
    else if (reviews < 5) fit -= 10;    // Vielleicht zu klein

    // Digital-Affinität (zu hoch = macht es selbst, zu niedrig = versteht es nicht)
    const maturity = footprint?.maturity || 0;
    if (maturity > 0.3 && maturity < 0.7) fit += 10; // Sweet Spot
    else if (maturity >= 0.7) fit -= 5;               // Macht es vielleicht selbst

    // Baukasten = perfekter Fit (will weg davon)
    if (tech?.isBaukasten) fit += 10;

    fit = Math.max(0, Math.min(100, fit));

    // ── HEBEL (0-100): Gibt es einen belegbaren Anlass? ──
    // Das war bis 2026-07-25 die "Intent"-Dimension. Inhaltlich unveraendert —
    // nur ehrlich umbenannt: es misst den PROBLEM-Beleg (die Schwachstelle, ueber
    // die wir ueberhaupt sprechen koennen), NICHT die Kaufbereitschaft.
    let hebel = 20; // Basis (jeder könnte eine gebrauchen)

    // Design-Qualität (schlecht = starker Hebel)
    const dq = screenshotAnalysis?.designQuality || 5;
    if (dq <= 3) hebel += 25;
    else if (dq <= 5) hebel += 15;
    else if (dq >= 8) hebel -= 15; // Gutes Design = kein sichtbarer Anlass

    // Performance-Probleme
    if (ws?.perf < 30) hebel += 15;
    else if (ws?.perf < 50) hebel += 10;
    else if (ws?.perf < 70 && dq <= 5) hebel += 5;

    // Kritische Probleme (SSL, Viewport)
    if (!ws?.isHttps) hebel += 20;
    if (ws?.viewportMissing) hebel += 15;

    // BFSG-Risiko
    if (bfsgScore?.risk === 'kritisch') hebel += 15;
    else if (bfsgScore?.risk === 'hoch') hebel += 10;

    // Content-Frische
    if (contentFreshness?.freshness === 'aufgegeben') hebel += 15;
    else if (contentFreshness?.freshness === 'veraltet') hebel += 8;

    // Tech-Tiefe (veraltete Technologie)
    if (techDepth?.obsoleteScore >= 6) hebel += 10;
    else if (techDepth?.obsoleteScore >= 3) hebel += 5;

    // Signal Stack Bonus
    if (signalStack?.clusterCount >= 2) hebel += 10;

    hebel = Math.max(0, Math.min(100, hebel));

    // ── INTENT (0-100): Will der Lead investieren? ──
    // Kommt vollstaendig aus analysis/buying-intent.js — bewiesenes Geldausgeben
    // fuer Kundengewinnung (Anzeigen, offene Stellen, Bewertungs-Frische, Analytics).
    // Fehlt das Modul (Alt-Aufrufer), faellt die Dimension auf den Boden zurueck
    // statt still einen erfundenen Mittelwert zu setzen.
    const intent = Math.max(
        INTENT_FLOOR,
        Math.min(100, typeof buyingIntent?.score === 'number' ? buyingIntent.score : 0)
    );

    // ── TIMING (0-100): Ist JETZT der richtige Zeitpunkt? ──
    let timing = 30; // Basis

    if (triggerEvents?.hasSofort) timing += 30;
    else if (triggerEvents?.totalImpact >= 10) timing += 20;
    else if (triggerEvents?.totalImpact >= 5) timing += 10;

    // Saisonaler Bonus
    const month = new Date().getMonth();
    if ([2, 3, 8, 9].includes(month)) timing += 10; // Frühling/Herbst = Redesign-Saison

    // Review-Trend
    if (socialSignals?.reviewTrend?.direction === 'fallend') timing += 15;
    if (socialSignals?.reviewTrend?.direction === 'steigend') timing += 5; // Wachstum = guter Zeitpunkt

    // Wettbewerb aktiv
    if (triggerEvents?.events?.some(e => e.type === 'competition')) timing += 10;

    // Laufende Anzeigen auf eine schwache Seite = das Geld verbrennt JETZT,
    // jeden Tag. Das ist der dringlichste Anlass, den wir messen koennen.
    if (adWaste?.active) timing += 20;

    timing = Math.max(0, Math.min(100, timing));

    // ── AUFMERKSAMKEITS-INDEX ──
    // Gewichtete geometrische Mittelung: Fit^0.20 × Intent^0.35 × Hebel^0.30 × Timing^0.15
    // Normalisiert auf 0-100. KEINE Conversion-Wahrscheinlichkeit.
    const composite = Math.round(
        Math.pow(fit / 100, 0.20) *
        Math.pow(intent / 100, 0.35) *
        Math.pow(hebel / 100, 0.30) *
        Math.pow(timing / 100, 0.15) * 100
    );

    // Welche Dimension ist der Engpass?
    const dims = [
        { name: 'Fit', value: fit },
        { name: 'Intent', value: intent },
        { name: 'Hebel', value: hebel },
        { name: 'Timing', value: timing }
    ];
    dims.sort((a, b) => a.value - b.value);
    const bottleneck = dims[0];

    // Kaufsignal-Kurzfassung fuer UI + Outreach — die eine Zeile, die der
    // Founder beim Durchscrollen braucht.
    const intentNote = buyingIntent?.tier === 'beweisbar'
        ? `Kaufsignal beweisbar: ${(buyingIntent.signals || []).slice(0, 2).map(s => s.label).join(' · ')}`
        : buyingIntent?.tier === 'wahrscheinlich'
        ? `Kaufsignal wahrscheinlich: ${(buyingIntent.signals || []).slice(0, 2).map(s => s.label).join(' · ')}`
        : 'Kein Kaufsignal — Betrieb investiert derzeit nachweislich nicht in Sichtbarkeit';

    return {
        composite,            // bestehender Schlüssel — Aufmerksamkeits-Index 0..100
        attentionIndex: composite, // expliziterer Alias
        fit,
        intent,
        hebel,
        timing,
        bottleneck,
        dimensions: { fit, intent, hebel, timing },
        buyingIntent,
        adWaste,
        intentNote,
        isProbability: false, // explizit: das ist KEINE Wahrscheinlichkeit
        label: composite >= 65 ? 'Exzellenter Lead — zahlt bereits und hat einen belegbaren Hebel'
            : composite >= 45 ? 'Guter Lead — kontaktieren'
            : composite >= 30 ? 'Möglich — Engpass: ' + bottleneck.name
            : 'Schwacher Lead — mindestens eine Dimension fehlt',
        recommendation: bottleneck.name === 'Fit' ? 'Lead passt nicht ideal zu deinem Angebot'
            : bottleneck.name === 'Intent' ? 'Betrieb investiert derzeit nachweislich nicht — teuer zu überzeugen, niedrig priorisieren'
            : bottleneck.name === 'Hebel' ? 'Kein belegbarer Anlass — ohne Schwachstelle fehlt das Argument'
            : 'Timing ist nicht optimal — in Watchlist aufnehmen und später kontaktieren'
    };
}
