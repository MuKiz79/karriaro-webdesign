/**
 * Umsatzverlust-Rechner mit Monte-Carlo-Unsicherheitsband
 */

import { randn } from './sampling.js';
import { LOCAL_BUSINESS_TRAFFIC, CUSTOMER_LIFETIME_VALUE, WEBSITE_CONVERSION_RATES } from '../priors/benchmark-data.js';

// Fix 4+5: Kalibriert mit echten Traffic-Daten (BrightLocal) und CLV (Branchenberichte)
const INDUSTRIES = {
    'restaurant':        { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.restaurant.perVisit, name: 'Restaurant' },
    'cafe':              { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.cafe.perVisit, name: 'Cafe' },
    'dentist':           { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.dentist.perVisit, name: 'Zahnarzt' },
    'doctor':            { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.doctor.perVisit, name: 'Arztpraxis' },
    'physiotherapist':   { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.physiotherapist.perVisit, name: 'Physiotherapie' },
    'hair_salon':        { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.high, avgValue: CUSTOMER_LIFETIME_VALUE.hair_salon.perVisit, name: 'Friseur' },
    'beauty_salon':      { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.beauty_salon.perVisit, name: 'Kosmetikstudio' },
    'real_estate_agency':{ convRate: 0.03, avgValue: CUSTOMER_LIFETIME_VALUE.real_estate_agency.perVisit, name: 'Immobilienmakler' },
    'lawyer':            { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.low, avgValue: CUSTOMER_LIFETIME_VALUE.lawyer.perVisit, name: 'Rechtsanwalt' },
    'auto_repair':       { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.auto_repair.perVisit, name: 'KFZ-Werkstatt' },
    'plumber':           { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.high, avgValue: CUSTOMER_LIFETIME_VALUE.plumber.perVisit, name: 'Sanitärbetrieb' },
    'electrician':       { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.electrician.perVisit, name: 'Elektrobetrieb' },
    'hotel':             { convRate: 0.04, avgValue: CUSTOMER_LIFETIME_VALUE.hotel.perVisit, name: 'Hotel' },
    'gym':               { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.gym.perVisit, name: 'Fitnessstudio' },
    'veterinary_care':   { convRate: WEBSITE_CONVERSION_RATES.appointmentBooking.mid, avgValue: CUSTOMER_LIFETIME_VALUE.veterinary_care.perVisit, name: 'Tierarzt' },
    'bakery':            { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.bakery.perVisit, name: 'Bäckerei' },
    'florist':           { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.florist.perVisit, name: 'Florist' },
    'car_dealer':        { convRate: 0.02, avgValue: CUSTOMER_LIFETIME_VALUE.car_dealer.perVisit, name: 'Autohaus' },
    'moving_company':    { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE.moving_company.perVisit, name: 'Umzugsunternehmen' },
    '_default':          { convRate: WEBSITE_CONVERSION_RATES.average, avgValue: CUSTOMER_LIFETIME_VALUE._default.perVisit, name: 'Unternehmen' }
};

// Google-Studie: Bounce-Rate-Anstieg bei Ladezeit
function bounceIncrease(loadTimeSec) {
    if (loadTimeSec <= 1) return 0;
    if (loadTimeSec <= 3) return 0.32;
    if (loadTimeSec <= 5) return 0.90;
    if (loadTimeSec <= 6) return 1.06;
    if (loadTimeSec <= 10) return 1.23;
    return 1.50;
}

export function calculateRevenueLoss(ws, place) {
    const type = place?.primaryType || '_default';
    const ind = INDUSTRIES[type] || INDUSTRIES._default;
    const reviews = place?.userRatingCount || 10;

    // Fix 4: Echte Traffic-Schätzung mit Caps aus BrightLocal-Daten
    const estMonthlyVisitors = LOCAL_BUSINESS_TRAFFIC.estimateMonthlyVisitors(type, reviews);
    const lcpSec = parseFloat(ws.lcp) || 3;
    const bounceRate = bounceIncrease(lcpSec);

    const baselineConversions = estMonthlyVisitors * ind.convRate;
    const mobilePenalty = ws.viewport ? 0 : 0.15;
    const sslPenalty = ws.isHttps ? 0 : 0.10;
    const seoLostPct = ws.seo < 50 ? 0.30 : ws.seo < 75 ? 0.15 : 0.05;

    const lostSpeed = baselineConversions * bounceRate * 0.4;
    const lostMobile = baselineConversions * 0.6 * mobilePenalty;
    const lostSsl = baselineConversions * sslPenalty;
    const lostSeo = baselineConversions * seoLostPct;

    const totalLostMonthly = lostSpeed + lostMobile + lostSsl + lostSeo;
    const monthlyLoss = Math.round(totalLostMonthly * ind.avgValue);
    const yearlyLoss = monthlyLoss * 12;

    // Fix 11: Korrelierte Monte-Carlo via Cholesky-Decomposition
    // VPR, CR und avgValue sind korreliert (größere Unternehmen = mehr Traffic UND höhere Preise)
    // Korrelationsmatrix: ρ(vpr,cr)=0.3, ρ(vpr,av)=0.4, ρ(cr,av)=0.2
    // Cholesky von [[1, 0.3, 0.4], [0.3, 1, 0.2], [0.4, 0.2, 1]]
    const L = [[1, 0, 0], [0.3, 0.9539, 0], [0.4, 0.0838, 0.9129]];  // Pre-computed

    const samples = [];
    for (let i = 0; i < 500; i++) {
        // Ziehe unkorrelierte Normalvariablen
        const z = [randn(), randn(), randn()];
        // Korreliere via Cholesky: x = L × z
        const x0 = L[0][0]*z[0];
        const x1 = L[1][0]*z[0] + L[1][1]*z[1];
        const x2 = L[2][0]*z[0] + L[2][1]*z[1] + L[2][2]*z[2];

        const vpr = Math.max(1, ind.visitorsPerReview * (1 + x0 * 0.5));
        const cr = Math.max(0.01, ind.convRate * (1 + x1 * 0.3));
        const av = Math.max(5, ind.avgValue * (1 + x2 * 0.25));
        const vis = reviews * vpr;
        const base = vis * cr;
        const lost = base * (bounceRate * 0.4 + mobilePenalty * 0.6 + sslPenalty + seoLostPct);
        samples.push(lost * av * 12);
    }
    samples.sort((a, b) => a - b);

    return {
        industry: ind,
        estMonthlyVisitors,
        monthlyLoss,
        yearlyLoss,
        yearlyLow: Math.round(samples[Math.floor(samples.length * 0.10)]),
        yearlyHigh: Math.round(samples[Math.floor(samples.length * 0.90)]),
        lostConversions: { speed: lostSpeed, mobile: lostMobile, ssl: lostSsl, seo: lostSeo },
        roi: yearlyLoss > 0 ? Math.round(yearlyLoss / 1990 * 100) / 100 : 0
    };
}
