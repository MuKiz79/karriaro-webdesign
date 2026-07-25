/**
 * Umsatzverlust-Rechner mit Monte-Carlo-Unsicherheitsband
 */

import { randn } from './sampling.js';
import { LOCAL_BUSINESS_TRAFFIC, CUSTOMER_LIFETIME_VALUE, WEBSITE_CONVERSION_RATES, WEB_LEAD_SHARE } from '../priors/benchmark-data.js';

// Fix 4+5: Kalibriert mit echten Traffic-Daten (BrightLocal) und CLV (Branchenberichte)
const INDUSTRIES = {
    'restaurant':        { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.restaurant.perVisit, name: 'Restaurant' },
    'cafe':              { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.cafe.perVisit, name: 'Cafe' },
    'dentist':           { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.dentist.perVisit, name: 'Zahnarzt' },
    'doctor':            { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.doctor.perVisit, name: 'Arztpraxis' },
    'physiotherapist':   { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.physiotherapist.perVisit, name: 'Physiotherapie' },
    'hair_salon':        { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.high, avgValue: CUSTOMER_LIFETIME_VALUE.hair_salon.perVisit, name: 'Friseur' },
    'beauty_salon':      { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.beauty_salon.perVisit, name: 'Kosmetikstudio' },
    'real_estate_agency':{ convRate: 0.006, avgValue: CUSTOMER_LIFETIME_VALUE.real_estate_agency.perVisit, name: 'Immobilienmakler' },
    'lawyer':            { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.low, avgValue: CUSTOMER_LIFETIME_VALUE.lawyer.perVisit, name: 'Rechtsanwalt' },
    'auto_repair':       { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.auto_repair.perVisit, name: 'KFZ-Werkstatt' },
    'plumber':           { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.high, avgValue: CUSTOMER_LIFETIME_VALUE.plumber.perVisit, name: 'Sanitärbetrieb' },
    'electrician':       { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.electrician.perVisit, name: 'Elektrobetrieb' },
    'hotel':             { convRate: 0.04, avgValue: CUSTOMER_LIFETIME_VALUE.hotel.perVisit, name: 'Hotel' },
    'gym':               { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.gym.perVisit, name: 'Fitnessstudio' },
    'veterinary_care':   { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.veterinary_care.perVisit, name: 'Tierarzt' },
    'bakery':            { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.bakery.perVisit, name: 'Bäckerei' },
    'florist':           { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.florist.perVisit, name: 'Florist' },
    'car_dealer':        { convRate: 0.008, avgValue: CUSTOMER_LIFETIME_VALUE.car_dealer.perVisit, name: 'Autohaus' },
    'moving_company':    { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.moving_company.perVisit, name: 'Umzugsunternehmen' },
    '_default':          { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE._default.perVisit, name: 'Unternehmen' }
};

// Speed→Conversion-Verlust, direkt aus CONVERSION-Studien (nicht Bounce):
// Deloitte/Google "Milliseconds Make Millions" 2020 (~8% Conversion-Uplift je 100ms
// im steilen Band) + Portent 2019 (CR faellt am staerksten 1-4s, flacht ab >5s ab).
// Stetige, monotone, saettigende Kurve OHNE Schwellen-Cliff (2.99s vs 3.01s kippte
// die Schaetzung frueher um das ~2.8-fache); gedeckelt bei 18%. Ersetzt die alte
// Konstruktion bounceIncrease()*0.4, die einen RELATIVEN Bounce-Anstieg faelschlich
// als ABSOLUTEN Conversion-Verlust behandelte und mit dem unbelegten 0.4 skalierte.
function speedLossPct(loadTimeSec) {
    if (loadTimeSec <= 2.5) return 0;
    if (loadTimeSec >= 8) return 0.18;
    // Linearer Anstieg 2.5s(0%) -> 8s(18%): 4s≈6.5%, 5s≈9%, 6s≈11.5%
    return (loadTimeSec - 2.5) / (8 - 2.5) * 0.18;
}

// Gesamt-Verlustanteil als multiplikatives Survival-Produkt: 1 - ∏(1-p_i).
// Intrinsisch in [0,1) gedeckelt (nie >100% der Conversions) und ohne Doppelzaehlung
// (jeder Faktor wirkt nur auf die Besucher, die die vorigen Faktoren ueberlebt haben).
// EINE reine Helferfunktion -> identisch in Punkt-Schaetzung UND Monte-Carlo verwendet,
// damit Punkt und Band konsistent und beide beschraenkt sind.
function lossFraction(lcpSec, mobilePenalty, sslPenalty, seoLostPct) {
    const pSpeed = speedLossPct(lcpSec);   // absoluter Conversion-Verlust, max 0.18
    const pMobile = 0.6 * mobilePenalty;   // max 0.09
    const pSsl = sslPenalty;               // max 0.10
    const pSeo = seoLostPct;               // max 0.30
    return 1 - (1 - pSpeed) * (1 - pMobile) * (1 - pSsl) * (1 - pSeo);
}

