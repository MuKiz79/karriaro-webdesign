/* Karriaro — cookiefreie Ziel-Events (Sprint 252).
 *
 * Verdrahtet Anruf- und CTA-Klicks an die bestehende cookiefreie Bridge
 * window.krTrack (aus attribution.js). KEINE Cookies, kein 3rd-Party-Tag —
 * läuft über das eigene Lighthouse-Produkt bzw. das CustomEvent 'karriaro:track'.
 * Best-effort, niemals werfend; attribution.js muss vorher geladen sein.
 *
 *   - Klick auf  a[href^="tel:"]   → krTrack('Anruf Klick', { ort })
 *   - Klick auf  [data-cta]        → krTrack('CTA Klick',   { cta })
 *
 * Ergänzt das bereits beim Formular-Submit gefeuerte 'Lead Kontakt'.
 */
(function () {
    'use strict';

    function track(event, props) {
        try { if (typeof window.krTrack === 'function') window.krTrack(event, props); } catch (e) {}
    }

    function init() {
        document.addEventListener('click', function (e) {
            var el = e.target && e.target.closest ? e.target.closest('a[href^="tel:"], [data-cta]') : null;
            if (!el) return;

            // Anruf-Klick (auch wenn der Link zusätzlich ein data-cta trägt)
            var href = el.getAttribute('href') || '';
            if (href.indexOf('tel:') === 0) {
                track('Anruf Klick', { ort: el.getAttribute('data-cta') || 'tel-link' });
                return;
            }

            // Sonstige CTAs (Erstgespräch-Buttons o. Ä.)
            var cta = el.getAttribute('data-cta');
            if (cta) track('CTA Klick', { cta: cta });
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
