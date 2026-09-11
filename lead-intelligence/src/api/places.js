/**
 * Google Places API via Cloud Function Proxy
 */
import { config } from '../config.js';
import { placesSeitenParameter } from './cloud-functions.js';

async function callFunction(endpoint, body) {
    if (!config.fnUrl) return null;
    const res = await fetch(`${config.fnUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
    return res.json();
}

/**
 * Text-Suche. Seit V7 (2026-09-10) optional:
 *   opts.maxPages (1–3)          weitere Ergebnisseiten — je Seite eine bezahlte Anfrage
 *   opts.includeFutureOpening    auch Betriebe mit businessStatus FUTURE_OPENING
 * Ohne opts ist die Anfrage unverändert. Die Antwort trägt dann `pagesFetched`
 * (siehe placesAnfragenAus in cloud-functions.js) und je Place `openingDate`, falls vorhanden.
 */
export async function searchPlaces(query, maxResults = 10, opts = {}) {
    return callFunction('searchPlaces', { query, maxResults, ...placesSeitenParameter(opts) });
}

export async function nearbyPlaces(lat, lng, type, maxResults = 5) {
    return callFunction('nearbyPlaces', { lat, lng, type, maxResults });
}
