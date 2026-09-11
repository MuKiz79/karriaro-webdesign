/**
 * Suppression-/Do-not-contact-Liste — „gleicher Lead nie zweimal".
 *
 * Dual-Sync wie leads.js (localStorage + Firestore-Collection 'suppression').
 * Key ist die Domain (nicht die E-Mail — robuster, da Adressen wechseln).
 * window-/Firestore-Zugriffe sind guarded, damit die reine Logik unter Vitest
 * (node) ohne Browser läuft.
 *
 * Wer schreibt hier hinein (2026-09-10):
 *   • Outreach-Studio: „Abgemeldet / kein Interesse" → 'opt_out', „Unzustellbar" → 'bounced'
 *   • enrichContact meldet einen Werbewiderspruch im Impressum → 'opt_out'
 *   • CRM: Verlust mit Grund „Kein Interesse / abgemeldet" → 'opt_out'
 * Das Kontakt-Gate (outreach/kontakt-grundlage.js) blockiert gesperrte Domains
 * über JEDEN Kanal — auch den Brief.
 *
 * @module crm/suppression
 */

const LS_KEY = 'karriaro_suppression';

/** Sperrgründe mit Anzeigetext. */
export const SPERRGRUENDE = {
    manual: 'Manuell gesperrt',
    bounced: 'Unzustellbar',
    opt_out: 'Abgemeldet / kein Interesse / Werbewiderspruch',
    already_contacted: 'Bereits kontaktiert'
};

/** Gründe, die einen schwächeren bestehenden Eintrag ersetzen. */
const STARKE_GRUENDE = new Set(['opt_out', 'bounced']);

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
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { console.warn('Sperrliste in localStorage unlesbar:', e); return []; }
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
            // Lokale Einträge, die noch nicht synchronisiert sind, nicht verlieren:
            // eine Sperre darf nie durch einen Ladevorgang verschwinden.
            const cloud = new Set(list.map(e => normalizeDomain(e.domain)));
            const nurLokal = getLocal().filter(e => !cloud.has(normalizeDomain(e.domain)));
            const zusammen = [...list, ...nurLokal];
            setLocal(zusammen);
            return new Set(zusammen.map(e => normalizeDomain(e.domain)));
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
 * Trägt eine Domain dauerhaft aus. Dedupliziert; ein stärkerer Grund (opt_out,
 * bounced) ersetzt einen schwächeren. reason ∈ Schlüssel von SPERRGRUENDE.
 */
export async function addSuppression(domain, reason = 'manual') {
    const d = normalizeDomain(domain);
    if (!d) return { ok: false };
    const grund = SPERRGRUENDE[reason] ? reason : 'manual';
    if (grund !== reason) console.warn(`Unbekannter Sperrgrund „${reason}" — als 'manual' eingetragen.`);

    const local = getLocal();
    const idx = local.findIndex(e => normalizeDomain(e.domain) === d);
    // Der Grund, der nach diesem Aufruf gilt — auch für Firestore. Ohne diese
    // Trennung überschrieb ein späteres „manuell sperren" dort einen belegten
    // Werbewiderspruch (opt_out), während lokal der starke Grund stehen blieb.
    let wirksam = grund;
    if (idx < 0) {
        local.push({ domain: d, reason: grund, at: Date.now() });
        setLocal(local);
    } else if (STARKE_GRUENDE.has(grund) && local[idx].reason !== grund && !STARKE_GRUENDE.has(local[idx].reason)) {
        local[idx] = { ...local[idx], reason: grund, at: Date.now() };
        setLocal(local);
    } else if (SPERRGRUENDE[local[idx].reason]) {
        wirksam = local[idx].reason;
    }

    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true };
    try {
        const id = `${user.uid}_${d.replace(/[^a-zA-Z0-9]/g, '_')}`;
        await fb().fns.setDoc(
            fb().fns.doc(fb().db, 'suppression', id),
            { uid: user.uid, domain: d, reason: wirksam, at: fb().fns.serverTimestamp() },
            { merge: true }
        );
        return { ok: true, firestoreSynced: true };
    } catch (e) {
        console.error('Suppression add:', e);
        return { ok: true, firestoreSynced: false };
    }
}
