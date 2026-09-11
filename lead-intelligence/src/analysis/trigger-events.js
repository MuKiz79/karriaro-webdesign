/**
 * #4 Trigger Events — Timing-Signale die Kaufbereitschaft anzeigen
 *
 * Forschung: Der ERSTE Anbieter der auf ein Trigger-Event reagiert,
 * gewinnt 35-50% der Deals.
 *
 * 2026-09-10: Zusätzlich die „Anlässe mit Datum" (Chrome-Warnung, PHP ohne
 * Sicherheitsupdates, CMS-Support-Ende). Die Helfer unten sind die EINE Quelle
 * dafür — Scoring (scoring/opportunity.js), Schnellsuche-Karte
 * (scoring/quick-reasons.js) und Technologie-Analyse (analysis/tech-depth.js)
 * lesen daraus, damit kein Text an zwei Stellen auseinanderläuft.
 */
import { bewerteCmsVersion, formatiereDatum, kanonischerCmsName } from './tech-age.js';

/**
 * Saisonale Trigger je Branche (Monate 0-basiert = Vor-Saison: jetzt bauen = rechtzeitig
 * fertig). Exportiert → auch der Scanner nutzt sie für den billigen Timing-Chip, ohne den
 * ganzen Detektor (der teure Deep-Daten braucht) erneut zu fahren.
 */
export const SEASONAL_TRIGGERS = {
    'restaurant': { months: [1, 2, 3], label: 'Vor der Sommersaison — neue Website jetzt = rechtzeitig für Outdoor-Geschäft' },
    'cafe': { months: [1, 2, 3], label: 'Vor der Sommersaison' },
    'hotel': { months: [0, 1, 2], label: 'Vor der Buchungssaison — Gäste buchen jetzt für Sommer' },
    'hair_salon': { months: [9, 10], label: 'Vor Weihnachten/Silvester — Hochsaison steht bevor' },
    'beauty_salon': { months: [9, 10], label: 'Vor der Weihnachts-Hochsaison' },
    'florist': { months: [0, 1, 4], label: 'Vor Valentinstag / Muttertag' },
    'gym': { months: [11, 0], label: 'Neujahrsvorsätze — größter Ansturm des Jahres steht bevor' },
};

/** Aktiver Saison-Trigger für Branche+Monat, sonst null. (month 0-basiert; Default = jetzt) */
export function seasonalTriggerFor(type, month = new Date().getMonth()) {
    const s = SEASONAL_TRIGGERS[type];
    return (s && s.months.includes(month)) ? s : null;
}

// ─────────────────────────── Anlässe mit Datum ───────────────────────────

/**
 * Wortlaut der Chrome-Warnung. Bewusst „neuen Besuchern": Chrome warnt nur vor
 * Seiten, die der Besucher nicht kürzlich aufgerufen hat — Stammbesucher sehen
 * die Warnung nicht wiederholt. Nie „alle Ihre Kunden".
 */
export const CHROME_HTTPS_WARNUNG = 'Chrome zeigt ab Oktober 2026 neuen Besuchern eine Warnung vor dieser Seite';
export const CHROME_HTTPS_DATUM = '2026-10';

/** Hinweis bei Strato/IONOS — „in der Regel" + „prüfen Sie": nie als sicher behauptet. */
export const HOSTER_PHP_HINWEIS = 'Hoster berechnen für veraltetes PHP in der Regel einen Aufpreis – prüfen Sie Ihre letzte Rechnung';

const HOSTER_ANZEIGE = { strato: 'Strato', ionos: 'IONOS' };

/**
 * HTTPS-Lage — gemessen (adEvidence.httpsCheck, EVIDENCE_SCHEMA 3) schlägt die
 * PSI-Ableitung.
 *
 *   • httpsCheck.checked && reachable === false → gemessen OHNE HTTPS
 *   • httpsCheck.checked && reachable === true  → HTTPS da (auch wenn PSI die
 *     http-Fassung geladen hat); fehlt nur die Weiterleitung, ist das ein
 *     weicher Hinweis, kein Mangel
 *   • sonst (kein httpsCheck, reachable null) → bisherige Logik: nur ein
 *     ausdrückliches ws.isHttps === false zählt. Nicht gemessen ≠ negativ.
 *
 * @returns {{gemessen:boolean, ohneHttps:boolean, ohneWeiterleitung:boolean, zertifikatFremd:boolean}}
 */
