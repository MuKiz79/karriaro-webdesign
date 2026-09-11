#!/usr/bin/env node
// Build-Reports-Index: scannt src/audit/<slug>/report.json, rendert den Hub
// src/audit/index.html und aktualisiert die AUTO-WEB-INDEX-Blöcke in
// src/sitemap.xml und src/llms.txt idempotent.
//
// Aufruf:
//   node scripts/build-reports-index.mjs
//   node scripts/build-reports-index.mjs --dry-run
//
// Demo-Reports (Verzeichnis „…-preview") erscheinen weder im Hub noch in
// Sitemap/llms — der Hub zeigt nur Reports aus echten Messungen.
// Voice-Linter und Veröffentlichungs-Prüfung laufen Pflicht.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { discoverReports } from './lib/reports-indexer.mjs';
import { buildHubHtml } from '../lead-intelligence/src/reports/hub-builder.js';
import { updateSitemap, updateLlms, INDEXER_MARKERS } from '../lead-intelligence/src/reports/indexer-updaters.js';
import { ersetzeGenau, ohneSchraegstrich, pruefeVeroeffentlichung } from './build-reports-batch.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const auditDir = resolve(repoRoot, 'src', 'audit');
const sitemapPath = resolve(repoRoot, 'src', 'sitemap.xml');
const llmsPath = resolve(repoRoot, 'src', 'llms.txt');

