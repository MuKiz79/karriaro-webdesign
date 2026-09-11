/**
 * #2 Personalisierte E-Mail-Generator
 * Erzeugt einen E-Mail-ENTWURF basierend auf allen Lead-Daten (Profil + Analyse).
 * Ob er an den Betrieb gehen darf, entscheidet ausschliesslich das Kontakt-Gate
 * (outreach/kontakt-grundlage.js).
 *
 * Kein erratener Empfänger: Ohne gefundene Adresse bleibt `to` null. Eine
 * geratene info@<domain> war nie verifiziert und wanderte als contactEmail in
 * gespeicherte Leads.
 */
import { config, PREIS_EINSTIEG } from '../config.js';
import { httpsBefund, CHROME_HTTPS_WARNUNG } from '../analysis/trigger-events.js';

function ersteAdresse(contact) {
    const kandidaten = [
        ...(Array.isArray(contact?.allEmails) ? contact.allEmails : []),
        ...(Array.isArray(contact?.emails) ? contact.emails : []),
        ...(Array.isArray(contact?.genericEmails) ? contact.genericEmails : [])
    ];
    const e = kandidaten.find(x => typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim()));
    return e ? e.trim() : null;
}

/**
 * Generiert einen personalisierten E-Mail-Entwurf
 * @param {Object} data - state.lastResult (alle Analyse-Daten)
 * @returns {Object} { to:string|null, toHinweis:string|null, subject, body, copyText }
 */
export function generatePersonalEmail(data) {
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

    // Stärkstes Argument auswählen — Ad-Intent (zahlt für Anzeigen) führt, wenn vorhanden.
    const args = [];
    if (data.adIntent?.active) {
        const problem = ws.viewport === false ? 'auf dem Smartphone bricht'
            : (ws.perf != null && ws.perf < 50) ? 'langsam lädt'
            : tech.isBaukasten ? `auf ${tech.cms || 'einem Baukasten'} läuft`
            : ws.isHttps === false ? 'als „nicht sicher" angezeigt wird'
            : 'die bezahlten Besucher nicht überzeugt';
        args.push({ type: 'adspend', text: `Sie schalten Online-Anzeigen — aber die Seite, auf der Ihre bezahlten Besucher landen, ${problem}. Jeder bezahlte Klick verliert dadurch unnötig Wirkung.`, subject: `${domain}: Sie zahlen für Klicks, die abspringen` });
    }
    // 2026-08-14: Bußgeld-Drohung raus (§§ 1, 3 BFSG — gilt für die meisten Betriebe
    // gar nicht). Der Rechtssatz haengt jetzt an der serverseitig geprüften Lage.
    if (data.bfsgScore?.risk === 'hoch' || data.bfsgScore?.risk === 'kritisch') {
        const rh = data.bfsgScore.rechtsHinweis;
        args.push({
            type: rh ? 'legal' : 'quality',
            text: `Ihre Website erfüllt ${data.bfsgScore.complianceScore}% der geprüften WCAG-Kriterien für Barrierefreiheit. `
                + `Besucher, die die Schrift vergrößern oder per Tastatur bedienen, stoßen an mehreren Stellen an Grenzen.`
                + (rh ? ` ${rh}` : ''),
            subject: `${domain}: ${data.bfsgScore.complianceScore}% bei der Barrierefreiheit`
        });
    }
    if (data.branchStandards?.missing?.length > 2) {
        const top = data.branchStandards.missing[0];
        args.push({ type: 'branch', text: `Ihrer ${cp.branche || 'Branche'}-Website fehlen ${data.branchStandards.missing.length} Standard-Features die Kunden 2026 erwarten — z.B. ${top.name}.`, subject: `${domain}: ${data.branchStandards.missing.length} Features fehlen die Kunden erwarten` });
    }
    if (rev?.yearlyLoss > 1000) {
        args.push({ type: 'revenue', text: `Wir schätzen den jährlichen Umsatzverlust durch Website-Probleme auf rund ${(rev.pitchValue ?? rev.yearlyLoss).toLocaleString('de-DE')} €.`, subject: `${domain}: ungenutztes Umsatzpotenzial Ihrer Website` });
    }
    if (ws.perf < 40) {
        args.push({ type: 'perf', text: `Google bewertet die Ladegeschwindigkeit mit ${ws.perf}/100 — das kostet Sie Sichtbarkeit und Kunden.`, subject: `${domain}: Google-Performance nur ${ws.perf}/100` });
    }
    // 2026-09-11: siehe strategy/outreach.js — gemessen schlägt abgeleitet, kein „jeder Besucher".
    const hb = httpsBefund(ws, data.httpsCheck);
    if (hb.ohneHttps) {
        args.push({
            type: 'ssl',
            text: hb.gemessen
                ? `Ihre Seite ist nicht über HTTPS erreichbar. ${CHROME_HTTPS_WARNUNG}.`
                : `Ihre Seite lädt ohne HTTPS — Browser markieren sie als „Nicht sicher".`,
            subject: `${domain}: Browser markieren Ihre Seite als „Nicht sicher"`
        });
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
    // 2026-09-11: Anrede aus enrichContact (ownerAnrede/ownerTitel). Ohne erkannte Anrede
    // bleibt es formell bei der Sammelanrede statt „Sehr geehrte/r Vorname Nachname".
    const anrede = contact?.ownerAnrede === 'Herr' || contact?.ownerAnrede === 'Frau' ? contact.ownerAnrede : null;
    const nachname = contactPerson ? contactPerson.trim().split(/\s+/).slice(-1)[0] : '';
    const persoenlich = anrede && nachname ? `${anrede} ${contact?.ownerTitel ? contact.ownerTitel + ' ' : ''}${nachname}` : null;
    let greeting, closing;
    if (tone === 'freundlich') {
        greeting = persoenlich ? `Hallo ${persoenlich},` : `Guten Tag,`;
        closing = `Herzliche Grüße`;
    } else if (tone === 'direkt') {
        greeting = persoenlich ? `Guten Tag ${persoenlich},` : (contactPerson ? `Guten Tag ${contactPerson},` : `Guten Tag,`);
        closing = `Mit besten Grüßen`;
    } else {
        greeting = persoenlich ? `${anrede === 'Frau' ? 'Sehr geehrte' : 'Sehr geehrter'} ${persoenlich},` : `Sehr geehrte Damen und Herren,`;
        closing = `Mit freundlichen Grüßen`;
    }

    // Preis aus config.PREISE (eine Quelle); keine Lieferzeit-Zusage als Rückfall.
    const body = `${greeting}

${bestArg.text}

${args.length > 1 ? `Darüber hinaus: ${args.slice(1, 3).map(a => a.text).join(' ')}` : ''}

Ich baue moderne Websites — handcodiert, ${PREIS_EINSTIEG} einmalig${p.usp ? ', ' + p.usp : ''}.

Darf ich Ihnen in einem kurzen Gespräch zeigen, wie Ihre neue Website aussehen könnte? Sie sehen zuerst einen kostenfreien Entwurf — erst der Entwurf, dann Ihre Entscheidung.

${closing}
${senderName}
${senderCompany}
${p.location ? p.location + '\n' : ''}${p.portfolio ? p.portfolio : 'karriaro-webdesign.de'}`;

    const to = ersteAdresse(contact);
    return {
        to,
        toHinweis: to ? null : 'Keine E-Mail-Adresse gefunden — ohne gefundene Adresse gibt es keinen Empfänger.',
        subject: bestArg.subject,
        body: body.trim(),
        args,
        recipientName,
        copyText: `Betreff: ${bestArg.subject}\n\n${body.trim()}`
    };
}
