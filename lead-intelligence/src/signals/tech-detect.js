/**
 * CMS / Baukasten-Erkennung aus PageSpeed Network Requests
 *
 * Erkennt WordPress, Wix, Jimdo, Squarespace, Shopify, Webflow etc.
 * via Lighthouse stackPacks, URL-Patterns und Subdomain-Check.
 *
 * @module signals/tech-detect
 */

/**
 * CMS/Baukasten-Patterns fuer URL-Matching
 * @type {Array<{match: RegExp, cms: string, baukasten: boolean}>}
 */
const PATTERNS = [
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
];

/**
 * Subdomain-Patterns die auf einen Baukasten hinweisen
 * @type {RegExp}
 */
const BAUKASTEN_SUBDOMAIN = /\.jimdosite\.com|\.jimdo\.com|\.wixsite\.com|\.weebly\.com|\.webflow\.io/;

/**
 * Erkennt CMS/Technologie aus PageSpeed-Daten
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @returns {{cms: string|null, version: string|null, signals: string[], isBaukasten: boolean}}
 */
export function detectTech(psiData) {
    const lh = psiData?.lighthouseResult || {};
    const result = { cms: null, version: null, signals: [], isBaukasten: false };

    // 1. stackPacks (Lighthouse native detection)
    const stacks = lh.stackPacks || [];
    for (const s of stacks) {
        const id = (s.id || '').toLowerCase();
        if (id === 'wordpress') {
            result.cms = 'WordPress';
            result.signals.push('Lighthouse stackPack: WordPress');
        } else if (id === 'joomla') {
            result.cms = 'Joomla';
            result.signals.push('Lighthouse stackPack: Joomla');
        } else if (id === 'drupal') {
            result.cms = 'Drupal';
            result.signals.push('Lighthouse stackPack: Drupal');
        } else if (id === 'magento') {
            result.cms = 'Magento';
            result.signals.push('Lighthouse stackPack: Magento');
        }
    }

    // 2. Network requests URL patterns
    const netItems = lh.audits?.['network-requests']?.details?.items || [];
    const urls = netItems.map(i => i.url || '').join(' ');

    for (const p of PATTERNS) {
        if (p.match.test(urls)) {
            if (!result.cms) result.cms = p.cms;
            result.isBaukasten = result.isBaukasten || p.baukasten;
            result.signals.push(`URL-Pattern: ${p.cms}`);
        }
    }

    // 3. WordPress version from generator meta or URLs
    const wpVer = urls.match(/wp-includes\/[^?]*\?ver=([0-9.]+)/);
    if (wpVer) result.version = wpVer[1];

    // 4. Final URL check (subdomain = Baukasten)
    const finalUrl = lh.finalDisplayedUrl || '';
    if (BAUKASTEN_SUBDOMAIN.test(finalUrl)) {
        result.isBaukasten = true;
        result.signals.push('Subdomain eines Baukastens');
    }

    if (!result.cms) result.cms = 'Nicht erkannt (moeglicherweise handcodiert)';
    return result;
}
