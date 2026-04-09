/**
 * #3 BFSG-Compliance-Score
 * Prüft WCAG 2.2 Level AA Kriterien aus Lighthouse-Daten
 * BFSG seit 28. Juni 2025 in Kraft — Bußgelder bis 100.000€
 */

const WCAG_CHECKS = [
    { id: 'color-contrast', name: 'Farbkontrast', wcag: '1.4.3', weight: 3, bfsg: true },
    { id: 'image-alt', name: 'Alt-Texte für Bilder', wcag: '1.1.1', weight: 3, bfsg: true },
    { id: 'label', name: 'Formular-Labels', wcag: '1.3.1', weight: 2, bfsg: true },
    { id: 'link-name', name: 'Link-Beschreibungen', wcag: '2.4.4', weight: 2, bfsg: true },
    { id: 'button-name', name: 'Button-Beschreibungen', wcag: '4.1.2', weight: 2, bfsg: true },
    { id: 'html-has-lang', name: 'Sprach-Attribut', wcag: '3.1.1', weight: 1, bfsg: true },
    { id: 'document-title', name: 'Seitentitel', wcag: '2.4.2', weight: 1, bfsg: true },
    { id: 'heading-order', name: 'Überschriften-Hierarchie', wcag: '1.3.1', weight: 1, bfsg: false },
    { id: 'tabindex', name: 'Tab-Reihenfolge', wcag: '2.4.3', weight: 2, bfsg: true },
    { id: 'meta-viewport', name: 'Zoom erlaubt', wcag: '1.4.4', weight: 2, bfsg: true },
    { id: 'target-size', name: 'Touch-Zielgröße', wcag: '2.5.8', weight: 1, bfsg: true },
    { id: 'duplicate-id-active', name: 'Eindeutige IDs', wcag: '4.1.1', weight: 1, bfsg: false },
];

/**
 * Prüft BFSG/WCAG-Compliance aus Lighthouse A11y-Audits
 * @param {Object} psiData - PageSpeed Insights Response
 * @returns {Object} BFSG-Compliance-Ergebnis
 */
export function checkBFSGCompliance(psiData) {
    const audits = psiData?.lighthouseResult?.audits || {};
    const a11yScore = psiData?.lighthouseResult?.categories?.accessibility?.score || 0;

    const results = [];
    let passed = 0, failed = 0, totalWeight = 0, failedWeight = 0;
    const criticalFails = [];

    for (const check of WCAG_CHECKS) {
        const audit = audits[check.id];
        const isPassed = audit?.score === 1 || audit?.score === null; // null = not applicable
        const failCount = audit?.details?.items?.length || 0;

        results.push({
            ...check,
            passed: isPassed,
            failCount,
            description: audit?.description || ''
        });

        totalWeight += check.weight;
        if (isPassed) {
            passed++;
        } else {
            failed++;
            failedWeight += check.weight;
            if (check.bfsg && check.weight >= 2) {
                criticalFails.push(check);
            }
        }
    }

    // BFSG-Risiko-Bewertung
    const complianceScore = Math.round((1 - failedWeight / totalWeight) * 100);
    let risk, riskLabel, fine;
    if (complianceScore >= 90 && criticalFails.length === 0) {
        risk = 'niedrig'; riskLabel = 'BFSG-konform'; fine = '0€';
    } else if (complianceScore >= 70 && criticalFails.length <= 1) {
        risk = 'mittel'; riskLabel = 'Nachbesserung nötig'; fine = 'bis 10.000€';
    } else if (complianceScore >= 50) {
        risk = 'hoch'; riskLabel = 'Abmahnrisiko'; fine = 'bis 50.000€';
    } else {
        risk = 'kritisch'; riskLabel = 'Akutes Abmahnrisiko'; fine = 'bis 100.000€';
    }

    // Pitch-Argument
    let pitchArg = null;
    if (risk === 'hoch' || risk === 'kritisch') {
        pitchArg = `Seit Juni 2025 ist das BFSG in Kraft. Ihre Website erfüllt nur ${complianceScore}% der Anforderungen. `
            + `${criticalFails.length} kritische Verstöße: ${criticalFails.map(c => c.name).join(', ')}. `
            + `Es drohen Bußgelder ${fine}.`;
    }

    return {
        complianceScore,
        a11yScore: Math.round(a11yScore * 100),
        passed,
        failed,
        criticalFails,
        results,
        risk,
        riskLabel,
        fine,
        pitchArg,
        funnelImpact: risk === 'kritisch' ? 5 : risk === 'hoch' ? 3 : risk === 'mittel' ? 1 : 0
    };
}
