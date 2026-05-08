/**
 * Security-Audit (Server-Side, CommonJS).
 *
 * Liefert konkrete, sofort kommunizierbare Sicherheits-Findings ueber
 * eine oeffentliche Website. KEIN Active Pen-Testing — nur das, was
 * jeder Browser oder ein Crawler auch sieht.
 *
 * Sieben Pruefkategorien:
 *   1. HTTP-Sicherheits-Header (HSTS, CSP, X-Frame-Options, etc.)
 *   2. TLS/SSL-Quality (Protokoll-Version, Cert-Restlaufzeit)
 *   3. Sensitive-File-Exposure (.git, .env, backup, wp-config.bak, ...)
 *   4. DNS-Sicherheit (DNSSEC, CAA, DMARC, SPF)
 *   5. Cookie-Security (Secure, HttpOnly, SameSite)
 *   6. Outdated-Library-Detection (aus PSI-js-libraries Audit)
 *   7. Mixed Content (aus PSI is-on-https Audit)
 */

const tls = require('tls');

const SENSITIVE_PATHS = [
    '/.git/config',
    '/.git/HEAD',
    '/.env',
    '/.env.local',
    '/.env.production',
    '/backup.sql',
    '/backup.zip',
    '/database.sql',
    '/wp-config.php.bak',
    '/wp-config.bak',
    '/phpinfo.php',
    '/info.php',
    '/.htpasswd'
];

// Aktuelle TLS-Version-Mindesterwartung 2026
const TLS_MIN_OK = 'TLSv1.2';
const TLS_RECOMMENDED = 'TLSv1.3';

// Cert-Restlaufzeit: Schwellen
const CERT_DAYS_CRITICAL = 14;
const CERT_DAYS_WARN = 30;

// Robust gegen self-signed: wir ueberpruefen das, aber rejecten nicht.
const TLS_TIMEOUT_MS = 5000;
const HEAD_TIMEOUT_MS = 6000;
const PROBE_TIMEOUT_MS = 4000;

/**
 * Hauptfunktion. Erwartet { url, psiData? } und gibt
 * { findings[], summary, severityScore, durationMs } zurueck.
 */
