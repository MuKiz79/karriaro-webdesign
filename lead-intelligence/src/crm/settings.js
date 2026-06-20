/**
 * Cloud Settings — API Keys in Firestore persisted
 */
import { config, saveConfig } from '../config.js';
import { currentUser } from './firebase.js';

function fb() { return window.__firebase; }

export async function loadCloudSettings() {
    const user = currentUser();
    if (!user || !fb()?.db) return;
    try {
        const ref = fb().fns.doc(fb().db, 'leadSettings', user.uid);
        const snap = await fb().fns.getDoc(ref);
        if (snap.exists()) {
            const data = snap.data();
            if (data.psiKey) { config.psiKey = data.psiKey; localStorage.setItem('karriaro_psi_key', data.psiKey); }
            // Direkte cloudfunctions.net-URLs ignorieren — der Same-Origin-Proxy /api
            // (Default) umgeht CORS. So überschreibt ein alt gespeicherter Wert nichts.
            if (data.fnUrl && !data.fnUrl.includes('cloudfunctions.net')) { config.fnUrl = data.fnUrl; localStorage.setItem('karriaro_fn_url', data.fnUrl); }
        }
    } catch (e) { console.error('Load settings:', e); }
}

export async function saveCloudSettings() {
    const user = currentUser();
    if (!user || !fb()?.db) return;
    try {
        const ref = fb().fns.doc(fb().db, 'leadSettings', user.uid);
        await fb().fns.setDoc(ref, {
            psiKey: config.psiKey, fnUrl: config.fnUrl,
            updatedAt: fb().fns.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.error('Save settings:', e); }
}
