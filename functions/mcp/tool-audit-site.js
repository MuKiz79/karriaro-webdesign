/**
 * MCP-Tool karriaro_audit_site
 * Wrappt runLightAudit (Sprint 169).
 */

const { runLightAudit } = require('../lib/light-audit.js');
const { header, withSignature } = require('./branding.js');
const { fetchLighthouseScore } = require('./lighthouse-score-fetch.js');

const DEFINITION = {
    name: 'karriaro_audit_site',
    description:
        'Prüft eine Website auf Substanz, BFSG-Konformität, SEO, ' +
        'KI-Auffindbarkeit und Branchen-Standards. Liefert qualitatives ' +
        'Verdict + Top-Findings im Karriaro-Editorial-Stil. ' +
        'Latenz 3-5 s (Cache-Hit < 500 ms). Returniert reinen Text.',
    inputSchema: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'Vollständige URL der zu prüfenden Site (z.B. https://example.de)'
            }
        },
        required: ['url']
    }
};

function normalizeUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
        var u = new URL(s);
        return u.origin + u.pathname.replace(/\/$/, '');
    } catch (e) { return null; }
}

function scoreLabel(score) {
    // Sprint 171 — Skala härter geeicht (war 80/55). Verdient eine ehrlichere
    // Bewertung: "Stark" ist eine Aussage, kein Trostpreis.
    if (typeof score !== 'number') return ['Auf den ersten Blick', 'Eine Tiefenmessung folgt im Detail-Brief.'];
    if (score >= 90) return ['Stark', 'Substanz auf der Höhe der Manufaktur-Klasse.'];
    if (score >= 70) return ['Solide', 'Tragfähige Basis, mit feinen Hebeln im Detail.'];
    return ['Ausbaufähig', 'Die Substanz trägt, der Auftritt verdient mehr.'];
}

function deriveCompositeScore(result) {
    if (!result) return null;
    var parts = [];
    if (result.bfsg && typeof result.bfsg.complianceScore === 'number') parts.push(result.bfsg.complianceScore);
    if (result.painPoints && typeof result.painPoints === 'object') {
        var keys = Object.keys(result.painPoints);
        if (keys.length) {
            var ok = 0;
            keys.forEach(function (k) { if (result.painPoints[k] && result.painPoints[k].ok === true) ok++; });
            parts.push(Math.round(ok / keys.length * 100));
        }
    }
    if (result.seoGeo) {
        if (result.seoGeo.seo && result.seoGeo.seo.total) {
            parts.push(Math.round(result.seoGeo.seo.found / result.seoGeo.seo.total * 100));
        }
        if (result.seoGeo.geo && result.seoGeo.geo.total) {
            parts.push(Math.round(result.seoGeo.geo.found / result.seoGeo.geo.total * 100));
        }
    }
    if (result.branch && typeof result.branch.foundCount === 'number' && result.branch.totalCount) {
        parts.push(Math.round(result.branch.foundCount / result.branch.totalCount * 100));
    }
    if (!parts.length) return null;
    return Math.round(parts.reduce(function (a, b) { return a + b; }, 0) / parts.length);
}

function pickFindings(result) {
    var pool = [];
    if (result && result.painPoints && typeof result.painPoints === 'object') {
        Object.keys(result.painPoints).forEach(function (k) {
            var it = result.painPoints[k];
            if (it && it.ok === false && it.label) pool.push(String(it.label));
        });
    }
    if (result && result.bfsg && typeof result.bfsg.complianceScore === 'number' && result.bfsg.complianceScore < 80) {
        pool.push('BFSG-Konformität mit Lücken (Pflicht-Signale unvollständig).');
    }
    if (result && result.seoGeo) {
        var sg = result.seoGeo;
        if (sg.seo && sg.seo.total && sg.seo.found / sg.seo.total < 0.7) {
            pool.push('SEO-Signale unvollständig (' + sg.seo.found + ' von ' + sg.seo.total + ' Pflicht-Elementen vorhanden).');
        }
        if (sg.geo && sg.geo.total && sg.geo.found / sg.geo.total < 0.7) {
            pool.push('KI-Auffindbarkeit dünn (FAQ-Schema, Breadcrumb, llms.txt fehlen teilweise).');
        }
    }
    if (result && result.branch && typeof result.branch.foundCount === 'number') {
        var missing = (result.branch.totalCount || 0) - result.branch.foundCount;
        if (missing > 0) {
            pool.push('Branchen-Standards: ' + missing + ' von ' + result.branch.totalCount + ' fehlen (' + (result.branch.name || 'allgemein') + ').');
        }
    }
    var seen = {}, out = [];
    pool.forEach(function (p) {
        var key = p.toLowerCase().slice(0, 80);
        if (seen[key]) return;
        seen[key] = true;
        out.push(p);
    });
    if (!out.length) out.push('Substanziell solide — die feineren Hebel zeigen wir im Detail-Brief.');
    return out.slice(0, 3);
}