export function httpsBefund(ws, httpsCheck) {
    const hc = httpsCheck && httpsCheck.checked === true ? httpsCheck : null;
    if (hc && hc.reachable === false) {
        // Prüfung 2026-09-10: PSI rendert mit einem echten Chrome. Steht dessen
        // Endadresse auf https, war HTTPS nachweislich erreichbar — die Messung
        // aus der Function widerspricht (z.B. Server ohne Zwischenzertifikat:
        // Node bricht ab, Chrome lädt nach). Ein Widerspruch belegt nichts →
        // keine Chrome-Aussage und kein Mangel. Echte http-only-Seiten laden
        // in PSI auf http und bleiben davon unberührt.
        if (ws?.isHttps === true) {
            return { gemessen: false, ohneHttps: false, ohneWeiterleitung: false, zertifikatFremd: false };
        }
        return { gemessen: true, ohneHttps: true, ohneWeiterleitung: false, zertifikatFremd: false };
    }
    if (hc && hc.reachable === true) {
        return {
            gemessen: true, ohneHttps: false,
            ohneWeiterleitung: hc.redirectsToHttps === false,
            zertifikatFremd: hc.certValidForHost === false
        };
    }
    return { gemessen: false, ohneHttps: ws?.isHttps === false, ohneWeiterleitung: false, zertifikatFremd: false };
}

/**
 * PHP ohne Sicherheitsupdates (adEvidence.php) — nur bei ausdrücklichem eol === true
 * UND bekannter Version. eol null = nicht gemessen → kein Befund.
 * @returns {{version:string, datum:string|null, text:string, hosterHinweis:string|null, hosterName:string|null}|null}
 */
export function phpBefund(php, hoster = null) {
    if (!php || php.eol !== true || !php.version) return null;
    const datum = php.eolDatum || null;
    const text = datum
        ? `PHP ${php.version} ohne Sicherheitsupdates seit ${formatiereDatum(datum)}`
        : `PHP ${php.version} ohne Sicherheitsupdates`;
    const hosterKey = hoster && (hoster.name === 'strato' || hoster.name === 'ionos') ? hoster.name : null;
    return {
        version: String(php.version), datum, text,
        hosterHinweis: hosterKey ? HOSTER_PHP_HINWEIS : null,
        hosterName: hosterKey ? HOSTER_ANZEIGE[hosterKey] : null
    };
}

/**
 * CMS-Support-Lage — aus einem schon berechneten techAge (analyzeTechAge), sonst
 * direkt aus der gemessenen Version.
 */
function cmsLage(tech, techAge, jetzt) {
    if (techAge && typeof techAge.eol === 'boolean') {
        return {
            eol: techAge.eol, datum: techAge.eolDatum || null,
            text: techAge.eol ? `${techAge.cms}${techAge.version ? ' ' + techAge.version : ''} ${techAge.eolText}` : null
        };
    }
    if (tech?.isBaukasten) return { eol: false, datum: null, text: null };
    const sv = bewerteCmsVersion(tech?.cms, tech?.version, jetzt);
    return {
        eol: sv.eol, datum: sv.eolDatum,
        text: sv.eol ? `${kanonischerCmsName(tech.cms)} ${tech.version} ${sv.text}` : null
    };
}

/**
 * Alle Anlässe eines Leads, die an einem DATUM hängen oder eine Support-Grenze
 * belegen. Score-neutral — dieser Wert erhöht keinen Score (Lehre: alt ist kein
 * Kaufsignal), er macht den Anlass im Scanner filterbar.
 *
 * @returns {Array<{art:'chrome-warnung'|'php-eol'|'cms-eol', datum:string|null, text:string, hinweis?:string|null}>}
 */
