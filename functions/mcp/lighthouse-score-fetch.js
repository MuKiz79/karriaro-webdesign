/**
 * Sprint 170 — Karriaro-Lighthouse-Public-Score-API-Wrapper.
 *
 * Ruft https://lighthouse.karriaro.de/api/public/lighthouse-score auf.
 * Liefert Multi-Dimensions-Score (performance, dsgvo, ux, mobile).
 *
 * Optional-Pfad: bei Fehler/Timeout returniert null, das Audit
 * läuft ohne Lighthouse-Zeile weiter.
 */

const LIGHTHOUSE_URL = 'https://lighthouse.karriaro.de/api/public/lighthouse-score';
const TIMEOUT_MS = 8000;

async function fetchLighthouseScore(url) {
    if (!url) return null;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    try {
        var res = await fetch(LIGHTHOUSE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url }),
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        var json = await res.json();
        if (!json || json.success !== true || !json.data) return null;
        return {
            scoreId: json.data.scoreId || null,
            totalScore: typeof json.data.totalScore === 'number' ? json.data.totalScore : null,
            dimensions: Array.isArray(json.data.dimensions) ? json.data.dimensions : []
        };
    } catch (err) {
        clearTimeout(timer);
        return null;
    }
}

module.exports = { fetchLighthouseScore };
