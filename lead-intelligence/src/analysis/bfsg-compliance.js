/**
 * #3 Barrierefreiheit — WCAG 2.2 Level AA aus Lighthouse-Daten.
 *
 * ─── 2026-08-14: Die Bußgeld-Staffel ist ERSATZLOS entfallen ─────────────────
 * Dieses Modul mappte den Score auf Beträge („bis 100.000€" / „bis 50.000€" /
 * „bis 10.000€") und auf Etiketten wie „Akutes Abmahnrisiko". Beides war frei
 * erfunden:
 *
 *   · § 37 BFSG kennt ZWEI Rahmen (bis 100.000 € für Abs. 1 Nr. 1, 7–10;
 *     bis 10.000 € für Nr. 2–6), und sie hängen daran, WELCHE Pflicht verletzt
 *     wurde — nicht an der Höhe eines Lighthouse-Scores. 50.000 € steht im
 *     Gesetz nirgends.
 *   · Ob der Betrieb überhaupt BFSG-pflichtig ist, wurde NIRGENDS geprüft.
 *     Eine Vier-Mann-Bäckerei mit Visitenkarten-Seite bekam „kritisch,
 *     bis 100.000 €" — bei null Rechtspflicht (§§ 1, 3 BFSG).
 *
 * ⚠️ Hier NIE wieder einen Geldbetrag oder eine Abmahn-Behauptung einführen.
 * Gemessen wird die SCHWERE der Barrieren — eine Aussage über die Website, die
 * für jeden Betrieb gilt. Die Rechtsfolge ist eine andere Frage; sie beantwortet
 * `pflichtLage` (aus adEvidence.bfsgScope, functions/lib/bfsg-scope.js) mit
 * Vorbehalt, und sie kann nie mehr sagen als „möglicherweise erfasst".
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
 * Prüft WCAG-Konformität aus Lighthouse A11y-Audits.
 * @param {Object} psiData - PageSpeed Insights Response
 * @param {Object|null} pflichtLage - `adEvidence.bfsgScope` (serverseitig ermittelt);
 *        `null` = nicht geprüft ⇒ es wird KEINE Rechtsfolge behauptet.
 * @returns {Object} Barrierefreiheits-Ergebnis
 */
export function checkBFSGCompliance(psiData, pflichtLage = null) {
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

    // Schwere der gemessenen Barrieren — KEINE Rechtsfolge (siehe Kopf).
    const complianceScore = Math.round((1 - failedWeight / totalWeight) * 100);
    let risk, riskLabel;
    if (complianceScore >= 90 && criticalFails.length === 0) {
        risk = 'niedrig'; riskLabel = 'keine auffälligen Barrieren';
    } else if (complianceScore >= 70 && criticalFails.length <= 1) {
        risk = 'mittel'; riskLabel = 'einzelne Barrieren';
    } else if (complianceScore >= 50) {
        risk = 'hoch'; riskLabel = 'deutliche Barrieren';
    } else {
        risk = 'kritisch'; riskLabel = 'gravierende Barrieren';
    }

    // Das Argument nennt die gemessene WIRKUNG auf echte Besucher. Sie gilt für
    // jeden Betrieb — auch für die weitaus meisten, die dem BFSG nicht
    // unterliegen. Deshalb steht sie hier ohne jeden Vorbehalt.
    let pitchArg = null;
    if (risk === 'hoch' || risk === 'kritisch') {
        pitchArg = `Ihre Website erfüllt ${complianceScore}% der geprüften WCAG-Kriterien. `
            + `${criticalFails.length} davon wiegen schwer: ${criticalFails.map(c => c.name).join(', ')}. `
            + `Konkret heißt das: Besucher, die die Schrift vergrößern, per Tastatur bedienen oder `
            + `bei schlechtem Licht auf dem Handy lesen, kommen an diesen Stellen nicht weiter.`;
    }

    // Die Rechtsfolge — nur wenn die Betroffenheit serverseitig GEPRÜFT wurde und
    // ein Online-Vertragsschluss belegt ist. Ohne Prüfung: null, kein Satz.
    // Mehr als „möglicherweise" ist strukturell nicht sagbar, weil Beschäftigtenzahl
    // und Umsatz (§ 3 Abs. 3 BFSG) in keinem Quelltext stehen.
    let rechtsHinweis = null;
    if (pflichtLage?.lage === 'moeglich' && (risk === 'hoch' || risk === 'kritisch')) {
        rechtsHinweis = `Hinzu kommt: Die Seite ermöglicht einen Online-Abschluss `
            + `(${pflichtLage.belege.join(', ')}). Damit kann sie unter das BFSG fallen. `
            + pflichtLage.vorbehalt;
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
        pflichtLage,
        rechtsHinweis,
        pitchArg,
        funnelImpact: risk === 'kritisch' ? 5 : risk === 'hoch' ? 3 : risk === 'mittel' ? 1 : 0
    };
}