export function datierteAnlaesse({ ws = null, tech = null, techAge = null, httpsCheck = null, php = null, hoster = null, jetzt = new Date() } = {}) {
    const out = [];
    const hb = httpsBefund(ws, httpsCheck);
    // Chrome-Hinweis NUR bei gemessenem reachable === false — die PSI-Ableitung
    // allein trägt diese Datums-Aussage nicht.
    if (hb.gemessen && hb.ohneHttps) {
        out.push({ art: 'chrome-warnung', datum: CHROME_HTTPS_DATUM, text: CHROME_HTTPS_WARNUNG });
    }
    const pb = phpBefund(php, hoster);
    if (pb) out.push({ art: 'php-eol', datum: pb.datum, text: pb.text, hinweis: pb.hosterHinweis });
    const cl = cmsLage(tech, techAge, jetzt);
    if (cl.eol && cl.text) out.push({ art: 'cms-eol', datum: cl.datum, text: cl.text });
    return out;
}

/**
 * Erkennt Trigger-Events aus verfügbaren Daten
 * @param {Object} params - Alle verfügbaren Signal-Daten
 *   (zusätzlich seit 2026-09-10: httpsCheck, php, hoster aus adEvidence)
 * @returns {Object} Erkannte Trigger-Events mit Dringlichkeit
 */
