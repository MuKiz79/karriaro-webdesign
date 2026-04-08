/**
 * 5-Schritt Follow-Up-Sequenz Generator
 */
export function generateSequence(domain, ws, tech, revenue) {
    const rev = revenue?.yearlyLoss || 0;
    return [
        { day: 1, subject: `${domain} — Ihre Website kostet Sie Kunden`, body: `Performance ${ws.perf}/100, SEO ${ws.seo}/100.${rev > 0 ? ' Geschätzter Verlust: ~'+rev.toLocaleString('de-DE')+'€/Jahr.' : ''} Darf ich zeigen wie Ihre neue Seite aussehen könnte?` },
        { day: 4, subject: 'Vorher/Nachher — so sah Spedition Kolbe aus', body: 'Konkretes Beispiel: karriaro-webdesign.de' },
        { day: 8, subject: ws.a11y < 70 ? 'BFSG: Barrierefreiheit seit 2025 Pflicht' : 'Google bevorzugt schnelle Websites', body: ws.a11y < 70 ? `Barrierefreiheit ${ws.a11y}/100.` : 'Core Web Vitals = 24% mehr Traffic.' },
        { day: 12, subject: `Kostenloser Entwurf für ${domain}`, body: '15-Minuten-Call, keine Verpflichtung.' },
        { day: 18, subject: 'Letzte Nachricht', body: `Ab 990€, fertig in 1-2 Wochen.${revenue?.roi > 1 ? ' ROI: '+revenue.roi+'x.' : ''}` }
    ];
}
