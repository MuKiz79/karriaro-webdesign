/**
 * Ad-Evidence — statischer Werbe-Nachweis aus Seiten-HTML und GTM-Container.
 *
 * ─── Warum dieses Modul existiert ───────────────────────────────────────────
 * Die bisherige Werbe-Erkennung im Lead-Intelligence-Tool las die
 * PageSpeed-Network-Requests (signals/google-ads.js). Auf deutschen Seiten ist
 * das weitgehend BLIND: empirisch am 2026-07-25 an fünf Betrieben gemessen, die
 * nachweislich Google Ads schalten (check24.de, thermomix.de, my-hammer.de,
 * dachdecker.com, werkenntdenbesten.de) — 0 von 5 lieferten ein Ad-Tag aus.
 * Grund: Nach DSGVO liegen Ad- und Remarketing-Tags im Tag-Manager und feuern
 * erst nach Cookie-Einwilligung. Lighthouse klickt keinen Banner weg.
 *
 * Der Ausweg: Der GTM-Container ist ÖFFENTLICH abrufbar
 * (googletagmanager.com/gtm.js?id=GTM-XXX) und enthält die Tag-Konfiguration im
 * Klartext — inklusive der Google-Ads-Conversion-IDs. Wer Werbung eingerichtet
 * hat, ist damit ohne Consent-Klick nachweisbar.
 *
 * ─── Ehrlichkeits-Regel (wichtig) ───────────────────────────────────────────
 * Was der Container ENTHÄLT, beweist eine eingerichtete Werbe-Infrastruktur —
 * NICHT zwingend eine laufende Kampagne. Deshalb zwei Vertrauensstufen:
 *   • 'aktiv'        — Tag liegt direkt im Seiten-Quelltext (feuert beim Laden)
 *   • 'konfiguriert' — Tag steckt nur im Container (eingerichtet, Ausspielung
 *                      nicht messbar)
 * Beides zählt als Kaufsignal, aber der Beweistext unterscheidet sie. Es wird
 * NIE eine laufende Kampagne behauptet, die wir nicht sehen können.
 *
 * ─── Runbook: Meta-Ad-Library-API (noch NICHT gebaut) ───────────────────────
 * Der einzige belastbare, legale Weg zu "schaltet nachweislich AKTIVE Anzeigen"
 * ist die offizielle Meta-Ad-Library-API (gratis; deckt in DE wegen DSA Art. 39
 * auch kommerzielle KMU-Anzeigen ab). Sie würde 'konfiguriert' auf
 * 'aktiv (Meta-Bibliothek)' hochstufen. Voraussetzungen (Founder, ~30 Min):
 *   1. developers.facebook.com → App anlegen (Typ "Business"), mit dem
 *      Business-Manager verknüpfen.
 *   2. Identitätsbestätigung starten (Meta verlangt sie für die Ad-Library-API).
 *   3. System-User im Business Manager anlegen, Token mit `ads_read` erzeugen.
 *   4. App-Review für die Ad Library API einreichen (Begründung: Markt- und
 *      Wettbewerbsanalyse). Dauer 5–10 Tage.
 *   5. Token vorhanden → Integration über den `ads_archive`-Endpoint mit
 *      `ad_reached_countries=DE`, Suche nach Firmenname.
 * Bis dahin: manueller Gegencheck unter facebook.com/ads/library.
 * Das Google Ads Transparency Center hat KEINE offizielle API (nur bezahlte
 * Scraper) und bleibt deshalb bewusst außen vor.
 *
 * Reine Analyse — kein Netz, kein Firestore. Dadurch vollständig ohne Mock
 * testbar (tests/signals/ad-evidence.test.js).
 *
 * @module lib/ad-evidence
 */

/**
 * Erkennungsmuster. Exportiert, damit Tests gegen dieselbe Quelle prüfen.
 *
 * Google-Präfixe sind eindeutig und dürfen NICHT vermischt werden:
 *   AW-  = Google Ads (Werbung)          ← nur das zählt hier
 *   G-   = GA4 (Analytics)
 *   GT-  = Google Tag
 *   GTM- = Tag-Manager-Container
 *   UA-  = Universal Analytics (alt)
 */
