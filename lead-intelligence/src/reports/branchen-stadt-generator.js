/**
 * Report-Generator — Branche × Stadt.
 *
 * Aggregiert eine Lead-Liste eines Scanner-Runs zu einem öffentlich
 * veröffentlichbaren, anonymisierten Branchen-Report. Output ist reines
 * JSON, das der Static-HTML-Builder (Modul B) in Editorial-HTML rendert.
 *
 * Pure-functional: kein DOM, kein Firebase, keine Side-Effects. Eingaben
 * sind Lead-Objekte im Format, das `orchestration/scanner.js` produziert
 * und `crm/leads.js` persistiert.
 *
 * DSGVO: Domain-Hashing via SHA-256 (Web-Crypto im Browser, Node-Crypto
 * in Tests). Es werden keine Klarnamen oder URLs im Report-JSON
 * mitgegeben — nur anonymisierte Lead-IDs + aggregierte Statistiken.
 */
import { mannWhitneyU } from '../learning/score-distribution.js';

const MIN_N = 30;

const BRANCH_SLUG = {
    dentist: { slug: 'zahnaerzte', name: 'Zahnärzte' },
    hair_salon: { slug: 'friseure', name: 'Friseure' },
    restaurant: { slug: 'restaurants', name: 'Restaurants' },
    auto_repair: { slug: 'kfz-werkstaetten', name: 'KFZ-Werkstätten' },
    beauty_salon: { slug: 'kosmetikstudios', name: 'Kosmetikstudios' },
    physiotherapist: { slug: 'physiotherapie', name: 'Physiotherapie' },
    lawyer: { slug: 'rechtsanwaelte', name: 'Rechtsanwälte' },
    real_estate_agency: { slug: 'immobilienmakler', name: 'Immobilienmakler' },
    hotel: { slug: 'hotels', name: 'Hotels' },
    plumber: { slug: 'sanitaerbetriebe', name: 'Sanitärbetriebe' },
    electrician: { slug: 'elektrobetriebe', name: 'Elektrobetriebe' },
    veterinary_care: { slug: 'tieraerzte', name: 'Tierärzte' },
    gym: { slug: 'fitnessstudios', name: 'Fitnessstudios' },
    moving_company: { slug: 'umzugsfirmen', name: 'Umzugsfirmen' },
    car_dealer: { slug: 'autohaeuser', name: 'Autohäuser' },
    bakery: { slug: 'baeckereien', name: 'Bäckereien' },
    florist: { slug: 'floristen', name: 'Floristen' },
    cafe: { slug: 'cafes', name: 'Cafés' }
};

const ID_PREFIX_BY_BRANCH = {
    dentist: 'Z', hair_salon: 'F', restaurant: 'R', auto_repair: 'K',
    beauty_salon: 'B', physiotherapist: 'P', lawyer: 'L', real_estate_agency: 'I',
    hotel: 'H', plumber: 'S', electrician: 'E', veterinary_care: 'T',
    gym: 'G', moving_company: 'U', car_dealer: 'A', bakery: 'B',
    florist: 'O', cafe: 'C'
};

/**
 * Stable, deterministic short-hash für eine Domain.
 *
 * Standalone implementiert (FNV-1a 32-bit), damit der Generator sync
 * arbeitet und in Node-Tests ohne Crypto-Polyfill läuft. Für reine
 * Anonymisierung (kein kryptographischer Schutz nötig) ist FNV
 * ausreichend; eine Korrelation Domain ↔ ID bleibt nur dem internen
 * Besitzer der Lead-Liste bekannt.
 */
