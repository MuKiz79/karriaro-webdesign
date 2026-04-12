/**
 * #4 Persönliches Stats-Dashboard
 * Analysiert CRM-Daten + Feedback-Loop für Leistungs-Insights
 */

/**
 * Berechnet persönliche Statistiken aus CRM-Daten
 * @param {Array} leads - Alle Leads aus loadLeads()
 * @returns {Object} Statistiken
 */
export function calculateStats(leads) {
    if (!leads || leads.length === 0) return { available: false };

    const now = Date.now();
    const thisMonth = leads.filter(l => l.savedAt && (now - l.savedAt) < 30 * 24 * 60 * 60 * 1000);
    const lastMonth = leads.filter(l => l.savedAt && (now - l.savedAt) >= 30 * 24 * 60 * 60 * 1000 && (now - l.savedAt) < 60 * 24 * 60 * 60 * 1000);

    // Conversion-Analyse
    const contacted = leads.filter(l => l.status !== 'neu');
    const converted = leads.filter(l => l.status === 'kunde');
    const lost = leads.filter(l => l.status === 'verloren');
    const overallCR = contacted.length > 0 ? Math.round(converted.length / contacted.length * 100) : 0;

    // Branchen-Performance
    const branchStats = {};
    for (const l of leads) {
        const branch = l.type || 'Unbekannt';
        if (!branchStats[branch]) branchStats[branch] = { total: 0, converted: 0, avgScore: 0, totalScore: 0 };
        branchStats[branch].total++;
        branchStats[branch].totalScore += (l.leadScore || 0);
        if (l.status === 'kunde') branchStats[branch].converted++;
    }
    for (const b of Object.values(branchStats)) {
        b.avgScore = Math.round(b.totalScore / b.total);
        b.cr = b.total > 0 ? Math.round(b.converted / b.total * 100) : 0;
    }

    // Beste/schlechteste Branche
    const branchRanking = Object.entries(branchStats)
        .filter(([, s]) => s.total >= 3)
        .sort((a, b) => b[1].cr - a[1].cr);

    // Score-Verteilung
    const scoreDistribution = {
        '70-100': leads.filter(l => (l.leadScore || 0) >= 70).length,
        '55-69': leads.filter(l => (l.leadScore || 0) >= 55 && (l.leadScore || 0) < 70).length,
        '30-54': leads.filter(l => (l.leadScore || 0) >= 30 && (l.leadScore || 0) < 55).length,
        '0-29': leads.filter(l => (l.leadScore || 0) < 30).length
    };

    // Pipeline-Wert
    const pipeline = leads.filter(l => ['kontaktiert', 'interessiert', 'angebot'].includes(l.status));
    const pipelineValue = pipeline.reduce((s, l) => s + (l.expectedValue || 0), 0);

    // Aktivität
    const avgLeadsPerWeek = thisMonth.length > 0 ? Math.round(thisMonth.length / 4 * 10) / 10 : 0;
    const trend = thisMonth.length > lastMonth.length ? 'steigend' : thisMonth.length < lastMonth.length ? 'fallend' : 'stabil';

    return {
        available: true,
        overview: {
            total: leads.length,
            thisMonth: thisMonth.length,
            lastMonth: lastMonth.length,
            trend,
            avgLeadsPerWeek
        },
        conversion: {
            contacted: contacted.length,
            converted: converted.length,
            lost: lost.length,
            cr: overallCR,
            pipelineCount: pipeline.length,
            pipelineValue: Math.round(pipelineValue)
        },
        branches: branchRanking,
        branchStats,
        scoreDistribution,
        insights: generateInsights(leads, overallCR, branchRanking, scoreDistribution)
    };
}

function generateInsights(leads, cr, branchRanking, scoreDist) {
    const insights = [];

    if (cr >= 15) insights.push('Deine Conversion-Rate ist überdurchschnittlich. Weiter so!');
    else if (cr >= 5) insights.push('Deine CR liegt im Normalbereich. Fokussiere auf Leads mit Score 55+.');
    else if (cr > 0) insights.push('Deine CR ist niedrig. Konzentriere dich auf weniger, aber bessere Leads.');

    if (branchRanking.length > 0) {
        insights.push(`Deine beste Branche: ${branchRanking[0][0]} (${branchRanking[0][1].cr}% CR).`);
    }

    const highScoreLeads = scoreDist['70-100'] + scoreDist['55-69'];
    const lowScoreLeads = scoreDist['0-29'];
    if (lowScoreLeads > highScoreLeads * 2) {
        insights.push('Du analysierst viele schwache Leads. Nutze Batch-Suche mit Sortierung nach Score.');
    }

    return insights;
}