async function runSecurityAudit(url, psiData = null) {
    const startMs = Date.now();
    const u = new URL(url);
    const baseOrigin = u.origin;

    const [
        headerResult,
        tlsResult,
        sensitiveFiles,
        dnsResult,
        cookieResult
    ] = await Promise.all([
        checkSecurityHeaders(baseOrigin).catch(e => ({ error: e.message })),
        u.protocol === 'https:' ? checkTls(u.hostname).catch(e => ({ error: e.message })) : Promise.resolve({ error: 'no-https' }),
        probeSensitiveFiles(baseOrigin).catch(e => ({ error: e.message, exposed: [] })),
        checkDns(u.hostname).catch(e => ({ error: e.message })),
        checkCookies(baseOrigin).catch(e => ({ error: e.message }))
    ]);

    const findings = [];

    // ─── 1. Header ───
    if (!headerResult.error) {
        const h = headerResult.headers || {};
        const isHttps = u.protocol === 'https:';
        if (isHttps && !h['strict-transport-security']) {
            findings.push({
                id: 'no-hsts',
                title: 'Kein HSTS-Header',
                category: 'header',
                severity: 4,
                evidence: 'Strict-Transport-Security fehlt. Browser kann zu HTTP downgegradet werden.',
                pitchArg: 'Ohne HSTS-Header kann ein Angreifer im selben WLAN Ihre Besucher auf eine HTTP-Variante umleiten und Daten mitlesen.',
                fixAdvice: 'Header `Strict-Transport-Security: max-age=31536000; includeSubDomains` ergänzen.'
            });
        }
        if (!h['content-security-policy']) {
            findings.push({
                id: 'no-csp',
                title: 'Keine Content-Security-Policy',
                category: 'header',
                severity: 3,
                evidence: 'Header `Content-Security-Policy` nicht gesetzt — XSS-Schutz fehlt.',
                pitchArg: 'Ohne CSP kann eingeschleuster JavaScript-Code Cookies stehlen oder Formulardaten abgreifen.',
                fixAdvice: 'Mindestens `Content-Security-Policy: default-src \'self\'` setzen.'
            });
        }
        if (!h['x-frame-options'] && !/(frame-ancestors)/i.test(h['content-security-policy'] || '')) {
            findings.push({
                id: 'no-x-frame-options',
                title: 'Kein Clickjacking-Schutz',
                category: 'header',
                severity: 3,
                evidence: 'Weder `X-Frame-Options` noch CSP `frame-ancestors` gesetzt.',
                pitchArg: 'Ihre Seite kann in einen iFrame eingebettet werden — Phishing-Risiko.',
                fixAdvice: '`X-Frame-Options: SAMEORIGIN` oder CSP `frame-ancestors \'self\'`.'
            });
        }
        if (!h['x-content-type-options']) {
            findings.push({
                id: 'no-x-content-type',
                title: 'MIME-Sniffing nicht deaktiviert',
                category: 'header',
                severity: 2,
                evidence: '`X-Content-Type-Options: nosniff` fehlt.',
                pitchArg: 'Browser können Datei-Typen falsch interpretieren — kleines XSS-Risiko bei User-Uploads.',
                fixAdvice: '`X-Content-Type-Options: nosniff` setzen.'
            });
        }
        if (!h['referrer-policy']) {
            findings.push({
                id: 'no-referrer-policy',
                title: 'Keine Referrer-Policy',
                category: 'header',
                severity: 2,
                evidence: '`Referrer-Policy` nicht gesetzt — Referrer-URLs leaken an Drittseiten.',
                pitchArg: 'Wenn Besucher von Ihrer Site auf andere Sites klicken, wird der volle URL inkl. Pfad weitergegeben — DSGVO-relevant.',
                fixAdvice: '`Referrer-Policy: strict-origin-when-cross-origin` setzen.'
            });
        }
        if (!h['permissions-policy']) {
            findings.push({
                id: 'no-permissions-policy',
                title: 'Keine Permissions-Policy',
                category: 'header',
                severity: 1,
                evidence: '`Permissions-Policy` nicht gesetzt.',
                pitchArg: 'Eingebettete Drittanbieter (z.B. iFrames) können auf Kamera/Mikrofon/Standort zugreifen.',
                fixAdvice: '`Permissions-Policy: camera=(), microphone=(), geolocation=()` einschränken.'
            });
        }
        if (h['server']) {
            findings.push({
                id: 'server-header-exposed',
                title: 'Server-Software preisgegeben',
                category: 'header',
                severity: 1,
                evidence: `Header verraet: \`Server: ${h['server']}\``,
                pitchArg: `Ihr Server gibt sich als "${h['server']}" zu erkennen — Angreifer wissen sofort, welche Schwachstellen sie ausnutzen können.`,
                fixAdvice: 'Server-Header in der Webserver-Config entfernen.'
            });
        }
        if (h['x-powered-by']) {
            findings.push({
                id: 'x-powered-by-exposed',
                title: 'Tech-Stack preisgegeben',
                category: 'header',
                severity: 1,
                evidence: `Header verraet: \`X-Powered-By: ${h['x-powered-by']}\``,
                pitchArg: `Ihr Server verrät PHP-/Framework-Version öffentlich — gezielte Exploit-Suche wird einfach.`,
                fixAdvice: '`expose_php = Off` in php.ini bzw. Framework-Config.'
            });
        }
    }

    // ─── 2. TLS ───
    if (!tlsResult.error) {
        const proto = tlsResult.protocol;
        const days = tlsResult.daysRemaining;
        if (proto && tlsVersionRank(proto) < tlsVersionRank(TLS_MIN_OK)) {
            findings.push({
                id: 'tls-outdated',
                title: `Veraltete TLS-Version: ${proto}`,
                category: 'tls',
                severity: 5,
                evidence: `Server akzeptiert ${proto}. Mindestempfehlung 2026: ${TLS_MIN_OK}.`,
                pitchArg: `Ihre Website akzeptiert ${proto} — eine veraltete Verschlüsselung mit dokumentierten Schwachstellen. PCI-DSS-Compliance verletzt.`,
                fixAdvice: 'TLS 1.2 als Minimum, TLS 1.3 empfohlen. Alte Versionen serverseitig deaktivieren.'
            });
        }
        if (typeof days === 'number') {
            if (days < 0) {
                findings.push({
                    id: 'cert-expired',
                    title: 'SSL-Zertifikat ist abgelaufen',
                    category: 'tls',
                    severity: 5,
                    evidence: `Cert-valid-to: ${tlsResult.validTo}`,
                    pitchArg: `Ihr SSL-Zertifikat ist abgelaufen. Besucher sehen die Warnung "Verbindung nicht sicher".`,
                    fixAdvice: 'Zertifikat sofort erneuern (Let\'s Encrypt + Auto-Renew empfohlen).'
                });
            } else if (days < CERT_DAYS_CRITICAL) {
                findings.push({
                    id: 'cert-expires-soon',
                    title: `Zertifikat läuft in ${days} Tagen ab`,
                    category: 'tls',
                    severity: 4,
                    evidence: `Cert-valid-to: ${tlsResult.validTo}`,
                    pitchArg: `Ihr SSL-Zertifikat läuft in ${days} Tagen ab. Wenn es expired, sehen Kunden eine rote Warnung.`,
                    fixAdvice: 'Auto-Renew einrichten (Let\'s Encrypt) oder vor Ablauf manuell erneuern.'
                });
            } else if (days < CERT_DAYS_WARN) {
                findings.push({
                    id: 'cert-expires-warn',
                    title: `Zertifikat läuft in ${days} Tagen ab`,
                    category: 'tls',
                    severity: 2,
                    evidence: `Cert-valid-to: ${tlsResult.validTo}`,
                    pitchArg: null,
                    fixAdvice: 'Auto-Renew prüfen.'
                });
            }
        }
        if (tlsResult.selfSigned) {
            findings.push({
                id: 'cert-self-signed',
                title: 'Self-signed Zertifikat',
                category: 'tls',
                severity: 5,
                evidence: 'Cert-Issuer = Cert-Subject',
                pitchArg: 'Ihr SSL-Zertifikat ist selbst signiert — Browser zeigen sofort eine harte Sicherheitswarnung.',
                fixAdvice: 'Auf Let\'s Encrypt umstellen (kostenlos, akzeptiert von allen Browsern).'
            });
        }
    } else if (tlsResult.error === 'no-https') {
        findings.push({
            id: 'no-https',
            title: 'Kein HTTPS aktiviert',
            category: 'tls',
            severity: 5,
            evidence: 'Site läuft auf HTTP statt HTTPS.',
            pitchArg: 'Browser markieren Ihre Site als "Nicht sicher". Google rankt Sie schlechter, Kunden vertrauen nicht.',
            fixAdvice: 'Let\'s Encrypt einrichten + alle HTTP→HTTPS-Redirects.'
        });
    }

    // ─── 3. Sensitive Files ───
    if (sensitiveFiles?.exposed?.length > 0) {
        for (const f of sensitiveFiles.exposed) {
            findings.push({
                id: `exposed-${f.path.replace(/[^a-z0-9]/gi, '_')}`,
                title: `Öffentlich erreichbar: ${f.path}`,
                category: 'exposure',
                severity: severityForExposedFile(f.path),
                evidence: `HTTP ${f.status}, Content-Length ${f.size || '?'}`,
                pitchArg: pitchForExposedFile(f.path),
                fixAdvice: fixForExposedFile(f.path)
            });
        }
    }

    // ─── 4. DNS ───
    if (!dnsResult.error) {
        if (!dnsResult.dnssec) {
            findings.push({
                id: 'no-dnssec',
                title: 'DNSSEC inaktiv',
                category: 'dns',
                severity: 2,
                evidence: 'Keine DS-Records auf Domain-Ebene.',
                pitchArg: 'Ohne DNSSEC kann ein Angreifer DNS-Antworten fälschen und Besucher auf eine Phishing-Kopie Ihrer Site umleiten.',
                fixAdvice: 'DNSSEC beim Domain-Registrar aktivieren (oft 1-Klick).'
            });
        }
        if (!dnsResult.caa) {
            findings.push({
                id: 'no-caa',
                title: 'Keine CAA-Records',
                category: 'dns',
                severity: 1,
                evidence: 'Keine CAA-Records — jede CA darf Cert für Ihre Domain ausstellen.',
                pitchArg: null,
                fixAdvice: 'CAA-Record setzen, der nur Ihre genutzte CA (z.B. Let\'s Encrypt) erlaubt.'
            });
        }
        if (!dnsResult.spf) {
            findings.push({
                id: 'no-spf',
                title: 'Kein SPF-Record',
                category: 'dns',
                severity: 3,
                evidence: 'Kein TXT-Record mit `v=spf1` gefunden.',
                pitchArg: 'Ohne SPF kann jeder beliebige E-Mails in Ihrem Namen versenden — Phishing-Risiko für Ihre Kunden.',
                fixAdvice: 'TXT-Record mit `v=spf1 include:_spf.<provider> ~all` setzen.'
            });
        }
        if (!dnsResult.dmarc) {
            findings.push({
                id: 'no-dmarc',
                title: 'Kein DMARC-Record',
                category: 'dns',
                severity: 3,
                evidence: 'Kein _dmarc-TXT-Record gefunden.',
                pitchArg: 'DMARC fehlt — Mail-Server lehnen Phishing-Mails in Ihrem Namen nicht zuverlässig ab.',
                fixAdvice: '_dmarc.<domain> TXT-Record mit `v=DMARC1; p=quarantine; rua=mailto:...` setzen.'
            });
        }
    }

    // ─── 5. Cookies ───
    if (cookieResult.cookies && cookieResult.cookies.length > 0) {
        const insecure = cookieResult.cookies.filter(c => !c.secure || !c.httpOnly);
        if (insecure.length > 0) {
            findings.push({
                id: 'insecure-cookies',
                title: `${insecure.length} Cookie(s) ohne Secure/HttpOnly`,
                category: 'cookies',
                severity: 2,
                evidence: insecure.map(c => `${c.name} (${[!c.secure && 'no Secure', !c.httpOnly && 'no HttpOnly'].filter(Boolean).join(', ')})`).slice(0, 3).join('; '),
                pitchArg: 'Ihre Session-Cookies sind nicht ausreichend geschützt — XSS-Lücken können Login-Sessions stehlen.',
                fixAdvice: 'Alle Cookies mit `Secure; HttpOnly; SameSite=Lax` versehen.'
            });
        }
    }

    // ─── 6. Outdated Libraries (aus PSI) ───
    const libFindings = extractOutdatedLibraries(psiData);
    findings.push(...libFindings);

    // ─── 7. Mixed Content (aus PSI) ───
    const mixedFindings = extractMixedContent(psiData);
    findings.push(...mixedFindings);

    // Sortieren + zusammenfassen
    findings.sort((a, b) => (b.severity || 0) - (a.severity || 0));
    const counts = {
        critical: findings.filter(f => f.severity >= 5).length,
        high: findings.filter(f => f.severity === 4).length,
        medium: findings.filter(f => f.severity === 3).length,
        low: findings.filter(f => f.severity <= 2).length
    };
    const severityScore = Math.min(100,
        counts.critical * 25 + counts.high * 12 + counts.medium * 5 + counts.low * 1
    );

    return {
        findings,
        summary: {
            total: findings.length,
            ...counts,
            topPitch: findings.find(f => f.pitchArg)?.pitchArg || null,
            topFinding: findings[0] || null,
            verdict: severityScore >= 60 ? 'kritisch'
                : severityScore >= 35 ? 'hoch'
                : severityScore >= 15 ? 'mittel'
                : severityScore > 0 ? 'niedrig' : 'sauber'
        },
        severityScore,
        durationMs: Date.now() - startMs,
        meta: {
            url,
            domain: u.hostname.replace(/^www\./, ''),
            tlsAvailable: !tlsResult.error,
            headerAvailable: !headerResult.error,
            dnsAvailable: !dnsResult.error,
            cookieAvailable: !cookieResult.error,
            sensitiveFilesProbed: SENSITIVE_PATHS.length
        }
    };
}

