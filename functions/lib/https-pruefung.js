/**
 * HTTPS-Prüfung (2026-09-10, Paket B2) — direkter TLS-Handshake plus
 * http→https-Weiterleitung, geliefert als `httpsCheck` im adEvidence (V6).
 *
 * ─── Warum gemessen statt übernommen ────────────────────────────────────────
 * Eine externe KI-Leadliste behauptete „HTTPS ist bei allen acht erreichbar" —
 * gemessen war das bei drei von neun Hostnamen falsch: zwei ohne JEDEN
 * funktionierenden TLS-Handshake (alert 80, nur http), einer mit einem
 * Zertifikat auf einen FREMDEN Host (Browser bricht ab). Laufzeit-Eigenschaften
 * werden deshalb hier selbst gemessen, nie aus einer Liste gelesen.
 *
 * ─── Drei Zustände je Befund ────────────────────────────────────────────────
 *   true  — gemessen, trifft zu
 *   false — gemessen, trifft NICHT zu (der Server hat aktiv geantwortet:
 *           Verbindung verweigert, TLS-Alert, kein TLS auf Port 443, http-Seite
 *           wird mit 2xx ohne Weiterleitung ausgeliefert)
 *   null  — NICHT gemessen (Timeout, Netzfehler, SSRF-Sperre, Bot-Wall-Status).
 *           null darf nie als negativ gewertet werden — ein falsches „Ihre Seite
 *           hat kein HTTPS" im Erstkontakt kostet sofort die Glaubwürdigkeit.
 *
 * `checked` ist true, sobald mindestens EIN Teilbefund gemessen wurde; ein
 * Aufrufer, der nur `checked` liest, kann also nie einen leeren Datensatz für
 * einen geprüften halten.
 *
 * ─── SSRF ───────────────────────────────────────────────────────────────────
 * Der Host wird über resolvePublicAddress (safe-fetch.js) validiert; der
 * TLS-Handshake geht an genau diese IP (gepinnt, SNI bleibt der Hostname).
 * Die http-Probe folgt Weiterleitungen MANUELL und validiert JEDEN Hop — wie
 * fetchHtml in light-audit.js mit globalem fetch statt safeFetch (Sprint 240:
 * der Custom-undici-Agent wirft beim Teardown unfangbar).
 *
 * Alle Netz-Zugriffe sind injizierbar (resolve, fetchImpl, tlsConnect, Ports),
 * die Tests laufen ohne echtes Netz.
 *
 * @module lib/https-pruefung
 */

const tls = require('node:tls');
const net = require('node:net');
const { resolvePublicAddress } = require('./safe-fetch.js');
const logger = require('./logger.js');

const TLS_TIMEOUT_MS = 8000;
const WEITERLEITUNG_TIMEOUT_MS = 8000;
const MAX_WEITERLEITUNGEN = 3;
/** Mehr braucht die Meta-Refresh-Erkennung nicht; der Rest wird verworfen. */
const BODY_LESEGRENZE = 65536;

const USER_AGENT = 'Mozilla/5.0 (compatible; KarriaroAudit/1.0; +https://karriaro-webdesign.de/audit)';

/** Nicht durchgeführte Prüfung — explizit „unbekannt", NICHT „kein HTTPS". */
const HTTPS_UNGEPRUEFT = Object.freeze({
    checked: false, reachable: null, certValidForHost: null, redirectsToHttps: null
});

/**
 * Ordnet einen Fehler beim TLS-Verbindungsaufbau ein.
 *
 * false nur, wenn der Server AKTIV geantwortet hat: Verbindung verweigert,
 * TLS-Alert / Protokollfehler (z. B. Klartext-HTTP auf Port 443 → „wrong
 * version number"). Alles andere — Timeout, Reset, Netz nicht erreichbar,
 * DNS — ist nicht gemessen. ECONNRESET bleibt bewusst null: Middleboxes und
 * Rate-Limits erzeugen ihn auch bei Seiten mit funktionierendem HTTPS.
 *
 * @param {Error & {code?:string}} err
 * @returns {false|null}
 */
