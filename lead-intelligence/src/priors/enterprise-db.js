/**
 * Enterprise-Datenbank — Konzerne, Ketten, Filialisten nach Branche
 *
 * Alle Unternehmen die NICHT unsere Zielgruppe sind:
 * - Haben eigene Marketing-Abteilungen / Agenturen
 * - Entscheiden über Ausschreibungen, nicht über Cold Outreach
 * - Website wird zentral von der Konzernzentrale gesteuert
 *
 * Quellen: DAX/MDAX/SDAX, Handelsblatt, firmenlisten24.de, Wikipedia
 * Format: Domain-Patterns (ohne www.) für schnelles Matching
 */

// ══════════════════════════════════════
// HOTELKETTEN & HOSTEL-KETTEN
// ══════════════════════════════════════
const HOTEL_CHAINS = [
    // Internationale Ketten
    'marriott', 'hilton', 'ihg', 'hyatt', 'accor', 'radisson', 'wyndham',
    'bestwestern', 'best-western', 'choicehotels', 'fourseasons',
    'intercontinental', 'crowne-plaza', 'holiday-inn', 'holidayinn',
    // Deutsche Ketten
    'motel-one', 'nh-hotels', 'dorint', 'steigenberger', 'kempinski',
    'maritim', 'h-hotels', 'novum', 'relexa', 'lindner', 'leonardo',
    'h2-hotel', 'h4hotel', 'prizeotel', 'ruby-hotels', 'meininger',
    'me-and-all', 'amedia', 'atlantic', 'estrel', 'pullman',
    // Hostel-/Budget-Ketten
    'aohostels', 'a-and-o', 'generator', 'st-christophers', 'meininger',
    'ibis', 'mercure', 'novotel', 'sofitel', 'mgallery',
    'premierinn', 'premier-inn', 'travelodge', 'b-b-hotels', 'bb-hotels',
];

// ══════════════════════════════════════
// RESTAURANT- & GASTRO-KETTEN
// ══════════════════════════════════════
const RESTAURANT_CHAINS = [
    // Fast Food
    'mcdonalds', 'burgerking', 'burger-king', 'kfc', 'subway', 'dominos',
    'pizzahut', 'pizza-hut', 'starbucks', 'dunkin', 'five-guys',
    // Systemgastronomie Deutschland
    'nordsee', 'backwerk', 'ditsch', 'yormas', 'cinnabon',
    'vapiano', 'losteria', 'hans-im-glueck', 'peter-pane', 'alex-gastronomie',
    'block-house', 'blockhouse', 'maredo', 'schweinske',
    'dean-david', 'sushi-circle', 'sausalitos',
    // Bäckerei-Ketten
    'steinecke', 'kamps', 'le-crobag', 'backfactory', 'dat-backhus',
    'schaefer-dein-baecker', 'baecker-becker', 'wiener-feinbaecker',
    // Eis & Kaffee
    'coffee-fellows', 'balzac-coffee', 'einstein-kaffee',
];

// ══════════════════════════════════════
// FRISEUR- & BEAUTY-KETTEN
// ══════════════════════════════════════
const BEAUTY_CHAINS = [
    'klier', 'essanelle', 'super-cut', 'supercut', 'hairexpress', 'hair-express',
    'ryf', 'mod-s-hair', 'mods-hair', 'jean-louis-david', 'franck-provost',
    'toni-and-guy', 'regis', 'great-clips',
    // Kosmetik/Beauty
    'douglas', 'flaconi', 'rossmann', 'dm-drogerie', 'mueller-drogerie',
    'bodystreet', 'mrssporty', 'mrs-sporty',
];

// ══════════════════════════════════════
// FITNESS-KETTEN
// ══════════════════════════════════════
const FITNESS_CHAINS = [
    'mcfit', 'johnreed', 'john-reed', 'rsg-group', 'fitx', 'fit-x',
    'cleverfitness', 'clever-fit', 'fitnessfirst', 'fitness-first',
    'easyfitness', 'easy-fitness', 'pfitzenmeier', 'injoy', 'jumpers',
    'elements-fitness', 'fibo', 'urbansfp', 'activ-fitness',
    'crossfit', 'anytime-fitness', 'basicfit', 'basic-fit',
];

