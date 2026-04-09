/**
 * #5 Technographic Depth — Erweiterte CMS/Tech-Erkennung
 * Version, Theme, Plugin-Anzahl, jQuery, PHP aus Network-Requests
 */

/**
 * Tiefe Technologie-Analyse aus PageSpeed-Daten
 * @param {Object} psiData - PageSpeed Insights Response
 * @param {Object} tech - Basis Tech-Detection
 * @returns {Object} Erweiterte Tech-Analyse
 */
export function analyzeTechDepth(psiData, tech) {
    const audits = psiData?.lighthouseResult?.audits || {};
    const netItems = audits['network-requests']?.details?.items || [];
    const allUrls = netItems.map(i => i.url || '').join('\n');

    const findings = [];
    let securityRisk = 0;
    let obsoleteScore = 0;

    // ── WordPress-Details ──
    if (tech?.cms?.includes('WordPress') || /wp-content|wp-includes/i.test(allUrls)) {
        // WordPress-Version
        const wpVersion = allUrls.match(/ver=(\d+\.\d+\.?\d*)/);
        if (wpVersion) {
            const v = parseFloat(wpVersion[1]);
            if (v < 6.0) {
                findings.push({ type: 'cms_version', label: `WordPress ${wpVersion[1]}`, risk: 'Sicherheitsupdates enden bald', severity: 'hoch' });
                securityRisk += 3;
                obsoleteScore += 3;
            } else if (v < 6.4) {
                findings.push({ type: 'cms_version', label: `WordPress ${wpVersion[1]}`, risk: 'Nicht die aktuelle Version', severity: 'mittel' });
                obsoleteScore += 1;
            }
        }

        // Theme erkennen
        const themeMatch = allUrls.match(/wp-content\/themes\/([a-zA-Z0-9_-]+)/i);
        if (themeMatch) {
            const theme = themeMatch[1];
            const oldThemes = ['flavor', 'flavor_flavoursome', 'flavor_flavour', 'flavoursome', 'flavor_flavourous'];
            findings.push({ type: 'theme', label: `Theme: ${theme}`, risk: null, severity: 'info' });
        }

        // Plugin-Anzahl
        const pluginMatches = allUrls.match(/wp-content\/plugins\/([a-zA-Z0-9_-]+)/gi);
        const uniquePlugins = pluginMatches ? [...new Set(pluginMatches.map(p => p.split('/').pop()))].length : 0;
        if (uniquePlugins > 15) {
            findings.push({ type: 'plugins', label: `${uniquePlugins} Plugins erkannt`, risk: 'Plugin-Bloat verlangsamt die Seite und erhöht Sicherheitsrisiken', severity: 'hoch' });
            securityRisk += 2;
            obsoleteScore += 2;
        } else if (uniquePlugins > 8) {
            findings.push({ type: 'plugins', label: `${uniquePlugins} Plugins erkannt`, risk: 'Überdurchschnittlich viele Plugins', severity: 'mittel' });
            obsoleteScore += 1;
        }
    }

    // ── jQuery-Version ──
    const jqMatch = allUrls.match(/jquery[.-](\d+\.\d+(?:\.\d+)?)/i) || allUrls.match(/jquery\.min\.js\?ver=(\d+\.\d+)/i);
    if (jqMatch) {
        const jqVer = jqMatch[1];
        const major = parseInt(jqVer);
        if (major <= 1) {
            findings.push({ type: 'js_lib', label: `jQuery ${jqVer}`, risk: 'Veraltet seit 2016 — Sicherheitslücken bekannt', severity: 'hoch' });
            securityRisk += 2;
            obsoleteScore += 3;
        } else if (major === 2) {
            findings.push({ type: 'js_lib', label: `jQuery ${jqVer}`, risk: 'End-of-Life seit 2019', severity: 'mittel' });
            obsoleteScore += 1;
        }
    }

    // ── Bootstrap-Version ──
    const bsMatch = allUrls.match(/bootstrap[.-\/](\d+\.\d+(?:\.\d+)?)/i);
    if (bsMatch) {
        const bsVer = parseInt(bsMatch[1]);
        if (bsVer <= 3) {
            findings.push({ type: 'css_fw', label: `Bootstrap ${bsMatch[1]}`, risk: 'Design-Framework von 2015 — sieht veraltet aus', severity: 'hoch' });
            obsoleteScore += 2;
        }
    }

    // ── Font Awesome Version ──
    const faMatch = allUrls.match(/font-?awesome[\/.-](\d)/i);
    if (faMatch && parseInt(faMatch[1]) <= 4) {
        findings.push({ type: 'icon_lib', label: `Font Awesome ${faMatch[1]}`, risk: 'Veraltete Icon-Bibliothek', severity: 'mittel' });
        obsoleteScore += 1;
    }

    // ── PHP-Version (aus Headers oder Patterns) ──
    const phpMatch = allUrls.match(/X-Powered-By:\s*PHP\/(\d+\.\d+)/i);
    if (phpMatch && parseFloat(phpMatch[1]) < 8.0) {
        findings.push({ type: 'server', label: `PHP ${phpMatch[1]}`, risk: 'Veraltete PHP-Version — Sicherheitsrisiko', severity: 'hoch' });
        securityRisk += 3;
    }

    // ── Gesamt-Bewertung ──
    const techAge = obsoleteScore >= 6 ? 'legacy' : obsoleteScore >= 3 ? 'veraltet' : obsoleteScore >= 1 ? 'akzeptabel' : 'modern';

    return {
        findings,
        techAge,
        obsoleteScore,
        securityRisk,
        pluginCount: findings.find(f => f.type === 'plugins')?.label?.match(/\d+/)?.[0] || 0,
        pitchArg: securityRisk >= 3
            ? `Ihre Website hat ${findings.filter(f => f.severity === 'hoch').length} Sicherheitsrisiken: ${findings.filter(f => f.severity === 'hoch').slice(0, 2).map(f => f.label).join(', ')}. Das sind konkrete Angriffspunkte.`
            : obsoleteScore >= 4
                ? `Die Technologie Ihrer Website ist veraltet: ${findings.filter(f => f.severity === 'hoch').map(f => f.label).join(', ')}. Eine moderne Basis würde Geschwindigkeit, Sicherheit und SEO sofort verbessern.`
                : null,
        funnelImpact: {
            interest: securityRisk >= 3 ? 3 : obsoleteScore >= 3 ? 2 : 0,
            close: obsoleteScore >= 4 ? 2 : 0
        }
    };
}
