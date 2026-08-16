/**
 * Betriebs-Evidenz aus dem Seiten-Quelltext — drei Signalklassen, die dieselbe
 * HTML-Abholung beantwortet, die adEvidence ohnehin schon macht.
 *
 * ─── Warum das hier liegt und nicht im Client ────────────────────────────────
 * Der Region-Scanner holt fuer die Top-Leads bereits serverseitig das HTML
 * (SSRF-geschuetzt, Browser-UA, Accept-Language de-DE, 168 h Firestore-Cache).
 * Dieselben Bytes beantworten drei weitere Fragen ohne einen einzigen
 * zusaetzlichen Netz-Zugriff:
 *
 *   1. scanPaidTools    — zahlt der Betrieb LAUFEND fuer Kundengewinnung?
 *   2. scanCareSignals  — kuemmert er sich um seine Seite, oder hat er aufgegeben?
 *   3. scanContactPaths — kann man ihn ueberhaupt ansprechen?
 *
 * ─── Warum die PSI-Variante das NICHT kann ───────────────────────────────────
 * Das bestehende analysis/messaging-check.js prueft `href="https://wa.me/…"`
 * gegen eine zusammengefuegte Liste von NETZWERK-URLs. Ein Link ist aber kein
 * Request — das Muster kann strukturell nie matchen. Genau derselbe Fehler wie
 * bei der Ad-Erkennung vor dem GTM-Container-Scan: gesucht wurde im falschen
 * Artefakt. Hier wird im HTML gesucht, wo die Links tatsaechlich stehen.
 *
 * Pure Funktionen, kein Netz, keine Firestore — ohne Mock testbar (CJS).
 *
 * @module lib/site-evidence
 */

/**
 * Bezahlte digitale Werkzeuge = laufende Ausgabe fuer Kundengewinnung.
 *
 * Das ist Budget-Beweis OHNE Anzeigen: wer Doctolib oder OpenTable bezahlt, hat
 * eine Haushaltszeile fuer „digital" und ist keine Baukasten-und-vergessen-Person.
 * Bewusst nur Dienste mit echtem Abo-Charakter — kostenlose Einbettungen
 * (Google Maps, Instagram-Feed) beweisen kein Budget und stehen deshalb nicht drin.
 *
 * `weight` ist ein RELATIVER Hinweis auf die Aussagekraft, kein Punktwert —
 * die Gewichtung passiert in analysis/buying-intent.js.
 */
