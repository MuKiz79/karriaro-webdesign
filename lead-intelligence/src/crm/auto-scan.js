/**
 * #1 Auto-Scan — Konfiguration für automatische Lead-Suche
 * #5 Daily Report — E-Mail-Report Konfiguration
 * #10 Competitor Watch — Mitbewerber-Überwachung
 *
 * Speichert Konfiguration in localStorage.
 * Die eigentliche Ausführung passiert über Cloud Scheduler (separates Setup).
 */

const CONFIG_KEY = 'karriaro_autoscan';

const DEFAULT_CONFIG = {
    enabled: false,
    queries: [], // z.B. ['Friseur Offenburg', 'Zahnarzt Lahr', 'Restaurant Ortenau']
    maxResults: 5,
    minScore: 50,
    schedule: 'weekly', // 'daily' | 'weekly'
    emailReport: false,
    reportEmail: '',
    competitorDomains: [], // z.B. ['andere-webdesign-firma.de']
    lastRun: null,
    lastResults: []
};

/**
 * Lade Auto-Scan Konfiguration
 */
export function loadAutoScanConfig() {
    try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
    } catch { return { ...DEFAULT_CONFIG }; }
}

/**
 * Speichere Auto-Scan Konfiguration
 */
export function saveAutoScanConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/**
 * Speichere Ergebnisse des letzten Auto-Scans
 */
export function saveAutoScanResults(results) {
    const config = loadAutoScanConfig();
    config.lastRun = Date.now();
    config.lastResults = results.slice(0, 20); // Max 20 Ergebnisse
    saveAutoScanConfig(config);
}

/**
 * Prüfe ob ein Auto-Scan fällig ist
 */
export function isAutoScanDue() {
    const config = loadAutoScanConfig();
    if (!config.enabled || config.queries.length === 0) return false;
    if (!config.lastRun) return true;
    const daysSince = (Date.now() - config.lastRun) / (1000 * 60 * 60 * 24);
    return config.schedule === 'daily' ? daysSince >= 1 : daysSince >= 7;
}

/**
 * Gibt neue Leads seit dem letzten Check zurück
 */
export function getNewLeads() {
    const config = loadAutoScanConfig();
    return config.lastResults.filter(r => r.leadScore >= config.minScore && !r.isCompetitor);
}
