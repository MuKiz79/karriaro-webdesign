/**
 * Erreichbarkeits-Verifikation — implementiert den `verifyReachable`-Stub aus
 * PLAN-verifikation.md §1.2 (A3). Aus enrichContact (Impressum-Mail/Inhaber)
 * + checkEmailDeliverability (SPF/DKIM/DMARC) wird ein einheitliches Verdikt.
 *
 * Ein Lead, den man nicht erreichen kann, bekommt KEINEN Entwurf — das Gate
 * sitzt hier, nicht in der Generierung.
 *
 * @module verification/reachability
 */

/**
 * @param {object} args
 * @param {object|null} args.contact        enrichContact-Ergebnis
 *   { owner, emails[], genericEmails[], allEmails[], phones[], quality:'persönlich'|'generisch'|'none', contactScore }
 * @param {object|null} args.deliverability checkEmailDeliverability-Ergebnis
 *   { score, spf, dkim, dmarc, label }
 * @returns {{reachable:boolean, quality:string, evidenceState:string,
 *           email:string|null, owner:string|null, deliverability:object|null, note:string}}
 */
export function verifyReachable({ contact = null, deliverability = null } = {}) {
    const emails = [
        ...(contact?.allEmails || []),
        ...(contact?.emails || []),
        ...(contact?.genericEmails || [])
    ].filter(Boolean);
    const email = emails[0] || null;
    const quality = contact?.quality || 'none';
    const reachable = quality !== 'none' && !!email;

    let evidenceState, note;
    if (!contact) {
        evidenceState = 'fehler';
        note = 'Kontakt konnte nicht ermittelt werden (Impressum unlesbar oder Abruf fehlgeschlagen).';
    } else if (!reachable) {
        evidenceState = 'gemessen';
        note = 'Keine erreichbare E-Mail-Adresse im Impressum gefunden.';
    } else if (quality === 'persönlich') {
        evidenceState = 'gemessen';
        note = `Persönliche Adresse aus dem Impressum${contact.owner ? ' (' + contact.owner + ')' : ''}.`;
    } else {
        evidenceState = 'gemessen';
        note = 'Generische Geschäftsadresse (z. B. info@) aus dem Impressum.';
    }

    return {
        reachable,
        quality,
        evidenceState,
        email,
        owner: contact?.owner || null,
        deliverability: deliverability ? {
            score: deliverability.score ?? null,
            spf: !!deliverability.spf,
            dkim: !!deliverability.dkim,
            dmarc: !!deliverability.dmarc,
            label: deliverability.label || null
        } : null,
        note
    };
}
