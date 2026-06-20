/**
 * "Kennen wir schon?" — eine gemeinsame Dedup-Quelle für Scanner + Batch-Suche.
 * Umfasst gespeicherte CRM-Leads UND als erledigt/uninteressant markierte
 * Feedback-Domains, damit beide Tools dieselbe Definition nutzen.
 *
 * @module crm/known
 */
export function getAlreadyKnown() {
    const set = new Set();
    try {
        const leads = JSON.parse(localStorage.getItem('karriaro_leads') || '[]');
        for (const l of leads) if (l.domain) set.add(l.domain);
    } catch { /* leer/korrupt → ignorieren */ }
    try {
        const fb = JSON.parse(localStorage.getItem('karriaro_score_feedback') || '{"entries":[]}');
        for (const e of (fb.entries || [])) if (e.domain) set.add(e.domain);
    } catch { /* ignorieren */ }
    return set;
}
