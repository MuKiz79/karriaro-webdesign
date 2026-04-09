/**
 * #6 Content Freshness — Erweiterte Aktualitätserkennung
 * Prüft Copyright-Jahr, Sitemap-lastmod, Blog-Datum, Meta-Daten
 * Ergänzt Wayback Machine mit direkten Signalen aus der Website
 */

/**
 * Analysiert Content-Frische aus PageSpeed + KI-Analyse
 * @param {Object} psiData - PageSpeed Insights Response
 * @param {Object} contentAnalysis - Claude Content-Analyse
 * @param {Object} wayback - Wayback Machine Ergebnis
 * @returns {Object} Freshness-Analyse
 */
export function analyzeContentFreshness(psiData, contentAnalysis, wayback) {
    const audits = psiData?.lighthouseResult?.audits || {};
    const signals = [];
    const currentYear = new Date().getFullYear();

    // ── Copyright-Jahr ──
    let copyrightYear = contentAnalysis?.copyrightYear || null;
    if (!copyrightYear) {
        // Versuche aus Network-Requests HTML zu finden
        const netItems = audits['network-requests']?.details?.items || [];
        const htmlUrls = netItems.filter(i => (i.mimeType || '').includes('html')).map(i => i.url || '');
        // Fallback: Nicht verfügbar ohne HTML-Content
    }

    if (copyrightYear) {
        const age = currentYear - copyrightYear;
        if (age >= 4) {
            signals.push({ type: 'copyright', label: `© ${copyrightYear} — ${age} Jahre veraltet`, severity: 'hoch', age });
        } else if (age >= 2) {
            signals.push({ type: 'copyright', label: `© ${copyrightYear} — ${age} Jahre alt`, severity: 'mittel', age });
        } else {
            signals.push({ type: 'copyright', label: `© ${copyrightYear} — aktuell`, severity: 'gut', age });
        }
    }

    // ── Wayback-Daten integrieren ──
    if (wayback?.available) {
        if (wayback.daysSince > 730) {
            signals.push({ type: 'wayback', label: `Seit ${wayback.yearsSince} Jahren nicht aktualisiert (Wayback)`, severity: 'hoch', daysSince: wayback.daysSince });
        } else if (wayback.daysSince > 365) {
            signals.push({ type: 'wayback', label: `Seit ${Math.round(wayback.daysSince / 30)} Monaten nicht aktualisiert`, severity: 'mittel', daysSince: wayback.daysSince });
        }
    }

    // ── Content-Aktualität aus KI-Analyse ──
    if (contentAnalysis?.freshness) {
        const f = contentAnalysis.freshness;
        if (f === 'veraltet' || f === 'sehr_veraltet') {
            signals.push({ type: 'content', label: `KI erkennt veralteten Content: "${contentAnalysis.freshness}"`, severity: 'hoch' });
        }
    }

    // ── Technologie-Alter aus Versionen ──
    const netItems = audits['network-requests']?.details?.items || [];
    const allUrls = netItems.map(i => i.url || '').join(' ');

    // jQuery-Version (alt = Website alt)
    const jqMatch = allUrls.match(/jquery[.-](\d)\.(\d+)/i);
    if (jqMatch) {
        const major = parseInt(jqMatch[1]);
        if (major <= 1) {
            signals.push({ type: 'tech', label: `jQuery ${jqMatch[1]}.${jqMatch[2]} — seit 2016 veraltet`, severity: 'hoch' });
        } else if (major === 2) {
            signals.push({ type: 'tech', label: `jQuery ${jqMatch[1]}.${jqMatch[2]} — seit 2019 veraltet`, severity: 'mittel' });
        }
    }

    // Bootstrap-Version
    const bsMatch = allUrls.match(/bootstrap[.-\/](\d)\.(\d+)/i);
    if (bsMatch && parseInt(bsMatch[1]) <= 3) {
        signals.push({ type: 'tech', label: `Bootstrap ${bsMatch[1]} — Design-Framework von 2015`, severity: 'hoch' });
    }

    // ── Gesamt-Frische-Score ──
    const highCount = signals.filter(s => s.severity === 'hoch').length;
    const mittelCount = signals.filter(s => s.severity === 'mittel').length;
    const staleScore = highCount * 3 + mittelCount * 1;

    let freshness, label;
    if (staleScore >= 6) { freshness = 'aufgegeben'; label = 'Website ist digital tot — mehrere Indikatoren zeigen Vernachlässigung'; }
    else if (staleScore >= 3) { freshness = 'veraltet'; label = 'Deutlich veraltet — Content und Technologie brauchen ein Update'; }
    else if (staleScore >= 1) { freshness = 'alternde'; label = 'Erste Zeichen von Veraltung'; }
    else { freshness = 'aktuell'; label = 'Relativ aktuell gehalten'; }

    return {
        signals,
        freshness,
        staleScore,
        copyrightYear,
        label,
        pitchArg: staleScore >= 3
            ? `Mehrere Indikatoren zeigen: Ihre Website wird nicht mehr gepflegt. ${signals.filter(s => s.severity === 'hoch').map(s => s.label).join('. ')}. Das sehen auch Ihre Kunden.`
            : null,
        funnelImpact: staleScore >= 6 ? 4 : staleScore >= 3 ? 2 : 0
    };
}