/**
 * Einzelne Verlust-Faktoren aus dem Website-Score — die GEMESSENEN Anteile, aus
 * denen sich lossFraction zusammensetzt. Exportiert, damit andere Module (Ad-Waste
 * in analysis/buying-intent.js) exakt dieselben Annahmen verwenden statt eigene
 * Zahlen zu erfinden. Identische Werte wie in calculateRevenueLoss.
 *
 * WICHTIG fuer den Aufrufer: `seo` beschreibt entgangenen ORGANISCHEN Traffic
 * (schlechtere Rankings = weniger Besucher). Auf BEZAHLTE Klicks ist der Faktor
 * NICHT anwendbar — die kommen unabhaengig vom Ranking an. Wer den Verlust auf
 * Anzeigen-Traffic rechnet, kombiniert nur speed/mobile/ssl.
 *
 * @param {Object} ws - Website-Score
 * @returns {{speed:number, mobile:number, ssl:number, seo:number}} Anteile 0..1
 */
export function lossFactors(ws = {}) {
    const lcpSec = parseFloat(ws.lcp) || 3;
    return {
        speed: speedLossPct(lcpSec),
        mobile: 0.6 * (ws.viewport ? 0 : 0.15),
        ssl: ws.isHttps ? 0 : 0.10,
        seo: ws.seo < 50 ? 0.30 : ws.seo < 75 ? 0.15 : 0.05
    };
}

/**
 * Kombiniert Verlust-Anteile multiplikativ (Survival): 1 - ∏(1-p_i).
 * Intrinsisch <1, keine Doppelzaehlung desselben verlorenen Besuchers.
 *
 * @param {number[]} ps - Einzelanteile 0..1
 * @returns {number} Gesamtanteil 0..1
 */
export function combineLoss(ps = []) {
    return 1 - ps.reduce((acc, p) => acc * (1 - (p || 0)), 1);
}

