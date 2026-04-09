/**
 * #14 WhatsApp / Telegram Business Check
 * Erkennt Messaging-Plattformen aus Website-Links und Network-Requests
 */

const MESSAGING_PATTERNS = [
    { key: 'whatsapp', pattern: /wa\.me\/|whatsapp\.com|api\.whatsapp|whatsapp-widget/i, name: 'WhatsApp Business', signal: 'Direkter Kundenkontakt über WhatsApp — sehr kundenorientiert', weight: 3 },
    { key: 'telegram', pattern: /t\.me\/|telegram\.org|telegram\.me/i, name: 'Telegram', signal: 'Nutzt Telegram für Kommunikation', weight: 1 },
    { key: 'whatsapp_click', pattern: /href=["']https?:\/\/wa\.me/i, name: 'WhatsApp Click-to-Chat', signal: 'WhatsApp-Link auf der Website — Kunden können direkt schreiben', weight: 3 },
    { key: 'calendly', pattern: /calendly\.com/i, name: 'Calendly', signal: 'Online-Terminbuchung — digital fortschrittlich', weight: 2 },
    { key: 'doctolib', pattern: /doctolib\.de|doctolib\.com/i, name: 'Doctolib', signal: 'Online-Terminbuchung für Ärzte/Therapeuten', weight: 2 },
    { key: 'treatwell', pattern: /treatwell\.de|treatwell\.com/i, name: 'Treatwell', signal: 'Online-Buchung für Beauty/Friseur', weight: 2 },
    { key: 'opentable', pattern: /opentable\.com|opentable\.de/i, name: 'OpenTable', signal: 'Online-Reservierung für Gastronomie', weight: 2 },
];

/**
 * Prüft Messaging- und Booking-Plattformen
 * @param {Object} psiData - PageSpeed Insights Response
 * @returns {Object} Gefundene Messaging-Plattformen
 */
export function checkMessaging(psiData) {
    const audits = psiData?.lighthouseResult?.audits || {};
    const netItems = audits['network-requests']?.details?.items || [];
    const allUrls = netItems.map(i => i.url || '').join(' ');

    const found = [];
    for (const mp of MESSAGING_PATTERNS) {
        if (mp.pattern.test(allUrls)) {
            found.push(mp);
        }
    }

    const hasWhatsApp = found.some(f => f.key === 'whatsapp' || f.key === 'whatsapp_click');
    const hasBooking = found.some(f => ['calendly', 'doctolib', 'treatwell', 'opentable'].includes(f.key));
    const score = found.reduce((s, f) => s + f.weight, 0);

    return {
        found: found.map(f => ({ name: f.name, signal: f.signal })),
        hasWhatsApp,
        hasBooking,
        platformCount: found.length,
        score,
        label: hasWhatsApp && hasBooking ? 'Sehr kundenorientiert — WhatsApp + Online-Buchung'
            : hasWhatsApp ? 'WhatsApp Business aktiv — direkter Kundenkontakt'
            : hasBooking ? 'Online-Buchung aktiv'
            : found.length > 0 ? `${found.length} Messaging-Plattform(en) erkannt`
            : 'Keine Messaging-Integration erkannt',
        pitchArg: !hasWhatsApp && !hasBooking
            ? 'Ihre Website bietet weder WhatsApp-Kontakt noch Online-Buchung. 73% der Kunden erwarten heute digitale Kontaktmöglichkeiten.'
            : null,
        funnelImpact: hasWhatsApp ? -1 : hasBooking ? -1 : 1 // Negativ = Lead hat es schon, weniger Bedarf
    };
}
