/**
 * Deep-Research-Helpers (Server-Side, CommonJS).
 *
 * Drei Aufgaben:
 *  1. Aus einem Homepage-HTML interne Sub-Pages identifizieren (About,
 *     Leistungen, Team, Impressum, Preise, …) — robuste Heuristik auf
 *     Anchor-Texten + URL-Pattern.
 *  2. Mehrere Pages parallel fetchen, HTML zu lesbarem Plain-Text
 *     säubern, deutlich kürzen.
 *  3. Konsolidierten Sonnet-Prompt + tool_use-Schema bauen, Antwort parsen.
 *
 * Bewusst ohne SDK: direkter fetch() an api.anthropic.com — selbes
 * Pattern wie bestehende analyzeContent/analyzeBranchStandards in
 * karriaro/app/functions/index.js.
 */

const SUBPAGE_PATTERNS = [
    // pfad-/anchor-pattern (lowercase) → Kategorie
    { match: /(^|\/)(ueber-uns|ueber|about|wir|team|unternehmen)(\/|$)/i, slot: 'about' },
    { match: /(^|\/)(leistungen|services|angebot|service|produkte|portfolio|projekte|cases|referenzen)(\/|$)/i, slot: 'services' },
    { match: /(^|\/)(preise|preisliste|prices|pricing|tarife|kosten)(\/|$)/i, slot: 'pricing' },
    { match: /(^|\/)(kontakt|contact|standort|anfahrt|termin|booking)(\/|$)/i, slot: 'contact' },
    { match: /(^|\/)(impressum|imprint|legal)(\/|$)/i, slot: 'impressum' },
    { match: /(^|\/)(datenschutz|privacy|datenschutzerklaerung)(\/|$)/i, slot: 'privacy' },
    { match: /(^|\/)(blog|news|aktuelles|magazin|magazine)(\/|$)/i, slot: 'blog' },
    { match: /(^|\/)(faq|fragen)(\/|$)/i, slot: 'faq' },
    { match: /(^|\/)(jobs|karriere|career|stellen)(\/|$)/i, slot: 'jobs' }
];

const ANCHOR_TEXT_HINTS = {
    'about':     /\b(über uns|ueber uns|wer wir sind|team|unternehmen|about|philosophie)\b/i,
    'services':  /\b(leistungen|angebot|services|portfolio|referenzen|projekte|expertise)\b/i,
    'pricing':   /\b(preise|preisliste|tarife|pricing|kosten)\b/i,
    'contact':   /\b(kontakt|contact|termin|standort|anfahrt|sprechzeiten)\b/i,
    'impressum': /\b(impressum|imprint)\b/i,
    'privacy':   /\b(datenschutz|privacy)\b/i,
    'blog':      /\b(blog|news|aktuelles|magazin)\b/i,
    'faq':       /\b(faq|häufige fragen|haeufige fragen)\b/i,
    'jobs':      /\b(jobs|karriere|career|stellen)\b/i
};

const SLOT_PRIORITY = ['about', 'services', 'pricing', 'contact', 'impressum', 'blog', 'faq', 'jobs', 'privacy'];

/**
 * Sprint 68 — Mappt einen SPA-Anchor-Slug + Link-Text auf einen Slot.
 * Erlaubt extractSubPages, auch bei SPAs (Anchor-only-Navigation) sinnvolle
 * "virtuelle Sub-Pages" zurückzugeben.
 */
function anchorToSlot(anchorId, anchorText) {
    const id = (anchorId || '').toLowerCase();
    const txt = (anchorText || '').toLowerCase();
    // about / team
    if (/^(ueber|über|about|team|wir|inhaber)/.test(id)) return 'about';
    if (/(über uns|über mich|ueber uns|ueber mich|wer wir sind|unser team|das team)/i.test(txt)) return 'about';
    // services / leistungen
    if (/^(leistung|service|angebot|was-wir|portfolio)/.test(id)) return 'services';
    if (/(leistung|service|angebot|portfolio|objekt|immobilie)/i.test(txt)) return 'services';
    // pricing
    if (/^(preis|honorar|tarif|cost|pricing)/.test(id)) return 'pricing';
    if (/(preis|honorar|tarif)/i.test(txt)) return 'pricing';
    // contact
    if (/^(kontakt|contact|reach|standort|impressum)/.test(id)) return 'contact';
    if (/(kontakt|contact|standort|adresse)/i.test(txt)) return 'contact';
    // blog
    if (/^(blog|news|aktuell|magazin|insights)/.test(id)) return 'blog';
    if (/(blog|news|magazin)/i.test(txt)) return 'blog';
    // faq
    if (/^(faq|frage|hilfe|help)/.test(id)) return 'faq';
    if (/(faq|häufig.*frage|hilfe)/i.test(txt)) return 'faq';
    return null;
}

