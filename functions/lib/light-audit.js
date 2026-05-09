/**
 * Light-Audit — PSI-unabhaengige Audit-Variante.
 *
 * Direkt-Fetch der Ziel-URL → Tech-Detect via HTML-Patterns +
 * Wayback-Freshness + BFSG-Heuristik aus dem HTML + Branchen-Standards.
 *
 * Wird vom quickAudit-Endpoint aufgerufen, wenn die volle PSI-Pipeline
 * nicht verfuegbar ist (Quota, Timeout) oder als immer-laufende Basis,
 * der die Vollpipeline optional weitere Felder hinzufuegt.
 *
 * Ziel: 3-5 s Latenz statt 15-30 s.
 */

const { checkFreshness, analyzeTechAge } = require('./audit-pipeline.js');
const { extractSubPages, htmlToText } = require('./deep-research.js');
const { checkBranchStandards } = require('./branch-standards.js');

// Repliziert aus audit-pipeline.js (dort intern, nicht exportiert).
// Hier auf HTML-Body angewendet, nicht auf PSI-Network-Request-URLs.
const TECH_PATTERNS = [
    { match: /\/wp-content\/|\/wp-includes\//i, cms: 'WordPress', baukasten: false },
    { match: /static\.wixstatic\.com|parastorage\.com/i, cms: 'Wix', baukasten: true },
    { match: /jimdo-storage\.|a\.jimdo\.com|jimdo\.com/i, cms: 'Jimdo', baukasten: true },
    { match: /squarespace\.com|static1\.squarespace/i, cms: 'Squarespace', baukasten: true },
    { match: /cdn\.shopify\.com/i, cms: 'Shopify', baukasten: true },
    { match: /weeblycloud\.com|weebly\.com/i, cms: 'Weebly', baukasten: true },
    { match: /\.webflow\.com|webflow\.io/i, cms: 'Webflow', baukasten: false },
    { match: /divi\/includes|et-boc|et_pb_/i, cms: 'WordPress + Divi', baukasten: false },
    { match: /elementor/i, cms: 'WordPress + Elementor', baukasten: false },
    { match: /ionos\.com|1and1|1und1/i, cms: 'IONOS Baukasten', baukasten: true },
    { match: /strato\.de/i, cms: 'Strato Homepage-Baukasten', baukasten: true },
    { match: /typo3conf|typo3temp/i, cms: 'TYPO3', baukasten: false },
    { match: /joomla|com_content/i, cms: 'Joomla', baukasten: false },
    { match: /drupal/i, cms: 'Drupal', baukasten: false },
    { match: /contao|tl_files/i, cms: 'Contao', baukasten: false }
];
const BAUKASTEN_SUBDOMAIN = /\.jimdosite\.com|\.jimdo\.com|\.wixsite\.com|\.weebly\.com|\.webflow\.io/i;

async function fetchHtml(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; KarriaroAudit/1.0; +https://karriaro-webdesign.de/audit)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'de-DE,de;q=0.9'
            },
            redirect: 'follow'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const finalUrl = res.url || url;
        const html = await res.text();
        return { html, finalUrl };
    } finally {
        clearTimeout(t);
    }
}

function detectTechFromHtml(html, finalUrl) {
    const result = { cms: null, version: null, signals: [], isBaukasten: false };

    for (const p of TECH_PATTERNS) {
        if (p.match.test(html)) {
            if (!result.cms) result.cms = p.cms;
            result.isBaukasten = result.isBaukasten || p.baukasten;
            result.signals.push(`HTML-Pattern: ${p.cms}`);
        }
    }

    const wpVer = html.match(/wp-includes\/[^?]*\?ver=([0-9.]+)/);
    if (wpVer) result.version = wpVer[1];

    const gen = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
    if (gen) {
        const g = gen[1];
        if (!result.cms) {
            if (/wordpress/i.test(g)) result.cms = 'WordPress';
            else if (/joomla/i.test(g)) result.cms = 'Joomla';
            else if (/drupal/i.test(g)) result.cms = 'Drupal';
            else if (/typo3/i.test(g)) result.cms = 'TYPO3';
            else if (/contao/i.test(g)) result.cms = 'Contao';
            else if (/shopify/i.test(g)) { result.cms = 'Shopify'; result.isBaukasten = true; }
            else if (/wix/i.test(g)) { result.cms = 'Wix'; result.isBaukasten = true; }
        }
        const verInGen = g.match(/(\d+\.\d+(?:\.\d+)?)/);
        if (verInGen && !result.version) result.version = verInGen[1];
        result.signals.push(`Generator-Meta: ${g}`);
    }

    if (BAUKASTEN_SUBDOMAIN.test(finalUrl)) {
        result.isBaukasten = true;
        result.signals.push('Subdomain eines Baukastens');
    }

    return result;
}

