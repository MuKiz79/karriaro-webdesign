/**
 * Branchen-spezifische Beta-Priors — KALIBRIERT mit echten Daten
 *
 * Quellen:
 * - Open Rates: Snov.io Cold Email Statistics 2026 (N=Milliarden)
 * - Reply Rates: Snov.io 2026, Instantly Benchmark Report 2026
 * - Channels: Outreaches.ai Cold Outreach Benchmarks 2025
 *
 * Format: r=Reach, o=Open, i=Interest, c=Conversation, p=Proposal, cl=Close
 * Jeder Wert ist [alpha, beta] einer Beta-Verteilung
 * tpl=Time per Lead (hours), ds=Deal Size (EUR), ch=Channels
 */

export const BRANCH_PRIORS = {
    'dentist':          { r:[12,2], o:[5,15],  i:[5,5],   c:[5,4], p:[7,2], cl:[8,3],  tpl:2.5, ds:1990, ch:['email','phone'] },
    'doctor':           { r:[10,3], o:[5,15],  i:[5,5],   c:[4,5], p:[7,2], cl:[7,4],  tpl:2.5, ds:1990, ch:['email'] },
    'real_estate_agency':{ r:[12,2],o:[7,14],  i:[6,4],   c:[4,5], p:[7,2], cl:[7,3],  tpl:3.0, ds:1990, ch:['email','linkedin'] },
    'lawyer':           { r:[10,3], o:[5,14],  i:[10,10], c:[4,5], p:[7,2], cl:[6,4],  tpl:3.0, ds:1990, ch:['email'] },
    'hotel':            { r:[12,2], o:[6,14],  i:[7,3],   c:[3,5], p:[7,2], cl:[7,3],  tpl:3.0, ds:1990, ch:['email'] },
    'car_dealer':       { r:[10,3], o:[5,15],  i:[3,7],   c:[3,5], p:[7,2], cl:[5,4],  tpl:3.0, ds:1990, ch:['phone','visit'] },
    'beauty_salon':     { r:[9,3],  o:[5,15],  i:[5,4],   c:[5,4], p:[7,2], cl:[6,4],  tpl:2.0, ds:1490, ch:['instagram','visit'] },
    'restaurant':       { r:[10,2], o:[6,14],  i:[7,3],   c:[5,4], p:[7,2], cl:[6,5],  tpl:2.0, ds:1500, ch:['visit','phone'] },
    'hair_salon':       { r:[9,3],  o:[5,15],  i:[5,3],   c:[6,4], p:[7,2], cl:[5,4],  tpl:1.5, ds:990,  ch:['visit','instagram'] },
    'physiotherapist':  { r:[9,3],  o:[5,15],  i:[5,5],   c:[4,4], p:[7,2], cl:[5,4],  tpl:2.0, ds:990,  ch:['email','phone'] },
    'auto_repair':      { r:[8,4],  o:[5,15],  i:[4,5],   c:[4,4], p:[7,2], cl:[5,5],  tpl:1.5, ds:990,  ch:['phone','visit'] },
    'plumber':          { r:[7,5],  o:[6,13],  i:[5,4],   c:[4,4], p:[7,2], cl:[5,5],  tpl:1.5, ds:990,  ch:['phone'] },
    'electrician':      { r:[7,5],  o:[6,13],  i:[4,5],   c:[4,4], p:[7,2], cl:[5,5],  tpl:1.5, ds:990,  ch:['phone'] },
    'gym':              { r:[9,3],  o:[5,15],  i:[4,4],   c:[4,4], p:[7,2], cl:[5,5],  tpl:2.0, ds:990,  ch:['email','visit'] },
    'veterinary_care':  { r:[9,3],  o:[5,15],  i:[5,5],   c:[4,4], p:[7,2], cl:[5,4],  tpl:2.0, ds:990,  ch:['email','phone'] },
    'moving_company':   { r:[7,4],  o:[5,15],  i:[7,3],   c:[4,4], p:[7,2], cl:[5,5],  tpl:2.0, ds:990,  ch:['email','phone'] },
    'bakery':           { r:[8,4],  o:[5,15],  i:[3,6],   c:[4,5], p:[7,2], cl:[3,6],  tpl:1.5, ds:990,  ch:['visit'] },
    'florist':          { r:[8,4],  o:[5,15],  i:[3,5],   c:[4,5], p:[7,2], cl:[3,6],  tpl:1.5, ds:990,  ch:['visit'] },
    'cafe':             { r:[8,3],  o:[6,14],  i:[7,3],   c:[4,5], p:[7,2], cl:[3,6],  tpl:1.5, ds:990,  ch:['visit'] },
    '_default':         { r:[8,3],  o:[6,16],  i:[5,5],   c:[4,4], p:[7,2], cl:[5,4],  tpl:2.0, ds:990,  ch:['email'] }
};

export function getBranchPrior(type) {
    return BRANCH_PRIORS[type] || BRANCH_PRIORS._default;
}

// Saisonalität — kalibriert mit Snov.io 2026
export const SEASONALITY = {
    monthly: [1.10, 1.02, 1.08, 1.10, 1.06, 0.98, 1.24, 0.88, 0.94, 1.04, 1.08, 0.92],
    getCurrentFactor() { return this.monthly[new Date().getMonth()]; },
    bestDays: { send: 'Dienstag', engage: 'Mittwoch' },
    bestTime: '7-11 Uhr vormittags',
    getDayRecommendation() {
        const day = new Date().getDay();
        if (day === 2) return { optimal: true, label: 'Heute ist Dienstag — optimaler Versandtag (28.2% Open Rate, Snov.io)' };
        if (day === 3) return { optimal: true, label: 'Heute ist Mittwoch — höchste Reply-Rate (5.8%, Snov.io)' };
        return { optimal: false, label: 'Bester Versandtag: Dienstag (28.2% Open), bester Reply-Tag: Mittwoch (5.8%)' };
    }
};

// Multi-Channel Daten — kalibriert mit Outreaches.ai, Snov.io
export const CHANNELS = {
    'email':     { reachRate: 0.95, openRate: 0.277, costHours: 0.3, name: 'E-Mail' },       // Snov.io: 27.7% avg open
    'phone':     { reachRate: 0.60, openRate: 0.55,  costHours: 0.5, name: 'Anruf' },         // 57% C-Level prefer phone
    'visit':     { reachRate: 0.85, openRate: 0.80,  costHours: 1.5, name: 'Persönlich' },
    'linkedin':  { reachRate: 0.90, openRate: 0.103, costHours: 0.4, name: 'LinkedIn' },       // Outreaches.ai: 10.3% reply
    'instagram': { reachRate: 0.70, openRate: 0.15,  costHours: 0.3, name: 'Instagram DM' }
};
