#!/usr/bin/env node
/**
 * Sprint 137 — Above-Fold Desktop-Mockups.
 *
 * Erweiterung zu screenshot-mockups.mjs (Sprint 126, Mobile-Natural-Height).
 * Hier: 1440×900-Viewport-Clip-Capture pro Portfolio. Erzeugt
 * `{slug}-mockup-fold.jpg` Files für Desktop-Hero-Mockup-Block + Branche-
 * Switcher. Im Gegensatz zur Sprint-126-`section.hero`-Element-Screenshot
 * (4700+ px tall) ist diese Variante 1440×900 = 16:10 — passt direkt in
 * den Desktop-Browser-Frame-Container ohne Vertical-Crop.
 *
 *   Viewport: 1440 × 900 (klassischer Desktop, 16:10 aspect)
 *   Retina:   deviceScaleFactor 2 (Source-Dim 2880×1800 physical)
 *   URL:      /m/portfolio/{slug}.html?screenshot=1
 *             (Sprint 121-Mode hidet UI-Chrome wie kr-strip, nav, sticky-CTA)
 *
 *   Output:   src/images/{slug}-mockup-fold.jpg @ JPEG-Quality 92
 *
 * Lauf:  node scripts/screenshot-mockups-fold.mjs
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const OUT_DIR = join(SRC, 'images');

let PORT = 8871;

// Format: page-slug, output-jpg
const PORTFOLIOS = [
    { page: 'immobilien-makler',          out: 'immobilien-stadtmakler-mockup-fold.jpg' },
    { page: 'friseur-salon',              out: 'friseur-mueller-mockup-fold.jpg' },
    { page: 'dachdecker-meisterbetrieb',  out: 'dachdecker-meister-mockup-fold.jpg' },
    { page: 'praxis-weber',               out: 'praxis-weber-mockup-fold.jpg' },
    { page: 'restaurant-template',        out: 'gastro-hirsch-mockup-fold.jpg' },
    { page: 'meisterbetrieb-mueller',     out: 'handwerk-mueller-mockup-fold.jpg' },
    { page: 'spedition-schwaben',         out: 'logistik-schwaben-mockup-fold.jpg' },
    { page: 'coaching-lehmann',           out: 'coaching-lehmann-mockup-fold.jpg', clipY: 64 },
];

function startHttpServer() {
    return new Promise((resolveServer, rejectServer) => {
        const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
            cwd: SRC,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        server.stderr.on('data', () => {});
        server.on('error', rejectServer);
        setTimeout(() => resolveServer(server), 800);
    });
}

function bytes(filePath) {
    return existsSync(filePath) ? statSync(filePath).size : 0;
}

function formatKb(b) {
    return (b / 1024).toFixed(1) + ' KB';
}

async function main() {
    console.log('Sprint 137 — Above-Fold Desktop-Mockups');
    console.log(`  Viewport: 1440 × 900 @ 2× retina`);
    console.log(`  Output:   src/images/*-mockup-fold.jpg`);
    console.log('');

    mkdirSync(OUT_DIR, { recursive: true });

    const server = await startHttpServer();
    process.on('exit', () => { try { server.kill(); } catch {} });
    process.on('SIGINT', () => { try { server.kill(); } catch {} process.exit(130); });

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
    });

    let count = 0;
    // Optional CLI-Filter: `node screenshot-mockups-fold.mjs coaching-lehmann` schießt nur diese eine.
    const ONLY = process.argv[2] || null;
    const TARGETS = ONLY ? PORTFOLIOS.filter((p) => p.page === ONLY) : PORTFOLIOS;
    for (const { page: slug, out, clipY = 0 } of TARGETS) {
        const page = await ctx.newPage();
        const url = `http://localhost:${PORT}/m/portfolio/${slug}.html?screenshot=1`;
        const outPath = join(OUT_DIR, out);
        process.stdout.write(`  ${slug.padEnd(30)} → `);

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
            // Viewport-Clip-Capture: top 1440×900 — Above-Fold-Inhalt.
            // screenshot-mode in Sprint 121 hidet nav + kr-strip → .hero
            // startet bei y=0, also captured wir die ersten 900 px der Hero.
            await page.screenshot({
                path: outPath,
                type: 'jpeg',
                quality: 92,
                clip: { x: 0, y: clipY, width: 1440, height: 900 },
            });
            count++;
            console.log(`${out} (${formatKb(bytes(outPath))})`);
        } catch (err) {
            console.log(`FAIL: ${err.message}`);
        } finally {
            await page.close();
        }
    }

    await browser.close();
    server.kill();

    console.log('');
    console.log(`  ✓ ${count}/${PORTFOLIOS.length} Above-Fold-Mockups captured`);
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
