/**
 * Kaufsignal-Achse — trennt PROBLEM-Beweis von KAUF-Beweis.
 *
 * ─── Warum dieses Modul existiert ───────────────────────────────────────────
 * Der bisherige "Intent" im Composite-Score bestand zu 100 % aus Problem-Belegen
 * (Design schlecht, Perf schlecht, kein SSL, BFSG-Risiko, Content alt, Tech alt).
 * Das misst, ob die Seite SCHLECHT ist — nicht, ob der Inhaber KAUFEN will.
 *
 * Die eigene verifizierte Quellen-Recherche (2026-06-26) haelt genau das fest:
 *   "Baukasten/alt = nur PROBLEM-Beweis, KEIN Kaufsignal allein."
 *
 * Praktisch dreht das die Rangfolge um: Wer seine Seite jahrelang verwahrlosen
 * laesst, ist der SCHWERSTE Verkauf — kein Budget-Beweis, kein Leidensdruck,
 * kein Kanal. Der beste Lead ist das Gegenteil: ein Betrieb, der JETZT
 * nachweislich Geld für Sichtbarkeit ausgibt — und dieses Geld auf eine
 * schwache Seite leitet. Da ist Budget bewiesen, Handlungsbereitschaft
 * bewiesen, und der Schmerz ist rechenbar statt behauptet.
 *
 * ─── Rangfolge der Kaufsignale (verifiziert, nach Aussagekraft) ─────────────
 *   1. Schaltet Anzeigen + schwache Landingpage   ← staerkstes, gratis messbar
 *   2. Stellt ein (offene Stellen)                ← Wachstum + Budget
 *   3. Frische Bewertungs-Velocity                ← Betrieb kuemmert sich aktiv
 *   4. Misst bereits (Analytics/Tag-Manager)      ← datengetrieben, versteht ROI
 *   5. Breite Marketing-Praesenz                  ← investiert in Sichtbarkeit
 *   (Baukasten/alt zaehlt hier bewusst NICHT — das ist der Hebel, nicht das Signal.)
 *
 * Jedes Signal traegt seinen `proof` — was tatsaechlich gemessen wurde. Nichts
 * hier wird geschaetzt oder behauptet; fehlt ein Signal, fehlt es (kein Default,
 * keine Strafe für fehlende Daten).
 *
 * @module analysis/buying-intent
 */

import { lossFactors, combineLoss } from '../math/revenue-model.js';

/**
 * Punktgewichte der Kaufsignale. Bewusst hand-vergeben und noch NICHT an eigenen
 * Outcome-Daten kalibriert — die Rangfolge folgt der Quellen-Recherche, die
 * absoluten Werte sind eine Priorisierungs-Heuristik. Sobald genug Gewonnen/
 * Verloren-Outcomes vorliegen, gehoert das hier gegen learning/prior-update.js
 * kalibriert (gleiche Disziplin wie composite-score.js).
 */
const W = {
    googleAds: 32,      // bezahlte Suchanzeigen — haerteste Budget-Evidenz
    metaAds: 22,        // Meta-Pixel = laufende/vorbereitete Facebook-Werbung
    bingAds: 8,         // seltener, aber echtes Budget
    hiringStrong: 26,   // mehrere offene Stellen
    hiringWeak: 10,     // Karriere-Seite / Recruiting-Software auf der Website
    reviewsFresh: 14,   // juengste Bewertung <= 45 Tage
    reviewsVelocity: 8, // >= 5 Bewertungen/Monat
    analytics: 8,       // misst bereits — versteht Zahlen
    socialBreadth: 8,   // >= 3 gepflegte Kanäle
    tagManager: 12,     // GTM ohne sichtbare Ad-Tags — Werbung wahrscheinlich, nicht bewiesen
    adConsentMode: 16   // Werbe-Consent-Mode konfiguriert — staerkeres Indiz, weiter kein Beweis
};

/** Ab hier gilt Kaufbereitschaft als BEWIESEN (nicht nur wahrscheinlich). */
export const PROVEN_THRESHOLD = 30;

