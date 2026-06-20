/**
 * Empirische Benchmark-Daten aus öffentlichen Quellen
 *
 * Quellen:
 * - Snov.io Cold Email Statistics 2026 (N=Milliarden Emails)
 * - Instantly Benchmark Report 2026
 * - Prospeo Lead Conversion Benchmarks 2026
 * - BrightLocal Local Business Analytics
 * - Illustrate Digital Global Page Speed Report 2024
 * - First Page Sage Conversion Benchmarks 2026
 * - DarkHorse Dental Patient LTV
 * - Chili Piper Form Conversion Report 2025
 */

// ══════════════════════════════════════
// COLD EMAIL FUNNEL — ECHTE BENCHMARKS
// Pro 100 gesendete Emails (Snov.io 2026)
// ══════════════════════════════════════
export const COLD_EMAIL_FUNNEL = {
    sent: 100,
    opened: 40,        // 40% Open Rate (Snov.io 2026 avg: 27.7%, mit guter Deliverability: 40%)
    replied: 3,        // 3% Reply Rate (Snov.io avg: 5.1%, Cold: 3.43% Instantly)
    interested: 2,     // 2% zeigen echtes Interesse
    meeting: 1,        // 1% buchen Termin
    closed: 0.5,       // 0.5% kaufen (= End-to-End Conversion)

    // Stufen-Conversion-Rates (conditional)
    openRate: 0.40,
    replyGivenOpen: 0.075,       // 3/40 = 7.5% der Öffner antworten
    interestGivenReply: 0.67,    // 2/3 = 67% der Antworten sind Interesse
    meetingGivenInterest: 0.50,  // 1/2 = 50% der Interessierten nehmen Termin
    closeGivenMeeting: 0.50      // 0.5/1 = 50% der Termine werden Abschluss
};

// ══════════════════════════════════════
// OPEN RATES NACH BRANCHE (Snov.io 2026)
// ══════════════════════════════════════
export const OPEN_RATES_BY_INDUSTRY = {
    'software': 0.471, 'education': 0.404, 'marketing': 0.357,
    'real_estate': 0.326, 'construction': 0.320, 'hospitality': 0.293,
    'legal': 0.273, 'telecom': 0.272, 'it_services': 0.262,
    'ecommerce': 0.259, 'healthcare': 0.255, 'transport': 0.252,
    'accounting': 0.238, 'financial': 0.228, 'insurance': 0.220,
    '_average': 0.277
};

// ══════════════════════════════════════
// REPLY RATES NACH BRANCHE (Snov.io 2026)
// ══════════════════════════════════════
export const REPLY_RATES_BY_INDUSTRY = {
    'legal': 0.100, 'elearning': 0.079, 'chemicals': 0.074,
    'hospitality': 0.069, 'transport': 0.068, 'banking': 0.066,
    'food': 0.064, 'it_security': 0.063, 'consulting': 0.060,
    'real_estate': 0.058, 'insurance': 0.055, 'accounting': 0.055,
    'telecom': 0.052, 'healthcare': 0.049, 'ecommerce': 0.048,
    'financial': 0.048, 'marketing': 0.044, 'it_services': 0.037,
    'software': 0.005,
    '_average': 0.051
};