function datumDe(iso) {
    const [j, m, t] = String(iso).slice(0, 10).split('-');
    return `${t}.${m}.${j}`;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

function aufzaehlung(liste) {
    if (liste.length <= 1) return liste.join('');
    return liste.slice(0, -1).join(', ') + ' und ' + liste[liste.length - 1];
}

export function nachbearbeiteHub(html, reports) {
    let h = html;
    h = ersetzeGenau(h, 'PageSpeed, Tech-Stack, BFSG-Compliance, anonymisiert nach DSGVO.',
        'PageSpeed, Tech-Stack, TLS und mobiler Viewport. Veröffentlicht werden nur Kennzahlen je Branche.', 'Hub Meta-Beschreibung');
    h = ersetzeGenau(h, '<h1 class="kr-h1">Der digitale Status<br><em>des deutschen Mittelstands</em>.</h1>',
        '<h1 class="kr-h1">Websites lokaler Betriebe,<br><em>vermessen</em>.</h1>', 'Hub H1');

    const staedte = [...new Set(reports.flatMap(r => (r.json.stichprobe?.staedte || [{ name: r.json.stadtName }]).map(s => s.name)))];
    const tage = reports.map(r => r.json.stichprobe?.messBis || r.json.erhebungDate).filter(Boolean).sort();
    const summe = reports.reduce((s, r) => s + (r.json.n || 0), 0);
    const gemessen = !tage.length ? '' : (tage[0] === tage[tage.length - 1]
        ? `, gemessen am ${datumDe(tage[0])}`
        : `, gemessen zwischen ${datumDe(tage[0])} und ${datumDe(tage[tage.length - 1])}`);
    const lede = reports.length
        ? `Kennzahlen zu Websites lokaler Betriebe, je Branche zusammengefasst: ${reports.length} Reports mit zusammen ${summe} Websites aus ${aufzaehlung(staedte)}${gemessen}. ` +
            'Datenbasis: Google Places und PageSpeed Insights. Veröffentlicht werden nur Kennzahlen je Branche — keine Namen, Adressen oder Werte einzelner Websites.'
        : 'Kennzahlen zu Websites lokaler Betriebe, je Branche zusammengefasst. Datenbasis: Google Places und PageSpeed Insights.';
    h = ersetzeGenau(h, /<p class="kr-lede">[\s\S]*?<\/p>/, `<p class="kr-lede">${escapeHtml(lede)}</p>`, 'Hub Lede');

    h = ersetzeGenau(h, '<a class="kr-btn" href="mailto:kontakt@karriaro.de?subject=Web-Index-Wunsch">Branche vorschlagen</a>',
        '<a class="kr-btn" href="mailto:kontakt@karriaro.de?subject=Web-Index-Wunsch">Branche vorschlagen</a>\n' +
        '    <p style="margin:1.4em auto 0">Oder prüfen Sie direkt Ihre eigene Website: <a href="/website-pruefen?report=web-index">Website prüfen</a></p>',
        'Hub Handlungsaufruf');
    // Im Hub-Stylesheet steht .kr-top NACH .kr-wrap und nimmt der Kopfzeile das seitliche
    // Polster (mobil klebt „Web-Index" am Rand). Gezielt nachtragen statt den Builder zu ändern.
    h = ersetzeGenau(h, '</style>', '.kr-top.kr-wrap{padding-left:24px;padding-right:24px}</style>', 'Hub Kopfzeilen-Polster');
    // Der Hub-Builder trennt Folio- und Quellenangaben mit „. " statt mit dem Mittelpunkt,
    // den die Report-Seiten tragen („LIVE. 2026-08"). Gleiche Schreibweise wie dort.
    h = ersetzeGenau(h, '<p class="kr-folio">WEB-INDEX. ', '<p class="kr-folio">WEB-INDEX · ', 'Hub Folio');
    h = ersetzeGenau(h, 'Google Places . PageSpeed Insights', 'Google Places · PageSpeed Insights', 'Hub Quelle');
    h = ersetzeGenau(h, '<p class="kr-hub-folio">LIVE. ', '<p class="kr-hub-folio">LIVE · ', 'Hub Karten-Folio', reports.length);
    return ohneSchraegstrich(h);
}

export function baueIndizes({ dryRun = false, log = console.log.bind(console) } = {}) {
    const { cards, reports } = discoverReports();
    const demos = cards.filter(c => c.isDemo);
    if (demos.length) log(`! ${demos.length} Demo-Report(s) gefunden und ausgeblendet: ${demos.map(c => c.slug).join(', ')}`);
    const liveCards = cards.filter(c => !c.isDemo);
    const liveReports = reports.filter(r => !r.slug.endsWith('-preview'));
    log(`▶ Discovery: ${liveReports.length} Live-Reports`);

    const hub = nachbearbeiteHub(buildHubHtml(liveCards, { showDemos: false }), liveReports);
    pruefeVeroeffentlichung({ html: hub, kontext: 'hub /audit' });

    const heute = new Date().toISOString().slice(0, 10);
    const sitemapAlt = readFileSync(sitemapPath, 'utf8');
    const sitemapNeu = ohneSchraegstrich(updateSitemap(sitemapAlt,
        liveReports.map(r => ({
            slug: r.slug,
            veroeffentlichtAm: r.json.veroeffentlichtAm,
            aktualisiertAm: r.json.aktualisiertAm,
            erhebungDate: r.json.stichprobe?.messBis || r.json.erhebungDate
        })), heute));

    const llmsAlt = readFileSync(llmsPath, 'utf8');
    const llmsNeu = ohneSchraegstrich(updateLlms(llmsAlt, liveReports.map(r => Object.assign({}, r.json, { slug: r.slug }))));
    const start = llmsNeu.indexOf(INDEXER_MARKERS.START_MARKER);
    const ende = llmsNeu.indexOf(INDEXER_MARKERS.END_MARKER);
    pruefeVeroeffentlichung({ html: llmsNeu.slice(start, ende), kontext: 'llms.txt Web-Index-Block' });

    if (!dryRun) {
        writeFileSync(resolve(auditDir, 'index.html'), hub, 'utf8');
        if (sitemapNeu !== sitemapAlt) writeFileSync(sitemapPath, sitemapNeu, 'utf8');
        if (llmsNeu !== llmsAlt) writeFileSync(llmsPath, llmsNeu, 'utf8');
    }
    log(`${dryRun ? '·' : '✓'} Hub:      ${resolve(auditDir, 'index.html')}  (${(hub.length / 1024).toFixed(1)} KB)`);
    log(`${sitemapNeu !== sitemapAlt ? '✓' : '·'} Sitemap:  ${sitemapPath}${sitemapNeu !== sitemapAlt ? '' : '  (unverändert)'}`);
    log(`${llmsNeu !== llmsAlt ? '✓' : '·'} llms.txt: ${llmsPath}${llmsNeu !== llmsAlt ? '' : '  (unverändert)'}`);
    return { hub, live: liveReports.length };
}

function parseArgs(argv) {
    const out = { dryRun: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') out.dryRun = true;
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

const direktAufruf = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direktAufruf) {
    try {
        const args = parseArgs(process.argv);
        if (args.help) {
            console.log('Usage: node scripts/build-reports-index.mjs [--dry-run]\n\nRendert src/audit/index.html und die AUTO-WEB-INDEX-Blöcke in sitemap.xml und llms.txt.');
            process.exit(0);
        }
        if (!existsSync(sitemapPath) || !existsSync(llmsPath)) throw new Error('sitemap.xml oder llms.txt fehlt');
        baueIndizes({ dryRun: args.dryRun });
    } catch (err) {
        console.error('✗ Hub-Build fehlgeschlagen:', err.message);
        process.exit(1);
    }
}