function klassifiziereTlsFehler(err) {
    const code = String(err && err.code || '');
    const text = String(err && err.message || '');
    // Server/Middlebox schließt mitten im Handshake — dasselbe Bild wie ein
    // Reset (Rate-Limit, Firewall), kein Beleg für fehlendes HTTPS. Muss VOR
    // der ERR_SSL_-Regel stehen, sonst fiele ERR_SSL_UNEXPECTED_EOF… auf false.
    if (/UNEXPECTED_EOF/i.test(code) || /unexpected eof|socket disconnected before secure/i.test(text)) return null;
    if (code === 'ECONNREFUSED') return false;
    if (code === 'EPROTO' || /^ERR_SSL_/.test(code)) return false;
    if (/\balert\b|wrong version number|handshake failure|unsupported protocol|packet length too long|no protocols available/i.test(text)) return false;
    return null;
}

/** Hostname ohne Klammern (IPv6), ohne Punkt am Ende, klein. */
function normalisiereHost(host) {
    const h = String(host || '').trim().toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
    return h || null;
}

/**
 * Direkter TLS-Handshake auf Port 443.
 *
 * certValidForHost = Kette vertrauenswürdig UND nicht abgelaufen UND gilt für
 * den Hostnamen — also genau das, woran ein Browser abbricht. Node prüft die
 * Identität bei gesetztem servername bereits in `authorized`; der zusätzliche
 * checkServerIdentity-Aufruf macht die Bedingung im Code sichtbar.
 *
 * @param {{host:string, address?:string, port?:number, timeoutMs?:number,
 *          tlsConnect?:Function, tlsOptions?:object}} opts
 * @returns {Promise<{reachable:boolean|null, certValidForHost:boolean|null, grund:string|null}>}
 */
function tlsProbe({ host, address, port = 443, timeoutMs = TLS_TIMEOUT_MS, tlsConnect = tls.connect, tlsOptions = {} } = {}) {
    return new Promise((resolve) => {
        let fertig = false;
        let socket = null;
        const ende = (ergebnis) => {
            if (fertig) return;
            fertig = true;
            clearTimeout(uhr);
            try { if (socket) socket.destroy(); } catch (_) { /* Socket bereits zu */ }
            resolve(ergebnis);
        };
        // Eigene Uhr über den GANZEN Handshake — die socket-timeout-Option misst
        // nur Leerlauf und greift bei einem tröpfelnden Server nie.
        const uhr = setTimeout(() => ende({ reachable: null, certValidForHost: null, grund: 'timeout' }), timeoutMs);

        const optionen = { host: address || host, port, rejectUnauthorized: false, ...tlsOptions };
        // SNI mit einer IP-Adresse ist nach RFC 6066 unzulässig (Node warnt).
        if (!net.isIP(host)) optionen.servername = host;

        try {
            socket = tlsConnect(optionen);
        } catch (err) {
            ende({ reachable: klassifiziereTlsFehler(err), certValidForHost: null, grund: String(err.code || err.message) });
            return;
        }
        socket.once('secureConnect', () => {
            let gueltig = false;
            let grund = null;
            try {
                const cert = socket.getPeerCertificate();
                const leer = !cert || Object.keys(cert).length === 0;
                const identitaet = leer ? new Error('kein Zertifikat') : tls.checkServerIdentity(host, cert);
                gueltig = socket.authorized === true && !identitaet;
                if (!gueltig) grund = String(socket.authorizationError || (identitaet && (identitaet.code || identitaet.message)) || 'nicht vertrauenswürdig');
            } catch (err) {
                gueltig = false;
                grund = String(err.code || err.message);
            }
            ende({ reachable: true, certValidForHost: gueltig, grund });
        });
        // `on` statt `once`: ein zweites 'error' ohne Listener wäre eine
        // unbehandelte Ausnahme und risse die Function-Instanz mit.
        socket.on('error', (err) => {
            ende({ reachable: klassifiziereTlsFehler(err), certValidForHost: null, grund: String(err.code || err.message) });
        });
    });
}

