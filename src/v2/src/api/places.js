/**
 * Google Places API via Cloud Function Proxy
 */
import { config } from '../config.js';

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

export async function searchPlaces(query, maxResults = 10) {
    return callFunction('searchPlaces', { query, maxResults });
}

export async function nearbyPlaces(lat, lng, type, maxResults = 5) {
    return callFunction('nearbyPlaces', { lat, lng, type, maxResults });
}