/**
 * Bewertet, wie stark ein Betrieb NACHWEISLICH gerade Geld in Kundengewinnung
 * steckt. Kein Wahrscheinlichkeits-Schaetzer — eine Evidenz-Summe.
 *
 * @param {Object} p
 * @param {Object|null} [p.googleAds]   - detectGoogleAds()-Ergebnis
 * @param {Object|null} [p.footprint]   - analyzeDigitalFootprint()-Ergebnis
 * @param {Object|null} [p.jobSignal]   - detectJobSignals()-Ergebnis (Website-Proxy)
 * @param {number|null} [p.jobOpenings] - Anzahl echter offener Stellen (z.B. Arbeitsagentur-API)
 * @param {Object|null} [p.reviewRecency] - { daysSinceLast, velocity, n }
 * @returns {{score:number, tier:string, isProvenSpender:boolean, adsActive:boolean,
 *            signals:Array<{key:string,label:string,detail:string,weight:number,proof:string}>,
 *            label:string, missing:string[]}}
 */
export function assessBuyingIntent({
    googleAds = null,
    footprint = null,
    jobSignal = null,
    jobOpenings = null,
    reviewRecency = null
} = {}) {
    const signals = [];
    const missing = [];
    const add = (key, label, detail, weight, proof) =>
        signals.push({ key, label, detail, weight, proof });

    // ── 1. Bezahlte Werbung: der haerteste Beweis, dass Geld fliesst ──
    const adSignals = googleAds?.signals || [];
    const hasSearchAds = adSignals.some(s => /Google Ads/i.test(s));
    const hasDisplay = adSignals.some(s => /Display/i.test(s));
    const hasBing = adSignals.some(s => /Microsoft/i.test(s));
    const hasMetaPixel = !!footprint?.hasFbPixel;

    if (hasSearchAds || hasDisplay) {
        add('google_ads', 'Google Ads aktiv',
            'Zahlt pro Klick für Besucher — Budget ist bewiesen, nicht vermutet.',
            W.googleAds, adSignals.join(', '));
    }
    if (hasMetaPixel) {
        add('meta_ads', 'Meta-Pixel aktiv',
            'Facebook-/Instagram-Werbung läuft oder ist vorbereitet.',
            W.metaAds,
            footprint?.fbPixelSource === 'gtm-container'
                ? 'Meta-Pixel im GTM-Container konfiguriert'
                : 'Meta-Pixel in den Network-Requests der Startseite');
    }
    if (hasBing) {
        add('bing_ads', 'Microsoft Ads aktiv',
            'Zusätzlicher bezahlter Kanal.', W.bingAds, 'Bing-Conversion-Tag erkannt');
    }
    if (!hasSearchAds && !hasDisplay && !hasMetaPixel && !hasBing) {
        // Tag-Manager ohne sichtbare Ad-Tags: der Betrieb verwaltet Marketing-Tags
        // professionell, die Werbung ist nur hinter dem Cookie-Banner unsichtbar
        // (siehe signals/google-ads.js — empirisch belegte Consent-Blindheit).
        // Zaehlt als schwaches Signal, NICHT als bewiesenes Werbebudget.
        if (googleAds?.blocked) {
            // Bot-Wall: daraus folgt gar nichts. Kein Signal, keine Strafe.
            missing.push('Seite hat die Prüfung blockiert (Bot-Schutz) — Werbung weder belegt noch ausgeschlossen');
        } else if (googleAds?.adConsentMode?.found) {
            // Werbe-Einwilligung konfiguriert: stärkeres Indiz als ein blanker
            // Tag-Manager, aber weiterhin kein Nachweis (Consent-Tools schreiben
            // den Block oft als Vorlage mit).
            add('ad_consent_mode', 'Werbe-Einwilligung konfiguriert',
                'Consent Mode steuert Werbe-Cookies — der Betrieb hat Werbe-Tags, die er steuern muss.',
                W.adConsentMode,
                `Consent-Parameter: ${(googleAds.adConsentMode.params || []).join(', ')}${googleAds.adConsentMode.redaction ? ', ads_data_redaction' : ''}`);
            missing.push('Keine Conversion-ID gefunden — Werbung wahrscheinlich, aber nicht belegt');
        } else if (googleAds?.hasTagManager) {
            add('tag_manager', 'Marketing-Tags verwaltet',
                'Google Tag Manager im Einsatz — Anzeigen sind wahrscheinlich, aber hinter dem Cookie-Banner nicht messbar.',
                W.tagManager, 'googletagmanager.com in den Network-Requests');
            missing.push('Anzeigen nicht messbar — Ad-Tags feuern erst nach Cookie-Einwilligung (kein Beweis für „schaltet nichts")');
        } else {
            missing.push('Keine bezahlte Werbung auf der Startseite erkennbar');
        }
    }

    // ── 2. Stellt ein: Wachstum + Budget ──
    // Echte Stellenzahl (API) schlaegt den Website-Proxy. Der Proxy sucht nur
    // "karriere"/"stepstone" in Requests und ist entsprechend schwach.
    if (typeof jobOpenings === 'number' && jobOpenings > 0) {
        const strong = jobOpenings >= 3;
        add('hiring', `${jobOpenings} offene ${jobOpenings === 1 ? 'Stelle' : 'Stellen'}`,
            'Wachsender Betrieb mit Personalbudget — investiert gerade in die Zukunft.',
            strong ? W.hiringStrong : W.hiringWeak,
            `${jobOpenings} Treffer in der Stellen-Datenbank`);
    } else if (jobSignal?.isHiring) {
        add('hiring_page', 'Karriere-Bereich aktiv',
            'Sucht Personal — Hinweis auf Wachstum (schwächeres Signal als echte Stellenzahl).',
            W.hiringWeak, (jobSignal.signals || []).join(', '));
    }

    // ── 3. Bewertungs-Frische: kuemmert sich der Betrieb ueberhaupt? ──
    const d = typeof reviewRecency?.daysSinceLast === 'number' ? reviewRecency.daysSinceLast : null;
    const v = typeof reviewRecency?.velocity === 'number' ? reviewRecency.velocity : null;
    const n = reviewRecency?.n || 0;
    if (d !== null && n >= 2) {
        if (d <= 45) {
            add('reviews_fresh', `Bewertungen frisch (${d} Tage)`,
                'Aktiver Betrieb, der seinen Ruf pflegt — erreichbar und ansprechbar.',
                W.reviewsFresh, `jüngste Bewertung vor ${d} Tagen, n=${n}`);
        }
        // Velocity nur bei belastbarer Datenlage (>=3 datierte Reviews) — verhindert,
        // dass ein 2er-Freundes-Burst die Kaufbereitschaft aufblaest (gleicher
        // Gaming-Schutz wie im livenessGate in scoring/opportunity.js).
        if (v !== null && n >= 3 && v >= 5) {
            add('reviews_velocity', `${v.toFixed(1)} Bewertungen/Monat`,
                'Starker Zulauf — der Betrieb wächst messbar.',
                W.reviewsVelocity, `Velocity ${v.toFixed(1)}/Mon. bei n=${n}`);
        }
    } else {
        missing.push('Keine datierten Bewertungen — Aktivität nicht prüfbar');
    }

    // ── 4./5. Misst bereits + Kanal-Breite ──
    if (footprint?.hasAnalytics) {
        add('analytics', 'Analytics aktiv',
            'Misst seinen Traffic — versteht Zahlen und damit ROI-Argumente.',
            W.analytics, 'Analytics-/Tag-Manager-Request erkannt');
    }
    if ((footprint?.platformCount || 0) >= 3) {
        add('social_breadth', `${footprint.platformCount} Kanäle gepflegt`,
            'Investiert breit in Sichtbarkeit.',
            W.socialBreadth, `${footprint.platformCount} verlinkte Plattformen`);
    }

    const score = Math.min(100, signals.reduce((s, x) => s + x.weight, 0));

    // Harte Kaufbereitschaft = echtes Geld verlaesst den Betrieb für
    // Kundengewinnung. Reine Aktivitaets-Signale (Bewertungen, Analytics)
    // reichen dafür bewusst NICHT — sie zeigen einen lebenden Betrieb,
    // aber keine Investitionsentscheidung.
    const adsActive = hasSearchAds || hasDisplay || hasMetaPixel || hasBing;
    const isHiring = signals.some(s => s.key === 'hiring');
    const isProvenSpender = adsActive || isHiring;

    const tier = score >= 55 ? 'beweisbar'
        : score >= PROVEN_THRESHOLD ? 'wahrscheinlich'
        : score >= 12 ? 'schwach'
        : 'keins';

    const label = {
        beweisbar: 'Gibt nachweislich Geld für Kundengewinnung aus',
        wahrscheinlich: 'Mehrere Investitions-Signale — wahrscheinlich ansprechbar',
        schwach: 'Kaum Investitions-Signale — Bedarf müsste erst geweckt werden',
        keins: 'Kein Kaufsignal — vermutlich vernachlässigter Betrieb'
    }[tier];

    return {
        score, tier, isProvenSpender, adsActive,
        signals: signals.sort((a, b) => b.weight - a.weight),
        label, missing
    };
}