const RE = {
    // ── Google Ads ──
    gtagSrcAw: /googletagmanager\.com\/gtag\/js\?[^"'\s]*\bid=(AW-\d{6,12})/gi,
    gtagConfig: /gtag\(\s*['"]config['"]\s*,\s*['"](AW-\d{6,12})['"]/gi,
    aw: /\bAW-\d{6,12}\b/g,
    // ── Tag-Manager-Container ──
    gtm: /\bGTM-[A-Z0-9]{4,10}\b/g,
    // ── Meta/Facebook-Pixel ──
    fbqInit: /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{5,20})['"]/gi,
    fbTr: /facebook\.com\/tr\?[^"'\s]*\bid=(\d{5,20})/gi,
    fbVtp: /vtp_pixelId['"]?\s*[:=]\s*['"](\d{5,20})['"]/gi,   // GTM-Template-Variante
    // ── Microsoft/Bing Ads ──
    msUet: /bat\.bing\.com\/bat\.js|\buetq\b/i,
    msUetTi: /["']ti["']\s*[:,]\s*["'](\d{6,12})["']/gi,       // nur werten, wenn msUet matcht
    // ── Display/Remarketing ──
    display: /doubleclick\.net|googleadservices\.com|googlesyndication\.com/i,
    // ── Consent-Management (nur informativ, NIE ein Werbe-Beweis) ──
    cmp: /(usercentrics|cookiebot|consentmanager|borlabs|onetrust|klaro|complianz)/i,
    consentDenied: /ad_storage['"]?\s*[:,]\s*['"]denied/i,
    // ── Google Consent Mode mit WERBE-Parametern ──
    // Wer diese Parameter setzt, hat Werbe-Tags, die er steuern muss.
    // `ads_data_redaction` und `ad_personalization`/`ad_user_data` (Consent
    // Mode v2) sind spezifisch für Google Ads, nicht für Analytics.
    // ⚠️ Schwächer als eine AW-ID: viele Consent-Tools emittieren diesen Block
    // als BOILERPLATE, auch ohne aktive Kampagne. Deshalb eigene, klar
    // niedrigere Stufe — nie ein Beweis, immer nur ein Indiz.
    adsRedaction: /ads_data_redaction/i,
    adConsentParam: /\b(ad_storage|ad_user_data|ad_personalization)\b/gi
};

/** Maximal verfolgte GTM-Container je Seite (Kosten-/Zeitdeckel). */
const MAX_CONTAINERS = 3;

/** Scan-Fenster für Container-JS — Container werden 100–500 KB groß. */
const CONTAINER_SCAN_LIMIT = 1500000;

/** Alle Capture-Group-Treffer eines globalen Musters, dedupliziert. */
function captureAll(text, re) {
    const out = new Set();
    for (const m of String(text || '').matchAll(re)) {
        if (m[1]) out.add(m[1]);
    }
    return [...out];
}

/** Alle Voll-Treffer eines globalen Musters, dedupliziert. */
function matchAll(text, re) {
    const out = new Set();
    for (const m of String(text || '').matchAll(re)) {
        out.add(m[0]);
    }
    return [...out];
}

/**
 * Erkennt Google Consent Mode mit werbebezogenen Parametern.
 *
 * Indiz, KEIN Beweis: Wer `ads_data_redaction` oder die Consent-Mode-v2-Felder
 * `ad_user_data`/`ad_personalization` setzt, betreibt üblicherweise Google Ads —
 * viele Consent-Tools schreiben den Block aber auch als Vorlage mit. Deshalb
 * getrennt gehalten und nie mit einem AW-Fund gleichgesetzt.
 *
 * @param {string} text - HTML oder Container-JS
 * @returns {{found:boolean, params:string[], redaction:boolean}}
 */
function scanAdConsentMode(text) {
    const t = String(text || '');
    const redaction = RE.adsRedaction.test(t);
    const params = [...new Set(matchAll(t, RE.adConsentParam).map(p => p.toLowerCase()))];
    return { found: redaction || params.length > 0, params, redaction };
}

/**
 * Durchsucht das rohe Seiten-HTML nach Werbe-Belegen.
 *
 * Findet bewusst AUCH Tags, die ein Consent-Blocker auf `type="text/plain"`
 * gesetzt hat — gesucht ist der Konfigurations-Beweis, nicht die Ausführung.
 *
 * @param {string} html
 * @returns {{googleAdsIds:string[], gtmIds:string[], fbPixelIds:string[],
 *            microsoft:{found:boolean, ids:string[]}, display:boolean, cmp:string|null}}
 */
function scanHtmlForAdTags(html) {
    const h = String(html || '');

    const googleAdsIds = [...new Set([
        ...captureAll(h, RE.gtagSrcAw),
        ...captureAll(h, RE.gtagConfig),
        ...matchAll(h, RE.aw)
    ])];

    const fbPixelIds = [...new Set([
        ...captureAll(h, RE.fbqInit),
        ...captureAll(h, RE.fbTr)
    ])];

    const msFound = RE.msUet.test(h);
    const cmpMatch = h.match(RE.cmp);

    return {
        googleAdsIds,
        gtmIds: matchAll(h, RE.gtm).slice(0, MAX_CONTAINERS),
        fbPixelIds,
        // UET-Tag-IDs nur ernst nehmen, wenn auch das Bing-Skript da ist —
        // sonst matcht ein beliebiges `ti:"123456"` aus fremdem JS.
        microsoft: { found: msFound, ids: msFound ? captureAll(h, RE.msUetTi) : [] },
        display: RE.display.test(h),
        cmp: cmpMatch ? cmpMatch[1].toLowerCase() : null,
        adConsentMode: scanAdConsentMode(h)
    };
}

/**
 * Durchsucht das JavaScript eines öffentlichen GTM-Containers.
 *
 * @param {string} containerJs - roher Container-Inhalt (wird intern begrenzt)
 * @returns {{awIds:string[], fbPixelIds:string[], uetIds:string[],
 *            microsoft:boolean, display:boolean, consentModeDenied:boolean}}
 */
function scanGtmContainer(containerJs) {
    const js = String(containerJs || '').slice(0, CONTAINER_SCAN_LIMIT);
    const msFound = RE.msUet.test(js);

    return {
        awIds: [...new Set([...matchAll(js, RE.aw), ...captureAll(js, RE.gtagConfig)])],
        fbPixelIds: [...new Set([...captureAll(js, RE.fbVtp), ...captureAll(js, RE.fbqInit)])],
        uetIds: msFound ? captureAll(js, RE.msUetTi) : [],
        microsoft: msFound,
        display: RE.display.test(js),
        // Consent-Mode auf "denied" heißt NICHT "keine Werbung" — im Gegenteil:
        // wer Consent-Mode konfiguriert, hat Werbe-Tags, die er steuern muss.
        consentModeDenied: RE.consentDenied.test(js),
        adConsentMode: scanAdConsentMode(js)
    };
}

/**
 * Führt HTML- und Container-Befunde zu einem Beweis-Objekt zusammen.
 *
 * Präzedenz: 'html' schlägt 'gtm-container' — ein Tag im Quelltext feuert beim
 * Laden ('aktiv'), ein Tag im Container ist nur eingerichtet ('konfiguriert').
 *
 * @param {Object} htmlScan - Ergebnis von scanHtmlForAdTags
 * @param {Array} containerScans - [{ id, fetched, hits?, consentModeDenied? }]
 * @returns {Object} adEvidence-Objekt (siehe Endpoint-Schema)
 */
function buildAdEvidence(htmlScan, containerScans = []) {
    const hs = htmlScan || {};
    const scans = (containerScans || []).filter(c => c && c.fetched && c.hits);

    const gather = (fromHtml, containerKey) => {
        const htmlIds = [...new Set(fromHtml || [])];
        const containerIds = [...new Set(scans.flatMap(c => c.hits[containerKey] || []))];
        if (htmlIds.length) {
            return { found: true, ids: htmlIds, source: 'html', confidence: 'aktiv' };
        }
        if (containerIds.length) {
            return { found: true, ids: containerIds, source: 'gtm-container', confidence: 'konfiguriert' };
        }
        return { found: false, ids: [], source: null, confidence: null };
    };

    const googleAds = gather(hs.googleAdsIds, 'awIds');
    const metaPixel = gather(hs.fbPixelIds, 'fbPixelIds');

    // Microsoft: die ID ist optional, das Skript allein genügt als Beleg.
    const msHtml = !!hs.microsoft?.found;
    const msContainer = scans.some(c => c.hits.microsoft);
    const microsoftAds = msHtml
        ? { found: true, ids: hs.microsoft.ids || [], source: 'html', confidence: 'aktiv' }
        : msContainer
        ? { found: true, ids: [...new Set(scans.flatMap(c => c.hits.uetIds || []))], source: 'gtm-container', confidence: 'konfiguriert' }
        : { found: false, ids: [], source: null, confidence: null };

    const displayHtml = !!hs.display;
    const displayContainer = scans.some(c => c.hits.display);

    // Werbe-Consent-Mode: nur relevant, solange KEIN harter Fund vorliegt —
    // sonst ist es redundantes Beiwerk. Bleibt bewusst ein eigenes Feld und
    // fließt NIE in googleAds.found ein (Indiz ≠ Beweis).
    const acmHtml = hs.adConsentMode || { found: false, params: [], redaction: false };
    const acmContainer = scans.map(c => c.hits.adConsentMode).filter(Boolean);
    const acmFound = acmHtml.found || acmContainer.some(a => a.found);
    const acmRedaction = acmHtml.redaction || acmContainer.some(a => a.redaction);

    return {
        googleAds,
        metaPixel,
        microsoftAds,
        display: {
            found: displayHtml || displayContainer,
            source: displayHtml ? 'html' : displayContainer ? 'gtm-container' : null
        },
        adConsentMode: {
            found: acmFound,
            redaction: acmRedaction,
            params: [...new Set([...acmHtml.params, ...acmContainer.flatMap(a => a.params)])]
        }
    };
}

module.exports = {
    scanHtmlForAdTags,
    scanAdConsentMode,
    scanGtmContainer,
    buildAdEvidence,
    RE,
    MAX_CONTAINERS,
    CONTAINER_SCAN_LIMIT
};
