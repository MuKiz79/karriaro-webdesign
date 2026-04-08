/**
 * Thermodynamische Website-Entropie (Modul W1)
 *
 * Zweiter Hauptsatz: Ohne Energiezufuhr steigt die Unordnung.
 * Misst technische Verschlackung: Tech-Diversitaet, Request-Chaos,
 * Dateigroessen-Verteilung, CMS-Alter, toter Code.
 *
 * @module analysis/entropy
 */

/**
 * Tech-Signatures fuer Diversitaets-Messung
 * @type {RegExp[]}
 */
const TECH_PATTERNS = [
    /jquery/i, /bootstrap/i, /divi/i, /elementor/i, /wp-content/i, /wix/i, /jimdo/i,
    /fontawesome/i, /google.*font/i, /analytics/i, /gtag/i, /facebook/i, /hotjar/i,
    /slick/i, /owl/i, /swiper/i, /lightbox/i, /fancybox/i, /revolution/i, /lodash/i, /moment/i
];

/**
 * Berechnet thermodynamische Website-Entropie
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @param {Object} tech - Tech-Detection Ergebnis
 * @returns {{S: number, techDiversity: number, totalRequests: number,
 *            sizeEntropy: number, deadCodeFactor: number, ageFactor: number,
 *            estAge: string, label: string}}
 */
export function calculateEntropy(psiData, tech) {
    const lh = psiData?.lighthouseResult || {};
    const audits = lh.audits || {};

    // Signal 1: Technologie-Diversitaet (wie viele verschiedene Frameworks/Libraries?)
    const netItems = audits['network-requests']?.details?.items || [];
    const urls = netItems.map(i => i.url || '');
    const techSignatures = new Set();
    for (const u of urls) {
        for (const p of TECH_PATTERNS) {
            if (p.test(u)) techSignatures.add(p.source);
        }
    }
    const techDiversity = techSignatures.size;

    // Signal 2: Request-Chaos (Anzahl Requests als Unordnungs-Mass)
    const totalRequests = netItems.length;
    const requestEntropy = totalRequests > 0 ? Math.min(1, Math.log2(totalRequests) / Math.log2(200)) : 0;

    // Signal 3: Dateigroessen-Verteilung (Shannon-aehnlich)
    const sizes = netItems.map(i => i.transferSize || 0).filter(s => s > 0);
    const totalSize = sizes.reduce((a, b) => a + b, 0);
    let sizeEntropy = 0;
    if (totalSize > 0 && sizes.length > 1) {
        for (const s of sizes) {
            const p = s / totalSize;
            if (p > 0) sizeEntropy -= p * Math.log2(p);
        }
        sizeEntropy = Math.min(1, sizeEntropy / Math.log2(sizes.length));
    }

    // Signal 4: CMS-Alter (aeltere Systeme = mehr akkumulierte Entropie)
    let ageFactor = 0;
    if (tech.version) {
        const v = parseInt(tech.version);
        if (v > 0 && v < 5) ageFactor = 0.9;
        else if (v < 6) ageFactor = 0.6;
        else ageFactor = 0.3;
    } else if (tech.isBaukasten) {
        ageFactor = 0.5;
    }

    // Signal 5: Unused JavaScript / CSS (tote Code-Fragmente)
    const unusedJs = (audits['unused-javascript']?.details?.items || []).length;
    const unusedCss = (audits['unused-css-rules']?.details?.items || []).length;
    const deadCodeFactor = Math.min(1, (unusedJs + unusedCss) / 15);

    // Gesamt-Entropie (0-1, hoeher = mehr Unordnung = laenger nicht gepflegt)
    const S = (
        (techDiversity / 12) * 0.20 +
        requestEntropy       * 0.15 +
        sizeEntropy          * 0.15 +
        ageFactor            * 0.25 +
        deadCodeFactor       * 0.25
    );

    // Geschaetztes Alter basierend auf Entropie
    const estYearsSinceRedesign = S < 0.3 ? '< 1 Jahr'
        : S < 0.5 ? '1-2 Jahre'
        : S < 0.7 ? '2-4 Jahre'
        : '4+ Jahre';

    return {
        S: Math.round(Math.min(1, S) * 100) / 100,
        techDiversity,
        totalRequests,
        sizeEntropy: Math.round(sizeEntropy * 100) / 100,
        deadCodeFactor: Math.round(deadCodeFactor * 100) / 100,
        ageFactor,
        estAge: estYearsSinceRedesign,
        label: S >= 0.7 ? 'Kritisch — System im Verfall'
            : S >= 0.4 ? 'Erhoehte Unordnung'
            : 'Relativ gepflegt'
    };
}