/**
 * Extrahiert Sub-Page-URLs aus Homepage-HTML. Gibt max 1 URL pro Slot,
 * insgesamt max `maxPages` zurück (Default 6). Sortierung nach SLOT_PRIORITY.
 * Sprint 68: Akzeptiert auch SPA-Anchor-Sections (`href="#leistungen"`)
 * als virtuelle Sub-Pages, damit Branchen-Standards-Detection auch bei
 * Single-Page-Apps greift.
 */
function extractSubPages(html, baseUrl, maxPages = 6) {
    if (!html) return [];
    const base = new URL(baseUrl);
    const baseHost = base.hostname.replace(/^www\./, '');
    const found = {};

    // <a href="..." ...>TEXT</a>  — robuste Regex (HTML-Parser overkill für unsere Heuristik)
    const anchorRe = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRe.exec(html))) {
        const rawHref = m[1].trim();
        const rawText = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!rawHref || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:') || rawHref.startsWith('javascript:')) continue;

        // Sprint 68 — SPA-Anchor-Links als virtuelle Sub-Pages aufnehmen,
        // damit Detection-Patterns auch bei modernen Single-Page-Sites greifen.
        if (rawHref.startsWith('#') && rawHref.length > 1) {
            const slot = anchorToSlot(rawHref.slice(1), rawText);
            if (slot && !found[slot]) {
                found[slot] = {
                    slot,
                    url: baseUrl + rawHref,
                    anchorText: rawText.slice(0, 60)
                };
            }
            continue;
        }

        let absUrl;
        try { absUrl = new URL(rawHref, baseUrl); } catch { continue; }

        // Nur same-host
        if (absUrl.hostname.replace(/^www\./, '') !== baseHost) continue;
        // Keine Files
        if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|webm|mp3|doc|docx|xls|xlsx)(\?|$)/i.test(absUrl.pathname)) continue;
        // Kein Hash-only (z.B. /#features)
        if (absUrl.pathname === base.pathname && absUrl.search === base.search) continue;

        const pathname = absUrl.pathname.toLowerCase();

        // Slot via Pfad-Pattern bestimmen
        let slot = null;
        for (const p of SUBPAGE_PATTERNS) {
            if (p.match.test(pathname)) { slot = p.slot; break; }
        }
        // Fallback: Slot via Anchor-Text
        if (!slot) {
            for (const [key, re] of Object.entries(ANCHOR_TEXT_HINTS)) {
                if (re.test(rawText)) { slot = key; break; }
            }
        }
        if (!slot) continue;

        // Pro Slot nur die erste sinnvolle URL behalten
        if (!found[slot]) {
            found[slot] = {
                slot,
                url: absUrl.origin + absUrl.pathname,
                anchorText: rawText.slice(0, 60)
            };
        }
    }

    // Sortiert nach Priorität, dann gekürzt
    const ordered = SLOT_PRIORITY.map(s => found[s]).filter(Boolean).slice(0, maxPages);
    return ordered;
}

/**
 * HTML → Plain-Text. Entfernt Skripte/Styles/Tags, normalisiert
 * Whitespace, kürzt auf maxChars. Behält rudimentäre Block-Trennung
 * (Punkt am Ende von <p>/<div>/<h>).
 */
function htmlToText(html, maxChars = 1500) {
    if (!html) return '';
    let s = String(html);
    // Entferne head + scripts + styles
    s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
    s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
    s = s.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ');
    // Block-Tags → Punkt+Space, damit Sätze nicht verschmelzen
    s = s.replace(/<\/(p|div|li|h[1-6]|section|article|tr|td|br)>/gi, '. ');
    s = s.replace(/<br\s*\/?>/gi, '. ');
    // Restliche Tags entfernen
    s = s.replace(/<[^>]+>/g, ' ');
    // HTML-Entities (die häufigsten)
    s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&[a-z]+;/gi, ' ');
    // Whitespace + doppelte Punkte normalisieren
    s = s.replace(/\.\s*\.+/g, '.').replace(/\s+/g, ' ').trim();
    return s.slice(0, maxChars);
}

/**
 * Holt parallel mehrere URLs (mit Timeout) und gibt {url, html, text}-
 * Records zurück. Fehlerhafte Pages werden mit `error` annotiert, aber
 * nicht weggelassen (für Lead-Bewertung relevant: 404 auf Impressum
 * etc.).
 */
