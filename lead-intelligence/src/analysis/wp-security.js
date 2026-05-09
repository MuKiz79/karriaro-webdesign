/**
 * #3 WordPress Security Risk Score
 *
 * 90% der WP-Vulnerabilities kommen von Plugins.
 * 67 neue Lücken pro Woche (Patchstack 2026).
 * "Ihre Website hat bekannte Sicherheitslücken" = stärkstes Argument nach BFSG.
 *
 * Erkennung aus PageSpeed Network-Requests (Plugin-Pfade, WP-Version)
 */

// Bekannte vulnerable Plugins (Top 20 mit den meisten CVEs 2025/2026)
const KNOWN_VULNERABLE = [
    { pattern: /elementor/i, name: 'Elementor', severity: 'hoch', cve: 'Mehrere kritische Lücken 2026' },
    { pattern: /contact-form-7/i, name: 'Contact Form 7', severity: 'mittel', cve: 'File Upload Vulnerability' },
    { pattern: /wpforms/i, name: 'WPForms', severity: 'hoch', cve: 'SQL Injection März 2026' },
    { pattern: /yoast/i, name: 'Yoast SEO', severity: 'mittel', cve: 'XSS Vulnerability 2026' },
    { pattern: /woocommerce/i, name: 'WooCommerce', severity: 'hoch', cve: 'Payment Bypass' },
    { pattern: /really-simple-ssl|rsssl/i, name: 'Really Simple SSL', severity: 'hoch', cve: 'Auth Bypass 2026' },
    { pattern: /wordfence/i, name: 'Wordfence', severity: 'niedrig', cve: 'Hat selbst Security, gut' },
    { pattern: /jetpack/i, name: 'Jetpack', severity: 'mittel', cve: 'Info Disclosure' },
    { pattern: /all-in-one-wp-migration/i, name: 'All-in-One Migration', severity: 'hoch', cve: 'Unauthenticated Access' },
    { pattern: /slider-revolution|revslider/i, name: 'Revolution Slider', severity: 'kritisch', cve: 'Historisch häufigstes Angriffsziel' },
    { pattern: /wp-file-manager/i, name: 'File Manager', severity: 'kritisch', cve: 'Remote Code Execution' },
    { pattern: /duplicator/i, name: 'Duplicator', severity: 'hoch', cve: 'Information Disclosure' },
    { pattern: /updraftplus/i, name: 'UpdraftPlus', severity: 'mittel', cve: 'Privilege Escalation' },
    { pattern: /ninja-forms/i, name: 'Ninja Forms', severity: 'mittel', cve: 'XSS' },
    { pattern: /gravityforms/i, name: 'Gravity Forms', severity: 'mittel', cve: 'PHP Object Injection' }
];

/**
 * Analysiert WordPress-Sicherheitsrisiken aus PageSpeed-Daten
 * @param {Object} psiData - PageSpeed Insights Response
 * @param {Object} tech - Tech-Detection Ergebnis
 * @returns {Object} Security Risk Assessment
 */
export function assessWPSecurity(psiData, tech) {
    // Nur für WordPress-Seiten relevant
    if (!tech?.cms?.includes('WordPress') && !/wp-content|wp-includes/i.test(JSON.stringify(psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items?.slice(0, 5) || []))) {
        return { available: false, isWordPress: false };
    }

    const netItems = psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || [];
    const allUrls = netItems.map(i => i.url || '').join('\n');

    // Plugins erkennen
    const pluginMatches = allUrls.match(/wp-content\/plugins\/([a-zA-Z0-9_-]+)/gi) || [];
    const uniquePlugins = [...new Set(pluginMatches.map(p => p.split('/').pop()))];
    const pluginCount = uniquePlugins.length;

    // Vulnerable Plugins erkennen
    const vulnerablePlugins = [];
    for (const vp of KNOWN_VULNERABLE) {
        if (vp.pattern.test(allUrls)) {
            vulnerablePlugins.push(vp);
        }
    }
    const criticalVulns = vulnerablePlugins.filter(v => v.severity === 'kritisch' || v.severity === 'hoch');

    // WP-Version: Single Source aus tech.version (siehe signals/tech-detect.js).
    // NICHT mehr selbst /ver=X/ matchen — das matcht zufaellige Plugin/jQuery-Versionen.
    const wpVersion = tech?.version || null;
    const isOutdatedWP = wpVersion && parseFloat(wpVersion) < 6.4;

    // Risk Score
    let riskScore = 0;
    riskScore += Math.min(20, pluginCount * 1.5); // Mehr Plugins = mehr Angriffsfläche
    riskScore += criticalVulns.length * 15;
    riskScore += vulnerablePlugins.length * 5;
    if (isOutdatedWP) riskScore += 20;
    if (pluginCount > 15) riskScore += 10; // Plugin-Bloat
    riskScore = Math.min(100, Math.round(riskScore));

    const riskLevel = riskScore >= 60 ? 'kritisch' : riskScore >= 35 ? 'hoch' : riskScore >= 15 ? 'mittel' : 'niedrig';

    // Pitch-Argument
    let pitchArg = null;
    if (riskLevel === 'kritisch' || riskLevel === 'hoch') {
        const vulnNames = criticalVulns.map(v => v.name).join(', ');
        pitchArg = `Ihre WordPress-Website hat ${criticalVulns.length} Plugin${criticalVulns.length > 1 ? 's' : ''} mit bekannten Sicherheitslücken${vulnNames ? ` (${vulnNames})` : ''}. ${isOutdatedWP ? `Dazu läuft WordPress ${wpVersion} — nicht mehr aktuell.` : ''} Das sind konkrete Angriffspunkte für Hacker.`;
    } else if (pluginCount > 15) {
        pitchArg = `${pluginCount} Plugins erkannt — jedes Plugin ist eine potenzielle Sicherheitslücke. Eine handcodierte Website eliminiert dieses Risiko komplett.`;
    }

    return {
        available: true,
        isWordPress: true,
        pluginCount,
        plugins: uniquePlugins,
        vulnerablePlugins,
        criticalVulns,
        wpVersion,
        isOutdatedWP,
        riskScore,
        riskLevel,
        pitchArg,
        label: `${riskLevel} (${riskScore}/100) · ${pluginCount} Plugins · ${criticalVulns.length} kritische Lücken`,
        funnelImpact: {
            interest: riskLevel === 'kritisch' ? 4 : riskLevel === 'hoch' ? 3 : 0,
            close: criticalVulns.length > 0 ? 2 : 0
        }
    };
}