// ══════════════════════════════════════
// IMMOBILIEN-KETTEN & -KONZERNE
// ══════════════════════════════════════
const REALESTATE_CHAINS = [
    'vonovia', 'deutsche-wohnen', 'leg-immobilien', 'tag-immobilien',
    'engel-voelkers', 'engel-und-voelkers', 'remax', 're-max',
    'von-poll', 'dahler', 'dahler-company', 'mcmakler',
    'homeday', 'maklaro', 'scoperty', 'immowelt', 'immoscout', 'immonet',
];

// ══════════════════════════════════════
// ARZTPRAXEN-KETTEN & MVZ
// ══════════════════════════════════════
const MEDICAL_CHAINS = [
    'helios', 'asklepios', 'fresenius', 'rhoen-klinikum', 'sana',
    'vivantes', 'charite', 'uniklinik', 'universitaetsklinikum',
    'dental21', 'zmvz', 'dr-z', 'dentaloft', 'denttabs',
    'zahneins', 'zahn1', 'collar',
];

// ══════════════════════════════════════
// KFZ & AUTO-KETTEN
// ══════════════════════════════════════
const AUTO_CHAINS = [
    'atu', 'a-t-u', 'euromaster', 'vergoelder', 'pitstop', 'pit-stop',
    'premio', 'first-stop', 'point-s', 'reiff', 'stahlgruber',
    // Autohäuser
    'woltmann', 'feser', 'graf', 'lueg', 'della', 'avag', 'gottfried-schultz',
    'auto-wichert', 'tiemeyer', 'beresa', 'autohaus-koenig',
];

// ══════════════════════════════════════
// HANDWERK-KETTEN & -FRANCHISE
// ══════════════════════════════════════
const CRAFT_CHAINS = [
    'thermondo', 'installion', 'enpal', '1komma5grad', '1komma5',
    'zolar', 'wegatech', 'energiekonzepte', 'proserv',
];

// ══════════════════════════════════════
// DAX / MDAX / SDAX — Grundsätzlich nicht Zielgruppe
// ══════════════════════════════════════
const DAX_COMPANIES = [
    // DAX 40
    'adidas', 'airbus', 'allianz', 'basf', 'bayer', 'beiersdorf', 'bmw',
    'brenntag', 'commerzbank', 'continental', 'covestro', 'daimler-truck',
    'deutsche-bank', 'deutsche-boerse', 'deutsche-post', 'dhl', 'deutsche-telekom',
    'eon', 'fresenius', 'hannover-rueck', 'heidelberg', 'henkel', 'infineon',
    'mercedes-benz', 'merck', 'mtu', 'muenchener-rueck', 'porsche', 'puma',
    'qiagen', 'rheinmetall', 'rwe', 'sap', 'sartorius', 'siemens',
    'siemens-energy', 'siemens-healthineers', 'symrise', 'volkswagen', 'vonovia', 'zalando',
    // Weitere bekannte Konzerne
    'bosch', 'aldi', 'lidl', 'schwarz-gruppe', 'rewe', 'edeka', 'otto',
    'bertelsmann', 'axel-springer', 'thyssen', 'krupp', 'evonik',
    'miele', 'liebherr', 'trumpf', 'zeiss', 'stihl', 'wuerth', 'festo',
    'kaercher', 'herrenknecht', 'burda', 'duravit', 'grohe', 'hansgrohe',
    'viessmann', 'vaillant', 'vorwerk', 'haribo', 'bahlsen',
    'mediamarkt', 'saturn', 'ikea', 'obi', 'hornbach', 'bauhaus',
    'dm', 'rossmann', 'douglas', 'thalia', 'deichmann', 'takko',
    'fielmann', 'apollo', 'vodafone', 'telefonica', 'o2',
];