async function fetchPagesParallel(urls, opts = {}) {
    const { timeoutMs = 8000, userAgent = 'Karriaro-LeadBot/1.0', textChars = 1500 } = opts;
    // Sprint 82 — safeFetch validiert jede URL gegen SSRF (private IPs blockiert).
    const { safeFetch } = require('./safe-fetch.js');
    return Promise.all(urls.map(async (entry) => {
        const u = entry.url || entry;
        const slot = entry.slot || 'unknown';
        try {
            const res = await safeFetch(u, {
                headers: { 'User-Agent': userAgent, 'Accept': 'text/html,*/*' },
                timeoutMs
            });
            const status = res.status;
            const html = res.ok ? await res.text() : '';
            return {
                slot,
                url: u,
                status,
                ok: res.ok,
                text: htmlToText(html, textChars),
                html: res.ok ? html : ''
            };
        } catch (err) {
            return { slot, url: u, status: 0, ok: false, error: String(err?.message || err), text: '', html: '' };
        }
    }));
}

/**
 * Baut den User-Prompt-Block für Claude — konsolidiert alle relevanten
 * Daten in eine kompakte, lesbare Form. Wird mit dem cached System-
 * Prompt + tool_use-Definition gepaart.
 */
function buildResearchPrompt({ url, branche, place, homepage, subPages, psiScores, tech, wayback, competitors }) {
    const lines = [];
    lines.push(`Website: ${url}`);
    if (branche) lines.push(`Branche: ${branche}`);
    if (place?.displayName?.text) {
        lines.push(`Geschäft (Google): ${place.displayName.text}${place.formattedAddress ? ' · ' + place.formattedAddress : ''}`);
        if (place.rating != null) lines.push(`Google-Rating: ★${place.rating} (${place.userRatingCount || 0} Bewertungen)`);
        if (place.regularOpeningHours?.weekdayDescriptions?.length) lines.push(`Öffnungszeiten dokumentiert: ja`);
    }
    if (psiScores) {
        lines.push('');
        lines.push('## PageSpeed Insights (Mobile)');
        lines.push(`Performance ${psiScores.perf ?? '—'} · SEO ${psiScores.seo ?? '—'} · Accessibility ${psiScores.a11y ?? '—'} · Best Practices ${psiScores.bp ?? '—'}`);
        if (psiScores.lcp) lines.push(`LCP ${psiScores.lcp}s · CLS ${psiScores.cls ?? '—'}`);
    }
    if (tech) {
        lines.push('');
        lines.push('## Tech-Stack');
        lines.push(`CMS: ${tech.cms || 'unbekannt'}${tech.version ? ' ' + tech.version : ''}${tech.isBaukasten ? ' (Baukasten)' : ''}`);
    }
    if (wayback?.available) {
        lines.push(`Wayback: erstmals ${wayback.firstSeen || '—'}, letzte Änderung ${wayback.lastChanged || '—'} (vor ${wayback.yearsSince ?? '—'} Jahren)`);
    }
    if (competitors?.length) {
        lines.push('');
        lines.push('## Direkte Mitbewerber im Umfeld');
        for (const c of competitors.slice(0, 3)) {
            lines.push(`- ${c.name || '—'}${c.rating ? ' · ★' + c.rating : ''}${c.reviews ? ' (' + c.reviews + ')' : ''}${c.website ? ' · ' + c.website : ''}`);
        }
    }
    lines.push('');
    lines.push('## Homepage (Plain-Text, gekürzt)');
    lines.push(homepage?.text || '(nicht abrufbar)');

    if (subPages?.length) {
        lines.push('');
        lines.push('## Sub-Pages (jeweils gekürzt)');
        for (const sp of subPages) {
            lines.push('');
            lines.push(`### ${sp.slot.toUpperCase()} — ${sp.url}${!sp.ok ? ' [HTTP ' + sp.status + ']' : ''}`);
            lines.push(sp.text || '(leer)');
        }
    }

    lines.push('');
    lines.push('Bewerten Sie ganzheitlich. Nutzen Sie das `deep_research_assessment` Tool für Ihre Antwort.');

    return lines.join('\n');
}

