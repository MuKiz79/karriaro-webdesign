/**
 * Lead Storage — Firestore + localStorage Fallback
 */
import { currentUser } from './firebase.js';

function fb() { return window.__firebase; }

export async function saveLead(domain, url, data) {
    // Always save to localStorage as backup
    const local = JSON.parse(localStorage.getItem('karriaro_leads') || '[]');
    const entry = { domain, url, ...data, status: 'neu', notes: '', savedAt: Date.now(), id: domain.replace(/[^a-zA-Z0-9]/g, '_') };
    const idx = local.findIndex(l => l.domain === domain);
    if (idx >= 0) local[idx] = { ...local[idx], ...entry };
    else local.push(entry);
    localStorage.setItem('karriaro_leads', JSON.stringify(local));

    // Firestore if logged in
    const user = currentUser();
    if (user && fb()?.db) {
        try {
            const id = domain.replace(/[^a-zA-Z0-9]/g, '_');
            const ref = fb().fns.doc(fb().db, 'leads', `${user.uid}_${id}`);
            await fb().fns.setDoc(ref, {
                uid: user.uid, domain, url,
                name: data.name || domain,
                type: data.type || '',
                rating: data.rating || null,
                reviews: data.reviews || 0,
                perf: data.perf || null,
                seo: data.seo || null,
                a11y: data.a11y || null,
                cms: data.cms || '',
                isBaukasten: data.isBaukasten || false,
                leadScore: data.leadScore || 0,
                conversionRate: data.conversionRate || 0,
                expectedValue: data.expectedValue || 0,
                status: 'neu', notes: '',
                savedAt: fb().fns.serverTimestamp(),
                updatedAt: fb().fns.serverTimestamp()
            }, { merge: true });
        } catch (e) { console.error('Firestore save:', e); }
    }
}

export async function loadLeads() {
    const user = currentUser();
    if (user && fb()?.db) {
        try {
            const q = fb().fns.query(
                fb().fns.collection(fb().db, 'leads'),
                fb().fns.where('uid', '==', user.uid)
            );
            const snap = await fb().fns.getDocs(q);
            const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            leads.sort((a, b) => (b.savedAt?.toMillis?.() || b.savedAt || 0) - (a.savedAt?.toMillis?.() || a.savedAt || 0));
            return leads;
        } catch (e) { console.error('Firestore load:', e); }
    }
    const local = JSON.parse(localStorage.getItem('karriaro_leads') || '[]');
    local.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return local;
}

export async function updateLead(leadId, updates) {
    const user = currentUser();
    if (!user || !fb()?.db) return;
    try {
        const ref = fb().fns.doc(fb().db, 'leads', leadId);
        await fb().fns.updateDoc(ref, { ...updates, updatedAt: fb().fns.serverTimestamp() });
    } catch (e) { console.error('Update lead:', e); }
}

export async function deleteLead(leadId) {
    const user = currentUser();
    if (!user || !fb()?.db) return;
    try {
        await fb().fns.deleteDoc(fb().fns.doc(fb().db, 'leads', leadId));
    } catch (e) { console.error('Delete lead:', e); }
}
