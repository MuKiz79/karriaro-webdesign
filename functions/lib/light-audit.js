/**
 * Light-Audit — PSI-unabhaengige Audit-Variante.
 *
 * Direkt-Fetch der Ziel-URL → Tech-Detect via HTML-Patterns +
 * Wayback-Freshness + BFSG-Heuristik aus dem HTML + Branchen-Standards.
 *
 * Wird vom quickAudit-Endpoint aufgerufen, wenn die volle PSI-Pipeline
 * nicht verfuegbar ist (Quota, Timeout) oder als immer-laufende Basis,
 * der die Vollpipeline optional weitere Felder hinzufuegt.
 *
 * Ziel: 3-5 s Latenz statt 15-30 s.
 */

const { checkFreshness, analyzeTechAge } = require('./audit-pipeline.js');
const { extractSubPages, htmlToText } = require('./deep-research.js');
const { checkBranchStandards, BRANCH_STANDARDS } = require('./branch-standards.js');

// Repliziert aus audit-pipeline.js (dort intern, nicht exportiert).
// Hier auf HTML-Body angewendet, nicht auf PSI-Network-Request-URLs.
const TECH_PATTERNS = [
    { match: /\/wp-content\/|\/wp-includes\//i, cms: 'WordPress', baukasten: false },
    { match: /static\.wixstatic\.com|parastorage\.com/i, cms: 'Wix', baukasten: true },
    { match: /jimdo-storage\.|a\.jimdo\.com|jimdo\.com/i, cms: 'Jimdo', baukasten: true },
    { match: /squarespace\.com|static1\.squarespace/i, cms: 'Squarespace', baukasten: true },
    { match: /cdn\.shopify\.com/i, cms: 'Shopify', baukasten: true },
    { match: /weeblycloud\.com|weebly\.com/i, cms: 'Weebly', baukasten: true },
    { match: /\.webflow\.com|webflow\.io/i, cms: 'Webflow', baukasten: false },
    { match: /divi\/includes|et-boc|et_pb_/i, cms: 'WordPress + Divi', baukasten: false },
    { match: /elementor/i, cms: 'WordPress + Elementor', baukasten: false },
    { match: /ionos\.com|1and1|1und1/i, cms: 'IONOS Baukasten', baukasten: true },
    { match: /strato\.de/i, cms: 'Strato Homepage-Baukasten', baukasten: true },
    { match: /typo3conf|typo3temp/i, cms: 'TYPO3', baukasten: false },
    { match: /joomla|com_content/i, cms: 'Joomla', baukasten: false },
    { match: /drupal/i, cms: 'Drupal', baukasten: false },
    { match: /contao|tl_files/i, cms: 'Contao', baukasten: false }
];
const BAUKASTEN_SUBDOMAIN = /\.jimdosite\.com|\.jimdo\.com|\.wixsite\.com|\.weebly\.com|\.webflow\.io/i;

async function fetchHtml(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; KarriaroAudit/1.0; +https://karriaro-webdesign.de/audit)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'de-DE,de;q=0.9'
            },
            redirect: 'follow'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const finalUrl = res.url || url;
        const html = await res.text();
        // Sprint 68 — Response-Headers fuer Pain-Points-Security-Check propagieren.
        const headers = {};
        try {
            res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        } catch (_) { /* headers iteration kann fehlschlagen je nach runtime */ }
        return { html, finalUrl, headers };
    } finally {
        clearTimeout(t);
    }
}