function bfsgHeuristic(html) {
    const checks = [];
    let score = 100;

    const langMatch = html.match(/<html[^>]*\blang\s*=\s*["']([a-zA-Z-]+)["']/i);
    if (!langMatch) {
        checks.push({ id: 'lang-attr', failed: true, label: 'lang-Attribut auf <html> fehlt' });
        score -= 18;
    }

    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!title || !title[1].trim()) {
        checks.push({ id: 'title', failed: true, label: '<title> fehlt oder leer' });
        score -= 12;
    }

    const imgs = html.match(/<img[^>]*>/gi) || [];
    const imgsWithAlt = imgs.filter(i => /\balt\s*=\s*["'][^"']/i.test(i));
    const altCoverage = imgs.length > 0 ? imgsWithAlt.length / imgs.length : 1;
    if (imgs.length > 0 && altCoverage < 0.7) {
        checks.push({
            id: 'alt-text',
            failed: true,
            label: `Alt-Text fehlt bei ${imgs.length - imgsWithAlt.length} von ${imgs.length} Bildern`
        });
        score -= 22;
    }

    const h1Count = (html.match(/<h1\b[^>]*>/gi) || []).length;
    if (h1Count === 0) {
        checks.push({ id: 'h1', failed: true, label: 'Keine <h1>-Ueberschrift' });
        score -= 14;
    } else if (h1Count > 1) {
        checks.push({ id: 'h1-multiple', failed: true, label: `${h1Count} <h1>-Ueberschriften statt einer` });
        score -= 8;
    }

    // Form-Inputs ohne zugeordnetes Label (heuristisch: Label-Anzahl < Input-Anzahl)
    const formInputs = (html.match(/<input[^>]+type\s*=\s*["'](?:text|email|tel|url|number|search)["']/gi) || []).length;
    const labels = (html.match(/<label\b[^>]*>/gi) || []).length;
    if (formInputs > 0 && labels < formInputs) {
        checks.push({
            id: 'form-labels',
            failed: true,
            label: `${formInputs - labels} Formularfelder ohne <label>`
        });
        score -= 10;
    }

    // Skip-Link (Empfehlung, kein muss)
    if (!/skip[- ]?(?:to[- ]?)?(?:content|main)/i.test(html) && !/zum[- ]?(?:haupt[- ]?)?inhalt/i.test(html)) {
        checks.push({ id: 'skip-link', failed: true, label: 'Skip-Link zum Hauptinhalt fehlt' });
        score -= 6;
    }

    score = Math.max(0, Math.min(100, score));

    let risk, fine;
    if (score < 50) { risk = 'kritisch'; fine = '100.000 €'; }
    else if (score < 70) { risk = 'hoch'; fine = '50.000 €'; }
    else if (score < 85) { risk = 'mittel'; fine = '10.000 €'; }
    else { risk = 'niedrig'; fine = 'kein Risiko erkennbar'; }

    const pitchArg = (risk === 'kritisch' || risk === 'hoch')
        ? `Heuristik-Score ${score}% — Ihre Seite weist sichtbare Barrierefreiheits-Luecken auf. BFSG ist seit Juni 2025 Pflicht, Bussgelder bis ${fine}.`
        : (risk === 'mittel'
            ? `Heuristik-Score ${score}% — einzelne BFSG-Punkte sind verbesserungswuerdig. Vollstaendige WCAG-Pruefung im Komplettaudit.`
            : null);

    return {
        complianceScore: score,
        risk,
        fine,
        method: 'heuristic',
        checks,
        pitchArg
    };
}

async function fetchPlaceType(url, placesKey) {
    if (!placesKey) return null;
    try {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        try {
            const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
                method: 'POST',
                signal: ctrl.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': placesKey,
                    'X-Goog-FieldMask': 'places.primaryType,places.displayName,places.websiteUri'
                },
                body: JSON.stringify({ textQuery: domain, languageCode: 'de', maxResultCount: 3 })
            });
            if (!res.ok) return null;
            const data = await res.json();
            // Bestes Match: gleiche Website-Domain, sonst erstes Ergebnis
            const places = data?.places || [];
            const exact = places.find(p => {
                if (!p.websiteUri) return false;
                try { return new URL(p.websiteUri).hostname.replace(/^www\./, '') === domain; }
                catch { return false; }
            });
            return (exact || places[0])?.primaryType || null;
        } finally {
            clearTimeout(t);
        }
    } catch (err) {
        console.warn('Place lookup failed:', err.message);
        return null;
    }
}

/**
 * Liefert ein Audit-Snippet ohne PSI.
 * @param {string} url        normalisierte URL
 * @param {string} placesKey  Google Places API Key (optional, Default '')
 * @returns {Promise<object>} { ok, light:true, tech, wayback, techAge, bfsg, branch }
 */
async function runLightAudit(url, placesKey) {
    // Parallel: HTML + Wayback + Place-Lookup (Branchen-Detect)
    const [htmlResult, wayback, primaryType] = await Promise.all([
        fetchHtml(url),
        checkFreshness(url).catch(() => ({ available: false })),
        fetchPlaceType(url, placesKey).catch(() => null)
    ]);

    const { html, finalUrl } = htmlResult;
    const tech = detectTechFromHtml(html, finalUrl);
    const techAge = analyzeTechAge(tech, wayback);
    const bfsg = bfsgHeuristic(html);

    const subPages = extractSubPages(html, finalUrl, 8);
    const body = htmlToText(html, 50000);
    const branch = checkBranchStandards(primaryType, { subPages, body });

    return {
        ok: true,
        light: true,
        url,
        finalUrl,
        tech,
        wayback,
        techAge,
        bfsg,
        branch,
        subPages
    };
}

module.exports = {
    runLightAudit,
    detectTechFromHtml,
    bfsgHeuristic,
    fetchHtml,
    fetchPlaceType
};
