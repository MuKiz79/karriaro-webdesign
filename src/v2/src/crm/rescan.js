/**
 * #3 Re-Scan — Erkennt Veränderungen bei gespeicherten Leads
 * Vergleicht aktuellen Score mit gespeichertem Score
 */

const RESCAN_KEY = 'karriaro_rescan_history';

/**
 * Speichert einen Snapshot für spätere Vergleiche
 */
export function saveSnapshot(domain, data) {
    const history = loadHistory();
    if (!history[domain]) history[domain] = [];
    history[domain].push({
        ts: Date.now(),
        score: data.leadScore,
        perf: data.perf,
        seo: data.seo,
        a11y: data.a11y,
        reviews: data.reviews || 0,
        rating: data.rating || null
    });
    // Max 10 Snapshots pro Domain
    if (history[domain].length > 10) history[domain] = history[domain].slice(-10);
    saveHistory(history);
}

/**
 * Vergleicht aktuellen Stand mit letztem Snapshot
 * @returns {Object|null} Änderungen seit letztem Scan
 */
export function compareWithLastScan(domain, currentData) {
    const history = loadHistory();
    const snapshots = history[domain];
    if (!snapshots || snapshots.length === 0) return null;

    const last = snapshots[snapshots.length - 1];
    const daysSince = Math.round((Date.now() - last.ts) / (1000 * 60 * 60 * 24));

    const changes = [];
    if (Math.abs((currentData.leadScore || 0) - last.score) >= 5) {
        changes.push({
            field: 'Score',
            old: last.score,
            new: currentData.leadScore,
            delta: currentData.leadScore - last.score,
            direction: currentData.leadScore > last.score ? 'verbessert' : 'verschlechtert'
        });
    }
    if (Math.abs((currentData.perf || 0) - last.perf) >= 10) {
        changes.push({ field: 'Performance', old: last.perf, new: currentData.perf, delta: currentData.perf - last.perf, direction: currentData.perf > last.perf ? 'verbessert' : 'verschlechtert' });
    }
    if ((currentData.reviews || 0) - last.reviews >= 5) {
        changes.push({ field: 'Bewertungen', old: last.reviews, new: currentData.reviews, delta: currentData.reviews - last.reviews, direction: 'mehr' });
    }

    return {
        hasChanges: changes.length > 0,
        changes,
        daysSince,
        lastScan: new Date(last.ts).toLocaleDateString('de-DE'),
        snapshots: snapshots.length,
        alert: changes.some(c => c.field === 'Score' && c.direction === 'verschlechtert')
            ? 'Website hat sich verschlechtert — jetzt kontaktieren!'
            : changes.some(c => c.field === 'Bewertungen')
                ? 'Neue Bewertungen seit letztem Scan'
                : null
    };
}

/**
 * Gibt alle Domains zurück die einen Re-Scan brauchen (> 7 Tage)
 */
export function getStaleLeads() {
    const history = loadHistory();
    const now = Date.now();
    const stale = [];
    for (const [domain, snapshots] of Object.entries(history)) {
        const last = snapshots[snapshots.length - 1];
        const daysSince = (now - last.ts) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) {
            stale.push({ domain, daysSince: Math.round(daysSince), lastScore: last.score });
        }
    }
    return stale.sort((a, b) => b.daysSince - a.daysSince);
}

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(RESCAN_KEY) || '{}'); }
    catch { return {}; }
}
function saveHistory(h) { localStorage.setItem(RESCAN_KEY, JSON.stringify(h)); }