function detectTechFromHtml(html, finalUrl) {
    const result = { cms: null, version: null, signals: [], isBaukasten: false };

    for (const p of TECH_PATTERNS) {
        if (p.match.test(html)) {
            if (!result.cms) result.cms = p.cms;
            result.isBaukasten = result.isBaukasten || p.baukasten;
            result.signals.push(`HTML-Pattern: ${p.cms}`);
        }
    }

    const wpVer = html.match(/wp-includes\/[^?]*\?ver=([0-9.]+)/);
    if (wpVer) result.version = wpVer[1];

    const gen = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
    if (gen) {
        const g = gen[1];
        if (!result.cms) {
            if (/wordpress/i.test(g)) result.cms = 'WordPress';
            else if (/joomla/i.test(g)) result.cms = 'Joomla';
            else if (/drupal/i.test(g)) result.cms = 'Drupal';
            else if (/typo3/i.test(g)) result.cms = 'TYPO3';
            else if (/contao/i.test(g)) result.cms = 'Contao';
            else if (/shopify/i.test(g)) { result.cms = 'Shopify'; result.isBaukasten = true; }
            else if (/wix/i.test(g)) { result.cms = 'Wix'; result.isBaukasten = true; }
        }
        const verInGen = g.match(/(\d+\.\d+(?:\.\d+)?)/);
        if (verInGen && !result.version) result.version = verInGen[1];
        result.signals.push(`Generator-Meta: ${g}`);
    }

    if (BAUKASTEN_SUBDOMAIN.test(finalUrl)) {
        result.isBaukasten = true;
        result.signals.push('Subdomain eines Baukastens');
    }

    return result;
}

