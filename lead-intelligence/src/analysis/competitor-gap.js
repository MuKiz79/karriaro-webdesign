/**
 * 2. Competitor Feature Gap
 * Vergleicht die Features des Leads mit denen seiner Konkurrenten
 * "Ihr Konkurrent Müller hat eine Exposé-Suche. Sie haben nur ein Kontaktformular."
 */

import { auditUX } from './ux-audit.js';

/**
 * Analysiere Feature-Gap zwischen Lead und Konkurrenten
 * @param {Object} leadPsiData - PageSpeed-Daten des Leads
 * @param {Object} leadPlace - Google Places des Leads
 * @param {Array} competitorPsiData - Array von {psiData, place} der Konkurrenten
 * @returns {Object} { gaps, advantages, gapScore }
 */
export function analyzeCompetitorGap(leadPsiData, leadPlace, competitorPsiData = []) {
    const leadAudit = auditUX(leadPsiData, leadPlace);
    if (!leadAudit || !competitorPsiData.length) return { gaps: [], advantages: [], gapScore: 0 };

    const leadFeatures = new Set(leadAudit.found.map(f => f.id));
    const leadMissing = new Set(leadAudit.missing.map(f => f.id));

    // Prüfe welche Features die Konkurrenten haben die dem Lead fehlen
    const competitorHas = new Map();  // featureId → [competitor names]
    for (const comp of competitorPsiData) {
        if (!comp.psiData || !comp.place) continue;
        const compAudit = auditUX(comp.psiData, comp.place);
        if (!compAudit) continue;
        const compName = comp.place.displayName?.text || 'Konkurrent';
        for (const f of compAudit.found) {
            if (leadMissing.has(f.id)) {
                if (!competitorHas.has(f.id)) competitorHas.set(f.id, []);
                competitorHas.get(f.id).push(compName);
            }
        }
    }

    // Gaps: Features die dem Lead fehlen und Konkurrenten haben
    const gaps = [];
    for (const [featureId, compNames] of competitorHas) {
        const feature = leadAudit.missing.find(f => f.id === featureId);
        if (feature) {
            gaps.push({
                feature: feature.name,
                why: feature.why,
                critical: feature.critical,
                competitorsWithFeature: compNames,
                pitchArg: `${compNames[0]} hat bereits ${feature.name}. Sie nicht.`
            });
        }
    }

    // Advantages: Features die der Lead hat die Konkurrenten nicht haben
    // (seltener relevant, aber gut zu wissen)
    const advantages = leadAudit.found.map(f => f.name);

    const gapScore = gaps.reduce((s, g) => s + (g.critical ? 3 : 1), 0);

    return {
        gaps: gaps.sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0)),
        advantages,
        gapScore,
        totalMissing: leadAudit.missing.length,
        label: gapScore >= 5 ? 'Großer Rückstand — Konkurrenz ist deutlich weiter' :
               gapScore >= 2 ? 'Einige Lücken gegenüber der Konkurrenz' :
               'Kaum Rückstand'
    };
}
