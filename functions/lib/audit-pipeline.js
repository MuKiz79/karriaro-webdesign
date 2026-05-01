/**
 * Audit-Light-Pipeline (Server-Side, CommonJS).
 *
 * Portiert die wichtigsten Module aus lead-intelligence/src/ als reine
 * Funktionen, damit die Cloud Function `requestAudit` direkt einen Audit
 * berechnen kann. Single source of truth bleibt der Browser-Tool-Code —
 * dieser Port wird bei Logik-Änderungen manuell synchronisiert.
 *
 * Bewusst minimal: nur PageSpeed + Tech-Detect + Wayback + Tech-Age + BFSG.
 * Konkurrenz-Lookup separat (braucht Places-API und ist optional).
 */

// ─────────── tech-detect (Port aus signals/tech-detect.js) ───────────

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
    { match: /strato\.de/i, cms: 'Strato Homepage-Baukasten', baukasten: true }
];
const BAUKASTEN_SUBDOMAIN = /\.jimdosite\.com|\.jimdo\.com|\.wixsite\.com|\.weebly\.com|\.webflow\.io/;

function detectTech(psiData) {
    const lh = psiData?.lighthouseResult || {};
    const result = { cms: null, version: null, signals: [], isBaukasten: false };

    const stacks = lh.stackPacks || [];
    for (const s of stacks) {
        const id = (s.id || '').toLowerCase();
        if (id === 'wordpress') { result.cms = 'WordPress'; result.signals.push('Lighthouse stackPack: WordPress'); }
        else if (id === 'joomla') { result.cms = 'Joomla'; result.signals.push('Lighthouse stackPack: Joomla'); }
        else if (id === 'drupal') { result.cms = 'Drupal'; result.signals.push('Lighthouse stackPack: Drupal'); }
        else if (id === 'magento') { result.cms = 'Magento'; result.signals.push('Lighthouse stackPack: Magento'); }
    }

    const netItems = lh.audits?.['network-requests']?.details?.items || [];
    const urls = netItems.map(i => i.url || '').join(' ');
    for (const p of TECH_PATTERNS) {
        if (p.match.test(urls)) {
            if (!result.cms) result.cms = p.cms;
            result.isBaukasten = result.isBaukasten || p.baukasten;
            result.signals.push(`URL-Pattern: ${p.cms}`);
        }
    }

    const wpVer = urls.match(/wp-includes\/[^?]*\?ver=([0-9.]+)/);
    if (wpVer) result.version = wpVer[1];

    const finalUrl = lh.finalDisplayedUrl || '';
    if (BAUKASTEN_SUBDOMAIN.test(finalUrl)) {
        result.isBaukasten = true;
        result.signals.push('Subdomain eines Baukastens');
    }

    if (!result.cms) result.cms = 'Nicht erkannt (moeglicherweise handcodiert)';
    return result;
}

// ─────────── wayback-freshness (Port) ───────────

async function checkFreshness(url) {
    try {
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${ts}`);
        if (!res.ok) return { available: false };
        const data = await res.json();
        const snapshot = data.archived_snapshots?.closest;
        if (!snapshot?.timestamp) return { available: false };

        const oldRes = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=20000101`);
        const oldData = await oldRes.json();
        const oldest = oldData.archived_snapshots?.closest;

        const lastDate = parseWaybackDate(snapshot.timestamp);
        const oldestDate = oldest?.timestamp ? parseWaybackDate(oldest.timestamp) : null;
        const now = new Date();
        const daysSince = Math.round((now - lastDate) / 86400000);
        const yearsSince = Math.round(daysSince / 365 * 10) / 10;
        const domainAgeDays = oldestDate ? Math.round((now - oldestDate) / 86400000) : null;
        const domainAgeYears = domainAgeDays ? Math.round(domainAgeDays / 365 * 10) / 10 : null;

        return {
            available: true,
            lastChanged: lastDate.toISOString().slice(0, 10),
            daysSince,
            yearsSince,
            domainAgeYears,
            firstSeen: oldestDate?.toISOString().slice(0, 10) || null
        };
    } catch (e) {
        return { available: false, error: e.message };
    }
}

function parseWaybackDate(ts) {
    return new Date(`${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}T${ts.slice(8,10)}:${ts.slice(10,12)}:${ts.slice(12,14)}Z`);
}

// ─────────── tech-age (Port aus analysis/tech-age.js) ───────────

const CMS_RELEASE_YEAR = {
    'WordPress': { 3: 2010, 4: 2014, 5: 2018, 6: 2022 },
    'Joomla':    { 3: 2012, 4: 2021, 5: 2023 },
    'Drupal':    { 7: 2011, 8: 2015, 9: 2020, 10: 2022, 11: 2024 },
    'Magento':   { 1: 2008, 2: 2015 }
};
const CMS_EOL_YEAR = {
    'WordPress': { 3: 2017, 4: 2022 },
    'Joomla':    { 3: 2023 },
    'Drupal':    { 7: 2025, 8: 2021, 9: 2023 },
    'Magento':   { 1: 2020 }
};

