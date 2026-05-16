/**
 * Sprint 82 — Single-Source-of-Truth fuer CMS-/Baukasten-Pattern.
 *
 * Vorher: TECH_PATTERNS war in light-audit.js + audit-pipeline.js identisch
 * dupliziert (Sprint-Drift-Risiko bei Pattern-Updates, beobachtet zwischen
 * Sprint 68 → 75).
 *
 * Jetzt: Beide Module require()-en diese Datei. Audit-pipeline.js arbeitet
 * auf PSI-Network-Request-URLs, light-audit.js auf HTML-Body-Text — das
 * Pattern selbst ist aber identisch.
 */

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
    // Diese drei nur in der HTML-Body-Variante (light-audit.js), nicht in PSI-URL-Variante.
    { match: /typo3conf|typo3temp/i, cms: 'TYPO3', baukasten: false },
    { match: /joomla|com_content/i, cms: 'Joomla', baukasten: false },
    { match: /drupal/i, cms: 'Drupal', baukasten: false },
    { match: /contao|tl_files/i, cms: 'Contao', baukasten: false }
];

const BAUKASTEN_SUBDOMAIN = /\.jimdosite\.com|\.jimdo\.com|\.wixsite\.com|\.weebly\.com|\.webflow\.io/i;

module.exports = { TECH_PATTERNS, BAUKASTEN_SUBDOMAIN };
