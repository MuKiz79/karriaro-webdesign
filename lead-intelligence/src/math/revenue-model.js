/**
 * Umsatzverlust-Rechner mit Monte-Carlo-Unsicherheitsband
 */

import { randn } from './sampling.js';

const INDUSTRIES = {
    'restaurant':        { visitorsPerReview: 25, convRate: 0.12, avgValue: 35,   name: 'Restaurant' },
    'cafe':              { visitorsPerReview: 20, convRate: 0.15, avgValue: 12,   name: 'Cafe' },
    'dentist':           { visitorsPerReview: 8,  convRate: 0.08, avgValue: 280,  name: 'Zahnarzt' },
    'doctor':            { visitorsPerReview: 8,  convRate: 0.06, avgValue: 150,  name: 'Arztpraxis' },
    'physiotherapist':   { visitorsPerReview: 6,  convRate: 0.10, avgValue: 80,   name: 'Physiotherapie' },
    'hair_salon':        { visitorsPerReview: 15, convRate: 0.14, avgValue: 55,   name: 'Friseur' },
    'beauty_salon':      { visitorsPerReview: 12, convRate: 0.12, avgValue: 85,   name: 'Kosmetikstudio' },
    'real_estate_agency':{ visitorsPerReview: 5,  convRate: 0.03, avgValue: 4500, name: 'Immobilienmakler' },
    'lawyer':            { visitorsPerReview: 4,  convRate: 0.05, avgValue: 800,  name: 'Rechtsanwalt' },
    'auto_repair':       { visitorsPerReview: 10, convRate: 0.08, avgValue: 350,  name: 'KFZ-Werkstatt' },
    'plumber':           { visitorsPerReview: 8,  convRate: 0.12, avgValue: 280,  name: 'Sanitärbetrieb' },
    'electrician':       { visitorsPerReview: 7,  convRate: 0.10, avgValue: 250,  name: 'Elektrobetrieb' },
    'hotel':             { visitorsPerReview: 30, convRate: 0.04, avgValue: 180,  name: 'Hotel' },
    'gym':               { visitorsPerReview: 18, convRate: 0.06, avgValue: 40,   name: 'Fitnessstudio' },
    'veterinary_care':   { visitorsPerReview: 8,  convRate: 0.10, avgValue: 120,  name: 'Tierarzt' },
    'bakery':            { visitorsPerReview: 20, convRate: 0.18, avgValue: 8,    name: 'Bäckerei' },
    'florist':           { visitorsPerReview: 10, convRate: 0.10, avgValue: 45,   name: 'Florist' },
    'car_dealer':        { visitorsPerReview: 12, convRate: 0.02, avgValue: 25000,name: 'Autohaus' },
    'moving_company':    { visitorsPerReview: 5,  convRate: 0.08, avgValue: 900,  name: 'Umzugsunternehmen' },
    '_default':          { visitorsPerReview: 10, convRate: 0.08, avgValue: 150,  name: 'Unternehmen' }
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

    const estMonthlyVisitors = reviews * ind.visitorsPerReview;
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

    // Monte-Carlo Unsicherheitsband (N=500)
    const samples = [];
    for (let i = 0; i < 500; i++) {
        const vpr = Math.max(1, ind.visitorsPerReview * (1 + randn() * 0.5));
        const cr = Math.max(0.01, ind.convRate * (1 + randn() * 0.3));
        const av = Math.max(5, ind.avgValue * (1 + randn() * 0.25));
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
