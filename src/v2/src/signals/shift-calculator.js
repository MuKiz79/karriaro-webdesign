/**
 * Shift-Calculator — Sammelt ALLE Signale und berechnet Funnel-Shifts
 *
 * FIX: Design-Qualität als Gegengewicht
 * Eine visuell moderne Website mit schlechtem PageSpeed ist KEIN guter Lead.
 * Der Inhaber sieht seine Seite, findet sie gut → kein Argument für Neubau.
 * Nur "Speed-Optimierung" ist ein Argument, aber kein 990€-Projekt.
 *
 * @module signals/shift-calculator
 */

/**
 * Berechnet Funnel-Shifts für alle 5 relevanten Stufen
 *
 * @param {Object} ws - Website-Score
 * @param {Object} tech - Tech-Detection
 * @param {Object|null} place - Google Places Daten
 * @param {Array|null} competitors - Konkurrenten
 * @param {Object|null} revenue - Revenue-Model Ergebnis
 * @param {Object|null} footprint - Digital-Footprint
 * @param {Object|null} screenshotAnalysis - KI-Design-Bewertung (designQuality 1-10)
 * @param {Object|null} contentAnalysis - KI-Content-Analyse
 */
export function calculateShifts(ws, tech, place, competitors, revenue, footprint, screenshotAnalysis = null, contentAnalysis = null) {
    const s = {
        reach:    [0, 0],
        open:     [0, 0],
        interest: [0, 0],
        convo:    [0, 0],
        close:    [0, 0]
    };

    // ── Design-Qualität als Dämpfungsfaktor ──
    // designQuality 1-10 von der KI-Screenshot-Analyse
    // 7+ = visuell gute Website → technische Probleme allein reichen nicht
    // 4-6 = mittelmäßig → normale Shifts
    // 1-3 = visuell veraltet → Shifts verstärkt
    const dq = screenshotAnalysis?.designQuality || 0;
    const isVisuallyGood = dq >= 7;
    const isVisuallyBad = dq > 0 && dq <= 3;
    const designDamping = isVisuallyGood ? 0.3 : isVisuallyBad ? 1.5 : 1.0;

    // Content-Qualität: Hat die Seite CTA, USP, frischen Content?
    const hasGoodContent = contentAnalysis && !contentAnalysis.error &&
        contentAnalysis.hasCTA && contentAnalysis.hasUSP;
    const contentDamping = hasGoodContent ? 0.7 : 1.0;

    // Kombinierter Dämpfungsfaktor: Visuell gut + guter Content = kaum ein Lead
    const qualityDamping = Math.min(designDamping, contentDamping);

    // ── Erreichbarkeit (nicht von Design abhängig) ──
    if (place?.websiteUri) s.reach[0] += 2;
    if (place?.regularOpeningHours) s.reach[0] += 1;
    if (!place) s.reach[1] += 3;

    // ── Öffnung (nicht von Design abhängig) ──
    if (place?.displayName) s.open[0] += 2;
    if (!ws.isHttps) s.open[0] += 1;

    // ── Interesse — GEDÄMPFT durch Design-Qualität ──

    // Kritische Probleme (SSL, Viewport) → immer relevant, nur leicht gedämpft
    if (!ws.isHttps) s.interest[0] += Math.round(4 * Math.max(0.6, qualityDamping));
    if (ws.viewportMissing) s.interest[0] += Math.round(3 * Math.max(0.6, qualityDamping));
    else if (!ws.viewport) s.interest[0] += 1;

    // Performance → STARK von Design abhängig
    // Visuell gute Seite mit Perf 44 = nur Speed-Problem, kein Neubau-Argument
    // Visuell schlechte Seite mit Perf 44 = alles muss raus
    if (ws.perf < 30) s.interest[0] += Math.round(3 * qualityDamping);
    else if (ws.perf < 50) s.interest[0] += Math.round(2 * qualityDamping);
    else if (ws.perf < 70) s.interest[0] += Math.round(1 * qualityDamping);

    // Baukasten → immer relevant (strukturelle Limitierung)
    if (tech.isBaukasten) s.interest[0] += 3;

    // SEO/A11y → leicht gedämpft (auch gute Seiten können schlechtes SEO haben)
    if (ws.seo < 70) s.interest[0] += Math.round(1 * Math.max(0.5, qualityDamping));
    if (ws.a11y < 70) s.interest[0] += 1; // BFSG ist immer relevant

    // Revenue → nicht gedämpft (Umsatzverlust ist Fakt)
    if (revenue?.yearlyRevenueLoss > 3000) s.interest[0] += 2;
    if (revenue?.yearlyRevenueLoss > 10000) s.interest[0] += 1;

    // Starkes Business + schlechte Website = Lead erkennt Diskrepanz
    // ABER: Nur wenn die Website auch VISUELL schlecht ist
    const reviews = place?.userRatingCount || 0;
    if (reviews > 50 && ws.perf < 60 && !isVisuallyGood) s.interest[0] += 2;
    if (reviews > 150 && ws.perf < 75 && !isVisuallyGood) s.interest[0] += 1;

    // Visuell gute Website → NEGATIVE Shifts (weniger Interesse)
    if (isVisuallyGood && ws.perf >= 40 && ws.isHttps) {
        s.interest[1] += 3; // Inhaber sieht keinen Handlungsbedarf
        s.close[1] += 2;    // "Warum soll ich Geld ausgeben?"
    }

    // ── Gespräch (nicht von Design abhängig) ──
    if (competitors && competitors.filter(c => c.perf > 50).length > 1) s.convo[0] += 2;
    s.convo[0] += 2;  // Karriaro-Portfolio + kostenloser Entwurf
    if (reviews > 100) s.convo[0] += 1;

    // ── Abschluss ──
    if (revenue?.roi > 3) s.close[0] += 3;
    else if (revenue?.roi > 1.5) s.close[0] += 2;
    else if (revenue?.roi > 0.5) s.close[0] += 1;

    if (tech.isBaukasten) s.close[0] += 2;

    const count = place?.userRatingCount || 0;
    if (count > 100) s.close[0] += 2;
    else if (count > 30) s.close[0] += 1;
    else if (count < 5) s.close[1] += 1;

    // ── Digital Footprint mit Plattform-Relevanz ──
    // Instagram ist für Friseure/Restaurants KRITISCH, für Anwälte irrelevant
    // LinkedIn ist für Makler/Anwälte wichtig, für Friseure irrelevant
    const PLATFORM_RELEVANCE = {
        'hair_salon': { instagram: 3, facebook: 1, linkedin: 0, tiktok: 2 },
        'beauty_salon': { instagram: 3, facebook: 1, linkedin: 0, tiktok: 2 },
        'restaurant': { instagram: 2, facebook: 2, linkedin: 0, tiktok: 1 },
        'cafe': { instagram: 2, facebook: 1, linkedin: 0, tiktok: 1 },
        'hotel': { instagram: 2, facebook: 2, linkedin: 1, tiktok: 0 },
        'dentist': { instagram: 1, facebook: 1, linkedin: 1, tiktok: 0 },
        'doctor': { instagram: 0, facebook: 1, linkedin: 1, tiktok: 0 },
        'lawyer': { instagram: 0, facebook: 0, linkedin: 3, tiktok: 0 },
        'real_estate_agency': { instagram: 2, facebook: 1, linkedin: 3, tiktok: 0 },
        'auto_repair': { instagram: 1, facebook: 2, linkedin: 0, tiktok: 0 },
        'gym': { instagram: 3, facebook: 1, linkedin: 0, tiktok: 3 },
        '_default': { instagram: 2, facebook: 1, linkedin: 1, tiktok: 1 }
    };
    const plType = place?.primaryType || '_default';
    const plRel = PLATFORM_RELEVANCE[plType] || PLATFORM_RELEVANCE._default;

    if (footprint) {
        // Plattform-relevanter Check: Friseur ohne Instagram = starkes Signal
        if (footprint.hasInstagram && ws.perf < 60 && !isVisuallyGood) {
            s.interest[0] += plRel.instagram; // Branchenabhängig statt fix 3
        } else if (footprint.hasInstagram && isVisuallyGood) {
            s.interest[0] += 0;
        }

        // Fehlende relevante Plattform = Pitch-Argument
        if (!footprint.hasInstagram && plRel.instagram >= 2) {
            s.interest[0] += 1; // "Ein Friseur ohne Instagram verliert Kunden"
        }
        if (!footprint.hasLinkedIn && plRel.linkedin >= 2) {
            s.interest[0] += 1; // "Ein Makler ohne LinkedIn verpasst B2B-Kontakte"
        }

        if (footprint.hasFbPixel) { s.close[0] += 2; s.interest[0] += 1; }
        if (footprint.platformCount >= 3) { s.interest[0] += 2; s.close[0] += 1; }
        else if (footprint.platformCount >= 1) s.interest[0] += 1;
        if (footprint.platformCount === 0) { s.open[1] += 1; s.interest[1] += 1; }
        if (footprint.hasAnalytics) s.interest[0] += 1;
    }

    return s;
}