// ══════════════════════════════════════
// WEBSITE TRAFFIC LOKALE UNTERNEHMEN
// (BrightLocal, SEJ, Gitnux)
// ══════════════════════════════════════
export const LOCAL_BUSINESS_TRAFFIC = {
    average: 414,                  // BrightLocal: Durchschnitt
    median: 350,                   // 55% haben < 500
    p25: 100,                      // 13% haben < 100
    p75: 1500,                     // Top 20% haben > 1500
    p90: 2500,                     // Top 15%
    organicSearchShare: 0.50,      // 50% des Traffics kommt von organischer Suche
    mobileShare: 0.60,             // 60% mobil

    // Besucher pro Google-Review — kalibriert mit echten Daten
    // BrightLocal: 49% der Unternehmen haben > 1000 Search Views/Monat
    // Formel: visitors ≈ reviews × visitorsPerReview, capped
    byIndustry: {
        'restaurant':        { vpr: 20, minVisitors: 200, maxVisitors: 5000 },
        'cafe':              { vpr: 15, minVisitors: 100, maxVisitors: 3000 },
        'dentist':           { vpr: 12, minVisitors: 150, maxVisitors: 4000 },
        'doctor':            { vpr: 10, minVisitors: 150, maxVisitors: 3000 },
        'physiotherapist':   { vpr: 8,  minVisitors: 100, maxVisitors: 2000 },
        'hair_salon':        { vpr: 12, minVisitors: 100, maxVisitors: 3000 },
        'beauty_salon':      { vpr: 10, minVisitors: 100, maxVisitors: 2500 },
        'real_estate_agency':{ vpr: 8,  minVisitors: 200, maxVisitors: 5000 },
        'lawyer':            { vpr: 6,  minVisitors: 150, maxVisitors: 3000 },
        'auto_repair':       { vpr: 10, minVisitors: 100, maxVisitors: 2000 },
        'plumber':           { vpr: 8,  minVisitors: 80,  maxVisitors: 1500 },
        'electrician':       { vpr: 7,  minVisitors: 80,  maxVisitors: 1500 },
        'hotel':             { vpr: 25, minVisitors: 300, maxVisitors: 8000 },
        'gym':               { vpr: 15, minVisitors: 200, maxVisitors: 4000 },
        'veterinary_care':   { vpr: 10, minVisitors: 100, maxVisitors: 2000 },
        'bakery':            { vpr: 15, minVisitors: 100, maxVisitors: 2000 },
        'florist':           { vpr: 8,  minVisitors: 80,  maxVisitors: 1500 },
        'car_dealer':        { vpr: 15, minVisitors: 300, maxVisitors: 6000 },
        'moving_company':    { vpr: 5,  minVisitors: 80,  maxVisitors: 1500 },
        '_default':          { vpr: 10, minVisitors: 100, maxVisitors: 3000 }
    },

    estimateMonthlyVisitors(type, reviews) {
        const d = this.byIndustry[type] || this.byIndustry._default;
        return Math.min(d.maxVisitors, Math.max(d.minVisitors, reviews * d.vpr));
    }
};

// ══════════════════════════════════════
// WEB-LEAD-SHARE — Anteil der NEUKUNDEN, die ein lokales
// Unternehmen tatsaechlich UEBER die eigene Website gewinnt
// (vs. Telefon, Laufkundschaft, Empfehlung, Google-Maps-direkt, Portale).
// ══════════════════════════════════════
// Begruendung: estMonthlyVisitors x convRate misst, wie viele BESUCHER auf der
// Seite eine Aktion abschliessen (UX-/Buchungs-Friktion). Das Modell unterstellt
// damit implizit, die Website sei der primaere Lead-Kanal — was fuer Telefon-/
// Notfall-Gewerke (Sanitaer, Elektro, KFZ, Umzug, Autohaus) NICHT stimmt: dort
// wird ANGERUFEN. webLeadShare korrigiert genau diesen Kanal-Mix und wirkt NUR
// auf den Euro-Verlust (nicht auf die angezeigten Besucher, nicht auf convRate —
// sonst Doppel-Zaehlung). convRate bleibt eine reine Besucher->Aktion-Rate.
// Telefon-getrieben niedrig (~0.15-0.30), Buchungs-/Discovery-getrieben hoeher
// (~0.40-0.60). Werte noch nicht in eigenen Daten kalibriert; pro Branche
// anpassen, sobald Outcome-Daten vorliegen.
export const WEB_LEAD_SHARE = {
    'restaurant':         0.40,
    'cafe':               0.25,
    'dentist':            0.50,
    'doctor':             0.40,
    'physiotherapist':    0.60,
    'hair_salon':         0.50,
    'beauty_salon':       0.50,
    'real_estate_agency': 0.30,
    'lawyer':             0.30,
    'auto_repair':        0.22,
    'plumber':            0.18,
    'electrician':        0.20,
    'hotel':              0.40,
    'gym':                0.55,
    'veterinary_care':    0.45,
    'bakery':             0.20,
    'florist':            0.35,
    'car_dealer':         0.15,
    'moving_company':     0.25,
    '_default':           0.35
};

