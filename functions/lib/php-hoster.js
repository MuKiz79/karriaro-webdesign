/**
 * PHP-Version und Hoster (2026-09-10, Paket B2) — `php` und `hoster` im
 * adEvidence (V6).
 *
 * ─── PHP ────────────────────────────────────────────────────────────────────
 * Die Version steht oft offen im Response-Header (`X-Powered-By: PHP/7.4.33`,
 * seltener im `Server`-Header). Gelesen werden ausschließlich die Header der
 * HTML-Abholung, die adEvidence ohnehin macht — kein zusätzlicher Abruf.
 *
 * Bewertung nach php.net (supported-versions.php + eol.php, abgerufen
 * 2026-09-10): Ende der Sicherheitsupdates je Zweig in PHP_EOL. `eol` ist true,
 * wenn der Stichtag VOR dem Prüfdatum liegt.
 *
 * ⚠️ Distributions-Pakete (`PHP/8.1.2-1ubuntu2.14`, `+deb12u1`, `.el8`) bekommen
 * vom Distributor weiter Sicherheits-Backports, auch wenn der Zweig bei php.net
 * ausgelaufen ist. „Ohne Sicherheitsupdates" wäre dort eine Falschaussage →
 * eol/eolDatum bleiben null (nicht bewertet), die Version wird trotzdem genannt.
 *
 * ─── Hoster ─────────────────────────────────────────────────────────────────
 * Aus DNS, nie aus dem HTML: MX `*.rzone.de` bzw. NS `*.rzone.de` → strato;
 * NS `*.ui-dns.*` oder MX `*.ionos.de`/`*.kundenserver.de` → ionos.
 * Widersprechen sich MX und NS (z. B. Mail bei Strato, DNS bei IONOS), ist der
 * Hoster NICHT belegt → null. Ohne Beleg immer null, nie geraten.
 *
 * Resolver injizierbar — Tests ohne echtes Netz.
 *
 * @module lib/php-hoster
 */

const dns = require('node:dns');
const logger = require('./logger.js');

/**
 * Ende der Sicherheitsupdates je PHP-Zweig (php.net, Stand 2026-09-10).
 * 8.2–8.5: supported-versions.php („Security Support Until"); ältere: eol.php.
 */
const PHP_EOL = Object.freeze({
    '5.2': '2011-01-06',
    '5.3': '2014-08-14',
    '5.4': '2015-09-03',
    '5.5': '2016-07-21',
    '5.6': '2018-12-31',
    '7.0': '2019-01-10',
    '7.1': '2019-12-01',
    '7.2': '2020-11-30',
    '7.3': '2021-12-06',
    '7.4': '2022-11-28',
    '8.0': '2023-11-26',
    '8.1': '2025-12-31',
    '8.2': '2026-12-31',
    '8.3': '2027-12-31',
    '8.4': '2028-12-31',
    '8.5': '2029-12-31'
});

const PHP_UNBEKANNT = Object.freeze({ version: null, eol: null, eolDatum: null });
const HOSTER_UNBEKANNT = Object.freeze({ name: null, quelle: null });

// Lookbehind statt \b: „XPHP/…" oder „myPHP/…" sind keine PHP-Angabe.
const RE_PHP = /(?<![\p{L}\d])PHP\/(\d{1,2})\.(\d{1,2})(?:\.(\d{1,3}))?([^\s,;)]*)/iu;
const RE_DISTRIBUTION = /ubuntu|deb\d|\+deb|debian|\.el\d|el\d_|centos|alma|rocky|remi|sury/i;

/** Header lesen — Plain-Objekt (light-audit fetchHtml) oder Headers-Instanz. */
function leseHeader(headers, name) {
    if (!headers) return null;
    try {
        if (typeof headers.get === 'function') return headers.get(name);
        const wert = headers[name] ?? headers[name.toLowerCase()];
        return Array.isArray(wert) ? wert.join(', ') : (wert ?? null);
    } catch (_) {
        return null;
    }
}

