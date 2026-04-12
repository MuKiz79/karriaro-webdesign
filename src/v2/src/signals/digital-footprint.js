/**
 * Digital Footprint — Social Media + Pixel-Erkennung
 *
 * Erkennt Social-Media-Praesenz und Marketing-Pixel
 * aus PageSpeed Network Requests.
 *
 * @module signals/digital-footprint
 */

/**
 * Social-Media-Plattformen mit Erkennungs-Pattern
 * @type {Array<{key:string, pattern:RegExp, name:string, icon:string, weight:number}>}
 */
const PLATFORMS = [
    { key: 'facebook',  pattern: /facebook\.com\/(?!tr|sharer|dialog|plugins|flx)/i, name: 'Facebook',  icon: 'f',  weight: 1.0 },
    { key: 'instagram', pattern: /instagram\.com\/(?!embed|p\/)/i,                    name: 'Instagram', icon: 'i',  weight: 1.5 },
    { key: 'linkedin',  pattern: /linkedin\.com\/(?!sharing|cws)/i,                   name: 'LinkedIn',  icon: 'in', weight: 1.3 },
    { key: 'tiktok',    pattern: /tiktok\.com\/@/i,                                   name: 'TikTok',    icon: 'tt', weight: 1.4 },
    { key: 'youtube',   pattern: /youtube\.com\/(channel|c|@|user)/i,                 name: 'YouTube',   icon: 'yt', weight: 1.2 },
    { key: 'pinterest', pattern: /pinterest\.(com|de)\/(?!pin\/create)/i,             name: 'Pinterest', icon: 'p',  weight: 0.8 },
    { key: 'xing',      pattern: /xing\.com\/(profile|companies)/i,                   name: 'XING',      icon: 'x',  weight: 0.9 },
    { key: 'twitter',   pattern: /twitter\.com\/(?!intent|share)|x\.com\/(?!intent)/i, name: 'X/Twitter', icon: 'x',  weight: 0.7 },
];

/**
 * Marketing-Pixel und Widgets (zeigt aktive Nutzung)
 * @type {Array<{key:string, pattern:RegExp, name:string, signal:string}>}
 */
