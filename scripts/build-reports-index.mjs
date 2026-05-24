#!/usr/bin/env node
// Build-Reports-Index: scannt src/audit/* nach report.json-Dateien
// und rendert src/audit/index.html als Hub aller Branchen-Reports.
//
// Aufruf:
//   node scripts/build-reports-index.mjs
//   node scripts/build-reports-index.mjs --no-demos   (nur Live-Reports listen)
//
// Idempotent: kann beliebig oft nach jedem build-report-pilot-Run ausgeführt
// werden. Voice-Linter läuft Pflicht (CLAUDE.md Brand-Codex).
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';

import { buildHubHtml, reportToHubCard } from '../lead-intelligence/src/reports/hub-builder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const auditDir = resolve(repoRoot, 'src', 'audit');

function parseArgs(argv) {
    const out = { showDemos: true };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--no-demos') out.showDemos = false;
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function listReportDirs() {
    if (!existsSync(auditDir)) return [];
    return readdirSync(auditDir)
        .filter(name => {
            const full = resolve(auditDir, name);
            try { return statSync(full).isDirectory(); } catch { return false; }
        })
        .map(name => ({ name, dir: resolve(auditDir, name) }))
        .filter(({ dir }) => existsSync(resolve(dir, 'report.json')));
}

function loadReport({ name, dir }) {
    try {
        const json = JSON.parse(readFileSync(resolve(dir, 'report.json'), 'utf8'));
        return reportToHubCard(json, name);
    } catch (err) {
        console.warn(`! skip ${name}: ${err.message}`);
        return null;
    }
}

function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        console.log(`Usage: node scripts/build-reports-index.mjs [--no-demos]
Scannt src/audit/<slug>/report.json und rendert src/audit/index.html als Hub.`);
        return;
    }

    const dirs = listReportDirs();
    if (!dirs.length) {
        console.log('! keine src/audit/*/report.json gefunden — Hub wird mit Empty-State gerendert.');
    }

    const cards = dirs.map(loadReport).filter(Boolean);
    const live = cards.filter(c => !c.isDemo);
    const demo = cards.filter(c => c.isDemo);
    console.log(`▶ Discovery: ${cards.length} Reports (${live.length} live, ${demo.length} demo)`);

    const html = buildHubHtml(cards, { showDemos: args.showDemos });
    const outPath = resolve(auditDir, 'index.html');
    writeFileSync(outPath, html, 'utf8');

    const sizeKb = (html.length / 1024).toFixed(1);
    console.log(`✓ Hub geschrieben: ${outPath} (${sizeKb} KB)`);
    if (!args.showDemos && demo.length) {
        console.log(`  (--no-demos aktiv — ${demo.length} Demo-Reports nicht gelistet)`);
    }
}

try {
    main();
} catch (err) {
    console.error('✗ Hub-Build fehlgeschlagen:', err.message);
    if (err.code === 'VOICE_VIOLATION') {
        console.error(err.hits?.map(h => `  Zeile ${h.line}: ${h.pattern}\n    ${h.snippet}`).join('\n'));
    }
    process.exit(1);
}