// ──────────────── Helpers ────────────────

async function checkSecurityHeaders(origin) {
    const res = await fetch(origin + '/', {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
        headers: { 'User-Agent': 'Karriaro-SecurityBot/1.0' }
    });
    const headers = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return { status: res.status, headers };
}

function checkTls(hostname) {
    return new Promise((resolve) => {
        const socket = tls.connect({
            host: hostname,
            port: 443,
            servername: hostname,
            rejectUnauthorized: false,
            timeout: TLS_TIMEOUT_MS
        }, () => {
            try {
                const cert = socket.getPeerCertificate(true);
                const protocol = socket.getProtocol();
                socket.end();
                if (!cert || !cert.valid_to) { resolve({ error: 'no-cert' }); return; }
                const validTo = new Date(cert.valid_to);
                const validFrom = new Date(cert.valid_from);
                const daysRemaining = Math.round((validTo.getTime() - Date.now()) / 86400000);
                const issuerCN = cert.issuer?.CN || '';
                const subjectCN = cert.subject?.CN || '';
                const selfSigned = issuerCN === subjectCN && issuerCN !== '';
                resolve({
                    protocol,
                    validFrom: validFrom.toISOString(),
                    validTo: validTo.toISOString(),
                    daysRemaining,
                    issuer: issuerCN,
                    subject: subjectCN,
                    selfSigned
                });
            } catch (e) {
                socket.destroy();
                resolve({ error: e.message });
            }
        });
        socket.on('error', err => resolve({ error: err.message }));
        socket.on('timeout', () => { socket.destroy(); resolve({ error: 'timeout' }); });
    });
}