const PAID_TOOLS = [
    { key: 'doctolib',   re: /doctolib\.(?:de|com|fr)/i,                     name: 'Doctolib',            hint: 'Termin-Software mit Monatsgebühr' },
    { key: 'jameda',     re: /jameda\.de\/[^"'\s]*termin|jameda-widget/i,    name: 'Jameda Premium',      hint: 'kostenpflichtiges Arzt-Profil' },
    { key: 'treatwell',  re: /treatwell\.(?:de|com)|salonized/i,             name: 'Treatwell',           hint: 'Buchungsplattform mit Provision' },
    { key: 'opentable',  re: /opentable\.(?:de|com)/i,                       name: 'OpenTable',           hint: 'Reservierung mit Gebühr je Gast' },
    { key: 'quandoo',    re: /quandoo\.(?:de|com)/i,                         name: 'Quandoo',             hint: 'Reservierung mit Gebühr je Gast' },
    { key: 'calendly',   re: /calendly\.com/i,                               name: 'Calendly',            hint: 'Termin-Tool, meist bezahlter Tarif' },
    { key: 'whatsapp',   re: /(?:href=["']https?:\/\/(?:api\.)?wa\.me\/|href=["']https?:\/\/api\.whatsapp\.com\/send)/i, name: 'WhatsApp Business', hint: 'direkter Kundenkanal, aktiv gepflegt' },
    { key: 'shopify',    re: /cdn\.shopify\.com|shopify\.com\/s\/files/i,    name: 'Shopify',             hint: 'Shop mit Monatsgebühr' },
    { key: 'woocommerce',re: /woocommerce|wc-ajax=/i,                        name: 'WooCommerce',         hint: 'Online-Shop im Betrieb' },
    { key: 'timify',     re: /timify\.com/i,                                 name: 'Timify',              hint: 'Terminbuchung, bezahlter Tarif' },
    { key: 'bookingkit', re: /bookingkit\.(?:de|net)/i,                      name: 'bookingkit',          hint: 'Ticket-/Buchungssystem' },
    { key: 'mailchimp',  re: /list-manage\.com|mailchimp\.com\/[^"'\s]*form/i, name: 'Mailchimp',         hint: 'Newsletter-Versand, ab Liste kostenpflichtig' },
    { key: 'brevo',      re: /sibforms\.com|brevo\.com/i,                    name: 'Brevo',               hint: 'Newsletter-/CRM-Dienst' }
];

/**
 * @param {string} html
 * @returns {{found:Array<{key,name,hint}>, count:number, keys:string[]}}
 */
function scanPaidTools(html) {
    const text = String(html || '');
    const found = [];
    for (const t of PAID_TOOLS) {
        if (t.re.test(text)) found.push({ key: t.key, name: t.name, hint: t.hint });
    }
    return { found, count: found.length, keys: found.map(f => f.key) };
}

// ─────────────────────────── CMS-Version (F15) ───────────────────────────

// 2026-08-16 — Verifikations-Nebenbefund E1: Das EOL-Signal (CMS abgekündigt =
// hartes Strukturzeichen) trägt nur, wenn die VERSION bekannt ist — und die
// PSI-basierte Erkennung findet sie selten. Dieselben HTML-Bytes hier kennen
// sie oft: der Generator-Meta-Tag nennt CMS+Version, und WordPress verrät die
// CORE-Version über ?ver= an /wp-includes/-Assets (NUR dort — Plugin-Assets
// tragen Plugin-Versionen, die dürfen nie als Core-Version gelesen werden).
// Kein Fund → null = „ungeprüft", nie geraten.
const RE_GENERATOR_A = /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i;
const RE_GENERATOR_B = /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']generator["']/i;
const RE_WP_CORE = /\/wp-includes\/[^"'\s>]*\?[^"'\s>]*ver=(\d+\.\d+(?:\.\d+)?)/i;
// Namen exakt in der Form, die analysis/tech-age.js (CMS_EOL_YEAR) erwartet.
const RE_GENERATOR_CMS = /^(WordPress|Joomla!?|Drupal|TYPO3(?:\s+CMS)?|Shopware|Contao)[\s/]+v?(\d+(?:\.\d+)*)/i;
const CMS_CANONICAL = { wordpress: 'WordPress', joomla: 'Joomla', drupal: 'Drupal', typo3: 'TYPO3', shopware: 'Shopware', contao: 'Contao' };

/**
 * @param {string} html
 * @returns {{cms:string, version:string, quelle:'generator'|'wp-includes'}|null}
 */
function scanTechVersion(html) {
    const text = String(html || '');
    const gen = text.match(RE_GENERATOR_A) || text.match(RE_GENERATOR_B);
    if (gen) {
        const m = gen[1].trim().match(RE_GENERATOR_CMS);
        if (m) {
            const key = m[1].toLowerCase().replace(/!|\s+cms/g, '');
            return { cms: CMS_CANONICAL[key] || m[1], version: m[2], quelle: 'generator' };
        }
    }
    const wp = text.match(RE_WP_CORE);
    if (wp) return { cms: 'WordPress', version: wp[1], quelle: 'wp-includes' };
    return null;
}

// ─────────────────────────── Pflege-Signale ───────────────────────────

const RE_COPYRIGHT = /(?:©|&copy;|copyright)[^<>]{0,40}?((?:19|20)\d{2})(?:\s*[–\-—]\s*((?:19|20)\d{2}))?/gi;
const RE_SITEMAP = /<link[^>]+rel=["']sitemap["']|\/sitemap(?:_index)?\.xml/i;
const RE_ISO_DATE = /\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;
const RE_DATETIME_ATTR = /datetime=["'](20\d{2})-(?:0[1-9]|1[0-2])/gi;

/**
 * „Kuemmert sich" vs. „hat aufgegeben".
 *
 * ⚠️ Diese Signale werten NUR AUF, nie ab. Ihre Abwesenheit beweist nichts:
 * Copyright-Jahre werden haeufig per JavaScript gesetzt (steht dann nicht im
 * HTML), und viele voellig gepflegte Seiten fuehren keine datierten Beitraege.
 * Der echte Aufgabe-Fall wird bereits vom livenessGate in
 * scoring/opportunity.js abgefangen (>540 Tage ohne Bewertung → x0.10) — ihn
 * hier ein zweites Mal zu bestrafen waere Doppelzaehlung derselben Evidenz.
 *
 * @param {string} html
 * @param {number} currentYear  explizit hereingereicht — Tests sollen nicht an der Uhr haengen
 */
function scanCareSignals(html, currentYear) {
    const text = String(html || '');
    const year = Number(currentYear) || 0;

    // Juengstes Copyright-Jahr (Bereiche wie "2019–2026" zaehlen mit dem Endjahr).
    let newestCopyright = null;
    for (const m of text.matchAll(RE_COPYRIGHT)) {
        const y = Number(m[2] || m[1]);
        // Zukunftsjahre sind Tippfehler oder Fremdinhalt — nicht als Frische werten.
        if (y > year + 1) continue;
        if (newestCopyright === null || y > newestCopyright) newestCopyright = y;
    }
    const copyrightCurrent = newestCopyright !== null && year > 0 && (year - newestCopyright) <= 1;

    // Juengstes im HTML sichtbares Datum (ISO oder <time datetime=…>).
    let newestDateYear = null;
    for (const m of text.matchAll(RE_ISO_DATE)) {
        const y = Number(m[1]);
        if (y > year + 1) continue;
        if (newestDateYear === null || y > newestDateYear) newestDateYear = y;
    }
    for (const m of text.matchAll(RE_DATETIME_ATTR)) {
        const y = Number(m[1]);
        if (y > year + 1) continue;
        if (newestDateYear === null || y > newestDateYear) newestDateYear = y;
    }
    const datedContentCurrent = newestDateYear !== null && year > 0 && (year - newestDateYear) <= 1;

    const hasSitemap = RE_SITEMAP.test(text);

    const signals = [];
    if (copyrightCurrent) signals.push(`Copyright ${newestCopyright}`);
    if (datedContentCurrent) signals.push(`datierte Inhalte aus ${newestDateYear}`);
    if (hasSitemap) signals.push('Sitemap hinterlegt');

    return { newestCopyright, copyrightCurrent, newestDateYear, datedContentCurrent, hasSitemap, signals, caresCount: signals.length };
}

// ─────────────────────────── Kontaktwege ───────────────────────────

const RE_MAILTO = /href=["']mailto:([^"'?]+)/gi;
const RE_TEL = /href=["']tel:([^"']+)/i;
const RE_IMPRESSUM_LINK = /href=["'][^"']*(impressum|imprint|kontakt|legal-notice)[^"']*["']/i;

// Postfaecher, hinter denen keine benannte Person sitzt. Eine persoenliche
// Adresse ist fuer die Ansprache deutlich wertvoller — deshalb getrennt gezaehlt.
const GENERIC_MAILBOX = /^(info|kontakt|contact|office|mail|hello|hallo|praxis|team|service|post|empfang|anfrage|buero|b_ro)\b/i;

/**
 * Kann man den Betrieb ueberhaupt ansprechen?
 *
 * Bewusst NUR was im HTML der Startseite steht — kein zweiter Fetch. Fuer die
 * tatsaechliche Ansprache holt der Outreach-Pfad weiterhin enrichContact
 * (liest zusaetzlich das Impressum). Hier geht es allein um die Rangfolge:
 * ein Betrieb ohne jeden Kontaktweg ist schwerer erreichbar und gehoert nicht
 * vor einen, den man direkt anschreiben kann.
 *
 * @param {string} html
 */
function scanContactPaths(html) {
    const text = String(html || '');
    const mails = [];
    for (const m of text.matchAll(RE_MAILTO)) {
        const addr = String(m[1] || '').trim().toLowerCase();
        // JS-Platzhalter und leere hrefs aussortieren.
        if (!addr || !addr.includes('@') || addr.includes(' ')) continue;
        if (!mails.includes(addr)) mails.push(addr);
    }
    const personal = mails.filter(a => !GENERIC_MAILBOX.test(a.split('@')[0]));
    return {
        checked: true,
        hasMailto: mails.length > 0,
        mailtoCount: mails.length,
        hasPersonalMailto: personal.length > 0,
        hasTel: RE_TEL.test(text),
        hasImpressumLink: RE_IMPRESSUM_LINK.test(text)
    };
}

/** Ein nicht durchgefuehrter Scan — explizit „unbekannt", NICHT „nichts gefunden". */
const CONTACT_UNCHECKED = { checked: false, hasMailto: false, mailtoCount: 0, hasPersonalMailto: false, hasTel: false, hasImpressumLink: false };

module.exports = {
    scanPaidTools,
    scanCareSignals,
    scanContactPaths,
    scanTechVersion,
    PAID_TOOLS,
    CONTACT_UNCHECKED
};
