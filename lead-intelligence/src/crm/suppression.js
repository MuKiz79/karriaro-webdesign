/**
 * Suppression-/Do-not-contact-Liste — „gleicher Lead nie zweimal".
 *
 * Dual-Sync wie leads.js (localStorage + Firestore-Collection 'suppression').
 * Key ist die Domain (nicht die E-Mail — robuster, da Adressen wechseln).
 * window-/Firestore-Zugriffe sind guarded, damit die reine Logik unter Vitest
 * (node) ohne Browser läuft.
 *
 * @module crm/suppression
 */

const LS_KEY = 'karriaro_suppression';

function win() { return typeof window !== 'undefined' ? window : null; }
function fb() { return win()?.__firebase || null; }
function currentUser() { return fb()?.auth?.currentUser || null; }
function hasLS() { return typeof localStorage !== 'undefined'; }

/** Domain normalisieren: lowercase, ohne www., ohne Protokoll/Pfad. */
export function normalizeDomain(domain) {
    let d = String(domain || '').trim().toLowerCase();
    try { if (/^https?:\/\//.test(d)) d = new URL(d).hostname; } catch { /* fällt durch */ }
    return d.replace(/^www\./, '').replace(/\/.*$/, '');
}

function getLocal() {
    if (!hasLS()) return [];
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function setLocal(list) {
    if (hasLS()) localStorage.setItem(LS_KEY, JSON.stringify(list));
}

/** Synchrones Set aus dem localStorage — für schnelle Inline-Prüfung in der Engine. */
export function loadSuppressionLocal() {
    return new Set(getLocal().map(e => normalizeDomain(e.domain)));
}

/**
 * Lädt die Suppression-Liste (Firestore wenn eingeloggt, sonst localStorage)
 * und gibt ein Set normalisierter Domains zurück.
 */
export async function loadSuppression() {
    const user = currentUser();
    if (user && fb()?.db) {
        try {
            const q = fb().fns.query(
                fb().fns.collection(fb().db, 'suppression'),
                fb().fns.where('uid', '==', user.uid)
            );
            const snap = await fb().fns.getDocs(q);
            const list = snap.docs.map(d => d.data());
            setLocal(list);
            return new Set(list.map(e => normalizeDomain(e.domain)));
        } catch (e) { console.error('Suppression load:', e); }
    }
    return loadSuppressionLocal();
}

/**
 * Prüft, ob eine Domain gesperrt ist. Mit optionalem vorab geladenem Set
 * (synchron, für die Engine) — sonst Fallback auf localStorage.
 */
export function isSuppressed(domain, set = null) {
    const d = normalizeDomain(domain);
    if (!d) return false;
    return (set || loadSuppressionLocal()).has(d);
}

/**
 * Trägt eine Domain dauerhaft aus. Dedupliziert. reason ∈
 * 'manual' | 'bounced' | 'opt_out' | 'already_contacted'.
 */
export async function addSuppression(domain, reason = 'manual') {
    const d = normalizeDomain(domain);
    if (!d) return { ok: false };

    const local = getLocal();
    if (!local.some(e => normalizeDomain(e.domain) === d)) {
        local.push({ domain: d, reason, at: Date.now() });
        setLocal(local);
    }

    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true };
    try {
        const id = `${user.uid}_${d.replace(/[^a-zA-Z0-9]/g, '_')}`;
        await fb().fns.setDoc(
            fb().fns.doc(fb().db, 'suppression', id),
            { uid: user.uid, domain: d, reason, at: fb().fns.serverTimestamp() },
            { merge: true }
        );
        return { ok: true, firestoreSynced: true };
    } catch (e) {
        console.error('Suppression add:', e);
        return { ok: true, firestoreSynced: false };
    }
}
