/**
 * #2 Personalisierte E-Mail-Generator
 * Generiert eine sofort sendbare E-Mail basierend auf allen Lead-Daten.
 * Nutzt Profil-Daten (SuperPrompt) + Lead-Analyse-Ergebnisse.
 */
import { config } from '../config.js';

/**
 * Generiert eine personalisierte Kalt-E-Mail
 * @param {Object} data - state.lastResult (alle Analyse-Daten)
 * @returns {Object} { subject, body, copyText }
 */
export function generatePersonalEmail(data) {
    const r = data.result;
    const ws = data.ws;
    const tech = data.tech;
    const domain = new URL(data.url).hostname.replace('www.', '');
    const cp = data.companyProfile || {};
    const rev = data.revenue;
    const contact = data.contactData;
    const p = config.profile;

    // Empfängername — nur ein echter Inhaber/Ansprechpartner trägt eine personalisierte Anrede.
    const contactPerson = contact?.owner || null;
    const recipientName = contactPerson || data.place?.displayName?.text || domain;
    const firstName = (contactPerson || '').split(' ')[0];

    // Stärkstes Argument auswählen
    const args = [];
    if (data.bfsgScore?.risk === 'hoch' || data.bfsgScore?.risk === 'kritisch') {
        args.push({ type: 'legal', text: `Ihre Website erfüllt nur ${data.bfsgScore.complianceScore}% der BFSG-Anforderungen. Seit Juni 2025 drohen Bußgelder bis ${data.bfsgScore.fine}.`, subject: `BFSG: ${domain} hat ein Compliance-Problem` });
    }
    if (data.branchStandards?.missing?.length > 2) {
        const top = data.branchStandards.missing[0];
        args.push({ type: 'branch', text: `Ihrer ${cp.branche || 'Branche'}-Website fehlen ${data.branchStandards.missing.length} Standard-Features die Kunden 2026 erwarten — z.B. ${top.name}.`, subject: `${domain}: ${data.branchStandards.missing.length} Features fehlen die Kunden erwarten` });
    }
    if (rev?.yearlyLoss > 2000) {
        args.push({ type: 'revenue', text: `Wir schätzen den jährlichen Umsatzverlust durch Website-Probleme auf rund ${(rev.pitchValue ?? rev.yearlyLoss).toLocaleString('de-DE')} €.`, subject: `${domain}: ungenutztes Umsatzpotenzial Ihrer Website` });
    }
    if (ws.perf < 40) {
        args.push({ type: 'perf', text: `Google bewertet die Ladegeschwindigkeit mit ${ws.perf}/100 — das kostet Sie Sichtbarkeit und Kunden.`, subject: `${domain}: Google-Performance nur ${ws.perf}/100` });
    }
    if (!ws.isHttps) {
        args.push({ type: 'ssl', text: `Der Browser zeigt "Nicht sicher" an — jeder Besucher sieht das.`, subject: `${domain}: Browser warnt Ihre Besucher` });
    }
    if (tech.isBaukasten) {
        args.push({ type: 'baukasten', text: `Ihre Website läuft auf ${tech.cms} — ein System das Design, Geschwindigkeit und SEO strukturell begrenzt.`, subject: `${domain}: Warum ${tech.cms} Sie ausbremst` });
    }

    // Bestes Argument wählen
    const bestArg = args[0] || { type: 'generic', text: `Ich habe mir ${domain} angeschaut und ein paar Optimierungsmöglichkeiten gefunden.`, subject: `${domain} — kurze Frage zu Ihrer Website` };

    // E-Mail generieren
    const senderName = p.name || 'Muammer Kizilaslan';
    const senderCompany = p.company || 'Karriaro Webdesign';
    const tone = p.tone || 'professionell';

    // Ohne echten Ansprechpartner ist die formelle Sammelanrede korrekt —
    // "Sehr geehrte/r <Firmenname>" liest sich wie eine Serienmail.
    let greeting, closing;
    if (tone === 'freundlich') {
        greeting = contactPerson ? `Hallo ${firstName},` : `Guten Tag,`;
        closing = `Herzliche Grüße`;
    } else if (tone === 'direkt') {
        greeting = contactPerson ? `Guten Tag ${contactPerson},` : `Guten Tag,`;
        closing = `Mit besten Grüßen`;
    } else {
        greeting = contactPerson ? `Sehr geehrte/r ${contactPerson},` : `Sehr geehrte Damen und Herren,`;
        closing = `Mit freundlichen Grüßen`;
    }

    const body = `${greeting}

${bestArg.text}

${args.length > 1 ? `Darüber hinaus: ${args.slice(1, 3).map(a => a.text).join(' ')}` : ''}

Ich baue moderne Websites — handcodiert, ${p.priceRange || 'ab 1.290€'}, ${p.usp || 'in 2 Wochen fertig'}.

Darf ich Ihnen in einem kurzen 15-Minuten-Call zeigen, wie Ihre neue Website aussehen könnte? Keine Verpflichtung.

${closing}
${senderName}
${senderCompany}
${p.location ? p.location + '\n' : ''}${p.portfolio ? p.portfolio : 'karriaro-webdesign.de'}`;

    return {
        to: contact?.allEmails?.[0] || `info@${domain}`,
        subject: bestArg.subject,
        body: body.trim(),
        args,
        recipientName,
        copyText: `Betreff: ${bestArg.subject}\n\n${body.trim()}`
    };
}