function isoTag(datum) {
    const d = datum instanceof Date ? datum : new Date(datum);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

/**
 * EOL-Bewertung eines Zweigs.
 * @returns {{eol:boolean|null, eolDatum:string|null}}
 */
function bewertePhpZweig(major, minor, heute = new Date()) {
    const zweig = `${major}.${minor}`;
    const datum = PHP_EOL[zweig] || null;
    const tag = isoTag(heute);
    if (datum && tag) return { eol: tag > datum, eolDatum: datum };
    // Älter als die älteste Tabellenzeile (5.2): sicher ohne Updates, Datum unbelegt.
    const aelterAlsTabelle = major < 5 || (major === 5 && minor < 2);
    if (aelterAlsTabelle) return { eol: true, eolDatum: null };
    // Neuer als die Tabelle (oder unbekannter Zweig): nicht bewertet.
    return { eol: null, eolDatum: null };
}

/**
 * PHP-Version aus Response-Headern (X-Powered-By zuerst, dann Server).
 *
 * @param {object|Headers} headers
 * @param {{heute?:Date}} [opts]
 * @returns {{version:string|null, eol:boolean|null, eolDatum:string|null}}
 */
function bewertePhpAusHeadern(headers, { heute = new Date() } = {}) {
    for (const name of ['x-powered-by', 'server']) {
        const wert = leseHeader(headers, name);
        if (!wert) continue;
        const m = String(wert).match(RE_PHP);
        if (!m) continue;
        const major = Number(m[1]);
        const minor = Number(m[2]);
        const version = m[3] !== undefined ? `${major}.${minor}.${Number(m[3])}` : `${major}.${minor}`;
        if (RE_DISTRIBUTION.test(m[4] || '')) {
            return { version, eol: null, eolDatum: null };
        }
        return { version, ...bewertePhpZweig(major, minor, heute) };
    }
    return { ...PHP_UNBEKANNT };
}

// Suffix mit Label-Grenze: „mx.evilrzone.de" und „rzone.de.fremd.com" zählen nicht.
const RE_STRATO = /(?:^|\.)rzone\.de$/i;
const RE_IONOS_NS = /(?:^|\.)ui-dns\.[a-z]{2,6}$/i;
const RE_IONOS_MX = /(?:^|\.)(?:ionos\.de|kundenserver\.de)$/i;

function ohnePunkt(name) {
    return String(name || '').trim().toLowerCase().replace(/\.$/, '');
}

/** Ein Hoster aus einer Namensliste — widersprüchliche Treffer ergeben null. */
function eindeutig(treffer) {
    const menge = new Set(treffer.filter(Boolean));
    return menge.size === 1 ? [...menge][0] : null;
}

function hosterAusMx(eintraege) {
    return eindeutig((eintraege || []).map(e => {
        const n = ohnePunkt(e && (e.exchange ?? e));
        if (RE_STRATO.test(n)) return 'strato';
        if (RE_IONOS_MX.test(n)) return 'ionos';
        return null;
    }));
}

function hosterAusNs(eintraege) {
    return eindeutig((eintraege || []).map(e => {
        const n = ohnePunkt(e);
        if (RE_STRATO.test(n)) return 'strato';
        if (RE_IONOS_NS.test(n)) {
            // Gemessen 2026-09-10: strato.de selbst liegt auf ns-strato.ui-dns.*
            // (IONOS-DNS-Infrastruktur derselben Unternehmensgruppe). Ein Name,
            // der „strato" trägt, darf deshalb nie als ionos gelten.
            return /strato/i.test(n.split('.')[0]) ? 'strato' : 'ionos';
        }
        return null;
    }));
}

/**
 * MX- und NS-Befund zusammenführen.
 * @returns {{name:'strato'|'ionos'|null, quelle:'mx'|'ns'|null, konflikt:boolean}}
 */
function bewerteHoster(mx, ns) {
    const ausMx = hosterAusMx(mx);
    const ausNs = hosterAusNs(ns);
    if (ausMx && ausNs && ausMx !== ausNs) return { name: null, quelle: null, konflikt: true };
    // Stimmen beide überein, zählt NS (beschreibt, wo die Domain verwaltet wird).
    if (ausNs) return { name: ausNs, quelle: 'ns', konflikt: false };
    if (ausMx) return { name: ausMx, quelle: 'mx', konflikt: false };
    return { name: null, quelle: null, konflikt: false };
}

const KEINE_DATEN = new Set(['ENODATA', 'ENOTFOUND', 'NOTFOUND', 'ENONAME']);

/** Kandidaten von der konkreten Subdomain bis zur Zwei-Label-Domain. */
function domainKandidaten(host) {
    const h = ohnePunkt(host).replace(/^\[|\]$/g, '').replace(/^www\./, '');
    if (!h || /^[\d.]+$/.test(h) || h.includes(':')) return [];
    const teile = h.split('.').filter(Boolean);
    const out = [];
    for (let i = 0; i <= teile.length - 2; i++) out.push(teile.slice(i).join('.'));
    return out;
}

async function frage(resolver, art, name) {
    try {
        const r = art === 'mx' ? await resolver.resolveMx(name) : await resolver.resolveNs(name);
        return { daten: Array.isArray(r) ? r : [], fehler: null };
    } catch (err) {
        if (KEINE_DATEN.has(err && err.code)) return { daten: [], fehler: null };
        return { daten: [], fehler: String(err && (err.code || err.message)) };
    }
}

function standardResolver() {
    // Kurze Einzel-Timeouts; die Gesamtuhr liegt in ermittleHoster.
    return new dns.promises.Resolver({ timeout: 2000, tries: 2 });
}

/**
 * Hoster eines Hosts über DNS.
 *
 * Geht von der Subdomain zur Basis-Domain, bis MX oder NS antwortet. Ein
 * DNS-Fehler (Timeout, SERVFAIL) bricht ab → null (nicht gemessen), er wird
 * nie als „keine Einträge" gelesen.
 *
 * @param {string} host
 * @param {{resolver?:{resolveMx:Function, resolveNs:Function}, timeoutMs?:number, log?:Function}} [deps]
 * @returns {Promise<{name:'strato'|'ionos'|null, quelle:'mx'|'ns'|null}>}
 */
async function ermittleHoster(host, deps = {}) {
    const {
        resolver = standardResolver(),
        timeoutMs = 6000,
        log = (nachricht, kontext) => logger.info(nachricht, kontext)
    } = deps;
    const kandidaten = domainKandidaten(host);
    if (!kandidaten.length) return { ...HOSTER_UNBEKANNT };

    let uhr;
    const zeitueberschreitung = new Promise(resolve => {
        uhr = setTimeout(() => resolve('timeout'), timeoutMs);
    });

    const suche = (async () => {
        for (const name of kandidaten) {
            const [mx, ns] = await Promise.all([frage(resolver, 'mx', name), frage(resolver, 'ns', name)]);
            if (mx.fehler || ns.fehler) {
                // Teilantwort nur werten, wenn die andere Seite sauber antwortete —
                // sonst könnte der fehlende Teil einen Widerspruch verstecken.
                return { abbruch: mx.fehler || ns.fehler, name };
            }
            if (mx.daten.length || ns.daten.length) return { mx: mx.daten, ns: ns.daten, name };
        }
        return { mx: [], ns: [], name: kandidaten[kandidaten.length - 1] };
    })();

    try {
        const r = await Promise.race([suche, zeitueberschreitung]);
        if (r === 'timeout') {
            log('php-hoster: DNS-Zeitüberschreitung', { host });
            return { ...HOSTER_UNBEKANNT };
        }
        if (r.abbruch) {
            log('php-hoster: DNS nicht gemessen', { host, domain: r.name, grund: r.abbruch });
            return { ...HOSTER_UNBEKANNT };
        }
        const b = bewerteHoster(r.mx, r.ns);
        if (b.konflikt) log('php-hoster: MX und NS widersprechen sich', { host, domain: r.name });
        return { name: b.name, quelle: b.quelle };
    } catch (err) {
        log('php-hoster: Hoster-Ermittlung fehlgeschlagen', { host, grund: err.message });
        return { ...HOSTER_UNBEKANNT };
    } finally {
        clearTimeout(uhr);
    }
}

module.exports = {
    bewertePhpAusHeadern,
    bewertePhpZweig,
    bewerteHoster,
    ermittleHoster,
    domainKandidaten,
    PHP_EOL,
    PHP_UNBEKANNT,
    HOSTER_UNBEKANNT
};
