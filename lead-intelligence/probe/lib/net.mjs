/**
 * Netz-Schicht der Probe — dieselben Endpoints wie die App, mit Timeout
 * (Playbook: nie fetch ohne AbortController) und schlichtem Retry.
 */
export const API_BASE = 'https://karriaro-leads.web.app/api';

async function fetchWithTimeout(url, opts = {}, timeoutMs = 30000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...opts, signal: ctl.signal });
    } finally { clearTimeout(t); }
}

/** POST an /api/<endpoint> — wirft bei !ok (Aufrufer entscheidet über Retry-Semantik). */
export async function postApi(endpoint, body, { timeoutMs = 30000, retries = 1, backoffMs = 3000 } = {}) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
        try {
            const r = await fetchWithTimeout(`${API_BASE}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }, timeoutMs);
            if (!r.ok) throw new Error(`${endpoint} ${r.status}`);
            return await r.json();
        } catch (e) {
            lastErr = e;
            if (i < retries) await sleep(backoffMs * (i + 1));
        }
    }
    throw lastErr;
}

/**
 * PSI direkt — exakt die URL-Form der App (src/api/pagespeed.js:8):
 * strategy=mobile + die VIER Kategorien inkl. best-practices.
 */
export async function fetchPsi(url, key, { timeoutMs = 90000 } = {}) {
    let api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}`
        + '&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo';
    if (key) api += `&key=${key}`;
    const r = await fetchWithTimeout(api, {}, timeoutMs);
    if (!r.ok) throw new Error(`PSI ${r.status}`);
    return r.json();
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
