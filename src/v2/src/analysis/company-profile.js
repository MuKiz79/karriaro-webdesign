/**
 * Company Profile Analysis
 * 1. Branche erkennen und anzeigen
 * 2. GF/Inhaber Name + wahrscheinliche Nationalität
 * 3. Großunternehmen-Erkennung (NICHT Zielgruppe)
 */

// Bekannte Großunternehmen / Konzerne (wächst über Zeit)
const KNOWN_ENTERPRISES = [
    'hansgrohe', 'bosch', 'siemens', 'mercedes', 'bmw', 'audi', 'volkswagen', 'porsche',
    'sap', 'allianz', 'basf', 'bayer', 'daimler', 'adidas', 'puma', 'henkel', 'beiersdorf',
    'commerzbank', 'deutsche-bank', 'telekom', 'vodafone', 'lidl', 'aldi', 'rewe', 'edeka',
    'dm-drogerie', 'rossmann', 'ikea', 'otto', 'zalando', 'mediamarkt', 'saturn',
    'lufthansa', 'tui', 'fresenius', 'continental', 'thyssen', 'krupp', 'evonik',
    'miele', 'liebherr', 'trumpf', 'zeiss', 'stihl', 'wuerth', 'festo', 'kärcher',
    'herrenknecht', 'burda', 'duravit', 'grohe', 'viessmann', 'vaillant'
];

// Signale die auf ein Großunternehmen hindeuten
const ENTERPRISE_SIGNALS = [
    /karriere|careers|jobs\..*\.de|stellenangebote/i,       // Karriere-Sektion
    /investor|annual-report|jahresbericht|geschaeftsbericht/i, // IR-Sektion
    /standorte|locations|niederlassung/i,                     // Mehrere Standorte
    /presse|press|newsroom|media-center/i,                    // Presseabteilung
    /compliance|datenschutzbeauftragter|whistleblow/i,        // Compliance
    /\.com.*\.de|global|worldwide|international/i             // International
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

    // ── 3. Großunternehmen-Erkennung ──
    const isKnownEnterprise = KNOWN_ENTERPRISES.some(e => domainBase.includes(e));

    // Prüfe Enterprise-Signale in Network Requests
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
    const enterpriseSignalCount = ENTERPRISE_SIGNALS.filter(p => p.test(urls)).length;
    const hasMultipleSubdomains = (urls.match(/https?:\/\/[a-z]+\./gi) || []).length > 20;

    const isLikelyEnterprise = isKnownEnterprise || enterpriseSignalCount >= 3 || hasMultipleSubdomains;

    // ── 1. Branche zuordnen ──
    const branche = place?.primaryTypeDisplayName?.text || guessIndustry(domain, urls);

    // ── 4. Konkurrenz-Erkennung (Webdesign-Agenturen = nicht kontaktieren) ──
    const isCompetitor = branche === 'Webdesign-Agentur (Konkurrenz)' ||
        COMPETITOR_PATTERNS.some(p => p.test(domainBase));

    // ── 2. GF/Inhaber + Nationalität ──
    const ownerInfo = extractOwnerInfo(psiData, place, contentAnalysis);

    // Enterprise-Warnung
    let enterpriseWarning = null;
    if (isLikelyEnterprise) {
        enterpriseWarning = {
            isEnterprise: true,
            name: place?.displayName?.text || domainBase,
            message: `${place?.displayName?.text || domainBase} ist ein Großunternehmen${isKnownEnterprise ? ' (bekannter Konzern)' : ''}. Karriaro Webdesign richtet sich an lokale Unternehmen — dieser Lead ist wahrscheinlich nicht Ihre Zielgruppe.`,
            signals: [
                isKnownEnterprise ? 'Bekannter Konzern/Marke' : null,
                enterpriseSignalCount > 0 ? `${enterpriseSignalCount} Enterprise-Signale (Karriere, Presse, IR)` : null,
                hasMultipleSubdomains ? 'Komplexe Website-Struktur (20+ Subdomains)' : null
            ].filter(Boolean),
            recommendation: 'Nicht kontaktieren — Konzerne haben eigene Agenturen und Ausschreibungsverfahren. Ihre Zeit ist besser in lokale Leads investiert.'
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
