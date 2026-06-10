#!/usr/bin/env node
/**
 * Site-Q&A — Index-Builder für „Frag die Seite" (functions/siteAsk).
 *
 * Liest eine DEFINIERTE Include-Liste aus src/ (Whitelist, kein Glob über
 * alles), chunked jede Seite via functions/lib/site-qa.js (H1/H2/H3-Split,
 * Anker-Auflösung) und schreibt functions/data/site-index.json.
 *
 * HARTE EXCLUDES (alles, was nicht explizit included ist, bleibt draußen):
 *  - src/portfolio/**      → fiktive Demo-Betriebe (Stadtmakler, Salon Müller …)
 *                            dürfen NIE als Karriaro-Fakt zitiert werden.
 *  - datenschutz/agb       → Rechtstexte; aus Haftungsgründen keine
 *                            LLM-Paraphrase von Rechtsklauseln.
 *  - 404/success           → technische Seiten ohne zitierfähigen Inhalt.
 *  - src/m/**              → generierte Mobile-Spiegel (Duplikate der Quelle).
 *  - en/**                 → englische Spiegel (Antwort-Sprache ist Deutsch).
 *  - preview/v2/lighthouse-scores → interne/experimentelle Seiten bzw.
 *                            Score-Snapshots, kein Auskunfts-Inhalt.
 *  - website-check.html / blog.html → Lead-Form bzw. Linkliste ohne Fakten.
 *  - impressum.html nur TEILWEISE: ausschließlich die Kontakt-Fakten-Sektion
 *    (Anbieter + Anschrift + E-Mail); Haftungs-/Streitbeilegungsklauseln nicht.
 *
 * builtAt = jüngste mtime der Quell-Dateien (KEIN new Date() — der Build muss
 * bei unveränderten Quellen byte-identisch reproduzierbar sein).
 *
 * Run: npm run build:site-index   (läuft auch als firebase-predeploy-Hook)
 * KEIN cheerio/jsdom — reine String-Ops (Konvention wie build-mobile-pages.mjs).
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chunkPage } = require('../functions/lib/site-qa.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const OUT_DIR = join(ROOT, 'functions', 'data');
const OUT_FILE = join(OUT_DIR, 'site-index.json');

// ────────────────────────────────────────────────────────────────
// Include-Liste: [Datei relativ zu src/, kanonische URL (cleanUrls)]
// ────────────────────────────────────────────────────────────────
const NAMED_PAGES = [
    ['index.html', '/'],
    ['werkschau.html', '/werkschau'],
    ['ki-sichtbarkeit.html', '/ki-sichtbarkeit'],
    ['ki-zitier-check.html', '/ki-zitier-check'],
    ['warum-handcoded.html', '/warum-handcoded'],
    ['website-kosten.html', '/website-kosten'],
    ['website-pruefen.html', '/website-pruefen'],
    ['barrierefreiheit.html', '/barrierefreiheit'],
    ['bfsg-website-pflicht.html', '/bfsg-website-pflicht'],
    ['gruender.html', '/gruender'],
];

function fail(msg) {
    console.error(`✗ build-site-index: ${msg}`);
    process.exit(1);
}

// Alle Stadt-Seiten (webdesign-*.html) + alle Blog-Artikel (blog/*.html)
const cityPages = readdirSync(SRC)
    .filter((f) => /^webdesign-[a-z0-9-]+\.html$/.test(f))
    .sort()
    .map((f) => [f, '/' + f.replace(/\.html$/, '')]);

const blogPages = readdirSync(join(SRC, 'blog'))
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => ['blog/' + f, '/blog/' + f.replace(/\.html$/, '')]);

const sourceFiles = [];
let allChunks = [];

for (const [rel, url] of [...NAMED_PAGES, ...cityPages, ...blogPages]) {
    const abs = join(SRC, rel);
    const html = readFileSync(abs, 'utf8');
    sourceFiles.push(abs);
    const chunks = chunkPage(html, url);
    if (chunks.length === 0) fail(`Seite ${rel} ergab 0 Chunks — Chunker oder Quelle prüfen.`);
    allChunks.push(...chunks);
}

// ────────────────────────────────────────────────────────────────
// Impressum: NUR die Kontakt-Fakten-Sektion (Anbieter/Anschrift/E-Mail).
// Schnitt: ab „Angaben gemäß § 5 DDG" bis vor „Wirtschafts-Identifikationsnummer".
// ────────────────────────────────────────────────────────────────
const IMPRESSUM = join(SRC, 'impressum.html');
{
    const html = readFileSync(IMPRESSUM, 'utf8');
    sourceFiles.push(IMPRESSUM);
    const start = html.indexOf('<h2>Angaben gemäß § 5 DDG</h2>');
    const end = html.indexOf('<h2>Wirtschafts-Identifikationsnummer</h2>');
    if (start === -1 || end === -1 || end <= start) {
        fail('Kontakt-Fakten-Marker im Impressum nicht gefunden — Schnittgrenzen prüfen.');
    }
    const wrapped = `<!doctype html><html><head><title>Impressum · Karriaro Webdesign</title></head><body><section id="kontakt-fakten">${html.slice(start, end)}</section></body></html>`;
    const chunks = chunkPage(wrapped, '/impressum');
    if (chunks.length === 0) fail('Impressum-Kontakt-Fakten ergaben 0 Chunks.');
    allChunks.push(...chunks);
}

// builtAt aus den Quell-mtimes (jüngste gewinnt), NICHT aus der Build-Zeit.
const newestMtimeMs = Math.max(...sourceFiles.map((f) => statSync(f).mtimeMs));
const builtAt = new Date(newestMtimeMs).toISOString();

// ────────────────────────────────────────────────────────────────
// Demo-Bleed-Filter: Die Homepage erwähnt die fiktiven Demo-Betriebe
// (Hero-Mockup, "Live-Demo öffnen"-CTAs). Chunks mit diesen Markern
// fliegen raus — sonst könnte die KI Demo-Fakten ("ca. 3-4 Wochen",
// "IVD + HypZert") als Karriaro-Fakt zitieren.
// ────────────────────────────────────────────────────────────────
const DEMO_MARKERS = [
    'stadtmakler', 'salon müller', 'goldener hirsch', 'dachdecker berger',
    'spedition schwaben', 'meisterbetrieb müller', 'coach lehmann',
    'praxis dr. weber', 'live-demo öffnen', 'demo öffnen',
];
const beforeDemoFilter = allChunks.length;
allChunks = allChunks.filter((c) => {
    const t = (c.heading + ' ' + c.text).toLowerCase();
    return !DEMO_MARKERS.some((m) => t.includes(m));
});
const droppedDemo = beforeDemoFilter - allChunks.length;
if (droppedDemo > 0) console.log(`  · ${droppedDemo} Demo-Bleed-Chunks gefiltert (fiktive Betriebe)`);
if (droppedDemo > 40) fail(`${droppedDemo} Demo-gefilterte Chunks — Marker-Liste zu breit?`);

// ────────────────────────────────────────────────────────────────
// Plausibilisierung — schlägt der Index fehl, bricht auch das
// firebase-predeploy ab (kein Deploy mit kaputtem/leerem Index).
// ────────────────────────────────────────────────────────────────
if (allChunks.length < 150 || allChunks.length > 600) {
    fail(`Chunk-Zahl ${allChunks.length} außerhalb der Plausibilität (150-600).`);
}
const leaked = allChunks.filter((c) => String(c.url).startsWith('/portfolio'));
if (leaked.length > 0) {
    fail(`${leaked.length} Chunks mit /portfolio-URL — Demo-Inhalte dürfen nicht in den Index.`);
}
const ids = new Set(allChunks.map((c) => c.id));
if (ids.size !== allChunks.length) fail('Chunk-Ids sind nicht eindeutig.');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify({ builtAt, chunkCount: allChunks.length, chunks: allChunks }, null, 1) + '\n');

const pages = new Set(allChunks.map((c) => c.url)).size;
console.log(`✓ site-index.json: ${allChunks.length} Chunks aus ${pages} Seiten (builtAt ${builtAt})`);
