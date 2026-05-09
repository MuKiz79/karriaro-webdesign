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

    // -1) Security-Findings — wenn kritisch/hoch, ist das oft der konkreteste,
    //     unwiderruflichste Pitch-Anker. ("Ihr .git-Verzeichnis ist offen.")
    const security = data.security || null;
    if (security?.summary?.topPitch && (security.summary.critical > 0 || security.summary.high > 0)) {
        const top = security.findings.find(f => f.severity >= 4 && f.pitchArg) || security.findings[0];
        if (top) {
            args.push({
                type: 'security',
                severity: top.severity >= 5 ? 5 : 4,
                short: top.title || 'Sicherheits-Risiko',
                text: top.pitchArg || top.evidence,
                subjectAlt: `${domain}: ${top.title}`,
                evidence: top.evidence,
                fixAdvice: top.fixAdvice,
                category: top.category
            });
        }
    }

    // 0) Deep-Research-Schwächen — das stärkste, weil Sonnet das Material gesehen hat.
    //    Wir nehmen die Top-Severity-5-Schwäche als bestes Argument und nutzen
    //    keyPitchAngle als Subject-Default.
    const deep = data.deepAssessment || data.deepResearch?.assessment || null;
    if (deep && Array.isArray(deep.weaknesses) && deep.weaknesses.length > 0) {
        const sorted = [...deep.weaknesses].sort((a, b) => (b.severity || 0) - (a.severity || 0));
        const top = sorted[0];
        if (top && top.severity >= 4) {
            args.push({
                type: 'deep_research',
                severity: 5,
                short: top.title || 'Ganzheitliche Analyse',
                text: `${top.title}: ${top.evidence || ''}`.trim(),
                subjectAlt: deep.keyPitchAngle || `${domain}: ${top.title}`,
                evidence: top.evidence,
                category: top.category
            });
        }
    }

    // 1) Visueller Mockup-Vorschlag verfuegbar? Staerkster Hebel — der Inhaber
    //    sieht das Bild direkt in der Mail. Industrie-Reply-Rate: 15-25%.
    const visualMockup = data.mockup;
    if (visualMockup?.svgDataUrl && visualMockup?.spec?.hero?.headline) {
        const heroHeadline = visualMockup.spec.hero.headline;
        args.push({
            type: 'visual_mockup',
            severity: 5,
            short: 'Mockup im Anhang',
            text: `Ich habe Ihnen einen visuellen Entwurf einer neuen Seite fuer ${domain} gemacht — als Bild in dieser E-Mail. Der Vorschlag: "${heroHeadline}". Wenn Ihnen die Richtung gefaellt, sprechen wir 15 Minuten ueber die Umsetzung.`,
            subjectAlt: `Entwurf fuer ${domain}: ${heroHeadline}`,
            htmlSnippet: visualMockup.htmlSnippet || null,
            svgDataUrl: visualMockup.svgDataUrl
        });
    }

    // 1b) Legacy Mockup-Suggestion (nur Text, kein Bild) — Fallback
    const mockup = data.mockupSuggestion;
    if (!visualMockup?.svgDataUrl && mockup?.headline) {
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

    // HTML-Variante mit eingebettetem Mockup-Bild (wenn vorhanden) — kann
    // direkt in Gmail/Apple-Mail eingefuegt werden. Empfaenger sieht das Bild
    // ueber dem Text.
    const visualMockup = data.mockup;
    const mockupHtml = visualMockup?.htmlSnippet || '';
    const bodyHtml = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;line-height:1.55;color:#1d1d1f">
${mockupHtml ? mockupHtml + '<div style="height:16px"></div>' : ''}<p>${escapeHtmlSafe(greeting)}</p>
<p>${escapeHtmlSafe(primaryArg.text)}</p>
${supporting ? `<p style="color:#6e6e73">${escapeHtmlSafe(supporting)}</p>` : ''}
<p>Ich baue moderne Websites — handcodiert, ${escapeHtmlSafe(priceRange)}, ${escapeHtmlSafe(usp)}.</p>
<p>Darf ich Ihnen in 15 Minuten zeigen, wie Ihre neue Seite aussehen könnte? Keine Verpflichtung.</p>
<p>${escapeHtmlSafe(closing)}<br>${escapeHtmlSafe(senderName)}<br>${escapeHtmlSafe(senderCompany)}${profile.location ? '<br>' + escapeHtmlSafe(profile.location) : ''}<br><a href="https://${escapeHtmlSafe(portfolio)}" style="color:#0071e3">${escapeHtmlSafe(portfolio)}</a></p>
</div>`;

    return {
        tone,
        subject: primaryArg.subjectAlt,
        body,
        bodyHtml,
        hasVisualMockup: !!visualMockup?.svgDataUrl,
        copyText: `Betreff: ${primaryArg.subjectAlt}\n\n${body}`,
        wordCount: body.split(/\s+/).length
    };
}

function escapeHtmlSafe(s) {
    if (s == null) return '';
    return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":"&#39;"}[c]));
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
    // Konkurrenz-Spiegel: nur Branchen-Konkurrenten anzeigen (primaryType muss matchen).
    // Ohne diesen Filter kommen Tankstellen/Parkhaus/Event-Zentren als "Konkurrenz" eines
    // Immobilienmaklers — das macht den Pitch unglaubwuerdig.
    const targetType = data.place?.primaryType || null;
    const competitors = (data.competitors || []).filter(c =>
        c?.userRatingCount > 30 &&
        c.rating >= 4.0 &&
        (!targetType || c?.primaryType === targetType)
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
