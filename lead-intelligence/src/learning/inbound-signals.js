/**
 * Inbound-Heat-Score & Hot-Lead-Detection.
 *
 * Liest aus Firestore-Collection `auditRequests` (Inbound-Leads über
 * /audit Form). Berechnet pro Lead einen Heat-Score in [0..100] und
 * filtert auf 🔥 *Heiße Leads* zur prominenten Anzeige im CRM.
 *
 * "100%-Definition" (≈ Industrie-Standard ~85-95%):
 *   Inbound-Form-Fill + 2+ Page-Visits + recent (24h) + Tech-Severity ≥ 4
 *
 * Reine Leseschicht: keine Mutationen an auditRequests; das Schreibrecht
 * hat ausschliesslich die Cloud Function trackLeadView.
 */

const HOT_THRESHOLD = 60;
const VERY_HOT_THRESHOLD = 80;
const RECENT_HOURS = 24;

/**
 * Heat-Score-Formel.
 *   inboundFormFill * 30
 *   + min(visitCount, 5) * 8     // bis zu 40
 *   + (lastVisitWithin24h ? 20 : 0)
 *   + (techSeverity >= 4 ? 10 : 0)
 *
 * Eine Inbound-Form-Submission ist der starke Anker — ohne sie kommt der
 * Score nicht über 70. CTA-Klicks heben zusätzlich um 5 (max einmal).
 */
export function calculateHeat(lead, now = Date.now()) {
    const inbound = !!lead?.inbound;
    const visitCount = Math.max(0, Number(lead?.visitCount) || 0);
    const ctaClicks = Math.max(0, Number(lead?.ctaClicks) || 0);
    const lastVisitMs = Number(lead?.lastVisitAtMs) || 0;
    const techSeverity = Math.max(0, Math.min(5, Number(lead?.techSeverity) || 0));

    let heat = 0;
    if (inbound) heat += 30;
    heat += Math.min(visitCount, 5) * 8;
    if (lastVisitMs > 0 && now - lastVisitMs <= RECENT_HOURS * 3600000) heat += 20;
    if (techSeverity >= 4) heat += 10;
    if (ctaClicks > 0) heat += 5;

    heat = Math.max(0, Math.min(100, heat));

    return {
        heat,
        tier: heat >= VERY_HOT_THRESHOLD ? 'very_hot'
            : heat >= HOT_THRESHOLD ? 'hot'
            : heat >= 40 ? 'warm' : 'cold',
        verdict: heat >= VERY_HOT_THRESHOLD ? '🔥 Heißer Lead — sofort kontaktieren'
            : heat >= HOT_THRESHOLD ? '🔥 Warm — innerhalb 24h kontaktieren'
            : heat >= 40 ? 'Beobachten' : 'Kein Handlungsbedarf',
        components: { inbound, visitCount, ctaClicks, lastVisitMs, techSeverity, recent: lastVisitMs > 0 && now - lastVisitMs <= RECENT_HOURS * 3600000 }
    };
}

/**
 * Wandelt einen Firestore-auditRequests-Doc in einen Lead um, der dann
 * von calculateHeat verarbeitet werden kann.
 */
export function auditDocToLead(doc) {
    return {
        id: doc.id || doc.slug,
        slug: doc.slug || doc.id,
        domain: doc.domain || '',
        url: doc.url || '',
        name: doc.name || '',
        email: doc.email || '',
        leadScore: doc.leadScore || 0,
        techSeverity: doc.techAge?.severity ?? 0,
        techHeadline: doc.techAge?.headline || '',
        bfsgRisk: doc.bfsg?.risk || null,
        visitCount: doc.visitCount || 0,
        ctaClicks: doc.ctaClicks || 0,
        firstVisitAtMs: doc.firstVisitAt?.toMillis?.() || null,
        lastVisitAtMs: doc.lastVisitAtMs || doc.lastVisitAt?.toMillis?.() || 0,
        createdAtMs: doc.createdAtMs || doc.createdAt?.toMillis?.() || 0,
        inbound: doc.source === 'inbound_form' || doc.inbound === true
    };
}

/**
 * Bewertet eine Liste von auditRequests-Dokumenten, sortiert nach Heat
 * absteigend, gibt die Hot-Leads (heat >= HOT_THRESHOLD) zurück.
 */
export function rankHotLeads(auditDocs, now = Date.now()) {
    return auditDocs
        .map(d => {
            const lead = auditDocToLead(d);
            const score = calculateHeat(lead, now);
            return { ...lead, ...score };
        })
        .filter(l => l.heat >= HOT_THRESHOLD)
        .sort((a, b) => b.heat - a.heat || (b.lastVisitAtMs - a.lastVisitAtMs));
}

/**
 * Realtime-Subscription auf auditRequests. Ruft `callback(hotLeads, allLeads)`
 * jedes Mal, wenn sich etwas ändert (neuer Inbound, neuer Visit, neuer CTA-Klick).
 *
 * Erfordert window.__firebase.fns.onSnapshot, query, collection, orderBy, limit.
 * Liefert `unsubscribe()`-Funktion.
 */
export function subscribeToInboundLeads(fb, callback, opts = {}) {
    if (!fb?.db || !fb?.fns?.onSnapshot) {
        console.warn('inbound-signals: Firestore subscriber nicht verfügbar');
        return () => {};
    }
    const { fns, db } = fb;
    const limitN = opts.limit || 50;
    const ref = fns.collection(db, 'auditRequests');
    const q = fns.query(ref, fns.orderBy('createdAtMs', 'desc'), fns.limit(limitN));

    return fns.onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const hotLeads = rankHotLeads(docs);
        const allLeads = docs.map(d => {
            const lead = auditDocToLead(d);
            return { ...lead, ...calculateHeat(lead) };
        });
        callback(hotLeads, allLeads);
    }, (err) => {
        console.error('inbound-signals subscription error:', err);
    });
}

export const HEAT_CONSTANTS = {
    HOT_THRESHOLD,
    VERY_HOT_THRESHOLD,
    RECENT_HOURS
};