export function detectTriggerEvents(params) {
    const { ws, tech, place, wayback, footprint, psiData, contentAnalysis, httpsCheck = null, php = null, hoster = null } = params;
    const jetzt = params.jetzt || new Date();
    const events = [];

    // ── Saisonale Trigger ──
    const month = new Date().getMonth();
    const type = place?.primaryType || '';

    const seasonal = seasonalTriggerFor(type, month);
    if (seasonal) {
        events.push({ type: 'seasonal', urgency: 'hoch', label: seasonal.label, timing: 'jetzt', impact: 3 });
    }

    // ── Barrierefreiheit ──
    // 2026-08-14: war „BFSG seit Juni 2025 in Kraft — Bußgelder bis 100.000€" und
    // damit eine Rechtsfolge ohne jede Prüfung, ob sie für diesen Betrieb gilt.
    // `impact` von 5 auf 4: ohne Bußgeld-Behauptung ist der Hebel schwächer als
    // eine fehlende Verschlüsselung, die jeder Besucher sofort sieht.
    if (ws?.a11y < 70) {
        events.push({
            type: 'quality', urgency: 'hoch',
            label: `Barrierefreiheit ${ws.a11y}/100 — Besucher werden ausgeschlossen`,
            timing: 'jetzt', impact: 4
        });
    }

    // ── Technologie: Support-Ende der GEMESSENEN Version ──
    // ⚠️ KORREKTUR 2026-09-10: vorher `parseInt(version) < 6` → „Sicherheitsupdates
    // laufen aus" für JEDE WordPress-Version unter 6, also auch für 4.7–5.9, die
    // weiter Sicherheitsupdates erhalten. Jetzt die datierte Tabelle aus tech-age.js.
    if (tech?.version && !tech.isBaukasten) {
        const sv = bewerteCmsVersion(tech.cms, tech.version, jetzt);
        if (sv.eol) {
            events.push({
                type: 'tech_eol', urgency: 'hoch',
                label: `${kanonischerCmsName(tech.cms)} ${tech.version} ${sv.text}`,
                timing: 'überfällig', impact: 3, datum: sv.eolDatum
            });
        }
    }

    // ── PHP ohne Sicherheitsupdates (nur gemessen, adEvidence.php) ──
    const pb = phpBefund(php, hoster);
    if (pb) {
        events.push({ type: 'php_eol', urgency: 'hoch', label: pb.text, timing: 'überfällig', impact: 3, datum: pb.datum });
        if (pb.hosterHinweis) {
            events.push({ type: 'hoster_hint', urgency: 'mittel', label: `${pb.hosterName}: ${pb.hosterHinweis}`, timing: 'prüfen', impact: 1 });
        }
    }

    // ── Website nicht aktualisiert ──
    if (wayback?.daysSince > 730) {
        events.push({
            type: 'stale', urgency: 'hoch',
            label: `Website seit ${wayback.yearsSince} Jahren unverändert — digitale Stagnation`,
            timing: 'überfällig', impact: 4
        });
    } else if (wayback?.daysSince > 365) {
        events.push({
            type: 'stale', urgency: 'mittel',
            label: `Seit ${Math.round(wayback.daysSince / 30)} Monaten keine Änderung`,
            timing: '1-3 Monate', impact: 2
        });
    }

    // ── Copyright-Jahr veraltet ──
    if (contentAnalysis?.copyrightYear) {
        const currentYear = new Date().getFullYear();
        const yearDiff = currentYear - contentAnalysis.copyrightYear;
        if (yearDiff >= 3) {
            events.push({
                type: 'copyright', urgency: 'mittel',
                label: `Copyright © ${contentAnalysis.copyrightYear} — ${yearDiff} Jahre veraltet`,
                timing: 'bald', impact: 2
            });
        }
    }

    // ── HTTPS ──
    // Gemessen (httpsCheck) schlägt die PSI-Ableitung. ⚠️ Vorher `!ws?.isHttps`:
    // ein fehlendes ws-Objekt erzeugte „Nicht sicher" aus dem Nichts.
    const hb = httpsBefund(ws, httpsCheck);
    if (hb.gemessen && hb.ohneHttps) {
        events.push({
            type: 'security', urgency: 'sofort',
            label: CHROME_HTTPS_WARNUNG,
            timing: 'ab Oktober 2026', impact: 5, datum: CHROME_HTTPS_DATUM
        });
    } else if (!hb.gemessen && hb.ohneHttps) {
        events.push({
            type: 'security', urgency: 'sofort',
            label: 'Seite lädt ohne HTTPS — Browser markieren sie als „Nicht sicher“',
            timing: 'jetzt', impact: 5
        });
    } else if (hb.gemessen && hb.zertifikatFremd) {
        events.push({
            type: 'security', urgency: 'hoch',
            label: 'Zertifikat passt nicht zur Adresse — Browser warnen beim Aufruf per HTTPS',
            timing: 'jetzt', impact: 4
        });
    } else if (hb.gemessen && hb.ohneWeiterleitung) {
        events.push({
            type: 'security_hint', urgency: 'mittel',
            label: 'HTTPS vorhanden, aber ohne automatische Weiterleitung von http',
            timing: 'bald', impact: 1
        });
    }

    // ── Google-Bewertungen werden schlechter ──
    if (params.socialSignals?.reviewTrend?.direction === 'fallend') {
        events.push({
            type: 'reputation', urgency: 'hoch',
            label: 'Google-Bewertungen im Abwärtstrend — Handlungsbedarf',
            timing: 'jetzt', impact: 3
        });
    }

    // ── Neuer Wettbewerber mit moderner Website ──
    if (params.competitors?.some(c => c.rating >= 4.5 && c.userRatingCount > 50)) {
        events.push({
            type: 'competition', urgency: 'mittel',
            label: 'Konkurrent mit starker Online-Präsenz im Umfeld',
            timing: '1-3 Monate', impact: 2
        });
    }

    // Sortiere nach Impact
    events.sort((a, b) => b.impact - a.impact);

    // Gesamt-Dringlichkeit
    const totalImpact = events.reduce((s, e) => s + e.impact, 0);
    const hasSofort = events.some(e => e.urgency === 'sofort');
    const anlaesse = datierteAnlaesse({ ws, tech, httpsCheck, php, hoster, jetzt });

    return {
        events,
        eventCount: events.length,
        totalImpact,
        hasSofort,
        topEvent: events[0] || null,
        // Anlässe mit Datum/Support-Grenze (gleiche Quelle wie der Scanner-Filter).
        anlaesse,
        label: hasSofort ? 'Sofortiger Handlungsbedarf — mehrere kritische Trigger'
            : totalImpact >= 10 ? 'Hohe Dringlichkeit — optimales Timing für Kontakt'
            : totalImpact >= 5 ? 'Guter Zeitpunkt — zeitnahe Kontaktaufnahme empfohlen'
            : 'Kein dringender Anlass',
        funnelImpact: {
            interest: Math.min(5, Math.round(totalImpact / 3)),
            close: hasSofort ? 3 : totalImpact >= 8 ? 2 : 0
        }
    };
}
