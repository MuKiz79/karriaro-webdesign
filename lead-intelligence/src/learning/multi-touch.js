/**
 * #15 Multi-Touch ROI Tracking
 * Trackt welcher Touchpoint (E-Mail 1-5, Anruf, Besuch) den Deal brachte
 * Optimiert die 5-Schritt-Sequenz automatisch
 */

const STORAGE_KEY = 'karriaro_multitouch';

const TOUCHPOINT_TYPES = ['email_1', 'email_2', 'email_3', 'email_4', 'email_5', 'phone', 'visit', 'linkedin', 'instagram'];

/**
 * Loggt einen Touchpoint für einen Lead
 */
export function logTouchpoint(domain, touchpointType, response = null) {
    const data = loadData();
    if (!data.leads[domain]) {
        data.leads[domain] = { touchpoints: [], outcome: null };
    }
    data.leads[domain].touchpoints.push({
        type: touchpointType,
        timestamp: Date.now(),
        response // 'keine', 'positiv', 'negativ', 'termin', 'abschluss'
    });
    saveData(data);
}

/**
 * Markiert welcher Touchpoint zum Abschluss führte
 */
export function markConversion(domain, convertingTouchpoint) {
    const data = loadData();
    if (data.leads[domain]) {
        data.leads[domain].outcome = 'converted';
        data.leads[domain].convertedAt = Date.now();
        data.leads[domain].convertingTouch = convertingTouchpoint;
    }
    saveData(data);
}

/**
 * Analysiert welche Touchpoints am effektivsten sind
 * @returns {Object} Attribution-Analyse
 */
export function getAttribution() {
    const data = loadData();
    const leads = Object.values(data.leads);

    if (leads.length < 5) {
        return { available: false, reason: 'Mindestens 5 Leads mit Touchpoints nötig' };
    }

    const converted = leads.filter(l => l.outcome === 'converted');
    const touchStats = {};

    // Zähle wie oft jeder Touchpoint in konvertierten vs. nicht-konvertierten Leads vorkommt
    for (const type of TOUCHPOINT_TYPES) {
        const withTouch = leads.filter(l => l.touchpoints.some(t => t.type === type));
        const withTouchConverted = converted.filter(l => l.touchpoints.some(t => t.type === type));
        const directConversion = converted.filter(l => l.convertingTouch === type);

        touchStats[type] = {
            total: withTouch.length,
            converted: withTouchConverted.length,
            directConversions: directConversion.length,
            conversionRate: withTouch.length > 0 ? Math.round(withTouchConverted.length / withTouch.length * 100) : 0
        };
    }

    // Finde effektivsten Touchpoint
    const ranked = Object.entries(touchStats)
        .filter(([, s]) => s.total >= 3)
        .sort((a, b) => b[1].conversionRate - a[1].conversionRate);

    // Durchschnittliche Touchpoints bis Conversion
    const avgTouches = converted.length > 0
        ? Math.round(converted.reduce((s, l) => s + l.touchpoints.length, 0) / converted.length * 10) / 10
        : null;

    return {
        available: true,
        touchStats,
        ranked: ranked.map(([type, stats]) => ({ type, ...stats })),
        bestTouchpoint: ranked[0] ? ranked[0][0] : null,
        avgTouchesToConversion: avgTouches,
        totalLeads: leads.length,
        totalConverted: converted.length,
        overallRate: leads.length > 0 ? Math.round(converted.length / leads.length * 100) : 0,
        recommendation: ranked[0]
            ? `Dein effektivster Kanal: ${formatTouchpoint(ranked[0][0])} (${ranked[0][1].conversionRate}% CR). Fokussiere deine Energie dort.`
            : 'Noch nicht genug Daten für eine Empfehlung.'
    };
}

function formatTouchpoint(type) {
    const labels = {
        email_1: 'Erste E-Mail', email_2: 'Follow-Up (Tag 4)', email_3: 'Case Study (Tag 8)',
        email_4: 'Entwurf-Angebot (Tag 12)', email_5: 'Letzte Nachricht (Tag 18)',
        phone: 'Anruf', visit: 'Persönlicher Besuch', linkedin: 'LinkedIn', instagram: 'Instagram DM'
    };
    return labels[type] || type;
}

function loadData() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"leads":{}}');
    } catch {
        return { leads: {} };
    }
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
