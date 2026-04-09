/**
 * #10 Schema.org / Structured Data Check
 * Lokale Unternehmen brauchen LocalBusiness Schema für Rich Results
 */

const IMPORTANT_SCHEMAS = [
    { type: 'LocalBusiness', name: 'LocalBusiness Schema', impact: 'Google zeigt Öffnungszeiten, Adresse, Bewertungen direkt in der Suche', weight: 3 },
    { type: 'Organization', name: 'Organization Schema', impact: 'Google versteht das Unternehmen als Entität', weight: 2 },
    { type: 'WebSite', name: 'Website Schema', impact: 'Ermöglicht Sitelinks in Google', weight: 1 },
    { type: 'BreadcrumbList', name: 'Breadcrumbs', impact: 'Bessere Navigation in Google-Ergebnissen', weight: 1 },
    { type: 'FAQPage', name: 'FAQ Schema', impact: 'FAQ direkt in Google — mehr Platz in Suchergebnissen', weight: 2 },
    { type: 'OpeningHoursSpecification', name: 'Öffnungszeiten', impact: 'Zeigt Öffnungszeiten in Google direkt an', weight: 2 },
    { type: 'Review', name: 'Review Schema', impact: 'Sterne in Google-Ergebnissen', weight: 2 },
    { type: 'Product', name: 'Product Schema', impact: 'Preise in Google-Ergebnissen', weight: 1 },
    { type: 'Service', name: 'Service Schema', impact: 'Dienstleistungen in Google-Ergebnissen', weight: 1 },
];

/**
 * Prüft Schema.org Structured Data aus Lighthouse
 * @param {Object} psiData - PageSpeed Insights Response
 * @returns {Object} Schema-Check Ergebnis
 */
export function checkSchema(psiData) {
    const audits = psiData?.lighthouseResult?.audits || {};

    // Lighthouse structured-data Audit
    const sdAudit = audits['structured-data'] || {};
    const hasStructuredData = sdAudit.score !== 0;

    // Erkenne Schemas aus Network-Requests und HTML
    const netItems = audits['network-requests']?.details?.items || [];
    const allUrls = netItems.map(i => i.url || '').join(' ');

    // Suche nach JSON-LD oder Microdata-Hinweisen
    const foundSchemas = [];
    const missingSchemas = [];

    for (const schema of IMPORTANT_SCHEMAS) {
        // Prüfe ob Schema-Typ in den Daten vorkommt
        const typePattern = new RegExp(`"@type"\\s*:\\s*"${schema.type}"`, 'i');
        const found = typePattern.test(allUrls) || typePattern.test(JSON.stringify(audits));

        if (found) {
            foundSchemas.push(schema);
        } else {
            missingSchemas.push(schema);
        }
    }

    // Score
    const totalWeight = IMPORTANT_SCHEMAS.reduce((s, sc) => s + sc.weight, 0);
    const foundWeight = foundSchemas.reduce((s, sc) => s + sc.weight, 0);
    const score = Math.round(foundWeight / totalWeight * 100);

    // Die wichtigsten fehlenden
    const criticalMissing = missingSchemas.filter(s => s.weight >= 2);

    return {
        score,
        hasStructuredData,
        foundSchemas: foundSchemas.map(s => s.name),
        missingSchemas: missingSchemas.map(s => ({ name: s.name, impact: s.impact })),
        criticalMissing,
        pitchArg: criticalMissing.length >= 2
            ? `Ihrer Website fehlen ${criticalMissing.length} wichtige Structured-Data-Markierungen (${criticalMissing.slice(0, 2).map(s => s.name).join(', ')}). Dadurch zeigt Google weniger Informationen in den Suchergebnissen — Ihre Konkurrenz bekommt den Klick.`
            : null,
        funnelImpact: criticalMissing.length >= 3 ? 2 : criticalMissing.length >= 1 ? 1 : 0
    };
}
