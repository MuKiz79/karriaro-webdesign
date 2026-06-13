/**
 * Lead Storage — Firestore + localStorage Dual-Sync
 */
import { currentUser } from './firebase.js';

function fb() { return window.__firebase; }

// ── Helper: localStorage lesen/schreiben ──
function getLocal() { return JSON.parse(localStorage.getItem('karriaro_leads') || '[]'); }
function setLocal(leads) { localStorage.setItem('karriaro_leads', JSON.stringify(leads)); }

export async function saveLead(domain, url, data) {
    const id = domain.replace(/[^a-zA-Z0-9]/g, '_');
    const entry = {
        domain, url, ...data,
        status: 'neu', notes: '',
        savedAt: Date.now(),
        updatedAt: Date.now(),
        id
    };

    // localStorage — immer
    const local = getLocal();
    const idx = local.findIndex(l => l.domain === domain);
    if (idx >= 0) {
        // Bestehendes Lead updaten, Status/Notes behalten
        local[idx] = { ...local[idx], ...entry, status: local[idx].status || 'neu', notes: local[idx].notes || '' };
    } else {
        local.push(entry);
    }
    setLocal(local);

    // Firestore
    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true };
    try {
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
            // Outreach-Felder additiv — nur schreiben wenn vorhanden (Firestore
            // verträgt kein undefined; pitchInputs/contact werden via clean() bereits
            // undefined-frei geliefert).
            ...(data.pitchInputs ? { pitchInputs: data.pitchInputs } : {}),
            ...(data.outreachStatus ? { outreachStatus: data.outreachStatus } : {}),
            ...(data.contact ? { contact: data.contact } : {}),
            ...(data.aiTier ? { aiTier: data.aiTier } : {}),
            savedAt: fb().fns.serverTimestamp(),
            updatedAt: fb().fns.serverTimestamp()
        }, { merge: true });
        return { ok: true, firestoreSynced: true };
    } catch (e) {
        console.error('Firestore save:', e);
        return { ok: true, firestoreSynced: false, firestoreError: e?.message || String(e) };
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
            const leads = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id, ...data,
                    // Firestore Timestamps → Millisekunden normalisieren
                    savedAt: data.savedAt?.toMillis?.() || data.savedAt || 0,
                    updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || 0,
                    contactedAt: data.contactedAt?.toMillis?.() || data.contactedAt || null
                };
            });
            // Sync nach localStorage für Offline + Reminders
            setLocal(leads);
            leads.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
            return leads;
        } catch (e) { console.error('Firestore load:', e); }
    }
    const local = getLocal();
    local.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return local;
}

export async function updateLead(leadId, updates) {
    // localStorage updaten (immer)
    const local = getLocal();
    const idx = local.findIndex(l => l.id === leadId);
    if (idx >= 0) {
        local[idx] = { ...local[idx], ...updates, updatedAt: Date.now() };
        // Automatisch contactedAt setzen wenn Status → kontaktiert
        if (updates.status === 'kontaktiert' && !local[idx].contactedAt) {
            local[idx].contactedAt = Date.now();
        }
        setLocal(local);
    }

    // Firestore
    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true };
    try {
        const firestoreUpdates = { ...updates, updatedAt: fb().fns.serverTimestamp() };
        if (updates.status === 'kontaktiert') {
            firestoreUpdates.contactedAt = fb().fns.serverTimestamp();
        }
        const ref = fb().fns.doc(fb().db, 'leads', leadId);
        await fb().fns.updateDoc(ref, firestoreUpdates);
        return { ok: true, firestoreSynced: true };
    } catch (e) {
        console.error('Update lead:', e);
        return { ok: true, firestoreSynced: false, firestoreError: e?.message || String(e) };
    }
}

export async function deleteLead(leadId) {
    // localStorage
    const local = getLocal();
    const filtered = local.filter(l => l.id !== leadId);
    setLocal(filtered);

    // Firestore
    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true };
    try {
        await fb().fns.deleteDoc(fb().fns.doc(fb().db, 'leads', leadId));
        return { ok: true, firestoreSynced: true };
    } catch (e) {
        console.error('Delete lead:', e);
        return { ok: true, firestoreSynced: false, firestoreError: e?.message || String(e) };
    }
}

// ── Alle Leads löschen ──
// onProgress(done, total) ist optional — Caller kann Fortschritt anzeigen.
// Firestore-Deletes laufen in 10er-Chunks parallel, damit 200+ Leads nicht 16 s blocken.
export async function deleteAllLeads(onProgress = null) {
    // localStorage leeren
    setLocal([]);

    // Firestore: alle Leads des Users löschen
    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true, deleted: 0 };
    try {
        const q = fb().fns.query(
            fb().fns.collection(fb().db, 'leads'),
            fb().fns.where('uid', '==', user.uid)
        );
        const snap = await fb().fns.getDocs(q);
        const docs = snap.docs;
        const total = docs.length;
        let done = 0;
        const CHUNK = 10;
        for (let i = 0; i < docs.length; i += CHUNK) {
            const chunk = docs.slice(i, i + CHUNK);
            await Promise.all(chunk.map(d => fb().fns.deleteDoc(d.ref)));
            done += chunk.length;
            if (typeof onProgress === 'function') onProgress(done, total);
        }
        return { ok: true, firestoreSynced: true, deleted: done };
    } catch (e) {
        console.error('Delete all leads:', e);
        return { ok: true, firestoreSynced: false, firestoreError: e?.message || String(e) };
    }
}

// ── CSV Export ──
export function exportCSV(leads) {
    const headers = ['Domain', 'Name', 'Branche', 'Score', 'Conversion%', 'EV€', 'Performance', 'SEO', 'A11y', 'CMS', 'Status', 'Notizen', 'Gespeichert'];
    const rows = leads.map(l => [
        l.domain, l.name || '', l.type || '', l.leadScore || 0, l.conversionRate || 0,
        l.expectedValue || 0, l.perf || '', l.seo || '', l.a11y || '', l.cms || '',
        l.status || '', (l.notes || '').replace(/"/g, '""'),
        l.savedAt ? new Date(l.savedAt).toLocaleDateString('de-DE') : ''
    ]);
    const csv = [headers.join(';'), ...rows.map(r => r.map(v => `"${v}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
