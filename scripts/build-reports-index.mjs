#!/usr/bin/env node
// Build-Reports-Index: scannt src/audit/* nach report.json-Dateien,
// rendert src/audit/index.html als Hub aller Branchen-Reports UND
// aktualisiert sitemap.xml + llms.txt (Sprint 162) idempotent.
//
// Aufruf:
//   node scripts/build-reports-index.mjs
//   node scripts/build-reports-index.mjs --no-demos   (Demos auf der Hub verstecken)
//
// Voice-Linter (CLAUDE.md) läuft Pflicht. Sitemap/llms-Updates passen
// nur Live-Reports an, Demo-Slugs werden bewusst nicht propagiert.
import { rebuildAllIndexes } from './lib/reports-indexer.mjs';

function parseArgs(argv) {
    const out = { showDemos: true };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--no-demos') out.showDemos = false;
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function printHelp() {
    console.log(`Usage: node scripts/build-reports-index.mjs [--no-demos]

Scannt src/audit/<slug>/report.json und rendert:
  - src/audit/index.html (Hub)
  - sitemap.xml-Block <!-- AUTO-WEB-INDEX-* --> (nur Live-Reports)
  - llms.txt-Block <!-- AUTO-WEB-INDEX-* --> (nur Live-Reports)`);
}

try {
    const args = parseArgs(process.argv);
    if (args.help) { printHelp(); process.exit(0); }
    rebuildAllIndexes({ showDemos: args.showDemos });
} catch (err) {
    console.error('✗ Hub-Build fehlgeschlagen:', err.message);
    if (err.code === 'VOICE_VIOLATION') {
        console.error(err.hits?.map(h => `  Zeile ${h.line}: ${h.pattern}\n    ${h.snippet}`).join('\n'));
    }
    process.exit(1);
}