function tlsVersionRank(proto) {
    if (!proto) return 0;
    if (proto.startsWith('TLSv1.3')) return 13;
    if (proto.startsWith('TLSv1.2')) return 12;
    if (proto.startsWith('TLSv1.1')) return 11;
    if (proto.startsWith('TLSv1.0') || proto === 'TLSv1') return 10;
    if (proto.startsWith('SSLv')) return 5;
    return 0;
}

async function probeSensitiveFiles(origin) {
    const exposed = [];
    const probes = SENSITIVE_PATHS.map(async (path) => {
        try {
            const res = await fetch(origin + path, {
                method: 'GET',
                redirect: 'manual',
                signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
                headers: { 'User-Agent': 'Karriaro-SecurityBot/1.0' }
            });
            // 200 mit non-empty Body = exposed
            // 301/302/403/404 = ok (nicht exposed)
            if (res.status === 200) {
                const text = await res.text();
                const size = text.length;
                // Mindestlaenge, um leere "200 OK"-Antworten auszufiltern
                if (size > 16 && !looksLikeHomepage(text)) {
                    exposed.push({ path, status: res.status, size });
                }
            }
        } catch {
            // Timeout/Error → behandeln als nicht exposed
        }
    });
    await Promise.all(probes);
    return { exposed };
}

