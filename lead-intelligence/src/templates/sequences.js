/**
 * Follow-up-Sequenz — Single Source of Truth.
 *
 * Früher lag die 5-Stufen-Sequenz inline in render-components.js und die
 * Touchpoint-Tage (4/8/12/18) dupliziert in reminders.js. Beides kommt jetzt
 * von hier: `buildSequence(data)` für die Mail-Texte, `SEQUENCE_STEPS`/
 * `TOUCHPOINTS` als Tag-/Label-Metadaten.
 *
 * @module templates/sequences
 */

/** Alle 5 Sequenz-Schritte inkl. Erstkontakt (Tag 1). */
export const SEQUENCE_STEPS = [
    { day: 1,  label: 'Erstkontakt' },
    { day: 4,  label: 'Erinnerung senden' },
    { day: 8,  label: 'Nachfassen (Case Study)' },
    { day: 12, label: 'Kostenlosen Entwurf anbieten' },
    { day: 18, label: 'Letzte Nachricht' }
];

/** Follow-up-Touchpoints = Sequenz OHNE den Erstkontakt (Tag 1). reminders.js nutzt das. */
export const TOUCHPOINTS = SEQUENCE_STEPS.filter(s => s.day > 1);

/**
 * Baut die 5-Stufen-Sequenz aus dem Analyse-`data`-Objekt (oder pitchInputs-
 * gemapptem data). Reine Funktion — kein DOM. Verhalten 1:1 wie die frühere
 * Inline-Definition in render-components.js (renderStrategy).
 *
 * @param {object} data  { url, ws:{perf,seo,a11y}, revenue:{yearlyLoss,roi} }
 * @returns {Array<{day:number, subject:string, body:string}>}
 */
export function buildSequence(data = {}) {
    const ws = data.ws || {};
    const rev = data.revenue || null;
    let domain = 'Ihre-Website';
    try { domain = new URL(data.url).hostname.replace('www.', ''); } catch { /* unvollständiges data */ }

    return [
        {
            day: 1,
            subject: `${domain} — Ihre Website kostet Sie Kunden`,
            body: `Performance ${ws.perf}/100, SEO ${ws.seo}/100.${rev?.yearlyLoss > 0 ? ' Geschätzter Verlust: rund ' + (rev.pitchValue ?? rev.yearlyLoss).toLocaleString('de-DE') + ' €/Jahr.' : ''} Darf ich Ihnen zeigen wie Ihre neue Seite aussehen könnte?`
        },
        {
            day: 4,
            subject: 'Vorher/Nachher — so sah Spedition Kolbe aus',
            body: 'Konkretes Beispiel: Vorher eine veraltete Standard-Seite, nachher ein moderner Auftritt. karriaro-webdesign.de'
        },
        {
            day: 8,
            // 2026-08-14: „Erste Abmahnungen laufen" war unbelegbar, „seit 2025 Pflicht"
            // gilt für die meisten Empfänger gar nicht (§§ 1, 3 BFSG). Ersetzt durch
            // den gemessenen Wert und seine Wirkung.
            subject: ws.a11y < 70 ? `Barrierefreiheit ${ws.a11y}/100 — wer bleibt draußen?` : 'Google bevorzugt schnelle Websites',
            body: ws.a11y < 70 ? `Ihre Seite erreicht ${ws.a11y}/100 bei der Barrierefreiheit. Wer die Schrift vergrößert oder per Tastatur bedient, kommt an mehreren Stellen nicht weiter.` : 'Websites die Core Web Vitals bestehen bekommen 24% mehr Traffic.'
        },
        {
            day: 12,
            subject: `Kostenloser Entwurf für ${domain}`,
            body: 'Darf ich Ihnen den Entwurf in einem 15-Minuten-Call zeigen? Keine Verpflichtung.'
        },
        {
            day: 18,
            subject: 'Letzte Nachricht',
            body: `Ab 990€, fertig in 1-2 Wochen.${rev?.roi > 1 ? ' Amortisiert sich in ' + Math.ceil(1990 / (rev.yearlyLoss / 12)) + ' Monaten.' : ''}`
        }
    ];
}
