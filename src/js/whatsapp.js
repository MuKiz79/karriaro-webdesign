/*
 * whatsapp.js — schwebender WhatsApp-Kontakt-Button (Karriaro).
 * Single-Source: ein <script src="/js/whatsapp.js"> pro Seite genuegt.
 *
 * Vorgefertigte Nachricht oeffnet WhatsApp-Chat zur Karriaro-Nummer.
 * Klasse `.whatsapp-fab` ist Absicht: die Concierge-FAB (concierge.js,
 * Sprint 251) erkennt genau diese Selektoren und weicht kollisionssicher
 * aus — daher liegt WhatsApp unten-LINKS, die „Fragen Sie uns"/Erstgespraech-
 * Ecke bleibt unten-rechts.
 *
 * Konfigurierbar ueber data-Attribute am eigenen <script>-Tag:
 *   data-phone   (nur Ziffern, intl. ohne +; Default 491742796784)
 *   data-message (vorgefertigter Text; Default = Karriaro-Erstkontakt)
 *   data-position ('left' | 'right'; Default 'left')
 */
(function () {
    'use strict';
    if (window.__krWhatsappInit) return;          // idempotent (kein Doppel-Inject)
    window.__krWhatsappInit = true;

    var script = document.currentScript ||
        document.querySelector('script[src*="whatsapp.js"]');
    function attr(name, fallback) {
        var v = script && script.getAttribute(name);
        return (v == null || v === '') ? fallback : v;
    }

    var PHONE = String(attr('data-phone', '491742796784')).replace(/[^0-9]/g, '');
    var MESSAGE = attr('data-message',
        'Guten Tag, ich interessiere mich für eine handcodierte Website von Karriaro. Können wir dazu sprechen?');
    var SIDE = attr('data-position', 'left') === 'right' ? 'right' : 'left';

    var href = 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(MESSAGE);

    // Offizielles WhatsApp-Glyph (Hoerer im Sprechblasen-Umriss), weiss auf Gruen.
    var GLYPH = '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M16.04 3C9.4 3 4 8.4 4 15.04c0 2.13.56 4.2 1.62 6.03L4 29l8.13-2.13a12.06 12.06 0 0 0 3.9.65h.01c6.64 0 12.04-5.4 12.04-12.04C28.08 8.4 22.68 3 16.04 3zm0 21.94h-.01a9.97 9.97 0 0 1-5.08-1.39l-.36-.22-3.77.99 1.01-3.67-.24-.38a9.94 9.94 0 0 1-1.52-5.28c0-5.5 4.48-9.97 9.98-9.97 2.67 0 5.17 1.04 7.06 2.93a9.9 9.9 0 0 1 2.92 7.05c0 5.5-4.47 9.96-9.97 9.96zm5.47-7.46c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.49-.89-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.49 0 1.47 1.07 2.88 1.22 3.08.15.2 2.11 3.22 5.1 4.51.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.34z"/></svg>';

    var css =
        '.whatsapp-fab{position:fixed;bottom:24px;' + SIDE + ':24px;z-index:2147483500;' +
        'width:56px;height:56px;border-radius:50%;background:#25D366;color:#fff;' +
        'display:inline-flex;align-items:center;justify-content:center;' +
        'box-shadow:0 8px 24px rgba(37,211,102,.35),0 2px 8px rgba(16,32,44,.18);' +
        'text-decoration:none;-webkit-tap-highlight-color:transparent;' +
        'transition:transform .2s ease,box-shadow .2s ease}' +
        '.whatsapp-fab:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(37,211,102,.42),0 4px 12px rgba(16,32,44,.2)}' +
        '.whatsapp-fab:focus-visible{outline:3px solid #16202C;outline-offset:3px}' +
        '@media (prefers-reduced-motion:reduce){.whatsapp-fab{transition:none}}' +
        'html.screenshot-mode .whatsapp-fab{display:none!important}';

    var style = document.createElement('style');
    style.textContent = css;

    var a = document.createElement('a');
    a.className = 'whatsapp-fab';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Per WhatsApp kontaktieren');
    a.title = 'Per WhatsApp schreiben';
    a.innerHTML = GLYPH;

    // Cookieloses Tracking (Lighthouse/Plausible-Bridge), falls vorhanden.
    a.addEventListener('click', function () {
        try { if (typeof window.krTrack === 'function') window.krTrack('WhatsApp Klick', { quelle: location.pathname }); } catch (e) {}
    });

    function mount() {
        if (document.querySelector('.whatsapp-fab')) return;   // schon da (z.B. statisch)
        document.head.appendChild(style);
        document.body.appendChild(a);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