// ══════════════════════════════════════
// PAGESPEED SCORES NACH BRANCHE
// (Illustrate Digital 2024, Brad Holmes)
// ══════════════════════════════════════
export const PAGESPEED_BENCHMARKS = {
    overallAverage: 62,
    byIndustry: {
        'fashion': 49, 'recruitment': 52, 'accounting': 54,
        'legal': 56, 'healthcare': 58, 'construction': 60,
        'hospitality': 62, 'real_estate': 63, 'automotive': 65,
        'digital_marketing': 68, 'property': 70, 'jewellery': 74,
        '_default': 62
    },
    // Verteilung: 90+ = gut (ca. 15%), 50-89 = verbesserungswürdig (ca. 52%), <50 = schlecht (ca. 33%)
    distribution: { good: 0.15, needsWork: 0.52, poor: 0.33 }
};

// ══════════════════════════════════════
// CUSTOMER LIFETIME VALUE (CLV)
// (Branchenspezifisch, EUR)
// ══════════════════════════════════════
export const CUSTOMER_LIFETIME_VALUE = {
    'dentist':           { perVisit: 280, visitsPerYear: 2.5, retentionYears: 10, clv: 7000 },
    'doctor':            { perVisit: 150, visitsPerYear: 3,   retentionYears: 8,  clv: 3600 },
    'physiotherapist':   { perVisit: 80,  visitsPerYear: 12,  retentionYears: 3,  clv: 2880 },
    'hair_salon':        { perVisit: 55,  visitsPerYear: 6,   retentionYears: 8,  clv: 2640 },
    'beauty_salon':      { perVisit: 85,  visitsPerYear: 6,   retentionYears: 6,  clv: 3060 },
    'restaurant':        { perVisit: 35,  visitsPerYear: 15,  retentionYears: 5,  clv: 2625 },
    'cafe':              { perVisit: 12,  visitsPerYear: 50,  retentionYears: 4,  clv: 2400 },
    'real_estate_agency':{ perVisit: 4500,visitsPerYear: 0.2, retentionYears: 15, clv: 13500 },
    'lawyer':            { perVisit: 800, visitsPerYear: 1,   retentionYears: 5,  clv: 4000 },
    'auto_repair':       { perVisit: 350, visitsPerYear: 2,   retentionYears: 8,  clv: 5600 },
    'plumber':           { perVisit: 280, visitsPerYear: 1,   retentionYears: 10, clv: 2800 },
    'electrician':       { perVisit: 250, visitsPerYear: 0.8, retentionYears: 10, clv: 2000 },
    'hotel':             { perVisit: 180, visitsPerYear: 2,   retentionYears: 5,  clv: 1800 },
    'gym':               { perVisit: 40,  visitsPerYear: 12,  retentionYears: 2.5,clv: 1200 },
    'veterinary_care':   { perVisit: 120, visitsPerYear: 3,   retentionYears: 10, clv: 3600 },
    'bakery':            { perVisit: 8,   visitsPerYear: 100, retentionYears: 5,  clv: 4000 },
    'florist':           { perVisit: 45,  visitsPerYear: 4,   retentionYears: 5,  clv: 900  },
    'car_dealer':        { perVisit: 25000,visitsPerYear:0.15,retentionYears: 20, clv: 75000 },
    'moving_company':    { perVisit: 900, visitsPerYear: 0.2, retentionYears: 15, clv: 2700  },
    '_default':          { perVisit: 150, visitsPerYear: 3,   retentionYears: 5,  clv: 2250  }
};