/**
 * Erweitert Shifts mit Social-Signal-Daten
 */
export function applySocialShifts(shifts, socialSignals, socialComparison, socialProfiles) {
    const s = { ...shifts };

    if (socialSignals?.available) {
        const fi = socialSignals.funnelImpact;
        s.interest[0] += fi.interest || 0;
        s.convo[0] += fi.convo || 0;
        s.close[0] += fi.close || 0;
    }

    if (socialComparison?.available) {
        const fi = socialComparison.funnelImpact;
        s.interest[0] += fi.interest || 0;
        s.close[0] += fi.close || 0;
    }

    if (socialProfiles && !socialProfiles.error) {
        if (socialProfiles.instagram?.followers > 500) {
            s.interest[0] += 2;
            s.close[0] += 1;
        }
        if (socialProfiles.instagram?.followers > 5000) {
            s.interest[0] += 1;
        }
        if (socialProfiles.facebook?.likes > 200 || socialProfiles.facebook?.followers > 200) {
            s.interest[0] += 1;
            s.close[0] += 1;
        }
        if (socialProfiles.linkedin?.isCompanyPage) {
            s.convo[0] += 1;
        }
        if (socialProfiles.tiktok?.followers > 100) {
            s.interest[0] += 2;
            s.close[0] += 1;
        }
    }

    return s;
}