export function calculateRevenueLoss(ws, place) {
    const type = place?.primaryType || '_default';
    const ind = INDUSTRIES[type] || INDUSTRIES._default;
    const reviews = place?.userRatingCount || 10;

    // Fix 4: Echte Traffic-Schätzung mit Caps aus BrightLocal-Daten
    const estMonthlyVisitors = LOCAL_BUSINESS_TRAFFIC.estimateMonthlyVisitors(type, reviews);
    const lcpSec = parseFloat(ws.lcp) || 3;

    const baselineConversions = estMonthlyVisitors * ind.convRate;
    // Damage-Faktoren: Anteil der verlorenen Conversions pro Risiko-Faktor.
    // Quellen-Annahmen:
    //  - Speed: speedLossPct() aus Conversion-Studien (Deloitte/Google 2020, Portent 2019).
    //  - mobilePenalty=0.15: ohne Viewport-Tag grob 60 % Mobile-Traffic betroffen,
    //    davon ~25 % Sofort-Absprung → 0.6×0.25=0.15 (in lossFraction als 0.6×mobilePenalty).
    //  - sslPenalty=0.10: Browser-Warnung ("Nicht sicher") ~10 % Sofort-Absprung.
    //  - seoLostPct: weniger Sichtbarkeit → weniger qualifizierter Traffic.
    // Zusammengesetzt MULTIPLIKATIV (Survival, lossFraction()) statt additiv: dadurch
    // intrinsisch <100% und keine Doppelzaehlung desselben verlorenen Besuchers.
    // Die Einzel-Multiplikatoren sind plausible Annahmen, noch nicht in eigenen Daten
    // kalibriert; pro Branche anpassen, sobald Outcome-Daten vorliegen.
    const mobilePenalty = ws.viewport ? 0 : 0.15;
    const sslPenalty = ws.isHttps ? 0 : 0.10;
    const seoLostPct = ws.seo < 50 ? 0.30 : ws.seo < 75 ? 0.15 : 0.05;

    const totalLossFraction = lossFraction(lcpSec, mobilePenalty, sslPenalty, seoLostPct);
    // webLeadShare: Anteil der Neukunden, die ueberhaupt UEBER die Website kommen
    // (vs. Telefon/Empfehlung/Maps-direkt). Skaliert NUR den Euro-Verlust, nicht die
    // angezeigten Besucher und nicht baselineConversions (sonst schrumpfen auch die
    // Einzel-Anzeige-Beitraege lostSpeed/lostMobile/... mit). Identische Konstante
    // wird unten im Monte-Carlo angewendet, damit Punkt-Schaetzung und P10/P90-Band
    // konsistent skalieren.
    const webLeadShare = WEB_LEAD_SHARE[type] ?? WEB_LEAD_SHARE._default;
    const totalLostMonthly = baselineConversions * webLeadShare * totalLossFraction;
    // Einzel-Beitraege nur fuer die Anzeige (marginale Anteile, NICHT aufsummiert).
    const lostSpeed = baselineConversions * speedLossPct(lcpSec);
    const lostMobile = baselineConversions * 0.6 * mobilePenalty;
    const lostSsl = baselineConversions * sslPenalty;
    const lostSeo = baselineConversions * seoLostPct;

    const monthlyLoss = Math.round(totalLostMonthly * ind.avgValue);
    const yearlyLoss = monthlyLoss * 12;

    // Fix 11: Korrelierte Monte-Carlo via Cholesky-Decomposition
    // VPR, CR und avgValue sind korreliert (größere Unternehmen = mehr Traffic UND höhere Preise)
    // Korrelationsmatrix: ρ(vpr,cr)=0.3, ρ(vpr,av)=0.4, ρ(cr,av)=0.2
    // Cholesky von [[1, 0.3, 0.4], [0.3, 1, 0.2], [0.4, 0.2, 1]]
    const L = [[1, 0, 0], [0.3, 0.9539, 0], [0.4, 0.0838, 0.9129]];  // Pre-computed

    // FIX K1: visitorsPerReview aus estMonthlyVisitors / reviews ableiten (nicht aus ind)
    const baseVPR = reviews > 0 ? estMonthlyVisitors / reviews : 10;

    const samples = [];
    for (let i = 0; i < 500; i++) {
        const z = [randn(), randn(), randn()];
        const x0 = L[0][0]*z[0];
        const x1 = L[1][0]*z[0] + L[1][1]*z[1];
        const x2 = L[2][0]*z[0] + L[2][1]*z[1] + L[2][2]*z[2];

        const vpr = Math.max(1, baseVPR * (1 + x0 * 0.5));
        const cr = Math.max(0.001, ind.convRate * (1 + x1 * 0.3));
        const av = Math.max(5, ind.avgValue * (1 + x2 * 0.25));
        // FIX: Besucher-Clamp pro Draw erneut anwenden, damit das obere Band die
        // model-eigene Traffic-Obergrenze (max/min) nicht ueberschreitet (sonst
        // unrealistisch hohes yearlyHigh genau bei review-starken Leads).
        const d = LOCAL_BUSINESS_TRAFFIC.byIndustry[type] || LOCAL_BUSINESS_TRAFFIC.byIndustry._default;
        const vis = Math.min(d.maxVisitors, Math.max(d.minVisitors, reviews * vpr));
        const base = vis * cr;
        // IDENTISCHE gedeckelte Survival-Fraktion UND identischer webLeadShare wie in
        // der Punkt-Schaetzung, damit das Band eine saubere skalierte Version des
        // Headline-Werts bleibt (webLeadShare ist eine strukturelle Konstante pro
        // Branche, KEINE eigene Monte-Carlo-Ziehung).
        const lost = base * webLeadShare * totalLossFraction;
        samples.push(lost * av * 12);
    }
    samples.sort((a, b) => a - b);

    // Gerundeter Pitch-Wert: keine 5-stellige Schein-Praezision nach aussen
    // (~9.576 € -> "rund 10.000 €"). Schwellen-Gates/Scoring lesen weiter den
    // praezisen yearlyLoss; nur die kundenseitige ANZEIGE nutzt pitchValue.
    const pitchValue = Math.round(yearlyLoss / 1000) * 1000;

    return {
        industry: ind,
        estMonthlyVisitors,
        monthlyLoss,
        yearlyLoss,
        pitchValue,
        yearlyLow: Math.round(samples[Math.floor(samples.length * 0.10)]),
        yearlyHigh: Math.round(samples[Math.floor(samples.length * 0.90)]),
        lostConversions: { speed: lostSpeed, mobile: lostMobile, ssl: lostSsl, seo: lostSeo },
        roi: yearlyLoss > 0 ? Math.round(yearlyLoss / 1990 * 100) / 100 : 0
    };
}