// ══════════════════════════════════════
// WEBSITE CONVERSION RATES (Besucher → Aktion)
// (First Page Sage 2026, VWO 2026, Chili Piper 2025)
// ══════════════════════════════════════
export const WEBSITE_CONVERSION_RATES = {
    average: 0.035,         // 3.5% Durchschnitt
    topPerformer: 0.10,     // 10%+ Top Performer
    mobile: 0.027,          // 2.7% Mobile
    desktop: 0.035,         // 3.5% Desktop
    formToMeeting: 0.667,   // 66.7% (Chili Piper: Form Fill → Meeting)
    withLiveCall: 0.692,    // 69.2% mit Live-Call Option
    appointmentBooking: { low: 0.05, mid: 0.065, high: 0.08 }  // 5-8% (Demand Nexus)
};

// ══════════════════════════════════════
// SYNTHETISCHE TRAINING-DATEN
// Generiert aus den obigen Benchmarks für ML-Modul A3
// 200 synthetische Leads mit realistischen Feature-Verteilungen
// ══════════════════════════════════════
export function generateSyntheticTrainingData(N = 200) {
    const data = [];
    const randn = () => { const u1=Math.random(),u2=Math.random(); return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2); };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    for (let i = 0; i < N; i++) {
        // Feature-Verteilungen basierend auf echten Benchmarks
        const perf = clamp(Math.round(62 + randn() * 20), 5, 100);      // Ø 62, SD 20
        const seo = clamp(Math.round(70 + randn() * 15), 10, 100);       // Ø 70
        const a11y = clamp(Math.round(65 + randn() * 18), 10, 100);      // Ø 65
        const reviews = Math.max(0, Math.round(Math.exp(3 + randn() * 1.5)));  // Log-Normal, Median ~20
        const rating = clamp(3.5 + randn() * 0.8, 1, 5);                 // Ø 3.5
        const isBaukasten = Math.random() < 0.25;                         // 25% sind Baukasten
        const hasInstagram = Math.random() < 0.35;                         // 35% haben Instagram
        const hasFbPixel = Math.random() < 0.15;                           // 15% haben FB Pixel
        const hasSSL = Math.random() < 0.92;                               // 92% haben SSL (8% fehlt)
        const hasViewport = Math.random() < 0.85;                          // 85% haben Viewport

        // Conversion-Wahrscheinlichkeit basierend auf echtem Funnel
        // Basis: 0.5% End-to-End, modifiziert durch Features
        let convProb = 0.005;
        if (perf < 40) convProb *= 1.5;           // Schlechte Website = besserer Lead
        if (!hasSSL) convProb *= 1.8;               // SSL fehlt = sichtbares Problem
        if (isBaukasten) convProb *= 1.4;           // Baukasten = strukturelle Limitierung
        if (reviews > 50) convProb *= 1.3;          // Aktives Business
        if (reviews > 200) convProb *= 1.2;
        if (rating >= 4.5 && reviews > 30) convProb *= 1.2;  // Gutes Business
        if (hasInstagram && perf < 60) convProb *= 1.5;       // Marketing-bewusst + schlechte Seite
        if (hasFbPixel) convProb *= 1.3;                       // Hat Werbebudget
        if (seo < 50) convProb *= 1.2;
        if (a11y < 50) convProb *= 1.1;
        if (perf >= 80 && hasSSL && !isBaukasten) convProb *= 0.3;  // Gute Website = schlechter Lead

        convProb = clamp(convProb, 0.001, 0.15);

        // Binäres Outcome basierend auf Wahrscheinlichkeit
        const outcome = Math.random() < convProb ? 1 : 0;

        data.push({
            features: { perf, seo, a11y, reviews, rating: Math.round(rating * 10) / 10, isBaukasten: isBaukasten ? 1 : 0, hasInstagram: hasInstagram ? 1 : 0, hasFbPixel: hasFbPixel ? 1 : 0, hasSSL: hasSSL ? 1 : 0, hasViewport: hasViewport ? 1 : 0 },
            predictedCR: convProb,
            outcome
        });
    }

    return data;
}