// Weiterleitung per HTML statt per Status: nur Meta-Refresh ist ohne Skript
// sicher. Ein Skript, das vielleicht umleitet, ist KEIN Beleg in eine Richtung.
const RE_META_REFRESH_HTTPS = [
    /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"'>]*url\s*=\s*['"]?https:\/\//i,
    /<meta[^>]+content=["'][^"'>]*url\s*=\s*['"]?https:\/\/[^>]*http-equiv=["']?refresh/i
];
// Direkte Umleitung auf eine https-Adresse bzw. Umschalten des Protokolls.
const RE_SKRIPT_UMLEITUNG_DIREKT = /location(?:\.href)?\s*=\s*["'`]https:|location\.(?:replace|assign)\s*\(\s*["'`]https:|location\.protocol\s*=(?!=)\s*["'`]https/i;
// Protokoll-Abfrage PLUS Navigation (`location.replace("https:" + …)`). Die
// Abfrage allein genügt NICHT: das alte Analytics-Snippet
// (`'https:' == document.location.protocol ? …`) steht auf vielen reinen
// http-Seiten und hätte genau diese Seiten auf „nicht gemessen" gesetzt.
const RE_PROTOKOLL_ABFRAGE = /location\.protocol/i;
const RE_NAVIGATION = /location\.(?:replace|assign)\s*\(|location(?:\.href)?\s*=(?!=)/i;

function hatSkriptUmleitung(html) {
    return RE_SKRIPT_UMLEITUNG_DIREKT.test(html) || (RE_PROTOKOLL_ABFRAGE.test(html) && RE_NAVIGATION.test(html));
}

/** Anfang des Bodys — null, wenn der Body nicht gelesen werden konnte. */
async function liesAnfang(res, maxBytes = BODY_LESEGRENZE) {
    try {
        if (res.body && typeof res.body.getReader === 'function') {
            const reader = res.body.getReader();
            const teile = [];
            let n = 0;
            try {
                while (n < maxBytes) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    teile.push(Buffer.from(value));
                    n += value.length;
                }
            } finally {
                try { await reader.cancel(); } catch (_) { /* Strom bereits zu */ }
            }
            return Buffer.concat(teile).toString('latin1').slice(0, maxBytes);
        }
        if (typeof res.text === 'function') return String(await res.text()).slice(0, maxBytes);
    } catch (_) {
        // Abgebrochener Body (Frist, Reset): ob ein Meta-Refresh darin stand,
        // ist unbekannt → null, der Aufrufer wertet das als „nicht gemessen".
        return null;
    }
    return '';
}

async function verwerfeBody(res) {
    try { if (res.body && typeof res.body.cancel === 'function') await res.body.cancel(); } catch (_) { /* egal */ }
}

/**
 * Leitet http://<host>/ auf https:// weiter?
 *
 * true  — eine Weiterleitungskette (max. 3 Hops, jeder SSRF-validiert) endet
 *         auf https://, oder die http-Seite trägt einen Meta-Refresh auf https://
 * false — http://<host>/ liefert 2xx ohne Weiterleitung
 * null  — nicht gemessen (Netzfehler, 4xx/5xx, Skript-Umleitung, zu viele Hops)
 *
 * @returns {Promise<{redirectsToHttps:boolean|null, grund:string|null}>}
 */
async function pruefeHttpWeiterleitung(host, deps = {}) {
    const {
        resolve = resolvePublicAddress,
        fetchImpl = globalThis.fetch,
        timeoutMs = WEITERLEITUNG_TIMEOUT_MS,
        httpPort = null
    } = deps;
    const h = normalisiereHost(host);
    if (!h) return { redirectsToHttps: null, grund: 'kein Host' };

    const start = new URL('http://platzhalter.invalid/');
    start.hostname = net.isIPv6(h) ? `[${h}]` : h;
    if (httpPort) start.port = String(httpPort);
    let aktuell = start.toString();
    // EINE Uhr für die ganze Kette — sonst summieren sich 4 × 8 s.
    const signal = AbortSignal.timeout(timeoutMs);

    for (let abrufe = 0; ; abrufe++) {
        const u = new URL(aktuell);
        if (u.protocol === 'https:') return { redirectsToHttps: true, grund: null };
        if (u.protocol !== 'http:') return { redirectsToHttps: null, grund: `Protokoll ${u.protocol}` };
        if (abrufe > MAX_WEITERLEITUNGEN) return { redirectsToHttps: null, grund: 'zu viele Weiterleitungen' };

        await resolve(normalisiereHost(u.hostname));   // wirft bei privatem Ziel → Aufrufer: null
        const res = await fetchImpl(aktuell, {
            method: 'GET',
            redirect: 'manual',
            signal,
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'de-DE,de;q=0.9' }
        });

        if (res.status >= 300 && res.status < 400) {
            const ort = res.headers && typeof res.headers.get === 'function' ? res.headers.get('location') : null;
            await verwerfeBody(res);
            if (!ort) return { redirectsToHttps: null, grund: `HTTP ${res.status} ohne Location` };
            aktuell = new URL(ort, aktuell).toString();
            continue;
        }
        if (res.status >= 200 && res.status < 300) {
            const anfang = await liesAnfang(res);
            if (anfang === null) return { redirectsToHttps: null, grund: 'Body nicht lesbar' };
            if (RE_META_REFRESH_HTTPS.some(re => re.test(anfang))) return { redirectsToHttps: true, grund: 'meta-refresh' };
            if (hatSkriptUmleitung(anfang)) return { redirectsToHttps: null, grund: 'Skript-Umleitung nicht messbar' };
            return { redirectsToHttps: false, grund: `HTTP ${res.status} auf http ohne Weiterleitung` };
        }
        // 4xx/5xx auf http: oft eine Bot-Sperre für unseren Abruf, die ein
        // Browser nicht sieht — kein Beleg, dass Besucher auf http bleiben.
        await verwerfeBody(res);
        return { redirectsToHttps: null, grund: `HTTP ${res.status}` };
    }
}

/**
 * Vollständige HTTPS-Prüfung eines Hosts nach V6.
 *
 * @param {string} host  Hostname, auf dem die Seite tatsächlich liegt (finalUrl)
 * @param {object} [deps] resolve, fetchImpl, tlsConnect, tlsOptions, tlsPort,
 *                        httpPort, tlsTimeoutMs, redirectTimeoutMs, log
 * @returns {Promise<{checked:boolean, reachable:boolean|null,
 *                    certValidForHost:boolean|null, redirectsToHttps:boolean|null}>}
 */
async function pruefeHttps(host, deps = {}) {
    const {
        resolve = resolvePublicAddress,
        log = (nachricht, kontext) => logger.info(nachricht, kontext),
        tlsConnect,
        tlsOptions,
        tlsPort = 443,
        tlsTimeoutMs = TLS_TIMEOUT_MS,
        redirectTimeoutMs = WEITERLEITUNG_TIMEOUT_MS
    } = deps;
    const h = normalisiereHost(host);
    if (!h) return { ...HTTPS_UNGEPRUEFT };

    let adresse;
    try {
        adresse = await resolve(h);
    } catch (err) {
        log('https-pruefung: Host nicht prüfbar', { host: h, grund: err.message });
        return { ...HTTPS_UNGEPRUEFT };
    }

    const [tlsErgebnis, weiterleitung] = await Promise.all([
        tlsProbe({ host: h, address: adresse && adresse.address, port: tlsPort, timeoutMs: tlsTimeoutMs, tlsConnect, tlsOptions })
            .catch(err => ({ reachable: null, certValidForHost: null, grund: String(err.code || err.message) })),
        pruefeHttpWeiterleitung(h, { ...deps, resolve, timeoutMs: redirectTimeoutMs })
            .catch(err => ({ redirectsToHttps: null, grund: String(err.name === 'TimeoutError' ? 'timeout' : (err.code || err.message)) }))
    ]);

    if (tlsErgebnis.reachable === null) log('https-pruefung: TLS nicht gemessen', { host: h, grund: tlsErgebnis.grund });
    if (weiterleitung.redirectsToHttps === null) log('https-pruefung: Weiterleitung nicht gemessen', { host: h, grund: weiterleitung.grund });

    const reachable = tlsErgebnis.reachable;
    return {
        checked: reachable !== null || weiterleitung.redirectsToHttps !== null,
        reachable,
        // Ohne Handshake gibt es kein Zertifikat, über das man urteilen könnte.
        certValidForHost: reachable === true ? tlsErgebnis.certValidForHost : null,
        redirectsToHttps: weiterleitung.redirectsToHttps
    };
}

module.exports = {
    pruefeHttps,
    tlsProbe,
    pruefeHttpWeiterleitung,
    klassifiziereTlsFehler,
    normalisiereHost,
    HTTPS_UNGEPRUEFT,
    TLS_TIMEOUT_MS,
    WEITERLEITUNG_TIMEOUT_MS
};
