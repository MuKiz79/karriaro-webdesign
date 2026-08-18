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
    // 2026-08-15 — Rangfolge-Verifikation: 'radisson' matcht das VERKETTETE
    // 'radissonhotels' nicht (der Token-Matcher kennt keine Teilstrings —
    // absichtlich, gegen False-Positives). Konzern-Domains, die den Markennamen
    // mit einem Suffix verschmelzen, brauchen deshalb einen EIGENEN Eintrag.
    'radissonhotels', 'marriotthotels', 'hiltonhotels', 'accorhotels',
    'mcdreams', 'mcdreamshotels', 'intercityhotel', 'dormero', 'ghotel',
    'achat-hotels', 'placestostay', 'centro-hotels',
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
    // 2026-08-15 — Tierarzt-/Praxis-Ketten (Rangfolge-Verifikation: AniCura
    // [Mars-Konzern] und Rex [rex.app, Praxis-Kette] standen in den Top-10;
    // dort entscheidet kein Inhaber vor Ort über eine Website).
    'anicura', 'evidensia', 'rex', 'felmo', 'filu',
    'colosseumdental', 'dentalone', 'kfo-abc',
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
// KAMMERN, INNUNGEN & ÖFFENTLICHE BILDUNGSTRÄGER
// ══════════════════════════════════════
// Founder-Auftrag 2026-08-18, ausgelöst von ELBCAMPUS Hamburg (dem Bildungs-
// zentrum der Handwerkskammer Hamburg), das mit 67 % Chance in der Liste stand.
// Solche Häuser vergeben Websites über Ausschreibungen und Gremien, nie über
// eine Direktansprache beim Inhaber — es gibt dort keinen Inhaber.
//
// ⚠️ Diese Gruppe ist NICHT über Markennamen fassbar (genau das zeigt ELBCAMPUS:
// weder Name noch Domain nennen die Kammer). Sie braucht deshalb drei Signale;
// siehe `publicBodyMatch` weiter unten. Hier stehen nur die Domain-Muster.
const PUBLIC_BODY = [
    // Kammern (Domain schreibt meist die Kurzform + Ort: hwk-hamburg.de)
    'handwerkskammer', 'handelskammer', 'hwk', 'ihk', 'aerztekammer',
    'zahnaerztekammer', 'apothekerkammer', 'rechtsanwaltskammer',
    'steuerberaterkammer', 'architektenkammer', 'ingenieurkammer',
    'notarkammer', 'tieraerztekammer', 'landwirtschaftskammer',
    'pflegekammer', 'psychotherapeutenkammer', 'wirtschaftskammer',
    // Innungen & Kreishandwerkerschaften
    'innung', 'innungen', 'kreishandwerkerschaft', 'handwerkerschaft',
    'innungsverband', 'fachverband', 'zentralverband',
    // Öffentliche Bildungsträger
    'volkshochschule', 'berufsbildungszentrum', 'berufsfoerderungswerk',
    'berufsbildungswerk', 'bildungswerk', 'berufsakademie',
    // ⚠️ Markenname ohne jeden Hinweis auf den Träger — nur per Einzeleintrag
    // fassbar. Beleg: Impressum elbcampus.de = Handwerkskammer Hamburg.
    'elbcampus',
];

// Wortmarken im BETRIEBSNAMEN (Google-Places-`displayName`). Bewusst als
// zusammengesetzte Formen: ein blankes „kammer" würde den Kammerjäger und das
// Kammerorchester mitnehmen — und ein Kammerjäger ist Zielgruppe, kein Ausschluss.
const PUBLIC_BODY_NAME = new RegExp([
    '(handwerks|handels|ärzte|aerzte|zahnärzte|zahnaerzte|apotheker|rechtsanwalts',
    '|steuerberater|architekten|ingenieur|notar|tierärzte|tieraerzte|landwirtschafts',
    '|pflege|psychotherapeuten|wirtschafts)kammer',
    '|industrie- und handelskammer|\\bihk\\b|\\bhwk\\b',
    '|\\binnung\\b|\\binnungen\\b|kreishandwerkerschaft|innungsverband',
    '|volkshochschule|berufsbildungszentrum|berufsförderungswerk',
    '|berufsfoerderungswerk|berufsbildungswerk|bildungswerk'
].join(''), 'i');

// Google-Places-Typen, die für sich allein schon Verwaltung/Gremium bedeuten.
// Empirisch geprüft (2026-08-18, echte Places-Abfrage):
//   Handwerkskammer Hamburg → association_or_organization
//   ELBCAMPUS / Volkshochschule → educational_institution
const PUBLIC_BODY_TYPES = new Set([
    'city_hall', 'local_government_office', 'courthouse', 'embassy',
    'fire_station', 'police', 'post_office'
]);

// ⚠️ Diese beiden Typen NICHT allein ausschließen: `association_or_organization`
// trägt auch den Sportverein und die Genossenschaft, `educational_institution`
// auch die private Sprach-, Musik- oder Nachhilfeschule — und die ist ein
// Betrieb mit Inhaber, also Zielgruppe. Ein falsch ausgeschlossener Lead ist für
// den Founder für IMMER unsichtbar; ein falsch behaltener kostet ihn einen Blick.
// Deshalb zählen sie nur zusammen mit einem Wort, das für DIESEN Typ eindeutig
// ist — je Typ ein eigenes Vokabular, weil dieselben Wörter anderswo harmlos sind
// („Akademie" gehört zur Kosmetik-Akademie, die Zielgruppe ist).
// Kurzformen, die auch Betriebs-Initialen sein können — siehe publicBodyMatch.
const AMBIGUOUS_SHORT = new Set(['hwk', 'ihk']);

