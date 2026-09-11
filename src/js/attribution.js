/* Google-Ads-Basis-Tag ENTFERNT (2026-07-06, Founder-Entscheidung „cookiefrei").
 * Der gtag/AW-18260891602 setzte den Werbe-Cookie _gcl_au + kontaktierte DoubleClick
 * OHNE Einwilligung (§ 25 TDDDG) — jetzt raus. Conversion-Messung läuft cookiefrei
 * über den unten erfassten gclid (sessionStorage) + Google-Ads-Offline-/Enhanced-
 * Conversions (Einrichtung im Google-Ads-Konto, nicht clientseitig). Kein gtag,
 * kein 3rd-Party-Werbe-Cookie mehr — im Einklang mit der Marken-/Engineering-Regel. */

/* Karriaro — First-Touch-Attribution + cookiefreier Track-Bridge (Sprint 199).
 *
 * Zweck: Vor dem ersten Werbe-Euro jeden Lead auf seine Anzeige zurückführbar
 * machen — OHNE Cookies / 3rd-Party-Tracker (Datenschutz bleibt gültig).
 *
 * - Erfasst beim ersten Aufruf der Session utm-Parameter, gclid/fbclid/msclkid,
 *   Referrer + Landing-Path und legt sie in sessionStorage (First-Touch, nie überschrieben).
 * - Überlebt den m-dot-Hop: der Redirect nimmt location.search mit, die Mobil-
 *   Seite liest dieselben Params frisch.
 * - Stellt window.krAttributionFlat() (flaches Objekt für Form-Felder/Payloads)
 *   und window.krTrack(event, props) bereit (Plausible falls da, Lighthouse-API
 *   falls da, + dokumentiertes CustomEvent 'karriaro:track' für eigene t.js-
 *   Verdrahtung). Alles best-effort, niemals werfend.
 */
(function () {
    'use strict';

    var KEY = 'kr_attribution';
    var PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid'];
    // Empfehlungspartner (/empfehlungspartner): ?partner=<code> aus dem persönlichen
    // Empfehlungslink. Nur Buchstaben, Ziffern und Bindestrich, 2–40 Zeichen.
    var PARTNER_RE = /^[a-z0-9][a-z0-9-]{1,39}$/i;

    function read() {
        try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
    }

    function partnerAusUrl() {
        try {
            var v = new URLSearchParams(location.search || '').get('partner');
            v = v ? String(v).trim() : '';
            return PARTNER_RE.test(v) ? v.toLowerCase() : null;
        } catch (e) { return null; }
    }

    function capture() {
        var existing = read();
        if (existing) {
            // First-Touch bleibt unangetastet. Einzige Ergänzung: öffnet jemand den
            // Partner-Link erst später in derselben Sitzung, wird der fehlende Partner
            // nachgetragen — ein schon erfasster Partner wird nie überschrieben.
            if (!existing.partner) {
                var spaeterPartner = partnerAusUrl();
                if (spaeterPartner) {
                    existing.partner = spaeterPartner;
                    try { sessionStorage.setItem(KEY, JSON.stringify(existing)); } catch (e) {}
                }
            }
            return existing;
        }

        var data = {};
        var partner = partnerAusUrl();
        if (partner) data.partner = partner;
        try {
            var p = new URLSearchParams(location.search || '');
            PARAMS.forEach(function (k) {
                var v = p.get(k);
                if (v) data[k] = String(v).slice(0, 200);
            });
        } catch (e) { /* URLSearchParams nicht verfügbar */ }

        try { data.referrer = (document.referrer || '').slice(0, 300); } catch (e) {}
        try { data.landing = (location.pathname + location.search).slice(0, 300); } catch (e) {}
        try { data.ts = new Date().toISOString(); } catch (e) {}

        try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
        return data;
    }

    var attribution = capture();
    window.krAttribution = attribution;

    // Flaches Objekt nur mit gesetzten Feldern — für FormData-Append / JSON-Payloads.
    window.krAttributionFlat = function () {
        var out = {};
        PARAMS.concat(['partner', 'referrer', 'landing']).forEach(function (k) {
            if (attribution && attribution[k]) out[k] = attribution[k];
        });
        return out;
    };

    // Cookiefreier Track-Bridge. Mehrere Senken, alle best-effort:
    //   1) Plausible (falls jemals geladen)
    //   2) Lighthouse-Tracker (eigenes Produkt; window.lighthouse?.track)
    //   3) CustomEvent 'karriaro:track' → an die eigene t.js andockbar
    window.krTrack = function (event, props) {
        var detail = { event: event, props: props || {}, attribution: attribution };
        try { if (typeof window.plausible === 'function') window.plausible(event, { props: detail.props }); } catch (e) {}
        try { if (window.lighthouse && typeof window.lighthouse.track === 'function') window.lighthouse.track(event, detail.props); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent('karriaro:track', { detail: detail })); } catch (e) {}
    };
})();
