/**
 * Company Profile Analysis
 * 1. Branche erkennen und anzeigen
 * 2. GF/Inhaber Name + wahrscheinliche Nationalität
 * 3. Großunternehmen-Erkennung via enterprise-db.js (300+ Einträge)
 */

import { checkEnterpriseDB } from '../priors/enterprise-db.js';

// URL-basierte Enterprise-Signale (Fallback wenn Domain nicht in DB)
const ENTERPRISE_SIGNALS = [
    /investor|annual-report|jahresbericht|geschaeftsbericht/i,
    /compliance|datenschutzbeauftragter|whistleblow/i,
    /karriere.*portal|jobs\..*\.de|stellenangebote.*\d/i,
    /niederlassung.*en|filialen|branches/i,
    /\.com.*\.de|worldwide|international/i,
    /newsroom|media-center|presseportal/i
];

/**
 * Analysiere das Unternehmensprofil
 * @param {string} url
 * @param {Object} psiData - PageSpeed-Daten
 * @param {Object} place - Google Places
 * @param {Object} contentAnalysis - Claude Content-Analyse (optional)
 */
export function analyzeCompanyProfile(url, psiData, place, contentAnalysis = null) {
    const domain = new URL(url).hostname.replace('www.', '');
    const domainBase = domain.split('.')[0].toLowerCase();

    // ── 3. Großunternehmen-Erkennung via Datenbank (300+ Einträge) ──
    const dbResult = checkEnterpriseDB(domain);

    // Zusätzliche Signale aus Network Requests (für unbekannte Unternehmen)
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
    const enterpriseSignalCount = ENTERPRISE_SIGNALS.filter(p => p.test(urls)).length;
    const hasMultipleSubdomains = (urls.match(/https?:\/\/[a-z]+\./gi) || []).length > 20;

    // Enterprise-Entscheidung:
    // 1. DB-Match → sofort Enterprise (hohe Konfidenz)
    // 2. URL-Signale NUR bei NICHT in DB erkannten Domains
    //    UND nur wenn genug Signale UND kein lokaler Places-Eintrag mit wenig Reviews
    // FIX: Kleine lokale Friseure (haar-ibo.de, shinzo.hair) wurden fälschlich als Enterprise erkannt
    const reviews = place?.userRatingCount || 0;
    const isLocalBusiness = place && reviews < 5000; // Places-Eintrag = lokal
    const urlSignalThreshold = isLocalBusiness ? 5 : 4; // Höhere Schwelle für lokale Betriebe
    const isLikelyEnterprise = dbResult.isEnterprise
        || (enterpriseSignalCount >= urlSignalThreshold && !isLocalBusiness)
        || (hasMultipleSubdomains && !isLocalBusiness);

    // ── 1. Branche zuordnen ──
    const branche = place?.primaryTypeDisplayName?.text || guessIndustry(domain, urls);

    // ── 4. Konkurrenz-Erkennung (via DB + Branchen-Guess) ──
    const isCompetitor = dbResult.isCompetitor || branche === 'Webdesign-Agentur (Konkurrenz)' ||
        COMPETITOR_PATTERNS.some(p => p.test(domainBase));

    // ── 2. GF/Inhaber + Nationalität ──
    const ownerInfo = extractOwnerInfo(psiData, place, contentAnalysis);

    // Enterprise-Warnung
    const categoryLabels = { hotel: 'Hotelkette', restaurant: 'Gastro-Kette', beauty: 'Friseur-/Beauty-Kette', fitness: 'Fitness-Kette', realestate: 'Immobilien-Konzern', medical: 'Klinik-/MVZ-Kette', auto: 'KFZ-Kette', craft: 'Handwerks-Franchise', dax: 'DAX/MDAX-Konzern' };
    let enterpriseWarning = null;
    if (isLikelyEnterprise) {
        const catLabel = categoryLabels[dbResult.category] || 'Großunternehmen';
        enterpriseWarning = {
            isEnterprise: true,
            name: place?.displayName?.text || domainBase,
            category: dbResult.category,
            message: `${place?.displayName?.text || domainBase} ist ${dbResult.isEnterprise ? `eine ${catLabel} (${dbResult.match})` : 'wahrscheinlich ein Großunternehmen'}. Karriaro Webdesign richtet sich an lokale Unternehmen.`,
            signals: [
                dbResult.isEnterprise ? `Erkannt: ${catLabel}` : null,
                enterpriseSignalCount > 0 ? `${enterpriseSignalCount} Enterprise-Signale` : null,
                hasMultipleSubdomains ? '20+ Subdomains' : null
            ].filter(Boolean),
            recommendation: 'Nicht kontaktieren — Ketten und Konzerne haben eigene Agenturen.'
        };
    }

    // Konkurrenz-Warnung
    let competitorWarning = null;
    if (isCompetitor) {
        competitorWarning = {
            isCompetitor: true,
            message: `${place?.displayName?.text || domainBase} ist selbst eine Webdesign-Agentur oder IT-Dienstleister. Das ist ein Konkurrent, kein Lead.`,
            recommendation: 'Nicht kontaktieren — das ist ein Mitbewerber.'
        };
    }

    return {
        domain,
        branche,
        isEnterprise: isLikelyEnterprise,
        isCompetitor,
        enterpriseWarning,
        competitorWarning,
        owner: ownerInfo,
        companyName: place?.displayName?.text || domainBase
    };
}

