#!/usr/bin/env node
/**
 * Build-Pilot — rendert EINEN Branchen-Report aus echten Scan-Daten nach
 * src/audit/{slug}/ (index.html, report.json ohne Einzelzeilen, llms-Snippet).
 *
 * Aufruf:
 *   node scripts/build-report-pilot.mjs --probe stuttgart,karlsruhe --branche dentist
 *   node scripts/build-report-pilot.mjs --leads exports/scan.json --branche dentist --stadt "München" --messdatum 2026-08-15
 *
 *   --probe <verzeichnisse>  Probe-Läufe unter lead-intelligence/probe/data/ (Planung wie im Batch:
 *                            je Stadt, sonst zusammengefasst, nur ab Mindestzahl des Generators)
 *   --leads <datei>          Scanner-Export (Array oder { leads: [...] }); dann --stadt und --messdatum Pflicht
 *   --branche <key>          Pflicht. z.B. dentist, hair_salon, real_estate_agency
 *   --dry-run                nur bauen und prüfen, nichts schreiben
 *
 * Eine erfundene Demo-Stichprobe gibt es nicht mehr: ohne echte Messung kein Report.
 * Hub, Sitemap und llms.txt danach mit `node scripts/build-reports-index.mjs` neu bauen.
 */
import { resolve } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { ladeProbeLauf, planeReports, baueReport, schreibeReport } from './build-reports-batch.mjs';

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--probe') out.probe = argv[++i];
        else if (a === '--leads') out.leads = argv[++i];
        else if (a === '--branche') out.branche = argv[++i];
        else if (a === '--stadt') out.stadt = argv[++i];
        else if (a === '--messdatum') out.messdatum = argv[++i];
        else if (a === '--dry-run') out.dryRun = true;
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function printHelp() {
    console.log(`Usage:
  node scripts/build-report-pilot.mjs --probe <verz1,verz2> --branche <key> [--dry-run]
  node scripts/build-report-pilot.mjs --leads <datei> --branche <key> --stadt <name> --messdatum YYYY-MM-DD [--dry-run]`);
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help || !args.branche || (!args.probe && !args.leads)) {
        printHelp();
        process.exit(args.help ? 0 : 1);
    }

    let plaene;
    if (args.probe) {
        const laeufe = args.probe.split(',').map(s => s.trim()).filter(Boolean).map(ladeProbeLauf);
        const { plaene: alle, protokoll } = planeReports(laeufe);
        plaene = alle.filter(p => p.key === args.branche);
        if (!plaene.length) {
            const zeile = protokoll.find(p => p.key === args.branche);
            throw new Error(`Kein Report für ${args.branche}: ${zeile ? zeile.grund || zeile.ergebnis : 'unbekannte Branche'} (${zeile?.aufteilung || '—'})`);
        }
    } else {
        // Einzelexport über denselben Pfad wie der Batch (--spec), damit Prüfung und Nachbearbeitung identisch sind.
        const { spawnSync } = await import('node:child_process');
        const tmp = mkdtempSync(resolve(tmpdir(), 'kr-report-'));
        const spec = resolve(tmp, 'spec.json');
        writeFileSync(spec, JSON.stringify([{ branche: args.branche, stadt: args.stadt, leads: resolve(process.cwd(), args.leads), messdatum: args.messdatum }]));
        const r = spawnSync(process.execPath, [resolve(import.meta.dirname, 'build-reports-batch.mjs'), '--spec', spec, '--no-hub', ...(args.dryRun ? ['--dry-run'] : [])], { stdio: 'inherit' });
        process.exit(r.status ?? 1);
    }

    for (const plan of plaene) {
        const erg = baueReport(plan);
        const pfad = args.dryRun ? '(Trockenlauf)' : schreibeReport(erg);
        console.log(`✓ ${erg.report.slug}  n=${erg.report.n}  Kennung ${erg.report.refKennung}  ${pfad}`);
    }
    console.log('\nNächster Schritt: node scripts/build-reports-index.mjs   # Hub, Sitemap, llms.txt');
}

main().catch(err => {
    console.error('✗ Build failed:', err.message);
    process.exit(1);
});
