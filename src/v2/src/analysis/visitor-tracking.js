/**
 * #8 Website Visitor Tracking — Basis-Implementierung
 *
 * Trackt ob ein Lead die eigene Website (karriaro-webdesign.de) besucht hat.
 * Nutzt einen einfachen Tracking-Pixel-Ansatz:
 * - Beim Senden der E-Mail wird eine Tracking-URL eingebettet
 * - Wenn der Lead klickt, wird das Event in Firestore gespeichert
 *
 * Für vollständige Visitor-ID (IP → Firma) braucht man externe Services
 * wie Leadfeeder oder Warmly (Datenschutz beachten).
 */

const TRACKING_KEY = 'karriaro_visitor_tracking';

/**
 * Generiere eine Tracking-URL für einen Lead
 * Die URL kann als unsichtbares Pixel in die E-Mail eingebettet werden
 * oder als Link-Wrapper für den CTA
 */
export function generateTrackingUrl(domain, campaign = 'email') {
    const trackId = btoa(`${domain}|${campaign}|${Date.now()}`).replace(/=/g, '');
    saveTracking(domain, { trackId, campaign, created: Date.now(), opened: false });
    // Die URL zeigt auf karriaro-webdesign.de mit UTM-Parametern
    return `https://karriaro-webdesign.de/?utm_source=lead-intelligence&utm_medium=${campaign}&utm_campaign=${trackId}&ref=${encodeURIComponent(domain)}`;
}

/**
 * Generiere den Link für die personalisierte Lead-Page
 * Wenn der Lead diesen Link öffnet, wissen wir: Er ist interessiert
 */
export function generateLeadPageUrl(domain, fnUrl) {
    if (!fnUrl) return null;
    const base = fnUrl.replace(/\/[^/]+$/, '');
    return `${base}/leadPage?domain=${encodeURIComponent(domain)}`;
}

/**
 * Prüfe ob ein Lead die Tracking-URL geöffnet hat
 * (Wird manuell geprüft via Google Analytics UTM-Parameter)
 */
export function checkVisitorActivity(domain) {
    const data = loadTracking();
    return data[domain] || null;
}

/**
 * Markiere einen Lead als "hat Website besucht"
 */
export function markVisited(domain) {
    const data = loadTracking();
    if (data[domain]) {
        data[domain].opened = true;
        data[domain].openedAt = Date.now();
    } else {
        data[domain] = { opened: true, openedAt: Date.now() };
    }
    saveAllTracking(data);
}

/**
 * Alle Leads die die Website besucht haben
 */
export function getVisitedLeads() {
    const data = loadTracking();
    return Object.entries(data)
        .filter(([, v]) => v.opened)
        .map(([domain, v]) => ({ domain, openedAt: v.openedAt, campaign: v.campaign }))
        .sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
}

function saveTracking(domain, entry) {
    const data = loadTracking();
    data[domain] = { ...data[domain], ...entry };
    saveAllTracking(data);
}
function loadTracking() {
    try { return JSON.parse(localStorage.getItem(TRACKING_KEY) || '{}'); }
    catch { return {}; }
}
function saveAllTracking(data) { localStorage.setItem(TRACKING_KEY, JSON.stringify(data)); }
