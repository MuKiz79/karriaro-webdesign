/**
 * Outreach-Paket: bündelt alles, was zum Erst-Kontakt nötig ist, in
 * einem Objekt — E-Mail, Tech-Alter-Argument, Konkurrenz-Spiegel,
 * BFSG-Hinweis und (sofern verfügbar) Mockup-Vorschlag.
 *
 * Statt "noch eine Funktion" für jede Variante: ein konsolidiertes
 * Outreach-Objekt, das die UI direkt rendern kann und das per Copy /
 * Mailto / CRM-Save weiterverarbeitet wird.
 */

import { config } from '../config.js';
import { analyzeTechAge } from '../analysis/tech-age.js';

/**
 * Höchste Pitch-Schmerzen sortiert. Nicht jeder Eintrag ist immer
 * verfügbar — die Reihenfolge hier ist nach empirischer Pitch-Stärke
 * (B2B Cold Outreach Daten + Karriaro-Erfahrung), nicht nach Severity.
 */
function buildPainArguments(data, techAge) {
    const args = [];
    const ws = data.ws || {};
    const tech = data.tech || {};
    const rev = data.revenue;
    const domain = new URL(data.url).hostname.replace('www.', '');

    // 1) Mockup verfügbar? Stärkster Hebel — er sieht bereits etwas.
    const mockup = data.mockupSuggestion;
    if (mockup?.headline) {
        args.push({
            type: 'mockup',
            severity: 5,
            short: 'Entwurf liegt vor',
            text: `Ich habe einen Entwurf vorbereitet, wie Ihre neue Seite aussehen könnte: "${mockup.headline}". Schicke ich Ihnen die Vorschau zu?`,
            subjectAlt: `Entwurf für ${domain} — schicke ich Ihnen die Vorschau?`
        });
    }

    // 2) BFSG (rechtlicher Druck) — branchenabhängig, aber harter Treiber.
    if (data.bfsgScore?.risk === 'kritisch' || data.bfsgScore?.risk === 'hoch') {
        args.push({
            type: 'bfsg',
            severity: 5,
            short: `BFSG-Score ${data.bfsgScore.complianceScore}%`,
            text: `Ihre Website erfüllt nur ${data.bfsgScore.complianceScore}% der BFSG-Anforderungen. Das Gesetz gilt seit Juni 2025 — Bußgelder bis ${data.bfsgScore.fine}.`,
            subjectAlt: `BFSG-Risiko bei ${domain} — kurz prüfen?`
        });
    }

    // 3) Tech-Alter — der vom User gewünschte Anker.
    if (techAge.pitchArg) {
        args.push({
            type: 'tech_age',
            severity: techAge.severity,
            short: techAge.cms ? `${techAge.cms}${techAge.majorVersion ? ' ' + techAge.majorVersion + '.x' : ''}` : 'Veraltete Technik',
            text: techAge.pitchArg,
            subjectAlt: techAge.cmsEolYear
                ? `${domain}: ${techAge.cms} ${techAge.majorVersion}.x seit ${techAge.cmsEolYear} ohne Sicherheitsupdates`
                : `${domain} läuft auf ${techAge.cms}${techAge.majorVersion ? ' ' + techAge.majorVersion + '.x' : ''}`
        });
    }

    // 4) Konkurrenz-Spiegel
    const competitors = (data.competitors || []).filter(c =>
        c?.userRatingCount > 30 && c.rating >= 4.0
    ).slice(0, 3);
    if (competitors.length >= 2) {
        const names = competitors.map(c => c.displayName?.text || '—').join(', ');
        args.push({
            type: 'competitors',
            severity: 4,
            short: `${competitors.length} Konkurrenten verglichen`,
            text: `Ihre direkten Mitbewerber ${names} haben modernere Auftritte und ranken bei Google höher. Ein Vergleich der Schwachstellen erkläre ich gern in 15 Minuten.`,
            subjectAlt: `${domain}: Vergleich mit ${competitors.length} Konkurrenten`
        });
    }

    // 5) Umsatzverlust-Schätzung
    if (rev?.yearlyLoss > 2000) {
        args.push({
            type: 'revenue',
            severity: 4,
            short: `~${Math.round(rev.yearlyLoss / 1000)}K€ Verlust`,
            text: `Wir schätzen den jährlichen Umsatzverlust durch Website-Probleme auf ~${rev.yearlyLoss.toLocaleString('de-DE')}€.`,
            subjectAlt: `${domain} verliert ~${Math.round(rev.yearlyLoss / 1000)}K€/Jahr`
        });
    }

    // 6) Branchen-Standards-Lücken
    if (data.branchStandards?.missing?.length > 2) {
        const top = data.branchStandards.missing[0];
        args.push({
            type: 'branch',
            severity: 3,
            short: `${data.branchStandards.missing.length} Lücken`,
            text: `Ihrer Branchen-Website fehlen ${data.branchStandards.missing.length} Standard-Features die Kunden ${new Date().getFullYear()} erwarten — z.B. ${top.name}.`,
            subjectAlt: `${domain}: ${data.branchStandards.missing.length} Standard-Features fehlen`
        });
    }

    // 7) Performance / Mobile / SSL
    if (ws.perf < 40) {
        args.push({
            type: 'perf',
            severity: 3,
            short: `Perf ${ws.perf}/100`,
            text: `Google bewertet die Ladegeschwindigkeit mit ${ws.perf}/100 — kostet Sichtbarkeit und Kunden.`,
            subjectAlt: `${domain}: Google-Performance nur ${ws.perf}/100`
        });
    }
    if (!ws.isHttps) {
        args.push({
            type: 'ssl',
            severity: 4,
            short: 'SSL fehlt',
            text: `Der Browser zeigt "Nicht sicher" an — jeder Besucher sieht das.`,
            subjectAlt: `${domain}: Browser warnt Ihre Besucher`
        });
    }

    return args.sort((a, b) => b.severity - a.severity);
}