function formatResult(domain, result, lighthouseScore) {
    if (result && result.degraded === true) {
        return withSignature(header('Karriaro · Erste Einschätzung') +
            '\n\nDomain:    ' + domain +
            '\nStatus:    nicht abrufbar' +
            '\n\nWir konnten ' + domain + ' nicht erreichen.' +
            '\nMögliche Gründe: Schreibfehler, vorübergehender Ausfall, ' +
            'Blockierung von Bot-Zugriffen.' +
            '\n\nBitte Schreibweise prüfen und erneut versuchen.');
    }
    var score = deriveCompositeScore(result);
    var verdict = scoreLabel(score);
    var findings = pickFindings(result);
    var lines = [
        header('Karriaro · Erste Einschätzung'),
        '',
        'Domain:    ' + domain,
        'Verdict:   ' + verdict[0] + (typeof score === 'number' ? ' (Score ' + score + '/100)' : ''),
        '           ' + verdict[1],
        ''
    ];
    if (result && result.branch && result.branch.name) {
        lines.push('Branche:   ' + result.branch.name);
        lines.push('');
    }
    // Sprint 170 — Lighthouse-Public-Score (Multi-Dimensions-Profil)
    if (lighthouseScore && Array.isArray(lighthouseScore.dimensions) && lighthouseScore.dimensions.length) {
        lines.push('LIGHTHOUSE-PROFIL');
        lighthouseScore.dimensions.forEach(function (d) {
            if (!d || typeof d.name !== 'string') return;
            var label = String(d.name).charAt(0).toUpperCase() + String(d.name).slice(1);
            var scoreStr = typeof d.score === 'number' ? d.score + '/25' : '–';
            lines.push('  ' + label.padEnd(14) + scoreStr);
        });
        if (typeof lighthouseScore.totalScore === 'number') {
            lines.push('  ' + 'Gesamt'.padEnd(14) + lighthouseScore.totalScore + '/100');
        }
        lines.push('  (gemessen von Karriaro Lighthouse · lighthouse.karriaro.de)');
        lines.push('');
    }
    lines.push('TOP-FINDINGS');
    findings.forEach(function (f, i) {
        lines.push((i + 1) + '. ' + f);
    });
    lines.push('');
    lines.push('Ein Detail-Brief geht tiefer: Web Vitals im Detail,');
    lines.push('BFSG-Audit, branchen-spezifische Empfehlungen.');
    lines.push('Anfrage: https://karriaro-webdesign.de/?prefill=' + encodeURIComponent('https://' + domain) + '#kontakt');
    // Sprint 173 — Trust-Iteration. Self-Audit verweist auf EXTERN nachprüfbare
    // Quellen statt Selbstaussagen (Verifizierbarkeit > Bekenntnis). Ersetzt den
    // Sprint-171-Block, den ein Review als selbstreferenzielle Marketing-
    // Botschaft markiert hatte.
    if (typeof domain === 'string' && domain.toLowerCase().indexOf('karriaro-webdesign') !== -1) {
        lines.push('');
        lines.push('ZUR EHRLICHKEIT — PRÜFEN SIE UNS NACH');
        lines.push('Wir behaupten nichts, was Sie nicht selbst nachmessen können.');
        lines.push('Drei unabhängige Stellen:');
        lines.push('  ' + 'Security-Header'.padEnd(18) + 'https://securityheaders.com/?q=karriaro-webdesign.de');
        lines.push('  ' + 'Sicherheitsprofil'.padEnd(18) + 'https://developer.mozilla.org/en-US/observatory/analyze?host=karriaro-webdesign.de');
        lines.push('  ' + 'Quelltext & Trail'.padEnd(18) + 'https://github.com/MuKiz79/karriaro-webdesign/commits/main');
        lines.push('Eine Manufaktur, die andere prüft, gehört selbst auf den Prüfstand.');
    }
    return withSignature(lines.join('\n'));
}

async function execute(args, ctx) {
    var auditUrl = normalizeUrl(args && args.url);
    if (!auditUrl) {
        throw new Error('Ungültige URL. Erwartet Format wie https://example.de');
    }
    var domain;
    try { domain = new URL(auditUrl).hostname.replace(/^www\./, ''); }
    catch (e) { throw new Error('Ungültige URL.'); }

    var placesKey = ctx && ctx.placesKey ? ctx.placesKey : '';
    // Sprint 170 — Lighthouse-Score parallel anfragen (4s-Timeout intern).
    // Bei Erfolg wird Multi-Dim-Profil ins Output gemerged, bei Fehler null.
    var auditPromise = runLightAudit(auditUrl, placesKey).catch(function (err) {
        var lower = String(err.message || '').toLowerCase();
        var isUnreachable = lower.includes('http ') || lower.includes('abort') ||
            lower.includes('fetch') || lower.includes('ssrf');
        return {
            ok: true,
            degraded: true,
            domain: domain,
            error: isUnreachable
                ? 'Wir konnten Ihre Seite gerade nicht erreichen.'
                : 'Wir konnten Ihre Seite gerade nicht analysieren.'
        };
    });
    var lighthousePromise = fetchLighthouseScore(auditUrl);
    var both = await Promise.all([auditPromise, lighthousePromise]);
    return formatResult(domain, both[0], both[1]);
}

module.exports = { DEFINITION, execute };
