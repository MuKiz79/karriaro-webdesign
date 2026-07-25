/**
 * Scan-Cache — drückt Kosten/Zeit des Scanners.
 *
 *  • Places-Cache (kz_places_cache): jede searchPlaces-Suche kostet ~0,04 $.
 *    14 Tage gecacht → Wiederholungs-/Überlappungs-Scans sind GRATIS.
 *  • Score-Cache (kz_score_cache): abgeleitete Website-Scores (ws+tech) je Domain
 *    7 Tage → spart PSI-Zeit/Quota bei Re-Scans.
 *
 * Implementierung: Die Maps werden EINMAL lazy aus localStorage geladen und im
 * Speicher gehalten; Schreibzugriffe gehen in den Speicher und werden gebündelt
 * (debounced) persistiert. So entfällt das frühere Parse+Stringify pro Aufruf
 * (~378 Voll-Serialisierungen pro Tief-Scan). Cache-Treffer "touchen" den
 * Zeitstempel (TTL-on-access) → was das Kosten-Modal als gratis ausweist, bleibt
 * im anschließenden Scan auch gratis.
 *
 * @module api/scan-cache
 */

const PLACES_KEY = 'kz_places_cache';
const SCORE_KEY = 'kz_score_cache';
const VISION_KEY = 'kz_vision_cache';
const PLACES_TTL = 14 * 86400000; // 14 Tage
const SCORE_TTL = 7 * 86400000;   // 7 Tage
const VISION_TTL = 14 * 86400000; // 14 Tage (Design ändert sich langsam)
const MAX_PLACES_ENTRIES = 600;

/** Geschätzter Listenpreis pro Places-Text-Search (Enterprise+Atmosphere-SKU). */
export const PLACES_COST_USD = 0.04;

// ── In-Memory-Layer (einmal laden, gebündelt persistieren) ──
const mem = {}; // key → Map-Objekt
function map(key) {
    if (!mem[key]) {
        try { mem[key] = JSON.parse(localStorage.getItem(key) || '{}'); }
        catch { mem[key] = {}; }
    }
    return mem[key];
}

let flushTimer = null;
const dirty = new Set();
function persistNow() {
    flushTimer = null;
    for (const key of dirty) {
        const m = mem[key] || {};
        try { localStorage.setItem(key, JSON.stringify(m)); }
        catch {
            // Quota voll → älteste Hälfte verwerfen, einmal erneut versuchen.
            const entries = Object.entries(m).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
            const keep = Object.fromEntries(entries.slice(Math.floor(entries.length / 2)));
            mem[key] = keep;
            try { localStorage.setItem(key, JSON.stringify(keep)); } catch { /* aufgeben */ }
        }
    }
    dirty.clear();
}
function scheduleFlush(key) {
    dirty.add(key);
    if (flushTimer) return;
    flushTimer = setTimeout(persistNow, 400);
}

function normQ(q) { return String(q || '').trim().toLowerCase().replace(/\s+/g, ' '); }

/**
 * Nur die Felder behalten, die der Scanner-Filter UND die Scoring-Kette lesen.
 * WICHTIG: regularOpeningHours + Telefonfelder MÜSSEN bleiben — scoreLead →
 * calculateShifts (shift-calculator) liest place.regularOpeningHours; fehlte es
 * im Cache, bekäme ein gecachter Treffer einen anderen leadScore als ein frischer.
 * (reviews/photos werden bewusst NICHT gecacht — groß und nur vom Single-Check
 * genutzt, der searchPlaces ungecacht aufruft.)
 */
/**
 * Liveness aus ≤5 jüngsten Review-Zeitstempeln (Places liefert max. 5). GRATIS:
 * nur publishTime (kein Review-Text). Liefert einen kompakten, cache-kleinen Wert —
 * NICHT das reviews[]-Array. In trimPlace EINMAL berechnet, damit ein gecachter
 * Treffer denselben Score bekommt wie ein frischer.
 * @param {Array<{publishTime?:string}>} reviews
 * @returns {{daysSinceLast:number|null, velocity:number|null, n:number}}
 */
