// Geteilte Helper für scripts/build-reports-index.mjs und
// scripts/build-reports-batch.mjs: discover + Hub-Build + sitemap.xml-
// und llms.txt-Auto-Update.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';

import { buildHubHtml, reportToHubCard } from '../../lead-intelligence/src/reports/hub-builder.js';
import { updateSitemap, updateLlms } from '../../lead-intelligence/src/reports/indexer-updaters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const auditDir = resolve(repoRoot, 'src', 'audit');
const sitemapPath = resolve(repoRoot, 'src', 'sitemap.xml');
const llmsPath = resolve(repoRoot, 'src', 'llms.txt');

export function discoverReports() {
    if (!existsSync(auditDir)) return { cards: [], reports: [] };
    const dirs = readdirSync(auditDir)
        .filter(name => {
            try { return statSync(resolve(auditDir, name)).isDirectory(); } catch { return false; }
        })
        .map(name => ({ name, dir: resolve(auditDir, name) }))
        .filter(({ dir }) => existsSync(resolve(dir, 'report.json')));

    const reports = [];
    const cards = [];
    for (const { name, dir } of dirs) {
        try {
            const json = JSON.parse(readFileSync(resolve(dir, 'report.json'), 'utf8'));
            reports.push({ slug: name, json });
            cards.push(reportToHubCard(json, name));
        } catch (err) {
            console.warn(`! skip ${name}: ${err.message}`);
        }
    }
    return { cards, reports };
}

export function writeHub(cards, options = {}) {
    const html = buildHubHtml(cards, { showDemos: options.showDemos !== false });
    writeFileSync(resolve(auditDir, 'index.html'), html, 'utf8');
    return { path: resolve(auditDir, 'index.html'), size: html.length };
}

export function writeSitemapBlock(reports) {
    if (!existsSync(sitemapPath)) {
        console.warn('! sitemap.xml fehlt — kein Auto-Update.');
        return null;
    }
    const reportsForUpdater = reports.map(r => ({ slug: r.slug, erhebungDate: r.json.erhebungDate }));
    const content = readFileSync(sitemapPath, 'utf8');
    const updated = updateSitemap(content, reportsForUpdater);
    if (updated !== content) {
        writeFileSync(sitemapPath, updated, 'utf8');
        return { path: sitemapPath, changed: true };
    }
    return { path: sitemapPath, changed: false };
}

export function writeLlmsBlock(reports) {
    if (!existsSync(llmsPath)) {
        console.warn('! llms.txt fehlt — kein Auto-Update.');
        return null;
    }
    // Reihenfolge wichtig: erst json spreaden, DANN slug aus Verzeichnisnamen
    // setzen — sonst gewinnt der interne report.json-Slug und Demo-Reports
    // (Verzeichnis "...-preview") werden fälschlich als Live propagiert.
    const reportsForUpdater = reports.map(r => Object.assign({}, r.json, { slug: r.slug }));
    const content = readFileSync(llmsPath, 'utf8');
    const updated = updateLlms(content, reportsForUpdater);
    if (updated !== content) {
        writeFileSync(llmsPath, updated, 'utf8');
        return { path: llmsPath, changed: true };
    }
    return { path: llmsPath, changed: false };
}

// Alles-in-Eins: scant src/audit/, schreibt Hub, sitemap, llms.
export function rebuildAllIndexes(options = {}) {
    const { cards, reports } = discoverReports();
    const live = cards.filter(c => !c.isDemo).length;
    const log = options.log !== false ? console.log.bind(console) : () => {};
    log(`▶ Discovery: ${cards.length} Reports (${live} live, ${cards.length - live} demo)`);

    const hub = writeHub(cards, options);
    log(`✓ Hub:      ${hub.path}  (${(hub.size / 1024).toFixed(1)} KB)`);

    const sm = writeSitemapBlock(reports);
    if (sm) log(`${sm.changed ? '✓' : '·'} Sitemap:  ${sm.path}${sm.changed ? '' : '  (no changes)'}`);

    const ll = writeLlmsBlock(reports);
    if (ll) log(`${ll.changed ? '✓' : '·'} llms.txt: ${ll.path}${ll.changed ? '' : '  (no changes)'}`);

    return { cards, reports, live };
}