const PIXELS = [
    { key: 'fb_pixel',  pattern: /connect\.facebook\.net|fbevents\.js|fbq\(/i,  name: 'Facebook Pixel', signal: 'Aktives Werbebudget auf Facebook' },
    { key: 'ga',        pattern: /google-analytics\.com|gtag|googletagmanager/i, name: 'Google Analytics', signal: 'Tracking aktiv — misst Website-Besucher' },
    { key: 'hotjar',    pattern: /hotjar\.com|static\.hotjar/i,                  name: 'Hotjar',           signal: 'UX-Analyse aktiv — investiert in Optimierung' },
    { key: 'mailchimp', pattern: /mailchimp\.com|list-manage\.com|chimpstatic/i, name: 'Mailchimp',        signal: 'E-Mail-Marketing aktiv' },
    { key: 'hubspot',   pattern: /hubspot\.com|hs-scripts|hbspt/i,              name: 'HubSpot',          signal: 'CRM/Marketing-Automation' },
    { key: 'cookiebot', pattern: /cookiebot\.com|consent\.cookiebot/i,           name: 'Cookiebot',        signal: 'DSGVO-bewusst' },
];

/**
 * Analysiert den digitalen Fussabdruck aus PageSpeed-Daten
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @returns {{platforms: Array, pixels: Array, platformCount: number,
 *            maturity: number, hasInstagram: boolean, hasLinkedIn: boolean,
 *            hasFbPixel: boolean, hasAnalytics: boolean, insight: string,
 *            leadImpact: string, recommendedChannel: string, label: string}}
 */
export function analyzeDigitalFootprint(psiData) {
    const lh = psiData?.lighthouseResult || {};
    const netItems = lh.audits?.['network-requests']?.details?.items || [];
    const allUrls = netItems.map(i => i.url || '');

    // Plattformen erkennen
    const found = [];
    const profileUrls = {};
    for (const plat of PLATFORMS) {
        for (const url of allUrls) {
            if (plat.pattern.test(url)) {
                if (!found.find(f => f.key === plat.key)) {
                    found.push(plat);
                    // Versuche Profil-URL zu extrahieren
                    const match = url.match(new RegExp(
                        `(https?://(?:www\\.)?${plat.key === 'twitter' ? '(?:twitter|x)' : plat.name.toLowerCase()}\\.com/[^?"#\\s]+)`, 'i'
                    ));
                    if (match) profileUrls[plat.key] = match[1];
                }
                break;
            }
        }
    }

    // Pixel/Widgets erkennen
    const activePixels = [];
    const urlJoined = allUrls.join(' ');
    for (const px of PIXELS) {
        if (px.pattern.test(urlJoined)) activePixels.push(px);
    }

    // Social Proof auf der Website (eingebettete Feeds, Bewertungs-Widgets)
    const socialProofPatterns = [
        { key: 'ig_feed', pattern: /instagram.*embed|instafeed|elfsight.*instagram|snapwidget/i, name: 'Instagram-Feed eingebettet' },
        { key: 'google_reviews', pattern: /elfsight.*google|widget.*review|provenexpert.*widget|trustpilot.*widget/i, name: 'Bewertungs-Widget' },
        { key: 'testimonials', pattern: /testimonial|kundenstimm|referenz.*slider|review.*carousel/i, name: 'Testimonials/Referenzen' },
        { key: 'social_feed', pattern: /juicer\.io|curator\.io|smash.*balloon|social.*feed.*widget/i, name: 'Social-Feed-Widget' }
    ];
    const socialProof = [];
    for (const sp of socialProofPatterns) {
        if (sp.pattern.test(urlJoined)) socialProof.push(sp);
    }

    // Scoring
    const platformCount = found.length;
    const hasInstagram = found.some(f => f.key === 'instagram');
    const hasLinkedIn = found.some(f => f.key === 'linkedin');
    const hasFbPixel = activePixels.some(p => p.key === 'fb_pixel');
    const hasAnalytics = activePixels.some(p => p.key === 'ga');

    // Digital Maturity Score (0-1)
    const maturity = Math.min(1, (
        Math.min(1, platformCount / 4) * 0.40 +
        (hasFbPixel ? 0.20 : 0) +
        (hasAnalytics ? 0.10 : 0) +
        (hasInstagram ? 0.15 : 0) +
        (activePixels.length > 2 ? 0.15 : activePixels.length > 0 ? 0.08 : 0)
    ));

    // Lead-Signal Interpretation
    let insight, leadImpact;
    if (maturity > 0.6) {
        insight = 'Hohe digitale Reife — investiert bereits in Online-Marketing';
        leadImpact = 'positiv';
    } else if (maturity > 0.3) {
        insight = 'Mittlere digitale Praesenz — nutzt Social Media, aber Website hinkt hinterher';
        leadImpact = 'sehr_positiv';
    } else {
        insight = 'Geringe digitale Praesenz — wenig Online-Marketing-Aktivitaet';
        leadImpact = 'neutral';
    }

    // Kanal-Empfehlung
    let recommendedChannel = 'email';
    if (hasLinkedIn) recommendedChannel = 'linkedin';
    else if (hasInstagram && !hasLinkedIn) recommendedChannel = 'instagram';

    return {
        platforms: found.map(f => ({ ...f, profileUrl: profileUrls[f.key] || null })),
        pixels: activePixels,
        socialProof,
        hasSocialProof: socialProof.length > 0,
        platformCount,
        maturity: Math.round(maturity * 100) / 100,
        hasInstagram, hasLinkedIn, hasFbPixel, hasAnalytics,
        insight, leadImpact,
        recommendedChannel,
        label: maturity > 0.6 ? 'Digital reif' : maturity > 0.3 ? 'Digital aktiv' : 'Digital minimal'
    };
}
