/**
 * Google Ads / Display Network / Bing Ads Erkennung
 *
 * Erkennt aus Network Requests ob ein Unternehmen
 * bezahlte Online-Werbung schaltet.
 *
 * @module signals/google-ads
 */

/**
 * Erkennt Google Ads, Display Network, Conversion Tracking und Microsoft Ads
 *
 * Zwei Quellen:
 *  1. PSI-Network-Requests — was beim Laden OHNE Einwilligung tatsächlich feuert.
 *  2. `adEvidence` (optional, aus der gleichnamigen Cloud Function) — statischer
 *     Fund im Seiten-Quelltext und im öffentlichen GTM-Container. Genau das
 *     repariert die Consent-Blindheit: In Deutschland liegen Ad-Tags fast immer
 *     im Container und feuern erst nach dem Cookie-Banner.
 *
 * Ohne `adEvidence` verhält sich die Funktion exakt wie zuvor.
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @param {Object|null} [adEvidence] - Antwort der adEvidence-Function
 * @returns {{active: boolean, signals: string[], adSpend: boolean, hasTagManager: boolean,
 *            consentBlind: boolean, evidence: Object|null, metaPixel: Object|null,
 *            adConsentMode: Object|null, blocked: string|null,
 *            insight: string, funnelImpact: number}}
 */
export function detectGoogleAds(psiData, adEvidence = null) {
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || [])
        .map(i => i.url || '').join(' ');

    const signals = [];
    if (/googleadservices\.com|googlesyndication\.com/i.test(urls)) {
        signals.push('Google Ads aktiv');
    }
    if (/doubleclick\.net/i.test(urls)) {
        signals.push('Google Display Network');
    }
    if (/google\.com\/pagead/i.test(urls)) {
        signals.push('Google Ads Conversion Tracking');
    }
    if (/bing\.com\/action|bingads/i.test(urls)) {
        signals.push('Microsoft Ads');
    }

    // Harter Beweis auch OHNE geladenes Ad-Skript: eine Conversion-ID im
    // gtag-/GTM-Aufruf. Google-Praefixe sind eindeutig — AW = Google Ads,
    // G/GT = Analytics/Tag-Manager, GTM = Container. Nur AW zaehlt als Werbung.
    const awMatch = urls.match(/\bAW-[A-Z0-9]{6,}/i);
    if (awMatch && !signals.some(s => /Google Ads/i.test(s))) {
        signals.push('Google Ads aktiv');
    }

    // ── Consent-Blindheit (wichtig fuer die Interpretation) ──────────────────
    // Lighthouse klickt keinen Cookie-Banner weg. Auf DE-Seiten liegen Ad- und
    // Remarketing-Tags nach DSGVO fast immer IM Tag-Manager und feuern erst nach
    // Einwilligung — empirisch verifiziert an check24.de und thermomix.de
    // (2026-07-25): beide laden gtm.js, aber KEIN googleadservices/doubleclick,
    // obwohl beide nachweislich Anzeigen schalten.
    // Daraus folgt: "keine Anzeigen erkannt" ist NICHT "schaltet keine Anzeigen".
    // Der Tag-Manager wird deshalb separat gemeldet — als schwaecheres Signal
    // ("verwaltet Marketing-Tags") und als Hinweis, dass die Messung blind sein
    // kann. Er wird bewusst NICHT als laufende Werbung gewertet.
    // ── Statische Evidenz (adEvidence-Function) ──────────────────────────────
    // Löst genau die oben beschriebene Blindheit auf: gefunden wird, was
    // KONFIGURIERT ist, nicht was gefeuert hat. Zwei Vertrauensstufen:
    //   'aktiv'        — Tag steht im Seiten-Quelltext
    //   'konfiguriert' — Tag steckt nur im GTM-Container
    // Eine Bot-Wall (blocked) wird ignoriert — daraus folgt gar nichts.
    const ev = (adEvidence?.ok && !adEvidence.blocked) ? adEvidence.adEvidence : null;
    let evidence = null;
    if (ev?.googleAds?.found && !signals.some(s => /Google Ads/i.test(s))) {
        evidence = { source: ev.googleAds.source, confidence: ev.googleAds.confidence, ids: ev.googleAds.ids || [] };
        signals.push(ev.googleAds.source === 'html'
            ? 'Google Ads aktiv (Conversion-Tag im Quelltext)'
            : 'Google Ads konfiguriert (im GTM-Container hinterlegt)');
    }
    if (ev?.microsoftAds?.found && !signals.some(s => /Microsoft/i.test(s))) {
        signals.push(ev.microsoftAds.source === 'html'
            ? 'Microsoft Ads aktiv'
            : 'Microsoft Ads konfiguriert (GTM-Container)');
    }
    if (ev?.display?.found && !signals.some(s => /Display/i.test(s))) {
        signals.push(ev.display.source === 'html'
            ? 'Google Display Network'
            : 'Remarketing konfiguriert (GTM-Container)');
    }

    const hasTagManager = /googletagmanager\.com/i.test(urls)
        || (adEvidence?.gtmContainers?.length || 0) > 0;
    const active = signals.length > 0;
    const consentBlind = !active && hasTagManager;

    // Werbe-Consent-Mode: Indiz, KEIN Beweis. Wer `ads_data_redaction` oder die
    // Consent-Mode-v2-Felder setzt, betreibt üblicherweise Google Ads — viele
    // Consent-Tools schreiben den Block aber als Vorlage mit. Fließt deshalb
    // NICHT in `active` ein, sondern nur als eigenes, schwächeres Signal.
    const adConsentMode = ev?.adConsentMode?.found ? ev.adConsentMode : null;

    return {
        active,
        signals,
        adSpend: active,
        hasTagManager,
        consentBlind,
        evidence,
        metaPixel: ev?.metaPixel || null,
        adConsentMode,
        blocked: adEvidence?.blocked || null,
        insight: evidence?.source === 'gtm-container'
            ? 'Werbung im GTM-Container konfiguriert — der Betrieb gibt sehr wahrscheinlich Geld für Anzeigen aus (die Ausspielung selbst ist erst nach Cookie-Einwilligung messbar)'
            : active
            ? 'Gibt bereits Geld für Online-Werbung aus — versteht den Wert digitaler Präsenz'
            : adConsentMode
            ? 'Werbe-Einwilligung konfiguriert (ad_storage/ads_data_redaction) — Hinweis auf Google Ads, aber kein Nachweis'
            : adEvidence?.blocked
            ? 'Seite hat die Prüfung blockiert (Bot-Schutz) — über Werbung lässt sich daraus nichts ableiten'
            : consentBlind
            ? 'Keine Anzeigen messbar — Tag-Manager vorhanden, Ad-Tags feuern aber erst nach Cookie-Einwilligung. Nicht als "schaltet keine Anzeigen" lesen.'
            : 'Keine bezahlte Werbung erkannt',
        funnelImpact: active ? 3 : 0
    };
}