function looksLikeHomepage(text) {
    // Wenn die Site auf 200 mit ihrer Homepage antwortet (z.B. SPA-Catch-All),
    // ist das KEIN Exposed-File-Befund.
    return /<!doctype html|<html[\s>]|<body|<head/i.test(text.slice(0, 500));
}

function severityForExposedFile(path) {
    if (/\.git/.test(path) || /\.env/.test(path) || /backup|database/.test(path)) return 5;
    if (/wp-config|\.htpasswd/.test(path)) return 5;
    if (/phpinfo|info\.php/.test(path)) return 4;
    return 3;
}

function pitchForExposedFile(path) {
    if (path.includes('.git')) return `Ihr kompletter Quellcode-Verlauf ist über \`${path}\` öffentlich abrufbar. Ein Angreifer hat Ihren gesamten Code inklusive aller alten Commits in 30 Sekunden — möglicherweise mit Datenbank-Passwörtern aus früheren Versionen.`;
    if (path.includes('.env')) return `Ihre Konfigurationsdatei \`${path}\` ist öffentlich. Sie enthält typischerweise API-Keys, Datenbank-Passwörter und Stripe/Mail-Credentials.`;
    if (/backup|database\.sql|\.sql/.test(path)) return `Ein Datenbank-Backup unter \`${path}\` ist öffentlich. Kundendaten, Passwort-Hashes — alles abrufbar.`;
    if (/wp-config/.test(path)) return `Ihre WordPress-Config-Datei (Backup-Version) ist über \`${path}\` öffentlich. Datenbank-Zugangsdaten lesbar.`;
    if (/phpinfo|info\.php/.test(path)) return `\`${path}\` zeigt Server-, PHP- und Modul-Versionen — gezielte Exploit-Suche wird trivial.`;
    return `Datei \`${path}\` ist öffentlich erreichbar. Solche Pfade sollten nicht von außen lesbar sein.`;
}