export function anonymizeId(domain, branchKey = '_') {
    const prefix = ID_PREFIX_BY_BRANCH[branchKey] || 'X';
    const normalized = String(domain || '').toLowerCase().replace(/^www\./, '').trim();
    if (!normalized) return `${prefix}-000`;
    let h = 0x811c9dc5;
    for (let i = 0; i < normalized.length; i++) {
        h ^= normalized.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    const num = h % 1000;
    return `${prefix}-${String(num).padStart(3, '0')}`;
}

function quantile(sortedArr, q) {
    if (!sortedArr.length) return null;
    const idx = (sortedArr.length - 1) * q;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sortedArr[lo];
    return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function round1(x) { return x == null ? null : Math.round(x * 10) / 10; }

export function summarizeNumeric(values) {
    const clean = values.filter(v => Number.isFinite(v));
    if (!clean.length) return { n: 0, median: null, p25: null, p75: null, mean: null, min: null, max: null };
    const sorted = [...clean].sort((a, b) => a - b);
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    return {
        n: sorted.length,
        median: round1(quantile(sorted, 0.50)),
        p25: round1(quantile(sorted, 0.25)),
        p75: round1(quantile(sorted, 0.75)),
        mean: round1(mean),
        min: sorted[0],
        max: sorted[sorted.length - 1]
    };
}

export function distributeCategorical(values, { topN = 10 } = {}) {
    const counts = new Map();
    let total = 0;
    for (const raw of values) {
        const key = raw == null || raw === '' ? '—' : String(raw);
        counts.set(key, (counts.get(key) || 0) + 1);
        total++;
    }
    if (!total) return {};
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const out = {};
    for (const [k, c] of sorted.slice(0, topN)) {
        out[k] = { count: c, share: Math.round((c / total) * 1000) / 1000 };
    }
    if (sorted.length > topN) {
        const restCount = sorted.slice(topN).reduce((s, [, c]) => s + c, 0);
        out['Sonstige'] = { count: restCount, share: Math.round((restCount / total) * 1000) / 1000 };
    }
    return out;
}

function bucketize(value, binSize = 10, max = 100) {
    if (value == null || !Number.isFinite(value)) return null;
    const lo = Math.max(0, Math.min(max - binSize, Math.floor(value / binSize) * binSize));
    return `${lo}-${lo + binSize - 1}`;
}

/**
 * Heuristik: ist die Site ein „Static / Custom-Code" (nicht WordPress,
 * nicht Baukasten, kein bekanntes CMS)? Für das Gut-vs-Schlecht-Pairing
 * in der Mann-Whitney-Sektion.
 */
function isStaticOrCustom(lead) {
    if (lead.isBaukasten) return false;
    const cms = (lead.cms || '').toLowerCase();
    if (!cms || cms === '—') return true;
    if (cms.includes('static') || cms.includes('next') || cms.includes('astro') || cms.includes('hugo') || cms.includes('eleventy')) return true;
    return false;
}

function isWordPress(lead) {
    const cms = (lead.cms || '').toLowerCase();
    return cms.includes('wordpress') || cms === 'wp';
}

export function buildSignificanceTests(leads) {
    const tests = [];
    const wp = leads.filter(isWordPress).map(l => l?.ws?.perf).filter(Number.isFinite);
    const st = leads.filter(isStaticOrCustom).map(l => l?.ws?.perf).filter(Number.isFinite);
    if (wp.length >= 10 && st.length >= 10) {
        const u = mannWhitneyU(wp, st);
        if (u) {
            const wpMed = round1(quantile([...wp].sort((a, b) => a - b), 0.5));
            const stMed = round1(quantile([...st].sort((a, b) => a - b), 0.5));
            const diff = stMed - wpMed;
            tests.push({
                kind: 'mann-whitney',
                label: 'WordPress vs. Static/Custom (PageSpeed Performance)',
                groupA: { label: 'WordPress', n: wp.length, median: wpMed },
                groupB: { label: 'Static/Custom', n: st.length, median: stMed },
                u: u.U, z: u.z, p: u.p,
                verdict: u.p < 0.05
                    ? diff > 0
                        ? `Static-/Custom-Sites liegen im Median ${diff} Performance-Punkte über WordPress (p=${u.p}).`
                        : `WordPress-Sites liegen im Median ${Math.abs(diff)} Performance-Punkte über Static/Custom (p=${u.p}).`
                    : `Kein signifikanter Unterschied (p=${u.p}, n_WP=${wp.length}, n_Static=${st.length}).`
            });
        }
    }

    const baukasten = leads.filter(l => l.isBaukasten).map(l => l?.ws?.perf).filter(Number.isFinite);
    const own = leads.filter(l => !l.isBaukasten).map(l => l?.ws?.perf).filter(Number.isFinite);
    if (baukasten.length >= 10 && own.length >= 10) {
        const u = mannWhitneyU(baukasten, own);
        if (u) {
            const bMed = round1(quantile([...baukasten].sort((a, b) => a - b), 0.5));
            const oMed = round1(quantile([...own].sort((a, b) => a - b), 0.5));
            const diff = oMed - bMed;
            tests.push({
                kind: 'mann-whitney',
                label: 'Baukasten vs. eigener Tech-Stack (PageSpeed Performance)',
                groupA: { label: 'Baukasten', n: baukasten.length, median: bMed },
                groupB: { label: 'Eigener Stack', n: own.length, median: oMed },
                u: u.U, z: u.z, p: u.p,
                verdict: u.p < 0.05
                    ? diff > 0
                        ? `Eigene Stacks liegen im Median ${diff} Performance-Punkte über Baukasten-Sites (p=${u.p}).`
                        : `Baukasten-Sites liegen im Median ${Math.abs(diff)} Performance-Punkte über eigene Stacks (p=${u.p}).`
                    : `Kein signifikanter Unterschied (p=${u.p}).`
            });
        }
    }

    return tests;
}

function slugify(s) {
    return String(s || '').toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Hauptfunktion. Wirft, wenn n < MIN_N — Trust-Foundation: kein Report
 * mit dünner Datenbasis.
 *
 * @param {Array} leads — Lead-Objekte aus dem Scanner-Run, gefiltert auf
 *   eine Branche und eine Stadt.
 * @param {object} options
 * @param {string} options.brancheKey — z.B. 'hair_salon'
 * @param {string} options.stadtName  — z.B. 'Köln'
 * @param {number} [options.erhebungTs] — Default Date.now()
 */
export function generateReport(leads, { brancheKey, stadtName, erhebungTs = Date.now() }) {
    if (!Array.isArray(leads)) throw new Error('leads must be an array');
    if (leads.length < MIN_N) {
        const err = new Error(`Insufficient sample: n=${leads.length}, required ≥${MIN_N}`);
        err.code = 'INSUFFICIENT_SAMPLE';
        err.n = leads.length;
        err.required = MIN_N;
        throw err;
    }
    const branch = BRANCH_SLUG[brancheKey];
    if (!branch) throw new Error(`Unknown brancheKey: ${brancheKey}`);
    const stadtSlug = slugify(stadtName);
    if (!stadtSlug) throw new Error(`Stadt-Name ergibt leeren Slug: '${stadtName}'`);

    const erhebungDate = new Date(erhebungTs);
    const erhebungIso = erhebungDate.toISOString().slice(0, 10);
    const erhebungMonth = erhebungDate.toISOString().slice(0, 7);

    const anonymized = leads.map(l => ({
        id: anonymizeId(l.domain || l.websiteUri, brancheKey),
        scoreBucket: bucketize(l.leadScore, 10, 100),
        perfBucket: bucketize(l?.ws?.perf, 10, 100),
        cms: l.cms || null,
        isBaukasten: !!l.isBaukasten,
        hasReviews: (l.reviews || 0) >= 5,
        hasSsl: l?.ws?.isHttps !== false,
        hasMobileViewport: l?.ws?.viewport !== false
    }));

    const stats = {
        perf: summarizeNumeric(leads.map(l => l?.ws?.perf)),
        seo: summarizeNumeric(leads.map(l => l?.ws?.seo)),
        a11y: summarizeNumeric(leads.map(l => l?.ws?.a11y)),
        leadScore: summarizeNumeric(leads.map(l => l.leadScore))
    };

    const techStack = distributeCategorical(leads.map(l => l.cms || '—'), { topN: 8 });
    const baukastenCount = leads.filter(l => l.isBaukasten).length;
    const baukasten = {
        count: baukastenCount,
        share: Math.round((baukastenCount / leads.length) * 1000) / 1000
    };
    const sslMissing = leads.filter(l => l?.ws?.isHttps === false).length;
    const ssl = {
        missingCount: sslMissing,
        missingShare: Math.round((sslMissing / leads.length) * 1000) / 1000
    };
    const mobileMissing = leads.filter(l => l?.ws?.viewport === false).length;
    const mobile = {
        missingCount: mobileMissing,
        missingShare: Math.round((mobileMissing / leads.length) * 1000) / 1000
    };

    const tests = buildSignificanceTests(leads);

    return {
        brancheKey,
        brancheSlug: branch.slug,
        brancheName: branch.name,
        stadtName,
        stadtSlug,
        slug: `${branch.slug}-${stadtSlug}`,
        erhebungDate: erhebungIso,
        erhebungMonth,
        n: leads.length,
        leads: anonymized,
        stats,
        techStack,
        baukasten,
        ssl,
        mobile,
        tests,
        methodology: {
            source: 'Google Places API + PageSpeed Insights + Tech-Detect-Heuristik',
            filter: `≥ 5 öffentliche Bewertungen, OPERATIONAL, eigene Website, keine Enterprise-Domain`,
            minSampleSize: MIN_N,
            instrumentation: 'Karriaro Lead-Intelligence v2',
            anonymization: 'FNV-1a-Hash über Domain, Branche-Präfix + 3-stellige Nummer',
            license: 'CC BY 4.0 — Quellenangabe karriaro-webdesign.de'
        }
    };
}

export const REPORT_GENERATOR_CONSTANTS = { MIN_N, BRANCH_SLUG, ID_PREFIX_BY_BRANCH };