function bfsgHeuristic(html) {
    const checks = [];
    let score = 100;

    const langMatch = html.match(/<html[^>]*\blang\s*=\s*["']([a-zA-Z-]+)["']/i);
    if (!langMatch) {
        checks.push({ id: 'lang-attr', failed: true, label: 'lang-Attribut auf <html> fehlt' });
        score -= 18;
    }

    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!title || !title[1].trim()) {
        checks.push({ id: 'title', failed: true, label: '<title> fehlt oder leer' });
        score -= 12;
    }

    const imgs = html.match(/<img[^>]*>/gi) || [];
    const imgsWithAlt = imgs.filter(i => /\balt\s*=\s*["'][^"']/i.test(i));
    const altCoverage = imgs.length > 0 ? imgsWithAlt.length / imgs.length : 1;
    if (imgs.length > 0 && altCoverage < 0.7) {
        checks.push({
            id: 'alt-text',
            failed: true,
            label: `Alt-Text fehlt bei ${imgs.length - imgsWithAlt.length} von ${imgs.length} Bildern`
        });
        score -= 22;
    }

    const h1Count = (html.match(/<h1\b[^>]*>/gi) || []).length;
    if (h1Count === 0) {
        checks.push({ id: 'h1', failed: true, label: 'Keine <h1>-Ueberschrift' });
        score -= 14;
    } else if (h1Count > 1) {
        checks.push({ id: 'h1-multiple', failed: true, label: `${h1Count} <h1>-Ueberschriften statt einer` });
        score -= 8;
    }

    // Form-Inputs ohne zugeordnetes Label (heuristisch: Label-Anzahl < Input-Anzahl)
    const formInputs = (html.match(/<input[^>]+type\s*=\s*["'](?:text|email|tel|url|number|search)["']/gi) || []).length;
    const labels = (html.match(/<label\b[^>]*>/gi) || []).length;
    if (formInputs > 0 && labels < formInputs) {
        checks.push({
            id: 'form-labels',
            failed: true,
            label: `${formInputs - labels} Formularfelder ohne <label>`
        });
        score -= 10;
    }

    // Skip-Link (Empfehlung, kein muss)
    if (!/skip[- ]?(?:to[- ]?)?(?:content|main)/i.test(html) && !/zum[- ]?(?:haupt[- ]?)?inhalt/i.test(html)) {
        checks.push({ id: 'skip-link', failed: true, label: 'Skip-Link zum Hauptinhalt fehlt' });
        score -= 6;
    }

    score = Math.max(0, Math.min(100, score));

    let risk, fine;
    if (score < 50) { risk = 'kritisch'; fine = '100.000 €'; }
    else if (score < 70) { risk = 'hoch'; fine = '50.000 €'; }
    else if (score < 85) { risk = 'mittel'; fine = '10.000 €'; }
    else { risk = 'niedrig'; fine = 'kein Risiko erkennbar'; }

    const pitchArg = (risk === 'kritisch' || risk === 'hoch')
        ? `Heuristik-Score ${score}% — Ihre Seite weist sichtbare Barrierefreiheits-Luecken auf. BFSG ist seit Juni 2025 Pflicht, Bussgelder bis ${fine}.`
        : (risk === 'mittel'
            ? `Heuristik-Score ${score}% — einzelne BFSG-Punkte sind verbesserungswuerdig. Vollstaendige WCAG-Pruefung im Komplettaudit.`
            : null);

    return {
        complianceScore: score,
        risk,
        fine,
        method: 'heuristic',
        checks,
        pitchArg
    };
}

/**
 * Sprint 67 — URL-Heuristik als Fallback wenn Google-Places keine Branche findet.
 * Erkennt anhand der Hostname-Slugs typische deutsche KMU-Branchen.
 * Liefert primaryType im Google-Places-Schema (z.B. 'real_estate_agency'),
 * damit checkBranchStandards() das gleiche Mapping nutzen kann.
 */
function guessBranchFromUrl(url) {
    try {
        var host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        // Pattern-Matching auf Domain-Slugs. Order matters — spezifischere zuerst.
        var rules = [
            { re: /(immobilien|makler|maklerin|realestate|immo[-_]|[-_]immo)/i, type: 'real_estate_agency' },
            { re: /(kanzlei|anwalt|rechtsanwalt|notar|advokat|jurist)/i, type: 'lawyer' },
            { re: /(zahnarzt|dental|kieferorthop|implantolog)/i, type: 'dentist' },
            { re: /(hausarzt|praxis[-_]?dr|dr[-_]|praxis-|hno|orthop|gyn|augenarzt|kinderarzt|allgemeinmed|hautarzt)/i, type: 'doctor' },
            { re: /(physio|krankengymnastik|reha[-_])/i, type: 'physiotherapist' },
            { re: /(restaurant|gasthof|gasthaus|trattoria|pizzeria|brauerei|wirtshaus|steak|hirsch|krone|adler|loewe|löwe)/i, type: 'restaurant' },
            { re: /(hotel|pension|gaeste|gäste|herberge)/i, type: 'hotel' },
            { re: /(friseur|hairdesign|hairstudio|barber|coiffeur|salon)/i, type: 'hair_salon' },
            { re: /(kosmetik|beauty|nageldesign|aesthetik|ästhetik)/i, type: 'beauty_salon' },
            { re: /(sanitaer|sanitär|installateur|heizung|klempner|gas[-_]?wasser)/i, type: 'plumber' },
            { re: /(elektro|elektriker|elektrotechnik|elektroinstall)/i, type: 'electrician' },
            { re: /(kfz|autowerk|werkstatt[-_]|reifenservice|tuev|tüv[-_])/i, type: 'auto_repair' },
            { re: /(dachdecker|dachbau|zimmerer|spengler)/i, type: 'plumber' /* fallback handwerk-bucket */ }
        ];
        for (var i = 0; i < rules.length; i++) {
            if (rules[i].re.test(host)) return rules[i].type;
        }
        return null;
    } catch (_) {
        return null;
    }
}

async function fetchPlaceType(url, placesKey) {
    if (!placesKey) return null;
    try {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        try {
            const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
                method: 'POST',
                signal: ctrl.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': placesKey,
                    'X-Goog-FieldMask': 'places.primaryType,places.displayName,places.websiteUri'
                },
                body: JSON.stringify({ textQuery: domain, languageCode: 'de', maxResultCount: 3 })
            });
            if (!res.ok) return null;
            const data = await res.json();
            // Bestes Match: gleiche Website-Domain, sonst erstes Ergebnis
            const places = data?.places || [];
            const exact = places.find(p => {
                if (!p.websiteUri) return false;
                try { return new URL(p.websiteUri).hostname.replace(/^www\./, '') === domain; }
                catch { return false; }
            });
            return (exact || places[0])?.primaryType || null;
        } finally {
            clearTimeout(t);
        }
    } catch (err) {
        console.warn('Place lookup failed:', err.message);
        return null;
    }
}

/**
 * Liefert ein Audit-Snippet ohne PSI.
 * @param {string} url        normalisierte URL
 * @param {string} placesKey  Google Places API Key (optional, Default '')
 * @returns {Promise<object>} { ok, light:true, tech, wayback, techAge, bfsg, branch }
 */
/**
 * Sprint 68 — Pain-Points-Detection.
 * Adressiert die 5 typischen Buy-Trigger fuer Mittelstands-Webseiten:
 * Content-Veraltung, Security-Luecken, Vendor-Lockin, Mobile-Probleme,
 * fehlende Social-Meta.
 *
 * @param {string} html
 * @param {Object<string,string>} headers  HTTP-Response-Headers (lowercase keys)
 * @param {Object} wayback                 { available, lastSnapshot? }
 * @param {Object} tech                    { cms, ... }
 * @returns {Object} painPoints
 */
function detectPainPoints(html, headers, wayback, tech) {
    const h = html || '';
    const head = h.slice(0, 20000); // Head/upper-body fuer Meta-Tag-Checks
    const hdrs = headers || {};

    // P1 — Content-Freshness via Wayback + Copyright-Jahr
    let lastSnapshotMonthsAgo = null;
    if (wayback?.lastSnapshot) {
        const snapDate = new Date(wayback.lastSnapshot);
        if (!isNaN(snapDate.getTime())) {
            lastSnapshotMonthsAgo = Math.round((Date.now() - snapDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
        }
    }
    const copyrightMatch = h.match(/©\s*(20\d{2})|\bcopyright\b[^\d]*(20\d{2})/i);
    const copyrightYear = copyrightMatch ? parseInt(copyrightMatch[1] || copyrightMatch[2], 10) : null;
    const currentYear = new Date().getFullYear();
    const contentStaleByCopyright = copyrightYear && copyrightYear < currentYear - 1;
    const contentStaleByWayback = lastSnapshotMonthsAgo !== null && lastSnapshotMonthsAgo > 18;
    const contentFresh = !contentStaleByCopyright && !contentStaleByWayback;

    // P2 — Security-Header-Check (HTTPS-essentiell)
    const securityChecks = {
        hsts: !!(hdrs['strict-transport-security']),
        xFrameOptions: !!(hdrs['x-frame-options'] || /content-security-policy[^,]*frame-ancestors/i.test(hdrs['content-security-policy'] || '')),
        xContentTypeOptions: (hdrs['x-content-type-options'] || '').toLowerCase().includes('nosniff'),
        referrerPolicy: !!(hdrs['referrer-policy']),
        csp: !!(hdrs['content-security-policy'])
    };
    const missingHeaders = Object.entries(securityChecks).filter(([, v]) => !v).map(([k]) => k);
    const securityOk = missingHeaders.length <= 1; // 1 fehlend toleriert

    // P3 — Vendor-Lockin (Wix/Jimdo/Squarespace = locked-in, kein Self-Service-Export)
    const VENDOR_LOCKIN = new Set(['Wix', 'Jimdo', 'Squarespace', 'Webnode', 'IONOS MyWebsite']);
    const lockinPlatform = (tech?.cms && VENDOR_LOCKIN.has(tech.cms)) ? tech.cms : null;
    const vendorOk = !lockinPlatform;

    // P4 — Mobile-Viewport-Meta-Tag
    const viewportMatch = head.match(/<meta\s+name\s*=\s*["']viewport["'][^>]*content\s*=\s*["']([^"']+)/i);
    const hasViewport = !!viewportMatch;
    const viewportOk = hasViewport && /width\s*=\s*device-width/i.test(viewportMatch?.[1] || '');

    // P5 — Open-Graph + Twitter-Card-Meta (Social-Sharing)
    const ogTitle = /<meta\s+property\s*=\s*["']og:title["']/i.test(head);
    const ogImage = /<meta\s+property\s*=\s*["']og:image["']/i.test(head);
    const ogDescription = /<meta\s+property\s*=\s*["']og:description["']/i.test(head);
    const twitterCard = /<meta\s+name\s*=\s*["']twitter:card["']/i.test(head);
    const socialMissing = [];
    if (!ogTitle) socialMissing.push('og:title');
    if (!ogImage) socialMissing.push('og:image');
    if (!ogDescription) socialMissing.push('og:description');
    if (!twitterCard) socialMissing.push('twitter:card');
    const socialOk = socialMissing.length <= 1;

    return {
        contentFreshness: {
            ok: contentFresh,
            lastSnapshotMonthsAgo,
            copyrightYear,
            label: contentFresh
                ? 'Letzter sichtbarer Inhalt aktuell'
                : (contentStaleByCopyright
                    ? `Copyright-Jahr ${copyrightYear} (aktuell: ${currentYear})`
                    : `Letztes Wayback-Snapshot vor ~${lastSnapshotMonthsAgo} Monaten`)
        },
        securityHeaders: {
            ok: securityOk,
            missing: missingHeaders,
            label: securityOk
                ? 'Security-Headers gesetzt (HSTS, CSP, etc.)'
                : `${missingHeaders.length} Security-Header fehlen: ${missingHeaders.join(', ')}`
        },
        vendorLockin: {
            ok: vendorOk,
            platform: lockinPlatform,
            label: vendorOk
                ? 'Kein Vendor-Lock-in erkannt (Self-Service möglich)'
                : `${lockinPlatform} erkannt — kein Self-Service-Export möglich`
        },
        mobileViewport: {
            ok: viewportOk,
            hasViewport,
            label: viewportOk
                ? 'Mobile-Viewport korrekt gesetzt'
                : (hasViewport ? 'Viewport-Meta vorhanden, aber nicht responsive' : 'Mobile-Viewport-Meta fehlt — Layout bricht auf iPhone')
        },
        socialMeta: {
            ok: socialOk,
            missing: socialMissing,
            label: socialOk
                ? 'Social-Sharing-Tags (Open-Graph) vorhanden'
                : `${socialMissing.length} Social-Tags fehlen: ${socialMissing.join(', ')} — WhatsApp/LinkedIn-Shares zeigen kein Bild`
        }
    };
}

/**
 * Sprint 69 — SEO + GEO (Generative Engine Optimization) Detection.
 * Prüft strukturierte Daten, klassische SEO-Marker und 2025/26 KI-Readability
 * (llms.txt, FAQ-/Article-/BreadcrumbList-Schema).
 *
 * @param {string} html
 * @param {string} baseUrl
 * @returns {Promise<{seo: object, geo: object}>}
 */
async function detectSeoGeo(html, baseUrl) {
    const head = (html || '').slice(0, 30000);

    // Schema.org JSON-LD-Blocks parsen
    const jsonLdMatches = head.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    const schemaTypes = new Set();
    jsonLdMatches.forEach(block => {
        const content = block.replace(/<[^>]+>/g, '');
        const typeMatches = content.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
        typeMatches.forEach(t => {
            const m = t.match(/"@type"\s*:\s*"([^"]+)"/);
            if (m) schemaTypes.add(m[1]);
        });
    });

    const LOCAL_BUSINESS_TYPES = ['LocalBusiness', 'RealEstateAgent', 'Restaurant', 'HealthAndBeautyBusiness', 'Dentist', 'Physician', 'AutoRepair', 'Plumber', 'Electrician', 'LegalService', 'HairSalon', 'BeautySalon', 'Organization'];
    const hasLocalBusiness = LOCAL_BUSINESS_TYPES.some(t => schemaTypes.has(t));

    // Canonical
    const hasCanonical = /<link\s+rel\s*=\s*["']canonical["']/i.test(head);

    // Meta-Description
    const metaDescMatch = head.match(/<meta\s+name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)/i);
    const metaDescLen = metaDescMatch ? metaDescMatch[1].length : 0;
    const metaDescOk = metaDescLen >= 80 && metaDescLen <= 165;

    // Title-Tag
    const titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);
    const titleLen = titleMatch ? titleMatch[1].trim().length : 0;
    const titleOk = titleLen >= 30 && titleLen <= 65;

    // robots.txt + sitemap.xml + llms.txt — parallele HEAD-Requests
    let origin;
    try { origin = new URL(baseUrl).origin; } catch { origin = null; }
    async function probe(path) {
        if (!origin) return false;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3000);
            const res = await fetch(origin + path, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
            clearTimeout(t);
            return res.ok;
        } catch (_) { return false; }
    }
    const [hasRobots, hasSitemap, hasLlmsTxt] = await Promise.all([
        probe('/robots.txt'),
        probe('/sitemap.xml'),
        probe('/llms.txt')
    ]);

    // GEO — strukturierte Daten für KI-Crawler
    const hasFaqSchema = schemaTypes.has('FAQPage');
    const hasArticleSchema = schemaTypes.has('Article') || schemaTypes.has('BlogPosting') || schemaTypes.has('NewsArticle');
    const hasBreadcrumb = schemaTypes.has('BreadcrumbList');
    const anyStructuredData = jsonLdMatches.length > 0;

    const seoItems = [
        { ok: hasLocalBusiness, label: 'Schema.org LocalBusiness (für Google-Rich-Results)' },
        { ok: hasCanonical, label: 'Canonical-URL gesetzt' },
        { ok: metaDescOk, label: `Meta-Description (${metaDescLen}/80–165 Zeichen)` },
        { ok: titleOk, label: `Page-Title (${titleLen}/30–65 Zeichen)` },
        { ok: hasRobots, label: 'robots.txt erreichbar' },
        { ok: hasSitemap, label: 'sitemap.xml erreichbar' }
    ];
    const geoItems = [
        { ok: hasLlmsTxt, label: 'llms.txt vorhanden (2025-Standard für ChatGPT/Perplexity)' },
        { ok: hasFaqSchema, label: 'FAQ-Schema (FAQPage) für KI-Zitierung' },
        { ok: hasBreadcrumb, label: 'BreadcrumbList-Schema für Navigation-KI' },
        { ok: anyStructuredData, label: `Strukturierte Daten (JSON-LD): ${jsonLdMatches.length}× vorhanden` }
    ];

    return {
        seo: {
            items: seoItems,
            found: seoItems.filter(i => i.ok).length,
            total: seoItems.length,
            schemaTypes: Array.from(schemaTypes)
        },
        geo: {
            items: geoItems,
            found: geoItems.filter(i => i.ok).length,
            total: geoItems.length
        }
    };
}

async function runLightAudit(url, placesKey) {
    // Parallel: HTML + Wayback + Place-Lookup (Branchen-Detect)
    const [htmlResult, wayback, placesType] = await Promise.all([
        fetchHtml(url),
        checkFreshness(url).catch(() => ({ available: false })),
        fetchPlaceType(url, placesKey).catch(() => null)
    ]);

    const { html, finalUrl, headers } = htmlResult;
    const tech = detectTechFromHtml(html, finalUrl);
    const techAge = analyzeTechAge(tech, wayback);
    const bfsg = bfsgHeuristic(html);

    // Sprint 67 — URL-Heuristik als Fallback wenn Google-Places leer liefert
    // ODER einen generic-Type wie "service"/"establishment" zurueckgibt, der
    // in BRANCH_STANDARDS nicht gemappt ist. So bekommen Sites mit klaren
    // Branchen-Slugs (kablan-immobilien.de) eine sinnvolle primaryType statt _default.
    let primaryType = placesType;
    if (!primaryType || !BRANCH_STANDARDS[primaryType]) {
        const guessed = guessBranchFromUrl(finalUrl || url);
        if (guessed && BRANCH_STANDARDS[guessed]) primaryType = guessed;
    }

    const subPages = extractSubPages(html, finalUrl, 8);
    const body = htmlToText(html, 50000);
    const branch = checkBranchStandards(primaryType, { subPages, body });

    // Sprint 68 — Pain-Points-Audit fuer Mittelstands-Buy-Trigger.
    const painPoints = detectPainPoints(html, headers, wayback, tech);

    // Sprint 69 — SEO + GEO Detection (parallele HEAD-Requests fuer robots/sitemap/llms.txt).
    const seoGeo = await detectSeoGeo(html, finalUrl).catch(() => null);

    // Sprint 69 — Karriaro-Cross-Sell Tools + Trend-Phrase pro Branche.
    const { getCrossSell } = require('./karriaro-cross-sell.js');
    const crossSell = getCrossSell(primaryType, branch);

    return {
        ok: true,
        light: true,
        url,
        finalUrl,
        tech,
        wayback,
        techAge,
        bfsg,
        branch,
        subPages,
        painPoints,
        seoGeo,
        crossSell
    };
}

module.exports = {
    runLightAudit,
    detectTechFromHtml,
    bfsgHeuristic,
    fetchHtml,
    fetchPlaceType,
    guessBranchFromUrl,
    detectPainPoints,
    detectSeoGeo
};
