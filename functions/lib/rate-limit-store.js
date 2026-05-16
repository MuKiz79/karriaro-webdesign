/**
 * Firestore-backed Rate-Limiter.
 *
 * Ersetzt die In-Memory-Maps in index.js, die beim Cold-Start verschwinden
 * und via mehrere Functions-Instanzen leicht zu bypassen sind.
 *
 * Speicherung: Collection `rateLimitCounters/<hashedKey>`. Atomic-Increment
 * via Firestore-Transaction. expiresAt-Feld fuer Firestore-TTL-Cleanup.
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

function hashKey(ip, key) {
    return crypto.createHash('sha256').update(`${ip}:${key}`).digest('hex').slice(0, 24);
}

/**
 * Extrahiert die Client-IP aus dem Request. X-Forwarded-For ist eine
 * Komma-Liste; das erste Element ist die echte Client-IP, alle weiteren
 * sind Proxy-IPs. Bisher wurde der gesamte Header gehasht (trivial bypass).
 */
function clientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
        const first = String(xff).split(',')[0].trim();
        if (first) return first;
    }
    return req.ip || 'unknown';
}

/**
 * Prueft ob Request erlaubt ist. Schreibt + inkrementiert atomar.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} ip Client-IP
 * @param {string} key Logischer Bucket ("quickAudit", "requestAudit", etc.)
 * @param {number} max Maximum Requests pro Window
 * @param {number} windowSec Window-Groesse in Sekunden
 * @returns {Promise<{ allowed: boolean, remaining: number, resetAtMs: number }>}
 */
async function checkRateLimit(db, ip, key, max, windowSec) {
    const docId = hashKey(ip, key);
    const ref = db.collection('rateLimitCounters').doc(docId);
    const now = Date.now();
    const windowMs = windowSec * 1000;

    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        if (!data || !data.resetAtMs || data.resetAtMs <= now) {
            const resetAtMs = now + windowMs;
            tx.set(ref, {
                count: 1,
                resetAtMs,
                expiresAt: new admin.firestore.Timestamp(
                    Math.floor((resetAtMs + 60000) / 1000), 0
                ),
                key
            });
            return { allowed: true, remaining: max - 1, resetAtMs };
        }
        if (data.count >= max) {
            return { allowed: false, remaining: 0, resetAtMs: data.resetAtMs };
        }
        tx.update(ref, { count: data.count + 1 });
        return { allowed: true, remaining: max - data.count - 1, resetAtMs: data.resetAtMs };
    });
}

/**
 * Convenience-Helper fuer Express-style Handler. Schreibt 429 + return true
 * bei Block. Fail-open bei Firestore-Fehlern (Verfuegbarkeit > Strict-Limit).
 * @returns {Promise<boolean>} true wenn geblockt
 */
async function enforceRateLimit(db, req, res, key, max, windowSec, retryAfterMessage) {
    const ip = clientIp(req);
    try {
        const result = await checkRateLimit(db, ip, key, max, windowSec);
        if (!result.allowed) {
            const retryAfterSec = Math.max(1, Math.ceil((result.resetAtMs - Date.now()) / 1000));
            res.set('Retry-After', String(retryAfterSec));
            res.status(429).json({
                error: retryAfterMessage || `Rate limit exceeded. Max ${max} requests per ${windowSec}s.`,
                retryAfterSec
            });
            return true;
        }
    } catch (err) {
        console.error(`[rate-limit] firestore-error key=${key} ip=${ip}:`, err.message);
        return false;
    }
    return false;
}

module.exports = { checkRateLimit, enforceRateLimit, clientIp, hashKey };
