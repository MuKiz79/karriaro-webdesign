/**
 * Phase 01 — Places-Suche + Vorfilter + Host-Dedup (scanner.js:165-215).
 * Tiefe 0 (nur stadtweit) = 18 Suchen ≈ 0,72 $. Ergebnis wird gecacht;
 * ein Re-Run kostet NICHTS mehr.
 */
import { postApi, sleep } from '../lib/net.mjs';
import { deriveReviewRecency, checkEnterpriseDB, runWithConcurrency } from '../lib/app.mjs';
import { hostnameOf } from '../lib/orchestration.mjs';

// scanner.js:51-70 — exakt dieselben 18 Branchen-Suchen.
export const BRANCHES = [
    { key: 'dentist',           q: 'Zahnarzt',          name: 'Zahnärzte' },
    { key: 'hair_salon',        q: 'Friseur',           name: 'Friseure' },
    { key: 'restaurant',        q: 'Restaurant',        name: 'Restaurants' },
    { key: 'auto_repair',       q: 'KFZ Werkstatt',     name: 'KFZ-Werkstätten' },
    { key: 'beauty_salon',      q: 'Kosmetikstudio',    name: 'Kosmetikstudios' },
    { key: 'physiotherapist',   q: 'Physiotherapie',    name: 'Physiotherapie' },
    { key: 'lawyer',            q: 'Rechtsanwalt',      name: 'Rechtsanwälte' },
    { key: 'real_estate_agency',q: 'Immobilienmakler',  name: 'Immobilienmakler' },
    { key: 'hotel',             q: 'Hotel',             name: 'Hotels' },
    { key: 'plumber',           q: 'Sanitär Heizung',   name: 'Sanitärbetriebe' },
    { key: 'electrician',       q: 'Elektriker',        name: 'Elektrobetriebe' },
    { key: 'veterinary_care',   q: 'Tierarzt',          name: 'Tierärzte' },
    { key: 'gym',               q: 'Fitnessstudio',     name: 'Fitnessstudios' },
    { key: 'moving_company',    q: 'Umzugsunternehmen', name: 'Umzugsfirmen' },
    { key: 'car_dealer',        q: 'Autohaus',          name: 'Autohäuser' },
    { key: 'bakery',            q: 'Bäckerei',          name: 'Bäckereien' },
    { key: 'florist',           q: 'Blumenladen',       name: 'Floristen' },
    { key: 'cafe',              q: 'Cafe',              name: 'Cafés' }
];

const PLACES_PER_BRANCH = 20;   // scanner.js:74
const MIN_REVIEWS = 8;          // scanner.js:77
const SEARCH_CONCURRENCY = 2;   // scanner.js:88

// scanner.js:90-99 — Backoff-Retries gegen das 30/min-Backend-Limit.
async function searchPlacesRetry(q) {
    const waits = [3000, 6000];
    for (let i = 0; ; i++) {
        try { return await postApi('searchPlaces', { query: q, maxResults: PLACES_PER_BRANCH }, { retries: 0, timeoutMs: 30000 }); }
        catch {
            if (i >= waits.length) return null;
            await sleep(waits[i]);
        }
    }
}

export async function runPlaces({ city }) {
    const queries = BRANCHES.map((b, bi) => ({ branch: b, bi, q: `${b.q} ${city}` }));
    const raw = [];
    const filtered = { keineWebsite: 0, zuWenigReviews: 0, nichtOperational: 0, kaputteUrl: 0, enterprise: 0, suchenOhneTreffer: 0 };

    await runWithConcurrency(queries, SEARCH_CONCURRENCY, async ({ branch, bi, q }) => {
        const res = await searchPlacesRetry(q);
        if (!res?.places) { filtered.suchenOhneTreffer++; return; }
        for (const p of res.places) {
            // Frische Places tragen reviews[] → reviewRecency EINMAL ableiten,
            // dann die schweren Felder strippen (scanner.js:181-183 + Persistenz-Muster).
            if (!p.reviewRecency) p.reviewRecency = deriveReviewRecency(p.reviews);
            delete p.reviews; delete p.photos;

            // Vorfilter — scanner.js:185-195. known-Liste bewusst LEER (Probe
            // kennt die localStorage-Liste des Founders nicht; im Report deklariert).
            if (!p.websiteUri) { filtered.keineWebsite++; continue; }
            if ((p.userRatingCount || 0) < MIN_REVIEWS) { filtered.zuWenigReviews++; continue; }
            if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') { filtered.nichtOperational++; continue; }
            let host;
            try { host = new URL(p.websiteUri).hostname.replace(/^www\./, ''); } catch { filtered.kaputteUrl++; continue; }
            const ent = checkEnterpriseDB(host);
            if (ent.isEnterprise || ent.isCompetitor) { filtered.enterprise++; continue; }
            raw.push({ branch, bi, host, place: p });
        }
    });

    // Deterministisches Dedup — scanner.js:202-209: niedrigster Branchen-Index gewinnt.
    const seen = new Set();
    const candidates = [];
    for (const c of raw.sort((a, b) => a.bi - b.bi)) {
        if (seen.has(c.host)) continue;
        seen.add(c.host);
        candidates.push({ branch: c.branch, place: c.place });
    }

    return {
        city,
        queries: queries.length,
        rawTreffer: raw.length,
        filtered,
        candidates
    };
}

export function hostOf(p) { return hostnameOf(p.websiteUri); }