function fixForExposedFile(path) {
    if (path.includes('.git')) return 'Webserver-Config (Apache/Nginx): `.git` blockieren, oder lokal löschen falls produktiv-deployed.';
    if (path.includes('.env')) return 'Datei aus Webroot entfernen, in `.gitignore` setzen, Credentials rotieren.';
    if (/\.sql/.test(path)) return 'Backup aus Webroot entfernen, in geschützten Pfad legen, ggf. Credentials rotieren.';
    if (/wp-config/.test(path)) return 'Backup-Datei löschen. WordPress-Datenbank-Passwort sofort ändern.';
    return 'Datei aus Webroot entfernen oder serverseitig blockieren.';
}

async function checkDns(hostname) {
    const apex = hostname.split('.').slice(-2).join('.');
    const [ds, caa, spf, dmarc] = await Promise.all([
        dnsLookup(apex, 'DS'),
        dnsLookup(apex, 'CAA'),
        dnsLookup(apex, 'TXT'),
        dnsLookup('_dmarc.' + apex, 'TXT')
    ]);
    return {
        dnssec: hasDnsAnswers(ds),
        caa: hasDnsAnswers(caa),
        spf: hasDnsAnswers(spf) && (spf.Answer || []).some(a => /v=spf1/i.test(a.data || '')),
        dmarc: hasDnsAnswers(dmarc) && (dmarc.Answer || []).some(a => /v=DMARC1/i.test(a.data || ''))
    };
}

function hasDnsAnswers(r) {
    return !!(r && Array.isArray(r.Answer) && r.Answer.length > 0);
}