function majorVersion(v) {
    if (!v) return null;
    const m = String(v).match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

function classifyEra(yearsSince) {
    if (yearsSince === null || yearsSince === undefined) return 'unknown';
    if (yearsSince >= 5)  return 'abandoned';
    if (yearsSince >= 3)  return 'outdated';
    if (yearsSince >= 1.5) return 'aging';
    if (yearsSince >= 0.5) return 'current';
    return 'modern';
}

function analyzeTechAge(tech, wayback) {
    tech = tech || {};
    wayback = wayback || {};
    const currentYear = new Date().getFullYear();
    const cmsRaw = tech.cms || '';
    const cmsName = cmsRaw.split(' + ')[0];
    const major = majorVersion(tech.version);
    const yearsSince = wayback.yearsSince ?? null;
    const domainAgeYears = wayback.domainAgeYears ?? null;
    const era = classifyEra(yearsSince);

    let techStackVerdict = '';
    let techSeverity = 0;
    let techYearsBehind = null;

    if (tech.isBaukasten) {
        techStackVerdict = `Läuft auf einem Baukasten-System (${cmsName}) — strukturelle Limits bei SEO, Performance und Design`;
        techSeverity = 3;
    } else if (cmsName && major !== null && CMS_RELEASE_YEAR[cmsName]?.[major]) {
        const releaseYear = CMS_RELEASE_YEAR[cmsName][major];
        const eolYear = CMS_EOL_YEAR[cmsName]?.[major];
        techYearsBehind = currentYear - releaseYear;
        if (eolYear && eolYear <= currentYear) {
            techStackVerdict = `${cmsName} ${major}.x ist seit ${eolYear} EOL — keine Sicherheitsupdates mehr`;
            techSeverity = 5;
        } else if (techYearsBehind >= 6) {
            techStackVerdict = `${cmsName} ${major}.x stammt aus ${releaseYear} — ${techYearsBehind} Jahre alte Major-Version`;
            techSeverity = 4;
        } else if (techYearsBehind >= 3) {
            techStackVerdict = `${cmsName} ${major}.x ist von ${releaseYear} — Update auf eine neuere Major-Version steht aus`;
            techSeverity = 2;
        } else {
            techStackVerdict = `${cmsName} ${major}.x — aktuelle Major-Version`;
            techSeverity = 0;
        }
    } else if (cmsName && cmsName !== 'Nicht erkannt (moeglicherweise handcodiert)') {
        techStackVerdict = `${cmsName} erkannt`;
        techSeverity = 1;
    } else {
        techStackVerdict = 'Tech-Stack nicht eindeutig erkennbar';
        techSeverity = 0;
    }

    let eraVerdict = '', eraSeverity = 0;
    if (era === 'abandoned') { eraVerdict = `Site wirkt aufgegeben — seit ${yearsSince.toFixed(1)} Jahren keine Änderung`; eraSeverity = 5; }
    else if (era === 'outdated') { eraVerdict = `Site seit ${yearsSince.toFixed(1)} Jahren nicht mehr überarbeitet`; eraSeverity = 3; }
    else if (era === 'aging') { eraVerdict = `Letzte größere Änderung vor ${yearsSince.toFixed(1)} Jahren`; eraSeverity = 2; }
    else if (era === 'current') { eraVerdict = `Letzte Änderung vor ~${Math.round(yearsSince * 12)} Monaten`; }
    else if (era === 'modern') { eraVerdict = 'Site wurde kürzlich aktualisiert'; }
    else { eraVerdict = 'Aktualisierungs-Historie unbekannt'; }

    let pitchArg = null;
    if (techSeverity >= 4 && eraSeverity >= 3) {
        pitchArg = `Ihre Website läuft seit ${yearsSince?.toFixed(1) ?? '—'} Jahren auf ${cmsName} ${major}.x — eine ${techYearsBehind ?? '?'} Jahre alte Tech-Generation, die seit ${CMS_EOL_YEAR[cmsName]?.[major] ?? '—'} keine Sicherheitsupdates mehr erhält.`;
    } else if (techSeverity >= 4) {
        pitchArg = `${techStackVerdict}.`;
    } else if (eraSeverity >= 3) {
        pitchArg = `Ihre Website wurde seit ${yearsSince?.toFixed(1) ?? '—'} Jahren nicht mehr substantiell überarbeitet.`;
    }

    const severity = Math.max(techSeverity, eraSeverity);
    return {
        cms: cmsName,
        majorVersion: major,
        version: tech.version || null,
        isBaukasten: !!tech.isBaukasten,
        techStackVerdict,
        techSeverity,
        techYearsBehind,
        cmsReleaseYear: cmsName && major ? CMS_RELEASE_YEAR[cmsName]?.[major] ?? null : null,
        cmsEolYear: cmsName && major ? CMS_EOL_YEAR[cmsName]?.[major] ?? null : null,
        era,
        eraVerdict,
        eraSeverity,
        yearsSinceLastChange: yearsSince,
        domainAgeYears,
        firstSeen: wayback.firstSeen || null,
        lastChanged: wayback.lastChanged || null,
        severity,
        composite: `${techStackVerdict}${eraVerdict ? ' · ' + eraVerdict : ''}`,
        pitchArg,
        headline: severity >= 4 ? '⚠ Veraltete Technologie + lange nicht aktualisiert'
            : severity >= 3 ? 'Technische Generation überfällig'
            : severity >= 2 ? 'Aktualisierung empfehlenswert'
            : 'Tech-Stand aktuell'
    };
}

// ─────────── BFSG-Compliance (vereinfachter Port) ───────────

function checkBFSGCompliance(psiData) {
    const lh = psiData?.lighthouseResult || {};
    const audits = lh.audits || {};
    const a11yScore = Math.round((lh.categories?.accessibility?.score || 0) * 100);

    // Prüfe 12 WCAG-relevante Audits
    const checks = [
        'image-alt', 'label', 'link-name', 'button-name', 'document-title',
        'html-has-lang', 'html-lang-valid', 'meta-viewport',
        'color-contrast', 'duplicate-id-active', 'tabindex', 'frame-title'
    ];
    let passed = 0, total = 0;
    for (const k of checks) {
        const a = audits[k];
        if (!a || a.score === null) continue;
        total++;
        if (a.score >= 0.9) passed++;
    }
    const complianceScore = total > 0 ? Math.round(passed / total * 100) : a11yScore;

    let risk, fine;
    if (complianceScore < 50) { risk = 'kritisch'; fine = '100.000 €'; }
    else if (complianceScore < 70) { risk = 'hoch'; fine = '50.000 €'; }
    else if (complianceScore < 90) { risk = 'mittel'; fine = '10.000 €'; }
    else { risk = 'niedrig'; fine = 'kein Risiko erkennbar'; }

    const pitchArg = (risk === 'kritisch' || risk === 'hoch')
        ? `Ihre Website erfüllt nur ${complianceScore}% der BFSG-Anforderungen. Das Gesetz gilt seit Juni 2025 — Bußgelder bis ${fine}.`
        : null;

    return { complianceScore, risk, fine, a11yScore, pitchArg };
}

// ─────────── Haupt-Pipeline ───────────

async function runAuditPipeline(url, psiKey) {
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo${psiKey ? '&key=' + psiKey : ''}`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 55000);
    let psiData;
    try {
        const res = await fetch(psiUrl, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`PSI ${res.status}`);
        psiData = await res.json();
    } finally {
        clearTimeout(timeout);
    }

    const tech = detectTech(psiData);
    const wayback = await checkFreshness(url);
    const techAge = analyzeTechAge(tech, wayback);
    const bfsg = checkBFSGCompliance(psiData);

    const lh = psiData?.lighthouseResult || {};
    const ws = {
        perf: Math.round((lh.categories?.performance?.score || 0) * 100),
        seo: Math.round((lh.categories?.seo?.score || 0) * 100),
        a11y: Math.round((lh.categories?.accessibility?.score || 0) * 100),
        bp: Math.round((lh.categories?.['best-practices']?.score || 0) * 100),
        isHttps: url.startsWith('https://'),
        viewport: !!lh.audits?.['viewport']?.score
    };

    // Lead-Score grob: max-severity + perf-malus
    const leadScore = Math.min(100, Math.max(0,
        techAge.severity * 12
        + (ws.perf < 40 ? 20 : ws.perf < 60 ? 12 : 0)
        + (bfsg.risk === 'kritisch' ? 25 : bfsg.risk === 'hoch' ? 15 : bfsg.risk === 'mittel' ? 8 : 0)
        + (!ws.isHttps ? 10 : 0)
    ));

    const summaryParts = [];
    if (techAge.severity >= 4) summaryParts.push(`${techAge.cms} ist eine Generation hinter dem aktuellen Stand`);
    if (bfsg.risk === 'kritisch' || bfsg.risk === 'hoch') summaryParts.push(`die BFSG-Compliance liegt bei ${bfsg.complianceScore}% (Bußgeld-Risiko)`);
    if (ws.perf < 50) summaryParts.push(`die Ladezeit ist mit Performance-Score ${ws.perf}/100 messbar zu langsam`);
    if (!ws.isHttps) summaryParts.push('die Verschlüsselung (HTTPS) fehlt — Browser warnen Besucher');
    const summary = summaryParts.length > 0
        ? 'Konkret heißt das: ' + summaryParts.join('; ') + '. Eine moderne Website behebt das in 1-2 Wochen.'
        : 'Ihre Website ist technisch in einem ordentlichen Zustand. Trotzdem gibt es Stellen, an denen sich Optimierungen lohnen.';

    return {
        url,
        techAge,
        tech,
        wayback,
        bfsg,
        websiteScore: ws,
        leadScore,
        summary
    };
}

module.exports = {
    detectTech,
    checkFreshness,
    analyzeTechAge,
    checkBFSGCompliance,
    runAuditPipeline,
    CMS_RELEASE_YEAR,
    CMS_EOL_YEAR
};