/**
 * Die Killer-Kombi: der Betrieb zahlt für Klicks UND leitet sie auf eine
 * messbar schwache Seite. Das ist gleichzeitig das staerkste Kaufsignal und
 * das einzige Pitch-Argument, das der Empfaenger selbst nachrechnen kann.
 *
 * ─── Ehrlichkeit (wichtig) ──────────────────────────────────────────────────
 * Wir kennen das Werbebudget des Betriebs NICHT und erfinden es auch nicht.
 * Ausgegeben wird deshalb ein ANTEIL der bezahlten Klicks, der an gemessenen
 * Schwachstellen versandet — kein Euro-Betrag. Die Euro-Zahl entsteht erst,
 * wenn der Founder ein Budget kennt (`monthlyAdBudget`), und ist dann als
 * "bei einem Budget von X" ausgewiesen, nicht als Behauptung.
 *
 * Weiterer Ehrlichkeits-Punkt: Der SEO-Verlustfaktor wird hier bewusst
 * WEGGELASSEN. Bezahlte Klicks kommen unabhaengig vom Ranking an — ihn
 * mitzurechnen wuerde den Verlust systematisch aufblasen.
 *
 * @param {Object} p
 * @param {Object} p.ws - Website-Score (lcp, viewport, isHttps)
 * @param {boolean} p.adsActive - laeuft bezahlte Werbung?
 * @param {number|null} [p.monthlyAdBudget] - EUR/Monat, nur wenn tatsaechlich bekannt
 * @returns {{active:boolean, lossPct:number, drivers:Array, headline:string|null,
 *            pitch:string|null, monthlyWasteEur:number|null, assumptionNote:string|null}}
 */