const PUBLIC_BODY_WEAK_BY_TYPE = {
    association_or_organization: /(verband|verein|e\.\s?v\.|genossenschaft|gilde|zunft|kammer|körperschaft|koerperschaft)/i,
    educational_institution: /(berufsschule|berufskolleg|gewerbeschule|fachschule|staatlich|landesinstitut|schulzentrum|bildungsstätte|bildungsstaette|öffentlich|oeffentlich)/i
};

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
 * Kammer / Innung / öffentlicher Bildungsträger?
 *
 * Drei Signale, weil keines allein reicht:
 *   1. Domain-Muster (hwk-hamburg.de, vhs-…, innung-…)
 *   2. Wortmarke im Betriebsnamen (Google Places `displayName`)
 *   3. Places-Typ — allein nur bei Verwaltungstypen; `association_or_organization`
 *      und `educational_institution` NUR zusammen mit Signal 1 oder 2.
 *
 * @param {string} domainBase erste Domain-Marke, klein
 * @param {{name?:string, primaryType?:string}|null} meta Places-Daten, falls vorhanden
 * @returns {string|null} der Beleg, der gegriffen hat — oder null
 */
function publicBodyMatch(domainBase, meta) {
    const typ = meta?.primaryType ? String(meta.primaryType) : '';
    // ⚠️ „hwk"/„ihk" sind fast immer Kammern (hwk-hamburg.de), können aber auch
    // die Initialen eines Betriebs sein (hwk-elektro.de) — und zwar SOWOHL in der
    // Domain ALS AUCH im Namen. Nennt Places einen konkreten Gewerbetyp, gewinnt
    // der Betrieb: ein zu Unrecht ausgeschlossener Handwerker taucht in KEINER
    // Liste mehr auf. Die ausgeschriebenen Formen sind nie überstimmbar.
    const gewerbetypBekannt = !!typ && !PUBLIC_BODY_TYPES.has(typ) && !PUBLIC_BODY_WEAK_BY_TYPE[typ];
    const zaehlt = (treffer) => !(gewerbetypBekannt && AMBIGUOUS_SHORT.has(treffer.toLowerCase()));

    for (const pattern of PUBLIC_BODY) {
        if (patternMatches(domainBase, pattern) && zaehlt(pattern)) return pattern;
    }
    const name = meta?.name ? String(meta.name) : '';
    const nameHit = name && PUBLIC_BODY_NAME.exec(name);
    if (nameHit && zaehlt(nameHit[0])) return nameHit[0].toLowerCase();

    if (typ && PUBLIC_BODY_TYPES.has(typ)) return typ;

    // Typ + typ-eigenes Wort: „Norddeutscher Fachverband … e.V." als
    // association_or_organization greift, der Sportverein ohne solches Wort nicht.
    const weak = PUBLIC_BODY_WEAK_BY_TYPE[typ];
    if (weak && name) {
        const hit = weak.exec(name);
        if (hit) return `${typ}:${hit[0].toLowerCase()}`;
    }
    // Der Typ allein trägt nie — ohne Wort bleibt der Lead drin.
    return null;
}

/**
 * Prüft ob eine Domain zu einem bekannten Konzern/Kette gehört
 * @param {string} domain - z.B. "nh-hotels.com" oder "motel-one.com"
 * @param {{name?:string, primaryType?:string}|null} meta - Places-Daten (optional).
 *   Ohne sie greift für Kammern/Innungen/Bildungsträger nur das Domain-Muster —
 *   ELBCAMPUS wäre dann nur über seinen Einzeleintrag zu fassen.
 * @returns {{ isEnterprise: boolean, isCompetitor: boolean, isPublicBody: boolean, match: string|null, category: string|null }}
 */
export function checkEnterpriseDB(domain, meta = null) {
    const domainBase = String(domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0].toLowerCase();

    // Konkurrenz-Check
    for (const pattern of COMPETITOR_SET) {
        if (patternMatches(domainBase, pattern)) {
            return { isEnterprise: false, isCompetitor: true, isPublicBody: false, match: pattern, category: 'competitor' };
        }
    }

    // Kammern / Innungen / öffentliche Bildungsträger — eigene Gruppe, aber
    // dieselbe Wirkung: `isEnterprise` bleibt true, damit JEDER bestehende
    // Aufrufer sie ohne Änderung aussortiert.
    const pb = publicBodyMatch(domainBase, meta);
    if (pb) {
        return { isEnterprise: true, isCompetitor: false, isPublicBody: true, match: pb, category: 'publicbody' };
    }

    // Enterprise-Check
    for (const [category, patterns] of Object.entries(ALL_CHAINS)) {
        if (category === 'competitor') continue;
        for (const pattern of patterns) {
            if (patternMatches(domainBase, pattern)) {
                return { isEnterprise: true, isCompetitor: false, isPublicBody: false, match: pattern, category };
            }
        }
    }

    return { isEnterprise: false, isCompetitor: false, isPublicBody: false, match: null, category: null };
}

/**
 * Statistiken über die Datenbank
 */
export const DB_STATS = {
    totalPatterns: ALL_PATTERNS.length + PUBLIC_BODY.length + COMPETITORS.length,
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
    publicbody: PUBLIC_BODY.length,
    competitors: COMPETITORS.length
};
