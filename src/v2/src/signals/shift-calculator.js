/**
 * Shift-Calculator — Sammelt ALLE Signale und berechnet Funnel-Shifts
 *
 * Berechnet die Integer-Shifts fuer den Conjugate Beta Update
 * basierend auf Website-Score, Tech, Place, Competitors, Revenue und Footprint.
 *
 * @module signals/shift-calculator
 */

/**
 * Berechnet Funnel-Shifts fuer alle 5 relevanten Stufen
 *
 * Positiver Shift[0] = mehr Alpha (hoehere Wahrscheinlichkeit)
 * Positiver Shift[1] = mehr Beta (niedrigere Wahrscheinlichkeit)
 *
 * @param {Object} ws - Website-Score (perf, a11y, seo, isHttps, viewport, viewportMissing)
 * @param {Object} tech - Tech-Detection (isBaukasten, cms, version)
 * @param {Object|null} place - Google Places Daten
 * @param {Array|null} competitors - Konkurrenten-Array
 * @param {Object|null} revenue - Revenue-Model Ergebnis
 * @param {Object|null} footprint - Digital-Footprint Ergebnis
 * @returns {{reach: [number,number], open: [number,number],
 *            interest: [number,number], convo: [number,number],
 *            close: [number,number]}}
 */
export function calculateShifts(ws, tech, place, competitors, revenue, footprint) {
    const s = {
        reach:    [0, 0],
        open:     [0, 0],
        interest: [0, 0],
        convo:    [0, 0],
        close:    [0, 0]
    };

    // ── Erreichbarkeit ──
    if (place?.websiteUri) s.reach[0] += 2;
    if (place?.regularOpeningHours) s.reach[0] += 1;
    if (!place) s.reach[1] += 3;

    // ── Oeffnung ──
    if (place?.displayName) s.open[0] += 2;
    if (ws.perf < 50 || !ws.isHttps) s.open[0] += 1;

    // ── Interesse — JEDE Website die nicht perfekt ist, ist ein Argument ──
    if (!ws.isHttps) s.interest[0] += 4;              // Kritisch: Browser-Warnung
    if (ws.viewportMissing) s.interest[0] += 3;       // Wirklich kein Viewport
    else if (!ws.viewport) s.interest[0] += 1;        // Viewport eingeschraenkt

    if (ws.perf < 30) s.interest[0] += 3;             // Katastrophal langsam
    else if (ws.perf < 50) s.interest[0] += 2;        // Deutlich langsam
    else if (ws.perf < 70) s.interest[0] += 1;        // Verbesserungswuerdig

    if (tech.isBaukasten) s.interest[0] += 3;         // Baukasten = strukturelles Problem
    if (ws.seo < 70) s.interest[0] += 1;              // SEO-Luecken
    if (ws.a11y < 70) s.interest[0] += 1;             // BFSG-Argument

    if (revenue?.yearlyRevenueLoss > 3000) s.interest[0] += 2;
    if (revenue?.yearlyRevenueLoss > 10000) s.interest[0] += 1;

    // Starkes Business + mittlere Website = Lead erkennt Diskrepanz
    const reviews = place?.userRatingCount || 0;
    if (reviews > 50 && ws.perf < 60) s.interest[0] += 2;
    if (reviews > 150 && ws.perf < 75) s.interest[0] += 1;

    // ── Gespraech ──
    if (competitors && competitors.filter(c => c.perf > 50).length > 1) s.convo[0] += 2;
    s.convo[0] += 2;  // Karriaro-Portfolio + kostenloser Entwurf
    if (reviews > 100) s.convo[0] += 1;  // Etabliertes Unternehmen nimmt Termine ernst

    // ── Abschluss ──
    if (revenue?.roi > 3) s.close[0] += 3;
    else if (revenue?.roi > 1.5) s.close[0] += 2;
    else if (revenue?.roi > 0.5) s.close[0] += 1;

    if (tech.isBaukasten) s.close[0] += 2;  // Kein Vendor-Lock-in-Angst

    const count = place?.userRatingCount || 0;
    if (count > 100) s.close[0] += 2;       // Budget vorhanden
    else if (count > 30) s.close[0] += 1;
    else if (count < 5) s.close[1] += 1;

    // ── Digital Footprint Shifts ──
    if (footprint) {
        // Instagram aktiv + schlechte Website = BESTER Lead
        if (footprint.hasInstagram && ws.perf < 60) s.interest[0] += 3;
        // Facebook Pixel = hat Werbebudget
        if (footprint.hasFbPixel) { s.close[0] += 2; s.interest[0] += 1; }
        // Viele Plattformen = digital aktiv, versteht den Wert
        if (footprint.platformCount >= 3) { s.interest[0] += 2; s.close[0] += 1; }
        else if (footprint.platformCount >= 1) s.interest[0] += 1;
        // Kein Social Media = weniger digital-affin
        if (footprint.platformCount === 0) { s.open[1] += 1; s.interest[1] += 1; }
        // Analytics aktiv = misst schon, versteht Daten
        if (footprint.hasAnalytics) s.interest[0] += 1;
    }

    return s;
}

/**
 * Erweitert Shifts mit Social-Signal-Daten (aufgerufen wenn Daten verfügbar)
 * @param {Object} shifts - Bestehende Shifts
 * @param {Object} socialSignals - Ergebnis von analyzeSocialSignals
 * @param {Object} socialComparison - Ergebnis von compareSocialPresence
 * @param {Object} socialProfiles - Ergebnis von analyzeSocialProfiles
 * @returns {Object} Erweiterte Shifts
 */
export function applySocialShifts(shifts, socialSignals, socialComparison, socialProfiles) {
    const s = { ...shifts };

    // Social Signals (1-4, 9): GBP-basierte Signale
    if (socialSignals?.available) {
        const fi = socialSignals.funnelImpact;
        s.interest[0] += fi.interest || 0;
        s.convo[0] += fi.convo || 0;
        s.close[0] += fi.close || 0;
    }

    // Social Comparison (10): Konkurrenz-Gap
    if (socialComparison?.available) {
        const fi = socialComparison.funnelImpact;
        s.interest[0] += fi.interest || 0;
        s.close[0] += fi.close || 0;
    }

    // Social Profiles (6-8, 11-12): Externe Profildaten
    if (socialProfiles && !socialProfiles.error) {
        // Instagram-Follower + schlechte Website = Paradox-Lead
        if (socialProfiles.instagram?.followers > 500) {
            s.interest[0] += 2;  // Reichweite vorhanden, Website passt nicht
            s.close[0] += 1;    // Hat Budget (Social Media kostet Zeit/Geld)
        }
        if (socialProfiles.instagram?.followers > 5000) {
            s.interest[0] += 1;  // Zusätzlich bei großer Reichweite
        }
        // Facebook Likes = hat Community
        if (socialProfiles.facebook?.likes > 200 || socialProfiles.facebook?.followers > 200) {
            s.interest[0] += 1;
            s.close[0] += 1;
        }
        // LinkedIn Company Page = professioneller Anspruch
        if (socialProfiles.linkedin?.isCompanyPage) {
            s.convo[0] += 1;  // Einfacher Gesprächseinstieg über LinkedIn
        }
        // TikTok = besonders digital-affin, investiert in Content
        if (socialProfiles.tiktok?.followers > 100) {
            s.interest[0] += 2;
            s.close[0] += 1;
        }
    }

    return s;
}
