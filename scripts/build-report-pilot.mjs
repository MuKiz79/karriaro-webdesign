#!/usr/bin/env node
/**
 * Build-Pilot — rendert einen Branchen-Stadt-Report nach
 * src/audit/{slug}/index.html (für den GitHub-Pages-Deploy).
 *
 * Aufruf:
 *   node scripts/build-report-pilot.mjs --branche hair_salon --stadt "Köln"
 *
 *   --leads <path.json>        Pfad zu einem JSON-Array mit Scanner-Lead-
 *                              Objekten. Ohne diese Flag wird die mitgelieferte
 *                              Demo-Fixture (frei erfundene Domains) verwendet
 *                              und der gerenderte Report bekommt das Suffix
 *                              "-preview" — er wird nicht unter dem öffentlichen
 *                              Slug abgelegt.
 *
 *   --branche <key>            Pflicht. z.B. hair_salon, dentist, restaurant ...
 *   --stadt   <name>           Pflicht. z.B. "Köln", "München"
 *   --out     <dir>            Ausgabe-Verzeichnis. Default: src/audit/{slug}/
 *   --skip-voice-lint          Voice-Linter umgehen (nur für lokales Debugging)
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

import { generateReport } from '../lead-intelligence/src/reports/branchen-stadt-generator.js';
import { buildReportHtml } from '../lead-intelligence/src/reports/static-html-builder.js';
import { buildLlmsIndexEntry } from '../lead-intelligence/src/reports/llmo-layer.js';
import { buildFriseureKoelnFixture } from '../lead-intelligence/src/reports/fixtures/friseure-koeln-demo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--leads') out.leads = argv[++i];
        else if (a === '--branche') out.branche = argv[++i];
        else if (a === '--stadt') out.stadt = argv[++i];
        else if (a === '--out') out.out = argv[++i];
        else if (a === '--skip-voice-lint') out.skipVoiceLint = true;
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function printHelp() {
    console.log(`Usage:
  node scripts/build-report-pilot.mjs --branche <key> --stadt <name> [options]

Options:
  --branche <key>     Pflicht. z.B. hair_salon, dentist, restaurant
  --stadt <name>      Pflicht. z.B. "Köln", "München"
  --leads <path>      JSON-Array mit Scanner-Lead-Objekten (sonst Demo-Fixture)
  --out <dir>         Ausgabe-Verzeichnis (Default: src/audit/{slug}/)
  --skip-voice-lint   Voice-Linter umgehen (Debugging)

Beispiel:
  node scripts/build-report-pilot.mjs --branche hair_salon --stadt "Köln"
  node scripts/build-report-pilot.mjs --branche dentist --stadt "München" --leads exports/scan-2026-05-24.json
`);
}

function loadLeads(args) {
    if (args.leads) {
        const path = resolve(process.cwd(), args.leads);
        if (!existsSync(path)) {
            throw new Error(`--leads Datei nicht gefunden: ${path}`);
        }
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw.leads) ? raw.leads : null;
        if (!arr) throw new Error(`--leads Datei muss ein JSON-Array oder ein Objekt mit .leads enthalten`);
        return { leads: arr, isDemo: false };
    }
    // Default: Demo-Fixture, NUR wenn es Friseure Köln ist (sonst Fehler)
    if (args.branche === 'hair_salon' && args.stadt && args.stadt.toLowerCase().startsWith('k')) {
        return { leads: buildFriseureKoelnFixture(47), isDemo: true };
    }
    throw new Error(
        `Keine --leads Datei angegeben und keine passende Demo-Fixture für ${args.branche}/${args.stadt}.\n` +
        `Exportieren Sie einen Scanner-Run und übergeben Sie ihn per --leads <path.json>.`
    );
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help || !args.branche || !args.stadt) {
        printHelp();
        process.exit(args.help ? 0 : 1);
    }

    const { leads, isDemo } = loadLeads(args);
    console.log(`▶ Eingangs-Sample: ${leads.length} Leads${isDemo ? ' (DEMO-FIXTURE)' : ''}`);

    const report = generateReport(leads, {
        brancheKey: args.branche,
        stadtName: args.stadt,
        erhebungTs: Date.now()
    });

    const slug = isDemo ? `${report.slug}-preview` : report.slug;
    const outDir = args.out
        ? resolve(process.cwd(), args.out)
        : resolve(repoRoot, 'src', 'audit', slug);
    mkdirSync(outDir, { recursive: true });

    const html = buildReportHtml(report, {
        skipVoiceLint: !!args.skipVoiceLint,
        noindex: isDemo
    });
    const indexPath = resolve(outDir, 'index.html');
    writeFileSync(indexPath, html, 'utf8');

    const dataPath = resolve(outDir, 'report.json');
    writeFileSync(dataPath, JSON.stringify(report, null, 2), 'utf8');

    const llmsSnippet = buildLlmsIndexEntry(report);
    const llmsPath = resolve(outDir, 'llms-index-snippet.md');
    writeFileSync(llmsPath, llmsSnippet, 'utf8');

    const sizeKb = (html.length / 1024).toFixed(1);
    console.log(`✓ Report geschrieben:
  HTML       ${indexPath}  (${sizeKb} KB)
  Data       ${dataPath}
  LLMS-Snip  ${llmsPath}`);

    if (isDemo) {
        console.log(`
ℹ Dieser Report wurde aus der DEMO-FIXTURE generiert (frei erfundene Domains).
  Slug-Suffix "-preview" verhindert versehentliches Veröffentlichen unter
  dem öffentlichen Pfad. Für den echten Pilot:
    1) Im v2-Cockpit einen Friseure-Köln-Scan starten
    2) Lead-Array als JSON exportieren
    3) node scripts/build-report-pilot.mjs --branche hair_salon --stadt "Köln" --leads <pfad>`);
    }
    console.log(`
Nächste Schritte:
  npm run build              # Tailwind + copy → dist/
  npm run preview            # http://localhost:3000/audit/${slug}/
  npm run smoke              # Playwright-Smoke (Page muss in scripts/smoke-playwright.mjs gelistet sein)`);
}

main().catch(err => {
    console.error('✗ Build failed:', err.message);
    if (err.code === 'VOICE_VIOLATION') {
        console.error(err.hits?.map(h => `  Zeile ${h.line}: ${h.pattern}\n    ${h.snippet}`).join('\n'));
    }
    process.exit(1);
});