export function deriveReviewRecency(reviews) {
    const ms = (Array.isArray(reviews) ? reviews : [])
        .map(r => Date.parse(r && r.publishTime))    // NaN wenn fehlt/ungültig
        .filter(t => Number.isFinite(t))
        .sort((a, b) => b - a);                      // neueste zuerst
    if (ms.length < 2) {
        return {
            daysSinceLast: ms.length === 1 ? Math.max(0, Math.round((Date.now() - ms[0]) / 86400000)) : null,
            velocity: null,
            n: ms.length
        };
    }
    const DAY = 86400000;
    const newest = ms[0];
    const oldest = ms[ms.length - 1];
    const daysSinceLast = Math.max(0, Math.round((Date.now() - newest) / DAY));
    // spanMonths bei 1 Monat gefloort → ein enger Freundes-Burst kann die Velocity NICHT aufblasen.
    const spanMonths = Math.max(1, ((newest - oldest) / DAY) / 30);
    const velocity = Math.round((ms.length / spanMonths) * 10) / 10;
    return { daysSinceLast, velocity, n: ms.length };
}

function trimPlace(p) {
    return {
        displayName: p.displayName ? { text: p.displayName.text } : null,
        websiteUri: p.websiteUri || null,
        rating: p.rating ?? null,
        userRatingCount: p.userRatingCount ?? null,
        businessStatus: p.businessStatus || null,
        primaryType: p.primaryType || null,
        primaryTypeDisplayName: p.primaryTypeDisplayName ? { text: p.primaryTypeDisplayName.text } : null,
        formattedAddress: p.formattedAddress || null,
        location: p.location || null,
        types: p.types || [],
        regularOpeningHours: p.regularOpeningHours || null,
        internationalPhoneNumber: p.internationalPhoneNumber || null,
        nationalPhoneNumber: p.nationalPhoneNumber || null,
        // ── abgeleitete Liveness (klein; reviews[] selbst wird bewusst NICHT gecacht) ──
        reviewRecency: deriveReviewRecency(p.reviews)
    };
}

// ── Places-Cache ──
export function getCachedPlaces(query) {
    const m = map(PLACES_KEY);
    const e = m[normQ(query)];
    if (e && Date.now() - e.at < PLACES_TTL) {
        e.at = Date.now();          // TTL-on-access: hält Modal-/Scan-Zusage konsistent
        scheduleFlush(PLACES_KEY);
        return e.places;
    }
    return null;
}
export function setCachedPlaces(query, places) {
    const m = map(PLACES_KEY);
    m[normQ(query)] = { at: Date.now(), places: (places || []).map(trimPlace) };
    const keys = Object.keys(m);
    if (keys.length > MAX_PLACES_ENTRIES) {
        const sorted = Object.entries(m).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
        for (const [k] of sorted.slice(0, keys.length - MAX_PLACES_ENTRIES)) delete m[k];
    }
    scheduleFlush(PLACES_KEY);
}

/** Wie viele dieser Suchen sind noch NICHT gecacht (= kostenpflichtig)? */
export function countUncached(queries) {
    const m = map(PLACES_KEY);
    const now = Date.now();
    let n = 0;
    for (const q of queries) {
        const e = m[normQ(q)];
        if (!(e && now - e.at < PLACES_TTL)) n++;
    }
    return n;
}

// ── Score-Cache (ws + tech je Domain) ──
export function getCachedScore(domain) {
    const m = map(SCORE_KEY);
    const e = m[domain];
    if (e && Date.now() - e.at < SCORE_TTL) { e.at = Date.now(); scheduleFlush(SCORE_KEY); return { ws: e.ws, tech: e.tech, adIntent: e.adIntent || null }; }
    return null;
}
// jobIntent kam 2026-07-25 dazu. Aeltere Cache-Eintraege haben das Feld nicht —
// der Aufrufer liest dann `undefined` und behandelt es als "kein Signal" (kein
// Fehler, nur ein fehlender Bonus bis der Eintrag neu geschrieben wird).
export function setCachedScore(domain, ws, tech, adIntent = null, jobIntent = null) {
    map(SCORE_KEY)[domain] = { at: Date.now(), ws, tech, adIntent, jobIntent };
    scheduleFlush(SCORE_KEY);
}

// ── Vision-Cache (analyzeScreenshot-Ergebnis je Domain) — Top-N-Verfeinerung gratis bei Re-Scan ──
export function getCachedVision(domain) {
    const e = map(VISION_KEY)[domain];
    if (e && Date.now() - e.at < VISION_TTL) { e.at = Date.now(); scheduleFlush(VISION_KEY); return e.vision; }
    return null;
}
export function setCachedVision(domain, vision) {
    map(VISION_KEY)[domain] = { at: Date.now(), vision };
    scheduleFlush(VISION_KEY);
}