const SYSTEM_PROMPT = `Sie sind ein erfahrener deutscher Webdesign-Auditor mit 20+ Jahren Erfahrung in der Bewertung von Websites lokaler Unternehmen (Handwerk, Gastronomie, Medizin, Anwälte, Hotels, etc.).

Sie bewerten heute eine konkrete Website ganzheitlich. Ziel ist NICHT, jede Site als "veraltet" abzustempeln — viele lokale Sites funktionieren für ihren Zweck gut, auch wenn sie technisch nicht modern sind. Ihre Aufgabe ist eine ehrliche, ausgewogene Einschätzung.

Bewertungsprinzipien:
1. **Sammeln Sie Stärken UND Schwächen** — mindestens 5 von jedem, falls vorhanden. Wenn die Site stark ist, sagen Sie das deutlich.
2. **Evidence statt Adjektive** — jede Aussage muss durch konkrete Beobachtungen aus dem Material belegt sein.
3. **Vom Geschäftszweck her denken** — eine Anwaltsseite hat andere Erfolgskriterien als ein Restaurant. Ein Friseur braucht keine 4K-Hero-Videos. Bewerten Sie kontextuell.
4. **Sub-Pages-Konsistenz prüfen** — Hero kann modern sein, Impressum aus 2014. Inkonsistenz ist ein wichtiges Signal.
5. **Score-Verteilung kalibrieren**:
   - 80–100: hochwertige, moderne Site, kein dringender Handlungsbedarf
   - 60–79: solide, einzelne Schwächen, Optimierung lohnt sich
   - 40–59: deutliche Defizite, Modernisierung sinnvoll
   - 20–39: stark veraltet oder strukturell problematisch, Neuaufbau lohnt
   - 0–19: nicht funktionsfähig oder unbrauchbar
6. **leadPotential ≠ overallScore.** overallScore = wie gut ist die Site. leadPotential = wie heiß ist diese Site als Akquise-Lead für eine Webdesign-Agentur (hoher leadPotential = niedriger overallScore + Geschäft hat erkennbar Budget + erkennbarer Schmerz).
7. **Kein Bullshit-Bingo.** Schreiben Sie konkret. "Hero-Section ohne Call-to-Action" statt "Conversion-Optimierung-Potenzial".

Antworten Sie immer in deutscher Sprache. Verwenden Sie das bereitgestellte Tool für die Antwort.`;

const TOOL_DEFINITION = {
    name: 'deep_research_assessment',
    description: 'Strukturierte Ganzheits-Bewertung einer Website mit Stärken, Schwächen, Verdict, Empfehlungen.',
    input_schema: {
        type: 'object',
        required: ['overallScore', 'leadPotential', 'verdict', 'strengths', 'weaknesses', 'keyPitchAngle', 'recommendedActions', 'oneLineSummary'],
        properties: {
            overallScore: { type: 'number', minimum: 0, maximum: 100, description: 'Ganzheitliche Site-Qualität (0..100). Siehe System-Prompt für Skala.' },
            leadPotential: { type: 'number', minimum: 0, maximum: 100, description: 'Wie heiß ist diese Site als Akquise-Lead? Siehe System-Prompt.' },
            verdict: { type: 'string', enum: ['kein_handlungsbedarf', 'optimierung', 'modernisierung_lohnt', 'neuaufbau'], description: 'Empfohlene Dringlichkeit.' },
            strengths: {
                type: 'array', minItems: 0, maxItems: 12,
                items: {
                    type: 'object', required: ['title', 'evidence', 'weight'],
                    properties: {
                        title: { type: 'string', description: 'Kurz, max 80 Zeichen.' },
                        evidence: { type: 'string', description: 'Konkreter Beleg aus dem Material.' },
                        weight: { type: 'integer', minimum: 1, maximum: 5, description: 'Wie stark ist diese Stärke (1=schwach, 5=sehr stark).' }
                    }
                }
            },
            weaknesses: {
                type: 'array', minItems: 0, maxItems: 12,
                items: {
                    type: 'object', required: ['title', 'evidence', 'severity', 'category'],
                    properties: {
                        title: { type: 'string', description: 'Kurz, max 80 Zeichen.' },
                        evidence: { type: 'string', description: 'Konkreter Beleg aus dem Material.' },
                        severity: { type: 'integer', minimum: 1, maximum: 5, description: 'Schweregrad (1=kosmetisch, 5=Showstopper).' },
                        category: { type: 'string', enum: ['design', 'tech', 'content', 'seo', 'trust', 'conversion', 'compliance', 'mobile', 'performance'] }
                    }
                }
            },
            keyPitchAngle: { type: 'string', description: 'Ein einziger Satz: stärkstes Argument für ein Akquise-Mail-Subject. Konkret, nicht generisch.' },
            recommendedActions: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' }, description: 'Konkrete Handlungsempfehlungen für den Site-Inhaber.' },
            oneLineSummary: { type: 'string', description: 'Ein Satz: was ist das Wichtigste über diese Site?' }
        }
    }
};

module.exports = {
    extractSubPages,
    htmlToText,
    fetchPagesParallel,
    buildResearchPrompt,
    SYSTEM_PROMPT,
    TOOL_DEFINITION,
    SLOT_PRIORITY
};
