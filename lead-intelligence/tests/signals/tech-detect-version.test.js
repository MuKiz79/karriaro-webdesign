import { describe, it, expect } from 'vitest';
import { detectTech } from '../../src/signals/tech-detect.js';

function psiWithUrls(urls) {
    return {
        lighthouseResult: {
            audits: {
                'network-requests': {
                    details: { items: urls.map(u => ({ url: u })) }
                }
            }
        }
    };
}

describe('detectTech — WordPress version single source', () => {
    it('extrahiert WP-Version wenn alle wp-includes-Assets dieselbe Version tragen', () => {
        const psi = psiWithUrls([
            'https://example.com/wp-includes/js/wp-emoji-release.min.js?ver=6.4.2',
            'https://example.com/wp-includes/js/dist/api-fetch.min.js?ver=6.4.2',
            'https://example.com/wp-includes/css/dist/block-library/style.min.css?ver=6.4.2'
        ]);
        const tech = detectTech(psi);
        expect(tech.cms).toBe('WordPress');
        expect(tech.version).toBe('6.4.2');
        expect(tech.versionConfidence).toBe('high');
    });

    it('ignoriert jQuery-Version (NICHT als WP-Core)', () => {
        // wp-includes/js/jquery/jquery.min.js?ver=3.7.1 ist die jQuery-Version,
        // NICHT die WP-Core-Version. Frueher wurde das faelschlicherweise als
        // WordPress 3.7.1 angezeigt.
        const psi = psiWithUrls([
            'https://example.com/wp-includes/js/jquery/jquery.min.js?ver=3.7.1',
            'https://example.com/wp-includes/js/wp-emoji-release.min.js?ver=6.4.2',
            'https://example.com/wp-includes/js/dist/api-fetch.min.js?ver=6.4.2'
        ]);
        const tech = detectTech(psi);
        expect(tech.version).toBe('6.4.2');
        expect(tech.version).not.toBe('3.7.1');
    });

    it('liefert Modus (haeufigste Version) wenn mehrere Versionen erkannt', () => {
        // Cache-Kollision: drei Assets mit alter Version, zwei mit neuer.
        // Modus = 5.6.6 (3x), nicht 6.4.2 (2x).
        const psi = psiWithUrls([
            'https://example.com/wp-includes/js/a.min.js?ver=5.6.6',
            'https://example.com/wp-includes/js/b.min.js?ver=5.6.6',
            'https://example.com/wp-includes/js/c.min.js?ver=5.6.6',
            'https://example.com/wp-includes/js/d.min.js?ver=6.4.2',
            'https://example.com/wp-includes/js/e.min.js?ver=6.4.2'
        ]);
        const tech = detectTech(psi);
        expect(tech.version).toBe('5.6.6');
        expect(tech.versionConfidence).toBe('medium');
    });

    it('ignoriert Plugin-Versions (wp-content/plugins/...)', () => {
        // Elementor-Plugin hat eigene Version, ist NICHT WP-Core.
        const psi = psiWithUrls([
            'https://example.com/wp-content/plugins/elementor/assets/js/frontend.min.js?ver=3.18.0',
            'https://example.com/wp-includes/js/wp-emoji-release.min.js?ver=6.4.2'
        ]);
        const tech = detectTech(psi);
        expect(tech.version).toBe('6.4.2');
        expect(tech.version).not.toBe('3.18.0');
    });

    it('liefert null wenn keine wp-includes-Asset-Versions erkennbar', () => {
        const psi = psiWithUrls([
            'https://example.com/wp-content/themes/twentytwentyfour/style.css'
            // kein ver= im wp-includes
        ]);
        const tech = detectTech(psi);
        expect(tech.version).toBeNull();
    });

    it('keine widerspruechlichen Versionen — der Bug-Fix', () => {
        // Der Original-Bug: tech-depth.js hat 4.2.17 gemeldet, tech-detect.js
        // 5.6.6, weil beide unabhaengig die ERSTE ver=-Treffer genommen haben.
        // Jetzt: nur EINE Quelle (tech-detect.js), eine Version.
        const psi = psiWithUrls([
            'https://example.com/wp-content/plugins/old-plugin/x.js?ver=4.2.17',  // Plugin
            'https://example.com/wp-includes/js/wp-emoji-release.min.js?ver=5.6.6', // Core
            'https://example.com/wp-includes/js/dist/api-fetch.min.js?ver=5.6.6'    // Core
        ]);
        const tech = detectTech(psi);
        expect(tech.version).toBe('5.6.6');
    });
});
