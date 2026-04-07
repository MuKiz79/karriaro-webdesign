const { onRequest } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");

const PLACES_KEY = defineString("PLACES_API_KEY");
const ALLOWED_ORIGINS = ["https://karriaro-webdesign.de", "http://localhost:3000", "http://localhost:5000"];
const PLACES_BASE = "https://places.googleapis.com/v1/places";
const RATE_LIMIT = new Map(); // IP -> { count, resetTime }
const MAX_REQUESTS_PER_MINUTE = 30;

function cors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.set("Access-Control-Allow-Origin", origin);
    }
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return true; }
    return false;
}

function rateLimit(req, res) {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();
    const entry = RATE_LIMIT.get(ip) || { count: 0, resetTime: now + 60000 };
    if (now > entry.resetTime) { entry.count = 0; entry.resetTime = now + 60000; }
    entry.count++;
    RATE_LIMIT.set(ip, entry);
    if (entry.count > MAX_REQUESTS_PER_MINUTE) {
        res.status(429).json({ error: "Rate limit exceeded. Max 30 requests/minute." });
        return true;
    }
    return false;
}

// ── Text Search: "Friseur Berlin" or "beispiel.de" ──
exports.searchPlaces = onRequest({ region: "europe-west1", cors: false }, async (req, res) => {
    if (cors(req, res)) return;
    if (rateLimit(req, res)) return;

    const { query, maxResults = 10 } = req.body || {};
    if (!query) return res.status(400).json({ error: "query required" });

    try {
        const response = await fetch(`${PLACES_BASE}:searchText`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": PLACES_KEY.value(),
                "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.formattedAddress,places.primaryTypeDisplayName,places.regularOpeningHours,places.photos,places.businessStatus,places.location,places.primaryType"
            },
            body: JSON.stringify({
                textQuery: query,
                languageCode: "de",
                maxResultCount: Math.min(maxResults, 20)
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Places API error", details: err.message });
    }
});

// ── Nearby Search: competitors in same area + category ──
exports.nearbyPlaces = onRequest({ region: "europe-west1", cors: false }, async (req, res) => {
    if (cors(req, res)) return;
    if (rateLimit(req, res)) return;

    const { lat, lng, type, radiusMeters = 5000, maxResults = 5 } = req.body || {};
    if (!lat || !lng || !type) return res.status(400).json({ error: "lat, lng, type required" });

    try {
        const response = await fetch(`${PLACES_BASE}:searchNearby`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": PLACES_KEY.value(),
                "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.formattedAddress,places.primaryTypeDisplayName,places.businessStatus"
            },
            body: JSON.stringify({
                includedPrimaryTypes: [type],
                maxResultCount: Math.min(maxResults, 10),
                locationRestriction: {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius: radiusMeters
                    }
                },
                languageCode: "de"
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Nearby API error", details: err.message });
    }
});