/**
 * Drei E-Mail-Tonalitäten — A/B-tauglich.
 */
function buildEmail(data, args, primaryArg, supportingArgs, profile, tone = 'professionell') {
    const domain = new URL(data.url).hostname.replace('www.', '');
    const recipientName = data.contactData?.owner || data.place?.displayName?.text || domain;
    const firstName = recipientName.split(' ')[0];

    const senderName = profile.name || 'Muammer Kizilaslan';
    const senderCompany = profile.company || 'Karriaro Webdesign';
    const priceRange = profile.priceRange || 'ab 990€';
    const usp = profile.usp || 'in 1–2 Wochen fertig';
    const portfolio = profile.portfolio || 'karriaro-webdesign.de';

    let greeting, closing;
    if (tone === 'freundlich') { greeting = `Hallo ${firstName},`; closing = `Herzliche Grüße`; }
    else if (tone === 'direkt') { greeting = `Guten Tag ${recipientName},`; closing = `Mit besten Grüßen`; }
    else { greeting = `Sehr geehrte/r ${recipientName},`; closing = `Mit freundlichen Grüßen`; }

    const supporting = supportingArgs.length > 0
        ? `Auch aufgefallen: ${supportingArgs.slice(0, 2).map(a => a.text).join(' ')}`
        : '';

    const body = `${greeting}

${primaryArg.text}

${supporting}

Ich baue moderne Websites — handcodiert, ${priceRange}, ${usp}.

Darf ich Ihnen in 15 Minuten zeigen, wie Ihre neue Seite aussehen könnte? Keine Verpflichtung.

${closing}
${senderName}
${senderCompany}
${profile.location ? profile.location + '\n' : ''}${portfolio}`.trim();

    return {
        tone,
        subject: primaryArg.subjectAlt,
        body,
        copyText: `Betreff: ${primaryArg.subjectAlt}\n\n${body}`,
        wordCount: body.split(/\s+/).length
    };
}

/**
 * Hauptfunktion — produziert ein vollständiges Outreach-Paket.
 */
export function buildOutreachPack(data) {
    const profile = config?.profile || {};
    const techAge = analyzeTechAge(data.tech || {}, data.wayback || {});
    const args = buildPainArguments(data, techAge);

    if (args.length === 0) {
        return {
            available: false,
            reason: 'Keine ausreichenden Schmerz-Signale für ein konkretes Outreach.'
        };
    }

    const primaryArg = args[0];
    const supportingArgs = args.slice(1);

    const variants = ['professionell', 'freundlich', 'direkt']
        .map(tone => buildEmail(data, args, primaryArg, supportingArgs, profile, tone));

    const domain = new URL(data.url).hostname.replace('www.', '');
    const competitors = (data.competitors || []).filter(c =>
        c?.userRatingCount > 30 && c.rating >= 4.0
    ).slice(0, 3);

    return {
        available: true,
        domain,
        recipientEmail: data.contactData?.allEmails?.[0] || `info@${domain}`,
        primaryArg,
        supportingArgs,
        allArgs: args,
        techAge,
        competitors: competitors.map(c => ({
            name: c.displayName?.text || '—',
            rating: c.rating,
            reviews: c.userRatingCount,
            website: c.websiteUri || null
        })),
        bfsgRisk: data.bfsgScore?.risk || null,
        mockupHeadline: data.mockupSuggestion?.headline || null,
        mockupSubline: data.mockupSuggestion?.subline || null,
        variants,
        // Standard-Variante für sofortiges Copy
        primary: variants[0],
        // Score-Werte für CRM-Integration
        leadScore: data.result?.leadScore || 0,
        composite: techAge.composite,
        bestPitchAngle: primaryArg.type
    };
}
