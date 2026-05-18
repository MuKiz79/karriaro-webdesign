#!/usr/bin/env node
/**
 * Sprint 126 — Capture Portfolio-Hero-Screenshots in NATÜRLICHER Höhe.
 *
 * Ersetzt scripts/screenshot-mockups.sh (Bash + Headless-Chrome) durch
 * Playwright. Statt fixed-viewport-screenshot wird das `.hero`-Element
 * jedes Portfolios einzeln gescreenshooted — natürliche Höhe pro Portfolio,
 * kein Crop am Bottom.
 *
 *   Viewport: 480 wide, 720 tall (Layout-Hint nur — Element-Screenshot
 *             ignoriert die Viewport-Höhe und captured EXAKT die Hero-
 *             Bounding-Box)
 *   Retina:   deviceScaleFactor 3 (Source z.B. 1440×2700)
 *   URL:      /m/portfolio/{slug}.html?screenshot=1 (Sprint 121-Mode: hidet
 *             UI-Chrome wie kr-strip, nav, topbar, sticky-CTA)
 *
 *   Output:   src/images/{slug}-mockup.jpg @ JPEG-Quality 95
 *
 * Lauf:  node scripts/screenshot-mockups.mjs
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const OUT_DIR = join(SRC, 'images');

// Port-Konflikt-frei wählen — wenn dieser belegt ist, Server-Start failt.
let PORT = 8870;

// Format: page-slug, output-jpg
const PORTFOLIOS = [
    { page: 'immobilien-makler',          out: 'immobilien-stadtmakler-mockup.jpg' },
    { page: 'friseur-salon',              out: 'friseur-mueller-mockup.jpg' },
    { page: 'dachdecker-meisterbetrieb',  out: 'dachdecker-meister-mockup.jpg' },
    { page: 'praxis-weber',               out: 'praxis-weber-mockup.jpg' },
    { page: 'restaurant-template',        out: 'gastro-hirsch-mockup.jpg' },
    { page: 'meisterbetrieb-mueller',     out: 'handwerk-mueller-mockup.jpg' },
    { page: 'spedition-schwaben',         out: 'logistik-schwaben-mockup.jpg' },
    { page: 'coaching-lehmann',           out: 'coaching-lehmann-mockup.jpg' },
];

function startHttpServer() {
    return new Promise((resolveServer, rejectServer) => {
        const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
            cwd: SRC,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        // python3 -m http.server logs to stderr, ignore output but keep alive
        server.stderr.on('data', () => {});
        server.on('error', rejectServer);
        // Warten bis Port aktiv ist
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
    console.log('Sprint 126 — Playwright Element-Screenshot pro Portfolio');
    console.log(`  Server-Port: ${PORT}`);

    const server = await startHttpServer();
    process.on('exit', () => { try { server.kill(); } catch {} });
    process.on('SIGINT', () => { try { server.kill(); } catch {} process.exit(130); });

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 480, height: 720 },
        deviceScaleFactor: 3,
    });

    let count = 0;
    for (const { page: slug, out } of PORTFOLIOS) {
        const page = await ctx.newPage();
        const url = `http://localhost:${PORT}/m/portfolio/${slug}.html?screenshot=1`;
        const outPath = join(OUT_DIR, out);
        process.stdout.write(`  ${slug.padEnd(30)} → `);

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
            const hero = page.locator('section.hero').first();
            await hero.waitFor({ state: 'visible', timeout: 5000 });
            await hero.screenshot({ path: outPath, type: 'jpeg', quality: 95 });
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
    console.log(`  ✓ ${count}/${PORTFOLIOS.length} Portfolios captured`);
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
