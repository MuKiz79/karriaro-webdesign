/**
 * CMS-Version aus dem Quelltext — lib/site-evidence.js scanTechVersion (F15).
 *
 * Präzisions-Kritik eingebaut: Plugin-?ver darf NIE als Core-Version gelesen
 * werden, und ein Fund muss exakt die Namensform liefern, die
 * analysis/tech-age.js (CMS_EOL_YEAR) als Schlüssel kennt.
 */
const test = require('node:test');
const assert = require('node:assert');
const { scanTechVersion } = require('../lib/site-evidence.js');

test('Generator-Meta: WordPress mit Version', () => {
    const r = scanTechVersion('<meta name="generator" content="WordPress 4.9.8" />');
    assert.deepEqual(r, { cms: 'WordPress', version: '4.9.8', quelle: 'generator' });
});

test('Generator-Meta: Attribut-Reihenfolge vertauscht + Joomla!-Ausrufezeichen', () => {
    const r = scanTechVersion('<meta content="Joomla! 3.10.11" name="generator">');
    assert.deepEqual(r, { cms: 'Joomla', version: '3.10.11', quelle: 'generator' });
});

test('TYPO3 CMS wird auf den EOL-Tabellen-Schlüssel normalisiert', () => {
    const r = scanTechVersion('<meta name="generator" content="TYPO3 CMS 9.5">');
    assert.equal(r.cms, 'TYPO3');
    assert.equal(r.version, '9.5');
});

test('wp-includes-?ver als Core-Fallback (kein Generator-Tag)', () => {
    const r = scanTechVersion('<script src="https://x.de/wp-includes/js/wp-embed.min.js?ver=4.9.8"></script>');
    assert.deepEqual(r, { cms: 'WordPress', version: '4.9.8', quelle: 'wp-includes' });
});

test('🚨 Plugin-?ver zählt NICHT als Core-Version', () => {
    const html = '<link href="/wp-content/plugins/elementor/css/frontend.min.css?ver=3.18.2">'
        + '<script src="/wp-content/themes/astra/main.js?ver=2.1.0"></script>';
    assert.equal(scanTechVersion(html), null);
});

test('Generator ohne Version / unbekanntes CMS / leer → null (ungeprüft, nie geraten)', () => {
    assert.equal(scanTechVersion('<meta name="generator" content="WordPress">'), null);
    assert.equal(scanTechVersion('<meta name="generator" content="Hugo 0.121.0">'), null);
    assert.equal(scanTechVersion(''), null);
    assert.equal(scanTechVersion(null), null);
});

test('Generator schlägt wp-includes (präzisere Quelle zuerst)', () => {
    const html = '<meta name="generator" content="WordPress 6.4.2">'
        + '<script src="/wp-includes/js/x.js?ver=5.0"></script>';
    const r = scanTechVersion(html);
    assert.equal(r.version, '6.4.2');
    assert.equal(r.quelle, 'generator');
});
