/**
 * Follow-up-Sequenz — Single Source of Truth.
 *
 * Früher lag die 5-Stufen-Sequenz inline in render-components.js und die
 * Touchpoint-Tage (4/8/12/18) dupliziert in reminders.js. Beides kommt jetzt
 * von hier: `buildSequence(data)` für die Mail-Texte, `SEQUENCE_STEPS`/
 * `TOUCHPOINTS` als Tag-/Label-Metadaten.
 *
 * Die Texte sind Vorlagen. Ob sie an einen Betrieb gehen dürfen, entscheidet das
 * Kontakt-Gate (outreach/kontakt-grundlage.js) — nie die Sequenz.
 *
 * @module templates/sequences
 */
import { PREISE, PREIS_EINSTIEG } from '../config.js';

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
 * gemapptem data). Reine Funktion — kein DOM.
 *
 * @param {object} data  { url, ws:{perf,seo,a11y}, revenue:{yearlyLoss,roi} }
 * @returns {Array<{day:number, subject:string, body:string}>}
 */
export function buildSequence(data = {}) {
    const ws = data.ws || {};
    const rev = data.revenue || null;
    let domain = 'Ihre-Website';
    try { domain = new URL(data.url).hostname.replace('www.', ''); } catch { /* unvollständiges data */ }

    // Amortisation nur als ausgewiesene Schätzung und gegen denselben Einstiegspreis,
    // den der Text nennt (vorher: „ab 990 €" im Text, 1.990 € in der Rechnung).
    const monatsVerlust = rev?.yearlyLoss > 0 ? rev.yearlyLoss / 12 : 0;
    const amortisation = rev?.roi > 1 && monatsVerlust > 0
        ? ` Nach unserer Schätzung trägt sich das in rund ${Math.ceil(PREISE.essential.betrag / monatsVerlust)} Monaten.`
        : '';

    return [
        {
            day: 1,
            subject: `${domain} — Ihre Website kostet Sie Kunden`,
            body: `Performance ${ws.perf}/100, SEO ${ws.seo}/100.${rev?.yearlyLoss > 0 ? ' Geschätzter Verlust: rund ' + (rev.pitchValue ?? rev.yearlyLoss).toLocaleString('de-DE') + ' €/Jahr.' : ''} Darf ich Ihnen zeigen wie Ihre neue Seite aussehen könnte?`
        },
        {
            day: 4,
            // 2026-09-10: war „so sah Spedition Kolbe aus" mit einem Vorher/Nachher —
            // im Website-Repo gibt es dafür keinen Beleg als Kundenprojekt. Jetzt der
            // Verweis auf die eigene Seite, ohne Referenz-Behauptung.
            subject: `${domain} — so könnte ein moderner Auftritt aussehen`,
            body: 'Beispiele für handcodierte Websites finden Sie auf karriaro-webdesign.de.'
        },
        {
            day: 8,
            // 2026-08-14: „Erste Abmahnungen laufen" war unbelegbar, „seit 2025 Pflicht"
            // gilt für die meisten Empfänger gar nicht (§§ 1, 3 BFSG). Ersetzt durch
            // den gemessenen Wert und seine Wirkung.
            subject: ws.a11y < 70 ? `Barrierefreiheit ${ws.a11y}/100 — wer bleibt draußen?` : 'Google bevorzugt schnelle Websites',
            // 2026-09-10: „24% mehr Traffic" verdrehte die Google-Aussage (weniger
            // Abbrüche beim Laden, vgl. webdesign/src/website-check.html).
            body: ws.a11y < 70 ? `Ihre Seite erreicht ${ws.a11y}/100 bei der Barrierefreiheit. Wer die Schrift vergrößert oder per Tastatur bedient, kommt an mehreren Stellen nicht weiter.` : 'Laut Google brechen Besucher das Laden einer Seite, die die Core Web Vitals erfüllt, um 24 % seltener ab.'
        },
        {
            day: 12,
            // Wortlaut wie in allen übrigen Ausgängen: „kostenfreier Entwurf".
            subject: `Ein kostenfreier Entwurf für ${domain}`,
            body: 'Sie sehen zuerst einen kostenfreien Entwurf — erst der Entwurf, dann Ihre Entscheidung. Darf ich ihn Ihnen in einem 15-Minuten-Gespräch zeigen?'
        },
        {
            day: 18,
            subject: 'Letzte Nachricht',
            body: `Handcodiert, ${PREIS_EINSTIEG} einmalig, kein Abo.${amortisation}`
        }
    ];
}
