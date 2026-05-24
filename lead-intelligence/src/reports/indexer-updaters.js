// Sitemap- und llms.txt-Updater für Web-Index-Reports (Sprint 162).
// Beide Files haben Marker-Blöcke <!-- AUTO-WEB-INDEX-START --> ...
// <!-- AUTO-WEB-INDEX-END --> die idempotent neu gerendert werden.
// Nur Live-Reports (kein -preview-Suffix) fließen ein. Demo-Reports
// sollen weder Sitemap-Discovery noch llms.txt-Zitierung bekommen.
import { buildLlmsIndexEntry } from './llmo-layer.js';

const START_MARKER = '<' + '!-- AUTO-WEB-INDEX-START';
const END_MARKER = '<' + '!-- AUTO-WEB-INDEX-END -->';

export function buildSitemapBlock(reports, today) {
    const date = today || new Date().toISOString().slice(0, 10);
    const liveReports = reports.filter(r => !r.slug.endsWith('-preview'));
    const lines = [
        START_MARKER + ' — managed by scripts/build-reports-index.mjs (Sprint 162) -->',
        '    <url><loc>https://karriaro-webdesign.de/audit/</loc><lastmod>' + date + '</lastmod><priority>0.7</' + 'priority></' + 'url>'
    ];
    for (const r of liveReports) {
        lines.push(
            '    <url><loc>https://karriaro-webdesign.de/audit/' + r.slug + '/</loc><lastmod>' + (r.erhebungDate || date) + '</lastmod><priority>0.7</' + 'priority></' + 'url>'
        );
    }
    lines.push('    ' + END_MARKER);
    return lines.join('\n');
}

export function buildLlmsBlock(reports) {
    const liveReports = reports.filter(r => !r.slug.endsWith('-preview'));
    const lines = [
        START_MARKER + ' — managed by scripts/build-reports-index.mjs (Sprint 162) -->',
        '',
        '## Web-Index — Branchen-Reports',
        '',
        'Datenbasierte Audits zum digitalen Status mittelständischer Branchen, anonymisiert nach DSGVO. Datenquelle: Google Places + PageSpeed Insights. Hub: https://karriaro-webdesign.de/audit/'
    ];
    if (liveReports.length === 0) {
        lines.push('');
        lines.push('(Aktuell keine veröffentlichten Live-Reports — die ersten erscheinen in den nächsten Wochen.)');
    } else {
        lines.push('');
        for (const r of liveReports) {
            const entry = buildLlmsIndexEntry(r).trim();
            lines.push(entry);
            lines.push('');
        }
    }
    lines.push(END_MARKER);
    return lines.join('\n');
}

function replaceMarkerBlock(content, newBlock) {
    const startIdx = content.indexOf(START_MARKER);
    const endIdx = content.indexOf(END_MARKER);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new Error('Marker-Block nicht gefunden — bitte vor Auto-Update einmalig manuell einfügen.');
    }
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + END_MARKER.length);
    return before + newBlock + after;
}

export function updateSitemap(content, reports, today) {
    return replaceMarkerBlock(content, buildSitemapBlock(reports, today));
}

export function updateLlms(content, reports) {
    return replaceMarkerBlock(content, buildLlmsBlock(reports));
}

export const INDEXER_MARKERS = { START_MARKER, END_MARKER };