// Webdesign/IT-Agenturen — KONKURRENZ, kein Lead!
const COMPETITOR_PATTERNS = [
    /webdesign|web-design|webentwickl|web-entwickl|webagentur|web-agentur/i,
    /werbeagentur|kreativagentur|digitalagentur|digital-agentur/i,
    /webseiten|homepage.*erstell|website.*erstell|internetagentur/i,
    /seo-agentur|online-marketing.*agentur|social-media.*agentur/i,
    /it-dienstleist|softwareentwickl|app-entwickl/i
];

function guessIndustry(domain, urls) {
    // ZUERST: Nur Domain prüfen (nicht URLs — dort stehen Portfolio-Projekte)
    const domainOnly = domain.toLowerCase();

    // Konkurrenz-Check (Webdesign-Agenturen)
    for (const p of COMPETITOR_PATTERNS) {
        if (p.test(domainOnly)) return 'Webdesign-Agentur (Konkurrenz)';
    }

    // Branchen-Erkennung NUR aus Domain (nicht aus URL-Content!)
    const domainPatterns = [
        { match: /zahnarzt|dental|zahn/i, name: 'Zahnarztpraxis' },
        { match: /arzt|praxis|medizin|doktor/i, name: 'Arztpraxis' },
        { match: /friseur|hair|salon|coiffeur/i, name: 'Friseursalon' },
        { match: /restaurant|gasthaus|ristorante/i, name: 'Restaurant' },
        { match: /immobili|makler|real.?estate/i, name: 'Immobilienmakler' },
        { match: /hotel|pension|gasthof/i, name: 'Hotel' },
        { match: /anwalt|rechtsanwalt|kanzlei|lawyer/i, name: 'Rechtsanwalt' },
        { match: /werkstatt|auto|kfz|car/i, name: 'KFZ-Werkstatt' },
        { match: /sanitaer|heizung|plumber/i, name: 'Sanitärbetrieb' },
        { match: /elektr|electric/i, name: 'Elektrobetrieb' },
        { match: /fitness|gym|sport/i, name: 'Fitnessstudio' },
        { match: /tierarzt|vet/i, name: 'Tierarztpraxis' },
        { match: /baecker|bakery|brot/i, name: 'Bäckerei' },
        { match: /blumen|florist|flower/i, name: 'Florist' },
    ];
    for (const p of domainPatterns) if (p.match.test(domainOnly)) return p.name;

    // Fallback: URL-Content prüfen (nur wenn Domain nichts ergab)
    const combined = urls.slice(0, 1000);
    // Konkurrenz-Check in URLs
    for (const p of COMPETITOR_PATTERNS) {
        if (p.test(combined)) return 'Webdesign-Agentur (Konkurrenz)';
    }

    return 'Unternehmen (Branche nicht erkannt)';
}

function extractOwnerInfo(psiData, place, contentAnalysis) {
    // Versuch 1: Aus NER / Impressum
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '');
    let name = null;

    // Versuch 2: Aus Google Places
    // (Google Places gibt keinen Inhaber-Namen, aber manchmal im displayName enthalten)

    // Versuch 3: Aus Claude Content-Analyse
    if (contentAnalysis?.copyrightYear) {
        // Kann Hinweise auf den Inhaber geben
    }

    // Nationalität aus Name ableiten (wenn vorhanden)
    const nationality = name ? guessNationality(name) : null;

    return { name, nationality, source: name ? 'Impressum/Website' : 'Nicht erkannt' };
}

function guessNationality(name) {
    if (!name) return null;
    // Einfache Heuristik basierend auf Nachnamen-Mustern
    if (/müller|schmidt|schneider|fischer|weber|meier|schulz|hoffmann|koch|becker/i.test(name)) return 'Deutsch';
    if (/yilmaz|öztürk|kaya|demir|çelik|şahin|arslan|doğan|kılıç|polat/i.test(name)) return 'Türkisch';
    if (/rossi|ferrari|russo|romano|colombo|ricci|marino|greco|bruno/i.test(name)) return 'Italienisch';
    if (/nguyen|tran|pham|hoang|dang|bui|do|ngo/i.test(name)) return 'Vietnamesisch';
    if (/kowalski|nowak|wiśniewski|wójcik|kowalczyk|kamiński/i.test(name)) return 'Polnisch';
    return null;
}
