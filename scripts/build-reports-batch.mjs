#!/usr/bin/env node
// Build-Reports-Batch: rendert mehrere Branche-x-Stadt-Reports auf
// Basis einer JSON-Spec-Datei. Jede Spec entspricht einem Aufruf von
// scripts/build-report-pilot.mjs. Am Ende wird die Hub neu gebaut.
//
// Aufruf:
//   node scripts/build-reports-batch.mjs --spec reports.batch.json
//
// Spec-Format (JSON-Array):
//   [
//     { "branche": "hair_salon",  "stadt": "Köln",     "leads": "exports/friseure-koeln-2026-05.json" },
//     { "branche": "dentist",     "stadt": "München",  "leads": "exports/zahnaerzte-muenchen-2026-05.json" }
//   ]
//
// "leads" optional — falls weggelassen wird der Demo-Fixture-Fallback
// genutzt (sofern für die Spec-Branche eine Fixture existiert).
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';

import { generateReport } from '../lead-intelligence/src/reports/branchen-stadt-generator.js';
import { buildReportHtml } from '../lead-intelligence/src/reports/static-html-builder.js';
import { buildLlmsIndexEntry } from '../lead-intelligence/src/reports/llmo-layer.js';
import { buildFriseureKoelnFixture } from '../lead-intelligence/src/reports/fixtures/friseure-koeln-demo.js';
import { rebuildAllIndexes } from './lib/reports-indexer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function parseArgs(argv) {
    const out = { rebuildHub: true };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--spec') out.spec = argv[++i];
        else if (a === '--no-hub') out.rebuildHub = false;
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function printHelp() {
    console.log(`Usage:
  node scripts/build-reports-batch.mjs --spec <path-to-spec.json>

Options:
  --spec <path>   JSON-Array mit Branche-x-Stadt-Specs (siehe Header)
  --no-hub        nach dem Batch-Run die Hub NICHT neu rendern
`);
}

function loadLeads(spec) {
    if (spec.leads) {
        const path = resolve(process.cwd(), spec.leads);
        if (!existsSync(path)) throw new Error(`leads-Datei fehlt: ${path}`);
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw.leads) ? raw.leads : null;
        if (!arr) throw new Error(`leads-Datei muss Array oder { leads: [...] } enthalten: ${path}`);
        return { leads: arr, isDemo: false };
    }
    // Demo-Fixture-Fallback nur für Friseure Köln
    if (spec.branche === 'hair_salon' && spec.stadt && spec.stadt.toLowerCase().startsWith('k')) {
        return { leads: buildFriseureKoelnFixture(47), isDemo: true };
    }
    throw new Error(`Spec ohne --leads und ohne passende Demo-Fixture: ${spec.branche}/${spec.stadt}`);
}

function processSpec(spec) {
    const { leads, isDemo } = loadLeads(spec);
    const report = generateReport(leads, {
        brancheKey: spec.branche,
        stadtName: spec.stadt,
        erhebungTs: Date.now()
    });
    const slug = isDemo ? report.slug + '-preview' : report.slug;
    const outDir = resolve(repoRoot, 'src', 'audit', slug);
    mkdirSync(outDir, { recursive: true });

    const html = buildReportHtml(report, { noindex: isDemo });
    writeFileSync(resolve(outDir, 'index.html'), html, 'utf8');
    writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    writeFileSync(resolve(outDir, 'llms-index-snippet.md'), buildLlmsIndexEntry(report), 'utf8');

    console.log(`✓ ${slug.padEnd(36, ' ')} n=${String(report.n).padStart(3)} ${(html.length / 1024).toFixed(1).padStart(5)} KB ${isDemo ? '(DEMO)' : '(LIVE)'}`);
    return { slug, isDemo, report };
}

// rebuildAllIndexes (Hub + sitemap.xml + llms.txt) wird aus
// scripts/lib/reports-indexer.mjs importiert — gemeinsame Implementierung
// mit build-reports-index.mjs.

async function main() {
    const args = parseArgs(process.argv);
    if (args.help || !args.spec) { printHelp(); process.exit(args.help ? 0 : 1); }
    const specPath = resolve(process.cwd(), args.spec);
    if (!existsSync(specPath)) {
        console.error(`✗ Spec-Datei fehlt: ${specPath}`);
        process.exit(1);
    }
    const specs = JSON.parse(readFileSync(specPath, 'utf8'));
    if (!Array.isArray(specs) || !specs.length) {
        console.error('✗ Spec muss ein nicht-leeres JSON-Array sein');
        process.exit(1);
    }
    console.log(`▶ Batch-Run: ${specs.length} Reports\n`);

    let ok = 0, fail = 0;
    for (const spec of specs) {
        try {
            processSpec(spec);
            ok++;
        } catch (err) {
            console.error(`✗ ${spec.branche}/${spec.stadt}: ${err.message}`);
            fail++;
        }
    }
    console.log(`\n▶ Ergebnis: ${ok} OK, ${fail} Fehler\n`);

    if (args.rebuildHub) {
        rebuildAllIndexes();
    }
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
