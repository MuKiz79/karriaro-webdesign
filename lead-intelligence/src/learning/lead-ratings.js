/**
 * Bewertungs-Store: „den würde ich anrufen" je Lead — mit eingefrorenem
 * Merkmalsvektor.
 *
 * ─── Warum ein EIGENER Store und nicht score-feedback.js ───────────────────
 * `crm/known.js:14-18` zieht `karriaro_score_feedback` als **Dedup-Quelle** heran,
 * und der Scanner filtert damit Treffer weg. Haetten die Lead-Bewertungen dort
 * gelegen, waere jede bewertete Domain aus kuenftigen Scans VERSCHWUNDEN — auch
 * jede mit Daumen hoch. Ausserdem bedeutet `too_high/correct/too_low` dort „der
 * SCORE ist falsch", nicht „der LEAD ist gut".
 * ⚠️ Dieser Store darf NIEMALS in `known.js` verdrahtet werden.
 *
 * ─── Warum die Merkmale mitgespeichert werden ──────────────────────────────
 * Ein Label ohne seine Merkmale ist wertlos. Die Scores aendern sich bei jeder
 * Code-Aenderung (in einer Woche dreimal). Wer spaeter lernen will, braucht den
 * Zustand ZUM BEWERTUNGSZEITPUNKT. `crm/leads.js` taugt dafuer nicht (die
 * Firestore-Whitelist schneidet den ganzen Signal-Reichtum ab), `saved-searches.js`
 * ebenfalls nicht (MAX_ENTRIES 12 + De-Dup je Stadt loeschen die Daten).
 *
 * Persistenz nach dem bewaehrten Dual-Sync-Muster aus `crm/leads.js`:
 * localStorage sofort und immer, Firestore best-effort danach — ein Klick
 * blockiert nie, ein Sync-Fehler kostet keine Bewertung.
 *
 * @module learning/lead-ratings
 */

const KEY = 'karriaro_lead_ratings';
/** Schema-Stempel: aendert sich die Merkmalsliste, sind Alt-Vektoren nicht mischbar. */
export const FEATURE_VERSION = 1;

/** Erlaubte Werte. `skip` = „weiss ich nicht" = Enthaltung (nicht im Training). */
export const RATINGS = ['up', 'down', 'skip'];

function fb() { return typeof window !== 'undefined' ? window.__firebase : null; }

function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch { return {}; }
}
function save(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); }
    catch (e) { console.warn('Bewertungen lokal nicht speicherbar:', e?.message || e); }
}

/** Alle Bewertungen als Map domain → Eintrag. */
export function getAllRatings() { return load(); }

/** Bewertung einer Domain oder null. */
export function getRating(domain) {
    return domain ? (load()[domain] || null) : null;
}

/**
 * Bewertung setzen (oder mit demselben Wert erneut klicken = zuruecknehmen).
 *
 * @param {string} domain
 * @param {'up'|'down'|'skip'} rating
 * @param {{features?:object, score?:number, key?:string, city?:string}} ctx
 * @returns {Promise<{ok:boolean, rating:string|null, firestoreSynced:boolean, firestoreError?:string}>}
 */
export async function setRating(domain, rating, ctx = {}) {
    if (!domain || !RATINGS.includes(rating)) return { ok: false, rating: null, firestoreSynced: false };

    const map = load();
    const vorher = map[domain];
    // Zweiter Klick auf denselben Knopf nimmt die Bewertung zurueck — ohne das
    // waere ein Fehlklick nur ueber einen anderen Wert korrigierbar.
    const zuruecknehmen = vorher && vorher.rating === rating;

    if (zuruecknehmen) delete map[domain];
    else {
        map[domain] = {
            domain,
            rating,
            key: ctx.key || vorher?.key || null,
            city: ctx.city || vorher?.city || null,
            // Merkmale nur beim ERSTEN Setzen einfrieren: korrigiert der Founder
            // seine Bewertung spaeter, soll der Vektor von damals erhalten bleiben
            // (er hat auf DIESE Zahlen geschaut).
            features: vorher?.features || ctx.features || null,
            scoreAtRating: typeof vorher?.scoreAtRating === 'number' ? vorher.scoreAtRating : (ctx.score ?? null),
            featureVersion: vorher?.featureVersion ?? FEATURE_VERSION,
            ratedAt: Date.now()
        };
    }
    save(map);

    const f = fb();
    const uid = f?.auth?.currentUser?.uid;
    if (!f?.db || !uid) return { ok: true, rating: zuruecknehmen ? null : rating, firestoreSynced: false };

    try {
        const id = `${uid}_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const ref = f.fns.doc(f.db, 'leadRatings', id);
        if (zuruecknehmen) await f.fns.deleteDoc(ref);
        else await f.fns.setDoc(ref, { uid, ...map[domain], ratedAt: f.fns.serverTimestamp(), ratedAtMs: Date.now() }, { merge: true });
        return { ok: true, rating: zuruecknehmen ? null : rating, firestoreSynced: true };
    } catch (e) {
        return { ok: true, rating: zuruecknehmen ? null : rating, firestoreSynced: false, firestoreError: e?.message || String(e) };
    }
}

/**
 * Serverstand einlesen, wenn lokal weniger vorliegt (geleerter Cache, zweites
 * Geraet). Verschmilzt NICHT — Firestore gewinnt nur bei MEHR Eintraegen, damit
 * ein veralteter Serverstand keine frischen lokalen Bewertungen ueberschreibt.
 * (Gleiches Muster wie `feedback-loop.js` `restoreFeedbackFromCloud`.)
 * @returns {Promise<number>} Anzahl uebernommener Eintraege (0 = nichts getan)
 */
export async function restoreRatingsFromCloud() {
    const f = fb();
    const uid = f?.auth?.currentUser?.uid;
    if (!f?.db || !uid) return 0;
    try {
        const q = f.fns.query(f.fns.collection(f.db, 'leadRatings'), f.fns.where('uid', '==', uid));
        const snap = await f.fns.getDocs(q);
        const remote = {};
        snap.forEach(d => {
            const v = d.data();
            if (v?.domain) remote[v.domain] = { ...v, ratedAt: v.ratedAtMs || Date.now() };
        });
        const lokal = load();
        if (Object.keys(remote).length <= Object.keys(lokal).length) return 0;
        save(remote);
        return Object.keys(remote).length;
    } catch (e) {
        console.warn('Bewertungs-Restore fehlgeschlagen:', e?.message || e);
        return 0;
    }
}

/**
 * Trainingsdaten: NUR up/down. `skip` ist eine Enthaltung und darf nicht als
 * halbe Zustimmung durchschlagen — es markiert einen Grenzfall, keine Meinung.
 * @returns {{rows:Array<{domain, y:number, features:object, score:number|null}>, skipped:number}}
 */
export function getTrainingRows() {
    const map = load();
    const rows = [];
    let skipped = 0;
    for (const e of Object.values(map)) {
        if (e.rating === 'skip') { skipped++; continue; }
        if (!e.features || e.featureVersion !== FEATURE_VERSION) continue;   // Alt-Schema nicht mischen
        rows.push({ domain: e.domain, y: e.rating === 'up' ? 1 : 0, features: e.features, score: e.scoreAtRating });
    }
    return { rows, skipped };
}

/** Zaehlstand fuer die UI. */
export function getRatingStats() {
    const map = load();
    const v = Object.values(map);
    return {
        total: v.length,
        up: v.filter(e => e.rating === 'up').length,
        down: v.filter(e => e.rating === 'down').length,
        skip: v.filter(e => e.rating === 'skip').length,
        trainierbar: getTrainingRows().rows.length
    };
}
