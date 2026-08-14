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
const { checkBranchStandards, BRANCH_STANDARDS } = require('./branch-standards.js');
const { resolvePublicAddress } = require('./safe-fetch.js');  // Sprint 240 — safeFetch entfernt (undici-Agent-Teardown-500); alle Fetches via globales fetch + resolvePublicAddress-Guard
const { bfsgRiskTier } = require('./bfsg-risk.js');  // Sprint 180 — Single-Source Score→{risk,label}
const { bfsgPflichtLage } = require('./bfsg-scope.js');  // 2026-08-14 — Betroffenheit vor Rechtsfolge
const { scanPaidTools } = require('./site-evidence.js');
// Sprint 82 — TECH_PATTERNS jetzt Single-Source via tech-patterns.js
// (vorher in light-audit.js + audit-pipeline.js dupliziert).
const { TECH_PATTERNS, BAUKASTEN_SUBDOMAIN } = require('./tech-patterns.js');

async function fetchHtml(url, timeoutMs = 8000) {
    // Sprint 240 — globales fetch + per-Hop resolvePublicAddress statt safeFetchs custom-undici-
    // Agent. Dessen Socket-Teardown NACH dem Body-Read wirft im Cloud-Env intermittent eine
    // uncatchable AssertionError (assert(!this.paused), undici client-h1.js Parser.finish) → die
    // dem try/catch entkommt → quickAudit-500 + ERR_HTTP_HEADERS_SENT. Manueller Redirect-Follow
    // (redirect:'manual', Node-undici liefert die 3xx-Response mit Location lesbar) + SSRF-Guard
    // pro Hop. Kein IP-Pinning → DNS-Rebinding-TOCTOU akzeptiert (wie fetchRobotsTxt/kiVisibility).
    let current = url, finalUrl = url;
    for (let hop = 0; hop <= 3; hop++) {
        const u = new URL(current);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`SSRF blocked: protocol ${u.protocol}`);
        await resolvePublicAddress(u.hostname);
        const res = await fetch(current, {
            method: 'GET',
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; KarriaroAudit/1.0; +https://karriaro-webdesign.de/audit)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'de-DE,de;q=0.9'
            }
        });
        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get('location');
            if (!loc) throw new Error(`HTTP ${res.status}`);
            current = new URL(loc, current).toString();
            finalUrl = current;
            continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        finalUrl = current;
        const html = await res.text();
        const headers = {};
        try {
            res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        } catch (_) { /* headers iteration kann fehlschlagen je nach runtime */ }
        return { html, finalUrl, headers };
    }
    throw new Error('SSRF blocked: too many redirects');
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

function bfsgHeuristic(html, opts) {
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

    // Sprint 180 — Single-Source via bfsg-risk.js. Heuristik bewusst milder (mittel <85),
    // da die HTML-Heuristik gröber ist als die PSI-Vollanalyse (<90).
    const { risk, label } = bfsgRiskTier(score, { mittelBelow: 85 });

    // 2026-08-14 — Betroffenheit VOR Rechtsfolge (§§ 1, 3 BFSG). Ohne diese Prüfung
    // lief die Kette Score → Risiko → Bußgeld für jede Domain durch, auch für
    // Betriebe ohne jede BFSG-Pflicht. Siehe lib/bfsg-scope.js.
    const pflichtLage = bfsgPflichtLage({
        html,
        paidToolKeys: (opts && Array.isArray(opts.paidToolKeys)) ? opts.paidToolKeys : []
    });

    // Der Satz nennt die gemessene Wirkung, nicht eine Rechtsfolge — die gilt für
    // jeden Betrieb, unabhaengig von der Pflichtlage.
    const pitchArg = (risk === 'kritisch' || risk === 'hoch')
        ? `Heuristik-Score ${score}% — die Seite zeigt ${label} im Quelltext. Besucher, die die Schrift `
          + `vergroessern, per Tastatur bedienen oder einen Screenreader nutzen, stossen hier an Grenzen. `
          + `Vollstaendige WCAG-Pruefung im Komplettaudit.`
        : (risk === 'mittel'
            ? `Heuristik-Score ${score}% — einzelne Punkte sind verbesserungswuerdig. Vollstaendige WCAG-Pruefung im Komplettaudit.`
            : null);

    return {
        complianceScore: score,
        risk,
        label,
        pflichtLage,
        method: 'heuristic',
        checks,
        pitchArg
    };
}

/**
 * Sprint 70 — Normalisiert Google-Places primaryType auf BRANCH_STANDARDS-Hauptkategorien.
 * Places liefert Sub-Types wie 'german_restaurant', 'general_dentist', 'barber_shop',
 * 'hvac_contractor' — die ohne Map auf '_default' fallen wuerden.
 */
function normalizePlacesType(t) {
    if (!t) return t;
    // Restaurant-Cuisine-Suffix (american_restaurant, german_restaurant, pizza_restaurant, ...)
    if (/_restaurant$/.test(t)) return 'restaurant';
    if (['steakhouse', 'fast_food_restaurant', 'cafeteria', 'sushi_restaurant', 'ramen_restaurant', 'cafe', 'coffee_shop', 'bakery_cafe', 'tea_house', 'bar', 'pub', 'meal_takeaway'].includes(t)) return 'restaurant';
    // Healthcare
    if (['general_dentist', 'oral_surgeon', 'orthodontist', 'cosmetic_dentist', 'dental_clinic'].includes(t)) return 'dentist';
    if (['general_physician', 'family_practice', 'internal_medicine', 'pediatrician', 'gynecologist', 'dermatologist', 'cardiologist', 'medical_clinic', 'doctors_office'].includes(t)) return 'doctor';
    if (['physical_therapist'].includes(t)) return 'physiotherapist';
    // Trades
    // Sprint 81: general_contractor entfernt aus plumber-Mapping (zu breit), eigene Branche jetzt
    if (['hvac_contractor', 'gas_installer'].includes(t)) return 'plumber';
    if (['electrical_contractor'].includes(t)) return 'electrician';
    if (['car_repair', 'tire_shop'].includes(t)) return 'auto_repair';
    // Beauty
    if (['barber_shop'].includes(t)) return 'hair_salon';
    if (['nail_salon', 'spa', 'massage', 'day_spa'].includes(t)) return 'beauty_salon';
    // Legal
    if (['law_firm', 'attorney'].includes(t)) return 'lawyer';
    // Sprint 76 — neue Branchen
    if (['drug_store', 'medical_supply_store'].includes(t)) return 'pharmacy';
    if (['veterinarian', 'animal_hospital'].includes(t)) return 'veterinary_care';
    if (['tax_consultant', 'accountant', 'bookkeeper'].includes(t)) return 'accounting';
    if (['architecture_firm', 'architectural_design'].includes(t)) return 'architect';
    // Sprint 79 — neue Branchen
    if (['optician', 'eye_care_center'].includes(t)) return 'optical_store';
    if (['cafeteria_bakery'].includes(t)) return 'bakery'; // bakery wird direkt durchgereicht
    if (['cemetery', 'mortuary'].includes(t)) return 'funeral_home';
    if (['tour_agency', 'tourist_information_center'].includes(t)) return 'travel_agency';
    // Sprint 81 — Bau/Garten/Handwerk-Branchen
    if (['painting_contractor'].includes(t)) return 'painter';
    if (['landscape_designer', 'lawn_care_service', 'tree_service'].includes(t)) return 'landscaper';
    if (['construction_company', 'building_contractor'].includes(t)) return 'general_contractor';
    if (['cabinet_maker', 'woodworker'].includes(t)) return 'carpenter';
    // Sprint 174 — Digital-/Kreativagenturen (B2B-Dienstleister, oft nicht in Places gelistet)
    if (['marketing_agency', 'advertising_agency', 'graphic_designer', 'website_designer', 'web_design_company', 'internet_marketing_service'].includes(t)) return 'creative_agency';
    return t;
}