// ══════════════════════════════════════
// WEBDESIGN / IT / MARKETING — Konkurrenz
// ══════════════════════════════════════
const COMPETITORS = [
    'webdesign', 'web-design', 'webagentur', 'web-agentur',
    'werbeagentur', 'kreativagentur', 'digitalagentur', 'digital-agentur',
    'internetagentur', 'online-agentur', 'medienagentur',
    'seo-agentur', 'social-media-agentur', 'marketingagentur',
    'webentwickl', 'web-entwickl', 'softwareentwickl', 'app-entwickl',
    'homepage-erstell', 'website-erstell', 'webseiten-erstell',
];

// ══════════════════════════════════════
// EXPORT: Alle in einem Lookup
// ══════════════════════════════════════

const ALL_CHAINS = {
    hotel: HOTEL_CHAINS,
    restaurant: RESTAURANT_CHAINS,
    beauty: BEAUTY_CHAINS,
    fitness: FITNESS_CHAINS,
    realestate: REALESTATE_CHAINS,
    medical: MEDICAL_CHAINS,
    auto: AUTO_CHAINS,
    craft: CRAFT_CHAINS,
    dax: DAX_COMPANIES,
    competitor: COMPETITORS,
};

// Flatten für schnelles Matching
const ALL_PATTERNS = [
    ...HOTEL_CHAINS, ...RESTAURANT_CHAINS, ...BEAUTY_CHAINS,
    ...FITNESS_CHAINS, ...REALESTATE_CHAINS, ...MEDICAL_CHAINS,
    ...AUTO_CHAINS, ...CRAFT_CHAINS, ...DAX_COMPANIES
];

const COMPETITOR_SET = new Set(COMPETITORS);

/**
 * Escaped einen String fuer den Einsatz in einer RegExp.
 */
function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Prueft ob ein Pattern zur Domain-Base passt.
 * - Pattern mit "-" (z.B. "leg-immobilien", "bmw-deutschland"):
 *   matcht an Word-Boundary (Anfang/Ende oder von "-" umgeben).
 * - Atomares Pattern ohne "-" (z.B. "vonovia", "obi"):
 *   muss exakt ein Token sein (split bei "-") oder die ganze Domain-Base.
 *
 * Das verhindert Substring-False-Positives wie "obi" in "amian-immobilien".
 */
export function patternMatches(domainBase, pattern) {
    if (!domainBase || !pattern) return false;
    if (pattern.includes('-')) {
        const re = new RegExp('(^|-)' + escapeRegex(pattern) + '($|-)');
        return re.test(domainBase);
    }
    if (domainBase === pattern) return true;
    return domainBase.split('-').includes(pattern);
}

/**
 * Prüft ob eine Domain zu einem bekannten Konzern/Kette gehört
 * @param {string} domain - z.B. "nh-hotels.com" oder "motel-one.com"
 * @returns {{ isEnterprise: boolean, isCompetitor: boolean, match: string|null, category: string|null }}
 */
export function checkEnterpriseDB(domain) {
    const domainBase = String(domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0].toLowerCase();

    // Konkurrenz-Check
    for (const pattern of COMPETITOR_SET) {
        if (patternMatches(domainBase, pattern)) {
            return { isEnterprise: false, isCompetitor: true, match: pattern, category: 'competitor' };
        }
    }

    // Enterprise-Check
    for (const [category, patterns] of Object.entries(ALL_CHAINS)) {
        if (category === 'competitor') continue;
        for (const pattern of patterns) {
            if (patternMatches(domainBase, pattern)) {
                return { isEnterprise: true, isCompetitor: false, match: pattern, category };
            }
        }
    }

    return { isEnterprise: false, isCompetitor: false, match: null, category: null };
}

/**
 * Statistiken über die Datenbank
 */
export const DB_STATS = {
    totalPatterns: ALL_PATTERNS.length + COMPETITORS.length,
    categories: Object.keys(ALL_CHAINS).length,
    hotels: HOTEL_CHAINS.length,
    restaurants: RESTAURANT_CHAINS.length,
    beauty: BEAUTY_CHAINS.length,
    fitness: FITNESS_CHAINS.length,
    realestate: REALESTATE_CHAINS.length,
    medical: MEDICAL_CHAINS.length,
    auto: AUTO_CHAINS.length,
    craft: CRAFT_CHAINS.length,
    dax: DAX_COMPANIES.length,
    competitors: COMPETITORS.length
};
