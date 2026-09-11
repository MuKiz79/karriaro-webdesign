/**
 * Lead Nurturing Reminders — Follow-Up Checks
 * Liest aus localStorage (wird durch loadLeads() aus Firestore gesynct)
 *
 * Keine Erinnerung (2026-09-10):
 *   • Status geantwortet / interessiert / angebot / kunde / verloren — dort
 *     läuft ein Gespräch oder es ist vorbei; eine Nachfass-Mail wäre falsch.
 *   • Domain auf der Sperrliste oder Werbewiderspruch im Impressum.
 * Ob ein Folge-Entwurf überhaupt gesendet werden darf, entscheidet danach das
 * Kontakt-Gate im Outreach-Studio.
 */

import { TOUCHPOINTS } from '../templates/sequences.js';
import { loadSuppressionLocal, isSuppressed } from './suppression.js';
import { updateLead } from './leads.js';

/** Status, für die keine Nachfass-Erinnerung erscheint. */
export const STATUS_OHNE_ERINNERUNG = new Set(['geantwortet', 'interessiert', 'angebot', 'kunde', 'verloren']);

function leseLeads() {
    try {
        return JSON.parse(localStorage.getItem('karriaro_leads') || '[]');
    } catch (e) {
        console.warn('Leads in localStorage unlesbar — keine Erinnerungen:', e);
        return [];
    }
}

/**
 * @param {object} [opts]
 * @param {object[]} [opts.leads]    sonst aus localStorage
 * @param {number}   [opts.now]
 * @param {Set}      [opts.gesperrt] vorab geladene Sperrliste, sonst localStorage
 */
export function checkReminders({ leads = null, now = Date.now(), gesperrt = null } = {}) {
    const liste = Array.isArray(leads) ? leads : leseLeads();
    const sperre = gesperrt || loadSuppressionLocal();
    const due = [];

    for (const lead of liste) {
        if (!lead?.contactedAt) continue;
        if (STATUS_OHNE_ERINNERUNG.has(lead.status)) continue;
        if (lead.suppressed === true || lead.contactData?.werbewiderspruch === true) continue;
        if (isSuppressed(lead.domain, sperre)) continue;

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

/**
 * Erinnerung für einen Tag ausblenden. Über updateLead, damit der Stand auch in
 * Firestore landet — nur lokal geschrieben holte loadLeads() die Erinnerung beim
 * nächsten Laden zurück.
 * @returns {Promise<object>} Ergebnis von updateLead
 */
export async function dismissReminder(leadId, touchDay) {
    const tag = Number(touchDay);
    if (!leadId || !Number.isFinite(tag)) return { ok: false };
    return updateLead(leadId, { lastTouchDay: tag });
}
