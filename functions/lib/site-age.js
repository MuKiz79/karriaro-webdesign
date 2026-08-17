/**
 * Website-Alter & Relaunch-Verdacht (F17, 2026-08-17).
 *
 * ─── Founder-Kriterium ───────────────────────────────────────────────────────
 * „Jemand, der erst vor kurzem in eine neue Website investiert hat, beauftragt
 * nicht gleich nochmal eine — außer sie hat erhebliche Mängel." Frische
 * Investition ist ein DÄMPFER; die Mängel-Ausnahme wertet der Client
 * (scoring/opportunity.js), hier wird nur DATIERT.
 *
 * ─── Drei unabhängige Quellen, jede einzeln dreiwertig ──────────────────────
 *  1. RDAP: Domain-Registrierungsdatum (zuverlässigste Quelle; junge Domain =
 *     junge Web-Präsenz). ⚠️ „last changed" ist meist nur das Renewal — NIE als
 *     Relaunch-Beleg lesen.
 *  2. Wayback CDX: Zeitstempel der ersten Archivierung. ⚠️ NUR Kontext, nie
 *     Jung-Beweis — das Archiv crawlt kleine Seiten oft jahrelang gar nicht.
 *  3. Archiv-Snapshot ≈ 13 Monate zurück: lief die Seite damals auf einem
 *     ANDEREN CMS als heute, ist der Relaunch jünger als das Fenster →
 *     `relaunchVerdacht: true`. Gleiches CMS ⇒ false (Redesign INNERHALB
 *     desselben Baukastens bleibt unsichtbar — dokumentierte Grenze).
 *
 * Das Internet Archive fällt regelmäßig aus (beim Bauen: komplett offline,
 * „Temporarily Offline"-Platzhalter mit HTTP 200!). Deshalb: harte kurze
 * Timeouts, Platzhalter-Erkennung, und JEDES nicht prüfbare Teilstück ist
 * `null` = „nicht geprüft" — nie eine Richtung erfinden.
 *
 * @module lib/site-age
 */
const { detectTechFromHtml } = require('./light-audit.js');

const RDAP_BASES = {
    de: 'https://rdap.denic.de/domain/',
    com: 'https://rdap.verisign.com/com/v1/domain/',
    net: 'https://rdap.verisign.com/net/v1/domain/',
    org: 'https://rdap.org/domain/'
};

async function fetchJson(url, timeoutMs) {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

/** Registrierungsdatum der Domain (ms) oder null. */
async function rdapRegisteredMs(domain) {
    try {
        const tld = domain.split('.').pop();
        const base = RDAP_BASES[tld] || 'https://rdap.org/domain/';
        const d = await fetchJson(`${base}${domain}`, 5000);
        const reg = (d.events || []).find(e => e.eventAction === 'registration');
        const t = reg?.eventDate ? Date.parse(reg.eventDate) : NaN;
        return Number.isFinite(t) ? t : null;
    } catch { return null; }
}

/**
 * Fallback via Certificate Transparency: das ÄLTESTE Zertifikat der Domain
 * datiert den Live-Gang taggenau. Nötig, weil DENIC für .de-Domains KEIN
 * Registrierungsdatum herausgibt (nur „last changed" = oft bloß das Renewal) —
 * und .de ist die Mehrheit der Leads. Gegenprobe beim Bauen: für die
 * Auslöser-Domain (.com) lieferten RDAP und crt.sh denselben Tag (2019-06-04).
 * crt.sh ist notorisch langsam/flaky → kurzer Timeout, Fehler = null.
 */
async function crtshFirstCertMs(domain) {
    try {
        const rows = await fetchJson(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, 8000);
        if (!Array.isArray(rows) || !rows.length) return null;
        let min = Infinity;
        for (const r of rows) {
            const t = Date.parse(r.not_before);
            if (Number.isFinite(t) && t < min) min = t;
        }
        return Number.isFinite(min) && min !== Infinity ? min : null;
    } catch { return null; }
}

/** Zeitstempel (ms) der ersten Archivierung oder null. */
async function cdxFirstArchivedMs(domain) {
    try {
        const d = await fetchJson(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&fl=timestamp&limit=1`, 5000);
        const ts = d?.[1]?.[0];
        if (!/^\d{14}$/.test(ts || '')) return null;
        const t = Date.parse(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T00:00:00Z`);
        return Number.isFinite(t) ? t : null;
    } catch { return null; }
}

/**
 * CMS im Archiv-Snapshot ≈ `monateZurueck` — oder null (kein Snapshot /
 * Archiv down / CMS dort nicht erkennbar).
 */
async function cmsImArchiv(url, monateZurueck = 13) {
    try {
        const d = new Date(Date.now() - monateZurueck * 30 * 86400000);
        const ts = d.toISOString().slice(0, 10).replace(/-/g, '');
        const r = await fetch(`https://web.archive.org/web/${ts}id_/${url}`, {
            signal: AbortSignal.timeout(10000), redirect: 'follow'
        });
        if (!r.ok) return null;
        const html = await r.text();
        // ⚠️ Archiv-Ausfall liefert einen 200er-PLATZHALTER („Temporarily
        // Offline") — der ist KEIN Snapshot und darf nie als „damals kein
        // CMS erkennbar" gelesen werden.
        if (/Internet Archive.*(Temporarily Offline|Offline)/is.test(html.slice(0, 2000))) return null;
        // Das Archiv schreibt Asset-URLs um, hängt die Original-URLs aber nur
        // mit Präfix um — die substring-basierten TECH_PATTERNS überleben das.
        const tech = detectTechFromHtml(html, url);
        return tech?.cms || null;
    } catch { return null; }
}

/**
 * Alle Quellen einsammeln + Verdacht ableiten. `cmsNow` kommt vom Aufrufer
 * (aus dem frischen HTML — hier nicht nochmal fetchen).
 */
async function ermittleSiteAge(url, domain, cmsNow) {
    const [rdapMs, firstArchivedMs, cmsThen] = await Promise.all([
        rdapRegisteredMs(domain),
        cdxFirstArchivedMs(domain),
        cmsNow ? cmsImArchiv(url) : Promise.resolve(null)
    ]);
    // crt.sh nur als Fallback anfragen (langsam) — RDAP hat Vorrang.
    const crtMs = rdapMs === null ? await crtshFirstCertMs(domain) : null;
    return {
        domainRegisteredMs: rdapMs ?? crtMs,
        domainRegisteredQuelle: rdapMs !== null ? 'rdap' : (crtMs !== null ? 'crtsh' : null),
        firstArchivedMs,
        cmsThen,
        cmsNow: cmsNow || null,
        relaunchVerdacht: bewerteRelaunch(cmsThen, cmsNow),
        checkedAt: new Date().toISOString()
    };
}

/**
 * Pure: CMS-Vergleich → true (Wechsel = Relaunch im Fenster) / false (gleich
 * geblieben) / null (mindestens eine Seite unbekannt).
 */
function bewerteRelaunch(cmsThen, cmsNow) {
    if (!cmsThen || !cmsNow) return null;
    return cmsThen !== cmsNow;
}

module.exports = { ermittleSiteAge, bewerteRelaunch, cdxFirstArchivedMs, rdapRegisteredMs, cmsImArchiv };
