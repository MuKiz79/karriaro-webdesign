/**
 * API Client — Cache, Retry, Timeout, Request Queue
 *
 * Löst 3 Probleme:
 * 1. Gleiche URL wird bei Batch 10× analysiert → Cache (5 Min TTL)
 * 2. Kein Retry bei transientem Fehler → 1 Retry nach 2s
 * 3. Kein Timeout → 30s Default
 */

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 Minuten

/**
 * Gecachter Fetch mit Retry und Timeout
 * @param {string} url - Request URL
 * @param {Object} options - fetch options
 * @param {Object} config - { cacheTTL, timeout, retries }
 * @returns {Promise<any>} JSON Response
 */
export async function cachedFetch(url, options = {}, config = {}) {
    const {
        cacheTTL = CACHE_TTL,
        timeout = 30000,
        retries = 1,
        cacheKey = null
    } = config;

    const key = cacheKey || url + JSON.stringify(options.body || '');

    // Cache-Hit prüfen
    if (cache.has(key)) {
        const { data, ts } = cache.get(key);
        if (Date.now() - ts < cacheTTL) return data;
        cache.delete(key); // Abgelaufen
    }

    // Fetch mit Timeout
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);

            const res = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timer);

            if (!res.ok) {
                // 429 = Rate Limit → Retry nach Backoff
                if (res.status === 429 && attempt < retries) {
                    await delay(2000 * (attempt + 1));
                    continue;
                }
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();

            // In Cache speichern
            cache.set(key, { data, ts: Date.now() });

            // Cache-Größe begrenzen (max 100 Einträge)
            if (cache.size > 100) {
                const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
                if (oldest) cache.delete(oldest[0]);
            }

            return data;
        } catch (e) {
            lastError = e;
            if (e.name === 'AbortError') {
                lastError = new Error(`Timeout nach ${timeout / 1000}s`);
            }
            if (attempt < retries) await delay(2000);
        }
    }
    throw lastError;
}

/**
 * Cache leeren (z.B. nach Einstellungsänderung)
 */
export function clearCache() {
    cache.clear();
}

/**
 * Cache-Statistiken
 */
export function cacheStats() {
    return {
        size: cache.size,
        keys: [...cache.keys()].map(k => k.slice(0, 60))
    };
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}