/**
 * Sprint 67 — URL-Heuristik als Fallback wenn Google-Places keine Branche findet.
 * Erkennt anhand der Hostname-Slugs typische deutsche KMU-Branchen.
 * Liefert primaryType im Google-Places-Schema (z.B. 'real_estate_agency'),
 * damit checkBranchStandards() das gleiche Mapping nutzen kann.
 */
function guessBranchFromUrl(url) {
    try {
        var host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        // Pattern-Matching auf Domain-Slugs. Order matters — spezifischere zuerst.
        var rules = [
            { re: /(immobilien|makler|maklerin|realestate|immo[-_]|[-_]immo)/i, type: 'real_estate_agency' },
            { re: /(kanzlei|anwalt|rechtsanwalt|notar|advokat|jurist)/i, type: 'lawyer' },
            { re: /(zahnarzt|dental|kieferorthop|implantolog)/i, type: 'dentist' },
            { re: /(hausarzt|praxis[-_]?dr|dr[-_]|praxis-|hno|orthop|gyn|augenarzt|kinderarzt|allgemeinmed|hautarzt)/i, type: 'doctor' },
            { re: /(physio|krankengymnastik|reha[-_])/i, type: 'physiotherapist' },
            // Sprint 176 — Digital-/Kreativagentur VOR restaurant: Agentur-Compound-Tokens sind
            // spezifischer als die bloßen Nachnamen (adler/hirsch/krone/loewe) in der restaurant-Regel,
            // die sonst "designagentur-adler.de" o.ä. fälschlich als restaurant klassifiziert.
            // Bewusst kein bloßes "design"/"studio"/"manufaktur" → False-Positive-Schutz.
            { re: /(webdesign|web-design|webentwicklung|webagentur|onlineagentur|internetagentur|werbeagentur|marketingagentur|mediaagentur|kreativagentur|digitalagentur|designagentur|grafikdesign|mediengestaltung|seo[-_]?agentur|webstudio)/i, type: 'creative_agency' },
            { re: /(restaurant|gasthof|gasthaus|trattoria|osteria|pizzeria|brauerei|wirtshaus|brasserie|sattlerei|steak|hirsch|krone|adler|loewe|löwe)/i, type: 'restaurant' },
            { re: /(hotel|pension|gaeste|gäste|herberge)/i, type: 'hotel' },
            { re: /(friseur|hairdesign|hairstudio|barber|coiffeur|salon)/i, type: 'hair_salon' },
            { re: /(kosmetik|beauty|nageldesign|aesthetik|ästhetik)/i, type: 'beauty_salon' },
            { re: /(sanitaer|sanitär|installateur|heizung|klempner|gas[-_]?wasser)/i, type: 'plumber' },
            { re: /(elektro|elektriker|elektrotechnik|elektroinstall)/i, type: 'electrician' },
            { re: /(kfz|autowerk|werkstatt[-_]|reifenservice|tuev|tüv[-_])/i, type: 'auto_repair' },
            { re: /(apotheke|pharma[-_])/i, type: 'pharmacy' },
            { re: /(tierarzt|tieraerztin|tierärzt|tier[-_]?klinik|veterinaer|veterinär)/i, type: 'veterinary_care' },
            { re: /(steuer|steuerboard|wirtschaftspruefer|wirtschaftsprüfer|buchhaltung|fibu)/i, type: 'accounting' },
            { re: /(architekt|architektur|architects[-_]|baubuero|baubüro)/i, type: 'architect' },
            { re: /(optiker|optikermeister|augenoptik|sehzentrum|brille[-_]?n)/i, type: 'optical_store' },
            { re: /(baeckerei|bäckerei|backhaus|backwerk|baeck[-_]|bäck[-_]|backstube)/i, type: 'bakery' },
            { re: /(bestatter|bestattung|trauerhilfe|trauerinstitut|abschiedshaus)/i, type: 'funeral_home' },
            { re: /(reisebuero|reisebüro|reisecenter|travelagent|reiseberat)/i, type: 'travel_agency' },
            { re: /(malerei|maler[-_]|fassadenmaler|lackierbetrieb)/i, type: 'painter' },
            { re: /(gartenbau|landschaftsbau|baumpflege|gartengestaltung|gartenservice)/i, type: 'landscaper' },
            { re: /(bauunternehmen|bauunternehmer|hochbau|tiefbau|baufirma)/i, type: 'general_contractor' },
            { re: /(schreiner|tischler|holzbau|moebelbau|möbelbau|innenausbau)/i, type: 'carpenter' },
            { re: /(dachdecker|dachbau|zimmerer|spengler)/i, type: 'plumber' /* fallback handwerk-bucket */ }
        ];
        for (var i = 0; i < rules.length; i++) {
            if (rules[i].re.test(host)) return rules[i].type;
        }
        return null;
    } catch (_) {
        return null;
    }
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

/**
 * Sprint 253 — Head-Fenster für Meta-Tag-/Schema-Checks.
 *
 * Früher fixe 20–30 KB. Page-Builder-WordPress-Seiten (Elementor/Divi/Yoast)
 * schieben Title/OG/Canonical/JSON-LD aber oft hinter riesige Inline-CSS-Blöcke
 * (>300 KB) — die fixen Fenster fanden sie nicht → Audit meldete fälschlich
 * „fehlt" (Bsp. thomas-faisst.de: Meta-Tags erst bei Byte ~319.000 → falsches
 * „1 von 6" + „Social-Tags fehlen", obwohl alle vorhanden).
 *
 * Neu: bis </head> lesen, mindestens 30 KB (JSON-LD steht teils im oberen Body),
 * gedeckelt bei 1 MB gegen pathologische Seiten. Strikt ≥ den alten Fenstern →
 * kann nur mehr finden, nie weniger (keine Regression bei normalen Seiten).
 */
const HEAD_MIN = 30000;
const HEAD_CAP = 1000000;
function extractHead(html) {
    const h = String(html || '');
    const end = h.search(/<\/head>/i);
    const limit = end >= 0 ? Math.max(end + 7, HEAD_MIN) : HEAD_MIN;
    return h.slice(0, Math.min(limit, HEAD_CAP));
}

/**
 * Sprint 68 — Pain-Points-Detection.
 * Adressiert die 5 typischen Buy-Trigger fuer Mittelstands-Webseiten:
 * Content-Veraltung, Security-Luecken, Vendor-Lockin, Mobile-Probleme,
 * fehlende Social-Meta.
 *
 * @param {string} html
 * @param {Object<string,string>} headers  HTTP-Response-Headers (lowercase keys)
 * @param {Object} wayback                 { available, lastSnapshot? }
 * @param {Object} tech                    { cms, ... }
 * @returns {Object} painPoints
 */
function detectPainPoints(html, headers, wayback, tech) {
    const h = html || '';
    const head = extractHead(h); // ganzer <head> (mind. 30 KB) — fasst auch Page-Builder-Seiten mit tiefem <head>
    const hdrs = headers || {};

    // P1 — Content-Freshness via Wayback + Copyright-Jahr
    let lastSnapshotMonthsAgo = null;
    if (wayback?.lastSnapshot) {
        const snapDate = new Date(wayback.lastSnapshot);
        if (!isNaN(snapDate.getTime())) {
            lastSnapshotMonthsAgo = Math.round((Date.now() - snapDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
        }
    }
    const copyrightMatch = h.match(/©\s*(20\d{2})|\bcopyright\b[^\d]*(20\d{2})/i);
    const copyrightYear = copyrightMatch ? parseInt(copyrightMatch[1] || copyrightMatch[2], 10) : null;
    const currentYear = new Date().getFullYear();
    const contentStaleByCopyright = copyrightYear && copyrightYear < currentYear - 1;
    const contentStaleByWayback = lastSnapshotMonthsAgo !== null && lastSnapshotMonthsAgo > 18;
    const contentFresh = !contentStaleByCopyright && !contentStaleByWayback;

    // P2 — Security-Header-Check (HTTPS-essentiell)
    const securityChecks = {
        hsts: !!(hdrs['strict-transport-security']),
        xFrameOptions: !!(hdrs['x-frame-options'] || /content-security-policy[^,]*frame-ancestors/i.test(hdrs['content-security-policy'] || '')),
        xContentTypeOptions: (hdrs['x-content-type-options'] || '').toLowerCase().includes('nosniff'),
        referrerPolicy: !!(hdrs['referrer-policy']),
        csp: !!(hdrs['content-security-policy'])
    };
    const missingHeaders = Object.entries(securityChecks).filter(([, v]) => !v).map(([k]) => k);
    const securityOk = missingHeaders.length <= 1; // 1 fehlend toleriert

    // P3 — Vendor-Lockin (Wix/Jimdo/Squarespace = locked-in, kein Self-Service-Export)
    const VENDOR_LOCKIN = new Set(['Wix', 'Jimdo', 'Squarespace', 'Webnode', 'IONOS MyWebsite']);
    const lockinPlatform = (tech?.cms && VENDOR_LOCKIN.has(tech.cms)) ? tech.cms : null;
    const vendorOk = !lockinPlatform;

    // P4 — Mobile-Viewport-Meta-Tag
    const viewportMatch = head.match(/<meta\s+name\s*=\s*["']viewport["'][^>]*content\s*=\s*["']([^"']+)/i);
    const hasViewport = !!viewportMatch;
    const viewportOk = hasViewport && /width\s*=\s*device-width/i.test(viewportMatch?.[1] || '');

    // P5 — Open-Graph + Twitter-Card-Meta (Social-Sharing)
    const ogTitle = /<meta\s+property\s*=\s*["']og:title["']/i.test(head);
    const ogImage = /<meta\s+property\s*=\s*["']og:image["']/i.test(head);
    const ogDescription = /<meta\s+property\s*=\s*["']og:description["']/i.test(head);
    const twitterCard = /<meta\s+name\s*=\s*["']twitter:card["']/i.test(head);
    const socialMissing = [];
    if (!ogTitle) socialMissing.push('og:title');
    if (!ogImage) socialMissing.push('og:image');
    if (!ogDescription) socialMissing.push('og:description');
    if (!twitterCard) socialMissing.push('twitter:card');
    const socialOk = socialMissing.length <= 1;

    // Sprint 72 — P6 SPA-Architektur. Erkennt Framework-Marker (React/Vue/Next/Nuxt/Angular)
    // im HTML — die Sites rendern Inhalt erst nach JS-Bootstrap. Google + ChatGPT/Perplexity
    // sehen oft nur leere Container.
    // textRatio < 0.005 als zusaetzlicher Notfall-Indikator fuer extreme SPAs.
    // textRatio wird nicht alleine genutzt, weil WordPress-Sites mit inline-CSS oft ~0.01-0.03
    // textRatio haben aber komplett SSR sind.
    const bodyTextLen = htmlToText(h, 50000).length;
    const textRatio = bodyTextLen / Math.max(h.length, 1);
    const frameworkMarkers = /id\s*=\s*["'](root|app|__next|__nuxt|svelte-app)["']|data-reactroot|data-react-helmet|ng-app|v-app|__NEXT_DATA__|__NUXT__|window\.__INITIAL_STATE__/.test(h);
    const extremelyEmpty = h.length > 5000 && textRatio < 0.005;
    const isSpa = frameworkMarkers || extremelyEmpty;
    const spaOk = !isSpa;

    return {
        contentFreshness: {
            ok: contentFresh,
            lastSnapshotMonthsAgo,
            copyrightYear,
            label: contentFresh
                ? 'Letzter sichtbarer Inhalt aktuell'
                : (contentStaleByCopyright
                    ? `Copyright-Jahr ${copyrightYear} (aktuell: ${currentYear})`
                    : `Letztes Wayback-Snapshot vor ~${lastSnapshotMonthsAgo} Monaten`)
        },
        securityHeaders: {
            ok: securityOk,
            missing: missingHeaders,
            label: securityOk
                ? 'Security-Headers gesetzt (HSTS, CSP, etc.)'
                : `${missingHeaders.length} Security-Header fehlen: ${missingHeaders.join(', ')}`
        },
        vendorLockin: {
            ok: vendorOk,
            platform: lockinPlatform,
            label: vendorOk
                ? 'Kein Vendor-Lock-in erkannt (Self-Service möglich)'
                : `${lockinPlatform} erkannt — kein Self-Service-Export möglich`
        },
        mobileViewport: {
            ok: viewportOk,
            hasViewport,
            label: viewportOk
                ? 'Mobile-Viewport korrekt gesetzt'
                : (hasViewport ? 'Viewport-Meta vorhanden, aber nicht responsive' : 'Mobile-Viewport-Meta fehlt — Layout bricht auf iPhone')
        },
        socialMeta: {
            ok: socialOk,
            missing: socialMissing,
            label: socialOk
                ? 'Social-Sharing-Tags (Open-Graph) vorhanden'
                : `${socialMissing.length} Social-Tags fehlen: ${socialMissing.join(', ')} — WhatsApp/LinkedIn-Shares zeigen kein Bild`
        },
        spaArchitecture: {
            ok: spaOk,
            isSpa,
            textRatio: Math.round(textRatio * 10000) / 10000,
            frameworkMarkers,
            label: spaOk
                ? 'Server-rendered HTML — Suchmaschinen sehen alle Inhalte'
                : 'Single-Page-App: Inhalte werden per JavaScript geladen — Google + ChatGPT/Perplexity sehen oft nur leere Container, Adresse + Leistungen fehlen in der Suche'
        }
    };
}

/**
 * Sprint 69 — SEO + GEO (Generative Engine Optimization) Detection.
 * Prüft strukturierte Daten, klassische SEO-Marker und 2025/26 KI-Readability
 * (llms.txt, FAQ-/Article-/BreadcrumbList-Schema).
 *
 * @param {string} html
 * @param {string} baseUrl
 * @returns {Promise<{seo: object, geo: object}>}
 */
async function detectSeoGeo(html, baseUrl) {
    const head = extractHead(html);

    // Schema.org JSON-LD-Blocks parsen
    const jsonLdMatches = head.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    const schemaTypes = new Set();
    jsonLdMatches.forEach(block => {
        const content = block.replace(/<[^>]+>/g, '');
        const typeMatches = content.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
        typeMatches.forEach(t => {
            const m = t.match(/"@type"\s*:\s*"([^"]+)"/);
            if (m) schemaTypes.add(m[1]);
        });
    });

    // Sprint 70 — Organization raus (zu generisch, hat fast jeder Site → False-Positive).
    // Ergaenzt um valide LocalBusiness-Subtypen laut schema.org: FoodEstablishment, DentalClinic,
    // MedicalClinic, Store, ProfessionalService.
    // Sprint 76 — neue Subtypen: Pharmacy, VeterinaryCare, AccountingService, Architect
    // Sprint 81 — Bau-Handwerk: HousePainter, GeneralContractor (Schema.org); für carpenter/landscaper kein dedizierter Schema-Type, ProfessionalService (Sprint 70) fängt das ab.
    const LOCAL_BUSINESS_TYPES = ['LocalBusiness', 'RealEstateAgent', 'Restaurant', 'FoodEstablishment', 'HealthAndBeautyBusiness', 'Dentist', 'DentalClinic', 'Physician', 'MedicalClinic', 'AutoRepair', 'Plumber', 'Electrician', 'LegalService', 'HairSalon', 'BeautySalon', 'Store', 'ProfessionalService', 'WebDesignAgency', 'Pharmacy', 'VeterinaryCare', 'AccountingService', 'Architect', 'Optician', 'Bakery', 'FuneralHome', 'TravelAgency', 'HousePainter', 'GeneralContractor'];
    // Hinweis (Sprint 216): reiner Oberflächen-Check (Schema-TYP vorhanden ja/nein) —
    // ein Betrieb kann Fake-/Spam-Schema einbetten, um ihn zu „bestehen". Bewusst keine
    // Echtheitsprüfung; die Detail-Auswertung im Komplettaudit ordnet das ein.
    const hasLocalBusiness = LOCAL_BUSINESS_TYPES.some(t => schemaTypes.has(t));

    // Canonical
    const hasCanonical = /<link\s+rel\s*=\s*["']canonical["']/i.test(head);

    // Meta-Description
    const metaDescMatch = head.match(/<meta\s+name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)/i);
    const metaDescLen = metaDescMatch ? metaDescMatch[1].length : 0;
    const metaDescOk = metaDescLen >= 80 && metaDescLen <= 165;

    // Title-Tag
    const titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);
    const titleLen = titleMatch ? titleMatch[1].trim().length : 0;
    const titleOk = titleLen >= 30 && titleLen <= 65;

    // robots.txt + sitemap.xml + llms.txt — parallele HEAD-Requests
    let origin, probeHost;
    try { const u = new URL(baseUrl); origin = u.origin; probeHost = u.hostname; } catch { origin = null; }
    // Sprint 240 — Probes via GLOBALES fetch + resolvePublicAddress-SSRF-Guard, NICHT safeFetchs
    // custom-undici-Agent: der flakte im Cloud-Env unter parallelen HEAD-Requests → robots.txt/
    // sitemap.xml fälschlich "nicht erreichbar" (200, aber Probe schlug fehl), während llms.txt im
    // selben Lauf durchkam → SEO 3/6 statt 5/6 + GEO-Zugang −4. Gleiche Lehre wie fetchRobotsTxt/
    // kiVisibility. redirect:'manual' (kein Redirect-SSRF) + 5s Timeout.
    async function probe(path) {
        if (!origin) return false;
        try {
            await resolvePublicAddress(probeHost);
            const res = await fetch(origin + path, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
            if (res.ok) return true;
            // Sprint 253 — 3xx-Redirect zählt als vorhanden, WENN das Ziel dieselbe
            // Ressource ist (z. B. /sitemap.xml → /sitemap_index.xml bei WordPress/Yoast,
            // oder /robots.txt → www-Host). Redirect auf die Startseite (Soft-404) zählt NICHT.
            if (res.status >= 300 && res.status < 400) {
                const loc = (res.headers.get('location') || '').toLowerCase();
                const stem = path.replace(/^\//, '').replace(/[._-]?index/, '').replace(/\.[a-z]+$/, ''); // robots | sitemap | llms
                return !!stem && loc.includes(stem);
            }
            return false;
        } catch (_) { return false; }
    }
    // Sprint 253 — Sitemap zusätzlich unter /sitemap_index.xml prüfen (WordPress/Yoast-
    // Default; viele Seiten haben kein /sitemap.xml, sondern nur den Index).
    const [hasRobots, sitemapDirect, sitemapIndex, hasLlmsTxt] = await Promise.all([
        probe('/robots.txt'),
        probe('/sitemap.xml'),
        probe('/sitemap_index.xml'),
        probe('/llms.txt')
    ]);
    const hasSitemap = sitemapDirect || sitemapIndex;

    // GEO — strukturierte Daten für KI-Crawler
    const hasFaqSchema = schemaTypes.has('FAQPage');
    const hasArticleSchema = schemaTypes.has('Article') || schemaTypes.has('BlogPosting') || schemaTypes.has('NewsArticle');
    const hasBreadcrumb = schemaTypes.has('BreadcrumbList');
    const anyStructuredData = jsonLdMatches.length > 0;

    const seoItems = [
        { ok: hasLocalBusiness, label: 'Schema.org LocalBusiness (für Google-Rich-Results)' },
        { ok: hasCanonical, label: 'Canonical-URL gesetzt' },
        { ok: metaDescOk, label: `Meta-Description (${metaDescLen}/80–165 Zeichen)` },
        { ok: titleOk, label: `Page-Title (${titleLen}/30–65 Zeichen)` },
        { ok: hasRobots, label: 'robots.txt erreichbar' },
        { ok: hasSitemap, label: 'sitemap.xml erreichbar' }
    ];
    // Sprint 230 — GEO-Mythen entschaerft (KB domains/geo-ai-findability):
    // llms.txt wird von keinem grossen LLM ausgewertet (Google/Mueller bestaetigt,
    // ~0,1% Bot-Requests), Schema-Markup hat keinen kausalen KI-Zitat-Effekt
    // (Ahrefs Difference-in-Differences). Labels jetzt ehrlich/neutral; der neue
    // geoScore (computeGeoScore) wertet llms.txt NICHT als Positiv-Signal.
    const geoItems = [
        { ok: hasLlmsTxt, label: 'llms.txt vorhanden (optional — von KI-Suche aktuell nicht ausgewertet)' },
        { ok: hasFaqSchema, label: 'FAQ-Schema (FAQPage) — saubere Frage/Antwort-Struktur' },
        { ok: hasBreadcrumb, label: 'BreadcrumbList-Schema — klare Seitenhierarchie' },
        { ok: anyStructuredData, label: `Strukturierte Daten (JSON-LD): ${jsonLdMatches.length}× vorhanden` }
    ];

    return {
        seo: {
            items: seoItems,
            found: seoItems.filter(i => i.ok).length,
            total: seoItems.length,
            schemaTypes: Array.from(schemaTypes),
            // Sprint 230 — Roh-Flags fuer computeGeoScore (Score braucht Einzelsignale,
            // nicht nur found/total).
            flags: { hasLocalBusiness, hasCanonical, metaDescOk, titleOk, hasRobots, hasSitemap }
        },
        geo: {
            items: geoItems,
            found: geoItems.filter(i => i.ok).length,
            total: geoItems.length,
            flags: { hasLlmsTxt, hasFaqSchema, hasBreadcrumb, anyStructuredData }
        }
    };
}

/**
 * Sprint 215 — Bot-Wall-/Leerseiten-Erkennung.
 *
 * Grosse Sites (Akamai/Cloudflare/Imperva Bot-Manager, Consent-/Cookie-Gateways)
 * beantworten den automatischen Abruf oft mit einem 200, der NICHT das echte HTML
 * ist, sondern eine JS-Challenge-, Sensor- oder inhaltsleere Huelle. Ohne Erkennung
 * deutet das Audit das als "alles fehlt" und faellt ein vernichtendes — und falsches —
 * Urteil ("0 von 6 Pflicht-Elementen") ueber eine in Wahrheit gut gepflegte Seite.
 * Konkreter Ausloeser: hansgrohe.com (AkamaiGHost) → vom Cloud-Vantage 200 ohne
 * Title/Meta → Audit meldete fälschlich "Ausbaufähig / 0 von 6".
 *
 * @param {string} html      abgerufenes HTML (Status war bereits 2xx, sonst wirft fetchHtml)
 * @param {object|null} seoGeo  Ergebnis von detectSeoGeo (seo/geo found-Counts)
 * @returns {'challenge'|'opaque'|null}
 */
function detectBlockedResponse(html, seoGeo) {
    const h = html || '';
    // detectSeoGeo nutzt extractHead (ganzer <head>, mind. 30 KB). Die Bot-Wall-
    // Erkennung MUSS dasselbe Fenster nutzen, sonst widersprechen sich beide
    // (Sensor-/Challenge-Hülle schiebt den <title> tief nach unten: Audit sähe
    // "kein Title", ein Voll-Scan fände ihn → opaque schaltet nie).
    const head = extractHead(h);
    // 1) Explizite Bot-Wall-/Challenge-Marker grosser WAF/CDN-Anbieter (inkl.
    //    Akamai-Bot-Manager-Sensor-Token, die in der Challenge-Huelle stehen).
    const CHALLENGE = /Access Denied|AkamaiGHost|you don't have permission to access|Just a moment\.\.\.|cf[-_]browser[-_]verification|Checking your browser before|cf-chl-|_Incapsula_|Incapsula incident|Request unsuccessful\. Incapsula|\/_?akam\/|bazadebezolkohpepadr|bm-verify|\bak_bmsc\b/i;
    const CHALLENGE2 = /Pardon Our Interruption|Attention Required! \| Cloudflare|This process is automatic\. Your browser will redirect|enable JavaScript and cookies to continue/i;
    if (CHALLENGE.test(head) || CHALLENGE2.test(head)) return 'challenge';
    // 2) "200, aber inhaltsleer": alle 6 SEO-Basics fehlen (inkl. robots.txt UND
    //    sitemap.xml beide unerreichbar), keine strukturierten Daten UND im
    //    Audit-Fenster kein Title. Diese Kombination ist fuer eine echte,
    //    indexierbare Website praktisch unmoeglich und entsteht typisch durch
    //    eine JS-Challenge-/Sensor-Huelle.
    if (seoGeo && seoGeo.seo && seoGeo.geo &&
        seoGeo.seo.found === 0 && seoGeo.geo.found === 0) {
        const titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);
        const titleLen = titleMatch ? titleMatch[1].trim().length : 0;
        if (titleLen === 0) return 'opaque';
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 230 — GEO-Score (Generative Engine Optimization), evidenzbasiert.
// Leitet sich aus der KB ab (~/Projects/knowledge-base/playbooks/geo-audit-score.md
// + domains/geo-ai-findability.md). Gewichtet die NACHWEISLICH wirksamen Signale:
// Crawlbarkeit/SSR (30) ≫ zitierfähige Struktur (25) ≫ Entität (20) ≫ Frische (15)
// ≫ Hygiene (10). Ignoriert bewusst die widerlegten Mythen (llms.txt, Schema als
// KI-Zitier-Treiber). Off-Page (stärkster realer Hebel) ist aus einem Seiten-Fetch
// nicht messbar → als Advice ausgegeben, nicht gescort.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET robots.txt (Vollbody, nicht nur HEAD) für die KI-Crawler-Analyse.
 *
 * ⚠️ Sprint 230-Hotfix: NICHT safeFetch — dessen Per-Hop-undici-Agent wirft beim
 * Body-Read (res.text()) einen AssertionError aus dem async Socket-Teardown
 * (`assert(!this.paused)` in undici client-h1 Parser.finish), der NICHT fangbar ist
 * und den ganzen Request mit 500 + ERR_HTTP_HEADERS_SENT killt (gleiche Lehre wie
 * kiVisibility). Stattdessen: Host vorab via resolvePublicAddress validieren
 * (SSRF-Guard) + globales fetch() mit redirect:'manual' (kein Redirect-Folgen →
 * keine Rebinding-/SSRF-Lücke; 3xx → leer behandeln). Der Host wurde zudem schon
 * beim HTML-Abruf als public verifiziert.
 */
async function fetchRobotsTxt(baseUrl) {
    let origin, hostname;
    try { const u = new URL(baseUrl); origin = u.origin; hostname = u.hostname; }
    catch (_) { return null; }
    try {
        await resolvePublicAddress(hostname);                 // SSRF-Guard
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        try {
            const res = await fetch(origin + '/robots.txt', { signal: ctrl.signal, redirect: 'manual' });
            if (!res.ok) return '';                            // non-2xx / opaqueredirect → kein Inhalt
            const txt = await res.text();
            return String(txt).slice(0, 50000);
        } finally { clearTimeout(t); }
    } catch (_) { return null; }
}

/**
 * Prüft, ob die KI-Retrieval-Crawler (über die Zitate entstehen) per robots.txt
 * blockiert sind. Training-Bots (GPTBot etc.) sind bewusst IRRELEVANT für Zitate.
 * @param {string|null} robotsTxt  Inhalt der robots.txt (null = nicht gelesen)
 */
function detectAiCrawlerAccess(robotsTxt) {
    const RETRIEVAL = ['oai-searchbot', 'perplexitybot', 'claude-searchbot'];
    if (robotsTxt == null) return { ok: true, fetched: false, blockedBots: [] };
    const txt = String(robotsTxt);
    if (!txt.trim()) return { ok: true, fetched: true, blockedBots: [] }; // keine robots.txt = alles erlaubt

    const lines = txt.split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
    const groups = [];
    let cur = null, collectingAgents = false;
    for (const line of lines) {
        const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const field = m[1].toLowerCase();
        const value = m[2].trim();
        if (field === 'user-agent') {
            if (!collectingAgents || !cur) { cur = { agents: [], disallowAll: false, allowRoot: false }; groups.push(cur); collectingAgents = true; }
            cur.agents.push(value.toLowerCase());
        } else {
            collectingAgents = false;
            if (!cur) continue;
            if (field === 'disallow' && value === '/') cur.disallowAll = true;
            if (field === 'disallow' && value === '') cur.allowRoot = true;        // Disallow: <leer> = alles erlaubt
            if (field === 'allow' && (value === '/' || value === '')) cur.allowRoot = true;
        }
    }
    function blocksRoot(agent) {
        const exact = groups.find(g => g.agents.includes(agent));
        const star = groups.find(g => g.agents.includes('*'));
        const g = exact || star;                 // spezifische Gruppe schlägt '*'
        if (!g) return false;
        if (g.allowRoot) return false;
        return g.disallowAll;
    }
    const blockedBots = RETRIEVAL.filter(blocksRoot);
    return { ok: blockedBots.length === 0, fetched: true, blockedBots };
}

/** Entitäts-Signale aus JSON-LD: Organization/LocalBusiness + sameAs + name. */
function detectEntitySignals(html) {
    const h = html || '';
    const ORG_TYPE = /^(Organization|Corporation|LocalBusiness|RealEstateAgent|Restaurant|FoodEstablishment|HealthAndBeautyBusiness|Dentist|DentalClinic|Physician|MedicalClinic|MedicalBusiness|AutoRepair|Plumber|Electrician|LegalService|HairSalon|BeautySalon|Store|ProfessionalService|WebDesignAgency|Pharmacy|VeterinaryCare|AccountingService|Architect|Optician|Bakery|FuneralHome|TravelAgency|HousePainter|GeneralContractor|NGO|EducationalOrganization)$/;
    let hasOrg = false, hasSameAs = false, sameAsCount = 0, name = null;
    const blocks = h.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of blocks) {
        const json = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
        let data;
        try { data = JSON.parse(json); } catch (_) { continue; }
        const nodes = [];
        const collect = (n) => {
            if (!n || typeof n !== 'object') return;
            if (Array.isArray(n)) { n.forEach(collect); return; }
            nodes.push(n);
            if (n['@graph']) collect(n['@graph']);
        };
        collect(data);
        for (const node of nodes) {
            const types = [].concat(node['@type'] || []);
            if (!types.some(t => ORG_TYPE.test(String(t)))) continue;
            hasOrg = true;
            if (!name && node.name) name = String(node.name).slice(0, 120);
            const sa = node.sameAs;
            if (sa) {
                const arr = Array.isArray(sa) ? sa : [sa];
                const valid = arr.filter(x => typeof x === 'string' && /^https?:\/\//i.test(x));
                if (valid.length) { hasSameAs = true; sameAsCount = Math.max(sameAsCount, valid.length); }
            }
        }
    }
    return { hasOrg, hasSameAs, sameAsCount, name };
}

/** Überschriften-Struktur: H1-Anzahl, H2/H3-Anzahl, frageförmige H2/H3 (Q&A). */
function detectHeadings(html) {
    const h = html || '';
    const h1 = (h.match(/<h1\b[^>]*>/gi) || []).length;
    const h2h3 = (h.match(/<h[23]\b[^>]*>/gi) || []).length;
    const QWORD = /^(wie|was|warum|wann|wo|welche[rs]?|wer|wieso|wof[uü]r|wieviel|wie viel|kann|k[oö]nnen|sollte|braucht?|muss|darf|ist|sind)\b/i;
    const headingTexts = (h.match(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi) || [])
        .map(t => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    const questionHeadings = headingTexts.filter(t => /\?\s*$/.test(t) || QWORD.test(t)).length;
    return { h1, h2h3, questionHeadings };
}

/** Faktendichte (Princeton-Hebel): Zahlen/Statistik-Token pro 1000 Wörter + externe Quell-Links. */
function detectFactDensity(bodyText, html, finalUrl) {
    const text = bodyText || '';
    const words = (text.match(/\S+/g) || []).length || 1;
    const numTokens = (text.match(/\b\d+([.,]\d+)?\s?%|\b\d{2,}([.,]\d+)?\b|€\s?\d|\d+\s?(Jahre|Kunden|Projekte|Mitarbeiter)/gi) || []).length;
    const statsPer1k = Math.round((numTokens / words) * 1000 * 10) / 10;
    let host = '';
    try { host = new URL(finalUrl).hostname.replace(/^www\./, ''); } catch (_) { /* noop */ }
    const hrefs = (html || '').match(/<a\b[^>]+href\s*=\s*["']([^"']+)["']/gi) || [];
    let externalLinks = 0;
    for (const a of hrefs) {
        const m = a.match(/href\s*=\s*["']([^"']+)["']/i);
        if (!m || !/^https?:\/\//i.test(m[1])) continue;
        try { const hh = new URL(m[1]).hostname.replace(/^www\./, ''); if (hh && hh !== host) externalLinks++; } catch (_) { /* noop */ }
    }
    return { statsPer1k, externalLinks, words };
}

/** Frische-Marker: dateModified im Schema oder sichtbares Aktualisierungsdatum. */
function detectFreshnessMarkers(html) {
    const h = html || '';
    const hasDateModified = /"dateModified"\s*:/.test(h);
    const year = new Date().getFullYear();
    const recent = new RegExp('(aktualisiert|zuletzt ge[aä]ndert|stand:?|last updated|updated)[\\s\\S]{0,40}(' + year + '|' + (year - 1) + ')', 'i');
    const hasVisibleDate = recent.test(h);
    return { hasDateModified, hasVisibleDate, ok: hasDateModified || hasVisibleDate };
}

/**
 * Verrechnet alle Signale zum 0–100-GEO-Score (5 Kategorien). Reine Funktion →
 * testbar ohne Netzwerk.
 */
function computeGeoScore({ seoGeo, painPoints, entity, headings, lists, factDensity, freshnessMarkers, aiCrawlerAccess }) {
    const seoF = (seoGeo && seoGeo.seo && seoGeo.seo.flags) || {};
    const geoF = (seoGeo && seoGeo.geo && seoGeo.geo.flags) || {};
    const pp = painPoints || {};
    const en = entity || {};
    const h = headings || {};
    const fd = factDensity || {};
    const fm = freshnessMarkers || {};
    const ac = aiCrawlerAccess || { ok: true, blockedBots: [] };
    const ssrOk = !!(pp.spaArchitecture && pp.spaArchitecture.ok);

    const cats = [];
    const cat = (key, label, max, checks) => {
        const points = Math.min(max, checks.reduce((s, c) => s + (c.points || 0), 0));
        cats.push({ key, label, max, points, checks });
    };

    // A — Maschinen-Zugänglichkeit (30) — das Tor
    const nBlocked = (ac.blockedBots || []).length;
    cat('access', 'Maschinen-Zugänglichkeit', 30, [
        { id: 'ssr', label: 'Server-gerendertes HTML (kein JS-only)', ok: ssrOk, points: ssrOk ? 15 : 0 },
        { id: 'ai-crawler', label: 'KI-Such-Crawler nicht blockiert (OAI-SearchBot, PerplexityBot, Claude-SearchBot)', ok: nBlocked === 0, points: nBlocked === 0 ? 8 : Math.max(0, 8 - 3 * nBlocked) },
        { id: 'robots-sitemap', label: 'robots.txt + sitemap.xml erreichbar', ok: !!(seoF.hasRobots && seoF.hasSitemap), points: (seoF.hasRobots ? 2 : 0) + (seoF.hasSitemap ? 2 : 0) },
        { id: 'title-meta', label: 'Title + Meta-Description sinnvoll', ok: !!(seoF.titleOk && seoF.metaDescOk), points: (seoF.titleOk ? 2 : 0) + (seoF.metaDescOk ? 1 : 0) }
    ]);

    // B — Zitierfähige Struktur (25)
    const oneH1 = h.h1 === 1;
    const hasFaq = !!geoF.hasFaqSchema;
    const qaPoints = hasFaq ? 9 : ((h.questionHeadings || 0) >= 2 ? 6 : 0);
    cat('structure', 'Zitierfähige Struktur', 25, [
        { id: 'headings', label: 'Saubere Überschriften-Hierarchie (genau 1 H1, H2/H3 vorhanden)', ok: oneH1 && (h.h2h3 || 0) >= 2, points: (oneH1 ? 5 : 0) + ((h.h2h3 || 0) >= 2 ? 3 : 0) },
        { id: 'qa', label: hasFaq ? 'FAQ-/Q&A-Struktur (FAQPage-Schema)' : 'Frage/Antwort-Struktur (frageförmige Überschriften)', ok: qaPoints > 0, points: qaPoints },
        { id: 'lists', label: 'Listen/Tabellen (extrahierbare Chunks)', ok: !!(lists && (lists.hasList || lists.hasTable)), points: ((lists && lists.hasList) ? 2 : 0) + ((lists && lists.hasTable) ? 2 : 0) },
        { id: 'facts', label: 'Faktendichte: Zahlen/Statistiken + externe Quell-Links', ok: !!((fd.statsPer1k || 0) >= 3 && (fd.externalLinks || 0) >= 1), points: ((fd.statsPer1k || 0) >= 3 ? 2 : 0) + ((fd.externalLinks || 0) >= 1 ? 2 : 0) }
    ]);

    // C — Entitäts-Klarheit (20)
    const hasOrg = !!(en.hasOrg || seoF.hasLocalBusiness);
    cat('entity', 'Entitäts-Klarheit', 20, [
        { id: 'org', label: 'Organization/LocalBusiness-Schema', ok: hasOrg, points: hasOrg ? 7 : 0 },
        { id: 'sameas', label: 'sameAs zu externen Profilen (Wikidata/Wikipedia/LinkedIn …)', ok: !!en.hasSameAs, points: en.hasSameAs ? ((en.sameAsCount || 0) >= 2 ? 7 : 4) : 0 },
        { id: 'name', label: 'Klarer Marken-/Firmenname im Schema', ok: !!en.name, points: en.name ? 6 : 0 }
    ]);

    // D — Frische & Pflege (15)
    const freshOk = !!(pp.contentFreshness && pp.contentFreshness.ok);
    cat('freshness', 'Frische & Pflege', 15, [
        { id: 'content-fresh', label: 'Sichtbarer Inhalt aktuell', ok: freshOk, points: freshOk ? 10 : 0 },
        { id: 'date-marker', label: 'dateModified / sichtbares Aktualisierungsdatum', ok: !!fm.ok, points: fm.ok ? 5 : 0 }
    ]);

    // E — Technische Hygiene (10)
    cat('hygiene', 'Technische Hygiene', 10, [
        { id: 'canonical', label: 'Canonical-URL gesetzt', ok: !!seoF.hasCanonical, points: seoF.hasCanonical ? 3 : 0 },
        { id: 'viewport', label: 'Mobile-Viewport responsive', ok: !!(pp.mobileViewport && pp.mobileViewport.ok), points: (pp.mobileViewport && pp.mobileViewport.ok) ? 3 : 0 },
        { id: 'security', label: 'HTTPS + Security-Header', ok: !!(pp.securityHeaders && pp.securityHeaders.ok), points: (pp.securityHeaders && pp.securityHeaders.ok) ? 2 : 0 },
        { id: 'og', label: 'Open-Graph (Social-Sharing)', ok: !!(pp.socialMeta && pp.socialMeta.ok), points: (pp.socialMeta && pp.socialMeta.ok) ? 2 : 0 }
    ]);

    const score = cats.reduce((s, c) => s + c.points, 0);
    let grade, verdict;
    if (score >= 80) { grade = 'A'; verdict = 'KI-bereit'; }
    else if (score >= 60) { grade = 'B'; verdict = 'Solide'; }
    else if (score >= 40) { grade = 'C'; verdict = 'Ausbaufähig'; }
    else { grade = 'D'; verdict = 'KI-unsichtbar'; }

    const notes = [];
    if (geoF.hasLlmsTxt) notes.push('llms.txt erkannt, aber nicht gewertet — wird von KI-Suche aktuell nicht ausgelesen.');
    if (!ssrOk) notes.push('Inhalte werden per JavaScript geladen — KI-Crawler (GPTBot, PerplexityBot) sehen oft nur leere Container.');

    return {
        score,
        grade,
        verdict,
        categories: cats,
        ssrGate: {
            passed: ssrOk,
            note: ssrOk
                ? 'Server-gerendert — für KI-Crawler sichtbar.'
                : 'Single-Page-App ohne SSR — der stärkste GEO-Hebel fehlt.'
        },
        offPageAdvice: [
            'Der stärkste KI-Sichtbarkeits-Hebel liegt außerhalb Ihrer Seite: Erwähnungen in YouTube, Branchenmedien, Wikipedia/Wikidata und Bewertungsportalen. Das prüfen wir im Komplettaudit.'
        ],
        notes
    };
}

async function runLightAudit(url, placesKey) {
    // Parallel: HTML + Wayback + Place-Lookup (Branchen-Detect)
    const [htmlResult, wayback, placesType] = await Promise.all([
        fetchHtml(url),
        checkFreshness(url).catch(() => ({ available: false })),
        fetchPlaceType(url, placesKey).catch(() => null)
    ]);

    const { html, finalUrl, headers } = htmlResult;
    const tech = detectTechFromHtml(html, finalUrl);
    const techAge = analyzeTechAge(tech, wayback);
    // paidToolKeys schaerfen die Betroffenheits-Pruefung: Doctolib/Shopify & Co.
    // belegen einen Online-Vertragsschluss auch dann, wenn die Seite ihn nicht
    // in Worten ankuendigt.
    const bfsg = bfsgHeuristic(html, { paidToolKeys: scanPaidTools(html).keys });

    // Sprint 70 — Sub-Types wie 'german_restaurant', 'barber_shop' auf Hauptkategorie normalisieren.
    // Sprint 67 — URL-Heuristik als Fallback wenn Google-Places leer liefert ODER einen
    // generic-Type wie "service"/"establishment" zurueckgibt, der in BRANCH_STANDARDS
    // nicht gemappt ist.
    let primaryType = normalizePlacesType(placesType);
    if (!primaryType || !BRANCH_STANDARDS[primaryType]) {
        const guessed = guessBranchFromUrl(finalUrl || url);
        if (guessed && BRANCH_STANDARDS[guessed]) primaryType = guessed;
    }

    const subPages = extractSubPages(html, finalUrl, 8);
    const body = htmlToText(html, 50000);
    const branch = checkBranchStandards(primaryType, { subPages, body });

    // Sprint 68 — Pain-Points-Audit fuer Mittelstands-Buy-Trigger.
    const painPoints = detectPainPoints(html, headers, wayback, tech);

    // Sprint 69 — SEO + GEO Detection (parallele HEAD-Requests fuer robots/sitemap/llms.txt).
    const seoGeo = await detectSeoGeo(html, finalUrl).catch(() => null);

    // Sprint 215 — Bot-Wall/Consent-Gateway: liefert die Site auf den automatischen
    // Abruf nur eine Challenge-/Leerseite (kein echtes HTML), ehrlich melden statt
    // ein False-Negative-Urteil zu faellen. quickAudit faengt botWall ab.
    const blockReason = detectBlockedResponse(html, seoGeo);
    if (blockReason) {
        const e = new Error(`BOT_WALL: ${blockReason}`);
        e.botWall = blockReason;
        throw e;
    }

    // Sprint 69 — Karriaro-Cross-Sell Tools + Trend-Phrase pro Branche.
    const { getCrossSell } = require('./karriaro-cross-sell.js');
    const crossSell = getCrossSell(primaryType, branch);

    // Sprint 230 — GEO-Score (evidenzbasiert). Re-gewichtet die real wirksamen Signale
    // und ignoriert die llms.txt/Schema-Mythen (siehe KB playbooks/geo-audit-score.md).
    // Robots-GET als zusätzlicher Hop ist toleriert (3s Timeout, eigener try/catch).
    let geoScore = null;
    try {
        const robotsTxt = await fetchRobotsTxt(finalUrl);
        const aiCrawlerAccess = detectAiCrawlerAccess(robotsTxt);
        const entity = detectEntitySignals(html);
        const headings = detectHeadings(html);
        const lists = { hasList: /<(ul|ol)\b/i.test(html), hasTable: /<table\b/i.test(html) };
        const factDensity = detectFactDensity(body, html, finalUrl);
        const freshnessMarkers = detectFreshnessMarkers(html);
        geoScore = computeGeoScore({ seoGeo, painPoints, entity, headings, lists, factDensity, freshnessMarkers, aiCrawlerAccess });
    } catch (err) {
        console.warn('geoScore computation failed:', err.message);
    }

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
        subPages,
        painPoints,
        seoGeo,
        geoScore,
        crossSell
    };
}

module.exports = {
    runLightAudit,
    extractHead,
    detectTechFromHtml,
    bfsgHeuristic,
    fetchHtml,
    fetchPlaceType,
    guessBranchFromUrl,
    normalizePlacesType,
    detectPainPoints,
    detectSeoGeo,
    detectBlockedResponse,
    // Sprint 230 — GEO-Score
    fetchRobotsTxt,
    detectAiCrawlerAccess,
    detectEntitySignals,
    detectHeadings,
    detectFactDensity,
    detectFreshnessMarkers,
    computeGeoScore
};