export function computeAdWaste({ ws = {}, adsActive = false, monthlyAdBudget = null } = {}) {
    const f = lossFactors(ws);
    // NUR die Faktoren, die auch bezahlten Traffic treffen. SEO bleibt draussen.
    const paidLoss = combineLoss([f.speed, f.mobile, f.ssl]);
    const lossPct = Math.round(paidLoss * 100);

    const drivers = [];
    if (f.speed > 0) {
        drivers.push({
            key: 'speed',
            label: `Ladezeit ${parseFloat(ws.lcp) || '?'}s`,
            pct: Math.round(f.speed * 100),
            note: 'Conversion-Verlust nach Deloitte/Google 2020 + Portent 2019'
        });
    }
    if (f.mobile > 0) {
        drivers.push({
            key: 'mobile',
            label: 'Nicht mobiloptimiert',
            pct: Math.round(f.mobile * 100),
            note: 'Kein Viewport-Tag — Mobilbesucher springen sofort ab'
        });
    }
    if (f.ssl > 0) {
        drivers.push({
            key: 'ssl',
            label: 'Kein SSL',
            pct: Math.round(f.ssl * 100),
            note: 'Browser zeigt "Nicht sicher" — Sofort-Absprung'
        });
    }

    // Ohne laufende Anzeigen oder ohne messbare Schwachstelle gibt es kein Argument.
    if (!adsActive || lossPct < 5) {
        return {
            active: false, lossPct, drivers,
            headline: null, pitch: null, monthlyWasteEur: null, assumptionNote: null
        };
    }

    const monthlyWasteEur = (typeof monthlyAdBudget === 'number' && monthlyAdBudget > 0)
        ? Math.round(monthlyAdBudget * paidLoss)
        : null;

    const driverText = drivers.map(d => `${d.label} (${d.pct} %)`).join(', ');
    const headline = `Zahlt für Klicks — rund ${lossPct} % davon versanden messbar`;
    const pitch = monthlyWasteEur !== null
        ? `Sie zahlen für jeden Klick auf Ihre Seite. Rund ${lossPct} % dieser Besucher `
          + `verlieren Sie an messbaren Schwachstellen: ${driverText}. Bei ${monthlyAdBudget} € `
          + `Werbebudget im Monat sind das rechnerisch rund ${monthlyWasteEur} €, die nicht ankommen.`
        : `Sie zahlen für jeden Klick auf Ihre Seite. Rund ${lossPct} % dieser Besucher `
          + `verlieren Sie an messbaren Schwachstellen: ${driverText}. Das Geld für die Anzeige `
          + `ist ausgegeben, bevor der Besucher ueberhaupt ankommt.`;

    return {
        active: true, lossPct, drivers, headline, pitch, monthlyWasteEur,
        assumptionNote: monthlyWasteEur !== null
            ? `Rechnung gilt für das angegebene Budget von ${monthlyAdBudget} €/Monat.`
            : 'Werbebudget unbekannt — bewusst kein Euro-Betrag behauptet.'
    };
}
