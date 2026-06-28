/**
 * Scan-Aggregation — „Voranalyse": verdichtet die Leads EINES Scans (alle 18
 * Branchen × Stadt × Stadtteile) zu einer Antwort auf „WO lohnt die Jagd?".
 *
 * Kern-Idee (research-gestützt): Eine schwache Website allein ist KEIN Kaufsignal.
 * Der heiße Markt ist dort, wo viele erreichbare Betriebe sitzen, die NACHWEISLICH
 * Geld für Werbung ausgeben (Ad-Intent) UND eine verbesserungswürdige Seite haben.
 * → nestScore gewichtet Anzahl × Anzeigen-Quote × „wirbt+schwach" × Median-Opportunity × Saison.
 *
 * Reine Funktionen (kein DOM, kein Netzwerk) → testbar. Quelle = die Lead-Objekte
 * aus dem Scanner (leadScore/opportunity, adIntent, rating, reviews, branch).
 * @module analysis/scan-aggregate
 */
import { seasonalTriggerFor } from './trigger-events.js';

const HOT = 70;        // Score-Schwellen, konsistent mit renderLeadWorkspace
const QUALIFIED = 50;

function median(arr) {
    const a = arr.filter(x => x != null && isFinite(x)).slice().sort((x, y) => x - y);
    if (!a.length) return 0;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function oppOf(l) {
    return l.opportunity != null ? l.opportunity : (l.leadScore != null ? l.leadScore : 0);
}

/**
 * Heißes-Nest-Score: wie viele ERREICHBARE, werbende, verbesserungswürdige
 * Betriebe clustern in dieser Branche? Belohnt bewiesenes Budget (Anzeigen),
 * direkte „wirbt + schwach"-Treffer und das aktuelle Saison-Fenster.
 */
export function hotNestScore(b) {
    const base = b.qualified;                       // Anzahl lohnender Leads (Score ≥ 50)
    const budget = 0.6 + 0.8 * b.adQuote;           // 0.6…1.4 — Markt mit Werbe-Budget
    const adWeakBonus = 1 + 0.15 * b.adWeakCount;   // direkte „wirbt + schwache Seite"-Treffer
    const opp = (b.medianOpportunity || 0) / HOT;   // ~1 bei medianem Hot-Lead
    const season = b.seasonalNow ? 1.15 : 1;
    return +(base * budget * adWeakBonus * opp * season).toFixed(2);
}

/**
 * Verdichtet eine Lead-Liste zu Branchen-Aggregaten + Stadt-Zusammenfassung.
 * @param {object[]} leads  Scanner-Leads (mit opportunity/leadScore, adIntent, rating, reviews, branch)
 * @param {string} [city]
 * @returns {{city:string, summary:object, branches:object[]}}
 */
export function aggregateScan(leads, city = '', month = new Date().getMonth()) {
    const groups = new Map();
    for (const l of leads || []) {
        const key = (l.branch && l.branch.key) || l.primaryType || 'unbekannt';
        if (!groups.has(key)) groups.set(key, { key, name: (l.branch && l.branch.name) || key, type: l.primaryType || key, leads: [] });
        groups.get(key).leads.push(l);
    }

    const branches = [];
    for (const g of groups.values()) {
        const ls = g.leads;
        const opps = ls.map(oppOf);
        const fits = ls.map(l => l.buyerFit).filter(x => x != null);
        const ratings = ls.map(l => l.rating).filter(r => r != null);
        const adActive = ls.filter(l => l.adIntent && l.adIntent.active).length;
        const qualified = ls.filter(l => oppOf(l) >= QUALIFIED).length;
        const hot = ls.filter(l => oppOf(l) >= HOT).length;
        const adWeakCount = ls.filter(l => l.adIntent && l.adIntent.active && oppOf(l) >= QUALIFIED).length;
        const b = {
            key: g.key,
            name: g.name,
            count: ls.length,
            qualified,
            hot,
            medianOpportunity: Math.round(median(opps)),
            medianBuyerFit: fits.length ? Math.round(median(fits)) : null,
            adActive,
            adQuote: ls.length ? adActive / ls.length : 0,
            adWeakCount,
            medianRating: ratings.length ? +median(ratings).toFixed(1) : null,
            medianReviews: Math.round(median(ls.map(l => l.reviews || 0))),
            seasonalNow: !!seasonalTriggerFor(g.type, month)
        };
        b.nestScore = hotNestScore(b);
        branches.push(b);
    }
    branches.sort((a, b) => b.nestScore - a.nestScore);

    const all = leads || [];
    const summary = {
        city,
        totalLeads: all.length,
        totalHot: all.filter(l => oppOf(l) >= HOT).length,
        totalQualified: all.filter(l => oppOf(l) >= QUALIFIED).length,
        adActive: all.filter(l => l.adIntent && l.adIntent.active).length,
        adQuote: all.length ? all.filter(l => l.adIntent && l.adIntent.active).length / all.length : 0,
        branchesWithLeads: branches.length,
        topBranches: branches.slice(0, 3).map(b => b.name)
    };
    return { city, summary, branches };
}
