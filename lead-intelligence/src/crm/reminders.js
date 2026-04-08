/**
 * Lead Nurturing Reminders — Follow-Up Checks
 */

export function checkReminders() {
    const leads = JSON.parse(localStorage.getItem('karriaro_leads') || '[]');
    const now = Date.now();
    const due = [];

    for (const lead of leads) {
        if (!lead.contactedAt || lead.status === 'kunde' || lead.status === 'verloren') continue;
        const daysSince = (now - lead.contactedAt) / (1000 * 60 * 60 * 24);
        const touchpoints = [4, 8, 12, 18];
        const nextTouch = touchpoints.find(t => daysSince >= t - 0.5 && daysSince <= t + 1);
        if (nextTouch && lead.lastTouchDay !== nextTouch) {
            due.push({ ...lead, touchDay: nextTouch, daysSince: Math.round(daysSince) });
        }
    }
    return due;
}