async function dnsLookup(name, type) {
    try {
        const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, {
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function checkCookies(origin) {
    const res = await fetch(origin + '/', {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
        headers: { 'User-Agent': 'Karriaro-SecurityBot/1.0' }
    });
    // fetch konsolidiert Set-Cookie nicht in res.headers — wir nutzen getSetCookie wenn verfuegbar
    let cookies = [];
    if (typeof res.headers.getSetCookie === 'function') {
        cookies = res.headers.getSetCookie();
    } else {
        const raw = res.headers.get('set-cookie');
        if (raw) cookies = raw.split(/,(?=\s*[A-Za-z_-]+=)/);
    }
    const parsed = cookies.map(c => {
        const parts = c.split(';').map(s => s.trim());
        const [name] = parts[0].split('=');
        const flags = new Set(parts.slice(1).map(p => p.toLowerCase().split('=')[0]));
        return {
            name,
            secure: flags.has('secure'),
            httpOnly: flags.has('httponly'),
            sameSite: parts.find(p => /samesite/i.test(p))?.split('=')[1] || null
        };
    });
    return { cookies: parsed };
}

function extractOutdatedLibraries(psiData) {
    const findings = [];
    const audit = psiData?.lighthouseResult?.audits?.['js-libraries'];
    const items = audit?.details?.items || [];
    for (const item of items) {
        const name = item.name;
        const version = item.version;
        // Lighthouse markiert vulnerable mit npmPkgName + version + bewertung im score=0
        if (item.subItems?.items?.length > 0) {
            for (const sub of item.subItems.items) {
                if (sub.severity || sub.vulnCount) {
                    findings.push({
                        id: `lib-${(name || 'lib').toLowerCase().replace(/\s+/g, '-')}-${version}`,
                        title: `Veraltete Bibliothek: ${name} ${version}`,
                        category: 'library',
                        severity: 3,
                        evidence: `${name} ${version} mit ${sub.vulnCount || '?'} bekannten Lücken (Lighthouse-Audit).`,
                        pitchArg: `Ihre Site nutzt ${name} ${version} — eine veraltete JavaScript-Bibliothek mit dokumentierten Sicherheitslücken.`,
                        fixAdvice: `Auf aktuelle ${name}-Version updaten oder ersetzen.`
                    });
                }
            }
        }
    }
    // Manuell: jQuery <3, Bootstrap <4
    for (const item of items) {
        const name = String(item.name || '').toLowerCase();
        const version = String(item.version || '');
        if (name === 'jquery' && /^[12]\./.test(version)) {
            if (!findings.some(f => f.id.startsWith('lib-jquery-'))) {
                findings.push({
                    id: `lib-jquery-${version}`,
                    title: `Veraltete jQuery-Version: ${version}`,
                    category: 'library',
                    severity: 3,
                    evidence: `jQuery ${version} ist seit 2020 nicht mehr empfohlen — XSS-Lücken bekannt.`,
                    pitchArg: `Ihre Site läuft auf jQuery ${version}. Diese Version hat dokumentierte XSS-Sicherheitslücken.`,
                    fixAdvice: 'Auf jQuery 3.7+ aktualisieren oder durch Vanilla-JS ersetzen.'
                });
            }
        }
    }
    return findings;
}

function extractMixedContent(psiData) {
    const findings = [];
    const audit = psiData?.lighthouseResult?.audits?.['is-on-https'];
    if (audit && audit.score === 0 && audit.details?.items?.length > 0) {
        const count = audit.details.items.length;
        findings.push({
            id: 'mixed-content',
            title: `Mixed Content: ${count} unsichere Resource(n)`,
            category: 'header',
            severity: 3,
            evidence: `${count} HTTP-Resource(n) auf HTTPS-Seite — Browser blockiert oder warnt.`,
            pitchArg: `Ihre Seite lädt ${count} Resource(n) über unverschlüsseltes HTTP — Browser zeigen ein "nicht sicher"-Schloss.`,
            fixAdvice: 'Alle Resource-URLs (Bilder, Skripte, CSS) auf https:// umstellen oder protokoll-relativ.'
        });
    }
    return findings;
}

module.exports = {
    runSecurityAudit,
    // exports fuer Tests
    tlsVersionRank,
    severityForExposedFile,
    pitchForExposedFile,
    SENSITIVE_PATHS
};
