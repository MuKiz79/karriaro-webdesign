/**
 * SSRF-sicherer fetch()-Wrapper.
 *
 * Schuetzt quickAudit/requestAudit/deepResearch davor, dass ein Angreifer
 * via User-URL interne Targets erreicht (Loopback, RFC1918, Link-Local
 * inkl. AWS-Metadata 169.254.169.254, IPv6-Loopback, etc.).
 *
 * Validiert Protokoll + DNS-resolvte IP vor jedem Hop, folgt Redirects
 * manuell mit max. 3 Hops, prueft jeden neuen Host wieder.
 */

const dns = require('node:dns').promises;
const net = require('node:net');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const MAX_REDIRECTS = 3;

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true;                              // 0.0.0.0/8
    if (a === 10) return true;                             // 10.0.0.0/8
    if (a === 127) return true;                            // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;               // 169.254.0.0/16 link-local (AWS-Metadata!)
    if (a === 172 && b >= 16 && b <= 31) return true;      // 172.16.0.0/12
    if (a === 192 && b === 168) return true;               // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;     // 100.64.0.0/10 CGNAT
    if (a >= 224) return true;                             // multicast + reserved
    return false;
}

function isPrivateIPv6(ip) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::' || norm === '::0') return true;
    if (norm.startsWith('fc') || norm.startsWith('fd')) return true;  // unique-local
    if (norm.startsWith('fe80:')) return true;                        // link-local
    if (norm.startsWith('ff')) return true;                           // multicast
    const m = norm.match(/^::ffff:([0-9a-f.:]+)$/);
    if (m && net.isIPv4(m[1])) return isPrivateIPv4(m[1]);
    return false;
}

async function assertPublicHost(hostname) {
    if (!hostname) throw new Error('SSRF blocked: empty hostname');
    if (net.isIPv4(hostname)) {
        if (isPrivateIPv4(hostname)) throw new Error(`SSRF blocked: private IPv4 ${hostname}`);
        return;
    }
    if (net.isIPv6(hostname)) {
        if (isPrivateIPv6(hostname)) throw new Error(`SSRF blocked: private IPv6 ${hostname}`);
        return;
    }
    let records;
    try {
        records = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch (_err) {
        throw new Error(`SSRF blocked: DNS resolution failed for ${hostname}`);
    }
    for (const r of records) {
        if (r.family === 4 && isPrivateIPv4(r.address)) {
            throw new Error(`SSRF blocked: ${hostname} resolves to private IPv4 ${r.address}`);
        }
        if (r.family === 6 && isPrivateIPv6(r.address)) {
            throw new Error(`SSRF blocked: ${hostname} resolves to private IPv6 ${r.address}`);
        }
    }
}

/**
 * Drop-in fuer fetch() mit SSRF-Guard + manuellem Redirect-Follow.
 * @param {string} url
 * @param {(RequestInit & { timeoutMs?: number })} [options]
 */
async function safeFetch(url, options = {}) {
    const { timeoutMs = 8000, signal: externalSignal, ...rest } = options;
    let currentUrl = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let parsed;
        try { parsed = new URL(currentUrl); }
        catch { throw new Error(`SSRF blocked: invalid URL ${currentUrl}`); }
        if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
            throw new Error(`SSRF blocked: protocol ${parsed.protocol} not allowed`);
        }
        await assertPublicHost(parsed.hostname);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const signal = externalSignal || controller.signal;

        let response;
        try {
            response = await fetch(currentUrl, { ...rest, redirect: 'manual', signal });
        } finally {
            clearTimeout(timer);
        }

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) return response;
            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }
        return response;
    }
    throw new Error('SSRF blocked: too many redirects');
}

module.exports = { safeFetch, assertPublicHost, isPrivateIPv4, isPrivateIPv6 };
