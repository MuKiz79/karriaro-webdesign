/**
 * Gmail-Entwürfe — assistierter Versand. Erstellt fertige Entwürfe im Gmail-
 * Konto des Gründers (Scope gmail.compose: erstellen/lesen, NICHT senden). Der
 * Gründer prüft & sendet manuell → Domain-Reputation + UWG-§7 gewahrt.
 *
 * @module outreach/gmail-drafts
 */

import { buildMimeMessage, toBase64Url } from './mime.js';

const GMAIL_DRAFTS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
const SCOPE = 'https://www.googleapis.com/auth/gmail.compose';

let cachedToken = null;
let cachedTokenExpiry = 0;

function fns() { return (typeof window !== 'undefined' && window.__firebase?.fns) || null; }
function fbAuth() { return (typeof window !== 'undefined' && window.__firebase?.auth) || null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Holt ein Gmail-Access-Token via re-auth mit gmail.compose-Scope.
 * Token lebt ~1h (kein Refresh-Token im Browser) → wird ~50 min gecacht.
 */
export async function getGoogleAccessToken({ forceReauth = false } = {}) {
    if (!forceReauth && cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;
    const f = fns();
    if (!f) throw new Error('Firebase nicht verfügbar — bitte Seite neu laden.');
    const provider = new f.GoogleAuthProvider();
    provider.addScope(SCOPE);
    const result = await f.signInWithPopup(fbAuth(), provider);
    const cred = f.GoogleAuthProvider.credentialFromResult(result);
    const token = cred?.accessToken;
    if (!token) throw new Error('Kein Gmail-Zugriffstoken erhalten (Scope abgelehnt?).');
    cachedToken = token;
    cachedTokenExpiry = Date.now() + 50 * 60 * 1000;
    return token;
}

/**
 * Erstellt für jeden Entwurf einen Gmail-Draft. Sequenziell mit 429-Backoff;
 * bei Token-Ablauf (401) einmal re-authentifizieren und fortsetzen.
 *
 * @param {Array<{to,subject,body,bodyHtml}>} drafts
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<{created:number, failed:number}>}
 */
export async function createGmailDrafts(drafts, onProgress = () => {}) {
    let token = await getGoogleAccessToken();
    let created = 0, failed = 0, reauthed = false;
    const total = drafts.length;
    const MAX_RETRIES = 4;            // deckelt 403/429-Wiederholung gegen Endlosschleife
    let retryIndex = -1, retries = 0; // pro Entwurf gezählt (zurückgesetzt beim nächsten)

    for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i];
        try {
            const raw = toBase64Url(buildMimeMessage(d));
            const resp = await fetch(GMAIL_DRAFTS_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: { raw } })
            });

            if (resp.status === 401) {
                cachedToken = null;
                if (reauthed) throw new Error('Anmeldung erforderlich.');
                reauthed = true;
                token = await getGoogleAccessToken({ forceReauth: true });
                i--; // diesen Entwurf erneut versuchen
                continue;
            }
            // 429 (Rate-Limit) und 403 (Quota/Rate ODER verweigerter Scope) sind beide
            // retrybar — aber GEDECKELT: ein dauerhafter 403 würde sonst denselben
            // Entwurf endlos wiederholen und die UI aufhängen.
            if (resp.status === 429 || resp.status === 403) {
                if (retryIndex !== i) { retryIndex = i; retries = 0; }
                if (retries < MAX_RETRIES) { retries++; await sleep(1500 * retries); i--; continue; }
                failed++;                  // dauerhaft blockiert → diesen Entwurf aufgeben
                onProgress(i + 1, total);
                continue;
            }
            if (resp.ok) created++; else failed++;
        } catch (err) {
            if (/Anmeldung erforderlich/.test(err.message)) throw err;
            failed++;
        }
        onProgress(i + 1, total);
    }
    return { created, failed };
}
