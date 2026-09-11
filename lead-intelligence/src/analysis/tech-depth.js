/**
 * #5 Technographic Depth — Erweiterte CMS/Tech-Erkennung
 * Version, Theme, Plugin-Anzahl, jQuery, PHP (gemessen via adEvidence)
 */
import { bewerteCmsVersion, kanonischerCmsName } from './tech-age.js';
import { phpBefund } from './trigger-events.js';

/**
 * Tiefe Technologie-Analyse aus PageSpeed-Daten
 * @param {Object} psiData - PageSpeed Insights Response
 * @param {Object} tech - Basis Tech-Detection (ggf. um adEvidence.techVersion ergänzt)
 * @param {{php?:{version:string|null, eol:boolean|null, eolDatum:string|null}|null,
 *          hoster?:{name:'strato'|'ionos'|null, quelle:string|null}|null, jetzt?:Date}} [extra]
 *        php/hoster aus adEvidence (EVIDENCE_SCHEMA 3). null = nicht gemessen.
 * @returns {Object} Erweiterte Tech-Analyse
 */
export function analyzeTechDepth(psiData, tech, { php = null, hoster = null, jetzt = new Date() } = {}) {
    const audits = psiData?.lighthouseResult?.audits || {};
    const netItems = audits['network-requests']?.details?.items || [];
    const allUrls = netItems.map(i => i.url || '').join('\n');

    const findings = [];
    let securityRisk = 0;
    let obsoleteScore = 0;

    // ── WordPress-Details ──
    if (tech?.cms?.includes('WordPress') || /wp-content|wp-includes/i.test(allUrls)) {
        // WordPress-Version: Single Source aus tech.version (siehe signals/tech-detect.js).
        // NICHT mehr selbst /ver=X/ matchen — das matcht zufaellige Plugin/jQuery-Versionen.
        const wpVersion = tech?.version || null;
        if (wpVersion) {
            // ⚠️ KORREKTUR 2026-09-10: vorher „< 6.0 → Sicherheitsupdates enden bald"
            // für JEDE Version unter 6. Jetzt die datierte Support-Tabelle: ab 4.7
            // erscheinen weiter Sicherheitsupdates — dort höchstens „nicht aktuell".
            const sv = bewerteCmsVersion('WordPress', wpVersion, jetzt);
            const [maj, min] = String(wpVersion).split('.').map(n => parseInt(n, 10));
            if (sv.eol) {
                findings.push({ type: 'cms_version', label: `WordPress ${wpVersion}`, risk: sv.text, severity: 'hoch', datum: sv.eolDatum });
                securityRisk += 3;
                obsoleteScore += 3;
            } else if (sv.status === 'nicht-aktuell') {
                findings.push({ type: 'cms_version', label: `WordPress ${wpVersion}`, risk: 'Nicht die aktuelle Hauptversion', severity: 'mittel' });
                obsoleteScore += 1;
            } else if (maj === 6 && Number.isFinite(min) && min < 4) {
                findings.push({ type: 'cms_version', label: `WordPress ${wpVersion}`, risk: 'Nicht die aktuelle Version', severity: 'mittel' });
                obsoleteScore += 1;
            }
        }

        // Theme erkennen
        const themeMatch = allUrls.match(/wp-content\/themes\/([a-zA-Z0-9_-]+)/i);
        if (themeMatch) {
            const theme = themeMatch[1];
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
    } else if (tech?.cms && tech?.version && !tech.isBaukasten) {
        // ── Andere CMS mit gemessener Version (Joomla/TYPO3/Contao/Shopware/…,
        //    Version aus adEvidence.techVersion) — gleiche Tabelle. ──
        const sv = bewerteCmsVersion(tech.cms, tech.version, jetzt);
        if (sv.eol) {
            findings.push({ type: 'cms_version', label: `${kanonischerCmsName(tech.cms)} ${tech.version}`, risk: sv.text, severity: 'hoch', datum: sv.eolDatum });
            securityRisk += 3;
            obsoleteScore += 3;
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

    // ── PHP-Version (gemessen, adEvidence.php) ──
    // ⚠️ KORREKTUR 2026-09-10: Die alte Erkennung suchte „X-Powered-By: PHP/x" in
    // einer Liste von Request-URLs — ein Header steht dort nie, die Prüfung hat
    // also in keinem einzigen Lauf etwas gefunden. Jetzt die serverseitige
    // Messung: nur eol === true mit Version zählt, null bleibt ungeprüft.
    const pb = phpBefund(php, hoster);
    if (pb) {
        findings.push({
            type: 'server', label: `PHP ${pb.version}`,
            risk: pb.text.slice(`PHP ${pb.version} `.length),
            severity: 'hoch', datum: pb.datum, hinweis: pb.hosterHinweis
        });
        securityRisk += 3;
    }

    // ── Gesamt-Bewertung ──
    const techAge = obsoleteScore >= 6 ? 'legacy' : obsoleteScore >= 3 ? 'veraltet' : obsoleteScore >= 1 ? 'akzeptabel' : 'modern';

    // Prüfung 2026-09-10: Der Satz zählte JEDEN Befund mit Schwere „hoch" als
    // Sicherheitsrisiko — auch Bootstrap 3, ein reiner Design-Befund — und endete
    // mit einer Aussage über Angriffe, die keine Messung belegt. Gezählt wird nur
    // noch, was eine Sicherheitsaussage trägt (Software ohne Updates, alte JS-Bibliothek).
    const sicherheit = findings.filter(f => f.severity === 'hoch' && (f.type === 'cms_version' || f.type === 'server' || f.type === 'js_lib'));
    const hochLabels = findings.filter(f => f.severity === 'hoch').map(f => f.label);

    return {
        findings,
        techAge,
        obsoleteScore,
        securityRisk,
        pluginCount: findings.find(f => f.type === 'plugins')?.label?.match(/\d+/)?.[0] || 0,
        // PHP-Lage für die UI: null = nicht gemessen (kein „alles gut").
        php: pb ? { version: pb.version, datum: pb.datum, text: pb.text } : null,
        hosterHinweis: pb?.hosterHinweis || null,
        pitchArg: securityRisk >= 3 && sicherheit.length
            ? `Ihre Website nutzt veraltete Software mit Sicherheitsbezug: ${sicherheit.slice(0, 2).map(f => f.risk ? `${f.label} (${f.risk})` : f.label).join(', ')}.`
            : obsoleteScore >= 4 && hochLabels.length
                ? `Die Technologie Ihrer Website ist veraltet: ${hochLabels.join(', ')}.`
                : null,
        funnelImpact: {
            interest: securityRisk >= 3 ? 3 : obsoleteScore >= 3 ? 2 : 0,
            close: obsoleteScore >= 4 ? 2 : 0
        }
    };
}
