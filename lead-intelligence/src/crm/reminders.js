/**
 * Lead Nurturing Reminders — Follow-Up Checks
 * Liest aus localStorage (wird durch loadLeads() aus Firestore gesynct)
 */

const TOUCHPOINTS = [
    { day: 4,  label: 'Erinnerung senden' },
    { day: 8,  label: 'Nachfassen (Case Study)' },
    { day: 12, label: 'Kostenlosen Entwurf anbieten' },
    { day: 18, label: 'Letzte Nachricht' }
];

export function checkReminders() {
    const leads = JSON.parse(localStorage.getItem('karriaro_leads') || '[]');
    const now = Date.now();
    const due = [];

    for (const lead of leads) {
        if (!lead.contactedAt) continue;
        if (lead.status === 'kunde' || lead.status === 'verloren') continue;

        const daysSince = (now - lead.contactedAt) / (1000 * 60 * 60 * 24);

        for (const tp of TOUCHPOINTS) {
            if (daysSince >= tp.day - 0.5 && daysSince <= tp.day + 2) {
                if (lead.lastTouchDay === tp.day) continue;
                due.push({
                    ...lead,
                    touchDay: tp.day,
                    touchLabel: tp.label,
                    daysSince: Math.round(daysSince)
                });
                break;
            }
        }
    }

    return due.sort((a, b) => a.daysSince - b.daysSince);
}

export function dismissReminder(leadId, touchDay) {
    const leads = JSON.parse(localStorage.getItem('karriaro_leads') || '[]');
    const idx = leads.findIndex(l => l.id === leadId);
    if (idx >= 0) {
        leads[idx].lastTouchDay = touchDay;
        localStorage.setItem('karriaro_leads', JSON.stringify(leads));
    }
}
